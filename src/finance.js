'use strict';

const { createId } = require('./store');

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function todayIso() {
  const parts = localDateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentPeriod() {
  const parts = localDateParts();
  return `${parts.year}-${parts.month}`;
}

function isPeriod(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ''));
}

function normalizePeriod(value) {
  return isPeriod(value) ? value : currentPeriod();
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  let cleaned = String(value || '').trim().replace(/[^\d,.-]/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    const decimalSeparator = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
    const thousandSeparator = decimalSeparator === ',' ? '.' : ',';
    cleaned = cleaned
      .replace(new RegExp(`\\${thousandSeparator}`, 'g'), '')
      .replace(decimalSeparator, '.');
  } else if (hasComma) {
    const parts = cleaned.split(',');
    cleaned = parts.at(-1).length === 3 && parts.length > 1
      ? parts.join('')
      : cleaned.replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    cleaned = parts.at(-1).length === 3 && parts.length > 1
      ? parts.join('')
      : cleaned;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampDay(day) {
  const parsed = Number(day);
  if (!Number.isFinite(parsed)) {
    return 10;
  }
  return Math.max(1, Math.min(31, Math.round(parsed)));
}

function billingDueDay(settings = {}) {
  return clampDay(settings?.billing?.postpaidDueDay || 10);
}

function normalizePaymentType(value = '') {
  const normalized = cleanText(value || 'postpaid').toLowerCase().replace(/[\s_-]+/g, '');
  if (['2', 'prepaid', 'prabayar', 'pra'].includes(normalized)) return 'prepaid';
  return 'postpaid';
}

function normalizeBillingPeriodForType(value = '', paymentType = 'postpaid') {
  const type = normalizePaymentType(paymentType);
  const normalized = cleanText(value || 'fixed').toLowerCase().replace(/[\s_-]+/g, '');
  let period = 'fixed';
  if (['2', 'cycle', 'billingcycle', 'siklus'].includes(normalized)) {
    period = 'cycle';
  } else if (['3', 'renewal', 'renew'].includes(normalized)) {
    period = 'renewal';
  }
  if (type === 'postpaid') {
    return period === 'cycle' ? 'cycle' : 'fixed';
  }
  return period === 'renewal' ? 'renewal' : 'fixed';
}

function billingMode(customer = {}) {
  const paymentType = normalizePaymentType(customer.paymentType || customer.type || 'postpaid');
  const billingPeriod = normalizeBillingPeriodForType(customer.billingPeriod || customer.method || 'fixed', paymentType);
  return { paymentType, billingPeriod };
}

function billingDueDayForCustomer(settings = {}, customer = {}) {
  const mode = billingMode(customer);
  if (mode.paymentType === 'postpaid' && mode.billingPeriod === 'cycle') {
    return billingDueDay(settings);
  }
  return clampDay(customer.dueDay || billingDueDay(settings));
}

function firstPostpaidCycleDueDate(settings = {}, customer = {}) {
  const mode = billingMode(customer);
  if (mode.paymentType !== 'postpaid' || mode.billingPeriod !== 'cycle') return '';
  const activeDate = isoDateFromText(customer.activeDate || customer.installedAt || customer.createdAt || '');
  if (!activeDate) return '';
  const activePeriod = periodFromDateText(activeDate);
  const dueDay = billingDueDay(settings);
  const dueThisPeriod = dueDateForPeriod(activePeriod, dueDay);
  return activeDate <= dueThisPeriod
    ? dueThisPeriod
    : dueDateForPeriod(addMonthsToPeriod(activePeriod, 1), dueDay);
}

function postpaidCycleProrationInfo(settings = {}, customer = {}, period = currentPeriod()) {
  const activeDate = isoDateFromText(customer.activeDate || customer.installedAt || customer.createdAt || '');
  const firstDueDate = firstPostpaidCycleDueDate(settings, customer);
  if (!activeDate || !firstDueDate) return null;
  const selectedPeriod = normalizePeriod(period);
  const firstPeriod = periodFromDateText(firstDueDate);
  if (selectedPeriod !== firstPeriod) return null;
  const usedDays = Math.min(30, inclusiveDaysBetween(activeDate, firstDueDate));
  if (usedDays <= 0 || usedDays >= 30) return null;
  return {
    type: 'postpaid-cycle-first',
    startDate: activeDate,
    endDate: firstDueDate,
    usedDays,
    baseDays: 30,
    ratio: usedDays / 30
  };
}

function customerFirstInvoiceUnpaid(customer = {}) {
  const candidates = [
    customer.firstInvoiceStatus,
    customer.initialInvoiceStatus,
    customer.memberInvoiceStatus,
    customer.invoiceStatus,
    customer.paymentStatus
  ].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
  return candidates.some((status) => ['unpaid', 'pending', 'belum bayar'].includes(status));
}

function dueDateForPeriod(period, day) {
  const safePeriod = normalizePeriod(period);
  const [year, month] = safePeriod.split('-').map((item) => Number(item));
  const daysInMonth = new Date(Date.UTC(year || 1970, month || 1, 0)).getUTCDate();
  return `${safePeriod}-${String(Math.min(clampDay(day), daysInMonth)).padStart(2, '0')}`;
}

function addMonthsToPeriod(period = currentPeriod(), offset = 0) {
  const safePeriod = normalizePeriod(period);
  const [year, month] = safePeriod.split('-').map((item) => Number(item));
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1 + Math.trunc(Number(offset) || 0), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function invoiceCoveredPeriods(invoice = {}) {
  const periods = Array.isArray(invoice.coveredPeriods)
    ? invoice.coveredPeriods
    : [];
  const normalized = periods
    .map((period) => String(period || '').trim())
    .filter(isPeriod);
  if (normalized.length) {
    return [...new Set(normalized)];
  }
  return isPeriod(invoice.period) ? [invoice.period] : [];
}

function invoiceBlocksPeriod(invoice = {}) {
  return normalizeStatus(invoice.status) !== 'cancelled';
}

function cleanText(value) {
  return String(value || '').trim();
}

const DEFAULT_BILLING_INVOICE_FORMAT = 'XXXXXX';

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function receiptBusinessCodeFromSettings(settings = {}) {
  const configured = cleanText(settings.receiptBusinessCode || settings.billing?.invoiceBusinessCode || settings.invoiceBusinessCode);
  if (configured) return configured.toUpperCase();
  const source = cleanText(settings.businessName || 'FAKE.NET');
  const domainLike = (source.match(/[a-z0-9.-]+\.[a-z]{2,}/i) || [])[0];
  const fallback = domainLike || source.split(/\s+/)[0] || 'FAKE.NET';
  return fallback.replace(/[^a-z0-9.-]+/gi, '').toUpperCase() || 'FAKE.NET';
}

function formatBillingInvoiceNumber(data = {}, sequence = 1) {
  const number = Math.max(1, Math.trunc(Number(sequence) || 1));
  return DEFAULT_BILLING_INVOICE_FORMAT
    .replace(/X+/g, (match) => String(number).padStart(match.length, '0'));
}

function invoiceSequenceFromText(value = '') {
  const text = String(value || '');
  const paymentMatch = text.match(/Payment\s+INV\s*#\s*(\d+)/i);
  if (paymentMatch) return Number(paymentMatch[1]) || 0;
  const hashMatch = text.match(/#\s*(\d+)/);
  if (hashMatch) return Number(hashMatch[1]) || 0;
  const leadingMatch = text.match(/^(\d+)/);
  return leadingMatch ? Number(leadingMatch[1]) || 0 : 0;
}

function nextBillingInvoiceSequence(data = {}) {
  return (data.invoices || []).reduce((highest, invoice) => {
    return Math.max(
      highest,
      Number(invoice.invoiceSeq || 0) || 0,
      invoiceSequenceFromText(invoice.invoiceNo),
      invoiceSequenceFromText(invoice.externalId)
    );
  }, 0) + 1;
}

function nextBillingInvoiceNumber(data = {}, period = currentPeriod()) {
  const invoiceSeq = nextBillingInvoiceSequence(data);
  return {
    invoiceSeq,
    invoiceNo: formatBillingInvoiceNumber(data, invoiceSeq, period)
  };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').toLowerCase());
}

function taxFields(payload = {}, fallback = {}) {
  const rawSubtotal = hasOwn(payload, 'subtotal')
    ? payload.subtotal
    : hasOwn(payload, 'baseAmount')
      ? payload.baseAmount
      : hasOwn(payload, 'amount')
        ? payload.amount
        : fallback.subtotal ?? fallback.amount;
  const rawEnabled = hasOwn(payload, 'taxEnabled')
    ? payload.taxEnabled
    : hasOwn(payload, 'ppnEnabled')
      ? payload.ppnEnabled
      : hasOwn(payload, 'includePpn')
        ? payload.includePpn
        : hasOwn(payload, 'enablePpn')
          ? payload.enablePpn
          : fallback.taxEnabled;
  const rawRate = hasOwn(payload, 'taxRate')
    ? payload.taxRate
    : hasOwn(payload, 'ppnRate')
      ? payload.ppnRate
      : hasOwn(payload, 'vatRate')
        ? payload.vatRate
        : fallback.taxRate;
  const subtotal = Math.max(0, toNumber(rawSubtotal));
  const taxEnabled = toBoolean(rawEnabled);
  const taxRate = taxEnabled ? Math.max(0, Math.min(100, toNumber(rawRate))) : 0;
  const taxAmount = taxEnabled ? Math.round(subtotal * taxRate / 100) : 0;
  return {
    subtotal,
    taxEnabled,
    taxRate,
    taxAmount,
    amount: subtotal + taxAmount
  };
}

function normalizeExpenseCategory(value) {
  const category = cleanText(value || 'Operasional');
  return category.toLowerCase() === 'teknisi' ? 'Gaji' : category;
}

function normalizeIncomeCategory(value) {
  return cleanText(value || 'Barang/Jasa');
}

function lineQuantity(item = {}, fallback = {}) {
  const raw = hasOwn(item, 'quantity')
    ? item.quantity
    : hasOwn(item, 'qty')
      ? item.qty
      : hasOwn(item, 'pcs')
        ? item.pcs
        : fallback.quantity ?? fallback.qty ?? fallback.pcs ?? 1;
  const quantity = toNumber(raw);
  return quantity > 0 ? quantity : 1;
}

function linePrice(item = {}, quantity = 1, fallback = {}) {
  if (hasOwn(item, 'unitPrice')) return toNumber(item.unitPrice);
  if (hasOwn(item, 'price')) return toNumber(item.price);
  if (hasOwn(item, 'unitAmount')) return toNumber(item.unitAmount);
  if (hasOwn(fallback, 'unitPrice')) return toNumber(fallback.unitPrice);
  const total = hasOwn(item, 'amount')
    ? toNumber(item.amount)
    : hasOwn(item, 'subtotal')
      ? toNumber(item.subtotal)
      : hasOwn(item, 'baseAmount')
        ? toNumber(item.baseAmount)
        : toNumber(fallback.amount || fallback.subtotal || fallback.baseAmount);
  return quantity > 0 ? total / quantity : total;
}

function normalizeIncomeItems(payload = {}, fallback = {}) {
  const sourceItems = Array.isArray(payload.items)
    ? payload.items
    : (Array.isArray(fallback.items) && !hasOwn(payload, 'amount') ? fallback.items : []);
  const items = sourceItems
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const quantity = lineQuantity(item);
      const unitPrice = linePrice(item, quantity);
      const amount = Math.round(quantity * unitPrice);
      return {
        id: item.id || createId('line'),
        category: normalizeIncomeCategory(item.category || payload.category || fallback.category),
        itemName: cleanText(item.itemName || item.name || item.description || `Item ${index + 1}`),
        description: cleanText(item.description),
        quantity,
        unitPrice,
        amount
      };
    })
    .filter((item) => item.amount > 0);

  if (items.length) {
    return items;
  }

  const quantity = lineQuantity(payload, fallback);
  const unitPrice = linePrice(payload, quantity, fallback);
  const amount = Math.round(quantity * unitPrice);
  if (amount <= 0) {
    return [];
  }

  return [{
    id: createId('line'),
    category: normalizeIncomeCategory(payload.category || fallback.category),
    itemName: cleanText(payload.itemName || fallback.itemName || payload.description || fallback.description || 'Pembayaran barang/jasa'),
    description: cleanText(payload.itemDescription || payload.description || fallback.description),
    quantity,
    unitPrice,
    amount
  }];
}

function incomeItemSummary(items) {
  if (!items.length) {
    return 'Pembayaran barang/jasa';
  }
  if (items.length === 1) {
    return items[0].itemName || 'Pembayaran barang/jasa';
  }
  const names = items.map((item) => item.itemName).filter(Boolean);
  return `${items.length} item: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', ...' : ''}`;
}

function incomeCategorySummary(items, fallback = 'Barang/Jasa') {
  const categories = [...new Set(items.map((item) => normalizeIncomeCategory(item.category)).filter(Boolean))];
  if (!categories.length) {
    return normalizeIncomeCategory(fallback);
  }
  if (categories.length === 1) {
    return categories[0];
  }
  return `${categories.length} kategori: ${categories.slice(0, 3).join(', ')}${categories.length > 3 ? ', ...' : ''}`;
}

function normalizeExpenseItems(payload = {}, fallback = {}) {
  const sourceItems = Array.isArray(payload.items)
    ? payload.items
    : (Array.isArray(fallback.items) && !hasOwn(payload, 'amount') ? fallback.items : []);
  const items = sourceItems
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const quantity = lineQuantity(item);
      const unitPrice = linePrice(item, quantity);
      const amount = Math.round(quantity * unitPrice);
      return {
        id: item.id || createId('line'),
        category: normalizeExpenseCategory(item.category || payload.category || fallback.category),
        itemName: cleanText(item.itemName || item.name || item.description || `Item ${index + 1}`),
        description: cleanText(item.description),
        quantity,
        unitPrice,
        amount
      };
    })
    .filter((item) => item.amount > 0);

  if (items.length) {
    return items;
  }

  const quantity = lineQuantity(payload, fallback);
  const unitPrice = linePrice(payload, quantity, fallback);
  const amount = Math.round(quantity * unitPrice);
  if (amount <= 0) {
    return [];
  }

  return [{
    id: createId('line'),
    category: normalizeExpenseCategory(payload.category || fallback.category),
    itemName: cleanText(payload.itemName || fallback.itemName || payload.description || fallback.description || payload.category || fallback.category || 'Pengeluaran'),
    description: cleanText(payload.itemDescription || payload.description || fallback.description),
    quantity,
    unitPrice,
    amount
  }];
}

function expenseItemSummary(items) {
  if (!items.length) {
    return 'Pengeluaran';
  }
  if (items.length === 1) {
    return items[0].itemName || 'Pengeluaran';
  }
  const names = items.map((item) => item.itemName).filter(Boolean);
  return `${items.length} item: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', ...' : ''}`;
}

function expenseCategorySummary(items, fallback = 'Operasional') {
  const categories = [...new Set(items.map((item) => normalizeExpenseCategory(item.category)).filter(Boolean))];
  if (!categories.length) {
    return normalizeExpenseCategory(fallback);
  }
  if (categories.length === 1) {
    return categories[0];
  }
  return `${categories.length} kategori: ${categories.slice(0, 3).join(', ')}${categories.length > 3 ? ', ...' : ''}`;
}

function expensePayee(payload = {}, fallback = {}) {
  return cleanText(
    payload.payee
    || payload.vendor
    || payload.recipient
    || payload.payeeName
    || fallback.payee
    || fallback.vendor
  );
}

function normalizeStatus(value) {
  const status = cleanText(value).toLowerCase();
  if (['paid', 'lunas', 'terbayar', 'success', 'settled'].includes(status)) {
    return 'paid';
  }
  if (['cancelled', 'canceled', 'batal', 'void'].includes(status)) {
    return 'cancelled';
  }
  if (['inactive', 'nonactive', 'isolir', 'suspend', 'suspended', 'terminate', 'terminated'].includes(status)) {
    return 'inactive';
  }
  if (['overdue', 'telat', 'jatuh tempo'].includes(status)) {
    return 'overdue';
  }
  if (['active', 'aktif', 'enabled'].includes(status)) {
    return 'active';
  }
  return status || 'pending';
}

function customerIsActive(customer) {
  const status = cleanText(customer.status).toLowerCase();
  if (['terminate', 'terminated', 'removed', 'cabut', 'disabled', 'disable'].includes(status)) return false;
  if (['isolir', 'isolated', 'suspend', 'suspended'].includes(status)) return true;
  return normalizeStatus(customer.status) === 'active';
}

function periodFromDateText(value = '') {
  const text = cleanText(value);
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}`;
  return '';
}

function isoDateFromText(value = '') {
  const text = cleanText(value);
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (local) {
    return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  }
  return '';
}

function dateToUtcMs(dateIso = '') {
  const [year, month, day] = String(dateIso || '').split('-').map(Number);
  if (!year || !month || !day) return NaN;
  return Date.UTC(year, month - 1, day);
}

function inclusiveDaysBetween(startIso = '', endIso = '') {
  const startMs = dateToUtcMs(startIso);
  const endMs = dateToUtcMs(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

function customerBillableInPeriod(customer = {}, period = currentPeriod()) {
  const activePeriod = periodFromDateText(customer.activeDate || customer.installedAt);
  if (!activePeriod) return true;
  return normalizePeriod(period) > activePeriod;
}

function externalIncomeIsActive(income) {
  return normalizeStatus(income.status) !== 'cancelled';
}

function paymentIsActive(payment) {
  return normalizeStatus(payment.status || 'paid') === 'paid';
}

function standaloneBillingSource(settings = {}) {
  const mode = cleanText(settings.appMode).toLowerCase();
  const source = cleanText(settings.billingSource).toLowerCase();
  return mode === 'standalone' || source === 'local';
}

function invoiceRuntimeStatus(invoice, referenceDate = todayIso()) {
  const status = normalizeStatus(invoice.status);
  if (status === 'paid' || status === 'cancelled') {
    return status;
  }
  if (invoice.dueDate && invoice.dueDate < referenceDate) {
    return 'overdue';
  }
  return 'pending';
}

function resolvePrice(settings, customer) {
  const direct = toNumber(customer.price);
  if (direct > 0) {
    return direct;
  }
  return toNumber(settings.packagePrices[customer.packageName]);
}

function percentValue(value) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  return Math.max(0, Math.min(100, toNumber(value)));
}

function billingAmountBreakdown(settings = {}, customer = {}, months = 1, options = {}) {
  const quantity = Math.max(1, Math.round(toNumber(months) || 1));
  const unitPrice = Math.max(0, Math.round(resolvePrice(settings, customer)));
  const subtotal = Math.max(0, Math.round(hasOwn(options, 'subtotal') ? toNumber(options.subtotal) : unitPrice * quantity));
  const discountRate = percentValue(customer.discount ?? customer.discountRate);
  const discountAmount = Math.round((subtotal * discountRate) / 100);
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const ppnRate = percentValue(customer.ppn ?? customer.vat ?? customer.taxRate);
  const ppnAmount = Math.round((taxableAmount * ppnRate) / 100);
  const total = Math.max(0, taxableAmount + ppnAmount);
  return {
    unitPrice,
    months: quantity,
    subtotal,
    baseAmount: subtotal,
    discountRate,
    discountAmount,
    taxableAmount,
    ppnRate,
    ppnAmount,
    vatRate: ppnRate,
    vatAmount: ppnAmount,
    taxRate: ppnRate,
    taxAmount: ppnAmount,
    total,
    totalAmount: total,
    amount: total,
    proration: options.proration || null
  };
}

function billingAmountBreakdownForPeriods(settings = {}, customer = {}, periods = []) {
  const selectedPeriods = Array.isArray(periods) && periods.length ? periods.map(normalizePeriod) : [currentPeriod()];
  const unitPrice = Math.max(0, Math.round(resolvePrice(settings, customer)));
  const prorations = [];
  const subtotal = selectedPeriods.reduce((total, period) => {
    const proration = postpaidCycleProrationInfo(settings, customer, period);
    if (!proration) return total + unitPrice;
    const proratedAmount = Math.round(unitPrice * proration.ratio);
    prorations.push({ ...proration, period, amount: proratedAmount, fullAmount: unitPrice });
    return total + proratedAmount;
  }, 0);
  return billingAmountBreakdown(settings, customer, selectedPeriods.length, {
    subtotal,
    proration: prorations[0] || null
  });
}

function addActivity(data, type, message, meta = {}) {
  data.activity.unshift({
    id: createId('act'),
    type,
    message,
    meta,
    at: new Date().toISOString()
  });
  data.activity = data.activity.slice(0, 80);
}

function summarize(data, period = currentPeriod()) {
  const selectedPeriod = normalizePeriod(period);
  const invoices = data.invoices.filter((invoice) => invoice.period === selectedPeriod);
  const expenses = data.expenses.filter((expense) => String(expense.date || '').startsWith(selectedPeriod));
  const externalIncomes = (data.externalIncomes || [])
    .filter((income) => String(income.date || '').startsWith(selectedPeriod) && externalIncomeIsActive(income));
  const legacyRemoteEarning = standaloneBillingSource(data.settings || {})
    ? null
    : latestMonthlyEarning(data, selectedPeriod, 'radboox');

  const invoicePaidRevenue = invoices
    .filter((invoice) => invoiceRuntimeStatus(invoice) === 'paid')
    .reduce((sum, invoice) => sum + toNumber(invoice.amount), 0);
  const radbooxRevenue = legacyRemoteEarning ? toNumber(legacyRemoteEarning.amount) : 0;
  const externalIncomeTotal = externalIncomes.reduce((sum, income) => sum + toNumber(income.amount), 0);
  const paidRevenue = invoicePaidRevenue + radbooxRevenue + externalIncomeTotal;
  const pendingRevenue = invoices
    .filter((invoice) => invoiceRuntimeStatus(invoice) === 'pending')
    .reduce((sum, invoice) => sum + toNumber(invoice.amount), 0);
  const overdueRevenue = invoices
    .filter((invoice) => invoiceRuntimeStatus(invoice) === 'overdue')
    .reduce((sum, invoice) => sum + toNumber(invoice.amount), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
  const activeCustomers = data.customers.filter(customerIsActive);
  const expectedRevenue = activeCustomers.reduce((sum, customer) => sum + resolvePrice(data.settings, customer), 0);

  return {
    period: selectedPeriod,
    activeCustomers: activeCustomers.length,
    totalCustomers: data.customers.length,
    expectedRevenue,
    invoicePaidRevenue,
    radbooxRevenue,
    externalIncomeTotal,
    lastRadbooxEarning: legacyRemoteEarning || null,
    paidRevenue,
    pendingRevenue,
    overdueRevenue,
    expenseTotal,
    netCash: paidRevenue - expenseTotal,
    invoiceCount: invoices.length,
    paidCount: invoices.filter((invoice) => invoiceRuntimeStatus(invoice) === 'paid').length,
    pendingCount: invoices.filter((invoice) => invoiceRuntimeStatus(invoice) === 'pending').length,
    overdueCount: invoices.filter((invoice) => invoiceRuntimeStatus(invoice) === 'overdue').length
  };
}

function latestMonthlyEarning(data, period = currentPeriod(), source = 'radboox') {
  return [...(data.monthlyEarnings || [])]
    .filter((earning) => earning.period === period && (!source || earning.source === source))
    .sort((a, b) => String(b.updatedAt || b.fetchedAt || '').localeCompare(String(a.updatedAt || a.fetchedAt || '')))[0] || null;
}

function isEmptyRadbooxEarning(incoming) {
  if (cleanText(incoming.source || 'radboox').toLowerCase() !== 'radboox') {
    return false;
  }
  if (toNumber(incoming.amount) !== 0 || toNumber(incoming.transactionCount) !== 0) {
    return false;
  }

  const note = cleanText(incoming.note).toLowerCase();
  if (note.includes('no income amount') || note.includes('kosong')) {
    return true;
  }

  const raw = incoming.raw && typeof incoming.raw === 'object' ? incoming.raw : {};
  const amountLikeFields = Object.entries(raw)
    .filter(([key]) => /jumlah|total|income|earning|pemasukan|pendapatan|paid|bayar/i.test(key));

  return amountLikeFields.length > 0 && amountLikeFields.every(([, value]) => toNumber(value) === 0);
}

function upsertMonthlyEarning(data, incoming) {
  const period = normalizePeriod(incoming.period);
  const source = cleanText(incoming.source || 'radboox') || 'radboox';
  const existing = (data.monthlyEarnings || []).find((earning) => earning.period === period && earning.source === source);
  const shouldLogActivity = !existing ||
    toNumber(existing.amount) !== toNumber(incoming.amount) ||
    toNumber(existing.transactionCount) !== toNumber(incoming.transactionCount) ||
    Boolean(existing.syncWarning);
  const now = new Date().toISOString();
  const next = {
    source,
    externalId: cleanText(incoming.externalId),
    period,
    amount: toNumber(incoming.amount),
    transactionCount: toNumber(incoming.transactionCount),
    note: cleanText(incoming.note),
    raw: incoming.raw && typeof incoming.raw === 'object' ? incoming.raw : {},
    fetchedAt: incoming.fetchedAt || now,
    updatedAt: now
  };

  if (existing && source === 'radboox' && toNumber(existing.amount) > 0 && isEmptyRadbooxEarning(next)) {
    existing.lastEmptySyncAt = now;
    existing.lastEmptySyncRaw = next.raw;
    existing.syncWarning = 'Radboox mengembalikan laporan kosong; nominal lama dipertahankan.';
    existing.updatedAt = now;
    addActivity(data, 'sync', `Monthly earning Radboox periode ${period} kosong, nominal lama dipertahankan`, {
      period,
      amount: toNumber(existing.amount)
    });
    return existing;
  }

  if (existing) {
    delete existing.lastEmptySyncAt;
    delete existing.lastEmptySyncRaw;
    delete existing.syncWarning;
    Object.assign(existing, next);
  } else {
    data.monthlyEarnings.push({
      id: createId('earn'),
      ...next,
      createdAt: now
    });
  }

  if (shouldLogActivity) {
    addActivity(data, 'sync', `Monthly earning Radboox periode ${period}: ${next.amount.toLocaleString('id-ID')}`, {
      period,
      amount: next.amount
    });
  }

  return existing || data.monthlyEarnings[data.monthlyEarnings.length - 1];
}

function generateInvoices(data, period = currentPeriod(), options = {}) {
  const selectedPeriod = normalizePeriod(period);
  const shouldGenerateCustomerInvoice = typeof options.shouldGenerateCustomerInvoice === 'function'
    ? options.shouldGenerateCustomerInvoice
    : null;
  const existingKeys = new Set();
  for (const invoice of data.invoices || []) {
    if (!invoice.customerId || !invoiceBlocksPeriod(invoice)) continue;
    for (const coveredPeriod of invoiceCoveredPeriods(invoice)) {
      existingKeys.add(`${invoice.customerId}:${coveredPeriod}`);
    }
  }
  const created = [];

  for (const customer of data.customers) {
    if (!customerIsActive(customer)) {
      continue;
    }
    const proration = postpaidCycleProrationInfo(data.settings, customer, selectedPeriod);
    if (proration && !customerFirstInvoiceUnpaid(customer)) {
      continue;
    }
    if (!customerBillableInPeriod(customer, selectedPeriod) && !proration) {
      continue;
    }
    const nextDuePeriod = periodFromDateText(customer.nextDue || customer.dueDate || '');
    if (nextDuePeriod && selectedPeriod < nextDuePeriod && !customerFirstInvoiceUnpaid(customer)) {
      continue;
    }

    const key = `${customer.id}:${selectedPeriod}`;
    if (existingKeys.has(key)) {
      continue;
    }

    const dueDate = dueDateForPeriod(selectedPeriod, billingDueDayForCustomer(data.settings, customer));
    if (shouldGenerateCustomerInvoice && !shouldGenerateCustomerInvoice(customer, { period: selectedPeriod, dueDate })) {
      continue;
    }

    const billingAmount = billingAmountBreakdownForPeriods(data.settings, customer, [selectedPeriod]);
    const amount = billingAmount.totalAmount;
    const numbering = nextBillingInvoiceNumber(data, selectedPeriod);
    const invoice = {
      id: createId('inv'),
      source: 'generated',
      externalId: numbering.invoiceNo,
      invoiceNo: numbering.invoiceNo,
      invoiceSeq: numbering.invoiceSeq,
      customerId: customer.id,
      customerName: customer.name || customer.username,
      username: customer.username || '',
      packageName: customer.packageName || '',
      period: selectedPeriod,
      coveredPeriods: [selectedPeriod],
      subPeriodMonths: 1,
      subtotal: billingAmount.subtotal,
      baseAmount: billingAmount.baseAmount,
      ppnRate: billingAmount.ppnRate,
      ppnAmount: billingAmount.ppnAmount,
      vatRate: billingAmount.vatRate,
      vatAmount: billingAmount.vatAmount,
      taxRate: billingAmount.taxRate,
      taxAmount: billingAmount.taxAmount,
      discountRate: billingAmount.discountRate,
      discountAmount: billingAmount.discountAmount,
      total: billingAmount.total,
      totalAmount: billingAmount.totalAmount,
      amount,
      dueDate,
      status: amount > 0 ? 'pending' : 'cancelled',
      paidAt: '',
      paymentMethod: '',
      prorated: Boolean(billingAmount.proration),
      proration: billingAmount.proration || null,
      notes: amount > 0
        ? (billingAmount.proration ? `Prorata ${billingAmount.proration.usedDays}/${billingAmount.proration.baseDays} hari` : '')
        : 'Tarif paket belum diatur',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.invoices.push(invoice);
    created.push(invoice);
    existingKeys.add(key);
  }

  if (created.length) {
    addActivity(data, 'invoice', `Membuat ${created.length} tagihan periode ${selectedPeriod}`, {
      period: selectedPeriod,
      count: created.length
    });
  }

  return created;
}

function upsertCustomers(data, incomingCustomers) {
  const byExternalId = new Map();
  const byUsername = new Map();

  for (const customer of data.customers) {
    if (customer.externalId) {
      byExternalId.set(String(customer.externalId), customer);
    }
    if (customer.username) {
      byUsername.set(customer.username.toLowerCase(), customer);
    }
  }

  let created = 0;
  let updated = 0;

  for (const incoming of incomingCustomers) {
    const externalKey = incoming.externalId ? String(incoming.externalId) : '';
    const usernameKey = incoming.username ? incoming.username.toLowerCase() : '';
    const existing = (externalKey && byExternalId.get(externalKey)) || (usernameKey && byUsername.get(usernameKey));

    const next = {
      source: 'radboox',
      externalId: externalKey,
      username: cleanText(incoming.username),
      name: cleanText(incoming.name) || cleanText(incoming.username),
      phone: cleanText(incoming.phone),
      address: cleanText(incoming.address),
      packageName: cleanText(incoming.packageName),
      price: toNumber(incoming.price),
      status: normalizeStatus(incoming.status || 'active'),
      dueDay: clampDay(incoming.dueDay || billingDueDay(data.settings)),
      lastSyncedAt: new Date().toISOString()
    };

    if (existing) {
      Object.assign(existing, next, {
        updatedAt: new Date().toISOString()
      });
      updated += 1;
    } else {
      const customer = {
        id: createId('cus'),
        ...next,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.customers.push(customer);
      if (externalKey) {
        byExternalId.set(externalKey, customer);
      }
      if (usernameKey) {
        byUsername.set(usernameKey, customer);
      }
      created += 1;
    }
  }

  if (created || updated) {
    addActivity(data, 'sync', `Sinkron pelanggan Radboox: ${created} baru, ${updated} diperbarui`, {
      created,
      updated
    });
  }

  return { created, updated };
}

function findCustomerForInvoice(data, incoming) {
  const externalCustomerId = cleanText(incoming.customerExternalId);
  const username = cleanText(incoming.username).toLowerCase();

  return data.customers.find((customer) => {
    if (externalCustomerId && String(customer.externalId) === externalCustomerId) {
      return true;
    }
    return username && cleanText(customer.username).toLowerCase() === username;
  });
}

function upsertInvoices(data, incomingInvoices) {
  const byExternalId = new Map();
  const byLogicalKey = new Map();

  for (const invoice of data.invoices) {
    if (invoice.externalId) {
      byExternalId.set(String(invoice.externalId), invoice);
    }
    byLogicalKey.set(`${invoice.username}:${invoice.period}`, invoice);
  }

  let created = 0;
  let updated = 0;

  for (const incoming of incomingInvoices) {
    const customer = findCustomerForInvoice(data, incoming);
    const period = normalizePeriod(incoming.period);
    const externalId = cleanText(incoming.externalId);
    const username = cleanText(incoming.username || (customer && customer.username));
    const logicalKey = `${username}:${period}`;
    const existing = (externalId && byExternalId.get(externalId)) || byLogicalKey.get(logicalKey);
    const status = normalizeStatus(incoming.status || 'pending');

    const next = {
      source: 'radboox',
      externalId,
      customerId: customer ? customer.id : '',
      customerName: cleanText(incoming.customerName || (customer && customer.name) || username),
      username,
      packageName: cleanText(incoming.packageName || (customer && customer.packageName)),
      period,
      amount: toNumber(incoming.amount || (customer && resolvePrice(data.settings, customer))),
      dueDate: incoming.dueDate || dueDateForPeriod(period, (customer && customer.dueDay) || billingDueDay(data.settings)),
      status,
      paidAt: incoming.paidAt || '',
      paymentMethod: cleanText(incoming.paymentMethod),
      notes: cleanText(incoming.notes)
    };

    if (existing) {
      Object.assign(existing, next, {
        updatedAt: new Date().toISOString()
      });
      updated += 1;
    } else {
      const invoice = {
        id: createId('inv'),
        ...next,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.invoices.push(invoice);
      if (externalId) {
        byExternalId.set(externalId, invoice);
      }
      byLogicalKey.set(logicalKey, invoice);
      created += 1;
    }
  }

  if (created || updated) {
    addActivity(data, 'sync', `Sinkron tagihan Radboox: ${created} baru, ${updated} diperbarui`, {
      created,
      updated
    });
  }

  return { created, updated };
}

function markInvoicePaid(data, invoiceId, payload = {}) {
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    return null;
  }
  if (invoiceRuntimeStatus(invoice) === 'cancelled') {
    throw new Error('Invoice yang sudah dibatalkan tidak bisa dibayar');
  }
  const existingPayment = (data.payments || []).find((payment) => (
    payment.invoiceId === invoice.id && paymentIsActive(payment)
  ));
  if (invoiceRuntimeStatus(invoice) === 'paid' && existingPayment) {
    return invoice;
  }

  invoice.status = 'paid';
  invoice.paidAt = payload.paidAt || todayIso();
  invoice.paymentMethod = cleanText(payload.paymentMethod || 'Tunai');
  invoice.paymentCategory = cleanText(payload.paymentCategory || invoice.paymentCategory);
  invoice.paidByName = cleanText(payload.createdByName || payload.actorName || payload.admin);
  invoice.paidByUsername = cleanText(payload.createdByUsername || payload.actorUsername);
  invoice.updatedAt = new Date().toISOString();

  if (!existingPayment) {
    data.payments.push({
      id: createId('pay'),
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      amount: toNumber(payload.amount || invoice.amount),
      baseAmount: toNumber(payload.baseAmount || invoice.amount),
      fee: toNumber(payload.fee || payload.adminFee),
      adminFee: toNumber(payload.adminFee || payload.fee),
      gatewayAmount: toNumber(payload.gatewayAmount || payload.amount || invoice.amount),
      providerFee: toNumber(payload.providerFee),
      cashierFee: toNumber(payload.cashierFee),
      provider: cleanText(payload.provider),
      paidAt: invoice.paidAt,
      method: invoice.paymentMethod,
      paymentCategory: cleanText(payload.paymentCategory),
      status: 'paid',
      notes: cleanText(payload.notes),
      createdByName: cleanText(payload.createdByName || payload.actorName || payload.admin),
      createdByUsername: cleanText(payload.createdByUsername || payload.actorUsername),
      createdByRole: cleanText(payload.createdByRole || payload.actorRole),
      createdAt: new Date().toISOString()
    });
  }

  const actorName = cleanText(payload.createdByName || payload.actorName || payload.admin);
  const invoiceNo = cleanText(invoice.invoiceNo || invoice.externalId || invoice.id);
  addActivity(data, 'payment', `Pembayaran ${invoice.customerName || invoice.username} dicatat${actorName ? ` oleh ${actorName}` : ''}`, {
    action: 'invoice-paid',
    invoiceId: invoice.id,
    invoiceNo,
    customerId: invoice.customerId || '',
    customerName: invoice.customerName || invoice.username || '',
    paymentMethod: invoice.paymentMethod,
    amount: toNumber(payload.amount || invoice.amount),
    actorName,
    actorUsername: cleanText(payload.createdByUsername || payload.actorUsername),
    actorRole: cleanText(payload.createdByRole || payload.actorRole)
  });

  return invoice;
}

function markInvoiceUnpaid(data, invoiceId) {
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    return null;
  }

  const now = new Date().toISOString();
  invoice.status = 'pending';
  invoice.paidAt = '';
  invoice.paymentMethod = '';
  invoice.paymentCategory = '';
  invoice.updatedAt = now;
  for (const payment of data.payments || []) {
    if (payment.invoiceId !== invoice.id || !paymentIsActive(payment)) continue;
    payment.status = 'void';
    payment.voidedAt = now;
    payment.voidReason = 'Rollback pembayaran';
    payment.updatedAt = now;
  }
  addActivity(data, 'invoice', `Tagihan ${invoice.customerName || invoice.username} dikembalikan ke belum bayar`, {
    invoiceId: invoice.id
  });
  return invoice;
}

function cancelInvoice(data, invoiceId, payload = {}) {
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) {
    return null;
  }

  const runtimeStatus = invoiceRuntimeStatus(invoice);
  if (runtimeStatus === 'paid') {
    throw new Error('Invoice yang sudah lunas tidak bisa dibatalkan');
  }
  if (runtimeStatus === 'cancelled') {
    return invoice;
  }

  const now = new Date().toISOString();
  const actorName = cleanText(payload.createdByName || payload.actorName || payload.admin || 'Admin');
  const actorUsername = cleanText(payload.createdByUsername || payload.actorUsername);
  const reason = cleanText(payload.reason || payload.notes || 'Invoice dibatalkan');
  invoice.status = 'cancelled';
  invoice.cancelledAt = now;
  invoice.cancelReason = reason;
  invoice.cancelledByName = actorName;
  invoice.cancelledByUsername = actorUsername;
  invoice.updatedAt = now;
  addActivity(data, 'invoice', `Invoice ${invoice.invoiceNo || invoice.externalId || invoice.id} dibatalkan oleh ${actorName || 'Admin'}`, {
    action: 'invoice-cancel',
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo || invoice.externalId || '',
    customerId: invoice.customerId || '',
    customerName: invoice.customerName || invoice.username || '',
    reason
  });
  return invoice;
}

function addManualCustomer(data, payload) {
  const customer = {
    id: createId('cus'),
    source: 'manual',
    externalId: '',
    username: cleanText(payload.username),
    name: cleanText(payload.name || payload.username),
    phone: cleanText(payload.phone),
    address: cleanText(payload.address),
    latitude: cleanText(payload.latitude || payload.lat || payload.memberLatitude),
    longitude: cleanText(payload.longitude || payload.lng || payload.memberLongitude),
    locationAccuracy: cleanText(payload.locationAccuracy || payload.memberLocationAccuracy),
    locationUrl: cleanText(payload.locationUrl || payload.mapUrl),
    packageName: cleanText(payload.packageName),
    price: toNumber(payload.price),
    status: normalizeStatus(payload.status || 'active'),
    dueDay: clampDay(payload.dueDay || billingDueDay(data.settings)),
    createdByName: cleanText(payload.createdByName || payload.actorName),
    createdByUsername: cleanText(payload.createdByUsername || payload.actorUsername),
    createdByRole: cleanText(payload.createdByRole || payload.actorRole),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSyncedAt: ''
  };
  data.customers.push(customer);
  addActivity(data, 'customer', `Pelanggan ${customer.name || customer.username} ditambahkan`);
  return customer;
}

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function receiptPartsFromDate(date = todayIso()) {
  const match = String(date || todayIso()).match(/^(\d{4})-(\d{2})/);
  const year = match ? match[1] : localDateParts().year;
  const month = match ? match[2] : localDateParts().month;
  return {
    year,
    month,
    romanMonth: ROMAN_MONTHS[Math.max(0, Math.min(11, Number(month) - 1))] || 'I'
  };
}

function receiptNumber(data, date = todayIso()) {
  const parts = receiptPartsFromDate(date);
  const code = receiptBusinessCodeFromSettings(data.settings || {});
  const suffix = `/INV-${code}/${parts.romanMonth}/${parts.year}`;
  const prefixPattern = new RegExp(`^(\\d+)/INV-${escapeRegExp(code)}/`);
  const maxNumber = (data.externalIncomes || [])
    .filter((income) => String(income.receiptNo || '').endsWith(suffix))
    .reduce((max, income) => {
      const match = String(income.receiptNo || '').match(prefixPattern);
      return Math.max(max, match ? Number(match[1]) || 0 : 0);
    }, 0);
  return `${String(maxNumber + 1).padStart(3, '0')}${suffix}`;
}

function addExternalIncome(data, payload) {
  const date = payload.date || todayIso();
  const items = normalizeIncomeItems(payload);
  const subtotal = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const tax = taxFields({ ...payload, amount: subtotal });
  const income = {
    id: createId('inc'),
    date,
    receiptNo: receiptNumber(data, date),
    category: incomeCategorySummary(items, payload.category),
    payerName: cleanText(payload.payerName || payload.customerName),
    itemName: incomeItemSummary(items),
    items,
    description: cleanText(payload.description),
    subtotal: tax.subtotal,
    taxEnabled: tax.taxEnabled,
    taxRate: tax.taxRate,
    taxAmount: tax.taxAmount,
    amount: tax.amount,
    paymentMethod: cleanText(payload.paymentMethod || 'Tunai'),
    status: 'active',
    voidReason: '',
    voidedAt: '',
    createdByName: cleanText(payload.createdByName || payload.actorName),
    createdByUsername: cleanText(payload.createdByUsername || payload.actorUsername),
    createdByRole: cleanText(payload.createdByRole || payload.actorRole),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.externalIncomes.push(income);
  addActivity(data, 'income', `Pemasukan external ${income.category} tercatat`, {
    incomeId: income.id,
    amount: income.amount
  });
  return income;
}

function updateExternalIncome(data, incomeId, payload) {
  const income = (data.externalIncomes || []).find((item) => item.id === incomeId);
  if (!income) {
    return null;
  }
  if (!externalIncomeIsActive(income)) {
    return income;
  }

  const items = normalizeIncomeItems(payload, income);
  const subtotal = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const tax = taxFields({ ...payload, amount: subtotal }, income);
  const next = {
    date: payload.date || income.date || todayIso(),
    receiptNo: income.receiptNo || receiptNumber(data, payload.date || income.date || todayIso()),
    category: incomeCategorySummary(items, payload.category || income.category),
    payerName: cleanText(payload.payerName || payload.customerName || income.payerName),
    itemName: incomeItemSummary(items),
    items,
    description: cleanText(payload.description),
    subtotal: tax.subtotal,
    taxEnabled: tax.taxEnabled,
    taxRate: tax.taxRate,
    taxAmount: tax.taxAmount,
    amount: tax.amount,
    paymentMethod: cleanText(payload.paymentMethod || income.paymentMethod || 'Tunai'),
    status: income.status || 'active',
    createdByName: income.createdByName || cleanText(payload.createdByName || payload.actorName),
    createdByUsername: income.createdByUsername || cleanText(payload.createdByUsername || payload.actorUsername),
    createdByRole: income.createdByRole || cleanText(payload.createdByRole || payload.actorRole),
    updatedByName: cleanText(payload.updatedByName || payload.actorName),
    updatedByUsername: cleanText(payload.updatedByUsername || payload.actorUsername),
    updatedByRole: cleanText(payload.updatedByRole || payload.actorRole),
    updatedAt: new Date().toISOString()
  };

  Object.assign(income, next);
  addActivity(data, 'income', `Pemasukan external ${income.category} diperbarui`, {
    incomeId: income.id,
    amount: income.amount
  });
  return income;
}

function deleteExternalIncome(data, incomeId) {
  const income = (data.externalIncomes || []).find((item) => item.id === incomeId);
  if (!income) {
    return null;
  }
  if (!externalIncomeIsActive(income)) {
    return income;
  }

  income.status = 'cancelled';
  income.voidReason = cleanText(income.voidReason || 'Dibatalkan');
  income.voidedAt = new Date().toISOString();
  income.updatedAt = income.voidedAt;
  addActivity(data, 'income', `Kuitansi ${income.receiptNo || income.category} dibatalkan`, {
    incomeId: income.id,
    amount: toNumber(income.amount)
  });
  return income;
}

function addExpense(data, payload) {
  const items = normalizeExpenseItems(payload);
  const amount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const payee = expensePayee(payload);
  const expense = {
    id: createId('exp'),
    date: payload.date || todayIso(),
    category: expenseCategorySummary(items, payload.category),
    payee,
    vendor: payee,
    noteNo: cleanText(payload.noteNo || payload.invoiceNo || payload.receiptNo || payload.noNota),
    itemName: expenseItemSummary(items),
    items,
    description: cleanText(payload.description),
    subtotal: amount,
    taxEnabled: false,
    taxRate: 0,
    taxAmount: 0,
    amount,
    paymentMethod: cleanText(payload.paymentMethod || 'Tunai'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.expenses.push(expense);
  addActivity(data, 'expense', `Pengeluaran ${expense.category} tercatat`, {
    expenseId: expense.id
  });
  return expense;
}

function updateExpense(data, expenseId, payload) {
  const expense = data.expenses.find((item) => item.id === expenseId);
  if (!expense) {
    return null;
  }

  const items = normalizeExpenseItems(payload, expense);
  const amount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const payee = expensePayee(payload, expense);
  const next = {
    date: payload.date || expense.date || todayIso(),
    category: expenseCategorySummary(items, payload.category || expense.category || 'Operasional'),
    payee,
    vendor: payee,
    noteNo: cleanText(payload.noteNo || payload.invoiceNo || payload.receiptNo || payload.noNota || expense.noteNo),
    itemName: expenseItemSummary(items),
    items,
    description: cleanText(payload.description),
    subtotal: amount,
    taxEnabled: false,
    taxRate: 0,
    taxAmount: 0,
    amount,
    paymentMethod: cleanText(payload.paymentMethod || expense.paymentMethod || 'Tunai'),
    updatedAt: new Date().toISOString()
  };

  Object.assign(expense, next);
  addActivity(data, 'expense', `Pengeluaran ${expense.category} diperbarui`, {
    expenseId: expense.id
  });
  return expense;
}

function deleteExpense(data, expenseId) {
  const index = data.expenses.findIndex((item) => item.id === expenseId);
  if (index === -1) {
    return null;
  }

  const [expense] = data.expenses.splice(index, 1);
  addActivity(data, 'expense', `Pengeluaran ${expense.category} dihapus`, {
    expenseId: expense.id,
    amount: toNumber(expense.amount)
  });
  return expense;
}

module.exports = {
  addActivity,
  addMonthsToPeriod,
  addExternalIncome,
  deleteExpense,
  deleteExternalIncome,
  addExpense,
  addManualCustomer,
  billingAmountBreakdown,
  billingAmountBreakdownForPeriods,
  currentPeriod,
  customerBillableInPeriod,
  dueDateForPeriod,
  generateInvoices,
  billingDueDayForCustomer,
  cancelInvoice,
  nextBillingInvoiceNumber,
  invoiceRuntimeStatus,
  invoiceCoveredPeriods,
  invoiceBlocksPeriod,
  markInvoicePaid,
  markInvoiceUnpaid,
  normalizeBillingPeriodForType,
  normalizePaymentType,
  postpaidCycleProrationInfo,
  paymentIsActive,
  normalizePeriod,
  normalizeStatus,
  resolvePrice,
  summarize,
  toNumber,
  updateExternalIncome,
  updateExpense,
  upsertCustomers,
  upsertInvoices,
  upsertMonthlyEarning
};
