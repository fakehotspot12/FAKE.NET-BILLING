'use strict';

const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { createId } = require('./store');
const redisCache = require('./redis-cache');

const execFileAsync = promisify(execFile);
const DEFAULT_SNMP_OID = '1.3.6.1.2.1.1.3.0';
const SYS_DESCR_OID = '1.3.6.1.2.1.1.1.0';
const SYS_NAME_OID = '1.3.6.1.2.1.1.5.0';
const MIKROTIK_VERSION_OID = '1.3.6.1.4.1.14988.1.1.4.4.0';
const MIKROTIK_INTERFACE_NAME_OID = '1.3.6.1.4.1.14988.1.1.2.1.1.2';
const IF_NAME_OID = '1.3.6.1.2.1.31.1.1.1.1';
const IF_DESCR_OID = '1.3.6.1.2.1.2.2.1.2';
const IF_HC_IN_OCTETS_OID = '1.3.6.1.2.1.31.1.1.1.6';
const IF_HC_OUT_OCTETS_OID = '1.3.6.1.2.1.31.1.1.1.10';
const IF_IN_OCTETS_OID = '1.3.6.1.2.1.2.2.1.10';
const IF_OUT_OCTETS_OID = '1.3.6.1.2.1.2.2.1.16';
const IP_NET_TO_MEDIA_PHYS_ADDRESS_OID = '1.3.6.1.2.1.4.22.1.2';
const IP_NET_TO_MEDIA_NET_ADDRESS_OID = '1.3.6.1.2.1.4.22.1.3';
const dashboardTrafficSamples = new Map();
const dashboardInterfaceResolutionCache = new Map();
const routerDashboardSummaryCache = new Map();
const routerDashboardRefreshPromises = new Map();
const customerSummaryCache = new Map();
const customerSummaryRefreshPromises = new Map();
const ROUTER_DASHBOARD_CACHE_MS = Math.max(3000, Number(process.env.ROUTER_DASHBOARD_CACHE_MS || 10000) || 10000);
const ROUTER_DASHBOARD_STALE_MS = Math.max(30000, Number(process.env.ROUTER_DASHBOARD_STALE_MS || 180000) || 180000);
const ROUTER_DASHBOARD_REDIS_TTL_SECONDS = Math.max(
  Math.ceil(ROUTER_DASHBOARD_STALE_MS / 1000),
  Number(process.env.ROUTER_DASHBOARD_REDIS_TTL_SECONDS || 180) || 180
);
const ROUTER_DASHBOARD_CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.ROUTER_DASHBOARD_CONCURRENCY || 2) || 2));
const ROUTER_DASHBOARD_INTERFACE_CACHE_MS = Math.max(
  60000,
  Number(process.env.ROUTER_DASHBOARD_INTERFACE_CACHE_MS || 300000) || 300000
);
const CUSTOMER_SUMMARY_CACHE_MS = Math.max(5000, Number(process.env.MIKROTIK_CUSTOMER_SUMMARY_CACHE_MS || 20000) || 20000);
const CUSTOMER_SUMMARY_STALE_MS = Math.max(30000, Number(process.env.MIKROTIK_CUSTOMER_SUMMARY_STALE_MS || 90000) || 90000);
const CUSTOMER_SUMMARY_REDIS_TTL_SECONDS = Math.max(
  Math.ceil(CUSTOMER_SUMMARY_STALE_MS / 1000),
  Number(process.env.MIKROTIK_CUSTOMER_SUMMARY_REDIS_TTL_SECONDS || 120) || 120
);
const CUSTOMER_SUMMARY_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.MIKROTIK_CUSTOMER_SUMMARY_CONCURRENCY || 3) || 3));

function cleanText(value) {
  return String(value || '').trim();
}

function truthyInput(value) {
  return value === true || ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function cleanCoordinate(value, type = 'latitude') {
  const raw = cleanText(value).replace(',', '.');
  if (!raw) return '';
  const number = Number(raw);
  if (!Number.isFinite(number)) {
    throw new Error(`${type === 'longitude' ? 'Longitude' : 'Latitude'} tidak valid`);
  }
  const min = type === 'longitude' ? -180 : -90;
  const max = type === 'longitude' ? 180 : 90;
  if (number < min || number > max) {
    throw new Error(`${type === 'longitude' ? 'Longitude' : 'Latitude'} di luar batas`);
  }
  return String(Math.round(number * 10000000) / 10000000);
}

function payloadHas(source = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function cleanHttpUrl(value = '') {
  const raw = cleanText(value);
  if (!raw) return '';
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().slice(0, 300);
  } catch {
    return '';
  }
}

function toNumber(value) {
  const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return nowIso().slice(0, 10);
}

function addActivity(data, type, message, meta = {}) {
  if (!Array.isArray(data.activity)) {
    data.activity = [];
  }
  data.activity.unshift({
    id: createId('act'),
    type,
    message,
    meta,
    at: nowIso()
  });
  data.activity = data.activity.slice(0, 80);
}

function normalizeAssetStatus(value) {
  const status = cleanText(value).toLowerCase();
  if (['maintenance', 'perbaikan', 'maint'].includes(status)) return 'maintenance';
  if (['damaged', 'rusak', 'broken'].includes(status)) return 'damaged';
  if (['lost', 'hilang'].includes(status)) return 'lost';
  if (['inactive', 'nonaktif', 'arsip', 'disabled'].includes(status)) return 'inactive';
  return 'active';
}

function normalizeMonitorStatus(value) {
  const status = cleanText(value).toLowerCase();
  if (['up', 'online', 'ok', 'active'].includes(status)) return 'up';
  if (['down', 'offline', 'error', 'failed'].includes(status)) return 'down';
  return 'unknown';
}

function normalizeMonitorMethod(value) {
  const method = cleanText(value).toLowerCase();
  return method === 'snmp' ? 'snmp' : 'snmp';
}

function normalizeSnmpVersion(value) {
  const version = cleanText(value).toLowerCase().replace(/^v/, '');
  return version === '1' ? '1' : '2c';
}

function normalizeOid(value) {
  const oid = cleanText(value || DEFAULT_SNMP_OID).replace(/^\./, '');
  return /^\d+(?:\.\d+)*$/.test(oid) ? oid : DEFAULT_SNMP_OID;
}

function snmpTargetArgs(target, oid, outputFlag = '-Oqv') {
  const timeoutMs = Math.max(1000, Math.min(15000, Number(target.timeoutMs || 3000)));
  const port = Math.max(1, Math.min(65535, Number(target.port) || 161));
  return {
    timeoutMs,
    args: [
      '-v', normalizeSnmpVersion(target.snmpVersion),
      '-c', cleanText(target.community || 'public'),
      '-t', String(Math.max(1, Math.ceil(timeoutMs / 1000))),
      '-r', '0',
      outputFlag,
      `${cleanText(target.host)}:${port}`,
      oid
    ]
  };
}

async function readSnmpValue(target, oid) {
  const { timeoutMs, args } = snmpTargetArgs(target, oid, '-Oqv');
  const output = await execFileAsync('snmpget', args, {
    timeout: timeoutMs + 1000,
    windowsHide: true,
    maxBuffer: 128 * 1024
  });
  return sanitizeSnmpValue(output.stdout || output.stderr);
}

async function readSnmpIndexedValues(target, oid, options = {}) {
  const base = snmpTargetArgs(target, oid, '-Onq');
  const timeoutOverride = Number(options.timeoutMs);
  const timeoutMs = Number.isFinite(timeoutOverride)
    ? Math.max(1000, Math.min(15000, Math.trunc(timeoutOverride)))
    : Math.max(8000, base.timeoutMs);
  const args = [...base.args];
  const timeoutIndex = args.indexOf('-t');
  if (timeoutIndex !== -1) {
    args[timeoutIndex + 1] = String(Math.max(1, Math.ceil(timeoutMs / 1000)));
  }
  const output = await execFileAsync('snmpwalk', args, {
    timeout: timeoutMs + 1000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  return String(output.stdout || output.stderr)
    .split(/\r?\n/)
    .map((line) => {
      const text = cleanText(line);
      if (!text) return null;
      const parts = text.split(/\s+/);
      const oidText = cleanText(parts.shift()).replace(/^\.?/, '');
      const index = oidText.split('.').at(-1);
      const value = sanitizeSnmpValue(parts.join(' ').replace(/^=+\s*/, ''));
      return index ? { index, value } : null;
    })
    .filter(Boolean);
}

async function readSnmpRows(target, oid) {
  const base = snmpTargetArgs(target, oid, '-Onq');
  const timeoutMs = Math.max(8000, base.timeoutMs);
  const args = [...base.args];
  const timeoutIndex = args.indexOf('-t');
  if (timeoutIndex !== -1) {
    args[timeoutIndex + 1] = String(Math.max(1, Math.ceil(timeoutMs / 1000)));
  }
  const output = await execFileAsync('snmpwalk', args, {
    timeout: timeoutMs + 1000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  return String(output.stdout || output.stderr)
    .split(/\r?\n/)
    .map((line) => {
      const text = cleanText(line);
      if (!text) return null;
      const parts = text.split(/\s+/);
      const oidText = cleanText(parts.shift()).replace(/^\./, '');
      const value = sanitizeSnmpValue(parts.join(' ').replace(/^=+\s*/, ''));
      return oidText ? { oid: oidText, value } : null;
    })
    .filter(Boolean);
}

function parseRouterOsInfo(sysDescr = '', versionValue = '', target = {}) {
  const descr = sanitizeSnmpValue(sysDescr);
  const version = sanitizeSnmpValue(versionValue)
    || (descr.match(/(?:RouterOS|routeros|version)\s+([0-9]+(?:\.[0-9A-Za-z-]+)+)/i) || [])[1]
    || '';
  const type = (descr.match(/\b(CCR[0-9A-Za-z-]+|CRS[0-9A-Za-z-]+|RB[0-9A-Za-z-]+|hAP\s?[0-9A-Za-z-]*|cAP\s?[0-9A-Za-z-]*|CHR|RouterBOARD\s?[0-9A-Za-z-]*)\b/i) || [])[1]
    || target.radius?.type
    || 'RouterOS';
  return {
    type: sanitizeSnmpValue(type),
    version,
    description: descr
  };
}

function resolveDashboardInterface(target = {}, interfaces = []) {
  const selected = cleanText(target.dashboardInterface || target.trafficInterface || target.interfaceName);
  if (!interfaces.length) return null;
  if (!selected) return interfaces[0];
  const needle = selected.toLowerCase();
  return interfaces.find((item) => item.index === selected)
    || interfaces.find((item) => cleanText(item.value).toLowerCase() === needle)
    || interfaces.find((item) => cleanText(item.value).toLowerCase().includes(needle))
    || interfaces[0];
}

function usefulSnmpIndexedRows(rows = []) {
  return (rows || []).filter((row) => {
    const value = cleanText(row.value).toLowerCase();
    return row.index && row.value && !value.includes('no such') && !value.includes('end of mib');
  });
}

async function readDashboardInterfaceList(target = {}) {
  const timeoutMs = Math.max(2500, Math.min(4000, Number(target.dashboardSnmpTimeoutMs || target.timeoutMs || 3000) || 3000));
  let rows = [];
  try {
    rows = usefulSnmpIndexedRows(await readSnmpIndexedValues(target, IF_NAME_OID, { timeoutMs }));
  } catch (error) {
    if (error?.killed) return [];
  }
  if (!rows.length) {
    try {
      rows = usefulSnmpIndexedRows(await readSnmpIndexedValues(target, IF_DESCR_OID, { timeoutMs }));
    } catch {
      rows = [];
    }
  }
  return rows
    .filter((row) => row.index && row.value)
    .map((row) => ({
      index: row.index,
      name: row.value,
      value: row.value
    }));
}

function dashboardInterfaceCacheKey(target = {}) {
  return [
    target.id,
    target.host,
    target.port || 161,
    target.snmpVersion,
    target.community,
    target.dashboardInterface || target.trafficInterface,
    target.updatedAt || ''
  ].map((value) => cleanText(value)).join(':');
}

function selectedDashboardInterfaceLabel(target = {}) {
  return cleanText(target.dashboardInterface || target.trafficInterface || target.interfaceName);
}

async function dashboardInterfaceInfo(target = {}) {
  const selected = selectedDashboardInterfaceLabel(target);
  if (/^\d+$/.test(selected)) {
    return {
      selectedInterface: { index: selected, name: selected, value: selected },
      interfaceCount: 0,
      fromCache: true
    };
  }

  const cacheKey = dashboardInterfaceCacheKey(target);
  const cached = dashboardInterfaceResolutionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      selectedInterface: cached.selectedInterface,
      interfaceCount: cached.interfaceCount,
      fromCache: true
    };
  }

  const interfaces = await readDashboardInterfaceList(target);
  const selectedInterface = resolveDashboardInterface(target, interfaces);
  if (selectedInterface) {
    dashboardInterfaceResolutionCache.set(cacheKey, {
      selectedInterface,
      interfaceCount: interfaces.length,
      expiresAt: Date.now() + ROUTER_DASHBOARD_INTERFACE_CACHE_MS
    });
  }
  while (dashboardInterfaceResolutionCache.size > 64) {
    dashboardInterfaceResolutionCache.delete(dashboardInterfaceResolutionCache.keys().next().value);
  }
  return {
    selectedInterface,
    interfaceCount: interfaces.length,
    fromCache: false
  };
}

function dashboardSnmpError(error) {
  if (error?.code === 'ENOENT') return 'snmpwalk/snmpget tidak ditemukan';
  if (error?.killed) return 'SNMP timeout';
  return 'SNMP router tidak merespons';
}

async function readTrafficOctets(target = {}, interfaceIndex = '') {
  const index = cleanText(interfaceIndex);
  if (!index) return { inputOctets: 0, outputOctets: 0, counterMode: '' };
  try {
    const [input, output] = await Promise.all([
      readSnmpValue(target, `${IF_HC_IN_OCTETS_OID}.${index}`),
      readSnmpValue(target, `${IF_HC_OUT_OCTETS_OID}.${index}`)
    ]);
    return {
      inputOctets: Math.max(0, toNumber(input)),
      outputOctets: Math.max(0, toNumber(output)),
      counterMode: '64-bit'
    };
  } catch {
    const [input, output] = await Promise.all([
      readSnmpValue(target, `${IF_IN_OCTETS_OID}.${index}`),
      readSnmpValue(target, `${IF_OUT_OCTETS_OID}.${index}`)
    ]);
    return {
      inputOctets: Math.max(0, toNumber(input)),
      outputOctets: Math.max(0, toNumber(output)),
      counterMode: '32-bit'
    };
  }
}

function trafficRateForSample(targetId = '', interfaceIndex = '', counters = {}) {
  const key = `${targetId}:${interfaceIndex}`;
  const now = Date.now();
  const previous = dashboardTrafficSamples.get(key);
  dashboardTrafficSamples.set(key, {
    at: now,
    inputOctets: Number(counters.inputOctets || 0),
    outputOctets: Number(counters.outputOctets || 0)
  });
  while (dashboardTrafficSamples.size > 128) {
    dashboardTrafficSamples.delete(dashboardTrafficSamples.keys().next().value);
  }
  if (!previous) {
    return { uploadBps: 0, downloadBps: 0, sampled: false };
  }
  const seconds = Math.max(0.001, (now - previous.at) / 1000);
  const inputDiff = Number(counters.inputOctets || 0) - Number(previous.inputOctets || 0);
  const outputDiff = Number(counters.outputOctets || 0) - Number(previous.outputOctets || 0);
  return {
    uploadBps: Math.max(0, Math.round((outputDiff * 8) / seconds)),
    downloadBps: Math.max(0, Math.round((inputDiff * 8) / seconds)),
    sampled: true
  };
}

function sanitizeSnmpValue(value) {
  return cleanText(value).replace(/\s+/g, ' ').replace(/^"|"$/g, '').slice(0, 220);
}

function snmpStringLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => cleanText(line).replace(/^"|"$/g, ''))
    .filter(Boolean);
}

function customerInterfaceType(name) {
  const value = cleanText(name)
    .toLowerCase()
    .replace(/^"|"$/g, '')
    .replace(/^<|>$/g, '')
    .trim();
  if (!value) return '';
  if (/^hotspot[-_\s]/.test(value)) return 'hotspot';
  if (/^pppoe[-_\s]/.test(value) && !/^pppoe[-_\s](out|server|client)(?:\b|\d|[-_])/.test(value)) return 'pppoe';
  return '';
}

function customerInterfaceCounts(names = []) {
  return names.reduce((counts, name) => {
    const type = customerInterfaceType(name);
    if (type === 'pppoe') counts.pppoe += 1;
    if (type === 'hotspot') counts.hotspot += 1;
    return counts;
  }, { pppoe: 0, hotspot: 0 });
}

function customerInterfaceLabel(name) {
  const raw = cleanText(name)
    .replace(/^"|"$/g, '')
    .replace(/^<|>$/g, '')
    .trim();
  return raw
    .replace(/^pppoe[-_\s]*/i, '')
    .replace(/^hotspot[-_\s]*/i, '')
    .trim() || raw;
}

function customerInterfaceRows(names = [], site = {}) {
  return names.map((entry, index) => {
    const name = typeof entry === 'string' ? entry : entry.name || entry.value || entry.interfaceName || '';
    const type = customerInterfaceType(name);
    if (!type) return null;
    const rawName = cleanText(name).replace(/^"|"$/g, '').replace(/^<|>$/g, '').trim();
    const ipAddress = cleanText(entry.ipAddress || entry.clientIp || '');
    return {
      id: `${site.id || site.name || 'site'}:${index}:${rawName}`,
      siteId: site.id || '',
      siteName: site.name || '',
      host: site.host || '',
      location: site.location || '',
      type,
      username: customerInterfaceLabel(name),
      interfaceName: rawName,
      interfaceIndex: cleanText(entry.index || ''),
      ipAddress,
      clientIp: ipAddress,
      macAddress: cleanText(entry.macAddress || ''),
      ipSource: cleanText(entry.ipSource || ''),
      status: 'online'
    };
  }).filter(Boolean);
}

function sanitizeSiteMediaServices(payload = {}, current = {}) {
  const source = payload.mediaServices && typeof payload.mediaServices === 'object' ? payload.mediaServices : payload;
  const next = {
    ...current
  };
  for (const key of ['tvheadendUrl', 'tvheadendUsername', 'embyUrl']) {
    if (typeof source[key] === 'string') {
      next[key] = cleanText(source[key]);
    }
  }
  if (typeof source.tvheadendPassword === 'string' && source.tvheadendPassword.trim()) {
    next.tvheadendPassword = source.tvheadendPassword.trim();
  }
  if (typeof source.embyApiKey === 'string' && source.embyApiKey.trim()) {
    next.embyApiKey = source.embyApiKey.trim();
  }
  return next;
}

function boolValue(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = cleanText(value).toLowerCase();
  if (['1', 'true', 'yes', 'on', 'aktif', 'active'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'nonaktif', 'inactive'].includes(normalized)) return false;
  return fallback;
}

function sanitizeSiteRadius(payload = {}, current = {}, target = {}) {
  const hasNestedRadius = payload.radius && typeof payload.radius === 'object';
  const source = hasNestedRadius ? payload.radius : payload;
  const next = { ...current };
  const secret = cleanText(source.radiusSecret || source.secret);
  const previousAddress = cleanText(current.address || target.host || target.ipAddress);
  next.enabled = boolValue(source.radiusEnabled ?? source.enabled, Boolean(next.secret || secret));
  next.address = cleanText(payload.host || payload.ipAddress || target.host);
  const aliases = Array.isArray(current.aliases) ? [...current.aliases] : [];
  if (previousAddress && next.address && previousAddress !== next.address && !aliases.includes(previousAddress)) {
    aliases.push(previousAddress);
  }
  next.aliases = aliases.slice(-8);
  const radiusPort = hasNestedRadius ? source.port : source.radiusPort;
  next.port = Math.max(1, Math.min(65535, Number(radiusPort || next.port) || 3799));
  next.type = cleanText((hasNestedRadius ? source.type : source.radiusType) || next.type || 'mikrotik');
  next.name = cleanText(source.radiusName || source.name || target.name || payload.name);
  if (secret) {
    next.secret = secret;
  }
  if (!next.enabled && !next.secret) {
    next.address = next.address || cleanText(target.host || payload.host || payload.ipAddress);
  }
  return next;
}

function sanitizeSiteHotspot(payload = {}, current = {}) {
  const source = payload.hotspot && typeof payload.hotspot === 'object' ? payload.hotspot : payload;
  const hasLoginUrl = Object.prototype.hasOwnProperty.call(source, 'loginUrl')
    || Object.prototype.hasOwnProperty.call(source, 'hotspotLoginUrl');
  return {
    ...current,
    loginUrl: hasLoginUrl
      ? cleanHttpUrl(source.hotspotLoginUrl ?? source.loginUrl)
      : cleanHttpUrl(current.loginUrl || '')
  };
}

function serviceSettingsOnly(config = {}) {
  return {
    tvheadendUrl: cleanText(config.tvheadendUrl),
    tvheadendUsername: cleanText(config.tvheadendUsername),
    tvheadendPassword: cleanText(config.tvheadendPassword),
    embyUrl: cleanText(config.embyUrl),
    embyApiKey: cleanText(config.embyApiKey)
  };
}

function legacyServiceTargetId(data = {}) {
  return ((data.monitoringTargets || [])
    .find((target) => target && target.status !== 'inactive' && cleanText(target.host)) || {}).id || '';
}

function monitoringTargetMediaServices(data = {}, target = {}) {
  const mediaServices = data.settings?.mediaServices && typeof data.settings.mediaServices === 'object'
    ? data.settings.mediaServices
    : {};
  const siteServices = mediaServices.siteServices && typeof mediaServices.siteServices === 'object'
    ? mediaServices.siteServices
    : {};
  const legacyConfig = target.id && target.id === legacyServiceTargetId(data)
    ? serviceSettingsOnly({
      ...mediaServices,
      tvheadendUrl: process.env.TVHEADEND_URL || mediaServices.tvheadendUrl,
      tvheadendUsername: process.env.TVHEADEND_USERNAME || mediaServices.tvheadendUsername,
      tvheadendPassword: process.env.TVHEADEND_PASSWORD || mediaServices.tvheadendPassword,
      embyUrl: process.env.EMBY_URL || mediaServices.embyUrl,
      embyApiKey: process.env.EMBY_API_KEY || mediaServices.embyApiKey
    })
    : {};
  const siteConfig = serviceSettingsOnly(siteServices[target.id] || {});
  const targetConfig = serviceSettingsOnly(target.mediaServices || {});
  const merged = {};
  for (const key of ['tvheadendUrl', 'tvheadendUsername', 'tvheadendPassword', 'embyUrl', 'embyApiKey']) {
    merged[key] = targetConfig[key] || siteConfig[key] || legacyConfig[key] || '';
  }
  return merged;
}

const DEFAULT_INVENTORY_ITEMS = [
  { sku: 'FO-SPLITTER', name: 'Splitter', category: 'Passive FO' },
  { sku: 'PWR-ADAPTOR', name: 'Adaptor', category: 'Aksesoris' },
  { sku: 'CPE-HUAWEI-5G', name: 'Modem Huawei 5G', category: 'CPE' },
  { sku: 'CPE-ZTE-5G', name: 'ZTE 5G', category: 'CPE' },
  { sku: 'CPE-ZTE-2G', name: 'ZTE 2G', category: 'CPE' },
  { sku: 'CPE-HUAWEI-2G', name: 'Huawei 2G', category: 'CPE' },
  { sku: 'CPE-FIBERHOME-2G', name: 'Fiberhome 2G', category: 'CPE' },
  { sku: 'CPE-FIBERHOME-5G', name: 'Fiberhome 5G', category: 'CPE' },
  { sku: 'STB-FIBERHOME-A10', name: 'STB Fiberhome Android 10', category: 'STB' },
  { sku: 'STB-FIBERHOME-A6', name: 'STB Fiberhome Android 6', category: 'STB' },
  { sku: 'FO-SELONGSONG', name: 'Selongsong', category: 'Material Instalasi' },
  { sku: 'MAT-SOLASI', name: 'Solasi', category: 'Material Instalasi' },
  { sku: 'MAT-TIS', name: 'TIS', category: 'Material Instalasi' },
  { sku: 'MAT-CLAM', name: 'Clam', category: 'Material Instalasi' },
  { sku: 'BAT-AAA', name: 'Baterai AAA', category: 'Tools' },
  { sku: 'BAT-AA', name: 'Baterai AA', category: 'Tools' },
  { sku: 'FO-SPLITTER-1-8', name: 'Splitter 1:8', category: 'Passive FO' },
  { sku: 'FO-SPLITTER-1-2', name: 'Splitter 1:2', category: 'Passive FO' },
  { sku: 'FO-SPLITTER-1-4', name: 'Splitter 1:4', category: 'Passive FO' },
  { sku: 'FO-BARREL', name: 'Barrel FO', category: 'Material Instalasi' },
  { sku: 'FO-PATCHCORE-APC', name: 'Patchcore APC', category: 'Material Instalasi' },
  { sku: 'FO-PATCHCORE-UPC', name: 'Patchcore UPC', category: 'Material Instalasi' }
];

function inventoryNameKey(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, ' ');
}

function ensureDefaultInventoryItems(data) {
  if (!Array.isArray(data.inventoryItems)) {
    data.inventoryItems = [];
  }
  if (!Array.isArray(data.stockMovements)) {
    data.stockMovements = [];
  }

  const existingNames = new Set(data.inventoryItems.map((item) => inventoryNameKey(item.name)));
  const now = nowIso();
  const created = [];

  DEFAULT_INVENTORY_ITEMS.forEach((template) => {
    const key = inventoryNameKey(template.name);
    if (!key || existingNames.has(key)) {
      return;
    }
    const item = {
      id: createId('itm'),
      sku: template.sku,
      name: template.name,
      category: template.category,
      unit: 'pcs',
      quantity: 0,
      minimumStock: 0,
      location: 'Gudang',
      vendor: '',
      notes: 'Master barang ISP/RTRW Net',
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    data.inventoryItems.push(item);
    existingNames.add(key);
    created.push(item);
  });

  if (created.length) {
    addActivity(data, 'inventory', `Master inventaris ditambahkan ${created.length} barang`, {
      itemCount: created.length
    });
  }

  return { created };
}

function inventorySummary(items = []) {
  const active = items.filter((item) => item.status !== 'inactive');
  const lowStock = active.filter((item) => Number(item.quantity || 0) > 0 && Number(item.quantity || 0) <= Number(item.minimumStock || 0));
  const outOfStock = active.filter((item) => Number(item.quantity || 0) <= 0);
  return {
    itemCount: active.length,
    totalUnits: active.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length
  };
}

function addInventoryItem(data, payload = {}) {
  const name = cleanText(payload.name);
  if (!name) {
    throw new Error('Nama barang wajib diisi');
  }

  const now = nowIso();
  const quantity = Math.max(0, toNumber(payload.quantity));
  const item = {
    id: createId('itm'),
    sku: cleanText(payload.sku),
    name,
    category: cleanText(payload.category || 'Perangkat'),
    unit: cleanText(payload.unit || 'pcs'),
    quantity,
    minimumStock: Math.max(0, toNumber(payload.minimumStock)),
    location: cleanText(payload.location || 'Gudang'),
    vendor: cleanText(payload.vendor),
    notes: cleanText(payload.notes),
    status: normalizeAssetStatus(payload.status),
    createdAt: now,
    updatedAt: now
  };

  data.inventoryItems.push(item);
  if (quantity > 0) {
    data.stockMovements.push({
      id: createId('mov'),
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      type: 'adjust',
      quantity,
      beforeQuantity: 0,
      afterQuantity: quantity,
      reference: 'Saldo awal',
      updatedByName: cleanText(payload.updatedByName || payload.actorName),
      updatedByUsername: cleanText(payload.updatedByUsername || payload.actorUsername),
      updatedByRole: cleanText(payload.updatedByRole || payload.actorRole),
      notes: '',
      at: todayIso(),
      createdAt: now
    });
  }
  addActivity(data, 'inventory', `Barang ${item.name} ditambahkan`, { itemId: item.id });
  return item;
}

function updateInventoryItem(data, itemId, payload = {}) {
  const item = (data.inventoryItems || []).find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }

  const beforeQuantity = Number(item.quantity || 0);
  const quantityProvided = payload.quantity !== undefined && payload.quantity !== '';
  const nextQuantity = quantityProvided ? Math.max(0, toNumber(payload.quantity)) : beforeQuantity;

  item.sku = cleanText(payload.sku);
  item.name = cleanText(payload.name || item.name);
  item.category = cleanText(payload.category || item.category || 'Perangkat');
  item.unit = cleanText(payload.unit || item.unit || 'pcs');
  item.quantity = nextQuantity;
  item.minimumStock = Math.max(0, toNumber(payload.minimumStock));
  item.location = cleanText(payload.location || item.location || 'Gudang');
  item.vendor = cleanText(payload.vendor);
  item.notes = cleanText(payload.notes);
  item.status = normalizeAssetStatus(payload.status || item.status);
  item.updatedAt = nowIso();

  if (quantityProvided && nextQuantity !== beforeQuantity) {
    data.stockMovements.push({
      id: createId('mov'),
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      type: 'adjust',
      quantity: Math.abs(nextQuantity - beforeQuantity),
      beforeQuantity,
      afterQuantity: nextQuantity,
      reference: 'Koreksi stok',
      updatedByName: cleanText(payload.updatedByName || payload.actorName),
      updatedByUsername: cleanText(payload.updatedByUsername || payload.actorUsername),
      updatedByRole: cleanText(payload.updatedByRole || payload.actorRole),
      notes: cleanText(payload.notes),
      at: todayIso(),
      createdAt: nowIso()
    });
  }
  addActivity(data, 'inventory', `Barang ${item.name} diperbarui`, { itemId: item.id });
  return item;
}

function archiveInventoryItem(data, itemId) {
  const item = (data.inventoryItems || []).find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }
  item.status = 'inactive';
  item.updatedAt = nowIso();
  addActivity(data, 'inventory', `Barang ${item.name} diarsipkan`, { itemId: item.id });
  return item;
}

function addStockMovement(data, itemId, payload = {}) {
  const item = (data.inventoryItems || []).find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }

  const type = ['in', 'out', 'adjust'].includes(payload.type) ? payload.type : 'in';
  const quantity = Math.max(0, toNumber(payload.quantity));
  if (!quantity) {
    throw new Error('Jumlah stok wajib lebih dari 0');
  }

  const beforeQuantity = Number(item.quantity || 0);
  let afterQuantity = beforeQuantity;
  if (type === 'in') {
    afterQuantity += quantity;
  } else if (type === 'out') {
    afterQuantity -= quantity;
  } else {
    afterQuantity = quantity;
  }

  if (afterQuantity < 0) {
    throw new Error('Stok tidak cukup untuk transaksi keluar');
  }

  const movement = {
    id: createId('mov'),
    itemId: item.id,
    itemName: item.name,
    unit: item.unit,
    type,
    quantity,
    beforeQuantity,
    afterQuantity,
    reference: cleanText(payload.reference) || cleanText(payload.updatedByName || payload.actorName || payload.updatedByUsername || payload.actorUsername),
    updatedByName: cleanText(payload.updatedByName || payload.actorName),
    updatedByUsername: cleanText(payload.updatedByUsername || payload.actorUsername),
    updatedByRole: cleanText(payload.updatedByRole || payload.actorRole),
    notes: cleanText(payload.notes),
    at: payload.at || todayIso(),
    createdAt: nowIso()
  };

  item.quantity = afterQuantity;
  item.updatedAt = nowIso();
  data.stockMovements.push(movement);
  addActivity(data, 'inventory', `Stok ${item.name} ${type === 'out' ? 'keluar' : 'masuk'} ${quantity} ${item.unit}`, {
    itemId: item.id,
    movementId: movement.id
  });
  return { item, movement };
}

function networkSummary(assets = []) {
  const active = assets.filter((asset) => asset.status !== 'inactive');
  return {
    assetCount: active.length,
    activeCount: active.filter((asset) => asset.status === 'active').length,
    maintenanceCount: active.filter((asset) => asset.status === 'maintenance').length,
    damagedCount: active.filter((asset) => asset.status === 'damaged').length,
    lostCount: active.filter((asset) => asset.status === 'lost').length,
    inactiveCount: assets.filter((asset) => asset.status === 'inactive').length
  };
}

function addNetworkAsset(data, payload = {}) {
  const name = cleanText(payload.name);
  if (!name) {
    throw new Error('Nama aset wajib diisi');
  }

  const now = nowIso();
  const asset = {
    id: createId('net'),
    name,
    type: cleanText(payload.type || 'Perangkat Server'),
    site: cleanText(payload.site || payload.location || 'Gudang'),
    location: cleanText(payload.location),
    brand: cleanText(payload.brand),
    model: cleanText(payload.model),
    serialNumber: cleanText(payload.serialNumber),
    owner: cleanText(payload.owner),
    status: normalizeAssetStatus(payload.status),
    notes: cleanText(payload.notes),
    createdAt: now,
    updatedAt: now
  };

  data.networkAssets.push(asset);
  addActivity(data, 'network', `Aset ${asset.name} ditambahkan`, { assetId: asset.id });
  return asset;
}

function updateNetworkAsset(data, assetId, payload = {}) {
  const asset = (data.networkAssets || []).find((entry) => entry.id === assetId);
  if (!asset) {
    return null;
  }

  Object.assign(asset, {
    name: cleanText(payload.name || asset.name),
    type: cleanText(payload.type || asset.type || 'Perangkat Server'),
    site: cleanText(payload.site || asset.site || payload.location || 'Gudang'),
    location: cleanText(payload.location),
    brand: cleanText(payload.brand),
    model: cleanText(payload.model),
    serialNumber: cleanText(payload.serialNumber),
    owner: cleanText(payload.owner),
    status: normalizeAssetStatus(payload.status || asset.status),
    notes: cleanText(payload.notes),
    updatedAt: nowIso()
  });
  addActivity(data, 'network', `Aset ${asset.name} diperbarui`, { assetId: asset.id });
  return asset;
}

function archiveNetworkAsset(data, assetId) {
  const asset = (data.networkAssets || []).find((entry) => entry.id === assetId);
  if (!asset) {
    return null;
  }
  asset.status = 'inactive';
  asset.updatedAt = nowIso();
  addActivity(data, 'network', `Aset ${asset.name} diarsipkan`, { assetId: asset.id });
  return asset;
}

function monitoringSummary(targets = []) {
  const active = targets.filter((target) => target.status !== 'inactive');
  const checkedTargets = active.filter((target) => target.lastCheckedAt);
  const lastCheckedAt = checkedTargets
    .map((target) => target.lastCheckedAt)
    .sort()
    .at(-1) || '';
  return {
    targetCount: active.length,
    upCount: active.filter((target) => normalizeMonitorStatus(target.status) === 'up').length,
    downCount: active.filter((target) => normalizeMonitorStatus(target.status) === 'down').length,
    unknownCount: active.filter((target) => normalizeMonitorStatus(target.status) === 'unknown').length,
    lastCheckedAt
  };
}

function addMonitoringTarget(data, payload = {}) {
  const name = cleanText(payload.name);
  const host = cleanText(payload.host || payload.ipAddress);
  if (!name || !host) {
    throw new Error('Nama target dan host/IP wajib diisi');
  }

  const now = nowIso();
  const target = {
    id: createId('mon'),
    name,
    host,
    method: 'snmp',
    snmpVersion: normalizeSnmpVersion(payload.snmpVersion),
    community: cleanText(payload.community || 'public'),
    oid: normalizeOid(payload.oid),
    port: Math.max(1, Math.min(65535, Number(payload.port) || 161)),
    dashboardInterface: cleanText(payload.dashboardInterface || payload.trafficInterface),
    assetId: cleanText(payload.assetId),
    location: cleanText(payload.location),
    latitude: cleanCoordinate(payload.latitude ?? payload.siteLatitude ?? '', 'latitude'),
    longitude: cleanCoordinate(payload.longitude ?? payload.siteLongitude ?? '', 'longitude'),
    isPrimarySite: truthyInput(payload.isPrimarySite || payload.primarySite),
    timeoutMs: Math.max(1000, Math.min(15000, Number(payload.timeoutMs) || 3000)),
    status: 'unknown',
    lastCheckedAt: '',
    lastLatencyMs: null,
    lastValue: '',
    lastError: '',
    notes: cleanText(payload.notes),
    mediaServices: sanitizeSiteMediaServices(payload),
    radius: sanitizeSiteRadius(payload, {}, { name, host }),
    hotspot: sanitizeSiteHotspot(payload),
    createdAt: now,
    updatedAt: now
  };

  data.monitoringTargets.push(target);
  addActivity(data, 'monitoring', `Target monitoring ${target.name} ditambahkan`, { targetId: target.id });
  return target;
}

function updateMonitoringTarget(data, targetId, payload = {}) {
  const target = (data.monitoringTargets || []).find((entry) => entry.id === targetId);
  if (!target) {
    return null;
  }

  Object.assign(target, {
    name: cleanText(payload.name || target.name),
    host: cleanText(payload.host || target.host),
    method: 'snmp',
    snmpVersion: normalizeSnmpVersion(payload.snmpVersion || target.snmpVersion),
    community: cleanText(payload.community || target.community || 'public'),
    oid: normalizeOid(payload.oid || target.oid),
    port: Math.max(1, Math.min(65535, Number(payload.port) || target.port || 161)),
    dashboardInterface: cleanText(payload.dashboardInterface || payload.trafficInterface || target.dashboardInterface),
    assetId: cleanText(payload.assetId),
    location: cleanText(payload.location),
    latitude: cleanCoordinate(payloadHas(payload, 'latitude') ? payload.latitude : target.latitude, 'latitude'),
    longitude: cleanCoordinate(payloadHas(payload, 'longitude') ? payload.longitude : target.longitude, 'longitude'),
    isPrimarySite: (payloadHas(payload, 'isPrimarySite') || payloadHas(payload, 'primarySite'))
      ? truthyInput(payload.isPrimarySite || payload.primarySite)
      : target.isPrimarySite === true,
    timeoutMs: Math.max(1000, Math.min(15000, Number(payload.timeoutMs) || target.timeoutMs || 3000)),
    notes: cleanText(payload.notes),
    mediaServices: sanitizeSiteMediaServices(payload, monitoringTargetMediaServices(data, target)),
    radius: sanitizeSiteRadius(payload, target.radius || {}, target),
    hotspot: sanitizeSiteHotspot(payload, target.hotspot || {}),
    updatedAt: nowIso()
  });
  addActivity(data, 'monitoring', `Target monitoring ${target.name} diperbarui`, { targetId: target.id });
  return target;
}

function deleteMonitoringTarget(data, targetId) {
  const index = (data.monitoringTargets || []).findIndex((entry) => entry.id === targetId);
  if (index === -1) {
    return null;
  }

  const [target] = data.monitoringTargets.splice(index, 1);
  addActivity(data, 'monitoring', `Target monitoring ${target.name} dihapus`, { targetId: target.id });
  return target;
}

async function checkMonitoringTarget(target) {
  const start = Date.now();
  const timeoutMs = Math.max(1000, Math.min(15000, Number(target.timeoutMs || 3000)));
  const port = Math.max(1, Math.min(65535, Number(target.port) || 161));
  const args = [
    '-v', normalizeSnmpVersion(target.snmpVersion),
    '-c', cleanText(target.community || 'public'),
    '-t', String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    '-r', '0',
    '-Oqv',
    `${cleanText(target.host)}:${port}`,
    normalizeOid(target.oid)
  ];

  let result;
  try {
    const output = await execFileAsync('snmpget', args, {
      timeout: timeoutMs + 1000,
      windowsHide: true,
      maxBuffer: 64 * 1024
    });
    result = {
      ok: true,
      value: sanitizeSnmpValue(output.stdout || output.stderr),
      error: ''
    };
  } catch (error) {
    const stderr = sanitizeSnmpValue(error.stderr);
    const message = error.code === 'ENOENT'
      ? 'snmpget tidak ditemukan'
      : (error.killed ? `Timeout ${timeoutMs} ms` : (stderr || 'SNMP check gagal'));
    result = {
      ok: false,
      value: sanitizeSnmpValue(error.stdout),
      error: message
    };
  }

  return {
    status: result.ok ? 'up' : 'down',
    lastCheckedAt: nowIso(),
    lastLatencyMs: Date.now() - start,
    lastValue: result.value,
    lastError: result.error
  };
}

async function runMonitoringCheck(data, targetId = '') {
  const targets = (data.monitoringTargets || [])
    .filter((target) => target.status !== 'inactive' && (!targetId || target.id === targetId));
  const results = [];

  for (const target of targets) {
    const result = await checkMonitoringTarget(target);
    Object.assign(target, result, {
      updatedAt: result.lastCheckedAt
    });
    results.push({ ...target });
  }

  if (results.length) {
    addActivity(data, 'monitoring', `Monitoring dicek: ${results.length} target`, {
      targetId,
      downCount: results.filter((target) => target.status === 'down').length
    });
  }

  return results;
}

async function readSnmpInterfaceNames(target, oid) {
  const timeoutMs = Math.max(4000, Math.min(15000, Number(target.timeoutMs || 5000)));
  const port = Math.max(1, Math.min(65535, Number(target.port) || 161));
  const output = await execFileAsync('snmpwalk', [
    '-v', normalizeSnmpVersion(target.snmpVersion),
    '-c', cleanText(target.community || 'public'),
    '-t', String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    '-r', '0',
    '-Oqv',
    `${cleanText(target.host)}:${port}`,
    oid
  ], {
    timeout: timeoutMs + 1000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  return snmpStringLines(output.stdout || output.stderr);
}

function oidSuffixParts(oid = '', baseOid = '') {
  const cleanOid = cleanText(oid).replace(/^\./, '');
  const cleanBase = cleanText(baseOid).replace(/^\./, '');
  if (!cleanOid.startsWith(`${cleanBase}.`)) return [];
  return cleanOid.slice(cleanBase.length + 1).split('.').filter(Boolean);
}

function validIpv4(value = '') {
  const parts = cleanText(value).split('.');
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function snmpMacText(value = '') {
  const text = cleanText(value).replace(/^Hex-STRING:\s*/i, '').replace(/\s+/g, ':').toLowerCase();
  if (/^[0-9a-f]{1,2}(?::[0-9a-f]{1,2}){5}$/i.test(text)) {
    return text.split(':').map((part) => part.padStart(2, '0')).join(':');
  }
  return cleanText(value);
}

async function readSnmpInterfaceEntries(target, oid) {
  const indexed = await readSnmpIndexedValues(target, oid).catch(() => []);
  if (indexed.length) {
    const rows = indexed
      .filter((row) => row.index && row.value)
      .map((row) => ({ index: row.index, name: row.value, value: row.value }));
    if (rows.length) return rows;
  }
  const names = await readSnmpInterfaceNames(target, oid);
  return names.map((name, index) => ({
    index: String(index + 1),
    name,
    value: name
  }));
}

async function readSnmpInterfaceIpMap(target) {
  const [ipRows, macRows] = await Promise.all([
    readSnmpRows(target, IP_NET_TO_MEDIA_NET_ADDRESS_OID).catch(() => []),
    readSnmpRows(target, IP_NET_TO_MEDIA_PHYS_ADDRESS_OID).catch(() => [])
  ]);
  const byKey = new Map();
  const byInterface = new Map();
  for (const row of ipRows) {
    const suffix = oidSuffixParts(row.oid, IP_NET_TO_MEDIA_NET_ADDRESS_OID);
    if (suffix.length < 5) continue;
    const ifIndex = suffix[0];
    const ipAddress = suffix.slice(1, 5).join('.');
    if (!ifIndex || !validIpv4(ipAddress)) continue;
    const key = `${ifIndex}:${ipAddress}`;
    byKey.set(key, {
      interfaceIndex: ifIndex,
      ipAddress,
      macAddress: '',
      source: 'snmp-ip-net-to-media'
    });
  }
  for (const row of macRows) {
    const suffix = oidSuffixParts(row.oid, IP_NET_TO_MEDIA_PHYS_ADDRESS_OID);
    if (suffix.length < 5) continue;
    const ifIndex = suffix[0];
    const ipAddress = suffix.slice(1, 5).join('.');
    const key = `${ifIndex}:${ipAddress}`;
    const current = byKey.get(key) || {
      interfaceIndex: ifIndex,
      ipAddress,
      macAddress: '',
      source: 'snmp-ip-net-to-media'
    };
    current.macAddress = snmpMacText(row.value);
    byKey.set(key, current);
  }
  for (const entry of byKey.values()) {
    if (!byInterface.has(entry.interfaceIndex)) byInterface.set(entry.interfaceIndex, []);
    byInterface.get(entry.interfaceIndex).push(entry);
  }
  return byInterface;
}

function customerIpForInterface(entry = {}, ipMap = new Map(), target = {}) {
  const candidates = ipMap.get(cleanText(entry.index)) || [];
  const targetHost = cleanText(target.host);
  return candidates.find((item) => item.ipAddress && item.ipAddress !== targetHost) || null;
}

async function checkMikrotikCustomerTarget(target) {
  const startedAt = Date.now();
  let oid = MIKROTIK_INTERFACE_NAME_OID;
  let interfaces = [];
  let ipMap = new Map();
  let error = '';

  try {
    interfaces = await readSnmpInterfaceEntries(target, oid);
  } catch (firstError) {
    try {
      oid = IF_NAME_OID;
      interfaces = await readSnmpInterfaceEntries(target, oid);
    } catch (secondError) {
      error = sanitizeSnmpValue(secondError.stderr || secondError.message || firstError.message || 'SNMP pelanggan gagal');
    }
  }

  if (!error) {
    ipMap = await readSnmpInterfaceIpMap(target).catch(() => new Map());
  }

  const enrichedInterfaces = interfaces.map((entry) => {
    const client = customerIpForInterface(entry, ipMap, target);
    return {
      ...entry,
      ipAddress: client?.ipAddress || '',
      macAddress: client?.macAddress || '',
      ipSource: client?.source || ''
    };
  });
  const counts = customerInterfaceCounts(enrichedInterfaces.map((entry) => entry.name || entry.value));
  const customerInterfaces = customerInterfaceRows(enrichedInterfaces, target);
  const pppoeUsers = customerInterfaces.filter((item) => item.type === 'pppoe');
  const hotspotUsers = customerInterfaces.filter((item) => item.type === 'hotspot');
  const totalCustomerInterfaces = counts.pppoe + counts.hotspot;
  const online = counts.pppoe;
  return {
    id: target.id,
    name: target.name,
    host: target.host,
    location: target.location || '',
    status: error ? 'down' : 'up',
    online,
    totalCustomerInterfaces,
    pppoe: counts.pppoe,
    hotspot: counts.hotspot,
    pppoeUsers,
    hotspotUsers,
    interfaceCount: interfaces.length,
    oid,
    error,
    latencyMs: Date.now() - startedAt,
    checkedAt: nowIso()
  };
}

async function checkRouterDashboardTarget(target = {}) {
  const startedAt = Date.now();
  const base = {
    id: target.id,
    name: target.name,
    host: target.host,
    location: target.location || '',
    status: 'down',
    snmpStatus: 'down',
    identity: '',
    routerosType: target.radius?.type || 'RouterOS',
    routerosVersion: '',
    description: '',
    selectedInterface: cleanText(target.dashboardInterface || target.trafficInterface),
    selectedInterfaceIndex: '',
    selectedInterfaceName: '',
    uploadBps: 0,
    downloadBps: 0,
    rxBytes: 0,
    txBytes: 0,
    inputOctets: 0,
    outputOctets: 0,
    uploadText: '',
    downloadText: '',
    counterMode: '',
    latencyMs: 0,
    checkedAt: nowIso(),
    error: ''
  };

  try {
    const [descrResult, identityResult, versionResult] = await Promise.allSettled([
      readSnmpValue(target, SYS_DESCR_OID),
      readSnmpValue(target, SYS_NAME_OID),
      readSnmpValue(target, MIKROTIK_VERSION_OID)
    ]);
    const sysDescr = descrResult.status === 'fulfilled' ? descrResult.value : '';
    const identity = identityResult.status === 'fulfilled' ? identityResult.value : '';
    const versionValue = versionResult.status === 'fulfilled' ? versionResult.value : '';
    if (!sysDescr && !identity) {
      throw new Error(descrResult.reason?.message || identityResult.reason?.message || 'SNMP router tidak merespons');
    }
    const routerInfo = parseRouterOsInfo(sysDescr, versionValue, target);
    let interfaceInfo = { selectedInterface: null, interfaceCount: 0, fromCache: false };
    let selectedInterface = null;
    let traffic = { inputOctets: 0, outputOctets: 0, counterMode: '' };
    try {
      interfaceInfo = await dashboardInterfaceInfo(target);
      selectedInterface = interfaceInfo.selectedInterface;
      if (selectedInterface) {
        traffic = await readTrafficOctets(target, selectedInterface.index);
      }
    } catch (error) {
      base.error = 'Traffic interface belum terbaca';
    }
    const rates = selectedInterface
      ? trafficRateForSample(target.id || target.host, selectedInterface.index, traffic)
      : { uploadBps: 0, downloadBps: 0, sampled: false };
    return {
      ...base,
      status: 'up',
      snmpStatus: 'up',
      identity,
      routerosType: routerInfo.type,
      routerosVersion: routerInfo.version,
      description: routerInfo.description,
      selectedInterface: cleanText(target.dashboardInterface || target.trafficInterface),
      selectedInterfaceIndex: selectedInterface?.index || '',
      selectedInterfaceName: selectedInterface?.name || selectedDashboardInterfaceLabel(target),
      interfaceCount: interfaceInfo.interfaceCount || 0,
      uploadBps: rates.uploadBps,
      downloadBps: rates.downloadBps,
      rxBytes: Math.max(0, Number(traffic.inputOctets || 0)),
      txBytes: Math.max(0, Number(traffic.outputOctets || 0)),
      inputOctets: Math.max(0, Number(traffic.inputOctets || 0)),
      outputOctets: Math.max(0, Number(traffic.outputOctets || 0)),
      counterMode: traffic.counterMode,
      rateSampled: rates.sampled,
      latencyMs: Date.now() - startedAt,
      checkedAt: nowIso()
    };
  } catch (error) {
    return {
      ...base,
      error: dashboardSnmpError(error),
      latencyMs: Date.now() - startedAt,
      checkedAt: nowIso()
    };
  }
}

function routerDashboardRedisKey(signature = '') {
  const digest = crypto.createHash('sha1').update(String(signature || '')).digest('hex');
  return `fakenet:runtime:router-dashboard:${digest}`;
}

async function getRouterDashboardRedisCache(signature = '') {
  if (!redisCache.enabled() || !signature) return null;
  try {
    const raw = await redisCache.get(routerDashboardRedisKey(signature));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setRouterDashboardRedisCache(signature = '', payload = null) {
  if (!redisCache.enabled() || !signature || !payload) return;
  try {
    await redisCache.set(routerDashboardRedisKey(signature), JSON.stringify(payload), ROUTER_DASHBOARD_REDIS_TTL_SECONDS);
  } catch {
    // Redis cache is optional; SNMP polling still works without it.
  }
}

function routerDashboardTargets(targets = []) {
  return (targets || [])
    .filter((target) => target && target.status !== 'inactive' && cleanText(target.host))
    .slice(0, 20);
}

function routerDashboardCacheKey(activeTargets = []) {
  return (activeTargets || []).map((target) => [
    target.id,
    target.name,
    target.host,
    target.port || 161,
    target.snmpVersion,
    target.community,
    target.dashboardInterface || target.trafficInterface,
    target.timeoutMs || 3000,
    target.updatedAt || ''
  ].map((value) => cleanText(value)).join(':')).join('|');
}

function routerDashboardCacheAgeMs(payload = {}) {
  const generatedAt = Date.parse(payload.summary?.generatedAt || payload.generatedAt || '');
  if (!Number.isFinite(generatedAt)) return 0;
  return Math.max(0, Date.now() - generatedAt);
}

function routerDashboardPayload(activeTargets = [], routers = [], options = {}) {
  const payload = {
    ok: routers.some((router) => router.status === 'up'),
    source: 'mikrotik-snmp',
    routers,
    summary: {
      total: routers.length,
      upCount: routers.filter((router) => router.status === 'up').length,
      downCount: routers.filter((router) => router.status !== 'up' && router.status !== 'checking').length,
      checkingCount: routers.filter((router) => router.status === 'checking').length,
      generatedAt: options.generatedAt || nowIso()
    }
  };
  if (!routers.length && activeTargets.length) {
    payload.summary.total = activeTargets.length;
  }
  return payload;
}

function routerDashboardPlaceholder(activeTargets = []) {
  return routerDashboardPayload(activeTargets, activeTargets.map((target) => ({
    id: target.id,
    name: target.name,
    host: target.host,
    location: target.location || '',
    status: 'checking',
    snmpStatus: 'checking',
    identity: '',
    routerosType: target.radius?.type || 'RouterOS',
    routerosVersion: '',
    description: '',
    selectedInterface: cleanText(target.dashboardInterface || target.trafficInterface),
    selectedInterfaceIndex: '',
    selectedInterfaceName: cleanText(target.dashboardInterface || target.trafficInterface),
    interfaceCount: 0,
    uploadBps: 0,
    downloadBps: 0,
    rxBytes: 0,
    txBytes: 0,
    inputOctets: 0,
    outputOctets: 0,
    uploadText: '',
    downloadText: '',
    counterMode: '',
    rateSampled: false,
    latencyMs: 0,
    checkedAt: nowIso(),
    error: ''
  })));
}

function decorateRouterDashboardPayload(payload = {}, options = {}) {
  const next = structuredClone(payload || {});
  const cacheAgeMs = routerDashboardCacheAgeMs(next);
  const summary = next.summary || {};
  next.cached = Boolean(options.cached);
  next.stale = Boolean(options.stale);
  next.refreshing = Boolean(options.refreshing);
  next.cacheAgeMs = cacheAgeMs;
  next.summary = {
    ...summary,
    cached: next.cached,
    stale: next.stale,
    refreshing: next.refreshing,
    cacheAgeMs
  };
  return next;
}

async function setRouterDashboardCache(cacheKey = '', payload = null) {
  if (!cacheKey || !payload) return;
  routerDashboardSummaryCache.set(cacheKey, {
    expiresAt: Date.now() + ROUTER_DASHBOARD_CACHE_MS,
    staleAt: Date.now() + ROUTER_DASHBOARD_STALE_MS,
    value: structuredClone(payload)
  });
  while (routerDashboardSummaryCache.size > 8) {
    routerDashboardSummaryCache.delete(routerDashboardSummaryCache.keys().next().value);
  }
  await setRouterDashboardRedisCache(cacheKey, payload);
}

async function refreshRouterDashboardSummary(activeTargets = [], cacheKey = '') {
  if (routerDashboardRefreshPromises.has(cacheKey)) {
    return routerDashboardRefreshPromises.get(cacheKey);
  }
  const promise = (async () => {
    const routers = await mapWithConcurrency(
      activeTargets,
      ROUTER_DASHBOARD_CONCURRENCY,
      (target) => checkRouterDashboardTarget(target)
    );
    const payload = routerDashboardPayload(activeTargets, routers);
    await setRouterDashboardCache(cacheKey, payload);
    return payload;
  })().finally(() => {
    routerDashboardRefreshPromises.delete(cacheKey);
  });
  routerDashboardRefreshPromises.set(cacheKey, promise);
  return promise;
}

function customerSummaryRedisKey(signature = '') {
  const digest = crypto.createHash('sha1').update(String(signature || '')).digest('hex');
  return `fakenet:runtime:customer-summary:${digest}`;
}

function customerSummaryCacheAgeMs(payload = {}) {
  const generatedAt = Date.parse(payload.summary?.generatedAt || payload.generatedAt || payload.checkedAt || '');
  if (!Number.isFinite(generatedAt)) return 0;
  return Math.max(0, Date.now() - generatedAt);
}

async function getCustomerSummaryRedisCache(signature = '') {
  if (!redisCache.enabled() || !signature) return null;
  try {
    const raw = await redisCache.get(customerSummaryRedisKey(signature));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setCustomerSummaryRedisCache(signature = '', payload = null) {
  if (!redisCache.enabled() || !signature || !payload) return;
  try {
    await redisCache.set(customerSummaryRedisKey(signature), JSON.stringify(payload), CUSTOMER_SUMMARY_REDIS_TTL_SECONDS);
  } catch {
    // Redis cache is optional; SNMP polling still works without it.
  }
}

function decorateCustomerSummaryPayload(payload = {}, options = {}) {
  const next = structuredClone(payload || {});
  next.cached = Boolean(options.cached);
  next.stale = Boolean(options.stale);
  next.refreshing = Boolean(options.refreshing);
  next.summary = {
    ...(next.summary || {}),
    cached: next.cached,
    stale: next.stale,
    refreshing: next.refreshing
  };
  return next;
}

function customerSummaryPlaceholder(activeTargets = []) {
  const sites = activeTargets.map((target) => ({
    id: target.id || '',
    name: target.name || target.host || 'NAS',
    host: target.host || '',
    status: 'checking',
    online: 0,
    pppoe: 0,
    hotspot: 0,
    interfaceCount: 0,
    totalCustomerInterfaces: 0,
    rows: [],
    checkedAt: '',
    error: ''
  }));
  return {
    ok: false,
    source: 'mikrotik-snmp',
    summary: {
      online: 0,
      pppoe: 0,
      hotspot: 0,
      interfaceCount: 0,
      totalCustomerInterfaces: 0,
      upCount: 0,
      downCount: 0,
      checkingCount: sites.length,
      siteCount: sites.length,
      customerMode: 'summary-and-per-site',
      onlineMeaning: 'pppoe-only',
      generatedAt: '',
      sourceMode: 'mikrotik-snmp'
    },
    sites,
    rows: []
  };
}

async function refreshMikrotikCustomerSummary(activeTargets = [], cacheKey = '') {
  if (customerSummaryRefreshPromises.has(cacheKey)) {
    return customerSummaryRefreshPromises.get(cacheKey);
  }
  const promise = (async () => {
    const sites = await mapWithConcurrency(activeTargets, CUSTOMER_SUMMARY_CONCURRENCY, (target) => checkMikrotikCustomerTarget(target));
    const summary = sites.reduce((totals, site) => {
      totals.online += Number(site.online || 0);
      totals.totalCustomerInterfaces += Number(site.totalCustomerInterfaces || 0);
      totals.pppoe += Number(site.pppoe || 0);
      totals.hotspot += Number(site.hotspot || 0);
      totals.interfaceCount += Number(site.interfaceCount || 0);
      if (site.status === 'up') totals.upCount += 1;
      if (site.status === 'down') totals.downCount += 1;
      return totals;
    }, {
      online: 0,
      pppoe: 0,
      hotspot: 0,
      interfaceCount: 0,
      totalCustomerInterfaces: 0,
      upCount: 0,
      downCount: 0
    });

    const payload = {
      ok: sites.some((site) => site.status === 'up'),
      source: 'mikrotik-snmp',
      summary: {
        ...summary,
        siteCount: sites.length,
        customerMode: 'summary-and-per-site',
        onlineMeaning: 'pppoe-only',
        generatedAt: nowIso(),
        sourceMode: 'mikrotik-snmp'
      },
      sites
    };
    customerSummaryCache.set(cacheKey, {
      expiresAt: Date.now() + CUSTOMER_SUMMARY_CACHE_MS,
      staleAt: Date.now() + CUSTOMER_SUMMARY_STALE_MS,
      value: structuredClone(payload)
    });
    while (customerSummaryCache.size > 8) {
      customerSummaryCache.delete(customerSummaryCache.keys().next().value);
    }
    await setCustomerSummaryRedisCache(cacheKey, payload);
    return payload;
  })().finally(() => {
    customerSummaryRefreshPromises.delete(cacheKey);
  });
  customerSummaryRefreshPromises.set(cacheKey, promise);
  return promise;
}

function monitoringTargetSignature(targets = []) {
  return (targets || []).map((target) => [
    target.id,
    target.name,
    target.host,
    target.port || 161,
    target.snmpVersion,
    target.community,
    target.timeoutMs || 5000,
    target.updatedAt || ''
  ].map((value) => cleanText(value)).join(':')).join('|');
}

async function mapWithConcurrency(items = [], concurrency = 3, iterator = async (item) => item) {
  const rows = Array.isArray(items) ? items : [];
  const results = new Array(rows.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), rows.length) }, async () => {
    while (nextIndex < rows.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await iterator(rows[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function routerDashboardSummary(targets = [], options = {}) {
  const activeTargets = routerDashboardTargets(targets);
  const cacheKey = routerDashboardCacheKey(activeTargets);
  const allowStale = options.allowStale === true;
  const refreshInBackground = options.refreshInBackground === true;
  const forceRefresh = options.forceRefresh === true || options.force === true;
  if (!activeTargets.length) {
    return decorateRouterDashboardPayload(routerDashboardPayload(activeTargets, []), {
      cached: false,
      stale: false,
      refreshing: false
    });
  }
  const cached = routerDashboardSummaryCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return decorateRouterDashboardPayload(cached.value, {
      cached: true,
      stale: false,
      refreshing: routerDashboardRefreshPromises.has(cacheKey)
    });
  }
  if (!forceRefresh && allowStale && cached && cached.staleAt > Date.now()) {
    if (refreshInBackground) {
      refreshRouterDashboardSummary(activeTargets, cacheKey).catch(() => null);
    }
    return decorateRouterDashboardPayload(cached.value, {
      cached: true,
      stale: true,
      refreshing: refreshInBackground || routerDashboardRefreshPromises.has(cacheKey)
    });
  }
  if (!forceRefresh) {
    const redisCached = await getRouterDashboardRedisCache(cacheKey);
    if (redisCached) {
      const ageMs = routerDashboardCacheAgeMs(redisCached);
      const fresh = ageMs <= ROUTER_DASHBOARD_CACHE_MS;
      const stale = ageMs <= ROUTER_DASHBOARD_STALE_MS;
      routerDashboardSummaryCache.set(cacheKey, {
        expiresAt: Date.now() + Math.max(0, ROUTER_DASHBOARD_CACHE_MS - ageMs),
        staleAt: Date.now() + Math.max(0, ROUTER_DASHBOARD_STALE_MS - ageMs),
        value: structuredClone(redisCached)
      });
      if (fresh) {
        return decorateRouterDashboardPayload(redisCached, {
          cached: true,
          stale: false,
          refreshing: routerDashboardRefreshPromises.has(cacheKey)
        });
      }
      if (allowStale && stale) {
        if (refreshInBackground) {
          refreshRouterDashboardSummary(activeTargets, cacheKey).catch(() => null);
        }
        return decorateRouterDashboardPayload(redisCached, {
          cached: true,
          stale: true,
          refreshing: refreshInBackground || routerDashboardRefreshPromises.has(cacheKey)
        });
      }
    }
  }
  if (allowStale && refreshInBackground) {
    refreshRouterDashboardSummary(activeTargets, cacheKey).catch(() => null);
    return decorateRouterDashboardPayload(routerDashboardPlaceholder(activeTargets), {
      cached: false,
      stale: true,
      refreshing: true
    });
  }
  const payload = await refreshRouterDashboardSummary(activeTargets, cacheKey);
  return decorateRouterDashboardPayload(payload, {
    cached: false,
    stale: false,
    refreshing: false
  });
}

async function mikrotikCustomerSummary(targets = [], options = {}) {
  const activeTargets = (targets || [])
    .filter((target) => target && target.status !== 'inactive' && cleanText(target.host));
  const cacheKey = monitoringTargetSignature(activeTargets);
  const forceRefresh = options.forceRefresh === true || options.refresh === true;
  const allowStale = options.allowStale === true;
  const refreshInBackground = options.refreshInBackground === true;
  if (!forceRefresh) {
    const cached = customerSummaryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return decorateCustomerSummaryPayload(cached.value, {
        cached: true,
        stale: false,
        refreshing: customerSummaryRefreshPromises.has(cacheKey)
      });
    }
    if (allowStale && cached && cached.staleAt > Date.now()) {
      if (refreshInBackground) {
        refreshMikrotikCustomerSummary(activeTargets, cacheKey).catch(() => null);
      }
      return decorateCustomerSummaryPayload(cached.value, {
        cached: true,
        stale: true,
        refreshing: refreshInBackground || customerSummaryRefreshPromises.has(cacheKey)
      });
    }
    const redisCached = await getCustomerSummaryRedisCache(cacheKey);
    if (redisCached) {
      const ageMs = customerSummaryCacheAgeMs(redisCached);
      const fresh = ageMs <= CUSTOMER_SUMMARY_CACHE_MS;
      const stale = ageMs <= CUSTOMER_SUMMARY_STALE_MS;
      customerSummaryCache.set(cacheKey, {
        expiresAt: Date.now() + Math.max(0, CUSTOMER_SUMMARY_CACHE_MS - ageMs),
        staleAt: Date.now() + Math.max(0, CUSTOMER_SUMMARY_STALE_MS - ageMs),
        value: structuredClone(redisCached)
      });
      if (fresh) {
        return decorateCustomerSummaryPayload(redisCached, {
          cached: true,
          stale: false,
          refreshing: customerSummaryRefreshPromises.has(cacheKey)
        });
      }
      if (allowStale && stale) {
        if (refreshInBackground) {
          refreshMikrotikCustomerSummary(activeTargets, cacheKey).catch(() => null);
        }
        return decorateCustomerSummaryPayload(redisCached, {
          cached: true,
          stale: true,
          refreshing: refreshInBackground || customerSummaryRefreshPromises.has(cacheKey)
        });
      }
    }
  }
  if (!forceRefresh && allowStale && refreshInBackground) {
    refreshMikrotikCustomerSummary(activeTargets, cacheKey).catch(() => null);
    return decorateCustomerSummaryPayload(customerSummaryPlaceholder(activeTargets), {
      cached: false,
      stale: true,
      refreshing: true
    });
  }
  const payload = await refreshMikrotikCustomerSummary(activeTargets, cacheKey);
  return decorateCustomerSummaryPayload(payload, {
    cached: false,
    stale: false,
    refreshing: false
  });
}

module.exports = {
  addInventoryItem,
  addMonitoringTarget,
  addNetworkAsset,
  addStockMovement,
  archiveInventoryItem,
  archiveNetworkAsset,
  checkMonitoringTarget,
  DEFAULT_SNMP_OID,
  deleteMonitoringTarget,
  ensureDefaultInventoryItems,
  inventorySummary,
  mikrotikCustomerSummary,
  monitoringSummary,
  networkSummary,
  routerDashboardSummary,
  runMonitoringCheck,
  updateInventoryItem,
  updateMonitoringTarget,
  updateNetworkAsset
};
