'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const olt=require('../src/olt-monitor'),{createDefaultStore}=require('../src/store');
const NOW=Date.now();
function onu(serialNumber='HWTCAABB0001',condition='los') {
 return {id:'4718593',serialNumber,name:'Pelanggan Unit',ponKey:'0/0/1',status:condition==='online'?'online':'offline',condition,causeKnown:condition==='los'||condition==='dying-gasp',downCause:condition==='los'?'LOS':condition==='dying-gasp'?'dying-gasp':'',rxPower:null};
}
function fixture(){const data=createDefaultStore();data.oltDevices=[{id:'olt-a',name:'OLT A',enabled:true,updatedAt:'revision-a',links:{HWTCAABB0001:{customerId:'member-a',fiberPointId:'odp-a'}}}];data.customers=[{id:'member-a',name:'Member Unit'}];data.fiberPoints=[{id:'odp-a'}];return data;}
function observation(data,onus=[onu()],offset=0,extra={}){const device=data.oltDevices[0];return{deviceId:device.id,deviceUpdatedAt:device.updatedAt,snapshot:{status:'online',checkedAt:new Date(NOW+offset).toISOString(),onus,ports:[],...extra}};}
function apply(data,obs,offset=0,options={}){const plan=olt.losTicketPlan(data,Array.isArray(obs)?obs:[obs],{now:NOW+offset,...options});return{plan,result:olt.applyLosTicketPlan(data,plan,NOW+offset)};}
test('only explicit current LOS creates automatic unassigned tickets, leaving business and WA data untouched',()=>{
 const data=fixture(),before=JSON.stringify({...data,oltTickets:undefined});
 const obs=observation(data,[onu(),onu('HWTCAABB0002','dying-gasp'),onu('HWTCAABB0003','other'),onu('HWTCAABB0004','online')]);
 const {result}=apply(data,obs);assert.equal(result.created.length,1);const ticket=result.created[0];assert.equal(ticket.source,'olt-los');assert.equal(ticket.oltId,'olt-a');assert.equal(ticket.serialNumber,'HWTCAABB0001');assert.equal(ticket.pon,'0/0/1');assert.equal(ticket.assignedTo,'');assert.equal(ticket.status,'new');assert.equal(ticket.customerId,'member-a');assert.equal(ticket.fiberPointId,'odp-a');assert.equal(ticket.createdBy,'system-olt');assert.equal(ticket.losDetection.state,'los');assert.equal(data.waMessages.length,0);assert.equal(JSON.stringify({...data,oltTickets:undefined}),before);
});
test('repeated polls and serialized restart do not create duplicates or rewrite tickets',()=>{
 const data=fixture();apply(data,observation(data));const before=JSON.stringify(data.oltTickets);
 for(const offset of [1000,3000,180000]){const result=apply(data,observation(data,[onu()],offset),offset);assert.equal(result.plan.changes.length,0);assert.equal(result.result.changed,false);}
 const restarted=JSON.parse(JSON.stringify(data));assert.equal(apply(restarted,observation(restarted,[onu()],240000),240000).plan.changes.length,0);assert.equal(JSON.stringify(data.oltTickets),before);
});
test('closing a ticket while LOS remains does not open it again; new incident requires observed recovery',()=>{
 const data=fixture();apply(data,observation(data));const first=data.oltTickets[0];data.oltTickets[0]={...first,status:'resolved',resolvedAt:new Date(NOW+1000).toISOString()};
 assert.equal(apply(data,observation(data,[onu()],2000),2000).result.created.length,0);
 apply(data,observation(data,[onu('HWTCAABB0001','online')],3000),3000);assert.equal(data.oltTickets[0].status,'resolved');assert.equal(data.oltTickets[0].losDetection.state,'online');
 const next=apply(data,observation(data,[onu()],4000),4000);assert.equal(next.result.created.length,1);assert.notEqual(next.result.created[0].id,first.id);assert.equal(data.oltTickets.length,2);
});
test('confirmed recovery automatically closes the LOS ticket and preserves technician notes',()=>{
 const data=fixture();apply(data,observation(data));data.oltTickets[0]={...data.oltTickets[0],status:'working',assignedTo:'tech',description:'Checked fiber'};
 const recovered=apply(data,observation(data,[onu('HWTCAABB0001','online')],1000),1000);assert.equal(data.oltTickets[0].status,'resolved');assert.equal(data.oltTickets[0].assignedTo,'tech');assert.equal(data.oltTickets[0].description,'Checked fiber');assert(data.oltTickets[0].losDetection.recoveredAt);assert.equal(recovered.result.resolved.length,1);assert.equal(data.oltTickets[0].history.at(-1).kind,'recovered');assert.equal(data.oltTickets[0].autoResolved,true);
 const beforeId=data.oltTickets[0].id;const next=apply(data,observation(data,[onu()],2000),2000);assert.equal(next.result.created.length,1);assert.notEqual(next.result.created[0].id,beforeId);assert.equal(data.oltTickets.length,2);
});
test('manual active ONU ticket covers the same LOS without being converted or duplicated',()=>{
 const data=fixture(),manual=olt.saveTicket(data,{oltId:'olt-a',serialNumber:'HWTCAABB0001',pon:'0/0/2',title:'Existing manual fault',description:'Original note'},{id:'technician'});data.oltTickets=[manual];
 const result=apply(data,observation(data));assert.equal(result.result.created.length,0);assert.equal(data.oltTickets.length,1);assert.equal(data.oltTickets[0].source,undefined);assert.equal(data.oltTickets[0].title,'Existing manual fault');assert.equal(data.oltTickets[0].description,'Original note');assert.equal(data.oltTickets[0].losDetection.state,'los');
 data.oltTickets[0].status='resolved';assert.equal(apply(data,observation(data,[onu()],1000),1000).result.created.length,0);
});
test('bad, stale, incomplete, simulated, future or disabled observations cannot create tickets',()=>{
 for(const extra of [{status:'unreachable'},{stale:true},{pendingRefresh:true},{simulated:true},{checkedAt:'bad'},{checkedAt:new Date(NOW-olt.CACHE_MS*2-1).toISOString()},{checkedAt:new Date(NOW+31000).toISOString()}]){const data=fixture();assert.equal(apply(data,observation(data,[onu()],0,extra)).plan.changes.length,0);}
 const data=fixture(),obs=observation(data);data.oltDevices[0].updatedAt='new-config';assert.equal(apply(data,obs).plan.changes.length,0);data.oltDevices[0].enabled=false;assert.equal(apply(data,observation(data)).plan.changes.length,0);
 for(const patch of [{causeKnown:false},{downCause:'dying-gasp'},{status:'online'},{condition:'other'},{serialNumber:'bad'}])assert.equal(apply(fixture(),observation(fixture(),[{...onu(),...patch}])).plan.changes.length,0);
});
test('missing data and power loss cannot falsely mark LOS as recovered',()=>{
 const data=fixture();apply(data,observation(data));for(const rows of [[],[onu('HWTCAABB0001','dying-gasp')],[{...onu(),status:'unknown'}]])assert.equal(apply(data,observation(data,rows,1000),1000).plan.changes.length,0);assert.equal(data.oltTickets[0].losDetection.state,'los');
});
test('duplicate serial within one snapshot is ignored; same serial on different OLTs stays separate',()=>{
 const data=fixture();assert.equal(apply(data,observation(data,[onu(),onu()])).plan.changes.length,0);
 data.oltDevices.push({...data.oltDevices[0],id:'olt-b',name:'B'});const a=observation(data),b={...a,deviceId:'olt-b'};assert.equal(apply(data,[a,b]).result.created.length,2);
});
test('stale recovery observation cannot overwrite a newer LOS episode',()=>{
 const data=fixture();apply(data,observation(data,[onu()],2000),2000);assert.equal(apply(data,observation(data,[onu('HWTCAABB0001','online')],1000),3000).plan.changes.length,0);assert.equal(data.oltTickets[0].losDetection.state,'los');
});
test('creation batches are bounded and active ticket ceiling respected',()=>{
 const data=fixture(),rows=Array.from({length:300},(_,i)=>onu('HWTC'+i.toString(16).padStart(8,'0').toUpperCase(),i<120?'los':'online'));const obs=observation(data,rows);
 const first=apply(data,obs);assert.equal(first.result.created.length,50);assert.equal(first.plan.deferred,70);assert.equal(apply(data,obs).result.created.length,50);assert.equal(apply(data,obs).result.created.length,20);assert.equal(apply(data,obs).plan.changes.length,0);
 const capped=fixture();capped.oltTickets=Array.from({length:500},(_,i)=>({id:'manual-'+i,status:'new'}));assert.equal(apply(capped,observation(capped)).result.created.length,0);
});
test('automatic ticket identity cannot be edited; notes, assignee and workflow remain editable',()=>{
 const data=fixture();apply(data,observation(data));const ticket=data.oltTickets[0];for(const patch of [{oltId:'elsewhere'},{pon:'0/0/2'},{serialNumber:''},{serialNumber:'HWTCAABB0002'}])assert.throws(()=>olt.saveTicket(data,patch,{id:'tech'},ticket),/Identitas/);
 const edited=olt.saveTicket(data,{title:'Technician analysis',description:'Splice required',status:'working'},{id:'tech'},ticket);assert.equal(edited.source,'olt-los');assert.equal(edited.description,'Splice required');assert.equal(edited.status,'working');assert.deepEqual(edited.losDetection,ticket.losDetection);
});
test('only explicit isolated-demo fixtures may create simulated examples',()=>{
 const data=fixture();data.oltDevices[0].id='demo-olt-1';const obs=observation(data,[onu()],0,{simulated:true});assert.equal(apply(data,obs).plan.changes.length,0);const result=apply(data,obs,0,{allowSimulated:true});assert.equal(result.result.created.length,1);assert.equal(result.result.created[0].simulated,true);
});
function rowsFor(conditions){return conditions.map((condition,i)=>onu('HWTC'+(i+1).toString(16).padStart(8,'0').toUpperCase(),condition));}
test('PON incidents use the actual PON and loss ratio, never a fixed splitter capacity',()=>{
 const data=fixture(),rows=rowsFor(['los','los','los','online']);const result=apply(data,observation(data,rows));
 assert.equal(result.result.created.length,1);const ticket=result.result.created[0];assert.equal(ticket.scope,'pon');assert.equal(ticket.pon,'0/0/1');assert.equal(ticket.serialNumber,'');assert.equal(ticket.affectedCount,3);assert.equal(ticket.affectedSerialNumbers.length,3);
 const low=fixture();assert.equal(apply(low,observation(low,rowsFor(['los','los','los',...Array(7).fill('online')]))).result.created.length,3);assert(low.oltTickets.every(row=>row.scope==='onu'));
 const different=fixture(),mixed=rows.map((row,i)=>({...row,ponKey:'0/0/'+(i+1)}));assert.equal(apply(different,observation(different,mixed)).result.created.length,3);assert(different.oltTickets.every(row=>row.scope==='onu'));
 const power=fixture();apply(power,observation(power,rowsFor(['los','los','dying-gasp','dying-gasp'])));assert.equal(power.oltTickets.length,2);assert(power.oltTickets.every(row=>row.scope==='onu'));
 const down=fixture();apply(down,observation(down,rowsFor(['los','online']),0,{ports:[{kind:'pon',ponKey:'0/0/1',status:'offline'}]}));assert.equal(down.oltTickets[0].scope,'pon');
});
test('ODP grouping requires explicit mapping and separate ODPs on one PON stay separate',()=>{
 const data=fixture(),rows=rowsFor(['los','los','online',...Array(7).fill('online')]);data.oltDevices[0].links=Object.fromEntries(rows.slice(0,3).map(row=>[row.serialNumber,{fiberPointId:'odp-a'}]));
 const result=apply(data,observation(data,rows));assert.equal(result.result.created.length,1);assert.equal(result.result.created[0].scope,'odp');assert.equal(result.result.created[0].fiberPointId,'odp-a');assert.equal(result.result.created[0].affectedCount,2);
 const unmapped=fixture();unmapped.oltDevices[0].links={};apply(unmapped,observation(unmapped,rows));assert.equal(unmapped.oltTickets.length,2);assert(unmapped.oltTickets.every(row=>row.scope==='onu'));
 const multi=fixture(),many=rowsFor(['los','los','los','los',...Array(8).fill('online')]);multi.fiberPoints.push({id:'odp-b'});multi.oltDevices[0].links=Object.fromEntries(many.slice(0,4).map((row,i)=>[row.serialNumber,{fiberPointId:i<2?'odp-a':'odp-b'}]));apply(multi,observation(multi,many));assert.equal(multi.oltTickets.length,2);assert(multi.oltTickets.every(row=>row.scope==='odp'));assert.deepEqual(new Set(multi.oltTickets.map(row=>row.fiberPointId)),new Set(['odp-a','odp-b']));
});
test('grouped incidents persist through partial recovery and require all affected ONUs online',()=>{
 const data=fixture(),initial=rowsFor(['los','los','los','online']);apply(data,observation(data,initial));const id=data.oltTickets[0].id;
 const partial=rowsFor(['online','los','online','online']);apply(data,observation(data,partial,1000),1000);assert.equal(data.oltTickets.length,1);assert.equal(data.oltTickets[0].id,id);assert.equal(data.oltTickets[0].affectedCount,1);assert.equal(data.oltTickets[0].affectedSerialNumbers.length,3);
 const missing=rowsFor(['online','online','dying-gasp','online']);assert.equal(apply(data,observation(data,missing,2000),2000).plan.changes.length,0);assert.equal(data.oltTickets[0].losDetection.state,'los');
 apply(data,observation(data,rowsFor(Array(4).fill('online')),3000),3000);assert.equal(data.oltTickets[0].losDetection.state,'online');assert.equal(data.oltTickets[0].status,'resolved');assert.equal(data.oltTickets[0].affectedCount,0);
 const restarted=structuredClone(data);assert.equal(apply(restarted,observation(restarted,initial,4000),4000).result.created.length,1);assert.equal(restarted.oltTickets.length,2);
});
test('an existing individual workflow is not duplicated by a new PON group',()=>{
 const data=fixture();apply(data,observation(data,rowsFor(['los','online','online','online'])));const id=data.oltTickets[0].id;apply(data,observation(data,rowsFor(['los','los','los','online']),1000),1000);
 assert.equal(data.oltTickets.length,3);assert(data.oltTickets.every(row=>row.scope==='onu'));assert(data.oltTickets.some(row=>row.id===id));
});
test('claim is idempotent and prevents another technician from taking the same ticket',()=>{
 const ticket={id:'t1',status:'new',assignedTo:''},a={id:'a',name:'Teknisi A'},b={id:'b',name:'Teknisi B'};
 const claimed=olt.claimTicket(ticket,a,NOW);assert.equal(ticket.assignedTo,'');assert.equal(claimed.assignedTo,'a');assert.equal(claimed.status,'assigned');assert.equal(claimed.history[0].userName,'Teknisi A');assert.equal(olt.claimTicket(claimed,a,NOW+1),claimed);assert.throws(()=>olt.claimTicket(claimed,b),error=>error.status===409);assert.throws(()=>olt.claimTicket({...ticket,status:'resolved'},a),error=>error.status===409);
});
test('progress is owned, auditable, bounded, idempotent and requires notes',()=>{
 const actor={id:'a',name:'Teknisi A',role:'technician'},ticket=olt.claimTicket({id:'t1',status:'new',assignedTo:''},actor,NOW);
 assert.throws(()=>olt.progressTicket(ticket,{note:'Other technician'},{id:'b',role:'technician'}),error=>error.status===403);assert.throws(()=>olt.progressTicket(ticket,{note:''},actor),/wajib/);assert.throws(()=>olt.progressTicket(ticket,{note:'x'.repeat(1001)},actor),/valid/);assert.throws(()=>olt.progressTicket(ticket,{note:'Okay',status:'new'},actor),/Status/);
 let progress=olt.progressTicket(ticket,{note:'Penyambungan serat'},actor,NOW+1);assert.equal(progress.status,'working');assert.equal(olt.progressTicket(progress,{note:'Penyambungan serat'},actor,NOW+2),progress);
 for(let i=0;i<60;i++)progress=olt.progressTicket(progress,{note:'Progres '+i},actor,NOW+1000+i);assert.equal(progress.history.length,50);
 const done=olt.progressTicket(progress,{note:'Teruji online',status:'resolved'},actor,NOW+2000);assert.equal(done.status,'resolved');assert.equal(done.resolvedAt,new Date(NOW+2000).toISOString());assert.throws(()=>olt.progressTicket(done,{note:'Again'},actor),error=>error.status===409);
 assert.throws(()=>olt.requireTicketEditor({...ticket,assignedTo:'b'},{},{...actor}),error=>error.status===403);assert.throws(()=>olt.requireTicketEditor({id:'t',assignedTo:''},{status:'working'},actor),error=>error.status===409);assert.throws(()=>olt.requireTicketEditor({}, {assignedTo:'b'},actor),error=>error.status===403);
});
test('message templates resolve scope and progress but never enqueue WhatsApp',()=>{
 const data=fixture();apply(data,observation(data,rowsFor(['los','los','los','online'])));data.users=[{id:'tech',name:'Teknisi A',role:'technician'}];const actor=data.users[0];let ticket=olt.claimTicket(data.oltTickets[0],actor,NOW);ticket=olt.progressTicket(ticket,{note:'Mengecek sambungan'},actor,NOW+1000);
 const message=olt.renderTicketTemplate(data,ticket,'detected');assert(message.includes('GANGGUAN INTERNET'));assert(message.includes('Pelanggan:'));assert(message.includes('0/0/1'));assert(message.includes('3 ONU'));assert(!message.includes('[scope]'));assert(olt.renderTicketTemplate(data,ticket,'progress').includes('Mengecek sambungan'));assert(olt.renderTicketTemplate(data,ticket,'claimed').includes('Teknisi A'));assert.equal(data.waMessages.length,0);
 const templates=olt.validateTicketTemplates({detected:'Tiket [ticket_no] [scope]',ignored:'not stored'});assert.deepEqual(Object.keys(templates),['detected']);data.settings.oltTicketing={templates};assert(olt.renderTicketTemplate(data,ticket).startsWith('Tiket OLT-'));assert.throws(()=>olt.validateTicketTemplates({detected:''}),/kosong/);assert.throws(()=>olt.validateTicketTemplates({progress:'x'.repeat(2401)}),/valid/);assert.throws(()=>olt.renderTicketTemplate(data,ticket,'invalid'),/Jenis/);
});
