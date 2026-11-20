'use strict';

const value = leaf => leaf && typeof leaf === 'object' ? leaf._value : leaf;
const numericRows = node => Object.entries(node || {}).filter(([key, row]) => /^\d+$/.test(key) && row && typeof row === 'object').slice(0, 32);

function radioEvidence(raw = {}, options = {}) {
  const bands = new Set();
  let declared = false;
  let measuredAt = Infinity;
  const now = options.now ?? Date.now(), maxAgeMs = options.maxAgeMs ?? 900000;
  const add = (leaf, parent) => {
    const timestamp = leaf?._timestamp ?? parent?._timestamp;
    const at = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp || '');
    if (options.requireFresh && (!Number.isFinite(at) || at > now + 30000 || now - at > maxAgeMs)) return false;
    const text = String(value(leaf) ?? '').toLowerCase();
    const detected = [];
    if (/(?:^|[^\d])2[.,]4\s*(?:g|ghz)?(?:$|[^\d])/.test(text)) detected.push('2.4');
    if (/(?:^|[^\d])5\s*(?:g|ghz)(?:$|[^a-z\d])/.test(text)) detected.push('5');
    for (const band of detected) bands.add(band);
    if (detected.length && Number.isFinite(at)) measuredAt = Math.min(measuredAt, at);
    return detected.length > 0;
  };
  for (const [, radio] of numericRows(raw.Device?.WiFi?.Radio)) {
    if (add(radio.SupportedFrequencyBands, radio)) declared = true;
    add(radio.OperatingFrequencyBand, radio);
  }
  for (const [, lan] of numericRows(raw.InternetGatewayDevice?.LANDevice)) {
    for (const [, wlan] of numericRows(lan.WLANConfiguration)) {
      for (const key of ['OperatingFrequencyBand', 'SupportedFrequencyBands', 'X_HW_RFBand', 'X_ZTE-COM_RFBand', 'RadioBand']) add(wlan[key], wlan);
    }
  }
  return { bands: [...bands].sort(), declared, source: bands.size ? 'acs-radio' : 'unknown', measuredAt: Number.isFinite(measuredAt) ? new Date(measuredAt).toISOString() : '' };
}

module.exports = { radioEvidence };
