'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');
const vm = require('node:vm');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fakenet-fiber-permissions-'));
process.env.AUTH_SESSION_STORE_PATH = path.join(directory, 'sessions.json');
const auth = require('../src/auth');
const storeModule = require('../src/store');
let fixture;
let saves = 0;
const serverPath = require.resolve('../src/server');
const isolatedServer = new Module(serverPath, module);
isolatedServer.filename = serverPath;
isolatedServer.paths = Module._nodeModulePaths(path.dirname(serverPath));
const nativeRequire = isolatedServer.require.bind(isolatedServer);
isolatedServer.require = (name) => name === './store' ? {
  ...storeModule,
  loadStore: async () => fixture,
  peekStore: () => fixture,
  saveStore: async (data) => { fixture = data; saves++; return data; }
} : nativeRequire(name);
isolatedServer._compile(`${fs.readFileSync(serverPath, 'utf8')}\nmodule.exports.__test.fiberHandleApi = handleApi;\n`, serverPath);
const handleApi = isolatedServer.exports.__test.fiberHandleApi;
const appSource = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const sessions = new Map();

function reset() {
  fixture = storeModule.createDefaultStore();
  fixture.users = auth.publicRoles().map(({ value }) => ({ id: `fiber-${value}`, username: value, name: `Uji ${value}`, role: value, active: true }));
  fixture.settings.waGateway.enabled = false;
  fixture.fiberCenters = [];
  fixture.fiberPoints = [];
  fixture.activity = [];
  saves = 0;
}

async function request(role, type = 'odc', method = 'POST', payload = {}, id = '', validCsrf = true) {
  if (!sessions.has(role)) sessions.set(role, auth.createSession(fixture.users.find((user) => user.role === role)));
  const sessionId = sessions.get(role);
  const pathname = `/api/monitoring/fiber-network/${type}${id ? `/${id}` : ''}`;
  const req = Readable.from([Buffer.from(JSON.stringify(payload))]);
  req.method = method;
  req.url = pathname;
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = { host: 'localhost:8891', origin: 'http://localhost:8891', 'content-type': 'application/json',
    cookie: `${auth.SESSION_COOKIE}=${sessionId}`, 'x-csrf-token': validCsrf ? auth.csrfTokenForSessionId(sessionId) : 'invalid' };
  const response = { writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } };
  await handleApi(req, response, new URL(pathname, 'http://localhost:8891'));
  return response;
}

test.after(() => {
  for (const id of sessions.values()) auth.destroySession(id);
  fs.rmSync(directory, { recursive: true, force: true });
});

for (const role of ['technician', 'secretary']) {
  test(`${role} can add ODC and its ODP through the real API handlers`, async () => {
    reset();
    const before = structuredClone({ invoices: fixture.invoices, payments: fixture.payments, customers: fixture.customers, settings: fixture.settings });
    const center = await request(role, 'odc', 'POST', { code: 'UNIT-C', name: 'ODC Pengujian', latitude: '-0.5', longitude: '117.1', capacityPorts: 8 });
    assert.equal(center.status, 201);
    const point = await request(role, 'odp', 'POST', { code: 'UNIT-P', name: 'ODP Pengujian', centerId: center.body.center.id, latitude: '-0.51', longitude: '117.11', capacityPorts: 16 });
    assert.equal(point.status, 201);
    assert.equal(fixture.fiberCenters.length, 1);
    assert.equal(fixture.fiberPoints[0].centerId, center.body.center.id);
    assert.equal(saves, 2);
    assert.equal(fixture.activity.filter((row) => /fiber-od[cp]-create/.test(row.meta?.action || '')).length, 2);
    assert.deepEqual({ invoices: fixture.invoices, payments: fixture.payments, customers: fixture.customers, settings: fixture.settings }, before);
  });
  test(`${role} node creation retains validation and CSRF`, async () => {
    reset();
    assert.equal((await request(role, 'odc', 'POST', { name: 'Tanpa kode' })).status, 400);
    assert.equal((await request(role, 'odp', 'POST', { code: 'P', name: 'Tidak ada ODC', centerId: 'missing' })).status, 400);
    assert.equal((await request(role, 'odc', 'POST', { code: 'C', name: 'CSRF' }, '', false)).status, 419);
    assert.equal(saves, 0);
    assert.equal(fixture.fiberCenters.length, 0);
  });
}

test('technician receives only fiber creation, not NAS editing or existing-node deletion', async () => {
  reset();
  const permissions = auth.publicRoles().find((row) => row.value === 'technician').permissions;
  assert(permissions.includes('monitoring:fiber:create'));
  assert(!permissions.includes('monitoring:write'));
  assert(!permissions.includes('settings:write'));
  const created = await request('technician', 'odc', 'POST', { code: 'C', name: 'ODC' });
  const before = structuredClone(fixture.fiberCenters);
  assert.equal((await request('technician', 'odc', 'PUT', { name: 'Changed' }, created.body.center.id)).status, 403);
  assert.equal((await request('technician', 'odc', 'DELETE', {}, created.body.center.id)).status, 403);
  assert.deepEqual(fixture.fiberCenters, before);
});

for (const role of ['collector', 'reseller_voucher', 'partner', 'viewer', 'finance']) {
  test(`${role} is not granted fiber creation implicitly`, async () => {
    reset();
    assert.equal((await request(role, 'odc', 'POST', { code: 'C', name: 'No access' })).status, 403);
    assert.equal((await request(role, 'odp', 'POST', { code: 'P', name: 'No access' })).status, 403);
    assert.equal(saves, 0);
  });
}

for (const role of ['admin', 'owner', 'noc']) {
  test(`${role} keeps existing monitoring write access`, async () => {
    reset();
    const created = await request(role, 'odc', 'POST', { code: 'C', name: 'ODC' });
    assert.equal(created.status, 201);
    assert.equal((await request(role, 'odc', 'PUT', { name: 'Updated ODC' }, created.body.center.id)).status, 200);
  });
}

function sourceSection(start, end) {
  const a = appSource.indexOf(start), b = appSource.indexOf(end, a + start.length);
  assert(a >= 0 && b > a);
  return appSource.slice(a, b);
}

test('fiber toolbar exposes add buttons to technicians and secretaries without broad write buttons', async () => {
  const code = sourceSection('async function renderMonitoringFiberNetwork(', 'function buildRadiusRouterOsScript(');
  for (const role of ['technician', 'secretary', 'collector', 'viewer']) {
    const permissions = auth.publicRoles().find((row) => row.value === role).permissions;
    const app = { innerHTML: '' };
    await vm.runInNewContext(`${code}\nrenderMonitoringFiberNetwork()`, {
      app, state: {}, can: (key) => permissions.includes(key), shouldShowPageLoading: () => false, queryString: () => '',
      api: async () => ({ centers: [], points: [], nocs: [], summary: {} }), renderIsStale: () => false,
      metric: () => '', monitoringMapNumber: (value) => value || 0, escapeHtml: (value) => String(value || ''),
      monitoringFiberAreaOptions: () => '', bindMonitoringFiberNetwork: () => {}, mountMonitoringFiberMap: async () => {}, setToast: () => {}
    });
    const allowed = ['technician', 'secretary'].includes(role);
    assert.equal(app.innerHTML.includes('id="addFiberOdc"'), allowed, role);
    assert.equal(app.innerHTML.includes('id="addFiberOdp"'), allowed, role);
  }
  assert.match(appSource, /if \(can\('monitoring:write'\) \|\| can\('monitoring:fiber:create'\)\) \{\s*map\.doubleClickZoom\.disable/);
});

test('coordinates from map create a new node, not PUT to an undefined id', async () => {
  const code = sourceSection('function openFiberOdcModal(', 'function bindMonitoringFiberNetwork(');
  for (const type of ['odc', 'odp']) for (const editing of [false, true]) {
    let save; const calls = []; let title;
    const row = { latitude: '-0.5', longitude: '117.1', ...(editing ? { id: 'existing-node' } : {}) };
    vm.runInNewContext(`${code}\n${type === 'odc' ? 'openFiberOdcModal' : 'openFiberOdpModal'}(row, {})`, {
      row, openModal: (value, body, callback) => { title = value; save = callback; },
      monitoringFiberFormBody: () => '', api: async (...args) => { calls.push(args); }, setToast: () => {},
      renderMonitoringFiberNetwork: async () => {}, mountFiberNodeCoordinatePicker: async () => {}
    });
    await save({ code: 'NODE', name: 'Node' });
    assert.equal(title.startsWith(editing ? 'Edit' : 'Tambah'), true);
    assert.equal(calls[0][0], `/api/monitoring/fiber-network/${type}${editing ? '/existing-node' : ''}`);
    assert.equal(calls[0][1].method, editing ? 'PUT' : 'POST');
  }
});
