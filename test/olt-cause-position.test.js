'use strict';
const test=require('node:test'),assert=require('node:assert/strict');process.env.REDIS_CACHE='0';const olt=require('../src/olt-monitor'),redis=require('../src/redis-cache');
const SN='HWTCAABBCCDD',a=String(0x1480000+2),b=String(0x1480000+0x1000+2);
function snapshot(){return{status:'online',checkedAt:new Date().toISOString(),ports:[{kind:'pon',ponKey:'0/1/1'},{kind:'pon',ponKey:'0/1/2'}],onus:[{id:a,serialNumber:SN,...olt.position(a),status:'offline',rxPower:null},{id:b,serialNumber:SN,...olt.position(b),status:'offline',rxPower:null}]};}
test('duplicate SN with LOS and dying-gasp is classified by exact PON/ONU, not the last serial row',()=>{
 const input=snapshot(),causes=olt.parseCauseRows(`Offline : 2\n0/1 1 2 ${SN} 7 dying-gasp\n0/1 2 2 ${SN} 7 LOS`),result=olt.applyCauses(input,causes);assert.equal(causes.get(SN),undefined);assert.equal(result.onus[0].condition,'dying-gasp');assert.equal(result.onus[1].condition,'los');assert.equal(result.summary.los,1);assert.equal(result.summary.dyingGasp,1);assert.equal(result.ports[0].los,0);assert.equal(result.ports[1].los,1);
});
test('unknown or conflicting native position never borrows a cause from a matching serial elsewhere',()=>{
 const input=snapshot(),result=olt.applyCauses(input,olt.parseCauseRows(`Offline : 2\n0/1 2 2 ${SN} 7 LOS`));assert.equal(result.onus[0].condition,'other');assert.equal(result.onus[0].causeKnown,false);assert.equal(result.onus[1].condition,'los');
 const ambiguous=olt.applyCauses(snapshot(),olt.parseCauseRows(`Offline : 2\n0/1 1 2 ${SN} 7 LOS\n0/1 1 2 ${SN} 7 dying-gasp`));assert.equal(ambiguous.summary.los,0);assert.equal(ambiguous.summary.dyingGasp,0);
});
test('legacy serial-only cause input is accepted for unique SN only; online ONU stays online',()=>{
 const input=snapshot();input.onus[1].status='online';const result=olt.applyCauses(input,new Map([[SN,'LOS']]));assert.equal(result.summary.los,0);assert.equal(result.onus[0].condition,'other');assert.equal(result.onus[1].condition,'online');
});
test('old Redis snapshots clear unsafe duplicate causes while retaining last-active timestamps until a fresh poll',async t=>{
 const original=snapshot();original.onus=original.onus.map(row=>({...row,downCause:'LOS',causeKnown:true,condition:'los',lastOnlineAt:'2026-11-01T00:00:00Z'}));t.mock.method(redis,'enabled',()=>true);t.mock.method(redis,'get',async()=>JSON.stringify(original));const result=await olt.snapshotFor({id:'legacy-ambiguous-causes',host:'192.0.2.170',port:161});assert(result.pendingRefresh);assert.equal(result.causeSchema,2);assert.equal(result.summary.los,0);assert.equal(result.summary.other,2);assert(result.onus.every(row=>row.lastOnlineAt==='2026-11-01T00:00:00Z'));assert(original.onus.every(row=>row.downCause==='LOS'));
});
