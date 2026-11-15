import { readOnlyFetch } from '../services/context.js';
import { BaseOltAdapter } from './base.adapter.js';
import { decryptSecret } from '../services/crypto.js';
import { executeOltCommands } from '../services/olt-transport.js';
import { getOltSnmpDetail } from '../services/olt-snmp-detail.js';
import { HttpError } from '../utils/http-error.js';
import { config } from '../config.js';

const HIOSO_DEFAULT_SLOT = 1;
const HIOSO_DEFAULT_PON = 1;
const HIOSO_DEFAULT_OLT_IDS = [1];
const HIOSO_DEFAULT_PON_NUMBERS = [1, 2, 3, 4];
const HIOSO_COMMAND_TIMEOUT_MS = 60000;
const HIOSO_WEB_TIMEOUT_MS = 60000;
const HIOSO_OFFLINE_CAUSE = 'down';
const HIOSO_OFFLINE_CAUSE_LABEL = 'DOWN / tidak terdeteksi di discovery-links';
const HIOSO_TIMEOUT_CAUSE = 'down';
const HIOSO_TIMEOUT_CAUSE_LABEL = 'DOWN / TIMEOUT';
const HIOSO_POWERDOWN_CAUSE = 'powerdown';
const HIOSO_POWERDOWN_CAUSE_LABEL = 'POWERDOWN';
const HIOSO_WEB_DOWN_CAUSES = {
  0: { cause: 'other', label: 'OTHER' },
  1: { cause: HIOSO_TIMEOUT_CAUSE, label: 'TIMEOUT' },
  2: { cause: 'onu-init', label: 'ONU-init' },
  3: { cause: 'olt-init', label: 'OLT-init' },
  4: { cause: 'reject-blacklist', label: 'RejectByBlackList' },
  5: { cause: 'reject-whitelist', label: 'RejectByWhiteList' },
};

export class HiosoAdapter extends BaseOltAdapter {
  vendorPrefix() {
    return 'Hioso';
  }

  getVendorPriority() {
    return 9;
  }

  getCommandNotes() {
    return [
      'Template Hioso EPON khusus firmware yang memakai mode epon dan login Access Password.',
      'Inventory live Hioso dibaca dari web UI; jika web kosong, HA7304/4EPON dibaca dari show onu info all dan show onu optical-ddm all.',
      'Firmware Hioso lama tetap memakai known-links dan discovery-links OLT ID 1; discovery-links dipakai sebagai indikator online.',
      'Optical ONU firmware lama dibaca per ONU lewat show optical-ddm onu; HA7304/4EPON memakai show onu <id> optical-ddm di context interface.',
      'Jika kredensial web Hioso tersedia, status/detail ONU dibaca dari onuAllPonOnuList.asp agar penyebab bisa membedakan POWERDOWN dan DOWN/TIMEOUT.',
      'Jika web UI tidak tersedia, ONU yang ada di known-links tetapi hilang dari discovery-links ditandai DOWN.',
      'Edit description dan reboot ONU Hioso memakai endpoint web /goform/setOnu; delete ONU Hioso 4PON mencoba CLI dulu lalu fallback ke /goform/deleteOnu.',
      'Provisioning Hioso belum diaktifkan sampai syntax write tervalidasi aman.',
    ];
  }

  getProbePresets() {
    return [
      {
        key: 'identity',
        title: 'Hioso Identity',
        description: 'Read-only identitas Hioso EPON',
        commands: ['enable', 'terminal length 0', 'show system', 'show version'],
      },
      {
        key: 'pon-discovery',
        title: 'Hioso 2PON ONU Inventory',
        description: 'Daftar ONU Hioso 2PON dari known-links dan discovery-links',
        commands: [
          'enable',
          'terminal length 0',
          'configure terminal',
          'epon',
          'show olt',
          'show olt 1 known-links',
          'show olt 1 discovery-links',
        ],
      },
      {
        key: 'pon-discovery-ha7304',
        title: 'Hioso HA7304 ONU Inventory',
        description: 'Daftar ONU Hioso HA7304/4EPON dari show onu info all dan optical-ddm',
        commands: [
          'enable',
          'terminal length 0',
          'configure terminal',
          'epon',
          'interface epon 0/1',
          'show onu info all',
          'show onu optical-ddm all',
          'exit',
          'interface epon 0/2',
          'show onu info all',
          'show onu optical-ddm all',
          'exit',
          'interface epon 0/3',
          'show onu info all',
          'show onu optical-ddm all',
          'exit',
          'interface epon 0/4',
          'show onu info all',
          'show onu optical-ddm all',
        ],
      },
      {
        key: 'onu-status',
        title: 'Hioso 2PON Optical Detail',
        description: 'Optical detail Hioso 2PON untuk satu ONU contoh',
        commands: [
          'enable',
          'terminal length 0',
          'configure terminal',
          'epon',
          'show optical-ddm onu 0/1/1:1',
        ],
      },
      {
        key: 'onu-status-ha7304',
        title: 'Hioso HA7304 Optical Detail',
        description: 'Optical detail Hioso HA7304/4EPON untuk satu PON contoh',
        commands: [
          'enable',
          'terminal length 0',
          'configure terminal',
          'epon',
          'interface epon 0/1',
          'show onu optical-ddm all',
        ],
      },
    ];
  }

  normalizeMacValue(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^0-9a-f]/g, '');
  }

  formatMacAddress(value) {
    const normalized = this.normalizeMacValue(value);
    if (normalized.length !== 12) return null;
    return normalized.match(/.{1,2}/g).join(':');
  }

  macAsSn(value) {
    return this.normalizeMacValue(value).toUpperCase();
  }

  getInventoryOltIds() {
    return HIOSO_DEFAULT_OLT_IDS;
  }

  getInventoryPonNumbers() {
    return HIOSO_DEFAULT_PON_NUMBERS;
  }

  getModelProfile() {
    const profile = String(this.olt?.model_profile || 'auto').toLowerCase();
    return ['auto', 'hioso-2pon', 'hioso-ha7304'].includes(profile) ? profile : 'auto';
  }

  shouldUseLegacyInventory() {
    return this.getModelProfile() !== 'hioso-ha7304';
  }

  shouldUseHa7304Inventory() {
    return this.getModelProfile() !== 'hioso-2pon';
  }

  opticalAddress(onu) {
    const slot = Number(onu?.slot ?? HIOSO_DEFAULT_SLOT);
    const pon = Number(onu?.pon ?? HIOSO_DEFAULT_PON);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(slot) || !Number.isInteger(pon) || !Number.isInteger(onuId)) {
      throw new HttpError(422, 'Slot, PON, dan ONU ID wajib terisi untuk Hioso optical detail');
    }
    return `0/${slot}/${pon}:${onuId}`;
  }

  webOnuAddress(onu) {
    const existingAddress = this.parseWebOnuAddress(onu?.snmp_onu_index);
    if (existingAddress) return existingAddress.address;

    const pon = Number(onu?.pon ?? HIOSO_DEFAULT_PON);
    const onuId = Number(onu?.onu_id);
    if (this.isFourPonModel() && Number.isInteger(pon) && Number.isInteger(onuId)) {
      return `0/${pon}:${onuId}`;
    }

    return this.opticalAddress(onu);
  }

  async executeHiosoCommands(commands, { allowWrite = true, timeoutMs = HIOSO_COMMAND_TIMEOUT_MS } = {}) {
    return executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite,
      timeoutMs,
    });
  }

  parseSystemOutput(stdout) {
    const fields = {};
    for (const rawLine of String(stdout || '').split('\n')) {
      const match = rawLine.match(/^\s*([A-Za-z][A-Za-z0-9 ]+?)\s*:\s*(.*?)\s*$/);
      if (!match) continue;
      fields[match[1].trim().toLowerCase().replace(/\s+/g, '_')] = match[2].trim();
    }
    return fields;
  }

  parseOltRows(stdout) {
    const rows = [];
    for (const rawLine of String(stdout || '').split('\n')) {
      const line = rawLine.trim();
      const match = line.match(/^(\d+)\s+([0-9a-f.:-]+)\s+(\d+)\s+(\S+)/i);
      if (!match || /^oltId$/i.test(match[1])) continue;
      rows.push({
        olt_id: Number(match[1]),
        mac: match[2],
        pon_count: Number(match[3]),
        status: match[4],
      });
    }
    return rows;
  }

  parseLinkRows(stdout, { slot = HIOSO_DEFAULT_SLOT, pon = HIOSO_DEFAULT_PON } = {}) {
    const text = String(stdout || '');
    const slotNumber = Number(slot);
    const ponNumber = Number(pon);
    const rows = [];

    for (const rawLine of text.split('\n')) {
      const match = rawLine.trim().match(/^(\d+)\s+([0-9a-f]{2}(?::[0-9a-f]{2}){5})$/i);
      if (!match) continue;
      const macAddress = this.formatMacAddress(match[2]);
      if (!macAddress) continue;
      rows.push({
        slot: Number.isInteger(slotNumber) ? slotNumber : HIOSO_DEFAULT_SLOT,
        pon: Number.isInteger(ponNumber) ? ponNumber : HIOSO_DEFAULT_PON,
        onu_id: Number(match[1]),
        mac_address: macAddress,
        sn: this.macAsSn(macAddress),
      });
    }

    return rows;
  }

  parseHa7304OnuInfoRows(stdout) {
    const rows = [];
    for (const rawLine of String(stdout || '').split('\n')) {
      const cells = rawLine.trim().split(/\s+/);
      if (cells.length < 5 || !/^0\/\d+:\d+$/i.test(cells[0])) continue;

      const addressInfo = this.parseWebOnuAddress(cells[0]);
      const macAddress = this.formatMacAddress(cells[1]);
      if (!addressInfo || !macAddress) continue;

      const statusText = String(cells[2] || '').trim();
      const online = /^(up|online)$/i.test(statusText);
      const gePorts = Number(cells[5]);
      const fePorts = Number(cells[6]);
      const potsPorts = Number(cells[7]);
      const portCount = [gePorts, fePorts, potsPorts].reduce(
        (total, value) => total + (Number.isFinite(value) ? value : 0),
        0
      );

      rows.push({
        chassis: 0,
        slot: addressInfo.slot,
        pon: addressInfo.pon,
        onu_id: addressInfo.onu_id,
        sn: this.macAsSn(macAddress),
        mac_address: macAddress,
        vendor: null,
        model: cells[3] ? `Hioso EPON ${cells[3]}` : 'Hioso EPON Live',
        firmware_version: cells[3] ? String(cells[3]) : null,
        chip_id: cells[4] ? String(cells[4]) : null,
        port_count: portCount || null,
        status: online ? 'online' : 'offline',
        run_state: online ? 'online' : 'offline',
        down_cause: online ? null : HIOSO_TIMEOUT_CAUSE,
        down_cause_label: online ? null : HIOSO_TIMEOUT_CAUSE_LABEL,
        down_cause_detail: online ? null : `CLI Hioso menandai status ${statusText || 'Down'}.`,
        description: cells.slice(12).join(' '),
        rx_power: null,
        tx_power: null,
        distance: null,
        source: 'live-olt',
        detail_source: 'cli-hioso-ha7304',
        snmp_onu_index: addressInfo.address,
      });
    }
    return rows;
  }

  parseHa7304OpticalRows(stdout) {
    const rows = [];
    for (const rawLine of String(stdout || '').split('\n')) {
      const cells = rawLine.trim().split(/\s+/);
      if (cells.length < 12 || !/^0\/\d+:\d+$/i.test(cells[0])) continue;

      const addressInfo = this.parseWebOnuAddress(cells[0]);
      const macAddress = this.formatMacAddress(cells[1]);
      if (!addressInfo || !macAddress) continue;

      const statusText = String(cells[2] || '').trim();
      const online = /^(up|online)$/i.test(statusText);
      const temperature = Number(cells[7]);
      const voltage = Number(cells[8]);
      const bias = Number(cells[9]);
      const txPower = this.formatWebDbm(cells[10]);
      const rxPower = this.formatWebDbm(cells[11]);

      rows.push({
        chassis: 0,
        slot: addressInfo.slot,
        pon: addressInfo.pon,
        onu_id: addressInfo.onu_id,
        sn: this.macAsSn(macAddress),
        mac_address: macAddress,
        vendor: null,
        model: cells[3] ? `Hioso EPON ${cells[3]}` : 'Hioso EPON Live',
        firmware_version: cells[3] ? String(cells[3]) : null,
        chip_id: cells[4] ? String(cells[4]) : null,
        port_count: [Number(cells[5]), Number(cells[6])]
          .filter((value) => Number.isFinite(value))
          .reduce((total, value) => total + value, 0) || null,
        status: online ? 'online' : 'offline',
        run_state: online ? 'online' : 'offline',
        down_cause: online ? null : HIOSO_TIMEOUT_CAUSE,
        down_cause_label: online ? null : HIOSO_TIMEOUT_CAUSE_LABEL,
        down_cause_detail: online ? null : `CLI Hioso optical menandai status ${statusText || 'Down'}.`,
        description: cells.slice(12).join(' '),
        rx_power: rxPower,
        tx_power: txPower,
        distance: null,
        onu_temperature_c: Number.isFinite(temperature) ? temperature : null,
        onu_voltage_v: Number.isFinite(voltage) ? voltage : null,
        onu_bias_ma: Number.isFinite(bias) ? bias : null,
        source: 'live-olt',
        detail_source: 'cli-hioso-ha7304',
        optical_source: rxPower || txPower ? 'cli-hioso-ha7304' : null,
        snmp_onu_index: addressInfo.address,
      });
    }
    return rows;
  }

  mergeHa7304InventoryItem(item, optical) {
    if (!optical) return item;
    return {
      ...item,
      status: optical.status || item.status,
      run_state: optical.run_state || item.run_state,
      rx_power: optical.rx_power ?? item.rx_power,
      tx_power: optical.tx_power ?? item.tx_power,
      optical_source: optical.optical_source || item.optical_source,
      onu_temperature_c: optical.onu_temperature_c ?? item.onu_temperature_c,
      onu_voltage_v: optical.onu_voltage_v ?? item.onu_voltage_v,
      onu_bias_ma: optical.onu_bias_ma ?? item.onu_bias_ma,
    };
  }

  parseHa7304InventoryOutputs(outputs = []) {
    const itemsByAddress = new Map();
    const opticalByAddress = new Map();

    for (const output of outputs || []) {
      const command = String(output.command || '').trim();
      if (/^show\s+onu\s+info\s+all$/i.test(command)) {
        for (const item of this.parseHa7304OnuInfoRows(output.stdout)) {
          itemsByAddress.set(item.snmp_onu_index, item);
        }
      }
      if (/^show\s+onu\s+optical-ddm\s+all$/i.test(command)) {
        for (const optical of this.parseHa7304OpticalRows(output.stdout)) {
          opticalByAddress.set(optical.snmp_onu_index, optical);
        }
      }
    }

    for (const [address, optical] of opticalByAddress.entries()) {
      const existing = itemsByAddress.get(address);
      itemsByAddress.set(address, existing ? this.mergeHa7304InventoryItem(existing, optical) : optical);
    }

    return [...itemsByAddress.values()].sort((a, b) => {
      const ponDelta = Number(a.pon || 0) - Number(b.pon || 0);
      if (ponDelta) return ponDelta;
      return Number(a.onu_id || 0) - Number(b.onu_id || 0);
    });
  }

  extractJavascriptArrayBody(stdout, variableName) {
    const text = String(stdout || '');
    const match = text.match(new RegExp(`var\\s+${variableName}\\s*=\\s*new\\s+Array\\s*\\(`, 'i'));
    if (!match) return null;

    let index = (match.index || 0) + match[0].length;
    let quote = null;
    let escaped = false;
    let body = '';

    for (; index < text.length; index += 1) {
      const char = text[index];
      if (quote) {
        body += char;
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        body += char;
        continue;
      }

      if (char === ')') return body;
      body += char;
    }

    return null;
  }

  parseJavascriptArrayValues(body) {
    const values = [];
    const text = String(body || '');
    let index = 0;

    const skipSeparators = () => {
      while (index < text.length && /[\s,]/.test(text[index])) index += 1;
    };

    while (index < text.length) {
      skipSeparators();
      if (index >= text.length) break;

      const quote = text[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        let value = '';
        let escaped = false;
        while (index < text.length) {
          const char = text[index];
          index += 1;
          if (escaped) {
            value += char;
            escaped = false;
          } else if (char === '\\') {
            escaped = true;
          } else if (char === quote) {
            break;
          } else {
            value += char;
          }
        }
        values.push(value);
        continue;
      }

      const start = index;
      while (index < text.length && text[index] !== ',') index += 1;
      const rawValue = text.slice(start, index).trim();
      if (!rawValue) continue;
      const numberValue = Number(rawValue);
      values.push(Number.isFinite(numberValue) ? numberValue : rawValue);
    }

    return values;
  }

  parseHiosoDateTime(value) {
    const text = String(value || '').trim();
    if (!text || /^0{4}-0{2}-0{2}/.test(text)) return null;
    return text;
  }

  normalizeWebDescription(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text || ['NA', 'N/A', 'NULL', 'NONE', '-'].includes(text.toUpperCase())) return '';
    return text;
  }

  formatWebDbm(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || /-?inf|nan/i.test(String(value))) return null;
    return `${number.toFixed(2)} dBm`;
  }

  isFourPonModel() {
    if (this.getModelProfile() === 'hioso-ha7304') return true;
    const signature = `${this.olt?.name || ''} ${this.olt?.vendor || ''}`
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
    return (
      signature.includes('hioso4pon') ||
      signature.includes('4ponhioso') ||
      signature.includes('hioso4epon') ||
      signature.includes('4eponhioso') ||
      signature.includes('ha7304')
    );
  }

  parseWebOnuAddress(value) {
    const address = String(value || '').trim();
    const fullMatch = address.match(/^0\/(\d+)\/(\d+):(\d+)$/);
    if (fullMatch) {
      return {
        address,
        slot: Number(fullMatch[1]),
        pon: Number(fullMatch[2]),
        onu_id: Number(fullMatch[3]),
      };
    }

    const compactMatch = address.match(/^0\/(\d+):(\d+)$/);
    if (compactMatch) {
      return {
        address,
        slot: HIOSO_DEFAULT_SLOT,
        pon: Number(compactMatch[1]),
        onu_id: Number(compactMatch[2]),
      };
    }

    return null;
  }

  detectWebOnuRowLength(stdout, values) {
    const declaredLength = Number(
      String(stdout || '').match(/onutable\.length\s*\)\s*\/\s*(\d+)/i)?.[1]
    );
    if (Number.isInteger(declaredLength) && declaredLength > 0 && values.length % declaredLength === 0) {
      return declaredLength;
    }

    return [22, 18].find((length) => values.length % length === 0) || 18;
  }

  normalizeWebOnuRow(row, rowLength) {
    if (rowLength >= 22) {
      return {
        address: row[0],
        description: row[1],
        mac: row[2],
        status: row[3],
        firmware: row[4],
        chip: row[5],
        ports: row[6],
        rtt: row[10],
        temperature: row[11],
        voltage: row[12],
        bias: row[13],
        txPower: row[14],
        rxPower: row[15],
        lastUpTime: row[16],
        lastDownTime: row[17],
        downCause: row[18],
        onlineSeconds: row[19],
        offlineCount: row[20],
        dyingGasp: row[21],
      };
    }

    return {
      address: row[0],
      description: row[1],
      mac: row[2],
      status: row[3],
      firmware: row[4],
      chip: row[5],
      ports: row[6],
      temperature: row[7],
      voltage: row[8],
      bias: row[9],
      txPower: row[10],
      rxPower: row[11],
      offlineCount: row[13],
      dyingGasp: row[14],
      rtt: row[15],
      lastUpTime: row[16],
      lastDownTime: row[17],
    };
  }

  normalizeWebDownCause({ online, downCause, dyingGasp }) {
    if (online) {
      return {
        cause: null,
        label: null,
        detail: null,
      };
    }

    if (dyingGasp) {
      return {
        cause: HIOSO_POWERDOWN_CAUSE,
        label: HIOSO_POWERDOWN_CAUSE_LABEL,
        detail: 'Web UI Hioso menandai Dying_gasp/PowerDown.',
      };
    }

    const rawCode = String(downCause ?? '').trim();
    const numericCode = Number(rawCode);
    const mapped =
      rawCode !== '' && Number.isInteger(numericCode)
        ? HIOSO_WEB_DOWN_CAUSES[numericCode]
        : null;

    if (mapped) {
      return {
        cause: mapped.cause,
        label: mapped.label,
        detail: `Web UI Hioso menandai offline reason ${mapped.label} (code ${numericCode}).`,
      };
    }

    if (rawCode) {
      return {
        cause: rawCode,
        label: rawCode,
        detail: `Web UI Hioso menandai offline reason ${rawCode}.`,
      };
    }

    return {
      cause: HIOSO_TIMEOUT_CAUSE,
      label: HIOSO_TIMEOUT_CAUSE_LABEL,
      detail: 'Web UI Hioso menandai Down/Timeout.',
    };
  }

  parseWebOnuList(stdout) {
    const body = this.extractJavascriptArrayBody(stdout, 'onutable');
    if (!body) return [];

    const values = this.parseJavascriptArrayValues(body);
    const rows = [];
    const rowLength = this.detectWebOnuRowLength(stdout, values);

    for (let index = 0; index + rowLength <= values.length; index += rowLength) {
      const row = values.slice(index, index + rowLength);
      const normalizedRow = this.normalizeWebOnuRow(row, rowLength);
      const addressInfo = this.parseWebOnuAddress(normalizedRow.address);
      const macAddress = this.formatMacAddress(normalizedRow.mac);
      if (!addressInfo || !macAddress) continue;

      const statusText = String(normalizedRow.status || '').trim();
      const online = /^up$/i.test(statusText);
      const status = online ? 'online' : /^down$/i.test(statusText) ? 'offline' : 'unknown';
      const dyingGasp = Number(normalizedRow.dyingGasp) === 1;
      const downCause = this.normalizeWebDownCause({
        online,
        downCause: normalizedRow.downCause,
        dyingGasp,
      });

      rows.push({
        chassis: 0,
        slot: addressInfo.slot,
        pon: addressInfo.pon,
        onu_id: addressInfo.onu_id,
        sn: this.macAsSn(macAddress),
        mac_address: macAddress,
        vendor: null,
        model: normalizedRow.firmware ? `Hioso EPON ${normalizedRow.firmware}` : 'Hioso EPON Live',
        firmware_version: normalizedRow.firmware ? String(normalizedRow.firmware) : null,
        chip_id: normalizedRow.chip ? String(normalizedRow.chip) : null,
        port_count: Number.isFinite(Number(normalizedRow.ports)) ? Number(normalizedRow.ports) : null,
        status,
        run_state: status,
        down_cause: downCause.cause,
        down_cause_label: downCause.label,
        down_cause_detail: downCause.detail,
        description: this.normalizeWebDescription(normalizedRow.description),
        rx_power: this.formatWebDbm(normalizedRow.rxPower),
        tx_power: this.formatWebDbm(normalizedRow.txPower),
        distance: null,
        onu_temperature_c: Number.isFinite(Number(normalizedRow.temperature)) ? Number(normalizedRow.temperature) : null,
        onu_voltage_v: Number.isFinite(Number(normalizedRow.voltage)) ? Number(normalizedRow.voltage) : null,
        onu_bias_ma: Number.isFinite(Number(normalizedRow.bias)) ? Number(normalizedRow.bias) : null,
        rtt: Number.isFinite(Number(normalizedRow.rtt)) ? Number(normalizedRow.rtt) : null,
        online_seconds: Number.isFinite(Number(normalizedRow.onlineSeconds))
          ? Number(normalizedRow.onlineSeconds)
          : null,
        offline_count: Number.isFinite(Number(normalizedRow.offlineCount)) ? Number(normalizedRow.offlineCount) : null,
        last_up_time: this.parseHiosoDateTime(normalizedRow.lastUpTime),
        last_down_time: this.parseHiosoDateTime(normalizedRow.lastDownTime),
        source: 'web-hioso',
        detail_source: 'web-hioso',
        optical_source: normalizedRow.txPower != null || normalizedRow.rxPower != null ? 'web-hioso' : null,
        snmp_onu_index: addressInfo.address,
      });
    }

    return rows;
  }

  async readWebResponseText(response) {
    if (!response.body?.getReader) {
      return response.text();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (this.extractJavascriptArrayBody(text, 'onutable')) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
      text += decoder.decode();
    } catch (error) {
      if (!text) throw error;
    }

    return text;
  }

  getWebCredentials() {
    const username = this.olt.web_username || config.hiosoWebUsername || this.olt.username;
    let password = '';
    if (this.olt.web_password_encrypted) {
      try {
        password = decryptSecret(this.olt.web_password_encrypted);
      } catch {
        password = '';
      }
    }
    if (!password) {
      password = config.hiosoWebPassword;
    }
    if (!password) {
      try {
        password = decryptSecret(this.olt.password_encrypted);
      } catch {
        password = '';
      }
    }
    return { username, password };
  }

  getWebBaseUrl() {
    const port = Number(this.olt.web_port || config.hiosoWebPort || 80);
    const authority = port && port !== 80 ? `${this.olt.host}:${port}` : this.olt.host;
    return `http://${authority}`;
  }

  async fetchWebPath(path, options = {}) {
    const { username, password } = this.getWebCredentials();
    if (!username || !password) {
      throw new HttpError(422, 'Username/password web Hioso belum dikonfigurasi');
    }

    const token = Buffer.from(`${username}:${password}`).toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HIOSO_WEB_TIMEOUT_MS);
    try {
      return await readOnlyFetch(`${this.getWebBaseUrl()}${path}`, {
        ...options,
        headers: {
          Authorization: `Basic ${token}`,
          Connection: 'close',
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async readWebOnuList() {
    try {
      const response = await this.fetchWebPath('/onuAllPonOnuList.asp');
      if (!response.ok) return [];
      return this.parseWebOnuList(await this.readWebResponseText(response));
    } catch {
      return [];
    }
  }

  parseWebOnuConfig(stdout) {
    const body = this.extractJavascriptArrayBody(stdout, 'onuinfo');
    if (!body) return null;
    const row = this.parseJavascriptArrayValues(body);
    const macAddress = this.formatMacAddress(row[2]);
    return {
      address: String(row[0] || '').trim(),
      raw_name: String(row[1] || '').trim(),
      description: this.normalizeWebDescription(row[1]),
      mac_address: macAddress,
      sn: macAddress ? this.macAsSn(macAddress) : null,
      status: /^up$/i.test(String(row[3] || '')) ? 'online' : /^down$/i.test(String(row[3] || '')) ? 'offline' : 'unknown',
      firmware_version: row[4] ? String(row[4]) : null,
      chip_id: row[5] ? String(row[5]) : null,
      port_count: Number.isFinite(Number(row[6])) ? Number(row[6]) : null,
    };
  }

  async readWebOnuConfig(onu) {
    const address = this.webOnuAddress(onu);
    const response = await this.fetchWebPath(`/onuConfig.asp?onuno=${encodeURIComponent(address)}`);
    if (!response.ok) {
      throw new HttpError(502, `Web Hioso gagal membaca ONU ${onu.sn}: HTTP ${response.status}`);
    }
    const configPage = this.parseWebOnuConfig(await response.text());
    if (!configPage?.mac_address) {
      throw new HttpError(502, `Web Hioso tidak mengembalikan detail ONU ${onu.sn}`);
    }
    return configPage;
  }

  async submitWebOnuOperation({ onu, name, operation }) {
    const address = this.webOnuAddress(onu);
    const onuName = String(name || '').trim();
    if (!onuName) {
      throw new HttpError(422, 'Name/description ONU Hioso wajib diisi');
    }

    const body = new URLSearchParams({
      onuId: address,
      onuName,
      onuOperation: operation,
    });
    const response = await this.fetchWebPath('/goform/setOnu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const responseText = await response.text().catch(() => '');
    if (!response.ok) {
      throw new HttpError(502, `Web Hioso gagal mengirim operasi ONU ${onu.sn}: HTTP ${response.status}`);
    }
    return {
      response_status: response.status,
      response_length: responseText.length,
      address,
      name: onuName,
      operation,
    };
  }

  async submitWebOnuDelete(onu) {
    const address = this.webOnuAddress(onu);
    const body = new URLSearchParams({ onuId: address });
    const response = await this.fetchWebPath('/goform/deleteOnu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const responseText = await response.text().catch(() => '');
    if (!response.ok) {
      throw new HttpError(502, `Web Hioso gagal menghapus ONU ${onu.sn}: HTTP ${response.status}`);
    }
    return {
      response_status: response.status,
      response_length: responseText.length,
      address,
    };
  }

  parseOpticalOutput(stdout) {
    const text = String(stdout || '');
    const addressMatch = text.match(/ONU\s+(0\/\d+\/\d+:\d+)\s+optical ddm/i);
    const readValue = (label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = text.match(new RegExp(`${escaped}\\s*:\\s*([^\\r\\n]+)`, 'i'));
      return match?.[1]?.trim() || null;
    };
    const parseNumber = (value) => {
      if (!value || /-?inf|nan/i.test(value)) return null;
      const number = Number(String(value).match(/-?\d+(?:\.\d+)?/)?.[0]);
      return Number.isFinite(number) ? number : null;
    };
    const formatDbm = (value) => {
      const number = parseNumber(value);
      return number == null ? null : `${number.toFixed(2)} dBm`;
    };

    const temperature = parseNumber(readValue('Temperature'));
    const voltage = parseNumber(readValue('Voltage'));
    const current = parseNumber(readValue('Current') || readValue('TxBias'));
    const txPower = formatDbm(readValue('TxPower'));
    const rxPower = formatDbm(readValue('RxPower'));

    return {
      address: addressMatch?.[1] || null,
      rx_power: rxPower,
      tx_power: txPower,
      optical_source: 'cli-hioso',
      onu_temperature_c: temperature,
      onu_voltage_v: voltage,
      onu_bias_ma: current,
      status: rxPower || txPower ? 'online' : 'offline',
    };
  }

  parseOpticalOutputs(outputs = []) {
    const opticalMap = new Map();
    for (const output of outputs) {
      const command = String(output.command || '').trim();
      if (!/^show\s+optical-ddm\s+onu\s+/i.test(command)) continue;
      const commandAddress = command.match(/show\s+optical-ddm\s+onu\s+(\S+)/i)?.[1] || null;
      const optical = this.parseOpticalOutput(output.stdout);
      const address = optical.address || commandAddress;
      if (!address || (!optical.rx_power && !optical.tx_power)) continue;
      opticalMap.set(address, {
        ...optical,
        snmp_onu_index: address,
      });
    }
    return opticalMap;
  }

  mergeOpticalInfo(items = [], opticalMap = new Map()) {
    return items.map((item) => {
      let address = null;
      try {
        address = this.opticalAddress(item);
      } catch {
        return item;
      }
      const optical = opticalMap.get(address);
      if (!optical) return item;
      return {
        ...item,
        status: optical.status || item.status,
        rx_power: optical.rx_power || item.rx_power,
        tx_power: optical.tx_power || item.tx_power,
        optical_source: optical.optical_source || item.optical_source,
        snmp_onu_index: optical.snmp_onu_index || item.snmp_onu_index,
        onu_temperature_c: optical.onu_temperature_c ?? item.onu_temperature_c,
        onu_voltage_v: optical.onu_voltage_v ?? item.onu_voltage_v,
        onu_bias_ma: optical.onu_bias_ma ?? item.onu_bias_ma,
      };
    });
  }

  parsePonOpticalOutput(stdout, command = '') {
    const text = String(stdout || '');
    const ponMatch = text.match(/PON\s+0\/(\d+)\/(\d+)\s+optical ddm/i);
    const commandMatch =
      String(command || '').match(/show\s+epon\s+optical-ddm\s+0\/(\d+)/i) ||
      String(command || '').match(/show\s+epon\s+0\/(\d+)\s+optical-ddm/i);
    const tempMatch = text.match(/Temperature\s*:\s*(-?\d+(?:\.\d+)?)\s*C/i);
    const txMatch = text.match(/TxPower\s*:\s*(-?\d+(?:\.\d+)?)\s*dBm/i);
    const valueC = Number(tempMatch?.[1]);
    if (!Number.isFinite(valueC) || valueC < -80 || valueC > 180) return null;
    const index = ponMatch
      ? `${ponMatch[1]}/${ponMatch[2]}`
      : commandMatch
        ? `0/${commandMatch[1]}`
        : 'pon';
    return {
      index,
      name: index === 'pon' ? 'PON SFP' : `PON ${index} SFP`,
      value_c: Math.round(valueC * 10) / 10,
      tx_power: txMatch ? `${Number(txMatch[1]).toFixed(2)} dBm` : null,
      status: 'ok',
      source: 'cli-hioso',
    };
  }

  parseWebPonStatus(stdout) {
    const body = this.extractJavascriptArrayBody(stdout, 'ponPortStatus');
    if (!body) return null;

    const row = this.parseJavascriptArrayValues(body);
    const ponId = String(row[0] || '').trim();
    const temperature = Number(row[7]);
    if (!ponId || !Number.isFinite(temperature) || temperature < -80 || temperature > 180) {
      return null;
    }

    const voltage = Number(row[8]);
    const bias = Number(row[9]);
    const txPower = Number(row[10]);
    return {
      index: ponId,
      name: `PON ${ponId} Optical Module`,
      value_c: Math.round(temperature * 10) / 10,
      voltage_v: Number.isFinite(voltage) ? voltage : null,
      bias_ma: Number.isFinite(bias) ? bias : null,
      tx_power: Number.isFinite(txPower) ? `${txPower.toFixed(2)} dBm` : null,
      status: 'ok',
      source: 'web-hioso',
    };
  }

  parseWebPonList(stdout) {
    const body = this.extractJavascriptArrayBody(stdout, 'ponListTable');
    if (!body) return [];

    const values = this.parseJavascriptArrayValues(body);
    const ponIds = [];
    for (let index = 0; index + 1 < values.length; index += 2) {
      const ponId = String(values[index] || '').trim();
      if (/^0\/\d+$/.test(ponId)) ponIds.push(ponId);
    }
    return ponIds;
  }

  async readWebPonTemperatures() {
    try {
      const response = await this.fetchWebPath('/oltPonPortStatusPonList.asp');
      if (!response.ok) return [];
      const ponIds = this.parseWebPonList(await response.text());
      const fallbackPonIds = this.isFourPonModel() ? ['0/1', '0/2', '0/3', '0/4'] : ['0/1', '0/2'];
      const targets = ponIds.length ? ponIds : fallbackPonIds;
      const sensors = [];

      for (const ponId of targets) {
        const detail = await this.fetchWebPath(`/oltPonPortStatus.asp?oltponno=${encodeURIComponent(ponId)}`);
        if (!detail.ok) continue;
        const sensor = this.parseWebPonStatus(await detail.text());
        if (sensor) sensors.push(sensor);
      }

      return sensors.sort((a, b) => b.value_c - a.value_c);
    } catch {
      return [];
    }
  }

  buildInventoryItems({ known = [], discovery = [] }) {
    const discoveryMacs = new Set(discovery.map((item) => this.normalizeMacValue(item.mac_address)));
    return known.map((item) => {
      const online = discoveryMacs.has(this.normalizeMacValue(item.mac_address));
      return {
        chassis: 0,
        slot: item.slot,
        pon: item.pon,
        onu_id: item.onu_id,
        sn: item.sn,
        mac_address: item.mac_address,
        vendor: null,
        model: 'Hioso EPON Live',
        status: online ? 'online' : 'offline',
        run_state: online ? 'online' : 'offline',
        down_cause: online ? null : HIOSO_OFFLINE_CAUSE,
        down_cause_label: online ? null : HIOSO_OFFLINE_CAUSE_LABEL,
        down_cause_detail: online
          ? null
          : 'ONU ada di known-links tetapi tidak muncul di discovery-links Hioso.',
        description: '',
        rx_power: null,
        tx_power: null,
        distance: null,
        source: 'live-olt',
      };
    });
  }

  async readInventory() {
    let cliResult=null;
    try{cliResult=await this.readCliInventory();}catch{}
    const webItems = await this.readWebOnuList().catch(()=>[]);
    if(cliResult?.items?.length){
      const key=row=>`${Number(row.slot)}/${Number(row.pon)}:${Number(row.onu_id)}:${this.macAsSn(row.sn||row.mac_address)}`,cliKeys=new Set(cliResult.items.map(key));
      // A partial CLI parser must not hide ONUs that the firmware web table still proves exist.
      if(!webItems.some(row=>!cliKeys.has(key(row)))){
        const web=new Map(webItems.map(row=>[key(row),row]));
        return{...cliResult,items:cliResult.items.map(row=>{const extra=web.get(key(row));if(!extra)return row;const sameState=extra.status===row.status;return{...row,description:row.description||extra.description,model:row.model||extra.model,rx_power:row.rx_power??extra.rx_power,tx_power:row.tx_power??extra.tx_power,...(sameState&&row.status==='offline'?{down_cause:extra.down_cause,down_cause_label:extra.down_cause_label,down_cause_detail:extra.down_cause_detail}:{})};})};
      }
    }
    if (webItems.length) {
      return {
        items: webItems,
        olt_rows: [],
        outputs: [],
        source: 'web-hioso',
      };
    }
    if(cliResult)return cliResult;
    throw new HttpError(502,'Inventory HIOSO belum dapat dibaca melalui Telnet maupun web');
  }

  async readCliInventory() {
    let legacyExecution = null;
    let oltRows = [];
    let items = [];
    if (this.shouldUseLegacyInventory()) {
      const oltIds = this.getInventoryOltIds();
      const linkCommands = oltIds.flatMap((oltId) => [
        `show olt ${oltId} known-links`,
        `show olt ${oltId} discovery-links`,
      ]);
      legacyExecution = await this.executeHiosoCommands([
        'enable',
        'terminal length 0',
        'configure terminal',
        'epon',
        'show olt',
        ...linkCommands,
      ]);

      if (!legacyExecution.success && this.getModelProfile() === 'hioso-2pon') {
        throw new HttpError(
          502,
          this.olt.web_port
            ? legacyExecution.error || legacyExecution.message || 'Web Hioso kosong dan CLI Hioso 2PON gagal'
            : legacyExecution.error || legacyExecution.message || 'Scan ONU live Hioso 2PON gagal'
        );
      }

      if (legacyExecution.success) {
        const outputFor = (command) =>
          legacyExecution.outputs?.find((item) => item.command === command)?.stdout || '';
        const known = oltIds.flatMap((oltId) =>
          this.parseLinkRows(outputFor(`show olt ${oltId} known-links`))
        );
        const discovery = oltIds.flatMap((oltId) =>
          this.parseLinkRows(outputFor(`show olt ${oltId} discovery-links`))
        );
        oltRows = this.parseOltRows(outputFor('show olt'));
        items = this.buildInventoryItems({ known, discovery });
        if (items.length || this.getModelProfile() === 'hioso-2pon') {
          return {
            items,
            olt_rows: oltRows,
            outputs: legacyExecution.outputs || [],
            source: 'cli-hioso',
            web_empty: Boolean(this.olt.web_port),
            model_profile: this.getModelProfile(),
          };
        }
      }
    }

    if (!this.shouldUseHa7304Inventory()) {
      throw new HttpError(502, 'Hioso 2PON belum menemukan ONU dari known-links/discovery-links.');
    }

    const ponNumbers = this.getInventoryPonNumbers();
    const ha7304Commands = ponNumbers.flatMap((pon) => [
      `interface epon 0/${pon}`,
      'show onu info all',
      'show onu optical-ddm all',
      'exit',
    ]);
    const ha7304Execution = await this.executeHiosoCommands([
      'enable',
      'terminal length 0',
      'configure terminal',
      'epon',
      ...ha7304Commands,
    ]);

    if (!ha7304Execution.success) {
      throw new HttpError(
        502,
        this.olt.web_port
          ? ha7304Execution.error || ha7304Execution.message || 'Web Hioso kosong dan fallback CLI HA7304 gagal'
          : ha7304Execution.error || ha7304Execution.message || 'Scan ONU live HA7304 ke Hioso OLT gagal'
      );
    }

    const ha7304Items = this.parseHa7304InventoryOutputs(ha7304Execution.outputs || []);
    if (ha7304Items.length) {
      return {
        items: ha7304Items,
        olt_rows: [],
        outputs: [...(legacyExecution?.outputs || []), ...(ha7304Execution.outputs || [])],
        source: 'cli-hioso-ha7304',
        web_empty: Boolean(this.olt.web_port),
        model_profile: this.getModelProfile(),
      };
    }

    if (!items.length && this.olt.web_port) {
      throw new HttpError(502, 'Web Hioso kosong dan fallback CLI belum menemukan ONU.');
    }
    return {
      items,
      olt_rows: oltRows,
      outputs: [...(legacyExecution?.outputs || []), ...(ha7304Execution.outputs || [])],
      source: 'cli-hioso',
      web_empty: Boolean(this.olt.web_port),
      model_profile: this.getModelProfile(),
    };
  }

  async testConnection() {
    const snmpDetail = await getOltSnmpDetail(this.olt).catch((error) => ({
      status: 'unavailable',
      message: error.message,
    }));

    if (this.olt.web_port) {
      const webItems = await this.readWebOnuList();
      return {
        success: webItems.length > 0 || snmpDetail.status !== 'unavailable',
        message: webItems.length
          ? `Web Hioso ${this.olt.name} terbaca (${webItems.length} ONU)`
          : snmpDetail.status !== 'unavailable'
            ? `SNMP Hioso ${this.olt.name} terbaca, tetapi web ONU belum mengembalikan data`
            : `Web/SNMP Hioso ${this.olt.name} belum terbaca`,
        transport: 'web/snmp',
        summary: webItems.length ? `${webItems.length} ONU dari web Hioso` : '',
        outputs: [],
        snmp_detail: snmpDetail,
      };
    }

    const execution = await this.executeHiosoCommands(
      ['enable', 'terminal length 0', 'show system', 'show version'],
      { allowWrite: false, timeoutMs: 20000 }
    );

    if (!execution.success) {
      return {
        success: false,
        message: execution.error || execution.message || 'Live connection to Hioso OLT failed',
        transport: execution.transport || this.olt.protocol,
        outputs: execution.outputs || [],
        snmp_detail: snmpDetail,
      };
    }

    const systemOutput =
      execution.outputs?.find((item) => item.command === 'show system')?.stdout || '';
    const fields = this.parseSystemOutput(systemOutput);
    return {
      success: true,
      message: `Live connection to Hioso OLT ${this.olt.name} succeeded`,
      transport: execution.transport || this.olt.protocol,
      summary: [
        fields.appversion ? `version ${fields.appversion}` : null,
        fields.chassis ? `chassis ${fields.chassis}` : null,
        fields.sn ? `sn ${fields.sn}` : null,
        fields.cpu_usage ? `cpu ${fields.cpu_usage}` : null,
      ]
        .filter(Boolean)
        .join(' / '),
      outputs: execution.outputs || [],
      snmp_detail: snmpDetail,
    };
  }

  async getUnregisteredOnu() {
    const { items } = await this.readInventory();
    if (!items.length) {
      throw new HttpError(501, 'Scan live Hioso belum menemukan known-links ONU');
    }
    return items;
  }

  async getDashboardStats() {
    const { items } = await this.readInventory();
    if (!items.length) return null;
    const enrichedItems = await this.getBulkOnuDetails(items);
    const offlineOnus = enrichedItems.filter((item) => item.status !== 'online');
    return {
      source: 'live-olt',
      total_onu: enrichedItems.length,
      online: enrichedItems.length - offlineOnus.length,
      offline: offlineOnus.length,
      unregistered: 0,
      offline_onus: offlineOnus,
      registered_onus: enrichedItems,
    };
  }

  async getBulkOnuDetails(items = []) {
    if (items.some((item) => item?.source === 'web-hioso' || item?.detail_source === 'web-hioso')) {
      return items;
    }

    let enrichedItems = items;
    const targets = enrichedItems
      .filter((item) => item?.slot != null && item?.pon != null && item?.onu_id != null)
      .filter((item) => item.status === 'online' || item.status === 'registered')
      .filter((item) => !item.rx_power || !item.tx_power)
      .slice(0, 80);
    if (!targets.length) return items;

    const ha7304Targets = targets
      .map((item) => ({ item, addressInfo: this.parseWebOnuAddress(item?.snmp_onu_index) }))
      .filter(({ item, addressInfo }) =>
        addressInfo &&
        (/^0\/\d+:\d+$/i.test(String(item?.snmp_onu_index || '')) ||
          item?.detail_source === 'cli-hioso-ha7304' ||
          item?.optical_source === 'cli-hioso-ha7304')
      );

    if (ha7304Targets.length) {
      const ha7304Commands = ['enable', 'terminal length 0', 'configure terminal', 'epon'];
      for (const { addressInfo } of ha7304Targets) {
        ha7304Commands.push(
          `interface epon 0/${addressInfo.pon}`,
          `show onu ${addressInfo.onu_id} optical-ddm`,
          'exit'
        );
      }
      const execution = await this.executeHiosoCommands(ha7304Commands, {
        timeoutMs: Math.max(30000, ha7304Targets.length * 2500),
      });
      if (execution.success) {
        const opticalByAddress = new Map();
        let currentPon = null;
        for (const output of execution.outputs || []) {
          const command = String(output.command || '').trim();
          const interfaceMatch = command.match(/^interface\s+epon\s+0\/(\d+)$/i);
          if (interfaceMatch) {
            currentPon = Number(interfaceMatch[1]);
            continue;
          }
          const opticalMatch = command.match(/^show\s+onu\s+(\d+)\s+optical-ddm$/i);
          if (!opticalMatch || !Number.isInteger(currentPon)) continue;
          const optical = this.parseOpticalOutput(output.stdout);
          if (!optical.rx_power && !optical.tx_power) continue;
          opticalByAddress.set(`0/${currentPon}:${Number(opticalMatch[1])}`, {
            ...optical,
            optical_source: 'cli-hioso-ha7304',
          });
        }
        enrichedItems = enrichedItems.map((item) => {
          const optical = opticalByAddress.get(String(item?.snmp_onu_index || '').trim());
          return optical ? this.mergeHa7304InventoryItem(item, optical) : item;
        });
      }
    }

    const legacyTargets = enrichedItems
      .filter((item) => item?.slot != null && item?.pon != null && item?.onu_id != null)
      .filter((item) => item.status === 'online' || item.status === 'registered')
      .filter((item) => !item.rx_power || !item.tx_power)
      .filter((item) => !/^0\/\d+:\d+$/i.test(String(item?.snmp_onu_index || '')))
      .slice(0, 80);
    if (!legacyTargets.length) return enrichedItems;

    const opticalCommands = legacyTargets.map((item) => `show optical-ddm onu ${this.opticalAddress(item)}`);
    const execution = await this.executeHiosoCommands(
      ['enable', 'terminal length 0', 'configure terminal', 'epon', ...opticalCommands],
      { timeoutMs: Math.max(30000, opticalCommands.length * 2500) }
    );
    if (!execution.success) return enrichedItems;

    return this.mergeOpticalInfo(enrichedItems, this.parseOpticalOutputs(execution.outputs || []));
  }

  async getSnmpOpticalInfo(onu) {
    const addressInfo = this.parseWebOnuAddress(onu?.snmp_onu_index);
    const compactAddress = String(onu?.snmp_onu_index || '').trim();
    const useHa7304Command =
      addressInfo &&
      (/^0\/\d+:\d+$/i.test(compactAddress) ||
        onu?.detail_source === 'cli-hioso-ha7304' ||
        onu?.optical_source === 'cli-hioso-ha7304');

    if (useHa7304Command) {
      const command = `show onu ${addressInfo.onu_id} optical-ddm`;
      const execution = await this.executeHiosoCommands(
        [
          'enable',
          'terminal length 0',
          'configure terminal',
          'epon',
          `interface epon 0/${addressInfo.pon}`,
          command,
        ],
        { timeoutMs: 20000 }
      );
      if (!execution.success) return null;
      const output = execution.outputs?.find((item) => item.command === command)?.stdout || '';
      const optical = this.parseOpticalOutput(output);
      if (!optical.rx_power && !optical.tx_power) return null;
      return {
        ...optical,
        optical_source: 'cli-hioso-ha7304',
        snmp_onu_index: addressInfo.address,
      };
    }

    const address = this.opticalAddress(onu);
    const execution = await this.executeHiosoCommands(
      ['enable', 'terminal length 0', 'configure terminal', 'epon', `show optical-ddm onu ${address}`],
      { timeoutMs: 20000 }
    );
    if (!execution.success) return null;
    const output =
      execution.outputs?.find((item) => item.command === `show optical-ddm onu ${address}`)?.stdout ||
      '';
    const optical = this.parseOpticalOutput(output);
    if (!optical.rx_power && !optical.tx_power) return null;
    return {
      ...optical,
      snmp_onu_index: address,
    };
  }

  async getOnuDetail(onu) {
    const optical = await this.getSnmpOpticalInfo(onu);
    return {
      ...onu,
      status: optical?.status || onu.status || 'registered',
      detail_source: optical ? 'live-olt' : 'database',
      rx_power: optical?.rx_power ?? onu.rx_power ?? null,
      tx_power: optical?.tx_power ?? onu.tx_power ?? null,
      optical_source: optical?.optical_source ?? onu.optical_source,
      onu_temperature_c: optical?.onu_temperature_c ?? onu.onu_temperature_c,
      onu_voltage_v: optical?.onu_voltage_v ?? onu.onu_voltage_v,
      onu_bias_ma: optical?.onu_bias_ma ?? onu.onu_bias_ma,
      last_seen: new Date().toISOString(),
      services: {
        internet: false,
        tr069: false,
      },
    };
  }

  async getTemperature() {
    if (this.olt.web_port) {
      const webSensors = await this.readWebPonTemperatures();
      if (webSensors.length) {
        const hottest = webSensors[0];
        return {
          status: 'ok',
          source: 'web-hioso',
          value_c: hottest.value_c,
          label: hottest.name,
          sensors: webSensors,
        };
      }
    }

    const execution = await this.executeHiosoCommands(
      [
        'enable',
        'terminal length 0',
        'configure terminal',
        'epon',
        ...this.getInventoryPonNumbers().flatMap((pon) => [
          `interface epon 0/${pon}`,
          `show epon optical-ddm 0/${pon}`,
          'exit',
        ]),
        'show optical-ddm pon 0/1/1',
        'show optical-ddm pon 0/1/2',
      ],
      { timeoutMs: 25000 }
    );
    if (!execution.success) {
      return {
        status: 'unavailable',
        source: 'cli-hioso',
        message: execution.error || execution.message || 'Suhu Hioso tidak terbaca',
        sensors: [],
      };
    }

    const sensors = (execution.outputs || [])
      .filter((item) => /^show\s+(optical-ddm\s+pon|epon\s+(optical-ddm\s+0\/\d+|0\/\d+\s+optical-ddm))/i.test(item.command || ''))
      .map((item) => this.parsePonOpticalOutput(item.stdout, item.command))
      .filter(Boolean)
      .sort((a, b) => b.value_c - a.value_c);

    if (!sensors.length) {
      return {
        status: 'unavailable',
        source: 'cli-hioso',
        message: 'Output suhu SFP Hioso tidak dikenali',
        sensors: [],
      };
    }

    const hottest = sensors[0];
    return {
      status: 'ok',
      source: 'cli-hioso',
      value_c: hottest.value_c,
      label: hottest.name,
      sensors,
    };
  }

  async saveConfig() {
    return this.executeSaveConfigCommands({
      commands: ['enable', 'write'],
      successMessage: `Save config Hioso OLT ${this.olt.name} selesai`,
    });
  }

  resolveHa7304CliDeleteTarget(onu) {
    const addressInfo = this.parseWebOnuAddress(onu?.snmp_onu_index);
    const compactAddress = String(onu?.snmp_onu_index || '').trim();
    const ponNumber = Number(addressInfo?.pon ?? onu?.pon);
    const looksHa7304 =
      this.isFourPonModel() ||
      ponNumber > 2 ||
      /^0\/\d+:\d+$/i.test(compactAddress) ||
      onu?.detail_source === 'cli-hioso-ha7304' ||
      onu?.optical_source === 'cli-hioso-ha7304';

    if (!looksHa7304) return null;

    const pon = Number(addressInfo?.pon ?? onu?.pon);
    const onuId = Number(addressInfo?.onu_id ?? onu?.onu_id);
    if (!Number.isInteger(pon) || !Number.isInteger(onuId) || pon < 1 || onuId < 1) {
      throw new HttpError(422, 'PON dan ONU ID wajib terisi untuk delete CLI Hioso 4PON');
    }

    return {
      pon,
      onuId,
      address: `0/${pon}:${onuId}`,
    };
  }

  findHa7304OnuRow(rows, target) {
    return rows.find(
      (row) => Number(row.pon) === Number(target.pon) && Number(row.onu_id) === Number(target.onuId)
    ) || null;
  }

  assertHiosoTargetMatches({ onu, row, source }) {
    const expectedSn = this.normalizeSnValue(onu?.sn);
    const actualSn = this.normalizeSnValue(row?.sn);
    if (expectedSn && actualSn && actualSn !== expectedSn) {
      throw new HttpError(409, `ONU target Hioso tidak cocok dari ${source}. Target ${onu.sn}, terbaca ${row.sn}`);
    }
  }

  async readHa7304CliTarget({ onu, target }) {
    const commands = [
      'enable',
      'terminal length 0',
      'configure terminal',
      'epon',
      `interface epon 0/${target.pon}`,
      'show onu info all',
    ];
    const execution = await this.executeHiosoCommands(commands, {
      allowWrite: false,
      timeoutMs: 30000,
    });
    const outputs = execution.outputs || [];
    const failedOutput = this.detectCommandFailure(outputs);
    if (!execution.success || failedOutput) {
      return {
        success: false,
        stage: 'precheck',
        reason:
          execution.error ||
          execution.message ||
          (failedOutput ? `Precheck CLI gagal pada command: ${failedOutput.command}` : 'Precheck CLI Hioso gagal'),
        target,
        outputs,
      };
    }

    const infoOutput = outputs.find((entry) => entry.command === 'show onu info all')?.stdout || '';
    const rows = this.parseHa7304OnuInfoRows(infoOutput);
    if (!rows.length) {
      return {
        success: false,
        stage: 'precheck',
        reason: 'Output show onu info all Hioso 4PON tidak terbaca',
        target,
        outputs,
      };
    }

    const row = this.findHa7304OnuRow(rows, target);
    if (!row) {
      return {
        success: false,
        stage: 'precheck',
        reason: `CLI Hioso tidak menemukan ONU ${target.address}`,
        target,
        outputs,
      };
    }

    this.assertHiosoTargetMatches({ onu, row, source: 'CLI precheck' });
    return {
      success: true,
      stage: 'precheck',
      target,
      row,
      outputs,
    };
  }

  async deleteHa7304OnuViaCli({ onu }) {
    const target = this.resolveHa7304CliDeleteTarget(onu);
    if (!target) {
      return {
        success: false,
        skipped: true,
        stage: 'eligibility',
        reason: 'Delete CLI Hioso hanya diaktifkan untuk Hioso 4PON / HA7304',
        outputs: [],
      };
    }

    const precheck = await this.readHa7304CliTarget({ onu, target });
    if (!precheck.success) {
      return precheck;
    }

    const commands = [
      'enable',
      'terminal length 0',
      'configure terminal',
      'epon',
      `interface epon 0/${target.pon}`,
      `no onu ${target.onuId}`,
      'show onu info all',
      'exit',
      'write',
    ];
    const execution = await this.executeHiosoCommands(commands, {
      allowWrite: true,
      timeoutMs: HIOSO_COMMAND_TIMEOUT_MS,
    });
    const outputs = execution.outputs || [];
    const failedOutput = this.detectCommandFailure(outputs);
    if (!execution.success || failedOutput) {
      return {
        success: false,
        stage: 'delete',
        reason:
          execution.error ||
          execution.message ||
          (failedOutput ? `Delete CLI gagal pada command: ${failedOutput.command}` : 'Delete CLI Hioso gagal'),
        target,
        precheck,
        outputs: [...precheck.outputs, ...outputs],
      };
    }

    const postInfoOutput = [...outputs]
      .reverse()
      .find((entry) => entry.command === 'show onu info all')?.stdout || '';
    const postRows = this.parseHa7304OnuInfoRows(postInfoOutput);
    const remainingRow = this.findHa7304OnuRow(postRows, target);
    if (remainingRow) {
      this.assertHiosoTargetMatches({ onu, row: remainingRow, source: 'CLI verify' });
      return {
        success: false,
        stage: 'verify',
        reason: `CLI Hioso sudah dikirim tetapi ONU ${target.address} masih muncul di show onu info all`,
        target,
        precheck,
        outputs: [...precheck.outputs, ...outputs],
      };
    }

    return {
      success: true,
      stage: 'done',
      message: `Delete ONU ${onu.sn} berhasil lewat CLI Hioso 4PON`,
      target,
      deleted_row: precheck.row,
      outputs: [...precheck.outputs, ...outputs],
    };
  }

  supportsOnuReboot() {
    return true;
  }

  supportsOnuDescriptionUpdate() {
    return true;
  }

  async updateOnuDescription({ onu, description }) {
    const result = await this.submitWebOnuOperation({
      onu,
      name: description,
      operation: 'nonOp',
    });
    return {
      success: true,
      message: `Description ONU ${onu.sn} berhasil dikirim ke web Hioso`,
      live_mode: true,
      transport: 'web-hioso',
      result,
    };
  }

  async rebootOnu({ onu }) {
    const current = await this.readWebOnuConfig(onu).catch(() => null);
    const name =
      current?.raw_name ||
      this.normalizeWebDescription(onu.description) ||
      this.normalizeSnValue(onu.sn) ||
      'ONU';
    const result = await this.submitWebOnuOperation({
      onu,
      name,
      operation: 'rebootOp',
    });
    return {
      success: true,
      message: `Reboot ONU ${onu.sn} berhasil dikirim lewat web Hioso`,
      live_mode: true,
      transport: 'web-hioso',
      result,
    };
  }

  async deleteOnuFromOlt({ onu }) {
    let cliAttempt = null;
    try {
      cliAttempt = await this.deleteHa7304OnuViaCli({ onu });
    } catch (error) {
      if (error?.status === 409) throw error;
      cliAttempt = {
        success: false,
        stage: 'error',
        reason: error.message || 'Delete CLI Hioso gagal',
        outputs: [],
      };
    }

    if (cliAttempt?.success) {
      return {
        success: true,
        message: cliAttempt.message,
        live_mode: true,
        transport: 'cli-hioso-ha7304',
        result: cliAttempt,
      };
    }

    const current = await this.readWebOnuConfig(onu).catch(() => null);
    const expectedSn = this.normalizeSnValue(onu.sn);
    if (current?.sn && this.normalizeSnValue(current.sn) !== expectedSn) {
      throw new HttpError(409, `ONU target Hioso tidak cocok. Target ${onu.sn}, web membaca ${current.sn}`);
    }
    const result = await this.submitWebOnuDelete(onu);
    return {
      success: true,
      message: cliAttempt?.reason
        ? `Delete ONU ${onu.sn} berhasil lewat web Hioso setelah CLI tidak berhasil: ${cliAttempt.reason}`
        : `Delete ONU ${onu.sn} berhasil dikirim lewat web Hioso`,
      live_mode: true,
      transport: cliAttempt ? 'cli-hioso-ha7304+web-hioso' : 'web-hioso',
      result: {
        ...result,
        cli_attempt: cliAttempt,
      },
    };
  }

  supportsOnuDelete() {
    return true;
  }

  getCommandCatalog() {
    this.unsupported('Provisioning live Hioso belum diaktifkan sampai template CLI Hioso tervalidasi penuh');
  }
}
