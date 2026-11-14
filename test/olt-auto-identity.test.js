'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
process.env.REDIS_CACHE='0';
const auto=require('../src/olt-auto-identity'),olt=require('../src/olt-monitor'),service=require('../src/service-tickets'),acs=require('../src/genieacs');
const sn='HWTCAABBCCDD';
function fixture(){const now=Date.now(),data={updatedAt:'v1',settings:{networkIntegrationEnabled:true,genieAcs:{enabled:true,baseUrl:'http://192.0.2.90:7557'}},customers:[{id:'a',name:'Alpha',username:'alpha@isp',nasId:'n1',address:'Street A',phone:'081200000001',latitude:-0.5,longitude:117.1,fiberPointId:'p1'}],radiusUsers:[{id:'u1',customerId:'a',username:'alpha@isp',nasId:'n1',status:'isolated'}],monitoringTargets:[{id:'n1',name:'NAS A'},{id:'n2',name:'NAS B'}],radiusNas:[],fiberPoints:[{id:'p1',name:'ODP A'}],oltDevices:[{id:'o1',name:'OLT A',enabled:true,nasId:'n1',links:{}}],oltTickets:[],invoices:[{id:'old-invoice',amount:150000}],waMessages:[]};
 const onu={id:'4718593',slot:0,pon:1,onuId:1,ponKey:'0/0/1',serialNumber:sn,status:'online',name:'Unrelated description'};
 const observations=[{device:data.oltDevices[0],snapshot:{status:'online',checkedAt:new Date(now).toISOString(),onus:[onu]}}],row={id:'acs-a',serialNumber:sn,username:'alpha@isp',lastInform:new Date(now).toISOString(),registered:new Date(now-86400000).toISOString(),tags:[]};return {data,onu,observations,row,now};}
async function warm(f,rows=[f.row],extra={}){return auto.refresh(f.data,f.observations,{fetch:async()=>rows,now:f.now,allowDemo:true,...extra});}
test.beforeEach(()=>auto.invalidate());
test('automatic integration is opt-in for new and legacy settings and disabling it immediately hides automatic identities',async()=>{
 const f=fixture();for(const value of [undefined,false,'true',1,null]){f.data.settings.networkIntegrationEnabled=value;let reads=0;assert((await warm(f,[f.row],{fetch:async()=>{reads++;return[f.row];}})).skipped);assert.equal(reads,0);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);}
 f.data.settings.networkIntegrationEnabled=true;await warm(f);assert(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now));f.data.settings.networkIntegrationEnabled=false;assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);assert.equal(service.ticketLocation(f.data,{customerId:'a'}).name,'Alpha');
});
test('disabling integration while a source read is pending cannot expose its eventual result',async()=>{
 const f=fixture();let finish;const pending=warm(f,[f.row],{fetch:()=>new Promise(resolve=>{finish=resolve;})});f.data.settings.networkIntegrationEnabled=false;auto.invalidate();finish([f.row]);await pending;assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);f.data.settings.networkIntegrationEnabled=true;assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);
});
test('automatic OLT and ACS serial/account matching exposes current member without writing links or member/financial data',async()=>{
 const f=fixture(),before=structuredClone(f.data);assert((await warm(f)).ok);const match=auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now);assert.equal(match.customer.id,'a');assert.equal(match.account.username,'alpha@isp');assert.equal(match.customer.address,'Street A');assert.deepEqual(f.data,before);
 const row=olt.linkedOnus(f.data,f.data.oltDevices[0],[f.onu])[0];assert.equal(row.customerName,'Alpha');assert.equal(row.fiberPointName,'ODP A');assert.equal(row.name,'Unrelated description');
 const ticket={id:'t1',oltId:'o1',serialNumber:sn,status:'new',createdAt:new Date(f.now).toISOString()};const location=service.ticketLocation(f.data,ticket);assert.equal(location.name,'Alpha');assert.equal(location.address,'Street A');assert(location.locationUrl.includes('destination='));assert.deepEqual(f.data,before);
});
test('both integrations must be configured and a fresh successful OLT snapshot must exist before any ACS read',async()=>{
 for(const type of ['acs-disabled','no-olt','olt-disabled','no-snapshot','old-snapshot','failed-snapshot','pending-refresh']){const f=fixture();if(type==='acs-disabled')f.data.settings.genieAcs.enabled=false;if(type==='no-olt')f.data.oltDevices=[];if(type==='olt-disabled')f.data.oltDevices[0].enabled=false;if(type==='no-snapshot')f.observations[0].snapshot=null;if(type==='old-snapshot')f.observations[0].snapshot.checkedAt=new Date(f.now-400000).toISOString();if(type==='failed-snapshot')f.observations[0].snapshot.status='unreachable';if(type==='pending-refresh')f.observations[0].snapshot.pendingRefresh=true;let calls=0;const response=await warm(f,[f.row],{fetch:async()=>{calls++;return[f.row];}});assert(response.skipped,type);assert.equal(calls,0,type);}
});
test('missing member account, foreign NAS, partial username, unrelated description and malformed/future ACS time never identify a customer',async()=>{
 for(const type of ['partial','foreign','no-member','no-account','missing-time','future']){auto.invalidate();const f=fixture();if(type==='partial')f.row.username='alpha@isp-other';if(type==='foreign')f.row.tags=['n2'];if(type==='no-member')f.data.customers=[];if(type==='no-account')f.data.radiusUsers=[];if(type==='missing-time')f.row.lastInform='';if(type==='future')f.row.lastInform=new Date(f.now+60000).toISOString();await warm(f);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null,type);}
});
test('replacement and reused hardware cannot inherit a conflicting saved customer serial or explicit manual owner',async()=>{
 const f=fixture();f.data.customers.push({id:'b',name:'Beta',username:'beta@isp',nasId:'n1',genieAcsSerialNumber:sn});f.data.radiusUsers.push({id:'u2',customerId:'b',username:'beta@isp',nasId:'n1'});await warm(f);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);
 delete f.data.customers[1].genieAcsSerialNumber;f.data.oltDevices[0].links[sn]={customerId:'b'};require('../src/network-identity').invalidate();assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);
});
test('duplicate physical locations choose a unique online ONU only, never an old Other row or first equal serial',async()=>{
 const f=fixture(),old={...f.onu,id:'4722711',pon:2,ponKey:'0/0/2',onuId:23,status:'offline'};f.observations[0].snapshot.onus.push(old);await warm(f);assert(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now));assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],old,f.now),null);
 old.status='online';await warm(f);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);
 f.observations[0].snapshot.onus.forEach(row=>row.status='offline');await warm(f);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],old,f.now),null);
});
test('duplicate ACS devices and account ownership stay ambiguous unless one exact device is currently online',async()=>{
 const f=fixture(),other={...f.row,id:'acs-other'};await warm(f,[f.row,other]);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);
 auto.invalidate();other.lastInform='2020-01-01T00:00:00Z';await warm(f,[other,f.row]);assert(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now));
});
test('cache coalesces one background request, enforces cadence, and never needs a request during list projection',async()=>{
 const f=fixture();let calls=0;const fetch=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,2));return[f.row];};await Promise.all(Array.from({length:20},()=>warm(f,[f.row],{fetch})));assert.equal(calls,1);
 for(let i=0;i<2000;i++)assert(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now));await warm(f,[f.row],{fetch});assert.equal(calls,1);
 await warm(f,[f.row],{fetch,now:f.now+auto.INTERVAL_MS});assert.equal(calls,2);
});
test('source failure clears automatic disclosure without touching manual links or creating a false fault',async()=>{
 const f=fixture();await warm(f);assert(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now));await warm(f,[],{now:f.now+auto.INTERVAL_MS,fetch:async()=>{throw Error('PRIVATE connection failure');}});assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now+auto.INTERVAL_MS),null);assert.deepEqual(f.data.oltTickets,[]);assert.deepEqual(f.data.waMessages,[]);
 f.data.oltDevices[0].links[sn]={customerId:'a'};assert.equal(olt.linkedOnus(f.data,f.data.oltDevices[0],[f.onu])[0].customerName,'Alpha');
});
test('member edits and account changes are resolved against current data rather than cached personal information',async()=>{
 const f=fixture();await warm(f);f.data.customers[0].address='Updated address';f.data.customers[0].phone='081200000002';assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now).customer.address,'Updated address');f.data.radiusUsers[0].username='different-account';require('../src/network-identity').invalidate();assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);
});
test('missing OLT or ACS is safe for manual tickets and disabling an integration prevents auto matches immediately',async()=>{
 const f=fixture();await warm(f);f.data.settings.genieAcs.enabled=false;assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);assert.equal(service.ticketLocation(f.data,{customerId:'a'}).address,'Street A');
 f.data.oltDevices=[];assert((await warm(f)).skipped);assert.equal(service.ticketLocation(f.data,{customerName:'Prospect',contactAddress:'Manual address'}).address,'Manual address');
});
test('historical tickets never change owner when a modem is reused and a newly registered modem cannot enrich an older unowned ticket',async()=>{
 const f=fixture();await warm(f);const ticket={serialNumber:sn,status:'new',createdAt:new Date(f.now-172800000).toISOString()};assert.equal(auto.customerForTicket(f.data,ticket,f.data.oltDevices[0],f.now),null);
 ticket.createdAt=new Date(f.now).toISOString();assert(auto.customerForTicket(f.data,ticket,f.data.oltDevices[0],f.now));ticket.customerId='different-member';assert.equal(auto.customerForTicket(f.data,ticket,f.data.oltDevices[0],f.now),null);delete ticket.customerId;ticket.status='resolved';assert.equal(auto.customerForTicket(f.data,ticket,f.data.oltDevices[0],f.now),null);
});
test('source bound and invalid responses never leave partial automatic mappings',async()=>{
 const f=fixture();for(const value of [{rows:[f.row]},null,Array.from({length:10001},()=>f.row)]){auto.invalidate();assert.equal((await warm(f,value)).ok,false);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);}
});
test('ACS identity collector uses one bounded GET without credentials, hosts, WiFi or CWMP task refresh',async t=>{
 const f=fixture();let calls=0;t.mock.method(global,'fetch',async(url,options)=>{calls++;assert.equal(options.method,'GET');const parsed=new URL(url),projection=parsed.searchParams.get('projection');assert.equal(parsed.pathname,'/devices/');assert.equal(parsed.searchParams.get('limit'),'10001');assert(!/Password|WLANConfiguration|\.Hosts|RXPower|Temperature/i.test(projection));assert(projection.includes('VirtualParameters.pppoeUsername'));return Response.json([{_id:'acs-a',_deviceId:{_SerialNumber:'48575443AABBCCDD'},_lastInform:new Date(f.now).toISOString(),VirtualParameters:{pppoeUsername:{_value:'alpha@isp'}},password:'PRIVATE'}]);});
 const rows=await acs.identityDevices(f.data.settings);assert.equal(calls,1);assert.equal(rows[0].serialNumber,sn);assert.equal(rows[0].username,'alpha@isp');assert(!JSON.stringify(rows).includes('PRIVATE'));assert.deepEqual(await acs.identityDevices({genieAcs:{enabled:false}}),[]);assert.equal(calls,1);
});
test('a proven modem move suppresses stale manual customer details everywhere except the fixed historical owner',async()=>{
 const f=fixture();f.data.customers.push({id:'b',name:'Private Beta',username:'beta@isp',nasId:'n1',address:'Private address',phone:'081299999999'});f.data.radiusUsers.push({id:'u2',customerId:'b',username:'beta@isp',nasId:'n1'});f.data.oltDevices[0].links[sn]={customerId:'b'};await warm(f);
 const device=f.data.oltDevices[0],ticket={id:'conflict',source:'olt-los',scope:'onu',oltId:device.id,serialNumber:sn,status:'new',createdAt:new Date(f.now).toISOString()};
 assert(auto.manualConflict(f.data,device,f.onu));assert.equal(auto.manualCustomerFor(f.data,device,f.onu),null);assert.equal(olt.linkedOnus(f.data,device,[f.onu])[0].customerName,'');assert.equal(service.ticketLocation(f.data,ticket).address,'');assert(!olt.renderTicketTemplate(f.data,ticket).includes('Private'));
 const context=await require('../src/ticket-network').context(f.data,ticket,[device],{snapshot:async()=>f.observations[0].snapshot});assert.equal(context.customer.name,'');assert.equal(context.ownerVerified,false);
 const history=service.ticketLocation(f.data,{...ticket,customerId:'b',status:'resolved'});assert.equal(history.address,'Private address');assert.equal(history.name,'Private Beta');
});
test('identity refresh and ACS credential changes invalidate cached detail immediately without an account leak',async()=>{
 const f=fixture(),device=f.data.oltDevices[0],ticket={id:'cached-auto',oltId:device.id,serialNumber:sn,status:'new',createdAt:new Date(f.now).toISOString()};const network=require('../src/ticket-network'),options={snapshot:async()=>f.observations[0].snapshot};
 await warm(f);assert.equal((await network.context(f.data,ticket,[device],options)).customer.name,'Alpha');const version=auto.cacheVersion(f.data);
 f.data.settings.genieAcs.token='changed-private-token';assert.notEqual(auto.cacheVersion(f.data),version);assert.equal((await network.context(f.data,ticket,[device],options)).customer.name,'');
 await warm(f);assert.equal((await network.context(f.data,ticket,[device],options)).customer.name,'Alpha');
 f.observations[0].snapshot.status='unreachable';await warm(f);assert.equal((await network.context(f.data,ticket,[device],options)).customer.name,'');
});
test('a foreign manual NAS cannot supply contact information even with no ACS available',()=>{
 const f=fixture();f.data.settings.genieAcs.enabled=false;f.data.oltDevices[0].links[sn]={customerId:'a'};f.data.customers[0].nasId='n2';f.data.radiusUsers[0].nasId='n2';
 assert.equal(service.ticketLocation(f.data,{oltId:'o1',serialNumber:sn,status:'new'}).address,'');assert.equal(auto.manualCustomerFor(f.data,f.data.oltDevices[0],f.onu),null);
});
test('automatic identity expires and closed or relocated ticket history is not reassigned',async()=>{
 const f=fixture();await warm(f);const device=f.data.oltDevices[0],ticket={serialNumber:sn,customerId:'a',status:'new',createdAt:new Date(f.now).toISOString()};
 assert.equal(auto.customerFor(f.data,device,f.onu,f.now+auto.TTL_MS+1),null);assert.equal(auto.customerForTicket(f.data,{...ticket,pon:'0/0/9'},device,f.now),null);assert.equal(auto.customerForTicket(f.data,{...ticket,onuIndex:'99999'},device,f.now),null);
});
test('an account on a replacement serial never enriches the old modem and ambiguous active copies are not guessed',async()=>{
 const f=fixture(),replacement={...f.onu,id:'4718594',onuId:2,serialNumber:'HWTC11223344'};f.observations[0].snapshot.onus.push(replacement);const old={...f.row,lastInform:'2020-01-01T00:00:00Z'},newRow={...f.row,id:'acs-replacement',serialNumber:replacement.serialNumber};
 await warm(f,[old,newRow]);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);assert(auto.customerFor(f.data,f.data.oltDevices[0],replacement,f.now));
 auto.invalidate();await warm(f,[f.row,newRow]);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],replacement,f.now),null);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);
 auto.invalidate();f.observations[0].snapshot.onus=[f.onu];await warm(f,[old,newRow]);assert.equal(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now),null);
});
test('oversized ACS responses are rejected before JSON parsing',async t=>{
 const f=fixture();t.mock.method(global,'fetch',async()=>new Response('[]',{headers:{'content-length':String(9*1024*1024)}}));await assert.rejects(()=>acs.identityDevices(f.data.settings),/batas aman/);
});
test('changing OLT host or NAS immediately invalidates an older position proof',async()=>{
 const f=fixture();await warm(f);const device=f.data.oltDevices[0];assert(auto.customerFor(f.data,device,f.onu,f.now));device.host='192.0.2.91';assert.equal(auto.customerFor(f.data,device,f.onu,f.now),null);
});
test('repeated list reads reuse bounded identity proofs and a new source observation invalidates them',async t=>{
 const f=fixture(),identity=require('../src/network-identity'),original=identity.strictDeviceCandidate;let checks=0;t.mock.method(identity,'strictDeviceCandidate',(...args)=>{checks++;return original(...args);});await warm(f);
 for(let i=0;i<100;i++)assert(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now));assert.equal(checks,2);
 await warm(f);assert(auto.customerFor(f.data,f.data.oltDevices[0],f.onu,f.now));assert.equal(checks,4);
});
