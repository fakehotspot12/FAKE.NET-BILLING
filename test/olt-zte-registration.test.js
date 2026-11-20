'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const registration=require('../src/olt-zte-registration'),pnp=require('../src/olt-zte-pnp'),vendors=require('../src/olt-vendors');
const{fixture,reply,response,key}=require('./helpers/olt-registration-fixture');
async function seeded(){const f=fixture(),options={explicitDevAccess:true,transportOptions:{transports:{commands:async({commands})=>response(commands,f.model)}}};await pnp.read(f.data,f.device,f.actor,key,options);pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100,101,102],bandwidthMode:'auto60',onuType:'',requestedEnabled:true,presetRevision:''});return{...f,options};}
test('SN discovery, exact physical PON and 128-slot capacity are verified without inventing an ONU address',async()=>{
 const f=await seeded(),state=await registration.readState(f.data,f.device,key,f.options),config=registration.selection(f.device,state,key);assert.equal(config.createType,true);assert.equal(config.type,registration.TYPE);assert.deepEqual(config.vlans,[100,101,102]);assert(config.policy.profiles.every(row=>row.action==='create'));assert.equal(state.registered,0);
 const prepared=await registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber},f.options);assert.equal(prepared.value.serialNumber,f.model.onu.serialNumber);assert(!Object.hasOwn(prepared.value,'address'));assert.equal(f.model.registered,false);
});
test('automation enable and stop persist independently of native PnP; stop never requires reaching OLT',async()=>{
 const f=await seeded(),before=structuredClone(f.model),prepared=await registration.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},f.options),input={token:prepared.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:key,confirmImpact:true};
 for(const bad of[{confirmImpact:false},{confirmTarget:'1/1/1'},{revision:'changed'}])assert.throws(()=>registration.activate(f.data,f.device,f.actor,{...input,...bad}));
 const result=registration.activate(f.data,f.device,f.actor,input);assert.equal(result.enabled,true);assert.equal(registration.settings(f.device)[key].enabled,true);assert.deepEqual(f.model,before);
 const loaded=JSON.parse(JSON.stringify(f.data)).oltDevices[0];assert.equal(registration.settings(loaded)[key].enabled,true);
 const stopped=await registration.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:false},{transportOptions:{transports:{commands:()=>{throw Error('Must not connect');}}}});registration.activate(f.data,f.device,f.actor,{...input,token:stopped.token});assert.equal(registration.settings(f.device)[key].enabled,false);
});
test('manual SN registration creates only private profiles and two VLAN batches, no authorization by user-entered address',async()=>{
 const f=await seeded(),before={customers:structuredClone(f.data.customers),settings:structuredClone(f.data.settings)},commands=[],options={...f.options,transportOptions:{transports:{commands:async request=>{commands.push(...request.commands);return response(request.commands,f.model);}}},persist:async job=>registration.record(f.device,job)};
 const prepared=await registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber,address:'1/1/1:99'},options),job=await registration.executeManual(f.data,f.device,f.actor,{token:prepared.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:f.model.onu.serialNumber,confirmImpact:true},options);
 assert.equal(job.status,'verified',job.message);assert.equal(job.address,'1/1/13:1');assert.equal(f.model.onu.tcont.length,1);assert.equal(f.model.onu.gems.length,3);assert.deepEqual(f.model.onu.services.map(row=>row.vlan),[100,101,102]);assert.deepEqual(f.model.management.map(row=>row.vlan),[100,101,102]);assert.equal(commands.filter(row=>/^onu \d/.test(row)).length,1);assert(!commands.some(row=>/shutdown|^no |^write$|^reboot$|bandwidth gpon|transparent/.test(row)));assert.deepEqual(f.data.customers,before.customers);assert.deepEqual(f.data.settings,before.settings);
});
test('automatic scan processes a discovered serial once and never repeats a verified registration',async()=>{
 const f=await seeded(),prepared=await registration.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},f.options);registration.activate(f.data,f.device,f.actor,{token:prepared.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:key,confirmImpact:true});
 const result=await registration.tick(f.data,{...f.options,persist:async(device,job)=>registration.record(device,job)});assert.equal(result.processed,1);assert.equal(registration.jobs(f.device).at(-1).status,'verified');const count=f.model.management.length;assert.equal((await registration.tick(f.data,{...f.options,persist:async()=>{throw Error('No more jobs');}})).processed,0);assert.equal(f.model.management.length,count);
});
test('discovery yields to an active bridge editor without resetting the automatic controller or delaying the next available scan',async()=>{
 const f=await seeded(),plan=await registration.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},f.options);registration.activate(f.data,f.device,f.actor,{token:plan.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:key,confirmImpact:true});
 const bridge=require('../src/olt-zte-bridge'),original=bridge.isBusy;let requests=0;
 const options={...f.options,transportOptions:{transports:{commands:async({commands})=>{requests++;return response(commands,f.model);}}},persist:async(device,job)=>registration.record(device,job)};
 try{bridge.isBusy=id=>id===f.device.id;assert.deepEqual(await registration.tick(f.data,options),{processed:0});assert.equal(requests,0);assert.equal(registration.settings(f.device)[key].enabled,true);}finally{bridge.isBusy=original;}
 assert.equal((await registration.tick(f.data,options)).processed,1);assert.equal(registration.jobs(f.device).at(-1).status,'verified');
});
test('native PnP races, disabled PON, malformed tables, unknown firmware and copied generic profiles hold safely',async()=>{
 const f=await seeded();for(const change of[m=>m.native=true,m=>m.interfaceEnabled=false,m=>m.catalogue.firmwares=['V9']]){const model=structuredClone(f.model);change(model);await assert.rejects(registration.readState(f.data,f.device,key,{...f.options,transportOptions:{transports:{commands:async({commands})=>response(commands,model)}}}));assert.equal(model.registered,false);}
 const state=await registration.readState(f.data,f.device,key,f.options);state.onuTypes.push({name:registration.TYPE,tcont:8,gem:32});assert.throws(()=>registration.selection(f.device,state,key),/bertabrakan/);state.onuTypes.pop();state.catalogue.vlans=[1,100];assert.throws(()=>registration.selection(f.device,state,key),/VLAN/);
});
test('128 occupied positions, duplicate serial discovery and foreign SN cannot be authorized',async()=>{
 const f=await seeded();await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,{...f.options,persist:async job=>registration.record(f.device,job)});const state=await registration.readState(f.data,f.device,key,f.options),config=registration.selection(f.device,state,key);state.newOnus=[{ponKey:key,serialNumber:'HWTC11223344',model:'SAMPLE',ambiguous:false}];state.units=Array.from({length:128},(_,i)=>({id:key+':'+(i+1),serialNumber:'HWTC'+i.toString(16).padStart(8,'0').toUpperCase(),type:registration.TYPE}));assert.throws(()=>registration.registerPlan(state,config,'HWTC11223344'),/128 ONU/);state.units=[];state.newOnus[0].ambiguous=true;assert.throws(()=>registration.registerPlan(state,config,'HWTC11223344'),/ganda/);assert.throws(()=>registration.registerPlan(state,config,'HWTC11223344\nreboot'));
});
test('uncertain registration persists a held result, blocks automatic retries and never deletes an ONU',async()=>{
 const f=await seeded();let attempts=0;const options={...f.options,transportOptions:{transports:{commands:async({commands})=>{if(commands.some(row=>/^onu \d/.test(row))){attempts++;return{success:false,submitted:true,outputs:[]};}return response(commands,f.model);}}},persist:async job=>registration.record(f.device,job)};
 const job=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,options);assert.equal(job.status,'held');assert.match(job.message,/belum pasti/);assert.equal(attempts,1);await assert.rejects(registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,options));assert.equal(attempts,1);
});
test('serial lookup and a partial foreign service never fall back to another ONU',()=>{
 assert.deepEqual(registration.bySerial('%Code 62310-GPONSRV : No related information to show.','HWTCAABBCCDD'),[]);assert.throws(()=>registration.bySerial('timeout','HWTCAABBCCDD'));assert.throws(()=>registration.bySerial('gpon-onu_bad','HWTCAABBCCDD'));assert.deepEqual(registration.bySerial('gpon-onu_1/1/13:128\nOLT#','HWTCAABBCCDD'),['1/1/13:128']);
});
test('native transport enforces preflight/mode/readback and one-shot registration grants',async()=>{
 const f=await seeded(),[,context,transport]=await vendors.loadLibrary();let state=await registration.readState(f.data,f.device,key,f.options),config=registration.selection(f.device,state,key);
 for(const phase of['setup','register','services']){
  if(phase==='register'){state=await registration.readState(f.data,f.device,key,f.options);config=registration.registerPlan(state,registration.selection(f.device,state,key),f.model.onu.serialNumber);}
  const spec={phase,device:f.device,state,value:config,...(phase==='services'?{offset:0,end:2}:{})},commands=registration.phaseCommands(spec),result=await context.withContext(f.data,f.device,()=>{context.authorizeRegistrationOperation(spec);context.current().registrationGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(f.device),password:'unit',commands,timeoutMs:3000},({ready})=>{const stream=new PassThrough();stream.write=chunk=>{const text=reply(String(chunk).trim(),f.model);queueMicrotask(()=>stream.emit('data',text));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{registrationActionAllowed:true});assert(result.success,result.error);assert(result.verified);assert(result.submitted);
 }
});
test('sixteen selected VLANs use bounded batches and one T-CONT without exposing unrelated VLANs',async()=>{
 const f=await seeded();f.model.catalogue.vlans=[1,...Array.from({length:16},(_,i)=>100+i)];const preset=Object.values(f.device.onuPnpPresets)[0];preset.vlans=f.model.catalogue.vlans.slice(1);const commands=[];
 const job=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,{...f.options,transportOptions:{transports:{commands:async request=>{commands.push(request.commands);return response(request.commands,f.model);}}},persist:async job=>registration.record(f.device,job)});assert.equal(job.status,'verified',job.message);assert.equal(f.model.onu.tcont.length,1);assert.equal(f.model.onu.gems.length,16);assert.equal(f.model.onu.services.length,16);assert.equal(f.model.management.length,16);assert(commands.filter(batch=>batch.some(command=>command.startsWith('service-port '))).every(batch=>batch.filter(command=>command.startsWith('service-port ')).length<=2));assert(!commands.flat().some(command=>command.includes('transparent')));
});
test('authorization is denied after a role/NAS change, and enabling a new preset does not silently keep older automation',async()=>{
 const f=await seeded(),plan=await registration.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},f.options),input={token:plan.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:key,confirmImpact:true};f.actor.role='finance';assert.throws(()=>registration.activate(f.data,f.device,f.actor,input));f.actor.role='admin';registration.activate(f.data,f.device,f.actor,input);const before=pnp.presets(f.device)[key];pnp.savePreset(f.data,f.device,f.actor,{...before,vlans:[100],presetRevision:before.revision});assert.deepEqual(registration.settings(f.device),{});assert.equal(f.model.registered,false);
});
test('wrapped type in a summary table is verified against the complete ONU identity, never a name prefix alone',async()=>{
 const f=await seeded();f.model.wrapType=true;const job=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,{...f.options,persist:async row=>registration.record(f.device,row)});assert.equal(job.status,'verified',job.message);assert.equal(f.model.onu.type,registration.TYPE);
});
test('manual continuation rechecks an owned held ONU and never repeats the registration command',async()=>{
 const f=await seeded(),commands=[];let interrupted=true;const options={...f.options,transportOptions:{transports:{commands:async request=>{commands.push(...request.commands);const result=response(request.commands,f.model);if(interrupted&&request.commands.some(command=>/^onu \d/.test(command))){interrupted=false;return{success:false,submitted:true,outputs:[]};}return result;}}},persist:async row=>registration.record(f.device,row)};
 const held=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,options);assert.equal(held.status,'held');assert.equal(f.model.registered,true);
 const plan=await registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber},options);assert.equal(plan.value.resumeJobId,held.id);const job=await registration.executeManual(f.data,f.device,f.actor,{token:plan.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:f.model.onu.serialNumber,confirmImpact:true},options);assert.equal(job.status,'verified',job.message);assert.equal(commands.filter(command=>/^onu \d/.test(command)).length,1);assert.deepEqual(f.model.management.map(row=>row.vlan),[100,101,102]);
});
test('manual continuation accepts only an exact completed service batch and rejects foreign or moved identities',async()=>{
 const f=await seeded();let failed=false;const options={...f.options,transportOptions:{transports:{commands:async request=>{if(!failed&&request.commands.some(command=>command.startsWith('service-port 3 '))){failed=true;return{success:false,submitted:false,outputs:[]};}return response(request.commands,f.model);}}},persist:async row=>registration.record(f.device,row)};
 const held=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,options);assert.equal(held.status,'held');assert.equal(f.model.onu.services.length,2);
 const input={kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber};f.model.management[0].vlan=199;await assert.rejects(registration.prepare(f.data,f.device,f.actor,input,options),/Pemetaan/);f.model.management[0].vlan=100;const address=f.model.onu.address;f.model.onu.address='1/1/13:2';await assert.rejects(registration.prepare(f.data,f.device,f.actor,input,options));f.model.onu.address=address;
 const plan=await registration.prepare(f.data,f.device,f.actor,input,options),job=await registration.executeManual(f.data,f.device,f.actor,{token:plan.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:f.model.onu.serialNumber,confirmImpact:true},options);assert.equal(job.status,'verified',job.message);assert.equal(f.model.onu.services.length,3);assert.equal(f.model.onu.tcont.length,1);assert.equal(f.model.onu.gems.length,3);
});
test('identical preset saves keep automation active without changing the revision or repeating work',async()=>{
 const f=await seeded(),plan=await registration.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},f.options);registration.activate(f.data,f.device,f.actor,{token:plan.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:key,confirmImpact:true});
 const before=pnp.presets(f.device)[key],saved=pnp.savePreset(f.data,f.device,f.actor,{...before,presetRevision:before.revision});assert.equal(saved.revision,before.revision);assert.equal(registration.settings(f.device)[key].enabled,true);
});
test('manual continuation tolerates a re-saved identical preset but rejects changed VLANs or bandwidth',async()=>{
 const f=await seeded();let failed=false;const options={...f.options,transportOptions:{transports:{commands:async request=>{if(!failed&&request.commands.some(command=>command.startsWith('service-port 1 '))){failed=true;return{success:false,submitted:false,outputs:[]};}return response(request.commands,f.model);}}},persist:async row=>registration.record(f.device,row)};
 const held=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,options);assert.equal(held.status,'held');const preset=f.device.onuPnpPresets[key];preset.revision=require('node:crypto').randomUUID();
 const input={kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber};preset.vlans=[100];await assert.rejects(registration.prepare(f.data,f.device,f.actor,input,options),/Preset/);preset.vlans=[100,101,102];
 const plan=await registration.prepare(f.data,f.device,f.actor,input,options);assert.equal(plan.value.resumeJobId,held.id);
 const job=await registration.executeManual(f.data,f.device,f.actor,{token:plan.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:f.model.onu.serialNumber,confirmImpact:true},options);assert.equal(job.status,'verified',job.message);assert.deepEqual(f.model.management.map(row=>row.vlan),[100,101,102]);
});
test('login recovery reconnects once only before the first command and revalidates permissions persistently',async()=>{
 for(const scenario of['login-only','partial-read','submitted','permission-changed']){
  const f=await seeded();let connections=0,mutationBatches=0,blocked=false;const options={...f.options,transportOptions:{transports:{commands:async request=>{
   if(request.commands.some(command=>/^service-port 1 /.test(command))){connections++;if(connections===1){blocked=true;return{success:false,submitted:scenario==='submitted',completedCommands:scenario==='partial-read'?1:0,failedCommandIndex:scenario==='partial-read'?0:-1,error:'Batas waktu login CLI vendor terlampaui',outputs:[]};}mutationBatches++;}return response(request.commands,f.model);
  }}},persist:async job=>{if(blocked&&scenario==='permission-changed'&&job.message.startsWith('Memulihkan'))throw Error('Permission revoked');registration.record(f.device,job);}};
  const job=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,options);
  assert.equal(connections,scenario==='login-only'?2:1);assert.equal(mutationBatches,scenario==='login-only'?1:0);assert.equal(job.status,scenario==='login-only'?'verified':'held');
 }
});
test('a second manual registration is rejected before acknowledgement rather than silently lost behind an active job',async()=>{
 const f=await seeded(),input={kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber},first=await registration.prepare(f.data,f.device,f.actor,input,f.options),second=await registration.prepare(f.data,f.device,f.actor,input,f.options);let unblock,calls=0;
 const gate=new Promise(resolve=>{unblock=resolve;}),options={...f.options,transportOptions:{transports:{commands:async({commands})=>{calls++;await gate;return response(commands,f.model);}}},persist:async job=>registration.record(f.device,job)},confirm=plan=>({token:plan.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:f.model.onu.serialNumber,confirmImpact:true});
 const running=registration.executeManual(f.data,f.device,f.actor,confirm(first),options);
 assert.throws(()=>registration.executeManual(f.data,f.device,f.actor,confirm(second),options),error=>error.status===429);
 unblock();assert.equal((await running).status,'verified');const before=calls;assert.throws(()=>registration.executeManual(f.data,f.device,f.actor,confirm(second),options),/berubah/);assert.equal(calls,before);
});
