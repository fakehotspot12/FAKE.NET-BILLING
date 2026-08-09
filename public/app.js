'use strict';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const periodPicker = document.getElementById('periodPicker');
const periodPickerButton = document.getElementById('periodPickerButton');
const periodPickerLabel = document.getElementById('periodPickerLabel');
const periodPickerPanel = document.getElementById('periodPickerPanel');
const periodYearSelect = document.getElementById('periodYearSelect');
const periodPrevYear = document.getElementById('periodPrevYear');
const periodNextYear = document.getElementById('periodNextYear');
const periodMonthGrid = document.getElementById('periodMonthGrid');
const themeToggleButton = document.getElementById('themeToggleButton');
const dashboardPrivacyTopButton = document.getElementById('dashboardPrivacyTopButton');
const topWaStatusButton = document.getElementById('topWaStatusButton');
const notificationMenu = document.getElementById('notificationMenu');
const notificationButton = document.getElementById('notificationButton');
const notificationPanel = document.getElementById('notificationPanel');
const notificationList = document.getElementById('notificationList');
const notificationCount = document.getElementById('notificationCount');
const viewTitle = document.getElementById('viewTitle');
const businessName = document.getElementById('businessName');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const logoutButton = document.getElementById('logoutButton');
const accountMenu = document.getElementById('accountMenu');
const accountPanel = document.getElementById('accountPanel');
const accountGreeting = document.getElementById('accountGreeting');
const accountProfileMenu = document.getElementById('accountProfileMenu');
const accountLogoutMenu = document.getElementById('accountLogoutMenu');
const profileButton = document.getElementById('profileButton');
const currentUserName = document.getElementById('currentUserName');
const currentUserAvatar = document.getElementById('currentUserAvatar');
const menuToggleButton = document.getElementById('menuToggleButton');
const menuBackdrop = document.getElementById('menuBackdrop');
const sidebarLogo = document.getElementById('sidebarLogo');
const copyrightYear = document.getElementById('copyrightYear');
const copyrightName = document.getElementById('copyrightName');
const appVersion = document.getElementById('appVersion');
const buildVersion = document.getElementById('buildVersion');
const mobileMenuQuery = window.matchMedia('(max-width: 760px)');
const CUSTOMER_PAGE_SIZE = 10;
const RADIUS_PAGE_SIZE = 10;
const PAGER_LIMIT_OPTIONS = [10, 25, 50, 100];
const DEFAULT_APP_TIME_ZONE = 'Asia/Makassar';
const APP_TIME_ZONE_LABELS = {
  'Asia/Jakarta': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT'
};
const APP_TIME_ZONE_OPTIONS = [
  ['Asia/Jakarta', 'WIB - Asia/Jakarta'],
  ['Asia/Makassar', 'WITA - Asia/Makassar'],
  ['Asia/Jayapura', 'WIT - Asia/Jayapura']
];
const DEFAULT_LOGO_URL = '/fakenet-logo.png';
const DEFAULT_BUSINESS_NAME = 'ISP Billing';
const DEFAULT_APP_SUBTITLE = 'Billing ISP dan RT/RW Net';
const DEFAULT_BUSINESS_CODE = 'ISP';
const APP_COPYRIGHT_NAME = 'FAKE.NET';
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const DEFAULT_PROFILE_PHOTO_URL = '/default-user-avatar.svg';
const LEGACY_SOURCE_OFFSET_MINUTES = 7 * 60;
const XENDIT_WITHDRAW_RESERVE_AMOUNT = 10000;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_FULL_LABELS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MAX_LOGO_UPLOAD_BYTES = 1024 * 1024;
const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
const LAST_VIEW_STORAGE_KEY = 'fakenetBillingLastView';
const LEGACY_LAST_VIEW_STORAGE_KEY = 'fakenetOpsLastView';
const LOGIN_RETURN_VIEW_STORAGE_KEY = 'fakenetBillingReturnView';
const THEME_STORAGE_KEY = 'fakenetBillingTheme';
const MONITORING_BILLING_PERIOD_STORAGE_KEY = 'fakenetBillingMonitoringBillingPeriod';
const DASHBOARD_PRIVACY_STORAGE_KEY = 'fakenetBillingDashboardPrivacyHidden';
let activeClientTimeZone = DEFAULT_APP_TIME_ZONE;

const titles = {
  dashboard: 'Dashboard',
  radiusPppDhcp: 'PPPoE DHCP',
  radiusHotspot: 'Voucher Hotspot',
  radiusSettings: 'Isolir Radius',
  genieAcs: 'GenieACS',
  monitoringSite: 'Monitoring Site',
  monitoringMembers: 'Data Pelanggan',
  monitoringCustomers: 'Sesi Online',
  monitoringBilling: 'Tagihan Pelanggan',
  monitoringServices: 'Layanan',
  externalIncomes: 'Pemasukan',
  expenses: 'Pengeluaran',
  billingSettings: 'Pengaturan Billing',
  reportsDaily: 'Tagihan Harian',
  reportsMonthlyBilling: 'Tagihan Bulanan',
  reportsStatistics: 'Statistik',
  reportsVoucherDaily: 'Voucher Harian',
  reportsVoucherMonthly: 'Voucher Bulanan',
  reportsTransactions: 'Mutasi Bulanan',
  reportsFinanceRecap: 'Rekapitulasi',
  reportsInventoryStock: 'Stok Inventaris',
  diagnostics: 'Deteksi Log',
  activity: 'Log Audit',
  waGateway: 'Whatsapp Gateway',
  paymentGateway: 'Payment Gateway',
  inventory: 'Inventaris',
  networkAssets: 'Aset',
  users: 'User',
  settings: 'Pengaturan'
};

const viewPermissions = {
  dashboard: 'dashboard:read',
  externalIncomes: 'external-incomes:read',
  expenses: 'expenses:read',
  billingSettings: 'billing-settings:manage',
  reportsDaily: 'reports:daily:read',
  reportsMonthlyBilling: 'reports:daily:read',
  reportsStatistics: 'reports:daily:read',
  reportsVoucherDaily: 'reports:voucher:read',
  reportsVoucherMonthly: 'reports:voucher:read',
  reportsTransactions: 'reports:daily:read',
  reportsFinanceRecap: 'reports:daily:read',
  reportsInventoryStock: 'inventory:read',
  diagnostics: 'diagnostics:read',
  activity: 'activity:read',
  waGateway: 'wa-gateway:manage',
  paymentGateway: 'payment-gateway:manage',
  inventory: 'inventory:read',
  networkAssets: 'network-assets:read',
  radiusPppDhcp: 'radius:read',
  radiusHotspot: 'radius:read',
  radiusSettings: 'radius:read',
  genieAcs: 'genieacs:read',
  monitoringSite: 'monitoring:read',
  monitoringMembers: ['billing-monitor:read', 'members:read'],
  monitoringCustomers: 'monitoring:read',
  monitoringBilling: 'billing-monitor:read',
  monitoringServices: 'monitoring:read',
  users: 'users:manage',
  settings: 'settings:write'
};

function storedMonitoringBillingPeriod() {
  const stored = storageValue(MONITORING_BILLING_PERIOD_STORAGE_KEY);
  return /^\d{4}-\d{2}$/.test(stored) ? stored : todayInput().slice(0, 7);
}

function saveMonitoringBillingPeriod(period) {
  try {
    window.localStorage.setItem(MONITORING_BILLING_PERIOD_STORAGE_KEY, normalizedPeriod(period));
  } catch {
    // Ignore browsers with blocked storage.
  }
}

function storedDashboardPrivacyHidden() {
  return true;
}

const state = {
  auth: null,
  roles: [],
  userRows: null,
  userPage: 1,
  userLimit: 10,
  userRole: 'all',
  userStatus: 'all',
  userSearch: '',
  view: 'dashboard',
  period: todayInput().slice(0, 7),
  externalIncomePeriod: todayInput().slice(0, 7),
  externalIncomePage: 1,
  externalIncomeLimit: 10,
  expensePeriod: todayInput().slice(0, 7),
  expensePage: 1,
  expenseLimit: 10,
  receiptPrintMode: 'a4',
  invoiceStatus: 'all',
  customerStatus: 'all',
  activityPage: 1,
  activityLimit: 10,
  activityRange: 'today',
  activityCategory: 'all',
  activityFrom: todayInput(),
  activityTo: todayInput(),
  monitoringCustomerPage: 1,
  monitoringCustomerLimit: CUSTOMER_PAGE_SIZE,
  monitoringCustomerSite: 'all',
  monitoringCustomerType: 'pppoe',
  monitoringCustomersPayload: null,
  monitoringMemberPage: 1,
  monitoringMemberLimit: 10,
  monitoringMemberStatus: 'all',
  monitoringMemberPaymentType: 'all',
  monitoringMemberBillingPeriod: 'all',
  monitoringMemberNewCustomer: 'all',
  monitoringMemberNas: 'all',
  monitoringMemberPeriod: 'all',
  monitoringMemberFrom: '',
  monitoringMemberTo: '',
  monitoringMemberCreator: 'all',
  monitoringServicesPage: 1,
  monitoringServicesLimit: CUSTOMER_PAGE_SIZE,
  monitoringServicesTab: 'tv',
  monitoringServicesSite: 'all',
  monitoringBillingPage: 1,
  monitoringBillingLimit: 10,
  monitoringBillingStatus: 'collectible',
  monitoringBillingCustomerStatus: 'all',
  monitoringBillingSite: 'all',
  monitoringBillingPeriod: todayInput().slice(0, 7),
  monitoringBillingScope: 'collectible',
  monitoringBillingKeepPreset: false,
  dashboardValuesHidden: storedDashboardPrivacyHidden(),
  radiusPppTab: 'users',
  radiusPppPage: 1,
  radiusPppLimit: RADIUS_PAGE_SIZE,
  radiusPppNas: '',
  radiusPppStatus: '',
  radiusPppProfile: '',
  radiusPppInternet: '',
  radiusHotspotTab: 'users',
  radiusHotspotPage: 1,
  radiusHotspotLimit: RADIUS_PAGE_SIZE,
  radiusHotspotNas: '',
  radiusHotspotStatus: '',
  radiusHotspotProfile: '',
  radiusHotspotInternet: '',
  radiusSettingsPage: 1,
  genieAcsPage: 1,
  genieAcsLimit: 10,
  genieAcsStatus: 'all',
  genieAcsNas: 'all',
  genieAcsRedaman: 'all',
  dailyReportDate: todayInput(),
  dailyReportAdmin: 'all',
  dailyReportSite: 'all',
  reportTransactionsPeriod: todayInput().slice(0, 7),
  reportTransactionsFrom: `${todayInput().slice(0, 8)}01`,
  reportTransactionsTo: todayInput(),
  reportTransactionsMethod: 'all',
  reportTransactionsPage: 1,
  reportTransactionsLimit: 10,
  reportNas: 'all',
  reportMonthlyBillingStatus: 'all',
  reportMonthlyBillingPage: 1,
  reportMonthlyBillingLimit: 10,
  reportStatisticsPeriod: todayInput().slice(0, 7),
  reportVoucherDailyDate: todayInput(),
  reportVoucherDailyPage: 1,
  reportVoucherDailyLimit: 10,
  reportVoucherNas: 'all',
  reportVoucherReseller: 'all',
  reportVoucherProfile: 'all',
  reportVoucherMethod: 'all',
  reportVoucherMonthlyPeriod: todayInput().slice(0, 7),
  xenditFrom: `${todayInput().slice(0, 8)}01`,
  xenditTo: todayInput(),
  xenditTab: 'transactions',
  xenditType: 'all',
  xenditMethod: 'all',
  xenditPage: 1,
  xenditNextId: '',
  xenditCursorStack: [''],
  xenditBalancePage: 1,
  xenditBalanceLimit: 25,
  xenditPendingPage: 1,
  xenditPendingLimit: 25,
  xenditReportPage: 1,
  xenditReportLimit: 25,
  paymentGatewayTab: 'transactions',
  paymentGatewayPage: 1,
  paymentGatewayLimit: 10,
  paymentGatewayKind: 'all',
  waMessagePage: 1,
  waMessageLimit: 10,
  inventoryPage: 1,
  inventoryLimit: 10,
  inventoryReportPage: 1,
  inventoryReportLimit: 10,
  inventoryReportType: 'all',
  settings: {
    businessName: DEFAULT_BUSINESS_NAME,
    appSubtitle: DEFAULT_APP_SUBTITLE,
    logoUrl: DEFAULT_LOGO_URL,
    timeZone: DEFAULT_APP_TIME_ZONE,
    security: {
      loginVerificationEnabled: true
    },
    appInfo: {
      version: '__FAKENET_APP_VERSION__',
      buildVersion: '__FAKENET_BUILD_VERSION__',
      releaseDate: '__FAKENET_RELEASE_DATE__'
    }
  },
  hotspotVoucherTemplates: [],
  hotspotVoucherAdminPhone: '',
  branding: {
    businessName: DEFAULT_BUSINESS_NAME,
    appSubtitle: DEFAULT_APP_SUBTITLE,
    logoUrl: DEFAULT_LOGO_URL,
    copyrightYear: new Date().getFullYear(),
    copyrightName: APP_COPYRIGHT_NAME,
    timeZone: DEFAULT_APP_TIME_ZONE,
    appVersion: '__FAKENET_APP_VERSION__',
    buildVersion: '__FAKENET_BUILD_VERSION__',
    releaseDate: '__FAKENET_RELEASE_DATE__',
    loginVerificationEnabled: true
  },
  notifications: null,
  paymentNotifications: [],
  loginVerification: null,
  search: ''
};

const LIVE_SEARCH_DEBOUNCE_MS = 450;
const RADIUS_OPTIONS_CACHE_TTL_MS = 15000;
const radiusOptionsCache = new Map();

let monitoringCustomersTimer = null;
let monitoringServicesTimer = null;
let monitoringBillingTimer = null;
let monitoringBillingRevision = '';
let genieAcsRecentTimer = null;
let genieAcsRecentLoading = false;
let genieAcsRecentSignature = '';
let genieAcsRecentIds = new Set();
let genieAcsRecentPage = 1;
let genieAcsRecentPayload = { devices: [] };
let voucherDataTimer = null;
let voucherDataRevision = '';
let dashboardRouterNasTimer = null;
let dashboardRouterNasLoading = false;
let dashboardRouterNasRequestId = 0;
let dashboardRouterNasPayload = null;
let dashboardRouterNasHistory = {};
let dashboardRouterNasSelected = '';
let dashboardRouterNasCharts = {};
let notificationsTimer = null;
let notificationsLoading = false;
let lastNotificationsFetchAt = 0;
let webPushRegistration = null;
let webPushSyncing = null;
let webPushSubscriptionActive = false;
const paymentNotificationTimers = new Map();
let topWaStatusTimer = null;
let topWaStatusLoading = false;
let appUpdateProgressTimer = null;
let appUpdateProgressSeenRunning = false;
let appUpdateProgressStartedAt = 0;
let appUpdateProgressLastPercent = 0;
let renderGeneration = 0;
let pageRequestController = new AbortController();
let loginDomRepairing = false;
let leafletLoadPromise = null;
const NOTIFICATION_CACHE_PREFIX = 'fakenetOpsNotifications';
const PAYMENT_NOTIFICATION_SEEN_PREFIX = 'fakenetBillingPaymentNotificationsSeen';
const PAYMENT_NOTIFICATION_TTL_MS = 3000;
const PAYMENT_NOTIFICATION_SEEN_LIMIT = 100;
const SEARCH_API_CACHE_PREFIX = 'fakenetBillingSearchApiCache:';
const SEARCH_API_CACHE_MAX_ENTRIES = 120;
const SEARCH_FOCUS_INTENT_MS = 5000;
let activeSearchFocusIntent = null;

const money = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
});

function rupiah(value) {
  return money.format(Number(value || 0));
}

function bitRateText(value) {
  let bits = Math.max(0, Number(value || 0));
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'];
  let unit = 0;
  while (bits >= 1000 && unit < units.length - 1) {
    bits /= 1000;
    unit += 1;
  }
  const precision = unit === 0 ? 0 : bits >= 100 ? 0 : bits >= 10 ? 1 : 2;
  return `${bits.toLocaleString('id-ID', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  })} ${units[unit]}`;
}

function normalizedPeriod(value) {
  return /^\d{4}-\d{2}$/.test(String(value || '')) ? value : todayInput().slice(0, 7);
}

function periodParts(period = state.period) {
  const safePeriod = normalizedPeriod(period);
  const [year, month] = safePeriod.split('-').map((item) => Number(item));
  return { year, month };
}

function periodLabel(period = state.period) {
  const { year, month } = periodParts(period);
  return `${MONTH_FULL_LABELS[Math.max(0, Math.min(11, month - 1))]} ${year}`;
}

function periodFilterControls(prefix, period) {
  const safePeriod = normalizedPeriod(period);
  const { year, month } = periodParts(safePeriod);
  const startYear = year - 4;
  const years = Array.from({ length: 9 }, (_, index) => startYear + index);
  const months = MONTH_LABELS.map((label, index) => {
    const value = `${year}-${String(index + 1).padStart(2, '0')}`;
    const active = value === safePeriod;
    return `<button class="period-month ${active ? 'is-active' : ''}" type="button" data-filter-period-month="${value}">${label}</button>`;
  }).join('');
  return `
    <div class="filter-period-picker" data-filter-period-picker="${escapeHtml(prefix)}">
      <input id="${prefix}" type="hidden" value="${escapeHtml(safePeriod)}">
      <button class="period-trigger filter-period-trigger" type="button" data-filter-period-toggle aria-expanded="false">
        <span>${escapeHtml(periodLabel(safePeriod))}</span>
      </button>
      <div class="period-panel filter-period-panel" data-filter-period-panel hidden>
        <div class="period-panel-head">
          <button class="icon-button compact" type="button" data-filter-period-prev aria-label="Tahun sebelumnya">‹</button>
          <select data-filter-period-year aria-label="Tahun filter bulan">
            ${years.map((item) => `<option value="${item}" ${item === year ? 'selected' : ''}>${item}</option>`).join('')}
          </select>
          <button class="icon-button compact" type="button" data-filter-period-next aria-label="Tahun berikutnya">›</button>
        </div>
        <div class="period-month-grid" data-filter-period-grid data-selected-month="${month}">
          ${months}
        </div>
      </div>
    </div>
  `;
}

function closeFilterPeriodPickers(except = null) {
  document.querySelectorAll('[data-filter-period-picker].is-open').forEach((picker) => {
    if (except && picker === except) return;
    picker.classList.remove('is-open');
    picker.querySelector('[data-filter-period-panel]')?.setAttribute('hidden', '');
    picker.querySelector('[data-filter-period-toggle]')?.setAttribute('aria-expanded', 'false');
  });
}

function renderFilterPeriodMonths(picker, selectedPeriod = '') {
  const yearSelect = picker?.querySelector('[data-filter-period-year]');
  const grid = picker?.querySelector('[data-filter-period-grid]');
  if (!picker || !yearSelect || !grid) return;
  const selected = normalizedPeriod(selectedPeriod || picker.querySelector('input')?.value || state.period);
  const selectedMonth = Number(grid.dataset.selectedMonth || periodParts(selected).month) || 1;
  const year = Number(yearSelect.value || periodParts(selected).year) || periodParts(selected).year;
  grid.innerHTML = MONTH_LABELS.map((label, index) => {
    const value = `${year}-${String(index + 1).padStart(2, '0')}`;
    const active = value === selected;
    return `<button class="period-month ${active ? 'is-active' : ''}" type="button" data-filter-period-month="${value}">${label}</button>`;
  }).join('');
  if (String(selected).startsWith(`${year}-`)) {
    grid.dataset.selectedMonth = String(periodParts(selected).month);
  } else {
    grid.dataset.selectedMonth = String(selectedMonth);
  }
}

function bindPeriodFilter(prefix, onChange) {
  const input = document.getElementById(prefix);
  const picker = document.querySelector(`[data-filter-period-picker="${prefix}"]`);
  if (!input) return;
  if (!picker) {
    input.addEventListener('change', (event) => {
      onChange(event.target.value || todayInput().slice(0, 7));
    });
    return;
  }
  const toggle = picker.querySelector('[data-filter-period-toggle]');
  const panel = picker.querySelector('[data-filter-period-panel]');
  const yearSelect = picker.querySelector('[data-filter-period-year]');
  const setOpen = (open) => {
    closeFilterPeriodPickers(open ? picker : null);
    picker.classList.toggle('is-open', open);
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) renderFilterPeriodMonths(picker, input.value);
  };
  toggle?.addEventListener('click', () => setOpen(panel?.hidden !== false));
  yearSelect?.addEventListener('change', () => renderFilterPeriodMonths(picker, input.value));
  picker.querySelector('[data-filter-period-prev]')?.addEventListener('click', () => {
    yearSelect.value = String((Number(yearSelect.value) || periodParts(input.value).year) - 1);
    renderFilterPeriodMonths(picker, input.value);
  });
  picker.querySelector('[data-filter-period-next]')?.addEventListener('click', () => {
    yearSelect.value = String((Number(yearSelect.value) || periodParts(input.value).year) + 1);
    renderFilterPeriodMonths(picker, input.value);
  });
  picker.querySelector('[data-filter-period-grid]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter-period-month]');
    if (!button) return;
    input.value = normalizedPeriod(button.dataset.filterPeriodMonth);
    setOpen(false);
    onChange(input.value);
  });
}

function periodShortLabel(period = state.period) {
  const { year, month } = periodParts(period);
  return `${MONTH_LABELS[Math.max(0, Math.min(11, month - 1))]} ${String(year).slice(-2)}`;
}

function readablePeriodText(value = state.period) {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.replace(/\b(\d{4}-\d{2})(?!-\d{2})\b/g, (period) => periodLabel(period));
}

function readableDateParts(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (local) {
    return { year: Number(local[3]), month: Number(local[2]), day: Number(local[1]) };
  }
  return null;
}

function readableDateFromParts(parts) {
  if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return '';
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

function percentText(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function hasTax(record = {}) {
  return Boolean(record.taxEnabled || Number(record.taxAmount || 0) > 0);
}

function subtotalAmount(record = {}) {
  const amount = Number(record.amount || 0);
  const taxAmount = Number(record.taxAmount || 0);
  if (record.subtotal !== undefined && record.subtotal !== null && record.subtotal !== '') {
    return Number(record.subtotal || 0);
  }
  return taxAmount > 0 ? Math.max(0, amount - taxAmount) : amount;
}

function taxDetail(record = {}) {
  if (!hasTax(record)) return '';
  return `<div class="muted">Subtotal ${rupiah(subtotalAmount(record))} + PPN ${escapeHtml(percentText(record.taxRate))}% ${rupiah(record.taxAmount)}</div>`;
}

function quantityText(value) {
  const number = Number(value || 1);
  if (!Number.isFinite(number)) return '1';
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function incomeItems(record = {}) {
  if (Array.isArray(record.items) && record.items.length) {
    return record.items
      .filter((item) => item && Number(item.amount || 0) > 0)
      .map((item) => {
        const quantity = Number(item.quantity || item.qty || item.pcs || 1) || 1;
        const amount = Number(item.amount || 0);
        const unitPrice = Number(item.unitPrice || item.price || item.unitAmount || (quantity > 0 ? amount / quantity : amount)) || 0;
        return {
          category: item.category || record.category || 'Barang/Jasa',
          itemName: item.itemName || item.name || 'Item',
          description: item.description || '',
          quantity,
          unitPrice,
          amount
        };
      });
  }
  const amount = subtotalAmount(record);
  return amount > 0 ? [{
    category: record.category || 'Barang/Jasa',
    itemName: record.itemName || record.description || record.category || 'Pembayaran barang/jasa',
    description: '',
    quantity: 1,
    unitPrice: amount,
    amount
  }] : [];
}

function incomeItemsText(record = {}) {
  const items = incomeItems(record);
  if (!items.length) return '-';
  if (items.length === 1) {
    return items[0].itemName || '-';
  }
  const names = items.map((item) => item.itemName).filter(Boolean);
  return `${items.length} item: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', ...' : ''}`;
}

function incomeCategoriesText(record = {}) {
  const categories = [...new Set(incomeItems(record).map((item) => item.category || record.category || 'Barang/Jasa').filter(Boolean))];
  if (!categories.length) return record.category || '-';
  if (categories.length === 1) return categories[0];
  return `${categories.length} kategori: ${categories.slice(0, 3).join(', ')}${categories.length > 3 ? ', ...' : ''}`;
}

function expenseItems(record = {}) {
  if (Array.isArray(record.items) && record.items.length) {
    return record.items
      .filter((item) => item && Number(item.amount || 0) > 0)
      .map((item) => {
        const quantity = Number(item.quantity || item.qty || item.pcs || 1) || 1;
        const amount = Number(item.amount || 0);
        const unitPrice = Number(item.unitPrice || item.price || item.unitAmount || (quantity > 0 ? amount / quantity : amount)) || 0;
        return {
          category: item.category || record.category || 'Operasional',
          itemName: item.itemName || item.name || 'Item',
          description: item.description || '',
          quantity,
          unitPrice,
          amount
        };
      });
  }
  const amount = Number(record.subtotal || record.amount || 0);
  return amount > 0 ? [{
    category: record.category || 'Operasional',
    itemName: record.itemName || record.description || record.category || 'Pengeluaran',
    description: '',
    quantity: 1,
    unitPrice: amount,
    amount
  }] : [];
}

function expenseItemsText(record = {}) {
  const items = expenseItems(record);
  if (!items.length) return '-';
  if (items.length === 1) {
    return items[0].itemName || '-';
  }
  const names = items.map((item) => item.itemName).filter(Boolean);
  return `${items.length} item: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', ...' : ''}`;
}

function expenseCategoriesText(record = {}) {
  const categories = [...new Set(expenseItems(record).map((item) => item.category || record.category || 'Operasional').filter(Boolean))];
  if (!categories.length) return record.category || '-';
  if (categories.length === 1) return categories[0];
  return `${categories.length} kategori: ${categories.slice(0, 3).join(', ')}${categories.length > 3 ? ', ...' : ''}`;
}

function expensePayeeText(record = {}) {
  return record.payee || record.vendor || record.recipient || '-';
}

function expenseReferenceText(record = {}) {
  return record.noteNo || record.invoiceNo || record.receiptNo || record.referenceNo || '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function chartTooltipAttr(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return `data-chart-tooltip="${escapeHtml(text).replace(/\n/g, '&#10;')}" tabindex="0"`;
}

function profileInitials(user = {}) {
  const source = String(user.name || user.username || 'U').trim();
  const words = source.split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? `${words[0][0] || ''}${words[1][0] || ''}`
    : source.slice(0, 2);
  return initials.toUpperCase() || 'U';
}

function safeProfilePhotoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/profile/')) return raw;
  try {
    const parsed = new URL(raw);
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.toString();
  } catch {
    // Invalid external URLs are ignored for profile previews.
  }
  return '';
}

function profilePhotoDisplayUrl(user = {}) {
  const photoUrl = safeProfilePhotoUrl(user.photoUrl || user.avatarUrl);
  if (!photoUrl) return DEFAULT_PROFILE_PHOTO_URL;
  const version = String(user.updatedAt || '').trim();
  if (!version) return photoUrl;
  return `${photoUrl}${photoUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`;
}

function avatarImageMarkup(src, alt = 'Foto user') {
  const source = src || DEFAULT_PROFILE_PHOTO_URL;
  return `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" onerror="this.onerror=null;this.src='${escapeHtml(DEFAULT_PROFILE_PHOTO_URL)}'">`;
}

function userAvatarMarkup(user = {}, className = 'user-avatar') {
  const photoUrl = safeProfilePhotoUrl(user.photoUrl || user.avatarUrl);
  const classes = [className, photoUrl ? 'has-photo' : 'is-default'].filter(Boolean).join(' ');
  return `<span class="${classes}">${avatarImageMarkup(profilePhotoDisplayUrl(user), `Foto ${user.name || user.username || 'default user'}`)}</span>`;
}

function dateText(value) {
  if (!value) return '-';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(text)) return periodLabel(text);
  const readable = readableDateFromParts(readableDateParts(text));
  return readable || readablePeriodText(text);
}

function isValidTimeZone(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: text }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function appTimeZone() {
  const value = String(activeClientTimeZone || DEFAULT_APP_TIME_ZONE).trim();
  return isValidTimeZone(value) ? value : DEFAULT_APP_TIME_ZONE;
}

function setActiveClientTimeZone(value = '') {
  const next = String(value || '').trim();
  activeClientTimeZone = isValidTimeZone(next) ? next : DEFAULT_APP_TIME_ZONE;
  return activeClientTimeZone;
}

function appTimeZoneLabel(value = appTimeZone()) {
  const timeZone = String(value || DEFAULT_APP_TIME_ZONE).trim();
  return APP_TIME_ZONE_LABELS[timeZone] || timeZone || APP_TIME_ZONE_LABELS[DEFAULT_APP_TIME_ZONE];
}

function appTimeZoneOptionMarkup(selected = DEFAULT_APP_TIME_ZONE) {
  const value = isValidTimeZone(selected) ? selected : DEFAULT_APP_TIME_ZONE;
  const known = APP_TIME_ZONE_OPTIONS.some(([zone]) => zone === value);
  const selectedValue = known ? value : DEFAULT_APP_TIME_ZONE;
  return APP_TIME_ZONE_OPTIONS
    .map(([zone, label]) => `<option value="${escapeHtml(zone)}" ${zone === selectedValue ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

function ensureLeafletLoaded() {
  if (window.L) return Promise.resolve(true);
  if (leafletLoadPromise) return leafletLoadPromise;
  leafletLoadPromise = new Promise((resolve) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = LEAFLET_CSS_URL;
      document.head.appendChild(stylesheet);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS_URL}"]`);
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(Boolean(ok && window.L));
    };
    const timer = window.setTimeout(() => finish(false), 7000);
    const onReady = () => {
      window.clearTimeout(timer);
      finish(true);
    };
    const onError = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener('error', onError, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS_URL;
    script.async = true;
    script.addEventListener('load', onReady, { once: true });
    script.addEventListener('error', onError, { once: true });
    document.head.appendChild(script);
  }).then((loaded) => {
    if (!loaded) leafletLoadPromise = null;
    return loaded;
  });
  return leafletLoadPromise;
}

function dateTimeValueDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && /^[+-]?\d+(?:\.\d+)?$/.test(raw)) {
    if (numeric >= 1_000_000_000_000) {
      const date = new Date(numeric);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (numeric >= 1_000_000_000) {
      const date = new Date(numeric * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateTimeText(value) {
  if (!value) return '-';
  const date = dateTimeValueDate(value);
  if (!date) return dateText(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: appTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function timeText(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('id-ID', {
        timeZone: appTimeZone(),
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace('.', ':');
    }
  }
  const isoTime = text.match(/T(\d{2}:\d{2})/);
  if (isoTime) return isoTime[1];
  const rawTime = text.match(/\b(\d{1,2}):(\d{2})/);
  if (rawTime) return `${String(Number(rawTime[1])).padStart(2, '0')}:${rawTime[2]}`;
  return '-';
}

function legacySourceDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const timeFirst = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (timeFirst) {
    const [, hour, minute, second = '00', day, month, year] = timeFirst;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - LEGACY_SOURCE_OFFSET_MINUTES * 60 * 1000);
  }
  const dateFirst = text.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!dateFirst) return null;
  const [, first, secondPart, third, hour = '00', minute = '00', second = '00'] = dateFirst;
  const year = first.length === 4 ? first : third;
  const month = first.length === 4 ? secondPart : secondPart;
  const day = first.length === 4 ? third : first;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - LEGACY_SOURCE_OFFSET_MINUTES * 60 * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function legacySourceTimeText(value) {
  const date = legacySourceDate(value);
  if (!date) return '';
  return date.toLocaleTimeString('id-ID', {
    timeZone: appTimeZone(),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace('.', ':');
}

function incomeIsCancelled(income) {
  return ['cancelled', 'canceled', 'void', 'batal'].includes(String(income.status || '').toLowerCase());
}

function operationalStatusLabel(status) {
  const labels = {
    active: 'Aktif',
    maintenance: 'Maintenance',
    damaged: 'Rusak',
    lost: 'Hilang',
    inactive: 'Arsip',
    up: 'Online',
    down: 'Down',
    unknown: 'Unknown'
  };
  return labels[status] || status || '-';
}

function badgeClass(status) {
  if (status === 'up' || status === 'active') return 'active';
  if (status === 'down' || status === 'inactive' || status === 'damaged' || status === 'lost') return 'inactive';
  if (status === 'maintenance' || status === 'unknown') return 'pending';
  return '';
}

function stockTone(item) {
  const quantity = Number(item.quantity || 0);
  const minimum = Number(item.minimumStock || 0);
  if (quantity <= 0) return 'negative';
  if (minimum > 0 && quantity <= minimum) return 'warning-text';
  return 'positive';
}

function movementLabel(type) {
  if (type === 'out') return 'Keluar';
  if (type === 'adjust') return 'Koreksi';
  return 'Masuk';
}

function activityLabel(type) {
  const labels = {
    sync: 'Sinkron',
    income: 'Pemasukan',
    expense: 'Pengeluaran',
    inventory: 'Inventaris',
    asset: 'Aset',
    network: 'Aset',
    customer: 'Member',
    monitoring: 'Monitoring',
    invoice: 'Invoice',
    payment: 'Pembayaran',
    xendit: 'Xendit',
    user: 'User',
    settings: 'Pengaturan'
  };
  return labels[type] || type || 'Log';
}

function activityAuditDetails(item = {}) {
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {};
  if (meta.action !== 'invoice-discount-updated') return '';
  const rows = [
    ['No Invoice', meta.invoiceNo],
    ['Pelanggan', meta.customerName],
    ['Nominal lama', rupiah(meta.previousAmount || 0)],
    ['Nominal baru', rupiah(meta.amount || 0)],
    ['Diskon member/awal', rupiah(meta.baseDiscount || 0)],
    ['Diskon invoice', rupiah(meta.manualDiscount || 0)],
    ['Total diskon', rupiah(meta.totalDiscount || 0)],
    ['Catatan', meta.discountNote || '-'],
    ['Checkout', meta.checkoutInvalidated ? 'Link lama dibatalkan' : 'Tidak berubah'],
    ['Oleh', meta.actorName || meta.actorUsername || '-']
  ];
  return `
    <div class="activity-audit-grid">
      ${rows.map(([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value || '-')}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

const ACTIVITY_CATEGORY_OPTIONS = [
  ['all', 'Semua Kategori'],
  ['billing', 'Billing'],
  ['payment', 'Payment'],
  ['radius', 'Radius'],
  ['member', 'Member'],
  ['inventory', 'Inventaris'],
  ['asset', 'Aset'],
  ['wa', 'WA Gateway'],
  ['settings', 'Pengaturan'],
  ['finance', 'Keuangan']
];

function dateInputShift(value = todayInput(), days = 0) {
  const parts = String(value || todayInput()).split('-').map(Number);
  const date = new Date(Date.UTC(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1));
  date.setUTCDate(date.getUTCDate() + Math.trunc(Number(days) || 0));
  return date.toISOString().slice(0, 10);
}

function monthEndInput(period = todayInput().slice(0, 7)) {
  const [year, month] = String(period || todayInput().slice(0, 7)).split('-').map(Number);
  const nextYear = month >= 12 ? year + 1 : year;
  const nextMonth = month >= 12 ? 1 : month + 1;
  return dateInputShift(`${String(nextYear || 1970).padStart(4, '0')}-${String(nextMonth || 1).padStart(2, '0')}-01`, -1);
}

function activityRangeDates(range = state.activityRange) {
  const today = todayInput();
  if (range === 'today') return { from: today, to: today };
  if (range === 'week') return { from: dateInputShift(today, -6), to: today };
  if (range === 'month') return { from: `${today.slice(0, 7)}-01`, to: monthEndInput(today.slice(0, 7)) };
  if (range === 'custom') {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(state.activityFrom || '') ? state.activityFrom : today;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(state.activityTo || '') ? state.activityTo : from;
    return from <= to ? { from, to } : { from: to, to: from };
  }
  return { from: '', to: '' };
}

function activityCategoryOptionsMarkup(selected = 'all') {
  const technicalOnly = ['technician', 'noc'].includes(String(state.auth?.role || '').toLowerCase());
  const options = technicalOnly
    ? ACTIVITY_CATEGORY_OPTIONS.filter(([value]) => ['all', 'radius', 'member', 'inventory', 'asset'].includes(value))
    : ACTIVITY_CATEGORY_OPTIONS;
  return options.map(([value, label]) => `
    <option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>
  `).join('');
}

function normalizeActivityCategoryForRole(value = 'all') {
  const category = String(value || 'all').trim().toLowerCase();
  if (!['technician', 'noc'].includes(String(state.auth?.role || '').toLowerCase())) return category;
  return ['all', 'radius', 'member', 'inventory', 'asset'].includes(category) ? category : 'all';
}

function activityRangeLabel(range = state.activityRange) {
  if (range === 'today') return 'Hari Ini';
  if (range === 'week') return '7 Hari';
  if (range === 'month') return 'Bulan Ini';
  if (range === 'custom') {
    const dates = activityRangeDates('custom');
    return `${dateText(dates.from)} - ${dateText(dates.to)}`;
  }
  return 'Semua Log';
}

function activityActorText(item = {}) {
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {};
  return meta.actorName
    || meta.actorUsername
    || meta.updatedByName
    || meta.updatedByUsername
    || meta.radbooxUsername
    || meta.username
    || meta.user
    || '-';
}

function activityMetaValueText(key = '', value = '') {
  if (value === true) return 'Ya';
  if (value === false) return 'Tidak';
  if (value === null || value === undefined || value === '') return '-';
  const lowerKey = String(key || '').toLowerCase();
  if (typeof value === 'number' && /(amount|total|price|fee|saldo|nominal|discount)/.test(lowerKey)) {
    return rupiah(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function activityMetaGrid(item = {}) {
  const meta = item.meta && typeof item.meta === 'object' ? item.meta : {};
  const rows = Object.entries(meta).slice(0, 18);
  if (!rows.length) return '<div class="muted">Tidak ada detail tambahan.</div>';
  return `
    <div class="activity-audit-grid compact">
      ${rows.map(([key, value]) => `
        <div>
          <span>${escapeHtml(key)}</span>
          <strong>${escapeHtml(activityMetaValueText(key, value))}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function openActivityDetail(item = {}) {
  openModal('Detail Log', `
    <div class="activity-detail-modal">
      <div class="activity-detail-summary">
        <div>
          <span>Kategori</span>
          <strong>${escapeHtml(activityLabel(item.type || 'activity'))}</strong>
        </div>
        <div>
          <span>Waktu</span>
          <strong>${escapeHtml(dateTimeText(item.at || item.createdAt || ''))}</strong>
        </div>
        <div>
          <span>Oleh</span>
          <strong>${escapeHtml(activityActorText(item))}</strong>
        </div>
      </div>
      <div class="activity-detail-message">
        <span>Aktivitas</span>
        <strong>${escapeHtml(item.message || '-')}</strong>
      </div>
      ${activityMetaGrid(item)}
    </div>
  `, async () => {});
}

function mountToastLayer() {
  if (!toastEl) return;
  const modalOpen = Boolean(modal?.open);
  toastEl.classList.toggle('is-modal-toast', modalOpen);
  if (modalOpen && toastEl.parentElement !== modal) {
    modal.appendChild(toastEl);
  } else if (!modalOpen && toastEl.parentElement !== document.body) {
    document.body.insertBefore(toastEl, modal || null);
  }
}

function setToast(message) {
  if (!toastEl) return;
  mountToastLayer();
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  window.clearTimeout(setToast.timer);
  setToast.timer = window.setTimeout(() => {
    toastEl.classList.remove('is-visible');
    if (!modal?.open) mountToastLayer();
  }, 2600);
}

function preferredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Theme can fall back to light if browser storage is unavailable.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme = preferredTheme()) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  if (themeToggleButton) {
    const label = next === 'dark' ? 'Tema gelap' : 'Tema terang';
    themeToggleButton.title = label;
    themeToggleButton.setAttribute('aria-label', label);
    themeToggleButton.dataset.theme = next;
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Ignore storage failures; visual state still changes for this session.
  }
  applyTheme(next);
  renderDashboardRouterNasCharts();
}

function nextRenderGeneration() {
  renderGeneration += 1;
  return renderGeneration;
}

function renderIsStale(token) {
  return !state.auth || (token !== undefined && token !== renderGeneration);
}

function abortPageRequests() {
  pageRequestController.abort();
  pageRequestController = new AbortController();
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function truthyParam(value = '') {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function searchApiUrl(path = '') {
  try {
    return new URL(path, window.location.origin);
  } catch {
    return null;
  }
}

function searchApiCacheTtlMs(path = '', fetchOptions = {}) {
  const method = String(fetchOptions.method || 'GET').toUpperCase();
  if (method !== 'GET' || !state.auth) return 0;
  const url = searchApiUrl(path);
  if (!url || truthyParam(url.searchParams.get('refresh'))) return 0;
  if (!String(url.searchParams.get('search') || '').trim()) return 0;
  const endpoint = url.pathname;
  const tab = String(url.searchParams.get('tab') || '').trim().toLowerCase();
  if (endpoint.includes('/api/radius/')) return tab === 'sessions' ? 10000 : 60000;
  if (endpoint.includes('/api/monitoring/billing-unpaid')) return 120000;
  if (endpoint.includes('/api/monitoring/customers')) return 30000;
  if (endpoint.includes('/api/genieacs/devices')) return 60000;
  if (endpoint.includes('/api/payment-gateway')) return 120000;
  if (endpoint.includes('/api/activity')) return 60000;
  if (endpoint.includes('/api/monitoring/members')) return 300000;
  if (endpoint.includes('/api/reports/')) return 300000;
  return 300000;
}

function searchApiCacheKey(path = '') {
  const url = searchApiUrl(path);
  if (!url) return '';
  return `${SEARCH_API_CACHE_PREFIX}${url.pathname}${url.search}`;
}

function readSearchApiCache(path = '', fetchOptions = {}) {
  const ttl = searchApiCacheTtlMs(path, fetchOptions);
  if (!ttl) return null;
  const key = searchApiCacheKey(path);
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const age = Date.now() - Number(entry.cachedAt || 0);
    if (!Number.isFinite(age) || age < 0 || age > ttl) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return cloneJson(entry.payload);
  } catch {
    return null;
  }
}

function pruneSearchApiCache() {
  try {
    const entries = [];
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (!key || !key.startsWith(SEARCH_API_CACHE_PREFIX)) continue;
      let cachedAt = 0;
      try {
        cachedAt = Number(JSON.parse(window.sessionStorage.getItem(key) || '{}').cachedAt || 0);
      } catch {
        cachedAt = 0;
      }
      entries.push({ key, cachedAt });
    }
    entries
      .sort((a, b) => Number(b.cachedAt || 0) - Number(a.cachedAt || 0))
      .slice(SEARCH_API_CACHE_MAX_ENTRIES)
      .forEach((entry) => window.sessionStorage.removeItem(entry.key));
  } catch {
    // Browser storage is optional.
  }
}

function writeSearchApiCache(path = '', payload = {}, fetchOptions = {}) {
  if (!searchApiCacheTtlMs(path, fetchOptions)) return;
  const key = searchApiCacheKey(path);
  if (!key) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({
      cachedAt: Date.now(),
      payload
    }));
    pruneSearchApiCache();
  } catch {
    try {
      pruneSearchApiCache();
      window.sessionStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), payload }));
    } catch {
      // Ignore quota/private-mode storage failures.
    }
  }
}

function clearSearchApiCache() {
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(SEARCH_API_CACHE_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Browser storage is optional.
  }
}

function loginScreenVisible() {
  return Boolean(app?.querySelector?.(':scope > .login-screen'));
}

function restoreLoginIfNeeded() {
  if (loginDomRepairing || state.auth || !document.body.classList.contains('is-login')) return;
  if (loginScreenVisible()) return;
  loginDomRepairing = true;
  window.queueMicrotask(() => {
    loginDomRepairing = false;
    if (!state.auth && document.body.classList.contains('is-login') && !loginScreenVisible()) {
      renderLogin();
    }
  });
}

function themeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

async function api(path, options = {}) {
  const { skipAuthRedirect = false, timeoutMs = 0, signal, ...fetchOptions } = options;
  const requestMethod = String(fetchOptions.method || 'GET').toUpperCase();
  const requestUrl = searchApiUrl(path);
  if (requestMethod === 'GET' && truthyParam(requestUrl?.searchParams.get('refresh'))) {
    clearSearchApiCache();
  }
  const cachedPayload = !signal && !skipAuthRedirect ? readSearchApiCache(path, fetchOptions) : null;
  if (cachedPayload) return cachedPayload;
  const pageSignal = !signal && !skipAuthRedirect && state.auth ? pageRequestController.signal : null;
  const controller = timeoutMs > 0 && !signal && !pageSignal ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(path, {
      ...fetchOptions,
      cache: fetchOptions.cache || 'no-store',
      signal: signal || pageSignal || controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers || {})
      }
    });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (response.status === 401 && !skipAuthRedirect) {
      rememberLoginReturnView();
      state.auth = null;
      abortPageRequests();
      renderLogin();
      const error = new Error(payload.error || 'Sesi login habis');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(payload.error || 'Request gagal');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    if (requestMethod === 'GET') {
      writeSearchApiCache(path, payload, fetchOptions);
    } else {
      clearSearchApiCache();
    }
    return payload;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function downloadFile(path, filename = '') {
  const response = await fetch(path);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Download gagal');
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename || path.split('/').pop() || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('File tidak bisa dibaca'));
    reader.readAsDataURL(file);
  });
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('File tidak bisa dibaca'));
    reader.readAsText(file);
  });
}

function can(permission) {
  if (!permission) return true;
  if (Array.isArray(permission)) return permission.some((item) => can(item));
  return Boolean(state.auth && Array.isArray(state.auth.permissions) && state.auth.permissions.includes(permission));
}

function canAny(permissions = []) {
  return permissions.some((permission) => can(permission));
}

function hotspotFreeUserWritable(row = {}) {
  if (String(row.paymentStatus || '').trim().toLowerCase() !== 'free') return false;
  if (row.voucherBatchId || row.voucherMode || row.onlineOrderId || row.onlineOrderReference) return false;
  if (String(row.createdByRole || '').trim().toLowerCase() === 'reseller_voucher') return false;
  return true;
}

function hotspotUserWriteAllowed(row = {}) {
  if (can('radius:write')) return true;
  return can('radius:hotspot-free:write') && hotspotFreeUserWritable(row);
}

function notificationBadgeText(count) {
  const number = Number(count || 0);
  if (number > 99) return '99+';
  return String(number);
}

function notificationCacheKey() {
  const user = state.auth || {};
  return `${NOTIFICATION_CACHE_PREFIX}:${user.id || user.username || 'user'}:${user.role || 'role'}`;
}

function paymentNotificationSeenKey() {
  const user = state.auth || {};
  return `${PAYMENT_NOTIFICATION_SEEN_PREFIX}:${user.id || user.username || 'user'}:${user.role || 'role'}`;
}

function notificationBasePayload(loading = false) {
  return {
    inventory: {
      visible: can('inventory:read'),
      count: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      loading
    },
    asset: {
      visible: can('network-assets:read'),
      count: 0,
      damagedCount: 0,
      lostCount: 0,
      loading
    },
    billing: {
      visible: can('billing-monitor:read'),
      count: 0,
      amount: 0,
      loading
    },
    onlinePayments: {
      visible: can('payment-gateway:manage'),
      count: 0,
      events: [],
      loading
    }
  };
}

function readCachedNotifications() {
  if (!state.auth) return null;
  try {
    const raw = window.localStorage.getItem(notificationCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? notificationCachePayload(parsed) : null;
  } catch {
    return null;
  }
}

function readSeenPaymentNotificationIds() {
  if (!state.auth) return new Set();
  try {
    const raw = window.localStorage.getItem(paymentNotificationSeenKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeSeenPaymentNotificationIds(ids = new Set()) {
  if (!state.auth) return;
  try {
    const values = Array.from(ids).slice(-PAYMENT_NOTIFICATION_SEEN_LIMIT);
    window.localStorage.setItem(paymentNotificationSeenKey(), JSON.stringify(values));
  } catch {
    // Dedupe notifikasi pembayaran tetap best effort.
  }
}

function notificationCachePayload(notifications = {}) {
  const next = { ...notifications };
  if (next.onlinePayments) {
    next.onlinePayments = {
      ...next.onlinePayments,
      count: 0,
      message: '',
      events: []
    };
  }
  return next;
}

function writeCachedNotifications(notifications = {}) {
  if (!state.auth) return;
  try {
    window.localStorage.setItem(notificationCacheKey(), JSON.stringify(notificationCachePayload(notifications)));
  } catch {
    // Browser storage can be disabled; live API data still works.
  }
}

function prunePaymentNotifications() {
  const now = Date.now();
  state.paymentNotifications = (state.paymentNotifications || []).filter((item) => item.expiresAt > now);
}

function clearPaymentNotifications() {
  paymentNotificationTimers.forEach((timer) => window.clearTimeout(timer));
  paymentNotificationTimers.clear();
  state.paymentNotifications = [];
}

function closePaymentNotification(id) {
  state.paymentNotifications = (state.paymentNotifications || []).filter((item) => item.id !== id);
  const timer = paymentNotificationTimers.get(id);
  if (timer) window.clearTimeout(timer);
  paymentNotificationTimers.delete(id);
  setNotificationMenu(state.notifications || notificationBasePayload());
}

function webPushSupported() {
  return window.isSecureContext
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

function urlBase64ToUint8Array(value = '') {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function ensureWebPushRegistration() {
  if (!webPushSupported()) return null;
  if (!webPushRegistration) {
    webPushRegistration = await navigator.serviceWorker.register('/service-worker.js?v=fakenet-billing-__FAKENET_APP_VERSION__', {
      scope: '/'
    });
  }
  return webPushRegistration;
}

async function syncWebPushSubscription(options = {}) {
  if (!state.auth || !can('payment-gateway:manage') || !webPushSupported()) {
    webPushSubscriptionActive = false;
    return null;
  }
  if (webPushSyncing) return webPushSyncing;
  webPushSyncing = (async () => {
    if (window.Notification.permission === 'default' && options.requestPermission === true) {
      await window.Notification.requestPermission();
    }
    if (window.Notification.permission !== 'granted') {
      webPushSubscriptionActive = false;
      return null;
    }
    const registration = await ensureWebPushRegistration();
    if (!registration) return null;
    const config = await api('/api/notifications/web-push', { skipAuthRedirect: true });
    let subscription = await registration.pushManager.getSubscription();
    const expectedKey = urlBase64ToUint8Array(config.publicKey || '');
    const currentKey = subscription?.options?.applicationServerKey
      ? new Uint8Array(subscription.options.applicationServerKey)
      : null;
    if (subscription && currentKey && (currentKey.length !== expectedKey.length
      || currentKey.some((value, index) => value !== expectedKey[index]))) {
      await subscription.unsubscribe().catch(() => false);
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey
      });
    }
    await api('/api/notifications/web-push', {
      method: 'POST',
      skipAuthRedirect: true,
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });
    webPushSubscriptionActive = true;
    return subscription;
  })().catch(() => {
    webPushSubscriptionActive = false;
    return null;
  }).finally(() => {
    webPushSyncing = null;
  });
  return webPushSyncing;
}

async function disableWebPushSubscription() {
  if (!webPushSupported()) return;
  const registration = webPushRegistration || await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription && state.auth && can('payment-gateway:manage')) {
    await api('/api/notifications/web-push', {
      method: 'DELETE',
      skipAuthRedirect: true,
      body: JSON.stringify({ endpoint: subscription.endpoint })
    }).catch(() => ({}));
    await subscription.unsubscribe().catch(() => false);
  }
  webPushSubscriptionActive = false;
}

async function showBrowserPaymentNotification(item = {}) {
  if (!('Notification' in window) || window.Notification.permission !== 'granted' || webPushSubscriptionActive) return;
  const tag = `fakenet-payment-${item.id || Date.now()}`;
  const branding = currentBranding();
  try {
    const registration = await ensureWebPushRegistration();
    if (registration) {
      await registration.showNotification(item.title || 'Pembayaran online masuk', {
        body: item.description || 'Pembayaran online berhasil.',
        icon: branding.logoUrl,
        badge: branding.logoUrl,
        tag,
        requireInteraction: true,
        data: { url: '/#paymentGateway' }
      });
      return;
    }
    const browserNotification = new window.Notification(item.title || 'Pembayaran online masuk', {
      body: item.description || 'Pembayaran online berhasil.',
      icon: branding.logoUrl,
      tag,
      requireInteraction: true
    });
  } catch {
    // Notifikasi lonceng tetap menjadi fallback bila browser menolak notifikasi sistem.
  }
}

function ensureBrowserNotificationPermission() {
  if (webPushSubscriptionActive) return;
  if (!webPushSupported()) {
    setToast('Notifikasi sistem memerlukan browser yang mendukung Web Push melalui HTTPS');
    return;
  }
  syncWebPushSubscription({ requestPermission: true })
    .then((subscription) => {
      if (subscription) setToast('Notifikasi pembayaran online aktif di perangkat ini');
      else if (window.Notification.permission === 'denied') setToast('Izin notifikasi diblokir pada pengaturan browser');
    })
    .catch(() => {});
}

function ingestPaymentNotifications(notifications = {}) {
  const onlinePayments = notifications.onlinePayments || {};
  if (!onlinePayments.visible || !Array.isArray(onlinePayments.events)) return;
  const seen = readSeenPaymentNotificationIds();
  let changed = false;
  onlinePayments.events.forEach((event) => {
    const id = String(event.id || `${event.type || 'payment'}:${event.reference || ''}:${event.paidAt || ''}`).trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    changed = true;
    if (webPushSubscriptionActive) return;
    const item = {
      id,
      type: 'payment',
      count: 1,
      title: event.title || 'Pembayaran online masuk',
      description: event.description || [event.customerName, event.amountText].filter(Boolean).join(' - ') || 'Pembayaran online berhasil.',
      tone: 'warning',
      action: 'paymentGateway',
      expiresAt: Date.now() + PAYMENT_NOTIFICATION_TTL_MS
    };
    state.paymentNotifications.push(item);
    showBrowserPaymentNotification(item);
    const timer = window.setTimeout(() => closePaymentNotification(id), PAYMENT_NOTIFICATION_TTL_MS);
    paymentNotificationTimers.set(id, timer);
  });
  if (changed) writeSeenPaymentNotificationIds(seen);
}

function notificationItems(notifications = {}) {
  prunePaymentNotifications();
  const items = [];
  for (const payment of state.paymentNotifications || []) {
    items.push(payment);
  }
  const billing = notifications.billing || {};
  const inventory = notifications.inventory || {};
  const asset = notifications.asset || {};
  if (billing.visible) {
    const count = Number(billing.count || 0);
    items.push({
      type: 'billing',
      count,
      title: billing.loading ? 'Memuat tagihan pelanggan' : (count > 0 ? `${displayNumber(count)} Pelanggan Lewat Tempo` : 'Tagihan pelanggan aman'),
      description: billing.loading ? 'Mengambil data tagihan terbaru...' : (count > 0 ? `${rupiah(billing.amount || 0)} tagihan lewat tempo perlu ditindaklanjuti.` : 'Tidak ada tagihan lewat tempo sesuai data terakhir.'),
      tone: count > 0 ? 'warning' : 'safe',
      action: 'monitoringBilling'
    });
  }
  if (inventory.visible) {
    const outOfStock = Number(inventory.outOfStockCount || 0);
    const lowStock = Number(inventory.lowStockCount || 0);
    const count = outOfStock + lowStock;
    const title = count > 0
      ? `${displayNumber(count)} barang perlu restock`
      : 'Stok barang aman';
    const details = [
      outOfStock ? `${displayNumber(outOfStock)} stok habis` : '',
      lowStock ? `${displayNumber(lowStock)} stok menipis` : ''
    ].filter(Boolean).join(', ');
    items.push({
      type: 'inventory',
      count,
      title: inventory.loading ? 'Memuat stok barang' : title,
      description: inventory.loading ? 'Mengambil kondisi stok terbaru...' : (count > 0 ? `${details}. Buka inventaris untuk tambah stok.` : 'Tidak ada barang kosong atau menyentuh stok minimum.'),
      tone: count > 0 ? 'warning' : 'safe',
      action: 'inventory'
    });
  }
  if (asset.visible) {
    const damaged = Number(asset.damagedCount || 0);
    const lost = Number(asset.lostCount || 0);
    const count = damaged + lost;
    const title = count > 0
      ? `${displayNumber(count)} aset rusak/hilang`
      : 'Aset aman';
    const details = [
      damaged ? `${displayNumber(damaged)} rusak` : '',
      lost ? `${displayNumber(lost)} hilang` : ''
    ].filter(Boolean).join(', ');
    items.push({
      type: 'asset',
      count,
      title: asset.loading ? 'Memuat kondisi aset' : title,
      description: asset.loading ? 'Mengambil kondisi aset terbaru...' : (count > 0 ? `${details}. Buka aset untuk tindak lanjut.` : 'Tidak ada aset rusak atau hilang sesuai data terakhir.'),
      tone: count > 0 ? 'warning' : 'safe',
      action: 'networkAssets'
    });
  }
  return items;
}

function notificationTotal(notifications = {}) {
  return notificationItems(notifications).reduce((sum, item) => sum + Number(item.count || 0), 0);
}

function renderNotificationPanel(notifications = state.notifications || {}) {
  if (!notificationList) return;
  const items = notificationItems(notifications);
  notificationList.innerHTML = items.length ? items.map((item) => `
    <button class="notification-item ${item.tone === 'warning' ? 'has-alert' : ''}" type="button" data-notification-action="${escapeHtml(item.action)}">
      <span class="notification-item-icon ${escapeHtml(item.type)}" aria-hidden="true"></span>
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.description)}</small>
      </span>
    </button>
  `).join('') : '<div class="notification-empty">Tidak ada notifikasi untuk role ini.</div>';
  notificationList.querySelectorAll('[data-notification-action]').forEach((button) => {
    button.addEventListener('click', () => {
      closeNotificationPanel();
      openNotificationTarget(button.dataset.notificationAction);
    });
  });
}

function setNotificationMenu(notifications = {}) {
  const items = notificationItems(notifications);
  const visible = items.length > 0;
  const total = notificationTotal(notifications);
  if (notificationMenu) notificationMenu.hidden = !visible;
  if (notificationButton) {
    notificationButton.classList.toggle('has-alert', total > 0);
    notificationButton.title = total > 0 ? `${notificationBadgeText(total)} notifikasi` : 'Notifikasi';
    notificationButton.setAttribute('aria-label', notificationButton.title);
  }
  if (notificationCount) {
    notificationCount.textContent = notificationBadgeText(total);
  }
  renderNotificationPanel(notifications);
}

function applyNotifications(payload = {}) {
  const rawNotifications = payload.notifications || payload || {};
  ingestPaymentNotifications(rawNotifications);
  const notifications = notificationCachePayload(rawNotifications);
  state.notifications = notifications;
  writeCachedNotifications(notifications);
  setNotificationMenu(notifications);
}

function hideNotifications() {
  clearPaymentNotifications();
  state.notifications = null;
  if (notificationMenu) notificationMenu.hidden = true;
  closeNotificationPanel();
}

function closeNotificationPanel() {
  if (notificationPanel) notificationPanel.hidden = true;
  if (notificationButton) notificationButton.setAttribute('aria-expanded', 'false');
}

function toggleNotificationPanel() {
  if (!notificationPanel || !notificationButton) return;
  const nextOpen = notificationPanel.hidden;
  if (nextOpen) {
    ensureBrowserNotificationPermission();
    renderNotificationPanel(state.notifications || {});
  }
  notificationPanel.hidden = !nextOpen;
  notificationButton.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
}

function openNotificationTarget(action) {
  if (action === 'inventory') {
    state.search = '';
    state.inventoryPage = 1;
    setView('inventory');
    return;
  }
  if (action === 'networkAssets') {
    state.search = '';
    setView('networkAssets');
    return;
  }
  if (action === 'monitoringBilling') {
    state.search = '';
    state.monitoringBillingStatus = 'collectible';
    state.monitoringBillingCustomerStatus = 'all';
    state.monitoringBillingSite = 'all';
    state.monitoringBillingPeriod = todayInput().slice(0, 7);
    state.monitoringBillingScope = 'collectible';
    state.monitoringBillingKeepPreset = true;
    state.monitoringBillingPage = 1;
    setView('monitoringBilling');
    return;
  }
  if (action === 'paymentGateway') {
    state.search = '';
    setView('paymentGateway');
  }
}

async function refreshNotifications(options = {}) {
  if (!state.auth) {
    hideNotifications();
    return;
  }
  const now = Date.now();
  if (!options.force && now - lastNotificationsFetchAt < 10000) {
    return;
  }
  if (notificationsLoading) return;
  notificationsLoading = true;
  try {
    const payload = await api('/api/notifications', { skipAuthRedirect: true });
    lastNotificationsFetchAt = Date.now();
    applyNotifications(payload);
  } catch {
    lastNotificationsFetchAt = Date.now();
  } finally {
    notificationsLoading = false;
  }
}

function startNotificationsTimer() {
  window.clearInterval(notificationsTimer);
  if (!state.auth) {
    hideNotifications();
    return;
  }
  const cached = readCachedNotifications();
  const initialNotifications = cached || notificationBasePayload(true);
  clearPaymentNotifications();
  state.notifications = initialNotifications;
  setNotificationMenu(initialNotifications);
  refreshNotifications({ force: true });
  if (window.Notification?.permission === 'granted') {
    syncWebPushSubscription().catch(() => {});
  }
  notificationsTimer = window.setInterval(() => refreshNotifications(), 30000);
}

function setTopWaStatus(status = {}) {
  if (!topWaStatusButton) return;
  const online = Boolean(status.online);
  const label = online ? 'Whatsapp Gateway Online' : 'Whatsapp Gateway Offline';
  topWaStatusButton.hidden = false;
  topWaStatusButton.classList.toggle('is-online', online);
  topWaStatusButton.classList.toggle('is-offline', !online);
  topWaStatusButton.classList.toggle('is-loading', Boolean(status.loading));
  topWaStatusButton.title = status.loading ? 'Whatsapp Gateway mengecek status...' : label;
  topWaStatusButton.setAttribute('aria-label', topWaStatusButton.title);
}

function hideTopWaStatus() {
  window.clearInterval(topWaStatusTimer);
  topWaStatusTimer = null;
  topWaStatusLoading = false;
  if (topWaStatusButton) topWaStatusButton.hidden = true;
}

async function refreshTopWaStatus() {
  if (!state.auth || !can('wa-gateway:manage')) {
    hideTopWaStatus();
    return;
  }
  if (topWaStatusLoading) return;
  topWaStatusLoading = true;
  setTopWaStatus({ online: false, loading: true });
  try {
    const payload = await api('/api/wa-gateway/waha/status', { skipAuthRedirect: true, timeoutMs: 7000 });
    setTopWaStatus({ online: wahaIsOnline(payload.status || {}) });
  } catch {
    setTopWaStatus({ online: false });
  } finally {
    topWaStatusLoading = false;
  }
}

function startTopWaStatusTimer() {
  window.clearInterval(topWaStatusTimer);
  if (!state.auth || !can('wa-gateway:manage')) {
    hideTopWaStatus();
    return;
  }
  setTopWaStatus({ online: false, loading: true });
  refreshTopWaStatus();
  topWaStatusTimer = window.setInterval(() => refreshTopWaStatus(), 60000);
}

function navButtonMatchesView(button, view) {
  if (!button) return false;
  if (button.dataset.view === view) return true;
  return String(button.dataset.relatedViews || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(view);
}

function canView(view) {
  if (!view || !Object.prototype.hasOwnProperty.call(viewPermissions, view)) return false;
  const role = state.auth?.role || '';
  if (role === 'reseller_voucher') {
    return ['dashboard', 'radiusHotspot', 'reportsVoucherDaily', 'reportsVoucherMonthly'].includes(view) && can(viewPermissions[view]);
  }
  if (role === 'collector') {
    return ['dashboard', 'monitoringMembers', 'monitoringBilling', 'reportsDaily', 'reportsMonthlyBilling'].includes(view) && can(viewPermissions[view]);
  }
  return can(viewPermissions[view]);
}

function firstAvailableView() {
  return ['dashboard', 'radiusPppDhcp', 'radiusHotspot', 'radiusSettings', 'genieAcs', 'monitoringSite', 'monitoringMembers', 'monitoringCustomers', 'monitoringBilling', 'monitoringServices', 'externalIncomes', 'expenses', 'reportsDaily', 'reportsMonthlyBilling', 'reportsStatistics', 'reportsVoucherDaily', 'reportsVoucherMonthly', 'reportsTransactions', 'reportsFinanceRecap', 'reportsInventoryStock', 'diagnostics', 'activity', 'waGateway', 'paymentGateway', 'inventory', 'networkAssets', 'users', 'settings'].find(canView) || 'dashboard';
}

function normalizeView(view) {
  if (view === 'monitoring') return 'monitoringSite';
  return view;
}

function storageValue(key) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function currentHashView() {
  return normalizeView(String(window.location.hash || '').replace(/^#\/?/, '').trim());
}

function storedView() {
  const raw = currentHashView()
    || storageValue(LOGIN_RETURN_VIEW_STORAGE_KEY)
    || storageValue(LAST_VIEW_STORAGE_KEY)
    || storageValue(LEGACY_LAST_VIEW_STORAGE_KEY)
    || '';
  return normalizeView(raw);
}

function rememberView(view, options = {}) {
  const safe = normalizeView(view);
  if (!safe) return;
  try {
    window.localStorage.setItem(LAST_VIEW_STORAGE_KEY, safe);
  } catch (error) {
    // Ignore private-mode storage failures; hash still preserves refresh state.
  }
  const nextUrl = `${window.location.pathname}${window.location.search}#${safe}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
    const method = options.replace ? 'replaceState' : 'pushState';
    window.history[method]({ view: safe }, '', nextUrl);
  } else if (options.replace) {
    window.history.replaceState({ view: safe }, '', nextUrl);
  }
}

function rememberLoginReturnView(view = '') {
  const safe = normalizeView(view || currentHashView() || state.view || storageValue(LAST_VIEW_STORAGE_KEY) || storageValue(LEGACY_LAST_VIEW_STORAGE_KEY));
  if (!safe) return;
  try {
    window.localStorage.setItem(LOGIN_RETURN_VIEW_STORAGE_KEY, safe);
  } catch {
    // Login tetap berjalan meski storage browser tidak tersedia.
  }
}

function takeLoginReturnView() {
  const safe = storedView();
  try {
    window.localStorage.removeItem(LOGIN_RETURN_VIEW_STORAGE_KEY);
  } catch {
    // Ignore private-mode storage failures.
  }
  return safe;
}

function clearRealtimeTimers() {
  if (genieAcsRecentTimer) {
    window.clearTimeout(genieAcsRecentTimer);
    genieAcsRecentTimer = null;
  }
  if (monitoringCustomersTimer) {
    window.clearTimeout(monitoringCustomersTimer);
    monitoringCustomersTimer = null;
  }
  if (monitoringServicesTimer) {
    window.clearTimeout(monitoringServicesTimer);
    monitoringServicesTimer = null;
  }
  if (monitoringBillingTimer) {
    window.clearTimeout(monitoringBillingTimer);
    monitoringBillingTimer = null;
  }
  if (voucherDataTimer) {
    window.clearTimeout(voucherDataTimer);
    voucherDataTimer = null;
  }
  if (dashboardRouterNasTimer) {
    window.clearTimeout(dashboardRouterNasTimer);
    dashboardRouterNasTimer = null;
  }
  Object.values(dashboardRouterNasCharts || {}).forEach((chart) => {
    if (chart && typeof chart.destroy === 'function') chart.destroy();
  });
  dashboardRouterNasCharts = {};
}

function menuIsMobile() {
  return mobileMenuQuery.matches;
}

function updateMenuButton() {
  if (!menuToggleButton) return;
  const expanded = menuIsMobile()
    ? document.body.classList.contains('is-menu-open')
    : !document.body.classList.contains('is-sidebar-collapsed');
  menuToggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  menuToggleButton.setAttribute('aria-label', menuIsMobile()
    ? (expanded ? 'Tutup menu' : 'Buka menu')
    : (expanded ? 'Ciutkan menu' : 'Buka menu'));
}

function setMenuOpen(open) {
  const nextOpen = Boolean(open) && menuIsMobile();
  document.body.classList.toggle('is-menu-open', nextOpen);
  if (!nextOpen) document.body.classList.remove('is-menu-full');
  updateMenuButton();
}

function toggleMenu() {
  if (menuIsMobile()) {
    setMenuOpen(!document.body.classList.contains('is-menu-open'));
    return;
  }

  document.body.classList.toggle('is-sidebar-collapsed');
  if (menuToggleButton) {
    setMenuOpen(false);
  }
  updateMenuButton();
}

function roleLabel(role) {
  const found = state.roles.find((item) => item.value === role);
  return found ? found.label : role;
}

function roleDescription(role) {
  const found = state.roles.find((item) => item.value === role);
  return found?.description || 'Akses mengikuti role yang dipilih.';
}

function setPeriodPickerOpen(open) {
  if (!periodPickerPanel || !periodPickerButton) return;
  periodPickerPanel.hidden = !open;
  periodPickerButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  periodPicker?.classList.toggle('is-open', open);
}

function setAccountMenuOpen(open) {
  if (!accountPanel || !profileButton || !accountMenu) return;
  const visible = Boolean(open && state.auth);
  accountPanel.hidden = !visible;
  accountMenu.classList.toggle('is-open', visible);
  profileButton.setAttribute('aria-expanded', visible ? 'true' : 'false');
}

function toggleAccountMenu() {
  setAccountMenuOpen(accountPanel?.hidden !== false);
}

function updatePeriodPicker() {
  if (periodPickerLabel) {
    periodPickerLabel.textContent = periodLabel(state.period);
  }
  if (periodYearSelect) {
    const { year } = periodParts(state.period);
    const start = year - 4;
    const years = Array.from({ length: 9 }, (_, index) => start + index);
    periodYearSelect.innerHTML = years.map((item) => `<option value="${item}" ${item === year ? 'selected' : ''}>${item}</option>`).join('');
  }
  renderPeriodMonths();
}

function renderPeriodMonths() {
  if (!periodMonthGrid) return;
  const { year, month } = periodParts(state.period);
  periodMonthGrid.innerHTML = MONTH_LABELS.map((label, index) => {
    const value = `${year}-${String(index + 1).padStart(2, '0')}`;
    const active = value === state.period;
    return `<button class="period-month ${active ? 'is-active' : ''}" type="button" data-period-month="${value}">${label}</button>`;
  }).join('');
}

function setPeriod(period) {
  const safePeriod = normalizedPeriod(period);
  if (state.period === safePeriod) {
    updatePeriodPicker();
    return;
  }
  state.period = safePeriod;
  updatePeriodPicker();
  render();
}

function configureShell() {
  const loggedIn = Boolean(state.auth);
  try {
    if (loggedIn) localStorage.setItem('fakenetAuthHint', '1');
    else localStorage.removeItem('fakenetAuthHint');
  } catch {
    // Hint hanya mempercepat skeleton awal; sesi tetap ditentukan server.
  }
  document.body.classList.remove('is-loading-auth');
  document.body.classList.remove('is-bootstrap-login');
  document.body.classList.toggle('is-login', !loggedIn);
  document.body.classList.toggle('is-authenticated', loggedIn);
  document.body.classList.toggle('is-dashboard-view', loggedIn && state.view === 'dashboard');
  applyBranding();
  if (!loggedIn) {
    setMenuOpen(false);
    setAccountMenuOpen(false);
    window.clearInterval(notificationsTimer);
    hideNotifications();
    hideTopWaStatus();
    restoreLoginIfNeeded();
  }

  if (currentUserName) {
    currentUserName.textContent = loggedIn ? (state.auth.name || state.auth.username) : '';
  }
  if (accountGreeting) {
    accountGreeting.textContent = loggedIn ? `Hi, ${state.auth.name || state.auth.username}` : 'Hi, -';
  }
  if (profileButton) {
    profileButton.hidden = !loggedIn;
    profileButton.title = loggedIn ? 'Akun Saya' : '';
  }
  if (accountMenu) {
    accountMenu.hidden = !loggedIn;
  }
  if (currentUserAvatar) {
    const photoUrl = loggedIn ? safeProfilePhotoUrl(state.auth.photoUrl || state.auth.avatarUrl) : '';
    const avatarUrl = loggedIn ? profilePhotoDisplayUrl(state.auth) : '';
    currentUserAvatar.innerHTML = avatarUrl
      ? avatarImageMarkup(avatarUrl, `Foto ${state.auth.name || state.auth.username || 'user'}`)
      : '-';
    currentUserAvatar.classList.toggle('has-photo', Boolean(photoUrl));
    currentUserAvatar.classList.toggle('is-default', loggedIn && !photoUrl);
    currentUserAvatar.style.backgroundImage = '';
  }
  if (loggedIn) {
    startTopWaStatusTimer();
  }
  if (dashboardPrivacyTopButton) {
    dashboardPrivacyTopButton.hidden = !loggedIn || state.view !== 'dashboard' || !canUseDashboardPrivacy();
    updateDashboardPrivacyControls();
  }

  document.querySelectorAll('[data-view]').forEach((button) => {
    const visible = loggedIn && canView(button.dataset.view);
    button.hidden = !visible;
    button.classList.toggle('is-active', visible && navButtonMatchesView(button, state.view));
  });
  document.querySelectorAll('[data-nav-group]').forEach((group) => {
    const children = [...group.querySelectorAll('[data-view]')];
    const visible = children.some((button) => !button.hidden);
    const active = children.some((button) => !button.hidden && navButtonMatchesView(button, state.view));
    const open = visible && group.classList.contains('is-open');
    const toggle = group.querySelector('[data-nav-toggle]');
    group.hidden = !visible;
    group.classList.toggle('is-open', open);
    if (toggle) {
      toggle.hidden = !visible;
      toggle.classList.toggle('is-active', visible && active);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  });
  document.querySelectorAll('[data-open-nav-group]').forEach((button) => {
    const group = document.querySelector(`[data-nav-group="${button.dataset.openNavGroup}"]`);
    const children = group ? [...group.querySelectorAll('[data-view]')] : [];
    const visible = loggedIn && children.some((item) => canView(item.dataset.view));
    const active = children.some((item) => canView(item.dataset.view) && navButtonMatchesView(item, state.view));
    button.hidden = !visible;
    button.classList.toggle('is-active', visible && active);
  });
  const fullMenuViews = new Set(['monitoringSite', 'monitoringServices', 'genieAcs', 'networkAssets', 'billingSettings', 'radiusSettings', 'paymentGateway', 'waGateway', 'reportsInventoryStock', 'inventory', 'users', 'settings', 'diagnostics', 'activity']);
  document.querySelectorAll('[data-open-menu], [data-open-full-menu]').forEach((button) => {
    button.hidden = !loggedIn;
    button.classList.toggle('is-active', loggedIn && fullMenuViews.has(state.view));
  });
  updateMenuButton();
}

function setView(view, options = {}) {
  if (!state.auth) {
    rememberLoginReturnView(view);
    renderLogin();
    return;
  }

  const requestedView = normalizeView(view);
  const nextView = canView(requestedView) ? requestedView : firstAvailableView();
  const enteringMonitoringBilling = nextView === 'monitoringBilling' && state.view !== 'monitoringBilling';
  if (nextView !== state.view) {
    abortPageRequests();
    state.search = '';
    state.activityPage = 1;
    state.monitoringCustomerPage = 1;
    state.monitoringCustomerSite = 'all';
    state.monitoringCustomerType = 'pppoe';
    state.monitoringMemberPage = 1;
    state.monitoringMemberStatus = 'all';
    state.monitoringMemberPaymentType = 'all';
    state.monitoringMemberBillingPeriod = 'all';
    state.monitoringMemberNewCustomer = 'all';
    state.monitoringMemberNas = 'all';
    state.monitoringMemberPeriod = 'all';
    state.monitoringMemberFrom = '';
    state.monitoringMemberTo = '';
    state.monitoringMemberCreator = 'all';
    state.monitoringServicesPage = 1;
    state.monitoringServicesTab = 'tv';
    state.monitoringServicesSite = 'all';
    state.monitoringBillingPage = 1;
    if (enteringMonitoringBilling && !state.monitoringBillingKeepPreset) {
      state.monitoringBillingStatus = 'collectible';
      state.monitoringBillingCustomerStatus = 'all';
      state.monitoringBillingSite = 'all';
      state.monitoringBillingPeriod = todayInput().slice(0, 7);
      state.monitoringBillingScope = 'collectible';
    }
    state.monitoringBillingKeepPreset = false;
    state.radiusPppPage = 1;
    state.radiusPppInternet = '';
    state.radiusHotspotPage = 1;
    state.radiusHotspotInternet = '';
    state.radiusSettingsPage = 1;
    state.genieAcsPage = 1;
    state.genieAcsStatus = 'all';
    state.genieAcsNas = 'all';
    state.xenditPage = 1;
    state.xenditNextId = '';
    state.xenditCursorStack = [''];
    state.xenditBalancePage = 1;
    state.xenditPendingPage = 1;
    state.xenditReportPage = 1;
    state.paymentGatewayTab = 'transactions';
    state.paymentGatewayPage = 1;
    state.reportTransactionsPage = 1;
    state.reportTransactionsMethod = 'all';
    state.reportNas = 'all';
    state.reportMonthlyBillingPage = 1;
    state.reportMonthlyBillingStatus = 'all';
    state.reportVoucherDailyPage = 1;
    state.inventoryPage = 1;
    state.inventoryReportPage = 1;
  }
  if (!['monitoringCustomers', 'monitoringServices'].includes(nextView)) {
    clearRealtimeTimers();
  }
  state.view = nextView;
  rememberView(nextView, { replace: Boolean(options.replace) });
  viewTitle.textContent = titles[state.view] || 'Dashboard';
  setMenuOpen(false);
  configureShell();
  render();
}

async function copyTextToClipboard(text = '') {
  const value = String(text || '');
  if (!value) throw new Error('Tidak ada teks untuk disalin');
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back for HTTP/local browsers that block the Clipboard API.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Browser tidak mengizinkan copy otomatis');
}

function formData(form) {
  const data = {};
  const formEntries = new FormData(form);
  for (const [key, value] of formEntries.entries()) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
    } else {
      data[key] = value;
    }
  }
  form.querySelectorAll('select[multiple][name]').forEach((select) => {
    data[select.name] = [...select.selectedOptions].map((option) => option.value).filter(Boolean);
  });
  const multiCheckboxes = [...form.querySelectorAll('input[type="checkbox"][name][data-multi-value]')];
  const multiCheckboxNames = new Set();
  multiCheckboxes.forEach((checkbox) => {
    multiCheckboxNames.add(checkbox.name);
  });
  multiCheckboxNames.forEach((name) => {
    data[name] = multiCheckboxes
      .filter((checkbox) => checkbox.name === name && checkbox.checked)
      .map((checkbox) => checkbox.value)
      .filter(Boolean);
  });
  form.querySelectorAll('input[type="checkbox"][name]:not([data-multi-value])').forEach((checkbox) => {
    data[checkbox.name] = checkbox.checked;
  });
  return data;
}

const MOBILE_CARD_TABLE_VIEWS = new Set([
  'externalIncomes',
  'expenses',
  'reportsFinanceRecap',
  'reportsMonthlyBilling',
  'monitoringSite',
  'genieAcs',
  'networkAssets',
  'waGateway',
  'inventory',
  'reportsInventoryStock',
  'users',
  'monitoringBilling',
  'monitoringMembers',
  'radiusPppDhcp',
  'radiusHotspot',
  'monitoringCustomers',
  'reportsDaily',
  'reportsTransactions',
  'reportsVoucherDaily',
  'reportsVoucherMonthly'
]);

const MOBILE_TECHNICAL_COLUMNS = Object.freeze({
  monitoringBilling: new Set(['nas', 'terakhir aktif', 'last active']),
  radiusPppDhcp: new Set(['password', 'mac', 'mac address']),
  radiusHotspot: new Set(['password', 'mac', 'mac address'])
});

function normalizedTableLabel(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decorateResponsiveTables(root = document, view = state.view) {
  if (!MOBILE_CARD_TABLE_VIEWS.has(view)) return;
  const technicalColumns = MOBILE_TECHNICAL_COLUMNS[view] || new Set();
  root.querySelectorAll('.table-wrap table, .detail-table-wrap table').forEach((table) => {
    if (table.closest('.receipt-preview, .daily-billing-receipt-stack, .hotspot-voucher-print-stack')) return;
    const headers = [...table.querySelectorAll('thead th')].map((header) => normalizedTableLabel(header.textContent));
    if (!headers.length) return;
    table.classList.add('mobile-card-table');
    table.closest('.table-wrap, .detail-table-wrap')?.classList.add('mobile-card-wrap');
    table.querySelectorAll('tbody tr').forEach((row) => {
      const cells = [...row.children].filter((cell) => cell.tagName === 'TD');
      if (!cells.length || cells.some((cell) => Number(cell.colSpan || 1) > 1)) return;
      let primaryAssigned = false;
      cells.forEach((cell, index) => {
        const label = headers[index] || '';
        const labelKey = label.toLowerCase();
        cell.dataset.label = label || (cell.querySelector('input[type="checkbox"]') ? 'Pilih' : 'Detail');
        if (cell.querySelector('input[type="checkbox"]')) {
          cell.dataset.mobileSelect = 'true';
        }
        if (!primaryAssigned && /^(nama|nama pelanggan|username|user|referensi|invoice|no invoice)$/i.test(label)) {
          cell.dataset.mobilePrimary = 'true';
          primaryAssigned = true;
        }
        cell.classList.toggle('mobile-technical-cell', technicalColumns.has(labelKey));
      });
    });
  });
}

function enhanceTableTopScrollbars(root = document) {
  const scope = root || document;
  const wrappers = [...scope.querySelectorAll('.table-wrap, .detail-table-wrap')]
    .filter((wrapper) => !wrapper.classList.contains('no-top-scroll'));
  wrappers.forEach((wrapper) => {
    if (!wrapper.isConnected) return;
    let topScroll = wrapper.previousElementSibling;
    if (!topScroll?.classList?.contains('table-top-scroll')) {
      topScroll = document.createElement('div');
      topScroll.className = 'table-top-scroll';
      topScroll.setAttribute('aria-hidden', 'true');
      topScroll.innerHTML = '<div></div>';
      wrapper.parentNode?.insertBefore(topScroll, wrapper);
    }
    wrapper.classList.add('has-top-scrollbar');
    const mobileCard = mobileMenuQuery.matches && wrapper.classList.contains('mobile-card-wrap');
    topScroll.dataset.forMobileCard = mobileCard ? 'true' : 'false';
    const inner = topScroll.firstElementChild;
    const update = () => {
      if (!inner) return;
      const width = Math.max(wrapper.scrollWidth, wrapper.clientWidth);
      inner.style.width = `${width}px`;
      topScroll.hidden = mobileCard || wrapper.scrollWidth <= wrapper.clientWidth + 2;
      topScroll.scrollLeft = wrapper.scrollLeft;
    };
    if (topScroll.dataset.topScrollBound !== 'true') {
      topScroll.addEventListener('scroll', () => {
        let syncing = topScroll.dataset.syncing === 'true' || wrapper.dataset.syncing === 'true';
        if (syncing) return;
        topScroll.dataset.syncing = 'true';
        wrapper.scrollLeft = topScroll.scrollLeft;
        requestAnimationFrame(() => { topScroll.dataset.syncing = 'false'; });
      }, { passive: true });
      topScroll.dataset.topScrollBound = 'true';
    }
    if (wrapper.dataset.topScrollReady !== 'true') {
      wrapper.addEventListener('scroll', () => {
        let syncing = topScroll.dataset.syncing === 'true' || wrapper.dataset.syncing === 'true';
        if (syncing) return;
        wrapper.dataset.syncing = 'true';
        topScroll.scrollLeft = wrapper.scrollLeft;
        requestAnimationFrame(() => { wrapper.dataset.syncing = 'false'; });
      }, { passive: true });
      if (window.ResizeObserver) {
        const observer = new ResizeObserver(update);
        observer.observe(wrapper);
        wrapper.querySelectorAll('table').forEach((table) => observer.observe(table));
      }
      wrapper.dataset.topScrollReady = 'true';
    }
    update();
  });
}

function scheduleTableTopScrollbars(root = document) {
  const scope = root || document;
  const run = () => {
    decorateResponsiveTables(scope, state.view);
    enhanceTableTopScrollbars(scope);
    restoreSearchFocusIntent();
  };
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });
  window.setTimeout(run, 80);
  window.setTimeout(run, 250);
  window.setTimeout(run, 600);
}

let observedTableScrollbarFrame = 0;
const observedTableScrollbarRoots = new Set();

function queueObservedTableTopScrollbars(root = document) {
  observedTableScrollbarRoots.add(root || document);
  if (observedTableScrollbarFrame) return;
  observedTableScrollbarFrame = requestAnimationFrame(() => {
    observedTableScrollbarFrame = 0;
    const roots = [...observedTableScrollbarRoots];
    observedTableScrollbarRoots.clear();
    roots.forEach((scope) => enhanceTableTopScrollbars(scope));
  });
}

function mutationTouchesScrollableTable(record) {
  if (record.target instanceof Element && record.target.closest('.table-wrap, .detail-table-wrap')) {
    return true;
  }
  return [...record.addedNodes].some((node) => node instanceof Element && (
    node.matches('.table-wrap, .detail-table-wrap')
    || Boolean(node.querySelector('.table-wrap, .detail-table-wrap'))
  ));
}

function observeTableTopScrollbars(root) {
  if (!root || !('MutationObserver' in window)) return null;
  const observer = new MutationObserver((records) => {
    if (records.some(mutationTouchesScrollableTable)) {
      queueObservedTableTopScrollbars(root);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return observer;
}

function openModal(title, body, onSubmit) {
  if (notificationPanel) {
    notificationPanel.hidden = true;
    notificationButton?.setAttribute('aria-expanded', 'false');
  }
  modalTitle.textContent = title;
  modalBody.innerHTML = body;
  const form = modal.querySelector('.modal-frame');
  modalBody.scrollTop = 0;
  form.scrollTop = 0;
  modal.querySelectorAll('[value="cancel"], [data-close-modal]').forEach((button) => {
    button.type = 'button';
    button.formNoValidate = true;
    button.onclick = (event) => {
      event.preventDefault();
      modal.close();
    };
  });
  form.onkeydown = (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    const target = event.target;
    if (target?.matches?.('textarea, [contenteditable="true"]')) return;
    const submitButtons = [...form.querySelectorAll('button[type="submit"], input[type="submit"]')]
      .filter((button) => button.value !== 'cancel' && !button.disabled && !button.hidden && button.offsetParent !== null);
    if (submitButtons.length) return;
    event.preventDefault();
    const actionButton = [...form.querySelectorAll('button[type="button"]')]
      .find((button) => !button.disabled && !button.hidden && button.offsetParent !== null && button.value !== 'cancel' && button.dataset.closeModal === undefined && button.classList.contains('button'));
    actionButton?.click();
  };
  form.onsubmit = async (event) => {
    if (event.submitter && event.submitter.value === 'cancel') {
      event.preventDefault();
      modal.close();
      return;
    }
    event.preventDefault();
    try {
      const result = await onSubmit(formData(form), form);
      if (result !== false) modal.close();
    } catch (error) {
      setToast(error.message);
    }
  };
  modal.showModal();
  requestAnimationFrame(() => {
    modalBody.scrollTop = 0;
    form.scrollTop = 0;
    scheduleTableTopScrollbars(modalBody);
  });
}

modal?.addEventListener('close', () => {
  window.setTimeout(mountToastLayer, 0);
});

function metric(label, value, sub, tone = '') {
  const protectValue = state.view === 'dashboard';
  const valueText = String(value ?? '');
  const subText = String(sub || '');
  return `
    <article class="metric-card ${tone}">
      <div class="label">${escapeHtml(label)}</div>
      <strong class="dashboard-value${dashboardValueSizeClass(valueText)}"${protectValue ? dashboardPrivateValueAttr(valueText) : ''}>${escapeHtml(protectValue ? dashboardPrivateText(valueText) : valueText)}</strong>
      <div class="sub"${protectValue ? dashboardPrivateValueAttr(subText) : ''}>${escapeHtml(protectValue ? dashboardPrivateText(subText) : subText)}</div>
    </article>
  `;
}

function nasActiveBadge(value = '-', options = {}) {
  const label = String(value || '').trim() || '-';
  const title = String(options.title || label).trim() || label;
  return `<span class="badge active nas-badge" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

function nasTargetBadges(value = '-') {
  const labels = Array.isArray(value)
    ? value
    : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  const rows = labels.length ? labels : ['-'];
  return `<span class="nas-target-badges">${rows.map((label) => nasActiveBadge(label)).join('')}</span>`;
}

function nasTargetContext(label, value, hint = '') {
  return `
    <section class="nas-target-context" aria-label="${escapeHtml(label)}">
      <div>
        <span>${escapeHtml(label)}</span>
        ${hint ? `<small>${escapeHtml(hint)}</small>` : ''}
      </div>
      ${nasTargetBadges(value)}
    </section>
  `;
}

function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function mbpsText(value) {
  return bitRateText(value);
}

function mbpsAxisText(value) {
  return bitRateText(value);
}

function niceBitRateCeil(value) {
  const number = Math.max(1, Number(value || 0));
  const exponent = Math.floor(Math.log10(number));
  const base = 10 ** exponent;
  const fraction = number / base;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * base;
}

function routerTrafficChartMax(points = []) {
  const rawMax = Math.max(0, ...points.flatMap((point) => [Number(point.upload || 0), Number(point.download || 0)]));
  if (rawMax <= 0) return 1000;
  return niceBitRateCeil(rawMax * 1.18);
}

function dashboardNavigationAttributes(view = '', action = '') {
  const safeView = normalizeView(view);
  if (!safeView || !canView(safeView)) return '';
  return ` role="button" tabindex="0" data-dashboard-view="${escapeHtml(safeView)}"${action ? ` data-dashboard-action="${escapeHtml(action)}"` : ''}`;
}

function dashboardPrivacyHidden() {
  return canUseDashboardPrivacy() && Boolean(state.dashboardValuesHidden);
}

function canUseDashboardPrivacy() {
  const role = String(state.auth?.role || '').toLowerCase();
  return ['admin', 'owner', 'finance', 'secretary'].includes(role);
}

function dashboardMaskText(value = '') {
  return String(value ?? '').replace(/\d[\d.,]*/g, '****');
}

function dashboardPrivateText(value = '', options = {}) {
  const text = String(value ?? '');
  if (dashboardPrivacyHidden() && options.maskAll) return '****';
  return dashboardPrivacyHidden() ? dashboardMaskText(text) : text;
}

function dashboardPrivateValueAttr(value = '', options = {}) {
  return ` data-dashboard-private-value="${escapeHtml(String(value ?? ''))}"${options.maskAll ? ' data-dashboard-private-mask="all"' : ''}`;
}

function dashboardPrivateTitleAttr(value = '') {
  const text = String(value ?? '');
  return ` data-dashboard-private-title="${escapeHtml(text)}" title="${escapeHtml(dashboardPrivateText(text))}"`;
}

function dashboardMoneyValue(value = 0) {
  return rupiah(value);
}

function dashboardCountValue(value = 0) {
  return displayNumber(value);
}

function dashboardPercentValue(value = 0) {
  return dashboardPercentText(value);
}

function dashboardValueSizeClass(value = '') {
  const text = String(value ?? '');
  const digitCount = text.replace(/\D/g, '').length;
  return digitCount >= 9 || text.length >= 16 ? ' is-compact-value' : '';
}

function dashboardPrivacyToggleMarkup() {
  return `
    <div class="dashboard-control-row">
      <div class="dashboard-period-control">
        ${periodFilterControls('dashboardPeriod', state.period || todayInput().slice(0, 7))}
      </div>
    </div>
  `;
}

function updateDashboardPrivacyControls() {
  const hidden = dashboardPrivacyHidden();
  document.querySelectorAll('[data-dashboard-privacy-toggle], #dashboardPrivacyTopButton').forEach((button) => {
    if (!button) return;
    button.classList.toggle('is-hidden', hidden);
    button.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    button.setAttribute('aria-label', hidden ? 'Tampilkan angka dashboard' : 'Sembunyikan angka dashboard');
    button.title = hidden ? 'Tampilkan angka dashboard' : 'Sembunyikan angka dashboard';
    const icon = button.querySelector('.dashboard-privacy-icon');
    if (icon) {
      icon.classList.toggle('is-off', hidden);
      icon.classList.toggle('is-on', !hidden);
    }
  });
}

function applyDashboardPrivacyState(root = app) {
  const hidden = dashboardPrivacyHidden();
  root.querySelectorAll('[data-dashboard-private-value]').forEach((element) => {
    const raw = element.dataset.dashboardPrivateValue || '';
    const maskAll = element.dataset.dashboardPrivateMask === 'all';
    element.textContent = hidden ? (maskAll ? '****' : dashboardMaskText(raw)) : raw;
  });
  root.querySelectorAll('[data-dashboard-private-title]').forEach((element) => {
    const raw = element.dataset.dashboardPrivateTitle || '';
    element.title = hidden ? dashboardMaskText(raw) : raw;
  });
  root.querySelectorAll('[data-dashboard-session-title]').forEach((element) => {
    const count = element.dataset.dashboardSessionCount || '';
    const percent = element.dataset.dashboardSessionPercent || '';
    element.title = `Session Online ${hidden ? dashboardMaskText(count) : count} Users / ${percent}%`;
  });
  updateDashboardPrivacyControls();
}

function toggleDashboardPrivacy() {
    if (!canUseDashboardPrivacy()) return;
    state.dashboardValuesHidden = !dashboardPrivacyHidden();
    try {
      if (state.dashboardValuesHidden) {
        window.localStorage.setItem(DASHBOARD_PRIVACY_STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(DASHBOARD_PRIVACY_STORAGE_KEY);
      }
    } catch {
      // Private-mode browser can block local storage.
    }
    applyDashboardPrivacyState();
}

function bindDashboardPrivacyToggle() {
  bindPeriodFilter('dashboardPeriod', (nextPeriod) => {
    state.period = normalizedPeriod(nextPeriod);
    render();
  });
  app.querySelector('[data-dashboard-privacy-toggle]')?.addEventListener('click', toggleDashboardPrivacy);
}

function dashboardRadbillCard(label, value, sub = '', tone = 'neutral', icon = '•', view = '', action = '') {
  const viewAttr = dashboardNavigationAttributes(view, action);
  const clickClass = viewAttr ? ' is-clickable' : '';
  return `
    <article class="dashboard-radbill-card tone-${escapeHtml(tone)}${clickClass}"${viewAttr}>
      <div class="dashboard-radbill-icon">${escapeHtml(icon)}</div>
      <div class="dashboard-radbill-card-body">
        <p>${escapeHtml(label)}</p>
        <strong class="dashboard-value${dashboardValueSizeClass(value)}"${dashboardPrivateValueAttr(value)}>${escapeHtml(dashboardPrivateText(value))}</strong>
        <span${dashboardPrivateValueAttr(sub || '')}>${escapeHtml(dashboardPrivateText(sub || ''))}</span>
      </div>
      ${viewAttr ? '<div class="dashboard-radbill-arrow">›</div>' : ''}
    </article>
  `;
}

function applyDashboardMonitoringBillingPreset(status = 'all', customerStatus = 'all', scope = 'month') {
  const period = normalizedPeriod(state.period || todayInput().slice(0, 7));
  state.monitoringBillingStatus = status;
  state.monitoringBillingCustomerStatus = customerStatus;
  state.monitoringBillingSite = 'all';
  state.monitoringBillingPeriod = period;
  state.monitoringBillingScope = scope;
  state.monitoringBillingPage = 1;
  state.monitoringBillingKeepPreset = true;
  state.search = '';
  saveMonitoringBillingPeriod(period);
}

function applyDashboardViewAction(action = '', view = '') {
  const period = normalizedPeriod(state.period || todayInput().slice(0, 7));
  if (view === 'reportsMonthlyBilling') {
    state.reportMonthlyBillingStatus = 'all';
    state.reportMonthlyBillingPage = 1;
    state.period = period;
  }
  if (view === 'expenses') {
    state.expensePeriod = period;
    state.search = '';
  }
  if (view === 'reportsTransactions') {
    state.reportTransactionsPeriod = period;
    state.reportTransactionsMethod = 'all';
    state.reportTransactionsPage = 1;
    state.search = '';
  }
  if (action === 'billing-paid') {
    applyDashboardMonitoringBillingPreset('paid', 'all', 'month');
  } else if (action === 'billing-all') {
    applyDashboardMonitoringBillingPreset('all', 'all', 'month');
  } else if (action === 'billing-unpaid') {
    applyDashboardMonitoringBillingPreset('collectible', 'all', 'collectible');
  } else if (action === 'billing-overdue') {
    applyDashboardMonitoringBillingPreset('overdue', 'all', 'collectible');
  }
}

function dashboardBillingCell(label, count, amount, tone = '', action = '') {
  const viewAttr = dashboardNavigationAttributes('monitoringBilling', action);
  const amountText = dashboardMoneyValue(amount || 0);
  return `
    <div class="${[tone, viewAttr ? 'is-clickable' : ''].filter(Boolean).join(' ')}"${viewAttr}>
      <small>${escapeHtml(label)}</small>
      <strong class="dashboard-value${dashboardValueSizeClass(count)}"${dashboardPrivateValueAttr(dashboardCountValue(count || 0))}>${escapeHtml(dashboardPrivateText(dashboardCountValue(count || 0)))}</strong>
      <span class="dashboard-value${dashboardValueSizeClass(amountText)}"${dashboardPrivateValueAttr(amountText)}>${escapeHtml(dashboardPrivateText(amountText))}</span>
    </div>
  `;
}

function dashboardFinanceOverview(summary = {}) {
  const monthlyEarning = Number(summary.dashboardIncomeAmount ?? summary.paidRevenue ?? 0);
  const monthlyExpense = Number(summary.expenseTotal || 0);
  const billing = summary.billingSummary || {};
  const monthlyTransaction = Number(summary.monthlyTransactionCount || summary.paidCount || 0);
  const monthlyIncomeCount = Number(summary.dashboardIncomeCount || monthlyTransaction || 0);
  const netCash = Number(summary.netCash || 0);
  return `
    <section class="dashboard-radbill-top">
      ${dashboardRadbillCard('Pendapatan Bulan Ini', dashboardMoneyValue(monthlyEarning), `${dashboardCountValue(monthlyIncomeCount)} pemasukan`, 'success', 'Rp', 'reportsTransactions', 'monthly-income-report')}
      ${dashboardRadbillCard('Tagihan Terbayar', dashboardMoneyValue(billing.monthlyPaidAmount || 0), `${dashboardCountValue(billing.monthlyPaidCount || 0)} invoice lunas`, 'info', '✓', 'monitoringBilling', 'billing-paid')}
      ${dashboardRadbillCard('Pengeluaran Bulan Ini', dashboardMoneyValue(monthlyExpense), 'Biaya operasional', 'danger', '−', 'expenses', 'monthly-expenses')}
      ${dashboardRadbillCard('Profit Bulan Ini', dashboardMoneyValue(netCash), netCash >= 0 ? 'Surplus kas' : 'Defisit kas', netCash >= 0 ? 'violet' : 'danger', '↗', 'reportsTransactions', 'monthly-transactions')}
    </section>
  `;
}

function dashboardMiniMetric(label, value, sub, tone = '') {
  const valueText = String(value ?? '');
  return `
    <article class="dashboard-mini-card ${tone}">
      <strong class="dashboard-value${dashboardValueSizeClass(valueText)}"${dashboardPrivateValueAttr(valueText)}>${escapeHtml(dashboardPrivateText(valueText))}</strong>
      <div class="label">${escapeHtml(label)}</div>
    </article>
  `;
}

function dashboardPersonalScopeOverview(scope = {}) {
  if (!scope || !scope.type) return '';
  const rate = Number(scope.ratePercent || 0);
  const ruleParts = [];
  if (scope.type === 'collector') {
    ruleParts.push(scope.bonusEnabled === false ? 'Bonus nonaktif' : 'Tier harian aktif');
  } else if (rate > 0) {
    ruleParts.push(`${rate.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`);
  }
  const ruleText = ruleParts.length ? ruleParts.join(' + ') : 'Belum diatur';
  const countValue = scope.type === 'reseller_voucher'
    ? displayNumber(scope.itemCount || scope.transactionCount || 0)
    : displayNumber(scope.transactionCount || 0);
  const countLabel = scope.countLabel || (scope.type === 'reseller_voucher' ? 'Voucher Saya' : 'Transaksi Saya');
  return `
    <section class="dashboard-finance-grid dashboard-personal-grid">
      ${metric(scope.metricLabel || 'Pendapatan Saya', dashboardMoneyValue(scope.earning || 0), scope.helperText || 'Data dibatasi sesuai akun login.', 'positive')}
      ${metric(countLabel, dashboardPrivacyHidden() ? '***' : countValue, 'Periode bulan ini')}
      <div class="dashboard-finance-mini-grid">
        ${dashboardMiniMetric('Aturan Komisi', ruleText)}
        ${scope.type === 'collector'
          ? dashboardMiniMetric('Bonus Hari Ini', dashboardMoneyValue(scope.todayBonus || 0))
          : dashboardMiniMetric('Transaksi Voucher', dashboardCountValue(scope.transactionCount || 0))}
      </div>
    </section>
  `;
}

function dashboardBillingOverview(summary = {}) {
  const billing = summary.billingSummary || {};
  return `
    <section class="section dashboard-radbill-monthly">
      <div class="dashboard-radbill-section-head">
        <div class="dashboard-radbill-title">
          <span class="dashboard-radbill-square tone-info">▣</span>
          <h2>Monthly Billing</h2>
        </div>
      </div>
      <div class="dashboard-radbill-billing-grid">
        ${dashboardBillingCell('Total Invoice', billing.dashboardInvoiceCount ?? billing.monthlyInvoiceCount ?? 0, billing.dashboardInvoiceAmount ?? billing.monthlyInvoiceAmount ?? 0, '', 'billing-all')}
        ${dashboardBillingCell('Unpaid', billing.totalUnpaidCount || 0, billing.totalUnpaidAmount || 0, 'tone-warning', 'billing-unpaid')}
        ${dashboardBillingCell('Overdue', billing.overdueCount || 0, billing.overdueAmount || 0, 'tone-danger', 'billing-overdue')}
        ${dashboardBillingCell('Paid', billing.monthlyPaidCount || 0, billing.monthlyPaidAmount || 0, 'tone-success', 'billing-paid')}
      </div>
    </section>
  `;
}

function dashboardActivePercent(summary = {}) {
  const total = Number(summary.total || 0);
  if (total <= 0) return 0;
  const percent = (Number(summary.sessionOnline ?? summary.online ?? 0) / total) * 100;
  return Math.max(0, Math.min(100, Number(percent.toFixed(2))));
}

function dashboardPercentText(value = 0) {
  return Number(value || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function dashboardUserStatusPaper(title = '', summary = {}, updatedAt = '', mode = 'ppp') {
  const activePercent = dashboardActivePercent(summary);
  const sessionOnline = Number(summary.sessionOnline ?? summary.online ?? 0);
  const sessionCountText = dashboardCountValue(sessionOnline);
  const sessionPercentText = dashboardPercentValue(activePercent);
  const targetView = mode === 'hotspot' ? 'radiusHotspot' : 'radiusPppDhcp';
  const cells = mode === 'hotspot'
    ? [
      ['Total', summary.total || 0, 'stat-total'],
      ['New', summary.new || 0, 'stat-psb'],
      ['Active', sessionOnline, 'stat-active'],
      ['Isolir', summary.isolated || 0, 'warning']
    ]
    : [
      ['Total', summary.total || 0, 'stat-total', 'ppp-main'],
      ['Aktif', sessionOnline, 'stat-active', 'ppp-main'],
      ['PSB', summary.psb || 0, 'stat-psb', 'ppp-main'],
      ['Isolir', summary.isolated || 0, 'warning', 'ppp-status'],
      ['Terminated', summary.terminated || 0, 'danger', 'ppp-status'],
      ['Cabut', summary.removed || 0, 'removed', 'ppp-status']
    ];
  return `
    <section class="section dashboard-member-card ${mode === 'ppp' ? 'is-ppp' : 'is-hotspot'}">
      <div class="dashboard-member-head">
        <div class="dashboard-member-title-row">
          <h2>${escapeHtml(title)}</h2>
          ${canView(targetView) ? `<button class="icon-button dashboard-member-link" type="button" data-dashboard-radius-link="${targetView}" aria-label="Buka ${escapeHtml(title)}" title="Buka ${escapeHtml(title)}">...</button>` : ''}
        </div>
        <div class="dashboard-progress-meta">
          <span class="dashboard-session-label">Session Online</span>
          <strong class="dashboard-session-value"><span class="dashboard-session-count"${dashboardPrivateValueAttr(sessionCountText)}>${escapeHtml(dashboardPrivateText(sessionCountText))}</span> Users / ${escapeHtml(sessionPercentText)}%</strong>
        </div>
        <div class="MuiLinearProgress-root MuiLinearProgress-colorPrimary MuiLinearProgress-determinate dashboard-active-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${activePercent}" data-dashboard-session-title="1" data-dashboard-session-count="${escapeHtml(sessionCountText)}" data-dashboard-session-percent="${escapeHtml(sessionPercentText)}" title="Session Online ${escapeHtml(dashboardPrivacyHidden() ? dashboardMaskText(sessionCountText) : sessionCountText)} Users / ${escapeHtml(sessionPercentText)}%">
          <span class="MuiLinearProgress-bar MuiLinearProgress-barColorPrimary MuiLinearProgress-bar1Determinate" style="transform: translateX(-${100 - activePercent}%);"></span>
        </div>
      </div>
      <div class="dashboard-member-grid ${mode === 'ppp' ? 'is-ppp' : 'is-hotspot'}">
        ${cells.map(([label, value, tone, layout]) => `
          <span class="${[tone, layout].filter(Boolean).map((item) => escapeHtml(item)).join(' ')}">
            <small>${escapeHtml(label)}</small>
            <b class="dashboard-value${dashboardValueSizeClass(value)}"${dashboardPrivateValueAttr(dashboardCountValue(value || 0))}>${escapeHtml(dashboardPrivateText(dashboardCountValue(value || 0)))}</b>
          </span>
        `).join('')}
      </div>
    </section>
  `;
}

function dashboardMembersCompact(members = {}, radiusSummary = {}) {
  return `
    ${dashboardUserStatusPaper('PPP-DHCP Users', radiusSummary.pppDhcp || {}, members.checkedAt || '', 'ppp')}
    ${dashboardUserStatusPaper('Hotspot Users', radiusSummary.hotspot || {}, members.checkedAt || '', 'hotspot')}
  `;
}

function bindDashboardRadiusLinks() {
  app.querySelectorAll('[data-dashboard-radius-link]').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.dashboardRadiusLink;
      if (view === 'radiusPppDhcp') {
        state.radiusPppTab = 'users';
        state.radiusPppPage = 1;
      }
      if (view === 'radiusHotspot') {
        state.radiusHotspotTab = 'users';
        state.radiusHotspotPage = 1;
      }
      setView(view);
    });
  });
}

function bindDashboardViewLinks() {
  app.querySelectorAll('[data-dashboard-view]').forEach((element) => {
    const open = () => {
      const view = element.dataset.dashboardView;
      if (view && canView(view)) {
        applyDashboardViewAction(element.dataset.dashboardAction || '', view);
        setView(view);
      }
    };
    element.addEventListener('click', open);
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  });
}

function dashboardTransactionAmountClass(amount = 0) {
  return Number(amount || 0) >= 0 ? 'tone-success' : 'tone-danger';
}

function dashboardRecentTransactionsPanel(transactions = [], options = {}) {
  const rows = Array.isArray(transactions) ? transactions.slice(0, 7) : [];
  const period = options.period || state.period || todayInput().slice(0, 7);
  return `
    <section class="section dashboard-radbill-list-panel">
      <div class="dashboard-radbill-section-head">
        <div class="dashboard-radbill-title">
          <span class="dashboard-radbill-square tone-info">✓</span>
          <h2>Riwayat Transaksi</h2>
        </div>
        ${canView('reportsTransactions') ? '<button class="ghost-button compact" type="button" data-dashboard-view="reportsTransactions">Lihat Semua</button>' : `<span class="dashboard-radbill-muted">${escapeHtml(period)}</span>`}
      </div>
      <div class="dashboard-radbill-list">
        ${rows.length ? rows.map((item, index) => `
          <article class="dashboard-radbill-list-item" data-row-index="${index}">
            <div class="dashboard-radbill-list-main">
              <strong>${escapeHtml(item.description || item.customerName || item.invoiceNo || 'Transaksi')}</strong>
              <span>${escapeHtml(item.customerName || item.username || 'Unknown')} • ${escapeHtml(item.method || item.paymentCategory || item.sourceLabel || 'Pembayaran')}</span>
            </div>
            <div class="dashboard-radbill-list-side ${dashboardTransactionAmountClass(item.amount)}">
              <strong class="dashboard-value${dashboardValueSizeClass(dashboardMoneyValue(item.amount || 0))}">${escapeHtml(dashboardMoneyValue(item.amount || 0))}</strong>
              <span>${escapeHtml(dateTimeText(item.paidAt || item.submittedAt || item.createdAt || ''))}</span>
            </div>
          </article>
        `).join('') : '<div class="empty mini-empty">Belum ada transaksi pada periode ini.</div>'}
      </div>
    </section>
  `;
}

function dashboardAuditPanel(activity = []) {
  const rows = Array.isArray(activity) ? activity.slice(0, 7) : [];
  return `
    <section class="section dashboard-radbill-list-panel">
      <div class="dashboard-radbill-section-head">
        <div class="dashboard-radbill-title">
          <span class="dashboard-radbill-square tone-warning">!</span>
          <h2>Audit Log</h2>
        </div>
        ${canView('activity') ? '<button class="ghost-button compact" type="button" data-dashboard-view="activity">Lihat Semua</button>' : `<span class="dashboard-radbill-muted">${displayNumber(rows.length)} entri</span>`}
      </div>
      <div class="dashboard-radbill-list">
        ${rows.length ? rows.map((item, index) => `
          <article class="dashboard-radbill-list-item" data-row-index="${index}">
            <div class="dashboard-radbill-list-main">
              <strong>${escapeHtml(activityLabel(item.type || 'activity'))}</strong>
              <span>${escapeHtml(item.message || '-')}</span>
            </div>
            <div class="dashboard-radbill-list-side">
              <span>${escapeHtml(dateTimeText(item.at || item.createdAt || ''))}</span>
            </div>
          </article>
        `).join('') : '<div class="empty mini-empty">Belum ada log aktivitas.</div>'}
      </div>
    </section>
  `;
}

async function renderDashboardExtraPanels(renderToken, canViewFinance = false, canViewActivity = false) {
  const target = document.getElementById('dashboardExtraPanels');
  if (!target) return;
  if (!canViewFinance && !canViewActivity) {
    target.innerHTML = '';
    return;
  }
  target.innerHTML = `
    ${canViewFinance ? '<section class="section dashboard-radbill-list-panel"><div class="empty mini-empty">Memuat transaksi terbaru...</div></section>' : ''}
    ${canViewActivity ? '<section class="section dashboard-radbill-list-panel"><div class="empty mini-empty">Memuat audit log...</div></section>' : ''}
  `;
  const requests = [
    canViewFinance && canView('reportsTransactions')
      ? api(`/api/reports/monthly-transactions?${queryString({ period: state.period, page: 1, limit: 7 })}`).catch(() => null)
      : Promise.resolve(null),
    canViewActivity
      ? api('/api/activity?page=1&limit=7').catch(() => null)
      : Promise.resolve(null)
  ];
  const [transactionPayload, activityPayload] = await Promise.all(requests);
  if (renderIsStale(renderToken) || state.view !== 'dashboard' || !document.getElementById('dashboardExtraPanels')) return;
  const recentActivity = Array.isArray(activityPayload?.activity) ? activityPayload.activity : [];
  const recentTransactions = Array.isArray(transactionPayload?.transactions) ? transactionPayload.transactions : [];
  target.innerHTML = `
    ${canViewFinance ? dashboardRecentTransactionsPanel(recentTransactions, { period: state.period }) : ''}
    ${canViewActivity ? dashboardAuditPanel(recentActivity) : ''}
  `;
  applyDashboardPrivacyState(target);
  bindDashboardViewLinks();
}

function dashboardRouterKey(router = {}, index = 0) {
  return String(router.id || router.name || router.identity || router.host || `router-${index}`).trim() || `router-${index}`;
}

function rememberDashboardRouterNasHistory(payload = {}) {
  const generatedAt = payload.summary?.generatedAt || new Date().toISOString();
  const routers = Array.isArray(payload.routers) ? payload.routers : [];
  const nextKeys = new Set();
  const maxPoints = mobileMenuQuery.matches ? 12 : 24;
  routers.forEach((router, index) => {
    const key = dashboardRouterKey(router, index);
    nextKeys.add(key);
    const points = dashboardRouterNasHistory[key] || [];
    const last = points[points.length - 1];
    const point = {
      at: generatedAt,
      upload: Number(router.uploadBps || 0),
      download: Number(router.downloadBps || 0)
    };
    if (!last || last.at !== point.at || last.upload !== point.upload || last.download !== point.download) {
      points.push(point);
    }
    dashboardRouterNasHistory[key] = points.slice(-maxPoints);
  });
  Object.keys(dashboardRouterNasHistory).forEach((key) => {
    if (!nextKeys.has(key)) delete dashboardRouterNasHistory[key];
  });
}

function dashboardRouterNasMarkup(payload = {}) {
  const routers = Array.isArray(payload.routers) ? payload.routers : [];
  const options = routers.map((router, index) => ({
    key: dashboardRouterKey(router, index),
    label: router.name || router.identity || router.host || `NAS ${index + 1}`
  }));
  if (!options.some((option) => option.key === dashboardRouterNasSelected)) {
    dashboardRouterNasSelected = options[0]?.key || '';
  }
  const visibleRouters = routers.filter((router, index) => dashboardRouterKey(router, index) === dashboardRouterNasSelected);
  const totalUpload = visibleRouters.reduce((sum, router) => sum + Number(router.uploadBps || 0), 0);
  const totalDownload = visibleRouters.reduce((sum, router) => sum + Number(router.downloadBps || 0), 0);
  const visibleUpCount = visibleRouters.filter((router) => router.status === 'up').length;
  const visibleDownCount = visibleRouters.length - visibleUpCount;
  const isChecking = visibleRouters.length > 0 && visibleRouters.every((router) => router.status === 'checking');
  const isOnline = visibleRouters.length > 0 && !isChecking && visibleDownCount === 0;
  const statusLabel = isChecking ? 'Memuat' : (isOnline ? 'Online' : 'Offline');
  const primaryRouter = visibleRouters[0] || routers[0] || {};
  const title = primaryRouter.name || primaryRouter.identity || primaryRouter.host || 'NAS';
  const subTitle = primaryRouter.identity || primaryRouter.host || '-';
  return `
    <section class="section router-nas-widget">
      <div class="router-widget-head">
        <h2>NAS Status</h2>
        <div class="filters router-nas-controls">
          <select class="control" id="dashboardRouterNasSelect" aria-label="Pilih NAS">
            ${options.map((option) => `<option value="${escapeHtml(option.key)}"${dashboardRouterNasSelected === option.key ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
          </select>
          <button class="ghost-button compact" id="refreshDashboardRouters" type="button">Refresh</button>
        </div>
      </div>
      ${visibleRouters.length ? `
        <article class="router-mini-card router-spark-card">
          <div class="router-mini-head">
            <div>
              <strong data-router-detail="title">${escapeHtml(title)}</strong>
              <span data-router-detail="subtitle">${escapeHtml(subTitle)}</span>
            </div>
            <span class="badge ${isChecking ? 'pending' : (isOnline ? 'active' : 'inactive')}" data-router-detail="status">${escapeHtml(statusLabel)}</span>
          </div>
          <canvas class="router-nas-chart" id="routerNasChart" width="320" height="76"></canvas>
          <div class="router-chart-legend">
            <span>
              <small>Upload</small>
              <b data-router-rate="upload">${escapeHtml(mbpsText(totalUpload))}</b>
            </span>
            <span>
              <small>Download</small>
              <b data-router-rate="download">${escapeHtml(mbpsText(totalDownload))}</b>
            </span>
          </div>
          <div class="router-mini-meta">
            <span data-router-field="type">${escapeHtml(primaryRouter.routerosType || 'RouterOS')}</span>
            <span data-router-field="version">${escapeHtml(primaryRouter.routerosVersion || '-')}</span>
            <span data-router-field="interface">${escapeHtml(primaryRouter.selectedInterfaceName || primaryRouter.selectedInterface || 'Auto')}</span>
          </div>
        </article>
      ` : '<div class="empty mini-empty">Belum ada Site aktif.</div>'}
    </section>
  `;
}

function dashboardRouterChartPoints(payload = {}) {
  const routers = Array.isArray(payload.routers) ? payload.routers : [];
  const keys = routers
    .map((router, index) => dashboardRouterKey(router, index))
    .filter((key) => key === dashboardRouterNasSelected);
  const byAt = new Map();
  keys.forEach((key) => {
    (dashboardRouterNasHistory[key] || []).forEach((point) => {
      const item = byAt.get(point.at) || { at: point.at, upload: 0, download: 0 };
      item.upload += Number(point.upload || 0);
      item.download += Number(point.download || 0);
      byAt.set(point.at, item);
    });
  });
  const maxPoints = mobileMenuQuery.matches ? 10 : 16;
  return [...byAt.values()].sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-maxPoints);
}

function drawRouterSparkline(canvas, points = []) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = Math.max(260, Math.round(rect.width || canvas.clientWidth || 320));
  const height = Math.max(64, Math.round(rect.height || canvas.clientHeight || 76));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const surface = themeColor('--surface', '#ffffff');
  const surfaceSoft = themeColor('--surface-soft', '#edf4fb');
  const line = themeColor('--line', '#c9d8e8');
  const muted = themeColor('--muted', '#5c6f84');
  const primary = themeColor('--primary', '#08204f');
  const blue = themeColor('--blue', '#2b8bd9');
  ctx.fillStyle = surface;
  ctx.fillRect(0, 0, width, height);
  const chartPoints = points.length ? points : [{ upload: 0, download: 0 }];
  const max = routerTrafficChartMax(chartPoints);
  const axisWidth = mobileMenuQuery.matches ? 44 : 50;
  const rightPad = 7;
  const topPad = 8;
  const bottomPad = 8;
  const plotLeft = axisWidth;
  const plotRight = width - rightPad;
  const plotWidth = Math.max(1, plotRight - plotLeft);
  const plotHeight = Math.max(1, height - topPad - bottomPad);
  const axisValues = [max, max / 2, 0];
  ctx.font = `${mobileMenuQuery.matches ? 9 : 10}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  axisValues.forEach((value, index) => {
    const y = topPad + (index / 2) * plotHeight;
    ctx.strokeStyle = index === 2 ? line : surfaceSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(mbpsAxisText(value), axisWidth - 6, y);
  });
  const area = ctx.createLinearGradient(0, topPad, 0, topPad + plotHeight);
  area.addColorStop(0, 'rgba(43, 139, 217, 0.20)');
  area.addColorStop(1, 'rgba(43, 139, 217, 0.02)');
  ctx.fillStyle = area;
  ctx.beginPath();
  chartPoints.forEach((point, index, list) => {
    const x = list.length <= 1 ? plotRight : plotLeft + (index / (list.length - 1)) * plotWidth;
    const y = topPad + plotHeight - (Number(point.download || 0) / max) * plotHeight;
    if (index === 0) ctx.moveTo(x, topPad + plotHeight);
    ctx.lineTo(x, y);
    if (index === list.length - 1) ctx.lineTo(x, topPad + plotHeight);
  });
  ctx.closePath();
  ctx.fill();
  const plot = (field, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = mobileMenuQuery.matches ? 1.7 : 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    chartPoints.forEach((point, index, list) => {
      const x = list.length <= 1 ? plotRight : plotLeft + (index / (list.length - 1)) * plotWidth;
      const y = topPad + plotHeight - (Number(point[field] || 0) / max) * plotHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  plot('download', blue);
  plot('upload', primary);
  const latest = chartPoints[chartPoints.length - 1] || {};
  const drawDot = (field, color) => {
    const value = Number(latest[field] || 0);
    const x = chartPoints.length <= 1 ? plotRight : plotRight;
    const y = topPad + plotHeight - (value / max) * plotHeight;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, mobileMenuQuery.matches ? 2.3 : 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = surface;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  };
  drawDot('download', blue);
  drawDot('upload', primary);
}

function renderDashboardRouterNasCharts() {
  const canvas = document.getElementById('routerNasChart');
  if (!canvas || !dashboardRouterNasPayload) return;
  try {
    drawRouterSparkline(canvas, dashboardRouterChartPoints(dashboardRouterNasPayload));
  } catch {
    // Chart canvas is decorative; keep the NAS status/rate card visible if drawing fails.
  }
}

function mountDashboardRouterNasShell() {
  const container = document.getElementById('dashboardRouterNas');
  if (!container) return;
  container.innerHTML = dashboardRouterNasPayload
    ? dashboardRouterNasMarkup(dashboardRouterNasPayload)
    : dashboardRouterNasLoadingMarkup();
  if (dashboardRouterNasPayload) {
    bindDashboardRouterNasControls();
    renderDashboardRouterNasCharts();
  }
}

function dashboardRouterNasLoadingMarkup() {
  return `
    <section class="section router-nas-widget">
      <div class="router-widget-head">
        <h2>NAS Status</h2>
      </div>
      <article class="router-mini-card router-spark-card">
        <div class="router-mini-head">
          <div>
            <strong>Status</strong>
            <span>-</span>
          </div>
          <span class="badge inactive">...</span>
        </div>
        <canvas class="router-nas-chart" width="320" height="76" aria-hidden="true"></canvas>
        <div class="router-chart-legend">
          <span>
            <small>Upload</small>
            <b>-</b>
          </span>
          <span>
            <small>Download</small>
            <b>-</b>
          </span>
        </div>
      </article>
    </section>
  `;
}

function updateDashboardRouterNasDom(payload = {}) {
  const routers = Array.isArray(payload.routers) ? payload.routers : [];
  const options = routers.map((router, index) => dashboardRouterKey(router, index));
  if (!options.includes(dashboardRouterNasSelected)) {
    dashboardRouterNasSelected = options[0] || '';
  }
  const visibleRouters = routers.filter((router, index) => dashboardRouterKey(router, index) === dashboardRouterNasSelected);
  const totalUpload = visibleRouters.reduce((sum, router) => sum + Number(router.uploadBps || 0), 0);
  const totalDownload = visibleRouters.reduce((sum, router) => sum + Number(router.downloadBps || 0), 0);
  const visibleUpCount = visibleRouters.filter((router) => router.status === 'up').length;
  const visibleDownCount = visibleRouters.length - visibleUpCount;
  const isChecking = visibleRouters.length > 0 && visibleRouters.every((router) => router.status === 'checking');
  const isOnline = visibleRouters.length > 0 && !isChecking && visibleDownCount === 0;
  const statusLabel = isChecking ? 'Memuat' : (isOnline ? 'Online' : 'Offline');
  const primaryRouter = visibleRouters[0] || routers[0] || {};
  const title = primaryRouter.name || primaryRouter.identity || primaryRouter.host || 'NAS';
  const subTitle = primaryRouter.identity || primaryRouter.host || '-';
  const setText = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  };
  setText('[data-router-detail="title"]', title);
  setText('[data-router-detail="subtitle"]', subTitle);
  setText('[data-router-detail="status"]', statusLabel);
  const statusBadge = document.querySelector('[data-router-detail="status"]');
  if (statusBadge) {
    statusBadge.classList.toggle('active', isOnline);
    statusBadge.classList.toggle('pending', isChecking);
    statusBadge.classList.toggle('inactive', !isOnline && !isChecking);
  }
  setText('[data-router-rate="upload"]', mbpsText(totalUpload));
  setText('[data-router-rate="download"]', mbpsText(totalDownload));
  setText('[data-router-field="type"]', primaryRouter.routerosType || 'RouterOS');
  setText('[data-router-field="version"]', primaryRouter.routerosVersion || '-');
  setText('[data-router-field="interface"]', primaryRouter.selectedInterfaceName || primaryRouter.selectedInterface || 'Auto');
}

function bindDashboardRouterNasControls() {
  document.getElementById('refreshDashboardRouters')?.addEventListener('click', () => loadDashboardRouterNas({ force: true }));
  document.getElementById('dashboardRouterNasSelect')?.addEventListener('change', (event) => {
    dashboardRouterNasSelected = event.currentTarget.value || '';
    const container = document.getElementById('dashboardRouterNas');
    if (container && dashboardRouterNasPayload) {
      container.innerHTML = dashboardRouterNasMarkup(dashboardRouterNasPayload);
      bindDashboardRouterNasControls();
      renderDashboardRouterNasCharts();
    }
  });
}

function scheduleDashboardRouterNas() {
  if (dashboardRouterNasTimer) window.clearTimeout(dashboardRouterNasTimer);
  if (state.view !== 'dashboard') return;
  const delay = document.hidden ? 15000 : (mobileMenuQuery.matches ? 12000 : 8000);
  dashboardRouterNasTimer = window.setTimeout(() => loadDashboardRouterNas({ silent: true }), delay);
}

async function loadDashboardRouterNas(options = {}) {
  const activeContainer = () => document.getElementById('dashboardRouterNas');
  const initialContainer = activeContainer();
  if (!initialContainer) return;
  if (dashboardRouterNasLoading && !options.force) {
    if (!dashboardRouterNasPayload && !initialContainer.querySelector('.router-nas-widget')) {
      initialContainer.innerHTML = dashboardRouterNasLoadingMarkup();
    }
    return;
  }
  if (document.hidden && !options.force) {
    scheduleDashboardRouterNas();
    return;
  }
  const requestId = ++dashboardRouterNasRequestId;
  dashboardRouterNasLoading = true;
  if (!options.silent && !dashboardRouterNasPayload) {
    initialContainer.innerHTML = dashboardRouterNasLoadingMarkup();
  }
  try {
    const payload = await api(`/api/dashboard/router-nas${options.force ? '?force=1' : ''}`);
    if (requestId !== dashboardRouterNasRequestId && !options.force) return;
    const container = activeContainer();
    if (!container) return;
    dashboardRouterNasPayload = payload;
    rememberDashboardRouterNasHistory(payload);
    if (options.silent && container.querySelector('.router-nas-widget')) {
      updateDashboardRouterNasDom(payload);
    } else {
      Object.values(dashboardRouterNasCharts || {}).forEach((chart) => {
        if (chart && typeof chart.destroy === 'function') chart.destroy();
      });
      dashboardRouterNasCharts = {};
      container.innerHTML = dashboardRouterNasMarkup(payload);
      bindDashboardRouterNasControls();
    }
    renderDashboardRouterNasCharts();
  } catch (error) {
    const container = activeContainer();
    if (container && (!options.silent || !dashboardRouterNasPayload)) {
      container.innerHTML = `<section class="notice warning router-nas-widget">${escapeHtml(error.message || 'Router NAS belum bisa dibaca')}</section>`;
    }
  } finally {
    dashboardRouterNasLoading = false;
    scheduleDashboardRouterNas();
  }
}

function queryString(params) {
  return new URLSearchParams(params).toString();
}

function shouldShowPageLoading(options = {}) {
  return !options.silent || !app?.childElementCount;
}

function rememberSearchFocusIntent(selector, getValue = () => '') {
  if (!selector) return;
  activeSearchFocusIntent = {
    selector,
    getValue,
    expiresAt: Date.now() + SEARCH_FOCUS_INTENT_MS
  };
}

function clearSearchFocusIntent(selector = '') {
  if (!selector || activeSearchFocusIntent?.selector === selector) {
    activeSearchFocusIntent = null;
  }
}

function searchFocusIntentExpectedValue(intent) {
  try {
    return String(intent?.getValue?.() || '').trim();
  } catch {
    return '';
  }
}

function restoreSearchFocusIntent() {
  const intent = activeSearchFocusIntent;
  if (!intent) return false;
  if (Date.now() > intent.expiresAt) {
    activeSearchFocusIntent = null;
    return false;
  }
  const active = document.activeElement;
  if (
    active instanceof HTMLElement
    && !active.matches(intent.selector)
    && (
      active.matches('input, textarea, select, button')
      || active.isContentEditable
    )
  ) {
    return false;
  }
  const input = document.querySelector(intent.selector);
  if (!(input instanceof HTMLInputElement)) return false;
  const expected = searchFocusIntentExpectedValue(intent);
  if (String(input.value || '').trim() !== expected) {
    input.value = expected;
  }
  input.focus({ preventScroll: true });
  input.setSelectionRange(input.value.length, input.value.length);
  return true;
}

function focusSearchAfterRender(selector, expectedValue = '', options = {}) {
  const startedAt = Date.now();
  const preserveMs = Math.max(120, Number(options.preserveMs || 1400) || 1400);
  const expected = String(expectedValue || '').trim();
  rememberSearchFocusIntent(selector, () => expected);
  const tryFocus = () => {
    restoreSearchFocusIntent();
    if (activeSearchFocusIntent?.selector === selector && Date.now() - startedAt < preserveMs) {
      window.setTimeout(() => window.requestAnimationFrame(tryFocus), 80);
    }
  };
  window.requestAnimationFrame(tryFocus);
}

function bindLiveTextSearch(input, options = {}) {
  if (!input) return;
  const {
    getValue = () => '',
    setValue = () => {},
    handler = () => {},
    debounceMs = LIVE_SEARCH_DEBOUNCE_MS,
    minLength = 0,
    onTooShort = () => {},
    refocusSelector = '#searchInput'
  } = options;
  const viewAtBind = state.view;
  let timer = null;
  let running = false;
  let queued = false;
  let lastStartedValue = String(getValue() || '').trim();
  const run = (force = false, refocus = true) => {
    window.clearTimeout(timer);
    if (state.view !== viewAtBind) return;
    const activeInput = document.querySelector(refocusSelector);
    const inputValue = activeInput instanceof HTMLInputElement ? activeInput.value : input.value;
    const next = String(inputValue || '').trim();
    setValue(next);
    if (refocus) rememberSearchFocusIntent(refocusSelector, () => getValue());
    if (next && next.length < minLength) {
      queued = false;
      onTooShort(next, minLength);
      return;
    }
    if (!force && lastStartedValue === next && !queued) return;
    if (running) {
      queued = true;
      abortPageRequests();
      return;
    }
    running = true;
    queued = false;
    lastStartedValue = next;
    setValue(next);
    abortPageRequests();
    const result = handler({ silent: true, liveSearch: true });
    Promise.resolve(result).catch((error) => {
      if (error?.name !== 'AbortError' && state.view === viewAtBind) setToast(error.message || 'Pencarian gagal');
    }).finally(() => {
      running = false;
      if (state.view === viewAtBind) scheduleTableTopScrollbars(app);
      if (refocus && state.view === viewAtBind) {
        focusSearchAfterRender(refocusSelector, String(getValue() || '').trim(), { preserveMs: SEARCH_FOCUS_INTENT_MS });
      }
      if (state.view === viewAtBind && String(getValue() || '').trim() !== lastStartedValue) {
        queued = false;
        run(true, refocus);
      }
    });
  };
  input.addEventListener('input', () => {
    setValue(String(input.value || '').trim());
    rememberSearchFocusIntent(refocusSelector, () => getValue());
    queued = running;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => run(false, true), debounceMs);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    rememberSearchFocusIntent(refocusSelector, () => getValue());
    run(true, true);
  });
  return { apply: () => run(true, true), reset: () => run(true, true) };
}

function bindSearchClearButton(input, onClear = () => {}) {
  if (!(input instanceof HTMLInputElement) || input.dataset.searchClearBound === '1') return;
  input.dataset.searchClearBound = '1';
  input.type = 'search';
  input.setAttribute('enterkeyhint', 'search');
  input.classList.add('has-clear-button');
  let wrapper = input.closest('.search-input-wrap');
  if (!wrapper || wrapper.querySelector('input') !== input) {
    wrapper = document.createElement('span');
    wrapper.className = 'search-input-wrap';
    input.parentNode?.insertBefore(wrapper, input);
    wrapper.appendChild(input);
  }
  const wrapperParent = wrapper.parentElement;
  if (
    wrapperParent
    && wrapper.nextElementSibling
    && (
      wrapperParent.classList.contains('filters')
      || wrapperParent.classList.contains('manual-invoice-toolbar')
    )
  ) {
    wrapperParent.appendChild(wrapper);
  }
  const button = document.createElement('button');
  button.className = 'search-clear-button';
  button.type = 'button';
  button.title = 'Bersihkan pencarian';
  button.setAttribute('aria-label', 'Bersihkan pencarian');
  button.textContent = 'X';
  wrapper.appendChild(button);
  const refresh = () => {
    button.hidden = !String(input.value || '').trim();
  };
  button.addEventListener('click', () => {
    if (!input.value) return;
    input.value = '';
    refresh();
    onClear();
    input.focus({ preventScroll: true });
  });
  input.addEventListener('input', refresh);
  refresh();
}

function bindSearch(handler, options = {}) {
  const search = document.getElementById('searchInput');
  if (!search) return;
  const live = bindLiveTextSearch(search, {
    getValue: () => state.search,
    setValue: (value) => { state.search = value; },
    handler,
    ...options,
    refocusSelector: '#searchInput'
  });
  const reset = () => {
    if (!search.value && !state.search) return;
    search.value = '';
    state.search = '';
    const result = handler({ silent: true, liveSearch: true });
    Promise.resolve(result).finally(() => {
      scheduleTableTopScrollbars(app);
      focusSearchAfterRender('#searchInput', '', { preserveMs: SEARCH_FOCUS_INTENT_MS });
    });
  };
  bindSearchClearButton(search, reset);
}

document.addEventListener('focusin', (event) => {
  const intent = activeSearchFocusIntent;
  const target = event.target;
  if (!intent || !(target instanceof HTMLElement) || target.matches(intent.selector)) return;
  if (
    target.matches('input, textarea, select, button')
    || target.isContentEditable
  ) {
    clearSearchFocusIntent(intent.selector);
  }
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing || event.defaultPrevented) return;
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.tagName === 'TEXTAREA') return;
  if (!target.matches('.filters input, .filters select, .toolbar input.control, .toolbar select.control')) return;
  const filters = target.closest('.filters') || target.closest('.toolbar');
  const apply = filters?.querySelector('[data-search-apply]');
  if (!apply) return;
  event.preventDefault();
  event.stopPropagation();
  apply.click();
}, true);

function pagerJumpControl(kind, pagination = {}) {
  return '';
}

function pagerLimitValue(value, fallback = RADIUS_PAGE_SIZE) {
  if (String(value || '').toLowerCase() === 'all') return fallback;
  const limit = Number(value || fallback);
  if (limit >= 1000000) return fallback;
  return PAGER_LIMIT_OPTIONS.includes(limit) ? limit : fallback;
}

function effectivePagerLimit(value, total = 0, fallback = RADIUS_PAGE_SIZE) {
  const selected = pagerLimitValue(value, fallback);
  if (selected === 'all') return Math.max(1, Number(total || 0) || 1);
  return selected;
}

function pagerTotalPages(total = 0, value = RADIUS_PAGE_SIZE, fallback = RADIUS_PAGE_SIZE) {
  const limit = effectivePagerLimit(value, total, fallback);
  return Math.max(1, Math.ceil(Number(total || 0) / limit));
}

function pagerLimitControl(kind, currentLimit = RADIUS_PAGE_SIZE, fallback = RADIUS_PAGE_SIZE) {
  const selected = pagerLimitValue(currentLimit, fallback);
  const options = PAGER_LIMIT_OPTIONS.map((value) => {
    const label = value === 'all' ? 'All' : String(value);
    return `<option value="${value}" ${String(selected) === String(value) ? 'selected' : ''}>${label}</option>`;
  }).join('');
  return `
    <label class="pager-jump pager-limit">
      <span>Tampil</span>
      <select class="control compact" data-${kind}-limit>${options}</select>
    </label>
  `;
}

function bindPagerLimit(kind, setLimit, setPage, renderer, fallback = RADIUS_PAGE_SIZE) {
  app.querySelectorAll(`[data-${kind}-limit]`).forEach((select) => {
    select.addEventListener('change', () => {
      setLimit(pagerLimitValue(select.value, fallback));
      setPage(1);
      renderer();
    });
  });
}

function customerPaginationControls(pagination = {}, label = 'PPPoE') {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('customer', pagination.limit || state.monitoringCustomerLimit || CUSTOMER_PAGE_SIZE, CUSTOMER_PAGE_SIZE);
  if (total <= effectivePagerLimit(pagination.limit || CUSTOMER_PAGE_SIZE, total, CUSTOMER_PAGE_SIZE)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${total} ${escapeHtml(label)} online` : `Belum ada ${escapeHtml(label)} online`}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-customer-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${page} dari ${totalPages} - ${total} ${escapeHtml(label)} online</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-customer-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function servicePaginationControls(pagination = {}, label = 'Layanan') {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('service', pagination.limit || state.monitoringServicesLimit || CUSTOMER_PAGE_SIZE, CUSTOMER_PAGE_SIZE);
  if (total <= effectivePagerLimit(pagination.limit || CUSTOMER_PAGE_SIZE, total, CUSTOMER_PAGE_SIZE)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${total} ${escapeHtml(label)} online` : `Belum ada ${escapeHtml(label)} online`}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-service-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${page} dari ${totalPages} - ${total} ${escapeHtml(label)} online</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-service-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function radiusPaginationControls(kind, pagination = {}, label = 'data') {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl(kind, pagination.limit || RADIUS_PAGE_SIZE);
  if (total <= effectivePagerLimit(pagination.limit || RADIUS_PAGE_SIZE, total, RADIUS_PAGE_SIZE)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${total} ${escapeHtml(label)}` : `Belum ada ${escapeHtml(label)}`}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-${kind}-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${page} dari ${totalPages} - ${total} ${escapeHtml(label)}</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-${kind}-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function paginationControls(pagination = {}) {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('activity', pagination.limit || state.activityLimit || 10, 10);
  if (total <= effectivePagerLimit(pagination.limit || state.activityLimit || 10, total, 10)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${total} log` : 'Belum ada log'}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-activity-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${page} dari ${totalPages} - ${total} log</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-activity-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function billingPaginationControls(pagination = {}) {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('billing', pagination.limit || state.monitoringBillingLimit || 10, 10);
  if (total <= effectivePagerLimit(pagination.limit || state.monitoringBillingLimit || 10, total, 10)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${total} tagihan` : 'Belum ada tagihan'}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-billing-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${page} dari ${totalPages} - ${total} tagihan</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-billing-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function inventoryPaginationControls(pagination = {}) {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('inventory', pagination.limit || state.inventoryLimit || 10, 10);
  if (total <= effectivePagerLimit(pagination.limit || state.inventoryLimit || 10, total, 10)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${total} barang` : 'Belum ada barang'}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-inventory-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${page} dari ${totalPages} - ${total} barang</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-inventory-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function stockReportPaginationControls(pagination = {}) {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('stock-report', pagination.limit || state.inventoryReportLimit || 10, 10);
  if (total <= effectivePagerLimit(pagination.limit || state.inventoryReportLimit || 10, total, 10)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${total} mutasi` : 'Belum ada mutasi'}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-stock-report-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${page} dari ${totalPages} - ${total} mutasi</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-stock-report-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function displayNumber(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

function safeLogoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_LOGO_URL;
  if (raw.length <= 2 * 1024 * 1024 && /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(raw)) {
    return raw.replace(/\s+/g, '');
  }
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const parsed = new URL(raw);
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.toString();
  } catch {
    return DEFAULT_LOGO_URL;
  }
  return DEFAULT_LOGO_URL;
}

function safePublicUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= 2 * 1024 * 1024 && /^data:image\/(?:png|gif|jpe?g|webp|svg\+xml);base64,/i.test(raw)) return raw.replace(/\s+/g, '');
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw.slice(0, 200);
  try {
    const parsed = new URL(raw);
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.toString().slice(0, 200);
  } catch {
    return '';
  }
  return '';
}

function readImageFile(file, options = {}) {
  if (!file) return Promise.resolve(null);
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  const label = options.label || 'Gambar';
  const maxBytes = Number(options.maxBytes || MAX_IMAGE_UPLOAD_BYTES);
  if (!allowedTypes.includes(file.type)) {
    return Promise.reject(new Error(`Format ${label.toLowerCase()} harus PNG, JPG, atau WEBP`));
  }
  if (file.size > maxBytes) {
    return Promise.reject(new Error(`Ukuran ${label.toLowerCase()} maksimal ${Math.round(maxBytes / 1024 / 1024)} MB`));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`${label} tidak bisa dibaca`));
    reader.readAsDataURL(file);
  });
}

async function uploadImageFile(file, purpose, options = {}) {
  const image = await readImageFile(file, options);
  if (!image) return '';
  const result = await api('/api/uploads/image', {
    method: 'POST',
    body: JSON.stringify({ purpose, image })
  });
  return result.url || '';
}

function uploadLogoFile(file) {
  return uploadImageFile(file, 'profile', {
    label: 'Logo',
    maxBytes: MAX_LOGO_UPLOAD_BYTES
  });
}

async function uploadMemberKtpFile(file, options = {}) {
  const image = await readImageFile(file, { label: 'Foto KTP', ...options });
  if (!image) return null;
  return api('/api/uploads/member-ktp', {
    method: 'POST',
    body: JSON.stringify({ image })
  });
}

function ktpOcrName(result = {}) {
  return String(result?.name || result?.fullName || result?.ocr?.name || result?.ocr?.fullName || '').trim();
}

function normalizeOcrComparableName(value = '') {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:bapak|ibu|pak|bu|mr|mrs|ms)\b/gi, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\S+@\S+/g, ' ')
    .replace(/@[\w.-]+/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^A-Za-z\u00c0-\u024f\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('id-ID');
}

function ocrNameTokens(value = '') {
  return normalizeOcrComparableName(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function ocrNameSimilarity(left = '', right = '') {
  const leftTokens = new Set(ocrNameTokens(left));
  const rightTokens = new Set(ocrNameTokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1;
  });
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function isAutoLikeMemberName(value = '') {
  const raw = String(value || '').trim();
  const normalized = normalizeOcrComparableName(raw);
  if (!raw || !normalized) return true;
  if (/@/.test(raw)) return true;
  if (/^(?:pppoe|hotspot|user|member|pelanggan|customer)[\s._-]*\d*/i.test(raw)) return true;
  return false;
}

function ktpOcrNameDecision(currentName = '', ocrName = '', options = {}) {
  const current = String(currentName || '').trim();
  const ocr = String(ocrName || '').trim();
  if (!ocr) return { action: 'none', shouldReplace: false, message: '' };
  const currentNorm = normalizeOcrComparableName(current);
  const ocrNorm = normalizeOcrComparableName(ocr);
  const autoFilled = options.replaceAutoFilled === true && options.autoFilled === true;
  if (!currentNorm || autoFilled || isAutoLikeMemberName(current)) {
    return { action: 'filled', shouldReplace: true, message: `Nama diisi dari OCR: ${ocr}` };
  }
  if (currentNorm === ocrNorm) {
    return { action: 'matched', shouldReplace: true, message: `Nama cocok: ${ocr}` };
  }
  const currentTokens = ocrNameTokens(current);
  const ocrTokens = ocrNameTokens(ocr);
  const currentSubset = currentTokens.length > 0 && currentTokens.every((token) => ocrTokens.includes(token));
  const compactCurrent = currentNorm.replace(/\s+/g, '');
  const compactOcr = ocrNorm.replace(/\s+/g, '');
  const compactSubset = compactCurrent.length >= 3 && compactOcr.includes(compactCurrent);
  const similarity = ocrNameSimilarity(current, ocr);
  if (currentSubset || compactSubset || similarity >= 0.8) {
    return { action: 'completed', shouldReplace: true, message: `Nama dilengkapi dari OCR: ${ocr}` };
  }
  return {
    action: similarity >= 0.5 ? 'review' : 'different',
    shouldReplace: false,
    message: `Nama berbeda, review manual: ${current} (${ocr})`
  };
}

function ktpOcrStatusText(result = {}, decision = null) {
  const nik = String(result?.ktp || result?.nik || result?.ocr?.nik || '').trim();
  const name = ktpOcrName(result);
  const parts = [];
  if (nik) parts.push(`NIK terbaca: ${nik}`);
  if (decision?.message) {
    parts.push(decision.message);
  } else if (name) {
    parts.push(`Nama terbaca: ${name}`);
  }
  if (parts.length) return parts.join(' | ');
  return result?.ocr?.error || 'Foto tersimpan. NIK dan nama belum terbaca otomatis, isi manual dari foto KTP.';
}

function fillKtpOcrNameInput(input, result = {}, options = {}) {
  if (!input) return { action: 'none', shouldReplace: false, message: '' };
  const name = ktpOcrName(result);
  if (!name) return { action: 'none', shouldReplace: false, message: '' };
  const decision = ktpOcrNameDecision(input.value, name, {
    replaceAutoFilled: options.replaceAutoFilled,
    autoFilled: input.dataset.autoFilled === '1'
  });
  if (decision.shouldReplace) {
    input.value = name;
    input.dataset.autoFilled = '0';
  }
  return decision;
}

function updateBranding(payload = {}) {
  if (payload.settings && typeof payload.settings === 'object') {
    state.settings = {
      ...state.settings,
      ...payload.settings,
      logoUrl: safeLogoUrl(payload.settings.logoUrl)
    };
    setActiveClientTimeZone(state.settings.timeZone || state.branding.timeZone || DEFAULT_APP_TIME_ZONE);
  }
  let source = null;
  if (payload.branding && typeof payload.branding === 'object') {
    source = payload.branding;
  } else if (payload.settings && typeof payload.settings === 'object') {
    source = {
      businessName: state.settings.businessName,
      appSubtitle: state.settings.appSubtitle,
      logoUrl: state.settings.logoUrl,
      appVersion: state.settings.appInfo?.version || state.branding.appVersion,
      buildVersion: state.settings.appInfo?.buildVersion || state.branding.buildVersion,
      releaseDate: state.settings.appInfo?.releaseDate || state.branding.releaseDate,
      timeZone: state.settings.timeZone || state.branding.timeZone || DEFAULT_APP_TIME_ZONE,
      loginVerificationEnabled: state.settings.security?.loginVerificationEnabled !== false
    };
  } else if (
    Object.prototype.hasOwnProperty.call(payload, 'businessName')
    || Object.prototype.hasOwnProperty.call(payload, 'appSubtitle')
    || Object.prototype.hasOwnProperty.call(payload, 'logoUrl')
  ) {
    source = payload;
  }
  if (source && typeof source === 'object') {
    state.branding = {
      ...state.branding,
      ...source,
      logoUrl: safeLogoUrl(source.logoUrl || state.settings.logoUrl)
    };
    setActiveClientTimeZone(state.branding.timeZone || state.settings.timeZone || DEFAULT_APP_TIME_ZONE);
    if (Object.prototype.hasOwnProperty.call(source, 'loginVerificationEnabled')) {
      state.settings = {
        ...state.settings,
        security: {
          ...(state.settings.security || {}),
          loginVerificationEnabled: source.loginVerificationEnabled !== false
        }
      };
    }
  }
  applyBranding();
}

function currentBranding() {
  const settingVerification = state.settings.security?.loginVerificationEnabled;
  return {
    businessName: state.branding.businessName || state.settings.businessName || DEFAULT_BUSINESS_NAME,
    appSubtitle: state.branding.appSubtitle || state.settings.appSubtitle || DEFAULT_APP_SUBTITLE,
    logoUrl: safeLogoUrl(state.branding.logoUrl || state.settings.logoUrl),
    copyrightYear: state.branding.copyrightYear || new Date().getFullYear(),
    copyrightName: APP_COPYRIGHT_NAME,
    timeZone: state.branding.timeZone || state.settings.timeZone || DEFAULT_APP_TIME_ZONE,
    appVersion: state.branding.appVersion || state.settings.appInfo?.version || '__FAKENET_APP_VERSION__',
    buildVersion: state.branding.buildVersion || state.branding.appVersion || state.settings.appInfo?.version || '__FAKENET_BUILD_VERSION__',
    releaseDate: state.branding.releaseDate || state.settings.appInfo?.releaseDate || '__FAKENET_RELEASE_DATE__',
    loginVerificationEnabled: settingVerification === undefined
      ? state.branding.loginVerificationEnabled !== false
      : settingVerification !== false
  };
}

function appReleaseFootnoteMarkup(branding = currentBranding()) {
  return `
    <div class="login-release-footnote">
      <strong>Copyright ${escapeHtml(branding.copyrightYear)} - ${escapeHtml(branding.copyrightName)}</strong>
      <span>Versi ${escapeHtml(branding.appVersion)} · ${escapeHtml(dateText(branding.releaseDate))}</span>
    </div>
  `;
}

function brandingPrintLabel(documentLabel = '', branding = currentBranding()) {
  const subtitle = String(branding.appSubtitle || '').trim();
  const label = String(documentLabel || '').trim();
  if (subtitle && label && subtitle.toLowerCase() === label.toLowerCase()) return subtitle;
  if (subtitle && label) return `${subtitle} · ${label}`;
  return subtitle || label;
}

function applyBranding() {
  const branding = currentBranding();
  document.title = branding.businessName;
  let favicon = document.getElementById('appFavicon');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.id = 'appFavicon';
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.href = branding.logoUrl;
  const appleTouchIcon = document.getElementById('appleTouchIcon');
  if (appleTouchIcon) {
    appleTouchIcon.href = branding.logoUrl;
  }
  if (businessName) {
    businessName.textContent = branding.businessName;
  }
  document.querySelectorAll('.side-brand strong').forEach((item) => {
    item.textContent = branding.businessName;
  });
  document.querySelectorAll('.side-brand > div > span').forEach((item) => {
    item.textContent = branding.appSubtitle;
  });
  if (sidebarLogo) {
    sidebarLogo.src = branding.logoUrl;
    sidebarLogo.alt = `Logo ${branding.businessName}`;
  }
  if (copyrightYear) {
    copyrightYear.textContent = String(branding.copyrightYear);
  }
  if (copyrightName) {
    copyrightName.textContent = branding.copyrightName;
  }
  if (appVersion) {
    appVersion.textContent = branding.appVersion;
  }
  if (buildVersion) {
    buildVersion.textContent = branding.buildVersion;
  }
}

function loginVerificationPlaceholder(message = 'Memuat kode...') {
  return `
    <div class="login-verification-image is-loading" id="loginVerificationImage">
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

async function refreshLoginVerification() {
  const imageBox = document.getElementById('loginVerificationImage');
  const hidden = document.querySelector('#loginForm input[name="verificationId"]');
  const input = document.querySelector('#loginForm input[name="verificationCode"]');
  if (imageBox) {
    imageBox.classList.add('is-loading');
    imageBox.innerHTML = '<span>Memuat kode...</span>';
  }
  try {
    const payload = await api('/api/auth/verification-code', { skipAuthRedirect: true });
    const verification = payload.verification || {};
    state.loginVerification = verification;
    if (hidden) hidden.value = verification.id || '';
    if (imageBox) {
      imageBox.classList.remove('is-loading');
      imageBox.innerHTML = verification.image
        ? `<img src="${escapeHtml(verification.image)}" alt="Kode verifikasi">`
        : '<span>Kode tidak tersedia</span>';
    }
    if (input) {
      input.value = '';
    }
  } catch {
    state.loginVerification = null;
    if (hidden) hidden.value = '';
    if (imageBox) {
      imageBox.classList.add('is-loading');
      imageBox.innerHTML = '<span>Kode gagal dimuat</span>';
    }
  }
}

function renderLogin() {
  nextRenderGeneration();
  abortPageRequests();
  clearRealtimeTimers();
  configureShell();
  applyBranding();
  const branding = currentBranding();
  const verificationEnabled = branding.loginVerificationEnabled !== false;
  viewTitle.textContent = 'Login';
  app.innerHTML = `
    <section class="login-screen">
      <div class="login-card login-card-compact">
        <div class="login-brand">
          <img src="${escapeHtml(branding.logoUrl)}" alt="Logo ${escapeHtml(branding.businessName)}">
          <div>
            <strong>${escapeHtml(branding.businessName)}</strong>
            <span>${escapeHtml(branding.appSubtitle)}</span>
          </div>
        </div>
        <div class="login-content-grid login-content-compact">
          <form id="loginForm" class="login-form">
            <label class="field">
              <span>Username</span>
              <input name="username" autocomplete="username" required autofocus>
            </label>
            <label class="field">
              <span>Password</span>
              <input name="password" type="password" autocomplete="current-password" required>
            </label>
            ${verificationEnabled ? `<label class="field login-verification-field">
              <span>Kode Verifikasi</span>
              <div class="login-verification-row">
                ${loginVerificationPlaceholder()}
                <button class="ghost-button compact" id="refreshLoginVerification" type="button" title="Refresh Verifikasi" aria-label="Refresh Verifikasi">
                  <i class="fa-solid fa-rotate-right"></i>
                  <span>Refresh Verifikasi</span>
                </button>
              </div>
              <input name="verificationId" type="hidden">
              <input name="verificationCode" autocomplete="off" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Masukkan kode" required>
            </label>` : ''}
            <button class="button" type="submit">Masuk</button>
            ${appReleaseFootnoteMarkup(branding)}
          </form>
          <a class="login-info-link" href="/public-info.html" target="_blank" rel="noopener">
            <span>Informasi Layanan & Pembelian</span>
            <small>Produk, cara transaksi, S&K, dan kontak CS</small>
          </a>
        </div>
      </div>
    </section>
  `;

  if (verificationEnabled) {
    refreshLoginVerification();
    document.getElementById('refreshLoginVerification')?.addEventListener('click', () => refreshLoginVerification());
  }
  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    try {
      if (submitButton) submitButton.disabled = true;
      if (verificationEnabled) {
        const verificationId = String(form.verificationId?.value || '').trim();
        const verificationCode = String(form.verificationCode?.value || '').trim();
        if (!verificationId) {
          await refreshLoginVerification();
          throw new Error('Kode verifikasi belum siap, masukkan kode yang baru tampil');
        }
        if (!verificationCode) {
          throw new Error('Kode verifikasi wajib diisi');
        }
        form.verificationCode.value = verificationCode.replace(/\s+/g, '');
      }
      const payload = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(formData(form)),
        skipAuthRedirect: true
      });
      state.auth = payload.user;
      state.roles = payload.roles || [];
      clearRadiusOptionsCache();
      updateBranding(payload);
      takeLoginReturnView();
      state.view = canView('dashboard') ? 'dashboard' : firstAvailableView();
      configureShell();
      startNotificationsTimer();
      setToast('Login berhasil');
      setView(state.view, { replace: true });
    } catch (error) {
      if (error.status === 423) {
        renderActivation(error.payload?.license || {});
        return;
      }
      setToast(error.message);
      if (verificationEnabled) await refreshLoginVerification();
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

function renderActivation(licenseStatus = {}) {
  configureShell();
  applyBranding();
  const branding = currentBranding();
  viewTitle.textContent = 'Aktivasi';
  const machineCode = licenseStatus.machineCode || '-';
  app.innerHTML = `
    <section class="login-screen">
      <div class="login-card activation-card">
        <div class="login-brand">
          <img src="${escapeHtml(branding.logoUrl)}" alt="Logo ${escapeHtml(branding.businessName)}">
          <div>
            <strong>${escapeHtml(branding.businessName)}</strong>
            <span>Aktivasi License</span>
          </div>
        </div>
        <div class="notice warning">
          <strong>Aplikasi belum diaktivasi</strong>
          <span>Salin HWID dari server ini, kirim ke CS, lalu paste license key yang diterima di halaman ini.</span>
        </div>
        <form id="activationForm" class="login-form">
          <label class="field">
            <span>HWID / Machine Code</span>
            <div class="license-machine-row">
              <input id="machineCodeInput" name="machineCode" value="${escapeHtml(machineCode)}" readonly title="Klik untuk copy HWID">
              <button class="ghost-button" type="button" id="copyMachineCode">Copy HWID</button>
            </div>
          </label>
          <label class="field">
            <span>License Key</span>
            <textarea name="licenseKey" rows="4" autocomplete="off" required placeholder="FNB-XXXXX-XXXXX..."></textarea>
          </label>
          <button class="button" type="submit">Aktivasi Aplikasi</button>
        </form>
        <p class="login-note">Untuk mendapatkan license key, kirim HWID ke CS Whatsapp 083878122381.</p>
        ${appReleaseFootnoteMarkup(branding)}
      </div>
    </section>
  `;
  const machineInput = document.getElementById('machineCodeInput');
  const copyMachineCode = async () => {
    try {
      await copyTextToClipboard(machineInput?.value || machineCode);
      machineInput?.focus();
      machineInput?.select();
      setToast('HWID disalin');
    } catch {
      machineInput?.focus();
      machineInput?.select();
      setToast('HWID terseleksi, tekan Ctrl+C');
    }
  };
  document.getElementById('copyMachineCode')?.addEventListener('click', copyMachineCode);
  machineInput?.addEventListener('click', copyMachineCode);
  document.getElementById('activationForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    try {
      if (submitButton) submitButton.disabled = true;
      const payload = await api('/api/license/activate', {
        method: 'POST',
        body: JSON.stringify({ licenseKey: form.licenseKey.value }),
        skipAuthRedirect: true
      });
      setToast(`Aktivasi berhasil${payload.license?.licensedTo ? ` untuk ${payload.license.licensedTo}` : ''}`);
      renderLogin();
    } catch (error) {
      setToast(error.message || 'Aktivasi gagal');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

async function renderDashboard(options = {}) {
  const renderToken = options.renderToken;
  const personalDashboardRole = ['collector', 'reseller_voucher'].includes(state.auth?.role || '');
  app.innerHTML = personalDashboardRole
    ? '<div class="stack"><section class="section"><div class="empty">Memuat dashboard personal...</div></section></div>'
    : `
      <div class="stack">
        <section class="dashboard-status-row">
          <section class="section dashboard-member-card">
            <div class="dashboard-member-head">
              <div>
                <h2>PPP-DHCP Users</h2>
              </div>
            </div>
          </section>
          <section class="section dashboard-member-card">
            <div class="dashboard-member-head">
              <div>
                <h2>Hotspot Users</h2>
              </div>
            </div>
          </section>
          <div id="dashboardRouterNas"></div>
        </section>
      </div>
    `;
  if (!personalDashboardRole) mountDashboardRouterNasShell();
  const params = {
    period: state.period
  };
  const payload = await api(`/api/dashboard?${queryString(params)}`);
  if (renderIsStale(renderToken)) return;
  const { summary = {}, members = {}, radiusSummary = {}, settings } = payload;
  updateBranding({ settings });
  const canViewFinance = Boolean(payload.canViewFinance);
  const canViewActivity = can('activity:read');
  const personalScope = summary.personalScope || null;
  const restrictedPersonalDashboard = Boolean(personalScope);

  app.innerHTML = `
    <div class="stack">
      ${dashboardPrivacyToggleMarkup()}
      ${canViewFinance ? `
        ${dashboardFinanceOverview(summary)}
        ${dashboardBillingOverview(summary)}
      ` : dashboardPersonalScopeOverview(personalScope)}

      ${!restrictedPersonalDashboard && members.error ? `
        <section class="notice warning">
          <strong>Ringkasan pelanggan belum realtime</strong>
          <span>${escapeHtml(members.error)}</span>
        </section>
      ` : ''}

      ${restrictedPersonalDashboard ? '' : `
        <section class="dashboard-status-row">
          ${dashboardMembersCompact(members, radiusSummary)}
          <div id="dashboardRouterNas"></div>
        </section>
        <section class="dashboard-radbill-lower-grid" id="dashboardExtraPanels"></section>
      `}
    </div>
  `;

  bindDashboardPrivacyToggle();
  if (!restrictedPersonalDashboard) {
    bindDashboardRadiusLinks();
    bindDashboardViewLinks();
    mountDashboardRouterNasShell();
    loadDashboardRouterNas({ silent: Boolean(dashboardRouterNasPayload) });
    renderDashboardExtraPanels(renderToken, canViewFinance, canViewActivity);
  }
}

function diagnosticsStatusBadge(active, activeLabel = 'Aktif', inactiveLabel = 'Tidak aktif') {
  return `<span class="badge ${active ? 'active' : 'inactive'}">${escapeHtml(active ? activeLabel : inactiveLabel)}</span>`;
}

function diagnosticsUptimeText(seconds = 0) {
  const totalMinutes = Math.max(0, Math.floor(Number(seconds || 0) / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days} hari` : '', hours ? `${hours} jam` : '', `${minutes} menit`].filter(Boolean).join(' ');
}

async function renderDiagnostics(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memeriksa sistem...</div>';
  const payload = await api(`/api/system/diagnostics${options.refresh ? '?refresh=1' : ''}`);
  const processInfo = payload.process || {};
  const memory = processInfo.memory || {};
  const database = payload.database || {};
  const cache = payload.cache || {};
  const redis = cache.redis || {};
  const runtimeCache = cache.runtime || {};
  const queue = payload.whatsappQueue || {};
  const automation = payload.automation || {};
  const queuedMessages = Number(queue.waiting || 0) + Number(queue.prioritized || 0) + Number(queue.delayed || 0);
  const redisAvailable = redis.available === true || redis.connected === true || redis.ready === true || redis.status === 'ready';

  app.innerHTML = `
    <div class="stack diagnostics-page">
      <div class="toolbar compact-toolbar diagnostics-toolbar">
        <div>
          <strong>Status komponen aplikasi</strong>
          <span class="muted">Pemeriksaan ${escapeHtml(dateTimeText(payload.checkedAt || new Date().toISOString()))}</span>
        </div>
        <button class="ghost-button compact" id="refreshDiagnostics" type="button">Periksa Ulang</button>
      </div>

      <section class="metrics diagnostics-metrics">
        ${metric('Aplikasi', 'Online', `Uptime ${diagnosticsUptimeText(processInfo.uptimeSeconds)}`, 'positive')}
        ${metric('Database', database.available ? 'Terhubung' : 'Gangguan', `${String(database.mode || '-').toUpperCase()} · ${displayNumber(database.latencyMs || 0)} ms`, database.available ? 'positive' : 'negative')}
        ${metric('Redis', redisAvailable ? 'Terhubung' : 'Tidak siap', String(cache.mode || '-').toUpperCase(), redisAvailable ? 'positive' : 'warning-card')}
        ${metric('Antrean WA', displayNumber(queuedMessages), queue.available ? 'BullMQ aktif' : 'Worker tidak tersedia', queue.available ? 'positive' : 'warning-card')}
      </section>

      <section class="diagnostics-grid">
        <article class="diagnostics-card">
          <div class="section-head"><h2>Proses Aplikasi</h2>${diagnosticsStatusBadge(true, 'Berjalan')}</div>
          <dl>
            <div><dt>RSS</dt><dd>${escapeHtml(statisticsCompactBytes(memory.rss || 0))}</dd></div>
            <div><dt>Heap terpakai</dt><dd>${escapeHtml(statisticsCompactBytes(memory.heapUsed || 0))}</dd></div>
            <div><dt>Heap tersedia</dt><dd>${escapeHtml(statisticsCompactBytes(memory.heapTotal || 0))}</dd></div>
            <div><dt>PID</dt><dd>${displayNumber(processInfo.pid || 0)}</dd></div>
          </dl>
        </article>
        <article class="diagnostics-card">
          <div class="section-head"><h2>Cache</h2>${diagnosticsStatusBadge(redisAvailable, 'Siap', 'Periksa Redis')}</div>
          <dl>
            <div><dt>Cache proses</dt><dd>${displayNumber(runtimeCache.entries || 0)} entri</dd></div>
            <div><dt>Ukuran cache</dt><dd>${escapeHtml(statisticsCompactBytes(runtimeCache.bytes || 0))}</dd></div>
            <div><dt>Batas entri</dt><dd>${displayNumber(runtimeCache.maxEntries || 0)}</dd></div>
            <div><dt>Batas memori</dt><dd>${escapeHtml(statisticsCompactBytes(runtimeCache.maxBytes || 0))}</dd></div>
          </dl>
        </article>
        <article class="diagnostics-card">
          <div class="section-head"><h2>Antrean Whatsapp</h2>${diagnosticsStatusBadge(queue.available === true, 'Aktif', 'Tidak siap')}</div>
          <dl>
            <div><dt>Menunggu</dt><dd>${displayNumber(Number(queue.waiting || 0) + Number(queue.prioritized || 0))}</dd></div>
            <div><dt>Terjadwal</dt><dd>${displayNumber(queue.delayed || 0)}</dd></div>
            <div><dt>Diproses</dt><dd>${displayNumber(queue.active || 0)}</dd></div>
            <div><dt>Gagal</dt><dd>${displayNumber(queue.failed || 0)}</dd></div>
          </dl>
        </article>
        <article class="diagnostics-card">
          <div class="section-head"><h2>Otomasi</h2>${diagnosticsStatusBadge(automation.billing?.active === true, 'Scheduler aktif', 'Scheduler mati')}</div>
          <dl>
            <div><dt>Invoice dan isolir</dt><dd>${diagnosticsStatusBadge(automation.billing?.active === true, automation.billing?.running ? 'Memproses' : 'Siap')}</dd></div>
            <div><dt>Interval billing</dt><dd>${displayNumber(automation.billing?.intervalSeconds || 0)} detik</dd></div>
            <div><dt>Sinkron payment</dt><dd>${diagnosticsStatusBadge(automation.paymentGateway?.active === true, automation.paymentGateway?.running ? 'Memproses' : 'Siap')}</dd></div>
            <div><dt>Monitoring router</dt><dd>${diagnosticsStatusBadge(automation.routerMonitoring?.active === true, automation.routerMonitoring?.running ? 'Memproses' : 'Siap')}</dd></div>
          </dl>
        </article>
      </section>
    </div>
  `;
  document.getElementById('refreshDiagnostics')?.addEventListener('click', () => renderDiagnostics({ refresh: true }));
}

async function renderActivity(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat log...</div>';
  state.activityCategory = normalizeActivityCategoryForRole(state.activityCategory);
  const rangeDates = activityRangeDates(state.activityRange);
  const params = queryString({
    search: state.search,
    range: state.activityRange,
    category: state.activityCategory,
    from: rangeDates.from,
    to: rangeDates.to,
    page: state.activityPage,
    limit: state.activityLimit
  });
  const payload = await api(`/api/activity?${params}`);
  const activity = payload.activity || [];
  const pagination = payload.pagination || { page: 1, totalPages: 1, total: activity.length, limit: state.activityLimit };
  state.activityPage = Number(pagination.page || 1);
  state.activityLimit = pagerLimitValue(pagination.limit || state.activityLimit || 10, 10);
  const customHidden = state.activityRange === 'custom' ? '' : 'hidden';

  app.innerHTML = `
    <div class="stack">
      <div class="toolbar activity-toolbar">
        <div class="filters">
          <select class="control" id="activityRange">
            <option value="today" ${state.activityRange === 'today' ? 'selected' : ''}>Hari Ini</option>
            <option value="week" ${state.activityRange === 'week' ? 'selected' : ''}>7 Hari</option>
            <option value="month" ${state.activityRange === 'month' ? 'selected' : ''}>Bulan Ini</option>
            <option value="custom" ${state.activityRange === 'custom' ? 'selected' : ''}>Custom</option>
            <option value="all" ${state.activityRange === 'all' ? 'selected' : ''}>Semua Log</option>
          </select>
          <select class="control" id="activityCategory">
            ${activityCategoryOptionsMarkup(state.activityCategory)}
          </select>
          <input class="control date-picker-control" id="activityFrom" type="date" value="${escapeHtml(state.activityFrom || rangeDates.from || todayInput())}" ${customHidden}>
          <input class="control date-picker-control" id="activityTo" type="date" value="${escapeHtml(state.activityTo || rangeDates.to || todayInput())}" ${customHidden}>
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari log" autocomplete="off">
        </div>
      </div>
      <section class="section">
        <div class="section-head activity-section-head">
          <h2>${escapeHtml(activityRangeLabel(state.activityRange))}</h2>
          <span>${displayNumber(pagination.total || activity.length)} log</span>
        </div>
        <div class="panel activity-list activity-feed">
          ${activity.length ? activity.map((item) => `
            <div class="activity-item activity-row">
              <div class="activity-row-time">
                <strong>${escapeHtml(dateTimeText(item.at || item.createdAt || ''))}</strong>
                <span>${escapeHtml(activityActorText(item))}</span>
              </div>
              <div class="activity-row-main">
                <div class="activity-title">
                  <span class="badge">${escapeHtml(activityLabel(item.type))}</span>
                  <strong>${escapeHtml(item.message || '-')}</strong>
                </div>
              </div>
              <button class="ghost-button compact" type="button" data-activity-detail="${escapeHtml(item.id || '')}">Detail</button>
            </div>
          `).join('') : '<div class="muted">Belum ada log.</div>'}
        </div>
        ${paginationControls(pagination)}
      </section>
    </div>
  `;

  const rangeSelect = document.getElementById('activityRange');
  const categorySelect = document.getElementById('activityCategory');
  const fromInput = document.getElementById('activityFrom');
  const toInput = document.getElementById('activityTo');
  rangeSelect?.addEventListener('change', () => {
    state.activityRange = rangeSelect.value || 'today';
    const dates = activityRangeDates(state.activityRange);
    if (state.activityRange !== 'custom') {
      state.activityFrom = dates.from || todayInput();
      state.activityTo = dates.to || todayInput();
    }
    state.activityPage = 1;
    renderActivity();
  });
  categorySelect?.addEventListener('change', () => {
    state.activityCategory = categorySelect.value || 'all';
    state.activityPage = 1;
    renderActivity();
  });
  [fromInput, toInput].forEach((input) => {
    input?.addEventListener('change', () => {
      state.activityRange = 'custom';
      state.activityFrom = fromInput?.value || todayInput();
      state.activityTo = toInput?.value || state.activityFrom;
      state.activityPage = 1;
      renderActivity();
    });
  });
  app.querySelectorAll('[data-activity-detail]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = activity.find((row) => String(row.id || '') === String(button.dataset.activityDetail || ''));
      if (item) openActivityDetail(item);
    });
  });
  bindSearch((renderOptions = {}) => {
    state.activityPage = 1;
    return renderActivity(renderOptions);
  });
  document.querySelectorAll('[data-activity-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activityPage = Math.max(1, Number(button.dataset.activityPage || 1));
      renderActivity();
    });
  });
  bindPagerLimit('activity', (limit) => {
    state.activityLimit = limit;
  }, (page) => {
    state.activityPage = page;
  }, renderActivity, 10);
}

function dailyReportSummary(report = {}, transactionCount = Number(report.transactionCount || 0)) {
  return `
    <section class="daily-summary">
      ${metric('Tunai', rupiah(report.cashIncome), 'Tagihan dibayar tunai', 'positive')}
      ${metric('Transfer + Loket', rupiah(report.transferIncome), 'Transfer bank manual dan Loket', 'positive')}
      ${metric('Online', rupiah(report.onlineIncome), 'QRIS, VA, e-wallet, dan gerai', 'positive')}
      ${metric('Total Tagihan', rupiah(report.totalIncome), `${Number(transactionCount || 0).toLocaleString('id-ID')} transaksi`, 'positive')}
    </section>
  `;
}

function reportPaymentCategory(item = {}) {
  const explicit = String(item.paymentCategory || item.methodGroup || '').trim().toLowerCase();
  const method = String(item.method || item.paymentMethod || '').trim().toLowerCase();
  if (method.includes('loket')) return 'transfer';
  if (['cash', 'transfer', 'online'].includes(explicit)) return explicit;
  if (method.includes('tunai') || method.includes('cash')) return 'cash';
  if (/qris|virtual\s*account|e-?wallet|retail\s*outlet|qr\s*code|briva|bniva|bcava|mandiriva|permatava|muamalatva|cimbva|danamonva|maybankva|bsi(?:va)?|ovo|dana|linkaja|shopeepay|gopay|alfamart|alfamidi|indomaret|tripay|xendit|midtrans|duitku|doku|ipaymu/i.test(method)) return 'online';
  return 'transfer';
}

function dailyAdminKey(item = {}) {
  return String(item.adminId || item.adminName || item.admin || '-');
}

function adminFallbackLabel(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return '-';
  return /^\d+$/.test(text) ? `Admin ${text}` : text;
}

function dailyAdminLabel(item = {}, report = {}) {
  const key = dailyAdminKey(item);
  const mapped = report.adminDirectory && report.adminDirectory[key];
  return item.adminName || mapped || adminFallbackLabel(item.admin || key);
}

function dailyBillingTransactions(report = {}) {
  return Array.isArray(report.transactions)
    ? report.transactions.filter((item) => Number(item.amount || item.income || 0) > 0)
    : [];
}

function dailyAdminOptions(transactions = [], report = {}) {
  const options = new Map();
  transactions.forEach((item) => {
    const key = dailyAdminKey(item);
    if (!key || key === '-') return;
    if (!options.has(key)) {
      options.set(key, dailyAdminLabel(item, report));
    }
  });
  return [...options.entries()].map(([value, label]) => ({ value, label }));
}

function dailySiteKey(item = {}, sites = []) {
  if (item.siteId) return String(item.siteId);
  const label = String(item.siteName || item.site || '').trim();
  if (label) {
    const mapped = sites.find((site) => String(site.name || '').trim().toLowerCase() === label.toLowerCase());
    if (mapped && mapped.id) return String(mapped.id);
    return label;
  }
  return '-';
}

function dailySiteLabel(item = {}, sites = []) {
  const key = dailySiteKey(item, sites);
  const mapped = sites.find((site) => site.id === key || site.name === key);
  return mapped ? mapped.name : (item.siteName || item.site || key);
}

function dailySiteOptions(transactions = [], sites = []) {
  const options = new Map();
  sites.forEach((site) => {
    if (site.id && site.name) {
      options.set(site.id, site.name);
    }
  });
  transactions.forEach((item) => {
    const key = dailySiteKey(item, sites);
    if (!key || key === '-') return;
    if (!options.has(key)) {
      options.set(key, dailySiteLabel(item, sites));
    }
  });
  return [...options.entries()].map(([value, label]) => ({ value, label }));
}

function dailyReportSummaryFromTransactions(report = {}, transactions = [], filtered = false) {
  if (!filtered) {
    return {
      cashIncome: Number(report.cashIncome || 0),
      transferIncome: Number(report.transferIncome || 0),
      onlineIncome: Number(report.onlineIncome || 0),
      totalIncome: Number(report.totalIncome || 0),
      fetchedAt: report.fetchedAt,
      transactionCount: transactions.length
    };
  }

  const cashIncome = transactions
    .filter((item) => reportPaymentCategory(item) === 'cash')
    .reduce((sum, item) => sum + Number(item.income || 0), 0);
  const transferIncome = transactions
    .filter((item) => reportPaymentCategory(item) === 'transfer')
    .reduce((sum, item) => sum + Number(item.income || 0), 0);
  const onlineIncome = transactions
    .filter((item) => reportPaymentCategory(item) === 'online')
    .reduce((sum, item) => sum + Number(item.income || 0), 0);
  return {
    cashIncome,
    transferIncome,
    onlineIncome,
    totalIncome: cashIncome + transferIncome + onlineIncome,
    fetchedAt: report.fetchedAt,
    transactionCount: transactions.length
  };
}

function dailyPaymentTime(item = {}) {
  const fromRaw = legacySourceTimeText(item.paymentRaw);
  if (fromRaw) return fromRaw;
  const fromDate = timeText(item.paymentAt);
  return fromDate !== '-' ? fromDate : (item.paymentTime || '-');
}

function dailyReceiptAllowed(item = {}) {
  const status = String(item.status || '').toLowerCase();
  return Boolean((Number(item.income || 0) > 0 || status === 'paid') && (item.invoiceNo || item.externalId || item.id));
}

function dailyDiscountAuditAllowed(item = {}) {
  if (!dailyReceiptAllowed(item)) return false;
  return Boolean(
    Number(item.discountAmount || 0) > 0
    || Number(item.manualDiscountAmount || item.invoiceDiscountAmount || 0) > 0
    || String(item.discountNote || '').trim()
    || String(item.discountUpdatedAt || '').trim()
  );
}

function openDailyDiscountAuditModal(item = {}) {
  if (!dailyDiscountAuditAllowed(item)) {
    setToast('Audit diskon tidak tersedia');
    return;
  }
  const invoiceNo = item.invoiceNo || item.externalId || '-';
  const customerName = item.customerName || item.info || item.username || '-';
  const baseDiscount = Math.max(0, Number(item.baseDiscountAmount || 0));
  const manualDiscount = Math.max(0, Number(item.manualDiscountAmount || item.invoiceDiscountAmount || 0));
  const totalDiscount = Math.max(0, Number(item.discountAmount || 0));
  const grossAmount = Math.max(0, Number(item.totalBeforeDiscount || 0))
    || Math.max(0, Number(item.amount || item.income || 0) + totalDiscount);
  const rows = [
    ['No Invoice', invoiceNo],
    ['Pelanggan', customerName],
    ['Paket', item.item || '-'],
    ['Subtotal sebelum diskon', rupiah(grossAmount)],
    ['Diskon member/awal', rupiah(baseDiscount)],
    ['Diskon invoice bulan ini', rupiah(manualDiscount)],
    ['Total diskon', rupiah(totalDiscount)],
    ['Nominal dibayar', rupiah(item.amount || item.income || 0)],
    ['Metode', item.method || '-'],
    ['Diubah oleh', item.discountUpdatedBy || item.discountUpdatedByUsername || '-'],
    ['Waktu perubahan', item.discountUpdatedAt ? dateTimeText(item.discountUpdatedAt) : '-'],
    ['Catatan', item.discountNote || '-']
  ];
  openModal('Audit Diskon Tagihan', `
    <div class="manual-invoice-wizard">
      <div class="manual-invoice-selected">
        <span>
          <strong>${escapeHtml(customerName)}</strong>
          <small>${escapeHtml([item.username, item.phone, item.siteName].filter(Boolean).join(' / ') || '-')}</small>
        </span>
        <span class="badge ${billingStatusBadge(item.status || 'paid')}">${escapeHtml(billingStatusLabel(item.status || 'paid'))}</span>
      </div>
      <div class="manual-invoice-preview">
        ${rows.map(([label, value]) => `
          <div class="manual-invoice-preview-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value || '-')}</strong>
          </div>
        `).join('')}
      </div>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Tutup</button>
      </div>
    </div>
  `, async () => {});
}

async function renderReportsDaily(options = {}) {
  app.innerHTML = '<div class="empty">Memuat tagihan harian...</div>';
  const collectorReport = state.auth?.role === 'collector';
  const collectorName = state.auth?.name || state.auth?.username || 'Collector';
  const params = {
    date: state.dailyReportDate
  };
  if (options.refreshBillingSource) {
    params.refresh = '1';
  }
  const payload = await api(`/api/reports/daily?${queryString(params)}`);
  const report = payload.report || null;
  const billingTransactions = report ? dailyBillingTransactions(report) : [];
  const reportSites = Array.isArray(payload.sites) ? payload.sites : (Array.isArray(report?.sites) ? report.sites : []);
  const siteOptions = dailySiteOptions(billingTransactions, reportSites);
  const selectedSite = siteOptions.some((item) => item.value === state.dailyReportSite) ? state.dailyReportSite : 'all';
  if (state.dailyReportSite !== selectedSite) {
    state.dailyReportSite = selectedSite;
  }
  const siteTransactions = selectedSite === 'all'
    ? billingTransactions
    : billingTransactions.filter((item) => dailySiteKey(item, reportSites) === selectedSite);
  const adminOptions = dailyAdminOptions(siteTransactions, report || {});
  const selectedAdmin = adminOptions.some((item) => item.value === state.dailyReportAdmin) ? state.dailyReportAdmin : 'all';
  if (state.dailyReportAdmin !== selectedAdmin) {
    state.dailyReportAdmin = selectedAdmin;
  }
  const filteredTransactions = selectedAdmin === 'all'
    ? siteTransactions
    : siteTransactions.filter((item) => dailyAdminKey(item) === selectedAdmin);
  const summaryReport = report
    ? dailyReportSummaryFromTransactions(report, filteredTransactions, selectedAdmin !== 'all' || selectedSite !== 'all')
    : null;
  const sync = payload.sync || {};
  const standaloneReport = payload.source === 'local';
  const syncAllowed = false;

  if (!standaloneReport && options.refreshBillingSource) {
    setToast(sync.ok ? 'Tagihan harian diperbarui' : (sync.error || 'Sinkron tagihan harian gagal'));
  }

  app.innerHTML = `
    <div class="stack">
      <div class="toolbar">
        <div class="filters">
          ${datePickerControl({ id: 'dailyReportDate', value: state.dailyReportDate, className: 'control' })}
          <select class="control" id="dailyReportSite">
            <option value="all">Semua NAS</option>
            ${siteOptions.map((item) => `
              <option value="${escapeHtml(item.value)}" ${item.value === selectedSite ? 'selected' : ''}>${escapeHtml(item.label)}</option>
            `).join('')}
          </select>
          ${collectorReport
            ? `<input class="control" value="${escapeHtml(collectorName)}" disabled>`
            : `<select class="control" id="dailyReportAdmin">
                <option value="all">Semua Admin</option>
                ${adminOptions.map((item) => `
                  <option value="${escapeHtml(item.value)}" ${item.value === selectedAdmin ? 'selected' : ''}>${escapeHtml(item.label)}</option>
                `).join('')}
              </select>`}
        </div>
        <div class="row-actions">
          <span class="muted" id="dailyReceiptSelectedInfo" hidden>0 dipilih</span>
          <button class="button compact" id="dailyPrintSelected" type="button" hidden>Print Kuitansi</button>
          ${syncAllowed ? '<button class="button" id="syncDailyReport" type="button">Ambil Data Billing</button>' : ''}
        </div>
      </div>
      ${!standaloneReport && sync.error ? `<div class="notice error">${escapeHtml(sync.error)}</div>` : ''}
      ${summaryReport ? dailyReportSummary(summaryReport, filteredTransactions.length) : '<div class="empty">Belum ada data tagihan harian untuk tanggal ini.</div>'}
      <section class="section">
        <div class="table-wrap daily-report-table-wrap">
          <table class="daily-report-table">
            <thead>
              <tr>
                <th><input type="checkbox" id="dailyReceiptSelectAll" aria-label="Pilih semua kuitansi"></th>
                <th>Info</th>
                <th>NAS</th>
                <th>Jam Bayar</th>
                <th>Metode</th>
                <th>Status</th>
                <th>Admin</th>
                <th>Nominal</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${filteredTransactions.length ? filteredTransactions.map((item, index) => `
                <tr>
                  <td>
                    <input type="checkbox" data-daily-receipt-select="${index}" ${dailyReceiptAllowed(item) ? '' : 'disabled'} aria-label="Pilih kuitansi ${escapeHtml(item.invoiceNo || item.externalId || item.info || index + 1)}">
                  </td>
                  <td>${escapeHtml(item.info || item.externalId || '-')}</td>
                  <td class="site-cell"><span class="site-pill" title="${escapeHtml(dailySiteLabel(item, reportSites) || '-')}">${escapeHtml(dailySiteLabel(item, reportSites) || '-')}</span></td>
                  <td class="nowrap">${escapeHtml(dailyPaymentTime(item))}</td>
                  <td>
                    <strong>${escapeHtml(item.method || '-')}</strong>
                    ${String(item.method || '').trim().toLowerCase() === 'tunai - loket'
                      ? `<div class="muted daily-confirmed-by" title="${escapeHtml(dailyAdminLabel(item, report || {}))}">Oleh: <span>${escapeHtml(dailyAdminLabel(item, report || {}))}</span></div>`
                      : ''}
                  </td>
                  <td><span class="badge ${billingStatusBadge(item.status)}">${escapeHtml(billingStatusLabel(item.status || (Number(item.income || 0) > 0 ? 'paid' : 'pending')))}</span></td>
                  <td class="daily-admin-cell" title="${escapeHtml(dailyAdminLabel(item, report || {}))}">
                    <span class="daily-admin-name">${escapeHtml(dailyAdminLabel(item, report || {}))}</span>
                  </td>
                  <td class="amount positive">${rupiah(item.amount || item.income || 0)}</td>
                  <td class="billing-action-cell">
                    ${(dailyReceiptAllowed(item) || dailyDiscountAuditAllowed(item)) ? `
                      <div class="billing-action-stack">
                        ${dailyReceiptAllowed(item) ? `
                          <button class="billing-action-button pdf" type="button" data-daily-receipt-print="${index}" title="Print PDF kuitansi" aria-label="Print PDF kuitansi ${escapeHtml(item.invoiceNo || item.externalId || '')}">
                            <span class="billing-action-icon pdf" aria-hidden="true"></span>
                          </button>
                        ` : ''}
                        ${dailyDiscountAuditAllowed(item) ? `
                          <button class="billing-action-button audit" type="button" data-daily-discount-audit="${index}" title="Audit diskon tagihan" aria-label="Audit diskon tagihan ${escapeHtml(item.invoiceNo || item.externalId || '')}">
                            <span class="billing-action-icon audit" aria-hidden="true"></span>
                          </button>
                        ` : ''}
                      </div>
                    ` : '<span class="muted">-</span>'}
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="9">Belum ada tagihan pada tanggal ini.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  const selectedDailyReceipts = () => [...app.querySelectorAll('[data-daily-receipt-select]:checked')]
    .map((checkbox) => filteredTransactions[Number(checkbox.dataset.dailyReceiptSelect || -1)])
    .filter((item) => item && dailyReceiptAllowed(item));
  const updateDailyReceiptActions = () => {
    const selected = selectedDailyReceipts();
    const selectable = [...app.querySelectorAll('[data-daily-receipt-select]:not(:disabled)')];
    const selectAll = document.getElementById('dailyReceiptSelectAll');
    if (selectAll) {
      selectAll.checked = selectable.length > 0 && selectable.every((checkbox) => checkbox.checked);
      selectAll.indeterminate = selected.length > 0 && !selectAll.checked;
      selectAll.disabled = selectable.length === 0;
    }
    const info = document.getElementById('dailyReceiptSelectedInfo');
    const printButton = document.getElementById('dailyPrintSelected');
    if (info) {
      info.hidden = selected.length === 0;
      info.textContent = `${displayNumber(selected.length)} dipilih`;
    }
    if (printButton) {
      printButton.hidden = selected.length === 0;
      printButton.disabled = selected.length === 0;
    }
  };
  document.getElementById('dailyReceiptSelectAll')?.addEventListener('change', (event) => {
    app.querySelectorAll('[data-daily-receipt-select]:not(:disabled)').forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
    updateDailyReceiptActions();
  });
  app.querySelectorAll('[data-daily-receipt-select]').forEach((checkbox) => {
    checkbox.addEventListener('change', updateDailyReceiptActions);
  });
  document.getElementById('dailyPrintSelected')?.addEventListener('click', () => {
    const selected = selectedDailyReceipts();
    if (!selected.length) return;
    openDailyBillingReceiptsModal(selected, report || {});
  });
  app.querySelectorAll('[data-daily-receipt-print]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = filteredTransactions[Number(button.dataset.dailyReceiptPrint || -1)];
      if (!item || !dailyReceiptAllowed(item)) {
        setToast('Kuitansi tidak tersedia');
        return;
      }
      openDailyBillingReceiptsModal([item], report || {});
    });
  });
  app.querySelectorAll('[data-daily-discount-audit]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = filteredTransactions[Number(button.dataset.dailyDiscountAudit || -1)];
      openDailyDiscountAuditModal(item || {});
    });
  });
  updateDailyReceiptActions();

  document.getElementById('dailyReportDate')?.addEventListener('change', (event) => {
    state.dailyReportDate = event.target.value || todayInput();
    state.dailyReportAdmin = 'all';
    state.dailyReportSite = 'all';
    renderReportsDaily();
  });
  document.getElementById('dailyReportSite')?.addEventListener('change', (event) => {
    state.dailyReportSite = event.target.value || 'all';
    state.dailyReportAdmin = 'all';
    renderReportsDaily();
  });
  document.getElementById('dailyReportAdmin')?.addEventListener('change', (event) => {
    state.dailyReportAdmin = event.target.value || 'all';
    renderReportsDaily();
  });
  document.getElementById('syncDailyReport')?.addEventListener('click', () => renderReportsDaily({ refreshBillingSource: true }));
}

function reportTransactionsPaginationControls(pagination = {}) {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('report-transaction', pagination.limit || state.reportTransactionsLimit || 10, 10);
  if (total <= effectivePagerLimit(pagination.limit || state.reportTransactionsLimit || 10, total, 10)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${displayNumber(total)} transaksi` : 'Belum ada transaksi'}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-report-transaction-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${displayNumber(page)} dari ${displayNumber(totalPages)} - ${displayNumber(total)} transaksi</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-report-transaction-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function cleanReportTransactionPackage(value = '') {
  let text = String(value || '').trim();
  if (!text) return '';
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/^internet\s*:\s*/i, '').trim();
  if (text.includes('|')) text = text.slice(text.lastIndexOf('|') + 1).trim();
  if (/^internet\s*:/i.test(text) && text.includes(' - ')) {
    text = text.slice(text.lastIndexOf(' - ') + 3).trim();
  }
  return text;
}

function reportTransactionReferenceDetail(transaction = {}) {
  if (transaction.referenceDetail) return String(transaction.referenceDetail);
  const source = String(transaction.source || '').trim().toLowerCase();
  const sourceLabel = String(transaction.sourceLabel || transaction.type || '').trim().toLowerCase();
  const description = String(transaction.description || '').trim().replace(/\s+—\s+/g, ' - ');
  const customerName = String(transaction.customerName || transaction.payerName || transaction.buyerName || '').trim();
  const username = String(transaction.username || '').trim();
  const name = customerName || username || '-';
  const packageName = cleanReportTransactionPackage(transaction.packageName || transaction.item || '');
  const itemText = packageName || cleanReportTransactionPackage(transaction.item || '') || '-';

  if (/^(internet bulanan|voucher hotspot|pemasukan)\s*:/i.test(description)) return description;
  if (source === 'billing' || sourceLabel.includes('tagihan')) {
    return `Internet Bulanan: ${name} - ${itemText}`;
  }
  if (source === 'voucher' || sourceLabel.includes('voucher')) {
    return `Voucher Hotspot: ${name} - ${itemText}`;
  }
  if (source === 'external' || sourceLabel.includes('pemasukan')) {
    const detail = itemText !== '-' ? itemText : (description || '-');
    return `Pemasukan: ${name} - ${detail}`;
  }
  if (source === 'payment-gateway' || sourceLabel.includes('online')) {
    if (String(transaction.invoiceNo || transaction.reference || '').toUpperCase().startsWith('VO-')) {
      return `Voucher Hotspot: ${name} - ${itemText}`;
    }
    if (description) return description;
  }
  return description || `${name} - ${itemText}`;
}

function monthlyBillingPaginationControls(pagination = {}) {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('monthly-billing', pagination.limit || state.reportMonthlyBillingLimit || 10, 10);
  if (total <= effectivePagerLimit(pagination.limit || state.reportMonthlyBillingLimit || 10, total, 10)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${displayNumber(total)} invoice` : 'Belum ada invoice'}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-monthly-billing-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${displayNumber(page)} dari ${displayNumber(totalPages)} - ${displayNumber(total)} invoice</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-monthly-billing-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function financeDailyRowsTable(rows = [], emptyText = 'Belum ada data harian.') {
  const totals = rows.reduce((acc, row) => {
    acc.incomeCash += Number(row.incomeCash || 0);
    acc.incomeTransfer += Number(row.incomeTransfer || 0);
    acc.incomeOnline += Number(row.incomeOnline || 0);
    acc.expenseCash += Number(row.expenseCash || 0);
    acc.expenseTransfer += Number(row.expenseTransfer || 0);
    acc.incomeTotal += Number(row.incomeTotal || 0);
    return acc;
  }, { incomeCash: 0, incomeTransfer: 0, incomeOnline: 0, expenseCash: 0, expenseTransfer: 0, incomeTotal: 0 });
  return `
    <div class="table-wrap">
      <table class="finance-daily-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Tanggal</th>
            <th class="amount">Pemasukan Tunai</th>
            <th class="amount">Pemasukan Transfer</th>
            <th class="amount">Pemasukan Online</th>
            <th class="amount">Pengeluaran Tunai</th>
            <th class="amount">Pengeluaran Transfer</th>
            <th class="amount">Total Pendapatan</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row, index) => `
            <tr>
              <td>${displayNumber(index + 1)}</td>
              <td class="nowrap">${dateText(row.date)}</td>
              <td class="amount positive">${rupiah(row.incomeCash || 0)}</td>
              <td class="amount positive">${rupiah(row.incomeTransfer || 0)}</td>
              <td class="amount positive">${rupiah(row.incomeOnline || 0)}</td>
              <td class="amount negative">${rupiah(row.expenseCash || 0)}</td>
              <td class="amount negative">${rupiah(row.expenseTransfer || 0)}</td>
              <td class="amount positive"><strong>${rupiah(row.incomeTotal || 0)}</strong></td>
            </tr>
          `).join('') : `<tr><td colspan="8">${escapeHtml(emptyText)}</td></tr>`}
          ${rows.length ? `
            <tr class="table-total-row">
              <td colspan="2"><strong>Total</strong></td>
              <td class="amount positive"><strong>${rupiah(totals.incomeCash)}</strong></td>
              <td class="amount positive"><strong>${rupiah(totals.incomeTransfer)}</strong></td>
              <td class="amount positive"><strong>${rupiah(totals.incomeOnline)}</strong></td>
              <td class="amount negative"><strong>${rupiah(totals.expenseCash)}</strong></td>
              <td class="amount negative"><strong>${rupiah(totals.expenseTransfer)}</strong></td>
              <td class="amount positive"><strong>${rupiah(totals.incomeTotal)}</strong></td>
            </tr>
          ` : ''}
        </tbody>
      </table>
    </div>
  `;
}

function statisticsNetTone(value = 0) {
  const number = Number(value || 0);
  if (number > 0) return 'positive';
  if (number < 0) return 'negative';
  return '';
}

function statisticsNetText(value = 0) {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${displayNumber(number)}`;
}

function statisticsCompactNumber(value = 0) {
  const number = Math.max(0, Number(value || 0));
  if (number >= 1000000000) return `${(number / 1000000000).toFixed(number >= 10000000000 ? 0 : 1).replace('.', ',')} M`;
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1).replace('.', ',')} jt`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1).replace('.', ',')} rb`;
  return displayNumber(number);
}

function statisticsCompactRupiah(value = 0) {
  return `Rp ${statisticsCompactNumber(value)}`;
}

function statisticsCompactBytes(value = 0) {
  let bytes = Math.max(0, Number(value || 0));
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unit = 0;
  while (bytes >= 1024 && unit < units.length - 1) {
    bytes /= 1024;
    unit += 1;
  }
  const precision = unit <= 1 ? 0 : 1;
  return `${bytes.toFixed(precision).replace('.', ',')} ${units[unit]}`;
}

function statisticsCompactMbps(value = 0) {
  const number = Math.max(0, Number(value || 0));
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1).replace('.', ',')} Gbps`;
  const precision = number >= 100 ? 0 : number >= 10 ? 1 : 2;
  return `${number.toFixed(precision).replace('.', ',')} Mbps`;
}

function statisticsMax(rows = [], keys = []) {
  return Math.max(1, ...rows.map((row) => Math.max(...keys.map((key) => Number(row[key] || 0)))));
}

function statisticsChartRange(values = [], options = {}) {
  const clean = values.map((value) => Number(value || 0)).filter((value) => Number.isFinite(value));
  const rawMin = clean.length ? Math.min(...clean) : 0;
  const rawMax = clean.length ? Math.max(...clean) : 1;
  const zeroBase = options.zeroBase !== false;
  let min = zeroBase ? 0 : rawMin;
  let max = Math.max(rawMax, min + 1);
  const span = Math.max(1, max - min);
  const padding = Math.max(Number(options.minPadding || 0), span * Number(options.padding || 0.12));
  if (!zeroBase) min = Math.max(0, min - padding);
  max += padding;
  const stepBase = Number(options.stepBase || 1);
  min = Math.floor(min / stepBase) * stepBase;
  max = Math.ceil(max / stepBase) * stepBase;
  if (max <= min) max = min + stepBase;
  const ticks = [max, min + ((max - min) * 0.66), min + ((max - min) * 0.33), min].map((value) => Math.round(value / stepBase) * stepBase);
  return { min, max, ticks: [...new Set(ticks)] };
}

function statisticsChartPoint(value = 0, range = {}, box = {}) {
  const top = box.top || 18;
  const plotHeight = box.plotHeight || 132;
  const min = Number(range.min || 0);
  const max = Number(range.max || 1);
  const ratio = Math.max(0, Math.min(1, (Number(value || 0) - min) / Math.max(1, max - min)));
  return top + plotHeight - (ratio * plotHeight);
}

function statisticsLinePath(points = []) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function statisticsAreaPath(points = [], baselineY = 0) {
  if (!points.length) return '';
  const line = statisticsLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L${last.x.toFixed(2)} ${baselineY.toFixed(2)} L${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

function statisticsAxisMarkup(range = {}, box = {}, formatter = displayNumber) {
  const left = box.left || 44;
  const right = box.right || 12;
  const width = box.width || 420;
  return (range.ticks || []).map((value) => {
    const y = statisticsChartPoint(value, range, box);
    return `<g class="statistics-axis"><line x1="${left}" y1="${y.toFixed(2)}" x2="${width - right}" y2="${y.toFixed(2)}"></line><text x="8" y="${(y + 4).toFixed(2)}">${escapeHtml(formatter(value))}</text></g>`;
  }).join('');
}

function statisticsMonthAxisMarkup(rows = [], box = {}) {
  const left = box.left || 44;
  const width = box.width || 420;
  const right = box.right || 12;
  const bottomY = (box.top || 18) + (box.plotHeight || 132) + 24;
  const plotWidth = width - left - right;
  const step = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth;
  return rows.map((row, index) => {
    const x = left + (step * index);
    const [monthLabel, yearLabel] = periodShortLabel(row.period).split(' ');
    return `<text class="statistics-x-label" x="${x.toFixed(2)}" y="${bottomY}" text-anchor="middle"><tspan x="${x.toFixed(2)}">${escapeHtml(monthLabel || '-')}</tspan><tspan x="${x.toFixed(2)}" dy="10">${escapeHtml(yearLabel || '')}</tspan></text>`;
  }).join('');
}

function statisticsGrowthLineChart(rows = []) {
  const chartRows = Array.isArray(rows) ? rows : [];
  const box = { width: 420, height: 204, left: 44, right: 12, top: 18, plotHeight: 132 };
  const range = statisticsChartRange(chartRows.map((row) => row.activeCustomerCount), { zeroBase: false, minPadding: 10, stepBase: 10 });
  const plotWidth = box.width - box.left - box.right;
  const step = chartRows.length > 1 ? plotWidth / (chartRows.length - 1) : plotWidth;
  const points = chartRows.map((row, index) => ({
    x: box.left + (step * index),
    y: statisticsChartPoint(row.activeCustomerCount, range, box),
    row
  }));
  return `
    <div class="statistics-chart-card statistics-growth-chart">
      <div class="statistics-chart-head">
        <div>
          <h3>Pertumbuhan Pelanggan Bulanan</h3>
          <span>Perubahan jumlah pelanggan aktif dari bulan ke bulan.</span>
        </div>
        <div class="statistics-legend compact">
          <span class="active-total">Total pelanggan aktif</span>
        </div>
      </div>
      <div class="statistics-svg-wrap">
        <svg viewBox="0 0 ${box.width} ${box.height}" role="img" aria-label="Pertumbuhan pelanggan bulanan">
          ${statisticsAxisMarkup(range, box, displayNumber)}
          <path class="statistics-line active-total" d="${statisticsLinePath(points)}"></path>
          ${points.map((point) => {
            const row = point.row || {};
            const tooltip = `${periodLabel(row.period)}\nTotal pelanggan aktif: ${displayNumber(row.activeCustomerCount || 0)}\nPelanggan baru: ${displayNumber(row.newInstallCount || 0)}\nSenilai: ${rupiah(row.newInstallAmount || 0)}\nPelanggan berhenti: ${displayNumber(row.removedCount || 0)}\nSenilai cabut: ${rupiah(row.removedAmount || 0)}\nPertumbuhan bersih: ${statisticsNetText(row.netGrowth || 0)}`;
            return `
              <circle class="statistics-dot active-total" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.5" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></circle>
              <circle class="statistics-hit-circle" fill="transparent" pointer-events="all" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="13" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></circle>
            `;
          }).join('')}
          ${statisticsMonthAxisMarkup(chartRows, box)}
        </svg>
      </div>
    </div>
  `;
}

function statisticsVoucherBarChart(rows = []) {
  const chartRows = Array.isArray(rows) ? rows : [];
  const box = { width: 420, height: 204, left: 44, right: 12, top: 18, plotHeight: 132 };
  const range = statisticsChartRange(chartRows.map((row) => row.voucherCount), { zeroBase: true, minPadding: 10, stepBase: 10 });
  const plotWidth = box.width - box.left - box.right;
  const step = chartRows.length ? plotWidth / chartRows.length : plotWidth;
  const barWidth = Math.max(8, Math.min(18, step * 0.46));
  return `
    <div class="statistics-chart-card">
      <div class="statistics-chart-head">
        <div>
          <h3>Penjualan Voucher Bulanan</h3>
          <span>Jumlah voucher yang berhasil terjual setiap bulan.</span>
        </div>
        <div class="statistics-legend compact">
          <span class="voucher">Voucher terjual</span>
        </div>
      </div>
      <div class="statistics-svg-wrap">
        <svg viewBox="0 0 ${box.width} ${box.height}" role="img" aria-label="Penjualan voucher bulanan">
          ${statisticsAxisMarkup(range, box, (value) => `${displayNumber(value)} voucher`)}
          ${chartRows.map((row, index) => {
            const value = Number(row.voucherCount || 0);
            const y = statisticsChartPoint(value, range, box);
            const height = Math.max(0, (box.top + box.plotHeight) - y);
            const x = box.left + (step * index) + ((step - barWidth) / 2);
            const tooltip = `${periodLabel(row.period)}\nVoucher terjual: ${displayNumber(value)}\nOmzet voucher: ${rupiah(row.voucherAmount || 0)}`;
            const hitWidth = Math.max(28, barWidth + 12);
            const hitX = x + (barWidth / 2) - (hitWidth / 2);
            return `
              <rect class="statistics-bar voucher" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${height.toFixed(2)}" rx="5" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
              <rect class="statistics-hit-rect" fill="transparent" pointer-events="all" x="${hitX.toFixed(2)}" y="${box.top}" width="${hitWidth.toFixed(2)}" height="${box.plotHeight}" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
            `;
          }).join('')}
          ${statisticsMonthAxisMarkup(chartRows, box)}
        </svg>
      </div>
    </div>
  `;
}

function statisticsRevenueGroupedChart(rows = []) {
  const chartRows = Array.isArray(rows) ? rows : [];
  const box = { width: 420, height: 204, left: 50, right: 12, top: 18, plotHeight: 132 };
  const range = statisticsChartRange(chartRows.flatMap((row) => [row.revenueAmount, row.expenseAmount]), { zeroBase: true, minPadding: 100000, stepBase: 100000 });
  const plotWidth = box.width - box.left - box.right;
  const step = chartRows.length ? plotWidth / chartRows.length : plotWidth;
  const barWidth = Math.max(5, Math.min(10, step * 0.24));
  return `
    <div class="statistics-chart-card">
      <div class="statistics-chart-head">
        <div>
          <h3>Pendapatan Setiap Bulan</h3>
          <span>Pendapatan dan pengeluaran bulanan.</span>
        </div>
        <div class="statistics-legend compact">
          <span class="income">Pendapatan</span>
          <span class="expense">Pengeluaran</span>
        </div>
      </div>
      <div class="statistics-svg-wrap">
        <svg viewBox="0 0 ${box.width} ${box.height}" role="img" aria-label="Pendapatan dan pengeluaran bulanan">
          ${statisticsAxisMarkup(range, box, statisticsCompactRupiah)}
          ${chartRows.map((row, index) => {
            const income = Number(row.revenueAmount || 0);
            const expense = Number(row.expenseAmount || 0);
            const net = income - expense;
            const baseX = box.left + (step * index) + ((step - (barWidth * 2 + 3)) / 2);
            const incomeY = statisticsChartPoint(income, range, box);
            const expenseY = statisticsChartPoint(expense, range, box);
            const baseline = box.top + box.plotHeight;
            const tooltip = `${periodLabel(row.period)}\nPendapatan: ${rupiah(income)}\n  Tunai: ${rupiah(row.cashRevenueAmount || 0)}\n  Transfer: ${rupiah(row.transferRevenueAmount || 0)}\n  Online: ${rupiah(row.onlineRevenueAmount || 0)}\nPengeluaran: ${rupiah(expense)}\nLaba bersih: ${rupiah(net)}`;
            const hitX = baseX - 7;
            const hitWidth = Math.max(30, (barWidth * 2) + 17);
            return `
              <rect class="statistics-bar income" x="${baseX.toFixed(2)}" y="${incomeY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, baseline - incomeY).toFixed(2)}" rx="4" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
              <rect class="statistics-bar expense" x="${(baseX + barWidth + 3).toFixed(2)}" y="${expenseY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, baseline - expenseY).toFixed(2)}" rx="4" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
              <rect class="statistics-hit-rect" fill="transparent" pointer-events="all" x="${hitX.toFixed(2)}" y="${box.top}" width="${hitWidth.toFixed(2)}" height="${box.plotHeight}" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
            `;
          }).join('')}
          ${statisticsMonthAxisMarkup(chartRows, box)}
        </svg>
      </div>
    </div>
  `;
}

function statisticsAnnualSummary(rows = []) {
  const totals = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    acc.newInstallCount += Number(row.newInstallCount || 0);
    acc.newInstallAmount += Number(row.newInstallAmount || 0);
    acc.removedCount += Number(row.removedCount || 0);
    acc.removedAmount += Number(row.removedAmount || 0);
    acc.voucherCount += Number(row.voucherCount || 0);
    acc.voucherAmount += Number(row.voucherAmount || 0);
    acc.revenueAmount += Number(row.revenueAmount || 0);
    acc.expenseAmount += Number(row.expenseAmount || 0);
    return acc;
  }, {
    newInstallCount: 0,
    newInstallAmount: 0,
    removedCount: 0,
    removedAmount: 0,
    voucherCount: 0,
    voucherAmount: 0,
    revenueAmount: 0,
    expenseAmount: 0
  });
  totals.netGrowth = totals.newInstallCount - totals.removedCount;
  totals.netGrowthAmount = totals.newInstallAmount - totals.removedAmount;
  totals.profitAmount = totals.revenueAmount - totals.expenseAmount;
  totals.activeCustomerCount = Number(rows.at(-1)?.activeCustomerCount || 0);
  return totals;
}

function statisticsAnnualSummaryMarkup(rows = []) {
  const totals = statisticsAnnualSummary(rows);
  return `
    <div class="statistics-annual-summary">
      <div class="statistics-annual-item">
        <span>Pelanggan Aktif</span>
        <strong>${displayNumber(totals.activeCustomerCount)}</strong>
        <small>Akhir periode</small>
      </div>
      <div class="statistics-annual-item ${statisticsNetTone(totals.netGrowth)}">
        <span>Pertumbuhan Bersih</span>
        <strong>${escapeHtml(statisticsNetText(totals.netGrowth))}</strong>
        <small>PSB ${displayNumber(totals.newInstallCount)} ${rupiah(totals.newInstallAmount)} / Cabut ${displayNumber(totals.removedCount)} ${rupiah(totals.removedAmount)}</small>
      </div>
      <div class="statistics-annual-item voucher">
        <span>Voucher Terjual</span>
        <strong>${displayNumber(totals.voucherCount)}</strong>
        <small>${rupiah(totals.voucherAmount)}</small>
      </div>
      <div class="statistics-annual-item positive">
        <span>Pendapatan</span>
        <strong>${statisticsCompactRupiah(totals.revenueAmount)}</strong>
        <small>Akumulasi 12 bulan</small>
      </div>
      <div class="statistics-annual-item negative">
        <span>Pengeluaran</span>
        <strong>${statisticsCompactRupiah(totals.expenseAmount)}</strong>
        <small>Akumulasi 12 bulan</small>
      </div>
      <div class="statistics-annual-item ${statisticsNetTone(totals.profitAmount)}">
        <span>Laba Bersih</span>
        <strong>${statisticsCompactRupiah(totals.profitAmount)}</strong>
        <small>Pendapatan dikurangi pengeluaran</small>
      </div>
    </div>
  `;
}

async function renderReportsStatistics() {
  app.innerHTML = '<div class="empty">Memuat statistik...</div>';
  const period = state.reportStatisticsPeriod || state.period || todayInput().slice(0, 7);
  const payload = await api(`/api/reports/statistics?${queryString({ period, nas: state.reportNas || 'all' })}`);
  const summary = payload.summary || {};
  const monthlyRows = Array.isArray(payload.monthlyRows) ? payload.monthlyRows : [];
  const nasOptions = Array.isArray(payload.nasOptions) ? payload.nasOptions : [];
  state.reportStatisticsPeriod = payload.period || period;
  state.period = state.reportStatisticsPeriod;
  const netGrowth = Number(summary.netGrowth || 0);
  const firstMonth = monthlyRows[0]?.period || state.reportStatisticsPeriod;
  const lastMonth = monthlyRows[monthlyRows.length - 1]?.period || state.reportStatisticsPeriod;

  app.innerHTML = `
    <div class="stack">
      <div class="toolbar">
        <div class="filters">
          <input class="control month-picker-control" id="reportStatisticsPeriod" type="month" value="${escapeHtml(state.reportStatisticsPeriod)}">
          <select class="control" id="reportStatisticsNas" aria-label="Filter NAS statistik">
            ${voucherReportOptionTags(nasOptions, state.reportNas || 'all', 'Semua NAS')}
          </select>
        </div>
      </div>

      <section class="statistics-hero">
        <div class="statistics-balance ${statisticsNetTone(netGrowth)}">
          <span>Selisih Bulan Ini</span>
          <strong>${escapeHtml(statisticsNetText(netGrowth))}</strong>
          <small>${escapeHtml(periodLabel(state.reportStatisticsPeriod))}</small>
        </div>
        <div class="statistics-card-grid">
          ${metric('Pasang Baru', displayNumber(summary.newInstallCount || 0), `Senilai ${rupiah(summary.newInstallAmount || 0)}`, 'positive')}
          ${metric('Cabut', displayNumber(summary.removedCount || 0), `Senilai ${rupiah(summary.removedAmount || 0)}`, Number(summary.removedCount || 0) ? 'negative' : '')}
          ${metric('Voucher Terjual', displayNumber(summary.voucherCount || 0), `${displayNumber(summary.voucherBuyerCount || 0)} transaksi`, 'positive')}
          ${metric('Pendapatan', statisticsCompactRupiah(summary.revenueAmount || 0), `${displayNumber(summary.revenueCount || 0)} transaksi`, 'positive')}
        </div>
      </section>

      <section class="section statistics-dashboard">
        <div class="section-head">
          <h2>Statistik 12 Bulan</h2>
          <span>${escapeHtml(`${periodShortLabel(firstMonth)} - ${periodShortLabel(lastMonth)}`)}</span>
        </div>
        <div class="statistics-chart-grid">
          ${statisticsGrowthLineChart(monthlyRows)}
          ${statisticsVoucherBarChart(monthlyRows)}
          ${statisticsRevenueGroupedChart(monthlyRows)}
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Ringkasan 12 Bulan</h2>
          <span>${escapeHtml(`${periodShortLabel(firstMonth)} - ${periodShortLabel(lastMonth)}`)}</span>
        </div>
        ${statisticsAnnualSummaryMarkup(monthlyRows)}
      </section>
    </div>
  `;

  document.getElementById('reportStatisticsPeriod')?.addEventListener('change', (event) => {
    state.reportStatisticsPeriod = event.target.value || todayInput().slice(0, 7);
    state.period = state.reportStatisticsPeriod;
    renderReportsStatistics();
  });
  document.getElementById('reportStatisticsNas')?.addEventListener('change', (event) => {
    state.reportNas = event.target.value || 'all';
    renderReportsStatistics();
  });
}

async function renderReportsMonthlyBilling(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat tagihan bulanan...</div>';
  const collectorReport = state.auth?.role === 'collector';
  const collectorName = state.auth?.name || state.auth?.username || 'Collector';
  const params = queryString({
    period: state.period,
    status: state.reportMonthlyBillingStatus,
    nas: state.reportNas || 'all',
    search: state.search,
    page: state.reportMonthlyBillingPage,
    limit: state.reportMonthlyBillingLimit
  });
  const payload = await api(`/api/reports/monthly-billing?${params}`);
  const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
  const dailyRows = Array.isArray(payload.dailyRows) ? payload.dailyRows : [];
  const nasOptions = Array.isArray(payload.nasOptions) ? payload.nasOptions : [];
  const summary = payload.summary || {};
  const pagination = payload.pagination || { page: 1, totalPages: 1, total: invoices.length, limit: state.reportMonthlyBillingLimit };
  state.reportMonthlyBillingPage = Number(pagination.page || 1);
  state.reportMonthlyBillingLimit = pagerLimitValue(pagination.limit || state.reportMonthlyBillingLimit || 10, 10);

  app.innerHTML = `
    <div class="stack">
      <section class="metrics">
        ${metric('Total Invoice', `${displayNumber(summary.totalCount || 0)} / ${rupiah(summary.totalAmount || 0)}`, periodLabel(state.period))}
        ${metric('Sudah Bayar', `${displayNumber(summary.paidCount || 0)} / ${rupiah(summary.paidAmount || 0)}`, 'Lunas bulan ini', 'positive')}
        ${metric('Belum Bayar', `${displayNumber(summary.unpaidCount || 0)} / ${rupiah(summary.unpaidAmount || 0)}`, 'Pending/unpaid', 'warning-card')}
        ${metric('Overdue', `${displayNumber(summary.overdueCount || 0)} / ${rupiah(summary.overdueAmount || 0)}`, 'Lewat tempo', summary.overdueCount ? 'negative' : '')}
      </section>

      <div class="toolbar">
        <div class="filters">
          ${periodFilterControls('monthlyBillingPeriod', state.period)}
          ${collectorReport ? `<input class="control" value="${escapeHtml(collectorName)}" disabled>` : ''}
          <select class="control" id="monthlyBillingNas">
            ${voucherReportOptionTags(nasOptions, state.reportNas || 'all', 'Semua NAS')}
          </select>
          <select class="control" id="monthlyBillingStatus">
            <option value="all" ${state.reportMonthlyBillingStatus === 'all' ? 'selected' : ''}>Semua status</option>
            <option value="paid" ${state.reportMonthlyBillingStatus === 'paid' ? 'selected' : ''}>Sudah bayar</option>
            <option value="unpaid" ${state.reportMonthlyBillingStatus === 'unpaid' ? 'selected' : ''}>Belum bayar</option>
            <option value="overdue" ${state.reportMonthlyBillingStatus === 'overdue' ? 'selected' : ''}>Overdue</option>
          </select>
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari invoice, pelanggan, NAS" autocomplete="off">
        </div>
      </div>

      <section class="section">
        <div class="section-head">
          <h2>Rekap Harian Tagihan</h2>
          <span>${escapeHtml(periodLabel(state.period))}</span>
        </div>
        ${financeDailyRowsTable(dailyRows, 'Belum ada transaksi pembayaran tagihan bulan ini.')}
      </section>
    </div>
  `;

  document.getElementById('monthlyBillingStatus')?.addEventListener('change', (event) => {
    state.reportMonthlyBillingStatus = event.target.value || 'all';
    state.reportMonthlyBillingPage = 1;
    renderReportsMonthlyBilling();
  });
  document.getElementById('monthlyBillingNas')?.addEventListener('change', (event) => {
    state.reportNas = event.target.value || 'all';
    state.reportMonthlyBillingPage = 1;
    renderReportsMonthlyBilling();
  });
  bindPeriodFilter('monthlyBillingPeriod', (nextPeriod) => {
    state.period = normalizedPeriod(nextPeriod);
    state.reportMonthlyBillingPage = 1;
    renderReportsMonthlyBilling();
  });
  bindSearch((renderOptions = {}) => {
    state.reportMonthlyBillingPage = 1;
    return renderReportsMonthlyBilling(renderOptions);
  });
  app.querySelectorAll('[data-monthly-billing-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.reportMonthlyBillingPage = Math.max(1, Number(button.dataset.monthlyBillingPage || 1));
      renderReportsMonthlyBilling();
    });
  });
  bindPagerLimit('monthly-billing', (limit) => {
    state.reportMonthlyBillingLimit = limit;
  }, (page) => {
    state.reportMonthlyBillingPage = page;
  }, renderReportsMonthlyBilling, 10);
}

function voucherReportOptionTags(options = [], selected = 'all', emptyLabel = 'Semua') {
  const safeSelected = selected || 'all';
  return [
    `<option value="all" ${safeSelected === 'all' ? 'selected' : ''}>${escapeHtml(emptyLabel)}</option>`,
    ...options.map((option) => {
      const value = String(option.value || '').trim();
      const label = String(option.label || value).trim();
      return `<option value="${escapeHtml(value)}" ${String(safeSelected) === value ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
  ].join('');
}

function voucherMethodOptionTags(selected = 'all') {
  const options = [
    ['all', 'Semua metode'],
    ['cash', 'Tunai'],
    ['transfer', 'Transfer + Loket'],
    ['online', 'Online']
  ];
  return options.map(([value, label]) => `<option value="${value}" ${String(selected || 'all') === value ? 'selected' : ''}>${label}</option>`).join('');
}

function voucherReportOrderUsers(order = {}) {
  const users = [];
  const seen = new Set();
  const add = (value = '') => {
    const text = String(value || '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    users.push(text);
  };
  String(order.voucherUsernames || '').split(',').forEach(add);
  (Array.isArray(order.vouchers) ? order.vouchers : []).forEach((voucher) => add(voucher.username || voucher.user || voucher.code));
  add(order.username);
  add(order.voucherUsername);
  add(order.voucherUser);
  add(order.code);
  if (!users.length && String(order.source || '') === 'manual') add(order.reference);
  return users;
}

function voucherReportOrderUsersText(order = {}) {
  const users = voucherReportOrderUsers(order);
  if (!users.length) return '-';
  if (users.length <= 3) return users.join(', ');
  return `${users.slice(0, 3).join(', ')} +${users.length - 3}`;
}

function voucherReportPurchaseAt(order = {}) {
  return order.paidAt || order.paymentAt || order.updatedAt || order.createdAt || '';
}

function voucherReportBuyerText(order = {}) {
  const buyer = String(order.buyerName || '').trim();
  if (buyer && !buyer.includes('@')) return buyer;
  return String(order.whatsapp || '').trim() || '-';
}

function voucherReportFilterMarkup(filterOptions = {}, monthly = false) {
  const scoped = filterOptions.scoped === true;
  return `
    ${monthly ? `<input class="control month-picker-control" id="voucherMonthlyPeriod" type="month" value="${escapeHtml(state.reportVoucherMonthlyPeriod || state.period || todayInput().slice(0, 7))}">` : ''}
    <select class="control" id="voucherReportNas">
      ${voucherReportOptionTags(filterOptions.nas || [], state.reportVoucherNas || 'all', 'Semua NAS')}
    </select>
    ${scoped ? '' : `
      <select class="control" id="voucherReportReseller">
        ${voucherReportOptionTags(filterOptions.resellers || [], state.reportVoucherReseller || 'all', 'Semua reseller')}
      </select>
    `}
    <select class="control" id="voucherReportProfile">
      ${voucherReportOptionTags(filterOptions.profiles || [], state.reportVoucherProfile || 'all', 'Semua paket')}
    </select>
    <select class="control" id="voucherReportMethod">
      ${voucherMethodOptionTags(state.reportVoucherMethod || 'all')}
    </select>
  `;
}

function bindVoucherReportFilters(renderFn, options = {}) {
  const resetDaily = () => {
    if (options.daily) state.reportVoucherDailyPage = 1;
  };
  document.getElementById('voucherMonthlyPeriod')?.addEventListener('change', (event) => {
    state.reportVoucherMonthlyPeriod = event.target.value || todayInput().slice(0, 7);
    state.period = state.reportVoucherMonthlyPeriod;
    renderFn();
  });
  document.getElementById('voucherReportNas')?.addEventListener('change', (event) => {
    state.reportVoucherNas = event.target.value || 'all';
    resetDaily();
    renderFn();
  });
  document.getElementById('voucherReportReseller')?.addEventListener('change', (event) => {
    state.reportVoucherReseller = event.target.value || 'all';
    resetDaily();
    renderFn();
  });
  document.getElementById('voucherReportProfile')?.addEventListener('change', (event) => {
    state.reportVoucherProfile = event.target.value || 'all';
    resetDaily();
    renderFn();
  });
  document.getElementById('voucherReportMethod')?.addEventListener('change', (event) => {
    state.reportVoucherMethod = event.target.value || 'all';
    resetDaily();
    renderFn();
  });
}

function voucherMonthlyRowsTable(rows = []) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Transaksi</th>
            <th>Voucher</th>
            <th class="amount">Tunai</th>
            <th class="amount">Transfer</th>
            <th class="amount">Online</th>
            <th class="amount">Omzet</th>
            <th class="amount">Komisi</th>
            <th class="amount">Net Owner</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((row) => `
            <tr>
              <td><strong>${escapeHtml(dateText(row.date))}</strong></td>
              <td>${displayNumber(row.transactionCount || 0)}</td>
              <td>${displayNumber(row.voucherCount || 0)}</td>
              <td class="amount">${rupiah(row.cashAmount || 0)}</td>
              <td class="amount">${rupiah(row.transferAmount || 0)}</td>
              <td class="amount">${rupiah(row.onlineAmount || 0)}</td>
              <td class="amount positive">${rupiah(row.totalAmount || 0)}</td>
              <td class="amount warning">${rupiah(row.commissionAmount || 0)}</td>
              <td class="amount positive">${rupiah(row.netAmount || 0)}</td>
            </tr>
          `).join('') : '<tr><td colspan="9">Belum ada transaksi voucher bulan ini.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

async function renderReportsVoucherDaily(options = {}) {
  clearRealtimeTimers();
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat voucher harian...</div>';
  const params = queryString({
    date: state.reportVoucherDailyDate || todayInput(),
    search: state.search,
    nas: state.reportVoucherNas || 'all',
    reseller: state.reportVoucherReseller || 'all',
    profile: state.reportVoucherProfile || 'all',
    method: state.reportVoucherMethod || 'all',
    page: state.reportVoucherDailyPage,
    limit: state.reportVoucherDailyLimit
  });
  const payload = await api(`/api/reports/voucher-daily?${params}`);
  voucherDataRevision = String(payload.revision || voucherDataRevision || '');
  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  const summary = payload.summary || {};
  const filterOptions = payload.filterOptions || {};
  const scoped = filterOptions.scoped === true;
  const pagination = payload.pagination || { page: 1, totalPages: 1, total: orders.length, limit: state.reportVoucherDailyLimit };
  state.reportVoucherDailyPage = Number(pagination.page || 1);
  state.reportVoucherDailyLimit = pagerLimitValue(pagination.limit || state.reportVoucherDailyLimit || 10, 10);

  app.innerHTML = `
    <div class="stack">
      <section class="metrics">
        ${metric('Total Voucher', displayNumber(summary.voucherCount || 0), dateText(state.reportVoucherDailyDate))}
        ${metric('Transaksi', displayNumber(summary.totalCount || 0), `Tunai ${displayNumber(summary.cashCount || 0)} · Transfer ${displayNumber(summary.transferCount || 0)} · Online ${displayNumber(summary.onlineCount || 0)}`)}
        ${metric(scoped ? 'Omzet Saya' : 'Omzet', rupiah(summary.totalAmount || 0), 'Tunai / Transfer / Online', 'positive')}
        ${metric(scoped ? 'Komisi Saya' : 'Komisi Reseller', rupiah(summary.commissionAmount || 0), `${displayNumber(filterOptions.commissionPercent || 0)}%`, 'warning-card')}
        ${metric('Net Owner', rupiah(summary.netAmount || 0), 'Omzet - komisi', 'positive')}
      </section>

      <div class="toolbar">
        <div class="filters">
          ${datePickerControl({ id: 'voucherDailyDate', value: state.reportVoucherDailyDate || todayInput(), className: 'control' })}
          ${voucherReportFilterMarkup(filterOptions)}
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari reference, user voucher, paket, NAS, reseller" autocomplete="off">
        </div>
      </div>

      <section class="section">
        <div class="section-head">
          <h2>Voucher Harian</h2>
          <span>${displayNumber(pagination.total || orders.length)} voucher paid</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Waktu Beli</th>
                <th>Voucher/User</th>
                <th>Reference</th>
                <th>Pembeli/WA</th>
                <th>Paket & NAS</th>
                ${scoped ? '' : '<th>Reseller</th>'}
                <th>Metode</th>
                <th>Qty</th>
                <th class="amount">Omzet</th>
                <th class="amount">Komisi</th>
                <th class="amount">Net</th>
              </tr>
            </thead>
            <tbody>
              ${orders.length ? orders.map((order) => {
                const purchaseAt = voucherReportPurchaseAt(order);
                const voucherUsers = voucherReportOrderUsers(order);
                const voucherUsersText = voucherReportOrderUsersText(order);
                const quantity = Number(order.quantity || voucherUsers.length || order.vouchers?.length || 0) || 0;
                const seller = order.resellerName || order.resellerUsername || order.createdByName || order.createdByUsername || order.paidByName || order.sourceLabel || '-';
                return `
                  <tr>
                    <td class="nowrap">
                      <strong>${escapeHtml(dateTimeText(purchaseAt))}</strong>
                      <div class="muted">${escapeHtml(dateText(order.date || purchaseAt))}</div>
                    </td>
                    <td>
                      <strong class="cell-title" title="${escapeHtml(voucherUsers.join(', '))}">${escapeHtml(voucherUsersText)}</strong>
                      <div class="muted">${displayNumber(quantity)} voucher</div>
                    </td>
                    <td>
                      <strong class="cell-title">${escapeHtml(order.reference || '-')}</strong>
                      <div class="muted">${escapeHtml(order.sourceLabel || order.source || '')}</div>
                    </td>
                    <td>
                      <strong>${escapeHtml(voucherReportBuyerText(order))}</strong>
                      <div class="muted">${escapeHtml(order.whatsapp && voucherReportBuyerText(order) !== order.whatsapp ? order.whatsapp : '')}</div>
                    </td>
                    <td>
                      <strong>${escapeHtml(order.packageLabel || order.profileName || '-')}</strong>
                      <div class="muted">${nasActiveBadge(order.nasName || '-')}</div>
                    </td>
                    ${scoped ? '' : `<td>${escapeHtml(seller)}</td>`}
                    <td><span class="badge active">${escapeHtml(order.paymentMethod || 'QRIS')}</span></td>
                    <td>${displayNumber(quantity)}</td>
                    <td class="amount positive">${rupiah(order.amount || 0)}</td>
                    <td class="amount warning">${rupiah(order.commissionAmount || 0)}</td>
                    <td class="amount positive">${rupiah(order.netAmount || 0)}</td>
                  </tr>
                `;
              }).join('') : `<tr><td colspan="${scoped ? 10 : 11}">Belum ada voucher paid pada tanggal ini.</td></tr>`}
            </tbody>
          </table>
        </div>
        ${radiusPaginationControls('voucher-daily', pagination, 'order')}
      </section>
    </div>
  `;

  document.getElementById('voucherDailyDate')?.addEventListener('change', (event) => {
    state.reportVoucherDailyDate = event.target.value || todayInput();
    state.reportVoucherDailyPage = 1;
    renderReportsVoucherDaily();
  });
  bindVoucherReportFilters(renderReportsVoucherDaily, { daily: true });
  bindSearch((renderOptions = {}) => {
    state.reportVoucherDailyPage = 1;
    return renderReportsVoucherDaily(renderOptions);
  });
  app.querySelectorAll('[data-voucher-daily-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.reportVoucherDailyPage = Math.max(1, Number(button.dataset.voucherDailyPage || 1));
      renderReportsVoucherDaily();
    });
  });
  bindPagerLimit('voucher-daily', (limit) => {
    state.reportVoucherDailyLimit = limit;
  }, (page) => {
    state.reportVoucherDailyPage = page;
  }, renderReportsVoucherDaily, 10);
  scheduleVoucherDataRefresh(renderReportsVoucherDaily);
}

async function renderReportsVoucherMonthly(options = {}) {
  clearRealtimeTimers();
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat voucher bulanan...</div>';
  const period = state.reportVoucherMonthlyPeriod || state.period || todayInput().slice(0, 7);
  const payload = await api(`/api/reports/voucher-monthly?${queryString({
    period,
    nas: state.reportVoucherNas || 'all',
    reseller: state.reportVoucherReseller || 'all',
    profile: state.reportVoucherProfile || 'all',
    method: state.reportVoucherMethod || 'all'
  })}`);
  voucherDataRevision = String(payload.revision || voucherDataRevision || '');
  const summary = payload.summary || {};
  const filterOptions = payload.filterOptions || {};
  const scoped = filterOptions.scoped === true;
  const dailyRows = Array.isArray(payload.dailyRows) ? payload.dailyRows : [];
  state.reportVoucherMonthlyPeriod = payload.period || period;
  state.period = state.reportVoucherMonthlyPeriod;

  app.innerHTML = `
    <div class="stack">
      <section class="metrics">
        ${metric('Voucher Paid', displayNumber(summary.voucherCount || 0), `${displayNumber(summary.totalCount || 0)} transaksi`)}
        ${metric(scoped ? 'Omzet Saya' : 'Omzet', rupiah(summary.totalAmount || 0), periodLabel(state.reportVoucherMonthlyPeriod), 'positive')}
        ${metric(scoped ? 'Komisi Saya' : 'Komisi Reseller', rupiah(summary.commissionAmount || 0), `${displayNumber(filterOptions.commissionPercent || 0)}%`, 'warning-card')}
        ${metric('Net Owner', rupiah(summary.netAmount || 0), 'Omzet - komisi', 'positive')}
      </section>

      <div class="toolbar">
        <div class="filters">
          ${voucherReportFilterMarkup(filterOptions, true)}
        </div>
      </div>

      <section class="section">
        <div class="section-head">
          <h2>Voucher Bulanan</h2>
          <span>${escapeHtml(periodLabel(state.reportVoucherMonthlyPeriod))}</span>
        </div>
        ${voucherMonthlyRowsTable(dailyRows)}
      </section>
    </div>
  `;
  bindVoucherReportFilters(renderReportsVoucherMonthly);
  scheduleVoucherDataRefresh(renderReportsVoucherMonthly);
}

function legacySourceDateTimeText(value) {
  const date = legacySourceDate(value);
  if (!date) return '';
  return dateTimeText(date);
}

function reportTransactionDateText(transaction = {}) {
  return legacySourceDateTimeText(transaction.paymentRaw)
    || (transaction.paymentAt ? dateTimeText(transaction.paymentAt) : '')
    || transaction.paymentTime
    || legacySourceDateTimeText(transaction.submittedRaw)
    || (transaction.submittedAt ? dateTimeText(transaction.submittedAt) : '')
    || transaction.submittedTime
    || '-';
}

function reportTransactionMethodClass(method = '') {
  const normalized = String(method || '').toLowerCase();
  if (reportPaymentCategory({ method }) === 'online') return 'active';
  if (normalized.includes('transfer')) return 'active';
  if (normalized.includes('tunai') || normalized.includes('cash')) return 'pending';
  return '';
}

function chunkItems(items = [], size = 4) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function safeReceiptPrintMode(mode = 'a4') {
  return ['a4', 'thermal-58', 'thermal-80'].includes(mode) ? mode : 'a4';
}

function receiptPrintModeLabel(mode = 'a4') {
  if (mode === 'thermal-58') return 'Thermal 58mm';
  if (mode === 'thermal-80') return 'Thermal 80mm';
  return 'A4';
}

function receiptPrintPageSize(mode = 'a4') {
  if (mode === 'thermal-58') return '58mm 118mm';
  if (mode === 'thermal-80') return '80mm 116mm';
  return 'A4 portrait';
}

function receiptPrintModeControl(id = 'receiptPrintMode', selected = state.receiptPrintMode || 'a4') {
  const safeMode = safeReceiptPrintMode(selected);
  return `
    <label class="field inline-field receipt-print-mode">
      <span>Ukuran</span>
      <select id="${escapeHtml(id)}">
        <option value="a4" ${safeMode === 'a4' ? 'selected' : ''}>A4</option>
        <option value="thermal-80" ${safeMode === 'thermal-80' ? 'selected' : ''}>Thermal 80mm</option>
        <option value="thermal-58" ${safeMode === 'thermal-58' ? 'selected' : ''}>Thermal 58mm</option>
      </select>
    </label>
    <span class="muted receipt-print-mode-label" data-receipt-print-mode-label>${escapeHtml(receiptPrintModeLabel(safeMode))}</span>
  `;
}

function setReceiptPrintMode(mode = 'a4') {
  const safeMode = safeReceiptPrintMode(mode);
  state.receiptPrintMode = safeMode;
  document.querySelectorAll('.receipt-printable, .daily-billing-receipt-stack').forEach((element) => {
    element.classList.remove('print-mode-a4', 'print-mode-thermal-58', 'print-mode-thermal-80');
    element.classList.add(`print-mode-${safeMode}`);
  });
  document.querySelectorAll('[data-receipt-print-mode-label]').forEach((element) => {
    element.textContent = receiptPrintModeLabel(safeMode);
  });
  return safeMode;
}

function applyReceiptPrintPageStyle(mode = 'a4') {
  let style = document.getElementById('receiptPrintPageStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'receiptPrintPageStyle';
    document.head.appendChild(style);
  }
  const width = mode === 'thermal-58' ? '58mm' : (mode === 'thermal-80' ? '80mm' : '210mm');
  const minHeight = mode === 'a4' ? '297mm' : 'auto';
  style.textContent = `@media print { @page { size: ${receiptPrintPageSize(mode)}; margin: 0; } html, body { width: ${width} !important; min-height: ${minHeight} !important; } }`;
}

function useSlowPrintCleanup() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent || '');
}

function shouldUseRawBtBridge(mode = 'a4') {
  return isAndroidDevice() && safeReceiptPrintMode(mode) !== 'a4';
}

function base64Utf8(value = '') {
  const bytes = new TextEncoder().encode(String(value || ''));
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function openRawBtTextPrint(text = '') {
  const payload = String(text || '').trimEnd();
  if (!payload.trim()) return false;
  const fallback = encodeURIComponent('https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter');
  const dataUrl = `data:text/plain;charset=utf-8;base64,${base64Utf8(`${payload}\n\n\n`)}`;
  window.location.href = `intent:${dataUrl}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;S.browser_fallback_url=${fallback};end;`;
  return true;
}

function thermalTextWidth(mode = 'thermal-58') {
  return mode === 'thermal-80' ? 42 : 32;
}

function thermalCleanText(value = '') {
  return String(value ?? '-').replace(/\s+/g, ' ').trim() || '-';
}

function thermalSeparator(width = 32, char = '-') {
  return char.repeat(Math.max(8, width));
}

function thermalCenter(value = '', width = 32) {
  const text = thermalCleanText(value);
  if (text.length >= width) return text;
  const left = Math.floor((width - text.length) / 2);
  return `${' '.repeat(left)}${text}`;
}

function thermalWrap(value = '', width = 32) {
  const text = thermalCleanText(value);
  const words = text.split(' ');
  const lines = [];
  let current = '';
  words.forEach((word) => {
    if (!current) {
      current = word;
    } else if ((current.length + 1 + word.length) <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
    while (current.length > width) {
      lines.push(current.slice(0, width));
      current = current.slice(width);
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
}

function thermalKeyValue(label = '', value = '', width = 32) {
  const labelWidth = width >= 40 ? 13 : 10;
  const cleanLabel = thermalCleanText(label).slice(0, labelWidth);
  const valueWidth = Math.max(8, width - labelWidth - 2);
  const valueLines = thermalWrap(value, valueWidth);
  const first = `${cleanLabel.padEnd(labelWidth, ' ')}: ${valueLines.shift() || '-'}`;
  return [first, ...valueLines.map((line) => `${' '.repeat(labelWidth)}  ${line}`)];
}

function thermalEscposQr(data = '', size = 5) {
  const value = String(data || '').replace(/[^\x20-\x7E]/g, '').trim();
  if (!value) return '';
  const qrSize = Math.max(3, Math.min(8, Number(size) || 5));
  const dataLength = value.length + 3;
  const pL = dataLength % 256;
  const pH = Math.floor(dataLength / 256);
  const chr = (...bytes) => String.fromCharCode(...bytes);
  return [
    chr(0x1b, 0x61, 0x01),
    chr(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    chr(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, qrSize),
    chr(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30),
    chr(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30),
    value,
    chr(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30),
    chr(0x1b, 0x61, 0x00)
  ].join('');
}

function clearReceiptPrintPageStyle() {
  document.getElementById('receiptPrintPageStyle')?.remove();
}

async function printReceiptWithMode(printClass, mode = 'a4', rootSelector = '.receipt-printable') {
  const safeMode = setReceiptPrintMode(mode);
  await waitForImages(document.querySelector(rootSelector));
  applyReceiptPrintPageStyle(safeMode);
  document.body.classList.add(printClass, `receipt-print-${safeMode}`);
  let fallbackTimer = null;
  let printMedia = null;
  const cleanupPrintMode = () => {
    document.body.classList.remove(printClass, 'receipt-print-a4', 'receipt-print-thermal-58', 'receipt-print-thermal-80');
    clearReceiptPrintPageStyle();
    window.removeEventListener('afterprint', cleanupPrintMode);
    if (printMedia?.removeEventListener) printMedia.removeEventListener('change', handlePrintMediaChange);
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
  };
  const handlePrintMediaChange = (event) => {
    if (!event.matches) cleanupPrintMode();
  };
  const slowCleanup = useSlowPrintCleanup();
  if (!slowCleanup) window.addEventListener('afterprint', cleanupPrintMode, { once: true });
  if (!slowCleanup && window.matchMedia) {
    printMedia = window.matchMedia('print');
    printMedia.addEventListener?.('change', handlePrintMediaChange);
  }
  fallbackTimer = window.setTimeout(cleanupPrintMode, 120000);
  window.print();
}

function billingReceiptPpnText(source = {}) {
  if (source.ppnText && source.ppnText !== '-') return source.ppnText;
  const amount = Math.max(0, Number(source.ppnAmount || source.vatAmount || source.taxAmount || 0));
  const rate = Math.max(0, Number(source.ppnRate || source.vatRate || source.taxRate || 0));
  if (amount <= 0) return '-';
  return rate > 0 ? `${rate}% / ${rupiah(amount)}` : rupiah(amount);
}

function billingReceiptDiscountText(source = {}) {
  if (source.discountText && source.discountText !== '-') return source.discountText;
  const amount = Math.max(0, Number(source.discountAmount || source.discountValue || 0));
  return amount > 0 ? rupiah(amount) : '-';
}

function billingReceiptAddonsText(source = {}) {
  const summary = memberAddonsDisplay(source.addOns || source.addons || source.memberAddons || []);
  if (summary !== '-') return summary;
  const amount = Math.max(0, Number(source.addOnsTotal || source.addOnSubtotal || source.addOnMonthlyTotal || 0));
  if (amount > 0) return rupiah(amount);
  if (source.addOnsText && source.addOnsText !== '-') return String(source.addOnsText).split('\n')[0] || '-';
  return '-';
}

function dailyReceiptTransaction(item = {}, report = {}) {
  const rawPlan = item.packageName || item.profileName || item.profile || item.item || '';
  const planText = String(rawPlan || '').trim().replace(/^internet\s*:\s*/i, '');
  const planAfterPipe = planText.includes('|') ? planText.slice(planText.indexOf('|') + 1).trim() : planText;
  const planAfterPrefix = planAfterPipe.includes(' - ')
    ? planAfterPipe.slice(planAfterPipe.lastIndexOf(' - ') + 3).trim()
    : planAfterPipe;
  const receiptAmount = Number(item.receiptAmount || 0) > 0
    ? Number(item.receiptAmount || 0)
    : Number(item.amount || item.income || 0);
  return {
    ...item,
    admin: dailyAdminLabel(item, report),
    planName: planAfterPrefix || 'Paket tidak tersedia',
    amountText: item.receiptAmountText || rupiah(receiptAmount),
    receiptAmount,
    ppnText: billingReceiptPpnText(item),
    discountText: billingReceiptDiscountText(item),
    addOnsText: billingReceiptAddonsText(item),
    receiptTitle: 'KUITANSI PEMBAYARAN',
    receiptLabel: `Payment Invoice #${billingInvoiceNo(item) || item.invoiceNo || item.externalId || '-'}`
  };
}

function dailyBillingReceiptBody(transaction = {}) {
  const branding = currentBranding();
  const signer = transaction.admin || state.auth?.name || state.auth?.username || 'Admin';
  const invoiceNo = transaction.invoiceNo || transaction.externalId || transaction.id || '-';
  const customerName = transaction.customerName || transaction.description || transaction.info || '-';
  const itemName = transaction.planName || transaction.packageName || transaction.profileName || transaction.profile || transaction.item || 'Tagihan internet';
  const periodSource = transaction.coverageText
    || transaction.coveredPeriodText
    || transaction.period
    || String(transaction.dueDate || transaction.paymentAt || transaction.paymentRaw || '').slice(0, 7)
    || state.period
    || '-';
  const periodText = readablePeriodText(periodSource);
  return `
    <div class="receipt-preview daily-billing-receipt">
      <div class="daily-receipt-top">
        <div class="daily-receipt-brand">
          <img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.businessName)}">
          <div>
            <strong>${escapeHtml(branding.businessName)}</strong>
            <span>${escapeHtml(brandingPrintLabel('', branding))}</span>
          </div>
        </div>
        <div class="daily-receipt-number">
          <strong>Payment Invoice #${escapeHtml(invoiceNo)}</strong>
        </div>
      </div>
      <div class="daily-receipt-main">
        <div class="daily-receipt-lines">
          <div><span>Nama Pelanggan</span><strong>${escapeHtml(customerName)}</strong></div>
          <div><span>Paket</span><strong>${escapeHtml(itemName)}</strong></div>
          <div><span>Periode</span><strong>${escapeHtml(periodText)}</strong></div>
          <div class="receipt-a4-only"><span>Add Ons</span><strong>${escapeHtml(transaction.addOnsText || '-')}</strong></div>
          <div class="receipt-a4-only"><span>PPN</span><strong>${escapeHtml(transaction.ppnText || '-')}</strong></div>
          <div class="receipt-a4-only"><span>Diskon</span><strong>${escapeHtml(transaction.discountText || '-')}</strong></div>
          <div class="receipt-thermal-only"><span>Add Ons</span><strong>${escapeHtml(transaction.addOnsText || '-')}</strong></div>
          <div class="receipt-thermal-only"><span>PPN</span><strong>${escapeHtml(transaction.ppnText || '-')}</strong></div>
          <div class="receipt-thermal-only"><span>Diskon</span><strong>${escapeHtml(transaction.discountText || '-')}</strong></div>
          <div><span>Metode</span><strong>${escapeHtml(transaction.method || '-')}</strong></div>
          <div><span>Tanggal bayar</span><strong>${escapeHtml(reportTransactionDateText(transaction))}</strong></div>
        </div>
        <div class="daily-receipt-side">
          <div class="daily-receipt-amount">
            <span>Total dibayar</span>
            <strong>${escapeHtml(transaction.amountText || rupiah(transaction.amount || 0))}</strong>
          </div>
          <div class="daily-receipt-signature">
            <small>Petugas</small>
            <strong>${escapeHtml(signer)}</strong>
          </div>
        </div>
      </div>
      <div class="daily-receipt-footer">
        <span>Terima kasih atas pembayaran Anda.</span>
      </div>
    </div>
  `;
}

function dailyBillingReceiptRawBtText(transaction = {}, mode = 'thermal-58') {
  const branding = currentBranding();
  const width = thermalTextWidth(mode);
  const signer = transaction.admin || state.auth?.name || state.auth?.username || 'Admin';
  const invoiceNo = transaction.invoiceNo || transaction.externalId || transaction.id || '-';
  const customerName = transaction.customerName || transaction.description || transaction.info || '-';
  const itemName = transaction.planName || transaction.packageName || transaction.profileName || transaction.profile || transaction.item || 'Tagihan internet';
  const periodSource = transaction.coverageText
    || transaction.coveredPeriodText
    || transaction.period
    || String(transaction.dueDate || transaction.paymentAt || transaction.paymentRaw || '').slice(0, 7)
    || state.period
    || '-';
  const lines = [
    thermalCenter(branding.businessName || DEFAULT_BUSINESS_NAME, width),
    thermalCenter('BUKTI PEMBAYARAN', width),
    thermalCenter(`Payment Invoice #${invoiceNo}`, width),
    thermalSeparator(width),
    ...thermalKeyValue('Nama', customerName, width),
    ...thermalKeyValue('Paket', itemName, width),
    ...thermalKeyValue('Periode', readablePeriodText(periodSource), width),
    ...thermalKeyValue('Add Ons', transaction.addOnsText || '-', width),
    ...thermalKeyValue('PPN', transaction.ppnText || '-', width),
    ...thermalKeyValue('Diskon', transaction.discountText || '-', width),
    ...thermalKeyValue('Metode', transaction.method || '-', width),
    ...thermalKeyValue('Tanggal', reportTransactionDateText(transaction), width),
    thermalSeparator(width),
    thermalCenter('Total dibayar', width),
    thermalCenter(transaction.amountText || rupiah(transaction.amount || 0), width),
    thermalSeparator(width),
    thermalCenter('Petugas', width),
    thermalCenter(signer, width),
    '',
    thermalCenter('Terima kasih', width)
  ];
  return lines.join('\n');
}

function dailyBillingReceiptsRawBtText(transactions = [], mode = 'thermal-58') {
  return transactions
    .map((transaction) => dailyBillingReceiptRawBtText(transaction, mode))
    .join('\n\n\n');
}

function updateThermalPrintButtonLabel(button, mode = 'a4') {
  if (!button) return;
  button.textContent = shouldUseRawBtBridge(mode) ? 'Print RawBT' : 'Print Browser';
}

function openDailyBillingReceiptsModal(transactions = [], report = {}) {
  const receiptRows = transactions.map((item) => dailyReceiptTransaction(item, report));
  const printMode = safeReceiptPrintMode(state.receiptPrintMode || 'a4');
  const receiptPagesMarkup = (mode = 'a4') => {
    const receiptsPerPage = mode === 'a4' ? 3 : 1;
    return chunkItems(receiptRows, receiptsPerPage).map((group) => `
      <div class="daily-billing-receipt-page">
        ${group.map(dailyBillingReceiptBody).join('')}
      </div>
    `).join('');
  };
  openModal('Print Kuitansi Tagihan', `
    <div class="daily-billing-receipt-preview">
      <div class="daily-billing-receipt-preview-head">
        <strong>${displayNumber(receiptRows.length)} kuitansi dipilih</strong>
        <label class="field inline-field hotspot-voucher-print-mode daily-billing-receipt-print-mode">
          <span>Ukuran</span>
          <select id="dailyBillingReceiptPrintMode">
            <option value="a4" ${printMode === 'a4' ? 'selected' : ''}>A4</option>
            <option value="thermal-80" ${printMode === 'thermal-80' ? 'selected' : ''}>Thermal 80mm</option>
            <option value="thermal-58" ${printMode === 'thermal-58' ? 'selected' : ''}>Thermal 58mm</option>
          </select>
        </label>
        <span class="muted" id="dailyBillingReceiptPrintModeLabel" data-receipt-print-mode-label>${escapeHtml(receiptPrintModeLabel(printMode))}</span>
        <div class="row-actions hotspot-voucher-print-actions daily-billing-receipt-print-actions">
          <button class="ghost-button compact" data-close-modal type="button">Tutup</button>
          <button class="button compact" id="printDailyBillingReceipts" type="button">Print Browser</button>
        </div>
      </div>
      <div class="stack compact-stack daily-billing-receipt-stack print-mode-${printMode}">
        ${receiptPagesMarkup(printMode)}
      </div>
    </div>
  `, async () => {});
  const modeInput = document.getElementById('dailyBillingReceiptPrintMode');
  const printButton = document.getElementById('printDailyBillingReceipts');
  modeInput?.addEventListener('change', () => {
    const nextMode = setReceiptPrintMode(modeInput.value);
    const stack = document.querySelector('.daily-billing-receipt-stack');
    if (stack) {
      stack.className = `stack compact-stack daily-billing-receipt-stack print-mode-${nextMode}`;
      stack.innerHTML = receiptPagesMarkup(nextMode);
    }
    updateThermalPrintButtonLabel(printButton, nextMode);
  });
  setReceiptPrintMode(modeInput?.value || printMode);
  updateThermalPrintButtonLabel(printButton, modeInput?.value || printMode);
  printButton?.addEventListener('click', () => {
    const mode = modeInput?.value || printMode;
    if (shouldUseRawBtBridge(mode) && openRawBtTextPrint(dailyBillingReceiptsRawBtText(receiptRows, mode))) return;
    printReceiptWithMode('printing-daily-billing-receipts', mode, '.daily-billing-receipt-stack');
  });
}

function openReportTransactionDetail(transaction = {}) {
  const reference = transaction.invoiceNo || transaction.id || transaction.externalId || '-';
  const customer = transaction.customerName || transaction.description || '-';
  const account = transaction.username || '-';
  const item = transaction.item || transaction.packageName || '-';
  const source = transaction.sourceLabel || transaction.type || '-';
  const nas = transaction.nasName || transaction.siteName || '-';
  const amount = transaction.amountText || rupiah(transaction.amount || 0);
  const description = String(transaction.description || '').trim() || '-';
  const notes = String(transaction.notes || '').trim();
  const normalizedDetailText = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const noteMatches = [description, reference, customer, account, item]
    .map(normalizedDetailText)
    .filter(Boolean);
  const showNotes = notes
    && notes !== '-'
    && !noteMatches.includes(normalizedDetailText(notes));
  const detailField = (label, value, className = '') => `
    <div class="field ${className}">
      <span>${escapeHtml(label)}</span>
      <div class="readonly-value">${escapeHtml(value || '-')}</div>
    </div>
  `;
  openModal('Detail Mutasi', `
    <div class="report-transaction-detail">
      <div class="form-grid report-transaction-detail-grid">
        ${detailField('Reference', reference)}
        ${detailField('Waktu', reportTransactionDateText(transaction))}
        ${detailField('Sumber', source)}
        ${detailField('Metode', transaction.method || '-')}
        ${detailField(transaction.source === 'voucher' ? 'Nama Pembeli' : 'Nama Pelanggan', customer)}
        ${detailField(transaction.source === 'voucher' ? 'Kode Voucher' : 'Username', account)}
        ${detailField('Paket / Item', item)}
        ${detailField('NAS', nas)}
        ${detailField('Petugas', transaction.admin || '-')}
        ${detailField('Total', amount, 'report-transaction-detail-total')}
        ${detailField('Rincian Transaksi', description, 'report-transaction-detail-wide')}
        ${showNotes ? detailField('Catatan', notes, 'report-transaction-detail-wide') : ''}
      </div>
      <div class="modal-actions">
        <button class="button" type="button" data-close-modal>Tutup</button>
      </div>
    </div>
  `, async () => {});
}

async function renderReportsTransactions(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat mutasi bulanan...</div>';
  const period = state.reportTransactionsPeriod || state.period || todayInput().slice(0, 7);
  const params = {
    period,
    method: state.reportTransactionsMethod || 'all',
    nas: state.reportNas || 'all',
    search: state.search,
    page: state.reportTransactionsPage,
    limit: state.reportTransactionsLimit,
    refresh: options.refresh ? 1 : ''
  };
  const payload = await api(`/api/reports/monthly-transactions?${queryString(params)}`);
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  const nasOptions = Array.isArray(payload.nasOptions) ? payload.nasOptions : [];
  const summary = payload.summary || {};
  const pagination = payload.pagination || { page: 1, limit: state.reportTransactionsLimit, total: transactions.length, totalPages: 1 };
  state.reportTransactionsPeriod = payload.period || period;
  state.period = state.reportTransactionsPeriod;
  state.reportTransactionsPage = Number(pagination.page || 1);
  state.reportTransactionsLimit = pagerLimitValue(pagination.limit || state.reportTransactionsLimit || 10, 10);

  if (options.refresh) {
    setToast(payload.ok ? 'Mutasi diperbarui' : (payload.error || 'Mutasi belum bisa dibaca'));
  }

  app.innerHTML = `
    <div class="stack">
      ${payload.ok ? '' : `
        <section class="notice error">
          <strong>Mutasi belum bisa dibaca</strong>
          <span>${escapeHtml(payload.error || 'Endpoint mutasi belum mengembalikan data.')}</span>
        </section>
      `}

      <section class="metrics">
        ${metric('Total Mutasi', rupiah(summary.totalAmount || 0), periodLabel(state.reportTransactionsPeriod), 'positive')}
        ${metric('Tagihan', `${displayNumber(summary.billingCount || 0)} / ${rupiah(summary.billingAmount || 0)}`, 'Invoice bulanan')}
        ${metric('Voucher', `${displayNumber(summary.voucherCount || 0)} / ${rupiah(summary.voucherAmount || 0)}`, 'Voucher paid')}
        ${metric('Pemasukan External', `${displayNumber(summary.externalIncomeCount || 0)} / ${rupiah(summary.externalIncomeAmount || 0)}`, 'Pemasukan manual')}
        ${metric('Tunai', `${displayNumber(summary.cashCount || 0)} / ${rupiah(summary.cashAmount || 0)}`, 'Pembayaran langsung')}
        ${metric('Transfer + Loket', `${displayNumber(summary.transferCount || 0)} / ${rupiah(summary.transferAmount || 0)}`, 'Transfer bank manual dan Loket')}
        ${metric('Online', `${displayNumber(summary.onlineCount || 0)} / ${rupiah(summary.onlineAmount || 0)}`, 'QRIS, VA, e-wallet, dan gerai')}
      </section>

      <div class="toolbar">
        <div class="filters">
          <input class="control month-picker-control" id="reportTransactionsPeriod" type="month" value="${escapeHtml(state.reportTransactionsPeriod)}">
          <select class="control" id="reportTransactionsNas" aria-label="Filter NAS mutasi bulanan">
            ${voucherReportOptionTags(nasOptions, state.reportNas || 'all', 'Semua NAS')}
          </select>
          <select class="control" id="reportTransactionsMethod">
            <option value="all" ${state.reportTransactionsMethod === 'all' ? 'selected' : ''}>Semua metode</option>
            <option value="cash" ${state.reportTransactionsMethod === 'cash' ? 'selected' : ''}>Tunai</option>
            <option value="transfer" ${state.reportTransactionsMethod === 'transfer' ? 'selected' : ''}>Transfer + Loket</option>
            <option value="online" ${state.reportTransactionsMethod === 'online' ? 'selected' : ''}>Online</option>
          </select>
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari invoice, sumber, deskripsi, metode" autocomplete="off">
        </div>
        <div class="row-actions">
          <button class="button compact" id="refreshReportTransactions" type="button">Refresh</button>
        </div>
      </div>

      <section class="section">
        <div class="section-head">
          <h2>Mutasi Bulanan</h2>
          <span>${displayNumber(pagination.total || transactions.length)} data</span>
        </div>
        <div class="table-wrap report-transactions-table-wrap">
          <table class="xendit-table report-transactions-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Waktu</th>
                <th>Sumber</th>
                <th>Item</th>
                <th>Description</th>
                <th>Method</th>
                <th>Admin</th>
                <th class="amount">Price</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.length ? transactions.map((transaction, index) => `
                <tr>
                  <td class="report-transaction-reference">
                    <strong class="cell-title">${escapeHtml(transaction.invoiceNo || transaction.id || transaction.externalId || '-')}</strong>
                    <span class="cell-subline" title="${escapeHtml(reportTransactionReferenceDetail(transaction))}">${escapeHtml(reportTransactionReferenceDetail(transaction))}</span>
                    ${transaction.externalId && transaction.externalId !== transaction.invoiceNo ? `<span class="cell-subline muted">${escapeHtml(transaction.externalId)}</span>` : ''}
                  </td>
                  <td class="nowrap report-transaction-time">${escapeHtml(reportTransactionDateText(transaction))}</td>
                  <td><span class="badge ${transaction.source === 'voucher' ? 'pending' : transaction.paymentCategory === 'online' ? 'active' : ''}">${escapeHtml(transaction.sourceLabel || transaction.type || '-')}</span></td>
                  <td class="report-transaction-item" title="${escapeHtml(transaction.item || '-')}">${escapeHtml(transaction.item || '-')}</td>
                  <td class="report-transaction-description" title="${escapeHtml(transaction.description || '-')}">${escapeHtml(transaction.description || '-')}</td>
                  <td class="report-transaction-method">
                    <span class="badge ${reportTransactionMethodClass(transaction.method)}">${escapeHtml(transaction.method || '-')}</span>
                    ${String(transaction.method || '').trim().toLowerCase() === 'tunai - loket'
                      ? `<div class="muted report-transaction-confirmed" title="Dikonfirmasi oleh: ${escapeHtml(transaction.admin || '-')}">Dikonfirmasi: ${escapeHtml(transaction.admin || '-')}</div>`
                      : ''}
                  </td>
                  <td class="report-transaction-admin" title="${escapeHtml(transaction.admin || '-')}">${escapeHtml(transaction.admin || '-')}</td>
                  <td class="amount positive">${transaction.amountText ? escapeHtml(transaction.amountText) : rupiah(transaction.amount || 0)}</td>
                  <td><button class="ghost-button compact" type="button" data-report-transaction-detail="${index}">Detail</button></td>
                </tr>
              `).join('') : '<tr><td colspan="9">Belum ada mutasi pada filter ini.</td></tr>'}
            </tbody>
          </table>
        </div>
        ${reportTransactionsPaginationControls(pagination)}
      </section>
    </div>
  `;

  const refreshFilters = () => {
    state.reportTransactionsPage = 1;
    renderReportsTransactions();
  };
  document.getElementById('reportTransactionsPeriod')?.addEventListener('change', (event) => {
    state.reportTransactionsPeriod = event.target.value || todayInput().slice(0, 7);
    state.period = state.reportTransactionsPeriod;
    refreshFilters();
  });
  document.getElementById('reportTransactionsMethod')?.addEventListener('change', (event) => {
    state.reportTransactionsMethod = event.target.value || 'all';
    refreshFilters();
  });
  document.getElementById('reportTransactionsNas')?.addEventListener('change', (event) => {
    state.reportNas = event.target.value || 'all';
    refreshFilters();
  });
  document.getElementById('refreshReportTransactions')?.addEventListener('click', () => renderReportsTransactions({ refresh: true }));
  app.querySelectorAll('[data-report-transaction-detail]').forEach((button) => {
    button.addEventListener('click', () => {
      const transaction = transactions[Number(button.dataset.reportTransactionDetail || -1)];
      if (transaction) openReportTransactionDetail(transaction);
    });
  });
  bindSearch((renderOptions = {}) => {
    state.reportTransactionsPage = 1;
    return renderReportsTransactions(renderOptions);
  });
  app.querySelectorAll('[data-report-transaction-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.reportTransactionsPage = Math.max(1, Number(button.dataset.reportTransactionPage || 1));
      renderReportsTransactions();
    });
  });
  bindPagerLimit('report-transaction', (limit) => {
    state.reportTransactionsLimit = limit;
  }, (page) => {
    state.reportTransactionsPage = page;
  }, renderReportsTransactions, 10);
}

function financeRecapRows(rows = [], tone = 'positive') {
  return rows.length ? rows.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.category || '-')}</strong></td>
      <td>${displayNumber(row.count || 0)} transaksi</td>
      <td class="amount ${tone}">${rupiah(row.amount || 0)}</td>
    </tr>
  `).join('') : '<tr><td colspan="3">Belum ada data.</td></tr>';
}

async function renderReportsFinanceRecap(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat rekapitulasi...</div>';
  const payload = await api(`/api/reports/finance-recap?${queryString({ period: state.period })}`);
  const summary = payload.summary || {};
  const incomeGroups = Array.isArray(payload.incomeGroups) ? payload.incomeGroups : [];
  const expenseGroups = Array.isArray(payload.expenseGroups) ? payload.expenseGroups : [];
  const profit = Number(summary.profit || 0);

  app.innerHTML = `
    <div class="stack">
      <div class="toolbar">
        <div class="filters">
          ${periodFilterControls('financeRecapPeriod', state.period)}
        </div>
      </div>

      <section class="metrics">
        ${metric('Total Pemasukan', rupiah(summary.incomeTotal || 0), `${displayNumber(summary.incomeCount || 0)} transaksi`, 'positive')}
        ${metric('Tunai', rupiah(summary.cashAmount || 0), `${displayNumber(summary.cashCount || 0)} transaksi`)}
        ${metric('Transfer + Loket', rupiah(summary.transferAmount || 0), `${displayNumber(summary.transferCount || 0)} transaksi`)}
        ${metric('Online', rupiah(summary.onlineAmount || 0), `${displayNumber(summary.onlineCount || 0)} transaksi`, 'positive')}
        ${metric('Total Pengeluaran', rupiah(summary.expenseTotal || 0), `${displayNumber(summary.expenseCount || 0)} transaksi`, 'negative')}
        ${metric('Selisih', rupiah(profit), periodLabel(state.period), profit >= 0 ? 'positive' : 'negative')}
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Rekapitulasi Pemasukan/Pengeluaran</h2>
          <span>${escapeHtml(periodLabel(state.period))}</span>
        </div>
        <div class="split-grid">
          <div class="finance-recap-table-host">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pemasukan</th>
                    <th>Transaksi</th>
                    <th class="amount">Nominal</th>
                  </tr>
                </thead>
                <tbody>${financeRecapRows(incomeGroups, 'positive')}</tbody>
              </table>
            </div>
          </div>
          <div class="finance-recap-table-host">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pengeluaran</th>
                    <th>Transaksi</th>
                    <th class="amount">Nominal</th>
                  </tr>
                </thead>
                <tbody>${financeRecapRows(expenseGroups, 'negative')}</tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  bindPeriodFilter('financeRecapPeriod', (nextPeriod) => {
    state.period = normalizedPeriod(nextPeriod);
    renderReportsFinanceRecap();
  });
}

function xenditTypeLabel(value) {
  const labels = {
    PAYMENT: 'Payment',
    DISBURSEMENT: 'Disbursement',
    REFUND: 'Refund'
  };
  return labels[value] || value || '-';
}

function xenditMethodLabel(value) {
  const labels = {
    VIRTUAL_ACCOUNT: 'Virtual Account',
    QR_CODE: 'QR Code',
    EWALLET: 'E-Wallet',
    RETAIL_OUTLET: 'Retail Outlet',
    BANK: 'Bank'
  };
  return labels[value] || value || '-';
}

const XENDIT_TABS = [
  { value: 'transactions', label: 'Transaction' },
  { value: 'balance', label: 'Balance History' },
  { value: 'pending', label: 'Pending' },
  { value: 'fees', label: 'Fees Report' }
];

function xenditTabs(active = 'transactions', tabs = XENDIT_TABS) {
  return `
    <div class="tab-switcher" role="tablist" aria-label="Payment Gateway">
      ${(tabs || XENDIT_TABS).map((tab) => `
        <button class="tab-button ${active === tab.value ? 'is-active' : ''}" type="button" data-xendit-tab="${escapeHtml(tab.value)}" role="tab" aria-selected="${active === tab.value ? 'true' : 'false'}">${escapeHtml(tab.label)}</button>
      `).join('')}
    </div>
  `;
}

function xenditStatusBadge(status = '') {
  const text = String(status || '').toLowerCase();
  if (/success|settled|paid|live/.test(text)) return 'active';
  if (/pending|registered|process/.test(text)) return 'pending';
  if (/fail|cancel|expired|refund/.test(text)) return 'inactive';
  return '';
}

function resetXenditCursor() {
  state.xenditPage = 1;
  state.xenditNextId = '';
  state.xenditCursorStack = [''];
}

function resetXenditPages() {
  resetXenditCursor();
  state.xenditBalancePage = 1;
  state.xenditPendingPage = 1;
  state.xenditReportPage = 1;
}

function xenditTransactionPager(cursor = {}) {
  const page = Number(state.xenditPage || 1);
  const hasNext = Boolean(cursor.nextPage && cursor.nextId);
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-xendit-prev ${page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
      <span class="pager-info">Halaman ${displayNumber(page)}</span>
      <button class="ghost-button compact" type="button" data-xendit-next ${hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function xenditLocalPager(kind, total = 0, limit = 15, page = 1) {
  const selectedLimit = pagerLimitValue(limit, 25);
  const effectiveLimit = effectivePagerLimit(selectedLimit, total, 25);
  const totalPages = Math.max(1, Math.ceil(Number(total || 0) / effectiveLimit));
  const limitControl = pagerLimitControl(`xendit-${kind}`, selectedLimit, 25);
  if (total <= effectiveLimit) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${displayNumber(total)} data` : 'Belum ada data'}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-xendit-${kind}-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
      <span class="pager-info">Halaman ${displayNumber(page)} dari ${displayNumber(totalPages)}</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-xendit-${kind}-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Berikutnya</button>
    </div>
  `;
}

function xenditAccountSub(account = {}) {
  const bank = Array.isArray(account.banks) && account.banks.length
    ? account.banks.map((item) => [item.bank, item.accountName, item.accountNumberMasked].filter(Boolean).join(' ')).join(', ')
    : 'Bank belum terbaca';
  return [account.status, account.type, bank].filter(Boolean).join(' - ') || 'Account Xendit';
}

function xenditAmountClass(transaction = {}) {
  if (transaction.moneyOut) return 'negative';
  if (transaction.moneyIn) return 'positive';
  return '';
}

function xenditAmountText(value, fallback = '') {
  const number = Number(value || 0);
  if (number) return rupiah(number);
  return fallback || rupiah(0);
}

function xenditDateText(value, fallback = '') {
  return value ? dateTimeText(value) : (fallback || '-');
}

function xenditPaginate(rows = [], page = 1, limit = 15) {
  const total = rows.length;
  const effectiveLimit = effectivePagerLimit(limit, total, 25);
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));
  const safePage = Math.max(1, Math.min(totalPages, Number(page || 1)));
  const offset = (safePage - 1) * effectiveLimit;
  return {
    page: safePage,
    total,
    totalPages,
    limit,
    rows: rows.slice(offset, offset + effectiveLimit)
  };
}

function renderXenditTabs() {
  const active = state.xenditTab || 'transactions';
  return `
    <div class="tab-switcher" role="tablist" aria-label="Xendit">
      ${XENDIT_TABS.map((tab) => `
        <button class="tab-button ${active === tab.value ? 'is-active' : ''}" type="button" data-xendit-tab="${escapeHtml(tab.value)}" role="tab" aria-selected="${active === tab.value ? 'true' : 'false'}">${escapeHtml(tab.label)}</button>
      `).join('')}
    </div>
  `;
}

function renderXenditAccountPanel(account = {}, balance = {}, fetchedAt = '') {
  const banks = Array.isArray(account.banks) ? account.banks : [];
  const bankText = banks.length
    ? banks.map((item) => [item.bank, item.accountName, item.accountNumberMasked].filter(Boolean).join(' ')).join(' | ')
    : 'Rekening withdraw belum terbaca';
  return `
    <section class="panel xendit-account-panel">
      <div>
        <div class="label">Xendit Account</div>
        <strong>${escapeHtml(account.status || '-')} ${account.type ? `- ${escapeHtml(account.type)}` : ''}</strong>
        <div class="muted">${escapeHtml(bankText)}</div>
      </div>
      <div class="xendit-balance">
        <span>Balance</span>
        <strong>${escapeHtml(balance.text || rupiah(balance.amount || 0))}</strong>
        <small>Update ${escapeHtml(fetchedAt ? dateTimeText(fetchedAt) : '-')}</small>
      </div>
    </section>
  `;
}

function renderXenditTransactions(transactions = [], cursor = {}) {
  return `
    <section class="section">
      <div class="section-head">
        <h2>Transaction</h2>
        <span>${displayNumber(transactions.length)} data halaman ini</span>
      </div>
      <div class="table-wrap">
        <table class="xendit-table">
          <thead>
            <tr>
              <th>Settlement</th>
              <th>Type</th>
              <th>Payment Method</th>
              <th>Channel</th>
              <th class="amount">Amount</th>
              <th>Reference</th>
              <th>Date Created GMT+8</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.length ? transactions.map((transaction) => `
              <tr>
                <td>
                  <span class="badge ${xenditStatusBadge(transaction.settlement || transaction.status)}">${escapeHtml(transaction.settlement || transaction.status || '-')}</span>
                  <div class="muted">${escapeHtml(transaction.status || '-')}</div>
                </td>
                <td>${escapeHtml(xenditTypeLabel(transaction.type))}</td>
                <td>${escapeHtml(xenditMethodLabel(transaction.paymentMethod))}</td>
                <td>${escapeHtml(transaction.channel || '-')}</td>
                <td class="amount ${xenditAmountClass(transaction)}">${transaction.moneyOut ? '-' : ''}${rupiah(transaction.amount)}</td>
                <td>
                  <strong class="cell-title">${escapeHtml(transaction.reference || '-')}</strong>
                  <div class="muted">${escapeHtml(transaction.description || transaction.customerName || '-')}</div>
                </td>
                <td class="nowrap">${escapeHtml(xenditDateText(transaction.date, transaction.dateRaw))}</td>
              </tr>
            `).join('') : '<tr><td colspan="7">Belum ada transaction Xendit pada filter ini.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${xenditTransactionPager(cursor)}
    </section>
  `;
}

function renderXenditBalanceHistory(rows = []) {
  const limit = state.xenditBalanceLimit || 25;
  const pagination = xenditPaginate(rows, state.xenditBalancePage, limit);
  state.xenditBalancePage = pagination.page;
  return `
    <section class="section">
      <div class="section-head">
        <h2>Balance History</h2>
        <span>${displayNumber(rows.length)} data</span>
      </div>
      <div class="table-wrap">
        <table class="xendit-table">
          <thead>
            <tr>
              <th>Date Created GMT+8</th>
              <th>Transaction Type</th>
              <th>Channel</th>
              <th>Reference</th>
              <th class="amount">Amount</th>
              <th class="amount">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${pagination.rows.length ? pagination.rows.map((row) => `
              <tr>
                <td class="nowrap">${escapeHtml(xenditDateText(row.date, row.dateRaw))}</td>
                <td>${escapeHtml(row.type || '-')}</td>
                <td>${escapeHtml(row.channel || '-')}</td>
                <td>
                  <strong class="cell-title">${escapeHtml(row.reference || '-')}</strong>
                  <div class="muted">${escapeHtml(row.description || '-')}</div>
                </td>
                <td class="amount ${Number(row.amount || 0) < 0 ? 'negative' : 'positive'}">${xenditAmountText(row.amount, row.amountText)}</td>
                <td class="amount">${xenditAmountText(row.balance, row.balanceText)}</td>
              </tr>
            `).join('') : '<tr><td colspan="6">Balance history belum tersedia pada filter ini.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${xenditLocalPager('balance', rows.length, limit, pagination.page)}
    </section>
  `;
}

function renderXenditPending(rows = [], summary = {}) {
  const limit = state.xenditPendingLimit || 25;
  const pagination = xenditPaginate(rows, state.xenditPendingPage, limit);
  state.xenditPendingPage = pagination.page;
  return `
    <section class="metrics xendit-summary">
      ${metric('Incoming Pending', rupiah(summary.incomingAmount || 0), `${displayNumber(summary.pendingCount || rows.length)} data`, 'positive')}
      ${metric('Outgoing Pending', rupiah(summary.outgoingAmount || 0), 'Fee/outgoing pending', summary.outgoingAmount ? 'negative' : '')}
      ${metric('Net Amount', rupiah(summary.netAmount || 0), 'Total net pending')}
      ${metric('Fee', rupiah(summary.feeAmount || 0), 'Total fee pending')}
    </section>
    <section class="section">
      <div class="section-head">
        <h2>Pending</h2>
        <span>${displayNumber(rows.length)} data</span>
      </div>
      <div class="table-wrap">
        <table class="xendit-table">
          <thead>
            <tr>
              <th>Date Created GMT+8</th>
              <th>Settlement Time GMT+8</th>
              <th>Transaction Type</th>
              <th>Channel</th>
              <th>Reference</th>
              <th class="amount">Amount</th>
              <th class="amount">Fee</th>
              <th class="amount">Net Amount</th>
            </tr>
          </thead>
          <tbody>
            ${pagination.rows.length ? pagination.rows.map((row) => `
              <tr>
                <td class="nowrap">${escapeHtml(xenditDateText(row.date, row.dateRaw))}</td>
                <td class="nowrap">${escapeHtml(xenditDateText(row.settlementAt, row.settlementRaw))}</td>
                <td>${escapeHtml(row.type || '-')}</td>
                <td>${escapeHtml(row.channel || '-')}</td>
                <td>
                  <strong class="cell-title">${escapeHtml(row.reference || '-')}</strong>
                  <div class="muted">${escapeHtml(row.description || '-')}</div>
                </td>
                <td class="amount positive">${xenditAmountText(row.amount, row.amountText)}</td>
                <td class="amount negative">${xenditAmountText(row.fee, row.feeText)}</td>
                <td class="amount">${xenditAmountText(row.netAmount, row.netText)}</td>
              </tr>
            `).join('') : '<tr><td colspan="8">Pending settlement belum tersedia pada filter ini.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${xenditLocalPager('pending', rows.length, limit, pagination.page)}
    </section>
  `;
}

function renderXenditFees(reports = []) {
  const limit = state.xenditReportLimit || 25;
  const pagination = xenditPaginate(reports, state.xenditReportPage, limit);
  state.xenditReportPage = pagination.page;
  return `
    <section class="section">
      <div class="section-head">
        <h2>Fees Report</h2>
        <span>${displayNumber(reports.length)} periode</span>
      </div>
      <div class="table-wrap">
        <table class="xendit-table">
          <thead>
            <tr>
              <th>Periode</th>
              <th>Status</th>
              <th class="amount">Volume Transaction</th>
              <th>Jumlah Transaction</th>
              <th class="amount">Jumlah Fee</th>
              <th>Invoice</th>
              <th>Faktur</th>
            </tr>
          </thead>
          <tbody>
            ${pagination.rows.length ? pagination.rows.map((report) => `
              <tr>
                <td>${escapeHtml(readablePeriodText(report.period || '-'))}</td>
                <td><span class="badge ${xenditStatusBadge(report.status)}">${escapeHtml(report.status || '-')}</span></td>
                <td class="amount">${rupiah(report.volumeAmount || 0)}</td>
                <td>${displayNumber(report.transactionCount || 0)}</td>
                <td class="amount">${rupiah(report.feeAmount || 0)}</td>
                <td>${report.hasInvoice ? 'Ada' : '-'}</td>
                <td>${report.hasTaxInvoice ? 'Ada' : '-'}</td>
              </tr>
            `).join('') : '<tr><td colspan="7">Fees report belum tersedia.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${xenditLocalPager('report', reports.length, limit, pagination.page)}
    </section>
  `;
}

function renderXenditActiveTab(payload = {}) {
  const tab = state.xenditTab || payload.tab || 'transactions';
  if (tab === 'balance') return renderXenditBalanceHistory(Array.isArray(payload.balanceHistory) ? payload.balanceHistory : []);
  if (tab === 'pending') return renderXenditPending(Array.isArray(payload.pending) ? payload.pending : [], payload.pendingSummary || {});
  if (tab === 'fees') return renderXenditFees(Array.isArray(payload.reports) ? payload.reports : []);
  return renderXenditTransactions(Array.isArray(payload.transactions) ? payload.transactions : [], payload.cursor || {});
}

function openXenditWithdrawModal(account = {}, balance = {}) {
  const banks = Array.isArray(account.banks) ? account.banks.filter((bank) => bank.index !== undefined && bank.index !== null) : [];
  if (!banks.length) {
    setToast('Rekening withdraw Xendit belum terbaca');
    return;
  }
  const balanceAmount = Number(balance.amount || 0);
  const reserveAmount = XENDIT_WITHDRAW_RESERVE_AMOUNT;
  const maxWithdrawAmount = Math.max(0, balanceAmount - reserveAmount);
  openModal('Withdraw Xendit', `
    <div class="notice">
      <strong>Saldo saat ini ${escapeHtml(balance.text || rupiah(balance.amount || 0))}</strong>
      <span>Withdraw harus menyisakan minimal ${rupiah(reserveAmount)}. PIN dan OTP tidak disimpan di aplikasi.</span>
    </div>
    <div class="form-grid">
      <label class="field">
        <span>Nominal Withdraw</span>
        <input name="amount" id="xenditWithdrawAmount" type="number" min="10000" max="${escapeHtml(maxWithdrawAmount)}" step="1" inputmode="numeric" required>
        <small class="xendit-available-row" id="xenditAvailableText">${rupiah(maxWithdrawAmount)} available</small>
      </label>
      <label class="field">
        <span>Rekening Tujuan</span>
        <select name="bankIndex" required>
          ${banks.map((bank) => `
            <option value="${escapeHtml(bank.index)}">${escapeHtml([bank.bank, bank.accountName, bank.accountNumberMasked].filter(Boolean).join(' - '))}</option>
          `).join('')}
        </select>
      </label>
      <label class="field">
        <span>PIN Xendit</span>
        <input name="pin" type="password" inputmode="numeric" minlength="4" maxlength="6" autocomplete="current-password" required>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" id="xenditWithdrawSubmit" type="submit" ${maxWithdrawAmount < 10000 ? 'disabled' : ''}>Request OTP</button>
    </div>
  `, async (payload) => {
    const requestedAmount = Number(payload.amount || 0);
    const remainingAmount = balanceAmount - requestedAmount;
    if (requestedAmount > maxWithdrawAmount || remainingAmount < reserveAmount) {
      throw new Error(`Nominal withdraw terlalu besar. ${rupiah(maxWithdrawAmount)} available.`);
    }
    const confirmation = window.prompt('Ketik WITHDRAW untuk melanjutkan request OTP withdraw Xendit.');
    if (confirmation !== 'WITHDRAW') {
      throw new Error('Withdraw dibatalkan');
    }
    const result = await api('/api/xendit/withdraw-request', {
      method: 'POST',
      body: JSON.stringify({
        amount: payload.amount,
        bankIndex: payload.bankIndex,
        pin: payload.pin
      })
    });
    setToast(result.message || 'OTP withdraw Xendit sudah diminta');
    window.setTimeout(() => openXenditWithdrawVerifyModal(result), 100);
  });

  const amountInput = modalBody.querySelector('#xenditWithdrawAmount');
  const availableText = modalBody.querySelector('#xenditAvailableText');
  const submitButton = modalBody.querySelector('#xenditWithdrawSubmit');
  const updateAvailable = () => {
    const requestedAmount = Number(amountInput?.value || 0);
    const remainingAmount = requestedAmount > 0 ? balanceAmount - requestedAmount : maxWithdrawAmount;
    const isInvalid = requestedAmount > 0 && (requestedAmount > maxWithdrawAmount || remainingAmount < reserveAmount);
    if (availableText) {
      availableText.textContent = `${rupiah(Math.max(0, remainingAmount))} available`;
      availableText.classList.toggle('is-danger', isInvalid);
    }
    if (submitButton) {
      submitButton.disabled = maxWithdrawAmount < 10000 || isInvalid;
    }
  };
  amountInput?.addEventListener('input', updateAvailable);
  updateAvailable();
}

function openXenditWithdrawVerifyModal(preview = {}) {
  if (!preview.withdrawToken) {
    setToast('Token verifikasi withdraw tidak tersedia');
    return;
  }
  openModal('Verifikasi Withdraw', `
    <div class="xendit-withdraw-preview">
      <div>
        <span>Nominal</span>
        <strong>${rupiah(preview.amount || 0)}</strong>
      </div>
      <div>
        <span>Rekening</span>
        <strong>${escapeHtml([preview.bank, preview.accountName, preview.accountNumberMasked].filter(Boolean).join(' - ') || '-')}</strong>
      </div>
    </div>
    <div class="form-grid">
      <label class="field">
        <span>OTP</span>
        <input name="otp" type="password" inputmode="numeric" minlength="6" maxlength="6" autocomplete="one-time-code" required>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Verifikasi Withdraw</button>
    </div>
  `, async (payload) => {
    const result = await api('/api/xendit/withdraw-verify', {
      method: 'POST',
      body: JSON.stringify({
        otp: payload.otp,
        withdrawToken: preview.withdrawToken,
        amount: preview.amount
      })
    });
    setToast(result.message || 'Withdraw Xendit berhasil diverifikasi');
    renderXendit({ refresh: true });
  });
}

async function renderXendit(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat data Xendit...</div>';
  const limit = 15;
  const activeTab = state.xenditTab || 'transactions';
  const nextId = activeTab === 'transactions'
    ? state.xenditCursorStack[Math.max(0, Number(state.xenditPage || 1) - 1)] || ''
    : '';
  const params = {
    tab: activeTab,
    from: state.xenditFrom || `${todayInput().slice(0, 8)}01`,
    to: state.xenditTo || todayInput(),
    limit,
    nextId
  };
  if (activeTab === 'transactions' && state.xenditType !== 'all') params.type = state.xenditType;
  if (activeTab === 'transactions' && state.xenditMethod !== 'all') params.paymentMethod = state.xenditMethod;
  if (state.search) params.search = state.search;
  if (options.refresh) params.refresh = '1';

  const payload = await api(`/api/xendit?${queryString(params)}`);
  const account = payload.account || {};
  const balance = payload.balance || {};
  const cursor = payload.cursor || {};
  const canViewXenditBalance = Boolean(payload.canViewBalance && can('xendit:balance'));
  const canWithdrawXendit = Boolean(payload.canWithdraw && can('xendit:withdraw') && canViewXenditBalance);
  if (cursor.nextPage && cursor.nextId) {
    state.xenditCursorStack[Number(state.xenditPage || 1)] = cursor.nextId;
  }
  const errorList = [
    payload.error,
    ...Object.values(payload.errors || {})
  ].filter(Boolean);

  if (options.refresh) {
    setToast(payload.ok ? 'Data Xendit diperbarui' : (payload.error || 'Data Xendit belum lengkap'));
  }

  app.innerHTML = `
    <div class="stack">
      <div class="toolbar xendit-toolbar">
        ${renderXenditTabs()}
        <div class="toolbar-actions">
          ${['balance', 'pending'].includes(activeTab) && payload.exportUrl ? `<a class="ghost-button compact button-link" href="${escapeHtml(payload.exportUrl)}" target="_blank" rel="noopener">Export CSV</a>` : ''}
          ${canWithdrawXendit ? '<button class="button compact" id="xenditWithdrawButton" type="button">Withdraw</button>' : ''}
          <button class="button compact" id="refreshXendit" type="button">Refresh</button>
        </div>
      </div>

      ${canViewXenditBalance ? renderXenditAccountPanel(account, balance, payload.fetchedAt) : ''}

      <div class="toolbar">
        <div class="filters">
          ${datePickerControl({ id: 'xenditFrom', value: state.xenditFrom, className: 'control' })}
          ${datePickerControl({ id: 'xenditTo', value: state.xenditTo, className: 'control' })}
          ${activeTab === 'transactions' ? `<select class="control" id="xenditType">
            <option value="all" ${state.xenditType === 'all' ? 'selected' : ''}>Semua tipe</option>
            <option value="PAYMENT" ${state.xenditType === 'PAYMENT' ? 'selected' : ''}>Payment</option>
            <option value="DISBURSEMENT" ${state.xenditType === 'DISBURSEMENT' ? 'selected' : ''}>Disbursement</option>
            <option value="REFUND" ${state.xenditType === 'REFUND' ? 'selected' : ''}>Refund</option>
          </select>
          <select class="control" id="xenditMethod">
            <option value="all" ${state.xenditMethod === 'all' ? 'selected' : ''}>Semua metode</option>
            <option value="VIRTUAL_ACCOUNT" ${state.xenditMethod === 'VIRTUAL_ACCOUNT' ? 'selected' : ''}>Virtual Account</option>
            <option value="QR_CODE" ${state.xenditMethod === 'QR_CODE' ? 'selected' : ''}>QR Code</option>
            <option value="EWALLET" ${state.xenditMethod === 'EWALLET' ? 'selected' : ''}>E-Wallet</option>
            <option value="RETAIL_OUTLET" ${state.xenditMethod === 'RETAIL_OUTLET' ? 'selected' : ''}>Retail Outlet</option>
            <option value="BANK" ${state.xenditMethod === 'BANK' ? 'selected' : ''}>Bank</option>
          </select>` : ''}
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari reference, description, channel" autocomplete="off">
        </div>
      </div>

      ${errorList.length ? `<div class="notice error">${errorList.map(escapeHtml).join('<br>')}</div>` : ''}
      ${renderXenditActiveTab(payload)}
    </div>
  `;

  const refreshFilters = () => {
    resetXenditPages();
    renderXendit();
  };
  app.querySelectorAll('[data-xendit-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextTab = button.dataset.xenditTab || 'transactions';
      if (state.xenditTab === nextTab) return;
      state.xenditTab = nextTab;
      resetXenditPages();
      renderXendit();
    });
  });
  document.getElementById('xenditFrom')?.addEventListener('change', (event) => {
    state.xenditFrom = event.target.value || `${todayInput().slice(0, 8)}01`;
    refreshFilters();
  });
  document.getElementById('xenditTo')?.addEventListener('change', (event) => {
    state.xenditTo = event.target.value || todayInput();
    refreshFilters();
  });
  document.getElementById('xenditType')?.addEventListener('change', (event) => {
    state.xenditType = event.target.value || 'all';
    refreshFilters();
  });
  document.getElementById('xenditMethod')?.addEventListener('change', (event) => {
    state.xenditMethod = event.target.value || 'all';
    refreshFilters();
  });
  document.getElementById('refreshXendit')?.addEventListener('click', () => renderXendit({ refresh: true }));
  document.getElementById('xenditWithdrawButton')?.addEventListener('click', () => openXenditWithdrawModal(account, balance));
  bindSearch((renderOptions = {}) => {
    resetXenditPages();
    return renderXendit(renderOptions);
  });
  app.querySelector('[data-xendit-prev]')?.addEventListener('click', () => {
    state.xenditPage = Math.max(1, Number(state.xenditPage || 1) - 1);
    state.xenditNextId = state.xenditCursorStack[state.xenditPage - 1] || '';
    renderXendit();
  });
  app.querySelector('[data-xendit-next]')?.addEventListener('click', () => {
    if (!cursor.nextPage || !cursor.nextId) return;
    state.xenditCursorStack[Number(state.xenditPage || 1)] = cursor.nextId;
    state.xenditPage = Number(state.xenditPage || 1) + 1;
    state.xenditNextId = cursor.nextId;
    renderXendit();
  });
  app.querySelectorAll('[data-xendit-balance-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.xenditBalancePage = Math.max(1, Number(button.dataset.xenditBalancePage || 1));
      renderXendit();
    });
  });
  bindPagerLimit('xendit-balance', (limit) => {
    state.xenditBalanceLimit = limit;
  }, (page) => {
    state.xenditBalancePage = page;
  }, renderXendit, 25);
  app.querySelectorAll('[data-xendit-pending-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.xenditPendingPage = Math.max(1, Number(button.dataset.xenditPendingPage || 1));
      renderXendit();
    });
  });
  bindPagerLimit('xendit-pending', (limit) => {
    state.xenditPendingLimit = limit;
  }, (page) => {
    state.xenditPendingPage = page;
  }, renderXendit, 25);
  app.querySelectorAll('[data-xendit-report-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.xenditReportPage = Math.max(1, Number(button.dataset.xenditReportPage || 1));
      renderXendit();
    });
  });
  bindPagerLimit('xendit-report', (limit) => {
    state.xenditReportLimit = limit;
  }, (page) => {
    state.xenditReportPage = page;
  }, renderXendit, 25);
}

function stockReportTypeLabel(type) {
  if (type === 'in') return 'Barang Masuk';
  if (type === 'out') return 'Barang Keluar';
  if (type === 'adjust') return 'Koreksi';
  return 'Semua Mutasi';
}

function stockReportBadge(type) {
  if (type === 'in') return 'active';
  if (type === 'out') return 'inactive';
  if (type === 'adjust') return 'pending';
  return '';
}

function movementUpdaterText(movement = {}) {
  return movement.updatedByName || movement.updatedByUsername || '-';
}

function receiptSignerName(income = {}) {
  return income.createdByName
    || income.createdByUsername
    || income.updatedByName
    || income.updatedByUsername
    || state.auth?.name
    || state.auth?.username
    || currentBranding().businessName;
}

async function renderReportsInventoryStock(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat laporan stok...</div>';
  const params = queryString({
    period: state.period,
    type: state.inventoryReportType,
    search: state.search,
    page: state.inventoryReportPage,
    limit: state.inventoryReportLimit
  });
  const payload = await api(`/api/reports/inventory-stock?${params}`);
  const movements = Array.isArray(payload.movements) ? payload.movements : [];
  const summary = payload.summary || {};
  const pagination = payload.pagination || { page: 1, totalPages: 1, total: movements.length, limit: state.inventoryReportLimit };
  state.inventoryReportPage = Number(pagination.page || 1);
  state.inventoryReportLimit = pagerLimitValue(pagination.limit || state.inventoryReportLimit || 10, 10);

  app.innerHTML = `
    <div class="stack">
      <section class="metrics">
        ${metric('Barang Masuk', `${displayNumber(summary.inQuantity || 0)} unit`, `${displayNumber(summary.inCount || 0)} transaksi`, 'positive')}
        ${metric('Barang Keluar', `${displayNumber(summary.outQuantity || 0)} unit`, `${displayNumber(summary.outCount || 0)} transaksi`, 'negative')}
        ${metric('Koreksi Stok', `${displayNumber(summary.adjustQuantity || 0)} unit`, `${displayNumber(summary.adjustCount || 0)} transaksi`, summary.adjustCount ? 'warning-card' : '')}
        ${metric('Total Mutasi', displayNumber(summary.total || 0), periodLabel(state.period))}
      </section>

      <div class="toolbar">
        <div class="filters">
          <select class="control" id="inventoryReportType">
            <option value="all" ${state.inventoryReportType === 'all' ? 'selected' : ''}>Semua mutasi</option>
            <option value="in" ${state.inventoryReportType === 'in' ? 'selected' : ''}>Barang masuk</option>
            <option value="out" ${state.inventoryReportType === 'out' ? 'selected' : ''}>Barang keluar</option>
            <option value="adjust" ${state.inventoryReportType === 'adjust' ? 'selected' : ''}>Koreksi stok</option>
          </select>
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari barang, update oleh, catatan" autocomplete="off">
        </div>
      </div>

      <section class="section">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Barang</th>
                <th>Jenis</th>
                <th>Jumlah</th>
                <th>Stok</th>
                <th>Update Oleh</th>
              </tr>
            </thead>
            <tbody>
              ${movements.length ? movements.map((movement) => `
                <tr>
                  <td class="nowrap">${dateText(movement.date || movement.at || movement.createdAt)}</td>
                  <td>
                    <strong>${escapeHtml(movement.itemName || '-')}</strong>
                    ${movement.notes ? `<div class="muted">${escapeHtml(movement.notes)}</div>` : ''}
                  </td>
                  <td><span class="badge ${stockReportBadge(movement.type)}">${escapeHtml(stockReportTypeLabel(movement.type))}</span></td>
                  <td class="amount ${movement.type === 'out' ? 'negative' : 'positive'}">${displayNumber(movement.quantity || 0)} ${escapeHtml(movement.unit || 'unit')}</td>
                  <td class="nowrap">${displayNumber(movement.beforeQuantity || 0)} ke ${displayNumber(movement.afterQuantity || 0)}</td>
                  <td>
                    <strong>${escapeHtml(movementUpdaterText(movement))}</strong>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="6">Belum ada mutasi stok sesuai filter.</td></tr>'}
            </tbody>
          </table>
        </div>
        ${stockReportPaginationControls(pagination)}
      </section>
    </div>
  `;

  document.getElementById('inventoryReportType')?.addEventListener('change', (event) => {
    state.inventoryReportType = event.target.value || 'all';
    state.inventoryReportPage = 1;
    renderReportsInventoryStock();
  });
  bindSearch((renderOptions = {}) => {
    state.inventoryReportPage = 1;
    return renderReportsInventoryStock(renderOptions);
  });
  app.querySelectorAll('[data-stock-report-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.inventoryReportPage = Math.max(1, Number(button.dataset.stockReportPage || 1));
      renderReportsInventoryStock();
    });
  });
  bindPagerLimit('stock-report', (limit) => {
    state.inventoryReportLimit = limit;
  }, (page) => {
    state.inventoryReportPage = page;
  }, renderReportsInventoryStock, 10);
}

async function renderExpenses(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat pengeluaran...</div>';
  const period = normalizedPeriod(state.expensePeriod || state.period);
  state.expensePeriod = period;
  const params = queryString({
    period,
    search: state.search,
    page: state.expensePage,
    limit: state.expenseLimit
  });
  const payload = await api(`/api/expenses?${params}`);
  const expenses = payload.expenses || [];
  const pagination = payload.pagination || { page: 1, limit: state.expenseLimit, total: expenses.length, totalPages: 1 };
  state.expensePage = Number(pagination.page || 1);
  const writeAllowed = can('expenses:write');

  app.innerHTML = `
    <div class="stack">
      <div class="toolbar">
        <div class="filters">
          ${periodFilterControls('expensePeriod', period)}
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari pengeluaran" autocomplete="off">
        </div>
        ${writeAllowed ? '<button class="button" id="addExpense" type="button">Tambah Pengeluaran</button>' : ''}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Catatan Transaksi</th>
              <th>Penerima/Tujuan</th>
              <th>Keperluan</th>
              <th>Metode</th>
              <th>Nominal</th>
              ${writeAllowed ? '<th>Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${expenses.length ? expenses.map((expense) => {
              return `
              <tr>
                <td>${dateText(expense.date)}</td>
                <td>${escapeHtml(expense.description || '-')}</td>
                <td>
                  ${escapeHtml(expensePayeeText(expense))}
                  ${expenseReferenceText(expense) ? `<div class="muted">Ref ${escapeHtml(expenseReferenceText(expense))}</div>` : ''}
                </td>
                <td>
                  ${escapeHtml(expenseItemsText(expense))}
                  <div class="muted">${escapeHtml(expenseCategoriesText(expense))}</div>
                </td>
                <td>${escapeHtml(expense.paymentMethod || '-')}</td>
                <td class="amount negative">${rupiah(expense.amount)}</td>
                ${writeAllowed ? `
                  <td>
                    <div class="row-actions">
                      <button class="ghost-button compact" type="button" data-edit-expense="${escapeHtml(expense.id)}">Edit</button>
                      <button class="danger-button compact" type="button" data-delete-expense="${escapeHtml(expense.id)}">Hapus</button>
                    </div>
                  </td>
                ` : ''}
              </tr>
            `;
            }).join('') : `<tr><td colspan="${writeAllowed ? 7 : 6}">Belum ada pengeluaran pada periode ini.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${radiusPaginationControls('expense', pagination, 'pengeluaran')}
    </div>
  `;

  document.getElementById('addExpense')?.addEventListener('click', () => openExpenseModal());
  bindPeriodFilter('expensePeriod', (nextPeriod) => {
    state.expensePeriod = normalizedPeriod(nextPeriod);
    state.expensePage = 1;
    renderExpenses();
  });
  if (writeAllowed) {
    app.querySelectorAll('[data-edit-expense]').forEach((button) => {
      button.addEventListener('click', () => {
        const expense = expenses.find((item) => item.id === button.dataset.editExpense);
        if (expense) {
          openExpenseModal(expense);
        }
      });
    });
    app.querySelectorAll('[data-delete-expense]').forEach((button) => {
      button.addEventListener('click', async () => {
        const expense = expenses.find((item) => item.id === button.dataset.deleteExpense);
        if (!expense) return;
        if (!window.confirm(`Hapus pengeluaran ${expense.category} sebesar ${rupiah(expense.amount)}?`)) {
          return;
        }
        await api(`/api/expenses/${encodeURIComponent(expense.id)}`, {
          method: 'DELETE'
        });
        setToast('Pengeluaran dihapus');
        renderExpenses();
      });
    });
  }
  bindSearch((renderOptions = {}) => {
    state.expensePage = 1;
    return renderExpenses(renderOptions);
  });
  app.querySelectorAll('[data-expense-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.expensePage = Math.max(1, Number(button.dataset.expensePage || 1));
      renderExpenses();
    });
  });
  bindPagerLimit('expense', (limit) => {
    state.expenseLimit = limit;
  }, (page) => {
    state.expensePage = page;
  }, renderExpenses, 10);
}

function optionList(values, selected) {
  return values.map((value) => `
    <option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>
  `).join('');
}

const INCOME_CATEGORIES = ['Barang/Jasa', 'Instalasi', 'Perangkat', 'Deposit', 'Sewa', 'Lainnya'];
const EXPENSE_CATEGORIES = ['Bandwidth', 'Listrik', 'PDAM', 'Perangkat', 'Gaji', 'Sewa', 'Konsumsi', 'Operasional'];
const PAYMENT_METHODS = ['Tunai', 'Transfer', 'QRIS'];

function todayInput() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: appTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function datePartsFromInput(value) {
  const text = String(value || '').trim();
  let year;
  let month;
  let day;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!local) return null;
    day = Number(local[1]);
    month = Number(local[2]);
    year = Number(local[3]);
  }
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return { year, month, day };
}

function fallbackDateParts(value) {
  return datePartsFromInput(value) || datePartsFromInput(todayInput());
}

function formatDateDisplayFromParts(parts) {
  if (!parts) return '';
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

function formatDateIsoFromParts(parts) {
  if (!parts) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function dateDisplayInput(value) {
  return formatDateDisplayFromParts(fallbackDateParts(value));
}

function dateIsoInput(value) {
  return formatDateIsoFromParts(fallbackDateParts(value));
}

function datePickerControl(options = {}) {
  const {
    id = '',
    name = '',
    value = todayInput(),
    required = false,
    disabled = false,
    className = ''
  } = options;
  const safeId = id ? ` id="${escapeHtml(id)}"` : '';
  const safeName = name ? ` name="${escapeHtml(name)}"` : '';
  const safeClass = className ? ` ${escapeHtml(className)}` : '';
  const requiredAttr = required ? ' required' : '';
  const disabledAttr = disabled ? ' disabled' : '';
  const isoValue = dateIsoInput(value);
  const displayValue = dateDisplayInput(value);
  return `
    <div class="date-picker-control${safeClass}" data-date-picker>
      <input${safeId}${safeName} type="hidden" value="${escapeHtml(isoValue)}" data-date-picker-value${requiredAttr}${disabledAttr}>
      <button class="date-picker-trigger" type="button" data-date-picker-toggle aria-expanded="false"${disabledAttr}>
        <span data-date-picker-display>${escapeHtml(displayValue)}</span>
        <span class="date-picker-icon" aria-hidden="true"></span>
      </button>
      <div class="date-picker-panel" data-date-picker-panel hidden>
        <div class="date-picker-head">
          <button type="button" data-date-picker-nav="-1" aria-label="Bulan sebelumnya">&lt;</button>
          <strong data-date-picker-month></strong>
          <button type="button" data-date-picker-nav="1" aria-label="Bulan berikutnya">&gt;</button>
        </div>
        <div class="date-picker-weekdays">
          <span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span>
        </div>
        <div class="date-picker-days" data-date-picker-days></div>
      </div>
    </div>
  `;
}

function closeDatePickers(except = null) {
  document.querySelectorAll('[data-date-picker]').forEach((picker) => {
    if (except && picker === except) return;
    picker.classList.remove('is-open');
    picker.querySelector('[data-date-picker-panel]')?.setAttribute('hidden', '');
    picker.querySelector('[data-date-picker-toggle]')?.setAttribute('aria-expanded', 'false');
  });
}

function ensureDatePickerState(picker) {
  const input = picker.querySelector('[data-date-picker-value]');
  const selected = fallbackDateParts(input?.value);
  if (!picker.dataset.viewYear || !picker.dataset.viewMonth) {
    picker.dataset.viewYear = String(selected.year);
    picker.dataset.viewMonth = String(selected.month - 1);
  }
  return {
    selected,
    viewYear: Number(picker.dataset.viewYear),
    viewMonth: Number(picker.dataset.viewMonth)
  };
}

function renderDatePicker(picker) {
  const input = picker.querySelector('[data-date-picker-value]');
  const monthLabel = picker.querySelector('[data-date-picker-month]');
  const days = picker.querySelector('[data-date-picker-days]');
  if (!input || !monthLabel || !days) return;
  const { selected, viewYear, viewMonth } = ensureDatePickerState(picker);
  const today = fallbackDateParts(todayInput());
  const firstDay = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leading = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  monthLabel.textContent = `${MONTH_FULL_LABELS[viewMonth]} ${viewYear}`;
  days.innerHTML = Array.from({ length: totalCells }, (_, index) => {
    const day = index - leading + 1;
    if (day < 1 || day > daysInMonth) {
      return '<span class="date-picker-day is-empty"></span>';
    }
    const isSelected = selected.year === viewYear && selected.month === viewMonth + 1 && selected.day === day;
    const isToday = today.year === viewYear && today.month === viewMonth + 1 && today.day === day;
    return `
      <button class="date-picker-day ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}" type="button" data-date-picker-day="${day}">
        ${day}
      </button>
    `;
  }).join('');
}

function setDatePickerValue(picker, parts) {
  const input = picker.querySelector('[data-date-picker-value]');
  const display = picker.querySelector('[data-date-picker-display]');
  if (!input || !display) return;
  input.value = formatDateIsoFromParts(parts);
  display.textContent = formatDateDisplayFromParts(parts);
  picker.dataset.viewYear = String(parts.year);
  picker.dataset.viewMonth = String(parts.month - 1);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function handleDatePickerDocumentClick(event) {
  const picker = event.target.closest('[data-date-picker]');
  const toggle = event.target.closest('[data-date-picker-toggle]');
  const nav = event.target.closest('[data-date-picker-nav]');
  const dayButton = event.target.closest('[data-date-picker-day]');
  if (!picker) {
    closeDatePickers();
    return;
  }
  if (toggle) {
    event.preventDefault();
    const panel = picker.querySelector('[data-date-picker-panel]');
    const willOpen = panel?.hidden;
    closeDatePickers(picker);
    if (willOpen) {
      renderDatePicker(picker);
      panel.hidden = false;
      picker.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
    } else {
      closeDatePickers();
    }
    return;
  }
  if (nav) {
    event.preventDefault();
    ensureDatePickerState(picker);
    let viewYear = Number(picker.dataset.viewYear);
    let viewMonth = Number(picker.dataset.viewMonth) + Number(nav.dataset.datePickerNav || 0);
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    picker.dataset.viewYear = String(viewYear);
    picker.dataset.viewMonth = String(viewMonth);
    renderDatePicker(picker);
    return;
  }
  if (dayButton && !dayButton.classList.contains('is-empty')) {
    event.preventDefault();
    ensureDatePickerState(picker);
    setDatePickerValue(picker, {
      year: Number(picker.dataset.viewYear),
      month: Number(picker.dataset.viewMonth) + 1,
      day: Number(dayButton.dataset.datePickerDay)
    });
    closeDatePickers();
  }
}

function rowValue(row, field) {
  return row.querySelector(`[data-field="${field}"]`)?.value?.trim() || '';
}

function rowChecked(row, field) {
  return Boolean(row.querySelector(`[data-field="${field}"]`)?.checked);
}

function updateTaxControls(root) {
  root.querySelectorAll('[data-tax-enabled]').forEach((checkbox) => {
    const scope = checkbox.closest('[data-batch-row]') || checkbox.closest('.form-grid') || root;
    const rateInput = scope.querySelector('[data-tax-rate]');
    if (!rateInput) return;
    rateInput.disabled = !checkbox.checked;
    if (checkbox.checked && !rateInput.value) {
      rateInput.value = '11';
    }
  });
}

function bindTaxControls(root) {
  if (!root) return;
  updateTaxControls(root);
  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-tax-enabled]')) {
      updateTaxControls(root);
    }
  });
}

function reindexBatchRows(container, label) {
  const rows = [...container.querySelectorAll('[data-batch-row]')];
  rows.forEach((row, index) => {
    const number = row.querySelector('[data-row-number]');
    const remove = row.querySelector('[data-remove-row]');
    if (number) number.textContent = `${label} ${index + 1}`;
    if (remove) remove.disabled = rows.length === 1;
  });
}

function incomeItemRow(item = {}) {
  const quantity = item.quantity || item.qty || item.pcs || 1;
  const unitPrice = item.unitPrice || item.price || item.unitAmount || item.amount || '';
  const category = item.category || 'Barang/Jasa';
  return `
    <div class="batch-row" data-batch-row data-income-item-row>
      <div class="batch-row-head">
        <strong data-row-number>Item</strong>
        <button class="ghost-button compact" type="button" data-remove-row>Hapus Baris</button>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Kategori</span>
          <select data-field="category">${optionList(INCOME_CATEGORIES.includes(category) ? INCOME_CATEGORIES : [category, ...INCOME_CATEGORIES], category)}</select>
        </label>
        <label class="field">
          <span>Barang/Jasa</span>
          <input data-field="itemName" value="${escapeHtml(item.itemName || '')}" placeholder="Instalasi, router, jasa setting">
        </label>
        <label class="field">
          <span>Qty/Pcs</span>
          <input data-field="quantity" type="number" min="1" step="1" value="${escapeHtml(quantity)}">
        </label>
        <label class="field">
          <span>Harga satuan</span>
          <input data-field="unitPrice" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(unitPrice)}">
        </label>
        <label class="field full">
          <span>Keterangan item</span>
          <textarea data-field="description">${escapeHtml(item.description || '')}</textarea>
        </label>
      </div>
    </div>
  `;
}

function expenseItemRow(item = {}) {
  const category = item.category === 'Teknisi' ? 'Gaji' : item.category || 'Operasional';
  const quantity = item.quantity || item.qty || item.pcs || 1;
  const unitPrice = item.unitPrice || item.price || item.unitAmount || item.amount || '';
  return `
    <div class="batch-row" data-batch-row data-expense-item-row>
      <div class="batch-row-head">
        <strong data-row-number>Item</strong>
        <button class="ghost-button compact" type="button" data-remove-row>Hapus Baris</button>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Kategori</span>
          <select data-field="category">${optionList(EXPENSE_CATEGORIES.includes(category) ? EXPENSE_CATEGORIES : [category, ...EXPENSE_CATEGORIES], category)}</select>
        </label>
        <label class="field">
          <span>Keperluan/Item</span>
          <input data-field="itemName" value="${escapeHtml(item.itemName || '')}" placeholder="Gaji karyawan, router, listrik">
        </label>
        <label class="field">
          <span>Qty/Pcs</span>
          <input data-field="quantity" type="number" min="1" step="1" value="${escapeHtml(quantity)}">
        </label>
        <label class="field">
          <span>Nominal satuan</span>
          <input data-field="unitPrice" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(unitPrice)}">
        </label>
        <label class="field full">
          <span>Keterangan item</span>
          <textarea data-field="description">${escapeHtml(item.description || '')}</textarea>
        </label>
      </div>
    </div>
  `;
}

function bindBatchRows(form, containerId, rowFactory, label) {
  const container = form.querySelector(`#${containerId}`);
  const addButton = form.querySelector('[data-add-row]');
  if (!container || !addButton) return;
  reindexBatchRows(container, label);
  addButton.addEventListener('click', () => {
    container.insertAdjacentHTML('beforeend', rowFactory());
    reindexBatchRows(container, label);
  });
  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-row]');
    if (!button) return;
    const row = button.closest('[data-batch-row]');
    if (row && container.querySelectorAll('[data-batch-row]').length > 1) {
      row.remove();
      reindexBatchRows(container, label);
    }
  });
}

function collectIncomeItems(form) {
  const items = [...form.querySelectorAll('[data-income-item-row]')]
    .map((row) => {
      const quantity = Math.max(1, Number(rowValue(row, 'quantity')) || 1);
      const unitPrice = Number(rowValue(row, 'unitPrice')) || 0;
      return {
        category: rowValue(row, 'category') || 'Barang/Jasa',
        itemName: rowValue(row, 'itemName'),
        quantity,
        unitPrice,
        amount: Math.round(quantity * unitPrice),
        description: rowValue(row, 'description')
      };
    })
    .filter((item) => item.amount > 0);
  if (!items.length) {
    throw new Error('Isi minimal satu item pemasukan');
  }
  return items;
}

function collectExternalIncomePayload(form, payload) {
  return {
    date: payload.date || todayInput(),
    payerName: payload.payerName,
    paymentMethod: payload.paymentMethod || 'Tunai',
    description: payload.description,
    taxEnabled: Boolean(payload.taxEnabled),
    taxRate: Number(payload.taxRate) || 0,
    items: collectIncomeItems(form)
  };
}

function collectExpenseItems(form) {
  const items = [...form.querySelectorAll('[data-expense-item-row]')]
    .map((row) => {
      const quantity = Math.max(1, Number(rowValue(row, 'quantity')) || 1);
      const unitPrice = Number(rowValue(row, 'unitPrice')) || 0;
      return {
        category: rowValue(row, 'category') || 'Operasional',
        itemName: rowValue(row, 'itemName'),
        quantity,
        unitPrice,
        amount: Math.round(quantity * unitPrice),
        description: rowValue(row, 'description')
      };
    })
    .filter((item) => item.amount > 0);
  if (!items.length) {
    throw new Error('Isi minimal satu item pengeluaran');
  }
  return items;
}

function collectExpensePayload(form, payload) {
  const payee = payload.payee || payload.vendor;
  return {
    date: payload.date || todayInput(),
    payee,
    vendor: payee,
    noteNo: payload.noteNo,
    paymentMethod: payload.paymentMethod || 'Tunai',
    description: payload.description,
    items: collectExpenseItems(form)
  };
}

function memberAddonRow(item = {}) {
  const quantity = item.quantity || item.qty || item.pcs || 1;
  const unitPrice = item.unitPrice || item.price || item.unitAmount || (item.amount && Number(quantity) > 1 ? Math.round(Number(item.amount || 0) / Number(quantity || 1)) : item.amount) || '';
  return `
    <div class="batch-row member-addon-row" data-batch-row data-member-addon-row>
      <div class="batch-row-head">
        <strong data-row-number>Add-on</strong>
        <button class="ghost-button compact" type="button" data-remove-member-addon data-member-addon-control>Hapus</button>
      </div>
      <div class="form-grid member-addon-grid">
        <label class="field member-addon-name">
          <span>Nama layanan</span>
          <input data-field="name" data-member-addon-field value="${escapeHtml(item.name || item.itemName || '')}" placeholder="Sewa CCTV, STB TV">
        </label>
        <label class="field member-addon-qty">
          <span>Qty</span>
          <input data-field="quantity" data-member-addon-field type="number" min="1" step="1" value="${escapeHtml(quantity)}">
        </label>
        <label class="field member-addon-price">
          <span>Biaya/bulan</span>
          <input data-field="unitPrice" data-member-addon-field type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(unitPrice)}">
        </label>
        <label class="field member-addon-note">
          <span>Catatan</span>
          <input data-field="note" data-member-addon-field value="${escapeHtml(item.note || item.description || '')}" placeholder="Opsional">
        </label>
      </div>
    </div>
  `;
}

function reindexMemberAddonRows(container) {
  const rows = [...container.querySelectorAll('[data-member-addon-row]')];
  rows.forEach((row, index) => {
    const number = row.querySelector('[data-row-number]');
    if (number) number.textContent = `Add-on ${index + 1}`;
  });
}

function collectMemberAddons(form) {
  return [...form.querySelectorAll('[data-member-addon-row]')]
    .map((row) => {
      const quantity = Math.max(1, Number(rowValue(row, 'quantity')) || 1);
      const unitPrice = Number(rowValue(row, 'unitPrice')) || 0;
      const name = rowValue(row, 'name');
      return {
        name,
        itemName: name,
        quantity,
        unitPrice,
        amount: Math.round(quantity * unitPrice),
        note: rowValue(row, 'note')
      };
    })
    .filter((item) => item.amount > 0);
}

function syncMemberAddonsHidden(form) {
  const hidden = form.querySelector('input[name="memberAddons"]');
  const addons = collectMemberAddons(form);
  if (hidden) hidden.value = JSON.stringify(addons);
  return addons;
}

function bindMemberAddonRows(form, addons = []) {
  const container = form?.querySelector('[data-member-addon-rows]');
  if (!container) return;
  const rows = memberAddonsArray(addons);
  container.innerHTML = rows.length ? rows.map(memberAddonRow).join('') : memberAddonRow();
  reindexMemberAddonRows(container);
  syncMemberAddonsHidden(form);
  form.querySelector('[data-add-member-addon]')?.addEventListener('click', () => {
    container.insertAdjacentHTML('beforeend', memberAddonRow());
    reindexMemberAddonRows(container);
    syncMemberAddonsHidden(form);
  });
  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-member-addon]');
    if (!button) return;
    button.closest('[data-member-addon-row]')?.remove();
    if (!container.querySelector('[data-member-addon-row]')) {
      container.insertAdjacentHTML('beforeend', memberAddonRow());
    }
    reindexMemberAddonRows(container);
    syncMemberAddonsHidden(form);
  });
  container.addEventListener('input', () => syncMemberAddonsHidden(form));
}

async function renderExternalIncomes(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat pemasukan...</div>';
  const period = normalizedPeriod(state.externalIncomePeriod || state.period);
  state.externalIncomePeriod = period;
  const params = queryString({
    period,
    search: state.search,
    page: state.externalIncomePage,
    limit: state.externalIncomeLimit
  });
  const payload = await api(`/api/external-incomes?${params}`);
  const externalIncomes = payload.externalIncomes || [];
  const pagination = payload.pagination || { page: 1, limit: state.externalIncomeLimit, total: externalIncomes.length, totalPages: 1 };
  state.externalIncomePage = Number(pagination.page || 1);
  const writeAllowed = can('external-incomes:write');
  const rows = externalIncomes.length ? externalIncomes.map((income) => {
    const cancelled = incomeIsCancelled(income);
    return `
      <tr>
        <td>${dateText(income.date)}</td>
        <td>${escapeHtml(income.receiptNo || '-')}</td>
        <td>${escapeHtml(incomeCategoriesText(income))}</td>
        <td>${escapeHtml(income.payerName || '-')}</td>
        <td>
          ${escapeHtml(incomeItemsText(income))}
          ${income.description ? `<div class="muted">${escapeHtml(income.description)}</div>` : ''}
        </td>
        <td>${escapeHtml(income.paymentMethod || '-')}</td>
        <td class="amount ${cancelled ? 'muted' : 'positive'}">${rupiah(income.amount)}${taxDetail(income)}</td>
        <td><span class="badge ${cancelled ? 'inactive' : 'active'}">${cancelled ? 'Batal' : 'Aktif'}</span></td>
        <td>
          <div class="row-actions">
            <button class="ghost-button compact" type="button" data-receipt-income="${escapeHtml(income.id)}">Kuitansi</button>
            ${writeAllowed && !cancelled ? `<button class="ghost-button compact" type="button" data-edit-income="${escapeHtml(income.id)}">Edit</button>` : ''}
            ${writeAllowed && !cancelled ? `<button class="danger-button compact" type="button" data-delete-income="${escapeHtml(income.id)}">Batalkan</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="9">Belum ada pemasukan pada periode ini.</td></tr>';

  app.innerHTML = `
    <div class="stack">
      <div class="toolbar">
        <div class="filters">
          ${periodFilterControls('externalIncomePeriod', period)}
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari pemasukan" autocomplete="off">
        </div>
        ${writeAllowed ? '<button class="button" id="addExternalIncome" type="button">Tambah Pemasukan</button>' : ''}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>No. Kuitansi</th>
              <th>Kategori</th>
              <th>Pembayar</th>
              <th>Barang/Jasa</th>
              <th>Metode</th>
              <th>Nominal</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      ${radiusPaginationControls('external-income', pagination, 'pemasukan')}
    </div>
  `;

  document.getElementById('addExternalIncome')?.addEventListener('click', () => openExternalIncomeModal());
  bindPeriodFilter('externalIncomePeriod', (nextPeriod) => {
    state.externalIncomePeriod = normalizedPeriod(nextPeriod);
    state.externalIncomePage = 1;
    renderExternalIncomes();
  });
  app.querySelectorAll('[data-receipt-income]').forEach((button) => {
    button.addEventListener('click', () => {
      const income = externalIncomes.find((item) => item.id === button.dataset.receiptIncome);
      if (income) {
        openReceiptModal(income);
      }
    });
  });
  if (writeAllowed) {
    app.querySelectorAll('[data-edit-income]').forEach((button) => {
      button.addEventListener('click', () => {
        const income = externalIncomes.find((item) => item.id === button.dataset.editIncome);
        if (income) {
          openExternalIncomeModal(income);
        }
      });
    });
    app.querySelectorAll('[data-delete-income]').forEach((button) => {
      button.addEventListener('click', async () => {
        const income = externalIncomes.find((item) => item.id === button.dataset.deleteIncome);
        if (!income) return;
        if (!window.confirm(`Batalkan kuitansi ${income.receiptNo || income.category} sebesar ${rupiah(income.amount)}? Nomor kuitansi tetap disimpan dan tidak dipakai ulang.`)) {
          return;
        }
        await api(`/api/external-incomes/${encodeURIComponent(income.id)}`, {
          method: 'DELETE'
        });
        setToast('Kuitansi dibatalkan');
        renderExternalIncomes();
      });
    });
  }
  bindSearch((renderOptions = {}) => {
    state.externalIncomePage = 1;
    return renderExternalIncomes(renderOptions);
  });
  app.querySelectorAll('[data-external-income-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.externalIncomePage = Math.max(1, Number(button.dataset.externalIncomePage || 1));
      renderExternalIncomes();
    });
  });
  bindPagerLimit('external-income', (limit) => {
    state.externalIncomeLimit = limit;
  }, (page) => {
    state.externalIncomePage = page;
  }, renderExternalIncomes, 10);
}

function externalIncomeFormBody(income = {}) {
  const method = income.paymentMethod || 'Tunai';
  const taxChecked = hasTax(income);
  const taxRate = income.taxRate !== undefined && income.taxRate !== null && income.taxRate !== '' ? income.taxRate : 11;
  const items = incomeItems(income);
  return `
    <div class="form-grid">
      <div class="field">
        <span>Tanggal</span>
        ${datePickerControl({ name: 'date', value: income.date || todayInput(), required: true })}
      </div>
      <div class="field">
        <span>No. Kuitansi</span>
        <div class="readonly-value">${escapeHtml(income.receiptNo || 'Otomatis saat disimpan')}</div>
      </div>
      <label class="field">
        <span>Nama pembayar</span>
        <input name="payerName" value="${escapeHtml(income.payerName || '')}" placeholder="Nama pelanggan/perusahaan" required>
      </label>
      <div class="field">
        <span>PPN</span>
        <label class="inline-check">
          <input name="taxEnabled" data-tax-enabled type="checkbox" ${taxChecked ? 'checked' : ''}>
          Enable PPN
        </label>
      </div>
      <label class="field">
        <span>PPN %</span>
        <input name="taxRate" data-tax-rate type="number" min="0" max="100" step="0.01" value="${escapeHtml(taxRate)}" ${taxChecked ? '' : 'disabled'}>
      </label>
      <label class="field">
        <span>Metode</span>
        <select name="paymentMethod">
          ${optionList(PAYMENT_METHODS.includes(method) ? PAYMENT_METHODS : [method, ...PAYMENT_METHODS], method)}
        </select>
      </label>
      <label class="field full">
        <span>Catatan transaksi</span>
        <textarea name="description">${escapeHtml(income.description || '')}</textarea>
      </label>
    </div>
    <div class="batch-toolbar">
      <span>Item barang/jasa dalam satu kuitansi.</span>
      <button class="ghost-button compact" type="button" data-add-row>Tambah Item</button>
    </div>
    <div class="batch-rows" id="incomeRows">
      ${(items.length ? items : [{}]).map((item) => incomeItemRow(item)).join('')}
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan</button>
    </div>
  `;
}

function externalIncomeBatchFormBody() {
  return `
    <div class="form-grid">
      <div class="field">
        <span>Tanggal</span>
        ${datePickerControl({ name: 'date', value: todayInput(), required: true })}
      </div>
      <div class="field">
        <span>No. Kuitansi</span>
        <div class="readonly-value">Otomatis saat disimpan</div>
      </div>
      <label class="field">
        <span>Nama pembayar</span>
        <input name="payerName" placeholder="Nama pelanggan/perusahaan" required>
      </label>
      <div class="field">
        <span>PPN</span>
        <label class="inline-check">
          <input name="taxEnabled" data-tax-enabled type="checkbox">
          Enable PPN
        </label>
      </div>
      <label class="field">
        <span>PPN %</span>
        <input name="taxRate" data-tax-rate type="number" min="0" max="100" step="0.01" value="11" disabled>
      </label>
      <label class="field">
        <span>Metode</span>
        <select name="paymentMethod">${optionList(PAYMENT_METHODS, 'Tunai')}</select>
      </label>
      <label class="field full">
        <span>Catatan transaksi</span>
        <textarea name="description"></textarea>
      </label>
    </div>
    <div class="batch-toolbar">
      <span>Item barang/jasa dalam satu kuitansi.</span>
      <button class="ghost-button compact" type="button" data-add-row>Tambah Item</button>
    </div>
    <div class="batch-rows" id="incomeRows">
      ${incomeItemRow()}
      ${incomeItemRow()}
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan Semua</button>
    </div>
  `;
}

function openExternalIncomeModal(income = null) {
  openModal(income ? 'Edit Pemasukan' : 'Tambah Pemasukan', income ? externalIncomeFormBody(income) : externalIncomeBatchFormBody(), async (payload, form) => {
    const transactionPayload = collectExternalIncomePayload(form, payload);
    if (income) {
      await api(`/api/external-incomes/${encodeURIComponent(income.id)}`, {
        method: 'PUT',
        body: JSON.stringify(transactionPayload)
      });
      setToast('Pemasukan diperbarui');
    } else {
      const result = await api('/api/external-incomes', {
        method: 'POST',
        body: JSON.stringify(transactionPayload)
      });
      setToast(`${result.created || 0} transaksi pemasukan tersimpan`);
    }
    renderExternalIncomes();
  });
  bindBatchRows(modal.querySelector('.modal-frame'), 'incomeRows', incomeItemRow, 'Item');
  bindTaxControls(modal.querySelector('.modal-frame'));
}

function receiptBody(income) {
  const amountText = rupiah(income.amount);
  const items = incomeItems(income);
  const signerName = receiptSignerName(income);
  const branding = currentBranding();
  const itemRows = items.map((item, index) => `
    <div class="receipt-item-row">
      <span>${escapeHtml(index + 1)}. ${escapeHtml(item.itemName || 'Item')}<small>${escapeHtml(item.category || 'Barang/Jasa')}${item.description ? ` - ${escapeHtml(item.description)}` : ''}</small></span>
      <span>${escapeHtml(quantityText(item.quantity))} pcs x ${escapeHtml(rupiah(item.unitPrice))}</span>
      <strong>${escapeHtml(rupiah(item.amount))}</strong>
    </div>
  `).join('');
  const taxLine = hasTax(income)
    ? `
        <div><span>Subtotal</span><strong>${escapeHtml(rupiah(subtotalAmount(income)))}</strong></div>
        <div><span>PPN ${escapeHtml(percentText(income.taxRate))}%</span><strong>${escapeHtml(rupiah(income.taxAmount))}</strong></div>
      `
    : '';
  const cancelled = incomeIsCancelled(income);
  const printMode = safeReceiptPrintMode(state.receiptPrintMode || 'a4');
  return `
    <div class="receipt-preview receipt-printable print-mode-${printMode} ${cancelled ? 'is-cancelled' : ''}">
      <div class="receipt-head">
        <img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.businessName)}">
        <div>
          <strong>${escapeHtml(branding.businessName)}</strong>
          <span>${escapeHtml(brandingPrintLabel('Kuitansi Penerimaan Pembayaran', branding))}</span>
        </div>
      </div>
      ${cancelled ? '<div class="receipt-cancelled">BATAL</div>' : ''}
      <div class="receipt-title">KUITANSI</div>
      <div class="receipt-no">No: ${escapeHtml(income.receiptNo || '-')}</div>
      <div class="receipt-lines">
        <div><span>Telah diterima dari</span><strong>${escapeHtml(income.payerName || '-')}</strong></div>
        <div><span>Uang sejumlah</span><strong>${escapeHtml(amountText)}</strong></div>
        ${taxLine}
        <div><span>Untuk pembayaran</span><strong>${escapeHtml(incomeItemsText(income))}</strong></div>
        <div><span>Keterangan</span><strong>${escapeHtml(income.description || '-')}</strong></div>
        <div><span>Metode</span><strong>${escapeHtml(income.paymentMethod || '-')}</strong></div>
        <div><span>Tanggal</span><strong>${dateText(income.date)}</strong></div>
      </div>
      <div class="receipt-items">
        <div class="receipt-item-head">
          <span>Item Barang/Jasa</span>
          <span>Qty x Harga</span>
          <strong>Nominal</strong>
        </div>
        ${itemRows}
      </div>
      <div class="receipt-total">
        <span>Total diterima</span>
        <strong>${escapeHtml(amountText)}</strong>
      </div>
      <div class="receipt-sign">
        <div></div>
        <div>
          <span>${escapeHtml(branding.businessName)}</span>
          <strong>${escapeHtml(signerName)}</strong>
        </div>
      </div>
    </div>
    <div class="modal-actions receipt-actions">
      ${receiptPrintModeControl('incomeReceiptPrintMode', printMode)}
      <button class="ghost-button" value="cancel" type="submit">Tutup</button>
      <button class="button" id="printReceipt" type="button">Print Kuitansi</button>
    </div>
  `;
}

function openReceiptModal(income) {
  openModal('Pratinjau Kuitansi', receiptBody(income), async () => {});
  const modeInput = document.getElementById('incomeReceiptPrintMode');
  modeInput?.addEventListener('change', () => setReceiptPrintMode(modeInput.value));
  setReceiptPrintMode(modeInput?.value || state.receiptPrintMode || 'a4');
  document.getElementById('printReceipt')?.addEventListener('click', () => {
    printReceiptWithMode('printing-receipt', modeInput?.value || state.receiptPrintMode || 'a4');
  });
}

function roleOptions(selected) {
  return state.roles.map((role) => `
    <option value="${escapeHtml(role.value)}" ${role.value === selected ? 'selected' : ''}>${escapeHtml(role.label)}</option>
  `).join('');
}

const USER_POSITION_OPTIONS = Object.freeze({
  admin: ['CEO/Direktur'],
  owner: ['CEO/Direktur'],
  finance: ['Kepala Subbagian Keuangan dan Aset'],
  secretary: ['Sekretaris'],
  technician: ['Kepala Teknisi dan Perlengkapan', 'Staf Teknisi dan Perlengkapan'],
  noc: ['Kepala Teknisi dan Perlengkapan', 'Staf Teknisi dan Perlengkapan'],
  collector: ['Staf Penagihan'],
  reseller_voucher: ['Reseller Voucher'],
  viewer: ['Staf']
});

function userPositionOptions(role = 'viewer', selected = '') {
  const options = [...(USER_POSITION_OPTIONS[role] || ['Staf'])];
  const current = String(selected || '').trim();
  const effective = options.includes(current) ? current : options[0];
  return options.map((position) => `
    <option value="${escapeHtml(position)}" ${position === effective ? 'selected' : ''}>${escapeHtml(position)}</option>
  `).join('');
}

function expenseFormBody(expense = {}) {
  const method = expense.paymentMethod || 'Tunai';
  const items = expenseItems(expense);
  const payee = expensePayeeText(expense) === '-' ? '' : expensePayeeText(expense);
  const referenceNo = expenseReferenceText(expense);
  return `
    <div class="form-grid">
      <div class="field">
        <span>Tanggal</span>
        ${datePickerControl({ name: 'date', value: expense.date || todayInput(), required: true })}
      </div>
      <label class="field">
        <span>Penerima/Tujuan Pembayaran</span>
        <input name="payee" value="${escapeHtml(payee)}" placeholder="Karyawan, vendor, PLN, pemilik sewa">
      </label>
      <label class="field">
        <span>No. Nota/Slip/Ref</span>
        <input name="noteNo" value="${escapeHtml(referenceNo)}" placeholder="Opsional">
      </label>
      <label class="field">
        <span>Metode</span>
        <select name="paymentMethod">
          ${optionList(PAYMENT_METHODS.includes(method) ? PAYMENT_METHODS : [method, ...PAYMENT_METHODS], method)}
        </select>
      </label>
      <label class="field full">
        <span>Catatan transaksi</span>
        <textarea name="description">${escapeHtml(expense.description || '')}</textarea>
      </label>
    </div>
    <div class="batch-toolbar">
      <span>Rincian pengeluaran dalam satu transaksi.</span>
      <button class="ghost-button compact" type="button" data-add-row>Tambah Rincian</button>
    </div>
    <div class="batch-rows" id="expenseRows">
      ${(items.length ? items : [{}]).map((item) => expenseItemRow(item)).join('')}
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan</button>
    </div>
  `;
}

function expenseBatchFormBody() {
  return `
    <div class="form-grid">
      <div class="field">
        <span>Tanggal</span>
        ${datePickerControl({ name: 'date', value: todayInput(), required: true })}
      </div>
      <label class="field">
        <span>Penerima/Tujuan Pembayaran</span>
        <input name="payee" placeholder="Karyawan, vendor, PLN, pemilik sewa">
      </label>
      <label class="field">
        <span>No. Nota/Slip/Ref</span>
        <input name="noteNo" placeholder="Opsional">
      </label>
      <label class="field">
        <span>Metode</span>
        <select name="paymentMethod">${optionList(PAYMENT_METHODS, 'Tunai')}</select>
      </label>
      <label class="field full">
        <span>Catatan transaksi</span>
        <textarea name="description"></textarea>
      </label>
    </div>
    <div class="batch-toolbar">
      <span>Rincian pengeluaran dalam satu transaksi.</span>
      <button class="ghost-button compact" type="button" data-add-row>Tambah Rincian</button>
    </div>
    <div class="batch-rows" id="expenseRows">
      ${expenseItemRow()}
      ${expenseItemRow()}
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan Pengeluaran</button>
    </div>
  `;
}

function openExpenseModal(expense = null) {
  openModal(expense ? 'Edit Pengeluaran' : 'Tambah Pengeluaran', expense ? expenseFormBody(expense) : expenseBatchFormBody(), async (payload, form) => {
    const expensePayload = collectExpensePayload(form, payload);
    if (expense) {
      await api(`/api/expenses/${encodeURIComponent(expense.id)}`, {
        method: 'PUT',
        body: JSON.stringify(expensePayload)
      });
      setToast('Pengeluaran diperbarui');
    } else {
      const result = await api('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(expensePayload)
      });
      setToast(`${result.created || 0} transaksi pengeluaran tersimpan`);
    }
    renderExpenses();
  });
  bindBatchRows(modal.querySelector('.modal-frame'), 'expenseRows', expenseItemRow, 'Rincian');
}

async function renderInventory(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat inventaris...</div>';
  const params = queryString({
    search: state.search,
    status: 'all',
    page: state.inventoryPage,
    limit: state.inventoryLimit
  });
  const { items, movements, summary, pagination = { page: 1, totalPages: 1, total: 0, limit: state.inventoryLimit } } = await api(`/api/inventory?${params}`);
  state.inventoryPage = Number(pagination.page || 1);
  state.inventoryLimit = pagerLimitValue(pagination.limit || state.inventoryLimit || 10, 10);
  const writeAllowed = can('inventory:write');
  const stockAlertCount = Number(summary.lowStockCount || 0) + Number(summary.outOfStockCount || 0);

  app.innerHTML = `
    <div class="stack">
      <section class="metrics">
        ${metric('Jenis barang', String(summary.itemCount || 0), 'Item aktif')}
        ${metric('Total unit', String(summary.totalUnits || 0), 'Akumulasi stok')}
        ${metric('Stok minimum', String(summary.lowStockCount || 0), 'Perlu restock', summary.lowStockCount ? 'warning-card' : '')}
        ${metric('Stok kosong', String(summary.outOfStockCount || 0), 'Tidak tersedia', summary.outOfStockCount ? 'negative' : '')}
      </section>

      ${writeAllowed && stockAlertCount ? `
        <section class="notice warning inventory-stock-alert">
          <span class="stock-alert-icon" aria-hidden="true"></span>
          <div>
            <strong>${escapeHtml(stockAlertCount)} barang perlu dicek stoknya</strong>
            <span>Gunakan Barang Masuk untuk restock atau Barang Keluar saat teknisi/admin mengambil barang.</span>
          </div>
        </section>
      ` : ''}

      <div class="toolbar">
        <div class="filters">
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari barang, lokasi, vendor" autocomplete="off">
        </div>
        ${writeAllowed ? '<button class="button" id="addInventory" type="button">Tambah Barang</button>' : ''}
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Barang</th>
              <th>Kategori</th>
              <th>Stok</th>
              <th>Lokasi</th>
              <th>Vendor</th>
              <th>Status</th>
              ${writeAllowed ? '<th>Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map((item) => `
              <tr>
                <td>
                  <strong>${escapeHtml(item.name)}</strong>
                  <div class="muted">${escapeHtml(item.sku || '-')}</div>
                </td>
                <td>${escapeHtml(item.category || '-')}</td>
                <td class="amount ${stockTone(item)}">${escapeHtml(item.quantity || 0)} ${escapeHtml(item.unit || 'pcs')}<div class="muted">Min. ${escapeHtml(item.minimumStock || 0)}</div></td>
                <td>${escapeHtml(item.location || '-')}</td>
                <td>${escapeHtml(item.vendor || '-')}</td>
                <td><span class="badge ${badgeClass(item.status)}">${operationalStatusLabel(item.status)}</span></td>
                ${writeAllowed ? `
                  <td>
                    <div class="row-actions">
                      <button class="ghost-button compact" type="button" data-stock-in="${escapeHtml(item.id)}">Barang Masuk</button>
                      <button class="ghost-button compact" type="button" data-stock-out="${escapeHtml(item.id)}">Barang Keluar</button>
                      <button class="ghost-button compact" type="button" data-edit-inventory="${escapeHtml(item.id)}">Edit</button>
                    </div>
                  </td>
                ` : ''}
              </tr>
            `).join('') : `<tr><td colspan="${writeAllowed ? 7 : 6}">Belum ada barang inventaris.</td></tr>`}
          </tbody>
        </table>
      </div>

      ${inventoryPaginationControls(pagination)}
    </div>
  `;

  document.getElementById('addInventory')?.addEventListener('click', () => openInventoryModal());
  if (writeAllowed) {
    app.querySelectorAll('[data-stock-in], [data-stock-out]').forEach((button) => {
      button.addEventListener('click', () => {
        const itemId = button.dataset.stockIn || button.dataset.stockOut;
        const item = items.find((entry) => entry.id === itemId);
        if (item) {
          openStockMovementModal(item, button.dataset.stockOut ? 'out' : 'in');
        }
      });
    });
    app.querySelectorAll('[data-edit-inventory]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = items.find((entry) => entry.id === button.dataset.editInventory);
        if (item) openInventoryModal(item);
      });
    });
  }
  bindSearch((renderOptions = {}) => {
    state.inventoryPage = 1;
    return renderInventory(renderOptions);
  });
  app.querySelectorAll('[data-inventory-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.inventoryPage = Math.max(1, Number(button.dataset.inventoryPage || 1));
      renderInventory();
    });
  });
  bindPagerLimit('inventory', (limit) => {
    state.inventoryLimit = limit;
  }, (page) => {
    state.inventoryPage = page;
  }, renderInventory, 10);
}

function inventoryFormBody(item = {}) {
  const categories = ['CPE', 'STB', 'Passive FO', 'Material Instalasi', 'Aksesoris', 'Tools', 'Router', 'ONU/ONT', 'Kabel', 'Switch', 'Konektor', 'Lainnya'];
  const units = ['pcs', 'meter', 'roll', 'unit', 'pack'];
  const statuses = ['active', 'maintenance', 'inactive'];
  return `
    <div class="form-grid">
      <label class="field">
        <span>Nama barang</span>
        <input name="name" value="${escapeHtml(item.name || '')}" required>
      </label>
      <label class="field">
        <span>SKU/Kode</span>
        <input name="sku" value="${escapeHtml(item.sku || '')}">
      </label>
      <label class="field">
        <span>Kategori</span>
        <select name="category">${optionList(categories.includes(item.category) ? categories : [item.category, ...categories].filter(Boolean), item.category || 'CPE')}</select>
      </label>
      <label class="field">
        <span>Satuan</span>
        <select name="unit">${optionList(units.includes(item.unit) ? units : [item.unit, ...units].filter(Boolean), item.unit || 'pcs')}</select>
      </label>
      <label class="field">
        <span>Stok saat ini</span>
        <input name="quantity" type="number" min="0" step="1" value="${escapeHtml(item.quantity ?? 0)}">
      </label>
      <label class="field">
        <span>Minimum stok</span>
        <input name="minimumStock" type="number" min="0" step="1" value="${escapeHtml(item.minimumStock ?? 0)}">
      </label>
      <label class="field">
        <span>Lokasi</span>
        <input name="location" value="${escapeHtml(item.location || 'Gudang')}">
      </label>
      <label class="field">
        <span>Vendor</span>
        <input name="vendor" value="${escapeHtml(item.vendor || '')}">
      </label>
      <label class="field">
        <span>Status</span>
        <select name="status">
          ${statuses.map((status) => `<option value="${status}" ${status === (item.status || 'active') ? 'selected' : ''}>${operationalStatusLabel(status)}</option>`).join('')}
        </select>
      </label>
      <label class="field full">
        <span>Catatan</span>
        <textarea name="notes">${escapeHtml(item.notes || '')}</textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan</button>
    </div>
  `;
}

function openInventoryModal(item = null) {
  openModal(item ? 'Edit Barang' : 'Tambah Barang', inventoryFormBody(item || {}), async (payload) => {
    await api(item ? `/api/inventory/${encodeURIComponent(item.id)}` : '/api/inventory', {
      method: item ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    setToast(item ? 'Barang diperbarui' : 'Barang ditambahkan');
    refreshNotifications({ force: true });
    renderInventory();
  });
}

function stockMovementFormBody(item, type) {
  const actorName = state.auth?.name || state.auth?.username || '-';
  return `
    <div class="form-grid">
      <div class="field">
        <span>Barang</span>
        <div class="readonly-value">${escapeHtml(item.name)} · stok ${escapeHtml(item.quantity || 0)} ${escapeHtml(item.unit || 'pcs')}</div>
      </div>
      <label class="field">
        <span>Jenis</span>
        <select name="type">
          <option value="in" ${type === 'in' ? 'selected' : ''}>Barang Masuk</option>
          <option value="out" ${type === 'out' ? 'selected' : ''}>Barang Keluar</option>
        </select>
      </label>
      <div class="field">
        <span>Tanggal</span>
        ${datePickerControl({ name: 'at', value: todayInput() })}
      </div>
      <label class="field">
        <span>Jumlah</span>
        <input name="quantity" type="number" min="1" step="1" required>
      </label>
      <div class="field full">
        <span>Update oleh</span>
        <div class="readonly-value">${escapeHtml(actorName)}</div>
      </div>
      <label class="field full">
        <span>Catatan</span>
        <textarea name="notes" placeholder="Opsional: tiket, pemasangan, pembelian, retur"></textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan Mutasi</button>
    </div>
  `;
}

function openStockMovementModal(item, type = 'in') {
  openModal(type === 'out' ? 'Barang Keluar' : 'Barang Masuk', stockMovementFormBody(item, type), async (payload) => {
    await api(`/api/inventory/${encodeURIComponent(item.id)}/movements`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setToast('Mutasi stok tersimpan');
    refreshNotifications({ force: true });
    renderInventory();
  });
}

async function renderNetworkAssets(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat aset...</div>';
  const params = queryString({
    search: state.search,
    status: 'all'
  });
  const { assets, summary } = await api(`/api/network-assets?${params}`);
  const writeAllowed = can('network-assets:write');

  app.innerHTML = `
    <div class="stack">
      <section class="metrics">
        ${metric('Aset aktif', String(summary.assetCount || 0), 'Perangkat tercatat')}
        ${metric('Baik', String(summary.activeCount || 0), 'Siap digunakan', 'positive')}
        ${metric('Maintenance', String(summary.maintenanceCount || 0), 'Butuh perhatian', summary.maintenanceCount ? 'warning-card' : '')}
        ${metric('Rusak', String(summary.damagedCount || 0), 'Perlu diganti', summary.damagedCount ? 'negative' : '')}
        ${metric('Hilang', String(summary.lostCount || 0), 'Perlu ditindaklanjuti', summary.lostCount ? 'negative' : '')}
      </section>

      <div class="toolbar">
        <div class="filters">
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari aset, jenis, lokasi, PIC" autocomplete="off">
        </div>
        ${writeAllowed ? '<button class="button" id="addNetworkAsset" type="button">Tambah Aset</button>' : ''}
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Aset</th>
              <th>Jenis</th>
              <th>Lokasi</th>
              <th>Brand/Model</th>
              <th>Serial</th>
              <th>PIC</th>
              <th>Kondisi</th>
              ${writeAllowed ? '<th>Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${assets.length ? assets.map((asset) => `
              <tr>
                <td>
                  <strong>${escapeHtml(asset.name)}</strong>
                  <div class="muted">${escapeHtml(asset.notes || '-')}</div>
                </td>
                <td>${escapeHtml(asset.type || '-')}</td>
                <td>${escapeHtml(asset.site || asset.location || '-')}</td>
                <td>${escapeHtml([asset.brand, asset.model].filter(Boolean).join(' / ') || '-')}</td>
                <td>${escapeHtml(asset.serialNumber || '-')}</td>
                <td>${escapeHtml(asset.owner || '-')}</td>
                <td><span class="badge ${badgeClass(asset.status)}">${operationalStatusLabel(asset.status)}</span></td>
                ${writeAllowed ? `
                  <td>
                    <div class="row-actions">
                      <button class="ghost-button compact" type="button" data-edit-asset="${escapeHtml(asset.id)}">Edit</button>
                      <button class="danger-button compact" type="button" data-delete-asset="${escapeHtml(asset.id)}">Arsip</button>
                    </div>
                  </td>
                ` : ''}
              </tr>
            `).join('') : `<tr><td colspan="${writeAllowed ? 8 : 7}">Belum ada aset.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('addNetworkAsset')?.addEventListener('click', () => openNetworkAssetModal());
  if (writeAllowed) {
    app.querySelectorAll('[data-edit-asset]').forEach((button) => {
      button.addEventListener('click', () => {
        const asset = assets.find((entry) => entry.id === button.dataset.editAsset);
        if (asset) openNetworkAssetModal(asset);
      });
    });
    app.querySelectorAll('[data-delete-asset]').forEach((button) => {
      button.addEventListener('click', async () => {
        const asset = assets.find((entry) => entry.id === button.dataset.deleteAsset);
        if (!asset) return;
        if (!window.confirm(`Arsipkan aset ${asset.name}?`)) return;
        await api(`/api/network-assets/${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
        setToast('Aset diarsipkan');
        renderNetworkAssets();
      });
    });
  }
  bindSearch(renderNetworkAssets);
}

function radiusStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();
  const labels = {
    active: 'Aktif',
    online: 'Online',
    up: 'Online',
    inactive: 'Tidak aktif',
    disabled: 'Disable',
    pending: 'Belum Bayar',
    suspend: 'Isolir',
    isolir: 'Isolir',
    suspended: 'Isolir',
    isolated: 'Isolir',
    terminate: 'Terminated',
    terminated: 'Terminated',
    removed: 'Cabut',
    cabut: 'Cabut',
    expired: 'Expired'
  };
  return labels[normalized] || status || '-';
}

function radiusStatusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'online', 'up', 'connected'].includes(normalized)) return 'active';
  if (['suspend', 'isolir', 'suspended', 'isolated', 'expired', 'pending'].includes(normalized)) return 'pending';
  if (['inactive', 'disabled', 'down', 'terminate', 'terminated', 'removed', 'cabut'].includes(normalized)) return 'inactive';
  return '';
}

function internetAccessTypeLabel(internet = {}) {
  const raw = String(internet.accessType || internet.serviceType || '').trim();
  const normalized = raw.toLowerCase();
  if (normalized === 'dhcp') return 'DHCP';
  if (['pppoe', 'ppp', 'ppp-dhcp'].includes(normalized)) return 'PPPoE';
  if (normalized === 'hotspot') return 'Hotspot';
  return raw || '-';
}

function expiredModeLabel(mode = 'none') {
  const normalized = String(mode || 'none').toLowerCase();
  return {
    none: 'None',
    remove: 'Remove',
    'remove-record': 'Remove & Record',
    notice: 'Notice',
    'notice-record': 'Notice & Record'
  }[normalized] || 'None';
}

function radiusDate(value) {
  return value ? dateTimeText(value) : '-';
}

function radiusTabButtons(active, tabs, prefix) {
  return `
    <div class="tab-switcher" role="tablist" aria-label="Tab Radius">
      ${tabs.map((tab) => `
        <button class="tab-button ${active === tab.value ? 'is-active' : ''}" type="button" data-${prefix}-tab="${escapeHtml(tab.value)}">
          ${escapeHtml(tab.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function radiusSummary(payload = {}, labels = {}) {
  const topInfo = payload.topInfo || {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const total = Number(topInfo.total || payload.pagination?.total || rows.length || 0);
  const active = Number(topInfo.active || rows.filter((row) => ['active', 'online', 'up'].includes(String(row.status || '').toLowerCase())).length || 0);
  const suspend = Number(topInfo.suspend || rows.filter((row) => ['suspend', 'suspended', 'isolated'].includes(String(row.status || '').toLowerCase())).length || 0);
  const terminate = Number(topInfo.terminate || rows.filter((row) => ['terminate', 'terminated'].includes(String(row.status || '').toLowerCase())).length || 0);
  return `
    <section class="metrics">
      ${metric(labels.total || 'Total', displayNumber(total), labels.totalSub || 'Data Radius')}
      ${metric(labels.active || 'Aktif', displayNumber(active), labels.activeSub || 'Online/aktif', active ? 'positive' : '')}
      ${metric(labels.suspend || 'Isolir', displayNumber(suspend), labels.suspendSub || 'Suspend/isolir', suspend ? 'warning-card' : '')}
      ${metric(labels.terminate || 'Terminate', displayNumber(terminate), labels.terminateSub || 'Diberhentikan', terminate ? 'negative' : '')}
    </section>
  `;
}

function hotspotRadiusSummary(payload = {}) {
  const topInfo = payload.topInfo || {};
  return `
    <section class="metrics radius-hotspot-summary">
      ${metric('Tersedia', displayNumber(topInfo.available || 0), 'Belum pernah digunakan')}
      ${metric('Aktif', displayNumber(topInfo.running || 0), 'Masa berlaku berjalan', Number(topInfo.running || 0) ? 'positive' : '')}
      ${metric('Online', displayNumber(topInfo.online || 0), 'Session tersambung', Number(topInfo.online || 0) ? 'positive' : '')}
      ${metric('Offline', displayNumber(topInfo.offline || 0), 'Session tidak tersambung')}
    </section>
  `;
}

function radiusOptionTags(options = [], selected = '', emptyLabel = 'Semua') {
  return [
    `<option value="" ${!selected ? 'selected' : ''}>${escapeHtml(emptyLabel)}</option>`,
    ...options.map((option) => `
      <option value="${escapeHtml(option.value)}" ${String(option.value) === String(selected || '') ? 'selected' : ''}>${escapeHtml(option.label)}</option>
    `)
  ].join('');
}

function radiusProfileMissing(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'none';
}

function bindRequiredRadiusProfileWarning(selector, label = 'Radius') {
  const select = modalBody.querySelector(selector);
  if (!select) return () => true;
  const warn = () => {
    if (radiusProfileMissing(select.value)) {
      setToast(`Profile ${label} wajib dipilih, tidak boleh None`);
      return false;
    }
    return true;
  };
  select.addEventListener('change', () => {
    if (radiusProfileMissing(select.value)) warn();
  });
  return warn;
}

function radiusProfileOptions(rows = []) {
  return rows
    .filter((row) => row && row.name)
    .map((row) => ({
      label: row.name,
      value: row.name,
      id: row.id || row.uuid || '',
      price: row.price || 0,
      onlineNasId: row.online?.nasId || row.onlineNasId || row.nasId || '',
      onlineNasName: row.online?.nasName || row.onlineNasName || row.nasName || ''
    }));
}

function radiusNasOptions(rows = []) {
  return rows
    .filter((row) => row && (row.name || row.ipAddress))
    .map((row) => ({
      label: row.name || row.ipAddress,
      value: row.name || row.ipAddress,
      ip: row.ipAddress || row.name || '',
      id: row.id || row.uuid || ''
    }));
}

async function loadRadiusNasOptions() {
  const payload = await api(`/api/radius/settings?${queryString({ page: 1, limit: 100, refresh: '1' })}`).catch(() => ({ rows: [] }));
  return radiusNasOptions(payload.rows || []);
}

function currentUserLockedNasOptions(nasOptions = []) {
  const ids = Array.isArray(state.auth?.lockedNasIds) && state.auth.lockedNasIds.length
    ? state.auth.lockedNasIds
    : [state.auth?.lockedNasId || state.auth?.resellerNasId || ''].filter(Boolean);
  const labels = String(state.auth?.lockedNasNames || state.auth?.lockedNasName || '')
    .split(',')
    .map((item) => item.trim());
  return ids.map((lockedNasId, index) => nasOptions.find((item) => (
    [item.id, item.value, item.ip].some((value) => String(value || '') === String(lockedNasId))
  )) || {
    id: String(lockedNasId),
    value: String(lockedNasId),
    ip: '',
    label: labels[index] || String(lockedNasId)
  }).filter((item) => item && item.id !== 'all');
}

function currentUserLockedNasOption(nasOptions = []) {
  return currentUserLockedNasOptions(nasOptions)[0] || null;
}

function profileAllowedForLockedNas(profile = {}, lockedNas = null) {
  if (!lockedNas) return true;
  const allowed = [lockedNas.id, lockedNas.value, lockedNas.ip, lockedNas.label]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const profileNas = String(profile.onlineNasId || profile.nasId || '').trim();
  return !profileNas || allowed.includes(profileNas);
}

function radiusProfilesForLockedNas(options = {}, lockedNas = null) {
  const lockedRows = Array.isArray(lockedNas) ? lockedNas.filter(Boolean) : [lockedNas].filter(Boolean);
  if (!lockedRows.length) return options.profiles || [];
  return (options.profiles || []).filter((profile) => lockedRows.some((nas) => profileAllowedForLockedNas(profile, nas)));
}

function resellerNasTargetField(inputName = 'nasId', nasOptions = [], selected = '', label = 'NAS') {
  const rows = Array.isArray(nasOptions) ? nasOptions.filter(Boolean) : [];
  if (!rows.length) return '';
  if (rows.length === 1) return lockedNasReadonlyField(inputName, rows[0], label);
  const options = rows.map((nas) => ({
    value: nas.id || nas.value || nas.ip || '',
    label: nas.ip && nas.ip !== nas.label ? `${nas.label} (${nas.ip})` : nas.label
  }));
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(inputName)}" data-reseller-operation-nas required>
        ${radiusOptionTags(options, selected, 'Pilih NAS tujuan')}
      </select>
    </label>
  `;
}

function bindResellerOperationNasProfile(options = {}, initialProfile = '') {
  if (state.auth?.role !== 'reseller_voucher') return;
  const nasSelect = modalBody.querySelector('[data-reseller-operation-nas]');
  const profileSelect = modalBody.querySelector('select[name="profile"]');
  if (!nasSelect || !profileSelect) return;
  const allowedNas = currentUserLockedNasOptions(options.nas || []);
  const sync = (notify = false) => {
    const selectedNas = allowedNas.find((nas) => [nas.id, nas.value, nas.ip].some((value) => String(value || '') === String(nasSelect.value || '')));
    const profileRows = selectedNas ? radiusProfilesForLockedNas(options, selectedNas) : [];
    const preferred = profileRows.some((profile) => String(profile.value) === String(profileSelect.value || initialProfile))
      ? (profileSelect.value || initialProfile)
      : '';
    profileSelect.innerHTML = radiusOptionTags(profileRows, preferred, 'Pilih Profile');
    profileSelect.disabled = !selectedNas;
    if (notify) profileSelect.dispatchEvent(new Event('change', { bubbles: true }));
  };
  nasSelect.addEventListener('change', () => sync(true));
  sync();
}

function lockedNasReadonlyField(inputName = 'nasId', nas = null, label = 'NAS') {
  if (!nas) return '';
  const value = nas.id || nas.value || nas.ip || '';
  const ip = String(nas.ip || '').trim();
  const looksInternalId = ip && (ip === value || /^mon_[a-z0-9_]+$/i.test(ip));
  const text = ip && ip !== nas.label && !looksInternalId ? `${nas.label} (${ip})` : nas.label;
  return `
    <div class="field">
      <span>${escapeHtml(label)}</span>
      <div class="readonly-value">${escapeHtml(text || value || '-')}</div>
      <input type="hidden" name="${escapeHtml(inputName)}" value="${escapeHtml(value)}">
    </div>
  `;
}

function nasTargetChoiceMarkup(options = [], selected = []) {
  const selectedValues = Array.isArray(selected)
    ? selected.map((value) => String(value || ''))
    : String(selected || '').split(',').map((value) => value.trim()).filter(Boolean);
  const selectedSet = new Set(selectedValues);
  const rows = [
    {
      value: 'all',
      label: 'Semua NAS',
      detail: 'Seluruh NAS yang tersedia',
      all: true
    },
    ...options.map((item) => ({
      value: String(item.id || item.value || item.ip || ''),
      label: item.label || item.name || item.ip || '-',
      detail: item.ip && item.ip !== item.label ? item.ip : '',
      all: false
    })).filter((item) => item.value)
  ];
  return `
    <div class="nas-target-picker" data-nas-target-picker>
      <div class="nas-target-picker-head">
        <input class="control compact" type="search" data-nas-target-search placeholder="Cari NAS" autocomplete="off">
        <strong data-nas-target-count>0 NAS dipilih</strong>
      </div>
      <div class="nas-target-choice-grid">
        ${rows.map((item) => `
          <label class="nas-target-choice" data-nas-target-choice data-nas-target-text="${escapeHtml(`${item.label} ${item.detail}`.toLowerCase())}" ${item.all ? 'data-all-nas-choice' : ''}>
            <input type="checkbox" name="lockedNasIds" value="${escapeHtml(item.value)}" data-multi-value ${selectedSet.has(item.value) ? 'checked' : ''}>
            <span>
              <strong>${escapeHtml(item.label)}</strong>
              ${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}
            </span>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

function clearRadiusOptionsCache(section = '') {
  if (!section) {
    radiusOptionsCache.clear();
    return;
  }
  radiusOptionsCache.delete(section);
}

async function loadRadiusOptions(section = 'ppp', options = {}) {
  const cacheKey = section === 'hotspot' ? 'hotspot' : 'ppp';
  const cached = radiusOptionsCache.get(cacheKey);
  if (!options.refresh && cached && (Date.now() - cached.time) < RADIUS_OPTIONS_CACHE_TTL_MS) {
    return cached.value;
  }
  const profilePath = section === 'hotspot' ? '/api/radius/hotspot' : '/api/radius/ppp-dhcp';
  const refresh = options.refresh ? '1' : '';
  const [profilesPayload, nasPayload] = await Promise.all([
    api(`${profilePath}?${queryString({ tab: 'profiles', page: 1, limit: 100, refresh })}`).catch(() => ({ rows: [] })),
    api(`/api/radius/settings?${queryString({ page: 1, limit: 100, refresh })}`).catch(() => ({ rows: [] }))
  ]);
  const value = {
    profiles: radiusProfileOptions(profilesPayload.rows || []),
    nas: radiusNasOptions(nasPayload.rows || [])
  };
  radiusOptionsCache.set(cacheKey, { time: Date.now(), value });
  return value;
}

function radiusStatusFilterOptions(section = 'ppp') {
  const options = [
    { value: 'active', label: 'Aktif' },
    { value: 'suspend', label: 'Isolir' },
    { value: 'disabled', label: 'Disable' },
    { value: 'terminate', label: 'Terminate' }
  ];
  if (section === 'ppp') {
    options.push({ value: 'psb', label: 'Pasang Baru' });
  }
  return options;
}

function hotspotVoucherBusinessName() {
  return state.branding.businessName || state.settings.businessName || DEFAULT_BUSINESS_NAME;
}

function hotspotVoucherAppSubtitle() {
  return state.branding.appSubtitle || state.settings.appSubtitle || DEFAULT_APP_SUBTITLE;
}

function hotspotVoucherLogoUrl() {
  return safeLogoUrl(state.branding.logoUrl || state.settings.logoUrl || DEFAULT_LOGO_URL);
}

function hotspotVoucherLoginUrl(row = {}) {
  return safePublicUrl(row.hotspotLoginUrl || '');
}

function hotspotVoucherDirectLoginUrl(row = {}) {
  const baseUrl = hotspotVoucherLoginUrl(row);
  const username = String(row.username || '').trim();
  const password = String(row.password || row.voucherPassword || username).trim();
  if (!username || !baseUrl) return '';
  try {
    const url = new URL(baseUrl);
    if (!url.pathname || url.pathname === '/') url.pathname = '/login';
    url.search = '';
    url.search = new URLSearchParams({ username, password }).toString();
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function hotspotVoucherAdminPhone() {
  const raw = String(
    state.hotspotVoucherAdminPhone
    || state.settings?.publicInfo?.contactPhone
    || ''
  ).replace(/\D/g, '');
  if (raw.startsWith('62')) return `0${raw.slice(2)}`;
  return raw;
}

async function ensureHotspotVoucherAdminPhone() {
  const fallback = hotspotVoucherAdminPhone();
  if (state.hotspotVoucherAdminPhone) return state.hotspotVoucherAdminPhone;
  try {
    const payload = await api('/api/public/wa-admin-contact', { timeoutMs: 5000 });
    state.hotspotVoucherAdminPhone = String(payload.phone || payload.waPhone || fallback || '').trim();
  } catch {
    state.hotspotVoucherAdminPhone = fallback;
  }
  return hotspotVoucherAdminPhone();
}

const HOTSPOT_VOUCHER_DEFAULT_INSTRUCTION = 'cara aktivasi kode\nvoucer buka chrome ketik : {{login_host}} lalu enter';

function hotspotVoucherTemplateFallback() {
  return {
    name: 'Mikhmon Compact',
    title: 'Voucher Compact',
    subtitle: HOTSPOT_VOUCHER_DEFAULT_INSTRUCTION,
    footer: '',
    loginLabel: 'Link login',
    layout: 'mikhmon-compact',
    accentColor: '#0277BD',
    instruction: HOTSPOT_VOUCHER_DEFAULT_INSTRUCTION,
    supportText: '',
    codeLabel: 'VOUCHER',
    validityLabel: 'MASA AKTIF',
    customHtml: '',
    customCss: '',
    showPrice: true,
    showQr: true,
    active: true
  };
}

const HOTSPOT_VOUCHER_CUSTOM_HTML_DEFAULT = `<div class="mikhmon-card">
  <div class="mikhmon-head">
    <div class="mikhmon-logo">{{logo_img}}</div>
    <div class="mikhmon-price"><span>Rp</span><strong>{{price}}</strong></div>
  </div>
  <div class="mikhmon-body">
    <div class="mikhmon-main">
      <div class="mikhmon-label">VOUCHER</div>
      <div class="mikhmon-code">{{code}}</div>
      <div class="mikhmon-instruction">{{instruction}}</div>
    </div>
    <div class="mikhmon-side">
      <div class="mikhmon-validity"><span>MASA AKTIF :</span> <strong>{{validity}}</strong></div>
      {{qr}}
    </div>
  </div>
  <div class="mikhmon-footer">{{support}}</div>
</div>`;

const HOTSPOT_VOUCHER_CUSTOM_CSS_DEFAULT = `.mikhmon-card {
  border: 1px solid #111;
  box-sizing: border-box;
  color: #111;
  display: grid;
  font-family: Helvetica, Arial, sans-serif;
  gap: 0;
  grid-template-rows: 28px 66px 14px;
  height: 100%;
  overflow: hidden;
  padding: 0;
  position: relative;
}
.mikhmon-card::before {
  border-left: 13.2mm solid transparent;
  border-right: 36.6mm solid #b0bec5;
  border-top: 60.8mm solid transparent;
  content: "";
  opacity: 0.42;
  position: absolute;
  left: 0;
  top: -26.5mm;
}
.mikhmon-card > * {
  position: relative;
  z-index: 1;
}
.mikhmon-head {
  align-items: start;
  display: grid;
  grid-template-columns: 19.8mm minmax(0, 1fr);
  min-height: 7.2mm;
}
.mikhmon-logo img {
  display: block;
  height: 5.25mm;
  margin: 1.3mm 0 0 1.3mm;
  max-width: 22.5mm;
  object-fit: contain;
  width: 22.5mm;
}
.mikhmon-price {
  color: var(--voucher-accent, #0277bd);
  display: block;
  font-family: Tahoma, Arial, sans-serif;
  font-weight: 900;
  line-height: 1;
  margin-top: -1.6mm;
  padding-left: 4.5mm;
  text-align: right;
}
.mikhmon-price span {
  font-size: 7.4pt;
  margin-left: -4.5mm;
  position: absolute;
}
.mikhmon-price strong {
  font-size: 14.8pt;
}
.mikhmon-body {
  display: grid;
  gap: 0;
  grid-template-columns: 95px minmax(0, 1fr);
  min-height: 66px;
}
.mikhmon-main,
.mikhmon-side {
  align-content: start;
  display: grid;
  gap: 0;
  min-width: 0;
}
.mikhmon-label {
  border-bottom: 0.2mm solid var(--voucher-accent, #0277bd);
  color: var(--voucher-accent, #0277bd);
  font-size: 7.4pt;
  font-weight: 900;
  line-height: 1.1;
  margin-top: 0.55mm;
  text-align: center;
}
.mikhmon-code {
  border-bottom: 0.2mm solid var(--voucher-accent, #0277bd);
  font-family: Helvetica, Arial, sans-serif;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.08;
  overflow: hidden;
  text-align: center;
  white-space: nowrap;
}
.mikhmon-instruction {
  color: #374151;
  font-size: 7px;
  font-weight: 900;
  line-height: 1.1;
  max-height: 34px;
  overflow: hidden;
  padding: 2.5px;
  text-align: center;
  text-shadow: 0 0 2px #fff;
  white-space: pre-line;
}
.mikhmon-validity {
  color: #ff9100;
  display: block;
  font-size: 7px;
  font-weight: 900;
  line-height: 1;
  min-height: 8px;
  overflow: hidden;
  padding: 0 2.5px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mikhmon-validity span,
.mikhmon-validity strong {
  font-size: 7px;
  font-weight: 900;
  line-height: 1.05;
  white-space: nowrap;
}
.mikhmon-side .hotspot-voucher-qr {
  height: 58px;
  justify-self: end;
  margin: 0 5px 0 0;
  width: 58px;
}
.mikhmon-footer {
  background: var(--voucher-accent, #0277bd);
  color: #f8fafc;
  font-size: 6.2pt;
  font-weight: 900;
  line-height: 1;
  overflow: hidden;
  padding: 0.55mm 0.65mm;
  text-shadow: 0 0 1px rgba(0, 0, 0, 0.35);
  text-overflow: ellipsis;
  white-space: nowrap;
}`;

const HOTSPOT_VOUCHER_THERMAL_HTML_DEFAULT = `<div class="thermal-card">
  <div class="thermal-logo">{{logo_img}}</div>
  <div class="thermal-title">VOUCHER</div>
  <div class="thermal-code">{{code}}</div>
  <div class="thermal-meta">
    <span>Rp {{price}}</span>
    <span>{{validity}}</span>
  </div>
  {{qr}}
  <div class="thermal-instruction">{{instruction}}</div>
  <div class="thermal-footer">{{support}}</div>
</div>`;

const HOTSPOT_VOUCHER_THERMAL_CSS_DEFAULT = `.thermal-card {
  align-content: start;
  border: 1px solid #111;
  border-radius: 0;
  box-sizing: border-box;
  color: #111;
  display: grid;
  gap: 1mm;
  justify-items: center;
  min-height: 58mm;
  overflow: hidden;
  padding: 2mm 1.5mm;
  text-align: center;
  width: 100%;
}
.thermal-logo img {
  display: block;
  height: 8mm;
  max-width: 48mm;
  object-fit: contain;
}
.thermal-title {
  border-bottom: 0.3mm solid var(--voucher-accent, #0277bd);
  color: var(--voucher-accent, #0277bd);
  font-size: 7pt;
  font-weight: 900;
  line-height: 1;
  width: 100%;
}
.thermal-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 16pt;
  font-weight: 900;
  line-height: 1;
  overflow-wrap: anywhere;
}
.thermal-meta {
  color: #ff9100;
  display: flex;
  font-size: 6.2pt;
  font-weight: 900;
  gap: 2mm;
  justify-content: center;
  line-height: 1;
}
.thermal-card .hotspot-voucher-qr {
  border: 0;
  border-radius: 0;
  height: 28mm;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  padding: 0;
  width: 28mm;
}
.thermal-instruction,
.thermal-footer {
  font-size: 5.7pt;
  font-weight: 800;
  line-height: 1.12;
}
.thermal-instruction {
  max-height: 5.2em;
  overflow: hidden;
  white-space: pre-line;
}
.thermal-footer {
  background: var(--voucher-accent, #0277bd);
  color: #f8fafc;
  padding: 0.6mm 1mm;
  text-shadow: 0 0 1px rgba(0, 0, 0, 0.35);
  width: 100%;
}`;

const HOTSPOT_VOUCHER_SMALL_HTML_DEFAULT = `<div class="small-card">
  <div class="small-head">
    <div class="small-logo">{{logo_img}}</div>
    <div class="small-price">Rp {{price}}</div>
  </div>
  <div class="small-body">
    <div class="small-main">
      <div class="small-label">VOUCHER</div>
      <div class="small-code">{{code}}</div>
      <div class="small-validity">MASA AKTIF : {{validity}}</div>
      <div class="small-instruction">{{instruction}}</div>
    </div>
    {{qr}}
  </div>
  <div class="small-footer">{{support}}</div>
</div>`;

const HOTSPOT_VOUCHER_SMALL_CSS_DEFAULT = `.small-card {
  border: 1px solid #111;
  box-sizing: border-box;
  color: #111;
  display: grid;
  gap: 0.35mm;
  height: 100%;
  overflow: hidden;
  padding: 0.45mm;
}
.small-head {
  align-items: center;
  border-bottom: 0.2mm solid #111;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  min-height: 4.4mm;
}
.small-logo img {
  display: block;
  height: 4.4mm;
  max-width: 21mm;
  object-fit: contain;
}
.small-price {
  color: var(--voucher-accent, #0277bd);
  font-size: 6pt;
  font-weight: 900;
  line-height: 1;
}
.small-body {
  display: grid;
  gap: 0.5mm;
  grid-template-columns: minmax(0, 1fr) 14mm;
}
.small-main {
  align-content: start;
  display: grid;
  gap: 0.25mm;
  min-width: 0;
}
.small-label {
  border-bottom: 0.2mm solid var(--voucher-accent, #0277bd);
  color: var(--voucher-accent, #0277bd);
  font-size: 3.3pt;
  font-weight: 900;
  line-height: 1;
  text-align: center;
}
.small-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 7pt;
  font-weight: 900;
  line-height: 1;
  overflow-wrap: anywhere;
  text-align: center;
}
.small-validity,
.small-instruction,
.small-footer {
  color: #ff9100;
  font-size: 3.5pt;
  font-weight: 900;
  line-height: 1.05;
  overflow: hidden;
  text-align: center;
}
.small-instruction {
  max-height: 4.2em;
  white-space: pre-line;
}
.small-card .hotspot-voucher-qr {
  height: 14mm;
  width: 14mm;
}
.small-footer {
  background: var(--voucher-accent, #0277bd);
  padding: 0.25mm 0.45mm;
  color: #f8fafc;
  text-shadow: 0 0 1px rgba(0, 0, 0, 0.35);
  text-overflow: ellipsis;
  white-space: nowrap;
}`;

const HOTSPOT_VOUCHER_TEMPLATE_LAYOUTS = [
  { value: 'mikhmon-compact', label: 'Mikhmon Compact' },
  { value: 'thermal', label: 'Thermal' },
  { value: 'small', label: 'Small' },
  { value: 'custom', label: 'Custom HTML' }
];

const HOTSPOT_VOUCHER_TEMPLATE_VARIABLES = [
  '{{logo_img}}', '{{business_name}}', '{{price}}', '{{code}}', '{{username}}', '{{password}}',
  '{{validity}}', '{{profile}}', '{{quota}}', '{{login_host}}', '{{login_url}}', '{{qr}}',
  '{{instruction}}', '{{support}}', '{{footer}}', '{{num}}'
].join('\n');

const HOTSPOT_VOUCHER_HTML_PRESETS = {
  'mikhmon-compact': {
    html: HOTSPOT_VOUCHER_CUSTOM_HTML_DEFAULT,
    css: HOTSPOT_VOUCHER_CUSTOM_CSS_DEFAULT
  },
  thermal: {
    html: HOTSPOT_VOUCHER_THERMAL_HTML_DEFAULT,
    css: HOTSPOT_VOUCHER_THERMAL_CSS_DEFAULT
  },
  small: {
    html: HOTSPOT_VOUCHER_SMALL_HTML_DEFAULT,
    css: HOTSPOT_VOUCHER_SMALL_CSS_DEFAULT
  },
  custom: {
    html: HOTSPOT_VOUCHER_CUSTOM_HTML_DEFAULT,
    css: HOTSPOT_VOUCHER_CUSTOM_CSS_DEFAULT
  }
};

function hotspotVoucherLayoutValue(template = {}) {
  const layout = String(template.layout || 'mikhmon-compact').trim();
  return HOTSPOT_VOUCHER_TEMPLATE_LAYOUTS.some((item) => item.value === layout) ? layout : 'mikhmon-compact';
}

function hotspotVoucherLayoutLabel(value = '') {
  return HOTSPOT_VOUCHER_TEMPLATE_LAYOUTS.find((item) => item.value === value)?.label || 'Mikhmon Compact';
}

function hotspotVoucherTemplateHtmlPreset(template = {}) {
  return HOTSPOT_VOUCHER_HTML_PRESETS[hotspotVoucherLayoutValue(template)] || HOTSPOT_VOUCHER_HTML_PRESETS['mikhmon-compact'];
}

function hotspotVoucherPrintTemplate() {
  const templates = Array.isArray(state.hotspotVoucherTemplates) ? state.hotspotVoucherTemplates : [];
  return templates.find((template) => template.active !== false) || templates[0] || hotspotVoucherTemplateFallback();
}

async function ensureHotspotVoucherTemplates() {
  if (Array.isArray(state.hotspotVoucherTemplates) && state.hotspotVoucherTemplates.length) return state.hotspotVoucherTemplates;
  try {
    const payload = await api(`/api/radius/hotspot?${queryString({ tab: 'templates', page: 1, limit: 100 })}`);
    state.hotspotVoucherTemplates = Array.isArray(payload.rows) && payload.rows.length ? payload.rows : [hotspotVoucherTemplateFallback()];
  } catch {
    state.hotspotVoucherTemplates = [hotspotVoucherTemplateFallback()];
  }
  return state.hotspotVoucherTemplates;
}

function hotspotVoucherPriceText(value) {
  const amount = Number(value || 0);
  if (!amount) return '-';
  return amount.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

function hotspotVoucherReceiptPrice(row = {}) {
  return Number(
    row.receiptPrice
      || row.receiptAmount
      || row.customerAmount
      || row.gatewayAmount
      || row.checkoutAmount
      || row.totalAmount
      || row.price
      || 0
  );
}

function hotspotVoucherValidityText(row = {}) {
  const raw = String(row.validity || '').trim();
  if (raw) {
    const match = raw.match(/^(\d+(?:[.,]\d+)?)\s*([smhdw])$/i);
    if (match) {
      const units = {
        s: 'Detik',
        m: 'Menit',
        h: 'Jam',
        d: 'Hari',
        w: 'Minggu'
      };
      return `${match[1].replace('.', ',')}${units[match[2].toLowerCase()] || match[2]}`;
    }
    return raw;
  }
  const seconds = Math.max(0, Math.trunc(Number(row.validitySeconds || 0)) || 0);
  if (seconds) {
    if (seconds % 604800 === 0) return `${displayNumber(seconds / 604800)}Minggu`;
    if (seconds % 86400 === 0) return `${displayNumber(seconds / 86400)}Hari`;
    if (seconds % 3600 === 0) return `${displayNumber(seconds / 3600)}Jam`;
    if (seconds % 60 === 0) return `${displayNumber(seconds / 60)}Menit`;
    return `${displayNumber(seconds)}Detik`;
  }
  return row.profile || '-';
}

function hotspotVoucherLoginHost(row = {}) {
  const url = hotspotVoucherLoginUrl(row);
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return String(url).replace(/^https?:\/\//i, '').split('/')[0];
  }
}

function hotspotVoucherActivationText(row = {}) {
  const host = hotspotVoucherLoginHost(row);
  return host ? `Login: ${host}` : 'Login di portal Hotspot';
}

function hotspotVoucherAccentColor(template = {}) {
  const color = String(template.accentColor || '#0277BD').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#0277BD';
}

function hotspotVoucherTemplateValues(row = {}, index = 0, template = {}) {
  const username = String(row.username || row.password || '-').trim() || '-';
  const password = String(row.password || row.voucherPassword || row.username || '').trim() || username;
  const loginHost = hotspotVoucherLoginHost(row);
  const callCenter = hotspotVoucherAdminPhone();
  const support = callCenter ? `CS: ${callCenter}` : String(template.supportText || '').trim();
  const validity = hotspotVoucherValidityText(row);
  const price = hotspotVoucherPriceText(hotspotVoucherReceiptPrice(row));
  return {
    business_name: hotspotVoucherBusinessName(),
    code: username,
    comment: row.note || '',
    dnsname: loginHost,
    footer: String(template.footer || '').trim(),
    hotspotname: hotspotVoucherBusinessName(),
    instruction: String(template.instruction || template.subtitle || '').trim() || hotspotVoucherActivationText(row),
    login_host: loginHost,
    login_url: hotspotVoucherLoginUrl(row),
    logo: hotspotVoucherLogoUrl(),
    num: String(index + 1),
    password,
    price,
    profile: row.profile || '-',
    qrcode_url: hotspotVoucherQrSrc(row, 1024),
    quota: row.quota || '',
    shared_users: row.sharedUsers || '',
    support,
    timelimit: '',
    username,
    validity
  };
}

function hotspotVoucherAbsoluteUrl(value = '') {
  try {
    return new URL(String(value || ''), window.location.origin).toString();
  } catch {
    return String(value || '');
  }
}

function renderHotspotVoucherTemplateText(text = '', values = {}) {
  return String(text || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}|\[([a-z0-9_]+)\]/gi, (match, curlyKey, bracketKey) => {
    const key = String(curlyKey || bracketKey || '').toLowerCase();
    return values[key] === undefined ? match : String(values[key]);
  });
}

function hotspotVoucherInstructionHtml(text = '') {
  const source = String(text || '').replace(/\r\n?/g, '\n').trim();
  const normalized = source.includes('\n')
    ? source
    : source.replace(
      /\bcara aktivasi kode\s+(?:voucher|voucer)\s+buka chrome\s+ketik\s*:\s*(.+?)\s+lalu enter\b/i,
      'cara aktivasi kode\nvoucer buka chrome\nketik : $1\nlalu enter'
    );
  return escapeHtml(normalized).replace(/\n/g, '<br>');
}

function sanitizeHotspotVoucherCustomHtml(html = '') {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  template.content.querySelectorAll('script, iframe, object, embed, link, meta, style').forEach((node) => node.remove());
  template.content.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = String(attribute.value || '').trim().toLowerCase();
      if (name.startsWith('on') || value.startsWith('javascript:')) node.removeAttribute(attribute.name);
    });
  });
  return template.innerHTML;
}

function sanitizeHotspotVoucherCustomCss(css = '') {
  return String(css || '')
    .replace(/<\/style/gi, '<\\/style')
    .replace(/@import\b/gi, '');
}

function hotspotVoucherCustomHtml(row = {}, index = 0, template = {}) {
  const values = hotspotVoucherTemplateValues(row, index, template);
  const rawHtml = renderHotspotVoucherTemplateText(template.customHtml || '', {
    ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapeHtml(value)])),
    logo_img: `<img class="hotspot-voucher-logo" src="${escapeHtml(values.logo)}" alt="Logo">`,
    qr: template.showQr === false ? '' : `<img class="hotspot-voucher-qr" src="${escapeHtml(values.qrcode_url)}" alt="QR voucher ${escapeHtml(values.username)}" loading="eager" decoding="sync">`
  });
  const css = sanitizeHotspotVoucherCustomCss(template.customCss).trim();
  return `
    <article class="hotspot-voucher-ticket hotspot-voucher-custom" style="--voucher-accent:${escapeHtml(hotspotVoucherAccentColor(template))}">
      ${css ? `<style>${css}</style>` : ''}
      ${sanitizeHotspotVoucherCustomHtml(rawHtml)}
    </article>
  `;
}

function hotspotVoucherMikhmonCompactTable(row = {}, index = 0, template = {}) {
  const values = hotspotVoucherTemplateValues(row, index, template);
  const accentColor = hotspotVoucherAccentColor(template);
  const logoUrl = hotspotVoucherAbsoluteUrl(hotspotVoucherLogoUrl());
  const businessName = hotspotVoucherBusinessName();
  const voucherCode = String(row.username || row.password || '-');
  const price = hotspotVoucherPriceText(hotspotVoucherReceiptPrice(row));
  const validity = hotspotVoucherValidityText(row);
  const activationText = renderHotspotVoucherTemplateText(
    String(template.instruction || template.subtitle || '').trim() || HOTSPOT_VOUCHER_DEFAULT_INSTRUCTION,
    values
  );
  const activationHtml = escapeHtml(String(activationText || '').replace(/\s+/g, ' ').trim());
  const footerText = renderHotspotVoucherTemplateText(values.support, values);
  const validityLabel = String(template.validityLabel || 'MASA AKTIF').replace(/\s*:?\s*$/, '');
  const qrSource = Array.isArray(template.qrSources) && template.qrSources[index]
    ? template.qrSources[index]
    : hotspotVoucherAbsoluteUrl(hotspotVoucherQrSrc(row, 1024));
  const qrSvg = Array.isArray(template.qrSvgs) && template.qrSvgs[index] ? template.qrSvgs[index] : '';
  return `
    <table class="hotspot-voucher-ticket hotspot-voucher-mikhmon-table hotspot-voucher-template-mikhmon-compact" style="display:inline-block;border-collapse:collapse;border:1px solid #000000;margin:2px;width:190px;overflow:hidden;position:relative;padding:0px;height:auto;min-height:0;vertical-align:top;background:#FFFFFF linear-gradient(105deg, transparent 0 45%, #B0BEC5 45% 100%);">
      <tbody>
        <tr>
          <td style="color:#666;" valign="top">
            <table style="width:100%;">
              <tbody>
                <tr>
                  <td style="width:75px">
                    <img style="display:block;margin:5px 0 0 5px;object-fit:contain;" width="85" height="20" src="${escapeHtml(logoUrl)}" alt="Logo ${escapeHtml(businessName)}">
                  </td>
                  <td style="width:115px">
                    <div style="float:right;margin-top:-6px;margin-right:0px;width:5%;text-align:right;font-size:7px;"></div>
                    ${template.showPrice === false ? '' : `
                      <div style="text-align:right;font-weight:bold;font-family:Tahoma,Arial,sans-serif;font-size:20px;padding-left:17px;color:${escapeHtml(accentColor)}">
                        <small style="font-size:10px;margin-left:-17px;position:absolute;">Rp</small>${escapeHtml(price)}
                      </div>
                    `}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="color:#666;border-collapse:collapse;" valign="top">
            <table style="width:100%;border-collapse:collapse;">
              <tbody>
                <tr>
                  <td style="width:95px" valign="top">
                    <div style="clear:both;color:#555;margin-top:2px;margin-bottom:2.5px;">
                      <div style="padding:0px;border-bottom:1px solid ${escapeHtml(accentColor)};text-align:center;font-weight:bold;font-size:10px;color:#0277BD;">${escapeHtml(template.codeLabel || 'VOUCHER')}</div>
                      <div style="padding:0px;border-bottom:1px solid ${escapeHtml(accentColor)};text-align:center;font-weight:bold;font-size:14px;color:#000000;">${escapeHtml(voucherCode)}</div>
                    </div>
                    <div style="text-align:center;color:#374151;font-size:7px;font-weight:bold;line-height:1.1;margin:0px;padding:2.5px;text-shadow:0 0 2px #FFFFFF;">${activationHtml}</div>
                  </td>
                  <td style="width:100px;text-align:right;">
                      <div style="clear:both;padding:0 2.5px;font-size:7px;font-weight:bold;color:#111827;text-shadow:0 0 2px #FFFFFF;">
                      ${escapeHtml(validityLabel)} : ${escapeHtml(validity)}<br> <br>
                    </div>
                    ${template.showQr === false ? '' : `
                      <div style="float:right;padding:1px;text-align:right;width:72%;margin:0 5px -20px 0;">
                        ${qrSvg
                          ? `<span class="hotspot-voucher-qr hotspot-voucher-qr-inline" style="height:64px;width:64px;display:block;border:0;border-radius:0;margin-left:auto;padding:0;line-height:0;">${qrSvg}</span>`
                          : `<img class="hotspot-voucher-qr" style="height:64px;width:64px;display:block;border:0;border-radius:0;margin-left:auto;padding:0;image-rendering:pixelated;image-rendering:crisp-edges;" src="${escapeHtml(qrSource)}" alt="QR voucher ${escapeHtml(row.username || '')}" loading="eager" decoding="sync">`}
                      </div>
                    `}
                  </td>
                </tr>
                ${footerText ? `
                  <tr>
                    <td style="background:${escapeHtml(accentColor)};color:#666;padding:0px;" valign="top" colspan="2">
                      <div style="text-align:left;color:#F8FAFC;font-size:9px;font-weight:bold;margin:0px;padding:2.5px;text-shadow:0 0 1px rgba(0,0,0,0.35);"><b>${escapeHtml(footerText)}</b></div>
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  `;
}

function hotspotVoucherMikhmonPrintDocument(rows = [], template = {}) {
  const cards = rows.map((row, index) => hotspotVoucherMikhmonCompactTable(row, index, template)).join('');
  const baseUrl = `${window.location.origin}/`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeHtml(baseUrl)}">
  <style>
    body {
      color: #000000;
      background-color: #FFFFFF;
      font-size: 14px;
      font-family: Helvetica, Arial, sans-serif;
      margin: 0px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table.voucher {
      display: inline-block;
      border: 2px solid black;
      margin: 2px;
    }
    @page {
      size: auto;
      margin-left: 7mm;
      margin-right: 3mm;
      margin-top: 9mm;
      margin-bottom: 3mm;
    }
    @media print {
      table { page-break-after: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      td { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    }
    .qrcode,
    .hotspot-voucher-qr {
      height: 64px;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      width: 64px;
    }
    .hotspot-voucher-qr-inline,
    .hotspot-voucher-qr-inline svg,
    .hotspot-voucher-qr-svg {
      display: block;
      height: 64px;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      shape-rendering: crispEdges;
      width: 64px;
    }
  </style>
</head>
<body>${cards}</body>
</html>`;
}

function hotspotVoucherThermalTicket(row = {}, index = 0, template = {}, mode = 'thermal-80') {
  const values = hotspotVoucherTemplateValues(row, index, template);
  const accentColor = hotspotVoucherAccentColor(template);
  const businessName = hotspotVoucherBusinessName();
  const logoUrl = hotspotVoucherAbsoluteUrl(hotspotVoucherLogoUrl());
  const voucherCode = String(row.username || row.password || '-').trim() || '-';
  const password = String(row.password || row.voucherPassword || row.username || '').trim() || voucherCode;
  const dateSource = hotspotVoucherDateSource(row);
  const qrSource = Array.isArray(template.qrSources) && template.qrSources[index]
    ? template.qrSources[index]
    : hotspotVoucherAbsoluteUrl(hotspotVoucherQrSrc(row, 1024));
  const qrSvg = Array.isArray(template.qrSvgs) && template.qrSvgs[index] ? template.qrSvgs[index] : '';
  const activationText = renderHotspotVoucherTemplateText(
    String(template.instruction || template.subtitle || '').trim() || hotspotVoucherActivationText(row),
    values
  ).replace(/\s+/g, ' ').trim();
  const support = values.support || '';
  return `
    <article class="hotspot-voucher-thermal-ticket" style="--voucher-accent:${escapeHtml(accentColor)}">
      <div class="hotspot-voucher-thermal-brand">
        <img src="${escapeHtml(logoUrl)}" alt="Logo ${escapeHtml(businessName)}">
        <strong>${escapeHtml(businessName)}</strong>
      </div>
      <div class="hotspot-voucher-thermal-title">Voucher Hotspot</div>
      <div class="hotspot-voucher-thermal-code">${escapeHtml(voucherCode)}</div>
      ${password && password !== voucherCode ? `<div class="hotspot-voucher-thermal-pass">Password: ${escapeHtml(password)}</div>` : ''}
      <div class="hotspot-voucher-thermal-meta">
        <span>Paket</span><strong>${escapeHtml(row.profile || '-')}</strong>
        <span>Harga</span><strong>${escapeHtml(hotspotVoucherPriceText(hotspotVoucherReceiptPrice(row)))}</strong>
        <span>Masa Aktif</span><strong>${escapeHtml(hotspotVoucherValidityText(row))}</strong>
        <span>Tanggal</span><strong>${escapeHtml(hotspotVoucherDateText(dateSource))} ${escapeHtml(timeText(dateSource))}</strong>
      </div>
      ${template.showQr === false ? '' : `
        <div class="hotspot-voucher-thermal-qr">
          ${qrSvg
            ? `<span class="hotspot-voucher-qr hotspot-voucher-qr-inline">${qrSvg}</span>`
            : `<img class="hotspot-voucher-qr" src="${escapeHtml(qrSource)}" alt="QR voucher ${escapeHtml(voucherCode)}" loading="eager" decoding="sync">`}
        </div>
      `}
      <div class="hotspot-voucher-thermal-instruction">${escapeHtml(activationText || 'Scan QR untuk login Hotspot.')}</div>
      ${support ? `<div class="hotspot-voucher-thermal-footer">${escapeHtml(support)}</div>` : ''}
    </article>
  `;
}

function hotspotVoucherThermalPrintDocument(rows = [], template = {}, mode = 'thermal-80') {
  const paper58 = mode === 'thermal-58';
  const paperHeight = paper58 ? '92mm' : '96mm';
  const paperWidth = paper58 ? '58mm' : '80mm';
  const pagePadding = paper58 ? '2mm 1.5mm' : '2.5mm 2mm';
  const cards = rows.map((row, index) => `
    <section class="hotspot-voucher-thermal-page">
      ${hotspotVoucherThermalTicket(row, index, template, mode)}
    </section>
  `).join('');
  const baseUrl = `${window.location.origin}/`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeHtml(baseUrl)}">
  <style>
    @page {
      size: ${paperWidth} ${paperHeight};
      margin: 0;
    }
    html,
    body {
      background: #ffffff;
      color: #000000;
      font-family: Helvetica, Arial, sans-serif;
      font-size: 14px;
      margin: 0;
      height: ${paperHeight};
      min-height: ${paperHeight};
      padding: 0;
      width: ${paperWidth};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      text-align: left;
    }
    .hotspot-voucher-thermal-page {
      align-items: stretch;
      background: #ffffff;
      box-sizing: border-box;
      break-after: page;
      display: flex;
      min-height: ${paperHeight};
      justify-content: stretch;
      overflow: hidden;
      padding: ${pagePadding};
      page-break-after: always;
      width: ${paperWidth};
    }
    .hotspot-voucher-thermal-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .hotspot-voucher-thermal-ticket {
      align-content: start;
      border: 1px solid #111111;
      box-sizing: border-box;
      display: grid;
      gap: 1.25mm;
      justify-items: center;
      min-height: 0;
      overflow: hidden;
      padding: ${paper58 ? '1.8mm 1.5mm' : '2.2mm'};
      page-break-inside: avoid;
      text-align: center;
      width: 100%;
    }
    .hotspot-voucher-thermal-brand {
      align-items: center;
      display: grid;
      gap: 1mm;
      justify-items: center;
      width: 100%;
    }
    .hotspot-voucher-thermal-brand img {
      display: block;
      height: ${paper58 ? '7mm' : '8mm'};
      max-width: ${paper58 ? '38mm' : '54mm'};
      object-fit: contain;
      width: ${paper58 ? '38mm' : '54mm'};
    }
    .hotspot-voucher-thermal-brand strong {
      color: #111827;
      font-size: ${paper58 ? '8pt' : '9pt'};
      line-height: 1;
      overflow-wrap: anywhere;
      text-transform: uppercase;
    }
    .hotspot-voucher-thermal-title {
      border-bottom: .3mm solid var(--voucher-accent, #0277bd);
      color: var(--voucher-accent, #0277bd);
      font-size: ${paper58 ? '7pt' : '8pt'};
      font-weight: 900;
      line-height: 1;
      padding-bottom: .8mm;
      text-transform: uppercase;
      width: 100%;
    }
    .hotspot-voucher-thermal-code {
      color: #000000;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: ${paper58 ? '18pt' : '20pt'};
      font-weight: 900;
      line-height: 1;
      overflow-wrap: anywhere;
    }
    .hotspot-voucher-thermal-pass {
      font-size: ${paper58 ? '6.4pt' : '7pt'};
      font-weight: 800;
      line-height: 1.1;
    }
    .hotspot-voucher-thermal-meta {
      display: grid;
      gap: .55mm 1.4mm;
      grid-template-columns: ${paper58 ? '16mm minmax(0, 1fr)' : '20mm minmax(0, 1fr)'};
      text-align: left;
      width: 100%;
    }
    .hotspot-voucher-thermal-meta span,
    .hotspot-voucher-thermal-meta strong {
      border-bottom: .2mm dashed #cbd5e1;
      font-size: ${paper58 ? '6.1pt' : '6.8pt'};
      line-height: 1.08;
      padding-bottom: .45mm;
    }
    .hotspot-voucher-thermal-meta span {
      color: #4b5563;
      font-weight: 700;
    }
    .hotspot-voucher-thermal-meta strong {
      color: #111827;
      font-weight: 900;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .qrcode,
    .hotspot-voucher-qr {
      background: #ffffff;
      border: 0;
      border-radius: 0;
      height: ${paper58 ? '24mm' : '28mm'};
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      width: ${paper58 ? '24mm' : '28mm'};
    }
    .hotspot-voucher-qr-inline,
    .hotspot-voucher-qr-inline svg,
    .hotspot-voucher-qr-svg {
      display: block;
      height: ${paper58 ? '24mm' : '28mm'};
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      shape-rendering: crispEdges;
      width: ${paper58 ? '24mm' : '28mm'};
    }
    .hotspot-voucher-thermal-instruction {
      color: #374151;
      font-size: ${paper58 ? '5.8pt' : '6.3pt'};
      font-weight: 800;
      line-height: 1.14;
      max-height: 4.6em;
      overflow: hidden;
    }
    .hotspot-voucher-thermal-footer {
      background: var(--voucher-accent, #0277bd);
      color: #ffffff;
      font-size: ${paper58 ? '5.8pt' : '6.4pt'};
      font-weight: 900;
      line-height: 1.05;
      overflow: hidden;
      padding: .8mm 1mm;
      text-overflow: ellipsis;
      white-space: nowrap;
      width: 100%;
    }
    @media print {
      html,
      body {
        width: ${paperWidth};
        min-height: ${paperHeight};
      }
      table {
        page-break-after: auto;
      }
      tr,
      td {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      .hotspot-voucher-thermal-ticket {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>${cards}</body>
</html>`;
}

function hotspotVoucherRawBtTicketText(row = {}, index = 0, template = {}, mode = 'thermal-58') {
  const width = thermalTextWidth(mode);
  const values = hotspotVoucherTemplateValues(row, index, template);
  const voucherCode = String(row.username || row.password || '-').trim() || '-';
  const password = String(row.password || row.voucherPassword || row.username || '').trim() || voucherCode;
  const dateSource = hotspotVoucherDateSource(row);
  const loginUrl = hotspotVoucherDirectLoginUrl(row) || hotspotVoucherLoginUrl(row);
  const qrText = hotspotVoucherDirectLoginUrl(row) || `${voucherCode}/${password}`;
  const support = values.support || '';
  const lines = [
    thermalCenter(hotspotVoucherBusinessName(), width),
    thermalCenter('VOUCHER HOTSPOT', width),
    thermalSeparator(width),
    thermalCenter(`Kode Voucher : ${voucherCode}`, width),
    ...(password && password !== voucherCode ? thermalKeyValue('Password', password, width) : []),
    ...thermalKeyValue('Paket', row.profile || '-', width),
    ...thermalKeyValue('Harga', hotspotVoucherPriceText(hotspotVoucherReceiptPrice(row)), width),
    ...thermalKeyValue('Masa Aktif', hotspotVoucherValidityText(row), width),
    ...thermalKeyValue('Tanggal', `${hotspotVoucherDateText(dateSource)} ${timeText(dateSource)}`, width),
    thermalSeparator(width)
  ];
  if (qrText) {
    lines.push(thermalCenter('Scan QR Login', width));
    lines.push(thermalEscposQr(qrText, mode === 'thermal-80' ? 6 : 5));
  }
  if (loginUrl) {
    lines.push(...thermalWrap(loginUrl, width));
  }
  if (support) {
    lines.push(thermalSeparator(width));
    lines.push(thermalCenter(support, width));
  }
  return lines.join('\n');
}

function hotspotVoucherRawBtText(rows = [], template = {}, mode = 'thermal-58') {
  return rows
    .map((row, index) => hotspotVoucherRawBtTicketText(row, index, template, mode))
    .join('\n\n\n');
}

function hotspotVoucherInternetLabel(row = {}) {
  return row.sessionOnline === true || String(row.internetStatus || '').toLowerCase() === 'online' ? 'Online' : 'Offline';
}

function radiusLastActiveText(row = {}) {
  const source = row.lastActiveAt || row.lastSeenAt || row.updatedAt || row.startedAt || row.createdAt || '';
  return source ? dateTimeText(source) : '-';
}

function radiusInternetCell(row = {}) {
  const online = row.sessionOnline === true || String(row.internetStatus || '').toLowerCase() === 'online';
  return `
    <div class="radius-internet-cell">
      <span class="badge ${online ? 'active' : 'inactive'}">${online ? 'Online' : 'Offline'}</span>
      ${online ? '' : `<span class="radius-last-active">${escapeHtml(radiusLastActiveText(row))}</span>`}
    </div>
  `;
}

function hotspotVoucherDateSource(row = {}) {
  return row.createdAt || row.updatedAt || new Date().toISOString();
}

function hotspotVoucherDateText(value) {
  const text = dateText(value);
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[1]}/${match[2]}/${match[3].slice(-2)}` : text;
}

function hotspotVoucherQrText(row = {}) {
  return hotspotVoucherDirectLoginUrl(row) || `${row.username || ''}/${row.password || row.username || ''}`;
}

function hotspotVoucherQrSrc(row = {}, size = 160) {
  return `/api/tools/qr?size=${Number(size) || 160}&text=${encodeURIComponent(hotspotVoucherQrText(row))}`;
}

function sanitizeHotspotVoucherQrSvg(svg = '') {
  let text = String(svg || '').trim()
    .replace(/^<\?xml[\s\S]*?\?>/i, '')
    .replace(/^<!doctype[\s\S]*?>/i, '')
    .trim();
  if (!/^<svg[\s>]/i.test(text)) return '';
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|xlink:href)=["']\s*javascript:[^"']*["']/gi, '');
  return text.replace(/<svg\b/i, '<svg class="hotspot-voucher-qr-svg" aria-hidden="true" focusable="false"');
}

async function hotspotVoucherQrAssets(rows = [], size = 1024) {
  const result = {
    sources: new Array(rows.length).fill(''),
    svgs: new Array(rows.length).fill('')
  };
  const cache = new Map();
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      const source = hotspotVoucherAbsoluteUrl(hotspotVoucherQrSrc(rows[index], size));
      if (cache.has(source)) {
        const asset = cache.get(source);
        result.sources[index] = asset.source;
        result.svgs[index] = asset.svg;
        continue;
      }
      try {
        const response = await fetch(source, {
          credentials: 'same-origin',
          cache: 'no-store'
        });
        if (!response.ok) throw new Error(`QR ${response.status}`);
        const svg = await response.text();
        const safeSvg = sanitizeHotspotVoucherQrSvg(svg);
        if (!safeSvg) throw new Error('QR SVG kosong');
        const asset = {
          source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(safeSvg)}`,
          svg: safeSvg
        };
        cache.set(source, asset);
        result.sources[index] = asset.source;
        result.svgs[index] = asset.svg;
      } catch {
        result.sources[index] = source;
        result.svgs[index] = '';
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, Math.max(1, rows.length)) }, () => worker()));
  return result;
}

function hotspotVoucherQrButton(row = {}, index = 0) {
  return `
    <button class="voucher-qr-button" type="button" data-radius-hotspot-qr="${index}" title="Preview/print QR voucher ${escapeHtml(row.username || '')}" aria-label="Preview/print QR voucher ${escapeHtml(row.username || '')}">
      <span aria-hidden="true"></span>
    </button>
  `;
}

function hotspotVoucherTicket(row = {}, index = 0) {
  const voucherCode = row.username || row.password || '-';
  const template = hotspotVoucherPrintTemplate();
  if (String(template.customHtml || '').trim()) {
    return hotspotVoucherCustomHtml(row, index, template);
  }
  const values = hotspotVoucherTemplateValues(row, index, template);
  const accentColor = hotspotVoucherAccentColor(template);
  const layout = hotspotVoucherLayoutValue(template);
  if (layout === 'mikhmon-compact') {
    return hotspotVoucherMikhmonCompactTable(row, index, template);
  }
  const compactLayout = layout === 'mikhmon-compact';
  const validityText = hotspotVoucherValidityText(row);
  const logoUrl = hotspotVoucherLogoUrl();
  const businessName = hotspotVoucherBusinessName();
  const activationText = renderHotspotVoucherTemplateText(
    String(template.instruction || template.subtitle || '').trim() || hotspotVoucherActivationText(row),
    values
  );
  const activationHtml = hotspotVoucherInstructionHtml(activationText);
  const footerText = renderHotspotVoucherTemplateText(values.support, values);
  return `
    <article class="hotspot-voucher-ticket hotspot-voucher-mikhmon hotspot-voucher-template-${escapeHtml(layout)}" style="--voucher-accent:${escapeHtml(accentColor)}">
      <div class="hotspot-voucher-head">
        <div class="hotspot-voucher-brand">
          <img src="${escapeHtml(logoUrl)}" alt="Logo ${escapeHtml(businessName)}">
        </div>
        ${template.showPrice === false ? '' : `
          <div class="hotspot-voucher-price">
            <span>Rp</span>
            <strong>${escapeHtml(hotspotVoucherPriceText(hotspotVoucherReceiptPrice(row)))}</strong>
          </div>
        `}
      </div>
      <div class="hotspot-voucher-body ${template.showQr === false ? 'no-qr' : ''}">
        <div class="hotspot-voucher-main">
          <div class="hotspot-voucher-code-box">
            <span>${escapeHtml(template.codeLabel || 'VOUCHER')}</span>
            <strong>${escapeHtml(voucherCode)}</strong>
          </div>
          <div class="hotspot-voucher-activation">${activationHtml}</div>
        </div>
        <div class="hotspot-voucher-side">
          <div class="hotspot-voucher-validity">
            <span>${escapeHtml(template.validityLabel || 'MASA AKTIF')}${compactLayout ? ' :' : ''}</span>
            <strong>${escapeHtml(validityText)}</strong>
          </div>
          ${template.showQr === false ? '' : `
            <img class="hotspot-voucher-qr" src="${escapeHtml(hotspotVoucherQrSrc(row, 1024))}" alt="QR voucher ${escapeHtml(row.username || '')}" loading="eager" decoding="sync">
          `}
        </div>
      </div>
      ${footerText ? `<div class="hotspot-voucher-footer">${escapeHtml(footerText)}</div>` : ''}
    </article>
  `;
}

function hotspotVoucherPrintModeLabel(mode = 'a4') {
  if (mode === 'thermal-58') return 'Thermal 58mm';
  if (mode === 'thermal-80') return 'Thermal 80mm';
  return 'A4 Portrait - Mikhmon';
}

function hotspotVoucherPrintPageSize(mode = 'a4') {
  if (mode === 'thermal-58') return '86mm 58mm';
  if (mode === 'thermal-80') return '80mm 55mm';
  return 'A4 portrait';
}

function setHotspotVoucherPrintMode(mode = 'a4') {
  const safeMode = ['a4', 'thermal-58', 'thermal-80'].includes(mode) ? mode : 'a4';
  const stack = document.querySelector('.hotspot-voucher-print-stack');
  const isolated = document.querySelector('[data-hotspot-voucher-isolated]');
  const isolatedModes = String(isolated?.dataset.isolatedModes || '').split(/\s+/).filter(Boolean);
  const useIsolatedMode = isolatedModes.includes(safeMode);
  if (stack) {
    stack.classList.remove('print-mode-a4', 'print-mode-thermal-58', 'print-mode-thermal-80');
    stack.classList.add(`print-mode-${safeMode}`);
    if (isolated) stack.hidden = useIsolatedMode;
  }
  if (isolated) {
    isolated.hidden = !useIsolatedMode;
  }
  const label = document.getElementById('hotspotVoucherPrintModeLabel');
  if (label) label.textContent = hotspotVoucherPrintModeLabel(safeMode);
  return safeMode;
}

function applyHotspotVoucherPrintPageStyle(mode = 'a4') {
  let style = document.getElementById('hotspotVoucherPrintPageStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'hotspotVoucherPrintPageStyle';
    document.head.appendChild(style);
  }
  const margin = mode === 'a4' ? '9mm 3mm 3mm 7mm' : '0';
  style.textContent = `@media print { @page { size: ${hotspotVoucherPrintPageSize(mode)}; margin: ${margin}; } }`;
}

function clearHotspotVoucherPrintPageStyle() {
  document.getElementById('hotspotVoucherPrintPageStyle')?.remove();
}

function waitForImages(root, timeoutMs = 2500) {
  const images = [...(root || document).querySelectorAll('img')];
  const pending = images
    .filter((image) => !image.complete)
    .map((image) => new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    }));
  if (!pending.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pending),
    new Promise((resolve) => window.setTimeout(resolve, timeoutMs))
  ]);
}

function waitForFrameReady(frame, timeoutMs = 3000) {
  if (!frame) return Promise.resolve();
  const doc = frame.contentDocument;
  if (doc?.readyState === 'complete') return Promise.resolve();
  return Promise.race([
    new Promise((resolve) => frame.addEventListener('load', resolve, { once: true })),
    new Promise((resolve) => window.setTimeout(resolve, timeoutMs))
  ]);
}

async function printIsolatedHtmlDocument(documentText = '', modeClass = '') {
  const html = String(documentText || '').trim();
  if (!html) return false;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const bodyHtml = parsed.body?.innerHTML || '';
  if (!String(bodyHtml || '').trim()) return false;
  const embeddedStyles = [...parsed.querySelectorAll('style')]
    .map((style) => style.textContent || '')
    .filter(Boolean)
    .join('\n');
  let root = document.getElementById('isolatedPrintRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'isolatedPrintRoot';
    document.body.appendChild(root);
  }
  root.innerHTML = bodyHtml;
  let style = document.getElementById('isolatedPrintStyle');
  if (!style) {
    style = document.createElement('style');
    style.id = 'isolatedPrintStyle';
    document.head.appendChild(style);
  }
  style.textContent = `
${embeddedStyles}
@media screen {
  html,
  body {
    min-height: 100% !important;
    width: auto !important;
  }
  #isolatedPrintRoot {
    background: #ffffff;
    height: 1px;
    left: -10000px;
    overflow: hidden;
    position: fixed;
    top: 0;
    width: 1px;
  }
}
@media print {
  body.printing-isolated-document {
    background: #ffffff !important;
    color-scheme: light;
    margin: 0 !important;
    overflow: visible !important;
    padding: 0 !important;
  }
  body.printing-isolated-document > *:not(#isolatedPrintRoot) {
    display: none !important;
  }
  body.printing-isolated-document #isolatedPrintRoot,
  body.printing-isolated-document #isolatedPrintRoot * {
    visibility: visible !important;
  }
  body.printing-isolated-document #isolatedPrintRoot {
    background: #ffffff !important;
    display: block !important;
    height: auto !important;
    left: auto !important;
    margin: 0 !important;
    overflow: visible !important;
    padding: 0 !important;
    position: static !important;
    top: auto !important;
    width: auto !important;
  }
}`;
  await waitForImages(root, 5000);
  const printClasses = ['printing-isolated-document'];
  if (modeClass) printClasses.push(modeClass);
  document.body.classList.add(...printClasses);
  let fallbackTimer = null;
  let printMedia = null;
  const cleanup = () => {
    document.body.classList.remove(...printClasses);
    root.remove();
    style.remove();
    window.removeEventListener('afterprint', cleanup);
    if (printMedia?.removeEventListener) printMedia.removeEventListener('change', handlePrintMediaChange);
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
  };
  const handlePrintMediaChange = (event) => {
    if (!event.matches) cleanup();
  };
  const slowCleanup = useSlowPrintCleanup();
  if (!slowCleanup) window.addEventListener('afterprint', cleanup, { once: true });
  if (!slowCleanup && window.matchMedia) {
    printMedia = window.matchMedia('print');
    printMedia.addEventListener?.('change', handlePrintMediaChange);
  }
  fallbackTimer = window.setTimeout(cleanup, 120000);
  window.print();
  return true;
}

async function openHotspotVoucherPrintModal(vouchers = []) {
  const rows = vouchers.filter(Boolean);
  if (!rows.length) {
    setToast('Pilih voucher Hotspot dulu');
    return;
  }
  await Promise.all([
    ensureHotspotVoucherTemplates(),
    ensureHotspotVoucherAdminPhone()
  ]);
  const activeTemplate = hotspotVoucherPrintTemplate();
  const qrAssets = await hotspotVoucherQrAssets(rows, 1024);
  const printTemplate = {
    ...activeTemplate,
    qrSources: qrAssets.sources,
    qrSvgs: qrAssets.svgs
  };
  const useIsolatedMikhmonA4 = !String(activeTemplate.customHtml || '').trim()
    && hotspotVoucherLayoutValue(activeTemplate) === 'mikhmon-compact';
  const defaultPrintMode = hotspotVoucherLayoutValue(activeTemplate) === 'thermal' ? 'thermal-80' : 'a4';
  const isolatedDocuments = {
    a4: useIsolatedMikhmonA4 ? hotspotVoucherMikhmonPrintDocument(rows, printTemplate) : '',
    'thermal-80': hotspotVoucherThermalPrintDocument(rows, printTemplate, 'thermal-80'),
    'thermal-58': hotspotVoucherThermalPrintDocument(rows, printTemplate, 'thermal-58')
  };
  const isolatedModes = Object.entries(isolatedDocuments)
    .filter(([, documentText]) => String(documentText || '').trim())
    .map(([mode]) => mode)
    .join(' ');
  openModal('Print Voucher Hotspot', `
    <div class="hotspot-voucher-preview">
      <div class="hotspot-voucher-preview-head">
        <strong>${displayNumber(rows.length)} voucher dipilih</strong>
        <label class="field inline-field hotspot-voucher-print-mode">
          <span>Ukuran</span>
          <select id="hotspotVoucherPrintMode">
            <option value="a4" ${defaultPrintMode === 'a4' ? 'selected' : ''}>A4 Portrait - Mikhmon</option>
            <option value="thermal-80" ${defaultPrintMode === 'thermal-80' ? 'selected' : ''}>Thermal 80mm</option>
            <option value="thermal-58" ${defaultPrintMode === 'thermal-58' ? 'selected' : ''}>Thermal 58mm</option>
          </select>
        </label>
        <span class="muted" id="hotspotVoucherPrintModeLabel">${escapeHtml(hotspotVoucherPrintModeLabel(defaultPrintMode))}</span>
        <div class="row-actions hotspot-voucher-print-actions">
          <button class="ghost-button compact" data-close-modal type="button">Tutup</button>
          <button class="button compact" id="printHotspotVouchers" type="button">Print Browser</button>
        </div>
      </div>
      ${isolatedModes ? `
        <div class="hotspot-voucher-print-isolated" data-hotspot-voucher-isolated data-isolated-modes="${escapeHtml(isolatedModes)}">
          <iframe id="hotspotVoucherPrintFrame" title="Preview voucher Mikhmon"></iframe>
        </div>
      ` : ''}
      <div class="hotspot-voucher-print-stack print-mode-${escapeHtml(defaultPrintMode)}">
        ${chunkItems(rows, rows.length).map((pageRows, pageIndex) => `
          <div class="hotspot-voucher-print-page">
            ${pageRows.map((row, rowIndex) => hotspotVoucherTicket(row, rowIndex)).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `, async () => {});
  const printFrame = document.getElementById('hotspotVoucherPrintFrame');
  const setPrintFrameDocument = (mode = 'a4') => {
    const documentText = isolatedDocuments[mode] || '';
    if (!printFrame || !documentText) return false;
    if (printFrame.dataset.printMode !== mode) {
      printFrame.srcdoc = documentText;
      printFrame.dataset.printMode = mode;
    }
    return true;
  };
  const modeInput = document.getElementById('hotspotVoucherPrintMode');
  const printButton = document.getElementById('printHotspotVouchers');
  modeInput?.addEventListener('change', () => {
    const mode = setHotspotVoucherPrintMode(modeInput.value);
    setPrintFrameDocument(mode);
    updateThermalPrintButtonLabel(printButton, mode);
  });
  setPrintFrameDocument(defaultPrintMode);
  setHotspotVoucherPrintMode(modeInput?.value || defaultPrintMode);
  updateThermalPrintButtonLabel(printButton, modeInput?.value || defaultPrintMode);
  printButton?.addEventListener('click', async () => {
    const mode = setHotspotVoucherPrintMode(modeInput?.value || 'a4');
    if (shouldUseRawBtBridge(mode) && openRawBtTextPrint(hotspotVoucherRawBtText(rows, printTemplate, mode))) return;
    if (mode !== 'a4' && isolatedDocuments[mode]) {
      const printed = await printIsolatedHtmlDocument(isolatedDocuments[mode], `hotspot-voucher-print-${mode}`);
      if (printed) return;
    }
    if (setPrintFrameDocument(mode) && printFrame && !printFrame.closest('[data-hotspot-voucher-isolated]')?.hidden) {
      await waitForFrameReady(printFrame);
      await waitForImages(printFrame.contentDocument, 5000);
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
      return;
    }
    await waitForImages(document.querySelector('.hotspot-voucher-print-stack'));
    applyHotspotVoucherPrintPageStyle(mode);
    document.body.classList.add('printing-hotspot-vouchers');
    document.body.classList.add(`hotspot-voucher-print-${mode}`);
    let fallbackTimer = null;
    let printMedia = null;
    const cleanupPrintMode = () => {
      document.body.classList.remove('printing-hotspot-vouchers', 'hotspot-voucher-print-a4', 'hotspot-voucher-print-thermal-58', 'hotspot-voucher-print-thermal-80');
      clearHotspotVoucherPrintPageStyle();
      window.removeEventListener('afterprint', cleanupPrintMode);
      if (printMedia?.removeEventListener) printMedia.removeEventListener('change', handlePrintMediaChange);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
    const handlePrintMediaChange = (event) => {
      if (!event.matches) cleanupPrintMode();
    };
    const slowCleanup = useSlowPrintCleanup();
    if (!slowCleanup) window.addEventListener('afterprint', cleanupPrintMode, { once: true });
    if (!slowCleanup && window.matchMedia) {
      printMedia = window.matchMedia('print');
      printMedia.addEventListener?.('change', handlePrintMediaChange);
    }
    fallbackTimer = window.setTimeout(cleanupPrintMode, 120000);
    window.print();
  });
}

function radiusUserRows(rows = [], type = 'ppp', writeAllowed = false, startNo = 1, rowWriteAllowed = null) {
  const hotspotUsers = type === 'hotspot';
  const selectableUsers = hotspotUsers || (type === 'ppp' && writeAllowed);
  const selectionKey = hotspotUsers ? 'hotspot' : 'ppp';
  const selectionLabel = hotspotUsers ? 'voucher' : 'user PPP-DHCP';
  return rows.map((row, index) => {
    const online = row.sessionOnline === true || String(row.internetStatus || '').toLowerCase() === 'online';
    const password = row.password || '';
    const sessionIp = row.sessionIpAddress || '';
    const staticIp = row.staticIp || '';
    const normalizedStatus = String(row.status || '').toLowerCase();
    const canWriteRow = writeAllowed && (typeof rowWriteAllowed !== 'function' || rowWriteAllowed(row));
    return `
    <tr>
      ${selectableUsers ? `<td class="select-cell"><input type="checkbox" data-radius-${selectionKey}-select="${index}" aria-label="Pilih ${selectionLabel} ${escapeHtml(row.username || '')}"></td>` : ''}
      <td class="nowrap">${displayNumber(startNo + index)}</td>
      <td>${hotspotUsers ? hotspotVoucherQrButton(row, index) : escapeHtml(row.type || row.service || 'PPPoE')}</td>
      <td>
        <strong>${escapeHtml(row.username || '-')}</strong>
        ${hotspotUsers
          ? (row.note ? `<div class="muted">Catatan: ${escapeHtml(row.note)}</div>` : '')
          : (row.customerName || row.owner ? `<div class="muted">${escapeHtml(row.customerName || row.owner)}</div>` : '')}
      </td>
      <td>
        ${password ? `<span class="password-text">${escapeHtml(password)}</span>` : '<span class="muted">-</span>'}
      </td>
      <td>
        <strong>${escapeHtml(row.profile || '-')}</strong>
        ${(row.createdByName || row.createdByUsername) ? `<div class="muted">Dibuat oleh ${escapeHtml(row.createdByName || row.createdByUsername)}</div>` : ''}
      </td>
      <td>
        ${nasActiveBadge(row.nas || row.site || '-')}
        ${sessionIp || staticIp ? `<div class="muted">${sessionIp ? 'Session' : 'Static'} IP: ${escapeHtml(sessionIp || staticIp)}</div>` : '<div class="muted">IP dinamis</div>'}
      </td>
      <td>
        <span class="badge ${radiusStatusBadge(row.status)}">${escapeHtml(radiusStatusLabel(row.status))}</span>
        ${row.billingIsolationOverride ? '<div><span class="badge pending">Aktif manual</span></div>' : ''}
        ${row.isolatedAt ? `<div class="muted">Isolir: ${escapeHtml(dateText(row.isolatedAt))}</div>` : ''}
        ${row.terminatedAt ? `<div class="muted">Terminate: ${escapeHtml(dateText(row.terminatedAt))}</div>` : ''}
      </td>
      <td>${radiusInternetCell(row)}</td>
      ${writeAllowed ? `
        <td class="radius-actions-cell">
          ${canWriteRow ? `<details class="action-menu">
            <summary aria-label="Aksi user">...</summary>
            <div class="action-menu-panel">
              <button type="button" data-edit-radius-${type}="${escapeHtml(row.id)}">Edit</button>
              ${row.status === 'active' ? `<button type="button" data-status-radius-${type}="${escapeHtml(row.id)}" data-next-status="isolated">Isolir</button>` : `<button type="button" data-status-radius-${type}="${escapeHtml(row.id)}" data-next-status="active">${type === 'ppp' && ['isolated', 'isolir', 'suspend', 'suspended'].includes(normalizedStatus) ? 'Aktifkan sementara' : 'Aktifkan'}</button>`}
              ${!['terminate', 'terminated'].includes(normalizedStatus) ? `<button type="button" class="danger-text" data-status-radius-${type}="${escapeHtml(row.id)}" data-next-status="terminated">Terminate</button>` : ''}
              <button type="button" class="danger-text" data-delete-radius-${type}="${escapeHtml(row.id)}" data-radius-username="${escapeHtml(row.username || '')}">Hapus</button>
            </div>
          </details>` : '<span class="muted">Terkunci</span>'}
        </td>
      ` : ''}
    </tr>
  `;
  }).join('');
}

function radiusSessionRows(rows = [], type = 'ppp', writeAllowed = false) {
  return rows.map((row, index) => `
    <tr>
      <td>
        <strong>${escapeHtml(row.username || '-')}</strong>
        <div class="muted">${escapeHtml(row.customerName || '-')}</div>
      </td>
      <td>${nasActiveBadge(row.nas || row.site || '-')}</td>
      <td>
        <span>${escapeHtml(row.ipAddress || '-')}</span>
        <div class="muted">${escapeHtml(row.macAddress || '-')}</div>
      </td>
      <td>${escapeHtml(row.uptime || '-')}</td>
      <td>
        <span>${escapeHtml(row.totalUsageText || row.usageText || '-')}</span>
        <div class="muted">${escapeHtml(row.usageText || `U ${row.upload || '-'} / D ${row.download || '-'}`)}</div>
        ${row.usageNote ? `<div class="muted">${escapeHtml(row.usageNote)}</div>` : ''}
      </td>
      <td><span class="badge ${radiusStatusBadge(row.status)}">${escapeHtml(radiusStatusLabel(row.status))}</span></td>
      <td>${radiusDate(row.updatedAt || row.startedAt)}</td>
      ${writeAllowed ? `
        <td>
          <button class="danger-button compact" type="button" data-kick-radius-${type}-session="${index}">Kick</button>
        </td>
      ` : ''}
    </tr>
  `).join('');
}

function radiusProfileRows(rows = [], type = 'ppp', writeAllowed = false) {
  return rows.map((row) => `
    <tr>
      <td>
        <strong>${escapeHtml(row.name || '-')}</strong>
        <div class="muted">${row.useMikrotikProfile ? `MikroTik: ${escapeHtml(row.mikrotikGroup || '-')}` : 'Limit manual'}</div>
        ${type === 'hotspot' ? `<div class="muted">Validity ${escapeHtml(row.validity || '-')} · Quota ${escapeHtml(row.quota || '-')} · Shared ${escapeHtml(row.sharedUsers || 1)}</div>` : ''}
      </td>
      <td>${row.price ? rupiah(row.price) : '-'}</td>
      <td>
        <span>${escapeHtml(row.rateLimit || '-')}</span>
        <div class="muted">${escapeHtml(row.rateLimitText || '')}</div>
      </td>
      <td>
        <span>${escapeHtml(row.burstLimit || '-')}</span>
        <div class="muted">Threshold: ${escapeHtml(row.burstThreshold || '-')}</div>
      </td>
      <td>
        <span>${escapeHtml(row.minRate || '-')}</span>
        <div class="muted">Priority ${escapeHtml(row.priority || 8)}</div>
        ${!row.useMikrotikProfile && row.queueType ? `<div class="muted">Queue ${escapeHtml(row.queueType)}</div>` : ''}
      </td>
      <td><span class="badge active">${type === 'hotspot' ? escapeHtml(expiredModeLabel(row.expiredMode)) : 'Auto'}</span></td>
      ${writeAllowed ? `
        <td>
          <div class="row-actions">
            <button class="ghost-button compact" type="button" data-edit-radius-${type}-profile="${escapeHtml(row.id)}">Edit</button>
            <button class="danger-button compact" type="button" data-delete-radius-${type}-profile="${escapeHtml(row.id)}" data-radius-profile-name="${escapeHtml(row.name || '')}">Hapus</button>
          </div>
        </td>
      ` : ''}
    </tr>
  `).join('');
}

function radiusTemplateRows(rows = [], writeAllowed = false) {
  return rows.map((row) => {
    const layout = hotspotVoucherLayoutValue(row);
    const custom = String(row.customHtml || '').trim();
    return `
      <tr>
        <td>
          <strong>${escapeHtml(row.name || '-')}</strong>
          <div class="muted">${escapeHtml(row.title || row.id || '-')} · ${escapeHtml(hotspotVoucherLayoutLabel(layout))}${custom ? ' · HTML custom' : ''}</div>
        </td>
        <td>
          <span>${escapeHtml(row.instruction || row.subtitle || '-')}</span>
          <div class="muted">CS otomatis dari WA tertaut/Public Info</div>
        </td>
        <td><span class="badge ${row.active === false ? 'inactive' : 'active'}">${row.active === false ? 'Nonaktif' : 'Aktif'}</span></td>
        ${writeAllowed ? `
          <td>
            <div class="row-actions wa-template-actions">
              <button class="ghost-button compact" type="button" data-edit-radius-hotspot-template="${escapeHtml(row.id)}">Edit</button>
              ${row.builtin === true ? '' : `<button class="danger-button compact" type="button" data-delete-radius-hotspot-template="${escapeHtml(row.id)}" data-radius-template-name="${escapeHtml(row.name || '')}">Hapus</button>`}
              <button class="ghost-button compact" type="button" data-edit-radius-hotspot-template-html="${escapeHtml(row.id)}">Edit HTML</button>
            </div>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');
}

function radiusHotspotVoucherOnlinePanel(payload = {}, writeAllowed = false) {
  const settings = payload.settings || {};
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
  const nas = Array.isArray(payload.nas) ? payload.nas : [];
  const integrations = payload.integrations || {};
  const nasOptions = nas
    .filter((item) => item.id || item.name || item.ipAddress)
    .map((item) => ({
      label: item.name || item.ipAddress || item.id,
      value: item.id || item.name || item.ipAddress
    }));
  const profileRows = profiles.map((profile) => {
    const online = profile.online || {};
    const profileId = String(profile.id || '');
    return `
      <article class="voucher-online-package">
        <div class="voucher-online-package-summary">
          <label class="inline-check voucher-online-package-toggle">
            <input type="checkbox" name="pkgEnabled_${escapeHtml(profileId)}" ${online.enabled ? 'checked' : ''} ${writeAllowed ? '' : 'disabled'}>
            <span>Jual Online</span>
          </label>
          <strong>${escapeHtml(profile.name || '-')}</strong>
          <span>${profile.price ? rupiah(profile.price) : '-'}${profile.validity ? ` · ${escapeHtml(profile.validity)}` : ''}${profile.quota ? ` · ${escapeHtml(profile.quota)}` : ''}</span>
        </div>
        <label class="voucher-online-package-field package-label-field">
          <span>Nama Paket</span>
          <input class="control compact-input" name="pkgLabel_${escapeHtml(profileId)}" value="${escapeHtml(online.label || profile.name || '')}" ${writeAllowed ? '' : 'disabled'}>
        </label>
        <label class="voucher-online-package-field package-nas-field">
          <span>NAS Penjualan</span>
          <select class="control compact-input" name="pkgNas_${escapeHtml(profileId)}" ${writeAllowed ? '' : 'disabled'}>
            ${radiusOptionTags(nasOptions, online.nasId || '', 'Pilih NAS')}
          </select>
        </label>
        <label class="voucher-online-package-field package-number-field">
          <span>Maks/Order</span>
          <input class="control compact-input" name="pkgMax_${escapeHtml(profileId)}" type="number" min="1" max="50" value="${escapeHtml(online.maxPerOrder || 1)}" ${writeAllowed ? '' : 'disabled'}>
        </label>
        <label class="voucher-online-package-field package-number-field">
          <span>Urutan</span>
          <input class="control compact-input" name="pkgSort_${escapeHtml(profileId)}" type="number" min="0" max="999" value="${escapeHtml(online.sort || 0)}" ${writeAllowed ? '' : 'disabled'}>
        </label>
        <div class="voucher-online-package-stock">
          <span>Stok Aktif</span>
          <strong>${displayNumber(online.activeVouchers || 0)}</strong>
        </div>
      </article>
    `;
  }).join('');
  return `
    <div class="stack compact-stack voucher-online-panel">
      <section class="voucher-online-summary">
        <div class="voucher-online-summary-item ${settings.enabled ? 'is-positive' : ''}">
          <span>Channel</span>
          <strong>${settings.enabled ? 'Aktif' : 'Off'}</strong>
          <small>${escapeHtml(settings.publicPath || '/voucher')}</small>
        </div>
        <div class="voucher-online-summary-item">
          <span>Paket Jual</span>
          <strong>${displayNumber(payload.summary?.enabledPackageCount || 0)}</strong>
          <small>${displayNumber(payload.summary?.profileCount || 0)} profile Hotspot</small>
        </div>
        <div class="voucher-online-summary-item ${integrations.paymentGatewayEnabled ? 'is-positive' : 'is-warning'}">
          <span>Payment</span>
          <strong>${integrations.paymentGatewayEnabled ? 'QRIS Aktif' : 'Off'}</strong>
          <small>${escapeHtml(integrations.paymentGatewayProvider || '-')}</small>
        </div>
        <div class="voucher-online-summary-item">
          <span>Format Voucher</span>
          <strong>Username = Password</strong>
          <small>${displayNumber(settings.codeLength || 6)} karakter${settings.codePrefix ? ` · ${escapeHtml(settings.codePrefix)}` : ''}</small>
        </div>
      </section>
      <form id="hotspotVoucherOnlineForm" class="form-panel voucher-online-form">
        <div class="section-head">
          <div>
            <h2>Pengaturan Voucher Online</h2>
            <span class="muted">Channel penjualan dan format voucher</span>
          </div>
          ${writeAllowed ? '<button class="button compact voucher-online-save" type="submit">Simpan</button>' : ''}
        </div>
        <div class="voucher-online-settings-grid">
          <label class="field">
            <span>Judul Halaman</span>
            <input name="title" value="${escapeHtml(settings.title || 'Beli Voucher Hotspot')}" ${writeAllowed ? '' : 'disabled'}>
          </label>
          <label class="field">
            <span>NAS Default</span>
            <select name="defaultNas" ${writeAllowed ? '' : 'disabled'}>${radiusOptionTags(nasOptions, settings.defaultNas || '', 'Auto')}</select>
          </label>
          <label class="field">
            <span>Metode Payment</span>
            <input value="QRIS" disabled>
          </label>
          <label class="field">
            <span>Panjang Kode Voucher</span>
            <input name="codeLength" type="number" min="3" max="32" value="${escapeHtml(settings.codeLength || 6)}" ${writeAllowed ? '' : 'disabled'}>
          </label>
          <label class="field">
            <span>Prefix/Suffix Kode</span>
            <input name="codePrefix" value="${escapeHtml(settings.codePrefix || '')}" placeholder="-area" ${writeAllowed ? '' : 'disabled'}>
          </label>
          <label class="field">
            <span>Karakter Kode</span>
            <select name="codeCharacter" ${writeAllowed ? '' : 'disabled'}>
              ${radiusOptionTags([
                { value: 'mixed', label: 'Campuran aman' },
                { value: 'number', label: 'Angka' },
                { value: 'upper', label: 'Huruf besar' },
                { value: 'lower', label: 'Huruf kecil' },
                { value: 'upper-number', label: 'Huruf besar + angka' },
                { value: 'lower-number', label: 'Huruf kecil + angka' }
              ], settings.codeCharacter || 'mixed')}
            </select>
          </label>
        </div>
        <div class="voucher-online-toggle-grid">
          <label class="field checkbox-field">
            <input name="enabled" type="checkbox" value="true" ${settings.enabled ? 'checked' : ''} ${writeAllowed ? '' : 'disabled'}>
            <span>Aktifkan channel</span>
          </label>
          <label class="field checkbox-field">
            <input name="autoGenerateOnPaid" type="checkbox" value="true" ${settings.autoGenerateOnPaid !== false ? 'checked' : ''} ${writeAllowed ? '' : 'disabled'}>
            <span>Generate setelah paid</span>
          </label>
          <label class="field checkbox-field">
            <input name="requireWhatsapp" type="checkbox" value="true" ${settings.requireWhatsapp !== false ? 'checked' : ''} ${writeAllowed ? '' : 'disabled'}>
            <span>Wajib nomor WA</span>
          </label>
          <label class="field checkbox-field">
            <input name="sendVoucherWa" type="checkbox" value="true" ${settings.sendVoucherWa !== false ? 'checked' : ''} ${writeAllowed ? '' : 'disabled'}>
            <span>Aktifkan notifikasi voucher via WA</span>
          </label>
          <label class="field checkbox-field">
            <input name="showPrice" type="checkbox" value="true" ${settings.showPrice !== false ? 'checked' : ''} ${writeAllowed ? '' : 'disabled'}>
            <span>Tampilkan harga</span>
          </label>
        </div>
        <div class="voucher-online-message-grid">
          <label class="field full">
            <span>Pesan Sukses</span>
            <textarea name="successMessage" rows="3" ${writeAllowed ? '' : 'disabled'}>${escapeHtml(settings.successMessage || '')}</textarea>
          </label>
          <label class="field full">
            <span>Syarat & Ketentuan</span>
            <textarea name="terms" rows="4" ${writeAllowed ? '' : 'disabled'}>${escapeHtml(settings.terms || '')}</textarea>
          </label>
        </div>
        <section class="voucher-online-packages">
          <div class="voucher-online-packages-head">
            <div>
              <h3>Paket Dijual</h3>
              <span class="muted">Pilih paket dan NAS yang tersedia pada portal voucher.</span>
            </div>
            <span class="badge active">${displayNumber(payload.summary?.enabledPackageCount || 0)} aktif</span>
          </div>
          <div class="voucher-online-package-list">
            ${profileRows || '<div class="empty">Belum ada profile Hotspot.</div>'}
          </div>
        </section>
      </form>
    </div>
  `;
}

function radiusNasRows(rows = []) {
  return rows.map((row) => `
    <tr>
      <td>
        <strong>${escapeHtml(row.name || '-')}</strong>
        <div class="muted">${escapeHtml(row.source === 'site' ? 'Monitoring > Site' : 'Manual')}</div>
      </td>
      <td>${escapeHtml(row.ipAddress || '-')}</td>
      <td>${escapeHtml(row.timezone || '-')}</td>
      <td><span class="badge ${row.connected ? 'active' : 'inactive'}">${row.connected ? 'Connected' : 'Unknown'}</span></td>
      <td>${row.credentialStored ? 'Tersimpan' : '-'}</td>
    </tr>
  `).join('');
}

function radiusTable(tab, rows = [], type = 'ppp', writeAllowed = false, startNo = 1, options = {}) {
  if (tab === 'sessions') {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>NAS</th>
              <th>IP/MAC</th>
              <th>Uptime</th>
              <th>Total Usage</th>
              <th>Status</th>
              <th>Update</th>
              ${writeAllowed ? '<th>Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>${rows.length ? radiusSessionRows(rows, type, writeAllowed) : `<tr><td colspan="${writeAllowed ? 8 : 7}">Belum ada session.</td></tr>`}</tbody>
        </table>
      </div>
    `;
  }
  if (tab === 'profiles') {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Profile</th>
              <th>Harga</th>
              <th>Rate Limit</th>
              <th>Burst</th>
              <th>Min/Priority</th>
              <th>${type === 'hotspot' ? 'Expired Mode' : 'Status'}</th>
              ${writeAllowed ? '<th>Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>${rows.length ? radiusProfileRows(rows, type, writeAllowed) : `<tr><td colspan="${writeAllowed ? 7 : 6}">Belum ada profile.</td></tr>`}</tbody>
        </table>
      </div>
    `;
  }
  if (tab === 'templates') {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Template</th>
              <th>Informasi</th>
              <th>Status</th>
              ${writeAllowed ? '<th>Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>${rows.length ? radiusTemplateRows(rows, writeAllowed) : `<tr><td colspan="${writeAllowed ? 4 : 3}">Belum ada template.</td></tr>`}</tbody>
        </table>
      </div>
    `;
  }
  if (tab === 'nas') {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>NAS</th>
              <th>IP Address</th>
              <th>Site</th>
              <th>Status</th>
              <th>Credential</th>
            </tr>
          </thead>
          <tbody>${rows.length ? radiusNasRows(rows) : '<tr><td colspan="5">Belum ada NAS.</td></tr>'}</tbody>
        </table>
      </div>
    `;
  }
  const hotspotUsers = type === 'hotspot';
  const selectableUsers = hotspotUsers || (type === 'ppp' && writeAllowed);
  const selectAllId = hotspotUsers ? 'radiusHotspotSelectAll' : 'radiusPppSelectAll';
  const selectAllLabel = hotspotUsers ? 'Pilih semua voucher Hotspot' : 'Pilih semua user PPP-DHCP';
  const emptyColspan = (selectableUsers ? 9 : 8) + (writeAllowed ? 1 : 0);
  return `
    <div class="table-wrap">
      <table class="radius-table radius-user-table ${writeAllowed ? 'has-row-actions' : ''}">
        <thead>
          <tr>
            ${selectableUsers ? `<th class="select-cell"><input type="checkbox" id="${selectAllId}" aria-label="${selectAllLabel}"></th>` : ''}
            <th>No</th>
            <th>${hotspotUsers ? 'QR' : 'Type'}</th>
            <th>Username</th>
            <th>Password</th>
            <th>Profile</th>
            <th>NAS</th>
            <th>Status</th>
            <th>Internet</th>
            ${writeAllowed ? '<th>Aksi</th>' : ''}
          </tr>
        </thead>
        <tbody>${rows.length ? radiusUserRows(rows, type, writeAllowed, startNo, options.rowWriteAllowed) : `<tr><td colspan="${emptyColspan}">Belum ada user.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function bindRadiusPager(kind, setPage, renderer, setLimit = null) {
  app.querySelectorAll(`[data-${kind}-page]`).forEach((button) => {
    button.addEventListener('click', () => {
      setPage(Math.max(1, Number(button.getAttribute(`data-${kind}-page`) || 1)));
      renderer();
    });
  });
  app.querySelectorAll(`[data-${kind}-limit]`).forEach((select) => {
    select.addEventListener('change', () => {
      if (typeof setLimit === 'function') {
        setLimit(pagerLimitValue(select.value));
      }
      setPage(1);
      renderer();
    });
  });
}

function bindPasswordPeek() {
}

function bindPhotoInputTriggers(root = document) {
  root.querySelectorAll('[data-file-trigger]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const targetId = button.dataset.fileTrigger || '';
      if (!targetId) return;
      const input = root.querySelector(`#${targetId}`);
      if (!input) return;
      const mode = button.dataset.fileMode || 'gallery';
      if (mode === 'camera') {
        input.setAttribute('capture', 'environment');
      } else {
        input.removeAttribute('capture');
      }
      input.value = '';
      input.click();
    });
  });
}

function radiusNasIpForRow(row = {}, nasOptions = []) {
  const match = nasOptions.find((option) => [option.label, option.value, option.ip].includes(row.nas || row.site));
  return match ? match.ip : '';
}

function radiusMemberFieldsMarkup(options = {}) {
  const billing = options.billing || {};
  const bhpUsoEnabled = billing.bhpUsoEnabled === true;
  const bhpUsoRate = Number(billing.bhpUsoRate || 1.25);
  return `
    <section class="form-grid radius-wizard-panel compact-wizard-panel" id="radiusMemberFields" data-radius-wizard-panel="member" data-member-wizard-fields hidden>
      <div class="field full radius-wizard-title"><strong>Member</strong><span>Identitas, kontak, alamat, lokasi, dan dokumentasi pelanggan.</span></div>
      <input type="hidden" name="memberCode" value="" data-member-field disabled>
      <input type="hidden" name="memberRecordOrigin" value="wizard" data-member-field disabled>
      <label class="field">
        <span>Nama Member</span>
        <input name="memberName" data-member-field autocomplete="off" disabled>
      </label>
      <div class="field full member-duplicate-hint" id="radiusMemberDuplicateHint" hidden></div>
      <input type="hidden" name="memberKtpName" value="" data-member-field disabled>
      <label class="field">
        <span>Nomor KTP</span>
        <input name="memberKtp" data-member-field inputmode="numeric" autocomplete="off" disabled>
      </label>
      <label class="field full member-ktp-upload-field">
        <span>Foto KTP</span>
        <div class="photo-upload-actions">
          <button class="ghost-button compact" type="button" data-file-trigger="radiusMemberKtpPhotoUpload" data-file-mode="gallery" data-member-photo-control disabled><i class="fa-solid fa-folder-open" aria-hidden="true"></i> Pilih File</button>
          <button class="ghost-button compact primary" type="button" data-file-trigger="radiusMemberKtpPhotoUpload" data-file-mode="camera" data-member-photo-control disabled><i class="fa-solid fa-camera" aria-hidden="true"></i> Kamera</button>
        </div>
        <input class="sr-only member-photo-file-input" id="radiusMemberKtpPhotoUpload" name="memberKtpPhotoUpload" type="file" accept="image/png,image/jpeg,image/webp" data-member-field disabled>
        <input name="memberKtpPhoto" type="hidden" value="" data-member-field disabled>
        <div class="ktp-upload-preview">
          <img class="member-ktp-photo-preview" id="radiusKtpPhotoPreview" alt="Preview foto KTP" hidden>
          <p class="muted" id="radiusKtpUploadStatus">Opsional. OCR akan mencoba membaca NIK dan nama dari KTP otomatis.</p>
        </div>
      </label>
      <label class="field">
        <span>WhatsApp</span>
        <input name="memberPhone" data-member-field inputmode="tel" autocomplete="off" placeholder="0812xxxx" disabled>
      </label>
      <label class="field">
        <span>Email Pelanggan</span>
        <input name="memberEmail" data-member-field type="email" autocomplete="off" disabled>
      </label>
      <label class="field full">
        <span>Alamat</span>
        <textarea name="memberAddress" rows="2" data-member-field disabled></textarea>
      </label>
      <div class="field full radius-location-field">
        <span>Lokasi Peta</span>
        <div class="row-actions">
          <button class="icon-button compact location-sync-button" id="radiusUseBrowserLocation" type="button" title="Sinkron Lokasi" aria-label="Sinkron Lokasi" disabled>
            <span class="location-sync-icon" aria-hidden="true"></span>
          </button>
          <a class="ghost-button compact button-link" id="radiusLocationMapLink" href="#" target="_blank" rel="noopener" hidden>Buka Peta</a>
        </div>
        <div class="radius-location-inputs">
          <input name="memberLatitude" data-member-field autocomplete="off" placeholder="Latitude" disabled>
          <input name="memberLongitude" data-member-field autocomplete="off" placeholder="Longitude" disabled>
          <input name="memberLocationAccuracy" data-member-field autocomplete="off" placeholder="Akurasi meter" disabled>
        </div>
        <div class="radius-location-map compact-map" id="radiusLeafletMap"></div>
        <p class="muted" id="radiusLocationStatus">Izinkan akses lokasi di browser atau klik peta untuk mengisi koordinat.</p>
      </div>
      <label class="field full">
        <span>Foto Rumah</span>
        <div class="photo-upload-actions">
          <button class="ghost-button compact" type="button" data-file-trigger="radiusMemberHousePhotoUpload" data-file-mode="gallery" data-member-photo-control disabled><i class="fa-solid fa-folder-open" aria-hidden="true"></i> Pilih File</button>
          <button class="ghost-button compact primary" type="button" data-file-trigger="radiusMemberHousePhotoUpload" data-file-mode="camera" data-member-photo-control disabled><i class="fa-solid fa-camera" aria-hidden="true"></i> Kamera</button>
        </div>
        <input class="sr-only member-photo-file-input" id="radiusMemberHousePhotoUpload" name="memberHousePhoto" type="file" accept="image/png,image/jpeg,image/webp" data-member-field disabled>
        <img class="house-photo-preview" id="radiusHousePhotoPreview" alt="Preview foto rumah" hidden>
      </label>
    </section>
    <section class="form-grid radius-wizard-panel compact-wizard-panel" data-radius-wizard-panel="payment" hidden>
      <div class="field full radius-wizard-title"><strong>Payment</strong><span>Harga mengikuti profile, PPN dan diskon nominal tersimpan ke data member.</span></div>
      <label class="field">
        <span>Tipe Pembayaran</span>
        <select name="memberPaymentType" data-member-field disabled>
          <option value="postpaid">Postpaid</option>
          <option value="prepaid">Prepaid</option>
        </select>
      </label>
      <label class="field">
        <span>Periode Billing</span>
        <select name="memberBillingPeriod" id="radiusMemberBillingPeriod" data-member-field disabled>
          <option value="fixed">Fixed Date</option>
          <option value="cycle">Billing Cycle</option>
        </select>
      </label>
      <label class="field">
        <span>Active Date</span>
        ${datePickerControl({ name: 'memberActiveDate', value: todayInput() })}
      </label>
      <label class="field">
        <span>Harga</span>
        <input name="memberPrice" inputmode="numeric" value="" data-member-field autocomplete="off" readonly disabled>
      </label>
      <label class="field">
        <span>VAT/PPN (%)</span>
        <input name="memberPpn" type="number" min="0" max="100" step="0.01" value="" data-member-field autocomplete="off" disabled>
      </label>
      <label class="field">
        <span>Diskon (Rp)</span>
        <input name="memberDiscount" type="number" min="0" step="1" value="" inputmode="numeric" data-member-field autocomplete="off" disabled>
      </label>
      <div class="field full member-addon-editor">
        <input type="hidden" name="memberAddons" value="[]" data-member-field disabled>
        <div class="batch-toolbar compact">
          <span>Add-on layanan bulanan seperti sewa CCTV, STB TV, atau biaya tambahan lain.</span>
          <button class="ghost-button compact" type="button" data-add-member-addon data-member-addon-control disabled>Tambah Add-on</button>
        </div>
        <div class="batch-rows member-addon-rows" data-member-addon-rows></div>
      </div>
      <div class="field full notice ${bhpUsoEnabled ? 'info' : ''}">
        <strong>BHP USO</strong>
        <span>${bhpUsoEnabled ? `Aktif ${bhpUsoRate}% dan otomatis ditambahkan ke total tagihan.` : 'Tidak aktif pada Billing Settings.'}</span>
      </div>
      <label class="field">
        <span>Status Invoice Awal</span>
        <select name="memberInvoiceStatus" data-member-field disabled>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </label>
    </section>
    <section class="radius-wizard-panel radius-review-panel" data-radius-wizard-panel="review" hidden>
      <div class="radius-wizard-title"><strong>Review</strong><span>Periksa data sebelum user dibuat.</span></div>
      <div class="radius-review-grid">
        <div><span>Type</span><strong data-radius-review="type">-</strong></div>
        <div><span>Username / MAC</span><strong data-radius-review="username">-</strong></div>
        <div><span>Profile</span><strong data-radius-review="profile">-</strong></div>
        <div><span>NAS</span><strong data-radius-review="nas">-</strong></div>
        <div><span>Nama Member</span><strong data-radius-review="memberName">-</strong></div>
        <div><span>WhatsApp</span><strong data-radius-review="phone">-</strong></div>
        <div><span>Payment</span><strong data-radius-review="payment">-</strong></div>
        <div><span>Harga Profile</span><strong data-radius-review="price">-</strong></div>
        <div><span>Add-on</span><strong data-radius-review="addons">-</strong></div>
        <div><span>PPN</span><strong data-radius-review="ppn">-</strong></div>
        <div><span>Diskon</span><strong data-radius-review="discount">-</strong></div>
        <div><span>BHP USO</span><strong data-radius-review="bhpUso">-</strong></div>
        <div><span>Total Tagihan Perbulan</span><strong data-radius-review="total">-</strong></div>
        <div><span>Active Date</span><strong data-radius-review="activeDate">-</strong></div>
        <div><span>Status Invoice</span><strong data-radius-review="invoiceStatus">-</strong></div>
      </div>
      <section class="notice">
        <strong>Konfirmasi pembuatan user</strong>
        <span>Jika status invoice awal Unpaid, user akan tersimpan sebagai pending dan belum aktif di FreeRADIUS sampai pembayaran pertama dicatat.</span>
      </section>
    </section>
  `;
}

function radiusPppUserFormBody(user = null, options = {}) {
  const type = user?.service === 'DHCP' || user?.type === 'DHCP' ? 'DHCP' : 'PPPoE';
  const bhpUsoEnabled = options.billing?.bhpUsoEnabled === true;
  const bhpUsoRate = Number(options.billing?.bhpUsoRate || 1.25);
  const selectedNas = user ? radiusNasIpForRow(user, options.nas || []) : '';
  const selectedProfile = user?.profile || user?.profileName || '';
  const canAddMember = !user && state.auth?.role !== 'reseller_voucher' && canAny([
    'customers:manage',
    'members:contact:write',
    'radius:write',
    'radius:ppp-users:write'
  ]);
  const accountFields = `
    <label class="field">
      <span>Tipe</span>
      <select name="type" id="radiusPppType">
        <option value="PPPoE" ${type === 'PPPoE' ? 'selected' : ''}>PPPoE</option>
        <option value="DHCP" ${type === 'DHCP' ? 'selected' : ''}>DHCP</option>
      </select>
    </label>
    ${canAddMember && !user ? `
      <label class="field full checkbox-field" data-auto-ppp-field>
        <input name="autoPppCredential" id="radiusAutoPppCredential" type="checkbox" value="true" checked>
        <span>Buat username & password otomatis dari Member ID</span>
      </label>
      <div class="field full notice info" id="radiusAutoCredentialPreview" data-auto-ppp-field>
        <strong>Auto credential</strong>
        <span>Member ID akan dipakai sebagai password, username mengikuti domain site/NAS jika tersedia.</span>
      </div>
    ` : ''}
    <label class="field" data-ppp-credential>
      <span>Username</span>
      <input name="username" value="${escapeHtml(user?.username || '')}" autocomplete="off" required>
    </label>
    <label class="field" data-ppp-credential>
      <span>Password</span>
      <input name="password" type="text" autocomplete="off" ${user ? 'placeholder="Kosongkan jika tidak diubah"' : 'required'}>
    </label>
    <label class="field" data-dhcp-field>
      <span>MAC Address</span>
      <input name="macAddress" value="${escapeHtml(user?.macAddress || '')}" autocomplete="off" placeholder="Untuk DHCP">
    </label>
    <label class="field">
      <span>Profile</span>
      <select name="profile" id="radiusPppProfile" ${user ? '' : 'required'}>${radiusOptionTags(options.profiles || [], user?.profile || selectedProfile, 'None')}</select>
    </label>
    ${canAddMember && !user ? `
      <label class="field full checkbox-field radius-add-member-choice">
        <input name="addToMember" id="radiusAddToMember" type="checkbox" value="true">
        <span>Tambahkan ke Member</span>
      </label>
    ` : ''}
    <label class="field">
      <span>NAS</span>
      <select name="nas">${radiusOptionTags((options.nas || []).map((item) => ({ label: item.label, value: item.ip })), selectedNas, 'All')}</select>
    </label>
    <label class="field">
      <span>IP Address</span>
      <input name="ipAddress" value="${escapeHtml(user?.staticIp || '')}" autocomplete="off" placeholder="Kosongkan untuk IP dinamis dari pool/profile">
    </label>
    <label class="field">
      <span>Service Name</span>
      <input name="service" value="${escapeHtml(user?.serviceName || '')}" autocomplete="off" placeholder="Any">
    </label>
  `;

  if (user || !canAddMember) {
    return `
      <div class="form-grid">
        ${accountFields}
      </div>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Batal</button>
        <button class="button" id="radiusWizardSubmit" type="submit">Simpan</button>
      </div>
    `;
  }

  return `
    <div class="radius-user-wizard" data-radius-ppp-wizard data-bhp-uso-enabled="${bhpUsoEnabled ? '1' : '0'}" data-bhp-uso-rate="${escapeHtml(String(bhpUsoRate))}">
      <div class="radius-wizard-steps MuiStepper-root MuiStepper-horizontal">
        ${['Account', 'Member', 'Payment', 'Review'].map((label, index) => `
          <button class="radius-wizard-step MuiStep-root MuiStep-horizontal ${index === 0 ? 'is-active' : ''}" type="button" data-radius-wizard-goto="${index}" ${!canAddMember && index > 0 ? 'disabled' : ''}>
            <span class="radius-step-icon">${index + 1}</span>
            <span class="radius-step-label">${escapeHtml(label)}</span>
          </button>
        `).join('')}
      </div>
      <section class="form-grid radius-wizard-panel" data-radius-wizard-panel="account">
        <div class="field full radius-wizard-title"><strong>Account</strong><span>Data akun Radius dan NAS.</span></div>
        ${accountFields}
      </section>
      ${canAddMember ? radiusMemberFieldsMarkup(options) : ''}
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      ${canAddMember ? '<button class="ghost-button" id="radiusWizardPrev" type="button">Kembali</button><button class="button" id="radiusWizardNext" type="button">Next</button>' : ''}
      <button class="button" id="radiusWizardSubmit" type="submit" formnovalidate ${canAddMember ? 'hidden' : ''}>Simpan</button>
    </div>
  `;
}

function radiusHotspotUserFormBody(user = null, options = {}) {
  const lockedNasOptions = state.auth?.role === 'reseller_voucher' ? currentUserLockedNasOptions(options.nas || []) : [];
  const profileOptions = radiusProfilesForLockedNas(options, lockedNasOptions);
  const freeOnly = can('radius:hotspot-free:write') && !can('radius:write');
  const userNasValue = user ? String(user.nasId || radiusNasIpForRow(user, options.nas || []) || '') : '';
  const selectedLockedNas = lockedNasOptions.find((nas) => [nas.id, nas.value, nas.ip, nas.label].some((value) => String(value || '') === userNasValue));
  const selectedNas = lockedNasOptions.length
    ? (selectedLockedNas?.id || (lockedNasOptions.length === 1 ? lockedNasOptions[0].id : ''))
    : userNasValue;
  const selectedProfile = user?.profile || user?.profileName || '';
  const selectedPaymentStatus = freeOnly
    ? 'free'
    : ['paid', 'unpaid', 'free'].includes(String(user?.paymentStatus || '').toLowerCase())
    ? String(user?.paymentStatus || '').toLowerCase()
    : 'paid';
  return `
    <div class="form-grid">
      <label class="field">
        <span>Username</span>
        <input name="username" value="${escapeHtml(user?.username || '')}" autocomplete="off" required>
      </label>
      <label class="field full">
        <span>Catatan pembeli</span>
        <textarea name="note" rows="2" autocomplete="off" placeholder="Nama pembeli/reseller offline">${escapeHtml(user?.note || '')}</textarea>
      </label>
      <label class="field">
        <span>Password</span>
        <input name="password" type="text" autocomplete="off" ${user ? 'placeholder="Kosongkan jika tidak diubah"' : ''}>
      </label>
      ${lockedNasOptions.length ? resellerNasTargetField('nasId', lockedNasOptions, selectedNas, 'NAS Tujuan') : `
        <label class="field">
          <span>NAS</span>
          <select name="routerNas">${radiusOptionTags((options.nas || []).map((item) => ({ label: item.label, value: item.ip })), selectedNas, 'All')}</select>
        </label>
      `}
      <label class="field">
        <span>Profile</span>
        <select name="profile" id="radiusHotspotProfile" ${user ? '' : 'required'}>${radiusOptionTags(profileOptions, selectedProfile, 'None')}</select>
      </label>
      <label class="field">
        <span>Hotspot Server</span>
        <input name="hotspotServer" value="${escapeHtml(user?.hotspotServer || user?.server || '')}" autocomplete="off" placeholder="all">
      </label>
      ${freeOnly ? `
        <input type="hidden" name="paymentStatus" value="free">
        <input type="hidden" name="amount" value="0">
      ` : `
      <label class="field">
        <span>Payment Status</span>
        <select name="paymentStatus" id="radiusHotspotPaymentStatus">
          <option value="paid" ${selectedPaymentStatus === 'paid' ? 'selected' : ''}>Paid</option>
          <option value="unpaid" ${selectedPaymentStatus === 'unpaid' ? 'selected' : ''}>Unpaid</option>
          <option value="free" ${selectedPaymentStatus === 'free' ? 'selected' : ''}>Free</option>
        </select>
      </label>
      <label class="field">
        <span>Amount/Harga</span>
        <input name="amount" id="radiusHotspotAmount" inputmode="numeric" value="${escapeHtml(user?.amount || user?.price || '')}" autocomplete="off" placeholder="0">
      </label>
      `}
      <input type="hidden" name="status" value="${escapeHtml(user?.status || 'active')}">
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan</button>
    </div>
  `;
}

function radiusProfileFormBody(profile = null, type = 'ppp') {
  const hotspot = type === 'hotspot';
  const useMikrotikProfile = profile?.useMikrotikProfile === true || (Boolean(profile?.mikrotikGroup) && !profile?.rateLimit);
  const queueType = profile?.queueType || '';
  const queueTypeOptions = hotspot
    ? [
        ['', 'Ikuti default NAS'],
        ['hotspot-default', 'Hotspot Default'],
        ['default', 'Default'],
        ['default-small', 'Default Small'],
        ['cake-default', 'CAKE Default']
      ]
    : [
        ['', 'Ikuti default NAS'],
        ['default', 'Default'],
        ['default-small', 'Default Small'],
        ['pcq-default', 'PCQ Default'],
        ['cake-default', 'CAKE Default']
      ];
  return `
    <div class="form-grid">
      <label class="field">
        <span>Nama Profile</span>
        <input name="name" value="${escapeHtml(profile?.name || '')}" autocomplete="off" required>
      </label>
      <label class="field checkbox-field">
        <input name="useMikrotikProfile" id="radiusProfileUseMikrotik" type="checkbox" value="true" ${useMikrotikProfile ? 'checked' : ''}>
        <span>Link ke Profile MikroTik</span>
      </label>
      <label class="field" data-profile-mikrotik-field>
        <span>Profile MikroTik</span>
        <input name="mikrotikGroup" value="${escapeHtml(profile?.mikrotikGroup || '')}" autocomplete="off" placeholder="Nama profile/group di MikroTik" ${useMikrotikProfile ? 'required' : ''}>
      </label>
      <label class="field">
        <span>Harga</span>
        <input name="price" inputmode="numeric" value="${escapeHtml(profile?.price || '')}" autocomplete="off" placeholder="0">
      </label>
      ${hotspot ? `
        <label class="field">
          <span>Validity</span>
          <input name="validity" value="${escapeHtml(profile?.validity || '')}" autocomplete="off" placeholder="30d, 12h, 60m">
        </label>
        <label class="field">
          <span>Quota</span>
          <input name="quota" value="${escapeHtml(profile?.quota || '')}" autocomplete="off" placeholder="10GB, 500MB">
        </label>
        <label class="field">
          <span>Shared User</span>
          <input name="sharedUsers" type="number" min="1" value="${escapeHtml(profile?.sharedUsers || 1)}">
        </label>
        <label class="field">
          <span>Expired Mode</span>
          <select name="expiredMode">
            ${[
              ['none', 'None'],
              ['remove', 'Remove'],
              ['remove-record', 'Remove & Record'],
              ['notice', 'Notice'],
              ['notice-record', 'Notice & Record']
            ].map(([value, label]) => `<option value="${value}" ${String(profile?.expiredMode || 'none') === value ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      ` : ''}
      <label class="field" data-profile-manual-field>
        <span>Rate Limit</span>
        <input name="rateLimit" value="${escapeHtml(profile?.rateLimit || '')}" autocomplete="off" placeholder="10M/10M">
      </label>
      <label class="field" data-profile-manual-field>
        <span>Burst Limit</span>
        <input name="burstLimit" value="${escapeHtml(profile?.burstLimit || '')}" autocomplete="off" placeholder="20M/20M">
      </label>
      <label class="field" data-profile-manual-field>
        <span>Burst Threshold</span>
        <input name="burstThreshold" value="${escapeHtml(profile?.burstThreshold || '')}" autocomplete="off" placeholder="8M/8M">
      </label>
      <label class="field" data-profile-manual-field>
        <span>Burst Time</span>
        <input name="burstTime" value="${escapeHtml(profile?.burstTime || '')}" autocomplete="off" placeholder="16s/16s">
      </label>
      <label class="field" data-profile-manual-field>
        <span>Min Rate</span>
        <input name="minRate" value="${escapeHtml(profile?.minRate || '')}" autocomplete="off" placeholder="2M/2M">
      </label>
      <label class="field" data-profile-manual-field>
        <span>Priority</span>
        <select name="priority">
          ${[1, 2, 3, 4, 5, 6, 7, 8].map((number) => `<option value="${number}" ${Number(profile?.priority || 8) === number ? 'selected' : ''}>${number}</option>`).join('')}
        </select>
      </label>
      <label class="field" data-profile-manual-field>
        <span>Queue Type</span>
        <select name="queueType">
          ${queueTypeOptions.map(([value, label]) => `<option value="${escapeHtml(value)}" ${queueType === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
        </select>
      </label>
      <label class="field full">
        <span>Catatan</span>
        <textarea name="note">${escapeHtml(profile?.note || '')}</textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan</button>
    </div>
  `;
}

function radiusCredentialDomainFromText(value = '') {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  const domain = text.match(/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/);
  return domain ? domain[0].replace(/[^a-z0-9.-]/g, '') : '';
}

function radiusSelectedNasDomain() {
  const select = modalBody.querySelector('select[name="nas"]');
  const selectedText = select?.selectedOptions?.[0]?.textContent || '';
  const selectedValue = select?.value || '';
  return radiusCredentialDomainFromText(selectedText)
    || radiusCredentialDomainFromText(selectedValue)
    || radiusCredentialDomainFromText(currentBranding().businessName);
}

async function ensureRadiusMemberCodePreview() {
  const input = modalBody.querySelector('input[name="memberCode"]');
  if (!input || input.value) return input?.value || '';
  if (input.dataset.loading === '1') return '';
  input.dataset.loading = '1';
  try {
    const payload = await api('/api/radius/member-code-preview');
    const code = String(payload.memberCode || '').trim();
    if (code && !input.value) {
      input.value = code;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return input.value || code;
  } catch {
    return input.value || '';
  } finally {
    input.dataset.loading = '0';
  }
}

function bindRadiusAutoPppCredentials() {
  const autoCheckbox = modalBody.querySelector('#radiusAutoPppCredential');
  const preview = modalBody.querySelector('#radiusAutoCredentialPreview span');
  const usernameInput = modalBody.querySelector('input[name="username"]');
  const passwordInput = modalBody.querySelector('input[name="password"]');
  const memberCodeInput = modalBody.querySelector('input[name="memberCode"]');
  const typeSelect = modalBody.querySelector('#radiusPppType');
  const nasSelect = modalBody.querySelector('select[name="nas"]');
  const addToMember = modalBody.querySelector('#radiusAddToMember');
  const autoFields = [...modalBody.querySelectorAll('[data-auto-ppp-field]')];
  if (!autoCheckbox || !usernameInput || !passwordInput || !memberCodeInput) return;

  const generatedUsername = () => {
    const code = String(memberCodeInput.value || '').trim();
    if (!code) return '';
    const domain = radiusSelectedNasDomain();
    return domain ? `${code}@${domain}` : code;
  };

  const sync = () => {
    const isDhcp = String(typeSelect?.value || '').toLowerCase() === 'dhcp';
    autoFields.forEach((field) => { field.hidden = isDhcp; });
    const memberEnabled = addToMember?.checked !== false;
    const enabled = !isDhcp && memberEnabled && autoCheckbox.checked;
    usernameInput.readOnly = enabled;
    passwordInput.readOnly = enabled;
    if (enabled) {
      const code = String(memberCodeInput.value || '').trim();
      const username = generatedUsername();
      if (username) usernameInput.value = username;
      if (code) passwordInput.value = code;
      if (preview) {
        preview.textContent = username
          ? `Username ${username}, password ${code}. Matikan checklist jika ingin input manual.`
          : 'Menyiapkan Member ID untuk auto username/password...';
      }
      if (!code) ensureRadiusMemberCodePreview();
    } else if (preview && !isDhcp) {
      preview.textContent = memberEnabled
        ? 'Auto credential nonaktif. Username dan password dapat diisi manual.'
        : 'Auto credential membutuhkan Member pelanggan. Username dan password dapat diisi manual.';
    }
  };

  autoCheckbox.addEventListener('change', sync);
  memberCodeInput.addEventListener('input', sync);
  typeSelect?.addEventListener('change', sync);
  nasSelect?.addEventListener('change', sync);
  addToMember?.addEventListener('change', sync);
  sync();
}

async function openRadiusPppUserModal(user = null) {
  const [options, billingPayload] = await Promise.all([
    loadRadiusOptions('ppp'),
    api('/api/billing/settings').catch(() => ({ settings: {} }))
  ]);
  options.billing = billingPayload.settings || {};
  openModal(user ? 'Edit User PPP-DHCP' : 'Tambah User PPP-DHCP', radiusPppUserFormBody(user, options), async (payload, form) => {
    const type = String(payload.type || '').toLowerCase();
    if (!user && payload.addToMember && typeof form?._radiusPppWizardFinalize === 'function') {
      if (!form._radiusPppWizardFinalize()) {
        throw new Error('Selesaikan wizard sampai Review sebelum menyimpan user dan member');
      }
    }
    if (!user && radiusProfileMissing(payload.profile || payload.profileId)) {
      throw new Error('Profile PPP-DHCP wajib dipilih, tidak boleh None');
    }
    if (!user && payload.addToMember && form?.dataset.radiusWizardReady !== '1') {
      throw new Error('Selesaikan wizard sampai Review sebelum menyimpan user dan member');
    }
    if (!user && payload.addToMember) {
      payload.memberAddons = JSON.stringify(collectMemberAddons(form));
    } else {
      delete payload.memberAddons;
    }
    if (!user && type === 'dhcp' && !String(payload.macAddress || '').trim()) {
      throw new Error('MAC Address wajib diisi untuk DHCP');
    }
    if (!user && type !== 'dhcp' && (!String(payload.username || '').trim() || !String(payload.password || '').trim())) {
      throw new Error('Username dan password wajib diisi untuk PPPoE');
    }
    if (type === 'dhcp') {
      delete payload.password;
      payload.username = payload.username || payload.macAddress || payload.memberCode || '';
    } else {
      delete payload.macAddress;
    }
    if (payload.addToMember && !String(payload.memberName || '').trim()) {
      throw new Error('Nama Member wajib diisi');
    }
    if (payload.addToMember && !String(payload.memberPhone || '').trim()) {
      throw new Error('Nomor telepon/WhatsApp wajib diisi untuk member');
    }
    const ktpPhotoFile = form.querySelector('input[name="memberKtpPhotoUpload"]')?.files?.[0];
    if (ktpPhotoFile && !String(payload.memberKtpPhoto || '').trim()) {
      const ktpUpload = await uploadMemberKtpFile(ktpPhotoFile, { label: 'Foto KTP' });
      payload.memberKtpPhoto = JSON.stringify(ktpUpload?.storedPhoto || ktpUpload?.photo || {});
      if (ktpUpload?.ktp) {
        payload.memberKtp = ktpUpload.ktp;
      }
      if (ktpOcrName(ktpUpload)) {
        payload.memberKtpName = ktpOcrName(ktpUpload);
      }
      const nameDecision = ktpOcrNameDecision(payload.memberName || '', ktpOcrName(ktpUpload), {
        replaceAutoFilled: true,
        autoFilled: form.querySelector('[name="memberName"]')?.dataset.autoFilled === '1'
      });
      if (nameDecision.shouldReplace) {
        payload.memberName = ktpOcrName(ktpUpload);
      }
    }
    delete payload.memberKtpPhotoUpload;
    const housePhotoFile = form.querySelector('input[name="memberHousePhoto"]')?.files?.[0];
    if (housePhotoFile) {
      payload.memberHousePhotoUrl = await uploadImageFile(housePhotoFile, 'member-house', { label: 'Foto rumah' });
    }
    delete payload.memberHousePhoto;
    const result = await api(user ? `/api/radius/ppp-dhcp/users/${encodeURIComponent(user.id)}` : '/api/radius/ppp-dhcp/users', {
      method: user ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    const memberCode = result.member?.code || result.member?.accountId || payload.memberCode || '';
    setToast(user
      ? (result.memberProfileSync?.changed
        ? `User PPP-DHCP diperbarui. Member ikut sinkron ke ${result.memberProfileSync.nextPackageName || 'profil baru'}`
        : 'User PPP-DHCP diperbarui')
      : (payload.addToMember && memberCode ? `User PPP-DHCP ditambahkan. ID Member ${memberCode}` : 'User PPP-DHCP ditambahkan'));
    renderRadiusPppDhcp({ refresh: true });
  });
  bindRequiredRadiusProfileWarning('#radiusPppProfile', 'PPP-DHCP');
  bindRadiusPppTypeFields();
  if (!user) {
    bindMemberAddonRows(modal.querySelector('.modal-frame'), []);
    bindRadiusMemberFields(options);
    bindRadiusPppWizard();
    bindRadiusAutoPppCredentials();
  }
}

function bindRadiusPppWizard() {
  const wizard = modalBody.querySelector('[data-radius-ppp-wizard]');
  if (!wizard) return;
  const panels = [...wizard.querySelectorAll('[data-radius-wizard-panel]')];
  const stepButtons = [...wizard.querySelectorAll('[data-radius-wizard-goto]')];
  const prevButton = modalBody.querySelector('#radiusWizardPrev');
  const nextButton = modalBody.querySelector('#radiusWizardNext');
  const submitButton = modalBody.querySelector('#radiusWizardSubmit');
  const addToMember = modalBody.querySelector('#radiusAddToMember');
  const form = modal.querySelector('.modal-frame');
  const stepKeys = ['account', 'member', 'payment', 'review'];
  let step = 0;
  let highestUnlockedStep = 0;
  const activeSteps = () => addToMember?.checked ? stepKeys : ['account'];
  const currentStepKey = () => activeSteps()[step] || 'account';
  const selectedText = (selector, fallback = '-') => {
    const select = modalBody.querySelector(selector);
    return select?.selectedOptions?.[0]?.textContent?.trim() || fallback;
  };
  const reviewValue = (name, value) => {
    const node = modalBody.querySelector(`[data-radius-review="${name}"]`);
    if (node) node.textContent = value || '-';
  };
  const numberValue = (value = '') => {
    let cleaned = String(value || '').trim().replace(/[^\d,.-]/g, '');
    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');
    if (hasComma && hasDot) {
      const decimalSeparator = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
      const thousandSeparator = decimalSeparator === ',' ? '.' : ',';
      cleaned = cleaned.replace(new RegExp(`\\${thousandSeparator}`, 'g'), '').replace(decimalSeparator, '.');
    } else if (hasComma) {
      const parts = cleaned.split(',');
      cleaned = parts.at(-1).length === 3 && parts.length > 1 ? parts.join('') : cleaned.replace(',', '.');
    } else if (hasDot) {
      const parts = cleaned.split('.');
      cleaned = parts.at(-1).length === 3 && parts.length > 1 ? parts.join('') : cleaned;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const percentValue = (value = '') => Math.max(0, Math.min(100, numberValue(value)));
  const moneyValue = (value = '') => {
    const number = numberValue(value);
    return number > 0 ? rupiah(number) : '-';
  };
  const syncReview = () => {
    const type = modalBody.querySelector('#radiusPppType')?.value || 'PPPoE';
    const isDhcp = String(type).toLowerCase() === 'dhcp';
    const username = isDhcp
      ? (modalBody.querySelector('input[name="macAddress"]')?.value.trim() || '-')
      : (modalBody.querySelector('input[name="username"]')?.value.trim() || '-');
    reviewValue('type', type);
    reviewValue('username', username);
    reviewValue('profile', selectedText('select[name="profile"]'));
    reviewValue('nas', selectedText('select[name="nas"]'));
    reviewValue('memberName', modalBody.querySelector('input[name="memberName"]')?.value.trim() || '-');
    reviewValue('phone', modalBody.querySelector('input[name="memberPhone"]')?.value.trim() || '-');
    reviewValue('payment', `${selectedText('select[name="memberPaymentType"]')} / ${selectedText('select[name="memberBillingPeriod"]')}`);
    const packagePrice = Math.max(0, Math.round(numberValue(modalBody.querySelector('input[name="memberPrice"]')?.value || '')));
    const addons = collectMemberAddons(modal.querySelector('.modal-frame'));
    const addOnTotal = memberAddonsTotal(addons);
    const subtotal = packagePrice + addOnTotal;
    const ppnRate = percentValue(modalBody.querySelector('input[name="memberPpn"]')?.value || '');
    const rawDiscountAmount = Math.min(subtotal, Math.max(0, Math.round(numberValue(modalBody.querySelector('input[name="memberDiscount"]')?.value || ''))));
    const taxableAmount = subtotal;
    const discountAmount = Math.min(subtotal, memberDiscountWithPpnOffset(rawDiscountAmount, packagePrice, addOnTotal, taxableAmount, ppnRate));
    const discountInput = modalBody.querySelector('input[name="memberDiscount"]');
    if (discountInput && discountAmount !== rawDiscountAmount) {
      discountInput.value = String(discountAmount);
    }
    const ppnAmount = Math.round((taxableAmount * ppnRate) / 100);
    const bhpUsoEnabled = wizard.dataset.bhpUsoEnabled === '1';
    const bhpUsoRate = bhpUsoEnabled ? Math.max(0, Math.min(100, numberValue(wizard.dataset.bhpUsoRate || 1.25))) : 0;
    const bhpUsoAmount = Math.round((taxableAmount * bhpUsoRate) / 100);
    const totalAmount = Math.max(0, taxableAmount + ppnAmount + bhpUsoAmount - discountAmount);
    reviewValue('price', moneyValue(packagePrice));
    reviewValue('addons', addOnTotal > 0 ? memberAddonsDisplay(addons) : '-');
    reviewValue('ppn', ppnRate > 0 ? `${ppnRate}% / ${rupiah(ppnAmount)}` : '-');
    reviewValue('discount', discountAmount > 0 ? rupiah(discountAmount) : '-');
    reviewValue('bhpUso', bhpUsoAmount > 0 ? `${bhpUsoRate}% / ${rupiah(bhpUsoAmount)}` : '-');
    reviewValue('total', totalAmount > 0 ? rupiah(totalAmount) : '-');
    reviewValue('activeDate', dateText(modalBody.querySelector('input[name="memberActiveDate"]')?.value || '') || '-');
    reviewValue('invoiceStatus', selectedText('select[name="memberInvoiceStatus"]'));
  };
  const validateStep = () => {
    const current = currentStepKey();
    if (current === 'member' && addToMember?.checked) {
      const name = modalBody.querySelector('input[name="memberName"]')?.value.trim() || '';
      const phone = modalBody.querySelector('input[name="memberPhone"]')?.value.trim() || '';
      if (!name) {
        setToast('Nama Member wajib diisi');
        return false;
      }
      if (!phone) {
        setToast('Nomor WhatsApp wajib diisi');
        return false;
      }
    }
    if (current === 'payment') {
      const profile = modalBody.querySelector('#radiusPppProfile')?.value.trim() || '';
      if (!profile) {
        setToast('Profile PPP-DHCP wajib dipilih, tidak boleh None');
        return false;
      }
    }
    if (current === 'account') {
      const type = String(modalBody.querySelector('#radiusPppType')?.value || '').toLowerCase();
      const username = modalBody.querySelector('input[name="username"]')?.value.trim() || '';
      const password = modalBody.querySelector('input[name="password"]')?.value.trim() || '';
      const mac = modalBody.querySelector('input[name="macAddress"]')?.value.trim() || '';
      if (type === 'dhcp' && !mac) {
        setToast('MAC Address wajib diisi untuk DHCP');
        return false;
      }
      if (type !== 'dhcp' && (!username || !password)) {
        setToast('Username dan password wajib diisi untuk PPPoE');
        return false;
      }
    }
    return true;
  };
  const renderStep = () => {
    const steps = activeSteps();
    const current = currentStepKey();
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.radiusWizardPanel !== current;
    });
    stepButtons.forEach((button) => {
      const index = Number(button.dataset.radiusWizardGoto || 0);
      const target = stepKeys[index];
      const enabled = steps.includes(target);
      const targetIndex = steps.indexOf(target);
      const completed = enabled && targetIndex < Math.max(step, highestUnlockedStep);
      const forwardLocked = targetIndex > highestUnlockedStep + 1;
      button.disabled = !enabled || forwardLocked;
      button.classList.toggle('is-active', target === current);
      button.classList.toggle('is-complete', completed);
    });
    if (prevButton) prevButton.hidden = step <= 0;
    if (nextButton) nextButton.hidden = step >= steps.length - 1;
    if (submitButton) submitButton.hidden = step < steps.length - 1;
    if (form) {
      form.dataset.radiusWizardReady = (!addToMember?.checked || current === 'review') ? '1' : '0';
    }
    if (current === 'member') {
      form?._radiusMemberSync?.();
      window.setTimeout(() => modalBody.querySelector('#radiusLeafletMap')?._radiusMap?.invalidateSize?.(), 60);
    }
    if (current === 'review') syncReview();
  };
  form._radiusPppWizardFinalize = () => {
    const current = currentStepKey();
    if (addToMember?.checked && current !== 'review') {
      setToast('Selesaikan wizard sampai Review sebelum menyimpan user dan member');
      form.dataset.radiusWizardReady = '0';
      return false;
    }
    if (!validateStep()) {
      form.dataset.radiusWizardReady = '0';
      return false;
    }
    if (current === 'review') syncReview();
    form.dataset.radiusWizardReady = (!addToMember?.checked || current === 'review') ? '1' : '0';
    return form.dataset.radiusWizardReady === '1';
  };
  stepButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = stepKeys[Number(button.dataset.radiusWizardGoto || 0)];
      const steps = activeSteps();
      const nextStep = steps.indexOf(target);
      if (nextStep === -1) return;
      if (nextStep > highestUnlockedStep + 1) {
        setToast('Selesaikan step saat ini terlebih dahulu');
        return;
      }
      if (nextStep > step && nextStep > highestUnlockedStep && !validateStep()) return;
      highestUnlockedStep = Math.max(highestUnlockedStep, nextStep);
      step = nextStep;
      renderStep();
      window.setTimeout(() => modalBody.querySelector('#radiusLeafletMap')?._radiusMap?.invalidateSize?.(), 60);
    });
  });
  prevButton?.addEventListener('click', () => {
    step = Math.max(0, step - 1);
    renderStep();
  });
  nextButton?.addEventListener('click', () => {
    if (!validateStep()) return;
    const steps = activeSteps();
    step = Math.min(steps.length - 1, step + 1);
    highestUnlockedStep = Math.max(highestUnlockedStep, step);
    renderStep();
    window.setTimeout(() => modalBody.querySelector('#radiusLeafletMap')?._radiusMap?.invalidateSize?.(), 60);
  });
  addToMember?.addEventListener('change', () => {
    step = 0;
    highestUnlockedStep = 0;
    renderStep();
  });
  renderStep();
}

function bindRadiusPppTypeFields() {
  const typeSelect = modalBody.querySelector('#radiusPppType');
  const credentialFields = [...modalBody.querySelectorAll('[data-ppp-credential]')];
  const dhcpFields = [...modalBody.querySelectorAll('[data-dhcp-field]')];
  const usernameInput = modalBody.querySelector('input[name="username"]');
  const passwordInput = modalBody.querySelector('input[name="password"]');
  const macInput = modalBody.querySelector('input[name="macAddress"]');
  const sync = () => {
    const isDhcp = String(typeSelect?.value || '').toLowerCase() === 'dhcp';
    credentialFields.forEach((field) => {
      field.hidden = isDhcp;
      field.querySelectorAll('input,select,textarea').forEach((input) => {
        input.disabled = isDhcp;
      });
    });
    dhcpFields.forEach((field) => {
      field.hidden = !isDhcp;
      field.querySelectorAll('input,select,textarea').forEach((input) => {
        input.disabled = !isDhcp;
      });
    });
    if (passwordInput) {
      passwordInput.required = !isDhcp && !passwordInput.placeholder;
    }
    if (usernameInput) {
      usernameInput.required = !isDhcp;
    }
    if (macInput) {
      macInput.required = isDhcp;
      if (!isDhcp) macInput.value = '';
    }
  };
  typeSelect?.addEventListener('change', sync);
  sync();
}

function browserLocationErrorMessage(error = {}) {
  if (Number(error.code) === 1) return 'Izin lokasi ditolak. Aktifkan izin lokasi browser lalu coba lagi.';
  if (Number(error.code) === 2) return 'Lokasi perangkat belum dapat ditemukan.';
  if (Number(error.code) === 3) return 'Pengambilan lokasi melewati batas waktu. Coba lagi di area dengan sinyal GPS lebih baik.';
  return error.message || 'Lokasi browser tidak dapat diambil.';
}

function currentBrowserPosition() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Browser tidak mendukung geolocation.'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, (error) => {
      reject(new Error(browserLocationErrorMessage(error)));
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
    });
  });
}

function bindRadiusMemberFields(options = {}) {
  const checkbox = modalBody.querySelector('#radiusAddToMember');
  const fieldsWrap = modalBody.querySelector('#radiusMemberFields');
  if (!checkbox || !fieldsWrap) return;
  const memberFields = [...modalBody.querySelectorAll('[data-member-field]')];
  const usernameInput = modalBody.querySelector('input[name="username"]');
  const nameInput = modalBody.querySelector('[name="memberName"]');
  const phoneInput = modalBody.querySelector('[name="memberPhone"]');
  const ktpNameInput = modalBody.querySelector('[name="memberKtpName"]');
  const ktpInput = modalBody.querySelector('[name="memberKtp"]');
  const duplicateHint = modalBody.querySelector('#radiusMemberDuplicateHint');
  const priceInput = modalBody.querySelector('[name="memberPrice"]');
  const paymentTypeSelect = modalBody.querySelector('[name="memberPaymentType"]');
  const billingPeriodSelect = modalBody.querySelector('#radiusMemberBillingPeriod');
  const activeDateInput = modalBody.querySelector('[name="memberActiveDate"]');
  const activeDatePicker = activeDateInput?.closest('[data-date-picker]');
  const latitudeInput = modalBody.querySelector('[name="memberLatitude"]');
  const longitudeInput = modalBody.querySelector('[name="memberLongitude"]');
  const accuracyInput = modalBody.querySelector('[name="memberLocationAccuracy"]');
  const locationButton = modalBody.querySelector('#radiusUseBrowserLocation');
  const locationLink = modalBody.querySelector('#radiusLocationMapLink');
  const locationStatus = modalBody.querySelector('#radiusLocationStatus');
  const mapEl = modalBody.querySelector('#radiusLeafletMap');
  const profileSelect = modalBody.querySelector('select[name="profile"]');
  const housePhotoInput = modalBody.querySelector('input[name="memberHousePhoto"]');
  const housePhotoPreview = modalBody.querySelector('#radiusHousePhotoPreview');
  const ktpPhotoInput = modalBody.querySelector('input[name="memberKtpPhotoUpload"]');
  const ktpPhotoHidden = modalBody.querySelector('input[name="memberKtpPhoto"]');
  const ktpPhotoPreview = modalBody.querySelector('#radiusKtpPhotoPreview');
  const ktpUploadStatus = modalBody.querySelector('#radiusKtpUploadStatus');
  const profiles = options.profiles || [];
  let map = null;
  let marker = null;
  let duplicateTimer = null;
  const setMapPoint = (latitude, longitude, zoom = 17) => {
    if (!map || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return;
    const point = [Number(latitude), Number(longitude)];
    map.setView(point, zoom);
    if (!marker) {
      marker = window.L.marker(point, { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        if (latitudeInput) latitudeInput.value = Number(pos.lat || 0).toFixed(7);
        if (longitudeInput) longitudeInput.value = Number(pos.lng || 0).toFixed(7);
        updateLocationPreview();
      });
    } else {
      marker.setLatLng(point);
    }
  };
  const ensureMap = () => {
    if (map || !mapEl) return;
    if (!window.L) {
      ensureLeafletLoaded().then((loaded) => {
        if (loaded) ensureMap();
      });
      return;
    }
    map = window.L.map(mapEl, { zoomControl: true }).setView([-2.5489, 118.0149], 5);
    mapEl._radiusMap = map;
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    map.on('click', (event) => {
      const latlng = event.latlng || {};
      if (latitudeInput) latitudeInput.value = Number(latlng.lat || 0).toFixed(7);
      if (longitudeInput) longitudeInput.value = Number(latlng.lng || 0).toFixed(7);
      if (accuracyInput) accuracyInput.value = '';
      updateLocationPreview();
    });
  };
  const updateLocationPreview = () => {
    const latitude = latitudeInput?.value.trim() || '';
    const longitude = longitudeInput?.value.trim() || '';
    const hasLocation = latitude && longitude;
    if (locationLink) {
      locationLink.hidden = !hasLocation;
      locationLink.href = hasLocation ? `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}` : '#';
    }
    if (locationStatus && hasLocation) {
      const accuracy = accuracyInput?.value.trim();
      locationStatus.textContent = `Koordinat tersimpan: ${latitude}, ${longitude}${accuracy ? `, akurasi ${accuracy}m` : ''}.`;
    }
    if (hasLocation) {
      ensureMap();
      setMapPoint(latitude, longitude);
    }
  };
  const profilePrice = () => {
    const selected = String(profileSelect?.value || '');
    const profile = profiles.find((item) => String(item.value || item.label || '') === selected);
    return profile?.price || '';
  };
  const syncProfilePrice = () => {
    if (!priceInput) return;
    priceInput.value = profilePrice();
  };
  const fillDefaults = () => {
    const username = usernameInput?.value.trim() || '';
    if (nameInput && !nameInput.value) {
      nameInput.value = username;
      nameInput.dataset.autoFilled = '1';
    }
    syncProfilePrice();
  };
  const renderDuplicateHint = (rows = [], query = '') => {
    if (!duplicateHint) return;
    if (!rows.length) {
      duplicateHint.hidden = !query;
      duplicateHint.className = 'field full member-duplicate-hint notice';
      duplicateHint.innerHTML = query ? '<strong>Data mirip</strong><span>Tidak ada member mirip yang ditemukan.</span>' : '';
      return;
    }
    duplicateHint.hidden = false;
    duplicateHint.className = 'field full member-duplicate-hint notice warning';
    duplicateHint.innerHTML = `
      <strong>Data mirip ditemukan</strong>
      <span>Periksa agar tidak membuat pelanggan ganda.</span>
      <div class="mini-list">
        ${rows.slice(0, 5).map((row) => `
          <div>
            <b>${escapeHtml(row.name || row.customerName || row.username || '-')}</b>
            <small>${escapeHtml([row.whatsapp || row.phone || '', row.address || '', row.nas || row.siteName || ''].filter(Boolean).join(' · '))}</small>
          </div>
        `).join('')}
      </div>
    `;
  };
  const scheduleDuplicateLookup = () => {
    if (!duplicateHint || !checkbox.checked) return;
    window.clearTimeout(duplicateTimer);
    duplicateTimer = window.setTimeout(async () => {
      const name = nameInput?.value.trim() || '';
      const phone = phoneInput?.value.trim() || '';
      const ktp = ktpInput?.value.trim() || '';
      const query = phone.length >= 4 ? phone : (ktp.length >= 6 ? ktp : name);
      if (query.length < 3) {
        renderDuplicateHint([], '');
        return;
      }
      try {
        const payload = await api(`/api/monitoring/members?${queryString({ search: query, page: 1, limit: 5 })}`);
        renderDuplicateHint(payload.rows || [], query);
      } catch {
        renderDuplicateHint([], '');
      }
    }, 350);
  };
  const syncBillingPeriod = () => {
    syncBillingPeriodSelect(paymentTypeSelect, billingPeriodSelect);
  };
  const sync = () => {
    memberFields.forEach((field) => {
      field.disabled = !checkbox.checked;
    });
    modalBody.querySelectorAll('[data-member-addon-field]').forEach((field) => {
      field.disabled = !checkbox.checked;
    });
    modalBody.querySelectorAll('[data-member-addon-control]').forEach((control) => {
      control.disabled = !checkbox.checked;
    });
    modalBody.querySelectorAll('[data-member-photo-control]').forEach((control) => {
      control.disabled = !checkbox.checked;
    });
    if (activeDateInput) activeDateInput.disabled = !checkbox.checked;
    activeDatePicker?.querySelectorAll('button').forEach((button) => {
      button.disabled = !checkbox.checked;
    });
    if (locationButton) {
      locationButton.disabled = !checkbox.checked;
    }
    if (checkbox.checked) {
      fillDefaults();
      syncBillingPeriod();
      const memberPanelActive = fieldsWrap.hidden === false;
      if (memberPanelActive) {
        ensureRadiusMemberCodePreview();
        ensureMap();
        window.setTimeout(() => map?.invalidateSize?.(), 50);
        updateLocationPreview();
        scheduleDuplicateLookup();
      }
    } else if (duplicateHint) {
      duplicateHint.hidden = true;
    }
  };
  const form = modal.querySelector('.modal-frame');
  if (form) form._radiusMemberSync = sync;
  checkbox.addEventListener('change', sync);
  bindPhotoInputTriggers(modalBody);
  usernameInput?.addEventListener('input', () => {
    if (!checkbox.checked) return;
    if (nameInput && (!nameInput.value || nameInput.dataset.autoFilled === '1')) {
      nameInput.value = usernameInput.value.trim();
      nameInput.dataset.autoFilled = '1';
    }
  });
  nameInput?.addEventListener('input', () => {
    nameInput.dataset.autoFilled = '0';
    scheduleDuplicateLookup();
  });
  phoneInput?.addEventListener('input', scheduleDuplicateLookup);
  ktpInput?.addEventListener('input', scheduleDuplicateLookup);
  paymentTypeSelect?.addEventListener('change', syncBillingPeriod);
  profileSelect?.addEventListener('change', () => {
    if (!checkbox.checked) return;
    syncProfilePrice();
  });
  [latitudeInput, longitudeInput, accuracyInput].forEach((input) => {
    input?.addEventListener('input', updateLocationPreview);
  });
  locationButton?.addEventListener('click', async () => {
    if (!checkbox.checked) return;
    locationButton.disabled = true;
    if (locationStatus) locationStatus.textContent = 'Menyinkronkan lokasi perangkat...';
    try {
      const position = await currentBrowserPosition();
      const coords = position.coords || {};
      if (latitudeInput) latitudeInput.value = Number(coords.latitude || 0).toFixed(7);
      if (longitudeInput) longitudeInput.value = Number(coords.longitude || 0).toFixed(7);
      if (accuracyInput) accuracyInput.value = coords.accuracy ? String(Math.round(coords.accuracy)) : '';
      ensureMap();
      updateLocationPreview();
    } catch (error) {
      if (locationStatus) {
        locationStatus.textContent = error.message || 'Lokasi browser tidak dapat diambil.';
      }
    } finally {
      locationButton.disabled = !checkbox.checked;
    }
  });
  housePhotoInput?.addEventListener('change', async () => {
    try {
      const uploaded = await readImageFile(housePhotoInput.files?.[0], { label: 'Foto rumah' });
      if (!uploaded || !housePhotoPreview) return;
      housePhotoPreview.src = uploaded;
      housePhotoPreview.hidden = false;
    } catch (error) {
      housePhotoInput.value = '';
      if (housePhotoPreview) {
        housePhotoPreview.hidden = true;
        housePhotoPreview.removeAttribute('src');
      }
      setToast(error.message);
    }
  });
  ktpPhotoInput?.addEventListener('change', async () => {
    const file = ktpPhotoInput.files?.[0];
    if (!file) {
      if (ktpPhotoHidden) ktpPhotoHidden.value = '';
      if (ktpPhotoPreview) {
        ktpPhotoPreview.hidden = true;
        ktpPhotoPreview.removeAttribute('src');
      }
      if (ktpUploadStatus) ktpUploadStatus.textContent = 'Opsional. OCR akan mencoba membaca NIK dan nama dari KTP otomatis.';
      return;
    }
    try {
      const preview = await readImageFile(file, { label: 'Foto KTP' });
      if (ktpPhotoPreview && preview) {
        ktpPhotoPreview.src = preview;
        ktpPhotoPreview.hidden = false;
      }
      if (ktpUploadStatus) ktpUploadStatus.textContent = 'Mengupload dan membaca NIK serta nama dari KTP...';
      const result = await uploadMemberKtpFile(file, { label: 'Foto KTP' });
      if (ktpPhotoHidden) ktpPhotoHidden.value = JSON.stringify(result?.storedPhoto || result?.photo || {});
      if (result?.ktp && ktpInput) {
        ktpInput.value = result.ktp;
      }
      if (ktpNameInput) ktpNameInput.value = ktpOcrName(result);
      const nameDecision = fillKtpOcrNameInput(nameInput, result, { replaceAutoFilled: true });
      if (ktpUploadStatus) {
        ktpUploadStatus.textContent = ktpOcrStatusText(result, nameDecision);
      }
      scheduleDuplicateLookup();
    } catch (error) {
      ktpPhotoInput.value = '';
      if (ktpPhotoHidden) ktpPhotoHidden.value = '';
      if (ktpPhotoPreview) {
        ktpPhotoPreview.hidden = true;
        ktpPhotoPreview.removeAttribute('src');
      }
      if (ktpUploadStatus) ktpUploadStatus.textContent = 'Foto KTP belum tersimpan.';
      setToast(error.message);
    }
  });
  sync();
}

function bindRadiusHotspotPaymentFields(options = {}) {
  const profileSelect = modalBody.querySelector('#radiusHotspotProfile');
  const amountInput = modalBody.querySelector('#radiusHotspotAmount');
  const paymentStatusSelect = modalBody.querySelector('#radiusHotspotPaymentStatus');
  if (!profileSelect || !amountInput) return;
  const profiles = options.profiles || [];
  const priceForProfile = () => {
    const selected = String(profileSelect.value || '');
    const profile = profiles.find((item) => String(item.value || item.label || item.id || '') === selected);
    return profile?.price || '';
  };
  const sync = () => {
    if (paymentStatusSelect?.value === 'free') {
      amountInput.value = '0';
      amountInput.dataset.autoFilled = '1';
      return;
    }
    const price = priceForProfile();
    if (price !== '' && (!amountInput.value || amountInput.dataset.autoFilled === '1')) {
      amountInput.value = price;
      amountInput.dataset.autoFilled = '1';
    } else if (price === '' && amountInput.dataset.autoFilled === '1') {
      amountInput.value = '';
    }
  };
  amountInput.addEventListener('input', () => {
    amountInput.dataset.autoFilled = '0';
  });
  profileSelect.addEventListener('change', () => {
    amountInput.dataset.autoFilled = '1';
    sync();
  });
  paymentStatusSelect?.addEventListener('change', () => {
    amountInput.dataset.autoFilled = '1';
    sync();
  });
  sync();
}

async function openRadiusProfileModal(type = 'ppp', profile = null) {
  const section = type === 'hotspot' ? 'hotspot' : 'ppp-dhcp';
  const label = type === 'hotspot' ? 'Hotspot' : 'PPP-DHCP';
  openModal(profile ? `Edit Profile ${label}` : `Tambah Profile ${label}`, radiusProfileFormBody(profile, type), async (payload) => {
    await api(profile ? `/api/radius/${section}/profiles/${encodeURIComponent(profile.id)}` : `/api/radius/${section}/profiles`, {
      method: profile ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    setToast(profile ? `Profile ${label} diperbarui` : `Profile ${label} ditambahkan`);
    clearRadiusOptionsCache(type);
    if (type === 'hotspot') {
      renderRadiusHotspot({ refresh: true });
    } else {
      renderRadiusPppDhcp({ refresh: true });
    }
  });
  bindRadiusProfileModeFields();
}

function bindRadiusProfileModeFields() {
  const checkbox = modalBody.querySelector('#radiusProfileUseMikrotik');
  const mikrotikFields = [...modalBody.querySelectorAll('[data-profile-mikrotik-field]')];
  const manualFields = [...modalBody.querySelectorAll('[data-profile-manual-field]')];
  if (!checkbox) return;
  const setDisabled = (field, disabled) => {
    field.hidden = disabled;
    field.querySelectorAll('input,select,textarea').forEach((input) => {
      input.disabled = disabled;
      if (input.name === 'mikrotikGroup') {
        input.required = !disabled;
      }
    });
  };
  const sync = () => {
    const linked = checkbox.checked;
    mikrotikFields.forEach((field) => setDisabled(field, !linked));
    manualFields.forEach((field) => setDisabled(field, linked));
  };
  checkbox.addEventListener('change', sync);
  sync();
}

async function openRadiusHotspotUserModal(user = null) {
  const options = await loadRadiusOptions('hotspot');
  openModal(user ? 'Edit User Hotspot' : 'Tambah User Hotspot', radiusHotspotUserFormBody(user, options), async (payload) => {
    if (!user && radiusProfileMissing(payload.profile || payload.profileId)) {
      throw new Error('Profile Hotspot wajib dipilih, tidak boleh None');
    }
    if (!user && !String(payload.username || '').trim()) {
      throw new Error('Username Hotspot wajib diisi');
    }
    await api(user ? `/api/radius/hotspot/users/${encodeURIComponent(user.id)}` : '/api/radius/hotspot/users', {
      method: user ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    setToast(user ? 'User Hotspot diperbarui' : 'User Hotspot ditambahkan');
    renderRadiusHotspot({ refresh: true });
  });
  bindRequiredRadiusProfileWarning('#radiusHotspotProfile', 'Hotspot');
  bindResellerOperationNasProfile(options, user?.profile || user?.profileName || '');
  bindRadiusHotspotPaymentFields(options);
}

function radiusHotspotVoucherFormBody(options = {}) {
  const lockedNasOptions = state.auth?.role === 'reseller_voucher' ? currentUserLockedNasOptions(options.nas || []) : [];
  const profileOptions = radiusProfilesForLockedNas(options, lockedNasOptions);
  return `
    <div class="form-grid">
      <label class="field">
        <span>Jumlah Voucher</span>
        <input name="count" type="number" min="1" max="500" value="1">
      </label>
      <label class="field">
        <span>Name Length</span>
        <input name="nameLength" type="number" min="3" max="32" value="6">
      </label>
      <label class="field">
        <span>Prefix/Suffix</span>
        <input name="prefix" value="" autocomplete="off">
      </label>
      <label class="field">
        <span>Character</span>
        <select name="character">
          <option value="mixed">Random angka + huruf besar kecil</option>
          <option value="number">Angka saja</option>
          <option value="upper">Huruf besar saja</option>
          <option value="lower">Huruf kecil saja</option>
          <option value="upper-number">Huruf besar + angka</option>
          <option value="lower-number">Huruf kecil + angka</option>
        </select>
      </label>
      ${lockedNasOptions.length ? resellerNasTargetField('nasId', lockedNasOptions, lockedNasOptions.length === 1 ? lockedNasOptions[0].id : '', 'NAS Tujuan') : `
        <label class="field">
          <span>NAS</span>
          <select name="nas">${radiusOptionTags(options.nas || [], '', 'All')}</select>
        </label>
      `}
      <label class="field">
        <span>Profile</span>
        <select name="profile" required>${radiusOptionTags(profileOptions, '', 'Pilih Profile')}</select>
      </label>
      <label class="field full">
        <span>Catatan</span>
        <textarea name="note"></textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Generate</button>
    </div>
  `;
}

async function openRadiusHotspotVoucherModal() {
  const options = await loadRadiusOptions('hotspot');
  openModal('Generate Voucher Hotspot', radiusHotspotVoucherFormBody(options), async (payload) => {
    const result = await api('/api/radius/hotspot/users/generate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setToast(`Generate voucher selesai: ${displayNumber(result.created || 0)} voucher`);
    renderRadiusHotspot({ refresh: true });
  });
  bindResellerOperationNasProfile(options);
}

function radiusHotspotTemplateFormBody(template = {}) {
  const active = template.active !== false;
  const showPrice = template.showPrice !== false;
  const showQr = template.showQr !== false;
  const layout = hotspotVoucherLayoutValue(template);
  return `
    <div class="form-grid">
      <label class="field">
        <span>Nama Template</span>
        <input name="name" value="${escapeHtml(template.name || 'Mikhmon Compact')}" required maxlength="80">
      </label>
      <label class="field">
        <span>Judul Voucher</span>
        <input name="title" value="${escapeHtml(template.title || 'Voucher Compact')}" required maxlength="80">
      </label>
      <label class="field">
        <span>Layout</span>
        <select name="layout" id="hotspotTemplateLayout">
          ${HOTSPOT_VOUCHER_TEMPLATE_LAYOUTS.map((item) => `
            <option value="${escapeHtml(item.value)}" ${layout === item.value ? 'selected' : ''}>${escapeHtml(item.label)}</option>
          `).join('')}
        </select>
      </label>
      <label class="field">
        <span>Warna</span>
        <input name="accentColor" type="color" value="${escapeHtml(template.accentColor || '#0277BD')}">
      </label>
      <label class="field">
        <span>Label Kode</span>
        <input name="codeLabel" value="${escapeHtml(template.codeLabel || 'VOUCHER')}" maxlength="28">
      </label>
      <label class="field">
        <span>Label Masa Aktif</span>
        <input name="validityLabel" value="${escapeHtml(template.validityLabel || 'MASA AKTIF')}" maxlength="28">
      </label>
      <label class="field full">
        <span>Instruksi</span>
        <textarea name="instruction" rows="4" maxlength="220">${escapeHtml(template.instruction || template.subtitle || HOTSPOT_VOUCHER_DEFAULT_INSTRUCTION)}</textarea>
      </label>
      <label class="field checkbox-field">
        <input name="showPrice" type="checkbox" value="true" ${showPrice ? 'checked' : ''}>
        <span>Tampilkan harga</span>
      </label>
      <label class="field checkbox-field">
        <input name="showQr" type="checkbox" value="true" ${showQr ? 'checked' : ''}>
        <span>Tampilkan QR</span>
      </label>
      <label class="field checkbox-field">
        <input name="active" type="checkbox" value="true" ${active ? 'checked' : ''}>
        <span>Aktif</span>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan</button>
    </div>
  `;
}

function openRadiusHotspotTemplateModal(template = null) {
  openModal(template ? 'Edit Template Voucher' : 'Tambah Template Voucher', radiusHotspotTemplateFormBody(template || {}), async (payload) => {
    await api(template ? `/api/radius/hotspot/templates/${encodeURIComponent(template.id)}` : '/api/radius/hotspot/templates', {
      method: template ? 'PUT' : 'POST',
      body: JSON.stringify({
        ...payload,
        subtitle: payload.instruction || '',
        showPrice: payload.showPrice === true,
        showQr: payload.showQr === true,
        active: payload.active === true
      })
    });
    setToast(template ? 'Template voucher diperbarui' : 'Template voucher ditambahkan');
    renderRadiusHotspot({ refresh: true });
  });
  bindRadiusHotspotTemplateFields();
}

function radiusHotspotTemplateHtmlFormBody(template = {}) {
  const preset = hotspotVoucherTemplateHtmlPreset(template);
  const html = String(template.customHtml || '').trim() ? template.customHtml : preset.html;
  const css = String(template.customCss || '').trim() ? template.customCss : preset.css;
  return `
    <div class="form-grid">
      <label class="field">
        <span>Nama Template</span>
        <input value="${escapeHtml(template.name || '-')}" readonly>
      </label>
      <label class="field">
        <span>Layout</span>
        <input value="${escapeHtml(hotspotVoucherLayoutLabel(hotspotVoucherLayoutValue(template)))}" readonly>
      </label>
      <label class="field full">
        <span>HTML</span>
        <textarea name="customHtml" rows="14" maxlength="12000" spellcheck="false" data-template-custom-html>${escapeHtml(html)}</textarea>
      </label>
      <label class="field full">
        <span>CSS</span>
        <textarea name="customCss" rows="10" maxlength="8000" spellcheck="false" data-template-custom-css>${escapeHtml(css)}</textarea>
      </label>
      <label class="field full">
        <span>Placeholder</span>
        <textarea rows="6" readonly>${escapeHtml(HOTSPOT_VOUCHER_TEMPLATE_VARIABLES)}</textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="ghost-button" id="fillHotspotHtmlPreset" type="button">Pakai Contoh Layout</button>
      <button class="ghost-button" id="clearHotspotHtmlCustom" type="button">Kosongkan Custom</button>
      <button class="button" type="submit">Simpan HTML</button>
    </div>
  `;
}

function openRadiusHotspotTemplateHtmlModal(template = {}) {
  const preset = hotspotVoucherTemplateHtmlPreset(template);
  openModal(`Edit HTML - ${template.name || 'Template Voucher'}`, radiusHotspotTemplateHtmlFormBody(template), async (payload) => {
    await api(`/api/radius/hotspot/templates/${encodeURIComponent(template.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...template,
        customHtml: payload.customHtml || '',
        customCss: payload.customCss || ''
      })
    });
    setToast('HTML template voucher diperbarui');
    renderRadiusHotspot({ refresh: true });
  });
  const htmlInput = modalBody.querySelector('[data-template-custom-html]');
  const cssInput = modalBody.querySelector('[data-template-custom-css]');
  modalBody.querySelector('#fillHotspotHtmlPreset')?.addEventListener('click', () => {
    if (htmlInput) htmlInput.value = preset.html;
    if (cssInput) cssInput.value = preset.css;
  });
  modalBody.querySelector('#clearHotspotHtmlCustom')?.addEventListener('click', () => {
    if (htmlInput) htmlInput.value = '';
    if (cssInput) cssInput.value = '';
  });
}

function bindRadiusHotspotTemplateFields() {
  const layoutInput = modalBody.querySelector('#hotspotTemplateLayout');
  const customFields = [...modalBody.querySelectorAll('[data-template-custom-field]')];
  const htmlInput = modalBody.querySelector('[data-template-custom-html]');
  const cssInput = modalBody.querySelector('[data-template-custom-css]');
  const fillButton = modalBody.querySelector('#fillHotspotMikhmonTemplate');
  const sync = () => {
    const custom = layoutInput?.value === 'custom';
    if (custom) {
      if (htmlInput && !htmlInput.value.trim()) htmlInput.value = HOTSPOT_VOUCHER_CUSTOM_HTML_DEFAULT;
      if (cssInput && !cssInput.value.trim()) cssInput.value = HOTSPOT_VOUCHER_CUSTOM_CSS_DEFAULT;
    }
    customFields.forEach((field) => {
      field.hidden = !custom;
      field.querySelectorAll('textarea,input,select').forEach((input) => {
        if (input.readOnly) return;
        input.disabled = !custom;
      });
    });
  };
  layoutInput?.addEventListener('change', sync);
  fillButton?.addEventListener('click', () => {
    if (layoutInput) layoutInput.value = 'custom';
    if (htmlInput) htmlInput.value = HOTSPOT_VOUCHER_CUSTOM_HTML_DEFAULT;
    if (cssInput) cssInput.value = HOTSPOT_VOUCHER_CUSTOM_CSS_DEFAULT;
    sync();
  });
  sync();
}

function radiusHotspotBatchToolbar(writeAllowed = false) {
  return `
    <div class="toolbar compact-toolbar radius-batch-toolbar" id="radiusHotspotBatchToolbar" hidden>
      <strong id="radiusHotspotBatchInfo">0 voucher dipilih</strong>
      <div class="row-actions">
        <button class="ghost-button compact" id="radiusHotspotBatchPrint" type="button">Print</button>
        ${writeAllowed ? '<button class="ghost-button compact" id="radiusHotspotBatchIsolate" type="button">Isolir</button>' : ''}
        ${writeAllowed ? '<button class="ghost-button compact" id="radiusHotspotBatchTerminate" type="button">Terminated</button>' : ''}
        ${writeAllowed ? '<button class="danger-button compact" id="radiusHotspotBatchDelete" type="button">Delete</button>' : ''}
      </div>
    </div>
  `;
}

function radiusPppBatchToolbar(writeAllowed = false) {
  if (!writeAllowed) return '';
  return `
    <div class="toolbar compact-toolbar radius-batch-toolbar" id="radiusPppBatchToolbar" hidden>
      <strong id="radiusPppBatchInfo">0 user dipilih</strong>
      <div class="row-actions">
        <button class="ghost-button compact" id="radiusPppBatchIsolate" type="button">Isolir</button>
        <button class="ghost-button compact" id="radiusPppBatchTerminate" type="button">Terminated</button>
        <button class="danger-button compact" id="radiusPppBatchDelete" type="button">Delete</button>
      </div>
    </div>
  `;
}

function selectedRadiusHotspotUsers(rows = []) {
  return [...app.querySelectorAll('[data-radius-hotspot-select]:checked')]
    .map((checkbox) => rows[Number(checkbox.dataset.radiusHotspotSelect)])
    .filter(Boolean);
}

function selectedRadiusPppUsers(rows = []) {
  return [...app.querySelectorAll('[data-radius-ppp-select]:checked')]
    .map((checkbox) => rows[Number(checkbox.dataset.radiusPppSelect)])
    .filter(Boolean);
}

function radiusUserStatusPayload(user = {}, nextStatus = 'active', type = 'ppp') {
  const currentStatus = String(user.rawStatus || user.status || '').toLowerCase();
  const temporaryActivation = type === 'ppp' && nextStatus === 'active'
    && ['isolated', 'isolir', 'suspend', 'suspended'].includes(currentStatus);
  return {
    username: user.username || '',
    profile: user.profile || '',
    nas: user.nas || '',
    staticIp: user.staticIp || '',
    macAddress: user.callerId || '',
    status: nextStatus,
    temporaryActivation,
    isolatedAt: nextStatus === 'isolated' ? (user.isolatedAt || todayInput()) : '',
    isolationSource: nextStatus === 'isolated' ? 'manual' : '',
    isolationReason: nextStatus === 'isolated' ? 'manual-admin' : '',
    isolatedByName: nextStatus === 'isolated' ? (state.auth?.name || state.auth?.username || 'Admin') : '',
    isolatedByUsername: nextStatus === 'isolated' ? (state.auth?.username || '') : '',
    isolatedByRole: nextStatus === 'isolated' ? (state.auth?.role || '') : '',
    terminatedAt: nextStatus === 'terminated' ? todayInput() : '',
    terminationSource: nextStatus === 'terminated' ? 'manual' : '',
    terminationReason: nextStatus === 'terminated' ? 'manual-admin' : '',
    terminatedByName: nextStatus === 'terminated' ? (state.auth?.name || state.auth?.username || 'Admin') : '',
    terminatedByUsername: nextStatus === 'terminated' ? (state.auth?.username || '') : '',
    terminatedByRole: nextStatus === 'terminated' ? (state.auth?.role || '') : '',
    note: user.note || ''
  };
}

async function persistRadiusUserStatus(type = 'ppp', user = {}, nextStatus = 'active') {
  const section = type === 'hotspot' ? 'hotspot' : 'ppp-dhcp';
  await api(`/api/radius/${section}/users/${encodeURIComponent(user.id)}`, {
    method: 'PUT',
    body: JSON.stringify(radiusUserStatusPayload(user, nextStatus, type))
  });
}

async function updateRadiusUserStatus(type = 'ppp', user = {}, nextStatus = 'active') {
  const currentStatus = String(user.rawStatus || user.status || '').toLowerCase();
  const temporaryActivation = type === 'ppp' && nextStatus === 'active'
    && ['isolated', 'isolir', 'suspend', 'suspended'].includes(currentStatus);
  if (temporaryActivation && !window.confirm(`Aktifkan sementara ${user.username || 'pelanggan'} tanpa batas waktu? Invoice dan reminder tetap berjalan sampai pelanggan diisolir kembali secara manual.`)) {
    return;
  }
  await persistRadiusUserStatus(type, user, nextStatus);
  setToast(nextStatus === 'isolated' ? 'User diisolir' : nextStatus === 'terminated' ? 'User diterminate' : temporaryActivation ? 'User diaktifkan sementara; tagihan tetap berjalan' : 'User diaktifkan');
  if (type === 'hotspot') {
    renderRadiusHotspot({ refresh: true });
  } else {
    renderRadiusPppDhcp({ refresh: true });
  }
}

function bindRadiusHotspotBatchActions(rows = [], writeAllowed = false) {
  const toolbar = document.getElementById('radiusHotspotBatchToolbar');
  const info = document.getElementById('radiusHotspotBatchInfo');
  const selectAll = document.getElementById('radiusHotspotSelectAll');
  const checkboxes = [...app.querySelectorAll('[data-radius-hotspot-select]')];
  const sync = () => {
    const selected = selectedRadiusHotspotUsers(rows);
    if (toolbar) toolbar.hidden = selected.length === 0;
    if (info) info.textContent = `${displayNumber(selected.length)} voucher dipilih`;
    if (selectAll) {
      selectAll.checked = selected.length > 0 && selected.length === checkboxes.length;
      selectAll.indeterminate = selected.length > 0 && selected.length < checkboxes.length;
    }
  };
  selectAll?.addEventListener('change', () => {
    checkboxes.forEach((checkbox) => {
      checkbox.checked = selectAll.checked;
    });
    sync();
  });
  checkboxes.forEach((checkbox) => checkbox.addEventListener('change', sync));
  app.querySelectorAll('[data-radius-hotspot-qr]').forEach((button) => {
    button.addEventListener('click', () => {
      const user = rows[Number(button.dataset.radiusHotspotQr || -1)];
      if (user) openHotspotVoucherPrintModal([user]);
    });
  });
  document.getElementById('radiusHotspotBatchPrint')?.addEventListener('click', () => {
    openHotspotVoucherPrintModal(selectedRadiusHotspotUsers(rows));
  });
  if (writeAllowed) {
    document.getElementById('radiusHotspotBatchDelete')?.addEventListener('click', async () => {
      const selected = selectedRadiusHotspotUsers(rows);
      if (!selected.length) return;
      if (!window.confirm(`Hapus ${displayNumber(selected.length)} user Hotspot terpilih?`)) return;
      setToast(`Menghapus ${displayNumber(selected.length)} user Hotspot...`);
      let deleted = 0;
      let failed = 0;
      try {
        const result = await api('/api/radius/hotspot/users/bulk-delete', { method: 'POST', body: JSON.stringify({ users: selected.map((user) => ({ id: user.id, username: user.username || '' })) }) });
        deleted = Number(result.deleted || 0);
        failed = Number(result.failed || 0);
      } catch (error) {
        failed = selected.length;
        setToast(error.message || 'Bulk delete Hotspot gagal');
      }
      setToast(failed ? `${displayNumber(deleted)} user Hotspot dihapus, ${displayNumber(failed)} gagal` : `${displayNumber(deleted)} user Hotspot berhasil dihapus`);
      await renderRadiusHotspot({ refresh: true });
    });
    document.getElementById('radiusHotspotBatchIsolate')?.addEventListener('click', async () => {
      const selected = selectedRadiusHotspotUsers(rows);
      if (!selected.length) return;
      if (!window.confirm(`Isolir ${displayNumber(selected.length)} user Hotspot terpilih?`)) return;
      for (const user of selected) {
        await persistRadiusUserStatus('hotspot', user, 'isolated');
      }
      setToast(`${displayNumber(selected.length)} user Hotspot diisolir`);
      renderRadiusHotspot({ refresh: true });
    });
    document.getElementById('radiusHotspotBatchTerminate')?.addEventListener('click', async () => {
      const selected = selectedRadiusHotspotUsers(rows);
      if (!selected.length) return;
      if (!window.confirm(`Terminate ${displayNumber(selected.length)} user Hotspot terpilih? User ini tidak akan ikut tagihan/invoice.`)) return;
      for (const user of selected) {
        await persistRadiusUserStatus('hotspot', user, 'terminated');
      }
      setToast(`${displayNumber(selected.length)} user Hotspot diterminate`);
      renderRadiusHotspot({ refresh: true });
    });
  }
  sync();
}

function bindRadiusPppBatchActions(rows = [], writeAllowed = false) {
  const toolbar = document.getElementById('radiusPppBatchToolbar');
  const info = document.getElementById('radiusPppBatchInfo');
  const selectAll = document.getElementById('radiusPppSelectAll');
  const checkboxes = [...app.querySelectorAll('[data-radius-ppp-select]')];
  const sync = () => {
    const selected = selectedRadiusPppUsers(rows);
    if (toolbar) toolbar.hidden = selected.length === 0;
    if (info) info.textContent = `${displayNumber(selected.length)} user dipilih`;
    if (selectAll) {
      selectAll.checked = selected.length > 0 && selected.length === checkboxes.length;
      selectAll.indeterminate = selected.length > 0 && selected.length < checkboxes.length;
    }
  };
  selectAll?.addEventListener('change', () => {
    checkboxes.forEach((checkbox) => {
      checkbox.checked = selectAll.checked;
    });
    sync();
  });
  checkboxes.forEach((checkbox) => checkbox.addEventListener('change', sync));
  if (!writeAllowed) {
    sync();
    return;
  }
  document.getElementById('radiusPppBatchDelete')?.addEventListener('click', async () => {
    const selected = selectedRadiusPppUsers(rows);
    if (!selected.length) return;
    if (!window.confirm(`Hapus ${displayNumber(selected.length)} user PPP-DHCP terpilih? Member terkait ikut dihapus, transaksi tetap disimpan.`)) return;
    setToast(`Menghapus ${displayNumber(selected.length)} user PPP-DHCP...`);
    let deleted = 0;
    let failed = 0;
    try {
      const result = await api('/api/radius/ppp-dhcp/users/bulk-delete', { method: 'POST', body: JSON.stringify({ users: selected.map((user) => ({ id: user.id, username: user.username || '' })) }) });
      deleted = Number(result.deleted || 0);
      failed = Number(result.failed || 0);
    } catch (error) {
      failed = selected.length;
      setToast(error.message || 'Bulk delete PPP-DHCP gagal');
    }
    setToast(failed ? `${displayNumber(deleted)} user PPP-DHCP dihapus, ${displayNumber(failed)} gagal` : `${displayNumber(deleted)} user PPP-DHCP berhasil dihapus`);
    await renderRadiusPppDhcp({ refresh: true });
  });
  document.getElementById('radiusPppBatchIsolate')?.addEventListener('click', async () => {
    const selected = selectedRadiusPppUsers(rows);
    if (!selected.length) return;
    if (!window.confirm(`Isolir ${displayNumber(selected.length)} user PPP-DHCP terpilih?`)) return;
    for (const user of selected) {
      await persistRadiusUserStatus('ppp', user, 'isolated');
    }
    setToast(`${displayNumber(selected.length)} user PPP-DHCP diisolir`);
    renderRadiusPppDhcp({ refresh: true });
  });
  document.getElementById('radiusPppBatchTerminate')?.addEventListener('click', async () => {
    const selected = selectedRadiusPppUsers(rows);
    if (!selected.length) return;
    if (!window.confirm(`Terminate ${displayNumber(selected.length)} user PPP-DHCP terpilih? User ini tidak akan ikut tagihan/invoice.`)) return;
    for (const user of selected) {
      await persistRadiusUserStatus('ppp', user, 'terminated');
    }
    setToast(`${displayNumber(selected.length)} user PPP-DHCP diterminate`);
    renderRadiusPppDhcp({ refresh: true });
  });
  sync();
}

async function kickRadiusSession(type = 'ppp', session = {}) {
  if (!session.username) {
    setToast('Username session tidak tersedia');
    return;
  }
  const label = type === 'hotspot' ? 'Hotspot' : 'PPP-DHCP';
  if (!window.confirm(`Kick session ${label} ${session.username}?`)) return;
  const section = type === 'hotspot' ? 'hotspot' : 'ppp-dhcp';
  const result = await api(`/api/radius/${section}/sessions/disconnect`, {
    method: 'POST',
    body: JSON.stringify({
      username: session.username,
      nasId: session.nasId || '',
      nas: session.nas || '',
      nasName: session.nas || '',
      nasIpAddress: session.nasIpAddress || session.nas || '',
      acctSessionId: session.acctSessionId || session.sessionId || '',
      sessionId: session.sessionId || session.acctSessionId || '',
      acctUniqueId: session.acctUniqueId || '',
      framedIpAddress: session.framedIpAddress || session.ipAddress || '',
      ipAddress: session.ipAddress || session.framedIpAddress || '',
      callingStationId: session.callingStationId || session.macAddress || '',
      calledStationId: session.calledStationId || '',
      macAddress: session.macAddress || session.callingStationId || '',
      nasPortId: session.nasPortId || '',
      nasPortType: session.nasPortType || ''
    })
  });
  setToast(result.message || 'Session dikick');
  if (type === 'hotspot') {
    renderRadiusHotspot({ refresh: true });
  } else {
    renderRadiusPppDhcp({ refresh: true });
  }
}

async function renderRadiusPppDhcp(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat Radius PPP-DHCP...</div>';
  const params = queryString({
    tab: state.radiusPppTab,
    page: state.radiusPppPage,
    limit: state.radiusPppLimit,
    search: state.search,
    nas: ['users', 'sessions'].includes(state.radiusPppTab) ? state.radiusPppNas : '',
    status: state.radiusPppTab === 'users' ? state.radiusPppStatus : '',
    profile: state.radiusPppTab === 'users' ? state.radiusPppProfile : '',
    internet: state.radiusPppTab === 'users' ? state.radiusPppInternet : '',
    refresh: options.refresh ? '1' : ''
  });
  const payload = await api(`/api/radius/ppp-dhcp?${params}`);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const radiusPppStartNo = ((Number(payload.pagination?.page || state.radiusPppPage || 1) - 1) * Number(payload.pagination?.limit || RADIUS_PAGE_SIZE)) + 1;
  const fullWriteAllowed = can('radius:write');
  const userWriteAllowed = canAny(['radius:write', 'radius:ppp-users:write']);
  const tableWriteAllowed = state.radiusPppTab === 'users'
    ? userWriteAllowed
    : ['profiles', 'sessions'].includes(state.radiusPppTab) && fullWriteAllowed;
  let filterOptions = { profiles: [], nas: [] };
  if (['users', 'sessions'].includes(state.radiusPppTab)) {
    try {
      filterOptions = await loadRadiusOptions('ppp', { refresh: options.refresh === true });
    } catch {
      filterOptions = { profiles: [], nas: [] };
    }
  }
  const tabs = [
    { value: 'users', label: 'User' },
    { value: 'sessions', label: 'Session' },
    { value: 'profiles', label: 'Profile' }
  ];

  app.innerHTML = `
    <div class="stack">
      ${radiusSummary(payload, {
        total: 'PPP-DHCP',
        totalSub: 'Total user/profile',
        active: 'Aktif',
        suspend: 'Isolir',
        terminate: 'Terminate'
      })}
      ${payload.ok === false ? `<div class="notice warning">${escapeHtml(payload.error || 'Data Radius belum bisa dibaca')}</div>` : ''}
      <div class="toolbar radius-toolbar">
        <div class="filters">
          ${['users', 'sessions'].includes(state.radiusPppTab) ? `
            <select class="control" id="radiusPppNasFilter">
              ${radiusOptionTags(filterOptions.nas, state.radiusPppNas, 'Semua NAS')}
            </select>
          ` : ''}
          ${state.radiusPppTab === 'users' ? `
            <select class="control" id="radiusPppStatusFilter">
              ${radiusOptionTags(radiusStatusFilterOptions('ppp'), state.radiusPppStatus, 'Semua Status')}
            </select>
            <select class="control" id="radiusPppProfileFilter">
              ${radiusOptionTags(filterOptions.profiles, state.radiusPppProfile, 'Semua Profile')}
            </select>
            <select class="control" id="radiusPppInternetFilter">
              <option value="" ${!state.radiusPppInternet ? 'selected' : ''}>Online/Offline</option>
              <option value="online" ${state.radiusPppInternet === 'online' ? 'selected' : ''}>Online</option>
              <option value="offline" ${state.radiusPppInternet === 'offline' ? 'selected' : ''}>Offline</option>
            </select>
          ` : ''}
          <input class="control radius-search-input" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari user, nama, NAS, profile" autocomplete="off">
        </div>
        <div class="row-actions radius-toolbar-actions">
          ${userWriteAllowed && state.radiusPppTab === 'users' ? '<button class="button compact radius-primary-action" id="addRadiusPppUser" type="button">Tambah User</button>' : ''}
          ${fullWriteAllowed && state.radiusPppTab === 'users' ? '<button class="ghost-button compact" id="downloadRadiusPppTemplate" type="button">Template XLSX</button>' : ''}
          ${fullWriteAllowed && state.radiusPppTab === 'users' ? '<button class="ghost-button compact" id="importRadiusPppUsers" type="button">Import XLSX</button><input id="radiusPppImportInput" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' : ''}
          ${state.radiusPppTab === 'users' ? '<button class="ghost-button compact" id="exportRadiusPppUsers" type="button">Export XLSX</button>' : ''}
          ${fullWriteAllowed && state.radiusPppTab === 'profiles' ? '<button class="button compact radius-primary-action" id="addRadiusPppProfile" type="button">Tambah Profile</button>' : ''}
          <button class="ghost-button compact radius-refresh-action" id="refreshRadiusPpp" type="button">Refresh</button>
        </div>
      </div>
      ${state.radiusPppTab === 'users' ? radiusPppBatchToolbar(userWriteAllowed) : ''}
      <section class="section radius-section">
        <div class="section-head">
          ${radiusTabButtons(state.radiusPppTab, tabs, 'radius-ppp')}
          <span class="muted">${tableWriteAllowed ? (fullWriteAllowed ? 'User dan profile bisa dikelola dari aplikasi ini.' : 'User PPP-DHCP bisa dikelola sesuai role login.') : 'Read-only sesuai role login.'}</span>
        </div>
        ${radiusTable(state.radiusPppTab, rows, 'ppp', tableWriteAllowed, radiusPppStartNo)}
        ${radiusPaginationControls('radius-ppp', payload.pagination, state.radiusPppTab === 'sessions' ? 'session' : 'data')}
      </section>
    </div>
  `;

  document.getElementById('refreshRadiusPpp')?.addEventListener('click', () => renderRadiusPppDhcp({ refresh: true }));
  bindPasswordPeek();
  bindFloatingActionMenus(app);
  scheduleTableTopScrollbars(app);
  if (state.radiusPppTab === 'users') {
    bindRadiusPppBatchActions(rows, userWriteAllowed);
  }
  document.getElementById('downloadRadiusPppTemplate')?.addEventListener('click', async () => {
    try {
      await downloadFile('/api/radius/ppp-dhcp/users/template.xlsx', 'template-import-ppp-dhcp.xlsx');
    } catch (error) {
      setToast(error.message);
    }
  });
  document.getElementById('exportRadiusPppUsers')?.addEventListener('click', async () => {
    try {
      await downloadFile('/api/radius/ppp-dhcp/users/export.xlsx', `export-ppp-dhcp-${todayInput()}.xlsx`);
    } catch (error) {
      setToast(error.message);
    }
  });
  document.getElementById('importRadiusPppUsers')?.addEventListener('click', () => {
    document.getElementById('radiusPppImportInput')?.click();
  });
  document.getElementById('radiusPppImportInput')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setToast('Import PPP-DHCP diproses...');
      const contentBase64 = await fileToBase64(file);
      const result = await api('/api/radius/ppp-dhcp/users/import', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentBase64 })
      });
      const failed = Array.isArray(result.errors) ? result.errors.length : 0;
      if (failed) {
        openModal('Hasil Import PPP-DHCP', `
          <div class="stack">
            <div class="notice warning">
              <strong>${displayNumber(failed)} baris gagal diproses</strong>
              <span>${displayNumber(result.created)} user baru dan ${displayNumber(result.updated)} user diperbarui. Baris valid tetap diproses.</span>
            </div>
            <div class="table-wrap compact-table">
              <table>
                <thead>
                  <tr><th>Baris Excel</th><th>No</th><th>Username</th><th>Keterangan</th></tr>
                </thead>
                <tbody>
                  ${result.errors.map((item) => `
                    <tr>
                      <td><strong>${escapeHtml(item.row || '-')}</strong></td>
                      <td>${escapeHtml(item.no || '-')}</td>
                      <td>${escapeHtml(item.username || '-')}</td>
                      <td>${escapeHtml(item.error || 'Gagal import user')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <div class="muted">Perbaiki baris yang tercantum lalu import ulang. User yang sudah berhasil dibuat akan diperbarui, bukan diduplikasi.</div>
          </div>
          <div class="modal-actions">
            <button class="button" type="button" data-close-modal>Tutup</button>
          </div>
        `, async () => {});
      } else {
        setToast(`Import selesai: ${displayNumber(result.created)} baru, ${displayNumber(result.updated)} update`);
      }
      renderRadiusPppDhcp({ refresh: true });
    } catch (error) {
      setToast(error.message);
    } finally {
      event.target.value = '';
    }
  });
  document.getElementById('addRadiusPppUser')?.addEventListener('click', () => openRadiusPppUserModal());
  document.getElementById('addRadiusPppProfile')?.addEventListener('click', () => openRadiusProfileModal('ppp'));
  document.getElementById('radiusPppNasFilter')?.addEventListener('change', (event) => {
    state.radiusPppNas = event.target.value || '';
    state.radiusPppPage = 1;
    renderRadiusPppDhcp();
  });
  document.getElementById('radiusPppStatusFilter')?.addEventListener('change', (event) => {
    state.radiusPppStatus = event.target.value || '';
    state.radiusPppPage = 1;
    renderRadiusPppDhcp();
  });
  document.getElementById('radiusPppProfileFilter')?.addEventListener('change', (event) => {
    state.radiusPppProfile = event.target.value || '';
    state.radiusPppPage = 1;
    renderRadiusPppDhcp();
  });
  document.getElementById('radiusPppInternetFilter')?.addEventListener('change', (event) => {
    state.radiusPppInternet = event.target.value || '';
    state.radiusPppPage = 1;
    renderRadiusPppDhcp();
  });
  app.querySelectorAll('[data-radius-ppp-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.radiusPppTab;
      if (!tabs.some((tab) => tab.value === next) || state.radiusPppTab === next) return;
      state.radiusPppTab = next;
      state.radiusPppPage = 1;
      renderRadiusPppDhcp();
    });
  });
  if (userWriteAllowed && state.radiusPppTab === 'users') {
    app.querySelectorAll('[data-edit-radius-ppp]').forEach((button) => {
      button.addEventListener('click', () => {
        const user = rows.find((entry) => String(entry.id) === String(button.dataset.editRadiusPpp));
        if (user) openRadiusPppUserModal(user);
      });
    });
    app.querySelectorAll('[data-delete-radius-ppp]').forEach((button) => {
      button.addEventListener('click', async () => {
        const username = button.dataset.radiusUsername || '';
        if (!window.confirm(`Hapus user PPP-DHCP ${username || button.dataset.deleteRadiusPpp}?`)) return;
        await api(`/api/radius/ppp-dhcp/users/${encodeURIComponent(button.dataset.deleteRadiusPpp)}?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
        setToast('User PPP-DHCP dihapus');
        renderRadiusPppDhcp({ refresh: true });
      });
    });
    app.querySelectorAll('[data-status-radius-ppp]').forEach((button) => {
      button.addEventListener('click', async () => {
        const user = rows.find((entry) => String(entry.id) === String(button.dataset.statusRadiusPpp));
        if (!user) return;
        const nextStatus = button.dataset.nextStatus || 'active';
        if (nextStatus === 'terminated' && !window.confirm(`Terminate user PPP-DHCP ${user.username}? User ini tidak akan ikut tagihan/invoice.`)) return;
        await updateRadiusUserStatus('ppp', user, nextStatus);
      });
    });
  }
  if (fullWriteAllowed && state.radiusPppTab === 'sessions') {
    app.querySelectorAll('[data-kick-radius-ppp-session]').forEach((button) => {
      button.addEventListener('click', () => {
        const session = rows[Number(button.dataset.kickRadiusPppSession || -1)];
        if (session) kickRadiusSession('ppp', session);
      });
    });
  }
  if (fullWriteAllowed && state.radiusPppTab === 'profiles') {
    app.querySelectorAll('[data-edit-radius-ppp-profile]').forEach((button) => {
      button.addEventListener('click', () => {
        const profile = rows.find((entry) => String(entry.id) === String(button.dataset.editRadiusPppProfile));
        if (profile) openRadiusProfileModal('ppp', profile);
      });
    });
    app.querySelectorAll('[data-delete-radius-ppp-profile]').forEach((button) => {
      button.addEventListener('click', async () => {
        const name = button.dataset.radiusProfileName || '';
        if (!window.confirm(`Hapus profile PPP-DHCP ${name || button.dataset.deleteRadiusPppProfile}?`)) return;
        await api(`/api/radius/ppp-dhcp/profiles/${encodeURIComponent(button.dataset.deleteRadiusPppProfile)}`, { method: 'DELETE' });
        setToast('Profile PPP-DHCP dihapus');
        clearRadiusOptionsCache('ppp');
        renderRadiusPppDhcp({ refresh: true });
      });
    });
  }
  bindSearch((renderOptions = {}) => {
    state.radiusPppPage = 1;
    return renderRadiusPppDhcp(renderOptions);
  });
  bindRadiusPager('radius-ppp', (page) => {
    state.radiusPppPage = page;
  }, renderRadiusPppDhcp, (limit) => {
    state.radiusPppLimit = limit;
  });
}

async function renderRadiusHotspot(options = {}) {
  clearRealtimeTimers();
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat Radius Hotspot...</div>';
  let resellerVoucherRole = state.auth?.role === 'reseller_voucher';
  if (resellerVoucherRole && options.refresh === true) {
    try {
      const authPayload = await api('/api/auth/me');
      state.auth = authPayload.user || state.auth;
      clearRadiusOptionsCache('hotspot');
      resellerVoucherRole = state.auth?.role === 'reseller_voucher';
    } catch {
      // Data halaman tetap dapat memakai konteks sesi terakhir jika refresh profil gagal.
    }
  }
  if (resellerVoucherRole && state.radiusHotspotTab === 'voucher-online') {
    state.radiusHotspotTab = 'users';
  }
  const voucherOnlineTab = state.radiusHotspotTab === 'voucher-online';
  const params = queryString({
    tab: state.radiusHotspotTab,
    page: state.radiusHotspotPage,
    limit: state.radiusHotspotLimit,
    search: state.search,
    nas: ['users', 'sessions'].includes(state.radiusHotspotTab) ? state.radiusHotspotNas : '',
    status: state.radiusHotspotTab === 'users' ? state.radiusHotspotStatus : '',
    profile: state.radiusHotspotTab === 'users' ? state.radiusHotspotProfile : '',
    internet: state.radiusHotspotTab === 'users' ? state.radiusHotspotInternet : '',
    refresh: options.refresh ? '1' : ''
  });
  const payload = voucherOnlineTab
    ? await api('/api/radius/hotspot/voucher-online')
    : await api(`/api/radius/hotspot?${params}`);
  voucherDataRevision = String(payload.revision || voucherDataRevision || '');
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!voucherOnlineTab && state.radiusHotspotTab === 'templates') {
    state.hotspotVoucherTemplates = rows.length ? rows : [hotspotVoucherTemplateFallback()];
  }
  const radiusHotspotStartNo = ((Number(payload.pagination?.page || state.radiusHotspotPage || 1) - 1) * Number(payload.pagination?.limit || RADIUS_PAGE_SIZE)) + 1;
  const fullWriteAllowed = can('radius:write');
  const masterWriteAllowed = fullWriteAllowed && !resellerVoucherRole;
  const freeHotspotWriteAllowed = can('radius:hotspot-free:write');
  const userWriteAllowed = fullWriteAllowed || freeHotspotWriteAllowed;
  const tableWriteAllowed = state.radiusHotspotTab === 'users'
    ? userWriteAllowed
    : (state.radiusHotspotTab === 'profiles' || state.radiusHotspotTab === 'templates')
      ? masterWriteAllowed
      : state.radiusHotspotTab === 'sessions' && fullWriteAllowed;
  let filterOptions = { profiles: [], nas: [] };
  if (['users', 'sessions'].includes(state.radiusHotspotTab)) {
    try {
      filterOptions = await loadRadiusOptions('hotspot', { refresh: options.refresh === true });
    } catch {
      filterOptions = { profiles: [], nas: [] };
    }
  }
  const resellerTargetNas = resellerVoucherRole ? currentUserLockedNasOptions(filterOptions.nas || []) : [];
  if (resellerVoucherRole) {
    filterOptions = { ...filterOptions, nas: resellerTargetNas };
    const selectedNasAllowed = !state.radiusHotspotNas || resellerTargetNas.some((nas) => (
      [nas.id, nas.value, nas.ip].some((value) => String(value || '') === String(state.radiusHotspotNas))
    ));
    if (!selectedNasAllowed) state.radiusHotspotNas = '';
  }
  const resellerTargetLabel = resellerTargetNas.length
    ? resellerTargetNas.map((nas) => nas.label || nas.id).join(', ')
    : (state.auth?.lockedNasNames || state.auth?.lockedNasName || 'Belum diatur');
  const tabs = [
    { value: 'users', label: 'User' },
    { value: 'sessions', label: 'Session' },
    { value: 'profiles', label: 'Profile' },
    { value: 'templates', label: 'Template' },
    ...(resellerVoucherRole ? [] : [{ value: 'voucher-online', label: 'Voucher Online' }])
  ];

  app.innerHTML = `
    <div class="stack">
      ${resellerVoucherRole ? nasTargetContext('NAS Target Reseller Hotspot', resellerTargetLabel, 'Voucher dan profile dibatasi ke NAS ini') : ''}
      ${state.radiusHotspotTab === 'users' ? hotspotRadiusSummary(payload) : radiusSummary(payload, {
        total: 'Hotspot',
        totalSub: 'Total data',
        active: 'Aktif',
        suspend: 'Isolir',
        terminate: 'Nonaktif'
      })}
      ${payload.ok === false ? `<div class="notice warning">${escapeHtml(payload.error || 'Data Radius belum bisa dibaca')}</div>` : ''}
      <div class="toolbar radius-toolbar">
        <div class="filters">
          ${['users', 'sessions'].includes(state.radiusHotspotTab) ? `
            <select class="control" id="radiusHotspotNasFilter">
              ${radiusOptionTags(filterOptions.nas, state.radiusHotspotNas, 'Semua NAS')}
            </select>
          ` : ''}
          ${state.radiusHotspotTab === 'users' ? `
            <select class="control" id="radiusHotspotStatusFilter">
              ${radiusOptionTags(radiusStatusFilterOptions('hotspot'), state.radiusHotspotStatus, 'Semua Status')}
            </select>
            <select class="control" id="radiusHotspotProfileFilter">
              ${radiusOptionTags(filterOptions.profiles, state.radiusHotspotProfile, 'Semua Profile')}
            </select>
            <select class="control" id="radiusHotspotInternetFilter">
              <option value="" ${!state.radiusHotspotInternet ? 'selected' : ''}>Online/Offline</option>
              <option value="online" ${state.radiusHotspotInternet === 'online' ? 'selected' : ''}>Online</option>
              <option value="offline" ${state.radiusHotspotInternet === 'offline' ? 'selected' : ''}>Offline</option>
            </select>
          ` : ''}
          ${voucherOnlineTab ? '' : `<input class="control radius-search-input" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari voucher, user, NAS, profile" autocomplete="off">`}
        </div>
        <div class="row-actions radius-toolbar-actions">
          ${userWriteAllowed && state.radiusHotspotTab === 'users' ? '<button class="button compact radius-primary-action" id="addRadiusHotspotUser" type="button">Tambah User</button>' : ''}
          ${fullWriteAllowed && state.radiusHotspotTab === 'users' ? '<button class="button compact radius-generate-action" id="generateRadiusHotspotVoucher" type="button">Generate Voucher</button>' : ''}
          ${masterWriteAllowed && state.radiusHotspotTab === 'profiles' ? '<button class="button compact radius-primary-action" id="addRadiusHotspotProfile" type="button">Tambah Profile</button>' : ''}
          ${masterWriteAllowed && state.radiusHotspotTab === 'templates' ? '<button class="button compact radius-primary-action" id="addRadiusHotspotTemplate" type="button">Tambah Template</button>' : ''}
          <button class="ghost-button compact radius-refresh-action" id="refreshRadiusHotspot" type="button">Refresh</button>
        </div>
      </div>
      ${!voucherOnlineTab && state.radiusHotspotTab === 'users' ? radiusHotspotBatchToolbar(fullWriteAllowed) : ''}
      <section class="section radius-section">
        <div class="section-head">
          ${radiusTabButtons(state.radiusHotspotTab, tabs, 'radius-hotspot')}
          <span class="muted">${resellerVoucherRole ? 'Reseller mengelola voucher sesuai NAS target.' : fullWriteAllowed ? 'User dan profile bisa dikelola dari aplikasi ini.' : userWriteAllowed ? 'Teknisi hanya bisa kelola user Hotspot Free manual.' : 'Read-only sesuai role login.'}</span>
        </div>
        ${voucherOnlineTab ? radiusHotspotVoucherOnlinePanel(payload, fullWriteAllowed) : radiusTable(state.radiusHotspotTab, rows, 'hotspot', tableWriteAllowed, radiusHotspotStartNo, { rowWriteAllowed: state.radiusHotspotTab === 'users' ? hotspotUserWriteAllowed : null })}
        ${voucherOnlineTab ? '' : radiusPaginationControls('radius-hotspot', payload.pagination, state.radiusHotspotTab === 'sessions' ? 'session' : 'data')}
      </section>
    </div>
  `;

  document.getElementById('refreshRadiusHotspot')?.addEventListener('click', () => renderRadiusHotspot({ refresh: true }));
  bindPasswordPeek();
  bindFloatingActionMenus(app);
  scheduleTableTopScrollbars(app);
  document.getElementById('generateRadiusHotspotVoucher')?.addEventListener('click', () => openRadiusHotspotVoucherModal());
  document.getElementById('addRadiusHotspotUser')?.addEventListener('click', () => openRadiusHotspotUserModal());
  document.getElementById('addRadiusHotspotProfile')?.addEventListener('click', () => openRadiusProfileModal('hotspot'));
  document.getElementById('addRadiusHotspotTemplate')?.addEventListener('click', () => openRadiusHotspotTemplateModal());
  if (!voucherOnlineTab && state.radiusHotspotTab === 'users') {
    bindRadiusHotspotBatchActions(rows, fullWriteAllowed);
  }
  document.getElementById('hotspotVoucherOnlineForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const raw = formData(event.currentTarget);
    const packages = {};
    (payload.profiles || []).forEach((profile) => {
      const id = String(profile.id || '');
      if (!id) return;
      packages[id] = {
        enabled: raw[`pkgEnabled_${id}`] === true,
        label: raw[`pkgLabel_${id}`] || profile.name || '',
        nasId: raw[`pkgNas_${id}`] || '',
        maxPerOrder: raw[`pkgMax_${id}`] || 1,
        sort: raw[`pkgSort_${id}`] || 0
      };
    });
    await api('/api/radius/hotspot/voucher-online', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: raw.enabled === true,
        title: raw.title || '',
        defaultNas: raw.defaultNas || '',
        autoGenerateOnPaid: raw.autoGenerateOnPaid === true,
        codeLength: raw.codeLength || 6,
        codePrefix: raw.codePrefix || '',
        codeCharacter: raw.codeCharacter || 'mixed',
        requireWhatsapp: raw.requireWhatsapp === true,
        sendVoucherWa: raw.sendVoucherWa === true,
        showPrice: raw.showPrice === true,
        successMessage: raw.successMessage || '',
        terms: raw.terms || '',
        packages
      })
    });
    setToast('Voucher online tersimpan');
    renderRadiusHotspot({ refresh: true });
  });
  document.getElementById('radiusHotspotNasFilter')?.addEventListener('change', (event) => {
    state.radiusHotspotNas = event.target.value || '';
    state.radiusHotspotPage = 1;
    renderRadiusHotspot();
  });
  document.getElementById('radiusHotspotStatusFilter')?.addEventListener('change', (event) => {
    state.radiusHotspotStatus = event.target.value || '';
    state.radiusHotspotPage = 1;
    renderRadiusHotspot();
  });
  document.getElementById('radiusHotspotProfileFilter')?.addEventListener('change', (event) => {
    state.radiusHotspotProfile = event.target.value || '';
    state.radiusHotspotPage = 1;
    renderRadiusHotspot();
  });
  document.getElementById('radiusHotspotInternetFilter')?.addEventListener('change', (event) => {
    state.radiusHotspotInternet = event.target.value || '';
    state.radiusHotspotPage = 1;
    renderRadiusHotspot();
  });
  app.querySelectorAll('[data-radius-hotspot-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.dataset.radiusHotspotTab;
      if (!tabs.some((tab) => tab.value === next) || state.radiusHotspotTab === next) return;
      state.radiusHotspotTab = next;
      state.radiusHotspotPage = 1;
      renderRadiusHotspot();
    });
  });
  if (userWriteAllowed && state.radiusHotspotTab === 'users') {
    app.querySelectorAll('[data-edit-radius-hotspot]').forEach((button) => {
      button.addEventListener('click', () => {
        const user = rows.find((entry) => String(entry.id) === String(button.dataset.editRadiusHotspot));
        if (user) openRadiusHotspotUserModal(user);
      });
    });
    app.querySelectorAll('[data-delete-radius-hotspot]').forEach((button) => {
      button.addEventListener('click', async () => {
        const username = button.dataset.radiusUsername || '';
        if (!window.confirm(`Hapus user Hotspot ${username || button.dataset.deleteRadiusHotspot}?`)) return;
        await api(`/api/radius/hotspot/users/${encodeURIComponent(button.dataset.deleteRadiusHotspot)}?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
        setToast('User Hotspot dihapus');
        renderRadiusHotspot({ refresh: true });
      });
    });
    app.querySelectorAll('[data-status-radius-hotspot]').forEach((button) => {
      button.addEventListener('click', async () => {
        const user = rows.find((entry) => String(entry.id) === String(button.dataset.statusRadiusHotspot));
        if (!user) return;
        const nextStatus = button.dataset.nextStatus || 'active';
        if (nextStatus === 'terminated' && !window.confirm(`Terminate user Hotspot ${user.username}? User ini tidak akan ikut tagihan/invoice.`)) return;
        await updateRadiusUserStatus('hotspot', user, nextStatus);
      });
    });
  }
  if (fullWriteAllowed && state.radiusHotspotTab === 'sessions') {
    app.querySelectorAll('[data-kick-radius-hotspot-session]').forEach((button) => {
      button.addEventListener('click', () => {
        const session = rows[Number(button.dataset.kickRadiusHotspotSession || -1)];
        if (session) kickRadiusSession('hotspot', session);
      });
    });
  }
  if (masterWriteAllowed && state.radiusHotspotTab === 'profiles') {
    app.querySelectorAll('[data-edit-radius-hotspot-profile]').forEach((button) => {
      button.addEventListener('click', () => {
        const profile = rows.find((entry) => String(entry.id) === String(button.dataset.editRadiusHotspotProfile));
        if (profile) openRadiusProfileModal('hotspot', profile);
      });
    });
    app.querySelectorAll('[data-delete-radius-hotspot-profile]').forEach((button) => {
      button.addEventListener('click', async () => {
        const name = button.dataset.radiusProfileName || '';
        if (!window.confirm(`Hapus profile Hotspot ${name || button.dataset.deleteRadiusHotspotProfile}?`)) return;
        await api(`/api/radius/hotspot/profiles/${encodeURIComponent(button.dataset.deleteRadiusHotspotProfile)}`, { method: 'DELETE' });
        setToast('Profile Hotspot dihapus');
        clearRadiusOptionsCache('hotspot');
        renderRadiusHotspot({ refresh: true });
      });
    });
  }
  if (masterWriteAllowed && state.radiusHotspotTab === 'templates') {
    app.querySelectorAll('[data-edit-radius-hotspot-template]').forEach((button) => {
      button.addEventListener('click', () => {
        const template = rows.find((entry) => String(entry.id) === String(button.dataset.editRadiusHotspotTemplate));
        if (template) openRadiusHotspotTemplateModal(template);
      });
    });
    app.querySelectorAll('[data-edit-radius-hotspot-template-html]').forEach((button) => {
      button.addEventListener('click', () => {
        const template = rows.find((entry) => String(entry.id) === String(button.dataset.editRadiusHotspotTemplateHtml));
        if (template) openRadiusHotspotTemplateHtmlModal(template);
      });
    });
    app.querySelectorAll('[data-delete-radius-hotspot-template]').forEach((button) => {
      button.addEventListener('click', async () => {
        const name = button.dataset.radiusTemplateName || '';
        if (!window.confirm(`Hapus template voucher ${name || button.dataset.deleteRadiusHotspotTemplate}?`)) return;
        await api(`/api/radius/hotspot/templates/${encodeURIComponent(button.dataset.deleteRadiusHotspotTemplate)}`, { method: 'DELETE' });
        setToast('Template voucher dihapus');
        renderRadiusHotspot({ refresh: true });
      });
    });
  }
  if (!voucherOnlineTab) {
    bindSearch((renderOptions = {}) => {
      state.radiusHotspotPage = 1;
      return renderRadiusHotspot(renderOptions);
    });
    bindRadiusPager('radius-hotspot', (page) => {
      state.radiusHotspotPage = page;
    }, renderRadiusHotspot, (limit) => {
      state.radiusHotspotLimit = limit;
    });
  }
  scheduleVoucherDataRefresh(renderRadiusHotspot);
}

function defaultIsolirPublicUrl() {
  try {
    const current = new URL(window.location.href);
    if (current.port === '8891') {
      current.port = '8892';
      current.pathname = '/isolir';
      current.search = '';
      current.hash = '';
      return current.toString();
    }
    if (/^billing(?:-dev)?\./i.test(current.hostname)) {
      current.hostname = current.hostname.replace(/^billing(?:-dev)?\./i, 'isolir.');
      current.pathname = '/isolir';
      current.search = '';
      current.hash = '';
      return current.toString();
    }
    current.pathname = '/isolir';
    current.search = '';
    current.hash = '';
    return current.toString();
  } catch {
    return 'https://isolir.example.net/isolir';
  }
}

function defaultBillingServerIp() {
  try {
    const host = window.location.hostname || '';
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  } catch {
    // Field sengaja dibiarkan manual jika host bukan IP.
  }
  return '';
}

function hostFromUrl(value = '') {
  const text = String(value || '').trim();
  if (!text) return 'isolir.example.net';
  try {
    return new URL(text.includes('://') ? text : `https://${text}`).hostname || text;
  } catch {
    return text.replace(/^https?:\/\//i, '').split('/')[0] || text;
  }
}

function isolirUrlProtocol(value = '') {
  try {
    return new URL(String(value || '')).protocol === 'https:' ? 'https' : 'http';
  } catch {
    return 'http';
  }
}

function withIsolirProtocol(value = '', protocol = 'http') {
  const nextProtocol = protocol === 'https' ? 'https:' : 'http:';
  try {
    const url = new URL(String(value || ''));
    url.protocol = nextProtocol;
    return url.toString();
  } catch {
    return String(value || '').replace(/^https?:/i, nextProtocol);
  }
}

function routerOsQuoted(value = '') {
  return `"${String(value || '').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function buildIsolirRouterOsScript(options = {}) {
  const sourceSubnet = String(options.sourceSubnet || '172.30.0.0/16').trim();
  const billingServerIp = String(options.billingServerIp || 'ISI_IP_SERVER_BILLING').trim();
  const isolirHost = hostFromUrl(options.isolirUrl || defaultIsolirPublicUrl());
  const httpsMode = String(options.isolirProtocol || isolirUrlProtocol(options.isolirUrl || defaultIsolirPublicUrl())) === 'https';
  const addressList = 'billing-isolir-https';
  const proxyPort = String(options.proxyPort || '8080').trim();
  const wanList = String(options.wanList || 'WAN-NAT').trim();
  const comment = String(options.comment || 'Generated by Billing').trim();
  const proxyComment = `${comment} - Isolir WebProxy`;
  return [
    '',
    '/ip proxy access remove [find comment~"Generated by Billing"]',
    '/ip firewall nat remove [find comment~"Generated by Billing"]',
    '/ip firewall filter remove [find comment~"Generated by Billing"]',
    '/ip firewall address-list remove [find comment~"Generated by Billing"]',
    '/ip firewall address-list remove [find list="' + addressList + '"]',
    '',
    '/ip proxy set enabled=yes port=' + proxyPort + ' anonymous=no cache-administrator=admin@example.net',
    '/ip proxy access add dst-port=' + proxyPort + ' action=allow comment=' + routerOsQuoted(proxyComment),
    '/ip proxy access add dst-host=' + isolirHost + ' action=allow comment=' + routerOsQuoted(proxyComment),
    '/ip proxy access add src-address=' + sourceSubnet + ' dst-host=!' + isolirHost + ' action=redirect action-data=' + isolirHost + ' comment=' + routerOsQuoted(proxyComment),
    ...(httpsMode ? [
      '/ip firewall address-list add list=' + addressList + ' address=' + isolirHost + ' comment=' + routerOsQuoted(proxyComment + ' HTTPS'),
      '/ip firewall filter add chain=forward action=accept protocol=tcp src-address=' + sourceSubnet + ' dst-address-list=' + addressList + ' dst-port=443 comment=' + routerOsQuoted(proxyComment + ' HTTPS'),
    ] : []),
    '',
    '/ip firewall filter add chain=input action=accept protocol=tcp src-address=' + sourceSubnet + ' dst-port=' + proxyPort + ' comment=' + routerOsQuoted(comment + ' - allow webproxy local'),
    '/ip firewall filter add chain=input action=drop protocol=tcp in-interface-list=' + wanList + ' dst-port=' + proxyPort + ' comment=' + routerOsQuoted(comment + ' - block webproxy public'),
    '',
    '/ip firewall nat add chain=dstnat action=redirect to-ports=' + proxyPort + ' protocol=tcp src-address=' + sourceSubnet + ' dst-address=!' + billingServerIp + ' dst-port=' + (httpsMode ? '80' : '80,443') + ' comment=' + routerOsQuoted(proxyComment),
    '/ip firewall nat add chain=dstnat action=redirect to-ports=53 protocol=udp src-address=' + sourceSubnet + ' dst-port=53,5353 comment=' + routerOsQuoted(comment + ' - redirect DNS isolir'),
    '/ip firewall nat add chain=dstnat action=redirect to-ports=53 protocol=tcp src-address=' + sourceSubnet + ' dst-port=53,5353 comment=' + routerOsQuoted(comment + ' - redirect DNS isolir'),
    '',
    '/ip firewall filter add chain=forward action=drop protocol=tcp src-address=' + sourceSubnet + ' dst-address=!' + billingServerIp + ' comment=' + routerOsQuoted(proxyComment),
    '/ip firewall filter add chain=forward action=drop protocol=udp src-address=' + sourceSubnet + ' dst-address=!' + billingServerIp + ' dst-port=!53,5353 comment=' + routerOsQuoted(proxyComment)
  ].filter(Boolean).map((line) => line.endsWith(';') ? line : `${line};`).join('\n');
}

function openRadiusIsolirGuideModal() {
  const defaultIsolirGuide = {
    sourceSubnet: '172.30.0.0/16',
    billingServerIp: defaultBillingServerIp(),
    isolirUrl: defaultIsolirPublicUrl(),
    proxyPort: '8080',
    wanList: 'WAN-NAT',
    comment: 'Generated by Billing'
  };
  let savedIsolirGuide = {};
  try {
    savedIsolirGuide = JSON.parse(localStorage.getItem('fakenetBillingIsolirGuide') || '{}');
  } catch {}
  const defaults = { ...defaultIsolirGuide, ...(state.settings?.isolirGuide || {}), ...savedIsolirGuide };
  let saveTimer = null;
  openModal('Panduan Redirect Isolir MikroTik', `
    <div class="stack routeros-guide">
      <div class="notice">
        <strong>Redirect ke web isolir bawaan billing</strong>
        <span>Script ini mengikuti pola umum rule MikroTik: web-proxy 8080, NAT redirect HTTP/HTTPS, dan filter forward untuk mematikan internet user isolir.</span>
      </div>
      <div class="form-grid routeros-guide-grid">
        <label class="field">
          <span>Subnet pelanggan isolir</span>
          <input name="sourceSubnet" value="${escapeHtml(defaults.sourceSubnet)}">
        </label>
        <label class="field">
          <span>IP Server Billing/Web Isolir</span>
          <input name="billingServerIp" value="${escapeHtml(defaults.billingServerIp)}" placeholder="Contoh 192.0.2.10">
        </label>
        <label class="field">
          <span>Skema web isolir</span>
          <select name="isolirProtocol">
            <option value="http" ${isolirUrlProtocol(defaults.isolirUrl) === 'http' ? 'selected' : ''}>HTTP - IP lokal/port 8892</option>
            <option value="https" ${isolirUrlProtocol(defaults.isolirUrl) === 'https' ? 'selected' : ''}>HTTPS - domain Cloudflare/SSL</option>
          </select>
          <small class="muted">Pilih sesuai endpoint yang ingin diuji. HTTPS membutuhkan domain dan sertifikat yang sudah aktif.</small>
        </label>
        <label class="field">
          <span>URL web isolir</span>
          <input name="isolirUrl" value="${escapeHtml(defaults.isolirUrl)}" placeholder="https://isolir.example.net/isolir">
        </label>
        <label class="field">
          <span>Port web proxy MikroTik</span>
          <input name="proxyPort" inputmode="numeric" value="${escapeHtml(defaults.proxyPort)}">
        </label>
        <label class="field">
          <span>Interface list WAN</span>
          <input name="wanList" value="${escapeHtml(defaults.wanList)}">
          <small class="muted">Nama list, biasanya WAN.</small>
        </label>
        <label class="field">
          <span>Comment rule</span>
          <input name="comment" value="${escapeHtml(defaults.comment)}">
        </label>
      </div>
      <div class="routeros-guide-steps">
        <div><strong>1. Sesuaikan subnet isolir.</strong><span>Subnet ini harus sama dengan pool/IP yang diterima user saat status isolir.</span></div>
        <div><strong>2. Isi IP server billing.</strong><span>Ini IP mesin yang menjalankan subweb isolir billing, bukan IP router.</span></div>
        <div><strong>3. Paste script di terminal MikroTik.</strong><span>Jika masih bisa bypass, pindahkan rule redirect/drop ke atas rule accept umum.</span></div>
      </div>
      <div class="routeros-script-head">
        <strong>Script RouterOS</strong>
        <button class="ghost-button compact" type="button" id="copyIsolirRouterOsScript">Salin Script</button>
      </div>
      <textarea class="routeros-script-output" id="isolirRouterOsScript" readonly spellcheck="false">${escapeHtml(buildIsolirRouterOsScript(defaults))}</textarea>
      <p class="muted">Catatan: kalau web isolir memakai subdomain Cloudflare/NAT, tetap isi IP server billing sesuai IP yang bisa dijangkau dari router/site tersebut.</p>
    </div>
  `, async () => {});

  const form = modal.querySelector('.modal-frame');
  const output = modalBody.querySelector('#isolirRouterOsScript');
  const fields = [...modalBody.querySelectorAll('.routeros-guide-grid input, .routeros-guide-grid select')];
  const updateScript = () => {
    if (!output) return;
    const values = Object.fromEntries(fields.map((input) => [input.name, input.value]));
    try {
      localStorage.setItem('fakenetBillingIsolirGuide', JSON.stringify(values));
    } catch {}
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!can('settings:write')) return;
      api('/api/settings', { method: 'PUT', body: JSON.stringify({ isolirGuide: values }) })
        .then((result) => { state.settings = { ...state.settings, ...(result.settings || {}) }; })
        .catch(() => {});
    }, 500);
    output.value = buildIsolirRouterOsScript(values);
  };
  fields.forEach((input) => {
    input.addEventListener('input', updateScript);
    input.addEventListener('change', updateScript);
  });
  modalBody.querySelector('[name="isolirProtocol"]')?.addEventListener('change', (event) => {
    const urlInput = modalBody.querySelector('[name="isolirUrl"]');
    if (urlInput) {
      urlInput.value = withIsolirProtocol(urlInput.value, event.target.value);
      updateScript();
    }
  });
  modalBody.querySelector('#copyIsolirRouterOsScript')?.addEventListener('click', async () => {
    try {
      updateScript();
      await copyTextToClipboard(output?.value || '');
      setToast('Script MikroTik disalin');
    } catch (error) {
      output?.focus();
      output?.select();
      setToast(`${error.message || 'Gagal menyalin script'}. Script sudah dipilih, tekan Ctrl+C.`);
    }
  });
  if (form) {
    form.onsubmit = (event) => event.preventDefault();
  }
}

async function renderRadiusSettings(options = {}) {
  app.innerHTML = '<div class="empty">Memuat Isolir Radius...</div>';
  const payload = await api(`/api/radius/settings?${queryString({ page: 1, limit: 1, refresh: options.refresh ? '1' : '' })}`);
  const sync = payload.sync || {};
  const radius = payload.radius || {};
  const writeSettings = can('radius:write') || can('settings:write');

  app.innerHTML = `
    <div class="stack">
      ${payload.ok === false ? `<div class="notice warning">${escapeHtml(payload.error || 'Setting Radius belum bisa dibaca')}</div>` : ''}
      ${sync.lastError ? `<div class="notice warning">${escapeHtml(sync.lastError)}</div>` : ''}
      ${writeSettings ? `
        <section class="form-panel">
          <div class="section-head">
            <div>
              <h3>Isolir Radius</h3>
              <p>Override Radius saat user PPP-DHCP atau Hotspot diberi status isolir.</p>
            </div>
          </div>
          <form id="radiusSettingsForm" class="form-grid">
            <label class="field">
              <span>Rate Limit Isolir</span>
              <input name="isolationRateLimit" value="${escapeHtml(radius.isolationRateLimit || '128k/128k')}" placeholder="128k/128k">
            </label>
            <label class="field">
              <span>Group MikroTik Isolir</span>
              <input name="isolationMikrotikGroup" value="${escapeHtml(radius.isolationMikrotikGroup || '')}" placeholder="Opsional">
            </label>
            <label class="field">
              <span>IP Pool Isolir</span>
              <input name="isolationPool" value="${escapeHtml(radius.isolationPool || '')}" placeholder="Opsional">
            </label>
            <label class="field">
              <span>Accounting Interim</span>
              <input name="accountingInterimIntervalSeconds" type="number" min="0" max="86400" value="${escapeHtml(radius.accountingInterimIntervalSeconds ?? 60)}">
            </label>
            <label class="field full">
              <span>Catatan</span>
              <textarea name="isolationNote">${escapeHtml(radius.isolationNote || '')}</textarea>
            </label>
            <div class="modal-actions field full">
              <button class="ghost-button" id="openIsolirRouterGuide" type="button">Panduan Redirect Isolir</button>
              <button class="button" type="submit">Simpan Radius</button>
            </div>
          </form>
        </section>
      ` : ''}
    </div>
  `;

  document.getElementById('openIsolirRouterGuide')?.addEventListener('click', () => openRadiusIsolirGuideModal());
  document.getElementById('radiusSettingsForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    await api('/api/radius/settings', {
      method: 'PUT',
      body: JSON.stringify(formData(form))
    });
    clearRadiusOptionsCache();
    setToast('Pengaturan Radius tersimpan');
    renderRadiusSettings({ refresh: true });
  });
}

function networkAssetFormBody(asset = {}) {
  const types = ['Server', 'Mini PC', 'Router', 'Switch', 'UPS', 'Storage', 'Laptop', 'Tools', 'Alat Ukur', 'Kabel/Toolkit', 'Lainnya'];
  const statuses = ['active', 'maintenance', 'damaged', 'lost', 'inactive'];
  return `
    <div class="form-grid">
      <label class="field">
        <span>Nama aset</span>
        <input name="name" value="${escapeHtml(asset.name || '')}" required>
      </label>
      <label class="field">
        <span>Jenis</span>
        <select name="type">${optionList(types.includes(asset.type) ? types : [asset.type, ...types].filter(Boolean), asset.type || 'Server')}</select>
      </label>
      <label class="field">
        <span>Lokasi</span>
        <input name="site" value="${escapeHtml(asset.site || asset.location || 'Server Room')}">
      </label>
      <label class="field">
        <span>PIC/Pemegang</span>
        <input name="owner" value="${escapeHtml(asset.owner || '')}">
      </label>
      <label class="field">
        <span>Brand</span>
        <input name="brand" value="${escapeHtml(asset.brand || '')}">
      </label>
      <label class="field">
        <span>Model</span>
        <input name="model" value="${escapeHtml(asset.model || '')}">
      </label>
      <label class="field">
        <span>Serial Number</span>
        <input name="serialNumber" value="${escapeHtml(asset.serialNumber || '')}">
      </label>
      <label class="field">
        <span>Kondisi</span>
        <select name="status">
          ${statuses.map((status) => `<option value="${status}" ${status === (asset.status || 'active') ? 'selected' : ''}>${operationalStatusLabel(status)}</option>`).join('')}
        </select>
      </label>
      <label class="field full">
        <span>Catatan</span>
        <textarea name="notes">${escapeHtml(asset.notes || '')}</textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan</button>
    </div>
  `;
}

function openNetworkAssetModal(asset = null) {
  openModal(asset ? 'Edit Aset' : 'Tambah Aset', networkAssetFormBody(asset || {}), async (payload) => {
    await api(asset ? `/api/network-assets/${encodeURIComponent(asset.id)}` : '/api/network-assets', {
      method: asset ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    setToast(asset ? 'Aset diperbarui' : 'Aset ditambahkan');
    renderNetworkAssets();
  });
}

async function renderMonitoringSite(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat monitoring...</div>';
  const params = queryString({
    search: state.search,
    status: 'all'
  });
  const { targets, summary } = await api(`/api/monitoring?${params}`);
  const writeAllowed = can('monitoring:write');
  const checkAllowed = can('monitoring:check');

  app.innerHTML = `
    <div class="stack">
      <section class="metrics">
        ${metric('Target', String(summary.targetCount || 0), 'Dipantau')}
        ${metric('Online', String(summary.upCount || 0), 'Status UP', 'positive')}
        ${metric('Down', String(summary.downCount || 0), 'Perlu cek', summary.downCount ? 'negative' : '')}
        ${metric('Update terakhir', summary.lastCheckedAt ? dateTimeText(summary.lastCheckedAt) : '-', 'Monitoring check')}
      </section>

      <div class="toolbar">
        <div class="filters">
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari target, host, lokasi" autocomplete="off">
        </div>
        <div class="row-actions">
          ${checkAllowed ? '<button class="ghost-button" id="checkMonitoring" type="button">Cek Semua</button>' : ''}
          ${writeAllowed ? '<button class="button" id="addMonitoring" type="button">Tambah Target</button>' : ''}
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Target</th>
              <th>Host</th>
              <th>Metode</th>
              <th>Lokasi</th>
              <th>Status</th>
              <th>Update</th>
              ${(writeAllowed || checkAllowed) ? '<th>Aksi</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${targets.length ? targets.map((target) => `
              <tr>
                <td>
                  <strong>${escapeHtml(target.name)}</strong>
                  <div class="muted">${escapeHtml(target.notes || '-')}</div>
                  <div class="muted">Dashboard IF: ${escapeHtml(target.dashboardInterface || target.trafficInterface || 'Auto')}</div>
                  <div class="muted">Layanan: ${[
                    target.mediaServices?.tvheadendUrl ? 'TV' : '',
                    target.mediaServices?.embyUrl ? 'Movie' : ''
                  ].filter(Boolean).join(', ') || '-'}</div>
                  <div class="muted">NAS Radius: ${target.radius?.enabled ? (target.radius?.credentialStored ? 'Aktif' : 'Secret belum diisi') : '-'}</div>
                </td>
                <td>${escapeHtml(target.host || '-')}<div class="muted">UDP ${escapeHtml(target.port || 161)}</div></td>
                <td>SNMP ${escapeHtml(target.snmpVersion || '2c')}<div class="muted">OID ${escapeHtml(target.oid || '1.3.6.1.2.1.1.3.0')}</div></td>
                <td>${escapeHtml(target.location || '-')}</td>
                <td>
                  <span class="badge ${badgeClass(target.status)}">${operationalStatusLabel(target.status)}</span>
                  <div class="muted">${target.lastLatencyMs === null || target.lastLatencyMs === undefined ? '-' : `${escapeHtml(target.lastLatencyMs)} ms`}</div>
                  ${target.lastValue ? `<div class="muted">${escapeHtml(target.lastValue)}</div>` : ''}
                  ${target.lastError ? `<div class="muted">${escapeHtml(target.lastError)}</div>` : ''}
                </td>
                <td>${dateTimeText(target.lastCheckedAt)}</td>
                ${(writeAllowed || checkAllowed) ? `
                  <td>
                    <div class="row-actions">
                      ${checkAllowed ? `<button class="ghost-button compact" type="button" data-check-target="${escapeHtml(target.id)}">Cek</button>` : ''}
                      ${writeAllowed && target.radius?.enabled ? `<button class="ghost-button compact" type="button" data-connect-radius="${escapeHtml(target.id)}">Hubungkan RADIUS</button>` : ''}
                      ${writeAllowed ? `<button class="ghost-button compact" type="button" data-edit-target="${escapeHtml(target.id)}">Edit</button>` : ''}
                      ${writeAllowed ? `<button class="danger-button compact" type="button" data-delete-target="${escapeHtml(target.id)}">Hapus</button>` : ''}
                    </div>
                  </td>
                ` : ''}
              </tr>
            `).join('') : `<tr><td colspan="${(writeAllowed || checkAllowed) ? 7 : 6}">Belum ada target monitoring.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('addMonitoring')?.addEventListener('click', () => openMonitoringModal());
  document.getElementById('checkMonitoring')?.addEventListener('click', async () => {
    setToast('Monitoring sedang dicek...');
    await api('/api/monitoring/check', {
      method: 'POST',
      body: JSON.stringify({})
    });
    setToast('Monitoring selesai dicek');
    renderMonitoringSite();
  });
  if (checkAllowed) {
    app.querySelectorAll('[data-check-target]').forEach((button) => {
      button.addEventListener('click', async () => {
        await api('/api/monitoring/check', {
          method: 'POST',
          body: JSON.stringify({ targetId: button.dataset.checkTarget })
        });
        setToast('Target selesai dicek');
        renderMonitoringSite();
      });
    });
  }
  if (writeAllowed) {
    app.querySelectorAll('[data-connect-radius]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = targets.find((entry) => entry.id === button.dataset.connectRadius);
        if (target) openRadiusConnectModal(target);
      });
    });
    app.querySelectorAll('[data-edit-target]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = targets.find((entry) => entry.id === button.dataset.editTarget);
        if (target) openMonitoringModal(target);
      });
    });
    app.querySelectorAll('[data-delete-target]').forEach((button) => {
      button.addEventListener('click', async () => {
        const target = targets.find((entry) => entry.id === button.dataset.deleteTarget);
        if (!target) return;
        if (!window.confirm(`Hapus target monitoring ${target.name}? Data target akan hilang dari daftar.`)) return;
        await api(`/api/monitoring/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
        clearRadiusOptionsCache();
        setToast('Target monitoring dihapus');
        renderMonitoringSite();
      });
    });
  }
  bindSearch(renderMonitoringSite);
}

function monitoringFormBody(target = {}) {
  const oid = target.oid || '1.3.6.1.2.1.1.3.0';
  const media = target.mediaServices || {};
  const radius = target.radius || {};
  const hotspot = target.hotspot || {};
  return `
    <div class="form-grid">
      <label class="field">
        <span>Nama target</span>
        <input name="name" value="${escapeHtml(target.name || '')}" required>
      </label>
      <label class="field">
        <span>Host/IP</span>
        <input name="host" value="${escapeHtml(target.host || '')}" placeholder="192.168.1.1 atau router.domain" required>
      </label>
      <label class="field">
        <span>SNMP Version</span>
        <select name="snmpVersion">
          <option value="2c" ${(target.snmpVersion || '2c') === '2c' ? 'selected' : ''}>v2c</option>
          <option value="1" ${target.snmpVersion === '1' ? 'selected' : ''}>v1</option>
        </select>
      </label>
      <label class="field">
        <span>Community</span>
        <input name="community" value="${escapeHtml(target.community || 'public')}" required>
      </label>
      <label class="field">
        <span>Port UDP</span>
        <input name="port" type="number" min="1" max="65535" value="${escapeHtml(target.port || 161)}">
      </label>
      <label class="field full">
        <span>OID</span>
        <input name="oid" value="${escapeHtml(oid)}" placeholder="1.3.6.1.2.1.1.3.0">
      </label>
      <label class="field">
        <span>Timeout ms</span>
        <input name="timeoutMs" type="number" min="1000" max="15000" step="500" value="${escapeHtml(target.timeoutMs || 3000)}">
      </label>
      <label class="field">
        <span>Interface Dashboard</span>
        <input name="dashboardInterface" value="${escapeHtml(target.dashboardInterface || target.trafficInterface || '')}" placeholder="ether1 / sfp1 / 1">
      </label>
      <label class="field">
        <span>Lokasi</span>
        <input name="location" value="${escapeHtml(target.location || '')}">
      </label>
      <div class="field full form-subhead">
        <strong>NAS Radius</strong>
        <span class="muted">Diisi di Site agar PPP-DHCP dan Hotspot bisa tersinkron ke FreeRADIUS.</span>
      </div>
      <label class="field full checkbox-field">
        <input name="radiusEnabled" type="checkbox" value="true" ${radius.enabled || radius.credentialStored ? 'checked' : ''}>
        <span>Aktifkan Site sebagai NAS Radius</span>
      </label>
      <label class="field">
        <span>Port NAS</span>
        <input name="radiusPort" type="number" min="1" max="65535" value="${escapeHtml(radius.port || 3799)}">
      </label>
      <label class="field">
        <span>Type NAS</span>
        <select name="radiusType">
          <option value="mikrotik" ${(radius.type || 'mikrotik') === 'mikrotik' ? 'selected' : ''}>MikroTik</option>
          <option value="other" ${radius.type === 'other' ? 'selected' : ''}>Other</option>
        </select>
      </label>
      <label class="field">
        <span>Secret Radius</span>
        <input name="radiusSecret" type="text" autocomplete="off" value="${escapeHtml(radius.secret || '')}" placeholder="Shared secret MikroTik">
        ${radius.credentialStored ? '<span class="muted">Secret ditampilkan agar dapat dicocokkan dengan konfigurasi MikroTik.</span>' : ''}
      </label>
      <label class="field full">
        <span>URL Login Hotspot</span>
        <input name="hotspotLoginUrl" type="url" value="${escapeHtml(hotspot.loginUrl || target.hotspotLoginUrl || '')}" placeholder="http://login.site.example/login">
        <span class="muted">Dipakai untuk auto-login setelah voucher dibayar dan QR voucher pada Site ini.</span>
      </label>
      <div class="field full form-subhead">
        <strong>Layanan site</strong>
        <span class="muted">Isi layanan tambahan saat tambah Site, atau edit Site existing untuk memperbarui sumber layanan yang dipantau.</span>
      </div>
      <label class="field">
        <span>TV URL</span>
        <input name="tvheadendUrl" value="${escapeHtml(media.tvheadendUrl || '')}">
      </label>
      <label class="field">
        <span>TV username</span>
        <input name="tvheadendUsername" value="${escapeHtml(media.tvheadendUsername || '')}" autocomplete="username">
      </label>
      <label class="field">
        <span>TV password</span>
        <input name="tvheadendPassword" type="password" autocomplete="current-password" placeholder="${media.hasTvheadendLogin ? 'Password tersimpan' : ''}">
        ${media.hasTvheadendLogin ? '<input type="hidden" name="keepTvheadendPassword" value="true"><span class="muted">Kosongkan untuk tetap memakai password tersimpan.</span>' : ''}
      </label>
      <label class="field">
        <span>Movie URL</span>
        <input name="embyUrl" value="${escapeHtml(media.embyUrl || '')}">
      </label>
      <label class="field">
        <span>Movie API key</span>
        <input name="embyApiKey" type="password" autocomplete="off" placeholder="${media.hasEmbyApiKey ? 'API key tersimpan permanen' : ''}">
        ${media.hasEmbyApiKey ? '<input type="hidden" name="keepEmbyApiKey" value="true"><span class="muted">Kosongkan untuk tetap memakai API key tersimpan.</span>' : ''}
      </label>
      <label class="field full">
        <span>Catatan</span>
        <textarea name="notes">${escapeHtml(target.notes || '')}</textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Simpan</button>
    </div>
  `;
}

function openMonitoringModal(target = null) {
  openModal(target ? 'Edit Target Monitoring' : 'Tambah Target Monitoring', monitoringFormBody(target || {}), async (payload) => {
    await api(target ? `/api/monitoring/${encodeURIComponent(target.id)}` : '/api/monitoring', {
      method: target ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    clearRadiusOptionsCache();
    setToast(target ? 'Target diperbarui' : 'Target ditambahkan');
    renderMonitoringSite();
  });
}

function buildRadiusRouterOsScript(options = {}) {
  const radiusServer = String(options.radiusServer || 'ISI_IP_SERVER_BILLING').trim();
  const nasAddress = String(options.nasAddress || 'ISI_IP_NAS').trim();
  const radiusSecret = String(options.radiusSecret || 'ISI_SECRET_RADIUS').trim();
  const services = (Array.isArray(options.services) && options.services.length
    ? options.services
    : ['ppp', 'hotspot', 'dhcp'])
    .filter((service) => ['ppp', 'hotspot', 'dhcp'].includes(service))
    .join(',') || 'ppp,hotspot,dhcp';
  const includesPpp = services.includes('ppp');
  const includesHotspot = services.includes('hotspot');
  const includesDhcp = services.includes('dhcp');
  const queueProfiles = Array.isArray(options.queueProfiles) ? options.queueProfiles : [];
  const queueProfileLines = [];
  const uniqueQueueProfiles = [...new Map(queueProfiles
    .filter((profile) => profile?.queueGroup && profile?.queueRouterValue)
    .map((profile) => [`${profile.serviceType}|${profile.queueGroup}`, profile])).values()];
  for (const profile of uniqueQueueProfiles) {
    const queueGroup = routerOsQuoted(profile.queueGroup);
    const queueValue = routerOsQuoted(profile.queueRouterValue);
    const queueTypes = String(profile.queueRouterValue || '').split('/').filter(Boolean);
    for (const queueType of [...new Set(queueTypes)]) {
      queueProfileLines.push(`:if ([:len [/queue type find where name=${routerOsQuoted(queueType)}]] = 0) do={ :error ${routerOsQuoted(`Queue type ${queueType} belum tersedia di NAS`)} };`);
    }
    if (profile.serviceType === 'hotspot') {
      queueProfileLines.push(
        '{',
        `:local queueProfile ${queueGroup};`,
        `:local queueValue ${queueValue};`,
        ':local queueProfileId [/ip hotspot user profile find where name=$queueProfile];',
        ':if ([:len $queueProfileId] = 0) do={',
        '  /ip hotspot user profile add name=$queueProfile queue-type=$queueValue shared-users=1000;',
        '} else={',
        '  /ip hotspot user profile set $queueProfileId queue-type=$queueValue;',
        '};',
        '}'
      );
    } else {
      queueProfileLines.push(
        '{',
        `:local queueProfile ${queueGroup};`,
        `:local queueValue ${queueValue};`,
        ':local queueProfileId [/ppp profile find where name=$queueProfile];',
        ':if ([:len $queueProfileId] = 0) do={',
        '  /ppp profile add name=$queueProfile queue-type=$queueValue;',
        '} else={',
        '  /ppp profile set $queueProfileId queue-type=$queueValue;',
        '};',
        '};'
      );
    }
  }
  return [
    `:local radiusServer ${routerOsQuoted(radiusServer)};`,
    `:local nasAddress ${routerOsQuoted(nasAddress)};`,
    `:local radiusSecret ${routerOsQuoted(radiusSecret)};`,
    ':local radiusId [/radius find where address=$radiusServer];',
    ':if ([:len $radiusId] > 0) do={ /radius remove $radiusId; };',
    ` /radius add address=$radiusServer secret=$radiusSecret service=${services} authentication-port=1812 accounting-port=1813 timeout=3s src-address=$nasAddress disabled=no require-message-auth=no;`,
    '/radius incoming set accept=yes port=3799;',
    includesPpp ? '/ppp aaa set use-radius=yes accounting=yes interim-update=5m;' : '',
    includesHotspot ? '/ip hotspot profile set [find] use-radius=yes radius-accounting=yes radius-interim-update=received;' : '',
    includesDhcp ? '/ip dhcp-server set [find] use-radius=yes;' : '',
    ...queueProfileLines,
    ':put "RADIUS Billing sudah diterapkan. Jalankan /radius monitor 0 once untuk memeriksa counter.";'
  ].filter(Boolean).join('\n');
}

async function radiusQueueProfilesForRouterScript() {
  const [ppp, hotspot] = await Promise.all([
    api(`/api/radius/ppp-dhcp?${queryString({ tab: 'profiles', page: 1, limit: 100 })}`),
    api(`/api/radius/hotspot?${queryString({ tab: 'profiles', page: 1, limit: 100 })}`)
  ]);
  return [
    ...(ppp.rows || []).map((profile) => ({ ...profile, serviceType: 'pppoe' })),
    ...(hotspot.rows || []).map((profile) => ({ ...profile, serviceType: 'hotspot' }))
  ].filter((profile) => !profile.useMikrotikProfile && profile.queueType && profile.queueGroup && profile.queueRouterValue);
}

async function openRadiusConnectModal(target = {}) {
  const radius = target.radius || {};
  let queueProfiles = [];
  try {
    queueProfiles = await radiusQueueProfilesForRouterScript();
  } catch {
    queueProfiles = [];
  }
  const defaults = {
    radiusServer: radius.serverAddress || defaultBillingServerIp(),
    nasAddress: target.host || radius.address || '',
    radiusSecret: radius.secret || '',
    services: ['ppp', 'hotspot'],
    queueProfiles
  };
  openModal('Hubungkan RADIUS MikroTik', `
    <div class="stack routeros-guide">
      <div class="notice">
        <strong>${escapeHtml(target.name || 'Site')}</strong>
        <span>Periksa nilai otomatis berikut, salin script, lalu paste satu kali di Terminal MikroTik.</span>
      </div>
      ${!defaults.radiusSecret ? '<div class="notice warning">Secret Radius belum diisi. Edit Site dan simpan secret terlebih dahulu.</div>' : ''}
      <div class="form-grid routeros-guide-grid">
        <label class="field">
          <span>IP Server Billing/RADIUS</span>
          <input name="radiusServer" value="${escapeHtml(defaults.radiusServer)}" placeholder="Contoh 172.16.10.253">
        </label>
        <label class="field">
          <span>IP NAS / Source MikroTik</span>
          <input name="nasAddress" value="${escapeHtml(defaults.nasAddress)}" placeholder="Contoh 172.16.10.1">
        </label>
        <label class="field full">
          <span>Secret Radius</span>
          <input name="radiusSecret" type="text" autocomplete="off" value="${escapeHtml(defaults.radiusSecret)}">
        </label>
        <div class="field full radius-service-choice">
          <span>Layanan Radius</span>
          <div class="row-actions">
            <label class="checkbox-field"><input type="checkbox" name="radiusService" value="ppp" checked><span>PPP</span></label>
            <label class="checkbox-field"><input type="checkbox" name="radiusService" value="hotspot" checked><span>Hotspot</span></label>
            <label class="checkbox-field"><input type="checkbox" name="radiusService" value="dhcp" checked><span>DHCP</span></label>
          </div>
        </div>
      </div>
      <div class="routeros-script-head">
        <strong>Script RouterOS</strong>
        <button class="button compact" type="button" id="copyRadiusRouterOsScript">Salin Script</button>
      </div>
      <textarea class="routeros-script-output" id="radiusRouterOsScript" readonly spellcheck="false">${escapeHtml(buildRadiusRouterOsScript(defaults))}</textarea>
      <p class="muted">Kompatibel dengan RouterOS v6.49+. Entry RADIUS dengan IP yang sama akan dihapus lalu dibuat ulang agar koreksi konfigurasi langsung bersih. DHCP memakai use-radius=yes tanpa property accounting terpisah.</p>
    </div>
  `, async () => {});

  const frame = modal.querySelector('.modal-frame');
  const output = modalBody.querySelector('#radiusRouterOsScript');
  const updateScript = () => {
    const services = [...modalBody.querySelectorAll('input[name="radiusService"]:checked')].map((input) => input.value);
    const values = Object.fromEntries([...modalBody.querySelectorAll('.routeros-guide-grid input:not([name="radiusService"])')]
      .map((input) => [input.name, input.value]));
    output.value = buildRadiusRouterOsScript({ ...values, services, queueProfiles });
  };
  modalBody.querySelectorAll('.routeros-guide-grid input').forEach((input) => {
    input.addEventListener('input', updateScript);
    input.addEventListener('change', updateScript);
  });
  modalBody.querySelector('#copyRadiusRouterOsScript')?.addEventListener('click', async () => {
    try {
      await copyTextToClipboard(output?.value || '');
      setToast('Script koneksi RADIUS disalin');
    } catch (error) {
      // HTTP/local browser fallback: keep the complete script selected so the
      // user can press Ctrl+C even when the Clipboard API is unavailable.
      output?.focus();
      output?.select();
      setToast(`${error.message}. Script sudah dipilih, tekan Ctrl+C.`);
    }
  });
  if (frame) frame.onsubmit = (event) => event.preventDefault();
}

function genieStatusBadge(row = {}) {
  return row.online ? '<span class="badge active">Online</span>' : '<span class="badge inactive">Offline</span>';
}

function genieDeviceLabel(row = {}) {
  return [row.manufacturer, row.productClass, row.serialNumber].filter(Boolean).join(' / ') || row.id || '-';
}

function genieTagText(row = {}) {
  const tags = Array.isArray(row.tags) ? row.tags.filter(Boolean) : [];
  return tags.length ? tags.join(', ') : '-';
}

function genieWifiNetworks(row = {}) {
  const networks = Array.isArray(row.wifiNetworks) ? row.wifiNetworks : [];
  return networks.filter((item) => item && item.ssidParameter && item.ssid);
}

function genieWifiOptionLabel(network = {}) {
  const status = network.enabled ? 'Aktif' : 'Nonaktif';
  const clients = `${displayNumber(network.clients || 0)} user`;
  return `${network.band || 'WiFi'} - ${network.ssid || '-'} (${status}, ${clients})`;
}

function genieClientRows(row = {}) {
  return Array.isArray(row.connectedClients) ? row.connectedClients : [];
}

function genieClientTypeKey(value = '') {
  const text = String(value || '').toLowerCase();
  if (text.includes('5')) return '5G';
  if (text.includes('lan') || text.includes('eth')) return 'LAN';
  return '2.4G';
}

function genieClientBadgeClass(type = '') {
  const key = genieClientTypeKey(type);
  if (key === '5G') return 'wifi5';
  if (key === 'LAN') return 'lan';
  return 'wifi24';
}

function genieClientCountByType(rows = [], type = '') {
  const key = genieClientTypeKey(type);
  return rows.filter((row) => genieClientTypeKey(row.type) === key).length;
}

function genieClientCounts(row = {}) {
  const rows = genieClientRows(row);
  const count24 = Math.max(Number(row.wifiClients24 || 0), genieClientCountByType(rows, '2.4G'));
  const count5 = Math.max(Number(row.wifiClients5 || 0), genieClientCountByType(rows, '5G'));
  const countLan = Math.max(Number(row.lanClients || 0), genieClientCountByType(rows, 'LAN'));
  const total = Math.max(Number(row.clientsTotal || row.wifiClientsTotal || 0), rows.length, count24 + count5 + countLan);
  return { count24, count5, countLan, total };
}

async function openGenieClientsModal(row = {}) {
  const payload = await api(`/api/genieacs/devices/${encodeURIComponent(row.id)}/clients?refresh=1`);
  row = { ...row, ...(payload.device || {}) };
  const rows = genieClientRows(row);
  const counts = genieClientCounts(row);
  const pageSize = 10;
  let page = 1;
  openModal('Client Terkoneksi', `
    <div class="genie-client-detail">
      <div class="notice">
        <strong>${escapeHtml(row.username || genieDeviceLabel(row))}</strong>
        <span>${escapeHtml(row.serialNumber || row.productClass || '-')}</span>
      </div>
      <div class="client-summary-strip">
        <span>2.4G ${displayNumber(counts.count24)}</span>
        <span>5G ${displayNumber(counts.count5)}</span>
        <span>LAN ${displayNumber(counts.countLan)}</span>
      </div>
      <div id="genieClientPage"></div>
    </div>
  `, async () => {});
  const renderPage = () => {
    const host = document.getElementById('genieClientPage');
    if (!host) return;
    if (!rows.length) {
      host.innerHTML = '<p class="empty-detail">Detail client belum terbaca dari GenieACS.</p>';
      return;
    }
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.max(1, Math.min(totalPages, page));
    const offset = (page - 1) * pageSize;
    const visibleRows = rows.slice(offset, offset + pageSize);
    host.innerHTML = `
        <div class="detail-table-wrap">
          <table class="detail-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Koneksi</th>
                <th>Nama / Device</th>
                <th>IP Address</th>
                <th>MAC</th>
              </tr>
            </thead>
            <tbody>
              ${visibleRows.map((client, index) => `
                <tr>
                  <td>${displayNumber(offset + index + 1)}</td>
                  <td><span class="client-type-badge ${genieClientBadgeClass(client.type)}">${escapeHtml(genieClientTypeKey(client.type))}</span></td>
                  <td>${escapeHtml(client.name || '-')}</td>
                  <td>${escapeHtml(client.ipAddress || '-')}</td>
                  <td>${escapeHtml(client.macAddress || '-')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="client-detail-pager">
          <span>${displayNumber(offset + 1)}–${displayNumber(Math.min(offset + pageSize, rows.length))} dari ${displayNumber(rows.length)} client</span>
          <div>
            <button class="ghost-button compact" type="button" data-genie-client-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
            <strong>${displayNumber(page)} / ${displayNumber(totalPages)}</strong>
            <button class="ghost-button compact" type="button" data-genie-client-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Berikutnya</button>
          </div>
        </div>`;
  };
  document.getElementById('genieClientPage')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-genie-client-page]');
    if (!button || button.disabled) return;
    page = Number(button.dataset.genieClientPage || 1);
    renderPage();
  });
  renderPage();
}

function genieAcsPaginationControls(pagination = {}) {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('genieacs', pagination.limit || state.genieAcsLimit || 10, 10);
  if (total <= effectivePagerLimit(pagination.limit || state.genieAcsLimit || 10, total, 10)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${total} perangkat` : 'Belum ada perangkat'}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-genieacs-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${page} dari ${totalPages} - ${total} perangkat</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-genieacs-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

function genieAcsRedamanLabel(value = 'all') {
  const labels = {
    all: 'Semua Redaman',
    good: 'Bagus (< 18)',
    normal: 'Normal (18 s/d 26,5)',
    high: 'Tinggi (> 26,5)'
  };
  return labels[value] || labels.all;
}

function setGenieModalStatus(element, state = 'loading', title = '', detail = '') {
  if (!element) return;
  const tone = state === 'success' ? 'positive' : (state === 'error' ? 'error' : (state === 'pending' ? 'warning' : ''));
  const layoutClasses = ['field', 'full'].filter((className) => element.classList.contains(className));
  element.className = ['notice', 'genie-operation-status', ...layoutClasses, tone].filter(Boolean).join(' ');
  element.dataset.state = state;
  element.setAttribute('role', state === 'error' ? 'alert' : 'status');
  element.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  element.hidden = false;
  element.innerHTML = `
    <strong>${escapeHtml(title || 'Memproses...')}</strong>
    ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
  `;
  requestAnimationFrame(() => {
    const scrollRoot = element.closest('#modalBody');
    if (!scrollRoot) return;
    const rootRect = scrollRoot.getBoundingClientRect();
    const statusRect = element.getBoundingClientRect();
    if (statusRect.top < rootRect.top || statusRect.bottom > rootRect.bottom) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

async function openGenieWifiModal(row = {}) {
  const wifiPayload = await api(`/api/genieacs/devices/${encodeURIComponent(row.id)}/wifi-options?${queryString({
    username: row.username || '',
    refresh: '1'
  })}`);
  const networks = Array.isArray(wifiPayload.networks) && wifiPayload.networks.length
    ? wifiPayload.networks
    : genieWifiNetworks(row);
  const addSsid = wifiPayload.addSsid || {};
  const addBands = Array.isArray(addSsid.bands) ? addSsid.bands.filter((item) => item.nextIndex) : [];
  const firstNetwork = networks.find((item) => item.enabled) || networks[0] || {};
  const wifiOptionTags = (items = [], selectedParameter = '') => items.length
    ? items.map((network) => `
      <option value="${escapeHtml(network.ssidParameter)}"
        data-ssid="${escapeHtml(network.ssid || '')}"
        data-password-parameter="${escapeHtml(network.passwordParameter || '')}"
        data-password-enabled="${network.securityEnabled === true ? 'true' : 'false'}"
        data-enabled="${network.enabled !== false ? 'true' : 'false'}"
        ${network.ssidParameter === selectedParameter ? 'selected' : ''}>
        ${escapeHtml(genieWifiOptionLabel(network))}
      </option>
    `).join('')
    : '<option value="">SSID tidak ditemukan</option>';
  const optionTags = wifiOptionTags(networks, firstNetwork.ssidParameter);
  const addSsidForm = addSsid.supported && addBands.length ? `
    <div class="genie-wifi-form-layout">
      <label class="field">
        <span>Band</span>
        <select id="genieWifiAddBand">
          ${addBands.map((band) => `<option value="${escapeHtml(band.value)}">${escapeHtml(band.label)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>Nama SSID</span>
        <input id="genieWifiAddName" type="text" maxlength="32" autocomplete="off" placeholder="Nama WiFi baru">
      </label>
      <label class="field">
        <span>Security</span>
        <select id="genieWifiAddSecurity">
          <option value="none">Open / Tanpa Password</option>
          <option value="pass">WPA/WPA2 Password</option>
        </select>
      </label>
      <label class="field" id="genieWifiAddPasswordField" hidden>
        <span>Password</span>
        <input id="genieWifiAddPassword" type="password" minlength="8" maxlength="63" autocomplete="new-password" placeholder="Minimal 8 karakter">
      </label>
      <label class="field checkbox-field full" id="genieWifiAddShowPasswordField" hidden>
        <input id="genieWifiAddShowPassword" type="checkbox" value="true">
        <span>Tampilkan password</span>
      </label>
      <div class="modal-actions field full genie-wifi-add-actions">
        <button class="ghost-button" type="button" data-close-modal>Batal</button>
        <button class="button" id="genieWifiAddButton" type="button">Tambah SSID</button>
      </div>
    </div>
  ` : `
    <div class="notice warning">
      ${escapeHtml(addSsid.note || 'Slot SSID baru belum tersedia pada modem ini.')}
    </div>
  `;
  openModal('WiFi', `
    <div class="tab-switcher genie-wifi-tab-switcher" role="tablist" aria-label="Pengaturan WiFi">
      <button class="tab-button is-active" type="button" data-genie-wifi-tab="edit" role="tab" aria-selected="true">Ubah WiFi</button>
      <button class="tab-button" type="button" data-genie-wifi-tab="add" role="tab" aria-selected="false">Tambah SSID</button>
    </div>
    <div class="notice genie-operation-status" id="genieWifiOperationStatus" aria-live="polite" hidden></div>
    <section class="genie-wifi-panel is-active" data-genie-wifi-panel="edit">
      <div class="genie-wifi-form-layout">
      <div class="genie-wan-device genie-wifi-device field full">
        <div>
          <strong>${escapeHtml(genieDeviceLabel(row))}</strong>
          <span>${escapeHtml(row.username || 'Username PPPoE belum terbaca')}</span>
        </div>
        <span class="badge">${escapeHtml(wifiPayload.vendor?.label || 'Vendor belum dikenali')}</span>
      </div>
      <label class="field full">
        <span>Pilih SSID</span>
        <select name="ssidParameter" id="genieWifiSelect" required>
          ${optionTags}
        </select>
      </label>
      <input name="passwordParameter" id="genieWifiPasswordParameter" type="hidden" value="${escapeHtml(firstNetwork.passwordParameter || '')}">
      <label class="field">
        <span>Nama WiFi</span>
        <input name="ssid" id="genieWifiSsidInput" type="text" maxlength="32" value="${escapeHtml(firstNetwork.ssid || '')}" required>
      </label>
      <label class="field">
        <span>Status SSID</span>
        <select name="enabled" id="genieWifiEnabled">
          <option value="true" ${firstNetwork.enabled !== false ? 'selected' : ''}>Aktif</option>
          <option value="false" ${firstNetwork.enabled === false ? 'selected' : ''}>Nonaktif</option>
        </select>
      </label>
      <label class="field">
        <span>Security</span>
        <select name="security" id="genieWifiSecurity">
          <option value="pass" ${firstNetwork.securityEnabled === true ? 'selected' : ''}>Password</option>
          <option value="none" ${firstNetwork.securityEnabled === true ? '' : 'selected'}>Open / Tanpa Password</option>
        </select>
      </label>
      <label class="field">
        <span>Password WiFi</span>
        <input name="password" id="genieWifiPasswordInput" type="password" minlength="8" maxlength="63" autocomplete="new-password" placeholder="Kosongkan jika tidak diganti">
      </label>
      <label class="field checkbox-field" id="genieWifiShowPasswordField">
        <input id="genieWifiShowPassword" type="checkbox" value="true">
        <span>Tampilkan password</span>
      </label>
      <div class="modal-actions field full">
        <button class="ghost-button" type="button" data-close-modal>Batal</button>
        <button class="button" type="submit">Simpan WiFi</button>
      </div>
      </div>
    </section>
    <section class="genie-wifi-panel" data-genie-wifi-panel="add" hidden>
      <div class="genie-wifi-device-summary">
        <strong>${escapeHtml(genieDeviceLabel(row))}</strong>
        <span class="muted">${escapeHtml(addSsid.note || 'Slot SSID dipilih otomatis oleh sistem.')}</span>
      </div>
      ${addSsidForm}
    </section>
  `, async (payload, form) => {
    const statusElement = document.getElementById('genieWifiOperationStatus');
    const submitButton = form.querySelector('button[type="submit"]');
    const enabled = String(payload.enabled) !== 'false';
    const security = payload.security === 'none' ? 'none' : 'pass';
    let accepted = false;
    try {
      if (submitButton) submitButton.disabled = true;
      setGenieModalStatus(statusElement, 'loading', 'Mengirim konfigurasi WiFi', 'Menunggu task diterima dan inform modem diperbarui.');
      const response = await api(`/api/genieacs/devices/${encodeURIComponent(row.id)}/wifi`, {
        method: 'POST',
        body: JSON.stringify({
          ssid: payload.ssid,
          ssidParameter: payload.ssidParameter,
          password: payload.password,
          passwordParameter: payload.passwordParameter,
          usePassword: security === 'pass',
          enabled
        })
      });
      accepted = true;
      const verification = response.result?.verification || {};
      setGenieModalStatus(
        statusElement,
        verification.verified ? 'success' : 'pending',
        verification.verified ? 'WiFi berhasil diperbarui' : 'Konfigurasi WiFi sudah dikirim',
        verification.verified
          ? `SSID ${payload.ssid} terverifikasi ${enabled ? 'aktif' : 'nonaktif'} dengan security ${security === 'pass' ? 'Password' : 'Open'}.`
          : 'Task diterima, tetapi SSID, status, security, atau password belum seluruhnya terbaca sesuai. Buka ulang popup untuk cek ulang.'
      );
      const closeButton = form.querySelector('[data-close-modal]');
      if (closeButton) closeButton.textContent = verification.verified ? 'Tutup' : 'Tutup & cek ulang';
      if (verification.verified) {
        try {
          await refreshWifiNetworkOptions(payload.ssidParameter || '');
        } catch {
          // Status task tetap valid; daftar dapat diperbarui saat popup dibuka lagi.
        }
      }
      renderGenieAcs({ refresh: true });
    } catch (error) {
      setGenieModalStatus(statusElement, 'error', 'Konfigurasi WiFi gagal', error.message || 'Task GenieACS tidak dapat dikirim.');
    } finally {
      if (submitButton) {
        submitButton.disabled = accepted;
        if (accepted) submitButton.textContent = 'Sudah dikirim';
      }
    }
    return false;
  });
  const select = document.getElementById('genieWifiSelect');
  const ssidInput = document.getElementById('genieWifiSsidInput');
  const passwordInput = document.getElementById('genieWifiPasswordInput');
  const passwordParameter = document.getElementById('genieWifiPasswordParameter');
  const wifiSecurity = document.getElementById('genieWifiSecurity');
  const wifiEnabled = document.getElementById('genieWifiEnabled');
  const showPasswordField = document.getElementById('genieWifiShowPasswordField');
  const showPassword = document.getElementById('genieWifiShowPassword');
  const syncWifiForm = () => {
    const option = select?.selectedOptions?.[0];
    if (!option) return;
    if (ssidInput) ssidInput.value = option.dataset.ssid || '';
    if (passwordInput) passwordInput.value = '';
    if (passwordParameter) passwordParameter.value = option.dataset.passwordParameter || '';
    if (wifiSecurity) wifiSecurity.value = option.dataset.passwordEnabled === 'true' ? 'pass' : 'none';
    if (wifiEnabled) wifiEnabled.value = option.dataset.enabled === 'false' ? 'false' : 'true';
    if (passwordInput && wifiSecurity) {
      passwordInput.disabled = wifiSecurity.value === 'none';
      passwordInput.required = false;
      passwordInput.type = 'password';
    }
    if (showPasswordField && wifiSecurity) showPasswordField.hidden = wifiSecurity.value === 'none';
    if (showPassword) showPassword.checked = false;
  };
  const refreshWifiNetworkOptions = async (selectedParameter = '') => {
    const refreshed = await api(`/api/genieacs/devices/${encodeURIComponent(row.id)}/wifi-options?${queryString({
      username: row.username || '',
      refresh: '1'
    })}`);
    const refreshedNetworks = Array.isArray(refreshed.networks) ? refreshed.networks : [];
    if (!select || !refreshedNetworks.length) return refreshed;
    const selected = refreshedNetworks.find((item) => item.ssidParameter === selectedParameter)
      || refreshedNetworks.find((item) => item.enabled)
      || refreshedNetworks[0];
    select.innerHTML = wifiOptionTags(refreshedNetworks, selected?.ssidParameter || '');
    select.value = selected?.ssidParameter || '';
    syncWifiForm();
    return refreshed;
  };
  select?.addEventListener('change', syncWifiForm);
  wifiSecurity?.addEventListener('change', () => {
    if (!passwordInput) return;
    passwordInput.disabled = wifiSecurity.value === 'none';
    if (wifiSecurity.value === 'none') {
      passwordInput.value = '';
      passwordInput.type = 'password';
    }
    passwordInput.required = false;
    if (showPasswordField) showPasswordField.hidden = wifiSecurity.value === 'none';
    if (wifiSecurity.value === 'none' && showPassword) showPassword.checked = false;
  });
  showPassword?.addEventListener('change', () => {
    if (passwordInput) passwordInput.type = showPassword.checked ? 'text' : 'password';
  });
  const tabButtons = [...document.querySelectorAll('[data-genie-wifi-tab]')];
  const tabPanels = [...document.querySelectorAll('[data-genie-wifi-panel]')];
  const selectWifiTab = (tab = 'edit') => {
    tabButtons.forEach((button) => {
      const active = button.dataset.genieWifiTab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    tabPanels.forEach((panel) => {
      const active = panel.dataset.genieWifiPanel === tab;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
  };
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => selectWifiTab(button.dataset.genieWifiTab || 'edit'));
  });
  const addSecurity = document.getElementById('genieWifiAddSecurity');
  const addPasswordField = document.getElementById('genieWifiAddPasswordField');
  const addPassword = document.getElementById('genieWifiAddPassword');
  const addShowPasswordField = document.getElementById('genieWifiAddShowPasswordField');
  const addShowPassword = document.getElementById('genieWifiAddShowPassword');
  const syncAddSecurity = () => {
    const protectedWifi = addSecurity?.value === 'pass';
    if (addPasswordField) addPasswordField.hidden = !protectedWifi;
    if (addShowPasswordField) addShowPasswordField.hidden = !protectedWifi;
    if (addPassword) {
      addPassword.required = protectedWifi;
      if (!protectedWifi) {
        addPassword.value = '';
        addPassword.type = 'password';
      }
    }
    if (!protectedWifi && addShowPassword) addShowPassword.checked = false;
  };
  addSecurity?.addEventListener('change', syncAddSecurity);
  addShowPassword?.addEventListener('change', () => {
    if (addPassword) addPassword.type = addShowPassword.checked ? 'text' : 'password';
  });
  const addButton = document.getElementById('genieWifiAddButton');
  addButton?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const statusElement = document.getElementById('genieWifiOperationStatus');
    const band = document.getElementById('genieWifiAddBand')?.value || '';
    const ssid = String(document.getElementById('genieWifiAddName')?.value || '').trim();
    const security = addSecurity?.value || 'none';
    const password = String(addPassword?.value || '');
    if (!ssid) {
      setGenieModalStatus(statusElement, 'error', 'Tambah SSID belum lengkap', 'Nama SSID wajib diisi.');
      return;
    }
    if (security === 'pass' && password.length < 8) {
      setGenieModalStatus(statusElement, 'error', 'Tambah SSID belum lengkap', 'Password WiFi minimal 8 karakter.');
      return;
    }
    let accepted = false;
    try {
      button.disabled = true;
      setGenieModalStatus(statusElement, 'loading', 'Menambahkan SSID', 'Menjalankan konfigurasi SSID, security, password, dan enable secara berurutan.');
      const result = await api(`/api/genieacs/devices/${encodeURIComponent(row.id)}/wifi-add-ssid`, {
        method: 'POST',
        body: JSON.stringify({
          band,
          ssid,
          security,
          password: security === 'pass' ? password : ''
        })
      });
      accepted = true;
      const verified = result.result?.ssid?.verified === true;
      const ssidIndex = Number(result.result?.ssid?.index || 0);
      setGenieModalStatus(
        statusElement,
        verified ? 'success' : 'pending',
        verified ? 'SSID berhasil ditambahkan' : 'Task Tambah SSID sudah dikirim',
        verified
          ? `${ssid} berhasil menjadi SSID${ssidIndex || ''} dan security sudah terverifikasi.`
          : 'Task diterima, tetapi SSID, status, security, atau password belum seluruhnya terbaca sesuai. Buka ulang popup untuk cek ulang.'
      );
      const closeButton = modalBody.querySelector('[data-genie-wifi-panel="add"] [data-close-modal]');
      if (closeButton) closeButton.textContent = verified ? 'Tutup' : 'Tutup & cek ulang';
      if (verified) {
        const selectedParameter = ssidIndex
          ? `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${ssidIndex}.SSID`
          : '';
        try {
          await refreshWifiNetworkOptions(selectedParameter);
        } catch {
          // Inform sudah terverifikasi; daftar akan terbaca saat popup berikutnya dibuka.
        }
        selectWifiTab('edit');
      }
      const addName = document.getElementById('genieWifiAddName');
      if (addName) addName.value = '';
      if (addPassword) addPassword.value = '';
      renderGenieAcs({ refresh: true });
    } catch (error) {
      setGenieModalStatus(statusElement, 'error', 'Tambah SSID gagal', error.message || 'Task GenieACS tidak dapat dikirim.');
    } finally {
      button.disabled = accepted;
      if (accepted) button.textContent = 'Sudah dikirim';
    }
  });
  document.querySelector('[data-genie-wifi-panel="add"]')?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.target.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    addButton?.click();
  });
  syncWifiForm();
  syncAddSecurity();
  selectWifiTab('edit');
}

async function openGenieWanModal(row = {}) {
  const payload = await api(`/api/genieacs/devices/${encodeURIComponent(row.id)}/wans?${queryString({
    username: row.username || '',
    refresh: '1'
  })}`);
  const wanRows = Array.isArray(payload.rows) ? payload.rows : [];
  const bindings = Array.isArray(payload.bindings) ? payload.bindings : [];
  const sortedWanRows = [...wanRows].sort((left, right) => Number(right.protected === true) - Number(left.protected === true));
  const editableRows = wanRows.filter((item) => item.editable);
  const primary = payload.primary || editableRows.find((item) => item.mode === 'pppoe') || null;
  const initialWan = editableRows.find((item) => item.id === payload.defaultTargetId)
    || primary
    || editableRows[0]
    || null;
  const initialTarget = initialWan?.id || 'new';
  const defaultTargetIds = {
    pppoe: payload.defaultTargetIds?.pppoe
      || (primary?.mode === 'pppoe' ? primary.id : editableRows.find((item) => item.mode === 'pppoe')?.id)
      || 'new',
    bridge: payload.defaultTargetIds?.bridge
      || editableRows.find((item) => item.mode === 'bridge')?.id
      || 'new'
  };
  const occupied = new Map();
  wanRows.forEach((wan) => (wan.bindings || []).forEach((key) => {
    if (!occupied.has(key) || wan.protected) occupied.set(key, wan);
  }));
  const rowById = new Map(wanRows.map((item) => [item.id, item]));
  const wanStatus = (item) => {
    const tone = item.protected ? 'warning' : (item.connected ? 'positive' : '');
    return `<span class="badge ${tone}">${escapeHtml(item.protected ? 'Dikunci' : (item.status || 'Tidak aktif'))}</span>`;
  };
  const wanList = sortedWanRows.length
    ? sortedWanRows.map((item) => `
      <div class="genie-wan-row ${item.protected ? 'is-protected' : ''}">
        <div>
          <strong>${escapeHtml(item.label || item.mode || 'WAN')}</strong>
          <span>${escapeHtml(item.username || item.serviceList || item.name || 'Tanpa username')}</span>
        </div>
        <div class="genie-wan-row-meta">
          ${item.primary ? '<span class="badge positive">Utama</span>' : ''}
          ${wanStatus(item)}
          <span>${escapeHtml((item.bindings || []).join(', ') || 'Tanpa binding')}</span>
        </div>
      </div>
    `).join('')
    : '<div class="empty-detail">Belum ada WAN yang terbaca dari modem.</div>';
  const bridgeDisabled = payload.vendor?.bridgeSupported === false ? 'disabled' : '';
  let bindingOnlyRequested = false;
  openModal('Konfigurasi WAN', `
    <div class="genie-wan-form-layout">
    <div class="genie-wan-modal field full">
      <div class="genie-wan-device">
        <div>
          <span>Perangkat</span>
          <strong>${escapeHtml(genieDeviceLabel(row))}</strong>
        </div>
        <span class="badge">${escapeHtml(payload.vendor?.label || 'Vendor belum dikenali')}</span>
      </div>
      <div class="genie-wan-list">${wanList}</div>
    </div>
    <div class="notice genie-operation-status field full" id="genieWanOperationStatus" aria-live="polite" hidden></div>
    <div class="field full form-subhead">
      <strong id="genieWanFormTitle">${initialWan ? `Edit WAN ${escapeHtml(initialWan.label)}` : 'Tambah WAN baru'}</strong>
      <span class="muted">WAN provisioning GenieACS tetap dikunci.</span>
    </div>
    <label class="field full">
      <span>Target WAN</span>
      <select name="targetWan" id="genieWanTarget">
        ${editableRows.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === initialTarget ? 'selected' : ''}>Edit WAN ${escapeHtml(item.label)}${item.username ? ` - ${escapeHtml(item.username)}` : ''}</option>`).join('')}
        <option value="new" ${initialTarget === 'new' ? 'selected' : ''}>Tambah WAN baru</option>
      </select>
    </label>
    <div class="genie-wan-mode field full" role="group" aria-label="Mode WAN">
      <label><input name="mode" type="radio" value="pppoe" ${initialWan?.mode !== 'bridge' ? 'checked' : ''}><span>PPPoE Routed</span></label>
      <label class="${bridgeDisabled ? 'is-disabled' : ''}"><input name="mode" type="radio" value="bridge" ${initialWan?.mode === 'bridge' ? 'checked' : ''} ${bridgeDisabled}><span>Bridge</span></label>
    </div>
    <label class="field">
      <span>VLAN ID</span>
      <input name="vlan" id="genieWanVlan" type="number" min="1" max="4094" inputmode="numeric" required>
    </label>
    <label class="field" data-genie-wan-pppoe>
      <span>Username PPPoE</span>
      <input name="username" id="genieWanUsername" value="${escapeHtml(row.username || '')}" autocomplete="off">
    </label>
    <label class="field full" data-genie-wan-pppoe>
      <span>Password PPPoE</span>
      <input name="password" id="genieWanPassword" type="text" autocomplete="off" placeholder="Kosongkan jika tidak diganti">
    </label>
    <div class="field full genie-wan-bindings">
      <span>Binding port dan WiFi</span>
      <div class="genie-wan-binding-grid">
        ${bindings.map((binding) => {
          const owner = occupied.get(binding.key);
          const locked = owner?.protected === true;
          const detail = locked
            ? 'Dipakai WAN management'
            : (owner ? `Dipakai ${owner.label}` : (binding.active === false ? 'Port/SSID nonaktif' : 'Tersedia'));
          return `<label class="genie-wan-binding ${locked ? 'is-locked' : ''}" title="${escapeHtml(detail)}">
            <input name="bindings" type="checkbox" value="${escapeHtml(binding.key)}" data-multi-value ${locked ? 'disabled' : ''}>
            <span><strong>${escapeHtml(binding.label || binding.key)}</strong><small>${escapeHtml(detail)}</small></span>
          </label>`;
        }).join('') || '<span class="muted">Binding LAN/SSID belum terbaca dari modem.</span>'}
      </div>
    </div>
    <label class="field full checkbox-field">
      <input name="moveBindings" type="checkbox" value="true">
      <span>Pindahkan LAN/SSID yang masih terikat ke WAN lain</span>
    </label>
    <div class="notice field full">
      Untuk Bridge, satu WAN dapat mengikat beberapa port sekaligus, misalnya SSID2 dan LAN4. Binding management tidak dapat dipindahkan.
    </div>
    <div class="modal-actions field full">
      <button class="ghost-button" type="button" data-close-modal>Tutup</button>
      <button class="ghost-button" id="genieWanBindingOnly" type="button">Simpan Binding</button>
      <button class="button" type="submit">Kirim Konfigurasi</button>
    </div>
    </div>
  `, async (formPayload, form) => {
    const statusElement = document.getElementById('genieWanOperationStatus');
    const submitButton = form.querySelector('button[type="submit"]');
    const bindingOnly = bindingOnlyRequested;
    bindingOnlyRequested = false;
    const mode = String(formPayload.mode || 'pppoe').trim().toLowerCase();
    if (bindingOnly && String(formPayload.targetWan || '') === 'new') {
      setGenieModalStatus(statusElement, 'error', 'Binding belum dapat disimpan', 'Pilih WAN yang sudah ada.');
      return false;
    }
    if (mode === 'pppoe' && !String(formPayload.username || '').trim()) {
      setGenieModalStatus(statusElement, 'error', 'Konfigurasi WAN belum lengkap', 'Username PPPoE wajib diisi.');
      return false;
    }
    try {
      if (submitButton) submitButton.disabled = true;
      setGenieModalStatus(
        statusElement,
        'loading',
        bindingOnly ? 'Menyimpan binding WAN' : 'Mengirim konfigurasi WAN',
        'Menunggu task diterima dan inform modem diperbarui.'
      );
      const response = await api(`/api/genieacs/devices/${encodeURIComponent(row.id)}/wan`, {
        method: 'POST',
        body: JSON.stringify({
          targetWan: formPayload.targetWan || 'new',
          mode,
          vlan: Number(formPayload.vlan || 0),
          username: formPayload.username,
          password: formPayload.password,
          bindings: formPayload.bindings || [],
          moveBindings: formPayload.moveBindings === true,
          bindingOnly,
          preferredUsername: row.username || ''
        })
      });
      const verification = response.verification || {};
      setGenieModalStatus(
        statusElement,
        verification.verified ? 'success' : 'pending',
        verification.verified
          ? (bindingOnly ? 'Binding WAN berhasil disimpan' : 'WAN berhasil dikonfigurasi')
          : (bindingOnly ? 'Binding WAN sudah dikirim' : 'Konfigurasi WAN sudah dikirim'),
        verification.verified
          ? 'Binding dan inform modem sudah terverifikasi melalui GenieACS.'
          : 'Modem belum mengirim inform terbaru. Konfigurasi tetap berada di antrean GenieACS.'
      );
      renderGenieAcs({ refresh: true });
    } catch (error) {
      setGenieModalStatus(statusElement, 'error', 'Konfigurasi WAN gagal', error.message || 'Task GenieACS tidak dapat dikirim.');
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
    return false;
  });

  const target = document.getElementById('genieWanTarget');
  const vlan = document.getElementById('genieWanVlan');
  const username = document.getElementById('genieWanUsername');
  const password = document.getElementById('genieWanPassword');
  const bindingOnlyButton = document.getElementById('genieWanBindingOnly');
  const formTitle = document.getElementById('genieWanFormTitle');
  const modeInputs = [...modalBody.querySelectorAll('input[name="mode"]')];
  const bindingInputs = [...modalBody.querySelectorAll('input[name="bindings"]')];
  const syncWanForm = () => {
    const selected = rowById.get(target?.value || '') || null;
    if (formTitle) formTitle.textContent = selected ? `Edit WAN ${selected.label}` : 'Tambah WAN baru';
    if (selected) {
      const modeInput = modeInputs.find((input) => input.value === selected.mode);
      if (modeInput && !modeInput.disabled) modeInput.checked = true;
      if (vlan) vlan.value = selected.vlan ?? '';
      if (username) username.value = selected.username || row.username || '';
      if (password) password.value = '';
      const selectedBindings = new Set(selected.bindings || []);
      bindingInputs.forEach((input) => { input.checked = selectedBindings.has(input.value); });
    } else {
      if (vlan) vlan.value = '';
      if (username && !username.value) username.value = row.username || '';
      if (password) password.value = '';
      bindingInputs.forEach((input) => { input.checked = false; });
    }
    const mode = modeInputs.find((input) => input.checked)?.value || 'pppoe';
    modalBody.querySelectorAll('[data-genie-wan-pppoe]').forEach((field) => { field.hidden = mode !== 'pppoe'; });
    if (username) username.required = mode === 'pppoe';
    if (password) password.required = mode === 'pppoe' && !selected;
    if (bindingOnlyButton) bindingOnlyButton.disabled = !selected || payload.vendor?.wanWriteSupported === false;
  };
  target?.addEventListener('change', syncWanForm);
  modeInputs.forEach((input) => input.addEventListener('change', () => {
    if (target) target.value = defaultTargetIds[input.value] || 'new';
    syncWanForm();
  }));
  bindingOnlyButton?.addEventListener('click', () => {
    if (!rowById.has(target?.value || '')) {
      setGenieModalStatus(
        document.getElementById('genieWanOperationStatus'),
        'error',
        'Binding belum dapat disimpan',
        'Pilih WAN yang sudah ada.'
      );
      return;
    }
    bindingOnlyRequested = true;
    modal.querySelector('.modal-frame')?.requestSubmit();
  });
  syncWanForm();
}

async function openGenieAcsSettingsModal() {
  const payload = await api('/api/genieacs/settings');
  const settings = payload.settings || {};
  const wifiKu = settings.wifiKu || {};
  openModal('Setting GenieACS', `
    <label class="field full">
      <span>Aktifkan GenieACS</span>
      <label class="check-row">
        <input name="enabled" type="checkbox" value="true" ${settings.enabled ? 'checked' : ''}>
        <span>Gunakan GenieACS NBI</span>
      </label>
    </label>
    <label class="field full">
      <span>URL NBI GenieACS</span>
      <input name="baseUrl" value="${escapeHtml(settings.baseUrl || '')}" placeholder="http://acs.example.net:7557" required>
    </label>
    <label class="field full">
      <span>Token NBI</span>
      <input name="token" type="password" autocomplete="off" placeholder="${settings.tokenConfigured ? 'Token tersimpan, kosongkan jika tidak diubah' : 'Opsional jika NBI memakai token'}">
      ${settings.tokenConfigured ? '<label class="check-row"><input name="clearToken" type="checkbox" value="true"><span>Hapus token tersimpan</span></label>' : ''}
    </label>
    <div class="field full form-subhead">
      <strong>WifiKu</strong>
      <span class="muted">Portal pelanggan tetap memakai nomor WhatsApp dari Member.</span>
    </div>
    <label class="field">
      <span>Portal WifiKu</span>
      <label class="check-row">
        <input name="wifiKuEnabled" type="checkbox" value="true" ${wifiKu.enabled !== false ? 'checked' : ''}>
        <span>Aktif</span>
      </label>
    </label>
    <label class="field">
      <span>Login OTP</span>
      <label class="check-row">
        <input name="wifiKuRequireOtp" type="checkbox" value="true" ${wifiKu.requireOtp !== false ? 'checked' : ''}>
        <span>Wajib OTP WhatsApp</span>
      </label>
    </label>
    <label class="field">
      <span>Sub URL WifiKu</span>
      <input name="wifiKuPublicPath" value="${escapeHtml(wifiKu.publicPath || '/wifiku')}" placeholder="/wifiku">
    </label>
    <div class="modal-actions field full">
      <button class="button" type="submit">Simpan</button>
    </div>
  `, async (formPayload) => {
    const result = await api('/api/genieacs/settings', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: formPayload.enabled === true,
        baseUrl: formPayload.baseUrl,
        token: formPayload.token,
        clearToken: formPayload.clearToken === true,
        connectionRequest: true,
        wifiKu: {
          enabled: formPayload.wifiKuEnabled === true,
          requireOtp: formPayload.wifiKuRequireOtp === true,
          publicPath: formPayload.wifiKuPublicPath
        }
      })
    });
    state.settings = {
      ...state.settings,
      genieAcs: result.settings || state.settings.genieAcs
    };
    setToast('Setting GenieACS tersimpan');
    renderGenieAcs({ refresh: true });
  });
}

function genieAcsRecentPendingSignature(payload = {}) {
  return (Array.isArray(payload.devices) ? payload.devices : [])
    .map((device) => `${device.id || ''}|${device.registered || ''}|${device.wanPending?.code || ''}`)
    .join(';');
}

function genieAcsRecentPendingMarkup(payload = {}, requestedPage = genieAcsRecentPage) {
  const devices = Array.isArray(payload.devices) ? payload.devices : [];
  if (payload.ok === false) {
    return `<div class="notice warning">${escapeHtml(payload.error || 'ONT baru belum dapat dideteksi.')}</div>`;
  }
  if (!devices.length) {
    return '<div class="empty genieacs-recent-empty">Tidak ada perangkat baru yang menunggu konfigurasi internet.</div>';
  }
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(devices.length / pageSize));
  const page = Math.max(1, Math.min(totalPages, Number(requestedPage || 1) || 1));
  genieAcsRecentPage = page;
  const offset = (page - 1) * pageSize;
  const visibleDevices = devices.slice(offset, offset + pageSize);
  const pagerMarkup = totalPages > 1 ? `<div class="genieacs-provision-pager">
    <span>Menampilkan ${displayNumber(offset + 1)}–${displayNumber(Math.min(offset + pageSize, devices.length))} dari ${displayNumber(devices.length)} ONT</span>
    <div class="row-actions">
      <button class="ghost-button compact" type="button" data-genie-recent-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
      <strong>Halaman ${displayNumber(page)} / ${displayNumber(totalPages)}</strong>
      <button class="ghost-button compact" type="button" data-genie-recent-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Berikutnya</button>
    </div>
  </div>` : '';
  return `<div class="genieacs-provision-table" role="table" aria-label="Antrian aktivasi ONT">
    <div class="genieacs-provision-table-head" role="row" aria-hidden="true">
      <span>Perangkat</span>
      <span>Terdaftar</span>
      <span>Kesiapan Internet</span>
      <span>Aksi</span>
    </div>
    <div class="genieacs-provision-table-body">${visibleDevices.map((device) => {
    const pppoe = device.wanSummary?.pppoe || device.wanPending?.pppoe || null;
    const pppDetail = pppoe
      ? [pppoe.username || '', pppoe.status || '', pppoe.vlan ? `VLAN ${pppoe.vlan}` : ''].filter(Boolean).join(' · ')
      : 'Profil PPPoE belum ditemukan';
    return `<div class="genieacs-provision-row" role="row">
      <div class="genieacs-provision-device" role="cell" data-label="Perangkat">
        <strong>${escapeHtml(device.model || device.productClass || 'Modem baru')}</strong>
        <span>${escapeHtml(device.detectedVendor || device.manufacturer || 'Vendor belum dikenali')}</span>
        <code title="${escapeHtml(device.serialNumber || device.id || '-')}">${escapeHtml(device.serialNumber || device.id || '-')}</code>
      </div>
      <div class="genieacs-provision-registered" role="cell" data-label="Terdaftar">
        <strong>${escapeHtml(dateTimeText(device.registered))}</strong>
        <span>Registrasi ACS</span>
      </div>
      <div class="genieacs-provision-status" role="cell" data-label="Kesiapan Internet">
        <span class="badge pending">${escapeHtml(device.wanPending?.label || 'Perlu internet')}</span>
        <span>${escapeHtml(pppDetail)}</span>
      </div>
      <div class="genieacs-provision-action" role="cell">
        <button class="ghost-button compact" type="button" data-genie-recent-device="${escapeHtml(device.id || '')}">Tampilkan</button>
      </div>
    </div>`;
  }).join('')}</div>
  </div>${pagerMarkup}`;
}

function applyGenieAcsRecentPending(payload = {}, options = {}) {
  if (state.view !== 'genieAcs') return;
  const devices = Array.isArray(payload.devices) ? payload.devices : [];
  const nextIds = new Set(devices.map((device) => String(device.id || '')).filter(Boolean));
  const newIds = [...nextIds].filter((id) => !genieAcsRecentIds.has(id));
  const list = document.getElementById('genieAcsRecentList');
  const count = document.getElementById('genieAcsRecentCount');
  const checked = document.getElementById('genieAcsRecentChecked');
  if (options.notify === true && newIds.length) genieAcsRecentPage = 1;
  genieAcsRecentPayload = payload;
  if (list) list.innerHTML = genieAcsRecentPendingMarkup(payload);
  if (count) count.textContent = displayNumber(devices.length);
  if (checked) checked.textContent = payload.checkedAt ? `Diperbarui ${dateTimeText(payload.checkedAt)}` : 'Menunggu pembaruan pertama';
  if (options.notify === true && newIds.length) {
    setToast(`${displayNumber(newIds.length)} ONT baru terdeteksi dan memerlukan konfigurasi WAN`);
  }
  genieAcsRecentSignature = genieAcsRecentPendingSignature(payload);
  genieAcsRecentIds = nextIds;
}

function scheduleGenieAcsRecentDetection() {
  window.clearTimeout(genieAcsRecentTimer);
  genieAcsRecentTimer = null;
  if (state.view !== 'genieAcs' || !state.auth) return;
  genieAcsRecentTimer = window.setTimeout(async () => {
    if (state.view !== 'genieAcs' || !state.auth) return;
    if (document.hidden || genieAcsRecentLoading) {
      scheduleGenieAcsRecentDetection();
      return;
    }
    genieAcsRecentLoading = true;
    try {
      const payload = await api('/api/genieacs/devices/recent-pending?hours=24&limit=100');
      const nextSignature = genieAcsRecentPendingSignature(payload);
      if (nextSignature !== genieAcsRecentSignature) {
        applyGenieAcsRecentPending(payload, { notify: true });
      } else {
        const checked = document.getElementById('genieAcsRecentChecked');
        if (checked && payload.checkedAt) checked.textContent = `Diperbarui ${dateTimeText(payload.checkedAt)}`;
      }
    } catch {
      // Deteksi berikutnya tetap dijadwalkan; tabel utama tidak ikut terganggu.
    } finally {
      genieAcsRecentLoading = false;
      scheduleGenieAcsRecentDetection();
    }
  }, 30000);
}

async function refreshGenieAcsRecentPending(options = {}) {
  if (genieAcsRecentLoading) return;
  const button = document.getElementById('refreshGenieAcsRecent');
  genieAcsRecentLoading = true;
  if (button) button.disabled = true;
  try {
    const payload = await api(`/api/genieacs/devices/recent-pending?hours=24&limit=100${options.refresh ? '&refresh=1' : ''}`);
    applyGenieAcsRecentPending(payload, { notify: options.notify === true });
  } catch (error) {
    setToast(error.message || 'Deteksi ONT baru gagal');
  } finally {
    genieAcsRecentLoading = false;
    if (button?.isConnected) button.disabled = false;
    scheduleGenieAcsRecentDetection();
  }
}

async function renderGenieAcs(options = {}) {
  window.clearTimeout(genieAcsRecentTimer);
  genieAcsRecentTimer = null;
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat GenieACS...</div>';
  const [payload, recentPending] = await Promise.all([
    api(`/api/genieacs/devices?${queryString({
      page: state.genieAcsPage,
      limit: state.genieAcsLimit,
      status: state.genieAcsStatus,
      nas: state.genieAcsNas,
      redaman: state.genieAcsRedaman,
      search: state.search,
      refresh: options.refresh ? '1' : ''
    })}`),
    api(`/api/genieacs/devices/recent-pending?hours=24&limit=100${options.refresh ? '&refresh=1' : ''}`)
      .catch((error) => ({ ok: false, devices: [], error: error.message }))
  ]);
  const rows = payload.rows || [];
  const nasOptions = Array.isArray(payload.nasOptions) ? payload.nasOptions : [];
  const summary = payload.summary || {};
  genieAcsRecentPage = 1;
  genieAcsRecentPayload = recentPending;
  const writeAllowed = can('genieacs:write');
  const startNo = ((Number(payload.pagination?.page || state.genieAcsPage || 1) - 1) * Number(payload.pagination?.limit || state.genieAcsLimit || 10)) + 1;
  app.innerHTML = `
    <div class="stack">
      ${payload.ok === false ? `<div class="notice warning">${escapeHtml(payload.error || 'GenieACS belum bisa dibaca')}</div>` : ''}
      <section class="metrics genieacs-summary">
        ${metric('Total Device', displayNumber(summary.total || 0), 'GenieACS')}
        ${metric('Online', displayNumber(summary.online || 0), 'Last inform <= 15 menit', 'positive')}
        ${metric('Offline', displayNumber(summary.offline || 0), 'Perlu dicek', Number(summary.offline || 0) ? 'negative' : '')}
        ${metric('Redaman Tinggi', displayNumber(summary.redamanHighCount || 0), `> 26,5 dB dari ${displayNumber(summary.redamanCount || 0)} terbaca`, Number(summary.redamanHighCount || 0) ? 'negative' : '')}
      </section>

      <section class="section genieacs-recent-section">
        <div class="section-head genieacs-recent-head">
          <div class="genieacs-recent-title">
            <span class="genieacs-recent-kicker">Provisioning perangkat</span>
            <h2>Antrian Aktivasi ONT</h2>
            <span class="muted">Perangkat baru yang belum memiliki koneksi PPPoE aktif</span>
          </div>
          <div class="genieacs-recent-actions">
            <div class="genieacs-recent-status">
              <strong id="genieAcsRecentCount">${displayNumber((recentPending.devices || []).length)}</strong>
              <span>Menunggu konfigurasi</span>
            </div>
            <button class="ghost-button compact" id="refreshGenieAcsRecent" type="button">Perbarui</button>
          </div>
        </div>
        <div class="genieacs-recent-meta">
          <span>Rentang pemantauan: 24 jam</span>
          <span id="genieAcsRecentChecked">${recentPending.checkedAt ? `Diperbarui ${escapeHtml(dateTimeText(recentPending.checkedAt))}` : 'Menunggu pembaruan pertama'}</span>
        </div>
        <div id="genieAcsRecentList">${genieAcsRecentPendingMarkup(recentPending)}</div>
      </section>

      <div class="toolbar">
        <div class="filters">
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari SN, tag, SSID, PPPoE (min. 3 karakter)" autocomplete="off">
          <select class="control" id="genieAcsStatusFilter">
            <option value="all" ${state.genieAcsStatus === 'all' ? 'selected' : ''}>Semua Status</option>
            <option value="online" ${state.genieAcsStatus === 'online' ? 'selected' : ''}>Online</option>
            <option value="offline" ${state.genieAcsStatus === 'offline' ? 'selected' : ''}>Offline</option>
          </select>
          <select class="control" id="genieAcsNasFilter" title="Filter NAS">
            <option value="all" ${state.genieAcsNas === 'all' ? 'selected' : ''}>Semua NAS</option>
            ${nasOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${state.genieAcsNas === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
          </select>
          <select class="control" id="genieAcsRedamanFilter" title="Filter kualitas redaman">
            <option value="all" ${state.genieAcsRedaman === 'all' ? 'selected' : ''}>${genieAcsRedamanLabel('all')}</option>
            <option value="good" ${state.genieAcsRedaman === 'good' ? 'selected' : ''}>${genieAcsRedamanLabel('good')}</option>
            <option value="normal" ${state.genieAcsRedaman === 'normal' ? 'selected' : ''}>${genieAcsRedamanLabel('normal')}</option>
            <option value="high" ${state.genieAcsRedaman === 'high' ? 'selected' : ''}>${genieAcsRedamanLabel('high')}</option>
          </select>
        </div>
        <div class="row-actions">
          ${can('settings:write') ? '<button class="button" id="openGenieAcsSettings" type="button">Setting</button>' : ''}
          <button class="ghost-button compact" id="refreshGenieAcs" type="button">Refresh Data</button>
        </div>
      </div>

      <section class="section">
        <div class="section-head">
          <div>
            <h2>Device CPE/ONU</h2>
          </div>
        </div>
        <div class="batch-toolbar compact-batch" id="genieAcsBatchToolbar" hidden>
          <span id="genieAcsBatchInfo">0 dipilih</span>
          ${writeAllowed ? `
            <button class="button compact" id="genieAcsBatchReboot" type="button">Reboot</button>
            <button class="danger-button compact" id="genieAcsBatchDelete" type="button">Hapus</button>
          ` : ''}
        </div>
        <div class="table-wrap genieacs-table-wrap">
          <table class="genieacs-table">
            <colgroup>
              <col class="genie-col-select">
              <col class="genie-col-no">
              <col class="genie-col-status">
              <col class="genie-col-pppoe">
              <col class="genie-col-ip">
              <col class="genie-col-nas">
              <col class="genie-col-type">
              <col class="genie-col-sn">
              <col class="genie-col-redaman">
              <col class="genie-col-temp">
              <col class="genie-col-active">
              <col class="genie-col-last-active">
              <col class="genie-col-action">
            </colgroup>
            <thead>
              <tr>
                <th class="select-cell"><input type="checkbox" id="genieAcsSelectAll" aria-label="Pilih semua device" ${writeAllowed ? '' : 'disabled'}></th>
                <th>No</th>
                <th>Status</th>
                <th>PPPoE</th>
                <th>IP Address</th>
                <th>NAS</th>
                <th>Type Modem</th>
                <th>SN</th>
                <th>Redaman</th>
                <th>Suhu</th>
                <th>Total Active</th>
                <th>Terakhir Aktif</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map((row, index) => {
                const lastActive = dateTimeText(row.lastInform);
                return `
                <tr>
                  <td class="select-cell"><input type="checkbox" data-genieacs-select="${index}" aria-label="Pilih device ${escapeHtml(row.serialNumber || row.id || '')}" ${writeAllowed ? '' : 'disabled'}></td>
                  <td>${displayNumber(startNo + index)}</td>
                  <td>${genieStatusBadge(row)}</td>
                  <td class="genieacs-primary-cell" title="${escapeHtml(row.username || '-')}">
                    <div class="genieacs-pppoe-cell">
                      <strong>${escapeHtml(row.username || '-')}</strong>
                      ${writeAllowed ? `
                        <button class="cell-icon-button" type="button" data-genie-wan="${escapeHtml(row.id)}" title="Konfigurasi WAN" aria-label="Konfigurasi WAN ${escapeHtml(row.username || row.serialNumber || '')}">
                          <span class="wan-config-icon" aria-hidden="true"></span>
                        </button>
                      ` : ''}
                    </div>
                  </td>
                  <td class="genieacs-nowrap" title="${escapeHtml(row.ipAddress || row.framedIpAddress || '-')}">${escapeHtml(row.ipAddress || row.framedIpAddress || '-')}</td>
                  <td class="genieacs-truncate" title="${escapeHtml(row.nasName || row.nasIpAddress || '-')}">${nasActiveBadge(row.nasName || row.nasIpAddress || '-')}</td>
                  <td class="genieacs-truncate" title="${escapeHtml(row.productClass || '-')}">${escapeHtml(row.productClass || '-')}</td>
                  <td class="genieacs-sn-cell" title="${escapeHtml(row.serialNumber || '-')}"><code>${escapeHtml(row.serialNumber || '-')}</code></td>
                  <td class="genieacs-nowrap"><strong>${escapeHtml(row.rxPowerText || '-')}</strong></td>
                  <td class="genieacs-nowrap">${escapeHtml(row.temperatureText || '-')}</td>
                  <td class="genieacs-number-cell">
                    <button class="genieacs-client-button" type="button" data-genie-clients="${index}" title="Lihat client terkoneksi">
                      ${displayNumber(row.wifiClientsTotal || row.clientsTotal || 0)}
                    </button>
                  </td>
                  <td class="genieacs-nowrap" title="${escapeHtml(lastActive)}">${escapeHtml(lastActive)}</td>
                  <td>
                    ${writeAllowed ? `<div class="row-actions genieacs-actions">
                      <button class="ghost-button compact" type="button" data-genie-wifi="${escapeHtml(row.id)}">WiFi</button>
                      <button class="danger-button compact" type="button" data-genie-reboot="${escapeHtml(row.id)}">Reboot</button>
                    </div>` : '-'}
                  </td>
                </tr>
              `; }).join('') : '<tr><td colspan="13" class="empty">Belum ada device sesuai filter.</td></tr>'}
            </tbody>
          </table>
        </div>
        ${genieAcsPaginationControls(payload.pagination || {})}
      </section>
    </div>
  `;

  document.getElementById('refreshGenieAcs')?.addEventListener('click', () => renderGenieAcs({ refresh: true }));
  document.getElementById('refreshGenieAcsRecent')?.addEventListener('click', () => {
    refreshGenieAcsRecentPending({ refresh: true, notify: true });
  });
  document.getElementById('genieAcsRecentList')?.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-genie-recent-page]');
    if (pageButton && !pageButton.disabled) {
      genieAcsRecentPage = Math.max(1, Number(pageButton.dataset.genieRecentPage || 1));
      const list = document.getElementById('genieAcsRecentList');
      if (list) list.innerHTML = genieAcsRecentPendingMarkup(genieAcsRecentPayload);
      return;
    }
    const target = event.target.closest('[data-genie-recent-device]');
    if (!target) return;
    state.search = String(target.dataset.genieRecentDevice || '').trim();
    state.genieAcsPage = 1;
    renderGenieAcs({ refresh: true });
  });
  document.getElementById('openGenieAcsSettings')?.addEventListener('click', () => {
    openGenieAcsSettingsModal().catch((error) => setToast(error.message));
  });
  bindSearch((renderOptions = {}) => {
    state.genieAcsPage = 1;
    return renderGenieAcs(renderOptions);
  }, {
    minLength: 3,
    onTooShort: () => setToast('Ketik minimal 3 karakter untuk pencarian GenieACS')
  });
  document.getElementById('genieAcsStatusFilter')?.addEventListener('change', (event) => {
    state.genieAcsStatus = event.target.value || 'all';
    state.genieAcsPage = 1;
    renderGenieAcs();
  });
  document.getElementById('genieAcsNasFilter')?.addEventListener('change', (event) => {
    state.genieAcsNas = event.target.value || 'all';
    state.genieAcsPage = 1;
    renderGenieAcs();
  });
  document.getElementById('genieAcsRedamanFilter')?.addEventListener('change', (event) => {
    state.genieAcsRedaman = event.target.value || 'all';
    state.genieAcsPage = 1;
    renderGenieAcs();
  });
  app.querySelectorAll('[data-genieacs-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.genieAcsPage = Math.max(1, Number(button.dataset.genieacsPage || 1));
      renderGenieAcs();
    });
  });
  bindPagerLimit('genieacs', (limit) => {
    state.genieAcsLimit = limit;
  }, (page) => {
    state.genieAcsPage = page;
  }, renderGenieAcs, 10);
  const selectedGenieRows = () => [...app.querySelectorAll('[data-genieacs-select]:checked')]
    .map((checkbox) => rows[Number(checkbox.dataset.genieacsSelect || -1)])
    .filter(Boolean);
  const updateGenieSelection = () => {
    const selected = selectedGenieRows();
    const checkboxes = [...app.querySelectorAll('[data-genieacs-select]')];
    const selectAll = document.getElementById('genieAcsSelectAll');
    const toolbar = document.getElementById('genieAcsBatchToolbar');
    const info = document.getElementById('genieAcsBatchInfo');
    if (selectAll) {
      selectAll.checked = checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox.checked);
      selectAll.indeterminate = selected.length > 0 && !selectAll.checked;
    }
    if (toolbar) toolbar.hidden = selected.length === 0;
    if (info) info.textContent = `${displayNumber(selected.length)} dipilih`;
  };
  document.getElementById('genieAcsSelectAll')?.addEventListener('change', (event) => {
    app.querySelectorAll('[data-genieacs-select]').forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
    updateGenieSelection();
  });
  app.querySelectorAll('[data-genieacs-select]').forEach((checkbox) => {
    checkbox.addEventListener('change', updateGenieSelection);
  });
  const runGenieBatch = async (action) => {
    const selected = selectedGenieRows();
    if (!selected.length) return;
    const ids = selected.map((row) => row.id).filter(Boolean);
    const label = action === 'delete' ? 'hapus dari GenieACS' : 'reboot';
    const warning = action === 'delete'
      ? `Hapus ${displayNumber(ids.length)} device dari GenieACS UI/NBI? Data device real di GenieACS akan terhapus.`
      : `Reboot ${displayNumber(ids.length)} device GenieACS terpilih?`;
    if (!window.confirm(warning)) return;
    const button = document.getElementById(action === 'delete' ? 'genieAcsBatchDelete' : 'genieAcsBatchReboot');
    try {
      if (button) button.disabled = true;
      const result = await api('/api/genieacs/devices/batch', {
        method: 'POST',
        body: JSON.stringify({ action, ids })
      });
      const failed = Number(result.failedCount || 0);
      setToast(failed
        ? `${displayNumber(result.successCount || 0)} berhasil ${label}, ${displayNumber(failed)} gagal`
        : `${displayNumber(result.successCount || ids.length)} device berhasil ${label}`);
      renderGenieAcs({ refresh: true });
    } catch (error) {
      setToast(error.message || `Batch ${label} gagal`);
    } finally {
      if (button) button.disabled = false;
    }
  };
  document.getElementById('genieAcsBatchReboot')?.addEventListener('click', () => {
    runGenieBatch('reboot');
  });
  document.getElementById('genieAcsBatchDelete')?.addEventListener('click', () => {
    runGenieBatch('delete');
  });
  app.querySelectorAll('[data-genie-reboot]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = rows.find((item) => item.id === button.dataset.genieReboot) || {};
      if (!window.confirm(`Reboot perangkat ${genieDeviceLabel(row)}?`)) return;
      await api(`/api/genieacs/devices/${encodeURIComponent(button.dataset.genieReboot)}/reboot`, { method: 'POST', body: '{}' });
      setToast('Perintah reboot dikirim');
    });
  });
  app.querySelectorAll('[data-genie-wifi]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = rows.find((item) => item.id === button.dataset.genieWifi);
      if (!row || button.disabled) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      setToast('Memuat konfigurasi WiFi...');
      try {
        await openGenieWifiModal(row);
      } catch (error) {
        setToast(error.message);
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      }
    });
  });
  app.querySelectorAll('[data-genie-clients]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = rows[Number(button.dataset.genieClients || -1)];
      if (!row || button.disabled) return;
      button.disabled = true;
      try {
        await openGenieClientsModal(row);
      } catch (error) {
        setToast(error.message || 'Detail client belum dapat dibaca');
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
  });
  app.querySelectorAll('[data-genie-wan]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = rows.find((item) => item.id === button.dataset.genieWan);
      if (!row || button.disabled) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      setToast('Memuat konfigurasi WAN...');
      try {
        await openGenieWanModal(row);
      } catch (error) {
        setToast(error.message);
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      }
    });
  });
  genieAcsRecentSignature = genieAcsRecentPendingSignature(recentPending);
  genieAcsRecentIds = new Set((recentPending.devices || []).map((device) => String(device.id || '')).filter(Boolean));
  scheduleGenieAcsRecentDetection();
  updateGenieSelection();
}

function scheduleMonitoringCustomerRefresh() {
  clearRealtimeTimers();
  if (state.view !== 'monitoringCustomers') return;
  const refreshDelay = state.monitoringCustomersPayload?.refreshing === true ? 3000 : 20000;
  monitoringCustomersTimer = window.setTimeout(() => {
    if (state.view === 'monitoringCustomers') {
      if (['searchInput', 'customerSiteFilter'].includes(document.activeElement?.id)) {
        scheduleMonitoringCustomerRefresh();
        return;
      }
      renderMonitoringCustomers({ silent: true });
    }
  }, refreshDelay);
}

function monitoringCustomerRows(sites = [], type = 'pppoe') {
  const key = type === 'hotspot' ? 'hotspotUsers' : 'pppoeUsers';
  return sites.flatMap((site) => {
    const users = Array.isArray(site[key]) ? site[key] : [];
    return users
      .filter((user) => monitoringCustomerServiceType(user, type) === type)
      .map((user, index) => ({
        id: user.id || `${site.id || site.name || 'site'}:${index}`,
        siteId: user.siteId || site.id || site.name || 'site',
        type: monitoringCustomerServiceType(user, type),
        username: user.username || user.interfaceName || '-',
        interfaceName: user.interfaceName || user.username || '-',
        customerName: user.customerName || '',
        profile: user.profile || '',
        ipAddress: user.framedIpAddress || user.ipAddress || user.staticIp || '',
        framedIpAddress: user.framedIpAddress || '',
        staticIp: user.staticIp || '',
        macAddress: user.macAddress || user.callingStationId || '',
        nasIpAddress: user.nasIpAddress || user.host || site.host || '',
        siteName: user.siteName || site.name || '-',
        siteLocation: user.location || site.location || site.host || '',
        host: user.host || site.host || '',
        uptime: user.uptime || '',
        totalUsageText: user.totalUsageText || '',
        status: user.status || 'online'
      }));
  }).sort((a, b) => `${a.siteName} ${a.username}`.localeCompare(`${b.siteName} ${b.username}`));
}

function monitoringCustomerServiceType(user = {}, fallback = '') {
  const value = String(user.type || user.serviceType || user.service || user.accessType || fallback || '').trim().toLowerCase();
  if (value === 'hotspot') return 'hotspot';
  if (['pppoe', 'ppp', 'ppp-dhcp'].includes(value)) return 'pppoe';
  return value;
}

function monitoringCustomerDisplayName(user = {}) {
  return user.customerName || user.owner || user.name || user.username || user.interfaceName || '-';
}

function monitoringCustomerAddress(user = {}) {
  return user.framedIpAddress || user.ipAddress || user.staticIp || '-';
}

function monitoringCustomerTable(users = [], type = 'pppoe', startNo = 1) {
  const pppoe = type === 'pppoe';
  return `
    <div class="table-wrap monitoring-customer-table-wrap">
      <table class="monitoring-customer-table">
        <thead>
          <tr>
            <th class="monitoring-col-no">No</th>
            <th>${pppoe ? 'Nama' : 'User'}</th>
            <th>NAS</th>
            ${pppoe ? '<th>MAC</th>' : ''}
            <th>Address</th>
            <th>Uptime</th>
          </tr>
        </thead>
        <tbody>
          ${users.length ? users.map((user, index) => `
            <tr>
              <td class="nowrap">${displayNumber(startNo + index)}</td>
              <td>
                <strong>${escapeHtml(pppoe ? monitoringCustomerDisplayName(user) : user.username || '-')}</strong>
                ${pppoe && user.customerName && user.username && user.customerName !== user.username ? `<div class="muted">${escapeHtml(user.username)}</div>` : ''}
              </td>
              <td>${nasActiveBadge(user.siteName || user.nasIpAddress || '-')}</td>
              ${pppoe ? `<td>${escapeHtml(user.macAddress || '-')}</td>` : ''}
              <td>${escapeHtml(monitoringCustomerAddress(user))}</td>
              <td class="nowrap">${escapeHtml(user.uptime || '-')}</td>
            </tr>
          `).join('') : `
            <tr>
              <td colspan="${pppoe ? 6 : 5}" class="empty-cell">Tidak ada ${pppoe ? 'PPPoE' : 'Hotspot'} aktif sesuai filter.</td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

function filteredMonitoringCustomers(rows = []) {
  const query = state.search.trim().toLowerCase();
  const site = state.monitoringCustomerSite || 'all';
  return rows.filter((row) => {
    const siteMatches = site === 'all' || String(row.siteId) === String(site);
    if (!siteMatches) return false;
    if (!query) return true;
    return [
      row.username,
      row.interfaceName,
      row.customerName,
      row.profile,
      row.ipAddress,
      row.macAddress,
      row.nasIpAddress,
      row.siteName,
      row.siteLocation,
      row.host
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });
}

async function renderMonitoringCustomers(options = {}) {
  clearRealtimeTimers();
  if (shouldShowPageLoading(options)) {
    app.innerHTML = '<div class="empty">Memuat pelanggan online...</div>';
  }
  const customerType = state.monitoringCustomerType === 'hotspot' ? 'hotspot' : 'pppoe';
  const customerLimit = pagerLimitValue(state.monitoringCustomerLimit || CUSTOMER_PAGE_SIZE, CUSTOMER_PAGE_SIZE);
  const params = queryString({
    page: state.monitoringCustomerPage,
    limit: customerLimit,
    type: customerType,
    site: state.monitoringCustomerSite,
    search: state.search,
    refresh: options.refresh ? '1' : ''
  });
  const payload = await api(`/api/monitoring/customers?${params}`);
  state.monitoringCustomersPayload = payload;
  const summary = payload.summary || {};
  const sites = Array.isArray(payload.sites) ? payload.sites : [];
  const selectedSite = sites.some((site) => String(site.id) === String(state.monitoringCustomerSite))
    ? state.monitoringCustomerSite
    : 'all';
  if (state.monitoringCustomerSite !== selectedSite) {
    state.monitoringCustomerSite = selectedSite;
  }
  if (state.monitoringCustomerType !== customerType) {
    state.monitoringCustomerType = customerType;
  }
  const customerTypeLabel = customerType === 'hotspot' ? 'Hotspot' : 'PPPoE';
  const pageUsers = Array.isArray(payload.rows) ? payload.rows : monitoringCustomerRows(sites, customerType);
  const pagination = payload.pagination || { page: 1, limit: customerLimit, total: pageUsers.length, totalPages: 1, hasPrev: false, hasNext: false };
  state.monitoringCustomerPage = Number(pagination.page || 1);
  state.monitoringCustomerLimit = pagerLimitValue(pagination.limit || customerLimit, CUSTOMER_PAGE_SIZE);
  const offset = (state.monitoringCustomerPage - 1) * Number(pagination.limit || CUSTOMER_PAGE_SIZE);

  app.innerHTML = `
    <div class="stack">
      ${payload.ok ? '' : `
        <section class="notice error">
          <strong>Data pelanggan online belum tersedia</strong>
          <span>${escapeHtml(payload.error || 'SNMP MikroTik belum mengembalikan data pelanggan.')}</span>
        </section>
      `}

      <section class="metrics">
        ${metric('Pelanggan PPPoE', displayNumber(summary.online), 'Online semua NAS', 'positive')}
        ${metric('Hotspot aktif', displayNumber(summary.hotspot), 'Online semua NAS')}
        ${metric('Router online', `${displayNumber(summary.upCount)}/${displayNumber(summary.siteCount)}`, 'Target monitoring')}
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Pelanggan per NAS</h2>
          <span class="muted">IP pelanggan diprioritaskan dari session FreeRADIUS, data SNMP tetap dipakai sebagai pendukung site/interface.</span>
        </div>
        <div class="site-grid">
          ${sites.length ? sites.map((site) => `
            <article class="site-card">
              <div class="site-card-head">
                <div>
                  <strong>${escapeHtml(site.name)}</strong>
                  <span>${escapeHtml(site.location || site.host || '-')}</span>
                </div>
                <span class="badge ${site.status === 'up' ? 'active' : 'inactive'}">${escapeHtml(site.status === 'up' ? 'Online' : 'Down')}</span>
              </div>
              <div class="site-card-stats">
                <span><strong>${displayNumber(site.online)}</strong> PPPoE online</span>
                <span><strong>${displayNumber(site.hotspot)}</strong> Hotspot aktif</span>
                <span><strong>${displayNumber(site.interfaceCount)}</strong> Interface terbaca</span>
              </div>
              <div class="muted">${escapeHtml(site.error || `SNMP ${site.latencyMs || 0} ms`)}</div>
            </article>
          `).join('') : '<div class="empty">Belum ada target MikroTik di Monitoring Site.</div>'}
        </div>
      </section>

      <div class="toolbar">
        <div class="filters">
          <select class="control" id="customerSiteFilter" aria-label="Filter NAS pelanggan online">
            <option value="all" ${state.monitoringCustomerSite === 'all' ? 'selected' : ''}>Semua NAS</option>
            ${sites.map((site) => `<option value="${escapeHtml(site.id)}" ${String(state.monitoringCustomerSite) === String(site.id) ? 'selected' : ''}>${escapeHtml(site.name)}</option>`).join('')}
          </select>
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari ${escapeHtml(customerTypeLabel)}, address, MAC" autocomplete="off">
        </div>
        <div class="row-actions">
          <button class="ghost-button" id="refreshCustomers" type="button">Refresh Live</button>
        </div>
      </div>

      <section class="section">
        <div class="section-head">
          <div class="tab-switcher" role="tablist" aria-label="Tipe pelanggan aktif">
            <button class="tab-button ${customerType === 'pppoe' ? 'is-active' : ''}" type="button" data-customer-type="pppoe" role="tab" aria-selected="${customerType === 'pppoe'}">
              PPPoE Aktif <span>${displayNumber(summary.pppoe)}</span>
            </button>
            <button class="tab-button ${customerType === 'hotspot' ? 'is-active' : ''}" type="button" data-customer-type="hotspot" role="tab" aria-selected="${customerType === 'hotspot'}">
              Hotspot Aktif <span>${displayNumber(summary.hotspot)}</span>
            </button>
          </div>
          <span class="muted">Update ${escapeHtml(summary.generatedAt ? dateTimeText(summary.generatedAt) : '-')} - auto 20 detik</span>
        </div>
        ${monitoringCustomerTable(pageUsers, customerType, offset + 1)}
        ${customerPaginationControls(pagination, customerTypeLabel)}
      </section>
    </div>
  `;

  document.getElementById('customerSiteFilter')?.addEventListener('change', (event) => {
    state.monitoringCustomerSite = event.target.value || 'all';
    state.monitoringCustomerPage = 1;
    renderMonitoringCustomers();
  });
  app.querySelectorAll('[data-customer-type]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextType = button.dataset.customerType === 'hotspot' ? 'hotspot' : 'pppoe';
      if (state.monitoringCustomerType === nextType) return;
      state.monitoringCustomerType = nextType;
      state.monitoringCustomerPage = 1;
      renderMonitoringCustomers();
    });
  });
  document.getElementById('refreshCustomers')?.addEventListener('click', () => renderMonitoringCustomers({ refresh: true }));
  bindSearch((renderOptions = {}) => {
    state.monitoringCustomerPage = 1;
    return renderMonitoringCustomers(renderOptions);
  });
  app.querySelectorAll('[data-customer-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.monitoringCustomerPage = Math.max(1, Number(button.dataset.customerPage || 1));
      renderMonitoringCustomers();
    });
  });
  bindPagerLimit('customer', (limit) => {
    state.monitoringCustomerLimit = limit;
  }, (page) => {
    state.monitoringCustomerPage = page;
  }, renderMonitoringCustomers, CUSTOMER_PAGE_SIZE);
  scheduleMonitoringCustomerRefresh();
}

function billingStatusLabel(status) {
  const labels = {
    all: 'Semua',
    unpaid: 'Belum bayar',
    overdue: 'Lewat tempo',
    paid: 'Lunas',
    pending: 'Belum bayar',
    member: 'Data member'
  };
  return labels[String(status || '').toLowerCase()] || status || '-';
}

function billingStatusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return 'paid';
  if (normalized === 'overdue') return 'overdue';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  return 'pending';
}

function customerServiceLabel(invoice = {}) {
  const status = String(invoice.serviceStatus || invoice.customerStatus || '').toLowerCase();
  if (invoice.isIsolated || ['isolir', 'isolated', 'suspend', 'suspended'].includes(status)) return 'Isolir';
  if (status === 'active') return 'Aktif';
  if (status === 'terminate' || status === 'terminated') return 'Terminate';
  if (status === 'offline') return 'Offline';
  return '-';
}

function customerServiceBadge(invoice = {}) {
  const label = customerServiceLabel(invoice);
  if (label === 'Isolir') return 'pending';
  if (label === 'Aktif') return 'active';
  if (label === 'Terminate' || label === 'Offline') return 'inactive';
  return '';
}

function billingLastActiveText(invoice = {}) {
  return invoice.lastActiveAt ? dateTimeText(invoice.lastActiveAt) : '-';
}

function billingReminderId(invoice = {}) {
  return String(invoice.reminderId || invoice.invoiceId || invoice.id || '').trim();
}

function billingInvoiceNo(invoice = {}) {
  return String(invoice.invoiceNo || invoice.externalId || '').trim();
}

function billingReminderAllowed(invoice = {}) {
  const status = String(invoice.status || '').toLowerCase();
  return Boolean(can('billing-monitor:read') && billingReminderId(invoice) && ['unpaid', 'pending', 'overdue'].includes(status) && Number(invoice.amount || 0) > 0);
}

function billingPayAllowed(invoice = {}) {
  const status = String(invoice.status || '').toLowerCase();
  return Boolean(can('invoices:manage') && billingInvoiceNo(invoice) && ['unpaid', 'pending', 'overdue'].includes(status) && Number(invoice.amount || 0) > 0);
}

function billingQrPaymentAllowed(invoice = {}, standaloneBilling = true, paymentGatewayEnabled = true) {
  return Boolean(standaloneBilling && paymentGatewayEnabled && billingPayAllowed(invoice));
}

function billingCancelAllowed(invoice = {}) {
  const status = String(invoice.status || '').toLowerCase();
  const role = String(state.auth?.role || '').toLowerCase();
  return Boolean(can('invoices:manage')
    && ['admin', 'owner', 'finance'].includes(role)
    && billingInvoiceNo(invoice)
    && ['unpaid', 'pending', 'overdue'].includes(status));
}

function billingDiscountAllowed(invoice = {}) {
  return billingCancelAllowed(invoice) && Number(invoice.amount || 0) > 0;
}

function billingOnlinePayment(invoice = {}) {
  if (invoice.rollbackLocked === true) return true;
  const category = String(invoice.paymentCategory || invoice.methodGroup || '').trim().toLowerCase();
  if (['online', 'digital', 'gateway', 'payment-gateway'].includes(category)) return true;
  const method = String(invoice.paymentMethod || invoice.method || '').trim().toLowerCase();
  return /online|qris|ovo|dana|linkaja|shopeepay|gopay|alfamart|alfamidi|indomaret|tripay|xendit|midtrans|duitku|doku|ipaymu|virtual\s*account|\b(?:bri|bni|bca|mandiri|permata|cimb|danamon|maybank|bsi)\s*va\b/i.test(method);
}

function billingRollbackAllowed(invoice = {}) {
  const status = String(invoice.status || '').toLowerCase();
  return Boolean(can('invoices:manage')
    && billingInvoiceNo(invoice)
    && status === 'paid'
    && !billingOnlinePayment(invoice));
}

function billingReceiptAllowed(invoice = {}) {
  const status = String(invoice.status || '').toLowerCase();
  return Boolean(billingInvoiceNo(invoice) && status === 'paid');
}

function billingActionButtons(invoice = {}, index = 0, standaloneBilling = true, paymentGatewayEnabled = true) {
  const invoiceLabel = billingInvoiceNo(invoice) || '-';
  const buttons = [];
  if (billingReminderAllowed(invoice)) {
    buttons.push(`
      <button class="billing-action-button whatsapp" type="button" data-billing-reminder="${index}" title="Kirim reminder WA" aria-label="Kirim reminder WhatsApp invoice ${escapeHtml(invoiceLabel)}">
        <span class="billing-action-icon whatsapp" aria-hidden="true"></span>
        <span>Kirim</span>
      </button>
    `);
  }
  if (billingPayAllowed(invoice)) {
    buttons.push(`
      <button class="billing-action-button pay" type="button" data-billing-pay="${index}" title="Bayar invoice" aria-label="Bayar invoice ${escapeHtml(invoiceLabel)}">
        <span class="billing-action-icon pay" aria-hidden="true"></span>
        <span>Bayar</span>
      </button>
    `);
  }
  if (billingQrPaymentAllowed(invoice, standaloneBilling, paymentGatewayEnabled)) {
    buttons.push(`
      <button class="billing-action-button qris" type="button" data-billing-qr-pay="${index}" title="Bayar QRIS" aria-label="Bayar QRIS invoice ${escapeHtml(invoiceLabel)}">
        <span class="billing-action-icon qris" aria-hidden="true"></span>
        <span>QR</span>
      </button>
    `);
  } else if (standaloneBilling && billingPayAllowed(invoice) && !paymentGatewayEnabled) {
    buttons.push(`
      <button class="billing-action-button qris is-locked" type="button" disabled title="Payment Gateway belum aktif" aria-label="Bayar QRIS invoice ${escapeHtml(invoiceLabel)} terkunci karena Payment Gateway belum aktif">
        <span class="billing-action-icon qris" aria-hidden="true"></span>
        <span>QR</span>
      </button>
    `);
  } else if (standaloneBilling && can('invoices:manage') && String(invoice.status || '').toLowerCase() === 'paid' && billingOnlinePayment(invoice)) {
    buttons.push(`
      <button class="billing-action-button qris is-locked" type="button" disabled title="Pembayaran online lunas" aria-label="Pembayaran online invoice ${escapeHtml(invoiceLabel)} lunas">
        <span class="billing-action-icon qris" aria-hidden="true"></span>
        <span>Lunas</span>
      </button>
    `);
  }
  if (billingDiscountAllowed(invoice)) {
    buttons.push(`
      <button class="billing-action-button discount" type="button" data-billing-discount="${index}" title="Edit diskon invoice" aria-label="Edit diskon invoice ${escapeHtml(invoiceLabel)}">
        <span class="billing-action-icon discount" aria-hidden="true"></span>
        <span>Diskon</span>
      </button>
    `);
  }
  if (invoice.isIsolated && canAny(['radius:write', 'radius:ppp-users:write'])) {
    buttons.push(`
      <button class="billing-action-button pay" type="button" data-billing-temporary-activation="${index}" title="Aktifkan sementara tanpa menghentikan tagihan" aria-label="Aktifkan sementara pelanggan invoice ${escapeHtml(invoiceLabel)}">
        <span>Aktifkan sementara</span>
      </button>
    `);
  }
  if (billingRollbackAllowed(invoice)) {
    buttons.push(`
      <button class="billing-action-button rollback" type="button" data-billing-rollback="${index}" title="Rollback pembayaran" aria-label="Rollback invoice ${escapeHtml(invoiceLabel)}">
        <span class="billing-action-icon rollback" aria-hidden="true"></span>
        <span>Rollback</span>
      </button>
    `);
  } else if (can('invoices:manage') && String(invoice.status || '').toLowerCase() === 'paid' && billingOnlinePayment(invoice)) {
    buttons.push(`
      <button class="billing-action-button rollback is-locked" type="button" disabled title="Pembayaran online terkunci" aria-label="Rollback invoice ${escapeHtml(invoiceLabel)} terkunci">
        <span class="billing-action-icon rollback" aria-hidden="true"></span>
        <span>Rollback</span>
      </button>
    `);
  }
  return buttons.length ? `<div class="billing-action-stack">${buttons.join('')}</div>` : '<span class="muted">-</span>';
}

function manualInvoicePeriodOptions(selected = '1') {
  return Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1);
    return `<option value="${value}" ${String(selected) === value ? 'selected' : ''}>${value} Bulan</option>`;
  }).join('');
}

function manualMemberTitle(member = {}) {
  return member.fullName || member.userId || member.id || '-';
}

function manualMemberSubtitle(member = {}) {
  return [member.userId, member.whatsapp, member.address].filter(Boolean).join(' / ') || '-';
}

function manualInvoicePreviewRows(preview = {}) {
  const rows = [
    ['Nama', preview.fullName],
    ['Periode', readablePeriodText(preview.coveredPeriodText || preview.period)],
    ['Jatuh tempo', preview.dueDateDisplay || dateText(preview.dueDate)],
    ['Subscribe', preview.subscribe],
    ['Item', preview.item],
    ['Add Ons', preview.addOnsText || memberAddonsDetailText(preview.addOns || preview.addons)],
    ['Amount', preview.amount],
    ['PPN', preview.ppn || '-'],
    ['Diskon', preview.discount || '-'],
    ['Total', preview.total || preview.amount || '-']
  ];
  return rows.map(([label, value]) => `
    <div class="manual-invoice-preview-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || '-')}</strong>
    </div>
  `).join('');
}

function billingActionCustomerName(invoice = {}) {
  return invoice.customerName || invoice.fullName || invoice.name || invoice.accountId || invoice.username || '-';
}

function billingActionCustomerMeta(invoice = {}) {
  return [
    invoice.username || invoice.accountId || '',
    invoice.phone || '',
    invoice.siteName || ''
  ].filter(Boolean).join(' / ') || '-';
}

function billingActionPreviewRows(invoice = {}, extraRows = []) {
  const rows = [
    ['Invoice', billingInvoiceNo(invoice)],
    ['Pelanggan', billingActionCustomerName(invoice)],
    ['Nominal', rupiah(invoice.amount || 0)],
    ['Jatuh tempo', dateText(invoice.dueDate || invoice.invoiceDate)],
    ['Status', billingStatusLabel(invoice.status)],
    ['Site', invoice.siteName || '-'],
    ...extraRows
  ];
  return rows.map(([label, value]) => `
    <div class="manual-invoice-preview-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || '-')}</strong>
    </div>
  `).join('');
}

function billingPaymentMethodChoices(selected = 'Tunai') {
  const methods = [
    { value: 'Tunai', title: 'Tunai', subtitle: 'Pembayaran cash/manual' },
    { value: 'Tunai - Loket', title: 'Loket', subtitle: 'Pembayaran diterima di rumah/loket' },
    { value: 'Transfer Manual', title: 'Transfer Manual', subtitle: 'Transfer manual yang dikonfirmasi user billing' }
  ];
  return `
    <div class="billing-method-options" role="radiogroup" aria-label="Metode bayar">
      ${methods.map((method) => `
        <label class="billing-method-option">
          <input type="radio" name="paymentMethod" value="${escapeHtml(method.value)}" ${method.value === selected ? 'checked' : ''}>
          <span>
            <strong>${escapeHtml(method.title)}</strong>
            <small>${escapeHtml(method.subtitle)}</small>
          </span>
        </label>
      `).join('')}
    </div>
  `;
}

function currencyInputValue(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const normalized = text
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Math.max(0, Math.round(Number.isFinite(number) ? number : 0));
}

function billingDiscountAuditMarkup(invoice = {}) {
  if (!invoice.discountUpdatedAt && !invoice.discountUpdatedBy && !invoice.discountNote) return '';
  const rows = [
    ['Terakhir diubah', invoice.discountUpdatedAt ? dateTimeText(invoice.discountUpdatedAt) : '-'],
    ['Diubah oleh', invoice.discountUpdatedBy || invoice.discountUpdatedByUsername || '-'],
    ['Catatan', invoice.discountNote || '-']
  ];
  return `
    <section class="invoice-audit-box">
      <strong>Audit diskon terakhir</strong>
      <div class="activity-audit-grid compact">
        ${rows.map(([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value || '-')}</strong>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function openBillingPayModal(invoice = {}) {
  const invoiceNo = billingInvoiceNo(invoice);
  if (!invoiceNo) {
    setToast('Nomor invoice tidak tersedia');
    return;
  }
  openModal('Bayar Invoice', `
    <div class="manual-invoice-wizard">
      <div class="manual-invoice-steps">
        <span class="active">1. Review Invoice</span>
        <span class="active">2. Pilih Metode</span>
      </div>
      <div class="manual-invoice-selected">
        <span>
          <strong>${escapeHtml(billingActionCustomerName(invoice))}</strong>
          <small>${escapeHtml(billingActionCustomerMeta(invoice))}</small>
        </span>
        <span class="badge ${billingStatusBadge(invoice.status)}">${escapeHtml(billingStatusLabel(invoice.status))}</span>
      </div>
      <div class="manual-invoice-preview">
        ${billingActionPreviewRows(invoice)}
      </div>
      <div class="billing-method-panel">
        <strong>Metode pembayaran</strong>
        ${billingPaymentMethodChoices('Tunai')}
      </div>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Batal</button>
        <button class="button" type="submit" data-billing-action-submit>Bayar Invoice</button>
      </div>
    </div>
  `, async (payload, form) => {
    const submit = form.querySelector('[data-billing-action-submit]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Memproses...';
    }
    try {
      const result = await api('/api/monitoring/billing-action', {
        method: 'POST',
        body: JSON.stringify({
          action: 'pay',
          invoiceNo,
          paymentMethod: payload.paymentMethod || 'Tunai',
          customerName: billingActionCustomerName(invoice)
        })
      });
      setToast(result.message || 'Invoice dibayar');
      await renderMonitoringBilling({ refresh: true });
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Bayar Invoice';
      }
    }
  });
}

function billingQrImageSrc(checkout = {}) {
  const qrUrl = safePublicUrl(checkout.qrUrl || checkout.qr_url || '');
  if (qrUrl) return qrUrl;
  const qrText = String(checkout.qrString || checkout.qr_string || checkout.checkoutUrl || checkout.paymentUrl || '').trim();
  return qrText ? `/api/tools/qr?size=360&text=${encodeURIComponent(qrText)}` : '';
}

function billingQrPackageLabel(invoice = {}) {
  const raw = String(invoice.packageName || invoice.package || invoice.profile || invoice.item || invoice.subscribe || '').trim();
  if (!raw) return '-';
  const normalized = raw
    .replace(/^paket\s+bulanan\s+internet\s*:\s*/i, '')
    .replace(/^internet\s*:\s*/i, '')
    .trim();
  const parts = normalized.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const packagePart = parts.find((part) => /^paket\b/i.test(part));
  return packagePart || parts.at(-1) || normalized || '-';
}

function renderBillingQrCheckout(payload = {}) {
  const invoice = payload.invoice || {};
  const checkout = payload.checkout || {};
  const qrSrc = billingQrImageSrc(checkout);
  const checkoutUrl = safePublicUrl(checkout.checkoutUrl || checkout.paymentUrl || '');
  const expiresAt = checkout.expiresAt || checkout.expiredAt || '';
  const customerName = billingActionCustomerName(invoice);
  const packageLabel = billingQrPackageLabel(invoice);
  const invoiceLabel = billingInvoiceNo(invoice) || invoice.reference || '-';
  const dueDateLabel = dateText(invoice.dueDate || invoice.invoiceDate) || '-';
  return `
    <div class="billing-qr-pay-box">
      <div class="billing-qr-pay-summary">
        <strong>${escapeHtml(`${customerName} - ${packageLabel}`)}</strong>
        <span>${escapeHtml(`${invoiceLabel} - ${dueDateLabel}`)}</span>
      </div>
      ${qrSrc ? `
        <img class="billing-qr-pay-image" src="${escapeHtml(qrSrc)}" alt="QRIS invoice ${escapeHtml(invoice.invoiceNo || invoice.reference || '')}">
      ` : `
        <div class="notice warning">
          <strong>QR belum tersedia</strong>
          <span>Payment Gateway belum mengembalikan QRIS. Gunakan tombol buka pembayaran.</span>
        </div>
      `}
      <div class="billing-qr-pay-total">
        <span>Total Bayar</span>
        <strong>${escapeHtml(invoice.gatewayAmountText || rupiah(invoice.gatewayAmount || invoice.amount || 0))}</strong>
      </div>
      <p class="billing-qr-pay-note">Scan QR ini dari HP pelanggan. Status lunas dicek otomatis, dan pelanggan isolir akan aktif kembali setelah callback pembayaran diterima.</p>
      <span class="billing-qr-pay-expiry">Berlaku sampai: ${escapeHtml(expiresAt ? dateTimeText(expiresAt) : '-')}</span>
      <div class="modal-actions">
        ${checkoutUrl ? `<a class="ghost-button" href="${escapeHtml(checkoutUrl)}" target="_blank" rel="noopener">Buka Link</a>` : ''}
        <button class="button" type="button" data-billing-qr-refresh>Status Pembayaran</button>
      </div>
    </div>
  `;
}

function openBillingQrPayModal(invoice = {}) {
  const invoiceNo = billingInvoiceNo(invoice);
  if (!invoiceNo) {
    setToast('Nomor invoice tidak tersedia');
    return;
  }
  let pollTimer = null;
  let closed = false;
  const cleanup = () => {
    closed = true;
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };
  const checkStatus = async (silent = false) => {
    try {
      const payload = await api(`/api/public/payment-gateway/invoices/${encodeURIComponent(invoiceNo)}`, { timeoutMs: 12000 });
      const latest = payload.invoice || {};
      if (String(latest.status || '').toLowerCase() === 'paid') {
        cleanup();
        setToast('Invoice sudah lunas');
        if (modal.open) modal.close();
        await renderMonitoringBilling({ refresh: true });
        return true;
      }
      if (!silent) setToast('Pembayaran belum masuk');
    } catch (error) {
      if (!silent) setToast(error.message || 'Status pembayaran gagal dicek');
    }
    return false;
  };
  openModal('Bayar QR Invoice', `
    <div class="manual-invoice-wizard billing-qr-pay-modal">
      <div id="billingQrPayContent" class="billing-qr-pay-loading">
        <div class="empty">Menyiapkan QRIS payment gateway...</div>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Tutup</button>
      </div>
    </div>
  `, async () => {});
  modal.addEventListener('close', cleanup, { once: true });

  (async () => {
    const content = modalBody.querySelector('#billingQrPayContent');
    try {
      const payload = await api('/api/monitoring/billing-qr-checkout', {
        method: 'POST',
        body: JSON.stringify({
          invoiceNo,
          customerName: billingActionCustomerName(invoice)
        }),
        timeoutMs: 20000
      });
      if (payload.paid) {
        cleanup();
        setToast(payload.message || 'Invoice sudah lunas');
        if (modal.open) modal.close();
        await renderMonitoringBilling({ refresh: true });
        return;
      }
      if (content) content.innerHTML = renderBillingQrCheckout(payload);
      modalBody.querySelector('[data-billing-qr-refresh]')?.addEventListener('click', () => checkStatus(false));
      pollTimer = window.setInterval(() => {
        if (!closed) checkStatus(true);
      }, 5000);
    } catch (error) {
      if (content) {
        content.innerHTML = `
          <section class="notice error">
            <strong>QR payment gagal disiapkan</strong>
            <span>${escapeHtml(error.message || 'Payment gateway belum mengembalikan QR')}</span>
          </section>
        `;
      }
    }
  })();
}

function openBillingDiscountModal(invoice = {}) {
  const invoiceNo = billingInvoiceNo(invoice);
  if (!invoiceNo) {
    setToast('Nomor invoice tidak tersedia');
    return;
  }
  const currentManualDiscount = Math.max(0, Number(invoice.manualDiscountAmount || invoice.invoiceDiscountAmount || 0));
  const baseDiscount = Math.max(0, Number(invoice.baseDiscountAmount || 0));
  const grossAmount = Math.max(0, Number(invoice.totalBeforeDiscount || 0))
    || Math.max(0, Number(invoice.amount || 0) + Number(invoice.discountAmount || 0));
  const maxManualDiscount = Math.max(0, grossAmount - baseDiscount - 1);
  const checkoutPending = String(invoice.paymentCheckout?.status || '').toLowerCase() === 'pending';
  openModal('Edit Diskon Invoice', `
    <div class="manual-invoice-wizard">
      <div class="manual-invoice-steps">
        <span class="active">1. Review Invoice</span>
        <span class="active">2. Atur Diskon</span>
      </div>
      <div class="manual-invoice-selected">
        <span>
          <strong>${escapeHtml(billingActionCustomerName(invoice))}</strong>
          <small>${escapeHtml(billingActionCustomerMeta(invoice))}</small>
        </span>
        <span class="badge ${billingStatusBadge(invoice.status)}">${escapeHtml(billingStatusLabel(invoice.status))}</span>
      </div>
      <div class="manual-invoice-preview">
        ${billingActionPreviewRows(invoice, [
          ['Subtotal sebelum diskon', rupiah(grossAmount)],
          ['Diskon member/awal', rupiah(baseDiscount)],
          ['Diskon invoice saat ini', rupiah(currentManualDiscount)]
        ])}
      </div>
      ${billingDiscountAuditMarkup(invoice)}
      ${checkoutPending ? `
        <section class="notice warning">
          <strong>Link payment gateway lama akan dibuat tidak berlaku.</strong>
          <span>Setelah diskon disimpan, pelanggan harus membuka ulang link invoice atau dikirim reminder baru.</span>
        </section>
      ` : ''}
      <div class="form-grid">
        <label class="field">
          <span>Diskon invoice bulan ini</span>
          <input name="manualDiscountAmount" type="number" min="0" max="${escapeHtml(maxManualDiscount)}" step="1" inputmode="numeric" value="${escapeHtml(currentManualDiscount)}">
          <small class="muted">Maksimal ${escapeHtml(rupiah(maxManualDiscount))}. Tidak mengubah diskon member bulan berikutnya.</small>
        </label>
        <label class="field">
          <span>Catatan diskon</span>
          <textarea name="discountNote" rows="3" placeholder="Opsional">${escapeHtml(invoice.discountNote || '')}</textarea>
        </label>
      </div>
      <div class="manual-invoice-preview">
        <div class="manual-invoice-preview-row">
          <span>Total setelah diskon</span>
          <strong id="billingDiscountPreview">${escapeHtml(rupiah(Math.max(0, grossAmount - baseDiscount - currentManualDiscount)))}</strong>
        </div>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Batal</button>
        <button class="button" type="submit" data-billing-action-submit>Simpan Diskon</button>
      </div>
    </div>
  `, async (payload, form) => {
    const submit = form.querySelector('[data-billing-action-submit]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Menyimpan...';
    }
    try {
      const result = await api('/api/monitoring/billing-action', {
        method: 'POST',
        body: JSON.stringify({
          action: 'discount',
          invoiceNo,
          manualDiscountAmount: currencyInputValue(payload.manualDiscountAmount),
          discountNote: payload.discountNote || '',
          customerName: billingActionCustomerName(invoice)
        })
      });
      setToast(result.checkoutInvalidated
        ? 'Diskon disimpan, link payment lama dibatalkan'
        : (result.message || 'Diskon invoice disimpan'));
      await renderMonitoringBilling({ refresh: true });
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Simpan Diskon';
      }
    }
  });
  const input = modalBody.querySelector('input[name="manualDiscountAmount"]');
  const preview = modalBody.querySelector('#billingDiscountPreview');
  input?.addEventListener('input', () => {
    const manualDiscount = Math.min(maxManualDiscount, currencyInputValue(input.value));
    if (preview) preview.textContent = rupiah(Math.max(0, grossAmount - baseDiscount - manualDiscount));
  });
}

function openBillingRollbackModal(invoice = {}) {
  const invoiceNo = billingInvoiceNo(invoice);
  if (!invoiceNo) {
    setToast('Nomor invoice tidak tersedia');
    return;
  }
  openModal('Rollback Invoice', `
    <div class="manual-invoice-wizard">
      <div class="manual-invoice-steps">
        <span class="active">1. Review Invoice</span>
        <span class="active">2. Konfirmasi Rollback</span>
      </div>
      <div class="manual-invoice-selected">
        <span>
          <strong>${escapeHtml(billingActionCustomerName(invoice))}</strong>
          <small>${escapeHtml(billingActionCustomerMeta(invoice))}</small>
        </span>
        <span class="badge ${billingStatusBadge(invoice.status)}">${escapeHtml(billingStatusLabel(invoice.status))}</span>
      </div>
      <section class="notice error">
        <strong>Rollback akan membatalkan status pembayaran invoice ini.</strong>
        <span>Pastikan invoice dan pelanggan sudah benar sebelum melanjutkan.</span>
      </section>
      <div class="manual-invoice-preview">
        ${billingActionPreviewRows(invoice)}
      </div>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Batal</button>
        <button class="danger-button" type="submit" data-billing-action-submit>Rollback Invoice</button>
      </div>
    </div>
  `, async (payload, form) => {
    const submit = form.querySelector('[data-billing-action-submit]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Memproses...';
    }
    try {
      const result = await api('/api/monitoring/billing-action', {
        method: 'POST',
        body: JSON.stringify({
          action: 'rollback',
          invoiceNo,
          customerName: billingActionCustomerName(invoice)
        })
      });
      setToast(result.message || 'Rollback invoice berhasil');
      await renderMonitoringBilling({ refresh: true });
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Rollback Invoice';
      }
    }
  });
}

function billingPaymentReceiptBody(invoice = {}) {
  const branding = currentBranding();
  const signerName = invoice.paidByName || state.auth?.name || state.auth?.username || 'Admin';
  const invoiceNo = billingInvoiceNo(invoice) || '-';
  const printMode = safeReceiptPrintMode(state.receiptPrintMode || 'a4');
  const addOnsText = billingReceiptAddonsText(invoice);
  const ppnText = billingReceiptPpnText(invoice);
  const discountText = billingReceiptDiscountText(invoice);
  return `
    <div class="receipt-preview receipt-printable print-mode-${printMode}">
      <div class="receipt-head">
        <img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.businessName)}">
        <div>
          <strong>${escapeHtml(branding.businessName)}</strong>
          <span>${escapeHtml(brandingPrintLabel('Bukti Pembayaran Tagihan', branding))}</span>
        </div>
      </div>
      <div class="receipt-title">BUKTI PEMBAYARAN</div>
      <div class="receipt-no">No: Payment Invoice #${escapeHtml(invoiceNo)}</div>
      <div class="receipt-lines">
        <div><span>Telah diterima dari</span><strong>${escapeHtml(billingActionCustomerName(invoice))}</strong></div>
        <div><span>Username/UID</span><strong>${escapeHtml(invoice.username || invoice.accountId || '-')}</strong></div>
        <div><span>Untuk pembayaran</span><strong>${escapeHtml(invoice.item || invoice.subscribe || invoice.packageName || 'Tagihan internet')}</strong></div>
        <div><span>Periode</span><strong>${escapeHtml(readablePeriodText(invoice.coverageText || invoice.coveredPeriodText || invoice.period || state.period || '-'))}</strong></div>
        <div class="receipt-a4-only"><span>Add Ons</span><strong>${escapeHtml(addOnsText)}</strong></div>
        <div class="receipt-a4-only"><span>PPN</span><strong>${escapeHtml(ppnText)}</strong></div>
        <div class="receipt-a4-only"><span>Diskon</span><strong>${escapeHtml(discountText)}</strong></div>
        <div class="receipt-thermal-only"><span>Add Ons</span><strong>${escapeHtml(addOnsText)}</strong></div>
        <div class="receipt-thermal-only"><span>PPN</span><strong>${escapeHtml(ppnText)}</strong></div>
        <div class="receipt-thermal-only"><span>Diskon</span><strong>${escapeHtml(discountText)}</strong></div>
        <div><span>Metode</span><strong>${escapeHtml(invoice.paymentMethod || 'Tunai')}</strong></div>
        <div><span>Tanggal bayar</span><strong>${escapeHtml(invoice.paidAt ? dateTimeText(invoice.paidAt) : '-')}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(billingStatusLabel(invoice.status))}</strong></div>
      </div>
      <div class="receipt-total">
        <span>Total dibayar</span>
        <strong>${escapeHtml(rupiah(invoice.amount || 0))}</strong>
      </div>
      <div class="receipt-sign">
        <div></div>
        <div>
          <span>${escapeHtml(branding.businessName)}</span>
          <strong>${escapeHtml(signerName)}</strong>
        </div>
      </div>
    </div>
    <div class="modal-actions receipt-actions">
      ${receiptPrintModeControl('billingPaymentReceiptPrintMode', printMode)}
      <button class="ghost-button" value="cancel" type="submit">Tutup</button>
      <button class="button" id="printBillingReceipt" type="button">Print/PDF</button>
    </div>
  `;
}

function billingPaymentReceiptRawBtText(invoice = {}, mode = 'thermal-58') {
  const branding = currentBranding();
  const width = thermalTextWidth(mode);
  const signerName = invoice.paidByName || state.auth?.name || state.auth?.username || 'Admin';
  const invoiceNo = billingInvoiceNo(invoice) || '-';
  const lines = [
    thermalCenter(branding.businessName || DEFAULT_BUSINESS_NAME, width),
    thermalCenter('BUKTI PEMBAYARAN', width),
    thermalCenter(`Payment Invoice #${invoiceNo}`, width),
    thermalSeparator(width),
    ...thermalKeyValue('Nama', billingActionCustomerName(invoice), width),
    ...thermalKeyValue('User/UID', invoice.username || invoice.accountId || '-', width),
    ...thermalKeyValue('Paket', invoice.item || invoice.subscribe || invoice.packageName || 'Tagihan internet', width),
    ...thermalKeyValue('Periode', readablePeriodText(invoice.coverageText || invoice.coveredPeriodText || invoice.period || state.period || '-'), width),
    ...thermalKeyValue('Add Ons', billingReceiptAddonsText(invoice), width),
    ...thermalKeyValue('PPN', billingReceiptPpnText(invoice), width),
    ...thermalKeyValue('Diskon', billingReceiptDiscountText(invoice), width),
    ...thermalKeyValue('Metode', invoice.paymentMethod || 'Tunai', width),
    ...thermalKeyValue('Tanggal', invoice.paidAt ? dateTimeText(invoice.paidAt) : '-', width),
    thermalSeparator(width),
    thermalCenter('Total dibayar', width),
    thermalCenter(rupiah(invoice.amount || 0), width),
    thermalSeparator(width),
    thermalCenter('Petugas', width),
    thermalCenter(signerName, width),
    '',
    thermalCenter('Terima kasih', width)
  ];
  return lines.join('\n');
}

function openBillingPaymentReceiptModal(invoice = {}) {
  openModal('Bukti Pembayaran', billingPaymentReceiptBody(invoice), async () => {});
  const modeInput = document.getElementById('billingPaymentReceiptPrintMode');
  const printButton = document.getElementById('printBillingReceipt');
  modeInput?.addEventListener('change', () => {
    const mode = setReceiptPrintMode(modeInput.value);
    updateThermalPrintButtonLabel(printButton, mode);
  });
  setReceiptPrintMode(modeInput?.value || state.receiptPrintMode || 'a4');
  updateThermalPrintButtonLabel(printButton, modeInput?.value || state.receiptPrintMode || 'a4');
  printButton?.addEventListener('click', () => {
    const mode = modeInput?.value || state.receiptPrintMode || 'a4';
    if (shouldUseRawBtBridge(mode) && openRawBtTextPrint(billingPaymentReceiptRawBtText(invoice, mode))) return;
    printReceiptWithMode('printing-receipt', mode);
  });
}

function openManualInvoiceModal() {
  const wizard = {
    step: 1,
    search: '',
    page: 1,
    limit: 5,
    loading: false,
    members: [],
    pagination: { page: 1, totalPages: 1, total: 0 },
    selected: null,
    subPeriod: '1',
    preview: null,
    error: ''
  };
  const setLoading = (loading, options = {}) => {
    wizard.loading = loading;
    if (!options.silent) render();
  };

  const loadMembers = async (options = {}) => {
    setLoading(true, options);
    wizard.error = '';
    try {
      const params = queryString({
        search: wizard.search,
        page: wizard.page,
        limit: wizard.limit
      });
      const payload = await api(`/api/monitoring/billing-manual-invoice/members?${params}`);
      wizard.members = Array.isArray(payload.members) ? payload.members : [];
      wizard.pagination = payload.pagination || { page: 1, totalPages: 1, total: wizard.members.length };
      wizard.page = Number(wizard.pagination.page || wizard.page || 1);
    } catch (error) {
      wizard.error = error.message || 'Member tidak bisa dibaca';
      wizard.members = [];
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async () => {
    if (!wizard.selected?.id) return;
    setLoading(true);
    wizard.error = '';
    try {
      const params = queryString({
        memberId: wizard.selected.id,
        subPeriod: wizard.subPeriod
      });
      const payload = await api(`/api/monitoring/billing-manual-invoice/preview?${params}`);
      wizard.preview = payload.preview || null;
    } catch (error) {
      wizard.error = error.message || 'Preview invoice gagal dibaca';
      wizard.preview = null;
    } finally {
      setLoading(false);
    }
  };

  const renderMemberStep = () => `
    <div class="manual-invoice-toolbar">
      <input class="control" id="manualInvoiceSearch" value="${escapeHtml(wizard.search)}" placeholder="Cari nama, user ID, WhatsApp" autocomplete="off">
    </div>
    ${wizard.loading ? '<div class="empty">Memuat member...</div>' : ''}
    ${wizard.error ? `<div class="notice error">${escapeHtml(wizard.error)}</div>` : ''}
    ${!wizard.loading ? `
      <div class="manual-invoice-list">
        ${wizard.members.length ? wizard.members.map((member, index) => `
          <button class="manual-invoice-member" type="button" data-manual-invoice-member="${index}">
            <span>
              <strong>${escapeHtml(manualMemberTitle(member))}</strong>
              <small>${escapeHtml(manualMemberSubtitle(member))}</small>
            </span>
            <span>Pilih</span>
          </button>
        `).join('') : '<div class="empty">Tidak ada member sesuai pencarian.</div>'}
      </div>
      <div class="pager">
        <button class="ghost-button compact" type="button" data-manual-invoice-page="${Math.max(1, wizard.page - 1)}" ${wizard.page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
        <span class="pager-info">Halaman ${displayNumber(wizard.page)} dari ${displayNumber(wizard.pagination.totalPages || 1)}</span>
        ${pagerJumpControl('manual-invoice', { page: wizard.page, totalPages: wizard.pagination.totalPages || 1 })}
        <button class="ghost-button compact" type="button" data-manual-invoice-page="${wizard.page + 1}" ${wizard.page >= Number(wizard.pagination.totalPages || 1) ? 'disabled' : ''}>Berikutnya</button>
      </div>
    ` : ''}
  `;

  const renderPreviewStep = () => `
    <div class="manual-invoice-selected">
      <span>
        <strong>${escapeHtml(manualMemberTitle(wizard.selected))}</strong>
        <small>${escapeHtml(manualMemberSubtitle(wizard.selected))}</small>
      </span>
      <button class="ghost-button compact" type="button" data-manual-invoice-back>Pilih ulang</button>
    </div>
    <label class="field">
      <span>Periode subscription</span>
      <select name="subPeriod" id="manualInvoiceSubPeriod">
        ${manualInvoicePeriodOptions(wizard.subPeriod)}
      </select>
    </label>
    ${wizard.loading ? '<div class="empty">Memuat preview invoice...</div>' : ''}
    ${wizard.error ? `<div class="notice error">${escapeHtml(wizard.error)}</div>` : ''}
    ${wizard.preview ? `
      <div class="manual-invoice-preview">
        ${manualInvoicePreviewRows(wizard.preview)}
      </div>
    ` : ''}
    <div class="modal-actions">
      <button class="ghost-button" type="button" data-manual-invoice-back>Kembali</button>
      <button class="button" type="button" data-manual-invoice-submit ${wizard.loading || !wizard.preview ? 'disabled' : ''}>Buat Invoice</button>
    </div>
  `;

  function bindManualInvoiceModal() {
    const searchInput = modalBody.querySelector('#manualInvoiceSearch');
    const applyManualInvoiceSearch = (renderOptions = {}) => {
      wizard.page = 1;
      return loadMembers(renderOptions);
    };
    bindLiveTextSearch(searchInput, {
      getValue: () => wizard.search,
      setValue: (value) => {
        wizard.search = value;
        wizard.page = 1;
      },
      handler: applyManualInvoiceSearch,
      refocusSelector: '#manualInvoiceSearch'
    });
    bindSearchClearButton(searchInput, () => {
      wizard.search = '';
      wizard.page = 1;
      const result = loadMembers();
      Promise.resolve(result).finally(() => focusSearchAfterRender('#manualInvoiceSearch', wizard.search, { preserveMs: SEARCH_FOCUS_INTENT_MS }));
    });
    modalBody.querySelectorAll('[data-manual-invoice-page]').forEach((button) => {
      button.addEventListener('click', () => {
        wizard.page = Math.max(1, Number(button.dataset.manualInvoicePage || 1));
        loadMembers();
      });
    });
    modalBody.querySelectorAll('[data-manual-invoice-member]').forEach((button) => {
      button.addEventListener('click', () => {
        const member = wizard.members[Number(button.dataset.manualInvoiceMember || -1)];
        if (!member) return;
        wizard.selected = member;
        wizard.step = 2;
        wizard.preview = null;
        render();
        loadPreview();
      });
    });
    modalBody.querySelectorAll('[data-manual-invoice-back]').forEach((button) => {
      button.addEventListener('click', () => {
        wizard.step = 1;
        wizard.preview = null;
        wizard.error = '';
        render();
      });
    });
    modalBody.querySelector('#manualInvoiceSubPeriod')?.addEventListener('change', (event) => {
      wizard.subPeriod = event.target.value;
      wizard.preview = null;
      loadPreview();
    });
    modalBody.querySelector('[data-manual-invoice-submit]')?.addEventListener('click', async () => {
      if (!wizard.selected?.id) {
        setToast('Member belum dipilih');
        return;
      }
      setLoading(true);
      try {
        const result = await api('/api/monitoring/billing-manual-invoice', {
          method: 'POST',
          body: JSON.stringify({
            memberId: wizard.selected.id,
            memberName: manualMemberTitle(wizard.selected),
            subPeriod: wizard.subPeriod
          })
        });
        modal.close();
        const invoicePeriod = result.invoice?.period || result.invoice?.coverageStartPeriod || wizard.preview?.period || '';
        if (invoicePeriod) {
          state.monitoringBillingPeriod = normalizedPeriod(invoicePeriod);
          saveMonitoringBillingPeriod(state.monitoringBillingPeriod);
        }
        state.monitoringBillingStatus = 'all';
        state.monitoringBillingCustomerStatus = 'all';
        state.monitoringBillingScope = 'month';
        setToast(invoicePeriod
          ? `${result.message || 'Invoice manual dibuat'} - periode ${periodLabel(invoicePeriod)}`
          : (result.message || 'Invoice manual dibuat'));
        renderMonitoringBilling({ refresh: true });
      } catch (error) {
        wizard.error = error.message || 'Invoice manual gagal dibuat';
        render();
      } finally {
        wizard.loading = false;
        if (modal.open) {
          render();
        }
      }
    });
  }

  function render() {
    modalTitle.textContent = 'Invoice Manual';
    modalBody.innerHTML = `
      <div class="manual-invoice-wizard">
        <div class="manual-invoice-steps">
          <span class="${wizard.step === 1 ? 'active' : ''}">1. Pilih Pelanggan</span>
          <span class="${wizard.step === 2 ? 'active' : ''}">2. Preview Invoice</span>
        </div>
        ${wizard.step === 1 ? renderMemberStep() : renderPreviewStep()}
      </div>
    `;
    bindManualInvoiceModal();
  }

  const form = modal.querySelector('.modal-frame');
  modalTitle.textContent = 'Invoice Manual';
  modalBody.innerHTML = '';
  form.onsubmit = (event) => event.preventDefault();
  modal.querySelectorAll('[value="cancel"], [data-close-modal]').forEach((button) => {
    button.formNoValidate = true;
    button.onclick = (event) => {
      event.preventDefault();
      modal.close();
    };
  });
  modal.showModal();
  render();
  loadMembers();
}

function memberStatusLabel(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active') return 'Aktif';
  if (['pending', 'unpaid'].includes(normalized)) return 'Belum Bayar';
  if (['suspend', 'suspended', 'isolir', 'isolated'].includes(normalized)) return 'Isolir';
  if (['terminate', 'terminated'].includes(normalized)) return 'Terminated';
  return status || '-';
}

function memberStatusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active') return 'active';
  if (['terminate', 'terminated'].includes(normalized)) return 'cancelled';
  if (['suspend', 'suspended', 'isolir', 'isolated'].includes(normalized)) return 'overdue';
  return 'pending';
}

function memberPaymentTypeLabel(value) {
  const normalized = String(value || '').toLowerCase();
  if (['1', 'postpaid', 'post paid'].includes(normalized)) return 'Postpaid';
  if (['2', 'prepaid', 'pre paid'].includes(normalized)) return 'Prepaid';
  return value || '-';
}

function memberBillingPeriodLabel(value) {
  const normalized = String(value || '').toLowerCase();
  if (['1', 'fixed', 'fixed-date', 'fixed date'].includes(normalized)) return 'Fixed';
  if (['2', 'cycle', 'billing-cycle', 'billing cycle'].includes(normalized)) return 'Cycle';
  if (['3', 'renewal', 'renew'].includes(normalized)) return 'Renewal';
  return value || '-';
}

function memberDateDisplayInput(value) {
  return dateDisplayInput(value);
}

function normalizeMemberDateDisplayInput(value) {
  return formatDateDisplayFromParts(datePartsFromInput(value));
}

function memberPercentInput(value) {
  const match = String(value || '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? match[0] : '';
}

function memberNumberInput(value) {
  let cleaned = String(value || '').trim().replace(/[^\d,.-]/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    const decimalSeparator = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
    const thousandSeparator = decimalSeparator === ',' ? '.' : ',';
    cleaned = cleaned.replace(new RegExp(`\\${thousandSeparator}`, 'g'), '').replace(decimalSeparator, '.');
  } else if (hasComma) {
    const parts = cleaned.split(',');
    cleaned = parts.at(-1).length === 3 && parts.length > 1 ? parts.join('') : cleaned.replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    cleaned = parts.at(-1).length === 3 && parts.length > 1 ? parts.join('') : cleaned;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.round(parsed)) : '';
}

function memberDiscountDisplay(value) {
  const amount = Number(memberNumberInput(value) || 0);
  return amount > 0 ? rupiah(amount) : '-';
}

function memberAddonsArray(source = {}) {
  const raw = Array.isArray(source)
    ? source
    : (source.addOns || source.addons || source.memberAddons || []);
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = raw.trim() ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function memberAddonAmount(item = {}) {
  const quantity = Math.max(1, Number(memberNumberInput(item.quantity || item.qty || item.pcs || 1)) || 1);
  const hasUnitPrice = item.unitPrice !== undefined || item.price !== undefined || item.unitAmount !== undefined;
  if (!hasUnitPrice && item.amount !== undefined) {
    return Number(memberNumberInput(item.amount)) || 0;
  }
  const unitPrice = Number(memberNumberInput(item.unitPrice || item.price || item.unitAmount || item.amount)) || 0;
  return Math.round(quantity * unitPrice);
}

function memberAddonsTotal(addons = []) {
  return memberAddonsArray(addons).reduce((sum, item) => sum + memberAddonAmount(item), 0);
}

function memberAddonsDisplay(addons = []) {
  const rows = memberAddonsArray(addons).filter((item) => memberAddonAmount(item) > 0);
  if (!rows.length) return '-';
  const total = memberAddonsTotal(rows);
  return `${rows.length} add-on / ${rupiah(total)}`;
}

function memberAddonsDetailText(addons = []) {
  const rows = memberAddonsArray(addons).filter((item) => memberAddonAmount(item) > 0);
  if (!rows.length) return '-';
  return rows.map((item) => {
    const quantity = Math.max(1, Number(memberNumberInput(item.quantity || item.qty || item.pcs || 1)) || 1);
    const name = item.name || item.itemName || 'Add-on';
    return `${name} x${quantity}: ${rupiah(memberAddonAmount(item))}`;
  }).join('\n');
}

function memberDiscountWithPpnOffset(discountAmount = 0, packageSubtotal = 0, addOnSubtotal = 0, taxableAmount = 0, ppnRate = 0) {
  const discount = Math.max(0, Math.round(memberNumberInput(discountAmount)));
  const packagePpn = Math.round((Math.max(0, memberNumberInput(packageSubtotal)) * ppnRate) / 100);
  const subtotalPpn = Math.round((Math.max(0, memberNumberInput(taxableAmount)) * ppnRate) / 100);
  if (ppnRate > 0 && addOnSubtotal > 0 && packagePpn > 0 && discount === packagePpn && subtotalPpn > discount) {
    return subtotalPpn;
  }
  return discount;
}

function memberId(member = {}) {
  return member.id || member.memberId || member.accountId || '';
}

function memberDisplayId(member = {}) {
  return member.accountId || member.userId || member.code || member.memberCode || member.id || '-';
}

function memberTitle(member = {}) {
  return member.fullName || member.customerName || member.userId || member.accountId || member.internet || '-';
}

function memberMeta(member = {}) {
  return [member.userId || member.accountId, member.internet || member.username].filter(Boolean).join(' / ') || '-';
}

function sameMemberText(a = '', b = '') {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function memberCreatorText(member = {}) {
  const name = member.createdByName || member.createdByUsername || '';
  if (!name) return '';
  return `Dibuat oleh ${name}`;
}

function memberLocationUrl(member = {}) {
  const latitude = String(member.latitude || member.memberLatitude || '').trim();
  const longitude = String(member.longitude || member.memberLongitude || '').trim();
  if (member.locationUrl) return member.locationUrl;
  return latitude && longitude ? `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}` : '';
}

function memberHousePhotoUrl(member = {}) {
  return String(member.housePhotoUrl || member.memberHousePhotoUrl || member.photoUrl || '').trim();
}

function memberKtpPhotoUrl(member = {}, fallbackId = '') {
  const photo = member.ktpPhoto || member.memberKtpPhoto || null;
  if (!photo || typeof photo !== 'object' || (!photo.hasPhoto && !photo.id)) return '';
  const id = fallbackId || memberId(member);
  if (!id) return '';
  const version = photo.uploadedAt || photo.id || '';
  return `/api/monitoring/member-ktp-photo?memberId=${encodeURIComponent(id)}${version ? `&v=${encodeURIComponent(version)}` : ''}`;
}

function memberDataValidationState(member = {}) {
  const serverChecks = member.dataValidation?.checks;
  if (serverChecks && typeof serverChecks === 'object') {
    const checks = {
      name: serverChecks.name === true,
      ktpName: serverChecks.ktpName === true,
      ktpNumber: serverChecks.ktpNumber === true,
      address: serverChecks.address === true,
      location: serverChecks.location === true,
      housePhoto: serverChecks.housePhoto === true,
      ktpPhoto: serverChecks.ktpPhoto === true
    };
    return { valid: Object.values(checks).every(Boolean), checks };
  }
  const latitude = Number(member.latitude ?? member.memberLatitude ?? 0);
  const longitude = Number(member.longitude ?? member.memberLongitude ?? 0);
  const photo = member.ktpPhoto || member.memberKtpPhoto || null;
  const checks = {
    name: Boolean(String(member.fullName || member.customerName || member.name || '').trim()),
    ktpName: Boolean(String(member.ktpName || member.memberKtpName || '').trim()),
    ktpNumber: String(member.ktp || member.idCard || '').replace(/\D+/g, '').length === 16,
    address: Boolean(String(member.address || '').trim()),
    location: Number.isFinite(latitude)
      && Number.isFinite(longitude)
      && latitude !== 0
      && longitude !== 0
      && latitude >= -90
      && latitude <= 90
      && longitude >= -180
      && longitude <= 180,
    housePhoto: Boolean(memberHousePhotoUrl(member)),
    ktpPhoto: Boolean(
      member.ktpPhotoUrl
      || member.memberKtpPhotoUrl
      || (photo && typeof photo === 'object' && (photo.hasPhoto || photo.id))
    )
  };
  return { valid: Object.values(checks).every(Boolean), checks };
}

function memberDataValidationModalBody(member = {}) {
  const validation = memberDataValidationState(member);
  const items = [
    ['name', 'Nama'],
    ['ktpName', 'Nama di KTP'],
    ['ktpNumber', 'No KTP'],
    ['address', 'Alamat'],
    ['location', 'Data Lokasi'],
    ['housePhoto', 'Foto Rumah'],
    ['ktpPhoto', 'Foto KTP']
  ];
  return `
    <div class="member-validation-modal">
      <div class="member-validation-head">
        <div>
          <strong>${escapeHtml(memberTitle(member))}</strong>
          <span>${escapeHtml(memberDisplayId(member))}</span>
        </div>
        <span class="member-validation-summary ${validation.valid ? 'is-valid' : 'is-invalid'}">
          ${validation.valid ? 'Data Valid' : 'Belum Valid'}
        </span>
      </div>
      <div class="member-validation-list">
        ${items.map(([key, label]) => `
          <div class="member-validation-item ${validation.checks[key] ? 'is-valid' : 'is-invalid'}">
            <span class="member-validation-icon" aria-hidden="true"></span>
            <strong>${escapeHtml(label)}</strong>
            <small>${validation.checks[key] ? 'Valid' : 'Belum terisi'}</small>
          </div>
        `).join('')}
      </div>
      <div class="modal-actions">
        <button class="ghost-button" data-close-modal type="button">Tutup</button>
      </div>
    </div>
  `;
}

function openMemberDataValidationModal(member = {}) {
  openModal('Validasi Data Member', memberDataValidationModalBody(member), async () => {});
}

function customerLocationTitle(record = {}) {
  return record.customerName || record.fullName || record.name || record.userId || record.accountId || record.username || record.internet || '-';
}

function customerLocationMeta(record = {}) {
  return [record.accountId || record.userId || '', record.username || record.internet || '', record.phone || record.whatsapp || '']
    .filter(Boolean)
    .join(' / ') || '-';
}

function customerLocationModalBody(record = {}) {
  const title = customerLocationTitle(record);
  const meta = customerLocationMeta(record);
  const address = record.address || '-';
  const latitude = String(record.latitude || record.memberLatitude || '').trim();
  const longitude = String(record.longitude || record.memberLongitude || '').trim();
  const accuracy = String(record.locationAccuracy || record.memberLocationAccuracy || '').trim();
  const coordinate = [latitude, longitude].filter(Boolean).join(', ') || '-';
  const mapUrl = memberLocationUrl(record);
  const latitudeNumber = Number(latitude);
  const longitudeNumber = Number(longitude);
  const hasCoordinate = Number.isFinite(latitudeNumber) && Number.isFinite(longitudeNumber) && latitudeNumber !== 0 && longitudeNumber !== 0;
  const photoUrl = memberHousePhotoUrl(record);
  return `
    <div class="member-edit-card member-detail-modal customer-location-modal">
      <div class="member-edit-hero">
        <div class="member-edit-avatar">${escapeHtml(String(title).slice(0, 1).toUpperCase() || 'P')}</div>
        <div class="member-edit-title">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(meta)}</span>
        </div>
      </div>
      <div class="member-contact-preview-grid">
        <div class="member-map-preview">
          <div class="member-map-preview-head">
            <strong>Lokasi Pelanggan</strong>
            ${mapUrl ? `<a class="ghost-button compact button-link" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">Google Maps</a>` : ''}
          </div>
          <span>Alamat</span>
          <p>${escapeHtml(address)}</p>
          <span>Koordinat</span>
          <em>${escapeHtml(coordinate)}${accuracy ? `, akurasi ${escapeHtml(accuracy)}m` : ''}</em>
          ${hasCoordinate ? '<div class="member-leaflet-map" id="customerLocationLeafletMap"></div>' : '<div class="empty compact">Koordinat lokasi belum tersedia.</div>'}
        </div>
        <div class="member-house-photo-card">
          <strong>Foto Rumah</strong>
          ${photoUrl
            ? `<img class="member-house-photo-large" src="${escapeHtml(photoUrl)}" alt="Foto rumah ${escapeHtml(title)}">`
            : '<div class="empty compact">Foto rumah belum tersedia.</div>'}
        </div>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" data-close-modal type="button">Tutup</button>
      </div>
    </div>
  `;
}

function initCustomerLocationMap(record = {}) {
  const mapEl = modalBody.querySelector('#customerLocationLeafletMap');
  if (!mapEl || mapEl._customerLocationMap) return;
  const latitude = Number(record.latitude || record.memberLatitude || 0);
  const longitude = Number(record.longitude || record.memberLongitude || 0);
  const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0;
  if (!hasPoint) return;
  if (!window.L) {
    ensureLeafletLoaded().then((loaded) => {
      if (loaded) initCustomerLocationMap(record);
    });
    return;
  }
  const map = window.L.map(mapEl, { zoomControl: true }).setView([latitude, longitude], 17);
  mapEl._customerLocationMap = map;
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  window.L.marker([latitude, longitude]).addTo(map);
  window.setTimeout(() => map.invalidateSize(), 80);
}

function openCustomerLocationModal(record = {}) {
  openModal('Lokasi Pelanggan', customerLocationModalBody(record), async () => {});
  initCustomerLocationMap(record);
}

function memberEditHeader(member = {}, detail = {}) {
  const contactText = detail.whatsapp || member.whatsapp || member.phone || '-';
  const displayId = memberDisplayId({ ...member, ...detail });
  const dateTextValue = detail.nextDue || member.nextDue || member.dueDate || member.activeDate || '';
  return `
    <div class="member-edit-hero">
      <div class="member-edit-avatar">${escapeHtml(String(memberTitle(member)).slice(0, 1).toUpperCase() || 'R')}</div>
      <div class="member-edit-title">
        <strong>${escapeHtml(memberTitle(member))}</strong>
        <span>${escapeHtml(memberMeta(member))}</span>
      </div>
      <span class="badge ${memberStatusBadge(member.status)}">${escapeHtml(memberStatusLabel(member.status))}</span>
    </div>
    <div class="member-edit-summary">
      <span>
        <small>ID Member</small>
        <strong>${escapeHtml(displayId)}</strong>
      </span>
      <span class="member-contact-tile">
        <small>WhatsApp</small>
        <strong>${escapeHtml(contactText)}</strong>
      </span>
      <span><small>Payment</small><strong>${escapeHtml(memberPaymentTypeLabel(detail.paymentType || member.paymentType || member.type))}</strong></span>
      <span><small>Billing</small><strong>${escapeHtml(memberBillingPeriodLabel(detail.billingPeriod || member.billingPeriod || member.method))}</strong></span>
      <span><small>Tanggal</small><strong>${escapeHtml(dateTextValue ? dateText(dateTextValue) : '-')}</strong></span>
    </div>
  `;
}

function memberPaginationControls(pagination = {}) {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('member', pagination.limit || state.monitoringMemberLimit || 10, 10);
  if (total <= effectivePagerLimit(pagination.limit || state.monitoringMemberLimit || 10, total, 10)) {
    return `
      <div class="pager">
        <span class="pager-info">${total ? `Menampilkan ${total} member` : 'Belum ada member'}</span>
        ${limitControl}
      </div>
    `;
  }
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-member-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${page} dari ${totalPages} - ${total} member</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-member-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

async function loadMemberDetail(member = {}, section = 'all') {
  const id = memberId(member);
  if (!id) {
    throw new Error('ID member tidak tersedia');
  }
  const params = queryString({ memberId: id, section, period: state.period || todayInput().slice(0, 7) });
  return api(`/api/monitoring/member-detail?${params}`);
}

function memberReadonlyRows(rows = []) {
  return `
    <div class="member-readonly-grid">
      ${rows.map(([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value || '-')}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function memberInvoiceDetailRows(invoices = []) {
  if (!invoices.length) {
    return '<div class="empty compact">Belum ada invoice untuk member ini.</div>';
  }
  return `
    <div class="table-wrap compact-table">
      <table class="billing-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Total</th>
            <th>Due Date</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map((invoice, index) => `
            <tr>
              <td>${escapeHtml(billingInvoiceNo(invoice) || invoice.id || '-')}</td>
              <td>${escapeHtml(rupiah(invoice.amount || invoice.total || 0))}</td>
              <td>${escapeHtml(dateText(invoice.dueDate || invoice.invoiceDate) || '-')}</td>
              <td><span class="badge ${billingStatusBadge(invoice.status)}">${escapeHtml(billingStatusLabel(invoice.status))}</span></td>
              <td>
                ${billingPayAllowed(invoice) ? `
                  <button class="billing-action-button pay compact" type="button" data-member-invoice-pay="${index}" title="Bayar invoice">
                    <span class="billing-action-icon pay" aria-hidden="true"></span>
                  </button>
                ` : '<span class="muted">-</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function usageMonthlyBarChart(rows = []) {
  const chartRows = Array.isArray(rows) ? rows.slice(-12) : [];
  if (!chartRows.length) {
    return '<div class="empty compact">History pemakaian 12 bulan belum tersedia.</div>';
  }
  const box = { width: 420, height: 204, left: 54, right: 12, top: 18, plotHeight: 132 };
  const range = statisticsChartRange(chartRows.map((row) => row.totalOctets), {
    zeroBase: true,
    minPadding: 1024 * 1024,
    stepBase: 1024 * 1024
  });
  const plotWidth = box.width - box.left - box.right;
  const step = chartRows.length ? plotWidth / chartRows.length : plotWidth;
  const barWidth = Math.max(8, Math.min(18, step * 0.46));
  return `
    <div class="statistics-chart-card usage-monthly-chart">
      <div class="statistics-chart-head">
        <div>
          <h3>Pemakaian Bulanan</h3>
          <span>Total upload/download 12 bulan terakhir.</span>
        </div>
        <div class="statistics-legend compact">
          <span class="voucher">Total usage</span>
        </div>
      </div>
      <div class="statistics-svg-wrap">
        <svg viewBox="0 0 ${box.width} ${box.height}" role="img" aria-label="History pemakaian bulanan">
          ${statisticsAxisMarkup(range, box, statisticsCompactBytes)}
          ${chartRows.map((row, index) => {
            const value = Number(row.totalOctets || 0);
            const y = statisticsChartPoint(value, range, box);
            const height = Math.max(0, (box.top + box.plotHeight) - y);
            const x = box.left + (step * index) + ((step - barWidth) / 2);
            const tooltip = `${periodLabel(row.period)}\nUpload: ${row.upload || statisticsCompactBytes(row.inputOctets || 0)}\nDownload: ${row.download || statisticsCompactBytes(row.outputOctets || 0)}\nTotal: ${row.totalUsageText || statisticsCompactBytes(value)}`;
            const hitWidth = Math.max(28, barWidth + 12);
            const hitX = x + (barWidth / 2) - (hitWidth / 2);
            return `
              <rect class="statistics-bar voucher" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${height.toFixed(2)}" rx="5" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
              <rect class="statistics-hit-rect" fill="transparent" pointer-events="all" x="${hitX.toFixed(2)}" y="${box.top}" width="${hitWidth.toFixed(2)}" height="${box.plotHeight}" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
            `;
          }).join('')}
          ${statisticsMonthAxisMarkup(chartRows, box)}
        </svg>
      </div>
    </div>
  `;
}

function usageDailyDateLabel(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text || '-';
  return `${match[3]}/${match[2]}`;
}

function usageIntervalTimeLabel(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/T(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return text.slice(11, 16) || '-';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function usageDailyGridMarkup(range = {}, box = {}) {
  return (range.ticks || []).map((value) => {
    const y = statisticsChartPoint(value, range, box);
    return `<line class="statistics-grid-line" x1="0" x2="${box.width - box.right}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"></line>`;
  }).join('');
}

function usageDailyFixedAxisMarkup(range = {}, box = {}, formatter = statisticsCompactBytes) {
  return (range.ticks || []).map((value) => {
    const y = statisticsChartPoint(value, range, box);
    return `<span style="top:${y.toFixed(2)}px">${escapeHtml(formatter(value))}</span>`;
  }).join('');
}

function usageIntervalLineChart(rows = [], intervalMinutes = 15) {
  const chartRows = (Array.isArray(rows) ? rows : []).slice(-96);
  if (!chartRows.length) {
    return '<div class="empty compact">Traffic 24 jam terakhir belum tersedia.</div>';
  }
  const seconds = Math.max(60, Number(intervalMinutes || 15) * 60);
  const trafficRows = chartRows.map((row) => {
    const inputOctets = Number(row.inputOctets || 0);
    const outputOctets = Number(row.outputOctets || 0);
    return {
      ...row,
      inputMbps: (inputOctets * 8) / seconds / 1000000,
      outputMbps: (outputOctets * 8) / seconds / 1000000
    };
  });
  const box = { width: 360, height: 132, right: 8, top: 12, plotHeight: 94 };
  const range = statisticsChartRange(trafficRows.flatMap((row) => [row.inputMbps, row.outputMbps]), {
    zeroBase: true,
    minPadding: 0.05,
    stepBase: 0.1
  });
  const plotWidth = box.width - box.right;
  const step = trafficRows.length > 1 ? plotWidth / (trafficRows.length - 1) : plotWidth;
  const baselineY = box.top + box.plotHeight;
  const uploadPoints = trafficRows.map((row, index) => ({
    x: step * index,
    y: statisticsChartPoint(row.inputMbps || 0, range, box),
    row
  }));
  const downloadPoints = trafficRows.map((row, index) => ({
    x: step * index,
    y: statisticsChartPoint(row.outputMbps || 0, range, box),
    row
  }));
  const tickIndexes = [...new Set([0, Math.floor((trafficRows.length - 1) / 3), Math.floor((trafficRows.length - 1) * 2 / 3), trafficRows.length - 1])]
    .filter((index) => index >= 0 && index < trafficRows.length);
  return `
    <div class="statistics-chart-card usage-interval-chart">
      <div class="statistics-chart-head">
        <div>
          <h3>Traffic 24 Jam Terakhir</h3>
          <span>Rata-rata upload/download per ${displayNumber(intervalMinutes || 15)} menit dalam Mbps.</span>
        </div>
        <div class="statistics-legend compact usage-legend usage-traffic-legend">
          <span><i class="upload" aria-hidden="true"></i>Upload</span>
          <span><i class="download" aria-hidden="true"></i>Download</span>
        </div>
      </div>
      <div class="usage-daily-chart-frame usage-interval-chart-frame">
        <div class="usage-daily-fixed-axis" aria-hidden="true">
          ${usageDailyFixedAxisMarkup(range, box, statisticsCompactMbps)}
        </div>
        <div class="statistics-svg-wrap usage-daily-svg-wrap usage-interval-svg-wrap">
          <svg viewBox="0 0 ${box.width} ${box.height}" preserveAspectRatio="none" role="img" aria-label="Traffic 24 jam terakhir">
            ${usageDailyGridMarkup(range, box)}
            <path class="usage-area upload" d="${statisticsAreaPath(uploadPoints, baselineY)}"></path>
            <path class="usage-area download" d="${statisticsAreaPath(downloadPoints, baselineY)}"></path>
            <path class="usage-line upload" d="${statisticsLinePath(uploadPoints)}"></path>
            <path class="usage-line download" d="${statisticsLinePath(downloadPoints)}"></path>
            ${trafficRows.map((row, index) => {
              const x = step * index;
              const uploadY = statisticsChartPoint(row.inputMbps || 0, range, box);
              const downloadY = statisticsChartPoint(row.outputMbps || 0, range, box);
              const tooltip = `${usageIntervalTimeLabel(row.bucketAt)}\nUpload: ${statisticsCompactMbps(row.inputMbps || 0)}\nDownload: ${statisticsCompactMbps(row.outputMbps || 0)}\nTotal usage: ${row.totalUsageText || statisticsCompactBytes(row.totalOctets || 0)}`;
              return `
                <rect class="statistics-hit-rect" fill="transparent" pointer-events="all" x="${Math.max(0, x - 8).toFixed(2)}" y="${box.top}" width="16" height="${box.plotHeight}" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
              `;
            }).join('')}
          </svg>
          <div class="usage-interval-time-grid">
            ${tickIndexes.map((index) => `<span>${escapeHtml(usageIntervalTimeLabel(trafficRows[index]?.bucketAt))}</span>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function usageDailyBarChart(rows = []) {
  const chartRows = (Array.isArray(rows) ? rows : []).slice(-7);
  if (!chartRows.length) {
    return '<div class="empty compact">Aktivitas usage 7 hari terakhir belum tersedia.</div>';
  }
  const box = { width: 320, height: 116, right: 0, top: 8, plotHeight: 96 };
  const range = statisticsChartRange(chartRows.map((row) => row.totalOctets), {
    zeroBase: true,
    minPadding: 1024 * 1024,
    stepBase: 1024 * 1024
  });
  const plotWidth = box.width - box.right;
  const step = chartRows.length ? plotWidth / chartRows.length : plotWidth;
  const barWidth = Math.max(10, Math.min(24, step * 0.52));
  return `
    <div class="statistics-chart-card usage-daily-chart">
      <div class="statistics-chart-head">
        <div>
          <h3>Pemakaian 7 Hari Terakhir</h3>
          <span>Total usage harian dari FreeRADIUS.</span>
        </div>
        <div class="statistics-legend compact">
          <span class="voucher">Total usage</span>
        </div>
      </div>
      <div class="usage-daily-chart-frame">
        <div class="usage-daily-fixed-axis" aria-hidden="true">
          ${usageDailyFixedAxisMarkup(range, box, statisticsCompactBytes)}
        </div>
        <div class="statistics-svg-wrap usage-daily-svg-wrap">
          <svg viewBox="0 0 ${box.width} ${box.height}" preserveAspectRatio="none" role="img" aria-label="Aktivitas usage 7 hari terakhir">
          ${usageDailyGridMarkup(range, box)}
          ${chartRows.map((row, index) => {
            const value = Number(row.totalOctets || 0);
            const y = statisticsChartPoint(value, range, box);
            const height = Math.max(0, (box.top + box.plotHeight) - y);
            const x = (step * index) + ((step - barWidth) / 2);
            const tooltip = `${dateText(row.date)}\nUpload: ${row.upload || statisticsCompactBytes(row.inputOctets || 0)}\nDownload: ${row.download || statisticsCompactBytes(row.outputOctets || 0)}\nTotal: ${row.totalUsageText || statisticsCompactBytes(value)}`;
            const hitWidth = Math.max(34, barWidth + 14);
            const hitX = x + (barWidth / 2) - (hitWidth / 2);
            return `
              <rect class="statistics-bar voucher" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${height.toFixed(2)}" rx="5" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
              <rect class="statistics-hit-rect" fill="transparent" pointer-events="all" x="${hitX.toFixed(2)}" y="${box.top}" width="${hitWidth.toFixed(2)}" height="${box.plotHeight}" ${chartTooltipAttr(tooltip)}><title>${escapeHtml(tooltip)}</title></rect>
            `;
          }).join('')}
          </svg>
          <div class="usage-daily-date-grid">
            ${chartRows.map((row) => {
              const tooltip = `${dateText(row.date)}\nUpload: ${row.upload || statisticsCompactBytes(row.inputOctets || 0)}\nDownload: ${row.download || statisticsCompactBytes(row.outputOctets || 0)}\nTotal: ${row.totalUsageText || statisticsCompactBytes(row.totalOctets || 0)}`;
              return `<span ${chartTooltipAttr(tooltip)}>${escapeHtml(usageDailyDateLabel(row.date))}</span>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function usageDetailPanel(usage = {}) {
  const dailyRows = Array.isArray(usage.dailyRows) ? usage.dailyRows : [];
  const activeDailyRows = dailyRows.filter((row) => Number(row.totalOctets || 0) > 0);
  const averageDailyOctets = activeDailyRows.length
    ? activeDailyRows.reduce((sum, row) => sum + Number(row.totalOctets || 0), 0) / activeDailyRows.length
    : 0;
  const peakDailyOctets = dailyRows.reduce((max, row) => Math.max(max, Number(row.totalOctets || 0)), 0);
  return `
    <div class="usage-summary-grid">
      <div>
        <span>Total Usage</span>
        <strong>${escapeHtml(usage.totalUsageText || '0 B')}</strong>
      </div>
      <div>
        <span>Upload</span>
        <strong>${escapeHtml(usage.upload || '0 B')}</strong>
      </div>
      <div>
        <span>Download</span>
        <strong>${escapeHtml(usage.download || '0 B')}</strong>
      </div>
      <div>
        <span>Rata-rata 7 Hari</span>
        <strong>${escapeHtml(statisticsCompactBytes(averageDailyOctets))}</strong>
      </div>
      <div>
        <span>Puncak Harian</span>
        <strong>${escapeHtml(statisticsCompactBytes(peakDailyOctets))}</strong>
      </div>
    </div>
    ${usage.error ? `<div class="notice warning"><strong>Usage belum lengkap</strong><span>${escapeHtml(usage.error)}</span></div>` : ''}
    ${usageDailyBarChart(usage.dailyRows || [])}
    ${usage.dailyError ? `<div class="notice warning"><strong>History usage belum lengkap</strong><span>${escapeHtml(usage.dailyError)}</span></div>` : ''}
    ${usageIntervalLineChart(usage.intervalRows || [], usage.intervalMinutes || 15)}
    ${usage.intervalError ? `<div class="notice warning"><strong>Traffic 24 jam belum lengkap</strong><span>${escapeHtml(usage.intervalError)}</span></div>` : ''}
    ${usage.retentionText ? `<div class="muted usage-retention-note">${escapeHtml(usage.retentionText)}</div>` : ''}
  `;
}

function contactModalBody(member = {}, contact = {}, editable = false, detail = {}) {
  const disabled = editable ? '' : 'disabled';
  const photoUrl = memberHousePhotoUrl(contact) || memberHousePhotoUrl(member);
  const detailMemberId = memberId(member) || memberId(contact);
  const ktpPhotoUrl = editable ? (memberKtpPhotoUrl(contact, detailMemberId) || memberKtpPhotoUrl(member, detailMemberId)) : '';
  const payment = detail.payment || {};
  const internet = detail.internet || {};
  const invoices = Array.isArray(detail.invoices) ? detail.invoices : [];
  const usage = detail.usage || {};
  return `
    <div class="member-edit-card member-detail-modal">
      ${memberEditHeader(member, contact)}
      <div class="member-detail-tabs" role="tablist">
        <button class="is-active" type="button" data-member-detail-tab="contact">Contact</button>
        <button type="button" data-member-detail-tab="payment">Payment</button>
        <button type="button" data-member-detail-tab="internet">Internet</button>
        <button type="button" data-member-detail-tab="usage">Usage</button>
        <button type="button" data-member-detail-tab="invoice">Invoice</button>
      </div>
      <section class="member-edit-section" data-member-detail-panel="contact">
        <div class="section-head compact">
          <h2>Contact Detail</h2>
          <span class="muted">${editable ? 'Perubahan akan disimpan ke data member lokal.' : 'Mode lihat detail.'}</span>
        </div>
        <div class="form-grid member-edit-form">
          <label>Nama Lengkap
            <input name="fullName" value="${escapeHtml(contact.fullName || member.fullName || member.customerName || '')}" required ${disabled}>
          </label>
          <label>Nama di KTP
            <input name="ktpName" value="${escapeHtml(contact.ktpName || member.ktpName || '')}" ${disabled}>
          </label>
          <label>WhatsApp
            <input name="whatsapp" value="${escapeHtml(contact.whatsapp || member.whatsapp || member.phone || '')}" inputmode="tel" ${disabled}>
          </label>
          <label>Email
            <input name="email" type="email" value="${escapeHtml(contact.email || member.email || '')}" ${disabled}>
          </label>
          <label>Nomor KTP
            <input name="ktp" value="${escapeHtml(contact.ktp || member.ktp || '')}" inputmode="numeric" ${disabled}>
          </label>
          <label class="span-2">Alamat
            <textarea name="address" ${disabled}>${escapeHtml(contact.address || member.address || '')}</textarea>
          </label>
          <label>Latitude
            <input name="latitude" value="${escapeHtml(contact.latitude || member.latitude || '')}" inputmode="decimal" ${disabled}>
          </label>
          <label>Longitude
            <input name="longitude" value="${escapeHtml(contact.longitude || member.longitude || '')}" inputmode="decimal" ${disabled}>
          </label>
          <label>Akurasi Lokasi
            <input name="locationAccuracy" value="${escapeHtml(contact.locationAccuracy || member.locationAccuracy || '')}" inputmode="numeric" ${disabled}>
          </label>
        </div>
        <div class="member-contact-preview-grid">
          <div class="member-map-preview">
            <div class="member-map-preview-head">
              <strong>Lokasi Peta</strong>
              ${editable ? `<button class="icon-button compact location-sync-button" id="memberSyncLocation" type="button" title="Sinkron Lokasi" aria-label="Sinkron Lokasi">
                <span class="location-sync-icon" aria-hidden="true"></span>
              </button>` : ''}
            </div>
            <span id="memberLocationPreviewLabel">${(contact.latitude || member.latitude) && (contact.longitude || member.longitude) ? 'Preview koordinat pelanggan' : 'Koordinat belum tersedia'}</span>
            <em id="memberLocationPreviewCoordinate">${escapeHtml([contact.latitude || member.latitude, contact.longitude || member.longitude].filter(Boolean).join(', ') || '-')}</em>
            <div class="member-leaflet-map" id="memberContactLeafletMap"></div>
            ${editable ? '<p class="muted" id="memberLocationSyncStatus">Klik ikon lokasi atau pilih titik pada peta.</p>' : ''}
          </div>
          <div class="member-house-photo-card">
            <strong>Foto Rumah</strong>
            ${photoUrl ? `<img class="member-house-photo-large" id="memberHousePhotoPreview" src="${escapeHtml(photoUrl)}" alt="Foto rumah ${escapeHtml(memberTitle(member))}">` : '<div class="empty compact" id="memberHousePhotoEmpty">Foto rumah belum tersedia.</div><img class="member-house-photo-large" id="memberHousePhotoPreview" alt="Preview foto rumah" hidden>'}
            ${editable ? `
              <div class="photo-upload-actions">
                <button class="ghost-button compact" type="button" data-file-trigger="memberHousePhotoUpload" data-file-mode="gallery"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> Pilih File</button>
                <button class="ghost-button compact primary" type="button" data-file-trigger="memberHousePhotoUpload" data-file-mode="camera"><i class="fa-solid fa-camera" aria-hidden="true"></i> Kamera</button>
              </div>
              <input class="sr-only member-photo-file-input" name="housePhotoUpload" id="memberHousePhotoUpload" type="file" accept="image/png,image/jpeg,image/webp">
            ` : ''}
          </div>
          <div class="member-ktp-photo-card">
            <div class="member-photo-card-head">
              <strong>Foto KTP</strong>
              ${editable && ktpPhotoUrl ? '<button class="ghost-button compact danger" id="memberRemoveKtpPhoto" type="button">Hapus</button>' : ''}
            </div>
            ${ktpPhotoUrl ? `<img class="member-ktp-photo-large" id="memberKtpPhotoPreview" src="${escapeHtml(ktpPhotoUrl)}" alt="Foto KTP ${escapeHtml(memberTitle(member))}">` : '<div class="empty compact" id="memberKtpPhotoEmpty">Foto KTP belum tersedia.</div><img class="member-ktp-photo-large" id="memberKtpPhotoPreview" alt="Preview foto KTP" hidden>'}
            ${editable ? `
              <div class="photo-upload-actions">
                <button class="ghost-button compact" type="button" data-file-trigger="memberKtpPhotoUpload" data-file-mode="gallery"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> Pilih File</button>
                <button class="ghost-button compact primary" type="button" data-file-trigger="memberKtpPhotoUpload" data-file-mode="camera"><i class="fa-solid fa-camera" aria-hidden="true"></i> Kamera</button>
              </div>
              <input class="sr-only member-photo-file-input" id="memberKtpPhotoUpload" type="file" accept="image/png,image/jpeg,image/webp">
              <input id="memberKtpPhotoValue" type="hidden" value="">
              <p class="muted" id="memberKtpUploadStatus">Upload KTP akan mencoba membaca Nomor KTP dan nama otomatis.</p>
            ` : ''}
          </div>
        </div>
      </section>
      <section class="member-edit-section" data-member-detail-panel="payment" hidden>
        <div class="section-head compact">
          <h2>Payment Detail</h2>
          <span class="muted">Ringkasan payment member.</span>
        </div>
        ${memberReadonlyRows([
          ['Payment Type', memberPaymentTypeLabel(payment.paymentType || member.paymentType)],
          ['Billing Period', memberBillingPeriodLabel(payment.billingPeriod || member.billingPeriod)],
          ['Next Invoice', dateText(payment.nextDue || member.nextDue || member.dueDate) || '-'],
          ['Harga', payment.price || member.price ? rupiah(payment.price || member.price) : '-'],
          ['Add-on', memberAddonsDisplay(payment.addOns || payment.addons || member.addOns || member.addons)],
          ['VAT/PPN', payment.ppn || member.ppn || '-'],
          ['Diskon', memberDiscountDisplay(payment.discount || member.discount)]
        ])}
      </section>
      <section class="member-edit-section" data-member-detail-panel="internet" hidden>
        <div class="section-head compact">
          <h2>Internet Detail</h2>
          <span class="muted">Readonly dari data Radius.</span>
        </div>
        ${memberReadonlyRows([
          ['Username', internet.username || member.username || member.internet],
          ['Type', internetAccessTypeLabel(internet)],
          ['Profile', internet.profile || member.packageName],
          ['NAS', internet.nas || member.siteName],
          ['IP Address', internet.ipAddress],
          ['MAC', internet.macAddress],
          ['Status', radiusStatusLabel(internet.status || member.status)]
        ])}
      </section>
      <section class="member-edit-section" data-member-detail-panel="usage" hidden>
        <div class="section-head compact">
          <h2>Total Usage</h2>
          <span class="muted">Total bulanan dari FreeRADIUS radacct.</span>
        </div>
        ${usageDetailPanel(usage)}
      </section>
      <section class="member-edit-section" data-member-detail-panel="invoice" hidden>
        <div class="section-head compact">
          <h2>Invoice Detail</h2>
          <span class="muted">Invoice terakhir member.</span>
        </div>
        ${memberInvoiceDetailRows(invoices)}
      </section>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Tutup</button>
        ${editable ? '<button class="button" type="submit" data-member-contact-submit>Simpan Contact</button>' : ''}
      </div>
    </div>
  `;
}

function paymentTypeValue(value) {
  const normalized = String(value || '').toLowerCase();
  if (['1', 'postpaid', 'post paid'].includes(normalized)) return 'postpaid';
  if (['2', 'prepaid', 'pre paid'].includes(normalized)) return 'prepaid';
  return 'postpaid';
}

function billingPeriodValue(value) {
  const normalized = String(value || '').toLowerCase();
  if (['1', 'fixed', 'fixed-date', 'fixed date'].includes(normalized)) return 'fixed';
  if (['2', 'cycle', 'billing-cycle', 'billing cycle'].includes(normalized)) return 'cycle';
  if (['3', 'renewal', 'renew'].includes(normalized)) return 'renewal';
  return 'fixed';
}

function billingPeriodOptionsForPaymentType(paymentType = 'postpaid', includeAll = false) {
  const type = paymentTypeValue(paymentType || 'postpaid');
  const options = type === 'prepaid'
    ? [['fixed', 'Fixed Date'], ['renewal', 'Renewal']]
    : [['fixed', 'Fixed Date'], ['cycle', 'Billing Cycle']];
  return includeAll ? [['all', 'Semua periode'], ...options] : options;
}

function normalizeBillingPeriodForPaymentType(period = 'fixed', paymentType = 'postpaid') {
  const allowed = billingPeriodOptionsForPaymentType(paymentType).map(([value]) => value);
  const normalized = billingPeriodValue(period);
  return allowed.includes(normalized) ? normalized : 'fixed';
}

function billingPeriodOptionTags(paymentType = 'postpaid', selected = 'fixed', includeAll = false) {
  const normalized = includeAll && selected === 'all'
    ? 'all'
    : normalizeBillingPeriodForPaymentType(selected, paymentType);
  return billingPeriodOptionsForPaymentType(paymentType, includeAll)
    .map(([value, label]) => `<option value="${value}" ${normalized === value ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function syncBillingPeriodSelect(paymentTypeSelect, billingPeriodSelect, includeAll = false) {
  if (!billingPeriodSelect) return;
  const paymentType = paymentTypeSelect?.value || 'postpaid';
  const current = billingPeriodSelect.value || (includeAll ? 'all' : 'fixed');
  billingPeriodSelect.innerHTML = billingPeriodOptionTags(paymentType, current, includeAll);
}

function paymentModalBody(member = {}, payment = {}, editable = false) {
  const disabled = editable ? '' : 'disabled';
  const paymentType = paymentTypeValue(payment.paymentType || member.paymentType);
  const billingPeriod = normalizeBillingPeriodForPaymentType(payment.billingPeriod || member.billingPeriod, paymentType);
  return `
    <div class="member-edit-card">
      ${memberEditHeader(member, payment)}
      <div class="member-edit-section">
        <div class="section-head compact">
          <h2>Payment Detail</h2>
          <span class="muted">${editable ? 'Atur tipe pembayaran, periode billing, dan invoice berikutnya.' : 'Mode lihat detail.'}</span>
        </div>
        <div class="form-grid member-edit-form">
          <label>Tipe Pembayaran
            <select name="paymentType" ${disabled}>
              <option value="postpaid" ${paymentType === 'postpaid' ? 'selected' : ''}>Postpaid</option>
              <option value="prepaid" ${paymentType === 'prepaid' ? 'selected' : ''}>Prepaid</option>
            </select>
          </label>
          <label>Periode Billing
            <select name="billingPeriod" ${disabled}>
              ${billingPeriodOptionTags(paymentType, billingPeriod)}
            </select>
          </label>
          <div class="field">
            <span>Next Invoice (khusus Fixed)</span>
            ${datePickerControl({ name: 'nextDue', value: payment.nextDue || member.nextDue || member.dueDate, required: true, disabled: !editable })}
            ${editable ? '<small class="muted" data-next-invoice-hint>Perubahan berlaku mulai invoice berikutnya. Invoice yang sudah terbit tetap.</small>' : ''}
          </div>
          <label>Harga
            <input value="${escapeHtml(payment.price || (member.price ? rupiah(member.price) : '-'))}" disabled>
          </label>
          <label>PPN (%)
            <input name="ppn" type="number" min="0" max="100" step="0.01" value="${escapeHtml(memberPercentInput(payment.ppn || member.ppn))}" ${disabled}>
          </label>
          <label>Diskon (Rp)
            <input name="discount" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(memberNumberInput(payment.discount || member.discount))}" ${disabled}>
          </label>
          <label class="field span-2 checkbox-field">
            <input name="billingIsolationOverride" type="checkbox" value="true" ${(payment.billingIsolationOverride || member.billingIsolationOverride) ? 'checked' : ''} ${disabled}>
            <span>Dikecualikan dari isolir otomatis</span>
            <small class="muted">Default tidak aktif. Gunakan hanya untuk pelanggan yang mendapat kebijakan khusus; invoice dan reminder tetap berjalan.</small>
          </label>
          <div class="field span-2 member-addon-editor">
            <input type="hidden" name="memberAddons" value="[]">
            <div class="batch-toolbar compact">
              <span>Add-on layanan bulanan.</span>
              ${editable ? '<button class="ghost-button compact" type="button" data-add-member-addon>Tambah Add-on</button>' : ''}
            </div>
            <div class="batch-rows member-addon-rows" data-member-addon-rows></div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Tutup</button>
        ${editable ? '<button class="button" type="submit" data-member-payment-submit>Simpan Payment</button>' : ''}
      </div>
    </div>
  `;
}

async function openMemberContactModal(member = {}) {
  const editable = canAny(['customers:manage', 'members:contact:write']);
  const payload = await loadMemberDetail(member, 'all');
  const contact = payload.contact || {};
  openModal(editable ? 'Edit Contact Detail' : 'Contact Detail', contactModalBody(member, contact, editable, payload), async (formPayload, form) => {
    if (!editable) return;
    const submit = form.querySelector('[data-member-contact-submit]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Menyimpan...';
    }
    try {
      const housePhotoFile = form.querySelector('#memberHousePhotoUpload')?.files?.[0];
      if (housePhotoFile) {
        formPayload.housePhotoUrl = await uploadImageFile(housePhotoFile, 'member-house', { label: 'Foto rumah' });
      }
      delete formPayload.housePhotoUpload;
      const ktpPhotoFile = form.querySelector('#memberKtpPhotoUpload')?.files?.[0];
      const ktpPhotoValue = form.querySelector('#memberKtpPhotoValue')?.value || '';
      const typedKtp = String(formPayload.ktp || '').trim();
      const typedKtpName = String(formPayload.ktpName || '').trim();
      const typedFullName = String(formPayload.fullName || '').trim();
      if (ktpPhotoFile) {
        const ktpUpload = await uploadMemberKtpFile(ktpPhotoFile, { label: 'Foto KTP' });
        formPayload.ktpPhoto = JSON.stringify(ktpUpload?.storedPhoto || ktpUpload?.photo || {});
        if (!typedKtp && ktpUpload?.ktp) {
          formPayload.ktp = ktpUpload.ktp;
        }
        if (!typedKtpName && ktpOcrName(ktpUpload)) {
          formPayload.ktpName = ktpOcrName(ktpUpload);
        }
        const nameDecision = ktpOcrNameDecision(typedFullName || formPayload.fullName || '', ktpOcrName(ktpUpload));
        if (!typedFullName && nameDecision.shouldReplace) {
          formPayload.fullName = ktpOcrName(ktpUpload);
        }
      } else if (ktpPhotoValue) {
        formPayload.ktpPhoto = ktpPhotoValue;
      }
      if (form.dataset.removeKtpPhoto === '1') {
        formPayload.removeKtpPhoto = true;
      }
      const result = await api('/api/monitoring/member-contact', {
        method: 'PUT',
        body: JSON.stringify({
          memberId: memberId(member),
          ...formPayload
        })
      });
      setToast(result.message || 'Contact detail berhasil diperbarui');
      await renderMonitoringMembers({ refresh: true });
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Simpan Contact';
      }
    }
  });
  bindMemberDetailModal(payload);
}

function bindMemberDetailModal(detail = {}) {
  const tabButtons = [...modalBody.querySelectorAll('[data-member-detail-tab]')];
  const panels = [...modalBody.querySelectorAll('[data-member-detail-panel]')];
  const activate = (tab = 'contact') => {
    tabButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.memberDetailTab === tab));
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.memberDetailPanel !== tab;
    });
    if (tab === 'contact') {
      window.setTimeout(initMemberContactMap, 60);
    }
    modalBody.scrollTop = 0;
    modal.querySelector('.modal-frame').scrollTop = 0;
    scheduleTableTopScrollbars(modalBody);
  };
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => activate(button.dataset.memberDetailTab || 'contact'));
  });
  bindPhotoInputTriggers(modalBody);
  const upload = modalBody.querySelector('#memberHousePhotoUpload');
  upload?.addEventListener('change', async () => {
    try {
      const preview = modalBody.querySelector('#memberHousePhotoPreview');
      const empty = modalBody.querySelector('#memberHousePhotoEmpty');
      const uploaded = await readImageFile(upload.files?.[0], { label: 'Foto rumah' });
      if (!uploaded || !preview) return;
      preview.src = uploaded;
      preview.hidden = false;
      if (empty) empty.hidden = true;
    } catch (error) {
      upload.value = '';
      setToast(error.message);
    }
  });
  const ktpUpload = modalBody.querySelector('#memberKtpPhotoUpload');
  ktpUpload?.addEventListener('change', async () => {
    const file = ktpUpload.files?.[0];
    if (!file) return;
    try {
      const preview = modalBody.querySelector('#memberKtpPhotoPreview');
      const empty = modalBody.querySelector('#memberKtpPhotoEmpty');
      const status = modalBody.querySelector('#memberKtpUploadStatus');
      const previewData = await readImageFile(file, { label: 'Foto KTP' });
      if (preview && previewData) {
        preview.src = previewData;
        preview.hidden = false;
      }
      if (empty) empty.hidden = true;
      if (status) status.textContent = 'Mengupload dan membaca NIK serta nama dari KTP...';
      const result = await uploadMemberKtpFile(file, { label: 'Foto KTP' });
      const hidden = modalBody.querySelector('#memberKtpPhotoValue');
      if (hidden) hidden.value = JSON.stringify(result?.storedPhoto || result?.photo || {});
      const form = modal.querySelector('.modal-frame');
      if (form) form.dataset.removeKtpPhoto = '0';
      const ktpInput = modalBody.querySelector('[name="ktp"]');
      if (result?.ktp && ktpInput) {
        ktpInput.value = result.ktp;
      }
      const ktpNameInput = modalBody.querySelector('[name="ktpName"]');
      const ocrName = ktpOcrName(result);
      if (ktpNameInput && ocrName) ktpNameInput.value = ocrName;
      const nameDecision = fillKtpOcrNameInput(modalBody.querySelector('[name="fullName"]'), result);
      if (status) {
        status.textContent = ktpOcrStatusText(result, nameDecision);
      }
    } catch (error) {
      ktpUpload.value = '';
      setToast(error.message);
    }
  });
  modalBody.querySelector('#memberRemoveKtpPhoto')?.addEventListener('click', () => {
    const form = modal.querySelector('.modal-frame');
    if (form) form.dataset.removeKtpPhoto = '1';
    const preview = modalBody.querySelector('#memberKtpPhotoPreview');
    const empty = modalBody.querySelector('#memberKtpPhotoEmpty');
    const hidden = modalBody.querySelector('#memberKtpPhotoValue');
    const status = modalBody.querySelector('#memberKtpUploadStatus');
    if (preview) {
      preview.hidden = true;
      preview.removeAttribute('src');
    }
    if (empty) {
      empty.hidden = false;
      empty.textContent = 'Foto KTP akan dihapus saat contact disimpan.';
    }
    if (hidden) hidden.value = '';
    if (status) status.textContent = 'Foto KTP akan dihapus saat contact disimpan.';
  });
  const syncLocationButton = modalBody.querySelector('#memberSyncLocation');
  syncLocationButton?.addEventListener('click', async () => {
    const status = modalBody.querySelector('#memberLocationSyncStatus');
    syncLocationButton.disabled = true;
    if (status) status.textContent = 'Menyinkronkan lokasi perangkat...';
    try {
      const position = await currentBrowserPosition();
      const coords = position.coords || {};
      const latitude = Number(coords.latitude || 0).toFixed(7);
      const longitude = Number(coords.longitude || 0).toFixed(7);
      const latitudeInput = modalBody.querySelector('[name="latitude"]');
      const longitudeInput = modalBody.querySelector('[name="longitude"]');
      const accuracyInput = modalBody.querySelector('[name="locationAccuracy"]');
      if (latitudeInput) latitudeInput.value = latitude;
      if (longitudeInput) longitudeInput.value = longitude;
      if (accuracyInput) accuracyInput.value = coords.accuracy ? String(Math.round(coords.accuracy)) : '';
      initMemberContactMap();
      modalBody.querySelector('#memberContactLeafletMap')?._memberSetPoint?.(latitude, longitude);
      const label = modalBody.querySelector('#memberLocationPreviewLabel');
      const coordinate = modalBody.querySelector('#memberLocationPreviewCoordinate');
      if (label) label.textContent = 'Preview koordinat pelanggan';
      if (coordinate) coordinate.textContent = `${latitude}, ${longitude}`;
      if (status) status.textContent = `Lokasi tersinkron${coords.accuracy ? ` dengan akurasi ${Math.round(coords.accuracy)}m` : ''}.`;
    } catch (error) {
      if (status) status.textContent = error.message || 'Lokasi browser tidak dapat diambil.';
    } finally {
      syncLocationButton.disabled = false;
    }
  });
  const invoices = Array.isArray(detail.invoices) ? detail.invoices : [];
  modalBody.querySelectorAll('[data-member-invoice-pay]').forEach((button) => {
    button.addEventListener('click', () => {
      const invoice = invoices[Number(button.dataset.memberInvoicePay || -1)];
      if (invoice) openBillingPayModal(invoice);
    });
  });
  initMemberContactMap();
}

function initMemberContactMap() {
  const mapEl = modalBody.querySelector('#memberContactLeafletMap');
  if (!mapEl || mapEl._memberMap || mapEl.closest('[hidden]')) return;
  if (!window.L) {
    ensureLeafletLoaded().then((loaded) => {
      if (loaded) initMemberContactMap();
    });
    return;
  }
  const latitude = Number(modalBody.querySelector('[name="latitude"]')?.value || 0);
  const longitude = Number(modalBody.querySelector('[name="longitude"]')?.value || 0);
  const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0;
  const map = window.L.map(mapEl, { zoomControl: true }).setView(hasPoint ? [latitude, longitude] : [-2.5489, 118.0149], hasPoint ? 17 : 5);
  mapEl._memberMap = map;
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  const latitudeInput = modalBody.querySelector('[name="latitude"]');
  const longitudeInput = modalBody.querySelector('[name="longitude"]');
  const editable = Boolean(latitudeInput && longitudeInput && !latitudeInput.disabled && !longitudeInput.disabled);
  let marker = hasPoint ? window.L.marker([latitude, longitude], { draggable: editable }).addTo(map) : null;
  const updatePreview = (lat, lng) => {
    const label = modalBody.querySelector('#memberLocationPreviewLabel');
    const coordinate = modalBody.querySelector('#memberLocationPreviewCoordinate');
    if (label) label.textContent = 'Preview koordinat pelanggan';
    if (coordinate) coordinate.textContent = `${lat}, ${lng}`;
  };
  const bindMarkerDrag = () => {
    if (!editable || !marker || marker._memberDragBound) return;
    marker._memberDragBound = true;
    marker.on('dragend', () => {
      const point = marker.getLatLng();
      const lat = Number(point.lat || 0).toFixed(7);
      const lng = Number(point.lng || 0).toFixed(7);
      latitudeInput.value = lat;
      longitudeInput.value = lng;
      updatePreview(lat, lng);
      const status = modalBody.querySelector('#memberLocationSyncStatus');
      if (status) status.textContent = 'Titik lokasi diperbarui dari marker peta.';
    });
  };
  const setPoint = (lat, lng) => {
    const point = [Number(lat), Number(lng)];
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
    if (!marker) marker = window.L.marker(point, { draggable: editable }).addTo(map);
    bindMarkerDrag();
    marker.setLatLng(point);
    map.setView(point, 17);
    updatePreview(Number(point[0]).toFixed(7), Number(point[1]).toFixed(7));
  };
  mapEl._memberSetPoint = setPoint;
  bindMarkerDrag();
  if (editable) {
    map.on('click', (event) => {
      const lat = Number(event.latlng?.lat || 0).toFixed(7);
      const lng = Number(event.latlng?.lng || 0).toFixed(7);
      latitudeInput.value = lat;
      longitudeInput.value = lng;
      const accuracyInput = modalBody.querySelector('[name="locationAccuracy"]');
      if (accuracyInput) accuracyInput.value = '';
      setPoint(lat, lng);
      const status = modalBody.querySelector('#memberLocationSyncStatus');
      if (status) status.textContent = 'Titik lokasi dipilih dari peta.';
    });
  }
  ['latitude', 'longitude'].forEach((name) => {
    modalBody.querySelector(`[name="${name}"]`)?.addEventListener('input', () => {
      const lat = modalBody.querySelector('[name="latitude"]')?.value || '';
      const lng = modalBody.querySelector('[name="longitude"]')?.value || '';
      if (lat && lng) setPoint(lat, lng);
    });
  });
  window.setTimeout(() => map.invalidateSize(), 80);
}

async function openMemberPaymentModal(member = {}) {
  const editable = can('customers:manage');
  const payload = await loadMemberDetail(member, 'payment');
  const payment = payload.payment || {};
  openModal(editable ? 'Edit Payment Detail' : 'Payment Detail', paymentModalBody(member, payment, editable), async (formPayload, form) => {
    if (!editable) return;
    const submit = form.querySelector('[data-member-payment-submit]');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Menyimpan...';
    }
    try {
      const fixedSchedule = billingPeriodValue(formPayload.billingPeriod || payment.billingPeriod) === 'fixed';
      const nextDue = normalizeMemberDateDisplayInput(formPayload.nextDue || payment.nextDue || member.nextDue || member.dueDate);
      if (fixedSchedule && !nextDue) {
        throw new Error('Tanggal Next Invoice belum valid');
      }
      const result = await api('/api/monitoring/member-payment', {
        method: 'PUT',
        body: JSON.stringify({
          memberId: memberId(member),
          ...formPayload,
          billingIsolationOverride: formPayload.billingIsolationOverride === true,
          memberAddons: JSON.stringify(collectMemberAddons(form)),
          nextDue
        })
      });
      setToast(result.message || 'Payment detail berhasil diperbarui');
      await renderMonitoringMembers({ refresh: true });
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = 'Simpan Payment';
      }
    }
  });
  const paymentTypeSelect = modalBody.querySelector('select[name="paymentType"]');
  const billingPeriodSelect = modalBody.querySelector('select[name="billingPeriod"]');
  bindMemberAddonRows(modal.querySelector('.modal-frame'), payment.addOns || payment.addons || member.addOns || member.addons || []);
  if (!editable) {
    modalBody.querySelectorAll('[data-member-addon-field], [data-remove-member-addon]').forEach((field) => {
      field.disabled = true;
    });
  }
  const syncScheduleFields = () => {
    const fixedSchedule = billingPeriodValue(billingPeriodSelect?.value) === 'fixed';
    const picker = modalBody.querySelector('[name="nextDue"]')?.closest('[data-date-picker]');
    picker?.querySelectorAll('[data-date-picker-value], [data-date-picker-toggle]').forEach((control) => {
      control.disabled = !fixedSchedule;
    });
    const hint = modalBody.querySelector('[data-next-invoice-hint]');
    if (hint) {
      hint.textContent = fixedSchedule
        ? 'Perubahan berlaku mulai invoice berikutnya. Invoice yang sudah terbit tetap.'
        : 'Billing Cycle mengikuti tanggal global di Radius > Setting.';
    }
  };
  const syncPaymentMode = () => {
    syncBillingPeriodSelect(paymentTypeSelect, billingPeriodSelect);
    syncScheduleFields();
  };
  syncPaymentMode();
  paymentTypeSelect?.addEventListener('change', syncPaymentMode);
  billingPeriodSelect?.addEventListener('change', syncScheduleFields);
}

async function printMonitoringMembersReport() {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Popup print diblokir browser');
  printWindow.document.write('<!doctype html><title>Memuat laporan member</title><body>Memuat data...</body>');
  const params = queryString({
    status: state.monitoringMemberStatus,
    paymentType: state.monitoringMemberPaymentType,
    billingPeriod: state.monitoringMemberBillingPeriod,
    newCustomer: state.monitoringMemberNewCustomer,
    nas: state.monitoringMemberNas,
    periodMode: state.monitoringMemberPeriod,
    from: state.monitoringMemberFrom,
    to: state.monitoringMemberTo,
    creator: state.monitoringMemberCreator,
    search: state.search,
    page: 1,
    limit: 'all',
    sort: 'az'
  });
  const payload = await api(`/api/monitoring/members?${params}`);
  const members = Array.isArray(payload.members) ? payload.members : [];
  const branding = currentBranding();
  const title = state.monitoringMemberNewCustomer === 'new' ? 'Laporan Pelanggan Baru' : 'Laporan Member';
  const rows = members.length ? members.map((member, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(dateText(member.registeredDate || member.activeDate || member.createdAt || ''))}</td>
      <td>${escapeHtml(member.fullName || member.customerName || '-')}</td>
      <td>${escapeHtml(member.memberId || member.userId || member.accountId || '-')}</td>
      <td>${escapeHtml(member.internet || member.username || '-')}</td>
      <td>${escapeHtml(member.whatsapp || member.phone || '-')}</td>
      <td>${escapeHtml(member.packageName || '-')}</td>
      <td>${escapeHtml(rupiah(member.price || 0))}</td>
      <td>${escapeHtml(memberStatusLabel(member.status || member.serviceStatus))}</td>
      <td>${escapeHtml(member.creatorLabel || member.createdByName || member.createdByUsername || '-')}</td>
    </tr>
  `).join('') : '<tr><td colspan="10">Tidak ada data.</td></tr>';
  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(branding.businessName)} - ${escapeHtml(title)}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
          .head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
          .head img { width: 44px; height: 44px; object-fit: contain; }
          .head strong { display: block; font-size: 18px; }
          .head span { color: #475569; font-size: 12px; }
          h1 { margin: 0 0 10px; font-size: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #d1d5db; padding: 5px 6px; text-align: left; vertical-align: top; }
          th { background: #0f4f82; color: #fff; white-space: nowrap; }
          td { word-break: normal; overflow-wrap: anywhere; }
        </style>
      </head>
      <body>
        <div class="head">
          <img src="${escapeHtml(branding.logoUrl)}" alt="">
          <div>
            <strong>${escapeHtml(branding.businessName)}</strong>
            <span>${escapeHtml(branding.appSubtitle || '')}</span>
          </div>
        </div>
        <h1>${escapeHtml(title)}</h1>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Registrasi</th>
              <th>Nama</th>
              <th>Member ID</th>
              <th>Username</th>
              <th>Whatsapp</th>
              <th>Paket</th>
              <th>Harga</th>
              <th>Status</th>
              <th>Pembuat</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 300);
}

async function renderMonitoringMembers(options = {}) {
  clearRealtimeTimers();
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat member...</div>';
  const params = queryString({
    status: state.monitoringMemberStatus,
    paymentType: state.monitoringMemberPaymentType,
    billingPeriod: state.monitoringMemberBillingPeriod,
    newCustomer: state.monitoringMemberNewCustomer,
    nas: state.monitoringMemberNas,
    periodMode: 'all',
    from: '',
    to: '',
    creator: 'all',
    search: state.search,
    page: state.monitoringMemberPage,
    limit: state.monitoringMemberLimit,
    refresh: options.refresh ? 1 : 0
  });
  const payload = await api(`/api/monitoring/members?${params}`);
  const members = Array.isArray(payload.members) ? payload.members : [];
  const nasOptions = Array.isArray(payload.nasOptions) ? payload.nasOptions : [];
  const pagination = payload.pagination || { page: 1, limit: state.monitoringMemberLimit, total: members.length, totalPages: 1 };
  const summary = payload.summary || {
    total: pagination.total || 0,
    prepaidFixed: 0,
    prepaidRenewal: 0,
    postpaidFixed: 0,
    postpaidCycle: 0
  };
  state.monitoringMemberPage = Number(pagination.page || 1);
  state.monitoringMemberLimit = pagerLimitValue(pagination.limit || state.monitoringMemberLimit || 10, 10);
  const contactEditable = canAny(['customers:manage', 'members:contact:write']);
  const paymentEditable = can('customers:manage');
  const rows = members.length ? members.map((member, index) => {
    const id = memberId(member);
    const contactText = member.whatsapp || member.phone || '-';
    const paymentText = `${memberPaymentTypeLabel(member.paymentType || member.type)} / ${memberBillingPeriodLabel(member.billingPeriod || member.method)}`;
    const addOnText = memberAddonsDisplay(member.addOns || member.addons);
    const mapUrl = memberLocationUrl(member);
    const titleText = memberTitle(member);
    const internetText = member.internet || member.username || '';
    const showInternetLine = internetText && !sameMemberText(titleText, internetText);
    const creatorText = memberCreatorText(member);
    const dataValidation = memberDataValidationState(member);
    const dateLines = [
      member.registeredDate ? `Registrasi ${dateText(member.registeredDate)}` : '',
      member.activeDate ? `Aktif ${dateText(member.activeDate)}` : '',
      (member.nextDue || member.dueDate) ? `Next ${dateText(member.nextDue || member.dueDate)}` : ''
    ].filter(Boolean);
    return `
      <tr>
        <td>
          <div class="cell-stack">
            <strong class="cell-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</strong>
            <span class="cell-subline member-id-line" title="${escapeHtml(memberDisplayId(member))}">
              <b>${escapeHtml(memberDisplayId(member))}</b>
            </span>
            ${showInternetLine ? `<span class="cell-subline" title="${escapeHtml(internetText)}">${escapeHtml(internetText)}</span>` : ''}
            ${creatorText ? `<span class="cell-subline muted" title="${escapeHtml(creatorText)}">${escapeHtml(creatorText)}</span>` : ''}
          </div>
        </td>
        <td>
          <div class="cell-stack">
            <strong class="cell-title" title="${escapeHtml(contactText)}">${escapeHtml(contactText)}</strong>
            ${member.address ? `<span class="cell-subline clamp-2" title="${escapeHtml(member.address)}">${escapeHtml(member.address)}</span>` : '<span class="cell-subline">-</span>'}
            <a class="cell-subline cell-map-link" href="${escapeHtml(mapUrl || '#')}" data-member-location="${index}">Lihat Peta</a>
          </div>
        </td>
        <td>
          <div class="cell-stack">
            <strong class="cell-title">${escapeHtml(paymentText)}</strong>
            <span class="cell-subline">${member.price ? escapeHtml(rupiah(member.price)) : '-'}</span>
            ${addOnText !== '-' ? `<span class="cell-subline">${escapeHtml(addOnText)}</span>` : ''}
          </div>
        </td>
        <td>
          <div class="member-status-stack">
            <span class="badge ${memberStatusBadge(member.status || member.serviceStatus)}">${escapeHtml(memberStatusLabel(member.status || member.serviceStatus))}</span>
            <button class="member-data-validation-badge ${dataValidation.valid ? 'is-valid' : 'is-invalid'}" type="button" data-member-validation="${index}">
              ${dataValidation.valid ? 'Data Valid' : 'Belum Valid'}
            </button>
          </div>
        </td>
        <td class="member-date-cell">
          ${dateLines.length
            ? `<div class="cell-stack member-date-lines">${dateLines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</div>`
            : '<span class="muted">-</span>'}
        </td>
        <td>
          <div class="row-actions compact-actions">
            <button class="ghost-button compact" type="button" data-member-contact="${index}" ${id ? '' : 'disabled'}>${contactEditable ? 'Edit Contact' : 'Contact'}</button>
            <button class="ghost-button compact" type="button" data-member-payment="${index}" ${id ? '' : 'disabled'}>${paymentEditable ? 'Edit Payment' : 'Payment'}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="6">Tidak ada member sesuai filter.</td></tr>';

  const statusLabels = {
    all: 'Semua status',
    active: 'Aktif',
    suspend: 'Isolir',
    terminate: 'Terminated'
  };
  const paymentLabels = {
    all: 'Semua tipe',
    prepaid: 'Prepaid',
    postpaid: 'Postpaid'
  };

  app.innerHTML = `
    <div class="stack">
      ${payload.ok ? '' : `
        <section class="notice error">
          <strong>Data member belum bisa dibaca</strong>
          <span>${escapeHtml(payload.error || 'Endpoint member belum mengembalikan data.')}</span>
        </section>
      `}

      <section class="metrics member-summary-metrics">
        ${metric('Total', displayNumber(summary.total || 0), 'Semua member')}
        ${metric('Prepaid Fixed', displayNumber(summary.prepaidFixed || 0), 'Prepaid fixed')}
        ${metric('Prepaid Renewal', displayNumber(summary.prepaidRenewal || 0), 'Prepaid renewal')}
        ${metric('Postpaid Fixed', displayNumber(summary.postpaidFixed || 0), 'Postpaid fixed')}
        ${metric('Postpaid Cycle', displayNumber(summary.postpaidCycle || 0), 'Postpaid cycle')}
      </section>

      <div class="toolbar">
        <div class="filters">
          <select class="control" id="memberStatusFilter" aria-label="Filter status member">
            <option value="all" ${state.monitoringMemberStatus === 'all' ? 'selected' : ''}>Semua status</option>
            <option value="active" ${state.monitoringMemberStatus === 'active' ? 'selected' : ''}>Aktif</option>
            <option value="suspend" ${state.monitoringMemberStatus === 'suspend' ? 'selected' : ''}>Isolir</option>
            <option value="terminate" ${state.monitoringMemberStatus === 'terminate' ? 'selected' : ''}>Terminated</option>
          </select>
          <select class="control" id="memberPaymentTypeFilter" aria-label="Filter tipe pembayaran">
            <option value="all" ${state.monitoringMemberPaymentType === 'all' ? 'selected' : ''}>Semua tipe</option>
            <option value="prepaid" ${state.monitoringMemberPaymentType === 'prepaid' ? 'selected' : ''}>Prepaid</option>
            <option value="postpaid" ${state.monitoringMemberPaymentType === 'postpaid' ? 'selected' : ''}>Postpaid</option>
          </select>
          <select class="control" id="memberBillingPeriodFilter" aria-label="Filter periode billing">
            ${state.monitoringMemberPaymentType === 'all'
              ? [
                ['all', 'Semua periode'],
                ['fixed', 'Fixed Date'],
                ['cycle', 'Billing Cycle'],
                ['renewal', 'Renewal']
              ].map(([value, label]) => `<option value="${value}" ${state.monitoringMemberBillingPeriod === value ? 'selected' : ''}>${label}</option>`).join('')
              : billingPeriodOptionTags(state.monitoringMemberPaymentType, state.monitoringMemberBillingPeriod, true)}
          </select>
          <select class="control" id="memberNewCustomerFilter" aria-label="Filter pelanggan baru">
            <option value="all" ${state.monitoringMemberNewCustomer === 'all' ? 'selected' : ''}>Semua pelanggan</option>
            <option value="new" ${state.monitoringMemberNewCustomer === 'new' ? 'selected' : ''}>Pelanggan Baru</option>
          </select>
          <select class="control" id="memberNasFilter" aria-label="Filter NAS member">
            ${voucherReportOptionTags(nasOptions, state.monitoringMemberNas || 'all', 'Semua NAS')}
          </select>
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari nama, UID, PPPoE, WA, validasi" autocomplete="off">
        </div>
        <div class="row-actions">
          <button class="ghost-button compact" id="exportMembersXlsx" type="button">Export XLSX</button>
          <button class="ghost-button compact" id="printMembersPdf" type="button">Print PDF</button>
          <button class="ghost-button compact" id="refreshMembers" type="button">Refresh</button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="billing-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Contact</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Tanggal</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${memberPaginationControls(pagination)}
    </div>
  `;

  document.getElementById('memberStatusFilter')?.addEventListener('change', (event) => {
    state.monitoringMemberStatus = event.target.value || 'all';
    state.monitoringMemberPage = 1;
    renderMonitoringMembers();
  });
  document.getElementById('memberNewCustomerFilter')?.addEventListener('change', (event) => {
    state.monitoringMemberNewCustomer = event.target.value || 'all';
    state.monitoringMemberPage = 1;
    renderMonitoringMembers();
  });
  document.getElementById('memberPaymentTypeFilter')?.addEventListener('change', (event) => {
    state.monitoringMemberPaymentType = event.target.value || 'all';
    if (state.monitoringMemberPaymentType !== 'all' && state.monitoringMemberBillingPeriod !== 'all') {
      state.monitoringMemberBillingPeriod = normalizeBillingPeriodForPaymentType(
        state.monitoringMemberBillingPeriod,
        state.monitoringMemberPaymentType
      );
    }
    state.monitoringMemberPage = 1;
    renderMonitoringMembers();
  });
  document.getElementById('memberBillingPeriodFilter')?.addEventListener('change', (event) => {
    state.monitoringMemberBillingPeriod = event.target.value || 'all';
    state.monitoringMemberPage = 1;
    renderMonitoringMembers();
  });
  document.getElementById('memberNasFilter')?.addEventListener('change', (event) => {
    state.monitoringMemberNas = event.target.value || 'all';
    state.monitoringMemberPage = 1;
    renderMonitoringMembers();
  });
  document.getElementById('refreshMembers')?.addEventListener('click', () => renderMonitoringMembers({ refresh: true }));
  document.getElementById('exportMembersXlsx')?.addEventListener('click', async () => {
    try {
      const exportParams = queryString({
        status: state.monitoringMemberStatus,
        paymentType: state.monitoringMemberPaymentType,
        billingPeriod: state.monitoringMemberBillingPeriod,
        newCustomer: state.monitoringMemberNewCustomer,
        nas: state.monitoringMemberNas,
        periodMode: 'all',
        from: '',
        to: '',
        creator: 'all',
        search: state.search
      });
      await downloadFile(`/api/monitoring/members/export.xlsx?${exportParams}`, `pelanggan-baru-${todayInput()}.xlsx`);
    } catch (error) {
      setToast(error.message || 'Export member gagal');
    }
  });
  document.getElementById('printMembersPdf')?.addEventListener('click', async () => {
    try {
      await printMonitoringMembersReport();
    } catch (error) {
      setToast(error.message || 'Pratinjau PDF member gagal dibuat');
    }
  });
  bindSearch((renderOptions = {}) => {
    state.monitoringMemberPage = 1;
    return renderMonitoringMembers(renderOptions);
  });
  app.querySelectorAll('[data-member-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.monitoringMemberPage = Math.max(1, Number(button.dataset.memberPage || 1));
      renderMonitoringMembers();
    });
  });
  bindPagerLimit('member', (limit) => {
    state.monitoringMemberLimit = limit;
  }, (page) => {
    state.monitoringMemberPage = page;
  }, renderMonitoringMembers, 10);
  app.querySelectorAll('[data-member-location]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const member = members[Number(link.dataset.memberLocation || -1)];
      if (member) openCustomerLocationModal(member);
    });
  });
  app.querySelectorAll('[data-member-validation]').forEach((button) => {
    button.addEventListener('click', () => {
      const member = members[Number(button.dataset.memberValidation || -1)];
      if (member) openMemberDataValidationModal(member);
    });
  });
  app.querySelectorAll('[data-member-contact]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const member = members[Number(button.dataset.memberContact || -1)];
        await openMemberContactModal(member);
      } catch (error) {
        setToast(error.message || 'Contact detail member tidak bisa dibuka');
      }
    });
  });
  app.querySelectorAll('[data-member-payment]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const member = members[Number(button.dataset.memberPayment || -1)];
        await openMemberPaymentModal(member);
      } catch (error) {
        setToast(error.message || 'Payment detail member tidak bisa dibuka');
      }
    });
  });
}

function billingFilteredAmount(summary = {}) {
  if (summary.filteredAmount !== undefined && summary.filteredAmount !== null) {
    return Number(summary.filteredAmount || 0);
  }
  const status = String(state.monitoringBillingStatus || 'all').toLowerCase();
  if (status === 'paid') return Number(summary.paidAmount || 0);
  if (status === 'overdue') return Number(summary.overdueAmount || 0);
  if (status === 'all') return Number(summary.totalAmount || summary.unpaidAmount || 0);
  return Number(summary.unpaidAmount || 0);
}

function billingFilteredMetric(summary = {}) {
  if (summary.amountsHidden === true) return displayNumber(summary.filteredCount || 0);
  return `${displayNumber(summary.filteredCount || 0)} / ${rupiah(billingFilteredAmount(summary))}`;
}

function billingCountAmountMetric(count, amount, summary = {}) {
  if (summary.amountsHidden === true) return displayNumber(count || 0);
  return `${displayNumber(count || 0)} / ${rupiah(amount || 0)}`;
}

function billingPaidMetric(summary = {}) {
  const count = summary.periodPaidCount !== undefined ? summary.periodPaidCount : summary.paid;
  const amount = summary.periodPaidAmount !== undefined ? summary.periodPaidAmount : summary.paidAmount;
  return billingCountAmountMetric(count, amount, summary);
}

async function renderMonitoringBilling(options = {}) {
  clearRealtimeTimers();
  if (shouldShowPageLoading(options)) {
    app.innerHTML = '<div class="empty">Memuat tagihan pelanggan...</div>';
  }
  const billingPeriod = normalizedPeriod(state.monitoringBillingPeriod || state.period || todayInput().slice(0, 7));
  state.monitoringBillingPeriod = billingPeriod;
  saveMonitoringBillingPeriod(billingPeriod);
  const billingScope = ['month', 'arrears', 'collectible'].includes(String(state.monitoringBillingScope || '').toLowerCase())
    ? String(state.monitoringBillingScope || '').toLowerCase()
    : 'collectible';
  state.monitoringBillingScope = billingScope;
  const params = queryString({
    status: state.monitoringBillingStatus,
    customerStatus: state.monitoringBillingCustomerStatus,
    site: state.monitoringBillingSite,
    period: billingPeriod,
    scope: billingScope,
    search: state.search,
    page: state.monitoringBillingPage,
    limit: state.monitoringBillingLimit,
    refresh: options.refresh ? 1 : 0
  });
  const payload = await api(`/api/monitoring/billing-unpaid?${params}`);
  monitoringBillingRevision = String(payload.revision || monitoringBillingRevision || '');
  const summary = payload.summary || {};
  const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
  const sites = Array.isArray(payload.sites) ? payload.sites : [];
  const collectorBillingView = String(state.auth?.role || '').toLowerCase() === 'collector';
  const collectorScope = payload.collector || null;
  const collectorTargetLabel = collectorScope?.targetReady
    ? (collectorScope.targetNasName || collectorScope.targetNasAddress || 'NAS target')
    : 'NAS target belum diatur';
  const pagination = payload.pagination || { page: 1, totalPages: 1, total: invoices.length, limit: state.monitoringBillingLimit };
  const standaloneBilling = payload.source === 'local';
  const paymentGatewayEnabled = payload.paymentGatewayEnabled === true;
  state.monitoringBillingPage = Number(pagination.page || 1);
  state.monitoringBillingLimit = pagerLimitValue(pagination.limit || state.monitoringBillingLimit || 10, 10);
  const billingScopeLabel = billingScope === 'month'
    ? `Periode ${periodLabel(billingPeriod)}`
    : (billingScope === 'arrears' ? `Tunggakan s/d ${periodLabel(billingPeriod)}` : `Berjalan + tunggakan s/d ${periodLabel(billingPeriod)}`);
  const selectedSite = sites.find((site) => site.id === state.monitoringBillingSite);
  const customerStatusLabels = {
    all: 'Tagihan sesuai filter',
    active: 'Pelanggan aktif',
    isolated: 'Pelanggan isolir',
    terminate: 'Data terminated'
  };
  const filterLabel = selectedSite
    ? `${selectedSite.name}${state.monitoringBillingCustomerStatus !== 'all' ? ` - ${customerStatusLabels[state.monitoringBillingCustomerStatus] || state.monitoringBillingCustomerStatus}` : ''}`
    : (customerStatusLabels[state.monitoringBillingCustomerStatus] || 'Tagihan sesuai filter');
  const batchReminderAllowed = can('billing-monitor:read');
  const batchPayAllowed = can('invoices:manage');
  const batchCancelAllowed = can('invoices:manage') && ['admin', 'owner', 'finance'].includes(String(state.auth?.role || '').toLowerCase());

  const rows = invoices.length ? invoices.map((invoice, index) => {
    const customerName = invoice.customerName || invoice.accountId || invoice.username || '-';
    const displayedStatus = customerServiceLabel(invoice) === 'Isolir'
      ? 'Isolir'
      : billingStatusLabel(invoice.status);
    const displayedStatusBadge = displayedStatus === 'Isolir'
      ? customerServiceBadge(invoice)
      : billingStatusBadge(invoice.status);
    const customerMeta = invoice.accountId && invoice.username && invoice.accountId !== invoice.username
      ? `${invoice.accountId} / ${invoice.username}`
      : (invoice.accountId || invoice.username || '-');
    const address = invoice.address || '';
    const mapUrl = memberLocationUrl(invoice);
    const invoiceItem = invoice.item || invoice.subscribe || '';
    const invoiceLabel = billingInvoiceNo(invoice) || '-';
    return `
      <tr class="billing-row">
        <td>
          <input type="checkbox" data-billing-select="${index}" ${(billingReminderAllowed(invoice) || billingPayAllowed(invoice) || billingCancelAllowed(invoice)) ? '' : 'disabled'} aria-label="Pilih invoice ${escapeHtml(invoiceLabel)}">
        </td>
        <td>
          <div class="cell-stack">
            <strong class="cell-title" title="${escapeHtml(customerName)}">${escapeHtml(customerName)}</strong>
            <span class="cell-subline" title="${escapeHtml(customerMeta)}">${escapeHtml(customerMeta)}</span>
          </div>
        </td>
        <td class="site-cell"><span class="site-pill" title="${escapeHtml(invoice.siteName || 'Belum terdeteksi')}">${escapeHtml(invoice.siteName || '-')}</span></td>
        <td>
          <div class="cell-stack">
            <strong class="cell-title" title="${escapeHtml(invoice.phone || '-')}">${escapeHtml(invoice.phone || '-')}</strong>
            ${address ? `<span class="cell-subline clamp-2" title="${escapeHtml(address)}">${escapeHtml(address)}</span>` : '<span class="cell-subline">-</span>'}
            <a class="cell-subline cell-map-link" href="${escapeHtml(mapUrl || '#')}" data-billing-location="${index}">Lihat Peta</a>
          </div>
        </td>
        <td>
          <div class="cell-stack">
            <strong class="cell-title" title="${escapeHtml(invoiceLabel)}">${escapeHtml(invoiceLabel)}</strong>
            ${invoiceItem ? `<span class="cell-subline clamp-2" title="${escapeHtml(invoiceItem)}">${escapeHtml(invoiceItem)}</span>` : '<span class="cell-subline">-</span>'}
          </div>
        </td>
        <td class="nowrap">${dateText(invoice.dueDate || invoice.invoiceDate)}</td>
        <td class="nowrap">${invoice.lastActiveAt ? escapeHtml(billingLastActiveText(invoice)) : '<span class="muted">-</span>'}</td>
        <td class="amount nowrap">${rupiah(invoice.amount)}</td>
        <td class="billing-status-cell"><span class="badge ${displayedStatusBadge}">${escapeHtml(displayedStatus)}</span></td>
        <td class="billing-action-cell">
          ${billingActionButtons(invoice, index, standaloneBilling, paymentGatewayEnabled)}
        </td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="10">Tidak ada tagihan sesuai filter.</td></tr>';

  app.innerHTML = `
    <div class="stack">
      ${payload.ok ? '' : `
        <section class="notice error">
          <strong>Data tagihan belum bisa dibaca</strong>
          <span>${escapeHtml(payload.error || 'Endpoint tagihan belum mengembalikan data.')}</span>
        </section>
      `}

      <section class="billing-mobile-primary" aria-label="Pencarian dan status tagihan">
        <input class="control" id="billingMobileSearchInput" value="${escapeHtml(state.search)}" placeholder="Cari nama, invoice, UID, WA" autocomplete="off">
        <div class="billing-mobile-status-tabs" role="group" aria-label="Status tagihan cepat">
          <button class="${['collectible', 'unpaid'].includes(state.monitoringBillingStatus) ? 'is-active' : ''}" type="button" data-billing-mobile-status="collectible">Terbuka</button>
          <button class="${state.monitoringBillingStatus === 'overdue' ? 'is-active' : ''}" type="button" data-billing-mobile-status="overdue">Terlambat</button>
          <button class="${state.monitoringBillingStatus === 'paid' ? 'is-active' : ''}" type="button" data-billing-mobile-status="paid">Lunas</button>
        </div>
      </section>

      ${collectorBillingView ? `
        ${collectorScope?.targetReady ? '' : `
          <section class="notice warning">
            <strong>Target tagihan belum diatur</strong>
            <span>Hubungi admin untuk mengatur NAS target penagihan.</span>
          </section>
        `}
        ${nasTargetContext('NAS Target Collector', collectorTargetLabel, 'Area penagihan akun yang sedang login')}
        <section class="metrics collector-billing-metrics">
          ${metric('Belum Bayar', displayNumber(summary.unpaid || 0), billingScopeLabel, 'warning-card')}
          ${metric('Lewat Tempo', displayNumber(summary.overdue || 0), billingScopeLabel, 'negative')}
          ${metric('Hasil Filter', displayNumber(summary.filteredCount || 0), filterLabel)}
        </section>
      ` : `
        <section class="metrics">
          ${metric('Sudah Bayar', billingPaidMetric(summary), `Periode ${periodLabel(billingPeriod)}`, 'positive')}
          ${metric('Belum Bayar', billingCountAmountMetric(summary.unpaid, summary.unpaidAmount, summary), billingScopeLabel, 'warning-card')}
          ${metric('Lewat Tempo', billingCountAmountMetric(summary.overdue, summary.overdueAmount, summary), billingScopeLabel, 'negative')}
          ${metric('Hasil Filter', billingFilteredMetric(summary), filterLabel)}
        </section>
      `}

      <div class="toolbar">
        <div class="filters">
          <select class="control" id="billingScopeFilter" aria-label="Mode periode tagihan">
            <option value="collectible" ${billingScope === 'collectible' ? 'selected' : ''}>Berjalan + Tunggakan</option>
            <option value="month" ${billingScope === 'month' ? 'selected' : ''}>Bulan dipilih</option>
            <option value="arrears" ${billingScope === 'arrears' ? 'selected' : ''}>Semua tunggakan</option>
          </select>
          <input class="control month-picker-control" id="billingPeriodFilter" type="month" value="${escapeHtml(billingPeriod)}" aria-label="Filter bulan tagihan">
          ${collectorBillingView ? '' : `
            <select class="control" id="billingSiteFilter" aria-label="Filter NAS">
              <option value="all" ${state.monitoringBillingSite === 'all' ? 'selected' : ''}>Semua NAS</option>
              ${sites.map((site) => `<option value="${escapeHtml(site.id)}" ${state.monitoringBillingSite === site.id ? 'selected' : ''}>${escapeHtml(site.name)}</option>`).join('')}
            </select>
          `}
          <select class="control" id="billingCustomerStatusFilter" aria-label="Filter status pelanggan">
            <option value="all" ${state.monitoringBillingCustomerStatus === 'all' ? 'selected' : ''}>Semua pelanggan</option>
            <option value="active" ${state.monitoringBillingCustomerStatus === 'active' ? 'selected' : ''}>Aktif</option>
            <option value="isolated" ${state.monitoringBillingCustomerStatus === 'isolated' ? 'selected' : ''}>Isolir</option>
            <option value="terminate" ${state.monitoringBillingCustomerStatus === 'terminate' ? 'selected' : ''}>Terminated</option>
          </select>
          <select class="control" id="billingStatusFilter" aria-label="Filter status tagihan">
            <option value="collectible" ${state.monitoringBillingStatus === 'collectible' ? 'selected' : ''}>Perlu ditagih</option>
            <option value="all" ${state.monitoringBillingStatus === 'all' ? 'selected' : ''}>Semua tagihan</option>
            <option value="unpaid" ${state.monitoringBillingStatus === 'unpaid' ? 'selected' : ''}>Belum bayar</option>
            <option value="overdue" ${state.monitoringBillingStatus === 'overdue' ? 'selected' : ''}>Lewat tempo</option>
            <option value="paid" ${state.monitoringBillingStatus === 'paid' ? 'selected' : ''}>Lunas</option>
          </select>
          <input class="control billing-desktop-search" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari nama, invoice, UID, WA" autocomplete="off">
        </div>
        <div class="row-actions">
          ${can('invoices:manage') ? '<button class="button" id="manualInvoiceButton" type="button">Invoice Manual</button>' : ''}
          <button class="ghost-button" id="refreshBilling" type="button">Refresh</button>
        </div>
      </div>

      ${(batchReminderAllowed || batchPayAllowed || batchCancelAllowed) ? `
        <div class="toolbar compact-toolbar billing-batch-toolbar" id="billingBatchToolbar" hidden>
          <div class="filters">
            <span class="muted" id="billingSelectedInfo">0 dipilih</span>
          </div>
          <div class="row-actions">
            ${batchReminderAllowed ? '<button class="ghost-button compact" id="billingBatchReminder" type="button" disabled>Reminder WA</button>' : ''}
            ${batchPayAllowed ? '<button class="button compact" id="billingBatchPay" type="button" disabled>Bayar</button>' : ''}
            ${batchCancelAllowed ? '<button class="danger-button compact" id="billingBatchCancel" type="button" disabled>Batalkan</button>' : ''}
          </div>
        </div>
      ` : ''}

      <div class="table-wrap billing-table-wrap">
        <table class="billing-table">
          <colgroup>
            <col class="billing-col-check">
            <col class="billing-col-customer">
            <col class="billing-col-site">
            <col class="billing-col-contact">
            <col class="billing-col-invoice">
            <col class="billing-col-date">
            <col class="billing-col-last-active">
            <col class="billing-col-amount">
            <col class="billing-col-status">
            <col class="billing-col-action">
          </colgroup>
          <thead>
            <tr>
              <th><input type="checkbox" id="billingSelectAll" aria-label="Pilih semua tagihan"></th>
              <th>Pelanggan</th>
              <th>NAS</th>
              <th>Kontak</th>
              <th>Invoice</th>
              <th>Jatuh Tempo</th>
              <th>Terakhir Aktif</th>
              <th class="amount">Nominal</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      ${billingPaginationControls(pagination)}
      <div class="muted">Update ${escapeHtml(payload.checkedAt ? dateTimeText(payload.checkedAt) : '-')}.</div>
    </div>
  `;

  document.getElementById('billingPeriodFilter')?.addEventListener('change', (event) => {
    state.monitoringBillingPeriod = normalizedPeriod(event.target.value || todayInput().slice(0, 7));
    saveMonitoringBillingPeriod(state.monitoringBillingPeriod);
    state.monitoringBillingPage = 1;
    renderMonitoringBilling();
  });
  document.getElementById('billingScopeFilter')?.addEventListener('change', (event) => {
    state.monitoringBillingScope = event.target.value || 'collectible';
    state.monitoringBillingPage = 1;
    renderMonitoringBilling();
  });
  document.getElementById('billingStatusFilter')?.addEventListener('change', (event) => {
    state.monitoringBillingStatus = event.target.value;
    state.monitoringBillingPage = 1;
    renderMonitoringBilling();
  });
  document.getElementById('billingCustomerStatusFilter')?.addEventListener('change', (event) => {
    state.monitoringBillingCustomerStatus = event.target.value;
    state.monitoringBillingPage = 1;
    renderMonitoringBilling();
  });
  document.getElementById('billingSiteFilter')?.addEventListener('change', (event) => {
    state.monitoringBillingSite = event.target.value;
    state.monitoringBillingPage = 1;
    renderMonitoringBilling();
  });
  document.getElementById('refreshBilling')?.addEventListener('click', () => renderMonitoringBilling({ refresh: true }));
  document.getElementById('manualInvoiceButton')?.addEventListener('click', () => openManualInvoiceModal());
  app.querySelectorAll('[data-billing-mobile-status]').forEach((button) => {
    button.addEventListener('click', () => {
      state.monitoringBillingStatus = button.dataset.billingMobileStatus || 'collectible';
      state.monitoringBillingPage = 1;
      renderMonitoringBilling({ silent: true });
    });
  });
  const selectedBillingInvoices = () => [...app.querySelectorAll('[data-billing-select]:checked')]
    .map((checkbox) => invoices[Number(checkbox.dataset.billingSelect || -1)])
    .filter(Boolean);
  const updateBillingBatchButtons = () => {
    const selected = selectedBillingInvoices();
    const selectable = [...app.querySelectorAll('[data-billing-select]:not(:disabled)')];
    const selectAll = document.getElementById('billingSelectAll');
    if (selectAll) {
      selectAll.checked = selectable.length > 0 && selectable.every((checkbox) => checkbox.checked);
      selectAll.indeterminate = selected.length > 0 && !selectAll.checked;
    }
    const toolbar = document.getElementById('billingBatchToolbar');
    if (toolbar) toolbar.hidden = selected.length === 0;
    const info = document.getElementById('billingSelectedInfo');
    if (info) info.textContent = `${displayNumber(selected.length)} dipilih`;
    const reminderButton = document.getElementById('billingBatchReminder');
    const payButton = document.getElementById('billingBatchPay');
    const cancelButton = document.getElementById('billingBatchCancel');
    if (reminderButton) reminderButton.disabled = !selected.some((invoice) => billingReminderAllowed(invoice));
    if (payButton) payButton.disabled = !selected.some((invoice) => billingPayAllowed(invoice));
    if (cancelButton) cancelButton.disabled = !selected.some((invoice) => billingCancelAllowed(invoice));
  };
  document.getElementById('billingSelectAll')?.addEventListener('change', (event) => {
    app.querySelectorAll('[data-billing-select]:not(:disabled)').forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
    updateBillingBatchButtons();
  });
  app.querySelectorAll('[data-billing-select]').forEach((checkbox) => {
    checkbox.addEventListener('change', updateBillingBatchButtons);
  });
  document.getElementById('billingBatchReminder')?.addEventListener('click', async () => {
    const selected = selectedBillingInvoices().filter((invoice) => billingReminderAllowed(invoice));
    if (!selected.length) return;
    let sent = 0;
    for (const invoice of selected) {
      await api('/api/monitoring/billing-reminder', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: billingReminderId(invoice),
          invoiceNo: billingInvoiceNo(invoice),
          customerName: invoice.customerName || invoice.accountId || invoice.username || '',
          bulk: true
        })
      });
      sent += 1;
    }
    setToast('Reminder berhasil dikirim');
    renderMonitoringBilling();
  });
  document.getElementById('billingBatchPay')?.addEventListener('click', async () => {
    const selected = selectedBillingInvoices().filter((invoice) => billingPayAllowed(invoice));
    if (!selected.length) return;
    let paid = 0;
    for (const invoice of selected) {
      await api('/api/monitoring/billing-action', {
        method: 'POST',
        body: JSON.stringify({
          action: 'pay',
          invoiceNo: billingInvoiceNo(invoice),
          customerName: invoice.customerName || invoice.accountId || invoice.username || '',
          bulk: true
        })
      });
      paid += 1;
    }
    setToast(`${displayNumber(paid)} tagihan dibayar`);
    renderMonitoringBilling({ refresh: true });
  });
  document.getElementById('billingBatchCancel')?.addEventListener('click', async () => {
    const selected = selectedBillingInvoices().filter((invoice) => billingCancelAllowed(invoice));
    if (!selected.length) return;
    if (!window.confirm(`Batalkan ${displayNumber(selected.length)} invoice terpilih? Invoice batal tidak tampil di tagihan aktif dan periode bisa dibuat ulang.`)) return;
    let cancelled = 0;
    for (const invoice of selected) {
      await api('/api/monitoring/billing-action', {
        method: 'POST',
        body: JSON.stringify({
          action: 'cancel',
          invoiceNo: billingInvoiceNo(invoice),
          customerName: invoice.customerName || invoice.accountId || invoice.username || ''
        })
      });
      cancelled += 1;
    }
    setToast(`${displayNumber(cancelled)} invoice dibatalkan`);
    renderMonitoringBilling({ refresh: true });
  });
  bindSearch((renderOptions = {}) => {
    state.monitoringBillingPage = 1;
    return renderMonitoringBilling(renderOptions);
  });
  const mobileBillingSearch = document.getElementById('billingMobileSearchInput');
  if (mobileBillingSearch) {
    bindLiveTextSearch(mobileBillingSearch, {
      getValue: () => state.search,
      setValue: (value) => { state.search = value; },
      handler: (renderOptions = {}) => {
        state.monitoringBillingPage = 1;
        return renderMonitoringBilling(renderOptions);
      },
      refocusSelector: '#billingMobileSearchInput'
    });
    bindSearchClearButton(mobileBillingSearch, () => {
      state.search = '';
      state.monitoringBillingPage = 1;
      renderMonitoringBilling({ silent: true, liveSearch: true });
    });
  }
  app.querySelectorAll('[data-billing-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.monitoringBillingPage = Math.max(1, Number(button.dataset.billingPage || 1));
      renderMonitoringBilling();
    });
  });
  bindPagerLimit('billing', (limit) => {
    state.monitoringBillingLimit = limit;
  }, (page) => {
    state.monitoringBillingPage = page;
  }, renderMonitoringBilling, 10);
  app.querySelectorAll('[data-billing-location]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const invoice = invoices[Number(link.dataset.billingLocation || -1)];
      if (invoice) openCustomerLocationModal(invoice);
    });
  });
  app.querySelectorAll('[data-billing-reminder]').forEach((button) => {
    button.addEventListener('click', async () => {
      const invoice = invoices[Number(button.dataset.billingReminder || -1)];
      const invoiceId = billingReminderId(invoice);
      if (!invoice || !invoiceId) {
        setToast('ID invoice tidak tersedia');
        return;
      }
      const originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="billing-action-icon whatsapp" aria-hidden="true"></span><span>Mengirim</span>';
      try {
        const result = await api('/api/monitoring/billing-reminder', {
          method: 'POST',
          body: JSON.stringify({
            invoiceId,
            invoiceNo: invoice.invoiceNo || invoice.externalId || '',
            customerName: invoice.customerName || invoice.accountId || invoice.username || ''
          })
        });
        setToast('Reminder berhasil dikirim');
      } catch (error) {
        setToast(error.message || 'Reminder WA gagal dikirim');
      } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
      }
    });
  });
  app.querySelectorAll('[data-billing-pay]').forEach((button) => {
    button.addEventListener('click', () => {
      const invoice = invoices[Number(button.dataset.billingPay || -1)];
      if (!invoice) {
        setToast('Nomor invoice tidak tersedia');
        return;
      }
      openBillingPayModal(invoice);
    });
  });
  app.querySelectorAll('[data-billing-qr-pay]').forEach((button) => {
    button.addEventListener('click', () => {
      const invoice = invoices[Number(button.dataset.billingQrPay || -1)];
      if (!invoice) {
        setToast('Nomor invoice tidak tersedia');
        return;
      }
      openBillingQrPayModal(invoice);
    });
  });
  app.querySelectorAll('[data-billing-discount]').forEach((button) => {
    button.addEventListener('click', () => {
      const invoice = invoices[Number(button.dataset.billingDiscount || -1)];
      if (!invoice) {
        setToast('Nomor invoice tidak tersedia');
        return;
      }
      openBillingDiscountModal(invoice);
    });
  });
  app.querySelectorAll('[data-billing-rollback]').forEach((button) => {
    button.addEventListener('click', () => {
      const invoice = invoices[Number(button.dataset.billingRollback || -1)];
      if (!invoice) {
        setToast('Nomor invoice tidak tersedia');
        return;
      }
      openBillingRollbackModal(invoice);
    });
  });
  app.querySelectorAll('[data-billing-temporary-activation]').forEach((button) => {
    button.addEventListener('click', async () => {
      const invoice = invoices[Number(button.dataset.billingTemporaryActivation || -1)];
      if (!invoice) return;
      if (!window.confirm(`Aktifkan sementara ${invoice.customerName || invoice.username || 'pelanggan'} tanpa batas waktu? Invoice dan reminder tetap berjalan sampai diisolir kembali secara manual.`)) return;
      button.disabled = true;
      try {
        const result = await api('/api/monitoring/billing-temporary-activation', {
          method: 'POST',
          body: JSON.stringify({
            invoiceId: invoice.invoiceId || invoice.id || invoice.invoiceNo || '',
            customerId: invoice.customerId || ''
          })
        });
        setToast(result.message || 'Pelanggan diaktifkan sementara');
        renderMonitoringBilling({ refresh: true });
      } catch (error) {
        button.disabled = false;
        setToast(error.message || 'Pelanggan gagal diaktifkan sementara');
      }
    });
  });
  updateBillingBatchButtons();
  scheduleTableTopScrollbars(app);
  scheduleMonitoringBillingRefresh();
}

function scheduleMonitoringBillingRefresh() {
  if (monitoringBillingTimer) window.clearTimeout(monitoringBillingTimer);
  if (state.view !== 'monitoringBilling' || !state.auth) return;
  monitoringBillingTimer = window.setTimeout(async () => {
    monitoringBillingTimer = null;
    if (state.view !== 'monitoringBilling' || !state.auth) return;
    if (document.hidden || modal?.open) {
      scheduleMonitoringBillingRefresh();
      return;
    }
    try {
      const period = normalizedPeriod(state.monitoringBillingPeriod || state.period || todayInput().slice(0, 7));
      const scope = state.monitoringBillingScope || 'collectible';
      const payload = await api(`/api/monitoring/billing-revision?${queryString({ period, scope })}`);
      const revision = String(payload.revision || '');
      if (revision && monitoringBillingRevision && revision !== monitoringBillingRevision) {
        monitoringBillingRevision = revision;
        await renderMonitoringBilling({ silent: true });
        return;
      }
      if (revision) monitoringBillingRevision = revision;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
    scheduleMonitoringBillingRefresh();
  }, 10000);
}

function scheduleVoucherDataRefresh(renderFn) {
  if (voucherDataTimer) window.clearTimeout(voucherDataTimer);
  const expectedView = state.view;
  if (!['radiusHotspot', 'reportsVoucherDaily', 'reportsVoucherMonthly'].includes(expectedView) || !state.auth) return;
  voucherDataTimer = window.setTimeout(async () => {
    voucherDataTimer = null;
    if (state.view !== expectedView || !state.auth) return;
    const activeElement = document.activeElement;
    const editingFilter = app.contains(activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeElement?.tagName || '');
    if (document.hidden || modal?.open || editingFilter) {
      scheduleVoucherDataRefresh(renderFn);
      return;
    }
    try {
      const payload = await api('/api/radius/hotspot/voucher-revision');
      const revision = String(payload.revision || '');
      if (revision && voucherDataRevision && revision !== voucherDataRevision) {
        voucherDataRevision = revision;
        await renderFn({ silent: true });
        return;
      }
      if (revision) voucherDataRevision = revision;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
    scheduleVoucherDataRefresh(renderFn);
  }, 10000);
}

function scheduleMonitoringServicesRefresh() {
  clearRealtimeTimers();
  if (state.view !== 'monitoringServices') return;
  monitoringServicesTimer = window.setTimeout(() => {
    if (state.view === 'monitoringServices') {
      if (['searchInput', 'serviceSiteFilter'].includes(document.activeElement?.id)) {
        scheduleMonitoringServicesRefresh();
        return;
      }
      renderMonitoringServices({ silent: true });
    }
  }, 15000);
}

function serviceSiteLocation(site = {}) {
  return site.location || site.host || '-';
}

function tvOnlineCount(tvheadend = {}) {
  return Number(tvheadend.activeSubscriptions || tvheadend.activeConnections || 0);
}

function embyWatchingCount(emby = {}) {
  return Number(emby.activeSessions || 0);
}

function shortServiceClient(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  if (lower.includes('iptv pro')) return 'IPTV Pro';
  if (lower.includes('tivimate')) return 'TiviMate';
  if (lower.includes('androidtv')) return 'Android TV';
  if (lower.includes('emby web')) return 'Media Web';
  if (lower.includes('mozilla/5.0')) return 'Browser/Android';
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}

function serviceStartedText(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric < 100000000000 ? numeric * 1000 : numeric;
    return dateTimeText(new Date(milliseconds).toISOString());
  }
  return dateTimeText(raw);
}

function siteFilteredServiceSites(sites = []) {
  const selectedSite = state.monitoringServicesSite || 'all';
  return sites.filter((site) => {
    return selectedSite === 'all' || String(site.id) === String(selectedSite);
  });
}

function serviceTabButton(tab, label, count) {
  const active = state.monitoringServicesTab === tab;
  return `
    <button class="tab-button ${active ? 'is-active' : ''}" type="button" data-service-tab="${escapeHtml(tab)}" role="tab" aria-selected="${active}">
      ${escapeHtml(label)} <span>${displayNumber(count)}</span>
    </button>
  `;
}

function tvServiceRows(sites = []) {
  return sites.flatMap((site) => {
    const tvheadend = site.tvheadend || {};
    const subscriptions = Array.isArray(tvheadend.subscriptions) ? tvheadend.subscriptions : [];
    const connections = Array.isArray(tvheadend.connections) ? tvheadend.connections : [];
    const sourceRows = subscriptions.length
      ? subscriptions.map((stream, index) => ({
        id: stream.id || `sub-${index}`,
        userName: stream.userName || '-',
        primary: stream.userName || '-',
        secondary: stream.channel || stream.client || stream.profile || 'Stream aktif',
        detail: [shortServiceClient(stream.client), stream.profile, stream.state].filter(Boolean).join(' · '),
        host: shortServiceClient(stream.client) || stream.profile || serviceSiteLocation(site),
        startedAt: stream.startedAt,
        badge: 'Stream'
      }))
      : connections.map((connection, index) => ({
        id: connection.id || `conn-${index}`,
        userName: connection.userName || '-',
        primary: connection.userName || '-',
        secondary: connection.peer || shortServiceClient(connection.client) || 'Koneksi aktif',
        detail: [connection.peer, shortServiceClient(connection.client), connection.server].filter(Boolean).join(' · '),
        host: connection.peer || connection.server || serviceSiteLocation(site),
        startedAt: connection.startedAt,
        badge: 'Koneksi'
      }));
    return sourceRows.map((row, index) => ({
      ...row,
      id: `${site.id || site.name || 'site'}:tv:${row.id || index}`,
      type: 'tv',
      siteId: site.id || site.name || 'site',
      siteName: site.name || '-',
      siteLocation: serviceSiteLocation(site)
    }));
  }).sort((a, b) => `${a.siteName} ${a.primary} ${a.secondary}`.localeCompare(`${b.siteName} ${b.primary} ${b.secondary}`));
}

function embyServiceRows(sites = []) {
  return sites.flatMap((site) => {
    const emby = site.emby || {};
    const sessions = Array.isArray(emby.watchingSessions)
      ? emby.watchingSessions
      : (Array.isArray(emby.sessions) ? emby.sessions.filter((session) => session.isPlaying) : []);
    return sessions.map((session, index) => {
      const mediaTitle = session.itemName
        ? [session.seriesName, session.itemName].filter(Boolean).join(' - ')
        : 'Sedang memutar';
      const deviceText = [session.deviceName, session.client].filter(Boolean).join(' · ');
      return {
        id: `${site.id || site.name || 'site'}:emby:${session.id || index}`,
        type: 'emby',
        siteId: site.id || site.name || 'site',
        siteName: site.name || '-',
        siteLocation: serviceSiteLocation(site),
        userName: session.userName || '-',
        primary: session.userName || '-',
        secondary: deviceText || 'Media client',
        detail: mediaTitle,
        host: session.remoteAddress || serviceSiteLocation(site),
        startedAt: session.startedAt,
        badge: 'Nonton'
      };
    });
  }).sort((a, b) => `${a.siteName} ${a.primary} ${a.secondary}`.localeCompare(`${b.siteName} ${b.primary} ${b.secondary}`));
}

function filteredServiceRows(rows = []) {
  const query = state.search.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => [
    row.primary,
    row.secondary,
    row.detail,
    row.host,
    serviceStartedText(row.startedAt),
    row.siteName,
    row.siteLocation,
    row.badge
  ].some((value) => String(value || '').toLowerCase().includes(query)));
}

function serviceRowsMarkup(rows = [], label = 'layanan') {
  if (!rows.length) {
    return `<div class="empty">Tidak ada ${escapeHtml(label)} aktif sesuai filter.</div>`;
  }
  return rows.map((row) => {
    const startedText = serviceStartedText(row.startedAt);
    return `
      <article class="pppoe-row">
        <div class="pppoe-user">
          <span class="pppoe-status-dot" aria-hidden="true"></span>
          <div>
            <strong title="${escapeHtml(row.primary)}">${escapeHtml(row.primary)}</strong>
            <span title="${escapeHtml(row.secondary)}">${escapeHtml(row.secondary)}</span>
          </div>
        </div>
        <span class="site-pill" title="${escapeHtml(row.siteLocation || row.siteName)}">${escapeHtml(row.siteName)}</span>
        <span class="muted pppoe-host service-row-detail" title="${escapeHtml([row.detail, startedText ? `Mulai ${startedText}` : ''].filter(Boolean).join(' - ') || row.host || '-')}">
          <strong>${escapeHtml(row.detail || row.host || '-')}</strong>
          ${startedText ? `<small>Mulai ${escapeHtml(startedText)}</small>` : ''}
        </span>
        <span class="badge active">${escapeHtml(row.badge || 'Online')}</span>
      </article>
    `;
  }).join('');
}

async function renderMonitoringServices(options = {}) {
  clearRealtimeTimers();
  if (shouldShowPageLoading(options)) {
    app.innerHTML = '<div class="empty">Memuat layanan...</div>';
  }
  const payload = await api('/api/monitoring/services');
  const services = payload.services || {};
  const summary = services.summary || {};
  const serviceSites = Array.isArray(services.sites) ? services.sites : [];
  const selectedSite = serviceSites.some((site) => String(site.id) === String(state.monitoringServicesSite))
    ? state.monitoringServicesSite
    : 'all';
  if (state.monitoringServicesSite !== selectedSite) {
    state.monitoringServicesSite = selectedSite;
  }
  const validTabs = ['tv', 'emby'];
  if (!validTabs.includes(state.monitoringServicesTab)) {
    state.monitoringServicesTab = 'tv';
  }
  const selectedSites = siteFilteredServiceSites(serviceSites);
  const possibleServices = Number(summary.siteCount || serviceSites.length || 0) * 2;
  const totalTvOnline = serviceSites.reduce((total, site) => total + tvOnlineCount(site.tvheadend || {}), 0);
  const totalEmbyWatching = serviceSites.reduce((total, site) => total + embyWatchingCount(site.emby || {}), 0);
  const tvRows = tvServiceRows(selectedSites);
  const embyRows = embyServiceRows(selectedSites);
  const allServiceRows = state.monitoringServicesTab === 'emby' ? embyRows : tvRows;
  const filteredRows = filteredServiceRows(allServiceRows);
  const serviceLabel = state.monitoringServicesTab === 'emby' ? 'Movie' : 'TV';
  const total = filteredRows.length;
  const serviceLimit = pagerLimitValue(state.monitoringServicesLimit || CUSTOMER_PAGE_SIZE, CUSTOMER_PAGE_SIZE);
  const effectiveLimit = effectivePagerLimit(serviceLimit, total, CUSTOMER_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));
  const currentPage = Math.min(Math.max(1, Number(state.monitoringServicesPage || 1)), totalPages);
  state.monitoringServicesPage = currentPage;
  const offset = (currentPage - 1) * effectiveLimit;
  const pageRows = filteredRows.slice(offset, offset + effectiveLimit);
  const pagination = {
    page: currentPage,
    limit: serviceLimit,
    total,
    totalPages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages
  };

  app.innerHTML = `
    <div class="stack">
      <section class="metrics">
        ${metric('Layanan online', `${displayNumber(summary.onlineServices)}/${displayNumber(summary.configuredServices || possibleServices)}`, 'TV dan Movie')}
        ${metric('TV Online', displayNumber(totalTvOnline), 'Saat ini semua NAS', totalTvOnline ? 'positive' : '')}
        ${metric('Media Online', displayNumber(totalEmbyWatching), 'Sedang memutar semua NAS', totalEmbyWatching ? 'positive' : '')}
        ${metric('Site layanan', displayNumber(summary.siteCount || serviceSites.length), 'Target aktif')}
      </section>

      ${!summary.configuredServices ? `
        <section class="notice warning">
          <strong>Layanan belum dikonfigurasi</strong>
          <span>Isi layanan tambahan per site di Monitoring > Site agar Ops bisa membaca aktivitas layanan yang sedang berjalan.</span>
        </section>
      ` : ''}

      <div class="toolbar">
        <div class="filters">
          <select class="control" id="serviceSiteFilter" aria-label="Filter NAS layanan">
            <option value="all" ${state.monitoringServicesSite === 'all' ? 'selected' : ''}>Semua NAS</option>
            ${serviceSites.map((site) => `<option value="${escapeHtml(site.id)}" ${String(state.monitoringServicesSite) === String(site.id) ? 'selected' : ''}>${escapeHtml(site.name)}</option>`).join('')}
          </select>
          <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari user, device, channel, NAS" autocomplete="off">
          <span class="muted">Update ${escapeHtml(services.checkedAt ? dateTimeText(services.checkedAt) : '-')} - auto 15 detik</span>
        </div>
        <div class="row-actions">
          <button class="ghost-button" id="refreshServices" type="button">Refresh Layanan</button>
        </div>
      </div>

      <section class="section">
        <div class="section-head">
          <h2>Layanan per NAS</h2>
          <span class="muted">Status dihitung dari layanan tambahan yang aktif di tiap NAS.</span>
        </div>
        <div class="site-grid">
          ${serviceSites.length ? serviceSites.map((site) => {
            const tvheadend = site.tvheadend || {};
            const emby = site.emby || {};
            const siteOnline = [tvheadend.online, emby.online].filter(Boolean).length;
            const siteConfigured = [tvheadend.configured, emby.configured].filter(Boolean).length;
            return `
              <article class="site-card">
                <div class="site-card-head">
                  <div>
                    <strong>${escapeHtml(site.name)}</strong>
                    <span>${escapeHtml(serviceSiteLocation(site))}</span>
                  </div>
                  <span class="badge ${siteOnline ? 'active' : (siteConfigured ? 'inactive' : 'pending')}">${escapeHtml(siteConfigured ? `${siteOnline}/${siteConfigured} Online` : 'Belum set')}</span>
                </div>
                <div class="site-card-stats">
                  <span><strong>${displayNumber(tvOnlineCount(tvheadend))}</strong> TV Online</span>
                  <span><strong>${displayNumber(embyWatchingCount(emby))}</strong> Media Online</span>
                </div>
                <div class="muted">${escapeHtml([tvheadend.error, emby.error].filter(Boolean).join(' · ') || 'Layanan terbaca')}</div>
              </article>
            `;
          }).join('') : '<div class="empty">Belum ada site monitoring.</div>'}
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <div class="tab-switcher" role="tablist" aria-label="Layanan aktif">
            ${serviceTabButton('tv', 'TV Online', tvRows.length)}
            ${serviceTabButton('emby', 'Media Online', embyRows.length)}
          </div>
          <span class="muted">Daftar aktif mengikuti filter site dan pencarian.</span>
        </div>
        <div class="pppoe-list">
          ${serviceRowsMarkup(pageRows, serviceLabel)}
        </div>
        ${servicePaginationControls(pagination, serviceLabel)}
      </section>

      ${can('monitoring:write') ? `
        <div class="row-actions">
          <button class="button" type="button" id="goServiceSettings">Atur di Site</button>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('serviceSiteFilter')?.addEventListener('change', (event) => {
    state.monitoringServicesSite = event.target.value || 'all';
    state.monitoringServicesPage = 1;
    renderMonitoringServices();
  });
  app.querySelectorAll('[data-service-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.serviceTab;
      if (!validTabs.includes(tab) || state.monitoringServicesTab === tab) return;
      state.monitoringServicesTab = tab;
      state.monitoringServicesPage = 1;
      renderMonitoringServices();
    });
  });
  document.getElementById('refreshServices')?.addEventListener('click', () => renderMonitoringServices());
  document.getElementById('goServiceSettings')?.addEventListener('click', () => setView('monitoringSite'));
  bindSearch((renderOptions = {}) => {
    state.monitoringServicesPage = 1;
    return renderMonitoringServices(renderOptions);
  });
  app.querySelectorAll('[data-service-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.monitoringServicesPage = Math.max(1, Number(button.dataset.servicePage || 1));
      renderMonitoringServices();
    });
  });
  bindPagerLimit('service', (limit) => {
    state.monitoringServicesLimit = limit;
  }, (page) => {
    state.monitoringServicesPage = page;
  }, renderMonitoringServices, CUSTOMER_PAGE_SIZE);
  scheduleMonitoringServicesRefresh();
}

function filteredUserRows(users = []) {
  const query = String(state.userSearch || '').trim().toLowerCase();
  return [...users]
    .filter((user) => state.userRole === 'all' || user.role === state.userRole)
    .filter((user) => state.userStatus === 'all'
      || (state.userStatus === 'active' ? user.active !== false : user.active === false))
    .filter((user) => {
      if (!query) return true;
      return [
        user.name,
        user.username,
        user.employeeId,
        user.nik,
        user.position,
        user.unit,
        user.department,
        user.roleLabel,
        roleLabel(user.role),
        user.email,
        user.phone,
        user.address,
        user.lockedNasName,
        user.lockedNasNames,
        user.lockedNasAddress
      ].some((value) => String(value || '').toLowerCase().includes(query));
    })
    .sort((left, right) => {
      if ((left.active !== false) !== (right.active !== false)) return left.active === false ? 1 : -1;
      return String(left.name || left.username || '').localeCompare(String(right.name || right.username || ''), 'id');
    });
}

function userPaginationControls(pagination = {}) {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  return `
    <div class="pager user-pager">
      <button class="ghost-button compact" type="button" data-user-page="${page - 1}" ${page > 1 ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${page} dari ${totalPages} - ${total} user</span>
      <label class="pager-jump">
        <span>Ke halaman</span>
        <select class="control compact" data-user-page-jump>
          ${Array.from({ length: totalPages }, (_, index) => index + 1)
            .map((value) => `<option value="${value}" ${value === page ? 'selected' : ''}>${value}</option>`)
            .join('')}
        </select>
      </label>
      ${pagerLimitControl('user', pagination.limit || state.userLimit || 10, 10)}
      <button class="ghost-button compact" type="button" data-user-page="${page + 1}" ${page < totalPages ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

async function renderUsers(options = {}) {
  if (options.refresh || !Array.isArray(state.userRows)) {
    app.innerHTML = '<div class="empty">Memuat user...</div>';
    const payload = await api('/api/users');
    state.userRows = Array.isArray(payload.users) ? payload.users : [];
    state.roles = payload.roles || state.roles;
  }

  const users = state.userRows || [];
  const filteredRows = filteredUserRows(users);
  const selectedLimit = pagerLimitValue(state.userLimit || 10, 10);
  const limit = effectivePagerLimit(selectedLimit, filteredRows.length, 10);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / limit));
  const page = Math.min(Math.max(1, Number(state.userPage || 1)), totalPages);
  const offset = (page - 1) * limit;
  const pageRows = filteredRows.slice(offset, offset + limit);
  const activeCount = users.filter((user) => user.active !== false).length;
  const inactiveCount = users.length - activeCount;
  state.userPage = page;

  app.innerHTML = `
    <div class="stack user-management-page">
      <div class="toolbar user-page-head">
        <div>
          <h2 class="page-section-title">User aplikasi</h2>
          <p class="muted compact-text">Kelola akun, identitas petugas, role, dan NAS target penugasan.</p>
        </div>
        <div class="row-actions">
          <button class="ghost-button" id="refreshUsers" type="button">Refresh</button>
          <button class="button" id="addUser" type="button">Tambah User</button>
        </div>
      </div>

      <section class="user-summary-grid" aria-label="Ringkasan user">
        <article class="user-summary-card"><span>Total user</span><strong>${displayNumber(users.length)}</strong></article>
        <article class="user-summary-card is-active"><span>Aktif</span><strong>${displayNumber(activeCount)}</strong></article>
        <article class="user-summary-card is-inactive"><span>Nonaktif</span><strong>${displayNumber(inactiveCount)}</strong></article>
        <article class="user-summary-card is-filtered"><span>Hasil filter</span><strong>${displayNumber(filteredRows.length)}</strong></article>
      </section>

      <form class="user-filter-bar" id="userFilterForm">
        <select class="control" id="userRoleFilter" aria-label="Filter role user">
          <option value="all">Semua role</option>
          ${state.roles.map((role) => `<option value="${escapeHtml(role.value)}" ${state.userRole === role.value ? 'selected' : ''}>${escapeHtml(role.label)}</option>`).join('')}
        </select>
        <select class="control" id="userStatusFilter" aria-label="Filter status user">
          <option value="all" ${state.userStatus === 'all' ? 'selected' : ''}>Semua status</option>
          <option value="active" ${state.userStatus === 'active' ? 'selected' : ''}>Aktif</option>
          <option value="inactive" ${state.userStatus === 'inactive' ? 'selected' : ''}>Nonaktif</option>
        </select>
        <button class="ghost-button" id="resetUserFilters" type="button">Reset Filter</button>
        <label class="user-search-field">
          <span class="sr-only">Cari user</span>
          <input class="control" id="userSearchInput" value="${escapeHtml(state.userSearch)}" placeholder="Cari nama, username, NIK, kontak, atau NAS" autocomplete="off">
        </label>
      </form>

      <div class="table-wrap user-table-wrap">
        <table class="user-management-table">
          <thead>
            <tr>
              <th>Pengguna</th>
              <th>Identitas Staf</th>
              <th>Role / Unit</th>
              <th>Kontak</th>
              <th>NAS Target</th>
              <th>Status</th>
              <th>Login terakhir</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.length ? pageRows.map((user) => `
              <tr>
                <td>
                  <div class="user-table-name">
                    ${userAvatarMarkup(user, 'user-table-avatar')}
                    <div>
                      <strong title="${escapeHtml(user.name || user.username || '-')}">${escapeHtml(user.name || user.username || '-')}</strong>
                      <div class="muted">@${escapeHtml(user.username || '-')} ${user.id === state.auth.id ? '<span class="badge user-current-badge">Anda</span>' : ''}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="user-table-details">
                    <strong>${escapeHtml(user.employeeId || user.nik || '-')}</strong>
                    <span>${escapeHtml(user.position || 'Jabatan belum diisi')}</span>
                  </div>
                </td>
                <td>
                  <div class="user-table-details">
                    <strong>${escapeHtml(user.roleLabel || roleLabel(user.role))}</strong>
                    <span>${escapeHtml(user.unit || user.department || roleLabel(user.role))}</span>
                  </div>
                </td>
                <td>
                  <div class="user-table-details user-table-contact" title="${escapeHtml(user.address || '')}">
                    <strong>${escapeHtml(user.phone || '-')}</strong>
                    <span>${escapeHtml(user.email || 'Email belum diisi')}</span>
                    ${user.address ? `<span>${escapeHtml(user.address)}</span>` : ''}
                  </div>
                </td>
                <td>${userLockedNasDisplay(user)}</td>
                <td><span class="badge ${user.active !== false ? 'active' : 'inactive'}">${user.active !== false ? 'Aktif' : 'Nonaktif'}</span></td>
                <td><span class="user-last-login">${dateTimeText(user.lastLoginAt)}</span></td>
                <td class="user-actions-cell">
                  <div class="row-actions user-row-actions">
                    <button class="ghost-button compact" type="button" data-edit-user="${escapeHtml(user.id)}">Edit</button>
                    ${user.id === state.auth.id ? '' : `<button class="danger-button compact" type="button" data-delete-user="${escapeHtml(user.id)}">Hapus</button>`}
                  </div>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="8"><div class="empty compact-empty">Tidak ada user sesuai filter.</div></td></tr>'}
          </tbody>
        </table>
      </div>
      ${userPaginationControls({ page, totalPages, total: filteredRows.length, limit: selectedLimit })}
    </div>
  `;

  if (options.focusSearch) {
    const searchInput = document.getElementById('userSearchInput');
    searchInput?.focus();
    searchInput?.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }
  document.getElementById('addUser')?.addEventListener('click', () => openUserModal());
  document.getElementById('refreshUsers')?.addEventListener('click', () => renderUsers({ refresh: true }));
  document.getElementById('userFilterForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    state.userSearch = document.getElementById('userSearchInput')?.value.trim() || '';
    state.userPage = 1;
    renderUsers({ focusSearch: true });
  });
  const userSearchInput = document.getElementById('userSearchInput');
  bindLiveTextSearch(userSearchInput, {
    getValue: () => state.userSearch,
    setValue: (value) => {
      state.userSearch = value;
      state.userPage = 1;
    },
    handler: () => renderUsers({ focusSearch: true }),
    refocusSelector: '#userSearchInput'
  });
  bindSearchClearButton(userSearchInput, () => {
    state.userSearch = '';
    state.userPage = 1;
    renderUsers({ focusSearch: true });
  });
  document.getElementById('userRoleFilter')?.addEventListener('change', (event) => {
    state.userRole = event.target.value || 'all';
    state.userPage = 1;
    renderUsers();
  });
  document.getElementById('userStatusFilter')?.addEventListener('change', (event) => {
    state.userStatus = event.target.value || 'all';
    state.userPage = 1;
    renderUsers();
  });
  document.getElementById('resetUserFilters')?.addEventListener('click', () => {
    state.userSearch = '';
    state.userRole = 'all';
    state.userStatus = 'all';
    state.userPage = 1;
    renderUsers();
  });
  app.querySelectorAll('[data-user-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.userPage = Math.max(1, Number(button.dataset.userPage || 1));
      renderUsers();
    });
  });
  app.querySelector('[data-user-page-jump]')?.addEventListener('change', (event) => {
    state.userPage = Math.max(1, Number(event.target.value || 1));
    renderUsers();
  });
  bindPagerLimit('user', (value) => {
    state.userLimit = value;
  }, (value) => {
    state.userPage = value;
  }, renderUsers, 10);
  app.querySelectorAll('[data-edit-user]').forEach((button) => {
    button.addEventListener('click', () => {
      const user = users.find((item) => item.id === button.dataset.editUser);
      if (user) openUserModal(user);
    });
  });
  app.querySelectorAll('[data-delete-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      const user = users.find((item) => item.id === button.dataset.deleteUser);
      if (!user || !window.confirm(`Hapus user ${user.username}?`)) return;
      try {
        await api(`/api/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
        state.userRows = null;
        setToast('User dihapus');
        await renderUsers({ refresh: true, resetScroll: true });
      } catch (error) {
        setToast(error.message);
      }
    });
  });
  scheduleTableTopScrollbars(app);
  if (options.resetScroll) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      const wrapper = app.querySelector('.user-table-wrap');
      const topScroll = wrapper?.previousElementSibling;
      if (wrapper) wrapper.scrollLeft = 0;
      if (topScroll?.classList.contains('table-top-scroll')) topScroll.scrollLeft = 0;
    });
  }
}

function userLockedNasDisplay(user = {}) {
  if (!['reseller_voucher', 'collector', 'technician'].includes(user.role)) return '<span class="muted">-</span>';
  const ids = Array.isArray(user.lockedNasIds) ? user.lockedNasIds : [];
  const label = user.lockedNasNames
    || user.lockedNasName
    || (ids.includes('all') ? 'Semua NAS' : ids.join(', '))
    || user.lockedNasAddress
    || user.lockedNasId
    || '-';
  const roleTargetLabel = user.role === 'collector'
    ? 'Collector'
    : user.role === 'technician'
      ? 'Teknisi'
      : 'Reseller Hotspot';
  const targetMarkup = label === '-'
    ? '<span class="muted">Belum diatur</span>'
    : nasTargetBadges(label);
  return `
    <div class="user-nas-target">
      <span>${escapeHtml(roleTargetLabel)}</span>
      ${targetMarkup}
    </div>
  `;
}

function userFormBody(user = {}, options = {}) {
  const isEdit = Boolean(user.id);
  const nasOptions = Array.isArray(options.nas) ? options.nas : [];
  const selectedNasIds = Array.isArray(user.lockedNasIds) && user.lockedNasIds.length
    ? user.lockedNasIds
    : [user.lockedNasId || user.resellerNasId || ''].filter(Boolean);
  const nasLockedRole = ['reseller_voucher', 'collector', 'technician'].includes(user.role || 'viewer');
  const collectorRole = (user.role || 'viewer') === 'collector';
  const technicianRole = (user.role || 'viewer') === 'technician';
  const nasLockLabel = collectorRole
    ? 'NAS Target Collector'
    : technicianRole
      ? 'NAS Area Teknisi'
      : 'NAS Target Reseller Hotspot';
  const roleText = user.roleLabel || roleLabel(user.role || 'viewer');
  const roleHelp = roleDescription(user.role || 'viewer');
  const photoUrl = safeProfilePhotoUrl(user.photoUrl || user.avatarUrl);
  const previewUrl = profilePhotoDisplayUrl(user);
  return `
    <div class="account-settings-modal managed-user-modal">
      <section class="account-profile-head">
        <div class="account-photo-preview" id="accountPhotoPreview">
          ${avatarImageMarkup(previewUrl, `Foto ${user.name || user.username || 'default user'}`)}
        </div>
        <div class="account-profile-title">
          <strong>${escapeHtml(user.name || user.username || (isEdit ? '-' : 'User baru'))}</strong>
          <span>${escapeHtml(roleText)} · ${escapeHtml(user.username || 'username')}</span>
        </div>
        <div class="account-photo-actions">
          <label class="ghost-button compact account-photo-upload">
            <span>Upload Foto</span>
            <input id="accountPhotoInput" name="photoUpload" type="file" accept="image/png,image/jpeg,image/webp">
          </label>
          <button class="ghost-button compact" id="accountPhotoClear" type="button">Hapus</button>
        </div>
      </section>
      <input name="photoUrl" type="hidden" value="${escapeHtml(photoUrl)}">
      <div class="form-grid">
      <label class="field">
        <span>Nama</span>
        <input name="name" value="${escapeHtml(user.name || '')}" required>
      </label>
      <label class="field">
        <span>Username</span>
        <input name="username" value="${escapeHtml(user.username || '')}" autocomplete="username" required>
      </label>
      <label class="field">
        <span>Role</span>
        <select name="role">
          ${roleOptions(user.role || 'viewer')}
        </select>
      </label>
      <div class="field full user-nas-target-field" data-reseller-nas-lock ${nasLockedRole ? '' : 'hidden'}>
        <span data-nas-lock-label>${escapeHtml(nasLockLabel)}</span>
        ${nasTargetChoiceMarkup(nasOptions, selectedNasIds)}
        <small data-nas-lock-help>${collectorRole ? 'Pilih satu atau beberapa NAS penagihan. Gunakan Semua NAS untuk seluruh target.' : technicianRole ? 'Opsional: pilih satu atau beberapa NAS sebagai area penugasan teknisi.' : 'Pilih satu atau beberapa NAS yang boleh dikelola reseller hotspot.'}</small>
      </div>
      <div class="user-role-description field full" data-user-role-description>
        <strong>${escapeHtml(roleText)}</strong>
        <span>${escapeHtml(roleHelp)}</span>
      </div>
      <label class="field">
        <span>ID Karyawan (NIK)</span>
        <input name="employeeId" value="${escapeHtml(user.employeeId || user.nik || '')}" inputmode="numeric" autocomplete="off">
      </label>
      <label class="field">
        <span>Jabatan</span>
        <select name="position" autocomplete="organization-title">
          ${userPositionOptions(user.role || 'viewer', user.position || '')}
        </select>
      </label>
      <label class="field">
        <span>Unit/Divisi</span>
        <input data-user-role-unit value="${escapeHtml(roleText || '-')}" autocomplete="organization" readonly disabled>
      </label>
      <label class="field">
        <span>Status</span>
        <select name="active">
          <option value="true" ${user.active !== false ? 'selected' : ''}>Aktif</option>
          <option value="false" ${user.active === false ? 'selected' : ''}>Nonaktif</option>
        </select>
      </label>
      <label class="field">
        <span>Email</span>
        <input name="email" type="email" value="${escapeHtml(user.email || '')}" autocomplete="email">
      </label>
      <label class="field">
        <span>No. HP/Whatsapp</span>
        <input name="phone" value="${escapeHtml(user.phone || '')}" inputmode="tel" autocomplete="tel">
      </label>
      <label class="field full">
        <span>Alamat</span>
        <textarea name="address" autocomplete="street-address">${escapeHtml(user.address || '')}</textarea>
      </label>
      <label class="field full">
        <span>${isEdit ? 'Password baru' : 'Password'}</span>
        <input name="password" type="password" autocomplete="new-password" ${isEdit ? 'placeholder="Kosongkan jika tidak diganti"' : 'required'}>
      </label>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Batal</button>
        <button class="button" type="submit">Simpan</button>
      </div>
    </div>
  `;
}

function bindUserRoleNasLock() {
  const roleSelect = modalBody.querySelector('select[name="role"]');
  const lockField = modalBody.querySelector('[data-reseller-nas-lock]');
  const lockPicker = modalBody.querySelector('[data-nas-target-picker]');
  const lockChoices = [...modalBody.querySelectorAll('[data-nas-target-choice]')];
  const lockInputs = lockChoices.map((choice) => choice.querySelector('input[data-multi-value]')).filter(Boolean);
  const allChoice = modalBody.querySelector('[data-all-nas-choice]');
  const allInput = allChoice?.querySelector('input[data-multi-value]');
  const lockSearch = modalBody.querySelector('[data-nas-target-search]');
  const lockCount = modalBody.querySelector('[data-nas-target-count]');
  const lockLabel = modalBody.querySelector('[data-nas-lock-label]');
  const lockHelp = modalBody.querySelector('[data-nas-lock-help]');
  const unitInput = modalBody.querySelector('[data-user-role-unit]');
  const positionSelect = modalBody.querySelector('select[name="position"]');
  const roleHelp = modalBody.querySelector('[data-user-role-description]');
  const syncCount = () => {
    const selected = lockInputs.filter((input) => input.checked);
    if (lockCount) lockCount.textContent = allInput?.checked ? 'Semua NAS' : `${selected.length} NAS dipilih`;
    lockChoices.forEach((choice) => {
      choice.classList.toggle('is-selected', choice.querySelector('input')?.checked === true);
    });
  };
  const normalizeLockSelection = (changedInput = null) => {
    if (changedInput === allInput && allInput?.checked) {
      lockInputs.forEach((input) => {
        if (input !== allInput) input.checked = false;
      });
    } else if (changedInput?.checked && changedInput !== allInput && allInput) {
      allInput.checked = false;
    }
    syncCount();
  };
  const sync = () => {
    const selectedRole = roleSelect?.value || 'viewer';
    const nasLockedRole = ['reseller_voucher', 'collector', 'technician'].includes(selectedRole);
    if (lockField) lockField.hidden = !nasLockedRole;
    if (lockPicker) lockPicker.hidden = !nasLockedRole;
    if (lockLabel) {
      lockLabel.textContent = selectedRole === 'collector'
        ? 'NAS Target Collector'
        : selectedRole === 'technician'
          ? 'NAS Area Teknisi'
          : 'NAS Target Reseller Hotspot';
    }
    const collector = selectedRole === 'collector';
    const technician = selectedRole === 'technician';
    const allowAllNas = collector || technician;
    if (allChoice) allChoice.hidden = !allowAllNas;
    if (!allowAllNas && allInput) allInput.checked = false;
    if (!nasLockedRole) lockInputs.forEach((input) => { input.checked = false; });
    if (lockHelp) {
      lockHelp.textContent = collector
        ? 'Pilih satu atau beberapa NAS penagihan. Gunakan Semua NAS untuk seluruh target.'
        : technician
          ? 'Opsional: pilih satu atau beberapa NAS sebagai area penugasan teknisi. Akses teknis belum dibatasi oleh pilihan ini.'
          : 'Pilih satu atau beberapa NAS yang boleh dikelola reseller hotspot.';
    }
    syncCount();
    if (unitInput) {
      unitInput.value = roleLabel(selectedRole);
    }
    if (positionSelect) {
      const current = positionSelect.value;
      const allowed = USER_POSITION_OPTIONS[selectedRole] || ['Staf'];
      const next = allowed.includes(current) ? current : allowed[0];
      positionSelect.innerHTML = userPositionOptions(selectedRole, next);
      positionSelect.value = next;
    }
    if (roleHelp) {
      roleHelp.innerHTML = `<strong>${escapeHtml(roleLabel(selectedRole))}</strong><span>${escapeHtml(roleDescription(selectedRole))}</span>`;
    }
  };
  roleSelect?.addEventListener('change', sync);
  lockInputs.forEach((input) => input.addEventListener('change', () => normalizeLockSelection(input)));
  lockSearch?.addEventListener('input', () => {
    const query = String(lockSearch.value || '').trim().toLowerCase();
    lockChoices.forEach((choice) => {
      if (choice === allChoice) return;
      choice.hidden = Boolean(query) && !String(choice.dataset.nasTargetText || '').includes(query);
    });
  });
  sync();
}

function accountSettingsFormBody(user = {}) {
  const roleText = user.roleLabel || roleLabel(user.role);
  const photoUrl = safeProfilePhotoUrl(user.photoUrl || user.avatarUrl);
  const previewUrl = profilePhotoDisplayUrl(user);
  return `
    <div class="account-settings-modal">
      <section class="account-profile-head">
        <div class="account-photo-preview" id="accountPhotoPreview">
          ${avatarImageMarkup(previewUrl, `Foto ${user.name || user.username || 'default user'}`)}
        </div>
        <div class="account-profile-title">
          <strong>${escapeHtml(user.name || user.username || '-')}</strong>
          <span>${escapeHtml(roleText)} · ${escapeHtml(user.username || '-')}</span>
        </div>
        <div class="account-photo-actions">
          <label class="ghost-button compact account-photo-upload">
            <span>Upload Foto</span>
            <input id="accountPhotoInput" name="photoUpload" type="file" accept="image/png,image/jpeg,image/webp">
          </label>
          <button class="ghost-button compact" id="accountPhotoClear" type="button">Hapus</button>
        </div>
      </section>
      <input name="photoUrl" type="hidden" value="${escapeHtml(photoUrl)}">
      <div class="form-grid">
        <label class="field">
          <span>Nama Lengkap</span>
          <input name="name" value="${escapeHtml(user.name || '')}" autocomplete="name" required>
        </label>
        <label class="field">
          <span>ID Karyawan (NIK)</span>
          <input name="employeeId" value="${escapeHtml(user.employeeId || user.nik || '')}" inputmode="numeric" autocomplete="off">
        </label>
        <label class="field">
          <span>Jabatan</span>
          <select name="position" autocomplete="organization-title">
            ${userPositionOptions(user.role || 'viewer', user.position || '')}
          </select>
        </label>
        <label class="field">
          <span>Unit/Divisi</span>
          <input value="${escapeHtml(roleText || '-')}" autocomplete="organization" readonly disabled>
        </label>
        <label class="field">
          <span>Email</span>
          <input name="email" type="email" value="${escapeHtml(user.email || '')}" autocomplete="email">
        </label>
        <label class="field">
          <span>No. HP/Whatsapp</span>
          <input name="phone" value="${escapeHtml(user.phone || '')}" inputmode="tel" autocomplete="tel">
        </label>
        <label class="field full">
          <span>Alamat</span>
          <textarea name="address" autocomplete="street-address">${escapeHtml(user.address || '')}</textarea>
        </label>
        <div class="field full account-readonly-grid">
          <div>
            <span>Username Login</span>
            <strong>${escapeHtml(user.username || '-')}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>${escapeHtml(roleText || '-')}</strong>
          </div>
        </div>
        <div class="field full form-subhead">
          <strong>Ganti Password</strong>
          <span>Isi bagian ini hanya jika password ingin diganti.</span>
        </div>
        <label class="field">
          <span>Password Lama</span>
          <input name="currentPassword" type="password" autocomplete="current-password">
        </label>
        <label class="field">
          <span>Password Baru</span>
          <input name="newPassword" type="password" autocomplete="new-password">
        </label>
        <label class="field full">
          <span>Ulangi Password Baru</span>
          <input name="confirmPassword" type="password" autocomplete="new-password">
        </label>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Batal</button>
        <button class="button" type="submit">Simpan Akun</button>
      </div>
    </div>
  `;
}

function bindAccountSettingsPhotoInput(user = {}) {
  const input = modalBody.querySelector('#accountPhotoInput');
  const hidden = modalBody.querySelector('input[name="photoUrl"]');
  const preview = modalBody.querySelector('#accountPhotoPreview');
  const clearButton = modalBody.querySelector('#accountPhotoClear');
  const resetPreview = () => {
    if (preview) {
      preview.innerHTML = `<img src="${escapeHtml(DEFAULT_PROFILE_PHOTO_URL)}" alt="Foto default user">`;
    }
  };
  input?.addEventListener('change', async () => {
    try {
      const file = input.files?.[0];
      if (!file) return;
      const dataUrl = await readImageFile(file, { label: 'Foto profil' });
      if (preview) {
        preview.innerHTML = `<img src="${escapeHtml(dataUrl)}" alt="Preview foto ${escapeHtml(user.name || user.username || 'user')}">`;
      }
    } catch (error) {
      input.value = '';
      setToast(error.message);
    }
  });
  clearButton?.addEventListener('click', () => {
    if (input) input.value = '';
    if (hidden) hidden.value = '';
    resetPreview();
  });
}

function openAccountSettingsModal() {
  if (!state.auth) return;
  openModal('Akun Saya', accountSettingsFormBody(state.auth), async (payload, form) => {
    const photoFile = form.querySelector('#accountPhotoInput')?.files?.[0];
    const body = {
      name: payload.name,
      employeeId: payload.employeeId,
      nik: payload.employeeId,
      position: payload.position,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      photoUrl: payload.photoUrl,
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword
    };
    if (photoFile) {
      body.photoUrl = await uploadImageFile(photoFile, 'profile', { label: 'Foto profil' });
    }
    if (body.newPassword || payload.confirmPassword || body.currentPassword) {
      if (!body.newPassword) {
        throw new Error('Password baru wajib diisi');
      }
      if (!body.currentPassword) {
        throw new Error('Password lama wajib diisi');
      }
      if (body.newPassword !== payload.confirmPassword) {
        throw new Error('Konfirmasi password baru tidak sama');
      }
    } else {
      delete body.currentPassword;
      delete body.newPassword;
    }
    const result = await api('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    state.auth = result.user || state.auth;
    state.userRows = null;
    configureShell();
    setToast('Akun diperbarui');
  });
  bindAccountSettingsPhotoInput(state.auth);
}

async function logoutCurrentUser() {
  rememberLoginReturnView();
  await disableWebPushSubscription().catch(() => {});
  await api('/api/auth/logout', {
    method: 'POST',
    skipAuthRedirect: true
  }).catch(() => ({}));
  setMenuOpen(false);
  setAccountMenuOpen(false);
  state.auth = null;
  state.userRows = null;
  clearRadiusOptionsCache();
  abortPageRequests();
  clearRealtimeTimers();
  window.clearInterval(notificationsTimer);
  hideNotifications();
  hideTopWaStatus();
  closeDatePickers();
  setPeriodPickerOpen(false);
  if (modal?.open) modal.close();
  setToast('Logout berhasil');
  renderLogin();
}

async function openUserModal(user = null) {
  const nasOptions = await loadRadiusNasOptions();
  openModal(user ? 'Edit User' : 'Tambah User', userFormBody(user || {}, { nas: nasOptions }), async (payload, form) => {
    const targetRole = String(payload.role || user?.role || 'viewer');
    const selectedNasTargets = Array.isArray(payload.lockedNasIds)
      ? payload.lockedNasIds.filter(Boolean)
      : [payload.lockedNasIds].filter(Boolean);
    if (['collector', 'reseller_voucher'].includes(targetRole) && !selectedNasTargets.length) {
      throw new Error(targetRole === 'collector' ? 'Pilih minimal satu NAS target collector' : 'Pilih minimal satu NAS target reseller hotspot');
    }
    const photoFile = form.querySelector('#accountPhotoInput')?.files?.[0];
    const body = {
      ...payload,
      active: payload.active === 'true',
      nik: payload.employeeId
    };
    if (photoFile) {
      body.photoUrl = await uploadImageFile(photoFile, 'profile', { label: 'Foto profil' });
    }
    if (user && !body.password) {
      delete body.password;
    }
    await api(user ? `/api/users/${encodeURIComponent(user.id)}` : '/api/users', {
      method: user ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    });
    state.userRows = null;
    setToast(user ? 'User diperbarui' : 'User dibuat');
    await renderUsers({ refresh: true, resetScroll: true });
  });
  bindUserRoleNasLock();
  bindAccountSettingsPhotoInput(user || {});
}

async function renderBillingSettings() {
  app.innerHTML = '<div class="empty">Memuat billing settings...</div>';
  const payload = await api('/api/billing/settings');
  const settings = payload.settings || {};
  app.innerHTML = `
    <div class="stack">
      <section class="form-panel">
        <div class="section-head">
          <h2>Billing Settings</h2>
        </div>
        <form id="billingSettingsForm" class="form-grid">
          <label class="field">
            <span>Due date postpaid</span>
            <input name="postpaidDueDay" type="number" min="1" max="28" value="${escapeHtml(settings.postpaidDueDay || 10)}">
          </label>
          <label class="field">
            <span>Generate invoice sebelum tempo</span>
            <input name="fixedInvoiceAdvanceDays" type="number" min="0" max="31" step="1" value="${escapeHtml(settings.fixedInvoiceAdvanceDays ?? 7)}">
          </label>
          <label class="field">
            <span>Grace suspend setelah tempo</span>
            <input name="suspendGraceDays" type="number" min="0" max="365" value="${escapeHtml(settings.suspendGraceDays || 0)}">
          </label>
          <label class="field">
            <span>Terminate otomatis setelah isolir</span>
            <input name="autoTerminateAfterDays" type="number" min="0" max="3650" step="1" value="${escapeHtml(settings.autoTerminateAfterDays || 0)}">
            <small class="muted">Hari sejak isolir karena tunggakan. Isi 0 agar tetap isolir dan invoice berikutnya terus berjalan.</small>
          </label>
          <label class="field">
            <span>Reminder sebelum tempo</span>
            <input name="notificationBeforeDueDays" type="number" min="0" max="31" value="${escapeHtml(settings.notificationBeforeDueDays || 0)}">
          </label>
          <label class="field">
            <span>Jam kirim invoice/reminder</span>
            <input name="notificationSendTime" type="time" value="${escapeHtml(settings.notificationSendTime || '08:00')}">
            <small class="muted">Dipakai untuk WA invoice terbit dan reminder otomatis (${escapeHtml(appTimeZoneLabel())}).</small>
          </label>
          <label class="field">
            <span>Jam isolir otomatis</span>
            <input name="autoSuspendTime" type="time" value="${escapeHtml(settings.autoSuspendTime || '13:30')}">
          </label>
          <label class="field checkbox-field">
            <input name="notifyInvoiceIssued" type="checkbox" value="true" ${settings.notifyInvoiceIssued !== false ? 'checked' : ''}>
            <span>Kirim notifikasi invoice terbit</span>
          </label>
          <label class="field checkbox-field">
            <input name="notifyPaymentStatus" type="checkbox" value="true" ${settings.notifyPaymentStatus !== false ? 'checked' : ''}>
            <span>Kirim notifikasi status bayar</span>
          </label>
          <label class="field checkbox-field">
            <input name="notifyMemberStatus" type="checkbox" value="true" ${settings.notifyMemberStatus !== false ? 'checked' : ''}>
            <span>Kirim notifikasi status member</span>
          </label>
          <label class="field checkbox-field full">
            <input name="mergeInvoice" type="checkbox" value="true" ${settings.mergeInvoice ? 'checked' : ''}>
            <span>Merge invoice bulan sebelumnya jika belum dibayar</span>
          </label>
          <label class="field checkbox-field">
            <input name="bhpUsoEnabled" type="checkbox" value="true" ${settings.bhpUsoEnabled === true ? 'checked' : ''}>
            <span>Aktifkan BHP USO</span>
          </label>
          <label class="field">
            <span>BHP USO (%)</span>
            <input name="bhpUsoRate" type="number" min="0" max="100" step="0.01" value="${escapeHtml(settings.bhpUsoRate ?? 1.25)}">
            <small class="muted">Default 1,25%. Berlaku pada invoice baru dan invoice yang masih belum lunas.</small>
          </label>
          <div class="modal-actions field full">
            <button class="button" type="submit">Simpan Billing</button>
          </div>
        </form>
      </section>
    </div>
  `;
  document.getElementById('billingSettingsForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('/api/billing/settings', {
      method: 'PUT',
      body: JSON.stringify(formData(event.currentTarget))
    });
    setToast('Billing settings tersimpan');
    renderBillingSettings();
  });
}

function waMessageSubject(message = {}) {
  const invoiceNo = String(message.invoiceNo || '').replace(/^payment\s+inv\s*#?/i, '').replace(/^#/, '').trim();
  return message.subject || (invoiceNo ? `Payment INV #${invoiceNo}` : message.type || '-');
}

function waMessageStatusLabel(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'queued') return 'Dalam Antrean';
  if (normalized === 'draft') return 'Draft';
  if (['failed', 'pending'].includes(normalized)) return 'Pending';
  if (normalized === 'sent') return 'Terkirim';
  if (normalized === 'delivered') return 'Diterima';
  if (['read', 'seen'].includes(normalized)) return 'Dibaca';
  return status || '-';
}

function waMessageStatusIcon(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (['read', 'seen'].includes(normalized)) return '<span class="wa-status-icon read" title="Dibaca" aria-label="Dibaca"></span>';
  if (normalized === 'delivered') return '<span class="wa-status-icon delivered" title="Diterima" aria-label="Diterima"></span>';
  if (normalized === 'sent') return '<span class="wa-status-icon sent" title="Terkirim" aria-label="Terkirim"></span>';
  if (normalized === 'queued') return '<span class="badge pending">Antrean</span>';
  if (normalized === 'draft') return '<span class="badge">Draft</span>';
  return '<span class="badge pending">Pending</span>';
}

function waMessagePreviewText(message = {}) {
  const text = String(message.text || '').trim();
  return text.length > 36 ? `${text.slice(0, 36)}...` : (text || 'Lihat pesan');
}

function waMessageTransientError(message = {}) {
  const error = String(message.lastError || '').trim();
  if (!error) return '';
  if (/session status is not as expected|try again later|restart the session|scan_qr_code|starting|stopped|failed/i.test(error)) {
    return 'Menunggu Whatsapp Gateway siap atau perlu scan ulang.';
  }
  return error;
}

function waMessageCanSend(message = {}) {
  const status = String(message.status || '').toLowerCase();
  return !['sent', 'delivered', 'read', 'seen'].includes(status);
}

function wahaFriendlyMessage(message = '') {
  const text = String(message || '').trim();
  if (!text) return '';
  if (/session status is not as expected|try again later|restart the session|scan_qr_code|starting|stopped|failed/i.test(text)) {
    return 'Session Whatsapp Gateway sedang disiapkan. Klik Tampilkan QR lagi beberapa detik lagi, lalu scan jika QR muncul.';
  }
  return text;
}

function openWaMessagePreviewModal(message = {}) {
  openModal('Preview Pesan WA', `
    <div class="stack compact-stack">
      <div class="receipt-lines wa-preview-lines">
        <div><span>To</span><strong>${escapeHtml(message.phone || '-')}</strong></div>
        <div><span>Subject</span><strong>${escapeHtml(waMessageSubject(message))}</strong></div>
      </div>
      <label class="field full">
        <span>Message</span>
        <textarea rows="9" readonly>${escapeHtml(message.text || '')}</textarea>
      </label>
      <div class="modal-actions">
        <button class="button" value="cancel" type="submit">Tutup</button>
      </div>
    </div>
  `, async () => {});
}

function waMessageRows(messages = [], startNo = 1) {
  return messages.map((message, index) => {
    const errorText = waMessageTransientError(message);
    return `
    <tr>
      <td class="nowrap wa-message-no-cell">
        <input type="checkbox" data-wa-message-select="${escapeHtml(message.id)}" aria-label="Pilih pesan ${displayNumber(startNo + index)}">
        <span>${displayNumber(startNo + index)}</span>
      </td>
      <td class="nowrap wa-message-time-cell">${escapeHtml(dateTimeText(message.sentAt || message.updatedAt || message.createdAt || message.scheduledAt))}</td>
      <td class="wa-message-phone-cell">
        <strong>${escapeHtml(message.phone || '-')}</strong>
      </td>
      <td>${escapeHtml(waMessageSubject(message))}</td>
      <td class="wa-message-text">
        <button class="wa-message-preview-button" type="button" data-wa-message-preview="${index}" title="Lihat isi pesan">
          ${escapeHtml(waMessagePreviewText(message))}
        </button>
      </td>
      <td>
        ${waMessageStatusIcon(message.status)}
        ${errorText ? `<div class="muted clamp-2" title="${escapeHtml(errorText)}">${escapeHtml(errorText)}</div>` : ''}
      </td>
      <td>
        <div class="wa-message-row-actions">
          ${waMessageCanSend(message) ? `<button class="ghost-button compact" type="button" data-wa-message-send="${escapeHtml(message.id)}">Send</button>` : ''}
          <button class="danger-button compact" type="button" data-wa-message-delete="${escapeHtml(message.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

function waMessagePaginationControls(pagination = {}) {
  const page = Number(pagination.page || 1);
  const totalPages = Number(pagination.totalPages || 1);
  const total = Number(pagination.total || 0);
  const limitControl = pagerLimitControl('wa-message', pagination.limit || state.waMessageLimit || 10, 10);
  return `
    <div class="pager wa-message-pager">
      <button class="ghost-button compact" type="button" data-wa-message-page="${page - 1}" ${pagination.hasPrev ? '' : 'disabled'}>Sebelumnya</button>
      <span class="pager-info">Halaman ${displayNumber(page)} dari ${displayNumber(totalPages)} - ${displayNumber(total)} pesan</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-wa-message-page="${page + 1}" ${pagination.hasNext ? '' : 'disabled'}>Berikutnya</button>
    </div>
  `;
}

const WA_BILLING_TEMPLATE_DEFINITIONS = [
  { key: 'invoiceIssued', label: 'Invoice Terbit' },
  { key: 'paymentReminder', label: 'Invoice Reminder' },
  { key: 'invoiceOverdue', label: 'Invoice Overdue' },
  { key: 'paymentPaid', label: 'Payment Paid' },
  { key: 'accountSuspend', label: 'Account Suspend' },
  { key: 'accountActive', label: 'Account Active' }
];

const WA_HOTSPOT_TEMPLATE_DEFINITIONS = [
  { key: 'voucherIssued', label: 'Voucher Terbit' },
  { key: 'voucherExpired', label: 'Voucher Expired' }
];

const WA_TEMPLATE_DEFINITIONS = [
  ...WA_BILLING_TEMPLATE_DEFINITIONS,
  ...WA_HOTSPOT_TEMPLATE_DEFINITIONS
];

const WA_INVOICE_VARIABLES = [
  ['[fullname]', 'Full Name'],
  ['[nama_usaha]', 'Nama Usaha'],
  ['[alamat]', 'Alamat Pelanggan'],
  ['[uid]', 'Customer ID'],
  ['[pppoe_user]', 'PPPoE Username'],
  ['[pppoe_pass]', 'PPPoE Password'],
  ['[pppoe_profile]', 'PPPoE Profile'],
  ['[no_invoice]', 'No Invoice'],
  ['[invoice_date]', 'Invoice Date'],
  ['[amount]', 'Amount'],
  ['[add_ons]', 'Add Ons'],
  ['[add_ons_total]', 'Total Add Ons'],
  ['[ppn]', 'VAT'],
  ['[discount]', 'Diskon'],
  ['[total]', 'Total (amount after VAT or discount)'],
  ['[admin_fee]', 'Admin Fee Payment Gateway'],
  ['[gateway_total]', 'Total Payment Gateway'],
  ['[period]', 'Invoice Period'],
  ['[due_date]', 'Due Date'],
  ['[suspend_grace]', 'Batas isolir dari Billing Setting'],
  ['[suspend_grace_days]', 'Jumlah hari grace isolir'],
  ['[payment_gateway]', 'Payment Gateway Link'],
  ['[invoice_link]', 'Link invoice/status pembayaran'],
  ['[paid_invoice_link]', 'Link bukti pembayaran lunas'],
  ['[payment_mutasi]', 'Bank Transfer Payment Method'],
  ['[paid_method]', 'Payment Method'],
  ['[footer]', 'Signature']
];

const WA_HOTSPOT_VARIABLES = [
  ['[fullname]', 'Full Name'],
  ['[nama_usaha]', 'Nama Usaha'],
  ['[reference]', 'Reference order'],
  ['[voucher_user]', 'Username voucher'],
  ['[voucher_pass]', 'Password voucher'],
  ['[voucher_profile]', 'Paket voucher'],
  ['[voucher_price]', 'Harga voucher'],
  ['[amount]', 'Amount'],
  ['[total]', 'Total'],
  ['[validity]', 'Masa aktif profile'],
  ['[valid_until]', 'Masa aktif sampai'],
  ['[started_at]', 'Mulai aktif'],
  ['[expired_at]', 'Waktu expired'],
  ['[login_url]', 'Link login hotspot'],
  ['[voucher_list]', 'List voucher'],
  ['[quantity]', 'Jumlah voucher'],
  ['[nas]', 'NAS/Site'],
  ['[footer]', 'Signature']
];

const WA_GATEWAY_PROVIDER_DEFAULTS = [
  { value: 'waha', label: 'Whatsapp Gateway', baseUrl: 'http://127.0.0.1:8895', autoBaseUrl: false }
];

function waGatewayProviderRows(settings = {}) {
  return WA_GATEWAY_PROVIDER_DEFAULTS;
}

function normalizeWaProviderValue(value = '') {
  const provider = String(value || '').trim().toLowerCase();
  if (['custom', 'standalone', 'self', 'sendiri', 'wa-sendiri'].includes(provider)) return 'waha';
  return 'waha';
}

function waProviderLabel(value = '', providers = WA_GATEWAY_PROVIDER_DEFAULTS) {
  const provider = providers.find((item) => item.value === normalizeWaProviderValue(value));
  return provider ? provider.label : String(value || '-').toUpperCase();
}

function wahaQrImage(qr = {}) {
  if (qr.connected) {
    return `
      <div class="notice positive">
        <strong>Whatsapp Gateway terhubung</strong>
        <span>${escapeHtml(wahaFriendlyMessage(qr.message) || 'Session sudah aktif dan siap mengirim pesan.')}</span>
      </div>
    `;
  }
  const data = qr.data || qr.image || qr.base64 || '';
  const mime = qr.mimetype || qr.mime || 'image/png';
  if (data) {
    const src = String(data).startsWith('data:') ? data : `data:${mime};base64,${data}`;
    return `<img class="wa-qr-image" src="${escapeHtml(src)}" alt="QR Whatsapp Gateway">`;
  }
  const raw = qr.value || qr.raw || '';
  if (raw) {
    const rawText = String(raw).trim();
    if (rawText.startsWith('data:image/')) {
      return `<img class="wa-qr-image" src="${escapeHtml(rawText)}" alt="QR Whatsapp Gateway">`;
    }
    if (/^[A-Za-z0-9+/=\s]{200,}$/.test(rawText)) {
      return `<img class="wa-qr-image" src="data:image/png;base64,${escapeHtml(rawText.replace(/\s+/g, ''))}" alt="QR Whatsapp Gateway">`;
    }
    return `<pre class="code-block">${escapeHtml(rawText)}</pre>`;
  }
  return `<div class="notice warning"><strong>QR belum tersedia</strong><span>${escapeHtml(wahaFriendlyMessage(qr.message) || 'Klik Tampilkan QR lagi untuk reconnect/start session otomatis.')}</span></div>`;
}

function wahaStatusLabel(status = {}) {
  return status?.status || status?.state || status?.engine?.state || JSON.stringify(status || {});
}

function wahaStatusRaw(status = {}) {
  if (!status || typeof status !== 'object') return '';
  return String(status.status || status.state || status.engine?.state || '').trim();
}

function wahaIsOnline(status = {}) {
  return ['WORKING', 'CONNECTED', 'READY', 'ONLINE'].includes(wahaStatusRaw(status).toUpperCase());
}

function wahaStatusText(status = {}) {
  const raw = wahaStatusRaw(status).toUpperCase();
  if (wahaIsOnline(status)) return 'Online';
  if (!raw || ['STOPPED', 'FAILED', 'DISCONNECTED', 'SCAN_QR_CODE', 'STARTING'].includes(raw)) return 'Offline';
  return raw;
}

function wahaDisplayJid(value = '') {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text.includes('@')) {
    const [user, domain] = text.split('@');
    return domain === 'c.us' ? `${user}@s.whatsapp.net` : text;
  }
  return /^\d+$/.test(text) ? `${text}@s.whatsapp.net` : text;
}

function wahaProfile(status = {}, session = '') {
  const me = status.me || status.user || status.account || {};
  const rawName = me.pushName || me.name || me.verifiedName || status.profile?.name || status.pushName || '';
  const fallbackName = String(status.name || session || '').trim();
  const name = rawName || (fallbackName && fallbackName !== 'default' ? fallbackName : '');
  return {
    status: wahaStatusText(status),
    online: wahaIsOnline(status),
    jid: wahaDisplayJid(me.id || me.jid || me.user || status.jid || status.phone || ''),
    name: name || '-'
  };
}

function wahaStatusCard(result = {}) {
  if (result.loading) {
    return '<div class="wa-gateway-status-loading">Memuat status gateway...</div>';
  }
  if (result.error) {
    return `
      <div class="wa-gateway-status-grid">
        <div class="wa-gateway-status-field"><span>Status</span><strong class="negative">Offline</strong></div>
        <div class="wa-gateway-status-field wide"><span>Jid</span><strong>-</strong></div>
        <div class="wa-gateway-status-field"><span>Name</span><strong>-</strong></div>
        <div class="wa-gateway-status-field action"><span>Action</span><button class="button compact" id="wahaQrAction" type="button">Tampilkan QR</button></div>
      </div>
      <div class="muted clamp-2">${escapeHtml(result.error)}</div>
    `;
  }
  const profile = wahaProfile(result.status || {}, result.session || '');
  return `
    <div class="wa-gateway-status-grid">
      <div class="wa-gateway-status-field"><span>Status</span><strong class="${profile.online ? 'positive' : 'negative'}">${escapeHtml(profile.status)}</strong></div>
      <div class="wa-gateway-status-field wide"><span>Jid</span><strong>${escapeHtml(profile.jid)}</strong></div>
      <div class="wa-gateway-status-field"><span>Name</span><strong>${escapeHtml(profile.name)}</strong></div>
      <div class="wa-gateway-status-field action"><span>Action</span>${profile.online
        ? '<button class="danger-button compact" id="wahaLogout" type="button">Logout</button>'
        : '<button class="button compact" id="wahaQrAction" type="button">Tampilkan QR</button>'}</div>
    </div>
  `;
}

function openWahaQrModal(qr = {}, onConnected = null) {
  let stopped = false;
  let polling = false;
  let pollTimer = null;
  let closeTimer = null;
  const stopPolling = () => {
    stopped = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  };
  const updateQrStatus = (message, tone = '') => {
    const statusEl = modalBody.querySelector('[data-waha-qr-status]');
    if (!statusEl) return;
    statusEl.className = `notice ${tone}`.trim();
    statusEl.innerHTML = `<strong>${escapeHtml(message)}</strong>`;
  };
  const checkConnected = async () => {
    if (stopped || !modal.open) {
      stopPolling();
      return;
    }
    if (polling) return;
    polling = true;
    try {
      updateQrStatus(qr.connected ? 'Memastikan Whatsapp Gateway tetap online...' : 'Mengecek koneksi Whatsapp Gateway...');
      const result = await api('/api/wa-gateway/waha/status', { timeoutMs: 7000 });
      if (!wahaIsOnline(result.status || {})) return;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      updateQrStatus('Berhasil terhubung. Popup akan ditutup otomatis.', 'positive');
      setToast('Whatsapp Gateway sudah online');
      if (typeof onConnected === 'function') {
        await onConnected(result);
      }
      closeTimer = setTimeout(() => {
        if (modal.open) modal.close();
      }, 1200);
    } catch {
      updateQrStatus('Menunggu koneksi gateway...');
    } finally {
      polling = false;
    }
  };
  openModal('Whatsapp Gateway', `
    <div class="stack compact-stack">
      <div class="wa-qr-box">${wahaQrImage(qr)}</div>
      <div class="notice ${qr.connected ? 'positive' : ''}" data-waha-qr-status><strong>${qr.connected ? 'Whatsapp Gateway terhubung.' : 'Menunggu scan dari WhatsApp...'}</strong></div>
      <div class="modal-actions">
        <button class="button" value="cancel" type="submit">Tutup</button>
      </div>
    </div>
  `, async () => {});
  modal.addEventListener('close', stopPolling, { once: true });
  pollTimer = setInterval(checkConnected, 2000);
  setTimeout(checkConnected, 800);
}

function waGatewayTemplateModalBody(settings = {}, definitions = WA_BILLING_TEMPLATE_DEFINITIONS, variables = WA_INVOICE_VARIABLES) {
  const templates = settings.templates || {};
  const variableGuide = `
    <aside class="wa-template-help">
      <div class="wa-template-help-title">Variable Template</div>
      <div class="wa-template-variable-list">
        ${variables.map(([code, label]) => `
          <div class="wa-template-variable">
            <code>${escapeHtml(code)}</code>
            <span>${escapeHtml(label)}</span>
          </div>
        `).join('')}
      </div>
      <div class="wa-template-format-note">
        <span>Gunakan <code>*example*</code> untuk bold.</span>
        <span>Gunakan <code>_example_</code> untuk italic.</span>
      </div>
    </aside>
  `;
  return `
    <div class="stack compact-stack wa-template-modal">
      <div class="wa-template-editor">
        <label class="field wa-template-picker">
          <span>Type Template Message</span>
          <select id="waTemplateSectionSelect" name="_templateType">
          ${definitions.map((item, index) => `
            <option value="${escapeHtml(item.key)}" ${index === 0 ? 'selected' : ''}>${escapeHtml(item.label)}</option>
          `).join('')}
          </select>
        </label>
        <section class="wa-template-row">
          <label class="field wa-template-message">
            <span id="waTemplateActiveLabel">${escapeHtml(definitions[0]?.label || 'Template')}</span>
            ${definitions.map((item, index) => `
              <textarea name="${escapeHtml(item.key)}" rows="13" data-wa-template-textarea="${escapeHtml(item.key)}" ${index === 0 ? '' : 'hidden'}>${escapeHtml(templates[item.key] || '')}</textarea>
            `).join('')}
          </label>
        </section>
        ${variableGuide}
      </div>
      <div class="modal-actions">
        <button class="ghost-button" value="cancel" type="submit">Batal</button>
        <button class="ghost-button" id="resetWaTemplates" type="button">Reset Default</button>
        <button class="button" type="submit">Simpan Template</button>
      </div>
    </div>
  `;
}

function openWaGatewayTemplatesModal(settings = {}, options = {}) {
  const definitions = options.definitions || WA_BILLING_TEMPLATE_DEFINITIONS;
  const variables = options.variables || WA_INVOICE_VARIABLES;
  const title = options.title || 'Templates';
  openModal(title, waGatewayTemplateModalBody(settings, definitions, variables), async (payload) => {
    const templates = { ...(settings.templates || {}) };
    for (const item of definitions) {
      templates[item.key] = payload[item.key] || '';
    }
    await api('/api/wa-gateway', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: settings.enabled === true,
        provider: settings.provider,
        baseUrl: settings.baseUrl,
        token: '',
        sender: settings.sender,
        minDelaySeconds: settings.minDelaySeconds,
        maxPerBatch: settings.maxPerBatch,
        quietStart: settings.quietStart,
        quietEnd: settings.quietEnd,
        templates
      })
    });
    setToast('Template WA tersimpan');
    renderWaGateway();
  });
  const activateTemplateSection = (key = '') => {
    const definition = definitions.find((item) => item.key === key) || definitions[0];
    if (!definition) return;
    const select = modalBody.querySelector('#waTemplateSectionSelect');
    if (select && select.value !== definition.key) select.value = definition.key;
    modalBody.querySelectorAll('[data-wa-template-textarea]').forEach((textarea) => {
      textarea.hidden = textarea.dataset.waTemplateTextarea !== definition.key;
    });
    const label = modalBody.querySelector('#waTemplateActiveLabel');
    if (label) label.textContent = definition.label;
  };
  modalBody.querySelector('#waTemplateSectionSelect')?.addEventListener('change', (event) => activateTemplateSection(event.target.value));
  modalBody.querySelector('#resetWaTemplates')?.addEventListener('click', async () => {
    if (!window.confirm('Reset semua template WA ke default?')) return;
    await api('/api/wa-gateway/templates/reset', {
      method: 'POST',
      body: JSON.stringify({})
    });
    setToast('Template WA direset ke default');
    modal.close();
    renderWaGateway();
  });
}

function waBroadcastModalBody(options = {}) {
  return `
    <div class="form-grid">
      <label class="field">
        <span>Penerima</span>
        <select name="target">
          <option value="all">All Member</option>
          <option value="active">Active Member</option>
          <option value="suspend">Suspend Member</option>
          <option value="terminated">Terminated Member</option>
        </select>
      </label>
      <label class="field">
        <span>NAS</span>
        <select name="nas">${radiusOptionTags(options.nas || [], 'all', 'Semua NAS')}</select>
      </label>
      <label class="field full">
        <span>Subject</span>
        <input name="subject" autocomplete="off" placeholder="Info gangguan / Maintenance / Tagihan">
      </label>
      <label class="field full">
        <span>Text</span>
        <textarea name="text" rows="6" required></textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button class="ghost-button" value="cancel" type="submit">Batal</button>
      <button class="button" type="submit">Broadcast</button>
    </div>
  `;
}

async function openWaBroadcastModal() {
  let options = { nas: [] };
  try {
    const payload = await api(`/api/radius/settings?${queryString({ page: 1, limit: 100, refresh: '1' })}`);
    options = { nas: radiusNasOptions(payload.rows || []) };
  } catch {
    options = { nas: [] };
  }
  openModal('Broadcast WA', waBroadcastModalBody(options), async (payload) => {
    const result = await api('/api/wa-gateway/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setToast(`Broadcast masuk antrean: ${displayNumber(result.queued || 0)} pesan`);
    renderWaGateway();
  });
}

async function renderWaGateway() {
  app.innerHTML = '<div class="empty">Memuat Whatsapp Gateway...</div>';
  const payload = await api(`/api/wa-gateway?${queryString({
    page: state.waMessagePage,
    limit: state.waMessageLimit
  })}`);
  const settings = payload.settings || {};
  const templates = settings.templates || {};
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const pagination = payload.pagination || {
    page: 1,
    limit: state.waMessageLimit,
    total: messages.length,
    totalPages: 1,
    hasPrev: false,
    hasNext: false
  };
  state.waMessagePage = Number(pagination.page || 1);
  state.waMessageLimit = pagerLimitValue(pagination.limit || state.waMessageLimit || 10, 10);
  const waStartNo = ((state.waMessagePage - 1) * effectivePagerLimit(state.waMessageLimit, pagination.total || messages.length, 10)) + 1;
  const selectedProvider = 'waha';
  app.innerHTML = `
    <div class="stack">
      <section class="form-panel">
        <div class="section-head">
          <h2>Whatsapp Gateway</h2>
        </div>
        <form id="waGatewayForm" class="form-grid">
          <label class="field checkbox-field">
            <input name="enabled" type="checkbox" value="true" ${settings.enabled ? 'checked' : ''}>
            <span>Enable gateway</span>
          </label>
          <input name="provider" id="waGatewayProvider" type="hidden" value="waha">
          <input name="baseUrl" id="waGatewayBaseUrl" type="hidden" value="">
          <input name="token" type="hidden" value="">
          <input name="sender" type="hidden" value="default">
          <input name="minDelaySeconds" type="hidden" value="${escapeHtml(settings.minDelaySeconds || 45)}">
          <input name="maxPerBatch" type="hidden" value="${escapeHtml(settings.maxPerBatch || 20)}">
          <div class="field full wa-gateway-top-panel" id="wahaTopPanel" ${selectedProvider === 'waha' ? '' : 'hidden'}>
            <div class="wa-gateway-status-inline" id="wahaHeaderStatus">
              ${wahaStatusCard({ loading: true })}
            </div>
            <div id="wahaPanelResult" class="wa-local-result"></div>
          </div>
          <div class="field full">
            <span>Kecepatan kirim</span>
            <div class="compact-text muted">Otomatis: pembayaran dan voucher diprioritaskan cepat, sedangkan broadcast dan postpaid billing cycle dikirim bertahap dengan jeda aman.</div>
          </div>
          <input name="quietStart" type="hidden" value="00:00">
          <input name="quietEnd" type="hidden" value="23:59">
          <div class="field full">
            <span>Template pesan</span>
            <div class="row-actions">
              <button class="ghost-button" id="openWaTemplates" type="button">Templates</button>
              <button class="ghost-button" id="openWaHotspotTemplates" type="button">Template Hotspot</button>
              <button class="ghost-button" id="openWaBroadcast" type="button">Broadcast</button>
            </div>
          </div>
          <div class="modal-actions field full">
            <button class="button" type="submit">Simpan Whatsapp Gateway</button>
          </div>
        </form>
      </section>
      <section class="section">
        <div class="section-head">
          <h3>Pesan Terkirim</h3>
          <div class="row-actions wa-message-batch-actions" id="waMessageBatchActions" hidden>
            <button class="ghost-button compact" id="waMessageBatchResend" type="button">Resend</button>
            <button class="danger-button compact" id="waMessageBatchDelete" type="button">Delete</button>
          </div>
        </div>
        <div class="table-wrap wa-message-table-wrap">
          <table class="wa-message-table">
            <thead>
              <tr>
                <th class="wa-message-no-cell">
                  <input type="checkbox" id="waMessageSelectAll" aria-label="Pilih semua pesan di halaman ini">
                  <span>No</span>
                </th>
                <th>Waktu</th>
                <th>Nomor Penerima</th>
                  <th>Subject</th>
                  <th>Text</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
            <tbody>${messages.length ? waMessageRows(messages, waStartNo) : '<tr><td colspan="7">Belum ada pesan.</td></tr>'}</tbody>
          </table>
        </div>
        ${waMessagePaginationControls(pagination)}
      </section>
    </div>
  `;
  let wahaStatusLoaded = false;
  const loadWahaStatus = async ({ force = false } = {}) => {
    const selected = normalizeWaProviderValue(document.getElementById('waGatewayProvider')?.value || selectedProvider);
    const statusPanel = document.getElementById('wahaHeaderStatus');
    if (!statusPanel || selected !== 'waha') return;
    if (wahaStatusLoaded && !force) return;
    wahaStatusLoaded = true;
    statusPanel.hidden = false;
    statusPanel.innerHTML = wahaStatusCard({ loading: true });
    try {
      const result = await api('/api/wa-gateway/waha/status');
      if (normalizeWaProviderValue(document.getElementById('waGatewayProvider')?.value || selectedProvider) !== 'waha') return;
      statusPanel.innerHTML = wahaStatusCard(result);
    } catch (error) {
      if (normalizeWaProviderValue(document.getElementById('waGatewayProvider')?.value || selectedProvider) !== 'waha') return;
      statusPanel.innerHTML = wahaStatusCard({ error: error.message || 'WAHA tidak bisa diakses' });
    }
  };
  const syncWaProviderUi = () => {
    const selected = normalizeWaProviderValue(document.getElementById('waGatewayProvider')?.value || selectedProvider);
    const wahaTopPanel = document.getElementById('wahaTopPanel');
    const wahaStatusPanel = document.getElementById('wahaHeaderStatus');
    const baseUrlField = document.getElementById('waGatewayBaseUrlField');
    const tokenField = document.getElementById('waGatewayTokenField');
    const senderField = document.getElementById('waGatewaySenderField');
    const tokenInput = document.querySelector('#waGatewayForm input[name="token"]');
    if (wahaTopPanel) wahaTopPanel.hidden = selected !== 'waha';
    if (wahaStatusPanel) wahaStatusPanel.hidden = selected !== 'waha';
    if (baseUrlField) baseUrlField.hidden = selected === 'waha';
    if (tokenField) tokenField.hidden = selected === 'waha';
    if (senderField) senderField.hidden = selected === 'waha';
    if (tokenInput) tokenInput.placeholder = settings.tokenConfigured && selected !== 'waha' ? 'Tersimpan' : 'Token provider';
    if (selected === 'waha') {
      loadWahaStatus();
    }
  };
  document.getElementById('waGatewayProvider')?.addEventListener('change', (event) => {
    syncWaProviderUi();
  });
  syncWaProviderUi();
  document.getElementById('waGatewayForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const raw = formData(event.currentTarget);
    await api('/api/wa-gateway', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: raw.enabled === true,
        provider: raw.provider,
        baseUrl: normalizeWaProviderValue(raw.provider) === 'waha' ? '' : raw.baseUrl,
        token: normalizeWaProviderValue(raw.provider) === 'waha' ? '' : raw.token,
        sender: normalizeWaProviderValue(raw.provider) === 'waha' ? 'default' : raw.sender,
        minDelaySeconds: raw.minDelaySeconds,
        maxPerBatch: raw.maxPerBatch,
        quietStart: raw.quietStart,
        quietEnd: raw.quietEnd,
        templates
      })
    });
    setToast('Whatsapp Gateway tersimpan');
    renderWaGateway();
  });
  document.getElementById('openWaTemplates')?.addEventListener('click', () => openWaGatewayTemplatesModal(settings));
  document.getElementById('openWaHotspotTemplates')?.addEventListener('click', () => openWaGatewayTemplatesModal(settings, {
    title: 'Template Hotspot',
    definitions: WA_HOTSPOT_TEMPLATE_DEFINITIONS,
    variables: WA_HOTSPOT_VARIABLES
  }));
  document.getElementById('openWaBroadcast')?.addEventListener('click', () => openWaBroadcastModal());
  const selectedWaMessages = new Set();
  const updateWaMessageBatchActions = () => {
    const batchActions = document.getElementById('waMessageBatchActions');
    const selectAll = document.getElementById('waMessageSelectAll');
    const checkboxes = [...app.querySelectorAll('[data-wa-message-select]')];
    if (batchActions) batchActions.hidden = selectedWaMessages.size === 0;
    if (selectAll) {
      selectAll.checked = checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox.checked);
      selectAll.indeterminate = checkboxes.some((checkbox) => checkbox.checked) && !selectAll.checked;
    }
  };
  document.getElementById('waMessageSelectAll')?.addEventListener('change', (event) => {
    const checked = event.target.checked;
    app.querySelectorAll('[data-wa-message-select]').forEach((checkbox) => {
      checkbox.checked = checked;
      const id = checkbox.dataset.waMessageSelect || '';
      if (!id) return;
      if (checked) selectedWaMessages.add(id);
      else selectedWaMessages.delete(id);
    });
    updateWaMessageBatchActions();
  });
  app.querySelectorAll('[data-wa-message-select]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const id = checkbox.dataset.waMessageSelect || '';
      if (!id) return;
      if (checkbox.checked) selectedWaMessages.add(id);
      else selectedWaMessages.delete(id);
      updateWaMessageBatchActions();
    });
  });
  document.getElementById('waMessageBatchResend')?.addEventListener('click', async () => {
    const ids = [...selectedWaMessages];
    if (!ids.length) return;
    await api('/api/wa-gateway/messages/batch-resend', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    setToast(`${displayNumber(ids.length)} pesan masuk antrean resend`);
    renderWaGateway();
  });
  document.getElementById('waMessageBatchDelete')?.addEventListener('click', async () => {
    const ids = [...selectedWaMessages];
    if (!ids.length) return;
    if (!window.confirm(`Hapus ${displayNumber(ids.length)} pesan WA terpilih?`)) return;
    const result = await api('/api/wa-gateway/messages/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    setToast(`${displayNumber(result.deleted || ids.length)} pesan dihapus`);
    renderWaGateway();
  });
  app.querySelectorAll('[data-wa-message-preview]').forEach((button) => {
    button.addEventListener('click', () => {
      const message = messages[Number(button.dataset.waMessagePreview || -1)];
      if (message) openWaMessagePreviewModal(message);
    });
  });
  app.querySelectorAll('[data-wa-message-send]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.waMessageSend || '';
      if (!id) return;
      button.disabled = true;
      try {
        await api(`/api/wa-gateway/messages/${encodeURIComponent(id)}/send`, {
          method: 'POST',
          body: JSON.stringify({})
        });
        setToast('Pesan masuk antrean resend');
        renderWaGateway();
      } catch (error) {
        button.disabled = false;
        setToast(error.message || 'Pesan gagal dikirim ulang');
      }
    });
  });
  app.querySelectorAll('[data-wa-message-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.waMessageDelete || '';
      if (!id) return;
      if (!window.confirm('Hapus pesan WA ini?')) return;
      button.disabled = true;
      try {
        await api('/api/wa-gateway/messages/batch-delete', {
          method: 'POST',
          body: JSON.stringify({ ids: [id] })
        });
        setToast('Pesan dihapus');
        renderWaGateway();
      } catch (error) {
        button.disabled = false;
        setToast(error.message || 'Pesan gagal dihapus');
      }
    });
  });
  app.querySelectorAll('[data-wa-message-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.waMessagePage = Math.max(1, Number(button.dataset.waMessagePage || 1));
      renderWaGateway();
    });
  });
  bindPagerLimit('wa-message', (limit) => {
    state.waMessageLimit = limit;
  }, (page) => {
    state.waMessagePage = page;
  }, renderWaGateway, 10);
  updateWaMessageBatchActions();
  document.getElementById('wahaHeaderStatus')?.addEventListener('click', async (event) => {
    const logoutButton = event.target.closest?.('#wahaLogout');
    const qrButton = event.target.closest?.('#wahaQrAction');
    const button = logoutButton || qrButton;
    if (!button) return;
    const resultEl = document.getElementById('wahaPanelResult');
    button.disabled = true;
    try {
      if (logoutButton) {
        button.textContent = 'Logout...';
        if (resultEl) resultEl.innerHTML = '<div class="empty compact">Logout Whatsapp Gateway...</div>';
        const result = await api('/api/wa-gateway/waha/logout', { method: 'POST', body: JSON.stringify({}) });
        if (resultEl) resultEl.innerHTML = `<div class="notice"><strong>Gateway logout</strong><span>${escapeHtml(wahaStatusLabel(result.status) || 'Session dihentikan')}</span></div>`;
      } else {
        button.textContent = 'Reconnect...';
        if (resultEl) resultEl.innerHTML = '<div class="empty compact">Mencoba reconnect Whatsapp Gateway...</div>';
        const result = await api('/api/wa-gateway/waha/qr');
        openWahaQrModal(result.qr || {}, () => {
          loadWahaStatus({ force: true });
          refreshTopWaStatus();
        });
        if (resultEl) {
          resultEl.innerHTML = result.qr?.connected
            ? '<div class="notice positive"><strong>Gateway terhubung</strong><span>Session berhasil aktif tanpa scan ulang.</span></div>'
            : '<div class="notice"><strong>QR ditampilkan</strong><span>Scan QR dari popup Whatsapp Gateway.</span></div>';
        }
      }
      await loadWahaStatus({ force: true });
      await refreshTopWaStatus();
    } catch (error) {
      if (resultEl) resultEl.innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`;
      await loadWahaStatus({ force: true });
      await refreshTopWaStatus();
    }
  });
}

function paymentProviderFields(settings = {}, provider = 'tripay') {
  const value = settings[provider] || {};
  const fields = {
    tripay: [
      { name: 'merchantCode', label: 'Merchant Code' },
      { name: 'apiKey', label: 'API Key', sensitive: true },
      { name: 'privateKey', label: 'Private Key', sensitive: true }
    ],
    midtrans: [
      { name: 'serverKey', label: 'Server Key', sensitive: true },
      { name: 'clientKey', label: 'Client Key', sensitive: true }
    ],
    xendit: [
      { name: 'secretKey', label: 'Secret API Key', sensitive: true },
      { name: 'callbackToken', label: 'Webhook Verification Token', sensitive: true },
      { name: 'accountId', label: 'Business/Sub-account ID', hint: 'Opsional, hanya untuk XenPlatform.' }
    ],
    doku: [
      { name: 'clientId', label: 'Client ID' },
      { name: 'secretKey', label: 'Secret Key', sensitive: true }
    ],
    duitku: [
      { name: 'merchantCode', label: 'Merchant Code' },
      { name: 'apiKey', label: 'API Key', sensitive: true }
    ],
    ipaymu: [
      { name: 'va', label: 'Virtual Account (VA)' },
      { name: 'apiKey', label: 'API Key', sensitive: true }
    ],
    custom: [
      { name: 'baseUrl', label: 'Base URL' },
      { name: 'apiKey', label: 'API Key', sensitive: true }
    ]
  }[provider] || [];
  return fields.map((field) => {
    const name = field.name;
    const sensitive = field.sensitive === true || /key|token|secret|private/i.test(name);
    return `
      <label class="field">
        <span>${escapeHtml(field.label)}</span>
        <input name="${escapeHtml(name)}" ${sensitive ? 'type="password"' : ''} value="${sensitive ? '' : escapeHtml(value[name] || '')}" placeholder="${sensitive && value[name] ? 'Tersimpan' : ''}" autocomplete="off">
        ${field.hint ? `<span class="muted">${escapeHtml(field.hint)}</span>` : ''}
      </label>
    `;
  }).join('');
}

function paymentProviderNotice(provider = 'tripay') {
  if (provider === 'tripay') return '';
  return `
    <div class="notice warning field full">
      <strong>Checkout otomatis belum aktif</strong>
      <span>Credential ${escapeHtml(provider.toUpperCase())} dapat disimpan, tetapi transaksi otomatis pada build ini masih menggunakan Tripay.</span>
    </div>
  `;
}

function paymentGatewayAdvancedModalBody(settings = {}) {
  return `
    <div class="form-grid">
      <label class="field full">
        <span>Link web pembayaran</span>
        <input name="publicBaseUrl" value="${escapeHtml(settings.publicBaseUrl || '')}" placeholder="https://billing.example.net">
      </label>
      <label class="field">
        <span>Path invoice</span>
        <input name="paymentPath" value="${escapeHtml(settings.paymentPath || '/payment-invoice.html')}" placeholder="/payment-invoice.html">
      </label>
      <label class="field">
        <span>Metode voucher</span>
        <input value="QRIS" disabled>
      </label>
      <label class="field">
        <span>Metode paket bulanan</span>
        <input value="Semua metode dari provider" disabled>
      </label>
      <label class="field">
        <span>Admin fee bulanan</span>
        <input name="monthlyAdminFee" inputmode="numeric" value="${escapeHtml(settings.monthlyAdminFee || 0)}">
      </label>
      <label class="field">
        <span>Admin fee voucher tetap</span>
        <input name="voucherAdminFee" inputmode="numeric" value="${escapeHtml(settings.voucherAdminFee ?? 750)}">
      </label>
      <label class="field">
        <span>Admin fee voucher (%)</span>
        <input name="voucherAdminFeePercent" inputmode="decimal" value="${escapeHtml(settings.voucherAdminFeePercent ?? 0.70)}">
      </label>
      <label class="field">
        <span>Masa aktif QRIS/e-wallet (menit)</span>
        <input name="checkoutTtlMinutes" inputmode="numeric" value="${escapeHtml(settings.checkoutTtlMinutes || 60)}">
      </label>
      <label class="field">
        <span>Masa aktif virtual account (menit)</span>
        <input name="checkoutVaTtlMinutes" inputmode="numeric" value="${escapeHtml(settings.checkoutVaTtlMinutes || 1440)}">
      </label>
      <label class="field">
        <span>Masa aktif gerai (menit)</span>
        <input name="checkoutRetailTtlMinutes" inputmode="numeric" value="${escapeHtml(settings.checkoutRetailTtlMinutes || 1440)}">
      </label>
      <label class="field">
        <span>Mulai riwayat provider</span>
        <input name="historyStartDate" type="date" value="${escapeHtml(settings.historyStartDate || '')}">
        <span class="muted">Transaksi sebelum tanggal ini tidak ditampilkan atau diimpor ulang.</span>
      </label>
      <section class="notice field full">
        <strong>Rincian gateway</strong>
        <span>Callback URL tetap satu untuk semua provider: /payment-gateway/webhook. Fee ini hanya muncul pada pembayaran lewat payment gateway. Khusus Tripay gerai, Rp3.000 dari fee bulanan otomatis dialokasikan sebagai biaya yang dibayar di kasir. Pembayaran manual tetap memakai nominal tagihan asli.</span>
      </section>
      <div class="modal-actions field full">
        <button class="ghost-button" value="cancel" type="submit">Batal</button>
        <button class="button" type="submit">Simpan Settings</button>
      </div>
    </div>
  `;
}

function openPaymentGatewaySettingsModal(settings = {}) {
  openModal('Settings Payment Gateway', paymentGatewayAdvancedModalBody(settings), async (payload) => {
    await api('/api/payment-gateway', {
      method: 'PUT',
      body: JSON.stringify({
        publicBaseUrl: payload.publicBaseUrl || '',
        paymentPath: payload.paymentPath || '/payment-invoice.html',
        monthlyAdminFee: payload.monthlyAdminFee || 0,
        voucherAdminFee: payload.voucherAdminFee || 750,
        voucherAdminFeePercent: payload.voucherAdminFeePercent || 0.70,
        checkoutTtlMinutes: payload.checkoutTtlMinutes || 60,
        checkoutVaTtlMinutes: payload.checkoutVaTtlMinutes || 1440,
        checkoutRetailTtlMinutes: payload.checkoutRetailTtlMinutes || 1440,
        historyStartDate: payload.historyStartDate || ''
      })
    });
    setToast('Settings Payment Gateway tersimpan');
    renderPaymentGateway();
  });
}

function paymentGatewayKindLabel(row = {}) {
  const value = String(row.transactionKind || row.sourceType || row.kind || '').toLowerCase();
  const reference = String(row.reference || row.invoiceNo || '').toLowerCase();
  if (row.transactionKindLabel) return row.transactionKindLabel;
  if (['hotspot-voucher', 'voucher-hotspot', 'voucher-online', 'hotspot', 'voucher'].includes(value) || value.includes('voucher') || row.voucherOrderId || reference.startsWith('vo-')) {
    return 'Voucher Hotspot';
  }
  if (['monthly-package', 'monthly-invoice', 'billing-invoice', 'paket-bulanan', 'invoice', 'billing'].includes(value) || value.includes('invoice') || value.includes('billing') || value.includes('monthly') || row.invoiceId || row.customerId) {
    return 'Paket Bulanan';
  }
  if (value === 'balance') return 'Saldo';
  if (value === 'fee') return 'Biaya';
  return 'Lainnya';
}

function paymentGatewayKindBadge(row = {}) {
  const label = paymentGatewayKindLabel(row);
  if (label === 'Voucher Hotspot') return 'pending';
  if (label === 'Paket Bulanan') return 'active';
  if (label === 'Biaya') return 'inactive';
  return '';
}

function paymentGatewayStatusLabel(status = '') {
  const value = String(status || '').trim().toLowerCase();
  if (['paid', 'settled', 'success'].includes(value)) return 'Dibayar';
  if (['pending', 'waiting', 'unpaid'].includes(value)) return 'Menunggu';
  if (['expired', 'expire'].includes(value)) return 'Kedaluwarsa';
  if (['cancelled', 'canceled'].includes(value)) return 'Dibatalkan';
  if (['failed', 'failure'].includes(value)) return 'Gagal';
  if (['refunded', 'refund'].includes(value)) return 'Dikembalikan';
  return status || '-';
}

function paymentGatewayProviderLabel(provider = '') {
  const value = String(provider || '').trim();
  if (!value) return '-';
  return value.toLowerCase() === 'tripay' ? 'Tripay' : value;
}

function paymentGatewayPendingStatus(row = {}) {
  return ['pending', 'waiting', 'unpaid'].includes(String(row.status || '').toLowerCase());
}

function paymentGatewayRows(rows = []) {
  return rows.map((row) => `
    <tr>
      <td class="payment-gateway-reference" data-label="Referensi">
        <strong title="${escapeHtml(row.reference || row.invoiceNo || row.id || '-')}">${escapeHtml(row.reference || row.invoiceNo || row.id || '-')}</strong>
        <div class="muted" title="${escapeHtml(row.description || row.customerName || '-')}">${escapeHtml(row.description || row.customerName || '-')}</div>
      </td>
      <td class="payment-gateway-kind" data-label="Jenis"><span class="badge ${paymentGatewayKindBadge(row)}">${escapeHtml(paymentGatewayKindLabel(row))}</span></td>
      <td class="payment-gateway-provider" data-label="Penyedia">${escapeHtml(paymentGatewayProviderLabel(row.provider))}</td>
      <td class="payment-gateway-method" data-label="Metode" title="${escapeHtml(row.method || row.paymentMethod || '-')}">${escapeHtml(row.method || row.paymentMethod || '-')}</td>
      <td class="payment-gateway-status" data-label="Status"><span class="badge ${xenditStatusBadge(row.status)}">${escapeHtml(paymentGatewayStatusLabel(row.status))}</span></td>
      <td class="amount payment-gateway-amount" data-label="Nominal">${rupiah(row.amount || 0)}</td>
      <td class="amount payment-gateway-fee" data-label="Biaya Merchant">${Number(row.feeMerchant ?? row.providerFee ?? row.fee ?? 0) ? rupiah(row.feeMerchant ?? row.providerFee ?? row.fee) : '-'}</td>
      <td class="payment-gateway-date" data-label="Tanggal">${row.paidAt || row.paymentAt || row.createdAt || row.date ? dateTimeText(row.paidAt || row.paymentAt || row.createdAt || row.date) : '-'}</td>
    </tr>
  `).join('');
}

function paymentGatewayPager(total = 0, limit = 10, page = 1) {
  const selectedLimit = pagerLimitValue(limit, 10);
  const effectiveLimit = effectivePagerLimit(selectedLimit, total, 10);
  const totalPages = Math.max(1, Math.ceil(Number(total || 0) / effectiveLimit));
  const limitControl = pagerLimitControl('payment-gateway', selectedLimit, 10);
  return `
    <div class="pager">
      <button class="ghost-button compact" type="button" data-payment-gateway-page="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
      <span class="pager-info">Halaman ${displayNumber(page)} dari ${displayNumber(totalPages)}</span>
      ${limitControl}
      <button class="ghost-button compact" type="button" data-payment-gateway-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Berikutnya</button>
    </div>
  `;
}

async function renderPaymentGateway(options = {}) {
  if (shouldShowPageLoading(options)) app.innerHTML = '<div class="empty">Memuat Payment Gateway...</div>';
  const limit = pagerLimitValue(state.paymentGatewayLimit || 10, 10);
  const params = queryString({
    from: state.xenditFrom,
    to: state.xenditTo,
    method: state.xenditMethod,
    kind: state.paymentGatewayKind,
    search: state.search,
    tab: state.paymentGatewayTab,
    page: state.paymentGatewayPage,
    limit
  });
  const payload = await api(`/api/payment-gateway?${params}`);
  const settings = payload.settings || {};
  const providers = Array.isArray(payload.providers) ? payload.providers : [];
  const provider = settings.provider || 'tripay';
  const callbackExampleBase = String(settings.publicBaseUrl || '').trim().replace(/\/+$/, '') || 'https://billing.example.net';
  const callbackExample = `${callbackExampleBase}/payment-gateway/webhook`;
  const tabTotals = payload.tabTotals || {};
  const pendingRows = payload.pending || [];
  const tabs = [
    { value: 'transactions', label: 'Transaksi' },
    { value: 'balance', label: 'Riwayat Saldo' },
    { value: 'pending', label: `Tertunda (${displayNumber(tabTotals.pending || pendingRows.length)})` },
    { value: 'fees', label: 'Laporan Biaya' }
  ];
  const rowsByTab = {
    transactions: (payload.transactions || []).filter((row) => !paymentGatewayPendingStatus(row)),
    balance: payload.balanceHistory || [],
    pending: pendingRows,
    fees: payload.reports || []
  };
  const tabRows = rowsByTab[state.paymentGatewayTab] || rowsByTab.transactions;
  const pagination = payload.pagination || { page: 1, limit, total: tabRows.length, totalPages: 1 };
  state.paymentGatewayPage = Number(pagination.page || 1);
  state.paymentGatewayLimit = pagerLimitValue(pagination.limit || limit, 10);
  const pageRows = tabRows;
  const summary = payload.summary || {};
  const historySync = payload.historySync || {};
  const historySyncText = historySync.syncedAt
    ? `Sinkron terakhir ${dateTimeText(historySync.syncedAt)}`
    : 'Riwayat Tripay belum disinkron';
  app.innerHTML = `
    <div class="stack">
      <section class="metrics">
        ${metric('Total Bersih Transaksi', rupiah(summary.netReceivedAmount || 0), 'Setelah biaya merchant, sesuai filter')}
        ${metric('Saldo Dalam Kliring', rupiah(summary.clearingBalance || 0), 'Estimasi 3 hari kerja dari webhook', Number(summary.clearingBalance || 0) ? 'warning-card' : '')}
        ${metric('Biaya Merchant', rupiah(summary.merchantFees || summary.fees || 0), 'Biaya pada transaksi dibayar')}
      </section>
      <section class="form-panel">
        <div class="section-head">
          <h2>Payment Gateway</h2>
          <div class="section-actions">
            <span class="muted">${escapeHtml(historySyncText)}</span>
            ${provider === 'tripay' ? `
              <button class="ghost-button compact" id="syncPaymentGatewayHistory" type="button">
                <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                Sinkron Tripay
              </button>
            ` : ''}
          </div>
        </div>
        <form id="paymentGatewayForm" class="form-grid">
          <label class="field checkbox-field">
            <input name="enabled" type="checkbox" value="true" ${settings.enabled ? 'checked' : ''}>
            <span>Aktifkan gateway</span>
          </label>
          <label class="field">
            <span>Provider</span>
            <select name="provider" id="paymentGatewayProvider">
              ${providers.map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === provider ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
            </select>
          </label>
          ${provider !== 'custom' ? `
            <label class="field">
              <span>Mode</span>
              <select name="mode">
                <option value="sandbox" ${settings.mode !== 'production' ? 'selected' : ''}>Sandbox</option>
                <option value="production" ${settings.mode === 'production' ? 'selected' : ''}>Production</option>
              </select>
            </label>
          ` : ''}
          ${provider === 'xendit' ? `
            <label class="field">
              <span>Saldo minimum tersisa</span>
              <input name="settlementReserveAmount" inputmode="numeric" value="${escapeHtml(settings.settlementReserveAmount ?? 10000)}">
              <span class="muted">Saldo yang tidak ikut ditarik saat withdraw.</span>
            </label>
          ` : ''}
          <label class="field">
            <span>Callback URL</span>
            <input name="callbackUrl" value="${escapeHtml(settings.callbackUrl || '')}" placeholder="${escapeHtml(callbackExample)}" inputmode="url" autocomplete="url">
            <span class="muted">Format: ${escapeHtml(callbackExample)}</span>
          </label>
          ${paymentProviderFields(settings, provider)}
          ${paymentProviderNotice(provider)}
          <div class="field payment-gateway-settings-field">
            <span>Pengaturan</span>
            <button class="icon-button payment-gateway-settings-button" id="paymentGatewayAdvancedButton" type="button" title="Settings Payment Gateway" aria-label="Settings Payment Gateway">
              <span aria-hidden="true"></span>
            </button>
          </div>
          <div class="modal-actions field full">
            <button class="button" type="submit">Simpan Payment Gateway</button>
          </div>
        </form>
      </section>
      <section class="section">
        <div class="toolbar xendit-toolbar">
          ${xenditTabs(state.paymentGatewayTab, tabs).replaceAll('data-xendit-tab', 'data-payment-gateway-tab')}
          <div class="filters">
            ${datePickerControl({ id: 'paymentGatewayFrom', value: state.xenditFrom, className: 'control' })}
            ${datePickerControl({ id: 'paymentGatewayTo', value: state.xenditTo, className: 'control' })}
            <select class="control" id="paymentGatewayKind">
              <option value="all" ${state.paymentGatewayKind === 'all' ? 'selected' : ''}>Semua transaksi</option>
              <option value="monthly-package" ${state.paymentGatewayKind === 'monthly-package' ? 'selected' : ''}>Paket Bulanan</option>
              <option value="hotspot-voucher" ${state.paymentGatewayKind === 'hotspot-voucher' ? 'selected' : ''}>Voucher Hotspot</option>
              <option value="balance" ${state.paymentGatewayKind === 'balance' ? 'selected' : ''}>Saldo</option>
              <option value="fee" ${state.paymentGatewayKind === 'fee' ? 'selected' : ''}>Biaya</option>
              <option value="other" ${state.paymentGatewayKind === 'other' ? 'selected' : ''}>Lainnya</option>
            </select>
            <input class="control" id="searchInput" value="${escapeHtml(state.search)}" placeholder="Cari reference, invoice, deskripsi" autocomplete="off">
          </div>
        </div>
        <div class="table-wrap payment-gateway-table-wrap">
          <table class="xendit-table payment-gateway-table">
            <colgroup>
              <col class="payment-gateway-col-reference">
              <col class="payment-gateway-col-kind">
              <col class="payment-gateway-col-provider">
              <col class="payment-gateway-col-method">
              <col class="payment-gateway-col-status">
              <col class="payment-gateway-col-amount">
              <col class="payment-gateway-col-fee">
              <col class="payment-gateway-col-date">
            </colgroup>
            <thead>
              <tr>
                <th>Referensi</th>
                <th>Jenis</th>
                <th>Penyedia</th>
                <th>Metode</th>
                <th>Status</th>
                <th class="amount">Nominal</th>
                <th class="amount">Biaya Merchant</th>
                <th>Tanggal</th>
              </tr>
            </thead>
            <tbody>${pageRows.length ? paymentGatewayRows(pageRows) : '<tr class="payment-gateway-empty"><td colspan="8">Belum ada transaksi payment gateway.</td></tr>'}</tbody>
          </table>
        </div>
        ${paymentGatewayPager(pagination.total || 0, state.paymentGatewayLimit, state.paymentGatewayPage)}
      </section>
    </div>
  `;
  document.getElementById('paymentGatewayAdvancedButton')?.addEventListener('click', () => {
    openPaymentGatewaySettingsModal(settings);
  });
  document.getElementById('syncPaymentGatewayHistory')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await api('/api/payment-gateway/sync', { method: 'POST' });
      setToast(result.message || 'Riwayat Tripay berhasil disinkron');
      await renderPaymentGateway();
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('paymentGatewayProvider')?.addEventListener('change', async (event) => {
    const raw = formData(document.getElementById('paymentGatewayForm'));
    raw.provider = event.target.value;
    await api('/api/payment-gateway', {
      method: 'PUT',
      body: JSON.stringify({ provider: raw.provider, enabled: raw.enabled === true, mode: raw.mode, callbackUrl: raw.callbackUrl, settlementReserveAmount: raw.settlementReserveAmount })
    });
    renderPaymentGateway();
  });
  document.getElementById('paymentGatewayForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const raw = formData(event.currentTarget);
    const providerPayload = {};
    ['merchantCode', 'apiKey', 'privateKey', 'merchantId', 'serverKey', 'clientKey', 'accountId', 'secretKey', 'callbackToken', 'clientId', 'sharedKey', 'va', 'baseUrl'].forEach((key) => {
      if (raw[key] !== undefined) providerPayload[key] = raw[key];
    });
    await api('/api/payment-gateway', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: raw.enabled === true,
        provider: raw.provider,
        mode: raw.mode,
        callbackUrl: raw.callbackUrl,
        settlementReserveAmount: raw.settlementReserveAmount,
        [raw.provider]: providerPayload
      })
    });
    setToast('Payment Gateway tersimpan');
    renderPaymentGateway();
  });
  app.querySelectorAll('[data-payment-gateway-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.paymentGatewayTab = button.dataset.paymentGatewayTab || 'transactions';
      state.paymentGatewayPage = 1;
      renderPaymentGateway();
    });
  });
  document.getElementById('paymentGatewayFrom')?.addEventListener('change', (event) => {
    state.xenditFrom = event.target.value || `${todayInput().slice(0, 8)}01`;
    state.paymentGatewayPage = 1;
    renderPaymentGateway();
  });
  document.getElementById('paymentGatewayTo')?.addEventListener('change', (event) => {
    state.xenditTo = event.target.value || todayInput();
    state.paymentGatewayPage = 1;
    renderPaymentGateway();
  });
  document.getElementById('paymentGatewayKind')?.addEventListener('change', (event) => {
    state.paymentGatewayKind = event.target.value || 'all';
    state.paymentGatewayPage = 1;
    renderPaymentGateway();
  });
  bindSearch((renderOptions = {}) => {
    state.paymentGatewayPage = 1;
    return renderPaymentGateway(renderOptions);
  });
  app.querySelectorAll('[data-payment-gateway-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.paymentGatewayPage = Math.max(1, Number(button.dataset.paymentGatewayPage || 1));
      renderPaymentGateway();
    });
  });
  bindPagerLimit('payment-gateway', (limitValue) => {
    state.paymentGatewayLimit = limitValue;
  }, (page) => {
    state.paymentGatewayPage = page;
  }, renderPaymentGateway, 10);
}

function publicInfoSettingsModalBody(publicInfo = {}) {
  return `
    <div class="form-grid">
      <label class="field">
        <span>Judul hero</span>
        <input name="heroTitle" value="${escapeHtml(publicInfo.heroTitle || '')}" maxlength="120">
      </label>
      <label class="field">
        <span>Label tombol kontak</span>
        <input name="contactLabel" value="${escapeHtml(publicInfo.contactLabel || '')}" maxlength="120">
      </label>
      <label class="field full">
        <span>Deskripsi hero</span>
        <textarea name="heroText" rows="3" maxlength="600">${escapeHtml(publicInfo.heroText || '')}</textarea>
      </label>
      <label class="field">
        <span>Judul produk</span>
        <input name="productTitle" value="${escapeHtml(publicInfo.productTitle || '')}" maxlength="120">
      </label>
      <label class="field">
        <span>Nomor Whatsapp CS</span>
        <input name="contactPhone" value="${escapeHtml(publicInfo.contactPhone || '')}" maxlength="40" placeholder="08xxxxxxxxxx">
      </label>
      <label class="field full">
        <span>Deskripsi produk</span>
        <textarea name="productText" rows="3" maxlength="900">${escapeHtml(publicInfo.productText || '')}</textarea>
      </label>
      <label class="field">
        <span>Judul voucher</span>
        <input name="voucherTitle" value="${escapeHtml(publicInfo.voucherTitle || '')}" maxlength="120">
      </label>
      <label class="field">
        <span>Judul paket bulanan</span>
        <input name="billingTitle" value="${escapeHtml(publicInfo.billingTitle || '')}" maxlength="120">
      </label>
      <label class="field">
        <span>Alur pembelian voucher</span>
        <textarea name="voucherSteps" rows="6" maxlength="1200" placeholder="Satu baris untuk satu poin">${escapeHtml(publicInfo.voucherSteps || '')}</textarea>
      </label>
      <label class="field">
        <span>Alur pembayaran bulanan</span>
        <textarea name="billingSteps" rows="6" maxlength="1200" placeholder="Satu baris untuk satu poin">${escapeHtml(publicInfo.billingSteps || '')}</textarea>
      </label>
      <label class="field">
        <span>Judul S&K</span>
        <input name="termsTitle" value="${escapeHtml(publicInfo.termsTitle || '')}" maxlength="120">
      </label>
      <label class="field">
        <span>Judul bantuan</span>
        <input name="supportTitle" value="${escapeHtml(publicInfo.supportTitle || '')}" maxlength="120">
      </label>
      <label class="field">
        <span>Isi S&K</span>
        <textarea name="termsText" rows="5" maxlength="1000">${escapeHtml(publicInfo.termsText || '')}</textarea>
      </label>
      <label class="field">
        <span>Isi bantuan</span>
        <textarea name="supportText" rows="5" maxlength="700">${escapeHtml(publicInfo.supportText || '')}</textarea>
      </label>
      <section class="notice field full">
        <strong>Halaman publik</strong>
        <span>Perubahan ini tampil di /public-info.html. Bagian alur memakai satu baris sebagai satu poin daftar.</span>
      </section>
      <div class="modal-actions field full">
        <button class="ghost-button" value="cancel" type="button">Batal</button>
        <button class="button" type="submit">Simpan Public Info</button>
      </div>
    </div>
  `;
}

function openPublicInfoSettingsModal(publicInfo = {}) {
  openModal('Edit Public Info', publicInfoSettingsModalBody(publicInfo), async (payload) => {
    const result = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ publicInfo: payload })
    });
    updateBranding({ settings: result.settings });
    setToast('Public info tersimpan');
    renderSettings();
  });
}

function changelogPreviewMarkup(raw = '') {
  const source = String(raw || '').trim();
  if (!source) {
    return '<div class="empty">Belum ada changelog rilis.</div>';
  }
  const sections = source
    .split(/(?=^##\s+)/m)
    .map((section) => section.trim())
    .filter((section) => section.startsWith('## '))
    .slice(0, 10);
  if (!sections.length) {
    return `<div class="changelog-release"><p>${escapeHtml(source)}</p></div>`;
  }
  return sections.map((section) => {
    const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const heading = lines.shift() || 'Perubahan';
    const versionHeading = heading.match(/^##\s+\[([^\]]+)\]\s*-\s*(\d{4}-\d{1,2}-\d{1,2})/);
    const headingText = versionHeading
      ? `v${versionHeading[1]} · ${dateText(versionHeading[2])}`
      : heading.replace(/^##\s+/, '');
    const body = lines.map((line) => {
      if (line.startsWith('### ')) {
        return `<h4>${escapeHtml(line.slice(4))}</h4>`;
      }
      if (line.startsWith('- ')) {
        return `<div class="changelog-item"><i class="fa-solid fa-check" aria-hidden="true"></i><span>${escapeHtml(line.slice(2))}</span></div>`;
      }
      return `<p>${escapeHtml(line.replace(/^#+\s*/, ''))}</p>`;
    }).join('');
    return `
      <article class="changelog-release">
        <h3>${escapeHtml(headingText)}</h3>
        ${body}
      </article>
    `;
  }).join('');
}

function openAppChangelogModal(changelogText = '') {
  openModal('Changelog - 10 Perubahan Terakhir', `
    <div class="changelog-preview">
      ${changelogPreviewMarkup(changelogText)}
    </div>
    <div class="modal-actions">
      <button class="ghost-button" type="button" data-close-modal>Tutup</button>
    </div>
  `, async () => {});
}

function appUpdateVersionLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  return /^\d/.test(raw) ? `v${raw}` : raw;
}

function appUpdateLogTail(log = '') {
  const lines = String(log || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return lines.slice(-80).join('\n');
}

function appUpdateLogHasTimestamp(line = '') {
  return /^\s*(?:\[[^\]]*(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})[^\]]*\]|\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/.test(String(line || ''));
}

function appUpdateFormattedLog(log = '', polledAt = new Date().toISOString()) {
  const fallbackTimestamp = `${dateTimeText(polledAt)} ${appTimeZoneLabel()}`.trim();
  const lines = String(log || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  if (!lines.length) return 'Belum ada log update.';
  return lines.map((line) => {
    if (appUpdateLogHasTimestamp(line)) return line;
    return `[${fallbackTimestamp}] ${line}`;
  }).join('\n');
}

function appUpdateLatestLogLine(log = '') {
  const lines = String(log || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1] : 'Menunggu log update terbaru...';
}

function scrollAppUpdateLogToBottom() {
  const output = modalBody.querySelector('[data-app-update-log-output]');
  if (!output) return;
  window.requestAnimationFrame(() => {
    output.scrollTop = output.scrollHeight;
  });
}

function appUpdateProgressPercent({ running = false, done = false, failed = false, waiting = false, log = '', elapsedSeconds = 0 } = {}) {
  if (done) {
    appUpdateProgressLastPercent = 100;
    return 100;
  }
  if (failed) {
    return Math.max(12, Math.min(96, appUpdateProgressLastPercent || 72));
  }
  const text = String(log || '');
  let percent = waiting ? 76 : 8;
  if (/memulai|dimulai|menyiapkan/i.test(text)) percent = Math.max(percent, 12);
  if (/backup|stash|menyimpan/i.test(text)) percent = Math.max(percent, 22);
  if (/git|fetch|pull|checkout|reset|merge/i.test(text)) percent = Math.max(percent, 36);
  if (/dependency|npm|install|package|tesseract|ocr|apt|dnf|apk/i.test(text)) percent = Math.max(percent, 58);
  if (/migrasi|migration|schema|database|repair/i.test(text)) percent = Math.max(percent, 74);
  if (/restart|systemctl|service/i.test(text)) percent = Math.max(percent, 88);
  if (running || waiting) {
    const timePercent = Math.min(92, 10 + Math.floor(Number(elapsedSeconds || 0) / 4));
    percent = Math.max(percent, timePercent);
  }
  percent = Math.max(appUpdateProgressLastPercent || 0, Math.min(96, percent));
  appUpdateProgressLastPercent = percent;
  return percent;
}

function appUpdateCloseEnabled(enabled) {
  modal.querySelectorAll('[data-close-modal], #appUpdateProgressClose').forEach((button) => {
    button.disabled = !enabled;
    button.title = enabled ? 'Tutup' : 'Update masih berjalan';
  });
}

function renderAppUpdateProgress(payload = {}, options = {}) {
  const processStatus = payload.process || {};
  const updateInfo = payload.update || {};
  const running = options.running ?? processStatus.running === true;
  const failed = options.failed === true || processStatus.stale === true;
  const done = options.done === true;
  const waiting = options.waiting === true;
  const polledAt = options.polledAt || payload.polledAt || new Date().toISOString();
  const log = appUpdateLogTail(payload.log || options.log || '');
  const displayLog = appUpdateFormattedLog(log, polledAt);
  const title = failed
    ? 'Update gagal atau tertahan'
    : done
      ? 'Update selesai'
      : running
        ? 'Update sedang berjalan'
        : waiting
          ? 'Menunggu service kembali'
          : 'Menyiapkan update';
  const subtitle = failed
    ? (options.message || 'Periksa log terakhir, lalu jalankan update ulang jika diperlukan.')
    : done
      ? 'Aplikasi sudah diperbarui. Tutup popup atau muat ulang halaman untuk memakai file UI terbaru.'
      : running
        ? 'Jangan tutup browser atau restart service manual sampai proses selesai.'
        : waiting
          ? 'Service bisa terputus sebentar saat restart. Popup akan lanjut cek otomatis.'
          : 'Perintah update sedang dikirim ke server.';
  const installed = appUpdateVersionLabel(updateInfo.currentVersion || state.branding.appVersion);
  const remote = appUpdateVersionLabel(updateInfo.remoteVersion || updateInfo.currentVersion || state.branding.appVersion);
  const elapsedSeconds = appUpdateProgressStartedAt
    ? Math.max(0, Math.round((Date.now() - appUpdateProgressStartedAt) / 1000))
    : 0;
  const latestLogLine = appUpdateLatestLogLine(log);
  const percent = appUpdateProgressPercent({ running, done, failed, waiting, log, elapsedSeconds });
  const progressClass = failed ? 'is-failed' : done ? 'is-done' : running || waiting ? 'is-running' : '';

  modalBody.innerHTML = `
    <div class="app-update-progress" data-app-update-progress>
      <div class="app-update-meter-wrap">
        <div class="app-update-meter ${progressClass}" style="--update-progress: ${percent * 3.6}deg;">
          <div>
            <strong>${escapeHtml(`${percent}%`)}</strong>
            <span>${escapeHtml(done ? 'Selesai' : failed ? 'Gagal' : waiting ? 'Reconnect' : running ? 'Berjalan' : 'Mulai')}</span>
          </div>
        </div>
      </div>
      <div class="app-update-latest">
        <div>
          <span>Log terbaru</span>
          <strong>${escapeHtml(latestLogLine)}</strong>
        </div>
        <time datetime="${escapeHtml(polledAt)}">${escapeHtml(dateTimeText(polledAt))} ${escapeHtml(appTimeZoneLabel())}</time>
      </div>
      <section class="notice ${failed ? 'error' : done ? 'positive' : 'warning'}">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </section>
      <div class="app-update-progress-grid">
        <div>
          <span>Versi lokal</span>
          <strong>${escapeHtml(installed)}</strong>
        </div>
        <div>
          <span>Rilis terbaru</span>
          <strong>${escapeHtml(remote)}</strong>
        </div>
        <div>
          <span>Proses</span>
          <strong>${running ? `PID ${processStatus.pid || '-'}` : (done ? 'Selesai' : failed ? 'Gagal' : 'Menunggu')}</strong>
        </div>
        <div>
          <span>Durasi</span>
          <strong>${escapeHtml(`${elapsedSeconds} detik`)}</strong>
        </div>
      </div>
      <div class="app-update-log">
        <div class="app-update-log-head">
          <strong>Detail log proses</strong>
          <span>Otomatis mengikuti baris terakhir</span>
        </div>
        <pre data-app-update-log-output>${escapeHtml(displayLog)}</pre>
      </div>
      <div class="modal-actions">
        ${done ? '<button class="button" id="appUpdateProgressReload" type="button">Muat Ulang Halaman</button>' : ''}
        <button class="ghost-button" id="appUpdateProgressClose" type="button" ${done || failed ? '' : 'disabled'}>Tutup</button>
      </div>
    </div>
  `;
  modalBody.querySelector('#appUpdateProgressClose')?.addEventListener('click', () => modal.close());
  modalBody.querySelector('#appUpdateProgressReload')?.addEventListener('click', () => window.location.reload());
  scrollAppUpdateLogToBottom();
  appUpdateCloseEnabled(done || failed);
}

function clearAppUpdateProgressTimer() {
  if (appUpdateProgressTimer) {
    window.clearTimeout(appUpdateProgressTimer);
    appUpdateProgressTimer = null;
  }
}

function scheduleAppUpdateProgressPoll(delayMs = 2500) {
  clearAppUpdateProgressTimer();
  appUpdateProgressTimer = window.setTimeout(() => {
    pollAppUpdateProgress().catch(() => {});
  }, delayMs);
}

async function pollAppUpdateProgress() {
  if (!modal.open || !modalBody.querySelector('[data-app-update-progress]')) {
    clearAppUpdateProgressTimer();
    return;
  }
  const elapsedMs = appUpdateProgressStartedAt ? Date.now() - appUpdateProgressStartedAt : 0;
  try {
    const payload = await api('/api/system/update/status?refresh=1', {
      skipAuthRedirect: true,
      timeoutMs: 8000
    });
    const running = payload.process?.running === true || payload.running === true;
    const stale = payload.process?.stale === true;
    const log = String(payload.log || '');
    const logFinished = /Repair selesai|Update selesai|Update berhasil|Service.*restart/i.test(log);
    const logFailed = /(Update aplikasi gagal|Repair gagal|npm ERR!|fatal:|fatal error|failed to)/i.test(log) && !/Repair selesai/i.test(log);
    if (running) appUpdateProgressSeenRunning = true;
    const done = !running && !stale && !logFailed && (appUpdateProgressSeenRunning || logFinished || elapsedMs > 12000);
    const failed = stale || logFailed || elapsedMs > 20 * 60 * 1000;
    renderAppUpdateProgress(payload, {
      running,
      done,
      failed,
      message: failed ? 'Update tidak selesai normal. Cek log terakhir sebelum mencoba ulang.' : ''
    });
    if (done || failed) {
      clearAppUpdateProgressTimer();
      renderSettings({ refreshUpdateStatus: true }).catch(() => {});
      return;
    }
    scheduleAppUpdateProgressPoll(2500);
  } catch (error) {
    renderAppUpdateProgress({}, {
      waiting: true,
      log: error.message || 'Menunggu service update kembali...',
      running: false
    });
    scheduleAppUpdateProgressPoll(3000);
  }
}

async function openAppUpdateProgressModal() {
  clearAppUpdateProgressTimer();
  appUpdateProgressSeenRunning = false;
  appUpdateProgressStartedAt = Date.now();
  appUpdateProgressLastPercent = 0;
  openModal('Progress Update Aplikasi', `
    <div class="app-update-progress" data-app-update-progress></div>
  `, async () => {});
  renderAppUpdateProgress({ log: 'Memulai update...' }, { running: false });
  appUpdateCloseEnabled(false);
  const preventCancelWhileRunning = (event) => {
    if (modalBody.querySelector('#appUpdateProgressClose')?.disabled) {
      event.preventDefault();
    }
  };
  modal.addEventListener('cancel', preventCancelWhileRunning);
  modal.addEventListener('close', () => {
    clearAppUpdateProgressTimer();
    modal.removeEventListener('cancel', preventCancelWhileRunning);
  }, { once: true });
  try {
    const result = await api('/api/system/update', {
      method: 'POST',
      body: JSON.stringify({}),
      timeoutMs: 15000
    });
    renderAppUpdateProgress({
      update: {},
      process: { running: true, pid: result.pid || 0 },
      log: result.message || 'Update aplikasi dimulai...'
    }, { running: true });
    scheduleAppUpdateProgressPoll(1500);
  } catch (error) {
    renderAppUpdateProgress({}, {
      failed: true,
      log: error.message || 'Update aplikasi gagal dijalankan',
      message: error.message || 'Update aplikasi gagal dijalankan'
    });
  }
}

async function renderSettings(options = {}) {
  app.innerHTML = '<div class="empty">Memuat pengaturan...</div>';
  const { settings } = await api('/api/settings');
  let updateStatus = { updaterInstalled: false, log: '' };
  try {
    updateStatus = await api(`/api/system/update/status${options.refreshUpdateStatus ? '?refresh=1' : ''}`);
  } catch {
    updateStatus = { updaterInstalled: false, log: '' };
  }
  updateBranding({ settings });
  let pendingLogoUrl = null;
  const branding = currentBranding();
  const updateInfo = updateStatus.update || {};
  const updateAvailable = Boolean(updateInfo.updateAvailable);
  const versionLabel = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return /^\d/.test(raw) ? `v${raw}` : raw;
  };
  const installedVersion = updateInfo.currentVersion || updateInfo.localVersion || branding.appVersion;
  const latestVersion = updateInfo.remoteVersion || installedVersion;
  const installedVersionLabel = versionLabel(installedVersion);
  const latestVersionLabel = versionLabel(latestVersion);
  const hasNewVersion = updateAvailable && installedVersionLabel && latestVersionLabel && installedVersionLabel !== latestVersionLabel;
  const updateButtonUpToDate = Boolean(updateStatus.updaterInstalled && !updateInfo.error && !hasNewVersion);
  const updateButtonEnabled = Boolean(updateStatus.updaterInstalled && hasNewVersion && !updateStatus.running);
  const updateButtonClass = updateButtonUpToDate ? 'button update-ready-button' : 'button';
  const updateButtonText = updateButtonUpToDate ? 'Up To Date' : 'Update Aplikasi';
  const updateButtonTitle = !updateStatus.updaterInstalled
    ? 'Updater belum terpasang'
    : updateButtonUpToDate
      ? 'Versi aplikasi sudah terbaru'
      : hasNewVersion
        ? 'Jalankan update aplikasi'
        : 'Cek update terlebih dahulu';
  const changelogText = updateStatus.changelog || 'Belum ada changelog rilis.';
  const updateNoticeClass = !updateStatus.updaterInstalled || updateInfo.error ? 'warning' : hasNewVersion ? 'warning' : 'positive';
  const updateTitle = !updateStatus.updaterInstalled
    ? 'Updater belum terpasang'
    : updateInfo.error
      ? 'Status update belum bisa dicek'
      : hasNewVersion
        ? 'Update tersedia'
        : 'Up to Date';
  const updateDescription = !updateStatus.updaterInstalled
    ? 'Jalankan install.sh agar command updater terpasang di server.'
    : updateInfo.error
      ? updateInfo.error
      : hasNewVersion
        ? 'Rilis terbaru tersedia. Klik Update Aplikasi untuk memperbarui tanpa menghapus data.'
        : 'Versi aplikasi sudah memakai rilis terbaru.';
  const updateMeta = [
    installedVersionLabel ? `Terpasang: ${installedVersionLabel}` : '',
    latestVersionLabel ? `Rilis terbaru: ${latestVersionLabel}` : '',
    updateInfo.dirty ? 'Ada perubahan lokal, updater akan menyimpannya dulu sebelum pull.' : ''
  ].filter(Boolean).join(' | ');
  const collectorBonusTiers = Array.isArray(settings.collectorDailyBonusTiers) && settings.collectorDailyBonusTiers.length
    ? settings.collectorDailyBonusTiers
    : [
      { minAmount: 850000, maxAmount: 1499999, bonusAmount: 15000 },
      { minAmount: 1500000, maxAmount: 2499999, bonusAmount: 20000 },
      { minAmount: 2500000, maxAmount: 2999999, bonusAmount: 25000 },
      { minAmount: 3000000, maxAmount: 3999999, bonusAmount: 30000 },
      { minAmount: 4000000, maxAmount: 0, bonusAmount: 50000 }
    ];
  const collectorBonusTierText = collectorBonusTiers.map((tier) => {
    const maxText = Number(tier.maxAmount || 0) > 0 ? rupiah(tier.maxAmount) : 'lebih';
    return `${rupiah(tier.minAmount)} - ${maxText}: ${rupiah(tier.bonusAmount)}`;
  }).join('\n');
  app.innerHTML = `
    <div class="stack">
      <section class="form-panel">
        <div class="section-head">
          <h2>Pengaturan usaha</h2>
        </div>
        <form id="settingsForm" class="form-grid">
          <label class="field">
            <span>Nama usaha</span>
            <input name="businessName" value="${escapeHtml(settings.businessName || '')}">
          </label>
          <label class="field">
            <span>Label sidebar</span>
            <input name="appSubtitle" value="${escapeHtml(settings.appSubtitle || 'ISP Billing')}" maxlength="60">
          </label>
          <label class="field">
            <span>Zona waktu aplikasi</span>
            <select name="timeZonePreset" id="appTimeZonePreset">
              ${appTimeZoneOptionMarkup(settings.timeZone || DEFAULT_APP_TIME_ZONE)}
            </select>
            <small class="muted">Default WITA. Dipakai untuk laporan, scheduler invoice/reminder, isolir, dan tampilan jam.</small>
          </label>
          <label class="field">
            <span>Kode kuitansi pemasukan</span>
            <input name="receiptBusinessCode" value="${escapeHtml(settings.receiptBusinessCode || settings.billing?.invoiceBusinessCode || DEFAULT_BUSINESS_CODE)}" placeholder="KODE USAHA" maxlength="30">
          </label>
          <div class="field">
            <span>Halaman public-info</span>
            <button class="ghost-button" id="editPublicInfoButton" type="button">Edit Public Info</button>
          </div>
          <label class="field">
            <span>Komisi reseller voucher (%)</span>
            <input name="voucherRevenueSharePercent" type="number" min="0" max="100" step="0.01" value="${escapeHtml(settings.voucherRevenueSharePercent || 0)}">
          </label>
          <label class="field">
            <span>Bonus collector harian</span>
            <label class="check-row">
              <input name="collectorDailyBonusEnabled" type="checkbox" value="true" ${settings.collectorDailyBonusEnabled !== false ? 'checked' : ''}>
              <span>Aktifkan bonus tier harian</span>
            </label>
          </label>
          <label class="field">
            <span>Verifikasi login web billing</span>
            <label class="check-row">
              <input name="loginVerificationEnabled" type="checkbox" value="true" ${settings.security?.loginVerificationEnabled !== false ? 'checked' : ''}>
              <span>Aktifkan kode verifikasi saat login</span>
            </label>
          </label>
          <label class="field full">
            <span>Tier bonus collector default</span>
            <textarea rows="5" readonly>${escapeHtml(collectorBonusTierText)}</textarea>
          </label>
          <label class="field">
            <span>Upload logo</span>
            <input id="logoUploadInput" type="file" accept="image/png,image/jpeg,image/webp">
          </label>
          <div class="field logo-preview-field">
            <span>Preview logo</span>
            <div class="logo-preview">
              <img src="${escapeHtml(safeLogoUrl(settings.logoUrl))}" alt="Preview logo">
              <button class="ghost-button compact" id="resetLogoButton" type="button">Default</button>
            </div>
          </div>
          <div class="modal-actions field full">
            <button class="button" type="submit">Simpan Pengaturan</button>
          </div>
        </form>
      </section>

      <section class="form-panel">
        <div class="section-head">
          <h2>Backup & Restore Data</h2>
        </div>
        <div class="form-grid">
          <div class="field full">
            <span>Backup data aplikasi</span>
            <div class="notice">
              Backup berisi data penting aplikasi seperti pengaturan, user, member, radius, invoice, transaksi, inventaris, aset, WA gateway, payment gateway, dan log terkait. Simpan file ini dengan aman karena dapat memuat kredensial layanan.
            </div>
          </div>
          <div class="modal-actions field full">
            <button class="ghost-button" id="downloadSettingsBackup" type="button">Download Backup</button>
            <button class="danger-button" id="restoreSettingsBackup" type="button">Restore Backup</button>
            <input id="restoreSettingsBackupInput" type="file" accept="application/json,.json" hidden>
          </div>
        </div>
      </section>

      <section class="form-panel">
        <div class="section-head">
          <h2>Update Aplikasi</h2>
        </div>
        <div class="form-grid">
          <div class="field full">
            <span>Status updater</span>
            <div class="notice ${updateNoticeClass}">
              <strong>${escapeHtml(updateTitle)}</strong>
              <span>${escapeHtml(updateDescription)}</span>
              ${updateMeta ? `<span>${escapeHtml(updateMeta)}</span>` : ''}
            </div>
          </div>
          <div class="modal-actions field full">
            <button class="${updateButtonClass}" id="runAppUpdateButton" type="button" title="${escapeHtml(updateButtonTitle)}" ${updateButtonEnabled ? '' : 'disabled'}>${escapeHtml(updateButtonText)}</button>
            <button class="ghost-button" id="refreshAppUpdateStatus" type="button">Check for Update</button>
            <button class="ghost-button" id="openAppChangelogButton" type="button">Lihat Changelog</button>
          </div>
        </div>
      </section>

      <section class="release-footnote" aria-label="Informasi rilis aplikasi">
        <strong>Copyright ${escapeHtml(branding.copyrightYear)} - ${escapeHtml(branding.copyrightName)}</strong>
        <span>Versi ${escapeHtml(branding.appVersion)} · ${escapeHtml(dateText(branding.releaseDate))}</span>
      </section>
    </div>
  `;

  document.getElementById('logoUploadInput')?.addEventListener('change', async (event) => {
    const preview = document.querySelector('.logo-preview img');
    try {
      const uploadedLogo = await uploadLogoFile(event.target.files?.[0]);
      if (!uploadedLogo) return;
      pendingLogoUrl = uploadedLogo;
      if (preview) {
        preview.src = safeLogoUrl(uploadedLogo);
      }
    } catch (error) {
      event.target.value = '';
      setToast(error.message);
    }
  });

  document.getElementById('resetLogoButton')?.addEventListener('click', () => {
    pendingLogoUrl = DEFAULT_LOGO_URL;
    const input = document.getElementById('logoUploadInput');
    const preview = document.querySelector('.logo-preview img');
    if (input) {
      input.value = '';
    }
    if (preview) {
      preview.src = DEFAULT_LOGO_URL;
    }
  });

  document.getElementById('editPublicInfoButton')?.addEventListener('click', () => {
    openPublicInfoSettingsModal(settings.publicInfo || {});
  });

  document.getElementById('settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const selectedTimeZone = form.timeZonePreset.value || DEFAULT_APP_TIME_ZONE;
    const body = {
      businessName: form.businessName.value,
      appSubtitle: form.appSubtitle.value,
      timeZone: selectedTimeZone,
      receiptBusinessCode: form.receiptBusinessCode.value,
      voucherRevenueSharePercent: form.voucherRevenueSharePercent.value,
      collectorDailyBonusEnabled: form.collectorDailyBonusEnabled.checked,
      security: {
        loginVerificationEnabled: form.loginVerificationEnabled.checked
      }
    };
    if (pendingLogoUrl !== null) {
      body.logoUrl = pendingLogoUrl;
    }
    const result = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    updateBranding({ settings: result.settings });
    setToast('Pengaturan tersimpan');
    renderSettings();
  });

  document.getElementById('downloadSettingsBackup')?.addEventListener('click', async () => {
    try {
      await downloadFile('/api/settings/backup', `fakenet-billing-backup-${todayInput()}.json`);
    } catch (error) {
      setToast(error.message);
    }
  });

  document.getElementById('restoreSettingsBackup')?.addEventListener('click', () => {
    document.getElementById('restoreSettingsBackupInput')?.click();
  });

  document.getElementById('restoreSettingsBackupInput')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = await fileToText(file);
      const backup = JSON.parse(raw);
      if (!window.confirm('Restore backup akan menimpa data aplikasi saat ini. Lanjutkan restore?')) {
        return;
      }
      setToast('Restore backup diproses...');
      const result = await api('/api/settings/restore', {
        method: 'POST',
        body: JSON.stringify({ backup }),
        timeoutMs: 60000
      });
      updateBranding({ settings: result.settings });
      setToast('Restore backup berhasil. Aplikasi dimuat ulang...');
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setToast(error.message || 'Restore backup gagal');
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('refreshAppUpdateStatus')?.addEventListener('click', () => {
    renderSettings({ refreshUpdateStatus: true });
  });

  document.getElementById('openAppChangelogButton')?.addEventListener('click', () => {
    openAppChangelogModal(changelogText);
  });

  document.getElementById('runAppUpdateButton')?.addEventListener('click', async () => {
    if (!window.confirm('Update aplikasi akan membuat backup, memperbarui kode/dependency, lalu restart service. Lanjutkan?')) {
      return;
    }
    await openAppUpdateProgressModal();
  });

}

async function render(options = {}) {
  if (!state.auth) {
    renderLogin();
    return;
  }

  const renderToken = nextRenderGeneration();
  const renderOptions = { ...options, renderToken };
  try {
    if (!['monitoringCustomers', 'monitoringServices'].includes(state.view)) {
      clearRealtimeTimers();
    }
    state.search = state.view === 'dashboard' || state.view === 'users' || state.view === 'settings' ? '' : state.search;
    updatePeriodPicker();
    if (state.view === 'dashboard') await renderDashboard(renderOptions);
    else if (state.view === 'radiusPppDhcp') await renderRadiusPppDhcp(renderOptions);
    else if (state.view === 'radiusHotspot') await renderRadiusHotspot(renderOptions);
    else if (state.view === 'radiusSettings') await renderRadiusSettings(renderOptions);
    else if (state.view === 'genieAcs') await renderGenieAcs(renderOptions);
    else if (state.view === 'monitoringSite') await renderMonitoringSite();
    else if (state.view === 'monitoringMembers') await renderMonitoringMembers(renderOptions);
    else if (state.view === 'monitoringCustomers') await renderMonitoringCustomers(renderOptions);
    else if (state.view === 'monitoringBilling') await renderMonitoringBilling();
    else if (state.view === 'monitoringServices') await renderMonitoringServices();
    else if (state.view === 'externalIncomes') await renderExternalIncomes();
    else if (state.view === 'expenses') await renderExpenses();
    else if (state.view === 'billingSettings') await renderBillingSettings();
    else if (state.view === 'reportsDaily') await renderReportsDaily(renderOptions);
    else if (state.view === 'reportsMonthlyBilling') await renderReportsMonthlyBilling();
    else if (state.view === 'reportsStatistics') await renderReportsStatistics();
    else if (state.view === 'reportsVoucherDaily') await renderReportsVoucherDaily();
    else if (state.view === 'reportsVoucherMonthly') await renderReportsVoucherMonthly();
    else if (state.view === 'reportsTransactions') await renderReportsTransactions(renderOptions);
    else if (state.view === 'reportsFinanceRecap') await renderReportsFinanceRecap();
    else if (state.view === 'reportsInventoryStock') await renderReportsInventoryStock();
    else if (state.view === 'diagnostics') await renderDiagnostics(renderOptions);
    else if (state.view === 'activity') await renderActivity(renderOptions);
    else if (state.view === 'waGateway') await renderWaGateway();
    else if (state.view === 'paymentGateway') await renderPaymentGateway();
    else if (state.view === 'inventory') await renderInventory();
    else if (state.view === 'networkAssets') await renderNetworkAssets();
    else if (state.view === 'users') await renderUsers();
    else if (state.view === 'settings') await renderSettings();
    else if (!renderIsStale(renderToken)) app.innerHTML = empty('Halaman tidak tersedia');
    if (!renderIsStale(renderToken)) scheduleTableTopScrollbars(app);
  } catch (error) {
    if (renderIsStale(renderToken) || error.name === 'AbortError') return;
    app.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    setView(button.dataset.view);
    if (menuIsMobile()) {
      const group = button.closest('[data-nav-group]');
      if (group) {
        group.classList.remove('is-open');
        group.querySelector('[data-nav-toggle]')?.setAttribute('aria-expanded', 'false');
      }
      setMenuOpen(false);
    }
  });
});

function resetActionMenuPanel(menu) {
  const panel = menu?.querySelector?.('.action-menu-panel');
  if (!panel) return;
  panel.classList.remove('is-floating');
  panel.style.left = '';
  panel.style.top = '';
  panel.style.right = '';
  panel.style.bottom = '';
  panel.style.width = '';
  panel.style.maxHeight = '';
  panel.style.visibility = '';
}

function positionFloatingActionMenu(menu) {
  const summary = menu?.querySelector?.('summary');
  const panel = menu?.querySelector?.('.action-menu-panel');
  if (!menu?.open || !summary || !panel) return;
  panel.classList.add('is-floating');
  panel.style.left = '0px';
  panel.style.top = '0px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.width = 'auto';
  panel.style.visibility = 'hidden';
  requestAnimationFrame(() => {
    if (!menu.open) return;
    const margin = 8;
    const gap = 6;
    const summaryRect = summary.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 360;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 640;
    const panelWidth = Math.min(panelRect.width || 160, viewportWidth - (margin * 2));
    const panelHeight = Math.min(panelRect.height || 180, viewportHeight - (margin * 2));
    let left = summaryRect.right - panelWidth;
    let top = summaryRect.bottom + gap;
    left = Math.max(margin, Math.min(left, viewportWidth - panelWidth - margin));
    if (top + panelHeight > viewportHeight - margin) {
      top = summaryRect.top - panelHeight - gap;
    }
    top = Math.max(margin, Math.min(top, viewportHeight - panelHeight - margin));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${Math.max(140, viewportHeight - (margin * 2))}px`;
    panel.style.visibility = '';
  });
}

function bindFloatingActionMenus(root = document) {
  root.querySelectorAll('.action-menu').forEach((menu) => {
    if (menu.dataset.floatingBound === '1') return;
    menu.dataset.floatingBound = '1';
    menu.addEventListener('toggle', () => {
      if (menu.open) {
        closeActionMenus(menu);
        positionFloatingActionMenu(menu);
      } else {
        resetActionMenuPanel(menu);
      }
    });
  });
}

function closeActionMenus(except = null) {
  document.querySelectorAll('.action-menu').forEach((menu) => {
    if (menu === except) return;
    if (menu.open) {
      menu.removeAttribute('open');
    }
    resetActionMenuPanel(menu);
  });
}

document.addEventListener('click', (event) => {
  const activeMenu = event.target.closest?.('.action-menu');
  const actionButton = event.target.closest?.('.action-menu-panel button');
  if (actionButton) {
    closeActionMenus();
    return;
  }
  closeActionMenus(activeMenu);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeActionMenus();
});

document.addEventListener('scroll', () => closeActionMenus(), { capture: true, passive: true });

window.addEventListener('resize', closeActionMenus, { passive: true });
window.addEventListener('orientationchange', closeActionMenus, { passive: true });
window.addEventListener('scroll', closeActionMenus, { passive: true });

document.querySelectorAll('[data-nav-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const group = button.closest('[data-nav-group]');
    if (!group) return;
    const nextOpen = !group.classList.contains('is-open');
    document.querySelectorAll('[data-nav-group]').forEach((item) => {
      if (item !== group) {
        item.classList.remove('is-open');
        item.querySelector('[data-nav-toggle]')?.setAttribute('aria-expanded', 'false');
      }
    });
    group.classList.toggle('is-open', nextOpen);
    button.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    if (nextOpen) {
      window.requestAnimationFrame(() => {
        group.scrollIntoView({ block: 'nearest' });
      });
    }
  });
});

document.querySelectorAll('[data-open-nav-group]').forEach((button) => {
  button.addEventListener('click', () => {
    const group = document.querySelector(`[data-nav-group="${button.dataset.openNavGroup}"]`);
    if (!group) return;
    document.body.classList.remove('is-menu-full');
    document.querySelectorAll('[data-nav-group]').forEach((item) => {
      const open = item === group;
      item.classList.toggle('is-open', open);
      item.querySelector('[data-nav-toggle]')?.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (menuIsMobile()) {
      setMenuOpen(true);
    }
    window.requestAnimationFrame(() => {
      group.scrollIntoView({ block: 'nearest' });
    });
  });
});

document.querySelectorAll('[data-open-menu], [data-open-full-menu]').forEach((button) => {
  button.addEventListener('click', () => {
    document.body.classList.add('is-menu-full');
    const fullGroups = new Set(['monitoring', 'settings-menu', 'admin', 'configuration', 'adminSystem']);
    document.querySelectorAll('[data-nav-group]').forEach((group) => {
      const open = fullGroups.has(group.dataset.navGroup || '');
      group.classList.toggle('is-open', open);
      group.querySelector('[data-nav-toggle]')?.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (menuIsMobile()) setMenuOpen(true);
    window.requestAnimationFrame(() => {
      document.querySelector('[data-nav-group="monitoring"]')?.scrollIntoView({ block: 'nearest' });
    });
  });
});

window.addEventListener('popstate', () => {
  const nextView = currentHashView() || firstAvailableView();
  if (!state.auth) {
    rememberLoginReturnView(nextView);
    renderLogin();
    return;
  }
  setView(nextView, { replace: true });
});

applyTheme();
updatePeriodPicker();
periodPickerButton?.addEventListener('click', () => {
  setPeriodPickerOpen(periodPickerPanel?.hidden !== false);
});
periodYearSelect?.addEventListener('change', () => {
  const { month } = periodParts(state.period);
  setPeriod(`${periodYearSelect.value}-${String(month).padStart(2, '0')}`);
});
periodPrevYear?.addEventListener('click', () => {
  const { year, month } = periodParts(state.period);
  setPeriod(`${year - 1}-${String(month).padStart(2, '0')}`);
});
periodNextYear?.addEventListener('click', () => {
  const { year, month } = periodParts(state.period);
  setPeriod(`${year + 1}-${String(month).padStart(2, '0')}`);
});
periodMonthGrid?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-period-month]');
  if (!button) return;
  setPeriod(button.dataset.periodMonth);
  setPeriodPickerOpen(false);
});
document.addEventListener('click', (event) => {
  handleDatePickerDocumentClick(event);
  if (!event.target.closest('[data-filter-period-picker]')) {
    closeFilterPeriodPickers();
  }
  if (!periodPicker || periodPicker.contains(event.target)) return;
  setPeriodPickerOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeDatePickers();
    closeFilterPeriodPickers();
    setPeriodPickerOpen(false);
    setAccountMenuOpen(false);
  }
});

themeToggleButton?.addEventListener('click', toggleTheme);
dashboardPrivacyTopButton?.addEventListener('click', toggleDashboardPrivacy);

notificationButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleNotificationPanel();
});

notificationPanel?.addEventListener('click', (event) => {
  event.stopPropagation();
});

profileButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleAccountMenu();
});

accountPanel?.addEventListener('click', (event) => event.stopPropagation());

accountProfileMenu?.addEventListener('click', () => {
  setAccountMenuOpen(false);
  openAccountSettingsModal();
});

accountLogoutMenu?.addEventListener('click', logoutCurrentUser);

logoutButton?.addEventListener('click', logoutCurrentUser);

menuToggleButton?.addEventListener('click', toggleMenu);

menuBackdrop?.addEventListener('click', () => setMenuOpen(false));

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('is-menu-open')) {
    setMenuOpen(false);
  }
  if (event.key === 'Escape') {
    closeNotificationPanel();
  }
});

if (app && 'MutationObserver' in window) {
  new MutationObserver((records) => {
    restoreLoginIfNeeded();
    if (records.some(mutationTouchesScrollableTable)) {
      queueObservedTableTopScrollbars(app);
    }
  }).observe(app, {
    childList: true,
    subtree: true
  });
}

observeTableTopScrollbars(modalBody);

document.addEventListener('click', (event) => {
  if (!notificationMenu || notificationMenu.hidden) return;
  if (!notificationMenu.contains(event.target)) {
    closeNotificationPanel();
  }
});

document.addEventListener('click', (event) => {
  if (!accountMenu || accountMenu.hidden) return;
  if (!accountMenu.contains(event.target)) {
    setAccountMenuOpen(false);
  }
});

function onMediaQueryChange(query, handler) {
  if (!query) return;
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler);
    return;
  }
  if (typeof query.addListener === 'function') {
    query.addListener(handler);
  }
}

let activeChartTooltipTimer = null;
let chartTooltipShownAt = 0;

function ensureChartTooltip() {
  let tooltip = document.getElementById('chartTouchTooltip');
  const openDialog = document.querySelector('dialog[open]');
  const host = openDialog || document.body;
  if (tooltip) {
    if (tooltip.parentNode !== host) host.appendChild(tooltip);
    return tooltip;
  }
  tooltip = document.createElement('div');
  tooltip.id = 'chartTouchTooltip';
  tooltip.className = 'chart-touch-tooltip';
  tooltip.hidden = true;
  host.appendChild(tooltip);
  return tooltip;
}

function hideChartTooltip() {
  if (Date.now() - chartTooltipShownAt < 350) return;
  const tooltip = document.getElementById('chartTouchTooltip');
  if (tooltip) tooltip.hidden = true;
  clearTimeout(activeChartTooltipTimer);
  activeChartTooltipTimer = null;
}

function chartTooltipTarget(node) {
  let current = node && currentNode(node);
  while (current && current !== document) {
    if (typeof current.getAttribute === 'function' && current.getAttribute('data-chart-tooltip')) return current;
    current = currentNode(current.parentNode || current.host);
  }
  return null;
}

function chartTooltipTargetFromEvent(event) {
  const direct = chartTooltipTarget(event?.target);
  if (direct) return direct;
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    const target = chartTooltipTarget(node);
    if (target) return target;
  }
  return null;
}

function currentNode(node) {
  return node && node.nodeType === 3 ? node.parentNode : node;
}

function showChartTooltip(target, event = null) {
  const text = String(target?.getAttribute('data-chart-tooltip') || '').trim();
  if (!text) return;
  const tooltip = ensureChartTooltip();
  tooltip.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  tooltip.hidden = false;

  const rect = target.getBoundingClientRect();
  const pointerX = Number(event?.clientX);
  const pointerY = Number(event?.clientY);
  const x = Number.isFinite(pointerX) ? pointerX : rect.left + (rect.width / 2);
  const y = Number.isFinite(pointerY) ? pointerY : rect.top;
  const tooltipRect = tooltip.getBoundingClientRect();
  const margin = 10;
  const left = Math.max(margin, Math.min(window.innerWidth - tooltipRect.width - margin, x - (tooltipRect.width / 2)));
  const hasTopRoom = y - tooltipRect.height - 12 >= margin;
  const preferredTop = hasTopRoom ? y - tooltipRect.height - 12 : y + 16;
  const top = Math.max(margin, Math.min(window.innerHeight - tooltipRect.height - margin, preferredTop));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  chartTooltipShownAt = Date.now();

  clearTimeout(activeChartTooltipTimer);
  activeChartTooltipTimer = setTimeout(hideChartTooltip, 6500);
}

document.addEventListener('pointerdown', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) {
    showChartTooltip(target, event);
    return;
  }
  hideChartTooltip();
});

document.addEventListener('touchstart', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (!target) return;
  const touch = event.touches && event.touches[0] ? event.touches[0] : event;
  showChartTooltip(target, touch);
}, { passive: true });

document.addEventListener('click', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) {
    showChartTooltip(target, event);
    return;
  }
  hideChartTooltip();
});

document.addEventListener('mouseover', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) showChartTooltip(target, event);
});

document.addEventListener('focusin', (event) => {
  const target = chartTooltipTargetFromEvent(event);
  if (target) showChartTooltip(target, null);
});

window.addEventListener('scroll', hideChartTooltip, { passive: true });
document.addEventListener('scroll', hideChartTooltip, { passive: true, capture: true });

onMediaQueryChange(mobileMenuQuery, () => {
  setMenuOpen(false);
  updateMenuButton();
});

async function init() {
  try {
    const preloadedPayload = window.__FAKENET_BOOTSTRAP_AUTH__;
    window.__FAKENET_BOOTSTRAP_AUTH__ = null;
    const payload = preloadedPayload?.user
      ? preloadedPayload
      : await api('/api/auth/me', { skipAuthRedirect: true });
    state.auth = payload.user;
    state.roles = payload.roles || [];
    clearRadiusOptionsCache();
    updateBranding(payload);
    const lastView = takeLoginReturnView();
    state.view = canView(lastView) ? lastView : firstAvailableView();
    configureShell();
    startNotificationsTimer();
    setView(state.view, { replace: true });
  } catch (error) {
    if (error.status === 423) {
      try {
        const payload = await api('/api/branding', { skipAuthRedirect: true });
        updateBranding(payload);
      } catch {
        applyBranding();
      }
      renderActivation(error.payload?.license || {});
      return;
    }
    rememberLoginReturnView(storedView());
    try {
      const payload = await api('/api/branding', { skipAuthRedirect: true });
      updateBranding(payload);
    } catch {
      applyBranding();
    }
    renderLogin();
  }
}

init();
