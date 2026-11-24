'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const driver=require('../src/olt-zte-onu'),vendors=require('../src/olt-vendors'),{fixture}=require('./helpers/olt-pon-fixture');
const SN='HWTCAABBCCDD',OTHER='HWTC11223344',target={id:'1/1/13:1',serialNumber:SN};
function response(command,model){
 if(command==='show version-running')return'1/1/1 GTGHG MVR '+(model.firmware||'V2.1.0')+' date\n';
 if(command.startsWith('show gpon onu by sn '))return model.present?'gpon-onu_1/1/13:1\n':'%Code 62310-GPONSRV : No related information to show.\n';
 if(command.startsWith('show gpon onu detail-info '))return model.present?`ONU interface: gpon-onu_1/1/13:1\nSerial number: ${model.sn||SN}\nPhase state: ${model.online?'working':'OffLine'}\n`:'%Code 62310-GPONSRV : No related information to show.\n';
 if(command.startsWith('show gpon onu baseinfo '))return'OnuIndex Type Mode AuthInfo State\n'+(model.present?`gpon-onu_1/1/13:1 UNIT SN SN:${model.sn||SN} ready\n`:'')+`gpon-onu_1/1/13:2 UNIT SN SN:${model.otherSn||OTHER} ready\n`;
 if(command.startsWith('show gpon onu state '))return'OnuIndex Admin State OMCC State Phase State Channel\n'+(model.present?`1/1/13:1 enable ${model.online?'enable working':'disable OffLine'} 1(GPON)\n`:'')+'1/1/13:2 enable enable working 1(GPON)\n'+`ONU Number: ${model.present&&model.online?2:1}/${model.present?2:1}\n`;
 return'';
}
const read=model=>({success:true,outputs:driver.readCommands(driver.target(target)).map(command=>({command,stdout:response(command,model)}))});
test('ZTE C3xx action capability is separate from other vendors and requires an existing inventory',()=>{
 assert.deepEqual(driver.capabilities({vendor:'zte'},{inventoryAvailable:true,modelLabel:'ZTE C320'}),{delete:true,reboot:true});assert(!driver.capabilities({vendor:'zte'},{inventoryAvailable:false,modelLabel:'ZTE C320'}).delete);
 for(const id of['1/1/13:129','0/1/13:0','1/1/13:1;reboot'])assert.throws(()=>driver.target({id,serialNumber:SN}));
 assert.throws(()=>driver.authorize({operation:'delete',target,before:read({present:true,online:true})}),/online/);assert.throws(()=>driver.authorize({operation:'reboot',target,before:read({present:true,online:false})}),/online/);
 assert.throws(()=>driver.inspect(read({present:true,online:false,firmware:'V9'}),driver.target(target)),/firmware/);
});
async function wire(operation,scenario='success'){
 const{data,device}=fixture();device.vendor='zte';const[,context,transport]=await vendors.loadLibrary(),model={present:true,online:operation==='reboot'},before=read(model),spec={operation,target,before},grant=driver.authorize(spec),sent=[];let mutated=false;
 const result=await context.withContext(data,device,()=>{context.authorizeZteOnuOperation(spec);context.current().zteOnuGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(device),password:'unit',commands:grant.commands,timeoutMs:1000},({ready})=>{
  const stream=new EventEmitter();stream.write=value=>{const command=String(value).trim();sent.push(command);let text='',prompt='OLT#';
   if(command==='show gpon onu detail-info gpon-onu_1/1/13:1'&&scenario==='swapped'&&!mutated)model.sn=OTHER;
   if(command==='show gpon onu by sn '+SN&&scenario==='changed-other'&&mutated)model.otherSn='HWTC55667788';
   if(command==='configure terminal')prompt='OLT(config)#';if(command==='interface gpon-olt_1/1/13')prompt=scenario==='wrong-mode'?'OLT(config)#':'OLT(config-if)#';
   if(command==='pon-onu-mng gpon-onu_1/1/13:1')prompt=scenario==='wrong-mode'?'OLT(gpon-onu-mng 1/1/13:2)#':'OLT(gpon-onu-mng 1/1/13:1)#';
   if(command==='no onu 1'||command==='reboot'){mutated=true;if(scenario==='rejected')text='%Code 100 : action failed\n';else if(command==='no onu 1')model.present=false;}
   if(command.startsWith('show '))text=response(command,model);queueMicrotask(()=>stream.emit('data',text+'\n'+prompt));return true;
  };ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{zteOnuActionAllowed:true});return{result,sent};
}
for(const operation of['delete','reboot'])test('ZTE '+operation+' validates full SN/PON/firmware before a single scoped mutation',async()=>{
 const{result,sent}=await wire(operation);assert(result.success,result.error);assert(result.submitted);assert(result.verified);assert.equal(sent.filter(x=>x==='no onu 1'||x==='reboot').length,1);
 for(const scenario of['swapped','wrong-mode','rejected']){const r=await wire(operation,scenario);assert(!r.result.success,scenario);if(scenario!=='rejected')assert(!r.sent.some(x=>x==='no onu 1'||x==='reboot'));}
});
test('delete readback rejects changes to another ONU and never reports an unknown/offline target as absent',async()=>{
 const result=await wire('delete','changed-other');assert(!result.result.success);assert(result.result.submitted);assert(!result.result.verified);
 const raw=read({present:false,online:false});assert.equal(driver.inspect(raw,driver.target(target)).state,'missing');raw.outputs.find(x=>x.command.includes('by sn')).stdout='gpon-onu_1/1/14:1\n';assert.throws(()=>driver.inspect(raw,driver.target(target)),/berpindah/);
});
test('native absence uses complete SN/PON tables without querying an unconfigured ONU detail endpoint',()=>{
 const t=driver.target(target),raw=read({present:false,online:false});raw.outputs=raw.outputs.filter(row=>!row.command.includes('detail-info'));
 assert.equal(driver.inspect(raw,t,false,{summary:true}).state,'missing');assert(!driver.readCommands(t,false).some(command=>command.includes('detail-info')));
 assert.throws(()=>driver.inspect({...raw,success:false},t,false,{summary:true}),/belum dapat/);
 const truncated=structuredClone(raw);truncated.outputs.find(row=>row.command.includes('onu state')).stdout+='1/1/13:3 enable enable working 1(GPON)\n';assert.throws(()=>driver.inspect(truncated,t,false,{summary:true}),/Jumlah/);
 const moved=structuredClone(raw);moved.outputs.find(row=>row.command.includes('by sn')).stdout='gpon-onu_1/1/14:1\n';assert.throws(()=>driver.inspect(moved,t,false,{summary:true}),/berpindah/);
});
test('summary preflight still requires full native detail proof in the same session before a mutation',async()=>{
 for(const operation of['delete','reboot']){const result=await wire(operation,'swapped');assert(!result.result.success);assert(!result.sent.some(command=>command==='no onu 1'||command==='reboot'));}
});
test('ZTE native grant is one-shot, rejects altered targets, and cannot be issued by another vendor or demo mode',async()=>{
 const{data,device}=fixture();device.vendor='zte';const[,context,transport]=await vendors.loadLibrary(),spec={operation:'delete',target,before:read({present:true,online:false})};let calls=0;
 await assert.rejects(context.withContext(data,device,()=>context.authorizeZteOnuOperation(spec)));
 await context.withContext(data,device,async()=>{context.authorizeZteOnuOperation(spec);const commands=driver.commands(spec);await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(device),commands:commands.map(x=>x==='no onu 1'?'no onu 2':x)}));await transport.executeOltCommands({olt:vendors.legacyDevice(device),commands});await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(device),commands}));},{zteOnuActionAllowed:true,transports:{commands:async()=>{calls++;return{success:true};}}});assert.equal(calls,1);
 process.env.MIGRATION_MODE='1';try{await assert.rejects(context.withContext(data,device,()=>context.authorizeZteOnuOperation(spec),{allowZteDevRead:true,zteOnuActionAllowed:true}),/authorization/);}finally{process.env.MIGRATION_MODE='0';}
});
