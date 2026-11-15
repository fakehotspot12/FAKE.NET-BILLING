const VENDOR_ALIASES = new Map([
  ['tarmoc', 'tarmoc'],
  ['huawei', 'huawei'],
  ['zte', 'zte'],
  ['fiberhome', 'fiberhome'],
  ['fiber home', 'fiberhome'],
  ['bdcom', 'bdcom'],
  ['baudcom', 'bdcom'],
  ['vsol', 'vsol'],
  ['v-sol', 'vsol'],
  ['btpon', 'btpon'],
  ['bt-pon', 'btpon'],
  ['bt pon', 'btpon'],
  ['cdata', 'c-data'],
  ['c-data', 'c-data'],
  ['c data', 'c-data'],
  ['hsgq', 'hsgq'],
  ['hsgq-e', 'hsgq'],
  ['hsgq e', 'hsgq'],
  ['hsgqe', 'hsgq'],
  ['hsgq-g', 'hsgq'],
  ['hsgq g', 'hsgq'],
  ['hsgqg', 'hsgq'],
  ['hioso', 'hioso'],
  ['hi-oso', 'hioso'],
  ['hi oso', 'hioso'],
]);

export const SUPPORTED_OLT_VENDOR_KEYS = new Set([
  'tarmoc',
  'huawei',
  'zte',
  'fiberhome',
  'bdcom',
  'vsol',
  'btpon',
  'c-data',
  'hsgq',
  'hioso',
]);

export function normalizeVendorKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const spaced = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const compact = spaced.replace(/\s+/g, '');
  return VENDOR_ALIASES.get(raw) || VENDOR_ALIASES.get(spaced) || VENDOR_ALIASES.get(compact) || raw;
}

export function isSupportedOltVendor(value) {
  return SUPPORTED_OLT_VENDOR_KEYS.has(normalizeVendorKey(value));
}
