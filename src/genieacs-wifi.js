'use strict';

const { detectWanVendor } = require('./genieacs-wan');

const BAND_24 = '2.4ghz';
const BAND_5 = '5ghz';
const BAND_INDEXES = {
  [BAND_24]: [1, 2, 3, 4],
  [BAND_5]: [5, 6, 7, 8]
};

function cleanText(value = '') {
  return String(value ?? '').trim();
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function rawValue(value) {
  if (isObject(value) && Object.prototype.hasOwnProperty.call(value, '_value')) return value._value;
  return value === undefined || value === null || isObject(value) ? '' : value;
}

function parameterValue(path, value, type = 'xsd:string') {
  return [path, value, type];
}

function uniqueParameterValues(items = []) {
  const seen = new Set();
  return items.filter(([path]) => {
    if (!path || seen.has(path)) return false;
    seen.add(path);
    return true;
  });
}

function enabledValue(value) {
  return ['1', 'true', 'yes', 'on', 'up', 'active', 'enabled'].includes(cleanText(value).toLowerCase());
}

function wlanRoot(device = {}) {
  return device?.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration || {};
}

function wlanConfiguration(device = {}, index = 0) {
  return wlanRoot(device)[String(index)] || null;
}

function wlanStatusValue(config = {}) {
  const status = cleanText(rawValue(config.Status)).toLowerCase();
  if (!status) return null;
  if (['up', 'enabled', 'active'].includes(status)) return true;
  if (['disabled', 'down', 'error', 'notpresent', 'not present', 'lowerlayerdown', 'lower layer down'].includes(status)) return false;
  return null;
}

function activeWlan(config = {}) {
  if (!isObject(config)) return false;
  if (connectionHasParam(config, 'Enable') && cleanText(rawValue(config.Enable)) !== '' && !enabledValue(rawValue(config.Enable))) return false;
  if (connectionHasParam(config, 'RadioEnabled') && cleanText(rawValue(config.RadioEnabled)) !== '' && !enabledValue(rawValue(config.RadioEnabled))) return false;
  const status = wlanStatusValue(config);
  if (status !== null) return status;
  if (!enabledValue(rawValue(config.Enable))) return false;
  return true;
}

function populatedWlan(config = {}) {
  return isObject(config) && ['SSID', 'BeaconType', 'Status'].some(key => cleanText(rawValue(config[key])));
}

function internalWlan(device = {}, index = 0) {
  if (detectWanVendor(device).id !== 'huawei') return false;
  const config = wlanConfiguration(device, index) || {};
  const ssid = cleanText(rawValue(config.SSID));
  if (Number(index) > 8 && /^BackhaulSSID[\da-f]{8}$/i.test(ssid)) return true;
  const model = cleanText(device._deviceId?._ProductClass || rawValue(device.InternetGatewayDevice?.DeviceInfo?.ProductClass));
  // HG8145V5 exposes its mesh backhaul as ath12, including after it was renamed.
  const name = cleanText(rawValue(config.Name)).toLowerCase();
  return name === 'ath12'
    || (/^HG8145V5(?:$|[-_\s])/i.test(model) && Number(index) === 9 && !name);
}

function assertCustomerWlan(device = {}, index = 0) {
  if (internalWlan(device, index)) {
    throw new Error('SSID backhaul internal modem dilindungi. Pilih SSID pelanggan untuk mengubah WiFi.');
  }
}

function wlanRadioBand(device = {}, index = 0) {
  const config = wlanConfiguration(device, index) || {};
  const rf = cleanText(rawValue(config.X_HW_RFBand)).toLowerCase();
  const channel = Number(rawValue(config.Channel));
  const standard = cleanText(rawValue(config.Standard)).toLowerCase();
  if (/2[.,]?4/.test(rf)) return BAND_24;
  if (/5/.test(rf)) return BAND_5;
  if (channel > 14) return BAND_5;
  if (channel > 0) return BAND_24;
  if (/11a(?:c|n)?(?:$|[^a-z])|(?:^|[, /])(?:a|ac)(?:$|[, /])/.test(standard)) return BAND_5;
  if (/11[bg]|(?:^|[, /])(?:b|g|bg|gn|bgn)(?:$|[, /])/.test(standard)) return BAND_24;
  const name = cleanText(rawValue(config.Name)).toLowerCase();
  const vendor = detectWanVendor(device).id;
  if (vendor === 'huawei' && /^ath\d+$/.test(name)) {
    const radio = Number(name.slice(3));
    if (radio < 8) return BAND_24;
    if (radio < 12) return BAND_5;
  }
  if (vendor === 'fiberhome' && /^wl[01](?:\.\d+)?$/.test(name)) return name[2] === '1' ? BAND_5 : BAND_24;
  return '';
}

function wlanBand(device = {}, index = 0) {
  const radio = wlanRadioBand(device, index);
  if (radio) return radio;
  return Number(index) >= 1 && Number(index) <= 4 ? BAND_24
    : Number(index) >= 5 && Number(index) <= 8 ? BAND_5 : '';
}

function writableParameter(config = {}, key = '') {
  return connectionHasParam(config, key) && config[key]?._writable !== false;
}

function validateSsid(value = '') {
  const ssid = cleanText(value);
  if (!ssid || Buffer.byteLength(ssid, 'utf8') > 32 || /[\u0000-\u001f\u007f]/.test(ssid)) {
    throw new Error('Nama WiFi/SSID wajib 1-32 byte tanpa karakter kontrol');
  }
  return ssid;
}

function assertUniqueSsid(device = {}, index = 0, ssid = '') {
  if (detectWanVendor(device).id !== 'huawei') return;
  const config = wlanConfiguration(device, index) || {};
  if (cleanText(rawValue(config.SSID)) === ssid) return;
  const band = wlanBand(device, index);
  const duplicate = Object.entries(wlanRoot(device)).find(([otherIndex, other]) =>
    /^\d+$/.test(otherIndex) && Number(otherIndex) !== Number(index)
    && !internalWlan(device, otherIndex) && activeWlan(other)
    && wlanBand(device, otherIndex) === band && cleanText(rawValue(other.SSID)) === ssid);
  if (duplicate) throw new Error(`Nama WiFi sudah digunakan SSID${duplicate[0]} pada band ${bandLabel(band)}. Gunakan nama berbeda.`);
}

function disabledWlan(config = {}) {
  if (connectionHasParam(config, 'Enable')) {
    if (isObject(config.Enable) && !Object.hasOwn(config.Enable, '_value')) return false;
    if (!['0', 'false', 'no', 'off', 'disabled'].includes(cleanText(rawValue(config.Enable)).toLowerCase())) return false;
    return !enabledValue(rawValue(config.Enable));
  }
  return cleanText(rawValue(config.Status)).toLowerCase() === 'disabled';
}

function readablePasswordValues(config = {}) {
  return [
    rawValue(config.KeyPassphrase),
    rawValue(config.X_HW_PreSharedKey),
    rawValue(config?.PreSharedKey?.['1']?.KeyPassphrase),
    rawValue(config?.PreSharedKey?.['1']?.PreSharedKey)
  ].map((value) => cleanText(value))
    .filter((value) => value && !/^[*x•]+$/i.test(value));
}

function readbackSecurity(config = {}, expected = {}) {
  const security = normalizeSecurity(expected.security);
  const beacon = cleanText(rawValue(config.BeaconType)).toLowerCase();
  const basicEncryption = cleanText(rawValue(config.BasicEncryptionModes)).toLowerCase();
  const authenticationText = [
    rawValue(config.WPAAuthenticationMode),
    rawValue(config.IEEE11iAuthenticationMode),
    rawValue(config.X_HW_AuthenticationMode),
    rawValue(config.WPAEncryptionModes),
    rawValue(config.IEEE11iEncryptionModes),
    rawValue(config.X_HW_EncryptionMode)
  ].map((value) => cleanText(value)).join(' ').toLowerCase();
  let actualSecurityEnabled = null;
  if (/wpa|11i/.test(beacon)) actualSecurityEnabled = true;
  else if (/basic|none|open/.test(beacon)) actualSecurityEnabled = false;
  else if (/aes|tkip/.test(basicEncryption) || /psk|wpa|11i/.test(authenticationText)) actualSecurityEnabled = true;
  else if (beacon || basicEncryption || authenticationText) actualSecurityEnabled = false;

  const expectedSecurityEnabled = security === 'pass' ? true : (security === 'none' ? false : null);
  const securityVerified = expectedSecurityEnabled === null || actualSecurityEnabled === expectedSecurityEnabled;
  const expectedPassword = security === 'pass' ? cleanText(expected.password) : '';
  const readablePasswords = readablePasswordValues(config);
  const passwordRequired = Boolean(expectedPassword);
  const passwordVerified = !passwordRequired || readablePasswords.includes(expectedPassword);
  return {
    expectedSecurity: security,
    actualSecurityEnabled,
    securityVerified,
    passwordRequired,
    passwordReadable: readablePasswords.length > 0,
    passwordVerified
  };
}

function normalizeBand(value = '') {
  const text = cleanText(value).toLowerCase();
  if (['2.4', '2.4g', '2.4ghz', '24', '24g', '24ghz'].includes(text)) return BAND_24;
  if (['5', '5g', '5ghz'].includes(text)) return BAND_5;
  return '';
}

function normalizeSecurity(value = '') {
  const text = cleanText(value).toLowerCase();
  if (['none', 'open'].includes(text)) return 'none';
  if (['pass', 'password', 'wpa', 'wpa2'].includes(text)) return 'pass';
  return '';
}

function bandLabel(band = '') {
  return band === BAND_5 ? '5 GHz' : '2,4 GHz';
}

function hasBand(device = {}, band = '') {
  return Object.entries(wlanRoot(device)).some(([index, config]) => /^\d+$/.test(index)
    && !internalWlan(device, index) && populatedWlan(config) && wlanBand(device, index) === band);
}

function readableSlot(config = {}) {
  return ['SSID', 'Enable', 'BeaconType'].every(key => connectionHasParam(config, key)
    && (!isObject(config[key]) || Object.hasOwn(config[key], '_value')));
}

function primarySsidIndexes(device = {}) {
  const protectedIndexes = new Set([1, 5]);
  for (const band of [BAND_24, BAND_5]) {
    const primary = Object.entries(wlanRoot(device)).filter(([index, config]) => /^\d+$/.test(index)
      && !internalWlan(device, index) && populatedWlan(config) && wlanBand(device, index) === band)
      .map(([index]) => Number(index)).sort((a, b) => a - b)[0];
    if (primary) protectedIndexes.add(primary);
  }
  return protectedIndexes;
}

function nextSsidIndex(device = {}, vendor = {}, band = '') {
  const primary = primarySsidIndexes(device);
  const reusable = Object.entries(wlanRoot(device)).filter(([index, config]) => /^\d+$/.test(index)
    && !primary.has(Number(index)) && !internalWlan(device, index)
    && wlanBand(device, index) === band && readableSlot(config) && disabledWlan(config)
    && ['SSID', 'Enable', 'BeaconType'].every(key => writableParameter(config, key)))
    .map(([index]) => Number(index)).sort((a, b) => a - b)[0];
  if (reusable) return reusable;
  // Only creation may use an unallocated conventional slot. Existing instances
  // are selected by their physical radio, including dynamically numbered ones.
  if (vendor.id !== 'huawei' || wlanRoot(device)._writable === false) return null;
  for (const index of (BAND_INDEXES[band] || []).slice(1)) {
    if (internalWlan(device, index) || primary.has(index)) continue;
    const config = wlanConfiguration(device, index);
    if (readableSlot(config) || populatedWlan(config)) continue;
    if (config && !disabledWlan(config)) continue;
    return index;
  }
  return null;
}

function addSsidOptions(device = {}) {
  const vendor = detectWanVendor(device);
  if (!['huawei', 'fiberhome'].includes(vendor.id)) {
    return {
      supported: false,
      vendor,
      bands: [],
      note: 'Tambah SSID otomatis tersedia untuk Huawei dan FiberHome.'
    };
  }
  const bands = [BAND_24, BAND_5]
    .filter((band) => hasBand(device, band))
    .map((band) => ({ value: band, label: bandLabel(band), nextIndex: nextSsidIndex(device, vendor, band) }));
  return {
    supported: bands.length > 0,
    vendor,
    bands,
    note: vendor.id === 'fiberhome'
      ? 'Slot SSID FiberHome nonaktif akan digunakan kembali.'
      : 'Index SSID Huawei dipilih otomatis dari slot yang tersedia.'
  };
}

function connectionHasParam(source = {}, key = '') {
  return isObject(source) && Object.prototype.hasOwnProperty.call(source, key);
}

function huaweiPasswordValues(path = '', config = {}, password = '') {
  return passwordValues(path, config, password);
}

function fiberHomePasswordValues(path = '', config = {}, password = '') {
  return passwordValues(path, config, password);
}

function passwordValues(path = '', config = {}, password = '', preferred = '') {
  const candidates = [
    ['KeyPassphrase', config],
    ['PreSharedKey.1.KeyPassphrase', config.PreSharedKey?.['1']],
    ['X_HW_PreSharedKey', config],
    ['PreSharedKey.1.PreSharedKey', config.PreSharedKey?.['1']]
  ].filter(([key, source]) => writableParameter(source, key.split('.').at(-1)));
  const populated = ([key, source]) => cleanText(rawValue(source[key.split('.').at(-1)])) !== '';
  const passphrase = ([key]) => /Passphrase|X_HW_PreSharedKey/.test(key);
  const preferredPassphrase = candidate => `${path}.${candidate[0]}` === preferred && passphrase(candidate);
  const selected = candidates.find(candidate => preferredPassphrase(candidate) && populated(candidate))
    || candidates.find(candidate => passphrase(candidate) && populated(candidate))
    || candidates.find(preferredPassphrase)
    || candidates.find(passphrase)
    || candidates[0];
  if (!selected) throw new Error('Parameter password WiFi yang dapat ditulis belum tersedia');
  return [parameterValue(`${path}.${selected[0]}`, password)];
}

function securityValues(device = {}, path = '', config = {}, security = 'none', password = '') {
  const vendor = detectWanVendor(device);
  const modes = vendor.id === 'fiberhome'
    ? (security === 'none'
      ? [
        ['BeaconType', 'Basic'],
        ['BasicAuthenticationMode', 'None'],
        ['BasicEncryptionModes', 'None'],
        ['WPAAuthenticationMode', 'None'],
        ['IEEE11iAuthenticationMode', 'None'],
        ['IEEE11iEncryptionModes', 'None']
      ]
      : [
        ['BeaconType', '11i'],
        ['BasicAuthenticationMode', 'None'],
        ['BasicEncryptionModes', 'None'],
        ['WPAAuthenticationMode', 'PSKAuthentication'],
        ['WPAEncryptionModes', 'AESEncryption'],
        ['IEEE11iAuthenticationMode', 'PSKAuthentication'],
        ['IEEE11iEncryptionModes', 'AESEncryption']
      ])
    : (security === 'none'
      ? [
        ['BeaconType', 'Basic'],
        ['BasicAuthenticationMode', 'None'],
        ['BasicEncryptionModes', 'None']
      ]
      : [
        ['BeaconType', 'WPAand11i'],
        ['BasicAuthenticationMode', 'None'],
        ['BasicEncryptionModes', 'None'],
        ['WPAAuthenticationMode', 'PSKAuthentication'],
        ['WPAEncryptionModes', 'TKIPandAESEncryption'],
        ['IEEE11iAuthenticationMode', 'PSKAuthentication'],
        ['IEEE11iEncryptionModes', 'AESEncryption'],
        ['X_HW_AuthenticationMode', 'WPA2PSKAuthentication'],
        ['X_HW_EncryptionMode', 'AESEncryption']
      ]);
  const values = modes
    .filter(([key]) => writableParameter(config, key))
    .map(([key, value]) => parameterValue(`${path}.${key}`, value));
  const currentBeacon = cleanText(rawValue(config.BeaconType));
  const beacon = values.find(([name]) => name === `${path}.BeaconType`);
  if (beacon) {
    const knownModes = Object.values(wlanRoot(device)).filter(isObject).map(item => cleanText(rawValue(item.BeaconType)));
    const modeMatches = value => security === 'none' ? /^(Basic|None|Open)$/i.test(value) : /wpa|11i/i.test(value);
    const knownMode = modeMatches(currentBeacon) ? currentBeacon : knownModes.find(modeMatches);
    if (knownMode) {
      beacon[1] = /^(basic|none|open)$/i.test(knownMode)
        ? knownMode[0].toUpperCase() + knownMode.slice(1).toLowerCase()
        : knownMode;
    }
  }
  if (security === 'pass') {
    values.push(...(vendor.id === 'fiberhome'
      ? fiberHomePasswordValues(path, config, password)
      : huaweiPasswordValues(path, config, password)));
  }
  return uniqueParameterValues(values).filter(([name, value]) => {
    const key = name.slice(path.length + 1);
    if (key.includes('.')) return true;
    if (rawValue(config[key]) === value) return false;
    // Vendor variants expose unsupported blank auth leaves. BeaconType controls
    // open/WPA mode; do not guess values for those optional attributes.
    if (key !== 'BeaconType' && !/KeyPassphrase|PreSharedKey/.test(key) && !cleanText(rawValue(config[key]))) return false;
    if (key === 'BasicAuthenticationMode' && !/^(None|EAPAuthentication|SharedAuthentication)$/i.test(cleanText(rawValue(config[key])))) return false;
    if (security === 'none' && /^(WPA|IEEE11i)/.test(key)) return false;
    return true;
  });
}

function enableValues(path = '', config = {}) {
  return [
    parameterValue(`${path}.Enable`, true, 'xsd:boolean'),
    ...(writableParameter(config, 'RadioEnabled') && cleanText(rawValue(config.RadioEnabled)) !== ''
      ? [parameterValue(`${path}.RadioEnabled`, true, 'xsd:boolean')]
      : [])
  ];
}

function addSsidBatches(device = {}, index = 0, payload = {}) {
  assertCustomerWlan(device, index);
  const ssid = validateSsid(payload.ssid);
  assertUniqueSsid(device, index, ssid);
  const security = normalizeSecurity(payload.security);
  const password = cleanText(payload.password);
  if (!ssid || ssid.length > 32) throw new Error('Nama SSID wajib diisi maksimal 32 karakter');
  if (!security) throw new Error('Security SSID wajib dipilih');
  if (security === 'pass' && (password.length < 8 || password.length > 63)) {
    throw new Error('Password WiFi wajib 8-63 karakter');
  }
  const config = wlanConfiguration(device, index);
  if (!isObject(config)) throw new Error(`WLANConfiguration.${index} belum tersedia`);
  if (payload.band && wlanBand(device, index) !== normalizeBand(payload.band)) throw new Error('Radio SSID berubah. Buka ulang pengaturan WiFi.');
  if (primarySsidIndexes(device).has(Number(index))) throw new Error('SSID utama tidak boleh digunakan untuk tambah SSID.');
  if (!disabledWlan(config)) throw new Error(`SSID${index} tidak terkonfirmasi nonaktif; konfigurasi tidak ditimpa.`);
  if (!readableSlot(config) || !['SSID', 'Enable', 'BeaconType'].every(key => writableParameter(config, key))) {
    throw new Error('Slot SSID belum terbaca lengkap atau tidak dapat ditulis. Tunggu inform modem.');
  }
  const path = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${index}`;
  const securityParams = securityValues(device, path, config, security, password);
  const passwordPattern = /\.(KeyPassphrase|PreSharedKey|X_HW_PreSharedKey)(\.|$)/;
  return [
    { name: 'ssid', values: [parameterValue(`${path}.SSID`, ssid)] },
    { name: 'security', values: securityParams.filter(([name]) => !passwordPattern.test(name)) },
    { name: 'password', values: securityParams.filter(([name]) => passwordPattern.test(name)) },
    { name: 'enable', values: enableValues(path, config) }
  ].map((batch) => ({ ...batch, values: uniqueParameterValues(batch.values) }))
    .filter((batch) => batch.values.length);
}

function prepareAddSsid(device = {}, payload = {}) {
  const options = addSsidOptions(device);
  if (!options.supported) throw new Error(options.note);
  const band = normalizeBand(payload.band);
  if (!band) throw new Error('Band WiFi wajib dipilih');
  const bandOption = options.bands.find((item) => item.value === band);
  if (!bandOption) throw new Error(`Band ${bandLabel(band)} tidak tersedia pada modem`);
  if (!bandOption.nextIndex) throw new Error(`Slot SSID ${bandLabel(band)} sudah penuh`);
  const ssid = validateSsid(payload.ssid);
  const security = 'none';
  const password = '';
  return {
    vendor: options.vendor,
    band,
    bandLabel: bandLabel(band),
    index: bandOption.nextIndex,
    ssid,
    security,
    password,
    path: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${bandOption.nextIndex}`,
    needsObject: !readableSlot(wlanConfiguration(device, bandOption.nextIndex))
  };
}

function addSsidObjectParameters(device = {}, band = '') {
  if (detectWanVendor(device).id !== 'huawei') return [];
  const source = Object.entries(wlanRoot(device)).filter(([index, config]) => /^\d+$/.test(index)
    && !internalWlan(device, index) && populatedWlan(config) && wlanRadioBand(device, index) === band
    && writableParameter(config, 'X_HW_RFBand') && cleanText(rawValue(config.X_HW_RFBand)))
    .sort(([a], [b]) => Number(a) - Number(b))[0];
  return source ? [parameterValue('X_HW_RFBand', rawValue(source[1].X_HW_RFBand))] : [];
}

function resolveCreatedSsid(before = {}, after = {}, plan = {}, instanceNumber = 0) {
  const old = new Set(Object.entries(wlanRoot(before)).filter(([index, config]) => /^\d+$/.test(index) && readableSlot(config)).map(([index]) => Number(index)));
  const primary = primarySsidIndexes(before);
  const candidates = Object.entries(wlanRoot(after)).filter(([index, config]) => /^\d+$/.test(index)
    && !old.has(Number(index)) && !primary.has(Number(index)) && readableSlot(config) && disabledWlan(config));
  const matched = candidates.filter(([index]) => {
    if (internalWlan(after, index)) return false;
    if (Number(instanceNumber) > 0 && Number(index) !== Number(instanceNumber)) return false;
    return wlanRadioBand(after, index) === plan.band;
  });
  if (matched.length !== 1) return null;
  const index = Number(matched[0][0]);
  return { ...plan, index, path: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${index}`, needsObject: false };
}

function readbackStatus(device = {}, expected = {}) {
  const config = wlanConfiguration(device, expected.index);
  const actualSsid = cleanText(rawValue(config?.SSID));
  const security = readbackSecurity(config || {}, expected);
  const active = activeWlan(config);
  const bandVerified = !expected.band || wlanBand(device, expected.index) === normalizeBand(expected.band);
  return {
    verified: Boolean(
      isObject(config)
      && actualSsid === expected.ssid
      && active
      && bandVerified
      && security.securityVerified
      && security.passwordVerified
    ),
    index: expected.index,
    path: expected.path,
    expectedSsid: expected.ssid,
    actualSsid,
    active,
    bandVerified,
    ...security
  };
}

module.exports = {
  BAND_24,
  BAND_5,
  addSsidBatches,
  addSsidOptions,
  prepareAddSsid,
  addSsidObjectParameters,
  readbackStatus,
  resolveCreatedSsid,
  internalWlan,
  assertCustomerWlan,
  wlanBand,
  wlanRadioBand,
  wlanConfiguration,
  _internal: {
    activeWlan,
    bandLabel,
    enableValues,
    fiberHomePasswordValues,
    huaweiPasswordValues,
    nextSsidIndex,
    normalizeBand,
    normalizeSecurity,
    populatedWlan,
    readableSlot,
    primarySsidIndexes,
    passwordValues,
    validateSsid,
    assertUniqueSsid,
    writableParameter,
    readbackSecurity,
    readablePasswordValues,
    securityValues
  }
};
