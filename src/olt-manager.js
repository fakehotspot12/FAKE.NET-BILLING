'use strict';

const DEFAULT_TIMEOUT_MS = 12000;
const LIVE_SUMMARY_CACHE_MS = 5000;
const tokenCache = new Map();
const liveSummaryCache = new Map();

function cleanText(value) {
  return String(value || '').trim();
}

function clampNumber(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function joinUrl(baseUrl, apiPath) {
  const base = cleanText(baseUrl).replace(/\/+$/g, '');
  const path = cleanText(apiPath).replace(/^\/+/g, '');
  return `${base}/${path}`;
}

function withQuery(baseUrl, params = {}) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function managerSettings(settings = {}) {
  const configured = settings.oltManager || {};
  return {
    baseUrl: cleanText(process.env.OLT_MANAGER_BASE_URL || configured.baseUrl || ''),
    loginPath: cleanText(configured.loginPath || '/api/auth/login'),
    summaryPath: cleanText(configured.summaryPath || '/api/dashboard/summary'),
    onlineOnusPath: cleanText(configured.onlineOnusPath || '/api/dashboard/online-onus'),
    lowRxOnusPath: cleanText(configured.lowRxOnusPath || '/api/dashboard/low-rx-onus'),
    token: cleanText(process.env.OLT_MANAGER_TOKEN || configured.token),
    username: cleanText(process.env.OLT_MANAGER_USERNAME || configured.username),
    password: cleanText(process.env.OLT_MANAGER_PASSWORD || configured.password)
  };
}

function status(settings = {}) {
  const cfg = managerSettings(settings);
  const hasToken = Boolean(cfg.token);
  const hasLogin = Boolean(cfg.username && cfg.password);
  return {
    baseUrl: cfg.baseUrl,
    configured: Boolean(cfg.baseUrl && (hasToken || hasLogin)),
    hasToken,
    hasLogin,
    mode: 'live-readonly'
  };
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `OLT Manager HTTP ${response.status}`);
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Timeout akses OLT Manager ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function login(settings = {}, force = false) {
  const cfg = managerSettings(settings);
  if (cfg.token) return cfg.token;
  if (!cfg.baseUrl || !cfg.username || !cfg.password) {
    throw new Error('Koneksi OLT Manager belum dikonfigurasi');
  }

  const cacheKey = `${cfg.baseUrl}|${cfg.username}`;
  const cached = tokenCache.get(cacheKey);
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const payload = await requestJson(joinUrl(cfg.baseUrl, cfg.loginPath), {
    method: 'POST',
    body: {
      username: cfg.username,
      password: cfg.password,
      remember: true
    }
  });
  if (!payload.token) {
    throw new Error('Login OLT Manager tidak mengembalikan token');
  }
  tokenCache.set(cacheKey, {
    token: payload.token,
    expiresAt: Date.now() + 10 * 60 * 60 * 1000
  });
  return payload.token;
}

async function authedGet(settings = {}, apiPath, params = {}) {
  const cfg = managerSettings(settings);
  let token = await login(settings);
  const url = withQuery(joinUrl(cfg.baseUrl, apiPath), params);
  try {
    return await requestJson(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    if (!cfg.token && /401|unauthorized|invalid token/i.test(error.message || '')) {
      token = await login(settings, true);
      return requestJson(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    }
    throw error;
  }
}

function normalizeOnu(item = {}) {
  return {
    id: item.id || `${item.olt_id || ''}-${item.sn || ''}-${item.onu_id || ''}`,
    customer: item.description || item.ppp_username || item.sn || '-',
    username: item.ppp_username || '',
    sn: item.sn || '',
    status: item.status || '',
    oltId: item.olt_id || '',
    oltName: item.olt_name || '',
    vendor: item.olt_vendor || item.vendor || '',
    slot: item.slot ?? '',
    pon: item.pon ?? '',
    onuId: item.onu_id ?? '',
    rxPower: item.rx_power || '',
    txPower: item.tx_power || '',
    distance: item.distance || '',
    lastSeen: item.last_seen || item.discovered_at || '',
    source: item.source || 'database'
  };
}

function normalizeOltSummary(item = {}) {
  return {
    id: item.id || '',
    name: item.name || '-',
    vendor: item.vendor || '',
    host: item.host || '',
    online: Number(item.online || 0),
    offline: Number(item.offline || 0),
    unregistered: Number(item.unregistered || 0),
    totalOnu: Number(item.total_onu || item.totalOnu || 0),
    source: item.source || 'database',
    snmpStatus: item.snmp_status || '',
    uptimeText: item.uptime_text || '',
    temperatureC: item.temperature_c ?? null,
    temperatureStatus: item.temperature_status || '',
    error: item.error || ''
  };
}

function summaryPayload(summary = {}) {
  const sites = Array.isArray(summary.olt_summaries)
    ? summary.olt_summaries.map(normalizeOltSummary)
    : [];
  const online = Number(summary.onu_online || 0);
  const offline = Number(summary.onu_offline || 0);
  const unregistered = Number(summary.onu_unregistered || 0);
  return {
    siteCount: Number(summary.total_olt || sites.length || 0),
    totalOnu: Number(summary.onu_total || summary.total_onu || online + offline + unregistered),
    online,
    offline,
    unregistered,
    lowRx: Number(summary.onu_low_rx_power || 0),
    recentRegistered: Number(summary.onu_recent_registered || 0),
    lossOffline: Number(summary.onu_loss || 0),
    powerOffline: Number(summary.onu_power_offline || 0),
    unknownOffline: Number(summary.onu_offline_unknown || 0),
    sourceMode: summary.source_mode || summary.requested_source || 'database',
    generatedAt: summary.generated_at || '',
    cache: summary.cache || null,
    sites
  };
}

async function liveSummary(settings = {}, options = {}) {
  const cfg = managerSettings(settings);
  const cacheKey = `${cfg.baseUrl}|live-summary`;
  const cached = liveSummaryCache.get(cacheKey);
  if (!options.force && cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }
  const payload = await authedGet(settings, cfg.summaryPath, {
    source: 'live',
    refresh: '1',
    cache: 'false'
  });
  liveSummaryCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + LIVE_SUMMARY_CACHE_MS
  });
  return payload;
}

async function customerMonitoring(settings = {}, options = {}) {
  const cfg = managerSettings(settings);
  const info = status(settings);
  if (!info.configured) {
    return {
      ok: false,
      configured: false,
      status: info,
      error: 'Koneksi OLT Manager belum dikonfigurasi',
      summary: summaryPayload({}),
      onlineOnus: { items: [], page: 1, totalPages: 1, total: 0, pageSize: 20 },
      lowRxOnus: []
    };
  }

  const page = clampNumber(options.page, 1, 1, 9999);
  const limit = clampNumber(options.limit, 20, 5, 100);
  const lowRxLimit = clampNumber(options.lowRxLimit, 8, 1, 25);
  const q = cleanText(options.search || options.q);
  const baseParams = {
    page,
    limit,
    q
  };

  const [summary, onlineOnus, lowRxOnus] = await Promise.all([
    liveSummary(settings, { force: options.force }),
    authedGet(settings, cfg.onlineOnusPath, baseParams),
    authedGet(settings, cfg.lowRxOnusPath, {
      page: 1,
      limit: lowRxLimit,
      q
    })
  ]);

  return {
    ok: true,
    configured: true,
    status: info,
    managerUrl: cfg.baseUrl,
    realtime: true,
    summary: summaryPayload(summary),
    onlineOnus: {
      items: Array.isArray(onlineOnus.items) ? onlineOnus.items.map(normalizeOnu) : [],
      page: Number(onlineOnus.page || page),
      totalPages: Number(onlineOnus.total_pages || 1),
      total: Number(onlineOnus.total || 0),
      pageSize: Number(onlineOnus.page_size || limit),
      source: 'database-snapshot',
      filterOptions: onlineOnus.filter_options || {}
    },
    lowRxOnus: Array.isArray(lowRxOnus.items) ? lowRxOnus.items.map(normalizeOnu) : []
  };
}

module.exports = {
  customerMonitoring,
  status
};
