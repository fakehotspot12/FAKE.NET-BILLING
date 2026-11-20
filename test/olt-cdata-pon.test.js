'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const pon=require('../src/olt-pon'),driver=require('../src/olt-cdata-pon'),vendors=require('../src/olt-vendors'),policy=require('../src/olt-terminal-policy'),{fixture}=require('./helpers/olt-pon-fixture');
process.env.MIGRATION_MODE='0';process.env.REDIS_CACHE='0';
const key='0/1/1',info=(pon,enabled,online)=>`Port : gpon ${pon}\nOptical Module Status : normal\nAdmin State : ${enabled?'enable':'disable'}\nLink State : ${online?'on':'off'}\nOLT(config-gpon-0/${pon.split('/')[1]})#`;
const state=(pon,enabled,online)=>`Frame/Slot : ${pon.split('/').slice(0,2).join('/')}\nPort : ${pon.split('/')[2]}\nAdmin state : ${enabled?'enable':'disable'}\nLink state : ${online?'on':'off'}\nPort Name : gpon ${pon}\nOLT(config-gpon-0/${pon.split('/')[1]})#`;
function cfixture(){const f=fixture();f.device.vendor='cdata';f.model={enabled:true,registered:2,online:1,unregistered:0,serial:'HWTCAABBCCDD'};return f;}
function reply(commands,model){let submitted=false;const outputs=commands.map(command=>{let stdout='OLT#';
 if(command==='config')stdout='OLT(config)#';
 else if(command.startsWith('interface gpon '))stdout='OLT(config-gpon-'+command.split(' ').at(-1)+')#';
 else if(command==='show ont autofind all')stdout='Aging time of the automatically found ONTs : 300sec\n'+(model.unregistered?'0/1 1 HWTC11223344 gpon\n':'There is no ONT available.\n')+'OLT#';
 else if(command.startsWith('show port info '))stdout=info(key,model.enabled,model.online);
 else if(command.startsWith('show port state '))stdout=state(key,model.enabled,model.online);
 else if(command==='show ont info 1 all')stdout='F/S P ONT SN Control Run Config Match Last Desc\nID flag state state state down-cause\n'+Array.from({length:model.registered},(_,i)=>`0/1 1 ${i+1} ${i?'HWTC11223344':model.serial} Active ${i<model.online?'Online':'Offline'} success match LOS`).join('\n')+`\nTotal: ${model.registered}, online: ${model.online}, deactive: 0, success: ${model.online}, failed: 0\nOLT(config-gpon-0/1)#`;
 else if(/^(?:no )?shutdown 1$/.test(command)){submitted=true;model.enabled=command==='no shutdown 1';model.online=model.enabled?model.registered:0;stdout='OLT(config-gpon-0/1)#';}
 return{command,stdout};});return{success:true,submitted,outputs};}
const options=f=>({transports:{commands:async({commands})=>reply(commands,{...f.model})}});
const payload=(f,plan)=>({token:plan.token,revision:f.device.updatedAt,confirmId:f.device.id,confirmTarget:key,confirmImpact:true,enabled:plan.enabled,confirmDisconnectOnline:true,confirmOnlineCount:plan.online});
test('CDATA port proof joins native address/admin/link and complete registered ONU totals without guessing autofind',()=>{
 const f=cfixture(),result=reply(driver.readCommands(key),f.model),value=driver.inspect(result,key);assert.equal(value.registered,2);assert.equal(value.online,1);assert.equal(value.unregistered,0);assert.equal(value.adminState,'enabled');
 for(const change of[value=>value.replace('Total: 2','Total: 3'),value=>value.replace('online: 1','online: 2'),value=>value.replace('0/1 1 2','0/2 1 2'),value=>value.replace('0/1 1 2','0/1 1 1')]){const copy=structuredClone(result),row=copy.outputs.at(-1);row.stdout=change(row.stdout);assert.throws(()=>driver.inspect(copy,key));}
 for(const text of[info('0/1/2',true,1),info(key,true,1)+'\nAdmin State : disable',info(key,true,1).replace('enable','unknown')])assert.throws(()=>driver.portInfo(text,key));
 assert.throws(()=>driver.unregistered('There is no ONT available.'),/belum terverifikasi/);assert.throws(()=>driver.unregistered('Aging time of the automatically found ONTs : 300sec\n0/1 1 HWTC11223344 gpon'),/belum terverifikasi/);
 assert.equal(driver.registered('There is no ONT available.',key).length,0);assert.throws(()=>driver.registered('There is no ONT available.\n0/1 1 1 HWTCAABBCCDD',key));
});
test('CDATA preview and operation use the shared role, exact online consent, one-shot token and planned-PON maintenance',async()=>{
 const f=cfixture(),plan=await pon.prepare(f.data,f.device,f.actor,key,options(f));assert(plan.requiresOnlineConsent);let sends=0;const opts={beforeSend:async()=>pon.begin(f.data,f.device,key,false,f.actor),afterSend:async(marker,result,enabled)=>pon.finish(f.data,marker,result,enabled),transportOptions:{transports:{commands:async({commands})=>{sends++;assert.deepEqual(commands,driver.writeCommands(key,false));return reply(commands,f.model);}}}};
 await assert.rejects(pon.execute(f.data,f.device,f.actor,{...payload(f,plan),confirmDisconnectOnline:false},opts),/ONU online/);assert.equal(sends,0);
 const result=await pon.execute(f.data,f.device,f.actor,payload(f,plan),opts);assert(result.verified);assert.equal(result.state.adminState,'disabled');assert.equal(f.data.settings.plannedPonChanges[0].ponKey,key);assert.equal(f.data.settings.plannedPonChanges[0].state,'disabled');await pon.execute(f.data,f.device,f.actor,payload(f,plan),opts);assert.equal(sends,1);
 f.actor.role='technician';await assert.rejects(pon.prepare(f.data,f.device,f.actor,key,options(f)),/izin/);f.actor.position='Kepala Teknisi';assert(pon.canManage(f.data,f.device,f.actor));
});
test('CDATA control does not interpret ZTE positions, SSH, unknown firmware or new-ONU layouts as verified',async()=>{
 for(const value of['1/1/1','0/01/1','0/1/17','0/1/1:1','0/1/1;reboot'])assert.throws(()=>driver.readCommands(value));const f=cfixture();f.device.cliProtocol='ssh';assert(!pon.supports(f.device));await assert.rejects(pon.prepare(f.data,f.device,f.actor,key,options(f)),/terverifikasi/);
 f.device.cliProtocol='telnet';f.model.unregistered=1;await assert.rejects(pon.prepare(f.data,f.device,f.actor,key,options(f)),/belum terverifikasi/);
});
test('CDATA shell sends no shutdown before exact same-session ONU proof and configuration prompt validation',async()=>{
 const[,context,transport]=await vendors.loadLibrary();
 for(const mode of['ok','wrong-interface','different-onu','new-online','unverified-readback']){const f=cfixture(),proof=driver.inspect(reply(driver.readCommands(key),{...f.model}),key).proof,commands=driver.writeCommands(key,false),writes=[];let index=0;
  const result=await context.withContext(f.data,f.device,()=>{context.authorizePonOperation({ponKey:key,enabled:false,proof});context.current().ponGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(f.device),commands,password:'unit',timeoutMs:2000},({ready})=>{const stream=new PassThrough();stream.write=value=>{writes.push(value);const command=commands[index++];let text=reply([command],f.model).outputs[0].stdout;if(command.startsWith('interface ')&&mode==='wrong-interface')text='OLT(config-gpon-0/2)#';if(command==='show ont info 1 all'&&mode==='different-onu')text=text.replace('HWTCAABBCCDD','ZTEGAABBCCDD');if(command==='show ont info 1 all'&&mode==='new-online')text=text.replace('Active Offline','Active Online').replace('online: 1','online: 2');if(index>8&&mode==='unverified-readback')text=text.replace('disable','enable');queueMicrotask(()=>stream.emit('data',text));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{ponActionAllowed:true});
  const sent=['ok','unverified-readback'].includes(mode);assert.equal(writes.includes('shutdown 1\n'),sent,mode);assert.equal(result.submitted,sent,mode);assert.equal(result.verified,mode==='ok',mode);
 }
});
test('CDATA transport read exception matches only the finite native read sequences, not write or alternate targets',async()=>{
 const f=cfixture(),[,context,transport]=await vendors.loadLibrary();let calls=0;
 const commands=driver.readCommands(key);assert(driver.isReadCommands(commands));const states=driver.stateCommands([{ponKey:key},{ponKey:'0/2/1'}]);assert(driver.isReadCommands(states));
 for(const list of[['enable','config','shutdown 1'],[...commands,'shutdown 1'],commands.map(value=>value==='show port info 1'?'show port info 2':value),states.slice(0,-1),driver.stateCommands(Array.from({length:5},(_,i)=>({ponKey:'0/1/'+(i+1)})))])assert(!driver.isReadCommands(list));
 await context.withContext(f.data,f.device,async()=>{await transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands});for(const command of['shutdown 1','no shutdown 1','shutdown 1-4'])await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:['enable','config',command]}));context.authorizePonOperation({ponKey:key,enabled:false,proof:'a'.repeat(64)});await transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:driver.writeCommands(key,false)});await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:driver.writeCommands(key,false)}));},{ponActionAllowed:true,transports:{commands:async()=>{calls++;return{success:true};}}});assert.equal(calls,2);
});
test('CDATA admin polling is bounded to four ports, cached and cannot mark a different port off',async()=>{
 const f=cfixture(),ports=Array.from({length:8},(_,i)=>({kind:'pon',ponKey:'0/1/'+(i+1)})),now=Date.now();let reads=0;
 const run=async commands=>{assert(driver.isReadCommands(commands));reads++;let slot;return{success:true,outputs:commands.flatMap(command=>{if(command.startsWith('interface '))slot=command.split('/').at(-1);if(!command.startsWith('show port info '))return[];const key=`0/${slot}/${command.split(' ').at(-1)}`;return[{command,stdout:info(key,true,0)}];})};};
 const first=await pon.readPortStates(f.device,ports,[],run,now+18000);assert.equal(first.filter(row=>row.adminState==='enabled').length,4);assert.equal(reads,1);await pon.readPortStates(f.device,ports.slice(0,4),first,run,now+18000);assert.equal(reads,1);
 const second=await pon.readPortStates(f.device,[ports[4]],[],async commands=>({success:true,outputs:[{command:commands[3],stdout:info('0/2/5',false,0)}]}),now+18000);assert.equal(second[0].adminState,'unknown');await pon.readPortStates(f.device,ports,[],run,Date.now()+1000);assert.equal(reads,1);
});
test('CDATA manual enable uses the same PON permission and never enables lists or routes shutdown around web safeguards',()=>{
 const f=cfixture(),location=policy.nextLocation(f.device,'interface gpon 0/1');assert.equal(policy.classify(f.device,location,'no shutdown 1').permission,'olt:pon:manage');
 for(const command of['no shutdown 1-4','shutdown 1','port 1 shutdown'])assert.throws(()=>policy.classify(f.device,location,command));assert.throws(()=>policy.classify(f.device,null,'no shutdown 1'));
});
test('legacy CDATA CLI and the PON/native transport share one per-device lock without leaking it on failed login',async()=>{
 const f=cfixture(),cli=require('../src/olt-cli'),[,context,transport]=await vendors.loadLibrary();let spawned=0;
 assert(transport.claimOlt(f.device.id));try{await assert.rejects(cli.run(f.data,f.device,null,()=>{spawned++;throw Error('must not spawn');}),/sedang digunakan/);assert.equal(spawned,0);assert(!cli.isBusy(f.device.id));assert(!transport.claimOlt(f.device.id));}finally{transport.releaseOlt(f.device.id);}
 await assert.rejects(cli.run(f.data,f.device,null,()=>{spawned++;throw Error('unit failure');}),/gagal/);assert.equal(spawned,1);assert(!cli.isBusy(f.device.id));assert(transport.claimOlt(f.device.id));transport.releaseOlt(f.device.id);
});
