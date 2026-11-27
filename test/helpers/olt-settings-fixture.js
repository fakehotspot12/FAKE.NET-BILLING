'use strict';
const base=require('./olt-registration-fixture'),tr=require('../../src/olt-zte-tr069');
function fixture(){const f=base.fixture();f.model.registered=true;f.model.onu.type='UNIT-2G';f.model.onu.limits={tcont:8,gem:32};f.model.onu.tcont=[{id:1,profile:'UP60'}];f.model.onu.gems=[{id:1,tcont:1,downstream:'DOWN60'}];f.model.onu.services=[{id:1,gem:1,userVlan:101,vlan:101}];f.model.management=[{name:'internet',gem:1,vlan:101}];f.model.extra=[];f.model.catalogue.tcont.push({name:'UP60',type:4,fixed:0,assured:0,maximum:60000},{name:'UP120',type:4,fixed:0,assured:0,maximum:120000});f.model.catalogue.traffic.push({name:'DOWN60',sir:0,pir:60000},{name:'DOWN120',sir:0,pir:120000});return f;}
function reply(command,m){
 const iface='gpon-onu_'+m.onu.address,configPrompt='OLT(config-if)#',managementPrompt=`OLT(gpon-onu-mng ${m.onu.address})#`;let match;
 if(command==='show vlan 100')return'vlanid :100\nOLT#';
 if(command==='show gpon remote-onu capability '+iface)return base.reply(command,m).replace('OLT#','IP host number: 4\nVEIP number: 1\nOLT#');
 if(command==='show onu running config '+iface)return base.reply(command,m).replace('!\n',m.extra.join('\n')+'\n!\n');
 if(command==='show gpon remote-onu ip-host '+iface)return[1,2,3,4].map(id=>{const staticLine=m.extra.find(row=>row.startsWith('ip-host '+id+' ip '));return`Host ID: ${id}\nIP addres: ${staticLine?.split(' ')[3]||'0.0.0.0'}\nDHCP enable: ${m.extra.some(row=>row.startsWith('ip-host '+id+' dhcp-enable enable'))?'enable':'disable'}\nCurrent IP address: 0.0.0.0\nCurrent mask: 255.255.255.0\nCurrent gateway: 192.0.2.1\nCurrent primary DNS: 192.0.2.53\n`;}).join('\n')+'OLT#';
 if((match=command.match(/^no (service-port|gemport|tcont) (\d+)$/))){const key={tcont:'tcont',gemport:'gems','service-port':'services'}[match[1]];m.onu[key]=m.onu[key].filter(row=>row.id!==Number(match[2]));return configPrompt;}
 if((match=command.match(/^tcont (\d+) profile (\S+)$/))){m.onu.tcont=m.onu.tcont.filter(row=>row.id!==Number(match[1]));m.onu.tcont.push({id:Number(match[1]),profile:match[2]});return configPrompt;}
 if((match=command.match(/^gemport (\d+) tcont (\d+)$/))){const old=m.onu.gems.find(row=>row.id===Number(match[1]));if(old)old.tcont=Number(match[2]);else m.onu.gems.push({id:Number(match[1]),tcont:Number(match[2])});return configPrompt;}
 if((match=command.match(/^no service (\S+)$/))){m.management=m.management.filter(row=>row.name!==match[1]);return managementPrompt;}
 if((match=command.match(/^service (\S+) gemport (\d+) vlan (\d+)$/))){m.management.push({name:match[1],gem:Number(match[2]),vlan:Number(match[3])});return managementPrompt;}
 if((match=command.match(/^no pppoe (\d+)$/))){m.extra=m.extra.filter(row=>!row.startsWith('pppoe '+match[1]+' '));return managementPrompt;}
 if((match=command.match(/^pppoe (\d+) (.+)$/))){const tr=require('../../src/olt-zte-tr069'),id=Number(match[1]),previous=tr.pppoeConfig(m.extra,id)||{id,nat:'disable',auth:'auto',connect:'always',timer:'1200'},part=tr.pppoeConfig([command],id);const next={...previous,...(match[2].startsWith('nat ')?{nat:part.nat}:{}),...(part.username?{username:part.username,password:part.password}:{})};m.extra=m.extra.filter(row=>!row.startsWith('pppoe '+id+' '));m.extra.push(tr.pppoeLine(next));return managementPrompt;}
 if((match=command.match(/^no ip-host (\d+)$/))){m.extra=m.extra.filter(row=>!row.startsWith('ip-host '+match[1]+' '));return managementPrompt;}
 if(command.startsWith('no vlan-filter-mode iphost ')){m.extra=m.extra.filter(row=>!row.startsWith(command.slice(3)+' '));return managementPrompt;}
 if(command.startsWith('no vlan-filter iphost ')){m.extra=m.extra.filter(row=>row!==command.slice(3));return managementPrompt;}
 if(/^ip-host \d+ dhcp-enable /.test(command))m.extra=m.extra.filter(row=>!row.startsWith(command.split(' ').slice(0,2).join(' ')+' dhcp-enable '));
 if(/^(?:ip-host|vlan-filter(?:-mode)?|switchport-bind) /.test(command)){if(!m.extra.includes(command))m.extra.push(command);return managementPrompt;}
 return base.reply(command,m);
}
const response=(commands,m)=>({success:true,submitted:commands.includes('configure terminal'),outputs:commands.map(command=>({command,stdout:reply(command,m)}))});
function snapshot(f){const value={address:f.model.onu.address,serialNumber:f.model.onu.serialNumber,type:f.model.onu.type};return{value,state:tr.inspect(response(tr.commands(value),f.model),value),catalogue:f.model.catalogue};}
module.exports={fixture,reply,response,snapshot};
