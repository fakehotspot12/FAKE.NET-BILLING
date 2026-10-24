'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const genie = require('../src/genieacs');
const root = path.join(__dirname, '..');
const vp = fs.readFileSync(path.join(root, 'deploy/genieacs/virtual-parameters/RXPower.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'deploy/genieacs/bootstrap.js'), 'utf8');
const rawPath = 'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower';
function device(value, parameter = rawPath, virtual) {
  const raw = { _id: 'synthetic-zte', _deviceId: { _Manufacturer: 'ZTE', _ProductClass: 'F609' } };
  let current = raw;
  for (const key of parameter.split('.').slice(0, -1)) current = current[key] ||= {};
  current[parameter.split('.').at(-1)] = { _value: value };
  if (virtual !== undefined) raw.VirtualParameters = { RXPower: { _value: virtual } };
  return raw;
}
function evaluateVp(raw) {
  const reads = [];
  const result = new Function('declare', 'commit', vp)((parameter, freshness = {}) => {
    reads.push({ parameter, freshness });
    if (parameter === rawPath && freshness.value) return { path: rawPath, value: [raw] };
    if (parameter === rawPath.replace('.1.', '.*.')) return [{ path: rawPath, value: [raw] }];
    return [];
  }, () => {});
  return { value: result.value[0] === '' ? null : Number(result.value[0]), reads };
}
function backfill(value) {
  const lines = bootstrap.slice(bootstrap.indexOf("    'function rxPowerText(value, path) {'"), bootstrap.indexOf("    'function tempConvertRaw(value) {'"));
  const code = lines.split('\n').filter(line => line.trim().startsWith("'")).map(line => vm.runInNewContext(line.trim().replace(/,$/, ''))).join('\n');
  return vm.runInNewContext(`${code}\nrxPowerText(value, parameter)`, { value, parameter: rawPath, clean: v => String(v ?? '').trim() });
}
test('ZTE unsigned optical counters use logarithmic 0.1-uW conversion consistently in billing, VP and installer', () => {
  for (const [raw, expected] of [[46, -23.37], [77, -21.14], [127, -18.96], [233, -16.33], [255, -15.93], [312, -15.06]]) {
    assert.equal(genie.normalizeDevice(device(raw), {}).rxPowerValue, expected, String(raw));
    assert.equal(evaluateVp(raw).value, expected, String(raw));
    assert.equal(Number(backfill(raw)), expected, String(raw));
  }
});
test('a stale but negative ZTE virtual value does not mask the raw optical counter', () => {
  const result = genie.normalizeDevice(device(46, rawPath, '-4.8'), {});
  assert.equal(result.rxPowerValue, -23.37); assert.equal(result.rxPowerParameter, rawPath);
});
test('native negative dBm, explicit units and hundredths are not converted as positive counters', () => {
  for (const [raw, expected] of [['-21.61', -21.61], ['-23,37 dBm', -23.37], [-2137, -21.37]]) {
    assert.equal(genie.normalizeDevice(device(raw), {}).rxPowerValue, expected);
    assert.equal(evaluateVp(raw).value, expected); assert.equal(Number(backfill(raw)), expected);
  }
});
test('invalid optical readings remain unknown rather than becoming zero or fabricated attenuation', () => {
  for (const raw of ['', 'N/A', 0, 65535, 32767, -255, '-99999']) {
    assert.equal(genie.normalizeDevice(device(raw), {}).rxPowerValue, null, String(raw));
    assert.equal(evaluateVp(raw).value, null, String(raw)); assert.equal(backfill(raw), '', String(raw));
  }
});
test('RX virtual reads existing cached leaves without adding forced periodic CPE polling', () => {
  const result = evaluateVp(46), cached = result.reads.filter(row => row.freshness.value);
  assert.equal(cached.length, 1); assert.equal(cached[0].parameter, rawPath);
  assert.equal(cached[0].freshness.value, 1);
  assert(result.reads.every(row => Object.keys(row.freshness).length > 0));
  assert.doesNotMatch(vp, /clear\(|setParameterValues|setParameter|Date\.now/);
});
test('VP commits discovered paths and cached values before inspecting delayed GenieACS declarations', () => {
  let commits = 0;
  const result = new Function('declare', 'commit', vp)((parameter, freshness) => {
    if (freshness.path) return parameter === rawPath.replace('.1.', '.*.') ? [{ path: rawPath }] : [];
    assert.equal(parameter, rawPath);
    return { path: rawPath, get value() { return commits >= 2 ? [46] : undefined; } };
  }, () => { commits++; });
  assert.equal(result.value[0], '-23.37'); assert.equal(commits, 2);
});
test('raw GPON aliases remain readable if virtual cache needs rebuilding', () => {
  for (const family of ['X_CMCC_GponInterfaceConfig', 'X_FH_EponInterfaceConfig', 'X_HW_GponInterfaceConfig']) {
    const parameter = `InternetGatewayDevice.WANDevice.1.${family}.RXPower`;
    assert.equal(genie.normalizeDevice(device(156, parameter), {}).rxPowerValue, -18.07);
  }
});
