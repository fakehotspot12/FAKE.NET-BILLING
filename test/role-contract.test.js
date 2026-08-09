'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const auth = require('../src/auth');

function role(value) {
  return auth.publicRoles().find((item) => item.value === value);
}

function serverSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
}

function sourceSection(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `source section not found: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `source section end not found: ${endNeedle}`);
  return source.slice(start, end);
}

test('finance and owner can save Radius settings without full system settings access', () => {
  assert.ok(role('owner').permissions.includes('billing-settings:manage'));
  assert.ok(role('finance').permissions.includes('billing-settings:manage'));
  assert.ok(role('finance').permissions.includes('radius:write'));
  assert.equal(role('finance').permissions.includes('settings:write'), false);

  const source = serverSource();
  assert.match(
    source,
    /pathname === '\/api\/radius\/settings'[\s\S]*?requireAnyPermission\(req, res, \['settings:write', 'billing-settings:manage', 'radius:write'\]\)/
  );
});

test('reseller voucher remains blocked from Radius settings and profile administration', () => {
  assert.ok(role('reseller_voucher').permissions.includes('radius:write'));
  assert.equal(role('reseller_voucher').permissions.includes('billing-settings:manage'), false);

  const source = serverSource();
  assert.match(source, /function radiusSectionAllowedForUser\(user = \{\}, section = ''\)[\s\S]*?return section === 'hotspot'/);
  const hotspotProfileRoute = sourceSection(
    source,
    'const radiusHotspotProfileMatch = pathname.match',
    'const radiusHotspotTemplateMatch = pathname.match'
  );
  assert.match(hotspotProfileRoute, /requirePermission\(req, res, 'radius:write'\)/);
  assert.match(hotspotProfileRoute, /String\(authContext\.user\.role \|\| ''\) === 'reseller_voucher'/);
  assert.match(hotspotProfileRoute, /forbidden\(res\)/);
});

test('viewer remains a dashboard-only role', () => {
  assert.deepEqual(role('viewer').permissions, ['dashboard:read']);
});

test('secretary can input operational data without sensitive admin access', () => {
  const permissions = role('secretary').permissions;
  assert.ok(permissions.includes('radius:write'));
  assert.ok(permissions.includes('genieacs:write'));
  assert.ok(permissions.includes('customers:manage'));
  assert.ok(permissions.includes('invoices:manage'));
  assert.equal(permissions.includes('settings:write'), false);
  assert.equal(permissions.includes('users:manage'), false);
  assert.equal(permissions.includes('payment-gateway:manage'), false);
  assert.equal(permissions.includes('wa-gateway:manage'), false);
  assert.equal(permissions.includes('xendit:withdraw'), false);
});
