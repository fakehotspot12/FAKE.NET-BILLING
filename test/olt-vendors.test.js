'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vendors=require('../src/olt-vendors'),olt=require('../src/olt-monitor'),cli=require('../src/olt-cli'),secrets=require('../src/secure-secrets'),store=require('../src/store');
process.env.REDIS_CACHE='0';process.env.MIGRATION_MODE='0';
function fixture(vendor='hsgq',extra={}){const data=store.createDefaultStore(),device=olt.validateDevice(data,{name:'Test OLT',host:'192.0.2.110',vendor,community:'read-unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit-password',...extra});data.oltDevices=[device];return{data,device};}
test('all ten supplied vendors and aliases are declared without enabling unverified writes',()=>{
 assert.equal(vendors.options().length,10);assert.equal(new Set(vendors.options().map(row=>row.value)).size,10);assert.deepEqual(vendors.options().filter(row=>row.writes).map(row=>row.value),['cdata']);for(const[key,value]of[['C-Data','cdata'],['V-Sol','vsol'],['Baudcom','bdcom'],['HSGQ-E','hsgq'],['HSGQ-G','hsgq']])assert.equal(vendors.normalize(key),value);assert(!vendors.canWrite({vendor:'unknown'}));
});
for(const cfg of vendors.PROFILES)test(cfg.label+' can be added with encrypted credentials and correct capabilities',()=>{
 const{data,device}=fixture(cfg.value);assert.equal(device.vendor,cfg.value);assert.equal(secrets.decryptSecret(data,device.cliPasswordEnc),'unit-password');const pub=olt.publicDevice(device,null,{management:true});assert.equal(pub.onuDeleteAvailable,cfg.writes);assert.equal(pub.driverMode,cfg.writes?'verified':'read-only');assert(!JSON.stringify(pub).includes('unit-password'));assert(!JSON.stringify(pub).includes('communityEnc'));
});
test('existing vendor is immutable, protocol/ports validated, and CDATA write transport stays Telnet',()=>{
 const{data,device}=fixture('cdata');assert.throws(()=>olt.validateDevice(data,{vendor:'huawei'},device),/tidak dapat diganti/);assert.throws(()=>fixture('cdata',{cliProtocol:'ssh'}));assert.throws(()=>fixture('unknown'));assert.throws(()=>fixture('huawei',{cliProtocol:'http'}));assert.throws(()=>fixture('huawei',{webPort:'80;reboot'}));const ssh=fixture('huawei',{cliProtocol:'ssh'}).device;assert.equal(ssh.cliPort,22);assert.equal(ssh.webPort,80);
});
test('SN/position/state normalization preserves uncertainty and MAC identity separately',()=>{
 const input=[{sn:'48575443AABBCCDD',slot:1,pon:2,onu_id:3,status:'online',description:'Client',rx_power:'-25.5 dBm',distance:'500 m'},{sn:'aa:bb:cc:dd:ee:ff',slot:0,pon:1,onu_id:4,status:'registered',rx_power:'N/A'},{sn:'FHTTAABBCCDD',slot:1,pon:2,onu_id:5,status:'offline',down_cause:'dying-gasp'},{sn:'HWTCAABBCCDD',slot:1,pon:2,onu_id:0,status:'online'}],rows=vendors.normalizeOnus(input,{normalizeSerial:olt.normalizeSerial,classifyCause:olt.classifyCause});assert.equal(rows.length,3);assert.equal(rows[0].serialNumber,'HWTCAABBCCDD');assert.equal(rows[0].rxPower,-25.5);assert.equal(rows[0].distance,500);assert.equal(rows[1].identifierKind,'mac');assert.equal(rows[1].status,'unknown');assert.equal(rows[1].rxPower,null);assert.equal(rows[2].condition,'dying-gasp');assert.equal(rows[2].causeKnown,true);
});
test('conflicting same-position observations become unknown, duplicate serial positions remain distinct',()=>{
 const row={sn:'HWTCAABBCCDD',slot:0,pon:1,onu_id:1,status:'online'},rows=vendors.normalizeOnus([row,{...row,status:'offline'},{...row,pon:2}],{normalizeSerial:olt.normalizeSerial});assert.equal(rows.length,2);assert.equal(rows[0].status,'unknown');assert.notEqual(rows[0].id,rows[1].id);
});
test('all imported adapter modules load without original service/database/configuration',async()=>{
 const[factory]=await vendors.loadLibrary();for(const cfg of vendors.PROFILES){const adapter=factory.createOltAdapter({vendor:cfg.value==='cdata'?'c-data':cfg.value});assert.equal(typeof adapter.getCommandNotes,'function');assert.equal(typeof adapter.getRegisteredOnus,'function');assert(Array.isArray(adapter.getCommandNotes()));}
});
test('transport blocks every mutating command, including writes requested by imported adapters',async()=>{
 const[factory,context,transport]=await vendors.loadLibrary(),{data,device}=fixture();let calls=0;
 await context.withContext(data,device,async()=>{
  for(const command of ['save','write','write memory','system-view','ont delete 1 1','no onu 1','reboot','show version;reboot','show version\nont delete 1 1','interface gpon 0/1'])await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(device),commands:[command],allowWrite:true}),/locked/);
 },{transports:{commands:async()=>{calls++;return{success:true,outputs:[]};}}});assert.equal(calls,0);
 for(const cfg of vendors.PROFILES){const f=fixture(cfg.value);await assert.rejects(context.withContext(f.data,f.device,()=>factory.createOltAdapter(vendors.legacyDevice(f.device)).saveConfig(),{transports:{commands:async()=>{calls++;return{success:true,outputs:[]};}}}));}assert.equal(calls,0);
});
test('safe CLI reads use existing billing secrets and controlled transport',async()=>{
 const[,context,transport]=await vendors.loadLibrary(),{data,device}=fixture('huawei',{cliProtocol:'ssh'});let seen;
 await context.withContext(data,device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:['enable','display version']}),{transports:{commands:async input=>{seen=input;return{success:true,outputs:[]};}}});assert.equal(seen.password,'unit-password');assert.equal(seen.olt.protocol,'ssh');assert.equal(seen.olt.port,22);
});
test('CLI session closes its resource once on pre-login failure, success, and confirmation rejection',async()=>{
 const[,context,transport]=await vendors.loadLibrary(),{PassThrough}=require('node:stream'),{data,device}=fixture();
 for(const mode of ['error','success','confirm']){let closed=0,writes=[];
  const result=await context.withContext(data,device,()=>transport.shellSession({olt:vendors.legacyDevice(device),password:'unit',commands:['enable','show version'],timeoutMs:1000},({finish,ready,dispose})=>{dispose(()=>closed++);if(mode==='error')return finish('connection failed');const stream=new PassThrough();stream.write=value=>{writes.push(value);queueMicrotask(()=>stream.emit('data',mode==='confirm'?'Confirm [y/n]': 'OLT#'));return true;};ready(stream,()=>closed++,true);queueMicrotask(()=>stream.emit('data','OLT#'));}));
  assert.equal(closed,1);assert.equal(result.success,mode==='success');assert(!writes.some(value=>value.trim()==='y'));
 }
});
test('web target, paths, methods, redirects and responses are constrained',async()=>{
 const[,context]=await vendors.loadLibrary(),{data,device}=fixture('tarmoc');let calls=0;
 await context.withContext(data,device,async()=>{
  for(const url of ['http://127.0.0.1/','http://192.0.2.111/','http://192.0.2.110:8080/','http://192.0.2.110/goform/deleteOnu','http://192.0.2.110/reboot'])await assert.rejects(context.readOnlyFetch(url));
  await assert.rejects(context.readOnlyFetch('http://192.0.2.110/',{method:'DELETE'}));await assert.rejects(context.readOnlyFetch('http://192.0.2.110/api/set',{method:'POST'}));
  const response=await context.readOnlyFetch('http://192.0.2.110/status.asp');assert.equal(await response.text(),'read-only');
 },{transports:{fetch:async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response('read-only');}}});assert.equal(calls,1);
});
test('request budget and demo isolation prevent scans, not just UI controls',async()=>{
 const[,context]=await vendors.loadLibrary(),{data,device}=fixture();await context.withContext(data,device,async()=>{for(let i=0;i<24;i++)context.request();assert.throws(()=>context.request(),/limit/);});process.env.MIGRATION_MODE='1';try{await assert.rejects(context.withContext(data,device,()=>{}),/terisolasi/);}finally{process.env.MIGRATION_MODE='0';}
});
test('basic vendor monitoring never fabricates zero ONU inventory',async()=>{
 const{data,device}=fixture('zte',{cliEnabled:false}),calls=[];const snapshot=await olt.collect(data,device,async(_,name)=>{calls.push(name);return name==='system'?[{oid:olt.OIDS.system+'.2.0',value:'.1.3.6.1.4.1.3902',type:'OID'},{oid:olt.OIDS.system+'.5.0',value:'"Unit"',type:'STRING'}]:[];});assert.deepEqual(calls,['system','interfaces','interfaceStatus']);assert.equal(snapshot.status,'online');assert.equal(snapshot.inventoryAvailable,false);assert.equal(snapshot.summary,null);assert(snapshot.warnings.some(message=>message.includes('belum terverifikasi')));
});
test('imported background inventory skips per-ONU enrichment',async()=>{
 const[factory]=await vendors.loadLibrary(),{data,device}=fixture('hioso'),proto=Object.getPrototypeOf(factory.createOltAdapter({vendor:'hioso'})),original=proto.readInventory;proto.readInventory=async()=>({items:[{sn:'AA:BB:CC:DD:EE:FF',slot:0,pon:1,onu_id:2,status:'online'}]});try{const result=await vendors.readInventory(data,device,{normalizeSerial:olt.normalizeSerial});assert(result.available);assert.equal(result.rows.length,1);assert.equal(result.rows[0].identifierKind,'mac');}finally{proto.readInventory=original;}
});
test('BTPON status is two bounded bulk walks, with no invented LOS or offline fallback',async()=>{
 const[factory]=await vendors.loadLibrary(),{data,device}=fixture('btpon'),proto=Object.getPrototypeOf(factory.createOltAdapter({vendor:'btpon'})),original=proto.readRunningConfigInventory;let walks=0;
 proto.readRunningConfigInventory=async function(){return this.enrichOnuStatuses([{sn:'HWTCAABBCCDD',slot:0,pon:1,onu_id:1,status:'offline'},{sn:'HWTCAABBCCDE',slot:0,pon:1,onu_id:2,status:'offline'}]);};
 try{const result=await vendors.readInventory(data,device,{normalizeSerial:olt.normalizeSerial,classifyCause:olt.classifyCause},{transports:{exec:async(command,args)=>{walks++;assert.equal(command,'snmpbulkwalk');const oid=args.at(-1);return{stdout:oid.endsWith('.2')?'.1.3.6.1.2.1.2.2.1.2.100 = STRING: "gpon-onu_0/1:1"':'.1.3.6.1.2.1.2.2.1.8.100 = INTEGER: 1'};}}});assert.equal(walks,2);assert(result.available);assert.equal(result.rows[1].status,'unknown');assert(result.rows.every(row=>!row.downCause&&!row.causeKnown));}finally{proto.readRunningConfigInventory=original;}
});
test('unverified vendor cannot reach existing CDATA mutation or automatic LOS paths',async()=>{
 const{data,device}=fixture('hsgq'),target={id:'123',serialNumber:'HWTCAABBCCDD',ponKey:'0/1/1',slot:1,pon:1,onuId:1},payload={serialNumber:target.serialNumber,onuIndex:target.id,confirmDelete:true,confirmReboot:true};
 await assert.rejects(olt.removeOnu(data,device,target.serialNumber,payload),/terkunci/);await assert.rejects(olt.rebootOnu(data,device,target.serialNumber,payload),/terkunci/);await assert.rejects(olt.saveConfig(data,device,{}),/terkunci/);await assert.rejects(cli.run(data,device,target),/terkunci/);
 const plan=olt.losTicketPlan(data,[{deviceId:device.id,deviceUpdatedAt:device.updatedAt,snapshot:{status:'online',checkedAt:new Date().toISOString(),onus:[{...target,status:'offline',condition:'los',causeKnown:true,downCause:'LOS'}]}}]);assert.equal(plan.creates,0);
});
test('installer/updater require every vendor runtime file and SSH dependency, versions unchanged',()=>{
 const root=path.join(__dirname,'..'),walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(row=>row.isDirectory()?walk(dir+'/'+row.name):[dir+'/'+row.name]),files=['src/olt-vendors.js',...walk('src/olt-vendor-library')];for(const script of ['install.sh','deploy/bin/fakenet-billing-update']){const content=fs.readFileSync(path.join(root,script),'utf8');for(const file of files)assert(content.includes('    '+file+'\n'),script+' '+file);assert(content.includes("require('ssh2')"));assert(content.includes("require('./src/olt-vendors').loadLibrary()"));}assert.equal(require('../package.json').version,'4.4.0');
});
