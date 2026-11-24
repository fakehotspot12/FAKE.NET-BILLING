'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const olt=require('../src/olt-monitor'),network=require('../src/ticket-network'),auto=require('../src/olt-auto-identity'),acs=require('../src/genieacs');
process.env.REDIS_CACHE='0';
function fixture(){
 const now=Date.now(),sn='HWTCAABBCCDD',device={id:'olt',name:'Unit OLT',vendor:'cdata',enabled:true,nasId:'n1',updatedAt:'rev',links:{}},onu={id:'4718593',serialNumber:sn,ponKey:'0/0/1',status:'offline',condition:'los',causeKnown:true,downCause:'LOS',rxPower:null};
 const data={settings:{networkIntegrationEnabled:true,timezone:'Asia/Makassar',genieAcs:{enabled:true,baseUrl:'http://192.0.2.90:7557'}},customers:[{id:'a',name:'Unit Customer',username:'unit@isp',nasId:'n1'}],radiusUsers:[{id:'u',customerId:'a',username:'unit@isp',nasId:'n1'}],radiusNas:[],monitoringTargets:[{id:'n1',name:'NAS A'},{id:'n2',name:'NAS B'}],oltDevices:[device],oltTickets:[],fiberPoints:[],users:[],waMessages:[]};
 const modem={id:'acs-a',serialNumber:sn,username:'unit@isp',lastInform:new Date(now).toISOString(),registered:new Date(now-86400000).toISOString(),rxPowerValue:-24.75,rxPowerAt:new Date(now-60000).toISOString(),tags:[]};
 const ticket={id:'ticket',source:'olt-los',scope:'onu',oltId:device.id,serialNumber:sn,onuIndex:onu.id,pon:onu.ponKey,customerId:'a',status:'new',createdAt:new Date(now).toISOString()};
 return{data,device,onu,modem,ticket,now};
}
async function warm(f,rows=[f.modem]){auto.invalidate();return auto.refresh(f.data,[{device:f.device,snapshot:{status:'online',checkedAt:new Date(f.now).toISOString(),onus:[f.onu]}}],{fetch:async()=>rows,now:f.now,allowDemo:true});}
test('LOS messages use cached exact ACS identity when no valid OLT optical snapshot exists',async()=>{
 const f=fixture();await warm(f);const before=structuredClone(f.data),value=network.optical(f.data,f.ticket,{now:f.now});assert.equal(value.source,'ACS');assert.equal(value.rxPower,-24.75);assert.equal(value.at,f.modem.rxPowerAt);assert.deepEqual(f.data,before);
 const message=olt.renderTicketTemplate(f.data,f.ticket);assert.match(message,/Redaman terakhir: -24,75 dBm \(ACS; data/);assert(!message.includes('[last_rx]'));
});
test('valid last OLT reading takes priority over ACS even while the ONU is LOS',async()=>{
 const f=fixture();await warm(f);f.ticket.oltOptical={oltId:'olt',serialNumber:f.onu.serialNumber,onuIndex:f.onu.id,rxPower:-22.5,at:new Date(f.now-120000).toISOString()};
 const value=network.optical(f.data,f.ticket,{now:f.now});assert.equal(value.source,'OLT');assert.equal(value.rxPower,-22.5);assert.match(olt.renderTicketTemplate(f.data,f.ticket),/-22,5 dBm \(OLT;/);
});
test('ACS snapshot is captured when the automatic ticket is created and survives restart without a query',async()=>{
 const f=fixture();f.data.settings.oltTicketing={enabled:true,automaticTicketsEnabled:true,whatsappEnabled:true};await warm(f);const at=f.now;require('./helpers/confirmed-los')(f.data,[{deviceId:'olt',snapshot:{checkedAt:new Date(at).toISOString(),onus:[f.onu]}}]);
 const observation={deviceId:'olt',deviceUpdatedAt:'rev',snapshot:{status:'online',checkedAt:new Date(at).toISOString(),onus:[f.onu],ports:[]}},plan=olt.losTicketPlan(f.data,[observation],{now:at}),result=olt.applyLosTicketPlan(f.data,plan,at);
 assert.equal(result.created.length,1);assert.equal(result.created[0].acsOptical.rxPower,-24.75);auto.invalidate();const saved=JSON.parse(JSON.stringify(result.created[0]));assert.match(olt.renderTicketTemplate(f.data,saved),/-24,75 dBm \(ACS;/);assert.equal(saved.acsOptical.at,f.modem.rxPowerAt);
});
test('invalid optical data, foreign NAS, reused owner, and ambiguous devices never become fallback readings',async()=>{
 for(const type of['zero','positive','missing-time','future-time','before-registration','foreign','different-owner','duplicate']){
  const f=fixture();if(type==='zero')f.modem.rxPowerValue=0;if(type==='positive')f.modem.rxPowerValue=25;if(type==='missing-time')f.modem.rxPowerAt='';if(type==='future-time')f.modem.rxPowerAt=new Date(f.now+60000).toISOString();if(type==='before-registration')f.modem.rxPowerAt=new Date(f.now-172800000).toISOString();if(type==='foreign')f.modem.tags=['n2'];if(type==='different-owner')f.ticket.customerId='other';
  await warm(f,type==='duplicate'?[f.modem,{...f.modem,id:'ambiguous'}]:[f.modem]);assert.equal(network.optical(f.data,f.ticket,{now:f.now}).rxPower,null,type);assert.match(olt.renderTicketTemplate(f.data,f.ticket),/Redaman terakhir: -\n/);
 }
});
test('ordinary/custom templates get one optical line and service/PSB messages do not acquire it',async()=>{
 const f=fixture();await warm(f);const defaults=olt.ticketTemplates(f.data);for(const key of['detected','odpDetected','odcDetected']){f.data.settings.oltTicketing={templates:{[key]:defaults[key].replace('\nRedaman terakhir: [last_rx]','')}};assert(olt.ticketTemplates(f.data)[key].includes('[last_rx]'));}
 for(const detected of['CUSTOM [customer]','CUSTOM\nRedaman terakhir: -']){f.data.settings.oltTicketing={templates:{detected}};const text=olt.renderTicketTemplate(f.data,f.ticket);assert.equal(olt.ticketTemplates(f.data).detected,detected);assert.equal((text.match(/Redaman terakhir:/g)||[]).length,1);assert(text.includes('-24,75 dBm'));}
 const request={...f.ticket,source:'staff-service',scope:'service',category:'new-installation',kind:'request'};assert(!olt.renderTicketTemplate(f.data,request).includes('Redaman terakhir:'));
});
test('group optical summaries show ranges and coverage rather than one supposed ODP reading',()=>{
 const f=fixture(),group={...f.ticket,serialNumber:'',onuIndex:'',scope:'pon',customerId:'',affectedCount:3},at=new Date(f.now-60000).toISOString();
 const candidates=[{serialNumber:'HWTCAABB0001',onuIndex:'1',pon:group.pon,optical:{rxPower:-22,at}},{serialNumber:'HWTCAABB0002',onuIndex:'2',pon:group.pon,optical:{rxPower:-27.5,at}},{serialNumber:'HWTCAABB0003',onuIndex:'3',pon:group.pon,optical:{rxPower:null,at:''}}];
 Object.assign(group,network.captureOptical(f.data,group,candidates,f.now));const text=olt.renderTicketTemplate(f.data,group);assert(text.includes('-27,5 s/d -22 dBm'));assert(text.includes('2/3 ONU; OLT'));
});
test('explicit EPON MAC proof supports the ACS optical fallback without pretending MAC is a GPON serial',async()=>{
 const f=fixture(),mac='AABBCCDDEEFF';Object.assign(f.device,{vendor:'hioso'});Object.assign(f.onu,{identifierKind:'mac',serialNumber:mac,id:'1/1:1:'+mac,ponKey:'0/1/1'});Object.assign(f.ticket,{serialNumber:mac,onuIndex:f.onu.id,pon:f.onu.ponKey});f.modem.interfaceMacs=[mac];f.modem.serialNumber='RTETQB8H0128704';await warm(f);assert.equal(network.optical(f.data,f.ticket,{now:f.now}).source,'ACS');
});
test('ACS optical identity projection is opt-in, bounded, read-only and uses parameter timestamps',async t=>{
 const f=fixture();let calls=0;t.mock.method(global,'fetch',async(url,options)=>{calls++;assert.equal(options.method,'GET');const projection=new URL(url).searchParams.get('projection');assert(projection.includes('VirtualParameters.RXPower'));assert(!/Password|WLAN|Hosts|Temperature/i.test(projection));return Response.json([{_id:'acs-a',_deviceId:{_SerialNumber:'48575443AABBCCDD'},_lastInform:new Date(f.now).toISOString(),VirtualParameters:{pppoeUsername:{_value:'unit@isp'},RXPower:{_value:-25.5,_timestamp:new Date(f.now-120000).toISOString()}}}]);});
 const rows=await acs.identityDevices(f.data.settings,{optical:true});assert.equal(calls,1);assert.equal(rows[0].rxPowerValue,-25.5);assert.equal(rows[0].rxPowerAt,new Date(f.now-120000).toISOString());
});
