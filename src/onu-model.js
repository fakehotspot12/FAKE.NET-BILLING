'use strict';

const crypto = require('node:crypto');
const { BoundedJsonCache } = require('./bounded-json-cache');
const cache = new BoundedJsonCache({ maxEntries: 2048, maxBytes: 2 * 1024 * 1024, maxEntryBytes: 2048 });
const pending = new Map(), attempts = new Map(), failures = new Map();
const TTL_MS = 86400000, DISTANCE_MS = 1800000;

function normalize(value) {
  if (typeof value !== 'string' || value.length > 80 || !/^[A-Za-z0-9 ._()+/-]+$/.test(value.trim())) return '';
  const name = value.trim().replace(/\0/g, '');
  if (/^(?:FB-|AUTO|HSGQ GPON|HSGQ EPON|UNKNOWN|N\/A|ONU[- _]|GPON[- _]|EPON[- _])/i.test(name)) return '';
  const known = name.match(/\b(?:F\d{3,4}[A-Z0-9-]*|[HE]G\d[A-Z0-9-]*|AN\d[A-Z0-9-]*|FD\d[A-Z0-9-]*|FL\d[A-Z0-9-]*|DKB-\d[A-Z0-9-]*)\b/i);
  if (known) return known[0].toUpperCase();
  return (/\d/.test(name) || /^[A-Za-z][A-Za-z0-9]*[-_][A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) && !/^(?:ZTE|HUAWEI|RTK)[-_ ]?(?:2G|5G|DUAL|AUTO)$/i.test(name) ? name : '';
}
const connection = device => crypto.createHash('sha256').update(JSON.stringify([device.id, device.vendor, device.host, device.cliProtocol, device.cliPort, device.cliUsername, device.cliPasswordEnc, device.communityEnc])).digest('hex');
const key = (device, row) => connection(device) + ':' + row.id + ':' + row.serialNumber;
function fromModem(modem, row) {
  if (!modem || row.identityAmbiguous) return {};
  const model = normalize(modem.modelName) || normalize(modem.productClass);
  return model ? { physicalModel: model, physicalModelSource: 'acs-device-info', modelCheckedAt: modem.lastInform || '' } : {};
}
const validDistance = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100000;
function cached(device, rows, now = Date.now()) {
  return rows.map(row => {
    const value = cache.get(key(device, row)); if (!value || row.identityAmbiguous) return row;
    const result = { ...row };
    if (row.physicalModelSource !== 'acs-device-info' && value.physicalModel && now - Date.parse(value.modelCheckedAt) < TTL_MS) Object.assign(result, { physicalModel: value.physicalModel, physicalModelSource: value.physicalModelSource, modelCheckedAt: value.modelCheckedAt });
    if (!validDistance(row.distance) && validDistance(value.distance) && now - Date.parse(value.distanceCheckedAt) < DISTANCE_MS) Object.assign(result, { distance: value.distance, distanceCheckedAt: value.distanceCheckedAt, distanceSource: value.distanceSource });
    return result;
  });
}
function fields(text, label) { return [...String(text).matchAll(new RegExp('^\\s*' + label + '[ \\t]*:[ \\t]*([^\\r\\n]*)', 'gim'))].map(row => row[1].trim()); }
function proof(vendor, text, row) {
  if (vendor === 'hsgq') return require('./olt-hsgq').detail(text, require('./olt-hsgq').position(row.id)).state === 'online';
  const serials = fields(text, 'Serial number'), interfaces = fields(text, 'ONU interface');
  return serials.length === 1 && serials[0].toUpperCase() === row.serialNumber && interfaces.length === 1 && interfaces[0] === 'gpon-onu_' + row.id;
}
function equipment(vendor, text, row) {
  if (vendor === 'hsgq') {
    const positions = fields(text, 'PON/ONU');
    if (positions.length !== 1 || positions[0] !== String(row.pon).padStart(2, '0') + '/' + String(row.onuId).padStart(3, '0')) return '';
  }
  const values = fields(text, 'Equipment[- ]?ID');
  return values.length === 1 ? normalize(values[0]) : '';
}
function distance(text) {
  const values = fields(text, '(?:ONU )?Distance'); if (values.length !== 1) return null;
  const match = values[0].match(/^(\d+(?:\.\d+)?)\s*(?:m)?$/i), value = match ? Number(match[1]) : null;
  return validDistance(value) ? value : null;
}
function target(device, row) {
  const position = device.vendor === 'hsgq' ? require('./olt-hsgq').position(row.id) : require('./olt-zte-inventory').position(row.id);
  return !!position && /^[A-Z0-9]{12}$/.test(row.serialNumber || '') && (device.vendor !== 'hsgq' || position.serialNumber === row.serialNumber);
}
function enrichPage(data, device, rows, options = {}) {
  const result = cached(device, rows);
  if (process.env.MIGRATION_MODE === '1' || !['zte', 'hsgq'].includes(device.vendor) || !device.enabled || !device.cliEnabled || rows.length > 8 || require('./olt-terminal').isOpen(device.id)) return result;
  if (device.vendor === 'hsgq' && require('./olt-hsgq').isBusy(device.id) || device.vendor === 'zte' && (require('./olt-zte-registration').isBusy(device.id) || require('./olt-zte-bridge').isBusy(device.id))) return result;
  const signature = connection(device), needed = result.filter(row => row.status === 'online' && !row.identityAmbiguous && (!normalize(row.physicalModel) || !validDistance(row.distance)) && target(device, row) && Date.now() - (failures.get(key(device, row)) || 0) > 300000).slice(0, 2);
  if (!needed.length || pending.has(signature) || pending.size >= 2 || Date.now() - (attempts.get(signature) || 0) < 5000) return result;
  attempts.set(signature, Date.now()); while (attempts.size > 32) attempts.delete(attempts.keys().next().value);
  const task = (async () => {
    const vendors = require('./olt-vendors'), [, context, transport] = await vendors.loadLibrary();
    await context.withContext(data, device, async () => {
      for (const row of needed) {
        if (context.remaining() < 750) break;
        const entry = key(device, row), detail = device.vendor === 'hsgq' ? `show ont-info ${row.pon} ${row.onuId}` : 'show gpon onu detail-info gpon-onu_' + row.id;
        const model = device.vendor === 'hsgq' ? `show ont-version ${row.pon} ${row.onuId}` : 'show gpon remote-onu equip gpon-onu_' + row.id;
        failures.set(entry, Date.now()); while (failures.size > 2048) failures.delete(failures.keys().next().value);
        const needsModel = !normalize(row.physicalModel);
        const raw = await transport.executeOltCommands({ olt: vendors.legacyDevice(device), password: context.decryptSecret(device.cliPasswordEnc), commands: [...(device.vendor === 'hsgq' ? ['enable', 'configure'] : ['enable', 'terminal length 0']), detail, ...(needsModel ? [model] : []), detail], timeoutMs: 4500 });
        if (!raw.success) continue;
        const checks = raw.outputs.filter(value => value.command === detail), models = raw.outputs.filter(value => value.command === model);
        if (checks.length !== 2 || !checks.every(value => proof(device.vendor, value.stdout, row)) || needsModel && models.length !== 1) continue;
        const value = needsModel ? equipment(device.vendor, models[0].stdout, row) : '', meters = distance(checks[1].stdout), checkedAt = new Date().toISOString(), metadata = { ...(cache.get(entry) || {}) };
        if (value) Object.assign(metadata, { physicalModel: value, physicalModelSource: device.vendor + '-omci', modelCheckedAt: checkedAt });
        if (meters !== null) Object.assign(metadata, { distance: meters, distanceCheckedAt: checkedAt, distanceSource: device.vendor + '-cli' });
        if (value || meters !== null) cache.set(entry, metadata, TTL_MS);
      }
    }, { ...options, cliQueue: true, timeoutMs: 4500 });
  })().catch(() => {}).finally(() => pending.delete(signature));
  pending.set(signature, task);
  return result;
}

module.exports = { normalize, fromModem, cached, enrichPage, proof, equipment, distance, validDistance, TTL_MS, DISTANCE_MS };
