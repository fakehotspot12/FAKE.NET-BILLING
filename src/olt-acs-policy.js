'use strict';

const tr069=require('./olt-zte-tr069');
function normalize(input){
 const value=tr069.setting(input);
 return value||{enabled:false,acsUrl:''};
}
function settings(device){return normalize(device.onuAcs);}
function preset(device,value){
 const config=settings(device);
 if(!tr069.active(config))return device.onuAcs===undefined?value:{...value,tr069:config};
 if(value.vlanMode!=='selected')return value;
 const vlans=[...new Set([...value.vlans,...(tr069.managementEnabled(config)?[100]:[])])].sort((a,b)=>a-b);
 if(vlans.length>16)throw Object.assign(Error('Preset sudah berisi 16 VLAN; sisakan satu slot untuk VLAN100 ACS OLT'),{status:409});
 return{...value,vlans,tr069:config};
}
module.exports={normalize,settings,preset};
