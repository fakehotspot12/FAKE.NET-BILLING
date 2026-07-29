'use strict';

const DEFAULT_BASE_URL = 'http://127.0.0.1:7557';
const HTTP_TIMEOUT_MS = Math.max(3000, Number(process.env.GENIEACS_HTTP_TIMEOUT_MS || 10000) || 10000);
const HIGH_REDAMAN_THRESHOLD_DBM = -26.5;
const DEVICE_LIST_CACHE_TTL_MS = Math.max(0, Number(process.env.GENIEACS_DEVICE_CACHE_MS || 8000) || 8000);
const DEVICE_LIST_CACHE_MAX = 12;
const deviceListCache = new Map();

const DEFAULT_USERNAME_PARAMETERS = [
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANPPPConnection.1.Username',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.4.WANPPPConnection.1.Username',
  'Device.PPP.Interface.1.Username'
];

const DEFAULT_PPP_PASSWORD_PARAMETERS = DEFAULT_USERNAME_PARAMETERS
  .map((path) => path.replace(/\.Username$/, '.Password'));

const DEFAULT_RX_POWER_PARAMETERS = [
  'VirtualParameters.RXPower',
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

const DEFAULT_TEMPERATURE_PARAMETERS = [
  'VirtualParameters.gettemp',
  'InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.Temperature',
  'InternetGatewayDevice.WANDevice.1.X_CU_WANGPONInterfaceConfig.OpticalTransceiver.Temperature',
  'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_CMCC_EponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_CT-COM_EponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_FH_EponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_HW_EponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_HW_GponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.X_HW_RMS.PonStatus.TransceiverTemperature',
  'InternetGatewayDevice.X_HW_RMS.PonStatus.Temperature',
  'Device.Optical.Interface.1.Temperature',
  'Device.Optical.Interface.1.TransceiverTemperature',
  'InternetGatewayDevice.DeviceInfo.TemperatureStatus.TemperatureSensor.1.Value',
  'Device.DeviceInfo.TemperatureStatus.TemperatureSensor.1.Value'
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

const DEFAULT_LAN_CLIENT_COUNT_PARAMETERS = [
  'VirtualParameters.LANClients',
  'VirtualParameters.LANActiveClients',
  'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.AssociatedDeviceNumberOfEntries',
  'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.2.AssociatedDeviceNumberOfEntries',
  'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.3.AssociatedDeviceNumberOfEntries',
  'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.4.AssociatedDeviceNumberOfEntries',
  'Device.Ethernet.Interface.1.AssociatedDeviceNumberOfEntries',
  'Device.Ethernet.Interface.2.AssociatedDeviceNumberOfEntries',
  'Device.Ethernet.Interface.3.AssociatedDeviceNumberOfEntries',
  'Device.Ethernet.Interface.4.AssociatedDeviceNumberOfEntries'
];

const WIFI_CONFIGURATION_INDEXES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const WIFI_5G_CONFIGURATION_INDEXES = new Set([5, 6, 7, 8, 10]);

function cleanText(value = '') {
  return String(value || '').trim();
}

function normalizeUsernameSuffixes(value = []) {
  const rows = Array.isArray(value)
    ? value
    : String(value || '').split(/[\n,]/);
  return rows
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function rowExcludedByUsernameSuffix(row = {}, suffixes = []) {
  const username = cleanText(row.username).toLowerCase();
  if (!username) return false;
  return suffixes.some((suffix) => suffix && username.endsWith(suffix));
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
    pppPasswordParameters: DEFAULT_PPP_PASSWORD_PARAMETERS.slice(),
    rxPowerParameters: DEFAULT_RX_POWER_PARAMETERS.slice(),
    temperatureParameters: DEFAULT_TEMPERATURE_PARAMETERS.slice(),
    wifiPasswordParameters: DEFAULT_WIFI_PASSWORD_PARAMETERS.slice(),
    wifiSsidParameters: DEFAULT_WIFI_SSID_PARAMETERS.slice(),
    wifi5gSsidParameters: DEFAULT_WIFI_5G_SSID_PARAMETERS.slice(),
    wifiClientCountParameters: DEFAULT_WIFI_CLIENT_COUNT_PARAMETERS.slice(),
    wifi5gClientCountParameters: DEFAULT_WIFI_5G_CLIENT_COUNT_PARAMETERS.slice(),
    lanClientCountParameters: DEFAULT_LAN_CLIENT_COUNT_PARAMETERS.slice(),
    excludeUsernameSuffixes: normalizeUsernameSuffixes(process.env.GENIEACS_EXCLUDE_USERNAME_SUFFIXES || raw.excludeUsernameSuffixes || [])
  };
}

function configured(settings = {}) {
  const cfg = normalizeSettings(settings);
  return Boolean(cfg.enabled && cfg.baseUrl);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function pruneDeviceListCache() {
  while (deviceListCache.size > DEVICE_LIST_CACHE_MAX) {
    deviceListCache.delete(deviceListCache.keys().next().value);
  }
}

function clearDeviceListCache() {
  deviceListCache.clear();
}

function deviceListCacheKey(cfg = {}, query = {}, projection = '') {
  return [
    cfg.baseUrl,
    cfg.token ? `token:${cfg.token.length}:${cfg.token.slice(-6)}` : 'token:',
    JSON.stringify(query),
    projection
  ].join('|');
}

async function cachedDeviceRows(cfg = {}, query = {}, projection = '', refresh = false) {
  const cacheKey = deviceListCacheKey(cfg, query, projection);
  const now = Date.now();
  if (!refresh && DEVICE_LIST_CACHE_TTL_MS > 0) {
    const cached = deviceListCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cloneJson(cached.rows);
  }
  let rows;
  try {
    rows = await requestJson(cfg, '/devices/', {
      query: {
        query: JSON.stringify(query),
        ...(projection ? { projection } : {})
      }
    });
  } catch (error) {
    const status = Number(error.status || 0);
    const projectionTooLarge = projection && ([414, 431].includes(status) || /HTTP (414|431)/.test(error.message || ''));
    if (!projectionTooLarge) throw error;
    rows = await requestJson(cfg, '/devices/', {
      query: {
        query: JSON.stringify(query)
      }
    });
  }
  if (DEVICE_LIST_CACHE_TTL_MS > 0 && Array.isArray(rows)) {
    deviceListCache.set(cacheKey, {
      expiresAt: now + DEVICE_LIST_CACHE_TTL_MS,
      rows: cloneJson(rows)
    });
    pruneDeviceListCache();
  }
  return rows;
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
      const error = new Error(`GenieACS HTTP ${response.status}${payload?.message ? `: ${payload.message}` : ''}`);
      error.status = response.status;
      throw error;
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

function pppPasswordParameterCandidates(usernameParameter = '', fallbackParameters = DEFAULT_PPP_PASSWORD_PARAMETERS) {
  const candidates = [];
  const parameter = cleanText(usernameParameter);
  if (parameter.endsWith('.Username')) {
    candidates.push(parameter.replace(/\.Username$/, '.Password'));
  }
  for (const path of fallbackParameters || []) {
    const cleanPath = cleanText(path);
    if (cleanPath) candidates.push(cleanPath);
  }
  return [...new Set(candidates)];
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
    const normalized = rxPowerNumber(text, parameter);
    if (normalized === null) return '';
    return `${normalized.toLocaleString('id-ID', { maximumFractionDigits: 2 })} dBm`;
  }
  return text;
}

function rxPowerNumber(value = '', parameter = '') {
  const text = cleanText(value);
  if (!text) return null;
  const number = Number(text.replace(',', '.').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(number)) return null;
  if ([0, -255, 255, 65535, 32767].includes(number)) return null;
  if (/ZTE/i.test(parameter) && number > 0) return -number / 10;
  if (number > 0 && isRawPositiveRxParameter(parameter)) {
    const normalized = 30 + (Math.log10(number * Math.pow(10, -7)) * 10);
    return Number.isFinite(normalized) ? Math.ceil(normalized * 100) / 100 : null;
  }
  if (number < -100 || number > 100) return number / 100;
  return number;
}

function isRawPositiveRxParameter(parameter = '') {
  return /(CMCC|CT-COM|CU|FH|GPON|EPON|WANPON|Optical).*RXPower|RXPower.*(CMCC|CT-COM|CU|FH|GPON|EPON|WANPON|Optical)/i.test(parameter);
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

function normalizeTemperature(value = '') {
  const number = temperatureNumber(value);
  if (number === null) return '';
  return `${number.toLocaleString('id-ID', { maximumFractionDigits: 0 })} C`;
}

function temperatureNumber(value = '') {
  const text = cleanText(value);
  if (!text || text.toUpperCase() === 'N/A') return null;
  const number = Number(text.replace(',', '.').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(number)) return null;
  if ([0, -255, 255, 65535, 32767].includes(number)) return null;
  if (number > 1000 && number < 20000) return Math.round(convertTr069Temperature(number));
  if (number > 150 && number <= 1000) return Math.round(number / 10);
  if (number < 5 || number > 120) return null;
  return Math.round(number);
}

function convertTr069Temperature(rawValue) {
  const samples = [[11509, 45], [11876, 46], [10866, 42], [10592, 41], [11142, 43], [11968, 46]];
  const sumX = samples.reduce((sum, [x]) => sum + x, 0);
  const sumY = samples.reduce((sum, [, y]) => sum + y, 0);
  const sumXY = samples.reduce((sum, [x, y]) => sum + x * y, 0);
  const sumX2 = samples.reduce((sum, [x]) => sum + x * x, 0);
  const n = samples.length;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return slope * rawValue + intercept;
}

function redamanQuality(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  if (number <= HIGH_REDAMAN_THRESHOLD_DBM) return 'high';
  if (number <= -18) return 'normal';
  return 'good';
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

function deviceListProjection(cfg = normalizeSettings({})) {
  const paths = new Set([
    '_id',
    '_tags',
    '_lastInform',
    '_deviceId',
    'InternetGatewayDevice.DeviceInfo.SerialNumber',
    'InternetGatewayDevice.DeviceInfo.ProductClass',
    'InternetGatewayDevice.DeviceInfo.Manufacturer',
    'Device.DeviceInfo.SerialNumber',
    'Device.DeviceInfo.ProductClass',
    'Device.DeviceInfo.Manufacturer'
  ]);
  [
    cfg.usernameParameters,
    cfg.rxPowerParameters,
    cfg.temperatureParameters,
    cfg.wifiSsidParameters,
    cfg.wifi5gSsidParameters,
    cfg.wifiClientCountParameters,
    cfg.wifi5gClientCountParameters,
    cfg.lanClientCountParameters
  ].forEach((list) => (list || []).forEach((path) => cleanText(path) && paths.add(cleanText(path))));
  (cfg.usernameParameters || []).forEach((path) => {
    pppIpParameterCandidates(path).forEach((candidate) => paths.add(candidate));
  });
  for (const index of WIFI_CONFIGURATION_INDEXES) {
    const base = wifiConfigBase(index);
    [
      `${base}.SSID`,
      `${base}.Enable`,
      `${base}.Status`,
      `${base}.BeaconType`,
      `${base}.BasicAuthenticationMode`,
      `${base}.WPAAuthenticationMode`,
      `${base}.WPAEncryptionModes`,
      `${base}.IEEE11iAuthenticationMode`,
      `${base}.IEEE11iEncryptionModes`,
      ...wifiClientCountCandidates(index)
    ].forEach((path) => paths.add(path));
  }
  return [...paths].join(',');
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
    const passwordParameter = password.path || wifiPasswordParameterCandidates(index)[0] || '';
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
      passwordParameter,
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

function pathNode(source = {}, path = '') {
  if (!path) return null;
  return path.split('.').reduce((node, part) => {
    if (!node || typeof node !== 'object') return null;
    return node[part] || null;
  }, source);
}

function hostPrefixes(device = {}, basePath = '') {
  const prefixes = new Set();
  const node = pathNode(device, basePath);
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      if (/^\d+$/.test(String(key))) prefixes.add(`${basePath}.${key}`);
    }
  }
  const prefix = `${basePath}.`;
  for (const key of Object.keys(device || {})) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const index = rest.split('.')[0];
    if (/^\d+$/.test(index)) prefixes.add(`${basePath}.${index}`);
  }
  return [...prefixes];
}

function parameterValue(device = {}, prefix = '', suffixes = []) {
  for (const suffix of suffixes) {
    const value = getPathValue(device, `${prefix}.${suffix}`);
    if (value) return value;
  }
  return '';
}

function falseyClientValue(value = '') {
  return ['0', 'false', 'no', 'off', 'down', 'inactive', 'disabled', 'offline'].includes(cleanText(value).toLowerCase());
}

function trueyClientValue(value = '') {
  return ['1', 'true', 'yes', 'on', 'up', 'active', 'enabled', 'online', 'authenticated'].includes(cleanText(value).toLowerCase());
}

function clientLooksActive(device = {}, prefix = '', defaultActive = true) {
  const value = [
    parameterValue(device, prefix, ['Active']),
    parameterValue(device, prefix, ['Enable']),
    parameterValue(device, prefix, ['Status']),
    parameterValue(device, prefix, ['AssociatedDeviceAuthenticationState'])
  ].find((item) => item !== '');
  if (!value) return defaultActive;
  if (falseyClientValue(value)) return false;
  if (trueyClientValue(value)) return true;
  return defaultActive;
}

function hostActiveValue(device = {}, prefix = '') {
  return [
    getPathValue(device, `${prefix}.Active`),
    getPathValue(device, `${prefix}.Enable`),
    getPathValue(device, `${prefix}.Status`)
  ].find((value) => value !== '') || '';
}

function hostLooksActive(device = {}, prefix = '') {
  const value = hostActiveValue(device, prefix);
  if (value) {
    const normalized = cleanText(value).toLowerCase();
    return ['1', 'true', 'yes', 'on', 'up', 'active', 'enabled', 'online'].includes(normalized);
  }
  return Boolean(getPathValue(device, `${prefix}.IPAddress`) || getPathValue(device, `${prefix}.MACAddress`));
}

function hostInterfaceText(device = {}, prefix = '') {
  return [
    getPathValue(device, `${prefix}.Layer1Interface`),
    getPathValue(device, `${prefix}.Layer2Interface`),
    getPathValue(device, `${prefix}.InterfaceType`),
    getPathValue(device, `${prefix}.PhysAddress`),
    getPathValue(device, `${prefix}.ConnectionType`)
  ].filter(Boolean).join(' ').toLowerCase();
}

function hostLooksLan(device = {}, prefix = '') {
  const text = hostInterfaceText(device, prefix);
  if (/wifi|wi-fi|wlan|ssid|radio/i.test(text)) return false;
  return /ethernet|lanethernet|eth|lan/i.test(text);
}

function lanHostSummary(device = {}) {
  const prefixes = [
    ...hostPrefixes(device, 'InternetGatewayDevice.LANDevice.1.Hosts.Host'),
    ...hostPrefixes(device, 'Device.Hosts.Host')
  ];
  const activePrefixes = prefixes.filter((prefix) => hostLooksActive(device, prefix));
  return {
    activeTotal: activePrefixes.length,
    lanTotal: activePrefixes.filter((prefix) => hostLooksLan(device, prefix)).length
  };
}

function normalizeClientField(value = '') {
  const text = cleanText(value);
  return text && text !== '-' ? text : '';
}

function normalizeClientMac(value = '') {
  const text = normalizeClientField(value);
  if (!text) return '';
  const normalized = text.toUpperCase().replace(/-/g, ':');
  return /[A-F0-9]{2}/i.test(normalized) ? normalized : '';
}

function connectedClientKey(row = {}) {
  const mac = normalizeClientMac(row.macAddress);
  if (mac) return `mac:${mac}`;
  const ip = cleanText(row.ipAddress);
  if (ip) return `ip:${ip}`;
  return `name:${cleanText(row.name)}:${cleanText(row.type)}`;
}

function wifiAssociatedPrefixes(device = {}, index = 1) {
  const prefixes = [
    ...hostPrefixes(device, `${wifiConfigBase(index)}.AssociatedDevice`),
    ...hostPrefixes(device, `Device.WiFi.AccessPoint.${index}.AssociatedDevice`)
  ];
  return [...new Set(prefixes)];
}

function wifiClientRows(device = {}, network = {}) {
  const band = network.band || wifiBandForIndex(network.index, network.ssid);
  return wifiAssociatedPrefixes(device, network.index)
    .map((prefix) => {
      const macAddress = parameterValue(device, prefix, [
        'AssociatedDeviceMACAddress',
        'MACAddress',
        'PhysAddress'
      ]);
      const ipAddress = parameterValue(device, prefix, [
        'AssociatedDeviceIPAddress',
        'IPAddress',
        'IPv4Address'
      ]);
      const name = parameterValue(device, prefix, [
        'HostName',
        'Name',
        'AssociatedDeviceHostName',
        'AssociatedDeviceName',
        'ClientHostName',
        'DeviceName',
        'X_HW_HostName',
        'X_ZTE-COM_HostName'
      ]);
      if (!macAddress && !ipAddress && !name) return null;
      if (!clientLooksActive(device, prefix, true)) return null;
      return {
        type: band,
        name: name || '-',
        ipAddress: ipAddress || '-',
        macAddress: macAddress || '-',
        source: 'wifi'
      };
    })
    .filter(Boolean);
}

function hostClientRows(device = {}) {
  const prefixes = [
    ...hostPrefixes(device, 'InternetGatewayDevice.LANDevice.1.Hosts.Host'),
    ...hostPrefixes(device, 'Device.Hosts.Host')
  ];
  return [...new Set(prefixes)]
    .map((prefix) => {
      if (!hostLooksActive(device, prefix)) return null;
      const macAddress = parameterValue(device, prefix, ['MACAddress', 'PhysAddress', 'Layer2Address']);
      const ipAddress = parameterValue(device, prefix, ['IPAddress', 'IPv4Address']);
      const name = parameterValue(device, prefix, [
        'HostName',
        'Name',
        'Alias',
        'DeviceName',
        'ClientHostName',
        'X_HW_HostName',
        'X_ZTE-COM_HostName'
      ]);
      if (!macAddress && !ipAddress && !name) return null;
      return {
        type: hostLooksLan(device, prefix) ? 'LAN' : 'HOST',
        name: name || '-',
        ipAddress: ipAddress || '-',
        macAddress: macAddress || '-',
        interfaceText: hostInterfaceText(device, prefix),
        source: 'host'
      };
    })
    .filter(Boolean);
}

function mergeClientRowFromHosts(row = {}, hostRows = []) {
  const rowMac = normalizeClientMac(row.macAddress);
  const rowIp = normalizeClientField(row.ipAddress);
  const host = hostRows.find((item) => rowMac && normalizeClientMac(item.macAddress) === rowMac)
    || hostRows.find((item) => rowIp && normalizeClientField(item.ipAddress) === rowIp);
  if (!host) return row;
  return {
    ...row,
    name: normalizeClientField(row.name) || normalizeClientField(host.name) || '-',
    ipAddress: normalizeClientField(row.ipAddress) || normalizeClientField(host.ipAddress) || '-',
    macAddress: normalizeClientField(row.macAddress) || normalizeClientField(host.macAddress) || '-'
  };
}

function lanClientRows(device = {}, wifiRows = [], hostRows = hostClientRows(device)) {
  const wifiMacs = new Set(wifiRows.map((row) => normalizeClientMac(row.macAddress)).filter(Boolean));
  return hostRows
    .filter((row) => {
      const normalizedMac = normalizeClientMac(row.macAddress);
      if (normalizedMac && wifiMacs.has(normalizedMac)) return false;
      if (/wifi|wi-fi|wlan|ssid|radio/i.test(row.interfaceText || '')) return false;
      return row.type === 'LAN' || row.ipAddress || row.macAddress || row.name;
    })
    .map((row) => ({
      type: 'LAN',
      name: row.name || '-',
      ipAddress: row.ipAddress || '-',
      macAddress: row.macAddress || '-',
      source: 'lan'
    }));
}

function uniqueClientRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = connectedClientKey(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function connectedClientSummary(device = {}, wifiNetworks = [], counts = {}) {
  const activeNetworks = wifiNetworks.filter((network) => network.enabled !== false);
  const hostRows = hostClientRows(device);
  const wifiRows = uniqueClientRows(activeNetworks
    .flatMap((network) => wifiClientRows(device, network))
    .map((row) => mergeClientRowFromHosts(row, hostRows)));
  const lanRows = uniqueClientRows(lanClientRows(device, wifiRows, hostRows));
  const rows24 = wifiRows.filter((row) => row.type === '2.4G');
  const rows5 = wifiRows.filter((row) => row.type === '5G');
  const expected24 = Number(counts.wifi24 || 0);
  const expected5 = Number(counts.wifi5 || 0);
  const expectedLan = Number(counts.lan || 0);
  const connectedClients = uniqueClientRows([...rows24, ...rows5, ...lanRows]);
  return {
    connectedClients,
    wifi24: Math.max(expected24, rows24.length),
    wifi5: Math.max(expected5, rows5.length),
    lan: Math.max(expectedLan, lanRows.length),
    total: Math.max(connectedClients.length, expected24 + expected5 + expectedLan)
  };
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
  const temperature = firstParameter(device, cfg.temperatureParameters);
  const ssid24 = firstParameter(device, cfg.wifiSsidParameters);
  const ssid5 = firstParameter(device, cfg.wifi5gSsidParameters);
  const clients24 = firstParameter(device, cfg.wifiClientCountParameters);
  const clients5 = firstParameter(device, cfg.wifi5gClientCountParameters);
  const lanClientsParameter = firstParameter(device, cfg.lanClientCountParameters);
  const lanHosts = lanHostSummary(device);
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
  const explicitLanClients = normalizeCount(lanClientsParameter.value);
  const lanClients = Math.max(explicitLanClients, lanHosts.lanTotal);
  const clientSummary = connectedClientSummary(device, wifiNetworks, {
    wifi24: wifiClients24,
    wifi5: wifiClients5,
    lan: lanClients
  });
  const clientsTotal = Math.max(clientSummary.total, wifiClients24 + wifiClients5 + lanClients, lanHosts.activeTotal);
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
  const tags = safeTags(device._tags);
  return {
    id: cleanText(device._id),
    tags,
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
    temperature: temperature.value,
    temperatureValue: temperatureNumber(temperature.value),
    temperatureText: normalizeTemperature(temperature.value) || '-',
    temperatureParameter: temperature.path,
    ssid24: wifi24?.ssid || ssid24.value,
    ssid24Parameter: wifi24?.ssidParameter || ssid24.path,
    ssid5: wifi5?.ssid || ssid5.value,
    ssid5Parameter: wifi5?.ssidParameter || ssid5.path,
    wifiClients24,
    wifiClients24Parameter: wifi24?.clientsParameter || clients24.path,
    wifiClients5,
    wifiClients5Parameter: wifi5?.clientsParameter || clients5.path,
    lanClients,
    lanClientsParameter: lanClientsParameter.path,
    hostClientsTotal: lanHosts.activeTotal,
    clientsTotal,
    wifiClientsTotal: clientsTotal,
    connectedClients: clientSummary.connectedClients,
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

function filterRowsByNas(rows = [], selectedNas = 'all') {
  const selected = cleanText(selectedNas).toLowerCase();
  if (!selected || selected === 'all') return rows;
  return rows.filter((row) => [row.nasId, row.nasName, row.nasIpAddress]
    .some((value) => cleanText(value).toLowerCase() === selected));
}

async function listDevices(settings = {}, options = {}) {
  const cfg = normalizeSettings(settings);
  const query = searchQuery(options.search || '');
  const status = cleanText(options.status || 'all').toLowerCase();
  const redaman = cleanText(options.redaman || 'all').toLowerCase();
  const rawRows = await cachedDeviceRows(cfg, query, deviceListProjection(cfg), options.refresh === true);
  const rows = (Array.isArray(rawRows) ? rawRows.map((device) => normalizeDevice(device, cfg)) : [])
    .filter((row) => !rowExcludedByUsernameSuffix(row, cfg.excludeUsernameSuffixes));
  const filteredRows = rows.filter((row) => {
    const statusMatch = ['online', 'offline'].includes(status) ? row.status === status : true;
    const redamanMatch = ['good', 'normal', 'high'].includes(redaman)
      ? redamanQuality(row.rxPowerValue) === redaman
      : true;
    return statusMatch && redamanMatch;
  });
  const rxValues = rows
    .map((row) => row.rxPowerValue)
    .filter((value) => Number.isFinite(Number(value)));
  const rxAverage = rxValues.length
    ? rxValues.reduce((sum, value) => sum + Number(value), 0) / rxValues.length
    : null;
  const redamanHighCount = highRedamanCount(rxValues);
  const page = Math.max(1, Number(options.page || 1) || 1);
  const requestedLimit = cleanText(options.limit).toLowerCase() === 'all'
    ? Number.MAX_SAFE_INTEGER
    : Number(options.limit || 10) || 10;
  const limit = requestedLimit >= 1000000
    ? Number.MAX_SAFE_INTEGER
    : Math.max(1, Math.min(100, requestedLimit));
  const total = filteredRows.length;
  const totalPages = limit === Number.MAX_SAFE_INTEGER ? 1 : Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const offset = limit === Number.MAX_SAFE_INTEGER ? 0 : (currentPage - 1) * limit;
  return {
    ok: true,
    enabled: cfg.enabled,
    configured: configured(cfg),
    baseUrl: cfg.baseUrl,
    rows: limit === Number.MAX_SAFE_INTEGER ? filteredRows : filteredRows.slice(offset, offset + limit),
    summary: {
      total: rows.length,
      online: rows.filter((row) => row.online).length,
      offline: rows.filter((row) => !row.online).length,
      filtered: filteredRows.length,
      redamanCount: rxValues.length,
      redamanHighCount,
      redamanGoodCount: rxValues.filter((value) => redamanQuality(value) === 'good').length,
      redamanNormalCount: rxValues.filter((value) => redamanQuality(value) === 'normal').length,
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

async function getDevice(settings = {}, deviceId = '', options = {}) {
  const cfg = normalizeSettings(settings);
  const rows = await cachedDeviceRows(cfg, { _id: cleanText(deviceId) }, '', options.refresh === true);
  const device = Array.isArray(rows) ? rows[0] : null;
  return device ? normalizeDevice(device, cfg) : null;
}

async function findDevice(settings = {}, search = '', options = {}) {
  const result = await listDevices(settings, { search, page: 1, limit: 1, refresh: options.refresh === true });
  const row = result.rows[0] || null;
  if (!row || options.compact === true) return row;
  try {
    return await getDevice(settings, row.id, { refresh: options.refresh === true }) || row;
  } catch {
    return row;
  }
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
  const result = await requestJson(cfg, `/devices/${encodeURIComponent(cleanId)}`, {
    method: 'DELETE'
  });
  clearDeviceListCache();
  return result;
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
  const result = await task(cfg, deviceId, {
    name: 'setParameterValues',
    parameterValues: [[param, cleanPassword, 'xsd:string']]
  });
  clearDeviceListCache();
  return result;
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
  const result = await task(cfg, deviceId, {
    name: 'setParameterValues',
    parameterValues: [[param, cleanSsid, 'xsd:string']]
  });
  clearDeviceListCache();
  return result;
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
    [`${base}.BasicEncryptionModes`, payload.usePassword === false ? 'None' : 'AESEncryption', 'xsd:string']
  ];
  const cleanPassword = cleanText(payload.password);
  if (payload.usePassword !== false && cleanPassword) {
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
  } else if (payload.usePassword === false) {
    values.push(
      [`${base}.BeaconType`, 'Basic', 'xsd:string'],
      [`${base}.BasicAuthenticationMode`, 'OpenSystem', 'xsd:string']
    );
  }
  const result = await task(settings, deviceId, {
    name: 'setParameterValues',
    parameterValues: values
  });
  clearDeviceListCache();
  return result;
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
  const result = await task(settings, deviceId, {
    name: 'setParameterValues',
    parameterValues: values
  });
  clearDeviceListCache();
  return result;
}

function assertPppUsernameParameter(path = '') {
  const cleanPath = cleanText(path);
  const ok = /^InternetGatewayDevice\.WANDevice\.\d+\.WANConnectionDevice\.\d+\.WANPPPConnection\.\d+\.Username$/.test(cleanPath)
    || /^Device\.PPP\.Interface\.\d+\.Username$/.test(cleanPath);
  if (!ok) {
    throw new Error('Parameter username PPPoE GenieACS tidak valid');
  }
  return cleanPath;
}

function assertPppPasswordParameter(path = '') {
  const cleanPath = cleanText(path);
  const ok = /^InternetGatewayDevice\.WANDevice\.\d+\.WANConnectionDevice\.\d+\.WANPPPConnection\.\d+\.Password$/.test(cleanPath)
    || /^Device\.PPP\.Interface\.\d+\.Password$/.test(cleanPath);
  if (!ok) {
    throw new Error('Parameter password PPPoE GenieACS tidak valid');
  }
  return cleanPath;
}

async function setPppCredentials(settings = {}, deviceId = '', payload = {}) {
  const cfg = normalizeSettings(settings);
  const username = cleanText(payload.username);
  if (!username) {
    throw new Error('Username PPPoE wajib diisi');
  }
  const usernameParameter = assertPppUsernameParameter(payload.usernameParameter || cfg.usernameParameters[0]);
  const values = [[usernameParameter, username, 'xsd:string']];
  const password = cleanText(payload.password);
  if (password) {
    const passwordParameter = assertPppPasswordParameter(
      payload.passwordParameter
      || pppPasswordParameterCandidates(usernameParameter, cfg.pppPasswordParameters)[0]
    );
    values.push([passwordParameter, password, 'xsd:string']);
  }
  const result = await task(cfg, deviceId, {
    name: 'setParameterValues',
    parameterValues: values
  });
  clearDeviceListCache();
  return result;
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_PPP_PASSWORD_PARAMETERS,
  DEFAULT_RX_POWER_PARAMETERS,
  DEFAULT_TEMPERATURE_PARAMETERS,
  DEFAULT_USERNAME_PARAMETERS,
  DEFAULT_WIFI_5G_CLIENT_COUNT_PARAMETERS,
  DEFAULT_WIFI_5G_SSID_PARAMETERS,
  DEFAULT_WIFI_CLIENT_COUNT_PARAMETERS,
  DEFAULT_WIFI_PASSWORD_PARAMETERS,
  DEFAULT_WIFI_SSID_PARAMETERS,
  configured,
  deleteDevice,
  findDevice,
  filterRowsByNas,
  getDevice,
  listDevices,
  normalizeDevice,
  normalizeSettings,
  reboot,
  refreshDevice,
  setPppCredentials,
  setWifiCredentials,
  setWifiSsidAndOptionalPassword,
  setWifiPassword,
  setWifiSsid
};
