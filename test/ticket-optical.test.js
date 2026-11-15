'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),olt=require('../src/olt-monitor'),network=require('../src/ticket-network');
function sample(){return{status:'online',checkedAt:new Date(Date.now()-60000).toISOString(),onus:[{id:'4718593',serialNumber:'HWTCAABBCCDD',status:'online',rxPower:-23.45,ponKey:'0/0/1'}]};}
test('latest valid optical reading survives offline/missing readings without changing live values',()=>{
 const first=olt.preserveLastOnline(sample()),row=first.onus[0];assert.equal(row.lastRxPower,-23.45);assert.equal(row.lastRxPowerAt,first.checkedAt);
 const offline={status:'online',checkedAt:new Date().toISOString(),onus:[{...row,status:'offline',rxPower:null}]},next=olt.preserveLastOnline(offline,first);assert.equal(next.onus[0].rxPower,null);assert.equal(next.onus[0].lastRxPower,-23.45);assert.equal(next.onus[0].lastRxPowerAt,first.checkedAt);assert(olt.lastOptical(next,next.onus[0]).stale);
});
test('replacement, moved position, duplicate identities and invalid numeric values cannot inherit a false reading',()=>{
 const first=olt.preserveLastOnline(sample());for(const change of [{serialNumber:'HWTC11223344'},{id:'4718594'}]){const next=olt.preserveLastOnline({...sample(),onus:[{...first.onus[0],lastRxPower:undefined,lastRxPowerAt:undefined,rxPower:null,...change}]},first);assert.equal(next.onus[0].lastRxPower,null);}
 const duplicate={...first,onus:[first.onus[0],first.onus[0]]};assert.equal(olt.preserveLastOnline({...sample(),onus:[{...sample().onus[0],status:'offline',rxPower:null}]},duplicate).onus[0].lastRxPower,null);
 for(const value of [0,25,-100,'-20',NaN,Infinity,null])assert.equal(olt.lastOptical(sample(),{...sample().onus[0],rxPower:value}).rxPower,null);
});
test('failed OLT read and legacy unknown timestamps never become a fresh optical measurement',()=>{
 const previous=olt.preserveLastOnline(sample()),failed={...sample(),status:'unreachable',stale:true,onus:[{...previous.onus[0],rxPower:-20}]};const next=olt.preserveLastOnline(failed,previous);assert.equal(next.onus[0].lastRxPowerAt,previous.checkedAt);assert.equal(next.onus[0].lastRxPower,-23.45);
 const legacy=olt.lastOptical(sample(),{status:'offline',rxPower:-26.5});assert.equal(legacy.rxPower,-26.5);assert.equal(legacy.at,'');
});
test('ticket context uses only a unique matching ONU position and cached optical value',async()=>{
 const snapshot=olt.preserveLastOnline(sample()),device={id:'olt',name:'OLT Unit',enabled:true,nasId:'a'},data={settings:{networkIntegrationEnabled:false},customers:[],radiusUsers:[],radiusNas:[],monitoringTargets:[],fiberPoints:[],oltDevices:[device]},ticket={id:'optical',oltId:'olt',serialNumber:'HWTCAABBCCDD',onuIndex:'4718593',pon:'0/0/1',status:'new',updatedAt:'unit'};
 let reads=0;const options={lookup:async()=>null,snapshot:async()=>{reads++;return snapshot;}};let result=await network.context(data,ticket,[device],options);assert.equal(result.network.optical.rxPower,-23.45);assert.equal(reads,1);
 result=await network.context(data,{...ticket,onuIndex:'other'},[device],options);assert.equal(result.network.optical.rxPower,null);
 snapshot.onus.push({...snapshot.onus[0],id:'4718594'});result=await network.context(data,{...ticket,onuIndex:''},[device],options);assert.equal(result.network.optical.rxPower,null);
});
