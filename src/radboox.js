'use strict';

const crypto = require('crypto');
const { URL } = require('url');
const { normalizePeriod, normalizeStatus, toNumber } = require('./finance');
const redisCache = require('./redis-cache');

const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.RADBOOX_TIMEOUT_MS || 15000);
const DEFAULT_MONITOR_CACHE_TTL_SECONDS = Number(process.env.RADBOOX_MONITOR_CACHE_TTL_SECONDS || 30);
const DEFAULT_STALE_CACHE_TTL_SECONDS = Number(process.env.RADBOOX_STALE_CACHE_TTL_SECONDS || 7 * 24 * 60 * 60);
const DEFAULT_SESSION_TTL_MS = Number(process.env.RADBOOX_SESSION_TTL_MS || 8 * 60 * 1000);
const XENDIT_WITHDRAW_RESERVE_AMOUNT = 10000;
const DEFAULT_ADMIN_ALIASES = {
  47304: 'fakenet',
  47330: 'Daus S.',
  51366: 'fakenet-reseller1',
  52661: 'Irfan Syahrani',
  52880: 'Rahul R. F.',
  52901: 'Wahyudi',
  56968: 'Nurdiansyah'
};
const RADBOOX_SOURCE_TIMEZONE_OFFSET = '+07:00';
const memoryCache = new Map();
const inFlightCache = new Map();
const webSessionCache = new Map();

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function formatRupiah(value) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

function clonePayload(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashKey(parts) {
  return crypto.createHash('sha256').update(stableStringify(parts)).digest('hex');
}

function cacheKey(label, parts) {
  return `fakenet-billing:radboox:${label}:${hashKey(parts)}`;
}

function cacheTtlSeconds(runtime = {}) {
  if (runtime.cacheTtlSeconds !== undefined) {
    const ttl = Number(runtime.cacheTtlSeconds);
    return Number.isFinite(ttl) ? ttl : DEFAULT_MONITOR_CACHE_TTL_SECONDS;
  }
  return Number.isFinite(DEFAULT_MONITOR_CACHE_TTL_SECONDS) ? DEFAULT_MONITOR_CACHE_TTL_SECONDS : 30;
}

function cacheEnabled(runtime = {}) {
  return runtime.cache !== false && runtime.noCache !== true && cacheTtlSeconds(runtime) > 0;
}

function staleCacheTtlSeconds(runtime = {}) {
  if (runtime.staleCacheTtlSeconds !== undefined) {
    const ttl = Number(runtime.staleCacheTtlSeconds);
    return Number.isFinite(ttl) ? ttl : DEFAULT_STALE_CACHE_TTL_SECONDS;
  }
  return Number.isFinite(DEFAULT_STALE_CACHE_TTL_SECONDS) ? DEFAULT_STALE_CACHE_TTL_SECONDS : 7 * 24 * 60 * 60;
}

function staleCacheEnabled(runtime = {}) {
  return cacheEnabled(runtime) && runtime.allowStaleCache !== false && staleCacheTtlSeconds(runtime) > 0;
}

function cachePayload(value, meta = {}) {
  const copy = clonePayload(value);
  if (copy && typeof copy === 'object' && !Array.isArray(copy)) {
    return {
      ...copy,
      ...meta
    };
  }
  return copy;
}

async function readCache(key, runtime = {}) {
  if (!cacheEnabled(runtime) || runtime.force || runtime.refresh) {
    return null;
  }
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cachePayload(cached.value, { cache: 'memory' });
  }
  if (cached && (!cached.staleExpiresAt || cached.staleExpiresAt <= now)) {
    memoryCache.delete(key);
  }
  if (!redisCache.enabled()) {
    return null;
  }
  try {
    const raw = await redisCache.get(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    memoryCache.set(key, {
      value,
      expiresAt: now + cacheTtlSeconds(runtime) * 1000,
      staleExpiresAt: now + staleCacheTtlSeconds(runtime) * 1000
    });
    return cachePayload(value, { cache: 'redis' });
  } catch {
    return null;
  }
}

async function readStaleCache(key, runtime = {}, error = null) {
  if (!staleCacheEnabled(runtime)) {
    return null;
  }
  const now = Date.now();
  const errorMessage = error && error.message ? error.message : '';
  const cached = memoryCache.get(key);
  if (cached && cached.staleExpiresAt > now) {
    return cachePayload(cached.value, {
      cache: 'memory-stale',
      staleCache: true,
      cacheError: errorMessage
    });
  }
  if (!redisCache.enabled()) {
    return null;
  }
  try {
    const raw = await redisCache.get(`${key}:stale`);
    if (!raw) return null;
    const value = JSON.parse(raw);
    memoryCache.set(key, {
      value,
      expiresAt: 0,
      staleExpiresAt: now + staleCacheTtlSeconds(runtime) * 1000
    });
    return cachePayload(value, {
      cache: 'redis-stale',
      staleCache: true,
      cacheError: errorMessage
    });
  } catch {
    return null;
  }
}

async function writeCache(key, value, runtime = {}) {
  if (!cacheEnabled(runtime)) {
    return;
  }
  const ttl = cacheTtlSeconds(runtime);
  const staleTtl = staleCacheTtlSeconds(runtime);
  const copy = clonePayload(value);
  memoryCache.set(key, {
    value: copy,
    expiresAt: Date.now() + ttl * 1000,
    staleExpiresAt: Date.now() + staleTtl * 1000
  });
  if (!redisCache.enabled()) {
    return;
  }
  try {
    await redisCache.set(key, JSON.stringify(copy), ttl);
    if (staleCacheEnabled(runtime)) {
      await redisCache.set(`${key}:stale`, JSON.stringify(copy), staleTtl);
    }
  } catch {
    // Redis is optional; memory cache still protects repeated clicks.
  }
}

async function cachedFetch(key, runtime, loader) {
  const cached = await readCache(key, runtime);
  if (cached) {
    return cached;
  }
  if (inFlightCache.has(key) && !runtime.force && !runtime.refresh) {
    return clonePayload(await inFlightCache.get(key));
  }
  const promise = Promise.resolve()
    .then(loader)
    .then(async (value) => {
      await writeCache(key, value, runtime);
      return value;
    })
    .catch(async (error) => {
      const stale = await readStaleCache(key, runtime, error);
      if (stale) {
        return stale;
      }
      throw error;
    })
    .finally(() => {
      inFlightCache.delete(key);
    });
  inFlightCache.set(key, promise);
  return clonePayload(await promise);
}

function tokenFromPayload(payload, allowMessageString = false) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  if (typeof payload.token === 'string') {
    return cleanText(payload.token);
  }
  if (typeof payload.accessToken === 'string') {
    return cleanText(payload.accessToken);
  }
  if (payload.message && typeof payload.message === 'object') {
    const nested = tokenFromPayload(payload.message, allowMessageString);
    if (nested) {
      return nested;
    }
  }
  if (payload.data && typeof payload.data === 'object') {
    const nested = tokenFromPayload(payload.data, allowMessageString);
    if (nested) {
      return nested;
    }
  }
  if (allowMessageString && typeof payload.message === 'string') {
    return cleanText(payload.message);
  }
  return '';
}

function pick(record, names) {
  for (const name of names) {
    if (record && Object.prototype.hasOwnProperty.call(record, name) && record[name] !== null && record[name] !== undefined && record[name] !== '') {
      return record[name];
    }
  }
  return '';
}

function inferPeriod(record) {
  const period = cleanText(pick(record, ['period', 'billing_period', 'billingPeriod', 'bulan', 'month', 'periode']));
  if (/^\d{4}-\d{2}$/.test(period)) {
    return period;
  }

  const date = cleanText(pick(record, [
    'date',
    'invoice_date',
    'invoiceDate',
    'created_at',
    'createdAt',
    'due_date',
    'dueDate',
    'paid_at',
    'paidAt'
  ]));
  const match = date.match(/(\d{4})[-/](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}`;
  }

  return normalizePeriod(period);
}

function explicitPeriod(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})[-/](\d{1,2})$/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}`;
}

function periodFromBillingDate(value) {
  const date = normalizeBillingDate(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : '';
}

function periodsFromBillingText(value) {
  const text = cleanText(value);
  if (!text) return [];
  const periods = new Set();
  const add = (period) => {
    const normalized = explicitPeriod(period);
    if (normalized) periods.add(normalized);
  };

  for (const match of text.matchAll(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    add(`${match[1]}-${match[2]}`);
  }
  for (const match of text.matchAll(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/g)) {
    add(`${match[3]}-${match[2]}`);
  }
  for (const match of text.matchAll(/\b(\d{4})[-/](\d{1,2})\b/g)) {
    add(`${match[1]}-${match[2]}`);
  }

  return [...periods];
}

function inferBillingInvoicePeriod(record = {}) {
  const directPeriod = explicitPeriod(pick(record, ['period', 'month', 'bulan', 'periode']));
  if (directPeriod) return directPeriod;

  const textPeriod = [
    pick(record, ['subscribe', 'subscription', 'billing_period', 'billingPeriod']),
    pick(record, ['item', 'description', 'keterangan'])
  ].flatMap(periodsFromBillingText).find(Boolean);
  if (textPeriod) return textPeriod;

  return [
    pick(record, ['invoice_date', 'invoiceDate', 'date', 'tanggal']),
    pick(record, ['due_date', 'dueDate', 'jatuh_tempo']),
    pick(record, ['paid_date', 'paidDate', 'paid_at', 'paidAt', 'payment_date', 'paymentDate'])
  ].map(periodFromBillingDate).find(Boolean) || '';
}

function localDateIso() {
  return localDateIsoFromDate(new Date());
}

function localDateIsoFromDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localTimeTextFromDate(date) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date).replace('.', ':');
}

function hasExplicitTimezone(value) {
  return /^\d{4}-\d{2}-\d{2}T/.test(cleanText(value)) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(cleanText(value));
}

function sourceOffsetDateTime(date, hour = '00', minute = '00', second = '00') {
  const normalizedDate = normalizeBillingDate(date);
  if (!normalizedDate) return '';
  return `${normalizedDate}T${String(Number(hour)).padStart(2, '0')}:${minute}:${second}${RADBOOX_SOURCE_TIMEZONE_OFFSET}`;
}

function normalizeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : localDateIso();
}

function normalizeBillingDate(value) {
  if (hasExplicitTimezone(value)) {
    const date = new Date(cleanText(value));
    if (!Number.isNaN(date.getTime())) {
      return localDateIsoFromDate(date);
    }
  }
  const text = cleanText(value).slice(0, 10);
  if (!text) return '';
  let year = '';
  let month = '';
  let day = '';
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (iso) {
    [, year, month, day] = iso;
  } else if (local) {
    [, day, month, year] = local;
  } else {
    return text;
  }

  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    return text;
  }
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
}

function normalizeBillingDateTime(value) {
  const text = cleanText(value);
  if (!text) return '';
  if (hasExplicitTimezone(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  const timeFirst = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (timeFirst) {
    const [, hour, minute, secondTime = '00', day, month, year] = timeFirst;
    const date = normalizeBillingDate(`${day}/${month}/${year}`);
    if (!date) return text;
    return `${date}T${String(Number(hour)).padStart(2, '0')}:${minute}:${secondTime}+08:00`;
  }
  const match = text.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return text;

  const [, first, second, third, hour = '00', minute = '00', secondTime = '00'] = match;
  const date = first.length === 4
    ? normalizeBillingDate(`${first}-${second}-${third}`)
    : normalizeBillingDate(`${first}/${second}/${third}`);
  if (!date) return text;
  return `${date}T${String(Number(hour)).padStart(2, '0')}:${minute}:${secondTime}+08:00`;
}

function normalizeRadbooxDateTime(value) {
  const text = cleanText(value);
  if (!text) return '';
  if (hasExplicitTimezone(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  const timeFirst = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (timeFirst) {
    const [, hour, minute, secondTime = '00', day, month, year] = timeFirst;
    return sourceOffsetDateTime(`${day}/${month}/${year}`, hour, minute, secondTime) || text;
  }
  const match = text.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return text;
  const [, first, second, third, hour = '00', minute = '00', secondTime = '00'] = match;
  const rawDate = first.length === 4 ? `${first}-${second}-${third}` : `${first}/${second}/${third}`;
  return sourceOffsetDateTime(rawDate, hour, minute, secondTime) || text;
}

function radbooxSourceDate(value) {
  const text = cleanText(value);
  if (!text) return '';
  const timeFirst = text.match(/^\d{1,2}:\d{2}(?::\d{2})?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (timeFirst) {
    const [, day, month, year] = timeFirst;
    return normalizeBillingDate(`${day}/${month}/${year}`);
  }
  const dateFirst = text.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})/);
  if (!dateFirst) return '';
  const [, first, second, third] = dateFirst;
  return first.length === 4 ? normalizeBillingDate(`${first}-${second}-${third}`) : normalizeBillingDate(`${first}/${second}/${third}`);
}

function extractUsername(value) {
  const text = cleanText(value);
  const match = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return match ? cleanText(match[0]).toLowerCase() : '';
}

function urlWithPeriod(baseUrl, requestPath, period) {
  const normalizedPeriod = normalizePeriod(period);
  const date = `${normalizedPeriod}-01`;
  const path = String(requestPath || '/')
    .replaceAll('{period}', normalizedPeriod)
    .replaceAll('{date}', date);
  const url = new URL(path, baseUrl);
  if (!String(requestPath || '').includes('{period}') && !String(requestPath || '').includes('{date}') && !url.searchParams.has('period') && !url.searchParams.has('date')) {
    url.searchParams.set('period', normalizedPeriod);
  }
  return url.toString();
}

function urlWithDate(baseUrl, requestPath, date) {
  const normalizedDate = normalizeDate(date);
  const path = String(requestPath || '/')
    .replaceAll('{date}', normalizedDate)
    .replaceAll('{period}', normalizedDate.slice(0, 7));
  const url = new URL(path, baseUrl);
  if (!String(requestPath || '').includes('{date}') && !url.searchParams.has('date')) {
    url.searchParams.set('date', normalizedDate);
  }
  return url.toString();
}

function monthlyEarningPaths(config = {}) {
  const paths = [
    config.webEarningsPath,
    config.earningsPath,
    '/api-v1/billing/report/monthly?date={date}&type=&admin=',
    '/api-v1/billing/report/monthly?date={date}',
    '/api-v1/role/kasir/monthly?date={date}&method='
  ].filter(Boolean);

  return [...new Set(paths)];
}

function dailyReportPaths(config = {}) {
  const paths = [
    config.webDailyReportPath,
    config.dailyReportPath,
    '/api-v1/billing/report/daily?date={date}&type=&admin=&s=',
    '/api-v1/billing/report/daily?date={date}',
    '/api-v1/billing/report/daily?date={date}&type=&admin=',
    '/api-v1/role/kasir/daily?date={date}&method='
  ].filter(Boolean);

  return [...new Set(paths)];
}

function apiBaseUrl(config) {
  if (config.apiBaseUrl) {
    return config.apiBaseUrl;
  }

  try {
    const url = new URL(config.baseUrl);
    if (url.hostname === 'my.radboox.com') {
      return 'https://ssr.radboox.com';
    }
  } catch {
    return config.baseUrl;
  }

  return config.baseUrl;
}

function asArray(payload, candidates = []) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const queue = [payload];
  const seen = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== 'object' || seen.has(value)) {
      continue;
    }
    seen.add(value);

    for (const key of candidates.concat(['data', 'rows', 'items', 'results', 'records', 'customers', 'users', 'invoices', 'billing'])) {
      if (Array.isArray(value[key])) {
        return value[key];
      }
      if (value[key] && typeof value[key] === 'object') {
        queue.push(value[key]);
      }
    }
  }

  return [];
}

function normalizeCustomer(record) {
  const username = cleanText(pick(record, ['username', 'user', 'login', 'email', 'pppoe_username']));
  const name = cleanText(pick(record, ['name', 'full_name', 'fullName', 'fullname', 'customer_name', 'customerName', 'nama', 'Full Name'])) || username;

  return {
    externalId: cleanText(pick(record, ['id', 'customer_id', 'customerId', 'id_customer', 'uid', 'No'])),
    username,
    name,
    phone: cleanText(pick(record, ['phone', 'whatsapp', 'wa', 'mobile', 'no_whatsapp', 'No. Whatsapp'])),
    address: cleanText(pick(record, ['address', 'alamat', 'Address'])),
    packageName: cleanText(pick(record, ['profile', 'package', 'package_name', 'packageName', 'plan', 'Profile'])),
    price: toNumber(pick(record, ['price', 'amount', 'tariff', 'tarif', 'monthly_fee', 'monthlyFee', 'bill_amount'])),
    status: normalizeStatus(pick(record, ['status', 'state', 'active', 'Status']) || 'active'),
    dueDay: toNumber(pick(record, ['due_day', 'dueDay', 'billing_date', 'billingDate', 'tanggal_tagihan']))
  };
}

function normalizeInvoice(record) {
  const username = cleanText(pick(record, ['username', 'user', 'login', 'email', 'pppoe_username']));
  const customerName = cleanText(pick(record, ['customer_name', 'customerName', 'full_name', 'fullName', 'name', 'nama']));

  return {
    externalId: cleanText(pick(record, ['id', 'invoice_id', 'invoiceId', 'id_invoice', 'no_invoice', 'invoice_number', 'invoiceNumber'])),
    customerExternalId: cleanText(pick(record, ['customer_id', 'customerId', 'id_customer', 'uid'])),
    username,
    customerName: customerName || username,
    packageName: cleanText(pick(record, ['profile', 'package', 'package_name', 'packageName', 'plan'])),
    period: inferPeriod(record),
    amount: toNumber(pick(record, ['amount', 'total', 'grand_total', 'grandTotal', 'bill_amount', 'tagihan', 'price'])),
    dueDate: normalizeBillingDate(pick(record, ['due_date', 'dueDate', 'jatuh_tempo'])),
    status: normalizeStatus(pick(record, ['status', 'invoice_status', 'invoiceStatus', 'payment_status', 'paymentStatus'])),
    paidAt: normalizeBillingDate(pick(record, ['paid_at', 'paidAt', 'payment_date', 'paymentDate'])),
    paymentMethod: cleanText(pick(record, ['payment_method', 'paymentMethod', 'method'])),
    notes: cleanText(pick(record, ['notes', 'note', 'keterangan']))
  };
}

function normalizeBillingInvoice(record) {
  const accountId = cleanText(pick(record, ['acc_id', 'account_id', 'accountId', 'customer_id', 'customerId', 'id_customer']));
  const customerName = cleanText(pick(record, ['full_name', 'fullName', 'customer_name', 'customerName', 'name', 'nama'])) || accountId;
  const status = normalizeStatus(pick(record, ['status', 'invoice_status', 'invoiceStatus', 'payment_status', 'paymentStatus']) || 'unpaid');
  const amount = toNumber(pick(record, ['total', 'grand_total', 'grandTotal', 'amount', 'bill_amount', 'tagihan', 'price']));
  const serviceStatus = normalizeServiceStatus(record);
  const item = cleanText(pick(record, ['item', 'description', 'keterangan', 'package', 'package_name', 'profile']));
  const username = cleanText(pick(record, ['username', 'user', 'login', 'pppoe_user', 'pppoe_username', 'uid'])) || extractUsername(item);
  const radbooxInvoiceId = cleanText(pick(record, ['id', 'invoice_id', 'invoiceId', 'id_invoice']));

  return {
    radbooxInvoiceId,
    reminderId: radbooxInvoiceId,
    uuid: cleanText(pick(record, ['uuid'])),
    externalId: cleanText(pick(record, ['uuid', 'id', 'invoice_id', 'invoiceId', 'id_invoice', 'no_invoice'])),
    invoiceNo: cleanText(pick(record, ['no_invoice', 'invoice_number', 'invoiceNumber', 'invoiceNo'])),
    accountId,
    username,
    customerName,
    phone: cleanText(pick(record, ['wa', 'whatsapp', 'phone', 'mobile', 'no_whatsapp'])),
    address: cleanText(pick(record, ['address', 'alamat'])),
    item,
    subscribe: cleanText(pick(record, ['subscribe', 'subscription', 'profile', 'package', 'package_name'])),
    site: cleanText(pick(record, ['site', 'site_name', 'siteName', 'nas', 'router', 'router_nas', 'routerNas', 'server', 'location', 'lokasi'])),
    type: cleanText(pick(record, ['type', 'jenis'])),
    method: cleanText(pick(record, ['method', 'payment_method', 'paymentMethod', 'metode'])),
    amount,
    baseAmount: toNumber(pick(record, ['amount', 'subtotal', 'baseAmount'])),
    discount: toNumber(pick(record, ['discount', 'diskon'])),
    ppn: toNumber(pick(record, ['ppn', 'tax', 'taxAmount'])),
    status,
    customerStatus: serviceStatus,
    serviceStatus,
    isIsolated: isIsolatedStatus(serviceStatus),
    period: inferBillingInvoicePeriod(record),
    invoiceDate: normalizeBillingDate(pick(record, ['invoice_date', 'invoiceDate', 'date', 'tanggal'])),
    dueDate: normalizeBillingDate(pick(record, ['due_date', 'dueDate', 'jatuh_tempo'])),
    paidDate: normalizeBillingDate(pick(record, ['paid_date', 'paidDate', 'paid_at', 'paidAt', 'payment_date', 'paymentDate']))
  };
}

function statusFromValue(value) {
  if (value && typeof value === 'object') {
    return normalizeServiceStatus(value);
  }
  const text = cleanText(value).toLowerCase();
  if (!text) return '';
  if (['1', 'true', 'yes'].includes(text)) return 'suspend';
  if (['0', 'false', 'no'].includes(text)) return '';
  if (/isolir|isolated|suspend|blocked|blokir/.test(text)) return 'suspend';
  if (/terminate|terminated|expired|nonactive/.test(text)) return 'terminate';
  if (/active|aktif|enabled|online/.test(text)) return 'active';
  if (/offline|down/.test(text)) return 'offline';
  return text;
}

function normalizeServiceStatus(record = {}) {
  const direct = pick(record, [
    'customer_status',
    'customerStatus',
    'member_status',
    'memberStatus',
    'account_status',
    'accountStatus',
    'acc_status',
    'user_status',
    'userStatus',
    'service_status',
    'serviceStatus',
    'internet_status',
    'internetStatus',
    'pppoe_status',
    'pppoeStatus',
    'hotspot_status',
    'hotspotStatus',
    'status_user',
    'isolir',
    'is_isolir',
    'isIsolir',
    'suspend',
    'suspended'
  ]);
  const directStatus = statusFromValue(direct);
  if (directStatus) return directStatus;

  const subscribe = record && typeof record.subscribe === 'object' ? record.subscribe : {};
  const subscribeStatus = statusFromValue(pick(subscribe, ['status', 'service_status', 'internet_status', 'state', 'isolir', 'suspend']));
  if (subscribeStatus) return subscribeStatus;

  const detail = record && typeof record.detail === 'object' ? record.detail : {};
  const detailStatus = statusFromValue(pick(detail, ['status', 'service_status', 'internet_status', 'state', 'isolir', 'suspend']));
  return detailStatus || '';
}

function isIsolatedStatus(status) {
  return ['suspend', 'suspended', 'isolir', 'isolated', 'blocked', 'blokir'].includes(cleanText(status).toLowerCase());
}

function isTerminatedStatus(status) {
  return ['terminate', 'terminated', 'expired', 'nonactive'].includes(cleanText(status).toLowerCase());
}

function normalizeSiteKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function siteAliases(site = {}) {
  const aliases = new Set();
  const add = (value) => {
    const text = cleanText(value).toLowerCase();
    if (!text) return;
    aliases.add(text);
    aliases.add(text.replace(/[^a-z0-9]+/g, ''));
    text.split(/[^a-z0-9]+/).filter((part) => part.length >= 4).forEach((part) => aliases.add(part));
  };
  add(site.name);
  add(site.location);
  if (Array.isArray(site.aliases)) {
    site.aliases.forEach(add);
  }
  return [...aliases].filter((alias) => alias.length >= 3).sort((a, b) => b.length - a.length);
}

function billingSites(sites = []) {
  return (Array.isArray(sites) ? sites : [])
    .map((site) => ({
      id: cleanText(site.id) || normalizeSiteKey(site.name),
      name: cleanText(site.name),
      location: cleanText(site.location),
      aliases: siteAliases(site)
    }))
    .filter((site) => site.id && site.name);
}

function invoiceSiteText(invoice = {}) {
  return [
    invoice.site,
    invoice.siteName,
    invoice.nas,
    invoice.router,
    invoice.username,
    invoice.customerName,
    invoice.address,
    invoice.item,
    invoice.subscribe,
    invoice.type,
    invoice.method
  ].map((value) => cleanText(value).toLowerCase()).filter(Boolean).join(' ');
}

function resolveBillingSite(invoice = {}, sites = []) {
  if (!sites.length) {
    return null;
  }
  const text = invoiceSiteText(invoice);
  if (!text) {
    return null;
  }
  let winner = null;
  let winnerScore = 0;
  for (const site of sites) {
    for (const alias of site.aliases || []) {
      if (text.includes(alias) && alias.length > winnerScore) {
        winner = site;
        winnerScore = alias.length;
      }
    }
  }
  return winner;
}

function attachBillingSite(invoice = {}, sites = []) {
  const site = resolveBillingSite(invoice, sites);
  if (!site) {
    return {
      ...invoice,
      siteId: '',
      siteName: ''
    };
  }
  return {
    ...invoice,
    siteId: site.id,
    siteName: site.name
  };
}

function invoiceMatchesSite(invoice = {}, siteId = 'all') {
  if (!siteId || siteId === 'all') return true;
  return cleanText(invoice.siteId) === cleanText(siteId);
}

function normalizeBillingMember(record) {
  const id = cleanText(pick(record, ['id', 'id_member', 'member_id', 'memberId']));
  const fullName = cleanText(pick(record, ['full_name', 'fullName', 'fullname', 'customer_name', 'customerName', 'name', 'nama']));
  const userId = cleanText(pick(record, ['user-id', 'user_id', 'userId', 'uid', 'acc_id', 'account_id']));
  const internet = cleanText(pick(record, ['internet', 'pppoe', 'username', 'user', 'login', 'pppoe_user', 'pppoe_username', 'ppp_user', 'pppUsername']));
  const rawStatus = cleanText(pick(record, ['status', 'state']));
  const accountId = cleanText(pick(record, ['uid', 'acc_id', 'account_id', 'accountId', 'id', 'customer_id', 'customerId', 'id_customer', 'user-id', 'user_id']));
  const username = internet;
  const customerName = fullName || username || accountId;
  const serviceStatus = normalizeServiceStatus(record) || statusFromValue(pick(record, ['status']));
  return {
    id,
    uuid: cleanText(pick(record, ['uuid'])),
    pppoeId: cleanText(pick(record, ['id_pppoe', 'id_ppp', 'pppoe_id', 'pppoeId'])),
    fullName: fullName || customerName,
    userId: userId || accountId,
    internet,
    whatsapp: cleanText(pick(record, ['wa', 'whatsapp', 'phone', 'mobile', 'no_whatsapp'])),
    email: cleanText(pick(record, ['email'])),
    ktp: cleanText(pick(record, ['ktp', 'id_card', 'idCard', 'npwp'])),
    accountId,
    username,
    customerName,
    phone: cleanText(pick(record, ['wa', 'whatsapp', 'phone', 'mobile', 'no_whatsapp'])),
    address: cleanText(pick(record, ['address', 'alamat'])),
    item: cleanText(pick(record, ['item', 'description', 'keterangan', 'package', 'package_name', 'profile', 'internet'])),
    subscribe: cleanText(pick(record, ['subscribe', 'subscription', 'billing_period', 'billingPeriod', 'type_payment', 'typePayment'])),
    type: cleanText(pick(record, ['type', 'jenis', 'type_payment', 'typePayment'])),
    method: cleanText(pick(record, ['method', 'payment_method', 'paymentMethod', 'billing_period', 'billingPeriod'])),
    activeDate: normalizeBillingDate(pick(record, ['active_date', 'activeDate', 'created_at', 'createdAt'])),
    dueDate: normalizeBillingDate(pick(record, ['next_due', 'nextDue', 'due_date', 'dueDate', 'jatuh_tempo'])),
    nextDue: cleanText(pick(record, ['next_due', 'nextDue', 'due_date', 'dueDate', 'jatuh_tempo'])),
    paymentType: cleanText(pick(record, ['type_payment', 'payment_type', 'paymentType'])),
    billingPeriod: cleanText(pick(record, ['billing_period', 'billingPeriod', 'payment_method', 'paymentMethod'])),
    site: cleanText(pick(record, ['site', 'site_name', 'siteName', 'nas', 'router', 'router_nas', 'routerNas', 'server', 'location', 'lokasi'])),
    status: rawStatus || serviceStatus,
    price: toNumber(pick(record, ['price', 'amount', 'tariff', 'total'])),
    ppn: cleanText(pick(record, ['ppn', 'tax'])),
    discount: cleanText(pick(record, ['discount', 'diskon'])),
    serviceStatus,
    customerStatus: serviceStatus,
    isIsolated: isIsolatedStatus(serviceStatus),
    raw: record
  };
}

function objectFromPayload(payload) {
  let record = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (record.message && typeof record.message === 'object' && !Array.isArray(record.message)) {
    record = record.message;
  }
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    record = record.data;
  }
  return record;
}

function findNumberDeep(value, names) {
  const queue = [value];
  const seen = new Set();
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== 'object' || seen.has(item)) {
      continue;
    }
    seen.add(item);
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(item, name) && item[name] !== '') {
        return toNumber(item[name]);
      }
    }
    Object.values(item).forEach((child) => {
      if (child && typeof child === 'object') {
        queue.push(child);
      }
    });
  }
  return 0;
}

function normalizeInvoiceTopInfo(payload) {
  const record = objectFromPayload(payload);
  return {
    total: toNumber(pick(record, ['total', 'totalCount', 'totalRows'])),
    totalAmount: toNumber(pick(record, ['totalAmount', 'total_amount', 'amountTotal'])),
    paid: toNumber(pick(record, ['paid', 'paidCount'])),
    paidAmount: toNumber(pick(record, ['paidAmount', 'paid_amount'])),
    unpaid: toNumber(pick(record, ['unpaid', 'unpaidCount'])),
    unpaidAmount: toNumber(pick(record, ['unpaidAmount', 'unpaid_amount'])),
    overdue: toNumber(pick(record, ['overdue', 'overdueCount'])),
    overdueAmount: toNumber(pick(record, ['overdueAmount', 'overdue_amount'])),
    ppnAmount: toNumber(pick(record, ['ppnAmount', 'ppn_amount', 'taxAmount']))
  };
}

function normalizeMonthlyEarning(payload, period) {
  const rows = asArray(payload, ['earnings', 'reports', 'monthly', 'data', 'rows']);
  const target = normalizePeriod(period);
  let record = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

  if (record.message && typeof record.message === 'object') {
    if (record.message.jumlah && typeof record.message.jumlah === 'object') {
      record = record.message.jumlah;
    } else {
      record = record.message;
    }
  }
  if (record.jumlah && typeof record.jumlah === 'object') {
    record = record.jumlah;
  }

  if (rows.length) {
    const row = rows.find((item) => inferPeriod(item) === target) || rows[0] || {};
    if (!record || !Object.keys(record).some((key) => /jumlah|total|income|earning|pemasukan/i.test(key))) {
      record = row;
    }
  }

  let amount = pick(record, [
    'jumlahTotalPemasukan',
    'totalPemasukan',
    'jumlah_pemasukan',
    'total_pemasukan',
    'total_income',
    'totalIncome',
    'monthly_earning',
    'monthlyEarning',
    'earning',
    'earnings',
    'revenue',
    'income',
    'paid_revenue',
    'paidRevenue',
    'total_paid',
    'totalPaid',
    'paid_total',
    'paidTotal',
    'total',
    'amount',
    'gross',
    'pemasukan',
    'pendapatan'
  ]);

  if (!amount) {
    const cashIncome = toNumber(pick(record, ['jumlahPemasukanTunai', 'pemasukanTunai', 'cashIncome']));
    const transferIncome = toNumber(pick(record, ['jumlahPemasukanTransfer', 'pemasukanTransfer', 'transferIncome']));
    if (cashIncome || transferIncome) {
      amount = cashIncome + transferIncome;
    }
  }

  return {
    source: 'radboox',
    externalId: cleanText(pick(record, ['id', 'report_id', 'reportId'])),
    period: target,
    amount: toNumber(amount),
    transactionCount: toNumber(pick(record, ['count', 'transaction_count', 'transactionCount', 'paid_count', 'paidCount', 'total_invoice'])),
    note: cleanText(pick(record, ['note', 'notes', 'keterangan'])),
    raw: record,
    fetchedAt: new Date().toISOString()
  };
}

function methodLabel(value) {
  const normalized = cleanText(value).toLowerCase();
  if (['1', 'cash', 'tunai'].includes(normalized)) return 'Tunai';
  if (['2', 'transfer', 'bank'].includes(normalized)) return 'Transfer';
  if (['3', 'qris', 'qr'].includes(normalized)) return 'QRIS';
  return cleanText(value) || '-';
}

function adminDisplayName(row) {
  return cleanText(pick(row, [
    'admin_name',
    'adminName',
    'admin_full_name',
    'adminFullName',
    'kasir_name',
    'kasirName',
    'cashier_name',
    'cashierName',
    'collector_name',
    'collectorName',
    'user_name',
    'userName',
    'name'
  ]));
}

function dailyInvoiceNo(value) {
  const text = cleanText(value);
  const match = text.match(/#\s*(\d+)/);
  return match ? match[1] : '';
}

function paymentSubmittedValue(row = {}) {
  return pick(row, [
    'date_submit',
    'dateSubmit',
    'submitted_at',
    'submittedAt',
    'paid_at',
    'paidAt',
    'payment_at',
    'paymentAt',
    'payment_date',
    'paymentDate',
    'created_at',
    'createdAt',
    'tanggal',
    'date'
  ]);
}

function paymentTimeText(value) {
  const normalized = normalizeRadbooxDateTime(value);
  if (hasExplicitTimezone(normalized)) {
    const date = new Date(cleanText(normalized));
    if (!Number.isNaN(date.getTime())) return localTimeTextFromDate(date);
  }
  const rawTime = cleanText(value).match(/\b(\d{1,2}):(\d{2})/);
  return rawTime ? `${String(Number(rawTime[1])).padStart(2, '0')}:${rawTime[2]}` : '';
}

function normalizeBillingTransaction(row = {}) {
  const description = cleanText(pick(row, ['description', 'info', 'keterangan', 'note', 'notes']));
  const paymentRaw = cleanText(paymentSubmittedValue(row));
  return {
    externalId: cleanText(pick(row, ['uuid', 'id', 'transaction_id', 'transactionId'])),
    invoiceNo: cleanText(pick(row, ['no_invoice', 'noInvoice', 'invoice_no', 'invoiceNo'])) || dailyInvoiceNo(description),
    description,
    income: toNumber(pick(row, ['price', 'Price_num', 'pemasukan', 'income', 'amount_in', 'amountIn', 'credit'])),
    method: methodLabel(pick(row, ['payment_method', 'paymentMethod', 'metode', 'method'])),
    admin: cleanText(pick(row, ['admin', 'admin_name', 'adminName', 'kasir', 'cashier'])),
    paymentAt: normalizeRadbooxDateTime(paymentRaw),
    paymentTime: paymentTimeText(paymentRaw),
    paymentRaw,
    raw: row
  };
}

function billingTransactionDataPath(query = {}) {
  const params = new URLSearchParams();
  params.set('page', String(query.page || 1));
  params.set('limit', String(query.limit || 100));
  params.set('search', query.search || '');
  return `/api-v1/billing/transaction/data?${params.toString()}`;
}

function cashierTransactionMethod(value = '') {
  const text = cleanText(value).toLowerCase();
  if (!text || text === 'all') return '';
  if (['1', 'cash', 'tunai'].includes(text)) return 'cash';
  if (['2', 'transfer', 'bank', 'bank transfer'].includes(text)) return 'transfer';
  return cleanText(value);
}

function cashierTransactionMethodLabel(value = '') {
  const text = cleanText(value).toLowerCase();
  if (['1', 'cash', 'tunai'].includes(text)) return 'Tunai';
  if (['2', 'transfer', 'bank', 'bank transfer'].includes(text)) return 'Transfer';
  return methodLabel(value);
}

function cashierTransactionDataPath(query = {}) {
  const params = new URLSearchParams();
  params.set('page', String(query.page || 1));
  params.set('limit', String(query.limit || 10));
  params.set('start', normalizeDate(query.from || query.start));
  params.set('end', normalizeDate(query.to || query.end || query.from || query.start));
  params.set('type', cleanText(query.type || ''));
  params.set('payment_method', cashierTransactionMethod(query.method));
  params.set('search', cleanText(query.search || ''));
  return `/api-v1/billing/transaction/data?${params.toString()}`;
}

function cashierTopInfoPath(query = {}) {
  return '/api-v1/billing/transaction/topinfo';
}

function normalizeCashierTransaction(row = {}) {
  const paymentRaw = cleanText(paymentSubmittedValue(row));
  const item = cleanText(pick(row, ['item', 'name', 'title']));
  const description = cleanText(pick(row, ['description', 'info', 'keterangan', 'note', 'notes']));
  const amount = toNumber(pick(row, ['price', 'Price', 'Price_num', 'amount', 'pemasukan', 'income', 'credit']));
  const methodRaw = pick(row, ['payment_method', 'paymentMethod', 'Method', 'metode', 'method']);
  return {
    id: cleanText(pick(row, ['id', 'uuid', 'transaction_id', 'transactionId'])),
    externalId: cleanText(pick(row, ['uuid', 'id', 'transaction_id', 'transactionId'])),
    submittedAt: normalizeRadbooxDateTime(paymentRaw),
    submittedTime: paymentTimeText(paymentRaw),
    submittedRaw: paymentRaw,
    item,
    description,
    type: cleanText(pick(row, ['type', 'transaction_type', 'transactionType', 'jenis'])),
    admin: cleanText(pick(row, ['admin', 'admin_name', 'adminName', 'kasir', 'cashier'])),
    amount,
    amountText: cleanText(pick(row, ['price', 'Price', 'amountText'])),
    method: cashierTransactionMethodLabel(methodRaw),
    methodRaw: cleanText(methodRaw),
    invoiceNo: cleanText(pick(row, ['no_invoice', 'noInvoice', 'invoice_no', 'invoiceNo'])) || dailyInvoiceNo(description),
    raw: row
  };
}

function transactionMatchesDate(transaction = {}, date = '') {
  const normalized = radbooxSourceDate(transaction.paymentRaw) || normalizeBillingDate(transaction.paymentAt);
  return !date || normalized === date;
}

function dailyTransactionDirectory(transactions = [], invoiceNos = new Set(), date = '') {
  const directory = new Map();
  transactions.forEach((transaction) => {
    if (!transaction.invoiceNo || (invoiceNos.size && !invoiceNos.has(transaction.invoiceNo))) {
      return;
    }
    if (!transaction.paymentAt || !transactionMatchesDate(transaction, date)) {
      return;
    }
    if (!directory.has(transaction.invoiceNo)) {
      directory.set(transaction.invoiceNo, transaction);
    }
  });
  return directory;
}

async function fetchDailyPaymentTransactions(fetcher, report = {}) {
  const invoiceNos = new Set((report.transactions || [])
    .map((item) => item.invoiceNo || dailyInvoiceNo(item.info))
    .filter(Boolean));
  if (!invoiceNos.size) {
    return [];
  }

  const found = new Map();
  try {
    const bulk = await fetchPagedRows(
      fetcher,
      ({ page, limit }) => billingTransactionDataPath({ page, limit, search: '' }),
      ['data', 'rows', 'items', 'records'],
      { limit: 100, maxPages: 5, maxRows: 500 }
    );
    dailyTransactionDirectory(
      bulk.rows.map(normalizeBillingTransaction),
      invoiceNos,
      report.date
    ).forEach((transaction, invoiceNo) => found.set(invoiceNo, transaction));
  } catch {
    // Fallback below searches per invoice number.
  }

  const missing = [...invoiceNos].filter((invoiceNo) => !found.has(invoiceNo)).slice(0, 80);
  const chunkSize = 6;
  for (let index = 0; index < missing.length; index += chunkSize) {
    const chunk = missing.slice(index, index + chunkSize);
    const results = await Promise.allSettled(chunk.map(async (invoiceNo) => {
      const payload = await fetcher(billingTransactionDataPath({ page: 1, limit: 5, search: invoiceNo }));
      const transactions = asArray(objectFromPayload(payload), ['data', 'rows', 'items', 'records'])
        .map(normalizeBillingTransaction);
      const match = dailyTransactionDirectory(transactions, new Set([invoiceNo]), report.date).get(invoiceNo);
      return match ? { invoiceNo, transaction: match } : null;
    }));
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        found.set(result.value.invoiceNo, result.value.transaction);
      }
    });
  }

  return [...found.values()];
}

async function enrichDailyReportPaymentTimes(report, fetcher) {
  if (!report || !Array.isArray(report.transactions) || !report.transactions.length || !fetcher) {
    return report;
  }
  const transactions = await fetchDailyPaymentTransactions(fetcher, report).catch(() => []);
  const directory = new Map(transactions.map((transaction) => [transaction.invoiceNo, transaction]));
  report.paymentTimeLookupCount = transactions.length;
  report.transactions = report.transactions.map((item) => {
    const invoiceNo = item.invoiceNo || dailyInvoiceNo(item.info);
    const transaction = directory.get(invoiceNo);
    if (!transaction) {
      return {
        ...item,
        invoiceNo
      };
    }
    return {
      ...item,
      invoiceNo,
      paymentAt: item.paymentAt || transaction.paymentAt || '',
      paymentTime: item.paymentTime || transaction.paymentTime || '',
      paymentRaw: item.paymentRaw || transaction.paymentRaw || '',
      transactionExternalId: transaction.externalId || item.transactionExternalId || '',
      rawTransaction: transaction.raw
    };
  });
  return report;
}

function invoiceNoKeys(value) {
  const text = cleanText(value);
  if (!text) return [];
  const stripped = text.replace(/^0+/, '') || '0';
  return [...new Set([text, stripped])];
}

function dailySiteSource(item = {}, source = {}) {
  return {
    ...source,
    site: item.site || source.site || source.siteName || '',
    siteName: item.siteName || source.siteName || '',
    nas: item.nas || source.nas || '',
    username: item.username || source.username || extractUsername(item.info || source.item || source.subscribe || ''),
    customerName: item.customerName || source.customerName || item.info || '',
    address: source.address || '',
    item: [item.info, source.item, source.subscribe].map(cleanText).filter(Boolean).join(' '),
    subscribe: source.subscribe || '',
    type: source.type || '',
    method: item.method || source.method || ''
  };
}

function attachDailyTransactionSite(item = {}, sites = [], source = {}) {
  const detected = attachBillingSite(dailySiteSource(item, source), sites);
  const siteId = item.siteId || source.siteId || detected.siteId || '';
  const siteName = item.siteName || source.siteName || detected.siteName || '';
  return {
    ...item,
    site: item.site || source.site || siteName || '',
    siteId,
    siteName
  };
}

function addInvoiceSiteDirectory(directory, invoice = {}) {
  if (!invoice || (!invoice.siteId && !invoice.siteName && !invoice.site)) {
    return;
  }
  invoiceNoKeys(invoice.invoiceNo || invoice.externalId).forEach((key) => {
    if (!directory.has(key)) {
      directory.set(key, invoice);
    }
  });
}

async function enrichDailyReportSites(report, fetcher, runtime = {}) {
  const sites = billingSites(runtime.sites);
  if (!report || !Array.isArray(report.transactions) || !report.transactions.length) {
    return report;
  }
  report.sites = sites.map((site) => ({
    id: site.id,
    name: site.name,
    location: site.location
  }));
  if (!sites.length) {
    return report;
  }

  report.transactions = report.transactions.map((item) => attachDailyTransactionSite(item, sites));
  if (!fetcher) {
    return report;
  }

  const missingInvoiceNos = [...new Set(report.transactions
    .filter((item) => !item.siteId)
    .flatMap((item) => invoiceNoKeys(item.invoiceNo || dailyInvoiceNo(item.info))))].slice(0, 100);
  if (!missingInvoiceNos.length) {
    report.siteLookupCount = 0;
    return report;
  }

  const directory = new Map();
  const chunkSize = 6;
  for (let index = 0; index < missingInvoiceNos.length; index += chunkSize) {
    const chunk = missingInvoiceNos.slice(index, index + chunkSize);
    const results = await Promise.allSettled(chunk.map(async (invoiceNo) => {
      const payload = await fetcher(invoiceDataPath({
        page: 1,
        limit: 5,
        status: 'all',
        search: invoiceNo
      }));
      return asArray(objectFromPayload(payload), ['data', 'rows', 'items', 'records'])
        .map(normalizeBillingInvoice)
        .map((invoice) => attachBillingSite(invoice, sites));
    }));
    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      result.value.forEach((invoice) => {
        invoiceNoKeys(invoice.invoiceNo || invoice.externalId).forEach((key) => {
          if (!directory.has(key)) {
            directory.set(key, invoice);
          }
        });
      });
    });
  }

  report.siteLookupCount = directory.size;
  report.transactions = report.transactions.map((item) => {
    if (item.siteId) return item;
    const source = invoiceNoKeys(item.invoiceNo || dailyInvoiceNo(item.info))
      .map((key) => directory.get(key))
      .find(Boolean);
    return source ? attachDailyTransactionSite(item, sites, source) : item;
  });
  return report;
}

function normalizeDailyReport(payload, date) {
  const target = normalizeDate(date);
  let record = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (record.message && typeof record.message === 'object') {
    record = record.message;
  }

  const summary = record.jumlah && typeof record.jumlah === 'object' ? record.jumlah : record;
  const rows = asArray(record, ['data', 'rows', 'items', 'transactions', 'records']);
  const transactions = rows.map((row) => {
    const adminName = adminDisplayName(row);
    const adminId = cleanText(pick(row, ['admin_id', 'adminId', 'kasir_id', 'kasirId', 'cashier_id', 'cashierId', 'admin', 'kasir']));
    const info = cleanText(pick(row, ['info', 'description', 'keterangan', 'note', 'notes']));
    const paymentRaw = cleanText(paymentSubmittedValue(row));
    return {
      externalId: cleanText(pick(row, ['uuid', 'id', 'transaction_id', 'transactionId'])),
      invoiceNo: cleanText(pick(row, ['no_invoice', 'noInvoice', 'invoice_no', 'invoiceNo'])) || dailyInvoiceNo(info),
      info,
      income: toNumber(pick(row, ['pemasukan', 'income', 'amount_in', 'amountIn', 'credit'])),
      expense: toNumber(pick(row, ['pengeluaran', 'expense', 'amount_out', 'amountOut', 'debit'])),
      method: methodLabel(pick(row, ['metode', 'method', 'payment_method', 'paymentMethod'])),
      admin: adminName || adminId,
      adminId,
      adminName,
      site: cleanText(pick(row, ['site', 'site_name', 'siteName', 'nas', 'router', 'router_nas', 'routerNas', 'server', 'location', 'lokasi'])),
      siteId: '',
      siteName: '',
      paymentAt: normalizeRadbooxDateTime(paymentRaw),
      paymentTime: paymentTimeText(paymentRaw),
      paymentRaw,
      raw: row
    };
  });

  const rowIncome = transactions.reduce((sum, item) => sum + toNumber(item.income), 0);
  const rowExpense = transactions.reduce((sum, item) => sum + toNumber(item.expense), 0);
  const cashIncome = toNumber(pick(summary, ['jumlahPemasukanTunai', 'pemasukanTunai', 'cashIncome']));
  const transferIncome = toNumber(pick(summary, ['jumlahPemasukanTransfer', 'pemasukanTransfer', 'transferIncome']));
  const cashExpense = toNumber(pick(summary, ['jumlahPengeluaranTunai', 'pengeluaranTunai', 'cashExpense']));
  const transferExpense = toNumber(pick(summary, ['jumlahPengeluaranTransfer', 'pengeluaranTransfer', 'transferExpense']));
  const totalIncome = toNumber(pick(summary, ['jumlahTotalPemasukan', 'totalPemasukan', 'total_income', 'totalIncome', 'income', 'pemasukan'])) || rowIncome;
  const totalExpense = toNumber(pick(summary, ['jumlahTotalPengeluaran', 'totalPengeluaran', 'total_expense', 'totalExpense', 'expense', 'pengeluaran'])) || rowExpense;
  const netIncome = toNumber(pick(summary, ['jumlahTotalPendapatan', 'totalPendapatan', 'netIncome', 'pendapatan'])) || Math.max(0, totalIncome - totalExpense);

  return {
    source: 'radboox',
    date: target,
    cashIncome,
    transferIncome,
    totalIncome,
    cashExpense,
    transferExpense,
    totalExpense,
    netIncome,
    transactionCount: toNumber(pick(summary, ['count', 'transaction_count', 'transactionCount'])) || transactions.length,
    transactions,
    adminDirectory: {},
    rawSummary: summary,
    fetchedAt: new Date().toISOString()
  };
}

function periodDateList(period) {
  const normalized = explicitPeriod(period);
  if (!normalized) return [];
  const [year, month] = normalized.split('-').map((item) => Number(item));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const currentDate = localDateIso();
  const currentPeriod = currentDate.slice(0, 7);
  if (normalized > currentPeriod) return [];
  const endDay = normalized === currentPeriod
    ? Math.min(lastDay, Number(currentDate.slice(8, 10)))
    : lastDay;
  return Array.from({ length: endDay }, (_, index) => `${normalized}-${String(index + 1).padStart(2, '0')}`);
}

function dailyReportDataPath(date) {
  const safeDate = normalizeDate(date);
  return `/api-v1/billing/report/daily?date=${encodeURIComponent(safeDate)}&type=&admin=&s=`;
}

function transactionCustomerName(transaction = {}) {
  const raw = transaction.raw || {};
  const direct = cleanText(pick(raw, ['full_name', 'fullName', 'fullname', 'customer_name', 'customerName', 'name', 'nama']));
  if (direct) return direct;
  const invoiceNo = cleanText(transaction.invoiceNo);
  let text = cleanText(transaction.info);
  if (invoiceNo) {
    text = text.replace(new RegExp(`\\b#?${invoiceNo}\\b`, 'i'), ' ');
  }
  text = cleanText(text)
    .replace(/\bpayment\b/ig, ' ')
    .replace(/\s*[-:]\s*/g, ' ');
  return cleanText(text) || transaction.info || '-';
}

function paidTransactionInvoice(transaction = {}, period = '') {
  const paymentDate = radbooxSourceDate(transaction.paymentRaw) || normalizeBillingDate(transaction.paymentAt);
  const invoiceNo = transaction.invoiceNo || dailyInvoiceNo(transaction.info);
  return {
    radbooxInvoiceId: transaction.externalId || invoiceNo,
    reminderId: '',
    uuid: transaction.externalId || '',
    externalId: transaction.externalId || invoiceNo,
    invoiceNo,
    accountId: cleanText(pick(transaction.raw || {}, ['acc_id', 'account_id', 'accountId', 'uid', 'user_id', 'userId'])),
    username: extractUsername(transaction.info),
    customerName: transactionCustomerName(transaction),
    phone: cleanText(pick(transaction.raw || {}, ['wa', 'whatsapp', 'phone', 'mobile', 'no_whatsapp'])),
    address: cleanText(pick(transaction.raw || {}, ['address', 'alamat'])),
    item: transaction.info || `Pembayaran invoice ${invoiceNo || ''}`.trim(),
    subscribe: '',
    site: transaction.site || transaction.siteName || '',
    siteId: transaction.siteId || '',
    siteName: transaction.siteName || '',
    type: 'Billing',
    method: transaction.method || '',
    amount: toNumber(transaction.income),
    baseAmount: toNumber(transaction.income),
    discount: 0,
    ppn: 0,
    status: 'paid',
    customerStatus: '',
    serviceStatus: '',
    isIsolated: false,
    invoiceDate: paymentDate || `${period}-01`,
    dueDate: '',
    paidDate: paymentDate || '',
    period,
    paidFromReport: true
  };
}

async function enrichPaidInvoicesWithInvoiceData(fetcher, invoices = [], query = {}) {
  const invoiceNos = [...new Set(invoices.flatMap((invoice) => invoiceNoKeys(invoice.invoiceNo)).filter(Boolean))].slice(0, 200);
  if (!invoiceNos.length) return invoices;

  const directory = new Map();
  const chunkSize = 6;
  for (let index = 0; index < invoiceNos.length; index += chunkSize) {
    const chunk = invoiceNos.slice(index, index + chunkSize);
    const results = await Promise.allSettled(chunk.map(async (invoiceNo) => {
      const payload = await fetcher(invoiceDataPath({
        page: 1,
        limit: 5,
        status: 'all',
        search: invoiceNo
      }));
      return asArray(objectFromPayload(payload), ['data', 'rows', 'items', 'records'])
        .map(normalizeBillingInvoice)
        .map((invoice) => applyBillingRuntime(invoice, query.today))
        .map((invoice) => attachBillingSite(invoice, query.sites));
    }));
    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      result.value.forEach((invoice) => {
        invoiceNoKeys(invoice.invoiceNo || invoice.externalId).forEach((key) => {
          if (!directory.has(key)) {
            directory.set(key, invoice);
          }
        });
      });
    });
  }

  return invoices.map((invoice) => {
    const source = invoiceNoKeys(invoice.invoiceNo)
      .map((key) => directory.get(key))
      .find(Boolean);
    if (!source) return invoice;
    return {
      ...invoice,
      accountId: source.accountId || invoice.accountId,
      username: source.username || invoice.username,
      customerName: source.customerName || invoice.customerName,
      phone: source.phone || invoice.phone,
      address: source.address || invoice.address,
      item: source.item || invoice.item,
      subscribe: source.subscribe || invoice.subscribe,
      site: source.site || invoice.site,
      siteId: source.siteId || invoice.siteId,
      siteName: source.siteName || invoice.siteName,
      type: source.type || invoice.type,
      invoiceDate: source.invoiceDate || invoice.invoiceDate,
      dueDate: source.dueDate || invoice.dueDate,
      status: 'paid',
      paidFromReport: true
    };
  });
}

async function fetchMonthlyPaidInvoices(fetcher, query, runtime = {}, source = {}) {
  const key = cacheKey('monthly-paid-invoices', {
    baseUrl: source.baseUrl || '',
    username: source.username || '',
    mode: source.mode || '',
    period: query.period,
    sites: query.sites.map((site) => `${site.id}:${site.name}`).join('|')
  });
  return cachedFetch(key, runtime, async () => {
    const dates = periodDateList(query.period);
    const invoices = [];
    const chunkSize = 4;
    for (let index = 0; index < dates.length; index += chunkSize) {
      const chunk = dates.slice(index, index + chunkSize);
      const results = await Promise.allSettled(chunk.map(async (date) => {
        const payload = await fetcher(dailyReportDataPath(date));
        return normalizeDailyReport(payload, date);
      }));
      results.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        (result.value.transactions || [])
          .filter((transaction) => toNumber(transaction.income) > 0)
          .map((transaction) => attachDailyTransactionSite(transaction, query.sites))
          .map((transaction) => paidTransactionInvoice(transaction, query.period))
          .forEach((invoice) => invoices.push(invoice));
      });
    }
    return invoices;
  });
}

function stripHtml(value) {
  return cleanText(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"'));
}

function parseHtmlTables(html) {
  const tables = [];
  const tableMatches = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const tableHtml of tableMatches) {
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const rows = rowMatches.map((rowHtml) => {
      const cellMatches = rowHtml.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || [];
      return cellMatches.map(stripHtml);
    }).filter((row) => row.some(Boolean));

    if (rows.length < 2) {
      continue;
    }

    const headers = rows[0].map((header) => header
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (_, char) => char.toUpperCase())
      .replace(/^[A-Z]/, (char) => char.toLowerCase()));
    const records = rows.slice(1).map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] || '';
      });
      return record;
    });
    tables.push(records);
  }

  return tables;
}

function normalizeHtmlMonthlyEarning(html, period) {
  const tables = parseHtmlTables(html);
  const rows = tables.flat();
  const target = normalizePeriod(period);
  if (rows.length) {
    const row = rows.find((item) => inferPeriod(item) === target) || rows[0];
    const earning = normalizeMonthlyEarning(row, target);
    if (earning.amount > 0) {
      return earning;
    }
  }

  const text = stripHtml(html);
  const labeled = text.match(/(?:monthly earning|earning bulan|pendapatan bulan|pemasukan bulan|total paid|total lunas|pendapatan|pemasukan)[^\d]*(?:rp)?\s*([\d.,]+)/i);
  const fallback = labeled || text.match(/(?:rp)\s*([\d.,]+)/i);
  return {
    source: 'radboox',
    externalId: '',
    period: target,
    amount: fallback ? toNumber(fallback[1]) : 0,
    transactionCount: 0,
    note: 'Parsed from Radboox web page',
    raw: { textSample: text.slice(0, 500) },
    fetchedAt: new Date().toISOString()
  };
}

function mergeConfig(settings = {}, runtime = {}) {
  const stored = settings.radboox || {};
  return {
    mode: runtime.mode || process.env.RADBOOX_MODE || stored.mode || 'api',
    baseUrl: runtime.baseUrl || process.env.RADBOOX_BASE_URL || stored.baseUrl || '',
    token: runtime.token || process.env.RADBOOX_TOKEN || process.env.RADBOOX_API_KEY || stored.token || '',
    username: runtime.username || process.env.RADBOOX_USERNAME || stored.username || '',
    password: runtime.password || process.env.RADBOOX_PASSWORD || stored.password || '',
    apiBaseUrl: runtime.apiBaseUrl || process.env.RADBOOX_API_BASE_URL || stored.apiBaseUrl || '',
    earningsPath: runtime.earningsPath || process.env.RADBOOX_EARNINGS_PATH || stored.earningsPath || '/api/reports/monthly-earning',
    dailyReportPath: runtime.dailyReportPath || process.env.RADBOOX_DAILY_REPORT_PATH || stored.dailyReportPath || '/api-v1/billing/report/daily?date={date}',
    customersPath: runtime.customersPath || process.env.RADBOOX_CUSTOMERS_PATH || stored.customersPath || '/api/customers',
    invoicesPath: runtime.invoicesPath || process.env.RADBOOX_INVOICES_PATH || stored.invoicesPath || '/api/invoices',
    loginPath: runtime.loginPath || process.env.RADBOOX_LOGIN_PATH || stored.loginPath || '/login',
    webEarningsPath: runtime.webEarningsPath || process.env.RADBOOX_WEB_EARNINGS_PATH || stored.webEarningsPath || '/reports/monthly-earning',
    webDailyReportPath: runtime.webDailyReportPath || process.env.RADBOOX_WEB_DAILY_REPORT_PATH || stored.webDailyReportPath || '/api-v1/billing/report/daily?date={date}&type=&admin=&s=',
    webCustomersPath: runtime.webCustomersPath || process.env.RADBOOX_WEB_CUSTOMERS_PATH || stored.webCustomersPath || '/customers',
    webInvoicesPath: runtime.webInvoicesPath || process.env.RADBOOX_WEB_INVOICES_PATH || stored.webInvoicesPath || '/invoices',
    adminAliases: runtime.adminAliases || process.env.RADBOOX_ADMIN_ALIASES || stored.adminAliases || DEFAULT_ADMIN_ALIASES,
    loginUsernameField: runtime.loginUsernameField || process.env.RADBOOX_LOGIN_USER_FIELD || stored.loginUsernameField || 'username',
    loginPasswordField: runtime.loginPasswordField || process.env.RADBOOX_LOGIN_PASS_FIELD || stored.loginPasswordField || 'password'
  };
}

function resolveUrl(baseUrl, requestPath) {
  return new URL(requestPath || '/', baseUrl).toString();
}

function cookieHeader(headers) {
  const setCookie = headers.getSetCookie ? headers.getSetCookie() : [];
  const fallback = headers.get('set-cookie');
  const cookieRows = setCookie.length ? setCookie : (fallback ? String(fallback).split(/,(?=[^;]+=)/) : []);
  const cookiePairs = cookieRows
    .map((cookie) => cookie.split(';')[0])
    .filter(Boolean);
  const normalized = new Map();
  for (const pair of cookiePairs) {
    normalized.set(pair.split('=')[0], pair);
  }
  return [...normalized.values()].join('; ');
}

function withTimeout(options = {}) {
  if (
    options.signal ||
    !Number.isFinite(DEFAULT_FETCH_TIMEOUT_MS) ||
    DEFAULT_FETCH_TIMEOUT_MS <= 0 ||
    typeof AbortSignal === 'undefined' ||
    typeof AbortSignal.timeout !== 'function'
  ) {
    return options;
  }
  return {
    ...options,
    signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS)
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, withTimeout(options));
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!response.ok) {
    let apiMessage = '';
    if (contentType.includes('application/json') || text.trim().startsWith('{')) {
      try {
        const payload = JSON.parse(text || '{}');
        const message = payload && typeof payload === 'object' ? payload.message : '';
        if (typeof message === 'string') {
          apiMessage = cleanText(message);
        } else if (message && typeof message === 'object') {
          apiMessage = cleanText(message.message || message.text || Object.values(message).flat().join(' '));
        }
      } catch {
        apiMessage = '';
      }
    }
    const authHint = response.status === 401 ? ' (sesi/token Radboox ditolak, cek kredensial atau login ulang)' : '';
    const messageHint = apiMessage ? `: ${apiMessage}` : '';
    const error = new Error(`Radboox HTTP ${response.status}${authHint}${messageHint} dari ${url}`);
    error.status = response.status;
    error.url = url;
    error.bodySample = text.slice(0, 240);
    throw error;
  }
  if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    return JSON.parse(text || '[]');
  }
  return text;
}

function authHeaders(config) {
  const headers = {
    Accept: 'application/json'
  };

  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
    headers['X-API-Key'] = config.token;
  }

  return headers;
}

async function syncViaApi(config) {
  if (!config.baseUrl) {
    throw new Error('RADBOOX_BASE_URL belum diisi');
  }
  if (!config.token) {
    throw new Error('RADBOOX_TOKEN/RADBOOX_API_KEY belum diisi untuk mode API');
  }

  const [customersPayload, invoicesPayload] = await Promise.all([
    fetchJson(resolveUrl(apiBaseUrl(config), config.customersPath), { headers: authHeaders(config) }),
    fetchJson(resolveUrl(apiBaseUrl(config), config.invoicesPath), { headers: authHeaders(config) })
  ]);

  return {
    customers: asArray(customersPayload, ['customers', 'users']).map(normalizeCustomer).filter((customer) => customer.username || customer.name),
    invoices: asArray(invoicesPayload, ['invoices', 'billing']).map(normalizeInvoice).filter((invoice) => invoice.username || invoice.customerExternalId || invoice.customerName)
  };
}

async function syncMonthlyEarningViaApi(config, period) {
  if (!config.baseUrl) {
    throw new Error('RADBOOX_BASE_URL belum diisi');
  }
  if (!config.token) {
    throw new Error('RADBOOX_TOKEN/RADBOOX_API_KEY belum diisi untuk mode API');
  }

  const payload = await fetchJson(urlWithPeriod(apiBaseUrl(config), config.earningsPath, period), {
    headers: authHeaders(config)
  });
  return normalizeMonthlyEarning(payload, period);
}

async function webLogin(config) {
  const base = apiBaseUrl(config);
  if (!base) {
    throw new Error('RADBOOX_API_BASE_URL/RADBOOX_BASE_URL belum diisi');
  }
  if (!config.username || !config.password) {
    throw new Error('RADBOOX_USERNAME dan RADBOOX_PASSWORD belum diisi untuk mode web');
  }

  const loginPayload = {
    [config.loginUsernameField]: config.username,
    [config.loginPasswordField]: config.password
  };

  const loginResponse = await fetch(resolveUrl(base, config.loginPath), withTimeout({
    method: 'POST',
    headers: {
      Accept: 'application/json,text/html',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(loginPayload)
  }));
  const cookies = cookieHeader(loginResponse.headers);
  const contentType = loginResponse.headers.get('content-type') || '';
  const loginText = await loginResponse.text();
  if (!loginResponse.ok) {
    throw new Error(`Login Radboox gagal HTTP ${loginResponse.status}`);
  }

  let token = '';
  if (contentType.includes('application/json') || loginText.trim().startsWith('{')) {
    const payload = JSON.parse(loginText || '{}');
    if (payload.status === 'error') {
      throw new Error(payload.message || 'Login Radboox ditolak');
    }
    token = tokenFromPayload(payload);
  }

  if (!token && !cookies) {
    throw new Error('Login Radboox tidak mengembalikan token atau cookie sesi');
  }

  return { cookies, token, loginToken: token };
}

function sessionCacheKey(config) {
  return cacheKey('session', {
    baseUrl: apiBaseUrl(config),
    loginPath: config.loginPath,
    username: config.username,
    usernameField: config.loginUsernameField
  });
}

async function webSession(config, runtime = {}) {
  const key = sessionCacheKey(config);
  const cached = webSessionCache.get(key);
  if (!runtime.forceSession && cached && cached.expiresAt > Date.now()) {
    return cached.session;
  }
  const session = await webLogin(config);
  webSessionCache.set(key, {
    session,
    expiresAt: Date.now() + (Number.isFinite(DEFAULT_SESSION_TTL_MS) ? DEFAULT_SESSION_TTL_MS : 8 * 60 * 1000)
  });
  return session;
}

function expireWebSession(config) {
  webSessionCache.delete(sessionCacheKey(config));
}

async function refreshWebToken(config, session) {
  if (!session || !session.cookies) {
    return '';
  }

  const headers = {
    Accept: 'application/json,text/html',
    'Content-Type': 'application/json',
    Cookie: session.cookies
  };
  if (session.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const payload = await fetchJson(resolveUrl(apiBaseUrl(config), '/auth/web/refreshToken'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ withCredentials: true })
  });
  const token = tokenFromPayload(payload, true);
  if (token) {
    session.token = token;
  }
  return token;
}

async function refreshWebTokenBestEffort(config, session) {
  try {
    return await refreshWebToken(config, session);
  } catch (error) {
    if ([400, 401, 403, 404, 406].includes(Number(error.status))) {
      session.refreshWarning = error.message || 'Refresh token Radboox ditolak';
      return '';
    }
    throw error;
  }
}

function webHeaders(session) {
  const headers = {
    Accept: 'application/json,text/html'
  };
  if (session.cookies) {
    headers.Cookie = session.cookies;
  }
  if (session.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  return headers;
}

async function fetchWebJson(config, session, requestPath, period) {
  const url = period
    ? urlWithPeriod(apiBaseUrl(config), requestPath, period)
    : resolveUrl(apiBaseUrl(config), requestPath);

  try {
    return await fetchJson(url, {
      headers: webHeaders(session)
    });
  } catch (error) {
    if (![401, 406].includes(Number(error.status))) {
      throw error;
    }
    const refreshed = error.status === 401 ? await refreshWebTokenBestEffort(config, session) : '';
    if (!refreshed || error.status === 406) {
      expireWebSession(config);
      const freshSession = await webSession(config, { forceSession: true });
      session.cookies = freshSession.cookies;
      session.token = freshSession.token;
      session.loginToken = freshSession.loginToken;
    }
    return fetchJson(url, {
      headers: webHeaders(session)
    });
  }
}

async function fetchWebJsonByDate(config, session, requestPath, date) {
  const url = urlWithDate(apiBaseUrl(config), requestPath, date);

  try {
    return await fetchJson(url, {
      headers: webHeaders(session)
    });
  } catch (error) {
    if (![401, 406].includes(Number(error.status))) {
      throw error;
    }
    const refreshed = error.status === 401 ? await refreshWebTokenBestEffort(config, session) : '';
    if (!refreshed || error.status === 406) {
      expireWebSession(config);
      const freshSession = await webSession(config, { forceSession: true });
      session.cookies = freshSession.cookies;
      session.token = freshSession.token;
      session.loginToken = freshSession.loginToken;
    }
    return fetchJson(url, {
      headers: webHeaders(session)
    });
  }
}

async function postWebJson(config, session, requestPath, payload) {
  const url = resolveUrl(apiBaseUrl(config), requestPath);

  async function postWithSession() {
    return fetchJson(url, {
      method: 'POST',
      headers: {
        ...webHeaders(session),
        'Content-Type': 'application/json'
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
  }

  try {
    return await postWithSession();
  } catch (error) {
    if (![401, 406].includes(Number(error.status))) {
      throw error;
    }
    const refreshed = error.status === 401 ? await refreshWebTokenBestEffort(config, session) : '';
    if (!refreshed || error.status === 406) {
      expireWebSession(config);
      const freshSession = await webSession(config, { forceSession: true });
      session.cookies = freshSession.cookies;
      session.token = freshSession.token;
      session.loginToken = freshSession.loginToken;
    }
    return postWithSession();
  }
}

async function putWebJson(config, session, requestPath, payload) {
  const url = resolveUrl(apiBaseUrl(config), requestPath);

  async function putWithSession() {
    return fetchJson(url, {
      method: 'PUT',
      headers: {
        ...webHeaders(session),
        'Content-Type': 'application/json'
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
  }

  try {
    return await putWithSession();
  } catch (error) {
    if (![401, 406].includes(Number(error.status))) {
      throw error;
    }
    const refreshed = error.status === 401 ? await refreshWebTokenBestEffort(config, session) : '';
    if (!refreshed || error.status === 406) {
      expireWebSession(config);
      const freshSession = await webSession(config, { forceSession: true });
      session.cookies = freshSession.cookies;
      session.token = freshSession.token;
      session.loginToken = freshSession.loginToken;
    }
    return putWithSession();
  }
}

async function deleteWebJson(config, session, requestPath, payload) {
  const url = resolveUrl(apiBaseUrl(config), requestPath);

  async function deleteWithSession() {
    return fetchJson(url, {
      method: 'DELETE',
      headers: {
        ...webHeaders(session),
        'Content-Type': 'application/json'
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
  }

  try {
    return await deleteWithSession();
  } catch (error) {
    if (![401, 406].includes(Number(error.status))) {
      throw error;
    }
    const refreshed = error.status === 401 ? await refreshWebTokenBestEffort(config, session) : '';
    if (!refreshed || error.status === 406) {
      expireWebSession(config);
      const freshSession = await webSession(config, { forceSession: true });
      session.cookies = freshSession.cookies;
      session.token = freshSession.token;
      session.loginToken = freshSession.loginToken;
    }
    return deleteWithSession();
  }
}

async function fetchFirstWebJson(config, session, requestPaths, value, options = {}) {
  const errors = [];
  for (const requestPath of requestPaths) {
    try {
      const payload = options.dateMode
        ? await fetchWebJsonByDate(config, session, requestPath, value)
        : await fetchWebJson(config, session, requestPath, value);
      return { payload, requestPath };
    } catch (error) {
      errors.push(error);
      if (![401, 404, 406].includes(Number(error.status))) {
        throw error;
      }
    }
  }

  const summary = errors
    .map((error) => `HTTP ${error.status || '?'} ${error.url || ''}`.trim())
    .join('; ');
  const label = options.label || 'Radboox';
  const first = errors[0] || new Error(`Endpoint ${label} tidak tersedia`);
  const error = new Error(`Semua endpoint ${label} gagal (${summary})`);
  error.status = first.status;
  error.url = first.url;
  error.bodySample = first.bodySample;
  throw error;
}

async function mutateFirstWebJson(config, session, candidates, options = {}) {
  const errors = [];
  const fallbackStatuses = new Set([404, 405, 406, ...(options.validationFallback ? [400] : [])]);
  for (const candidate of candidates) {
    const method = cleanText(candidate.method || 'PUT').toUpperCase();
    try {
      const payload = method === 'POST'
        ? await postWebJson(config, session, candidate.path, candidate.payload)
        : await putWebJson(config, session, candidate.path, candidate.payload);
      return { payload, candidate };
    } catch (error) {
      errors.push({ error, candidate, method });
      if (!fallbackStatuses.has(Number(error.status))) {
        throw error;
      }
    }
  }

  const summary = errors
    .map(({ error, method }) => `${method} HTTP ${error.status || '?'} ${error.url || ''}`.trim())
    .join('; ');
  const label = options.label || 'Radboox';
  const first = errors[0] ? errors[0].error : new Error(`Endpoint ${label} tidak tersedia`);
  const error = new Error(`Semua endpoint ${label} gagal (${summary})`);
  error.status = first.status;
  error.url = first.url;
  error.bodySample = first.bodySample;
  throw error;
}

async function syncMonthlyEarningViaWeb(config, period) {
  const session = await webLogin(config);
  await refreshWebTokenBestEffort(config, session);

  const { payload, requestPath } = await fetchFirstWebJson(config, session, monthlyEarningPaths(config), period);

  const earning = typeof payload === 'string'
    ? normalizeHtmlMonthlyEarning(payload, period)
    : normalizeMonthlyEarning(payload, period);

  if (!earning.amount) {
    earning.note = earning.note || 'Radboox monthly report returned no income amount';
  }
  if (requestPath && requestPath !== config.webEarningsPath && requestPath !== config.earningsPath) {
    earning.note = earning.note || `Radboox fallback endpoint: ${requestPath}`;
  }

  return earning;
}

async function fetchAdminProfileBestEffort(config, session) {
  try {
    const payload = await fetchWebJson(config, session, '/api-v1/account/admin/detail');
    const record = payload && typeof payload === 'object' && payload.message && typeof payload.message === 'object'
      ? payload.message
      : payload;
    const ids = [
      pick(record, ['admin_id', 'adminId', 'id']),
      pick(record, ['user_id', 'userId'])
    ].map(cleanText).filter(Boolean);
    return {
      id: ids[0] || '',
      ids,
      username: cleanText(pick(record, ['username', 'user', 'login'])),
      name: cleanText(pick(record, ['name', 'full_name', 'fullName', 'legal_name', 'legalName']))
    };
  } catch {
    return null;
  }
}

async function fetchAdminUsersBestEffort(config, session) {
  try {
    const headers = {
      Accept: 'application/json,text/html'
    };
    if (session.cookies) {
      headers.Cookie = session.cookies;
    }
    if (session.loginToken || session.token) {
      headers.Authorization = `Bearer ${session.loginToken || session.token}`;
    }

    const payload = await fetchJson(resolveUrl(apiBaseUrl(config), '/api-v1/account/admin/users'), {
      headers
    });
    const rows = asArray(payload, ['message', 'data', 'rows', 'items']);
    return Object.fromEntries(rows
      .map((row) => [
        cleanText(pick(row, ['id_admin', 'admin_id', 'adminId', 'id'])),
        cleanText(pick(row, ['name', 'full_name', 'fullName', 'username', 'user', 'login']))
      ])
      .filter(([key, label]) => key && label));
  } catch {
    return {};
  }
}

function parseAdminAliases(value) {
  if (!value) {
    return {};
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value)
      .map(([key, label]) => [cleanText(key), cleanText(label)])
      .filter(([key, label]) => key && label));
  }

  return Object.fromEntries(String(value)
    .split(',')
    .map((pair) => pair.split(/[:=]/))
    .map(([key, label]) => [cleanText(key), cleanText(label)])
    .filter(([key, label]) => key && label));
}

function applyAdminDirectory(report, directory = {}, options = {}) {
  if (!report || !Array.isArray(report.transactions)) {
    return report;
  }

  const cleanDirectory = Object.fromEntries(Object.entries(directory)
    .map(([key, label]) => [cleanText(key), cleanText(label)])
    .filter(([key, label]) => key && label));
  if (!Object.keys(cleanDirectory).length) {
    return report;
  }

  report.adminDirectory = {
    ...(report.adminDirectory || {}),
    ...cleanDirectory
  };
  report.transactions = report.transactions.map((item) => {
    const label = item.adminId ? cleanDirectory[item.adminId] : '';
    if (!label || (item.adminName && !options.override)) {
      return item;
    }
    return {
      ...item,
      adminName: label,
      admin: label
    };
  });
  return report;
}

function enrichDailyReportAdmins(report, profile) {
  if (!report || !Array.isArray(report.transactions) || !profile || !profile.name) {
    return report;
  }

  const unknownIds = [...new Set(report.transactions
    .filter((item) => !item.adminName && item.adminId)
    .map((item) => item.adminId))];
  if (unknownIds.length !== 1) {
    return report;
  }

  const adminId = unknownIds[0];
  const profileIds = new Set([profile.id, ...(profile.ids || [])].filter(Boolean));
  if (!profileIds.has(adminId)) {
    return report;
  }

  return applyAdminDirectory(report, { [adminId]: profile.name });
}

async function syncDailyReportViaApi(config, date, runtime = {}) {
  if (!config.baseUrl) {
    throw new Error('RADBOOX_BASE_URL belum diisi');
  }
  if (!config.token) {
    throw new Error('RADBOOX_TOKEN/RADBOOX_API_KEY belum diisi untuk mode API');
  }

  const payload = await fetchJson(urlWithDate(apiBaseUrl(config), config.dailyReportPath, date), {
    headers: authHeaders(config)
  });
  const report = normalizeDailyReport(payload, date);
  const fetcher = (path) => fetchJson(resolveUrl(apiBaseUrl(config), path), {
    headers: authHeaders(config)
  });
  await enrichDailyReportPaymentTimes(report, fetcher);
  await enrichDailyReportSites(report, fetcher, runtime);
  return report;
}

async function syncDailyReportViaWeb(config, date, runtime = {}) {
  const session = await webLogin(config);
  await refreshWebTokenBestEffort(config, session);

  const { payload, requestPath } = await fetchFirstWebJson(config, session, dailyReportPaths(config), date, {
    dateMode: true,
    label: 'daily Radboox'
  });

  const report = typeof payload === 'string'
    ? normalizeDailyReport({ message: { data: parseHtmlTables(payload).flat() } }, date)
    : normalizeDailyReport(payload, date);
  applyAdminDirectory(report, parseAdminAliases(config.adminAliases));
  enrichDailyReportAdmins(report, await fetchAdminProfileBestEffort(config, session));
  applyAdminDirectory(report, await fetchAdminUsersBestEffort(config, session), { override: true });
  applyAdminDirectory(report, parseAdminAliases(config.adminAliases), { override: true });
  const fetcher = (path) => fetchWebJson(config, session, path);
  await enrichDailyReportPaymentTimes(report, fetcher);
  await enrichDailyReportSites(report, fetcher, runtime);

  if (requestPath && requestPath !== config.webDailyReportPath && requestPath !== config.dailyReportPath) {
    report.note = `Radboox fallback endpoint: ${requestPath}`;
  }

  return report;
}

function normalizeInvoiceMonitorQuery(runtime = {}) {
  const rawStatus = cleanText(runtime.status || 'unpaid').toLowerCase();
  const status = ['all', 'unpaid', 'overdue', 'paid'].includes(rawStatus) ? rawStatus : 'unpaid';
  const rawCustomerStatus = cleanText(runtime.customerStatus || runtime.serviceStatus || 'all').toLowerCase();
  const customerStatusMap = {
    all: 'all',
    active: 'active',
    aktif: 'active',
    isolated: 'isolated',
    isolir: 'isolated',
    suspend: 'isolated',
    suspended: 'isolated',
    terminate: 'terminate',
    terminated: 'terminate'
  };
  const site = cleanText(runtime.site || runtime.siteId || 'all') || 'all';
  const page = Math.max(1, Number.parseInt(runtime.page || '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(runtime.limit || '10', 10) || 10));
  return {
    status,
    customerStatus: customerStatusMap[rawCustomerStatus] || 'all',
    site,
    period: normalizePeriod(runtime.period),
    sites: billingSites(runtime.sites),
    today: normalizeBillingDate(runtime.today) || localDateIso(),
    page,
    limit,
    search: cleanText(runtime.search).slice(0, 120)
  };
}

function invoiceDataPath(query = {}) {
  const params = new URLSearchParams();
  params.set('page', String(query.page || 1));
  params.set('limit', String(query.limit || 10));
  params.set('status', query.status === 'all' ? '' : (query.status === 'overdue' ? 'unpaid' : (query.status || 'unpaid')));
  params.set('type', '');
  params.set('method', '');
  params.set('search', query.search || '');
  params.append('short[]', '');
  params.append('short[]', '');
  return `/api-v1/billing/invoice/data?${params.toString()}`;
}

function memberDataPath(query = {}) {
  const params = new URLSearchParams();
  params.set('page', String(query.page || 1));
  params.set('limit', String(query.limit || 100));
  params.set('type', '');
  params.set('payment_method', '');
  params.set('status', query.status || '');
  params.set('search', query.search || '');
  params.append('short[]', '');
  params.append('short[]', '');
  return `/api-v1/billing/member/data?${params.toString()}`;
}

function dataPayloadTotal(payload, fallback = 0) {
  return findNumberDeep(payload, [
    'totalRows',
    'total_rows',
    'recordsTotal',
    'recordsFiltered',
    'totalData',
    'total_data',
    'total'
  ]) || fallback;
}

function radiusPagination(query = {}, total = 0, rows = []) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit || 10) || 10));
  const totalRows = Number(total || rows.length || 0);
  const totalPages = Math.max(1, Math.ceil(totalRows / limit));
  return {
    page,
    limit,
    total: totalRows,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages
  };
}

function radiusQuery(runtime = {}) {
  return {
    tab: cleanText(runtime.tab || 'users').toLowerCase(),
    page: Math.max(1, Number(runtime.page || 1) || 1),
    limit: Math.max(1, Math.min(100, Number(runtime.limit || 10) || 10)),
    search: cleanText(runtime.search || ''),
    nas: cleanText(runtime.nas || ''),
    status: cleanText(runtime.status || ''),
    profile: cleanText(runtime.profile || ''),
    refresh: Boolean(runtime.refresh)
  };
}

function radiusRows(payload, candidates = []) {
  return asArray(payload, candidates.concat(['message', 'data', 'rows', 'items', 'records']))
    || asArray(objectFromPayload(payload), candidates.concat(['data', 'rows', 'items', 'records']));
}

function radiusPathWithPagination(path, query = {}, extra = {}) {
  const params = new URLSearchParams();
  params.set('page', String(query.page || 1));
  params.set('limit', String(query.limit || 10));
  Object.entries(extra).forEach(([key, value]) => {
    params.set(key, cleanText(value));
  });
  return `${path}?${params.toString()}`;
}

function radiusPppPath(query = {}) {
  if (query.tab === 'sessions') {
    return radiusPathWithPagination('/api-v1/radius/ppp/session', query, {
      search: query.search
    });
  }
  if (query.tab === 'profiles') {
    return radiusPathWithPagination('/api-v1/radius/ppp/profile', query, {
      search: query.search
    });
  }
  const params = new URLSearchParams();
  params.set('page', String(query.page || 1));
  params.set('limit', String(query.limit || 10));
  params.set('nas', query.nas || '');
  params.set('status', query.status || '');
  params.set('profile', query.profile || '');
  params.set('service', '');
  params.set('search', query.search || '');
  params.append('short[]', '');
  params.append('short[]', '');
  return `/api-v1/radius/ppp/users?${params.toString()}`;
}

function radiusHotspotPath(query = {}) {
  if (query.tab === 'sessions') {
    return radiusPathWithPagination('/api-v1/radius/hotspot/session', query, {
      nas: query.nas,
      search: query.search
    });
  }
  if (query.tab === 'profiles') {
    return radiusPathWithPagination('/api-v1/radius/hotspot/profile', query, {
      search: query.search
    });
  }
  if (query.tab === 'templates') {
    return '/api-v1/radius/hotspot/template';
  }
  const params = new URLSearchParams();
  params.set('page', String(query.page || 1));
  params.set('limit', String(query.limit || 10));
  params.set('nas', query.nas || '');
  params.set('status', query.status || '');
  params.set('profile', query.profile || '');
  params.set('owner', '');
  params.set('created', '');
  params.set('search', query.search || '');
  params.append('short[]', '');
  params.append('short[]', '');
  return `/api-v1/radius/hotspot/users?${params.toString()}`;
}

function normalizeRadiusUser(record = {}) {
  const username = cleanText(pick(record, ['username', 'user', 'login', 'name', 'uid']));
  const nas = cleanText(pick(record, ['nas', 'router', 'router_name', 'routerName', 'server', 'site', 'location']));
  return {
    id: cleanText(pick(record, ['id', 'uuid', 'uid'])),
    uuid: cleanText(pick(record, ['uuid'])),
    username,
    customerName: cleanText(pick(record, ['full_name', 'fullName', 'fullname', 'customer_name', 'customerName', 'comment', 'owner'])),
    profile: cleanText(pick(record, ['profile', 'profile_name', 'profileName', 'package', 'plan'])),
    nas,
    site: nas,
    status: normalizeServiceStatus(record) || statusFromValue(pick(record, ['status', 'state', 'disabled', 'enable'])),
    service: cleanText(pick(record, ['service', 'type'])),
    ipAddress: cleanText(pick(record, ['ip', 'ipaddress', 'ip_address', 'remote_address', 'remoteAddress'])),
    macAddress: cleanText(pick(record, ['mac', 'mac_address', 'macAddress', 'caller_id', 'callerId'])),
    uptime: cleanText(pick(record, ['uptime', 'session_time', 'sessionTime'])),
    owner: cleanText(pick(record, ['owner', 'reseller', 'admin'])),
    price: toNumber(pick(record, ['price', 'amount', 'tariff', 'tarif'])),
    createdAt: normalizeBillingDateTime(pick(record, ['created_at', 'createdAt', 'created', 'date'])),
    updatedAt: normalizeBillingDateTime(pick(record, ['updated_at', 'updatedAt', 'update'])),
    credentialStored: Boolean(cleanText(pick(record, ['password', 'secret'])))
  };
}

function normalizeRadiusSession(record = {}) {
  const username = cleanText(pick(record, ['username', 'user', 'login', 'name', 'uid']));
  const nas = cleanText(pick(record, ['nas', 'router', 'router_name', 'routerName', 'server', 'site', 'location']));
  return {
    id: cleanText(pick(record, ['id', 'uuid', 'session_id', 'sessionId'])),
    uuid: cleanText(pick(record, ['uuid'])),
    username,
    customerName: cleanText(pick(record, ['full_name', 'fullName', 'fullname', 'customer_name', 'customerName', 'comment'])),
    nas,
    site: nas,
    ipAddress: cleanText(pick(record, ['ip', 'ipaddress', 'ip_address', 'framed_ip_address', 'framedIpAddress'])),
    macAddress: cleanText(pick(record, ['mac', 'mac_address', 'macAddress', 'caller_id', 'callerId'])),
    uptime: cleanText(pick(record, ['uptime', 'session_time', 'sessionTime', 'acct_session_time'])),
    startedAt: normalizeBillingDateTime(pick(record, ['start', 'started_at', 'startedAt'])),
    updatedAt: normalizeBillingDateTime(pick(record, ['update', 'updated_at', 'updatedAt', 'last_update', 'lastUpdate'])),
    download: cleanText(pick(record, ['download', 'input', 'acct_input_octets', 'rx', 'bytes_in'])),
    upload: cleanText(pick(record, ['upload', 'output', 'acct_output_octets', 'tx', 'bytes_out'])),
    status: statusFromValue(pick(record, ['status', 'state'])) || 'online'
  };
}

function normalizeRadiusProfile(record = {}) {
  return {
    id: cleanText(pick(record, ['id', 'uuid'])),
    uuid: cleanText(pick(record, ['uuid'])),
    name: cleanText(pick(record, ['name', 'profile', 'profile_name', 'profileName'])),
    price: toNumber(pick(record, ['price', 'amount', 'tariff', 'tarif'])),
    pool: cleanText(pick(record, ['pool', 'address_pool', 'addressPool', 'ip_pool', 'ipPool'])),
    rateLimit: cleanText(pick(record, ['rate_limit', 'rateLimit', 'ratelimit', 'ratelimitrx', 'ratelimittx'])),
    limitRx: cleanText(pick(record, ['ratelimitrx', 'rateLimitRx', 'rx', 'download'])),
    limitTx: cleanText(pick(record, ['ratelimittx', 'rateLimitTx', 'tx', 'upload'])),
    priority: cleanText(pick(record, ['priority'])),
    group: cleanText(pick(record, ['group', 'owner'])),
    validity: cleanText(pick(record, ['validity', 'valid_until', 'validUntil'])),
    uptime: cleanText(pick(record, ['uptime', 'time_limit', 'timeLimit']))
  };
}

function normalizeRadiusNas(record = {}) {
  const connectedValue = pick(record, ['connected', 'online', 'is_online', 'isOnline']);
  const connectedText = cleanText(connectedValue).toLowerCase();
  return {
    id: cleanText(pick(record, ['id', 'uuid'])),
    uuid: cleanText(pick(record, ['uuid'])),
    name: cleanText(pick(record, ['name', 'routername', 'router_name', 'routerName', 'nas'])),
    ipAddress: cleanText(pick(record, ['ip', 'ipaddress', 'ip_address', 'address'])),
    timezone: cleanText(pick(record, ['timezone', 'tm', 'time_zone', 'timeZone'])),
    connected: connectedValue === true || connectedValue === 1 || ['1', 'true', 'yes', 'online', 'connected', 'up'].includes(connectedText),
    credentialStored: Boolean(cleanText(pick(record, ['secret', 'password'])))
  };
}

function normalizeRadiusTemplate(record = {}) {
  return {
    id: cleanText(pick(record, ['id', 'uuid'])),
    uuid: cleanText(pick(record, ['uuid'])),
    name: cleanText(pick(record, ['name', 'template', 'title'])),
    editable: pick(record, ['editable']) !== false
  };
}

function normalizeRadiusTopInfo(payload = {}) {
  const source = objectFromPayload(payload);
  return {
    total: toNumber(pick(source, ['total', 'all', 'total_user', 'totalUser', 'users'])),
    active: toNumber(pick(source, ['active', 'online', 'total_online', 'totalOnline'])),
    suspend: toNumber(pick(source, ['suspend', 'isolir', 'isolated'])),
    terminate: toNumber(pick(source, ['terminate', 'terminated']))
  };
}

async function listRadiusPppDhcp(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const query = radiusQuery(runtime);
  if (!['users', 'sessions', 'profiles'].includes(query.tab)) {
    query.tab = 'users';
  }
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const path = radiusPppPath(query);
  const payload = await cachedFetch(cacheKey('radius-ppp-dhcp', {
    baseUrl: apiBaseUrl(config),
    username: config.username,
    query
  }), runtime, () => fetchWebJson(config, session, path));
  const rows = radiusRows(payload).map((row) => {
    if (query.tab === 'sessions') return normalizeRadiusSession(row);
    if (query.tab === 'profiles') return normalizeRadiusProfile(row);
    return normalizeRadiusUser(row);
  });
  let topInfo = {};
  try {
    topInfo = normalizeRadiusTopInfo(await fetchWebJson(config, session, '/api-v1/radius/ppp/topinfo'));
  } catch {
    topInfo = {};
  }
  return {
    ok: true,
    mode: 'web',
    section: 'ppp-dhcp',
    tab: query.tab,
    rows,
    pagination: radiusPagination(query, dataPayloadTotal(payload, rows.length), rows),
    topInfo,
    checkedAt: new Date().toISOString()
  };
}

async function listRadiusHotspot(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const query = radiusQuery(runtime);
  if (!['users', 'sessions', 'profiles', 'templates'].includes(query.tab)) {
    query.tab = 'users';
  }
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const path = radiusHotspotPath(query);
  const payload = await cachedFetch(cacheKey('radius-hotspot', {
    baseUrl: apiBaseUrl(config),
    username: config.username,
    query
  }), runtime, () => fetchWebJson(config, session, path));
  const rows = radiusRows(payload).map((row) => {
    if (query.tab === 'sessions') return normalizeRadiusSession(row);
    if (query.tab === 'profiles') return normalizeRadiusProfile(row);
    if (query.tab === 'templates') return normalizeRadiusTemplate(row);
    return normalizeRadiusUser(row);
  });
  let topInfo = {};
  try {
    topInfo = normalizeRadiusTopInfo(await fetchWebJson(config, session, '/api-v1/radius/hotspot/topinfo'));
  } catch {
    topInfo = {};
  }
  return {
    ok: true,
    mode: 'web',
    section: 'hotspot',
    tab: query.tab,
    rows,
    pagination: radiusPagination(query, dataPayloadTotal(payload, rows.length), rows),
    topInfo,
    checkedAt: new Date().toISOString()
  };
}

async function listRadiusSettings(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const query = radiusQuery(runtime);
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const payload = await cachedFetch(cacheKey('radius-settings', {
    baseUrl: apiBaseUrl(config),
    username: config.username,
    search: query.search,
    page: query.page,
    limit: query.limit
  }), runtime, () => fetchWebJson(config, session, '/api-v1/radius/nas/data'));
  let rows = radiusRows(payload).map(normalizeRadiusNas);
  if (query.search) {
    const term = query.search.toLowerCase();
    rows = rows.filter((row) => [row.name, row.ipAddress, row.timezone]
      .map((value) => cleanText(value).toLowerCase())
      .some((value) => value.includes(term)));
  }
  const total = rows.length;
  const start = (query.page - 1) * query.limit;
  return {
    ok: true,
    mode: 'web',
    section: 'settings',
    tab: 'nas',
    rows: rows.slice(start, start + query.limit),
    pagination: radiusPagination(query, total, rows),
    checkedAt: new Date().toISOString()
  };
}

function localDateTimeMinute(timeZone = 'Asia/Makassar') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function radiusRecordId(runtime = {}) {
  return cleanText(runtime.id || runtime.userId || runtime.radbooxId || runtime.uuid);
}

function normalizedRadiusUserType(value) {
  const type = cleanText(value || 'PPPoE').toLowerCase();
  return type === 'dhcp' ? 'DHCP' : 'PPPoE';
}

function radiusPppUserPayload(runtime = {}, action = 'create') {
  const type = normalizedRadiusUserType(runtime.type);
  const username = cleanText(runtime.radiusUsername || runtime.targetUsername || runtime.userUsername);
  const password = cleanText(runtime.radiusPassword || runtime.targetPassword || runtime.userPassword);
  const macAddress = cleanText(runtime.macAddress || runtime.mac_address);
  const profile = cleanText(runtime.profile);
  const payload = {
    type,
    username: type === 'PPPoE' ? username : '',
    mac_address: type === 'DHCP' ? macAddress : cleanText(runtime.mac_address),
    profile: profile === 'none' ? '' : profile,
    nas: cleanText(runtime.nas || runtime.routerNas || runtime.router_nas),
    ip_address: cleanText(runtime.ipAddress || runtime.ip_address),
    service: cleanText(runtime.service || runtime.serviceName)
  };
  const profileId = cleanText(runtime.profileId || runtime.id_profile);
  if (profileId) payload.id_profile = profileId;
  if (password) payload.password = password;
  if (action === 'create') {
    if (type === 'PPPoE' && !username) throw new Error('Username PPPoE wajib diisi');
    if (type === 'PPPoE' && !password) throw new Error('Password PPPoE wajib diisi');
    if (type === 'DHCP' && !macAddress) throw new Error('MAC Address DHCP wajib diisi');
    payload.billing = 0;
    payload.lock_mac = 0;
    payload.mac = '';
  } else if (type === 'PPPoE' && !username) {
    throw new Error('Username PPPoE wajib diisi');
  } else if (type === 'DHCP' && !macAddress) {
    throw new Error('MAC Address DHCP wajib diisi');
  }
  return payload;
}

function radiusHotspotUserPayload(runtime = {}, action = 'create') {
  const username = cleanText(runtime.radiusUsername || runtime.targetUsername || runtime.userUsername);
  const password = cleanText(runtime.radiusPassword || runtime.targetPassword || runtime.userPassword);
  if (!username) throw new Error('Username Hotspot wajib diisi');
  const profile = cleanText(runtime.profile || runtime.assignprofile);
  const payload = {
    username,
    profile: profile === 'none' ? '' : profile,
    routerNas: cleanText(runtime.routerNas || runtime.routernas || runtime.nas),
    hotspotServer: cleanText(runtime.hotspotServer || runtime.hotspotserver)
  };
  if (password) payload.password = password;
  if (action === 'create') {
    payload.createTime = cleanText(runtime.createTime) || localDateTimeMinute();
    payload.statusPayment = profile ? cleanText(runtime.statusPayment || runtime.paymentstatus || '1') : '';
    payload.price = profile ? cleanText(runtime.price || runtime.amount) : '';
  }
  return payload;
}

function radiusMutationResult(section, action, payload, result, fallback) {
  return {
    ok: true,
    mode: 'web',
    section,
    action,
    id: radiusRecordId(payload),
    username: cleanText(payload.username),
    message: radbooxMutationMessage(result, fallback),
    checkedAt: new Date().toISOString()
  };
}

async function createRadiusPppDhcpUser(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const payload = radiusPppUserPayload(runtime, 'create');
  const result = await postWebJson(config, session, '/api-v1/radius/ppp/users', payload);
  return radiusMutationResult('ppp-dhcp', 'create', payload, result, 'User PPP-DHCP Radboox berhasil ditambahkan');
}

async function updateRadiusPppDhcpUser(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const id = radiusRecordId(runtime);
  if (!id) throw new Error('ID user PPP-DHCP Radboox tidak tersedia');
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const payload = radiusPppUserPayload(runtime, 'update');
  const result = await postWebJson(config, session, `/api-v1/radius/ppp/users/${encodeURIComponent(id)}`, payload);
  return radiusMutationResult('ppp-dhcp', 'update', { ...payload, id }, result, 'User PPP-DHCP Radboox berhasil diperbarui');
}

async function deleteRadiusPppDhcpUser(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const id = radiusRecordId(runtime);
  if (!id) throw new Error('ID user PPP-DHCP Radboox tidak tersedia');
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const result = await deleteWebJson(config, session, `/api-v1/radius/ppp/delete/${encodeURIComponent(id)}`);
  return radiusMutationResult('ppp-dhcp', 'delete', { id, username: runtime.radiusUsername || runtime.targetUsername }, result, 'User PPP-DHCP Radboox berhasil dihapus');
}

async function createRadiusHotspotUser(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const payload = radiusHotspotUserPayload(runtime, 'create');
  const result = await postWebJson(config, session, '/api-v1/radius/hotspot/users/one', payload);
  return radiusMutationResult('hotspot', 'create', payload, result, 'User Hotspot Radboox berhasil ditambahkan');
}

async function updateRadiusHotspotUser(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const id = radiusRecordId(runtime);
  if (!id) throw new Error('ID user Hotspot Radboox tidak tersedia');
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const payload = radiusHotspotUserPayload(runtime, 'update');
  const result = await putWebJson(config, session, `/api-v1/radius/hotspot/users/${encodeURIComponent(id)}`, payload);
  return radiusMutationResult('hotspot', 'update', { ...payload, id }, result, 'User Hotspot Radboox berhasil diperbarui');
}

async function deleteRadiusHotspotUser(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const id = radiusRecordId(runtime);
  if (!id) throw new Error('ID user Hotspot Radboox tidak tersedia');
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const result = await deleteWebJson(config, session, `/api-v1/radius/hotspot/users/${encodeURIComponent(id)}`);
  return radiusMutationResult('hotspot', 'delete', { id, username: runtime.radiusUsername || runtime.targetUsername }, result, 'User Hotspot Radboox berhasil dihapus');
}

function customerStatusToRadboox(status) {
  if (status === 'isolated') return 'suspend';
  if (status === 'terminate') return 'terminate';
  if (status === 'active') return 'active';
  return '';
}

function isPaidOrCancelled(status) {
  return ['paid', 'cancelled', 'canceled'].includes(cleanText(status).toLowerCase());
}

function isBillingInvoiceOverdue(invoice = {}, today = localDateIso()) {
  const dueDate = normalizeBillingDate(invoice.dueDate);
  const currentDate = normalizeBillingDate(today) || localDateIso();
  return Boolean(dueDate && dueDate < currentDate && !isPaidOrCancelled(invoice.status));
}

function applyBillingRuntime(invoice = {}, today = localDateIso()) {
  const dueDate = normalizeBillingDate(invoice.dueDate);
  const invoiceDate = normalizeBillingDate(invoice.invoiceDate);
  const paidDate = normalizeBillingDate(invoice.paidDate);
  const overdue = isBillingInvoiceOverdue({ ...invoice, dueDate }, today);
  return {
    ...invoice,
    invoiceDate,
    dueDate,
    paidDate,
    rawStatus: invoice.rawStatus || invoice.status,
    status: overdue ? 'overdue' : invoice.status,
    isOverdue: overdue
  };
}

function lastActiveValue(record = {}) {
  return pick(record, [
    'last_active',
    'lastActive',
    'last_seen',
    'lastSeen',
    'last_online',
    'lastOnline',
    'last_login',
    'lastLogin',
    'last_session',
    'lastSession',
    'last_activity',
    'lastActivity',
    'latest_activity',
    'latestActivity',
    'active_at',
    'activeAt',
    'online_at',
    'onlineAt'
  ]);
}

function pppUsersPath(query = {}) {
  const params = new URLSearchParams();
  params.set('page', String(query.page || 1));
  params.set('limit', String(query.limit || 100));
  params.set('nas', '');
  params.set('status', query.status || '');
  params.set('profile', '');
  params.set('service', '');
  params.set('search', query.search || '');
  params.append('short[]', '');
  params.append('short[]', '');
  return `/api-v1/radius/ppp/users?${params.toString()}`;
}

function pppSessionsPath(query = {}) {
  const params = new URLSearchParams();
  params.set('page', String(query.page || 1));
  params.set('limit', String(query.limit || 10));
  params.set('search', query.search || '');
  return `/api-v1/radius/ppp/session?${params.toString()}`;
}

function normalizePppUser(record = {}) {
  const username = cleanText(pick(record, [
    'username',
    'user',
    'login',
    'pppoe_user',
    'pppoe_username',
    'ppp_user',
    'pppUsername',
    'name'
  ]));
  const customerName = cleanText(pick(record, [
    'full_name',
    'fullName',
    'customer_name',
    'customerName',
    'fullname',
    'nama',
    'owner',
    'comment'
  ]));
  const site = cleanText(pick(record, [
    'site',
    'site_name',
    'siteName',
    'nas',
    'router',
    'router_nas',
    'routerNas',
    'server',
    'location',
    'lokasi'
  ]));
  return {
    accountId: cleanText(pick(record, ['uid', 'acc_id', 'account_id', 'accountId', 'id', 'customer_id', 'customerId', 'id_customer'])),
    username: username || extractUsername(customerName),
    customerName,
    phone: cleanText(pick(record, ['wa', 'whatsapp', 'phone', 'mobile', 'no_whatsapp'])),
    address: cleanText(pick(record, ['address', 'alamat'])),
    site,
    serviceStatus: normalizeServiceStatus(record) || statusFromValue(pick(record, ['status'])),
    lastActiveAt: normalizeBillingDateTime(lastActiveValue(record)),
    rawLastActive: cleanText(lastActiveValue(record))
  };
}

function normalizePppSession(record = {}) {
  const rawLastActive = [
    pick(record, ['update', 'updated', 'last_update', 'lastUpdate', 'acct_update', 'acctUpdate']),
    pick(record, ['stop', 'stopped_at', 'stoppedAt', 'end', 'ended_at', 'endedAt']),
    pick(record, ['start', 'started_at', 'startedAt'])
  ]
    .map(cleanText)
    .find((value) => value && value !== '-') || '';
  return {
    accountId: cleanText(pick(record, ['uid', 'acc_id', 'account_id', 'accountId', 'id', 'customer_id', 'customerId', 'id_customer'])),
    username: cleanText(pick(record, ['username', 'user', 'login', 'pppoe_user', 'pppoe_username', 'ppp_user', 'pppUsername'])),
    customerName: cleanText(pick(record, ['full_name', 'fullName', 'customer_name', 'customerName', 'fullname', 'nama', 'owner', 'comment'])),
    phone: cleanText(pick(record, ['wa', 'whatsapp', 'phone', 'mobile', 'no_whatsapp'])),
    address: cleanText(pick(record, ['address', 'alamat'])),
    site: cleanText(pick(record, ['site', 'site_name', 'siteName', 'nas', 'router', 'router_nas', 'routerNas', 'server', 'location', 'lokasi'])),
    serviceStatus: normalizeServiceStatus(record) || statusFromValue(pick(record, ['status', 'internet'])),
    lastActiveAt: normalizeBillingDateTime(rawLastActive),
    rawLastActive,
    session: {
      id: cleanText(pick(record, ['session_id', 'sessionId', 'id'])),
      start: cleanText(pick(record, ['start', 'started_at', 'startedAt'])),
      stop: cleanText(pick(record, ['stop', 'stopped_at', 'stoppedAt'])),
      update: cleanText(pick(record, ['update', 'updated', 'last_update', 'lastUpdate'])),
      uptime: cleanText(pick(record, ['uptime']))
    }
  };
}

function identityKeys(record = {}) {
  const keys = [
    record.accountId,
    record.username,
    record.customerName,
    record.phone
  ]
    .map((value) => cleanText(value).toLowerCase())
    .filter(Boolean);
  const phone = cleanText(record.phone).replace(/\D/g, '');
  if (phone) {
    keys.push(phone);
    if (phone.startsWith('0')) keys.push(`62${phone.slice(1)}`);
    if (phone.startsWith('62')) keys.push(`0${phone.slice(2)}`);
  }
  return [...new Set(keys)];
}

function memberDirectory(members = []) {
  const directory = new Map();
  members.forEach((member) => {
    identityKeys(member).forEach((key) => {
      const existing = directory.get(key);
      if (!existing) {
        directory.set(key, member);
        return;
      }
      if ((member.lastActiveAt && !existing.lastActiveAt) || (member.site && !existing.site) || (member.serviceStatus && !existing.serviceStatus)) {
        directory.set(key, {
          ...existing,
          ...member,
          site: existing.site || member.site || '',
          serviceStatus: existing.serviceStatus || member.serviceStatus || '',
          lastActiveAt: member.lastActiveAt || existing.lastActiveAt || '',
          rawLastActive: member.rawLastActive || existing.rawLastActive || '',
          session: member.session || existing.session
        });
      }
    });
  });
  return directory;
}

function pppLookupTerm(invoice = {}) {
  const candidates = [
    invoice.pppoeUsername,
    invoice.username,
    extractUsername(invoice.item),
    extractUsername(invoice.subscribe),
    invoice.accountId,
    invoice.phone,
    invoice.customerName
  ];
  return candidates
    .map(cleanText)
    .find((value) => value && value !== '-' && value.length >= 3) || '';
}

function enrichInvoicesWithPppUsers(invoices = [], pppUsers = []) {
  if (!pppUsers.length) {
    return invoices;
  }
  const directory = memberDirectory(pppUsers);
  return invoices.map((invoice) => {
    const pppUser = identityKeys(invoice).map((key) => directory.get(key)).find(Boolean);
    if (!pppUser) {
      return invoice;
    }
    const serviceStatus = pppUser.serviceStatus || invoice.serviceStatus;
    return {
      ...invoice,
      site: invoice.site || pppUser.site || '',
      lastActiveAt: pppUser.lastActiveAt || invoice.lastActiveAt || '',
      rawLastActive: pppUser.rawLastActive || invoice.rawLastActive || '',
      pppoeUsername: pppUser.username || invoice.pppoeUsername || invoice.username || '',
      customerStatus: serviceStatus || invoice.customerStatus,
      serviceStatus: serviceStatus || invoice.serviceStatus,
      isIsolated: isIsolatedStatus(serviceStatus || invoice.serviceStatus),
      pppoe: {
        username: pppUser.username,
        site: pppUser.site,
        serviceStatus,
        lastActiveAt: pppUser.lastActiveAt
      }
    };
  });
}

function enrichInvoicesWithMembers(invoices = [], members = []) {
  if (!members.length) {
    return invoices;
  }
  const directory = memberDirectory(members);
  return invoices.map((invoice) => {
    const member = identityKeys(invoice).map((key) => directory.get(key)).find(Boolean);
    if (!member) {
      return invoice;
    }
    const serviceStatus = member.serviceStatus || invoice.serviceStatus;
    return {
      ...invoice,
      site: invoice.site || member.site || '',
      customerStatus: serviceStatus,
      serviceStatus,
      isIsolated: isIsolatedStatus(serviceStatus),
      member: {
        accountId: member.accountId,
        username: member.username,
        customerName: member.customerName,
        phone: member.phone,
        site: member.site,
        serviceStatus
      }
    };
  });
}

function memberOnlyInvoice(member = {}) {
  const key = member.accountId || member.username || member.phone || member.customerName;
  return {
    externalId: key ? `member:${key}` : 'member',
    invoiceNo: '',
    accountId: member.accountId || '',
    username: member.username || '',
    customerName: member.customerName || member.username || member.accountId || '-',
    phone: member.phone || '',
    address: member.address || '',
    item: member.item || member.username || 'Data member Radboox',
    subscribe: member.subscribe || '',
    type: member.type || '',
    method: member.method || '',
    amount: 0,
    baseAmount: 0,
    discount: 0,
    ppn: 0,
    status: 'member',
    customerStatus: member.serviceStatus || member.customerStatus || '',
    serviceStatus: member.serviceStatus || member.customerStatus || '',
    isIsolated: member.isIsolated || isIsolatedStatus(member.serviceStatus || member.customerStatus),
    invoiceDate: member.activeDate || '',
    dueDate: member.dueDate || '',
    paidDate: '',
    period: periodFromBillingDate(member.activeDate) || periodFromBillingDate(member.dueDate),
    site: member.site || '',
    memberOnly: true
  };
}

function memberOnlyMatchesBillingStatus(invoice = {}, query = {}) {
  const status = cleanText(query.status || 'all').toLowerCase();
  if (!status || status === 'all' || status === 'unpaid') return true;
  if (status === 'overdue') return isBillingInvoiceOverdue(invoice, query.today);
  return false;
}

function missingMemberInvoices(invoices = [], members = [], query = {}) {
  const invoiceKeys = new Set();
  invoices.forEach((invoice) => identityKeys(invoice).forEach((key) => invoiceKeys.add(key)));
  return members
    .filter((member) => !identityKeys(member).some((key) => invoiceKeys.has(key)))
    .map(memberOnlyInvoice)
    .map((invoice) => applyBillingRuntime(invoice, query.today))
    .map((invoice) => attachBillingSite(invoice, query.sites))
    .filter((invoice) => invoiceMatchesCustomerStatus(invoice, query.customerStatus))
    .filter((invoice) => invoiceMatchesSite(invoice, query.site))
    .filter((invoice) => memberOnlyMatchesBillingStatus(invoice, query));
}

function invoiceMatchesCustomerStatus(invoice, customerStatus) {
  if (!customerStatus || customerStatus === 'all') return true;
  if (customerStatus === 'isolated') return invoice.isIsolated || isIsolatedStatus(invoice.serviceStatus);
  if (customerStatus === 'terminate') return isTerminatedStatus(invoice.serviceStatus);
  return cleanText(invoice.serviceStatus).toLowerCase() === customerStatus;
}

function invoiceMatchesBillingStatus(invoice, query = {}) {
  const status = cleanText(query.status || 'all').toLowerCase();
  if (!status || status === 'all') return true;
  if (status === 'overdue') return isBillingInvoiceOverdue(invoice, query.today);
  if (status === 'unpaid') return ['unpaid', 'pending', 'overdue'].includes(cleanText(invoice.status).toLowerCase());
  return cleanText(invoice.status).toLowerCase() === status;
}

function invoiceStatusUsesPeriod(status) {
  return ['all', 'paid'].includes(cleanText(status).toLowerCase());
}

function invoiceMatchesPeriod(invoice = {}, query = {}) {
  if (!invoiceStatusUsesPeriod(query.status)) return true;
  const period = explicitPeriod(query.period);
  if (!period) return true;
  if (invoice.period) {
    return invoice.period === period;
  }
  const candidates = [
    periodFromBillingDate(invoice.invoiceDate),
    periodsFromBillingText(invoice.subscribe)[0],
    periodsFromBillingText(invoice.item)[0],
    periodFromBillingDate(invoice.dueDate),
    periodFromBillingDate(invoice.paidDate)
  ].filter(Boolean);
  return candidates.includes(period);
}

function invoiceMatchesSearch(invoice = {}, search = '') {
  const term = cleanText(search).toLowerCase();
  if (!term) return true;
  const haystack = [
    invoice.invoiceNo,
    invoice.externalId,
    invoice.radbooxInvoiceId,
    invoice.uuid,
    invoice.accountId,
    invoice.username,
    invoice.pppoeUsername,
    invoice.customerName,
    invoice.phone,
    invoice.address,
    invoice.item,
    invoice.subscribe,
    invoice.site,
    invoice.siteName,
    invoice.type,
    invoice.method,
    invoice.rawStatus,
    invoice.status
  ].map((value) => cleanText(value).toLowerCase()).filter(Boolean).join(' ');
  return haystack.includes(term);
}

function invoiceMatchesFilters(invoice, query = {}) {
  return invoiceMatchesBillingStatus(invoice, query)
    && invoiceMatchesCustomerStatus(invoice, query.customerStatus)
    && invoiceMatchesSite(invoice, query.site)
    && invoiceMatchesPeriod(invoice, query)
    && invoiceMatchesSearch(invoice, query.search);
}

async function fetchPagedRows(fetcher, pathBuilder, candidates = [], options = {}) {
  const limit = options.limit || 100;
  const maxPages = options.maxPages || 10;
  const maxRows = options.maxRows || 1000;
  const rows = [];
  let total = 0;

  for (let page = 1; page <= maxPages && rows.length < maxRows; page += 1) {
    const payload = await fetcher(pathBuilder({ page, limit }));
    const pageRows = asArray(objectFromPayload(payload), candidates);
    rows.push(...pageRows);
    total = dataPayloadTotal(payload, rows.length);
    if (!pageRows.length || rows.length >= total) {
      break;
    }
  }

  return {
    rows: rows.slice(0, maxRows),
    total: total || rows.length,
    capped: rows.length >= maxRows
  };
}

async function fetchPppUsers(fetcher, runtime = {}, source = {}) {
  const key = cacheKey('ppp-users', {
    baseUrl: source.baseUrl || '',
    username: source.username || '',
    mode: source.mode || ''
  });
  const payload = await cachedFetch(key, runtime, async () => {
    const result = await fetchPagedRows(
      fetcher,
      ({ page, limit }) => pppUsersPath({ page, limit }),
      ['data', 'rows', 'items', 'records'],
      { limit: 100, maxPages: 30, maxRows: 3000 }
    );
    return {
      users: result.rows.map(normalizePppUser).filter((user) => identityKeys(user).length),
      total: result.total,
      capped: result.capped
    };
  });
  return payload;
}

async function fetchPppUsersForInvoices(fetcher, invoices = [], runtime = {}, source = {}) {
  const terms = [...new Set(invoices.map(pppLookupTerm).filter(Boolean))].slice(0, 12);
  const fallback = { users: [], total: 0, capped: false, timedOut: false };
  if (!fetcher || !terms.length) {
    return fallback;
  }
  const key = cacheKey('ppp-users-lookup', {
    baseUrl: source.baseUrl || '',
    username: source.username || '',
    mode: source.mode || '',
    terms
  });
  const lookupRuntime = {
    ...runtime,
    force: false,
    refresh: false
  };
  const lookup = cachedFetch(key, lookupRuntime, async () => {
    const jobs = terms.flatMap((search) => [
      async () => {
        const payload = await fetcher(pppUsersPath({ page: 1, limit: 10, search }));
        return asArray(objectFromPayload(payload), ['data', 'rows', 'items', 'records'])
          .map(normalizePppUser)
          .filter((user) => identityKeys(user).length);
      },
      async () => {
        const payload = await fetcher(pppSessionsPath({ page: 1, limit: 10, search }));
        return asArray(objectFromPayload(payload), ['data', 'rows', 'items', 'records'])
          .map(normalizePppSession)
          .filter((user) => identityKeys(user).length);
      }
    ]);
    const results = await Promise.allSettled(jobs.map((job) => job()));
    const byKey = new Map();
    results.forEach((result) => {
      if (result.status !== 'fulfilled') {
        return;
      }
      result.value.forEach((user) => {
        const keyPart = cleanText(user.username).toLowerCase() || identityKeys(user)[0] || `${user.username}:${user.customerName}`;
        const existing = byKey.get(keyPart) || {};
        byKey.set(keyPart, {
          ...existing,
          ...user,
          site: existing.site || user.site || '',
          serviceStatus: existing.serviceStatus || user.serviceStatus || '',
          lastActiveAt: user.lastActiveAt || existing.lastActiveAt || '',
          rawLastActive: user.rawLastActive || existing.rawLastActive || '',
          session: user.session || existing.session
        });
      });
    });
    const users = [...byKey.values()];
    return {
      users,
      total: users.length,
      capped: false,
      timedOut: false
    };
  });
  const timeoutMs = Math.max(1000, Number(runtime.pppLookupTimeoutMs || 4000));
  const guarded = lookup.catch(() => fallback);
  return Promise.race([
    guarded,
    new Promise((resolve) => {
      setTimeout(() => resolve({ ...fallback, timedOut: true }), timeoutMs);
    })
  ]);
}

async function fetchMemberStatusCounts(fetcher, runtime = {}, source = {}) {
  if (!fetcher) {
    return {};
  }
  const key = cacheKey('member-status-counts', {
    baseUrl: source.baseUrl || '',
    username: source.username || '',
    mode: source.mode || ''
  });
  return cachedFetch(key, runtime, async () => {
    const entries = await Promise.all([
      ['activeMembers', 'active'],
      ['isolatedMembers', 'suspend'],
      ['terminatedMembers', 'terminate']
    ].map(async ([name, status]) => {
      try {
        const payload = await fetcher(memberDataPath({ page: 1, limit: 1, status, search: '' }));
        const rows = asArray(objectFromPayload(payload), ['data', 'rows', 'items', 'records']);
        return [name, dataPayloadTotal(payload, rows.length)];
      } catch {
        return [name, 0];
      }
    }));
    return Object.fromEntries(entries);
  });
}

function invoiceMonitorPayload(topInfoPayload, invoices, total, query, mode, extraSummary = {}) {
  const totalPages = Math.max(1, Math.ceil(total / query.limit));
  const currentPage = Math.min(query.page, totalPages);
  const summary = normalizeInvoiceTopInfo(topInfoPayload);
  const filteredAmount = Object.prototype.hasOwnProperty.call(extraSummary, 'filteredAmount')
    ? toNumber(extraSummary.filteredAmount)
    : invoiceSummaryAmountForStatus(summary, query.status);

  return {
    ok: true,
    source: 'radboox',
    mode,
    status: query.status,
    customerStatus: query.customerStatus,
    site: query.site,
    period: query.period,
    sites: query.sites.map((site) => ({
      id: site.id,
      name: site.name,
      location: site.location
    })),
    search: query.search,
    checkedAt: new Date().toISOString(),
    summary: {
      ...summary,
      ...extraSummary,
      filteredAmount,
      filteredCount: total,
      listedCount: invoices.length,
      isolatedListed: invoices.filter((invoice) => invoice.isIsolated).length,
      terminatedListed: invoices.filter((invoice) => isTerminatedStatus(invoice.serviceStatus)).length,
      whatsappReady: invoices.filter((invoice) => invoice.phone).length
    },
    invoices,
    pagination: {
      page: currentPage,
      limit: query.limit,
      total,
      totalPages,
      hasPrev: currentPage > 1,
      hasNext: currentPage < totalPages
    }
  };
}

function invoiceSummaryAmountForStatus(summary = {}, status = '') {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return toNumber(summary.paidAmount);
  if (normalized === 'overdue') return toNumber(summary.overdueAmount);
  if (normalized === 'all') return toNumber(summary.totalAmount);
  return toNumber(summary.unpaidAmount);
}

function invoiceMonitorNeedsFullFilter(query = {}) {
  return query.status === 'overdue'
    || invoiceStatusUsesPeriod(query.status)
    || query.customerStatus !== 'all'
    || query.site !== 'all'
    || Boolean(query.search);
}

function invoiceTopInfoKey(mode, source = {}) {
  return cacheKey('invoice-topinfo', {
    baseUrl: source.baseUrl || '',
    username: source.username || '',
    mode
  });
}

async function invoiceMonitorResponse(topInfoPayload, dataPayload, query, mode, fetcher = null, runtime = {}, source = {}) {
  let invoices = asArray(objectFromPayload(dataPayload), ['data', 'rows', 'items', 'records'])
    .map(normalizeBillingInvoice)
    .map((invoice) => applyBillingRuntime(invoice, query.today))
    .map((invoice) => attachBillingSite(invoice, query.sites))
    .filter((invoice) => invoice.invoiceNo || invoice.customerName || invoice.accountId);
  const total = dataPayloadTotal(dataPayload, invoices.length);
  let payloadTotal = total;
  if (invoiceMonitorNeedsFullFilter(query)) {
    invoices = invoices.filter((invoice) => invoiceMatchesFilters(invoice, query));
    payloadTotal = invoices.length;
  }
  const pppResult = fetcher ? await fetchPppUsersForInvoices(fetcher, invoices, runtime, { ...source, mode }) : { users: [], total: 0, capped: false, timedOut: false };
  invoices = enrichInvoicesWithPppUsers(invoices, pppResult.users || [])
    .map((invoice) => invoice.siteId ? invoice : attachBillingSite(invoice, query.sites));
  const memberCounts = fetcher ? await fetchMemberStatusCounts(fetcher, runtime, { ...source, mode }) : {};
  return invoiceMonitorPayload(topInfoPayload, invoices, payloadTotal, query, mode, {
    ...memberCounts,
    pppLookupCount: (pppResult.users || []).length,
    pppLookupTimedOut: Boolean(pppResult.timedOut)
  });
}

async function filteredInvoiceMonitor(fetcher, topInfoPayload, query, mode, runtime = {}, source = {}) {
  const filteredKey = cacheKey('invoice-monitor-filtered', {
    baseUrl: source.baseUrl || '',
    username: source.username || '',
    mode,
    status: query.status,
    customerStatus: query.customerStatus,
    site: query.site,
    period: query.period,
    sites: query.sites.map((site) => `${site.id}:${site.name}`).join('|'),
    today: query.today,
    search: query.search
  });
  const filtered = await cachedFetch(filteredKey, runtime, async () => {
    const invoiceResult = await fetchPagedRows(
      fetcher,
      ({ page, limit }) => invoiceDataPath({ ...query, page, limit }),
      ['data', 'rows', 'items', 'records'],
      { limit: 100, maxPages: 10, maxRows: 1000 }
    );
    const memberResult = query.customerStatus !== 'all'
      ? await fetchPagedRows(
        fetcher,
        ({ page, limit }) => memberDataPath({ page, limit, status: customerStatusToRadboox(query.customerStatus), search: '' }),
        ['data', 'rows', 'items', 'records'],
        { limit: 100, maxPages: 10, maxRows: 1000 }
      )
      : { rows: [], total: 0, capped: false };
    const members = memberResult.rows.map(normalizeBillingMember).filter((member) => identityKeys(member).length);
    let allInvoices = enrichInvoicesWithMembers(
      invoiceResult.rows
        .map(normalizeBillingInvoice)
        .map((invoice) => applyBillingRuntime(invoice, query.today))
        .map((invoice) => attachBillingSite(invoice, query.sites))
        .filter((invoice) => invoice.invoiceNo || invoice.customerName || invoice.accountId),
      members
    )
      .map((invoice) => invoice.siteId ? invoice : attachBillingSite(invoice, query.sites))
      .map((invoice) => applyBillingRuntime(invoice, query.today))
      .filter((invoice) => invoiceMatchesFilters(invoice, query));
    if (['isolated', 'terminate'].includes(query.customerStatus)) {
      allInvoices = allInvoices.concat(missingMemberInvoices(allInvoices, members, query));
    }
    const memberCounts = await fetchMemberStatusCounts(fetcher, runtime, { ...source, mode });
    return {
      allInvoices,
      extraSummary: {
        ...memberCounts,
        filteredAmount: allInvoices.reduce((sum, invoice) => sum + toNumber(invoice.amount), 0),
        memberDirectoryCount: members.length,
        sourceRows: invoiceResult.total,
        capped: invoiceResult.capped || memberResult.capped,
        ...(query.status === 'overdue' ? {
          overdue: allInvoices.length,
          overdueAmount: allInvoices.reduce((sum, invoice) => sum + toNumber(invoice.amount), 0)
        } : {})
      }
    };
  });
  const allInvoices = filtered.allInvoices || [];
  const total = allInvoices.length;
  const totalPages = Math.max(1, Math.ceil(total / query.limit));
  const currentPage = Math.min(query.page, totalPages);
  const offset = (currentPage - 1) * query.limit;
  const pageInvoices = allInvoices.slice(offset, offset + query.limit);
  const pppResult = await fetchPppUsersForInvoices(fetcher, pageInvoices, runtime, { ...source, mode });
  const enrichedPage = enrichInvoicesWithPppUsers(pageInvoices, pppResult.users || [])
    .map((invoice) => invoice.siteId ? invoice : attachBillingSite(invoice, query.sites));
  return invoiceMonitorPayload(topInfoPayload, enrichedPage, total, {
    ...query,
    page: currentPage
  }, mode, {
    ...(filtered.extraSummary || {}),
    pppLookupCount: (pppResult.users || []).length,
    pppLookupTimedOut: Boolean(pppResult.timedOut)
  });
}

async function monthlyPeriodInvoiceMonitor(fetcher, topInfoPayload, query, mode, runtime = {}, source = {}) {
  let paidInvoices = await fetchMonthlyPaidInvoices(fetcher, query, runtime, { ...source, mode });
  paidInvoices = paidInvoices.map((invoice) => invoice.siteId ? invoice : attachBillingSite(invoice, query.sites));
  let searchPrefiltered = false;
  if (query.search) {
    const quickMatches = paidInvoices.filter((invoice) => invoiceMatchesSearch(invoice, query.search));
    if (quickMatches.length) {
      paidInvoices = quickMatches;
      searchPrefiltered = true;
    }
  }
  if (paidInvoices.length && (query.site !== 'all' || query.customerStatus !== 'all' || (query.search && !searchPrefiltered))) {
    paidInvoices = await enrichPaidInvoicesWithInvoiceData(fetcher, paidInvoices, query);
  }
  let allInvoices = paidInvoices;
  let unpaidSourceRows = 0;
  let capped = false;

  if (query.status === 'all') {
    const invoiceResult = await fetchPagedRows(
      fetcher,
      ({ page, limit }) => invoiceDataPath({ ...query, status: 'unpaid', page, limit }),
      ['data', 'rows', 'items', 'records'],
      { limit: 100, maxPages: 1, maxRows: 100 }
    );
    unpaidSourceRows = invoiceResult.total;
    capped = invoiceResult.capped;
    const unpaidInvoices = invoiceResult.rows
      .map(normalizeBillingInvoice)
      .map((invoice) => applyBillingRuntime(invoice, query.today))
      .map((invoice) => attachBillingSite(invoice, query.sites))
      .filter((invoice) => invoice.invoiceNo || invoice.customerName || invoice.accountId);
    allInvoices = paidInvoices.concat(unpaidInvoices);
  }

  allInvoices = allInvoices
    .map((invoice) => invoice.siteId ? invoice : attachBillingSite(invoice, query.sites))
    .filter((invoice) => invoiceMatchesFilters(invoice, query))
    .sort((a, b) => String(b.paidDate || b.dueDate || b.invoiceDate || '').localeCompare(String(a.paidDate || a.dueDate || a.invoiceDate || '')));

  const total = allInvoices.length;
  const totalPages = Math.max(1, Math.ceil(total / query.limit));
  const currentPage = Math.min(query.page, totalPages);
  const offset = (currentPage - 1) * query.limit;
  let pageInvoices = allInvoices.slice(offset, offset + query.limit);
  const paidPageInvoices = pageInvoices.filter((invoice) => invoice.paidFromReport);
  if (paidPageInvoices.length) {
    const enrichedPaid = await enrichPaidInvoicesWithInvoiceData(fetcher, paidPageInvoices, query);
    let paidIndex = 0;
    pageInvoices = pageInvoices.map((invoice) => {
      if (!invoice.paidFromReport) return invoice;
      const enriched = enrichedPaid[paidIndex] || invoice;
      paidIndex += 1;
      return enriched;
    });
  }
  const memberCounts = await fetchMemberStatusCounts(fetcher, runtime, { ...source, mode });
  const periodPaidAmount = paidInvoices.reduce((sum, invoice) => sum + toNumber(invoice.amount), 0);

  return invoiceMonitorPayload(topInfoPayload, pageInvoices, total, {
    ...query,
    page: currentPage
  }, mode, {
    ...memberCounts,
    filteredAmount: allInvoices.reduce((sum, invoice) => sum + toNumber(invoice.amount), 0),
    periodPaidCount: paidInvoices.length,
    periodPaidAmount,
    sourceRows: paidInvoices.length + unpaidSourceRows,
    capped,
    monthlyReportRows: paidInvoices.length
  });
}

async function invoiceMonitorViaWeb(config, runtime = {}) {
  const query = normalizeInvoiceMonitorQuery(runtime);
  const session = await webSession(config, runtime);
  const source = {
    baseUrl: apiBaseUrl(config),
    username: config.username
  };
  const topInfoPayload = await cachedFetch(invoiceTopInfoKey('web', source), runtime, () => fetchWebJson(config, session, '/api-v1/billing/invoice/topinfo'));
  if (invoiceStatusUsesPeriod(query.status)) {
    return monthlyPeriodInvoiceMonitor((path) => fetchWebJson(config, session, path), topInfoPayload, query, 'web', runtime, {
      baseUrl: source.baseUrl,
      username: source.username
    });
  }
  if (invoiceMonitorNeedsFullFilter(query)) {
    return filteredInvoiceMonitor((path) => fetchWebJson(config, session, path), topInfoPayload, query, 'web', runtime, {
      baseUrl: source.baseUrl,
      username: source.username
    });
  }
  const dataPayload = await fetchWebJson(config, session, invoiceDataPath(query));
  return invoiceMonitorResponse(topInfoPayload, dataPayload, query, 'web', (path) => fetchWebJson(config, session, path), runtime, {
    baseUrl: source.baseUrl,
    username: source.username
  });
}

async function invoiceMonitorViaApi(config, runtime = {}) {
  if (!config.baseUrl && !config.apiBaseUrl) {
    throw new Error('RADBOOX_BASE_URL belum diisi');
  }
  if (!config.token) {
    throw new Error('RADBOOX_TOKEN/RADBOOX_API_KEY belum diisi untuk mode API');
  }

  const query = normalizeInvoiceMonitorQuery(runtime);
  const headers = authHeaders(config);
  const source = {
    baseUrl: apiBaseUrl(config),
    username: config.username
  };
  if (invoiceStatusUsesPeriod(query.status)) {
    const topInfoPayload = await cachedFetch(invoiceTopInfoKey('api', source), runtime, () => fetchJson(resolveUrl(apiBaseUrl(config), '/api-v1/billing/invoice/topinfo'), { headers }));
    return monthlyPeriodInvoiceMonitor((path) => fetchJson(resolveUrl(apiBaseUrl(config), path), { headers }), topInfoPayload, query, 'api', runtime, {
      baseUrl: source.baseUrl,
      username: source.username
    });
  }
  if (invoiceMonitorNeedsFullFilter(query)) {
    const topInfoPayload = await cachedFetch(invoiceTopInfoKey('api', source), runtime, () => fetchJson(resolveUrl(apiBaseUrl(config), '/api-v1/billing/invoice/topinfo'), { headers }));
    return filteredInvoiceMonitor((path) => fetchJson(resolveUrl(apiBaseUrl(config), path), { headers }), topInfoPayload, query, 'api', runtime, {
      baseUrl: source.baseUrl,
      username: source.username
    });
  }
  const [topInfoPayload, dataPayload] = await Promise.all([
    cachedFetch(invoiceTopInfoKey('api', source), runtime, () => fetchJson(resolveUrl(apiBaseUrl(config), '/api-v1/billing/invoice/topinfo'), { headers })),
    fetchJson(resolveUrl(apiBaseUrl(config), invoiceDataPath(query)), { headers })
  ]);
  return invoiceMonitorResponse(topInfoPayload, dataPayload, query, 'api', (path) => fetchJson(resolveUrl(apiBaseUrl(config), path), { headers }), runtime, {
    baseUrl: source.baseUrl,
    username: source.username
  });
}

async function invoiceMonitorStatusUncached(config, runtime = {}) {
  const mode = String(config.mode || '').toLowerCase();
  if (mode === 'web' || (config.username && config.password)) {
    return invoiceMonitorViaWeb({ ...config, mode: 'web' }, runtime);
  }

  try {
    return await invoiceMonitorViaApi(config, runtime);
  } catch (error) {
    if (![401, 406].includes(Number(error.status)) || !config.username || !config.password) {
      throw error;
    }
    return invoiceMonitorViaWeb({ ...config, mode: 'web' }, runtime);
  }
}

async function invoiceMonitorStatus(settings, runtime = {}) {
  const config = mergeConfig(settings, runtime);
  const query = normalizeInvoiceMonitorQuery(runtime);
  const responseKey = cacheKey('invoice-monitor-response', {
    baseUrl: apiBaseUrl(config),
    username: config.username,
    mode: config.mode,
    hasToken: Boolean(config.token),
    query
  });
  return cachedFetch(responseKey, runtime, () => invoiceMonitorStatusUncached(config, runtime));
}

function reminderMessageFromPayload(payload) {
  if (typeof payload === 'string') {
    return cleanText(payload);
  }
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  if (typeof payload.message === 'string') {
    return cleanText(payload.message);
  }
  if (payload.message && typeof payload.message === 'object') {
    const nested = reminderMessageFromPayload(payload.message);
    if (nested) return nested;
  }
  if (typeof payload.data === 'string') {
    return cleanText(payload.data);
  }
  if (payload.data && typeof payload.data === 'object') {
    const nested = reminderMessageFromPayload(payload.data);
    if (nested) return nested;
  }
  return '';
}

async function sendInvoiceReminderViaApi(config, invoiceId) {
  if (!config.token) {
    throw new Error('RADBOOX_TOKEN/RADBOOX_API_KEY belum diisi untuk mode API');
  }
  return fetchJson(resolveUrl(apiBaseUrl(config), `/api-v1/billing/invoice/reminder/${encodeURIComponent(invoiceId)}`), {
    method: 'POST',
    headers: {
      ...authHeaders(config),
      'Content-Type': 'application/json'
    }
  });
}

async function sendInvoiceReminderViaWeb(config, invoiceId, runtime = {}) {
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  return postWebJson(config, session, `/api-v1/billing/invoice/reminder/${encodeURIComponent(invoiceId)}`);
}

async function sendInvoiceReminder(settings, runtime = {}) {
  const config = mergeConfig(settings, runtime);
  const invoiceId = cleanText(runtime.invoiceId || runtime.id || runtime.radbooxInvoiceId || runtime.reminderId);
  if (!invoiceId) {
    throw new Error('ID invoice Radboox tidak tersedia untuk kirim reminder');
  }
  if (!config.baseUrl && !config.apiBaseUrl) {
    throw new Error('RADBOOX_BASE_URL belum diisi');
  }

  const mode = String(config.mode || '').toLowerCase();
  let payload;
  let sendMode = 'api';
  if (mode === 'web' || (config.username && config.password)) {
    sendMode = 'web';
    payload = await sendInvoiceReminderViaWeb({ ...config, mode: 'web' }, invoiceId, runtime);
  } else {
    try {
      payload = await sendInvoiceReminderViaApi(config, invoiceId);
    } catch (error) {
      if (![401, 406].includes(Number(error.status)) || !config.username || !config.password) {
        throw error;
      }
      sendMode = 'web-fallback';
      payload = await sendInvoiceReminderViaWeb({ ...config, mode: 'web' }, invoiceId, runtime);
    }
  }

  return {
    ok: true,
    mode: sendMode,
    invoiceId,
    message: reminderMessageFromPayload(payload) || 'Reminder invoice dikirim melalui Radboox',
    raw: payload
  };
}

function invoiceDetailFromPayload(payload) {
  const candidates = [
    payload?.detail,
    payload?.message?.detail,
    payload?.data?.detail,
    payload?.invoice,
    payload?.message?.invoice,
    payload?.data?.invoice,
    payload?.message,
    payload?.data,
    payload
  ];

  for (const candidate of candidates) {
    const item = Array.isArray(candidate) ? candidate[0] : candidate;
    if (!item || typeof item !== 'object') {
      continue;
    }
    if (pick(item, ['id', 'invoice_id', 'invoiceId', 'id_invoice', 'no_invoice', 'status'])) {
      return item;
    }
  }
  return null;
}

function invoiceDetailId(detail = {}) {
  return cleanText(pick(detail, ['id', 'invoice_id', 'invoiceId', 'id_invoice']));
}

function invoiceDetailRawId(detail = {}) {
  const value = pick(detail, ['id', 'invoice_id', 'invoiceId', 'id_invoice']);
  return value === undefined || value === null ? '' : value;
}

function normalizePaymentMethod(method) {
  const value = cleanText(method || '1').toLowerCase();
  if (['2', 'transfer', 'bank-transfer', 'bank_transfer', 'bank transfer'].includes(value)) {
    return '2';
  }
  return '1';
}

function paymentMethodLabel(method) {
  return normalizePaymentMethod(method) === '2' ? 'Transfer' : 'Tunai';
}

function radbooxSuccessMessage(payload, fallback) {
  if (payload && typeof payload === 'object' && Number(payload.message) === 1) {
    return fallback;
  }
  return reminderMessageFromPayload(payload) || fallback;
}

function invoiceActionMessage(payload, fallback) {
  return radbooxSuccessMessage(payload, fallback);
}

async function findInvoiceByNoViaWeb(config, invoiceNo, runtime = {}) {
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const payload = await fetchWebJson(config, session, `/api-v1/billing/invoice/find/${encodeURIComponent(invoiceNo)}`);
  const detail = invoiceDetailFromPayload(payload);
  const invoiceId = invoiceDetailId(detail || {});
  if (!detail || !invoiceId) {
    throw new Error(`Invoice Radboox ${invoiceNo} tidak ditemukan`);
  }

  return {
    detail,
    invoiceId,
    invoiceRawId: invoiceDetailRawId(detail),
    invoiceNo: cleanText(pick(detail, ['no_invoice', 'invoice_number', 'invoiceNumber', 'invoiceNo'])) || invoiceNo,
    status: normalizeStatus(pick(detail, ['status', 'invoice_status', 'invoiceStatus', 'payment_status', 'paymentStatus'])),
    payload,
    session
  };
}

async function findInvoiceByNo(settings, runtime = {}) {
  const invoiceNo = cleanText(runtime.invoiceNo || runtime.noInvoice || runtime.externalId);
  if (!invoiceNo) {
    throw new Error('Nomor invoice Radboox tidak tersedia');
  }
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const result = await findInvoiceByNoViaWeb(config, invoiceNo, runtime);
  return {
    ok: true,
    mode: 'web',
    invoiceNo: result.invoiceNo,
    invoiceId: result.invoiceId,
    status: result.status,
    raw: result.payload
  };
}

async function payInvoice(settings, runtime = {}) {
  const invoiceNo = cleanText(runtime.invoiceNo || runtime.noInvoice || runtime.externalId);
  if (!invoiceNo) {
    throw new Error('Nomor invoice Radboox tidak tersedia untuk bayar');
  }
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const found = await findInvoiceByNoViaWeb(config, invoiceNo, runtime);
  if (found.status === 'paid') {
    throw new Error(`Invoice Radboox ${found.invoiceNo} sudah lunas`);
  }

  const method = normalizePaymentMethod(runtime.paymentMethod || runtime.method);
  const payload = await postWebJson(config, found.session, '/api-v1/billing/invoice/payment', {
    id: found.invoiceRawId || found.invoiceId,
    method
  });

  return {
    ok: true,
    mode: 'web',
    action: 'pay',
    invoiceNo: found.invoiceNo,
    invoiceId: found.invoiceId,
    statusBefore: found.status,
    paymentMethod: method,
    paymentMethodLabel: paymentMethodLabel(method),
    message: invoiceActionMessage(payload, `Invoice ${found.invoiceNo} dibayar via Radboox`),
    raw: payload
  };
}

async function rollbackInvoice(settings, runtime = {}) {
  const invoiceNo = cleanText(runtime.invoiceNo || runtime.noInvoice || runtime.externalId);
  if (!invoiceNo) {
    throw new Error('Nomor invoice Radboox tidak tersedia untuk rollback');
  }
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const found = await findInvoiceByNoViaWeb(config, invoiceNo, runtime);
  const payload = await postWebJson(config, found.session, `/api-v1/billing/invoice/cancel/${encodeURIComponent(found.invoiceId)}`);

  return {
    ok: true,
    mode: 'web',
    action: 'rollback',
    invoiceNo: found.invoiceNo,
    invoiceId: found.invoiceId,
    statusBefore: found.status,
    message: invoiceActionMessage(payload, `Invoice ${found.invoiceNo} dibatalkan via Radboox`),
    raw: payload
  };
}

function billingMemberRows(payload) {
  const message = payload && typeof payload === 'object' ? payload.message : null;
  const source = message && typeof message === 'object' ? message : payload;
  return {
    rows: asArray(source, ['data', 'members', 'customers']).map(normalizeBillingMember).filter((member) => member.id || member.fullName || member.userId),
    totalRows: toNumber(pick(source, ['total_rows', 'totalRows', 'total', 'count'])),
    raw: payload
  };
}

function detailSource(payload) {
  const message = payload && typeof payload === 'object' ? payload.message : payload;
  return message && typeof message === 'object' ? message : {};
}

function normalizeBillingMemberContact(payload) {
  const source = detailSource(payload);
  const map = source.map && typeof source.map === 'object' ? source.map : {};
  return {
    fullName: cleanText(pick(source, ['fullname', 'full_name', 'fullName', 'name', 'nama'])),
    whatsapp: cleanText(pick(source, ['whatsapp', 'wa', 'phone', 'mobile', 'no_whatsapp'])),
    email: cleanText(pick(source, ['email'])),
    ktp: cleanText(pick(source, ['ktp', 'id_card', 'idCard', 'npwp'])),
    address: cleanText(pick(source, ['address', 'alamat'])),
    map: {
      lat: cleanText(pick(map, ['lat', 'latitude'])),
      lng: cleanText(pick(map, ['lng', 'lon', 'longitude']))
    },
    raw: payload
  };
}

function normalizeBillingMemberPayment(payload) {
  const source = detailSource(payload);
  return {
    paymentType: cleanText(pick(source, ['payment_type', 'type_payment', 'paymentType'])),
    billingPeriod: cleanText(pick(source, ['billing_period', 'billingPeriod'])),
    nextDue: cleanText(pick(source, ['next_due', 'nextDue', 'due_date', 'dueDate'])),
    price: cleanText(pick(source, ['price', 'amount', 'tariff'])),
    ppn: cleanText(pick(source, ['ppn', 'tax'])),
    discount: cleanText(pick(source, ['discount', 'diskon'])),
    raw: payload
  };
}

function invoicePreviewFromPayload(payload) {
  const message = payload && typeof payload === 'object' ? payload.message : payload;
  const source = message && typeof message === 'object' ? message : {};
  return {
    memberId: cleanText(pick(source, ['id_member', 'member_id', 'memberId', 'id'])),
    fullName: cleanText(pick(source, ['fullname', 'full_name', 'fullName', 'name'])),
    dueDate: cleanText(pick(source, ['due_date', 'dueDate'])),
    subscribe: cleanText(pick(source, ['Subscribe', 'subscribe', 'subscription'])),
    item: cleanText(pick(source, ['item', 'description'])),
    amount: cleanText(pick(source, ['amount', 'harga', 'price'])),
    ppn: cleanText(pick(source, ['ppn', 'tax'])),
    discount: cleanText(pick(source, ['discount', 'diskon'])),
    total: cleanText(pick(source, ['total', 'grand_total', 'grandTotal'])),
    raw: payload
  };
}

function maskBankNumber(value) {
  const text = cleanText(value);
  if (!text) return '';
  const visible = text.slice(-4);
  return visible ? `****${visible}` : '';
}

function compactLabel(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeXenditType(value) {
  const text = cleanText(value).toUpperCase();
  if (text === 'PAYMENT' || text === 'TRANSFER') return 'PAYMENT';
  if (text === 'DISBURSEMENT') return 'DISBURSEMENT';
  if (text === 'REFUND') return 'REFUND';
  return text || cleanText(value);
}

function normalizeXenditPaymentMethod(value) {
  const text = cleanText(value).toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (text === 'QR_CODE' || text === 'QRIS') return 'QR_CODE';
  if (text === 'VIRTUAL_ACCOUNT' || text === 'VA') return 'VIRTUAL_ACCOUNT';
  if (text === 'EWALLET' || text === 'E_WALLET') return 'EWALLET';
  if (text === 'RETAIL_OUTLET') return 'RETAIL_OUTLET';
  if (text === 'BANK') return 'BANK';
  return text || cleanText(value);
}

function normalizeXenditDateTime(row = {}) {
  const obj = row && typeof row.obj === 'object' ? row.obj : {};
  const iso = cleanText(pick(obj, [
    'payment_date',
    'actual_settlement_date',
    'created',
    'updated',
    'estimated_settlement_time'
  ]));
  if (hasExplicitTimezone(iso)) {
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  return normalizeRadbooxDateTime(pick(row, ['date', 'created_at', 'createdAt', 'created'])) || '';
}

function xenditMessage(payload) {
  return payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'message')
    ? payload.message
    : payload;
}

function normalizeXenditAccount(record = {}) {
  const banks = Array.isArray(record.bank) ? record.bank : [];
  return {
    id: cleanText(pick(record, ['id', 'business_id', 'businessId'])),
    status: cleanText(pick(record, ['status'])),
    type: cleanText(pick(record, ['tipe', 'type'])),
    email: cleanText(pick(record, ['email'])),
    whatsappEnabled: Boolean(toNumber(pick(record, ['wa']))),
    appEnabled: Boolean(toNumber(pick(record, ['app']))),
    hasPin: Boolean(record.pin),
    adminFee: toNumber(pick(record, ['fees', 'admin_fee', 'adminFee'])),
    adminPercent: toNumber(pick(record, ['admin', 'admin_percent', 'adminPercent'])),
    banks: banks.map((bank) => {
      const accountNumber = cleanText(pick(bank, ['number', 'account_number', 'accountNumber']));
      return {
        index: pick(bank, ['index', 'id']),
        bank: cleanText(pick(bank, ['bank', 'bank_code', 'bankCode'])),
        accountName: cleanText(pick(bank, ['name', 'account_name', 'accountName', 'account_holder_name'])),
        accountNumber,
        accountNumberMasked: maskBankNumber(accountNumber)
      };
    }).filter((bank) => bank.bank || bank.accountName || bank.accountNumberMasked)
  };
}

function publicXenditAccount(account = {}) {
  return {
    ...account,
    banks: (account.banks || []).map((bank) => {
      const {
        accountNumber,
        ...safeBank
      } = bank;
      return safeBank;
    })
  };
}

function normalizeXenditTransaction(row = {}) {
  const obj = row && typeof row.obj === 'object' ? row.obj : {};
  const fee = obj.fee && typeof obj.fee === 'object' ? obj.fee : {};
  const rawType = normalizeXenditType(pick(obj, ['type']) || pick(row, ['type']));
  const rawMethod = normalizeXenditPaymentMethod(pick(obj, ['channel_category']) || pick(row, ['payment_method', 'paymentMethod']));
  const settlement = cleanText(pick(obj, ['settlement_status']) || pick(row, ['settle', 'settlement']));
  const cashflow = cleanText(pick(obj, ['cashflow']));
  const amount = toNumber(pick(obj, ['amount']) || pick(row, ['amount']));
  const netAmount = toNumber(pick(obj, ['net_amount', 'netAmount']) || pick(row, ['net_amount', 'netAmount']));
  const totalFee = toNumber(pick(fee, ['xendit_fee', 'xenditFee']))
    + toNumber(pick(fee, ['value_added_tax', 'valueAddedTax']))
    + toNumber(pick(fee, ['xendit_withholding_tax', 'xenditWithholdingTax']))
    + toNumber(pick(fee, ['third_party_withholding_tax', 'thirdPartyWithholdingTax']));

  return {
    id: cleanText(pick(row, ['id']) || pick(obj, ['id'])),
    uuid: cleanText(pick(row, ['uuid']) || pick(obj, ['uuid'])),
    status: compactLabel(pick(obj, ['status']) || pick(row, ['status'])),
    type: rawType,
    typeLabel: compactLabel(rawType || pick(row, ['type'])),
    paymentMethod: rawMethod,
    paymentMethodLabel: compactLabel(rawMethod || pick(row, ['payment_method', 'paymentMethod'])),
    channel: cleanText(pick(row, ['channel']) || pick(obj, ['channel_code', 'channelCode'])),
    amount,
    netAmount,
    fee: totalFee,
    reference: cleanText(pick(obj, ['reference_id', 'referenceId']) || pick(row, ['referensi', 'reference'])),
    description: cleanText(pick(obj, ['description', 'account_name', 'accountName']) || pick(row, ['description', 'name'])),
    customerName: cleanText(pick(obj, ['account_name', 'accountName', 'description'])),
    date: normalizeXenditDateTime(row),
    dateRaw: cleanText(pick(row, ['date'])),
    settlement: compactLabel(settlement),
    settlementRaw: settlement,
    cashflow,
    accountIdentifier: cleanText(pick(obj, ['account_identifier', 'accountIdentifier'])),
    channelReference: cleanText(pick(obj, ['channel_reference', 'channelReference'])),
    feeStatus: cleanText(pick(fee, ['status'])),
    moneyIn: cashflow === 'MONEY_IN' || rawType === 'PAYMENT',
    moneyOut: cashflow === 'MONEY_OUT' || ['DISBURSEMENT', 'REFUND'].includes(rawType)
  };
}

function normalizeXenditBalanceMovement(row = {}) {
  const dateRaw = cleanText(pick(row, ['tanggal', 'date', 'created_at', 'createdAt']));
  const amountText = cleanText(pick(row, ['jumlah', 'amount', 'total']));
  const balanceText = cleanText(pick(row, ['balance', 'saldo']));
  return {
    id: cleanText(pick(row, ['uuid', 'id'])) || `${dateRaw}-${pick(row, ['deskripsi', 'description', 'referensi', 'reference'])}`,
    uuid: cleanText(pick(row, ['uuid'])),
    date: normalizeRadbooxDateTime(dateRaw),
    dateRaw,
    type: compactLabel(pick(row, ['tipe', 'type'])),
    channel: cleanText(pick(row, ['channel'])),
    reference: cleanText(pick(row, ['referensi', 'reference', 'deskripsi', 'description'])),
    description: cleanText(pick(row, ['deskripsi', 'description', 'keterangan'])),
    amount: toNumber(amountText),
    amountText,
    balance: toNumber(balanceText),
    balanceText
  };
}

function normalizeXenditPendingMovement(row = {}) {
  const dateRaw = cleanText(pick(row, ['tanggal', 'date', 'created_at', 'createdAt']));
  const settlementRaw = cleanText(pick(row, ['settle', 'settlement', 'settlement_time']));
  const amountText = cleanText(pick(row, ['jumlah', 'amount', 'total']));
  const feeText = cleanText(pick(row, ['fee', 'admin_fee', 'xendit_fee']));
  const netText = cleanText(pick(row, ['net', 'net_amount', 'netAmount']));
  return {
    id: cleanText(pick(row, ['uuid', 'id'])) || `${dateRaw}-${pick(row, ['deskripsi', 'description', 'referensi', 'reference'])}`,
    uuid: cleanText(pick(row, ['uuid'])),
    date: normalizeRadbooxDateTime(dateRaw),
    dateRaw,
    settlementAt: normalizeRadbooxDateTime(settlementRaw),
    settlementRaw,
    type: compactLabel(pick(row, ['tipe', 'type'])),
    channel: cleanText(pick(row, ['channel'])),
    reference: cleanText(pick(row, ['referensi', 'reference', 'deskripsi', 'description'])),
    description: cleanText(pick(row, ['deskripsi', 'description', 'keterangan'])),
    amount: toNumber(amountText),
    amountText,
    fee: toNumber(feeText),
    feeText,
    netAmount: toNumber(netText),
    netText
  };
}

function normalizeXenPlatformReport(record = {}) {
  return {
    id: cleanText(pick(record, ['id'])),
    status: cleanText(pick(record, ['status'])),
    period: cleanText(pick(record, ['periode', 'period', 'month'])),
    volumeAmount: toNumber(pick(record, ['volume_trx', 'volumeTransaction', 'volume'])),
    volumeText: cleanText(pick(record, ['volume_trx', 'volumeTransaction', 'volume'])),
    transactionCount: toNumber(pick(record, ['jumlah_trx', 'transactionCount', 'count'])),
    feeAmount: toNumber(pick(record, ['jumlah_fee', 'totalFee', 'fee'])),
    feeText: cleanText(pick(record, ['jumlah_fee', 'totalFee', 'fee'])),
    hasInvoice: Boolean(cleanText(pick(record, ['invoice']))),
    hasTaxInvoice: cleanText(pick(record, ['faktur'])) && cleanText(pick(record, ['faktur'])) !== '-'
  };
}

function normalizeXenditTab(value) {
  const tab = cleanText(value).toLowerCase().replace(/[_\s-]+/g, '-');
  if (['balance', 'balance-history', 'history'].includes(tab)) return 'balance';
  if (['pending', 'settlement-pending'].includes(tab)) return 'pending';
  if (['fees', 'fee', 'fees-report', 'xenplatform', 'report'].includes(tab)) return 'fees';
  return 'transactions';
}

function xenditTransactionPath(accountId, query = {}) {
  const params = new URLSearchParams();
  params.set('from', normalizeBillingDate(query.from) || localDateIso());
  params.set('to', normalizeBillingDate(query.to) || localDateIso());
  params.set('limit', String(Math.max(1, Math.min(50, Number(query.limit || 15) || 15))));
  params.set('type', normalizeXenditType(query.type || '') === 'ALL' ? '' : normalizeXenditType(query.type || ''));
  params.set('status', '');
  params.set('payment_method', normalizeXenditPaymentMethod(query.paymentMethod || query.method || '') === 'ALL' ? '' : normalizeXenditPaymentMethod(query.paymentMethod || query.method || ''));
  params.set('search', cleanText(query.search || '').toLowerCase());
  params.set('nextid', cleanText(query.nextId || query.nextid || ''));
  return `/api-v1/pg/xendit/xp-transactions/${encodeURIComponent(accountId)}?${params.toString()}`;
}

function xenditBalanceHistoryPath(accountId, query = {}) {
  const params = new URLSearchParams();
  params.set('from', normalizeBillingDate(query.from) || localDateIso());
  params.set('to', normalizeBillingDate(query.to) || localDateIso());
  return `/api-v1/pg/xendit/xp-report-balance/${encodeURIComponent(accountId)}?${params.toString()}`;
}

function xenditPendingPath(accountId, query = {}) {
  const params = new URLSearchParams();
  params.set('from', normalizeBillingDate(query.from) || localDateIso());
  params.set('to', normalizeBillingDate(query.to) || localDateIso());
  return `/api-v1/pg/xendit/xp-report-balance-pending/${encodeURIComponent(accountId)}?${params.toString()}`;
}

function summarizeXenditTransactions(transactions = []) {
  return transactions.reduce((summary, transaction) => {
    if (transaction.moneyIn) {
      summary.incomingAmount += Number(transaction.amount || 0);
      summary.incomingCount += 1;
    }
    if (transaction.moneyOut) {
      summary.outgoingAmount += Number(transaction.amount || 0);
      summary.outgoingCount += 1;
    }
    if (String(transaction.settlementRaw || '').toUpperCase() === 'SETTLED') {
      summary.settledCount += 1;
    }
    if (String(transaction.settlementRaw || '').toUpperCase() === 'PENDING') {
      summary.pendingCount += 1;
    }
    summary.feeAmount += Number(transaction.fee || 0);
    return summary;
  }, {
    incomingAmount: 0,
    incomingCount: 0,
    outgoingAmount: 0,
    outgoingCount: 0,
    pendingCount: 0,
    settledCount: 0,
    feeAmount: 0
  });
}

function summarizeXenditPending(rows = [], meta = {}) {
  return {
    incomingAmount: toNumber(meta.total_incoming || meta.totalIncoming) || rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    outgoingAmount: toNumber(meta.total_outgoing || meta.totalOutgoing) || rows.reduce((sum, row) => sum + Number(row.fee || 0), 0),
    pendingCount: rows.length,
    feeAmount: rows.reduce((sum, row) => sum + Number(row.fee || 0), 0),
    netAmount: rows.reduce((sum, row) => sum + Number(row.netAmount || 0), 0)
  };
}

function filterXenditRows(rows = [], search = '') {
  const query = cleanText(search).toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => Object.values(row).some((value) => {
    if (value && typeof value === 'object') return false;
    return cleanText(value).toLowerCase().includes(query);
  }));
}

function xenditReferenceKeys(value = '') {
  const text = cleanText(value);
  if (!text) return [];
  const keys = new Set([text.toLowerCase()]);
  const digits = text.match(/\d{3,}/g) || [];
  digits.forEach((digit) => {
    invoiceNoKeys(digit).forEach((key) => keys.add(key.toLowerCase()));
  });
  invoiceNoKeys(text).forEach((key) => keys.add(key.toLowerCase()));
  return [...keys].filter(Boolean);
}

function cashierXenditDescription(row = {}) {
  return cleanText(row.description || row.item || row.invoiceNo || row.id);
}

function cashierXenditDirectory(rows = []) {
  const directory = new Map();
  rows.forEach((row) => {
    const description = cashierXenditDescription(row);
    if (!description) return;
    const entry = {
      description,
      item: row.item || '',
      id: row.id || '',
      externalId: row.externalId || '',
      invoiceNo: row.invoiceNo || '',
      admin: row.admin || '',
      submittedAt: row.submittedAt || ''
    };
    [
      row.invoiceNo,
      row.externalId,
      row.id,
      row.description,
      row.item
    ].flatMap(xenditReferenceKeys).forEach((key) => {
      if (key && !directory.has(key)) {
        directory.set(key, entry);
      }
    });
  });
  return directory;
}

function xenditTransactionReferenceKeys(transaction = {}) {
  return [
    transaction.reference,
    transaction.channelReference,
    transaction.description,
    transaction.customerName,
    transaction.id,
    transaction.uuid
  ].flatMap(xenditReferenceKeys);
}

function enrichXenditRowsWithCashier(rows = [], cashierRows = []) {
  if (!rows.length || !cashierRows.length) return rows;
  const directory = cashierXenditDirectory(cashierRows);
  if (!directory.size) return rows;
  return rows.map((row) => {
    const source = xenditTransactionReferenceKeys(row)
      .map((key) => directory.get(key))
      .find(Boolean);
    if (!source) return row;
    return {
      ...row,
      radbooxDescription: source.description,
      radbooxItem: source.item,
      radbooxTransactionId: source.id,
      radbooxTransactionExternalId: source.externalId,
      radbooxInvoiceNo: source.invoiceNo,
      radbooxAdmin: source.admin,
      radbooxSubmittedAt: source.submittedAt
    };
  });
}

function xenditCashierSearchTerms(rows = [], search = '') {
  const queryKeys = new Set(xenditReferenceKeys(search));
  const terms = [];
  const addTerm = (term) => {
    const value = cleanText(term);
    if (!value || queryKeys.has(value.toLowerCase()) || terms.includes(value)) return;
    terms.push(value);
  };

  rows.forEach((row) => {
    invoiceNoKeys(row.invoiceNo).forEach(addTerm);
    [row.description, row.item].flatMap(xenditReferenceKeys)
      .filter((key) => /^\d{4,}$/.test(key))
      .forEach(addTerm);
    [row.externalId, row.id].forEach((value) => {
      const text = cleanText(value);
      if (/^\d{4,}$/.test(text)) {
        invoiceNoKeys(text).forEach(addTerm);
      }
    });
  });

  return terms.slice(0, 12);
}

function xenditTransactionUniqueKey(transaction = {}) {
  return transaction.id
    || transaction.uuid
    || [
      transaction.reference,
      transaction.channelReference,
      transaction.dateRaw || transaction.date,
      transaction.amount
    ].map(cleanText).filter(Boolean).join(':');
}

function mergeXenditTransactions(base = [], additions = []) {
  const rows = [];
  const seen = new Set();
  [...base, ...additions].forEach((transaction) => {
    const key = xenditTransactionUniqueKey(transaction);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push(transaction);
  });
  return rows;
}

function cashierRowUniqueKey(row = {}) {
  return row.id || row.externalId || row.invoiceNo || [
    row.description,
    row.item,
    row.amount,
    row.submittedRaw
  ].map(cleanText).filter(Boolean).join(':');
}

function mergeCashierRows(base = [], additions = []) {
  const rows = [];
  const seen = new Set();
  [...base, ...additions].forEach((row) => {
    const key = cashierRowUniqueKey(row);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  });
  return rows;
}

async function fetchCashierRowsForXendit(config, session, query = {}, search = '', options = {}) {
  const limit = options.limit || 500;
  const result = await fetchPagedRows(
    (path) => fetchWebJson(config, session, path),
    ({ page, limit: pageLimit }) => cashierTransactionDataPath({
      page,
      limit: pageLimit,
      from: query.from,
      to: query.to,
      method: '',
      search
    }),
    ['data', 'rows', 'items', 'transactions', 'records'],
    {
      limit,
      maxPages: options.maxPages || 6,
      maxRows: options.maxRows || 3000
    }
  );
  return result.rows
    .map(normalizeCashierTransaction)
    .filter((row) => row.id || row.externalId || row.invoiceNo || row.description || row.item);
}

function normalizeXenditQuery(runtime = {}) {
  const to = normalizeBillingDate(runtime.to) || localDateIso();
  const from = normalizeBillingDate(runtime.from) || `${to.slice(0, 8)}01`;
  return {
    from,
    to,
    tab: normalizeXenditTab(runtime.tab || runtime.view || ''),
    type: normalizeXenditType(runtime.type || ''),
    paymentMethod: normalizeXenditPaymentMethod(runtime.paymentMethod || runtime.method || ''),
    search: cleanText(runtime.search || '').toLowerCase(),
    limit: Math.max(1, Math.min(50, Number(runtime.limit || 15) || 15)),
    nextId: cleanText(runtime.nextId || runtime.nextid || '')
  };
}

async function xenditGatewayStatusUncached(config, runtime = {}) {
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const query = normalizeXenditQuery(runtime);
  const includeBalance = runtime.includeBalance !== false;
  const accountPayload = await fetchWebJson(config, session, '/api-v1/pg/xendit/data');
  const account = normalizeXenditAccount(xenditMessage(accountPayload) || {});
  if (!account.id) {
    throw new Error('Account Xendit Radboox tidak ditemukan');
  }

  const balanceResult = includeBalance
    ? await Promise.resolve()
      .then(() => fetchWebJson(config, session, `/api-v1/pg/xendit/xp-balance/${encodeURIComponent(account.id)}`))
      .then((value) => ({ status: 'fulfilled', value }))
      .catch((reason) => ({ status: 'rejected', reason }))
    : { status: 'skipped' };

  const errors = {};
  let balanceText = '';
  if (includeBalance && balanceResult.status === 'fulfilled') {
    balanceText = cleanText(xenditMessage(balanceResult.value));
  } else if (includeBalance) {
    errors.balance = balanceResult.reason?.message || 'Saldo Xendit tidak bisa dibaca';
  }

  let transactions = [];
  let nextPage = false;
  let nextId = '';
  let balanceHistory = [];
  let pending = [];
  let reports = [];
  let exportUrl = '';
  let pendingSummary = {};
  const tab = query.tab;

  if (tab === 'transactions') {
    try {
      const payload = await fetchWebJson(config, session, xenditTransactionPath(account.id, query));
      const message = xenditMessage(payload) || {};
      const rows = asArray(message, ['data', 'transactions', 'rows']);
      transactions = rows.map(normalizeXenditTransaction).filter((transaction) => transaction.id || transaction.reference || transaction.amount);
      nextPage = Boolean(message.nextpage || message.nextPage);
      nextId = cleanText(message.nextid || message.nextId);

      let cashierRows = [];
      try {
        cashierRows = await fetchCashierRowsForXendit(config, session, query, '');
        if (query.search) {
          const searchRows = await fetchCashierRowsForXendit(config, session, query, query.search, {
            limit: 100,
            maxPages: 3,
            maxRows: 300
          });
          cashierRows = mergeCashierRows(cashierRows, searchRows);
          const referenceSearches = xenditCashierSearchTerms(searchRows, query.search);
          const xenditResults = await Promise.allSettled(referenceSearches.map(async (search) => {
            const searchPayload = await fetchWebJson(config, session, xenditTransactionPath(account.id, {
              ...query,
              search,
              nextId: ''
            }));
            const searchMessage = xenditMessage(searchPayload) || {};
            return asArray(searchMessage, ['data', 'transactions', 'rows'])
              .map(normalizeXenditTransaction)
              .filter((transaction) => transaction.id || transaction.reference || transaction.amount);
          }));
          xenditResults.forEach((result) => {
            if (result.status === 'fulfilled') {
              transactions = mergeXenditTransactions(transactions, result.value);
            }
          });
        }
      } catch {
        cashierRows = [];
      }
      transactions = filterXenditRows(enrichXenditRowsWithCashier(transactions, cashierRows), query.search);
    } catch (error) {
      errors.transactions = error.message || 'Transaksi Xendit tidak bisa dibaca';
    }
  } else if (tab === 'balance') {
    try {
      const payload = await fetchWebJson(config, session, xenditBalanceHistoryPath(account.id, query));
      const message = xenditMessage(payload) || {};
      const rows = asArray(message, ['data', 'history', 'rows'])
        .map(normalizeXenditBalanceMovement)
        .filter((row) => row.id || row.dateRaw || row.amountText || row.balanceText);
      try {
        const cashierRows = await fetchCashierRowsForXendit(config, session, query, '');
        balanceHistory = enrichXenditRowsWithCashier(rows, cashierRows);
      } catch {
        balanceHistory = rows;
      }
      balanceHistory = filterXenditRows(balanceHistory, query.search);
      exportUrl = cleanText(message.url);
    } catch (error) {
      errors.balanceHistory = error.message || 'Balance history Xendit tidak bisa dibaca';
    }
  } else if (tab === 'pending') {
    try {
      const payload = await fetchWebJson(config, session, xenditPendingPath(account.id, query));
      const message = xenditMessage(payload) || {};
      const rows = asArray(message, ['data', 'pending', 'rows'])
        .map(normalizeXenditPendingMovement)
        .filter((row) => row.id || row.dateRaw || row.amountText || row.netText);
      try {
        const cashierRows = await fetchCashierRowsForXendit(config, session, query, '');
        pending = enrichXenditRowsWithCashier(rows, cashierRows);
      } catch {
        pending = rows;
      }
      pending = filterXenditRows(pending, query.search);
      exportUrl = cleanText(message.url);
      pendingSummary = summarizeXenditPending(pending, message);
    } catch (error) {
      errors.pending = error.message || 'Pending Xendit tidak bisa dibaca';
    }
  } else if (tab === 'fees') {
    try {
      const payload = await fetchWebJson(config, session, '/api-v1/account/xenplatform/report');
      reports = filterXenditRows(
        asArray(xenditMessage(payload), ['data', 'reports', 'rows'])
          .map(normalizeXenPlatformReport)
          .filter((report) => report.id || report.period || report.status),
        query.search
      );
    } catch (error) {
      errors.reports = error.message || 'Report XenPlatform tidak bisa dibaca';
    }
  }

  return {
    ok: !Object.keys(errors).some((key) => key !== 'balance'),
    mode: 'web',
    source: 'radboox-xendit',
    tab,
    canViewBalance: includeBalance,
    account: includeBalance ? publicXenditAccount(account) : null,
    balance: includeBalance ? {
      text: balanceText,
      amount: toNumber(balanceText)
    } : null,
    query,
    transactions,
    cursor: {
      nextPage,
      nextId
    },
    summary: summarizeXenditTransactions(transactions),
    balanceHistory,
    pending,
    pendingSummary,
    reports,
    exportUrl,
    errors,
    fetchedAt: new Date().toISOString()
  };
}

async function xenditGatewayStatus(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  if (!config.baseUrl && !config.apiBaseUrl) {
    throw new Error('RADBOOX_BASE_URL belum diisi');
  }
  if (!config.username || !config.password) {
    throw new Error('Username/password Radboox diperlukan untuk membaca Xendit');
  }
  const query = normalizeXenditQuery(runtime);
  const responseKey = cacheKey('xendit-gateway-status', {
    baseUrl: apiBaseUrl(config),
    username: config.username,
    includeBalance: runtime.includeBalance !== false,
    query
  });
  return cachedFetch(responseKey, runtime, () => xenditGatewayStatusUncached(config, runtime));
}

async function xenditAccountWithSession(config, runtime = {}) {
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const accountPayload = await fetchWebJson(config, session, '/api-v1/pg/xendit/data');
  const account = normalizeXenditAccount(xenditMessage(accountPayload) || {});
  if (!account.id) {
    throw new Error('Account Xendit Radboox tidak ditemukan');
  }
  return { account, session };
}

function findXenditBank(account = {}, bankIndex = '') {
  const normalizedIndex = cleanText(bankIndex);
  return (account.banks || []).find((bank) => cleanText(bank.index) === normalizedIndex) || null;
}

function xenditWithdrawMessage(payload) {
  const message = xenditMessage(payload);
  if (typeof message === 'string') return cleanText(message);
  if (message && typeof message === 'object') {
    if (typeof message.message === 'string') return cleanText(message.message);
    if (message.message && typeof message.message === 'object') return xenditWithdrawMessage(message);
  }
  return '';
}

async function requestXenditWithdraw(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const amount = toNumber(runtime.amount);
  const bankIndex = cleanText(runtime.bankIndex);
  const pin = cleanText(runtime.pin);
  if (!config.username || !config.password) {
    throw new Error('Username/password Radboox diperlukan untuk withdraw Xendit');
  }
  if (amount < 10000) {
    throw new Error('Nominal withdraw minimal Rp 10.000');
  }
  if (bankIndex === '') {
    throw new Error('Bank withdraw belum dipilih');
  }
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('PIN Xendit wajib 4-6 digit angka');
  }

  const { account, session } = await xenditAccountWithSession(config, runtime);
  const bank = findXenditBank(account, bankIndex);
  if (!bank || !bank.accountNumber) {
    throw new Error('Rekening tujuan withdraw tidak ditemukan');
  }

  let balanceText = '';
  try {
    const balancePayload = await fetchWebJson(config, session, `/api-v1/pg/xendit/xp-balance/${encodeURIComponent(account.id)}`);
    balanceText = cleanText(xenditMessage(balancePayload));
  } catch (error) {
    throw new Error(`Saldo Xendit tidak bisa dicek sebelum withdraw: ${error.message || 'Radboox tidak merespons'}`);
  }
  const balanceAmount = toNumber(balanceText);
  const reserveAmount = XENDIT_WITHDRAW_RESERVE_AMOUNT;
  const availableAmount = Math.max(0, balanceAmount - reserveAmount);
  if (amount > availableAmount) {
    throw new Error(`Nominal withdraw melebihi saldo tersedia. ${formatRupiah(availableAmount)} available setelah menyisakan ${formatRupiah(reserveAmount)}.`);
  }

  const payload = await postWebJson(config, session, `/api-v1/pg/xendit/xp-withdraw/${encodeURIComponent(account.id)}`, {
    pin,
    amount: String(Math.round(amount)),
    bankIndex: bank.index,
    number: bank.accountNumber
  });
  const message = xenditMessage(payload) || {};
  const result = message && typeof message === 'object' ? message : {};
  return {
    ok: true,
    mode: 'web',
    action: 'withdraw-request',
    amount: toNumber(result.amount || amount),
    balanceAmount,
    reserveAmount,
    availableAmount,
    bank: cleanText(result.bank || bank.bank),
    accountName: cleanText(result.name || bank.accountName),
    accountNumberMasked: maskBankNumber(result.number || bank.accountNumber),
    sign: cleanText(result.sign),
    message: 'OTP withdraw Xendit sudah diminta'
  };
}

async function verifyXenditWithdraw(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const otp = cleanText(runtime.otp);
  const sign = cleanText(runtime.sign);
  if (!config.username || !config.password) {
    throw new Error('Username/password Radboox diperlukan untuk verifikasi withdraw Xendit');
  }
  if (!/^\d{6}$/.test(otp)) {
    throw new Error('OTP withdraw wajib 6 digit angka');
  }
  if (!sign) {
    throw new Error('Token verifikasi withdraw tidak tersedia');
  }
  const { account, session } = await xenditAccountWithSession(config, runtime);
  const payload = await postWebJson(config, session, `/api-v1/pg/xendit/verify-xp-withdraw/${encodeURIComponent(account.id)}`, {
    otp,
    sign
  });
  return {
    ok: true,
    mode: 'web',
    action: 'withdraw-verify',
    message: xenditWithdrawMessage(payload) || 'Withdraw Xendit berhasil diverifikasi'
  };
}

async function listBillingMembers(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const page = Math.max(1, Number(runtime.page || 1) || 1);
  const limit = Math.max(1, Math.min(25, Number(runtime.limit || 5) || 5));
  const search = cleanText(runtime.search || '');
  const status = cleanText(runtime.status || '');
  const paymentType = cleanText(runtime.paymentType || runtime.type || '');
  const billingPeriod = cleanText(runtime.billingPeriod || runtime.paymentMethod || runtime.payment_method || '');
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    search
  });
  if (paymentType && paymentType !== 'all') {
    query.set('type', paymentType);
  }
  if (billingPeriod && billingPeriod !== 'all') {
    query.set('payment_method', billingPeriod);
  }
  if (status && status !== 'all') {
    query.set('status', status);
  }
  const payload = await fetchWebJson(config, session, `/api-v1/billing/member/data?${query.toString()}`);
  const result = billingMemberRows(payload);
  return {
    ok: true,
    mode: 'web',
    page,
    limit,
    search,
    status,
    paymentType,
    billingPeriod,
    members: result.rows,
    totalRows: result.totalRows,
    raw: result.raw
  };
}

async function listCashierTransactions(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const page = Math.max(1, Number(runtime.page || 1) || 1);
  const limit = Math.max(1, Math.min(100, Number(runtime.limit || 10) || 10));
  const from = normalizeDate(runtime.from || runtime.start || localDateIso());
  const to = normalizeDate(runtime.to || runtime.end || from);
  const method = cashierTransactionMethod(runtime.method);
  const search = cleanText(runtime.search || '');
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);

  const dataPath = cashierTransactionDataPath({ page, limit, from, to, method, search });
  const payload = await fetchWebJson(config, session, dataPath);
  const source = objectFromPayload(payload);
  const rows = asArray(source, ['data', 'rows', 'items', 'transactions', 'records']).map(normalizeCashierTransaction);
  const totalRows = dataPayloadTotal(payload, rows.length);
  const pageAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const summaryLimit = 500;
  const summaryRows = [];
  const summaryPages = totalRows ? Math.min(20, Math.max(1, Math.ceil(totalRows / summaryLimit))) : 1;

  for (let summaryPage = 1; summaryPage <= summaryPages; summaryPage += 1) {
    try {
      const summaryPayload = summaryPage === page && limit === summaryLimit
        ? payload
        : await fetchWebJson(config, session, cashierTransactionDataPath({
          page: summaryPage,
          limit: summaryLimit,
          from,
          to,
          method,
          search
        }));
      const summarySource = objectFromPayload(summaryPayload);
      const summaryPageRows = asArray(summarySource, ['data', 'rows', 'items', 'transactions', 'records']).map(normalizeCashierTransaction);
      summaryRows.push(...summaryPageRows);
      if (!summaryPageRows.length || summaryPageRows.length < summaryLimit) break;
    } catch {
      break;
    }
  }

  let topInfo = {};
  try {
    const topInfoPayload = await fetchWebJson(config, session, cashierTopInfoPath({ from, to }));
    const topInfoSource = detailSource(topInfoPayload);
    topInfo = {
      totalAmount: toNumber(pick(topInfoSource, ['profit', 'total', 'total_amount', 'totalAmount', 'income', 'pemasukan'])),
      totalPaid: toNumber(pick(topInfoSource, ['total_invoice_paid', 'totalInvoicePaid', 'count', 'total_count', 'transaction_count', 'transactionCount']))
    };
  } catch {
    topInfo = {};
  }
  const totalAmount = summaryRows.length
    ? summaryRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    : pageAmount;
  const summary = {
    totalAmount,
    pageAmount,
    totalPaid: totalRows || summaryRows.length || rows.length,
    topInfo
  };

  return {
    ok: true,
    mode: 'web',
    page,
    limit,
    from,
    to,
    method,
    search,
    transactions: rows,
    totalRows,
    summary,
    raw: payload
  };
}

function memberIdFromRuntime(runtime = {}) {
  const memberId = cleanText(runtime.memberId || runtime.idMember || runtime.id_member || runtime.id);
  if (!memberId) {
    throw new Error('ID member Radboox tidak tersedia');
  }
  return memberId;
}

function paymentTypeCode(value) {
  const text = cleanText(value).toLowerCase();
  if (['1', 'postpaid', 'post paid'].includes(text)) return 1;
  if (['2', 'prepaid', 'pre paid'].includes(text)) return 2;
  throw new Error('Tipe pembayaran harus Postpaid atau Prepaid');
}

function billingPeriodCode(value) {
  const text = cleanText(value).toLowerCase();
  if (['1', 'fixed', 'fixed-date', 'fixed date'].includes(text)) return 1;
  if (['2', 'cycle', 'billing-cycle', 'billing cycle'].includes(text)) return 2;
  if (['3', 'renewal', 'renew'].includes(text)) return 3;
  throw new Error('Periode billing harus Fixed, Cycle, atau Renewal');
}

function radbooxMutationMessage(payload, fallback) {
  const message = payload && typeof payload === 'object' ? payload.message : payload;
  if (typeof message === 'string') return cleanText(message) || fallback;
  if (message && typeof message === 'object') {
    if (typeof message.message === 'string') return cleanText(message.message) || fallback;
    if (typeof message.text === 'string') return cleanText(message.text) || fallback;
  }
  return fallback;
}

function memberContactMutationCandidates(memberId, payload) {
  const id = encodeURIComponent(memberId);
  const withMemberId = {
    ...payload,
    id: memberId,
    member_id: memberId,
    id_member: memberId,
    fullname: payload.full_name,
    whatsapp: payload.wa
  };
  return [
    { method: 'PUT', path: `/api-v1/billing/member/contact-detail/${id}`, payload },
    { method: 'POST', path: `/api-v1/billing/member/contact-detail/${id}`, payload },
    { method: 'PUT', path: `/api-v1/billing/member/${id}/contact-detail`, payload },
    { method: 'POST', path: `/api-v1/billing/member/${id}/contact-detail`, payload },
    { method: 'PUT', path: `/api-v1/billing/member/contact/${id}`, payload },
    { method: 'POST', path: `/api-v1/billing/member/contact/${id}`, payload },
    { method: 'PUT', path: `/api-v1/billing/member/update-contact/${id}`, payload },
    { method: 'POST', path: `/api-v1/billing/member/update-contact/${id}`, payload },
    { method: 'PUT', path: '/api-v1/billing/member/contact-detail', payload: withMemberId },
    { method: 'POST', path: '/api-v1/billing/member/contact-detail', payload: withMemberId },
    { method: 'PUT', path: '/api-v1/billing/member/contact', payload: withMemberId },
    { method: 'POST', path: '/api-v1/billing/member/contact', payload: withMemberId },
    { method: 'PUT', path: '/api-v1/billing/member/update-contact', payload: withMemberId },
    { method: 'POST', path: '/api-v1/billing/member/update-contact', payload: withMemberId }
  ];
}

function billingDateDisplay(value) {
  const text = cleanText(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function compactPaymentPayload(payload) {
  const next = { ...payload };
  if (!next.ppn) delete next.ppn;
  if (!next.discount) delete next.discount;
  return next;
}

function paymentPayloadVariants(payload) {
  const variants = [];
  const seen = new Set();
  const add = (candidate) => {
    const key = stableStringify(candidate);
    if (!seen.has(key)) {
      seen.add(key);
      variants.push(candidate);
    }
  };
  const stringPayload = {
    ...payload,
    payment_type: String(payload.payment_type),
    billing_period: String(payload.billing_period)
  };
  const displayDate = billingDateDisplay(payload.next_due);
  add(payload);
  add(compactPaymentPayload(payload));
  add(stringPayload);
  add(compactPaymentPayload(stringPayload));
  if (displayDate && displayDate !== payload.next_due) {
    add({ ...payload, next_due: displayDate });
    add(compactPaymentPayload({ ...payload, next_due: displayDate }));
    add({ ...stringPayload, next_due: displayDate });
    add(compactPaymentPayload({ ...stringPayload, next_due: displayDate }));
  }
  return variants;
}

function memberPaymentMutationCandidates(memberId, payload) {
  const id = encodeURIComponent(memberId);
  const withMemberId = {
    ...payload,
    id: memberId,
    member_id: memberId,
    id_member: memberId
  };
  const variants = paymentPayloadVariants(payload);
  return [
    ...variants.map((variant) => ({ method: 'PUT', path: `/api-v1/billing/member/payment-detail/${id}`, payload: variant })),
    { method: 'POST', path: `/api-v1/billing/member/payment-detail/${id}`, payload },
    { method: 'PUT', path: `/api-v1/billing/member/${id}/payment-detail`, payload },
    { method: 'POST', path: `/api-v1/billing/member/${id}/payment-detail`, payload },
    { method: 'PUT', path: `/api-v1/billing/member/payment/${id}`, payload },
    { method: 'POST', path: `/api-v1/billing/member/payment/${id}`, payload },
    { method: 'PUT', path: `/api-v1/billing/member/update-payment/${id}`, payload },
    { method: 'POST', path: `/api-v1/billing/member/update-payment/${id}`, payload },
    { method: 'PUT', path: '/api-v1/billing/member/payment-detail', payload: withMemberId },
    { method: 'POST', path: '/api-v1/billing/member/payment-detail', payload: withMemberId },
    { method: 'PUT', path: '/api-v1/billing/member/payment', payload: withMemberId },
    { method: 'POST', path: '/api-v1/billing/member/payment', payload: withMemberId },
    { method: 'PUT', path: '/api-v1/billing/member/update-payment', payload: withMemberId },
    { method: 'POST', path: '/api-v1/billing/member/update-payment', payload: withMemberId }
  ];
}

async function getBillingMemberContactDetail(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const memberId = memberIdFromRuntime(runtime);
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const payload = await fetchWebJson(config, session, `/api-v1/billing/member/contact-detail/${encodeURIComponent(memberId)}`);
  return {
    ok: true,
    mode: 'web',
    memberId,
    contact: normalizeBillingMemberContact(payload),
    raw: payload
  };
}

async function getBillingMemberPaymentDetail(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const memberId = memberIdFromRuntime(runtime);
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const payload = await fetchWebJson(config, session, `/api-v1/billing/member/payment-detail/${encodeURIComponent(memberId)}`);
  return {
    ok: true,
    mode: 'web',
    memberId,
    payment: normalizeBillingMemberPayment(payload),
    raw: payload
  };
}

async function updateBillingMemberContactDetail(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const memberId = memberIdFromRuntime(runtime);
  const fullName = cleanText(runtime.fullName || runtime.full_name);
  const payload = {
    full_name: fullName,
    wa: cleanText(runtime.wa || runtime.whatsapp),
    email: cleanText(runtime.email),
    ktp: cleanText(runtime.ktp),
    address: cleanText(runtime.address)
  };
  if (!payload.full_name) {
    throw new Error('Nama lengkap member wajib diisi');
  }
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  let result;
  try {
    ({ payload: result } = await mutateFirstWebJson(
      config,
      session,
      memberContactMutationCandidates(memberId, payload),
      { label: 'update contact detail member Radboox' }
    ));
  } catch (error) {
    if (Number(error.status) !== 400 || !/failed edit contact/i.test(`${error.message || ''} ${error.bodySample || ''}`)) {
      throw error;
    }
    const currentPayload = await fetchWebJson(config, session, `/api-v1/billing/member/contact-detail/${encodeURIComponent(memberId)}`);
    const current = normalizeBillingMemberContact(currentPayload);
    const sameContact = cleanText(current.fullName) === payload.full_name
      && cleanText(current.whatsapp) === payload.wa
      && cleanText(current.email) === payload.email
      && cleanText(current.ktp) === payload.ktp
      && cleanText(current.address) === payload.address;
    if (!sameContact) {
      throw error;
    }
    result = { status: 'success', message: 'Contact detail member Radboox sudah sesuai' };
  }
  return {
    ok: true,
    mode: 'web',
    memberId,
    message: radbooxMutationMessage(result, 'Contact detail member Radboox berhasil diperbarui'),
    contact: normalizeBillingMemberContact({ message: { ...payload, fullname: payload.full_name, whatsapp: payload.wa } }),
    raw: result
  };
}

async function updateBillingMemberPaymentDetail(settings, runtime = {}) {
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const memberId = memberIdFromRuntime(runtime);
  const nextDue = normalizeBillingDate(runtime.nextDue || runtime.next_due || runtime.dueDate || runtime.due_date);
  const ppn = toNumber(runtime.ppn);
  const discount = toNumber(runtime.discount);
  if (!nextDue) {
    throw new Error('Tanggal invoice berikutnya wajib diisi');
  }
  const payload = {
    payment_type: paymentTypeCode(runtime.paymentType || runtime.payment_type),
    billing_period: billingPeriodCode(runtime.billingPeriod || runtime.billing_period),
    next_due: nextDue,
    ppn: ppn > 0 ? String(ppn) : '',
    discount: discount > 0 ? String(discount) : ''
  };
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const { payload: result } = await mutateFirstWebJson(
    config,
    session,
    memberPaymentMutationCandidates(memberId, payload),
    { label: 'update payment detail member Radboox', validationFallback: true }
  );
  return {
    ok: true,
    mode: 'web',
    memberId,
    message: radbooxMutationMessage(result, 'Payment detail member Radboox berhasil diperbarui'),
    payment: normalizeBillingMemberPayment({ message: payload }),
    raw: result
  };
}

async function previewManualInvoice(settings, runtime = {}) {
  const memberId = cleanText(runtime.memberId || runtime.idMember || runtime.id_member);
  const subPeriod = String(Math.max(1, Math.min(12, Number(runtime.subPeriod || runtime.sub_period || 1) || 1)));
  if (!memberId) {
    throw new Error('ID member Radboox tidak tersedia untuk preview invoice');
  }
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const payload = await fetchWebJson(config, session, `/api-v1/billing/invoice/generate/${encodeURIComponent(memberId)}?sub_period=${encodeURIComponent(subPeriod)}`);
  const preview = invoicePreviewFromPayload(payload);
  return {
    ok: true,
    mode: 'web',
    memberId,
    subPeriod,
    preview,
    raw: payload
  };
}

async function generateManualInvoice(settings, runtime = {}) {
  const memberId = cleanText(runtime.memberId || runtime.idMember || runtime.id_member);
  const subPeriod = String(Math.max(1, Math.min(12, Number(runtime.subPeriod || runtime.sub_period || 1) || 1)));
  if (!memberId) {
    throw new Error('ID member Radboox tidak tersedia untuk buat invoice');
  }
  const config = mergeConfig(settings, { ...runtime, mode: 'web' });
  const session = await webSession(config, runtime);
  await refreshWebTokenBestEffort(config, session);
  const payload = await postWebJson(config, session, '/api-v1/billing/invoice/generate', {
    id_member: memberId,
    sub_period: subPeriod
  });

  return {
    ok: true,
    mode: 'web',
    action: 'manual-invoice',
    memberId,
    subPeriod,
    message: radbooxSuccessMessage(payload, 'Invoice manual berhasil dibuat via Radboox'),
    raw: payload
  };
}

async function syncViaWeb(config) {
  if (!config.baseUrl && !config.apiBaseUrl) {
    throw new Error('RADBOOX_BASE_URL belum diisi');
  }
  const session = await webLogin(config);
  await refreshWebTokenBestEffort(config, session);

  async function fetchWeb(path) {
    return fetchWebJson(config, session, path);
  }

  const [customersPayload, invoicesPayload] = await Promise.all([
    fetchWeb(config.webCustomersPath),
    fetchWeb(config.webInvoicesPath)
  ]);

  const customerRows = typeof customersPayload === 'string'
    ? (parseHtmlTables(customersPayload)[0] || [])
    : asArray(customersPayload, ['customers', 'users']);
  const invoiceRows = typeof invoicesPayload === 'string'
    ? (parseHtmlTables(invoicesPayload)[0] || [])
    : asArray(invoicesPayload, ['invoices', 'billing']);

  return {
    customers: customerRows.map(normalizeCustomer).filter((customer) => customer.username || customer.name),
    invoices: invoiceRows.map(normalizeInvoice).filter((invoice) => invoice.username || invoice.customerExternalId || invoice.customerName)
  };
}

async function syncRadboox(settings, runtime = {}) {
  const config = mergeConfig(settings, runtime);
  const mode = String(config.mode || '').toLowerCase();

  const result = mode === 'web'
    ? await syncViaWeb(config)
    : await syncViaApi(config);

  return {
    mode,
    customerCount: result.customers.length,
    invoiceCount: result.invoices.length,
    customers: result.customers,
    invoices: result.invoices
  };
}

async function syncMonthlyEarning(settings, runtime = {}) {
  const config = mergeConfig(settings, runtime);
  const mode = String(config.mode || '').toLowerCase();
  const period = normalizePeriod(runtime.period);
  let earningMode = mode;
  let earning;
  if (mode === 'web') {
    earning = await syncMonthlyEarningViaWeb(config, period);
  } else {
    try {
      earning = await syncMonthlyEarningViaApi(config, period);
    } catch (error) {
      if (![401, 406].includes(Number(error.status)) || !config.username || !config.password) {
        throw error;
      }
      earningMode = 'web-fallback';
      earning = await syncMonthlyEarningViaWeb({ ...config, mode: 'web' }, period);
    }
  }

  return {
    mode: earningMode,
    period,
    earning
  };
}

async function syncDailyReport(settings, runtime = {}) {
  const config = mergeConfig(settings, runtime);
  const mode = String(config.mode || '').toLowerCase();
  const date = normalizeDate(runtime.date);
  let reportMode = mode;
  let report;
  if (mode === 'web') {
    report = await syncDailyReportViaWeb(config, date, runtime);
  } else {
    try {
      report = await syncDailyReportViaApi(config, date, runtime);
    } catch (error) {
      if (![401, 406].includes(Number(error.status)) || !config.username || !config.password) {
        throw error;
      }
      reportMode = 'web-fallback';
      report = await syncDailyReportViaWeb({ ...config, mode: 'web' }, date, runtime);
    }
  }

  return {
    mode: reportMode,
    date,
    report
  };
}

function status(settings) {
  const config = mergeConfig(settings);
  const mode = String(config.mode || '').toLowerCase();
  const endpointReady = mode === 'web'
    ? Boolean(apiBaseUrl(config) && config.loginPath && config.webEarningsPath)
    : Boolean(apiBaseUrl(config) && config.earningsPath);
  const credentialReady = Boolean(config.token || (config.username && config.password));

  return {
    mode: config.mode,
    baseUrl: config.baseUrl,
    apiBaseUrl: apiBaseUrl(config),
    earningsPath: config.earningsPath,
    dailyReportPath: config.dailyReportPath,
    customersPath: config.customersPath,
    invoicesPath: config.invoicesPath,
    webEarningsPath: config.webEarningsPath,
    webDailyReportPath: config.webDailyReportPath,
    webCustomersPath: config.webCustomersPath,
    webInvoicesPath: config.webInvoicesPath,
    configured: endpointReady,
    credentialReady,
    hasToken: Boolean(config.token),
    hasWebLogin: Boolean(config.username && config.password)
  };
}

module.exports = {
  createRadiusHotspotUser,
  createRadiusPppDhcpUser,
  deleteRadiusHotspotUser,
  deleteRadiusPppDhcpUser,
  enrichInvoicesWithPppUsers,
  findInvoiceByNo,
  generateManualInvoice,
  getBillingMemberContactDetail,
  getBillingMemberPaymentDetail,
  invoiceMonitorStatus,
  isBillingInvoiceOverdue,
  listRadiusHotspot,
  listRadiusPppDhcp,
  listRadiusSettings,
  listCashierTransactions,
  listBillingMembers,
  mergeConfig,
  normalizeBillingInvoice,
  normalizeBillingMember,
  normalizePppUser,
  normalizePppSession,
  normalizeCustomer,
  normalizeDailyReport,
  normalizeMonthlyEarning,
  normalizeInvoice,
  normalizeXenditAccount,
  normalizeXenditBalanceMovement,
  normalizeXenditPendingMovement,
  normalizeXenditTransaction,
  normalizeXenPlatformReport,
  parseHtmlTables,
  payInvoice,
  previewManualInvoice,
  requestXenditWithdraw,
  rollbackInvoice,
  sendInvoiceReminder,
  status,
  syncDailyReport,
  syncMonthlyEarning,
  syncRadboox,
  updateRadiusHotspotUser,
  updateRadiusPppDhcpUser,
  updateBillingMemberContactDetail,
  updateBillingMemberPaymentDetail,
  verifyXenditWithdraw,
  xenditGatewayStatus
};
