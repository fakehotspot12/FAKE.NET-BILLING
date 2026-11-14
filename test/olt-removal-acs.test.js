'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const acs=require('../src/genieacs');
const settings={genieAcs:{enabled:true,baseUrl:'http://192.0.2.90:7557'}},SN='HWTCAABBCCDD';
test('ACS removal lookup reads only one exact SN, normalized hex included, without CWMP or credentials',async t=>{
 let calls=0;t.mock.method(global,'fetch',async(url,options)=>{calls++;const parsed=new URL(url);assert.equal(parsed.pathname,'/devices/');assert.equal(options.method||'GET','GET');assert.equal(parsed.searchParams.get('limit'),'6');const query=JSON.parse(parsed.searchParams.get('query'));assert.equal(query.$or.length,6);assert(query.$or[0]['_deviceId._SerialNumber'].$regex.includes('48575443AABBCCDD'));assert(!/Password|Hosts|WLAN|LANDevice/.test(parsed.searchParams.get('projection')));return new Response(JSON.stringify([{_id:'00259E-Model-48575443AABBCCDD',_deviceId:{_SerialNumber:'48575443AABBCCDD'},_lastInform:'2026-01-01T00:00:00Z',_tags:['NAS']}]),{status:200});});
 const rows=await acs.removalDevicesBySerial(settings,SN);assert.equal(rows.length,1);assert.equal(rows[0].serialNumber,SN);assert.equal(calls,1);
});
test('missing ACS record is distinct from invalid or failed responses',async t=>{
 let result=[];t.mock.method(global,'fetch',async()=>new Response(JSON.stringify(result),{status:200}));assert.deepEqual(await acs.removalDevicesBySerial(settings,SN),[]);
 for(const value of [{},Array(6).fill({_id:'x'}),[{_id:'wrong',_deviceId:{_SerialNumber:'FHTT11223344'}}]]){result=value;await assert.rejects(acs.removalDevicesBySerial(settings,SN));}
});
test('exact ACS ID suffix is accepted if device serial fields are absent',async t=>{
 t.mock.method(global,'fetch',async()=>new Response(JSON.stringify([{_id:'OUI-HG-48575443AABBCCDD'}]),{status:200}));assert.equal((await acs.removalDevicesBySerial(settings,SN))[0].serialNumber,SN);
});
test('unconfigured ACS and invalid serial never make a network request',async t=>{
 t.mock.method(global,'fetch',async()=>{assert.fail('must not fetch');});await assert.rejects(acs.removalDevicesBySerial({},SN));await assert.rejects(acs.removalDevicesBySerial(settings,'x.*'));
});
