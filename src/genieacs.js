'use strict';

const genieAcsWan = require('./genieacs-wan');
const genieAcsWifi = require('./genieacs-wifi');

const DEFAULT_BASE_URL = 'http://127.0.0.1:7557';
const HTTP_TIMEOUT_MS = Math.max(3000, Number(process.env.GENIEACS_HTTP_TIMEOUT_MS || 10000) || 10000);
const HIGH_REDAMAN_THRESHOLD_DBM = -26.5;
const DEVICE_LIST_CACHE_TTL_MS = Math.max(10000, Number(process.env.GENIEACS_DEVICE_CACHE_MS || 60000) || 60000);
const DEVICE_LIST_CACHE_STALE_MS = Math.max(
  DEVICE_LIST_CACHE_TTL_MS,
  Number(process.env.GENIEACS_DEVICE_STALE_MS || 300000) || 300000
);
const DEVICE_PROJECTION_MAX_CHARS = Math.max(1200, Number(process.env.GENIEACS_PROJECTION_MAX_CHARS || 3500) || 3500);
const DEVICE_LIST_CACHE_MAX = 12;
const BEST_DEVICE_CACHE_TTL_MS = Math.max(5000, Number(process.env.GENIEACS_BEST_DEVICE_CACHE_MS || 30000) || 30000);
const BEST_DEVICE_CACHE_MAX = 200;
const deviceListCache = new Map();
const deviceListInflight = new Map();
const deviceMutationLocks = new Map();
const bestDeviceCache = new Map();
let deviceListCacheGeneration = 0;

const DEFAULT_USERNAME_PARAMETERS = [
  'VirtualParameters.pppoeUsername',
  'VirtualParameters.pppoe',
  'VirtualParameters.pppoeUsername2',
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
  'InternetGatewayDevice.DeviceInfo.XponInterface.RXPower',
  'InternetGatewayDevice.DeviceInfo.XponInterface.RxPower',
  'InternetGatewayDevice.DeviceInfo.XponInterface.OpticalTransceiver.RXPower',
  'InternetGatewayDevice.DeviceInfo.XponInterface.OpticalTransceiver.RxPower',
  'InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_GC_GponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_GC_EponInterfaceConfig.RXPower',
  'InternetGatewayDevice.WANDevice.1.X_GC_WANPONInterfaceConfig.RXPower',
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
  'InternetGatewayDevice.DeviceInfo.XponInterface.Temperature',
  'InternetGatewayDevice.DeviceInfo.XponInterface.TransceiverTemperature',
  'InternetGatewayDevice.DeviceInfo.XponInterface.OpticalTransceiver.Temperature',
  'InternetGatewayDevice.WANDevice.1.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.Temperature',
  'InternetGatewayDevice.WANDevice.1.X_CU_WANGPONInterfaceConfig.OpticalTransceiver.Temperature',
  'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.2.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_GC_GponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_GC_EponInterfaceConfig.TransceiverTemperature',
  'InternetGatewayDevice.WANDevice.1.X_GC_WANPONInterfaceConfig.TransceiverTemperature',
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
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.SSID',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.SSID',
  'VirtualParameters.wifiSsid24',
  'Device.WiFi.SSID.1.SSID'
];

const DEFAULT_WIFI_5G_SSID_PARAMETERS = [
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.SSID',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.SSID',
  'InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.SSID',
  'VirtualParameters.wifiSsid5',
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

const DEFAULT_WAN_VLAN_PARAMETERS = [
  'VirtualParameters.wanVlan',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_HW_VLAN',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.X_HW_VLAN',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_ZTE-COM_VLANID',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.X_ZTE-COM_VLANID',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.X_CT-COM_WANEponLinkConfig.VLANIDMark',
  'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.X_CT-COM_WANEponLinkConfig.VLANIDMark',
  'Device.Ethernet.VLANTermination.1.VLANID',
  'Device.Ethernet.VLANTermination.2.VLANID'
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
    wanVlanParameters: DEFAULT_WAN_VLAN_PARAMETERS.slice(),
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
  deviceListCacheGeneration += 1;
  deviceListCache.clear();
  deviceListInflight.clear();
  bestDeviceCache.clear();
}

function deviceListCacheKey(cfg = {}, query = {}, projection = '', requestQuery = {}) {
  return [
    cfg.baseUrl,
    cfg.token ? `token:${cfg.token.length}:${cfg.token.slice(-6)}` : 'token:',
    JSON.stringify(query),
    projection,
    JSON.stringify(requestQuery)
  ].join('|');
}

function projectionChunks(projection = '', maxChars = DEVICE_PROJECTION_MAX_CHARS) {
  const fields = [...new Set(String(projection || '').split(',').map(cleanText).filter(Boolean))];
  if (!fields.length) return [];
  const chunks = [];
  let current = ['_id'];
  let currentLength = 3;
  for (const field of fields) {
    if (field === '_id') continue;
    const nextLength = currentLength + field.length + 1;
    if (current.length > 1 && nextLength > maxChars) {
      chunks.push(current.join(','));
      current = ['_id'];
      currentLength = 3;
    }
    current.push(field);
    currentLength += field.length + 1;
  }
  if (current.length) chunks.push(current.join(','));
  return chunks;
}

function mergeProjectedValue(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return cloneJson(source);
  const next = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = mergeProjectedValue(next[key], value);
    } else {
      next[key] = cloneJson(value);
    }
  }
  return next;
}

function mergeProjectedRows(groups = []) {
  const rows = new Map();
  const order = [];
  for (const group of groups) {
    for (const row of Array.isArray(group) ? group : []) {
      const id = cleanText(row?._id);
      if (!id) continue;
      if (!rows.has(id)) order.push(id);
      rows.set(id, mergeProjectedValue(rows.get(id), row));
    }
  }
  return order.map((id) => rows.get(id));
}

async function requestProjectedRows(cfg = {}, query = {}, projection = '', requestQuery = {}) {
  if (!projection) {
    return requestJson(cfg, '/devices/', {
      query: { query: JSON.stringify(query), ...requestQuery }
    });
  }
  const requestChunk = async (chunk = '') => {
    try {
      return await requestJson(cfg, '/devices/', {
        query: {
          query: JSON.stringify(query),
          projection: chunk,
          ...requestQuery
        }
      });
    } catch (error) {
      const fields = chunk.split(',').filter(Boolean);
      const projectionTooLarge = [414, 431].includes(Number(error.status || 0))
        || /HTTP (414|431)/.test(error.message || '');
      if (!projectionTooLarge || fields.length <= 2) throw error;
      const midpoint = Math.ceil((fields.length - 1) / 2);
      const left = ['_id', ...fields.slice(1, midpoint + 1)].join(',');
      const right = ['_id', ...fields.slice(midpoint + 1)].join(',');
      const groups = [await requestChunk(left)];
      if (right !== '_id') groups.push(await requestChunk(right));
      return mergeProjectedRows(groups);
    }
  };
  const groups = [];
  for (const chunk of projectionChunks(projection)) {
    groups.push(await requestChunk(chunk));
  }
  return mergeProjectedRows(groups);
}

async function cachedDeviceRows(cfg = {}, query = {}, projection = '', refresh = false, requestQuery = {}) {
  const cacheKey = deviceListCacheKey(cfg, query, projection, requestQuery);
  const now = Date.now();
  const cached = deviceListCache.get(cacheKey);
  if (!refresh && cached?.expiresAt > now) return cloneJson(cached.rows);
  const inflightKey = `${cacheKey}|${refresh ? 'refresh' : 'normal'}`;
  if (!refresh && cached?.staleUntil > now) {
    if (!deviceListInflight.has(inflightKey)) {
      const generation = deviceListCacheGeneration;
      let background;
      background = requestProjectedRows(cfg, query, projection, requestQuery)
        .then((rows) => {
          if (Array.isArray(rows) && generation === deviceListCacheGeneration) {
            deviceListCache.set(cacheKey, {
              expiresAt: Date.now() + DEVICE_LIST_CACHE_TTL_MS,
              staleUntil: Date.now() + DEVICE_LIST_CACHE_STALE_MS,
              rows: cloneJson(rows)
            });
            pruneDeviceListCache();
          }
          return rows;
        })
        .catch(() => {
          cached.expiresAt = Date.now() + Math.min(15000, DEVICE_LIST_CACHE_TTL_MS);
          return cached.rows;
        })
        .finally(() => {
          if (deviceListInflight.get(inflightKey) === background) deviceListInflight.delete(inflightKey);
        });
      deviceListInflight.set(inflightKey, background);
    }
    return cloneJson(cached.rows);
  }
  if (deviceListInflight.has(inflightKey)) return cloneJson(await deviceListInflight.get(inflightKey));
  const generation = deviceListCacheGeneration;
  const operation = (async () => {
    try {
      const rows = await requestProjectedRows(cfg, query, projection, requestQuery);
      if (Array.isArray(rows) && generation === deviceListCacheGeneration) {
        deviceListCache.set(cacheKey, {
          expiresAt: Date.now() + DEVICE_LIST_CACHE_TTL_MS,
          staleUntil: Date.now() + DEVICE_LIST_CACHE_STALE_MS,
          rows: cloneJson(rows)
        });
        pruneDeviceListCache();
      }
      return rows;
    } catch (error) {
      if (!refresh && cached?.staleUntil > Date.now()) {
        cached.expiresAt = Date.now() + Math.min(15000, DEVICE_LIST_CACHE_TTL_MS);
        return cloneJson(cached.rows);
      }
      throw error;
    }
  })();
  deviceListInflight.set(inflightKey, operation);
  try {
    return cloneJson(await operation);
  } finally {
    if (deviceListInflight.get(inflightKey) === operation) deviceListInflight.delete(inflightKey);
  }
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
    'VirtualParameters.pppoeIP',
    'VirtualParameters.ip',
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
    '_registered',
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
    cfg.wifiClientCountParameters,
    cfg.wifi5gClientCountParameters,
    cfg.lanClientCountParameters,
    cfg.wanVlanParameters
  ].forEach((list) => (list || []).forEach((path) => cleanText(path) && paths.add(cleanText(path))));
  (cfg.usernameParameters || []).forEach((path) => {
    pppIpParameterCandidates(path).forEach((candidate) => paths.add(candidate));
  });
  return [...paths].join(',');
}

function deviceSummaryProjection(cfg = normalizeSettings({})) {
  const paths = new Set(['_id', '_lastInform']);
  (cfg.usernameParameters || []).forEach((path) => cleanText(path) && paths.add(cleanText(path)));
  (cfg.rxPowerParameters || []).forEach((path) => cleanText(path) && paths.add(cleanText(path)));
  (cfg.wanVlanParameters || []).forEach((path) => cleanText(path) && paths.add(cleanText(path)));
  return [...paths].join(',');
}

function recentPendingProjection(cfg = normalizeSettings({})) {
  const paths = new Set([
    '_id',
    '_tags',
    '_registered',
    '_lastInform',
    '_deviceId',
    'InternetGatewayDevice.DeviceInfo.SerialNumber',
    'InternetGatewayDevice.DeviceInfo.ProductClass',
    'InternetGatewayDevice.DeviceInfo.Manufacturer',
    'Device.DeviceInfo.SerialNumber',
    'Device.DeviceInfo.ProductClass',
    'Device.DeviceInfo.Manufacturer'
  ]);
  (cfg.usernameParameters || []).forEach((path) => {
    const usernamePath = cleanText(path);
    if (!usernamePath) return;
    paths.add(usernamePath);
    const base = usernamePath.replace(/\.Username$/, '');
    if (base === usernamePath) return;
    if (/^Device\.PPP\.Interface\./.test(base)) {
      paths.add(`${base}.IPCP.LocalIPAddress`);
      paths.add(`${base}.Status`);
      return;
    }
    [
      `${base}.ExternalIPAddress`,
      `${base}.X_HW_ExternalIPAddress`,
      `${base}.X_ZTE-COM_ExternalIPAddress`,
      `${base}.X_FH_ExternalIPAddress`,
      `${base}.ConnectionStatus`
    ].forEach((candidate) => paths.add(candidate));
  });
  (cfg.wanVlanParameters || []).forEach((path) => cleanText(path) && paths.add(cleanText(path)));
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

function wifiSecurityEnabled(device = {}, base = '', password = {}) {
  const beacon = cleanText(getPathState(device, `${base}.BeaconType`).value).toLowerCase();
  const basicAuthentication = cleanText(getPathState(device, `${base}.BasicAuthenticationMode`).value).toLowerCase();
  const basicEncryption = cleanText(getPathState(device, `${base}.BasicEncryptionModes`).value).toLowerCase();
  const advancedSecurity = [
    getPathState(device, `${base}.WPAAuthenticationMode`).value,
    getPathState(device, `${base}.WPAEncryptionModes`).value,
    getPathState(device, `${base}.IEEE11iAuthenticationMode`).value,
    getPathState(device, `${base}.IEEE11iEncryptionModes`).value
  ].filter(Boolean).join(' ').toLowerCase();

  // Reused SSID slots often retain old WPA values. BeaconType is the effective
  // mode used by the CPE, so an explicit Basic/Open mode must win over stale keys.
  if (/wpa|11i/.test(beacon)) return true;
  if (/basic|none|open/.test(beacon)) return false;
  if (/open|none/.test(basicAuthentication) && (!basicEncryption || /none/.test(basicEncryption))) return false;
  if (/aes|tkip|wep/.test(basicEncryption) || /psk|wpa|11i|aes|tkip/.test(advancedSecurity)) return true;
  return Boolean(password.value);
}

function fallbackWifiNetworkFromVirtual(device = {}, band = '2.4G', ssidPath = '', indexes = []) {
  const virtualSsid = firstExistingParameter(device, [ssidPath]);
  if (!virtualSsid.value) return null;
  const candidates = indexes.map((index) => {
    const base = wifiConfigBase(index);
    const enable = getPathState(device, `${base}.Enable`);
    const status = getPathState(device, `${base}.Status`);
    const clients = firstParameter(device, wifiClientCountCandidates(index));
    const hasConfig = getPathState(device, base).exists
      || enable.exists
      || status.exists
      || clients.path;
    if (!hasConfig) return null;
    const enabled = enable.exists
      ? truthyWifiValue(enable.value)
      : (status.exists ? truthyWifiValue(status.value) : true);
    return {
      index,
      base,
      enable,
      status,
      clients,
      enabled,
      score: (normalizeCount(clients.value) > 0 ? 20 : 0) + (enabled ? 10 : 0) + (enable.exists || status.exists ? 1 : 0)
    };
  }).filter(Boolean).sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = candidates[0];
  if (!selected) return null;
  const password = firstExistingParameter(device, wifiPasswordParameterCandidates(selected.index));
  const passwordParameter = password.path || wifiPasswordParameterCandidates(selected.index)[0] || '';
  const securityValues = [
    getPathState(device, `${selected.base}.BeaconType`).value,
    getPathState(device, `${selected.base}.BasicAuthenticationMode`).value,
    getPathState(device, `${selected.base}.WPAAuthenticationMode`).value,
    getPathState(device, `${selected.base}.WPAEncryptionModes`).value,
    getPathState(device, `${selected.base}.IEEE11iAuthenticationMode`).value,
    getPathState(device, `${selected.base}.IEEE11iEncryptionModes`).value
  ].filter(Boolean);
  return {
    index: selected.index,
    band,
    label: `${band} - ${virtualSsid.value}`,
    ssid: virtualSsid.value,
    ssidParameter: `${selected.base}.SSID`,
    enableParameter: selected.enable.path || `${selected.base}.Enable`,
    password: password.value,
    passwordParameter,
    passwordWritable: password.writable,
    securityText: securityValues.join(' / '),
    securityEnabled: wifiSecurityEnabled(device, selected.base, password),
    clients: normalizeCount(selected.clients.value),
    clientsParameter: selected.clients.path,
    status: selected.status.value || (selected.enabled ? 'Up' : 'Disabled'),
    enabled: selected.enabled,
    source: 'virtual'
  };
}

function normalizeWifiNetworks(device = {}) {
  const rows = WIFI_CONFIGURATION_INDEXES.map((index) => {
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
    const securityEnabled = wifiSecurityEnabled(device, base, password);
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
  const has24 = rows.some((row) => row.band === '2.4G');
  const has5 = rows.some((row) => row.band === '5G');
  const fallbackRows = [
    has24 ? null : fallbackWifiNetworkFromVirtual(device, '2.4G', 'VirtualParameters.wifiSsid24', [1, 2, 3, 4]),
    has5 ? null : fallbackWifiNetworkFromVirtual(device, '5G', 'VirtualParameters.wifiSsid5', [5, 6, 7, 8])
  ].filter(Boolean);
  return [...rows, ...fallbackRows].sort((left, right) => left.index - right.index);
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
  const wanVlan = firstParameter(device, cfg.wanVlanParameters);
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
  const clientsTotal = Math.max(clientSummary.total, wifiClients24 + wifiClients5 + lanClients);
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
  const registered = cleanText(device._registered);
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
    wanVlan: wanVlan.value,
    wanVlanParameter: wanVlan.path,
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
    registered,
    lastInform,
    online,
    status: online ? 'online' : 'offline'
  };
}

function recentPppState(device = {}, row = {}) {
  const usernamePath = cleanText(row.usernameParameter);
  if (!usernamePath || !usernamePath.endsWith('.Username')) {
    const username = cleanText(row.username);
    if (!username) return null;
    return {
      username,
      status: row.online ? 'Connected' : '',
      ip: row.ipAddress,
      vlan: null,
      source: usernamePath || 'normalized'
    };
  }
  const base = usernamePath.replace(/\.Username$/, '');
  const status = firstExistingParameter(device, [
    `${base}.ConnectionStatus`,
    `${base}.Status`
  ]).value;
  const vlanValue = firstExistingParameter(device, [
    'VirtualParameters.wanVlan',
    `${base}.X_HW_VLAN`,
    `${base}.X_ZTE-COM_VLANID`,
    `${base}.X_FH_VLANID`,
    `${base}.X_CMCC_VLANIDMark`,
    `${base}.X_CMCC_VLANID`,
    `${base}.X_CT-COM_VLANID`,
    `${base}.X_CT-COM_VLANIDMark`,
    `${base}.VLANID`,
    `${base}.VLANIDMark`
  ]).value;
  const vlan = Number(vlanValue);
  return {
    username: row.username,
    status,
    ip: row.ipAddress,
    vlan: Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094 ? vlan : null
  };
}

function recentPendingCandidate(device = {}, cfg = normalizeSettings({})) {
  const row = normalizeDevice(device, cfg);
  if (!row.registered) return null;
  const vendor = genieAcsWan.detectWanVendor(device);
  const pppoe = recentPppState(device, row);
  let wanPending = null;
  if (!pppoe || !cleanText(pppoe.username)) {
    wanPending = {
      code: 'no_wan_ppp',
      label: 'WAN PPP belum ada',
      pppoe: null
    };
  }
  if (!wanPending) return null;
  return {
    id: row.id,
    serialNumber: row.serialNumber,
    productClass: row.productClass,
    model: row.productClass,
    manufacturer: row.manufacturer,
    detectedVendor: vendor.label,
    tags: row.tags,
    registered: row.registered,
    lastInform: row.lastInform,
    wanPending,
    wanSummary: { pppoe }
  };
}

async function recentPendingDevices(settings = {}, options = {}) {
  const cfg = normalizeSettings(settings);
  const hours = Math.max(1, Math.min(720, Number(options.hours || 24) || 24));
  const limit = Math.max(1, Math.min(100, Number(options.limit || 100) || 100));
  const scanLimit = Math.max(limit, Math.min(300, limit * 3));
  const checkedAt = new Date().toISOString();
  const minimumRegisteredAt = Date.now() - (hours * 60 * 60 * 1000);
  const rawRows = await cachedDeviceRows(
    cfg,
    {},
    recentPendingProjection(cfg),
    options.refresh === true,
    {
      sort: JSON.stringify({ _registered: -1 }),
      limit: String(scanLimit)
    }
  );
  const devices = (Array.isArray(rawRows) ? rawRows : [])
    .map((device) => recentPendingCandidate(device, cfg))
    .filter((device) => device && Date.parse(device.registered) >= minimumRegisteredAt)
    .slice(0, limit);
  return {
    ok: true,
    devices,
    summary: {
      total: devices.length,
      hours,
      scanned: Array.isArray(rawRows) ? rawRows.length : 0
    },
    checkedAt
  };
}

function searchQuery(search = '') {
  const text = cleanText(search);
  if (!text) return {};
  if (text.length < 3) return { _id: { $in: [] } };
  const matcher = { $regex: text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  return {
    $or: [
      { _id: matcher },
      { _tags: matcher },
      { '_deviceId._SerialNumber': matcher },
      { '_deviceId._ProductClass': matcher },
      { 'InternetGatewayDevice.DeviceInfo.SerialNumber._value': matcher },
      { 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID._value': matcher },
      { 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID._value': matcher },
      { 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.SSID._value': matcher },
      { 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.4.SSID._value': matcher },
      { 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID._value': matcher },
      { 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.6.SSID._value': matcher },
      { 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.7.SSID._value': matcher },
      { 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.8.SSID._value': matcher },
      { 'Device.WiFi.SSID.1.SSID._value': matcher },
      { 'Device.WiFi.SSID.2.SSID._value': matcher },
      { 'Device.WiFi.SSID.5.SSID._value': matcher },
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

function usernameSuffixExclusionQuery(cfg = normalizeSettings({})) {
  const suffixes = Array.isArray(cfg.excludeUsernameSuffixes) ? cfg.excludeUsernameSuffixes.map(cleanText).filter(Boolean) : [];
  const paths = (Array.isArray(cfg.usernameParameters) ? cfg.usernameParameters.map(cleanText).filter(Boolean) : [])
    .sort((left, right) => {
      const leftVirtual = left.startsWith('VirtualParameters.');
      const rightVirtual = right.startsWith('VirtualParameters.');
      if (leftVirtual === rightVirtual) return 0;
      return leftVirtual ? 1 : -1;
    });
  if (!suffixes.length || !paths.length) return {};
  const escapedSuffixes = suffixes.map((suffix) => suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return {
    $nor: paths.flatMap((path) => escapedSuffixes.map((suffix) => ({
      [`${path}._value`]: { $regex: `${suffix}$`, $options: 'i' }
    })))
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
  const search = cleanText(options.search || '');
  const query = searchQuery(search);
  const status = cleanText(options.status || 'all').toLowerCase();
  const redaman = cleanText(options.redaman || 'all').toLowerCase();
  const page = Math.max(1, Number(options.page || 1) || 1);
  const requestedLimit = cleanText(options.limit).toLowerCase() === 'all'
    ? Number.MAX_SAFE_INTEGER
    : Number(options.limit || 10) || 10;
  const limit = requestedLimit >= 1000000
    ? Number.MAX_SAFE_INTEGER
    : Math.max(1, Math.min(100, requestedLimit));
  const sourcePagination = options.sourcePagination === true
    && !search
    && status === 'all'
    && redaman === 'all'
    && limit !== Number.MAX_SAFE_INTEGER;
  if (sourcePagination) {
    try {
      const sourceQuery = usernameSuffixExclusionQuery(cfg);
      const summaryRawRows = await cachedDeviceRows(
        cfg,
        sourceQuery,
        deviceSummaryProjection(cfg),
        options.refresh === true,
        { sort: JSON.stringify({ _registered: -1 }) }
      );
      const summaryRows = (Array.isArray(summaryRawRows) ? summaryRawRows : [])
        .map((device) => normalizeDevice(device, cfg))
        .filter((row) => !rowExcludedByUsernameSuffix(row, cfg.excludeUsernameSuffixes));
      const total = summaryRows.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const currentPage = Math.min(page, totalPages);
      const rawRows = await cachedDeviceRows(
        cfg,
        sourceQuery,
        deviceListProjection(cfg),
        options.refresh === true,
        {
          sort: JSON.stringify({ _registered: -1 }),
          skip: String((currentPage - 1) * limit),
          limit: String(limit)
        }
      );
      const rows = (Array.isArray(rawRows) ? rawRows : [])
        .map((device) => normalizeDevice(device, cfg))
        .filter((row) => !rowExcludedByUsernameSuffix(row, cfg.excludeUsernameSuffixes));
      const rxValues = summaryRows
        .map((row) => row.rxPowerValue)
        .filter((value) => Number.isFinite(Number(value)));
      const rxAverage = rxValues.length
        ? rxValues.reduce((sum, value) => sum + Number(value), 0) / rxValues.length
        : null;
      return {
        ok: true,
        enabled: cfg.enabled,
        configured: configured(cfg),
        baseUrl: cfg.baseUrl,
        rows,
        summary: {
          total,
          online: summaryRows.filter((row) => row.online).length,
          offline: summaryRows.filter((row) => !row.online).length,
          filtered: total,
          redamanCount: rxValues.length,
          redamanHighCount: highRedamanCount(rxValues),
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
    } catch {
      clearDeviceListCache();
    }
  }
  const rawRows = await cachedDeviceRows(
    cfg,
    query,
    deviceListProjection(cfg),
    options.refresh === true,
    search.length >= 3 ? {
      sort: JSON.stringify({ _registered: -1 }),
      limit: '20'
    } : {}
  );
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

async function getRawDevice(settings = {}, deviceId = '', options = {}) {
  const cfg = normalizeSettings(settings);
  const cleanId = cleanText(deviceId);
  if (!cleanId) throw new Error('ID perangkat GenieACS tidak tersedia');
  const rows = await cachedDeviceRows(cfg, { _id: cleanId }, '', options.refresh === true);
  const device = Array.isArray(rows) ? rows[0] : null;
  return device ? cloneJson(device) : null;
}

async function getWanConfiguration(settings = {}, deviceId = '', options = {}) {
  const raw = await getRawDevice(settings, deviceId, { refresh: options.refresh === true });
  if (!raw) throw new Error('Perangkat GenieACS tidak ditemukan');
  const summary = genieAcsWan.summarizeWanConnections(raw, options.preferredUsername || '');
  return {
    ok: true,
    deviceId: cleanText(deviceId),
    vendor: summary.vendor,
    bridgeTarget: genieAcsWan.bridgeTarget(raw, summary.vendor),
    rows: summary.rows,
    primary: summary.primary,
    management: summary.management,
    defaultTargetId: genieAcsWan.defaultWanTarget(summary)?.id || 'new',
    defaultTargetIds: {
      pppoe: genieAcsWan.defaultWanTarget(summary, 'pppoe')?.id || 'new',
      bridge: genieAcsWan.defaultWanTarget(summary, 'bridge')?.id || 'new'
    },
    bindings: genieAcsWan.availableWanBindings(raw)
  };
}

async function getWifiConfiguration(settings = {}, deviceId = '', options = {}) {
  const raw = await getRawDevice(settings, deviceId, { refresh: options.refresh === true });
  if (!raw) throw new Error('Perangkat GenieACS tidak ditemukan');
  const normalized = normalizeDevice(raw, normalizeSettings(settings));
  const wanSummary = genieAcsWan.summarizeWanConnections(raw, options.preferredUsername || normalized.username || '');
  return {
    ok: true,
    deviceId: cleanText(deviceId),
    vendor: wanSummary.vendor,
    networks: normalized.wifiNetworks || [],
    addSsid: genieAcsWifi.addSsidOptions(raw),
    wanOptions: wanSummary.rows.filter((row) => row.editable).map((row) => ({
      id: row.id,
      label: row.label,
      mode: row.mode,
      vlan: row.vlan,
      username: row.username,
      bindings: row.bindings,
      primary: row.primary === true
    }))
  };
}

function cleanComparable(value = '') {
  return cleanText(value).toLowerCase();
}

function activeIpScore(value = '') {
  const ip = cleanText(value);
  if (!ip || ip === '0.0.0.0' || ip === '::') return 0;
  return validIpv4(ip) ? 90 : 35;
}

function timeScore(value = '', maxScore = 140) {
  const timestamp = Date.parse(cleanText(value));
  if (!Number.isFinite(timestamp)) return 0;
  const ageMinutes = Math.max(0, (Date.now() - timestamp) / 60000);
  if (ageMinutes <= 15) return maxScore;
  if (ageMinutes <= 60) return Math.round(maxScore * 0.78);
  if (ageMinutes <= 360) return Math.round(maxScore * 0.55);
  if (ageMinutes <= 1440) return Math.round(maxScore * 0.35);
  if (ageMinutes <= 10080) return Math.round(maxScore * 0.12);
  return 1;
}

function rowNasMatches(row = {}, aliases = []) {
  const values = [
    row.nasId,
    row.nasName,
    row.nasIpAddress,
    ...(Array.isArray(row.tags) ? row.tags : [])
  ].map(cleanComparable).filter(Boolean);
  if (!values.length || !aliases.length) return false;
  return aliases.some((alias) => values.includes(cleanComparable(alias)));
}

function deviceCandidateScore(row = {}, options = {}) {
  const username = cleanComparable(options.username);
  const boundIds = (Array.isArray(options.boundDeviceIds) ? options.boundDeviceIds : [])
    .map(cleanComparable)
    .filter(Boolean);
  const boundSerials = (Array.isArray(options.boundSerialNumbers) ? options.boundSerialNumbers : [])
    .map(cleanComparable)
    .filter(Boolean);
  const nasAliases = Array.isArray(options.nasAliases) ? options.nasAliases : [];
  const rowId = cleanComparable(row.id);
  const rowSerial = cleanComparable(row.serialNumber);
  const rowUsername = cleanComparable(row.username);

  let score = 0;
  const reasons = [];
  if (username && rowUsername === username) {
    score += 520;
    reasons.push('username-exact');
  } else if (username && rowUsername && rowUsername.includes(username)) {
    score += 130;
    reasons.push('username-partial');
  }
  if (row.online) {
    score += 260;
    reasons.push('online');
  }
  const lastInformScore = timeScore(row.lastInform, 150);
  if (lastInformScore) {
    score += lastInformScore;
    reasons.push('last-inform');
  }
  const ipScore = activeIpScore(row.ipAddress || row.pppoeIpAddress || row.framedIpAddress);
  if (ipScore) {
    score += ipScore;
    reasons.push('pppoe-ip');
  }
  if (rowNasMatches(row, nasAliases)) {
    score += 90;
    reasons.push('nas-match');
  }
  if (boundIds.includes(rowId)) {
    score += row.online ? 180 : 30;
    reasons.push('bound-device');
  }
  if (boundSerials.includes(rowSerial)) {
    score += row.online ? 160 : 25;
    reasons.push('bound-serial');
  }
  score += timeScore(row.registered, 40);
  return { score, reasons };
}

function sortDeviceCandidates(left = {}, right = {}) {
  if (right._matchScore !== left._matchScore) return right._matchScore - left._matchScore;
  if (Boolean(right.online) !== Boolean(left.online)) return right.online ? 1 : -1;
  const rightInform = Date.parse(cleanText(right.lastInform)) || 0;
  const leftInform = Date.parse(cleanText(left.lastInform)) || 0;
  if (rightInform !== leftInform) return rightInform - leftInform;
  const rightRegistered = Date.parse(cleanText(right.registered)) || 0;
  const leftRegistered = Date.parse(cleanText(left.registered)) || 0;
  return rightRegistered - leftRegistered;
}

function pruneBestDeviceCache(now = Date.now()) {
  for (const [key, entry] of bestDeviceCache.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now) {
      bestDeviceCache.delete(key);
    }
  }
  while (bestDeviceCache.size > BEST_DEVICE_CACHE_MAX) {
    bestDeviceCache.delete(bestDeviceCache.keys().next().value);
  }
}

function bestDeviceCacheKey(cfg = {}, searchTerms = [], options = {}) {
  return [
    cfg.baseUrl,
    cfg.token ? `token:${cfg.token.length}:${cfg.token.slice(-6)}` : 'token:',
    deviceListCacheGeneration,
    cleanComparable(options.username),
    (Array.isArray(options.boundDeviceIds) ? options.boundDeviceIds : []).map(cleanComparable).sort().join(','),
    (Array.isArray(options.boundSerialNumbers) ? options.boundSerialNumbers : []).map(cleanComparable).sort().join(','),
    (Array.isArray(options.nasAliases) ? options.nasAliases : []).map(cleanComparable).sort().join(','),
    searchTerms.map(cleanComparable).sort().join(','),
    options.compact === true ? 'compact' : 'full'
  ].join('|');
}

function orderedDeviceSearchTerms(searches = [], options = {}) {
  const preferred = [
    options.username,
    ...(Array.isArray(searches) ? searches : [searches])
  ].map(cleanText).filter(Boolean);
  const seen = new Set();
  const rows = [];
  for (const item of preferred) {
    const key = cleanComparable(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push(item);
  }
  return rows;
}

function rankedDeviceCandidates(rows = [], options = {}) {
  const rowsById = new Map();
  for (const row of rows) {
    const id = cleanText(row.id);
    if (!id || rowsById.has(id)) continue;
    const match = deviceCandidateScore(row, options);
    rowsById.set(id, {
      ...row,
      _matchScore: match.score,
      _matchReasons: match.reasons
    });
  }
  return [...rowsById.values()].sort(sortDeviceCandidates);
}

function confidentDeviceCandidate(row = null) {
  if (!row) return false;
  const reasons = Array.isArray(row._matchReasons) ? row._matchReasons : [];
  return row.online === true
    && reasons.includes('username-exact')
    && reasons.includes('last-inform')
    && Number(row._matchScore || 0) >= 900;
}

async function findBestDevice(settings = {}, searches = [], options = {}) {
  const cfg = normalizeSettings(settings);
  const searchRows = [];
  const searchTerms = orderedDeviceSearchTerms(searches, options);
  if (!searchTerms.length) return null;
  const cacheKey = bestDeviceCacheKey(cfg, searchTerms, options);
  if (options.refresh !== true) {
    pruneBestDeviceCache();
    const cached = bestDeviceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cloneJson(cached.result);
    }
  }
  for (const search of searchTerms) {
    const result = await listDevices(settings, {
      search,
      page: 1,
      limit: 20,
      refresh: options.refresh === true
    });
    searchRows.push(...(result.rows || []));
    const rankedAfterSearch = rankedDeviceCandidates(searchRows, options);
    if (confidentDeviceCandidate(rankedAfterSearch[0])) {
      break;
    }
  }
  const rankedRows = rankedDeviceCandidates(searchRows, options);
  const best = rankedRows[0] || null;
  if (!best || options.compact === true) {
    if (options.refresh !== true) {
      bestDeviceCache.set(cacheKey, { expiresAt: Date.now() + BEST_DEVICE_CACHE_TTL_MS, result: best });
      pruneBestDeviceCache();
    }
    return best;
  }
  try {
    const full = await getDevice(settings, best.id, { refresh: options.refresh === true });
    const payload = full ? {
      ...full,
      matchScore: best._matchScore,
      matchReasons: best._matchReasons,
      candidateCount: rankedRows.length
    } : best;
    if (options.refresh !== true) {
      bestDeviceCache.set(cacheKey, { expiresAt: Date.now() + BEST_DEVICE_CACHE_TTL_MS, result: payload });
      pruneBestDeviceCache();
    }
    return payload;
  } catch {
    if (options.refresh !== true) {
      bestDeviceCache.set(cacheKey, { expiresAt: Date.now() + BEST_DEVICE_CACHE_TTL_MS, result: best });
      pruneBestDeviceCache();
    }
    return best;
  }
}

async function findDevice(settings = {}, search = '', options = {}) {
  return findBestDevice(settings, [search], options);
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

async function addObject(settings = {}, deviceId = '', objectName = '') {
  const cleanObjectName = cleanText(objectName);
  if (!cleanObjectName) throw new Error('Object WAN GenieACS tidak tersedia');
  return task(settings, deviceId, { name: 'addObject', objectName: cleanObjectName });
}

async function setParameterValues(settings = {}, deviceId = '', parameterValues = []) {
  if (!Array.isArray(parameterValues) || !parameterValues.length) {
    throw new Error('Parameter WAN GenieACS tidak tersedia');
  }
  return task(settings, deviceId, { name: 'setParameterValues', parameterValues });
}

function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

async function getTaskFault(settings = {}, deviceId = '', taskResult = {}) {
  const taskId = cleanText(taskResult?._id);
  if (!taskId) return null;
  const cfg = normalizeSettings(settings);
  const faults = await requestJson(cfg, '/faults/', {
    query: {
      query: JSON.stringify({ _id: `${cleanText(deviceId)}:task_${taskId}` }),
      limit: 1
    }
  });
  return Array.isArray(faults) ? faults[0] || null : null;
}

async function assertNoTaskFault(settings = {}, deviceId = '', taskResult = {}, label = 'Task GenieACS') {
  if (!taskResult?._id) return;
  await delay(1600);
  const fault = await getTaskFault(settings, deviceId, taskResult);
  if (!fault) return;
  const error = new Error(`${label} ditolak modem: ${fault.code || 'fault'} ${fault.message || ''}`.trim());
  error.taskId = cleanText(taskResult._id);
  error.fault = {
    code: cleanText(fault.code || 'fault'),
    message: cleanText(fault.message || ''),
    timestamp: cleanText(fault.timestamp || fault._timestamp || '')
  };
  throw error;
}

async function withDeviceMutationLock(deviceId = '', label = 'Konfigurasi', callback) {
  const cleanId = cleanText(deviceId);
  if (!cleanId) throw new Error('ID perangkat GenieACS tidak tersedia');
  if (deviceMutationLocks.has(cleanId)) throw new Error(`${label} perangkat ini sedang diproses`);
  const operation = Promise.resolve().then(callback);
  deviceMutationLocks.set(cleanId, operation);
  try {
    return await operation;
  } finally {
    if (deviceMutationLocks.get(cleanId) === operation) deviceMutationLocks.delete(cleanId);
  }
}

function sameStringSet(left = [], right = []) {
  const normalize = (items) => [...new Set((Array.isArray(items) ? items : [])
    .map((item) => cleanText(item).toUpperCase())
    .filter(Boolean))].sort();
  const expected = normalize(left);
  const actual = normalize(right);
  return expected.length === actual.length && expected.every((item, index) => item === actual[index]);
}

function wanReadbackVerification(plan = {}, updated = null) {
  const targetVerified = Boolean(updated);
  const modeVerified = targetVerified && updated.mode === plan.mode;
  const vlanVerified = targetVerified && Number(updated.vlan) === Number(plan.vlan);
  const usernameVerified = plan.mode !== 'pppoe'
    || (targetVerified && cleanText(updated.username) === cleanText(plan.username));
  const bindingsVerified = targetVerified && sameStringSet(updated.bindings, plan.bindings);
  return {
    verified: targetVerified && modeVerified && vlanVerified && usernameVerified && bindingsVerified,
    informed: targetVerified,
    checks: {
      target: targetVerified,
      mode: modeVerified,
      vlan: vlanVerified,
      username: usernameVerified,
      bindings: bindingsVerified
    },
    status: updated?.status || '',
    connected: updated?.connected === true,
    actualVlan: updated?.vlan ?? null,
    actualBindings: Array.isArray(updated?.bindings) ? updated.bindings : []
  };
}

async function configureWan(settings = {}, deviceId = '', payload = {}) {
  const cleanId = cleanText(deviceId);
  return withDeviceMutationLock(cleanId, 'Konfigurasi', async () => {
    const raw = await getRawDevice(settings, cleanId, { refresh: true });
    if (!raw) throw new Error('Perangkat GenieACS tidak ditemukan');
    const plan = payload.bindingOnly === true
      ? genieAcsWan.prepareWanBinding(raw, payload)
      : genieAcsWan.prepareWanProvision(raw, payload);
    const tasks = [];
    try {
      if (plan.isNew) {
        const connectionTask = await addObject(settings, cleanId, plan.connectionRootPath);
        tasks.push(connectionTask);
        await assertNoTaskFault(settings, cleanId, connectionTask, 'Tambah WANConnectionDevice');
        genieAcsWan.rebaseNewWanPlan(plan, {
          connectionIndex: Number(connectionTask?.instanceNumber || plan.connectionIndex)
        });
        const wanObjectTask = await addObject(settings, cleanId, plan.objectRootPath);
        tasks.push(wanObjectTask);
        await assertNoTaskFault(settings, cleanId, wanObjectTask, `Tambah ${plan.objectType}`);
        genieAcsWan.rebaseNewWanPlan(plan, {
          connectionIndex: plan.connectionIndex,
          instance: Number(wanObjectTask?.instanceNumber || plan.instance)
        });
      }
      if (plan.parameterValues.length) tasks.push(await setParameterValues(settings, cleanId, plan.parameterValues));
      if (plan.enableBindingValues.length) {
        tasks.push(await setParameterValues(settings, cleanId, plan.enableBindingValues));
        await delay(1400);
      }
      if (plan.bindingValues.length) tasks.push(await setParameterValues(settings, cleanId, plan.bindingValues));
      if (plan.cleanupValues.length) tasks.push(await setParameterValues(settings, cleanId, plan.cleanupValues));
      if (plan.activationValues.length) {
        const activationTask = await setParameterValues(settings, cleanId, plan.activationValues);
        tasks.push(activationTask);
        await assertNoTaskFault(settings, cleanId, activationTask, 'Aktifkan WAN');
      }
      clearDeviceListCache();
      try {
        await refreshDevice(settings, cleanId);
      } catch {
        // Provisioning sudah masuk antrean; refresh berikutnya dapat dilakukan manual.
      }
      let verification = { verified: false, informed: false };
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await delay(attempt === 1 ? 1200 : 1000);
        try {
          const updatedRaw = await getRawDevice(settings, cleanId, { refresh: true });
          const rows = genieAcsWan.summarizeWanConnections(updatedRaw, plan.username || '').rows;
          const updated = rows.find((row) => (
            (!plan.isNew && row.id === plan.existing?.id)
            || (plan.isNew
              && row.mode === plan.mode
              && Number(row.vlan) === Number(plan.vlan)
              && (plan.mode !== 'pppoe' || row.username === plan.username))
          ));
          verification = { ...wanReadbackVerification(plan, updated), attempt };
          if (verification.verified) break;
        } catch {
          verification.attempt = attempt;
        }
      }
      return {
        ok: true,
        plan: genieAcsWan.publicWanPlan(plan),
        taskCount: tasks.length,
        taskIds: tasks.map((taskResult) => cleanText(taskResult?._id)).filter(Boolean),
        verification
      };
    } catch (error) {
      error.taskIds = tasks.map((taskResult) => cleanText(taskResult?._id)).filter(Boolean);
      error.plan = genieAcsWan.publicWanPlan(plan);
      throw error;
    }
  });
}

async function addWifiSsid(settings = {}, deviceId = '', payload = {}) {
  const cleanId = cleanText(deviceId);
  return withDeviceMutationLock(cleanId, 'Konfigurasi WiFi/WAN', async () => {
    let raw = await getRawDevice(settings, cleanId, { refresh: true });
    if (!raw) throw new Error('Perangkat GenieACS tidak ditemukan');
    const plan = genieAcsWifi.prepareAddSsid(raw, payload);
    const tasks = [];
    if (plan.needsObject) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const addTask = await addObject(settings, cleanId, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration');
        tasks.push({ step: 'add-object', task: addTask });
        await assertNoTaskFault(settings, cleanId, addTask, 'Tambah object SSID');
        await delay(1800);
        raw = await getRawDevice(settings, cleanId, { refresh: true });
        if (genieAcsWifi.wlanConfiguration(raw, plan.index)) break;
      }
    }
    if (!genieAcsWifi.wlanConfiguration(raw, plan.index)) {
      throw new Error(`WLANConfiguration.${plan.index} belum tersedia setelah addObject`);
    }
    const currentOptions = genieAcsWifi.addSsidOptions(raw);
    const currentBand = currentOptions.bands.find((item) => item.value === plan.band);
    if (Number(currentBand?.nextIndex || 0) !== Number(plan.index)) {
      throw new Error(`SSID${plan.index} sudah dipakai sebelum konfigurasi selesai`);
    }

    const batches = genieAcsWifi.addSsidBatches(raw, plan.index, plan);
    for (const batch of batches) {
      const taskResult = await setParameterValues(settings, cleanId, batch.values);
      tasks.push({ step: batch.name, task: taskResult });
      await assertNoTaskFault(settings, cleanId, taskResult, `Tambah SSID tahap ${batch.name}`);
    }
    clearDeviceListCache();

    try {
      await refreshDevice(settings, cleanId);
      await delay(1200);
    } catch {
      // Inform task berikutnya tetap dapat memperbarui hasil provisioning.
    }

    let readback = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) await delay(1200);
      raw = await getRawDevice(settings, cleanId, { refresh: true });
      readback = { ...genieAcsWifi.readbackStatus(raw, plan), attempt };
      if (readback.verified) break;
    }

    let binding = null;
    const targetWan = cleanText(payload.targetWan);
    if (payload.bindToWan === true && targetWan) {
      if (!readback?.verified) {
        binding = {
          targetWan,
          pending: true,
          verified: false,
          message: `SSID${plan.index} belum terverifikasi sehingga binding WAN belum diterapkan`
        };
      } else {
        const summary = genieAcsWan.summarizeWanConnections(raw, payload.preferredUsername || '');
        const target = summary.rows.find((row) => row.id === targetWan);
        if (!target || !target.editable || target.protected) throw new Error('Target WAN binding tidak tersedia atau dilindungi');
        const bindings = [...new Set([...(target.bindings || []), `SSID${plan.index}`])];
        const bindingPlan = genieAcsWan.prepareWanProvision(raw, {
          targetWan,
          mode: target.mode,
          vlan: target.vlan,
          username: target.username,
          bindings,
          moveBindings: payload.moveBindings === true,
          preferredUsername: payload.preferredUsername || ''
        });
        if (bindingPlan.enableBindingValues.length) {
          const enableTask = await setParameterValues(settings, cleanId, bindingPlan.enableBindingValues);
          tasks.push({ step: 'binding-enable', task: enableTask });
          await assertNoTaskFault(settings, cleanId, enableTask, 'Aktifkan SSID sebelum binding');
          await delay(1400);
        }
        const bindingTask = await setParameterValues(settings, cleanId, bindingPlan.bindingValues);
        tasks.push({ step: 'binding', task: bindingTask });
        await assertNoTaskFault(settings, cleanId, bindingTask, 'Binding SSID ke WAN');
        if (bindingPlan.cleanupValues.length) {
          const cleanupTask = await setParameterValues(settings, cleanId, bindingPlan.cleanupValues);
          tasks.push({ step: 'binding-cleanup', task: cleanupTask });
          await assertNoTaskFault(settings, cleanId, cleanupTask, 'Bersihkan binding WAN lama');
        }
        binding = {
          targetWan,
          targetLabel: target.label,
          bindings,
          verified: false
        };
        clearDeviceListCache();
        try {
          await refreshDevice(settings, cleanId);
          await delay(1200);
        } catch {
          // Readback akan memakai inform modem terakhir yang tersedia.
        }
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          if (attempt > 1) await delay(1200);
          const bindingRaw = await getRawDevice(settings, cleanId, { refresh: true });
          const updated = genieAcsWan.summarizeWanConnections(bindingRaw, payload.preferredUsername || '').rows
            .find((row) => row.id === targetWan);
          const bindingReadback = wanReadbackVerification(bindingPlan, updated);
          binding.verified = bindingReadback.verified;
          binding.checks = bindingReadback.checks;
          binding.attempt = attempt;
          if (binding.verified) break;
        }
      }
    }

    clearDeviceListCache();
    try {
      await refreshDevice(settings, cleanId);
    } catch {
      // Task utama sudah diterima; refresh berikutnya dapat dilakukan manual.
    }
    return {
      ok: true,
      ssid: {
        index: plan.index,
        name: plan.ssid,
        band: plan.bandLabel,
        security: plan.security,
        verified: readback?.verified === true
      },
      binding,
      taskCount: tasks.length,
      taskIds: tasks.map((item) => cleanText(item?.task?._id || item?._id)).filter(Boolean)
    };
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

function wifiCredentialsPlan(device = {}, payload = {}) {
  const cleanSsid = cleanText(payload.ssid);
  if (cleanSsid.length < 1 || cleanSsid.length > 32) {
    throw new Error('Nama WiFi/SSID wajib 1-32 karakter');
  }
  const ssidParameter = assertWifiParameter(payload.ssidParameter || payload.parameter, ['.SSID']);
  const base = wifiBaseFromSsidParameter(ssidParameter);
  const index = Number(base.match(/\.WLANConfiguration\.(\d+)$/)?.[1] || 0);
  const enabled = payload.enabled !== false;
  const security = payload.usePassword === false ? 'none' : 'pass';
  const values = [
    [`${base}.Enable`, enabled, 'xsd:boolean'],
    [ssidParameter, cleanSsid, 'xsd:string'],
    [`${base}.BasicEncryptionModes`, payload.usePassword === false ? 'None' : 'AESEncryption', 'xsd:string']
  ];
  if (enabled && getPathState(device, `${base}.RadioEnabled`).exists) {
    values.push([`${base}.RadioEnabled`, true, 'xsd:boolean']);
  }
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
  return {
    base,
    cleanSsid,
    enabled,
    index,
    security,
    password: security === 'pass' ? cleanPassword : '',
    ssidParameter,
    values
  };
}

async function setWifiCredentials(settings = {}, deviceId = '', payload = {}) {
  const cleanId = cleanText(deviceId);
  return withDeviceMutationLock(cleanId, 'Konfigurasi WiFi', async () => {
    let raw = await getRawDevice(settings, cleanId, { refresh: true });
    if (!raw) throw new Error('Perangkat GenieACS tidak ditemukan');
    const plan = wifiCredentialsPlan(raw, payload);
    const taskResult = await task(settings, cleanId, {
      name: 'setParameterValues',
      parameterValues: plan.values
    });
    await assertNoTaskFault(settings, cleanId, taskResult, 'Konfigurasi WiFi');
    clearDeviceListCache();
    try {
      await refreshDevice(settings, cleanId);
    } catch {
      // Task utama tetap berada di antrean GenieACS.
    }
    let verification = {
      verified: false,
      informed: false
    };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await delay(attempt === 1 ? 1200 : 1000);
      try {
        raw = await getRawDevice(settings, cleanId, { refresh: true });
        const actualSsid = cleanText(getPathState(raw, plan.ssidParameter).value);
        const enableState = getPathState(raw, `${plan.base}.Enable`);
        const actualEnabled = enableState.exists ? truthyWifiValue(enableState.value) : null;
        const config = genieAcsWifi.wlanConfiguration(raw, plan.index);
        const security = genieAcsWifi._internal.readbackSecurity(config || {}, plan);
        verification = {
          verified: actualSsid === plan.cleanSsid
            && actualEnabled === plan.enabled
            && security.securityVerified
            && security.passwordVerified,
          informed: Boolean(actualSsid || enableState.exists),
          attempt,
          actualSsid,
          actualEnabled,
          ...security
        };
        if (verification.verified) break;
      } catch {
        verification.attempt = attempt;
      }
    }
    return {
      ok: true,
      ssid: plan.cleanSsid,
      enabled: plan.enabled,
      verification,
      taskId: cleanText(taskResult?._id)
    };
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
  DEFAULT_WAN_VLAN_PARAMETERS,
  DEFAULT_WIFI_5G_CLIENT_COUNT_PARAMETERS,
  DEFAULT_WIFI_5G_SSID_PARAMETERS,
  DEFAULT_WIFI_CLIENT_COUNT_PARAMETERS,
  DEFAULT_WIFI_PASSWORD_PARAMETERS,
  DEFAULT_WIFI_SSID_PARAMETERS,
  configured,
  configureWan,
  addWifiSsid,
  deleteDevice,
  findBestDevice,
  findDevice,
  filterRowsByNas,
  getDevice,
  getRawDevice,
  getWanConfiguration,
  getWifiConfiguration,
  listDevices,
  normalizeDevice,
  normalizeSettings,
  recentPendingDevices,
  reboot,
  refreshDevice,
  setPppCredentials,
  setWifiCredentials,
  setWifiSsidAndOptionalPassword,
  setWifiPassword,
  setWifiSsid,
  _internal: {
    clearDeviceListCache,
    deviceListProjection,
    deviceSummaryProjection,
    mergeProjectedRows,
    projectionChunks,
    recentPendingCandidate,
    recentPendingProjection,
    recentPppState,
    searchQuery,
    sameStringSet,
    usernameSuffixExclusionQuery,
    wanReadbackVerification,
    wifiCredentialsPlan,
    wifiSecurityEnabled
  }
};
