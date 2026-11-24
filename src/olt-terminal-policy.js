'use strict';
function fail(message){const error=Error(message);error.status=409;throw error;}
const locationError=()=>fail('Posisi ONU belum pasti. Masuk ke interface PON dengan perintah lengkap atau gunakan Hapus ONU dari daftar.');
function position(value){const match=String(value||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,2})(?::([1-9]\d{0,3}))?$/);if(!match)return null;const[frame,slot,pon,onuId]=match.slice(1).map(Number);return frame<=31&&slot<=31&&pon>=1&&pon<=32&&(!match[4]||onuId<=1024)?{frame,slot,pon,ponKey:`${frame}/${slot}/${pon}`,...(match[4]?{onuId}:{})}:null;}
function nextLocation(device,line){
 let match;if((match=line.match(/^interface\s+(?:gpon-olt_|gpon_olt-)(\d+\/\d+\/\d+)$/i)))return position(match[1]);
 if((match=line.match(/^interface\s+gpon\s+(\d+)\/(\d+)$/i))){const[frame,slot]=match.slice(1).map(Number);return frame<=31&&slot<=31?{frame,slot}:null;}
 if((match=line.match(/^interface\s+epon\s+0\/([1-9]\d?)$/i))&&device.vendor==='hioso')return position('0/1/'+match[1]);
 if((match=line.match(/^interface\s+gpon\s+([1-9]|1[0-6])$/i))&&device.vendor==='hsgq')return position('0/0/'+match[1]);
 if((match=line.match(/^(?:interface\s+gpon-onu_|(?:gpon|pon)-onu-mng\s+gpon-onu_)(\d+\/\d+\/\d+:[1-9]\d*)$/i))&&device.vendor==='zte')return position(match[1]);
 return null;
}
function classify(device,location,value){
 if(typeof value!=='string'||value.length>1024||/[^\x20-\x7e]|[;|&`$<>\\]/.test(value))fail('Gunakan satu perintah CLI lengkap tanpa separator, kontrol atau script.');
 const line=value.trim().replace(/ +/g,' ');if(!line)return{kind:'command',line};
 let match,target;
 if((match=line.match(/^(?:no|undo) interface (?:gpon-onu_|gpon_onu-)(\d+\/\d+\/\d+:[1-9]\d*)$/i)))target=position(match[1]);
 else if(device.vendor==='hsgq'&&(match=line.match(/^ont delete (0|[1-9]\d?|1[01]\d|12[0-7])$/i))){if(!location?.ponKey||location.onuId!=null)locationError();target={...position(location.ponKey),onuId:Number(match[1])};}
 else if((match=line.match(/^ont delete ([1-9]\d?) ([1-9]\d{0,3})$/i))){if(!location||!Number.isInteger(location.frame)||!Number.isInteger(location.slot))locationError();target=position(`${location.frame}/${location.slot}/${Number(match[1])}:${Number(match[2])}`);}
 else if((match=line.match(/^(?:no onu|delete onu|onu delete|undo onu|undo ont) ([1-9]\d{0,3})$/i))){if(!location?.ponKey||location.onuId!=null)locationError();target=position(`${location.ponKey}:${Number(match[1])}`);}
 if(match){if(!target||!target.onuId&&!(device.vendor==='hsgq'&&target.onuId===0))locationError();return{kind:'delete-onu',target,permission:'olt:onu:delete'};}
 if(/^no shutdown$/i.test(line)){
  const pon=position(location?.ponKey);
  if(device.vendor!=='zte'||!pon||pon.onuId||location.onuId!=null)fail('Masuk dahulu ke interface PON ZTE yang benar dengan perintah lengkap sebelum no shutdown.');
  return{kind:'command',line,permission:'olt:pon:manage'};
 }
 if((match=line.match(/^no shutdown ([1-9]|1[0-6])$/i))){
  if(device.vendor!=='cdata'||location?.frame!==0||!Number.isInteger(location.slot)||!position(`0/${location.slot}/${match[1]}`)||location.onuId!=null)fail('Masuk dahulu ke interface GPON CDATA dengan perintah lengkap.');
  return{kind:'command',line,permission:'olt:pon:manage'};
 }
 if(/\bshutdown\b/i.test(line))fail('Nonaktifkan PON melalui kontrol PON web agar konfirmasi ONU aktif dan pengaman tiket diterapkan.');
 // Deletion is never a raw terminal command, including aliases, chains or
 // firmware-specific forms that cannot be tied to exactly one ONU.
 if(/^(?:show|display)\s+.+$/i.test(line)||/^do (?:show|display)\s+.+$/i.test(line)){
  const globalConfig=/^(?:do )?(?:show|display) (?:run\S*|sta(?:rt|rtup)\S*|conf\S*|curr\S*|saved\S*)(?: |$)/i.test(line)&&!/^show running-config interface gpon-onu_\d+\/\d+\/\d+:[1-9]\d*$/i.test(line);
  return{kind:'command',line,...(globalConfig?{permission:'olt:manage'}:{})};
 }
 if(/^(?:description|name)\s+.+$/i.test(line))return{kind:'command',line,permission:location?.onuId!=null?'olt:onu:reboot':'olt:manage'};
 if(/^(?:hostname|sysname|authentication|password)\s+.+$/i.test(line))return{kind:'command',line,permission:'olt:manage'};
 if(/\b(?:no|undo|delete|del|remove|destroy|unregister|deactivate|reset|reboot|reload|erase|format|restore|factory|load|source|script|macro|alias|exec|execute|shell|bash|python|lua)\b/i.test(line))fail('Perintah hapus/reset tidak dikirim langsung. Gunakan Hapus ONU atau Reboot pada web agar pengaman integrasi tetap berlaku.');
 if(/^(?:save|write(?: memory)?|commit)$/i.test(line))return{kind:'command',line,permission:'olt:manage'};
 if(/^(?:enable|disable|config|configure terminal|conf t|system-view|exit|end|quit|return|epon|gpon|\?)$/i.test(line)||/^terminal (?:length|width) \d{1,4}$/i.test(line))return{kind:'command',line,navigation:/^(?:enable|disable|config|configure|conf|system-view|exit|end|quit|return|epon|gpon)\b/i.test(line)};
 if(/^interface [A-Za-z][A-Za-z0-9_.:/ -]*$/i.test(line))return{kind:'command',line,navigation:true,location:nextLocation(device,line)};
 if(/^(?:tcont|gemport|service-port|service|vlan|switchport|flow|native-vlan|port|qos|bandwidth|traffic-limit|speed|duplex|onu-type|profile|(?:gpon|pon)-onu-mng)\s+.+$/i.test(line))return{kind:'command',line,permission:'olt:pnp:manage',navigation:/^(?:(?:gpon|pon)-onu-mng|profile|onu-type|vlan|port)\b/i.test(line),location:nextLocation(device,line)};
 if(/^(?:onu [1-9]\d{0,3} (?:type|name|description|sn)|ont (?:add|modify|description|ipconfig|port))\s+.+$/i.test(line))return{kind:'command',line,permission:'olt:pnp:manage'};
 fail('Perintah atau singkatan CLI belum dikenali. Gunakan perintah lengkap; hapus ONU melalui alur pratinjau integrasi.');
}
function checkAccess(command,permissions=[]){
 if(!command.permission||permissions.includes(command.permission))return;
 const message=command.permission==='olt:onu:delete'?'Tidak memiliki izin hapus ONU.':command.permission==='olt:manage'?'Perintah ini memerlukan izin kelola OLT.':'Perintah konfigurasi ini hanya untuk Admin, Sekretaris atau Kepala Teknisi.';
 throw Object.assign(Error(message),{status:403});
}
module.exports={classify,nextLocation,position,checkAccess};
