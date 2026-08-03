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

  assert.match(indexSource, /href="\/boot\.css\?ui=genie-provision-queue-v1-20260803"/);
  assert.match(indexSource, /src="\/bootstrap\.js\?ui=genie-provision-queue-v1-20260803"/);
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
