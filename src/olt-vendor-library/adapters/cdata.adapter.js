import { BaseOltAdapter } from './base.adapter.js';
import { decryptSecret } from '../services/crypto.js';
import { executeOltCommands } from '../services/olt-transport.js';
import { parseHexStringSerial, parseSnmpInteger, snmpGet } from '../services/snmp.js';
import { HttpError } from '../utils/http-error.js';
import { cleanOfflineCause, normalizeCdataDownCause } from '../utils/offline-cause.js';

const OFFLINE_DETAIL_LIMIT = 50;
const CDATA_TR069_IP_INDEX = 1;
const CDATA_DEFAULT_TR069_PRIORITY = 0;
const CDATA_DEFAULT_TR069_INFORM_INTERVAL = 300;
const CDATA_SECRET_MASK = '********';

function replaceSecret(value, secret) {
  const input = String(value ?? '');
  const token = String(secret ?? '');
  return token ? input.split(token).join(CDATA_SECRET_MASK) : input;
}

export class CdataAdapter extends BaseOltAdapter {
  vendorPrefix() {
    return 'C-Data';
  }

  getVendorPriority() {
    return 2;
  }

  getCommandNotes() {
    return [
      'Prioritas implementasi vendor kedua.',
      'Plan mengikuti pola CLI GPON OLT C-Data generasi baru.',
      'Syntax final perlu validasi terhadap manual model FD1604S/FD1608S/FD1616S atau model produksi yang dipakai.',
    ];
  }

  normalizeSnValue(sn) {
    return String(sn || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  parseOntInfoTable(stdout) {
    const lines = String(stdout || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const items = [];
    for (const line of lines) {
      const match = line.match(
        /^(\d+)\/(\d+)\s+(\d+)\s+(\d+)\s+([A-Z0-9]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/i
      );
      if (!match) continue;
      items.push({
        chassis: Number(match[1]),
        slot: Number(match[2]),
        pon: Number(match[3]),
        onu_id: Number(match[4]),
        sn: match[5].toUpperCase(),
        vendor: match[5].slice(0, 4).toUpperCase(),
        model: 'C-Data Live',
        status: String(match[7] || '').toLowerCase() === 'online' ? 'online' : 'offline',
        control_flag: match[6],
        run_state: match[7],
        config_state: match[8],
        match_state: match[9],
        down_cause: match[10],
        description: match[11]?.trim() || '',
        rx_power: null,
        tx_power: null,
        distance: null,
      });
    }
    return items;
  }

  readDetailField(stdout, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(stdout || '').match(new RegExp(`^\\s*${escaped}\\s*:[ \\t]*([^\\r\\n]*)`, 'im'));
    return match?.[1]?.trim() || null;
  }

  parseOntInfoDetail(stdout) {
    const text = String(stdout || '');
    const snValue = this.readDetailField(text, 'SN');
    if (!snValue) return null;

    const fsValue = this.readDetailField(text, 'F/S');
    const [chassis, slot] = String(fsValue || '')
      .split('/')
      .map((value) => Number(value));
    const port = Number(this.readDetailField(text, 'Port'));
    const onuId = Number(this.readDetailField(text, 'ONT-ID'));
    const lineProfileId = this.readDetailField(text, 'Line profile ID');
    const lineProfileName = this.readDetailField(text, 'Line profile name');
    const serviceProfileId = this.readDetailField(text, 'Srv profile ID');
    const serviceProfileName = this.readDetailField(text, 'Srv profile name');
    const manageVlan = this.readDetailField(text, 'ONT manage VLAN');
    const deviceModel =
      this.readDetailField(text, 'Equip ID') ||
      this.readDetailField(text, 'Equip-ID') ||
      this.readDetailField(text, 'Equipment Id') ||
      this.readDetailField(text, 'ONT equipment ID') ||
      this.readDetailField(text, 'ONT Equipment ID') ||
      this.readDetailField(text, 'ONT equipment id') ||
      this.readDetailField(text, 'ONT equipment-id') ||
      this.readDetailField(text, 'ONT Equipment-ID') ||
      this.readDetailField(text, 'ONT Equip ID') ||
      this.readDetailField(text, 'ONT Equip-ID') ||
      this.readDetailField(text, 'Equipment ID') ||
      this.readDetailField(text, 'Equipment-ID') ||
      this.readDetailField(text, 'ONU model') ||
      this.readDetailField(text, 'ONT model') ||
      this.readDetailField(text, 'Product class') ||
      this.readDetailField(text, 'ProductClass') ||
      this.readDetailField(text, 'Type');

    return {
      chassis: Number.isFinite(chassis) ? chassis : null,
      slot: Number.isFinite(slot) ? slot : null,
      pon: Number.isFinite(port) ? port : null,
      onu_id: Number.isFinite(onuId) ? onuId : null,
      sn: snValue.split(/\s+/)[0].toUpperCase(),
      vendor: snValue.slice(0, 4).toUpperCase(),
      model: deviceModel || 'C-Data Live',
      equipment_id: deviceModel || null,
      status: String(this.readDetailField(text, 'Run state') || '').toLowerCase() === 'online' ? 'online' : 'offline',
      control_flag: this.readDetailField(text, 'Control flag'),
      run_state: this.readDetailField(text, 'Run state'),
      config_state: this.readDetailField(text, 'Config state'),
      match_state: this.readDetailField(text, 'Match state'),
      dba_type: this.readDetailField(text, 'DBA type'),
      distance: this.readDetailField(text, 'Distance(m)') ? `${this.readDetailField(text, 'Distance(m)')} m` : null,
      validity_mode: this.readDetailField(text, 'Validity mode'),
      authentic_mode: this.readDetailField(text, 'Authentic mode'),
      description: this.readDetailField(text, 'Description') || '',
      down_cause: cleanOfflineCause(this.readDetailField(text, 'Last down cause')),
      last_up_time: this.readDetailField(text, 'Last up time'),
      last_down_time: this.readDetailField(text, 'Last down time'),
      last_dying_gasp: this.readDetailField(text, 'Last dying-gasp'),
      online_time: this.readDetailField(text, 'Online  time') || this.readDetailField(text, 'Online time'),
      alarm_profile_id: this.readDetailField(text, 'Alarm profile ID'),
      wan_profile_id: this.readDetailField(text, 'Wan profile ID'),
      line_profile: [lineProfileId, lineProfileName].filter(Boolean).join(' / ') || null,
      service_profile: [serviceProfileId, serviceProfileName].filter(Boolean).join(' / ') || null,
      manage_vlan: manageVlan && manageVlan !== '-' ? manageVlan : null,
      rx_power: null,
      tx_power: null,
    };
  }

  parseOntVersionDetail(stdout) {
    const text = String(stdout || '');
    const equipmentId =
      this.readDetailField(text, 'Equipment-ID') ||
      this.readDetailField(text, 'Equipment ID') ||
      this.readDetailField(text, 'Equip ID');
    if (!equipmentId) return null;

    const sn = this.readDetailField(text, 'SN');
    const fsValue = this.readDetailField(text, 'Frame/Slot');
    const [chassis, slot] = String(fsValue || '')
      .split('/')
      .map((value) => Number(value));
    const pon = Number(this.readDetailField(text, 'Port'));
    const onuId = Number(this.readDetailField(text, 'ONT-ID'));

    return {
      chassis: Number.isFinite(chassis) ? chassis : null,
      slot: Number.isFinite(slot) ? slot : null,
      pon: Number.isFinite(pon) ? pon : null,
      onu_id: Number.isFinite(onuId) ? onuId : null,
      sn: sn ? sn.split(/\s+/)[0].toUpperCase() : null,
      model: equipmentId,
      equipment_id: equipmentId,
      ont_version: this.readDetailField(text, 'ONT Version') || null,
      product_id: this.readDetailField(text, 'Product-ID') || null,
      software_version: this.readDetailField(text, 'Main Software Version') || null,
    };
  }

  parseOntVersionTable(stdout) {
    const items = [];
    for (const rawLine of String(stdout || '').split('\n')) {
      const line = rawLine.trim();
      const tokens = line.split(/\s+/);
      if (tokens.length < 7) continue;
      if (!/^\d+\/\d+$/.test(tokens[0]) || !/^\d+$/.test(tokens[1]) || !/^\d+$/.test(tokens[2])) continue;
      const [chassis, slot] = tokens[0].split('/').map((value) => Number(value));
      const pon = Number(tokens[1]);
      const onuId = Number(tokens[2]);
      const sn = tokens[3]?.toUpperCase();
      const equipmentId = tokens[tokens.length - 1];
      const softwareVendor = tokens[tokens.length - 2] || '';
      const vendorMatch = softwareVendor.match(/([A-Z]{4})$/i);
      const softwareVersion = vendorMatch ? softwareVendor.slice(0, -vendorMatch[1].length) : softwareVendor;

      if (!sn || !equipmentId || /^-+$/.test(equipmentId)) continue;

      items.push({
        chassis: Number.isFinite(chassis) ? chassis : null,
        slot: Number.isFinite(slot) ? slot : null,
        pon: Number.isFinite(pon) ? pon : null,
        onu_id: Number.isFinite(onuId) ? onuId : null,
        sn,
        vendor: vendorMatch?.[1]?.toUpperCase() || sn.slice(0, 4).toUpperCase(),
        model: equipmentId,
        equipment_id: equipmentId,
        ont_version: tokens[4] || null,
        software_version: softwareVersion || null,
      });
    }
    return items;
  }

  mergeOntVersionInfo(items = [], versionItems = []) {
    if (!versionItems.length) return items.map((item) => ({ ...item }));
    const bySn = new Map(versionItems.map((item) => [this.normalizeSnValue(item.sn), item]));

    return items.map((item) => {
      const version = bySn.get(this.normalizeSnValue(item.sn));
      if (!version) return { ...item };
      return {
        ...item,
        model: version.equipment_id || version.model || item.model,
        equipment_id: version.equipment_id || version.model || null,
        ont_version: version.ont_version || item.ont_version || null,
        software_version: version.software_version || item.software_version || null,
        product_id: version.product_id || item.product_id || null,
      };
    });
  }

  mergeRunInfo(items = [], runInfoOnus = []) {
    if (!runInfoOnus.length) return items.map((item) => ({ ...item }));
    const byKey = new Map(runInfoOnus.map((onu) => [this.getOntKey(onu), onu]));

    return items.map((item) => {
      const runInfo = byKey.get(this.getOntKey(item));
      if (!runInfo) return { ...item };
      return {
        ...item,
        status: runInfo.status || item.status,
        run_state: runInfo.run_state || item.run_state,
        last_down_time: runInfo.last_down_time || item.last_down_time || null,
        last_up_time: runInfo.last_up_time || item.last_up_time || null,
        online_time: runInfo.online_time || item.online_time || null,
      };
    });
  }

  parseOnlineDurationMs(value) {
    const text = String(value || '').trim();
    if (!text || text === '--') return null;

    const match = text.match(
      /^\s*(?:(\d+)\s*(?:days?|d))?\s*(?:(\d+)\s*h)?(?::?\s*(\d+)\s*m)?(?::?\s*(\d+)\s*s)?\s*$/i
    );
    if (!match) return null;

    const days = Number(match[1] || 0);
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    const seconds = Number(match[4] || 0);
    const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
    return Number.isFinite(totalSeconds) ? totalSeconds * 1000 : null;
  }

  estimateLastUpTime(onlineTime, referenceDate = new Date()) {
    const durationMs = this.parseOnlineDurationMs(onlineTime);
    const referenceMs = new Date(referenceDate).getTime();
    if (!Number.isFinite(durationMs) || !Number.isFinite(referenceMs)) return null;
    return new Date(referenceMs - durationMs).toISOString();
  }

  parseStatusCountOfflineOnus(stdout) {
    const lines = String(stdout || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const items = [];

    for (const line of lines) {
      const match = line.match(/^(\d+)\/(\d+)\s+(\d+)\s+(\d+)\s+([A-Z0-9]+)\s+(\d+)\s+(.+)$/i);
      if (!match) continue;
      items.push({
        sn: match[5].toUpperCase(),
        vendor: match[5].slice(0, 4).toUpperCase(),
        slot: Number(match[2]),
        pon: Number(match[3]),
        onu_id: Number(match[4]),
        status: 'offline',
        offline_times: Number(match[6]),
        down_cause: cleanOfflineCause(match[7]),
      });
    }

    return items;
  }

  parseOntRunInfoTable(stdout, referenceDate = new Date()) {
    const items = [];
    for (const rawLine of String(stdout || '').split('\n')) {
      const line = rawLine.trim();
      const match = line.match(
        /^(\d+)\/(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+((?:\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})|--)\s+(\S.*)$/i
      );
      if (!match) continue;

      const status = String(match[5] || '').toLowerCase() === 'online' ? 'online' : 'offline';
      const onlineTime = match[7] === '--' ? null : match[7].trim();
      items.push({
        chassis: Number(match[1]),
        slot: Number(match[2]),
        pon: Number(match[3]),
        onu_id: Number(match[4]),
        status,
        run_state: match[5],
        last_down_time: match[6] === '--' ? null : match[6],
        last_up_time: status === 'online' ? this.estimateLastUpTime(onlineTime, referenceDate) : null,
        online_time: onlineTime,
        source: 'run-info',
      });
    }
    return items;
  }

  getOntKey(onu) {
    return [onu?.slot, onu?.pon, onu?.onu_id].map((value) => String(value ?? '')).join(':');
  }

  mergeRunInfoOfflineOnus(offlineOnus = [], runInfoOnus = []) {
    if (!runInfoOnus.length) return offlineOnus;

    const offlineByKey = new Map(
      offlineOnus.map((onu) => [this.getOntKey(onu), onu])
    );

    return runInfoOnus
      .filter((onu) => onu.status === 'offline')
      .map((onu) => {
        const statusCountOnu = offlineByKey.get(this.getOntKey(onu));
        return {
          ...statusCountOnu,
          ...onu,
          sn: statusCountOnu?.sn || onu.sn || null,
          vendor: statusCountOnu?.vendor || onu.vendor || null,
          down_cause: cleanOfflineCause(statusCountOnu?.down_cause) || cleanOfflineCause(onu.down_cause) || 'offline',
          down_cause_label: this.normalizeDownCause(
            cleanOfflineCause(statusCountOnu?.down_cause) || cleanOfflineCause(onu.down_cause) || 'offline'
          ),
          last_down_time: onu.last_down_time || statusCountOnu?.last_down_time || null,
          source: 'run-info',
        };
      });
  }

  normalizeDownCause(value) {
    return normalizeCdataDownCause(value);
  }

  buildOfflineDetailCommand(onu) {
    if (onu?.slot != null && onu?.pon != null && onu?.onu_id != null) {
      return `show ont info 0/${Number(onu.slot)} ${Number(onu.pon)} ${Number(onu.onu_id)}`;
    }
    return `show ont info by-sn ${this.normalizeSnValue(onu?.sn)}`;
  }

  parseOfflineDetailOutputs(outputs = []) {
    const details = new Map();
    for (const output of outputs) {
      if (!/^show ont info\b/i.test(String(output.command || '').trim())) continue;
      const detail = this.parseOntInfoDetail(output.stdout);
      if (!detail?.sn) continue;
      details.set(this.normalizeSnValue(detail.sn), detail);
    }
    return details;
  }

  mergeOfflineDetailOutputs(offlineOnus = [], outputs = []) {
    const detailMap = this.parseOfflineDetailOutputs(outputs);
    return offlineOnus.map((onu) => {
      const detail = detailMap.get(this.normalizeSnValue(onu.sn));
      if (!detail) return onu;
      const downCause = cleanOfflineCause(detail.down_cause) || cleanOfflineCause(onu.down_cause) || 'offline';
      return {
        ...onu,
        last_down_time: detail.last_down_time || onu.last_down_time || null,
        last_up_time: detail.last_up_time || onu.last_up_time || null,
        last_dying_gasp: detail.last_dying_gasp || onu.last_dying_gasp || null,
        down_cause: downCause,
        down_cause_label: this.normalizeDownCause(downCause),
      };
    });
  }

  parseTemperatureOutput(stdout) {
    const sensors = [];
    for (const line of String(stdout || '').split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(-?\d+(?:\.\d+)?)\s*(?:°?\s*C)?\s*$/i);
      if (!match) continue;
      const valueC = Number(match[2]);
      if (!Number.isFinite(valueC) || valueC < -80 || valueC > 180) continue;
      sensors.push({
        index: match[1],
        name: `Slot ${match[1]}`,
        value_c: Math.round(valueC * 10) / 10,
        status: 'ok',
        source: 'cli-cdata',
      });
    }
    return sensors.sort((a, b) => b.value_c - a.value_c);
  }

  async getTemperature() {
    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['enable', 'show temperature'],
      allowWrite: false,
    });

    if (!execution.success) return null;

    const stdout =
      execution.outputs?.find((item) => item.command === 'show temperature')?.stdout || '';
    const sensors = this.parseTemperatureOutput(stdout);
    if (!sensors.length) return null;

    const hottest = sensors[0];
    return {
      status: 'ok',
      source: 'cli-cdata',
      value_c: hottest.value_c,
      label: hottest.name,
      sensors,
    };
  }

  async getRunInfoOnus() {
    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['enable', 'show ont run-info all'],
      allowWrite: false,
      timeoutMs: 30000,
    });

    if (!execution.success) return [];

    const stdout =
      execution.outputs?.find((item) => item.command === 'show ont run-info all')?.stdout || '';
    return this.parseOntRunInfoTable(stdout);
  }

  buildSnmpOnuIndex(onu) {
    const slot = Number(onu?.slot ?? 0);
    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(pon) || !Number.isInteger(onuId) || pon < 1 || onuId < 1) return null;

    // Confirmed on CDATA legacy: gpon 0/0/PON ONU-ID uses base 0x480000,
    // each PON increments by 0x1000, and ONU-ID is the low offset.
    return 0x480000 + slot * 0x10000 + (pon - 1) * 0x1000 + onuId;
  }

  buildSnmpOnuIndexCandidates(onu) {
    const slot = Number(onu?.slot ?? 0);
    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(pon) || !Number.isInteger(onuId) || pon < 1 || onuId < 1) return [];

    const candidates = [this.buildSnmpOnuIndex(onu)];
    if (Number.isInteger(slot) && slot >= 1) {
      // CDATA modern / FD1604E-C1 reports GPON 0/1/x under 0x148xxxx indexes.
      candidates.push(0x1480000 + (slot - 1) * 0x10000 + (pon - 1) * 0x1000 + onuId);
    }
    return Array.from(new Set(candidates.filter(Boolean)));
  }

  buildSnmpPonIfIndex(onu) {
    const slot = Number(onu?.slot ?? 0);
    const pon = Number(onu?.pon);
    if (!Number.isInteger(pon) || pon < 1) return null;

    // Some C-Data firmware stores optical rows under the GPON port ifIndex
    // instead of the legacy trailing .0.0 suffix.
    return 0x140000 + slot * 0x10000 + pon;
  }

  buildSnmpPonIfIndexCandidates(onu) {
    const slot = Number(onu?.slot ?? 0);
    const pon = Number(onu?.pon);
    if (!Number.isInteger(pon) || pon < 1) return [];

    const candidates = [this.buildSnmpPonIfIndex(onu)];
    if (Number.isInteger(slot) && slot >= 1) {
      candidates.push(0x1140000 + (slot - 1) * 0x10000 + pon);
    }
    return Array.from(new Set(candidates.filter(Boolean)));
  }

  formatCentiDbm(value) {
    if (!Number.isFinite(value) || value === -1) return null;
    return `${(value / 100).toFixed(2)} dBm`;
  }

  async getSnmpOpticalInfo(onu) {
    const indexes = this.buildSnmpOnuIndexCandidates(onu);
    if (!indexes.length) return null;

    const suffixes = ['0.0', ...this.buildSnmpPonIfIndexCandidates(onu).map((index) => `0.${index}`)];

    for (const index of indexes) {
      const serialOid = `.1.3.6.1.4.1.17409.2.8.4.1.1.3.${index}`;
      for (const suffix of suffixes) {
        const rxOid = `.1.3.6.1.4.1.17409.2.8.4.4.1.4.${index}.${suffix}`;
        const txOid = `.1.3.6.1.4.1.17409.2.8.4.4.1.5.${index}.${suffix}`;
        const values = await snmpGet({
          olt: this.olt,
          oids: [serialOid, rxOid, txOid],
          timeoutMs: 2500,
        });

        if (!values) continue;

        const sn = parseHexStringSerial(values.get(serialOid));
        if (sn && this.normalizeSnValue(sn) !== this.normalizeSnValue(onu?.sn)) continue;

        const rxPower = this.formatCentiDbm(parseSnmpInteger(values.get(rxOid)));
        const txPower = this.formatCentiDbm(parseSnmpInteger(values.get(txOid)));
        if (!rxPower && !txPower) continue;

        return {
          rx_power: rxPower,
          tx_power: txPower,
          optical_source: suffix === '0.0' ? 'snmp' : 'snmp-pon-ifindex',
          snmp_onu_index: index,
        };
      }
    }

    return null;
  }

  async testConnection() {
    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['enable', 'show ont status-count'],
      allowWrite: false,
    });

    if (!execution.success) {
      return {
        success: false,
        message: execution.error || execution.message || 'Live connection to C-Data OLT failed',
        transport: execution.transport || this.olt.protocol,
        outputs: execution.outputs || [],
      };
    }

    const summary =
      execution.outputs?.find((item) => item.command === 'show ont status-count')?.stdout || '';

    return {
      success: true,
      message: `Live connection to C-Data OLT ${this.olt.name} succeeded`,
      transport: execution.transport || this.olt.protocol,
      summary,
      outputs: execution.outputs || [],
    };
  }

  async getDashboardStats() {
    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['enable', 'show ont status-count'],
      allowWrite: false,
    });

    if (!execution.success) {
      return null;
    }

    const stdout =
      execution.outputs?.find((item) => item.command === 'show ont status-count')?.stdout || '';

    const readCounter = (label) => {
      const match = stdout.match(new RegExp(`^\\s*${label}\\s+:\\s+(\\d+)\\s*$`, 'im'));
      return Number(match?.[1] || 0);
    };

    const online = readCounter('Active');
    const offline = readCounter('Offline');
    const deactive = readCounter('Deactive');
    const offlineOnus = this.parseStatusCountOfflineOnus(stdout).map((item) => ({
      ...item,
      down_cause_label: this.normalizeDownCause(item.down_cause),
    }));
    let enrichedOfflineOnus = offlineOnus;
    const runInfoOnus = await this.getRunInfoOnus();

    if (runInfoOnus.length) {
      enrichedOfflineOnus = this.mergeRunInfoOfflineOnus(enrichedOfflineOnus, runInfoOnus);
    }

    if (enrichedOfflineOnus.length) {
      const detailCommands = enrichedOfflineOnus
        .filter((item) => item.sn)
        .slice(0, OFFLINE_DETAIL_LIMIT)
        .map((item) => this.buildOfflineDetailCommand(item));
      if (detailCommands.length) {
        const detailExecution = await executeOltCommands({
          olt: this.olt,
          password,
          commands: ['enable', ...detailCommands],
          allowWrite: false,
        });
        if (detailExecution.success) {
          enrichedOfflineOnus = this.mergeOfflineDetailOutputs(
            enrichedOfflineOnus,
            detailExecution.outputs || []
          );
        }
      }
    }

    return {
      source: 'live-olt',
      total_onu: online + offline + deactive,
      online,
      offline,
      unregistered: 0,
      offline_onus: enrichedOfflineOnus,
      registered_onus: runInfoOnus,
    };
  }

  async getRegisteredOnus() {
    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['enable', 'show ont info all'],
      allowWrite: false,
    });

    if (!execution.success) {
      throw new HttpError(
        502,
        execution.error || execution.message || 'Baca ONU registered live ke C-Data OLT gagal'
      );
    }

    const infoOutput =
      execution.outputs?.find((item) => item.command === 'show ont info all')?.stdout || '';
    const items = this.parseOntInfoTable(infoOutput).filter(
      (item) => !/^unregistered$/i.test(String(item.status || ''))
    );
    return this.getBulkOnuDetails(items);
  }

  async getUnregisteredOnu({ includeRegistered = false } = {}) {
    const password = decryptSecret(this.olt.password_encrypted);
    const commands = ['enable', 'show ont autofind all'];
    if (includeRegistered) {
      commands.push('show ont info all');
    }
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands,
      allowWrite: false,
    });

    if (!execution.success) {
      throw new HttpError(
        502,
        execution.error || execution.message || 'Scan ONU live ke C-Data OLT gagal'
      );
    }

    const autofindOutput =
      execution.outputs?.find((item) => item.command === 'show ont autofind all')?.stdout || '';
    const discovered = [];
    if (!/There is no ONT available\./i.test(autofindOutput)) {
      const lines = autofindOutput.split('\n').map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^(\d+)\/(\d+)\s+(\d+)\s+([A-Z0-9]+)\s+/i);
        if (!match) continue;
        discovered.push({
          chassis: Number(match[1]),
          slot: Number(match[2]),
          pon: Number(match[3]),
          onu_id: null,
          sn: match[4].toUpperCase(),
          vendor: match[4].slice(0, 4).toUpperCase(),
          model: 'C-Data Live',
          status: 'unregistered',
          rx_power: null,
          tx_power: null,
          distance: null,
        });
      }
      if (discovered.length && !includeRegistered) {
        return discovered;
      }
    }

    if (!includeRegistered) {
      return [];
    }

    const infoOutput =
      execution.outputs?.find((item) => item.command === 'show ont info all')?.stdout || '';
    const registered = this.parseOntInfoTable(infoOutput);
    if (!discovered.length) return registered;

    const seenSn = new Set(discovered.map((item) => this.normalizeSnValue(item.sn)).filter(Boolean));
    return [
      ...discovered,
      ...registered.filter((item) => !seenSn.has(this.normalizeSnValue(item.sn))),
    ];
  }

  buildLiveSnSearchCommands(sn) {
    return ['enable', `show ont info by-sn ${this.normalizeSnValue(sn)}`];
  }

  buildLiveDetailCommands(onu) {
    if (onu?.slot != null && onu?.pon != null && onu?.onu_id != null) {
      return [
        'enable',
        `show ont info 0/${Number(onu.slot)} ${Number(onu.pon)} ${Number(onu.onu_id)}`,
        `show ont version 0/${Number(onu.slot)} ${Number(onu.pon)} ${Number(onu.onu_id)}`,
      ];
    }
    return this.buildLiveSnSearchCommands(onu?.sn);
  }

  parseLiveSnSearchResult(criteria, outputs) {
    const stdout = outputs?.map((item) => item.stdout || '').join('\n') || '';
    const tableItems = this.parseOntInfoTable(stdout).filter((item) =>
      this.normalizeSnValue(item.sn).includes(this.normalizeSnValue(criteria.sn))
    );
    const detailItem = this.parseOntInfoDetail(stdout);
    const versionDetail = this.parseOntVersionDetail(stdout);
    if (versionDetail && !versionDetail.sn) {
      versionDetail.sn = criteria.sn;
    }
    const versionItems = [...this.parseOntVersionTable(stdout), versionDetail].filter(Boolean);
    const items = this.mergeOntVersionInfo(detailItem ? [detailItem, ...tableItems] : tableItems, versionItems);
    return Array.from(new Map(items.map((item) => [this.normalizeSnValue(item.sn), item])).values());
  }

  async getBulkOnuDetails(items = []) {
    const groups = new Map();
    for (const item of items) {
      const isUnregistered = /^unregistered$/i.test(String(item?.status || ''));
      if (isUnregistered || item?.slot == null || item?.pon == null || item?.onu_id == null) continue;
      const key = `${Number(item.slot)}:${Number(item.pon)}`;
      if (!groups.has(key)) groups.set(key, { slot: Number(item.slot), pon: Number(item.pon) });
    }
    if (!groups.size) return items.map((item) => ({ ...item }));

    const versionCommands = Array.from(groups.values()).map(
      ({ slot, pon }) => `show ont version 0/${slot} ${pon} all`
    );
    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands: ['enable', 'show ont run-info all', ...versionCommands],
      allowWrite: false,
      timeoutMs: 30000,
    });

    if (!execution.success) return items.map((item) => ({ ...item }));

    const versionItems = (execution.outputs || [])
      .filter((output) => /^show ont version\b/i.test(String(output.command || '')))
      .flatMap((output) => this.parseOntVersionTable(output.stdout));
    const runInfoOutput =
      execution.outputs?.find((item) => item.command === 'show ont run-info all')?.stdout || '';
    const runInfoOnus = this.parseOntRunInfoTable(runInfoOutput);

    return this.mergeRunInfo(this.mergeOntVersionInfo(items, versionItems), runInfoOnus);
  }

  async getOnuDetail(onu) {
    const detail = await super.getOnuDetail(onu);
    const optical = await this.getSnmpOpticalInfo(detail);
    if (!optical) return detail;

    return {
      ...detail,
      rx_power: optical.rx_power ?? detail.rx_power,
      tx_power: optical.tx_power ?? detail.tx_power,
      optical_source: optical.optical_source,
      snmp_onu_index: optical.snmp_onu_index,
    };
  }

  getOntAddress(onu) {
    const slot = Number(onu?.slot);
    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(slot) || !Number.isInteger(pon) || !Number.isInteger(onuId)) {
      throw new HttpError(422, 'Slot, PON, dan ONU ID wajib terisi untuk action live C-Data');
    }
    return `0/${slot} ${pon} ${onuId}`;
  }

  getGponContext(onu) {
    const slot = Number(onu?.slot);
    if (!Number.isInteger(slot)) {
      throw new HttpError(422, 'Slot wajib terisi untuk action live C-Data');
    }
    return `interface gpon 0/${slot}`;
  }

  getOntPortAddress(onu) {
    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(pon) || !Number.isInteger(onuId)) {
      throw new HttpError(422, 'PON dan ONU ID wajib terisi untuk action live C-Data');
    }
    return `${pon} ${onuId}`;
  }

  async executeOntAction({ onu, action, command, successMessage }) {
    const password = decryptSecret(this.olt.password_encrypted);
    const commands = ['enable', 'config', this.getGponContext(onu), `${command} ${this.getOntPortAddress(onu)}`];
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands,
      allowWrite: true,
    });
    const failedOutput = this.detectCommandFailure(execution.outputs || []);
    const success = Boolean(execution.success && !failedOutput);
    return {
      success,
      message:
        execution.error ||
        execution.message ||
        (failedOutput
          ? `${action} selesai dengan indikasi error pada command: ${failedOutput.command}`
          : successMessage),
      live_mode: Boolean(execution.live_mode),
      transport: execution.transport || this.olt.protocol,
      commands,
      outputs: execution.outputs || [],
      error: execution.error || execution.message || (failedOutput ? failedOutput.stdout || failedOutput.stderr : null),
    };
  }

  async rebootOnu({ onu }) {
    return this.executeOntAction({
      onu,
      action: 'Reboot ONU C-Data',
      command: 'ont reboot',
      successMessage: `Reboot ONU live dikirim untuk ${onu.sn}`,
    });
  }

  supportsOnuReboot() {
    return true;
  }

  async deleteOnuFromOlt({ onu }) {
    return this.executeOntAction({
      onu,
      action: 'Delete ONU C-Data',
      command: 'ont delete',
      successMessage: `Delete ONU live dikirim ke OLT untuk ${onu.sn}`,
    });
  }

  supportsOnuDelete() {
    return true;
  }

  supportsOnuDescriptionUpdate() {
    return true;
  }

  buildOnuDescriptionCommands({ onu, description }) {
    return [
      'enable',
      'config',
      this.getGponContext(onu),
      `ont description ${this.getOntPortAddress(onu)} ${description}`,
      'exit',
      'save',
    ];
  }

  async saveConfig() {
    return this.executeSaveConfigCommands({
      commands: ['enable', 'config', 'save'],
      successMessage: `Save config C-Data OLT ${this.olt.name} selesai`,
    });
  }

  getTr069OntAddress(onu) {
    const slot = Number(onu?.slot);
    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(slot) || slot < 0) {
      throw new HttpError(422, 'Slot wajib terisi untuk push IP Host C-Data');
    }
    if (!Number.isInteger(pon) || pon < 1 || !Number.isInteger(onuId) || onuId < 1) {
      throw new HttpError(422, 'PON dan ONU ID wajib terisi untuk push IP Host C-Data');
    }
    return { slot, pon, onuId };
  }

  normalizeCdataCliToken(value, label, maxLength) {
    const input = String(value ?? '').trim();
    if (!input) return '';
    if (input.length > maxLength || /[\s\r\n]/.test(input)) {
      throw new HttpError(422, `${label} C-Data tidak valid`);
    }
    return input;
  }

  buildCdataAcsUrlCommand({ pon, onuId, acsUrl, acsUsername, acsPassword }) {
    if (!acsUrl) return null;
    const username = this.normalizeCdataCliToken(acsUsername, 'ACS username', 50);
    const password = this.normalizeCdataCliToken(acsPassword, 'ACS password', 25);
    if (!username || !password) return null;
    return `ont tr069 ${pon} ${onuId} acs-url ${acsUrl} acs-username ${username} acs-password ${password}`;
  }

  normalizeCdataIpHostMode(mode) {
    const normalized = String(mode || 'dhcp').trim().toLowerCase();
    if (!['dhcp', 'static', 'pppoe'].includes(normalized)) {
      throw new HttpError(422, 'Mode IP Host C-Data harus dhcp, static, atau pppoe');
    }
    return normalized;
  }

  normalizeCdataConnectionType(connectionType) {
    const normalized = String(connectionType || 'route').trim().toLowerCase();
    if (!['route', 'bridge'].includes(normalized)) {
      throw new HttpError(422, 'Connection type IP Host C-Data harus route atau bridge');
    }
    return normalized;
  }

  formatCdataPortRange(ports = []) {
    const values = [...new Set((Array.isArray(ports) ? ports : []).map((port) => Number(port)))]
      .filter((port) => Number.isInteger(port) && port > 0)
      .sort((a, b) => a - b);
    const ranges = [];
    let start = null;
    let previous = null;
    for (const value of values) {
      if (start === null) {
        start = value;
        previous = value;
        continue;
      }
      if (value === previous + 1) {
        previous = value;
        continue;
      }
      ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
      start = value;
      previous = value;
    }
    if (start !== null) {
      ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    }
    return ranges.join(',');
  }

  buildCdataIpHostBindingCommand({ pon, onuId, ipIndex, lanBindings = [], ssidBindings = [] }) {
    const ethList = this.formatCdataPortRange(lanBindings);
    const wlanList = this.formatCdataPortRange(ssidBindings);
    const bindingParts = [
      ...(ethList ? [`eth ${ethList}`] : []),
      ...(wlanList ? [`wlan ${wlanList}`] : []),
    ];
    if (!bindingParts.length) {
      return null;
    }
    return `ont ipconfig ${pon} ${onuId} ip-index ${Number(ipIndex)} binding ${bindingParts.join(' ')}`;
  }

  buildCdataIpHostCommand({
    pon,
    onuId,
    ipIndex = CDATA_TR069_IP_INDEX,
    mode = 'dhcp',
    vlan,
    priority = CDATA_DEFAULT_TR069_PRIORITY,
    ipAddress,
    ipMask,
    ipGateway,
    primaryDns,
    secondaryDns,
    pppUsername,
    pppPassword,
    pppServiceName,
    maskSecrets = true,
  }) {
    const normalizedMode = this.normalizeCdataIpHostMode(mode);
    const base = `ont ipconfig ${pon} ${onuId} ip-index ${Number(ipIndex)}`;
    if (normalizedMode === 'dhcp') {
      return `${base} dhcp vlan ${Number(vlan)} priority ${Number(priority)}`;
    }

    if (normalizedMode === 'static') {
      const secondaryDnsPart = secondaryDns ? ` slave-dns ${secondaryDns}` : '';
      return `${base} static ip-address ${ipAddress} mask ${ipMask} gateway ${ipGateway} pri-dns ${primaryDns}${secondaryDnsPart} vlan ${Number(vlan)} priority ${Number(priority)}`;
    }

    const username = this.normalizeCdataCliToken(pppUsername, 'PPPoE username', 63);
    const password = this.normalizeCdataCliToken(pppPassword, 'PPPoE password', 25);
    const serviceName = this.normalizeCdataCliToken(pppServiceName, 'PPPoE service-name', 63);
    const passwordArg = maskSecrets ? CDATA_SECRET_MASK : password;
    const serviceNamePart = serviceName ? ` service-name ${serviceName}` : '';
    return `${base} pppoe${serviceNamePart} username ${username} password ${passwordArg} vlan ${Number(vlan)} priority ${Number(priority)}`;
  }

  buildCdataIpHostWanPlan({
    onu,
    ipIndex = CDATA_TR069_IP_INDEX,
    mode = 'dhcp',
    vlan,
    priority = CDATA_DEFAULT_TR069_PRIORITY,
    connectionType = 'route',
    natEnabled = false,
    bindInternet = true,
    bindTr069 = true,
    tr069Management = true,
    syncPortBinding = false,
    lanBindings = [],
    ssidBindings = [],
    setAcs = false,
    acsUrl,
    acsUsername,
    acsPassword,
    informInterval = CDATA_DEFAULT_TR069_INFORM_INTERVAL,
    saveConfig = false,
    maskSecrets = true,
    ipAddress,
    ipMask,
    ipGateway,
    primaryDns,
    secondaryDns,
    pppUsername,
    pppPassword,
    pppServiceName,
  }) {
    const { slot, pon, onuId } = this.getTr069OntAddress(onu);
    const normalizedConnectionType = this.normalizeCdataConnectionType(connectionType);
    const natState = natEnabled ? 'enable' : 'disable';
    const bindingCommand = this.buildCdataIpHostBindingCommand({
      pon,
      onuId,
      ipIndex,
      lanBindings,
      ssidBindings,
    });
    const acsCommand = setAcs
      ? this.buildCdataAcsUrlCommand({ pon, onuId, acsUrl, acsUsername, acsPassword })
      : null;
    const commands = [
      'enable',
      'config',
      `interface gpon 0/${slot}`,
      this.buildCdataIpHostCommand({
        pon,
        onuId,
        ipIndex,
        mode,
        vlan,
        priority,
        ipAddress,
        ipMask,
        ipGateway,
        primaryDns,
        secondaryDns,
        pppUsername,
        pppPassword,
        pppServiceName,
        maskSecrets,
      }),
      `ont ipconfig ${pon} ${onuId} ip-index ${Number(ipIndex)} connection-type ${normalizedConnectionType}`,
      `ont ipconfig ${pon} ${onuId} ip-index ${Number(ipIndex)} nat ${natState}`,
      ...(bindInternet ? [`ont internet-config ${pon} ${onuId} ip-index ${Number(ipIndex)}`] : []),
      ...(syncPortBinding
        ? [bindingCommand || `no ont ipconfig ${pon} ${onuId} ip-index ${Number(ipIndex)} binding`]
        : []),
      ...(bindTr069
        ? [
            ...(tr069Management ? [`ont tr069 ${pon} ${onuId} tr069-management enable`] : []),
            `ont tr069 ${pon} ${onuId} inform enable interval ${Number(informInterval)}`,
            `ont tr069 ${pon} ${onuId} ip-index ${Number(ipIndex)}`,
            ...(acsCommand ? [maskSecrets ? replaceSecret(acsCommand, acsPassword) : acsCommand] : []),
          ]
        : []),
      `show ont ipconfig ${pon} ${onuId}`,
      ...(bindTr069 ? [`show ont tr069 ${pon} ${onuId}`] : []),
      'exit',
      ...(saveConfig ? ['save'] : []),
      `show current-config include ${pon} ${onuId}`,
    ];
    return commands;
  }

  parseCdataIpHostStatus(stdout = '') {
    const read = (label) => this.readDetailField(stdout, label);
    return {
      ip_index: Number(read('ONT IP host index')),
      config_type: read('ONT config type'),
      ip_address: read('ONT IP'),
      ip_mask: read('ONT subnet mask'),
      gateway: read('ONT gateway'),
      primary_dns: read('ONT primary DNS'),
      secondary_dns: read('ONT slave DNS'),
      mac: read('ONT MAC'),
      vlan: Number(read('ONT manage VLAN')),
      priority: Number(read('ONT manage priority')),
      connection_type: read('ONT connect type'),
      nat_switch: read('ONT nat switch'),
      internet_ip_index: Number(read('Internet IP index')),
    };
  }

  buildCdataIpHostWanResult({
    onu,
    ipIndex = CDATA_TR069_IP_INDEX,
    mode = 'dhcp',
    vlan,
    priority = CDATA_DEFAULT_TR069_PRIORITY,
    connectionType = 'route',
    natEnabled = false,
    bindInternet = true,
    bindTr069 = true,
    tr069Management = true,
    syncPortBinding = false,
    lanBindings = [],
    ssidBindings = [],
    setAcs = false,
    acsUrl,
    acsUsername,
    acsPassword,
    informInterval = CDATA_DEFAULT_TR069_INFORM_INTERVAL,
    saveConfig = false,
    ipAddress,
    ipMask,
    ipGateway,
    primaryDns,
    secondaryDns,
    pppUsername,
    pppServiceName,
  }) {
    const { slot, pon, onuId } = this.getTr069OntAddress(onu);
    const acsCommand = setAcs
      ? this.buildCdataAcsUrlCommand({ pon, onuId, acsUrl, acsUsername, acsPassword })
      : null;
    return {
      slot,
      pon,
      onu_id: onuId,
      ip_index: Number(ipIndex),
      mode: this.normalizeCdataIpHostMode(mode),
      vlan: Number(vlan),
      priority: Number(priority),
      connection_type: this.normalizeCdataConnectionType(connectionType),
      nat_enabled: Boolean(natEnabled),
      nat_policy: natEnabled ? 'enable' : 'disable',
      bind_internet: Boolean(bindInternet),
      bind_tr069: Boolean(bindTr069),
      tr069_management: Boolean(bindTr069 && tr069Management),
      sync_port_binding: Boolean(syncPortBinding),
      lan_bindings: Array.isArray(lanBindings) ? [...lanBindings] : [],
      ssid_bindings: Array.isArray(ssidBindings) ? [...ssidBindings] : [],
      inform_interval: Number(informInterval),
      save_config: Boolean(saveConfig),
      static_ip: ipAddress || null,
      static_mask: ipMask || null,
      static_gateway: ipGateway || null,
      primary_dns: primaryDns || null,
      secondary_dns: secondaryDns || null,
      ppp_username: pppUsername || null,
      ppp_service_name: pppServiceName || null,
      acs_url: acsCommand ? acsUrl : null,
      set_acs: Boolean(acsCommand),
      acs_action: setAcs
        ? acsCommand
          ? 'set per-ONT ACS URL with supplied C-Data ACS credentials'
          : 'not changed; C-Data ACS username/password tidak tersedia di request'
        : 'not requested',
      fallback_transport: 'cli-cdata-gpon',
      scope: 'cdata-iphost-omci-wan',
    };
  }

  ensureCdataIpHostWan(options) {
    const plan = this.buildCdataIpHostWanPlan({
      ...options,
      maskSecrets: true,
    });
    const result = this.buildCdataIpHostWanResult(options);
    return {
      success: true,
      message: `C-Data IP Host ${String(result.mode).toUpperCase()} VLAN ${result.vlan} plan ready untuk ONU ${result.pon}/${result.onu_id}`,
      plan,
      result,
    };
  }

  sanitizeCdataIpHostWanOutputs(outputs = [], { pppPassword, acsPassword } = {}) {
    return outputs.map((entry) => ({
      ...entry,
      command: replaceSecret(replaceSecret(entry.command, pppPassword), acsPassword),
      stdout: replaceSecret(replaceSecret(entry.stdout, pppPassword), acsPassword),
      stderr: replaceSecret(replaceSecret(entry.stderr, pppPassword), acsPassword),
    }));
  }

  async applyCdataIpHostWan(options) {
    const commands = this.buildCdataIpHostWanPlan({
      ...options,
      maskSecrets: false,
    });
    const result = this.buildCdataIpHostWanResult(options);
    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite: true,
      timeoutMs: 80000,
    });
    const rawFailedOutput = this.detectCommandFailure(execution.outputs || []);
    const repeatedIpConfig =
      rawFailedOutput &&
      /^ont\s+ipconfig\b/i.test(rawFailedOutput.command || '') &&
      /ONU IP config repeated or deleted/i.test(`${rawFailedOutput.stdout || ''}\n${rawFailedOutput.stderr || ''}`);
    const failedOutput = repeatedIpConfig ? null : rawFailedOutput;
    const ipconfigOutput =
      execution.outputs?.find((item) => item.command === `show ont ipconfig ${result.pon} ${result.onu_id}`)?.stdout || '';
    const ipHostStatus = this.parseCdataIpHostStatus(ipconfigOutput);
    const expectedType = {
      dhcp: 'dhcp',
      static: 'static',
      pppoe: 'pppoe',
    }[result.mode];
    const modeMatches = String(ipHostStatus.config_type || '').toLowerCase() === expectedType;
    const vlanMatches = Number(ipHostStatus.vlan) === Number(result.vlan);
    const priorityMatches = Number(ipHostStatus.priority) === Number(result.priority);
    const connectionMatches =
      String(ipHostStatus.connection_type || '').toLowerCase() === result.connection_type;
    const natMatches = String(ipHostStatus.nat_switch || '').toLowerCase() === result.nat_policy;
    const success = Boolean(
      execution.success &&
      !failedOutput &&
      modeMatches &&
      vlanMatches &&
      priorityMatches &&
      connectionMatches &&
      natMatches
    );
    const sanitizedOutputs = this.sanitizeCdataIpHostWanOutputs(execution.outputs || [], options);
    return {
      success,
      message: success
        ? `C-Data IP Host ${String(result.mode).toUpperCase()} VLAN ${result.vlan} berhasil dipush ke ONU ${result.pon}/${result.onu_id}`
        : failedOutput?.stdout ||
          failedOutput?.stderr ||
          execution.error ||
          `Push C-Data IP Host ${String(result.mode).toUpperCase()} VLAN ${result.vlan} belum terverifikasi`,
      transport: execution.transport || this.olt.protocol,
      plan: this.buildCdataIpHostWanPlan({
        ...options,
        maskSecrets: true,
      }),
      result: {
        ...result,
        iphost_status: ipHostStatus,
        verified_mode: modeMatches,
        verified_vlan: vlanMatches,
        verified_priority: priorityMatches,
        verified_connection_type: connectionMatches,
        verified_nat: natMatches,
      },
      outputs: sanitizedOutputs,
      error: success
        ? null
        : replaceSecret(
            replaceSecret(
              failedOutput?.stdout ||
                failedOutput?.stderr ||
                execution.error ||
                `Push C-Data IP Host ${String(result.mode).toUpperCase()} VLAN ${result.vlan} belum terverifikasi`,
              options.pppPassword
            ),
            options.acsPassword
          ),
    };
  }

  supportsCdataIpHostWan() {
    return true;
  }

  buildTr069WanPlan({
    onu,
    vlan,
    acsUrl,
    setAcs,
    acsUsername,
    acsPassword,
    natEnabled = false,
  }) {
    const { slot, pon, onuId } = this.getTr069OntAddress(onu);
    const tr069Vlan = Number(vlan);
    const natState = natEnabled ? 'enable' : 'disable';
    const acsCommand =
      setAcs
        ? this.buildCdataAcsUrlCommand({ pon, onuId, acsUrl, acsUsername, acsPassword })
        : null;

    return [
      'enable',
      'config',
      `interface gpon 0/${slot}`,
      `ont ipconfig ${pon} ${onuId} ip-index ${CDATA_TR069_IP_INDEX} dhcp vlan ${tr069Vlan} priority ${CDATA_DEFAULT_TR069_PRIORITY}`,
      `ont ipconfig ${pon} ${onuId} ip-index ${CDATA_TR069_IP_INDEX} connection-type route`,
      `ont ipconfig ${pon} ${onuId} ip-index ${CDATA_TR069_IP_INDEX} nat ${natState}`,
      `ont internet-config ${pon} ${onuId} ip-index ${CDATA_TR069_IP_INDEX}`,
      `ont tr069 ${pon} ${onuId} tr069-management enable`,
      `ont tr069 ${pon} ${onuId} inform enable interval ${CDATA_DEFAULT_TR069_INFORM_INTERVAL}`,
      `ont tr069 ${pon} ${onuId} ip-index ${CDATA_TR069_IP_INDEX}`,
      ...(acsCommand ? [acsCommand] : []),
      'exit',
      'save',
      'exit',
      `show current-config include ${pon} ${onuId}`,
    ];
  }

  buildTr069WanResult({ onu, vlan, acsUrl, setAcs, acsUsername, acsPassword, natEnabled }) {
    const { slot, pon, onuId } = this.getTr069OntAddress(onu);
    const acsCommand =
      setAcs
        ? this.buildCdataAcsUrlCommand({ pon, onuId, acsUrl, acsUsername, acsPassword })
        : null;
    return {
      slot,
      pon,
      onu_id: onuId,
      tr069_vlan: Number(vlan),
      tr069_ip_index: CDATA_TR069_IP_INDEX,
      tr069_priority: CDATA_DEFAULT_TR069_PRIORITY,
      tr069_wan_mode: 'route dhcp',
      tr069_management: 'enable',
      inform_interval: CDATA_DEFAULT_TR069_INFORM_INTERVAL,
      nat_enabled: Boolean(natEnabled),
      nat_policy: natEnabled ? 'enable' : 'disable',
      acs_url: acsCommand ? acsUrl : null,
      set_acs: Boolean(acsCommand),
      acs_action: setAcs
        ? acsCommand
          ? 'set per-ONT ACS URL with supplied C-Data ACS credentials'
          : 'not changed; C-Data ACS username/password tidak tersedia di request'
        : 'not requested',
      fallback_transport: 'cli-cdata-gpon',
      scope: 'cdata-tr069-iphost-dhcp-vlan',
    };
  }

  async ensureTr069Wan({
    onu,
    vlan,
    acsUrl,
    setAcs,
    natEnabled = false,
    acsUsername,
    acsPassword,
  }) {
    const commands = this.buildTr069WanPlan({
      onu,
      vlan,
      acsUrl,
      setAcs,
      natEnabled,
      acsUsername,
      acsPassword,
    });
    const result = this.buildTr069WanResult({
      onu,
      vlan,
      acsUrl,
      setAcs,
      natEnabled,
      acsUsername,
      acsPassword,
    });
    return {
      success: true,
      message: `C-Data IP Host TR069 DHCP VLAN ${Number(vlan)} plan ready untuk ONU ${result.pon}/${result.onu_id}`,
      plan: commands,
      result,
    };
  }

  async applyTr069Wan({
    onu,
    vlan,
    acsUrl,
    setAcs,
    natEnabled = false,
    acsUsername,
    acsPassword,
  }) {
    const commands = this.buildTr069WanPlan({
      onu,
      vlan,
      acsUrl,
      setAcs,
      natEnabled,
      acsUsername,
      acsPassword,
    });
    const result = this.buildTr069WanResult({
      onu,
      vlan,
      acsUrl,
      setAcs,
      natEnabled,
      acsUsername,
      acsPassword,
    });
    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite: true,
      timeoutMs: 70000,
    });
    const failedOutput = this.detectCommandFailure(execution.outputs || []);
    const verifyOutput =
      execution.outputs?.find((item) => item.command === `show current-config include ${result.pon} ${result.onu_id}`)?.stdout || '';
    const hasIpIndex = new RegExp(`ont\\s+tr069\\s+${result.pon}\\s+${result.onu_id}\\s+ip-index\\s+${CDATA_TR069_IP_INDEX}\\b`, 'i').test(verifyOutput);
    const hasAcs =
      !result.set_acs ||
      new RegExp(`ont\\s+tr069\\s+${result.pon}\\s+${result.onu_id}\\s+acs-url\\s+${acsUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(verifyOutput);
    const success = Boolean(execution.success && !failedOutput && hasIpIndex && hasAcs);

    return {
      success,
      message: success
        ? `C-Data IP Host TR069 DHCP VLAN ${Number(vlan)} berhasil dipush ke ONU ${result.pon}/${result.onu_id}`
        : failedOutput?.stdout ||
          failedOutput?.stderr ||
          execution.error ||
          `Push C-Data IP Host TR069 VLAN ${Number(vlan)} belum terverifikasi`,
      transport: execution.transport || this.olt.protocol,
      plan: commands,
      result: {
        ...result,
        verify_output: verifyOutput,
        verified_ip_index: hasIpIndex,
        verified_acs_url: hasAcs,
      },
      outputs: execution.outputs || [],
      error: success
        ? null
        : failedOutput?.stdout ||
          failedOutput?.stderr ||
          execution.error ||
          `Push C-Data IP Host TR069 VLAN ${Number(vlan)} belum terverifikasi`,
    };
  }

  supportsTr069Wan() {
    return true;
  }

  getCommandCatalog({ action, onu, profile }) {
    const slot = Number(onu.slot ?? 0);
    const pon = Number(onu.pon ?? 0);
    const ontId = Number(onu.onu_id ?? 1);
    const description = String(onu.description || onu.sn || '').replace(/[\r\n]/g, ' ').trim() || onu.sn;
    const lineProfile = profile?.line_profile || '<line-profile>';
    const serviceProfile = profile?.service_profile || '<service-profile>';

    return [
      this.buildPlanStep('connect', 'enable', 'Masuk privileged mode C-Data'),
      this.buildPlanStep('configure', 'config', 'Masuk mode konfigurasi C-Data'),
      this.buildPlanStep(
        'discover',
        `show ont info by-sn ${this.normalizeSnValue(onu.sn)}`,
        'Cari ONT berdasarkan SN'
      ),
      this.buildPlanStep(
        'authorize',
        action === 'register'
          ? `interface gpon 0/${slot}\nont add ${pon} ${ontId} sn-auth ${this.normalizeSnValue(onu.sn)} omci ont-lineprofile-name ${lineProfile} ont-srvprofile-name ${serviceProfile} desc ${description}\nexit`
          : `show ont info 0/${slot} ${pon} ${ontId}`,
        'Register ONT atau cek ONT existing C-Data'
      ),
      this.buildPlanStep(
        'internet-vlan',
        profile?.internet_service_enabled
          ? `service-port vlan ${profile.vlan_internet} gpon 0/${slot}/${pon} ont ${ontId} gemport 1 multi-service user-vlan ${profile.vlan_internet} tag-transform translate`
          : 'skip',
        'Service-port internet C-Data'
      ),
      this.buildPlanStep(
        'tr069-vlan',
        profile?.tr069_service_enabled
          ? `service-port vlan ${profile.vlan_tr069} gpon 0/${slot}/${pon} ont ${ontId} gemport 2 multi-service user-vlan ${profile.vlan_tr069} tag-transform translate`
          : 'skip',
        'Service-port TR069 C-Data'
      ),
      this.buildPlanStep('save', 'save', 'Save config C-Data'),
      this.buildPlanStep('verify', `show ont info 0/${slot} ${pon} ${ontId}`, 'Verifikasi status ONT C-Data'),
    ];
  }
}
