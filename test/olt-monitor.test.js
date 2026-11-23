'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.REDIS_CACHE = '0';
const olt = require('../src/olt-monitor');
const auth = require('../src/auth');
const secrets = require('../src/secure-secrets');
const {createDefaultStore,ensureShape} = require('../src/store');

function tables() {
  const row=(oid,value,type='INTEGER')=>({oid,value:String(value),type});
  const list=(key,items)=>items.map(([id,value,type])=>row(olt.OIDS[key]+'.'+id,value,type));
  return {
    system:list('system',[['1.0','"CDATA Test"','STRING'],['2.0','.1.3.6.1.4.1.17409','OID'],['3.0','(12000) 0:02:00','Timeticks'],['5.0','"Test OLT"','STRING']]),
    interfaces:list('interfaces',[['1310721','"gpon 0/0/1"','STRING'],['524289','"ge 0/0/1"','STRING']]),
    interfaceStatus:list('interfaceStatus',[['1310721',1],['524289',1]]),
    serial:list('serial',[['4718593','48 57 54 43 AA BB CC DD','Hex-STRING'],['4718594','46 48 54 54 AA BB CC DD','Hex-STRING']]),
    status:list('status',[['4718593',1],['4718594',2]]), name:list('name',[['4718593','"Client A"','STRING']]),
    model:list('model',[['4718593','"HG8145V5"','STRING']]),distance:list('distance',[['4718593',1234]]),
    rx:list('rx',[['4718593.0.0',-2750],['4718594.0.0',-1]])
  };
}
test('CDATA status, serial, PON and optical units follow real MIB columns',()=>{
  const result=olt.normalizeSnapshot(tables(),0);
  assert.deepEqual(result.summary,{total:2,online:1,offline:1,unknown:0,highRx:1,los:0,dyingGasp:0,other:1});
  assert.equal(result.onus[0].serialNumber,'HWTCAABBCCDD');
  assert.equal(result.onus[0].rxPower,-27.5);
  assert.equal(result.onus[1].rxPower,null);
  assert.equal(result.onus[0].ponKey,'0/0/1');
  assert.equal(result.onus[0].distance,1234);
  assert.equal(result.ports[0].total,2);assert.equal(result.ports[0].offline,1);
  assert.equal(result.uptimeTicks,12000);
});
test('unknown status is not silently classified offline and missing RX is not zero',()=>{
  const input=tables();input.status=[];input.rx=[];
  const result=olt.normalizeSnapshot(input);assert.equal(result.summary.unknown,2);assert.equal(result.summary.offline,0);assert.equal(result.onus[0].rxPower,null);
});
test('newer CDATA index family and hex vendor normalization are supported',()=>{
  assert.deepEqual(olt.position(0x1480000+0x1000+19),{slot:1,pon:2,onuId:19,ponKey:'0/1/2'});
  assert.equal(olt.normalizeSerial('48575443AABBCCDD'),'HWTCAABBCCDD');
  assert.equal(olt.normalizeSerial('HWTCAABBCCDD'),'HWTCAABBCCDD');
  assert.equal(olt.normalizeSerial('invalid'),'');assert.equal(olt.position(-1),null);
});
test('SNMP parser handles wrapped octets, quoted names and noSuchObject',()=>{
  const rows=olt.parseRows('.1.2.3 = Hex-STRING: 48 57 54 43\n AA BB CC DD\n.1.2.4 = STRING: "A B"\n.1.2.5 = No Such Object available on this agent at this OID');
  assert.equal(rows.length,2);assert.equal(rows[0].value,'48 57 54 43 AA BB CC DD');assert.equal(rows[1].value,'"A B"');
});
test('device is manually configurable, credentials encrypted, empty edit retains community',()=>{
  const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.1',community:'Read-Only-Unit',enabled:true});
  data.oltDevices.push(device);assert.equal(secrets.decryptSecret(data,device.communityEnc),'Read-Only-Unit');assert(!device.communityEnc.includes('Read-Only-Unit'));
  const edit=olt.validateDevice(data,{community:'',name:'Unit Changed'},device);
  assert.equal(edit.communityEnc,device.communityEnc);assert.equal(edit.name,'Unit Changed');
  assert(!JSON.stringify(olt.publicDevice(edit,null,{management:true})).includes('Read-Only-Unit'));
  assert(!JSON.stringify(olt.publicDevice(edit)).includes('communityEnc'));
  assert.throws(()=>olt.validateDevice(data,{name:'Other',host:'192.0.2.1',community:'x'}),/sudah terdaftar/);
});
for(const host of ['127.0.0.1','169.254.169.254','0.0.0.0','224.0.0.1','::1','ff02::1','example.test','192.0.2.1;reboot'])test(`unsafe OLT management address rejected: ${host}`,()=>{
  assert.throws(()=>olt.validateDevice(createDefaultStore(),{name:'Unit',host,community:'x'}));
});
test('invalid booleans, port, partial coordinates and nonexistent NAS rejected',()=>{
  for(const input of [{enabled:'false'},{port:0},{port:'1;reboot'},{latitude:1},{latitude:0,longitude:0},{nasId:'missing'}])assert.throws(()=>olt.validateDevice(createDefaultStore(),{name:'Unit',host:'192.0.2.1',community:'x',...input}));
});
test('OLT read access excludes only finance and reseller roles without broadening technical write access',()=>{
  for(const role of ['reseller_voucher','finance','partner'])assert(!auth.hasPermission(auth.publicUser({role}),'olt:read'));
  for(const role of ['admin','owner','noc','technician','secretary','collector','viewer'])assert(auth.hasPermission(auth.publicUser({role}),'olt:read'));
  assert(!auth.hasPermission(auth.publicUser({role:'technician'}),'olt:manage'));assert(auth.hasPermission(auth.publicUser({role:'secretary'}),'olt:manage'));
});
test('technical NAS lock excludes unassigned and other-site OLTs',()=>{
  const data={oltDevices:[{id:'a',nasId:'nas-a'},{id:'b',nasId:'nas-b'},{id:'c',nasId:''}]};
  assert.deepEqual(olt.visibleDevices(data,{role:'technician',lockedNasIds:['nas-a']}).map(row=>row.id),['a']);
  assert.equal(olt.visibleDevices(data,{role:'technician',lockedNasIds:['all']}).length,3);
});
test('read-only collection has bounded column list and ignores optional missing optics',async()=>{
  const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.1',community:'unit'}),calls=[];
  const snapshot=await olt.collect(data,device,async(target,name,oid)=>{calls.push(name);assert(!oid.includes('password'));if(name==='rx')throw Error('unsupported');return tables()[name]||[];});
  assert.equal(calls.length,9);assert.equal(snapshot.onus[0].rxPower,null);assert.equal(snapshot.warnings.length,1);
});
test('one poll per device is deduplicated; failures keep last real data without fake offline counts',async()=>{
  const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.2',community:'unit',enabled:true});
  let calls=0;const transport=async(target,name)=>{calls++;await new Promise(resolve=>setTimeout(resolve,1));return tables()[name]||[];};
  const [a,b]=await Promise.all([olt.poll(data,device,transport),olt.poll(data,device,transport)]);assert.equal(calls,9);assert.deepEqual(a,b);
  const failed=await olt.poll(data,device,async()=>{throw Error('private exception with community');});
  assert.equal(failed.status,'unreachable');assert.equal(failed.stale,true);assert.deepEqual(failed.onus,a.onus);assert(!failed.error.includes('private exception'));
});
test('last online time advances only for online observations and survives offline snapshots and serialization',()=>{
  const first={status:'online',checkedAt:'2026-11-01T01:00:00.000Z',onus:[{id:'1',serialNumber:'HWTCAABBCCDD',status:'online',name:'Original Description'}]};
  const initial=olt.preserveLastOnline(first),offline={status:'online',checkedAt:'2026-11-01T02:00:00.000Z',onus:[{...first.onus[0],status:'offline'}]},before=structuredClone(offline);
  assert.equal(initial.onus[0].lastOnlineAt,first.checkedAt);const remembered=olt.preserveLastOnline(offline,initial);assert.equal(remembered.onus[0].lastOnlineAt,first.checkedAt);assert.deepEqual(offline,before);
  assert.equal(olt.lastOnlineAt(JSON.parse(JSON.stringify(remembered)),remembered.onus[0]),first.checkedAt);
  assert.equal(olt.preserveLastOnline({...first,checkedAt:'2026-11-01T03:00:00.000Z'},remembered).onus[0].lastOnlineAt,'2026-11-01T03:00:00.000Z');
});
test('legacy online caches use last successful read, while previously offline or unknown ONUs are never backdated from poll time',()=>{
  const past={status:'unreachable',stale:true,checkedAt:'2026-11-01T03:00:00.000Z',lastSuccessAt:'2026-11-01T01:00:00.000Z',onus:[{serialNumber:'HWTCAABBCCDD',status:'online'}]};
  const next={status:'online',checkedAt:'2026-11-01T04:00:00.000Z',onus:[{serialNumber:'HWTCAABBCCDD',status:'offline'}]};
  assert.equal(olt.preserveLastOnline(next,past).onus[0].lastOnlineAt,past.lastSuccessAt);
  for(const status of ['offline','unknown'])assert.equal(olt.preserveLastOnline(next,{...past,onus:[{...past.onus[0],status}]}).onus[0].lastOnlineAt,'');
  assert.equal(olt.lastOnlineAt(next,{status:'offline',lastOnlineAt:'invalid'}),'');assert.equal(olt.lastOnlineAt(next,{status:'offline',lastOnlineAt:'2030-01-01T00:00:00Z'}),'');
});
test('last-online mapping follows canonical serial rather than a reused ONU index',()=>{
  const previous={status:'online',checkedAt:'2026-11-01T01:00:00.000Z',onus:[{id:'1',serialNumber:'48575443AABBCCDD',status:'online'}]};
  const next={status:'online',checkedAt:'2026-11-01T02:00:00.000Z',onus:[{id:'99',serialNumber:'HWTCAABBCCDD',status:'offline'},{id:'1',serialNumber:'HWTC11223344',status:'offline'}]};
  const rows=olt.preserveLastOnline(next,previous).onus;assert.equal(rows[0].lastOnlineAt,previous.checkedAt);assert.equal(rows[1].lastOnlineAt,'');
});
test('last-online tracking adds no OLT queries and keeps its timestamp after a real poll failure',async()=>{
  const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Last Online Unit',host:'192.0.2.67',community:'unit',enabled:true});let reads=0;
  const first=await olt.poll(data,device,async(target,name)=>{reads++;return tables()[name]||[];});assert.equal(reads,9);assert(first.onus[0].lastOnlineAt);assert.equal(first.onus[1].lastOnlineAt,'');
  const failed=await olt.poll(data,device,async()=>{throw Error('failure');});assert.equal(failed.onus[0].lastOnlineAt,first.onus[0].lastOnlineAt);
});
test('ticket lifecycle is independent of invoices and prevents duplicate active fault',()=>{
  const data=createDefaultStore();data.oltDevices=[{id:'a',name:'Unit'}];data.users=[{id:'tech',role:'technician',active:true}];
  const before=structuredClone({customers:data.customers,invoices:data.invoices,payments:data.payments,waMessages:data.waMessages});
  const ticket=olt.saveTicket(data,{oltId:'a',title:'PON down',description:'Line one\nLine two',pon:'0/0/1',assignedTo:'tech'},{id:'admin'});data.oltTickets=[ticket];
  assert.throws(()=>olt.saveTicket(data,{oltId:'a',title:'Duplicate',pon:'0/0/1'},{id:'admin'}),/sudah memiliki tiket/);
  const done=olt.saveTicket(data,{status:'resolved'},{id:'secretary',role:'secretary'},ticket);assert(done.resolvedAt);assert.equal(done.number,ticket.number);
  assert(olt.ticketMessage(data,ticket).includes('Unit'));
  assert.deepEqual({customers:data.customers,invoices:data.invoices,payments:data.payments,waMessages:data.waMessages},before);
});
test('map points require real coordinates; explicit ONU mapping changes only OLT metadata',()=>{
  const data=createDefaultStore();data.customers=[{id:'customer-a',name:'A'}];data.fiberPoints=[{id:'odp-a',code:'ODP-A'}];
  const device={id:'a',name:'Unit',links:{},latitude:null,longitude:null};assert.equal(olt.mappingNodes(data,[device]).length,0);
  const linked=olt.linkCustomer(data,device,'HWTCAABBCCDD',{customerId:'customer-a',fiberPointId:'odp-a'});
  const rows=olt.linkedOnus(data,linked,[{serialNumber:'HWTCAABBCCDD'}]);assert.equal(rows[0].customerName,'A');assert.equal(rows[0].fiberPointName,'ODP-A');assert.deepEqual(device.links,{});
  assert.equal(olt.mappingNodes(data,[{...device,latitude:-0.5,longitude:117}])[0].type,'olt');
});
test('existing store shape retains OLT arrays without replacing financial collections',()=>{
  const input=createDefaultStore();input.oltDevices=[{id:'a'}];input.oltTickets=[{id:'t'}];const result=ensureShape(input);
  assert.deepEqual(result.oltDevices,input.oltDevices);assert.deepEqual(result.oltTickets,input.oltTickets);assert.deepEqual(result.invoices,input.invoices);
});
test('OLT list separates the real member and account from original description and inherits mapped member ODP',()=>{
 const data=createDefaultStore();data.customers=[{id:'a',name:'Real Name',username:'old-account',nasId:'n1',odpId:'odp-a'}];data.radiusUsers=[{id:'u',customerId:'a',username:'actual-account',nasId:'n1'}];data.fiberPoints=[{id:'odp-a',code:'ODP-01',name:'Area A'}];
 const device={id:'o',nasId:'n1',links:{HWTCAABBCCDD:{customerId:'a'}}},onu={serialNumber:'HWTCAABBCCDD',name:'WEIRD_RAW_DESCRIPTION'},before=structuredClone({data,device,onu});
 const row=olt.linkedOnus(data,device,[onu])[0];assert.equal(row.customerName,'Real Name');assert.equal(row.customerUsername,'actual-account');assert.equal(row.fiberPointName,'ODP-01 - Area A');assert.equal(row.name,'WEIRD_RAW_DESCRIPTION');assert.deepEqual({data,device,onu},before);
 assert.equal(olt.linkedOnus(data,{...device,nasId:'n2'},[onu])[0].customerName,'');
});
test('new SNMP readings and legacy cached ONU names show description without their physical prefix',()=>{
 const input=tables();input.name[0].value='"gpon 0/0/1 onu 1 Client A"';
 const snapshot=olt.normalizeSnapshot(input);assert.equal(snapshot.onus[0].name,'Client A');
 input.name[0].value='"gpon 0/0/1 onu 1"';assert.equal(olt.normalizeSnapshot(input).onus[0].name,'');
 const legacy={...snapshot.onus[0],name:'gpon 0/0/1 onu 1 Client A'},data=createDefaultStore(),before=structuredClone(legacy);
 assert.equal(olt.linkedOnus(data,{links:{}},[legacy])[0].name,'Client A');assert.deepEqual(legacy,before);
});
test('offline causes come from explicit OLT reports, not RX power or a previous online event',()=>{
 const snapshot=olt.normalizeSnapshot(tables());
 olt.applyCauses(snapshot,olt.parseCauseRows('Offline : 1\n0/0 1 2 FHTTAABBCCDD 7 dying-gasp\n0/0 1 1 HWTCAABBCCDD 1 LOS'));
 assert.equal(snapshot.summary.dyingGasp,1);assert.equal(snapshot.summary.los,0);assert.equal(snapshot.onus[0].condition,'online');assert.equal(snapshot.onus[0].downCause,'');
 assert.equal(snapshot.onus[1].condition,'dying-gasp');assert.equal(snapshot.onus[1].causeKnown,true);assert(olt.matchesState(snapshot.onus[1],'offline'));assert(olt.matchesState(snapshot.onus[1],'dying-gasp'));assert(!olt.matchesState(snapshot.onus[1],'los'));
 assert.equal(olt.classifyCause('LOS'),'los');assert.equal(olt.classifyCause('dying_gasp'),'dying-gasp');assert.equal(olt.classifyCause('Deactivated'),'other');assert.equal(olt.classifyCause(''),'other');
 olt.applyCauses(snapshot);assert.equal(snapshot.summary.other,1);assert.equal(snapshot.onus[1].causeKnown,false);assert.equal(snapshot.ports[0].other,1);
 assert.throws(()=>olt.parseCauseRows('Error: Permission denied'));
});
test('CLI credentials are optional, encrypted, preserved on blank edit, and never returned',()=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.1',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'VeryPrivate'});
 assert.equal(secrets.decryptSecret(data,device.cliPasswordEnc),'VeryPrivate');const edited=olt.validateDevice(data,{cliPassword:''},device);assert.equal(edited.cliPasswordEnc,device.cliPasswordEnc);
 assert(!JSON.stringify(olt.publicDevice(device,null,{management:true})).includes('VeryPrivate'));assert(!JSON.stringify(olt.publicDevice(device)).includes('cliPasswordEnc'));
 assert.throws(()=>olt.validateDevice(data,{name:'X',host:'192.0.2.10',community:'x',cliEnabled:true}));assert.throws(()=>olt.validateDevice(data,{cliEnabled:'false'},device));assert.throws(()=>olt.validateDevice(data,{cliUsername:'root\nconfig'},device));
});
test('one optional CLI read enriches the whole snapshot; failure never claims LOS or power loss',async()=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.1',community:'x',cliEnabled:true,cliUsername:'unit',cliPassword:'x'});let reads=0;
 const result=await olt.collect(data,device,async(target,name)=>tables()[name]||[],async()=>{reads++;return 'Offline : 1\n0/0 1 2 FHTTAABBCCDD 7 LOS';});assert.equal(reads,1);assert.equal(result.summary.los,1);
 const failed=await olt.collect(data,device,async(target,name)=>tables()[name]||[],async()=>{throw Error('Password secret');});assert.equal(failed.summary.other,1);assert.equal(failed.summary.los,0);assert(!JSON.stringify(failed).includes('Password secret'));
});
test('ONU pagination requires one selected OLT and never aggregates several OLT inventories',async()=>{
 const data=createDefaultStore();for(let i=1;i<=2;i++){const device=olt.validateDevice(data,{name:'OLT '+i,host:'192.0.2.'+(30+i),community:'x'});data.oltDevices.push(device);await olt.poll(data,device,async(target,name)=>tables()[name]||[]);}
 for(const oltId of [undefined,'all']){const page=await olt.onuPage(data,data.oltDevices,{oltId,status:'other',limit:10});assert.equal(page.total,0);assert.equal(page.selectionRequired,true);assert.deepEqual(page.onus,[]);assert.deepEqual(page.devices,[]);}
 const page=await olt.onuPage(data,data.oltDevices,{oltId:data.oltDevices[1].id,status:'other',limit:10});assert.equal(page.total,1);assert(page.onus.every(row=>row.oltId===data.oltDevices[1].id));assert.equal(page.summary.total,2);
 const single=await olt.onuPage(data,[data.oltDevices[0]],{oltId:'all'});assert.equal(single.total,2);assert(single.onus.every(row=>row.oltId===data.oltDevices[0].id));
});
test('ONU list defaults to eight per page and preserves exact boundaries, filters and legacy explicit sizes',async()=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Unit Eight',host:'192.0.2.132',community:'unit'});data.oltDevices=[device];await olt.poll(data,device,async(_,name)=>tables()[name]||[]);const snapshot=await olt.snapshotFor(device),sample=snapshot.onus[0];snapshot.onus=Array.from({length:19},(_,i)=>({...sample,id:String(4718593+i),serialNumber:'HWTC'+String(i+1).padStart(8,'0')}));snapshot.summary=olt.summarizeOnus(snapshot.onus);
 const first=await olt.onuPage(data,[device],{oltId:device.id}),second=await olt.onuPage(data,[device],{oltId:device.id,page:2}),third=await olt.onuPage(data,[device],{oltId:device.id,page:3});assert.equal(first.limit,8);assert.equal(first.pages,3);assert.equal(first.onus.length,8);assert.equal(second.onus.length,8);assert.equal(third.onus.length,3);assert.equal(new Set([...first.onus,...second.onus,...third.onus].map(row=>row.id)).size,19);assert.equal((await olt.onuPage(data,[device],{oltId:device.id,limit:0})).limit,8);assert.equal((await olt.onuPage(data,[device],{oltId:device.id,limit:25})).limit,25);assert.equal((await olt.onuPage(data,[device],{oltId:device.id,limit:16})).onus.length,16);
});
test('fault filters span cached PONs on the selected OLT with eight rows per page and no additional collection',async()=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Fault Scope Unit',host:'192.0.2.133',community:'unit'});data.oltDevices=[device];let reads=0;
 await olt.poll(data,device,async(_,name)=>{reads++;return tables()[name]||[];});const snapshot=await olt.snapshotFor(device),sample=snapshot.onus[0];
 snapshot.onus=[1,2,3].flatMap(pon=>['los','dying-gasp','other','high-rx'].flatMap((condition,kind)=>Array.from({length:4},(_,index)=>({...sample,id:String(pon*100+kind*4+index),ponKey:'0/0/'+pon,serialNumber:'HWTC'+String(pon*100+kind*4+index).padStart(8,'0'),status:condition==='high-rx'?'online':'offline',condition:condition==='high-rx'?'online':condition,rxPower:condition==='high-rx'?-28:null}))));snapshot.summary=olt.summarizeOnus(snapshot.onus);
 const baseline=reads,before=JSON.stringify(data),foreign={id:'unselected',get vendor(){throw Error('Other OLT accessed');}};
 for(const status of ['los','dying-gasp','other','high-rx']){
  const first=await olt.onuPage(data,[device,foreign],{oltId:device.id,status,limit:8}),second=await olt.onuPage(data,[device,foreign],{oltId:device.id,status,limit:8,page:2});
  assert.equal(first.total,12);assert.equal(first.onus.length,8);assert.equal(second.onus.length,4);assert.equal(first.summary.total,48);assert.equal(new Set([...first.onus,...second.onus].map(row=>row.ponKey)).size,3);assert.equal(new Set([...first.onus,...second.onus].map(row=>row.id)).size,12);
  const selected=await olt.onuPage(data,[device,foreign],{oltId:device.id,status,pon:'0/0/3',limit:8});assert.equal(selected.total,4);assert(selected.onus.every(row=>row.ponKey==='0/0/3'));
 }
 assert.equal(reads,baseline);assert.equal(JSON.stringify(data),before);
});
test('unselected OLT never reads cache or projects customer details, and pagination enriches only shown rows',async()=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Selected OLT',host:'192.0.2.130',community:'unit'});data.oltDevices=[device];await olt.poll(data,device,async(_,name)=>tables()[name]||[]);const snapshot=await olt.snapshotFor(device),hidden={id:'other',nasId:'other',get vendor(){throw Error('Unselected cache accessed');}},customer={id:'private',get name(){throw Error('Unshown ONU projected');}};data.customers=[customer];
 const rows=Array.from({length:26},(_,index)=>({...snapshot.onus[0],id:String(4718593+index),serialNumber:'HWTC'+String(index+1).padStart(8,'0')}));snapshot.onus=rows;snapshot.summary=olt.summarizeOnus(rows);device.links={[rows[25].serialNumber]:{customerId:customer.id}};
 const first=await olt.onuPage(data,[device,hidden],{oltId:device.id,limit:25});assert.equal(first.onus.length,25);assert.equal(first.total,26);assert.equal(first.summary.total,26);assert(first.onus.every(row=>row.customerName===''));await assert.rejects(olt.onuPage(data,[device,hidden],{oltId:device.id,limit:25,page:2}),/Unshown ONU projected/);
});
test('ONU deletion requires exact confirmation and current live serial; financial data untouched',async()=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.44',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'x'});
 const before=JSON.stringify(data);let writes=0;const transport={serial:async()=> 'HWTCAABBCCDD',delete:async()=>{writes++;return{deleteConfirmed:true};}};
 // Seed a matching cache without a real CLI call by temporarily stubbing the optional transport.
 const cli=require('../src/olt-cli'),original=cli.readCauses;cli.readCauses=async()=> 'Offline : 1\n0/0 1 2 FHTTAABBCCDD 7 LOS';await olt.poll(data,device,async(target,name)=>tables()[name]||[]);cli.readCauses=original;
 for(const payload of [{serialNumber:'FHTTAABBCCDD',confirmDelete:true},{serialNumber:'HWTCAABBCCDD',confirmDelete:'true'}])await assert.rejects(olt.removeOnu(data,device,'HWTCAABBCCDD',payload,transport));
 await assert.rejects(olt.removeOnu(data,device,'HWTCAABBCCDD',{serialNumber:'HWTCAABBCCDD',confirmDelete:true},{...transport,serial:async()=> 'FHTTAABBCCDD'}),/Serial ONU/);assert.equal(writes,0);
 const result=await olt.removeOnu(data,device,'HWTCAABBCCDD',{serialNumber:'HWTCAABBCCDD',confirmDelete:true},transport);assert.equal(writes,1);assert(result.confirmed);assert.equal(JSON.stringify(data),before);
 const refreshed=await olt.snapshotFor(device);assert.equal(refreshed.summary.total,1);assert(refreshed.pendingRefresh);assert.equal(olt.publicDevice(device,refreshed).stale,false);
});
test('persistent synthetic snapshots are available only in isolated demo mode',async()=>{
 const original=process.env.MIGRATION_MODE,device={id:'demo-olt-31',host:'192.0.2.200',port:161,communityEnc:'unit',enabled:true,demoSnapshot:{...olt.normalizeSnapshot(tables(),0),simulated:true}};
 try{process.env.MIGRATION_MODE='1';assert.equal((await olt.snapshotFor(device)).summary.total,2);assert.equal(olt.publicDevice(device,await olt.snapshotFor(device)).simulated,true);assert.equal(olt.publicDevice(device,await olt.snapshotFor(device)).stale,false);process.env.MIGRATION_MODE='0';assert.equal(await olt.snapshotFor(device),null);assert.equal(olt.publicDevice(device,device.demoSnapshot).simulated,false);}finally{if(original===undefined)delete process.env.MIGRATION_MODE;else process.env.MIGRATION_MODE=original;}
});
test('reboot rejects mismatched current serial and preserves billing plus visible OLT totals',async()=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.45',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'x'});
 const cli=require('../src/olt-cli'),original=cli.readCauses;cli.readCauses=async()=> 'Offline : 1\n0/0 1 2 FHTTAABBCCDD 7 LOS';try{await olt.poll(data,device,async(target,name)=>tables()[name]||[]);}finally{cli.readCauses=original;}
 const before=JSON.stringify(data),summary=(await olt.snapshotFor(device)).summary;let writes=0;
 const transport={serial:async()=> 'HWTCAABBCCDD',reboot:async()=>{writes++;}};
 await assert.rejects(olt.rebootOnu(data,device,'HWTCAABBCCDD',{serialNumber:'HWTCAABBCCDD',confirmReboot:false},transport));
 await assert.rejects(olt.rebootOnu(data,device,'HWTCAABBCCDD',{serialNumber:'HWTCAABBCCDD',confirmReboot:true},{...transport,serial:async()=> 'FHTTAABBCCDD'}),/Serial ONU/);assert.equal(writes,0);
 await olt.rebootOnu(data,device,'HWTCAABBCCDD',{serialNumber:'HWTCAABBCCDD',confirmReboot:true},transport);assert.equal(writes,1);assert.equal(JSON.stringify(data),before);const snapshot=await olt.snapshotFor(device);assert.deepEqual(snapshot.summary,summary);assert(snapshot.pendingRefresh);
});
test('description renaming updates only verified snapshot name and search, not member or finance',async t=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.46',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'x'});data.oltDevices=[device];
 t.mock.method(require('../src/olt-cli'),'readCauses',async()=> 'Offline : 0');await olt.poll(data,device,async(target,name)=>tables()[name]||[]);
 const before=structuredClone(data),snapshot=await olt.snapshotFor(device);let writes=0;const payload={serialNumber:'HWTCAABBCCDD',description:'Client Changed',previousDescription:'Client A'},transport={serial:async()=>payload.serialNumber,rename:async(_,__,target)=>{if(target.previousDescription!=='Client A')throw new Error('Description ONU berubah');writes++;return{descriptionConfirmed:true};}};
 await assert.rejects(olt.renameOnu(data,device,payload.serialNumber,{...payload,previousDescription:'Old'},transport),/berubah/);assert.equal(writes,0);
 await assert.rejects(olt.renameOnu(data,device,payload.serialNumber,payload,{...transport,serial:async()=> 'FHTTAABBCCDD'}),/Serial/);assert.equal(writes,0);
 await assert.rejects(olt.renameOnu(data,device,payload.serialNumber,payload,{...transport,rename:async()=>({descriptionConfirmed:false})}),/belum terverifikasi/);assert.equal((await olt.snapshotFor(device)).onus[0].name,'Client A');
 assert((await olt.renameOnu(data,device,payload.serialNumber,payload,transport)).confirmed);assert.equal(writes,1);assert.deepEqual(data,before);assert.deepEqual((await olt.snapshotFor(device)).summary,snapshot.summary);
 assert.equal((await olt.onuPage(data,[device],{search:'Client Changed'})).total,1);assert.equal((await olt.onuPage(data,[device],{search:'Client A'})).total,0);
});
test('description edits accept legacy SNMP address prefixes without bypassing the previous-name guard',async t=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Legacy Unit',host:'192.0.2.68',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'x'});data.oltDevices=[device];
 t.mock.method(require('../src/olt-cli'),'readCauses',async()=> 'Offline : 0');await olt.poll(data,device,async(target,name)=>tables()[name]||[]);
 const snapshot=await olt.snapshotFor(device),onu=snapshot.onus[0];onu.name='gpon 0/0/1 onu 1 Client A';
 const before=structuredClone(data);let writes=0;
 const transport={serial:async()=>onu.serialNumber,rename:async(_,__,target)=>{if(target.previousDescription!=='Client A')throw new Error('Description ONU berubah');writes++;return {descriptionConfirmed:true};}};
 await assert.rejects(olt.renameOnu(data,device,onu.serialNumber,{serialNumber:onu.serialNumber,previousDescription:'gpon 0/0/1 onu 1 Wrong name',description:'New Client'},transport),/berubah/);assert.equal(writes,0);
 await olt.renameOnu(data,device,onu.serialNumber,{serialNumber:onu.serialNumber,previousDescription:'Client A',description:'New Client'},transport);assert.equal(writes,1);assert.deepEqual(data,before);
 onu.name='gpon 0/0/1 onu 1';
 const blankTransport={serial:async()=>onu.serialNumber,rename:async(_,__,target)=>{assert.equal(target.previousDescription,'');return {descriptionConfirmed:true};}};
 // Re-seed the cached legacy blank row rather than change any member record.
 (await olt.snapshotFor(device)).onus[0].name=onu.name;
 await olt.renameOnu(data,device,onu.serialNumber,{serialNumber:onu.serialNumber,previousDescription:'',description:'Named Client'},blankTransport);assert.deepEqual(data,before);
});
test('native description reads are lazy, return no CLI details, and preserve the existing snapshot and business data',async t=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Inspect Unit',host:'192.0.2.69',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'x'});data.oltDevices=[device];
 t.mock.method(require('../src/olt-cli'),'readCauses',async()=> 'Offline : 0');await olt.poll(data,device,async(target,name)=>tables()[name]||[]);
 const snapshot=await olt.snapshotFor(device);snapshot.onus[0].name='gpon 0/0/1 onu 1 Short Name';const before=JSON.stringify({data,snapshot});let reads=0;
 const transport={inspect:async(_,__,target)=>{reads++;assert.equal(target.serialNumber,'HWTCAABBCCDD');return {outputs:[{stdout:'SN : HWTCAABBCCDD\r\nDescription : Native full description\r\nPRIVATE config'}]};}};
 const result=await olt.readOnuDescription(data,device,'HWTCAABBCCDD',{},transport);assert.deepEqual(result,{serialNumber:'HWTCAABBCCDD',onuIndex:'4718593',description:'Native full description'});assert.equal(reads,1);assert.equal(JSON.stringify({data,snapshot}),before);
 await assert.rejects(olt.readOnuDescription(data,device,'HWTC11223344',{},transport),/tidak ada/);assert.equal(reads,1);
 await assert.rejects(olt.readOnuDescription(data,device,'HWTCAABBCCDD',{},{inspect:async()=>({outputs:[{stdout:'SN : HWTCAABBCCDD\n'}]})}),/belum terbaca/);
 assert.equal((await olt.readOnuDescription(data,device,'HWTCAABBCCDD',{},{inspect:async()=>({outputs:[{stdout:'Description : \r\nLast down cause : LOS'}]})})).description,'');
});
test('duplicate SN across PONs requires an exact row and deletion keeps the online ONU on another PON',async t=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Duplicate Unit',host:'192.0.2.70',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'x'});data.oltDevices=[device];
 t.mock.method(require('../src/olt-cli'),'readCauses',async()=> 'Offline : 0');await olt.poll(data,device,async(target,name)=>tables()[name]||[]);
 const snapshot=await olt.snapshotFor(device),original=snapshot.onus[0],id=String(0x481017),duplicate={...original,...olt.position(id),id,status:'offline',condition:'other'};snapshot.onus.push(duplicate);
 const before=JSON.stringify(data),payload={serialNumber:original.serialNumber,confirmDelete:true};let reads=0,writes=0;
 const transport={serial:async(_,__,target)=>{reads++;assert.equal(target.id,id);return target.serialNumber;},delete:async(_,__,target)=>{writes++;assert.equal(target.id,id);return {deleteConfirmed:true};}};
 await assert.rejects(olt.removeOnu(data,device,original.serialNumber,payload,transport),/beberapa PON/);assert.equal(reads,0);assert.equal(writes,0);
 for(const onuIndex of ['invalid','1','999999999'])await assert.rejects(olt.removeOnu(data,device,original.serialNumber,{...payload,onuIndex},transport));assert.equal(reads,0);
 const result=await olt.removeOnu(data,device,original.serialNumber,{...payload,onuIndex:id},transport);assert(result.confirmed);assert.equal(result.onuIndex,id);assert.equal(result.ponKey,'0/0/2');assert.equal(writes,1);
 const remaining=(await olt.snapshotFor(device)).onus.filter(row=>row.serialNumber===original.serialNumber);assert.equal(remaining.length,1);assert.equal(remaining[0].id,original.id);assert.equal(remaining[0].status,'online');assert.equal(JSON.stringify(data),before);
});
test('duplicate SN selection also applies to reboot, native description reads and description edits',async t=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Duplicate Actions',host:'192.0.2.71',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'x'});data.oltDevices=[device];
 t.mock.method(require('../src/olt-cli'),'readCauses',async()=> 'Offline : 0');await olt.poll(data,device,async(target,name)=>tables()[name]||[]);
 const snapshot=await olt.snapshotFor(device),onu=snapshot.onus[0],id=String(0x481017);snapshot.onus.push({...onu,...olt.position(id),id,name:'Other PON'});
 const serial=async(_,__,target)=>{assert.equal(target.id,id);return onu.serialNumber;};
 await assert.rejects(olt.rebootOnu(data,device,onu.serialNumber,{serialNumber:onu.serialNumber,confirmReboot:true},{serial,reboot:async()=>assert.fail('Ambiguous reboot')}),/beberapa PON/);
 await olt.rebootOnu(data,device,onu.serialNumber,{serialNumber:onu.serialNumber,onuIndex:id,confirmReboot:true},{serial,reboot:async(_,__,target)=>assert.equal(target.id,id)});
 await assert.rejects(olt.readOnuDescription(data,device,onu.serialNumber,{}, {inspect:async()=>assert.fail('Ambiguous description')}),/beberapa PON/);
 const read=await olt.readOnuDescription(data,device,onu.serialNumber,{onuIndex:id},{inspect:async(_,__,target)=>{assert.equal(target.id,id);return {outputs:[{stdout:'Description : Other PON\r\n'}]};}});assert.equal(read.onuIndex,id);
 await olt.renameOnu(data,device,onu.serialNumber,{serialNumber:onu.serialNumber,onuIndex:id,previousDescription:'Other PON',description:'New name'},{serial,rename:async(_,__,target)=>{assert.equal(target.id,id);assert.equal(target.previousDescription,'Other PON');return {descriptionConfirmed:true};}});
 assert.equal((await olt.snapshotFor(device)).onus.find(row=>row.id===onu.id).name,'Client A');
});
test('missing live SNMP serial is cleared only after explicit native absence, never a transport failure',async t=>{
 const data=createDefaultStore(),device=olt.validateDevice(data,{name:'Stale Unit',host:'192.0.2.72',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'x'});data.oltDevices=[device];
 t.mock.method(require('../src/olt-cli'),'readCauses',async()=> 'Offline : 0');await olt.poll(data,device,async(target,name)=>tables()[name]||[]);
 const snapshot=await olt.snapshotFor(device),onu=snapshot.onus[0],payload={serialNumber:onu.serialNumber,onuIndex:onu.id,confirmDelete:true},transport={serial:async()=>'',delete:async()=>assert.fail('Must not send delete without live SNMP identity')};
 await assert.rejects(olt.removeOnu(data,device,onu.serialNumber,payload,{...transport,inspect:async()=>{throw new Error('CLI timeout');}}),/CLI timeout/);assert.equal((await olt.snapshotFor(device)).onus.length,2);
 const result=await olt.removeOnu(data,device,onu.serialNumber,payload,{...transport,inspect:async()=>{const error=new Error('Already absent');error.code='ONU_NOT_FOUND';throw error;}});assert(result.confirmed);assert(result.alreadyAbsent);assert.equal((await olt.snapshotFor(device)).onus.length,1);
});
