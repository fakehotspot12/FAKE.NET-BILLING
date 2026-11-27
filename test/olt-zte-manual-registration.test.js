'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const registration=require('../src/olt-zte-registration'),pnp=require('../src/olt-zte-pnp');
const {fixture,response,reply,key}=require('./helpers/olt-registration-fixture');
const manualConfig={vlans:[101,102],bandwidthMode:'auto60',onuType:'',tr069:{enabled:false,acsUrl:''}};
function seeded(){const f=fixture(),commands=[];return{...f,commands,options:{explicitDevAccess:true,transportOptions:{transports:{commands:async input=>{commands.push(...input.commands);return response(input.commands,f.model);}}},persist:async job=>registration.record(f.device,job)}};}
function confirmation(f,plan){return{token:plan.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:f.model.onu.serialNumber,confirmImpact:true};}
test('manual authorization without any PON preset uses only the confirmed per-ONU VLANs and cannot take a client-supplied position',async()=>{
 const f=seeded(),before=structuredClone(f.data),plan=await registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber,manualConfig},f.options);
 assert.deepEqual(plan.value.vlans,[101,102]);assert.equal(f.model.registered,false);assert.deepEqual(pnp.presets(f.device),{});
 const job=await registration.executeManual(f.data,f.device,f.actor,{...confirmation(f,plan),address:'1/1/1:99',manualConfig:{...manualConfig,vlans:[100]}},f.options);
 assert.equal(job.status,'verified',job.message);assert.equal(job.address,'1/1/13:1');assert.deepEqual(f.model.onu.services.map(row=>row.vlan),[101,102]);assert.deepEqual(pnp.presets(f.device),{});assert.deepEqual(f.data.customers,before.customers);assert.deepEqual(f.data.settings,before.settings);assert.deepEqual(registration.publicJob(job).manualConfig,manualConfig);
 assert.throws(()=>registration.executeManual(f.data,f.device,f.actor,confirmation(f,plan),f.options),/sudah diproses/);
});
test('per-ONU overrides leave existing PON presets and automatic settings byte-identical',async()=>{
 const f=seeded();await pnp.read(f.data,f.device,f.actor,key,f.options);pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100,101,102],bandwidthMode:'auto60',onuType:'',requestedEnabled:false,presetRevision:''});
 const before=JSON.stringify({presets:f.device.onuPnpPresets,automation:f.device.onuRegistration}),plan=await registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber,manualConfig},f.options),job=await registration.executeManual(f.data,f.device,f.actor,confirmation(f,plan),f.options);
 assert.equal(job.status,'verified',job.message);assert.equal(JSON.stringify({presets:f.device.onuPnpPresets,automation:f.device.onuRegistration}),before);assert.deepEqual(f.model.management.map(row=>row.vlan),[101,102]);
});
test('invalid per-ONU VLANs, type, bandwidth, TR069 and injected fields never reach a native mutation',async()=>{
 for(const patch of [{vlans:[]},{vlans:[100,100]},{vlans:[999]},{vlans:['100']},{onuType:'UNIT;reboot'},{bandwidthMode:'unlimited'},{bandwidthMode:'manual',bandwidth:'missing'},{vlans:[101],tr069:{enabled:true,acsUrl:'http://192.0.2.1:7547/'}},{address:'1/1/13:1'},{tr069:{enabled:true,acsUrl:'http://user:password@192.0.2.1:7547/'}}]){
  const f=seeded();await assert.rejects(registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber,manualConfig:{...manualConfig,...patch}},f.options));assert(!f.commands.some(command=>command==='configure terminal'));assert.equal(f.model.registered,false);
 }
});
test('a PON that becomes automatic cannot also accept a previously prepared manual confirmation',async()=>{
 const f=seeded();await pnp.read(f.data,f.device,f.actor,key,f.options);pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100,101,102],bandwidthMode:'auto60',onuType:'',presetRevision:''});
 const manual=await registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber,manualConfig},f.options),auto=await registration.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},f.options);
 registration.activate(f.data,f.device,f.actor,{...confirmation(f,auto),confirmTarget:key});const count=f.commands.length;
 assert.throws(()=>registration.executeManual(f.data,f.device,f.actor,confirmation(f,manual),f.options),/otomatis/);await assert.rejects(registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber,manualConfig},f.options),/otomatis/);assert.equal(f.commands.length,count);assert.equal(f.model.registered,false);
});
test('discovery GET is cache-only, refresh coalesces and pages at eight without reading profiles or another PON',async()=>{
 const f=seeded(),before=structuredClone(f.data);assert.equal(registration.discoveryPage(f.data,f.device,f.actor).checkedAt,'');assert.equal(f.commands.length,0);
 const text='OltIndex Model SN PW\n'+Array.from({length:19},(_,i)=>'gpon-olt_1/1/'+(i<10?'1':'13')+' HG-SAMPLE HWTC'+i.toString(16).padStart(8,'0').toUpperCase()+' N/A').join('\n');let reads=0;
 const options={...f.options,transportOptions:{transports:{commands:async({commands})=>{reads++;assert.deepEqual(commands,['enable','terminal length 0','show pon onu uncfg']);return{success:true,outputs:commands.map(command=>({command,stdout:command==='show pon onu uncfg'?text:'OLT#'}))};}}}};
 await Promise.all([registration.refreshDiscovery(f.data,f.device,f.actor,options),registration.refreshDiscovery(f.data,f.device,f.actor,options)]);assert.equal(reads,1);
 const all=registration.discoveryPage(f.data,f.device,f.actor),next=registration.discoveryPage(f.data,f.device,f.actor,{page:2}),last=registration.discoveryPage(f.data,f.device,f.actor,{page:3}),filtered=registration.discoveryPage(f.data,f.device,f.actor,{pon:'1/1/13'});
 assert.equal(all.total,19);assert.equal(all.onus.length,8);assert.equal(next.onus.length,8);assert.equal(last.onus.length,3);assert.equal(filtered.total,9);assert(all.onus.every(row=>row.canAuthorize));assert.equal(reads,1);assert.deepEqual(f.data,before);
});
test('duplicate SN cannot expose an enabled manual authorization button',async()=>{
 const f=seeded(),serial=f.model.onu.serialNumber,text=`OltIndex Model SN PW\ngpon-olt_1/1/1 UNIT ${serial} N/A\ngpon-olt_1/1/13 UNIT ${serial} N/A`,options={...f.options,transportOptions:{transports:{commands:async({commands})=>({success:true,outputs:commands.map(command=>({command,stdout:command==='show pon onu uncfg'?text:'OLT#'}))})}}};
 await registration.refreshDiscovery(f.data,f.device,f.actor,options);const page=registration.discoveryPage(f.data,f.device,f.actor);assert.equal(page.total,2);assert(page.onus.every(row=>row.ambiguous&&!row.canAuthorize));
});
test('discovery blocks in-progress and verified SNs without additional router reads',async()=>{
 const f=seeded();await registration.refreshDiscovery(f.data,f.device,f.actor,f.options);const count=f.commands.length;
 for(const status of ['registering','configuring','checking','verified']){registration.record(f.device,{id:'unit',ponKey:key,serialNumber:f.model.onu.serialNumber,status});const row=registration.discoveryPage(f.data,f.device,f.actor).onus[0];assert.equal(row.canAuthorize,false);assert.equal(row.processing,status!=='verified');}
 assert.equal(f.commands.length,count);
});
test('native preflight, mode and readback grants preserve confirmed manual VLANs without a shared preset',async()=>{
 const f=seeded(),[,context,transport]=await require('../src/olt-vendors').loadLibrary();let state=await registration.readState(f.data,f.device,key,f.options),config=registration.selection(f.device,state,key,manualConfig);
 for(const phase of ['setup','register','services']){
  if(phase==='register'){state=await registration.readState(f.data,f.device,key,f.options);config=registration.registerPlan(state,registration.selection(f.device,state,key,manualConfig),f.model.onu.serialNumber,f.device);}
  const spec={phase,device:f.device,state,value:config,...(phase==='services'?{offset:0,end:2}:{})},commands=registration.phaseCommands(spec),result=await context.withContext(f.data,f.device,()=>{context.authorizeRegistrationOperation(spec);context.current().registrationGrant.used=true;return transport.shellSession({olt:require('../src/olt-vendors').legacyDevice(f.device),password:'unit',commands,timeoutMs:3000},({ready})=>{const stream=new PassThrough();stream.write=chunk=>{const value=reply(String(chunk).trim(),f.model);queueMicrotask(()=>stream.emit('data',value));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{registrationActionAllowed:true});assert.equal(result.success,true,result.error);assert.equal(result.verified,true);assert.equal(result.submitted,true);
 }
 assert.deepEqual(f.model.onu.services.map(row=>row.vlan),manualConfig.vlans);assert.deepEqual(pnp.presets(f.device),{});
});
test('held manual continuation retains the exact override and cannot silently switch to different VLANs',async()=>{
 const f=seeded();let failed=false;const config={...manualConfig,vlans:[100,101,102]},options={...f.options,transportOptions:{transports:{commands:async input=>{f.commands.push(...input.commands);if(!failed&&input.commands.some(command=>command.startsWith('service-port 3 '))){failed=true;return{success:false,submitted:false,outputs:[]};}return response(input.commands,f.model);}}}};
 const first=await registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber,manualConfig:config},options),held=await registration.executeManual(f.data,f.device,f.actor,confirmation(f,first),options);assert.equal(held.status,'held');assert.equal(f.model.onu.services.length,2);
 await assert.rejects(registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber,manualConfig},options),/Preset/);
 const plan=await registration.prepare(f.data,f.device,f.actor,{kind:'manual',ponKey:key,serialNumber:f.model.onu.serialNumber},options),job=await registration.executeManual(f.data,f.device,f.actor,confirmation(f,plan),options);assert.equal(job.status,'verified',job.message);assert.deepEqual(f.model.onu.services.map(row=>row.vlan),config.vlans);assert.equal(f.commands.filter(command=>/^onu \d/.test(command)).length,1);assert.deepEqual(pnp.presets(f.device),{});
});
async function interruptedAutomatic(){
 const f=seeded();await pnp.read(f.data,f.device,f.actor,key,f.options);pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100,101,102],bandwidthMode:'auto60',onuType:'',presetRevision:''});
 const plan=await registration.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},f.options);registration.activate(f.data,f.device,f.actor,{...confirmation(f,plan),confirmTarget:key});let failed=false;
 const options={...f.options,transportOptions:{transports:{commands:async input=>{f.commands.push(...input.commands);if(!failed&&f.model.registered&&!input.commands.includes('configure terminal')&&input.commands.some(command=>command.startsWith('show gpon remote-onu capability '))){failed=true;throw Object.assign(Error('Batas waktu antrean OLT tercapai'),{status:429});}return response(input.commands,f.model);}}}};
 const held=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,{...options,automatic:true});assert.equal(held.status,'held');assert.equal(f.model.registered,true);assert.equal(f.model.onu.services.length,0);return{...f,options,held};
}
test('a registered automatic ONU held by a read timeout can resume VLANs without disabling automation or registering its SN again',async()=>{
 const f=await interruptedAutomatic(),before=JSON.stringify({presets:f.device.onuPnpPresets,automation:f.device.onuRegistration}),plan=await registration.prepare(f.data,f.device,f.actor,{kind:'resume',ponKey:key,serialNumber:f.model.onu.serialNumber},f.options);
 assert.equal(plan.kind,'resume');assert.equal(plan.value.resumeJobId,f.held.id);assert.deepEqual(plan.value.vlans,[100,101,102]);const job=await registration.executeManual(f.data,f.device,f.actor,confirmation(f,plan),f.options);
 assert.equal(job.status,'verified',job.message);assert.equal(job.automatic,true);assert.deepEqual(f.model.onu.services.map(row=>row.vlan),[100,101,102]);assert.deepEqual(f.model.management.map(row=>row.vlan),[100,101,102]);assert.equal(f.commands.filter(command=>/^onu \d/.test(command)).length,1);assert.equal(JSON.stringify({presets:f.device.onuPnpPresets,automation:f.device.onuRegistration}),before);
 assert.throws(()=>registration.executeManual(f.data,f.device,f.actor,confirmation(f,plan),f.options),/sudah diproses/);
});
test('continuation cannot introduce per-ONU overrides or resume an absent, changed, or completed job',async()=>{
 const f=await interruptedAutomatic(),start=f.commands.length;
 await assert.rejects(registration.prepare(f.data,f.device,f.actor,{kind:'resume',ponKey:key,serialNumber:f.model.onu.serialNumber,manualConfig},f.options),/tidak dapat diganti/);
 await assert.rejects(registration.prepare(f.data,f.device,f.actor,{kind:'resume',ponKey:key,serialNumber:'HWTC11223344'},f.options),/proses registrasi tertahan/);assert.equal(f.commands.length,start);
 const plan=await registration.prepare(f.data,f.device,f.actor,{kind:'resume',ponKey:key,serialNumber:f.model.onu.serialNumber},f.options),count=f.commands.length;registration.record(f.device,{...f.held,id:'new-held-job'});
 assert.throws(()=>registration.executeManual(f.data,f.device,f.actor,confirmation(f,plan),f.options),/Proses ONU sudah berubah/);assert.equal(f.commands.length,count);
 registration.record(f.device,{...f.held,id:'completed-job',status:'verified'});await assert.rejects(registration.prepare(f.data,f.device,f.actor,{kind:'resume',ponKey:key,serialNumber:f.model.onu.serialNumber},f.options),/proses registrasi tertahan/);
});
test('unexpected existing VLAN resources stop automatic continuation before any configuration command',async()=>{
 const f=await interruptedAutomatic(),count=f.commands.length;f.model.onu.services.push({id:1,gem:1,userVlan:999,vlan:999});
 await assert.rejects(registration.prepare(f.data,f.device,f.actor,{kind:'resume',ponKey:key,serialNumber:f.model.onu.serialNumber},f.options),/Alokasi|Layanan|GEM/);assert(!f.commands.slice(count).includes('configure terminal'));assert.equal(f.model.onu.services[0].vlan,999);
});
test('continuation compares persisted configuration values independently of JSONB object key order',async()=>{
 const f=await interruptedAutomatic(),reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().reverse().map(key=>[key,reorder(value[key])])):value;
 registration.record(f.device,{...f.held,value:JSON.parse(JSON.stringify(reorder(f.held.value)))});
 const plan=await registration.prepare(f.data,f.device,f.actor,{kind:'resume',ponKey:key,serialNumber:f.model.onu.serialNumber},f.options),job=await registration.executeManual(f.data,f.device,f.actor,confirmation(f,plan),f.options);assert.equal(job.status,'verified',job.message);assert.deepEqual(f.model.onu.services.map(row=>row.vlan),[100,101,102]);assert.equal(f.commands.filter(command=>/^onu \d/.test(command)).length,1);
});
test('canonical configuration comparison still rejects changed bandwidth values before continuation',async()=>{
 const f=await interruptedAutomatic(),changed=structuredClone(f.held);changed.value.policy.profiles[0].maximum=120000;registration.record(f.device,changed);const count=f.commands.length;
 await assert.rejects(registration.prepare(f.data,f.device,f.actor,{kind:'resume',ponKey:key,serialNumber:f.model.onu.serialNumber},f.options),/Preset atau profil/);assert(!f.commands.slice(count).includes('configure terminal'));assert.equal(f.model.onu.services.length,0);
});
