'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),store=require('../src/store'),monitor=require('../src/olt-monitor'),vendors=require('../src/olt-vendors'),hioso=require('../src/olt-hioso'),planned=require('../src/olt-planned-reboot');
process.env.MIGRATION_MODE='0';process.env.REDIS_CACHE='0';
const MAC='AABBCCDDEEFF',ID='1/1:1:'+MAC;
const array=(name,values)=>`var ${name}=new Array(${values.map(value=>JSON.stringify(String(value))).join(',')});`;
function model(extra={}){
 const data=store.createDefaultStore(),device=monitor.validateDevice(data,{name:'HIOSO',host:'192.0.2.122',vendor:'hioso',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit'});data.oltDevices=[device];
 const state={name:'Client',status:'Up',address:'0/1:1',mac:'AA:BB:CC:DD:EE:FF',present:true,posts:[],...extra},onu={id:ID,serialNumber:MAC,slot:1,pon:1,onuId:1,ponKey:'0/1/1',identifierKind:'mac'};
 const row=()=>[state.address,state.name,state.mac,state.status,'v1','chip',4,...Array(15).fill('0')];
 const html=()=>array('onuinfo',row())+'<form action="/goform/setOnu" method=post><input name=onuId><input name=onuName maxlength=30><select name=onuOperation><option value=nonOp>None</option><option value=rebootOp>Reboot</option><option value=restoreOp>Reset</option></select></form>';
 const options={transports:{commands:async({commands})=>{if(extra.cliOnu){const last=commands.at(-1);if(/^onu \d+ \?$/.test(last))return{success:true,outputs:[{command:last,stdout:'  reboot -- Reboot ONU\n'}]};if(last==='delete onu ?')return{success:true,outputs:[{command:last,stdout:'  <1-128> -- Specified Onu Id\n'}]};if(commands.includes('show onu info all')){const outputs=[];let pon=0;for(const command of commands){if(/^interface epon/.test(command))pon=Number(command.split('/').at(-1));if(/^delete onu \d+$/.test(command)){state.posts.push({command});state.present=false;}if(/^onu \d+ reboot$/.test(command))state.posts.push({command});outputs.push({command,stdout:command==='show onu info all'?'OnuId MacAddress Status Firmware ChipId Ge Fe Pots CtcStatus CtcVer Activate Uptime Name\n'+(state.present&&pon===1?`${state.address} ${state.mac} ${state.status} v1 chip 1 0 0 CtcNegDone 30 Yes 0 Client\n`:''):''});}return{success:true,outputs};}}if(extra.cliSave&&commands[1]==='?')return{success:true,outputs:[{command:'?',stdout:'  write   Write running configuration to file\n'}]};if(extra.cliSave&&commands[1]==='write'){state.posts.push({command:'write'});if(extra.saveFailure)throw Error('Lost CLI acknowledgement');return{success:true,outputs:[{command:'write',stdout:'Configuration saved successfully.'}]};}return{success:false,outputs:[]};},fetch:async(url,input)=>{
  if(url.pathname==='/system_save.asp')return new Response(extra.saveSupported?'<form method=get action=/goform/saveConfiguration><input type=hidden name=savecfg></form><td id=retVal>1</td>':'<form action=/goform/reset method=get><input name=savecfg></form>');
  if(url.pathname==='/goform/saveConfiguration'){state.posts.push({path:url.pathname,query:url.search,method:input.method});if(extra.saveFailure)throw Error('Lost acknowledgement');return new Response(extra.saveReply||'<td id=retVal>0</td>');}
  if(input.method==='POST'){const body=new URLSearchParams(input.body);state.posts.push({path:url.pathname,body:Object.fromEntries(body)});if(extra.postError)return new Response('<title>Error</title>',{status:500});if(url.pathname.endsWith('deleteOnu'))state.present=false;else if(body.get('onuOperation')==='nonOp')state.name=body.get('onuName');return new Response('OK');}
  if(url.pathname==='/onuConfig.asp')return new Response(html());
  if(url.pathname==='/onuDeleteOnuList.asp')return new Response('<form action="/goform/deleteOnu" method=post><input name=onuId></form><form action="/goform/deleteOnuList" method=post><input name=onuListId></form>');
  if(url.pathname==='/onuAllPonOnuList.asp')return new Response(array('onutable',state.present?row():[])+'var rowCount=(onutable.length)/22;');
  throw Error('Unexpected URL '+url.pathname);
 }}};
 return{data,device,onu,state,options,html};
}
test('HIOSO native positions are validated independently from CDATA indexes',()=>{
 assert.deepEqual(hioso.position(ID),{slot:1,pon:1,onuId:1,ponKey:'0/1/1',serialNumber:MAC,identifierKind:'mac'});for(const value of ['1/17:1:'+MAC,'32/1:1:'+MAC,'1/1:0:'+MAC,'1/1:1025:'+MAC,'1/1:1:HWTCAABBCCDD',ID+';delete'])assert.equal(hioso.position(value),null);assert.equal(monitor.actionPosition({vendor:'cdata'},ID),null);assert.equal(monitor.actionPosition({vendor:'hioso'},'4718593'),null);
});
test('HIOSO exposes capabilities only from recognized form; factory remains read-only',async()=>{
 const f=model(),result=await hioso.run(f.data,f.device,f.onu,'inspect',{},f.options);assert.deepEqual(result.actions,{rename:true,reboot:true,delete:true});assert.deepEqual(hioso.formCapabilities('<form action="/goform/reset">'),{rename:false,reboot:false,delete:false});assert.equal(f.state.posts.length,0);
 const pub=monitor.publicDevice(f.device,{hiosoActions:result.actions});assert(pub.onuRebootAvailable&&pub.onuRenameAvailable&&pub.onuDeleteAvailable);assert.equal(pub.saveConfigAvailable,false);assert.equal(vendors.canWrite(f.device),false);
 const[factory,context]=await vendors.loadLibrary();await assert.rejects(context.withContext(f.data,f.device,()=>factory.createOltAdapter(vendors.legacyDevice(f.device)).rebootOnu({onu:f.onu}),f.options),/terkunci/);
});
test('HIOSO rename posts exactly native address, name and nonOp, and verifies readback',async()=>{
 const f=model(),before=JSON.stringify(f.data),result=await hioso.run(f.data,f.device,f.onu,'rename',{description:'Customer Baru',previousDescription:'Client'},f.options);assert(result.descriptionConfirmed);assert.equal(result.description,'Customer Baru');assert.deepEqual(f.state.posts,[{path:'/goform/setOnu',body:{onuId:'0/1:1',onuName:'Customer Baru',onuOperation:'nonOp'}}]);assert.equal(JSON.stringify(f.data),before);
});
test('HIOSO reboot preserves original name, posts once and never claims completed reboot',async()=>{
 const f=model(),result=await hioso.run(f.data,f.device,f.onu,'reboot',{},f.options);assert.equal(result.submitted,true);assert.equal(result.confirmed,false);assert.equal(f.state.posts[0].body.onuName,'Client');assert.equal(f.state.posts[0].body.onuOperation,'rebootOp');await assert.rejects(hioso.run(f.data,f.device,f.onu,'reboot',{},f.options),/baru saja/);assert.equal(f.state.posts.length,1);
});
test('HIOSO delete requires fresh offline proof and verifies disappearance without retry',async()=>{
 const f=model({status:'Down'}),before=JSON.stringify(f.data),result=await hioso.run(f.data,f.device,f.onu,'delete',{},f.options);assert(result.deleteConfirmed);assert.deepEqual(f.state.posts,[{path:'/goform/deleteOnu',body:{onuId:'0/1:1'}}]);assert.equal(JSON.stringify(f.data),before);
});
for(const status of ['Up','LoopDetected','unknown'])test('HIOSO delete rejects '+status+' without mutation',async()=>{const f=model({status});await assert.rejects(hioso.run(f.data,f.device,f.onu,'delete',{},f.options),/offline/);assert.equal(f.state.posts.length,0);});
test('HIOSO identity, changed description, unsupported length and reset requests cannot mutate',async()=>{
 for(const extra of [{mac:'AA:BB:CC:DD:EE:01'},{address:'0/2:1'}]){const f=model(extra);await assert.rejects(hioso.run(f.data,f.device,f.onu,'rename',{description:'New',previousDescription:'Client'},f.options));assert.equal(f.state.posts.length,0);}
 const f=model();for(const payload of [{description:'New',previousDescription:'Changed'},{description:'X'.repeat(31),previousDescription:'Client'}])await assert.rejects(hioso.run(f.data,f.device,f.onu,'rename',payload,f.options));await assert.rejects(hioso.run(f.data,f.device,f.onu,'restore',{},f.options));assert.equal(f.state.posts.length,0);
});
test('HIOSO failed write acknowledgement never retries or claims disappearance',async()=>{const f=model({status:'Down',postError:true}),result=await hioso.run(f.data,f.device,f.onu,'delete',{},f.options);assert.equal(result.deleteConfirmed,false);assert.equal(f.state.posts.length,1);await assert.rejects(hioso.run(f.data,f.device,f.onu,'delete',{},f.options),/baru saja/);});
test('HIOSO structured grant accepts one exact request and cannot call reset, save, other ONU or other host',async()=>{
 const f=model(),[,context]=await vendors.loadLibrary();let calls=0;await context.withContext(f.data,f.device,async()=>{
  context.authorizeHiosoOperation({address:'0/1:1',operation:'nonOp',name:'Name'});
  const url='http://192.0.2.122/goform/setOnu',request=body=>context.readOnlyFetch(url,{method:'POST',body:new URLSearchParams(body)});
  for(const body of [{onuId:'0/2:1',onuName:'Name',onuOperation:'nonOp'},{onuId:'0/1:1',onuName:'Name',onuOperation:'restoreOp'},{onuId:'0/1:1',onuName:'Name',onuOperation:'nonOp',extra:'1'}])await assert.rejects(request(body));
  await assert.rejects(context.readOnlyFetch('http://192.0.2.123/goform/setOnu',{method:'POST',body:new URLSearchParams({onuId:'0/1:1',onuName:'Name',onuOperation:'nonOp'})}));
  await request({onuId:'0/1:1',onuName:'Name',onuOperation:'nonOp'});await assert.rejects(request({onuId:'0/1:1',onuName:'Name',onuOperation:'nonOp'}));
 },{hiosoActionAllowed:true,transports:{fetch:async()=>{calls++;return new Response('OK');}}});assert.equal(calls,1);
});
test('EPON reboot marker binds MAC, exact position and PON and stays isolated in demo mode',async()=>{
 const f=model();assert(planned.begin(f.data,{source:'olt',serialNumber:MAC,oltId:f.device.id,onuIndex:ID,pon:'0/1/1'}));assert.throws(()=>planned.begin(model().data,{source:'olt',serialNumber:'AABBCCDDEE00',oltId:f.device.id,onuIndex:ID,pon:'0/1/1'}));process.env.MIGRATION_MODE='1';try{await assert.rejects(hioso.run(f.data,f.device,f.onu,'rename',{description:'New',previousDescription:'Client'},f.options),/terisolasi/);}finally{process.env.MIGRATION_MODE='0';}
});
test('HIOSO Save Config recognizes only the native GET form and uses one exact guarded request',async()=>{
 const f=model({saveSupported:true}),before=JSON.stringify(f.data),result=await hioso.saveConfig(f.data,f.device,f.options);assert(result.saveConfirmed);assert.deepEqual(f.state.posts,[{path:'/goform/saveConfiguration',query:'?savecfg=',method:'GET'}]);assert.equal(JSON.stringify(f.data),before);
 const pub=monitor.publicDevice(f.device,{hiosoActions:{saveConfig:true}});assert(pub.saveConfigAvailable);assert.equal(vendors.canWrite(f.device),false);assert.equal(monitor.publicDevice(f.device,{hiosoActions:{saveConfig:false}}).saveConfigAvailable,false);
 for(const html of ['<form method=post action=/goform/saveConfiguration><input name=savecfg></form>','<form method=get action=/goform/reset><input name=savecfg></form>','<form method=get action=/goform/saveConfiguration><input name=savecfg><input name=reset></form>'])assert.equal(hioso.saveForm(html),false);
});
test('HIOSO Save Config refuses unsupported form, ambiguous reply and retries after lost acknowledgement',async()=>{
 const unsupported=model();await assert.rejects(hioso.saveConfig(unsupported.data,unsupported.device,unsupported.options),/belum terverifikasi/);assert.equal(unsupported.state.posts.length,0);
 const f=model({saveSupported:true,saveFailure:true}),payload={confirmId:f.device.id,confirmName:f.device.name,confirmSave:true,revision:f.device.updatedAt};const response=await monitor.saveConfig(f.data,f.device,payload,()=>hioso.saveConfig(f.data,f.device,f.options));assert.equal(response.confirmed,false);assert.equal(f.state.posts.length,1);await assert.rejects(monitor.saveConfig(f.data,f.device,payload),error=>error.status===429);assert.equal(f.state.posts.length,1);
 for(const reply of ['<td id=retVal>1</td>','<td id=retVal>-1</td>','<p>Save failed</p>','<p>Please wait</p>'])assert.equal(hioso.saveConfirmed(reply),false);
});
test('HIOSO Save Config capability probe is read-only and works without an ONU',async()=>{
 const f=model({saveSupported:true}),[,context]=await vendors.loadLibrary(),{HiosoAdapter}=await import('../src/olt-vendor-library/adapters/hioso.adapter.js');const actions=await context.withContext(f.data,f.device,()=>hioso.probe(new HiosoAdapter(vendors.legacyDevice(f.device)),[]),f.options);assert.equal(actions.saveConfig,true);assert.equal(f.state.posts.length,0);
});
test('HIOSO Save Config grant rejects extra parameters, writes without grant and reuse',async()=>{
 const f=model(),[,context]=await vendors.loadLibrary();let calls=0;await context.withContext(f.data,f.device,async()=>{
  const base='http://192.0.2.122/goform/saveConfiguration';await assert.rejects(context.readOnlyFetch(base+'?savecfg='));context.authorizeHiosoSave();for(const url of [base,base+'?savecfg=1',base+'?savecfg=&reset=1',base+'?savecfg=&savecfg=','http://192.0.2.123/goform/saveConfiguration?savecfg='])await assert.rejects(context.readOnlyFetch(url));await assert.rejects(context.readOnlyFetch(base+'?savecfg=',{method:'POST'}));await context.readOnlyFetch(base+'?savecfg=');await assert.rejects(context.readOnlyFetch(base+'?savecfg='));
 },{hiosoActionAllowed:true,transports:{fetch:async()=>{calls++;return new Response('<td id=retVal>0</td>');}}});assert.equal(calls,1);
});
test('HIOSO Save Config prefers validated Telnet over web and never falls back after submission',async()=>{
 const f=model({cliSave:true,saveSupported:true}),result=await hioso.saveConfig(f.data,f.device,f.options);assert(result.saveConfirmed);assert.deepEqual(f.state.posts,[{command:'write'}]);
 const failed=model({cliSave:true,saveSupported:true,saveFailure:true});await assert.rejects(hioso.saveConfig(failed.data,failed.device,failed.options));assert.deepEqual(failed.state.posts,[{command:'write'}]);
});
test('HIOSO CLI save grant permits exactly enable/write once, not reset or extra commands',async()=>{
 const f=model(),[,context,transport]=await vendors.loadLibrary();let calls=0;await context.withContext(f.data,f.device,async()=>{context.authorizeHiosoSave('cli');const request=commands=>transport.executeOltCommands({olt:vendors.legacyDevice(f.device),password:'unit',commands});await assert.rejects(request(['enable','reload']));await assert.rejects(request(['enable','write','reload']));await request(['enable','write']);await assert.rejects(request(['enable','write']));},{hiosoActionAllowed:true,transports:{commands:async()=>{calls++;return{success:true};}}});assert.equal(calls,1);
});
test('HIOSO inventory prefers complete CLI data and supplements only missing fields with exact MAC/position',async()=>{
 const{HiosoAdapter}=await import('../src/olt-vendor-library/adapters/hioso.adapter.js'),adapter=new HiosoAdapter({vendor:'hioso'}),calls=[],cli={sn:MAC,slot:1,pon:1,onu_id:1,status:'online',description:'CLI name',rx_power:'-22 dBm'},web={...cli,description:'Web name',status:'offline',rx_power:'-30 dBm'};adapter.readCliInventory=async()=>{calls.push('cli');return{source:'cli-hioso-ha7304',items:[cli]};};adapter.readWebOnuList=async()=>{calls.push('web');return[web];};const result=await adapter.readInventory();assert.deepEqual(calls,['cli','web']);assert.equal(result.source,'cli-hioso-ha7304');assert.equal(result.items[0].description,'CLI name');assert.equal(result.items[0].status,'online');assert.equal(result.items[0].rx_power,'-22 dBm');
});
test('HIOSO incomplete CLI does not hide additional web ONUs and web failure keeps valid CLI rows',async()=>{
 const{HiosoAdapter}=await import('../src/olt-vendor-library/adapters/hioso.adapter.js'),adapter=new HiosoAdapter({vendor:'hioso'}),row={sn:MAC,slot:1,pon:1,onu_id:1,status:'online'};adapter.readCliInventory=async()=>({source:'cli-hioso-ha7304',items:[row]});adapter.readWebOnuList=async()=>[row,{...row,sn:'AABBCCDDEE01',onu_id:2}];assert.equal((await adapter.readInventory()).items.length,2);adapter.readWebOnuList=async()=>{throw Error('Web offline');};assert.equal((await adapter.readInventory()).items.length,1);
});
test('HIOSO reboot and delete prefer validated CLI syntax and keep exact target binding',async()=>{
 const reboot=model({cliOnu:true}),reply=await hioso.run(reboot.data,reboot.device,reboot.onu,'reboot',{},reboot.options);assert(reply.submitted);assert.deepEqual(reboot.state.posts,[{command:'onu 1 reboot'}]);
 const del=model({cliOnu:true,status:'Down'}),deleted=await hioso.run(del.data,del.device,del.onu,'delete',{},del.options);assert(deleted.deleteConfirmed);assert.deepEqual(del.state.posts,[{command:'delete onu 1'}]);
});
test('HIOSO CLI grants cannot switch ONU, PON, command or serial before dispatch',async()=>{
 const f=model(),[,context,transport]=await vendors.loadLibrary();let calls=0;await context.withContext(f.data,f.device,async()=>{context.authorizeHiosoCliOnu({address:'0/1:1',serialNumber:MAC,operation:'delete'});const commands=['enable','terminal length 0','configure terminal','epon','interface epon 0/1','show onu info all','delete onu 1','show onu info all'];for(const changed of [commands.map(v=>v==='delete onu 1'?'delete onu 2':v),commands.map(v=>v==='interface epon 0/1'?'interface epon 0/2':v),[...commands,'write']])await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(f.device),password:'unit',commands:changed}));await transport.executeOltCommands({olt:vendors.legacyDevice(f.device),password:'unit',commands});await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(f.device),password:'unit',commands}));},{hiosoActionAllowed:true,transports:{commands:async()=>{calls++;return{success:true};}}});assert.equal(calls,1);
});
test('HIOSO CLI precheck rejects changed MAC, duplicate identities, online delete and malformed tables',async()=>{
 const[,,transport]=await vendors.loadLibrary(),header='OnuId MacAddress Status\n',grant={action:'delete',address:'0/1:1',serialNumber:MAC},row='0/1:1 AA:BB:CC:DD:EE:FF Down\n';assert.doesNotThrow(()=>transport.assertHiosoCliTarget(header+row,grant));for(const value of [header+row.replace('EE:FF','EE:01'),header+row.replace('Down','Up'),header+row+'0/1:2 AA:BB:CC:DD:EE:FF Down\n','prompt only',header+'0/1:1 malformed Down\n'])assert.throws(()=>transport.assertHiosoCliTarget(value,grant));assert.equal(transport.hiosoCliRows(header+'0/1:1 malformed Down\n'),null);assert.equal(transport.hiosoCliRows(header+row.replace('Down','LoopDetected'))[0].status,'unknown');
});
test('HIOSO wire session blocks the mutation before sending when its in-session target check fails',async()=>{
 const{EventEmitter}=require('node:events'),f=model(),[,context,transport]=await vendors.loadLibrary();for(const row of ['0/1:1 AA:BB:CC:DD:EE:01 Down','0/1:1 AA:BB:CC:DD:EE:FF Up','0/1:1 invalid Down']){const written=[];const result=await context.withContext(f.data,f.device,async()=>{context.authorizeHiosoCliOnu({address:'0/1:1',serialNumber:MAC,operation:'delete'});context.current().hiosoGrant.used=true;const commands=['enable','terminal length 0','configure terminal','epon','interface epon 0/1','show onu info all','delete onu 1','show onu info all'];return transport.shellSession({olt:vendors.legacyDevice(f.device),password:'unit',commands,timeoutMs:1000},({ready})=>{const stream=new EventEmitter();stream.write=value=>{written.push(value);queueMicrotask(()=>stream.emit('data',value.trim()==='show onu info all'?'OnuId MacAddress Status\n'+row+'\nEPON# ':'EPON# '));};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','EPON# '));});},{hiosoActionAllowed:true});assert.equal(result.success,false);assert(written.some(value=>value.trim()==='show onu info all'));assert(!written.some(value=>value.trim()==='delete onu 1'));}
});
test('HIOSO help probing never presses Enter on a partially typed mutation command',async()=>{
 const{EventEmitter}=require('node:events'),f=model(),[,context,transport]=await vendors.loadLibrary(),written=[];const result=await context.withContext(f.data,f.device,()=>transport.shellSession({olt:vendors.legacyDevice(f.device),password:'unit',commands:['enable','configure terminal','epon','interface epon 0/1','delete onu ?'],timeoutMs:1500},({ready})=>{const stream=new EventEmitter();stream.write=value=>{written.push(value);queueMicrotask(()=>stream.emit('data',value.endsWith('?')?'<1-128> -- Specified Onu Id\nEPON# delete onu ':'EPON# '));};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','EPON# '));}));assert(result.success);assert.equal(written.at(-1),'delete onu ?');assert(result.outputs.at(-1).stdout.includes('Specified Onu Id'));
});
