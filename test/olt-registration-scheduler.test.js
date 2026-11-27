'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{create}=require('../src/olt-registration-scheduler');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('a wake bypasses the periodic wait, coalesces a burst and cannot overlap an active native job',async t=>{
 let release,active=0,maximum=0,calls=[];const gate=new Promise(resolve=>{release=resolve;});
 const scheduler=create({load:async()=>({}),enabled:()=>true,intervalMs:60000,minimumMs:10,debounceMs:5,tick:async(data,options)=>{active++;maximum=Math.max(maximum,active);calls.push(options);if(calls.length===1)await gate;active--;return{processed:0};}});t.after(()=>scheduler.stop());scheduler.start();await wait(15);
 for(let i=0;i<100;i++)assert(scheduler.wake('olt-a'));assert.equal(calls.length,1);release();await wait(35);assert.equal(maximum,1);assert.equal(calls.length,2);assert.equal(calls[1].wakeDeviceId,'olt-a');
});
test('already discovered queued ONUs continue without another twenty-second gap and bursts remain bounded',async t=>{
 let calls=0;const scheduler=create({load:async()=>({}),enabled:()=>true,intervalMs:60000,minimumMs:2,debounceMs:1,tick:async()=>({processed:1,deviceId:'olt-a',more:++calls<20})});t.after(()=>scheduler.stop());scheduler.start();await wait(80);assert.equal(calls,8);assert.equal(scheduler.status().pending,0);
});
test('disabling automation or stopping while loading prevents further native work',async t=>{
 let calls=0;const scheduler=create({load:async()=>({}),enabled:()=>false,intervalMs:60000,minimumMs:1,debounceMs:1,tick:async()=>{calls++;}});t.after(()=>scheduler.stop());scheduler.start();await wait(15);assert(!scheduler.isRunning());assert(!scheduler.wake('olt-a'));assert.equal(calls,0);
 let release;const gate=new Promise(resolve=>{release=resolve;}),second=create({load:async()=>{await gate;return{};},enabled:()=>true,tick:async()=>{calls++;},intervalMs:60000});second.start();await wait(5);second.stop();release();await wait(10);assert.equal(calls,0);
});
test('pending event memory is bounded even if a registered source floods different identifiers',async t=>{
 const scheduler=create({load:async()=>({}),enabled:()=>true,tick:async()=>({processed:0}),intervalMs:60000,debounceMs:1000});t.after(()=>scheduler.stop());scheduler.start();for(let i=0;i<1000;i++)scheduler.wake('olt-'+i);assert.equal(scheduler.status().pending,64);scheduler.stop();assert.equal(scheduler.status().pending,0);
});
