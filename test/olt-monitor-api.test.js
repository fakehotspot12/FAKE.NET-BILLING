'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),os=require('node:os'),path=require('node:path'),{Readable}=require('node:stream'),test=require('node:test');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fakenet-olt-api-'));
process.env.AUTH_SESSION_STORE_PATH=path.join(directory,'sessions.json');process.env.REDIS_CACHE='0';process.env.MIGRATION_MODE='1';
const auth=require('../src/auth'),storeModule=require('../src/store');let fixture,saves=0,lastSaveOptions;
const serverPath=require.resolve('../src/server'),serverModule=new Module(serverPath,module);serverModule.filename=serverPath;serverModule.paths=Module._nodeModulePaths(path.dirname(serverPath));
const nativeRequire=serverModule.require.bind(serverModule);
serverModule.require=name=>name==='./store'?{...storeModule,loadStore:async()=>fixture,peekStore:()=>fixture,saveStore:async(data,options)=>{fixture=data;saves++;lastSaveOptions=options;return data;}}:nativeRequire(name);
serverModule._compile(fs.readFileSync(serverPath,'utf8')+'\nmodule.exports.__test.oltApi=handleApi;module.exports.__test.createWifiKuSession=createWifiKuSession;module.exports.__test.syncOltLosTickets=syncOltLosTickets;module.exports.__test.oltQueueJob=processWaGatewayQueueJob;module.exports.__test.stubOltTransport=(deliver,wait=async()=>{})=>{const savedDeliver=deliverWaMessage,savedWait=waitForWaGatewayDeliverySlot;deliverWaMessage=deliver;waitForWaGatewayDeliverySlot=wait;return()=>{deliverWaMessage=savedDeliver;waitForWaGatewayDeliverySlot=savedWait;};};',serverPath);
const handle=serverModule.exports.__test.oltApi,sessions=new Map();
function reset(){fixture=storeModule.createDefaultStore();fixture.users=auth.publicRoles().map(({value})=>({id:value,username:value,name:'Unit '+value,role:value,active:true}));fixture.monitoringTargets=[{id:'nas-a',name:'NAS-A',host:'192.0.2.10'},{id:'nas-b',name:'NAS-B',host:'192.0.2.11'}];saves=0;}
async function request(role,method='GET',suffix='',body={},validCsrf=true,handler=handle){
 if(role&&!sessions.has(role))sessions.set(role,auth.createSession(fixture.users.find(row=>row.id===role||row.role===role)));
 const id=sessions.get(role),uri=suffix.startsWith('/api/')?suffix:'/api/monitoring/olt'+suffix,req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method=method;req.url=uri;req.socket={remoteAddress:'127.0.0.1'};
 req.headers={host:'localhost:8891',origin:'http://localhost:8891','content-type':'application/json',...(id?{cookie:auth.SESSION_COOKIE+'='+id}:{}),'x-csrf-token':validCsrf?auth.csrfTokenForSessionId(id):'bad'};
 const res=apiResponse();await handler(req,res,new URL(uri,'http://localhost:8891'));return res;
}
function apiResponse(){return{writeHead(status,headers={}){this.status=status;this.headers=headers;},end(data){this.body=Buffer.isBuffer(data)?data:JSON.parse(data);}};}
test('finance can open ticket menu and create a service ticket but cannot manage OLT or handle tickets',async()=>{
 reset();assert.equal((await request('finance','GET','/service-options')).status,200);assert.equal((await request('finance','GET','/tickets')).status,200);
 const payload={category:'billing',customerName:'Unit Customer',text:'Please check payment',address:'Unit Address'};
 assert.equal((await request('finance','POST','/tickets',payload,false)).status,419);
 const created=await request('finance','POST','/tickets',payload);assert.equal(created.status,201);assert.equal(created.body.ticket.createdBy,'finance');
 const id=created.body.ticket.id;assert.equal((await request('finance','GET','/tickets/'+id)).status,200);
 for(const [method,suffix]of [['PUT',''],['POST','/claim'],['POST','/progress']])assert.equal((await request('finance',method,'/tickets/'+id+suffix,{status:'resolved',note:'Test'})).status,403);
 assert.equal((await request('finance')).status,403);assert.equal((await request('finance','POST','/tickets',{title:'Network fault'})).status,403);
 fixture.users.find(row=>row.role==='finance').ticketCreationAllowed=false;
 for(const path of ['/tickets','/service-options','/tickets/'+id])assert.equal((await request('finance','GET',path)).status,403);
 assert.equal((await request('finance','POST','/tickets',payload)).status,403);
});
test('per-user ticket grants take effect in an existing session, keep own-ticket scope and are revocable',async()=>{
 reset();assert.equal((await request('collector','GET','/tickets')).status,403);const collector=fixture.users.find(row=>row.role==='collector');collector.ticketCreationAllowed=true;
 const created=await request('collector','POST','/tickets',{category:'billing',customerName:'Unit',text:'Please check'});assert.equal(created.status,201);
 fixture.oltTickets.push({...created.body.ticket,id:'someone-else',createdBy:'admin'});
 assert.equal((await request('collector','GET','/tickets')).body.total,1);assert.equal((await request('collector','GET','/tickets/someone-else')).status,404);
 fixture.users.find(row=>row.role==='collector').ticketCreationAllowed=false;assert.equal((await request('collector','GET','/tickets')).status,403);
});
test.after(()=>{for(const id of sessions.values())auth.destroySession(id);fs.rmSync(directory,{recursive:true,force:true});});
test('automatic network integration defaults off and old stored values cannot accidentally opt in',()=>{
 assert.equal(storeModule.createDefaultStore().settings.networkIntegrationEnabled,false);
 for(const value of [undefined,false,'true',1,null,{},[]]){const data=storeModule.ensureShape({settings:{networkIntegrationEnabled:value}});assert.equal(data.settings.networkIntegrationEnabled,false);assert.equal(storeModule.publicSettings(data.settings).networkIntegrationEnabled,false);}
 assert.equal(storeModule.ensureShape({settings:{networkIntegrationEnabled:true}}).settings.networkIntegrationEnabled,true);assert.equal(storeModule.publicSettings({networkIntegrationEnabled:true}).networkIntegrationEnabled,true);
});
test('integration switch is persistent and audited, changes only settings/activity, and never deletes customer, ACS, OLT or finance records',async()=>{
 reset();fixture.settings.collectorDailyBonusPercent=3;const before=structuredClone({customers:fixture.customers,onus:fixture.oltDevices,invoices:fixture.invoices,payments:fixture.payments,waMessages:fixture.waMessages}),auto=require('../src/olt-auto-identity');let invalidations=0;const original=auto.invalidate;auto.invalidate=()=>{invalidations++;original();};
 try{for(const [role,enabled]of [['admin',true],['secretary',false],['admin',true]]){const response=await request(role,'PUT','/api/settings',{networkIntegrationEnabled:enabled});assert.equal(response.status,200);assert.equal(response.body.settings.networkIntegrationEnabled,enabled);assert.equal(fixture.settings.networkIntegrationEnabled,enabled);assert.deepEqual(lastSaveOptions,{collections:['activity'],includeCore:true});assert.equal(fixture.activity[0].meta.action,'network-integration-setting');assert.equal(fixture.activity[0].meta.role,role);assert.equal(fixture.activity[0].meta.enabled,enabled);}
  assert.equal(invalidations,3);assert.equal(fixture.settings.collectorDailyBonusPercent,3);const activities=fixture.activity.length,previousSaves=saves;assert.equal((await request('admin','PUT','/api/settings',{networkIntegrationEnabled:true})).status,200);assert.equal(invalidations,3);assert.equal(saves,previousSaves);assert.equal(fixture.activity.length,activities);assert.equal((await request('admin','GET','/api/settings')).body.settings.networkIntegrationEnabled,true);
  await request('admin','PUT','/api/settings',{appSubtitle:'Different label'});assert.equal(fixture.settings.networkIntegrationEnabled,true);assert.equal(invalidations,3);
  assert.deepEqual({customers:fixture.customers,onus:fixture.oltDevices,invoices:fixture.invoices,payments:fixture.payments,waMessages:fixture.waMessages},before);
 }finally{auto.invalidate=original;original();}
});
test('integration switch requires settings permission, valid CSRF and actual booleans without partial changes',async()=>{
 reset();for(const role of ['owner','collector','technician','finance','viewer','partner','reseller_voucher'])assert.equal((await request(role,'PUT','/api/settings',{networkIntegrationEnabled:true})).status,403);
 assert.equal((await request('','PUT','/api/settings',{networkIntegrationEnabled:true})).status,419);assert.equal((await request('admin','PUT','/api/settings',{networkIntegrationEnabled:true},false)).status,419);
 for(const value of ['true','false',1,0,null,{},[]])assert.equal((await request('admin','PUT','/api/settings',{networkIntegrationEnabled:value,businessName:'MUST NOT CHANGE'})).status,400);
 assert.equal(saves,0);assert.equal(fixture.settings.networkIntegrationEnabled,false);assert.notEqual(fixture.settings.businessName,'MUST NOT CHANGE');
});
test('OLT visibility allows collector and viewer but excludes finance and reseller roles',async()=>{
 reset();assert.equal((await request('', 'GET')).status,401);for(const role of ['reseller_voucher','finance','partner'])assert.equal((await request(role)).status,403);for(const role of ['collector','viewer'])assert.equal((await request(role)).status,200);assert.equal(saves,0);
});
test('admin manually adds edits and removes integration without touching invoices or secrets in responses',async()=>{
 reset();const before=structuredClone({customers:fixture.customers,invoices:fixture.invoices,payments:fixture.payments,waMessages:fixture.waMessages});
 const created=await request('admin','POST','',{name:'OLT Unit',host:'192.0.2.1',community:'PrivateUnit',nasId:'nas-a',enabled:true});assert.equal(created.status,201);const id=created.body.device.id;assert(!JSON.stringify(created.body).includes('PrivateUnit'));
 assert(fixture.oltDevices[0].communityEnc.startsWith('v1:'));const secret=fixture.oltDevices[0].communityEnc;
 const edited=await request('admin','PUT','/'+id,{name:'Changed',community:'',latitude:-0.5,longitude:117.1});assert.equal(edited.status,200);assert.equal(fixture.oltDevices[0].communityEnc,secret);
 const list=await request('admin');assert.equal(list.body.devices[0].name,'Changed');assert(!JSON.stringify(list.body).includes('communityEnc'));assert.equal(list.body.notificationEnabled,false);
 assert.equal((await request('admin','DELETE','/'+id)).status,400);assert.equal((await request('admin','DELETE','/'+id,{confirmId:id,confirmName:'Unit',confirmDelete:true})).status,400);
 assert.equal((await request('admin','DELETE','/'+id,{confirmId:id,confirmName:'Changed',confirmDelete:true})).status,200);assert.equal(fixture.oltDevices.length,0);
 assert.deepEqual({customers:fixture.customers,invoices:fixture.invoices,payments:fixture.payments,waMessages:fixture.waMessages},before);
});
test('device mutations keep CSRF and input checks; technical readers cannot edit credentials',async()=>{
 reset();const data={name:'Unit',host:'192.0.2.1',community:'Unit'};assert.equal((await request('admin','POST','',data,false)).status,419);
 assert.equal((await request('admin','POST','',{...data,host:'127.0.0.1'})).status,400);assert.equal((await request('technician','POST','',data)).status,403);assert.equal((await request('finance','POST','',data)).status,403);assert.equal(saves,0);
});
test('NAS-scoped technician sees only assigned OLT and cannot read or refresh another OLT',async()=>{
 reset();const a=await request('admin','POST','',{name:'A',host:'192.0.2.1',community:'Unit',nasId:'nas-a'}),b=await request('admin','POST','',{name:'B',host:'192.0.2.2',community:'Unit',nasId:'nas-b'});
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-a'];
 const listed=await request('technician');assert.deepEqual(listed.body.devices.map(row=>row.id),[a.body.device.id]);assert(!('host'in listed.body.devices[0]));
 assert.equal((await request('technician','GET','/'+b.body.device.id)).status,404);assert.equal((await request('technician','POST','/'+b.body.device.id+'/refresh',{})).status,404);
 assert.equal((await request('admin','POST','/'+a.body.device.id+'/refresh',{})).status,400);
});
test('manual ticket is auditable, cannot duplicate fault, and dispatches no WhatsApp',async()=>{
 reset();const device=await request('admin','POST','',{name:'Unit',host:'192.0.2.1',community:'Unit'}),id=device.body.device.id;
 const created=await request('technician','POST','/tickets',{oltId:id,title:'Unit fault',description:'Checked',assignedTo:'technician'});assert.equal(created.status,201);assert(created.body.message.includes('Unit fault'));
 assert.equal((await request('secretary','POST','/tickets',{oltId:id,title:'Duplicate'})).status,400);
 const done=await request('secretary','PUT','/tickets/'+created.body.ticket.id,{status:'resolved',description:'Recovered'});assert.equal(done.status,200);assert.equal(done.body.ticket.status,'resolved');
 assert.equal(fixture.waMessages.length,0);assert(fixture.activity.some(row=>row.meta?.action==='olt-ticket'));
 assert.equal((await request('admin','DELETE','/'+id,{confirmId:id,confirmName:'Unit',confirmDelete:true})).status,400);assert.equal(fixture.oltTickets.length,1);
});
test('ONU list requires a selected OLT without weakening authentication or technician NAS boundaries',async()=>{
 reset();const a=await request('admin','POST','',{name:'A',host:'192.0.2.1',community:'Unit',nasId:'nas-a'}),b=await request('admin','POST','',{name:'B',host:'192.0.2.2',community:'Unit',nasId:'nas-b'});
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-a'];assert.equal((await request('','GET','/onus')).status,401);
 const result=await request('technician','GET','/onus?oltId=all');assert.equal(result.status,200);assert.deepEqual(result.body.devices.map(row=>row.id),[a.body.device.id]);assert(!JSON.stringify(result.body).includes(b.body.device.id));
 const forced=await request('technician','GET','/onus?oltId='+b.body.device.id);assert.equal(forced.status,200);assert.equal(forced.body.devices.length,0);
 const aggregate=await request('admin','GET','/onus?oltId=all');assert.equal(aggregate.status,200);assert(aggregate.body.selectionRequired);assert.equal(aggregate.body.devices.length,0);assert.equal(aggregate.body.onus.length,0);
});
test('ONU actions preserve CSRF, roles, NAS scopes and isolated-dev restrictions',async()=>{
 reset();const device=await request('admin','POST','',{name:'A',host:'192.0.2.1',community:'Unit',nasId:'nas-a'}),suffix='/'+device.body.device.id+'/onus/HWTCAABBCCDD';
 for(const role of ['finance','collector','reseller_voucher'])assert.equal((await request(role,'DELETE',suffix,{serialNumber:'HWTCAABBCCDD',confirmDelete:true})).status,403);
 for(const [method,path,payload]of [['DELETE',suffix,{serialNumber:'HWTCAABBCCDD',confirmDelete:true}],['POST',suffix+'/reboot',{serialNumber:'HWTCAABBCCDD',confirmReboot:true}]]){
  assert.equal((await request('secretary',method,path,payload,false)).status,419);
  const allowed=await request('secretary',method,path,payload);assert.equal(allowed.status,400);assert.match(allowed.body.error,/Mode dev terisolasi/);
 }
 assert.equal((await request('admin','DELETE',suffix,{serialNumber:'HWTCAABBCCDD',confirmDelete:true},false)).status,419);
 assert.equal((await request('technician','DELETE',suffix,{serialNumber:'HWTCAABBCCDD',confirmDelete:true})).status,400);
 assert.equal((await request('technician','POST',suffix+'/reboot',{serialNumber:'HWTCAABBCCDD',confirmReboot:true})).status,400);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('technician','DELETE',suffix,{serialNumber:'HWTCAABBCCDD',confirmDelete:true})).status,404);
 assert.equal(fixture.waMessages.length,0);
});
test('deletion preview requires authenticated role and NAS scope and never writes business data',async t=>{
 reset();const created=await request('admin','POST','',{name:'Preview',host:'192.0.2.120',community:'unit',nasId:'nas-a'}),suffix='/'+created.body.device.id+'/onus/HWTCAABBCCDD/deletion?onuIndex=4718593',removal=require('../src/olt-device-removal');let calls=0;
 t.mock.method(removal,'preview',async(data,device,sn,selector,actor)=>{calls++;assert.equal(selector.onuIndex,'4718593');assert.equal(sn,'HWTCAABBCCDD');assert(actor.id);return{canSubmit:false,olt:{state:'simulated'},acs:{state:'simulated'}};});
 assert.equal((await request('','GET',suffix)).status,401);for(const role of ['collector','viewer','finance','reseller_voucher'])assert.equal((await request(role,'GET',suffix)).status,403);
 const before=saves;for(const role of ['admin','secretary','technician'])assert.equal((await request(role,'GET',suffix)).status,200);assert.equal(saves,before);assert.equal(calls,3);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('technician','GET',suffix)).status,404);assert.equal(calls,3);
});
test('DELETE uses the guarded cascade service and records separate stage results without altering finance',async t=>{
 reset();const created=await request('admin','POST','',{name:'Removal',host:'192.0.2.121',community:'unit',nasId:'nas-a'}),suffix='/'+created.body.device.id+'/onus/HWTCAABBCCDD',removal=require('../src/olt-device-removal'),before=structuredClone({invoices:fixture.invoices,payments:fixture.payments,customers:fixture.customers,radiusUsers:fixture.radiusUsers});
 let complete=false,calls=0;t.mock.method(removal,'remove',async(data,device,sn,payload,actor,options)=>{calls++;assert.equal(payload.token,'opaque');assert.equal(actor.id,'admin');assert.equal(await options.getData(),fixture);return{complete,cascade:true,message:'Stage result',olt:{state:'deleted'},acs:{state:complete?'deleted':'failed'}};});
 const payload={serialNumber:'HWTCAABBCCDD',onuIndex:'4718593',confirmDelete:true,token:'opaque'};
 try{process.env.MIGRATION_MODE='0';const liveModule=new Module(serverPath,module);liveModule.filename=serverPath;liveModule.paths=serverModule.paths;liveModule.require=serverModule.require;liveModule._compile(fs.readFileSync(serverPath,'utf8')+'\nmodule.exports.__test.oltApi=handleApi;',serverPath);
  const invoke=async(validCsrf=true)=>{const id=sessions.get('admin'),req=Readable.from([Buffer.from(JSON.stringify(payload))]);req.method='DELETE';req.url='/api/monitoring/olt'+suffix;req.socket={remoteAddress:'127.0.0.1'};req.headers={host:'localhost:8891',origin:'http://localhost:8891','content-type':'application/json',cookie:auth.SESSION_COOKIE+'='+id,'x-csrf-token':validCsrf?auth.csrfTokenForSessionId(id):'bad'};const response=apiResponse();await liveModule.exports.__test.oltApi(req,response,new URL(req.url,'http://localhost:8891'));return response;};
  assert.equal((await invoke(false)).status,419);assert.equal(calls,0);const partial=await invoke();assert.equal(partial.status,207,JSON.stringify(partial.body));assert.equal(partial.body.acs.state,'failed');assert.equal(fixture.activity[0].meta.acsState,'failed');complete=true;assert.equal((await invoke()).status,200);assert.equal(fixture.activity[0].meta.oltState,'deleted');assert.deepEqual({invoices:fixture.invoices,payments:fixture.payments,customers:fixture.customers,radiusUsers:fixture.radiusUsers},before);}
 finally{process.env.MIGRATION_MODE='1';}
});
test('connection diagnostics use unsaved form values without saving; only management roles and valid CSRF allowed',async t=>{
 reset();const created=await request('admin','POST','',{name:'Diagnostics',host:'192.0.2.160',community:'StoredSecret',cliEnabled:true,cliUsername:'unit',cliPassword:'StoredCli'}),path='/'+created.body.device.id+'/connection-test',before=structuredClone(fixture),saved=saves;let calls=0;
 t.mock.method(require('../src/olt-monitor'),'testConnection',async(data,device,kind)=>{calls++;assert.equal(kind,'snmp');assert.equal(device.host,'192.0.2.161');assert.equal(require('../src/secure-secrets').decryptSecret(data,device.communityEnc),'StoredSecret');return{ok:true,kind,elapsedMs:2,message:'Connected'};});
 try{process.env.MIGRATION_MODE='0';const live=new Module(serverPath,module);live.filename=serverPath;live.paths=serverModule.paths;live.require=serverModule.require;live._compile(fs.readFileSync(serverPath,'utf8')+'\nmodule.exports.__test.api=handleApi;',serverPath);const handler=live.exports.__test.api,body={kind:'snmp',host:'192.0.2.161',community:''};
  assert.equal((await request('admin','POST',path,body,false,handler)).status,419);for(const role of ['technician','finance','collector','viewer','reseller_voucher'])assert.equal((await request(role,'POST',path,body,true,handler)).status,403);
  for(const role of ['admin','secretary'])assert.equal((await request(role,'POST',path,body,true,handler)).status,200);assert.equal(calls,2);assert.equal((await request('admin','POST',path,{...body,host:'127.0.0.1'},true,handler)).status,400);assert.equal((await request('admin','POST','/missing/connection-test',body,true,handler)).status,404);assert.equal(saves,saved);assert.deepEqual(fixture,before);
 }finally{process.env.MIGRATION_MODE='1';}
});
test('all-OLT refresh keeps role, CSRF, dev and visible NAS boundaries without saving',async t=>{
 reset();await request('admin','POST','',{name:'Refresh',host:'192.0.2.162',community:'Unit',nasId:'nas-a'});fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];let calls=0;
 t.mock.method(require('../src/olt-monitor'),'requestRefreshAll',(data,devices)=>{calls++;assert.equal(devices.length,0);return{queued:0,skipped:0,pending:0};});const saved=saves;
 assert.equal((await request('technician','POST','/refresh',{},false)).status,419);assert.equal((await request('finance','POST','/refresh')).status,403);assert.equal((await request('technician','POST','/refresh')).status,202);assert.equal(calls,1);assert.equal(saves,saved);
});
test('Save Config API enforces management role and CSRF and audits only the confirmed result',async t=>{
 reset();const created=await request('admin','POST','',{name:'Save Unit',host:'192.0.2.185',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit'}),id=created.body.device.id,path='/'+id+'/save-config',before=structuredClone({customers:fixture.customers,invoices:fixture.invoices,payments:fixture.payments,settings:fixture.settings,oltDevices:fixture.oltDevices});let calls=0;
 t.mock.method(require('../src/olt-monitor'),'saveConfig',async()=>{calls++;return{confirmed:true,message:'Saved'};});
 try{process.env.MIGRATION_MODE='0';const live=new Module(serverPath,module);live.filename=serverPath;live.paths=serverModule.paths;live.require=serverModule.require;live._compile(fs.readFileSync(serverPath,'utf8')+'\nmodule.exports.__test.api=handleApi;',serverPath);const handler=live.exports.__test.api;
  assert.equal((await request('admin','POST',path,{},false,handler)).status,419);for(const role of ['technician','finance','collector','viewer','reseller_voucher'])assert.equal((await request(role,'POST',path,{},true,handler)).status,403);assert.equal(calls,0);assert.equal((await request('secretary','POST',path,{},true,handler)).status,200);assert.equal(calls,1);assert.equal(fixture.activity[0].meta.action,'olt-save-config');assert.equal(fixture.activity[0].meta.userId,'secretary');assert.equal(lastSaveOptions.includeCore,false);assert.deepEqual({customers:fixture.customers,invoices:fixture.invoices,payments:fixture.payments,settings:fixture.settings,oltDevices:fixture.oltDevices},before);
 }finally{process.env.MIGRATION_MODE='1';}
});
test('OLT reboot marker is persisted before command, preserves CSRF/NAS/role checks and leaves financial data unchanged',async t=>{
 reset();const created=await request('admin','POST','',{name:'Reboot Unit',host:'192.0.2.188',community:'unit',nasId:'nas-a'}),id=created.body.device.id,path='/'+id+'/onus/HWTCAABB0001/reboot',body={serialNumber:'HWTCAABB0001',onuIndex:'4718593',confirmReboot:true},before=structuredClone({customers:fixture.customers,invoices:fixture.invoices,payments:fixture.payments,radiusUsers:fixture.radiusUsers});let commands=0;
 t.mock.method(require('../src/olt-monitor'),'rebootOnu',async()=>{commands++;assert.equal(fixture.settings.plannedOnuReboots.length,1);assert.equal(fixture.settings.plannedOnuReboots[0].oltId,id);assert.equal(fixture.settings.plannedOnuReboots[0].serialNumber,body.serialNumber);return{message:'Reboot accepted',serialNumber:body.serialNumber};});
 try{process.env.MIGRATION_MODE='0';const live=new Module(serverPath,module);live.filename=serverPath;live.paths=serverModule.paths;live.require=serverModule.require;live._compile(fs.readFileSync(serverPath,'utf8')+'\nmodule.exports.__test.api=handleApi;',serverPath);const handler=live.exports.__test.api;
  assert.equal((await request('admin','POST',path,body,false,handler)).status,419);assert.equal((await request('collector','POST',path,body,true,handler)).status,403);fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('technician','POST',path,body,true,handler)).status,404);assert.equal(commands,0);
  assert.equal((await request('admin','POST',path,body,true,handler)).status,200);assert.equal(commands,1);assert.equal((await request('admin','POST',path,body,true,handler)).status,429);assert.equal(commands,1);assert.deepEqual({customers:fixture.customers,invoices:fixture.invoices,payments:fixture.payments,radiusUsers:fixture.radiusUsers},before);
 }finally{process.env.MIGRATION_MODE='1';}
});
test('ACS single and batch reboots use persistent serial-normalized guards; explicit task rejection releases marker',async t=>{
 reset();let calls=0;t.mock.method(require('../src/genieacs'),'reboot',async(_,id)=>{calls++;const sn=require('../src/olt-planned-reboot').fromDeviceId(id);assert(fixture.settings.plannedOnuReboots.some(row=>row.serialNumber===sn));if(sn==='HWTC11223344'){const error=Error('Rejected');error.status=403;throw error;}return{_id:'accepted'};});
 try{process.env.MIGRATION_MODE='0';const live=new Module(serverPath,module);live.filename=serverPath;live.paths=serverModule.paths;live.require=serverModule.require;live._compile(fs.readFileSync(serverPath,'utf8')+'\nmodule.exports.__test.api=handleApi;',serverPath);const handler=live.exports.__test.api,id='00259E-ONT-48575443AABB0001';
  assert.equal((await request('admin','POST','/api/genieacs/devices/'+id+'/reboot',{},true,handler)).status,200);assert.equal(fixture.settings.plannedOnuReboots[0].serialNumber,'HWTCAABB0001');const batch=await request('admin','POST','/api/genieacs/devices/batch',{action:'reboot',ids:['00259E-ONT-HWTC55667788','00259E-ONT-HWTC11223344']},true,handler);assert.equal(batch.status,200);assert.equal(batch.body.successCount,1);assert.equal(batch.body.failedCount,1);assert.equal(calls,3);assert(!fixture.settings.plannedOnuReboots.some(row=>row.serialNumber==='HWTC11223344'));
 }finally{process.env.MIGRATION_MODE='1';}
});
test('background LOS reconciliation persists tickets once, audits creation and never enqueues WhatsApp',async()=>{
 reset();const created=await request('admin','POST','',{name:'Unit',host:'192.0.2.90',community:'unit'}),olt=require('../src/olt-monitor'),original=olt.snapshotFor;
 const before=structuredClone({customers:fixture.customers,invoices:fixture.invoices,payments:fixture.payments,waMessages:fixture.waMessages}),savesBefore=saves,at=Date.now();
 const snapshot={status:'online',checkedAt:new Date(at-359000).toISOString(),onus:[{serialNumber:'HWTCAABBCCDD',ponKey:'0/0/1',name:'Unit Client',status:'offline',condition:'los',causeKnown:true,downCause:'LOS'}],ports:[]};olt.snapshotFor=async()=>snapshot;
 try{for(const offset of[-359000,-179000]){snapshot.checkedAt=new Date(at+offset).toISOString();const waiting=await serverModule.exports.__test.syncOltLosTickets();assert.equal(waiting.created.length,0);assert.equal(fixture.oltTickets.length,0);assert.equal(fixture.waMessages.length,0);}
 snapshot.checkedAt=new Date(at+1000).toISOString();const result=await serverModule.exports.__test.syncOltLosTickets();assert.equal(result.created.length,1);assert.equal(saves,savesBefore+3);assert(fixture.activity.some(row=>row.meta?.action==='olt-los-ticket-auto'));assert.equal(fixture.oltTickets[0].source,'olt-los');assert.equal(fixture.oltTickets[0].assignedTo,'');
 await serverModule.exports.__test.syncOltLosTickets();assert.equal(saves,savesBefore+3);assert.equal(fixture.oltTickets.length,1);
 const listed=await request('secretary');assert.equal(listed.body.ticketAutomation.enabled,true);assert.equal(listed.body.ticketAutomation.whatsappEnabled,false);assert.equal((await request('secretary','GET','/tickets')).body.tickets[0].serialNumber,'HWTCAABBCCDD');
 const changed=await request('admin','PUT','/tickets/'+fixture.oltTickets[0].id,{serialNumber:'HWTCAABB0001'});assert.equal(changed.status,400);
 assert.deepEqual({customers:fixture.customers,invoices:fixture.invoices,payments:fixture.payments,waMessages:fixture.waMessages},before);
 }finally{olt.snapshotFor=original;}
});
test('claim and progress serialize competing claims, check CSRF and keep WhatsApp inactive',async()=>{
 reset();const device=await request('admin','POST','',{name:'Workflow',host:'192.0.2.91',community:'unit'}),created=await request('admin','POST','/tickets',{oltId:device.body.device.id,title:'LOS Workflow',serialNumber:'HWTCAABBCCDD',pon:'0/0/1'}),id=created.body.ticket.id;
 assert.equal((await request('technician','POST','/tickets/'+id+'/claim',{},false)).status,419);
 const claims=await Promise.all([request('technician','POST','/tickets/'+id+'/claim'),request('noc','POST','/tickets/'+id+'/claim')]);assert.deepEqual(claims.map(row=>row.status).sort(),[200,409]);const winner=fixture.oltTickets[0].assignedTo;assert(['technician','noc'].includes(winner));
 const saved=saves;assert.equal((await request(winner,'POST','/tickets/'+id+'/claim')).status,200);assert.equal(saves,saved);
 if(winner==='noc')assert.equal((await request('technician','POST','/tickets/'+id+'/progress',{note:'Cannot alter another technician'})).status,403);
 assert.equal((await request(winner,'POST','/tickets/'+id+'/progress',{note:'Pengecekan konektor'})).status,200);assert.equal(fixture.oltTickets[0].status,'working');assert.equal(fixture.oltTickets[0].history.at(-1).note,'Pengecekan konektor');
 const preview=await request('secretary','GET','/tickets/'+id+'/message?kind=progress');assert.equal(preview.status,200);assert(preview.body.message.includes('Pengecekan konektor'));assert.equal(preview.body.whatsappEnabled,false);
 assert.equal((await request(winner,'POST','/tickets/'+id+'/progress',{note:'Perbaikan selesai',status:'resolved'})).status,403);assert.equal((await request('secretary','POST','/tickets/'+id+'/progress',{note:'Perbaikan selesai',status:'resolved'})).status,200);assert.equal(fixture.oltTickets[0].status,'resolved');assert.equal(fixture.waMessages.length,0);
});
test('templates and ticket workflow preserve role and NAS boundaries',async()=>{
 reset();const a=await request('admin','POST','',{name:'A',host:'192.0.2.92',community:'unit',nasId:'nas-a'}),created=await request('admin','POST','/tickets',{oltId:a.body.device.id,title:'Scoped fault'}),id=created.body.ticket.id;
 for(const role of ['finance','collector','reseller_voucher'])for(const [method,suffix]of [['POST','/claim'],['POST','/progress'],['GET','/message']])assert.equal((await request(role,method,'/tickets/'+id+suffix,{note:'Test'})).status,role==='finance'&&method==='GET'?200:403);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];for(const [method,suffix]of [['POST','/claim'],['POST','/progress'],['GET','/message']])assert.equal((await request('technician',method,'/tickets/'+id+suffix,{note:'Test'})).status,404);
 assert.equal((await request('technician','PUT','/ticket-templates',{detected:'Text'})).status,403);assert.equal((await request('secretary','PUT','/ticket-templates',{detected:'Text'})).status,200);assert.equal((await request('admin','PUT','/ticket-templates',{detected:'Text'},false)).status,419);
 assert.equal((await request('admin','PUT','/ticket-templates',{detected:'Custom [ticket_no]'})).status,200);assert((await request('admin','GET','/tickets/'+id+'/message')).body.message.startsWith('Custom TKT-'));assert.equal((await request('admin','PUT','/ticket-templates',{detected:''})).status,400);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=[];assert.equal((await request('technician','PUT','/tickets/'+id,{status:'working'})).status,409);assert.equal((await request('technician','PUT','/tickets/'+id,{assignedTo:'noc'})).status,403);assert.equal(fixture.waMessages.length,0);
});
test('direct ticket links require a permitted session and GET never claims the ticket',async()=>{
 reset();const device=await request('admin','POST','',{name:'Direct',host:'192.0.2.94',community:'unit',nasId:'nas-a'}),created=await request('admin','POST','/tickets',{oltId:device.body.device.id,title:'Link ticket',serialNumber:'HWTCAABBCCDD'}),path='/tickets/'+created.body.ticket.id;
 const before=saves;assert.equal((await request('','GET',path)).status,401);const finance=await request('finance','GET',path);assert.equal(finance.status,200);assert.equal(finance.body.canClaim,false);assert.equal(finance.body.canProgress,false);assert.equal((await request('collector','GET',path)).status,403);
 for(const role of ['technician','secretary']){const response=await request(role,'GET',path);assert.equal(response.status,200);assert.equal(response.body.canClaim,true);assert.equal(response.body.ticket.assignedTo,'');assert(!JSON.stringify(response.body).includes('community'));}
 assert.equal(saves,before);fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('technician','GET',path)).status,404);assert.equal(fixture.oltTickets[0].assignedTo,'');
});
test('notification switch is opt-in, CSRF-protected and cancels only ticket messages',async()=>{
 reset();fixture.settings.paymentGateway.publicBaseUrl='https://billing.example.test';fixture.users.find(row=>row.role==='technician').phone='081200000001';fixture.users.find(row=>row.role==='secretary').phone='081200000002';
 const body={whatsappEnabled:true,recipientIds:['technician','secretary']};assert.equal((await request('secretary','PUT','/ticket-settings',body,false)).status,419);assert.equal((await request('admin','PUT','/ticket-settings',body,false)).status,419);assert.equal((await request('admin','PUT','/ticket-settings',{...body,recipientIds:['finance']})).status,400);
 assert.equal((await request('admin','PUT','/ticket-settings',body)).status,200);const listed=await request('admin');assert.equal(listed.body.ticketSettings.whatsappEnabled,true);assert.equal(listed.body.notificationEnabled,true);assert.equal((await request('technician')).body.ticketRecipientOptions,undefined);
 fixture.waMessages=[{id:'wa-olt',type:'oltTicket',status:'queued',queueRevision:0},{id:'wa-invoice',type:'paymentPaid',status:'queued'}];assert.equal((await request('admin','PUT','/ticket-settings',{whatsappEnabled:false,recipientIds:['technician']})).status,200);assert.equal(fixture.waMessages[0].status,'cancelled');assert.equal(fixture.waMessages[1].status,'queued');
});
test('automatic tickets close only after confirmed recovery and record one audited resolution',async()=>{
 reset();await request('admin','POST','',{name:'Recovery',host:'192.0.2.95',community:'unit'});const olt=require('../src/olt-monitor'),original=olt.snapshotFor,at=Date.now();
 const snapshot={status:'online',checkedAt:new Date(at).toISOString(),onus:[{serialNumber:'HWTCAABBCCDD',ponKey:'0/0/1',name:'Unit Client',status:'offline',condition:'los',causeKnown:true,downCause:'LOS'}],ports:[]};olt.snapshotFor=async()=>snapshot;
 require('./helpers/confirmed-los')(fixture,[{deviceId:fixture.oltDevices[0].id,snapshot}]);
 try{await serverModule.exports.__test.syncOltLosTickets();assert.equal(fixture.oltTickets.length,1);snapshot.checkedAt=new Date(at+1000).toISOString();snapshot.onus[0]={...snapshot.onus[0],status:'online',condition:'online'};const result=await serverModule.exports.__test.syncOltLosTickets();assert.equal(result.resolved.length,1);assert.equal(fixture.oltTickets[0].status,'resolved');assert.equal(fixture.oltTickets[0].autoResolved,true);assert(fixture.activity.some(row=>row.meta?.action==='olt-los-ticket-recovered'));const before=saves;await serverModule.exports.__test.syncOltLosTickets();assert.equal(saves,before);assert.equal(fixture.waMessages.length,0);}finally{olt.snapshotFor=original;}
});
test('WA worker blocks disabled ticket messages before any transport request',async()=>{
 reset();fixture.waMessages=[{id:'ticket-msg',type:'oltTicket',status:'queued',queueRevision:0},{id:'paid-msg',type:'paymentPaid',status:'queued',queueRevision:0}];
 const result=await serverModule.exports.__test.oltQueueJob({data:{messageId:'ticket-msg',revision:0}});assert.equal(result.skipped,true);assert.equal(result.reason,'olt-ticket-notification-disabled');assert.equal(fixture.waMessages[0].status,'cancelled');assert.equal(fixture.waMessages[0].queueRevision,1);assert.equal(fixture.waMessages[1].status,'queued');
});
test('ticket center is scoped, paginated, read-only and never polls an OLT',async()=>{
 reset();const a=await request('admin','POST','',{name:'A',host:'192.0.2.96',community:'unit',nasId:'nas-a'}),b=await request('admin','POST','',{name:'B',host:'192.0.2.97',community:'unit',nasId:'nas-b'});
 fixture.oltTickets=Array.from({length:30},(_,i)=>({id:'ticket-'+i,number:'UNIT-'+i,title:'LOS '+i,oltId:i===29?b.body.device.id:a.body.device.id,scope:'onu',serialNumber:'HWTC'+String(i).padStart(8,'0'),status:i<10?'resolved':'new',updatedAt:new Date(1700000000000+i*1000).toISOString(),history:[{note:'Private full history'}],description:'Internal description'}));
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-a'];const before=saves,olt=require('../src/olt-monitor'),original=olt.snapshotFor;olt.snapshotFor=()=>{throw new Error('Ticket list must not poll');};
 try{assert.equal((await request('','GET','/tickets')).status,401);assert.equal((await request('collector','GET','/tickets')).status,403);
 const result=await request('technician','GET','/tickets?limit=10');assert.equal(result.status,200);assert.equal(result.body.total,19);assert.equal(result.body.tickets.length,10);assert.equal(result.body.counts.resolved,10);assert(result.body.tickets.every(row=>row.oltId===a.body.device.id));assert(!JSON.stringify(result.body).includes('Private full history'));assert(!JSON.stringify(result.body).includes('Internal description'));
 const next=await request('technician','GET','/tickets?limit=10&page=2');assert.equal(next.body.tickets.length,9);assert.notEqual(next.body.tickets[0].id,result.body.tickets[0].id);assert.equal((await request('technician','GET','/tickets?nasId=nas-b')).body.total,0);
 assert.equal((await request('secretary','GET','/tickets?status=resolved')).body.total,10);assert.equal((await request('admin','GET','/tickets?search=UNIT-29')).body.total,1);assert.equal(saves,before);
 }finally{olt.snapshotFor=original;}
});
async function ticketOutbox(){
 reset();const created=await request('admin','POST','',{name:'WA Test',host:'192.0.2.98',community:'unit',nasId:'nas-a'});fixture.users.find(user=>user.role==='technician').phone='081200000001';fixture.settings.waGateway.enabled=true;fixture.settings.oltTicketing={whatsappEnabled:true,recipientIds:['technician']};
 fixture.oltTickets=[{id:'ticket-unit',number:'TICKET-UNIT',oltId:created.body.device.id,serialNumber:'HWTCAABBCCDD',scope:'onu',status:'new',assignedTo:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}];
 const ticketing=require('../src/olt-ticketing');ticketing.enqueueNotifications(fixture,fixture.oltTickets[0],'detected','https://billing.example.test',(data,payload)=>{const message={...payload,id:'wa-unit',status:'queued',queueRevision:0};data.waMessages.push(message);return message;});return fixture.waMessages[0];
}
test('WA worker stores the cooldown only after confirmed delivery and prevents replay',async()=>{
 const message=await ticketOutbox();let sent=0;const restore=serverModule.exports.__test.stubOltTransport(async()=>{sent++;return{providerMessageId:'provider-unit'};});
 try{const result=await serverModule.exports.__test.oltQueueJob({data:{messageId:message.id,revision:0}});assert.equal(result.sent,true);assert.equal(sent,1);assert.equal(fixture.waMessages[0].status,'sent');assert.equal(lastSaveOptions.includeCore,true);assert.equal(Object.keys(fixture.settings.oltTicketing.notificationCooldowns).length,1);assert.equal((await serverModule.exports.__test.oltQueueJob({data:{messageId:message.id,revision:0}})).skipped,true);assert.equal(sent,1);}finally{restore();}
});
test('disabling notifications during throttle wait stops delivery without touching a payment message',async()=>{
 const message=await ticketOutbox();fixture.waMessages.push({id:'payment-unit',type:'paymentPaid',status:'queued'});let sent=0;const restore=serverModule.exports.__test.stubOltTransport(async()=>{sent++;return{};},async()=>{fixture.settings.oltTicketing.whatsappEnabled=false;});
 try{const result=await serverModule.exports.__test.oltQueueJob({data:{messageId:message.id,revision:0}});assert.equal(result.skipped,true);assert.equal(sent,0);assert.equal(fixture.waMessages[0].status,'cancelled');assert.equal(fixture.waMessages[1].status,'queued');}finally{restore();}
});
test('claim API immediately cancels pending fault broadcasts without adding a claim notification',async()=>{
 const message=await ticketOutbox();const result=await request('technician','POST','/tickets/ticket-unit/claim');assert.equal(result.status,200);assert.equal(fixture.waMessages.length,1);assert.equal(fixture.waMessages[0].id,message.id);assert.equal(fixture.waMessages[0].status,'cancelled');assert.equal(fixture.oltTickets[0].assignedTo,'technician');
});
test('manual resend cannot restore cancelled ticket messages, including mixed batch requests',async()=>{
 reset();fixture.waMessages=[{id:'cancelled-ticket',type:'oltTicket',status:'cancelled',queueRevision:3},{id:'invoice-message',type:'invoiceIssued',status:'failed',queueRevision:0}];
 assert.equal((await request('admin','POST','/api/wa-gateway/messages/cancelled-ticket/send')).status,400);assert.equal(fixture.waMessages[0].status,'cancelled');assert.equal((await request('admin','POST','/api/wa-gateway/messages/batch-resend',{ids:['cancelled-ticket']})).status,400);
 const result=await request('admin','POST','/api/wa-gateway/messages/batch-resend',{ids:['cancelled-ticket','invoice-message']});assert.equal(result.status,200);assert.equal(fixture.waMessages[0].status,'cancelled');assert.equal(fixture.waMessages[0].queueRevision,3);assert.equal(fixture.waMessages[1].status,'queued');
});

const serviceTickets=require('../src/service-tickets');
const PHOTO_A='11111111-1111-4111-8111-111111111111',PHOTO_B='22222222-2222-4222-8222-222222222222';
function serviceFixture(){
 reset();fixture.settings.wifiKu.enabled=true;
 fixture.customers=[{id:'member-a',name:'Member A',username:'pppoe-a',nasId:'nas-a',status:'active',password:'PRIVATE_PASSWORD_A'},{id:'member-b',name:'Member B',username:'pppoe-b',nasId:'nas-b',status:'active',password:'PRIVATE_PASSWORD_B'}];
 fixture.radiusNas=[{id:'nas-a',name:'NAS A'},{id:'nas-b',name:'NAS B'}];
 fixture.radiusUsers=[{id:'radius-a',customerId:'member-a',username:'pppoe-a',nasId:'nas-a',status:'active',password:'PRIVATE_RADIUS_A'},{id:'radius-b',customerId:'member-b',username:'pppoe-b',nasId:'nas-b',status:'active',password:'PRIVATE_RADIUS_B'}];
 fixture.invoices=[{id:'invoice-a',customerId:'member-a',status:'unpaid',amount:150000}];fixture.payments=[{id:'payment-b',customerId:'member-b',amount:100000}];
 return fixture.customers.map(customer=>serverModule.exports.__test.createWifiKuSession(fixture,customer));
}
function businessState(){return structuredClone({customers:fixture.customers,radiusUsers:fixture.radiusUsers,invoices:fixture.invoices,payments:fixture.payments,waMessages:fixture.waMessages});}
async function seedService(index=0,payload={}){
 const customer=fixture.customers[index];return(await serviceTickets.create(fixture,customer,{category:'internet-down',text:'Customer '+index+' report',...payload},{now:Date.now()-60000,nasId:customer.nasId,nasName:index?'NAS B':'NAS A'})).ticket;
}
async function wifiRequest(token,method='GET',suffix='',body={},headers={}){
 const uri='/api/public/wifiku/tickets'+suffix,req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method=method;req.url=uri;req.socket={remoteAddress:'127.0.0.1'};
 req.headers={host:'localhost:8891',origin:'http://localhost:8891','content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...headers};
 const res=apiResponse();await handle(req,res,new URL(uri,'http://localhost:8891'));return res;
}

test('staff ticket detail and WA preview derive missing member data while keeping NAS scope and all business data intact',async()=>{
 serviceFixture();const ticket=await seedService();
 Object.assign(fixture.customers[0],{name:'Current Member Name',phone:'081200000001',address:'Full Customer Address',latitude:-0.5,longitude:117.15});
 fixture.settings.paymentGateway={...(fixture.settings.paymentGateway||{}),publicBaseUrl:'https://billing.example.test'};
 const before=structuredClone(fixture),detail=await request('technician','GET','/tickets/'+ticket.id);
 assert.equal(detail.status,200);assert.equal(detail.body.ticket.customerName,'Current Member Name');assert.equal(detail.body.ticket.contactPhone,'081200000001');assert.equal(detail.body.ticket.contactAddress,'Full Customer Address');assert(detail.body.ticket.locationUrl.includes('destination=-0.5%2C117.15'));assert.equal(detail.body.ticket.nasId,'nas-a');
 const preview=await request('technician','GET','/tickets/'+ticket.id+'/message');assert.equal(preview.status,200);assert(preview.body.message.includes('Full Customer Address'));assert(!preview.body.message.includes('NAS:'));
 assert.deepEqual(fixture,before);assert.equal(saves,0);
 fixture.users.find(user=>user.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('technician','GET','/tickets/'+ticket.id)).status,404);
});

test('claimed service ticket progress supports optional notes and exposes customer-safe milestones only',async()=>{
 const [a,b]=serviceFixture(),ticket=await seedService(),before=businessState();
 assert.equal((await request('technician','POST','/tickets/'+ticket.id+'/progress',{stage:'checking'})).status,409);
 assert.equal((await request('technician','POST','/tickets/'+ticket.id+'/claim')).status,200);
 let response=await request('technician','POST','/tickets/'+ticket.id+'/progress',{stage:'on-way',note:'PRIVATE_INTERNAL_NOTE',publicNote:'Petugas sedang menuju lokasi.'});assert.equal(response.status,200);
 response=await wifiRequest(a,'GET','/'+ticket.id);assert.equal(response.status,200);assert.equal(response.body.ticket.progress.at(-1).stage,'on-way');assert.equal(response.body.ticket.progress.at(-1).note,'Petugas sedang menuju lokasi.');assert(!JSON.stringify(response.body).includes('PRIVATE_INTERNAL_NOTE'));
 assert.equal((await wifiRequest(b,'GET','/'+ticket.id)).status,404);
 assert.equal((await request('technician','POST','/tickets/'+ticket.id+'/progress',{stage:'resolved'})).status,403);assert.equal((await request('secretary','POST','/tickets/'+ticket.id+'/progress',{stage:'resolved'})).status,200);
 response=await wifiRequest(a,'GET','/'+ticket.id);assert.equal(response.body.ticket.status,'resolved');assert.equal(response.body.ticket.progress.at(-1).label,'Selesai');
 assert.deepEqual(businessState(),before);
});

test('staff edit publishes the customer-facing reason and keeps internal notes, foreign ownership and financial data private',async()=>{
 const [a,b]=serviceFixture(),ticket=await seedService(),before=businessState();
 const response=await request('admin','PUT','/tickets/'+ticket.id,{status:'working',assignedTo:'technician',description:'PRIVATE_EDIT_DESCRIPTION',publicNote:'Menunggu penggantian adaptor modem.'});assert.equal(response.status,200);
 const detail=await wifiRequest(a,'GET','/'+ticket.id);assert.equal(detail.status,200);assert.equal(detail.body.ticket.progress.at(-1).note,'Menunggu penggantian adaptor modem.');assert.equal(detail.body.ticket.unread,true);assert(!JSON.stringify(detail.body).includes('PRIVATE_EDIT_DESCRIPTION'));
 assert.equal((await wifiRequest(b,'GET','/'+ticket.id)).status,404);assert.deepEqual(businessState(),before);
});

test('ticket network detail is role and NAS scoped, allowlisted, optional and never mutates data',async()=>{
 serviceFixture();const ticket=await seedService();fixture.customers[0].code='12345678901';fixture.customers[0].fiberPointId='odp-a';fixture.fiberPoints=[{id:'odp-a',code:'ODP-01',name:'Area A'}];
 const before=structuredClone(fixture),path='/tickets/'+ticket.id+'/network';assert.equal((await request('','GET',path)).status,401);assert.equal((await request('finance','GET',path)).status,200);assert.equal((await request('collector','GET',path)).status,403);
 const result=await request('technician','GET',path);assert.equal(result.status,200);assert.equal(result.body.context.customer.name,'Member A');assert.equal(result.body.context.account.username,'pppoe-a');assert.equal(result.body.context.network.odp,'ODP-01 - Area A');assert.equal(result.body.context.network.olt,'');assert(!JSON.stringify(result.body).includes('PRIVATE'));assert.deepEqual(fixture,before);assert.equal(saves,0);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('technician','GET',path)).status,404);
});

test('WifiKu support requires a valid bearer for an existing customer and never accepts a staff cookie instead',async()=>{
 const [a]=serviceFixture();
 assert.equal((await wifiRequest('')).status,401);assert.equal((await wifiRequest('forged')).status,401);assert.equal((await wifiRequest(a.slice(0,-1)+'z')).status,401);
 assert.equal((await request('admin','GET','/api/public/wifiku/tickets')).status,401);
 assert.equal((await wifiRequest(a,'GET','?customerId=member-b')).status,200);assert.equal(saves,0);
 fixture.settings.wifiKu.enabled=false;assert.equal((await wifiRequest(a)).status,403);fixture.settings.wifiKu.enabled=true;
 fixture.customers.shift();assert.equal((await wifiRequest(a)).status,401);assert.equal(saves,0);
});

test('customer support creation ignores forged ownership, workflow and financial fields and returns only the public projection',async()=>{
 const [a]=serviceFixture(),before=businessState();
 const response=await wifiRequest(a,'POST','',{category:'billing',text:'Please check my invoice',customerId:'member-b',customerName:'FORGED_NAME',username:'pppoe-b',nasId:'nas-b',status:'resolved',assignedTo:'admin',kind:'fault',source:'olt-los',description:'PRIVATE_NOTE',messages:[{role:'staff',text:'FORGED_STAFF'}],amount:0,paid:true,photoPath:'/etc/passwd'});
 assert.equal(response.status,201);assert.equal(response.body.created,true);assert.equal(response.body.ticket.kind,'request');assert.equal(response.body.ticket.status,'new');
 const ticket=fixture.oltTickets[0];assert.equal(ticket.customerId,'member-a');assert.equal(ticket.nasId,'nas-a');assert.equal(ticket.customerName,'Member A');assert.equal(ticket.source,'wifiku');assert.equal(ticket.assignedTo,'');assert.equal(ticket.messages.length,1);assert.equal(ticket.messages[0].role,'customer');
 assert.equal(response.body.ticket.customerId,undefined);assert.equal(response.body.ticket.nasId,undefined);assert.equal(response.body.ticket.description,undefined);assert.equal(response.body.ticket.messages[0].text,'Please check my invoice');
 assert(!JSON.stringify(response.body).includes('PRIVATE_'));assert(!JSON.stringify(response.body).includes('FORGED_'));
 assert.deepEqual(businessState(),before);assert.equal(saves,1);assert.equal(lastSaveOptions.includeCore,true);
 assert(fixture.activity.some(row=>row.meta?.action==='service-ticket-customer'));
});

test('customer support list and detail isolate ownership, exclude internal notes and GET never marks messages read',async()=>{
 const [a,b]=serviceFixture(),first=await seedService(),second=await seedService(1);
 Object.assign(first,{description:'PRIVATE_NOTE',history:[{note:'PRIVATE_HISTORY'}],waNotifications:{detected:'PRIVATE_WA'},password:'PRIVATE_PASSWORD',assignedTo:'technician',lastStaffMessageAt:new Date().toISOString(),customerReadAt:''});
 first.messages.push({id:'staff-message',role:'staff',name:'Unit technician',text:'Visible reply',at:first.lastStaffMessageAt,photos:[{id:PHOTO_A,path:'/PRIVATE_PATH',size:42}],internalNote:'PRIVATE_MESSAGE'});
 fixture.oltTickets.push({...first,id:'33333333-3333-4333-8333-333333333333',source:'olt-los'});
 const before=structuredClone(fixture),list=await wifiRequest(a,'GET','?customerId=member-b&limit=9999');
 assert.equal(list.status,200);assert.equal(list.body.total,1);assert.equal(list.body.unread,1);assert.deepEqual(list.body.tickets.map(row=>row.id),[first.id]);
 assert.equal(list.body.tickets[0].messages,undefined);assert(!JSON.stringify(list.body).includes(second.id));assert(!JSON.stringify(list.body).includes('PRIVATE_'));
 const detail=await wifiRequest(a,'GET','/'+first.id);assert.equal(detail.status,200);assert.equal(detail.body.ticket.staffName,'Unit technician');assert.equal(detail.body.ticket.unread,true);assert.equal(detail.body.ticket.messages.at(-1).text,'Visible reply');assert.deepEqual(detail.body.ticket.messages.at(-1).photos,[{id:PHOTO_A}]);assert(!JSON.stringify(detail.body).includes('PRIVATE_'));
 assert.deepEqual((await wifiRequest(b)).body.tickets.map(row=>row.id),[second.id]);assert.deepEqual(fixture,before);assert.equal(saves,0);
 const read=await wifiRequest(a,'POST','/'+first.id+'/read',{customerId:'member-b'});assert.equal(read.status,200);assert.equal(read.body.ticket.unread,false);assert.equal(saves,1);
 assert.equal((await wifiRequest(a,'POST','/'+first.id+'/read')).status,200);assert.equal(saves,1);assert.equal((await wifiRequest(b)).body.unread,0);
 fixture.oltTickets.find(row=>row.id===first.id).status='resolved';assert.equal((await wifiRequest(a)).body.total,0);assert.deepEqual((await wifiRequest(a,'GET','?closed=1')).body.tickets.map(row=>row.id),[first.id]);
});

test('customer read acknowledgement is bounded to the fetched ticket version so concurrent staff updates stay unread',async()=>{
 const [token]=serviceFixture(),ticket=await seedService();ticket.lastStaffMessageAt=new Date(Date.now()-2000).toISOString();ticket.updatedAt=ticket.lastStaffMessageAt;
 const viewed=(await wifiRequest(token,'GET','/'+ticket.id)).body.ticket;
 ticket.lastStaffMessageAt=new Date(Date.now()-1000).toISOString();ticket.updatedAt=ticket.lastStaffMessageAt;
 let result=await wifiRequest(token,'POST','/'+ticket.id+'/read',{seenAt:viewed.updatedAt});assert.equal(result.status,200);assert.equal(result.body.ticket.unread,true);
 result=await wifiRequest(token,'POST','/'+ticket.id+'/read',{seenAt:ticket.updatedAt});assert.equal(result.status,200);assert.equal(result.body.ticket.unread,false);
 const saved=saves;assert.equal((await wifiRequest(token,'POST','/'+ticket.id+'/read',{seenAt:ticket.updatedAt})).status,200);assert.equal(saves,saved);
 assert.equal((await wifiRequest(token,'POST','/'+ticket.id+'/read',{seenAt:'invalid'})).status,400);assert.equal(saves,saved);
});

test('customer confirmation reply changes only displayed response status and never closes the ticket or queues progress WhatsApp',async()=>{
 const [token]=serviceFixture(),ticket=await seedService();await request('technician','POST','/tickets/'+ticket.id+'/claim');await request('technician','POST','/tickets/'+ticket.id+'/progress',{stage:'waiting-customer'});
 const history=structuredClone(fixture.oltTickets.find(row=>row.id===ticket.id).history),before=businessState();
 await new Promise(resolve=>setTimeout(resolve,2));
 assert.equal((await wifiRequest(token,'POST','/'+ticket.id+'/messages',{text:'Modem sudah menyala.'})).status,200);
 const detail=await wifiRequest(token,'GET','/'+ticket.id);assert.equal(detail.body.ticket.statusLabel,'Balasan Anda diterima');assert.equal(detail.body.ticket.status,'working');assert.deepEqual(fixture.oltTickets.find(row=>row.id===ticket.id).history,history);assert.deepEqual(businessState(),before);
});

test('foreign customer ticket IDs and photos cannot be read, replied to or marked read, even with forged body identity',async t=>{
 const [a,b]=serviceFixture(),first=await seedService(),second=await seedService(1);first.messages[0].photos=[{id:PHOTO_A}];second.messages[0].photos=[{id:PHOTO_B}];
 let reads=0;t.mock.method(require('node:fs/promises'),'readFile',async()=>{reads++;throw new Error('Foreign photos must not be opened');});
 const before=structuredClone(fixture);
 for(const [token,ticket,photo]of [[a,second,PHOTO_B],[b,first,PHOTO_A]]){
  for(const [method,suffix]of [['GET',''],['POST','/messages'],['POST','/read'],['GET','/photos/'+photo]]){
   const response=await wifiRequest(token,method,'/'+ticket.id+suffix,{customerId:ticket.customerId,text:'Forged reply',photoId:photo});assert.equal(response.status,404,method+' '+suffix);
  }
 }
 assert.equal((await wifiRequest(a,'GET','/'+first.id+'/photos/'+PHOTO_B)).status,404);assert.equal(reads,0);assert.equal(saves,0);assert.deepEqual(fixture,before);
});

test('private image routes authorize ticket membership and NAS before reading bytes, with private no-store headers',async t=>{
 const [a,b]=serviceFixture(),ticket=await seedService();await seedService(1);ticket.messages[0].photos=[{id:PHOTO_A,path:'/untrusted/ignored'}];
 const reads=[],expected=path.join(serviceTickets.PHOTO_ROOT,PHOTO_A+'.webp'),bytes=Buffer.from('test-webp-response');
 t.mock.method(require('node:fs/promises'),'readFile',async file=>{reads.push(file);assert.equal(file,expected);return bytes;});
 const photo=await wifiRequest(a,'GET','/'+ticket.id+'/photos/'+PHOTO_A);assert.equal(photo.status,200);assert.deepEqual(photo.body,bytes);assert.equal(photo.headers['Content-Type'],'image/webp');assert.equal(photo.headers['Cache-Control'],'private, no-store');assert.equal(photo.headers['X-Content-Type-Options'],'nosniff');
 assert.equal((await wifiRequest(b,'GET','/'+ticket.id+'/photos/'+PHOTO_A)).status,404);
 assert.equal((await request('finance','GET','/tickets/'+ticket.id+'/photos/'+PHOTO_A)).status,200);assert.equal((await request('collector','GET','/tickets/'+ticket.id+'/photos/'+PHOTO_A)).status,403);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('technician','GET','/tickets/'+ticket.id+'/photos/'+PHOTO_A)).status,404);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-a'];const staff=await request('technician','GET','/tickets/'+ticket.id+'/photos/'+PHOTO_A);assert.equal(staff.status,200);assert.deepEqual(staff.body,bytes);assert.equal(staff.headers['Cache-Control'],'private, no-store');
 assert.equal((await request('technician','GET','/tickets/'+ticket.id+'/photos/'+PHOTO_B)).status,404);assert.deepEqual(reads,[expected,expected,expected]);assert.equal(saves,0);
});

test('customer writes reject cross-origin, null-origin and cross-site forgery before mutation',async()=>{
 const [a]=serviceFixture(),ticket=await seedService(),before=structuredClone(fixture);
 for(const headers of [{origin:'https://evil.test'},{origin:'null'},{'sec-fetch-site':'cross-site'},{origin:'',referer:'https://evil.test/page'}]){
  for(const suffix of ['', '/'+ticket.id+'/messages','/'+ticket.id+'/read']) assert.equal((await wifiRequest(a,'POST',suffix,{category:'addon',text:'Untrusted write'},headers)).status,403);
 }
 assert.equal(saves,0);assert.deepEqual(fixture,before);
});

test('API retries deduplicate without saves and customer rates, text limits, invalid photos and resolution are enforced',async()=>{
 const [a]=serviceFixture();const payload={category:'internet-down',text:'First report'},first=await wifiRequest(a,'POST','',payload),id=first.body.ticket.id;assert.equal(first.status,201);assert.equal(saves,1);
 const retry=await wifiRequest(a,'POST','',payload);assert.equal(retry.status,200);assert.equal(retry.body.created,false);assert.equal(retry.body.ticket.id,id);assert.equal(saves,1);
 assert.equal((await wifiRequest(a,'POST','/'+id+'/messages',{text:'Too soon'})).status,429);assert.equal(saves,1);
 const ticket=fixture.oltTickets[0];ticket.lastCustomerMessageAt=new Date(Date.now()-11000).toISOString();
 for(const body of [{text:' '},{text:'x'.repeat(1501)},{text:'Bad\u0000'},{text:'Photo',photo:'data:image/svg+xml;base64,PHN2Zy8+'}]) assert.equal((await wifiRequest(a,'POST','/'+id+'/messages',body)).status,400);
 assert.equal(ticket.messages.length,1);assert.equal(saves,1);
 assert.equal((await wifiRequest(a,'POST','/'+id+'/messages',{text:'Valid followup',customerId:'member-b',status:'resolved',role:'staff'})).status,200);assert.equal(saves,2);assert.equal(fixture.oltTickets[0].status,'new');assert.equal(fixture.oltTickets[0].messages.at(-1).role,'customer');
 fixture.oltTickets[0].status='resolved';assert.equal((await wifiRequest(a,'POST','/'+id+'/messages',{text:'Cannot reopen'})).status,409);assert.equal(saves,2);
});

test('service staff replies require a claim, permitted role, CSRF, NAS scope and technician ownership',async()=>{
 serviceFixture();const ticket=await seedService(),suffix='/tickets/'+ticket.id,body={text:'Staff reply'},before=businessState();
 for(const role of ['admin','secretary','technician']) assert.equal((await request(role,'POST',suffix+'/messages',body)).status,409);
 for(const role of ['finance','collector','viewer','partner','reseller_voucher']) assert.equal((await request(role,'POST',suffix+'/messages',body)).status,403);
 assert.equal((await request('technician','POST',suffix+'/messages',body,false)).status,419);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('technician','POST',suffix+'/messages',body)).status,404);assert.equal((await request('technician','GET',suffix)).status,404);assert.equal(saves,0);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-a'];assert.equal((await request('technician','POST',suffix+'/claim')).status,200);
 assert.equal((await request('technician','POST',suffix+'/messages',body)).status,200);assert.equal(fixture.oltTickets[0].messages.at(-1).role,'staff');assert.equal(fixture.oltTickets[0].messages.at(-1).name,'Unit technician');
 const saved=saves;assert.equal((await request('technician','POST',suffix+'/messages',body)).status,200);assert.equal(saves,saved);
 fixture.oltTickets[0].assignedTo='noc';assert.equal((await request('technician','POST',suffix+'/messages',{text:'Not mine'})).status,403);assert.equal(saves,saved);
 assert.equal((await request('noc','POST',suffix+'/messages',{text:'Coordinator reply'})).status,200);
 fixture.oltTickets[0].status='resolved';assert.equal((await request('noc','POST',suffix+'/messages',{text:'After resolution'})).status,409);assert.deepEqual(businessState(),before);
});

test('staff service updates cannot forge customer identity or execute a financial request and reject out-of-NAS assignees',async()=>{
 serviceFixture();const ticket=await seedService(0,{category:'package-change'}),suffix='/tickets/'+ticket.id,before=businessState();
 assert.equal((await request('technician','PUT',suffix,{status:'working'})).status,409);assert.equal((await request('technician','PUT',suffix,{assignedTo:'noc'})).status,403);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('admin','PUT',suffix,{assignedTo:'technician'})).status,400);assert.equal(saves,0);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-a'];assert.equal((await request('technician','POST',suffix+'/claim')).status,200);
 const updated=await request('admin','PUT',suffix,{title:'Reviewed request',description:'Internal analysis',status:'resolved',customerId:'member-b',nasId:'nas-b',category:'pause-stop',kind:'fault',oltId:'other',source:'olt-los',amount:0,statusPayment:'paid',packageName:'FORGED'});
 assert.equal(updated.status,200);const saved=fixture.oltTickets[0];assert.equal(saved.status,'resolved');assert(saved.resolvedAt);for(const key of ['id','customerId','nasId','category','kind','source','oltId']) assert.equal(saved[key],ticket[key],key);assert.deepEqual(businessState(),before);
});

test('staff ticket API two bucket tabs retain resolved results by default and read service tickets without any OLT polling',async t=>{
 serviceFixture();const first=await seedService(),second=await seedService(0,{category:'billing'});await seedService(1);
 first.status='resolved';second.status='working';fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-a'];
 const olt=require('../src/olt-monitor');for(const name of ['snapshotFor','collect','poll','pollNext','requestRefresh']) t.mock.method(olt,name,()=>{assert.fail('Ticket API must not poll: '+name);});
 const before=structuredClone(fixture),faults=await request('technician','GET','/tickets?kind=fault&bucket=resolved');assert.equal(faults.status,200);assert.equal(faults.body.total,1);assert.equal(faults.body.tickets[0].id,first.id);
 const requests=await request('technician','GET','/tickets?kind=request&bucket=open');assert.equal(requests.status,200);assert.deepEqual(requests.body.tickets.map(row=>row.id),[second.id]);assert.equal(requests.body.tickets[0].status,'working');
 assert.equal((await request('technician','GET','/tickets?nasId=nas-b&status=all')).body.total,0);assert.equal((await request('finance','GET','/tickets?kind=request')).status,200);assert.equal((await request('technician','GET','/tickets/'+second.id)).status,200);
 assert.equal(saves,0);assert.deepEqual(fixture,before);
});
test('staff can create PSB or fault without NAS/OLT, claim and complete without creating customer or invoice',async()=>{
 serviceFixture();const before=businessState(),body={category:'new-installation',customerName:'New Prospect',phone:'081200000001',address:'Address pending survey',text:'Please survey installation',nasId:'forged',oltId:'forged'};
 const response=await request('admin','POST','/tickets',body);assert.equal(response.status,201);const ticket=response.body.ticket;assert.equal(ticket.kind,'request');assert.equal(ticket.source,'staff-service');assert.equal(ticket.nasId,'');assert.equal(ticket.oltId,'');assert.equal(ticket.customerId,'');
 assert.equal((await request('admin','POST','/tickets',body)).body.ticket.id,ticket.id);assert.equal(fixture.oltTickets.length,1);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('technician','GET','/tickets/'+ticket.id)).status,200);assert.equal((await request('technician','POST','/tickets/'+ticket.id+'/claim')).status,200);assert.equal((await request('secretary','POST','/tickets/'+ticket.id+'/progress',{status:'resolved',note:'Survey completed'})).status,200);assert.deepEqual(businessState(),before);
 const fault=await request('secretary','POST','/tickets',{...body,category:'internet-down',text:'Fault report without identified NAS'});assert.equal(fault.status,201);assert.equal(fault.body.ticket.kind,'fault');assert.equal((await request('collector','POST','/tickets',body)).status,403);assert.equal((await request('admin','POST','/tickets',body,false)).status,419);
});
test('staff customer selection auto maps NAS and prevents forged identity or out-of-scope member selection',async()=>{
 serviceFixture();const options=await request('admin','GET','/service-options?search=');assert.equal(options.status,200);const customer=fixture.customers[0];fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];
 assert.equal((await request('technician','POST','/tickets',{customerId:customer.id,category:'internet-down',text:'Fault report'})).status,403);
 const response=await request('admin','POST','/tickets',{customerId:customer.id,category:'internet-down',text:'Fault report',customerName:'Forged',nasId:'nas-b'});assert.equal(response.status,201);assert.equal(response.body.ticket.customerName,customer.name);assert.equal(response.body.ticket.nasId,'nas-a');
 const target='/'+ 'fixture-olt' +'/onus/HWTCAABBCCDD/description';assert.equal((await request('finance','PUT',target,{})).status,403);
});
test('ticket team API supports two companions with bounded scope, progress rights and no business changes',async()=>{
 serviceFixture();fixture.users.push({id:'team-a',username:'team-a',name:'Team A',role:'technician',active:true},{id:'team-b',username:'team-b',name:'Team B',role:'technician',active:true},{id:'team-foreign',username:'team-foreign',role:'technician',active:true,lockedNasIds:['nas-b']});
 const ticket=await seedService(),base='/tickets/'+ticket.id,before=businessState();assert.equal((await request('technician','POST',base+'/claim')).status,200);
 let team=await request('technician','GET',base+'/team');assert.equal(team.status,200);assert(team.body.options.some(row=>row.id==='team-a'));assert(!team.body.options.some(row=>row.id==='team-foreign'));
 const payload={revision:team.body.revision,companionIds:['team-a','team-b']};assert.equal((await request('technician','PUT',base+'/team',payload,false)).status,419);assert.equal((await request('finance','PUT',base+'/team',payload)).status,403);
 assert.equal((await request('technician','PUT',base+'/team',payload)).status,200);assert.deepEqual(fixture.oltTickets[0].companionIds,['team-a','team-b']);assert.equal(fixture.oltTickets[0].assignedTo,'technician');assert(fixture.activity.some(row=>row.meta?.action==='ticket-team'));assert.deepEqual(businessState(),before);
 for(const id of ['team-a','team-b']){const detail=await request(id,'GET',base);assert.equal(detail.body.canProgress,true);assert.equal(detail.body.canManageTeam,false);assert.equal(detail.body.team.length,3);assert.equal((await request(id,'PUT',base+'/team',{...payload,companionIds:[]})).status,403);assert.equal((await request(id,'PUT',base,{assignedTo:id})).status,403);}
 assert.equal((await request('team-a','POST',base+'/messages',{text:'Assistant reviewed'})).status,200);assert.equal((await request('team-a','POST',base+'/progress',{stage:'checking',publicNote:'Layanan sedang diperiksa'})).status,200);assert.equal(fixture.oltTickets[0].history.at(-1).userId,'team-a');
 assert.equal((await request('technician','PUT',base+'/team',payload)).status,409);team=await request('technician','GET',base+'/team');assert.equal((await request('technician','PUT',base+'/team',{revision:team.body.revision,companionIds:['team-a']})).status,200);
 assert.equal((await request('team-b','POST',base+'/progress',{stage:'resolved'})).status,403);assert.equal((await request('team-foreign','GET',base)).status,404);assert.equal((await request('team-a','POST',base+'/progress',{stage:'resolved'})).status,403);assert.equal((await request('secretary','POST',base+'/progress',{stage:'resolved'})).status,200);
 assert.equal((await request('technician','GET',base+'/team')).status,403);assert.deepEqual(businessState(),before);
});
test('canonical TKT routes retain auth, CSRF, legacy links, package scoping and automatic coordinates',async()=>{
 serviceFixture();const member=fixture.customers[0];Object.assign(member,{latitude:-0.5,longitude:117.15});
 fixture.radiusProfiles=[{id:'unit-plan',name:'Paket Unit',price:150000,serviceType:'pppoe'},{id:'foreign-plan',name:'Other Unit',price:100000,serviceType:'pppoe',nasId:'nas-b'},{id:'voucher',name:'Voucher',serviceType:'hotspot'}];
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-a'];
 assert.equal((await request('','GET','/api/tickets')).status,401);
 const options=await request('technician','GET','/api/tickets/options?customerId='+member.id);assert.equal(options.status,200);assert.deepEqual(options.body.packages.map(row=>row.id),['unit-plan']);assert.deepEqual(options.body.customers[0].coordinates,{latitude:-0.5,longitude:117.15});
 assert.equal((await request('technician','GET','/api/tickets/options?customerId=member-b')).status,404);
 const before=businessState(),payload={customerId:member.id,category:'new-installation',text:'PSB Unit',packageId:'unit-plan'};
 assert.equal((await request('technician','POST','/api/tickets',payload,false)).status,419);
 const response=await request('technician','POST','/api/tickets',payload);assert.equal(response.status,201);const id=response.body.ticket.id;assert.match(response.body.ticket.number,/^TKT-/);assert.equal(response.body.ticket.latitude,-0.5);assert.equal(response.body.ticket.requestedPackage.price,150000);
 fixture.oltTickets[0].number='OLT-20261115-ABCDEF';assert.equal((await request('technician','GET','/api/tickets/'+id)).body.ticket.number,'TKT-20261115-ABCDEF');assert.equal((await request('technician','GET','/tickets/'+id)).body.ticket.number,'TKT-20261115-ABCDEF');assert.equal(fixture.oltTickets[0].number,'OLT-20261115-ABCDEF');
 assert.equal((await request('technician','POST','/api/tickets/'+id+'/claim')).status,200);const team=await request('technician','GET','/api/tickets/'+id+'/team');assert.equal(team.status,200);
 assert.equal((await request('technician','PUT','/api/tickets/'+id+'/team',{revision:team.body.revision,companionIds:[]},false)).status,419);assert.deepEqual(businessState(),before);
});
test('ticket templates are managed through WhatsApp permissions without modifying provider, schedules or financial data',async()=>{
 serviceFixture();const before=structuredClone(fixture.settings.waGateway),business=businessState();
 for(const role of['','technician','collector','reseller_voucher'])assert.equal((await request(role,'GET','/api/tickets/templates')).status,role?403:401);
 const shown=await request('admin','GET','/api/tickets/templates');assert.equal(shown.status,200);assert(shown.body.definitions.some(row=>row.key==='odpDetected'));assert(shown.body.definitions.some(row=>row.key==='odcResolved'));assert(shown.body.definitions.some(row=>row.key==='customerOutagePending'));
 assert.equal((await request('admin','PUT','/api/tickets/templates',{psbDetected:'PSB [package] [ticket_no]'},false)).status,419);
 assert.equal((await request('admin','PUT','/api/tickets/templates',{psbDetected:'PSB [package] [ticket_no]'})).status,200);assert.equal(fixture.settings.oltTicketing.templates.psbDetected,'PSB [package] [ticket_no]');
 assert.equal((await request('admin','PUT','/api/tickets/templates',{resetDefaults:true})).status,200);assert(fixture.settings.oltTicketing.templates.psbDetected.includes('PERMINTAAN PASANG BARU'));assert.deepEqual(fixture.settings.waGateway,before);assert.deepEqual(businessState(),business);
});
test('mass customer notices require explicit boolean opt-in and activation date without modifying staff or billing schedules',async()=>{
 serviceFixture();const before=structuredClone(fixture.settings.waGateway),payload={whatsappEnabled:false,recipientIds:[],customerOutageEnabled:true};
 assert.equal((await request('technician','PUT','/api/tickets/settings',payload)).status,403);assert.equal((await request('admin','PUT','/api/tickets/settings',payload,false)).status,419);
 assert.equal((await request('admin','PUT','/api/tickets/settings',{...payload,customerOutageEnabled:'true'})).status,400);
 assert.equal((await request('admin','PUT','/api/tickets/settings',payload)).status,200);const at=fixture.settings.oltTicketing.customerOutageEnabledAt;assert(Number.isFinite(Date.parse(at)));assert.equal(fixture.settings.oltTicketing.whatsappEnabled,false);
 assert.equal((await request('admin','PUT','/api/tickets/settings',payload)).status,200);assert.equal(fixture.settings.oltTicketing.customerOutageEnabledAt,at);
 assert.equal((await request('admin','PUT','/api/tickets/settings',{...payload,customerOutageEnabled:false})).status,200);assert.equal(fixture.settings.oltTicketing.customerOutageEnabled,false);assert.deepEqual(fixture.settings.waGateway,before);assert.equal(fixture.waMessages.length,0);
});
test('ODP/ODC completion requires an assigned responsible team and ninety percent current recovery, never RX or automatic closure',async()=>{
 reset();const olt=require('../src/olt-monitor'),saved=olt.snapshotFor,now=Date.now(),onus=Array.from({length:10},(_,i)=>({id:String(i),serialNumber:'HWTC'+String(i).padStart(8,'0'),ponKey:'0/0/1',status:'online',condition:'online',causeKnown:true,rxPower:null}));
 fixture.oltDevices=[{id:'olt-unit',enabled:true,nasId:'nas-a',links:Object.fromEntries(onus.map(row=>[row.serialNumber,{fiberPointId:'odp-unit'}]))}];fixture.fiberPoints=[{id:'odp-unit'}];
 const ticket={id:'22222222-2222-4222-8222-222222222222',number:'TKT-UNIT',source:'olt-los',scope:'odp',fiberPointId:'odp-unit',oltId:'olt-unit',pon:'0/0/1',assignedTo:'',status:'new',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),history:[],affectedSerialNumbers:onus.map(row=>row.serialNumber)};fixture.oltTickets=[ticket];
 olt.snapshotFor=async()=>({status:'online',checkedAt:new Date(now).toISOString(),onus});const path='/api/tickets/'+ticket.id;
 try{assert.equal((await request('technician','POST',path+'/progress',{status:'resolved',note:'Confirmed repair'})).status,409);assert.equal((await request('technician','POST',path+'/claim')).status,200);
  onus.slice(8).forEach(row=>Object.assign(row,{status:'offline',condition:'los'}));assert.equal((await request('technician','POST',path+'/progress',{status:'resolved',note:'Confirmed repair'})).status,409);assert.notEqual(fixture.oltTickets[0].status,'resolved');
  Object.assign(onus[8],{status:'online',condition:'online'});const response=await request('technician','POST',path+'/progress',{status:'resolved',note:'Perbaikan dikonfirmasi, sisa satu pelanggan ditindaklanjuti'});assert.equal(response.status,200);assert.equal(response.body.ticket.status,'resolved');assert.equal(response.body.ticket.recovery.ready,true);assert.equal(response.body.ticket.recovery.remainingLos,1);assert.notEqual(response.body.ticket.autoResolved,true);assert.equal(fixture.waMessages.length,0);
 }finally{olt.snapshotFor=saved;}
});
test('native description GET keeps technical role, NAS and isolated-dev boundaries without saving data',async()=>{
 reset();const a=await request('admin','POST','',{name:'Unit',host:'192.0.2.87',community:'unit',nasId:'nas-a'}),path='/'+a.body.device.id+'/onus/HWTCAABBCCDD/description',before=saves;
 assert.equal((await request('','GET',path)).status,401);for(const role of ['finance','collector','reseller_voucher'])assert.equal((await request(role,'GET',path)).status,403);
 assert.equal((await request('secretary','GET',path)).status,400);
 assert.equal((await request('admin','GET',path)).status,400);assert.equal(saves,before);
 fixture.users.find(row=>row.role==='technician').lockedNasIds=['nas-b'];assert.equal((await request('technician','GET',path)).status,404);
});
test('secretary has admin user and OLT integration access while metadata changes keep the real actor role',async()=>{
 reset();const before=structuredClone({customers:fixture.customers,invoices:fixture.invoices,payments:fixture.payments,waMessages:fixture.waMessages});
 const users=await request('secretary','GET','/api/users');assert.equal(users.status,200);assert.deepEqual(users.body.roles.find(row=>row.value==='secretary').permissions,users.body.roles.find(row=>row.value==='admin').permissions);
 assert.equal((await request('secretary','POST','',{name:'Unit',host:'192.0.2.94',community:'unit'},false)).status,419);
 const created=await request('secretary','POST','',{name:'Secretariat OLT',host:'192.0.2.94',community:'unit'});assert.equal(created.status,201);
 assert.equal((await request('secretary','PUT','/'+created.body.device.id,{name:'Updated OLT'})).status,200);assert.equal((await request('secretary','DELETE','/'+created.body.device.id,{confirmId:created.body.device.id,confirmName:'Updated OLT',confirmDelete:true})).status,200);
 assert(fixture.activity.some(row=>row.meta?.userId==='secretary'||row.message?.includes('Unit secretary')));
 assert.deepEqual({customers:fixture.customers,invoices:fixture.invoices,payments:fixture.payments,waMessages:fixture.waMessages},before);
});
