'use strict';
const store=require('../../src/store'),monitor=require('../../src/olt-monitor');
let next=0;const ponKey='1/1/13';
function fixture(){const data=store.createDefaultStore(),actor={id:'pon-actor',role:'admin',active:true};data.users=[actor];data.monitoringTargets=[{id:'nas-a',name:'Unit',host:'192.0.2.1'}];data.radiusNas=[];data.customers=[];data.radiusUsers=[];data.oltTickets=[];const device=monitor.validateDevice(data,{name:'PON Unit '+(++next),vendor:'zte',host:'192.0.2.90',community:'unit',cliEnabled:true,cliUsername:'unit',cliPassword:'unit',nasId:'nas-a'});data.oltDevices=[device];return{data,actor,device,model:{enabled:true,registered:1,online:1,unregistered:1,serial:'HWTCAABBCCDD'}};}
function config(pon,enabled){return`interface gpon-olt_${pon}\n  ${enabled?'no shutdown':'shutdown'}\n  linktrap disable\n!\nend\nOLT#`;}
function reply(commands,model){let submitted=false;const outputs=commands.map(command=>{
 let stdout='OLT#';
 if(command==='show card')stdout='Rack Shelf Slot CfgType RealType Port  HardVer SoftVer         Status\n1    1     1    GTGH    GTGHG    16    V1.0.0  V2.1.0          INSERVICE\nOLT#';
 else if(command.startsWith('show running-config interface '))stdout=config(command.split('_').at(-1),model.enabled);
 else if(command==='show interface gpon-olt_'+ponKey)stdout=`gpon-olt_${ponKey} is ${model.enabled?'activate':'deactivate'},line protocol is ${model.online?'up':'down'}.\n  The port has 128 onus, the number of registered onus is ${model.registered}.\nOLT#`;
 else if(command==='show gpon onu state gpon-olt_'+ponKey)stdout='OnuIndex Admin State OMCC State Phase State Channel\n'+(model.registered?`${ponKey}:1 enable ${model.online?'enable working':'disable OffLine'} 1(GPON)\n`:'')+`ONU Number: ${model.online}/${model.registered}\nOLT#`;
 else if(command==='show gpon onu baseinfo gpon-olt_'+ponKey)stdout=model.registered?`OnuIndex Type Mode AuthInfo State\ngpon-onu_${ponKey}:1 UNIT sn SN:${model.serial} ready\nOLT#`:'%Code 62310-GPONSRV : No related information to show.\nOLT#';
 else if(command==='show gpon onu uncfg')stdout=model.unregistered?`OnuIndex Sn State\ngpon-onu_${ponKey}:2 HWTC11223344 unknown\nOLT#`:'%Code 62310-GPONSRV : No related information to show.\nOLT#';
 else if(command==='configure terminal')stdout='OLT(config)#';
 else if(command.startsWith('interface '))stdout='OLT(config-if)#';
 else if(command==='no shutdown'||command==='shutdown'){submitted=true;model.enabled=command==='no shutdown';model.online=model.enabled?model.registered:0;stdout='OLT(config-if)#';}
 return{command,stdout,stderr:''};
 });return{success:true,outputs,submitted};}
module.exports={fixture,reply,config,ponKey};
