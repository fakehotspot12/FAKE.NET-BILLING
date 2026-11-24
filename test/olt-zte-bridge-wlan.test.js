'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const bridge = require('../src/olt-zte-bridge'), vendors = require('../src/olt-vendors');
const { fixture, model, reply, response } = require('./helpers/olt-bridge-fixture');
const selection = state => ({ address: state.address, serialNumber: state.serialNumber });
const input = state => ({ ...selection(state), kind: 'wlan', port: 'wifi_0/5', mode: 'access', vlans: [101] });
function sample() {
  return { ...model(), wifiCount: 4, nativeVlanTable: true, ssids: [
    { name: 'wifi_0/1', ssid: 'Private Network', band: '5', key: 'private-main-key' },
    { name: 'wifi_0/5', ssid: 'Guest 5G', band: '2.4', key: 'private-guest-key' }
  ] };
}
const inspected = state => bridge.inspect(response(bridge.readCommands(selection(state), 'wlan'), state), selection(state), false, 'wlan');
test('WLAN maps actual reported sparse OMCI SSID identities, never index or a 5G name', () => {
  const state = inspected(sample()), view = bridge.publicState(state), value = bridge.build(state, input(sample()));
  assert.equal(view.kind, 'wlan'); assert.equal(view.ports.length, 2); assert.equal(view.ports[1].name, 'wifi_0/5'); assert.equal(view.ports[1].band, '2.4');
  assert.equal(view.ports[0].band, '5'); assert.equal(view.ports[1].ssid, 'Guest 5G'); assert(view.ports.every(row => row.editable));
  for (const item of [view, value]) assert(!/private-main-key|private-guest-key|private-fixture-key|protected-key/.test(JSON.stringify(item)));
  const unknown = sample(); delete unknown.ssids[1].band; assert.equal(inspected(unknown).ports[1].band, '');
  assert(bridge.mutations(value).every(command => !/ethuni|eth_0\//.test(command)));
  assert(bridge.mutations(value).includes('vlan port wifi_0/5 mode tag vlan 101'));
  assert(!bridge.mutations(value).some(command => /^(?:ssid |wifi )/.test(command)));
});
test('empty SSID must not consume the next MAC, password or band line as its name', () => {
  const raw = 'Interface: wifi_0/1\n Name:                     \n MAC: N/A\n Current users: 0\n Key: PRIVATE\nOLT#';
  const parsed = bridge.ssidMapping(raw, 4); assert.equal(parsed.ports[0].ssid, ''); assert.equal(parsed.ports[0].editable, false);
  const state = sample(); state.ssids[1].ssid = ''; const read = inspected(state);
  assert.throws(() => bridge.build(read, input(state)), /SSID/);
});
test('zero/unsupported WLAN never manufactures SSID slots from WiFi capability counts', () => {
  const state = inspected(model()), view = bridge.publicState(state);
  assert.equal(view.wifi, 8); assert.deepEqual(view.ports, []); assert.match(view.unavailableReason, /OMCI/);
  assert.throws(() => bridge.build(state, input(model())));
});
test('native existing WLAN bindings remain readable without inventing missing SSID identities',()=>{
 const sample=model();sample.portConfig=['vlan port wifi_0/5 mode tag vlan 101','vlan-filter wifi wifi_0/5 pri 0 vlan 101'];
 const state=inspected(sample),view=bridge.publicState(state),port=view.ports[0];
 assert.equal(view.ports.length,1);assert.equal(port.name,'wifi_0/5');assert.equal(port.vlan,101);assert.equal(port.protection,'ssid-unmapped');assert.match(port.protectionReason,/Identitas SSID/);assert.equal(port.editable,false);
 assert.throws(()=>bridge.build(state,input(sample)),/SSID/);
 sample.wifiCount=0;assert.throws(()=>inspected(sample),/kemampuan/);
});
test('protection reasons distinguish actual management, backhaul, advanced binding and missing identity',()=>{
 const sample={...model(),wifiCount:8,ssids:[{name:'wifi_0/1',ssid:'Backhaul'},{name:'wifi_0/2',ssid:''},{name:'wifi_0/3',ssid:'Private'},{name:'wifi_0/4',ssid:'Guest'}],portConfig:['vlan port wifi_0/3 mode tag vlan 100'],other:[...model().other,'vlan port wifi_0/4 translate vlan 102']};
 const state=inspected(sample),view=bridge.publicState(state);
 assert.deepEqual(view.ports.map(port=>port.protection),['backhaul','ssid-unmapped','management','advanced']);
 assert(view.ports.every(port=>port.editable===false&&port.protectionReason));assert(!JSON.stringify(view).includes('protected-key'));
 for(const port of view.ports)assert.throws(()=>bridge.build(state,{...input(sample),port:port.name}));
});
test('SSID duplicates, backhaul, cross-kind injection, WLAN trunk and management VLAN are held', () => {
  const state = sample(), baseline = inspected(state);
  for (const extra of [{ kind: 'lan' }, { kind: 'wifi' }, { port: 'eth_0/4' }, { port: 'wifi_0/2' }, { mode: 'trunk' }, { vlans: [100] }, { vlans: [101, 102] }]) assert.throws(() => bridge.build(baseline, { ...input(state), ...extra }));
  const duplicate = sample(); duplicate.ssids[1].name = 'wifi_0/1'; assert.throws(() => inspected(duplicate), /ganda/);
  const backhaul = sample(); backhaul.ssids[1].ssid = 'Backhaul'; assert.throws(() => bridge.build(inspected(backhaul), input(backhaul)), /SSID/);
  const over = sample(); over.wifiCount = 1; assert.throws(() => inspected(over), /lengkap/);
});
test('native WLAN apply preserves names/keys/radio/LAN and checks full SSID identity before and after mutation', async () => {
  const { PassThrough } = require('node:stream'), [, context, transport] = await vendors.loadLibrary();
  for (const scenario of ['success', 'clients-change', 'renamed-before', 'key-changed-before', 'renamed-after', 'key-changed-after', 'extra-vlan']) {
    const { data, device } = fixture(), state = sample();
    state.portConfig.push('vlan port eth_0/2 mode tag vlan 102');
    const baseline = inspected(state), value = bridge.build(baseline, input(state)), commands = bridge.writeCommands(baseline, value), writes = [], originalSsids = structuredClone(state.ssids);
    const result = await context.withContext(data, device, () => {
      context.authorizeBridgeOperation(baseline, value); context.current().bridgeGrant.used = true;
      return transport.shellSession({ olt: vendors.legacyDevice(device), password: 'unit', commands, timeoutMs: 1800 }, ({ ready }) => {
        const stream = new PassThrough(); stream.write = chunk => {
          const command = String(chunk).trim(); writes.push(command);
          if (command.startsWith('show gpon remote-onu ssid info ')) {
            if (scenario === 'renamed-before') state.ssids[1].ssid = 'Changed';
            if (scenario === 'key-changed-before') state.ssids[0].key = 'CHANGED';
            if (scenario === 'clients-change') state.ssidClients++;
          }
          if (command === 'end') {
            if (scenario === 'renamed-after') state.ssids[1].ssid = 'Changed';
            if (scenario === 'key-changed-after') state.ssids[0].key = 'CHANGED';
            if (scenario === 'extra-vlan') state.physicalExtra = '0 102\n';
          }
          const text = reply(command, state); queueMicrotask(() => stream.emit('data', text)); return true;
        }; ready(stream, () => {}, true); queueMicrotask(() => stream.emit('data', 'OLT#'));
      });
    }, { bridgeActionAllowed: true });
    if (['success', 'clients-change'].includes(scenario)) {
      assert(result.success, result.error); assert(result.verified); assert.deepEqual(state.ssids, originalSsids);
      assert(state.portConfig.includes('vlan port eth_0/2 mode tag vlan 102')); assert.deepEqual(state.other, model().other); assert.deepEqual(state.interfaceLines, model().interfaceLines);
    } else {
      assert(!result.success, scenario);
      if (scenario.endsWith('-before')) assert(!writes.some(command => command.startsWith('vlan-filter-mode ')), scenario);
    }
  }
});
test('LAN and WLAN isolate native reads, then reuse their own short-lived snapshots', async () => {
  const { data, device, actor } = fixture(), state = sample(); let reads = 0;
  const options = { transportOptions: { transports: { commands: async ({ commands }) => { reads++; return response(commands, state); } } } };
  const lan = await bridge.read(data, device, actor, selection(state), options); assert.equal(lan.ports.length, 4);
  const wlan = await bridge.read(data, device, actor, { ...selection(state), kind: 'wlan' }, options); assert.equal(wlan.ports.length, 2); assert.equal(reads, 2);
  await bridge.read(data, device, actor, selection(state), options);
  await bridge.prepare(data, device, actor, input(state), options); assert.equal(reads, 2);
});
test('explicit refresh bypasses the short snapshot cache while normal tab changes remain local', async () => {
  const { data, device, actor } = fixture(), state = sample(), realNow = Date.now; let now = realNow(), reads = 0;
  Date.now = () => now;
  const options = { transportOptions: { transports: { commands: async ({ commands }) => { reads++; return response(commands, state); } } } };
  try {
    await bridge.read(data, device, actor, selection(state), options);
    now += 4000;
    await bridge.read(data, device, actor, { ...selection(state), force: true }, options);
    await bridge.read(data, device, actor, { ...selection(state), kind: 'wlan' }, options);
    assert.equal(reads, 3);
  } finally { Date.now = realNow; }
});
test('initial and cached responses share the real snapshot timestamp even if the clock advances during parsing',async()=>{
 const {data,device,actor}=fixture(),state=sample(),realNow=Date.now;let now=realNow(),reads=0;
 Date.now=()=>++now;
 try{
  const options={transportOptions:{transports:{commands:async({commands})=>{reads++;return response(commands,state);}}}};
  const first=await bridge.read(data,device,actor,selection(state),options);now+=10;
  assert.deepEqual(await bridge.read(data,device,actor,selection(state),options),first);assert.equal(reads,1);
 }finally{Date.now=realNow;}
});
test('a burst of LAN/SSID readers shares one read per kind without duplicate commands or shared mutable results', async () => {
  const { data, device, actor } = fixture(), state = sample(); let reads = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const options = { transportOptions: { transports: { commands: async ({ commands }) => { reads++; await gate; return response(commands, state); } } } };
  const requests = Array.from({ length: 24 }, (_, index) => bridge.read(data, device, actor, { ...selection(state), kind: index % 2 ? 'wlan' : 'lan' }, options));
  release(); const results = await Promise.all(requests); assert.equal(reads, 2); assert.equal(results.length, 24);
  results[0].ports[0].name = 'changed'; assert.equal(results[2].ports[0].name, 'eth_0/1'); assert.equal(results[1].ports[0].name, 'wifi_0/1');
  assert(!bridge.isBusy(device.id));
});
test('unsupported WiFi commands never break LAN reads or poison the cached LAN identity',async()=>{
 const{data,device,actor}=fixture(),state=sample(),seen=[];
 const options={transportOptions:{transports:{commands:async({commands})=>{seen.push(commands);return commands.some(command=>/remote-onu (?:vlan(?:-filter(?:-mode)?)? wifi|ssid info)/.test(command))?{success:false,error:'Perintah vendor belum didukung firmware',outputs:[]}:response(commands,state);}}}};
 const lan=await bridge.read(data,device,actor,selection(state),options);assert.equal(lan.ports.length,4);assert(seen[0].every(command=>!/wifi|ssid info/.test(command)));
 await assert.rejects(bridge.read(data,device,actor,{...selection(state),kind:'wlan'},options),error=>error.status===422&&/OMCI/.test(error.message));
 assert.deepEqual(await bridge.read(data,device,actor,selection(state),options),lan);assert.equal(seen.length,2);assert(!bridge.isBusy(device.id));
 assert(bridge.readCommands(selection(state),'wlan').every(command=>!/vlan eth |ethuni/.test(command)));
});
test('busy CLI and rejected login have distinct safe diagnostics, not a fabricated offline ONU',()=>{
 for(const[error,status,pattern]of[['Akses OLT sedang digunakan',429,/CLI sedang dipakai/],['Login CLI vendor ditolak',502,/Login CLI/],['Batas waktu pembacaan vendor terlampaui',503,/Antarmuka/]])assert.throws(()=>bridge.inspect({success:false,error,outputs:[]},selection(model())),failure=>failure.status===status&&pattern.test(failure.message));
});
test('one ONU retains multiple LAN/SSID bindings, shared VLANs and multi-VLAN trunks across separate verified edits', async () => {
  const { data, device, actor } = fixture(), state = sample(), original = structuredClone(state.ssids), realNow = Date.now; let now = realNow();
  Date.now = () => now;
  const options = { transportOptions: { transports: { commands: async ({ commands }) => response(commands, state) } }, beforeSend: async () => {}, afterSend: async () => {} };
  try {
    for (const desired of [{ kind:'lan',port:'eth_0/4',mode:'trunk',vlans:[101,102] },{ kind:'lan',port:'eth_0/1',mode:'access',vlans:[101] },{ kind:'wlan',port:'wifi_0/5',mode:'access',vlans:[101] }]) {
      now += 4000;
      const plan = await bridge.prepare(data, device, actor, { ...selection(state), ...desired }, options);
      const result = await bridge.execute(data, device, actor, { token:plan.token,revision:device.updatedAt||'',confirmId:device.id,confirmTarget:state.serialNumber,confirmImpact:true }, options);
      assert(result.verified, result.message); assert.equal(result.snapshot.kind, desired.kind);
      assert(!/private-main-key|private-guest-key/.test(JSON.stringify(result.snapshot)));
    }
    assert(state.portConfig.includes('vlan port eth_0/4 mode trunk'));
    assert(state.portConfig.includes('vlan-filter ethuni eth_0/4 pri 0 vlan 101'));
    assert(state.portConfig.includes('vlan-filter ethuni eth_0/4 pri 0 vlan 102'));
    assert(state.portConfig.includes('vlan port eth_0/1 mode tag vlan 101'));
    assert(state.portConfig.includes('vlan port wifi_0/5 mode tag vlan 101'));
    assert.deepEqual(state.ssids, original); assert.deepEqual(state.other, model().other);
    now += 4000; await assert.rejects(bridge.prepare(data,device,actor,input(state),options),/sudah sesuai/);
  } finally { Date.now = realNow; }
});
