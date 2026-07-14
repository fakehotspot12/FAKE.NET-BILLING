'use strict';

const { spawn } = require('child_process');
const redisCache = require('./redis-cache');

const SESSION_CACHE_KEY = process.env.RADIUS_SESSION_CACHE_KEY || 'fakenet:radius:sessions:last';
const SESSION_CACHE_TTL_SECONDS = Math.max(60, Number(process.env.RADIUS_SESSION_CACHE_TTL_SECONDS || 300) || 300);
const DEFAULT_SESSION_STALE_SECONDS = 30 * 60;

function enabled() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.FREERADIUS_SYNC_ENABLED || '').toLowerCase());
}

function databaseUrl() {
  return process.env.FREERADIUS_DATABASE_URL || process.env.FREERADIUS_DB_URL || '';
}

function configured() {
  return Boolean(databaseUrl());
}

function clampLimit(value, fallback = 1000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(5000, Math.trunc(number)));
}

function sessionStaleSeconds() {
  const explicitSeconds = Number(process.env.RADIUS_SESSION_STALE_SECONDS);
  if (Number.isFinite(explicitSeconds)) {
    return Math.max(0, Math.trunc(explicitSeconds));
  }
  const explicitMinutes = Number(process.env.RADIUS_SESSION_STALE_MINUTES);
  if (Number.isFinite(explicitMinutes)) {
    return Math.max(0, Math.trunc(explicitMinutes * 60));
  }
  return DEFAULT_SESSION_STALE_SECONDS;
}

function sqlLiteral(value = '') {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function psqlJson(query) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', [
      '-X',
      '-q',
      '-t',
      '-A',
      '-d',
      databaseUrl(),
      '-c',
      query
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error((stderr || stdout || `psql keluar dengan status ${code}`).trim()));
        return;
      }
      try {
        resolve(JSON.parse((stdout || '[]').trim() || '[]'));
      } catch (error) {
        reject(new Error(`Output session FreeRADIUS tidak valid: ${error.message}`));
      }
    });
  });
}

function activeSessionsQuery(limit, columns = new Set()) {
  const rowLimit = clampLimit(limit);
  const staleSeconds = sessionStaleSeconds();
  const staleFilter = staleSeconds > 0
    ? `AND COALESCE(radacct.acctupdatetime, radacct.acctstarttime) >= (now() - (${staleSeconds} * interval '1 second'))`
    : '';
  const inputExpr = octetExpr('r', 'acctinputoctets', 'acctinputgigawords', columns);
  const outputExpr = octetExpr('r', 'acctoutputoctets', 'acctoutputgigawords', columns);
  const previousInputExpr = octetExpr('previous', 'acctinputoctets', 'acctinputgigawords', columns);
  const previousOutputExpr = octetExpr('previous', 'acctoutputoctets', 'acctoutputgigawords', columns);
  const activeTotalExpr = `(${inputExpr} + ${outputExpr})`;
  return `
WITH active_ranked AS (
  SELECT
    radacct.*,
    COUNT(*) OVER (
      PARTITION BY
        lower(COALESCE(radacct.username, '')),
        COALESCE(radacct.nasipaddress::text, ''),
        COALESCE(NULLIF(radacct.framedipaddress::text, ''), '__no_ip__'),
        COALESCE(NULLIF(radacct.callingstationid, ''), '__no_calling__'),
        COALESCE(NULLIF(radacct.calledstationid, ''), '__no_called__'),
        COALESCE(NULLIF(radacct.servicetype, ''), '__no_service__'),
        COALESCE(NULLIF(radacct.framedprotocol, ''), '__no_protocol__')
    ) AS duplicate_count,
    ROW_NUMBER() OVER (
      PARTITION BY
        lower(COALESCE(radacct.username, '')),
        COALESCE(radacct.nasipaddress::text, ''),
        COALESCE(NULLIF(radacct.framedipaddress::text, ''), '__no_ip__'),
        COALESCE(NULLIF(radacct.callingstationid, ''), '__no_calling__'),
        COALESCE(NULLIF(radacct.calledstationid, ''), '__no_called__'),
        COALESCE(NULLIF(radacct.servicetype, ''), '__no_service__'),
        COALESCE(NULLIF(radacct.framedprotocol, ''), '__no_protocol__')
      ORDER BY COALESCE(radacct.acctupdatetime, radacct.acctstarttime) DESC, radacct.acctstarttime DESC, radacct.radacctid DESC
    ) AS active_rank
  FROM radacct
  WHERE radacct.acctstoptime IS NULL
    ${staleFilter}
)
SELECT COALESCE(json_agg(row_to_json(active_sessions)), '[]'::json)::text
FROM (
  SELECT
    r.radacctid::text AS id,
    r.username,
    r.acctsessionid,
    r.acctuniqueid,
    r.nasipaddress::text AS nasipaddress,
    r.nasportid,
    r.nasporttype,
    to_char(r.acctstarttime AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_at,
    to_char(COALESCE(r.acctupdatetime, r.acctstarttime) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
    GREATEST(COALESCE(NULLIF(r.acctsessiontime, 0), EXTRACT(EPOCH FROM (now() - r.acctstarttime)))::bigint, 0) AS uptime_seconds,
    ${inputExpr} AS active_input_octets,
    ${outputExpr} AS active_output_octets,
    ${activeTotalExpr} AS active_total_octets,
    CASE WHEN ${activeTotalExpr} > 0 THEN ${inputExpr} ELSE COALESCE(last_usage.input_octets, ${inputExpr}) END AS input_octets,
    CASE WHEN ${activeTotalExpr} > 0 THEN ${outputExpr} ELSE COALESCE(last_usage.output_octets, ${outputExpr}) END AS output_octets,
    CASE WHEN ${activeTotalExpr} > 0 THEN ${activeTotalExpr} ELSE COALESCE(last_usage.total_octets, ${activeTotalExpr}) END AS total_octets,
    CASE WHEN ${activeTotalExpr} > 0 THEN 'active-accounting' WHEN last_usage.total_octets IS NOT NULL THEN 'last-stopped-session' ELSE 'none' END AS usage_source,
    to_char(last_usage.acctstoptime AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS usage_fallback_at,
    r.calledstationid,
    r.callingstationid,
    r.servicetype,
    r.framedprotocol,
    r.framedipaddress::text AS framedipaddress,
    r.framedipv6address::text AS framedipv6address,
    COALESCE(r.duplicate_count, 1)::bigint AS duplicate_count,
    GREATEST(COALESCE(r.duplicate_count, 1) - 1, 0)::bigint AS suppressed_duplicate_count
  FROM active_ranked r
  LEFT JOIN LATERAL (
    SELECT
      ${previousInputExpr} AS input_octets,
      ${previousOutputExpr} AS output_octets,
      (${previousInputExpr} + ${previousOutputExpr}) AS total_octets,
      previous.acctstoptime
    FROM radacct previous
    WHERE previous.username = r.username
      AND previous.acctstoptime IS NOT NULL
      AND (${previousInputExpr} + ${previousOutputExpr}) > 0
    ORDER BY previous.acctstoptime DESC
    LIMIT 1
  ) last_usage ON true
  WHERE r.active_rank = 1
  ORDER BY r.acctstarttime DESC
  LIMIT ${rowLimit}
) active_sessions`;
}

function firstOnlineQuery(usernames = []) {
  const values = [...new Set(usernames.map((username) => cleanText(username).toLowerCase()).filter(Boolean))]
    .slice(0, 5000);
  if (!values.length) return '';
  return `
SELECT COALESCE(json_agg(row_to_json(first_online)), '[]'::json)::text
FROM (
  SELECT
    lower(username) AS username_key,
    min(username) AS username,
    to_char(MIN(acctstarttime) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_online_at
  FROM radacct
  WHERE lower(username) IN (${values.map(sqlLiteral).join(',')})
  GROUP BY lower(username)
) first_online`;
}

function normalizedPeriod(value = '') {
  const text = cleanText(value);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function nextPeriod(period = normalizedPeriod()) {
  const [year, month] = normalizedPeriod(period).split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthlyUsageQuery(usernames = [], period = normalizedPeriod(), columns = new Set()) {
  const values = [...new Set(usernames.map((username) => cleanText(username).toLowerCase()).filter(Boolean))]
    .slice(0, 5000);
  if (!values.length) return '';
  const inputExpr = octetExpr('radacct', 'acctinputoctets', 'acctinputgigawords', columns);
  const outputExpr = octetExpr('radacct', 'acctoutputoctets', 'acctoutputgigawords', columns);
  const selectedPeriod = normalizedPeriod(period);
  const start = `${selectedPeriod}-01 00:00:00`;
  const end = `${nextPeriod(selectedPeriod)}-01 00:00:00`;
  return `
SELECT COALESCE(json_agg(row_to_json(monthly_usage)), '[]'::json)::text
FROM (
  SELECT
    lower(username) AS username_key,
    min(username) AS username,
    COALESCE(SUM(${inputExpr}), 0)::bigint AS input_octets,
    COALESCE(SUM(${outputExpr}), 0)::bigint AS output_octets,
    COALESCE(SUM(${inputExpr} + ${outputExpr}), 0)::bigint AS total_octets,
    COUNT(*)::bigint AS session_count,
    to_char(MAX(COALESCE(acctstoptime, acctupdatetime, acctstarttime)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
  FROM radacct
  WHERE lower(username) IN (${values.map(sqlLiteral).join(',')})
    AND acctstarttime >= ${sqlLiteral(start)}
    AND acctstarttime < ${sqlLiteral(end)}
  GROUP BY lower(username)
) monthly_usage`;
}

function usageHistoryQuery(username = '', period = normalizedPeriod(), limit = 40, columns = new Set()) {
  const userKey = cleanText(username).toLowerCase();
  if (!userKey) return '';
  const rowLimit = clampLimit(limit, 40);
  const inputExpr = octetExpr('radacct', 'acctinputoctets', 'acctinputgigawords', columns);
  const outputExpr = octetExpr('radacct', 'acctoutputoctets', 'acctoutputgigawords', columns);
  const selectedPeriod = normalizedPeriod(period);
  const start = `${selectedPeriod}-01 00:00:00`;
  const end = `${nextPeriod(selectedPeriod)}-01 00:00:00`;
  return `
SELECT COALESCE(json_agg(row_to_json(usage_history)), '[]'::json)::text
FROM (
  SELECT *
  FROM (
    SELECT
      radacct.radacctid::text AS id,
      radacct.username,
      radacct.acctsessionid,
      radacct.acctuniqueid,
      radacct.nasipaddress::text AS nasipaddress,
      radacct.framedipaddress::text AS framedipaddress,
      radacct.callingstationid,
      radacct.calledstationid,
      to_char(radacct.acctstarttime AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_at,
      to_char(radacct.acctstoptime AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS stopped_at,
      to_char(COALESCE(radacct.acctupdatetime, radacct.acctstoptime, radacct.acctstarttime) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
      (radacct.acctstoptime IS NULL) AS active,
      GREATEST(COALESCE(NULLIF(radacct.acctsessiontime, 0), EXTRACT(EPOCH FROM (COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now()) - radacct.acctstarttime)))::bigint, 0) AS uptime_seconds,
      ${inputExpr} AS input_octets,
      ${outputExpr} AS output_octets,
      (${inputExpr} + ${outputExpr}) AS total_octets
    FROM radacct
    WHERE lower(radacct.username) = ${sqlLiteral(userKey)}
      AND radacct.acctstarttime >= ${sqlLiteral(start)}
      AND radacct.acctstarttime < ${sqlLiteral(end)}
    ORDER BY radacct.acctstarttime DESC
    LIMIT ${rowLimit}
  ) latest_sessions
  ORDER BY started_at ASC
) usage_history`;
}

function octetExpr(alias, octetsColumn, gigawordsColumn, columns = new Set()) {
  const octets = `COALESCE(${alias}.${octetsColumn}, 0)::bigint`;
  if (!columns.has(gigawordsColumn)) return octets;
  return `((COALESCE(${alias}.${gigawordsColumn}, 0)::bigint * 4294967296) + ${octets})`;
}

async function radacctColumns() {
  const rows = await psqlJson(`
SELECT COALESCE(json_agg(column_name), '[]'::json)::text
FROM information_schema.columns
WHERE table_name = 'radacct'
  AND column_name IN ('acctinputgigawords', 'acctoutputgigawords', 'acctinputoctets', 'acctoutputoctets')
`);
  return new Set(rows.map((name) => cleanText(name).toLowerCase()).filter(Boolean));
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanInet(value) {
  return cleanText(value).replace(/\/(32|128)$/, '');
}

function formatDuration(seconds) {
  let remaining = Math.max(0, Math.trunc(numberValue(seconds)));
  const days = Math.floor(remaining / 86400);
  remaining %= 86400;
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}j`);
  if (minutes || !parts.length) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function formatBytes(value) {
  let bytes = Math.max(0, numberValue(value));
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit += 1;
  }
  const precision = unit <= 1 ? 0 : 1;
  return `${bytes.toFixed(precision)} ${units[unit]}`;
}

function normalizeSession(row = {}) {
  const activeTotalOctets = numberValue(row.active_total_octets);
  const totalOctets = numberValue(row.total_octets);
  const usageSource = cleanText(row.usage_source);
  const usingFallback = usageSource === 'last-stopped-session' && totalOctets > 0 && activeTotalOctets <= 0;
  const waitingForAccounting = !usingFallback && totalOctets <= 0 && activeTotalOctets <= 0;
  return {
    id: cleanText(row.id || row.acctuniqueid || row.acctsessionid),
    username: cleanText(row.username),
    sessionId: cleanText(row.acctsessionid),
    uniqueId: cleanText(row.acctuniqueid),
    nasIpAddress: cleanText(row.nasipaddress),
    nasPortId: cleanText(row.nasportid),
    nasPortType: cleanText(row.nasporttype),
    startedAt: cleanText(row.started_at),
    updatedAt: cleanText(row.updated_at || row.started_at),
    uptimeSeconds: numberValue(row.uptime_seconds),
    uptime: formatDuration(row.uptime_seconds),
    activeInputOctets: numberValue(row.active_input_octets),
    activeOutputOctets: numberValue(row.active_output_octets),
    activeTotalOctets,
    inputOctets: numberValue(row.input_octets),
    outputOctets: numberValue(row.output_octets),
    totalOctets,
    upload: formatBytes(row.input_octets),
    download: formatBytes(row.output_octets),
    usageText: `U ${formatBytes(row.input_octets)} / D ${formatBytes(row.output_octets)}`,
    totalUsageText: formatBytes(row.total_octets),
    usageSource,
    usageFallbackAt: cleanText(row.usage_fallback_at),
    usageNote: usingFallback
      ? 'Dari session terakhir; tunggu interim accounting aktif'
      : (waitingForAccounting ? 'Belum ada accounting update dari NAS' : ''),
    calledStationId: cleanText(row.calledstationid),
    callingStationId: cleanText(row.callingstationid),
    serviceType: cleanText(row.servicetype),
    framedProtocol: cleanText(row.framedprotocol),
    framedIpAddress: cleanInet(row.framedipaddress),
    framedIpv6Address: cleanInet(row.framedipv6address),
    duplicateCount: numberValue(row.duplicate_count),
    suppressedDuplicateCount: numberValue(row.suppressed_duplicate_count),
    status: 'online'
  };
}

function normalizeUsageHistory(row = {}) {
  const inputOctets = numberValue(row.input_octets);
  const outputOctets = numberValue(row.output_octets);
  const totalOctets = numberValue(row.total_octets);
  return {
    id: cleanText(row.id || row.acctuniqueid || row.acctsessionid),
    username: cleanText(row.username),
    sessionId: cleanText(row.acctsessionid),
    uniqueId: cleanText(row.acctuniqueid),
    nasIpAddress: cleanText(row.nasipaddress),
    framedIpAddress: cleanInet(row.framedipaddress),
    callingStationId: cleanText(row.callingstationid),
    calledStationId: cleanText(row.calledstationid),
    startedAt: cleanText(row.started_at),
    stoppedAt: cleanText(row.stopped_at),
    updatedAt: cleanText(row.updated_at || row.stopped_at || row.started_at),
    active: row.active === true || row.active === 't' || row.active === 'true',
    uptimeSeconds: numberValue(row.uptime_seconds),
    uptime: formatDuration(row.uptime_seconds),
    inputOctets,
    outputOctets,
    totalOctets,
    upload: formatBytes(inputOctets),
    download: formatBytes(outputOctets),
    totalUsageText: formatBytes(totalOctets),
    usageText: `U ${formatBytes(inputOctets)} / D ${formatBytes(outputOctets)}`
  };
}

async function cacheSessions(payload = {}) {
  if (!redisCache.enabled() || !payload.ok) return;
  try {
    await redisCache.set(SESSION_CACHE_KEY, JSON.stringify({
      ...payload,
      cachedAt: new Date().toISOString()
    }), SESSION_CACHE_TTL_SECONDS);
  } catch (error) {
    // Redis cache must never make FreeRADIUS reads fail.
  }
}

async function cachedSessions(fallbackError = '') {
  if (!redisCache.enabled()) return null;
  try {
    const raw = await redisCache.get(SESSION_CACHE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return {
      ...payload,
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-radacct-cache',
      cache: true,
      stale: true,
      error: fallbackError || payload.error || ''
    };
  } catch (error) {
    return null;
  }
}

async function activeSessions(options = {}) {
  if (!enabled()) {
    return {
      ok: false,
      enabled: false,
      configured: configured(),
      rows: [],
      error: 'FreeRADIUS SQL sync belum aktif'
    };
  }
  if (!configured()) {
    return {
      ok: false,
      enabled: true,
      configured: false,
      rows: [],
      error: 'FREERADIUS_DATABASE_URL belum diisi'
    };
  }
  try {
    const columns = await radacctColumns();
    const rows = await psqlJson(activeSessionsQuery(options.limit || 1000, columns));
    const payload = {
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-radacct',
      staleCutoffSeconds: sessionStaleSeconds(),
      rows: rows.map(normalizeSession)
    };
    await cacheSessions(payload);
    return payload;
  } catch (error) {
    if (options.allowCache !== false) {
      const cached = await cachedSessions(error.message || 'Session FreeRADIUS tidak bisa dibaca');
      if (cached) return cached;
    }
    return {
      ok: false,
      enabled: true,
      configured: true,
      rows: [],
      error: error.message || 'Session FreeRADIUS tidak bisa dibaca'
    };
  }
}

async function firstOnlineByUsernames(usernames = []) {
  const values = [...new Set((usernames || []).map((username) => cleanText(username)).filter(Boolean))];
  if (!values.length) {
    return { ok: true, enabled: enabled(), configured: configured(), source: 'freeradius-radacct', rows: [] };
  }
  if (!enabled()) {
    return {
      ok: false,
      enabled: false,
      configured: configured(),
      rows: [],
      error: 'FreeRADIUS SQL sync belum aktif'
    };
  }
  if (!configured()) {
    return {
      ok: false,
      enabled: true,
      configured: false,
      rows: [],
      error: 'FREERADIUS_DATABASE_URL belum diisi'
    };
  }
  try {
    const rows = await psqlJson(firstOnlineQuery(values));
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-radacct',
      rows: rows.map((row) => ({
        username: cleanText(row.username),
        usernameKey: cleanText(row.username_key),
        firstOnlineAt: cleanText(row.first_online_at)
      }))
    };
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      configured: true,
      rows: [],
      error: error.message || 'Session pertama FreeRADIUS tidak bisa dibaca'
    };
  }
}

async function monthlyUsageByUsernames(usernames = [], period = normalizedPeriod()) {
  const values = [...new Set((usernames || []).map((username) => cleanText(username)).filter(Boolean))];
  if (!values.length) {
    return { ok: true, enabled: enabled(), configured: configured(), source: 'freeradius-radacct', rows: [] };
  }
  if (!enabled()) {
    return {
      ok: false,
      enabled: false,
      configured: configured(),
      rows: [],
      error: 'FreeRADIUS SQL sync belum aktif'
    };
  }
  if (!configured()) {
    return {
      ok: false,
      enabled: true,
      configured: false,
      rows: [],
      error: 'FREERADIUS_DATABASE_URL belum diisi'
    };
  }
  try {
    const columns = await radacctColumns();
    const rows = await psqlJson(monthlyUsageQuery(values, period, columns));
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-radacct',
      period: normalizedPeriod(period),
      rows: rows.map((row) => ({
        username: cleanText(row.username),
        usernameKey: cleanText(row.username_key),
        inputOctets: numberValue(row.input_octets),
        outputOctets: numberValue(row.output_octets),
        totalOctets: numberValue(row.total_octets),
        upload: formatBytes(row.input_octets),
        download: formatBytes(row.output_octets),
        totalUsageText: formatBytes(row.total_octets),
        sessionCount: numberValue(row.session_count),
        lastSeenAt: cleanText(row.last_seen_at)
      }))
    };
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      configured: true,
      period: normalizedPeriod(period),
      rows: [],
      error: error.message || 'Usage bulanan FreeRADIUS tidak bisa dibaca'
    };
  }
}

async function usageHistoryByUsername(username = '', period = normalizedPeriod(), options = {}) {
  const value = cleanText(username);
  if (!value) {
    return {
      ok: true,
      enabled: enabled(),
      configured: configured(),
      source: 'freeradius-radacct',
      period: normalizedPeriod(period),
      rows: []
    };
  }
  if (!enabled()) {
    return {
      ok: false,
      enabled: false,
      configured: configured(),
      period: normalizedPeriod(period),
      rows: [],
      error: 'FreeRADIUS SQL sync belum aktif'
    };
  }
  if (!configured()) {
    return {
      ok: false,
      enabled: true,
      configured: false,
      period: normalizedPeriod(period),
      rows: [],
      error: 'FREERADIUS_DATABASE_URL belum diisi'
    };
  }
  try {
    const columns = await radacctColumns();
    const rows = await psqlJson(usageHistoryQuery(value, period, options.limit || 40, columns));
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-radacct',
      period: normalizedPeriod(period),
      rows: rows.map(normalizeUsageHistory)
    };
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      configured: true,
      period: normalizedPeriod(period),
      rows: [],
      error: error.message || 'History usage FreeRADIUS tidak bisa dibaca'
    };
  }
}

module.exports = {
  activeSessions,
  cacheKey: SESSION_CACHE_KEY,
  configured,
  enabled,
  firstOnlineByUsernames,
  monthlyUsageByUsernames,
  usageHistoryByUsername
};
