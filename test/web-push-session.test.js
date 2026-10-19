'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-push-test-'));
process.env.AUTH_SESSION_STORE_PATH = path.join(directory, 'sessions.json');
const auth = require('../src/auth');
const { __test: server } = require('../src/server');
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('payment push requires a live bound session and leaves other sessions intact on logout', () => {
  const users = ['admin', 'owner', 'finance', 'collector', 'secretary'].map(role => ({ id: role, role, active: true }));
  const sessionIds = users.map(user => auth.createSession(user));
  const extra = auth.createSession(users[0]);
  const bindings = users.map((user, index) => ({ userId: user.id, sessionKey: auth.sessionFingerprint(sessionIds[index]), enabled: true }));
  const data = { users, webPushSubscriptions: [
    ...bindings, { userId: 'admin', sessionKey: auth.sessionFingerprint(extra), enabled: true },
    { userId: 'admin', enabled: true }, { userId: 'owner', sessionKey: 'invalid', enabled: true }
  ] };
  assert.equal(server.eligibleWebPushSubscriptions(data).length, 4);
  auth.destroySession(sessionIds[0]);
  assert.equal(server.eligibleWebPushSubscriptions(data).length, 3);
  assert.equal(server.revokeSessionPushSubscriptions(data, bindings[0].sessionKey, 'admin'), 2);
  assert.equal(auth.sessionBindingActive(auth.sessionFingerprint(extra), 'admin'), true);
  assert.equal(server.eligibleWebPushSubscriptions(data).length, 3);
  for (const id of [...sessionIds, extra]) auth.destroySession(id);
});

test('session bindings survive restart without revealing the cookie or extending the session', () => {
  const user = { id: 'push-admin', username: 'push-admin', role: 'admin', active: true };
  const id = auth.createSession(user);
  const key = auth.sessionFingerprint(id);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.notEqual(key, id);
  const req = { headers: { cookie: `isp_finance_session=${id}` } };
  const expiry = JSON.parse(fs.readFileSync(process.env.AUTH_SESSION_STORE_PATH)).find(item => item.id === id).expiresAt;
  assert.equal(auth.requestUser(req, { users: [user] }, { refresh: false }).id, user.id);
  assert.equal(auth.activeSessionBindings(expiry + 1).has(key), false);
  const result = execFileSync(process.execPath, ['-e', `const auth=require(${JSON.stringify(require.resolve('../src/auth'))});process.stdout.write(String(auth.sessionBindingActive(${JSON.stringify(key)},'push-admin')))`], { env: process.env, encoding: 'utf8' });
  assert.equal(result, 'true');
  assert.equal(JSON.parse(fs.readFileSync(process.env.AUTH_SESSION_STORE_PATH)).find(item => item.id === id).expiresAt, expiry);
  auth.destroySession(id);
  assert.equal(auth.requestUser(req, { users: [user] }, { refresh: false }), null);
});

function worker() {
  const listeners = {};
  const visible = [];
  const requests = [];
  const state = { enabled: true, sessionKey: 'a'.repeat(64) };
  const self = {
    location: { origin: 'https://billing.example.test' }, skipWaiting() {},
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => { requests.push('opened'); } },
    registration: {
      getNotifications: async (options = {}) => visible.filter(item => !item.closed && (!options.tag || options.tag === item.tag)),
      showNotification: async (title, options) => visible.push({ title, ...options, close() { this.closed = true; } })
    },
    addEventListener: (name, listener) => { listeners[name] = listener; }
  };
  const context = vm.createContext({ self, URL, URLSearchParams, AbortSignal, fetch: async url => {
    requests.push(url);
    return Response.json({ sessionKey: state.sessionKey, event: { title: 'Pembayaran', body: 'Data privat' } });
  } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/service-worker.js'), 'utf8'), context);
  context.readAuth = async value => value === undefined ? { ...state } : Object.assign(state, value);
  vm.runInContext('pushAuth = readAuth', context);
  const fire = async (type, event = {}) => {
    let waiting = Promise.resolve();
    listeners[type]({ ...event, waitUntil(promise) { waiting = promise; } });
    await waiting;
  };
  const push = (body = {}) => fire('push', { data: { json: () => ({ type: 'payment-signal', id: 'paid-1', sessionKey: 'a'.repeat(64), ...body }) } });
  return { state, context, self, requests, visible, fire, push };
}

test('service worker displays authenticated push but never a logged-out, expired, or old-account signal', async () => {
  const w = worker();
  await w.push();
  assert.equal(w.visible.filter(item => !item.closed).length, 1);
  await w.push();
  assert.equal(w.visible.length, 1);
  w.state.enabled = false;
  await w.push({ id: 'paid-2' });
  assert.equal(w.visible.filter(item => !item.closed).length, 0);
  w.state.enabled = true;
  w.state.sessionKey = 'b'.repeat(64);
  const count = w.requests.length;
  await w.push({ id: 'paid-3' });
  assert.equal(w.requests.length, count);
  w.context.fetch = async () => new Response('', { status: 401 });
  await w.push({ sessionKey: 'b'.repeat(64) });
  assert.equal(w.visible.filter(item => !item.closed).length, 0);
});

test('logout during an in-flight verification suppresses the delayed response', async () => {
  const w = worker();
  w.context.fetch = async () => {
    w.state.enabled = false;
    return Response.json({ sessionKey: 'a'.repeat(64), event: { title: 'Late payment', body: 'Private' } });
  };
  await w.push();
  assert.equal(w.visible.length, 0);
});

test('logout message closes displayed payment notifications and persists an off gate', async () => {
  const w = worker();
  await w.push();
  let acknowledged = false;
  await w.fire('message', {
    source: { url: 'https://billing.example.test/' }, data: { type: 'FAKENET_PUSH_LOGOUT' },
    ports: [{ postMessage: message => { acknowledged = message.ok; } }]
  });
  assert.equal(acknowledged, true);
  assert.equal(w.state.enabled, false);
  assert.equal(w.visible.filter(item => !item.closed).length, 0);
  await w.push({ id: 'queued-payment' });
  assert.equal(w.visible.length, 1);
});

test('legacy financial payloads and offline signals fail closed', async () => {
  const w = worker();
  await w.push({ type: 'monthly-package', body: 'Private financial data' });
  assert.equal(w.visible.length, 0);
  w.context.fetch = async () => { throw new Error('offline'); };
  await w.push();
  assert.equal(w.visible.length, 0);
});

test('paid event lookup excludes unpaid transactions and uses stored net gateway amount', () => {
  const data = { settings: {}, paymentGatewayTransactions: [
    { id: 'pending', status: 'pending' },
    { id: 'voucher', status: 'paid', kind: 'voucher-online', customerName: 'Example', amountReceived: 2000 }
  ] };
  assert.equal(server.onlinePaymentPushEvent(data, 'pending'), null);
  assert.equal(server.onlinePaymentPushEvent(data, 'missing'), null);
  const event = server.onlinePaymentPushEvent(data, 'voucher');
  assert.equal(event.type, 'hotspot-voucher');
  assert.equal(event.amount, 2000);
});
