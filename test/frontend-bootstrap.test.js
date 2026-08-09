'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function publicSource(filename) {
  return fs.readFileSync(path.join(__dirname, '..', 'public', filename), 'utf8');
}

test('loads the lightweight bootstrap before the full authenticated application', () => {
  const indexSource = publicSource('index.html');
  const bootstrapSource = publicSource('bootstrap.js');
  const bootStyleSource = publicSource('boot.css');
  const appSource = publicSource('app.js');

  assert.match(indexSource, /href="\/boot\.css\?ui=ui-v412-mobile-bottom-sheet-20260809"/);
  assert.match(indexSource, /src="\/bootstrap\.js\?ui=ui-v412-mobile-bottom-sheet-20260809"/);
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

  for (const group of ['customers', 'radius', 'financeManagement', 'monitoring', 'configuration', 'adminSystem']) {
    assert.match(html, new RegExp(`data-nav-group="${group}"`));
  }
  assert.match(html, /data-view="billingSettings">Pengaturan Billing/);
  assert.match(html, /data-view="radiusSettings">Isolir Radius/);
  assert.equal((html.match(/class="bottom-item/g) || []).length, 5);
  assert.match(appSource, /const PAGER_LIMIT_OPTIONS = \[10, 25, 50, 100\]/);
  assert.doesNotMatch(appSource, /const PAGER_LIMIT_OPTIONS = \[[^\]]*['"]all['"]/);
  assert.match(appSource, /const MOBILE_CARD_TABLE_VIEWS = new Set/);
  assert.match(appSource, /if \(!view \|\| !Object\.prototype\.hasOwnProperty\.call\(viewPermissions, view\)\) return false/);
});

test('opens mobile navigation as a bottom sheet instead of a side drawer', () => {
  const appSource = publicSource('app.js');
  const styles = publicSource('styles.css');

  assert.match(appSource, /document\.body\.classList\.add\('is-menu-full'\)/);
  assert.match(appSource, /new Set\(\['monitoring', 'configuration', 'adminSystem'\]\)/);
  assert.match(styles, /body\.is-authenticated \.sidebar[\s\S]*?bottom:\s*calc\(82px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(styles, /body\.is-authenticated \.sidebar[\s\S]*?transform:\s*translateY\(calc\(100% \+ 110px\)\)/);
  assert.match(styles, /body\.is-authenticated\.is-menu-open \.sidebar[\s\S]*?transform:\s*translateY\(0\)/);
  assert.match(styles, /body\.is-authenticated\.is-menu-full \.sidebar \.nav-group\[data-nav-group="adminSystem"\]/);
  assert.doesNotMatch(styles, /body\.is-authenticated \.sidebar[\s\S]*?translate3d\(calc\(-100%/);
});
