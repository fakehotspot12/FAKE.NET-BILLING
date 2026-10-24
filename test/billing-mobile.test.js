'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
const scheduleCode = source.slice(source.indexOf('function billingCollectionSchedule('), source.indexOf('async function renderMonitoringBilling('));
function schedule(invoice = {}, config = { suspendGraceDays: 5, isolationTime: '13:30' }, enabled = true) {
  const context = vm.createContext({ MONTH_LABELS: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], dateText: value => value || '-' });
  vm.runInContext(scheduleCode, context);
  return context.billingCollectionSchedule({ id: 'invoice-test', status: 'unpaid', dueDate: '2026-10-25', ...invoice }, config, enabled);
}
test('mobile rows show the real normal due date and configured isolation, without needing a promise', () => {
  const result = schedule();
  assert.equal(result.main, 'Jatuh Tempo 25 Okt');
  assert.equal(result.isolation, 'Isolir 30 Okt 13:30');
  assert.equal(schedule({}, { suspendGraceDays: 2, isolationTime: '08:15' }).isolation, 'Isolir 27 Okt 08:15');
});
test('only a saved, enabled promise covering this unpaid invoice replaces the normal schedule', () => {
  const paymentPromise = { date: '2026-10-30', status: 'active', invoiceIds: ['invoice-test'] };
  assert.equal(schedule({ paymentPromise }).main, 'Janji Bayar 30 Okt');
  assert.equal(schedule({ paymentPromise }).isolation, 'Isolir 31 Okt 13:30');
  for (const value of [{ ...paymentPromise, status: 'completed' }, { ...paymentPromise, status: 'cancelled' }, { ...paymentPromise, invoiceIds: ['another-invoice'] }]) {
    assert.equal(schedule({ paymentPromise: value }).main, 'Jatuh Tempo 25 Okt');
  }
  assert.equal(schedule({ paymentPromise }, undefined, false).main, 'Jatuh Tempo 25 Okt');
  assert.equal(schedule({ paymentPromise, status: 'paid' }).main, 'Jatuh Tempo 25 Okt');
});
test('calendar dates remain correct over month/year boundaries and leap days', () => {
  assert.equal(schedule({ dueDate: '2026-12-31' }).isolation, 'Isolir 5 Jan 13:30');
  assert.equal(schedule({ dueDate: '2028-02-28' }, { suspendGraceDays: 1, isolationTime: '09:00' }).isolation, 'Isolir 29 Feb 09:00');
  assert.equal(schedule({ paymentPromise: { date: '2026-10-31', status: 'broken', invoiceIds: ['invoice-test'] } }).isolation, 'Isolir 1 Nov 13:30');
});
test('exemptions, paid invoices, zero grace and missing dates never show an invented isolation date', () => {
  assert.equal(schedule({ billingIsolationOverride: true }).isolation, 'Dikecualikan dari isolir');
  assert.equal(schedule({ status: 'paid' }).isolation, '');
  assert.equal(schedule({}, { suspendGraceDays: 0, isolationTime: '13:30' }).isolation, 'Isolir otomatis nonaktif');
  for (const dueDate of ['', 'bad', '2026-02-30']) {
    const result = schedule({ dueDate, invoiceDate: '2026-10-24' });
    assert.equal(result.main, 'Jatuh Tempo -'); assert.equal(result.isolation, '');
  }
});
test('schedule formatting never changes invoice, promise or billing configuration', () => {
  const invoice = { dueDate: '2026-10-25', amount: 150000, paymentPromise: { date: '2026-10-30', status: 'active', invoiceIds: ['invoice-test'] } };
  const config = { suspendGraceDays: 5, isolationTime: '13:30' };
  const before = JSON.stringify([invoice, config]); schedule(invoice, config);
  assert.equal(JSON.stringify([invoice, config]), before);
});
test('mobile quick filters use collectible invoices, preserve other filters and reset pagination', () => {
  const start = source.indexOf("app.querySelectorAll('[data-billing-mobile-category]')");
  const code = source.slice(start, source.indexOf('  const selectedBillingInvoices', start));
  for (const category of ['all', 'isolated', 'terminate']) {
    let click, render;
    const state = { monitoringBillingPage: 3, monitoringBillingStatus: 'paid', monitoringBillingCustomerStatus: 'active', monitoringBillingSite: 'nas-test', monitoringBillingPeriod: '2026-10', search: 'test' };
    vm.runInNewContext(code, { state, renderMonitoringBilling: options => { render = options; }, app: { querySelectorAll: () => [{ dataset: { billingMobileCategory: category }, addEventListener: (event, handler) => { click = handler; } }] } });
    click(); assert.equal(state.monitoringBillingStatus, 'collectible');
    assert.equal(state.monitoringBillingCustomerStatus, category); assert.equal(state.monitoringBillingPage, 1);
    assert.equal(state.monitoringBillingSite, 'nas-test'); assert.equal(state.monitoringBillingPeriod, '2026-10'); assert.equal(state.search, 'test');
    assert.equal(render.silent, true);
  }
  assert.match(source, /\['all', 'Tagihan Aktif'\], \['isolated', 'Isolir'\], \['terminate', 'Terminated'\]/);
  assert.match(source, /payload\.collectionCounts\?\.\[value\]/);
});
test('counts cover all matching open invoices before category and page selection, not customer accounts', () => {
  const route = server.slice(server.indexOf("if (method === 'GET' && pathname === '/api/monitoring/billing-unpaid')"));
  const start = route.indexOf("      if (!userIsCollector(authContext.user) && site !== 'all')");
  const code = route.slice(start, route.indexOf('      const pagination =', start));
  const rows = [
    { id: 'a', status: 'unpaid', customerStatus: 'active', siteId: 'nas-a' },
    { id: 'b', status: 'overdue', customerStatus: 'isolated', siteId: 'nas-a' },
    { id: 'c', status: 'unpaid', customerStatus: 'terminate', siteId: 'nas-a' },
    { id: 'd', status: 'paid', customerStatus: 'isolated', siteId: 'nas-a' },
    { id: 'e', status: 'cancelled', customerStatus: 'terminate', siteId: 'nas-a' },
    { id: 'f', status: 'unpaid', customerStatus: 'isolated', siteId: 'nas-b' }
  ];
  for (const customerStatus of ['all', 'isolated', 'terminate']) {
    const context = vm.createContext({ rows: structuredClone(rows), status: 'collectible', customerStatus, site: 'nas-a', search: '', authContext: { user: {} }, userIsCollector: () => false, filterPreparedSearch: items => items });
    vm.runInContext(`${code}\nresult = { rows, collectionCounts };`, context);
    assert.equal(JSON.stringify(context.result.collectionCounts), JSON.stringify({ all: 3, isolated: 1, terminate: 1 }));
    assert.equal(context.result.rows.length, customerStatus === 'all' ? 3 : 1);
  }
  assert.match(route, /invoices: rows\.slice\(offset, offset \+ limit\)/);
  assert.match(route, /billingSchedule: \{[\s\S]*?suspendGraceDays:[\s\S]*?isolationTime:/);
});
