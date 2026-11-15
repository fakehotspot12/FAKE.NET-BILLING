'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const network=require('../src/ticket-network');
const sn='HWTCAABBCCDD';
function fixture(){return {updatedAt:'r1',settings:{genieAcs:{enabled:false}},customers:[{id:'member-a',code:'12345678901',name:'Real Customer',username:'alpha@isp',nasId:'n1',fiberPointId:'odp-a',password:'PRIVATE_CUSTOMER'}],radiusUsers:[{id:'user-a',customerId:'member-a',username:'alpha@isp',nasId:'n1',service:'pppoe',status:'isolated',password:'PRIVATE_RADIUS'}],radiusNas:[{id:'n1',name:'NAS A'},{id:'n2',name:'NAS B'}],oltDevices:[{id:'olt-a',name:'OLT A',nasId:'n1',links:{[sn]:{customerId:'member-a',fiberPointId:'odp-a'}},communityEnc:'PRIVATE_SNMP'}],fiberPoints:[{id:'odp-a',code:'ODP-01',name:'Area A'}],invoices:[{amount:150000}],waMessages:[]};}
const ticket=()=>({id:'ticket-a',source:'olt-los',scope:'onu',oltId:'olt-a',serialNumber:sn,pon:'0/0/1',customerName:'RAW_DESCRIPTION_NOT_A_CUSTOMER'});
const snapshot=async()=>({onus:[{serialNumber:sn,ponKey:'0/0/1',onuId:8,model:'HG8145V5',name:'RAW_DESCRIPTION'}]});
test('different ticket popups for one identity share a bounded ACS lookup and credentials changes invalidate it',async t=>{
 const data=fixture();data.settings.genieAcs={enabled:true,baseUrl:'http://192.0.2.99:7557',token:'unit-lookup-v1'};const acs=require('../src/genieacs');let reads=0;t.mock.method(acs,'findBestDevice',async()=>{reads++;await new Promise(resolve=>setTimeout(resolve,10));return{id:'acs-a',serialNumber:sn,username:'alpha@isp'};});
 const first={...ticket(),id:'shared-lookup-one'},second={...ticket(),id:'shared-lookup-two'};const values=await Promise.all([network.context(data,first,data.oltDevices,{snapshot}),network.context(data,second,data.oltDevices,{snapshot})]);assert.equal(reads,1);assert(values.every(row=>row.ownerVerified));assert.equal((await network.context(data,{...ticket(),id:'shared-lookup-three'},data.oltDevices,{snapshot})).customer.name,'Real Customer');assert.equal(reads,1);
 data.settings.genieAcs.token='unit-lookup-v2';await network.context(data,{...ticket(),id:'shared-lookup-four'},data.oltDevices,{snapshot});assert.equal(reads,2);
});

test('ticket joins exact SN, ACS account, member, OLT PON and mapped ODP without exposing credentials or ONU number',async()=>{
 const data=fixture(),before=structuredClone(data);let reads=0;
 const result=await network.context(data,ticket(),data.oltDevices,{snapshot,lookup:async(store,selector)=>{reads++;assert.equal(selector.sn,sn);assert.equal(selector.nasId,'n1');return {id:'acs-a',serialNumber:sn,username:'alpha@isp',productClass:'HG8145V5',password:'PRIVATE_ACS'};}});
 assert.equal(reads,1);assert.equal(result.customer.name,'Real Customer');assert.equal(result.customer.memberId,'12345678901');assert.equal(result.account.username,'alpha@isp');assert.equal(result.account.status,'isolated');assert.equal(result.modem.serialNumber,sn);assert.deepEqual(result.network,{olt:'OLT A',pon:'0/0/1',odp:'ODP-01 - Area A'});assert.equal(result.ownerVerified,true);assert.equal(result.acsMatched,true);
 assert(!JSON.stringify(result).includes('PRIVATE'));assert(!JSON.stringify(result).includes('onuId'));assert(!JSON.stringify(result).includes('RAW_DESCRIPTION'));assert.deepEqual(data,before);
});

test('member-origin report resolves its device and cached OLT location without requiring a manually selected OLT',async()=>{
 const data=fixture(),report={id:'service-a',scope:'service',source:'wifiku',customerId:'member-a',nasId:'n1'};
 const result=await network.context(data,report,data.oltDevices,{snapshot,lookup:async()=>({id:'acs-a',username:'alpha@isp',serialNumber:sn,productClass:'HG8145V5'})});
 assert.equal(result.customer.name,'Real Customer');assert.equal(result.modem.serialNumber,sn);assert.equal(result.network.olt,'OLT A');assert.equal(result.network.odp,'ODP-01 - Area A');
});

test('ACS is optional and outage falls back to explicit member links and cached topology, without writes',async()=>{
 const data=fixture(),before=structuredClone(data);
 const result=await network.context(data,ticket(),data.oltDevices,{snapshot,lookup:async()=>{throw new Error('PRIVATE_ACS_ERROR');}});
 assert.equal(result.customer.name,'Real Customer');assert.equal(result.account.username,'alpha@isp');assert.equal(result.modem.model,'HG8145V5');assert.equal(result.acsMatched,false);assert.deepEqual(data,before);
});

test('missing mappings stay empty and neither ONU description nor similar names or IPs become customer ownership',async()=>{
 const data=fixture();data.oltDevices[0].links={};
 const result=await network.context(data,ticket(),data.oltDevices,{snapshot,lookup:async()=>null});
 assert.equal(result.customer.name,'');assert.equal(result.account.username,'');assert.equal(result.network.odp,'');assert.equal(result.ownerVerified,false);assert.equal(result.network.olt,'OLT A');
 const empty=await network.context(data,{id:'prospect-a',customerName:'Prospect Name',scope:'service'},[],{snapshot,lookup:async()=>{throw new Error('Should not read ACS');}});assert.deepEqual(empty.network,{olt:'',pon:'',odp:''});assert.equal(empty.modem.serialNumber,'');
});

test('non-member RADIUS account is shown without inventing a member and a missing OLT cache does not hide ACS identity',async()=>{
 const data=fixture();data.customers=[];data.radiusUsers[0].customerId='';data.oltDevices[0].links={};
 const result=await network.context(data,ticket(),data.oltDevices,{snapshot:async()=>{throw new Error('Snapshot unavailable');},lookup:async()=>({id:'acs-a',serialNumber:sn,username:'alpha@isp',productClass:'HG8145V5'})});
 assert.equal(result.customer.name,'');assert.equal(result.ownerVerified,false);assert.equal(result.account.username,'alpha@isp');assert.equal(result.account.status,'isolated');assert.equal(result.modem.model,'HG8145V5');assert.equal(result.network.odp,'');
});

test('conflicting ACS ownership never falls back to the stale OLT link or ticket member',async()=>{
 const data=fixture();data.customers.push({id:'member-b',name:'Other Customer',username:'beta@isp',nasId:'n1'});data.radiusUsers.push({id:'user-b',customerId:'member-b',username:'beta@isp',nasId:'n1'});
 const result=await network.context(data,ticket(),data.oltDevices,{snapshot,lookup:async()=>({id:'acs-b',serialNumber:sn,username:'beta@isp'})});
 assert.equal(result.ownerVerified,false);assert.equal(result.customer.name,'');assert.equal(result.account.username,'');
});

test('foreign NAS modem/member cannot be disclosed through an accessible OLT ticket',async()=>{
 const data=fixture();data.customers[0].nasId='n2';data.radiusUsers[0].nasId='n2';
 const result=await network.context(data,ticket(),data.oltDevices,{snapshot,lookup:async()=>({id:'acs-a',serialNumber:sn,username:'alpha@isp',nasId:'n2'})});
 assert.equal(result.customer.name,'');assert.equal(result.account.username,'');assert.equal(result.ownerVerified,false);
});

test('duplicate modem location is not guessed and member ODP aliases use exact IDs only',async()=>{
 const data=fixture();delete data.customers[0].fiberPointId;data.customers[0].odpId='odp-a';data.oltDevices.push({...data.oltDevices[0],id:'olt-b',name:'OLT B'});
 const result=await network.context(data,{id:'service-b',customerId:'member-a',scope:'service'},data.oltDevices,{snapshot,lookup:async()=>({id:'acs-a',serialNumber:sn,username:'alpha@isp'})});
 assert.equal(result.network.olt,'');assert.equal(result.network.pon,'');assert.equal(result.network.odp,'ODP-01 - Area A');
});

test('identical detail reads coalesce, cache defensively and invalidate after member edits',async()=>{
 const data=fixture();let reads=0;const options={snapshot:async()=>{reads++;await new Promise(resolve=>setTimeout(resolve,10));return snapshot();}};
 const [a,b]=await Promise.all([network.context(data,ticket(),data.oltDevices,options),network.context(data,ticket(),data.oltDevices,options)]);assert.equal(reads,1);a.customer.name='MODIFIED_RESPONSE';assert.equal(b.customer.name,'Real Customer');assert.equal((await network.context(data,ticket(),data.oltDevices,options)).customer.name,'Real Customer');assert.equal(reads,1);
 data.updatedAt='r2';data.customers[0].name='Updated Customer';assert.equal((await network.context(data,ticket(),data.oltDevices,options)).customer.name,'Updated Customer');assert.equal(reads,2);
});
