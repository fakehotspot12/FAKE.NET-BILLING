'use strict';

const freeradiusSessions = require('./freeradius-sessions');
const redisCache = require('./redis-cache');

const INTERVAL_MS = Math.max(5000, Number(process.env.RADIUS_CONNECTOR_INTERVAL_MS || 15000) || 15000);
const LIMIT = Math.max(100, Math.min(5000, Number(process.env.RADIUS_CONNECTOR_LIMIT || 3000) || 3000));
const HEARTBEAT_KEY = process.env.RADIUS_CONNECTOR_HEARTBEAT_KEY || 'fakenet:radius:connector:heartbeat';
let timer = null;
let running = false;
let stopping = false;

async function heartbeat(payload = {}) {
  if (!redisCache.enabled()) return;
  try {
    await redisCache.set(HEARTBEAT_KEY, JSON.stringify({
      ...payload,
      at: new Date().toISOString()
    }), Math.max(60, Math.ceil(INTERVAL_MS / 1000) * 4));
  } catch (error) {
    console.error(`Radius connector heartbeat gagal: ${error.message || error}`);
  }
}

async function poll(reason = 'interval') {
  if (running || stopping) return;
  running = true;
  try {
    const cleanup = await freeradiusSessions.closeSupersededActiveSessions();
    if (!cleanup.ok) {
      console.error(`Pembersihan session stale gagal: ${cleanup.error}`);
    }
    const result = await freeradiusSessions.activeSessions({
      limit: LIMIT,
      allowCache: false
    });
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const suppressedDuplicates = rows.reduce((sum, row) => sum + Number(row.suppressedDuplicateCount || 0), 0);
    await heartbeat({
      ok: result.ok === true,
      reason,
      source: result.source || '',
      rows: rows.length,
      suppressedDuplicates,
      error: result.error || ''
    });
    if (result.ok) {
      const cleanupNote = cleanup.closed ? `, ${cleanup.closed} session stale ditutup` : '';
      console.log(`Radius connector OK ${rows.length} session dari ${result.source}${suppressedDuplicates ? `, ${suppressedDuplicates} duplicate disembunyikan` : ''}${cleanupNote}`);
    } else {
      console.error(`Radius connector gagal: ${result.error || 'FreeRADIUS tidak terbaca'}`);
    }
  } catch (error) {
    await heartbeat({
      ok: false,
      reason,
      error: error.message || String(error)
    });
    console.error(`Radius connector error: ${error.message || error}`);
  } finally {
    running = false;
  }
}

function stop(signal) {
  stopping = true;
  if (timer) clearInterval(timer);
  console.log(`Radius connector berhenti (${signal})`);
  process.exit(0);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

poll('startup');
timer = setInterval(() => poll('interval'), INTERVAL_MS);
