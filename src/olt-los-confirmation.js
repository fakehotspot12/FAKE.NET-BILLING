'use strict';

const READS = 3;
const INTERVAL_MS = 180000;
const MAX_GAP_MS = INTERVAL_MS * 2 + 30000;
const RETENTION_MS = 30 * 60000;
const MAX_ROWS = 8192;
const clean = value => String(value ?? '').trim();
const key = row => JSON.stringify([row.oltId, row.revision, row.serialNumber, row.onuIndex, row.pon]);

function prepare(data, now = Date.now()) {
  const original = Array.isArray(data.oltLosObservations) ? data.oltLosObservations : [];
  const devices = new Map((data.oltDevices || []).filter(row => row.enabled !== false).map(row => [row.id, clean(row.updatedAt)]));
  const rows = new Map(), byDevice = new Map();
  function put(row) {
    const id = key(row);
    rows.set(id, row);
    if (!byDevice.has(row.oltId)) byDevice.set(row.oltId, new Set());
    byDevice.get(row.oltId).add(id);
  }
  for (const row of original.slice(-MAX_ROWS)) {
    if (!row || !devices.has(row.oltId) || devices.get(row.oltId) !== row.revision || !/^[A-Z0-9]{12}$/.test(row.serialNumber || '')
      || typeof row.onuIndex !== 'string' || row.onuIndex.length > 100 || typeof row.pon !== 'string' || row.pon.length > 100
      || !Number.isInteger(row.count) || row.count < 1 || row.count > READS
      || ![row.firstAt, row.countedAt, row.lastAt].every(Number.isFinite)
      || row.firstAt > row.countedAt || row.countedAt > row.lastAt || row.lastAt > now + 30000 || now - row.lastAt > RETENTION_MS
      || row.countedAt - row.firstAt < (row.count - 1) * INTERVAL_MS) continue;
    put({ oltId: row.oltId, revision: row.revision, serialNumber: row.serialNumber, onuIndex: row.onuIndex,
      pon: row.pon, firstAt: row.firstAt, countedAt: row.countedAt, lastAt: row.lastAt, count: row.count });
  }
  function target(device, onu) {
    return { oltId: device.id, revision: clean(device.updatedAt), serialNumber: onu.serialNumber,
      onuIndex: clean(onu.id), pon: clean(onu.ponKey) };
  }
  function observe(device, seen, checkedAt, isLos) {
    const at = Date.parse(checkedAt), keep = new Set();
    for (const onu of seen.values()) {
      if (!isLos(onu)) continue;
      const identity = target(device, onu), id = key(identity), prior = rows.get(id);
      keep.add(id);
      if (prior && at <= prior.lastAt) continue;
      if (!prior || at - prior.lastAt > MAX_GAP_MS) {
        if (rows.size < MAX_ROWS || prior) put({ ...identity, firstAt: at, countedAt: at, lastAt: at, count: 1 });
        continue;
      }
      const count = Math.min(READS, prior.count + (at - prior.countedAt >= INTERVAL_MS ? 1 : 0));
      put({ ...prior, lastAt: at, count, countedAt: count > prior.count ? at : prior.countedAt });
    }
    for (const id of byDevice.get(device.id) || []) {
      if (!keep.has(id) && at >= rows.get(id).lastAt) { rows.delete(id); byDevice.get(device.id).delete(id); }
    }
  }
  function confirmed(device, onu, checkedAt) {
    const row = rows.get(key(target(device, onu)));
    return Boolean(row && row.count === READS && row.lastAt === Date.parse(checkedAt));
  }
  function result() {
    const next = [...rows.values()];
    return { rows: next, changed: JSON.stringify(next) !== JSON.stringify(original) };
  }
  return { observe, confirmed, result };
}

module.exports = { READS, INTERVAL_MS, MAX_GAP_MS, RETENTION_MS, MAX_ROWS, prepare };
