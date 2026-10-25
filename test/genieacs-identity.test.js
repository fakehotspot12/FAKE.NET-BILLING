'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const genie = require('../src/genieacs');
const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'deploy/genieacs/virtual-parameters', `${name}.js`), 'utf8');
const serialSource = source('getSerialNumber'), ipSource = source('IPTR069');
function evaluate(script, values) {
  let commits = 0;
  const reads = [];
  const result = new Function('declare', 'commit', 'args', script)((parameter, freshness, write) => {
    assert.equal(write, undefined, 'Identity VPs must never write CPE parameters');
    reads.push({ parameter, freshness });
    const issued = commits;
    if (freshness.path) {
      const matcher = new RegExp('^' + parameter.split('.').map(part => part === '*' ? '[^.]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\.') + '$');
      const paths = Object.keys(values).filter(key => matcher.test(key));
      return { [Symbol.iterator]: function* () {
        assert(commits > issued, 'Path declarations must be committed first');
        for (const key of paths) yield { path: key };
      } };
    }
    assert.equal(freshness.value, 1, 'Only epoch-cached parameter reads are allowed');
    assert(Object.hasOwn(values, parameter), `Do not query unsupported leaves: ${parameter}`);
    return { path: parameter, get value() {
      assert(commits > issued, 'Value declarations must be committed first');
      return [values[parameter]];
    } };
  }, () => { commits++; }, [{}, { value: ['ignored-readonly-write'] }]);
  return { value: result.value[0], reads, commits, writable: result.writable };
}
function makeDevice(values, serial) {
  const doc = { _id: '00259E-MODEL-' + serial, _deviceId: { _SerialNumber: serial } };
  for (const [parameter, value] of Object.entries(values)) {
    let node = doc;
    const keys = parameter.split('.');
    for (const key of keys.slice(0, -1)) node = node[key] ||= {};
    node[keys.at(-1)] = { _value: value };
  }
  return doc;
}
function bootstrapFunction(name, argument) {
  const bootstrap = fs.readFileSync(path.join(root, 'deploy/genieacs/bootstrap.js'), 'utf8');
  const start = bootstrap.indexOf("    'function serialText(value) {'");
  const end = bootstrap.indexOf("    'function first(doc, paths) {'", start);
  const code = bootstrap.slice(start, end).split('\n').filter(line => line.trim().startsWith("'"))
    .map(line => vm.runInNewContext(line.trim().replace(/,$/, ''))).join('\n');
  return vm.runInNewContext(`${code}\n${name}(argument)`, {
    argument, clean: value => String(value ?? '').trim(),
    leaf: (doc, parameter) => parameter.split('.').reduce((node, key) => node && node[key], doc)?._value
  });
}
test('encoded GPON serials are readable consistently without changing raw device identity', () => {
  for (const [raw, expected] of [['48575443A08506AF', 'HWTCA08506AF'], ['48575443a08506af', 'HWTCA08506AF'], ['5A54454701234567', 'ZTEG01234567'], ['4648545401234567', 'FHTT01234567']]) {
    const doc = makeDevice({}, raw), before = JSON.stringify(doc);
    const row = genie.normalizeDevice(doc, {});
    assert.equal(row.serialNumber, expected); assert.equal(row.rawSerialNumber, raw);
    assert.equal(row.id, doc._id); assert.equal(JSON.stringify(doc), before);
    assert.equal(evaluate(serialSource, { 'DeviceID.SerialNumber': raw }).value, expected);
    assert.equal(bootstrapFunction('serialText', raw), expected);
  }
});
test('non-GPON serials, native vendor serials and arbitrary hex identifiers are preserved', () => {
  for (const raw of ['HWTCA08506AF', 'FHTT99B423C8', '1234567890123456', 'FFFFFFFF12345678', '48575443A085', '40EE150123456789', '']) {
    assert.equal(genie.normalizeDevice(makeDevice({}, raw), {}).serialNumber, raw);
    assert.equal(evaluate(serialSource, { 'DeviceID.SerialNumber': raw }).value, raw);
    assert.equal(bootstrapFunction('serialText', raw), raw);
  }
});
test('serial fallback reads the vendor value only if canonical serial leaves are unavailable', () => {
  const values = { 'InternetGatewayDevice.DeviceInfo.X_HW_SerialNumber': 'HWTCA08506AF' };
  assert.equal(evaluate(serialSource, values).value, 'HWTCA08506AF');
  assert.equal(genie.normalizeDevice(makeDevice(values, ''), {}).serialNumber, 'HWTCA08506AF');
});
test('IPTR069 reads cached connection-request addresses with two committed declaration stages', () => {
  for (const prefix of ['InternetGatewayDevice', 'Device']) {
    const values = { [`${prefix}.ManagementServer.ConnectionRequestURL`]: 'http://172.16.107.8:7547/opaque' };
    const result = evaluate(ipSource, values);
    assert.equal(result.value, '172.16.107.8'); assert.equal(result.commits, 2);
    assert.equal(bootstrapFunction('managementIp', makeDevice(values, 'sample')), '172.16.107.8');
    assert(!result.reads.some(row => /WANDevice/.test(row.parameter)), 'Skip WAN discovery when the management address exists');
  }
});
test('missing connection-request URLs fall back only to an explicitly identified routed TR069 WAN', () => {
  for (const connection of ['WANIPConnection', 'WANPPPConnection']) {
    const base = `InternetGatewayDevice.WANDevice.2.WANConnectionDevice.4.${connection}.3`;
    const unrelated = 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1';
    const values = {
      [`${base}.ExternalIPAddress`]: '10.100.1.9', [`${base}.Name`]: '4_TR069_R_VID_100',
      [`${base}.X_HW_SERVICELIST`]: 'TR069', [`${base}.ConnectionType`]: 'IP_Routed',
      [`${unrelated}.ExternalIPAddress`]: '172.16.142.88', [`${unrelated}.Name`]: 'INTERNET',
      'Device.IP.Interface.1.IPv4Address.1.IPAddress': '192.168.100.1', 'Device.IP.Interface.1.Name': 'LAN'
    };
    assert.equal(evaluate(ipSource, values).value, '10.100.1.9');
    values[`${base}.ConnectionType`] = 'IP_Bridged';
    assert.equal(evaluate(ipSource, values).value, '');
  }
});
test('TR181 explicitly named management interfaces can supply TR069 IP without selecting LAN', () => {
  const values = { 'Device.IP.Interface.7.IPv4Address.2.IPAddress': '10.90.1.2', 'Device.IP.Interface.7.Alias': 'cwmp' };
  assert.equal(evaluate(ipSource, values).value, '10.90.1.2');
});
test('invalid, unknown or absent management addresses remain unknown, not PPP/LAN or stale VP', () => {
  for (const url of ['', 'http://0.0.0.0:7547/', 'http://127.0.0.1/', 'http://999.10.10.1/', 'http://cpe.example.test/', 'not a url']) {
    const values = { 'InternetGatewayDevice.ManagementServer.ConnectionRequestURL': url, 'VirtualParameters.IPTR069': '10.99.99.99' };
    assert.equal(evaluate(ipSource, values).value, '');
    assert.equal(bootstrapFunction('managementIp', makeDevice(values, 'sample')), '');
  }
  assert.equal(evaluate(ipSource, {}).value, '');
});
test('TR069 URL supports bracketed IPv6 and does not expose loopback or unspecified addresses', () => {
  for (const [host, expected] of [['fd12:3456::8', 'fd12:3456::8'], ['::', ''], ['::1', '']]) {
    assert.equal(evaluate(ipSource, { 'Device.ManagementServer.ConnectionRequestURL': `http://[${host}]:7547/` }).value, expected);
  }
});
test('serial search covers both readable VP and raw device serial without widening writes or polling', () => {
  const query = genie._internal.searchQuery('HWTCA08506AF');
  assert(query.$or.some(row => row['VirtualParameters.getSerialNumber._value']));
  assert(query.$or.some(row => row['_deviceId._SerialNumber']));
  const fields = genie._internal.deviceListProjection();
  assert(fields.includes('InternetGatewayDevice.DeviceInfo.X_HW_SerialNumber'));
  for (const script of [serialSource, ipSource]) {
    assert.doesNotMatch(script, /Date\.now|clear\(|setParameterValues|declare\([^\n]*null,/);
    assert.equal(evaluate(script, {}).writable, false);
  }
});

test('existing raw-serial member bindings still match after serial display normalization', () => {
  for (const bound of ['48575443A08506AF', 'HWTCA08506AF', '48575443a08506af']) {
    const score = genie._internal.deviceCandidateScore({ id: 'device', serialNumber: 'HWTCA08506AF' }, { boundSerialNumbers: [bound] });
    assert(score.reasons.includes('bound-serial'));
    assert.equal(score.score, 25);
  }
});
