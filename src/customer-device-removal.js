'use strict';

const crypto=require('node:crypto'),auth=require('./auth'),identity=require('./network-identity'),olt=require('./olt-monitor'),acs=require('./genieacs'),removal=require('./olt-device-removal'),automatic=require('./olt-auto-identity');
const plans=new Map(),locks=new Set(),previews=new Map(),TTL=300000;
const clean=value=>String(value||'').trim(),hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(message,status=409){const error=new Error(message);error.status=status;return error;}
function assertNotBusy(userId){if(locks.has(userId))throw fail('Penghapusan perangkat pelanggan sedang berjalan. Tunggu hasilnya.');}
function enabled(data){return data.settings?.networkIntegrationEnabled===true&&data.settings?.networkCustomerRemovalEnabled===true;}
function subject(data,userId,actor){
  const user=(data.users||[]).find(row=>row.id===actor.id),safe=auth.publicUser(user);
  if(!user||user.active===false||!['radius:write','olt:onu:delete','genieacs:write'].every(permission=>auth.hasPermission(safe,permission)))throw fail('Tidak memiliki izin penghapusan tiga lapis',403);
  if(!enabled(data))throw fail('Penghapusan tiga lapis belum diaktifkan',400);
  const account=(data.radiusUsers||[]).find(row=>row.id===userId&&row.serviceType==='pppoe');if(!account)throw fail('User PPP-DHCP tidak ditemukan',404);
  const directory=identity.directory(data),customers=(data.customers||[]).filter(row=>row.id===account.customerId||row.radiusUserId===account.id),customer=customers.length===1?customers[0]:null;
  if(!customer||directory.userForCustomer(customer)?.id!==account.id)throw fail('Member harus terhubung ke satu akun PPP-DHCP yang pasti');
  if((data.radiusUsers||[]).filter(row=>row.customerId===customer.id||clean(row.username).toLowerCase()===clean(account.username).toLowerCase()).length!==1)throw fail('Pelanggan memiliki akun lain atau username ganda. Periksa manual.');
  const visible=olt.visibleDevices(data,user),nasLocks=[...(user.lockedNasIds||[]),user.lockedNasId].filter(Boolean);if(nasLocks.length&&!nasLocks.includes('all')&&!['admin','owner','secretary','noc'].includes(user.role)&&!directory.aliasesFor(account.nasId).some(value=>nasLocks.flatMap(id=>directory.aliasesFor(id)).includes(value)))throw fail('Pelanggan di luar kewenangan NAS',403);
  return {account,customer,actor:user,visible};
}
function signature(data,value){const cfg=acs.normalizeSettings(data.settings||{});return hash([enabled(data),value.account,value.customer,[cfg.enabled,cfg.baseUrl,cfg.token,cfg.excludeUsernameSuffixes,cfg.usernameParameters],olt.deviceRows(data).map(row=>[row.id,row.host,row.nasId,row.updatedAt,row.links]),value.actor.id,value.actor.role,value.actor.active,value.actor.lockedNasIds,value.actor.lockedNasId]);}
async function discover(data,value,options={}){
  let modems=[];
  if(acs.configured(data.settings||{}))modems=await(options.findAccount||acs.removalDevicesForAccount)(data.settings||{},value.account.username);
  if(!Array.isArray(modems)||modems.length>1)throw fail('Lebih dari satu modem memakai akun ini. Pilih dan hapus perangkat manual dahulu.');
  const modem=modems[0],directory=identity.directory(data);
  if(modem&&(modem.excluded||directory.customerForAcs(modem)?.id!==value.customer.id))throw fail('Kepemilikan modem ACS tidak cocok dengan pelanggan');
  const serials=[value.customer.genieAcsSerialNumber,value.account.genieAcsSerialNumber,modem?.serialNumber].filter(Boolean).map(identity.serial),hits=[];
  const checkpoint=(data.networkRemovalRecords||[]).find(row=>row.userId===value.account.id&&row.signature===signature(data,value)&&row.target);
  const visible=new Set(value.visible.map(row=>row.id));
  for(const device of olt.deviceRows(data)){
    const boundHere=Object.values(device.links||{}).some(link=>link.customerId===value.customer.id);if(!directory.compatible(value.account,{nasId:device.nasId})&&!boundHere)continue;
    const snapshot=await(options.snapshot||olt.snapshotFor)(device),bound=Object.entries(device.links||{}).filter(([,link])=>link.customerId===value.customer.id).map(([sn])=>sn);
    const observed=Date.parse(snapshot?.checkedAt||''),now=options.now??Date.now();if(device.enabled===false||snapshot?.status!=='online'||snapshot.stale||snapshot.pendingRefresh||!Number.isFinite(observed)||now-observed>360000||observed>now+30000)throw fail('Snapshot OLT terkait belum mutakhir. Segarkan OLT sebelum menghapus pelanggan.');
    for(const onu of snapshot?.onus||[]){const match=bound.includes(onu.serialNumber)||(onu.identifierKind==='mac'?modem?.interfaceMacs?.includes(onu.serialNumber):serials.includes(identity.serial(onu.serialNumber)));if(match){if(!visible.has(device.id)||!directory.compatible(value.account,{nasId:device.nasId}))throw fail('Modem terkait berada di OLT/NAS di luar kewenangan');hits.push({device,onu});}}
    if(checkpoint?.target.deviceId===device.id&&!hits.some(hit=>hit.device.id===device.id&&hit.onu.id===checkpoint.target.onuId)){
      const position=olt.actionPosition(device,checkpoint.target.onuId);if(position&&!(snapshot?.onus||[]).some(onu=>onu.serialNumber===checkpoint.target.serialNumber)){if(!visible.has(device.id))throw fail('OLT di luar kewenangan');hits.push({device,onu:{...position,id:checkpoint.target.onuId,serialNumber:checkpoint.target.serialNumber}});}
    }
    for(const sn of bound)if(!(snapshot?.onus||[]).some(onu=>onu.serialNumber===sn)&&!(checkpoint?.target.deviceId===device.id&&checkpoint.target.serialNumber===sn))throw fail('Pemetaan manual OLT belum ditemukan pada snapshot. Periksa perangkat manual.');
  }
  if(hits.length>1)throw fail('Identitas modem ada pada beberapa posisi OLT. Penghapusan otomatis ditahan.');
  return {modem,hit:hits[0]||null};
}
function sameModem(left,right){return !left&&!right||Boolean(left&&right&&left.id===right.id&&left.serialNumber===right.serialNumber&&clean(left.username).toLowerCase()===clean(right.username).toLowerCase()&&left.registered===right.registered);}
function acsOffline(row,now){const at=Date.parse(row?.lastInform||'');return Number.isFinite(at)&&at<=now-900000;}
function publicPlan(plan,token=''){return{token,canSubmit:plan.canSubmit,simulated:plan.simulated,customer:{id:plan.customerId,name:plan.customerName,username:plan.username},olt:plan.olt,acs:plan.acs,expiresAt:new Date(plan.expires).toISOString(),message:plan.message||'Perangkat diperiksa dahulu. User/member dihapus hanya setelah tahap perangkat selesai. Invoice dan transaksi tetap disimpan.'};}
async function buildPreview(data,userId,actor,options={}){
  const value=subject(data,userId,actor),now=options.now??Date.now(),plan={userId,customerId:value.customer.id,customerName:value.customer.name||value.account.username,username:value.account.username,actorId:actor.id,signature:signature(data,value),expires:now+TTL,canSubmit:false,simulated:process.env.MIGRATION_MODE==='1'};
  if(plan.simulated)return publicPlan({...plan,olt:{state:'simulated',label:'Simulasi'},acs:{state:'simulated',label:'Simulasi'},message:'Mode dev terisolasi: perangkat asli tidak dihapus.'});
  try{
    const found=await discover(data,value,options);plan.modem=found.modem;plan.hit=found.hit?{deviceId:found.hit.device.id,onuId:found.hit.onu.id,serialNumber:found.hit.onu.serialNumber}:null;
    if(found.hit){const stageData=acs.configured(data.settings||{})?data:{...data,settings:{...data.settings,networkIntegrationEnabled:false}},stage=await(options.previewOlt||removal.preview)(stageData,found.hit.device,found.hit.onu.serialNumber,{onuIndex:found.hit.onu.id},actor,options);plan.devicePreview=stage;plan.olt={...stage.olt,name:found.hit.device.name,serialNumber:found.hit.onu.serialNumber,pon:found.hit.onu.ponKey};plan.acs=stage.acs;if(!stage.canSubmit||['preserved','unavailable','unknown','pending'].includes(stage.acs.state)){plan.message=stage.olt.reason||stage.acs.reason||'Perangkat belum aman untuk dihapus.';return publicPlan(plan);}}
    else{plan.olt={state:'missing',label:'Tidak ditemukan pada snapshot OLT'};plan.acs=found.modem?{state:acsOffline(found.modem,now)?'ready':'preserved',label:acsOffline(found.modem,now)?'Siap dihapus':'Masih menerima inform',serialNumber:found.modem.serialNumber}:{state:acs.configured(data.settings||{})?'missing':'skipped',label:acs.configured(data.settings||{})?'Tidak ada':'ACS tidak dikonfigurasi'};if(found.modem&&!acsOffline(found.modem,now)){plan.message='ACS masih aktif atau waktu inform belum jelas. Penghapusan ditahan.';return publicPlan(plan);}}
    plan.canSubmit=true;for(const[key,row]of plans)if(row.expires<=now&&!row.running)plans.delete(key);if(plans.size>=128)throw fail('Pratinjau penuh. Coba kembali.',429);const token=crypto.randomBytes(24).toString('base64url');plans.set(token,plan);return publicPlan(plan,token);
  }catch(error){plan.olt??={state:'unknown',label:'Belum terverifikasi'};plan.acs??={state:'unknown',label:'Belum terverifikasi'};plan.message=error.status===403?'Tidak memiliki akses ke perangkat terkait':error.status?error.message:'Perangkat belum dapat diverifikasi. Periksa koneksi sebelum mencoba ulang.';return publicPlan(plan);}
}
async function preview(data,userId,actor,options={}){
  const value=subject(data,userId,actor),key=JSON.stringify([userId,actor.id,signature(data,value)]);
  if(previews.has(key))return previews.get(key);
  if(previews.size>=4)throw fail('Pemeriksaan perangkat sedang penuh. Coba kembali.',429);
  const pending=buildPreview(data,userId,actor,options);previews.set(key,pending);
  try{return await pending;}finally{if(previews.get(key)===pending)previews.delete(key);}
}
async function execute(data,userId,payload,actor,options={}){
  if(process.env.MIGRATION_MODE==='1')throw fail('Mode dev terisolasi: penghapusan perangkat asli dinonaktifkan',400);
  const plan=plans.get(clean(payload.networkRemovalToken)),now=options.now??Date.now(),value=subject(data,userId,actor);
  if(!plan||!plan.canSubmit||plan.expires<=now||plan.userId!==userId||plan.actorId!==actor.id||payload.confirmDevices!==true||clean(payload.confirmUsername)!==plan.username||signature(data,value)!==plan.signature)throw fail('Pratinjau berubah/kedaluwarsa atau konfirmasi belum sesuai');
  if(plan.running||locks.has(userId)||locks.size>=2)throw fail('Penghapusan perangkat sedang berjalan',429);
  plan.running=true;locks.add(userId);
  const output={complete:false,olt:plan.olt,acs:plan.acs};
  try{
    if(plan.complete){if(options.finalize)await options.finalize(plan,plan.result);return{...plan.result,plan};}
    const latest=await(options.getData||(async()=>data))(),current=subject(latest,userId,actor);if(signature(latest,current)!==plan.signature)throw fail('Data pelanggan berubah. Periksa ulang dahulu.');const found=await discover(latest,current,options);
    if(!sameModem(plan.modem,found.modem)||Boolean(found.hit)!==Boolean(plan.hit)||found.hit&&(found.hit.device.id!==plan.hit.deviceId||found.hit.onu.id!==plan.hit.onuId||found.hit.onu.serialNumber!==plan.hit.serialNumber))throw fail('Modem atau posisi berubah sejak pratinjau');
    await options.journal?.({userId,customerId:plan.customerId,signature:plan.signature,target:plan.hit,olt:plan.olt,acs:plan.acs,status:'running'});
    if(found.hit){const stageData=acs.configured(latest.settings||{})?latest:{...latest,settings:{...latest.settings,networkIntegrationEnabled:false}},stageGet=async()=>{const next=await(options.getData||(async()=>data))();return acs.configured(next.settings||{})?next:{...next,settings:{...next.settings,networkIntegrationEnabled:false}};},reply=await(options.removeOlt||removal.remove)(stageData,found.hit.device,found.hit.onu.serialNumber,{token:plan.devicePreview.token,onuIndex:found.hit.onu.id,serialNumber:found.hit.onu.serialNumber,confirmDelete:true},actor,{...options,getData:stageGet});output.olt=reply.olt;output.acs=reply.acs;await options.journal?.({userId,customerId:plan.customerId,signature:plan.signature,target:plan.hit,...output,status:reply.complete?'devices-complete':'partial'});if(!reply.complete||!['deleted','missing','skipped'].includes(reply.acs.state))return{...output,message:reply.message};}
    else if(found.modem){if(!acsOffline(found.modem,now))throw fail('Modem ACS masih aktif. Penghapusan ditahan');const before=await(options.findAccount||acs.removalDevicesForAccount)(latest.settings||{},value.account.username);if(before.length!==1||!sameModem(before[0],plan.modem))throw fail('Identitas ACS berubah');await(options.removeAcs||acs.deleteDevice)(latest.settings||{},found.modem.id);const after=await(options.findAccount||acs.removalDevicesForAccount)(latest.settings||{},value.account.username);if(after.length)return{...output,acs:{state:'pending',label:'Penghapusan ACS belum terverifikasi'},message:'ACS belum terverifikasi; user/member tetap disimpan.'};output.acs={state:'deleted',label:'Berhasil dihapus'};}
    plan.complete=true;plan.result={...output,complete:true,message:'Tahap perangkat selesai. User/member dapat dihapus.'};await options.journal?.({userId,customerId:plan.customerId,signature:plan.signature,target:plan.hit,...output,status:'devices-complete'});automatic.invalidate();if(options.finalize)await options.finalize(plan,plan.result);return{...plan.result,plan};
  }finally{plan.running=false;locks.delete(userId);}
}
function validateFinal(data,plan,actor){const value=subject(data,plan.userId,actor);if(!plan.complete||signature(data,value)!==plan.signature)throw fail('Perangkat selesai diproses tetapi data pelanggan berubah. User/member dipertahankan.');return value;}
module.exports={enabled,subject,preview,execute,validateFinal,assertNotBusy};
