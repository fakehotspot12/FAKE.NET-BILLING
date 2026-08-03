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
  const status = wlanStatusValue(config);
  if (status !== null) return status;
  if (!enabledValue(rawValue(config.Enable))) return false;
  if (Object.prototype.hasOwnProperty.call(config, 'RadioEnabled') && !enabledValue(rawValue(config.RadioEnabled))) return false;
  return true;
}

function configuredSsid(config = {}) {
  return Boolean(cleanText(rawValue(config.SSID)));
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
  return (BAND_INDEXES[band] || []).some((index) => isObject(wlanConfiguration(device, index)));
}

function nextSsidIndex(device = {}, vendor = {}, band = '') {
  for (const index of BAND_INDEXES[band] || []) {
    const config = wlanConfiguration(device, index);
    if (vendor.id === 'huawei') {
      if (!isObject(config) || (!activeWlan(config) && !configuredSsid(config))) return index;
    } else if (vendor.id === 'fiberhome') {
      if (isObject(config) && !activeWlan(config)) return index;
    }
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
  const values = [];
  if (isObject(config?.PreSharedKey?.['1'])) {
    if (connectionHasParam(config.PreSharedKey['1'], 'KeyPassphrase')) {
      values.push(parameterValue(`${path}.PreSharedKey.1.KeyPassphrase`, password));
    }
    values.push(parameterValue(`${path}.PreSharedKey.1.PreSharedKey`, password));
  }
  if (connectionHasParam(config, 'X_HW_PreSharedKey')) {
    values.push(parameterValue(`${path}.X_HW_PreSharedKey`, password));
  }
  if (!values.length) values.push(parameterValue(`${path}.PreSharedKey.1.PreSharedKey`, password));
  return uniqueParameterValues(values);
}

function fiberHomePasswordValues(path = '', config = {}, password = '') {
  return uniqueParameterValues([
    parameterValue(`${path}.KeyPassphrase`, password),
    ...(isObject(config?.PreSharedKey?.['1'])
      ? [parameterValue(`${path}.PreSharedKey.1.KeyPassphrase`, password)]
      : []),
    parameterValue(`${path}.PreSharedKey.1.PreSharedKey`, password)
  ]);
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
    .filter(([key]) => connectionHasParam(config, key))
    .map(([key, value]) => parameterValue(`${path}.${key}`, value));
  if (security === 'pass') {
    values.push(...(vendor.id === 'fiberhome'
      ? fiberHomePasswordValues(path, config, password)
      : huaweiPasswordValues(path, config, password)));
  }
  return uniqueParameterValues(values);
}

function enableValues(path = '', config = {}) {
  return [
    parameterValue(`${path}.Enable`, true, 'xsd:boolean'),
    ...(connectionHasParam(config, 'RadioEnabled')
      ? [parameterValue(`${path}.RadioEnabled`, true, 'xsd:boolean')]
      : [])
  ];
}

function addSsidBatches(device = {}, index = 0, payload = {}) {
  const ssid = cleanText(payload.ssid);
  const security = normalizeSecurity(payload.security);
  const password = cleanText(payload.password);
  if (!ssid || ssid.length > 32) throw new Error('Nama SSID wajib diisi maksimal 32 karakter');
  if (!security) throw new Error('Security SSID wajib dipilih');
  if (security === 'pass' && (password.length < 8 || password.length > 63)) {
    throw new Error('Password WiFi wajib 8-63 karakter');
  }
  const config = wlanConfiguration(device, index);
  if (!isObject(config)) throw new Error(`WLANConfiguration.${index} belum tersedia`);
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
  const ssid = cleanText(payload.ssid);
  const security = normalizeSecurity(payload.security);
  const password = cleanText(payload.password);
  if (!ssid || ssid.length > 32) throw new Error('Nama SSID wajib diisi maksimal 32 karakter');
  if (!security) throw new Error('Security SSID wajib dipilih');
  if (security === 'pass' && (password.length < 8 || password.length > 63)) {
    throw new Error('Password WiFi wajib 8-63 karakter');
  }
  return {
    vendor: options.vendor,
    band,
    bandLabel: bandLabel(band),
    index: bandOption.nextIndex,
    ssid,
    security,
    password,
    path: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${bandOption.nextIndex}`,
    needsObject: !isObject(wlanConfiguration(device, bandOption.nextIndex))
  };
}

function readbackStatus(device = {}, expected = {}) {
  const config = wlanConfiguration(device, expected.index);
  const actualSsid = cleanText(rawValue(config?.SSID));
  const security = readbackSecurity(config || {}, expected);
  const active = activeWlan(config);
  return {
    verified: Boolean(
      isObject(config)
      && actualSsid === expected.ssid
      && active
      && security.securityVerified
      && security.passwordVerified
    ),
    index: expected.index,
    path: expected.path,
    expectedSsid: expected.ssid,
    actualSsid,
    active,
    ...security
  };
}

module.exports = {
  BAND_24,
  BAND_5,
  addSsidBatches,
  addSsidOptions,
  prepareAddSsid,
  readbackStatus,
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
    readbackSecurity,
    readablePasswordValues,
    securityValues
  }
};
