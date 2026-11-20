'use strict';
const base=require('./olt-bandwidth-fixture'),TYPE='FB-GPON-AUTO',key='1/1/13';
function fixture(){const f=base.fixture(),m=base.model();m.registered=false;m.onu.type=TYPE;m.onu.limits={tcont:1,gem:16};m.onu.tcont=[];m.onu.gems=[];m.onu.services=[];m.management=[];m.types=[];m.onu.configState='success';m.onu.status='working';m.catalogue.vlans=[1,100,101,102];m.native=false;m.interfaceEnabled=true;return{...f,model:m};}
function reply(command,m){
 const unit=m.onu,iface='gpon-onu_'+unit.address;
 if(command==='show card')return'Rack Shelf Slot CfgType RealType Port  HardVer SoftVer         Status\n1    1     1    GTGH    GTGHG    16    V1.0.0  V2.1.0          INSERVICE\nOLT#';
 if(command==='show interface gpon-olt_'+key)return`gpon-olt_${key} is activate,line protocol is ${m.registered?'up':'down'}.\nThe port has 128 onus, the number of registered onus is ${m.registered?1:0}.\nOLT#`;
 if(command==='show running-config interface gpon-olt_'+key)return`interface gpon-olt_${key}\n ${m.interfaceEnabled?'no shutdown':'shutdown'}\n!\nend\nOLT#`;
 if(command==='show gpon onu state gpon-olt_'+key)return`OnuIndex Admin State OMCC State Phase State Channel\n${m.registered?`${unit.address} enable enable working 1(GPON)\n`:''}ONU Number: ${m.registered?1:0}/${m.registered?1:0}\nOLT#`;
 if(command==='show gpon onu baseinfo gpon-olt_'+key)return m.registered?`OnuIndex Type Mode AuthInfo State\n${iface} ${m.wrapType?unit.type.slice(0,11):unit.type} sn SN:${unit.serialNumber} ready\n${m.wrapType?'                    '+unit.type.slice(11)+'\n':''}OLT#`:'%Code 62310-GPONSRV : No related information to show.\nOLT#';
 if(command==='show pon onu uncfg')return m.registered?'%Code 70285 : No related information to show.\nOLT#':`OltIndex Model SN PW\ngpon-olt_${key} HG-SAMPLE ${unit.serialNumber} N/A\nOLT#`;
 if(command==='show onu-type gpon')return[{name:'UNIT',tcont:8,gem:32},...m.types].map(row=>`ONU type name: ${row.name}\nPON type: gpon\nMax T-CONT: ${row.tcont}\nMax GEM port: ${row.gem}\n`).join('')+'OLT#';
 if(command==='show onu-type gpon '+TYPE)return`ONU type name: ${TYPE}\nPON type: gpon\nMax T-CONT: 1\nMax GEM port: 16\nOLT#`;
 if(command==='show onu-pnp olt config gpon-olt_'+key)return`OLT: gpon-olt_${key}\nONU PNP state:${m.native?'enable':'disable'}\nONU VLAN mode:N/A\nOLT VLAN mode:N/A\nOLT#`;
 if(command.startsWith('show gpon onu by sn '))return m.registered?`${iface}\nOLT#`:'%Code 62310-GPONSRV : No related information to show.\nOLT#';
 if(command==='show onu running config '+iface)return`pon-onu-mng ${iface}\n${m.management.map(row=>` service ${row.name} gemport ${row.gem} vlan ${row.vlan}\n`).join('')}!\nend\nOLT#`;
 if(command==='pon')return'OLT(config-pon)#';
 if(command==='onu-type '+TYPE+' gpon max-tcont 1 max-gemport 16'){m.types.push({name:TYPE,tcont:1,gem:16});return'OLT(config-pon)#';}
 if(command==='interface gpon-olt_'+key)return'OLT(config-if)#';
 if(command.startsWith('onu ')){const match=command.match(/^onu (\d+) type (\S+) sn ([A-Z0-9]{12})$/);if(!match)throw Error('Invalid ONU command');m.registered=true;unit.address=key+':'+match[1];unit.type=match[2];unit.serialNumber=match[3];return'OLT(config-if)#';}
 if(command==='pon-onu-mng '+iface)return`OLT(gpon-onu-mng ${unit.address})#`;
 let match;if((match=command.match(/^service-port (\d+) vport (\d+) user-vlan (\d+) vlan (\d+)$/))){unit.services.push({id:Number(match[1]),gem:Number(match[2]),userVlan:Number(match[3]),vlan:Number(match[4])});return'OLT(config-if)#';}
 if((match=command.match(/^gemport (\d+) tcont (\d+)$/))){unit.gems.push({id:Number(match[1]),tcont:Number(match[2])});return'OLT(config-if)#';}
 if((match=command.match(/^tcont 1 profile (\S+)$/))){unit.tcont=[{id:1,profile:match[1]}];return'OLT(config-if)#';}
 if((match=command.match(/^service (FBV\d+) gemport (\d+) vlan (\d+)$/))){m.management.push({name:match[1],gem:Number(match[2]),vlan:Number(match[3])});return`OLT(gpon-onu-mng ${unit.address})#`;}
 return base.reply(command,m);
}
function response(commands,model){return{success:true,submitted:commands.some(row=>row.startsWith('onu ')||row.startsWith('profile ')||row.startsWith('tcont ')),outputs:commands.map(command=>({command,stdout:reply(command,model)}))};}
module.exports={fixture,reply,response,key};
