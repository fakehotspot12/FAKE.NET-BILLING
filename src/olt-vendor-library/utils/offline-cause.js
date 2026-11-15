function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function isCdataVendor(value) {
  return /c\s*data|c-data|cdata/i.test(String(value || ''));
}

function hasExplicitLosCause(text) {
  return /(^|[^a-z0-9])(los|loss)([^a-z0-9]|$)/i.test(text);
}

function hasPowerCause(text) {
  return /dying[\s_-]*gasp|power\s*(off|down|fail|failure)?|mati\s*listrik|listrik/i.test(text);
}

function hasGenericLossCause(text) {
  return (
    hasExplicitLosCause(text) ||
    /(^|[^a-z0-9])(lofi|loami)([^a-z0-9]|$)/i.test(text) ||
    /laser\s*out|loss\s+of\s+signal|signal\s+loss|fiber\s+(cut|loss|break)/i.test(text)
  );
}

export function classifyOfflineCause(value, options = {}) {
  const text = normalizeText(value);
  if (!text || /^-+$/.test(text)) return 'other';
  if (hasPowerCause(text)) return 'power';
  if (isCdataVendor(options.vendor || options.olt_vendor)) {
    return hasExplicitLosCause(text) ? 'loss' : 'other';
  }
  return hasGenericLossCause(text) ? 'loss' : 'other';
}

export function normalizeCdataDownCause(value) {
  const text = String(value || '').trim();
  if (!text || /^-+$/.test(text) || /^null$/i.test(text)) return 'OFFLINE';
  if (hasPowerCause(text)) return 'POWER OFF';
  if (hasExplicitLosCause(text)) return /^los$/i.test(text) ? 'LOS' : 'LOSS';
  return text;
}

export function cleanOfflineCause(value) {
  const text = String(value || '').trim();
  if (!text || /^-+$/.test(text) || /^null$/i.test(text)) return null;
  return text;
}
