'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const store=require('../src/store'),monitor=require('../src/olt-monitor'),vendors=require('../src/olt-vendors'),driver=require('../src/olt-hsgq');
process.env.MIGRATION_MODE='0';process.env.REDIS_CACHE='0';
const SN='HWTCAABBCCDD',VERSION='Software Version : HSGQ-G008ID_I_V1.1.10C_Rel\nProduct : HSGQ-G008ID\n',ID='0/1:0:'+SN;
function fixture(){const data=store.createDefaultStore(),device=monitor.validateDevice(data,{name:'Unit',vendor:'hsgq',host:'192.0.2.9',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit'});data.oltDevices=[device];return{data,device};}
const detail=(state='Offline',name='Client',sn=SN)=>`PON ID : 1\nONU ID : 0\nSerialNumber : ${sn}\nRun State : ${state}\nONU Name : ${name}\n`;
const row=(state='Offline',reason='Laser out')=>`1/0 ${SN} Active ${state} normal Initial  ${reason}  Client\n`;
const table=(rows=row())=>'PON/ONU Serial State Run Config Match Last Link ONT\n'+rows+'Total: 1 Online:'+(/Online/.test(rows)?1:0)+' Offline:'+(/Online/.test(rows)?0:1)+'\n';
test('HSGQ native zero-based ONU address is explicit and does not change other vendors',()=>{
 assert.equal(driver.position(ID).onuId,0);assert.equal(driver.position(ID).ponKey,'0/0/1');assert.equal(monitor.actionPosition({vendor:'hsgq'},ID).serialNumber,SN);
 for(const value of ['0/1:128:'+SN,'0/17:0:'+SN,'0/1:0:'+SN+';reboot','1/1:0:'+SN])assert.equal(driver.position(value),null);
 assert.equal(vendors.normalizeOnus([{slot:0,pon:1,onu_id:0,sn:SN,status:'online'}]).length,0);assert.equal(vendors.normalizeOnus([{slot:0,pon:1,onu_id:0,sn:SN,status:'online'}],{minimumOnuId:0}).length,1);
 for(const pon of [1,8,16])assert.equal(vendors.ponPosition('PON'+String(pon).padStart(2,'0'),'hsgq').ponKey,'0/0/'+pon);assert.equal(vendors.ponPosition('PON01','cdata'),null);
});
test('read and help exceptions are HSGQ-specific, bounded and never accept a write',async()=>{
 const f=fixture(),[,context,transport]=await vendors.loadLibrary();let calls=0;
 assert(driver.isReadCommands(['enable','configure','show ont-info 1 all']));assert(driver.isProbeCommands(['enable','configure','interface gpon 1','ont delete ?']));
 for(const command of ['ont delete 0','save','reboot','show version;reboot','show version\nreboot'])assert(!driver.isReadCommands(['enable','configure',command]));
 await context.withContext(f.data,f.device,async()=>{for(const command of ['save','ont delete 0','ont reboot 0'])await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:['enable','configure',command],allowWrite:true}),/locked/);await transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:['enable','configure','show ont-info 1 all']});},{transports:{commands:async()=>{calls++;return{success:true,outputs:[]};}}});assert.equal(calls,1);
});
test('verified model enables only scoped capabilities; unknown firmware stays read-only',()=>{
 const f=fixture();assert(driver.identity(VERSION).verified);assert(!driver.identity(VERSION.replace('V1.1.10C','V9')).verified);assert.throws(()=>driver.identity('prompt only'));
 assert.equal(vendors.capabilities(f.device).delete,false);assert.equal(vendors.capabilities(f.device,{hsgqActions:{delete:true}}).delete,true);
 const spec={operation:'delete',address:ID,serialNumber:SN,version:VERSION,before:detail()};for(const patch of [{address:'0/2:0:'+SN},{serialNumber:'HWTC11223344'},{before:detail('Online')},{version:VERSION.replace('V1.1.10C','V9')},{operation:'delete all'}])assert.throws(()=>driver.authorize({...spec,...patch}));
});
test('unused HSGQ Other registration requires exact inactive/initial native proof before removal',()=>{
 const initial=detail('Initial')+'State : Inactive\nConfig State : initial\nMatch State : Initial\n',target=driver.position(ID);
 assert.equal(driver.detail(initial,target).state,'offline');
 const spec={operation:'delete',address:ID,serialNumber:SN,version:VERSION,before:initial};assert(driver.authorize(spec));
 for(const changed of [initial.replace('State : Inactive','State : Active'),initial.replace('Config State : initial','Config State : normal'),initial.replace('Match State : Initial','Match State : mismatch'),initial.replace('Run State : Initial','Run State : Working')])assert.throws(()=>driver.authorize({...spec,before:changed}));
 for(const changed of [initial.replace('State : Inactive\n',''),initial+'State : Inactive\n',initial.replace(SN,'HWTC11223344')])assert.throws(()=>driver.detail(changed,target));
 assert.equal(driver.detail(detail('Online'),target).state,'online');
});
async function wire(operation,{badSn=false,badMode=false,rejected=false,inactiveInitial=false,inventoryProof=false}={}){
 let name='Client',present=true;
 const nativeDetail=(name='Client',sn=SN)=>detail(inactiveInitial?'Initial':operation==='reboot'?'Online':'Offline',name,sn)+(inactiveInitial?'State : Inactive\nConfig State : initial\nMatch State : Initial\n':'');
 const nativeTable=(sn=SN)=>'PON/ONU Serial State Run Config Match Last Link ONT\n'+(present?`1/0 ${sn} Inactive Initial initial Initial Client\n`:'')+`Total: ${present?1:0} Online:0 Offline:${present?1:0}\n`;
 const f=fixture(),[,context,transport]=await vendors.loadLibrary(),before=inventoryProof?nativeTable():nativeDetail(),spec={operation,address:ID,serialNumber:SN,version:VERSION,before,...(inventoryProof?{inventoryProof:true}:{}),...(operation==='rename'?{description:'Client Two',previousDescription:'Client'}:{})},commands=driver.actionCommands(spec),written=[];
 const result=await context.withContext(f.data,f.device,()=>{context.authorizeHsgqOperation(spec);context.current().hsgqGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(f.device),password:'unit',commands,timeoutMs:1000},({ready})=>{const stream=new EventEmitter();stream.write=value=>{written.push(value.trim());const command=value.trim();let body='',prompt='OLT(config)# ';
   if(command==='enable')prompt='OLT# ';if(command==='show version')body=VERSION;if(command.startsWith('show ont-info '))body=command.endsWith(' all')?nativeTable(badSn?'HWTC11223344':SN):present?nativeDetail(name,badSn?'HWTC11223344':SN):'Error, GET ont-auth table fail, reason: ONU is not exist.\n';
   if(command==='interface gpon 1')prompt=badMode?'OLT(config)# ':'OLT(config-gpon-1)# ';
   if(command.startsWith('ont setting ')){if(rejected)body='vty% Command incomplete.\n';else name='Client Two';}if(command==='ont delete 0')present=false;if(command==='save')body='Configuration saved successfully.\n';
   queueMicrotask(()=>stream.emit('data',body+'\n'+prompt));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT# '));});},{hsgqActionAllowed:true});return{result,written};
}
for(const operation of ['rename','delete','reboot','save'])test('native HSGQ '+operation+' checks firmware, mode and exact SN before a single mutation',async()=>{
 const {result,written}=await wire(operation);assert.equal(result.success,true,result.error);assert.equal(result.submitted,true);if(operation!=='reboot')assert.equal(result.verified,true);assert.equal(written.filter(command=>/^(?:ont setting|ont delete|ont reboot|save$)/.test(command)).length,1);
});
test('inactive Initial removal uses the same single-write and absent-readback verification',async()=>{
 const {result,written}=await wire('delete',{inactiveInitial:true});assert(result.success,result.error);assert(result.verified);assert.equal(written.filter(command=>command==='ont delete 0').length,1);
 const changed=await wire('delete',{inactiveInitial:true,badSn:true});assert(!changed.result.success);assert(!changed.written.includes('ont delete 0'));
});
test('HSGQ deletion uses a complete native PON table when unused per-ONU detail cannot respond',async()=>{
 const{result,written}=await wire('delete',{inventoryProof:true});assert(result.success,result.error);assert(result.verified);assert.equal(written.filter(x=>x==='ont delete 0').length,1);assert(written.includes('show ont-info 1 all'));assert(!written.includes('show ont-info 1 0'));
 const changed=await wire('delete',{inventoryProof:true,badSn:true});assert(!changed.result.success);assert(!changed.written.includes('ont delete 0'));
});
test('HSGQ PON deletion proof rejects truncated counts, unknown state, changed identity and duplicate entries',()=>{
 const text='PON/ONU Serial State Run Config Match Last Link ONT\n'+`1/0 ${SN} Inactive Initial initial Initial Client\nTotal: 1 Online:0 Offline:1\n`,target=driver.position(ID);
 assert.equal(driver.removalTable(text,target).state,'offline');
 for(const value of[text.replace('Total: 1','Total: 2'),text.replace(SN,'HWTC11223344'),text.replace('1/0','2/0'),text.replace('Total: 1',`1/0 ${SN} Inactive Initial initial Initial Client\nTotal: 2`)])assert.throws(()=>driver.removalTable(value,target));
 assert.equal(driver.removalTable(text.replace('Inactive Initial initial Initial','Active Initial initial Initial'),target).state,'unknown');
 const moved=text.replace('1/0','1/1');assert.throws(()=>driver.removalTable(moved,target),/berpindah/);
});
test('same-session target or interface change blocks native mutation before sending',async()=>{
 for(const change of [{badSn:true},{badMode:true}]){const{result,written}=await wire('delete',change);assert.equal(result.success,false);assert.equal(result.submitted,false);assert(!written.includes('ont delete 0'));}
 const{result}=await wire('rename',{rejected:true});assert.equal(result.success,false);assert.equal(result.submitted,true);
});
test('native missing-ONU response is accepted only for an exact single-position read',()=>{
 const response='show ont-info 1 0\r\n  Error, GET ont-auth table fail, reason: ONU is not exist.\r\nOLT(config)# ';
 assert(driver.missingDetailResponse('show ont-info 1 0',response));assert.deepEqual(driver.detail(response,driver.position(ID),{allowMissing:true}),{state:'missing'});assert.throws(()=>driver.detail(response,driver.position(ID)));
 for(const command of ['show ont-info 1 all','show ont-info 0 0','show ont-info 1 128','ont delete 0'])assert(!driver.missingDetailResponse(command,response));
 assert(!driver.missingDetailResponse('show ont-info 1 0','Error, GET ont-auth table fail, reason: permission denied.'));
});
test('HSGQ grant cannot be reused, widened, or issued outside the explicit action context',async()=>{
 const f=fixture(),[,context,transport]=await vendors.loadLibrary(),spec={operation:'delete',address:ID,serialNumber:SN,version:VERSION,before:detail()};let calls=0;
 await assert.rejects(context.withContext(f.data,f.device,()=>context.authorizeHsgqOperation(spec)));
 await context.withContext(f.data,f.device,async()=>{context.authorizeHsgqOperation(spec);const commands=driver.actionCommands(spec);for(const changed of [[...commands,'save'],commands.map(row=>row==='ont delete 0'?'ont delete 1':row)])await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:changed}));await transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands});await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands}));},{hsgqActionAllowed:true,transports:{commands:async()=>{calls++;return{success:true};}}});assert.equal(calls,1);
});
test('bounded HSGQ inventory retains ONU 0, real causes and exact PON counts; truncated rows do not become zero',async()=>{
 const f=fixture();let truncated=false;const calls=[];const options={transports:{exec:async(name,args)=>({stdout:args.some(value=>value.endsWith('.1.2'))?'.1.3.6.1.2.1.2.2.1.2.1 = STRING: "PON01"\n':'.1.3.6.1.2.1.1.1.0 = STRING: "HSGQ-G008ID"\n'}),commands:async({commands})=>{calls.push(...commands);return{success:true,outputs:commands.map(command=>({command,stdout:command==='show version'?VERSION:command==='show ont-info 1 all'?table(truncated?'':row()):'OLT(config)#'}))};}}};
 const result=await vendors.readInventory(f.data,f.device,{normalizeSerial:monitor.normalizeSerial,classifyCause:monitor.classifyCause},options);assert.equal(result.rows.length,1);assert.equal(result.rows[0].onuId,0);assert.equal(result.rows[0].condition,'los');assert.equal(result.hsgqActions.delete,true);assert(!calls.includes('show ont-info all'));assert(!calls.includes('show ont-optical all'));
 truncated=true;await assert.rejects(vendors.readInventory(f.data,f.device,{},options),/terpotong/);
});
test('HSGQ ONU 0 uses the existing planned reboot ticket suppression without broadening another PON',()=>{
 const f=fixture(),planned=require('../src/olt-planned-reboot'),target={oltId:f.device.id,onuIndex:ID,serialNumber:SN,pon:'0/0/1',source:'olt'},now=Date.now();assert(planned.begin(f.data,target,{role:'admin'},now));const snapshot={id:ID,serialNumber:SN,ponKey:'0/0/1'};assert(planned.forOnu(f.data,f.device,snapshot,{now:now+1000}));assert.equal(planned.forOnu(f.data,f.device,{...snapshot,ponKey:'0/0/2'},{now:now+1000}),null);
});
test('billing collector decodes hexadecimal IF-MIB names before reusing the HSGQ physical PON walk',async()=>{
 const f=fixture(),original=vendors.readInventory;let calls=0;
 vendors.readInventory=async(data,device,helpers)=>{calls++;assert.deepEqual(helpers.physicalInterfaces,[{value:'PON01'}]);return{available:true,rows:[],hsgqActions:{rename:true},modelLabel:'HSGQ-G008ID'};};
 try{const result=await monitor.collect(f.data,f.device,async(target,name,oid)=>name==='system'?[{oid:oid+'.2.0',type:'OID',value:'.1.3.6.1.4.1.50224'}]:name==='interfaces'?[{oid:oid+'.1',type:'Hex-STRING',value:'50 4F 4E 30 31'}]:[{oid:oid+'.1',type:'INTEGER',value:'1'}]);assert.equal(calls,1);assert.equal(result.inventoryAvailable,true);assert.equal(result.ports[0].ponKey,'0/0/1');assert.equal(result.ports[0].status,'online');}finally{vendors.readInventory=original;}
});
test('unframed HSGQ JSON ends after a complete parsed object and closes the stream, not a partial or foreign body',async()=>{
 const f=fixture(),[,context]=await vendors.loadLibrary();let canceled=false;
 const response=await context.withContext(f.data,f.device,()=>context.readOnlyFetch('http://192.0.2.9/gponont_mgmt?form=ont_optical&port_id=1&ont_id=0',{headers:{'Content-Type':'application/json','X-Token':'unit'}}),{timeoutMs:500,transports:{fetch:async(url,input)=>{assert.equal(input.headers.has('content-type'),false);assert.equal(input.headers.get('x-token'),'unit');return new Response(new ReadableStream({start(controller){controller.enqueue(Buffer.from('{"code":1,"data":'));controller.enqueue(Buffer.from('{"rx":"-25.5"}}'));},cancel(){canceled=true;return new Promise(()=>{});}}),{headers:{'Content-Type':'application/json'}});}}});
 assert.deepEqual(await response.json(),{code:1,data:{rx:'-25.5'}});assert.equal(canceled,true);
});
test('per-page optical queries verify the current serial, use ONU RX not OLT RX, and reuse a bounded cache',async()=>{
 const f=fixture(),target={id:ID,serialNumber:SN,slot:0,pon:1,onuId:0,status:'online',rxPower:null};let reads=0,fetches=0;
 const options={transports:{commands:async({commands})=>{reads++;return{success:true,outputs:commands.map(command=>({command,stdout:command==='show version'?VERSION:command==='show ont-info 1 all'?table(row('Online','')):'OLT(config)#'}))};},fetch:async(url,input)=>{fetches++;assert.equal(input.signal.aborted,false);if(url.pathname==='/userlogin')return new Response('{"code":1}',{headers:{'X-Token':'unit'}});assert.equal(url.searchParams.get('ont_id'),'0');return new Response(JSON.stringify({code:1,data:{port_id:1,ont_id:0,receive_power:'-19.6220 dBm',transmit_power:'2.58 dBm',olt_rxpower:'-26.1979 dBm'}}));}}};
 const first=await driver.enrichPage(f.data,f.device,[target],options);assert.equal(first[0].rxPower,-19.622);assert.equal(first[0].txPower,2.58);assert.equal(reads,1);assert.equal(fetches,2);assert.equal((await driver.enrichPage(f.data,f.device,[target],options))[0].rxPower,-19.622);assert.equal(reads,1);assert.equal(fetches,2);
 assert.equal(driver.opticalReading({port_id:2,ont_id:0,receive_power:'-20 dBm'},driver.position(ID)),null);
});
test('stale page identity cannot fetch optical for a replacement ONU or expand beyond eight rows',async()=>{
 const f=fixture(),target={id:ID,serialNumber:SN,slot:0,pon:1,onuId:0,status:'online',rxPower:null};let reads=0,fetches=0;const options={transports:{commands:async({commands})=>{reads++;return{success:true,outputs:commands.map(command=>({command,stdout:command==='show version'?VERSION:command==='show ont-info 1 all'?table(row('Online','').replace(SN,'HWTC11223344')):'OLT(config)#'}))};},fetch:async()=>{fetches++;throw Error('Must not read another ONU');}}};
 assert.equal((await driver.enrichPage(f.data,f.device,[target],options))[0].rxPower,null);assert.equal(fetches,0);assert.equal(reads,1);await driver.enrichPage(f.data,f.device,Array.from({length:9},()=>target),options);assert.equal(reads,1);
});
test('background optical reads do not hold the page response or create duplicate in-flight work',async()=>{
 const f=fixture(),target={id:ID,serialNumber:SN,slot:0,pon:1,onuId:0,status:'online',rxPower:null};let release,reads=0;const gate=new Promise(resolve=>release=resolve),options={background:true,transports:{commands:async()=>{reads++;await gate;return{success:false,outputs:[]};}}};
 const result=await driver.enrichPage(f.data,f.device,[target],options);assert.equal(result[0].rxPower,null);await driver.enrichPage(f.data,f.device,[target],options);assert(reads<=1);release();await new Promise(resolve=>setImmediate(resolve));
});
test('user inspection waits for in-flight optical reads and blocks replacement background work',async()=>{
 const f=fixture(),target={id:ID,serialNumber:SN,slot:0,pon:1,onuId:0,status:'online',rxPower:null};let release,reads=0,inspections=0;const gate=new Promise(resolve=>release=resolve);
 await driver.enrichPage(f.data,f.device,[target],{background:true,transports:{commands:async()=>{reads++;await gate;return{success:false,outputs:[]};}}});
 const task=driver.run(f.data,f.device,target,'inspect',{}, {transports:{commands:async({commands})=>{inspections++;return{success:true,outputs:commands.map(command=>({command,stdout:command==='show version'?VERSION:command==='show ont-info 1 0'?detail('Online'):'OLT(config)#'}))};}}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(inspections,0);assert(driver.isBusy(f.device.id));await driver.enrichPage(f.data,f.device,[target],{background:true});assert.equal(reads,1);release();const result=await task;assert.equal(result.state,'online');assert.equal(inspections,1);assert(!driver.isBusy(f.device.id));
});
test('removal preview retries one timed-out PON read without sending a mutation or treating timeout as absence',async()=>{
 for(const recover of[true,false]){const f=fixture(),target={id:ID,serialNumber:SN};let reads=0;const options={transports:{commands:async({commands})=>{reads++;assert(commands.every(command=>command==='enable'||command==='configure'||command.startsWith('show ')));if(reads===1||!recover)return{success:false,error:'Batas waktu pembacaan vendor terlampaui',outputs:[]};return{success:true,outputs:commands.map(command=>({command,stdout:command==='show version'?VERSION:command==='show ont-info 1 all'?table():'OLT(config)#'}))};}}};
  const task=driver.run(f.data,f.device,target,'inspect',{purpose:'delete'},options);if(recover)assert.equal((await task).state,'offline');else await assert.rejects(task,/belum dapat/);assert.equal(reads,2);
 }
});
test('removal preview never retries changed identity or unsupported CLI errors',async()=>{
 for(const type of['identity','command']){const f=fixture();let reads=0;const options={transports:{commands:async({commands})=>{reads++;return type==='command'?{success:false,error:'Perintah vendor belum didukung firmware',outputs:[]}:{success:true,outputs:commands.map(command=>({command,stdout:command==='show version'?VERSION:command==='show ont-info 1 all'?table().replaceAll(SN,'HWTC11223344'):'OLT(config)#'}))};}}};await assert.rejects(driver.run(f.data,f.device,{id:ID,serialNumber:SN},'inspect',{purpose:'delete'},options));assert.equal(reads,1);}
});
