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

  assert.match(indexSource, /href="\/boot\.css\?ui=billing-view-audit-20260822"/);
  assert.match(indexSource, /src="\/bootstrap\.js\?ui=billing-view-audit-20260822"/);
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
  assert.match(styles, /Tablet dashboard containment - start/);
  assert.match(styles, /Browser audit mobile containment - start/);
  assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 900px\)[\s\S]*?\.dashboard-status-row,[\s\S]*?\.dashboard-radbill-lower-grid[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
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

test('routes every partner menu and disposes old map instances during navigation', () => {
  const appSource = publicSource('app.js');

  assert.match(appSource, /cleanupLeafletMaps\(app\);[\s\S]*?const normalizedRenderView/);
  for (const view of ['partnerCustomers', 'partnerPackages', 'partnerInvoices', 'partnerPayments', 'partnerPppoe', 'partnerRadius']) {
    assert.match(appSource, new RegExp(`state\\.view === '${view}'`), `missing render route for ${view}`);
  }
  assert.match(appSource, /state\.view === 'partnerReports'\) await renderPartnerReport\('report'\)/);
  assert.match(appSource, /state\.view === 'partnerSettlement'\) await renderPartnerReport\('settlement'\)/);
});

test('uses a declared request key and server paging for online customer monitoring', () => {
  const appSource = publicSource('app.js');

  assert.match(appSource, /async function renderMonitoringCustomers[\s\S]*?const requestKey = JSON\.stringify\(requestParams\)/);
  assert.match(appSource, /monitoringCustomersRequestKey !== requestKey/);
  assert.match(appSource, /const endpoint = `\/api\/monitoring\/customers\?\$\{queryString\(requestParams\)\}`/);
  assert.match(appSource, /const serverPagination = payload\.pagination/);
  assert.match(appSource, /const serverRows = Array\.isArray\(payload\.rows\)/);
});

test('declares the billing row date before rendering customer invoices', () => {
  const appSource = publicSource('app.js');
  const styles = publicSource('styles.css');

  assert.match(appSource, /const dueDateLabel = dateText\(invoice\.dueDate \|\| invoice\.invoiceDate\) \|\| '-';[\s\S]*?const rowDateLabel = partnerPaymentView[\s\S]*?invoice\.paidAt \? dateTimeText\(invoice\.paidAt\) : '-'[\s\S]*?: dueDateLabel;/);
  assert.match(appSource, /<td class="nowrap">\$\{escapeHtml\(rowDateLabel\)\}<\/td>/);
  assert.match(styles, /\.monitoring-billing-view \.billing-table\s*\{\s*min-width:\s*1080px/);
  assert.match(styles, /@media \(min-width: 761px\)[\s\S]*?\.monitoring-billing-view \.billing-action-button[\s\S]*?width:\s*30px/);
  assert.match(styles, /\.report-combined-tabs > div:first-child[\s\S]*?overflow:\s*visible[\s\S]*?width:\s*100%/);
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

test('trusts forwarding headers only from local or marked internal proxies', () => {
  const {
    requestClientIp,
    requestIsHttps,
    requestOrigin
  } = require('../src/server').__test;
  const cloudflareRequest = {
    headers: {
      host: '127.0.0.1:8891',
      'x-forwarded-host': 'billing.example.net',
      'x-forwarded-proto': 'https',
      'cf-ray': 'test-ray',
      'cf-connecting-ip': '203.0.113.20'
    },
    socket: { remoteAddress: '127.0.0.1', encrypted: false }
  };
  assert.equal(requestClientIp(cloudflareRequest), '203.0.113.20');
  assert.equal(requestIsHttps(cloudflareRequest), true);
  assert.equal(requestOrigin(cloudflareRequest), 'https://billing.example.net');

  const privateCloudflareRequest = {
    ...cloudflareRequest,
    socket: { remoteAddress: '172.18.0.4', encrypted: false }
  };
  assert.equal(requestClientIp(privateCloudflareRequest), '203.0.113.20');
  assert.equal(requestIsHttps(privateCloudflareRequest), true);
  assert.equal(requestOrigin(privateCloudflareRequest), 'https://billing.example.net');

  const spoofedDirectRequest = {
    headers: {
      host: 'billing.example.net',
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-proto': 'https',
      'cf-ray': 'spoofed-ray',
      'cf-connecting-ip': '198.51.100.9'
    },
    socket: { remoteAddress: '198.51.100.40', encrypted: false }
  };
  assert.equal(requestClientIp(spoofedDirectRequest), '198.51.100.40');
  assert.equal(requestIsHttps(spoofedDirectRequest), false);
  assert.equal(requestOrigin(spoofedDirectRequest), 'http://billing.example.net');
});

test('limits repeated public voucher orders by phone', () => {
  const { publicVoucherOrderRateLimit } = require('../src/server').__test;
  const request = { headers: {}, socket: { remoteAddress: '198.51.100.41' } };
  for (let index = 0; index < 6; index += 1) {
    assert.equal(publicVoucherOrderRateLimit(request, '081234567890').allowed, true);
  }
  assert.equal(publicVoucherOrderRateLimit(request, '081234567890').allowed, false);
});

test('does not share WifiKu OTP cooldown between customers behind one IP', () => {
  const { wifiKuOtpRateLimit } = require('../src/server').__test;
  const request = { headers: {}, socket: { remoteAddress: '198.51.100.88' } };
  assert.equal(wifiKuOtpRateLimit(request, '081200000001').allowed, true);
  assert.equal(wifiKuOtpRateLimit(request, '081200000002').allowed, true);
  const repeatedPhone = wifiKuOtpRateLimit(request, '081200000001');
  assert.equal(repeatedPhone.allowed, false);
  assert.ok(repeatedPhone.waitSeconds > 0);
});

test('keeps WifiKu OTP optional and bypasses its limiter for direct login mode', () => {
  const { createDefaultStore } = require('../src/store');
  const { sanitizeWifiKuSettings, wifiKuSettings } = require('../src/server').__test;
  assert.equal(createDefaultStore().settings.wifiKu.requireOtp, false);
  const disabled = sanitizeWifiKuSettings({ requireOtp: false }, { requireOtp: true });
  const enabled = sanitizeWifiKuSettings({ requireOtp: true }, disabled);
  assert.equal(wifiKuSettings({ settings: { wifiKu: disabled } }).requireOtp, false);
  assert.equal(wifiKuSettings({ settings: { wifiKu: enabled } }).requireOtp, true);

  const serverSource = sourceFile('src', 'server.js');
  const routeStart = serverSource.indexOf("pathname === '/api/public/wifiku/request-otp'");
  const routeEnd = serverSource.indexOf("pathname === '/api/public/wifiku/login'", routeStart);
  const requestRoute = serverSource.slice(routeStart, routeEnd);
  assert.ok(requestRoute.indexOf('if (!settings.requireOtp)') >= 0);
  assert.ok(requestRoute.indexOf('if (!settings.requireOtp)') < requestRoute.indexOf('wifiKuOtpRateLimit(req, phone)'));
});

test('hides WifiKu 5 GHz client details when the modem has no 5 GHz network', () => {
  const wifiKuSource = publicSource('wifiku.js');
  assert.match(wifiKuSource, /if \(wifiNetworkAvailable\(device, '5g'\)\) return rows/);
  assert.match(wifiKuSource, /counts\.hasWifi5 \? `<span>5G/);
  assert.match(wifiKuSource, /hasWifi5\s*\? `2\.4G \$\{clients\.count24\} \/ 5G/);
});

test('protects new public voucher status links with an access token', () => {
  const { hotspotVoucherOrderPublicAccessAllowed } = require('../src/server').__test;
  assert.equal(hotspotVoucherOrderPublicAccessAllowed({ reference: 'legacy-order' }, new URL('https://billing.example/status')), true);
  assert.equal(hotspotVoucherOrderPublicAccessAllowed(
    { publicAccessToken: 'valid-token' },
    new URL('https://billing.example/status?access_token=valid-token')
  ), true);
  assert.equal(hotspotVoucherOrderPublicAccessAllowed(
    { publicAccessToken: 'valid-token' },
    new URL('https://billing.example/status?access_token=invalid-token')
  ), false);

  const voucherSource = publicSource('hotspot-voucher.js');
  assert.match(voucherSource, /result\.order\?\.id \|\| result\.order\?\.reference/);
  assert.match(voucherSource, /access_token:\s*voucherOrderAccessToken/);
  assert.match(voucherSource, /\?access_token=\$\{encodeURIComponent\(voucherOrderAccessToken\)\}/);
});

test('keeps runtime secrets and updater backups root-only', () => {
  const installer = sourceFile('install.sh');
  const updater = sourceFile('deploy', 'bin', 'fakenet-billing-update');
  const storeSource = sourceFile('src', 'store.js');

  assert.match(installer, /chmod 600 \"\$file\"/);
  assert.match(installer, /APP_ADMIN_PASSWORD \"\$app_admin_password\"/);
  assert.match(updater, /umask 077/);
  assert.match(updater, /chmod 600 \"\$backup_file\"/);
  assert.match(storeSource, /writeFile\(tempPath,[\s\S]*?\{ mode: 0o600 \}\)/);
});

test('does not report an update as successful when GenieACS parameter sync fails', () => {
  const installer = sourceFile('install.sh');
  const updater = sourceFile('deploy', 'bin', 'fakenet-billing-update');

  for (const source of [installer, updater]) {
    assert.match(source, /for attempt in 1 2 3/);
    assert.match(source, /sinkron Virtual Parameters GenieACS gagal setelah 3 percobaan/);
    assert.doesNotMatch(source, /node "\$bootstrap" \|\| echo "Peringatan: sinkron Virtual Parameters/);
  }
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
