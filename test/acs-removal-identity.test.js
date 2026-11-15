'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),acs=require('../src/genieacs');
const settings={genieAcs:{enabled:true,baseUrl:'http://192.0.2.90:7557'}};
function row(){return{_id:'unit-device',_deviceId:{_SerialNumber:'RTETQB8H0128704'},_lastInform:'2026-01-01T00:00:00Z',VirtualParameters:{pppoeUsername:{_value:'unit@example.test'}},Device:{Ethernet:{Interface:{1:{MACAddress:{_value:'AA:BB:CC:DD:EE:FF'}}}}}};}
test('MAC removal lookup uses only exact native ONT interface MAC fields and bounded GET',async t=>{
 let reads=0;t.mock.method(global,'fetch',async(url,options)=>{reads++;const parsed=new URL(url);assert.equal(options.method,'GET');assert.equal(parsed.searchParams.get('limit'),'6');const query=JSON.parse(parsed.searchParams.get('query'));assert.equal(query.$or.length,2);for(const term of query.$or){const key=Object.keys(term)[0];assert(!/Hosts|WLAN/.test(key));assert(new RegExp(term[key].$regex,'i').test('AA:BB:CC:DD:EE:FF'));assert(!new RegExp(term[key].$regex,'i').test('00:AA:BB:CC:DD:EE:FF'));}assert(!/Password|Hosts|WLAN/.test(parsed.searchParams.get('projection')));return Response.json([row()]);});
 const rows=await acs.removalDevicesByMac(settings,'AABBCCDDEEFF');assert.equal(reads,1);assert.equal(rows[0].serialNumber,'RTETQB8H0128704');assert(rows[0].interfaceMacs.includes('AABBCCDDEEFF'));await assert.rejects(acs.removalDevicesByMac(settings,'FFFFFFFFFFFF'),/MAC/);assert.equal(reads,1);
});
test('account deletion lookup is exact and escapes regex metacharacters; it never searches a partial username',async t=>{
 t.mock.method(global,'fetch',async(url,options)=>{assert.equal(options.method,'GET');const parsed=new URL(url),query=JSON.parse(parsed.searchParams.get('query'));for(const term of query.$or){const value=Object.values(term)[0],regex=new RegExp(value.$regex,value.$options);assert(regex.test('unit@example.test'));assert(!regex.test('prefix-unit@example.test'));assert(!regex.test('unit@exampleXtest'));}return Response.json([row()]);});assert.equal((await acs.removalDevicesForAccount(settings,'unit@example.test')).length,1);
});
test('mismatched identity, invalid response and oversized ambiguity are rejected rather than becoming absence',async t=>{
 let response=[{...row(),_id:''}];t.mock.method(global,'fetch',async()=>Response.json(response));await assert.rejects(acs.removalDevicesByMac(settings,'AABBCCDDEEFF'),/tidak cocok/);response=[{...row(),VirtualParameters:{pppoeUsername:{_value:'another'}}}];await assert.rejects(acs.removalDevicesForAccount(settings,'unit@example.test'),/tepat/);response=Array.from({length:6},row);await assert.rejects(acs.removalDevicesByMac(settings,'AABBCCDDEEFF'),/ambigu/);
});
