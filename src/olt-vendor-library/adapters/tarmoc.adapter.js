import { readOnlyFetch } from '../services/context.js';
import { BaseOltAdapter } from './base.adapter.js';
import { TARMOC_LIVE_TEMPLATE } from './templates/tarmoc.live-template.js';
import { decryptSecret } from '../services/crypto.js';
import { executeOltCommands } from '../services/olt-transport.js';
import { snmpGet } from '../services/snmp.js';
import { HttpError } from '../utils/http-error.js';

const TARMOC_WEB_TIMEOUT_MS = 8000;
const TARMOC_WEB_LOGIN_TTL_MS = 60000;
const TARMOC_WEB_SOURCE = 'web-tarmoc';

export class TarmocAdapter extends BaseOltAdapter {
  getWebBaseUrl() {
    if (!this.olt?.host || !this.olt?.web_port) return null;
    const port = Number(this.olt.web_port || 80);
    const authority = port && port !== 80 ? `${this.olt.host}:${port}` : this.olt.host;
    return `http://${authority}`;
  }

  getWebCredentials() {
    const username = this.olt.web_username || this.olt.username;
    let password = '';
    try {
      password = this.olt.web_password_encrypted
        ? decryptSecret(this.olt.web_password_encrypted)
        : decryptSecret(this.olt.password_encrypted);
    } catch {
      password = '';
    }
    return { username, password };
  }

  async fetchWithTimeout(url, options = {}, timeoutMs = TARMOC_WEB_TIMEOUT_MS) {
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
    if (!force && this.webLoginAt && Date.now() - this.webLoginAt < TARMOC_WEB_LOGIN_TTL_MS) {
      return this.webLoginResult || null;
    }

    const baseUrl = this.getWebBaseUrl();
    const { username, password } = this.getWebCredentials();
    if (!baseUrl || !username || !password) return null;

    const body = new URLSearchParams({
      username,
      password,
      lang: '0',
      login: 'Login',
    });
    const response = await this.fetchWithTimeout(`${baseUrl}/goform/SetLogin`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Connection: 'close',
      },
      body,
    });
    const cookie = String(response.headers.get('set-cookie') || '').split(';')[0];
    if (cookie) this.webCookie = cookie;
    this.webLoginAt = Date.now();
    this.webLoginResult = {
      status: response.status,
      location: response.headers.get('location'),
      cookie: this.webCookie || '',
    };
    return this.webLoginResult;
  }

  async fetchWebPage(path, options = {}) {
    const baseUrl = this.getWebBaseUrl();
    if (!baseUrl) return null;

    const { retryAfterLogin, ...requestOptions } = options;
    await this.loginWeb();
    const url = new URL(path, baseUrl).toString();
    const headers = {
      Connection: 'close',
      ...(this.webCookie ? { Cookie: this.webCookie } : {}),
      ...(requestOptions.headers || {}),
    };
    const response = await this.fetchWithTimeout(url, {
      ...requestOptions,
      headers,
      redirect: requestOptions.redirect || 'manual',
    });
    const text = await response.text();
    if (!response.ok && (response.status < 300 || response.status >= 400)) return null;
    if (/action=["']\/goform\/SetLogin/i.test(text)) {
      if (!retryAfterLogin) {
        this.webLoginAt = 0;
        await this.loginWeb({ force: true });
        return this.fetchWebPage(path, { ...options, retryAfterLogin: true });
      }
      return null;
    }
    return {
      status: response.status,
      location: response.headers.get('location'),
      text,
    };
  }

  cleanWebText(value) {
    return String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  parseWebNumber(value) {
    const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
  }

  formatWebDbm(value) {
    const number = this.parseWebNumber(value);
    return number == null ? null : `${number.toFixed(2)} dBm`;
  }

  parseWebObjectLiteral(raw) {
    const output = {};
    const body = String(raw || '').replace(/^\s*\{|\}\s*$/g, '');
    const matcher = /([A-Za-z0-9_]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,}]+))/g;
    let match;
    while ((match = matcher.exec(body))) {
      output[match[1]] = String(match[2] ?? match[3] ?? match[4] ?? '').trim();
    }
    return output;
  }

  parseWebArrayAssignments(text, arrayName) {
    const escaped = arrayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(`${escaped}\\s*\\[\\s*(\\d+)\\s*\\]\\s*=\\s*(\\{[\\s\\S]*?\\});`, 'g');
    const rows = [];
    let match;
    while ((match = matcher.exec(String(text || '')))) {
      rows.push({
        index: Number(match[1]),
        ...this.parseWebObjectLiteral(match[2]),
      });
    }
    return rows;
  }

  extractTableCells(text) {
    return [...String(text || '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((match) => this.cleanWebText(match[1]))
      .filter(Boolean);
  }

  extractTablePairs(text) {
    const cells = this.extractTableCells(text);
    const pairs = [];
    for (let index = 0; index < cells.length - 1; index += 2) {
      pairs.push({
        label: cells[index],
        value: cells[index + 1],
      });
    }
    return pairs;
  }

  parseTarmocWebPort(port) {
    const match = String(port || '').match(/gpon(\d+)\/(\d+)\/(\d+)/i);
    if (!match) return {};
    return {
      chassis: Number(match[1]),
      slot: Number(match[2]),
      pon: Number(match[3]),
    };
  }

  getTarmocWebProfilePath(onu) {
    const slot = onu?.slot ?? 2;
    const pon = onu?.pon;
    const onuId = onu?.onu_id;
    if (slot == null || pon == null || onuId == null) return null;
    return `${slot}/${pon}/${onuId}`;
  }

  getTarmocSpecificProfileCandidates(onu) {
    const slot = Number(onu?.slot);
    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isFinite(slot) || !Number.isFinite(pon) || !Number.isFinite(onuId)) {
      return [];
    }
    return Array.from(new Set([`${slot}/${pon}/${onuId}`, `${pon}/${slot}/${onuId}`]));
  }

  async resolveTarmocSpecificProfilePath(onu) {
    const candidates = this.getTarmocSpecificProfileCandidates(onu);
    const normalizedSn = this.normalizeSnValue(onu?.sn);

    if (normalizedSn) {
      const webItems = await this.readWebOnuStatus().catch(() => []);
      const webMatch = webItems.find((item) => this.normalizeSnValue(item.sn) === normalizedSn);
      const webPath = webMatch ? this.getTarmocWebProfilePath(webMatch) : null;
      if (webPath) {
        candidates.unshift(webPath);
      }
    }

    const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
    if (!uniqueCandidates.length) {
      return {
        profilePath: null,
        profileExists: false,
        candidates: [],
        profiles: [],
      };
    }

    const profiles = await this.readWebSpecificProfiles().catch(() => []);
    const profileIds = new Set(profiles.map((item) => item.prfId).filter(Boolean));
    const existingProfile = uniqueCandidates.find((candidate) => profileIds.has(candidate));

    return {
      profilePath: existingProfile || uniqueCandidates[0],
      profileExists: Boolean(existingProfile),
      candidates: uniqueCandidates,
      profiles,
    };
  }

  cleanWebDescription(...values) {
    const value = values
      .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
      .find(Boolean);
    if (!value || /^(ONT_NO_DESCRIPTION|NO_DESCRIPTION|N\/A|NA|NULL|NONE|-)$/i.test(value)) {
      return null;
    }
    return value;
  }

  parseWebDeviceInfo(text) {
    const pairs = this.extractTablePairs(text);
    const values = pairs.map((pair) => pair.value);
    const numericPairs = pairs.map((pair) => ({
      label: pair.label,
      value_c: this.parseWebNumber(pair.value),
      raw: pair.value,
    }));
    const cpuTemperatureIndex = numericPairs.findIndex(
      (pair) => pair.value_c != null && /CPU/i.test(pair.label) && !/%/.test(pair.raw)
    );
    const cpuTemperature = cpuTemperatureIndex >= 0 ? numericPairs[cpuTemperatureIndex] : null;
    const boardTemperature = numericPairs
      .slice(cpuTemperatureIndex + 1)
      .find(
        (pair) =>
          pair.value_c != null &&
          !/%|MB|day|days|hour|minute|second|tick|UTC|TMO-|^V\d|:/.test(pair.raw)
      );
    const model = values.find((value) => /^TMO-/i.test(value)) || null;
    const softwareVersion = values.find((value) => /^V\d+\.\d+.*B\d+/i.test(value)) || null;
    const hardwareVersion = values.find((value) => /^V\d+(?:\.\d+)?$/i.test(value)) || null;
    const serial = values.find((value) => /^[A-Z0-9]{8,}$/i.test(value) && !/^TMO-/i.test(value)) || null;
    const uptime = values.find((value) => /\bday|days|hour|minute|second/i.test(value)) || null;
    const cpuUsage = pairs.find((pair) => /CPU/i.test(pair.label) && /%/.test(pair.value))?.value || null;
    const memoryUsage = pairs.find((pair) => /MB free|%/.test(pair.value) && !/CPU/i.test(pair.label))?.value || null;

    return {
      model,
      software_version: softwareVersion,
      hardware_version: hardwareVersion,
      serial,
      uptime,
      cpu_usage: cpuUsage,
      memory_usage: memoryUsage,
      sensors: [
        cpuTemperature
          ? {
              index: 'cpu',
              name: 'CPU temperature',
              value_c: cpuTemperature.value_c,
              status: 'ok',
              source: TARMOC_WEB_SOURCE,
            }
          : null,
        boardTemperature
          ? {
              index: 'board',
              name: 'Board temperature',
              value_c: boardTemperature.value_c,
              status: 'ok',
              source: TARMOC_WEB_SOURCE,
            }
          : null,
      ].filter(Boolean),
    };
  }

  async readWebDeviceInfo() {
    const page = await this.fetchWebPage('/configchn/deviceInfo.asp');
    if (!page?.text) return null;
    return this.parseWebDeviceInfo(page.text);
  }

  async readWebSfpSensors() {
    const page = await this.fetchWebPage('/configchn/portSfpStats.asp?chan=gpon');
    if (!page?.text) return [];
    const basicRows = new Map(
      this.parseWebArrayAssignments(page.text, 'sfpBasicInfo').map((row) => [row.port, row])
    );
    return this.parseWebArrayAssignments(page.text, 'sfpDdmInfo')
      .map((row) => {
        const valueC = this.parseWebNumber(row.Temperature);
        if (valueC == null) return null;
        const basic = basicRows.get(row.port) || {};
        return {
          index: row.port || `sfp-${row.index}`,
          name: `SFP ${row.port || row.index}`,
          value_c: valueC,
          voltage_v: this.parseWebNumber(row.Voltage),
          bias_ma: this.parseWebNumber(row.Bias),
          rx_power: this.formatWebDbm(row.RxPower),
          tx_power: this.formatWebDbm(row.TxPower),
          serial: this.cleanWebDescription(basic.Serial),
          vendor: this.cleanWebDescription(basic.VendorName),
          status: 'ok',
          source: TARMOC_WEB_SOURCE,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.value_c - a.value_c);
  }

  getTarmocOntPath(onu) {
    const slot = onu?.slot;
    const pon = onu?.pon;
    const onuId = onu?.onu_id;
    if (slot == null || pon == null || onuId == null) return null;
    return `${pon}/${slot}/${onuId}`;
  }

  getTarmocGponInterface(onu) {
    const chassis = onu?.chassis ?? 0;
    const slot = onu?.slot ?? 2;
    const pon = onu?.pon ?? 1;
    return `${chassis}/${slot}/${pon}`;
  }

  getTarmocProfilePath(onu) {
    const pon = onu?.pon ?? 1;
    const slot = onu?.slot ?? 2;
    const onuId = onu?.onu_id ?? 1;
    return `${pon}/${slot}/${onuId}`;
  }

  vendorPrefix() {
    return 'Tarmoc';
  }

  getVendorPriority() {
    return 1;
  }

  getCommandNotes() {
    return [
      'Prioritas implementasi vendor pertama.',
      'CLI Tarmoc yang sudah diuji memakai prompt `GPON>` lalu `<GPON>` setelah `enable`.',
      'Command observasi yang terbukti jalan memakai `display`, bukan `show`.',
      'Mode konfigurasi terlihat memakai `system-view` dan `commit`.',
      'Template live Tarmoc disimpan sebagai referensi internal aplikasi.',
      'Syntax provisioning masih semi-riil dan harus divalidasi lagi pada port/ONU target sebelum write command.',
    ];
  }

  getValidatedTemplate() {
    return TARMOC_LIVE_TEMPLATE;
  }

  async testConnection() {
    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['enable', 'display current-config if'],
      allowWrite: false,
    });

    if (!execution.success) {
      const webDeviceInfo = await this.readWebDeviceInfo().catch(() => null);
      if (webDeviceInfo) {
        return {
          success: true,
          message: `Web UI Tarmoc ${this.olt.name} terbaca`,
          transport: TARMOC_WEB_SOURCE,
          summary: [
            webDeviceInfo.model ? `model ${webDeviceInfo.model}` : null,
            webDeviceInfo.software_version ? `software ${webDeviceInfo.software_version}` : null,
            webDeviceInfo.uptime ? `uptime ${webDeviceInfo.uptime}` : null,
          ]
            .filter(Boolean)
            .join(' / '),
          outputs: [],
          web_detail: webDeviceInfo,
        };
      }
      return {
        success: false,
        message: execution.error || 'Live connection to Tarmoc OLT failed',
        transport: execution.transport || this.olt.protocol,
        outputs: execution.outputs || [],
      };
    }

    const summary =
      execution.outputs?.find((item) => item.command === 'display current-config if')?.stdout || '';

    return {
      success: true,
      message: `Live connection to Tarmoc OLT ${this.olt.name} succeeded`,
      transport: execution.transport || this.olt.protocol,
      summary,
      outputs: execution.outputs || [],
    };
  }

  async saveConfig() {
    return this.executeSaveConfigCommands({
      commands: ['enable', 'system-view', 'commit'],
      successMessage: `Save config Tarmoc OLT ${this.olt.name} selesai`,
    });
  }

  async getTemperature() {
    const [deviceInfo, sfpSensors] = await Promise.all([
      this.readWebDeviceInfo().catch(() => null),
      this.readWebSfpSensors().catch(() => []),
    ]);
    const sensors = [...(deviceInfo?.sensors || []), ...sfpSensors]
      .filter((sensor) => sensor?.value_c != null)
      .sort((a, b) => b.value_c - a.value_c);

    if (!sensors.length) {
      return {
        status: 'unavailable',
        source: TARMOC_WEB_SOURCE,
        message: this.olt?.web_port
          ? 'Suhu Tarmoc tidak terbaca dari Web UI'
          : 'Web Port Tarmoc belum dikonfigurasi',
        sensors: [],
      };
    }

    const hottest = sensors[0];
    return {
      status: 'ok',
      source: TARMOC_WEB_SOURCE,
      value_c: hottest.value_c,
      label: hottest.name,
      sensors: sensors.slice(0, 16),
      device: deviceInfo
        ? {
            model: deviceInfo.model,
            software_version: deviceInfo.software_version,
            hardware_version: deviceInfo.hardware_version,
            serial: deviceInfo.serial,
            uptime: deviceInfo.uptime,
            cpu_usage: deviceInfo.cpu_usage,
            memory_usage: deviceInfo.memory_usage,
          }
        : null,
    };
  }

  normalizeSnValue(sn) {
    return String(sn || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  formatTarmocSn(sn) {
    const normalized = this.normalizeSnValue(sn);
    if (normalized.length <= 4) return normalized;
    return `${normalized.slice(0, 4)}-${normalized.slice(4).toLowerCase()}`;
  }

  buildLiveSnSearchCommands(sn) {
    const formatted = this.formatTarmocSn(sn);
    const normalized = this.normalizeSnValue(sn);
    const variants = Array.from(new Set([formatted, normalized, normalized.toLowerCase()]));
    return [
      'enable',
      'display ont info interface gpon all',
      ...variants.map((value) => `display current-config | include ${value}`),
    ];
  }

  parseLiveSnSearchResult(criteria, outputs) {
    const normalizedTarget = this.normalizeSnValue(criteria.sn);
    const lines = outputs
      .flatMap((entry) => String(entry.stdout || '').split('\n'))
      .map((line) => line.trim())
      .filter(Boolean);

    const matches = [];
    for (const line of lines) {
      const match = line.match(
        /^(\d+)\/(\d+)\/(\d+)\s+([A-Z0-9]{4}-[A-Za-z0-9]+)\s+([0-9A-Za-z]+)\s+([a-z-]+)\s+([a-z-]+)/i
      );
      if (match) {
        const foundSn = match[4].toUpperCase();
        const normalizedFound = this.normalizeSnValue(foundSn);
        if (!normalizedFound.includes(normalizedTarget)) continue;
        matches.push({
          sn: foundSn,
          vendor: foundSn.slice(0, 4),
          model: 'Tarmoc Live',
          slot: Number(match[2]),
          pon: Number(match[1]),
          onu_id: Number(match[3]),
          status: match[6],
          rx_power: null,
          distance: null,
        });
        continue;
      }

      const configMatch = line.match(/sn-auth\s+string-hex\s+([A-Z0-9]{4}-[A-Za-z0-9]+)/i);
      if (configMatch) {
        const foundSn = configMatch[1].toUpperCase();
        const normalizedFound = this.normalizeSnValue(foundSn);
        if (!normalizedFound.includes(normalizedTarget)) continue;
        matches.push({
          sn: foundSn,
          vendor: foundSn.slice(0, 4),
          model: 'Tarmoc Live',
          slot: null,
          pon: null,
          onu_id: null,
          status: 'registered',
          rx_power: null,
          distance: null,
        });
      }
    }

    const bySn = new Map();
    for (const item of matches) {
      const key = this.normalizeSnValue(item.sn);
      const current = bySn.get(key);
      if (!current) {
        bySn.set(key, item);
        continue;
      }

      const currentScore =
        Number(current.slot != null) +
        Number(current.pon != null) +
        Number(current.onu_id != null) +
        Number(current.status && current.status !== 'registered');
      const nextScore =
        Number(item.slot != null) +
        Number(item.pon != null) +
        Number(item.onu_id != null) +
        Number(item.status && item.status !== 'registered');

      if (nextScore > currentScore) {
        bySn.set(key, { ...current, ...item });
      }
    }

    return Array.from(bySn.values());
  }

  async getUnregisteredOnu() {
    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['enable', 'display ont info interface gpon all'],
      allowWrite: false,
    });

    if (!execution.success) {
      const webItems = await this.readWebOnuStatus().catch(() => []);
      const webAutofind = await this.readWebAutoFindOnus().catch(() => []);
      if (webItems.length || webAutofind.length) {
        return [...webItems, ...webAutofind];
      }
      throw new HttpError(
        502,
        execution.error || execution.message || 'Scan ONU live ke Tarmoc OLT gagal'
      );
    }

    const lines = execution.outputs
      .flatMap((entry) => String(entry.stdout || '').split('\n'))
      .map((line) => line.trim())
      .filter(Boolean);

    const items = [];
    for (const line of lines) {
      const match = line.match(
        /^(\d+)\/(\d+)\/(\d+)\s+([A-Z0-9]{4}-[A-Za-z0-9]+)\s+([0-9A-Za-z]+)\s+([a-z-]+)\s+([a-z-]+)/i
      );
      if (!match) continue;
      items.push({
        sn: match[4].toUpperCase(),
        vendor: match[4].slice(0, 4).toUpperCase(),
        model: 'Tarmoc Live',
        slot: Number(match[2]),
        pon: Number(match[1]),
        onu_id: Number(match[3]),
        status: match[6],
        rx_power: null,
        distance: null,
      });
    }

    if (items.length) return items;

    const webItems = await this.readWebOnuStatus().catch(() => []);
    const webAutofind = await this.readWebAutoFindOnus().catch(() => []);
    if (webItems.length || webAutofind.length) {
      return [...webItems, ...webAutofind];
    }

    return items;
  }

  async getDashboardStats() {
    const items = await this.readWebOnuStatus().catch(() => []);
    if (!items.length) return null;
    const autofind = await this.readWebAutoFindOnus().catch(() => []);
    const offlineOnus = items.filter((item) => item.status !== 'online');
    return {
      source: TARMOC_WEB_SOURCE,
      total_onu: items.length + autofind.length,
      online: items.length - offlineOnus.length,
      offline: offlineOnus.length,
      unregistered: autofind.length,
      offline_onus: offlineOnus,
      registered_onus: items,
    };
  }

  normalizeWebOnuStatus(value, fallback = 'registered') {
    const status = String(value || '').toLowerCase();
    if (/normal|online|active|up/.test(status)) return 'online';
    if (/offline|down|inactive|power|loss|los/.test(status)) return 'offline';
    return fallback;
  }

  buildWebOnuItem(row, status) {
    const address = this.parseTarmocWebPort(row.port);
    const onuId = Number(row.ont ?? row.index ?? row.inputont);
    const normalizedSn = row.sn ? String(row.sn).toUpperCase() : '';
    return {
      chassis: address.chassis ?? 0,
      slot: address.slot ?? null,
      pon: address.pon ?? null,
      onu_id: Number.isFinite(onuId) ? onuId : null,
      web_portid: Number(row.portid),
      port: row.port || null,
      sn: normalizedSn || null,
      vendor: normalizedSn ? normalizedSn.slice(0, 4) : null,
      model: this.cleanWebDescription(row.equid, row.model) || 'Tarmoc Live',
      status,
      run_state: row.run_state || status,
      member_state: row.member_state || null,
      description: this.cleanWebDescription(row.id_desc, row.ont_desc),
      down_cause: row.reason || null,
      down_cause_label: row.reason || null,
      last_down_time: null,
      down_duration: row.down_duration || null,
      up_duration: row.up_duration || null,
      source: TARMOC_WEB_SOURCE,
      detail_source: TARMOC_WEB_SOURCE,
      snmp_onu_index:
        address.slot != null && address.pon != null && Number.isFinite(onuId)
          ? `${address.pon}/${address.slot}/${onuId}`
          : null,
    };
  }

  async readWebOnuStatus() {
    const firstPage = await this.fetchWebPage('/configchn/gponOntStatus.asp?inputport=0&chan=gpon');
    if (!firstPage?.text) return [];
    const ports = this.parseWebArrayAssignments(firstPage.text, 'gponPorts')
      .map((row) => Number(row.portno))
      .filter((portNo) => Number.isFinite(portNo) && portNo > 0);
    const pages = [];
    if (ports.length) {
      for (const portNo of ports) {
        const page = await this.fetchWebPage(
          `/configchn/gponOntStatus.asp?inputport=${portNo}&chan=gpon`
        ).catch(() => null);
        pages.push(page?.text || '');
      }
    } else {
      pages.push(firstPage.text);
    }

    const byKey = new Map();
    for (const text of pages) {
      const rows = [
        ...this.parseWebArrayAssignments(text, 'gponOntOnlineInfo').map((row) =>
          this.buildWebOnuItem(row, this.normalizeWebOnuStatus(row.run_state, 'online'))
        ),
        ...this.parseWebArrayAssignments(text, 'gponOntOfflineInfo').map((row) =>
          this.buildWebOnuItem(row, 'offline')
        ),
      ].filter((item) => item.sn || item.onu_id != null);
      for (const item of rows) {
        const key = this.normalizeSnValue(item.sn) || `${item.web_portid}:${item.onu_id}`;
        byKey.set(key, item);
      }
    }
    return Array.from(byKey.values());
  }

  async readWebAutoFindOnus() {
    const firstPage = await this.fetchWebPage('/configchn/gponOntAutoFindList.asp?inputport=0&chan=gpon');
    if (!firstPage?.text) return [];
    const ports = this.parseWebArrayAssignments(firstPage.text, 'gponPorts')
      .map((row) => Number(row.portno))
      .filter((portNo) => Number.isFinite(portNo) && portNo > 0);
    const pages = [];
    if (ports.length) {
      for (const portNo of ports) {
        const page = await this.fetchWebPage(
          `/configchn/gponOntAutoFindList.asp?inputport=${portNo}&chan=gpon`
        ).catch(() => null);
        pages.push(page?.text || '');
      }
    } else {
      pages.push(firstPage.text);
    }
    const byKey = new Map();
    for (const text of pages) {
      const rows = this.parseWebArrayAssignments(text, 'gponOntAFList')
        .map((row) => this.buildWebOnuItem(row, 'unregistered'))
        .filter((item) => item.sn || item.onu_id != null);
      for (const item of rows) {
        const key = this.normalizeSnValue(item.sn) || `${item.web_portid}:${item.onu_id}`;
        byKey.set(key, item);
      }
    }
    return Array.from(byKey.values());
  }

  splitWebOpticalPower(value) {
    const [first, second] = String(value || '').split('/');
    return {
      first: this.formatWebDbm(first),
      second: this.formatWebDbm(second),
    };
  }

  parseWebOpticalRows(text) {
    return this.parseWebArrayAssignments(text, 'gponOntOnlineOptical').map((row) => {
      const address = this.parseTarmocWebPort(row.port);
      const onuId = Number(row.ont);
      const rx = this.splitWebOpticalPower(row.rx_power);
      const tx = this.splitWebOpticalPower(row.tx_power);
      const optical = {
        chassis: address.chassis ?? 0,
        slot: address.slot ?? null,
        pon: address.pon ?? null,
        onu_id: Number.isFinite(onuId) ? onuId : null,
        web_portid: Number(row.portid),
        port: row.port || null,
        rx_power: rx.first,
        olt_tx_power: rx.second,
        tx_power: tx.first,
        olt_rx_power: tx.second,
        onu_temperature_c: this.parseWebNumber(row.temperature),
        onu_voltage_v: this.parseWebNumber(row.voltage),
        onu_bias_ma: this.parseWebNumber(row.bias),
        optical_source: TARMOC_WEB_SOURCE,
      };
      optical.keys = [
        Number.isFinite(optical.web_portid) && optical.onu_id != null
          ? `${optical.web_portid}:${optical.onu_id}`
          : null,
        optical.port && optical.onu_id != null ? `${optical.port}:${optical.onu_id}` : null,
        optical.pon != null && optical.slot != null && optical.onu_id != null
          ? `${optical.pon}/${optical.slot}/${optical.onu_id}`
          : null,
      ].filter(Boolean);
      return optical;
    });
  }

  async readWebOpticalMapForItems(items = []) {
    const portIds = Array.from(
      new Set(
        items
          .map((item) => Number(item.web_portid))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    );
    if (!portIds.length) return new Map();

    const map = new Map();
    for (const portId of portIds) {
      const page = await this.fetchWebPage(
        `/configchn/gponOntAllOptical.asp?inputport=${portId}&chan=gpon`
      );
      for (const optical of this.parseWebOpticalRows(page?.text || '')) {
        for (const key of optical.keys) {
          map.set(key, optical);
        }
      }
    }
    return map;
  }

  mergeWebOpticalInfo(items = [], opticalMap = new Map()) {
    return items.map((item) => {
      const keys = [
        Number.isFinite(Number(item.web_portid)) && item.onu_id != null
          ? `${Number(item.web_portid)}:${item.onu_id}`
          : null,
        item.port && item.onu_id != null ? `${item.port}:${item.onu_id}` : null,
        this.getTarmocOntPath(item),
      ].filter(Boolean);
      const optical = keys.map((key) => opticalMap.get(key)).find(Boolean);
      if (!optical) return item;
      return {
        ...item,
        rx_power: optical.rx_power || item.rx_power,
        tx_power: optical.tx_power || item.tx_power,
        olt_tx_power: optical.olt_tx_power || item.olt_tx_power,
        olt_rx_power: optical.olt_rx_power || item.olt_rx_power,
        optical_source: optical.optical_source || item.optical_source,
        onu_temperature_c: optical.onu_temperature_c ?? item.onu_temperature_c,
        onu_voltage_v: optical.onu_voltage_v ?? item.onu_voltage_v,
        onu_bias_ma: optical.onu_bias_ma ?? item.onu_bias_ma,
      };
    });
  }

  async getWebOnuDetail(onu) {
    const items = await this.readWebOnuStatus();
    const normalizedSn = this.normalizeSnValue(onu?.sn);
    const targetPath = this.getTarmocOntPath(onu);
    const item = items.find((candidate) => {
      const candidateSn = this.normalizeSnValue(candidate.sn);
      return (
        (normalizedSn && candidateSn === normalizedSn) ||
        (targetPath && this.getTarmocOntPath(candidate) === targetPath)
      );
    });
    if (!item) return null;
    const opticalMap = await this.readWebOpticalMapForItems([item]).catch(() => new Map());
    return this.mergeWebOpticalInfo([item], opticalMap)[0];
  }

  parseOpticalInfoTable(stdout) {
    const lines = String(stdout || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const map = new Map();
    for (const line of lines) {
      const match = line.match(
        /^(\d+)\/(\d+)\/(\d+)\s+\S+\s+([-\d.]+)\/([-\d.]+)\s+([-\d.]+)\/([-\d.]+)\s+([-\d.]+)$/
      );
      if (!match) continue;
      const key = `${match[1]}/${match[2]}/${match[3]}`;
      map.set(key, {
        rx_power: `${match[4]} dBm`,
        olt_tx_power: `${match[5]} dBm`,
        tx_power: `${match[6]} dBm`,
        olt_rx_power: `${match[7]} dBm`,
        laser_bias_current: `${match[8]} mA`,
      });
    }
    return map;
  }

  buildSnmpOnuIndex(onu) {
    const pon = Number(onu?.pon);
    const onuId = Number(onu?.onu_id);
    if (!Number.isInteger(pon) || !Number.isInteger(onuId) || pon < 1 || onuId < 1) return null;
    return (pon - 1) * 128 + (onuId - 1);
  }

  readSnmpString(values, oid) {
    const value = values?.get(oid)?.value;
    if (value == null) return null;
    return String(value).replace(/^"|"$/g, '').trim() || null;
  }

  normalizeSnmpStatus(value) {
    const status = Number(value);
    return status === 1 ? 'online' : status === 2 ? 'offline' : null;
  }

  async getSnmpOnuInfo(onu) {
    const index = this.buildSnmpOnuIndex(onu);
    if (index == null) return null;

    const base = '.1.3.6.1.4.1.8888.1.14.1.1.2.6.1';
    const nameOid = `${base}.2.${index}`;
    const snOid = `${base}.5.${index}`;
    const slotOid = `${base}.9.${index}`;
    const ponOid = `${base}.10.${index}`;
    const onuIdOid = `${base}.11.${index}`;
    const runStateOid = `${base}.13.${index}`;
    const configStateOid = `${base}.14.${index}`;
    const values = await snmpGet({
      olt: this.olt,
      oids: [nameOid, snOid, slotOid, ponOid, onuIdOid, runStateOid, configStateOid],
      timeoutMs: 2500,
    });

    if (!values) return null;

    const sn = this.readSnmpString(values, snOid);
    if (sn && this.normalizeSnValue(sn) !== this.normalizeSnValue(onu?.sn)) return null;

    const slot = Number(this.readSnmpString(values, slotOid));
    const pon = Number(this.readSnmpString(values, ponOid));
    const onuId = Number(this.readSnmpString(values, onuIdOid));
    const runStateValue = this.readSnmpString(values, runStateOid);
    const configStateValue = this.readSnmpString(values, configStateOid);

    return {
      sn: sn ? sn.toUpperCase() : onu.sn,
      vendor: sn ? sn.slice(0, 4).toUpperCase() : onu.vendor,
      model: 'Tarmoc Live',
      slot: Number.isFinite(slot) ? slot : onu.slot,
      pon: Number.isFinite(pon) ? pon : onu.pon,
      onu_id: Number.isFinite(onuId) ? onuId : onu.onu_id,
      description: this.readSnmpString(values, nameOid),
      status: this.normalizeSnmpStatus(runStateValue) || onu.status,
      run_state: runStateValue,
      config_state: configStateValue,
      detail_source: 'snmp',
      snmp_onu_index: index,
    };
  }

  validateProvisioningTarget({ action, onu, profile }) {
    super.validateProvisioningTarget({ action, onu, profile });

    if (onu?.slot == null || onu?.pon == null || onu?.onu_id == null) {
      throw new HttpError(422, 'Slot, PON, dan ONU ID wajib terisi dari discovery live sebelum provisioning Tarmoc');
    }

    if (!profile?.line_profile) {
      throw new HttpError(422, 'Profile Tarmoc wajib punya line_profile yang sesuai konfigurasi OLT');
    }

    if ((profile?.internet_service_enabled || profile?.tr069_service_enabled) && !profile?.tcont_profile) {
      throw new HttpError(422, 'Profile Tarmoc wajib punya tcont_profile/DBA profile untuk provisioning live');
    }

    if ((profile?.internet_service_enabled || profile?.tr069_service_enabled) && !profile?.gem_profile) {
      throw new HttpError(422, 'Profile Tarmoc wajib punya gem_profile/VLAN profile untuk provisioning live');
    }

    if (profile?.internet_service_enabled && profile?.mode === 'router') {
      throw new HttpError(422, 'Mode router internet belum bisa dieksekusi tanpa kredensial PPPoE di profile');
    }
  }

  async getBulkOnuDetails(items = []) {
    const onlineItems = items.filter((item) => String(item.status || '').toLowerCase() === 'online');
    if (!onlineItems.length) {
      return items.map((item) => ({ ...item }));
    }

    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['enable', 'display ont optical-info interface gpon all'],
      allowWrite: false,
    });

    if (!execution.success) {
      const opticalMap = await this.readWebOpticalMapForItems(onlineItems).catch(() => new Map());
      if (opticalMap.size) {
        return this.mergeWebOpticalInfo(items, opticalMap);
      }
      return items.map((item) => ({ ...item }));
    }

    const opticalOutput =
      execution.outputs?.find((item) => item.command === 'display ont optical-info interface gpon all')?.stdout || '';
    const opticalMap = this.parseOpticalInfoTable(opticalOutput);

    return items.map((item) => {
      const key = this.getTarmocOntPath(item);
      const optical = key ? opticalMap.get(key) : null;
      if (!optical) {
        return { ...item };
      }
      return {
        ...item,
        rx_power: optical.rx_power,
        tx_power: optical.tx_power,
        olt_tx_power: optical.olt_tx_power,
        olt_rx_power: optical.olt_rx_power,
        optical_source: 'live-olt',
      };
    });
  }

  async getOnuDetail(onu) {
    let detail = {
      ...onu,
      last_seen: new Date().toISOString(),
      status: onu.status || 'unregistered',
      detail_source: 'database',
      services: {
        internet: false,
        tr069: false,
      },
    };

    const snmpInfo = await this.getSnmpOnuInfo(onu);
    if (snmpInfo) {
      detail = {
        ...detail,
        ...snmpInfo,
        id: onu.id,
        olt_id: onu.olt_id,
        olt_name: onu.olt_name,
        olt_vendor: onu.olt_vendor,
        discovered_at: onu.discovered_at,
        last_seen: new Date().toISOString(),
        rx_power: detail.rx_power,
        tx_power: detail.tx_power,
        services: detail.services,
      };
    }

    const webInfo = await this.getWebOnuDetail(onu).catch(() => null);
    if (webInfo) {
      detail = {
        ...detail,
        ...webInfo,
        id: onu.id,
        olt_id: onu.olt_id,
        olt_name: onu.olt_name,
        olt_vendor: onu.olt_vendor,
        discovered_at: onu.discovered_at,
        last_seen: new Date().toISOString(),
        description: webInfo.description || detail.description,
        rx_power: webInfo.rx_power ?? detail.rx_power,
        tx_power: webInfo.tx_power ?? detail.tx_power,
        services: detail.services,
        detail_source:
          detail.detail_source === 'snmp' ? `snmp+${TARMOC_WEB_SOURCE}` : TARMOC_WEB_SOURCE,
      };
    }

    const ontPath = this.getTarmocOntPath(onu);
    if (!ontPath || String(detail.status || '').toLowerCase() !== 'online') {
      return detail;
    }

    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['enable', `display ont optical-info ${ontPath}`],
      allowWrite: false,
    });

    if (!execution.success) {
      return detail;
    }

    const opticalOutput =
      execution.outputs?.find((item) => item.command === `display ont optical-info ${ontPath}`)?.stdout || '';

    const rxMatch = opticalOutput.match(/Rx Optical Power\(dBm\)\s*:\s*([-\d.]+)\s+\(OLT Tx:\s*([-\d.]+)\)/i);
    const txMatch = opticalOutput.match(/Tx Optical Power\(dBm\)\s*:\s*([-\d.]+)\s+\(OLT Rx:\s*([-\d.]+)\)/i);

    return {
      ...detail,
      rx_power: rxMatch ? `${rxMatch[1]} dBm` : detail.rx_power,
      tx_power: txMatch ? `${txMatch[1]} dBm` : detail.tx_power,
      olt_tx_power: rxMatch ? `${rxMatch[2]} dBm` : null,
      olt_rx_power: txMatch ? `${txMatch[2]} dBm` : null,
      optical_source: 'live-olt',
      detail_source: detail.detail_source === 'snmp' ? 'snmp+live-olt' : 'live-olt',
    };
  }

  supportsOnuDescriptionUpdate() {
    return true;
  }

  supportsOnuDelete() {
    return true;
  }

  async deleteOnuFromOlt({ onu }) {
    const resolution = await this.resolveTarmocSpecificProfilePath(onu);
    if (!resolution.profilePath) {
      throw new HttpError(422, 'Slot, PON, dan ONU ID wajib terisi untuk delete ONU Tarmoc');
    }

    const commands = [
      'enable',
      'system-view',
      `undo specific-profile ${resolution.profilePath}`,
      `undo rule-profile ${resolution.profilePath}`,
      'end',
    ];
    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite: true,
      timeoutMs: 60000,
    });
    const deleteOutputs = execution.outputs || [];
    const failedOutput = this.detectCommandFailure(
      deleteOutputs.filter(
        (entry) =>
          !(
            /^undo\s+(specific-profile|rule-profile)\b/i.test(entry.command || '') &&
            /Noentry/i.test(`${entry.stdout || ''}\n${entry.stderr || ''}`)
          )
      )
    );
    let verification = null;
    if (execution.success && !failedOutput) {
      const verifyCommands = [
        'enable',
        `display ont info ${resolution.profilePath}`,
        `display current-config | include ${resolution.profilePath}`,
      ];
      const verifyExecution = await executeOltCommands({
        olt: this.olt,
        password: decryptSecret(this.olt.password_encrypted),
        commands: verifyCommands,
        allowWrite: false,
        timeoutMs: 30000,
      }).catch(() => null);
      const infoOutput =
        verifyExecution?.outputs?.find((entry) => entry.command === verifyCommands[1])?.stdout || '';
      const configOutput =
        verifyExecution?.outputs?.find((entry) => entry.command === verifyCommands[2])?.stdout || '';
      const configLines = configOutput
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && line !== verifyCommands[2] && !/^[<[]?GPON/i.test(line));
      verification = {
        commands: verifyCommands,
        outputs: verifyExecution?.outputs || [],
        ont_absent: /Total entries:\s*0\b/i.test(infoOutput),
        config_absent: !configLines.some((line) => line.includes(resolution.profilePath)),
      };
    }
    const success = Boolean(
      execution.success &&
        !failedOutput &&
        (!verification || (verification.ont_absent && verification.config_absent))
    );
    return {
      success,
      message: success
        ? `Delete ONU ${onu.sn} berhasil dikirim ke OLT Tarmoc`
        : `Delete ONU ${onu.sn} gagal dikirim ke OLT Tarmoc`,
      live_mode: Boolean(execution.live_mode),
      transport: execution.transport || this.olt.protocol,
      commands,
      outputs: deleteOutputs,
      error: execution.error || execution.message || (failedOutput ? failedOutput.stdout || failedOutput.stderr : null),
      profile_path: resolution.profilePath,
      profile_resolution: {
        exists_in_web: resolution.profileExists,
        candidates: resolution.candidates,
      },
      verification,
    };
  }

  buildOnuDescriptionCommands({ onu, description, profilePath: resolvedProfilePath }) {
    const profilePath = resolvedProfilePath || this.getTarmocWebProfilePath(onu);
    if (!profilePath) {
      throw new HttpError(422, 'Slot, PON, dan ONU ID wajib terisi untuk edit description Tarmoc');
    }
    return [
      'enable',
      'system-view',
      `specific-profile ${profilePath}`,
      `description ${description}`,
      'commit',
      'end',
    ];
  }

  async readWebSpecificProfiles() {
    const page = await this.fetchWebPage('/configchn/gponProfileSpec.asp?chan=gpon');
    if (!page?.text) return [];
    return this.parseWebArrayAssignments(page.text, 'profileInfo');
  }

  async updateWebOnuDescription({ onu, description, profilePath: resolvedProfilePath, profiles: resolvedProfiles }) {
    const profilePath = resolvedProfilePath || this.getTarmocWebProfilePath(onu);
    if (!profilePath) {
      throw new HttpError(422, 'Slot, PON, dan ONU ID wajib terisi untuk edit description Web Tarmoc');
    }

    const profiles = resolvedProfiles || (await this.readWebSpecificProfiles());
    const row = profiles.find((item) => item.prfId === profilePath);
    if (!row) {
      throw new HttpError(404, `Specific profile ${profilePath} tidak ditemukan di Web UI Tarmoc`);
    }

    const form = new URLSearchParams({
      userType: '1',
      url: '/configchn/gponProfileSpec.asp',
      chan: 'gpon',
      language: '0',
      ontId: '',
    });
    const index = Number(row.index);
    form.set(`editRowPrfId${index}`, row.prfId || profilePath);
    form.set(`editRowPrfName${index}`, row.prfName || '');
    form.set(`editRowPrfSpOntDesc${index}`, description);
    form.set(`editRowPrfSpAlrmPrf${index}`, row.prfSpAlrmPrf || '');
    form.set(`editRowPrfSpMcstPrf${index}`, row.prfSpMcstPrf || '');
    form.set(`editRowPrfSpWifiPrf${index}`, row.prfSpWifiPrf || '');

    const result = await this.fetchWebPage('/goform/SetProfileSpec', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    if (!result) {
      throw new HttpError(502, 'Web UI Tarmoc tidak merespons saat edit description');
    }

    const updatedProfiles = await this.readWebSpecificProfiles();
    const updated = updatedProfiles.find((item) => item.prfId === profilePath);
    const success = updated?.prfSpOntDesc === description;
    return {
      success,
      message: success
        ? `Description ONU ${onu.sn} berhasil dikirim via Web UI Tarmoc`
        : `Edit description Web UI Tarmoc belum terkonfirmasi untuk ${onu.sn}`,
      live_mode: true,
      transport: TARMOC_WEB_SOURCE,
      commands: [`POST /goform/SetProfileSpec ${profilePath}`],
      outputs: [],
      error: success ? null : 'Description baru tidak ditemukan saat verifikasi Web UI',
      web_profile: profilePath,
    };
  }

  async updateOnuDescription({ onu, description }) {
    const resolution = await this.resolveTarmocSpecificProfilePath(onu);
    const commands = this.buildOnuDescriptionCommands({
      onu,
      description,
      profilePath: resolution.profilePath,
    });
    const execution = await executeOltCommands({
      olt: this.olt,
      password: decryptSecret(this.olt.password_encrypted),
      commands,
      allowWrite: true,
    });

    const failedOutput = this.detectCommandFailure(execution.outputs || []);
    const cliResult = {
      success: Boolean(execution.success && !failedOutput),
      message:
        execution.error ||
        execution.message ||
        (failedOutput
          ? `Edit description selesai dengan indikasi error pada command: ${failedOutput.command}`
          : `Description ONU ${onu.sn} berhasil dikirim ke OLT`),
      live_mode: Boolean(execution.live_mode),
      transport: execution.transport || this.olt.protocol,
      commands,
      outputs: execution.outputs || [],
      error: execution.error || execution.message || (failedOutput ? failedOutput.stdout || failedOutput.stderr : null),
      profile_path: resolution.profilePath,
      profile_resolution: {
        exists_in_web: resolution.profileExists,
        candidates: resolution.candidates,
      },
    };

    if (cliResult.success || !this.olt?.web_port) {
      return cliResult;
    }

    const webResult = await this.updateWebOnuDescription({
      onu,
      description,
      profilePath: resolution.profilePath,
      profiles: resolution.profiles,
    }).catch((error) => ({
      success: false,
      message: error.message || 'Fallback Web UI Tarmoc gagal',
      live_mode: true,
      transport: TARMOC_WEB_SOURCE,
      commands: [],
      outputs: [],
      error: error.message,
    }));

    if (webResult.success) {
      return {
        ...webResult,
        cli_fallback_from: {
          transport: cliResult.transport,
          message: cliResult.message,
          error: cliResult.error,
        },
      };
    }

    return {
      ...cliResult,
      message: `${cliResult.message || 'Edit description CLI Tarmoc gagal'}; fallback Web UI gagal: ${webResult.message}`,
      web_result: webResult,
      error: cliResult.error || webResult.error,
    };
  }

  getTarmocConfigLoadProgressPath(onu) {
    const portId = Number.isFinite(Number(onu?.web_portid))
      ? Number(onu.web_portid)
      : Number.isFinite(Number(onu?.pon))
        ? Number(onu.pon) + 8
        : 65535;
    const onuId = Number.isFinite(Number(onu?.onu_id)) ? Number(onu.onu_id) : 0;
    return `/configchn/gponOntDispCfgLoad.asp?inputport=${portId}&inputont=${onuId}&chan=gpon`;
  }

  formatTarmocSnString(sn) {
    const normalized = this.normalizeSnValue(sn);
    if (/^[A-Z0-9]{12}$/.test(normalized)) {
      return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
    }
    return String(sn || '').trim().toUpperCase();
  }

  formatTarmocSnHex(sn) {
    const normalized = this.normalizeSnValue(sn);
    if (/^[A-Z0-9]{12}$/.test(normalized)) {
      const vendorHex = Buffer.from(normalized.slice(0, 4), 'ascii').toString('hex').toUpperCase();
      return `${vendorHex}${normalized.slice(4)}`;
    }
    return '';
  }

  buildOntConfigLoadPlan({
    onu,
    tftpServer,
    cfgFile,
    matchType = 'sn',
    snType = 'string',
    snStringHex,
    snHex,
    ontList: resolvedOntList,
  }) {
    const ontList = resolvedOntList || this.getTarmocWebProfilePath(onu);
    const targetMode = matchType === 'ont' ? 'ont' : 'sn';
    const targetSnType = snType === 'hex' ? 'hex' : 'string';
    const targetSnStringHex = String(snStringHex || '').trim().toUpperCase() || this.formatTarmocSnString(onu?.sn);
    const targetSnHex = String(snHex || '').trim().toUpperCase() || this.formatTarmocSnHex(onu?.sn);
    if (targetMode === 'ont' && !ontList) {
      throw new HttpError(422, 'Slot, PON, dan ONU ID wajib terisi untuk Configuration Load Tarmoc');
    }
    if (targetMode === 'sn' && targetSnType === 'string' && !targetSnStringHex) {
      throw new HttpError(422, 'SN ONU wajib terisi untuk SN Match Configuration Load Tarmoc');
    }
    if (targetMode === 'sn' && targetSnType === 'hex' && !targetSnHex) {
      throw new HttpError(422, 'SN Hex wajib terisi untuk SN Match Configuration Load Tarmoc');
    }
    const progressPath = this.getTarmocConfigLoadProgressPath(onu);
    const cliTarget =
      targetMode === 'ont'
        ? ontList
        : targetSnType === 'hex'
          ? `sn hex ${targetSnHex}`
          : `sn string-hex ${targetSnStringHex}`;
    const cliCommand = `load ont-configuration tftp ip-address ${tftpServer} ${cfgFile} ${cliTarget}`;
    return {
      plan: [
        'enable',
        'system-view',
        cliCommand,
        'end',
        ontList ? `display ont upgrade-progress ont-configuration ${ontList}` : `GET ${progressPath}`,
      ].filter(Boolean),
      result: {
        ont_list: targetMode === 'ont' ? ontList : null,
        progress_ont_list: ontList,
        sn_type: targetMode === 'sn' ? targetSnType : null,
        sn_string_hex: targetMode === 'sn' && targetSnType === 'string' ? targetSnStringHex : null,
        sn_hex: targetMode === 'sn' && targetSnType === 'hex' ? targetSnHex : null,
        cli_command: cliCommand,
        tftp_server: tftpServer,
        cfg_file: cfgFile,
        match_type: targetMode,
        source: 'tftp',
        progress_path: progressPath,
        scope: 'tarmoc-ont-xml-configuration-load',
      },
    };
  }

  parseOntConfigLoadProgress(text) {
    return this.parseWebArrayAssignments(text, 'ontCLoadList').map((row) => ({
      port: row.port || null,
      ont: row.ont || null,
      main_version: row.main_ver || null,
      secondary_version: row.secon_ver || null,
      result: row.result || null,
      progress: row.progress || null,
      description: this.cleanWebDescription(row.id_desc),
    }));
  }

  parseOntConfigLoadCliProgress(text) {
    return String(text || '')
      .split('\n')
      .map((line) => line.trim())
      .map((line) => {
        const match = line.match(
          /^(\d+\/\d+\/\d+)\s+(\S+)\s+(\S+)\s+(.+?)\s+(\d+%)$/i
        );
        if (!match) return null;
        return {
          port: null,
          ont: match[1],
          main_version: match[2],
          secondary_version: match[3],
          result: match[4].trim(),
          progress: match[5],
          description: null,
        };
      })
      .filter(Boolean);
  }

  getOntConfigLoadFailure(progress = []) {
    return progress.find((row) => /\bfail(?:ed)?\b|error|reject|invalid/i.test(row.result || ''));
  }

  async loadOntConfigFromTftp({
    onu,
    tftpServer,
    cfgFile,
    matchType = 'sn',
    snType = 'string',
    snStringHex,
    snHex,
  }) {
    const resolution = await this.resolveTarmocSpecificProfilePath(onu);
    const preview = this.buildOntConfigLoadPlan({
      onu,
      tftpServer,
      cfgFile,
      matchType,
      snType,
      snStringHex,
      snHex,
      ontList: resolution.profilePath,
    });
    const password = decryptSecret(this.olt.password_encrypted);
    const execution = await executeOltCommands({
      olt: this.olt,
      password,
      commands: ['enable', 'system-view', preview.result.cli_command, 'end'],
      allowWrite: true,
      timeoutMs: 60000,
    });
    if (!execution.success) {
      throw new HttpError(502, execution.error || 'CLI Tarmoc gagal menjalankan Configuration Load');
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
    let progress = [];
    let progressOutput = null;
    if (preview.result.progress_ont_list) {
      const progressCommand = `display ont upgrade-progress ont-configuration ${preview.result.progress_ont_list}`;
      const progressExecution = await executeOltCommands({
        olt: this.olt,
        password,
        commands: ['enable', progressCommand],
        allowWrite: false,
        timeoutMs: 30000,
      }).catch(() => null);
      progressOutput = progressExecution?.outputs?.find((item) => item.command === progressCommand)?.stdout || null;
      progress = this.parseOntConfigLoadCliProgress(progressOutput);
    }
    if (!progress.length) {
      const progressPage = await this.fetchWebPage(preview.result.progress_path).catch(() => null);
      progress = progressPage?.text ? this.parseOntConfigLoadProgress(progressPage.text) : [];
    }
    const failedOutput = this.detectCommandFailure?.(execution.outputs || []);
    const failedProgress = this.getOntConfigLoadFailure(progress);
    const success = !failedProgress && !failedOutput;
    const targetLabel =
      preview.result.match_type === 'sn'
        ? preview.result.sn_type === 'hex'
          ? `SN Hex ${preview.result.sn_hex}`
          : `SN ${preview.result.sn_string_hex}`
        : `ONT ${preview.result.ont_list}`;

    return {
      success,
      message: failedProgress
        ? `Configuration Load XML ${cfgFile} gagal untuk ${targetLabel}: ${failedProgress.result} ${failedProgress.progress || ''}`.trim()
        : `Configuration Load XML ${cfgFile} dikirim ke ${targetLabel}`,
      live_mode: true,
      transport: 'cli-tarmoc',
      plan: preview.plan,
      commands: [
        'enable',
        'system-view',
        preview.result.cli_command,
        'end',
        preview.result.progress_ont_list
          ? `display ont upgrade-progress ont-configuration ${preview.result.progress_ont_list}`
          : `GET ${preview.result.progress_path}`,
      ],
      result: {
        ...preview.result,
        cli_status: failedOutput ? 'failed' : 'accepted',
        cli_output: execution.outputs,
        progress_output: progressOutput,
        progress,
        note: failedProgress
          ? 'OLT menerima request dan mengambil file, tetapi Load Progress Tarmoc melaporkan gagal.'
          : 'Request CLI sudah dikirim ke OLT. Hasil akhir tetap perlu dicek di Load Progress.',
      },
      outputs: execution.outputs || [],
      error: failedProgress
        ? `Tarmoc Load Progress: ${failedProgress.result} ${failedProgress.progress || ''}`.trim()
        : failedOutput
          ? failedOutput.stdout || failedOutput.stderr
          : null,
    };
  }

  supportsOntConfigLoad() {
    return true;
  }

  getCommandCatalog({ action, onu, profile }) {
    const gponIf = this.getTarmocGponInterface(onu);
    const profilePath = this.getTarmocProfilePath(onu);
    const lanPorts = [1, 2, 3, 4]
      .filter((index) => profile?.[`lan${index}_enabled`])
      .map((index) => `lan${index}`);
    const dbaProfile = profile?.tcont_profile || '<tcont-profile>';
    const vlanProfile = profile?.gem_profile || '<gem-profile>';
    const lineProfile = profile?.line_profile || '<line-profile>';
    const serviceName = profile?.internet_service_enabled ? 'INTERNET' : 'TR069';

    return [
      this.buildPlanStep('connect', 'enable', `Login ke OLT ${this.olt.name}`),
      this.buildPlanStep('configure', 'system-view', 'Masuk mode konfigurasi Tarmoc'),
      this.buildPlanStep(
        'discover',
        TARMOC_LIVE_TEMPLATE.discoveryCommands[0],
        'Validasi autofind dan auto-config GPON yang aktif'
      ),
      this.buildPlanStep(
        'authorize',
        action === 'register'
          ? `interface gpon ${gponIf}\nsn-auth string-hex ${onu.sn} line-profile ${lineProfile}\nquit`
          : `display current-config | include ${onu.sn}`,
        action === 'register'
          ? 'Authorize ONU berdasarkan serial number dan line profile'
          : 'Validasi ONU sudah ada di running config'
      ),
      this.buildPlanStep(
        'specific-profile',
        `specific-profile ${profilePath}`,
        'Masuk context service profile ONT'
      ),
      this.buildPlanStep(
        'dba-tcont',
        `tcont 1 dba-profile ${dbaProfile}`,
        'Bind DBA/T-CONT untuk ONU'
      ),
      this.buildPlanStep(
        'gem-vlan-profile',
        `gem 1 tcont 1 vlan-profile ${vlanProfile}`,
        'Bind GEM ke VLAN profile'
      ),
      this.buildPlanStep(
        'vlan-mapping',
        profile?.internet_service_enabled
          ? `mapping 0 vlan ${profile.vlan_internet} gem 1`
          : profile?.tr069_service_enabled
            ? `mapping 0 port iphost vlan ${profile.vlan_tr069} gem 1`
            : 'skip',
        'Map service VLAN ke GEM sesuai pola konfigurasi Tarmoc'
      ),
      this.buildPlanStep(
        'internet-vlan',
        profile?.internet_service_enabled
          ? `ont wan-config 2 mode bridge service-name ${serviceName} service-type internet ${lanPorts.join(' ')} vlan ${profile.vlan_internet}`
          : 'skip',
        'Buat service internet pada ONT'
      ),
      this.buildPlanStep(
        'tr069-vlan',
        profile?.tr069_service_enabled
          ? `ont wan-config 1 mode route dhcp service-type tr069 vlan ${profile.vlan_tr069}`
          : 'skip',
        'Buat VLAN TR-069'
      ),
      this.buildPlanStep(
        'tr069-acs',
        'skip',
        'ACS diatur lewat action TR069 terpisah agar URL tidak memakai placeholder'
      ),
      this.buildPlanStep('end-profile', 'quit', 'Keluar dari context service profile ONT'),
      this.buildPlanStep('commit', 'commit', 'Simpan perubahan pada context aktif'),
      this.buildPlanStep('save', 'display current-config | include sn-auth', 'Verifikasi config ONU muncul'),
      this.buildPlanStep(
        'verify',
        TARMOC_LIVE_TEMPLATE.verificationCommands[0],
        'Verifikasi konfigurasi WAN ONT dan service aktif'
      ),
    ];
  }

  getProbePresets() {
    return [
      {
        key: 'identity',
        title: 'Tarmoc Identity',
        description: 'Read-only probe untuk baca prompt, version, dan hostname Tarmoc',
        commands: ['enable', 'display current-config if', TARMOC_LIVE_TEMPLATE.discoveryCommands[0]],
      },
      {
        key: 'pon-discovery',
        title: 'Tarmoc PON Discovery',
        description: 'Read-only probe untuk karakter output discovery ONU Tarmoc',
        commands: [
          'enable',
          ...TARMOC_LIVE_TEMPLATE.discoveryCommands,
        ],
      },
      {
        key: 'onu-status',
        title: 'Tarmoc ONU Status',
        description: 'Read-only probe untuk status ONU, optics, dan service summary',
        commands: [
          'enable',
          'display current-config | include ont',
          TARMOC_LIVE_TEMPLATE.verificationCommands[0],
          TARMOC_LIVE_TEMPLATE.verificationCommands[1],
        ],
      },
      {
        key: 'profile-map',
        title: 'Tarmoc Profile Map',
        description: 'Read-only probe untuk line profile dan service profile yang ada',
        commands: [
          'enable',
          'display current-config | include tcont',
          'display current-config | include vlan-profile',
          'display current-config | include gem',
          TARMOC_LIVE_TEMPLATE.verificationCommands[2],
        ],
      },
    ];
  }

  buildTr069WanPlan({
    onu,
    acsUrl,
    setAcs,
  }) {
    const profilePath = this.getTarmocProfilePath(onu);
    const commands = [
      'enable',
      'system-view',
      `specific-profile ${profilePath}`,
    ];
    if (setAcs && acsUrl) {
      commands.push('ont tr069-acs');
      commands.push(`ont tr069-acs-server url ${acsUrl} inform enable interval 120`);
      commands.push('ont tr069-stun');
      commands.push(`ont tr069-stun-server url ${acsUrl}`);
    }
    commands.push('commit');
    commands.push('end');
    return commands;
  }

  async ensureTr069Wan({
    onu,
    vlan,
    acsUrl,
    setAcs,
    natEnabled = false,
  }) {
    const profilePath = this.getTarmocProfilePath(onu);
    const commands = this.buildTr069WanPlan({
      onu,
      acsUrl,
      setAcs,
    });
    return {
      success: true,
      message: `GenieACS URL push plan ready for ${onu.sn} on specific-profile ${profilePath}`,
      plan: commands,
      result: {
        profile_path: profilePath,
        iphost_mapping: 'skipped',
        tr069_vlan: vlan || null,
        nat_enabled: Boolean(natEnabled),
        nat_policy: 'not changed',
        dba_profile: null,
        vlan_profile: null,
        acs_url: acsUrl || null,
        set_acs: Boolean(setAcs),
        stun_url: acsUrl || null,
        set_stun: Boolean(setAcs && acsUrl),
        scope: 'genieacs-and-stun-url-only',
      },
    };
  }

  supportsTr069Wan() {
    return true;
  }
}
