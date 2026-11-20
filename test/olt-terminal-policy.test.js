'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const policy=require('../src/olt-terminal-policy'),terminal=require('../src/olt-terminal'),secrets=require('../src/secure-secrets'),olt=require('../src/olt-monitor'),store=require('../src/store'),removal=require('../src/olt-device-removal');
process.env.MIGRATION_MODE='0';process.env.REDIS_CACHE='0';
for(const[vendor,command,location,ponKey,id]of[
 ['cdata','ont delete 13 4',{frame:0,slot:1},'0/1/13',4],
 ['zte','no onu 2',{frame:1,slot:1,pon:13,ponKey:'1/1/13'},'1/1/13',2],
 ['hioso','delete onu 3',{frame:0,slot:1,pon:2,ponKey:'0/1/2'},'0/1/2',3],
 ['zte','no interface gpon-onu_1/1/13:2',null,'1/1/13',2],
 ['zte','  NO   ONU  2  ',{ponKey:'1/1/13'},'1/1/13',2]
])test(vendor+' deletion '+command+' becomes one structured target, never a raw device command',()=>{
 const result=policy.classify({vendor},location,command);assert.equal(result.kind,'delete-onu');assert.equal(result.target.ponKey,ponKey);assert.equal(result.target.onuId,id);assert.equal(result.line,undefined);
});
for(const line of['no on 2','n onu 2','ont del 1 2','undo','delete onu all','no interface gpon-olt_1/1/13','no onu 1;no onu 2','show version | no onu 1','do no onu 1','macro apply remove-all','source startup','sh version','no onu 1\nwrite','no onu 1\x1b[A','onu 1 delete','config delete all','profile x delete all','no onu 0','no interface gpon-onu_99/1/1:1'])test('unsafe or ambiguous CLI form is rejected before transport: '+JSON.stringify(line),()=>{
 assert.throws(()=>policy.classify({vendor:'zte'},{ponKey:'1/1/13'},line));
});
test('deletion without a verified interface context is not inferred from the last ONU viewed in the browser',()=>{
 for(const line of['no onu 1','delete onu 1','ont delete 1 1'])assert.throws(()=>policy.classify({vendor:'zte'},null,line),/Posisi ONU belum pasti/);
 assert.deepEqual(policy.nextLocation({vendor:'cdata'},'interface gpon 0/1'),{frame:0,slot:1});assert.equal(policy.nextLocation({vendor:'zte'},'interface gpon-olt_1/1/13').ponKey,'1/1/13');assert.equal(policy.nextLocation({vendor:'hioso'},'interface epon 0/2').ponKey,'0/1/2');assert.equal(policy.nextLocation({vendor:'zte'},'interface gpon-onu_1/1/13:1'),null);
});
test('supported full configuration and read commands remain usable while deletion aliases cannot escape the parser',()=>{
 for(const line of['enable','configure terminal','config','system-view','interface gpon-olt_1/1/13','show gpon onu state','display current-configuration','do show version-running','terminal length 0','tcont 1 profile DEMO-UP','gemport 1 tcont 1','service-port 1 vport 1 user-vlan 101 vlan 101','onu 1 type UNIT sn HWTCAABBCCDD','description customer name','write memory'])assert.equal(policy.classify({vendor:'zte'},null,line).kind,'command');
});
test('exact ZTE no shutdown enables the verified PON context without granting a deletion bypass',()=>{
 const location=policy.nextLocation({vendor:'zte'},'interface gpon-olt_1/1/13');
 for(const line of['no shutdown','  NO   SHUTDOWN  '])assert.equal(policy.classify({vendor:'zte'},location,line).kind,'command');
 assert.equal(policy.classify({vendor:'zte'},location,'no onu 7').kind,'delete-onu');
 for(const line of['no shut','no shutdown 13','no shutdown all','no shutdown; no onu 7','no shutdown\nreboot','no interface gpon-olt_1/1/13'])assert.throws(()=>policy.classify({vendor:'zte'},location,line));
});
test('no shutdown is rejected outside a verified ZTE PON, including after interface navigation',()=>{
 for(const location of[null,{}, {frame:1,slot:1},{ponKey:'1/1/13:7'},{ponKey:'1/1/33'},{ponKey:'1/1/13',onuId:7}])assert.throws(()=>policy.classify({vendor:'zte'},location,'no shutdown'),/interface PON ZTE/);
 assert.throws(()=>policy.classify({vendor:'cdata'},{ponKey:'1/1/13'},'no shutdown'),/interface PON ZTE/);
});
test('terminal observes successful navigation before intercepting delete and never writes that deletion to the stream',async()=>{
 const data={settings:{}},device={id:'terminal-delete-unit',name:'Unit',vendor:'zte',enabled:true,cliEnabled:true,host:'192.0.2.90',cliPort:23,cliProtocol:'telnet',cliUsername:'unit',updatedAt:'revision'};device.cliPasswordEnc=secrets.encryptSecret(data,'unit-password');let callbacks,clock=100000;const writes=[],manager=terminal.createManager({now:()=>clock,open:async(_,handlers)=>{callbacks=handlers;handlers.ready(value=>writes.push(value),true);return()=>{};}});
 try{const session=await manager.start(data,device,'owner',{confirm:true,revision:device.updatedAt});callbacks.data('OLT#');manager.input('owner',device,session.id,{kind:'line',value:'interface gpon-olt_1/1/13'});assert.throws(()=>manager.input('owner',device,session.id,{kind:'line',value:'no onu 1'}));callbacks.data('interface gpon-olt_1/1/13\nOLT(config-if)#');clock+=200;
 const reply=manager.input('owner',device,session.id,{kind:'line',value:'no onu 1'});assert.equal(reply.action,'preview-delete-onu');assert.equal(reply.target.ponKey,'1/1/13');assert.deepEqual(writes,['interface gpon-olt_1/1/13\r\n']);clock+=200;
 manager.input('owner',device,session.id,{kind:'line',value:'exit'});callbacks.data('exit\nOLT(config)#');clock+=200;assert.throws(()=>manager.input('owner',device,session.id,{kind:'line',value:'no onu 1'}),/Posisi ONU belum pasti/);
 manager.input('owner',device,session.id,{kind:'line',value:'interface gpon-olt_1/1/12'});callbacks.data('Error: invalid interface\nOLT(config)#');clock+=200;assert.throws(()=>manager.input('owner',device,session.id,{kind:'line',value:'no onu 1'}));
 }finally{manager.shutdown();}
});
test('a fake password label in read output cannot bypass the deletion policy',async()=>{
 const data={settings:{}},device={id:'terminal-delete-password',name:'Unit',vendor:'zte',enabled:true,cliEnabled:true,host:'192.0.2.90',cliPort:23,cliProtocol:'telnet',cliUsername:'unit',updatedAt:'revision'};device.cliPasswordEnc=secrets.encryptSecret(data,'unit-password');let callbacks,clock=100000;const writes=[],manager=terminal.createManager({now:()=>clock,open:async(_,handlers)=>{callbacks=handlers;handlers.ready(value=>writes.push(value),true);return()=>{};}});
 try{const session=await manager.start(data,device,'owner',{confirm:true,revision:device.updatedAt});callbacks.data('OLT#');manager.input('owner',device,session.id,{kind:'line',value:'show running-config'});callbacks.data('Description: Password:');clock+=200;assert.throws(()=>manager.input('owner',device,session.id,{kind:'line',value:'no onu 1'}));assert.deepEqual(writes,['show running-config\r\n']);}finally{manager.shutdown();}
});
test('deletion target resolves exact PON/index/SN from a fresh snapshot, never an ONU ID from a different PON',async()=>{
 const data={settings:{}},device={id:'unit',name:'OLT Unit'},target={ponKey:'1/1/13',onuId:1},rows=[{id:'1/1/12:1',ponKey:'1/1/12',onuId:1,serialNumber:'HWTCAABBCC01'},{id:'1/1/13:1',ponKey:'1/1/13',onuId:1,serialNumber:'HWTCAABBCC02'}],snapshot={status:'online',checkedAt:new Date().toISOString(),onus:rows};
 const result=await terminal.deletionTarget(data,device,target,{snapshot:async()=>snapshot});assert.equal(result.id,'1/1/13:1');assert.equal(result.serialNumber,'HWTCAABBCC02');assert.equal(result.oltId,'unit');assert.equal(result.customerId,undefined);
 for(const extra of[{stale:true},{status:'unreachable'},{inventoryAvailable:false},{checkedAt:'invalid'},{checkedAt:new Date(Date.now()-olt.CACHE_MS*3).toISOString()},{onus:[rows[0]]},{onus:[...rows,rows[1]]},{onus:[{...rows[1],identityAmbiguous:true}]}])await assert.rejects(terminal.deletionTarget(data,device,target,{snapshot:async()=>({...snapshot,...extra})}));
});
for(const integration of[false,true])test('CLI-selected ONU uses the existing web preview with integration '+integration+' and never starts customer removal',async()=>{
 const data=store.createDefaultStore(),actor={id:'admin',role:'admin',active:true};data.users=[actor];data.settings.networkIntegrationEnabled=integration;data.settings.networkCustomerRemovalEnabled=true;data.settings.genieAcs={enabled:true,baseUrl:'http://192.0.2.90:7557'};const device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.30',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit'});data.oltDevices=[device];data.customers=[{id:'member',name:'Unit Customer'}];data.radiusUsers=[{id:'account',customerId:'member'}];data.invoices=[{id:'invoice'}];data.payments=[{id:'paid'}];const before=structuredClone(data),target={id:'4718593',serialNumber:'HWTCAABBCCDD',...olt.position('4718593')};let reads=0;
 const selected=await terminal.deletionTarget(data,device,{ponKey:target.ponKey,onuId:target.onuId},{snapshot:async()=>({status:'online',checkedAt:new Date().toISOString(),onus:[target]})});
 const preview=await removal.preview(data,device,selected.serialNumber,{onuIndex:selected.id},actor,{inspectOlt:async()=>({target,state:'offline'}),findAcs:async()=>{reads++;return[];},snapshot:async()=>null});assert.equal(preview.cascade,integration);assert.equal(preview.canSubmit,true);assert.equal(reads,integration?1:0);assert.deepEqual(data,before);
});
test('unverified ZTE deletion stays unavailable in the same web preview rather than bypassing its driver through raw CLI',async()=>{
 const data=store.createDefaultStore(),actor={id:'admin',role:'admin',active:true};data.users=[actor];const device=olt.validateDevice(data,{name:'Unit ZTE',vendor:'zte',host:'192.0.2.80',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit'});data.oltDevices=[device];const preview=await removal.preview(data,device,'HWTCAABBCCDD',{onuIndex:'1/1/13:1'},actor);assert.equal(preview.canSubmit,false);assert.equal(preview.olt.state,'unavailable');assert.equal(preview.token,'');
});
test('installer/update verify policy and browser handoff goes through the existing deletion form',()=>{
 for(const file of['install.sh','deploy/bin/fakenet-billing-update'])assert(require('./helpers/install-payload').payloadSource(file).includes('    src/olt-terminal-policy.js\n'));
 const ui=fs.readFileSync(path.join(__dirname,'../public/olt.js'),'utf8'),terminalUi=fs.readFileSync(path.join(__dirname,'../public/olt-terminal.js'),'utf8');assert(ui.includes('await deleteOnuForm(message.onu)'));assert(ui.includes('event.source!==popup'));assert(terminalUi.includes('await disconnect(true)'));assert(terminalUi.includes("value.action === 'preview-delete-onu'"));assert(terminalUi.includes("type: 'fakenet-olt-terminal-delete'"));
});
