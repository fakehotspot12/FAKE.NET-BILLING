'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function publicSource(filename) {
  return fs.readFileSync(path.join(__dirname, '..', 'public', filename), 'utf8');
}

function sourceFile(...segments) {
  return fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8');
}

test('loads the lightweight bootstrap before the full authenticated application', () => {
  const indexSource = publicSource('index.html');
  const bootstrapSource = publicSource('bootstrap.js');
  const bootStyleSource = publicSource('boot.css');
  const appSource = publicSource('app.js');

  assert.match(indexSource, /href="\/boot\.css\?ui=menu-icons-20260822"/);
  assert.match(indexSource, /src="\/bootstrap\.js\?ui=menu-icons-20260822"/);
  assert.doesNotMatch(indexSource, /<script[^>]+src="\/app\.js/);
  assert.doesNotMatch(indexSource, /<link[^>]+href="\/styles\.css/);
  assert.match(indexSource, /class="boot-app-pending"/);
  assert.doesNotMatch(indexSource, /Menyiapkan akses|boot-dashboard|boot-skeleton-card/);

  assert.match(bootstrapSource, /request\('\/api\/auth\/me'\)/);
  assert.match(bootstrapSource, /request\('\/api\/branding'\)/);
  assert.match(bootstrapSource, /request\('\/api\/auth\/login'/);
  assert.match(bootstrapSource, /preloadApplicationScript\(\)/);
  assert.match(bootstrapSource, /await loadApplicationStyle\(\)/);
  assert.match(bootstrapSource, /await loadApplicationScript\(\)/);
  assert.match(bootstrapSource, /window\.__FAKENET_BOOTSTRAP_AUTH__ = authPayload/);
  assert.match(bootstrapSource, /class="[^"]*boot-app-pending/);
  assert.doesNotMatch(bootstrapSource, /Memuat modul aplikasi|boot-dashboard|boot-skeleton-card/);

  assert.match(appSource, /const preloadedPayload = window\.__FAKENET_BOOTSTRAP_AUTH__/);
  assert.match(appSource, /preloadedPayload\?\.user/);
  assert.match(bootStyleSource, /body\.is-loading-auth \.content::before/);
  assert.match(bootStyleSource, /display: none !important/);
  assert.match(bootStyleSource, /\.boot-app-pending/);
});

test('keeps the login viewport dark through bootstrap and authenticated app handoff', () => {
  const html = publicSource('index.html');
  const bootCss = publicSource('boot.css');
  const appCss = publicSource('styles.css');

  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(bootCss, /html:has\(body\.is-bootstrap-login\)[\s\S]*?background:\s*#020a22/);
  assert.match(appCss, /html:has\(body\.is-login\)[\s\S]*?background:\s*#020a22/);
});

test('uses the compact navigation and bounded paging contract', () => {
  const html = publicSource('index.html');
  const appSource = publicSource('app.js');

  for (const group of ['main', 'customers', 'partners', 'radius', 'finance', 'monitoring', 'settings-menu', 'admin']) {
    assert.match(html, new RegExp(`data-nav-group="${group}"`));
  }
  assert.match(html, /class="nav-group nav-section"/);
  assert.match(html, /data-open-full-menu/);
  assert.match(html, /data-view="financeCash" data-related-views="externalIncomes,expenses,reportsTransactions,reportsFinanceRecap">Kas & Rekap/);
  assert.match(html, /data-related-views="reportsMonthlyBilling"/);
  assert.match(html, /data-view="billingSettings">Pengaturan Billing/);
  assert.doesNotMatch(html, /data-view="radiusSettings">Isolir Radius/);
  assert.doesNotMatch(html, /data-view="reportsInventoryStock">Stok Inventaris/);
  assert.equal((html.match(/class="bottom-item/g) || []).length, 5);
  assert.match(appSource, /const PAGER_LIMIT_OPTIONS = \[10, 25, 50, 100\]/);
  assert.match(appSource, /const MONITORING_MAP_CANVAS_THRESHOLD = 320/);
  assert.match(appSource, /async function addLeafletRowsInChunks/);
  assert.doesNotMatch(appSource, /const PAGER_LIMIT_OPTIONS = \[[^\]]*['"]all['"]/);
  assert.match(appSource, /mobile-card-table/);
  assert.match(appSource, /if \(!view \|\| !Object\.prototype\.hasOwnProperty\.call\(viewPermissions, view\)\) return false/);
});

test('opens mobile navigation as a bottom sheet instead of a side drawer', () => {
  const appSource = publicSource('app.js');
  const styles = publicSource('styles.css');

  assert.match(appSource, /document\.body\.classList\.add\('is-menu-full'\)/);
  assert.match(appSource, /new Set\(\['partners', 'monitoring', 'settings-menu', 'admin'\]\)/);
  assert.match(appSource, /function syncBottomNavigationState\(\)/);
  assert.match(appSource, /const sameGroupOpen = menuIsMobile\(\)/);
  assert.match(appSource, /const sameFullMenuOpen = menuIsMobile\(\)/);
  assert.match(styles, /body\.is-authenticated \.sidebar[\s\S]*?bottom:\s*calc\(82px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(styles, /body\.is-authenticated \.sidebar[\s\S]*?transform:\s*translateY\(calc\(100% \+ 110px\)\)/);
  assert.match(styles, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /body\.is-authenticated\.is-menu-open \.sidebar[\s\S]*?transform:\s*translateY\(0\)/);
  assert.match(styles, /body\.is-authenticated \.menu-backdrop[\s\S]*?inset:\s*0/);
  assert.match(styles, /body\.is-authenticated\.is-menu-open \.topbar,[\s\S]*?body\.is-authenticated\.is-menu-open \.content[\s\S]*?transform:\s*none/);
  assert.match(styles, /body\.is-authenticated \.sidebar \.nav-submenu[\s\S]*?display:\s*grid[\s\S]*?max-height:\s*none/);
  assert.match(styles, /body\.is-authenticated \.sidebar[\s\S]*?overflow-x:\s*hidden/);
  assert.match(styles, /body\.is-authenticated\.is-menu-full \.sidebar \.nav-section\[data-nav-group="admin"\]/);
  assert.match(styles, /\.bottom-item\.is-open::after/);
  assert.doesNotMatch(styles, /body\.is-authenticated \.sidebar[\s\S]*?translate3d\(calc\(-100%/);
  assert.match(styles, /Mobile compact summary blocks across pages - start/);
  assert.match(styles, /Inventory and network asset compact mobile cards - start/);
  assert.match(styles, /Global refresh action positioning - start/);
});

test('keeps monitoring maps mobile-safe and lightweight for large datasets', () => {
  const appSource = publicSource('app.js');
  const styles = publicSource('styles.css');

  assert.match(appSource, /monitoringMapUseLightweightMode/);
  assert.match(appSource, /const lazyPopup = typeof popupHtml === 'function'/);
  assert.match(appSource, /mobileLightweightMap \? 40 : MONITORING_MAP_CHUNK_SIZE/);
  assert.match(appSource, /const listedCustomerLimit = compactMapList \? 24 : 80/);
  assert.match(appSource, /preferCanvas:\s*lightweightMap/);
  assert.match(appSource, /addLeafletRowsInChunks\(customerMarkers/);
  assert.match(appSource, /addLeafletRowsInChunks\(points/);
  assert.match(appSource, /fiberNetworkInteractionToggle/);
  assert.match(styles, /\.monitoring-map-toolbar \.filters[\s\S]*?display:\s*grid/);
  assert.match(styles, /\.monitoring-fiber-grid[\s\S]*?grid-template-columns:\s*minmax\(220px,\s*0\.74fr\)/);
  assert.match(styles, /\.monitoring-map-canvas[\s\S]*?height:\s*clamp\(420px,\s*58vh,\s*620px\)/);
});

test('keeps one monitoring map implementation and complete partner titles', () => {
  const appSource = publicSource('app.js');
  const functionNames = [...appSource.matchAll(/^(?:async )?function\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]);
  const duplicates = functionNames.filter((name, index) => functionNames.indexOf(name) !== index);

  assert.deepEqual([...new Set(duplicates)], []);
  for (const view of ['partnerCustomers', 'partnerPackages', 'partnerInvoices', 'partnerPayments', 'partnerPppoe', 'partnerRadius', 'partnerReports', 'partnerSettlement']) {
    assert.match(appSource, new RegExp(`${view}: 'Mitra`));
  }
});

test('assigns icons to every sidebar view and all partner navigation actions', () => {
  const html = publicSource('index.html');
  const styles = publicSource('styles.css');
  const sidebarViews = [...new Set([...html.matchAll(/data-view="([^"]+)"/g)].map((match) => match[1]))];

  sidebarViews.forEach((view) => {
    assert.match(styles, new RegExp(`\\[data-view=["']${view}["']\\][^{]*\\{[^}]*--menu-icon`), `missing icon for ${view}`);
  });
  for (const view of ['partnerReports', 'partnerCustomers', 'partnerInvoices', 'partnerSettlement', 'partnerPppoe', 'partnerPackages', 'partnerRadius', 'partnerPayments']) {
    assert.match(styles, new RegExp(`\\[data-partner-view=["']${view}["']\\][^{]*\\{[^}]*--menu-icon`), `missing partner icon for ${view}`);
  }
  assert.match(styles, /\.partner-compact-nav \[data-partner-view\]::before[\s\S]*?mask:\s*var\(--menu-icon\)/);
});

test('keeps public security responses minimal and protected', () => {
  const serverSource = sourceFile('src', 'server.js');
  const subwebSource = sourceFile('src', 'subweb-server.js');

  assert.match(serverSource, /pathname === '\/api\/health'[\s\S]*?sendJson\(res, 200, \{ ok: true \}\)/);
  assert.match(serverSource, /function validateCsrfRequest\(/);
  assert.match(serverSource, /auth\.validateCsrfToken\(req, csrfHeaderValue\(req\)\)/);
  assert.match(serverSource, /if \(!validateCsrfRequest\(req, res, pathname\)\) return/);
  assert.doesNotMatch(serverSource, /endpoint:\s*'payment-gateway-webhook'/);
  assert.doesNotMatch(serverSource, /callbackUrl:\s*data\.settings\?\.paymentGateway/);
  for (const header of ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.match(serverSource, new RegExp(header));
    assert.match(subwebSource, new RegExp(header));
  }
  assert.match(serverSource, /sendJson\(res, 500, \{ error: 'Server error' \}\)/);
  assert.match(subwebSource, /sendJson\(res, 500, \{ ok: false, error: 'Subweb error' \}\)/);
});

test('keeps safe performance contracts for dashboard and hot queries', () => {
  const appSource = publicSource('app.js');
  const serverSource = sourceFile('src', 'server.js');
  const storeSource = sourceFile('src', 'store.js');

  assert.match(appSource, /function scheduleDashboardExtraPanels/);
  assert.match(appSource, /requestIdleCallback\(run, \{ timeout: 700 \}\)/);
  assert.match(appSource, /cancelDashboardExtraPanelsWork\(\)/);
  assert.match(appSource, /scheduleDashboardExtraPanels\(renderToken, canViewFinance, canViewActivity\)/);
  assert.match(serverSource, /DASHBOARD_RUNTIME_CACHE_TTL_SECONDS[\s\S]*?\|\| 30/);
  assert.match(serverSource, /REPORT_RUNTIME_CACHE_TTL_SECONDS[\s\S]*?\|\| 90/);
  assert.match(serverSource, /SEARCH_RUNTIME_CACHE_TTL_SECONDS[\s\S]*?\|\| 35/);
  for (const indexName of [
    'app_customers_status_created_json_idx',
    'app_invoices_period_status_json_idx',
    'app_payments_status_paid_at_json_idx',
    'app_wa_messages_status_created_json_idx',
    'app_activity_type_at_json_idx'
  ]) {
    assert.match(storeSource, new RegExp(indexName));
  }
});
