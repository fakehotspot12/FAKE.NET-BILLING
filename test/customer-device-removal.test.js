'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),removal=require('../src/customer-device-removal'),store=require('../src/store'),olt=require('../src/olt-monitor');
const SN='HWTCAABBCCDD',INDEX='4718593';
function fixture(){
 const data=store.createDefaultStore(),actor={id:'admin',role:'admin',active:true};data.users=[actor];data.settings.networkIntegrationEnabled=true;data.settings.networkCustomerRemovalEnabled=true;data.settings.genieAcs={enabled:true,baseUrl:'http://192.0.2.90:7557'};
 data.monitoringTargets=[{id:'nas-a',name:'NAS A'}];data.radiusNas=[];data.customers=[{id:'member',name:'Unit Customer',radiusUserId:'user',username:'unit@example.test',nasId:'nas-a'}];data.radiusUsers=[{id:'user',customerId:'member',username:'unit@example.test',serviceType:'pppoe',nasId:'nas-a'}];
 const device=olt.validateDevice(data,{name:'Unit OLT',host:'192.0.2.30',community:'unit',nasId:'nas-a'});data.oltDevices=[device];
 const now=Date.now(),modem={id:'acs-unit',serialNumber:SN,username:'unit@example.test',registered:new Date(now-86400000).toISOString(),lastInform:new Date(now-3600000).toISOString(),interfaceMacs:['AABBCCDDEEFF']},onu={id:INDEX,serialNumber:SN,status:'offline',...olt.position(INDEX)};
 let modems=[modem],onus=[onu];const counter={olt:0,acs:0,final:0},options={now,findAccount:async()=>structuredClone(modems),snapshot:async()=>({status:'online',checkedAt:new Date(now).toISOString(),onus}),previewOlt:async()=>({token:'unit',canSubmit:true,olt:{state:'offline'},acs:{state:'ready'}}),removeOlt:async()=>{counter.olt++;onus=[];modems=[];return{complete:true,olt:{state:'deleted'},acs:{state:'deleted'}};},removeAcs:async()=>{counter.acs++;modems=[];},getData:async()=>data,journal:async record=>{data.networkRemovalRecords=[record];},finalize:async(plan)=>{removal.validateFinal(data,plan,actor);assert.throws(()=>removal.assertNotBusy('user'),/sedang berjalan/);counter.final++;}};
 const preview=()=>removal.preview(data,'user',actor,options),execute=plan=>removal.execute(data,'user',{networkRemovalToken:plan.token,confirmUsername:'unit@example.test',confirmDevices:true},actor,options);
 return{data,actor,device,modem,onu,options,counter,preview,execute,get modems(){return modems;},set modems(value){modems=value;},get onus(){return onus;},set onus(value){onus=value;}};
}
test.beforeEach(()=>{process.env.MIGRATION_MODE='0';});
test('new installations default off and require both strict switches and technical permissions',async()=>{
 assert.equal(store.createDefaultStore().settings.networkCustomerRemovalEnabled,false);
 for(const key of ['networkIntegrationEnabled','networkCustomerRemovalEnabled']){const f=fixture();f.data.settings[key]=false;await assert.rejects(f.preview(),/belum diaktifkan/);assert.equal(f.counter.olt,0);}
 for(const role of ['finance','collector','reseller_voucher','viewer','technician']){const f=fixture();f.actor.role=role;await assert.rejects(f.preview(),error=>error.status===403);}
});
test('read-only preview and confirmed device stages preserve finance and customer data until finalization',async()=>{
 const f=fixture(),before=structuredClone(f.data),plan=await f.preview();assert(plan.canSubmit);assert(plan.token);assert.deepEqual(f.data,before);const result=await f.execute(plan);assert(result.complete);assert.equal(f.counter.olt,1);assert.equal(f.counter.final,1);assert.deepEqual(f.data.customers,before.customers);assert.deepEqual(f.data.invoices,before.invoices);assert.deepEqual(f.data.payments,before.payments);removal.assertNotBusy('user');
});
test('standalone ACS, absent devices and unconfigured ACS are supported without fake absence on an outage',async()=>{
 const f=fixture();f.data.oltDevices=[];const result=await f.execute(await f.preview());assert(result.complete);assert.equal(f.counter.acs,1);assert.equal(f.counter.olt,0);
 const absent=fixture();absent.modems=[];absent.onus=[];assert((await absent.execute(await absent.preview())).complete);
 const unconfigured=fixture();unconfigured.data.oltDevices=[];unconfigured.data.settings.genieAcs.enabled=false;unconfigured.options.findAccount=async()=>{throw Error('Must not fetch');};assert((await unconfigured.execute(await unconfigured.preview())).complete);
 const down=fixture();down.options.findAccount=async()=>{throw Error('ACS unavailable');};const held=await down.preview();assert(!held.canSubmit);assert.equal(down.counter.olt,0);
});
test('demo preview cannot query devices or perform network mutation',async()=>{
 const f=fixture();process.env.MIGRATION_MODE='1';f.options.findAccount=async()=>{throw Error('Must not fetch');};const plan=await f.preview();assert(plan.simulated);assert(!plan.canSubmit);await assert.rejects(f.execute(plan),/Mode dev/);
});
for(const reason of ['active','multiple','foreign','snapshot','duplicate-olt','member-alias','other-account'])test(reason+' blocks unsafe or ambiguous customer removal',async()=>{
 const f=fixture();if(reason==='active'){f.modem.lastInform=new Date(f.options.now).toISOString();f.data.oltDevices=[];}if(reason==='multiple')f.modems=[f.modem,{...f.modem,id:'other'}];if(reason==='foreign')f.modem.excluded=true;if(reason==='snapshot')f.options.snapshot=async()=>({status:'unreachable'});if(reason==='duplicate-olt')f.onus=[f.onu,{...f.onu,id:'4718594'}];if(reason==='member-alias')f.data.customers.push({...f.data.customers[0],id:'duplicate'});if(reason==='other-account')f.data.radiusUsers.push({...f.data.radiusUsers[0],id:'other'});
 let plan;try{plan=await f.preview();}catch{}assert(!plan?.canSubmit);assert.equal(f.counter.olt,0);assert.equal(f.counter.final,0);
});
test('identity, settings, actor, consent and expiry changes invalidate confirmation before device mutation',async()=>{
 for(const reason of ['username','role','switch','token','consent','expiry','new-modem']){const f=fixture(),plan=await f.preview();let payload={networkRemovalToken:plan.token,confirmUsername:'unit@example.test',confirmDevices:true};if(reason==='username')f.data.radiusUsers[0].username='changed';if(reason==='role')f.actor.role='finance';if(reason==='switch')f.data.settings.networkCustomerRemovalEnabled=false;if(reason==='token')payload.networkRemovalToken='invalid';if(reason==='consent')payload.confirmDevices=false;if(reason==='expiry')f.options.now+=300001;if(reason==='new-modem')f.modem.id='replacement';await assert.rejects(removal.execute(f.data,'user',payload,f.actor,f.options));assert.equal(f.counter.olt,0,reason);}
});
test('partial failure keeps billing data and records a resumable exact OLT position',async()=>{
 const f=fixture();f.options.removeOlt=async()=>{f.onus=[];return{complete:false,olt:{state:'deleted'},acs:{state:'failed'}};};const plan=await f.preview(),result=await f.execute(plan);assert(!result.complete);assert.equal(f.counter.final,0);assert.equal(f.data.customers.length,1);assert.equal(f.data.networkRemovalRecords[0].status,'partial');
 const retry=await f.preview();assert(retry.canSubmit);f.options.removeOlt=async()=>({complete:true,olt:{state:'missing'},acs:{state:'deleted'}});assert((await f.execute(retry)).complete);assert.equal(f.counter.final,1);
});
test('partial ACS deletion verification never finalizes or retries a newly returning record',async()=>{
 const f=fixture();f.data.oltDevices=[];f.options.removeAcs=async()=>{f.counter.acs++;};const result=await f.execute(await f.preview());assert(!result.complete);assert.equal(result.acs.state,'pending');assert.equal(f.counter.final,0);assert.equal(f.counter.acs,1);
});
test('parallel confirmation locks the customer through finalization and releases on failure',async()=>{
 const f=fixture(),plan=await f.preview();let release,started;const ready=new Promise(resolve=>{started=resolve;});f.options.removeOlt=async()=>{started();await new Promise(resolve=>{release=resolve;});return{complete:false,olt:{state:'failed'},acs:{state:'skipped'}};};const first=f.execute(plan);await ready;await assert.rejects(f.execute(plan),/sedang berjalan/);assert.throws(()=>removal.assertNotBusy('user'));release();await first;removal.assertNotBusy('user');
});
test('concurrent previews coalesce one account lookup instead of flooding ACS',async()=>{
 const f=fixture();let reads=0;f.options.findAccount=async()=>{reads++;await new Promise(resolve=>setTimeout(resolve,5));return[f.modem];};const plans=await Promise.all(Array.from({length:20},()=>f.preview()));assert.equal(reads,1);assert(plans.every(row=>row.token===plans[0].token));
});
