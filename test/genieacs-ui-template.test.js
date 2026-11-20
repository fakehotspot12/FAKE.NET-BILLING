'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTemplate, installFreshTemplate, isTemplateKey } = require('../deploy/genieacs/ui-template');

function fixture(options = {}) {
  const original = [
    { _id: 'ui.device.0.type', value: '"tags"' },
    { _id: 'ui.device.99.type', value: '"parameter"' },
    { _id: 'cwmp.auth', value: 'AUTH("kept", "kept")' },
    { _id: 'ui.custom.value', value: '"kept"' }
  ];
  const config = new Map(original.map(row => [row._id, { ...row }]));
  let reads = 0, writes = 0, failures = 0;
  return { config, original, options: {
    initialized: true,
    read: async () => {
      reads++;
      if (reads === 2 && options.invalidReadback) return [];
      return [...config.values()];
    },
    put: async (id, body) => {
      if (++writes === 30 && options.writeFails && !failures++) throw Error('Fixture unavailable');
      config.set(id, { _id: id, ...body });
    },
    remove: async id => {
      if (id === 'ui.device.99.type' && options.deleteFails && !failures++) throw Error('Fixture unavailable');
      config.delete(id);
    }
  } };
}

test('generic UI is deterministic, scoped, bounded and ends with all parameters', () => {
  const rows = buildTemplate(['Device.DeviceInfo.*']);
  assert.deepEqual(rows, buildTemplate(['Device.DeviceInfo.*']));
  assert(rows.length > 300 && rows.length < 1200);
  assert.equal(new Set(rows.map(row => row._id)).size, rows.length);
  assert(rows.every(row => isTemplateKey(row._id) && typeof row.value === 'string'));
  assert(rows.some(row => row.value === '"Semua Parameter"' && row._id.startsWith('ui.device.7.')));
  assert(rows.some(row => row.value === '"all-parameters"' && row._id.startsWith('ui.device.7.')));
  assert(rows.some(row => row.value === '100' && row._id.endsWith('.limit')));
  assert.deepEqual(rows.filter(row => /^ui\.filters\.\d+\.type$/.test(row._id)).map(row => row.value),
    ['"string"', '"string"', '"string"', '"tag"']);
  assert(!JSON.stringify(rows).match(/https?:|192\.168\.|172\.16\.|@|<script/i));
});
test('native nested WAN/WiFi/client tables do not assume model, instance number, SSID band or cached count', () => {
  const rows = buildTemplate(), paths = rows.filter(row => row._id.endsWith('.parameter')).map(row => row.value);
  for (const root of ['InternetGatewayDevice.WANDevice', 'WANConnectionDevice', 'WANPPPConnection', 'WANIPConnection',
    'InternetGatewayDevice.LANDevice', 'WLANConfiguration', 'Hosts.Host', 'Device.WiFi.Radio', 'Device.WiFi.SSID', 'Device.Hosts.Host']) {
    assert(paths.includes(root), root);
  }
  assert(!paths.some(value => /\.[0-9]+(?:\.|$)|\.\*/.test(value)));
  assert(paths.includes('Active'));
  assert(paths.includes('HostName'));
  assert(paths.includes('VirtualParameters.activedevices'));
  assert(!paths.includes('TotalAssociations'));
});
test('sensitive credentials stay out of the device list and in a closed details section', () => {
  const rows = buildTemplate();
  assert(!rows.filter(row => row._id.startsWith('ui.index.')).some(row => /password|passphrase|presharedkey/i.test(row.value)));
  const secretType = rows.find(row => row.value === '"Kredensial perangkat dan WiFi"')._id;
  const base = secretType.split('.').slice(0, 3).join('.');
  assert(rows.some(row => row._id === base + '.element.tag' && row.value === '"details"'));
  assert(!rows.some(row => row._id.startsWith(base + '.') && row._id.endsWith('.open')));
  for (const row of rows.filter(row => /password|passphrase|presharedkey/i.test(row.value))) {
    assert(row._id.startsWith(base + '.'), row._id);
  }
});
test('existing ACS UI is untouched without even a snapshot or login request', async () => {
  const fail = async () => { throw Error('Must not touch existing UI'); };
  assert.deepEqual(await installFreshTemplate({ initialized: false, read: fail, put: fail, remove: fail }),
    { installed: false, reason: 'existing-ui' });
});
test('fresh install verifies the full template while preserving non-template config and auth', async () => {
  const f = fixture(), result = await installFreshTemplate(f.options);
  assert(result.installed);
  assert.equal(result.entries, buildTemplate().length);
  assert(!f.config.has('ui.device.99.type'));
  for (const row of f.original.filter(row => !isTemplateKey(row._id))) assert.deepEqual(f.config.get(row._id), row);
});
for (const failure of ['writeFails', 'deleteFails', 'invalidReadback']) test('failed fresh UI ' + failure + ' restores its snapshot', async () => {
  const f = fixture({ [failure]: true });
  await assert.rejects(installFreshTemplate(f.options), /UI awal dipulihkan/);
  assert.deepEqual([...f.config.values()].sort((a,b) => a._id.localeCompare(b._id)),
    [...f.original].sort((a,b) => a._id.localeCompare(b._id)));
});
test('invalid snapshot fails before making any config changes', async () => {
  let writes = 0;
  await assert.rejects(installFreshTemplate({ initialized: true, read: async () => ({}), put: async () => writes++ }), /Snapshot/);
  assert.equal(writes, 0);
});
