'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const incidents=require('../src/ticket-incidents'),olt=require('../src/olt-monitor'),service=require('../src/service-tickets'),auto=require('../src/olt-auto-identity'),identity=require('../src/network-identity');
const prior=require('./helpers/confirmed-los');
const NOW=Date.now(),SN='HWTCAABB0001',OTHER='HWTCAABB0002';
function fixture(){
 const customer={id:'a',name:'Customer A',username:'a@example.test',nasId:'nas-a'},actor={id:'tech',role:'technician',active:true,lockedNasIds:['nas-a']};
 const data={settings:{},customers:[customer,{id:'b',name:'Customer A',username:'b@example.test',nasId:'nas-b'}],radiusUsers:[{id:'u-a',username:customer.username,customerId:'a',nasId:'nas-a'}],users:[actor],radiusNas:[],monitoringTargets:[{id:'nas-a'},{id:'nas-b'}],fiberPoints:[],oltDevices:[{id:'olt',name:'Unit',vendor:'cdata',nasId:'nas-a',enabled:true,updatedAt:'r1',links:{[SN]:{customerId:'a'}}}],oltTickets:[],waMessages:[]};
 const onu=(sn=SN,state='online')=>({id:sn===SN?'4718593':'4718594',serialNumber:sn,ponKey:'0/0/1',name:'Customer A',status:state==='online'?'online':'offline',condition:state,causeKnown:true,downCause:state==='los'?'LOS':state==='dying-gasp'?'PWRDOWN':''});
 const sample=(rows,at=NOW,extra={})=>[{deviceId:'olt',deviceUpdatedAt:'r1',snapshot:{status:'online',checkedAt:new Date(at).toISOString(),onus:rows,ports:[],...extra}}];
 const poll=(rows,at=NOW,confirmed=true,extra={})=>{const observations=sample(rows,at,extra);if(confirmed)prior(data,observations);const plan=olt.losTicketPlan(data,observations,{now:at});return{plan,...olt.applyLosTicketPlan(data,plan,at)};};
 return{data,customer,actor,onu,sample,poll};
}
async function fault(f,category='wifi-modem'){return service.createStaff(f.data,{category,customerId:f.customer.id,text:'Technical visit'},f.actor);}
test.beforeEach(()=>{auto.invalidate();identity.invalidate();});
test('different fault categories follow one customer service incident, preserving category, lead and private notes',async()=>{
 const f=fixture(),first=await fault(f);first.assignedTo=f.actor.id;first.status='working';first.description='PRIVATE';
 const result=await service.create(f.data,f.customer,{category:'internet-down',text:'LOS after replacing modem'},{now:NOW+1000,nasId:'nas-a'});
 assert.equal(result.created,false);assert.equal(result.ticket.id,first.id);assert.equal(result.ticket.category,'wifi-modem');assert.equal(result.ticket.description,'PRIVATE');assert.equal(result.ticket.assignedTo,f.actor.id);assert.equal(f.data.oltTickets.length,1);assert.equal(first.messages.at(-1).role,'customer');assert.equal(f.data.waMessages.length,0);
});
test('staff duplicates fail with the existing reference before mutation; exact request retry remains idempotent',async()=>{
 const f=fixture(),ticket=await fault(f),before=structuredClone(f.data);
 assert.equal((await fault(f)).id,ticket.id);
 await assert.rejects(service.createStaff(f.data,{category:'internet-down',customerId:'a',text:'Another complaint'},f.actor),error=>error.status===409&&error.message.includes(ticket.number));assert.deepEqual(f.data,before);
});
test('PSB, add-on, package, relocation, billing and other non-fault requests remain independent',async()=>{
 const f=fixture();await fault(f);
 for(const category of['new-installation','addon','package-change','relocation','customer-data','billing','other-request']){const request=await service.createStaff(f.data,{category,customerId:'a',text:'Separate request'},f.actor);assert.equal(request.kind,'request');assert.equal(request.category,category);}
 assert.equal(f.data.oltTickets.length,8);
});
test('a request alone never suppresses a real LOS ticket',async()=>{
 for(const category of['new-installation','addon','billing','relocation']){const f=fixture();await service.createStaff(f.data,{category,customerId:'a',text:'Request'},f.actor);assert.equal(f.poll([f.onu(SN,'los')]).created.length,1,category);}
});
test('same-name customers are separate and cross-NAS submissions are denied',async()=>{
 const f=fixture();await fault(f);
 assert.equal((await service.create(f.data,f.data.customers[1],{category:'wifi-modem',text:'Other customer'},{now:NOW+1,nasId:'nas-b'})).created,true);
 const before=structuredClone(f.data);await assert.rejects(service.createStaff(f.data,{category:'internet-down',customerId:'b',text:'Denied'},f.actor),error=>error.status===403);assert.deepEqual(f.data,before);
});
test('a confirmed LOS joins the existing service fault once, without notification, reassignment or automatic closure',async()=>{
 const f=fixture(),ticket=await fault(f);ticket.assignedTo=f.actor.id;ticket.status='working';
 const result=f.poll([f.onu(SN,'los')]);assert.equal(result.created.length,0);assert.equal(f.data.oltTickets.length,1);const joined=f.data.oltTickets[0];assert.equal(joined.incidentDevices[0].state,'los');assert.equal(joined.history.at(-1).kind,'network-incident');assert.equal(joined.status,'working');assert.equal(joined.assignedTo,f.actor.id);assert.equal(f.data.waMessages.length,0);
 const before=JSON.stringify(f.data.oltTickets);f.poll([f.onu(SN,'los')],NOW+1000);assert.equal(JSON.stringify(f.data.oltTickets),before);
 f.poll([f.onu()],NOW+2000);assert.equal(f.data.oltTickets[0].status,'working');assert.equal(f.data.oltTickets[0].incidentDevices[0].state,'online');
 assert(!JSON.stringify(service.publicTicket(f.data,f.data.oltTickets[0],true)).includes('serialNumber'));
});
test('the old modem remains covered by its exact incident snapshot after losing its current customer mapping and across restart',async()=>{
 const f=fixture(),ticket=await fault(f);f.poll([f.onu()]);assert.equal(f.data.oltTickets[0].incidentDevices.length,1);
 f.data.oltDevices[0].links={};identity.invalidate();Object.assign(f.data,JSON.parse(JSON.stringify(f.data)));
 const result=f.poll([f.onu(SN,'los')],NOW+1000);assert.equal(result.created.length,0);assert.equal(f.data.oltTickets[0].id,ticket.id);assert.equal(f.data.oltTickets[0].incidentDevices[0].state,'los');
});
test('wrong PON, ONU slot, changed NAS and a verified new customer cannot inherit old maintenance coverage',async()=>{
 for(const type of['pon','slot','nas','owner']){const f=fixture();await fault(f);f.poll([f.onu()]);f.data.oltDevices[0].links={};let row=f.onu(SN,'los');if(type==='pon')row.ponKey='0/0/2';if(type==='slot')row.id='4718595';if(type==='nas')f.data.oltDevices[0].nasId='nas-b';if(type==='owner'){f.data.customers[1].nasId='nas-a';f.data.oltDevices[0].links[SN]={customerId:'b'};}identity.invalidate();assert.equal(f.poll([row],NOW+1000).created.length,1,type);}
});
test('missing owner is never inferred from ONU description or text resembling the customer name',async()=>{
 const f=fixture();await fault(f);f.data.oltDevices[0].links={};assert.equal(f.poll([f.onu(SN,'los')]).created.length,1);
});
test('a covered customer cannot hide unrelated ONU losses or create a second PON workflow',async()=>{
 const f=fixture();await fault(f);const rows=[f.onu(SN,'los'),f.onu(OTHER,'los'),{...f.onu('HWTCAABB0003','los'),id:'4718595'}];
 const result=f.poll(rows);assert.equal(result.created.length,2);assert(result.created.every(row=>row.scope==='onu'&&row.serialNumber!==SN));assert.equal(f.data.oltTickets.filter(row=>row.id===f.data.oltTickets[0].id).length,1);
});
test('unconfirmed, stale or power-off samples cannot produce false LOS history',async()=>{
 for(const state of['los','dying-gasp']){const f=fixture();await fault(f);f.poll([f.onu(SN,state)],NOW,false);assert(!f.data.oltTickets[0].incidentDevices);}
 const f=fixture();await fault(f);f.poll([f.onu()],NOW,false,{stale:true});assert(!f.data.oltTickets[0].incidentDevices);
});
test('after the service workflow is resolved a genuinely new LOS can open a new ticket',async()=>{
 const f=fixture();await fault(f);f.poll([f.onu()]);f.data.oltTickets[0].status='resolved';assert.equal(f.poll([f.onu(SN,'los')],NOW+1000).created.length,1);
});
test('closing a replacement ticket does not announce the same removed modem LOS again; observed recovery resets that protection',async()=>{
 const f=fixture();await fault(f);f.poll([f.onu()]);f.poll([f.onu(SN,'los')],NOW+1000);f.data.oltTickets[0].status='resolved';
 assert.equal(f.poll([f.onu(SN,'los')],NOW+2000).created.length,0);assert.equal(f.data.oltTickets.length,1);
 f.poll([f.onu()],NOW+3000);assert.equal(f.data.oltTickets[0].incidentDevices[0].state,'online');assert.equal(f.poll([f.onu(SN,'los')],NOW+4000).created.length,1);
});
test('customer submissions cannot duplicate an existing individual OLT fault or expose its internal data',async()=>{
 const f=fixture();f.poll([f.onu(SN,'los')]);const before=structuredClone(f.data);
 await assert.rejects(service.create(f.data,f.customer,{category:'wifi-modem',text:'Again'},{now:NOW+1,nasId:'nas-a'}),error=>error.status===409&&error.message.includes(f.data.oltTickets[0].number));assert.deepEqual(f.data,before);
});
test('two verified modem losses for one customer in a single poll create one workflow only',()=>{
 const f=fixture();f.data.oltDevices[0].links[OTHER]={customerId:'a'};assert.equal(f.poll([f.onu(SN,'los'),f.onu(OTHER,'los')]).created.length,1);
 f.poll([f.onu(SN,'los'),f.onu(OTHER,'los')],NOW+1000);assert.equal(f.data.oltTickets.length,1);
});
test('manual ONU fault creation also refuses a second customer incident',async()=>{
 const f=fixture();await fault(f);assert.throws(()=>olt.saveTicket(f.data,{oltId:'olt',serialNumber:SN,title:'Manual duplicate'},{id:'admin',role:'admin'}),error=>error.status===409);
});
test('an automatic workflow with a second affected modem waits for both recoveries without duplicating tickets',()=>{
 const f=fixture();f.data.oltDevices[0].links[OTHER]={customerId:'a'};f.poll([f.onu(SN,'los')]);
 f.poll([f.onu(SN,'los'),f.onu(OTHER,'los')],NOW+1000);assert.equal(f.data.oltTickets.length,1);assert.equal(f.data.oltTickets[0].incidentDevices[0].state,'los');
 f.poll([f.onu(),f.onu(OTHER,'los')],NOW+2000);assert.notEqual(f.data.oltTickets[0].status,'resolved');
 f.poll([f.onu(),f.onu(OTHER)],NOW+3000);assert.equal(f.data.oltTickets[0].status,'resolved');assert.equal(f.data.oltTickets.length,1);
});
test('incident device snapshots are bounded, hide credentials and do not change customer-facing progress',async()=>{
 const f=fixture(),ticket=await fault(f);ticket.status='working';ticket.history=[{kind:'progress',status:'working',publicStage:'on-way',at:new Date(NOW-100).toISOString()}];const before=service.publicProgress(ticket);
 for(let i=0;i<12;i++){const sn='HWTC'+i.toString(16).padStart(8,'0').toUpperCase();f.data.oltDevices[0].links[sn]={customerId:'a'};f.poll([{...f.onu(sn,'los'),id:String(100+i)}],NOW+i);}
 const updated=f.data.oltTickets.find(row=>row.id===ticket.id);assert.equal(updated.incidentDevices.length,incidents.MAX_DEVICES);assert.deepEqual(service.publicProgress(updated),before);assert(!JSON.stringify(updated.incidentDevices).includes('password'));
});
test('cached current identity is captured before a replacement, without another ACS request or OLT poll',async()=>{
 const f=fixture();f.data.settings={networkIntegrationEnabled:true,genieAcs:{enabled:true,baseUrl:'http://192.0.2.90:7557'}};let reads=0;
 const row={id:'acs-a',serialNumber:SN,username:f.customer.username,lastInform:new Date(NOW).toISOString(),registered:new Date(NOW-86400000).toISOString()};
 await auto.refresh(f.data,[{device:f.data.oltDevices[0],snapshot:f.sample([f.onu()])[0].snapshot}],{now:NOW,allowDemo:true,fetch:async()=>{reads++;return[row];}});
 const ticket=await fault(f);assert.equal(reads,1);assert.equal(ticket.incidentDevices[0].serialNumber,SN);f.data.oltDevices[0].links={};auto.invalidate();assert.equal(f.poll([f.onu(SN,'los')],NOW+1000).created.length,0);assert.equal(reads,1);
});
