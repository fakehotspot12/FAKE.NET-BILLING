'use strict';
const test=require('node:test'),assert=require('node:assert/strict');process.env.REDIS_CACHE='0';
const olt=require('../src/olt-monitor'),store=require('../src/store'),SN='HWTCAABBCCDD',INDEX='4718593';
function setup(){const data=store.createDefaultStore(),device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.122',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit'});return{data,device};}
test('uncached exact position can be inspected without creating a record or changing financial data',async()=>{
 const f=setup(),before=structuredClone(f.data);process.env.MIGRATION_MODE='0';
 for(const status of ['offline','online','unknown']){const result=await olt.readRemovalState(f.data,f.device,SN,{onuIndex:INDEX},{inspect:async(_,__,target)=>{assert.equal(target.id,INDEX);assert.equal(target.serialNumber,SN);return{outputs:[{stdout:'Run state : '+status+'\nSN : '+SN}]};}});assert.equal(result.state,status);assert.deepEqual(f.data,before);}
});
test('native absence is distinguished from timeout and serial conflict',async()=>{
 const f=setup();process.env.MIGRATION_MODE='0';const result=await olt.readRemovalState(f.data,f.device,SN,{onuIndex:INDEX},{inspect:async()=>{const error=Error('absent');error.code='ONU_NOT_FOUND';throw error;}});assert.equal(result.state,'missing');
 for(const message of ['Timeout','Serial ONU berbeda'])await assert.rejects(olt.readRemovalState(f.data,f.device,SN,{onuIndex:INDEX},{inspect:async()=>{throw Error(message);}}));
 await assert.rejects(olt.readRemovalState(f.data,f.device,SN,{onuIndex:'1;reboot'}));
});
test('real device reads remain blocked in isolated dev mode',async()=>{
 const f=setup();process.env.MIGRATION_MODE='1';await assert.rejects(olt.readRemovalState(f.data,f.device,SN,{onuIndex:INDEX},{inspect:async()=>{assert.fail('no real CLI');}}),/Mode dev terisolasi/);
});
test('native absence permits cleanup without a cached snapshot and without a delete command',async()=>{
 const f=setup(),before=structuredClone(f.data);process.env.MIGRATION_MODE='0';const result=await olt.removeOnu(f.data,f.device,SN,{serialNumber:SN,onuIndex:INDEX,confirmDelete:true},{allowMissing:true,requireOffline:true,serial:async()=>'',inspect:async()=>{const error=Error('absent');error.code='ONU_NOT_FOUND';throw error;},delete:async()=>assert.fail('already absent')});assert(result.confirmed);assert(result.alreadyAbsent);assert.deepEqual(f.data,before);
});
