'use strict';
const crypto=require('node:crypto');
const fail=message=>{throw Error(message);};
function target(pon){const match=String(pon).match(/^0\/(0|[1-9]\d?)\/([1-9]|1[0-6])$/);if(!match||Number(match[1])>31)fail('Posisi PON CDATA tidak valid');return{slot:Number(match[1]),port:Number(match[2])};}
function readCommands(pon){const{slot,port}=target(pon);return['enable','show ont autofind all','config',`interface gpon 0/${slot}`,`show port info ${port}`,`show port state ${port}`,`show ont info ${port} all`];}
function writeCommands(pon,enabled){const{port}=target(pon);return[...readCommands(pon),`${enabled?'no shutdown':'shutdown'} ${port}`,`show port info ${port}`,`show port state ${port}`];}
function output(result,command,last=false){const rows=(result.outputs||[]).filter(row=>row.command===command);if(!rows.length||!last&&rows.length!==1)fail('Tabel PON CDATA belum lengkap');return rows[last?rows.length-1:0].stdout||'';}
function field(text,name){const values=[...String(text).matchAll(new RegExp('^\\s*'+name+'\\s*:\\s*([^\\r\\n]+)','gim'))];if(values.length!==1)fail('Status PON CDATA belum pasti');return values[0][1].trim();}
function portInfo(text,pon){
 target(pon);if(field(text,'Port')!=='gpon '+pon)fail('Port CDATA berbeda dari target');
 const admin=field(text,'Admin\\s+State').toLowerCase(),link=field(text,'Link\\s+State').toLowerCase();
 if(!['enable','disable'].includes(admin)||!['on','off'].includes(link))fail('Status administratif/link CDATA belum dikenali');
 return{ponKey:pon,adminState:admin==='enable'?'enabled':'disabled',operState:link==='on'?'up':'down'};
}
function portState(text,pon){
 const{slot,port}=target(pon);if(field(text,'Frame/Slot')!==`0/${slot}`||field(text,'Port')!==String(port)||field(text,'Port\\s+Name')!=='gpon '+pon)fail('Alamat PON CDATA berubah');
 const admin=field(text,'Admin\\s+state').toLowerCase(),link=field(text,'Link\\s+state').toLowerCase();if(!['enable','disable'].includes(admin)||!['on','off'].includes(link))fail('Status PON CDATA belum pasti');
 return{ponKey:pon,adminState:admin==='enable'?'enabled':'disabled',operState:link==='on'?'up':'down'};
}
function registered(text,pon){
 const{slot,port}=target(pon),rows=[],ids=new Set(),serials=new Set();
 if(/There is no ONT available\./i.test(text)){if(/^\s*\d+\/\d+\s+\d+/m.test(text))fail('Tabel ONU CDATA bertentangan');return rows;}
 if(!/F\/S\s+P\s+ONT\s+SN\s+Control\s+Run/i.test(text)||!/flag\s+state\s+state\s+state/i.test(text))fail('Tabel ONU CDATA belum dikenali');
 for(const line of String(text).split(/\r?\n/)){if(!/^\s*\d+\//.test(line))continue;const match=line.trim().match(/^(\d+)\/(\d+)\s+(\d+)\s+([1-9]\d*)\s+([A-Z0-9]{12})\s+(Active|Deactive)\s+(Online|Offline)\s+\S+\s+\S+\s+\S+(?:\s+.*)?$/i);
  if(!match||Number(match[1])!==0||Number(match[2])!==slot||Number(match[3])!==port||Number(match[4])>1024||ids.has(Number(match[4]))||serials.has(match[5].toUpperCase()))fail('Identitas/posisi ONU CDATA berubah atau ambigu');
  ids.add(Number(match[4]));serials.add(match[5].toUpperCase());rows.push([Number(match[4]),match[5].toUpperCase(),match[6].toLowerCase(),match[7].toLowerCase()]);
 }
 const totals=[...String(text).matchAll(/Total:\s*(\d+),\s*online:\s*(\d+),\s*deactive:\s*(\d+)/gi)];
 if(totals.length!==1||Number(totals[0][1])!==rows.length||Number(totals[0][2])!==rows.filter(row=>row[3]==='online').length||Number(totals[0][3])!==rows.filter(row=>row[2]==='deactive').length)fail('Jumlah ONU CDATA tidak cocok; pembacaan ditahan');
 return rows.sort((a,b)=>a[0]-b[0]);
}
function unregistered(text){
 // Only the empty result has been verified on both firmware families. Never
 // advertise zero when a new/nonempty autofind layout has not been verified.
 if(!/Aging time of the automatically found ONTs\s*:\s*\d+sec/i.test(text)||!/There is no ONT available\./i.test(text)||/^\s*\d+\/\d+\s+\d+/m.test(text))fail('Daftar ONU baru CDATA belum terverifikasi; kontrol ditahan');return[];
}
function readback(result,pon){const{port}=target(pon),info=portInfo(output(result,`show port info ${port}`,true),pon),state=portState(output(result,`show port state ${port}`,true),pon);if(info.adminState!==state.adminState||info.operState!==state.operState)fail('Status PON CDATA berbeda antar pembacaan');return{...info,checkedAt:new Date().toISOString()};}
function inspect(result,pon){
 const{port}=target(pon),info=portInfo(output(result,`show port info ${port}`),pon),state=portState(output(result,`show port state ${port}`),pon);if(info.adminState!==state.adminState||info.operState!==state.operState)fail('Status PON CDATA berubah; periksa ulang');
 const onus=registered(output(result,`show ont info ${port} all`),pon),extra=unregistered(output(result,'show ont autofind all')),proof=crypto.createHash('sha256').update(JSON.stringify([pon,info.adminState,onus,extra])).digest('hex');
 return{...info,registered:onus.length,online:onus.filter(row=>row[3]==='online').length,unregistered:extra.length,proof,checkedAt:new Date().toISOString()};
}
function isReadCommands(commands){
 if(!Array.isArray(commands))return false;const slot=commands[3]?.match(/^interface gpon 0\/(\d+)$/)?.[1],port=commands[4]?.match(/^show port info (\d+)$/)?.[1];
 try{if(slot!==undefined&&port&&JSON.stringify(commands)===JSON.stringify(readCommands(`0/${slot}/${port}`)))return true;
  if(commands[0]!=='enable'||commands[1]!=='config'||commands.length<5||commands.length>14||(commands.length-2)%3)return false;const seen=new Set();
  for(let i=2;i<commands.length;i+=3){const slot=commands[i].match(/^interface gpon 0\/(\d+)$/)?.[1],port=commands[i+1].match(/^show port info (\d+)$/)?.[1];if(slot===undefined||!port||commands[i+2]!=='exit')return false;const key=`0/${slot}/${port}`;target(key);if(seen.has(key))return false;seen.add(key);}return seen.size>0&&seen.size<=4;
 }catch{return false;}
}
function stateCommands(ports){return['enable','config',...ports.flatMap(row=>{const{slot,port}=target(row.ponKey);return[`interface gpon 0/${slot}`,`show port info ${port}`,'exit'];})];}
module.exports={target,readCommands,writeCommands,portInfo,portState,registered,unregistered,inspect,readback,isReadCommands,stateCommands};
