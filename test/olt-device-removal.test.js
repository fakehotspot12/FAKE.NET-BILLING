'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
process.env.REDIS_CACHE='0';
const removal=require('../src/olt-device-removal'),olt=require('../src/olt-monitor'),store=require('../src/store');
const SN='HWTCAABBCCDD',INDEX='4718593',NOW=Date.parse('2026-11-14T04:00:00Z');
function fixture(){
 const data=store.createDefaultStore(),actor={id:'admin',role:'admin',active:true};data.users=[actor];
 data.settings.networkIntegrationEnabled=true;data.settings.genieAcs={enabled:true,baseUrl:'http://192.0.2.90:7557'};
 data.monitoringTargets=[{id:'nas-a',name:'NAS A'},{id:'nas-b',name:'NAS B'}];data.radiusNas=[];
 data.customers=[{id:'customer',name:'Demo'}];data.radiusUsers=[{id:'account',username:'demo@isp',customerId:'customer',nasId:'nas-a'}];
 data.invoices=[{id:'invoice',amount:150000}];data.payments=[{id:'payment',amount:150000}];data.oltTickets=[{id:'ticket'}];
 const device=olt.validateDevice(data,{name:'Unit',host:'192.0.2.30',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit'});device.nasId='nas-a';data.oltDevices=[device];
 const target={id:INDEX,serialNumber:SN,...olt.position(INDEX)},counter={olt:0,acs:0,reads:0};
 let rows=[{id:'unit-'+SN,serialNumber:SN,username:'demo@isp',lastInform:new Date(NOW-3600000).toISOString(),registered:'2026-01-01T00:00:00Z',tags:[]}],status='offline';
 const options={now:NOW,inspectOlt:async()=>({target,state:status}),snapshot:async()=>null,findAcs:async()=>{counter.reads++;return structuredClone(rows);},removeOlt:async(_,__,___,payload,transport)=>{assert(transport.requireOffline);assert(transport.allowMissing);assert.equal(payload.onuIndex,INDEX);counter.olt++;const absent=status==='missing';status='missing';return{confirmed:true,alreadyAbsent:absent};},removeAcs:async()=>{counter.acs++;rows=[];}};
 const preview=()=>removal.preview(data,device,SN,{onuIndex:INDEX},actor,options);
 const remove=plan=>removal.remove(data,device,SN,{token:plan.token,serialNumber:SN,onuIndex:INDEX,confirmDelete:true},actor,options);
 return {data,device,actor,target,options,counter,preview,remove,get rows(){return rows;},set rows(value){rows=value;},get status(){return status;},set status(value){status=value;}};
}
test.beforeEach(()=>{process.env.MIGRATION_MODE='0';removal.invalidate();});
test('preview is read-only; exact offline OLT then ACS deletion leaves all business data unchanged',async()=>{
 const f=fixture(),before=structuredClone(f.data),plan=await f.preview();assert(plan.canSubmit);assert.equal(plan.acs.state,'ready');assert.deepEqual(f.counter,{olt:0,acs:0,reads:1});
 const result=await f.remove(plan);assert(result.complete);assert.equal(result.olt.state,'deleted');assert.equal(result.acs.state,'deleted');assert.equal(f.counter.olt,1);assert.equal(f.counter.acs,1);assert.deepEqual(f.data,before);
 assert.deepEqual(await f.remove(plan),result);assert.equal(f.counter.olt,1);assert.equal(f.counter.acs,1);
});
for(const [name,status,rows,expectedOlt,expectedAcs]of [['only OLT','offline',false,'deleted','missing'],['only ACS','missing',true,'missing','deleted'],['neither source','missing',false,'missing','missing']])test(name+' is verified and completed without requiring both records',async()=>{
 const f=fixture();f.status=status;if(!rows)f.rows=[];const result=await f.remove(await f.preview());assert(result.complete);assert.equal(result.olt.state,expectedOlt);assert.equal(result.acs.state,expectedAcs);assert.equal(f.counter.acs,rows?1:0);
});
test('integration off never reads or deletes ACS',async()=>{
 const f=fixture();f.data.settings.networkIntegrationEnabled=false;f.options.findAcs=async()=>{throw Error('must not read');};const plan=await f.preview(),result=await f.remove(plan);assert(!plan.cascade);assert(result.complete);assert.equal(result.acs.state,'skipped');assert.equal(f.counter.acs,0);
});
for(const status of ['online','unknown'])test(status+' selected ONU is blocked before any deletion',async()=>{const f=fixture();f.status=status;const plan=await f.preview();assert(!plan.canSubmit);assert.equal(plan.token,'');assert.equal(f.counter.reads,0);assert.equal(f.counter.olt,0);});
test('OLT timeout and ACS timeout are never reported as a missing record',async()=>{
 const f=fixture();f.options.inspectOlt=async()=>{throw Error('private timeout');};let plan=await f.preview();assert(!plan.canSubmit);assert.equal(plan.olt.state,'unavailable');assert(!JSON.stringify(plan).includes('private'));
 const g=fixture();g.options.findAcs=async()=>{throw Error('private endpoint');};plan=await g.preview();assert(!plan.canSubmit);assert.equal(plan.acs.state,'unavailable');assert.equal(g.counter.olt,0);
});
test('disabled or ambiguous ACS blocks a combined deletion',async()=>{
 const f=fixture();f.data.settings.genieAcs.enabled=false;assert(!(await f.preview()).canSubmit);
 const g=fixture();g.rows=[...g.rows,...g.rows];assert.equal((await g.preview()).acs.state,'unknown');assert(!(await g.preview()).canSubmit);
});
for(const reason of ['recent','future','invalid','foreign-nas','foreign-account','excluded','changed-owner','active-other-position','stale-other-position'])test(reason+' protects ACS while allowing only the old offline OLT registration',async()=>{
 const f=fixture();if(reason==='recent')f.rows[0].lastInform=new Date(NOW).toISOString();if(reason==='future')f.rows[0].lastInform=new Date(NOW+60000).toISOString();if(reason==='invalid')f.rows[0].lastInform='';
 if(reason==='foreign-nas')f.rows[0].tags=['nas-b'];if(reason==='foreign-account')f.data.radiusUsers[0].nasId='nas-b';if(reason==='excluded')f.rows[0].excluded=true;
 if(reason==='changed-owner')f.device.links={[SN]:{customerId:'someone-else'}};
 if(reason.includes('other-position'))f.options.snapshot=async()=>({status:'online',checkedAt:new Date(NOW).toISOString(),stale:reason.startsWith('stale'),onus:[{id:'4718594',serialNumber:SN,status:'online'}]});
 const plan=await f.preview();assert(plan.canSubmit);assert.equal(plan.acs.state,'preserved');const result=await f.remove(plan);assert(result.complete);assert(result.warning);assert.equal(result.acs.state,'preserved');assert.equal(f.counter.acs,0);assert.equal(f.counter.olt,1);
 f.status='missing';assert(!(await f.preview()).canSubmit);
});
test('OLT failure or unconfirmed result never starts ACS deletion',async()=>{
 for(const fail of [true,false]){const f=fixture();f.options.removeOlt=async()=>{if(fail)throw Error('timeout');return{confirmed:false};};const result=await f.remove(await f.preview());assert(!result.complete);assert.equal(result.acs.state,'skipped');assert.equal(f.counter.acs,0);}
});
test('partial ACS failure can be retried after OLT record has gone; old token never deletes twice',async()=>{
 const f=fixture(),original=f.options.removeAcs;f.options.removeAcs=async()=>{throw Error('timeout');};const plan=await f.preview(),result=await f.remove(plan);assert(result.partial);assert.equal(result.acs.state,'failed');assert.equal(f.counter.olt,1);assert.deepEqual(await f.remove(plan),result);assert.equal(f.counter.olt,1);
 f.options.removeAcs=original;const retry=await f.preview();assert.equal(retry.olt.state,'missing');const second=await f.remove(retry);assert(second.complete);assert.equal(second.olt.state,'missing');assert.equal(f.counter.acs,1);
});
test('ACS disappear after preview is allowed, but a new ACS registration is protected',async()=>{
 const f=fixture(),plan=await f.preview();f.rows=[];const result=await f.remove(plan);assert(result.complete);assert.equal(result.acs.state,'missing');assert.equal(f.counter.acs,0);
 const g=fixture();g.rows=[];const empty=await g.preview();g.rows=[{id:'new-'+SN,serialNumber:SN,lastInform:new Date(NOW-3600000).toISOString()}];const held=await g.remove(empty);assert.equal(held.acs.state,'preserved');assert.equal(g.counter.acs,0);
});
test('ACS identity changes between preview and confirmation abort before touching OLT',async()=>{
 const f=fixture(),plan=await f.preview();f.rows[0].id='new';await assert.rejects(f.remove(plan),/Identitas ACS berubah/);assert.equal(f.counter.olt,0);assert.equal(f.counter.acs,0);
});
for(const change of ['flag','source','role','nas-scope','expiry','position','token'])test(change+' invalidates destructive confirmation',async()=>{
 const f=fixture(),plan=await f.preview();if(change==='flag')f.data.settings.networkIntegrationEnabled=false;if(change==='source')f.data.settings.genieAcs.baseUrl='http://192.0.2.91:7557';if(change==='role')f.actor.role='viewer';if(change==='nas-scope'){f.actor.role='technician';f.actor.lockedNasIds=['nas-b'];}if(change==='expiry')f.options.now=NOW+300001;if(change==='position')plan.token='wrong-position';if(change==='token')plan.token='bad';await assert.rejects(f.remove(plan));assert.equal(f.counter.olt,0);assert.equal(f.counter.acs,0);
});
test('concurrent confirmations lock exact OLT position and SN',async()=>{
 const f=fixture(),plan=await f.preview(),original=f.options.removeOlt;let start,release;const started=new Promise(resolve=>start=resolve),gate=new Promise(resolve=>release=resolve);f.options.removeOlt=async(...args)=>{start();await gate;return original(...args);};const first=f.remove(plan);await started;await assert.rejects(f.remove(plan),/sedang diproses/);release();assert((await first).complete);assert.equal(f.counter.olt,1);
});
test('a modem returning after deletion is preserved without an automatic repeated delete',async()=>{
 const f=fixture();f.options.removeAcs=async()=>{f.counter.acs++;};const result=await f.remove(await f.preview());assert(result.warning);assert.equal(result.acs.state,'preserved');assert.equal(f.counter.acs,1);
});
test('source or permissions revoked after OLT completion prevents ACS deletion',async()=>{
 for(const kind of ['source','permission']){const f=fixture();f.options.getData=async()=>{const next=structuredClone(f.data);if(kind==='source')next.settings.genieAcs.baseUrl='http://192.0.2.99:7557';else next.users[0].role='viewer';return next;};const result=await f.remove(await f.preview());assert(result.partial);assert.equal(f.counter.acs,0);}
});
test('demo mode cannot perform real removal even with a previously valid token',async()=>{
 const f=fixture(),plan=await f.preview();process.env.MIGRATION_MODE='1';await assert.rejects(f.remove(plan),/Mode dev terisolasi/);assert.equal(f.counter.olt,0);
});
