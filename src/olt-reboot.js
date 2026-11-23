'use strict';
const crypto=require('node:crypto'),auth=require('./auth'),olt=require('./olt-monitor'),vendors=require('./olt-vendors'),terminal=require('./olt-terminal');
const planned=require('./olt-planned-reboot');
const cache=new Map(),pending=new Map(),plans=new Map(),attempts=new Map(),locks=new Set(),TTL_MS=120000;
const signature=device=>crypto.createHash('sha256').update(JSON.stringify([device.id,device.vendor,device.host,device.port,device.communityEnc,device.cliPort,device.cliProtocol,device.cliUsername,device.cliPasswordEnc,device.updatedAt,device.enabled,device.cliEnabled])).digest('hex');
function fail(message,status=400){const error=Error(message);error.status=status;throw error;}
function scopedDevices(data,user){return olt.visibleDevices(data,user.role==='noc'?{...user,role:'technician'}:user);}
function canReboot(data,device,user){return Boolean(user&&user.active!==false&&auth.hasPermission(auth.publicUser(user),'olt:reboot')&&scopedDevices(data,user).some(row=>row.id===device.id));}
function permission(data,device,actor){const user=(data.users||[]).find(row=>row.id===actor.id);if(!user||user.active===false||!auth.hasPermission(auth.publicUser(user),'olt:reboot'))fail('Tidak memiliki izin reboot OLT',403);if(!scopedDevices(data,user).some(row=>row.id===device.id))fail('OLT tidak ditemukan',404);return user;}
function candidates(device){const root=['enable'],config=['enable','config'];return device.vendor==='hsgq'?[{prefix:['enable','configure'],command:'reboot'},{prefix:root,command:'reboot'}]:device.vendor==='cdata'?[{prefix:config,command:'reboot'},{prefix:root,command:'reboot'},{prefix:root,command:'system reboot'}]:[{prefix:root,command:'reboot'},{prefix:root,command:'reload'},{prefix:device.vendor==='hioso'?root:['enable','configure terminal'],command:device.vendor==='hioso'?'system reboot':'reboot'}];}
function completeHelp(text){return /(?:<\s*cr\s*>|<\s*enter\s*>)/i.test(text)&&!/(?:unknown command|invalid command|unrecognized command|factory|erase|slotno|cardno|<\d)/i.test(text);}
async function identity(data,device,options={}){const rows=await(options.readSystem||olt.readSystemIdentity)({host:device.host,port:device.port,community:require('./secure-secrets').decryptSecret(data,device.communityEnc)}),value=suffix=>String(rows.find(row=>row.oid===olt.OIDS.system+'.'+suffix)?.value||'').replace(/^"|"$/g,'');if(!value('2.0')||!value('1.0'))fail('Identitas OLT belum dapat diverifikasi',503);return{key:JSON.stringify([value('2.0'),value('1.0'),value('5.0')]),model:value('1.0').slice(0,160)};}
async function probe(data,device,options={}){
 const[,context,transport]=await vendors.loadLibrary();
 return context.withContext(data,device,async()=>{
  for(const candidate of candidates(device)){
   if(context.remaining()<2500)break;
   const query=candidate.command+' ?',result=await transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:[...candidate.prefix,query],timeoutMs:Math.min(5500,context.remaining())});
   const output=result.outputs?.find(row=>row.command===query)?.stdout||'';
   if(result.success&&completeHelp(output))return{available:true,commands:[...candidate.prefix,candidate.command]};
  }
  return{available:false};
 },{...options,rebootProbe:true,allowDevRebootProbe:options.allowDevRebootProbe===true,timeoutMs:18000});
}
async function prepare(data,device,actor,options={}){
 permission(data,device,actor);if(!device.enabled||!device.cliEnabled||!device.cliPasswordEnc||!device.cliUsername)fail('Aktifkan akun CLI OLT terlebih dahulu');if(/^demo-olt-/.test(device.id))return{available:false,canSubmit:false,message:'OLT simulasi tidak di-reboot.'};if(terminal.isOpen(device.id))fail('Tutup terminal OLT sebelum menyiapkan reboot',409);
 const maintenance=planned.forOlt(data,device);if(maintenance)return{available:true,canSubmit:false,maintenanceUntil:maintenance.until,message:'OLT masih dalam jeda pemeliharaan setelah reboot. Pantau koneksi; jangan mengulang perintah.'};
 const id=signature(device),now=Date.now();let value=cache.get(id);
 if(!value||now-value.at>(value.available?300000:30000)){
  if(pending.has(id))value=await pending.get(id);else{if(pending.size>=2||now-(attempts.get(id)||0)<15000)fail('Pemeriksaan reboot sedang berjalan atau baru dijalankan',429);attempts.set(id,now);while(attempts.size>64)attempts.delete(attempts.keys().next().value);const task=(async()=>{const system=await identity(data,device,options),result=await probe(data,device,options),row={...result,identity:system,at:Date.now()};cache.set(id,row);while(cache.size>32)cache.delete(cache.keys().next().value);return row;})();pending.set(id,task);try{value=await task;}finally{pending.delete(id);}}
 }
 if(!value.available)return{available:false,canSubmit:false,model:value.identity.model,message:'Perintah reboot untuk firmware ini belum terverifikasi. Tidak ada perintah reboot yang dikirim.'};
 for(const[token,plan]of plans)if(plan.expires<=now)plans.delete(token);if(plans.size>=64)plans.delete(plans.keys().next().value);
 const token=crypto.randomBytes(24).toString('base64url');plans.set(token,{actorId:actor.id,deviceId:device.id,signature:id,commands:value.commands,identity:value.identity,expires:now+TTL_MS});
 return{available:true,canSubmit:process.env.MIGRATION_MODE!=='1',token,model:value.identity.model,maintenanceMinutes:15,message:process.env.MIGRATION_MODE==='1'?'Mode dev: kesiapan perintah dapat diperiksa, reboot perangkat asli tidak dijalankan.':'Seluruh pelanggan pada OLT ini akan terputus sementara. Simpan konfigurasi yang diperlukan sebelum reboot.'};
}
async function execute(data,device,actor,payload={},options={}){
 permission(data,device,actor);if(process.env.MIGRATION_MODE==='1')fail('Mode dev terisolasi: reboot OLT asli tidak dijalankan');
 const plan=plans.get(payload.token);if(!plan||plan.expires<=Date.now()||plan.actorId!==actor.id||plan.deviceId!==device.id||plan.signature!==signature(device)||payload.confirmId!==device.id||payload.confirmName!==device.name||payload.revision!==(device.updatedAt||'')||payload.confirmReboot!==true||payload.confirmSaved!==true)fail('Pratinjau, nama OLT dan persetujuan reboot wajib sesuai',409);
 if(plan.result)return plan.result;if(planned.forOlt(data,device))fail('Reboot OLT masih dalam jeda pemeliharaan. Jangan mengulang perintah.',429);if(locks.has(device.id)||locks.size>=2||terminal.isOpen(device.id))fail('OLT sedang digunakan. Tunggu hasil sebelum mencoba lagi.',409);if(typeof options.beforeSend!=='function')fail('Penanda pemeliharaan wajib disimpan sebelum reboot',409);
 locks.add(device.id);let invoked=false;
 try{
  if((await identity(data,device,options)).key!==plan.identity.key){cache.delete(plan.signature);fail('Identitas OLT berubah. Baca ulang sebelum reboot.',409);}
  const marker=await options.beforeSend();if(!marker?.id||!marker.until)fail('Penanda pemeliharaan belum tersimpan',409);
  const[,context,transport]=await vendors.loadLibrary();let result;
  try{invoked=true;result=await context.withContext(data,device,async()=>{context.authorizeOltReboot(plan.commands);return transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:plan.commands,timeoutMs:12000});},{...(options.transportOptions||{}),oltRebootAllowed:true,timeoutMs:14000});}
  catch{result={submitted:invoked?null:false,acknowledged:false};}
  const uncertain=result.submitted!==true&&result.submitted!==false;
  if(result.submitted===false)await options.cancelMarker?.(marker.id);
  plan.result={submitted:result.submitted===true,uncertain,acknowledged:result.acknowledged===true,verified:false,maintenanceUntil:result.submitted||uncertain?marker.until:'',message:uncertain?'Hasil pengiriman reboot belum dapat dipastikan. Jangan mengulang; periksa koneksi OLT.':result.submitted?result.acknowledged?'Permintaan reboot diterima. Tunggu OLT terhubung kembali.':'Perintah reboot sudah dikirim, hasil akhir belum dapat dipastikan. Jangan mengulang; pantau koneksi OLT.':'Perintah reboot belum terkirim. Periksa akses CLI sebelum mencoba kembali.'};return plan.result;
 }finally{locks.delete(device.id);}
}
module.exports={prepare,execute,probe,completeHelp,candidates,signature,permission,canReboot,scopedDevices,TTL_MS};
