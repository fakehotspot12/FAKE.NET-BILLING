'use strict';

const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addExpense,
  addExternalIncome,
  addMonthsToPeriod,
  cancelInvoice,
  currentPeriod,
  dueDateForPeriod,
  generateInvoices,
  invoiceRuntimeStatus,
  deleteExpense,
  deleteExternalIncome,
  markInvoicePaid,
  markInvoiceUnpaid,
  paymentIsActive,
  summarize,
  updateExternalIncome,
  updateExpense,
  upsertCustomers,
  upsertMonthlyEarning
} = require('../src/finance');
const { createDefaultStore, ensureShape, publicSettings } = require('../src/store');
const {
  createRadiusHotspotUser,
  createRadiusPppDhcpUser,
  deleteRadiusHotspotUser,
  deleteRadiusPppDhcpUser,
  enrichInvoicesWithPppUsers,
  generateManualInvoice,
  getBillingMemberContactDetail,
  getBillingMemberPaymentDetail,
  invoiceMonitorStatus,
  isBillingInvoiceOverdue,
  listCashierTransactions,
  listBillingMembers,
  listRadiusHotspot,
  listRadiusPppDhcp,
  listRadiusSettings,
  normalizeBillingInvoice,
  normalizeBillingMember,
  normalizeCustomer,
  normalizeDailyReport,
  normalizeInvoice,
  normalizeMonthlyEarning,
  normalizePppSession,
  normalizePppUser,
  normalizeXenditBalanceMovement,
  normalizeXenditPendingMovement,
  normalizeXenditTransaction,
  normalizeXenPlatformReport,
  parseHtmlTables,
  payInvoice,
  previewManualInvoice,
  requestXenditWithdraw,
  rollbackInvoice,
  sendInvoiceReminder,
  syncDailyReport,
  syncMonthlyEarning,
  updateRadiusHotspotUser,
  updateRadiusPppDhcpUser,
  updateBillingMemberContactDetail,
  updateBillingMemberPaymentDetail,
  xenditGatewayStatus,
  verifyXenditWithdraw
} = require('../src/radboox');
const { __test: serverInternals } = require('../src/server');
const {
  createUser,
  deleteUser,
  ensureDefaultUsers,
  hasPermission,
  publicUser,
  radbooxCredentialsForUser,
  updateUser,
  verifyPassword
} = require('../src/auth');
const { encryptSecret } = require('../src/secure-secrets');

test('generates monthly invoices for active customers', () => {
  const data = createDefaultStore();
  data.settings.billing.invoiceNumberFormat = '001/INV-BOGUS/{ROMAN}/{YEAR}';
  upsertCustomers(data, [
    {
      externalId: '1',
      username: 'udin@kampung.net',
      name: 'Udin',
      packageName: 'PAKET B SILVER 20 Mb',
      status: 'active'
    },
    {
      externalId: '2',
      username: 'nonaktif@kampung.net',
      name: 'Nonaktif',
      packageName: 'PAKET C GOLD 30 Mb',
      status: 'inactive'
    }
  ]);

  const created = generateInvoices(data, '2026-06');

  assert.equal(created.length, 1);
  assert.equal(created[0].amount, 150000);
  assert.equal(created[0].dueDate, '2026-06-10');
  assert.equal(created[0].invoiceNo, '000001');
  assert.equal(generateInvoices(data, '2026-06').length, 0);
});

test('postpaid billing cycle uses billing setting due date while fixed uses member due date', () => {
  const data = createDefaultStore();
  data.settings.billing.postpaidDueDay = 10;
  data.customers.push(
    {
      id: 'cus-fixed',
      username: 'fixed@kampung.net',
      name: 'Fixed',
      packageName: 'Paket Fixed',
      status: 'active',
      price: 100000,
      paymentType: 'postpaid',
      billingPeriod: 'fixed',
      dueDay: 20
    },
    {
      id: 'cus-cycle',
      username: 'cycle@kampung.net',
      name: 'Cycle',
      packageName: 'Paket Cycle',
      status: 'active',
      price: 100000,
      paymentType: 'postpaid',
      billingPeriod: 'cycle',
      dueDay: 20
    }
  );

  const created = generateInvoices(data, '2026-08');
  const fixed = created.find((invoice) => invoice.customerId === 'cus-fixed');
  const cycle = created.find((invoice) => invoice.customerId === 'cus-cycle');

  assert.equal(fixed.dueDate, '2026-08-20');
  assert.equal(cycle.dueDate, '2026-08-10');
});

test('first postpaid billing cycle invoice is prorated from active date to cycle due date', () => {
  const data = createDefaultStore();
  data.settings.billing.postpaidDueDay = 15;
  data.customers.push(
    {
      id: 'cus-cycle-after',
      username: 'cycle-after@kampung.net',
      name: 'Cycle After',
      packageName: 'Paket Cycle',
      status: 'active',
      price: 150000,
      paymentType: 'postpaid',
      billingPeriod: 'cycle',
      activeDate: '2026-07-20',
      firstInvoiceStatus: 'unpaid',
      dueDay: 20
    },
    {
      id: 'cus-cycle-before',
      username: 'cycle-before@kampung.net',
      name: 'Cycle Before',
      packageName: 'Paket Cycle',
      status: 'active',
      price: 150000,
      paymentType: 'postpaid',
      billingPeriod: 'cycle',
      activeDate: '2026-07-10',
      firstInvoiceStatus: 'unpaid',
      dueDay: 10
    }
  );

  const july = generateInvoices(data, '2026-07');
  assert.equal(july.length, 1);
  assert.equal(july[0].customerId, 'cus-cycle-before');
  assert.equal(july[0].dueDate, '2026-07-15');
  assert.equal(july[0].amount, 30000);
  assert.equal(july[0].prorated, true);
  assert.equal(july[0].proration.usedDays, 6);

  const august = generateInvoices(data, '2026-08');
  const firstAfterCycle = august.find((invoice) => invoice.customerId === 'cus-cycle-after');
  const nextBeforeCycle = august.find((invoice) => invoice.customerId === 'cus-cycle-before');
  assert.equal(firstAfterCycle.dueDate, '2026-08-15');
  assert.equal(firstAfterCycle.amount, 135000);
  assert.equal(firstAfterCycle.prorated, true);
  assert.equal(firstAfterCycle.proration.usedDays, 27);
  assert.equal(nextBeforeCycle.amount, 150000);
  assert.equal(nextBeforeCycle.prorated, false);
});

test('postpaid billing cycle skips active month when first invoice was paid', () => {
  const data = createDefaultStore();
  data.settings.billing.postpaidDueDay = 15;
  data.customers.push(
    {
      id: 'cus-cycle-paid',
      username: 'cycle-paid@kampung.net',
      name: 'Cycle Paid',
      packageName: 'Paket Cycle',
      status: 'active',
      price: 150000,
      paymentType: 'postpaid',
      billingPeriod: 'cycle',
      activeDate: '2026-07-15',
      firstInvoiceStatus: 'paid'
    },
    {
      id: 'cus-cycle-default',
      username: 'cycle-default@kampung.net',
      name: 'Cycle Default',
      packageName: 'Paket Cycle',
      status: 'active',
      price: 150000,
      paymentType: 'postpaid',
      billingPeriod: 'cycle',
      activeDate: '2026-07-15'
    }
  );

  assert.equal(generateInvoices(data, '2026-07').length, 0);

  const august = generateInvoices(data, '2026-08');
  assert.equal(august.length, 2);
  assert.deepEqual(august.map((invoice) => invoice.customerId).sort(), ['cus-cycle-default', 'cus-cycle-paid']);
  assert.equal(august.every((invoice) => invoice.amount === 150000), true);
  assert.equal(august.every((invoice) => invoice.prorated === false), true);
});

test('generates invoices only after the active date month', () => {
  const data = createDefaultStore();
  data.customers.push(
    {
      id: 'cus-active-current',
      username: 'baru@kampung.net',
      name: 'Pelanggan Baru',
      packageName: 'PAKET B SILVER 20 Mb',
      status: 'active',
      activeDate: '2026-07-14'
    },
    {
      id: 'cus-active-old',
      username: 'lama@kampung.net',
      name: 'Pelanggan Lama',
      packageName: 'PAKET B SILVER 20 Mb',
      status: 'active',
      activeDate: '14/05/2026'
    }
  );

  const july = generateInvoices(data, '2026-07');
  assert.equal(july.length, 1);
  assert.equal(july[0].customerId, 'cus-active-old');
  assert.equal(july[0].period, '2026-07');
  assert.equal(generateInvoices(data, '2026-05').length, 0);

  const august = generateInvoices(data, '2026-08');
  assert.equal(august.length, 2);
  assert.deepEqual(august.map((invoice) => invoice.customerId).sort(), ['cus-active-current', 'cus-active-old']);
});

test('generated invoices include member PPN and discount in total amount', () => {
  const data = createDefaultStore();
  data.customers.push({
    id: 'cus-taxed',
    username: 'taxed@kampung.net',
    name: 'Pelanggan Pajak',
    packageName: 'Paket 10 Mbps',
    status: 'active',
    price: 150000,
    ppn: '11',
    discount: '10'
  });

  const created = generateInvoices(data, '2026-07');

  assert.equal(created.length, 1);
  assert.equal(created[0].subtotal, 150000);
  assert.equal(created[0].discountRate, 10);
  assert.equal(created[0].discountAmount, 15000);
  assert.equal(created[0].ppnRate, 11);
  assert.equal(created[0].ppnAmount, 14850);
  assert.equal(created[0].amount, 149850);
  assert.equal(created[0].totalAmount, 149850);
});

test('local manual invoice skips active month when first invoice was paid', () => {
  const data = createDefaultStore();
  data.settings.billing = { postpaidDueDay: 10 };
  const activePeriod = currentPeriod();
  const nextPeriod = addMonthsToPeriod(activePeriod, 1);
  const dueDay = 20;
  const customer = {
    id: 'cus-manual-paid',
    username: 'rahul',
    name: 'Rahul',
    packageName: 'Paket 10 Mbps',
    amount: 150000,
    status: 'active',
    activeDate: `${activePeriod}-${String(dueDay).padStart(2, '0')}`,
    firstInvoiceStatus: 'paid'
  };
  data.customers.push(customer);

  const preview = serverInternals.localManualInvoicePreview(data, customer, 1);

  assert.equal(preview.period, nextPeriod);
  assert.equal(preview.dueDate, dueDateForPeriod(nextPeriod, dueDay));
  assert.deepEqual(preview.coveredPeriods, [nextPeriod]);
});

test('local manual invoice preview applies member PPN and discount for multi-month billing', () => {
  const data = createDefaultStore();
  const customer = {
    id: 'cus-manual-taxed',
    username: 'manual-taxed@kampung.net',
    name: 'Manual Taxed',
    packageName: 'Paket 10 Mbps',
    status: 'active',
    price: 150000,
    ppn: '11',
    discount: '10',
    activeDate: '2026-06-15',
    firstInvoiceStatus: 'paid'
  };

  const preview = serverInternals.localManualInvoicePreview(data, customer, 2);

  assert.equal(preview.subtotal, 300000);
  assert.equal(preview.discountAmount, 30000);
  assert.equal(preview.ppnAmount, 29700);
  assert.equal(preview.totalAmount, 299700);
});

test('local manual invoice stores PPN and discount fields', () => {
  const data = createDefaultStore();
  const customer = {
    id: 'cus-manual-taxed-store',
    username: 'manual-taxed-store@kampung.net',
    name: 'Manual Taxed Store',
    packageName: 'Paket 10 Mbps',
    status: 'active',
    price: 150000,
    ppn: '11',
    discount: '10',
    activeDate: '2026-06-15',
    firstInvoiceStatus: 'paid'
  };
  data.customers.push(customer);

  const { invoice } = serverInternals.createLocalManualInvoice(data, customer, 2, { name: 'Admin', username: 'admin' }, { queueWa: false });

  assert.equal(invoice.subtotal, 300000);
  assert.equal(invoice.discountAmount, 30000);
  assert.equal(invoice.ppnAmount, 29700);
  assert.equal(invoice.amount, 299700);
});

test('cancelled local manual invoice releases period for recreation with updated price', () => {
  const data = createDefaultStore();
  const period = currentPeriod();
  const customer = {
    id: 'cus-manual-cancel-recreate',
    username: 'cancel-recreate@kampung.net',
    name: 'Cancel Recreate',
    packageName: 'Paket 10 Mbps',
    status: 'active',
    price: 150000,
    activeDate: `${period}-10`,
    firstInvoiceStatus: 'unpaid'
  };
  data.customers.push(customer);

  const { invoice: oldInvoice } = serverInternals.createLocalManualInvoice(data, customer, 1, { name: 'Admin', username: 'admin' }, { queueWa: false });
  cancelInvoice(data, oldInvoice.id, { actorName: 'Admin', actorUsername: 'admin' });
  customer.price = 180000;
  customer.amount = 180000;
  customer.packageName = 'Paket 15 Mbps';
  const { invoice: newInvoice } = serverInternals.createLocalManualInvoice(data, customer, 1, { name: 'Admin', username: 'admin' }, { queueWa: false });

  assert.equal(oldInvoice.status, 'cancelled');
  assert.equal(newInvoice.period, oldInvoice.period);
  assert.deepEqual(newInvoice.coveredPeriods, oldInvoice.coveredPeriods);
  assert.equal(newInvoice.amount, 180000);
  assert.equal(newInvoice.packageName, 'Paket 15 Mbps');
});

test('paid invoice cannot be cancelled', () => {
  const data = createDefaultStore();
  const customer = {
    id: 'cus-paid-cancel-blocked',
    username: 'paid-cancel@kampung.net',
    name: 'Paid Cancel',
    packageName: 'Paket 10 Mbps',
    status: 'active',
    price: 150000,
    activeDate: `${currentPeriod()}-10`,
    firstInvoiceStatus: 'unpaid'
  };
  data.customers.push(customer);
  const { invoice } = serverInternals.createLocalManualInvoice(data, customer, 1, { name: 'Admin', username: 'admin' }, { queueWa: false });
  markInvoicePaid(data, invoice.id, { createdByName: 'Admin' });

  assert.throws(() => cancelInvoice(data, invoice.id, { actorName: 'Admin' }), /sudah lunas/);
  assert.equal(invoice.status, 'paid');
});

test('local manual invoice allows active month when first invoice is unpaid', () => {
  const data = createDefaultStore();
  data.settings.billing = { postpaidDueDay: 10 };
  const activePeriod = currentPeriod();
  const dueDay = 20;
  const customer = {
    id: 'cus-manual-unpaid',
    username: 'dayat',
    name: 'Dayat',
    packageName: 'Paket 10 Mbps',
    amount: 150000,
    status: 'active',
    activeDate: `${activePeriod}-${String(dueDay).padStart(2, '0')}`,
    firstInvoiceStatus: 'unpaid'
  };
  data.customers.push(customer);

  const preview = serverInternals.localManualInvoicePreview(data, customer, 1);

  assert.equal(preview.period, activePeriod);
  assert.equal(preview.dueDate, dueDateForPeriod(activePeriod, dueDay));
  assert.deepEqual(preview.coveredPeriods, [activePeriod]);
});

test('invoice due day supports end-of-month anchors', () => {
  assert.equal(dueDateForPeriod('2026-01', 31), '2026-01-31');
  assert.equal(dueDateForPeriod('2026-02', 31), '2026-02-28');
  assert.equal(dueDateForPeriod('2028-02', 31), '2028-02-29');
});

test('changelog summary returns three newest release sections', () => {
  const summary = serverInternals.changelogSummaryFromText(`# Changelog

## [1.0.4] - 2026-07-15
- Empat

## [1.0.3] - 2026-07-15
- Tiga

## [1.0.2] - 2026-07-15
- Dua

## [1.0.1] - 2026-07-15
- Satu
`, 3);

  assert.match(summary, /\[1\.0\.4\]/);
  assert.match(summary, /\[1\.0\.3\]/);
  assert.match(summary, /\[1\.0\.2\]/);
  assert.doesNotMatch(summary, /\[1\.0\.1\]/);
  assert.ok(summary.indexOf('[1.0.4]') < summary.indexOf('[1.0.3]'));
});

test('commit log summary formats same-version update fallback', () => {
  const summary = serverInternals.commitLogSummaryFromText(`abc1234 Fix updater status
def5678 Add billing docs
`, 1);

  assert.match(summary, /Revisi remote/);
  assert.match(summary, /abc1234 Fix updater status/);
  assert.doesNotMatch(summary, /def5678/);
});

test('update fallback summary avoids stale changelog when update exists', () => {
  const summary = serverInternals.updateAvailableFallbackSummary({
    updateAvailable: true,
    currentVersion: '1.0.20',
    remoteVersion: '1.0.20',
    currentCommitShort: 'abc1234',
    remoteCommitShort: 'def5678'
  });

  assert.match(summary, /Revisi remote tersedia/);
  assert.match(summary, /abc1234/);
  assert.match(summary, /def5678/);
  assert.match(summary, /belum bisa dibaca atau belum diperbarui/);
});

test('deleting radius user removes linked member but keeps transaction history', () => {
  const data = createDefaultStore();
  const customer = {
    id: 'cus-radius-1',
    source: 'radius',
    username: 'hapus@ppp.test',
    name: 'Pelanggan Hapus',
    status: 'active',
    price: 100000
  };
  const radiusUser = {
    id: 'rad-user-1',
    serviceType: 'pppoe',
    username: 'hapus@ppp.test',
    customerId: customer.id,
    status: 'active'
  };
  data.customers.push(customer);
  data.radiusUsers.push(radiusUser);
  data.invoices.push(
    { id: 'inv-unpaid-1', customerId: customer.id, customerName: customer.name, period: '2026-07', amount: 100000, status: 'pending', dueDate: '2026-07-10' },
    { id: 'inv-paid-1', customerId: customer.id, customerName: customer.name, period: '2026-06', amount: 100000, status: 'paid', paidAt: '2026-06-09', dueDate: '2026-06-10' }
  );
  data.payments.push({ id: 'pay-1', invoiceId: 'inv-paid-1', customerId: customer.id, amount: 100000, paidAt: '2026-06-09', method: 'Tunai' });

  data.radiusUsers = data.radiusUsers.filter((user) => user.id !== radiusUser.id);
  const removed = serverInternals.deleteRadiusLinkedMember(data, radiusUser, { name: 'Admin' });

  assert.equal(removed.id, customer.id);
  assert.equal(data.customers.some((item) => item.id === customer.id), false);
  assert.equal(data.payments.length, 1);
  assert.equal(data.payments[0].invoiceId, 'inv-paid-1');
  assert.equal(data.invoices.find((invoice) => invoice.id === 'inv-paid-1').status, 'paid');
  assert.equal(data.invoices.find((invoice) => invoice.id === 'inv-unpaid-1').status, 'cancelled');
  assert.equal(data.radiusRemovedRecords.length, 1);
  assert.equal(data.radiusRemovedRecords[0].status, 'removed');
  assert.equal(data.radiusRemovedRecords[0].username, 'hapus@ppp.test');
  assert.equal(data.radiusRemovedRecords[0].source, 'ppp-delete');
  assert.equal(data.radiusRemovedRecords[0].customerId, customer.id);
  assert.equal(serverInternals.dashboardRadiusServiceSummary(data, 'pppoe', currentPeriod()).removed, 1);
  assert.equal(serverInternals.dashboardRadiusServiceSummary(data, 'pppoe', addMonthsToPeriod(currentPeriod(), 1)).removed, 0);
});

test('dashboard PPP-DHCP PSB counts linked members for selected period only', () => {
  const data = createDefaultStore();
  const period = currentPeriod();
  data.customers.push({
    id: 'cus-psb-1',
    username: 'psb-1@ppp.test',
    name: 'Pelanggan PSB',
    activeDate: `${period}-05`,
    createdAt: `${period}-05T09:00:00.000Z`,
    status: 'active'
  });
  data.radiusUsers.push(
    { id: 'rad-psb-1', serviceType: 'pppoe', username: 'psb-1@ppp.test', customerId: 'cus-psb-1', status: 'active', createdAt: `${period}-05T09:00:00.000Z` },
    { id: 'rad-psb-duplicate', serviceType: 'pppoe', username: 'psb-1-backup@ppp.test', customerId: 'cus-psb-1', status: 'active', createdAt: `${period}-06T09:00:00.000Z` },
    { id: 'rad-no-member', serviceType: 'pppoe', username: 'tanpa-member@ppp.test', customerId: '', status: 'active', createdAt: `${period}-07T09:00:00.000Z` },
    { id: 'rad-hotspot-member', serviceType: 'hotspot', username: 'voucher-psb', customerId: 'cus-psb-1', status: 'active', createdAt: `${period}-07T09:00:00.000Z` }
  );

  assert.equal(serverInternals.dashboardRadiusServiceSummary(data, 'pppoe', period).psb, 1);
  assert.equal(serverInternals.dashboardRadiusServiceSummary(data, 'hotspot', period).psb, 0);
  assert.equal(serverInternals.dashboardRadiusServiceSummary(data, 'pppoe', addMonthsToPeriod(period, 1)).psb, 0);
});

test('PPP member price follows selected profile instead of stale form payload', () => {
  const data = createDefaultStore();
  data.radiusProfiles.push({
    id: 'prof-10m',
    name: '10 Mbps',
    serviceType: 'pppoe',
    price: 150000
  });
  const radiusUser = {
    id: 'rad-rahul',
    username: 'rahul',
    profileId: 'prof-10m',
    serviceType: 'pppoe'
  };

  const member = serverInternals.radiusMemberFromPayload(data, {
    addToMember: true,
    memberName: 'Rahul',
    memberPhone: '085200000001',
    memberActiveDate: '2026-07-15',
    memberInvoiceStatus: 'paid',
    memberPrice: 300
  }, radiusUser, { name: 'Admin', username: 'admin' });

  assert.equal(member.price, 150000);
  assert.equal(data.customers[0].price, 150000);
});

test('PPP postpaid billing cycle member next due follows billing setting day', () => {
  const data = createDefaultStore();
  data.settings.billing.postpaidDueDay = 15;
  data.radiusProfiles.push({
    id: 'prof-cycle-15m',
    name: '15 Mbps',
    serviceType: 'pppoe',
    price: 180000
  });
  const radiusUser = {
    id: 'rad-azizah-cycle',
    username: 'rt01.azizah@pt',
    profileId: 'prof-cycle-15m',
    serviceType: 'pppoe'
  };

  const member = serverInternals.radiusMemberFromPayload(data, {
    addToMember: true,
    memberName: 'Azizah',
    memberPhone: '085200000002',
    memberActiveDate: '2026-07-16',
    memberInvoiceStatus: 'paid',
    memberPaymentType: 'postpaid',
    memberBillingPeriod: 'cycle'
  }, radiusUser, { name: 'Admin', username: 'admin' });

  assert.equal(member.dueDay, 15);
  assert.equal(member.dueDate, '2026-08-15');
  assert.equal(member.nextDue, '2026-08-15');
});

test('PPP fixed date and prepaid renewal stay anchored to member active date', () => {
  const data = createDefaultStore();
  data.settings.billing.postpaidDueDay = 15;
  data.radiusProfiles.push({
    id: 'prof-fixed-renewal',
    name: '10 Mbps',
    serviceType: 'pppoe',
    price: 150000
  });

  const fixed = serverInternals.radiusMemberFromPayload(data, {
    addToMember: true,
    memberName: 'Fixed Date',
    memberPhone: '085200000003',
    memberActiveDate: '2026-07-16',
    memberInvoiceStatus: 'paid',
    memberPaymentType: 'postpaid',
    memberBillingPeriod: 'fixed'
  }, {
    id: 'rad-fixed-date',
    username: 'fixed-date@ppp.test',
    profileId: 'prof-fixed-renewal',
    serviceType: 'pppoe'
  }, { name: 'Admin', username: 'admin' });

  const renewal = serverInternals.radiusMemberFromPayload(data, {
    addToMember: true,
    memberName: 'Prepaid Renewal',
    memberPhone: '085200000004',
    memberActiveDate: '2026-07-16',
    memberInvoiceStatus: 'paid',
    memberPaymentType: 'prepaid',
    memberBillingPeriod: 'renewal'
  }, {
    id: 'rad-prepaid-renewal',
    username: 'prepaid-renewal@ppp.test',
    profileId: 'prof-fixed-renewal',
    serviceType: 'pppoe'
  }, { name: 'Admin', username: 'admin' });

  assert.equal(fixed.dueDay, 16);
  assert.equal(fixed.dueDate, '2026-08-16');
  assert.equal(fixed.nextDue, '2026-08-16');
  assert.equal(renewal.paymentType, 'prepaid');
  assert.equal(renewal.billingPeriod, 'renewal');
  assert.equal(renewal.dueDay, 16);
  assert.equal(renewal.dueDate, '2026-08-16');
  assert.equal(renewal.nextDue, '2026-08-16');
});

test('PPP profile update syncs linked member price without touching existing invoices', () => {
  const data = createDefaultStore();
  data.radiusProfiles.push(
    {
      id: 'prof-150',
      name: 'Paket 150',
      serviceType: 'pppoe',
      price: 150000
    },
    {
      id: 'prof-180',
      name: 'Paket 180',
      serviceType: 'pppoe',
      price: 180000
    }
  );
  data.customers.push({
    id: 'cus-azizah',
    source: 'radius',
    username: 'azizah',
    name: 'Azizah',
    customerName: 'Azizah',
    packageName: 'Paket 150',
    price: 150000,
    amount: 150000,
    status: 'active'
  });
  const radiusUser = {
    id: 'rad-azizah',
    username: 'azizah',
    customerId: 'cus-azizah',
    profileId: 'prof-180',
    serviceType: 'pppoe',
    status: 'active'
  };
  data.radiusUsers.push(radiusUser);
  data.invoices.push({
    id: 'inv-azizah',
    customerId: 'cus-azizah',
    invoiceNo: '000001',
    packageName: 'Paket 150',
    subtotal: 150000,
    baseAmount: 150000,
    total: 150000,
    totalAmount: 150000,
    amount: 150000,
    status: 'pending',
    dueDate: '2026-07-10'
  });

  const result = serverInternals.syncRadiusMemberProfile(data, radiusUser, { name: 'Admin', username: 'admin' });

  assert.equal(result.changed, true);
  assert.equal(data.customers[0].packageName, 'Paket 180');
  assert.equal(data.customers[0].price, 180000);
  assert.equal(data.customers[0].amount, 180000);
  assert.equal(data.invoices[0].packageName, 'Paket 150');
  assert.equal(data.invoices[0].amount, 150000);
  assert.equal(data.invoices[0].totalAmount, 150000);
});

test('PPP profile price edit syncs every linked member without touching existing invoices', () => {
  const data = createDefaultStore();
  const profile = {
    id: 'prof-azizah',
    name: 'Paket 180',
    serviceType: 'pppoe',
    price: 180000
  };
  data.radiusProfiles.push(profile);
  data.customers.push(
    {
      id: 'cus-azizah-profile',
      source: 'radius',
      username: 'azizah',
      name: 'Azizah',
      packageName: 'Paket Lama',
      price: 150000,
      amount: 150000,
      status: 'active'
    },
    {
      id: 'cus-budi-profile',
      source: 'radius',
      username: 'budi',
      name: 'Budi',
      packageName: 'Paket Lama',
      price: 150000,
      amount: 150000,
      status: 'active'
    }
  );
  data.radiusUsers.push(
    { id: 'rad-azizah-profile', username: 'azizah', customerId: 'cus-azizah-profile', profileId: 'prof-azizah', serviceType: 'pppoe', status: 'active' },
    { id: 'rad-budi-profile', username: 'budi', customerId: 'cus-budi-profile', profileId: 'prof-azizah', serviceType: 'pppoe', status: 'active' }
  );
  data.invoices.push({
    id: 'inv-azizah-profile',
    customerId: 'cus-azizah-profile',
    invoiceNo: '000010',
    packageName: 'Paket Lama',
    amount: 150000,
    totalAmount: 150000,
    status: 'pending',
    dueDate: '2026-07-10'
  });

  const synced = serverInternals.syncRadiusMembersForProfile(data, profile, { name: 'Admin', username: 'admin' });

  assert.equal(synced.length, 2);
  assert.equal(synced.filter((item) => item.changed).length, 2);
  assert.equal(data.customers.find((customer) => customer.username === 'azizah').packageName, 'Paket 180');
  assert.equal(data.customers.find((customer) => customer.username === 'azizah').price, 180000);
  assert.equal(data.customers.find((customer) => customer.username === 'budi').price, 180000);
  assert.equal(data.invoices[0].packageName, 'Paket Lama');
  assert.equal(data.invoices[0].amount, 150000);
});

test('manual radius user create requires a selected profile', () => {
  const data = createDefaultStore();
  data.radiusProfiles.push(
    {
      id: 'prof-ppp-10m',
      name: '10 Mbps',
      serviceType: 'pppoe',
      price: 150000
    },
    {
      id: 'prof-hotspot-3k',
      name: 'Voucher 3K',
      serviceType: 'hotspot',
      price: 3000
    }
  );

  assert.throws(
    () => serverInternals.requireRadiusUserProfile(data, {}, 'pppoe', 'PPP-DHCP'),
    /wajib dipilih/
  );
  assert.throws(
    () => serverInternals.requireRadiusUserProfile(data, { profile: 'None' }, 'pppoe', 'PPP-DHCP'),
    /wajib dipilih/
  );
  assert.doesNotThrow(
    () => serverInternals.requireRadiusUserProfile(data, { profile: '10 Mbps' }, 'pppoe', 'PPP-DHCP')
  );
  assert.doesNotThrow(
    () => serverInternals.requireRadiusUserProfile(data, { profileId: 'prof-hotspot-3k' }, 'hotspot', 'Hotspot')
  );
});

test('deleting radius user removes member linked by radius user id without customer id', () => {
  const data = createDefaultStore();
  const customer = {
    id: 'cus-radius-orphan-link',
    source: 'radius',
    radiusUserId: 'rad-user-old',
    username: 'member-lama@ppp.test',
    name: 'Member Lama',
    status: 'active',
    price: 100000
  };
  const radiusUser = {
    id: 'rad-user-old',
    serviceType: 'pppoe',
    username: 'ppp-berubah@ppp.test',
    customerId: '',
    status: 'active'
  };
  data.customers.push(customer);
  data.radiusUsers.push(radiusUser);

  data.radiusUsers = data.radiusUsers.filter((user) => user.id !== radiusUser.id);
  const removed = serverInternals.deleteRadiusLinkedMember(data, radiusUser, { name: 'Admin' });

  assert.equal(removed.id, customer.id);
  assert.equal(data.customers.some((item) => item.id === customer.id), false);
  assert.equal(data.radiusRemovedRecords.length, 0);
});

test('orphan radius member cleanup removes stale members and keeps paid history', () => {
  const data = createDefaultStore();
  data.customers.push({
    id: 'cus-orphan-radius',
    source: 'radius',
    radiusUserId: 'rad-missing',
    username: 'orphan@ppp.test',
    name: 'Orphan Radius',
    status: 'active',
    price: 100000
  });
  data.invoices.push(
    { id: 'inv-orphan-pending', customerId: 'cus-orphan-radius', customerName: 'Orphan Radius', period: '2026-07', amount: 100000, status: 'pending', dueDate: '2026-07-10' },
    { id: 'inv-orphan-paid', customerId: 'cus-orphan-radius', customerName: 'Orphan Radius', period: '2026-06', amount: 100000, status: 'paid', paidAt: '2026-06-09', dueDate: '2026-06-10' }
  );
  data.payments.push({ id: 'pay-orphan-paid', invoiceId: 'inv-orphan-paid', customerId: 'cus-orphan-radius', amount: 100000, paidAt: '2026-06-09', method: 'Tunai' });

  const removed = serverInternals.deleteOrphanRadiusMembers(data, { name: 'Admin' });

  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, 'cus-orphan-radius');
  assert.equal(data.customers.some((item) => item.id === 'cus-orphan-radius'), false);
  assert.equal(data.invoices.find((invoice) => invoice.id === 'inv-orphan-pending').status, 'cancelled');
  assert.equal(data.invoices.find((invoice) => invoice.id === 'inv-orphan-paid').status, 'paid');
  assert.equal(data.payments.length, 1);
  assert.equal(data.radiusRemovedRecords.length, 0);
});

test('standalone billing automation isolates unpaid overdue and reactivates fully paid member', () => {
  const data = createDefaultStore();
  data.settings.appMode = 'standalone';
  data.settings.billingSource = 'local';
  data.settings.billing.suspendGraceDays = 1;
  data.settings.billing.autoSuspendTime = '00:00';
  data.customers.push(
    { id: 'cus-late', source: 'radius', username: 'late@ppp.test', name: 'Late', status: 'active', price: 100000 },
    { id: 'cus-paid', source: 'radius', username: 'paid@ppp.test', name: 'Paid', status: 'isolir', price: 100000 }
  );
  data.radiusUsers.push(
    { id: 'rad-late', serviceType: 'pppoe', username: 'late@ppp.test', customerId: 'cus-late', status: 'active' },
    { id: 'rad-paid', serviceType: 'pppoe', username: 'paid@ppp.test', customerId: 'cus-paid', status: 'isolated' }
  );
  data.invoices.push(
    { id: 'inv-late', customerId: 'cus-late', customerName: 'Late', username: 'late@ppp.test', period: '2000-01', amount: 100000, status: 'pending', dueDate: '2000-01-01' },
    { id: 'inv-paid', customerId: 'cus-paid', customerName: 'Paid', username: 'paid@ppp.test', period: '2000-01', amount: 100000, status: 'paid', paidAt: '2000-01-02', dueDate: '2000-01-01' },
    { id: 'inv-paid-current', customerId: 'cus-paid', customerName: 'Paid', username: 'paid@ppp.test', period: currentPeriod(), amount: 100000, status: 'paid', paidAt: `${currentPeriod()}-01`, dueDate: `${currentPeriod()}-10` }
  );

  const result = serverInternals.standaloneBillingAutomation(data, { name: 'Billing Test' });

  assert.equal(data.radiusUsers.find((user) => user.id === 'rad-late').status, 'isolated');
  assert.equal(data.customers.find((customer) => customer.id === 'cus-late').status, 'isolir');
  assert.equal(data.radiusUsers.find((user) => user.id === 'rad-paid').status, 'active');
  assert.equal(data.customers.find((customer) => customer.id === 'cus-paid').status, 'active');
  assert.equal(result.isolatedUsers.some((user) => user.id === 'rad-late'), true);
  assert.equal(result.activatedUsers.some((user) => user.id === 'rad-paid'), true);
});

test('terminating radius user keeps unpaid invoice pending and skips future invoice generation', () => {
  const data = createDefaultStore();
  data.settings.appMode = 'standalone';
  data.settings.billingSource = 'local';
  data.customers.push({
    id: 'cus-terminated-manual',
    source: 'radius',
    username: 'manual-terminated@ppp.test',
    name: 'Manual Terminated',
    status: 'active',
    price: 100000
  });
  const radiusUser = {
    id: 'rad-terminated-manual',
    serviceType: 'pppoe',
    username: 'manual-terminated@ppp.test',
    customerId: 'cus-terminated-manual',
    status: 'terminated',
    terminationSource: 'manual'
  };
  data.radiusUsers.push(radiusUser);
  data.invoices.push({
    id: 'inv-terminated-pending',
    customerId: 'cus-terminated-manual',
    customerName: 'Manual Terminated',
    username: 'manual-terminated@ppp.test',
    period: '2026-07',
    amount: 100000,
    status: 'pending',
    dueDate: '2026-07-10'
  });

  serverInternals.syncRadiusCustomerStatus(data, radiusUser);

  assert.equal(data.customers[0].status, 'terminate');
  assert.equal(data.customers[0].terminationSource, 'manual');
  assert.equal(data.invoices[0].status, 'pending');
  assert.equal(generateInvoices(data, '2026-08').length, 0);
});

test('monthly statistics combines new ppp installs, removed users, and paid vouchers by period', async () => {
  const data = createDefaultStore();
  const period = currentPeriod();
  const nextPeriod = addMonthsToPeriod(period, 1);
  data.radiusUsers.push({
    id: 'rad-stat-active',
    serviceType: 'pppoe',
    username: 'stat-active',
    status: 'active',
    createdAt: `${period}-03T08:00:00.000Z`
  });
  data.radiusRemovedRecords.push(
    {
      id: 'rad-stat-removed',
      key: 'rad-stat-removed',
      serviceType: 'pppoe',
      customerId: 'cus-stat-removed',
      username: 'stat-removed',
      installedAt: `${period}-02T08:00:00.000Z`,
      removedAt: `${period}-10T08:00:00.000Z`,
      status: 'removed'
    },
    {
      id: 'rad-stat-removed-next',
      key: 'rad-stat-removed-next',
      serviceType: 'pppoe',
      customerId: 'cus-stat-removed-next',
      username: 'stat-removed-next',
      installedAt: `${period}-04T08:00:00.000Z`,
      removedAt: `${nextPeriod}-01T08:00:00.000Z`,
      status: 'removed'
    }
  );
  data.hotspotVoucherOrders.push(
    {
      id: 'order-stat-paid',
      reference: 'VCH-001',
      status: 'paid',
      paidAt: `${period}-12T08:00:00.000Z`,
      amount: 6000,
      quantity: 2,
      paymentMethod: 'QRIS'
    },
    {
      id: 'order-stat-pending',
      reference: 'VCH-002',
      status: 'pending',
      createdAt: `${period}-12T09:00:00.000Z`,
      amount: 3000,
      quantity: 1
    }
  );

  const payload = await serverInternals.reportStatisticsPayload(data, period);

  assert.equal(payload.summary.newInstallCount, 3);
  assert.equal(payload.summary.removedCount, 1);
  assert.equal(payload.summary.netGrowth, 2);
  assert.equal(payload.summary.voucherBuyerCount, 1);
  assert.equal(payload.summary.voucherCount, 2);
  assert.equal(payload.summary.voucherAmount, 6000);
  assert.equal(payload.dailyRows.find((row) => row.date === `${period}-10`).removedCount, 1);
  assert.equal(payload.dailyRows.find((row) => row.date === `${nextPeriod}-01`), undefined);
  assert.equal(payload.monthlyRows.length, 12);
  assert.equal(payload.monthlyRows.find((row) => row.period === period).newInstallCount, 3);
  assert.equal(payload.monthlyRows.find((row) => row.period === period).removedCount, 1);
  assert.equal(payload.monthlyRows.find((row) => row.period === period).voucherBuyerCount, 1);
  assert.equal(payload.monthlyRows.find((row) => row.period === nextPeriod), undefined);
});

test('ensureShape restores invoices cancelled only because customer was terminated', () => {
  const data = ensureShape({
    settings: { businessName: 'Restore Test' },
    invoices: [
      {
        id: 'inv-restored',
        customerId: 'cus-restored',
        status: 'cancelled',
        notes: 'Dibatalkan otomatis karena pelanggan terminated.'
      },
      {
        id: 'inv-deleted-member',
        customerId: 'cus-deleted',
        status: 'cancelled',
        notes: 'Dibatalkan otomatis karena member dihapus bersama user Radius oleh Admin.'
      }
    ]
  });

  assert.equal(data.invoices.find((invoice) => invoice.id === 'inv-restored').status, 'pending');
  assert.equal(data.invoices.find((invoice) => invoice.id === 'inv-deleted-member').status, 'cancelled');
});

test('ensureShape syncs stale linked PPP members from radius profile without touching invoices', () => {
  const data = ensureShape({
    settings: {
      businessName: 'Linked Profile Sync',
      billing: {
        postpaidDueDay: 15
      }
    },
    radiusProfiles: [
      {
        id: 'prof-linked-180',
        serviceType: 'pppoe',
        name: 'Paket 180',
        price: 180000
      }
    ],
    radiusUsers: [
      {
        id: 'rad-linked-azizah',
        serviceType: 'pppoe',
        username: 'azizah',
        customerId: 'cus-linked-azizah',
        profileId: 'prof-linked-180'
      }
    ],
    customers: [
      {
        id: 'cus-linked-azizah',
        source: 'radius',
        username: 'azizah',
        name: 'Azizah',
        packageName: 'Paket Lama',
        price: 150000,
        amount: 150000,
        paymentType: 'postpaid',
        billingPeriod: 'cycle',
        dueDay: 16,
        dueDate: '2026-08-16',
        nextDue: '2026-08-16',
        activeDate: '2026-07-16',
        firstInvoiceStatus: 'paid',
        initialInvoiceStatus: 'paid',
        status: 'active'
      }
    ],
    invoices: [
      {
        id: 'inv-linked-azizah',
        customerId: 'cus-linked-azizah',
        invoiceNo: '000011',
        packageName: 'Paket Lama',
        amount: 150000,
        totalAmount: 150000,
        status: 'pending'
      }
    ]
  });

  const customer = data.customers.find((item) => item.id === 'cus-linked-azizah');
  assert.equal(customer.packageName, 'Paket 180');
  assert.equal(customer.price, 180000);
  assert.equal(customer.amount, 180000);
  assert.equal(customer.dueDay, 15);
  assert.equal(customer.dueDate, '2026-08-15');
  assert.equal(customer.nextDue, '2026-08-15');
  assert.equal(data.invoices[0].packageName, 'Paket Lama');
  assert.equal(data.invoices[0].amount, 150000);
});

test('ensureShape cancels invalid paid initial postpaid-cycle prorata invoices', () => {
  const data = ensureShape({
    settings: { businessName: 'Prorata Cleanup' },
    customers: [
      {
        id: 'cus-paid-cycle',
        username: 'paid-cycle@ppp.test',
        status: 'active',
        activeDate: '2026-07-15',
        paymentType: 'postpaid',
        billingPeriod: 'cycle',
        firstInvoiceStatus: 'paid',
        initialInvoiceStatus: 'paid'
      },
      {
        id: 'cus-unpaid-cycle',
        username: 'unpaid-cycle@ppp.test',
        status: 'active',
        activeDate: '2026-07-15',
        paymentType: 'postpaid',
        billingPeriod: 'cycle',
        firstInvoiceStatus: 'unpaid'
      }
    ],
    invoices: [
      {
        id: 'inv-paid-prorata',
        customerId: 'cus-paid-cycle',
        status: 'pending',
        source: 'generated',
        period: '2026-07',
        amount: 5000,
        prorated: true,
        notes: 'Prorata 1/30 hari'
      },
      {
        id: 'inv-unpaid-prorata',
        customerId: 'cus-unpaid-cycle',
        status: 'pending',
        source: 'generated',
        period: '2026-07',
        amount: 5000,
        prorated: true,
        notes: 'Prorata 1/30 hari'
      },
      {
        id: 'inv-paid-normal-next',
        customerId: 'cus-paid-cycle',
        status: 'pending',
        source: 'generated',
        period: '2026-08',
        amount: 150000,
        prorated: false,
        notes: ''
      }
    ]
  });

  const paidProrata = data.invoices.find((invoice) => invoice.id === 'inv-paid-prorata');
  assert.equal(paidProrata.status, 'cancelled');
  assert.match(paidProrata.cancelReason, /status invoice awal member Paid/i);
  assert.equal(data.invoices.find((invoice) => invoice.id === 'inv-unpaid-prorata').status, 'pending');
  assert.equal(data.invoices.find((invoice) => invoice.id === 'inv-paid-normal-next').status, 'pending');
});

test('standalone billing automation ignores pending invoice covered by paid multi-month invoice', () => {
  const data = createDefaultStore();
  data.settings.appMode = 'standalone';
  data.settings.billingSource = 'local';
  data.settings.billing.suspendGraceDays = 1;
  data.settings.billing.autoSuspendTime = '00:00';
  const period = currentPeriod();
  const nextPeriod = addMonthsToPeriod(period, 1);
  data.customers.push({
    id: 'cus-covered',
    source: 'radius',
    username: 'covered@ppp.test',
    name: 'Covered',
    status: 'active',
    price: 100000
  });
  data.radiusUsers.push({
    id: 'rad-covered',
    serviceType: 'pppoe',
    username: 'covered@ppp.test',
    customerId: 'cus-covered',
    status: 'active'
  });
  data.invoices.push(
    {
      id: 'inv-covered-paid',
      customerId: 'cus-covered',
      customerName: 'Covered',
      username: 'covered@ppp.test',
      period,
      coveredPeriods: [period, nextPeriod],
      subPeriodMonths: 2,
      amount: 200000,
      status: 'paid',
      paidAt: `${period}-01`,
      dueDate: `${period}-10`
    },
    {
      id: 'inv-covered-pending-duplicate',
      customerId: 'cus-covered',
      customerName: 'Covered',
      username: 'covered@ppp.test',
      period,
      amount: 100000,
      status: 'pending',
      dueDate: '2000-01-01'
    }
  );

  const result = serverInternals.standaloneBillingAutomation(data, { name: 'Billing Test' });

  assert.equal(data.radiusUsers.find((user) => user.id === 'rad-covered').status, 'active');
  assert.equal(data.customers.find((customer) => customer.id === 'cus-covered').status, 'active');
  assert.equal(result.isolatedUsers.some((user) => user.id === 'rad-covered'), false);
});

test('standalone billing automation queues payment reminder once before due date', () => {
  const data = createDefaultStore();
  data.settings.appMode = 'standalone';
  data.settings.billingSource = 'local';
  data.settings.billing.notificationBeforeDueDays = 1;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const today = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dueDate = `${today.year}-${today.month}-${today.day}`;
  data.customers.push({
    id: 'cus-reminder',
    source: 'radius',
    username: 'reminder@ppp.test',
    name: 'Reminder Test',
    status: 'active',
    phone: '081234567890',
    price: 100000
  });
  data.invoices.push({
    id: 'inv-reminder',
    customerId: 'cus-reminder',
    customerName: 'Reminder Test',
    username: 'reminder@ppp.test',
    period: currentPeriod(),
    amount: 100000,
    status: 'pending',
    dueDate,
    externalId: '000123',
    invoiceNo: '000123'
  });

  const first = serverInternals.standaloneBillingAutomation(data, { name: 'Billing Test' });
  const second = serverInternals.standaloneBillingAutomation(data, { name: 'Billing Test' });

  assert.equal(first.reminderInvoices.length, 1);
  assert.equal(second.reminderInvoices.length, 0);
  assert.equal(data.waMessages.filter((message) => message.type === 'paymentReminder').length, 1);
  assert.equal(data.invoices[0].paymentReminderDueDate, dueDate);
});

test('billing settings allow H-1 invoice generation and disabled reminders', () => {
  const sanitized = serverInternals.sanitizeBillingSettings({
    postpaidDueDay: 10,
    fixedInvoiceAdvanceDays: 1,
    notificationBeforeDueDays: 0
  }, {});

  assert.equal(sanitized.fixedInvoiceAdvanceDays, 1);
  assert.equal(sanitized.notificationBeforeDueDays, 0);
  assert.equal(serverInternals.invoiceGenerationDue(sanitized, '2026-08', '2026-08-08'), false);
  assert.equal(serverInternals.invoiceGenerationDue(sanitized, '2026-08', '2026-08-09'), true);
  assert.equal(serverInternals.invoiceGenerationDue({ ...sanitized, fixedInvoiceAdvanceDays: 0 }, '2026-08', '2026-08-09'), false);
  assert.equal(serverInternals.invoiceGenerationDue({ ...sanitized, fixedInvoiceAdvanceDays: 0 }, '2026-08', '2026-08-10'), true);

  const data = createDefaultStore();
  data.settings.appMode = 'standalone';
  data.settings.billingSource = 'local';
  data.settings.billing.notificationBeforeDueDays = 0;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const today = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dueDate = `${today.year}-${today.month}-${today.day}`;
  data.customers.push({
    id: 'cus-reminder-disabled',
    source: 'radius',
    username: 'reminder-disabled@ppp.test',
    name: 'Reminder Disabled',
    status: 'active',
    phone: '081234567890',
    price: 100000
  });
  data.invoices.push({
    id: 'inv-reminder-disabled',
    customerId: 'cus-reminder-disabled',
    customerName: 'Reminder Disabled',
    username: 'reminder-disabled@ppp.test',
    period: currentPeriod(),
    amount: 100000,
    status: 'pending',
    dueDate,
    externalId: '000124',
    invoiceNo: '000124'
  });

  const result = serverInternals.standaloneBillingAutomation(data, { name: 'Billing Test' });

  assert.equal(result.reminderInvoices.length, 0);
  assert.equal(data.waMessages.filter((message) => message.type === 'paymentReminder').length, 0);
});

test('invoice whatsapp templates use suspend grace from billing setting', () => {
  const shaped = ensureShape({
    settings: {
      waGateway: {
        templates: {
          paymentReminder: 'Jika belum bayar setelah *H+5 (5 hari)* dari tempo.'
        }
      }
    }
  });
  const data = createDefaultStore();
  data.settings.billing.suspendGraceDays = 3;
  data.settings.businessName = 'FAKE.NET';
  data.customers.push({
    id: 'cus-wa-template',
    source: 'radius',
    username: 'wa-template@ppp.test',
    name: 'WA Template',
    phone: '081234567890',
    price: 100000
  });
  const invoice = {
    id: 'inv-wa-template',
    customerId: 'cus-wa-template',
    customerName: 'WA Template',
    username: 'wa-template@ppp.test',
    period: '2026-07',
    amount: 100000,
    total: 100000,
    status: 'pending',
    dueDate: '2026-07-10',
    invoiceNo: '000125'
  };

  const values = serverInternals.invoiceWaTemplateValues(data, invoice);

  assert.equal(values.suspend_grace, 'H+3 (3 hari)');
  assert.equal(values.suspend_grace_days, '3');
  assert.equal(
    shaped.settings.waGateway.templates.paymentReminder,
    'Jika belum bayar setelah *H+[suspend_grace_days] ([suspend_grace_days] hari)* dari tempo.'
  );
  assert.equal(
    serverInternals.renderWaTemplate('Batas *H+[suspend_grace_days] ([suspend_grace_days] hari)*', values),
    'Batas *H+3 (3 hari)*'
  );
  assert.equal(
    serverInternals.renderWaTemplate('Batas *[suspend_grace]* / [suspend_grace_days]', values),
    'Batas *H+3 (3 hari)* / 3'
  );
  assert.equal(
    serverInternals.renderWaTemplate('Jika belum bayar setelah *H+5 (5 hari)* dari tempo.', values),
    'Jika belum bayar setelah *H+3 (3 hari)* dari tempo.'
  );
});

test('standalone automation generates fixed-date invoices only inside each member window', () => {
  const settings = {
    postpaidDueDay: 10,
    fixedInvoiceAdvanceDays: 7
  };
  const fixedCustomer = {
    paymentType: 'postpaid',
    billingPeriod: 'fixed',
    dueDay: 20
  };
  const cycleCustomer = {
    paymentType: 'postpaid',
    billingPeriod: 'cycle',
    dueDay: 20
  };

  assert.equal(serverInternals.customerInvoiceGenerationDue(settings, fixedCustomer, '2026-08', '2026-08-12'), false);
  assert.equal(serverInternals.customerInvoiceGenerationDue(settings, fixedCustomer, '2026-08', '2026-08-13'), true);
  assert.equal(serverInternals.customerInvoiceGenerationDue(settings, cycleCustomer, '2026-08', '2026-08-02'), false);
  assert.equal(serverInternals.customerInvoiceGenerationDue(settings, cycleCustomer, '2026-08', '2026-08-03'), true);
  assert.equal(serverInternals.customerInvoiceGenerationDue(settings, {
    paymentType: 'postpaid',
    billingPeriod: 'cycle',
    activeDate: '2026-08-05'
  }, '2026-08', '2026-08-03'), false);
  assert.equal(serverInternals.customerInvoiceGenerationDue(settings, {
    paymentType: 'postpaid',
    billingPeriod: 'cycle',
    activeDate: '2026-08-05'
  }, '2026-08', '2026-08-05'), true);
});

test('expired hotspot voucher remove-record keeps terminated record', () => {
  const data = createDefaultStore();
  data.radiusProfiles.push({ id: 'profile-voucher', serviceType: 'hotspot', name: 'Voucher 1D', expiredMode: 'remove-record' });
  data.radiusUsers.push({
    id: 'voucher-expired',
    serviceType: 'hotspot',
    username: 'voucher-expired',
    profileId: 'profile-voucher',
    status: 'active',
    validUntil: '2000-01-01T00:00:00.000Z'
  });

  const result = serverInternals.applyHotspotVoucherExpirations(data, { name: 'Billing Test' });
  const user = data.radiusUsers.find((item) => item.id === 'voucher-expired');
  const record = data.radiusVoucherRecords.find((item) => item.id === 'voucher-expired');

  assert.equal(result.updated.length, 1);
  assert.equal(result.removed.length, 0);
  assert.equal(user, undefined);
  assert.equal(record.status, 'terminated');
  assert.ok(record.terminatedAt);
  assert.ok(record.archivedAt);
});

test('expired hotspot voucher remove deletes user without archive', () => {
  const data = createDefaultStore();
  data.radiusProfiles.push({ id: 'profile-voucher-remove', serviceType: 'hotspot', name: 'Voucher Remove', expiredMode: 'remove' });
  data.radiusUsers.push({
    id: 'voucher-remove',
    serviceType: 'hotspot',
    username: 'voucher-remove',
    profileId: 'profile-voucher-remove',
    status: 'active',
    validUntil: '2000-01-01T00:00:00.000Z'
  });

  const result = serverInternals.applyHotspotVoucherExpirations(data, { name: 'Billing Test' });

  assert.equal(result.removed.length, 1);
  assert.equal(result.updated.length, 0);
  assert.equal(data.radiusUsers.some((item) => item.id === 'voucher-remove'), false);
  assert.equal((data.radiusVoucherRecords || []).some((item) => item.id === 'voucher-remove'), false);
});

test('expired hotspot voucher notice modes keep user as terminated', () => {
  for (const mode of ['notice', 'notice-record']) {
    const data = createDefaultStore();
    data.radiusProfiles.push({ id: `profile-voucher-${mode}`, serviceType: 'hotspot', name: `Voucher ${mode}`, expiredMode: mode });
    data.radiusUsers.push({
      id: `voucher-${mode}`,
      serviceType: 'hotspot',
      username: `voucher-${mode}`,
      profileId: `profile-voucher-${mode}`,
      status: 'active',
      validUntil: '2000-01-01T00:00:00.000Z'
    });

    const result = serverInternals.applyHotspotVoucherExpirations(data, { name: 'Billing Test' });
    const user = data.radiusUsers.find((item) => item.id === `voucher-${mode}`);

    assert.equal(result.removed.length, 0);
    assert.equal(result.updated.length, 1);
    assert.equal(user.status, 'terminated');
    assert.equal(user.voucherRecordMode, mode);
    assert.ok(user.terminatedAt);
    assert.equal((data.radiusVoucherRecords || []).some((item) => item.id === `voucher-${mode}`), false);
  }
});

test('hotspot voucher validity is stamped from first online before expiration', () => {
  const data = createDefaultStore();
  data.radiusProfiles.push({
    id: 'profile-voucher-first-online',
    serviceType: 'hotspot',
    name: 'Voucher 1H',
    validity: '1h',
    validitySeconds: 3600,
    expiredMode: 'remove-record'
  });
  data.radiusUsers.push({
    id: 'voucher-first-online',
    serviceType: 'hotspot',
    username: '3000',
    password: '3000',
    profileId: 'profile-voucher-first-online',
    status: 'active',
    validUntil: ''
  });

  const stamped = serverInternals.stampHotspotVoucherValidityFromFirstOnline(data, new Map([
    ['3000', '2000-01-01T00:00:00.000Z']
  ]), { name: 'Billing Test' });
  const result = serverInternals.applyHotspotVoucherExpirations(data, { name: 'Billing Test' });
  const user = data.radiusUsers.find((item) => item.id === 'voucher-first-online');
  const record = data.radiusVoucherRecords.find((item) => item.id === 'voucher-first-online');

  assert.equal(stamped.length, 1);
  assert.equal(record.validUntil, '2000-01-01T01:00:00.000Z');
  assert.equal(record.voucherFirstOnlineAt, '2000-01-01T00:00:00.000Z');
  assert.equal(result.updated.length, 1);
  assert.equal(user, undefined);
  assert.equal(record.status, 'terminated');
});

test('summary separates paid, pending, overdue, and expenses', () => {
  const data = createDefaultStore();
  data.invoices.push(
    { id: '1', period: '2026-06', amount: 100000, status: 'paid', dueDate: '2026-06-10' },
    { id: '2', period: '2026-06', amount: 150000, status: 'pending', dueDate: '2026-06-10' },
    { id: '3', period: '2026-06', amount: 200000, status: 'pending', dueDate: '2026-06-01' }
  );
  data.expenses.push({ id: '1', date: '2026-06-05', amount: 25000 });

  const result = summarize(data, '2026-06');

  assert.equal(result.paidRevenue, 100000);
  assert.equal(result.expenseTotal, 25000);
  assert.equal(result.netCash, 75000);
  assert.equal(result.overdueRevenue >= 0, true);
});

test('summary includes Radboox monthly earning', () => {
  const data = createDefaultStore();
  data.settings.appMode = 'ops';
  data.settings.billingSource = 'radboox';
  upsertMonthlyEarning(data, {
    source: 'radboox',
    period: '2026-06',
    amount: 4500000,
    transactionCount: 40
  });
  data.expenses.push({ id: '1', date: '2026-06-05', amount: 500000 });

  const result = summarize(data, '2026-06');

  assert.equal(result.radbooxRevenue, 4500000);
  assert.equal(result.paidRevenue, 4500000);
  assert.equal(result.netCash, 4000000);
});

test('empty Radboox sync does not overwrite existing monthly earning', () => {
  const data = createDefaultStore();
  data.settings.appMode = 'ops';
  data.settings.billingSource = 'radboox';
  upsertMonthlyEarning(data, {
    source: 'radboox',
    period: '2026-06',
    amount: 4500000,
    transactionCount: 40
  });

  const result = upsertMonthlyEarning(data, {
    source: 'radboox',
    period: '2026-06',
    amount: 0,
    transactionCount: 0,
    note: 'Radboox monthly report returned no income amount',
    raw: {
      jumlahPemasukanTunai: 'Rp 0',
      jumlahPemasukanTransfer: 'Rp 0',
      jumlahTotalPemasukan: 'Rp 0'
    }
  });

  assert.equal(result.amount, 4500000);
  assert.match(result.syncWarning, /laporan kosong/);
  assert.equal(summarize(data, '2026-06').radbooxRevenue, 4500000);
});

test('standalone summary ignores remote monthly earning source', () => {
  const data = createDefaultStore();
  data.settings.appMode = 'standalone';
  data.settings.billingSource = 'local';
  upsertMonthlyEarning(data, {
    source: 'radboox',
    period: '2026-06',
    amount: 4500000,
    transactionCount: 40
  });

  const result = summarize(data, '2026-06');

  assert.equal(result.radbooxRevenue, 0);
  assert.equal(result.paidRevenue, 0);
});

test('updates and deletes expenses', () => {
  const data = createDefaultStore();
  data.expenses.push({
    id: 'exp_1',
    date: '2026-06-05',
    category: 'Listrik',
    vendor: 'PLN',
    description: 'Token',
    amount: 250000,
    paymentMethod: 'Transfer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const updated = updateExpense(data, 'exp_1', {
    date: '2026-06-06',
    category: 'Bandwidth',
    payee: 'Upstream',
    description: 'Bulanan',
    amount: 1000000,
    paymentMethod: 'Transfer'
  });

  assert.equal(updated.payee, 'Upstream');
  assert.equal(updated.vendor, 'Upstream');
  assert.equal(updated.amount, 1000000);
  assert.equal(summarize(data, '2026-06').expenseTotal, 1000000);

  const deleted = deleteExpense(data, 'exp_1');

  assert.equal(deleted.id, 'exp_1');
  assert.equal(summarize(data, '2026-06').expenseTotal, 0);
});

test('external incomes are included in net cash and can be managed', () => {
  const data = createDefaultStore();
  const income = addExternalIncome(data, {
    date: '2026-06-12',
    category: 'Barang/Jasa',
    payerName: 'PT Contoh',
    itemName: 'Jasa instalasi jaringan',
    amount: 750000,
    paymentMethod: 'Transfer'
  });

  assert.equal(summarize(data, '2026-06').externalIncomeTotal, 750000);
  assert.equal(summarize(data, '2026-06').netCash, 750000);
  assert.equal(income.receiptNo, '001/INV-FAKE.NET/VI/2026');

  const updated = updateExternalIncome(data, income.id, {
    date: '2026-06-13',
    category: 'Perangkat',
    payerName: 'PT Contoh',
    itemName: 'Router',
    amount: 900000,
    paymentMethod: 'Tunai'
  });

  assert.equal(updated.amount, 900000);
  assert.equal(updated.receiptNo, '001/INV-FAKE.NET/VI/2026');
  assert.equal(summarize(data, '2026-06').externalIncomeTotal, 900000);

  const deleted = deleteExternalIncome(data, income.id);

  assert.equal(deleted.id, income.id);
  assert.equal(deleted.status, 'cancelled');
  assert.equal(summarize(data, '2026-06').externalIncomeTotal, 0);

  const nextIncome = addExternalIncome(data, {
    date: '2026-06-14',
    category: 'Barang/Jasa',
    payerName: 'PT Lanjut',
    itemName: 'Jasa survey',
    amount: 500000,
    paymentMethod: 'Tunai'
  });

  assert.equal(nextIncome.receiptNo, '002/INV-FAKE.NET/VI/2026');
  assert.equal(summarize(data, '2026-06').externalIncomeTotal, 500000);

  const julyIncome = addExternalIncome(data, {
    date: '2026-07-01',
    category: 'Barang/Jasa',
    payerName: 'PT Bulan Baru',
    itemName: 'Jasa aktivasi',
    amount: 600000,
    paymentMethod: 'Transfer'
  });

  assert.equal(julyIncome.receiptNo, '001/INV-FAKE.NET/VII/2026');
  assert.equal(summarize(data, '2026-07').externalIncomeTotal, 600000);
});

test('external income receipt uses configured business code while billing invoice format stays fixed', () => {
  const data = createDefaultStore();
  data.settings.receiptBusinessCode = 'KAMPUNG.NET';
  data.settings.billing.invoiceNumberFormat = '001/INV-KAMPUNG/{ROMAN}/{YEAR}';

  const income = addExternalIncome(data, {
    date: '2026-06-18',
    category: 'Barang/Jasa',
    payerName: 'Pelanggan',
    itemName: 'Router',
    amount: 350000,
    paymentMethod: 'Tunai'
  });
  data.customers.push({
    id: 'cus-format-1',
    username: 'format@kampung.net',
    name: 'Format Test',
    status: 'active',
    price: 100000
  });
  const invoice = generateInvoices(data, '2026-06')[0];

  assert.equal(income.receiptNo, '001/INV-KAMPUNG.NET/VI/2026');
  assert.equal(invoice.invoiceNo, '000001');
});

test('external income PPN is optional and adds to total only when enabled', () => {
  const data = createDefaultStore();
  const withoutPpn = addExternalIncome(data, {
    date: '2026-06-15',
    category: 'Barang/Jasa',
    payerName: 'PT Tanpa PPN',
    itemName: 'Jasa konfigurasi',
    amount: 100000,
    taxEnabled: false,
    taxRate: 11
  });
  const withPpn = addExternalIncome(data, {
    date: '2026-06-15',
    category: 'Barang/Jasa',
    payerName: 'PT PPN',
    itemName: 'Jasa instalasi',
    amount: 100000,
    taxEnabled: true,
    taxRate: 11
  });

  assert.equal(withoutPpn.subtotal, 100000);
  assert.equal(withoutPpn.taxAmount, 0);
  assert.equal(withoutPpn.amount, 100000);
  assert.equal(withPpn.subtotal, 100000);
  assert.equal(withPpn.taxAmount, 11000);
  assert.equal(withPpn.amount, 111000);
  assert.equal(summarize(data, '2026-06').externalIncomeTotal, 211000);
});

test('external income can contain multiple sales items under one receipt', () => {
  const data = createDefaultStore();
  const income = addExternalIncome(data, {
    date: '2026-06-16',
    category: 'Barang/Jasa',
    payerName: 'PT Pembeli',
    paymentMethod: 'Transfer',
    description: 'Pembelian perangkat dan jasa',
    taxEnabled: true,
    taxRate: 11,
    items: [
      { category: 'Perangkat', itemName: 'Router', quantity: 2, unitPrice: 500000 },
      { category: 'Barang/Jasa', itemName: 'Jasa setting', quantity: 1, unitPrice: 250000 }
    ]
  });

  assert.equal(data.externalIncomes.length, 1);
  assert.equal(income.receiptNo, '001/INV-FAKE.NET/VI/2026');
  assert.equal(income.category, '2 kategori: Perangkat, Barang/Jasa');
  assert.equal(income.items.length, 2);
  assert.equal(income.items[0].category, 'Perangkat');
  assert.equal(income.items[1].category, 'Barang/Jasa');
  assert.equal(income.items[0].quantity, 2);
  assert.equal(income.items[0].unitPrice, 500000);
  assert.equal(income.items[0].amount, 1000000);
  assert.equal(income.subtotal, 1250000);
  assert.equal(income.taxAmount, 137500);
  assert.equal(income.amount, 1387500);
  assert.equal(summarize(data, '2026-06').externalIncomeTotal, 1387500);
});

test('external income stores receipt creator for signer', () => {
  const data = createDefaultStore();
  const income = addExternalIncome(data, {
    date: '2026-06-17',
    category: 'Barang/Jasa',
    payerName: 'PT Pembeli',
    itemName: 'Jasa setting',
    amount: 250000,
    createdByName: 'Billing Admin',
    createdByUsername: 'admin'
  });

  assert.equal(income.createdByName, 'Billing Admin');
  assert.equal(income.createdByUsername, 'admin');

  const updated = updateExternalIncome(data, income.id, {
    date: '2026-06-17',
    payerName: 'PT Pembeli',
    itemName: 'Jasa setting ulang',
    amount: 300000,
    updatedByName: 'Operator'
  });

  assert.equal(updated.createdByName, 'Billing Admin');
  assert.equal(updated.updatedByName, 'Operator');
});

test('expense category Teknisi is normalized to Gaji without PPN', () => {
  const data = createDefaultStore();
  const expense = addExpense(data, {
    date: '2026-06-15',
    category: 'Teknisi',
    payee: 'Tim Lapangan',
    description: 'Honor bulanan',
    amount: 1000000,
    taxEnabled: true,
    taxRate: 11,
    paymentMethod: 'Transfer'
  });

  assert.equal(expense.category, 'Gaji');
  assert.equal(expense.payee, 'Tim Lapangan');
  assert.equal(expense.vendor, 'Tim Lapangan');
  assert.equal(expense.subtotal, 1000000);
  assert.equal(expense.taxAmount, 0);
  assert.equal(expense.amount, 1000000);
});

test('expense can contain multiple transaction items without PPN', () => {
  const data = createDefaultStore();
  const expense = addExpense(data, {
    date: '2026-06-16',
    payee: 'Toko Jaringan',
    noteNo: 'NT-001',
    paymentMethod: 'Transfer',
    description: 'Belanja perangkat dan tools',
    taxEnabled: true,
    taxRate: 11,
    items: [
      { category: 'Perangkat', itemName: 'Router', quantity: 2, unitPrice: 250000 },
      { category: 'Operasional', itemName: 'Ongkir', quantity: 1, unitPrice: 30000 }
    ]
  });

  assert.equal(data.expenses.length, 1);
  assert.equal(expense.category, '2 kategori: Perangkat, Operasional');
  assert.equal(expense.payee, 'Toko Jaringan');
  assert.equal(expense.noteNo, 'NT-001');
  assert.equal(expense.items.length, 2);
  assert.equal(expense.items[0].amount, 500000);
  assert.equal(expense.subtotal, 530000);
  assert.equal(expense.taxAmount, 0);
  assert.equal(expense.amount, 530000);
  assert.equal(summarize(data, '2026-06').expenseTotal, 530000);
});

test('invoice runtime status marks late unpaid invoice as overdue', () => {
  assert.equal(invoiceRuntimeStatus({
    status: 'pending',
    dueDate: '2026-06-01'
  }, '2026-06-20'), 'overdue');
});

test('radboox normalizers accept common API field names', () => {
  const customer = normalizeCustomer({
    id: 15,
    username: 'ana@kampung.net',
    full_name: 'Ana',
    profile: 'PAKET A BASIC 10 Mb',
    whatsapp: '0812',
    status: 'aktif'
  });
  const invoice = normalizeInvoice({
    invoice_id: 'INV-1',
    username: 'ana@kampung.net',
    total: 'Rp 100.000',
    due_date: '2026-06-10',
    status: 'lunas'
  });

  assert.equal(customer.externalId, '15');
  assert.equal(customer.status, 'active');
  assert.equal(invoice.amount, 100000);
  assert.equal(invoice.status, 'paid');
});

test('radboox billing invoice normalizer detects isolated customers', () => {
  const invoice = normalizeBillingInvoice({
    id: 5512,
    uuid: 'abc',
    no_invoice: 'INV-1',
    acc_id: 'UID-1',
    full_name: 'Ana',
    item: 'Internet bulanan ana@kampung.net paket silver',
    total: 'Rp 125.000',
    due_date: '2026-07-10',
    status: 'unpaid',
    member_status: 'suspend',
    wa: '0812'
  });

  assert.equal(invoice.invoiceNo, 'INV-1');
  assert.equal(invoice.radbooxInvoiceId, '5512');
  assert.equal(invoice.reminderId, '5512');
  assert.equal(invoice.amount, 125000);
  assert.equal(invoice.username, 'ana@kampung.net');
  assert.equal(invoice.status, 'unpaid');
  assert.equal(invoice.serviceStatus, 'suspend');
  assert.equal(invoice.isIsolated, true);
});

test('radboox invoice reminder posts to invoice reminder endpoint', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ status: 'success', message: 'Reminder sent' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await sendInvoiceReminder({
      radboox: {
        mode: 'api',
        apiBaseUrl: 'https://ssr.radboox.test',
        token: 'token-1'
      }
    }, {
      invoiceId: '5512'
    });

    assert.equal(result.ok, true);
    assert.equal(result.invoiceId, '5512');
    assert.equal(result.message, 'Reminder sent');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://ssr.radboox.test/api-v1/billing/invoice/reminder/5512');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer token-1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox action credentials are encrypted and hidden from public payloads', () => {
  const data = createDefaultStore();
  data.settings.appMode = 'ops';
  data.settings.billingSource = 'radboox';
  const user = createUser(data, {
    username: 'irfan',
    name: 'Irfan',
    password: 'secret12',
    role: 'finance',
    radbooxUsername: 'irfansyahranie31',
    radbooxPassword: 'testpass10'
  });
  data.settings.radboox.actionPasswordEnc = encryptSecret(data, 'default-pass');

  assert.equal(user.radbooxUsername, 'irfansyahranie31');
  assert.equal(user.hasRadbooxPassword, true);
  assert.equal(user.radbooxPasswordEnc, undefined);
  assert.notEqual(data.users[0].radbooxPasswordEnc, 'testpass10');

  const credentials = radbooxCredentialsForUser(data, data.users[0]);
  assert.equal(credentials.username, 'irfansyahranie31');
  assert.equal(credentials.password, 'testpass10');

  const settings = publicSettings(data.settings);
  assert.equal(settings.radboox.hasActionPassword, true);
  assert.equal(settings.radboox.actionPasswordEnc, undefined);
  assert.deepEqual(settings.security, { loginVerificationEnabled: true });
  assert.equal(settings.security.secretKey, undefined);
});

test('xendit transactions normalize amount, fee, settlement, and customer context', () => {
  const transaction = normalizeXenditTransaction({
    status: 'Success',
    type: 'Payment',
    payment_method: 'Virtual Account',
    channel: 'Bri-9200154324844811',
    amount: 'Rp 205,000',
    referensi: '009767',
    date: '08:16:16 08/07/2026',
    id: 'txn_1',
    settle: 'SETTLED',
    obj: {
      type: 'PAYMENT',
      status: 'SUCCESS',
      channel_category: 'VIRTUAL_ACCOUNT',
      channel_code: 'BRI',
      reference_id: '009767',
      amount: 205000,
      net_amount: 201115,
      cashflow: 'MONEY_IN',
      settlement_status: 'SETTLED',
      payment_date: '2026-07-08T01:16:16.000Z',
      account_name: 'RBX Mamaalfin',
      fee: {
        xendit_fee: 3500,
        value_added_tax: 385,
        status: 'COMPLETED'
      }
    }
  });
  const report = normalizeXenPlatformReport({
    id: 20083,
    status: 'Paid',
    periode: 'Mei 2026',
    volume_trx: 'Rp 63,210,000',
    jumlah_trx: 322,
    jumlah_fee: 'Rp 766,108',
    invoice: 'https://www.radboox.com/info/xenplatform/report?token=',
    faktur: '-'
  });
  const balanceMovement = normalizeXenditBalanceMovement({
    tanggal: '08:16:16 08/07/2026',
    tipe: 'PAYMENT',
    channel: 'BRI',
    deskripsi: '009767',
    jumlah: 'Rp 205,000',
    balance: 'Rp 2,226,007'
  });
  const pendingMovement = normalizeXenditPendingMovement({
    tanggal: '08:16:16 08/07/2026',
    settle: '09:16:16 08/07/2026',
    tipe: 'PAYMENT',
    channel: 'BRI',
    deskripsi: '009767',
    jumlah: 'Rp 205,000',
    fee: 'Rp 3,885',
    net: 'Rp 201,115'
  });

  assert.equal(transaction.amount, 205000);
  assert.equal(transaction.netAmount, 201115);
  assert.equal(transaction.fee, 3885);
  assert.equal(transaction.reference, '009767');
  assert.equal(transaction.customerName, 'RBX Mamaalfin');
  assert.equal(transaction.paymentMethod, 'VIRTUAL_ACCOUNT');
  assert.equal(transaction.settlementRaw, 'SETTLED');
  assert.equal(transaction.moneyIn, true);
  assert.equal(transaction.moneyOut, false);
  assert.equal(transaction.date, '2026-07-08T01:16:16.000Z');

  assert.equal(report.period, 'Mei 2026');
  assert.equal(report.volumeAmount, 63210000);
  assert.equal(report.transactionCount, 322);
  assert.equal(report.feeAmount, 766108);
  assert.equal(report.hasInvoice, true);
  assert.equal(report.hasTaxInvoice, false);

  assert.equal(balanceMovement.amount, 205000);
  assert.equal(balanceMovement.balance, 2226007);
  assert.equal(balanceMovement.reference, '009767');
  assert.equal(pendingMovement.amount, 205000);
  assert.equal(pendingMovement.fee, 3885);
  assert.equal(pendingMovement.netAmount, 201115);
});

test('xendit transactions attach and search cashier transaction description', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const parsed = new URL(href);
    calls.push(href);

    if (href.includes('/auth/web/login') || href.endsWith('/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'xendit-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=xendit' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'xendit-token-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/data')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: { id: 'acct-search', status: 'LIVE', tipe: 'OWNED', bank: [] }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/xp-balance/acct-search')) {
      return new Response(JSON.stringify({ status: 'success', message: 'Rp 200,000' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/transaction/data')) {
      const search = parsed.searchParams.get('search') || '';
      const rows = ['', 'rizky'].includes(search) ? [{
        id: 'trx-radboox-1',
        no_invoice: '009778',
        item: 'Invoice',
        description: 'Pembayaran internet Rizky #009778',
        price: 'Rp 150.000',
        date_submit: '08:11:00 08/07/2026',
        payment_method: 'Transfer',
        admin: 'Wahyudi'
      }] : [];
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          total_rows: rows.length,
          data: rows
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/xp-transactions/acct-search')) {
      const search = parsed.searchParams.get('search') || '';
      const rows = search === 'rizky' ? [] : [{
        id: 'xen-1',
        status: 'Success',
        type: 'Payment',
        payment_method: 'Virtual Account',
        channel: 'BRI',
        amount: 'Rp 150.000',
        referensi: '009778',
        date: '08:11:00 08/07/2026',
        settle: 'SETTLED',
        obj: {
          id: 'xen-1',
          type: 'PAYMENT',
          status: 'SUCCESS',
          channel_category: 'VIRTUAL_ACCOUNT',
          channel_code: 'BRI',
          reference_id: '009778',
          amount: 150000,
          cashflow: 'MONEY_IN',
          settlement_status: 'SETTLED',
          description: 'VA 009778'
        }
      }];
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          nextpage: false,
          data: rows
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ status: 'error', message: '' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await xenditGatewayStatus({
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox-xendit.test',
        apiBaseUrl: 'https://ssr.radboox-xendit.test',
        username: 'user',
        password: 'pass',
        loginPath: '/auth/web/login'
      }
    }, {
      tab: 'transactions',
      from: '2026-07-01',
      to: '2026-07-08',
      search: 'rizky',
      forceSession: true,
      cache: false
    });

    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].reference, '009778');
    assert.equal(result.transactions[0].radbooxDescription, 'Pembayaran internet Rizky #009778');
    assert.ok(calls.some((href) => href.includes('/api-v1/pg/xendit/xp-transactions/acct-search') && href.includes('search=009778')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('xendit read-only status does not fetch or return account balance', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push(href);

    if (href.includes('/auth/web/login') || href.endsWith('/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'xendit-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=xendit-readonly' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'xendit-token-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/data')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          id: 'acct-readonly',
          status: 'LIVE',
          tipe: 'OWNED',
          bank: [{ index: 0, bank: 'BRI', name: 'Owner', number: '1234567890' }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/xp-balance/acct-readonly')) {
      throw new Error('read-only xendit status must not fetch balance');
    }
    if (href.includes('/api-v1/billing/transaction/data')) {
      return new Response(JSON.stringify({ status: 'success', message: { total_rows: 0, data: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/xp-transactions/acct-readonly')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          nextpage: false,
          data: [{
            id: 'xen-readonly-1',
            referensi: '009779',
            amount: 'Rp 100.000',
            obj: {
              id: 'xen-readonly-1',
              type: 'PAYMENT',
              status: 'SUCCESS',
              reference_id: '009779',
              amount: 100000,
              cashflow: 'MONEY_IN',
              settlement_status: 'SETTLED'
            }
          }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ status: 'error', message: '' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await xenditGatewayStatus({
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox-xendit-readonly.test',
        apiBaseUrl: 'https://ssr.radboox-xendit-readonly.test',
        username: 'user',
        password: 'pass',
        loginPath: '/auth/web/login'
      }
    }, {
      tab: 'transactions',
      from: '2026-07-01',
      to: '2026-07-08',
      includeBalance: false,
      forceSession: true,
      cache: false
    });

    assert.equal(result.canViewBalance, false);
    assert.equal(result.account, null);
    assert.equal(result.balance, null);
    assert.equal(result.transactions.length, 1);
    assert.equal(calls.some((href) => href.includes('/api-v1/pg/xendit/xp-balance/acct-readonly')), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('xendit withdraw flow requests otp and verifies with masked account only', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ href, method: options.method || 'GET', body, headers: options.headers || {} });

    if (href.includes('/auth/web/login') || href.endsWith('/login')) {
      assert.deepEqual(body, { username: 'fakenet', password: 'secret' });
      return new Response(JSON.stringify({ status: 'success', message: { token: 'login-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=session' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'fresh-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/data')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          id: 'acct-1',
          status: 'LIVE',
          tipe: 'OWNED',
          bank: [
            { index: 0, bank: 'MANDIRI', name: 'Owner', number: '1234567890' }
          ]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/xp-balance/acct-1')) {
      return new Response(JSON.stringify({ status: 'success', message: 'Rp 100,000' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/xp-withdraw/acct-1')) {
      assert.deepEqual(body, {
        pin: '123456',
        amount: '50000',
        bankIndex: 0,
        number: '1234567890'
      });
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          amount: 'Rp 50,000',
          number: '1234567890',
          name: 'Owner',
          bank: 'MANDIRI',
          sign: 'sign-1'
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/verify-xp-withdraw/acct-1')) {
      assert.deepEqual(body, { otp: '654321', sign: 'sign-1' });
      return new Response(JSON.stringify({ status: 'success', message: { message: 'Withdraw success' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    throw new Error(`Unexpected fetch ${href}`);
  };

  try {
    const settings = { radboox: { baseUrl: 'https://ssr.radboox.test' } };
    const request = await requestXenditWithdraw(settings, {
      username: 'fakenet',
      password: 'secret',
      amount: 50000,
      bankIndex: '0',
      pin: '123456',
      mode: 'web',
      cache: false
    });
    const verify = await verifyXenditWithdraw(settings, {
      username: 'fakenet',
      password: 'secret',
      otp: '654321',
      sign: request.sign,
      mode: 'web',
      cache: false,
      forceSession: true
    });

    assert.equal(request.ok, true);
    assert.equal(request.amount, 50000);
    assert.equal(request.balanceAmount, 100000);
    assert.equal(request.reserveAmount, 10000);
    assert.equal(request.availableAmount, 90000);
    assert.equal(request.bank, 'MANDIRI');
    assert.equal(request.accountNumberMasked, '****7890');
    assert.equal(request.sign, 'sign-1');
    assert.equal(request.raw, undefined);
    assert.equal(verify.ok, true);
    assert.equal(verify.message, 'Withdraw success');
    assert.equal(verify.raw, undefined);
    assert.equal(calls.some((call) => call.href.includes('/api-v1/pg/xendit/xp-withdraw/acct-1')), true);
    assert.equal(calls.some((call) => call.href.includes('/api-v1/pg/xendit/verify-xp-withdraw/acct-1')), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('xendit withdraw keeps ten thousand rupiah balance reserve', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ href, body });

    if (href.includes('/auth/web/login') || href.endsWith('/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'login-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=session' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'fresh-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/data')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          id: 'acct-1',
          status: 'LIVE',
          tipe: 'OWNED',
          bank: [{ index: 0, bank: 'MANDIRI', name: 'Owner', number: '1234567890' }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/xp-balance/acct-1')) {
      return new Response(JSON.stringify({ status: 'success', message: 'Rp 55,000' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/pg/xendit/xp-withdraw/acct-1')) {
      throw new Error('Withdraw endpoint should not be called when reserve would be violated');
    }

    throw new Error(`Unexpected fetch ${href}`);
  };

  try {
    await assert.rejects(
      () => requestXenditWithdraw({ radboox: { baseUrl: 'https://ssr.radboox.test' } }, {
        username: 'fakenet',
        password: 'secret',
        amount: 50000,
        bankIndex: '0',
        pin: '123456',
        mode: 'web',
        cache: false
      }),
      /Rp 45\.000 available|Rp 45,000 available/
    );
    assert.equal(calls.some((call) => call.href.includes('/api-v1/pg/xendit/xp-withdraw/acct-1')), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox pay invoice finds invoice id before posting payment', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ href, method: options.method || 'GET', body, headers: options.headers || {} });

    if (href.includes('/auth/web/login')) {
      assert.deepEqual(body, { username: 'irfan', password: 'testpass10' });
      return new Response(JSON.stringify({ status: 'success', message: { token: 'login-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=session' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'fresh-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/invoice/find/009986')) {
      return new Response(JSON.stringify({
        status: 'success',
        detail: {
          id: 12242,
          no_invoice: '009986',
          status: 'unpaid'
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/invoice/payment')) {
      assert.deepEqual(body, { id: 12242, method: '2' });
      return new Response(JSON.stringify({ status: 'success', message: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ status: 'error', message: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await payInvoice({
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox.test',
        apiBaseUrl: 'https://ssr.radboox-action.test',
        loginPath: '/auth/web/login'
      }
    }, {
      invoiceNo: '009986',
      username: 'irfan',
      password: 'testpass10',
      paymentMethod: '2',
      forceSession: true
    });

    assert.equal(result.ok, true);
    assert.equal(result.invoiceNo, '009986');
    assert.equal(result.invoiceId, '12242');
    assert.equal(result.paymentMethod, '2');
    assert.ok(calls.some((item) => item.href.includes('/api-v1/billing/invoice/find/009986')));
    assert.ok(calls.some((item) => item.href.includes('/api-v1/billing/invoice/payment')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox manual invoice wizard uses member list, preview, and generate endpoints', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ href, method: options.method || 'GET', body });

    if (href.includes('/auth/web/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'manual-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=manual' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'manual-token-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/member/data?page=1&limit=5&search=rizky')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          total_rows: 1,
          data: [
            {
              id: 77,
              fullname: 'Rizky',
              'user-id': 'rizky-kampung',
              whatsapp: '62812'
            }
          ]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/invoice/generate/77?sub_period=2')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          fullname: 'Rizky',
          due_date: '2026-07-10',
          Subscribe: '2 Month',
          item: 'PAKET B SILVER 20 Mb',
          amount: 'Rp 300.000',
          ppn: 'Rp 0',
          discount: 'Rp 0',
          total: 'Rp 300.000'
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/invoice/generate') && options.method === 'POST') {
      assert.deepEqual(body, { id_member: '77', sub_period: '2' });
      return new Response(JSON.stringify({ status: 'success', message: 'Invoice Created' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ status: 'error', message: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const settings = {
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox.test',
        apiBaseUrl: 'https://ssr.radboox-manual.test',
        loginPath: '/auth/web/login'
      }
    };
    const runtime = {
      username: 'irfan',
      password: 'testpass10',
      forceSession: true
    };
    const members = await listBillingMembers(settings, {
      ...runtime,
      search: 'rizky',
      page: 1,
      limit: 5
    });
    assert.equal(members.members.length, 1);
    assert.equal(members.members[0].id, '77');
    assert.equal(members.members[0].userId, 'rizky-kampung');

    const preview = await previewManualInvoice(settings, {
      ...runtime,
      memberId: '77',
      subPeriod: '2'
    });
    assert.equal(preview.preview.fullName, 'Rizky');
    assert.equal(preview.preview.total, 'Rp 300.000');

    const generated = await generateManualInvoice(settings, {
      ...runtime,
      memberId: '77',
      subPeriod: '2'
    });
    assert.equal(generated.ok, true);
    assert.equal(generated.message, 'Invoice Created');
    assert.ok(calls.some((item) => item.href.includes('/api-v1/billing/member/data?page=1&limit=5&search=rizky')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox billing member detail update falls back when primary endpoint is missing', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ href, method: options.method || 'GET', body });

    if (href.includes('/auth/web/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'member-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=member' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'member-token-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/member/contact-detail/77') && (options.method || 'GET') === 'GET') {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          fullname: 'Rizky',
          whatsapp: '62812',
          email: 'rizky@example.test',
          ktp: '1234567890123456',
          address: 'Jl. Fiber',
          map: { lat: '-1.1', lng: '116.8' }
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/member/payment-detail/77') && (options.method || 'GET') === 'GET') {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          payment_type: 'Postpaid',
          billing_period: 'Cycle',
          next_due: '10/07/2026',
          price: 'Rp 150.000',
          ppn: '11',
          discount: ''
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/member/contact-detail/77') && options.method === 'PUT') {
      return new Response(JSON.stringify({ status: 'error', message: 'endpoint not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/member/contact-detail/77') && options.method === 'POST') {
      assert.deepEqual(body, {
        full_name: 'Rizky Putra',
        wa: '628123456789',
        email: 'rizky@example.test',
        ktp: '1234567890123456',
        address: 'Jl. Fiber Baru'
      });
      return new Response(JSON.stringify({ status: 'success', message: 'Contact Updated' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/member/payment-detail/77') && options.method === 'PUT') {
      return new Response(JSON.stringify({ status: 'error', message: 'endpoint not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/member/payment-detail/77') && options.method === 'POST') {
      assert.deepEqual(body, {
        payment_type: 1,
        billing_period: 2,
        next_due: '2026-07-10',
        ppn: '11',
        discount: ''
      });
      return new Response(JSON.stringify({ status: 'success', message: 'Payment Updated' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ status: 'error', message: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const settings = {
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox.test',
        apiBaseUrl: 'https://ssr.radboox-member.test',
        loginPath: '/auth/web/login'
      }
    };
    const runtime = {
      username: 'irfan',
      password: 'testpass10',
      forceSession: true,
      memberId: '77'
    };

    const contact = await getBillingMemberContactDetail(settings, runtime);
    assert.equal(contact.contact.fullName, 'Rizky');
    assert.equal(contact.contact.map.lng, '116.8');

    const payment = await getBillingMemberPaymentDetail(settings, runtime);
    assert.equal(payment.payment.paymentType, 'Postpaid');
    assert.equal(payment.payment.billingPeriod, 'Cycle');

    const contactUpdate = await updateBillingMemberContactDetail(settings, {
      ...runtime,
      fullName: 'Rizky Putra',
      whatsapp: '628123456789',
      email: 'rizky@example.test',
      ktp: '1234567890123456',
      address: 'Jl. Fiber Baru'
    });
    assert.equal(contactUpdate.message, 'Contact Updated');

    const paymentUpdate = await updateBillingMemberPaymentDetail(settings, {
      ...runtime,
      paymentType: 'postpaid',
      billingPeriod: 'cycle',
      nextDue: '10/07/2026',
      ppn: '11',
      discount: ''
    });
    assert.equal(paymentUpdate.message, 'Payment Updated');
    assert.ok(calls.some((item) => item.method === 'PUT' && item.href.includes('/api-v1/billing/member/contact-detail/77')));
    assert.ok(calls.some((item) => item.method === 'POST' && item.href.includes('/api-v1/billing/member/contact-detail/77')));
    assert.ok(calls.some((item) => item.method === 'PUT' && item.href.includes('/api-v1/billing/member/payment-detail/77')));
    assert.ok(calls.some((item) => item.method === 'POST' && item.href.includes('/api-v1/billing/member/payment-detail/77')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox rollback invoice uses verified cancel endpoint', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, method: options.method || 'GET' });

    if (href.includes('/auth/web/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'rollback-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=rollback' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'rollback-token-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/invoice/find/009591')) {
      return new Response(JSON.stringify({
        status: 'success',
        detail: {
          id: 11848,
          no_invoice: '009591',
          status: 'paid'
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/invoice/cancel/11848')) {
      return new Response(JSON.stringify({ status: 'success', message: 'Invoice Cancelled' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ status: 'error', message: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await rollbackInvoice({
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox.test',
        apiBaseUrl: 'https://ssr.radboox-rollback.test',
        loginPath: '/auth/web/login'
      }
    }, {
      invoiceNo: '009591',
      username: 'irfan',
      password: 'testpass10',
      forceSession: true
    });

    assert.equal(result.ok, true);
    assert.equal(result.invoiceId, '11848');
    assert.equal(result.message, 'Invoice Cancelled');
    assert.ok(calls.some((item) => item.href.includes('/api-v1/billing/invoice/cancel/11848') && item.method === 'POST'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox invoice monitor includes filtered amount for standard unpaid filter', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/api-v1/billing/invoice/topinfo')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          unpaid: 144,
          unpaidAmount: 'Rp 25.575.000',
          paid: 74,
          paidAmount: 'Rp 14.500.000',
          overdue: 9,
          overdueAmount: 'Rp 1.500.000'
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/invoice/data')) {
      return new Response(JSON.stringify({
        status: 'success',
        recordsTotal: 144,
        data: [
          {
            id: 12122,
            no_invoice: '009865',
            full_name: 'Supandi',
            username: 'supandi@fake.net',
            total: 'Rp 150.000',
            status: 'unpaid'
          }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/member/data') || href.includes('/api-v1/radius/ppp/')) {
      return new Response(JSON.stringify({ status: 'success', recordsTotal: 0, data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ status: 'error', message: '' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await invoiceMonitorStatus({
      radboox: {
        mode: 'api',
        apiBaseUrl: 'https://ssr.radboox.test',
        token: 'token-1'
      }
    }, {
      status: 'unpaid',
      page: 1,
      limit: 1,
      cache: false,
      pppLookupTimeoutMs: 1000
    });

    assert.equal(result.summary.filteredCount, 144);
    assert.equal(result.summary.filteredAmount, 25575000);
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox invoice monitor limits all and paid filters to selected monitoring period', async () => {
  const originalFetch = global.fetch;
  const invoices = [
    {
      id: 1,
      no_invoice: 'JUL-UNPAID',
      full_name: 'Pelanggan Juli Belum Bayar',
      username: 'juli-unpaid@fake.net',
      subscribe: '01/07/2026 - 01/08/2026',
      invoice_date: '2026-07-01',
      due_date: '2026-07-10',
      total: 'Rp 100.000',
      status: 'unpaid'
    },
    {
      id: 2,
      no_invoice: 'JUL-PAID',
      full_name: 'Pelanggan Juli Lunas',
      username: 'juli-paid@fake.net',
      subscribe: '01/07/2026 - 01/08/2026',
      invoice_date: '2026-07-01',
      due_date: '2026-07-10',
      paid_date: '2026-07-03',
      total: 'Rp 200.000',
      status: 'paid'
    },
    {
      id: 3,
      no_invoice: 'JUN-PAID',
      full_name: 'Pelanggan Juni Lunas',
      username: 'juni-paid@fake.net',
      subscribe: '01/06/2026 - 01/07/2026',
      invoice_date: '2026-06-01',
      due_date: '2026-06-10',
      paid_date: '2026-07-02',
      total: 'Rp 300.000',
      status: 'paid'
    }
  ];

  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/api-v1/billing/invoice/topinfo')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          total: 3,
          totalAmount: 'Rp 600.000',
          paid: 2,
          paidAmount: 'Rp 500.000',
          unpaid: 1,
          unpaidAmount: 'Rp 100.000'
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/invoice/data')) {
      const parsed = new URL(href);
      const status = parsed.searchParams.get('status');
      const search = String(parsed.searchParams.get('search') || '').trim().toLowerCase();
      const matchesSearch = (invoice) => !search || [
        invoice.no_invoice,
        invoice.full_name,
        invoice.username
      ].some((value) => String(value || '').toLowerCase().includes(search));
      const rows = search
        ? invoices.filter(matchesSearch)
        : invoices;
      const filteredRows = status === 'unpaid'
        ? rows.filter((invoice) => invoice.status === 'unpaid')
        : rows;
      return new Response(JSON.stringify({
        status: 'success',
        recordsTotal: filteredRows.length,
        data: filteredRows
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/report/daily')) {
      const parsed = new URL(href);
      const date = parsed.searchParams.get('date');
      const rows = {
        '2026-07-01': [
          {
            uuid: 'trx-jul-paid',
            no_invoice: 'JUL-PAID',
            full_name: 'Pelanggan Juli Lunas',
            info: 'Payment #JUL-PAID - Pelanggan Juli Lunas',
            pemasukan: 'Rp 200.000',
            metode: 'Transfer',
            date_submit: '08:00 01/07/2026'
          }
        ],
        '2026-07-02': [
          {
            uuid: 'trx-jun-paid',
            no_invoice: 'JUN-PAID',
            full_name: 'Pelanggan Juni Lunas',
            info: 'Payment #JUN-PAID - Pelanggan Juni Lunas',
            pemasukan: 'Rp 300.000',
            metode: 'Transfer',
            date_submit: '09:00 02/07/2026'
          }
        ]
      }[date] || [];
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          jumlah: { jumlahTotalPemasukan: rows.reduce((sum, row) => sum + Number(String(row.pemasukan).replace(/\D/g, '')), 0) },
          data: rows
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/member/data') || href.includes('/api-v1/radius/ppp/')) {
      return new Response(JSON.stringify({ status: 'success', recordsTotal: 0, data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ status: 'error', message: '' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const settings = {
      radboox: {
        mode: 'api',
        apiBaseUrl: 'https://ssr.radboox.test',
        token: 'token-1'
      }
    };
    const baseQuery = {
      period: '2026-07',
      page: 1,
      limit: 10,
      cache: false,
      pppLookupTimeoutMs: 1000
    };

    const allResult = await invoiceMonitorStatus(settings, {
      ...baseQuery,
      status: 'all'
    });
    const paidResult = await invoiceMonitorStatus(settings, {
      ...baseQuery,
      status: 'paid'
    });
    const allSearchResult = await invoiceMonitorStatus(settings, {
      ...baseQuery,
      status: 'all',
      search: 'Juli'
    });
    const paidSearchResult = await invoiceMonitorStatus(settings, {
      ...baseQuery,
      status: 'paid',
      search: 'Juli'
    });

    assert.equal(allResult.summary.filteredCount, 3);
    assert.equal(allResult.summary.filteredAmount, 600000);
    assert.deepEqual(allResult.invoices.map((invoice) => invoice.invoiceNo), ['JUL-UNPAID', 'JUN-PAID', 'JUL-PAID']);
    assert.equal(paidResult.summary.filteredCount, 2);
    assert.equal(paidResult.summary.filteredAmount, 500000);
    assert.equal(paidResult.summary.periodPaidCount, 2);
    assert.equal(paidResult.summary.periodPaidAmount, 500000);
    assert.deepEqual(paidResult.invoices.map((invoice) => invoice.invoiceNo), ['JUN-PAID', 'JUL-PAID']);
    assert.equal(allSearchResult.summary.filteredCount, 2);
    assert.deepEqual(allSearchResult.invoices.map((invoice) => invoice.invoiceNo), ['JUL-UNPAID', 'JUL-PAID']);
    assert.equal(paidSearchResult.summary.filteredCount, 1);
    assert.deepEqual(paidSearchResult.invoices.map((invoice) => invoice.invoiceNo), ['JUL-PAID']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox billing member normalizer accepts Radboox member fields', () => {
  const member = normalizeBillingMember({
    id: 1008,
    'user-id': '22096671012',
    fullname: 'Rusli',
    internet: 'rusli@kampung.net',
    whatsapp: '082250720011',
    status: 'suspend',
    type_payment: 'Postpaid',
    billing_period: 'Fixed',
    active_date: '27/06/2026',
    next_due: '27/07/2026'
  });

  assert.equal(member.customerName, 'Rusli');
  assert.equal(member.username, 'rusli@kampung.net');
  assert.equal(member.phone, '082250720011');
  assert.equal(member.serviceStatus, 'suspend');
  assert.equal(member.isIsolated, true);
  assert.equal(member.dueDate, '2026-07-27');
});

test('radboox ppp user normalizer keeps last active timestamp', () => {
  const pppUser = normalizePppUser({
    username: 'selfi@fake.net',
    full_name: 'Selfi',
    nas: 'FAKE.NET',
    last_login: '01/07/2026 21:15:09',
    status: 'active'
  });

  assert.equal(pppUser.username, 'selfi@fake.net');
  assert.equal(pppUser.site, 'FAKE.NET');
  assert.equal(pppUser.lastActiveAt, '2026-07-01T21:15:09+08:00');

  const invoice = normalizeBillingInvoice({
    no_invoice: 'INV-SELFI',
    full_name: 'Selfi',
    item: 'Internet bulanan selfi@fake.net',
    total: 'Rp 150.000',
    due_date: '04/07/2026',
    status: 'unpaid'
  });
  const [enriched] = enrichInvoicesWithPppUsers([invoice], [pppUser]);

  assert.equal(enriched.lastActiveAt, '2026-07-01T21:15:09+08:00');
  assert.equal(enriched.pppoeUsername, 'selfi@fake.net');
});

test('radboox ppp session normalizer uses accounting update as last active', () => {
  const session = normalizePppSession({
    id: 278986,
    username: 'aina@kampung.net',
    nas: 'KAMPUNG.NET',
    start: '20:54:09 28/06/2026',
    stop: '00:40:21 02/07/2026',
    update: '01:34:13 02/07/2026',
    uptime: '3d4h'
  });

  assert.equal(session.username, 'aina@kampung.net');
  assert.equal(session.site, 'KAMPUNG.NET');
  assert.equal(session.lastActiveAt, '2026-07-02T01:34:13+08:00');

  const pppUser = normalizePppUser({
    id: 1068,
    username: 'aina@kampung.net',
    nas: 'KAMPUNG.NET',
    status: 'active'
  });
  const invoice = normalizeBillingInvoice({
    no_invoice: 'INV-AINA',
    full_name: 'Aina',
    item: 'Internet : aina@kampung.net - PAKET B SILVER',
    total: 'Rp 200.000',
    due_date: '04/07/2026',
    status: 'unpaid'
  });
  const [enriched] = enrichInvoicesWithPppUsers([invoice], [pppUser, session]);

  assert.equal(enriched.lastActiveAt, '2026-07-02T01:34:13+08:00');
});

test('radboox billing invoice normalizer converts local due dates for overdue checks', () => {
  const futureInvoice = normalizeBillingInvoice({
    no_invoice: '009755',
    full_name: 'Selfi',
    total: 'Rp 150.000',
    due_date: '04/07/2026',
    status: 'unpaid'
  });
  const overdueInvoice = normalizeBillingInvoice({
    no_invoice: '009700',
    full_name: 'Budi',
    total: 'Rp 150.000',
    due_date: '01/07/2026',
    status: 'unpaid'
  });

  assert.equal(futureInvoice.dueDate, '2026-07-04');
  assert.equal(isBillingInvoiceOverdue(futureInvoice, '2026-07-02'), false);
  assert.equal(isBillingInvoiceOverdue(overdueInvoice, '2026-07-02'), true);
});

test('normalizes Radboox monthly earning payload', () => {
  const earning = normalizeMonthlyEarning({
    data: [
      { period: '2026-05', total_paid: '1.000.000' },
      { period: '2026-06', total_paid: 'Rp 5.500.000', paid_count: 55 }
    ]
  }, '2026-06');

  assert.equal(earning.period, '2026-06');
  assert.equal(earning.amount, 5500000);
  assert.equal(earning.transactionCount, 55);
});

test('normalizes Radboox monthly report total income', () => {
  const earning = normalizeMonthlyEarning({
    status: 'success',
    message: {
      data: [],
      jumlah: {
        jumlahPemasukanTunai: 'Rp 1.000.000',
        jumlahPemasukanTransfer: 'Rp 2.000.000',
        jumlahTotalPemasukan: 'Rp 3.000.000',
        jumlahTotalPengeluaran: 'Rp 500.000',
        jumlahTotalPendapatan: 'Rp 2.500.000'
      }
    }
  }, '2026-06');

  assert.equal(earning.amount, 3000000);
});

test('radboox web sync ignores rejected refresh token when monthly endpoint works', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/auth/web/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'fresh-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=session' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'error', message: '' }), {
        status: 406,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/report/monthly?date=2026-06-01&type=&admin=')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          jumlah: { jumlahTotalPemasukan: 'Rp 4.250.000' },
          data: []
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ status: 'error', message: '' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await syncMonthlyEarning({
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox.com',
        apiBaseUrl: 'https://ssr.radboox.com',
        username: 'user',
        password: 'pass',
        loginPath: '/auth/web/login',
        webEarningsPath: '/api-v1/billing/report/monthly?date={date}&type=&admin='
      }
    }, { period: '2026-06' });

    assert.equal(result.earning.amount, 4250000);
    assert.ok(calls.some((item) => item.includes('/auth/web/refreshToken')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox web sync tries fallback monthly endpoints after 406', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes('/auth/web/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'fresh-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=session' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'error', message: '' }), {
        status: 406,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/report/monthly?date=2026-06-01&type=&admin=')) {
      return new Response(JSON.stringify({ status: 'error', message: '' }), {
        status: 406,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/report/monthly?date=2026-06-01')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          jumlah: { jumlahPemasukanTunai: 'Rp 1.000.000', jumlahPemasukanTransfer: 'Rp 2.000.000' },
          data: []
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ status: 'error', message: '' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await syncMonthlyEarning({
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox.com',
        apiBaseUrl: 'https://ssr.radboox.com',
        username: 'user',
        password: 'pass',
        loginPath: '/auth/web/login',
        webEarningsPath: '/api-v1/billing/report/monthly?date={date}&type=&admin='
      }
    }, { period: '2026-06' });

    assert.equal(result.earning.amount, 3000000);
  } finally {
    global.fetch = originalFetch;
  }
});

test('normalizes Radboox daily report payload', () => {
  const report = normalizeDailyReport({
    status: 'success',
    message: {
      jumlah: {
        jumlahPemasukanTunai: 'Rp 0',
        jumlahPemasukanTransfer: 'Rp 2,825,000',
        jumlahTotalPemasukan: 'Rp 2,825,000',
        jumlahTotalPengeluaran: 'Rp 0',
        jumlahTotalPendapatan: 'Rp 2,825,000'
      },
      data: [
        {
          uuid: 'abc',
          info: 'Payment #001 - Udin',
          pemasukan: 'Rp 155,000',
          pengeluaran: 'Rp 0',
          metode: 2,
          admin: 47304,
          nas: 'KAMPUNG.NET',
          date_submit: '20:52:35 01/07/2026'
        }
      ]
    }
  }, '2026-07-01');

  assert.equal(report.date, '2026-07-01');
  assert.equal(report.totalIncome, 2825000);
  assert.equal(report.transferIncome, 2825000);
  assert.equal(report.transactionCount, 1);
  assert.equal(report.transactions[0].method, 'Transfer');
  assert.equal(report.transactions[0].adminId, '47304');
  assert.equal(report.transactions[0].income, 155000);
  assert.equal(report.transactions[0].invoiceNo, '001');
  assert.equal(report.transactions[0].site, 'KAMPUNG.NET');
  assert.equal(report.transactions[0].paymentAt, '2026-07-01T20:52:35+07:00');
  assert.equal(report.transactions[0].paymentTime, '21:52');
});

test('radboox daily report enriches transactions with NAS site from invoice data', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/api-v1/billing/report/daily?date=2026-07-01')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          jumlah: { jumlahTotalPemasukan: 'Rp 200.000', jumlahTotalPengeluaran: 'Rp 0' },
          data: [{
            uuid: 'daily-1',
            info: 'Payment #009849 - Dhedy',
            pemasukan: 'Rp 200.000',
            pengeluaran: 'Rp 0',
            metode: 1,
            admin: 47304,
            date_submit: '08:01:02 01/07/2026'
          }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/transaction/data')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: { total_rows: 0, data: [] }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/invoice/data')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          total_rows: 1,
          data: [{
            id: 12106,
            no_invoice: '009849',
            username: 'dhedy@kampung.net',
            full_name: 'Dhedy',
            item: 'Internet : dhedy@kampung.net - PAKET B SILVER 20 Mb',
            total: 'Rp 200.000',
            status: 'paid'
          }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ status: 'error', message: '' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await syncDailyReport({
      radboox: {
        mode: 'api',
        baseUrl: 'https://ssr.radboox.test',
        dailyReportPath: '/api-v1/billing/report/daily?date={date}',
        token: 'token-1'
      }
    }, {
      date: '2026-07-01',
      sites: [
        { id: 'fake', name: 'FAKE.NET' },
        { id: 'kampung', name: 'KAMPUNG.NET' }
      ]
    });

    assert.equal(result.report.transactions[0].siteId, 'kampung');
    assert.equal(result.report.transactions[0].siteName, 'KAMPUNG.NET');
    assert.ok(calls.some((item) => item.includes('/api-v1/billing/invoice/data')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox web daily report uses daily endpoint without monthly parameters', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/auth/web/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'fresh-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=session' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'refreshed-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/report/daily?date=2026-07-01')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          jumlah: { jumlahTotalPemasukan: 'Rp 1.250.000', jumlahTotalPengeluaran: 'Rp 0' },
          data: [{ uuid: '1', info: 'Payment #1', pemasukan: 'Rp 1.250.000', pengeluaran: 'Rp 0', metode: 2, admin: 52901 }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/transaction/data')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          total_rows: 1,
          data: [{
            uuid: 'tx-1',
            description: 'Payment #1',
            price: 'Rp 1.250.000',
            date_submit: '09:15:04 01/07/2026',
            payment_method: 'Transfer',
            admin: 'Wahyudi'
          }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/account/admin/users')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: [
          { id_admin: 47304, username: 'fakenet', name: 'NURDIANSYAH', role: 1 },
          { id_admin: 52901, username: 'yudi31385', name: 'Wahyudi', role: 5 }
        ]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/account/admin/detail')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: { admin_id: 56968, username: 'billingadmin', name: 'Billing Admin' }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ status: 'error', message: '' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await syncDailyReport({
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox.com',
        apiBaseUrl: 'https://ssr.radboox.com',
        username: 'user',
        password: 'pass',
        loginPath: '/auth/web/login',
        webDailyReportPath: '/api-v1/billing/report/daily?date={date}'
      }
    }, { date: '2026-07-01' });

    assert.equal(result.report.totalIncome, 1250000);
    assert.equal(result.report.adminDirectory['47304'], 'fakenet');
    assert.equal(result.report.adminDirectory['52901'], 'Wahyudi');
    assert.equal(result.report.transactions[0].adminName, 'Wahyudi');
    assert.equal(result.report.transactions[0].paymentTime, '10:15');
    assert.equal(result.report.transactions[0].paymentAt, '2026-07-01T09:15:04+07:00');
    assert.ok(calls.some((item) => item.includes('/api-v1/billing/report/daily?date=2026-07-01')));
    assert.equal(calls.some((item) => item.includes('type=&admin=')), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox cashier transactions use billing transaction endpoint', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/auth/web/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'cashier-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=cashier' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'cashier-token-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/transaction/data')) {
      const isTableRequest = href.includes('limit=10');
      assert.ok(href.includes(isTableRequest ? 'page=2' : 'page=1'));
      assert.ok(href.includes(isTableRequest ? 'limit=10' : 'limit=500'));
      assert.ok(href.includes('start=2026-07-01'));
      assert.ok(href.includes('end=2026-07-08'));
      assert.ok(href.includes('type='));
      assert.ok(href.includes('payment_method=transfer'));
      assert.ok(href.includes('search=rizky'));
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          total_rows: 21,
          data: [{
            id: 'tx-1',
            item: 'Invoice',
            description: 'Payment #INV-001 Rizky',
            type: 'Revenue',
            price: 'Rp 150.000',
            date_submit: '09:15:04 08/07/2026',
            payment_method: 'Transfer',
            admin: 'Wahyudi'
          }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/billing/transaction/topinfo')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          profit: 'Rp 3.150.000',
          total_invoice_paid: 21
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ status: 'error', message: '' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await listCashierTransactions({
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox.test',
        apiBaseUrl: 'https://ssr.radboox-kasir.test',
        username: 'user',
        password: 'pass',
        loginPath: '/auth/web/login'
      }
    }, {
      page: 2,
      limit: 10,
      from: '2026-07-01',
      to: '2026-07-08',
      method: 'transfer',
      search: 'rizky',
      forceSession: true
    });

    assert.equal(result.transactions.length, 1);
    assert.equal(result.transactions[0].method, 'Transfer');
    assert.equal(result.transactions[0].item, 'Invoice');
    assert.equal(result.transactions[0].type, 'Revenue');
    assert.equal(result.transactions[0].admin, 'Wahyudi');
    assert.equal(result.transactions[0].amount, 150000);
    assert.equal(result.transactions[0].submittedTime, '10:15');
    assert.equal(result.summary.totalAmount, 150000);
    assert.equal(result.summary.topInfo.totalAmount, 3150000);
    assert.equal(result.summary.totalPaid, 21);
    assert.equal(result.totalRows, 21);
    assert.ok(calls.some((item) => item.includes('/api-v1/billing/transaction/topinfo')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox radius views use ppp, hotspot, and nas endpoints read-only', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ href, method: options.method || 'GET', body });

    if (href.includes('/auth/web/login')) {
      return new Response(JSON.stringify({ status: 'success', message: { token: 'radius-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=radius' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'radius-token-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if ((options.method || 'GET') === 'GET' && href.includes('/api-v1/radius/ppp/users')) {
      assert.ok(href.includes('page=3'));
      assert.ok(href.includes('limit=10'));
      assert.ok(href.includes('status=active'));
      assert.ok(href.includes('search=ana'));
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          total_rows: 12,
          data: [{
            id: 'ppp-1',
            username: 'ana@fake.net',
            full_name: 'Ana',
            profile_name: '20M',
            nas: 'FAKE.NET',
            status: 'active',
            ip_address: '10.10.10.5',
            caller_id: 'AA:BB:CC',
            password: 'hidden'
          }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/radius/ppp/topinfo')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          total_user: 12,
          total_online: 7,
          isolir: 2,
          terminate: 1
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/radius/ppp/profile')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: [{
          id: 'profile-1',
          name: '20M',
          price: '150000',
          rate_limit: '20M/20M'
        }]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/radius/hotspot/session')) {
      assert.ok(href.includes('page=2'));
      assert.ok(href.includes('nas=KAMPUNG.NET'));
      assert.ok(href.includes('search=hp'));
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          total_rows: 3,
          data: [{
            session_id: 'hs-1',
            username: 'voucher01',
            nas: 'KAMPUNG.NET',
            framed_ip_address: '172.16.1.20',
            uptime: '00:10:12',
            status: 'online'
          }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/radius/hotspot/topinfo')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          total: 3,
          online: 1
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/radius/hotspot/profile')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: [{
          id: 'hotspot-profile-1',
          name: 'Voucher 1 Hari',
          price: '5000'
        }]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (href.includes('/api-v1/radius/nas/data')) {
      return new Response(JSON.stringify({
        status: 'success',
        message: {
          data: [{
            id: 'nas-1',
            name: 'FAKE.NET',
            ip: '10.10.10.1',
            timezone: 'Asia/Makassar',
            connected: 1,
            secret: 'secret-value'
          }]
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ status: 'error', message: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const settings = {
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox.test',
        apiBaseUrl: 'https://ssr.radboox-radius.test',
        username: 'admin',
        password: 'secret',
        loginPath: '/auth/web/login'
      }
    };

    const ppp = await listRadiusPppDhcp(settings, {
      tab: 'users',
      page: 3,
      limit: 10,
      status: 'active',
      search: 'ana',
      forceSession: true,
      cache: false
    });
    const hotspot = await listRadiusHotspot(settings, {
      tab: 'sessions',
      page: 2,
      limit: 10,
      nas: 'KAMPUNG.NET',
      search: 'hp',
      forceSession: true,
      cache: false
    });
    const radiusSettings = await listRadiusSettings(settings, {
      page: 1,
      limit: 10,
      search: 'fake',
      forceSession: true,
      cache: false
    });
    const pppProfiles = await listRadiusPppDhcp(settings, {
      tab: 'profiles',
      page: 1,
      limit: 10,
      forceSession: true,
      cache: false
    });
    const hotspotProfiles = await listRadiusHotspot(settings, {
      tab: 'profiles',
      page: 1,
      limit: 10,
      forceSession: true,
      cache: false
    });

    assert.equal(ppp.ok, true);
    assert.equal(ppp.rows[0].username, 'ana@fake.net');
    assert.equal(ppp.rows[0].customerName, 'Ana');
    assert.equal(ppp.rows[0].credentialStored, true);
    assert.equal(ppp.rows[0].password, undefined);
    assert.equal(ppp.pagination.total, 12);
    assert.equal(ppp.topInfo.active, 7);
    assert.equal(hotspot.rows[0].username, 'voucher01');
    assert.equal(hotspot.rows[0].status, 'active');
    assert.equal(hotspot.pagination.total, 3);
    assert.equal(radiusSettings.rows[0].name, 'FAKE.NET');
    assert.equal(radiusSettings.rows[0].connected, true);
    assert.equal(radiusSettings.rows[0].credentialStored, true);
    assert.equal(radiusSettings.rows[0].secret, undefined);
    assert.equal(pppProfiles.rows[0].name, '20M');
    assert.equal(hotspotProfiles.rows[0].name, 'Voucher 1 Hari');
    assert.ok(calls.some((call) => call.href.includes('/api-v1/radius/ppp/users')));
    assert.ok(calls.some((call) => call.href.includes('/api-v1/radius/hotspot/session')));
    assert.ok(calls.some((call) => call.href.includes('/api-v1/radius/nas/data')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('radboox radius user mutations keep login credentials separate from radius user data', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ href, method, body });

    if (href.includes('/auth/web/login')) {
      assert.deepEqual(body, { username: 'radboox-admin', password: 'login-pass' });
      return new Response(JSON.stringify({ status: 'success', message: { token: 'radius-write-token' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'rb=radius-write' }
      });
    }
    if (href.includes('/auth/web/refreshToken')) {
      return new Response(JSON.stringify({ status: 'success', message: 'radius-write-token-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (method === 'POST' && href.endsWith('/api-v1/radius/ppp/users')) {
      assert.equal(body.username, 'baru@fake.net');
      assert.equal(body.password, 'radius-pass');
      assert.equal(body.billing, 0);
      return new Response(JSON.stringify({ status: 'success', message: 'PPP created' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (method === 'POST' && href.endsWith('/api-v1/radius/ppp/users/ppp-1')) {
      assert.equal(body.username, 'edit@fake.net');
      assert.equal(body.password, undefined);
      assert.equal(body.profile, '20M');
      return new Response(JSON.stringify({ status: 'success', message: 'PPP updated' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (method === 'DELETE' && href.endsWith('/api-v1/radius/ppp/delete/ppp-1')) {
      return new Response(JSON.stringify({ status: 'success', message: { status: 'success', message: 'PPP deleted' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (method === 'POST' && href.endsWith('/api-v1/radius/hotspot/users/one')) {
      assert.equal(body.username, 'voucher01');
      assert.equal(body.password, 'voucher-pass');
      assert.equal(body.profile, 'Voucher 1 Hari');
      return new Response(JSON.stringify({ status: 'success', message: 'Hotspot created' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (method === 'PUT' && href.endsWith('/api-v1/radius/hotspot/users/hotspot-1')) {
      assert.equal(body.username, 'voucher01');
      assert.equal(body.password, undefined);
      assert.equal(body.profile, 'Voucher 2 Hari');
      return new Response(JSON.stringify({ status: 'success', message: 'Hotspot updated' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (method === 'DELETE' && href.endsWith('/api-v1/radius/hotspot/users/hotspot-1')) {
      return new Response(JSON.stringify({ status: 'success', message: 'Hotspot deleted' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ status: 'error', message: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const settings = {
      radboox: {
        mode: 'web',
        baseUrl: 'https://my.radboox.test',
        apiBaseUrl: 'https://ssr.radboox-radius-write.test',
        loginPath: '/auth/web/login'
      }
    };
    const login = {
      username: 'radboox-admin',
      password: 'login-pass',
      mode: 'web',
      forceSession: true,
      cache: false
    };

    const createdPpp = await createRadiusPppDhcpUser(settings, {
      ...login,
      type: 'PPPoE',
      radiusUsername: 'baru@fake.net',
      radiusPassword: 'radius-pass',
      profile: '20M',
      nas: '10.10.10.1'
    });
    const updatedPpp = await updateRadiusPppDhcpUser(settings, {
      ...login,
      id: 'ppp-1',
      type: 'PPPoE',
      radiusUsername: 'edit@fake.net',
      profile: '20M'
    });
    const deletedPpp = await deleteRadiusPppDhcpUser(settings, {
      ...login,
      id: 'ppp-1',
      radiusUsername: 'edit@fake.net'
    });
    const createdHotspot = await createRadiusHotspotUser(settings, {
      ...login,
      radiusUsername: 'voucher01',
      radiusPassword: 'voucher-pass',
      profile: 'Voucher 1 Hari',
      routerNas: '10.10.10.1'
    });
    const updatedHotspot = await updateRadiusHotspotUser(settings, {
      ...login,
      id: 'hotspot-1',
      radiusUsername: 'voucher01',
      profile: 'Voucher 2 Hari',
      routerNas: '10.10.10.1'
    });
    const deletedHotspot = await deleteRadiusHotspotUser(settings, {
      ...login,
      id: 'hotspot-1',
      radiusUsername: 'voucher01'
    });

    assert.equal(createdPpp.ok, true);
    assert.equal(updatedPpp.message, 'PPP updated');
    assert.equal(deletedPpp.ok, true);
    assert.equal(createdHotspot.ok, true);
    assert.equal(updatedHotspot.message, 'Hotspot updated');
    assert.equal(deletedHotspot.ok, true);
    assert.ok(calls.some((call) => call.href.endsWith('/api-v1/radius/ppp/users') && call.method === 'POST'));
    assert.ok(calls.some((call) => call.href.endsWith('/api-v1/radius/hotspot/users/hotspot-1') && call.method === 'DELETE'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('parses simple HTML table rows for web-login mode', () => {
  const tables = parseHtmlTables(`
    <table>
      <tr><th>Username</th><th>Nama</th></tr>
      <tr><td>udin@kampung.net</td><td>Udin</td></tr>
    </table>
  `);

  assert.equal(tables.length, 1);
  assert.equal(tables[0][0].username, 'udin@kampung.net');
  assert.equal(tables[0][0].nama, 'Udin');
});

test('settings include configurable default logo', () => {
  const data = createDefaultStore();
  assert.equal(data.settings.logoUrl, '/fakenet-logo.png');

  data.settings.logoUrl = 'https://cdn.example.test/logo.png';
  assert.equal(publicSettings(data.settings).logoUrl, 'https://cdn.example.test/logo.png');

  data.settings.logoUrl = 'data:image/png;base64,aGVsbG8=';
  assert.equal(publicSettings(data.settings).logoUrl, 'data:image/png;base64,aGVsbG8=');

  const legacy = ensureShape({ settings: { businessName: 'Legacy ISP' } });
  assert.equal(legacy.settings.logoUrl, '/fakenet-logo.png');
});

test('collector daily bonus uses default tier and ignores legacy percent fields', () => {
  const data = createDefaultStore();
  data.settings.collectorDailyBonusPercent = 10;
  data.settings.collectorDailyBonusAmount = 50000;
  data.payments.push({
    id: 'pay-collector-1',
    amount: 900000,
    paidAt: '2026-07-12',
    createdByUsername: 'collector1',
    createdByName: 'Collector Satu',
    createdByRole: 'collector'
  });

  const scope = serverInternals.dashboardCollectorScope(data, {
    username: 'collector1',
    name: 'Collector Satu',
    role: 'collector'
  }, '2026-07');

  assert.equal(scope.earning, 15000);
  assert.equal(scope.fixedDailyAmount, 0);
  assert.equal(scope.activeDays, 1);
  assert.equal(scope.qualifiedDays, 1);
  assert.equal(scope.bonusEnabled, true);

  data.settings.collectorDailyBonusEnabled = false;
  const disabledScope = serverInternals.dashboardCollectorScope(data, {
    username: 'collector1',
    name: 'Collector Satu',
    role: 'collector'
  }, '2026-07');
  assert.equal(disabledScope.earning, 0);
  assert.equal(disabledScope.bonusEnabled, false);
});

test('rollback payment removes collector dashboard earnings', () => {
  const data = createDefaultStore();
  data.invoices.push({
    id: 'inv-collector-rollback',
    customerId: 'cus-collector',
    customerName: 'Pelanggan Collector',
    period: '2026-07',
    amount: 900000,
    status: 'pending',
    dueDate: '2026-07-20'
  });
  const collector = {
    username: 'collector1',
    name: 'Collector Satu',
    role: 'collector'
  };

  markInvoicePaid(data, 'inv-collector-rollback', {
    amount: 900000,
    paidAt: '2026-07-12',
    paymentMethod: 'Tunai',
    actorName: collector.name,
    actorUsername: collector.username,
    actorRole: collector.role
  });

  const paidScope = serverInternals.dashboardCollectorScope(data, collector, '2026-07');
  assert.equal(paidScope.earning, 15000);
  assert.equal(paidScope.transactionCount, 1);
  assert.equal(summarize(data, '2026-07').invoicePaidRevenue, 900000);

  markInvoiceUnpaid(data, 'inv-collector-rollback');

  const rollbackScope = serverInternals.dashboardCollectorScope(data, collector, '2026-07');
  assert.equal(data.payments.length, 1);
  assert.equal(data.payments[0].status, 'void');
  assert.equal(paymentIsActive(data.payments[0]), false);
  assert.equal(rollbackScope.earning, 0);
  assert.equal(rollbackScope.transactionCount, 0);
  assert.equal(rollbackScope.activeDays, 0);
  assert.equal(summarize(data, '2026-07').invoicePaidRevenue, 0);

  data.payments[0].status = '';
  const legacyRollbackScope = serverInternals.dashboardCollectorScope(data, collector, '2026-07');
  assert.equal(paymentIsActive(data.payments[0]), true);
  assert.equal(legacyRollbackScope.earning, 0);
  assert.equal(legacyRollbackScope.transactionCount, 0);
});

test('collector reports are scoped to own collected payments', () => {
  const data = createDefaultStore();
  const collector = {
    username: 'collector1',
    name: 'Collector Satu',
    role: 'collector'
  };
  data.customers.push(
    { id: 'cus-collector-a', name: 'Pelanggan A', username: 'pelanggan-a', site: 'NAS A' },
    { id: 'cus-collector-b', name: 'Pelanggan B', username: 'pelanggan-b', site: 'NAS B' },
    { id: 'cus-due-only', name: 'Pelanggan Tempo', username: 'tempo-only', site: 'NAS A' }
  );
  data.invoices.push(
    {
      id: 'inv-collector-a',
      customerId: 'cus-collector-a',
      customerName: 'Pelanggan A',
      period: '2026-07',
      amount: 100000,
      status: 'pending',
      dueDate: '2026-07-12'
    },
    {
      id: 'inv-collector-b',
      customerId: 'cus-collector-b',
      customerName: 'Pelanggan B',
      period: '2026-07',
      amount: 150000,
      status: 'pending',
      dueDate: '2026-07-12'
    },
    {
      id: 'inv-due-only',
      customerId: 'cus-due-only',
      customerName: 'Pelanggan Tempo',
      period: '2026-07',
      amount: 200000,
      status: 'pending',
      dueDate: '2026-07-12'
    }
  );
  data.expenses.push({
    id: 'expense-global',
    date: '2026-07-12',
    amount: 50000,
    paymentMethod: 'Tunai'
  });

  markInvoicePaid(data, 'inv-collector-a', {
    amount: 100000,
    paidAt: '2026-07-12T09:00:00+08:00',
    paymentMethod: 'Tunai',
    actorName: collector.name,
    actorUsername: collector.username,
    actorRole: collector.role
  });
  markInvoicePaid(data, 'inv-collector-b', {
    amount: 150000,
    paidAt: '2026-07-12T10:00:00+08:00',
    paymentMethod: 'Transfer',
    actorName: 'Collector Dua',
    actorUsername: 'collector2',
    actorRole: 'collector'
  });

  const scopedPayments = serverInternals.collectorReportPayments(data, collector);
  assert.equal(scopedPayments.length, 1);
  assert.equal(scopedPayments[0].invoiceId, 'inv-collector-a');

  const dailyReport = serverInternals.localDailyReport(data, '2026-07-12', {
    payments: scopedPayments,
    includeDueInvoices: false
  });
  assert.equal(dailyReport.transactionCount, 1);
  assert.equal(dailyReport.totalIncome, 100000);
  assert.equal(dailyReport.transactions[0].invoiceId, 'inv-collector-a');
  assert.equal(dailyReport.transactions.some((item) => item.invoiceId === 'inv-collector-b'), false);
  assert.equal(dailyReport.transactions.some((item) => item.invoiceId === 'inv-due-only'), false);

  const monthlyRows = serverInternals.monthlyBillingDailyRows(data, '2026-07', {
    payments: scopedPayments,
    includeExpenses: false
  });
  const row = monthlyRows.find((item) => item.date === '2026-07-12');
  assert.equal(row.incomeCash, 100000);
  assert.equal(row.incomeTransfer, 0);
  assert.equal(row.expenseCash, 0);
  assert.equal(row.incomeTotal, 100000);
});

test('hotspot voucher templates have editable local default rows', () => {
  const data = createDefaultStore();
  const rows = serverInternals.radiusTemplateRowsLocal(data);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'default');
  assert.equal(rows[0].editable, true);
  assert.equal(rows[0].active, true);
});

test('reseller voucher visibility only allows own generated hotspot vouchers', () => {
  const user = { username: 'reseller1', name: 'Reseller Satu', role: 'reseller_voucher' };

  assert.equal(serverInternals.resellerHotspotVoucherRowVisible({
    username: 'voucher-own',
    createdByUsername: 'reseller1'
  }, user), true);
  assert.equal(serverInternals.resellerHotspotVoucherRowVisible({
    username: 'voucher-other',
    createdByUsername: 'admin'
  }, user), false);
  assert.equal(serverInternals.resellerHotspotVoucherRowVisible({
    username: 'voucher-online',
    createdByUsername: 'reseller1',
    onlineOrderId: 'order-1'
  }, user), false);

  const lockedUser = { ...user, lockedNasId: 'nas-site-1' };
  assert.equal(serverInternals.resellerHotspotVoucherRowVisible({
    username: 'voucher-locked',
    createdByUsername: 'reseller1',
    nasId: 'nas-site-1'
  }, lockedUser), true);
  assert.equal(serverInternals.resellerHotspotVoucherRowVisible({
    username: 'voucher-other-nas',
    createdByUsername: 'reseller1',
    nasId: 'nas-site-2'
  }, lockedUser), false);
});

test('technician hotspot write scope only accepts manual free users', () => {
  assert.equal(serverInternals.hotspotFreeUserWritable({
    serviceType: 'hotspot',
    username: 'free-user',
    paymentStatus: 'free'
  }), true);
  assert.equal(serverInternals.hotspotFreeUserWritable({
    serviceType: 'hotspot',
    username: 'paid-user',
    paymentStatus: 'paid'
  }), false);
  assert.equal(serverInternals.hotspotFreeUserWritable({
    serviceType: 'hotspot',
    username: 'generated-free',
    paymentStatus: 'free',
    voucherBatchId: 'batch-1'
  }), false);
  assert.equal(serverInternals.hotspotFreeUserWritable({
    serviceType: 'hotspot',
    username: 'online-free',
    paymentStatus: 'free',
    onlineOrderId: 'order-1'
  }), false);
  assert.equal(serverInternals.hotspotFreeUserWritable({
    serviceType: 'hotspot',
    username: 'reseller-free',
    paymentStatus: 'free',
    createdByRole: 'reseller_voucher'
  }), false);
});

test('reseller NAS lock does not hide hotspot profiles when generating vouchers', async () => {
  const data = createDefaultStore();
  data.radiusProfiles.push({
    id: 'profile-voucher-3000',
    serviceType: 'hotspot',
    name: 'V-3000',
    price: 3000,
    active: true
  });

  const payload = await serverInternals.radiusPayloadLocal(data, 'hotspot', {
    tab: 'profiles',
    nas: 'nas-site-1',
    viewer: {
      username: 'anduy',
      name: 'anduy',
      role: 'reseller_voucher',
      lockedNasId: 'nas-site-1'
    }
  });

  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0].name, 'V-3000');
});

test('voucher report scopes reseller revenue and calculates commission', () => {
  const data = createDefaultStore();
  data.settings.voucherRevenueSharePercent = 20;
  data.users.push(
    { id: 'usr-anduy', username: 'anduy', name: 'Anduy', role: 'reseller_voucher' },
    { id: 'usr-other', username: 'other', name: 'Other Reseller', role: 'reseller_voucher' }
  );
  const orders = [
    {
      id: 'voucher-anduy',
      reference: 'V001',
      source: 'generated',
      amount: 10000,
      quantity: 2,
      createdByUsername: 'anduy',
      createdByName: 'Anduy',
      nasId: 'nas-1',
      nasName: 'NAS 1',
      profileName: 'V-3000',
      paymentMethod: 'Cash'
    },
    {
      id: 'voucher-other',
      reference: 'V002',
      source: 'generated',
      amount: 15000,
      quantity: 3,
      createdByUsername: 'other',
      createdByName: 'Other Reseller',
      nasId: 'nas-1',
      nasName: 'NAS 1',
      profileName: 'V-3000',
      paymentMethod: 'QRIS'
    }
  ];

  const scoped = serverInternals.filterVoucherReportOrders(data, orders, {}, data.users[0]);
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].reference, 'V001');
  assert.equal(scoped[0].commissionAmount, 2000);
  assert.equal(scoped[0].netAmount, 8000);

  const adminFiltered = serverInternals.filterVoucherReportOrders(data, orders, { reseller: 'other' }, { role: 'admin' });
  assert.equal(adminFiltered.length, 1);
  assert.equal(adminFiltered[0].reference, 'V002');
  assert.equal(adminFiltered[0].commissionAmount, 3000);
});

test('online voucher order only creates payment gateway transaction after paid', () => {
  const data = createDefaultStore();
  data.settings.paymentGateway.enabled = true;
  data.settings.paymentGateway.provider = 'tripay';
  data.settings.hotspotVoucherOnline.enabled = true;
  data.settings.hotspotVoucherOnline.requireWhatsapp = false;
  data.radiusProfiles.push({
    id: 'profile-voucher-online',
    serviceType: 'hotspot',
    name: 'Voucher Online',
    price: 5000,
    active: true
  });
  data.settings.hotspotVoucherOnline.packages = {
    'profile-voucher-online': {
      enabled: true,
      label: 'Voucher Online',
      maxPerOrder: 5
    }
  };

  const order = serverInternals.createHotspotVoucherOrder(data, {
    profileId: 'profile-voucher-online',
    quantity: 2,
    buyerName: 'Pembeli Test'
  });

  assert.equal(order.status, 'pending');
  assert.equal(order.adminFee, 820);
  assert.equal(order.gatewayAmount, 10820);
  assert.equal(data.hotspotVoucherOrders.length, 1);
  assert.equal(data.paymentGatewayTransactions.length, 0);
  assert.equal(serverInternals.paymentGatewayReportPayload(data, {}).transactions.length, 0);

  const fulfilled = serverInternals.fulfillHotspotVoucherOrder(data, order.id, {
    status: 'paid',
    paidAt: '2026-07-12T10:00:00.000Z',
    externalId: 'trx-paid-1'
  }, {
    username: 'payment-gateway',
    name: 'Payment Gateway'
  });

  assert.equal(fulfilled.vouchers.length, 2);
  assert.equal(data.paymentGatewayTransactions.length, 1);
  assert.equal(data.paymentGatewayTransactions[0].status, 'paid');
  assert.equal(data.paymentGatewayTransactions[0].reference, order.reference);
  assert.equal(data.paymentGatewayTransactions[0].amount, 10820);
  assert.equal(data.paymentGatewayTransactions[0].fee, 820);
});

test('tripay webhook path and callback signature are accepted', () => {
  const data = createDefaultStore();
  data.settings.paymentGateway.provider = 'tripay';
  data.settings.paymentGateway.tripay.privateKey = 'tripay-private';
  const raw = JSON.stringify({
    merchant_ref: 'VO-20260713-001',
    reference: 'T0001',
    status: 'PAID',
    total_amount: 10000
  });
  const signature = crypto.createHmac('sha256', data.settings.paymentGateway.tripay.privateKey).update(raw).digest('hex');

  assert.equal(serverInternals.isPaymentGatewayWebhookPath('/tripay/webhook'), true);
  assert.equal(serverInternals.isPaymentGatewayWebhookPath('/api/public/payment-gateway/qris/callback'), true);
  assert.equal(serverInternals.paymentGatewayPayloadMerchantReference(JSON.parse(raw)), 'VO-20260713-001');
  assert.doesNotThrow(() => serverInternals.verifyPaymentGatewayCallback({
    headers: {
      'x-callback-signature': signature
    }
  }, JSON.parse(raw), data.settings.paymentGateway, raw));
  assert.throws(() => serverInternals.verifyPaymentGatewayCallback({
    headers: {
      'x-callback-signature': 'bad-signature'
    }
  }, JSON.parse(raw), data.settings.paymentGateway, raw), /Signature callback/);
});

test('unified payment gateway callback pays monthly invoice without duplicating payment', () => {
  const data = createDefaultStore();
  data.settings.paymentGateway.enabled = true;
  data.settings.paymentGateway.provider = 'tripay';
  data.settings.paymentGateway.callbackUrl = 'https://billing.example.net/payment-gateway/webhook';
  data.settings.paymentGateway.monthlyAdminFee = 2500;
  data.customers.push({
    id: 'cus-gateway-1',
    username: 'pppoe-gateway',
    name: 'Pelanggan Gateway',
    phone: '628123456789',
    packageName: 'Paket Bulanan',
    status: 'isolir',
    price: 100000,
    dueDay: 10,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  });
  data.radiusUsers.push({
    id: 'rad-gateway-1',
    customerId: 'cus-gateway-1',
    username: 'pppoe-gateway',
    serviceType: 'pppoe',
    status: 'isolated',
    isolatedAt: '2026-07-10',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z'
  });
  data.invoices.push({
    id: 'inv-gateway-1',
    source: 'generated',
    externalId: '000321',
    invoiceNo: '000321',
    customerId: 'cus-gateway-1',
    customerName: 'Pelanggan Gateway',
    username: 'pppoe-gateway',
    packageName: 'Paket Bulanan',
    period: '2026-07',
    coveredPeriods: ['2026-07'],
    amount: 100000,
    dueDate: '2026-07-10',
    status: 'pending',
    paidAt: '',
    paymentMethod: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  });

  const first = serverInternals.fulfillPaymentGatewayCallback(data, {
    merchant_ref: '000321',
    reference: 'T-GATEWAY-1',
    status: 'PAID',
    total_amount: 102500,
    payment_method: 'BRIVA',
    paid_at: '2026-07-13T04:00:00.000Z'
  }, {
    username: 'payment-gateway',
    name: 'Payment Gateway'
  });

  assert.equal(first.type, 'monthly-package');
  assert.equal(first.reference, '000321');
  assert.equal(data.invoices[0].status, 'paid');
  assert.equal(data.invoices[0].paymentMethod, 'BRIVA');
  assert.equal(data.customers[0].status, 'active');
  assert.equal(data.radiusUsers[0].status, 'active');
  assert.equal(data.payments.length, 1);
  assert.equal(data.payments[0].amount, 100000);
  assert.equal(data.paymentGatewayTransactions.length, 1);
  assert.equal(data.paymentGatewayTransactions[0].transactionKind, 'monthly-package');
  assert.equal(data.paymentGatewayTransactions[0].reference, '000321');
  assert.equal(data.paymentGatewayTransactions[0].externalId, 'T-GATEWAY-1');
  assert.equal(data.paymentGatewayTransactions[0].amount, 102500);
  assert.equal(data.paymentGatewayTransactions[0].fee, 2500);
  const publicInvoice = serverInternals.publicPaymentGatewayInvoicePayload(data, data.invoices[0]);
  assert.equal(publicInvoice.gatewayAmount, 102500);
  assert.equal(publicInvoice.adminFee, 2500);
  assert.equal(publicInvoice.paymentGatewayLink, 'https://billing.example.net/payment-invoice.html?id=000321');

  const second = serverInternals.fulfillPaymentGatewayCallback(data, {
    merchant_ref: '000321',
    reference: 'T-GATEWAY-1',
    status: 'PAID',
    total_amount: 102500,
    payment_method: 'BRIVA',
    paid_at: '2026-07-13T04:00:00.000Z'
  }, {
    username: 'payment-gateway',
    name: 'Payment Gateway'
  });

  assert.equal(second.reused, true);
  assert.equal(data.payments.length, 1);
  assert.equal(data.paymentGatewayTransactions.length, 1);
});

test('payment gateway payment does not auto activate manually terminated customer', () => {
  const data = createDefaultStore();
  data.settings.paymentGateway.enabled = true;
  data.settings.paymentGateway.provider = 'tripay';
  data.customers.push({
    id: 'cus-term-manual-pay',
    username: 'term-manual-pay',
    name: 'Terminated Manual Pay',
    phone: '081234567890',
    packageName: 'Paket Bulanan',
    status: 'terminate',
    terminationSource: 'manual',
    price: 100000
  });
  data.radiusUsers.push({
    id: 'rad-term-manual-pay',
    customerId: 'cus-term-manual-pay',
    username: 'term-manual-pay',
    serviceType: 'pppoe',
    status: 'terminated',
    terminationSource: 'manual'
  });
  data.invoices.push({
    id: 'inv-term-manual-pay',
    source: 'generated',
    externalId: '000411',
    invoiceNo: '000411',
    customerId: 'cus-term-manual-pay',
    customerName: 'Terminated Manual Pay',
    username: 'term-manual-pay',
    packageName: 'Paket Bulanan',
    period: '2026-07',
    coveredPeriods: ['2026-07'],
    amount: 100000,
    dueDate: '2026-07-10',
    status: 'pending',
    paidAt: '',
    paymentMethod: ''
  });

  const result = serverInternals.fulfillPaymentGatewayCallback(data, {
    merchant_ref: '000411',
    reference: 'T-MANUAL-TERM',
    status: 'PAID',
    total_amount: 100000,
    payment_method: 'QRIS',
    paid_at: '2026-07-13T04:00:00.000Z'
  }, {
    username: 'payment-gateway',
    name: 'Payment Gateway'
  });

  assert.equal(result.type, 'monthly-package');
  assert.equal(data.invoices[0].status, 'paid');
  assert.equal(data.customers[0].status, 'terminate');
  assert.equal(data.radiusUsers[0].status, 'terminated');
  assert.equal(data.activity.some((item) => item.meta?.action === 'terminated-payment-awaiting-admin'), true);
});

test('payment gateway payment auto activates billing-terminated customer after all invoices paid', () => {
  const data = createDefaultStore();
  data.settings.paymentGateway.enabled = true;
  data.settings.paymentGateway.provider = 'tripay';
  data.customers.push({
    id: 'cus-term-billing-pay',
    username: 'term-billing-pay',
    name: 'Terminated Billing Pay',
    phone: '081234567891',
    packageName: 'Paket Bulanan',
    status: 'terminate',
    terminationSource: 'billing',
    price: 100000
  });
  data.radiusUsers.push({
    id: 'rad-term-billing-pay',
    customerId: 'cus-term-billing-pay',
    username: 'term-billing-pay',
    serviceType: 'pppoe',
    status: 'terminated',
    terminationSource: 'billing'
  });
  data.invoices.push({
    id: 'inv-term-billing-pay',
    source: 'generated',
    externalId: '000412',
    invoiceNo: '000412',
    customerId: 'cus-term-billing-pay',
    customerName: 'Terminated Billing Pay',
    username: 'term-billing-pay',
    packageName: 'Paket Bulanan',
    period: '2026-07',
    coveredPeriods: ['2026-07'],
    amount: 100000,
    dueDate: '2026-07-10',
    status: 'pending',
    paidAt: '',
    paymentMethod: ''
  });

  const result = serverInternals.fulfillPaymentGatewayCallback(data, {
    merchant_ref: '000412',
    reference: 'T-BILLING-TERM',
    status: 'PAID',
    total_amount: 100000,
    payment_method: 'QRIS',
    paid_at: '2026-07-13T04:00:00.000Z'
  }, {
    username: 'payment-gateway',
    name: 'Payment Gateway'
  });

  assert.equal(result.type, 'monthly-package');
  assert.equal(data.invoices[0].status, 'paid');
  assert.equal(data.customers[0].status, 'active');
  assert.equal(data.radiusUsers[0].status, 'active');
});

test('auth creates default admin and protects admin role', () => {
  const data = createDefaultStore();

  assert.equal(ensureDefaultUsers(data), true);
  assert.equal(data.users.length, 1);
  assert.equal(data.users[0].role, 'admin');
  assert.equal(verifyPassword('billing123', data.users[0].passwordHash), true);
  assert.equal(hasPermission(publicUser(data.users[0]), 'users:manage'), true);
  assert.equal(hasPermission(publicUser(data.users[0]), 'settings:write'), true);
  assert.equal(hasPermission(publicUser(data.users[0]), 'xendit:read'), true);
  assert.equal(hasPermission(publicUser(data.users[0]), 'xendit:balance'), true);
  assert.equal(hasPermission(publicUser(data.users[0]), 'xendit:withdraw'), true);
  assert.equal(hasPermission(publicUser(data.users[0]), 'radius:read'), true);
  assert.equal(hasPermission(publicUser(data.users[0]), 'radius:write'), true);

  const owner = createUser(data, {
    username: 'owner',
    name: 'Owner',
    role: 'owner',
    password: 'rahasia0'
  });

  assert.equal(owner.role, 'owner');
  assert.equal(hasPermission(publicUser(data.users[1]), 'dashboard:read'), true);
  assert.equal(hasPermission(publicUser(data.users[1]), 'reports:daily:read'), true);
  assert.equal(hasPermission(publicUser(data.users[1]), 'billing-monitor:read'), true);
  assert.equal(hasPermission(publicUser(data.users[1]), 'xendit:read'), true);
  assert.equal(hasPermission(publicUser(data.users[1]), 'xendit:balance'), true);
  assert.equal(hasPermission(publicUser(data.users[1]), 'xendit:withdraw'), true);
  assert.equal(hasPermission(publicUser(data.users[1]), 'radius:read'), true);
  assert.equal(hasPermission(publicUser(data.users[1]), 'radius:write'), true);
  assert.equal(hasPermission(publicUser(data.users[1]), 'settings:write'), false);
  assert.equal(hasPermission(publicUser(data.users[1]), 'users:manage'), false);

  const finance = createUser(data, {
    username: 'kasir',
    name: 'Kasir',
    role: 'finance',
    password: 'rahasia1'
  });

  assert.equal(finance.role, 'finance');
  assert.equal(hasPermission(publicUser(data.users[2]), 'expenses:write'), true);
  assert.equal(hasPermission(publicUser(data.users[2]), 'reports:daily:read'), true);
  assert.equal(hasPermission(publicUser(data.users[2]), 'billing-monitor:read'), true);
  assert.equal(hasPermission(publicUser(data.users[2]), 'xendit:read'), true);
  assert.equal(hasPermission(publicUser(data.users[2]), 'xendit:balance'), false);
  assert.equal(hasPermission(publicUser(data.users[2]), 'xendit:withdraw'), false);
  assert.equal(hasPermission(publicUser(data.users[2]), 'radius:read'), false);
  assert.equal(hasPermission(publicUser(data.users[2]), 'radius:write'), false);
  assert.equal(hasPermission(publicUser(data.users[2]), 'users:manage'), false);

  const technician = createUser(data, {
    username: 'teknisi',
    name: 'Teknisi Lapangan',
    role: 'technician',
    password: 'rahasia2'
  });

  assert.equal(technician.role, 'technician');
  assert.equal(hasPermission(publicUser(data.users[3]), 'dashboard:read'), true);
  assert.equal(hasPermission(publicUser(data.users[3]), 'inventory:write'), true);
  assert.equal(hasPermission(publicUser(data.users[3]), 'monitoring:check'), true);
  assert.equal(hasPermission(publicUser(data.users[3]), 'radius:read'), true);
  assert.equal(hasPermission(publicUser(data.users[3]), 'radius:ppp-users:write'), true);
  assert.equal(hasPermission(publicUser(data.users[3]), 'radius:hotspot-free:write'), true);
  assert.equal(hasPermission(publicUser(data.users[3]), 'radius:write'), false);
  assert.equal(hasPermission(publicUser(data.users[3]), 'members:read'), true);
  assert.equal(hasPermission(publicUser(data.users[3]), 'members:contact:write'), true);
  assert.equal(hasPermission(publicUser(data.users[3]), 'customers:manage'), false);
  assert.equal(hasPermission(publicUser(data.users[3]), 'expenses:read'), false);
  assert.equal(hasPermission(publicUser(data.users[3]), 'external-incomes:read'), false);
  assert.equal(hasPermission(publicUser(data.users[3]), 'reports:daily:read'), false);
  assert.equal(hasPermission(publicUser(data.users[3]), 'billing-monitor:read'), false);
  assert.equal(hasPermission(publicUser(data.users[3]), 'xendit:read'), false);
  assert.equal(hasPermission(publicUser(data.users[3]), 'xendit:withdraw'), false);
  const noc = createUser(data, {
    username: 'noc',
    name: 'NOC',
    role: 'noc',
    password: 'rahasia3'
  });
  const viewer = createUser(data, {
    username: 'viewer',
    name: 'Viewer',
    role: 'viewer',
    password: 'rahasia4'
  });
  const collector = createUser(data, {
    username: 'collector',
    name: 'Collector',
    role: 'collector',
    password: 'rahasia5'
  });
  assert.equal(noc.role, 'noc');
  assert.equal(viewer.role, 'viewer');
  assert.equal(collector.role, 'collector');
  assert.equal(hasPermission(publicUser(data.users[4]), 'dashboard:read'), true);
  assert.equal(hasPermission(publicUser(data.users[5]), 'dashboard:read'), true);
  assert.equal(hasPermission(publicUser(data.users[4]), 'radius:read'), true);
  assert.equal(hasPermission(publicUser(data.users[5]), 'radius:read'), true);
  assert.equal(hasPermission(publicUser(data.users[4]), 'radius:write'), true);
  assert.equal(hasPermission(publicUser(data.users[5]), 'radius:write'), false);
  assert.equal(hasPermission(publicUser(data.users[4]), 'xendit:read'), false);
  assert.equal(hasPermission(publicUser(data.users[5]), 'xendit:read'), false);
  assert.equal(hasPermission(publicUser(data.users[4]), 'xendit:withdraw'), false);
  assert.equal(hasPermission(publicUser(data.users[5]), 'xendit:withdraw'), false);
  assert.equal(hasPermission(publicUser(collector), 'reports:daily:read'), true);
  assert.equal(hasPermission(publicUser(collector), 'reports:voucher:read'), false);
  assert.equal(hasPermission(publicUser(collector), 'billing-monitor:read'), true);
  assert.equal(hasPermission(publicUser(collector), 'settings:write'), false);
  assert.throws(() => updateUser(data, data.users[0].id, { active: false }), /admin aktif/);
  assert.throws(() => deleteUser(data, data.users[0].id, data.users[1].id), /admin aktif/);
});
