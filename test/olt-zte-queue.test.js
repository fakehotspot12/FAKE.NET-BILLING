'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const vendors=require('../src/olt-vendors');
const {fixture}=require('./helpers/olt-bridge-fixture');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('ZTE web CLI requests queue FIFO without duplicate execution or overlapping sessions',async()=>{
 const f=fixture(),[,context,transport]=await vendors.loadLibrary(),seen=[];let concurrent=0,peak=0;
 const run=n=>context.withContext(f.data,f.device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:['show version-running']}),{cliQueue:true,transports:{commands:async()=>{concurrent++;peak=Math.max(peak,concurrent);seen.push(n);await sleep(10);concurrent--;return{success:true,outputs:[]};}}});
 assert(transport.claimOlt(f.device.id));const requests=[run(1),run(2),run(3)];await sleep(10);assert.deepEqual(seen,[]);transport.releaseOlt(f.device.id);await Promise.all(requests);assert.deepEqual(seen,[1,2,3]);assert.equal(peak,1);assert(!transport.isBusy(f.device.id));
});
test('queue expiry never opens a connection later and does not release another session lock',async()=>{
 const f=fixture(),[,context,transport]=await vendors.loadLibrary();let calls=0;assert(transport.claimOlt(f.device.id));
 const request=context.withContext(f.data,f.device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:['show version-running']}),{cliQueue:true,timeoutMs:40,transports:{commands:async()=>{calls++;return{success:true};}}});
 await assert.rejects(request,/antrean/);assert(transport.isBusy(f.device.id));transport.releaseOlt(f.device.id);await sleep(10);assert.equal(calls,0);assert(!transport.isBusy(f.device.id));
});
test('queue is bounded, other OLTs remain independent and release after transport failure',async()=>{
 const f=fixture(),other=fixture(),[,context,transport]=await vendors.loadLibrary();let calls=0;
 const run=(device=f.device)=>context.withContext(f.data,device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(device),commands:['show version-running']}),{cliQueue:true,transports:{commands:async()=>{calls++;return{success:true};}}});
 assert(transport.claimOlt(f.device.id));const requests=Array.from({length:4},()=>run());await sleep(10);await assert.rejects(run(),/penuh/);await run(other.device);assert.equal(calls,1);transport.releaseOlt(f.device.id);await Promise.all(requests);assert.equal(calls,5);
 await assert.rejects(context.withContext(f.data,f.device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(f.device),commands:['show version-running']}),{cliQueue:true,transports:{commands:async()=>{throw Error('fixture failure');}}}),/fixture failure/);assert(!transport.isBusy(f.device.id));await run();assert.equal(calls,6);
});
test('even read-only queue requests must match the authorized OLT identity before acquiring a session',async()=>{
 const f=fixture(),[,context,transport]=await vendors.loadLibrary();let calls=0;
 await assert.rejects(context.withContext(f.data,f.device,()=>transport.executeOltCommands({olt:{...vendors.legacyDevice(f.device),id:'different-olt'},commands:['show version-running']}),{cliQueue:true,transports:{commands:async()=>{calls++;return{success:true};}}}),/target rejected/);
 assert.equal(calls,0);assert(!transport.isBusy(f.device.id));assert(!transport.isBusy('different-olt'));
});
