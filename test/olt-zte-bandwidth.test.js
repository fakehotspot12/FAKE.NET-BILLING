'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const bandwidth=require('../src/olt-zte-bandwidth'),pnp=require('../src/olt-zte-pnp'),vendors=require('../src/olt-vendors');
const{fixture,model,input,reply,response}=require('./helpers/olt-bandwidth-fixture');
test('auto policy uses numeric Type 4 and SIR 0, not aliases, fixed reservation or rounded 60M labels',()=>{
 const state=model(),before=structuredClone(state),policy=bandwidth.policy(state.catalogue);assert.equal(policy.maxOnus,128);assert.equal(policy.profiles[0].name,'FB-BE60-UP');assert.equal(policy.profiles[0].maximum,60000);assert.equal(policy.profiles[0].fixed,0);assert.equal(policy.profiles[0].assured,0);assert.equal(policy.profiles[1].sir,0);assert.deepEqual(state,before);
 for(const kbps of[0,50000,60001,60000.1,'60000',120001,Infinity])assert.throws(()=>bandwidth.policy(state.catalogue,kbps));
});
test('128 ONUs share the same two profiles with zero reservation; a 120M exception does not change any other ONU',()=>{
 const state=model(),units=Array.from({length:128},(_,i)=>({...structuredClone(state.onu),address:'1/1/13:'+(i+1),serialNumber:'HWTC'+i.toString(16).toUpperCase().padStart(8,'0')}));
 for(const rate of[60000,120000])for(const p of bandwidth.policy(state.catalogue,rate).profiles){const{kind,action,...row}=p;state.catalogue[kind].push(row);}
 for(const unit of units){const value=bandwidth.build({...state,onu:unit},input(unit,60000));assert(value.profiles.every(row=>row.action==='reuse'));assert.equal(value.allocation.tcontId,1);assert.equal(value.allocation.usedTcont,1);unit.tcont[0].profile=value.profiles[0].name;unit.gems[0].downstream=value.profiles[1].name;}
 const before=structuredClone(units),override=bandwidth.build({...state,onu:units[127]},input(units[127],120000));assert.equal(override.profiles[0].maximum,120000);assert.equal(override.profiles[0].fixed+override.profiles[0].assured,0);assert.deepEqual(units,before);assert.equal(state.catalogue.tcont.length,4);assert.equal(state.catalogue.traffic.length,3);
 assert.equal(units.reduce((n,unit)=>n+state.catalogue.tcont.find(p=>p.name===unit.tcont[0].profile).fixed,0),0);
 const commands=bandwidth.writeCommands(state,override);assert(commands.includes('interface gpon-onu_1/1/13:128'));assert(!commands.some(command=>/bandwidth gpon|onu-pnp|service-port |shutdown|^write$|^no /.test(command)&&command!=='show onu-pnp config'));assert.deepEqual(units.slice(0,127),before.slice(0,127));
});
test('same numeric profiles are reused, but generated names with a different type/rate/reservation are never overwritten',()=>{
 const state=model(),first=bandwidth.policy(state.catalogue);for(const p of first.profiles){const{kind,action,...row}=p;state.catalogue[kind].push(row);}assert(bandwidth.policy(state.catalogue).profiles.every(row=>row.action==='reuse'));state.catalogue.tcont.at(-1).fixed=64;assert.throws(()=>bandwidth.policy(state.catalogue),/bertabrakan/);
});
test('standards only creates four unbound profiles without registration, ONU service, VLAN, global preset or save commands',()=>{
 const state=model(),value=bandwidth.build(state,{kind:'standards'}),commands=bandwidth.writeCommands(state,value);assert.equal(commands.filter(row=>row.startsWith('profile ')).length,4);assert(!commands.some(row=>/^interface |^onu |^no |^bandwidth |^write$|^reboot$|^service-port |shutdown/.test(row)));assert.equal(value.target,null);assert.equal(value.allocation,null);
});
test('manual override holds wrong SN/address/model, failed/offline config, missing service and shared resources',()=>{
 const state=model();for(const extra of[{serialNumber:'HWTC11223344'},{address:'1/1/13:2'},{type:'OTHER'},{servicePortId:2},{address:'1/1/13:1;reboot'},{type:'X\nwrite'},{kbps:100000}])assert.throws(()=>bandwidth.build(state,{...input(state.onu),...extra}));
 for(const field of['status','configState']){const copy=structuredClone(state);copy.onu[field]='fail';assert.throws(()=>bandwidth.build(copy,input(copy.onu)));}
 state.onu.gems.push({id:2,tcont:1});assert.throws(()=>bandwidth.build(state,input(state.onu)),/beberapa layanan/);
});
test('same-session identity/catalogue proof, correct CLI modes and readback gate all writes',async()=>{
 const {PassThrough}=require('node:stream'),[,context,transport]=await vendors.loadLibrary();
 for(const scenario of['standards','onu','changed','swapped','offline','wrong-mode','vendor-error','lost-readback']){
  const{data,device}=fixture(),state=model(),kind=scenario==='standards'?'standards':'onu',selection=kind==='standards'?null:state.onu,baseline=bandwidth.inspect(response(bandwidth.readCommands(selection),state),selection),value=bandwidth.build(baseline,kind==='standards'?{kind}:input(baseline.onu)),commands=bandwidth.writeCommands(baseline,value),writes=[];let second=false;
  const result=await context.withContext(data,device,()=>{context.authorizeBandwidthOperation(baseline,value);context.current().bandwidthGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(device),password:'unit',commands,timeoutMs:1500},({ready})=>{const stream=new PassThrough();stream.write=chunk=>{const command=String(chunk).trim();writes.push(command);if(command==='show gpon profile tcont'&&scenario==='changed')state.catalogue.tcont[0].fixed=20000;if(command.startsWith('show gpon onu detail-info ')&&scenario==='swapped')state.onu.serialNumber='HWTC11223344';if(command.startsWith('show gpon onu detail-info ')&&scenario==='offline')state.onu.status='OffLine';if(command==='end')second=true;let text=reply(command,state);if(scenario==='wrong-mode'&&command==='gpon')text='OLT(config-if)#';if(scenario==='vendor-error'&&command.startsWith('profile '))text='%Code 123: rejected\nOLT(config-gpon)#';if(scenario==='lost-readback'&&second&&command==='show gpon profile traffic')text='Profile name :default\n9953280 9953280 default default\nOLT#';queueMicrotask(()=>stream.emit('data',text));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{bandwidthActionAllowed:true});
  if(['standards','onu'].includes(scenario)){assert(result.success,result.error);assert(result.verified);assert(result.submitted);assert.equal(state.global.bandwidth,'default');if(kind==='standards')assert.equal(state.onu.tcont[0].profile,'default');else{assert.equal(state.onu.tcont[0].profile,'FB-BE120-UP');assert.equal(state.onu.services[0].userVlan,200);}}
  else{assert(!result.success,scenario);if(['changed','swapped','offline','wrong-mode'].includes(scenario)){assert(!writes.some(row=>row.startsWith('profile ')),scenario);if(scenario!=='wrong-mode')assert.equal(result.submitted,false);}}
 }
});
test('grants prohibit arbitrary mutations, altered targets, replay, unapproved Dev writes and firmware guessing',async()=>{
 const{data,device}=fixture(),state=model(),value=bandwidth.build(state,{kind:'standards'}),[,context,transport]=await vendors.loadLibrary();process.env.MIGRATION_MODE='1';let calls=0;
 try{await assert.rejects(context.withContext(data,device,()=>context.authorizeBandwidthOperation(state,value),{allowZteDevRead:true,bandwidthActionAllowed:true}),/authorization/);
 await context.withContext(data,device,async()=>{await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(device),commands:['profile tcont HACK type 4 maximum 60000']}));context.authorizeBandwidthOperation(state,value);const commands=bandwidth.writeCommands(state,value);await assert.rejects(transport.executeOltCommands({olt:{...vendors.legacyDevice(device),id:'other'},commands}));},{allowZteDevRead:true,bandwidthActionAllowed:true,explicitDevBandwidthAction:true});
 await context.withContext(data,device,async()=>{context.authorizeBandwidthOperation(state,value);const commands=bandwidth.writeCommands(state,value);await transport.executeOltCommands({olt:vendors.legacyDevice(device),commands});await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(device),commands}));},{allowZteDevRead:true,bandwidthActionAllowed:true,explicitDevBandwidthAction:true,transports:{commands:async()=>{calls++;return{success:false,submitted:false};}}});assert.equal(calls,1);
 }finally{process.env.MIGRATION_MODE='0';}
 state.catalogue.firmwares=['V9.0.0'];assert.throws(()=>bandwidth.inspect(response(bandwidth.readCommands(),state)),/firmware/);
});
test('prepared action requires matching actor/revision/impact and is audited without retry after uncertainty',async()=>{
 const{data,device,actor}=fixture(),state=model();let writes=0,audits=0;const before=structuredClone(data),options={transportOptions:{transports:{commands:async({commands})=>{if(commands.includes('gpon')){writes++;return{success:false,submitted:true};}return response(commands,state);}}},beforeSend:async()=>{audits++;},afterSend:async()=>{audits++;}};
 const plan=await bandwidth.prepare(data,device,actor,{kind:'standards'},options),confirmation={token:plan.token,revision:device.updatedAt||'',confirmId:device.id,confirmTarget:'60/120',confirmImpact:true};
 for(const extra of[{confirmImpact:false},{confirmTarget:'120'},{confirmId:'other'},{revision:'changed'}])await assert.rejects(bandwidth.execute(data,device,actor,{...confirmation,...extra},options));
 const result=await bandwidth.execute(data,device,actor,confirmation,options);assert(result.uncertain);assert(!result.verified);assert.equal(writes,1);assert.equal(audits,2);assert.deepEqual(await bandwidth.execute(data,device,actor,confirmation,options),result);assert.equal(writes,1);assert.deepEqual(data,before);
});
test('bandwidth endpoint is role/NAS/CSRF bounded and included in installer/updater without a new worker',()=>{
 const server=fs.readFileSync(require.resolve('../src/server.js'),'utf8'),part=server.slice(server.indexOf('const oltZteBandwidth='),server.indexOf('const oltZtePnp='));for(const text of["requirePermission(req,res,'olt:pnp:manage')",'scopedDevices','readBody(req,4096)','beforeSend:','afterSend:','pnp.signature(latest)'])assert(part.includes(text));
 for(const file of['../install.sh','../deploy/bin/fakenet-billing-update'])assert(require('./helpers/install-payload').payloadSource(file.replace(/^\.\.\//,'')).includes('src/olt-zte-bandwidth.js'));
});

test('per-ONU native profiles support asymmetric best-effort rates and never alter profile definitions',()=>{
 const state=model();state.catalogue.tcont.push({name:'UPLOAD-20',type:4,fixed:0,assured:0,maximum:20000});state.catalogue.traffic.push({name:'DOWNLOAD-50',sir:0,pir:50000});
 const before=structuredClone(state),value=bandwidth.build(state,{...input(state.onu),profileMode:'native',tcontProfile:'UPLOAD-20',trafficProfile:'DOWNLOAD-50'});
 assert.equal(value.policies[0].kbps,20000);assert.equal(value.policies[0].downloadKbps,50000);assert(value.profiles.every(row=>row.action==='reuse'));assert.deepEqual(state,before);
 const commands=bandwidth.writeCommands(state,value);assert(commands.includes('tcont 1 profile UPLOAD-20'));assert(commands.includes('gemport 1 traffic-limit downstream DOWNLOAD-50'));assert(!commands.some(command=>command.startsWith('profile ')));
 for(const extra of[{tcontProfile:'missing'},{trafficProfile:'default'},{tcontProfile:'UPLOAD-20;reboot'}])assert.throws(()=>bandwidth.build(state,{...input(state.onu),profileMode:'native',tcontProfile:'UPLOAD-20',trafficProfile:'DOWNLOAD-50',...extra}));
});
test('existing legacy Type 5 and SIR profiles are reused exactly without editing definitions or the auto-learn preset',()=>{
 const state=model();state.catalogue.tcont.push({name:'LEGACY-60-UP',type:5,fixed:64,assured:64,maximum:62976});state.catalogue.traffic.push({name:'LEGACY-60-DOWN',sir:62976,pir:62976});
 const before=structuredClone(state),value=bandwidth.build(state,{...input(state.onu),profileMode:'native',tcontProfile:'LEGACY-60-UP',trafficProfile:'LEGACY-60-DOWN'}),commands=bandwidth.writeCommands(state,value);
 assert.equal(value.policies[0].kbps,62976);assert(value.policies[0].requiresReservationConfirmation);assert.equal(value.policies[0].fixedKbps,64);assert(value.profiles.every(row=>row.action==='reuse'));assert.deepEqual(state,before);
 assert(commands.includes('tcont 1 profile LEGACY-60-UP'));assert(!commands.some(command=>/^profile |^no |^onu-pnp$|^bandwidth |^onu-type-default /.test(command)));
 assert(bandwidth.nativeProfileStatus({type:5,fixed:64,assured:64,maximum:1048064},'upload').selectable);assert(!bandwidth.nativeProfileStatus(state.catalogue.traffic[0],'download').selectable);
 assert(!bandwidth.nativeProfileStatus({type:4,fixed:64,assured:64,maximum:60000},'upload').selectable);
});
test('native reserved bandwidth requires independent consent before any audit or OLT mutation',async()=>{
 const{data,device,actor}=fixture(),state=model();state.catalogue.tcont.push({name:'LEGACY-60-UP',type:5,fixed:64,assured:64,maximum:62976});state.catalogue.traffic.push({name:'LEGACY-60-DOWN',sir:62976,pir:62976});let writes=0,audits=0;
 const options={transportOptions:{transports:{commands:async({commands})=>{if(commands.includes('configure terminal')){writes++;return{success:false,submitted:true};}return response(commands,state);}}},beforeSend:async()=>{audits++;},afterSend:async()=>{audits++;}};
 const plan=await bandwidth.prepare(data,device,actor,{...input(state.onu),profileMode:'native',tcontProfile:'LEGACY-60-UP',trafficProfile:'LEGACY-60-DOWN'},options),confirmation={token:plan.token,revision:device.updatedAt||'',confirmId:device.id,confirmTarget:state.onu.serialNumber,confirmImpact:true};
 await assert.rejects(bandwidth.execute(data,device,actor,confirmation,options),/reservasi bandwidth/);assert.equal(writes,0);assert.equal(audits,0);
 const result=await bandwidth.execute(data,device,actor,{...confirmation,confirmReservedBandwidth:true},options);assert(result.uncertain);assert.equal(writes,1);assert.equal(audits,2);
});

test('per-ONU catalogue selection uses saved rates rather than browser-supplied values and detects changed/deleted profiles',async()=>{
 const{data,device,actor}=fixture(),state=model(),catalogue=require('../src/olt-zte-catalogue');
 device.provisioningCatalogue={connection:catalogue.connection(device),revision:'unit',profiles:[{id:'unit-profile',label:'Paket 20/50',uploadKbps:20000,downloadKbps:50000,enabled:true}],vlans:[],models:[]};
 const options={transportOptions:{transports:{commands:async({commands})=>response(commands,state)}}};
 const prepared=await bandwidth.prepare(data,device,actor,{...input(state.onu),profileMode:'catalogue',profileId:'unit-profile',uploadKbps:999999,downloadKbps:999999},options);
 assert.equal(prepared.value.policies[0].kbps,20000);assert.equal(prepared.value.policies[0].downloadKbps,50000);bandwidth.assertProfile(device,prepared.value);
 device.provisioningCatalogue.profiles[0].downloadKbps=60000;assert.throws(()=>bandwidth.assertProfile(device,prepared.value),/berubah/);device.provisioningCatalogue.profiles=[];assert.throws(()=>bandwidth.assertProfile(device,prepared.value),/berubah/);
});

test('shared T-CONT preview discloses all affected VLANs without allocating resources or changing other GEM download profiles',()=>{
 const state=model();state.onu.gems.push({id:2,tcont:1,downstream:'default'});state.onu.services.push({id:2,gem:2,userVlan:201,vlan:200});
 const selection={...input(state.onu),profileMode:'standard',allowSharedUpload:true},value=bandwidth.build(state,selection),commands=bandwidth.writeCommands(state,value);
 assert.equal(value.allocation.sharedUpload,true);assert.deepEqual(value.allocation.sharedServices.map(row=>row.userVlan),[200,201]);assert.equal(value.allocation.usedTcont,1);assert.equal(value.allocation.usedGem,2);
 assert(commands.includes('tcont 1 profile FB-BE120-UP'));assert(!commands.some(command=>/^gemport 2 |^service-port |^no /.test(command)));
 assert.throws(()=>bandwidth.build(state,{...selection,allowSharedUpload:false}),/beberapa layanan/);
 const unbound=structuredClone(state);unbound.onu.gems.push({id:3,tcont:1});assert.throws(()=>bandwidth.build(unbound,selection),/tanpa pemetaan/);
 const duplicate=structuredClone(state);duplicate.onu.services.push({id:3,gem:1,userVlan:202,vlan:200});assert.throws(()=>bandwidth.build(duplicate,selection),/GEM dipakai/);
});

test('shared upload cannot be applied without its separate consent, and uncertainty is never retried',async()=>{
 const{data,device,actor}=fixture(),state=model();state.onu.gems.push({id:2,tcont:1,downstream:'default'});state.onu.services.push({id:2,gem:2,userVlan:201,vlan:200});let writes=0,audits=0;
 const options={transportOptions:{transports:{commands:async({commands})=>{if(commands.includes('configure terminal')){writes++;return{success:false,submitted:true};}return response(commands,state);}}},beforeSend:async()=>{audits++;},afterSend:async()=>{audits++;}};
 const plan=await bandwidth.prepare(data,device,actor,{...input(state.onu),profileMode:'standard',allowSharedUpload:true},options),confirmation={token:plan.token,revision:device.updatedAt||'',confirmId:device.id,confirmTarget:state.onu.serialNumber,confirmImpact:true};
 await assert.rejects(bandwidth.execute(data,device,actor,confirmation,options),/upload bersama/);assert.equal(writes,0);assert.equal(audits,0);
 const result=await bandwidth.execute(data,device,actor,{...confirmation,confirmSharedUpload:true},options);assert(result.uncertain);assert.equal(writes,1);assert.equal(audits,2);assert.deepEqual(await bandwidth.execute(data,device,actor,{...confirmation,confirmSharedUpload:true},options),result);assert.equal(writes,1);
});

test('shared native profile writes verify every original VLAN/GEM and reject swapped SN or unexpected other-service changes',async()=>{
 const{PassThrough}=require('node:stream'),[,context,transport]=await vendors.loadLibrary();
 for(const scenario of['success','other-gem-changed','duplicate-sn']){
  const{data,device}=fixture(),state=model();state.onu.gems.push({id:2,tcont:1,downstream:'default'});state.onu.services.push({id:2,gem:2,userVlan:201,vlan:200});
  const baseline=bandwidth.inspect(response(bandwidth.readCommands(state.onu),state),state.onu),value=bandwidth.build(baseline,{...input(state.onu),profileMode:'standard',allowSharedUpload:true}),commands=bandwidth.writeCommands(baseline,value),sent=[];
  const result=await context.withContext(data,device,()=>{context.authorizeBandwidthOperation(baseline,value);context.current().bandwidthGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(device),commands,timeoutMs:1500},({ready})=>{const stream=new PassThrough();stream.write=chunk=>{const command=String(chunk).trim();sent.push(command);if(command==='end'&&scenario==='other-gem-changed')state.onu.gems[1].downstream='FB-BE120-DOWN';let text=reply(command,state);if(command.startsWith('show gpon onu by sn ')&&scenario==='duplicate-sn')text+='\ngpon-onu_1/1/12:2\nOLT#';queueMicrotask(()=>stream.emit('data',text));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{bandwidthActionAllowed:true});
  if(scenario==='success'){assert(result.success,result.error);assert(result.verified);assert.equal(state.onu.gems[1].downstream,'default');assert.equal(state.onu.tcont.length,1);assert.equal(state.onu.services.length,2);}else{assert(!result.success);if(scenario==='duplicate-sn')assert(!sent.includes('configure terminal'));}
 }
});
