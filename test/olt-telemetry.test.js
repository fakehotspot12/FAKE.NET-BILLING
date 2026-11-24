'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),telemetry=require('../src/olt-telemetry'),monitor=require('../src/olt-monitor'),store=require('../src/store'),vendors=require('../src/olt-vendors');
process.env.MIGRATION_MODE='0';process.env.REDIS_CACHE='0';
function fixture(vendor='hioso'){const data=store.createDefaultStore(),device=monitor.validateDevice(data,{name:'Friendly name is not model',vendor,host:'192.0.2.123',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit'});return{data,device};}
test('telemetry validates percentages and never fabricates zero from missing or invalid fields',()=>{for(const value of [null,undefined,'',-1,101,'99 MB','NaN'])assert.equal(telemetry.percent(value),null);assert.equal(telemetry.percent('35.89%'),35.89);assert.equal(telemetry.percent('0'),0);for(const value of ['OLT','EPON','GPON','<script>'])assert.equal(telemetry.model(value),'');});
test('CDATA model is parsed from physical device table, not hostname, with explicit percentage units',()=>{
 const result=telemetry.parseCdata([{command:'show device',stdout:'0 FD1604E-C1 Normal\n1 FD6041T Normal'},{command:'show cpu',stdout:'Load Average(5sec) : 10.1%\nLoad Average(1min) : 23.34%'},{command:'show memory',stdout:'Utilization : 36.00%'}]);assert.equal(result.model,'FD1604E-C1');assert.equal(result.cpuPercent,10.1);assert.equal(result.ramPercent,36);assert.equal(telemetry.parseCdata([{command:'show device',stdout:'HOSTNAME FD1604E-C1'}]).model,'');
});
test('HIOSO telemetry caches resource reads and daily firmware-family discovery independently',async()=>{
 const{data,device}=fixture(),now=Date.now(),calls=[],system='var sysInfo=new Array("Name","Description","Location","OLT","v1","20260101","00:11:22:33:44:55","192.0.2.123","1 day","v1","serial","1","35.89");',options={now,transports:{fetch:async url=>{calls.push(url.pathname);return new Response(url.pathname==='/system.asp'?system:'var product="HA7304";product="HA7304";');}}};
 const first=await telemetry.read(data,device,{},options);assert.equal(first.cpuPercent,1);assert.equal(first.ramPercent,35.89);assert.equal(first.family,'HA7304');assert.equal(first.model,'');assert.deepEqual(calls,['/system.asp','/item.asp']);assert.equal(telemetry.label(device,first),'HIOSO HA7304');
 const same=await telemetry.read(data,device,first,{...options,now:now+1000});assert.deepEqual(same,first);assert.equal(calls.length,2);
 const next=await telemetry.read(data,device,first,{...options,now:now+telemetry.INTERVAL_MS});assert.equal(next.family,'HA7304');assert.deepEqual(calls,['/system.asp','/item.asp','/system.asp']);
});
test('CDATA cache avoids reading hardware model again on each resource sample',async()=>{
 const{data,device}=fixture('cdata'),commands=[],now=Date.now(),options={now,transports:{commands:async input=>{commands.push(input.commands);return{success:true,outputs:[{command:'show device',stdout:'0 FD1604E-C1 Normal'},{command:'show cpu',stdout:'Load Average(1min) : 21.5%'},{command:'show memory',stdout:'Utilization : 40%'}]};}}};const first=await telemetry.read(data,device,{},options);assert.equal(first.model,'FD1604E-C1');await telemetry.read(data,device,first,{...options,now:now+telemetry.INTERVAL_MS});assert.deepEqual(commands[0],['enable','show device','show cpu','show memory']);assert.deepEqual(commands[1],['enable','show cpu','show memory']);
});
test('source failure retains last real values marked stale and applies retry backoff',async()=>{
 const{data,device}=fixture(),now=Date.now();let reads=0;const options={now,transports:{fetch:async()=>{reads++;return new Response('var sysInfo=new Array("n","d","l","HA7302CST","v","r","m","i","u","h","s","5","20");');}}},previous=await telemetry.read(data,device,{},options),failed=await telemetry.read(data,device,previous,{now:now+telemetry.INTERVAL_MS,transports:{fetch:async()=>{reads++;throw Error('unreachable');}}});assert.equal(failed.stale,true);assert.equal(failed.cpuPercent,5);assert.equal(failed.ramPercent,20);const again=await telemetry.read(data,device,failed,{...options,now:now+telemetry.INTERVAL_MS+100});assert.deepEqual(again,failed);assert.equal(reads,2);
});
test('demo mode cannot read real telemetry, and public summary never exposes credentials',async()=>{
 const{data,device}=fixture();process.env.MIGRATION_MODE='1';try{let reads=0;await telemetry.read(data,device,{}, {transports:{fetch:async()=>{reads++;}}});assert.equal(reads,0);}finally{process.env.MIGRATION_MODE='0';}const value=await telemetry.read(data,device,{}, {transports:{fetch:async()=>new Response('var sysInfo=new Array("n","d","l","HA7302CST","v","r","m","i","u","h","s","5","10");')}}),publicRow=monitor.publicDevice(device,{telemetry:value});assert.equal(publicRow.systemLabel,'HIOSO HA7302CST');assert.equal(publicRow.resources.cpuPercent,5);assert(!JSON.stringify(publicRow).includes(value.signature));assert(!JSON.stringify(publicRow).includes('unit-password'));
});
test('ZTE resources use the uniquely verified active controller, not the PON board or a made-up average',()=>{
 const card='Rack Shelf Slot CfgType RealType Port HardVer SoftVer Status\n1 1 1 GTGH GTGHG 16 V1 V2 INSERVICE\n1 1 3 SMXA SMXA 3 V1 V2 INSERVICE\n1 1 4 SMXA 3 V1 V2 OFFLINE',processor='Rack Shelf Slot CPU(5s) CPU(1m) CPU(5m) PhyMem(MB) Memory\n1 1 1 19% 22% 22% 512 39%\n1 1 3 8% 9% 9% 2048 26%';
 const outputs=[{command:'show card',stdout:card},{command:'show processor',stdout:processor}],result=telemetry.parseZte(outputs);assert.equal(result.cpuPercent,8);assert.equal(result.ramPercent,26);assert.equal(result.source,'cli-control-board');
 assert.throws(()=>telemetry.parseZte([{command:'show card',stdout:card.replace('OFFLINE','INSERVICE')},outputs[1]]),/belum pasti/);assert.throws(()=>telemetry.parseZte([outputs[0],{command:'show processor',stdout:processor.replace('9% 9% 2048 26%','9% 9% 2048 126%')}]),/belum lengkap/);
});
test('manual ZTE telemetry in isolated Dev requires the existing explicit grant and stays cached between samples',async()=>{
 const{data,device}=fixture('zte'),now=Date.now();let calls=0;process.env.MIGRATION_MODE='1';
 try{const options={now,allowZteDevRead:true,transports:{commands:async({commands})=>{calls++;assert.deepEqual(commands,['enable','terminal length 0','show card','show processor']);return{success:true,outputs:[{command:'show card',stdout:'Rack Shelf Slot CfgType RealType Port HardVer SoftVer Status\n1 1 3 SMXA SMXA 3 V1 V2 INSERVICE'},{command:'show processor',stdout:'Rack Shelf Slot CPU(5s) CPU(1m) CPU(5m) PhyMem(MB) Memory\n1 1 3 8% 9% 9% 2048 26%'}]};}}};
 const denied=await telemetry.read(data,device,{}, {...options,allowZteDevRead:false});assert.equal(calls,0);assert.equal(denied.cpuPercent,undefined);const first=await telemetry.read(data,device,{},options);assert.equal(first.cpuPercent,8);assert.equal(first.nextReadAt,now+telemetry.INTERVAL_MS);assert.deepEqual(await telemetry.read(data,device,first,{...options,now:now+1000}),first);assert.equal(calls,1);
 }finally{process.env.MIGRATION_MODE='0';}
});
test('HSGQ reads CPU and used RAM from native CLI with shared cache and no web requests',async()=>{
 const{data,device}=fixture('hsgq'),now=Date.now();let calls=0;const outputs=[{command:'show cpu-usage',stdout:'Get the CPU usage is 10.389610%\r\n'},{command:'show memory statistics',stdout:'Storage Type Storage Size Storage Used Storage Rate\r\nMemory 515780 kB 258512 kB 50.120592%\r\n'}],options={now,transports:{commands:async({commands})=>{calls++;assert.deepEqual(commands,['enable','configure','show cpu-usage','show memory statistics']);return{success:true,outputs};},fetch:async()=>{throw Error('Must use CLI');}}};
 const first=await telemetry.read(data,device,{},options);assert.equal(first.cpuPercent,10.38961);assert.equal(first.ramPercent,50.120592);assert.equal(first.source,'cli-hsgq');assert.equal(first.nextReadAt,now+telemetry.INTERVAL_MS);assert.deepEqual(await telemetry.read(data,device,first,{...options,now:now+1000}),first);assert.equal(calls,1);
 for(const memory of ['Memory 0 kB 0 kB 0%','Memory 100 kB 150 kB 50%','Memory 100 kB 50 kB 10%'])assert.throws(()=>telemetry.parseHsgq([outputs[0],{...outputs[1],stdout:memory}]));
});

const hsgqOutputs=[{command:'show cpu-usage',stdout:'Get the CPU usage is 12%\n'},{command:'show memory statistics',stdout:'Memory 1000 kB 500 kB 50%\n'}];
test('shared telemetry coalesces twenty readers and exposes only one real sample',async()=>{
 const{data,device}=fixture('hsgq');let calls=0,release;const gate=new Promise(resolve=>{release=resolve;}),options={transports:{commands:async()=>{calls++;await gate;return{success:true,outputs:hsgqOutputs};}}},reads=Array.from({length:20},()=>telemetry.read(data,device,{},options));
 try{for(let i=0;i<30&&!calls;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls,1);}finally{release();}const result=await Promise.all(reads);assert(result.every(row=>row.checkedAt===result[0].checkedAt&&row.cpuPercent===12));assert.equal(calls,1);
});
test('resource cadence adapts to response duration without guessing LAN from a private address',async()=>{
 const{data,device}=fixture('hsgq'),commands=async()=>({success:true,outputs:hsgqOutputs});let now=Date.now(),old={};
 for(let i=0;i<3;i++){old=await telemetry.read(data,device,old,{now,elapsedMs:100,transports:{commands}});assert.equal(old.intervalMs,i===2?15000:30000);now=old.nextReadAt;}
 const slow=await telemetry.read(data,device,old,{now,elapsedMs:2500,transports:{commands}});assert.equal(slow.intervalMs,60000);assert.equal(slow.cpuPercent,12);assert.equal(slow.stale,false);
});
test('repeated failures back off individually to five minutes and keep the last real values and timestamp',async()=>{
 const{data,device}=fixture('hsgq'),before=structuredClone(data);let value=await telemetry.read(data,device,{}, {elapsedMs:100,transports:{commands:async()=>({success:true,outputs:hsgqOutputs})}}),checked=value.checkedAt;
 for(const interval of[30000,60000,120000,240000,300000,300000]){value=await telemetry.read(data,device,value,{now:value.nextReadAt,transports:{commands:async()=>{throw Error('PRIVATE PASSWORD');}}});assert.equal(value.intervalMs,interval);assert.equal(value.checkedAt,checked);assert.equal(value.cpuPercent,12);assert(value.stale);assert(!JSON.stringify(value).includes('PRIVATE PASSWORD'));}
 assert.deepEqual(data,before);assert.equal(telemetry.resources(device,value,value.nextReadAt).stale,true);
});
test('a changed host or credential cannot reuse a resource sample from the former connection',async()=>{
 const{data,device}=fixture('hsgq'),value=await telemetry.read(data,device,{}, {transports:{commands:async()=>({success:true,outputs:hsgqOutputs})}});
 for(const change of[{host:'192.0.2.150'},{cliPasswordEnc:'changed'},{enabled:false}]){const publicValue=telemetry.resources({...device,...change},value);assert.equal(publicValue.cpuPercent,null);assert.equal(publicValue.ramPercent,null);assert.equal(publicValue.checkedAt,'');}
});
test('a slow remote OLT does not block another available telemetry slot and active CLI operations are skipped',async()=>{
 const data=store.createDefaultStore(),devices=Array.from({length:4},(_,i)=>monitor.validateDevice(data,{name:'Unit '+i,vendor:'hsgq',host:'192.0.2.'+(151+i),community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit'}));data.oltDevices=devices;
 const[,,transport]=await vendors.loadLibrary();let release,slowStarted=false;const gate=new Promise(resolve=>{release=resolve;}),calls=[],options={transports:{commands:async({olt})=>{calls.push(olt.id);if(olt.id===devices[0].id){slowStarted=true;await gate;}return{success:true,outputs:hsgqOutputs};}}};
 assert(transport.claimOlt(devices[3].id));const first=telemetry.pollDevices(data,devices.slice(0,2),options);
 try{for(let i=0;i<60&&(!slowStarted||!telemetry.cached(devices[1]).checkedAt);i++)await new Promise(r=>setTimeout(r,5));assert(slowStarted);assert(telemetry.cached(devices[1]).checkedAt);await telemetry.pollDevices(data,devices,options);assert(telemetry.cached(devices[2]).checkedAt);assert(!calls.includes(devices[3].id));assert.equal(calls.filter(id=>id===devices[0].id).length,1);}finally{release();transport.releaseOlt(devices[3].id);await first;}
});
test('cache-only telemetry endpoint does not modify inventory freshness or execute device reads',async()=>{
 const{data,device}=fixture('hsgq'),before=structuredClone(data);let calls=0;await telemetry.read(data,device,{}, {transports:{commands:async()=>{calls++;return{success:true,outputs:hsgqOutputs};}}});
 const pages=await Promise.all(Array.from({length:20},()=>monitor.resourcePage([device])));assert(pages.every(row=>row.devices[0].resources.cpuPercent===12));assert.equal(calls,1);assert.equal(await monitor.snapshotFor(device),null);assert.deepEqual(data,before);assert(!JSON.stringify(pages).includes('signature'));assert.equal(pages[0].refreshAfterMs,10000);
});
test('Redis restores a shared sample after restart without querying hardware or duplicating restores',async t=>{
 const redis=require('../src/redis-cache'),{data,device}=fixture('hsgq'),saved=new Map();let gets=0,calls=0;
 t.mock.method(redis,'enabled',()=>true);t.mock.method(redis,'set',async(key,value,ttl)=>{assert.equal(ttl,86400);saved.set(key,value);});t.mock.method(redis,'get',async key=>{gets++;await new Promise(r=>setTimeout(r,5));return saved.get(key);});
 const first=await telemetry.read(data,device,{}, {transports:{commands:async()=>{calls++;return{success:true,outputs:hsgqOutputs};}}}),modulePath=require.resolve('../src/olt-telemetry'),oldModule=require.cache[modulePath];delete require.cache[modulePath];
 try{const restarted=require(modulePath),rows=await Promise.all(Array.from({length:20},()=>restarted.restore(device)));assert(rows.every(row=>row.checkedAt===first.checkedAt));assert.equal(restarted.resources(device).cpuPercent,12);assert.equal(calls,1);assert.equal(gets,1);}finally{require.cache[modulePath]=oldModule;}
});
test('inventory and requested refresh wait for resource reads without marking a healthy OLT offline',async()=>{
 const{data,device}=fixture('hsgq');data.oltDevices=[device];let release,started=false,walks=0;const gate=new Promise(resolve=>{release=resolve;}),read=telemetry.read(data,device,{}, {transports:{commands:async()=>{started=true;await gate;return{success:true,outputs:hsgqOutputs};}}});
 try{for(let i=0;i<30&&!started;i++)await new Promise(r=>setTimeout(r,5));assert(started);assert.equal(await monitor.poll(data,device,{walk:async()=>{walks++;}}),null);assert.equal(monitor.requestRefresh(data,device),true);assert.deepEqual(await monitor.pollNext(data),{skipped:true});assert.equal(walks,0);assert.equal(await monitor.snapshotFor(device),null);}finally{release();await read;}
});
