'use strict';

const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 7000;

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeBaseUrl(value) {
  return cleanText(value).replace(/\/+$/g, '');
}

function serviceSettings(settings = {}) {
  const configured = settings.mediaServices || {};
  return {
    tvheadendUrl: normalizeBaseUrl(process.env.TVHEADEND_URL || configured.tvheadendUrl),
    tvheadendUsername: cleanText(process.env.TVHEADEND_USERNAME || configured.tvheadendUsername),
    tvheadendPassword: cleanText(process.env.TVHEADEND_PASSWORD || configured.tvheadendPassword),
    embyUrl: normalizeBaseUrl(process.env.EMBY_URL || configured.embyUrl),
    embyApiKey: cleanText(process.env.EMBY_API_KEY || configured.embyApiKey)
  };
}

function storedServiceSettings(configured = {}) {
  return {
    tvheadendUrl: normalizeBaseUrl(configured.tvheadendUrl),
    tvheadendUsername: cleanText(configured.tvheadendUsername),
    tvheadendPassword: cleanText(configured.tvheadendPassword),
    embyUrl: normalizeBaseUrl(configured.embyUrl),
    embyApiKey: cleanText(configured.embyApiKey)
  };
}

function envServiceSettings() {
  return {
    tvheadendUrl: normalizeBaseUrl(process.env.TVHEADEND_URL),
    tvheadendUsername: cleanText(process.env.TVHEADEND_USERNAME),
    tvheadendPassword: cleanText(process.env.TVHEADEND_PASSWORD),
    embyUrl: normalizeBaseUrl(process.env.EMBY_URL),
    embyApiKey: cleanText(process.env.EMBY_API_KEY)
  };
}

function mergeServiceSettings(...items) {
  return items.reduce((merged, item) => {
    for (const key of ['tvheadendUrl', 'tvheadendUsername', 'tvheadendPassword', 'embyUrl', 'embyApiKey']) {
      if (item && item[key]) {
        merged[key] = item[key];
      }
    }
    return merged;
  }, {
    tvheadendUrl: '',
    tvheadendUsername: '',
    tvheadendPassword: '',
    embyUrl: '',
    embyApiKey: ''
  });
}

function siteServiceSettings(settings = {}, target = {}, index = 0) {
  const mediaServices = settings.mediaServices || {};
  const siteServices = mediaServices.siteServices && typeof mediaServices.siteServices === 'object'
    ? mediaServices.siteServices
    : {};
  const siteConfig = storedServiceSettings(siteServices[target.id] || {});
  const targetConfig = storedServiceSettings(target.mediaServices || {});
  const legacyConfig = index === 0
    ? mergeServiceSettings(storedServiceSettings(mediaServices), envServiceSettings())
    : {};
  return mergeServiceSettings(legacyConfig, siteConfig, targetConfig);
}

function basicAuthHeader(username, password) {
  if (!username || !password) return {};
  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  };
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

function parseDigestChallenge(header = '') {
  const value = String(header || '').replace(/^Digest\s+/i, '');
  const result = {};
  const pattern = /([a-z0-9_-]+)=("([^"]*)"|([^,\s]+))/gi;
  let match;
  while ((match = pattern.exec(value))) {
    result[match[1]] = match[3] ?? match[4] ?? '';
  }
  return result;
}

function digestAuthHeader({ challenge, method, url, username, password }) {
  const parsedUrl = new URL(url);
  const uri = `${parsedUrl.pathname}${parsedUrl.search}`;
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const opaque = challenge.opaque || '';
  const algorithm = challenge.algorithm || 'MD5';
  const qops = String(challenge.qop || '').split(',').map((item) => item.trim()).filter(Boolean);
  const qop = qops.includes('auth') ? 'auth' : qops[0] || '';
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);
  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`
  ];
  if (opaque) parts.push(`opaque="${opaque}"`);
  if (qop) {
    parts.push(`qop=${qop}`);
    parts.push(`nc=${nc}`);
    parts.push(`cnonce="${cnonce}"`);
  }
  return `Digest ${parts.join(', ')}`;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const method = options.method || 'GET';
    const requestOptions = {
      method,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    };
    let response = await fetch(url, requestOptions);
    const challenge = response.headers.get('www-authenticate') || '';
    if (
      response.status === 401 &&
      /^Digest/i.test(challenge) &&
      options.digestAuth?.username &&
      options.digestAuth?.password
    ) {
      response = await fetch(url, {
        ...requestOptions,
        headers: {
          ...requestOptions.headers,
          Authorization: digestAuthHeader({
            challenge: parseDigestChallenge(challenge),
            method,
            url,
            username: options.digestAuth.username,
            password: options.digestAuth.password
          })
        }
      });
    }
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return {
      ok: true,
      statusCode: response.status,
      payload
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        ok: false,
        statusCode: 0,
        error: 'Timeout'
      };
    }
    return {
      ok: false,
      statusCode: 0,
      error: error.message || 'Request gagal'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function embyStatus(cfg) {
  if (!cfg.embyUrl) {
    return {
      configured: false,
      online: false,
      activeSessions: 0,
      connectedSessions: 0,
      watchingSessions: [],
      sessions: [],
      checkedAt: ''
    };
  }

  if (!cfg.embyApiKey) {
    const publicInfo = await fetchJson(`${cfg.embyUrl}/System/Info/Public`);
    return {
      configured: true,
      online: publicInfo.ok,
      activeSessions: 0,
      connectedSessions: 0,
      watchingSessions: [],
      sessions: [],
      serverName: publicInfo.payload?.ServerName || '',
      version: publicInfo.payload?.Version || '',
      error: publicInfo.ok ? 'API key belum diisi, session aktif belum bisa dibaca' : publicInfo.error,
      checkedAt: new Date().toISOString()
    };
  }

  const separator = cfg.embyUrl.includes('?') ? '&' : '?';
  const result = await fetchJson(`${cfg.embyUrl}/emby/Sessions${separator}api_key=${encodeURIComponent(cfg.embyApiKey)}`);
  const sessions = Array.isArray(result.payload) ? result.payload : [];
  const normalizedSessions = sessions.map(normalizeEmbySession).filter(isRelevantEmbySession);
  const playingSessions = normalizedSessions.filter((item) => item.isPlaying);
  const transcodingSessions = sessions.filter((item) => item.TranscodingInfo);
  return {
    configured: true,
    online: result.ok,
    connectedSessions: normalizedSessions.length,
    activeSessions: playingSessions.length,
    transcodingSessions: transcodingSessions.length,
    watchingSessions: playingSessions,
    sessions: normalizedSessions,
    error: result.ok ? '' : result.error,
    checkedAt: new Date().toISOString()
  };
}

function normalizeTvheadendEntries(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.entries)) return payload.entries;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeTvheadendSubscription(item = {}) {
  return {
    id: item.id || item.uuid || '',
    userName: item.username || item.user || item.hostname || item.ip || '-',
    client: item.client || item.useragent || item.hostname || '',
    channel: item.channel || item.channelname || item.title || item.service || '-',
    profile: item.profile || item.stream || '',
    state: item.state || item.status || '',
    errors: Number(item.errors || item.error_count || 0),
    inputBps: Number(item.in || item.input || item.total_in || 0),
    outputBps: Number(item.out || item.output || item.total_out || 0),
    startedAt: item.start || item.started || item.starttime || ''
  };
}

function normalizeTvheadendConnection(item = {}) {
  return {
    id: item.id || item.uuid || '',
    userName: item.username || item.user || item.peer || item.hostname || item.ip || '-',
    peer: item.peer || item.hostname || item.ip || '',
    server: item.server || '',
    client: item.client || item.useragent || '',
    startedAt: item.started || item.start || ''
  };
}

function isRelevantTvheadendSession(session = {}) {
  const userName = cleanText(session.userName).toLowerCase();
  const peer = cleanText(session.peer).toLowerCase();
  const client = cleanText(session.client).toLowerCase();
  if (userName === '127.0.0.1' || peer === '127.0.0.1') return false;
  if (client.includes('watchdog') || client.includes('pmt-fix')) return false;
  return true;
}

function estimateEmbyStartedAt(item = {}) {
  const positionTicks = Number(item.PlayState?.PositionTicks || 0);
  if (Number.isFinite(positionTicks) && positionTicks > 0) {
    return new Date(Date.now() - Math.round(positionTicks / 10000)).toISOString();
  }
  return item.LastActivityDate || item.LastPlaybackCheckIn || '';
}

function normalizeEmbySession(item = {}) {
  const nowPlaying = item.NowPlayingItem || {};
  return {
    id: item.Id || item.DeviceId || item.SessionId || '',
    userName: item.UserName || item.UserId || '-',
    deviceName: item.DeviceName || item.DeviceId || '-',
    client: item.Client || '',
    applicationVersion: item.ApplicationVersion || '',
    remoteAddress: item.RemoteEndPoint || item.RemoteAddress || '',
    itemName: nowPlaying.Name || '',
    itemType: nowPlaying.Type || '',
    seriesName: nowPlaying.SeriesName || '',
    isPlaying: Boolean(item.NowPlayingItem),
    playMethod: item.PlayState?.PlayMethod || '',
    playPositionTicks: Number(item.PlayState?.PositionTicks || 0),
    lastActivityAt: item.LastActivityDate || item.LastPlaybackCheckIn || '',
    startedAt: estimateEmbyStartedAt(item)
  };
}

function isRelevantEmbySession(session = {}) {
  const client = cleanText(session.client).toLowerCase();
  const deviceName = cleanText(session.deviceName).toLowerCase();
  const userName = cleanText(session.userName);
  if (client === 'fake.net ops' || deviceName === 'fake.net ops monitoring') return false;
  if (client === 'emby server dlna') return false;
  if (!userName || userName === '-') return false;
  return true;
}

async function tvheadendStatus(cfg) {
  if (!cfg.tvheadendUrl) {
    return {
      configured: false,
      online: false,
      activeSubscriptions: 0,
      activeConnections: 0,
      subscriptions: [],
      connections: [],
      checkedAt: ''
    };
  }

  const headers = basicAuthHeader(cfg.tvheadendUsername, cfg.tvheadendPassword);
  const digestAuth = {
    username: cfg.tvheadendUsername,
    password: cfg.tvheadendPassword
  };
  const [subscriptionsResult, connectionsResult] = await Promise.all([
    fetchJson(`${cfg.tvheadendUrl}/api/status/subscriptions`, { headers, digestAuth }),
    fetchJson(`${cfg.tvheadendUrl}/api/status/connections`, { headers, digestAuth })
  ]);
  const subscriptions = normalizeTvheadendEntries(subscriptionsResult.payload)
    .map(normalizeTvheadendSubscription)
    .filter(isRelevantTvheadendSession);
  const connections = normalizeTvheadendEntries(connectionsResult.payload)
    .map(normalizeTvheadendConnection)
    .filter(isRelevantTvheadendSession);
  const online = subscriptionsResult.ok || connectionsResult.ok;
  const errors = [subscriptionsResult, connectionsResult]
    .filter((result) => !result.ok)
    .map((result) => result.error)
    .filter(Boolean);

  return {
    configured: true,
    online,
    activeSubscriptions: subscriptions.length,
    activeConnections: connections.length,
    subscriptions,
    connections,
    hasLogin: Boolean(cfg.tvheadendUsername && cfg.tvheadendPassword),
    error: online ? errors.join(', ') : (errors.join(', ') || 'TVHeadend tidak merespons'),
    checkedAt: new Date().toISOString()
  };
}

async function servicesStatus(settings = {}) {
  const cfg = serviceSettings(settings);
  const [tvheadend, emby] = await Promise.all([
    tvheadendStatus(cfg),
    embyStatus(cfg)
  ]);

  return {
    tvheadend: {
      name: 'TVHeadend',
      url: cfg.tvheadendUrl,
      ...tvheadend
    },
    emby: {
      name: 'Emby',
      url: cfg.embyUrl,
      ...emby
    },
    checkedAt: new Date().toISOString()
  };
}

async function siteServicesStatus(settings = {}, targets = []) {
  const activeTargets = (targets || [])
    .filter((target) => target && target.status !== 'inactive' && cleanText(target.host));
  const sites = await Promise.all(activeTargets.map(async (target, index) => {
    const cfg = siteServiceSettings(settings, target, index);
    const [tvheadend, emby] = await Promise.all([
      tvheadendStatus(cfg),
      embyStatus(cfg)
    ]);
    return {
      id: target.id,
      name: target.name,
      host: target.host,
      location: target.location || '',
      tvheadend: {
        name: 'TVHeadend',
        url: cfg.tvheadendUrl,
        ...tvheadend
      },
      emby: {
        name: 'Emby',
        url: cfg.embyUrl,
        ...emby
      }
    };
  }));
  const summary = sites.reduce((totals, site) => {
    totals.siteCount += 1;
    if (site.tvheadend.configured) totals.configuredServices += 1;
    if (site.emby.configured) totals.configuredServices += 1;
    if (site.tvheadend.online) totals.onlineServices += 1;
    if (site.emby.online) totals.onlineServices += 1;
    totals.tvheadendStreams += Number(site.tvheadend.activeSubscriptions || 0);
    totals.tvheadendConnections += Number(site.tvheadend.activeConnections || 0);
    totals.embyActiveSessions += Number(site.emby.activeSessions || 0);
    totals.embyConnectedSessions += Number(site.emby.connectedSessions || 0);
    totals.embyTranscodingSessions += Number(site.emby.transcodingSessions || 0);
    return totals;
  }, {
    siteCount: 0,
    configuredServices: 0,
    onlineServices: 0,
    tvheadendStreams: 0,
    tvheadendConnections: 0,
    embyActiveSessions: 0,
    embyConnectedSessions: 0,
    embyTranscodingSessions: 0
  });

  return {
    sourceMode: 'per-site',
    summary,
    sites,
    checkedAt: new Date().toISOString()
  };
}

module.exports = {
  servicesStatus,
  siteServicesStatus
};
