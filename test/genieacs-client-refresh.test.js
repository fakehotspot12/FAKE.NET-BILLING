'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const acs = require('../src/genieacs');
const leaf = (value, time = new Date().toISOString()) => ({ _value: value, _timestamp: time });
const cfg = { enabled: true, baseUrl: 'http://client-refresh.test', connectionRequest: false };
function raw(id, age = 0) {
  const time = new Date(Date.now() - age).toISOString();
  return { _id: id, _lastInform: new Date().toISOString(), _deviceId: { _Manufacturer: 'Huawei', _ProductClass: 'EG8145V5' },
    InternetGatewayDevice: { LANDevice: { 1: { WLANConfiguration: {
      1: { SSID: leaf('Customer'), Enable: leaf(true), TotalAssociations: leaf(1, time), AssociatedDevice: { _object: true, _timestamp: time } }
    }, Hosts: { Host: { _object: true, _timestamp: time } } } } } };
}
function api(t, devices, onRead) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const target = new URL(url);
    if (target.pathname === '/devices/') {
      const query = JSON.parse(target.searchParams.get('query') || '{}');
      const ids = typeof query._id === 'string' ? [query._id] : query._id?.$in || [];
      return Response.json(devices.filter(d => ids.includes(d._id)));
    }
    if (target.pathname.endsWith('/tasks')) {
      const body = JSON.parse(options.body); calls.push(body);
      const id = decodeURIComponent(target.pathname.split('/')[2]);
      if (onRead) await onRead(devices.find(d => d._id === id), body);
      return Response.json({ _id: `read-${id}` });
    }
    throw new Error(`Unexpected request ${target.pathname}`);
  });
  return calls;
}
test('client projection covers dynamic slots and alternate counters without keys or WAN roots', () => {
  const p = acs._internal.clientCountProjection();
  assert.match(p, /WLANConfiguration\.16\.AssociatedDevice/);
  assert.match(p, /WLANConfiguration\.10\.Standard/);
  assert.match(p, /WLAN_AssociatedDeviceNumberOfEntries/);
  assert.match(p, /LANEthernetInterfaceConfig\.8\.AssociatedDeviceNumberOfEntries/);
  assert.doesNotMatch(p, /Passphrase|PreSharedKey|WANDevice/);
});
test('MAC-only history cannot make old client data look fresh', () => {
  const d = raw('mac-history', 60 * 60 * 1000);
  d.InternetGatewayDevice.LANDevice[1].Hosts.Host[1] = { MACAddress: leaf('AA:BB:CC:DD:EE:FF') };
  assert(Date.now() - acs._internal.clientSnapshotTimestamp(d) > 15 * 60 * 1000);
});
test('a fresh positive hardware counter is not reset to zero when identities are missing', () => {
  const d = acs.normalizeDevice(raw('fresh-counter'));
  const payload = acs._internal.clientCountPayload(d);
  assert.equal(payload.total, 1);
  assert.equal(payload.wifi24, 1);
  assert.equal(d.connectedClients.length, 0);
});
test('stale counters and a large virtual history are not substituted for real active clients', () => {
  const r = raw('stale-counter', 60 * 60 * 1000);
  r.VirtualParameters = { activedevices: leaf(225) };
  const d = acs.normalizeDevice(r);
  assert.equal(d.clientDataStale, true);
  assert.equal(acs._internal.clientCountPayload(d).total, 0);
});
test('a confirmed empty modem reports real zero without scheduling a CPE read', async t => {
  const d = raw('real-empty');d.InternetGatewayDevice.LANDevice[1].WLANConfiguration[1].TotalAssociations = leaf(0);
  const calls = api(t, [d]);
  const [count] = await acs.getClientCounts(cfg, [d._id], { refresh: true });
  assert.equal(count.known, true);assert.equal(count.total, 0);assert.equal(calls.length, 0);
});
test('missing devices return unknown rather than a fabricated zero', async t => {
  api(t, []);
  const [count] = await acs.getClientCounts(cfg, ['not-found'], { refresh: true });
  assert.equal(count.known, false);assert.equal(count.total, null);assert.equal(count.pending, false);
});
test('stale visible clients are refreshed read-only and then return a verified count', async t => {
  const d = raw('stale-visible', 60 * 60 * 1000);
  const calls = api(t, [d], async raw => {
    await new Promise(resolve => setTimeout(resolve, 25));
    raw.InternetGatewayDevice.LANDevice[1].WLANConfiguration[1].TotalAssociations = leaf(4);
  });
  const [before] = await acs.getClientCounts(cfg, [d._id], { refresh: true });
  assert.equal(before.known, false);assert.equal(before.total, null);assert.equal(before.pending, true);
  const refresh = acs._internal.queueClientRefresh(cfg, d._id, d);
  await refresh.operation;
  const [after] = await acs.getClientCounts(cfg, [d._id], { refresh: true });
  assert.equal(after.known, true);assert.equal(after.total, 4);
  assert.equal(calls.length, 1);
  assert(calls.every(c => c.name === 'getParameterValues' && c.expiry === 120));
  assert(calls.flatMap(c => c.parameterNames).every(p => !/WANDevice|Password|KeyPassphrase|BeaconType/.test(p)));
});
test('refresh queue coalesces requests and never contacts more than two CPEs concurrently', async t => {
  const devices = Array.from({ length: 5 }, (_, i) => raw(`bounded-${i}`, 60 * 60 * 1000));
  let running = 0, maximum = 0;
  const calls = api(t, devices, async d => {
    maximum = Math.max(maximum, ++running);
    await new Promise(resolve => setTimeout(resolve, 25));
    d.InternetGatewayDevice.LANDevice[1].WLANConfiguration[1].TotalAssociations = leaf(2);running -= 1;
  });
  const entries = devices.map(d => acs._internal.queueClientRefresh(cfg, d._id, d));
  assert.equal(acs._internal.queueClientRefresh(cfg, devices[0]._id, devices[0]), entries[0]);
  await Promise.all(entries.map(e => e.operation));
  assert.equal(maximum, 2);assert.equal(calls.length, 5);
});
test('offline devices are not contacted automatically and FL327D avoids its unsafe host subtree', () => {
  const d = raw('offline');d._lastInform = '2025-01-01T00:00:00.000Z';
  assert.equal(acs._internal.queueClientRefresh(cfg, d._id, d), null);
  d._deviceId._ProductClass = 'FL327D';
  assert.equal(acs._internal.clientRefreshParameterNames(d).some(p => p.includes('Hosts.Host')), false);
});
