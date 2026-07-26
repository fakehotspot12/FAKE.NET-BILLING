'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const store = require('../src/store');

test('storeCore memisahkan koleksi transaksi besar dari blob inti', () => {
  const data = {
    version: 1,
    settings: { businessName: 'Test' },
    customers: [{ id: 'customer-1' }],
    invoices: [{ id: 'invoice-1' }],
    payments: [{ id: 'payment-1' }],
    waMessages: [{ id: 'wa-1' }],
    activity: [{ id: 'activity-1' }],
    radiusUsers: [{ id: 'radius-1' }]
  };

  const core = store.__test.storeCore(data);
  assert.equal(core.storageSchemaVersion, 2);
  assert.deepEqual(core.radiusUsers, data.radiusUsers);
  for (const collection of ['customers', 'invoices', 'payments', 'waMessages', 'activity']) {
    assert.equal(Object.hasOwn(core, collection), false);
  }
});

test('collectionSnapshot mendeteksi perubahan data dan posisi secara deterministik', () => {
  const first = store.__test.collectionSnapshot('invoices', [
    { id: 'invoice-1', amount: 100 },
    { id: 'invoice-2', amount: 200 }
  ]);
  const same = store.__test.collectionSnapshot('invoices', [
    { id: 'invoice-1', amount: 100 },
    { id: 'invoice-2', amount: 200 }
  ]);
  const changed = store.__test.collectionSnapshot('invoices', [
    { id: 'invoice-1', amount: 150 },
    { id: 'invoice-2', amount: 200 }
  ]);

  assert.equal(first.get('invoice-1').fingerprint, same.get('invoice-1').fingerprint);
  assert.notEqual(first.get('invoice-1').fingerprint, changed.get('invoice-1').fingerprint);
  assert.throws(() => store.__test.collectionSnapshot('invoices', [{ amount: 100 }]), /tidak memiliki id/);
  assert.throws(() => store.__test.collectionSnapshot('invoices', [{ id: 'dup' }, { id: 'dup' }]), /ID duplikat/);
});

test('coreFingerprint tidak berubah hanya karena updatedAt', () => {
  const first = store.__test.coreFingerprint({
    settings: { businessName: 'Test' },
    updatedAt: '2026-07-19T00:00:00.000Z'
  });
  const second = store.__test.coreFingerprint({
    settings: { businessName: 'Test' },
    updatedAt: '2026-07-19T01:00:00.000Z'
  });
  assert.equal(first, second);
});

test('billing default timers use daytime WA and isolation schedules', () => {
  const data = store.createDefaultStore();
  assert.equal(data.settings.billing.notificationSendTime, '08:00');
  assert.equal(data.settings.billing.autoSuspendTime, '13:30');
});

test('legacy billing default timers migrate to safer daytime defaults', () => {
  const shaped = store.ensureShape({
    settings: {
      billing: {
        notificationSendTime: '06:00',
        autoSuspendTime: '00:00'
      }
    },
    radiusSyncState: {}
  });

  assert.equal(shaped.settings.billing.notificationSendTime, '08:00');
  assert.equal(shaped.settings.billing.autoSuspendTime, '13:30');
  assert.ok(shaped.radiusSyncState.billingDefaultTimersV2At);
});

test('custom billing timers are preserved during shape migration', () => {
  const shaped = store.ensureShape({
    settings: {
      billing: {
        notificationSendTime: '09:30',
        autoSuspendTime: '14:15'
      }
    },
    radiusSyncState: {}
  });

  assert.equal(shaped.settings.billing.notificationSendTime, '09:30');
  assert.equal(shaped.settings.billing.autoSuspendTime, '14:15');
});
