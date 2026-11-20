'use strict';

const crypto=require('node:crypto'),vendors=require('./olt-vendors');
const CACHE_MS=300000,cache=new Map(),pending=new Map(),attempts=new Map(),onuCache=new Map(),onuPending=new Map();
const tidy=value=>String(value||'').replace(/--\s*More\s*--\s*/gi,'').replace(/\r/g,'');
const name=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)?value:'';
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
function bounded(value,min,max,label){const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)fail(label+' tidak valid');return n;}
function address(value){return /^[1-9]\d?\/(?:[0-9]|[12]\d|3[01])\/(?:[1-9]|1[0-6]):(?:[1-9]\d{0,3})$/.test(String(value||''))?String(value):'';}
function command(result,query){const rows=result?.outputs?.filter(row=>row.command===query)||[];if(rows.length!==1)fail('Respons profil OLT belum lengkap',503);return tidy(rows[0].stdout);}
function blocks(value){return tidy(value).split(/(?:^|\n)\s*Profile name\s*:\s*/i).slice(1).map(part=>({name:part.split('\n')[0].trim(),text:part}));}
function unique(rows){const seen=new Set();for(const row of rows){if(!name(row.name)||seen.has(row.name))fail('Identitas profil OLT tidak lengkap atau ganda',503);seen.add(row.name);}return rows;}
function parseCatalogue(result){
 if(!result?.success)fail('Profil ZTE belum dapat dibaca',503);
 const version=command(result,'show version-running'),firmwares=[...new Set([...version.matchAll(/^\d+\/\d+\/\d+\s+\S+\s+MVR\s+(\S+)/gm)].map(match=>match[1]))];
 const tcont=unique(blocks(command(result,'show gpon profile tcont')).map(block=>{const row=block.text.match(/^\s*([1-5])\s+(\d+)\s+(\d+)\s+(\d+)\s+/m);if(!row)fail('Format T-CONT belum dikenali',503);return{name:block.name,type:Number(row[1]),fixed:Number(row[2]),assured:Number(row[3]),maximum:Number(row[4])};}));
 const traffic=unique(blocks(command(result,'show gpon profile traffic')).map(block=>{const row=block.text.match(/^\s*(\d+)\s+(\d+)\s+(\d+|default)\s+(\d+|default)\b/m);if(!row)fail('Format profil downstream belum dikenali',503);return{name:block.name,sir:Number(row[1]),pir:Number(row[2])};}));
 const vlan=unique(blocks(command(result,'show gpon onu profile vlan')).map(block=>{const tag=block.text.match(/^\s*Tag mode:\s*(\S+)/m)?.[1],id=Number(block.text.match(/^\s*CVLAN:\s*(\d+)/m)?.[1]);if(!['tag','transparent','untag'].includes(tag)||!Number.isSafeInteger(id)||id<1||id>4094)fail('Format profil VLAN belum dikenali',503);return{name:block.name,mode:tag,vlan:id};}));
 const rawVlans=command(result,'show vlan summary'),count=Number(rawVlans.match(/All created vlan num:\s*(\d+)/i)?.[1]),list=rawVlans.match(/Details are following:\s*\n\s*([\d,\s-]+)/i)?.[1]||'',vlans=new Set();
 for(const token of list.trim().split(/[,\s]+/).filter(Boolean)){const match=token.match(/^(\d+)(?:-(\d+))?$/);if(!match)fail('Daftar VLAN belum lengkap',503);const first=bounded(match[1],1,4094,'VLAN'),last=bounded(match[2]||match[1],first,4094,'VLAN');for(let id=first;id<=last;id++)vlans.add(id);}
 if(!tcont.length||!traffic.length||!firmwares.length||!Number.isSafeInteger(count)||count!==vlans.size)fail('Katalog profil belum lengkap; perubahan ditahan',503);
 for(const row of tcont){for(const key of['fixed','assured','maximum'])bounded(row[key],0,100000000,'Bandwidth T-CONT');if((row.type===1?row.fixed:row.type===2?row.assured:row.maximum)<64)fail('Kapasitas T-CONT belum valid',503);}
 for(const row of traffic){bounded(row.sir,0,100000000,'SIR');bounded(row.pir,64,100000000,'PIR');if(row.sir>row.pir)fail('Profil downstream tidak konsisten',503);}
 return{firmwares,tcont,traffic,vlan,vlans:[...vlans].sort((a,b)=>a-b)};
}
function field(text,label){return tidy(text).match(new RegExp('^\\s*'+label+'\\s*:\\s*([^\\n]+)','im'))?.[1]?.trim()||'';}
function parseOnu(result,requested){
 const index=address(requested);if(!index||!result?.success)fail('Alamat atau respons ONU belum terverifikasi',503);const iface='gpon-onu_'+index;
 const detail=command(result,'show gpon onu detail-info '+iface),config=command(result,'show running-config interface '+iface),capability=command(result,'show gpon remote-onu capability '+iface);
 const serial=field(detail,'Serial number').toUpperCase(),type=field(detail,'Type');
 if(field(detail,'ONU interface')!==iface||!new RegExp('^interface '+iface+'\\s*$','m').test(config)||!/^[A-Z0-9]{12}$/.test(serial)||!name(type))fail('Identitas atau posisi ONU berubah; baca ulang',409);
 const typeText=command(result,'show onu-type gpon '+type),typeName=field(typeText,'ONU type name');if(typeName!==type)fail('ONU-type tidak cocok',409);
 const limits={tcont:Math.min(bounded(field(capability,'T-CONT number'),1,255,'T-CONT fisik'),bounded(field(typeText,'Max T-CONT'),1,255,'Batas ONU-type T-CONT')),gem:Math.min(bounded(field(capability,'GEM port number'),1,4096,'GEM fisik'),bounded(field(typeText,'Max GEM port'),1,4096,'Batas ONU-type GEM'))};
 const tcont=[],gems=[],services=[];
 for(const line of config.split('\n')){
  let match;if((match=line.match(/^\s*tcont (\d+)(?: name \S+)? profile (\S+)\s*$/))){if(!name(match[2]))fail('Profil T-CONT ONU belum dikenali',503);tcont.push({id:Number(match[1]),profile:match[2]});}
  else if((match=line.match(/^\s*gemport (\d+)(?: name \S+)?(?: unicast)? tcont (\d+)\s*$/)))gems.push({id:Number(match[1]),tcont:Number(match[2])});
  else if((match=line.match(/^\s*gemport (\d+) traffic-limit downstream (\S+)\s*$/))){if(!name(match[2]))fail('Profil GEM ONU belum dikenali',503);const gem=gems.find(row=>row.id===Number(match[1]));if(!gem)fail('Urutan GEM belum dikenali',503);gem.downstream=match[2];}
  else if((match=line.match(/^\s*service-port (\d+) vport (\d+) user-vlan (\d+) vlan (\d+)\s*$/)))services.push({id:Number(match[1]),gem:Number(match[2]),userVlan:Number(match[3]),vlan:Number(match[4])});
  else if(/^\s*(?:tcont|gemport|service-port)\b/.test(line))fail('ONU memiliki konfigurasi layanan lanjutan; gunakan pemeriksaan manual',409);
 }
 const check=(rows,max)=>{const ids=rows.map(row=>row.id);return ids.every(id=>Number.isSafeInteger(id)&&id>=1&&id<=max)&&new Set(ids).size===ids.length;};
 if(!check(tcont,limits.tcont)||!check(gems,limits.gem)||!check(services,128)||gems.some(gem=>!tcont.some(row=>row.id===gem.tcont))||services.some(service=>!gems.some(row=>row.id===service.gem)))fail('Alokasi T-CONT/GEM existing tidak konsisten',409);
 return{address:index,serialNumber:serial,type,status:field(detail,'Phase state'),configState:field(detail,'Config state'),limits,tcont,gems,services};
}
const upstream=profile=>profile.type===1?profile.fixed:profile.type===2?profile.assured:profile.maximum;
function plan(catalogue,input={},onu=null){
 if(!catalogue?.tcont?.length||!catalogue?.traffic?.length)fail('Baca profil OLT terlebih dahulu');
 const mode=input.mode||'automatic';if(!['automatic','manual'].includes(mode))fail('Mode profil tidak valid');
 const operation=input.operation||'add';if(!['add','edit'].includes(operation))fail('Jenis perubahan layanan tidak valid');if(operation==='edit'&&!onu)fail('Baca ONU sebelum mengedit layanan existing');
 const upload=bounded(input.uploadKbps,64,1244160,'Upload (Kbps)'),download=bounded(input.downloadKbps,64,2488320,'Download (Kbps)');
 if(!Array.isArray(input.vlans)||!input.vlans.length||input.vlans.length>16)fail('Pilih 1-16 VLAN');const vlans=[...new Set(input.vlans.map(value=>bounded(value,2,4094,'VLAN')))];if(vlans.length!==input.vlans.length||vlans.some(id=>!catalogue.vlans.includes(id)))fail('VLAN harus sudah tersedia di OLT dan tidak ganda');
 const binding=input.binding||'trunk';if(!['untagged','trunk','transparent'].includes(binding)||binding==='untagged'&&vlans.length!==1)fail('Mode port atau jumlah VLAN tidak sesuai');
 const find=(rows,n)=>{if(!name(n))fail('Nama profil tidak valid');const row=rows.find(row=>row.name===n);if(!row)fail('Profil manual tidak ditemukan pada OLT');return row;};
 let up,down;
 if(mode==='manual'){up=find(catalogue.tcont,input.tcontProfile);down=find(catalogue.traffic,input.trafficProfile);if(upstream(up)<upload||down.pir<download)fail('Kapasitas profil manual lebih kecil dari bandwidth layanan');}
 else{up=catalogue.tcont.filter(row=>row.type===4&&row.maximum===upload).sort((a,b)=>a.name.localeCompare(b.name))[0]||{name:'FB-UP-'+upload,type:4,fixed:0,assured:0,maximum:upload};down=catalogue.traffic.filter(row=>row.sir===download&&row.pir===download).sort((a,b)=>a.name.localeCompare(b.name))[0]||{name:'FB-DOWN-'+download,sir:download,pir:download};}
 const profiles=[{kind:'tcont',...up},{kind:'traffic',...down}].map(row=>{const existing=catalogue[row.kind].find(other=>other.name===row.name);if(existing&&Object.keys(row).filter(key=>!['kind','name'].includes(key)).some(key=>row[key]!==existing[key]))fail('Nama profil existing bertabrakan; tidak akan ditimpa',409);return{...row,action:existing?'reuse':'create'};});
 const output={mode,operation,binding,vlans,uploadKbps:upload,downloadKbps:download,profiles,sharedUploadKbps:upstream(up),allocation:null,writeAvailable:false,reason:'Pratinjau: belum menerapkan konfigurasi ONU atau membuat profil di OLT.'};
 if(onu){
  if(operation==='edit'){
   const service=onu.services.find(row=>row.id===bounded(input.servicePortId,1,128,'Service port'));
   if(!service||vlans.length!==1||vlans[0]!==service.vlan)fail('Edit bandwidth mempertahankan VLAN existing layanan yang dipilih',409);
   const gem=onu.gems.find(row=>row.id===service.gem),tc=gem&&onu.tcont.find(row=>row.id===gem.tcont);
   if(!gem||!tc||onu.services.filter(row=>row.gem===gem.id).length!==1||onu.gems.filter(row=>row.tcont===tc.id).length!==1)fail('T-CONT/GEM dipakai beberapa layanan. Edit otomatis ditahan agar layanan lain tidak berubah',409);
   output.allocation={serialNumber:onu.serialNumber,address:onu.address,limits:onu.limits,usedTcont:onu.tcont.length,usedGem:onu.gems.length,tcontId:tc.id,aggregateUploadKbps:upstream(up),perGemDownloadKbps:down.pir,gemPolicing:'per-vlan',rows:[{vlan:service.vlan,userVlan:service.userVlan,tcontId:tc.id,gemId:gem.id,servicePortId:service.id}],previous:{tcontProfile:tc.profile,downstreamProfile:gem.downstream||'',vlan:service.vlan,userVlan:service.userVlan}};
   output.reason='Pratinjau edit bandwidth layanan terpilih. VLAN, service-port, T-CONT dan GEM dipertahankan; belum diterapkan ke perangkat.';return output;
  }
  if(onu.services.some(row=>vlans.includes(row.vlan)||vlans.includes(row.userVlan)))fail('VLAN sudah dipakai layanan existing ONU; tidak akan ditimpa otomatis',409);
  const free=(max,used,needed)=>{const values=[];for(let id=1;id<=max&&values.length<needed;id++)if(!used.has(id))values.push(id);if(values.length<needed)fail('Slot T-CONT/GEM/service-port tidak cukup; layanan existing tetap dipertahankan',409);return values;};
  const tc=free(onu.limits.tcont,new Set(onu.tcont.map(row=>row.id)),1)[0],gem=free(onu.limits.gem,new Set(onu.gems.map(row=>row.id)),vlans.length),service=free(128,new Set(onu.services.map(row=>row.id)),vlans.length);
  output.allocation={serialNumber:onu.serialNumber,address:onu.address,limits:onu.limits,usedTcont:onu.tcont.length,usedGem:onu.gems.length,tcontId:tc,aggregateUploadKbps:upstream(up),perGemDownloadKbps:down.pir,gemPolicing:'per-vlan',rows:vlans.map((vlan,index)=>({vlan,tcontId:tc,gemId:gem[index],servicePortId:service[index]})),existing:onu.tcont.map(row=>{const p=catalogue.tcont.find(profile=>profile.name===row.profile);return{id:row.id,profile:row.profile,uploadKbps:p?upstream(p):null};})};
  // A shared T-CONT caps upload in aggregate. GEM policing is per VLAN, not a
  // fabricated aggregate downstream cap; require review before any live apply.
  if(vlans.length>1)output.reason='Upload dibagi dalam satu T-CONT; downstream per GEM/VLAN. Penerapan multi-VLAN memerlukan verifikasi kebijakan bandwidth.';
 }
 return output;
}
function key(device){return crypto.createHash('sha256').update(JSON.stringify([device.id,device.updatedAt,device.vendor,device.enabled,device.cliEnabled,device.host,device.port,device.cliPort,device.cliProtocol,device.cliUsername,device.cliPasswordEnc,device.communityEnc])).digest('hex');}
function saved(device){const row=cache.get(key(device));return row?{catalogue:structuredClone(row.catalogue),checkedAt:row.checkedAt,stale:Date.now()-row.at>CACHE_MS}:null;}
function inventoryType(device,index,serialNumber,hint){
 if(/^[A-Z0-9]{12}$/.test(serialNumber||'')){
  const connection=require('./olt-zte-catalogue').connection(device),row=(device.onuRegistrationJobs||[]).slice(-128).reverse().find(row=>row.status==='verified'&&row.address===index&&row.serialNumber===serialNumber&&row.connection===connection);
  if(name(row?.type))return row.type;
 }
 return name(hint);
}
async function read(data,device,commands,options={}){
 if(device.vendor!=='zte'||!device.enabled||!device.cliEnabled||!device.cliPasswordEnc)fail('Aktifkan akses CLI pada OLT ZTE yang tersimpan');
 const[,context,transport]=await vendors.loadLibrary();
 return context.withContext(data,device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:['enable',...commands]}),{...options,timeoutMs:18000,cliQueue:true,allowZteDevRead:options.allowZteDevRead===true});
}
async function readCatalogue(data,device,options={}){
 const id=key(device),previous=cache.get(id);if(!options.force&&previous&&Date.now()-previous.at<CACHE_MS)return saved(device);if(pending.has(id))return structuredClone(await pending.get(id));
 if(pending.size>=2)fail('Pembacaan profil sedang penuh. Coba kembali.',429);if(Date.now()-(attempts.get(id)||0)<15000)fail('Profil baru saja diperiksa. Tunggu beberapa detik.',429);
 attempts.set(id,Date.now());while(attempts.size>64)attempts.delete(attempts.keys().next().value);
 const task=(async()=>{const catalogue=parseCatalogue(await read(data,device,['show version-running','show gpon profile tcont','show gpon profile traffic','show gpon onu profile vlan','show vlan summary'],options));const row={catalogue,at:Date.now(),checkedAt:new Date().toISOString()};cache.set(id,row);while(cache.size>32)cache.delete(cache.keys().next().value);return saved(device);})();pending.set(id,task);
 try{return structuredClone(await task);}finally{pending.delete(id);}
}
async function readOnu(data,device,requested,options={}){
 const index=address(requested);if(!index)fail('Isi alamat ONU frame/slot/port:nomor yang valid');
 if(options.type!==undefined&&options.type!==''&&!name(options.type))fail('Tipe ONU dari inventory tidak valid');
 const id=key(device)+':'+index,previous=onuCache.get(id);if(!options.force&&previous&&Date.now()-previous.at<60000)return structuredClone(previous.onu);if(onuPending.has(id))return structuredClone(await onuPending.get(id));if(onuPending.size+pending.size>=2)fail('Pembacaan OLT sedang digunakan. Coba kembali.',429);
 if(Date.now()-(attempts.get(id)||0)<10000)fail('ONU baru saja diperiksa. Tunggu beberapa detik.',429);attempts.set(id,Date.now());while(attempts.size>64)attempts.delete(attempts.keys().next().value);
 const task=(async()=>{const iface='gpon-onu_'+index,commands=['show gpon onu detail-info '+iface,'show running-config interface '+iface,'show gpon remote-onu capability '+iface],knownType=inventoryType(device,index,options.serialNumber,options.type),first=await read(data,device,[...commands,...(knownType?['show onu-type gpon '+knownType]:[])],options);if(!first.success)fail('Kemampuan ONU belum dapat dibaca',503);
  const type=field(command(first,'show gpon onu detail-info '+iface),'Type');if(!name(type))fail('ONU-type belum terverifikasi',409);
  if(knownType){if(type!==knownType)fail('Tipe ONU berubah dari inventory. Baca ulang inventory sebelum melanjutkan.',409);const onu={...parseOnu(first,index),checkedAt:new Date().toISOString()};onuCache.set(id,{at:Date.now(),onu});while(onuCache.size>128)onuCache.delete(onuCache.keys().next().value);return onu;}
  const second=await read(data,device,['show onu-type gpon '+type],options);if(!second.success)fail('Batas ONU-type belum dapat dibaca',503);
  const onu={...parseOnu({success:true,outputs:[...first.outputs,...second.outputs]},index),checkedAt:new Date().toISOString()};onuCache.set(id,{at:Date.now(),onu});while(onuCache.size>128)onuCache.delete(onuCache.keys().next().value);return onu;})();onuPending.set(id,task);
 try{return structuredClone(await task);}finally{onuPending.delete(id);}
}
function verifySerial(onu,expected){if(expected!==undefined&&expected!==''&&(!/^[A-Z0-9]{12}$/.test(String(expected))||onu?.serialNumber!==expected))fail('SN ONU berbeda dari baris terpilih. Baca ulang inventory sebelum melanjutkan',409);return onu;}
function invalidate(device){const id=key(device);cache.delete(id);for(const stored of onuCache.keys())if(stored.startsWith(id+':'))onuCache.delete(stored);}
module.exports={parseCatalogue,parseOnu,plan,readCatalogue,readOnu,saved,key,address,upstream,verifySerial,invalidate,CACHE_MS};
