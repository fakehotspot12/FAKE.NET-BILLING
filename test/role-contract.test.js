'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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

test('partner can manage scoped PPPoE billing without global system settings', () => {
  const permissions = role('partner').permissions;
  assert.ok(permissions.includes('customers:manage'));
  assert.ok(permissions.includes('invoices:manage'));
  assert.ok(permissions.includes('radius:ppp-users:write'));
  assert.ok(permissions.includes('billing-monitor:read'));
  assert.equal(permissions.includes('radius:write'), false);
  assert.equal(permissions.includes('settings:write'), false);
  assert.equal(permissions.includes('payment-gateway:manage'), false);
  assert.equal(permissions.includes('wa-gateway:manage'), false);
});

test('viewer has read-only dashboard, OLT and ticket access without operational writes', () => {
  assert.deepEqual(role('viewer').permissions, ['dashboard:read', 'olt:read', 'olt:tickets:read']);
});
test('OLT and ticket visibility follow the requested role matrix without granting new sensitive writes',()=>{
 for(const row of auth.publicRoles()){
  assert.equal(row.permissions.includes('olt:read'),!['finance','partner','reseller_voucher'].includes(row.value),row.value);
  assert.equal(row.permissions.includes('olt:tickets:read'),!['collector','partner','reseller_voucher'].includes(row.value),row.value);
  if(['finance','collector','viewer','partner','reseller_voucher'].includes(row.value))for(const key of ['olt:manage','olt:onu:delete','olt:onu:reboot','olt:tickets:write'])assert.equal(row.permissions.includes(key),false,row.value+' '+key);
 }
});

test('secretary inherits every admin permission while retaining its own role and audit identity', () => {
  const permissions = role('secretary').permissions;
  assert.deepEqual([...permissions].sort(), [...role('admin').permissions].sort());
  assert.notStrictEqual(permissions, role('admin').permissions);
  assert.equal(auth.publicUser({id:'secretary-unit',role:'secretary',username:'sekretaris'}).role,'secretary');
  assert.ok(permissions.includes('olt:onu:delete'));
  assert.ok(permissions.includes('olt:onu:reboot'));
  assert.equal(permissions.includes('olt:manage'), true);
  assert.ok(permissions.includes('radius:write'));
  assert.ok(permissions.includes('genieacs:write'));
  assert.ok(permissions.includes('customers:manage'));
  assert.ok(permissions.includes('invoices:manage'));
  assert.equal(permissions.includes('settings:write'), true);
  assert.equal(permissions.includes('users:manage'), true);
  assert.equal(permissions.includes('payment-gateway:manage'), true);
  assert.equal(permissions.includes('wa-gateway:manage'), true);
  assert.equal(permissions.includes('xendit:withdraw'), true);
});
test('secretary passes admin-equivalent invoice cancellation and sensitive gateway role gates',()=>{
 const source=serverSource(),cancel=sourceSection(source,'function invoiceCancelAllowedUser(', 'const RADBOOX_STALE_MS');
 const allowed=vm.runInNewContext(cancel+'\ninvoiceCancelAllowedUser');assert(allowed(auth.publicUser({role:'secretary'})));assert(!allowed(auth.publicUser({role:'collector'})));
 const sensitive=sourceSection(source,'function xenditSensitiveAllowed(', 'function publicXenditPayloadForContext(');
 const canRead=vm.runInNewContext(sensitive+'\nxenditSensitiveAllowed',{auth,xenditSensitiveUsers:()=>new Set()});
 assert(canRead({user:auth.publicUser({role:'secretary',username:'not-default-admin'}),data:{}},{},'xendit:balance'));
 assert(canRead({user:auth.publicUser({role:'secretary',username:'not-default-admin'}),data:{}},{},'xendit:withdraw'));
 assert(!canRead({user:auth.publicUser({role:'finance',username:'not-default-admin'}),data:{}},{},'xendit:withdraw'));
});
test('secretary can access frontend invoice cancellation and discount actions rather than only backend permissions',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8'),code=sourceSection(app,'function billingCancelAllowed(', 'function billingDiscountAllowed(');
 const state={auth:{role:'secretary'}},allowed=vm.runInNewContext(code+'\nbillingCancelAllowed',{state,can:()=>true,billingInvoiceNo:()=> 'UNIT-1'});
 assert(allowed({status:'unpaid'}));assert(!allowed({status:'paid'}));state.auth.role='collector';assert(!allowed({status:'unpaid'}));
});
