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
 const options={transports:{fetch:async(url,input)=>{
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
