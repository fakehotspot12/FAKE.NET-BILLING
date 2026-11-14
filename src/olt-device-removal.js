'use strict';

const crypto=require('node:crypto');
const auth=require('./auth');
const olt=require('./olt-monitor');
const acs=require('./genieacs');
const identity=require('./network-identity');
const automatic=require('./olt-auto-identity');
const plans=new Map(),previews=new Map(),locks=new Set();
const TTL=5*60*1000,ACTIVE_WINDOW=15*60*1000,MAX_PLANS=128;
const clean=value=>String(value||'').trim();
const labels={missing:'Tidak ada',offline:'Offline terverifikasi',online:'Masih online',unknown:'Belum terverifikasi',unavailable:'Belum dapat diperiksa',ready:'Siap dihapus',skipped:'Tidak diproses',preserved:'Dipertahankan',deleted:'Berhasil dihapus',failed:'Belum berhasil',pending:'Menunggu verifikasi',simulated:'Simulasi'};
const state=(value,reason='')=>({state:value,label:labels[value]||value,...(reason?{reason}: {})});
function error(message,status=400){const value=new Error(message);value.status=status;return value;}
function permission(data,device,actor,cascade){
  const user=(data.users||[]).find(row=>row.id===actor.id);
  if(!user||user.active===false||!auth.hasPermission(auth.publicUser(user),'olt:onu:delete')||(cascade&&!auth.hasPermission(auth.publicUser(user),'genieacs:write')))throw error('Tidak memiliki izin penghapusan perangkat',403);
  if(!olt.visibleDevices(data,user).some(row=>row.id===device.id))throw error('OLT tidak ditemukan',404);
  return user;
}
function signature(data,device){const cfg=acs.normalizeSettings(data.settings||{});return crypto.createHash('sha256').update(JSON.stringify([data.settings?.networkIntegrationEnabled===true,cfg.enabled,cfg.baseUrl,cfg.token,cfg.excludeUsernameSuffixes,device.id,device.nasId,device.host,device.port,device.cliPort,device.cliEnabled,device.cliUsername,device.cliPasswordEnc,device.communityEnc])).digest('hex');}
function prune(now){for(const[key,plan]of plans)if(plan.expires<=now&&plan.status!=='running')plans.delete(key);while(plans.size>=MAX_PLANS){const key=[...plans.keys()].find(key=>plans.get(key).status!=='running');if(!key)throw error('Pratinjau penghapusan sedang penuh',429);plans.delete(key);}}
function ownerSignature(data,device,row){const users=(data.radiusUsers||[]).filter(user=>clean(user.username).toLowerCase()===clean(row.username).toLowerCase()).map(user=>[user.id,user.customerId,user.nasId]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return JSON.stringify([row.id,row.username,row.registered,device.links?.[row.serialNumber]?.customerId||'',users]);}
async function acsState(data,device,sn,target,user,options,now){
  if(!acs.configured(data.settings||{}))return {public:state('unavailable','Koneksi ACS belum aktif. Penghapusan gabungan ditahan.')};
  let rows;try{rows=await(options.findAcs||acs.removalDevicesBySerial)(data.settings||{},sn);}catch{return {public:state('unavailable','ACS belum dapat diverifikasi. Timeout bukan berarti data tidak ada.')}}
  if(!Array.isArray(rows)||rows.length>1)return {public:state('unknown','SN cocok dengan beberapa record ACS. Periksa manual.')};
  if(!rows.length)return {public:state('missing')};
  const row=rows[0];if(!row.id||identity.serial(row.serialNumber)!==sn)return {public:state('unknown','Identitas ACS tidak cocok.')};
  const directory=identity.directory(data),known=[...(data.monitoringTargets||[]),...(data.radiusNas||[])].flatMap(row=>[row.id,row.name,row.host,row.address]).filter(Boolean);
  if(row.excluded||!identity.strictDeviceCandidate([row],{boundSerialNumbers:[sn],nasAliases:directory.aliasesFor(device.nasId),knownNasAliases:known}))return {public:state('preserved','Perangkat ACS berada di luar cakupan OLT ini.'),row};
  const accounts=(data.radiusUsers||[]).filter(user=>clean(user.username).toLowerCase()===clean(row.username).toLowerCase());
  if(accounts.length&&!accounts.some(account=>directory.compatible(account,{nasId:device.nasId})))return {public:state('preserved','NAS akun ACS berbeda. Data ACS dipertahankan.'),row};
  const actual=directory.customerForAcs(row),manual=device.links?.[sn]?.customerId;
  if(manual&&actual&&manual!==actual.id)return {public:state('preserved','Modem sudah mengarah ke pelanggan lain.'),row};
  const devices=olt.deviceRows(data).filter(item=>item.enabled);
  for(const other of devices){let snapshot;try{snapshot=await(options.snapshot||olt.snapshotFor)(other);}catch{continue;}
    for(const onu of snapshot?.onus||[]){if(identity.serial(onu.serialNumber)!==sn||(other.id===device.id&&String(onu.id)===String(target.id)))continue;
      const checked=Date.parse(snapshot.checkedAt||''),fresh=snapshot.status==='online'&&!snapshot.stale&&!snapshot.pendingRefresh&&Number.isFinite(checked)&&now-checked<=olt.CACHE_MS*2&&checked<=now+30000;
      if(!fresh||onu.status!=='offline')return {public:state('preserved',fresh&&onu.status==='online'?'SN masih aktif pada posisi OLT lain.':'Posisi lain dengan SN ini belum terverifikasi.'),row};
    }
  }
  const informed=Date.parse(row.lastInform||'');
  if(!Number.isFinite(informed)||informed>now+30000)return {public:state('preserved','Waktu inform ACS belum terverifikasi.'),row};
  if(now-informed<=ACTIVE_WINDOW)return {public:state('preserved','ACS masih menerima inform dalam 15 menit terakhir.'),row};
  const scoped=[...(user.lockedNasIds||[]),user.lockedNasId].filter(Boolean),global=['admin','owner','noc','secretary'].includes(user.role)||!scoped.length||scoped.includes('all');
  if(options.oltMissing&&!global&&!accounts.length&&!manual&&!row.tags?.some(tag=>directory.aliasesFor(device.nasId).includes(clean(tag).toLowerCase())))return {public:state('preserved','Kepemilikan NAS record ACS belum terverifikasi.'),row};
  return {public:state('ready'),row,owner:ownerSignature(data,device,row)};
}
async function inspect(data,device,sn,selector,actor,options={}){
  const cascade=data.settings?.networkIntegrationEnabled===true,user=permission(data,device,actor,cascade),now=options.now??Date.now();let found;
  try{found=await(options.inspectOlt||olt.readRemovalState)(data,device,sn,selector);}catch{return {cascade,canSubmit:false,olt:state('unavailable','OLT belum dapat diverifikasi. Penghapusan ditahan.'),acs:state('skipped'),target:null};}
  if(!found?.target||!olt.position(found.target.id)||identity.serial(found.target.serialNumber)!==sn)throw error('Posisi atau SN ONU tidak cocok');
  const current={cascade,canSubmit:false,olt:state(found.state),acs:state('skipped'),target:found.target,simulated:found.simulated===true};
  if(found.simulated){current.olt=state('simulated');current.acs=state('simulated');return current;}
  if(!['offline','missing'].includes(found.state)){current.olt=state(found.state==='online'?'online':'unknown',found.state==='online'?'Lepaskan modem lama dahulu. ONU yang masih online tidak dihapus.':'Status ONU belum terverifikasi.');return current;}
  if(!cascade){current.canSubmit=true;return current;}
  const candidate=await acsState(data,device,sn,found.target,user,{...options,oltMissing:found.state==='missing'},now);current.acs=candidate.public;current.candidate=candidate.row;current.owner=candidate.owner;
  current.canSubmit=['ready','missing','preserved'].includes(current.acs.state)&&(found.state!=='missing'||current.acs.state!=='preserved');return current;
}
function publicPreview(plan,token=''){return {token,serialNumber:plan.serialNumber,onuIndex:String(plan.target?.id||''),cascade:plan.cascade,canSubmit:plan.canSubmit,simulated:plan.simulated===true,olt:plan.olt,acs:plan.acs,expiresAt:plan.expires?new Date(plan.expires).toISOString():''};}
async function preview(data,device,serial,selector,actor,options={}){
  const sn=olt.normalizeSerial(serial);if(!sn)throw error('Serial ONU tidak valid');
  const index=clean(selector?.onuIndex);if(!olt.position(index)||!/^[0-9]+$/.test(index))throw error('Posisi ONU wajib diisi');
  const key=JSON.stringify([actor.id,device.id,index,sn,signature(data,device)]);if(previews.has(key))return previews.get(key);if(previews.size>=8)throw error('Pratinjau sedang penuh, coba kembali',429);
  const pending=(async()=>{const checked=await inspect(data,device,sn,{onuIndex:index},actor,options),plan={...checked,serialNumber:sn,actorId:actor.id,deviceId:device.id,signature:signature(data,device),expires:(options.now??Date.now())+TTL,status:'ready'};
    if(!checked.canSubmit)return publicPreview(plan);prune(options.now??Date.now());const token=crypto.randomBytes(24).toString('base64url');plans.set(token,plan);return publicPreview(plan,token);
  })();previews.set(key,pending);try{return await pending;}finally{previews.delete(key);}
}
function summary(oltResult,acsResult,cascade){
  const oltDone=['deleted','missing'].includes(oltResult.state),acsDone=['deleted','missing','skipped','preserved'].includes(acsResult.state),complete=oltDone&&acsDone;
  const message=!oltDone?'Penghapusan OLT belum terverifikasi. ACS tidak dihapus.':!cascade?'Data OLT selesai dihapus. Data billing tetap tersimpan.':acsResult.state==='preserved'?'Data OLT selesai diproses. ACS dipertahankan untuk melindungi modem yang masih digunakan.':!acsDone?'OLT selesai diproses; ACS belum berhasil. Periksa ulang untuk melanjutkan tahap ACS saja.':'Data OLT dan ACS selesai diproses. Member, invoice, dan transaksi tetap tersimpan.';
  return {complete,partial:oltDone&&!acsDone,warning:acsResult.state==='preserved',canRetry:!complete||acsResult.state==='preserved',cascade,olt:oltResult,acs:acsResult,message};
}
async function remove(data,device,serial,payload,actor,options={}){
  if(process.env.MIGRATION_MODE==='1')throw error('Mode dev terisolasi: aksi ke perangkat asli dinonaktifkan');
  const sn=olt.normalizeSerial(serial),plan=plans.get(clean(payload.token)),now=options.now??Date.now();
  if(!sn||payload.confirmDelete!==true||olt.normalizeSerial(payload.serialNumber)!==sn)throw error('Konfirmasi serial dan persetujuan penghapusan wajib diisi');
  permission(data,device,actor,data.settings?.networkIntegrationEnabled===true);
  if(!plan||plan.expires<=now||plan.actorId!==actor.id||plan.deviceId!==device.id||plan.serialNumber!==sn||String(plan.target.id)!==String(payload.onuIndex)||plan.signature!==signature(data,device))throw error('Pratinjau kedaluwarsa atau pengaturan berubah. Periksa ulang dahulu.',409);
  if(plan.status==='done')return plan.result;
  const lock=device.id+':'+plan.target.id,acsLock='acs:'+acs.normalizeSettings(data.settings||{}).baseUrl+':'+sn;
  if(plan.status==='running'||locks.has(lock)||locks.has(acsLock)||locks.size>=8)throw error('Penghapusan sedang diproses. Tunggu hasilnya.',409);
  plan.status='running';locks.add(lock);locks.add(acsLock);
  try{
    const checked=await inspect(data,device,sn,{onuIndex:plan.target.id},actor,options);
    if(!checked.canSubmit||checked.simulated)throw error(checked.olt.reason||checked.acs.reason||'Status perangkat berubah. Periksa ulang sebelum menghapus.',409);
    if(plan.candidate&&checked.candidate&&(checked.candidate.id!==plan.candidate.id||checked.owner&&plan.owner&&checked.owner!==plan.owner))throw error('Identitas ACS berubah sejak pratinjau. Penghapusan dibatalkan.',409);
    let removed;try{removed=await(options.removeOlt||olt.removeOnu)(data,device,sn,{serialNumber:sn,onuIndex:plan.target.id,confirmDelete:true},{...(options.oltTransport||{}),allowMissing:true,requireOffline:true});}catch{return plan.result=summary(state('failed','OLT belum berhasil dihapus.'),state('skipped'),plan.cascade);}
    if(!removed?.confirmed)return plan.result=summary(state('pending'),state('skipped'),plan.cascade);
    automatic.invalidate();let oltResult=state(removed.alreadyAbsent?'missing':'deleted');
    if(!plan.cascade)return plan.result=summary(oltResult,state('skipped'),false);
    try{
      const current=options.getData?await options.getData():data,currentDevice=olt.deviceRows(current).find(row=>row.id===device.id);if(!currentDevice||signature(current,currentDevice)!==plan.signature)throw error('Pengaturan integrasi berubah');const user=permission(current,currentDevice,actor,true);
      const candidate=await acsState(current,currentDevice,sn,plan.target,user,{...options,oltMissing:true},options.now??Date.now());
      if(['missing','preserved'].includes(candidate.public.state))return plan.result=summary(oltResult,candidate.public,true);
      if(candidate.public.state!=='ready')return plan.result=summary(oltResult,candidate.public,true);
      if(!plan.candidate||candidate.row.id!==plan.candidate.id||candidate.owner!==plan.owner)return plan.result=summary(oltResult,state('preserved','Identitas ACS berubah. Data dipertahankan.'),true);
      try{await(options.removeAcs||acs.deleteDevice)(current.settings||{},candidate.row.id);}catch(error){if(error.status!==404)throw error;}
      const remaining=await(options.findAcs||acs.removalDevicesBySerial)(current.settings||{},sn);
      if(!Array.isArray(remaining)||remaining.length)return plan.result=summary(oltResult,state('preserved','Perangkat muncul kembali atau penghapusan belum terverifikasi. Tidak dihapus ulang otomatis.'),true);
      return plan.result=summary(oltResult,state('deleted'),true);
    }catch{return plan.result=summary(oltResult,state('failed','ACS belum berhasil diproses. Tidak ada penghapusan ulang OLT.'),true);}
  }finally{if(plan.result)plan.status='done';else plan.status='ready';locks.delete(lock);locks.delete(acsLock);}
}
function invalidate(){for(const[key,plan]of plans)if(plan.status!=='running')plans.delete(key);}
module.exports={preview,remove,invalidate};
