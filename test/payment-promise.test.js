'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const promise = require('../src/payment-promise');
const { createDefaultStore, ensureShape } = require('../src/store');
const { markInvoicePaid, markInvoiceUnpaid } = require('../src/finance');
const { __test: server } = require('../src/server');
const actor = { id: 'promise-admin', username: 'admin', name: 'Admin Uji', role: 'admin' };
const at = (date, time = '14:00') => new Date(`${date}T${time}:00+08:00`);

function fixture(dueDate = '2026-10-25') {
  const data = createDefaultStore();
  data.settings.appMode = 'standalone';
  data.settings.billingSource = 'local';
  Object.assign(data.settings.billing, { paymentPromiseEnabled: true, suspendGraceDays: 1, autoSuspendTime: '13:30', autoTerminateAfterDays: 0 });
  data.settings.waGateway.enabled = false;
  data.customers = [{ id: 'promise-customer', code: '10000000001', username: 'janji@isp.test', name: 'Pelanggan Uji', status: 'active',
    price: 150000, activeDate: '2026-01-01', nextDue: '2026-12-25', dueDay: 25, paymentType: 'postpaid', billingPeriod: 'fixed', firstInvoiceStatus: 'paid' }];
  data.radiusUsers = [{ id: 'promise-radius', customerId: 'promise-customer', username: 'janji@isp.test', serviceType: 'pppoe', status: 'active' }];
  data.invoices = [{ id: 'promise-invoice', invoiceNo: '100001', customerId: 'promise-customer', username: 'janji@isp.test', customerName: 'Pelanggan Uji',
    status: 'pending', period: dueDate.slice(0, 7), dueDate, amount: 150000 }];
  data.payments = [];
  return data;
}

function preview(data, day = '2026-10-26') {
  return server.billingPaymentPromiseOperation(data, { invoiceId: data.invoices[0].id }, actor, at(day));
}
function save(data, date = '2026-10-30', day = '2026-10-26', extra = {}) {
  return server.billingPaymentPromiseOperation(data, { action: 'save', invoiceId: data.invoices[0].id, date,
    revision: preview(data, day).revision, ...extra }, actor, at(day));
}
function run(data, day, time = '14:00') { return server.standaloneBillingAutomation(data, actor, { now: at(day, time) }); }

test('payment promises default off and old settings saves preserve the existing toggle', () => {
  assert.equal(createDefaultStore().settings.billing.paymentPromiseEnabled, false);
  assert.equal(server.sanitizeBillingSettings({}, { paymentPromiseEnabled: true }).paymentPromiseEnabled, true);
  assert.equal(server.sanitizeBillingSettings({ paymentPromiseEnabled: false }, { paymentPromiseEnabled: true }).paymentPromiseEnabled, false);
  const data = fixture(); data.settings.billing.paymentPromiseEnabled = false;
  assert.throws(() => preview(data), /belum diaktifkan/);
});

test('one calendar month clamps end-of-month and leap dates, not thirty days', () => {
  for (const [due, max] of [['2026-10-25', '2026-11-25'], ['2026-10-28', '2026-11-28'], ['2026-10-31', '2026-11-30'],
    ['2026-01-31', '2026-02-28'], ['2028-01-31', '2028-02-29'], ['2026-12-31', '2027-01-31']]) assert.equal(promise.nextMonthDate(due), max);
  for (const invalid of ['2026-02-30', '2026-13-01', '31/10/2026', '2026-10-30T00:00:00Z', '']) assert.equal(promise.dateKey(invalid), '');
});

test('promise creation leaves the financial invoice and payment records untouched', () => {
  const data = fixture(); const before = structuredClone({ invoices: data.invoices, payments: data.payments });
  const result = save(data, '2026-10-30', '2026-10-26', { note: 'Kesepakatan pelanggan' });
  assert.equal(result.promise.date, '2026-10-30'); assert.equal(result.maxDate, '2026-11-25');
  assert.equal(result.promise.status, 'active'); assert.equal(result.activatedUser, null);
  assert.deepEqual({ invoices: data.invoices, payments: data.payments }, before);
  assert.equal(data.activity[0].meta.action, 'payment-promise-created');
  assert.equal(data.activity[0].meta.note, 'Kesepakatan pelanggan');
  assert.equal(data.customers[0].billingIsolationOverride, undefined);
});

test('invalid, past, pre-due and over-one-month dates are rejected without mutating data', () => {
  for (const date of ['2026-10-25', '2026-11-26', '2026-02-30', 'bad']) {
    const data = fixture(); const before = structuredClone(data);
    assert.throws(() => save(data, date), /Tanggal janji/); assert.deepEqual(data, before);
  }
  const future = fixture('2026-10-28');
  assert.throws(() => save(future, '2026-10-27', '2026-10-26'), /Tanggal janji/);
});

test('editing or recreating a promise never rolls the original invoice deadline forward', () => {
  const data = fixture(); save(data);
  const id = data.customers[0].paymentPromise.id;
  save(data, '2026-11-25', '2026-11-01');
  assert.equal(data.customers[0].paymentPromise.id, id);
  assert.equal(data.customers[0].paymentPromise.maxDate, '2026-11-25');
  assert.throws(() => save(data, '2026-12-01', '2026-11-02'), /Tanggal janji/);
  promise.cancel(data, data.customers[0], actor);
  assert.throws(() => save(data, '2026-12-01', '2026-11-02'), /Tanggal janji/);
});

test('oldest unpaid due date determines the cap and the promise covers all bills due by its date', () => {
  const data = fixture();
  data.invoices.push({ ...data.invoices[0], id: 'older', invoiceNo: '100000', dueDate: '2026-10-10' },
    { ...data.invoices[0], id: 'future', invoiceNo: '100002', dueDate: '2026-11-25', period: '2026-11' });
  assert.equal(preview(data).maxDate, '2026-11-10');
  save(data);
  assert.deepEqual(data.customers[0].paymentPromise.invoiceIds.sort(), ['older', 'promise-invoice']);
  assert.throws(() => save(data, '2026-11-11'), /Tanggal janji/);
});

test('payment and promise edits invalidate a stale preview and duplicate submissions', () => {
  const data = fixture(); const revision = preview(data).revision;
  const payload = { action: 'save', invoiceId: data.invoices[0].id, date: '2026-10-30', revision };
  server.billingPaymentPromiseOperation(data, payload, actor, at('2026-10-26'));
  assert.throws(() => server.billingPaymentPromiseOperation(data, payload, actor, at('2026-10-26')), /Data tagihan berubah/);
  const latest = preview(data).revision;
  data.invoices[0].amount = 140000;
  assert.throws(() => server.billingPaymentPromiseOperation(data, { ...payload, revision: latest }, actor, at('2026-10-26')), /Data tagihan berubah/);
});

test('a promise holds overdue isolation through its chosen day, then isolates at H+1 configured time once', () => {
  const data = fixture(); save(data);
  assert.equal(run(data, '2026-10-29').isolatedUsers.length, 0);
  assert.equal(run(data, '2026-10-30', '23:59').isolatedUsers.length, 0);
  assert.equal(run(data, '2026-10-31', '13:29').isolatedUsers.length, 0);
  const expired = run(data, '2026-10-31', '13:30');
  assert.equal(expired.isolatedUsers.length, 1);
  assert.equal(data.customers[0].paymentPromise.status, 'broken');
  assert.equal(data.radiusUsers[0].isolationReason, 'payment-promise-overdue');
  assert.equal(run(data, '2026-10-31', '14:00').isolatedUsers.length, 0);
  assert.equal(data.activity.filter(item => item.meta.action === 'payment-promise-broken').length, 1);
});

test('promise H+1 overrides zero or longer general isolation grace without changing the setting', () => {
  for (const grace of [0, 30]) {
    const data = fixture(); data.settings.billing.suspendGraceDays = grace; save(data);
    assert.equal(run(data, '2026-10-31').isolatedUsers.length, 1);
    assert.equal(data.settings.billing.suspendGraceDays, grace);
  }
});

test('an unrelated newly unpaid invoice still follows normal isolation during a valid promise', () => {
  const data = fixture(); save(data);
  data.invoices.push({ ...data.invoices[0], id: 'uncovered-new', dueDate: '2026-10-20' });
  assert.equal(run(data, '2026-10-28').isolatedUsers.length, 1);
});

test('a permanent exemption is never replaced by a promise and still wins if enabled afterwards', () => {
  for (const target of ['customers', 'radiusUsers']) {
    const data = fixture(); data[target][0].billingIsolationOverride = true;
    assert.throws(() => save(data), /pengecualian isolir/);
    data[target][0].billingIsolationOverride = false; save(data);
    data[target][0].billingIsolationOverride = true;
    assert.equal(run(data, '2026-10-31').isolatedUsers.length, 0);
    assert.equal(data[target][0].billingIsolationOverride, true);
  }
});

test('billing isolation can be reactivated by a promise, manual isolation and terminated cannot', () => {
  const data = fixture(); Object.assign(data.customers[0], { status: 'isolir', isolationSource: 'billing', isolatedAt: '2026-10-26' });
  Object.assign(data.radiusUsers[0], { status: 'isolated', isolationSource: 'billing', isolatedAt: '2026-10-26' });
  const result = save(data); assert.equal(result.activatedUser.id, 'promise-radius');
  assert.equal(data.customers[0].status, 'active'); assert.equal(data.radiusUsers[0].status, 'active');
  for (const status of ['isolated', 'terminated', 'inactive']) {
    const other = fixture(); other.radiusUsers[0].status = status;
    assert.throws(() => save(other), /manual|terminated|nonaktif/);
    assert.equal(other.radiusUsers[0].status, status);
  }
});

test('promise reactivation uses the shared Radius sync and CoA path only for a real status change', async () => {
  const data = fixture();
  Object.assign(data.customers[0], { status: 'isolir', isolationSource: 'billing' });
  Object.assign(data.radiusUsers[0], { status: 'isolated', isolationSource: 'billing' });
  const first = save(data);
  let syncs = 0, disconnects = 0;
  const runtime = { sync: async () => { syncs++; }, disconnect: async () => { disconnects++; return { ok: true }; } };
  await server.finalizePaidInvoiceRadiusActivation(data, { activatedUser: first.activatedUser }, actor, 'promise-test', runtime);
  const edited = save(data, '2026-10-31');
  await server.finalizePaidInvoiceRadiusActivation(data, { activatedUser: edited.activatedUser }, actor, 'promise-test', runtime);
  assert.equal(syncs, 1); assert.equal(disconnects, 1);
});

test('auto termination respects active promises and permanent exemptions', () => {
  const data = fixture(); save(data); data.settings.billing.autoTerminateAfterDays = 1;
  Object.assign(data.customers[0], { status: 'isolir', isolatedAt: '2026-10-01', isolationSource: 'billing' });
  Object.assign(data.radiusUsers[0], { status: 'isolated', isolatedAt: '2026-10-01', isolationSource: 'billing' });
  assert.equal(run(data, '2026-10-29').terminatedUsers.length, 0);
  data.customers[0].billingIsolationOverride = true;
  assert.equal(run(data, '2026-11-01').terminatedUsers.length, 0);
});

test('all payment methods complete a promise without altering the original due date', () => {
  for (const method of ['Tunai', 'Transfer Manual', 'Tunai - Loket', 'Online']) {
    const data = fixture(); save(data);
    markInvoicePaid(data, data.invoices[0].id, { paymentMethod: method, paidAt: '2026-10-30' });
    server.reactivateCustomerAfterPaidInvoice(data, data.invoices[0], actor);
    assert.equal(data.invoices[0].paymentMethod, method);
    assert.equal(data.payments[0].method, method);
    assert.equal(data.customers[0].paymentPromise.status, 'completed');
    assert.equal(data.invoices[0].dueDate, '2026-10-25');
    assert.equal(run(data, '2026-10-31').isolatedUsers.length, 0);
  }
});

const billingModes = [['postpaid', 'fixed'], ['postpaid', 'cycle'], ['prepaid', 'fixed'], ['prepaid', 'renewal']];
const paymentChannels = ['Tunai', 'Transfer Manual', 'Tunai - Loket', 'QRIS', 'BRIVA', 'BCAVA', 'ALFAMART', 'INDOMARET'];

function payByChannel(data, method, invoice = data.invoices[0]) {
  if (paymentChannels.indexOf(method) < 3) {
    markInvoicePaid(data, invoice.id, { paymentMethod: method, paidAt: '2026-10-30' });
    return server.reactivateCustomerAfterPaidInvoice(data, invoice, actor);
  }
  Object.assign(data.settings.paymentGateway, { enabled: true, provider: 'tripay', monthlyAdminFee: 5000 });
  const gatewayAmount = ['ALFAMART', 'INDOMARET'].includes(method) ? 152000 : 155000;
  return server.fulfillPaymentGatewayCallback(data, {
    merchant_ref: invoice.invoiceNo, reference: `TEST-${invoice.id}-${method}`, status: 'PAID',
    total_amount: gatewayAmount, total_fee: 2000, amount_received: gatewayAmount - 2000,
    payment_method: method, paid_at: '2026-10-30T04:00:00.000Z'
  }, actor);
}

for (const [paymentType, billingPeriod] of billingModes) for (const serviceType of ['pppoe', 'dhcp']) {
  const label = `${paymentType}/${billingPeriod}/${serviceType}`;
  test(`${label}: every payment channel completes the promise and reactivates only billing isolation`, async () => {
    for (const method of paymentChannels) for (const overdue of [false, true]) {
      const data = fixture(); Object.assign(data.customers[0], { paymentType, billingPeriod });
      data.radiusUsers[0].serviceType = serviceType;
      save(data);
      if (overdue) assert.equal(run(data, '2026-10-31', '13:30').isolatedUsers.length, 1, method);
      const before = { dueDate: data.invoices[0].dueDate, period: data.invoices[0].period, amount: data.invoices[0].amount };
      const activation = payByChannel(data, method);
      assert.equal(data.customers[0].paymentPromise.status, 'completed', method);
      assert.equal(data.invoices[0].status, 'paid', method);
      assert.equal(data.payments.length, 1, method);
      assert.equal(data.payments[0].method, data.invoices[0].paymentMethod);
      if (paymentChannels.indexOf(method) < 3) {
        assert.equal(data.payments[0].method, method);
        assert.equal(data.payments[0].amount, 150000);
      } else {
        assert.equal(data.payments[0].paymentCategory, 'online');
        assert.equal(data.payments[0].amount, data.payments[0].gatewayAmount - 2000);
        assert.equal(data.payments[0].providerFee, 2000);
      }
      assert.equal(data.customers[0].status, 'active', method);
      assert.equal(data.radiusUsers[0].status, 'active', method);
      assert.deepEqual({ dueDate: data.invoices[0].dueDate, period: data.invoices[0].period, amount: data.invoices[0].amount }, before);
      assert.equal(data.customers[0].paymentType, paymentType);
      assert.equal(data.customers[0].billingPeriod, billingPeriod);
      let syncs = 0, disconnects = 0;
      await server.finalizePaidInvoiceRadiusActivation(data, activation, actor, 'promise-channel-test', {
        sync: async () => { syncs++; }, disconnect: async () => { disconnects++; return { ok: true }; }
      });
      assert.equal(syncs, overdue ? 1 : 0, method);
      assert.equal(disconnects, overdue ? 1 : 0, method);
      payByChannel(data, method);
      assert.equal(data.payments.length, 1, method);
      assert.equal(run(data, '2026-10-31').isolatedUsers.length, 0, method);
    }
  });

  test(`${label}: holds through the promise date, isolates H+1, and preserves a permanent exemption`, () => {
    const data = fixture(); Object.assign(data.customers[0], { paymentType, billingPeriod });
    data.radiusUsers[0].serviceType = serviceType;
    save(data);
    assert.equal(run(data, '2026-10-30', '23:59').isolatedUsers.length, 0);
    assert.equal(run(data, '2026-10-31', '13:29').isolatedUsers.length, 0);
    const exempt = structuredClone(data); exempt.customers[0].billingIsolationOverride = true;
    assert.equal(run(exempt, '2026-10-31', '13:30').isolatedUsers.length, 0);
    assert.equal(run(data, '2026-10-31', '13:30').isolatedUsers.length, 1);
    assert.equal(data.customers[0].paymentPromise.status, 'broken');
    assert.equal(data.invoices[0].status, 'pending');
    assert.equal(data.payments.length, 0);
  });
}

test('non-paid gateway callbacks never settle a promise and mixed channels settle only after all bills are paid', () => {
  for (const status of ['UNPAID', 'PENDING', 'EXPIRED', 'FAILED']) {
    const data = fixture(); save(data);
    data.settings.paymentGateway.provider = 'tripay';
    server.fulfillPaymentGatewayCallback(data, { merchant_ref: '100001', reference: 'TEST-NOT-PAID', status, total_amount: 150000, payment_method: 'QRIS' }, actor);
    assert.equal(data.customers[0].paymentPromise.status, 'active', status);
    assert.equal(data.invoices[0].status, 'pending', status);
    assert.equal(data.payments.length, 0, status);
  }
  const data = fixture();
  data.invoices.push({ ...data.invoices[0], id: 'second', invoiceNo: '100002', period: '2026-09', dueDate: '2026-10-24' });
  save(data); payByChannel(data, 'QRIS');
  assert.equal(data.customers[0].paymentPromise.status, 'active');
  payByChannel(data, 'Transfer Manual', data.invoices[1]);
  assert.equal(data.customers[0].paymentPromise.status, 'completed');
  assert.equal(data.payments.length, 2);
  assert.equal(run(data, '2026-10-31').isolatedUsers.length, 0);
});

test('settling a promise by any channel never bypasses subsequent manual termination', () => {
  for (const method of paymentChannels) {
    const data = fixture(); save(data);
    Object.assign(data.customers[0], { status: 'terminated', terminationSource: 'manual' });
    Object.assign(data.radiusUsers[0], { status: 'terminated', terminationSource: 'manual' });
    const result = payByChannel(data, method);
    assert.equal(data.customers[0].paymentPromise.status, 'completed');
    assert.equal(result.activatedUser, null);
    assert.equal(data.customers[0].status, 'terminated');
    assert.equal(data.radiusUsers[0].status, 'terminated');
  }
});

test('paying only one of several promised invoices does not complete the entire promise', () => {
  const data = fixture(); data.invoices.push({ ...data.invoices[0], id: 'second', period: '2026-09', dueDate: '2026-10-24' });
  save(data); markInvoicePaid(data, 'promise-invoice', { paymentMethod: 'Tunai' });
  server.reactivateCustomerAfterPaidInvoice(data, data.invoices[0], actor);
  assert.equal(data.customers[0].paymentPromise.status, 'active');
  assert.equal(run(data, '2026-10-31').isolatedUsers.length, 1);
});

test('cancelled invoices close a promise and actual multi-month paid coverage prevents isolation', () => {
  const cancelled = fixture(); save(cancelled); cancelled.invoices[0].status = 'cancelled';
  assert.equal(run(cancelled, '2026-10-31').isolatedUsers.length, 0);
  assert.equal(cancelled.customers[0].paymentPromise.status, 'completed');
  const paid = fixture(); save(paid);
  paid.invoices.push({ ...paid.invoices[0], id: 'paid-coverage', status: 'paid', paidAt: '2026-10-27' });
  assert.equal(run(paid, '2026-10-31').isolatedUsers.length, 0);
  assert.equal(paid.customers[0].paymentPromise.status, 'completed');
});

test('rollback after completion does not silently recreate a promise', () => {
  const data = fixture(); save(data); markInvoicePaid(data, data.invoices[0].id, { paymentMethod: 'Tunai' });
  server.reactivateCustomerAfterPaidInvoice(data, data.invoices[0], actor);
  markInvoiceUnpaid(data, data.invoices[0].id);
  assert.equal(run(data, '2026-10-29').isolatedUsers.length, 1);
  assert.equal(data.customers[0].paymentPromise.status, 'completed');
});

test('disabling the feature cancels the hold, re-enabling cannot resurrect it', () => {
  const data = fixture(); save(data); data.settings.billing.paymentPromiseEnabled = false;
  const result = run(data, '2026-10-29');
  assert.equal(result.paymentPromiseUpdates.length, 1);
  assert.equal(data.customers[0].paymentPromise.status, 'cancelled');
  assert.equal(result.isolatedUsers.length, 1);
  data.settings.billing.paymentPromiseEnabled = true;
  assert.equal(promise.evaluate(data.customers[0], data.invoices, '2026-10-29'), null);
});

test('promise data survives normalization and restart; a missed H+1 is caught up on the next run', () => {
  const data = fixture(); save(data);
  const restarted = ensureShape(JSON.parse(JSON.stringify(data)));
  assert.equal(restarted.customers[0].paymentPromise.date, '2026-10-30');
  assert.equal(run(restarted, '2026-11-02').isolatedUsers.length, 1);
});

test('scope checks reject out-of-target collectors without touching customer data', () => {
  const data = fixture(); const before = structuredClone(data);
  assert.throws(() => server.billingPaymentPromiseOperation(data, { invoiceId: data.invoices[0].id }, { role: 'collector', lockedNasIds: [] }, at('2026-10-26')), /kewenangan/);
  assert.deepEqual(data, before);
});

test('date logic is independent of server timezone and uses the application day at midnight', () => {
  const data = fixture(); save(data);
  assert.equal(run(data, '2026-10-30', '23:59').isolatedUsers.length, 0);
  assert.equal(run(data, '2026-10-31', '00:01').isolatedUsers.length, 0);
  assert.equal(run(data, '2026-10-31', '13:30').isolatedUsers.length, 1);
});

test('billing midnight uses a zero-based hour cycle on supported Node versions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
  const clock = source.slice(source.indexOf('function localDateParts('), source.indexOf('function localTodayIso('));
  for (const [zone, instant] of [
    ['Asia/Jakarta', '2026-10-30T17:01:00Z'],
    ['Asia/Makassar', '2026-10-30T16:01:00Z'],
    ['Asia/Jayapura', '2026-10-30T15:01:00Z']
  ]) {
    const result = vm.runInNewContext(`${clock}\nlocalDateParts(new Date(instant), zone)`, {
      instant, zone, DEFAULT_APP_TIME_ZONE: 'Asia/Makassar', activeAppTimeZone: '',
      normalizeAppTimeZone: value => value,
      cachedDateTimeFormatter: (locale, options) => {
        assert.equal(options.hourCycle, 'h23');
        assert.equal(Object.hasOwn(options, 'hour12'), false);
        return new Intl.DateTimeFormat(locale, options);
      }
    });
    assert.equal(`${result.year}-${result.month}-${result.day} ${result.hour}:${result.minute}`, '2026-10-31 00:01');
  }
});

test('UI toggle stays beside merge, promise actions are feature/permission gated and notes are escaped', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.match(source, /billing-policy-toggles[\s\S]*name="mergeInvoice"[\s\S]*name="paymentPromiseEnabled"/);
  assert.match(source, /standaloneBilling && paymentPromiseEnabled && can\('invoices:manage'\)/);
  assert.match(source, /escapeHtml\(savedPromise \? payload\.promise\.note/);
  assert.match(source, /const date = savedPromise \? payload\.promise\.date : ''/);
  assert.match(source, /allowEmpty: true, placeholder: 'Pilih tanggal janji bayar'/);
  assert.match(source, /cancelActivePromises = true/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8'), /automation\?\.paymentPromiseUpdates\?\.length/);
  for (const file of ['install.sh', 'deploy/bin/fakenet-billing-update']) {
    assert.match(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), /src\/payment-promise\.js/);
  }
});

test('promise deadline notice uses compact Indonesian dates and the configured isolation time', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const modal = source.slice(source.indexOf('async function openBillingPaymentPromiseModal'), source.indexOf('function billingActionButtons'));
  const update = modal.match(/const update = \(\) => \{([\s\S]*?)\n  \};/)[1];
  const months = source.match(/const MONTH_LABELS = (\[[^\n]+\]);/)[0];
  for (const [date, time, expected] of [
    ['2026-10-21', '13:30', 'Janji Bayar 21 Okt, Isolir 22 Okt 13:30'],
    ['2026-10-31', '07:45', 'Janji Bayar 31 Okt, Isolir 1 Nov 07:45'],
    ['2026-12-31', '13:30', 'Janji Bayar 31 Des, Isolir 1 Jan 13:30'],
    ['2028-02-28', '13:30', 'Janji Bayar 28 Feb, Isolir 29 Feb 13:30'],
    ['', '13:30', 'Jadwal tagihan belum tersedia.']
  ]) {
    const notice = {};
    vm.runInNewContext(`${months}\n${update}`, {
      input: { value: date }, payload: { invoices: [], isolationTime: time, promise: date ? { status: 'active', date } : null }, unavailable: false,
      modalBody: { querySelector: selector => selector === '[data-promise-deadline]' ? notice : {} }
    });
    assert.equal(notice.textContent, expected);
  }
});

test('an unset promise preview reports actual normal billing dates without changing data', () => {
  const data = fixture('2026-10-10');
  Object.assign(data.settings.billing, { suspendGraceDays: 5, autoSuspendTime: '09:15' });
  const before = structuredClone(data);
  const preview = server.billingPaymentPromiseOperation(data, { invoiceId: data.invoices[0].id }, actor, at('2026-10-21'));
  assert.equal(preview.minDate, '2026-10-21');
  assert.equal(preview.promise, null);
  assert.deepEqual(preview.normalSchedule, { dueDate: '2026-10-10', isolationDate: '2026-10-15' });
  assert.equal(preview.isolationTime, '09:15');
  assert.deepEqual(data, before);
  data.settings.billing.suspendGraceDays = 0;
  const disabled = server.billingPaymentPromiseOperation(data, { invoiceId: data.invoices[0].id }, actor, at('2026-10-21'));
  assert.deepEqual(disabled.normalSchedule, { dueDate: '2026-10-10', isolationDate: '' });
});

test('an empty promise date shows the real due date and normal isolation, not today or H+1', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const modal = source.slice(source.indexOf('async function openBillingPaymentPromiseModal'), source.indexOf('function billingActionButtons'));
  const update = modal.match(/const update = \(\) => \{([\s\S]*?)\n  \};/)[1];
  const months = source.match(/const MONTH_LABELS = (\[[^\n]+\]);/)[0];
  for (const [normalSchedule, excluded, expected] of [
    [{ dueDate: '2026-10-10', isolationDate: '2026-10-15' }, false, 'Jatuh Tempo 10 Okt, Isolir 15 Okt 09:15'],
    [{ dueDate: '2026-11-04', isolationDate: '2026-11-09' }, false, 'Jatuh Tempo 4 Nov, Isolir 9 Nov 09:15'],
    [{ dueDate: '2026-10-10', isolationDate: '' }, false, 'Jatuh Tempo 10 Okt, Isolir otomatis nonaktif'],
    [{ dueDate: '2026-10-10', isolationDate: '2026-10-15' }, true, 'Jatuh Tempo 10 Okt, Dikecualikan dari isolir']
  ]) for (const selected of ['', '2026-10-30']) {
    const notice = {}, submit = {};
    vm.runInNewContext(`${months}\n${update}`, {
      input: { value: selected }, unavailable: false,
      payload: { invoices: [], isolationTime: '09:15', minDate: '2026-10-21', maxDate: '2026-11-10', normalSchedule, excluded },
      modalBody: { querySelector: selector => selector === '[data-promise-deadline]' ? notice : selector === 'button[type="submit"]' ? submit : {} }
    });
    assert.equal(notice.textContent, expected);
    assert.equal(submit.disabled, !selected);
  }
});

test('changing a draft promise never replaces the displayed saved promise schedule', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const modal = source.slice(source.indexOf('async function openBillingPaymentPromiseModal'), source.indexOf('function billingActionButtons'));
  const update = modal.match(/const update = \(\) => \{([\s\S]*?)\n  \};/)[1];
  const months = source.match(/const MONTH_LABELS = (\[[^\n]+\]);/)[0];
  for (const date of ['2026-10-23', '2026-10-30', '2026-11-01']) {
    const notice = {};
    vm.runInNewContext(`${months}\n${update}`, {
      input: { value: date }, unavailable: false,
      payload: { invoices: [], isolationTime: '09:15', minDate: '2026-10-21', maxDate: '2026-11-10', promise: { status: 'active', date: '2026-10-25' } },
      modalBody: { querySelector: selector => selector === '[data-promise-deadline]' ? notice : {} }
    });
    assert.equal(notice.textContent, 'Janji Bayar 25 Okt, Isolir 26 Okt 09:15');
  }
});

test('an explicitly empty promise picker never falls back to today', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const picker = source.slice(source.indexOf('function datePickerControl('), source.indexOf('function closeDatePickers('));
  const context = {
    todayInput: () => '2026-10-21', dateIsoInput: () => '2026-10-21',
    dateDisplayInput: () => '21/10/2026', escapeHtml: value => String(value)
  };
  const empty = vm.runInNewContext(`${picker}\ndatePickerControl({ name: 'date', value: '', allowEmpty: true, placeholder: 'Pilih tanggal janji bayar' })`, context);
  assert.match(empty, /name="date" type="hidden" value=""/);
  assert.match(empty, /Pilih tanggal janji bayar/);
  assert.doesNotMatch(empty, /2026-10-21|21\/10\/2026/);
  const normal = vm.runInNewContext(`${picker}\ndatePickerControl({ name: 'normal' })`, context);
  assert.match(normal, /value="2026-10-21"/);
});
