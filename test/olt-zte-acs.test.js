'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const acs=require('../src/olt-zte-acs'),policy=require('../src/olt-acs-policy'),tr=require('../src/olt-zte-tr069'),reg=require('../src/olt-zte-registration'),pnp=require('../src/olt-zte-pnp'),vendors=require('../src/olt-vendors'),base=require('./helpers/olt-registration-fixture');
const config={enabled:true,acsUrl:'http://192.0.2.10:7547/'};
function fixture(){const f=base.fixture();Object.assign(f.model,{registered:true,trLines:[],management:[{name:'internet',gem:1,vlan:101}]});Object.assign(f.model.onu,{tcont:[{id:1,profile:'default'}],gems:[{id:1,tcont:1,downstream:'default'}],services:[{id:1,gem:1,userVlan:101,vlan:101}]});f.device.onuAcs=config;return f;}
function reply(command,m){
 const iface='gpon-onu_'+m.onu.address;
 const toggle=command.match(/^tr069-mgmt (\d+) state (unlock|lock)$/);if(toggle){const index=m.trLines.findIndex(row=>row.startsWith('tr069-mgmt '+toggle[1]+' '));assert(index>=0);m.trLines[index]=m.trLines[index].replace(/ state (unlock|lock) /,' state '+toggle[2]+' ');return`OLT(gpon-onu-mng ${m.onu.address})#`;}
 if(/^tr069-mgmt \d+ state/.test(command))m.trLines=m.trLines.filter(row=>!row.startsWith(command.split(' ').slice(0,2).join(' ')+' '));
 if(command==='show vlan 100')return'vlanid          :100\nOLT#';
 if(command==='show gpon remote-onu capability '+iface)return base.reply(command,m).replace('OLT#','IP host number: 2\nVEIP number: 1\nOLT#');
 if(command==='show onu running config '+iface)return base.reply(command,m).replace('!\n',m.trLines.join('\n')+'\n!\n');
 if(command==='show gpon remote-onu ip-host '+iface)return[1,2].map(id=>`Host ID: ${id}\nIP addres: 0.0.0.0\nDHCP enable: ${id===1&&m.trLines.some(line=>line.startsWith('ip-host 1 '))?'enable':'disable'}\nCurrent IP address: 0.0.0.0\n`).join('\n')+'OLT#';
 let match;if((match=command.match(/^service (FBACS100) gemport (\d+) vlan (\d+)$/))){m.management.push({name:match[1],gem:Number(match[2]),vlan:Number(match[3])});return`OLT(gpon-onu-mng ${m.onu.address})#`;}
 if(/^(?:switchport-bind |ip-host |vlan-filter|tr069-mgmt )/.test(command)){if(!m.trLines.includes(command))m.trLines.push(command);return`OLT(gpon-onu-mng ${m.onu.address})#`;}
 return base.reply(command,m);
}
const response=(commands,m)=>({success:true,submitted:commands.includes('configure terminal'),outputs:commands.map(command=>({command,stdout:reply(command,m)}))});
function state(f){const value={address:f.model.onu.address,serialNumber:f.model.onu.serialNumber,type:f.model.onu.type};return{value,state:tr.inspect(response(tr.commands(value),f.model),value)};}
test('central OLT policy adds VLAN100 once and shares URL while legacy/off settings remain intact',()=>{
 const preset={vlanMode:'selected',vlans:[101,102],tr069:{enabled:false,acsUrl:''}},original=structuredClone(preset);
 assert.deepEqual(policy.preset({},preset),preset);const merged=policy.preset({onuAcs:config},preset);assert.deepEqual(merged.vlans,[100,101,102]);assert.deepEqual(merged.tr069,config);assert.deepEqual(preset,original);assert.deepEqual(policy.preset({onuAcs:config},merged),merged);
 assert.throws(()=>policy.normalize({enabled:true,acsUrl:'http://x/;reboot'}));assert.throws(()=>policy.preset({onuAcs:config},{vlanMode:'selected',vlans:Array.from({length:16},(_,n)=>n+200)}),/16 VLAN/);
});
test('separate management and TR069 switches do not force VLAN100 for an existing shared ACS route',()=>{
 const preset={vlanMode:'selected',vlans:[101,102]},before=structuredClone(preset);
 for(const enabled of [false,true])for(const managementEnabled of [false,true]){
  const config=policy.normalize({enabled,managementEnabled,acsUrl:enabled?'http://192.0.2.10:7547/':''}),result=policy.preset({onuAcs:config},preset);
  assert.deepEqual(result.vlans,managementEnabled?[100,101,102]:[101,102]);assert.equal(result.tr069.enabled,enabled);assert.equal(result.tr069.managementEnabled,managementEnabled);
 }
 assert.deepEqual(preset,before);assert.throws(()=>policy.normalize({enabled:true,managementEnabled:'false',acsUrl:config.acsUrl}));
});
test('management-only provisioning leaves shared INTERNET_TR069_VOIP service and ACS untouched',()=>{
 const f=fixture();f.model.management[0].name='INTERNET_TR069_VOIP';f.model.trLines=['tr069-mgmt 1 state unlock tag pri 3 vlan 101 acs '+config.acsUrl];
 const snapshot=state(f),native=acs.build(snapshot.state,config,'management'),spec={device:f.device,...snapshot,native},previous=f.model.trLines[0];
 assert(native.interfaceAdd.some(x=>/user-vlan 100 vlan 100/.test(x)));assert(!native.managementWrites.some(x=>/^tr069-mgmt /.test(x)));
 const result=acs.verifyResult(response(acs.writeCommands(spec),f.model),spec);assert(result.managementConfigured);assert.equal(f.model.trLines.find(x=>x.startsWith('tr069-mgmt ')),previous);assert.deepEqual(f.model.management[0],{name:'INTERNET_TR069_VOIP',gem:1,vlan:101});
});
test('TR069-only changes reuse the exact shared native VLAN without adding a host, VLAN or WAN',()=>{
 const f=fixture();f.model.management[0].name='INTERNET_TR069_VOIP';f.model.trLines=['tr069-mgmt 1 state lock tag pri 3 vlan 101 acs '+config.acsUrl,'pppoe 1 nat enable user customer password retained'];
 const snapshot=state(f),before=structuredClone(f.model),split={...config,managementEnabled:false},native=acs.build(snapshot.state,split),spec={device:f.device,...snapshot,value:{...snapshot.value,tr069:split},native};
 assert.equal(native.vlan,101);assert(native.existingOnly);assert.equal(native.managementWrites.length,1);assert.deepEqual(native.interfaceAdd,[]);assert(!acs.writeCommands(spec).includes('show vlan 100'));
 const result=acs.verifyResult(response(acs.writeCommands(spec),f.model),spec);assert(result.configured);assert.equal(result.vlan,101);assert.deepEqual(f.model.onu,before.onu);assert.deepEqual(f.model.management,before.management);assert(f.model.trLines.includes(before.trLines[1]));assert.equal(acs.publicState(state(f).state,f.device).tr069Vlan,101);
});
test('TR069-only requires an existing native route and refuses ambiguous or unproven shared service',()=>{
 const f=fixture(),before=state(f).state,split={...config,managementEnabled:false};assert.throws(()=>acs.build(before,split));
 before.management.push('tr069-mgmt 1 state unlock tag pri 0 vlan 101 acs '+config.acsUrl);
 for(const change of[s=>s.management.push('tr069-mgmt 2 state unlock tag pri 0 vlan 101 acs '+config.acsUrl),s=>s.unit.services[0].userVlan=102,s=>s.management=s.management.filter(x=>!x.startsWith('service ')),s=>s.management[1]=s.management[1].replace(config.acsUrl,'http://192.0.2.99/')]){const candidate=structuredClone(before);change(candidate);assert.throws(()=>acs.build(candidate,split));}
 assert.equal(f.model.onu.services.length,1);
});
test('separate manual management then TR069 actions never duplicate a service or rewrite IP Hosts',()=>{
 const f=fixture(),snapshot=state(f),native=acs.build(snapshot.state,{enabled:false,managementEnabled:true,acsUrl:''},'management');response(acs.writeCommands({device:f.device,...snapshot,native}),f.model);
 assert(!f.model.trLines.some(x=>x.startsWith('tr069-mgmt ')));const next=state(f),hosts=structuredClone(next.state.hosts),split={...config,managementEnabled:false},acsPlan=acs.build(next.state,split),spec={device:f.device,...next,native:acsPlan};assert.equal(acsPlan.managementWrites.length,1);assert(acsPlan.managementWrites[0].startsWith('tr069-mgmt '));
 const result=acs.verifyResult(response(acs.writeCommands(spec),f.model),spec);assert(result.configured);assert.deepEqual(state(f).state.hosts,hosts);assert.equal(f.model.onu.services.length,2);assert.equal(f.model.trLines.filter(x=>x.startsWith('tr069-mgmt ')).length,1);
});
test('existing ONU without registration history receives a free GEM/service and management only',()=>{
 const f=fixture(),snapshot=state(f),before=structuredClone(f.model.onu),native=acs.build(snapshot.state,config),spec={phase:'acs-onu',device:f.device,...snapshot,native};
 assert.equal(reg.jobs(f.device).length,0);assert.deepEqual(native.allocation,{gemId:2,servicePortId:2,tcontId:1,downstreamProfile:'default'});
 const raw=response(acs.writeCommands(spec),f.model),result=acs.verifyResult(raw,spec);assert(result.configured);assert.equal(result.acsVerified,false);assert.equal(result.dhcpAddress,null);assert.deepEqual(f.model.onu.tcont,before.tcont);assert.deepEqual(f.model.onu.services[0],before.services[0]);assert.deepEqual(f.model.onu.gems[0],before.gems[0]);
 const next=state(f);assert.deepEqual(acs.build(next.state,config).interfaceAdd,[]);assert.deepEqual(acs.build(next.state,config).managementAdd,[]);
 assert(!acs.writeCommands(spec).some(line=>/^no |^onu |^tcont |^vlan 100|^reboot|^shutdown|^vlan port|^profile /.test(line)));
});
test('existing VLAN100 is reused without extra GEM or service, and foreign ACS/translation/duplicates are held',()=>{
 const f=fixture(),first=state(f),native=acs.build(first.state,config);response(acs.writeCommands({device:f.device,...first,native}),f.model);const current=state(f);
 assert.equal(acs.build(current.state,config).reusesService,true);
 for(const change of[s=>s.management.push('tr069-mgmt 2 state unlock tag pri 0 vlan 100 acs http://192.0.2.99/'),s=>s.unit.services.push({...s.unit.services[1],id:3}),s=>s.unit.services[1].userVlan=101]){const copy=structuredClone(current.state);change(copy);assert.throws(()=>acs.build(copy,config));}
});
test('manual ACS URL change is explicit, previews the existing WAN and retains the service path',()=>{
 const f=fixture(),first=state(f),initial=acs.build(first.state,config);response(acs.writeCommands({device:f.device,...first,native:initial}),f.model);const before=state(f),custom={enabled:true,acsUrl:'http://192.0.2.12:7547/'};
 assert.throws(()=>acs.build(before.state,custom),/berbeda/);const native=acs.build(before.state,custom,'enable',true),spec={device:f.device,...before,native};assert.equal(native.managementReplace.length,1);assert.equal(native.interfaceAdd.length,0);assert(native.managementReplace[0].before.includes(config.acsUrl));assert(native.managementReplace[0].after.includes(custom.acsUrl));assert(acs.verifyResult(response(acs.writeCommands(spec),f.model),spec).configured);
});
test('full ONU-type slots, occupied host, orphan OMCI mapping and multiple T-CONT are held without mutations',()=>{
 const f=fixture(),initial=state(f).state;
 for(const change of[s=>s.unit.limits.gem=1,s=>s.hosts[0].ip='192.0.2.4',s=>s.management.push('service LEGACY gemport 2 vlan 100'),s=>s.unit.tcont.push({id:2,profile:'other'})]){const copy=structuredClone(initial);change(copy);assert.throws(()=>acs.build(copy,config));}assert.equal(f.model.onu.services.length,1);assert.equal(f.model.trLines.length,0);
});
test('native session checks serial/config before first write and reads back original Internet service',async()=>{
 const f=fixture(),snapshot=state(f),native=acs.build(snapshot.state,config),spec={phase:'acs-onu',device:f.device,...snapshot,native},[,context,transport]=await vendors.loadLibrary();
 const run=()=>context.withContext(f.data,f.device,()=>{context.authorizeRegistrationOperation(spec);context.current().registrationGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(f.device),password:'unit',commands:reg.phaseCommands(spec),timeoutMs:3000},({ready})=>{const stream=new PassThrough();stream.write=chunk=>{const text=reply(String(chunk).trim(),f.model);queueMicrotask(()=>stream.emit('data',text));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{registrationActionAllowed:true});
 let result=await run();assert(result.success,result.error);assert(result.verified);assert(result.submitted);
 const g=fixture();Object.assign(f.model,g.model);f.model.onu.serialNumber='ZTEG11223344';result=await run();assert(!result.success);assert.equal(result.submitted,false);assert.equal(f.model.onu.services.length,1);
});
test('readback rejects a changed or deleted Internet GEM and unchanged non-target hosts are required',()=>{
 const f=fixture(),snapshot=state(f),native=acs.build(snapshot.state,config),spec={device:f.device,...snapshot,native};response(acs.writeCommands(spec),f.model);f.model.onu.gems[0].downstream='other';assert.throws(()=>acs.verifyResult(response(tr.commands(snapshot.value),f.model),spec));
});
test('prepare/apply binds actor, permission, URL, confirmation and single-use token; no uncertain replay',async()=>{
 const f=fixture(),sent=[];const options={explicitDevAccess:true,transportOptions:{transports:{commands:async({commands})=>{sent.push(...commands);return response(commands,f.model);}}}};
 const prepared=await acs.prepare(f.data,f.device,f.actor,{address:f.model.onu.address,serialNumber:f.model.onu.serialNumber},options);assert(prepared.token);assert(!sent.includes('configure terminal'));
 const input={token:prepared.token,revision:prepared.revision,confirmId:f.device.id,confirmTarget:f.model.onu.serialNumber,confirmImpact:true};let before=0,after=0;
 await assert.rejects(acs.execute(f.data,f.device,f.actor,{...input,confirmImpact:false},options));assert.equal(before,0);
 const output=await acs.execute(f.data,f.device,f.actor,input,{...options,beforeSend:async()=>before++,afterSend:async()=>after++});assert(output.verified);assert.equal(before,1);assert.equal(after,1);await assert.rejects(acs.execute(f.data,f.device,f.actor,input,options),/sudah diproses/);
});
test('uncertain native delivery consumes the token and never retries automatically',async()=>{
 const f=fixture();let mutations=0;const options={transportOptions:{transports:{commands:async({commands})=>{if(commands.includes('configure terminal')){mutations++;return{success:false,submitted:true,outputs:[]};}return response(commands,f.model);}}}};
 const prepared=await acs.prepare(f.data,f.device,f.actor,{address:f.model.onu.address,serialNumber:f.model.onu.serialNumber},options),input={token:prepared.token,revision:prepared.revision,confirmId:f.device.id,confirmTarget:f.model.onu.serialNumber,confirmImpact:true},callbacks={beforeSend:async()=>{},afterSend:async()=>{}};
 const result=await acs.execute(f.data,f.device,f.actor,input,{...options,...callbacks});assert(result.uncertain);assert(!result.verified);assert.equal(mutations,1);await assert.rejects(acs.execute(f.data,f.device,f.actor,input,{...options,...callbacks}),/sudah diproses/);assert.equal(mutations,1);
});
test('changed URL, revoked permission and another actor cannot consume a prepared native action',async()=>{
 const f=fixture(),options={transportOptions:{transports:{commands:async({commands})=>response(commands,f.model)}}},prepared=await acs.prepare(f.data,f.device,f.actor,{address:f.model.onu.address,serialNumber:f.model.onu.serialNumber},options),input={token:prepared.token,revision:prepared.revision,confirmId:f.device.id,confirmTarget:f.model.onu.serialNumber,confirmImpact:true};
 await assert.rejects(acs.execute(f.data,f.device,{...f.actor,id:'other'},input,options));const role=f.actor.role;f.actor.role='collector';await assert.rejects(acs.execute(f.data,f.device,f.actor,input,options));f.actor.role=role;
 f.device.onuAcs={...config,acsUrl:'http://192.0.2.11:7547/'};const snapshot=state(f);assert.throws(()=>acs.authorize({device:f.device,...snapshot,native:acs.build(snapshot.state,config)}),/URL ACS/);assert.equal(f.model.onu.services.length,1);
});
test('central ACS defaults reach native registration planning without a per-PON TR069 URL',async()=>{
 const f=base.fixture(),options={transportOptions:{transports:{commands:async({commands})=>base.response(commands,f.model)}}};
 await pnp.read(f.data,f.device,f.actor,base.key,options);pnp.savePreset(f.data,f.device,f.actor,{ponKey:base.key,vlanMode:'selected',vlans:[101,102],bandwidthMode:'auto60',onuType:'',requestedEnabled:true,presetRevision:''});
 const before=structuredClone(f.device.onuPnpPresets);f.device.onuAcs=config;const saved=pnp.presets(f.device)[base.key];assert.deepEqual(saved.vlans,[100,101,102]);assert.deepEqual(saved.tr069,config);assert.deepEqual(f.device.onuPnpPresets,before);
});
test('explicit inherited Enable uses the active OLT URL; custom or disabled OLT defaults cannot masquerade as inherited',async()=>{
 const f=fixture(),options={transportOptions:{transports:{commands:async({commands})=>response(commands,f.model)}}},input={address:f.model.onu.address,serialNumber:f.model.onu.serialNumber,operation:'enable',policyMode:'inherit',acsUrl:config.acsUrl};
 const plan=await acs.prepare(f.data,f.device,f.actor,input,options);assert.equal(plan.value.policyMode,'inherit');assert.equal(plan.value.acsUrl,config.acsUrl);
 await assert.rejects(acs.prepare(f.data,f.device,f.actor,{...input,acsUrl:'http://192.0.2.99:7547/'},options),/Mengikuti OLT/);f.device.onuAcs={...config,enabled:false};await assert.rejects(acs.prepare(f.data,f.device,f.actor,input,options),/Mengikuti OLT/);
});
test('legacy Internet IP Host 1 and VEIP stay intact while ACS uses an empty reported IP Host 2',()=>{
 const f=fixture();f.model.trLines=['flow mode 1 tag-filter vlan-filter untag-filter discard','flow 1 pri 0 vlan 101','switchport-bind switch_0/1 iphost 1','switchport-bind switch_0/1 veip 1','vlan-filter-mode iphost 1 tag-filter vlan-filter untag-filter discard','vlan-filter iphost 1 pri 0 vlan 101'];
 const snapshot=state(f);snapshot.state.hosts[0].ip='172.16.50.99';const native=acs.build(snapshot.state,config);assert.equal(native.hostId,2);assert(native.managementAdd.includes('switchport-bind switch_0/1 iphost 2'));assert(native.managementAdd.includes('ip-host 2 dhcp-enable enable ping-response enable traceroute-response enable'));assert(!native.managementAdd.some(line=>/^no |^flow |\biphost 1\b|^ip-host 1\b|\bveip\b/.test(line)));
 const spec={device:f.device,...snapshot,native};response(acs.writeCommands(spec),f.model);const raw=response(tr.commands(snapshot.value),f.model),host=raw.outputs.find(row=>row.command.startsWith('show gpon remote-onu ip-host '));host.stdout=host.stdout.replace('Current IP address: 0.0.0.0','Current IP address: 172.16.50.99').replace(/(Host ID: 2[\s\S]*?DHCP enable: )disable/,'$1enable');assert(acs.verifyResult(raw,spec).configured);assert(f.model.trLines.includes('vlan-filter iphost 1 pri 0 vlan 101'));
});
test('extra host selection refuses occupied/unreported hosts, ambiguous VLAN100 and unknown switch topology',()=>{
 const f=fixture(),initial=state(f).state;initial.management.push('vlan-filter iphost 1 pri 0 vlan 101','switchport-bind switch_0/1 iphost 1','switchport-bind switch_0/1 veip 1');
 for(const change of[s=>s.hosts[1].dhcp='enable',s=>s.management.push('pppoe 2 nat enable'),s=>s.capabilities.ipHosts=1,s=>s.hosts=s.hosts.slice(0,1),s=>s.management.push('switchport-bind switch_0/2 veip 1'),s=>s.management.push('switchport-bind switch_0/1 ethuni eth_0/1'),s=>s.management.push('vlan-filter iphost 1 pri 0 vlan 100')]){const copy=structuredClone(initial);change(copy);assert.throws(()=>acs.build(copy,config));}
});
test('automatic ACS never allocates a third host or converts an existing PPPoE host to DHCP',()=>{
 const f=fixture(),before=state(f).state;before.capabilities.ipHosts=4;before.hosts.push({id:3,dhcp:'disable',ip:'0.0.0.0',configuredIp:'0.0.0.0'});before.management.push('vlan-filter iphost 1 pri 0 vlan 101','pppoe 2 nat enable user private password private');before.hosts[0].ip='192.0.2.3';assert.throws(()=>acs.build(before,config),/kosong/);
 const first=state(f),native=acs.build(first.state,config);response(acs.writeCommands({device:f.device,...first,native}),f.model);const existing=state(f).state;existing.management.push('pppoe 1 nat enable user private password private');assert.throws(()=>acs.build(existing,config),/PPPoE/);
});
test('Enable builds VLAN100, DHCP IP Host and ACS URL together; Disable only locks TR069 and Enable restores it',()=>{
 const f=fixture(),initial=state(f),native=acs.build(initial.state,config,'enable');assert(native.interfaceAdd.some(row=>row.includes('user-vlan 100 vlan 100')));assert(native.managementWrites.some(row=>row.startsWith('ip-host 1 dhcp-enable enable')));assert(native.managementWrites.some(row=>row.includes('acs '+config.acsUrl)));
 response(acs.writeCommands({device:f.device,...initial,native}),f.model);const internet=structuredClone(f.model.onu),hosts=state(f).state.hosts,enabled=state(f),off=acs.build(enabled.state,config,'disable');assert.deepEqual(off.interfaceAdd,[]);assert.deepEqual(off.managementWrites,['tr069-mgmt 1 state lock']);assert.equal(acs.publicState(enabled.state,f.device).tr069State,'enabled');
 const disabled=acs.verifyResult(response(acs.writeCommands({device:f.device,...enabled,native:off}),f.model),{...enabled,native:off});assert.equal(disabled.enabled,false);assert.deepEqual(f.model.onu,internet);assert.deepEqual(state(f).state.hosts,hosts);assert.equal(acs.publicState(state(f).state,f.device).tr069State,'disabled');
 const current=state(f),on=acs.build(current.state,config,'enable');assert.deepEqual(on.interfaceAdd,[]);assert.equal(on.managementReplace.length,1);assert.equal(on.managementWrites.length,1);const result=acs.verifyResult(response(acs.writeCommands({device:f.device,...current,native:on}),f.model),{...current,native:on});assert.equal(result.enabled,true);assert.deepEqual(f.model.onu,internet);
});
test('Disable refuses absent or foreign ACS and rejects a changed Internet service or DHCP host',()=>{
 const f=fixture(),initial=state(f);assert.throws(()=>acs.build(initial.state,config,'disable'));const native=acs.build(initial.state,config);response(acs.writeCommands({device:f.device,...initial,native}),f.model);const enabled=state(f),foreign=structuredClone(enabled.state);foreign.management=foreign.management.map(row=>row.replace(config.acsUrl,'http://192.0.2.99/'));assert.throws(()=>acs.build(foreign,config,'disable'));
 const off=acs.build(enabled.state,config,'disable'),spec={...enabled,native:off};response(acs.writeCommands(spec),f.model);f.model.onu.services[0].vlan=102;assert.throws(()=>acs.verifyResult(response(tr.commands(spec.value),f.model),spec));
});
test('read then Enable preview reuses bounded native proof and does not hit the ONU-read cooldown',async()=>{
 const f=fixture(),options={transportOptions:{transports:{commands:async({commands})=>response(commands,f.model)}}},input={address:f.model.onu.address,serialNumber:f.model.onu.serialNumber};
 const read=await acs.read(f.data,f.device,f.actor,input,options);assert.equal(read.tr069State,'absent');const prepared=await acs.prepare(f.data,f.device,f.actor,{...input,operation:'enable'},options);assert(prepared.token);assert.equal(prepared.value.operation,'enable');assert.equal(prepared.value.hostId,1);assert.equal(f.model.onu.services.length,1);
});
test('central Disable stops future automatic TR069 even for legacy enabled PON presets, without removing VLAN100',()=>{
 const input={vlanMode:'selected',vlans:[100,101],tr069:config},before=structuredClone(input),off=policy.preset({onuAcs:{...config,enabled:false}},input);assert.equal(off.tr069.enabled,false);assert.deepEqual(off.vlans,[100,101]);assert.deepEqual(input,before);assert.deepEqual(policy.preset({},input),input);
});
