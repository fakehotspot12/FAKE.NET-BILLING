'use strict';

const { spawn } = require('child_process');
const redisCache = require('./redis-cache');

const SESSION_CACHE_KEY = process.env.RADIUS_SESSION_CACHE_KEY || 'fakenet:radius:sessions:last';
const SESSION_CACHE_TTL_SECONDS = Math.max(60, Number(process.env.RADIUS_SESSION_CACHE_TTL_SECONDS || 300) || 300);
const DEFAULT_SESSION_STALE_SECONDS = 30 * 60;
const USAGE_DAILY_TABLE = 'fakenet_radius_usage_daily';
const USAGE_15M_TABLE = 'fakenet_radius_usage_15m';
const USAGE_STATE_TABLE = 'fakenet_radius_usage_state';
const DEFAULT_USAGE_RETENTION_DAYS = 370;
const DEFAULT_USAGE_15M_RETENTION_HOURS = 72;
const DEFAULT_USAGE_DAILY_VIEW_DAYS = 31;
const RESTRICTED_SESSION_CACHE_MS = Math.max(2_000, Math.min(15_000, Number(process.env.RADIUS_RESTRICTED_SESSION_CACHE_MS || 8_000) || 8_000));
let memorySessionCache = null;
const restrictedSessionCache = new Map();

function restrictedSessionCacheKey(usernames = []) {
  return [...new Set((usernames || []).map((username) => cleanText(username).toLowerCase()).filter(Boolean))]
    .sort()
    .join('\u0000');
}

function getRestrictedSessionCache(usernames = [], maxAgeSeconds = 0) {
  const key = restrictedSessionCacheKey(usernames);
  const cached = key ? restrictedSessionCache.get(key) : null;
  const maxAgeMs = maxAgeSeconds > 0
    ? Math.min(RESTRICTED_SESSION_CACHE_MS, maxAgeSeconds * 1000)
    : RESTRICTED_SESSION_CACHE_MS;
  if (!cached || Date.now() - cached.at > maxAgeMs) {
    if (key) restrictedSessionCache.delete(key);
    return null;
  }
  return {
    ...cached.payload,
    cacheAgeSeconds: Math.max(0, Math.round((Date.now() - cached.at) / 1000)),
    source: 'freeradius-radacct-page-cache'
  };
}

function setRestrictedSessionCache(usernames = [], payload = {}) {
  const key = restrictedSessionCacheKey(usernames);
  if (!key) return;
  restrictedSessionCache.set(key, { at: Date.now(), payload });
  while (restrictedSessionCache.size > 100) {
    restrictedSessionCache.delete(restrictedSessionCache.keys().next().value);
  }
}

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

function usageTimeZone() {
  return cleanText(process.env.APP_TIME_ZONE || process.env.TZ || 'Asia/Makassar') || 'Asia/Makassar';
}

function usageRetentionDays() {
  const value = Number(process.env.RADIUS_USAGE_RETENTION_DAYS);
  if (!Number.isFinite(value)) return DEFAULT_USAGE_RETENTION_DAYS;
  return Math.max(DEFAULT_USAGE_DAILY_VIEW_DAYS, Math.min(1460, Math.trunc(value)));
}

function usageIntervalRetentionHours() {
  const value = Number(process.env.RADIUS_USAGE_15M_RETENTION_HOURS);
  if (!Number.isFinite(value)) return DEFAULT_USAGE_15M_RETENTION_HOURS;
  return Math.max(24, Math.min(168, Math.trunc(value)));
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

function cloneJson(value = {}) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function activeSessionsQuery(limit, columns = new Set(), usernames = [], options = {}) {
  const rowLimit = clampLimit(limit);
  const usernameValues = [...new Set((usernames || []).map((username) => cleanText(username).toLowerCase()).filter(Boolean))]
    .slice(0, 5000);
  const usernameFilter = usernameValues.length
    ? `AND lower(radacct.username) IN (${usernameValues.map(sqlLiteral).join(',')})`
    : '';
  const staleSeconds = options.ignoreStale ? 0 : sessionStaleSeconds();
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
    ${usernameFilter}
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

function closeSupersededSessionsQuery() {
  const staleSeconds = sessionStaleSeconds();
  if (staleSeconds <= 0) return '';
  const identity = `
        lower(COALESCE(radacct.username, '')),
        COALESCE(radacct.nasipaddress::text, ''),
        COALESCE(NULLIF(radacct.framedipaddress::text, ''), '__no_ip__'),
        COALESCE(NULLIF(radacct.callingstationid, ''), '__no_calling__'),
        COALESCE(NULLIF(radacct.calledstationid, ''), '__no_called__'),
        COALESCE(NULLIF(radacct.servicetype, ''), '__no_service__'),
        COALESCE(NULLIF(radacct.framedprotocol, ''), '__no_protocol__')`;
  const order = 'COALESCE(radacct.acctupdatetime, radacct.acctstarttime) DESC, radacct.acctstarttime DESC, radacct.radacctid DESC';
  return `
WITH active_ranked AS (
  SELECT
    radacct.radacctid,
    radacct.acctstarttime,
    COALESCE(radacct.acctupdatetime, radacct.acctstarttime) AS updated_at,
    ROW_NUMBER() OVER (PARTITION BY ${identity} ORDER BY ${order}) AS active_rank,
    FIRST_VALUE(radacct.radacctid) OVER (PARTITION BY ${identity} ORDER BY ${order}) AS replacement_id,
    FIRST_VALUE(radacct.acctstarttime) OVER (PARTITION BY ${identity} ORDER BY ${order}) AS replacement_started_at,
    FIRST_VALUE(COALESCE(radacct.acctupdatetime, radacct.acctstarttime)) OVER (PARTITION BY ${identity} ORDER BY ${order}) AS replacement_updated_at
  FROM radacct
  WHERE radacct.acctstoptime IS NULL
), closed AS (
  UPDATE radacct previous
  SET
    acctstoptime = GREATEST(previous.acctstarttime, ranked.replacement_started_at),
    acctsessiontime = GREATEST(EXTRACT(EPOCH FROM (GREATEST(previous.acctstarttime, ranked.replacement_started_at) - previous.acctstarttime))::bigint, 0),
    acctterminatecause = COALESCE(NULLIF(previous.acctterminatecause, ''), 'Stale-Replaced')
  FROM active_ranked ranked
  WHERE previous.radacctid = ranked.radacctid
    AND ranked.active_rank > 1
    AND ranked.replacement_id <> ranked.radacctid
    AND ranked.replacement_started_at > ranked.acctstarttime
    AND ranked.replacement_updated_at >= (now() - (${staleSeconds} * interval '1 second'))
    AND ranked.updated_at < (now() - (${staleSeconds} * interval '1 second'))
  RETURNING previous.radacctid
)
SELECT json_build_object('closed', COUNT(*))::text FROM closed`;
}

async function closeSupersededActiveSessions() {
  if (!enabled() || !configured() || sessionStaleSeconds() <= 0) {
    return { ok: true, closed: 0 };
  }
  try {
    const payload = await psqlJson(closeSupersededSessionsQuery());
    return { ok: true, closed: numberValue(payload.closed) };
  } catch (error) {
    return { ok: false, closed: 0, error: error.message || 'Session stale FreeRADIUS tidak bisa ditutup' };
  }
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

function lastSeenQuery(usernames = []) {
  const values = [...new Set(usernames.map((username) => cleanText(username).toLowerCase()).filter(Boolean))]
    .slice(0, 5000);
  if (!values.length) return '';
  return `
SELECT COALESCE(json_agg(row_to_json(last_seen)), '[]'::json)::text
FROM (
  SELECT
    lower(username) AS username_key,
    min(username) AS username,
    to_char(MAX(COALESCE(acctstoptime, acctupdatetime, acctstarttime)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
  FROM radacct
  WHERE lower(username) IN (${values.map(sqlLiteral).join(',')})
  GROUP BY lower(username)
) last_seen`;
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

function shiftPeriod(period = normalizedPeriod(), months = 0) {
  const [year, month] = normalizedPeriod(period).split('-').map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1 + Math.trunc(Number(months) || 0), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizedDate(value = '') {
  const text = cleanText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftDate(dateIso = normalizedDate(), days = 0) {
  const [year, month, day] = normalizedDate(dateIso).split('-').map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + Math.trunc(Number(days) || 0));
  return date.toISOString().slice(0, 10);
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
WITH period_bounds AS (
  SELECT ${sqlLiteral(start)}::timestamp AS start_at, ${sqlLiteral(end)}::timestamp AS end_at
),
session_rows AS (
  SELECT
    lower(radacct.username) AS username_key,
    radacct.username,
    ${inputExpr} AS input_octets_raw,
    ${outputExpr} AS output_octets_raw,
    COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now()) AS session_end_at,
    COALESCE(radacct.acctstoptime, radacct.acctupdatetime, radacct.acctstarttime) AS last_seen_at,
    GREATEST(
      COALESCE(NULLIF(radacct.acctsessiontime, 0), 0)::numeric,
      EXTRACT(EPOCH FROM (COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now()) - radacct.acctstarttime)),
      1
    ) AS duration_seconds,
    GREATEST(
      EXTRACT(EPOCH FROM (
        LEAST(COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now()), period_bounds.end_at)
        - GREATEST(radacct.acctstarttime, period_bounds.start_at)
      )),
      0
    ) AS overlap_seconds
  FROM radacct
  CROSS JOIN period_bounds
  WHERE lower(radacct.username) IN (${values.map(sqlLiteral).join(',')})
    AND radacct.acctstarttime < period_bounds.end_at
    AND COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now()) >= period_bounds.start_at
)
SELECT COALESCE(json_agg(row_to_json(monthly_usage)), '[]'::json)::text
FROM (
  SELECT
    username_key,
    min(username) AS username,
    COALESCE(SUM(ROUND(input_octets_raw::numeric * LEAST(1::numeric, overlap_seconds / duration_seconds))), 0)::bigint AS input_octets,
    COALESCE(SUM(ROUND(output_octets_raw::numeric * LEAST(1::numeric, overlap_seconds / duration_seconds))), 0)::bigint AS output_octets,
    COALESCE(SUM(ROUND((input_octets_raw + output_octets_raw)::numeric * LEAST(1::numeric, overlap_seconds / duration_seconds))), 0)::bigint AS total_octets,
    COUNT(*)::bigint AS session_count,
    to_char(MAX(last_seen_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
  FROM session_rows
  WHERE overlap_seconds > 0
  GROUP BY username_key
) monthly_usage`;
}

function dailyUsageQuery(username = '', referenceDate = normalizedDate(), days = 7, columns = new Set()) {
  const userKey = cleanText(username).toLowerCase();
  if (!userKey) return '';
  const dayCount = Math.max(1, Math.min(31, Math.trunc(Number(days || 7))));
  const endDate = normalizedDate(referenceDate);
  const startDate = shiftDate(endDate, -(dayCount - 1));
  const exclusiveEndDate = shiftDate(endDate, 1);
  const inputExpr = octetExpr('radacct', 'acctinputoctets', 'acctinputgigawords', columns);
  const outputExpr = octetExpr('radacct', 'acctoutputoctets', 'acctoutputgigawords', columns);
  return `
WITH days AS (
  SELECT generate_series(${sqlLiteral(startDate)}::date, ${sqlLiteral(endDate)}::date, interval '1 day')::date AS day_key
),
session_rows AS (
  SELECT
    radacct.acctstarttime AS session_start_at,
    COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now()) AS session_end_at,
    COALESCE(radacct.acctstoptime, radacct.acctupdatetime, radacct.acctstarttime) AS last_seen_at,
    ${inputExpr} AS input_octets_raw,
    ${outputExpr} AS output_octets_raw,
    GREATEST(
      COALESCE(NULLIF(radacct.acctsessiontime, 0), 0)::numeric,
      EXTRACT(EPOCH FROM (COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now()) - radacct.acctstarttime)),
      1
    ) AS duration_seconds
  FROM radacct
  WHERE lower(radacct.username) = ${sqlLiteral(userKey)}
    AND radacct.acctstarttime < ${sqlLiteral(`${exclusiveEndDate} 00:00:00`)}::timestamp
    AND COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now()) >= ${sqlLiteral(`${startDate} 00:00:00`)}::timestamp
),
daily_overlaps AS (
  SELECT
    days.day_key,
    session_rows.input_octets_raw,
    session_rows.output_octets_raw,
    session_rows.last_seen_at,
    session_rows.duration_seconds,
    GREATEST(
      EXTRACT(EPOCH FROM (
        LEAST(session_rows.session_end_at, (days.day_key + interval '1 day')::timestamp)
        - GREATEST(session_rows.session_start_at, days.day_key::timestamp)
      )),
      0
    ) AS overlap_seconds
  FROM days
  JOIN session_rows
    ON session_rows.session_start_at < (days.day_key + interval '1 day')::timestamp
   AND session_rows.session_end_at >= days.day_key::timestamp
),
usage_rows AS (
  SELECT
    day_key,
    COALESCE(SUM(ROUND(input_octets_raw::numeric * LEAST(1::numeric, overlap_seconds / duration_seconds))), 0)::bigint AS input_octets,
    COALESCE(SUM(ROUND(output_octets_raw::numeric * LEAST(1::numeric, overlap_seconds / duration_seconds))), 0)::bigint AS output_octets,
    COALESCE(SUM(ROUND((input_octets_raw + output_octets_raw)::numeric * LEAST(1::numeric, overlap_seconds / duration_seconds))), 0)::bigint AS total_octets,
    COUNT(*)::bigint AS session_count,
    to_char(MAX(last_seen_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
  FROM daily_overlaps
  WHERE overlap_seconds > 0
  GROUP BY day_key
)
SELECT COALESCE(json_agg(row_to_json(daily_usage) ORDER BY daily_usage.day_key), '[]'::json)::text
FROM (
  SELECT
    to_char(days.day_key, 'YYYY-MM-DD') AS day_key,
    COALESCE(usage_rows.input_octets, 0)::bigint AS input_octets,
    COALESCE(usage_rows.output_octets, 0)::bigint AS output_octets,
    COALESCE(usage_rows.total_octets, 0)::bigint AS total_octets,
    COALESCE(usage_rows.session_count, 0)::bigint AS session_count,
    COALESCE(usage_rows.last_seen_at, '') AS last_seen_at
  FROM days
  LEFT JOIN usage_rows ON usage_rows.day_key = days.day_key
  ORDER BY days.day_key
) daily_usage`;
}

function usageTablesSql() {
  return `
CREATE TABLE IF NOT EXISTS ${USAGE_STATE_TABLE} (
  session_key text PRIMARY KEY,
  username text NOT NULL,
  input_octets bigint NOT NULL DEFAULT 0,
  output_octets bigint NOT NULL DEFAULT 0,
  total_octets bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ${USAGE_DAILY_TABLE} (
  username text NOT NULL,
  day date NOT NULL,
  input_octets bigint NOT NULL DEFAULT 0,
  output_octets bigint NOT NULL DEFAULT 0,
  total_octets bigint NOT NULL DEFAULT 0,
  samples integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (username, day)
);
CREATE INDEX IF NOT EXISTS ${USAGE_DAILY_TABLE}_day_idx ON ${USAGE_DAILY_TABLE} (day);
CREATE TABLE IF NOT EXISTS ${USAGE_15M_TABLE} (
  username text NOT NULL,
  bucket_at timestamp NOT NULL,
  input_octets bigint NOT NULL DEFAULT 0,
  output_octets bigint NOT NULL DEFAULT 0,
  total_octets bigint NOT NULL DEFAULT 0,
  samples integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (username, bucket_at)
);
CREATE INDEX IF NOT EXISTS ${USAGE_15M_TABLE}_bucket_idx ON ${USAGE_15M_TABLE} (bucket_at);
`;
}

function recordUsageDeltasQuery(columns = new Set(), options = {}) {
  const timeZone = sqlLiteral(options.timeZone || usageTimeZone());
  const retentionDays = usageRetentionDays();
  const intervalRetentionHours = usageIntervalRetentionHours();
  const inputExpr = octetExpr('radacct', 'acctinputoctets', 'acctinputgigawords', columns);
  const outputExpr = octetExpr('radacct', 'acctoutputoctets', 'acctoutputgigawords', columns);
  return `
${usageTablesSql()}
WITH current_sessions AS (
  SELECT
    COALESCE(NULLIF(radacct.acctuniqueid, ''), NULLIF(radacct.acctsessionid, ''), radacct.radacctid::text) AS session_key,
    lower(COALESCE(radacct.username, '')) AS username,
    GREATEST(${inputExpr}, 0)::bigint AS input_octets,
    GREATEST(${outputExpr}, 0)::bigint AS output_octets,
    GREATEST(${inputExpr} + ${outputExpr}, 0)::bigint AS total_octets,
    COALESCE(radacct.acctupdatetime, radacct.acctstarttime, now()) AS updated_at
  FROM radacct
  WHERE radacct.acctstoptime IS NULL
    AND COALESCE(radacct.username, '') <> ''
),
delta_rows AS (
  SELECT
    current_sessions.session_key,
    current_sessions.username,
    current_sessions.input_octets,
    current_sessions.output_octets,
    current_sessions.total_octets,
    current_sessions.updated_at,
    GREATEST(current_sessions.input_octets - COALESCE(previous.input_octets, current_sessions.input_octets), 0)::bigint AS delta_input_octets,
    GREATEST(current_sessions.output_octets - COALESCE(previous.output_octets, current_sessions.output_octets), 0)::bigint AS delta_output_octets,
    GREATEST(current_sessions.total_octets - COALESCE(previous.total_octets, current_sessions.total_octets), 0)::bigint AS delta_total_octets
  FROM current_sessions
  LEFT JOIN ${USAGE_STATE_TABLE} previous ON previous.session_key = current_sessions.session_key
),
daily_upsert AS (
  INSERT INTO ${USAGE_DAILY_TABLE} (
    username,
    day,
    input_octets,
    output_octets,
    total_octets,
    samples,
    updated_at
  )
  SELECT
    username,
    (timezone(${timeZone}, updated_at))::date AS day,
    SUM(delta_input_octets)::bigint AS input_octets,
    SUM(delta_output_octets)::bigint AS output_octets,
    SUM(delta_total_octets)::bigint AS total_octets,
    COUNT(*)::integer AS samples,
    MAX(updated_at) AS updated_at
  FROM delta_rows
  WHERE delta_total_octets > 0
  GROUP BY username, (timezone(${timeZone}, updated_at))::date
  ON CONFLICT (username, day) DO UPDATE SET
    input_octets = ${USAGE_DAILY_TABLE}.input_octets + EXCLUDED.input_octets,
    output_octets = ${USAGE_DAILY_TABLE}.output_octets + EXCLUDED.output_octets,
    total_octets = ${USAGE_DAILY_TABLE}.total_octets + EXCLUDED.total_octets,
    samples = ${USAGE_DAILY_TABLE}.samples + EXCLUDED.samples,
    updated_at = GREATEST(${USAGE_DAILY_TABLE}.updated_at, EXCLUDED.updated_at)
  RETURNING 1
),
interval_upsert AS (
  INSERT INTO ${USAGE_15M_TABLE} (
    username,
    bucket_at,
    input_octets,
    output_octets,
    total_octets,
    samples,
    updated_at
  )
  SELECT
    username,
    date_trunc('hour', timezone(${timeZone}, updated_at))
      + ((floor(extract(minute from timezone(${timeZone}, updated_at)) / 15)::int * 15) * interval '1 minute') AS bucket_at,
    SUM(delta_input_octets)::bigint AS input_octets,
    SUM(delta_output_octets)::bigint AS output_octets,
    SUM(delta_total_octets)::bigint AS total_octets,
    COUNT(*)::integer AS samples,
    MAX(updated_at) AS updated_at
  FROM delta_rows
  WHERE delta_total_octets > 0
  GROUP BY username, date_trunc('hour', timezone(${timeZone}, updated_at))
      + ((floor(extract(minute from timezone(${timeZone}, updated_at)) / 15)::int * 15) * interval '1 minute')
  ON CONFLICT (username, bucket_at) DO UPDATE SET
    input_octets = ${USAGE_15M_TABLE}.input_octets + EXCLUDED.input_octets,
    output_octets = ${USAGE_15M_TABLE}.output_octets + EXCLUDED.output_octets,
    total_octets = ${USAGE_15M_TABLE}.total_octets + EXCLUDED.total_octets,
    samples = ${USAGE_15M_TABLE}.samples + EXCLUDED.samples,
    updated_at = GREATEST(${USAGE_15M_TABLE}.updated_at, EXCLUDED.updated_at)
  RETURNING 1
),
state_upsert AS (
  INSERT INTO ${USAGE_STATE_TABLE} (
    session_key,
    username,
    input_octets,
    output_octets,
    total_octets,
    updated_at
  )
  SELECT session_key, username, input_octets, output_octets, total_octets, updated_at
  FROM current_sessions
  ON CONFLICT (session_key) DO UPDATE SET
    username = EXCLUDED.username,
    input_octets = EXCLUDED.input_octets,
    output_octets = EXCLUDED.output_octets,
    total_octets = EXCLUDED.total_octets,
    updated_at = GREATEST(${USAGE_STATE_TABLE}.updated_at, EXCLUDED.updated_at)
  RETURNING 1
),
stale_state AS (
  DELETE FROM ${USAGE_STATE_TABLE}
  WHERE updated_at < (now() - interval '7 days')
  RETURNING 1
),
stale_daily AS (
  DELETE FROM ${USAGE_DAILY_TABLE}
  WHERE day < ((timezone(${timeZone}, now()))::date - (${retentionDays} * interval '1 day'))::date
  RETURNING 1
),
stale_interval AS (
  DELETE FROM ${USAGE_15M_TABLE}
  WHERE bucket_at < (timezone(${timeZone}, now()) - (${intervalRetentionHours} * interval '1 hour'))
  RETURNING 1
)
SELECT json_build_object(
  'sessions', (SELECT COUNT(*) FROM current_sessions),
  'recorded', (SELECT COUNT(*) FROM daily_upsert),
  'recordedIntervals', (SELECT COUNT(*) FROM interval_upsert),
  'stateRows', (SELECT COUNT(*) FROM state_upsert),
  'prunedSessions', (SELECT COUNT(*) FROM stale_state),
  'prunedDays', (SELECT COUNT(*) FROM stale_daily),
  'prunedIntervals', (SELECT COUNT(*) FROM stale_interval)
)::text`;
}

function recordedDailyUsageQuery(username = '', referenceDate = normalizedDate(), days = 7) {
  const userKey = cleanText(username).toLowerCase();
  if (!userKey) return '';
  const dayCount = Math.max(1, Math.min(31, Math.trunc(Number(days || 7))));
  const endDate = normalizedDate(referenceDate);
  const startDate = shiftDate(endDate, -(dayCount - 1));
  return `
${usageTablesSql()}
WITH days AS (
  SELECT generate_series(${sqlLiteral(startDate)}::date, ${sqlLiteral(endDate)}::date, interval '1 day')::date AS day_key
)
SELECT COALESCE(json_agg(row_to_json(daily_usage) ORDER BY daily_usage.day_key), '[]'::json)::text
FROM (
  SELECT
    to_char(days.day_key, 'YYYY-MM-DD') AS day_key,
    COALESCE(usage_rows.input_octets, 0)::bigint AS input_octets,
    COALESCE(usage_rows.output_octets, 0)::bigint AS output_octets,
    COALESCE(usage_rows.total_octets, 0)::bigint AS total_octets,
    COALESCE(usage_rows.samples, 0)::bigint AS session_count,
    to_char(usage_rows.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
  FROM days
  LEFT JOIN ${USAGE_DAILY_TABLE} usage_rows
    ON usage_rows.day = days.day_key
   AND usage_rows.username = ${sqlLiteral(userKey)}
  ORDER BY days.day_key
) daily_usage`;
}

function recordedMonthlyUsageQuery(username = '', period = normalizedPeriod(), months = 12) {
  const userKey = cleanText(username).toLowerCase();
  if (!userKey) return '';
  const selectedPeriod = normalizedPeriod(period);
  const monthCount = Math.max(1, Math.min(24, Math.trunc(Number(months || 12))));
  const startPeriod = shiftPeriod(selectedPeriod, -(monthCount - 1));
  return `
${usageTablesSql()}
WITH months AS (
  SELECT generate_series(${sqlLiteral(`${startPeriod}-01`)}::date, ${sqlLiteral(`${selectedPeriod}-01`)}::date, interval '1 month')::date AS month_key
),
usage_rows AS (
  SELECT
    date_trunc('month', day)::date AS month_key,
    SUM(input_octets)::bigint AS input_octets,
    SUM(output_octets)::bigint AS output_octets,
    SUM(total_octets)::bigint AS total_octets,
    SUM(samples)::bigint AS session_count,
    to_char(MAX(updated_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
  FROM ${USAGE_DAILY_TABLE}
  WHERE username = ${sqlLiteral(userKey)}
    AND day >= ${sqlLiteral(`${startPeriod}-01`)}::date
    AND day < (${sqlLiteral(`${selectedPeriod}-01`)}::date + interval '1 month')
  GROUP BY date_trunc('month', day)::date
)
SELECT COALESCE(json_agg(row_to_json(monthly_usage) ORDER BY monthly_usage.period), '[]'::json)::text
FROM (
  SELECT
    to_char(months.month_key, 'YYYY-MM') AS period,
    COALESCE(usage_rows.input_octets, 0)::bigint AS input_octets,
    COALESCE(usage_rows.output_octets, 0)::bigint AS output_octets,
    COALESCE(usage_rows.total_octets, 0)::bigint AS total_octets,
    COALESCE(usage_rows.session_count, 0)::bigint AS session_count,
    COALESCE(usage_rows.last_seen_at, '') AS last_seen_at
  FROM months
  LEFT JOIN usage_rows ON usage_rows.month_key = months.month_key
  ORDER BY months.month_key
) monthly_usage`;
}

function recordedIntervalUsageQuery(username = '', options = {}) {
  const userKey = cleanText(username).toLowerCase();
  if (!userKey) return '';
  const hours = Math.max(1, Math.min(72, Math.trunc(Number(options.hours || 24))));
  const intervalMinutes = Math.max(5, Math.min(60, Math.trunc(Number(options.intervalMinutes || 15))));
  const bucketCount = Math.max(1, Math.min(288, Math.ceil((hours * 60) / intervalMinutes)));
  const timeZone = sqlLiteral(options.timeZone || usageTimeZone());
  return `
${usageTablesSql()}
WITH bounds AS (
  SELECT date_trunc('hour', timezone(${timeZone}, now()))
    + ((floor(extract(minute from timezone(${timeZone}, now())) / ${intervalMinutes})::int * ${intervalMinutes}) * interval '1 minute') AS end_bucket
),
buckets AS (
  SELECT generate_series(
    (SELECT end_bucket FROM bounds) - ((${bucketCount - 1}) * interval '${intervalMinutes} minutes'),
    (SELECT end_bucket FROM bounds),
    interval '${intervalMinutes} minutes'
  ) AS bucket_at
)
SELECT COALESCE(json_agg(row_to_json(interval_usage) ORDER BY interval_usage.bucket_at), '[]'::json)::text
FROM (
  SELECT
    to_char(buckets.bucket_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS bucket_at,
    COALESCE(usage_rows.input_octets, 0)::bigint AS input_octets,
    COALESCE(usage_rows.output_octets, 0)::bigint AS output_octets,
    COALESCE(usage_rows.total_octets, 0)::bigint AS total_octets,
    COALESCE(usage_rows.samples, 0)::bigint AS session_count,
    to_char(usage_rows.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
  FROM buckets
  LEFT JOIN ${USAGE_15M_TABLE} usage_rows
    ON usage_rows.bucket_at = buckets.bucket_at
   AND usage_rows.username = ${sqlLiteral(userKey)}
  ORDER BY buckets.bucket_at
) interval_usage`;
}

function intervalUsageQuery(username = '', options = {}, columns = new Set()) {
  const userKey = cleanText(username).toLowerCase();
  if (!userKey) return '';
  const hours = Math.max(1, Math.min(72, Math.trunc(Number(options.hours || 24))));
  const intervalMinutes = Math.max(5, Math.min(60, Math.trunc(Number(options.intervalMinutes || 15))));
  const bucketCount = Math.max(1, Math.min(288, Math.ceil((hours * 60) / intervalMinutes)));
  const timeZone = sqlLiteral(options.timeZone || usageTimeZone());
  const inputExpr = octetExpr('radacct', 'acctinputoctets', 'acctinputgigawords', columns);
  const outputExpr = octetExpr('radacct', 'acctoutputoctets', 'acctoutputgigawords', columns);
  return `
WITH bounds AS (
  SELECT date_trunc('hour', timezone(${timeZone}, now()))
    + ((floor(extract(minute from timezone(${timeZone}, now())) / ${intervalMinutes})::int * ${intervalMinutes}) * interval '1 minute') AS end_bucket
),
buckets AS (
  SELECT generate_series(
    (SELECT end_bucket FROM bounds) - ((${bucketCount - 1}) * interval '${intervalMinutes} minutes'),
    (SELECT end_bucket FROM bounds),
    interval '${intervalMinutes} minutes'
  ) AS bucket_at
),
session_rows AS (
  SELECT
    timezone(${timeZone}, radacct.acctstarttime) AS session_start_at,
    timezone(${timeZone}, COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now())) AS session_end_at,
    COALESCE(radacct.acctstoptime, radacct.acctupdatetime, radacct.acctstarttime) AS last_seen_at,
    ${inputExpr} AS input_octets_raw,
    ${outputExpr} AS output_octets_raw,
    GREATEST(
      COALESCE(NULLIF(radacct.acctsessiontime, 0), 0)::numeric,
      EXTRACT(EPOCH FROM (COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now()) - radacct.acctstarttime)),
      1
    ) AS duration_seconds
  FROM radacct
  CROSS JOIN bounds
  WHERE lower(radacct.username) = ${sqlLiteral(userKey)}
    AND timezone(${timeZone}, radacct.acctstarttime) < (bounds.end_bucket + interval '${intervalMinutes} minutes')
    AND timezone(${timeZone}, COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now())) >= (bounds.end_bucket - ((${bucketCount - 1}) * interval '${intervalMinutes} minutes'))
),
interval_overlaps AS (
  SELECT
    buckets.bucket_at,
    session_rows.input_octets_raw,
    session_rows.output_octets_raw,
    session_rows.last_seen_at,
    session_rows.duration_seconds,
    GREATEST(
      EXTRACT(EPOCH FROM (
        LEAST(session_rows.session_end_at, buckets.bucket_at + interval '${intervalMinutes} minutes')
        - GREATEST(session_rows.session_start_at, buckets.bucket_at)
      )),
      0
    ) AS overlap_seconds
  FROM buckets
  JOIN session_rows
    ON session_rows.session_start_at < (buckets.bucket_at + interval '${intervalMinutes} minutes')
   AND session_rows.session_end_at >= buckets.bucket_at
),
usage_rows AS (
  SELECT
    bucket_at,
    COALESCE(SUM(ROUND(input_octets_raw::numeric * LEAST(1::numeric, overlap_seconds / duration_seconds))), 0)::bigint AS input_octets,
    COALESCE(SUM(ROUND(output_octets_raw::numeric * LEAST(1::numeric, overlap_seconds / duration_seconds))), 0)::bigint AS output_octets,
    COALESCE(SUM(ROUND((input_octets_raw + output_octets_raw)::numeric * LEAST(1::numeric, overlap_seconds / duration_seconds))), 0)::bigint AS total_octets,
    COUNT(*)::bigint AS session_count,
    to_char(MAX(last_seen_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at
  FROM interval_overlaps
  WHERE overlap_seconds > 0
  GROUP BY bucket_at
)
SELECT COALESCE(json_agg(row_to_json(interval_usage) ORDER BY interval_usage.bucket_at), '[]'::json)::text
FROM (
  SELECT
    to_char(buckets.bucket_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS bucket_at,
    COALESCE(usage_rows.input_octets, 0)::bigint AS input_octets,
    COALESCE(usage_rows.output_octets, 0)::bigint AS output_octets,
    COALESCE(usage_rows.total_octets, 0)::bigint AS total_octets,
    COALESCE(usage_rows.session_count, 0)::bigint AS session_count,
    COALESCE(usage_rows.last_seen_at, '') AS last_seen_at
  FROM buckets
  LEFT JOIN usage_rows ON usage_rows.bucket_at = buckets.bucket_at
  ORDER BY buckets.bucket_at
) interval_usage`;
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
      AND radacct.acctstarttime < ${sqlLiteral(end)}::timestamp
      AND COALESCE(radacct.acctstoptime, radacct.acctupdatetime, now()) >= ${sqlLiteral(start)}::timestamp
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
    nasIpAddress: cleanInet(row.nasipaddress),
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
    nasIpAddress: cleanInet(row.nasipaddress),
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

function normalizeDailyUsage(row = {}) {
  const inputOctets = numberValue(row.input_octets);
  const outputOctets = numberValue(row.output_octets);
  const totalOctets = numberValue(row.total_octets);
  return {
    date: cleanText(row.day_key),
    inputOctets,
    outputOctets,
    totalOctets,
    upload: formatBytes(inputOctets),
    download: formatBytes(outputOctets),
    totalUsageText: formatBytes(totalOctets),
    sessionCount: numberValue(row.session_count),
    lastSeenAt: cleanText(row.last_seen_at)
  };
}

function normalizeIntervalUsage(row = {}) {
  const inputOctets = numberValue(row.input_octets);
  const outputOctets = numberValue(row.output_octets);
  const totalOctets = numberValue(row.total_octets);
  return {
    bucketAt: cleanText(row.bucket_at),
    inputOctets,
    outputOctets,
    totalOctets,
    upload: formatBytes(inputOctets),
    download: formatBytes(outputOctets),
    totalUsageText: formatBytes(totalOctets),
    sessionCount: numberValue(row.session_count),
    lastSeenAt: cleanText(row.last_seen_at)
  };
}

async function cacheSessions(payload = {}) {
  if (!payload.ok) return;
  memorySessionCache = {
    ...cloneJson(payload),
    cachedAt: new Date().toISOString()
  };
  if (!redisCache.enabled()) return;
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
  if (memorySessionCache) {
    const cachedAtMs = memorySessionCache.cachedAt ? new Date(memorySessionCache.cachedAt).getTime() : 0;
    const cacheAgeSeconds = cachedAtMs ? Math.max(0, Math.round((Date.now() - cachedAtMs) / 1000)) : null;
    return {
      ...cloneJson(memorySessionCache),
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-radacct-memory-cache',
      cache: true,
      cacheAgeSeconds,
      stale: true,
      error: fallbackError || memorySessionCache.error || ''
    };
  }
  if (!redisCache.enabled()) return null;
  try {
    const raw = await redisCache.get(SESSION_CACHE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    const cachedAtMs = payload.cachedAt ? new Date(payload.cachedAt).getTime() : 0;
    const cacheAgeSeconds = cachedAtMs ? Math.max(0, Math.round((Date.now() - cachedAtMs) / 1000)) : null;
    return {
      ...payload,
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-radacct-cache',
      cache: true,
      cacheAgeSeconds,
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
  const restrictedUsernames = [...new Set((options.usernames || []).map((username) => cleanText(username)).filter(Boolean))];
  if (restrictedUsernames.length && options.allowCache !== false) {
    const cached = getRestrictedSessionCache(restrictedUsernames, Number(options.maxCacheAgeSeconds || 0));
    if (cached) return cached;
  }
  if (!restrictedUsernames.length && options.preferCache && options.allowCache !== false) {
    const cached = await cachedSessions('');
    const maxCacheAgeSeconds = Math.max(0, Number(options.maxCacheAgeSeconds || 0) || 0);
    if (cached && (!maxCacheAgeSeconds || Number(cached.cacheAgeSeconds || 0) <= maxCacheAgeSeconds)) {
      return {
        ...cached,
        stale: false,
        error: ''
      };
    }
  }
  try {
    const columns = await radacctColumns();
    const rows = await psqlJson(activeSessionsQuery(options.limit || 1000, columns, restrictedUsernames, options));
    const payload = {
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-radacct',
      staleCutoffSeconds: sessionStaleSeconds(),
      rows: rows.map(normalizeSession)
    };
    if (restrictedUsernames.length) setRestrictedSessionCache(restrictedUsernames, payload);
    else await cacheSessions(payload);
    return payload;
  } catch (error) {
    if (options.allowCache !== false) {
      const cached = restrictedUsernames.length
        ? getRestrictedSessionCache(restrictedUsernames)
        : await cachedSessions(error.message || 'Session FreeRADIUS tidak bisa dibaca');
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

async function lastSeenByUsernames(usernames = []) {
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
    const rows = await psqlJson(lastSeenQuery(values));
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-radacct',
      rows: rows.map((row) => ({
        username: cleanText(row.username),
        usernameKey: cleanText(row.username_key),
        lastSeenAt: cleanText(row.last_seen_at)
      }))
    };
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      configured: true,
      rows: [],
      error: error.message || 'Session terakhir FreeRADIUS tidak bisa dibaca'
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

async function monthlyUsageHistoryByUsername(username = '', period = normalizedPeriod(), options = {}) {
  const value = cleanText(username);
  const selectedPeriod = normalizedPeriod(period);
  const months = Math.max(1, Math.min(24, Math.trunc(Number(options.months || 12))));
  const periods = Array.from({ length: months }, (_, index) => shiftPeriod(selectedPeriod, index - (months - 1)));
  if (!value) {
    return {
      ok: true,
      enabled: enabled(),
      configured: configured(),
      source: 'freeradius-usage-delta',
      period: selectedPeriod,
      months,
      rows: periods.map((item) => ({ period: item, inputOctets: 0, outputOctets: 0, totalOctets: 0, upload: '0 B', download: '0 B', totalUsageText: '0 B', sessionCount: 0, lastSeenAt: '' }))
    };
  }
  if (!enabled()) {
    return {
      ok: false,
      enabled: false,
      configured: configured(),
      source: 'freeradius-usage-delta',
      period: selectedPeriod,
      months,
      rows: [],
      error: 'FreeRADIUS SQL sync belum aktif'
    };
  }
  if (!configured()) {
    return {
      ok: false,
      enabled: true,
      configured: false,
      source: 'freeradius-usage-delta',
      period: selectedPeriod,
      months,
      rows: [],
      error: 'FREERADIUS_DATABASE_URL belum diisi'
    };
  }
  try {
    const rows = await psqlJson(recordedMonthlyUsageQuery(value, selectedPeriod, months));
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-usage-delta',
      period: selectedPeriod,
      months,
      rows: rows.map((row) => ({
        period: cleanText(row.period),
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
      source: 'freeradius-usage-delta',
      period: selectedPeriod,
      months,
      rows: [],
      error: error.message || 'History pemakaian bulanan FreeRADIUS tidak bisa dibaca'
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

async function dailyUsageByUsername(username = '', referenceDate = normalizedDate(), options = {}) {
  const value = cleanText(username);
  const days = Math.max(1, Math.min(31, Math.trunc(Number(options.days || 7))));
  const selectedDate = normalizedDate(referenceDate);
  if (!value) {
    return {
      ok: true,
      enabled: enabled(),
      configured: configured(),
      source: 'freeradius-radacct',
      referenceDate: selectedDate,
      days,
      rows: []
    };
  }
  if (!enabled()) {
    return {
      ok: false,
      enabled: false,
      configured: configured(),
      referenceDate: selectedDate,
      days,
      rows: [],
      error: 'FreeRADIUS SQL sync belum aktif'
    };
  }
  if (!configured()) {
    return {
      ok: false,
      enabled: true,
      configured: false,
      referenceDate: selectedDate,
      days,
      rows: [],
      error: 'FREERADIUS_DATABASE_URL belum diisi'
    };
  }
  try {
    const columns = await radacctColumns();
    let rows = [];
    let source = 'freeradius-usage-delta';
    try {
      rows = await psqlJson(recordedDailyUsageQuery(value, selectedDate, days));
    } catch (error) {
      rows = [];
    }
    const recordedTotal = rows.reduce((sum, row) => sum + numberValue(row.total_octets), 0);
    if (recordedTotal <= 0) {
      rows = await psqlJson(dailyUsageQuery(value, selectedDate, days, columns));
      source = 'freeradius-radacct';
    }
    return {
      ok: true,
      enabled: true,
      configured: true,
      source,
      referenceDate: selectedDate,
      days,
      rows: rows.map(normalizeDailyUsage)
    };
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      configured: true,
      referenceDate: selectedDate,
      days,
      rows: [],
      error: error.message || 'Usage harian FreeRADIUS tidak bisa dibaca'
    };
  }
}

async function intervalUsageByUsername(username = '', options = {}) {
  const value = cleanText(username);
  const hours = Math.max(1, Math.min(72, Math.trunc(Number(options.hours || 24))));
  const intervalMinutes = Math.max(5, Math.min(60, Math.trunc(Number(options.intervalMinutes || 15))));
  if (!value) {
    return {
      ok: true,
      enabled: enabled(),
      configured: configured(),
      source: 'freeradius-usage-delta',
      hours,
      intervalMinutes,
      rows: []
    };
  }
  if (!enabled()) {
    return {
      ok: false,
      enabled: false,
      configured: configured(),
      hours,
      intervalMinutes,
      rows: [],
      error: 'FreeRADIUS SQL sync belum aktif'
    };
  }
  if (!configured()) {
    return {
      ok: false,
      enabled: true,
      configured: false,
      hours,
      intervalMinutes,
      rows: [],
      error: 'FREERADIUS_DATABASE_URL belum diisi'
    };
  }
  try {
    let rows = [];
    let source = 'freeradius-usage-delta';
    try {
      rows = await psqlJson(recordedIntervalUsageQuery(value, { hours, intervalMinutes }));
    } catch (error) {
      rows = [];
    }
    const recordedTotal = rows.reduce((sum, row) => sum + numberValue(row.total_octets), 0);
    if (recordedTotal <= 0) {
      const columns = await radacctColumns();
      rows = await psqlJson(intervalUsageQuery(value, { hours, intervalMinutes }, columns));
      source = 'freeradius-radacct';
    }
    return {
      ok: true,
      enabled: true,
      configured: true,
      source,
      hours,
      intervalMinutes,
      rows: rows.map(normalizeIntervalUsage)
    };
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      configured: true,
      source: 'freeradius-usage-delta',
      hours,
      intervalMinutes,
      rows: [],
      error: error.message || 'Traffic 24 jam FreeRADIUS tidak bisa dibaca'
    };
  }
}

async function recordUsageDeltas(options = {}) {
  if (!enabled()) {
    return { ok: false, enabled: false, configured: configured(), skipped: true, error: 'FreeRADIUS SQL sync belum aktif' };
  }
  if (!configured()) {
    return { ok: false, enabled: true, configured: false, skipped: true, error: 'FREERADIUS_DATABASE_URL belum diisi' };
  }
  try {
    const columns = await radacctColumns();
    const result = await psqlJson(recordUsageDeltasQuery(columns, options));
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: 'freeradius-usage-delta',
      sessions: numberValue(result.sessions),
      recorded: numberValue(result.recorded),
      recordedIntervals: numberValue(result.recordedIntervals),
      stateRows: numberValue(result.stateRows),
      prunedSessions: numberValue(result.prunedSessions),
      prunedDays: numberValue(result.prunedDays),
      prunedIntervals: numberValue(result.prunedIntervals)
    };
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      configured: true,
      source: 'freeradius-usage-delta',
      error: error.message || 'Delta usage FreeRADIUS tidak bisa dicatat'
    };
  }
}

module.exports = {
  activeSessions,
  cacheKey: SESSION_CACHE_KEY,
  closeSupersededActiveSessions,
  configured,
  enabled,
  firstOnlineByUsernames,
  lastSeenByUsernames,
  dailyUsageByUsername,
  intervalUsageByUsername,
  monthlyUsageHistoryByUsername,
  monthlyUsageByUsernames,
  recordUsageDeltas,
  usageHistoryByUsername,
  __test: {
    closeSupersededSessionsQuery,
    dailyUsageQuery,
    monthlyUsageQuery,
    recordedMonthlyUsageQuery,
    recordedDailyUsageQuery,
    recordedIntervalUsageQuery,
    intervalUsageQuery,
    recordUsageDeltasQuery,
    normalizeSession,
    normalizeDailyUsage,
    normalizeIntervalUsage,
    normalizeUsageHistory
  }
};
