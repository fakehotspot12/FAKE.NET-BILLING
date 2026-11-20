'use strict';
const {fixture}=require('./olt-pon-fixture');
function model(){return{catalogue:{firmwares:['V2.1.0'],tcont:[{name:'default',type:1,fixed:10000,assured:0,maximum:0},{name:'named-60M',type:5,fixed:64,assured:64,maximum:62976}],traffic:[{name:'default',sir:9953280,pir:9953280}],vlan:[],vlans:[1,100,200]},global:{enabled:false,bandwidth:'default',onuType:''},onu:{address:'1/1/13:1',serialNumber:'HWTCAABBCCDD',type:'UNIT-2G',status:'working',configState:'success',limits:{tcont:8,gem:32},tcont:[{id:1,profile:'default'}],gems:[{id:1,tcont:1,downstream:'default'}],services:[{id:1,gem:1,userVlan:200,vlan:100}]}};}
const input=(unit,kbps=120000)=>({kind:'onu',address:unit.address,serialNumber:unit.serialNumber,type:unit.type,servicePortId:1,kbps});
function reply(command,state){
 const cat=state.catalogue,unit=state.onu,iface='gpon-onu_'+unit.address;
 if(command==='show version-running')return'1/1/1 GTGHG MVR '+cat.firmwares[0]+' time 123\nOLT#';
 if(command==='show gpon profile tcont')return cat.tcont.map(row=>`Profile name :${row.name}\n${row.type} ${row.fixed} ${row.assured} ${row.maximum} N/A\n`).join('')+'OLT#';
 if(command==='show gpon profile traffic')return cat.traffic.map(row=>`Profile name :${row.name}\n${row.sir} ${row.pir} default default\n`).join('')+'OLT#';
 if(command==='show gpon onu profile vlan')return'%Code 62310-GPONSRV : No related information to show.\nOLT#';
 if(command==='show vlan summary')return`All created vlan num: ${cat.vlans.length}\nDetails are following:\n${cat.vlans.join(',')}\nOLT#`;
 if(command==='show onu-pnp config')return`EPON bandwidth profile: default\nGPON bandwidth profile: ${state.global.bandwidth}\nONU PNP global state: ${state.global.enabled?'enable':'disable'}\nDefault ONU type:\n EPON: N/A\n GPON: ${state.global.onuType||'N/A'}\nOLT#`;
 if(command.startsWith('show gpon onu by sn '))return command.endsWith(unit.serialNumber)?iface+'\nOLT#':'%Code 62310-GPONSRV : No related information to show.\nOLT#';
 if(command==='show gpon onu detail-info '+iface)return`ONU interface: ${iface}\nType: ${unit.type}\nPhase state: ${unit.status}\nConfig state: ${unit.configState}\nSerial number: ${unit.serialNumber}\nOLT#`;
 if(command==='show running-config interface '+iface)return`interface ${iface}\n`+unit.tcont.map(row=>` tcont ${row.id} profile ${row.profile}\n`).join('')+unit.gems.map(row=>` gemport ${row.id} tcont ${row.tcont}\n${row.downstream?` gemport ${row.id} traffic-limit downstream ${row.downstream}\n`:''}`).join('')+unit.services.map(row=>` service-port ${row.id} vport ${row.gem} user-vlan ${row.userVlan} vlan ${row.vlan}\n`).join('')+'!\nend\nOLT#';
 if(command==='show gpon remote-onu capability '+iface)return'T-CONT number: 8\nGEM port number: 32\nOLT#';
 if(command==='show onu-type gpon '+unit.type)return`ONU type name: ${unit.type}\nMax T-CONT: 8\nMax GEM port: 32\nOLT#`;
 if(command==='configure terminal'||command==='exit')return'OLT(config)#';
 if(command==='gpon')return'OLT(config-gpon)#';
 if(command==='interface '+iface)return'OLT(config-if)#';
 if(command==='end'||command==='enable'||command==='terminal length 0')return'OLT#';
 let m;if((m=command.match(/^profile tcont (\S+) type 4 maximum (\d+)$/))){cat.tcont.push({name:m[1],type:4,fixed:0,assured:0,maximum:Number(m[2])});return'OLT(config-gpon)#';}
 if((m=command.match(/^profile traffic (\S+) sir 0 pir (\d+)$/))){cat.traffic.push({name:m[1],sir:0,pir:Number(m[2])});return'OLT(config-gpon)#';}
 if((m=command.match(/^tcont (\d+) profile (\S+)$/))){unit.tcont.find(row=>row.id===Number(m[1])).profile=m[2];return'OLT(config-if)#';}
 if((m=command.match(/^gemport (\d+) traffic-limit downstream (\S+)$/))){unit.gems.find(row=>row.id===Number(m[1])).downstream=m[2];return'OLT(config-if)#';}
 throw Error('Unexpected bandwidth command '+command);
}
const response=(commands,state)=>({success:true,outputs:commands.map(command=>({command,stdout:reply(command,state)}))});
module.exports={fixture,model,input,reply,response};
