'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../deploy/genieacs/bootstrap.js'), 'utf8');
const bundled = name => fs.readFileSync(path.join(__dirname, '../deploy/genieacs/virtual-parameters', name + '.js'), 'utf8');
const historicalIp = 'const rows = declare("VirtualParameters.pppoeIP", {});\n' +
  'const value = rows.size && rows.value && rows.value[0] ? rows.value[0] : "";\n\n' +
  'return { writable: false, value: [value, "xsd:string"] };\n';

function fixture(options = {}) {
  const parameters = new Map([['private-parameter', { _id: 'private-parameter', script: 'return {value:["kept","xsd:string"]};' }]]);
  const presets = new Map(), provisions = new Map(), config = new Map(), devices = new Map(), calls = [], logs = [], mongoWrites = [];
  const collections = { virtualParameters: parameters, presets, provisions, config, devices };
  const matches = (row, query) => Object.entries(query).every(([key, value]) =>
    value instanceof RegExp || Object.prototype.toString.call(value) === '[object RegExp]' ? value.test(row[key])
      : value && typeof value === 'object' && '$in' in value ? value.$in.includes(row[key]) : row[key] === value);
  const mongoSpawn = (command, args) => {
    if (args.includes('--version')) return { status: command === 'mongosh' ? 0 : 1 };
    const output = [];
    try {
      vm.runInNewContext(args.at(-1), { db: { getCollection(name) {
        const map = collections[name];
        assert(map, 'Unexpected Mongo collection: ' + name);
        return {
          find: (query = {}) => ({ toArray: () => [...map.values()].filter(row => matches(row, query)),
            forEach: callback => [...map.values()].filter(row => matches(row, query)).forEach(callback) }),
          findOne: query => [...map.values()].find(row => matches(row, query)),
          deleteOne(query) {
            options.beforeMongoWrite?.({ name, map, query });
            mongoWrites.push({ name, query, operation: 'deleteOne' });
            const row = [...map.values()].find(row => matches(row, query));
            if (row) map.delete(row._id);
            return { deletedCount: row ? 1 : 0 };
          },
          updateOne(query, update, flags = {}) {
            options.beforeMongoWrite?.({ name, map, query, update });
            mongoWrites.push({ name, query, update, flags });
            let row = [...map.values()].find(row => matches(row, query));
            const inserted = !row;
            if (!row && !flags.upsert) return;
            if (!row) { assert(!map.has(query._id), 'Duplicate key'); row = { _id: query._id }; }
            for (const [key, value] of Object.entries({ ...(inserted ? update.$setOnInsert : {}), ...update.$set })) {
              const parts = key.split('.');
              let node = row;
              for (const part of parts.slice(0, -1)) node = node[part] ||= {};
              node[parts.at(-1)] = value;
            }
            map.set(row._id, row);
          }
        };
      } }, print: value => { logs.push(String(value)); output.push(String(value)); } });
      return { status: 0, stdout: output.join('\n') };
    } catch (error) { return { status: 1, stderr: error.message }; }
  };
  let staleLogins = options.staleLogins || 0;
  let stalePasswordLogins = 0;
  let vpReads = 0;
  if (options.existing) {
    presets.set('fakenet-virtual-parameters', { _id: 'fakenet-virtual-parameters', precondition: options.precondition || '{}', weight: 12 });
    provisions.set('inform', { _id: 'inform', script: 'const informInterval = 300;' });
  }
  const json = value => new Response(JSON.stringify(value));
  const fetch = async (url, input = {}) => {
    const pathname = new URL(url).pathname, method = input.method || 'GET';
    calls.push({ pathname, method, body: input.body });
    if (pathname === '/devices/') return json([...devices.values()]);
    if (pathname === '/status') return new Response('OK');
    if (pathname === '/init') {
      if (method === 'POST') provisions.set('inform', { _id: 'inform', script: 'const informInterval = 300;' });
      return json({ users: !options.initialized });
    }
    if (pathname === '/login') {
      if (options.loginFails) return new Response('Denied', { status: options.loginStatus || 401 });
      if (staleLogins-- > 0 || stalePasswordLogins-- > 0) return new Response('Incorrect username or password', { status: 400 });
      return json('fixture-session');
    }
    if (/^\/api\/users\/[^/]+\/password$/.test(pathname)) stalePasswordLogins = options.stalePasswordLogins || 0;
    if (pathname === '/api/config/cwmp.auth' && options.authFails) return new Response('Unavailable', { status: 500 });
    if (pathname === '/api/config') return json([...config.values()]);
    if (pathname.startsWith('/api/config/')) {
      const id = decodeURIComponent(pathname.slice('/api/config/'.length));
      if (options.templateFails && id === 'ui.device.0.type') return new Response('Unavailable', { status: 500 });
      if (method === 'DELETE') config.delete(id);
      else config.set(id, { _id: id, ...JSON.parse(input.body) });
      return json({});
    }
    if (pathname.startsWith('/api/virtualParameters/') && method === 'PUT') {
      if (options.uiVpWriteStatus) return new Response('Unavailable', { status: options.uiVpWriteStatus });
      const id = decodeURIComponent(pathname.slice('/api/virtualParameters/'.length));
      parameters.set(id, { _id: id, ...JSON.parse(input.body) });
      return json({});
    }
    if (pathname.startsWith('/api/')) return json({});
    for (const [prefix, map] of [['/virtualParameters', parameters], ['/presets', presets], ['/provisions', provisions]]) {
      if (pathname === prefix) {
        if (prefix === '/virtualParameters' && vpReads++ >= (options.vpReadLimit ?? Infinity)) return new Response('Not found', { status: 404 });
        return json([...map.values()]);
      }
      if (pathname.startsWith(prefix + '/') && method === 'PUT') {
        if (prefix === '/virtualParameters' && options.nbiVpWriteStatus) return new Response('Not found', { status: options.nbiVpWriteStatus });
        if (prefix === '/provisions' && options.provisionFails) return new Response('Unavailable', { status: 500 });
        const id = decodeURIComponent(pathname.slice(prefix.length + 1));
        map.set(id, { _id: id, ...(prefix === '/provisions' ? { script: input.body } : JSON.parse(input.body)) });
        return json({});
      }
    }
    throw Error('Unexpected request: ' + method + ' ' + pathname);
  };
  const sandbox = { require: name => name === 'fs' ? { ...fs, existsSync: () => false }
    : name === 'child_process' ? { spawnSync: options.spawnSync || (options.mongo ? mongoSpawn : () => ({ status: 1 })) }
    : name === './ui-template' ? require('../deploy/genieacs/ui-template') : require(name),
  module: { exports: {} }, __dirname: path.join(__dirname, '../deploy/genieacs'),
  process: { env: { APP_ADMIN_PASSWORD: 'fixture-admin-password', GENIEACS_LOGIN_RETRY_DELAY_MS: '1', ...(options.existing ? { GENIEACS_BOOTSTRAP_EXTERNAL: '1' } : {}), ...options.env },
    stdout: { write: value => logs.push(value) }, stderr: { write: value => logs.push(value) } },
  fetch, AbortController, setTimeout, clearTimeout, console };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return { ...sandbox.module.exports, parameters, presets, provisions, config, devices, calls, logs, mongoWrites };
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
for (const rule of [undefined, 'true', 'AUTH("existing-user", "existing-password")']) test('bundled ACS updates preserve existing Inform policy '+String(rule), async () => {
  const f=fixture({initialized:true});
  if(rule!==undefined)f.config.set('cwmp.auth',{_id:'cwmp.auth',value:rule});
  await f.main();
  assert.equal(f.config.get('cwmp.auth')?.value,rule);
  assert(!f.calls.some(row=>row.pathname==='/api/config/cwmp.auth'));
  assert(!f.calls.some(row=>/^\/api\/users\//.test(row.pathname)));
});
test('fresh bootstrap waits for native cached account and password changes without repeating initialization', async () => {
  const f = fixture({ staleLogins: 2, stalePasswordLogins: 2 }); await f.main();
  assert.equal(f.calls.filter(row => row.pathname === '/login').length, 7);
  assert.equal(f.calls.filter(row => row.pathname === '/init' && row.method === 'POST').length, 1);
  assert.equal(f.calls.filter(row => row.pathname === '/api/users/admin/password').length, 1);
  assert(f.config.has('ui.device.0.type'));
});
test('fresh bootstrap limits authentication retries and never reports a stale account as installed', async () => {
  const f = fixture({ loginFails: true, env: { GENIEACS_LOGIN_RETRY_ATTEMPTS: '3' } });
  await assert.rejects(f.main());
  assert.equal(f.calls.filter(row => row.pathname === '/login').length, 3);
  assert(!f.logs.some(line => line.includes('Bootstrap GenieACS selesai')));
});
test('wrong existing ACS credentials do not trigger default admin retries or password reset', async () => {
  const f = fixture({ initialized: true, loginFails: true }); await assert.rejects(f.main());
  assert.equal(f.calls.filter(row => row.pathname === '/login').length, 1);
  assert(f.calls.filter(row => row.pathname === '/login').every(row => JSON.parse(row.body).password === 'fixture-admin-password'));
  assert(!f.calls.some(row => row.pathname.startsWith('/api/users/')));
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
test('Huawei firewall repair only updates an existing exact legacy alias, never custom sections or labels', () => {
  const f = fixture({ mongo: true });
  const a = 'ui.device.3.components.15.parameters.0.components.0.parameters.0';
  const b = 'ui.device.3.components.15.parameters.1.parameter';
  const label = 'ui.device.3.components.15.parameters.1.label';
  f.hardenHuaweiFirewallLevelUiViaMongo(); assert.equal(f.mongoWrites.length, 0);
  f.config.set(a, { _id: a, value: 'InternetGatewayDevice.X_HW_Security.FirewallLevel' });
  f.config.set(b, { _id: b, value: 'InternetGatewayDevice.X_HW_Security.OwnerPolicy' });
  f.config.set(label, { _id: label, value: 'Owner Firewall Label' });
  f.hardenHuaweiFirewallLevelUiViaMongo();
  assert.equal(f.mongoWrites.length, 1);
  assert.equal(f.config.get(a).value, 'InternetGatewayDevice.X_HW_Security.X_HW_FirewallLevel');
  assert.equal(f.config.get(b).value, 'InternetGatewayDevice.X_HW_Security.OwnerPolicy');
  assert.equal(f.config.get(label).value, 'Owner Firewall Label');
  f.hardenHuaweiFirewallLevelUiViaMongo(); assert.equal(f.mongoWrites.length, 1);
});

test('Summon repair appends missing read paths without removing custom paths, sparse indices or UI fields', () => {
  const f = fixture({ mongo: true }), base = f.safeSummonButtonBases[0];
  f.config.set(base + '.type', { _id: base + '.type', value: "'summon-button'" });
  f.config.set(base + '.label', { _id: base + '.label', value: 'Owner Summon' });
  f.config.set(base + '.parameters.2', { _id: base + '.parameters.2', value: 'InternetGatewayDevice.Owner.NativeMetric' });
  f.config.set(base + '.parameters.7', { _id: base + '.parameters.7', value: f.safeSummonButtonParameters[0] });
  const originals = [...f.config].map(([key, value]) => [key, JSON.stringify(value)]);
  f.hardenSummonButtonsViaMongo();
  for (const [key, value] of originals) assert.equal(JSON.stringify(f.config.get(key)), value);
  assert.equal(f.config.size, originals.length + f.safeSummonButtonParameters.length - 1);
  assert.equal(f.config.get(base + '.parameters.8').value, f.safeSummonButtonParameters[1]);
  const first = JSON.stringify([...f.config]), count = f.mongoWrites.length;
  f.hardenSummonButtonsViaMongo();
  assert.equal(JSON.stringify([...f.config]), first); assert.equal(f.mongoWrites.length, count);
  assert(!f.logs.some(line => line.includes('gagal')));
});

test('Summon repair leaves unknown components and nonnumeric custom layouts alone', () => {
  for (const type of ["'custom-summon-button'", "'summon-button'"]) {
    const f = fixture({ mongo: true }), base = f.safeSummonButtonBases[0];
    f.config.set(base + '.type', { _id: base + '.type', value: type });
    f.config.set(base + '.parameters.owner', { _id: base + '.parameters.owner', value: 'Owner.NativePath' });
    const before = JSON.stringify([...f.config]);
    f.hardenSummonButtonsViaMongo();
    assert.equal(JSON.stringify([...f.config]), before); assert.equal(f.mongoWrites.length, 0);
  }
});

for (const index of [0, 1]) test('Summon root cleanup preserves custom leaf reads and sparse UI indices, base ' + index, () => {
  const f = fixture({ mongo: true }), base = f.safeSummonButtonBases[index];
  const roots = ['', 'Device', 'Device.', 'Device.*', 'InternetGatewayDevice', 'InternetGatewayDevice.', 'InternetGatewayDevice.*'];
  f.config.set(base + '.type', { _id: base + '.type', value: '"summon-button"' });
  const rootIds = roots.map((value, i) => {
    const _id = base + '.parameters.' + (i * 3 + 2);
    f.config.set(_id, { _id, value }); return _id;
  });
  for (const [i, value] of ['Device.WiFi.*', 'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username',
    'InternetGatewayDevice.Owner.*', 'DeviceStatus', 'Device.*.Owner', false, null, undefined].entries()) {
    const _id = base + '.parameters.' + (40 + i);
    f.config.set(_id, { _id, value });
  }
  for (const [_id, value] of [[base + '.label', 'Device'], [base + '.parameters.40.label', 'InternetGatewayDevice'],
    [base + '.ownerNote', ''], [base + '.parametersExtra.0', 'Device.*']]) f.config.set(_id, { _id, value });
  const originals = [...f.config].filter(([key]) => !rootIds.includes(key)).map(([key, row]) => [key, JSON.stringify(row)]);
  const native = { _id: 'fixture-device', InternetGatewayDevice: { WANDevice: { _object: true, _value: 'kept' } } };
  f.devices.set(native._id, structuredClone(native));
  f.hardenSummonButtonsViaMongo();
  for (const key of rootIds) assert(!f.config.has(key), 'Full-root entry survived: ' + key);
  for (const [key, value] of originals) assert.equal(JSON.stringify(f.config.get(key)), value);
  const reads = [...f.config.values()].filter(row => row._id.startsWith(base + '.parameters.') &&
    /^\d+$/.test(row._id.slice((base + '.parameters.').length))).map(row => row.value);
  assert(reads.every(value => typeof value !== 'string' || !roots.includes(value)));
  for (const value of f.safeSummonButtonParameters) assert(reads.includes(value));
  assert(f.config.has(base + '.parameters.48'), 'Safe additions must follow the original indices');
  assert.deepEqual(f.devices.get(native._id), native);
  assert(f.mongoWrites.every(row => row.name === 'config'));
  const deletes = f.mongoWrites.filter(row => row.operation === 'deleteOne');
  assert.equal(deletes.length, roots.length);
  assert(deletes.every(row => rootIds.includes(row.query._id) && roots.includes(row.query.value)));
  const first = JSON.stringify([...f.config]), count = f.mongoWrites.length;
  f.hardenSummonButtonsViaMongo();
  assert.equal(JSON.stringify([...f.config]), first); assert.equal(f.mongoWrites.length, count);
  assert.equal(f.calls.length, 0); assert(!f.logs.some(line => line.includes('gagal')));
});

test('Summon cleanup removes indexed roots even when a custom nonnumeric layout prevents safe appends', () => {
  const f = fixture({ mongo: true }), base = f.safeSummonButtonBases[0];
  f.config.set(base + '.type', { _id: base + '.type', value: "'summon-button'" });
  f.config.set(base + '.parameters.2', { _id: base + '.parameters.2', value: 'Device.*' });
  const custom = { _id: base + '.parameters.owner', value: 'Device.WiFi.*' };
  f.config.set(custom._id, custom);
  f.hardenSummonButtonsViaMongo();
  assert(!f.config.has(base + '.parameters.2'));
  assert.deepEqual(f.config.get(custom._id), custom);
  assert.equal(f.mongoWrites.length, 1);
  f.hardenSummonButtonsViaMongo(); assert.equal(f.mongoWrites.length, 1);
});

test('Summon cleanup cannot delete an operational leaf edited after its root snapshot was read', () => {
  let rootId;
  const f = fixture({ mongo: true, beforeMongoWrite({ name, map, query }) {
    if (name === 'config' && query._id === rootId) map.set(rootId, { _id: rootId, value: 'Device.WiFi.SSID.1.SSID' });
  } }), base = f.safeSummonButtonBases[0];
  rootId = base + '.parameters.9';
  f.config.set(base + '.type', { _id: base + '.type', value: 'summon-button' });
  f.config.set(rootId, { _id: rootId, value: 'Device' });
  f.hardenSummonButtonsViaMongo();
  assert.equal(f.config.get(rootId).value, 'Device.WiFi.SSID.1.SSID');
  const first = JSON.stringify([...f.config]), count = f.mongoWrites.length;
  f.hardenSummonButtonsViaMongo();
  assert.equal(JSON.stringify([...f.config]), first); assert.equal(f.mongoWrites.length, count);
  assert(!f.logs.some(line => line.includes('gagal')));
});

test('only known historical same-name definitions upgrade; canonical and unknown scripts are not rewritten', async () => {
  const f = fixture({ existing: true });
  assert.notEqual(historicalIp, bundled('ip'));
  f.parameters.set('ip', { _id: 'ip', script: historicalIp });
  f.parameters.set('gettemp', { _id: 'gettemp', script: bundled('gettemp') });
  const custom = { _id: 'RXPower', script: bundled('RXPower') + '\n// Owner calibration\n', owner: 'local' };
  f.parameters.set('RXPower', custom);
  await f.main();
  assert.equal(f.parameters.get('ip').script, bundled('ip'));
  assert.deepEqual(f.parameters.get('RXPower'), custom);
  assert(!f.calls.some(row => row.method === 'PUT' && /\/(?:RXPower|gettemp)$/.test(row.pathname)));
  assert(f.logs.some(line => line.includes('override') && line.includes('RXPower')));
  const before = JSON.stringify([...f.parameters]);
  f.calls.length = 0; await f.main();
  assert.equal(JSON.stringify([...f.parameters]), before);
  assert(!f.calls.some(row => row.method === 'PUT' && row.pathname.startsWith('/virtualParameters/')));
});

test('empty, malformed and other-name historical scripts are not proof of bundled ownership', async () => {
  for (const script of ['', null, { unexpected: true }, historicalIp]) {
    const f = fixture({ existing: true });
    const row = { _id: 'RXPower', script };
    f.parameters.set('RXPower', row);
    await f.main();
    assert.deepEqual(f.parameters.get('RXPower'), row);
    assert(!f.calls.some(call => call.pathname.endsWith('/RXPower') && call.method === 'PUT'));
  }
});

test('all current canonical scripts are recognized without writes or preservation warnings', () => {
  const f = fixture(), names = fs.readdirSync(path.join(__dirname, '../deploy/genieacs/virtual-parameters'))
    .filter(file => file.endsWith('.js')).map(file => file.slice(0, -3));
  const rows = names.map(name => ({ name, script: bundled(name) }));
  const plan = f.virtualParameterUpgradePlan(rows, rows.map(row => ({ _id: row.name, script: row.script })));
  assert.equal(rows.length, 26); assert.equal(plan.writes.length, 0); assert.equal(plan.preserved.length, 0);
  const next = f.virtualParameterUpgradePlan(rows.map(row => ({ ...row, script: row.script + '\n// Next bundled release\n' })),
    rows.map(row => ({ _id: row.name, script: row.script })));
  assert.equal(next.writes.length, 26); assert.equal(next.preserved.length, 0);
});

test('unmanaged names resembling a bundled name remain separate exact identities', async () => {
  const f = fixture({ existing: true });
  const custom = { _id: 'RXPower ', script: '// Owner definition with a different name' };
  f.parameters.set(custom._id, custom);
  await f.main();
  assert.equal(f.parameters.get('RXPower').script, bundled('RXPower'));
  assert.deepEqual(f.parameters.get(custom._id), custom);
});

for (const existing of [false, true]) test('preset extras, arguments and owner-disabled state survive ' + (existing ? 'external' : 'bundled') + ' upgrades', async () => {
  const f = fixture({ existing, initialized: true, env: { GENIEACS_AUTO_VP_PROVISION: '1' } });
  const preset = { _id: 'fakenet-virtual-parameters', weight: 0, precondition: '{"_id":"disabled-by-owner"}',
    events: { '1 BOOT': true }, channel: 'owner-channel', configurations: [
      { type: 'provision', name: 'owner-provision', args: ['keep'] },
      { type: 'provision', name: 'fakenet-virtual-parameters', args: ['owner-argument'] },
      { type: 'value', name: 'Tags.Owner', value: true }
    ] };
  f.presets.set(preset._id, structuredClone(preset));
  const unrelated = { _id: 'owner-preset', precondition: '{"Tags.Owner":true}', configurations: [] };
  f.presets.set(unrelated._id, structuredClone(unrelated));
  await f.main();
  assert.deepEqual(f.presets.get(preset._id), preset);
  assert.deepEqual(f.presets.get(unrelated._id), unrelated);
  await f.main(); assert.deepEqual(f.presets.get(preset._id), preset);
});

test('managed preset adds its missing invocation once without replacing existing configurations', async () => {
  const f = fixture({ existing: true });
  const extra = { type: 'provision', name: 'owner-provision', args: ['keep'] };
  f.presets.get('fakenet-virtual-parameters').configurations = [extra];
  await f.main(); await f.main();
  const configs = f.presets.get('fakenet-virtual-parameters').configurations;
  assert.deepEqual(configs, [extra, { type: 'provision', name: 'fakenet-virtual-parameters', args: [] }]);
});

for (const backfillOnly of [false, true]) test((backfillOnly ? 'standalone' : 'upgrade') + ' backfill preserves custom scripts, native device data and existing UI without CPE tasks', async () => {
  const f = fixture({ existing: true, mongo: true, env: backfillOnly ? { GENIEACS_BACKFILL_ONLY: '1' } : {} });
  const custom = { _id: 'RXPower', script: 'throw Error("Custom scripts must never run during bootstrap");' };
  f.parameters.set('RXPower', custom);
  f.parameters.set('getdeviceuptime', { _id: 'getdeviceuptime', script: bundled('getdeviceuptime') });
  const device = { _id: 'fixture-device', _tags: ['Owner'],
    InternetGatewayDevice: { _object: true, DeviceInfo: { UpTime: { _value: 3600, _type: 'xsd:unsignedInt' } }, OwnerData: { _value: 'kept' } },
    Device: { OwnerData: { _value: 'kept-too' } },
    VirtualParameters: { RXPower: { _value: -21, _type: 'xsd:int', _writable: false },
      'private-parameter': { _value: 'private-value' } } };
  f.devices.set(device._id, structuredClone(device));
  const ui = { _id: 'ui.device.8.owner', value: 'InternetGatewayDevice.OwnerData' };
  f.config.set(ui._id, structuredClone(ui));
  await f.main();
  const after = f.devices.get(device._id);
  assert.deepEqual(after.InternetGatewayDevice, device.InternetGatewayDevice);
  assert.deepEqual(after.Device, device.Device); assert.deepEqual(after._tags, device._tags);
  assert.deepEqual(after.VirtualParameters.RXPower, device.VirtualParameters.RXPower);
  assert.deepEqual(after.VirtualParameters['private-parameter'], device.VirtualParameters['private-parameter']);
  assert.match(after.VirtualParameters.getdeviceuptime._value, /01:00:00/);
  assert.deepEqual(f.parameters.get('RXPower'), custom); assert.deepEqual(f.config.get(ui._id), ui);
  assert(f.calls.every(row => !/\/tasks(?:\/|$)/.test(row.pathname)));
  assert(f.mongoWrites.filter(row => row.name === 'devices').every(row =>
    Object.keys(row.update).length === 1 && Object.keys(row.update.$set).every(key => key.startsWith('VirtualParameters.') && key !== 'VirtualParameters.RXPower')));
  const before = JSON.stringify([...f.devices]);
  f.mongoWrites.length = 0; await f.main();
  assert.equal(JSON.stringify([...f.devices]), before);
  assert(!f.mongoWrites.some(row => row.name === 'devices'));
  assert(!f.logs.some(line => line.includes('gagal')));
});

test('backfill-only skips missing and outdated definitions rather than caching values for scripts not installed', async () => {
  const f = fixture({ existing: true, mongo: true, env: { GENIEACS_BACKFILL_ONLY: '1' } });
  f.parameters.set('ip', { _id: 'ip', script: historicalIp });
  const device = { _id: 'fixture-device', VirtualParameters: { ip: { _value: 'owner-cached-value' }, pppoeIP: { _value: 'owner-address' } } };
  f.devices.set(device._id, structuredClone(device));
  await f.main();
  assert.deepEqual(f.devices.get(device._id), device);
  assert(!f.mongoWrites.some(row => row.name === 'devices' || row.name === 'virtualParameters'));
});

for (const vpReadLimit of [Infinity, 1]) test('NBI PUT 404 falls back to Mongo using the preservation plan; verification read limit ' + vpReadLimit, async () => {
  const f = fixture({ existing: true, mongo: true, nbiVpWriteStatus: 404, vpReadLimit });
  f.parameters.set('ip', { _id: 'ip', script: historicalIp });
  const custom = { _id: 'RXPower', script: '// owner\nreturn {value:[-20,"xsd:int"]};' };
  f.parameters.set('RXPower', custom);
  await f.main();
  assert.equal(f.parameters.get('ip').script, bundled('ip'));
  assert.deepEqual(f.parameters.get('RXPower'), custom);
  assert(!f.mongoWrites.some(row => row.name === 'virtualParameters' && row.query._id === 'RXPower'));
  assert(!f.calls.some(row => row.pathname.startsWith('/api/') || row.pathname === '/login' || row.pathname === '/init'));
  assert(f.logs.some(line => line.includes('terverifikasi')));
  assert(!f.logs.some(line => line.includes('backfill Virtual Parameters gagal')));
});

test('UI PUT fallback also receives only known managed upgrades, not preserved overrides', async () => {
  const f = fixture({ initialized: true, nbiVpWriteStatus: 404 });
  f.parameters.set('ip', { _id: 'ip', script: historicalIp });
  f.parameters.set('RXPower', { _id: 'RXPower', script: '// owner override' });
  await f.main();
  assert.equal(f.parameters.get('ip').script, bundled('ip'));
  assert.equal(f.parameters.get('RXPower').script, '// owner override');
  assert(!f.calls.some(row => row.pathname.endsWith('/RXPower') && row.method === 'PUT'));
  assert(f.calls.some(row => row.pathname === '/api/virtualParameters/ip' && row.method === 'PUT'));
});

test('unreadable baseline or unavailable write fallback fails closed without pretending an upgrade succeeded', async () => {
  for (const options of [{ vpReadLimit: 0, mongo: true }, { nbiVpWriteStatus: 404 }]) {
    const f = fixture({ existing: true, ...options });
    await assert.rejects(f.main());
    assert(!f.logs.some(line => line.includes('Sinkron GenieACS selesai')));
    assert.equal(f.parameters.size, 1);
    assert(!f.mongoWrites.some(row => row.name === 'devices' || row.name === 'virtualParameters'));
  }
});

for (const existing of [false, true]) test('Mongo fallback preserves a concurrently ' + (existing ? 'edited' : 'inserted') + ' owner definition', async () => {
  const replacement = '// owner changed during upgrade';
  const f = fixture({ existing: true, mongo: true, nbiVpWriteStatus: 404, beforeMongoWrite({ name, map, query }) {
    if (name === 'virtualParameters' && query._id === 'ip') map.set('ip', { _id: 'ip', script: replacement });
  } });
  if (existing) f.parameters.set('ip', { _id: 'ip', script: historicalIp });
  await assert.rejects(f.main(), /Verifikasi Virtual Parameters gagal/);
  assert.equal(f.parameters.get('ip').script, replacement);
  assert(!f.mongoWrites.some(row => row.name === 'devices'));
  assert(!f.calls.some(row => row.method === 'PUT' && /\/(?:provisions|presets)\/fakenet-virtual-parameters$/.test(row.pathname)));
});

test('dry-run reports unknown overrides separately without writing them', async () => {
  const f = fixture({ existing: true, env: { GENIEACS_BOOTSTRAP_DRY_RUN: '1' } });
  f.parameters.set('RXPower', { _id: 'RXPower', script: '// owner override' });
  await f.main();
  assert(f.calls.every(row => row.method === 'GET'));
  assert(f.logs.some(line => line.includes('Override existing dipertahankan: RXPower')));
});

function stockInformScript(){
 return [
  'const username = declare("DeviceID.ID", {value: 1}).value[0];',
  'const password = "fixture-connection-request-password";',
  'const informInterval = 300;',
  'const daily = Date.now(86400000);',
  '// Unique inform offset per device for better load distribution',
  'const informTime = daily % 86400000;',
  ...['InternetGatewayDevice','Device'].flatMap(root=>[
   `declare("${root}.ManagementServer.ConnectionRequestUsername", {value: daily}, {value: username});`,
   `declare("${root}.ManagementServer.ConnectionRequestPassword", {value: daily}, {value: password});`,
   `declare("${root}.ManagementServer.PeriodicInformEnable", {value: daily}, {value: true});`,
   `declare("${root}.ManagementServer.PeriodicInformInterval", {value: daily}, {value: informInterval});`,
   `declare("${root}.ManagementServer.PeriodicInformTime", {value: daily}, {value: informTime});`
  ])
 ].join('\n');
}
for(const root of ['InternetGatewayDevice','Device'])test('stock Inform repair prevents the atomic ZTE 9003/9007 rollback on '+root,()=>{
 const f=fixture(),original=stockInformScript(),patched=f.hardenInformProvisionScript(original);
 const execute=script=>{
  const writes=new Map();vm.runInNewContext(script,{Date:{now:()=>Date.parse('2026-11-26T01:25:02.783Z')},declare(path,timestamps,values){if(path==='DeviceID.ID')return{value:['fixture-device-id','xsd:string']};if(values&&path.startsWith(root+'.ManagementServer.'))writes.set(path,values.value);return{};}});
  const invalid=[...writes].find(([path,value])=>path.endsWith('.PeriodicInformTime')&&value<Date.UTC(2000,0,1));
  return invalid?{fault:9003,parameterFault:9007,applied:new Map()}:{fault:null,applied:writes};
 };
 assert.equal(execute(original).fault,9003);const actual=execute(patched);assert.equal(actual.fault,null);assert.equal(actual.applied.size,4);assert.equal(actual.applied.get(root+'.ManagementServer.PeriodicInformEnable'),true);assert.equal(actual.applied.get(root+'.ManagementServer.PeriodicInformInterval'),300);assert.equal(actual.applied.get(root+'.ManagementServer.ConnectionRequestUsername'),'fixture-device-id');assert.equal(actual.applied.get(root+'.ManagementServer.ConnectionRequestPassword'),'fixture-connection-request-password');assert(![...actual.applied.keys()].some(path=>/\.PeriodicInformTime$/.test(path)));assert.equal(f.hardenInformProvisionScript(patched),patched);
});
test('Inform compatibility repair preserves owner-defined scheduling, read-only queries and unrelated declarations',()=>{
 const f=fixture(),custom=[
  'const daily = Date.now() - 86400000;',
  'const informTime = "2026-11-26T00:00:00Z";',
  'declare("InternetGatewayDevice.ManagementServer.PeriodicInformTime", {value: daily}, {value: informTime});',
  'declare("Device.ManagementServer.PeriodicInformTime", {value: daily});',
  'declare("Tags.ownerPolicy", null, {value: true});'
 ].join('\n'),patched=f.hardenInformProvisionScript(custom);for(const line of custom.split('\n'))assert(patched.includes(line));assert(!patched.includes('FAKENET_INFORM_COMPAT'));
 const extra='log(informTime);',stock=f.hardenInformProvisionScript(stockInformScript()+'\n'+extra);assert(stock.includes('const informTime = daily % 86400000;'));assert(stock.includes(extra));assert(!stock.includes('PeriodicInformTime"'));
});
test('Inform repair handles stock single quotes and multiline CRLF without broadening management writes',()=>{
 const f=fixture(),script=stockInformScript().replaceAll('"',"'").replaceAll(', {value: daily}, {value:',',\n {value: daily},\n {value:').replaceAll('\n','\r\n'),patched=f.hardenInformProvisionScript(script);assert(!patched.includes('.PeriodicInformTime'));assert.equal((patched.match(/FAKENET_INFORM_COMPAT/g)||[]).length,1);assert(!/declare\([^\n]*(?:WANDevice|WLANConfiguration|ManagementServer\.(?:URL|Username|Password))/.test(patched));
});
test('Inform-only installer mode repairs the live provision without changing presets, authentication or other scripts',async()=>{
 const f=fixture({existing:true,env:{GENIEACS_INFORM_GUARD_ONLY:'1'}});f.provisions.set('inform',{_id:'inform',script:stockInformScript()});await f.main();assert(!f.provisions.get('inform').script.includes('.PeriodicInformTime'));assert(f.calls.filter(row=>row.method!=='GET').every(row=>row.method==='PUT'&&row.pathname==='/provisions/inform'));assert.equal(f.provisions.size,1);assert.equal(f.presets.size,1);assert.equal(f.config.size,0);
});
