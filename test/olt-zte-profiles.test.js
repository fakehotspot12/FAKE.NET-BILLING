'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const profiles=require('../src/olt-zte-profiles'),vendors=require('../src/olt-vendors'),secrets=require('../src/secure-secrets');
const output=(command,stdout)=>({command,stdout});
function catalogue(){return{success:true,outputs:[output('enable','OLT#'),output('show version-running','1/1/1 GTGHG MVR V2.1.0 time 123\n1/1/3 SMXA MVR V2.1.0 time 456\n'),output('show gpon profile tcont','Profile name :default\n Type FBW(kbps) ABW(kbps) MBW(kbps) PRIORITY\n 1 10000 0 0 N/A\nProfile name :existing-60-up\n Type FBW(kbps) ABW(kbps) MBW(kbps) PRIORITY\n 5 64 64 62976 N/A\n'),output('show gpon profile traffic','Profile name :default\n SIR(kbps) PIR(kbps) CBS(kbytes) PBS(kbytes)\n 9953280 9953280 default default\nProfile name :existing-60-down\n SIR(kbps) PIR(kbps) CBS(kbytes) PBS(kbytes)\n 62976 62976 default default\n'),output('show gpon onu profile vlan','Profile name: vlan101\nTag mode: tag\nCVLAN: 101\nCVLAN priority:0\n'),output('show vlan summary','All created vlan num: 5\nDetails are following:\n 1,100-102,1101\nOLT#')]};}
function onu(){const iface='gpon-onu_1/1/1:1';return{success:true,outputs:[output('show gpon onu detail-info '+iface,'ONU interface: '+iface+'\n Type: UNIT-2G\n Phase state: working\n Config state: fail\n Serial number: HWTCAABBCCDD\n'),output('show running-config interface '+iface,'interface '+iface+'\n tcont 1 profile existing-60-up\n gemport 1 tcont 1\n gemport 1 traffic-limit downstream existing-60-down\n service-port 1 vport 1 user-vlan 101 vlan 101\n!\nend\n'),output('show gpon remote-onu capability '+iface,'T-CONT number: 15\nGEM port number: 256\n'),output('show onu-type gpon UNIT-2G','ONU type name: UNIT-2G\nMax T-CONT: 8\nMax GEM port: 32\n')]};}
function input(extra={}){return{mode:'automatic',uploadKbps:30000,downloadKbps:30000,vlans:[102],binding:'trunk',...extra};}
test('C3xx catalog parsing supports paginated fixed/assured/maximum tables and never infers bandwidth from a profile name',()=>{
 const raw=catalogue(),before=structuredClone(raw);raw.outputs[2].stdout=raw.outputs[2].stdout.replace('5 64','--More--   5 64');const parsed=profiles.parseCatalogue(raw);assert.equal(parsed.tcont.length,2);assert.equal(parsed.traffic.length,2);assert.deepEqual(parsed.vlans,[1,100,101,102,1101]);assert.equal(profiles.upstream(parsed.tcont[1]),62976);assert.equal(profiles.upstream(parsed.tcont[0]),10000);assert.equal(before.outputs[0].command,raw.outputs[0].command);
});
test('truncated, ambiguous, malformed and inconsistent catalog readings are rejected instead of treated as empty profiles',()=>{
 for(const change of[raw=>raw.success=false,raw=>raw.outputs.pop(),raw=>raw.outputs[5].stdout=raw.outputs[5].stdout.replace('num: 5','num: 6'),raw=>raw.outputs[2].stdout+='Profile name :default\n1 10000 0 0 N/A\n',raw=>raw.outputs[2].stdout=raw.outputs[2].stdout.replace('1 10000 0 0','4 0 0 0'),raw=>raw.outputs[3].stdout=raw.outputs[3].stdout.replace('62976 62976','70000 62976')]){const raw=catalogue();change(raw);assert.throws(()=>profiles.parseCatalogue(raw));}
});
test('ONU limits use minimum physical/type capacity, preserve full frame/slot/port identity and existing bindings',()=>{
 const raw=onu(),before=structuredClone(raw),parsed=profiles.parseOnu(raw,'1/1/1:1');assert.deepEqual(parsed.limits,{tcont:8,gem:32});assert.equal(parsed.serialNumber,'HWTCAABBCCDD');assert.equal(parsed.tcont[0].id,1);assert.equal(parsed.services[0].vlan,101);assert.equal(parsed.configState,'fail');assert.deepEqual(raw,before);
});
test('ONU identity mismatch, unknown limits, malformed services and duplicate resources fail closed',()=>{
 for(const change of[raw=>raw.outputs[0].stdout=raw.outputs[0].stdout.replace('gpon-onu_1/1/1:1','gpon-onu_1/1/2:1'),raw=>raw.outputs[0].stdout=raw.outputs[0].stdout.replace('HWTCAABBCCDD','unknown'),raw=>raw.outputs[2].stdout='',raw=>raw.outputs[3].stdout=raw.outputs[3].stdout.replace('UNIT-2G','OTHER'),raw=>raw.outputs[1].stdout+='tcont 1 profile default\n',raw=>raw.outputs[1].stdout+='service-port 2 vport 2 user-vlan 200 to 300 transparent\n',raw=>raw.outputs[1].stdout=raw.outputs[1].stdout.replace('gemport 1 tcont 1','gemport 1 tcont 2')]){const raw=onu();change(raw);assert.throws(()=>profiles.parseOnu(raw,'1/1/1:1'));}
 for(const value of['0/1/1:1','1/1/1:0','1/1/1:1;reboot','1/1/1:1\nwrite','1/1/20:1','../../etc/passwd'])assert.equal(profiles.address(value),'');
});
test('automatic profiling does not reuse default 10M for a 30M service and allocates only free T-CONT/GEM slots',()=>{
 const cat=profiles.parseCatalogue(catalogue()),unit=profiles.parseOnu(onu(),'1/1/1:1'),before=structuredClone(unit),plan=profiles.plan(cat,input(),unit);assert.equal(plan.profiles[0].name,'FB-UP-30000');assert.equal(plan.profiles[0].action,'create');assert.equal(plan.sharedUploadKbps,30000);assert.equal(plan.allocation.tcontId,2);assert.equal(plan.allocation.rows[0].gemId,2);assert.equal(plan.allocation.rows[0].servicePortId,2);assert.equal(plan.writeAvailable,false);assert.deepEqual(unit,before);
});
test('matching automatic profiles are reused idempotently, but conflicting generated names are never overwritten',()=>{
 const cat=profiles.parseCatalogue(catalogue()),first=profiles.plan(cat,input());for(const p of first.profiles){const{kind,action,...row}=p;cat[kind].push(row);}assert(profiles.plan(cat,input()).profiles.every(row=>row.action==='reuse'));cat.tcont.at(-1).maximum=10000;assert.throws(()=>profiles.plan(cat,input()),/bertabrakan/);
});
test('manual profiling uses only selected existing names with sufficient actual capacity',()=>{
 const cat=profiles.parseCatalogue(catalogue()),manual=input({mode:'manual',tcontProfile:'existing-60-up',trafficProfile:'existing-60-down'}),plan=profiles.plan(cat,manual);assert(plan.profiles.every(row=>row.action==='reuse'));assert.equal(plan.sharedUploadKbps,62976);assert.throws(()=>profiles.plan(cat,{...manual,tcontProfile:'default'}),/lebih kecil/);assert.throws(()=>profiles.plan(cat,{...manual,tcontProfile:'missing'}),/tidak ditemukan/);assert.throws(()=>profiles.plan(cat,{...manual,tcontProfile:'x\nwrite'}),/tidak valid/);
});
test('multiple VLANs share one explicitly aggregate upstream budget and have independent GEM allocations, not fabricated downstream totals',()=>{
 const cat=profiles.parseCatalogue(catalogue()),unit=profiles.parseOnu(onu(),'1/1/1:1'),plan=profiles.plan(cat,input({vlans:[100,102,1101]}),unit);assert.equal(plan.allocation.aggregateUploadKbps,30000);assert.equal(plan.allocation.perGemDownloadKbps,30000);assert(!Object.hasOwn(plan.allocation,'aggregateDownloadKbps'));assert.deepEqual(plan.allocation.rows.map(row=>row.tcontId),[2,2,2]);assert.deepEqual(plan.allocation.rows.map(row=>row.gemId),[2,3,4]);assert(plan.reason.includes('downstream per GEM'));
});
test('full T-CONT/GEM slots, existing service VLANs, unsafe VLAN ranges and incompatible port modes are blocked',()=>{
 const cat=profiles.parseCatalogue(catalogue()),unit=profiles.parseOnu(onu(),'1/1/1:1');assert.throws(()=>profiles.plan(cat,input({vlans:[101]}),unit),/sudah dipakai/);
 for(const extra of[{vlans:[1]},{vlans:[4095]},{vlans:[102,102]},{vlans:[102,1101],binding:'untagged'},{uploadKbps:0},{uploadKbps:2000000},{downloadKbps:9000000}])assert.throws(()=>profiles.plan(cat,input(extra),unit));
 const full=structuredClone(unit);full.tcont=Array.from({length:8},(_,i)=>({id:i+1,profile:'existing-60-up'}));assert.throws(()=>profiles.plan(cat,input(),full),/tidak cukup/);full.tcont=unit.tcont;full.gems=Array.from({length:32},(_,i)=>({id:i+1,tcont:1}));assert.throws(()=>profiles.plan(cat,input(),full),/tidak cukup/);
});
test('real-device reads in demo mode require an explicit ZTE-only read grant; write commands remain blocked',async()=>{
 const[,context,transport]=await vendors.loadLibrary(),data={settings:{}},device={id:'zte-preview-grant',vendor:'zte',enabled:true,host:'192.0.2.66',cliProtocol:'telnet',cliPort:23};process.env.MIGRATION_MODE='1';let called=0;
 try{await assert.rejects(context.withContext(data,device,()=>{}),/terisolasi/);await assert.rejects(context.withContext(data,{...device,vendor:'cdata'},()=>{},{allowZteDevRead:true}),/terisolasi/);
 await context.withContext(data,device,async()=>{await transport.executeOltCommands({olt:vendors.legacyDevice(device),password:'unit',commands:['enable','show version-running']});for(const command of['write','profile tcont x type 4 maximum 10000','no onu 1','snmpset'])await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(device),password:'unit',commands:[command]}));},{allowZteDevRead:true,transports:{commands:async()=>{called++;return{success:true,outputs:[]};}}});assert.equal(called,1);
 }finally{process.env.MIGRATION_MODE='0';}
});
test('catalog reads coalesce and cache bounded parsed data without credentials or any implicit profile creation',async()=>{
 const data={settings:{}},device={id:'zte-profile-cache-unit',vendor:'zte',enabled:true,cliEnabled:true,host:'192.0.2.65',cliPort:23,cliProtocol:'telnet',cliUsername:'unit'};device.cliPasswordEnc=secrets.encryptSecret(data,'private-unit');let calls=0;const before=structuredClone(data),options={transports:{commands:async request=>{calls++;assert(request.commands.every(command=>command==='enable'||command.startsWith('show ')));await new Promise(resolve=>setTimeout(resolve,5));return catalogue();}}};
 const [one,two]=await Promise.all([profiles.readCatalogue(data,device,options),profiles.readCatalogue(data,device,options)]);assert.equal(calls,1);one.catalogue.tcont[0].name='changed';assert.equal(two.catalogue.tcont[0].name,'default');assert.equal((await profiles.readCatalogue(data,device,options)).catalogue.tcont[0].name,'default');assert.equal(calls,1);assert(!JSON.stringify(two).includes('private-unit'));assert(!JSON.stringify(two).includes('stdout'));assert.deepEqual(data,before);await assert.rejects(profiles.readCatalogue(data,device,{...options,force:true}),error=>error.status===429);
});
test('profile endpoint is management/NAS guarded, preview-only, bounded and verified by the installer',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8'),part=server.slice(server.indexOf('const oltZteProfiles='),server.indexOf('const oltSaveConfig='));assert(part.includes("requireAnyPermission(req,res,['olt:manage','olt:pnp:manage'])"));assert(part.includes('oltMonitor.visibleDevices'));assert(part.includes("row.vendor==='zte'"));assert(part.includes('readBody(req,8192)'));assert(part.includes("payload.action!=='preview'"));assert(part.includes('writeAvailable:false'));assert(part.includes('profiles.key(current)!==profiles.key(device)'));
 assert(require('./helpers/install-payload').payloadSource('install.sh').includes('src/olt-zte-profiles.js'));
});
test('existing service bandwidth preview retains VLAN translations and every allocated ID, using no new T-CONT slot',()=>{
 const cat=profiles.parseCatalogue(catalogue()),unit=profiles.parseOnu(onu(),'1/1/1:1'),before=structuredClone(unit);unit.services[0].userVlan=1101;
 const plan=profiles.plan(cat,input({operation:'edit',servicePortId:1,vlans:[101]}),unit);assert.equal(plan.operation,'edit');assert.equal(plan.allocation.tcontId,1);assert.deepEqual(plan.allocation.rows,[{vlan:101,userVlan:1101,tcontId:1,gemId:1,servicePortId:1}]);assert.equal(plan.allocation.previous.tcontProfile,'existing-60-up');assert.equal(plan.writeAvailable,false);assert.equal(unit.tcont.length,before.tcont.length);assert.equal(unit.services[0].userVlan,1101);
});
test('edit previews reject shared T-CONT/GEM resources, arbitrary service ports and unrequested VLAN changes',()=>{
 const cat=profiles.parseCatalogue(catalogue()),unit=profiles.parseOnu(onu(),'1/1/1:1'),edit=input({operation:'edit',servicePortId:1,vlans:[101]});
 assert.throws(()=>profiles.plan(cat,edit),/Baca ONU/);for(const extra of[{operation:'delete'},{servicePortId:2},{vlans:[102]},{vlans:[101,102]},{servicePortId:'1;write'}])assert.throws(()=>profiles.plan(cat,{...edit,...extra},unit));
 const shared=structuredClone(unit);shared.gems.push({id:2,tcont:1});assert.throws(()=>profiles.plan(cat,edit,shared),/beberapa layanan/);shared.gems=unit.gems;shared.services.push({id:2,gem:1,userVlan:102,vlan:102});assert.throws(()=>profiles.plan(cat,edit,shared),/beberapa layanan/);
});
test('ONU selection is bound to the exact expected serial and never falls back to another position after a swap',()=>{
 const unit=profiles.parseOnu(onu(),'1/1/1:1');assert.equal(profiles.verifySerial(unit,'HWTCAABBCCDD'),unit);assert.throws(()=>profiles.verifySerial(unit,'HWTCAABBCCDE'),/SN ONU berbeda/);assert.throws(()=>profiles.verifySerial(unit,'HWTCAABBCCDD\nwrite'));assert.equal(profiles.verifySerial(unit,undefined),unit);
});

test('a known inventory ONU type uses one bounded CLI session and must match the native detail, with force bypassing read cache',async()=>{
 const data={settings:{}},device={id:'zte-single-read-unit',vendor:'zte',enabled:true,cliEnabled:true,host:'192.0.2.67',cliPort:23,cliProtocol:'telnet',cliUsername:'unit'};device.cliPasswordEnc=secrets.encryptSecret(data,'unit');let calls=0,raw=onu(),now=Date.now();const realNow=Date.now;Date.now=()=>now;
 const options={type:'UNIT-2G',transports:{commands:async({commands})=>{calls++;assert(commands.includes('show onu-type gpon UNIT-2G'));return structuredClone(raw);}}};
 try{const first=await profiles.readOnu(data,device,'1/1/1:1',options);assert.equal(first.type,'UNIT-2G');assert.equal(calls,1);await profiles.readOnu(data,device,'1/1/1:1',options);assert.equal(calls,1);now+=11000;await profiles.readOnu(data,device,'1/1/1:1',{...options,force:true});assert.equal(calls,2);
  await assert.rejects(profiles.readOnu(data,device,'1/1/1:1',{...options,type:'UNIT;reboot'}),/tidak valid/);assert.equal(calls,2);
 }finally{Date.now=realNow;}
});

test('verified registration type overrides a truncated inventory label only for the exact connection, address and SN',async()=>{
 const data={settings:{}},device={id:'zte-full-type-unit',vendor:'zte',enabled:true,cliEnabled:true,host:'192.0.2.68',cliPort:23,cliProtocol:'telnet',cliUsername:'unit'};device.cliPasswordEnc=secrets.encryptSecret(data,'unit');const catalogue=require('../src/olt-zte-catalogue');device.onuRegistrationJobs=[{status:'verified',address:'1/1/1:1',serialNumber:'HWTCAABBCCDD',type:'UNIT-2G',connection:catalogue.connection(device)}];let calls=0;
 const options={type:'UNIT',serialNumber:'HWTCAABBCCDD',transports:{commands:async({commands})=>{calls++;assert(commands.includes('show onu-type gpon UNIT-2G'));assert(!commands.includes('show onu-type gpon UNIT'));return onu();}}};
 const unit=await profiles.readOnu(data,device,'1/1/1:1',options);assert.equal(unit.type,'UNIT-2G');assert.equal(calls,1);profiles.invalidate(device);
 const wrong={...options,serialNumber:'HWTC11223344',transports:{commands:async({commands})=>{assert(commands.includes('show onu-type gpon UNIT'));return onu();}}};await assert.rejects(profiles.readOnu(data,{...device,id:'zte-no-alias-unit'},'1/1/1:1',wrong),/SN ONU berbeda/);
});
test('truncated or stale inventory types resolve from exact native identity once without changing registration records',async()=>{
 for(const failedHint of[false,true]){
  const data={settings:{}},device={id:'zte-native-full-type-'+failedHint,vendor:'zte',enabled:true,cliEnabled:true,host:'192.0.2.70',cliPort:23,cliUsername:'unit',cliProtocol:'telnet'};device.cliPasswordEnc=secrets.encryptSecret(data,'unit');let calls=0;
  const options={type:'UNIT',serialNumber:'HWTCAABBCCDD',transports:{commands:async({commands})=>{calls++;assert(commands.every(command=>command==='enable'||command.startsWith('show ')));const raw=onu();if(calls===1){assert(commands.includes('show onu-type gpon UNIT'));raw.outputs.pop();raw.success=!failedHint;raw.outputs.push(output('show onu-type gpon UNIT','ONU type name: UNIT-2G\nMax T-CONT: 8\nMax GEM port: 32\n'));}else assert(commands.includes('show onu-type gpon UNIT-2G'));return raw;}}};
  const before=structuredClone(device),value=await profiles.readOnu(data,device,'1/1/1:1',options);assert.equal(value.type,'UNIT-2G');assert.equal(calls,2);assert.deepEqual(device,before);assert.equal((await profiles.readOnu(data,device,'1/1/1:1',options)).type,'UNIT-2G');assert.equal(calls,2);
 }
});
test('type-resolution retry rejects changed serial, position, repeated type changes and ambiguous native identity',async()=>{
 for(const scenario of['serial','position','type','duplicate']){
  const data={settings:{}},device={id:'zte-full-type-race-'+scenario,vendor:'zte',enabled:true,cliEnabled:true,host:'192.0.2.71',cliPort:23,cliUsername:'unit',cliProtocol:'telnet'};device.cliPasswordEnc=secrets.encryptSecret(data,'unit');let calls=0;
  const options={type:'UNIT',serialNumber:'HWTCAABBCCDD',transports:{commands:async()=>{calls++;const raw=onu();if(calls===1){raw.outputs[3].command='show onu-type gpon UNIT';if(scenario==='duplicate')raw.outputs[0].stdout+='Type: UNIT-2G\n';}else{if(scenario==='serial')raw.outputs[0].stdout=raw.outputs[0].stdout.replace('HWTCAABBCCDD','HWTC11223344');if(scenario==='position')raw.outputs[0].stdout=raw.outputs[0].stdout.replace('gpon-onu_1/1/1:1','gpon-onu_1/1/2:1');if(scenario==='type')raw.outputs[0].stdout=raw.outputs[0].stdout.replace('Type: UNIT-2G','Type: OTHER');}return raw;}}};
  await assert.rejects(profiles.readOnu(data,device,'1/1/1:1',options));assert.equal(calls,scenario==='duplicate'?1:2);
 }
});
test('native profile inspection preserves every service including several user VLANs translated to one network VLAN',()=>{
 const raw=onu();raw.outputs[1].stdout=raw.outputs[1].stdout.replace('!\n','gemport 2 tcont 1\nservice-port 2 vport 2 user-vlan 102 vlan 101\ngemport 3 tcont 1\nservice-port 3 vport 3 user-vlan 100 vlan 100\n!\n');
 const parsed=profiles.parseOnu(raw,'1/1/1:1');assert.deepEqual(parsed.services.map(row=>[row.userVlan,row.vlan]),[[101,101],[102,101],[100,100]]);
});
