'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pon=require('../src/olt-pon'),vendors=require('../src/olt-vendors'),auth=require('../src/auth'),monitor=require('../src/olt-monitor'),planned=require('../src/olt-planned-reboot');
const{fixture,reply,config,ponKey}=require('./helpers/olt-pon-fixture');
process.env.MIGRATION_MODE='0';process.env.REDIS_CACHE='0';
const options=f=>({transports:{commands:async({commands})=>reply(commands,{...f.model})}});
const payload=(f,plan)=>({token:plan.token,revision:f.device.updatedAt,confirmId:f.device.id,confirmTarget:ponKey,confirmImpact:true,enabled:plan.enabled,confirmDisconnectOnline:true,confirmOnlineCount:plan.online});
test('PON administrative state is independent of empty/down optics and rejects incomplete or different interfaces',()=>{
 assert.equal(pon.configState(config(ponKey,true),ponKey),'enabled');assert.equal(pon.configState(config(ponKey,false),ponKey),'disabled');
 for(const text of[config('1/1/12',true),config(ponKey,true).replace('no shutdown',''),config(ponKey,true).replace('no shutdown','no shutdown\nshutdown'),config(ponKey,true).replace('!\nend','')])assert.throws(()=>pon.configState(text,ponKey));
 const f=fixture();Object.assign(f.model,{registered:0,online:0,unregistered:1});const state=pon.inspect(reply(pon.readCommands(ponKey),f.model),ponKey);assert.equal(state.adminState,'enabled');assert.equal(state.operState,'down');assert.equal(state.registered,0);assert.equal(state.unregistered,1);
});
test('preview counts registered, online and unregistered ONUs, binds identities and sends read commands only',async()=>{
 const f=fixture(),before=structuredClone(f.data),commands=[];const plan=await pon.prepare(f.data,f.device,f.actor,ponKey,{transports:{commands:async input=>{commands.push(...input.commands);return reply(input.commands,{...f.model});}}});
 assert.equal(plan.registered,1);assert.equal(plan.online,1);assert.equal(plan.unregistered,1);assert.equal(plan.enabled,false);assert.equal(plan.confirmTarget,ponKey);assert(commands.every(value=>value==='enable'||value==='terminal length 0'||value.startsWith('show ')));assert.deepEqual(f.data,before);
 const changed=pon.inspect(reply(pon.readCommands(ponKey),{...f.model,serial:'ZTEG11223344'}),ponKey);assert.notEqual(changed.proof,plan.proof);
 assert(!commands.includes('show gpon onu state'));assert(commands.includes('show gpon onu state gpon-olt_'+ponKey));
});
test('scoped PON status cannot silently include another port and a genuine empty-port diagnostic stays usable',()=>{
 const f=fixture(),value=reply(pon.readCommands(ponKey),{...f.model}),state=value.outputs.find(row=>row.command==='show gpon onu state gpon-olt_'+ponKey);state.stdout=state.stdout.replace('1/1/13:1','1/1/12:1');assert.throws(()=>pon.inspect(value,ponKey),/PON lain/);
 Object.assign(f.model,{registered:0,online:0});const empty=reply(pon.readCommands(ponKey),{...f.model});empty.outputs.find(row=>row.command==='show gpon onu state gpon-olt_'+ponKey).stdout='%Code 62310-GPONSRV : No related information to show.\nOLT#';assert.equal(pon.inspect(empty,ponKey).registered,0);
});
test('PON control role and NAS permissions exclude staff, finance and other NAS even with an OLT management role',async()=>{
 for(const role of['admin','owner','secretary','technician','noc','finance','collector','reseller_voucher']){const f=fixture();f.actor.role=role;assert.equal(pon.canManage(f.data,f.device,f.actor),['admin','secretary'].includes(role));}
 for(const role of['technician','noc']){const f=fixture();f.actor.role=role;f.actor.position='Kepala Teknisi dan Perlengkapan';assert(pon.canManage(f.data,f.device,f.actor));f.actor.lockedNasIds=['nas-b'];assert(!pon.canManage(f.data,f.device,f.actor));await assert.rejects(pon.prepare(f.data,f.device,f.actor,ponKey,options(f)));}
 const f=fixture();f.device.vendor='hioso';await assert.rejects(pon.prepare(f.data,f.device,f.actor,ponKey,options(f)),/belum terverifikasi/);
});
test('PON permission belongs only to admin, secretary and the actual head-technician role, not a supplied permission list or job title alone',()=>{
 for(const role of['owner','finance','collector','reseller_voucher','viewer','partner']){const f=fixture();Object.assign(f.actor,{role,position:'Kepala Teknisi',permissions:['olt:pon:manage']});assert(!pon.canManage(f.data,f.device,f.actor));}
 const f=fixture();Object.assign(f.actor,{role:'technician',position:'Staf Teknisi dan Perlengkapan',permissions:['olt:pon:manage']});assert(!pon.canManage(f.data,f.device,f.actor));assert.throws(()=>auth.updateOwnProfile(f.data,f.actor.id,{position:'Kepala Teknisi'}),/Jabatan hanya/);assert(!pon.canManage(f.data,f.device,f.actor));
 assert(auth.hasPermission(auth.publicUser({role:'owner'}),'olt:reboot'));
});
test('the same role gate applies to every vendor, and unverified vendor port control cannot be enabled by a forged capability',async()=>{
 for(const profile of vendors.PROFILES){const f=fixture();f.device.vendor=profile.value;f.actor.role='technician';assert(!pon.canManage(f.data,f.device,f.actor));f.actor.position='Kepala Teknisi';assert(pon.canManage(f.data,f.device,f.actor));const verified=['zte','cdata'].includes(profile.value);assert.equal(vendors.capabilities(f.device).ponControl,verified);if(!verified){f.device.ponControlAvailable=true;await assert.rejects(pon.prepare(f.data,f.device,f.actor,ponKey,options(f)),/belum terverifikasi/);}}
 for(const vendor of['constructor','__proto__','unknown'])assert.equal(pon.supports({vendor}),false);
});
test('disabling a PON with online ONUs requires an explicit consent for the exact displayed count before recording or sending',async()=>{
 const f=fixture(),plan=await pon.prepare(f.data,f.device,f.actor,ponKey,options(f));assert(plan.requiresOnlineConsent);let writes=0,markers=0;const opts={beforeSend:async()=>{markers++;return pon.begin(f.data,f.device,ponKey,false,f.actor);},afterSend:async(marker,value,enabled)=>pon.finish(f.data,marker,value,enabled),transportOptions:{transports:{commands:async({commands})=>{writes++;return reply(commands,f.model);}}}};
 for(const extra of[{confirmDisconnectOnline:false},{confirmOnlineCount:0},{confirmOnlineCount:'1'},{confirmDisconnectOnline:undefined}])await assert.rejects(pon.execute(f.data,f.device,f.actor,{...payload(f,plan),...extra},opts),/ONU online/);
 assert.equal(writes,0);assert.equal(markers,0);const result=await pon.execute(f.data,f.device,f.actor,payload(f,plan),opts);assert(result.verified);assert.equal(writes,1);
});
test('an ONU coming online after an offline preview changes the proof and prevents the shutdown command',async()=>{
 const{PassThrough}=require('node:stream'),f=fixture();f.model.online=0;const state=pon.inspect(reply(pon.readCommands(ponKey),{...f.model}),ponKey),[,context,transport]=await vendors.loadLibrary(),commands=pon.writeCommands(ponKey,false),writes=[];f.model.online=1;let index=0;
 const result=await context.withContext(f.data,f.device,()=>{context.authorizePonOperation({ponKey,enabled:false,proof:state.proof});context.current().ponGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(f.device),password:'unit',commands,timeoutMs:2000},({ready})=>{const stream=new PassThrough();stream.write=value=>{writes.push(value);const text=reply([commands[index++]],f.model).outputs[0].stdout;queueMicrotask(()=>stream.emit('data',text));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{ponActionAllowed:true});assert(!result.success);assert.equal(result.submitted,false);assert(!writes.includes('shutdown\n'));assert(!writes.includes('configure terminal\n'));
});
test('PON change persists maintenance before writing, verifies readback and repeated token cannot send twice',async()=>{
 const f=fixture(),plan=await pon.prepare(f.data,f.device,f.actor,ponKey,options(f));let written=0,marked=false;const opts={beforeSend:async(key,enabled)=>{assert.equal(key,ponKey);assert.equal(enabled,false);marked=true;return pon.begin(f.data,f.device,key,enabled,f.actor);},afterSend:async(marker,result,enabled)=>pon.finish(f.data,marker,result,enabled),transportOptions:{transports:{commands:async({commands})=>{assert(marked);written++;assert.deepEqual(commands,pon.writeCommands(ponKey,false));return reply(commands,f.model);}}}};
 const result=await pon.execute(f.data,f.device,f.actor,payload(f,plan),opts);assert(result.verified);assert(result.submitted);assert.equal(result.state.adminState,'disabled');assert.equal(f.data.settings.plannedPonChanges[0].state,'disabled');assert.equal(written,1);assert.deepEqual(await pon.execute(f.data,f.device,f.actor,payload(f,plan),opts),result);assert.equal(written,1);
});
test('tampered target, action, revision, identity or role are rejected before any maintenance or device write',async()=>{
 const f=fixture(),plan=await pon.prepare(f.data,f.device,f.actor,ponKey,options(f));let calls=0;const opts={beforeSend:async()=>{calls++;return{id:'never'};},afterSend:async()=>{}};
 for(const extra of[{confirmTarget:'1/1/12'},{confirmId:'other'},{enabled:true},{confirmImpact:false},{revision:'old'},{token:'bad'}])await assert.rejects(pon.execute(f.data,f.device,f.actor,{...payload(f,plan),...extra},opts));
 await assert.rejects(pon.execute(f.data,{...f.device,host:'192.0.2.91'},f.actor,payload(f,plan),opts));assert.equal(calls,0);f.actor.role='finance';await assert.rejects(pon.execute(f.data,f.device,f.actor,payload(f,plan),opts));
});
test('unverifiable delivery keeps a scoped marker and consumed token, but a known not-sent failure restores the previous marker',async()=>{
 for(const mode of['uncertain','not-sent']){const f=fixture(),plan=await pon.prepare(f.data,f.device,f.actor,ponKey,options(f));let sends=0;const opts={beforeSend:async()=>pon.begin(f.data,f.device,ponKey,false,f.actor),afterSend:async(marker,result,enabled)=>pon.finish(f.data,marker,result,enabled),transportOptions:{transports:{commands:async()=>{sends++;if(mode==='uncertain')throw Error('lost');return{success:false,submitted:false};}}}};const result=await pon.execute(f.data,f.device,f.actor,payload(f,plan),opts);assert.equal(result.uncertain,mode==='uncertain');assert.equal(f.data.settings.plannedPonChanges.length,mode==='uncertain'?1:0);await pon.execute(f.data,f.device,f.actor,payload(f,plan),opts);assert.equal(sends,1);}
});
test('one bounded reconnect is allowed only for a verified pre-command login timeout after permission revalidation',async()=>{
 const f=fixture();Object.assign(f.model,{enabled:false,online:0,registered:0,unregistered:0});const plan=await pon.prepare(f.data,f.device,f.actor,ponKey,options(f));let calls=0,validations=0,markers=0;
 const opts={beforeSend:async()=>{markers++;return pon.begin(f.data,f.device,ponKey,true,f.actor);},afterSend:async(marker,result,enabled)=>pon.finish(f.data,marker,result,enabled),validateBeforeRetry:async()=>{validations++;},transportOptions:{transports:{commands:async({commands})=>{calls++;return calls===1?{success:false,submitted:false,error:'Batas waktu login CLI vendor terlampaui',completedCommands:0,failedCommandIndex:-1,cliStage:'prompt'}:reply(commands,f.model);}}}};
 const result=await pon.execute(f.data,f.device,f.actor,payload(f,plan),opts);assert(result.verified);assert.equal(result.state.adminState,'enabled');assert.equal(result.connectionAttempts,2);assert.equal(calls,2);assert.equal(validations,1);assert.equal(markers,1);assert.equal(f.data.settings.plannedPonChanges[0].state,'recovering');await pon.execute(f.data,f.device,f.actor,payload(f,plan),opts);assert.equal(calls,2);
});
test('PON reconnect never repeats commands after partial preflight, action, unknown delivery or rejected credentials',async()=>{
 const base={success:false,submitted:false,error:'Batas waktu login CLI vendor terlampaui',completedCommands:0,failedCommandIndex:-1};
 for(const extra of[{completedCommands:1,failedCommandIndex:0},{failedCommandIndex:0},{submitted:true},{submitted:null},{error:'Login CLI vendor ditolak'},{error:'Batas waktu pembacaan vendor terlampaui'}]){const f=fixture(),plan=await pon.prepare(f.data,f.device,f.actor,ponKey,options(f));let calls=0,validations=0;const result=await pon.execute(f.data,f.device,f.actor,payload(f,plan),{beforeSend:async()=>pon.begin(f.data,f.device,ponKey,false,f.actor),afterSend:async(marker,result,enabled)=>pon.finish(f.data,marker,result,enabled),validateBeforeRetry:async()=>{validations++;},transportOptions:{transports:{commands:async()=>{calls++;return{...base,...extra};}}}});assert(!result.verified);assert.equal(calls,1);assert.equal(validations,0);}
});
test('permission revocation and repeated login timeout stop PON reconnect without sending any port action',async()=>{
 for(const revoked of[true,false]){const f=fixture(),plan=await pon.prepare(f.data,f.device,f.actor,ponKey,options(f));let calls=0,validations=0;const result=await pon.execute(f.data,f.device,f.actor,payload(f,plan),{beforeSend:async()=>pon.begin(f.data,f.device,ponKey,false,f.actor),afterSend:async(marker,result,enabled)=>pon.finish(f.data,marker,result,enabled),validateBeforeRetry:async()=>{validations++;if(revoked)throw Error('access changed');},transportOptions:{transports:{commands:async()=>{calls++;return{success:false,submitted:false,error:'Batas waktu login CLI vendor terlampaui',completedCommands:0,failedCommandIndex:-1};}}}});assert.equal(calls,revoked?1:2);assert.equal(validations,1);assert(!result.submitted);assert(!result.uncertain);assert.equal(f.data.settings.plannedPonChanges.length,0);}
});
test('PON login deadline ends a stalled handshake early and is cleared once even the first command is sent',async()=>{
 const{PassThrough}=require('node:stream'),[,context,transport]=await vendors.loadLibrary();
 for(const receivesPrompt of[false,true]){const f=fixture(),commands=pon.writeCommands(ponKey,true),writes=[];let closed=0;const result=await context.withContext(f.data,f.device,()=>{context.authorizePonOperation({ponKey,enabled:true,proof:'a'.repeat(64)});return transport.shellSession({olt:vendors.legacyDevice(f.device),commands,password:'unit',timeoutMs:70,loginTimeoutMs:15},({ready})=>{const stream=new PassThrough();stream.write=value=>{writes.push(value);return true;};ready(stream,()=>{closed++;},true);if(receivesPrompt)queueMicrotask(()=>stream.emit('data','OLT#'));});},{ponActionAllowed:true,timeoutMs:2000});assert.equal(closed,1);assert.equal(result.submitted,false);assert.equal(result.completedCommands,0);assert.equal(result.failedCommandIndex,receivesPrompt?0:-1);assert.equal(result.error,receivesPrompt?'Batas waktu pembacaan vendor terlampaui':'Batas waktu login CLI vendor terlampaui');assert.deepEqual(writes,receivesPrompt?['enable\n']:[]);}
});
test('one-time PON transport authorization allows only the exact sequence and leaves other device writes locked',async()=>{
 const f=fixture(),state=pon.inspect(reply(pon.readCommands(ponKey),{...f.model}),ponKey),[,context,transport]=await vendors.loadLibrary();let calls=0;
 await context.withContext(f.data,f.device,async()=>{context.authorizePonOperation({ponKey,enabled:false,proof:state.proof});for(const command of['shutdown','no shutdown','no onu 1','reboot'])await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:[command]}));await transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:pon.writeCommands(ponKey,false)});await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:pon.writeCommands(ponKey,false)}));},{ponActionAllowed:true,transports:{commands:async()=>{calls++;return{success:true};}}});assert.equal(calls,1);
});
test('PON shell transport rechecks identities before changing the port and sends no action on mismatch or failed interface mode',async()=>{
 const{PassThrough}=require('node:stream');
 for(const mode of['correct','changed','bad-mode']){const f=fixture(),state=pon.inspect(reply(pon.readCommands(ponKey),{...f.model}),ponKey),[,context,transport]=await vendors.loadLibrary(),writes=[],commands=pon.writeCommands(ponKey,false);let slot=0;
 const result=await context.withContext(f.data,f.device,()=>{context.authorizePonOperation({ponKey,enabled:false,proof:state.proof});context.current().ponGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(f.device),password:'unit',commands,timeoutMs:2000},({ready})=>{const stream=new PassThrough();stream.write=value=>{writes.push(value);const command=commands[slot++];assert.equal(value,command+'\n');if(mode==='changed'&&command==='show gpon onu uncfg')f.model.serial='ZTEG11223344';let text=reply([command],f.model).outputs[0].stdout;if(mode==='changed'&&command==='show gpon onu baseinfo gpon-olt_'+ponKey)text=text.replace('HWTCAABBCCDD','ZTEG11223344');if(mode==='bad-mode'&&command.startsWith('interface '))text='OLT(config)#';queueMicrotask(()=>stream.emit('data',text));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{ponActionAllowed:true});
 assert.equal(writes.includes('shutdown\n'),mode==='correct');assert.equal(result.submitted,mode==='correct');if(mode==='correct')assert(result.verified);else assert(!result.success);
 }
});
test('planned PON disable survives restart, suppresses only the selected PON and does not close existing/manual tickets',()=>{
 const f=fixture(),now=Date.now();f.data.oltTickets=[{id:'existing',source:'olt-los',oltId:f.device.id,status:'working',scope:'onu',pon:ponKey,serialNumber:'HWTCAABBCCDD'}];const marker=pon.begin(f.data,f.device,ponKey,false,f.actor,now);pon.finish(f.data,marker,{submitted:true,verified:true,state:{checkedAt:new Date(now).toISOString()}},false,now);
 const data=JSON.parse(JSON.stringify(f.data));assert(pon.maintenance(data,f.device,ponKey,new Date(now+3600000).toISOString(),now+3600000));assert(!pon.maintenance(data,f.device,'1/1/12',new Date(now+1000).toISOString(),now+1000));
 for(let step=1;step<=4;step++){const at=now+step*180000,snapshot={status:'online',checkedAt:new Date(at).toISOString(),inventoryAvailable:true,ports:[],onus:[{id:ponKey+':1',ponKey,serialNumber:'HWTCAABBCCDD',status:'offline',condition:'los',downCause:'LOS',causeKnown:true}]},plan=monitor.losTicketPlan(data,[{deviceId:f.device.id,deviceUpdatedAt:f.device.updatedAt,snapshot}],{now:at});assert.equal(plan.creates,0);assert.equal(plan.changes.length,0);}
 assert(planned.suppressNotification(data,{source:'olt-los',oltId:f.device.id,pon:ponKey,createdAt:new Date(now+1000).toISOString()},now+2000));assert(!planned.suppressNotification(data,{source:'manual',oltId:f.device.id,pon:ponKey,createdAt:new Date(now+1000).toISOString()},now+2000));assert.equal(data.oltTickets[0].status,'working');
});
test('manual reactivation is reconciled by a fresh port observation and disabled protection expires after recovery',()=>{
 const f=fixture(),now=Date.now(),marker=pon.begin(f.data,f.device,ponKey,false,f.actor,now);pon.finish(f.data,marker,{submitted:true,verified:true,state:{checkedAt:new Date(now).toISOString()}},false,now);
 const at=now+1000,snapshot={status:'online',checkedAt:new Date(at).toISOString(),inventoryAvailable:true,ports:[{kind:'pon',ponKey,adminState:'enabled',adminCheckedAt:new Date(at).toISOString()}]},state=pon.reconciliation(f.data,[{deviceId:f.device.id,deviceUpdatedAt:f.device.updatedAt,snapshot}],at);assert(state.changed);f.data.settings.plannedPonChanges=state.rows;assert.equal(state.rows[0].state,'recovering');assert(pon.maintenance(f.data,f.device,ponKey,new Date(at+100).toISOString(),at+100));assert(!pon.maintenance(f.data,f.device,ponKey,new Date(at+pon.RECOVERY_MS+1).toISOString(),at+pon.RECOVERY_MS+1));
});
test('port state cache never turns an empty port OFF and newer snapshots win over old modal reads',()=>{
 const f=fixture(),now=Date.now();pon.remember(f.device,{ponKey,adminState:'disabled',checkedAt:new Date(now-1000).toISOString()});let rows=pon.decorate(null,f.device,[{kind:'pon',ponKey,total:0,adminState:'enabled',adminCheckedAt:new Date(now).toISOString()}],now);assert.equal(rows[0].adminState,'enabled');rows=pon.decorate(null,f.device,[{kind:'pon',ponKey:'1/1/12',total:0}],now);assert.equal(rows[0].adminState,'unknown');
});
test('installer and updater include PON runtime and manual control is role/NAS/CSRF protected',()=>{
 for(const file of['install.sh','deploy/bin/fakenet-billing-update'])for(const runtime of['olt-pon','olt-cdata-pon'])assert(require('./helpers/install-payload').payloadSource(file).includes('    src/'+runtime+'.js\n'));
 const api=fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8');assert(api.includes("requirePermission(req,res,'olt:pon:manage')"));assert(auth.publicUser({role:'secretary'}).permissions.includes('olt:pon:manage'));
});
test('admin-state enrichment is bounded to sixteen PONs, uses cache and never adds queries on an exhausted budget',async()=>{
 const f=fixture(),now=Date.now(),ports=Array.from({length:32},(_,index)=>({kind:'pon',ponKey:'1/1/'+(index+1)}));let queries=0;const run=async commands=>{queries+=commands.length;return{success:true,outputs:commands.map(command=>({command,stdout:config(command.split('_').at(-1),true)}))};};
 const first=await pon.readPortStates(f.device,ports,[],run,now+18000);assert.equal(queries,16);assert.equal(first.filter(row=>row.adminState==='enabled').length,16);
 const second=await pon.readPortStates(f.device,ports.slice(0,16),first,run,Date.now()+18000);assert.equal(queries,16);assert(second.every(row=>row.adminState==='enabled'));
 await pon.readPortStates(f.device,ports,[],run,Date.now()+1000);assert.equal(queries,16);
});
test('dev PON operations require the explicit interactive exception and never authorize global reboot or another vendor',async()=>{
 const f=fixture(),[,context]=await vendors.loadLibrary();process.env.MIGRATION_MODE='1';try{
  await context.withContext(f.data,f.device,()=>assert.throws(()=>context.authorizePonOperation({ponKey,enabled:false,proof:'a'.repeat(64)})),{allowZteDevRead:true,ponActionAllowed:true});
  await context.withContext(f.data,f.device,()=>{context.authorizePonOperation({ponKey,enabled:false,proof:'a'.repeat(64)});assert.throws(()=>context.authorizeOltReboot(['enable','reboot']));},{allowZteDevRead:true,ponActionAllowed:true,explicitDevPonAction:true});
 }finally{process.env.MIGRATION_MODE='0';}
});
