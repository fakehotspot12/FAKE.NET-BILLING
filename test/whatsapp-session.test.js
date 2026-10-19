'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { __test: gateway } = require('../src/server');
const settings = { baseUrl: 'http://gateway.example.test', sender: 'default', token: 'test-key' };

function mockGateway(t, initialStatus, handler) {
  const state = { status: initialStatus, requests: [], image: 'QR-ONE' };
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const path = new URL(url).pathname;
    const method = options.method || 'GET';
    state.requests.push({ path, method });
    const custom = await handler?.(path, method, state);
    if (custom) return Response.json(custom.body, { status: custom.status || 200 });
    if (path === '/api/sessions/default') return Response.json({ status: state.status });
    if (path === '/api/sessions' && method === 'POST') return Response.json({ error: 'already exists' }, { status: 422 });
    if (path.endsWith('/start') || path.endsWith('/restart')) {
      state.status = 'STARTING';
      return Response.json({ status: state.status });
    }
    if (path.endsWith('/stop')) return Response.json({ status: 'STOPPED' });
    if (path.includes('/auth/qr')) return Response.json({ data: state.image, mimetype: 'image/png' });
    throw new Error(`Unexpected gateway request: ${method} ${path}`);
  });
  return state;
}

test('connected gateway never restarts or fetches QR', async (t) => {
  const state = mockGateway(t, 'WORKING');
  assert.equal((await gateway.wahaQr(settings)).connected, true);
  assert.deepEqual(state.requests, [{ path: '/api/sessions/default', method: 'GET' }]);
});

test('starting gateway returns pending immediately without lengthy reconnect polling', async (t) => {
  const state = mockGateway(t, 'STARTING');
  const started = Date.now();
  assert.equal((await gateway.wahaQr(settings)).pending, true);
  assert.ok(Date.now() - started < 500);
  assert.equal(state.requests.length, 1);
});

test('QR requests start once, refresh the image, then detect completed pairing', async (t) => {
  const state = mockGateway(t, 'STOPPED');
  assert.equal((await gateway.wahaQr(settings)).pending, true);
  assert.equal(state.requests.filter(item => item.path.endsWith('/start')).length, 1);
  state.status = 'SCAN_QR_CODE';
  assert.equal((await gateway.wahaQr(settings)).data, 'QR-ONE');
  state.image = 'QR-TWO';
  assert.equal((await gateway.wahaQr(settings)).data, 'QR-TWO');
  state.status = 'READY';
  assert.equal((await gateway.wahaQr(settings)).connected, true);
  assert.equal(state.requests.some(item => item.method === 'DELETE'), false);
});

test('failed session restarts without deleting linked credentials', async (t) => {
  const state = mockGateway(t, 'FAILED');
  assert.equal((await gateway.wahaQr(settings)).pending, true);
  assert.equal(state.requests.filter(item => item.path.endsWith('/restart')).length, 1);
  assert.equal(state.requests.some(item => item.method === 'DELETE'), false);
});

test('legacy gateway restart fallback stops and starts without logout/delete', async (t) => {
  const state = mockGateway(t, 'FAILED', (path) => path.endsWith('/restart')
    ? { status: 404, body: { error: 'endpoint not found' } } : null);
  assert.equal((await gateway.wahaQr({ ...settings, baseUrl: 'http://legacy-restart.example.test' })).pending, true);
  assert.equal(state.requests.filter(item => item.path.endsWith('/stop')).length, 1);
  assert.equal(state.requests.filter(item => item.path.endsWith('/start')).length, 1);
  assert.equal(state.requests.some(item => item.method === 'DELETE' || item.path.endsWith('/logout')), false);
});

test('concurrent QR/start requests share one operation and clean up after completion', async (t) => {
  const state = mockGateway(t, 'STOPPED', async (path, method) => {
    if (path.endsWith('/start')) await new Promise(resolve => setTimeout(resolve, 30));
  });
  const results = await Promise.all(Array.from({ length: 12 }, () => gateway.wahaQr(settings)));
  assert.equal(results.every(item => item.pending), true);
  assert.equal(state.requests.filter(item => item.path.endsWith('/start')).length, 1);
  state.status = 'SCAN_QR_CODE';
  assert.equal((await gateway.wahaQr(settings)).data, 'QR-ONE');
});

test('missing QR during a status transition is retried without restarting the engine', async (t) => {
  const state = mockGateway(t, 'SCAN_QR_CODE', (path, method, current) => {
    if (!path.includes('/auth/qr')) return null;
    current.status = 'WORKING';
    return { status: 422, body: { error: 'Session status is not as expected' } };
  });
  assert.equal((await gateway.wahaQr(settings)).connected, true);
  assert.equal(state.requests.some(item => item.method !== 'GET'), false);
});

test('provider QR failures do not fan out into four requests and can recover later', async (t) => {
  let failed = true;
  const state = mockGateway(t, 'SCAN_QR_CODE', path => path.includes('/auth/qr') && failed
    ? { status: 500, body: { error: 'provider unavailable' } } : null);
  await assert.rejects(gateway.wahaQr(settings), /provider unavailable/);
  assert.equal(state.requests.filter(item => item.path.includes('/auth/qr')).length, 1);
  failed = false;
  assert.equal((await gateway.wahaQr(settings)).data, 'QR-ONE');
});

test('authentication failure is surfaced without changing the session', async (t) => {
  const state = mockGateway(t, 'FAILED', () => ({ status: 401, body: { error: 'Unauthorized' } }));
  await assert.rejects(gateway.wahaQr(settings), /Unauthorized/);
  assert.equal(state.requests.some(item => item.method !== 'GET'), false);
});

test('a stuck STARTING session recovers once without logout and respects cooldown', async (t) => {
  const isolatedSettings = { ...settings, baseUrl: 'http://stale-starting.example.test' };
  const state = mockGateway(t, 'STARTING');
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  assert.equal((await gateway.wahaQr(isolatedSettings)).pending, true);
  now += 119000;
  assert.equal((await gateway.wahaQr(isolatedSettings)).pending, true);
  assert.equal(state.requests.filter(item => item.path.endsWith('/restart')).length, 0);
  now += 1000;
  assert.equal((await gateway.wahaQr(isolatedSettings)).pending, true);
  assert.equal(state.requests.filter(item => item.path.endsWith('/restart')).length, 1);
  now += 120000;
  await gateway.wahaQr(isolatedSettings);
  assert.equal(state.requests.filter(item => item.path.endsWith('/restart')).length, 1);
  now += 180000;
  await gateway.wahaQr(isolatedSettings);
  assert.equal(state.requests.filter(item => item.path.endsWith('/restart')).length, 2);
  assert.equal(state.requests.some(item => item.method === 'DELETE' || item.path.endsWith('/logout')), false);
});

test('QR-ready sessions are not restarted even after a long pairing wait', async (t) => {
  const isolatedSettings = { ...settings, baseUrl: 'http://qr-pairing-wait.example.test' };
  const state = mockGateway(t, 'SCAN_QR_CODE');
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  assert.equal((await gateway.wahaQr(isolatedSettings)).data, 'QR-ONE');
  now += 600000;
  assert.equal((await gateway.wahaQr(isolatedSettings)).data, 'QR-ONE');
  assert.equal(state.requests.some(item => item.method !== 'GET'), false);
});

test('a failed recovery never loops into repeated restarts or credential deletion', async (t) => {
  const isolatedSettings = { ...settings, baseUrl: 'http://failed-recovery.example.test' };
  const state = mockGateway(t, 'FAILED', path => path.endsWith('/restart')
    ? { status: 503, body: { error: 'gateway unavailable' } } : null);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  await assert.rejects(gateway.wahaStartSession(isolatedSettings), /gateway unavailable/);
  now += 1000;
  assert.equal((await gateway.wahaStartSession(isolatedSettings)).status, 'FAILED');
  assert.equal(state.requests.filter(item => item.path.endsWith('/restart')).length, 1);
  now += 299000;
  await assert.rejects(gateway.wahaStartSession(isolatedSettings), /gateway unavailable/);
  assert.equal(state.requests.filter(item => item.path.endsWith('/restart')).length, 2);
  assert.equal(state.requests.some(item => item.method === 'DELETE' || item.path.endsWith('/logout')), false);
});
