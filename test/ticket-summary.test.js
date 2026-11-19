'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const network=require('../src/ticket-network'),page=require('../src/olt-ticketing').ticketPage;
const now=Date.now(),stamp=new Date(now).toISOString(),serial=i=>'HWTC'+i.toString(16).padStart(8,'0').toUpperCase();
function fixture(count=26){
 const customers=Array.from({length:count},(_,i)=>({id:'c'+i,name:'Pelanggan '+String(i).padStart(2,'0'),code:'100'+i,nasId:'n1',fiberPointId:'odp1'}));
 const onus=customers.map((c,i)=>({id:String(i+1),serialNumber:serial(i),ponKey:'1/1',status:i===0?'offline':'online',condition:i===0?'los':'online',causeKnown:true}));
 const device={id:'o1',name:'OLT Uji',enabled:true,nasId:'n1',links:Object.fromEntries(onus.map((r,i)=>[r.serialNumber,{customerId:customers[i].id,fiberPointId:'odp1'}]))};
 const data={settings:{},updatedAt:stamp,customers,radiusUsers:customers.map(c=>({id:'r'+c.id,customerId:c.id,nasId:'n1',username:'akun'+c.id})),radiusNas:[{id:'n1'},{id:'n2'}],monitoringTargets:[],fiberPoints:[{id:'odp1'}],oltDevices:[device],oltTickets:[]};
 const ticket={id:'t1',source:'olt-los',scope:'odp',oltId:'o1',nasId:'n1',pon:'1/1',fiberPointId:'odp1',status:'new',updatedAt:stamp,affectedSerialNumbers:onus.map(r=>r.serialNumber),recoveryTargets:onus.map((r,i)=>({serialNumber:r.serialNumber,id:r.id,pon:r.ponKey,odp:'odp1',customerId:customers[i].id}))};
 let reads=0;const options={now,snapshot:async()=>{reads++;return{status:'online',checkedAt:stamp,onus};},lookup:async()=>{throw Error('Must not query ACS for a group');}};
 return{data,ticket,onus,device,options,reads:()=>reads};
}
test('all non-fault requests skip modem data even with a mapped customer and stale technical fields',async()=>{
 const {data}=fixture();for(const category of['billing','payment','new-installation','upgrade-package','addon-request','relocation','other-request']){
  const ticket={id:category,kind:'request',scope:'service',source:'staff-service',category,customerId:'c0',customerName:'Pelanggan',username:'SECRET_ACCOUNT',serialNumber:serial(0),oltId:'o1',acsOptical:{rxPower:-20},incidentDevices:[{secret:true}]};
  let calls=0;assert.deepEqual(await network.context(data,ticket,data.oltDevices,{snapshot:async()=>{calls++;},lookup:async()=>{calls++;}}),{kind:'none'});assert.equal(calls,0);
  const safe=network.presentation(ticket);assert.equal(safe.customerId,'c0');assert.equal(safe.customerName,'Pelanggan');assert.equal(safe.contextKind,'none');assert(!JSON.stringify(safe).includes('SECRET_ACCOUNT'));for(const key of['serialNumber','oltId','acsOptical','incidentDevices'])assert(!Object.hasOwn(safe,key));assert.equal(ticket.username,'SECRET_ACCOUNT');
 }
});
test('individual faults retain their context but unknown legacy service categories do not acquire modem details',()=>{
 assert.equal(network.contextKind({scope:'onu',oltId:'o1',serialNumber:serial(0)}),'device');
 for(const category of['internet-down','internet-slow','wifi-modem','addon-fault','other-fault'])assert.equal(network.contextKind({scope:'service',source:'wifiku',category,kind:'fault'}),'device');
 assert.equal(network.contextKind({scope:'service',kind:'fault',category:'unrecognized'}),'none');
});
test('ODP/ODC/PON summaries are bounded affected-customer lists, not a single device or entire inventory',async()=>{
 for(const scope of['odp','odc','pon']){const f=fixture();f.ticket.scope=scope;f.ticket.affectedSerialNumbers=f.ticket.affectedSerialNumbers.slice(0,12);const before=structuredClone(f.data);
  const result=await network.context(f.data,f.ticket,f.data.oltDevices,f.options);assert.equal(result.kind,'affected');assert.equal(result.affected.total,12);assert.equal(result.affected.rows.length,10);assert.equal(result.affected.pages,2);assert.equal(f.reads(),1);assert.equal(result.affected.rows[0].state,'los');
  const second=await network.context(f.data,f.ticket,f.data.oltDevices,{...f.options,page:2});assert.equal(second.affected.rows.length,2);
  const search=await network.context(f.data,f.ticket,f.data.oltDevices,{...f.options,search:'10011'});assert.equal(search.affected.total,1);assert.equal(search.affected.rows[0].id,'c11');
  for(const marker of['HWTC','akun','serialNumber','rxPower','residualSerialNumbers','password'])assert(!JSON.stringify(result).includes(marker));assert.deepEqual(f.data,before);
 }
});
test('duplicate customer connections are deduplicated and retain the worst verified state',async()=>{
 const f=fixture(2);f.device.links[serial(1)].customerId='c0';f.ticket.recoveryTargets[1].customerId='c0';const r=await network.context(f.data,f.ticket,f.data.oltDevices,f.options);assert.equal(r.affected.connections,2);assert.equal(r.affected.total,1);assert.equal(r.affected.rows[0].state,'los');
});
test('stale or missing observations retain captured customers only as unknown, with no invented recovery',async()=>{
 for(const mode of['stale','missing','incomplete']){const f=fixture(1);f.options.snapshot=async()=>({status:'online',checkedAt:stamp,...(mode==='incomplete'?{}:{onus:mode==='missing'?[]:f.onus}),stale:mode==='stale'});const r=await network.context(f.data,f.ticket,f.data.oltDevices,f.options);assert.equal(r.affected.rows[0].id,'c0');assert.equal(r.affected.rows[0].state,'unknown');if(mode!=='missing'){assert.equal(r.affected.available,false);assert.equal(r.recovery.available,false);}}
});
test('foreign NAS, duplicate serials, changed owners and changed positions cannot be attributed to an old incident',async()=>{
 for(const mode of['nas','duplicate','owner','pon','index','odp','target-conflict']){const f=fixture(2);f.ticket.affectedSerialNumbers=[serial(0)];
  if(mode==='nas'){f.data.customers[0].nasId='n2';f.data.radiusUsers[0].nasId='n2';}
  if(mode==='duplicate')f.onus.push({...f.onus[0]});
  if(mode==='owner')f.device.links[serial(0)].customerId='c1';
  if(mode==='pon')f.onus[0].ponKey='1/2';
  if(mode==='index')f.onus[0].id='99';
  if(mode==='odp')f.device.links[serial(0)].fiberPointId='other';
  if(mode==='target-conflict')f.ticket.recoveryTargets.push({...f.ticket.recoveryTargets[0],customerId:'c1'});
  const r=await network.context(f.data,f.ticket,f.data.oltDevices,f.options);assert.equal(r.affected.rows.length,0,mode);assert.equal(r.affected.unmappedConnections,1,mode);
 }
});
test('unmapped and unauthorized group context never guesses ownership from descriptions',async()=>{
 const f=fixture(1);f.device.links={};f.ticket.recoveryTargets[0].customerId='';f.onus[0].name=f.data.customers[0].name;
 const r=await network.context(f.data,f.ticket,f.data.oltDevices,f.options);assert.equal(r.affected.rows.length,0);assert.equal(r.affected.unmappedConnections,1);
 const hidden=await network.context(f.data,{...f.ticket,id:'hidden'},[],f.options);assert.equal(hidden.affected.rows.length,0);assert.equal(hidden.affected.available,false);
});
test('group ticket presentation removes singular customer/device fields and notification internals without mutation',()=>{
 const f=fixture(1);Object.assign(f.ticket,{customerId:'c0',customerName:'WRONG_SINGLE',username:'SECRET_ACCOUNT',locationUrl:'SECRET_LOCATION',coordinates:{latitude:1},oltOptical:{rxPower:-20},acsOptical:{rxPower:-21},opticalSummary:{minimum:-20},incidentDevices:[{private:true}],waNotifications:{private:true}});const before=structuredClone(f.ticket),safe=network.presentation(f.ticket);
 assert.equal(safe.contextKind,'affected');for(const key of['customerId','customerName','username','locationUrl','coordinates','oltOptical','acsOptical','opticalSummary','incidentDevices','recoveryTargets','waNotifications'])assert(!Object.hasOwn(safe,key),key);assert.deepEqual(f.ticket,before);
 f.data.oltTickets=[f.ticket];const listing=page(f.data,{role:'admin',id:'admin'});assert.equal(listing.tickets[0].contextKind,'affected');assert(!listing.tickets[0].customerName);
});
test('browser and backend classify requests/faults/groups consistently and canonical/legacy pages load shared renderer first',()=>{
 const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/ticket-context.js'),'utf8'),sandbox);
 for(const t of[{kind:'request',scope:'service',source:'staff-service',category:'payment'}, {kind:'fault',scope:'service',source:'wifiku',category:'internet-down'}, {scope:'odp'}, {scope:'onu',serialNumber:serial(0)}, {scope:'service',kind:'fault',category:'unknown'}])assert.equal(sandbox.window.FakenetTicketContext.kind(t),network.contextKind(t));
 for(const file of['tkt.html','olt-ticket.html']){const html=fs.readFileSync(path.join(__dirname,'../public',file),'utf8');assert(html.indexOf('src="/ticket-context.js')<html.indexOf('src="/tkt.js'));assert(html.includes('/ticket-context.css'));}
 const installer=fs.readFileSync(path.join(__dirname,'../install.sh'),'utf8');assert(installer.includes('public/ticket-context.js'));assert(installer.includes('public/ticket-context.css'));
});
