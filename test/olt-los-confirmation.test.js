'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const olt=require('../src/olt-monitor'),guard=require('../src/olt-los-confirmation'),planned=require('../src/olt-planned-reboot');
const {createDefaultStore,ensureShape,publicSettings}=require('../src/store');
const NOW=Date.now(),STEP=guard.INTERVAL_MS,SN='HWTCAABB0001';
function fixture(){const data=createDefaultStore();data.oltDevices=[{id:'olt',enabled:true,updatedAt:'rev',links:{}}];return data;}
function row(patch={}){return{id:'1',serialNumber:SN,ponKey:'0/0/1',status:'offline',condition:'los',causeKnown:true,downCause:'LOS',...patch};}
function obs(at=0,onus=[row()],patch={}){return{deviceId:'olt',deviceUpdatedAt:'rev',snapshot:{status:'online',checkedAt:new Date(NOW+at).toISOString(),onus,ports:[],...patch}};}
function poll(data,at=0,onus=[row()],patch={},now=at){const observation=obs(at,onus,patch),before=JSON.stringify(data),plan=olt.losTicketPlan(data,[observation],{now:NOW+now});assert.equal(JSON.stringify(data),before,'planning must not mutate shared state');return{plan,result:olt.applyLosTicketPlan(data,plan,NOW+now)};}
test('a new LOS produces neither ticket nor WA before three spaced fresh reads',()=>{
 const data=fixture(),business=JSON.stringify([data.customers,data.invoices,data.payments,data.waMessages]);
 for(const at of[0,STEP]){assert.equal(poll(data,at).result.created.length,0);assert.equal(data.oltTickets.length,0);assert.equal(data.waMessages.length,0);}
 assert.equal(data.oltLosObservations[0].count,2);assert.equal(poll(data,2*STEP).result.created.length,1);assert.equal(data.oltTickets[0].source,'olt-los');assert.equal(data.oltLosObservations[0].count,3);assert.equal(JSON.stringify([data.customers,data.invoices,data.payments,data.waMessages]),business);
 assert.equal(poll(data,3*STEP).result.created.length,0);assert.equal(data.oltTickets.length,1);
});
test('the same cache and rapid manual refresh cannot increment or bypass the minimum interval',()=>{
 const data=fixture();poll(data);assert.equal(poll(data).result.changed,false);
 for(const at of[1000,10000,STEP-1]){poll(data,at);assert.equal(data.oltLosObservations[0].count,1);}
 poll(data,STEP);assert.equal(data.oltLosObservations[0].count,2);poll(data,STEP+1);assert.equal(data.oltLosObservations[0].count,2);
 assert.equal(poll(data,2*STEP-1).result.created.length,0);assert.equal(poll(data,2*STEP).result.created.length,1);
});
test('online, dying gasp, unknown, ambiguous duplicates and missing rows reset pending confirmation',()=>{
 for(const rows of[[row({status:'online',condition:'online'})],[row({condition:'dying-gasp',downCause:'dying-gasp'})],[row({status:'unknown',condition:'other',causeKnown:false})],[row(),row()],[]]){
  const data=fixture();poll(data);poll(data,STEP);assert.equal(data.oltLosObservations[0].count,2);poll(data,2*STEP,rows);assert.equal(data.oltLosObservations.length,0);assert.equal(data.oltTickets.length,0);
  assert.equal(poll(data,3*STEP).result.created.length,0);assert.equal(data.oltLosObservations[0].count,1);
 }
});
test('failed, incomplete, stale and reordered observations never add a read or erase newer proof',()=>{
 const data=fixture();poll(data);
 for(const patch of[{status:'unreachable'},{inventoryAvailable:false},{stale:true},{pendingRefresh:true}]){assert.equal(poll(data,STEP,[row()],patch).result.changed,false);assert.equal(data.oltLosObservations[0].count,1);}
 poll(data,STEP);assert.equal(poll(data,0,[row({status:'online',condition:'online'})],{},STEP).result.changed,false);assert.equal(data.oltLosObservations[0].count,2);
 assert.equal(poll(data,2*STEP).result.created.length,1);
});
test('a long observation gap restarts confirmation instead of completing an old episode',()=>{
 const data=fixture();poll(data);poll(data,STEP);const later=STEP+guard.MAX_GAP_MS+1;poll(data,later);assert.equal(data.oltLosObservations[0].count,1);assert.equal(data.oltTickets.length,0);poll(data,later+STEP);assert.equal(poll(data,later+2*STEP).result.created.length,1);
});
test('pending state survives restart and normalization without sharing proof across identity or OLT revision',()=>{
 let data=fixture();poll(data);data=ensureShape(JSON.parse(JSON.stringify(data)));poll(data,STEP);data=ensureShape(JSON.parse(JSON.stringify(data)));assert.equal(poll(data,2*STEP).result.created.length,1);
 for(const change of[{id:'2'},{ponKey:'0/0/2'},{serialNumber:'HWTC11223344'}]){const fresh=fixture();poll(fresh);poll(fresh,STEP);assert.equal(poll(fresh,2*STEP,[row(change)]).result.created.length,0);assert.equal(fresh.oltLosObservations.length,1);assert.equal(fresh.oltLosObservations[0].count,1);}
 const changed=fixture();poll(changed);changed.oltDevices[0].updatedAt='new';const sample=obs(STEP);sample.deviceUpdatedAt='new';const plan=olt.losTicketPlan(changed,[sample],{now:NOW+STEP});olt.applyLosTicketPlan(changed,plan,NOW+STEP);assert.equal(changed.oltLosObservations[0].count,1);
});
test('planned reboot suppresses reboot-era evidence; fresh post-reboot LOS still needs three reads',()=>{
 const data=fixture();planned.begin(data,{source:'olt',oltId:'olt',onuIndex:'1',pon:'0/0/1',serialNumber:SN},{id:'unit'},NOW);
 for(const at of[0,STEP])assert.equal(poll(data,at).result.created.length,0);assert.equal(data.oltLosObservations.length,0);
 const after=planned.WINDOW_MS+1;assert.equal(poll(data,after).result.created.length,0);assert.equal(poll(data,after+STEP).result.created.length,0);assert.equal(poll(data,after+2*STEP).result.created.length,1);
});
test('group incidents cannot bypass confirmation by counting unconfirmed members',()=>{
 const data=fixture(),rows=Array.from({length:4},(_,i)=>row({id:String(i+1),serialNumber:'HWTC'+String(i+1).padStart(8,'0')}));
 poll(data,0,rows);poll(data,STEP,rows);assert.equal(data.oltTickets.length,0);assert.equal(poll(data,2*STEP,rows).result.created.length,1);assert.equal(data.oltTickets[0].scope,'pon');
});
test('a genuine online recovery rearms a separate LOS incident rather than inheriting old confirmation',()=>{
 const data=fixture();for(const at of[0,STEP,2*STEP])poll(data,at);assert.equal(poll(data,3*STEP,[row({status:'online',condition:'online'})]).result.resolved.length,1);assert.equal(data.oltLosObservations.length,0);
 assert.equal(poll(data,4*STEP).result.created.length,0);assert.equal(poll(data,5*STEP).result.created.length,0);assert.equal(poll(data,6*STEP).result.created.length,1);assert.equal(data.oltTickets.length,2);
});
test('observation metadata is bounded, expiring and absent from public settings',()=>{
 const data=fixture();poll(data);assert(!JSON.stringify(publicSettings(data.settings)).includes(SN));
 data.oltLosObservations.push({...data.oltLosObservations[0],oltId:'unknown'});assert.equal(guard.prepare(data,NOW).result().rows.length,1);
 assert.equal(guard.prepare(data,NOW+guard.RETENTION_MS+1).result().rows.length,0);
 const malformed=fixture();malformed.oltLosObservations=[{...data.oltLosObservations[0],count:3}];assert.equal(guard.prepare(malformed,NOW).result().rows.length,0);
 const many=fixture(),rows=Array.from({length:guard.MAX_ROWS+10},(_,i)=>row({id:String(i),serialNumber:'HWTC'+i.toString(16).padStart(8,'0').toUpperCase()}));
 const pending=guard.prepare(many,NOW);pending.observe(many.oltDevices[0],new Map(rows.map(row=>[row.serialNumber,row])),new Date(NOW).toISOString(),()=>true);assert.equal(pending.result().rows.length,guard.MAX_ROWS);
});
