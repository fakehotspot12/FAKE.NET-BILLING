'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const auth = require('./auth');
const olt = require('./olt-monitor');
const networkIdentity=require('./network-identity');
const autoIdentity=require('./olt-auto-identity');
const {addressFromTags}=require('./network-address');
const PHOTO_ROOT = path.join(__dirname, '..', 'data', 'private', 'service-tickets');
const CATEGORIES = Object.freeze([
  ['new-installation','request','Pasang baru (PSB)'],
  ['internet-down','fault','Internet mati / lampu LOS'], ['internet-slow','fault','Internet lambat / sering putus'],
  ['wifi-modem','fault','WiFi atau modem bermasalah'], ['addon-fault','fault','Layanan tambahan bermasalah'],
  ['package-change','request','Perubahan paket internet'], ['addon','request','Tambah layanan'],
  ['relocation','request','Pindah alamat / posisi modem'], ['customer-data','request','Perubahan data pelanggan'],
  ['billing','request','Tagihan / pembayaran'], ['pause-stop','request','Berhenti sementara / tutup layanan'],
  ['other-fault','fault','Gangguan lainnya'], ['other-request','request','Permintaan lainnya']
].map(([id,kind,label]) => Object.freeze({id,kind,label})));
const STATUS_LABELS = {new:'Laporan diterima',assigned:'Petugas ditugaskan',working:'Sedang ditangani',resolved:'Selesai'};
const PUBLIC_STAGES=Object.freeze({received:'Laporan diterima',assigned:'Petugas ditugaskan','on-way':'Petugas menuju lokasi',checking:'Sedang diperiksa',handling:'Sedang ditangani','waiting-customer':'Menunggu konfirmasi Anda','customer-replied':'Balasan Anda diterima',resolved:'Selesai'});
const STAGE_DETAILS=Object.freeze({received:'Laporan Anda sudah diterima dan menunggu petugas.',assigned:'Petugas sudah ditugaskan untuk menangani laporan Anda.','on-way':'Petugas sedang menuju lokasi Anda.',checking:'Petugas sedang memeriksa layanan untuk menentukan penyebab kendala.',handling:'Layanan sedang ditangani oleh petugas.','waiting-customer':'Penanganan menunggu konfirmasi atau kesiapan Anda.','customer-replied':'Balasan Anda sudah diterima dan menunggu ditinjau petugas.',resolved:'Laporan Anda telah diselesaikan oleh petugas.'});

function coordinates(latitude,longitude){
  if(latitude===null||longitude===null||latitude===undefined||longitude===undefined||String(latitude).trim()===''||String(longitude).trim()==='')return null;
  const lat=Number(latitude),lon=Number(longitude);return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&(lat!==0||lon!==0)?{latitude:lat,longitude:lon}:null;
}
function ticketLocation(data,ticket){
  const device=(data.oltDevices||[]).find(row=>row.id===ticket.oltId);
  const automatic=autoIdentity.customerForTicket(data,ticket,device);
  const customer=ticket.customerId?(data.customers||[]).find(row=>row.id===ticket.customerId):autoIdentity.manualCustomerFor(data,device,{serialNumber:ticket.serialNumber})||automatic?.customer;
  const point=(customer&&coordinates(customer.latitude,customer.longitude))||coordinates(ticket.latitude,ticket.longitude);
  const address=customer?.address||ticket.contactAddress||addressFromTags(data,autoIdentity.modemForTicket(data,ticket,device));
  return {name:customer?.name||customer?.customerName||ticket.customerName||'',phone:customer?.phone||customer?.whatsapp||ticket.contactPhone||'',address,coordinates:point,locationUrl:point?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(point.latitude+','+point.longitude):''};
}
function publicProgress(ticket){
  const rows=[{stage:'received',at:ticket.createdAt}],add=(stage,at,note='')=>{if(!PUBLIC_STAGES[stage]||!Number.isFinite(Date.parse(at)))return;const previous=rows.at(-1);if(previous?.stage===stage&&(previous.note||'')===note)return;rows.push({stage,at,...(note?{note}:{})});};
  for(const entry of (ticket.history||[]).slice(-50)){
    if(entry.kind==='team')continue;
    const previousStage=rows.at(-1)?.stage,keepStage=entry.kind==='updated'&&entry.status==='working'&&['on-way','checking','handling','waiting-customer'].includes(previousStage);
    const sameStatus=entry.status===(['on-way','checking','handling','waiting-customer'].includes(previousStage)?'working':{received:'new',assigned:'assigned',resolved:'resolved'}[previousStage]);
    if(entry.kind==='updated'&&!entry.publicStage&&!entry.publicNote&&sameStatus)continue;
    const stage=Object.hasOwn(PUBLIC_STAGES,entry.publicStage||'')?entry.publicStage:keepStage?previousStage:{assigned:'assigned',working:'handling',resolved:'resolved',new:'received'}[entry.status];
    if(stage)add(stage,entry.at,typeof entry.publicNote==='string'?entry.publicNote.slice(0,300):'');
  }
  const current={new:'received',assigned:'assigned',working:'handling',resolved:'resolved'}[ticket.status];
  if(current&&((current==='handling'&&!['on-way','checking','handling','waiting-customer'].includes(rows.at(-1)?.stage))||(current!=='handling'&&current!==rows.at(-1)?.stage)))add(current,ticket.resolvedAt||ticket.updatedAt);
  const response=(ticket.messages||[]).findLast(row=>row.role==='customer');
  if(ticket.status==='working'&&rows.at(-1)?.stage==='waiting-customer'&&Date.parse(response?.at)>Date.parse(rows.at(-1).at))add('customer-replied',response.at);
  return [rows[0],...rows.slice(1).slice(-11)].filter(row=>Number.isFinite(Date.parse(row.at))).map(row=>({...row,label:PUBLIC_STAGES[row.stage],note:row.note||STAGE_DETAILS[row.stage],customNote:Boolean(row.note)}));
}
function progress(ticket,payload,actor,now=Date.now()){
  require('./ticket-team').requireStatusChange(ticket,payload,actor);
  const stage=payload.stage|| (payload.status==='resolved'?'resolved':'handling');if(!['on-way','checking','handling','waiting-customer','resolved'].includes(stage))throw error('Progres layanan tidak valid');
  const state=stage==='resolved'?'resolved':'working';if(payload.stage&&payload.status&&payload.status!==state)throw error('Status dan progres tidak sesuai');
  const note=cleanText(payload.note||'',1000),publicNote=cleanText(payload.publicNote||'',300),latest=ticket.history?.at(-1);
  const internalNote=note||(stage==='waiting-customer'?'Menunggu konfirmasi pelanggan':PUBLIC_STAGES[stage]);
  if(latest?.publicStage===stage&&latest.publicNote===publicNote&&latest.note===internalNote&&now-Date.parse(latest.at)<60000){olt.requireTicketEditor(ticket,{},actor);if(actor.role==='technician'&&!require('./ticket-team').memberIds(ticket).includes(actor.id))throw error('Tiket ditangani petugas lain',403);return ticket;}
  let next=olt.progressTicket(ticket,{status:state,note:internalNote},actor,now);
  if(next===ticket)next={...ticket,updatedAt:new Date(now).toISOString(),history:[...(ticket.history||[]),{...latest,id:crypto.randomUUID(),at:new Date(now).toISOString()}].slice(-50)};
  next.history=next.history.map((entry,index)=>index===next.history.length-1?{...entry,publicStage:stage,publicNote}:entry);
  next.lastStaffMessageAt=new Date(now).toISOString();return next;
}

function error(message, status = 400) { const value=new Error(message);value.status=status;return value; }
function cleanText(value, max = 1500) {
  if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw error('Keterangan tidak valid');
  return value.trim();
}
function categoryFor(id) { const value=CATEGORIES.find(row=>row.id===id);if(!value)throw error('Pilih kategori layanan');return value; }
function isServiceTicket(ticket){return ['wifiku','staff-service'].includes(ticket?.source)&&ticket.scope==='service';}
function visibilityFilter(data,user,devices) {
  const safe=auth.publicUser(user);
  if(!user||user.active===false||!auth.hasPermission(safe,'olt:tickets:read'))return()=>false;
  const unrestricted=['admin','owner','noc','secretary'].includes(user.role);
  let allowed,locks;
  return ticket=>{
    if(safe.ticketCreationLimited&&ticket.id&&!(ticket.source==='staff-service'&&ticket.createdBy===user.id))return false;
    if(user.role==='partner'&&ticket.customerId){const member=(data.customers||[]).find(row=>row.id===ticket.customerId),account=member&&networkIdentity.directory(data).userForCustomer(member),username=String(account?.username||member?.username||'').toLowerCase();if(!safe.partnerUsernameSuffixes.some(suffix=>username.endsWith(String(suffix).toLowerCase())))return false;}
    if(!isServiceTicket(ticket)){allowed??=new Set((devices||olt.visibleDevices(data,user)).map(device=>device.id));return allowed.has(ticket.oltId);}
    if(ticket.source==='staff-service'&&!ticket.nasId&&!ticket.customerId||unrestricted)return true;
    if(!locks){locks=new Set([...(Array.isArray(user.lockedNasIds)?user.lockedNasIds:[]),user.lockedNasId].filter(Boolean));for(const nas of [...(data.radiusNas||[]),...(data.monitoringTargets||[])])if([nas.id,nas.monitoringTargetId,nas.monitoringId].some(id=>locks.has(id)))for(const id of [nas.id,nas.monitoringTargetId,nas.monitoringId])if(id)locks.add(id);}
    return !locks.size||locks.has('all')||Boolean(ticket.nasId&&locks.has(ticket.nasId));
  };
}
function visible(data,user,ticket){return visibilityFilter(data,user)(ticket);}
function customerTickets(data,customer) { return (data.oltTickets||[]).filter(row=>isServiceTicket(row)&&row.customerId===customer.id); }
function markRead(ticket,seenAt,now=Date.now()){
  const seen=seenAt===undefined?now:typeof seenAt==='string'?Date.parse(seenAt):NaN;
  if(!Number.isFinite(seen))throw error('Waktu pembacaan laporan tidak valid');
  const staff=Date.parse(ticket.lastStaffMessageAt||'')||0,through=Math.min(staff,seen,now);
  if(!staff||through<=(Date.parse(ticket.customerReadAt||'')||0))return false;
  ticket.customerReadAt=new Date(through).toISOString();return true;
}
function publicTicket(data,ticket,detail = false) {
  const staff=(data.users||[]).find(user=>user.id===ticket.assignedTo),read=Date.parse(ticket.customerReadAt||'')||0;
  const progress=publicProgress(ticket);
  const title=ticket.category==='pause-stop'&&ticket.title==='Berhenti sementara / berlangganan'?categoryFor(ticket.category).label:ticket.title;
  return {id:ticket.id,number:require('./ticket-reference').number(ticket),title,kind:ticket.kind,category:ticket.category,
    categoryLabel:categoryFor(ticket.category).label,status:ticket.status,statusLabel:progress.at(-1)?.label||STATUS_LABELS[ticket.status]||'Menunggu petugas',
    staffName:staff?.name||staff?.username||'',createdAt:ticket.createdAt,updatedAt:ticket.updatedAt,
    unread:(Date.parse(ticket.lastStaffMessageAt||'')||0)>read,
    ...(detail?{progress,messages:(ticket.messages||[]).slice(-100).map(row=>({id:row.id,role:row.role,name:row.name,text:row.text,at:row.at,
      photos:(row.photos||[]).map(photo=>({id:photo.id}))}))}:{})};
}
function customerList(data,customer,query = {}) {
  const all=customerTickets(data,customer),closed=query.closed==='1',rows=all.filter(row=>(row.status==='resolved')===closed)
    .sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const pages=Math.max(1,Math.ceil(rows.length/10)),page=Math.max(1,Math.min(pages,parseInt(query.page,10)||1));
  return {tickets:rows.slice((page-1)*10,page*10).map(row=>publicTicket(data,row)),page,pages,total:rows.length,
    unread:all.filter(row=>(Date.parse(row.lastStaffMessageAt||'')||0)>(Date.parse(row.customerReadAt||'')||0)).length,
    categories:CATEGORIES,closed};
}
function validatePost(ticket,payload,role,now) {
  const text=cleanText(payload.text||'');if(!text)throw error('Tuliskan keterangan terlebih dahulu');
  const messages=ticket.messages||[],last=messages.at(-1);
  if(ticket.status==='resolved')throw error('Laporan sudah selesai. Buat laporan lanjutan jika masih ada kendala.',409);
  if(last?.role===role&&last.text===text&&now-Date.parse(last.at)<120000&&!payload.photo)return {duplicate:true,text};
  if(role==='customer'&&now-(Date.parse(ticket.lastCustomerMessageAt||'')||0)<10000)throw error('Tunggu beberapa detik sebelum mengirim pesan berikutnya',429);
  if(messages.length>=100)throw error('Batas percakapan laporan tercapai. Hubungi admin untuk melanjutkan.',409);
  if(payload.photo&&messages.reduce((n,row)=>n+(row.photos||[]).length,0)>=5)throw error('Maksimal 5 foto pada satu laporan');
  return {text};
}
async function savePhoto(value, root = PHOTO_ROOT) {
  if(typeof value!=='string'||value.length>1_200_000)throw error('Ukuran foto terlalu besar');
  const match=value.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw error('Gunakan foto JPG, PNG atau WebP');
  const source=Buffer.from(match[1],'base64');if(!source.length||source.length>800000)throw error('Ukuran foto maksimal 800 KB');
  let buffer;try{buffer=await sharp(source,{failOn:'error',limitInputPixels:12_000_000}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:70,effort:3}).toBuffer();}catch{throw error('Foto tidak dapat dibaca');}
  if(buffer.length>256000)throw error('Foto masih terlalu besar. Pilih foto dengan ukuran lebih kecil.');
  const id=crypto.randomUUID();await fs.mkdir(root,{recursive:true,mode:0o700});await fs.writeFile(path.join(root,id+'.webp'),buffer,{flag:'wx',mode:0o600});return {id,size:buffer.length};
}
async function appendMessage(data,ticket,payload,actor,{customer=false,now=Date.now(),photoRoot} = {}) {
  const role=customer?'customer':'staff',validation=validatePost(ticket,payload,role,now);if(validation.duplicate)return {changed:false,ticket};
  const photos=payload.photo?[await savePhoto(payload.photo,photoRoot)]:[],at=new Date(now).toISOString();
  ticket.messages=[...(ticket.messages||[]),{id:crypto.randomUUID(),role,name:customer?'Anda':actor.name||actor.username||'Petugas',text:validation.text,at,photos}];
  ticket.updatedAt=at;ticket[customer?'lastCustomerMessageAt':'lastStaffMessageAt']=at;
  if(customer)ticket.customerReadAt=at;
  return {changed:true,ticket};
}
async function create(data,customer,payload,context = {}) {
  const category=categoryFor(payload.category),now=context.now??Date.now(),all=customerTickets(data,customer);
  const previous=all.find(row=>row.status!=='resolved'&&row.category===category.id);
  if(previous){const result=await appendMessage(data,previous,payload,customer,{customer:true,now,photoRoot:context.photoRoot});return {...result,created:false};}
  if(all.filter(row=>row.status!=='resolved').length>=5)throw error('Masih ada 5 laporan aktif. Lanjutkan pada laporan yang sesuai.',429);
  if(all.filter(row=>now-Date.parse(row.createdAt)<86400000).length>=10)throw error('Batas pengajuan hari ini tercapai. Silakan hubungi admin.',429);
  if((data.oltTickets||[]).filter(row=>row.status!=='resolved').length>=500)throw error('Layanan bantuan sedang penuh. Silakan hubungi admin.',429);
  cleanText(payload.text||'');const at=new Date(now).toISOString();
  const ticket={id:crypto.randomUUID(),number:'TKT-'+at.slice(0,10).replaceAll('-','')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase(),source:'wifiku',scope:'service',kind:category.kind,category:category.id,
    title:category.label,description:'',customerId:customer.id,customerName:customer.name||customer.username||'Pelanggan',username:customer.username||'',
    nasId:context.nasId||'',nasName:context.nasName||'',oltId:'',pon:'',serialNumber:'',assignedTo:'',status:'new',createdAt:at,updatedAt:at,createdBy:'customer:'+customer.id,messages:[]};
  await appendMessage(data,ticket,payload,customer,{customer:true,now,photoRoot:context.photoRoot});
  data.oltTickets=olt.pruneTickets([...(data.oltTickets||[]),ticket]);return {ticket,created:true,changed:true};
}
function installationPackages(data,actor,customer=null) {
  const identities=networkIdentity.directory(data),account=customer&&identities.userForCustomer(customer);
  return (data.radiusProfiles||[]).filter(profile=>profile.active!==false&&profile.serviceType==='pppoe'&&profile.id&&profile.name)
    .filter(profile=>!profile.nasId||profile.nasId==='all'||((!customer||identities.compatible(account||customer,profile))&&visible(data,actor,{source:'staff-service',scope:'service',nasId:profile.nasId})))
    .map(profile=>({id:profile.id,name:profile.name,price:Math.max(0,Math.round(Number(profile.price)||0))}))
    .sort((a,b)=>a.name.localeCompare(b.name,'id',{numeric:true,sensitivity:'base'}));
}
async function createStaff(data,payload,actor) {
  if(!['olt:tickets:write','olt:tickets:create'].some(permission=>auth.hasPermission(auth.publicUser(actor),permission)))throw error('Tidak memiliki izin membuat tiket',403);
  const category=categoryFor(payload.category),customerId=cleanText(payload.customerId||'',100);
  const customer=customerId?(data.customers||[]).find(row=>row.id===customerId):null;if(customerId&&!customer)throw error('Pelanggan tidak ditemukan');
  const name=cleanText(customer?.name||payload.customerName||'',100);if(!name)throw error('Nama pemohon wajib diisi');
  const identities=networkIdentity.directory(data),account=customer?identities.userForCustomer(customer)||{}:{};
  const aliases=identities.aliasesFor(account.nasId||customer?.nasId||customer?.nas||customer?.site||''),nas=[...(data.radiusNas||[]),...(data.monitoringTargets||[])].find(row=>[row.id,row.monitoringTargetId,row.name,row.address,row.host].some(value=>value&&aliases.includes(String(value).trim().toLowerCase()))),nasId=nas?.id||'';
  const text=cleanText(payload.text||'');if(!text)throw error('Keterangan permintaan wajib diisi');
  const phone=cleanText(customer?.phone||customer?.whatsapp||payload.phone||'',24),address=cleanText(customer?.address||payload.address||'',500);if(phone&&!/^[+0-9 ()-]+$/.test(phone))throw error('Nomor kontak tidak valid');
  const pair=String(payload.coordinates||'').trim().split(/\s*,\s*/);let point=customer?coordinates(customer.latitude,customer.longitude):null;
  if(!point&&String(payload.coordinates||'').trim()){if(pair.length!==2||!(point=coordinates(pair[0],pair[1])))throw error('Isi koordinat latitude, longitude yang valid');}
  const preview={source:'staff-service',scope:'service',nasId,customerId:customer?.id||''};if(!visible(data,actor,preview))throw error('Pelanggan di luar kewenangan',403);
  const packageId=cleanText(payload.packageId||'',100),requestedPackage=packageId&&category.id==='new-installation'?installationPackages(data,actor,customer).find(row=>row.id===packageId):null;
  if(packageId&&!requestedPackage)throw error('Pilih paket PSB aktif yang sesuai kewenangan dan pelanggan');
  const now=Date.now(),at=new Date(now).toISOString(),previous=(data.oltTickets||[]).find(row=>row.source==='staff-service'&&row.createdBy===actor.id&&row.status!=='resolved'&&now-Date.parse(row.createdAt)<120000&&row.customerId===preview.customerId&&row.customerName===name&&row.category===category.id&&(row.requestedPackage?.id||'')===packageId&&row.messages?.[0]?.text===text);
  if(previous)return previous;
  if((data.oltTickets||[]).filter(row=>row.status!=='resolved').length>=500)throw error('Batas tiket aktif tercapai',429);
  const ticket={...preview,id:crypto.randomUUID(),number:'TKT-'+at.slice(0,10).replaceAll('-','')+'-'+crypto.randomBytes(3).toString('hex').toUpperCase(),kind:category.kind,category:category.id,title:category.label,description:'',customerName:name,username:account.username||customer?.username||'',nasName:nas?.name||'',oltId:'',pon:'',serialNumber:'',status:'new',assignedTo:'',createdAt:at,updatedAt:at,createdBy:actor.id,contactPhone:phone,contactAddress:address,...(point||{}),...(requestedPackage?{requestedPackage}:{}),lastStaffMessageAt:at,customerReadAt:'',messages:[{id:crypto.randomUUID(),role:'staff',name:actor.name||actor.username||'Petugas',text,at,photos:[]}]};
  data.oltTickets=olt.pruneTickets([...(data.oltTickets||[]),ticket]);return ticket;
}
function update(data,payload,actor,previous) {
  if(!auth.hasPermission(auth.publicUser(actor),'olt:tickets:write'))throw error('Tidak memiliki izin mengubah tiket',403);
  require('./ticket-team').requireStatusChange(previous,payload,actor);
  olt.requireTicketEditor(previous,payload,actor);
  const title=cleanText(payload.title??previous.title,160);if(!title)throw error('Judul tiket wajib diisi');
  const status=payload.status??previous.status;if(!olt.TICKET_STATUSES.includes(status))throw error('Status tiket tidak valid');
  const assignedTo=cleanText(payload.assignedTo??previous.assignedTo,100);
  if(assignedTo&&!(data.users||[]).some(user=>user.id===assignedTo&&auth.hasPermission(auth.publicUser(user),'olt:tickets:write')&&visible(data,user,previous)))throw error('Petugas tiket tidak valid atau di luar NAS');
  const at=new Date().toISOString(),description=cleanText(payload.description??previous.description??''),publicNote=cleanText(payload.publicNote||'',300);
  return {...previous,title,status,assignedTo,companionIds:assignedTo===previous.assignedTo?require('./ticket-team').companionIds(previous):[],description,updatedAt:at,updatedBy:actor.id,resolvedAt:status==='resolved'?previous.resolvedAt||at:'',
    ...(publicNote||status!==previous.status||assignedTo!==previous.assignedTo?{lastStaffMessageAt:at}:{}),
    history:[...(previous.history||[]),{id:crypto.randomUUID(),at,userId:actor.id,userName:actor.name||actor.username,kind:'updated',note:description||'Data tiket diperbarui',status,...(publicNote?{publicNote}:{})}].slice(-50)};
}
async function cleanupPhotos(data,root = PHOTO_ROOT,now = Date.now()) {
  const referenced=new Set((data.oltTickets||[]).flatMap(ticket=>(ticket.messages||[]).flatMap(message=>(message.photos||[]).map(photo=>photo.id+'.webp'))));
  const entries=await fs.readdir(root,{withFileTypes:true}).catch(()=>[]);let removed=0;
  for(const entry of entries){if(removed>=100)break;if(!entry.isFile()||!/^[a-f0-9-]{36}\.webp$/.test(entry.name)||referenced.has(entry.name))continue;const target=path.join(root,entry.name),stat=await fs.stat(target).catch(()=>null);if(stat&&now-stat.mtimeMs>7*86400000){await fs.unlink(target);removed++;}}
  return removed;
}
module.exports={CATEGORIES,STATUS_LABELS,PUBLIC_STAGES,PHOTO_ROOT,error,coordinates,ticketLocation,publicProgress,progress,isServiceTicket,visible,visibilityFilter,customerTickets,markRead,publicTicket,customerList,appendMessage,create,installationPackages,createStaff,update,savePhoto,cleanupPhotos};
