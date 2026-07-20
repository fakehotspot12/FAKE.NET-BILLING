'use strict';

const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const redisCache = require('./redis-cache');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const execFileAsync = promisify(execFile);
const STORAGE_MODE = String(process.env.STORAGE || (process.env.DATABASE_URL ? 'postgres' : 'json')).toLowerCase();
const POSTGRES_STORE_TABLE = process.env.POSTGRES_STORE_TABLE || 'app_store';
const CACHE_MODE = ['postgres', 'postgresql'].includes(STORAGE_MODE)
  ? 'memory'
  : redisCache.enabled() ? 'memory+redis' : 'memory';
const APP_MODE = String(process.env.APP_MODE || 'standalone').toLowerCase();
const BILLING_SOURCE = String(process.env.BILLING_SOURCE || 'local').toLowerCase();
const STORE_CACHE_KEY = process.env.REDIS_STORE_KEY || `fakenet-billing:${process.env.NODE_ENV || 'dev'}:${STORAGE_MODE}:store:main`;
const PSQL_MAX_BUFFER_BYTES = Math.min(256, Math.max(16, Number(process.env.STORE_PSQL_MAX_BUFFER_MB || 64) || 64)) * 1024 * 1024;
const STORE_SCHEMA_VERSION = 2;
const NORMALIZED_COLLECTIONS = Object.freeze({
  customers: 'app_customers',
  invoices: 'app_invoices',
  payments: 'app_payments',
  waMessages: 'app_wa_messages',
  activity: 'app_activity'
});
let postgresReady = false;
let memoryStore = null;
let memoryLoadPromise = null;
let storeWriteQueue = Promise.resolve();
let persistedCoreFingerprint = '';
let persistedCollectionFingerprints = new Map();

const DEFAULT_PACKAGE_PRICES = {
  'PAKET 5 Mb': 75000,
  'PAKET A BASIC 10 Mb': 100000,
  'PAKET B SILVER 20 Mb': 150000,
  'PAKET C GOLD 30 Mb': 200000,
  'PAKET D PLATINUM 40 Mb': 250000,
  'PAKET E ULTRA 50 Mb': 300000
};

const DEFAULT_COLLECTOR_DAILY_BONUS_TIERS = [
  { minAmount: 850000, maxAmount: 1499999, bonusAmount: 15000 },
  { minAmount: 1500000, maxAmount: 2499999, bonusAmount: 20000 },
  { minAmount: 2500000, maxAmount: 2999999, bonusAmount: 25000 },
  { minAmount: 3000000, maxAmount: 3999999, bonusAmount: 30000 },
  { minAmount: 4000000, maxAmount: 0, bonusAmount: 50000 }
];

function createDefaultStore() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    settings: {
      businessName: 'FAKE.NET Billing Standalone',
      appSubtitle: 'ISP Billing',
      logoUrl: '/fakenet-logo.png',
      receiptBusinessCode: 'FAKE.NET',
      publicInfo: {
        heroTitle: 'Informasi Layanan & Pembelian',
        heroText: 'Halaman ini berisi ringkasan produk, alur transaksi, syarat ketentuan, dan kontak layanan pelanggan untuk kebutuhan review payment gateway.',
        productTitle: 'Portal Billing ISP/RT-RW Net',
        productText: 'Aplikasi billing dan layanan pelanggan untuk pembayaran tagihan internet bulanan, pembelian voucher hotspot, pengecekan status layanan, serta portal pelanggan.',
        voucherTitle: 'Cara Pembelian Voucher',
        voucherSteps: 'Pelanggan membuka halaman voucher atau login hotspot.\nPelanggan memilih paket, mengisi nama dan nomor Whatsapp aktif.\nPelanggan membayar melalui QRIS payment gateway.\nSetelah pembayaran berhasil, voucher dibuat otomatis dan dapat digunakan.',
        billingTitle: 'Cara Pembayaran Tagihan',
        billingSteps: 'Pelanggan menerima link invoice dari admin, sistem Whatsapp, atau portal WifiKu.\nPelanggan memilih metode pembayaran yang tersedia di payment gateway.\nStatus invoice otomatis berubah menjadi lunas setelah callback payment gateway valid.\nJika layanan sedang isolir karena tagihan, sistem dapat mengaktifkan kembali layanan setelah pembayaran tercatat.',
        termsTitle: 'Syarat & Ketentuan Ringkas',
        termsText: 'Pelanggan wajib mengisi data yang benar, membayar sesuai nominal yang tampil pada invoice atau checkout, dan mengikuti kebijakan layanan. Voucher atau status pembayaran diproses otomatis setelah transaksi dinyatakan berhasil oleh payment gateway.',
        supportTitle: 'Kontak Customer Service',
        supportText: 'Untuk bantuan pembayaran, aktivasi, atau gangguan layanan, hubungi customer service melalui Whatsapp.',
        contactLabel: 'Hubungi Whatsapp',
        contactPhone: ''
      },
      collectorDailyBonusEnabled: true,
      collectorDailyBonusTiers: DEFAULT_COLLECTOR_DAILY_BONUS_TIERS.map((tier) => ({ ...tier })),
      appMode: APP_MODE,
      billingSource: BILLING_SOURCE,
      defaultDueDay: 10,
      currency: 'IDR',
      packagePrices: { ...DEFAULT_PACKAGE_PRICES },
      oltManager: {
        baseUrl: process.env.OLT_MANAGER_BASE_URL || '',
        loginPath: process.env.OLT_MANAGER_LOGIN_PATH || '/api/auth/login',
        summaryPath: process.env.OLT_MANAGER_SUMMARY_PATH || '/api/dashboard/summary',
        onlineOnusPath: process.env.OLT_MANAGER_ONLINE_ONUS_PATH || '/api/dashboard/online-onus',
        lowRxOnusPath: process.env.OLT_MANAGER_LOW_RX_ONUS_PATH || '/api/dashboard/low-rx-onus'
      },
      mediaServices: {
        tvheadendUrl: process.env.TVHEADEND_URL || '',
        tvheadendUsername: process.env.TVHEADEND_USERNAME || '',
        tvheadendPassword: process.env.TVHEADEND_PASSWORD || '',
        embyUrl: process.env.EMBY_URL || '',
        embyApiKey: process.env.EMBY_API_KEY || ''
      },
      genieAcs: {
        enabled: process.env.GENIEACS_ENABLED === undefined
          ? true
          : ['1', 'true', 'yes', 'on'].includes(String(process.env.GENIEACS_ENABLED || '').toLowerCase()),
        baseUrl: process.env.GENIEACS_BASE_URL || 'http://127.0.0.1:7557',
        token: process.env.GENIEACS_TOKEN || '',
        connectionRequest: true
      },
      wifiKu: {
        enabled: true,
        publicPath: '/wifiku',
        requireOtp: true,
        otpTtlMinutes: 5,
        sessionTtlHours: 12
      },
      radboox: {
        baseUrl: process.env.RADBOOX_BASE_URL || 'https://my.radboox.com',
        username: process.env.RADBOOX_USERNAME || '',
        password: process.env.RADBOOX_PASSWORD || '',
        actionUsername: '',
        actionPassword: '',
        actionPasswordEnc: '',
        autoSync: {}
      },
      xendit: {
        sensitiveUsers: []
      },
      radius: {
        isolationRateLimit: process.env.RADIUS_ISOLATION_RATE_LIMIT || '128k/128k',
        isolationMikrotikGroup: process.env.RADIUS_ISOLATION_MIKROTIK_GROUP || '',
        isolationPool: process.env.RADIUS_ISOLATION_POOL || '',
        accountingInterimIntervalSeconds: Math.max(0, Number(process.env.RADIUS_ACCOUNTING_INTERIM_INTERVAL_SECONDS || 60) || 60),
        isolationNote: 'Override Radius untuk pelanggan status isolir.'
      },
      billing: {
        postpaidDueDay: 10,
        fixedInvoiceAdvanceDays: 7,
        suspendGraceDays: 0,
        autoTerminateAfterDays: 0,
        notificationBeforeDueDays: 0,
        autoSuspendTime: '00:00',
        invoiceNumberFormat: 'XXXXXX',
        invoiceBusinessCode: 'FAKE.NET',
        notifyInvoiceIssued: true,
        notifyPaymentStatus: true,
        notifyMemberStatus: true,
        mergeInvoice: false
      },
      waGateway: {
        enabled: true,
        provider: 'waha',
        baseUrl: 'http://127.0.0.1:8895',
        token: '',
        sender: 'default',
        minDelaySeconds: 45,
        maxPerBatch: 20,
        quietStart: '00:00',
        quietEnd: '23:59',
        templates: {
          invoiceIssued: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan Invoice anda telah terbit dan dapat dibayarkan, berikut rinciannya :\nID Pelanggan: [uid]\nNomor Invoice: [no_invoice]\nAmount: Rp [amount]\nTotal: Rp [total]\nItem: [pppoe_profile]\nJatuh tempo: [due_date]\nPeriod: [period]\n\nMohon segera lakukan pembayaran sebelum jatuh tempo, jika tidak dibayarkan setelah *H+[suspend_grace_days] ([suspend_grace_days] hari)* dari tanggal jatuh tempo maka akan otomatis ditangguhkan *(ISOLIR).*\n\n*Metode Pembayaran Otomatis*\nBank Virtual Account, OVO, DANA, LinkAja, ShopeePay, QRIS, BRILink, Alfamart, Alfamidi dan Indomaret terdekat!\nKlik => [payment_gateway]\n\n*Jika sudah melakukan pembayaran mohon mengirim resi/konfirmasi ke whatsapp ini.*\n\nTerima kasih.',
          paymentReminder: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan tagihan anda senilai Rp. [total] belum di bayar, Mohon segera lakukan pembayaran sebelum jatuh tempo, jika tidak dibayarkan setelah *H+[suspend_grace_days] ([suspend_grace_days] hari)* dari tanggal jatuh tempo maka akan otomatis ditangguhkan *(ISOLIR).*\n\nAbaikan pesan ini bila sudah membayar.\n\n*Metode Pembayaran Otomatis*\nBank Virtual Account, OVO, DANA, LinkAja, ShopeePay, QRIS, BRILink, Alfamart, Alfamidi dan Indomaret terdekat!\nKlik => [payment_gateway]\n\n*Jika sudah melakukan pembayaran mohon mengirim resi/konfirmasi ke whatsapp ini.*\n\nTerima kasih.',
          invoiceOverdue: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nDi informasikan, Account anda telah ditangguhkan *(ISOLIR)* oleh *System Billing* kami, dikarenakan keterlambatan dalam pembayaran.\n\nSaat ini anda tidak dapat menggunakan internet, sampai anda menyelesaikan pembayaran senilai Rp. [total]\n\n*Metode Pembayaran Otomatis*\nBank Virtual Account, OVO, DANA, LinkAja, ShopeePay, QRIS, BRILink, Alfamart, Alfamidi dan Indomaret terdekat!\nKlik => [payment_gateway]\n\n*Jika sudah melakukan pembayaran mohon mengirim resi/konfirmasi ke whatsapp ini*\n\nTerima kasih.',
          paymentPaid: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan tagihan anda telah dibayar, berikut rinciannya :\nID Pelanggan: [uid]\nNomor Invoice: [no_invoice]\nTotal: Rp [total]\nItem: [pppoe_profile]\nPeriod: [period]\nStatus: Paid\nPayment Method: [paid_method]\n\nTerima kasih.',
          accountSuspend: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan Internet Account anda dalam penangguhan (Isolir).\nSaat ini anda tidak dapat menggunakan layanan internet. Segera konfirmasi ke admin layanan kami terkait hal ini.\n\n*Metode Pembayaran Otomatis*\nBank Virtual Account, OVO, DANA, LinkAja, ShopeePay, QRIS, BRILink, Alfamart, Alfamidi dan Indomaret terdekat!\nKlik => [payment_gateway]\n\n*Jika sudah melakukan pembayaran mohon mengirim resi/konfirmasi ke whatsapp ini*\n\nTerima kasih!',
          accountActive: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan Internet Account anda telah di aktifkan, berikut rincian data account anda :\n\nID Pelanggan: [uid]\nItem: [pppoe_profile]\n\nMohon untuk mematikan dan menyalakan kembali tombol modem jika internet masih belum aktif setelah pembayaran ini. Terima kasih!\n\n*Ini adalah pesan otomatis*',
          voucherIssued: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nPembayaran voucher Hotspot berhasil.\nReference: [reference]\nPaket: [voucher_profile]\nHarga: Rp [voucher_price]\nUsername: [voucher_user]\nPassword: [voucher_pass]\nMasa aktif: [validity]\nBerlaku sampai: [valid_until]\nLink login: [login_url]\n\nSimpan voucher ini sampai masa aktif habis.\n\nTerima kasih.',
          voucherExpired: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nMasa aktif voucher Hotspot anda sudah habis.\nUsername: [voucher_user]\nPaket: [voucher_profile]\nBerlaku sampai: [valid_until]\n\nSilakan beli voucher baru jika ingin menggunakan layanan kembali.\nLink login: [login_url]\n\nTerima kasih.',
          memberStatus: 'Halo *[fullname]*, status layanan internet Anda saat ini [status].\n\n[footer]'
        }
      },
      paymentGateway: {
        enabled: false,
        provider: 'tripay',
        mode: 'sandbox',
        callbackUrl: '',
        publicBaseUrl: '',
        paymentPath: '/payment-invoice.html',
        voucherPaymentMethod: 'QRIS',
        monthlyAdminFee: 0,
        voucherAdminFee: 750,
        voucherAdminFeePercent: 0.70,
        checkoutTtlMinutes: 60,
        checkoutVaTtlMinutes: 1440,
        checkoutRetailTtlMinutes: 1440,
        settlementReserveAmount: 10000,
        tripay: { merchantCode: '', apiKey: '', privateKey: '' },
        midtrans: { merchantId: '', serverKey: '', clientKey: '' },
        xendit: { accountId: '', secretKey: '', callbackToken: '' },
        doku: { clientId: '', secretKey: '', sharedKey: '' },
        duitku: { merchantCode: '', apiKey: '' },
        ipaymu: { va: '', apiKey: '' },
        custom: { baseUrl: '', apiKey: '' }
      },
      hotspotVoucherOnline: {
        enabled: false,
        title: 'Beli Voucher Hotspot',
        publicPath: '/voucher',
        defaultNas: '',
        autoGenerateOnPaid: true,
        paymentMethod: 'qris',
        codeLength: 6,
        codePrefix: '',
        codeCharacter: 'mixed',
        requireWhatsapp: true,
        sendVoucherWa: true,
        showPrice: true,
        successMessage: 'Voucher akan dikirim setelah pembayaran berhasil.',
        terms: '',
        packages: {}
      },
      security: {
        secretKey: '',
        loginVerificationEnabled: true
      },
      license: {
        key: '',
        licenseId: '',
        licensedTo: '',
        edition: '',
        issuedAt: '',
        expiresAt: '',
        activatedAt: '',
        machineCode: ''
      }
    },
    customers: [],
    radiusNas: [],
    radiusProfiles: [],
    radiusHotspotTemplates: [{
      id: 'default',
      name: 'Mikhmon Compact',
      title: 'Voucher Compact',
      subtitle: 'cara aktivasi kode\nvoucer buka chrome ketik : {{login_host}} lalu enter',
      footer: '',
      loginLabel: 'Link login',
      layout: 'mikhmon-compact',
      accentColor: '#0277BD',
      instruction: 'cara aktivasi kode\nvoucer buka chrome ketik : {{login_host}} lalu enter',
      supportText: '',
      codeLabel: 'VOUCHER',
      validityLabel: 'MASA AKTIF',
      customHtml: '',
      customCss: '',
      showPrice: true,
      showQr: true,
      active: true,
      editable: true,
      createdAt: now,
      updatedAt: now
    }],
    radiusUsers: [],
    radiusRemovedRecords: [],
    radiusVoucherRecords: [],
    radiusSyncState: {},
    invoices: [],
    monthlyEarnings: [],
    dailyReports: [],
    externalIncomes: [],
    inventoryItems: [],
    stockMovements: [],
    networkAssets: [],
    monitoringTargets: [],
    payments: [],
    waMessages: [],
    hotspotVoucherOrders: [],
    hotspotVoucherSalesHistory: [],
    paymentGatewayTransactions: [],
    webPushSubscriptions: [],
    expenses: [],
    users: [],
    activity: []
  };
}

function restoreTerminatedPendingInvoices(data = {}) {
  for (const invoice of data.invoices || []) {
    const status = String(invoice.status || '').trim().toLowerCase();
    const notes = String(invoice.notes || '');
    if (!['cancelled', 'canceled'].includes(status)) continue;
    if (!/dibatalkan otomatis karena pelanggan terminated/i.test(notes)) continue;
    invoice.status = 'pending';
    invoice.notes = notes
      .replace(/\s*Dibatalkan otomatis karena pelanggan terminated\.?/i, '')
      .trim();
    invoice.updatedAt = invoice.updatedAt || new Date().toISOString();
    invoice.restoredFromTerminatedCancel = true;
  }
  return data;
}

function periodFromDateText(value = '') {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  return local ? `${local[3]}-${local[2].padStart(2, '0')}` : '';
}

function addMonthsToPeriodText(period = '', months = 1) {
  const match = String(period || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + Number(months || 0), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dateForPeriodDay(period = '', day = 10) {
  const match = String(period || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dueDay = Math.max(1, Math.min(maxDay, Math.round(numberValue(day, 10))));
  return `${match[1]}-${match[2]}-${String(dueDay).padStart(2, '0')}`;
}

function normalizedStatusText(value = '') {
  return String(value || '').trim().toLowerCase();
}

function numberValue(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  const normalized = text
    .replace(/rp/gi, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstInvoicePaid(customer = {}) {
  const statuses = [
    customer.firstInvoiceStatus,
    customer.initialInvoiceStatus,
    customer.memberInvoiceStatus,
    customer.invoiceStatus,
    customer.paymentStatus
  ].map(normalizedStatusText).filter(Boolean);
  if (!statuses.length) return false;
  return statuses.some((status) => ['paid', 'lunas', 'terbayar'].includes(status))
    && !statuses.some((status) => ['unpaid', 'pending', 'belum bayar'].includes(status));
}

function cancelInvalidPaidInitialProrataInvoices(data = {}) {
  const customers = new Map((data.customers || []).map((customer) => [String(customer.id || ''), customer]));
  const now = new Date().toISOString();
  for (const invoice of data.invoices || []) {
    const customer = customers.get(String(invoice.customerId || ''));
    if (!customer || !firstInvoicePaid(customer)) continue;
    const activePeriod = periodFromDateText(customer.activeDate || customer.installedAt || customer.createdAt || '');
    if (!activePeriod || String(invoice.period || '') !== activePeriod) continue;
    if (normalizedStatusText(invoice.status) !== 'pending') continue;
    if (normalizedStatusText(invoice.source) !== 'generated') continue;
    if (invoice.prorated !== true && !/prorata/i.test(String(invoice.notes || ''))) continue;
    invoice.status = 'cancelled';
    invoice.cancelledAt = invoice.cancelledAt || now;
    invoice.cancelReason = invoice.cancelReason || 'Invoice prorata bulan pemasangan dibatalkan karena status invoice awal member Paid.';
    invoice.notes = `${String(invoice.notes || '').trim()} Dibatalkan otomatis: status invoice awal Paid.`.trim();
    invoice.updatedAt = now;
  }
  return data;
}

function syncLinkedRadiusMemberProfiles(data = {}) {
  const profiles = new Map((data.radiusProfiles || [])
    .filter((profile) => String(profile.serviceType || '').toLowerCase() === 'pppoe')
    .map((profile) => [String(profile.id || ''), profile]));
  const customers = new Map((data.customers || []).map((customer) => [String(customer.id || ''), customer]));
  const now = new Date().toISOString();
  const cycleDueDay = Math.max(1, Math.min(31, Math.round(numberValue(data.settings?.billing?.postpaidDueDay, 10))));
  let changed = 0;
  for (const user of data.radiusUsers || []) {
    if (String(user.serviceType || '').toLowerCase() !== 'pppoe') continue;
    const profile = profiles.get(String(user.profileId || ''));
    if (!profile) continue;
    const customer = customers.get(String(user.customerId || ''));
    if (!customer) continue;
    const profileName = String(profile.name || '').trim();
    const profilePrice = Math.max(0, Math.round(numberValue(profile.price)));
    const nextPackageName = profileName || String(customer.packageName || '').trim();
    const nextPrice = profilePrice > 0
      ? profilePrice
      : Math.max(0, Math.round(numberValue(customer.price || customer.amount || 0)));
    const previousPackageName = String(customer.packageName || '').trim();
    const previousPrice = Math.max(0, Math.round(numberValue(customer.price || customer.amount || 0)));
    let customerChanged = false;
    if (previousPackageName !== nextPackageName || previousPrice !== nextPrice) {
      customer.packageName = nextPackageName;
      customer.price = nextPrice;
      customer.amount = nextPrice;
      customerChanged = true;
    }
    const paymentType = normalizedStatusText(customer.paymentType || 'postpaid');
    const billingPeriod = normalizedStatusText(customer.billingPeriod || 'fixed');
    if (paymentType === 'postpaid' && ['cycle', 'billingcycle', 'billing_cycle'].includes(billingPeriod)) {
      const activeDate = String(customer.activeDate || customer.installedAt || customer.createdAt || '').slice(0, 10);
      const activePeriod = periodFromDateText(activeDate);
      const cycleDueThisPeriod = dateForPeriodDay(activePeriod, cycleDueDay);
      const firstInvoiceStatus = normalizedStatusText(customer.firstInvoiceStatus || customer.initialInvoiceStatus || 'paid');
      const fallbackDuePeriod = firstInvoiceStatus === 'unpaid' && activeDate && cycleDueThisPeriod && activeDate <= cycleDueThisPeriod
        ? activePeriod
        : addMonthsToPeriodText(activePeriod, 1);
      const duePeriod = periodFromDateText(customer.nextDue || customer.dueDate || '') || fallbackDuePeriod;
      const nextCycleDue = dateForPeriodDay(duePeriod, cycleDueDay);
      if (Math.round(numberValue(customer.dueDay, 0)) !== cycleDueDay) {
        customer.dueDay = cycleDueDay;
        customerChanged = true;
      }
      if (nextCycleDue && (customer.nextDue !== nextCycleDue || customer.dueDate !== nextCycleDue)) {
        customer.nextDue = nextCycleDue;
        customer.dueDate = nextCycleDue;
        customerChanged = true;
      }
    }
    if (!customerChanged) continue;
    customer.updatedAt = now;
    customer.updatedBy = customer.updatedBy || 'Sistem';
    changed += 1;
  }
  if (changed > 0) {
    data.radiusSyncState = data.radiusSyncState && typeof data.radiusSyncState === 'object' ? data.radiusSyncState : {};
    data.radiusSyncState.linkedMemberProfileSyncAt = now;
    data.radiusSyncState.linkedMemberProfileSyncCount = changed;
  }
  return data;
}

function normalizeWaTemplatePlaceholders(template = '', key = '') {
  const graceVariableText = 'H+[suspend_grace_days] ([suspend_grace_days] hari)';
  let next = String(template || '')
    .replace(/\*H\+5\s*\(5\s*hari\)\*/gi, `*${graceVariableText}*`)
    .replace(/H\+5\s*\(5\s*hari\)/gi, graceVariableText);
  if (['invoiceIssued', 'paymentReminder'].includes(String(key || ''))) {
    next = next.replace(/\*\[suspend_grace\]\*/g, `*${graceVariableText}*`);
  }
  if (['invoiceIssued', 'paymentReminder', 'invoiceOverdue', 'paymentPaid', 'accountSuspend', 'accountActive'].includes(String(key || ''))
    && next.includes('Pelanggan [nama_usaha]')
    && !next.includes('[alamat]')) {
    next = next.replace('Pelanggan [nama_usaha]\n', 'Pelanggan [nama_usaha]\nAlamat: [alamat]\n');
  }
  return next;
}

function normalizeWaGatewayTemplates(templates = {}) {
  return Object.fromEntries(
    Object.entries(templates || {})
      .filter(([key]) => key !== 'paymentCancel')
      .map(([key, value]) => [key, normalizeWaTemplatePlaceholders(value, key)])
  );
}

const MEMBER_CODE_REFERENCE_FIELDS = new Set([
  'code',
  'accountId',
  'account_id',
  'memberCode',
  'member_code',
  'memberId',
  'member_id',
  'customerCode',
  'customer_code',
  'uid',
  'userId',
  'user_id'
]);

const MEMBER_CODE_REFERENCE_COLLECTIONS = [
  'customers',
  'radiusUsers',
  'radiusRemovedRecords',
  'radiusVoucherRecords',
  'invoices',
  'payments',
  'dailyReports',
  'monthlyEarnings',
  'waMessages',
  'paymentGatewayTransactions',
  'activity'
];

function uniqueStandardMemberCode(usedCodes = new Set(), preferred = '') {
  const preferredCode = String(preferred || '').trim();
  if (/^22\d{9}$/.test(preferredCode) && !usedCodes.has(preferredCode)) return preferredCode;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = `22${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
    if (!usedCodes.has(code)) return code;
  }
  return `22${String(Date.now()).slice(-9).padStart(9, '0')}`;
}

function replaceMemberCodeReferences(value, replacements = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((item) => replaceMemberCodeReferences(item, replacements));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, current] of Object.entries(value)) {
    if (MEMBER_CODE_REFERENCE_FIELDS.has(key)) {
      const replacement = replacements.get(String(current || '').trim());
      if (replacement) value[key] = replacement;
    }
    if (current && typeof current === 'object') {
      replaceMemberCodeReferences(current, replacements);
    }
  }
}

function migrateLegacyMemberCodes(data = {}) {
  const customers = Array.isArray(data.customers) ? data.customers : [];
  const usedCodes = new Set(customers.flatMap((customer) => [
    customer.code,
    customer.accountId,
    customer.memberCode,
    customer.userId
  ]).map((value) => String(value || '').trim()).filter(Boolean));
  const replacements = new Map();

  for (const customer of customers) {
    const current = [customer.code, customer.accountId, customer.memberCode, customer.userId]
      .map((value) => String(value || '').trim())
      .find((value) => /^\d{9}$/.test(value));
    if (!current || replacements.has(current)) continue;
    const replacement = uniqueStandardMemberCode(usedCodes, `22${current}`);
    replacements.set(current, replacement);
    usedCodes.add(replacement);
  }
  if (!replacements.size) return data;

  for (const collection of MEMBER_CODE_REFERENCE_COLLECTIONS) {
    replaceMemberCodeReferences(data[collection], replacements);
  }
  data.radiusSyncState = data.radiusSyncState && typeof data.radiusSyncState === 'object' ? data.radiusSyncState : {};
  data.radiusSyncState.memberIdPatternMigratedAt = data.radiusSyncState.memberIdPatternMigratedAt || new Date().toISOString();
  data.radiusSyncState.memberIdPatternMigratedCount = replacements.size;
  return data;
}

function ensureShape(data) {
  const base = createDefaultStore();
  const safe = data && typeof data === 'object' ? data : {};
  const settings = safe.settings && typeof safe.settings === 'object' ? safe.settings : {};
  const oltManager = settings.oltManager && typeof settings.oltManager === 'object' ? settings.oltManager : {};
  const mediaServices = settings.mediaServices && typeof settings.mediaServices === 'object' ? settings.mediaServices : {};
  const genieAcs = settings.genieAcs && typeof settings.genieAcs === 'object' ? settings.genieAcs : {};
  const wifiKu = settings.wifiKu && typeof settings.wifiKu === 'object' ? settings.wifiKu : {};
  const radius = settings.radius && typeof settings.radius === 'object' ? settings.radius : {};
  const radboox = settings.radboox && typeof settings.radboox === 'object' ? settings.radboox : {};
  const xendit = settings.xendit && typeof settings.xendit === 'object' ? settings.xendit : {};
  const billing = settings.billing && typeof settings.billing === 'object' ? settings.billing : {};
  const waGateway = settings.waGateway && typeof settings.waGateway === 'object' ? settings.waGateway : {};
  const paymentGateway = settings.paymentGateway && typeof settings.paymentGateway === 'object' ? settings.paymentGateway : {};
  const hotspotVoucherOnline = settings.hotspotVoucherOnline && typeof settings.hotspotVoucherOnline === 'object' ? settings.hotspotVoucherOnline : {};
  const publicInfo = settings.publicInfo && typeof settings.publicInfo === 'object' ? settings.publicInfo : {};
  const security = settings.security && typeof settings.security === 'object' ? settings.security : {};
  const license = settings.license && typeof settings.license === 'object' ? settings.license : {};

  const shaped = {
    ...base,
    ...safe,
    settings: {
      ...base.settings,
      ...settings,
      collectorDailyBonusTiers: Array.isArray(settings.collectorDailyBonusTiers)
        ? settings.collectorDailyBonusTiers
        : base.settings.collectorDailyBonusTiers.map((tier) => ({ ...tier })),
      packagePrices: {
        ...base.settings.packagePrices,
        ...(settings.packagePrices || {})
      },
      oltManager: {
        ...base.settings.oltManager,
        ...oltManager
      },
      mediaServices: {
        ...base.settings.mediaServices,
        ...mediaServices
      },
      genieAcs: {
        ...base.settings.genieAcs,
        ...genieAcs
      },
      wifiKu: {
        ...base.settings.wifiKu,
        ...wifiKu
      },
      radius: {
        ...base.settings.radius,
        ...radius
      },
      radboox: {
        ...base.settings.radboox,
        ...radboox
      },
      xendit: {
        ...base.settings.xendit,
        ...xendit
      },
      billing: {
        ...base.settings.billing,
        ...billing,
        invoiceNumberFormat: 'XXXXXX'
      },
      waGateway: {
        ...base.settings.waGateway,
        ...waGateway,
        templates: normalizeWaGatewayTemplates({
          ...base.settings.waGateway.templates,
          ...(waGateway.templates || {})
        })
      },
      paymentGateway: {
        ...base.settings.paymentGateway,
        ...paymentGateway,
        tripay: {
          ...base.settings.paymentGateway.tripay,
          ...(paymentGateway.tripay || {})
        },
        midtrans: {
          ...base.settings.paymentGateway.midtrans,
          ...(paymentGateway.midtrans || {})
        },
        xendit: {
          ...base.settings.paymentGateway.xendit,
          ...(paymentGateway.xendit || {})
        },
        doku: {
          ...base.settings.paymentGateway.doku,
          ...(paymentGateway.doku || {})
        },
        duitku: {
          ...base.settings.paymentGateway.duitku,
          ...(paymentGateway.duitku || {})
        },
        ipaymu: {
          ...base.settings.paymentGateway.ipaymu,
          ...(paymentGateway.ipaymu || {})
        },
        custom: {
          ...base.settings.paymentGateway.custom,
          ...(paymentGateway.custom || {})
        }
      },
      hotspotVoucherOnline: {
        ...base.settings.hotspotVoucherOnline,
        ...hotspotVoucherOnline,
        packages: {
          ...base.settings.hotspotVoucherOnline.packages,
          ...(hotspotVoucherOnline.packages || {})
        }
      },
      publicInfo: {
        ...base.settings.publicInfo,
        ...publicInfo
      },
      security: {
        ...base.settings.security,
        ...security
      },
      license: {
        ...base.settings.license,
        ...license
      }
    },
    customers: Array.isArray(safe.customers) ? safe.customers : [],
    radiusNas: Array.isArray(safe.radiusNas) ? safe.radiusNas : [],
    radiusProfiles: Array.isArray(safe.radiusProfiles) ? safe.radiusProfiles : [],
    radiusHotspotTemplates: Array.isArray(safe.radiusHotspotTemplates) ? safe.radiusHotspotTemplates : base.radiusHotspotTemplates,
    radiusUsers: Array.isArray(safe.radiusUsers) ? safe.radiusUsers : [],
    radiusRemovedRecords: Array.isArray(safe.radiusRemovedRecords) ? safe.radiusRemovedRecords : [],
    radiusVoucherRecords: Array.isArray(safe.radiusVoucherRecords) ? safe.radiusVoucherRecords : [],
    radiusSyncState: safe.radiusSyncState && typeof safe.radiusSyncState === 'object' ? safe.radiusSyncState : {},
    invoices: Array.isArray(safe.invoices) ? safe.invoices : [],
    monthlyEarnings: Array.isArray(safe.monthlyEarnings) ? safe.monthlyEarnings : [],
    dailyReports: Array.isArray(safe.dailyReports) ? safe.dailyReports : (Array.isArray(safe.radbooxDailyReports) ? safe.radbooxDailyReports : []),
    externalIncomes: Array.isArray(safe.externalIncomes) ? safe.externalIncomes : [],
    inventoryItems: Array.isArray(safe.inventoryItems) ? safe.inventoryItems : [],
    stockMovements: Array.isArray(safe.stockMovements) ? safe.stockMovements : [],
    networkAssets: Array.isArray(safe.networkAssets) ? safe.networkAssets : [],
    monitoringTargets: Array.isArray(safe.monitoringTargets) ? safe.monitoringTargets : [],
    payments: Array.isArray(safe.payments) ? safe.payments : [],
    waMessages: Array.isArray(safe.waMessages) ? safe.waMessages : [],
    hotspotVoucherOrders: Array.isArray(safe.hotspotVoucherOrders) ? safe.hotspotVoucherOrders : [],
    hotspotVoucherSalesHistory: Array.isArray(safe.hotspotVoucherSalesHistory) ? safe.hotspotVoucherSalesHistory : [],
    paymentGatewayTransactions: Array.isArray(safe.paymentGatewayTransactions) ? safe.paymentGatewayTransactions : [],
    webPushSubscriptions: Array.isArray(safe.webPushSubscriptions) ? safe.webPushSubscriptions : [],
    expenses: Array.isArray(safe.expenses) ? safe.expenses : [],
    users: Array.isArray(safe.users) ? safe.users : [],
    activity: Array.isArray(safe.activity) ? safe.activity : []
  };
  return syncLinkedRadiusMemberProfiles(cancelInvalidPaidInitialProrataInvoices(restoreTerminatedPendingInvoices(migrateLegacyMemberCodes(shaped))));
}

function postgresEnabled() {
  return STORAGE_MODE === 'postgres' || STORAGE_MODE === 'postgresql';
}

function postgresTableName() {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(POSTGRES_STORE_TABLE)) {
    throw new Error('POSTGRES_STORE_TABLE tidak valid');
  }
  return POSTGRES_STORE_TABLE;
}

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

async function runPsql(args) {
  const url = databaseUrl();
  if (!url) {
    throw new Error('DATABASE_URL wajib diisi untuk STORAGE=postgres');
  }

  const result = await execFileAsync('psql', ['-X', '-q', '-d', url, ...args], {
    maxBuffer: PSQL_MAX_BUFFER_BYTES
  });
  return result.stdout;
}

async function runPsqlSql(sql) {
  const tempPath = path.join('/tmp', `fakenet-billing-store-${process.pid}-${Date.now()}.sql`);
  await fs.writeFile(tempPath, sql, { mode: 0o600 });
  try {
    return await runPsql([
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      tempPath
    ]);
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

async function ensurePostgresStore() {
  if (postgresReady) return;
  const table = postgresTableName();
  const normalizedTablesSql = Object.values(NORMALIZED_COLLECTIONS).map((name) => `
      create table if not exists ${name} (
        id text primary key,
        position bigint not null default 0,
        data jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists ${name}_position_idx on ${name} (position);
  `).join('\n');
  await runPsqlSql(`
      begin;
      create table if not exists ${table} (
        id text primary key,
        data jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      ${normalizedTablesSql}
      commit;
  `);
  postgresReady = true;
}

async function loadStore() {
  if (memoryStore) return memoryStore;
  if (memoryLoadPromise) return memoryLoadPromise;

  memoryLoadPromise = (async () => {
    if (!postgresEnabled()) {
      const cached = await loadCachedStore();
      if (cached) {
        memoryStore = cached;
        return memoryStore;
      }
    }

    if (postgresEnabled()) {
      memoryStore = await loadPostgresStore();
      return memoryStore;
    }

    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(STORE_PATH, 'utf8');
      memoryStore = ensureShape(JSON.parse(raw));
      await cacheStore(memoryStore);
      return memoryStore;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      memoryStore = createDefaultStore();
      await saveStore(memoryStore);
      return memoryStore;
    }
  })();

  try {
    return await memoryLoadPromise;
  } finally {
    memoryLoadPromise = null;
  }
}

async function persistStore(data, options = {}) {
  if (postgresEnabled()) {
    const saved = await savePostgresStore(data, options);
    memoryStore = saved;
    return saved;
  }

  const next = ensureShape(data);
  next.updatedAt = new Date().toISOString();
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempPath = `${STORE_PATH}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`);
  await fs.rename(tempPath, STORE_PATH);
  memoryStore = next;
  await cacheStore(next);
  return next;
}

async function saveStore(data, options = {}) {
  const run = () => persistStore(data, options);
  storeWriteQueue = storeWriteQueue.then(run, run);
  return storeWriteQueue;
}

async function loadCachedStore() {
  if (!redisCache.enabled()) {
    return null;
  }
  try {
    const raw = await redisCache.get(STORE_CACHE_KEY);
    if (!raw) {
      return null;
    }
    return ensureShape(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function cacheStore(data) {
  if (postgresEnabled() || !redisCache.enabled()) {
    return;
  }
  try {
    await redisCache.set(STORE_CACHE_KEY, JSON.stringify(ensureShape(data)));
  } catch {
    // Redis is a speed-up layer only; persistent storage remains authoritative.
  }
}

function sqlText(value = '') {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function jsonHex(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('hex');
}

function normalizedRowId(collection, row) {
  const id = String(row && row.id || '').trim();
  if (!id) throw new Error(`Data ${collection} tidak memiliki id`);
  return id;
}

function storeCore(data = {}) {
  const core = { ...data, storageSchemaVersion: STORE_SCHEMA_VERSION };
  for (const collection of Object.keys(NORMALIZED_COLLECTIONS)) {
    delete core[collection];
  }
  return core;
}

function coreFingerprint(data = {}) {
  const comparable = { ...storeCore(data) };
  delete comparable.updatedAt;
  return crypto.createHash('sha256').update(JSON.stringify(comparable)).digest('hex');
}

function collectionSnapshot(collection, rows = []) {
  const snapshot = new Map();
  rows.forEach((row, position) => {
    const id = normalizedRowId(collection, row);
    if (snapshot.has(id)) throw new Error(`ID duplikat ${id} pada ${collection}`);
    const json = JSON.stringify(row);
    snapshot.set(id, {
      id,
      position,
      json,
      fingerprint: crypto.createHash('sha256').update(`${position}:${json}`).digest('hex')
    });
  });
  return snapshot;
}

function normalizedSnapshots(data = {}, collections = Object.keys(NORMALIZED_COLLECTIONS)) {
  return new Map(collections.map((collection) => [
    collection,
    collectionSnapshot(collection, Array.isArray(data[collection]) ? data[collection] : [])
  ]));
}

function rememberPersistedState(data = {}) {
  persistedCoreFingerprint = coreFingerprint(data);
  persistedCollectionFingerprints = new Map();
  for (const [collection, snapshot] of normalizedSnapshots(data)) {
    persistedCollectionFingerprints.set(collection, new Map(
      [...snapshot].map(([id, row]) => [id, row.fingerprint])
    ));
  }
}

function collectionUpsertSql(table, rows = []) {
  if (!rows.length) return '';
  const values = rows.map((row) => `(
    ${sqlText(row.id)},
    ${Number(row.position) || 0},
    convert_from(decode('${Buffer.from(row.json, 'utf8').toString('hex')}', 'hex'), 'UTF8')::jsonb
  )`).join(',\n');
  return `
    insert into ${table} (id, position, data)
    values ${values}
    on conflict (id) do update
      set position = excluded.position,
          data = excluded.data,
          updated_at = now();
  `;
}

function collectionDeleteSql(table, ids = []) {
  if (!ids.length) return '';
  return `delete from ${table} where id in (${ids.map(sqlText).join(', ')});`;
}

function coreUpsertSql(data = {}) {
  const table = postgresTableName();
  return `
    insert into ${table} (id, data, updated_at)
    values ('main', convert_from(decode('${jsonHex(storeCore(data))}', 'hex'), 'UTF8')::jsonb, now())
    on conflict (id) do update
      set data = excluded.data,
          updated_at = now();
  `;
}

async function migrateLegacyPostgresStore(data = {}) {
  const statements = ['begin;'];
  for (const [collection, table] of Object.entries(NORMALIZED_COLLECTIONS)) {
    const snapshot = collectionSnapshot(collection, data[collection] || []);
    statements.push(`delete from ${table};`);
    statements.push(collectionUpsertSql(table, [...snapshot.values()]));
  }
  statements.push(coreUpsertSql(data));
  statements.push('commit;');
  await runPsqlSql(statements.join('\n'));
}

async function loadNormalizedCollections() {
  const pairs = Object.entries(NORMALIZED_COLLECTIONS).map(([collection, table]) => `
    ${sqlText(collection)}, coalesce((select jsonb_agg(data order by position) from ${table}), '[]'::jsonb)
  `);
  const raw = (await runPsql([
    '-v',
    'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-c',
    `select jsonb_build_object(${pairs.join(',')})::text;`
  ])).trim();
  return raw ? JSON.parse(raw) : {};
}

async function loadPostgresStore() {
  await ensurePostgresStore();
  const table = postgresTableName();
  const raw = (await runPsql([
    '-v',
    'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-c',
    `select data::text from ${table} where id = 'main';`
  ])).trim();

  if (!raw) {
    const data = ensureShape(createDefaultStore());
    await savePostgresStore(data);
    return data;
  }

  const parsed = JSON.parse(raw);
  if (Number(parsed.storageSchemaVersion || 0) < STORE_SCHEMA_VERSION) {
    const legacy = ensureShape(parsed);
    await migrateLegacyPostgresStore(legacy);
    rememberPersistedState(legacy);
    return legacy;
  }

  const collections = await loadNormalizedCollections();
  const data = ensureShape({ ...parsed, ...collections });
  rememberPersistedState(data);
  return data;
}

async function savePostgresStore(data, options = {}) {
  const next = data && typeof data === 'object' ? data : ensureShape(data);
  await ensurePostgresStore();
  const requestedCollections = Array.isArray(options.collections)
    ? [...new Set(options.collections.filter((collection) => NORMALIZED_COLLECTIONS[collection]))]
    : Object.keys(NORMALIZED_COLLECTIONS);
  const includeCore = options.includeCore !== false;
  const nextCoreFingerprint = includeCore ? coreFingerprint(next) : persistedCoreFingerprint;
  const coreChanged = includeCore && nextCoreFingerprint !== persistedCoreFingerprint;
  const snapshots = normalizedSnapshots(next, requestedCollections);
  const statements = ['begin;'];
  let normalizedChanged = false;

  for (const collection of requestedCollections) {
    const table = NORMALIZED_COLLECTIONS[collection];
    const previous = persistedCollectionFingerprints.get(collection) || new Map();
    const current = snapshots.get(collection) || new Map();
    const changedRows = [...current.values()].filter((row) => previous.get(row.id) !== row.fingerprint);
    const deletedIds = [...previous.keys()].filter((id) => !current.has(id));
    if (changedRows.length || deletedIds.length) normalizedChanged = true;
    statements.push(collectionUpsertSql(table, changedRows));
    statements.push(collectionDeleteSql(table, deletedIds));
  }

  if (!coreChanged && !normalizedChanged) {
    memoryStore = next;
    return next;
  }
  if (coreChanged) {
    next.updatedAt = new Date().toISOString();
    statements.push(coreUpsertSql(next));
  }
  statements.push('commit;');
  await runPsqlSql(statements.filter(Boolean).join('\n'));
  if (coreChanged) persistedCoreFingerprint = coreFingerprint(next);
  for (const [collection, snapshot] of snapshots) {
    persistedCollectionFingerprints.set(collection, new Map(
      [...snapshot].map(([id, row]) => [id, row.fingerprint])
    ));
  }
  memoryStore = next;

  return next;
}

function peekStore() {
  return memoryStore;
}

function createId(prefix) {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${random}`;
}

function publicSettings(settings) {
  const rawSettings = settings || {};
  const standalone = String(rawSettings.appMode || '').toLowerCase() === 'standalone'
    || String(rawSettings.billingSource || '').toLowerCase() === 'local';
  const {
    security,
    radboox,
    xendit,
    genieAcs,
    waGateway,
    paymentGateway,
    license,
    ...safeSettings
  } = rawSettings;
  const {
    token: oltToken,
    username: oltUsername,
    password: oltPassword,
    ...safeOltManager
  } = rawSettings.oltManager || {};
  const {
    iptvUrl,
    tvheadendPassword,
    embyApiKey,
    siteServices,
    ...safeMediaServices
  } = rawSettings.mediaServices || {};
  const publicSiteServices = {};
  const rawSiteServices = siteServices && typeof siteServices === 'object' ? siteServices : {};
  for (const [siteId, serviceConfig] of Object.entries(rawSiteServices)) {
    const {
      tvheadendPassword: siteTvheadendPassword,
      embyApiKey: siteEmbyApiKey,
      ...safeSiteConfig
    } = serviceConfig && typeof serviceConfig === 'object' ? serviceConfig : {};
    publicSiteServices[siteId] = {
      ...safeSiteConfig,
      hasTvheadendLogin: Boolean(safeSiteConfig.tvheadendUsername && siteTvheadendPassword),
      hasEmbyApiKey: Boolean(siteEmbyApiKey)
    };
  }
  const oltManager = {
    ...safeOltManager,
    hasToken: Boolean(process.env.OLT_MANAGER_TOKEN || oltToken),
    hasLogin: Boolean((process.env.OLT_MANAGER_USERNAME && process.env.OLT_MANAGER_PASSWORD) || (oltUsername && oltPassword))
  };
  const mediaServices = {
    ...safeMediaServices,
    siteServices: publicSiteServices,
    hasTvheadendLogin: Boolean((process.env.TVHEADEND_USERNAME && process.env.TVHEADEND_PASSWORD) || (rawSettings.mediaServices?.tvheadendUsername && tvheadendPassword)),
    hasEmbyApiKey: Boolean(process.env.EMBY_API_KEY || embyApiKey)
  };
  const rawWaGateway = waGateway && typeof waGateway === 'object' ? waGateway : {};
  const waProvider = String(rawWaGateway.provider || 'waha').toLowerCase();
  const publicWaGateway = {
    ...rawWaGateway,
    token: '',
    tokenConfigured: waProvider !== 'waha' && Boolean(rawWaGateway.token)
  };
  const rawPaymentGateway = paymentGateway && typeof paymentGateway === 'object' ? paymentGateway : {};
  const maskProvider = (provider = {}) => Object.fromEntries(Object.entries(provider || {}).map(([key, value]) => {
    if (/key|token|secret|private/i.test(key)) {
      return [key, value ? 'tersimpan' : ''];
    }
    return [key, value];
  }));
  const publicPaymentGateway = {
    ...rawPaymentGateway,
    tripay: maskProvider(rawPaymentGateway.tripay),
    midtrans: maskProvider(rawPaymentGateway.midtrans),
    xendit: maskProvider(rawPaymentGateway.xendit),
    doku: maskProvider(rawPaymentGateway.doku),
    duitku: maskProvider(rawPaymentGateway.duitku),
    ipaymu: maskProvider(rawPaymentGateway.ipaymu),
    custom: maskProvider(rawPaymentGateway.custom)
  };
  const publicRadboox = radboox && typeof radboox === 'object' ? {
    ...radboox,
    password: '',
    actionPassword: '',
    actionPasswordEnc: undefined,
    hasPassword: Boolean(radboox.password || radboox.passwordEnc),
    hasActionPassword: Boolean(radboox.actionPassword || radboox.actionPasswordEnc)
  } : {};
  delete publicRadboox.passwordEnc;
  const rawGenieAcs = genieAcs && typeof genieAcs === 'object' ? genieAcs : {};
  const rawSecurity = security && typeof security === 'object' ? security : {};
  const publicGenieAcs = {
    enabled: rawGenieAcs.enabled !== false,
    baseUrl: rawGenieAcs.baseUrl || '',
    connectionRequest: rawGenieAcs.connectionRequest !== false,
    token: '',
    tokenConfigured: Boolean(rawGenieAcs.token || process.env.GENIEACS_TOKEN)
  };
  const publicSecurity = {
    loginVerificationEnabled: rawSecurity.loginVerificationEnabled !== false
  };
  const rawLicense = license && typeof license === 'object' ? license : {};
  const publicLicense = {
    keyConfigured: Boolean(rawLicense.key),
    licenseId: rawLicense.licenseId || '',
    licensedTo: rawLicense.licensedTo || '',
    edition: rawLicense.edition || '',
    issuedAt: rawLicense.issuedAt || '',
    expiresAt: rawLicense.expiresAt || '',
    activatedAt: rawLicense.activatedAt || '',
    machineCode: rawLicense.machineCode || ''
  };

  return {
    ...safeSettings,
    oltManager,
    mediaServices,
    genieAcs: publicGenieAcs,
    security: publicSecurity,
    license: publicLicense,
    ...(standalone ? {} : { radboox: publicRadboox }),
    waGateway: publicWaGateway,
    paymentGateway: publicPaymentGateway
  };
}

module.exports = {
  CACHE_MODE,
  DEFAULT_COLLECTOR_DAILY_BONUS_TIERS,
  DEFAULT_PACKAGE_PRICES,
  STORAGE_MODE,
  STORE_CACHE_KEY,
  STORE_PATH,
  createDefaultStore,
  createId,
  ensureShape,
  loadStore,
  peekStore,
  publicSettings,
  redisStatus: () => ({
    ...redisCache.safeStatus(),
    key: postgresEnabled() ? '' : STORE_CACHE_KEY,
    storeLayer: 'memory'
  }),
  saveStore,
  __test: {
    collectionSnapshot,
    coreFingerprint,
    storeCore
  }
};
