'use strict';
const test=require('node:test'),assert=require('node:assert/strict');process.env.REDIS_CACHE='0';
const planned=require('../src/olt-planned-reboot'),olt=require('../src/olt-monitor'),{createDefaultStore,ensureShape,publicSettings}=require('../src/store');
const rawPlan=olt.losTicketPlan,priorLosReads=require('./helpers/confirmed-los');
function confirmedPlan(data,observations,options){priorLosReads(data,observations);return rawPlan(data,observations,options);}
const NOW=Date.parse('2026-11-14T12:00:00Z'),SN='HWTCAABB0001',INDEX='4718593';
function fixture(){const data=createDefaultStore();data.settings.oltTicketing={enabled:true,automaticTicketsEnabled:true,whatsappEnabled:true};data.oltDevices=[{id:'olt-a',name:'Unit',enabled:true,nasId:'nas-a',updatedAt:'rev',links:{}}];data.monitoringTargets=[{id:'nas-a',name:'NAS A'},{id:'nas-b',name:'NAS B'}];return data;}
const row=(sn=SN,patch={})=>({id:INDEX,serialNumber:sn,ponKey:'0/0/1',onuId:1,status:'offline',condition:'los',causeKnown:true,downCause:'LOS',rxPower:null,...patch});
function observation(data,onus,at){return{deviceId:'olt-a',deviceUpdatedAt:'rev',snapshot:{status:'online',checkedAt:new Date(at).toISOString(),onus,ports:[]}};}
function mark(data,target={},actor={}){return planned.begin(data,{source:'olt',serialNumber:SN,oltId:'olt-a',onuIndex:INDEX,pon:'0/0/1',...target},actor,NOW);}
test('planned reboot suppresses ticket creation for the exact ONU even when native cause reports LOS',()=>{
 const data=fixture(),before=structuredClone({customers:data.customers,invoices:data.invoices,payments:data.payments,wa:data.waMessages});mark(data);const plan=confirmedPlan(data,[observation(data,[row()],NOW+10000)],{now:NOW+10000});assert.equal(plan.creates,0);assert.equal(plan.changes.length,0);assert.deepEqual({customers:data.customers,invoices:data.invoices,payments:data.payments,wa:data.waMessages},before);
});
test('a fresh real LOS after five minutes creates a ticket; a cached reboot-era LOS does not',()=>{
 const data=fixture();mark(data);assert.equal(confirmedPlan(data,[observation(data,[row()],NOW+10000)],{now:NOW+planned.WINDOW_MS+1000}).creates,0);assert.equal(confirmedPlan(data,[observation(data,[row()],NOW+planned.WINDOW_MS+1000)],{now:NOW+planned.WINDOW_MS+1000}).creates,1);
});
test('observations before the reboot request and other ONU positions are not silenced',()=>{
 const data=fixture();mark(data);assert.equal(confirmedPlan(data,[observation(data,[row()],NOW-1000)],{now:NOW+1000}).creates,1);
 const mismatch=row(SN,{id:'4718594',onuId:2});assert.equal(confirmedPlan(data,[observation(data,[mismatch],NOW+1000)],{now:NOW+1000}).creates,1);assert.equal(confirmedPlan(data,[observation(data,[row('HWTC11223344')],NOW+1000)],{now:NOW+1000}).creates,1);
});
test('mass reboot does not lower the denominator and invent a PON incident from remaining LOS',()=>{
 const data=fixture(),rows=Array.from({length:10},(_,i)=>row('HWTC'+String(i+1).padStart(8,'0'),{id:String(4718593+i),onuId:i+1,status:i<3?'offline':'online',condition:i<3?'los':'online'}));for(const onu of rows.slice(3))mark(data,{serialNumber:onu.serialNumber,onuIndex:onu.id});const plan=confirmedPlan(data,[observation(data,rows,NOW+1000)],{now:NOW+1000});assert.equal(plan.creates,3);assert(plan.changes.every(change=>change.scope==='onu'));
});
test('existing legitimate fault tickets are not removed and a true online recovery still resolves normally',()=>{
 const data=fixture(),initial=confirmedPlan(data,[observation(data,[row()],NOW-2000)],{now:NOW-2000});olt.applyLosTicketPlan(data,initial,NOW-2000);const id=data.oltTickets[0].id;mark(data);assert.equal(confirmedPlan(data,[observation(data,[row()],NOW+1000)],{now:NOW+1000}).changes.length,0);assert.equal(data.oltTickets[0].id,id);
 const recovery=confirmedPlan(data,[observation(data,[row(SN,{status:'online',condition:'online'})],NOW+2000)],{now:NOW+2000});assert.equal(olt.applyLosTicketPlan(data,recovery,NOW+2000).resolved.length,1);
});
test('markers survive restart/store normalization but expire and cannot be extended by repeated clicks',()=>{
 const data=fixture(),marker=mark(data);assert.throws(()=>mark(data),error=>error.status===429);const restored=ensureShape(JSON.parse(JSON.stringify(data)));assert.equal(planned.forOnu(restored,restored.oltDevices[0],row(),{now:NOW+1000}).id,marker.id);assert.equal(planned.forOnu(restored,restored.oltDevices[0],row(),{now:NOW+planned.WINDOW_MS+1}),null);assert(planned.cancel(restored,marker.id));assert.equal(planned.index(restored,NOW+1000).size,0);
});
test('ACS hex serial normalization and scoped NAS avoid silencing another NAS',()=>{
 const data=fixture();const marker=planned.begin(data,{source:'acs',deviceId:'00259E-ONT-48575443AABB0001'},{id:'tech',role:'technician',lockedNasIds:['nas-a']},NOW);assert.equal(marker.serialNumber,SN);assert(planned.forOnu(data,data.oltDevices[0],row(),{now:NOW+1}));assert.equal(planned.forOnu(data,{id:'olt-b',nasId:'nas-b'},row(),{now:NOW+1}),null);assert.equal(planned.forOnu(data,{id:'unknown'},row(),{now:NOW+1}),null);
});
test('manual tickets and faults predating reboot retain notification eligibility',()=>{
 const data=fixture();mark(data);const ticket={source:'olt-los',createdAt:new Date(NOW+1000).toISOString(),oltId:'olt-a',pon:'0/0/1',serialNumber:SN};assert(planned.suppressNotification(data,ticket,NOW+2000));assert(!planned.suppressNotification(data,{...ticket,source:'manual'},NOW+2000));assert(!planned.suppressNotification(data,{...ticket,createdAt:new Date(NOW-1000).toISOString()},NOW+2000));assert(!planned.suppressNotification(data,{...ticket,serialNumber:'HWTC11223344'},NOW+2000));
});
test('unknown/non-GPON device identities do not create broad reboot markers',()=>{const data=fixture();assert.equal(planned.begin(data,{deviceId:'unknown'},{}),null);assert.equal(planned.index(data,NOW).size,0);});
test('ZTE reboot markers accept native ONU addresses and suppress only the exact SN and PON',()=>{
 const data=fixture();data.oltDevices[0].vendor='zte';const target={onuIndex:'1/1/13:6',pon:'1/1/13'},marker=mark(data,target);
 assert.equal(marker.onuIndex,target.onuIndex);assert(planned.forOnu(data,data.oltDevices[0],row(SN,{id:target.onuIndex,ponKey:target.pon}),{now:NOW+1}));
 for(const patch of[{id:'1/1/13:7'},{ponKey:'1/1/12'},{serialNumber:'HWTC11223344'}])assert.equal(planned.forOnu(data,data.oltDevices[0],row(SN,{id:target.onuIndex,ponKey:target.pon,...patch}),{now:NOW+1}),null);
});
test('ZTE reboot markers reject mismatched PON, invalid IDs and injected commands before storing markers',()=>{
 for(const target of[{onuIndex:'1/1/13:6',pon:'1/1/12'},{onuIndex:'1/1/13:129',pon:'1/1/13'},{onuIndex:INDEX,pon:'1/1/13'},{onuIndex:'1/1/13:6;reboot',pon:'1/1/13'},{onuIndex:'01/1/13:6',pon:'1/1/13'}]){
  const data=fixture();data.oltDevices[0].vendor='zte';assert.throws(()=>mark(data,target),/Posisi ONU/);assert.equal(planned.index(data,NOW).size,0);
 }
});
test('reboot serials and actor IDs remain private rather than entering public branding/settings',()=>{const data=fixture();mark(data,{}, {id:'private-actor'});const output=publicSettings(data.settings);assert(!Object.hasOwn(output,'plannedOnuReboots'));assert(!JSON.stringify(output).includes('private-actor'));assert(!JSON.stringify(output).includes(SN));});
