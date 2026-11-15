import { readOnlyFetch } from '../services/context.js';
import crypto from 'crypto';
import { BaseOltAdapter } from './base.adapter.js';
import { decryptSecret } from '../services/crypto.js';
import { executeOltCommands } from '../services/olt-transport.js';
import { getOltSnmpDetail } from '../services/olt-snmp-detail.js';
import { snmpWalk } from '../services/snmp.js';
import { HttpError } from '../utils/http-error.js';

const HSGQ_EPON_ONU_TABLE_OID = '.1.3.6.1.4.1.50224.3.3.2.1';
const HSGQ_EPON_OPTICAL_TABLE_OID = '.1.3.6.1.4.1.50224.3.3.3.1';
const HSGQ_WEB_TIMEOUT_MS = 8000;
const HSGQ_WEB_LOGIN_TTL_MS = 60000;
const HSGQ_TR069_CTYPE = 1;
const HSGQ_DHCP_IPMODE = 1;
const HSGQ_DEFAULT_MTU = 1500;
const HSGQ_STATIC_IP_DEFAULT_PRIORITY = 0;
const HSGQ_GPON_TR069_IP_INDEX = 0;
const HSGQ_GPON_TR069_PROFILE_ID = 1;

export class HsgqAdapter extends BaseOltAdapter {
  vendorPrefix() {
    return 'HSGQ';
  }

  getVendorPriority() {
    return 5;
  }

  getWebBaseUrl() {
    if (!this.olt?.host) return null;
    const port = Number(this.olt.web_port || 80);
    const authority = port && port !== 80 ? `${this.olt.host}:${port}` : this.olt.host;
    return `http://${authority}`;
  }

  getWebCredentials() {
    let cliPassword = '';
    try {
      cliPassword = decryptSecret(this.olt.password_encrypted);
    } catch {
      cliPassword = '';
    }

    let webPassword = '';
    try {
      webPassword = this.olt.web_password_encrypted
        ? decryptSecret(this.olt.web_password_encrypted)
        : '';
    } catch {
      webPassword = '';
    }

    let username = this.olt.web_username || '';
    let password = webPassword || '';
    return {
      username: username || this.olt.username,
      password: password || cliPassword,
    };
  }

  async fetchWithTimeout(url, options = {}, timeoutMs = HSGQ_WEB_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await readOnlyFetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async loginWeb({ force = false } = {}) {
    if (!force && this.webToken && this.webLoginAt && Date.now() - this.webLoginAt < HSGQ_WEB_LOGIN_TTL_MS) {
      return this.webToken;
    }

    const baseUrl = this.getWebBaseUrl();
    const { username, password } = this.getWebCredentials();
    if (!baseUrl || !username || !password) {
      throw new HttpError(422, 'Username/password Web UI HSGQ belum dikonfigurasi');
    }

    const response = await this.fetchWithTimeout(`${baseUrl}/userlogin?form=login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
      },
      body: JSON.stringify({
        method: 'set',
        param: {
          name: username,
          key: crypto.createHash('md5').update(`${username}:${password}`).digest('hex'),
          value: Buffer.from(password, 'utf8').toString('base64'),
          captcha_v: '',
          captcha_f: '',
        },
      }),
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }

    const token = response.headers.get('x-token');
    if (payload?.code !== 1 || !token) {
      throw new HttpError(502, payload?.message || 'Login Web UI HSGQ gagal');
    }

    this.webToken = token;
    this.webLoginAt = Date.now();
    return token;
  }

  async fetchWebJson(path, options = {}, { retry = true } = {}) {
    const baseUrl = this.getWebBaseUrl();
    if (!baseUrl) throw new HttpError(422, 'Web port HSGQ belum dikonfigurasi');

    const token = await this.loginWeb();
    const response = await this.fetchWithTimeout(new URL(path, baseUrl).toString(), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Token': token,
        Connection: 'close',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new HttpError(502, `Response Web UI HSGQ bukan JSON: ${text.slice(0, 160)}`);
    }

    if (retry && (payload?.code === 0 || payload?.code === -1)) {
      await this.loginWeb({ force: true });
      return this.fetchWebJson(path, options, { retry: false });
    }
    return payload;
  }

  getCommandNotes() {
    return [
      'HSGQ GPON model GPON sudah memakai parser read-only untuk status ONU dan optical.',
      'HSGQ EPON model EPON sudah memakai parser read-only SNMP untuk status ONU dan optical per ONU.',
      'Jangan gunakan profile HSGQ untuk vendor lain.',
    ];
  }

  getProbePresets() {
    return [
      {
        key: 'identity',
        title: 'HSGQ Identity',
        description: 'Read-only probe identitas HSGQ',
        commands: ['show version'],
      },
      {
        key: 'pon-discovery',
        title: 'HSGQ ONU Discovery',
        description: 'Read-only discovery HSGQ GPON/EPON yang tervalidasi di model GPON dan PESUT',
        commands: ['enable', 'configure', 'show ont-autofind', 'show ont-info all', 'show onu-info all'],
      },
      {
        key: 'onu-status',
        title: 'HSGQ ONU Status',
        description: 'Read-only status HSGQ GPON/EPON dan optical GPON',
        commands: ['enable', 'configure', 'show ont-info all', 'show onu-info all', 'show ont-optical all'],
      },
    ];
  }

  normalizeSnValue(sn) {
    return String(sn || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  isDefaultOnuLabel(value) {
    return /^ON[UT]\d{1,3}\/\d{1,3}$/i.test(String(value || '').trim());
  }

  normalizeHsgqDescription(...values) {
    for (const value of values) {
      const description = String(value || '').trim();
      if (
        !description ||
        this.isDefaultOnuLabel(description) ||
        ['NA', 'N/A', 'NULL', 'NONE', '-', 'NO-DESCRIPTI', 'NO-DESCRIPTION'].includes(description.toUpperCase())
      ) {
        continue;
      }
      return description;
    }
    return '';
  }

  getOntKey(onu) {
    return [0, onu?.pon, onu?.onu_id].map((value) => String(value ?? '')).join(':');
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

  isMacIdentifier(value) {
    return /^[0-9a-f]{12}$/i.test(this.normalizeMacValue(value));
  }

  isEponOnu(onu) {
    return /epon/i.test(String(onu?.model || '')) || this.isMacIdentifier(onu?.sn || onu?.mac_address);
  }

  decodeHexBytes(value) {
    return String(value || '')
      .trim()
      .split(/\s+/)
      .map((part) => Number.parseInt(part, 16))
      .filter((part) => Number.isInteger(part));
  }

  readSnmpEntryValue(entry) {
    const rawValue = String(entry?.value || '').replace(/^"|"$/g, '').trim();
    if (!/hex-string/i.test(String(entry?.type || ''))) return rawValue;

    const bytes = this.decodeHexBytes(rawValue);
    if (bytes.length === 6) {
      return bytes.map((part) => part.toString(16).padStart(2, '0')).join(':');
    }

    const text = String.fromCharCode(...bytes).replace(/\0+$/g, '').trim();
    return /^[\x20-\x7e]+$/.test(text) && text ? text : rawValue;
  }

  parseSnmpOnuAddress(value, fallbackIndex) {
    const nameMatch = String(value || '').match(/ONU(\d+)\/(\d+)/i);
    if (nameMatch) {
      return {
        pon: Number(nameMatch[1]),
        onuId: Number(nameMatch[2]),
      };
    }

    const index = Number(fallbackIndex);
    if (!Number.isFinite(index)) return { pon: null, onuId: null };
    const pon = Math.floor((index - 0x01000000) / 256);
    const onuId = index - 0x01000000 - pon * 256;
    return {
      pon: pon > 0 ? pon : null,
      onuId: onuId > 0 ? onuId : null,
    };
  }

  buildEponOnuSnmpIndex(onu) {
    const existing = Number(onu?.snmp_onu_index);
    if (Number.isFinite(existing) && existing > 0) return existing;

    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(pon) || !Number.isInteger(onuId) || pon <= 0 || onuId <= 0) {
      return null;
    }
    return 0x01000000 + pon * 256 + onuId;
  }

  parseSnmpScaledNumber(value, scale = 100) {
    const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
    const number = match ? Number(match[0]) : Number.NaN;
    if (!Number.isFinite(number) || number <= -2147480000) return null;
    return Number((number / scale).toFixed(2));
  }

  formatSnmpScaledDbm(value) {
    const number = this.parseSnmpScaledNumber(value, 100);
    if (number == null) return null;
    return `${number.toFixed(2)} dBm`;
  }

  parseSnmpEponOnuTable(values) {
    const rows = new Map();
    for (const [oid, entry] of values?.entries?.() || []) {
      if (!oid.startsWith(`${HSGQ_EPON_ONU_TABLE_OID}.`)) continue;
      const suffix = oid.slice(HSGQ_EPON_ONU_TABLE_OID.length + 1);
      const [column, ...indexParts] = suffix.split('.');
      const index = indexParts.join('.');
      if (!column || !index) continue;
      const row = rows.get(index) || {};
      row[column] = this.readSnmpEntryValue(entry);
      rows.set(index, row);
    }

    return [...rows.entries()]
      .map(([index, row]) => {
        const address = this.parseSnmpOnuAddress(row[2], index);
        const snmpOnuIndex = Number(index.split('.')[0]);
        const macAddress = this.formatMacAddress(row[7]);
        if (!macAddress || !address.pon || !address.onuId) return null;

        const status = Number(row[8]) === 1 || Number(row[9]) === 1 ? 'online' : 'offline';
        const distance = Number(row[15]);
        const vendor = row[25] || row[32] || null;
        const model = [vendor, row[26] || row[27] || row[12]].filter(Boolean).join(' ') || 'HSGQ EPON Live';

        return {
          chassis: 0,
          slot: 0,
          pon: address.pon,
          onu_id: address.onuId,
          sn: this.normalizeSnValue(macAddress),
          mac_address: macAddress,
          vendor,
          model,
          status,
          control_flag: row[8] || null,
          run_state: status,
          config_state: row[9] || null,
          match_state: null,
          down_cause: status === 'offline' ? 'offline' : null,
          down_cause_label: status === 'offline' ? 'offline' : null,
          description: this.normalizeHsgqDescription(row[11], row[23], row[24], row[28]),
          rx_power: null,
          tx_power: null,
          snmp_onu_index: Number.isFinite(snmpOnuIndex) ? snmpOnuIndex : null,
          distance: Number.isFinite(distance) && distance > 0 ? `${distance} m` : null,
          onu_hardware_version: row[12] || row[27] || null,
          onu_software_version: row[13] || row[14] || null,
          ip_address: row[4] && row[4] !== '0.0.0.0' ? row[4] : null,
          ip_netmask: row[5] && row[5] !== '0.0.0.0' ? row[5] : null,
          ip_gateway: row[6] && row[6] !== '0.0.0.0' ? row[6] : null,
          detail_source: 'snmp-hsgq-epon',
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.pon - b.pon || a.onu_id - b.onu_id);
  }

  parseSnmpEponOpticalTable(values) {
    const rows = new Map();
    for (const [oid, entry] of values?.entries?.() || []) {
      if (!oid.startsWith(`${HSGQ_EPON_OPTICAL_TABLE_OID}.`)) continue;
      const suffix = oid.slice(HSGQ_EPON_OPTICAL_TABLE_OID.length + 1);
      const [column, indexValue] = suffix.split('.');
      const index = Number(indexValue);
      if (!column || !Number.isFinite(index)) continue;
      const row = rows.get(index) || {};
      row[column] = this.readSnmpEntryValue(entry);
      rows.set(index, row);
    }

    const byIndex = new Map();
    for (const [index, row] of rows.entries()) {
      const rxPower = this.formatSnmpScaledDbm(row[4]);
      const txPower = this.formatSnmpScaledDbm(row[5]);
      if (!rxPower && !txPower) continue;

      byIndex.set(index, {
        snmp_onu_index: index,
        rx_power: rxPower,
        tx_power: txPower,
        temperature_c: this.parseSnmpScaledNumber(row[8], 100),
        voltage_v: this.parseSnmpScaledNumber(row[7], 100),
        bias_ma: this.parseSnmpScaledNumber(row[6], 100),
        optical_source: 'snmp-hsgq-epon',
      });
    }
    return byIndex;
  }

  mergeSnmpEponOpticalInfo(items = [], opticalMap = new Map()) {
    if (!opticalMap?.size) return items;
    return items.map((item) => {
      const index = this.buildEponOnuSnmpIndex(item);
      const optical = index ? opticalMap.get(index) : null;
      if (!optical) return item;
      return {
        ...item,
        rx_power: optical.rx_power || item.rx_power,
        tx_power: optical.tx_power || item.tx_power,
        optical_source: optical.optical_source,
        snmp_onu_index: optical.snmp_onu_index || item.snmp_onu_index,
        onu_temperature_c: optical.temperature_c,
        onu_voltage_v: optical.voltage_v,
        onu_bias_ma: optical.bias_ma,
      };
    });
  }

  async getSnmpEponOpticalMap() {
    if (!this.snmpEponOpticalMapPromise) {
      this.snmpEponOpticalMapPromise = snmpWalk({
        olt: this.olt,
        oid: HSGQ_EPON_OPTICAL_TABLE_OID,
        timeoutMs: 12000,
        maxBuffer: 4 * 1024 * 1024,
      }).then((values) => this.parseSnmpEponOpticalTable(values));
    }
    return this.snmpEponOpticalMapPromise;
  }

  async getSnmpEponOnuItems() {
    const values = await snmpWalk({
      olt: this.olt,
      oid: HSGQ_EPON_ONU_TABLE_OID,
      timeoutMs: 12000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const items = this.parseSnmpEponOnuTable(values);
    if (!items.length) return items;
    const opticalMap = await this.getSnmpEponOpticalMap().catch(() => null);
    return this.mergeSnmpEponOpticalInfo(items, opticalMap);
  }

  async getSnmpEponOnuDetail(onu) {
    const items = await this.getSnmpEponOnuItems();
    const normalizedSn = this.normalizeSnValue(onu?.sn || onu?.mac_address);
    return (
      items.find((item) => normalizedSn && this.normalizeSnValue(item.sn) === normalizedSn) ||
      items.find(
        (item) =>
          Number(item.pon) === Number(onu?.pon) &&
          Number(item.onu_id) === Number(onu?.onu_id)
      ) ||
      null
    );
  }

  buildDashboardStatsFromItems(items = [], source = 'live-olt') {
    const offlineOnus = items.filter((item) => item.status === 'offline');
    return {
      source,
      total_onu: items.length,
      online: items.filter((item) => item.status === 'online').length,
      offline: offlineOnus.length,
      unregistered: 0,
      offline_onus: offlineOnus,
      registered_onus: items.map((item) => ({
        ...item,
        source,
        detail_source: source,
      })),
    };
  }

  async detectTechnology() {
    if (!this.technologyPromise) {
      this.technologyPromise = getOltSnmpDetail(this.olt)
        .then((detail) => {
          const vendor = String(this.olt?.vendor || '');
          if (/HSGQ[\s_-]*G/i.test(vendor)) return 'gpon';
          if (/HSGQ[\s_-]*E/i.test(vendor)) return 'epon';

          const text = [detail?.sys_descr, detail?.sys_name, this.olt?.name]
            .filter(Boolean)
            .join(' ');
          if (/HSGQ[\s_-]*G|G01|GPON/i.test(text)) return 'gpon';
          if (/HSGQ[\s_-]*E|E04|EPON/i.test(text)) return 'epon';
          return null;
        })
        .catch(() => null);
    }
    return this.technologyPromise;
  }

  getStatusCommands(technology) {
    if (technology === 'gpon') return ['enable', 'configure', 'show ont-info all'];
    if (technology === 'epon') return ['enable', 'configure', 'show onu-info all'];
    return ['enable', 'configure', 'show ont-info all', 'show onu-info all'];
  }

  getDiscoveryCommands(technology) {
    if (technology === 'gpon') return ['enable', 'configure', 'show ont-autofind', 'show ont-info all'];
    if (technology === 'epon') return ['enable', 'configure', 'show onu-info all'];
    return ['enable', 'configure', 'show ont-autofind', 'show ont-info all', 'show onu-info all'];
  }

  readDetailField(stdout, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(stdout || '').match(new RegExp(`^\\s*${escaped}\\s*:[ \\t]*([^\\r\\n]*)`, 'im'));
    return match?.[1]?.trim() || null;
  }

  formatDbm(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return `${number.toFixed(2)} dBm`;
  }

  normalizeDownCause(value) {
    const cause = String(value || '').trim();
    if (!cause || cause === '-') return '-';
    if (/dying\s*gasp|dyinggasp|power|mati listrik|listrik/i.test(cause)) return 'POWER OFF';
    if (/(^|[^a-z0-9])(loss|los)([^a-z0-9]|$)|laser\s*out|fiber|signal|lofi|loami/i.test(cause)) return 'LOS';
    return cause;
  }

  parseOntInfoSummary(stdout) {
    const match = String(stdout || '').match(/Total:\s*(\d+)\s+Online:\s*(\d+)\s+Offline:\s*(\d+)/i);
    if (!match) return null;
    return {
      total_onu: Number(match[1]),
      online: Number(match[2]),
      offline: Number(match[3]),
      unregistered: 0,
    };
  }

  parseOntInfoTable(stdout) {
    const items = [];
    for (const rawLine of String(stdout || '').split('\n')) {
      const line = rawLine.trimEnd();
      const match = line.match(
        /^\s*(\d+)\/(\d+)\s+([A-Z0-9]+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s{2,}(.*)$/i
      );
      if (!match) continue;

      const pon = Number(match[1]);
      const onuId = Number(match[2]);
      const sn = match[3].toUpperCase();
      const state = match[4];
      const runState = match[5];
      const status =
        /^online$/i.test(runState) && !/^inactive$/i.test(state) ? 'online' : 'offline';
      const rest = String(match[8] || '').trim();
      const restParts = rest.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
      const causeCandidate = restParts[0] || '';
      const looksLikeDownCause =
        /^(offline|los|loss)$/i.test(causeCandidate) ||
        /dying\s*gasp|dyinggasp|power|laser\s*out|fiber|signal|lofi|loami/i.test(causeCandidate);
      const hasDownCause = status === 'offline' && (restParts.length > 1 || looksLikeDownCause);
      const downCause = hasDownCause ? restParts[0] : null;
      const description = status === 'offline'
        ? (hasDownCause ? restParts.slice(1).join(' ') : rest)
        : rest;

      items.push({
        chassis: 0,
        slot: 0,
        pon,
        onu_id: onuId,
        sn,
        vendor: sn.slice(0, 4),
        model: 'HSGQ GPON Live',
        status,
        control_flag: state,
        run_state: runState,
        config_state: match[6],
        match_state: match[7],
        down_cause: downCause,
        down_cause_label: downCause ? this.normalizeDownCause(downCause) : null,
        description: description || '',
        rx_power: null,
        tx_power: null,
        distance: null,
      });
    }
    return items;
  }

  parseOntInfoDetail(stdout) {
    const text = String(stdout || '');
    const snValue = this.readDetailField(text, 'SerialNumber');
    if (!snValue) return null;

    const pon = Number(this.readDetailField(text, 'PON ID'));
    const onuId = Number(this.readDetailField(text, 'ONU ID'));
    const runState = this.readDetailField(text, 'Run State');
    const status = String(runState || '').toLowerCase() === 'online' ? 'online' : 'offline';
    const distance = this.readDetailField(text, 'Distance');
    const downCause = this.readDetailField(text, 'Last down cause');
    const lineProfileId = this.readDetailField(text, 'Line Profile ID');
    const lineProfileName = this.readDetailField(text, 'Line Profile Name');
    const serviceProfileId = this.readDetailField(text, 'Srv Profile ID');
    const serviceProfileName = this.readDetailField(text, 'Srv Profile Name');
    const onuName = this.readDetailField(text, 'ONU Name');
    const ontDescription = this.readDetailField(text, 'Ont Description');

    return {
      chassis: 0,
      slot: 0,
      pon: Number.isFinite(pon) ? pon : null,
      onu_id: Number.isFinite(onuId) ? onuId : null,
      sn: snValue.toUpperCase(),
      vendor: snValue.slice(0, 4).toUpperCase(),
      model: 'HSGQ GPON Live',
      status,
      control_flag: this.readDetailField(text, 'State'),
      run_state: runState,
      config_state: this.readDetailField(text, 'Config State'),
      match_state: this.readDetailField(text, 'Match State'),
      distance: distance && distance !== '-' ? `${distance} m` : null,
      description: this.normalizeHsgqDescription(ontDescription, onuName),
      down_cause: downCause || null,
      down_cause_label: this.normalizeDownCause(downCause),
      last_up_time: this.readDetailField(text, 'Last up Time'),
      last_down_time: this.readDetailField(text, 'Last down Time'),
      last_dying_gasp: this.readDetailField(text, 'Last DyingGasp Time'),
      online_time: this.readDetailField(text, 'Ont uptime'),
      line_profile: [lineProfileId, lineProfileName].filter(Boolean).join(' / ') || null,
      service_profile: [serviceProfileId, serviceProfileName].filter(Boolean).join(' / ') || null,
      manage_vlan: null,
      rx_power: null,
      tx_power: null,
    };
  }

  parseEponOnuInfoSummary(stdout) {
    const match = String(stdout || '').match(/Total:\s*(\d+)\s+Online:\s*(\d+)\s+Offline:\s*(\d+)/i);
    if (!match) return null;
    return {
      total_onu: Number(match[1]),
      online: Number(match[2]),
      offline: Number(match[3]),
      unregistered: 0,
    };
  }

  parseEponOnuInfoTable(stdout) {
    const items = [];
    for (const rawLine of String(stdout || '').split('\n')) {
      const line = rawLine.trimEnd();
      const match = line.match(
        /^\s*(\d+)\/(\d+)\s+([0-9a-f:]{17})\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+?)\s{2,}(.+?)\s*$/i
      );
      if (!match) continue;

      const pon = Number(match[1]);
      const onuId = Number(match[2]);
      const macAddress = this.formatMacAddress(match[3]);
      if (!macAddress) continue;
      const runState = match[4];
      const status = String(runState || '').toLowerCase() === 'online' ? 'online' : 'offline';
      const onuName = String(match[8] || '').trim();
      const onuDescription = String(match[9] || '').trim();
      const downCause = status === 'offline' ? runState || 'offline' : null;

      items.push({
        chassis: 0,
        slot: 0,
        pon,
        onu_id: onuId,
        sn: this.normalizeSnValue(macAddress),
        mac_address: macAddress,
        vendor: null,
        model: 'HSGQ EPON Live',
        status,
        control_flag: match[5],
        run_state: runState,
        config_state: match[6],
        match_state: null,
        down_cause: downCause,
        down_cause_label: this.normalizeDownCause(downCause),
        description: onuName || (onuDescription === 'NO-DESCRIPTI' ? '' : onuDescription),
        rx_power: null,
        tx_power: null,
        distance: null,
        last_up_time: status === 'online' ? match[7] : null,
      });
    }
    return items;
  }

  parseEponOnuInfoDetail(stdout) {
    const text = String(stdout || '');
    const macAddress = this.formatMacAddress(this.readDetailField(text, 'Mac address'));
    if (!macAddress) return null;

    const pon = Number(this.readDetailField(text, 'PON ID'));
    const onuId = Number(this.readDetailField(text, 'ONU ID'));
    const runState = this.readDetailField(text, 'Status');
    const status = String(runState || '').toLowerCase() === 'online' ? 'online' : 'offline';
    const distance = this.readDetailField(text, 'ONU Distance(m)');
    const onuName = this.readDetailField(text, 'ONU Name');
    const onuDescription = this.readDetailField(text, 'ONU description');
    const vendor = this.readDetailField(text, 'ONU vendor');
    const model = this.readDetailField(text, 'ONU model');
    const softwareVersion = this.readDetailField(text, 'ONU Software version');
    const hardwareVersion = this.readDetailField(text, 'ONU Hardware version');
    const downCause = status === 'offline' ? runState || 'offline' : null;

    return {
      chassis: 0,
      slot: 0,
      pon: Number.isFinite(pon) ? pon : null,
      onu_id: Number.isFinite(onuId) ? onuId : null,
      sn: this.normalizeSnValue(macAddress),
      mac_address: macAddress,
      vendor: vendor || null,
      model: [vendor, model].filter(Boolean).join(' ') || 'HSGQ EPON Live',
      status,
      control_flag: this.readDetailField(text, 'Authrize state'),
      run_state: runState,
      config_state: this.readDetailField(text, 'Authrize mode'),
      match_state: null,
      distance: distance && distance !== '-' ? `${distance} m` : null,
      description: this.normalizeHsgqDescription(onuDescription, onuName),
      down_cause: downCause,
      down_cause_label: this.normalizeDownCause(downCause),
      online_time: null,
      line_profile: null,
      service_profile: null,
      manage_vlan: null,
      rx_power: null,
      tx_power: null,
      onu_software_version: softwareVersion || null,
      onu_hardware_version: hardwareVersion || null,
    };
  }

  parseOntOpticalTable(stdout) {
    const bySn = new Map();
    const byAddress = new Map();
    for (const rawLine of String(stdout || '').split('\n')) {
      const line = rawLine.trim();
      const match = line.match(
        /^(\d+)\/(\d+)\s+([A-Z0-9]+)\s+(-?\d+(?:\.\d+)?)\s+C\s+(-?\d+(?:\.\d+)?)\s+V\s+(-?\d+(?:\.\d+)?)\s+mA\s+(-?\d+(?:\.\d+)?)\s+dBm\s+(-?\d+(?:\.\d+)?)\s+dBm\s*(.*)$/i
      );
      if (!match) continue;

      const pon = Number(match[1]);
      const onuId = Number(match[2]);
      const sn = match[3].toUpperCase();
      const item = {
        slot: 0,
        pon,
        onu_id: onuId,
        sn,
        rx_power: this.formatDbm(match[8]),
        tx_power: this.formatDbm(match[7]),
        temperature_c: Number(match[4]),
        voltage_v: Number(match[5]),
        bias_ma: Number(match[6]),
        optical_source: 'cli-hsgq-gpon',
        description: String(match[9] || '').trim(),
      };
      bySn.set(this.normalizeSnValue(sn), item);
      byAddress.set(this.getOntKey(item), item);
    }
    return { bySn, byAddress };
  }

  mergeOpticalInfo(items = [], opticalMap) {
    if (!opticalMap) return items;
    return items.map((item) => {
      const optical =
        opticalMap.bySn.get(this.normalizeSnValue(item.sn)) ||
        opticalMap.byAddress.get(this.getOntKey(item));
      if (!optical) return item;
      return {
        ...item,
        rx_power: optical.rx_power || item.rx_power,
        tx_power: optical.tx_power || item.tx_power,
        optical_source: optical.optical_source,
        onu_temperature_c: optical.temperature_c,
        onu_voltage_v: optical.voltage_v,
        onu_bias_ma: optical.bias_ma,
        description: item.description || optical.description || '',
      };
    });
  }

  async getOpticalMap() {
    if (!this.opticalMapPromise) {
      const password = decryptSecret(this.olt.password_encrypted);
      this.opticalMapPromise = executeOltCommands({
        olt: this.olt,
        password,
        commands: ['enable', 'configure', 'show ont-optical all'],
        allowWrite: false,
        timeoutMs: 30000,
      }).then((execution) => {
        if (!execution.success) return null;
        const stdout =
          execution.outputs?.find((item) => item.command === 'show ont-optical all')?.stdout || '';
        const opticalMap = this.parseOntOpticalTable(stdout);
        return opticalMap.bySn.size || opticalMap.byAddress.size ? opticalMap : null;
      });
    }
    return this.opticalMapPromise;
  }

  async getSnmpOpticalInfo(onu) {
    if (this.isEponOnu(onu)) {
      const index = this.buildEponOnuSnmpIndex(onu);
      if (!index) return null;
      const opticalMap = await this.getSnmpEponOpticalMap();
      const optical = opticalMap?.get(index);
      if (!optical) return null;
      return {
        rx_power: optical.rx_power,
        tx_power: optical.tx_power,
        optical_source: optical.optical_source,
        snmp_onu_index: optical.snmp_onu_index,
        onu_temperature_c: optical.temperature_c,
        onu_voltage_v: optical.voltage_v,
        onu_bias_ma: optical.bias_ma,
      };
    }

    const opticalMap = await this.getOpticalMap();
    if (!opticalMap) return null;
    const optical =
      opticalMap.bySn.get(this.normalizeSnValue(onu?.sn)) ||
      opticalMap.byAddress.get(this.getOntKey(onu));
    if (!optical) return null;
    return {
      rx_power: optical.rx_power,
      tx_power: optical.tx_power,
      optical_source: optical.optical_source,
      onu_temperature_c: optical.temperature_c,
      onu_voltage_v: optical.voltage_v,
      onu_bias_ma: optical.bias_ma,
    };
  }

  async testConnection() {
    const snmpDetail = await getOltSnmpDetail(this.olt);
    if (snmpDetail?.status === 'ok') {
      return {
        success: true,
        message: `SNMP connection to HSGQ OLT ${this.olt.name} succeeded`,
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

    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['show version'],
      allowWrite: false,
    });

    if (!execution.success) {
      return {
        success: false,
        message: execution.error || execution.message || 'Live connection to HSGQ OLT failed',
        transport: execution.transport || this.olt.protocol,
        outputs: execution.outputs || [],
        snmp_detail: snmpDetail,
      };
    }

    const summary =
      execution.outputs?.find((item) => item.command === 'show version')?.stdout || '';

    return {
      success: true,
      message: `Live connection to HSGQ OLT ${this.olt.name} succeeded`,
      transport: execution.transport || this.olt.protocol,
      summary,
      outputs: execution.outputs || [],
      snmp_detail: snmpDetail,
    };
  }

  async getDashboardStats() {
    const password = decryptSecret(this.olt.password_encrypted);
    const technology = await this.detectTechnology();
    if (technology === 'epon') {
      const snmpItems = await this.getSnmpEponOnuItems();
      if (snmpItems.length) {
        return this.buildDashboardStatsFromItems(snmpItems, 'snmp-hsgq-epon');
      }
    }

    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: this.getStatusCommands(technology),
      allowWrite: false,
      timeoutMs: technology === 'epon' ? 60000 : 30000,
    });

    if (!execution.success) {
      return null;
    }

    const stdout =
      execution.outputs?.find((item) => item.command === 'show ont-info all')?.stdout || '';
    const eponStdout =
      execution.outputs?.find((item) => item.command === 'show onu-info all')?.stdout || '';
    const items = this.parseOntInfoTable(stdout);
    const eponItems = items.length ? [] : this.parseEponOnuInfoTable(eponStdout);
    const liveItems = items.length ? items : eponItems;
    if (!liveItems.length) return null;

    const summary = items.length
      ? this.parseOntInfoSummary(stdout) || {}
      : this.parseEponOnuInfoSummary(eponStdout) || {};

    return {
      ...this.buildDashboardStatsFromItems(liveItems, 'live-olt'),
      total_onu: summary.total_onu ?? liveItems.length,
      online: summary.online ?? liveItems.filter((item) => item.status === 'online').length,
      offline: summary.offline ?? liveItems.filter((item) => item.status === 'offline').length,
      unregistered: summary.unregistered ?? 0,
    };
  }

  parseAutofindOutput(stdout) {
    if (/do not exist|no ont|not exist/i.test(String(stdout || ''))) return [];
    const items = [];
    for (const rawLine of String(stdout || '').split('\n')) {
      const line = rawLine.trim();
      const match = line.match(/^(\d+)\/(\d+)?\s+([A-Z0-9]{8,})\b/i);
      if (!match) continue;
      const sn = match[3].toUpperCase();
      items.push({
        chassis: 0,
        slot: 0,
        pon: Number(match[1]),
        onu_id: match[2] == null ? null : Number(match[2]),
        sn,
        vendor: sn.slice(0, 4),
        model: 'HSGQ GPON Autofind',
        status: 'unregistered',
        rx_power: null,
        tx_power: null,
        distance: null,
      });
    }
    return items;
  }

  async getUnregisteredOnu() {
    const password = decryptSecret(this.olt.password_encrypted);
    const technology = await this.detectTechnology();
    if (technology === 'epon') {
      const snmpItems = await this.getSnmpEponOnuItems();
      if (snmpItems.length) return snmpItems;
    }

    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: this.getDiscoveryCommands(technology),
      allowWrite: false,
      timeoutMs: technology === 'epon' ? 60000 : 30000,
    });

    if (!execution.success) {
      throw new HttpError(
        502,
        execution.error || execution.message || 'Scan ONU live ke HSGQ OLT gagal'
      );
    }

    const autofindOutput =
      execution.outputs?.find((item) => item.command === 'show ont-autofind')?.stdout || '';
    const discovered = this.parseAutofindOutput(autofindOutput);
    if (discovered.length) return discovered;

    const infoOutput =
      execution.outputs?.find((item) => item.command === 'show ont-info all')?.stdout || '';
    const items = this.parseOntInfoTable(infoOutput);
    if (items.length) return items;

    const eponInfoOutput =
      execution.outputs?.find((item) => item.command === 'show onu-info all')?.stdout || '';
    const eponItems = this.parseEponOnuInfoTable(eponInfoOutput);
    if (!eponItems.length) {
      throw new HttpError(501, 'Scan live HSGQ belum menemukan output GPON/EPON yang tervalidasi');
    }
    return eponItems;
  }

  buildLiveSnSearchCommands(sn) {
    if (this.isMacIdentifier(sn)) {
      const macAddress = this.formatMacAddress(sn);
      return ['enable', 'configure', `show onu-info mac ${macAddress}`];
    }
    return ['enable', 'configure', `show ont-info sn ${this.normalizeSnValue(sn)}`, 'show ont-optical all'];
  }

  buildLiveDetailCommands(onu) {
    if (this.isEponOnu(onu)) {
      const macAddress = this.formatMacAddress(onu?.mac_address || onu?.sn);
      if (macAddress) return ['enable', 'configure', `show onu-info mac ${macAddress}`];
    }

    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (Number.isInteger(pon) && Number.isInteger(onuId)) {
      return ['enable', 'configure', `show ont-info ${pon} ${onuId}`, 'show ont-optical all'];
    }
    return this.buildLiveSnSearchCommands(onu?.sn);
  }

  parseLiveSnSearchResult(criteria, outputs = []) {
    const stdout = outputs.map((item) => item.stdout || '').join('\n');
    const opticalMap = this.parseOntOpticalTable(stdout);
    const detail = this.parseOntInfoDetail(stdout) || this.parseEponOnuInfoDetail(stdout);
    const tableItems = [
      ...this.parseOntInfoTable(stdout),
      ...this.parseEponOnuInfoTable(stdout),
    ];
    const items = detail ? [detail, ...tableItems] : tableItems;
    const snFilter = this.normalizeSnValue(criteria?.sn);
    const filtered = snFilter
      ? items.filter((item) => this.normalizeSnValue(item.sn).includes(snFilter))
      : items;

    const uniqueMap = new Map();
    for (const item of filtered) {
      const key = this.normalizeSnValue(item.sn) || this.getOntKey(item);
      if (!uniqueMap.has(key)) uniqueMap.set(key, item);
    }
    const uniqueItems = Array.from(uniqueMap.values());
    return this.mergeOpticalInfo(uniqueItems, opticalMap);
  }

  async getBulkOnuDetails(items = []) {
    const needsEponOptical = items.some(
      (item) => this.isEponOnu(item) && item.status === 'online' && (!item.rx_power || !item.tx_power)
    );
    let output = items;
    if (needsEponOptical) {
      const opticalMap = await this.getSnmpEponOpticalMap();
      output = this.mergeSnmpEponOpticalInfo(output, opticalMap);
    }

    const needsOptical = output.some((item) => !this.isEponOnu(item) && item.status === 'online' && (!item.rx_power || !item.tx_power));
    if (!needsOptical) return output;
    const opticalMap = await this.getOpticalMap();
    return this.mergeOpticalInfo(output, opticalMap);
  }

  async getOnuDetail(onu) {
    if (this.isEponOnu(onu)) {
      const snmpDetail = await this.getSnmpEponOnuDetail(onu);
      if (snmpDetail) {
        return {
          ...onu,
          ...snmpDetail,
          id: onu.id,
          olt_id: onu.olt_id,
          olt_name: onu.olt_name,
          olt_vendor: onu.olt_vendor,
          discovered_at: onu.discovered_at,
          last_seen: new Date().toISOString(),
          services: {
            internet: false,
            tr069: false,
          },
        };
      }
    }

    const detail = await super.getOnuDetail(onu);
    if (this.isEponOnu(detail)) return detail;
    const optical = await this.getSnmpOpticalInfo(detail);
    if (!optical) return detail;

    return {
      ...detail,
      rx_power: optical.rx_power ?? detail.rx_power,
      tx_power: optical.tx_power ?? detail.tx_power,
      optical_source: optical.optical_source,
      onu_temperature_c: optical.onu_temperature_c,
      onu_voltage_v: optical.onu_voltage_v,
      onu_bias_ma: optical.onu_bias_ma,
    };
  }

  getEponWebAddress(onu, actionLabel = 'TR069 HSGQ') {
    const portId = Number(onu?.web_portid ?? onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(portId) || portId < 1 || !Number.isInteger(onuId) || onuId < 1) {
      throw new HttpError(422, `PON dan ONU ID wajib terisi untuk ${actionLabel}`);
    }
    return { portId, onuId };
  }

  getGponOntAddress(onu, actionLabel = 'action HSGQ GPON') {
    if (this.isEponOnu(onu)) {
      throw new HttpError(501, `${actionLabel} live baru divalidasi untuk HSGQ GPON`);
    }

    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(pon) || pon < 1 || pon > 16 || !Number.isInteger(onuId) || onuId < 0 || onuId > 127) {
      throw new HttpError(422, `PON dan ONU ID wajib valid untuk ${actionLabel}`);
    }

    return { pon, onuId };
  }

  async executeGponOntAction({ onu, action, commands, successMessage, timeoutMs = 60000 }) {
    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite: true,
      timeoutMs,
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

  supportsOnuReboot() {
    return true;
  }

  async rebootOnu({ onu }) {
    const { pon, onuId } = this.getGponOntAddress(onu, 'reboot ONU HSGQ GPON');
    const commands = [
      'enable',
      'configure',
      `interface gpon ${pon}`,
      `ont reboot ${onuId}`,
      'exit',
    ];
    return this.executeGponOntAction({
      onu,
      action: 'Reboot ONU HSGQ GPON',
      commands,
      successMessage: `Reboot ONU HSGQ GPON dikirim untuk ${onu.sn}`,
    });
  }

  async deleteOnuFromOlt({ onu }) {
    const { pon, onuId } = this.getGponOntAddress(onu, 'delete ONU HSGQ GPON');
    const commands = [
      'enable',
      'configure',
      `interface gpon ${pon}`,
      `ont delete ${onuId}`,
      'exit',
      'save',
    ];
    return this.executeGponOntAction({
      onu,
      action: 'Delete ONU HSGQ GPON',
      commands,
      successMessage: `Delete ONU HSGQ GPON dikirim ke OLT untuk ${onu.sn}`,
    });
  }

  supportsOnuDelete() {
    return true;
  }

  supportsOnuDescriptionUpdate() {
    return true;
  }

  buildOnuDescriptionCommands({ onu, description }) {
    const { pon, onuId } = this.getGponOntAddress(onu, 'edit description HSGQ GPON');
    return [
      'enable',
      'configure',
      `interface gpon ${pon}`,
      `ont setting ${onuId} name ${description}`,
      'exit',
      'save',
    ];
  }

  findHsgqTr069Wan(wanItems = []) {
    return (Array.isArray(wanItems) ? wanItems : []).find(
      (item) => Number(item?.ctype) === HSGQ_TR069_CTYPE
    ) || null;
  }

  buildHsgqTr069WanPayload({ onu, vlan, currentWan = null }) {
    const { portId, onuId } = this.getEponWebAddress(onu);
    return {
      method: currentWan?.index != null && Number(currentWan.index) >= 0 ? 'set' : 'add',
      param: {
        port_id: portId,
        onu_id: onuId,
        name: currentWan?.name || 'tr069',
        index: currentWan?.index ?? -1,
        ipmode: HSGQ_DHCP_IPMODE,
        ctype: HSGQ_TR069_CTYPE,
        mtu: Number(currentWan?.mtu || HSGQ_DEFAULT_MTU),
        igmpproxy: Number(currentWan?.igmpproxy || 0),
        ipproto: Number(currentWan?.ipproto || 1),
        tagmode: 1,
        vlan_id: Number(vlan),
        reqdns: 0,
        pridns: '',
        secdns: '',
        portmap: [],
      },
    };
  }

  buildOnuStaticIpPayload({
    onu,
    ipAddress,
    ipNetmask,
    ipGateway,
    vlan,
    priority = HSGQ_STATIC_IP_DEFAULT_PRIORITY,
  }) {
    const { portId, onuId } = this.getEponWebAddress(onu, 'IP statik ONU HSGQ');
    return {
      method: 'set',
      param: {
        port_id: portId,
        onu_id: onuId,
        ipaddr: ipAddress,
        ipmask: ipNetmask,
        gateway: ipGateway,
        vlanid: Number(vlan),
        priority: Number(priority),
      },
    };
  }

  buildOnuStaticIpPlan({
    onu,
    ipAddress,
    ipNetmask,
    ipGateway,
    vlan,
    priority = HSGQ_STATIC_IP_DEFAULT_PRIORITY,
  }) {
    const { portId, onuId } = this.getEponWebAddress(onu, 'IP statik ONU HSGQ');
    return [
      `hsgq-ipmgmt-login: ${this.getWebBaseUrl()}`,
      `hsgq-ipmgmt-get: /onumgmt?form=ipmgmt&port_id=${portId}&onu_id=${onuId}`,
      `hsgq-ipmgmt-post: /onumgmt?form=ipmgmt method=set port_id=${portId} onu_id=${onuId} ipaddr=${ipAddress} ipmask=${ipNetmask} gateway=${ipGateway} vlanid=${Number(vlan)} priority=${Number(priority)}`,
    ];
  }

  async applyOnuStaticIp({
    onu,
    ipAddress,
    ipNetmask,
    ipGateway,
    vlan,
    priority = HSGQ_STATIC_IP_DEFAULT_PRIORITY,
  }) {
    const { portId, onuId } = this.getEponWebAddress(onu, 'IP statik ONU HSGQ');
    const current = await this.fetchWebJson(`/onumgmt?form=ipmgmt&port_id=${portId}&onu_id=${onuId}`, {
      method: 'GET',
    });
    if (current.code !== 1) {
      throw new HttpError(502, current.message || 'Gagal membaca IP statik existing dari Web UI HSGQ');
    }

    const currentData = current.data || {};
    const currentMatched =
      String(currentData.ipaddr || '') === String(ipAddress) &&
      String(currentData.ipmask || '') === String(ipNetmask) &&
      String(currentData.gateway || '') === String(ipGateway) &&
      Number(currentData.vlanid) === Number(vlan);
    if (currentMatched) {
      return {
        success: true,
        message: `IP statik ${ipAddress} sudah sesuai di HSGQ untuk ONU ${portId}/${onuId}`,
        transport: 'web-hsgq-ipmgmt',
        plan: this.buildOnuStaticIpPlan({
          onu,
          ipAddress,
          ipNetmask,
          ipGateway,
          vlan,
          priority,
        }),
        result: {
          port_id: portId,
          onu_id: onuId,
          ip_address: ipAddress,
          ip_netmask: ipNetmask,
          ip_gateway: ipGateway,
          ip_vlan: Number(vlan),
          ip_priority: Number(priority),
          previous_ip_config: currentData,
          response: {
            code: 1,
            message: 'already configured',
          },
          readback: currentData,
        },
        outputs: [
          {
            command: `GET /onumgmt?form=ipmgmt&port_id=${portId}&onu_id=${onuId}`,
            stdout: JSON.stringify(current),
            stderr: '',
          },
        ],
        error: null,
      };
    }

    const payload = this.buildOnuStaticIpPayload({
      onu,
      ipAddress,
      ipNetmask,
      ipGateway,
      vlan,
      priority,
    });
    const applied = await this.fetchWebJson('/onumgmt?form=ipmgmt', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const readback = applied.code === 1
      ? await this.fetchWebJson(`/onumgmt?form=ipmgmt&port_id=${portId}&onu_id=${onuId}`, {
          method: 'GET',
        })
      : null;
    const readbackData = readback?.data || {};
    const readbackMatched =
      applied.code === 1 &&
      String(readbackData.ipaddr || '') === String(ipAddress) &&
      String(readbackData.ipmask || '') === String(ipNetmask) &&
      String(readbackData.gateway || '') === String(ipGateway) &&
      Number(readbackData.vlanid) === Number(vlan);
    const success = applied.code === 1 && readbackMatched;

    return {
      success,
      message: success
        ? `IP statik ${ipAddress} berhasil dipush dari HSGQ ke ONU ${portId}/${onuId}`
        : applied.message || `Push IP statik HSGQ ke ONU ${portId}/${onuId} gagal`,
      transport: 'web-hsgq-ipmgmt',
      plan: this.buildOnuStaticIpPlan({
        onu,
        ipAddress,
        ipNetmask,
        ipGateway,
        vlan,
        priority,
      }),
      result: {
        port_id: portId,
        onu_id: onuId,
        ip_address: ipAddress,
        ip_netmask: ipNetmask,
        ip_gateway: ipGateway,
        ip_vlan: Number(vlan),
        ip_priority: Number(priority),
        previous_ip_config: current.data || null,
        response: applied,
        readback: readbackData || null,
      },
      outputs: [
        {
          command: `GET /onumgmt?form=ipmgmt&port_id=${portId}&onu_id=${onuId}`,
          stdout: JSON.stringify(current),
          stderr: '',
        },
        {
          command: 'POST /onumgmt?form=ipmgmt',
          stdout: JSON.stringify(applied),
          stderr: '',
        },
        ...(readback
          ? [
              {
                command: `GET /onumgmt?form=ipmgmt&port_id=${portId}&onu_id=${onuId}`,
                stdout: JSON.stringify(readback),
                stderr: '',
              },
            ]
          : []),
      ],
      error: success
        ? null
        : applied.message || (applied.code === 1 ? 'Readback IP statik HSGQ tidak sesuai' : 'Web UI HSGQ rejected static IP payload'),
    };
  }

  supportsOnuStaticIp() {
    return true;
  }

  parseGponMacAddressTable(stdout = '') {
    const entries = [];
    for (const rawLine of String(stdout || '').split('\n')) {
      const match = rawLine.match(
        /^\s*PON0?(\d+)\s+(\d+)\s+([0-9a-f:]{17})\s+(\d+)\s+dynamic\b/i
      );
      if (!match) continue;
      entries.push({
        pon: Number(match[1]),
        onu_id: Number(match[2]),
        mac: match[3].toLowerCase(),
        vlan: Number(match[4]),
      });
    }
    return entries;
  }

  buildGponTr069WanPlan({ onu, vlan, acsUrl, setAcs }) {
    const { pon, onuId } = this.getGponOntAddress(onu, 'TR069 HSGQ GPON');
    return [
      'enable',
      'configure',
      `interface gpon ${pon}`,
      `ont ipconfig ${onuId} ip-index ${HSGQ_GPON_TR069_IP_INDEX} dhcp vlan ${Number(vlan)}`,
      `ont tr069-profile ${onuId} profile-id ${HSGQ_GPON_TR069_PROFILE_ID}`,
      'exit',
      'save',
      `show mac-address gpon ${pon}`,
    ];
  }

  buildTr069WanPlan({ onu, vlan, acsUrl, setAcs }) {
    if (!this.isEponOnu(onu)) {
      return this.buildGponTr069WanPlan({ onu, vlan, acsUrl, setAcs });
    }

    const { portId, onuId } = this.getEponWebAddress(onu);
    const snmpWritePossible = Boolean(this.olt?.snmp_community_rw_encrypted);
    return [
      `snmp-preferred: ${snmpWritePossible ? 'RW community configured, but HSGQ TR069 WAN writable OID is not validated' : 'RW community not configured'}`,
      `web-fallback-login: ${this.getWebBaseUrl()}`,
      `web-get: /onumgmt?form=wan&port_id=${portId}&onu_id=${onuId}`,
      `web-post: /onumgmt?form=wan method=add/set port_id=${portId} onu_id=${onuId} ctype=TR069 ipmode=DHCP tagmode=1 vlan_id=${Number(vlan)}`,
      setAcs && acsUrl
        ? 'acs-url: not changed on HSGQ web fallback; firmware exposes TR069 WAN VLAN but no validated ACS URL endpoint'
        : 'acs-url: not requested',
    ];
  }

  async ensureTr069Wan({ onu, vlan, acsUrl, setAcs, natEnabled = false }) {
    if (!this.isEponOnu(onu)) {
      const { pon, onuId } = this.getGponOntAddress(onu, 'TR069 HSGQ GPON');
      const commands = this.buildGponTr069WanPlan({ onu, vlan, acsUrl, setAcs });
      return {
        success: true,
        message: `HSGQ GPON TR069 DHCP VLAN ${Number(vlan)} plan ready for ONU ${pon}/${onuId}`,
        plan: commands,
        result: {
          pon,
          onu_id: onuId,
          tr069_vlan: Number(vlan),
          tr069_wan_mode: 'dhcp',
          tr069_ip_index: HSGQ_GPON_TR069_IP_INDEX,
          tr069_profile_id: HSGQ_GPON_TR069_PROFILE_ID,
          acs_url: acsUrl || null,
          set_acs: false,
          acs_action: setAcs && acsUrl
            ? `not changed directly; HSGQ GPON uses TR069 profile-id ${HSGQ_GPON_TR069_PROFILE_ID}`
            : 'not requested',
          nat_enabled: Boolean(natEnabled),
          nat_policy: 'not changed',
          fallback_transport: 'cli-hsgq-gpon',
          scope: 'hsgq-gpon-tr069-ipconfig-dhcp-vlan',
        },
      };
    }

    const { portId, onuId } = this.getEponWebAddress(onu);
    const commands = this.buildTr069WanPlan({ onu, vlan, acsUrl, setAcs });
    return {
      success: true,
      message: `HSGQ TR069 DHCP VLAN ${Number(vlan)} plan ready for ONU ${portId}/${onuId}`,
      plan: commands,
      result: {
        port_id: portId,
        onu_id: onuId,
        tr069_vlan: Number(vlan),
        tr069_wan_mode: 'dhcp',
        ipmode: HSGQ_DHCP_IPMODE,
        ctype: HSGQ_TR069_CTYPE,
        tagmode: 1,
        nat_enabled: Boolean(natEnabled),
        nat_policy: 'not changed',
        acs_url: acsUrl || null,
        set_acs: false,
        acs_action: setAcs && acsUrl
          ? 'not changed; HSGQ BUDI Web UI exposes TR069 WAN VLAN but no validated ACS URL endpoint'
          : 'not requested',
        snmp_preferred: true,
        snmp_rw_configured: Boolean(this.olt?.snmp_community_rw_encrypted),
        snmp_write_supported: false,
        fallback_transport: 'web-hsgq',
        scope: 'hsgq-tr069-dhcp-vlan-web-fallback',
      },
    };
  }

  async applyTr069Wan({ onu, vlan, acsUrl, setAcs, natEnabled = false }) {
    if (!this.isEponOnu(onu)) {
      const { pon, onuId } = this.getGponOntAddress(onu, 'TR069 HSGQ GPON');
      const commands = this.buildGponTr069WanPlan({ onu, vlan, acsUrl, setAcs });
      const execution = await executeOltCommands({
        olt: this.olt,
        password: decryptSecret(this.olt.password_encrypted),
        commands,
        allowWrite: true,
        timeoutMs: 70000,
      });
      const failedOutput = this.detectCommandFailure(execution.outputs || []);
      const macOutput =
        execution.outputs?.find((item) => item.command === `show mac-address gpon ${pon}`)?.stdout || '';
      const targetMacs = this.parseGponMacAddressTable(macOutput)
        .filter((entry) => entry.pon === pon && entry.onu_id === onuId);
      const vlanMacs = targetMacs.filter((entry) => entry.vlan === Number(vlan));
      const success = Boolean(execution.success && !failedOutput);

      return {
        success,
        message: success
          ? `HSGQ GPON TR069 DHCP VLAN ${Number(vlan)} dipush ke ONU ${pon}/${onuId}`
          : failedOutput?.stdout || failedOutput?.stderr || execution.error || 'Push HSGQ GPON TR069 VLAN gagal',
        transport: execution.transport || 'telnet',
        plan: commands,
        result: {
          pon,
          onu_id: onuId,
          tr069_vlan: Number(vlan),
          tr069_wan_mode: 'dhcp',
          tr069_ip_index: HSGQ_GPON_TR069_IP_INDEX,
          tr069_profile_id: HSGQ_GPON_TR069_PROFILE_ID,
          acs_url: acsUrl || null,
          set_acs: false,
          acs_action: setAcs && acsUrl
            ? `not changed directly; HSGQ GPON uses TR069 profile-id ${HSGQ_GPON_TR069_PROFILE_ID}`
            : 'not requested',
          nat_enabled: Boolean(natEnabled),
          nat_policy: 'not changed',
          vlan_macs: vlanMacs,
          vlans_seen: Array.from(new Set(targetMacs.map((entry) => entry.vlan))).sort((a, b) => a - b),
          fallback_transport: 'cli-hsgq-gpon',
        },
        outputs: execution.outputs || [],
        error: success
          ? null
          : failedOutput?.stdout || failedOutput?.stderr || execution.error || 'Push HSGQ GPON TR069 VLAN gagal',
      };
    }

    const { portId, onuId } = this.getEponWebAddress(onu);
    const current = await this.fetchWebJson(`/onumgmt?form=wan&port_id=${portId}&onu_id=${onuId}`, {
      method: 'GET',
    });
    if (current.code !== 1) {
      throw new HttpError(502, current.message || 'Gagal membaca WAN existing dari Web UI HSGQ');
    }

    const currentWan = this.findHsgqTr069Wan(current.data || []);
    const payload = this.buildHsgqTr069WanPayload({ onu, vlan, currentWan });
    const applied = await this.fetchWebJson('/onumgmt?form=wan', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const success = applied.code === 1;
    return {
      success,
      message: success
        ? `HSGQ TR069 DHCP VLAN ${Number(vlan)} berhasil dipush ke ONU ${portId}/${onuId}`
        : applied.message || `Push HSGQ TR069 DHCP VLAN ${Number(vlan)} gagal`,
      transport: 'web-hsgq',
      plan: this.buildTr069WanPlan({ onu, vlan, acsUrl, setAcs }),
      result: {
        port_id: portId,
        onu_id: onuId,
        method: payload.method,
        payload: payload.param,
        previous_wan: currentWan,
        response: applied,
        tr069_vlan: Number(vlan),
        tr069_wan_mode: 'dhcp',
        acs_url: acsUrl || null,
        set_acs: false,
        acs_action: setAcs && acsUrl
          ? 'not changed; HSGQ BUDI Web UI exposes TR069 WAN VLAN but no validated ACS URL endpoint'
          : 'not requested',
        nat_enabled: Boolean(natEnabled),
        nat_policy: 'not changed',
        snmp_preferred: true,
        snmp_rw_configured: Boolean(this.olt?.snmp_community_rw_encrypted),
        snmp_write_supported: false,
        fallback_transport: 'web-hsgq',
      },
      outputs: [
        {
          command: `GET /onumgmt?form=wan&port_id=${portId}&onu_id=${onuId}`,
          stdout: JSON.stringify(current),
          stderr: '',
        },
        {
          command: 'POST /onumgmt?form=wan',
          stdout: JSON.stringify(applied),
          stderr: '',
        },
      ],
      error: success ? null : applied.message || 'Web UI HSGQ rejected TR069 WAN payload',
    };
  }

  supportsTr069Wan() {
    return true;
  }

  async saveConfig() {
    return this.executeSaveConfigCommands({
      commands: ['enable', 'configure', 'save'],
      successMessage: `Save config HSGQ OLT ${this.olt.name} selesai`,
    });
  }

  getCommandCatalog({ action, onu, profile }) {
    return [
      this.buildPlanStep('connect', 'enable', 'Masuk privileged mode'),
      this.buildPlanStep('configure', 'configure terminal', 'Masuk mode konfigurasi'),
      this.buildPlanStep(
        'discover',
        `show onu unauthorized | include ${onu.sn}`,
        'Cari ONU unauthorized'
      ),
      this.buildPlanStep(
        'authorize',
        action === 'register'
          ? `interface pon ${onu.slot || 0}/${onu.pon || 0}\n onu add sn ${onu.sn}`
          : `show onu detail sn ${onu.sn}`,
        'Register atau cek ONU'
      ),
      this.buildPlanStep(
        'line-profile',
        profile?.line_profile ? `profile bind line ${profile.line_profile}` : 'skip',
        'Bind line profile'
      ),
      this.buildPlanStep(
        'service-profile',
        profile?.service_profile ? `profile bind service ${profile.service_profile}` : 'skip',
        'Bind service profile'
      ),
      this.buildPlanStep(
        'internet-vlan',
        profile?.internet_service_enabled ? `service add vlan ${profile.vlan_internet}` : 'skip',
        'Create internet service'
      ),
      this.buildPlanStep(
        'tr069-vlan',
        profile?.tr069_service_enabled ? `service add vlan ${profile.vlan_tr069}` : 'skip',
        'Create TR-069 service'
      ),
      this.buildPlanStep('save', 'write', 'Save configuration'),
      this.buildPlanStep('verify', `show onu state sn ${onu.sn}`, 'Verify ONU state'),
    ];
  }
}
