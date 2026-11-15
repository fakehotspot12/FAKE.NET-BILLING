import { BaseOltAdapter } from './base.adapter.js';
import { decryptSecret } from '../services/crypto.js';
import { executeOltCommands } from '../services/olt-transport.js';
import { getOltSnmpDetail } from '../services/olt-snmp-detail.js';
import { parseSnmpInteger, snmpGet, snmpWalk } from '../services/snmp.js';
import { HttpError } from '../utils/http-error.js';
import { query } from '../db/index.js';

const BTPON_ONU_OPTICAL_BASE_OID = '.1.3.6.1.4.1.37950.1.1.6.1.1.3.1';
const BTPON_UPTIME_CACHE_TTL_MS = 60 * 1000;
const btponUptimeCache = new Map();

export class BtponAdapter extends BaseOltAdapter {
  vendorPrefix() {
    return 'BTPON';
  }

  getVendorPriority() {
    return 8;
  }

  getCommandNotes() {
    return [
      'Template BTPON khusus untuk registrasi OLT, scan live, status ONU, dan optical SNMP.',
      'Optical ONU BTPON dibaca dari SNMP vendor saat ONU online; ketika ONU offline/SFP dilepas perangkat mengembalikan N/A.',
      'Reboot ONU memakai interface GPON lalu onu <id> reboot; delete ONU memakai no onu <id> dan write memory.',
      'Provisioning live BTPON belum diaktifkan sampai output CLI perangkat tervalidasi penuh.',
      'Jangan gunakan template BTPON untuk vendor lain.',
    ];
  }

  getProbePresets() {
    return [
      {
        key: 'identity',
        title: 'BTPON Identity',
        description: 'Read-only probe identitas BTPON',
        commands: ['enable', 'terminal length 0', 'show running-config'],
      },
      {
        key: 'pon-discovery',
        title: 'BTPON ONU Discovery',
        description: 'Read-only probe untuk mencari command discovery ONU BTPON',
        commands: ['enable', 'terminal length 0', 'show running-config'],
      },
      {
        key: 'onu-status',
        title: 'BTPON ONU Status',
        description: 'Read-only probe status ONU dan optical BTPON',
        commands: ['enable', 'terminal length 0', 'show running-config'],
      },
    ];
  }

  parseUptimeOutput(stdout) {
    const text = String(stdout || '').replace(/\s+/g, ' ').trim();
    const match = text.match(
      /(?:has been running for|Syetem Running Time:|System Running Time:)\s*(?:(\d+)\s*days?)?\s*(?:(\d+)\s*hours?)?\s*(?:(\d+)\s*minutes?)?\s*(?:(\d+)\s*seconds?)?/i
    );
    if (!match) return null;

    const days = Number(match[1] || 0);
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    const seconds = Number(match[4] || 0);
    if (![days, hours, minutes, seconds].some((value) => value > 0)) return null;

    const totalSeconds = (((days * 24) + hours) * 60 + minutes) * 60 + seconds;
    return {
      ticks: totalSeconds * 100,
      text: `${days} days, ${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      days,
      hours,
      minutes,
      seconds,
    };
  }

  async getUptime() {
    const cacheKey = String(this.olt?.id || this.olt?.host || '');
    const cached = btponUptimeCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < BTPON_UPTIME_CACHE_TTL_MS) {
      return {
        ...cached.data,
        cache: {
          hit: true,
          ttl_ms: BTPON_UPTIME_CACHE_TTL_MS,
          age_ms: Date.now() - cached.createdAt,
        },
      };
    }

    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands: ['enable', 'configure terminal', 'show time', 'show sys running-time', 'exit'],
      allowWrite: true,
      timeoutMs: 8000,
    });

    if (!execution.success) {
      return {
        status: 'unavailable',
        source: 'cli-btpon',
        message: execution.error || execution.message || 'Uptime CLI BTPON tidak terbaca',
        outputs: execution.outputs || [],
      };
    }

    const combinedOutput = (execution.outputs || []).map((item) => item.stdout || '').join('\n');
    const uptime = this.parseUptimeOutput(combinedOutput);
    if (!uptime) {
      return {
        status: 'unavailable',
        source: 'cli-btpon',
        message: 'Output uptime CLI BTPON tidak dikenali',
        outputs: execution.outputs || [],
      };
    }

    const data = {
      status: 'ok',
      source: 'cli-btpon',
      uptime,
      updated_at: new Date().toISOString(),
    };
    btponUptimeCache.set(cacheKey, {
      createdAt: Date.now(),
      data,
    });
    return {
      ...data,
      cache: {
        hit: false,
        ttl_ms: BTPON_UPTIME_CACHE_TTL_MS,
        age_ms: 0,
      },
    };
  }

  async testConnection() {
    const snmpDetail = await getOltSnmpDetail(this.olt);
    if (snmpDetail?.status === 'ok') {
      return {
        success: true,
        message: `SNMP connection to BTPON OLT ${this.olt.name} succeeded`,
        transport: 'snmp',
        summary: [
          snmpDetail.sys_descr,
          snmpDetail.sys_name ? `name ${snmpDetail.sys_name}` : null,
          snmpDetail.uptime?.text ? `uptime ${snmpDetail.uptime.text}` : null,
        ]
          .filter(Boolean)
          .join(' / '),
        snmp_detail: snmpDetail,
      };
    }

    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands: ['enable', 'terminal length 0', 'show running-config'],
      allowWrite: false,
    });

    if (!execution.success) {
      return {
        success: false,
        message: execution.error || execution.message || 'Live connection to BTPON OLT failed',
        transport: execution.transport || this.olt.protocol,
        outputs: execution.outputs || [],
        snmp_detail: snmpDetail,
      };
    }

    return {
      success: true,
      message: `Live connection to BTPON OLT ${this.olt.name} succeeded`,
      transport: execution.transport || this.olt.protocol,
      summary: execution.outputs?.find((item) => item.command === 'show running-config')?.stdout || '',
      outputs: execution.outputs || [],
      snmp_detail: snmpDetail,
    };
  }

  parseRunningConfigOnus(stdout) {
    const items = new Map();
    let currentPon = null;

    for (const rawLine of String(stdout || '').split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      const interfaceMatch = line.match(/^interface\s+gpon\s+0\/(\d+)\b/i);
      if (interfaceMatch) {
        currentPon = Number(interfaceMatch[1]);
        continue;
      }

      if (line === 'exit') {
        currentPon = null;
        continue;
      }

      if (!Number.isFinite(currentPon)) continue;

      const addMatch = line.match(/^onu\s+add\s+(\d+)\s+profile\s+\S+\s+sn\s+([A-Z0-9]+)\b/i);
      if (addMatch) {
        const onuId = Number(addMatch[1]);
        const sn = this.normalizeSnValue(addMatch[2]);
        const key = `${currentPon}:${onuId}`;
        items.set(key, {
          slot: 0,
          pon: currentPon,
          onu_id: onuId,
          sn,
          vendor: sn.slice(0, 4),
          model: 'BTPON Config',
          status: 'registered',
          description: '',
          rx_power: null,
          tx_power: null,
          distance: null,
          source: 'live-olt',
        });
        continue;
      }

      const descMatch = line.match(/^onu\s+(\d+)\s+desc\s+(.+)$/i);
      if (descMatch) {
        const onuId = Number(descMatch[1]);
        const key = `${currentPon}:${onuId}`;
        const current = items.get(key);
        if (current) {
          items.set(key, {
            ...current,
            description: descMatch[2].trim(),
          });
        }
      }
    }

    return Array.from(items.values());
  }

  parseIfDescrOnuMap(values) {
    const map = new Map();
    if (!values) return map;

    for (const [oid, entry] of values.entries()) {
      const ifIndex = Number(String(oid).split('.').pop());
      const text = String(entry?.value || '').replace(/^"|"$/g, '').trim();
      const match = text.match(/^GPON0?(\d+)ONU(\d+)\b(?:\s+(.*))?$/i);
      if (!Number.isFinite(ifIndex) || !match) continue;
      map.set(`${Number(match[1])}:${Number(match[2])}`, {
        ifIndex,
        description: match[3]?.trim() || null,
      });
    }

    return map;
  }

  parseIfDescrPonMap(values) {
    const map = new Map();
    if (!values) return map;

    for (const [oid, entry] of values.entries()) {
      const ifIndex = Number(String(oid).split('.').pop());
      const text = String(entry?.value || '').replace(/^"|"$/g, '').trim();
      const match = text.match(/^GPON0\/(\d+)$/i);
      if (!Number.isFinite(ifIndex) || !match) continue;
      map.set(Number(match[1]), ifIndex);
    }

    return map;
  }

  async readPonOperStatusMap(ifDescr) {
    const ponIfMap = this.parseIfDescrPonMap(ifDescr);
    const entries = Array.from(ponIfMap.entries());
    if (!entries.length) return new Map();

    const oids = entries.map(([, ifIndex]) => `.1.3.6.1.2.1.2.2.1.8.${ifIndex}`);
    const values = await snmpGet({ olt: this.olt, oids, timeoutMs: 4000 });
    const statusMap = new Map();
    for (const [pon, ifIndex] of entries) {
      const oid = `.1.3.6.1.2.1.2.2.1.8.${ifIndex}`;
      let status = parseSnmpInteger(values?.get(oid));
      if (status == null) {
        const single = await snmpGet({ olt: this.olt, oids: [oid], timeoutMs: 3000 });
        status = parseSnmpInteger(single?.get(oid));
      }
      if (status != null) statusMap.set(pon, status);
    }
    return statusMap;
  }

  async readOnuOperStatusMap(items = []) {
    const ifDescr = await snmpWalk({
      olt: this.olt,
      oid: '.1.3.6.1.2.1.2.2.1.2',
      timeoutMs: 6000,
      maxBuffer: 256 * 1024,
    });
    const ifMap = this.parseIfDescrOnuMap(ifDescr);
    if (!ifMap.size) return new Map();
    const ponStatusMap = await this.readPonOperStatusMap(ifDescr);

    const targets = items
      .map((onu) => {
        const info = ifMap.get(`${Number(onu.pon)}:${Number(onu.onu_id)}`);
        return info ? { onu, ...info } : null;
      })
      .filter(Boolean);
    const statusMap = new Map();
    const chunkSize = 8;

    for (let index = 0; index < targets.length; index += chunkSize) {
      const chunk = targets.slice(index, index + chunkSize);
      const oids = chunk.map((item) => `.1.3.6.1.2.1.2.2.1.8.${item.ifIndex}`);
      const values = await snmpGet({ olt: this.olt, oids, timeoutMs: 5000 });
      for (const item of chunk) {
        const status = parseSnmpInteger(values?.get(`.1.3.6.1.2.1.2.2.1.8.${item.ifIndex}`));
        if (status == null) continue;
        statusMap.set(`${Number(item.onu.pon)}:${Number(item.onu.onu_id)}`, {
          ifIndex: item.ifIndex,
          if_oper_status: status,
          status: status === 1 ? 'online' : 'offline',
          down_cause: status === 1 ? null : 'loss',
          down_cause_label: status === 1 ? null : 'LOSS',
          description: item.description || item.onu.description || null,
        });
      }

      const missing = chunk.filter((item) => !statusMap.has(`${Number(item.onu.pon)}:${Number(item.onu.onu_id)}`));
      for (const item of missing) {
        const oid = `.1.3.6.1.2.1.2.2.1.8.${item.ifIndex}`;
        const values = await snmpGet({ olt: this.olt, oids: [oid], timeoutMs: 3000 });
        const status = parseSnmpInteger(values?.get(oid));
        if (status == null) continue;
        statusMap.set(`${Number(item.onu.pon)}:${Number(item.onu.onu_id)}`, {
          ifIndex: item.ifIndex,
          if_oper_status: status,
          status: status === 1 ? 'online' : 'offline',
          down_cause: status === 1 ? null : 'loss',
          down_cause_label: status === 1 ? null : 'LOSS',
          description: item.description || item.onu.description || null,
        });
      }
    }

    for (const item of targets) {
      const key = `${Number(item.onu.pon)}:${Number(item.onu.onu_id)}`;
      if (statusMap.has(key)) continue;
      const ponStatus = ponStatusMap.get(Number(item.onu.pon));
      const samePonStatuses = Array.from(statusMap.entries())
        .filter(([statusKey]) => statusKey.startsWith(`${Number(item.onu.pon)}:`))
        .map(([, status]) => status.status);
      const samePonHasOnline = samePonStatuses.includes('online');
      const samePonHasOffline = samePonStatuses.includes('offline');
      if (ponStatus === 1) continue;
      if (ponStatus == null && (!samePonHasOffline || samePonHasOnline)) continue;
      statusMap.set(key, {
        ifIndex: item.ifIndex,
        if_oper_status: null,
        pon_if_oper_status: ponStatus ?? null,
        status: 'offline',
        down_cause: 'loss',
        down_cause_label: 'LOSS',
        description: item.description || item.onu.description || null,
      });
    }

    return statusMap;
  }

  async enrichOnuStatuses(items = []) {
    const statusMap = await this.readOnuOperStatusMap(items);
    if (!statusMap.size) return items;

    return items.map((onu) => {
      const status = statusMap.get(`${Number(onu.pon)}:${Number(onu.onu_id)}`);
      if (!status) return onu;
      return {
        ...onu,
        status: status.status,
        description: status.description || onu.description,
        if_index: status.ifIndex,
        if_oper_status: status.if_oper_status,
        down_cause: status.down_cause,
        down_cause_label: status.down_cause_label,
        last_down_time: status.status === 'offline' ? new Date().toISOString() : null,
      };
    });
  }

  parseOpticalMetric(entry, unit) {
    const text = String(entry?.value || '')
      .replace(/^"|"$/g, '')
      .trim();
    if (!text || /^N\/A$/i.test(text) || text === '-') return null;

    const match = text.match(/(-?\d+(?:\.\d+)?)\s*(?:\(\s*([^)]+)\s*\)|([a-z]+))?/i);
    if (!match) return null;

    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;

    const sourceUnit = String(match[2] || match[3] || unit || '').trim();
    const suffix = unit || sourceUnit;
    const decimals = suffix.toLowerCase() === 'dbm' ? 2 : 3;
    return `${value.toFixed(decimals)} ${suffix}`.trim();
  }

  async getSnmpOpticalInfo(onu) {
    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(pon) || !Number.isInteger(onuId) || pon < 1 || onuId < 1) return null;

    const suffix = `${pon}.${onuId}`;
    const tempOid = `${BTPON_ONU_OPTICAL_BASE_OID}.3.${suffix}`;
    const voltageOid = `${BTPON_ONU_OPTICAL_BASE_OID}.4.${suffix}`;
    const biasOid = `${BTPON_ONU_OPTICAL_BASE_OID}.5.${suffix}`;
    const txOid = `${BTPON_ONU_OPTICAL_BASE_OID}.6.${suffix}`;
    const rxOid = `${BTPON_ONU_OPTICAL_BASE_OID}.7.${suffix}`;

    const values = await snmpGet({
      olt: this.olt,
      oids: [tempOid, voltageOid, biasOid, txOid, rxOid],
      timeoutMs: 3000,
    });
    if (!values) return null;

    const txPower = this.parseOpticalMetric(values.get(txOid), 'dBm');
    const rxPower = this.parseOpticalMetric(values.get(rxOid), 'dBm');
    if (!txPower && !rxPower) return null;

    return {
      rx_power: rxPower,
      tx_power: txPower,
      optical_source: 'snmp-btpon',
      snmp_onu_index: suffix,
      onu_temperature_c: this.parseOpticalMetric(values.get(tempOid), 'C'),
      onu_voltage_v: this.parseOpticalMetric(values.get(voltageOid), 'V'),
      onu_bias_ma: this.parseOpticalMetric(values.get(biasOid), 'mA'),
    };
  }

  async getOnuDetail(onu) {
    const detail = await super.getOnuDetail(onu);
    let liveStatus = null;
    try {
      const statusMap = await this.readOnuOperStatusMap([{ ...onu, ...detail }]);
      liveStatus = statusMap.get(`${Number(detail.pon ?? onu.pon)}:${Number(detail.onu_id ?? onu.onu_id)}`);
    } catch {
      liveStatus = null;
    }

    const statusDetail = liveStatus
      ? {
          ...detail,
          status: liveStatus.status,
          description: liveStatus.description || detail.description,
          if_index: liveStatus.ifIndex,
          if_oper_status: liveStatus.if_oper_status,
          down_cause: liveStatus.down_cause,
          down_cause_label: liveStatus.down_cause_label,
          last_down_time: liveStatus.status === 'offline'
            ? new Date().toISOString()
            : detail.last_down_time || null,
          detail_source: detail.detail_source === 'live-olt' ? 'live-olt+snmp-status' : detail.detail_source,
        }
      : detail;

    try {
      const optical = await this.getSnmpOpticalInfo({ ...onu, ...statusDetail });
      if (!optical) return statusDetail;
      return {
        ...statusDetail,
        rx_power: optical.rx_power || statusDetail.rx_power,
        tx_power: optical.tx_power || statusDetail.tx_power,
        optical_source: optical.optical_source,
        snmp_onu_index: optical.snmp_onu_index,
        onu_temperature_c: optical.onu_temperature_c,
        onu_voltage_v: optical.onu_voltage_v,
        onu_bias_ma: optical.onu_bias_ma,
      };
    } catch {
      return statusDetail;
    }
  }

  buildOfflineOnuRecord(item, timestamp = new Date().toISOString()) {
    return {
      ...item,
      status: 'offline',
      down_cause: item.down_cause || 'loss',
      down_cause_label: item.down_cause_label || 'LOSS',
      last_down_time: item.last_down_time || item.last_down || timestamp,
    };
  }

  async readDatabaseInventory() {
    const result = await query(
      `SELECT id, olt_id, sn, vendor, model, slot, pon, onu_id, status, rx_power, tx_power,
              distance, description, discovered_at, last_seen, last_down_time
       FROM onu_discovered
       WHERE olt_id = $1
       ORDER BY COALESCE(slot, 0), COALESCE(pon, 0), COALESCE(onu_id, 0), sn`,
      [this.olt.id]
    );

    return result.rows.map((row) => ({
      ...row,
      slot: row.slot == null ? null : Number(row.slot),
      pon: row.pon == null ? null : Number(row.pon),
      onu_id: row.onu_id == null ? null : Number(row.onu_id),
      sn: this.normalizeSnValue(row.sn),
      vendor: row.vendor || this.normalizeSnValue(row.sn).slice(0, 4),
      model: row.model || 'BTPON DB Inventory',
      status: row.status || 'registered',
      source: 'database-inventory',
    }));
  }

  async readRunningConfigInventory() {
    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands: ['enable', 'terminal length 0', 'show running-config'],
      allowWrite: false,
    });

    if (!execution.success) {
      throw new HttpError(
        502,
        execution.error || execution.message || 'Scan ONU live ke BTPON OLT gagal'
      );
    }

    const runningConfig =
      execution.outputs?.find((item) => item.command === 'show running-config')?.stdout || '';
    return this.enrichOnuStatuses(this.parseRunningConfigOnus(runningConfig));
  }

  async getUnregisteredOnu() {
    try {
      return await this.readRunningConfigInventory();
    } catch (error) {
      const fallbackItems = await this.readDatabaseInventory();
      if (!fallbackItems.length) throw error;
      const enrichedItems = await this.enrichOnuStatuses(fallbackItems);
      return enrichedItems.map((item) => ({
        ...item,
        source: 'live-snmp-db-inventory',
        inventory_warning: error.message,
      }));
    }
  }

  async getDashboardStats() {
    const items = await this.getUnregisteredOnu();
    const now = new Date().toISOString();
    const online = items.filter((item) => item.status === 'online').length;
    const offlineOnus = items
      .filter((item) => item.status !== 'online')
      .map((item) => this.buildOfflineOnuRecord(item, now));
    return {
      source: 'live-olt',
      total_onu: items.length,
      online,
      offline: offlineOnus.length,
      unregistered: 0,
      offline_onus: offlineOnus,
      registered_onus: items,
    };
  }

  buildLiveSnSearchCommands(sn) {
    void sn;
    return ['enable', 'terminal length 0', 'show running-config'];
  }

  parseLiveSnSearchResult(criteria, outputs) {
    const runningConfig = outputs?.map((item) => item.stdout || '').join('\n') || '';
    const needle = this.normalizeSnValue(criteria.sn);
    return this.parseRunningConfigOnus(runningConfig).filter((item) =>
      this.normalizeSnValue(item.sn).includes(needle)
    );
  }

  buildTr069WanPlan({ onu, vlan }) {
    const pon = Number(onu.pon ?? onu.slot);
    const onuId = Number(onu.onu_id);
    if (!Number.isFinite(pon) || !Number.isFinite(onuId)) {
      this.unsupported('PON dan ONU ID wajib terisi untuk add WAN TR069 DHCP BTPON');
    }

    return [
      'enable',
      'configure terminal',
      'profile pri id 1',
      'wan_conn index 1 route tr069 dhcp',
      `wan_conn index 1 vlan enable vid ${Number(vlan)}`,
      'commit',
      'exit',
      `interface gpon 0/${pon}`,
      `onu ${onuId} profile pri name pri_1`,
      'exit',
      'exit',
    ];
  }

  async ensureTr069Wan({ onu, vlan, acsUrl, setAcs, natEnabled = false }) {
    const commands = this.buildTr069WanPlan({ onu, vlan });
    return {
      success: true,
      message: `BTPON TR069 DHCP WAN plan ready for ${onu.sn}`,
      plan: commands,
      result: {
        profile_id: 1,
        profile_name: 'pri_1',
        wan_index: 1,
        tr069_vlan: Number(vlan),
        tr069_wan_mode: 'route tr069 dhcp',
        onu_interface: `gpon 0/${Number(onu.pon ?? onu.slot)}`,
        onu_id: Number(onu.onu_id),
        acs_url: acsUrl || null,
        set_acs: false,
        acs_action: setAcs ? 'not changed; BTPON ACS command requires ACS username/password' : 'not requested',
        nat_enabled: Boolean(natEnabled),
        nat_policy: 'not changed',
        scope: 'btpon-tr069-dhcp-wan-and-pri-profile-bind',
      },
    };
  }

  supportsTr069Wan() {
    return true;
  }

  getCommandCatalog() {
    this.unsupported('Provisioning live BTPON belum diaktifkan sampai template CLI BTPON tervalidasi');
  }

  normalizePonOnuAddress(onu, actionLabel) {
    const pon = Number(onu?.pon ?? onu?.slot);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(pon) || pon < 1 || !Number.isInteger(onuId) || onuId < 1) {
      throw new HttpError(422, `PON dan ONU ID wajib terisi untuk ${actionLabel} BTPON`);
    }
    return { pon, onuId };
  }

  async executeBtponOnuAction({ onu, commands, actionLabel, successMessage }) {
    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite: true,
      timeoutMs: 30000,
    });

    const failedOutput = this.detectCommandFailure(execution.outputs || []);
    const success = Boolean(execution.success && !failedOutput);

    return {
      success,
      message:
        execution.error ||
        execution.message ||
        (failedOutput
          ? `${actionLabel} selesai dengan indikasi error pada command: ${failedOutput.command}`
          : successMessage),
      live_mode: Boolean(execution.live_mode),
      transport: execution.transport || this.olt.protocol,
      commands,
      outputs: execution.outputs || [],
      error: execution.error || execution.message || (failedOutput ? failedOutput.stdout || failedOutput.stderr : null),
    };
  }

  async rebootOnu({ onu }) {
    const { pon, onuId } = this.normalizePonOnuAddress(onu, 'reboot ONU');
    return this.executeBtponOnuAction({
      onu,
      actionLabel: 'Reboot ONU BTPON',
      commands: [
        'enable',
        'configure terminal',
        `interface gpon 0/${pon}`,
        `onu ${onuId} reboot`,
        'exit',
      ],
      successMessage: `Reboot ONU BTPON dikirim untuk ${onu.sn}`,
    });
  }

  supportsOnuReboot() {
    return true;
  }

  async deleteOnuFromOlt({ onu }) {
    const { pon, onuId } = this.normalizePonOnuAddress(onu, 'delete ONU');
    return this.executeBtponOnuAction({
      onu,
      actionLabel: 'Delete ONU BTPON',
      commands: [
        'enable',
        'configure terminal',
        `interface gpon 0/${pon}`,
        `no onu ${onuId}`,
        'exit',
        'write memory',
      ],
      successMessage: `Delete ONU BTPON dikirim ke OLT untuk ${onu.sn}`,
    });
  }

  supportsOnuDelete() {
    return true;
  }

  async saveConfig() {
    return this.executeSaveConfigCommands({
      commands: ['enable', 'write memory'],
      successMessage: `Save config BTPON OLT ${this.olt.name} selesai`,
    });
  }

  supportsOnuDescriptionUpdate() {
    return true;
  }

  buildOnuDescriptionCommands({ onu, description }) {
    const { pon, onuId } = this.normalizePonOnuAddress(onu, 'edit description ONU');

    return [
      'enable',
      'configure terminal',
      `interface gpon 0/${pon}`,
      `onu ${onuId} desc ${description}`,
      'exit',
      'write memory',
    ];
  }
}
