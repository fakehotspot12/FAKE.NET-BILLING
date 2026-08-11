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

  assert.match(indexSource, /href="\/boot\.css\?ui=menu-map-fiber-icons-20260811-1540"/);
  assert.match(indexSource, /src="\/bootstrap\.js\?ui=menu-map-fiber-icons-20260811-1540"/);
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
  assert.match(bootstrapSource, /class="boot-app-pending"/);
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

  for (const group of ['main', 'customers', 'radius', 'finance', 'monitoring', 'settings-menu', 'admin']) {
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
  assert.match(appSource, /new Set\(\['monitoring', 'settings-menu', 'admin'\]\)/);
  assert.match(appSource, /function syncBottomNavigationState\(\)/);
  assert.match(appSource, /const sameGroupOpen = menuIsMobile\(\)/);
  assert.match(appSource, /const sameFullMenuOpen = menuIsMobile\(\)/);
  assert.match(styles, /body\.is-authenticated \.sidebar[\s\S]*?bottom:\s*calc\(82px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(styles, /body\.is-authenticated \.sidebar[\s\S]*?transform:\s*translateY\(calc\(100% \+ 110px\)\)/);
  assert.match(styles, /body\.is-authenticated\.is-menu-open \.sidebar[\s\S]*?transform:\s*translateY\(0\)/);
  assert.match(styles, /body\.is-authenticated\.is-menu-full \.sidebar \.nav-section\[data-nav-group="admin"\]/);
  assert.match(styles, /\.bottom-item\.is-open::after/);
  assert.doesNotMatch(styles, /body\.is-authenticated \.sidebar[\s\S]*?translate3d\(calc\(-100%/);
});

test('keeps monitoring maps mobile-safe and lightweight for large datasets', () => {
  const appSource = publicSource('app.js');
  const styles = publicSource('styles.css');

  assert.match(appSource, /monitoringMapUseLightweightMode/);
  assert.match(appSource, /preferCanvas:\s*lightweightMap/);
  assert.match(appSource, /addLeafletRowsInChunks\(customerMarkers/);
  assert.match(appSource, /addLeafletRowsInChunks\(points/);
  assert.match(appSource, /fiberNetworkInteractionToggle/);
  assert.match(styles, /\.monitoring-map-toolbar \.filters[\s\S]*?display:\s*grid/);
  assert.match(styles, /\.monitoring-fiber-grid[\s\S]*?grid-template-columns:\s*minmax\(220px,\s*0\.74fr\)/);
  assert.match(styles, /\.monitoring-map-canvas[\s\S]*?height:\s*clamp\(420px,\s*58vh,\s*620px\)/);
});

test('keeps public security responses minimal and protected', () => {
  const serverSource = sourceFile('src', 'server.js');
  const subwebSource = sourceFile('src', 'subweb-server.js');

  assert.match(serverSource, /pathname === '\/api\/health'[\s\S]*?sendJson\(res, 200, \{ ok: true \}\)/);
  assert.doesNotMatch(serverSource, /endpoint:\s*'payment-gateway-webhook'/);
  assert.doesNotMatch(serverSource, /callbackUrl:\s*data\.settings\?\.paymentGateway/);
  for (const header of ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.match(serverSource, new RegExp(header));
    assert.match(subwebSource, new RegExp(header));
  }
  assert.match(serverSource, /sendJson\(res, 500, \{ error: 'Server error' \}\)/);
  assert.match(subwebSource, /sendJson\(res, 500, \{ ok: false, error: 'Subweb error' \}\)/);
});
