'use strict';

const DEFAULT_BASE_URL = 'http://127.0.0.1:7557';
const HTTP_TIMEOUT_MS = Math.max(3000, Number(process.env.GENIEACS_HTTP_TIMEOUT_MS || 10000) || 10000);
const HIGH_REDAMAN_THRESHOLD_DBM = -26.5;

const DEFAULT_USERNAME_PARAMETERS = [
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANPPPConnection.1.Username',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.4.WANPPPConnection.1.Username',
  'Device.PPP.Interface.1.Username'
];

const DEFAULT_RX_POWER_PARAMETERS = [
  'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_HW_EponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.WANEthernetInterfaceConfig.X_ZTE-COM_RxPower',
  'InternetGatewayDevice.X_HW_RMS.PonStatus.RXPower',
  'Device.Optical.Interface.1.RXPower'
];

const DEFAULT_WIFI_PASSWORD_PARAMETERS = [
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.PreSharedKey.1.KeyPassphrase',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.KeyPassphrase',
  'Device.WiFi.AccessPoint.1.Security.KeyPassphrase'
];

const DEFAULT_WIFI_SSID_PARAMETERS = [
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID',
  'Device.WiFi.SSID.1.SSID'
];

const DEFAULT_WIFI_5G_SSID_PARAMETERS = [
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.SSID',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.SSID',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.SSID',
  'Device.WiFi.SSID.5.SSID',
  'Device.WiFi.SSID.2.SSID'
];

const DEFAULT_WIFI_CLIENT_COUNT_PARAMETERS = [
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDeviceNumberOfEntries',
  'Device.WiFi.AccessPoint.1.AssociatedDeviceNumberOfEntries'
];

const DEFAULT_WIFI_5G_CLIENT_COUNT_PARAMETERS = [
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.TotalAssociations',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.TotalAssociations',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.TotalAssociations',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDeviceNumberOfEntries',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.AssociatedDeviceNumberOfEntries',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.AssociatedDeviceNumberOfEntries',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.AssociatedDeviceNumberOfEntries',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.WLAN_AssociatedDeviceNumberOfEntries',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.WLAN_AssociatedDeviceNumberOfEntries',
  'Device.WiFi.AccessPoint.5.AssociatedDeviceNumberOfEntries',
  'Device.WiFi.AccessPoint.2.AssociatedDeviceNumberOfEntries'
];

const WIFI_CONFIGURATION_INDEXES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WIFI_5G_CONFIGURATION_INDEXES = new Set([5, 6, 7, 8, 10]);

function cleanText(value = '') {
  return String(value || '').trim();
}

function validIpv4(value = '') {
  const parts = cleanText(value).split('.');
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function normalizeSettings(settings = {}) {
  const raw = settings.genieAcs && typeof settings.genieAcs === 'object' ? settings.genieAcs : settings;
  const baseUrl = cleanText(process.env.GENIEACS_BASE_URL || raw.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  return {
    enabled: raw.enabled === true || ['1', 'true', 'yes', 'on'].includes(String(process.env.GENIEACS_ENABLED || raw.enabled || '').toLowerCase()),
    baseUrl,
    token: cleanText(process.env.GENIEACS_TOKEN || raw.token || ''),
    connectionRequest: raw.connectionRequest !== false,
    usernameParameters: DEFAULT_USERNAME_PARAMETERS.slice(),
    rxPowerParameters: DEFAULT_RX_POWER_PARAMETERS.slice(),
    wifiPasswordParameters: DEFAULT_WIFI_PASSWORD_PARAMETERS.slice(),
    wifiSsidParameters: DEFAULT_WIFI_SSID_PARAMETERS.slice(),
    wifi5gSsidParameters: DEFAULT_WIFI_5G_SSID_PARAMETERS.slice(),
    wifiClientCountParameters: DEFAULT_WIFI_CLIENT_COUNT_PARAMETERS.slice(),
    wifi5gClientCountParameters: DEFAULT_WIFI_5G_CLIENT_COUNT_PARAMETERS.slice()
  };
}

function configured(settings = {}) {
  const cfg = normalizeSettings(settings);
  return Boolean(cfg.enabled && cfg.baseUrl);
}

function urlFor(cfg, pathname, params = {}) {
  const url = new URL(`${cfg.baseUrl}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function requestJson(settings = {}, pathname, options = {}) {
  const cfg = normalizeSettings(settings);
  if (!configured(cfg)) {
    throw new Error('GenieACS belum aktif atau base URL belum diisi');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const url = urlFor(cfg, pathname, options.query || {});
    const response = await fetch(url, {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
        ...(options.headers || {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }
    if (!response.ok) {
      throw new Error(`GenieACS HTTP ${response.status}${payload?.message ? `: ${payload.message}` : ''}`);
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('GenieACS timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getPathValue(source = {}, path = '') {
  if (!path) return '';
  const direct = source[path];
  if (direct && typeof direct === 'object' && Object.prototype.hasOwnProperty.call(direct, '_value')) {
    return cleanText(direct._value);
  }
  if (direct !== undefined && direct !== null && typeof direct !== 'object') {
    return cleanText(direct);
  }
  const value = path.split('.').reduce((node, part) => {
    if (!node || typeof node !== 'object') return undefined;
    return node[part];
  }, source);
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '_value')) {
    return cleanText(value._value);
  }
  if (value === undefined || value === null || typeof value === 'object') return '';
  return cleanText(value);
}

function getPathState(source = {}, path = '') {
  if (!path) return { exists: false, path: '', value: '', writable: false };
  const value = path.split('.').reduce((node, part) => {
    if (!node || typeof node !== 'object') return undefined;
    return node[part];
  }, source);
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '_value')) {
    return {
      exists: true,
      path,
      value: cleanText(value._value),
      writable: value._writable === true
    };
  }
  if (value !== undefined && value !== null && typeof value !== 'object') {
    return {
      exists: true,
      path,
      value: cleanText(value),
      writable: false
    };
  }
  return { exists: false, path, value: '', writable: false };
}

function firstParameter(device = {}, paths = []) {
  for (const path of paths) {
    const value = getPathValue(device, path);
    if (value) return { path, value };
  }
  return { path: '', value: '' };
}

function firstIpParameter(device = {}, paths = []) {
  let fallback = { path: '', value: '' };
  for (const path of paths) {
    const value = getPathValue(device, path);
    if (!value) continue;
    if (!fallback.value) fallback = { path, value };
    if (validIpv4(value)) return { path, value };
  }
  return fallback;
}

function pppIpParameterCandidates(usernameParameter = '') {
  const parameter = cleanText(usernameParameter);
  const candidates = [];
  if (parameter.endsWith('.Username')) {
    const base = parameter.replace(/\.Username$/, '');
    candidates.push(
      `${base}.ExternalIPAddress`,
      `${base}.X_HW_ExternalIPAddress`,
      `${base}.X_ZTE-COM_ExternalIPAddress`,
      `${base}.X_FH_ExternalIPAddress`,
      `${base}.IPAddress`,
      `${base}.IPCP.LocalIPAddress`
    );
    const connectionBase = base.replace(/\.WANPPPConnection\.\d+$/, '');
    if (connectionBase !== base) {
      candidates.push(
        `${connectionBase}.WANIPConnection.1.ExternalIPAddress`,
        `${connectionBase}.WANIPConnection.1.X_HW_ExternalIPAddress`,
        `${connectionBase}.WANIPConnection.1.X_ZTE-COM_ExternalIPAddress`,
        `${connectionBase}.WANIPConnection.1.IPAddress`
      );
    }
  }
  candidates.push(
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.4.WANPPPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1.ExternalIPAddress',
    'Device.PPP.Interface.1.IPCP.LocalIPAddress',
    'Device.IP.Interface.1.IPv4Address.1.IPAddress',
    'Device.IP.Interface.2.IPv4Address.1.IPAddress'
  );
  return [...new Set(candidates)];
}

function normalizeRxPower(value = '', parameter = '') {
  const text = cleanText(value);
  if (!text) return '';
  const number = Number(text);
  if (Number.isFinite(number)) {
    if (/ZTE/i.test(parameter) && number > 0) {
      return `${(-number / 10).toLocaleString('id-ID', { maximumFractionDigits: 2 })} dBm`;
    }
    if (number < -100 || number > 100) return `${(number / 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })} dBm`;
    return `${number.toLocaleString('id-ID', { maximumFractionDigits: 2 })} dBm`;
  }
  return text;
}

function rxPowerNumber(value = '', parameter = '') {
  const text = cleanText(value);
  if (!text) return null;
  const number = Number(text.replace(',', '.').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(number)) return null;
  if (/ZTE/i.test(parameter) && number > 0) return -number / 10;
  if (number < -100 || number > 100) return number / 100;
  return number;
}

function rxPowerSummaryText(value) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return `${number.toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  })} dBm`;
}

function highRedamanCount(values = []) {
  return values.filter((value) => Number.isFinite(Number(value)) && Number(value) <= HIGH_REDAMAN_THRESHOLD_DBM).length;
}

function normalizeCount(value = '') {
  const number = Number(cleanText(value));
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function truthyWifiValue(value = '') {
  return ['1', 'true', 'yes', 'on', 'up', 'enabled'].includes(cleanText(value).toLowerCase());
}

function wifiConfigBase(index) {
  return `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${index}`;
}

function wifiPasswordParameterCandidates(index) {
  const base = wifiConfigBase(index);
  return [
    `${base}.PreSharedKey.1.KeyPassphrase`,
    `${base}.KeyPassphrase`
  ];
}

function wifiClientCountCandidates(index) {
  const base = wifiConfigBase(index);
  return [
    `${base}.TotalAssociations`,
    `${base}.AssociatedDeviceNumberOfEntries`,
    `${base}.WLAN_AssociatedDeviceNumberOfEntries`
  ];
}

function wifiBandForIndex(index, ssid = '') {
  if (WIFI_5G_CONFIGURATION_INDEXES.has(Number(index)) || /(^|[^0-9])5g([^0-9]|$)|5 ghz/i.test(ssid)) {
    return '5G';
  }
  return '2.4G';
}

function firstExistingParameter(device = {}, paths = []) {
  for (const path of paths) {
    const state = getPathState(device, path);
    if (state.exists) return state;
  }
  return { exists: false, path: '', value: '', writable: false };
}

function normalizeWifiNetworks(device = {}) {
  return WIFI_CONFIGURATION_INDEXES.map((index) => {
    const base = wifiConfigBase(index);
    const ssid = getPathState(device, `${base}.SSID`);
    if (!ssid.value) return null;
    const enable = getPathState(device, `${base}.Enable`);
    const status = getPathState(device, `${base}.Status`);
    const enabled = enable.exists
      ? truthyWifiValue(enable.value)
      : (status.exists ? truthyWifiValue(status.value) : true);
    const password = firstExistingParameter(device, wifiPasswordParameterCandidates(index));
    const securityValues = [
      getPathState(device, `${base}.BeaconType`).value,
      getPathState(device, `${base}.BasicAuthenticationMode`).value,
      getPathState(device, `${base}.WPAAuthenticationMode`).value,
      getPathState(device, `${base}.WPAEncryptionModes`).value,
      getPathState(device, `${base}.IEEE11iAuthenticationMode`).value,
      getPathState(device, `${base}.IEEE11iEncryptionModes`).value
    ].filter(Boolean);
    const securityText = securityValues.join(' / ');
    const securityEnabled = Boolean(password.value) || /wpa|11i|psk/i.test(securityText);
    const clients = firstParameter(device, wifiClientCountCandidates(index));
    const band = wifiBandForIndex(index, ssid.value);
    return {
      index,
      band,
      label: `${band} - ${ssid.value}`,
      ssid: ssid.value,
      ssidParameter: ssid.path,
      enableParameter: enable.path,
      password: password.value,
      passwordParameter: password.path,
      passwordWritable: password.writable,
      securityText,
      securityEnabled,
      clients: normalizeCount(clients.value),
      clientsParameter: clients.path,
      status: status.value || (enabled ? 'Up' : 'Disabled'),
      enabled
    };
  }).filter(Boolean);
}

function safeTags(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, 8);
}

function normalizeDevice(device = {}, settings = {}) {
  const cfg = normalizeSettings(settings);
  const username = firstParameter(device, cfg.usernameParameters);
  const pppIpAddress = firstIpParameter(device, pppIpParameterCandidates(username.path));
  const rxPower = firstParameter(device, cfg.rxPowerParameters);
  const ssid24 = firstParameter(device, cfg.wifiSsidParameters);
  const ssid5 = firstParameter(device, cfg.wifi5gSsidParameters);
  const clients24 = firstParameter(device, cfg.wifiClientCountParameters);
  const clients5 = firstParameter(device, cfg.wifi5gClientCountParameters);
  const wifiNetworks = normalizeWifiNetworks(device);
  const activeWifiNetworks = wifiNetworks.filter((item) => item.enabled);
  const wifi24 = activeWifiNetworks.find((item) => item.band === '2.4G') || wifiNetworks.find((item) => item.band === '2.4G');
  const wifi5 = activeWifiNetworks.find((item) => item.band === '5G') || wifiNetworks.find((item) => item.band === '5G');
  const wifiClients24 = wifiNetworks.length
    ? activeWifiNetworks.filter((item) => item.band === '2.4G').reduce((sum, item) => sum + item.clients, 0)
    : normalizeCount(clients24.value);
  const wifiClients5 = wifiNetworks.length
    ? activeWifiNetworks.filter((item) => item.band === '5G').reduce((sum, item) => sum + item.clients, 0)
    : normalizeCount(clients5.value);
  const serial = cleanText(device._deviceId?._SerialNumber)
    || getPathValue(device, 'InternetGatewayDevice.DeviceInfo.SerialNumber')
    || getPathValue(device, 'Device.DeviceInfo.SerialNumber');
  const productClass = cleanText(device._deviceId?._ProductClass)
    || getPathValue(device, 'InternetGatewayDevice.DeviceInfo.ProductClass')
    || getPathValue(device, 'Device.DeviceInfo.ProductClass');
  const manufacturer = getPathValue(device, 'InternetGatewayDevice.DeviceInfo.Manufacturer')
    || getPathValue(device, 'Device.DeviceInfo.Manufacturer')
    || cleanText(device._deviceId?._Manufacturer);
  const lastInform = cleanText(device._lastInform);
  const lastInformTime = Date.parse(lastInform);
  const online = Number.isFinite(lastInformTime) && Date.now() - lastInformTime <= 15 * 60 * 1000;
  return {
    id: cleanText(device._id),
    tags: safeTags(device._tags),
    oui: cleanText(device._deviceId?._OUI),
    serialNumber: serial,
    productClass,
    manufacturer,
    username: username.value,
    usernameParameter: username.path,
    ipAddress: pppIpAddress.value,
    ipAddressParameter: pppIpAddress.path,
    rxPower: rxPower.value,
    rxPowerValue: rxPowerNumber(rxPower.value, rxPower.path),
    rxPowerText: normalizeRxPower(rxPower.value, rxPower.path),
    rxPowerParameter: rxPower.path,
    ssid24: wifi24?.ssid || ssid24.value,
    ssid24Parameter: wifi24?.ssidParameter || ssid24.path,
    ssid5: wifi5?.ssid || ssid5.value,
    ssid5Parameter: wifi5?.ssidParameter || ssid5.path,
    wifiClients24,
    wifiClients24Parameter: wifi24?.clientsParameter || clients24.path,
    wifiClients5,
    wifiClients5Parameter: wifi5?.clientsParameter || clients5.path,
    wifiClientsTotal: wifiClients24 + wifiClients5,
    wifiNetworks,
    lastInform,
    online,
    status: online ? 'online' : 'offline'
  };
}

function searchQuery(search = '') {
  const text = cleanText(search);
  if (!text) return {};
  const matcher = { $regex: text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  return {
    $or: [
      { _id: matcher },
      { '_deviceId._SerialNumber': matcher },
      { '_deviceId._ProductClass': matcher },
      { 'InternetGatewayDevice.DeviceInfo.SerialNumber._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANPPPConnection.1.Username._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.4.WANPPPConnection.1.Username._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.ExternalIPAddress._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.ExternalIPAddress._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANPPPConnection.1.ExternalIPAddress._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.4.WANPPPConnection.1.ExternalIPAddress._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress._value': matcher },
      { 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1.ExternalIPAddress._value': matcher },
      { 'Device.PPP.Interface.1.IPCP.LocalIPAddress._value': matcher },
      { 'Device.IP.Interface.1.IPv4Address.1.IPAddress._value': matcher },
      { 'Device.IP.Interface.2.IPv4Address.1.IPAddress._value': matcher }
    ]
  };
}

async function listDevices(settings = {}, options = {}) {
  const cfg = normalizeSettings(settings);
  const query = searchQuery(options.search || '');
  const status = cleanText(options.status || 'all').toLowerCase();
  const rawRows = await requestJson(cfg, '/devices/', {
    query: {
      query: JSON.stringify(query)
    }
  });
  const rows = Array.isArray(rawRows) ? rawRows.map((device) => normalizeDevice(device, cfg)) : [];
  const filteredRows = ['online', 'offline'].includes(status)
    ? rows.filter((row) => row.status === status)
    : rows;
  const rxValues = rows
    .map((row) => row.rxPowerValue)
    .filter((value) => Number.isFinite(Number(value)));
  const rxAverage = rxValues.length
    ? rxValues.reduce((sum, value) => sum + Number(value), 0) / rxValues.length
    : null;
  const redamanHighCount = highRedamanCount(rxValues);
  const page = Math.max(1, Number(options.page || 1) || 1);
  const limit = Math.max(1, Math.min(100, Number(options.limit || 10) || 10));
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * limit;
  return {
    ok: true,
    enabled: cfg.enabled,
    configured: configured(cfg),
    baseUrl: cfg.baseUrl,
    rows: filteredRows.slice(offset, offset + limit),
    summary: {
      total: rows.length,
      online: rows.filter((row) => row.online).length,
      offline: rows.filter((row) => !row.online).length,
      filtered: filteredRows.length,
      redamanCount: rxValues.length,
      redamanHighCount,
      redamanHighThreshold: HIGH_REDAMAN_THRESHOLD_DBM,
      redamanHighThresholdText: rxPowerSummaryText(HIGH_REDAMAN_THRESHOLD_DBM),
      redamanAverage: rxAverage,
      redamanAverageText: rxPowerSummaryText(rxAverage)
    },
    pagination: {
      page: currentPage,
      limit,
      total,
      totalPages,
      hasPrev: currentPage > 1,
      hasNext: currentPage < totalPages
    }
  };
}

async function getDevice(settings = {}, deviceId = '') {
  const cfg = normalizeSettings(settings);
  const query = JSON.stringify({ _id: cleanText(deviceId) });
  const rows = await requestJson(cfg, '/devices/', { query: { query } });
  const device = Array.isArray(rows) ? rows[0] : null;
  return device ? normalizeDevice(device, cfg) : null;
}

async function findDevice(settings = {}, search = '') {
  const result = await listDevices(settings, { search, page: 1, limit: 1 });
  return result.rows[0] || null;
}

async function task(settings = {}, deviceId = '', body = {}) {
  const cfg = normalizeSettings(settings);
  const query = cfg.connectionRequest ? { connection_request: 'true' } : {};
  return requestJson(cfg, `/devices/${encodeURIComponent(cleanText(deviceId))}/tasks`, {
    method: 'POST',
    query,
    body
  });
}

async function refreshDevice(settings = {}, deviceId = '') {
  return task(settings, deviceId, { name: 'refreshObject', objectName: '' });
}

async function reboot(settings = {}, deviceId = '') {
  return task(settings, deviceId, { name: 'reboot' });
}

async function deleteDevice(settings = {}, deviceId = '') {
  const cfg = normalizeSettings(settings);
  const cleanId = cleanText(deviceId);
  if (!cleanId) throw new Error('ID perangkat GenieACS tidak tersedia');
  return requestJson(cfg, `/devices/${encodeURIComponent(cleanId)}`, {
    method: 'DELETE'
  });
}

async function setWifiPassword(settings = {}, deviceId = '', password = '', parameter = '') {
  const cfg = normalizeSettings(settings);
  const cleanPassword = cleanText(password);
  if (cleanPassword.length < 8) {
    throw new Error('Password WiFi minimal 8 karakter');
  }
  const param = cleanText(parameter) || cfg.wifiPasswordParameters[0];
  if (!param) {
    throw new Error('Parameter password WiFi GenieACS belum diatur');
  }
  return task(cfg, deviceId, {
    name: 'setParameterValues',
    parameterValues: [[param, cleanPassword, 'xsd:string']]
  });
}

async function setWifiSsid(settings = {}, deviceId = '', ssid = '', band = '2.4g', parameter = '') {
  const cfg = normalizeSettings(settings);
  const cleanSsid = cleanText(ssid);
  if (cleanSsid.length < 1 || cleanSsid.length > 32) {
    throw new Error('Nama WiFi/SSID wajib 1-32 karakter');
  }
  const selectedBand = cleanText(band).toLowerCase();
  const candidates = selectedBand === '5g' ? cfg.wifi5gSsidParameters : cfg.wifiSsidParameters;
  const param = cleanText(parameter) || candidates[0];
  if (!param) {
    throw new Error('Parameter SSID GenieACS belum diatur');
  }
  return task(cfg, deviceId, {
    name: 'setParameterValues',
    parameterValues: [[param, cleanSsid, 'xsd:string']]
  });
}

function assertWifiParameter(path = '', suffixes = []) {
  const cleanPath = cleanText(path);
  const ok = /^InternetGatewayDevice\.LANDevice\.1\.WLANConfiguration\.\d+\./.test(cleanPath)
    && suffixes.some((suffix) => cleanPath.endsWith(suffix));
  if (!ok) {
    throw new Error('Parameter WiFi tidak valid');
  }
  return cleanPath;
}

function wifiBaseFromSsidParameter(path = '') {
  return assertWifiParameter(path, ['.SSID']).replace(/\.SSID$/, '');
}

function wifiBaseFromPasswordParameter(path = '') {
  return assertWifiParameter(path, [
    '.PreSharedKey.1.KeyPassphrase',
    '.KeyPassphrase'
  ]).replace(/(\.PreSharedKey\.1\.KeyPassphrase|\.KeyPassphrase)$/, '');
}

async function setWifiCredentials(settings = {}, deviceId = '', payload = {}) {
  const cleanSsid = cleanText(payload.ssid);
  if (cleanSsid.length < 1 || cleanSsid.length > 32) {
    throw new Error('Nama WiFi/SSID wajib 1-32 karakter');
  }
  const ssidParameter = assertWifiParameter(payload.ssidParameter || payload.parameter, ['.SSID']);
  const base = wifiBaseFromSsidParameter(ssidParameter);
  const values = [
    [`${base}.Enable`, true, 'xsd:boolean'],
    [ssidParameter, cleanSsid, 'xsd:string'],
    [`${base}.BasicEncryptionModes`, 'None', 'xsd:string']
  ];
  if (payload.usePassword !== false) {
    const cleanPassword = cleanText(payload.password);
    if (cleanPassword.length < 8 || cleanPassword.length > 63) {
      throw new Error('Password WPA/WPA2 wajib 8-63 karakter');
    }
    const passwordParameter = assertWifiParameter(payload.passwordParameter, [
      '.PreSharedKey.1.KeyPassphrase',
      '.KeyPassphrase'
    ]);
    if (wifiBaseFromPasswordParameter(passwordParameter) !== base) {
      throw new Error('Parameter password WiFi tidak sesuai dengan SSID yang dipilih');
    }
    values.push(
      [`${base}.BeaconType`, 'WPAand11i', 'xsd:string'],
      [`${base}.WPAAuthenticationMode`, 'PSKAuthentication', 'xsd:string'],
      [`${base}.WPAEncryptionModes`, 'TKIPEncryption', 'xsd:string'],
      [`${base}.IEEE11iAuthenticationMode`, 'PSKAuthentication', 'xsd:string'],
      [`${base}.IEEE11iEncryptionModes`, 'AESEncryption', 'xsd:string'],
      [passwordParameter, cleanPassword, 'xsd:string']
    );
  } else {
    values.push(
      [`${base}.BeaconType`, 'Basic', 'xsd:string'],
      [`${base}.BasicAuthenticationMode`, 'OpenSystem', 'xsd:string']
    );
  }
  return task(settings, deviceId, {
    name: 'setParameterValues',
    parameterValues: values
  });
}

async function setWifiSsidAndOptionalPassword(settings = {}, deviceId = '', payload = {}) {
  const cleanSsid = cleanText(payload.ssid);
  if (cleanSsid.length < 1 || cleanSsid.length > 32) {
    throw new Error('Nama WiFi/SSID wajib 1-32 karakter');
  }
  const ssidParameter = assertWifiParameter(payload.ssidParameter || payload.parameter, ['.SSID']);
  const base = wifiBaseFromSsidParameter(ssidParameter);
  const values = [
    [`${base}.Enable`, true, 'xsd:boolean'],
    [ssidParameter, cleanSsid, 'xsd:string']
  ];
  const cleanPassword = cleanText(payload.password);
  if (cleanPassword) {
    if (cleanPassword.length < 8 || cleanPassword.length > 63) {
      throw new Error('Password WPA/WPA2 wajib 8-63 karakter');
    }
    const passwordParameter = assertWifiParameter(payload.passwordParameter, [
      '.PreSharedKey.1.KeyPassphrase',
      '.KeyPassphrase'
    ]);
    if (wifiBaseFromPasswordParameter(passwordParameter) !== base) {
      throw new Error('Parameter password WiFi tidak sesuai dengan SSID yang dipilih');
    }
    values.push(
      [`${base}.BeaconType`, 'WPAand11i', 'xsd:string'],
      [`${base}.WPAAuthenticationMode`, 'PSKAuthentication', 'xsd:string'],
      [`${base}.WPAEncryptionModes`, 'TKIPEncryption', 'xsd:string'],
      [`${base}.IEEE11iAuthenticationMode`, 'PSKAuthentication', 'xsd:string'],
      [`${base}.IEEE11iEncryptionModes`, 'AESEncryption', 'xsd:string'],
      [passwordParameter, cleanPassword, 'xsd:string']
    );
  }
  return task(settings, deviceId, {
    name: 'setParameterValues',
    parameterValues: values
  });
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_RX_POWER_PARAMETERS,
  DEFAULT_USERNAME_PARAMETERS,
  DEFAULT_WIFI_5G_CLIENT_COUNT_PARAMETERS,
  DEFAULT_WIFI_5G_SSID_PARAMETERS,
  DEFAULT_WIFI_CLIENT_COUNT_PARAMETERS,
  DEFAULT_WIFI_PASSWORD_PARAMETERS,
  DEFAULT_WIFI_SSID_PARAMETERS,
  configured,
  deleteDevice,
  findDevice,
  getDevice,
  listDevices,
  normalizeDevice,
  normalizeSettings,
  reboot,
  refreshDevice,
  setWifiCredentials,
  setWifiSsidAndOptionalPassword,
  setWifiPassword,
  setWifiSsid
};
