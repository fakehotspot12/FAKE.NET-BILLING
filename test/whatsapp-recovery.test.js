'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('../src/auth');
const { createGatewayRecovery, restartLocalGateway } = require('../src/whatsapp-recovery');
const settings = { baseUrl: 'http://127.0.0.1:8895', sender: 'default' };

function harness(initial = 'STARTING', overrides = {}) {
  let clock = 1000000;
  const state = { status: initial, sessionCalls: 0, serviceCalls: 0, audits: [] };
  const recovery = createGatewayRecovery({
    keyFor: value => value.baseUrl,
    getStatus: async () => ({ status: state.status }),
    connectSession: async () => { state.sessionCalls++; },
    restartService: async () => { state.serviceCalls++; state.status = 'WORKING'; },
    isConnected: value => value?.status === 'WORKING',
    needsQr: value => value?.status === 'SCAN_QR_CODE',
    onFinished: async (result, actor) => state.audits.push({ result, actor }),
    now: () => clock,
    wait: async ms => { clock += ms; },
    sessionWaitMs: 3000,
    serviceWaitMs: 3000,
    pollMs: 1000,
    ...overrides
  });
  return { state, recovery, advance: ms => { clock += ms; } };
}

test('UI recovery never restarts an online or QR-ready gateway', async () => {
  for (const status of ['WORKING', 'SCAN_QR_CODE']) {
    const { state, recovery } = harness(status);
    assert.equal(recovery.start(settings).accepted, true);
    await recovery.waitForIdle(settings);
    assert.equal(recovery.status(settings).phase, status === 'WORKING' ? 'connected' : 'qr');
    assert.equal(state.sessionCalls + state.serviceCalls, 0);
    assert.equal(recovery.status(settings).retryAfterSeconds, 0);
  }
});

test('UI recovery first reconnects session without restarting the service', async () => {
  const { state, recovery } = harness('STOPPED', {
    connectSession: async () => { state.sessionCalls++; state.status = 'WORKING'; }
  });
  recovery.start(settings, { id: 'user-finance', name: 'Keuangan' });
  await recovery.waitForIdle(settings);
  assert.equal(state.sessionCalls, 1);
  assert.equal(state.serviceCalls, 0);
  assert.equal(recovery.status(settings).phase, 'connected');
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].actor.id, 'user-finance');
});

test('a stuck browser restarts only the gateway once then becomes connected', async () => {
  const { state, recovery } = harness();
  recovery.start(settings);
  await recovery.waitForIdle(settings);
  assert.equal(state.sessionCalls, 1);
  assert.equal(state.serviceCalls, 1);
  assert.equal(recovery.status(settings).serviceRestarted, true);
  assert.equal(recovery.status(settings).phase, 'connected');
});

test('QR is returned only when pairing is needed without a service restart', async () => {
  const { state, recovery } = harness('STOPPED', {
    connectSession: async () => { state.status = 'SCAN_QR_CODE'; }
  });
  recovery.start(settings);
  await recovery.waitForIdle(settings);
  assert.equal(recovery.status(settings).phase, 'qr');
  assert.equal(state.serviceCalls, 0);
});

test('concurrent clicks share one recovery and cooldown blocks repeat restarts', async () => {
  const { state, recovery, advance } = harness();
  const attempts = Array.from({ length: 20 }, () => recovery.start(settings));
  assert.equal(attempts.filter(result => result.accepted).length, 1);
  await recovery.waitForIdle(settings);
  assert.equal(recovery.start(settings).accepted, false);
  assert.equal(recovery.start(settings).phase, 'cooldown');
  assert.equal(recovery.start(settings).status, null);
  assert.equal(state.serviceCalls, 1);
  advance(300000);
  state.status = 'STARTING';
  assert.equal(recovery.start(settings).accepted, true);
  await recovery.waitForIdle(settings);
  assert.equal(state.serviceCalls, 2);
});

test('gateway authentication errors never restart the service or retry continuously', async () => {
  const { state, recovery } = harness('STARTING', {
    getStatus: async () => { throw Object.assign(new Error('sensitive provider detail'), { status: 401 }); }
  });
  recovery.start(settings);
  await recovery.waitForIdle(settings);
  assert.equal(state.sessionCalls + state.serviceCalls, 0);
  assert.equal(recovery.status(settings).phase, 'failed');
  assert.match(recovery.status(settings).error, /Akses gateway ditolak/);
  assert.equal(recovery.start(settings).accepted, false);
});

test('closing a pairing popup does not impose a restart cooldown on reopening QR', async () => {
  const { state, recovery } = harness('STOPPED', {
    connectSession: async () => { state.sessionCalls++; state.status = 'SCAN_QR_CODE'; }
  });
  recovery.start(settings);
  await recovery.waitForIdle(settings);
  assert.equal(recovery.start(settings).accepted, true);
  await recovery.waitForIdle(settings);
  assert.equal(recovery.status(settings).phase, 'qr');
  assert.equal(state.sessionCalls, 1);
  assert.equal(state.serviceCalls, 0);
});

test('unreachable gateway can recover through the local service', async () => {
  const { state, recovery } = harness('STOPPED', {
    getStatus: async () => {
      if (!state.serviceCalls) throw new Error('fetch failed');
      return { status: 'WORKING' };
    },
    connectSession: async () => { throw new Error('fetch failed'); }
  });
  recovery.start(settings);
  await recovery.waitForIdle(settings);
  assert.equal(state.serviceCalls, 1);
  assert.equal(recovery.status(settings).phase, 'connected');
});

test('service errors are sanitized and do not start an endless recovery loop', async () => {
  const { state, recovery } = harness('STARTING', {
    restartService: async () => { state.serviceCalls++; throw new Error('/private/path SECRET'); }
  });
  recovery.start(settings);
  await recovery.waitForIdle(settings);
  assert.equal(state.serviceCalls, 1);
  assert.equal(recovery.status(settings).phase, 'failed');
  assert.doesNotMatch(recovery.status(settings).error, /SECRET|private/);
  assert.equal(recovery.start(settings).accepted, false);
});

test('a permanently disconnected gateway exits within bounded polling', async () => {
  const { state, recovery } = harness('STARTING', {
    restartService: async () => { state.serviceCalls++; }
  });
  recovery.start(settings);
  await recovery.waitForIdle(settings);
  assert.equal(recovery.status(settings).running, false);
  assert.equal(recovery.status(settings).phase, 'failed');
  assert.equal(state.serviceCalls, 1);
  assert.equal(state.audits.length, 1);
});

test('service recovery uses a fixed executable and service without a shell', async () => {
  const calls = [];
  await restartLocalGateway(settings.baseUrl, async (...args) => calls.push(args));
  assert.deepEqual(calls[0].slice(0, 2), ['/usr/bin/systemctl', ['restart', '--no-block', 'fakenet-billing-waha.service']]);
  assert.equal(calls[0][2].shell, undefined);
});

test('remote gateways and credential URLs cannot trigger a local service restart', async () => {
  let calls = 0;
  for (const url of ['http://gateway.example.test:8895', 'http://127.0.0.1.evil.test', 'ftp://127.0.0.1', 'http://user:pass@localhost:8895']) {
    await assert.rejects(restartLocalGateway(url, async () => { calls++; }));
  }
  assert.equal(calls, 0);
});

test('secretary gains only recovery access while financial and admin roles retain management', () => {
  const roles = Object.fromEntries(auth.publicRoles().map(role => [role.value, role.permissions]));
  for (const role of ['admin', 'owner', 'finance', 'secretary']) assert.ok(roles[role].includes('wa-gateway:recover'));
  assert.equal(roles.secretary.includes('wa-gateway:manage'), false);
  for (const role of ['technician', 'collector', 'reseller_voucher', 'viewer']) assert.equal(roles[role].includes('wa-gateway:recover'), false);
  const server = fs.readFileSync(path.join(__dirname, '..', 'src/server.js'), 'utf8');
  const section = server.slice(server.indexOf("if (pathname.startsWith('/api/wa-gateway/waha/'))"), server.indexOf("if (method === 'GET' && pathname === '/api/payment-gateway')"));
  assert.match(section, /requireAnyPermission\(req, res, \['wa-gateway:manage', 'wa-gateway:recover'\]\)/);
  assert.match(section, /: await requirePermission\(req, res, 'wa-gateway:manage'\)/);
  assert.doesNotMatch(section.slice(section.indexOf("pathname === '/api/wa-gateway/waha/recover'"), section.indexOf("pathname === '/api/wa-gateway/waha/start'")), /wahaLogoutSession|wahaDeleteSession/);
});
