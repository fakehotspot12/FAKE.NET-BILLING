'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const settings=require('../src/olt-zte-settings'),reg=require('../src/olt-zte-registration'),tr=require('../src/olt-zte-tr069'),vendors=require('../src/olt-vendors'),fns=require('./helpers/olt-settings-fixture');
const topology=state=>({kind:'services',tcont:structuredClone(state.unit.tcont),gems:structuredClone(state.unit.gems),services:structuredClone(state.unit.services)});
test('manual service channel adds a complete T-CONT/GEM/VLAN graph and preserves original Internet',()=>{
 const f=fns.fixture(),before=fns.snapshot(f),change=topology(before.state);change.tcont.push({id:2,profile:'UP120'});change.gems.push({id:2,tcont:2,downstream:'DOWN120'});change.services.push({id:2,gem:2,userVlan:102,vlan:102});
 const native=settings.build(before.state,before.catalogue,change),spec={...before,native};assert.deepEqual(native.impacts,[]);const commands=settings.writeCommands(spec);assert(commands.indexOf('tcont 2 profile UP120')<commands.indexOf('gemport 2 tcont 2'));assert(!commands.includes('no tcont 1'));const result=settings.verifyResult(fns.response(commands,f.model),spec);assert.equal(result.unit.services.length,2);assert.deepEqual(result.unit.services[0],before.state.unit.services[0]);
});
test('removal follows OMCI mapping, service-port, GEM, T-CONT dependency order',()=>{
 const f=fns.fixture(),before=fns.snapshot(f),change={kind:'services',tcont:[],gems:[],services:[]},native=settings.build(before.state,before.catalogue,change),spec={...before,native},commands=settings.writeCommands(spec);
 assert(commands.indexOf('no service internet')<commands.indexOf('no service-port 1'));assert(commands.indexOf('no service-port 1')<commands.indexOf('no gemport 1'));assert(commands.indexOf('no gemport 1')<commands.indexOf('no tcont 1'));assert.equal(settings.verifyResult(fns.response(commands,f.model),spec).unit.services.length,0);
});
test('shared T-CONT profile edit lists every dependent service without redefining a global profile',()=>{
 const f=fns.fixture();f.model.onu.gems.push({id:2,tcont:1,downstream:'DOWN60'});f.model.onu.services.push({id:2,gem:2,userVlan:102,vlan:102});f.model.management.push({name:'FBV102',gem:2,vlan:102});const before=fns.snapshot(f),change=topology(before.state);change.tcont[0].profile='UP120';const native=settings.build(before.state,before.catalogue,change),spec={...before,native};assert.equal(native.impacts.length,2);assert(!settings.writeCommands(spec).some(row=>/^profile |^no tcont /.test(row)));assert.equal(settings.verifyResult(fns.response(settings.writeCommands(spec),f.model),spec).unit.tcont[0].profile,'UP120');
});
test('invalid IDs, duplicate VLANs, missing parents, CLI input and unsupported reservations are held',()=>{
 const f=fns.fixture(),before=fns.snapshot(f);
 for(const edit of[c=>c.gems[0].tcont=8,c=>c.services.push({...c.services[0],id:2}),c=>c.tcont[0].profile='UP60;reboot',c=>c.tcont[0].profile='default',c=>c.services[0].vlan=4095,c=>c.services[0].userVlan=102]){const change=topology(before.state);edit(change);assert.throws(()=>settings.build(before.state,before.catalogue,change));}
});
test('native LAN, WiFi, IP Host or TR069 references prevent removing the VLAN channel',()=>{
 const f=fns.fixture();for(const line of['vlan port eth_0/1 mode tag vlan 101','vlan-filter iphost 1 pri 0 vlan 101','tr069-mgmt 1 state unlock tag pri 0 vlan 101 acs http://192.0.2.1/']){const before=fns.snapshot(f);before.state.management.push(line);assert.throws(()=>settings.build(before.state,before.catalogue,{kind:'services',tcont:[],gems:[],services:[]}),/masih dipakai/);}
});
test('IP Host cards use reported native indexes and include address details',()=>{
 const f=fns.fixture();f.model.extra.push('ip-host 3 dhcp-enable enable ping-response enable traceroute-response enable','vlan-filter iphost 3 pri 0 vlan 101');const before=fns.snapshot(f),rows=settings.hostView(before.state);assert.equal(rows.length,4);assert.equal(rows[2].id,3);assert.equal(rows[2].mode,'dhcp');assert.equal(rows[2].gateway,'192.0.2.1');assert.equal(rows.filter(row=>row.configured).length,1);
});
test('only two reported native hosts are manageable; existing higher indexes remain read-only',()=>{
 const f=fns.fixture(),before=fns.snapshot(f),rows=settings.hostView(before.state);assert.deepEqual(rows.filter(row=>row.managed).map(row=>row.id),[1,2]);assert(rows.filter(row=>row.id>2).every(row=>!row.editable));
 for(const operation of['save','remove'])assert.throws(()=>settings.build(before.state,before.catalogue,{kind:'iphost',id:3,operation,mode:'dhcp',priority:0,vlan:101}),/maksimal dua/);
});
test('PPP password never enters public snapshots; a blank password preserves the native account during NAT edits',()=>{
 const f=fns.fixture();f.model.extra.push('switchport-bind switch_0/1 iphost 1','pppoe 1 nat enable user member@test password native-private','vlan-filter iphost 1 pri 0 vlan 101');const before=fns.snapshot(f),view=settings.publicState(before.state,f.device,before.catalogue);assert(!JSON.stringify(view).includes('native-private'));assert(view.hosts[0].pppPasswordConfigured);assert(view.hosts[0].editable);
 const native=settings.build(before.state,before.catalogue,{kind:'iphost',operation:'save',id:1,mode:'pppoe',priority:0,vlan:101,pppUsername:'member@test',pppPassword:'',natEnabled:false}),spec={...before,native};assert(native.managementWrites.includes('pppoe 1 nat disable'));assert(!native.managementWrites.some(line=>line.includes('native-private')||line.startsWith('no pppoe')));const actual=settings.verifyResult(fns.response(settings.writeCommands(spec),f.model),spec);assert.equal(tr.pppoeConfig(actual.management,1).password,'native-private');assert.equal(tr.pppoeConfig(actual.management,1).nat,'disable');
});
test('PPP-to-DHCP and explicit PPP removal preserve other hosts and services',()=>{
 for(const operation of['save','remove']){const f=fns.fixture();f.model.extra.push('pppoe 1 nat enable user member@test password private','vlan-filter iphost 1 pri 0 vlan 101');const before=fns.snapshot(f),native=settings.build(before.state,before.catalogue,{kind:'iphost',id:1,operation,mode:'dhcp',priority:0,vlan:101}),spec={...before,native};assert(native.managementWrites.includes('no pppoe 1'));const actual=settings.verifyResult(fns.response(settings.writeCommands(spec),f.model),spec);assert.equal(tr.pppoeConfig(actual.management,1),null);assert.deepEqual(actual.unit,before.state.unit);}
});
test('PPP fields reject command injection, overlong credentials and changing an account without a new password',()=>{
 const f=fns.fixture(),before=fns.snapshot(f),base={kind:'iphost',id:1,operation:'save',mode:'pppoe',priority:0,vlan:101,pppUsername:'member@test',pppPassword:'private',natEnabled:true};
 for(const update of[{pppUsername:'u;reboot'},{pppPassword:'x\nend'},{pppPassword:'x'.repeat(26)},{pppPassword:''},{natEnabled:'true'},{pppPassword:'help?'}])assert.throws(()=>settings.build(before.state,before.catalogue,{...base,...update}));
});
test('PPP split readback is normalized and command echoes containing error-like credentials are not failures',()=>{
 const parts=['service FBV101 gemport 1 vlan 101','pppoe 1 nat enable','pppoe 1 auth auto','pppoe 1 connect always','pppoe 1 user failure password error'];const normalized=tr.normalizePppoe(parts);assert.equal(normalized.filter(line=>line.startsWith('pppoe ')).length,1);assert.equal(tr.pppoeConfig(normalized,1).password,'error');assert.equal(tr.pppoeConfig(normalized,1).username,'failure');
 const command='pppoe 1 nat enable user failure password error',grant={commands:['configure terminal','pon-onu-mng gpon-onu_1/1/13:1',command,'end','show readback'],mutationEnd:3,value:{address:'1/1/13:1'}};
 settings.verifyStep([{command,stdout:command+'\nOLT(gpon-onu-mng 1/1/13:1)#'}],grant,2,'OLT(gpon-onu-mng 1/1/13:1)#');assert.throws(()=>settings.verifyStep([{command,stdout:command+'\n%Code 123 Error rejected'}],grant,2,'OLT(gpon-onu-mng 1/1/13:1)#'),/menolak/);
});
test('VLAN100 already bound to another host cannot be duplicated by a manual host addition',()=>{
 const f=fns.fixture();f.model.onu.services[0].vlan=f.model.onu.services[0].userVlan=100;f.model.management[0].vlan=100;f.model.extra.push('ip-host 1 dhcp-enable enable ping-response enable traceroute-response enable','vlan-filter iphost 1 pri 0 vlan 100');const before=fns.snapshot(f);assert.throws(()=>settings.build(before.state,before.catalogue,{kind:'iphost',id:2,operation:'save',mode:'dhcp',priority:0,vlan:100}),/duplikat/);
});
test('DHCP add and PPPoE edit preserve the Internet channel and other hosts',()=>{
 const f=fns.fixture();let before=fns.snapshot(f),native=settings.build(before.state,before.catalogue,{kind:'iphost',operation:'save',id:2,mode:'dhcp',priority:0,vlan:101}),spec={...before,native};let actual=settings.verifyResult(fns.response(settings.writeCommands(spec),f.model),spec);assert.equal(actual.hosts[1].dhcp,'enable');
 before=fns.snapshot(f);native=settings.build(before.state,before.catalogue,{kind:'iphost',operation:'save',id:2,mode:'pppoe',priority:0,vlan:101,pppUsername:'member@test',pppPassword:'test-secret',natEnabled:true});spec={...before,native};actual=settings.verifyResult(fns.response(settings.writeCommands(spec),f.model),spec);assert.equal(tr.pppoeConfig(actual.management,2).username,'member@test');assert.equal(actual.hosts[1].dhcp,'disable');assert.deepEqual(actual.unit,before.state.unit);
});
test('both managed hosts retain Static support and safely switch between all three modes',()=>{
 const f=fns.fixture();
 for(const fields of[{mode:'dhcp'},{mode:'static',ip:'192.0.2.12',mask:'255.255.255.0',gateway:'192.0.2.1',dns1:'192.0.2.53',dns2:'192.0.2.54'},{mode:'pppoe',pppUsername:'member@test',pppPassword:'private',natEnabled:true},{mode:'static',ip:'192.0.2.13',mask:'255.255.255.0',gateway:'192.0.2.1',dns1:'192.0.2.53',dns2:''},{mode:'dhcp'}]){
  const before=fns.snapshot(f),native=settings.build(before.state,before.catalogue,{kind:'iphost',id:2,operation:'save',priority:0,vlan:101,...fields}),spec={...before,native};const actual=settings.verifyResult(fns.response(settings.writeCommands(spec),f.model),spec);assert.deepEqual(actual.unit,before.state.unit);if(fields.mode==='static'){assert.equal(actual.hosts[1].configuredIp,fields.ip);assert.equal(tr.pppoeConfig(actual.management,2),null);}else if(fields.mode==='dhcp'){assert.equal(actual.hosts[1].configuredIp,'0.0.0.0');assert.equal(actual.hosts[1].dhcp,'enable');}
 }
 assert.deepEqual(settings.publicState(fns.snapshot(f).state,f.device,f.model.catalogue).capabilities.ipHostModes,['dhcp','static','pppoe']);
});
test('IP Host remove clears its policy while retaining Internet service and switch topology',()=>{
 const f=fns.fixture();f.model.extra.push('switchport-bind switch_0/1 iphost 2','ip-host 2 dhcp-enable enable ping-response enable traceroute-response enable','vlan-filter-mode iphost 2 tag-filter vlan-filter untag-filter discard','vlan-filter iphost 2 pri 0 vlan 101');const before=fns.snapshot(f),native=settings.build(before.state,before.catalogue,{kind:'iphost',operation:'remove',id:2}),spec={...before,native};const actual=settings.verifyResult(fns.response(settings.writeCommands(spec),f.model),spec);assert(actual.management.includes('switchport-bind switch_0/1 iphost 2'));assert(!settings.hostView(actual)[1].configured);assert.deepEqual(actual.unit,before.state.unit);
});
test('ACS-bound and PPPoE hosts cannot be overwritten or removed in the generic editor',()=>{
 const f=fns.fixture();for(const lines of[['vlan-filter iphost 1 pri 0 vlan 100','tr069-mgmt 1 state lock tag pri 0 vlan 100 acs http://192.0.2.10/'],['pppoe 1 nat enable user private password private']]){const before=fns.snapshot(f);before.state.management.push(...lines);assert.throws(()=>settings.build(before.state,before.catalogue,{kind:'iphost',operation:'remove',id:1}));}
});
test('empty-looking hosts referenced by advanced WAN/profile configuration remain protected',()=>{
 const f=fns.fixture();for(const line of['ip-profile 2 profile-existing','wan-ip 2 mode static','service voice type voip iphost 2 gemport 1 vlan 101']){const before=fns.snapshot(f);before.state.management.push(line);const row=settings.hostView(before.state).find(row=>row.id===2);assert(row.configured);assert.equal(row.editable,false);assert.throws(()=>settings.build(before.state,before.catalogue,{kind:'iphost',operation:'save',id:2,mode:'dhcp',priority:0,vlan:101}),/lanjutan/);}
});
test('unknown flow topology and advanced OMCI GEM references never receive a generic rewrite',()=>{
 const f=fns.fixture(),before=fns.snapshot(f);before.state.management.push('flow 1 priority 0 vlan 101');assert.throws(()=>settings.build(before.state,before.catalogue,{kind:'iphost',operation:'save',id:2,mode:'dhcp',priority:0,vlan:101}),/Topologi/);const change=topology(before.state);change.gems[0].downstream='DOWN120';before.state.management.push('gemport 1 flow 1');assert.throws(()=>settings.build(before.state,before.catalogue,change),/OMCI lanjutan/);
});
test('static input rejects malformed IP/mask, absent services, unsupported PPPoE and out-of-range host',()=>{
 const f=fns.fixture(),before=fns.snapshot(f),change={kind:'iphost',operation:'save',id:1,mode:'static',priority:0,vlan:101,ip:'192.0.2.12',mask:'255.255.255.0'};
 for(const edit of[c=>c.ip='192.0.2.1;reboot',c=>c.mask='255.0.255.0',c=>c.vlan=100,c=>c.id=5,c=>c.mode='pppoe']){const value={...change};edit(value);assert.throws(()=>settings.build(before.state,before.catalogue,value));}
});
test('transport rechecks the full native identity before the first command and validates readback',async()=>{
 const f=fns.fixture(),before=fns.snapshot(f),change=topology(before.state);change.tcont[0].profile='UP120';const native=settings.build(before.state,before.catalogue,change),spec={phase:'settings-onu',device:f.device,...before,native},[,context,transport]=await vendors.loadLibrary();
 const run=()=>context.withContext(f.data,f.device,()=>{context.authorizeRegistrationOperation(spec);context.current().registrationGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(f.device),password:'unit',commands:reg.phaseCommands(spec),timeoutMs:3000},({ready})=>{const stream=new PassThrough();stream.write=chunk=>{const result=fns.reply(String(chunk).trim(),f.model);queueMicrotask(()=>stream.emit('data',result));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{registrationActionAllowed:true});
 let result=await run();assert(result.success,result.error);assert(result.verified);f.model.onu.serialNumber='ZTEG11223344';result=await run();assert(!result.success);assert.equal(result.submitted,false);
});
test('preview and Apply bind permission, SN, actor, revision, confirmation and one-shot delivery',async()=>{
 const f=fns.fixture(),sent=[],options={transportOptions:{transports:{commands:async({commands})=>{sent.push(...commands);return fns.response(commands,f.model);}}}};const input={address:f.model.onu.address,serialNumber:f.model.onu.serialNumber,type:f.model.onu.type,change:{kind:'iphost',operation:'save',id:2,mode:'dhcp',priority:0,vlan:101}};
 const plan=await settings.prepare(f.data,f.device,f.actor,input,options);assert(!sent.includes('configure terminal'));const apply={token:plan.token,revision:plan.revision,confirmId:f.device.id,confirmTarget:input.serialNumber,confirmImpact:true};await assert.rejects(settings.execute(f.data,f.device,{...f.actor,id:'other'},apply,options));await assert.rejects(settings.execute(f.data,f.device,f.actor,{...apply,confirmImpact:false},options));let before=0,after=0;const result=await settings.execute(f.data,f.device,f.actor,apply,{...options,beforeSend:async()=>before++,afterSend:async()=>after++});assert(result.verified);assert.equal(before,1);assert.equal(after,1);await assert.rejects(settings.execute(f.data,f.device,f.actor,apply,options),/sudah diproses/);
});
test('uncertain delivery is never replayed with the same token',async()=>{
 const f=fns.fixture();let writes=0;const options={transportOptions:{transports:{commands:async({commands})=>{if(commands.includes('configure terminal')){writes++;return{success:false,submitted:true};}return fns.response(commands,f.model);}}}},before=fns.snapshot(f),change=topology(before.state);change.tcont[0].profile='UP120';const plan=await settings.prepare(f.data,f.device,f.actor,{...before.value,change},options),input={token:plan.token,revision:plan.revision,confirmId:f.device.id,confirmTarget:before.value.serialNumber,confirmImpact:true},callbacks={beforeSend:async()=>{},afterSend:async()=>{}};const result=await settings.execute(f.data,f.device,f.actor,input,{...options,...callbacks});assert(result.uncertain);await assert.rejects(settings.execute(f.data,f.device,f.actor,input,{...options,...callbacks}));assert.equal(writes,1);
});

test('legacy config state and advanced services retain IP Host views while strict writes stay held',()=>{
 const view=require('../src/olt-zte-view'),f=fns.fixture(),value=fns.snapshot(f).value,raw=fns.response(tr.commands(value),f.model);
 const detail=raw.outputs.find(row=>row.command.startsWith('show gpon onu detail-info '));detail.stdout=detail.stdout.replace(/Config state\s*:\s*success/i,'Config state: failed');
 const iface=raw.outputs.find(row=>row.command.startsWith('show running-config interface '));iface.stdout=iface.stdout.replace('user-vlan 101 vlan 101','user-vlan 101 vlan 101 svlan 999');
 const state=view.parse(raw,value),publicView=settings.publicState(state,f.device);assert.equal(state.writeVerified,false);assert.equal(publicView.readOnly,true);assert.equal(publicView.hosts.length,4);assert.equal(publicView.unit.services[0].vlan,101);assert(publicView.hosts.every(row=>!row.editable));assert.throws(()=>tr.inspect(raw,value));
});
test('missing or malformed OMCI hosts do not blank existing services; wrong identity still rejects',()=>{
 const view=require('../src/olt-zte-view'),f=fns.fixture(),value=fns.snapshot(f).value;
 for(const stdout of['%Code 64040 No relate information','Host ID: 1\nHost ID: 1\n']){const raw=fns.response(tr.commands(value),f.model);raw.outputs.find(row=>row.command.startsWith('show gpon remote-onu ip-host ')).stdout=stdout;const state=view.parse(raw,value);assert.equal(state.hosts.length,0);assert.equal(state.unit.services.length,1);assert.equal(state.writeVerified,false);}
 const raw=fns.response(tr.commands(value),f.model);assert.throws(()=>view.parse(raw,{...value,serialNumber:'HWTC11223344'}),/SN|posisi/);
});
test('Huawei IP copied from Internet VLAN101 is never presented as DHCP VLAN100',()=>{
 const view=require('../src/olt-zte-view'),state={hosts:[{id:1,dhcp:'enable',ip:'172.16.50.48'},{id:2,dhcp:'disable',ip:'172.16.50.48'}],management:['vlan-filter iphost 1 pri 0 vlan 100']},wan={vlan:101,mode:'pppoe',ip:'172.16.50.48',fresh:true,checkedAt:new Date().toISOString()};
 let rows=view.correlate(state,[wan]);assert.equal(rows[0].displayIp,null);assert.equal(rows[0].ipSource,'different-wan');assert.equal(rows[0].reportedIp,wan.ip);assert.equal(rows[1].displayIp,wan.ip);
 rows=view.correlate(state,[{...wan,vlan:100,ip:'172.16.22.35'}]);assert.equal(rows[0].displayIp,'172.16.22.35');assert.equal(rows[0].ipSource,'acs-wan');
 rows=view.correlate({...state,hosts:[{id:1,dhcp:'enable',ip:'0.0.0.0'}]},[{...wan,vlan:100,fresh:false}]);assert.equal(rows[0].displayIp,null);
});
test('read views coalesce and force refresh without profile cooldown or any native writes',async()=>{
 const f=fns.fixture(),sent=[],input={address:f.model.onu.address,serialNumber:f.model.onu.serialNumber,section:'hosts'},options={transportOptions:{transports:{commands:async({commands})=>{sent.push(commands);await new Promise(resolve=>setTimeout(resolve,5));return fns.response(commands,f.model);}}}};
 f.data.settings.genieAcs={enabled:false};const rows=await Promise.all([settings.read(f.data,f.device,f.actor,input,options),settings.read(f.data,f.device,f.actor,input,options)]);assert.equal(rows[0].hosts.length,4);assert.deepEqual(rows[0],rows[1]);assert.equal(sent.length,2);
 await settings.read(f.data,f.device,f.actor,{...input,force:true},options);assert.equal(sent.length,3);assert(sent.flat().every(command=>!['configure terminal','reboot'].includes(command)));
});
test('read operations wait behind the current operation while another write remains rejected',async()=>{
 const f=fns.fixture();let release,entered;const enteredPromise=new Promise(resolve=>entered=resolve),blocked=new Promise(resolve=>release=resolve),order=[];
 const write=reg.managementOperation(f.data,f.device,f.actor,async()=>{order.push('write');entered();await blocked;order.push('done');},{invalidate:false});await enteredPromise;
 const read=reg.managementOperation(f.data,f.device,f.actor,async()=>order.push('read'),{invalidate:false,readOnly:true});await assert.rejects(reg.managementOperation(f.data,f.device,f.actor,async()=>{}),/Tunggu/);release();await Promise.all([write,read]);assert.deepEqual(order,['write','done','read']);
});
test('ACS WAN addresses require exact unique SN and fresh connected IP values and exclude secrets',async t=>{
 const genie=require('../src/genieacs'),now=new Date().toISOString(),leaf=value=>({_value:value}),sn='HWTC11223344';let rows=[];const requests=[];
 const device={_id:'onu',_deviceId:{_SerialNumber:sn,_Manufacturer:'Huawei'},_lastInform:now,InternetGatewayDevice:{DeviceInfo:{Manufacturer:leaf('Huawei')},WANDevice:{1:{WANConnectionDevice:{1:{WANPPPConnection:{1:{Name:leaf('1_TR069_INTERNET_R_VID_101'),ConnectionStatus:leaf('Connected'),ExternalIPAddress:{_value:'172.16.50.48',_timestamp:now},Username:leaf('private-account'),Password:leaf('private-password'),'X_HW_VLAN':leaf(101)}}}}}}}};
 rows=[device];t.mock.method(globalThis,'fetch',async url=>{requests.push({method:'GET',url:String(url)});return new Response(JSON.stringify(rows),{headers:{'content-type':'application/json'}});});
 const cfg={enabled:true,baseUrl:'http://acs-read-fixture.invalid:7557'};let result=await genie.onuWanAddresses(cfg,sn);assert.equal(result.length,1);assert.equal(result[0].vlan,101);assert.equal(result[0].fresh,true);assert.equal(result[0].mode,'pppoe');assert(!JSON.stringify(result).includes('private-'));const connection=device.InternetGatewayDevice.WANDevice[1].WANConnectionDevice[1].WANPPPConnection[1];connection.ConnectionStatus._value='Disconnected';assert.equal((await genie.onuWanAddresses(cfg,sn))[0].fresh,false);connection.ConnectionStatus._value='Connected';device._lastInform='2020-01-01T00:00:00Z';result=await genie.onuWanAddresses(cfg,sn);assert.equal(result[0].fresh,false);device._deviceId._SerialNumber='HWTC55667788';assert.deepEqual(await genie.onuWanAddresses(cfg,sn),[]);rows=[device,device];assert.deepEqual(await genie.onuWanAddresses(cfg,sn),[]);assert(requests.every(row=>row.method==='GET'));assert(requests.every(row=>new URL(row.url).pathname==='/devices/'));
});

test('native service-port table recovers the VLAN path when running-config omits it without authorizing writes',()=>{
 const view=require('../src/olt-zte-view'),f=fns.fixture(),value=fns.snapshot(f).value,iface='gpon-onu_'+value.address,raw=fns.response(tr.commands(value),f.model);
 raw.outputs.find(row=>row.command==='show running-config interface '+iface).stdout=raw.outputs.find(row=>row.command==='show running-config interface '+iface).stdout.replace(/.*service-port.*\n/g,'');
 const table=`Interface ${iface}\nSport Vport BeginVid EndVid OuterVid InnerVid UserPrio Etype Vlan Cos SVlan SCo\ns Tls TlsSVid Mode PacketFilter Ingress Egress Queue Status Enable\n1 1 101 101 -- -- -- -- 101 -- -- --\n -- -- 1:1 -- -- -- -- OK YES\nSport total number:\n1\nOLT#`;
 raw.outputs.push({command:'show service-port interface '+iface,stdout:table});const state=view.parse(raw,value);assert.deepEqual(state.unit.services,[{id:1,gem:1,userVlan:101,vlan:101}]);assert.equal(state.writeVerified,false);assert.equal(settings.publicState(state,f.device).readOnly,true);assert.equal(view.serviceRows(table.replace('Sport total number:\n1','Sport total number:\n2'),value),null);assert.equal(view.serviceRows(table,{...value,address:'1/1/1:2'}),null);
});
