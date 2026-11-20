'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const bridge = require('../src/olt-zte-bridge'), vendors = require('../src/olt-vendors');
const { fixture, model, reply, response } = require('./helpers/olt-bridge-fixture');
const selection = state => ({ address: state.address, serialNumber: state.serialNumber });
const input = state => ({ ...selection(state), port: 'eth_0/4', mode: 'trunk', vlans: [101, 102] });
const inspected = state => bridge.inspect(response(bridge.readCommands(selection(state)), state), selection(state));

test('OMCI editor reads real equipment identity, hides private WAN/WiFi config and protects management VLAN', () => {
  const state = inspected(model()), view = bridge.publicState(state), value = bridge.build(state, input(model()));
  assert.equal(view.model, 'HG8145V5'); assert.equal(view.ethernet, 4); assert.equal(view.ports.length, 4);
  assert.deepEqual(view.vlans, [101, 102]); assert.deepEqual(view.protectedVlans, [100]);
  assert(!JSON.stringify(view).includes('protected-key')); assert(!JSON.stringify(value).includes('protected-key'));
  view.ports[0].mode = 'bad'; assert.equal(state.ports[0].mode, '');
  for (const row of [{ vendor: 'FHTT', model: 'HG6145D2' }, { vendor: 'ZTEG', model: 'F670LV9.0' }]) {
    const sample = { ...model(), ...row }; assert.equal(inspected(sample).model, row.model);
  }
});
test('invalid/ambiguous targets, offline/config failures, unverified model/firmware and truncated data fail closed', () => {
  for (const extra of [{ address: '1/1/13:129' }, { address: '1/1/13:1;reboot' }, { serialNumber: 'bad' }]) assert.throws(() => bridge.target({ ...selection(model()), ...extra }));
  for (const extra of [{ firmware: 'V9' }, { online: false }, { config: 'failed' }, { eth: 0 }, { vendor: 'N/A' }, { model: 'N/A' }]) assert.throws(() => inspected({ ...model(), ...extra }));
  const state = model(), raw = response(bridge.readCommands(selection(state)), state);
  for (const change of [r => r.outputs.pop(), r => r.outputs.push(r.outputs[2]), r => { r.outputs.find(x => x.command.includes('by sn')).stdout += '\ngpon-onu_1/1/1:9'; }, r => { r.outputs.find(x => x.command.startsWith('show onu running')).stdout = 'pon-onu-mng gpon-onu_1/1/13:1\ntruncated'; }]) { const copy = structuredClone(raw); change(copy); assert.throws(() => bridge.inspect(copy, selection(state))); }
});
test('only selected existing service VLANs and one real UNI can be changed; management and advanced bindings are held', () => {
  const state = inspected(model());
  for (const extra of [{ port: 'eth_0/5' }, { port: 'eth_1/1' }, { port: 'eth_0/4\nreboot' }, { vlans: [100] }, { vlans: [200] }, { vlans: [101, 101] }, { vlans: ['101'] }, { vlans: [] }, { mode: 'transparent' }, { mode: 'access' }, { address: '1/1/1:1' }]) assert.throws(() => bridge.build(state, { ...input(model()), ...extra }));
  const advanced = structuredClone(state); advanced.other.push('vlan port eth_0/4 translate vlan 200'); assert.throws(() => bridge.build(advanced, input(model())), /lanjutan/);
  const protectedPort = structuredClone(state); protectedPort.ports[3].filters.push({ vlan: 100, priority: 0 }); assert.throws(() => bridge.build(protectedPort, input(model())), /management/);
  const access = bridge.build(state, { ...input(model()), mode: 'access', vlans: [102] });
  assert(bridge.mutations(access).includes('vlan port eth_0/4 mode tag vlan 102'));
  const commands = bridge.writeCommands(state, bridge.build(state, input(model())));
  assert(commands.includes('vlan-filter-mode ethuni eth_0/4 tag-filter vlan-match untag-filter discard'));
  assert(!commands.some(command => /^(?:no onu|service-port|service |gemport|tcont|write|save|reboot|ssid|wan)/.test(command)));
  assert(bridge.mutations(access)[0].includes('tag-filter discard untag-filter discard'));
});
test('same-session fresh identity, actual ONU prompt and physical OMCI readback gate every write', async () => {
  const { PassThrough } = require('node:stream'), [, context, transport] = await vendors.loadLibrary();
  for (const scenario of ['trunk', 'access', 'changed', 'swapped', 'offline', 'wrong-mode', 'vendor-error', 'physical-failed', 'physical-extra-vlan', 'other-port-changed']) {
    const { data, device } = fixture(), state = model(), baseline = inspected(state), desired = { ...input(state), ...(scenario === 'access' ? { mode: 'access', vlans: [101] } : {}) }, value = bridge.build(baseline, desired), commands = bridge.writeCommands(baseline, value), sent = []; let after = false;
    const result = await context.withContext(data, device, () => {
      context.authorizeBridgeOperation(baseline, value); context.current().bridgeGrant.used = true;
      return transport.shellSession({ olt: vendors.legacyDevice(device), password: 'unit', commands, timeoutMs: 1800 }, ({ ready }) => {
        const stream = new PassThrough(); stream.write = chunk => {
          const command = String(chunk).trim(); sent.push(command);
          if (command === 'show onu running config gpon-onu_' + state.address && scenario === 'changed') state.other.push('service OTHER gemport 8 vlan 200');
          if (command.startsWith('show gpon onu detail-info ') && scenario === 'swapped') state.serialNumber = 'HWTC11223344';
          if (command.startsWith('show gpon onu detail-info ') && scenario === 'offline') state.online = false;
          if (command === 'end') { after = true; if (scenario === 'physical-failed') state.physicalFailed = true; if (scenario === 'physical-extra-vlan') state.physicalExtra = '0 103\n'; if (scenario === 'other-port-changed') state.portConfig.push('vlan port eth_0/2 mode tag vlan 101'); }
          let text = reply(command, state);
          if (scenario === 'wrong-mode' && command.startsWith('pon-onu-mng ')) text = 'OLT(gpon-onu-mng 1/1/1:9)#';
          if (scenario === 'vendor-error' && command.startsWith('vlan-filter ')) text = '%Code 123: rejected\nOLT(gpon-onu-mng ' + state.address + ')#';
          queueMicrotask(() => stream.emit('data', text)); return true;
        }; ready(stream, () => {}, true); queueMicrotask(() => stream.emit('data', 'OLT#'));
      });
    }, { bridgeActionAllowed: true });
    if (['trunk', 'access'].includes(scenario)) { assert(result.success, result.error); assert(result.verified); assert(result.submitted); assert(after); assert.deepEqual(state.other, model().other); assert.deepEqual(state.interfaceLines, model().interfaceLines); }
    else { assert(!result.success, scenario); if (['changed', 'swapped', 'offline', 'wrong-mode'].includes(scenario)) assert(!sent.some(line => line.startsWith('vlan-filter-mode ')), scenario); }
  }
});
test('finite native grant rejects arbitrary commands, target changes, replay and unapproved Dev writes', async () => {
  const { data, device } = fixture(), state = inspected(model()), value = bridge.build(state, input(model())), [, context, transport] = await vendors.loadLibrary(); let calls = 0;
  process.env.MIGRATION_MODE = '1';
  try {
    await assert.rejects(context.withContext(data, device, () => context.authorizeBridgeOperation(state, value), { allowZteDevRead: true, bridgeActionAllowed: true }), /authorization/);
    await context.withContext(data, device, async () => {
      await assert.rejects(transport.executeOltCommands({ olt: vendors.legacyDevice(device), commands: ['vlan port eth_0/4 mode trunk'] }));
      context.authorizeBridgeOperation(state, value); const commands = bridge.writeCommands(state, value);
      await assert.rejects(transport.executeOltCommands({ olt: { ...vendors.legacyDevice(device), id: 'other' }, commands }));
    }, { allowZteDevRead: true, bridgeActionAllowed: true, explicitDevBridgeAction: true });
    await context.withContext(data, device, async () => {
      context.authorizeBridgeOperation(state, value); const commands = bridge.writeCommands(state, value);
      await transport.executeOltCommands({ olt: vendors.legacyDevice(device), commands });
      await assert.rejects(transport.executeOltCommands({ olt: vendors.legacyDevice(device), commands }));
    }, { allowZteDevRead: true, bridgeActionAllowed: true, explicitDevBridgeAction: true, transports: { commands: async () => { calls++; return { success: false, submitted: false }; } } });
    assert.equal(calls, 1);
  } finally { process.env.MIGRATION_MODE = '0'; }
});
test('current role/NAS, explicit consent, bounded read cache, persistent audits and uncertain outcomes never resend', async () => {
  const { data, device, actor } = fixture(), state = model(), before = structuredClone(data); let reads = 0, writes = 0, audits = 0;
  const options = { transportOptions: { transports: { commands: async ({ commands }) => { if (commands.includes('configure terminal')) { writes++; return { success: false, submitted: true }; } reads++; return response(commands, state); } } }, beforeSend: async () => { audits++; }, afterSend: async () => { audits++; } };
  await bridge.read(data, device, actor, selection(state), options); await bridge.read(data, device, actor, selection(state), options); assert.equal(reads, 1);
  const plan = await bridge.prepare(data, device, actor, input(state), options); assert.equal(reads, 1);
  const confirmation = { token: plan.token, revision: device.updatedAt || '', confirmId: device.id, confirmTarget: state.serialNumber, confirmImpact: true };
  for (const extra of [{ confirmImpact: false }, { confirmTarget: 'WRONG' }, { revision: 'changed' }, { confirmId: 'other' }]) await assert.rejects(bridge.execute(data, device, actor, { ...confirmation, ...extra }, options));
  actor.active = false; await assert.rejects(bridge.execute(data, device, actor, confirmation, options)); actor.active = true;
  const result = await bridge.execute(data, device, actor, confirmation, options); assert(result.uncertain); assert(!result.verified); assert.equal(writes, 1); assert.equal(audits, 2);
  assert.deepEqual(await bridge.execute(data, device, actor, confirmation, options), result); assert.equal(writes, 1);
  assert.deepEqual(data, before);
});
test('editor assets are included in installer/updater and contain no timer or automatic retry', () => {
  for (const file of ['../install.sh', '../deploy/bin/fakenet-billing-update']) {
    const source = fs.readFileSync(require.resolve(file), 'utf8'); assert(source.includes('src/olt-zte-bridge.js')); assert(source.includes('public/olt-bridge.js'));
  }
  const source = fs.readFileSync(require.resolve('../public/olt-bridge.js'), 'utf8'); assert(!source.includes('setInterval')); assert(!source.includes('setTimeout'));
});
test('preview uses only a short-lived connection/SN-bound read cache and expiry forces a new native read', async () => {
  const { data, device, actor } = fixture(), state = model(), realNow = Date.now; let now = realNow(), reads = 0;
  Date.now = () => now;
  const options = { transportOptions: { transports: { commands: async ({ commands }) => { reads++; return response(commands, state); } } } };
  try {
    await bridge.read(data, device, actor, selection(state), options); assert.equal(reads, 1);
    const first = await bridge.prepare(data, device, actor, input(state), options); assert.equal(reads, 1); assert.equal(first.value.model, 'HG8145V5');
    state.model = 'HG-OTHER'; now += 31000;
    const fresh = await bridge.prepare(data, device, actor, input(state), options); assert.equal(reads, 2); assert.equal(fresh.value.model, 'HG-OTHER');
    actor.active = false; await assert.rejects(bridge.read(data, device, actor, selection(state), options)); assert.equal(reads, 2);
  } finally { Date.now = realNow; }
});

test('bridge protects non-default management IP-host VLANs and rejects ambiguous native service maps',()=>{
 const state=model();state.interfaceLines.push('service-port 4 vport 4 user-vlan 200 vlan 200');state.other.push('service FBV200 gemport 4 vlan 200','ip-host 1 dhcp-enable enable vlan 200');
 const view=bridge.publicState(inspected(state));assert.deepEqual(view.protectedVlans,[100,200]);assert.deepEqual(view.vlans,[101,102]);assert(view.services.every(row=>row.userVlan!==200));
 for(const line of['service-port 2 vport 2 user-vlan 201 vlan 201','service-port 4 vport 4 user-vlan 101 vlan 101','service-port 4 vport 4 user-vlan 5000 vlan 5000']){const duplicate=model();duplicate.interfaceLines.push(line);assert.throws(()=>inspected(duplicate),/ganda\/tidak valid/);}
 const duplicate=model();duplicate.other.push('service DUPLICATE gemport 2 vlan 101');assert.throws(()=>inspected(duplicate),/lebih dari satu/);
});

test('Access-to-Trunk and Trunk-to-Access replace only the chosen whitelist in Huawei, FiberHome and ZTE model fixtures',()=>{
 for(const physical of[{vendor:'HWTC',model:'HG8145V5'},{vendor:'FHTT',model:'HG6245N'},{vendor:'ZTEG',model:'F609V5.3'}]){
  const state={...model(),...physical,nativeVlanTable:true},before=structuredClone(state);state.portConfig.push('vlan port eth_0/2 mode tag vlan 102');
  for(const desired of[{mode:'access',vlans:[101]},{mode:'trunk',vlans:[101,102]},{mode:'access',vlans:[102]}]){
   const baseline=inspected(state),value=bridge.build(baseline,{...input(state),...desired}),grant=bridge.authorize(baseline,value),raw=response(grant.commands,state),actual=bridge.verifyResult(raw,grant);
   assert.equal(actual.ports[3].mode,desired.mode==='access'?'tag':'trunk');assert.deepEqual(actual.ports[3].filters.map(row=>row.vlan).sort(),desired.vlans);
   assert(state.portConfig.includes('vlan port eth_0/2 mode tag vlan 102'));assert.deepEqual(state.interfaceLines,before.interfaceLines);assert.deepEqual(state.other,before.other);
  }
 }
});
