'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const catalogue=require('../src/olt-zte-catalogue'),bandwidth=require('../src/olt-zte-bandwidth'),pnp=require('../src/olt-zte-pnp'),registration=require('../src/olt-zte-registration');
const {fixture,response,key}=require('./helpers/olt-registration-fixture');
async function seed(){const f=fixture(),calls=[],options={explicitDevAccess:true,transportOptions:{transports:{commands:async request=>{calls.push(request.commands);return response(request.commands,f.model);}}}};await catalogue.read(f.data,f.device,f.actor,options);await pnp.read(f.data,f.device,f.actor,key,options);return{...f,options,calls};}
const save=(f,input)=>catalogue.save(f.data,f.device,f.actor,{action:'save',revision:catalogue.metadata(f.device).revision,...input});
test('catalogue shows native counts and scoped data using cached reads only',async()=>{
 const f=await seed(),count=f.calls.length,before=structuredClone(f.data.customers),result=catalogue.view(f.data,f.device);assert.deepEqual(result.counts,{vlans:4,upload:2,download:1,models:1});assert.equal(result.vlans.length,4);assert.equal(result.templates[0].name,'UNIT');assert.equal(f.calls.length,count);assert(!JSON.stringify(result).includes('cliPasswordEnc'));assert.deepEqual(f.data.customers,before);
});
test('VLAN descriptions are persistent metadata without changing native VLANs or any customer record',async()=>{
 const f=await seed(),before=structuredClone(f.model),customers=structuredClone(f.data.customers);save(f,{kind:'vlan',id:100,label:'Manajemen',purpose:'management',notes:'Akses modem'});assert.equal(catalogue.view(f.data,f.device).vlans.find(row=>row.id===100).purpose,'management');assert.equal(catalogue.metadata(JSON.parse(JSON.stringify(f.device))).vlans[0].label,'Manajemen');assert.deepEqual(f.model,before);assert.deepEqual(f.data.customers,customers);
 for(const input of[{id:999},{label:'<script>'},{purpose:'bad'}])assert.throws(()=>save(f,{kind:'vlan',id:100,label:'Unit',purpose:'internet',...input}));
 assert.throws(()=>catalogue.save(f.data,f.device,f.actor,{action:'delete',kind:'vlan',id:100,revision:catalogue.metadata(f.device).revision}));
});
test('profile catalogue supports asymmetric reusable best-effort pairs without reserving bandwidth or mutating existing profiles',async()=>{
 const f=await seed(),before=structuredClone(f.model),result=save(f,{kind:'profile',label:'Unit 5/10',uploadKbps:5000,downloadKbps:10000}),profile=result.item;
 const policy=catalogue.policyFor(f.device,f.model.catalogue,profile.id);assert.equal(policy.profiles[0].maximum,5000);assert.equal(policy.profiles[0].fixed+policy.profiles[0].assured,0);assert.equal(policy.profiles[1].sir,0);assert.equal(policy.profiles[1].pir,10000);assert.equal(catalogue.view(f.data,f.device).profiles[0].prepared,false);assert.deepEqual(f.model,before);
 pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100],bandwidthMode:'catalogue',bandwidthPresetId:profile.id,onuType:'',presetRevision:''});assert.equal(registration.selection(f.device,{...f.model,onuTypes:[]},key).policy.profiles[1].pir,10000);
 assert.throws(()=>save(f,{kind:'profile',id:profile.id,label:'Changed',uploadKbps:20000,downloadKbps:20000}),/masih dipakai/);
 assert.throws(()=>catalogue.save(f.data,f.device,f.actor,{action:'delete',kind:'profile',id:profile.id,revision:catalogue.metadata(f.device).revision}),/masih dipakai/);
 save(f,{kind:'profile',id:profile.id,label:'Renamed',uploadKbps:5000,downloadKbps:10000});assert.equal(catalogue.profile(f.device,profile.id).label,'Renamed');
});
test('custom profile creation has the same finite grant, exact readback and no ONU/global/save mutations',async()=>{
 const f=await seed(),state=bandwidth.inspect(response(bandwidth.readCommands(),f.model)),before=structuredClone(f.model.onu),value=bandwidth.build(state,{kind:'custom',uploadKbps:5000,downloadKbps:10000}),grant=bandwidth.authorize(state,value),commands=grant.commands;
 assert(commands.includes('profile tcont FB-BE5-UP type 4 maximum 5000'));assert(commands.includes('profile traffic FB-BE10-DOWN sir 0 pir 10000'));assert(!commands.some(row=>/^interface |^onu |^no |^write$|^reboot$|^shutdown$/.test(row)));
 const raw=response(commands,f.model);bandwidth.verifyResult(raw,grant);assert.deepEqual(f.model.onu,before);assert(bandwidth.customPolicy(f.model.catalogue,5000,10000).profiles.every(row=>row.action==='reuse'));
 for(const rate of[0,'5000',5000.1,1000001,Infinity])assert.throws(()=>bandwidth.customPolicy(f.model.catalogue,rate,10000));
});
test('model mapping is exact and never guesses vendor, WiFi, or template from serial prefix',async()=>{
 const f=await seed(),state={onuTypes:[{name:'HUAWEI-5G',tcont:8,gem:32},{name:'HG-SAMPLE',tcont:8,gem:32}]};assert.equal(catalogue.resolveType(f.device,state,'Other Huawei Device'),'FB-GPON-AUTO');assert.equal(catalogue.resolveType(f.device,state,'HG-SAMPLE'),'HG-SAMPLE');
 const mapped=save(f,{kind:'model',label:'Unit Model',vendor:'Huawei',template:'UNIT',aliases:['HG-SAMPLE'],wifi:'dual',radioVerified:true});assert.equal(catalogue.resolveType(f.device,{onuTypes:[{name:'UNIT',tcont:8,gem:32}]},'hg-sample'),'UNIT');assert.equal(catalogue.resolveType(f.device,state,'N/A'),'FB-GPON-AUTO');
 assert.throws(()=>save(f,{kind:'model',label:'Duplicate',vendor:'RTK',template:'UNIT',aliases:['HG-SAMPLE'],wifi:'unknown'}),/sudah dipetakan/);
 assert.throws(()=>save(f,{kind:'model',id:mapped.item.id,label:'Unsafe radio',vendor:'Huawei',template:'UNIT',aliases:['HG-SAMPLE'],wifi:'dual',radioVerified:false}),/Konfirmasi/);
 assert.throws(()=>save(f,{kind:'model',label:'Unsafe',vendor:'ZTE',template:'UNIT;reboot',aliases:['HG-SAMPLE'],wifi:'unknown'}));
});
test('automatic registration selects a mapped template for the discovered physical model, without operator ONU/type input',async()=>{
 const f=await seed();save(f,{kind:'model',label:'Unit Model',vendor:'Huawei',template:'UNIT',aliases:['HG-SAMPLE'],wifi:'dual',radioVerified:true});
 pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100,101,102],bandwidthMode:'auto60',onuType:'',presetRevision:''});
 const job=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,{...f.options,persist:async row=>registration.record(f.device,row)});assert.equal(job.status,'verified',job.message);assert.equal(job.type,'UNIT');assert.equal(job.model,'HG-SAMPLE');assert.equal(f.model.onu.type,'UNIT');assert.equal(f.calls.flat().filter(row=>/^onu \d/.test(row)).length,1);
 const projected=catalogue.identifyOnus(f.data,f.device,[{id:job.address,serialNumber:job.serialNumber,model:'HUAWEI-5G',modelSource:'zte-configured-type'}])[0];assert.equal(projected.physicalModel,'HG-SAMPLE');assert.equal(projected.wifiCapability.label,'2,4 GHz + 5 GHz');
 const unknown=catalogue.identifyOnus(f.data,f.device,[{id:'1/1/1:2',serialNumber:'HWTC11223344',model:'HUAWEI-5G',modelSource:'zte-configured-type'}])[0];assert.equal(unknown.wifiCapability,null);
});
test('registration with a custom catalogue profile applies selected rates, not the old 60M default',async()=>{
 const f=await seed(),profile=save(f,{kind:'profile',label:'Unit 5/10',uploadKbps:5000,downloadKbps:10000}).item;
 pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100,101,102],bandwidthMode:'catalogue',bandwidthPresetId:profile.id,onuType:'',presetRevision:''});
 const job=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,{...f.options,persist:async row=>registration.record(f.device,row)});assert.equal(job.status,'verified',job.message);assert.equal(f.model.onu.tcont[0].profile,'FB-BE5-UP');assert(f.model.onu.gems.every(row=>row.downstream==='FB-BE10-DOWN'));
});
test('metadata revisions, ownership and model edits invalidate stale confirmations before writing',async()=>{
 const f=await seed(),planInput={kind:'vlan',id:100,label:'Unit',purpose:'internet',revision:''};save(f,planInput);assert.throws(()=>catalogue.save(f.data,f.device,f.actor,planInput),/sudah berubah/);f.actor.role='finance';assert.throws(()=>save(f,{kind:'vlan',id:100,label:'Unit',purpose:'internet'}),/izin/);f.actor.role='admin';
 pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100],bandwidthMode:'auto60',onuType:'',presetRevision:''});const plan=await registration.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},f.options);
 save(f,{kind:'model',label:'Unit Model',vendor:'Huawei',template:'UNIT',aliases:['HG-SAMPLE'],wifi:'unknown'});
 assert.throws(()=>registration.activate(f.data,f.device,f.actor,{token:plan.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:key,confirmImpact:true}));
 const other={...f.device,host:'192.0.2.99'};assert.equal(catalogue.metadata(other).revision,'');assert.deepEqual(catalogue.metadata(other).models,[]);
});
test('catalogue rejects forged checkbox values without partially saving metadata',async()=>{
 const f=await seed(),before=catalogue.metadata(f.device);
 for(const input of[{kind:'profile',label:'Unit',uploadKbps:5000,downloadKbps:5000,enabled:'false'},{kind:'model',label:'Unit',vendor:'Huawei',template:'UNIT',aliases:['HG-SAMPLE'],wifi:'dual',radioVerified:'true'}])assert.throws(()=>save(f,input),/aktif\/nonaktif/);
 assert.deepEqual(catalogue.metadata(f.device),before);
});
test('catalogue and PON preset changes are blocked throughout a registration, including gaps between CLI phases',async()=>{
 const f=await seed();pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100,101,102],bandwidthMode:'auto60',onuType:'',presetRevision:''});const revision=pnp.presets(f.device)[key].revision;
 let guarded=0;const job=await registration.processJob(f.data,f.device,f.actor,key,f.model.onu.serialNumber,{...f.options,persist:async row=>{
  assert.throws(()=>save(f,{kind:'vlan',id:100,label:'Changed',purpose:'internet'}),/Tunggu proses/);
  assert.throws(()=>pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100],bandwidthMode:'auto60',onuType:'',presetRevision:revision}),/Tunggu proses/);
  guarded++;registration.record(f.device,row);
 }});assert.equal(job.status,'verified',job.message);assert(guarded>=5);assert.equal(pnp.presets(f.device)[key].revision,revision);
 save(f,{kind:'vlan',id:100,label:'Safe after completion',purpose:'internet'});assert.equal(catalogue.metadata(f.device).vlans[0].label,'Safe after completion');
});
test('verified custom profile creation updates the cached catalogue without a second OLT query',async()=>{
 const f=await seed(),managed=save(f,{kind:'profile',label:'Unit 5/10',uploadKbps:5000,downloadKbps:10000}).item;
 const plan=await bandwidth.prepare(f.data,f.device,f.actor,{kind:'custom',uploadKbps:5000,downloadKbps:10000},f.options);
 const result=await bandwidth.execute(f.data,f.device,f.actor,{token:plan.token,revision:f.device.updatedAt||'',confirmId:f.device.id,confirmTarget:'5000/10000',confirmImpact:true},{...f.options,beforeSend:async()=>{},afterSend:async()=>{}});
 assert(result.verified);const count=f.calls.length,row=catalogue.view(f.data,f.device).profiles.find(row=>row.id===managed.id);assert(row.prepared);assert.equal(f.calls.length,count);assert.equal(catalogue.view(f.data,f.device).counts.upload,3);
});
test('conflicting model history is held rather than silently choosing a vendor template or falling back',async()=>{
 const f=await seed(),signature=catalogue.connection(f.device);f.device.onuRegistrationJobs=[{connection:signature,status:'verified',presetRevision:'one',model:'HG-SAMPLE',type:'HUAWEI-5G'},{connection:signature,status:'verified',presetRevision:'two',model:'HG-SAMPLE',type:'RTK-2G'}];
 assert.throws(()=>catalogue.resolveType(f.device,{onuTypes:[]},'HG-SAMPLE'),/beberapa template/);
 assert.equal(catalogue.resolveType(f.device,{onuTypes:[]},'Unknown'),'FB-GPON-AUTO');
});
