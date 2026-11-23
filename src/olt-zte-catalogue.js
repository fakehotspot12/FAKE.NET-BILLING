'use strict';

const crypto = require('node:crypto');
const { BoundedJsonCache: Cache } = require('./bounded-json-cache');
const pnp = require('./olt-zte-pnp');
const profiles = require('./olt-zte-profiles');
const bandwidth = require('./olt-zte-bandwidth');
const vendors = require('./olt-vendors');
const cache = new Cache({ maxEntries: 16, maxBytes: 8 * 1024 * 1024, maxEntryBytes: 1024 * 1024 });
const pending = new Map(), attempts = new Map();
const CACHE_MS = 300000;
const VENDORS = ['Otomatis', 'Huawei', 'ZTE', 'RTK', 'FiberHome', 'CDATA', 'V-SOL', 'Lainnya'];
const PURPOSES = ['management', 'internet', 'hotspot', 'iptv', 'voip', 'other'];
const commands = ['enable', 'terminal length 0', 'show version-running', 'show gpon profile tcont', 'show gpon profile traffic', 'show gpon onu profile vlan', 'show vlan summary', 'show onu-type gpon'];
const fail = (message, status = 409) => { throw Object.assign(Error(message), { status }); };
const name = text => typeof text === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(text);
const text = (value, limit, required = true) => {
  if (typeof value !== 'string' || value.length > limit || /[\x00-\x1f\x7f<>]/.test(value) || required && !value.trim()) fail('Isian katalog tidak valid', 400);
  return value.trim();
};
const normalizedModel = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const connection = device => pnp.signature({ ...device, updatedAt: '' });
function rawMetadata(device) {
  const row = device.provisioningCatalogue;
  return row && row.connection === connection(device) && Array.isArray(row.vlans) && Array.isArray(row.profiles) && Array.isArray(row.models) ? row : { revision: '', vlans: [], profiles: [], models: [] };
}
function metadata(device) { return structuredClone(rawMetadata(device)); }
function selectionRevision(device) {
  const row = rawMetadata(device);
  return crypto.createHash('sha256').update(JSON.stringify({ profiles: row.profiles.map(({ id, uploadKbps, downloadKbps, enabled }) => ({ id, uploadKbps, downloadKbps, enabled })), models: row.models.map(({ id, template, aliases, enabled }) => ({ id, template, aliases, enabled })) })).digest('hex');
}
function saved(device) {
  const row = cache.get(pnp.signature(device));
  if (row) return row;
  const state = pnp.saved(device);
  return state ? { catalogue: state.catalogue, onuTypes: state.onuTypes, checkedAt: state.checkedAt } : null;
}
async function read(data, device, actor, options = {}) {
  pnp.check(data, device, actor);
  const key = pnp.signature(device);
  if (pending.has(key)) return structuredClone(await pending.get(key));
  if (pending.size >= 2 || Date.now() - (attempts.get(key) || 0) < 5000) fail('Katalog baru saja diperiksa. Tunggu sebentar.', 429);
  attempts.set(key, Date.now());
  while (attempts.size > 64) attempts.delete(attempts.keys().next().value);
  const task = (async () => {
    const [, context, transport] = await vendors.loadLibrary();
    const raw = await context.withContext(data, device, () => transport.executeOltCommands({ olt: vendors.legacyDevice(device), password: context.decryptSecret(device.cliPasswordEnc), commands, timeoutMs: 17000 }), { ...(options.transportOptions || {}), allowZteDevRead: options.explicitDevAccess === true, cliQueue: true, timeoutMs: 18000 });
    if (!raw.success) fail('Katalog OLT belum terbaca lengkap.', 503);
    const catalogue = profiles.parseCatalogue(raw), types = raw.outputs?.filter(row => row.command === 'show onu-type gpon');
    if (types?.length !== 1) fail('Katalog jenis modem belum lengkap.', 503);
    const row = { catalogue, onuTypes: pnp.types(types[0].stdout), checkedAt: new Date().toISOString() };
    cache.set(key, row, CACHE_MS);
    return row;
  })();
  pending.set(key, task);
  try { return structuredClone(await task); } finally { pending.delete(key); }
}
function useCount(device, profileId) {
  return Object.values(pnp.presets(device)).filter(row => row.bandwidthPresetId === profileId).length;
}
function profile(device, id) { return rawMetadata(device).profiles.find(row => row.id === id && row.enabled !== false); }
function policyFor(device, state, id) {
  const row = profile(device, id);
  if (!row) fail('Preset profil bandwidth tidak tersedia.');
  return bandwidth.customPolicy(state.catalogue || state, row.uploadKbps, row.downloadKbps);
}
function resolveType(device, state, model, fallback = 'FB-GPON-AUTO') {
  const key = normalizedModel(model);
  if (key && key !== 'N/A' && key !== 'UNKNOWN') {
    const mapped = rawMetadata(device).models.filter(row => row.enabled !== false && row.aliases.some(alias => normalizedModel(alias) === key));
    if (mapped.length > 1) fail('Model modem cocok dengan beberapa jenis; pemetaan perlu diperiksa.');
    if (mapped.length === 1) {
      if (mapped[0].template !== fallback && !state.onuTypes.some(row => row.name === mapped[0].template)) fail('Template jenis modem tidak lagi tersedia di OLT.');
      return mapped[0].template;
    }
    const exact = state.onuTypes.filter(row => normalizedModel(row.name) === key);
    if (exact.length > 1) fail('Katalog jenis modem ambigu.');
    if (exact.length === 1) return exact[0].name;
    const signature = connection(device);
    const learned = new Set((device.onuRegistrationJobs || []).slice(-128).filter(row => row.connection === signature && row.status === 'verified' && row.presetRevision && normalizedModel(row.model) === key).map(row => row.type));
    if (learned.size > 1) fail('Riwayat model cocok dengan beberapa template; pemetaan perlu diperiksa.');
    if (learned.size === 1 && state.onuTypes.some(row => row.name === [...learned][0])) return [...learned][0];
  }
  return fallback;
}
function save(data, device, actor, input) {
  if (!pnp.canManage(data, device, actor)) fail('Tidak memiliki izin mengelola katalog OLT.', 403);
  if (require('./olt-zte-registration').isBusy(device.id) || bandwidth.isBusy(device.id) || require('./olt-zte-bridge').isBusy(device.id)) fail('Tunggu proses registrasi atau profil OLT selesai sebelum mengubah katalog.', 429);
  const state = saved(device), row = metadata(device);
  if (!state) fail('Baca katalog OLT terlebih dahulu.');
  if (input.revision !== row.revision) fail('Katalog sudah berubah. Muat ulang sebelum menyimpan.');
  const kind = input.kind;
  if (!['vlan', 'profile', 'model'].includes(kind)) fail('Jenis katalog tidak valid.', 400);
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean' || input.radioVerified !== undefined && typeof input.radioVerified !== 'boolean') fail('Pilihan katalog harus berupa nilai aktif/nonaktif yang benar.', 400);
  if (input.action === 'delete' && kind === 'vlan') fail('Penghapusan VLAN perangkat tidak dilakukan melalui katalog.', 400);
  const collection = kind === 'vlan' ? 'vlans' : kind === 'profile' ? 'profiles' : 'models';
  let item, id = input.id;
  if (kind === 'vlan') {
    if (!Number.isSafeInteger(id) || !state.catalogue.vlans.includes(id)) fail('VLAN tidak tersedia pada OLT.', 400);
    if (!PURPOSES.includes(input.purpose)) fail('Pilih kegunaan VLAN.', 400);
    item = { id, label: text(input.label, 80), purpose: input.purpose, notes: text(input.notes ?? '', 240, false) };
  } else {
    if (id && !/^[0-9a-f-]{36}$/.test(id)) fail('ID katalog tidak valid.', 400);
    const existing = row[collection].find(item => item.id === id);
    if (id && !existing) fail('Data katalog tidak ditemukan.', 404);
    if (input.action === 'delete') {
      if (!existing) fail('Pilih preset katalog yang akan dihapus.', 400);
      if (kind === 'profile' && useCount(device, id)) fail('Profil masih dipakai preset PON. Ganti preset dahulu.');
      if (kind === 'model' && Object.values(require('./olt-zte-registration').settings(device)).some(item => item.enabled)) fail('Nonaktifkan registrasi otomatis sebelum menghapus pemetaan model.');
      row[collection] = row[collection].filter(item => item.id !== id);
    } else if (kind === 'profile') {
      bandwidth.customPolicy(state.catalogue, input.uploadKbps, input.downloadKbps);
      if (existing && useCount(device, id) && (existing.uploadKbps !== input.uploadKbps || existing.downloadKbps !== input.downloadKbps || input.enabled === false)) fail('Profil masih dipakai preset PON; buat profil baru untuk perubahan kecepatan.');
      item = { id: id || crypto.randomUUID(), label: text(input.label, 80), uploadKbps: input.uploadKbps, downloadKbps: input.downloadKbps, enabled: input.enabled !== false };
    } else {
      if (!name(input.template) || input.template !== 'FB-GPON-AUTO' && !state.onuTypes.some(row => row.name === input.template)) fail('Pilih template yang tersedia di OLT.', 400);
      if (!VENDORS.includes(input.vendor) || !['unknown', '24', '5', 'dual', 'none'].includes(input.wifi)) fail('Vendor atau kemampuan WiFi tidak valid.', 400);
      if (input.wifi !== 'unknown' && input.radioVerified !== true) fail('Konfirmasi kemampuan WiFi berdasarkan spesifikasi model.', 400);
      if (!Array.isArray(input.aliases) || !input.aliases.length || input.aliases.length > 32) fail('Isi model yang dilaporkan auto-learning.', 400);
      const aliases = [...new Set(input.aliases.map(alias => text(alias, 64)))];
      if (aliases.some(alias => row.models.some(other => other.id !== id && other.aliases.some(value => normalizedModel(value) === normalizedModel(alias))))) fail('Model sudah dipetakan pada jenis modem lain.');
      item = { id: id || crypto.randomUUID(), label: text(input.label, 80), vendor: input.vendor, template: input.template, aliases, wifi: input.wifi, radioVerified: input.wifi !== 'unknown', enabled: input.enabled !== false };
    }
  }
  if (item) row[collection] = [...row[collection].filter(value => value.id !== item.id), item];
  if (row.vlans.length > 4094 || row.profiles.length > 128 || row.models.length > 256) fail('Batas katalog tercapai.');
  row.revision = crypto.randomUUID();
  row.updatedAt = new Date().toISOString();
  row.connection = connection(device);
  device.provisioningCatalogue = row;
  return { item: item || null, revision: row.revision };
}
function view(data, device) {
  const state = saved(device), meta = rawMetadata(device), signature = connection(device), learnedByModel = new Map(), labels = new Map(meta.vlans.map(row => [row.id, row])), uses = new Map();
  for (const preset of Object.values(pnp.presets(device))) if (preset.bandwidthPresetId) uses.set(preset.bandwidthPresetId, (uses.get(preset.bandwidthPresetId) || 0) + 1);
  for (const row of (device.onuRegistrationJobs || []).slice(-128).reverse()) if (row.connection === signature && row.status === 'verified' && row.model && !learnedByModel.has(normalizedModel(row.model))) learnedByModel.set(normalizedModel(row.model), { model: row.model, template: row.type, serialNumber: row.serialNumber });
  const learned = [...learnedByModel.values()];
  const radios = require('./genieacs').cachedRadioCapabilities(data.settings || {}, learned.map(row => row.serialNumber));
  return { device: { id: device.id, name: device.name }, checkedAt: state?.checkedAt || '', revision: meta.revision,
    counts: { vlans: state?.catalogue.vlans.length ?? null, upload: state?.catalogue.tcont.length ?? null, download: state?.catalogue.traffic.length ?? null, models: state?.onuTypes.length ?? null },
    vlans: (state?.catalogue.vlans || []).map(id => ({ id, ...labels.get(id) })),
    profiles: meta.profiles.map(row => { let prepared = false, conflict = ''; try { prepared = !!state && bandwidth.customPolicy(state.catalogue, row.uploadKbps, row.downloadKbps).profiles.every(item => item.action === 'reuse'); } catch { conflict = 'Definisi profil bertabrakan dengan OLT.'; } return { ...row, presetCount: uses.get(row.id) || 0, prepared, conflict }; }),
    nativeProfiles: state ? { upload: state.catalogue.tcont, download: state.catalogue.traffic } : { upload: [], download: [] },
    models: meta.models, templates: state?.onuTypes || [], vendors: VENDORS,
    learned: learned.map(({ serialNumber, ...row }) => ({ ...row, radio: radios.get(serialNumber) || null })), maxProfiles: 128 };
}
function invalidate(device) { cache.delete(pnp.signature(device)); }
function updateBandwidth(device, catalogue) {
  const previous = saved(device);
  if (!previous) return;
  const remaining = CACHE_MS - (Date.now() - Date.parse(previous.checkedAt));
  if (remaining > 0) cache.set(pnp.signature(device), { ...previous, catalogue: structuredClone(catalogue) }, remaining);
}

function identifyOnus(data, device, rows) {
  if (!['zte', 'hsgq'].includes(device.vendor)) return rows;
  const radios = require('./genieacs').cachedRadioCapabilities(data.settings || {}, rows.map(row => row.serialNumber));
  const normalizeModel = require('./onu-model').normalize;
  const verified = new Map(), signature = connection(device);
  for (const job of (device.onuRegistrationJobs || []).slice(-128).reverse()) if (job.connection === signature && job.status === 'verified' && !verified.has(job.serialNumber)) verified.set(job.serialNumber, job);
  const models = rawMetadata(device).models;
  return rows.map(row => {
    if (row.identityAmbiguous) return row;
    const job = verified.get(row.serialNumber), physicalModel = normalizeModel(row.physicalModel) || normalizeModel(job?.address === row.id ? job.model : row.modelSource !== 'zte-configured-type' ? row.model : '');
    const matches = models.filter(item => item.enabled !== false && item.aliases.some(value => normalizedModel(value) === normalizedModel(physicalModel)));
    const model = matches.length === 1 ? matches[0] : null, radio = radios.get(row.serialNumber);
    let wifiCapability = null;
    if (radio?.bands.length) wifiCapability = { bands: radio.bands, label: radio.bands.map(band => band === '2.4' ? '2,4 GHz' : band + ' GHz').join(' + '), source: 'acs-radio', checkedAt: radio.checkedAt };
    else if (model?.radioVerified && model.wifi !== 'unknown') wifiCapability = { bands: model.wifi === 'dual' ? ['2.4', '5'] : model.wifi === '24' ? ['2.4'] : model.wifi === '5' ? ['5'] : [], label: model.wifi === 'dual' ? '2,4 GHz + 5 GHz' : model.wifi === '24' ? '2,4 GHz' : model.wifi === '5' ? '5 GHz' : 'Tanpa WiFi', source: 'verified-model' };
    return { ...row, physicalModel: physicalModel || '', wifiCapability };
  });
}

module.exports = { metadata, selectionRevision, saved, read, save, view, profile, policyFor, resolveType, connection, invalidate, updateBandwidth, identifyOnus, CACHE_MS, VENDORS, PURPOSES };
