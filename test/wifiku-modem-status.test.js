'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const olt = require('../src/olt-monitor');
const { modemStatus } = require('../src/wifiku-modem-status');

const NOW = Date.parse('2026-11-13T04:00:00Z');
const SN = 'HWTCAABB0001';
const customer = { id: 'customer-a', genieAcsSerialNumber: SN };
const onu = (extra = {}) => ({ serialNumber: SN, status: 'offline', condition: 'los', causeKnown: true, password: 'PRIVATE_ONU_PASSWORD', ...extra });
const snapshot = (extra = {}) => ({ status: 'online', checkedAt: new Date(NOW).toISOString(), onus: [onu()], ...extra });
function cached(t, entries = [{ snapshot: snapshot() }]) {
  const snapshots = new Map(), reads = [];
  const data = { oltDevices: entries.map((entry, i) => {
    const device = { id: 'modem-test-' + i, enabled: true, nasId: 'nas-a', updatedAt: 'r1', links: {}, ...entry.device };
    snapshots.set(device.id, entry.snapshot);
    return device;
  }) };
  t.mock.method(olt, 'snapshotFor', async device => { reads.push(device.id); return snapshots.get(device.id); });
  for (const name of ['collect', 'poll', 'pollNext', 'requestRefresh']) t.mock.method(olt, name, () => { assert.fail('modemStatus must not invoke ' + name); });
  return { data, reads, snapshots };
}

for (const [code, row] of [
  ['online', onu({ status: 'online', condition: 'online' })],
  ['los', onu()],
  ['power', onu({ condition: 'dying-gasp' })],
  ['offline', onu({ condition: 'unknown', causeKnown: false })],
  ['offline', onu({ causeKnown: false })],
  ['offline', onu({ condition: 'dying-gasp', causeKnown: false })],
  ['offline', onu({ condition: 'other', downCause: 'LOS' })]
]) test('cached OLT status maps ' + JSON.stringify({ status: row.status, condition: row.condition, causeKnown: row.causeKnown }) + ' to ' + code, async t => {
  const { data, reads } = cached(t, [{ snapshot: snapshot({ onus: [row] }) }]), before = structuredClone(data);
  const result = await modemStatus(data, customer, { id: 'acs', online: true }, ['nas-a'], NOW);
  assert.equal(result.code, code);
  assert.equal(result.source, 'olt');
  assert.equal(result.checkedAt, new Date(NOW).toISOString());
  assert.deepEqual(Object.keys(result).sort(), ['code', 'label', 'hint', 'checkedAt', 'source'].sort());
  assert(!JSON.stringify(result).includes('PRIVATE_'));
  assert(!JSON.stringify(result).includes(SN));
  assert.deepEqual(reads, ['modem-test-0']);
  assert.deepEqual(data, before);
});

for (const extra of [
  { stale: true }, { pendingRefresh: true }, { status: 'unreachable' },
  { checkedAt: 'invalid' }, { checkedAt: '' },
  { checkedAt: new Date(NOW - olt.CACHE_MS * 2 - 1).toISOString() },
  { checkedAt: new Date(NOW + 30001).toISOString() }
]) test('unavailable OLT falls back to available ACS without inventing LOS: ' + JSON.stringify(extra), async t => {
  const { data } = cached(t, [{ snapshot: snapshot(extra) }]);
  const result = await modemStatus(data, customer, { id: 'acs', online: true }, [], NOW);
  assert.equal(result.code, 'online');
  assert.equal(result.source, 'acs');
  assert.equal((await modemStatus(data,customer,{},[],NOW)).code,'unknown');
});

test('freshness accepts exactly two cache intervals and the 30-second future tolerance', async t => {
  const { data, snapshots } = cached(t);
  for (const checked of [NOW - olt.CACHE_MS * 2, NOW + 30000]) {
    snapshots.set(data.oltDevices[0].id, snapshot({ checkedAt: new Date(checked).toISOString() }));
    assert.equal((await modemStatus(data, customer, {}, [], NOW)).code, 'los');
  }
});

test('unknown ONU state does not become LOS from an ACS online flag or an unverified down-cause', async t => {
  const { data } = cached(t, [{ snapshot: snapshot({ onus: [onu({ status: 'unknown', downCause: 'LOS' })] }) }]);
  assert.equal((await modemStatus(data, customer, { id: 'acs', online: true }, [], NOW)).code, 'online');
});

test('serial matching normalizes ACS aliases and customer-configured serial without username guessing', async t => {
  const { data } = cached(t);
  for (const acs of [{ serialNumber: '48575443aabb0001' }, { sn: SN.toLowerCase() }, {}]) assert.equal((await modemStatus(data, customer, acs, [], NOW)).code, 'los');
  assert.equal((await modemStatus(data, { id: 'other', username: SN }, {}, [], NOW)).code, 'unknown');
  assert.equal((await modemStatus(data, customer, { id: 'acs', serialNumber: 'HWTCBBBB0002', online: false }, [], NOW)).source, 'acs');
});

test('explicit customer links are used only when serial is absent, never another customer link', async t => {
  const { data } = cached(t, [{ device: { links: { [SN]: { customerId: customer.id } } }, snapshot: snapshot() }]);
  assert.equal((await modemStatus(data, { id: customer.id }, {}, [], NOW)).code, 'los');
  assert.equal((await modemStatus(data, { id: 'other' }, {}, [], NOW)).code, 'unknown');
  assert.equal((await modemStatus(data, { id: customer.id }, { serialNumber: 'HWTCBBBB0002' }, [], NOW)).code, 'unknown');
});

test('duplicate serials within a snapshot and cross-OLT ambiguity fall back conservatively', async t => {
  const { data, snapshots } = cached(t, [{ snapshot: snapshot({ onus: [onu(), onu({ status: 'online' })] }) }]);
  assert.equal((await modemStatus(data, customer, {}, [], NOW)).code, 'unknown');
  assert.equal((await modemStatus(data, customer, { id: 'acs', online: true }, [], NOW)).source, 'acs');
  snapshots.set(data.oltDevices[0].id, snapshot());
  data.oltDevices.push({ ...data.oltDevices[0], id: 'second' });
  snapshots.set('second', snapshot());
  assert.equal((await modemStatus(data, customer, {}, [], NOW)).code, 'unknown');
  assert.equal((await modemStatus(data, customer, { id: 'acs', online: false }, [], NOW)).code, 'offline');
});

test('multiple customer-linked ONUs are ambiguous, but repeated normalized links are not', async t => {
  const second = 'HWTCBBBB0002';
  const { data, snapshots } = cached(t, [{ device: { links: { [SN]: { customerId: customer.id }, [second]: { customerId: customer.id } } }, snapshot: snapshot({ onus: [onu(), onu({ serialNumber: second })] }) }]);
  assert.equal((await modemStatus(data, { id: customer.id }, {}, [], NOW)).code, 'unknown');
  data.oltDevices[0].links = { [SN]: { customerId: customer.id }, [SN.toLowerCase()]: { customerId: customer.id } };
  data.oltDevices[0].updatedAt = 'r2';
  snapshots.set(data.oltDevices[0].id, snapshot());
  assert.equal((await modemStatus(data, { id: customer.id }, {}, [], NOW)).code, 'los');
});

test('NAS scoping and disabled OLTs are checked before reading snapshots', async t => {
  const { data, reads } = cached(t, [
    { device: { nasId: 'nas-a' }, snapshot: snapshot() },
    { device: { nasId: 'nas-b' }, snapshot: snapshot({ onus: [onu({ status: 'online' })] }) },
    { device: { nasId: 'nas-a', enabled: false }, snapshot: snapshot() }
  ]);
  assert.equal((await modemStatus(data, customer, {}, ['nas-a'], NOW)).code, 'los');
  assert.deepEqual(reads, ['modem-test-0']);
  reads.length = 0;
  assert.equal((await modemStatus(data, customer, {}, ['nas-b'], NOW)).code, 'online');
  assert.deepEqual(reads, ['modem-test-1']);
  reads.length = 0;
  assert.equal((await modemStatus(data, customer, {}, ['missing'], NOW)).code, 'unknown');
  assert.deepEqual(reads, []);
});

test('missing snapshots never trigger polling and ACS fallbacks require an actual device', async t => {
  const { data, reads } = cached(t, [{ snapshot: null }]);
  for (const [acs, code, source] of [[{}, 'unknown', ''], [{ online: true }, 'unknown', ''], [{ id: 'acs', online: true }, 'online', 'acs'], [{ id: 'acs', online: false }, 'offline', 'acs']]) {
    const result = await modemStatus(data, customer, acs, [], NOW);
    assert.equal(result.code, code);
    assert.equal(result.source, source);
    assert.equal(result.checkedAt, undefined);
  }
  assert.equal(reads.length, 4);
});

test('cached serial indexes invalidate on snapshot replacement and link configuration revision', async t => {
  const { data, snapshots } = cached(t, [{ snapshot: snapshot(), device: { links: { [SN]: { customerId: customer.id } } } }]);
  const who = { id: customer.id };
  assert.equal((await modemStatus(data, who, {}, [], NOW)).code, 'los');
  assert.equal((await modemStatus(data, who, {}, [], NOW)).code, 'los');
  snapshots.set(data.oltDevices[0].id, snapshot({ onus: [onu({ status: 'online' })] }));
  assert.equal((await modemStatus(data, who, {}, [], NOW)).code, 'online');
  data.oltDevices[0].links = { [SN]: { customerId: 'other' } };
  data.oltDevices[0].updatedAt = 'r2';
  assert.equal((await modemStatus(data, who, {}, [], NOW)).code, 'unknown');
  assert.equal((await modemStatus(data, { id: 'other' }, {}, [], NOW)).code, 'online');
});
