'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const reg=require('../src/olt-zte-registration'),pnp=require('../src/olt-zte-pnp'),driver=require('../src/olt-zte-onu'),vendors=require('../src/olt-vendors');
const base=require('./helpers/olt-registration-fixture'),key=base.key,old='1/1/8:7',other='HWTC11223344';
async function moved(t,scenario='success'){
 const f=base.fixture(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'onu-relocation-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const model=f.model,serial=model.onu.serialNumber,oldModel={present:true,online:false,otherSn:other},sent=[];let deletes=0,registrations=0,persisted=[];
 const oldReply=command=>{
  if(command==='show gpon onu by sn '+serial&&oldModel.present)return'gpon-onu_'+old+'\nOLT#';
  if(command==='show gpon onu detail-info gpon-onu_'+old)return`ONU interface: gpon-onu_${old}\nSerial number: ${scenario==='wrong-serial'?other:serial}\nPhase state: ${oldModel.online?'working':scenario==='unknown'?'unknown':'OffLine'}\nOLT#`;
  if(command==='show gpon onu baseinfo gpon-olt_1/1/8')return`OnuIndex Type Mode AuthInfo State\n${oldModel.present?`gpon-onu_${old} OLD sn SN:${serial} ready\n`:''}gpon-onu_1/1/8:9 OLD sn SN:${oldModel.otherSn} ready\nOLT#`;
  if(command==='show gpon onu state gpon-olt_1/1/8')return`OnuIndex Admin State OMCC State Phase State Channel\n${oldModel.present?`${old} enable ${oldModel.online?'enable working':'disable OffLine'} 1(GPON)\n`:''}1/1/8:9 enable enable working 1(GPON)\nONU Number: ${oldModel.online?2:1}/${oldModel.present?2:1}\nOLT#`;
  if(command==='show running-config interface gpon-onu_'+old)return`interface gpon-onu_${old}\n tcont 1 profile OLD\n!\nend\nOLT#`;
  if(command==='show onu running config gpon-onu_'+old)return`pon-onu-mng gpon-onu_${old}\n service OLD gemport 1 vlan 101\n password unit-backup-secret\n!\nOLT#`;
  if(command==='interface gpon-olt_1/1/8')return'OLT(config-if)#';
  if(command==='no onu 7'){deletes++;oldModel.present=false;if(scenario==='changed-other')oldModel.otherSn='HWTC55667788';return'OLT(config-if)#';}
  return null;
 };
 const options={explicitDevAccess:true,relocationBackupDir:directory,transportOptions:{transports:{commands:async({commands})=>{
  const context=(await vendors.loadLibrary())[1].current(),grant=context.registrationGrant||context.zteOnuGrant,outputs=[];
  for(let index=0;index<commands.length;index++){
   const command=commands[index];sent.push(command);
   if(grant&&(context.registrationGrant?index>=grant.mutationStart&&index<grant.mutationEnd:index===grant.mutationIndex))grant.submitted=true;
   if(/^onu \d/.test(command))registrations++;
   let stdout=oldReply(command);if(stdout===null)stdout=base.reply(command,model);
   if(command==='show pon onu uncfg'&&scenario==='moved-again'&&persisted.some(x=>x.relocation?.status==='prepared'))stdout=stdout.replaceAll('gpon-olt_'+key,'gpon-olt_1/1/12');
   outputs.push({command,stdout});
   try{if(context.registrationGrant)reg.verifyStep(outputs,grant,index,stdout);else if(context.zteOnuGrant)driver.verifyStep(outputs,grant,index,stdout);}catch(error){return{success:false,submitted:grant.submitted===true,verified:false,outputs,error:error.message,completedCommands:outputs.length,failedCommandIndex:index};}
  }
  return{success:true,submitted:grant?.submitted===true,verified:grant?.verified===true,outputs};
 }}}};
 await pnp.read(f.data,f.device,f.actor,key,options);pnp.savePreset(f.data,f.device,f.actor,{ponKey:key,vlanMode:'selected',vlans:[100,101,102],bandwidthMode:'auto60',onuType:'',requestedEnabled:true,presetRevision:''});
 if(scenario==='online')oldModel.online=true;
 if(scenario==='backup-failure'){await fs.writeFile(path.join(directory,'not-directory'),'x');options.relocationBackupDir=path.join(directory,'not-directory');}
 options.persist=async job=>{persisted.push(structuredClone(job));if(job.relocation?.status==='prepared'){
  if(scenario==='became-online')oldModel.online=true;
  if(scenario==='other-changed-before')oldModel.otherSn='HWTC55667788';
  if(scenario==='permission-changed')throw Error('Permission revoked');
 }reg.record(f.device,job);};
 return{...f,options,directory,serial,sent,oldModel,counts:()=>({deletes,registrations}),persisted};
}
test('automatic relocation removes only the exact offline old registration, preserves encrypted recovery data, and verifies all new VLANs',async t=>{
 const f=await moved(t),customerBefore=JSON.stringify([f.data.customers,f.data.radiusUsers]);
 const job=await reg.processJob(f.data,f.device,f.actor,key,f.serial,{...f.options,automatic:true});
 assert.equal(job.status,'verified',job.message);assert.deepEqual(f.counts(),{deletes:1,registrations:1});assert.equal(job.relocation.oldAddress,old);assert.equal(job.relocation.status,'verified');assert.equal(f.oldModel.otherSn,other);assert.equal(JSON.stringify([f.data.customers,f.data.radiusUsers]),customerBefore);
 assert.deepEqual(f.model.onu.services.map(x=>x.vlan),[100,101,102]);
 const files=await fs.readdir(f.directory);assert.equal(files.length,1);const file=path.join(f.directory,files[0]),text=await fs.readFile(file,'utf8');assert(!text.includes('unit-backup-secret'));assert(!text.includes(f.serial));assert.equal((await fs.stat(file)).mode&0o777,0o600);
 const restored=JSON.parse(require('../src/secure-secrets').decryptSecret(f.data,JSON.parse(text).payload));assert.equal(restored.serialNumber,f.serial);assert.equal(restored.oldAddress,old);assert(restored.raw.outputs.some(x=>x.stdout.includes('unit-backup-secret')));
 const safe=reg.publicJob(job);assert.equal(safe.relocation.oldAddress,old);assert(!Object.hasOwn(safe.relocation,'backupId'));assert(!JSON.stringify(safe).includes('unit-backup-secret'));
});
for(const scenario of['online','unknown','became-online','backup-failure','permission-changed','moved-again','other-changed-before','wrong-serial'])test('automatic relocation holds '+scenario+' without deleting either ONU or registering on top of it',async t=>{
 const f=await moved(t,scenario),job=await reg.processJob(f.data,f.device,f.actor,key,f.serial,{...f.options,automatic:true});
 assert.equal(job.status,'held');assert.deepEqual(f.counts(),{deletes:0,registrations:0});assert(f.oldModel.present);assert(!f.model.registered);
});
test('an uncertain relocation never continues registration or replays an old-position deletion',async t=>{
 const f=await moved(t,'changed-other'),job=await reg.processJob(f.data,f.device,f.actor,key,f.serial,{...f.options,automatic:true});
 assert.equal(job.status,'held');assert.equal(job.diagnostic.phase,'relocation');assert.equal(job.diagnostic.submitted,true);assert.deepEqual(f.counts(),{deletes:1,registrations:0});await assert.rejects(reg.processJob(f.data,f.device,f.actor,key,f.serial,{...f.options,automatic:true,retryUnsentId:job.id}));assert.equal(f.counts().deletes,1);
});
test('manual registration cannot silently delete an old registration',async t=>{
 const f=await moved(t),job=await reg.processJob(f.data,f.device,f.actor,key,f.serial,f.options);assert.equal(job.status,'held');assert.deepEqual(f.counts(),{deletes:0,registrations:0});assert.deepEqual(await fs.readdir(f.directory),[]);
});
test('a proven read-only old-online hold may retry only after cooldown, then move once the old ONU is offline',async t=>{
 const f=await moved(t,'online'),plan=await reg.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},f.options);reg.activate(f.data,f.device,f.actor,{token:plan.token,revision:plan.revision,confirmId:f.device.id,confirmTarget:key,confirmImpact:true});
 const held=await reg.processJob(f.data,f.device,f.actor,key,f.serial,{...f.options,automatic:true});assert.equal(held.diagnostic.submitted,false);assert.equal(held.diagnostic.retryableRead,true);
 f.device.onuRegistrationJobs.at(-1).updatedAt=new Date(Date.now()-120001).toISOString();f.oldModel.online=false;
 assert.equal((await reg.tick(f.data,{...f.options,persist:async(device,job)=>reg.record(device,job)})).processed,1);assert.equal(reg.jobs(f.device).at(-1).status,'verified');assert.deepEqual(f.counts(),{deletes:1,registrations:1});
});
test('a previous success on the destination PON does not block a fresh physical return from another PON',async t=>{
 const f=await moved(t),plan=await reg.prepare(f.data,f.device,f.actor,{kind:'automation',ponKey:key,enabled:true},f.options);reg.activate(f.data,f.device,f.actor,{token:plan.token,revision:plan.revision,confirmId:f.device.id,confirmTarget:key,confirmImpact:true});
 reg.record(f.device,{id:'older-success',serialNumber:f.serial,ponKey:key,status:'verified'});f.device.onuRegistrationJobs.at(-1).updatedAt=new Date(Date.now()-180000).toISOString();
 reg.record(f.device,{id:'moved-out-success',serialNumber:f.serial,ponKey:'1/1/8',status:'verified'});
 assert.equal((await reg.tick(f.data,{...f.options,persist:async(device,job)=>reg.record(device,job)})).processed,1);assert.equal(reg.jobs(f.device).at(-1).status,'verified');assert.deepEqual(f.counts(),{deletes:1,registrations:1});
});
