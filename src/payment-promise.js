'use strict';

const crypto = require('node:crypto');
const { addActivity, invoiceBlocksPeriod, invoiceCoveredPeriods, invoiceRuntimeStatus } = require('./finance');

function dateKey(value = '') {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}

function nextMonthDate(value = '') {
  if (!dateKey(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  const end = new Date(Date.UTC(year, month + 1, 0));
  return `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, end.getUTCDate())).padStart(2, '0')}`;
}

function openInvoicesByCustomer(data = {}, today) {
  const paid = new Map();
  for (const invoice of data.invoices || []) {
    if (!invoice.customerId || invoiceRuntimeStatus(invoice, today) !== 'paid' || !invoiceBlocksPeriod(invoice)) continue;
    if (!paid.has(invoice.customerId)) paid.set(invoice.customerId, new Set());
    for (const period of invoiceCoveredPeriods(invoice)) paid.get(invoice.customerId).add(period);
  }
  const open = new Map();
  for (const invoice of data.invoices || []) {
    if (!invoice.customerId || !['pending', 'overdue'].includes(invoiceRuntimeStatus(invoice, today))) continue;
    if (!invoiceCoveredPeriods(invoice).some(period => !paid.get(invoice.customerId)?.has(period))) continue;
    if (!open.has(invoice.customerId)) open.set(invoice.customerId, []);
    open.get(invoice.customerId).push(invoice);
  }
  return open;
}

function evaluate(customer = {}, invoices = [], today) {
  const promise = customer.paymentPromise;
  if (!promise || !['active', 'broken'].includes(promise.status)
    || !dateKey(promise.date) || !dateKey(promise.anchorDueDate)
    || promise.maxDate !== nextMonthDate(promise.anchorDueDate) || promise.date > promise.maxDate
    || !Array.isArray(promise.invoiceIds) || !promise.invoiceIds.length) return null;
  const ids = new Set(promise.invoiceIds);
  const remaining = invoices.filter(invoice => ids.has(invoice.id));
  return {
    promise, remaining,
    holding: promise.status === 'active' && remaining.length > 0 && today <= promise.date,
    overdue: remaining.length > 0 && today > promise.date,
    coveredIds: ids
  };
}

function summary(customer = {}) {
  const promise = customer.paymentPromise;
  if (!promise) return null;
  return {
    id: promise.id, status: promise.status, date: promise.date,
    maxDate: promise.maxDate, anchorDueDate: promise.anchorDueDate,
    invoiceIds: promise.invoiceIds, note: promise.note || '',
    updatedAt: promise.updatedAt, updatedBy: promise.updatedBy || ''
  };
}

function preview(data, invoice, customer, user = {}, today) {
  if (data.settings?.billing?.paymentPromiseEnabled !== true) throw new Error('Fitur Janji Bayar belum diaktifkan di Billing Setting');
  const invoices = openInvoicesByCustomer(data, today).get(customer.id) || [];
  if (!invoices.some(item => item.id === invoice.id)) throw new Error('Janji bayar hanya untuk invoice yang belum lunas dan belum tercakup pembayaran lain');
  if (invoices.some(item => !dateKey(item.dueDate))) throw new Error('Periksa jatuh tempo seluruh tagihan pelanggan sebelum membuat janji bayar');
  const anchorDueDate = invoices.reduce((oldest, item) => !oldest || item.dueDate < oldest ? item.dueDate : oldest, '');
  const existing = evaluate(customer, invoices, today);
  const maxDate = existing ? [existing.promise.maxDate, nextMonthDate(anchorDueDate)].sort()[0] : nextMonthDate(anchorDueDate);
  const minDate = [today, invoice.dueDate].sort().at(-1);
  const revision = crypto.createHash('sha256').update(JSON.stringify({
    promise: customer.paymentPromise || null, customerStatus: customer.status, userStatus: user.status,
    override: customer.billingIsolationOverride === true || user.billingIsolationOverride === true,
    invoices: invoices.map(item => [item.id, item.dueDate, item.amount, item.status, item.updatedAt]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  })).digest('hex');
  return { invoices, anchorDueDate: existing?.promise.anchorDueDate || anchorDueDate, minDate, maxDate, revision, promise: summary(customer) };
}

function change(data, customer, promise, actor, action, before = null) {
  const now = new Date().toISOString();
  promise.updatedAt = now;
  promise.updatedBy = actor.name || actor.username || 'Billing';
  customer.paymentPromise = promise;
  customer.updatedAt = now;
  customer.updatedBy = promise.updatedBy;
  addActivity(data, 'invoice', `Janji bayar ${customer.name || customer.username || customer.id}: ${action}`, {
    action: `payment-promise-${action}`, customerId: customer.id,
    promiseId: promise.id, invoiceIds: promise.invoiceIds,
    date: promise.date, maxDate: promise.maxDate, note: promise.note || '',
    previous: before, status: promise.status,
    actorName: promise.updatedBy, actorUsername: actor.username || ''
  });
  return promise;
}

function save(data, invoice, customer, user, payload, actor, today, canAccessInvoice = () => true) {
  const context = preview(data, invoice, customer, user, today);
  if (!payload.revision || payload.revision !== context.revision) throw new Error('Data tagihan berubah. Tutup lalu buka ulang Janji Bayar');
  if (customer.billingIsolationOverride === true || user.billingIsolationOverride === true) {
    throw new Error('Pelanggan memiliki pengecualian isolir atau aktivasi manual tanpa batas. Nonaktifkan pengecualian terlebih dahulu jika ingin memakai batas janji bayar');
  }
  const statuses = [customer.status, user.status].map(value => String(value || '').toLowerCase());
  if (statuses.some(status => ['terminated', 'terminate', 'diberhentikan', 'inactive', 'disabled', 'disable', 'nonaktif', 'removed', 'cabut'].includes(status))) {
    throw new Error('Janji bayar tidak dapat mengaktifkan pelanggan terminated atau nonaktif');
  }
  if (statuses.some(status => ['isolated', 'isolir', 'suspend', 'suspended'].includes(status))
    && !['billing', 'overdue', 'system', 'auto'].includes(String(customer.isolationSource || user.isolationSource || '').toLowerCase())) {
    throw new Error('Isolir manual harus diselesaikan oleh petugas berwenang sebelum membuat janji bayar');
  }
  const date = dateKey(payload.date);
  if (!date || date < context.minDate || date > context.maxDate) {
    throw new Error(`Tanggal janji harus antara ${context.minDate} dan ${context.maxDate}; maksimal satu bulan dari jatuh tempo tertua`);
  }
  const invoices = context.invoices.filter(item => item.dueDate <= date);
  if (invoices.some(item => !canAccessInvoice(item))) throw new Error('Ada tagihan di luar kewenangan penagihan Anda');
  const previous = summary(customer);
  const editing = customer.paymentPromise?.status === 'active';
  const promise = {
    id: editing ? customer.paymentPromise.id : `promise_${crypto.randomUUID()}`,
    status: 'active', date, anchorDueDate: context.anchorDueDate, maxDate: nextMonthDate(context.anchorDueDate),
    invoiceIds: invoices.map(item => item.id), note: String(payload.note || '').trim().slice(0, 500),
    createdAt: editing ? customer.paymentPromise.createdAt : new Date().toISOString(),
    createdBy: editing ? customer.paymentPromise.createdBy : actor.name || actor.username || '',
    createdByUsername: editing ? customer.paymentPromise.createdByUsername : actor.username || ''
  };
  change(data, customer, promise, actor, editing ? 'updated' : 'created', previous);
  return promise;
}

function cancel(data, customer, actor, reason = 'Dibatalkan petugas') {
  if (customer.paymentPromise?.status !== 'active') throw new Error('Tidak ada janji bayar aktif untuk dibatalkan');
  const before = summary(customer);
  return change(data, customer, { ...customer.paymentPromise, status: 'cancelled', closedAt: new Date().toISOString(), closedReason: reason }, actor, 'cancelled', before);
}

function reconcile(data, actor, today, isolationTimeReady, open = openInvoicesByCustomer(data, today)) {
  const changed = [];
  for (const customer of data.customers || []) {
    const state = evaluate(customer, open.get(customer.id) || [], today);
    if (!state) continue;
    let status = '';
    if (!state.remaining.length) status = 'completed';
    else if (data.settings?.billing?.paymentPromiseEnabled !== true && state.promise.status === 'active') status = 'cancelled';
    else if (state.overdue && isolationTimeReady && state.promise.status === 'active') status = 'broken';
    if (!status) continue;
    change(data, customer, { ...state.promise, status, closedAt: new Date().toISOString() }, actor, status, summary(customer));
    changed.push(customer);
  }
  return changed;
}

module.exports = { dateKey, nextMonthDate, openInvoicesByCustomer, evaluate, summary, preview, save, cancel, reconcile };
