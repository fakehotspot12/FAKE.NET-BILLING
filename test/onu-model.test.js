'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module');
const models=require('../src/onu-model'),store=require('../src/store'),monitor=require('../src/olt-monitor');
process.env.MIGRATION_MODE='0';process.env.REDIS_CACHE='0';
// Await the cold ESM import before checking background work backed by in-memory mocks.
test.before(async()=>require('../src/olt-vendors').loadLibrary());
function fixture(vendor='hsgq') {
 const data=store.createDefaultStore(),device=monitor.validateDevice(data,{name:'Unit',vendor,host:'192.0.2.56',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit'}),serialNumber='ZTEGAABBCCDD';
 const row={id:vendor==='hsgq'?'0/3:0:'+serialNumber:'1/1/13:1',pon:vendor==='hsgq'?3:13,onuId:vendor==='hsgq'?0:1,serialNumber,status:'online',model:'ZTE-2G',modelSource:'zte-configured-type'};
 return{data,device,row};
}
const detail=(vendor,row,sn=row.serialNumber)=>vendor==='hsgq'?`PON ID : ${row.pon}\nONU ID : ${row.onuId}\nSerialNumber : ${sn}\nRun State : Online\nONU Name : Unit\n`:`ONU interface: gpon-onu_${row.id}\nSerial number: ${sn}\n`;
async function settle(){for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));}
test('physical series keeps F609, F670 and F670L distinct and never treats generic OLT templates as models',()=>{
 for(const value of ['F609','F670','F670L','ZXHN F670L V9.0','HG8145V5','FD511GD'])assert.equal(models.normalize(value),value==='ZXHN F670L V9.0'?'F670L':value);
 for(const value of ['ZTE-2G','HUAWEI-5G','FB-GPON-AUTO','HSGQ GPON Live','HGU','Huawei','<script>F609</script>'])assert.equal(models.normalize(value),'');
});
for(const vendor of ['hsgq','zte'])test(vendor+' model reads are background-only, identity-bound and cached without changing the OLT profile',async()=>{
 const f=fixture(vendor),before=structuredClone(f.data),calls=[],options={transports:{commands:async({commands})=>{calls.push(commands);return{success:true,outputs:commands.map(command=>({command,stdout:command.includes('ont-info')||command.includes('detail-info')?detail(vendor,f.row):vendor==='hsgq'?`PON/ONU : 03/000\nEquipment-ID : F609\n`:'Equipment ID : F670L\n'}))};}}};
 const initial=models.enrichPage(f.data,f.device,[f.row],options);assert.equal(initial[0].physicalModel,undefined);models.enrichPage(f.data,f.device,[f.row],options);await settle();
 const value=models.cached(f.device,[f.row])[0];assert.equal(value.physicalModel,vendor==='hsgq'?'F609':'F670L');assert.equal(value.model,'ZTE-2G');assert.equal(value.physicalModelSource,vendor+'-omci');assert.equal(calls.length,1);assert(!calls.flat().some(command=>/^(?:ont (?:delete|reboot|setting)|save|configure terminal|shutdown)/.test(command)));
 models.enrichPage(f.data,f.device,[f.row],options);await settle();assert.equal(calls.length,1);assert.equal(models.cached(f.device,[{...f.row,serialNumber:'ZTEG11223344'}])[0].physicalModel,undefined);assert.equal(models.cached({...f.device,host:'192.0.2.77'},[f.row])[0].physicalModel,undefined);assert.deepEqual(f.data,before);
});
test('a changed serial in native readback cannot seed the physical model cache',async()=>{
 const f=fixture(),options={transports:{commands:async({commands})=>({success:true,outputs:commands.map(command=>({command,stdout:command.startsWith('show ont-info')?detail('hsgq',f.row,'ZTEG11223344'):'PON/ONU : 03/000\nEquipment-ID : F609\n'}))})}};
 models.enrichPage(f.data,f.device,[f.row],options);await settle();assert.equal(models.cached(f.device,[f.row])[0].physicalModel,undefined);
 assert.equal(models.equipment('hsgq','PON/ONU : 04/000\nEquipment-ID : F609\n',f.row),'');
});
test('more than eight rows, demo mode, or ambiguous identity never starts native model work',async()=>{
 const f=fixture();let calls=0;const options={transports:{commands:async()=>{calls++;throw Error('Unexpected native query');}}};
 models.enrichPage(f.data,f.device,Array.from({length:9},()=>f.row),options);models.enrichPage(f.data,f.device,[{...f.row,identityAmbiguous:true}],options);
 process.env.MIGRATION_MODE='1';try{models.enrichPage(f.data,f.device,[f.row],options);}finally{process.env.MIGRATION_MODE='0';}await settle();assert.equal(calls,0);
});
test('ACS model fallback is cache-only, scope-bound and rejects conflicting identities or model records',()=>{
 const filename=require.resolve('../src/genieacs'),m=new Module(filename,module);m.filename=filename;m.paths=module.paths;const compiled=fs.readFileSync(filename,'utf8')+'\nmodule.exports.__seed=(settings,rows)=>deviceListCache.set(deviceListCacheKey(normalizeSettings(settings),{}),{rows,staleUntil:Date.now()+60000});';m._compile(compiled,filename);const acs=m.exports,cfg={genieAcs:{enabled:true,baseUrl:'http://192.0.2.44:7557'}},sn='ZTEGAABBCCDD',raw={_id:'unit',_deviceId:{_SerialNumber:sn,_ProductClass:'F670L'},_lastInform:new Date().toISOString()},oldFetch=global.fetch;
 global.fetch=()=>{throw Error('Must not query ACS');};try{acs.__seed(cfg,[raw]);assert.equal(acs.cachedOnuModels(cfg,[sn]).get(sn).model,'F670L');assert.equal(acs.cachedOnuModels({genieAcs:{...cfg.genieAcs,baseUrl:'http://192.0.2.45:7557'}},[sn]).size,0);
  acs._internal.clearDeviceListCache();acs.__seed(cfg,[raw,{...raw,_id:'other'}]);assert.equal(acs.cachedOnuModels(cfg,[sn]).size,0);
  acs._internal.clearDeviceListCache();acs.__seed(cfg,[raw,{...raw,_deviceId:{...raw._deviceId,_ProductClass:'F609'}}]);assert.equal(acs.cachedOnuModels(cfg,[sn]).size,0);
 }finally{global.fetch=oldFetch;}
});
test('ACS model priority survives native cache and obtains distance from the same detail read without an extra equipment command',async()=>{
 const f=fixture(),row={...f.row,...models.fromModem({modelName:'ZXHN F670L',productClass:'F609',lastInform:new Date().toISOString()},f.row)},commands=[];
 models.enrichPage(f.data,f.device,[row],{transports:{commands:async input=>{commands.push(...input.commands);return{success:true,outputs:input.commands.map(command=>({command,stdout:detail('hsgq',row)+'Distance : 1956\n'}))};}}});await settle();
 assert(!commands.some(command=>command.startsWith('show ont-version')));assert.equal(commands.filter(command=>command.startsWith('show ont-info')).length,2);
 const value=models.cached(f.device,[row])[0];assert.equal(value.physicalModel,'F670L');assert.equal(value.physicalModelSource,'acs-device-info');assert.equal(value.distance,1956);assert.equal(value.distanceSource,'hsgq-cli');
 const offline=models.cached(f.device,[{...row,status:'offline'}])[0];assert.equal(offline.distance,1956);
 assert.equal(models.cached(f.device,[row],Date.parse(value.distanceCheckedAt)+models.DISTANCE_MS+1)[0].distance,undefined);
 assert.equal(models.cached(f.device,[{...row,serialNumber:'ZTEG11223344'}])[0].distance,undefined);
});
test('native distance parser accepts measured meters only and never guesses from coordinates, zero, or unknown data',()=>{
 assert.equal(models.distance('Distance : 1956\n'),1956);assert.equal(models.distance('ONU Distance: 2893m\r\n'),2893);
 for(const text of ['Distance: -','Distance: 0','Distance: 100001','Distance: 2 km','Distance: 12\nDistance: 15','Latitude: 10 Longitude: 20'])assert.equal(models.distance(text),null);
});
