'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../deploy/genieacs/bootstrap.js'), 'utf8');

function fixture(options = {}) {
  const parameters = new Map([['private-parameter', { _id: 'private-parameter', script: 'return {value:["kept","xsd:string"]};' }]]);
  const presets = new Map(), provisions = new Map(), config = new Map(), calls = [], logs = [];
  if (options.existing) {
    presets.set('fakenet-virtual-parameters', { _id: 'fakenet-virtual-parameters', precondition: options.precondition || '{}', weight: 12 });
    provisions.set('inform', { _id: 'inform', script: 'const informInterval = 300;' });
  }
  const json = value => new Response(JSON.stringify(value));
  const fetch = async (url, input = {}) => {
    const pathname = new URL(url).pathname, method = input.method || 'GET';
    calls.push({ pathname, method, body: input.body });
    if (pathname === '/devices/') return json([]);
    if (pathname === '/status') return new Response('OK');
    if (pathname === '/init') {
      if (method === 'POST') provisions.set('inform', { _id: 'inform', script: 'const informInterval = 300;' });
      return json({ users: !options.initialized });
    }
    if (pathname === '/login') return options.loginFails ? new Response('Denied', { status: 401 }) : json('fixture-session');
    if (pathname === '/api/config/cwmp.auth' && options.authFails) return new Response('Unavailable', { status: 500 });
    if (pathname === '/api/config') return json([...config.values()]);
    if (pathname.startsWith('/api/config/')) {
      const id = decodeURIComponent(pathname.slice('/api/config/'.length));
      if (options.templateFails && id === 'ui.device.0.type') return new Response('Unavailable', { status: 500 });
      if (method === 'DELETE') config.delete(id);
      else config.set(id, { _id: id, ...JSON.parse(input.body) });
      return json({});
    }
    if (pathname.startsWith('/api/')) return json({});
    for (const [prefix, map] of [['/virtualParameters', parameters], ['/presets', presets], ['/provisions', provisions]]) {
      if (pathname === prefix) return json([...map.values()]);
      if (pathname.startsWith(prefix + '/') && method === 'PUT') {
        if (prefix === '/provisions' && options.provisionFails) return new Response('Unavailable', { status: 500 });
        const id = decodeURIComponent(pathname.slice(prefix.length + 1));
        map.set(id, { _id: id, ...(prefix === '/provisions' ? { script: input.body } : JSON.parse(input.body)) });
        return json({});
      }
    }
    throw Error('Unexpected request: ' + method + ' ' + pathname);
  };
  const sandbox = { require: name => name === 'fs' ? { ...fs, existsSync: () => false }
    : name === 'child_process' ? { spawnSync: options.spawnSync || (() => ({ status: 1 })) }
    : name === './ui-template' ? require('../deploy/genieacs/ui-template') : require(name),
  module: { exports: {} }, __dirname: path.join(__dirname, '../deploy/genieacs'),
  process: { env: { APP_ADMIN_PASSWORD: 'fixture-admin-password', ...(options.existing ? { GENIEACS_BOOTSTRAP_EXTERNAL: '1' } : {}), ...options.env },
    stdout: { write: value => logs.push(value) }, stderr: { write: value => logs.push(value) } },
  fetch, AbortController, setTimeout, clearTimeout, console };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return { ...sandbox.module.exports, parameters, presets, provisions, config, calls, logs };
}

test('fresh ACS setup verifies accounts before hardening Inform and enables its bounded daily preset', async () => {
  const f = fixture(); await f.main();
  assert.equal(f.parameters.size, 27);
  assert.equal(f.presets.get('fakenet-virtual-parameters').precondition, '{}');
  assert.match(f.provisions.get('inform').script, /FAKENET_ACTIVE_CLIENTS_BEGIN/);
  assert.match(f.provisions.get('inform').script, /informInterval = 300/);
  assert(f.calls.findIndex(row => row.pathname === '/init' && row.method === 'POST') < f.calls.findIndex(row => row.pathname === '/provisions/inform' && row.method === 'PUT'));
  assert(f.calls.some(row => row.pathname === '/api/config/cwmp.auth' && row.method === 'PUT'));
  assert.equal(f.calls.filter(row => row.pathname === '/login').length, 3);
  assert(f.config.has('ui.device.0.type'));
  assert(f.logs.some(line => line.includes('Template web GenieACS generik terverifikasi')));
});
for (const failure of ['loginFails', 'authFails', 'provisionFails', 'templateFails']) test('ACS bootstrap fails closed on ' + failure, async () => {
  const f = fixture({ [failure]: true });
  await assert.rejects(f.main());
  assert(!f.logs.some(line => line.includes('Bootstrap GenieACS selesai')));
});
test('already initialized bundled ACS also preserves its custom UI on updates', async () => {
  const f = fixture({ initialized: true }); await f.main();
  assert(!f.calls.some(row => row.pathname === '/api/config' || row.pathname.startsWith('/api/config/ui.')));
});
for (const precondition of ['{}', '{"_id":"disabled-by-owner"}']) test('existing ACS preserves account and preset policy ' + precondition, async () => {
  const f = fixture({ existing: true, precondition }); await f.main();
  assert.equal(f.presets.get('fakenet-virtual-parameters').precondition, precondition);
  assert.equal(f.presets.get('fakenet-virtual-parameters').weight, 12);
  assert(!f.calls.some(row => row.pathname.startsWith('/api/') || row.pathname === '/login' || row.pathname === '/init'));
  assert.equal(f.parameters.get('private-parameter').script, 'return {value:["kept","xsd:string"]};');
});
test('explicitly disabled fresh auto-provision stays disabled', async () => {
  const f = fixture({ env: { GENIEACS_AUTO_VP_PROVISION: '0' } }); await f.main();
  assert.equal(JSON.parse(f.presets.get('fakenet-virtual-parameters').precondition)._id, '__disabled_by_fakenet_billing__');
});
test('fresh ACS uses the billing initial admin password, without changing Inform credentials', async () => {
  const f = fixture(); await f.main();
  const password = f.calls.find(row => row.pathname === '/api/users/admin/password');
  assert.equal(JSON.parse(password.body).newPassword, 'fixture-admin-password');
  const auth = f.calls.find(row => row.pathname === '/api/config/cwmp.auth');
  assert.equal(JSON.parse(auth.body).value, 'AUTH("admin", "1sampai10")');
});
test('missing initial admin password prevents fresh ACS bootstrap success', async () => {
  const f = fixture({ env: { APP_ADMIN_PASSWORD: '' } });
  await assert.rejects(f.main(), /Password akun awal/);
  assert(!f.calls.some(row => row.pathname === '/init'));
});
test('dry-run bootstrap never writes presets, accounts, scripts or Inform', async () => {
  const f = fixture({ env: { GENIEACS_BOOTSTRAP_DRY_RUN: '1' } }); await f.main();
  assert(f.calls.every(row => row.method === 'GET'));
});
test('bundled ACS can use mongosh inside its own Mongo container without installing a host shell', () => {
  const calls = [], f = fixture({ spawnSync(command, args) { calls.push({ command, args }); return { status: command === 'docker' ? 0 : 1 }; } });
  assert.equal(f.mongoShell().command, 'docker');
  assert(calls.some(row => row.command === 'docker' && row.args.join(' ') === 'exec fakenet-billing-genieacs-mongodb mongosh --version'));
});
test('external ACS without a host shell never touches the bundled Mongo container', () => {
  const calls = [], f = fixture({ existing: true, spawnSync(command) { calls.push(command); return { status: 1 }; } });
  assert.equal(f.mongoShell(), null); assert(!calls.includes('docker'));
});
test('Huawei firewall hardening never creates a custom section in a fresh/default ACS layout', () => {
  for (const exists of [false, true]) {
    let writes = 0;
    const f = fixture({ spawnSync(command, args) {
      if (args.includes('--version')) return { status: 0 };
      vm.runInNewContext(args.at(-1), { db: { getCollection: () => ({
        find: () => ({ toArray: () => exists ? [{ value: 'InternetGatewayDevice.X_HW_Security.FirewallLevel' }] : [] }),
        updateOne: () => { writes++; }
      }) }, print: () => {} });
      return { status: 0, stdout: '' };
    } });
    f.hardenHuaweiFirewallLevelUiViaMongo(); assert.equal(writes, exists ? 3 : 0);
  }
});
