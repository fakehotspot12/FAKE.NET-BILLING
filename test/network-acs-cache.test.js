'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),acs=require('../src/genieacs');
test('concurrent identity readers share one lookup and cannot queue CWMP refresh or expose a mutable cache object',async t=>{
 acs._internal.clearDeviceListCache();let calls=0;
 const raw={_id:'net-cache-device',_lastInform:'2020-01-01T00:00:00Z',_deviceId:{_SerialNumber:'HWTCAABBCCDD'},VirtualParameters:{pppoeUsername:{_value:'alpha@isp'}}};
 t.mock.method(global,'fetch',async(url,options)=>{calls++;assert.equal(options.method,'GET');await new Promise(resolve=>setTimeout(resolve,2));return new Response(JSON.stringify([raw]),{status:200});});
 const settings={genieAcs:{enabled:true,baseUrl:'http://192.0.2.20:7557'}},options={username:'alpha@isp',strictIdentity:true,compact:true};
 const results=await Promise.all(Array.from({length:20},()=>acs.findBestDevice(settings,['alpha@isp'],options)));assert(results.every(row=>row.id===raw._id));const count=calls;results[0].username='changed';assert.equal(results[1].username,'alpha@isp');assert.equal((await acs.findBestDevice(settings,['alpha@isp'],options)).username,'alpha@isp');assert.equal(calls,count);
 await acs.findBestDevice(settings,['alpha@isp'],{...options,refresh:true});assert(calls>count);assert.equal(acs._internal.needsVirtualParameterRefresh(results[1]),true);
});
