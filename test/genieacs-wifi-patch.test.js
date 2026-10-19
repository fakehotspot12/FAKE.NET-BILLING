'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const acs = require('../src/genieacs');
const wifi = require('../src/genieacs-wifi');
const cfg = { enabled: true, baseUrl: 'http://acs.example.test', connectionRequest: false };
const base = index => `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${index}`;
const leaf = value => ({ _value: value, _writable: true });
function device() {
  return { _id: 'huawei-fixture', _deviceId: { _Manufacturer: 'Huawei', _ProductClass: 'HG8145V5' },
    InternetGatewayDevice: { WANDevice: { 1: { WANConnectionDevice: { 1: { WANPPPConnection: { 1: { Username: leaf('unchanged'), Password: leaf('unchanged'), VLAN: leaf(100) } } } } } },
      LANDevice: { 1: { WLANConfiguration: {
        1: { SSID: leaf('Main'), Enable: leaf(true), Status: leaf('Up'), BeaconType: leaf('WPAand11i'), BasicAuthenticationMode: leaf('None'), BasicEncryptionModes: leaf('None'), KeyPassphrase: leaf('mainpass123'), PreSharedKey: { 1: { KeyPassphrase: leaf('mainpass123'), PreSharedKey: leaf('abcdef'.repeat(10) + 'abcd') } } },
        2: { SSID: leaf('Dormant'), Enable: leaf(false), Status: leaf('Up'), BeaconType: leaf('WPAand11i'), BasicAuthenticationMode: leaf(''), BasicEncryptionModes: leaf('None'), KeyPassphrase: leaf('mainpass123'), PreSharedKey: { 1: { PreSharedKey: leaf('mainpass123') } } },
        5: { SSID: leaf('Main 5G'), Enable: leaf(true), BeaconType: leaf('WPA2'), KeyPassphrase: leaf('different5g') },
        6: { _object: true, SSID: { _writable: true }, Enable: leaf(false), BeaconType: { _writable: true } }
      } } } } };
}

test('new SSIDs always start open even if a stale browser submits a password', () => {
  const raw = device();
  const plan = wifi.prepareAddSsid(raw, { band: '2.4g', ssid: 'Guest', security: 'pass', password: 'mainpass123' });
  assert.equal(plan.index, 2);
  assert.equal(plan.security, 'none');
  assert.equal(plan.password, '');
  const batches = wifi.addSsidBatches(raw, plan.index, plan);
  assert.equal(batches.some(batch => batch.name === 'password'), false);
  assert.ok(batches.flatMap(batch => batch.values).every(([name]) => name.startsWith(`${base(2)}.`)));
  assert.equal(wifi._internal.activeWlan(raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2]), false);
});

test('adding guest SSID never reuses a primary network or an enabled radio that is temporarily down', () => {
  const raw = device();
  const wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[1].Enable._value = false;
  wlan[2].Enable._value = true;
  wlan[2].Status._value = 'Down';
  wlan[3] = { SSID: leaf('Unused'), Enable: leaf(false), Status: leaf('Disabled'), BeaconType: leaf('Basic') };
  assert.equal(wifi.prepareAddSsid(raw, { band: '2.4g', ssid: 'Guest' }).index, 3);
});

test('read-only RadioEnabled is never included in CWMP writes', () => {
  const raw = device();
  const config = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2];
  config.RadioEnabled = { _value: false, _writable: false };
  const plan = acs._internal.wifiCredentialsPlan(raw, { ssid: 'Guest', ssidParameter: `${base(2)}.SSID`, enabled: true });
  assert.equal(plan.values.some(([name]) => /\.RadioEnabled$/.test(name)), false);
  assert.equal(wifi._internal.enableValues(base(2), config).some(([name]) => /\.RadioEnabled$/.test(name)), false);
});

test('stale Up status never overrides an explicitly disabled radio', () => {
  assert.equal(wifi._internal.activeWlan({ Enable: leaf(true), RadioEnabled: leaf(false), Status: leaf('Up') }), false);
});

test('Huawei blank or metadata-only RadioEnabled does not override a real Up status', () => {
  assert.equal(wifi._internal.activeWlan({ Enable: leaf(true), RadioEnabled: { _writable: true }, Status: leaf('Up') }), true);
  assert.equal(wifi._internal.activeWlan({ Enable: leaf(true), RadioEnabled: leaf(''), Status: leaf('Up') }), true);
  const raw = device();
  raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[1].RadioEnabled = leaf('');
  const plan = acs._internal.wifiCredentialsPlan(raw, { ssid: 'Rename', ssidParameter: `${base(1)}.SSID`, usePassword: true });
  assert.deepEqual(plan.values, [[`${base(1)}.SSID`, 'Rename', 'xsd:string']]);
});

test('enabling a dormant SSID sets open mode, not its old or primary password', () => {
  const raw = device();
  const plan = acs._internal.wifiCredentialsPlan(raw, { ssid: 'Guest', ssidParameter: `${base(2)}.SSID`, enabled: true, usePassword: true, password: 'mainpass123', passwordParameter: `${base(2)}.KeyPassphrase` });
  assert.equal(plan.security, 'none');
  assert.equal(plan.password, '');
  assert.equal(plan.newlyEnabled, true);
  assert.deepEqual(plan.batches.map(batch => batch.name), ['ssid', 'security', 'enable']);
  assert.equal(plan.values.some(([name]) => /KeyPassphrase|PreSharedKey/.test(name)), false);
  assert.equal(plan.values.some(([name]) => /BasicAuthenticationMode/.test(name)), false);
});

test('renaming active Huawei SSID leaves WPA mode, password, enable, and other slots unchanged', () => {
  const raw = device();
  const original = JSON.stringify(raw);
  const plan = acs._internal.wifiCredentialsPlan(raw, { ssid: 'New Name', ssidParameter: `${base(1)}.SSID`, usePassword: true, enabled: true });
  assert.deepEqual(plan.values, [[`${base(1)}.SSID`, 'New Name', 'xsd:string']]);
  assert.deepEqual(plan.batches.map(batch => batch.name), ['ssid']);
  assert.equal(JSON.stringify(raw), original);
});

test('password edits use one writable passphrase instead of also writing a raw PSK', () => {
  const raw = device();
  const plan = acs._internal.wifiCredentialsPlan(raw, { ssid: 'Main', ssidParameter: `${base(1)}.SSID`, password: 'newpass123', passwordParameter: `${base(1)}.PreSharedKey.1.PreSharedKey`, usePassword: true });
  assert.deepEqual(plan.values, [[`${base(1)}.KeyPassphrase`, 'newpass123', 'xsd:string']]);
  assert.equal(plan.values.some(([name]) => /PreSharedKey\.1\.PreSharedKey/.test(name)), false);
});

test('open SSIDs never expose an inherited/stale password in billing networks', () => {
  const raw = device();
  raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2].BeaconType._value = 'Basic';
  const row = acs.normalizeDevice(raw).wifiNetworks.find(network => network.index === 2);
  assert.equal(row.securityEnabled, false);
  assert.equal(row.password, '');
  assert.equal(raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2].KeyPassphrase._value, 'mainpass123');
});

test('read-only leaves and empty phantom SSIDs are rejected before a CWMP write', () => {
  const raw = device();
  raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[1].SSID._writable = false;
  assert.throws(() => acs._internal.wifiCredentialsPlan(raw, { ssid: 'New', ssidParameter: `${base(1)}.SSID` }), /tidak dapat ditulis/);
  assert.throws(() => acs._internal.wifiCredentialsPlan(raw, { ssid: 'New', ssidParameter: `${base(6)}.SSID` }), /belum terbaca/);
});

test('SSID validation handles UTF-8 bytes and control characters before CWMP', () => {
  assert.equal(wifi._internal.validateSsid('Rumah'), 'Rumah');
  assert.throws(() => wifi._internal.validateSsid('\u00e9'.repeat(17)), /1-32 byte/);
  assert.throws(() => wifi._internal.validateSsid('Bad\u0000SSID'), /karakter kontrol/);
});

test('new SSID uses the actual CPE instance, not a guessed cache slot', () => {
  const before = device();
  const after = structuredClone(before);
  after.InternetGatewayDevice.LANDevice[1].WLANConfiguration[7] = { SSID: leaf('New Slot'), Enable: leaf(false), BeaconType: leaf('Basic'), X_HW_RFBand: leaf('5GHz') };
  const plan = wifi.resolveCreatedSsid(before, after, { index: 6, band: '5ghz', ssid: 'New 5G', security: 'none' });
  assert.equal(plan.index, 7);
  assert.equal(plan.path, base(7));
  assert.equal(wifi.resolveCreatedSsid(before, after, { band: '2.4ghz' }), null);
  const dynamic = structuredClone(before);
  dynamic.InternetGatewayDevice.LANDevice[1].WLANConfiguration[9] = { SSID: leaf('Extra'), Name: leaf('ath2'), Enable: leaf(false), BeaconType: leaf('Basic'), X_HW_RFBand: leaf('2.4GHz') };
  assert.equal(wifi.resolveCreatedSsid(before, dynamic, { band: '2.4ghz' }).index, 9);
  assert.ok(acs.normalizeDevice(dynamic).wifiNetworks.some(network => network.index === 9));
});

test('secured mode requires a manual password after an SSID was opened', () => {
  const raw = device();
  const slot = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2];
  slot.Enable._value = true;
  slot.BeaconType._value = 'Basic';
  assert.throws(() => acs._internal.wifiCredentialsPlan(raw, { ssid: 'Guest', ssidParameter: `${base(2)}.SSID`, usePassword: true }), /Isi password/);
  const plan = acs._internal.wifiCredentialsPlan(raw, { ssid: 'Guest', ssidParameter: `${base(2)}.SSID`, usePassword: true, password: 'guestpass123', passwordParameter: `${base(2)}.KeyPassphrase` });
  assert.equal(plan.security, 'pass');
  assert.equal(plan.values.filter(([name]) => /KeyPassphrase|PreSharedKey/.test(name)).length, 1);
});

function mockedAcs(t, raw, fault = false, afterTask = null) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const target = new URL(url);
    if (target.pathname === '/devices/') return Response.json([structuredClone(raw)]);
    if (target.pathname === '/faults/') return Response.json(fault ? [{ code: 'cwmp.9003', message: 'Invalid arguments' }] : []);
    if (target.pathname.endsWith('/tasks') && options.method === 'POST') {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (!fault && body.name === 'setParameterValues') {
        for (const [name, value] of body.parameterValues) {
          const keys = name.split('.');
          const key = keys.pop();
          const parent = keys.reduce((item, field) => item[field], raw);
          parent[key]._value = value;
        }
      }
      if (afterTask) afterTask(body);
      return Response.json(fault && body.name === 'setParameterValues' ? { _id: 'new-fault-task' } : {});
    }
    throw new Error(`Unexpected ACS request: ${options.method || 'GET'} ${target.pathname}`);
  });
  return calls;
}

test('end-to-end rename sends only SSID and reads only selected WiFi leaves', async t => {
  const raw = device();
  const wanBefore = JSON.stringify(raw.InternetGatewayDevice.WANDevice);
  const otherBefore = JSON.stringify(raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[5]);
  const calls = mockedAcs(t, raw);
  const result = await acs.setWifiCredentials(cfg, raw._id, { ssid: 'Renamed', ssidParameter: `${base(1)}.SSID`, usePassword: true });
  assert.equal(result.verification.verified, true);
  assert.deepEqual(calls.filter(item => item.name === 'setParameterValues').map(item => item.parameterValues), [[[`${base(1)}.SSID`, 'Renamed', 'xsd:string']]]);
  assert.ok(calls.filter(item => item.name === 'getParameterValues').flatMap(item => item.parameterNames).every(name => name.startsWith(`${base(1)}.`)));
  assert.equal(JSON.stringify(raw.InternetGatewayDevice.WANDevice), wanBefore);
  assert.equal(JSON.stringify(raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[5]), otherBefore);
});

test('end-to-end enable confirms open mode before enabling and preserves main credentials', async t => {
  const raw = device();
  const mainBefore = JSON.stringify(raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[1]);
  const calls = mockedAcs(t, raw);
  const result = await acs.setWifiCredentials(cfg, raw._id, { ssid: 'Guest', ssidParameter: `${base(2)}.SSID`, enabled: true, usePassword: true, password: 'mainpass123' });
  assert.equal(result.security, 'none');
  assert.equal(result.verification.verified, true);
  assert.ok(calls.some(item => item.name === 'getParameterValues' && item.parameterNames.includes(`${base(2)}.Status`)));
  const enablePosition = calls.findIndex(item => item.parameterValues?.some(([name]) => name === `${base(2)}.Enable`));
  const modePosition = calls.findIndex(item => item.parameterValues?.some(([name]) => name === `${base(2)}.BeaconType`));
  assert(modePosition >= 0 && modePosition < enablePosition);
  assert(calls.some((item, index) => index < enablePosition && item.name === 'getParameterValues' && item.parameterNames.includes(`${base(2)}.BeaconType`)));
  assert.equal(calls.flatMap(item => item.parameterValues || []).some(([name]) => /PreSharedKey|KeyPassphrase/.test(name)), false);
  assert.equal(JSON.stringify(raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[1]), mainBefore);
});

test('a CWMP rejection stops later writes instead of enabling or changing other WiFi', async t => {
  const raw = device();
  const before = JSON.stringify(raw);
  const calls = mockedAcs(t, raw, true);
  await assert.rejects(acs.setWifiCredentials(cfg, raw._id, { ssid: 'Guest', ssidParameter: `${base(2)}.SSID`, enabled: true }), /cwmp.9003/);
  assert.equal(calls.filter(item => item.name === 'setParameterValues').length, 1);
  assert.equal(JSON.stringify(raw), before);
});

test('WiFi popup refresh requests only real cached leaves, never guessed objects or roots', async t => {
  const raw = device();
  const original = JSON.stringify(raw);
  const calls = mockedAcs(t, raw);
  await acs.getWifiConfiguration(cfg, raw._id, { refresh: true });
  const reads = calls.filter(item => item.name === 'getParameterValues').flatMap(item => item.parameterNames);
  assert(reads.length > 0);
  assert.equal(reads.some(name => name.includes('*') || name.startsWith('Device.WiFi') || name.startsWith(`${base(6)}.`)), false);
  assert.ok(reads.every(name => /^InternetGatewayDevice\.LANDevice\.1\.WLANConfiguration\.(1|2|5)\./.test(name)));
  assert.equal(JSON.stringify(raw), original);
});

test('SSID stays disabled if open mode cannot be verified after the mode task', async t => {
  const raw = device();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/devices/') return Response.json([raw]);
    if (pathname.endsWith('/tasks')) {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (body.parameterValues?.some(([name]) => name === `${base(2)}.SSID`)) raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2].SSID._value = 'Guest';
      return Response.json({});
    }
    throw new Error(`Unexpected request ${pathname}`);
  });
  await assert.rejects(acs.setWifiCredentials(cfg, raw._id, { ssid: 'Guest', ssidParameter: `${base(2)}.SSID`, enabled: true }), /SSID belum diaktifkan/);
  assert.equal(calls.flatMap(item => item.parameterValues || []).some(([name]) => name === `${base(2)}.Enable`), false);
  assert.equal(raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2].Enable._value, false);
});

function withBackhaul(ssid = 'BackhaulSSID5caaccef') {
  const raw = device();
  raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[9] = {
    SSID: leaf(ssid), Name: leaf('ath12'), Enable: leaf(false), Status: leaf('Disabled'),
    Standard: leaf('11ac'), BeaconType: leaf('WPAand11i'), KeyPassphrase: leaf('backhaulpass')
  };
  return raw;
}

test('Huawei internal backhaul is excluded even after it was renamed', () => {
  for (const name of ['BackhaulSSID5caaccef', 'STARNET', '123']) {
    const raw = withBackhaul(name);
    const original = JSON.stringify(raw);
    assert.equal(wifi.internalWlan(raw, 9), true);
    const normalized = acs.normalizeDevice(raw);
    assert.equal(normalized.wifiNetworks.some(n => n.index === 9), false);
    assert.equal(normalized.ssid5, 'Main 5G');
    assert.equal(normalized.ssid5Parameter, `${base(5)}.SSID`);
    assert.equal(acs._internal.existingWifiDetailParameterNames(raw).some(p => p.startsWith(`${base(9)}.`)), false);
    assert.equal(JSON.stringify(raw), original);
  }
});

test('customer names containing backhaul and ordinary dynamic index 9 remain usable', () => {
  const raw = withBackhaul('Rumah Backhaul');
  const wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[9].Name = leaf('ath9');
  assert.equal(wifi.internalWlan(raw, 9), false);
  assert.equal(acs.normalizeDevice(raw).wifiNetworks.find(n => n.index === 9).band, '5G');
  wlan[1].SSID = leaf('BackhaulSSID5caaccef');
  assert.equal(wifi.internalWlan(raw, 1), false);
  assert.equal(acs.normalizeDevice(raw).wifiNetworks.some(n => n.index === 1), true);
  raw._deviceId._Manufacturer = 'ZTE';
  raw._deviceId._ProductClass = 'F663';
  wlan[9].SSID = leaf('BackhaulSSID5caaccef');
  wlan[9].Name = leaf('ath12');
  assert.equal(wifi.internalWlan(raw, 9), false);
});

test('backhaul cannot be renamed, enabled or used as an add-SSID target', () => {
  const raw = withBackhaul('STARNET');
  for (const enabled of [true, false]) {
    assert.throws(() => acs._internal.wifiCredentialsPlan(raw, { ssidParameter: `${base(9)}.SSID`, ssid: 'Guest', enabled }), /backhaul internal/);
  }
  assert.throws(() => wifi.addSsidBatches(raw, 9, { ssid: 'Guest', security: 'none' }), /backhaul internal/);
});

test('new object discovery never adopts a backhaul or an unrelated CPE instance', () => {
  const before = device();
  const after = withBackhaul();
  const plan = { band: '5ghz', ssid: 'New 5G', security: 'none' };
  assert.equal(wifi.resolveCreatedSsid(before, after, plan), null);
  after.InternetGatewayDevice.LANDevice[1].WLANConfiguration[7] = {
    SSID: leaf('Guest'), Enable: leaf(false), BeaconType: leaf('Basic'), Standard: leaf('11ac')
  };
  assert.equal(wifi.resolveCreatedSsid(before, after, plan, 9), null);
  assert.equal(wifi.resolveCreatedSsid(before, after, plan, 7).index, 7);
});

test('allocated empty Huawei slots are reused instead of issuing another addObject', () => {
  const raw = device(), wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[2].Enable._value = true;
  wlan[3] = { SSID: leaf(''), Enable: leaf(false), BeaconType: leaf(''), Standard: leaf(''), Name: leaf('') };
  wlan[6] = structuredClone(wlan[3]);
  for (const [band, index] of [['2.4g', 3], ['5g', 6]]) {
    const plan = wifi.prepareAddSsid(raw, { band, ssid: 'Guest' });
    assert.equal(plan.index, index); assert.equal(plan.needsObject, false);
    assert(acs._internal.existingWifiDetailParameterNames(raw).includes(`${base(index)}.SSID`));
    assert(wifi.addSsidBatches(raw, index, plan).flatMap(b => b.values).every(([name]) => name.startsWith(`${base(index)}.`)));
  }
});

test('actual radio overrides numeric slot ranges and disabled dynamic slots are reusable', () => {
  const raw = device(), wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[2].Enable._value = true;
  wlan[6] = { SSID: leaf('Old 2G'), Enable: leaf(false), BeaconType: leaf('Basic'), Name: leaf('ath2') };
  wlan[10] = { SSID: leaf('Old 5G'), Enable: leaf(false), BeaconType: leaf('Basic'), Name: leaf('ath9') };
  assert.equal(wifi.prepareAddSsid(raw, { band: '2.4g', ssid: 'Guest 2G' }).index, 6);
  assert.equal(wifi.prepareAddSsid(raw, { band: '5g', ssid: 'Guest 5G' }).index, 10);
  assert.throws(() => wifi.addSsidBatches(raw, 6, { band: '5g', ssid: 'Guest', security: 'none' }), /Radio SSID berubah/);
});

test('FiberHome bgn and a,n,ac radio standards work even when the slot ranges are interleaved', () => {
  const raw = device(); raw._deviceId = { _Manufacturer: 'FiberHome', _ProductClass: 'HG6145D2' };
  const wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[2].Standard = leaf('a,n,ac'); wlan[5].Standard = leaf('a,n,ac');
  wlan[6] = { SSID: leaf('Dormant 2G'), Enable: leaf(false), BeaconType: leaf('Basic'), Standard: leaf('bgn') };
  assert.equal(wifi.wlanBand(raw, 2), wifi.BAND_5); assert.equal(wifi.wlanBand(raw, 6), wifi.BAND_24);
  // The first physical 5 GHz interface is protected as the primary for that radio.
  assert.equal(wifi.prepareAddSsid(raw, { band: '2.4g', ssid: 'Guest' }).index, 6);
  assert.throws(() => wifi.prepareAddSsid(raw, { band: '5g', ssid: 'Guest' }), /sudah penuh/);
});

test('backhaul and phantom slots cannot make a single-band modem appear dual-band', () => {
  const raw = withBackhaul(); delete raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[5];
  const bands = wifi.addSsidOptions(raw).bands;
  assert.deepEqual(bands.map(b => b.value), ['2.4ghz']);
  raw._deviceId._ProductClass = 'EG8145V5';
  assert.equal(wifi.internalWlan(raw, 9), true);
  assert.equal(wifi.addSsidOptions(raw).bands.some(b => b.value === '5ghz'), false);
});

test('error backhaul and renamed internal radio never participate in target ordering', () => {
  const raw = withBackhaul('Renamed'); const wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[9].Status = leaf('Error');
  wlan[6] = { SSID: leaf('Guest'), Enable: leaf(false), BeaconType: leaf('Basic'), Standard: leaf('11ac') };
  assert.equal(wifi.prepareAddSsid(raw, { band: '5g', ssid: 'New' }).index, 6);
  delete wlan[9].Name;
  assert.equal(wifi.internalWlan(raw, 9), true);
  assert(acs._internal.existingWifiDetailParameterNames(raw).every(name => !name.startsWith(`${base(9)}.`)));
});

test('missing Enable values and read-only slots are never considered reusable', () => {
  const raw = device(), wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[2].Enable = leaf(''); wlan[3] = { SSID: leaf('Other'), Enable: leaf(false), BeaconType: leaf('Basic') }; wlan[3].SSID._writable = false;
  assert.throws(() => wifi.addSsidBatches(raw, 2, { ssid: 'Guest', security: 'none' }), /tidak terkonfirmasi nonaktif/);
  assert.equal(wifi.prepareAddSsid(raw, { band: '2.4g', ssid: 'Guest' }).index, 4);
});

test('new-object matching refuses guessed bands, active interfaces and primary radios', () => {
  const before = device(), after = structuredClone(before), wlan = after.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[7] = { SSID: leaf('New'), Enable: leaf(false), BeaconType: leaf('Basic') };
  const plan = { band: wifi.BAND_5 };
  assert.equal(wifi.resolveCreatedSsid(before, after, plan, 7), null);
  wlan[7].Name = leaf('ath9'); assert.equal(wifi.resolveCreatedSsid(before, after, plan, 7).index, 7);
  wlan[7].Enable = leaf(true); assert.equal(wifi.resolveCreatedSsid(before, after, plan, 7), null);
});

test('readback cannot report success for a network on the wrong radio', () => {
  const raw = device(), wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[2] = { SSID: leaf('Guest'), Enable: leaf(true), BeaconType: leaf('Basic'), Standard: leaf('11bgn') };
  const result = wifi.readbackStatus(raw, { index: 2, ssid: 'Guest', band: '5ghz', security: 'none' });
  assert.equal(result.bandVerified, false); assert.equal(result.verified, false);
});

test('end-to-end add SSID reuses allocated slots for both radios without changing primary/WAN/backhaul', async t => {
  for (const [band, index, name, standard] of [['2.4g', 3, 'ath2', '11bgn'], ['5g', 6, 'ath9', '11ac']]) {
    const raw = withBackhaul(), wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
    wlan[2].Enable._value = true;
    wlan[index] = { SSID: leaf(''), Enable: leaf(false), BeaconType: leaf(''), Name: leaf(name), Standard: leaf(standard) };
    const original = structuredClone(raw);
    const calls = mockedAcs(t, raw);
    const result = await acs.addWifiSsid(cfg, `${raw._id}-${index}`, { band, ssid: 'Guest' });
    assert.equal(result.ssid.index, index); assert.equal(result.ssid.verified, true);
    assert.equal(calls.some(c => c.name === 'addObject'), false);
    assert(calls.filter(c => c.name === 'setParameterValues').flatMap(c => c.parameterValues).every(([p]) => p.startsWith(`${base(index)}.`)));
    assert.equal(wlan[index].BeaconType._value, 'Basic');
    assert.equal(wlan[index].Enable._value, true);
    assert.deepEqual(raw.InternetGatewayDevice.WANDevice, original.InternetGatewayDevice.WANDevice);
    for (const untouched of [1, 5, 9]) assert.deepEqual(wlan[untouched], original.InternetGatewayDevice.LANDevice[1].WLANConfiguration[untouched]);
    t.mock.restoreAll();
  }
});

test('CPE refresh happens before choosing a slot so an externally occupied slot is not overwritten', async t => {
  const raw = device(), wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[3] = { SSID: leaf('Free'), Enable: leaf(false), BeaconType: leaf('Basic'), Standard: leaf('11bgn') };
  const calls = mockedAcs(t, raw, false, body => {
    if (body.name === 'getParameterValues' && !calls.some(c => c.name === 'setParameterValues')) wlan[2].Enable._value = true;
  });
  const result = await acs.addWifiSsid(cfg, 'refreshed-add', { band: '2.4g', ssid: 'Guest' });
  assert.equal(result.ssid.index, 3);
  assert(calls.filter(c => c.name === 'setParameterValues').flatMap(c => c.parameterValues).every(([p]) => p.startsWith(`${base(3)}.`)));
});

test('SSID is not enabled if the modem returns a different physical radio before activation', async t => {
  const raw = device(), wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[6] = { SSID: leaf('Old'), Enable: leaf(false), BeaconType: leaf('Basic'), Standard: leaf('11ac') };
  const calls = mockedAcs(t, raw, false, body => {
    if (body.parameterValues?.some(([p]) => p === `${base(6)}.SSID`)) wlan[6].Standard._value = '11bgn';
  });
  await assert.rejects(acs.addWifiSsid(cfg, 'wrong-radio-add', { band: '5g', ssid: 'Guest' }), /Band SSID tidak sesuai/);
  assert.equal(calls.flatMap(c => c.parameterValues || []).some(([p]) => p === `${base(6)}.Enable`), false);
  assert.equal(wlan[6].Enable._value, false);
});

test('Huawei hidden dormant slots are probed precisely and reused without addObject or backhaul reads', async t => {
  const raw = withBackhaul(), wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  delete wlan[6];
  const calls = mockedAcs(t, raw, false, body => {
    if (body.name === 'getParameterValues' && body.parameterNames.includes(`${base(6)}.SSID`) && !wlan[6]) {
      wlan[6] = { SSID: leaf(''), Enable: leaf(false), BeaconType: leaf(''), Name: leaf('ath9'), Standard: leaf('11ac') };
    }
  });
  const result = await acs.addWifiSsid(cfg, 'hidden-slot-add', { band: '5g', ssid: 'Guest' });
  assert.equal(result.ssid.verified, true); assert.equal(result.ssid.index, 6);
  assert.equal(calls.some(c => c.name === 'addObject'), false);
  assert(calls.filter(c => c.name === 'getParameterValues').flatMap(c => c.parameterNames).every(p => !p.includes('WLANConfiguration.9.') && !p.includes('*')));
});

test('an unconfirmed hidden-slot read cannot proceed to addObject or WiFi writes', async t => {
  const raw = withBackhaul(), wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  delete wlan[6]; const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/devices/') return Response.json([raw]);
    if (pathname === '/faults/') return Response.json([]);
    if (pathname.endsWith('/tasks')) {
      const body = JSON.parse(options.body); calls.push(body);
      if (body.parameterNames?.includes(`${base(6)}.SSID`)) return Response.json({ _id: 'pending-probe' });
      return Response.json({});
    }
    throw Error(`Unexpected request ${pathname}`);
  });
  await assert.rejects(acs.addWifiSsid(cfg, 'pending-slot-add', { band: '5g', ssid: 'Guest' }), /Pembacaan slot SSID belum selesai/);
  assert(calls.every(c => c.name === 'getParameterValues'));
});

test('end-to-end creation configures only the actual CPE instance and never a reserved backhaul', async t => {
  for (const [internal, interleaved] of [[false, false], [true, false], [false, true]]) {
    const raw = device(), wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
    delete wlan[6]; const calls = [];
    wlan[5].X_HW_RFBand = { ...leaf('5GHz'), _object: false };
    if (interleaved) {
      wlan[2].X_HW_RFBand = { ...leaf('5GHz'), _object: false };
      wlan[2].Enable = leaf(true);
      wlan[5].X_HW_RFBand._value = '2.4GHz';
    }
    t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/devices/') return Response.json([raw]);
      if (pathname === '/faults/') return Response.json([]);
      if (pathname.endsWith('/tasks')) {
        const body = JSON.parse(options.body); calls.push(body);
        if (body.name === 'addObject') {
          assert.deepEqual(body.parameterValues, [['X_HW_RFBand', '5GHz', 'xsd:string']]);
          const index = internal ? 9 : 7;
          wlan[index] = { SSID: leaf('New'), Enable: leaf(false), BeaconType: leaf('Basic'), Name: leaf(internal ? 'ath12' : 'ath9'), Standard: leaf('11ac') };
          return Response.json({ instanceNumber: index });
        }
        for (const [path, value] of body.parameterValues || []) {
          const parts = path.split('.'), key = parts.pop(), parent = parts.reduce((n, k) => n[k], raw); parent[key]._value = value;
        }
        return Response.json({});
      }
      throw Error(`Unexpected request ${pathname}`);
    });
    const operation = acs.addWifiSsid(cfg, `new-instance-${internal}-${interleaved}`, { band: '5g', ssid: 'Guest' });
    if (internal) {
      await assert.rejects(operation, /Slot SSID baru belum terkonfirmasi/);
      assert.equal(calls.some(c => c.name === 'setParameterValues'), false);
    } else {
      const result = await operation;
      assert.equal(result.ssid.index, 7); assert.equal(result.ssid.verified, true);
      assert(calls.filter(c => c.name === 'setParameterValues').flatMap(c => c.parameterValues).every(([p]) => p.startsWith(`${base(7)}.`)));
    }
    t.mock.restoreAll();
  }
});

test('radio creation parameters come from the selected real radio, never a backhaul or SSID name', () => {
  const raw = withBackhaul(); const wlan = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  wlan[1].X_HW_RFBand = leaf('2.4GHz'); wlan[5].X_HW_RFBand = leaf('5GHz');
  wlan[9].X_HW_RFBand = leaf('5GHz');
  assert.deepEqual(wifi.addSsidObjectParameters(raw, wifi.BAND_24), [['X_HW_RFBand', '2.4GHz', 'xsd:string']]);
  assert.deepEqual(wifi.addSsidObjectParameters(raw, wifi.BAND_5), [['X_HW_RFBand', '5GHz', 'xsd:string']]);
  delete wlan[5]; assert.deepEqual(wifi.addSsidObjectParameters(raw, wifi.BAND_5), []);
});

test('radio fields take precedence over slot/name guesses for WiFi band', () => {
  const raw = device();
  raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[3] = {
    SSID: leaf('5G-name-on-2G'), X_HW_RFBand: leaf('2.4GHz')
  };
  raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[10] = {
    SSID: leaf('Guest'), Standard: leaf('11ac')
  };
  assert.equal(wifi.wlanBand(raw, 3), wifi.BAND_24);
  assert.equal(acs.normalizeDevice(raw).wifiNetworks.find(n => n.index === 3).band, '2.4G');
  assert.equal(acs.normalizeDevice(raw).wifiNetworks.find(n => n.index === 10).band, '5G');
});

test('Huawei password writes use the populated passphrase, not a rejected empty alias', () => {
  const raw = device();
  raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[1].KeyPassphrase = leaf('');
  const plan = acs._internal.wifiCredentialsPlan(raw, {
    ssidParameter: `${base(1)}.SSID`, ssid: 'Main', usePassword: true,
    passwordParameter: `${base(1)}.KeyPassphrase`, password: 'replacement123'
  });
  assert.deepEqual(plan.values, [[`${base(1)}.PreSharedKey.1.KeyPassphrase`, 'replacement123', 'xsd:string']]);
});

test('stale SSID selection cannot overwrite a slot that has been renamed meanwhile', () => {
  const raw = device();
  assert.throws(() => acs._internal.wifiCredentialsPlan(raw, {
    ssidParameter: `${base(1)}.SSID`, ssid: 'New Name', expectedSsid: 'Previous Name'
  }), /SSID pada modem sudah berubah/);
  assert.doesNotThrow(() => acs._internal.wifiCredentialsPlan(raw, {
    ssidParameter: `${base(1)}.SSID`, ssid: 'New Name', expectedSsid: 'Main', usePassword: true
  }));
});

test('all WiFi mutation APIs reject a backhaul before sending any CWMP write', async t => {
  const raw = withBackhaul();
  const calls = mockedAcs(t, raw);
  const payload = { ssidParameter: `${base(9)}.SSID`, ssid: 'Guest', password: 'replacement123', passwordParameter: `${base(9)}.KeyPassphrase` };
  await assert.rejects(acs.setWifiCredentials(cfg, raw._id, payload), /backhaul internal/);
  await assert.rejects(acs.setWifiSsidAndOptionalPassword(cfg, raw._id, payload), /backhaul internal/);
  await assert.rejects(acs.setWifiSsid(cfg, raw._id, 'Guest', '5g', `${base(9)}.SSID`), /backhaul internal/);
  await assert.rejects(acs.setWifiPassword(cfg, raw._id, 'replacement123', `${base(9)}.KeyPassphrase`), /backhaul internal/);
  assert.equal(calls.length, 0);
});

test('popup options omit backhaul without touching WAN, presets or virtual parameters', async t => {
  const raw = withBackhaul();
  const original = JSON.stringify(raw);
  const calls = mockedAcs(t, raw);
  const result = await acs.getWifiConfiguration(cfg, raw._id, { refresh: true });
  assert.equal(result.networks.some(n => n.index === 9), false);
  assert.equal(result.networks.find(n => n.index === 5).ssidParameter, `${base(5)}.SSID`);
  assert.ok(calls.every(task => task.name === 'getParameterValues'));
  assert.equal(JSON.stringify(raw), original);
});

test('renaming an open SSID without a security choice preserves open despite retained keys', () => {
  const raw = device();
  const config = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2];
  config.Enable = leaf(true);
  config.BeaconType = leaf('Basic');
  config.WPAAuthenticationMode = leaf('PSKAuthentication');
  const plan = acs._internal.wifiCredentialsPlan(raw, { ssid: 'Guest renamed', ssidParameter: `${base(2)}.SSID` });
  assert.equal(plan.security, 'none');
  assert.deepEqual(plan.values, [[`${base(2)}.SSID`, 'Guest renamed', 'xsd:string']]);
});

test('uppercase TR-069 booleans do not cause redundant enable or password writes', () => {
  const raw = device();
  const config = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[1];
  config.Enable = leaf('TRUE');
  config.RadioEnabled = leaf('TRUE');
  const plan = acs._internal.wifiCredentialsPlan(raw, { ssid: 'Main', ssidParameter: `${base(1)}.SSID`, usePassword: true, password: 'mainpass123', passwordParameter: `${base(1)}.KeyPassphrase` });
  assert.deepEqual(plan.values, []);
});

test('Huawei duplicate SSID validation uses the real radio instead of the slot number', () => {
  const raw = device();
  const config = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration;
  config[2] = { SSID: leaf('Guest'), Enable: leaf(true), BeaconType: leaf('Basic'), Standard: leaf('11bgn') };
  config[6] = { SSID: leaf('Second Guest'), Enable: leaf(true), BeaconType: leaf('Basic'), Standard: leaf('11bgn') };
  assert.throws(() => acs._internal.wifiCredentialsPlan(raw, { ssid: 'Guest', ssidParameter: `${base(6)}.SSID`, usePassword: false }), /sudah digunakan SSID2/);
  assert.throws(() => wifi.addSsidBatches(raw, 6, { ssid: 'Guest', security: 'none' }), /sudah digunakan SSID2/);
  config[6].Standard = leaf('11ac');
  assert.doesNotThrow(() => acs._internal.wifiCredentialsPlan(raw, { ssid: 'Guest', ssidParameter: `${base(6)}.SSID`, usePassword: false }));
  config[2].SSID = leaf('Existing duplicate');
  config[6].SSID = leaf('Existing duplicate');
  assert.doesNotThrow(() => acs._internal.wifiCredentialsPlan(raw, { ssid: 'Existing duplicate', ssidParameter: `${base(6)}.SSID`, usePassword: false }));
});

test('open mode sent to CWMP uses firmware capitalization, not a cached lowercase edit', () => {
  const raw = device();
  const config = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2];
  config.BeaconType = leaf('basic');
  const values = wifi._internal.securityValues(raw, base(2), config, 'none');
  assert.deepEqual(values.find(([name]) => name.endsWith('.BeaconType')), [`${base(2)}.BeaconType`, 'Basic', 'xsd:string']);
});

test('queued stale security cannot be used to submit a WiFi write', async t => {
  const raw = device();
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/devices/') return Response.json([raw]);
    if (pathname.endsWith('/tasks')) {
      calls.push(JSON.parse(options.body));
      return Response.json({ _id: 'still-queued-read' });
    }
    throw new Error(`Unexpected ACS call ${pathname}`);
  });
  await assert.rejects(acs.setWifiCredentials(cfg, raw._id, { ssid: 'New name', ssidParameter: `${base(1)}.SSID`, usePassword: false }), /belum terkonfirmasi/);
  assert.equal(calls.some(call => call.name === 'setParameterValues'), false);
});

test('WiFi options wait for the current CPE read instead of displaying a stale WPA mode', async t => {
  const raw = device();
  const config = raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[2];
  config.Enable = leaf(true);
  let reads = 0;
  let requested = false;
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/devices/') {
      if (requested && ++reads >= 2) {
        config.BeaconType = leaf('Basic');
        for (const row of Object.values(raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration)) {
          for (const key of ['SSID', 'Enable', 'BeaconType']) if (row[key] && Object.hasOwn(row[key], '_value')) row[key]._timestamp = new Date().toISOString();
        }
      }
      return Response.json([raw]);
    }
    if (pathname.endsWith('/tasks')) {
      assert.equal(JSON.parse(options.body).name, 'getParameterValues');
      requested = true;
      return Response.json({ _id: 'cpe-read' });
    }
    throw new Error(`Unexpected ACS call ${pathname}`);
  });
  const result = await acs.getWifiConfiguration(cfg, raw._id, { refresh: true });
  assert.equal(result.networks.find(n => n.index === 2).securityEnabled, false);
  assert.equal(result.networks.find(n => n.index === 2).password, '');
  assert.ok(reads >= 2);
});
