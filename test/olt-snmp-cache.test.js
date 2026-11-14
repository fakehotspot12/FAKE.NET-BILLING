'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const olt=require('../src/olt-monitor'),redis=require('../src/redis-cache');
test('a first SNMP timeout survives Redis reload without inventing an empty ONU table or zero total',async t=>{
 const device={id:'snmp-failed-cache',host:'192.0.2.151',port:161,communityEnc:'unit',enabled:true},failure={status:'unreachable',checkedAt:new Date().toISOString(),pendingRefresh:false,stale:false,lastSuccessAt:'',error:'SNMP tidak merespons lengkap. Periksa daya, jaringan, dan community.'};let reads=0;
 t.mock.method(redis,'enabled',()=>true);t.mock.method(redis,'get',async()=>{reads++;return JSON.stringify(failure);});const result=await olt.snapshotFor(device);assert.deepEqual(result,failure);const row=olt.publicDevice(device,result);assert.equal(row.status,'unreachable');assert.equal(row.summary,null);assert.equal(row.ponPorts,0);assert(row.error.includes('SNMP'));assert.deepEqual(await olt.snapshotFor(device),result);assert.equal(reads,1);
});
test('malformed or unverified failure caches are ignored instead of reporting a fabricated device state',async t=>{
 t.mock.method(redis,'enabled',()=>true);let result;t.mock.method(redis,'get',async()=>JSON.stringify(result));let i=0;
 for(const value of [null,{},[],{status:'online',checkedAt:new Date().toISOString()},{status:'unreachable',checkedAt:'invalid'},{status:'unreachable',checkedAt:new Date().toISOString(),onus:{}}]){result=value;assert.equal(await olt.snapshotFor({id:'snmp-invalid-cache-'+i++,host:'192.0.2.152',port:161}),null);}
});
