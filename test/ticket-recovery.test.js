'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),recovery=require('../src/ticket-recovery'),olt=require('../src/olt-monitor');
const NOW=Date.now(),serial=i=>'HWTC'+i.toString(16).padStart(8,'0').toUpperCase();
function rows(count=20){return Array.from({length:count},(_,i)=>({id:String(i),serialNumber:serial(i),ponKey:'0/0/1',status:'online',condition:'online',causeKnown:true,rxPower:null}));}
function topology(list,odp='odp'){return list.map(row=>({serialNumber:row.serialNumber,pon:row.ponKey,odp}));}
const ticket={id:'group',source:'olt-los',oltId:'olt',scope:'odp',fiberPointId:'odp',pon:'0/0/1',assignedTo:'lead'};
test('actual ODP membership supports arbitrary splitter counts and ninety percent without optical requirements',()=>{
 for(const count of[3,10,17,30]){const list=rows(count),required=Math.ceil(count*.9);for(const row of list.slice(required))Object.assign(row,{status:'offline',condition:'los'});const result=recovery.measure(ticket,list,topology(list));assert.equal(result.total,count);assert.equal(result.required,required);assert(result.ready);assert.equal(result.remainingLos,count-required);}
 const list=rows(30);list.slice(26).forEach(row=>Object.assign(row,{status:'offline',condition:'los'}));assert.equal(recovery.measure(ticket,list,topology(list)).ready,false);
});
test('power-off can be excluded only with a proven cause; all-off, missing and unknown do not imply repair',()=>{
 const list=rows(10);list[9]={...list[9],status:'offline',condition:'dying-gasp',causeKnown:true};let result=recovery.measure(ticket,list,topology(list));assert(result.ready);assert.equal(result.eligible,9);assert.equal(result.poweredOff,1);
 const off=list.map(row=>({...row,status:'offline',condition:'dying-gasp',causeKnown:true}));assert.equal(recovery.measure(ticket,off,topology(list)).ready,false);
 for(const row of list.slice(8))Object.assign(row,{status:'unknown',condition:'other',causeKnown:false});assert.equal(recovery.measure(ticket,list,topology(list)).ready,false);
 const snapshot=rows(10),baseline={...ticket,recoveryTargets:topology(snapshot)};assert.equal(recovery.measure(baseline,snapshot.slice(0,8),topology(snapshot.slice(0,8))).ready,false);
 const duplicates=[...snapshot.slice(0,8),snapshot[0],snapshot[1]];assert.equal(recovery.measure(baseline,duplicates,topology(snapshot)).ready,false);
});
test('ODC/PON requires each mapped ODP to recover, not an aggregate that hides a failed branch',()=>{
 const list=rows(20),targets=topology(list).map((row,i)=>({...row,odp:i<10?'a':'b'})),pon={...ticket,scope:'pon',fiberPointId:''};
 for(const row of list.slice(18))Object.assign(row,{status:'offline',condition:'los'});let result=recovery.measure(pon,list,targets);assert.equal(result.online,18);assert.equal(result.ready,false);assert.equal(result.groups.find(row=>row.id==='b').ready,false);
 Object.assign(list[18],{status:'online',condition:'online'});Object.assign(list[9],{status:'offline',condition:'los'});result=recovery.measure(pon,list,targets);assert(result.ready);assert.equal(result.groups.length,2);
});
test('moving the same serial to another ONU address cannot count as recovery of the original incident',()=>{
 const list=rows(3),targets=topology(list).map((row,i)=>({...row,id:list[i].id})),incident={...ticket,recoveryTargets:targets};
 const moved=list.map(row=>({...row,id:'moved-'+row.id}));const result=recovery.measure(incident,moved,topology(moved));assert.equal(result.online,0);assert.equal(result.unknown,3);assert.equal(result.ready,false);
 assert.equal(recovery.measure(incident,list,targets).ready,true);
});
test('moving ownership or ODP while preserving the serial and native address cannot complete the former customer incident',()=>{
 const list=rows(3),targets=topology(list).map((row,i)=>({...row,id:list[i].id,customerId:'owner-'+i})),incident={...ticket,recoveryTargets:targets};
 for(const change of[row=>({...row,customerId:'new-owner'}),row=>({...row,odp:'other-odp'})]){const result=recovery.measure(incident,list,targets.map(change));assert.equal(result.ready,false);assert.equal(result.online,0);assert.equal(result.unknown,3);}
});
test('manual close of automatic grouped faults uses fresh cached data, authorization remains external and no polling is triggered',async()=>{
 const list=rows(10),device={id:'olt',enabled:true,links:Object.fromEntries(list.map(row=>[row.serialNumber,{fiberPointId:'odp'}]))},data={settings:{},customers:[],radiusUsers:[],fiberPoints:[{id:'odp'}],oltDevices:[device]},snapshot={status:'online',checkedAt:new Date(NOW).toISOString(),onus:list};let reads=0;const options={now:NOW,snapshot:async()=>{reads++;return snapshot;}};
 assert((await recovery.validateResolution(data,ticket,{status:'resolved'},options)).ready);assert.equal(reads,1);
  await assert.rejects(recovery.validateResolution(data,ticket,{status:'resolved',pon:'0/0/2'},options),error=>error.status===409);assert.equal(reads,1);
 list.slice(8).forEach(row=>Object.assign(row,{status:'offline',condition:'los'}));await assert.rejects(recovery.validateResolution(data,ticket,{status:'resolved'},options),error=>error.status===409);
 snapshot.stale=true;await assert.rejects(recovery.validateResolution(data,ticket,{status:'resolved'},options),error=>error.status===409);
 assert.equal(await recovery.validateResolution(data,{...ticket,scope:'service'},{status:'resolved'},options),null);assert.equal(reads,3);
});
test('remaining individual LOS becomes its own ticket after a group meets the recovery target',()=>{
 const list=rows(10),device={id:'olt',enabled:true,updatedAt:'unit',links:Object.fromEntries(list.map(row=>[row.serialNumber,{fiberPointId:'odp'}]))},data={settings:{},users:[],customers:[],radiusUsers:[],fiberPoints:[{id:'odp'}],oltDevices:[device],oltTickets:[]};
 list.forEach(row=>Object.assign(row,{status:'offline',condition:'los',causeKnown:true,downCause:'LOS'}));const observation=offset=>({deviceId:'olt',deviceUpdatedAt:'unit',snapshot:{status:'online',checkedAt:new Date(NOW+offset).toISOString(),onus:structuredClone(list),ports:[]}});
 require('./helpers/confirmed-los')(data,[observation(0)]);
 let result=olt.applyLosTicketPlan(data,olt.losTicketPlan(data,[observation(0)],{now:NOW}),NOW);assert.equal(result.created.length,1);
 list.slice(0,9).forEach(row=>Object.assign(row,{status:'online',condition:'online',downCause:''}));result=olt.applyLosTicketPlan(data,olt.losTicketPlan(data,[observation(1000)],{now:NOW+1000}),NOW+1000);assert.equal(result.resolved.length,0);assert.equal(data.oltTickets[0].affectedCount,1);assert(data.oltTickets[0].recovery.ready);assert.notEqual(data.oltTickets[0].status,'resolved');
 const waiting=olt.losTicketPlan(data,[observation(1500)],{now:NOW+1500});assert.equal(waiting.changes.length,0);
 const actor={id:'lead',role:'technician',name:'Lead',active:true};data.users=[actor];data.oltTickets[0]=olt.progressTicket(olt.claimTicket(data.oltTickets[0],actor,NOW+1600),{status:'resolved',note:'Perbaikan dikonfirmasi'},actor,NOW+1700);
 const parentId=data.oltTickets[0].id;result=olt.applyLosTicketPlan(data,olt.losTicketPlan(data,[observation(2000)],{now:NOW+2000}),NOW+2000);assert.equal(result.created.length,1);assert.equal(result.created[0].serialNumber,serial(9));assert.equal(result.created[0].scope,'onu');assert.equal(result.created[0].assignedTo,'lead');assert.equal(result.created[0].parentTicketId,parentId);
});
