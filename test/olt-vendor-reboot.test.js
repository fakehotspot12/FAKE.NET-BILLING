'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const olt=require('../src/olt-monitor'),vendors=require('../src/olt-vendors'),guard=require('../src/olt-los-confirmation'),planned=require('../src/olt-planned-reboot');
const {createDefaultStore,ensureShape}=require('../src/store');
const NOW=Date.now(),STEP=guard.INTERVAL_MS;
function fixture(vendor){const data=createDefaultStore(),mac=vendor==='hioso',sn=mac?'AABBCCDDEEFF':'HWTCAABB0001',id=vendor==='cdata'?'4718593':`1/1:1:${sn}`,pon=vendor==='cdata'?'0/0/1':'0/1/1';data.settings.oltTicketing={enabled:true,automaticTicketsEnabled:true,whatsappEnabled:true};data.oltDevices=[{id:'olt',vendor,enabled:true,updatedAt:'rev',links:{}}];return{data,row:{id,serialNumber:sn,ponKey:pon,status:'offline',condition:'los',causeKnown:true,downCause:'LOS'}};}
function poll(data,row,at=0,extra={}){const device=data.oltDevices[0],observation={deviceId:device.id,deviceUpdatedAt:device.updatedAt,snapshot:{status:'online',inventoryAvailable:true,checkedAt:new Date(NOW+at).toISOString(),onus:row?[row]:[],ports:[],...extra}},before=JSON.stringify(data),plan=olt.losTicketPlan(data,[observation],{now:NOW+at});assert.equal(JSON.stringify(data),before);return{plan,result:olt.applyLosTicketPlan(data,plan,NOW+at)};}
for(const cfg of vendors.PROFILES){
 test(cfg.label+': fresh LOS requires three spaced reads independently of write permission',()=>{
  const{data,row}=fixture(cfg.value),device=data.oltDevices[0];
  for(const at of[0,STEP]){assert.equal(poll(data,row,at).result.created.length,0);assert.equal(data.oltTickets.length,0);assert.equal(data.waMessages.length,0);}
  assert.equal(poll(data,row,2*STEP).result.created.length,1);assert.equal(data.oltTickets[0].source,'olt-los');assert.equal(data.oltTickets[0].serialNumber,row.serialNumber);assert.equal(vendors.canWrite(device),cfg.writes);
  assert.equal(poll(data,{...row,status:'online',condition:'online',causeKnown:false,downCause:''},3*STEP).result.resolved.length,1);
 });
 test(cfg.label+': ordinary down is observed but cannot become a LOS ticket or lend LOS evidence',()=>{
  const{data,row}=fixture(cfg.value),down={...row,condition:'other',causeKnown:false,downCause:'down'};
  for(const at of[0,STEP,2*STEP])assert.equal(poll(data,down,at).result.created.length,0);
  assert.equal(data.oltLosObservations[0].kind,'offline');assert.equal(data.oltLosObservations[0].count,3);assert.equal(data.oltTickets.length,0);
  assert.equal(poll(data,row,3*STEP).result.created.length,0);assert.equal(data.oltLosObservations[0].kind,'los');assert.equal(data.oltLosObservations[0].count,1);
  assert.equal(poll(data,row,4*STEP).result.created.length,0);assert.equal(poll(data,row,5*STEP).result.created.length,1);
 });
 test(cfg.label+': online/power loss cancel pending evidence and cached/failed reads cannot advance it',()=>{
  const{data,row}=fixture(cfg.value);poll(data,row);assert.equal(poll(data,row).result.changed,false);poll(data,row,STEP,{inventoryAvailable:false});assert.equal(data.oltLosObservations[0].count,1);
  poll(data,row,STEP);poll(data,{...row,downCause:'PWRDOWN',condition:'los'},2*STEP);assert.equal(data.oltLosObservations.length,0);assert.equal(data.oltTickets.length,0);
  poll(data,row,3*STEP);poll(data,{...row,status:'online',condition:'online'},4*STEP);assert.equal(data.oltLosObservations.length,0);assert.equal(data.oltTickets.length,0);
 });
 test(cfg.label+': planned reboot suppresses evidence then fresh reads survive restart',()=>{
  const{data,row}=fixture(cfg.value),native=cfg.value==='cdata'||cfg.value==='hioso';planned.begin(data,{source:native?'olt':'acs',oltId:native?'olt':'',onuIndex:native?row.id:'',pon:native?row.ponKey:'',serialNumber:row.serialNumber},{id:'audit'},NOW);
  poll(data,row);poll(data,row,STEP);assert.equal(data.oltLosObservations.length,0);
  const after=planned.WINDOW_MS+1;poll(data,row,after);const restored=ensureShape(JSON.parse(JSON.stringify(data)));poll(restored,row,after+STEP);assert.equal(poll(restored,row,after+2*STEP).result.created.length,1);
 });
}
test('unknown vendors and unavailable/incomplete inventory do not claim successful checks',()=>{
 const{data,row}=fixture('unknown');for(const at of[0,STEP,2*STEP])assert.equal(poll(data,row,at).result.changed,false);assert.equal(data.oltLosObservations.length,0);
 for(const cfg of vendors.PROFILES){const f=fixture(cfg.value);for(const at of[0,STEP,2*STEP])assert.equal(poll(f.data,f.row,at,{inventoryAvailable:false}).result.changed,false);assert.equal(f.data.oltLosObservations.length,0);}
 for(const cfg of vendors.PROFILES){const{data,row}=fixture(cfg.value),device=data.oltDevices[0];assert.equal(olt.publicDevice(device,null).inventoryAvailable,false);assert.equal(olt.publicDevice(device,{status:'online',inventoryAvailable:false,onus:[]}).inventoryAvailable,false);assert.equal(olt.publicDevice(device,{status:'online',inventoryAvailable:true,onus:[row]}).inventoryAvailable,true);}
});
test('inconsistent native cause cannot build LOS proof using a stale condition label',()=>{
 const{data,row}=fixture('hioso'),ambiguous={...row,downCause:'TIMEOUT'};poll(data,ambiguous);poll(data,ambiguous,STEP);assert.equal(data.oltLosObservations[0].kind,'offline');poll(data,row,2*STEP);assert.equal(data.oltLosObservations[0].count,1);assert.equal(data.oltTickets.length,0);
});
test('multi-OLT round-robin cadence does not perpetually reset valid new readings',()=>{
 const{data,row}=fixture('cdata');for(let i=1;i<32;i++)data.oltDevices.push({id:'extra-'+i,vendor:'cdata',enabled:true,updatedAt:'rev'});
 const gap=8*60000;poll(data,row);poll(data,row,gap);assert.equal(data.oltLosObservations[0].count,2);assert.equal(poll(data,row,gap*2).result.created.length,1);
});
test('legacy persisted LOS evidence remains valid without enabling write actions',()=>{
 const{data,row}=fixture('hioso');poll(data,row);poll(data,row,STEP);delete data.oltLosObservations[0].kind;const restored=ensureShape(JSON.parse(JSON.stringify(data)));assert.equal(poll(restored,row,2*STEP).result.created.length,1);assert.equal(vendors.canWrite(restored.oltDevices[0]),false);
});
test('powerdown aliases are power evidence, while generic down/timeout/loss are not explicit LOS',()=>{
 for(const value of['POWERDOWN','Power Down','PWRDOWN','PWR-DOWN','DYING_GASP','DyingGasp'])assert.equal(olt.classifyCause(value),'dying-gasp',value);
 for(const value of['down','TIMEOUT','offline','loss','not registered'])assert.equal(olt.classifyCause(value),'other',value);
});
test('HIOSO native power flag and timeout remain different after adapter normalization',async()=>{
 const{HiosoAdapter}=await import('../src/olt-vendor-library/adapters/hioso.adapter.js'),adapter=new HiosoAdapter({vendor:'hioso'});
 const power=adapter.normalizeWebDownCause({online:false,dyingGasp:true,downCause:1}),down=adapter.normalizeWebDownCause({online:false,dyingGasp:false,downCause:1});
 assert.equal(power.cause,'powerdown');assert.equal(down.cause,'down');assert.equal(olt.classifyCause(power.cause),'dying-gasp');assert.equal(olt.classifyCause(down.cause),'other');
});
