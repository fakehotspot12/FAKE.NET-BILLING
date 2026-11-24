'use strict';

const crypto=require('node:crypto'),auth=require('./auth'),vendors=require('./olt-vendors');
const inventory=require('./olt-zte-inventory'),profiles=require('./olt-zte-profiles');
const cache=new Map(),pending=new Set(),attempts=new Map(),plans=new Map();
const CACHE_MS=300000,PLAN_MS=120000,MAX_PORTS=20;
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const clean=value=>String(value||'').replace(/\r/g,'');
const validName=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const signature=device=>hash([device.id,device.vendor,device.host,device.port,device.communityEnc,device.cliProtocol||'telnet',device.cliPort||23,device.cliUsername,device.cliPasswordEnc,device.enabled,device.cliEnabled,device.updatedAt]);
function pon(value){const position=require('./olt-terminal-policy').position(value);if(!position||position.onuId||position.ponKey!==value)fail('Pilih PON yang valid',400);return value;}
const portCommand=value=>'show onu-pnp olt config gpon-olt_'+pon(value);
function output(result,command,last=false){const rows=(result.outputs||[]).filter(row=>row.command===command);if(!rows.length||!last&&rows.length!==1)fail('Pembacaan ONU-PnP belum lengkap',503);return clean(rows[last?rows.length-1:0].stdout);}
function field(text,label){const rows=[...clean(text).matchAll(new RegExp('^\\s*'+label+'\\s*:\\s*([^\\n]*)','gim'))];if(rows.length!==1)fail('Format ONU-PnP belum terverifikasi',503);return rows[0][1].trim();}
function globalState(text){
 const enabled=field(text,'ONU PNP global state'),bandwidth=field(text,'GPON bandwidth profile'),type=field(text,'GPON');
 if(!['enable','disable'].includes(enabled)||!validName(bandwidth)||type!=='N/A'&&!validName(type))fail('Status global ONU-PnP belum dikenali',503);
 return{enabled:enabled==='enable',bandwidth,onuType:type==='N/A'?'':type};
}
function portState(text,key){
 if(field(text,'OLT')!=='gpon-olt_'+pon(key))fail('Status ONU-PnP berasal dari PON lain');
 const state=field(text,'ONU PNP state'),line=clean(text).split('\n'),onu=line.filter(row=>/^\s*ONU VLAN mode:/i.test(row)),olt=line.filter(row=>/^\s*OLT VLAN mode:/i.test(row));
 if(!['enable','disable'].includes(state)||onu.length!==1||olt.length!==1)fail('Status ONU-PnP belum pasti',503);
 const mode=(value,prefix)=>{const match=value.trim().match(new RegExp('^'+prefix+' VLAN mode:\\s*(N/A|transparent|tag|untag)(?:\\s+(?:'+prefix+' )?VLAN:\\s*([0-9]+))?\\s*$','i'));if(!match)fail('Mode VLAN ONU-PnP belum didukung',503);const vlan=match[2]?Number(match[2]):null;if(vlan!==null&&(vlan<1||vlan>4094))fail('VLAN ONU-PnP tidak valid',503);return{mode:match[1].toLowerCase(),vlan};};
 const uni=line.findIndex(row=>/^\s*UNI\s+Mode\s+VLAN/i.test(row));
 if(uni>=0&&line.slice(uni+1).some(row=>/^\s*eth_\d+\/\d+\s+/.test(row)))fail('PON memiliki aturan UNI khusus; perubahan melalui preset sederhana ditahan');
 return{ponKey:key,enabled:state==='enable',onu:mode(onu[0],'ONU'),olt:mode(olt[0],'OLT')};
}
function types(text){
 const parts=clean(text).split(/^\s*ONU type name:\s*/im).slice(1),rows=[],seen=new Set();
 for(const part of parts){const name=part.split('\n')[0].trim();if(!validName(name)||seen.has(name))fail('Katalog ONU-type ambigu',503);seen.add(name);const tcont=Number(field(part,'Max T-CONT')),gem=Number(field(part,'Max GEM port'));
  if(field(part,'PON type').toLowerCase()!=='gpon'||!Number.isSafeInteger(tcont)||tcont<1||tcont>255||!Number.isSafeInteger(gem)||gem<1||gem>4096)fail('Kapasitas ONU-type belum terverifikasi',503);rows.push({name,tcont,gem});
 }if(!rows.length||rows.length>256)fail('Katalog ONU-type belum tersedia',503);return rows;
}
function discovery(text){
 const value=clean(text),rows=[],seen=new Set();
 if(/%Code (?:62310-GPONSRV|70285)\s*:\s*No related information to show\./i.test(value)){
  if(/^\s*gpon-olt_/m.test(value))fail('Respons discovery kosong bertentangan dengan daftar ONU',503);
  return[];
 }
 if(!/OltIndex\s+Model\s+SN\s+PW/.test(value))fail('Deteksi model ONU belum terverifikasi',503);
 // SN and password are the final two columns; native model names may contain spaces.
 for(const line of value.split('\n')){if(!/^\s*gpon-olt_/.test(line))continue;const match=line.trim().match(/^gpon-olt_(\d+\/\d+\/\d+)\s+(.+?)\s+([A-Za-z0-9]{12})\s+\S+\s*$/);if(!match||! /^[A-Za-z0-9][A-Za-z0-9 ._()+/-]{0,79}$/.test(match[2])||seen.has(match[1]+':'+match[3].toUpperCase()))fail('Deteksi ONU baru ambigu atau terpotong',503);pon(match[1]);seen.add(match[1]+':'+match[3].toUpperCase());rows.push({ponKey:match[1],model:['N/A','unknown'].includes(match[2])?'':match[2],serialNumber:match[3].toUpperCase(),modelSource:'olt-discovery'});}
 if(rows.length>8192)fail('Daftar ONU baru melebihi batas',503);const counts=new Map();for(const row of rows)counts.set(row.serialNumber,(counts.get(row.serialNumber)||0)+1);return rows.map(row=>({...row,ambiguous:counts.get(row.serialNumber)>1}));
}
function readCommands(keys){if(!Array.isArray(keys)||!keys.length||keys.length>MAX_PORTS||new Set(keys).size!==keys.length)fail('Daftar PON melebihi batas pemeriksaan aman');return['enable','terminal length 0','show card','show onu-pnp config',...keys.map(portCommand),'show onu-type gpon','show pon onu uncfg','show version-running','show gpon profile tcont','show gpon profile traffic','show gpon onu profile vlan','show vlan summary'];}
function inspect(result,keys,last=false){
 const ports=inventory.cards(output(result,'show card')),known=new Set(ports.map(row=>row.ponKey));if(keys.some(key=>!known.has(pon(key))))fail('PON tidak ditemukan pada kartu GPON saat ini');
 const global=globalState(output(result,'show onu-pnp config',last)),states=keys.map(key=>portState(output(result,portCommand(key),last),key)),catalogue=profiles.parseCatalogue({success:true,outputs:(result.outputs||[]).filter(row=>['show version-running','show gpon profile tcont','show gpon profile traffic','show gpon onu profile vlan','show vlan summary'].includes(row.command))});
 const onuTypes=types(output(result,'show onu-type gpon')),newOnus=discovery(output(result,'show pon onu uncfg'));
 return{global,ports:states,physicalPorts:ports.map(row=>row.ponKey),catalogue,onuTypes,newOnus,checkedAt:new Date().toISOString()};
}
function proof(value,selection={}){return hash({global:value.global,ports:value.ports,physicalPorts:value.physicalPorts,catalogue:value.catalogue,onuTypes:value.onuTypes,...(selection.autoMatch?{models:[...new Set(value.newOnus.filter(row=>row.ponKey===selection.ponKey).map(row=>JSON.stringify([row.model,row.ambiguous])))].sort()}:{})});}
function canManage(data,device,actor){const user=(data.users||[]).find(row=>row.id===actor?.id&&row.active!==false);return Boolean(user&&auth.hasPermission(auth.publicUser(user),'olt:pnp:manage')&&require('./olt-reboot').scopedDevices(data,user).some(row=>row.id===device.id));}
function check(data,device,actor,{readOnly=false}={}){if(!canManage(data,device,actor))fail('Tidak memiliki izin mengatur ONU-PnP ini',403);if(device.vendor!=='zte'||!device.enabled||!device.cliEnabled||!device.cliUsername||!device.cliPasswordEnc||/^demo-olt-/.test(device.id))fail('ONU-PnP belum terverifikasi untuk OLT ini');if(require('./olt-terminal').isOpen(device.id)||require('./olt-cli').isBusy(device.id)||!readOnly&&require('./olt-zte-bridge').isMutating(device.id))fail('Tutup terminal atau tunggu operasi OLT selesai');}
function saved(device){const row=cache.get(signature(device));return row&&Date.now()-Date.parse(row.checkedAt)<CACHE_MS?structuredClone(row):null;}
function remember(device,value){cache.set(signature(device),value);while(cache.size>32)cache.delete(cache.keys().next().value);}
function reserve(device){const id=signature(device);if(pending.has(device.id)||pending.size>=2)fail('Pembacaan ONU-PnP sedang berjalan',429);if(Date.now()-(attempts.get(id)||0)<3000)fail('Tunggu sebentar sebelum membaca ulang',429);attempts.set(id,Date.now());while(attempts.size>64)attempts.delete(attempts.keys().next().value);pending.add(device.id);}
const presetConnection=device=>signature({...device,updatedAt:''});
function presets(device){
 const source=device.onuPnpPresets;if(!source||typeof source!=='object'||Array.isArray(source))return{};const result={},connection=presetConnection(device);
 for(const[key,row]of Object.entries(source).slice(0,128)){
  try{pon(key);if(!row||row.connection!==connection||row.ponKey!==key||!['selected','transparent'].includes(row.vlanMode)||!Array.isArray(row.vlans)||row.vlans.length>16||!row.vlans.every(id=>Number.isSafeInteger(id)&&id>=2&&id<=4094)||new Set(row.vlans).size!==row.vlans.length||!/^[0-9a-f-]{36}$/.test(row.revision)||!Number.isFinite(Date.parse(row.updatedAt))||!validName(row.bandwidth)||row.onuType&&!validName(row.onuType))continue;
   const tr069=require('./olt-zte-tr069').setting(row.tr069);
   result[key]={ponKey:key,vlanMode:row.vlanMode,vlans:[...row.vlans],bandwidth:row.bandwidth,...(row.bandwidthMode==='auto60'?{bandwidthMode:'auto60'}:row.bandwidthMode==='catalogue'?{bandwidthMode:'catalogue',bandwidthPresetId:row.bandwidthPresetId}:{}),...(typeof row.requestedEnabled==='boolean'?{requestedEnabled:row.requestedEnabled}:{}),...(tr069?{tr069}:{}),onuType:row.onuType||'',revision:row.revision,updatedAt:row.updatedAt};
  }catch{}
 }return result;
}
function savePreset(data,device,actor,input){
 if(!canManage(data,device,actor))fail('Tidak memiliki izin mengatur preset PON ini',403);if(device.vendor!=='zte')fail('Preset ini khusus OLT ZTE');
 if(require('./olt-zte-registration').isBusy(device.id)||require('./olt-zte-bandwidth').isBusy(device.id)||require('./olt-zte-bridge').isBusy(device.id))fail('Tunggu proses registrasi atau profil selesai sebelum mengubah preset',429);
 if(pending.has(device.id))fail('Tunggu operasi ONU-PnP selesai sebelum menyimpan preset');const key=pon(input.ponKey),state=saved(device),previous=presets(device)[key];
 if(!state||!state.physicalPorts.includes(key))fail('Baca status OLT sebelum menyimpan preset PON');
 if(input.presetRevision!==(previous?.revision||''))fail('Preset PON telah berubah. Buka ulang pengaturan sebelum menyimpan.');
 if(input.requestedEnabled!==undefined&&typeof input.requestedEnabled!=='boolean')fail('Pilihan aktif/nonaktif PnP tidak valid',400);
 if(!['selected','transparent'].includes(input.vlanMode)||!Array.isArray(input.vlans)||input.vlans.length>16||new Set(input.vlans).size!==input.vlans.length||input.vlans.some(id=>!Number.isSafeInteger(id)||id<2||id>4094||!state.catalogue.vlans.includes(id))||input.vlanMode==='selected'&&!input.vlans.length||input.vlanMode==='transparent'&&input.vlans.length)fail('Pilih 1-16 VLAN existing atau mode transparan tanpa daftar VLAN',400);
 if(input.bandwidthMode!==undefined&&!['manual','auto60','catalogue'].includes(input.bandwidthMode))fail('Mode bandwidth tidak valid',400);
 const automatic=input.bandwidthMode==='auto60',managed=input.bandwidthMode==='catalogue',bandwidth=automatic?require('./olt-zte-bandwidth').policy(state.catalogue).profiles[0].name:managed?require('./olt-zte-catalogue').policyFor(device,state,input.bandwidthPresetId).profiles[0].name:input.bandwidth;
 if(!validName(bandwidth)||bandwidth.length>32||!automatic&&!managed&&!state.catalogue.tcont.some(row=>row.name===bandwidth)||typeof input.onuType!=='string'||input.onuType&&(!validName(input.onuType)||!state.onuTypes.some(row=>row.name===input.onuType)))fail('Profil preset tidak tersedia di OLT',400);
 const requestedEnabled=input.requestedEnabled??previous?.requestedEnabled;
 const tr069=require('./olt-zte-tr069').setting(input.tr069===undefined?previous?.tr069:input.tr069);
 if(tr069?.enabled&&(input.vlanMode!=='selected'||!input.vlans.includes(100)))fail('TR069 DHCP memerlukan VLAN100 existing pada preset PON',400);
 const value={ponKey:key,vlanMode:input.vlanMode,vlans:[...input.vlans].sort((a,b)=>a-b),bandwidth,...(automatic?{bandwidthMode:'auto60'}:managed?{bandwidthMode:'catalogue',bandwidthPresetId:input.bandwidthPresetId}:{}),...(typeof requestedEnabled==='boolean'?{requestedEnabled}:{}),...(tr069?{tr069}:{}),onuType:input.onuType,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};
 if(previous&&hash({...previous,revision:undefined,updatedAt:undefined})===hash({...value,revision:undefined,updatedAt:undefined}))return structuredClone(previous);
 const entries={...presets(device),[key]:value};if(Object.keys(entries).length>128)fail('Batas preset PON tercapai');
 device.onuPnpPresets=Object.fromEntries(Object.entries(entries).map(([key,row])=>[key,{...row,connection:presetConnection(device)}]));return structuredClone(value);
}
function selectedPreset(device,input){
 if(input.presetRevision===undefined)return input;const row=presets(device)[pon(input.ponKey)];
 if(!row||row.revision!==input.presetRevision)fail('Preset PON berubah atau belum tersimpan. Simpan dan periksa ulang.');
 if(typeof row.requestedEnabled==='boolean'&&input.enabled!==row.requestedEnabled)fail('Simpan pilihan aktif/nonaktif PnP sebelum menerapkan.');
 if(!input.enabled)return{ponKey:row.ponKey,enabled:false};
 if(row.bandwidthMode==='catalogue')fail('Profil katalog memakai registrasi server, bukan PnP native.');
 if(row.vlanMode==='selected'&&row.vlans.length!==1)fail('Preset multi-VLAN tersimpan untuk PON ini. Penerapan selektif belum terverifikasi pada firmware; tidak dialihkan ke trunk semua VLAN.');
 return{ponKey:row.ponKey,enabled:input.enabled,bandwidth:row.bandwidth,...(row.bandwidthMode?{bandwidthMode:row.bandwidthMode}:{}),onuType:row.onuType,vlanMode:row.vlanMode==='selected'?'fixed':'transparent',vlan:row.vlans[0]};
}
async function readState(data,device,keys,options){const[,context,transport]=await vendors.loadLibrary(),result=await context.withContext(data,device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:readCommands(keys),timeoutMs:16000}),{...(options.transportOptions||{}),allowZteDevRead:options.explicitDevAccess===true,cliQueue:true,timeoutMs:18000});if(!result.success)fail('Status ONU-PnP belum dapat dibaca. Periksa koneksi CLI.',503);return inspect(result,keys);}
async function read(data,device,actor,key,options={}){
 check(data,device,actor,{readOnly:true});pon(key);reserve(device);
 try{const value=await readState(data,device,[key],options);remember(device,value);return structuredClone(value);}finally{pending.delete(device.id);}
}
function resolveOnuType(state,key,requested=''){
 if(requested){if(!validName(requested)||!state.onuTypes.some(row=>row.name===requested))fail('ONU-type tidak tersedia di OLT',400);return requested;}
 if(state.global.onuType&&state.onuTypes.some(row=>row.name===state.global.onuType))return state.global.onuType;
 const discovered=state.newOnus.filter(row=>row.ponKey===key),known=new Map(state.onuTypes.map(row=>[row.name.toUpperCase(),row.name])),matched=new Set();
 if(!discovered.length||discovered.some(row=>row.ambiguous||!row.model||!known.has(row.model.toUpperCase())))fail('Profil perangkat otomatis belum terpetakan. Atur ONU-type cadangan satu kali pada pengaturan lanjutan; model tidak ditebak dari SN atau nama merek.');
 for(const row of discovered)matched.add(known.get(row.model.toUpperCase()));
 if(matched.size!==1)fail('Beberapa model terdeteksi tanpa ONU-type cadangan. Atur profil cadangan satu kali sebelum mengaktifkan PnP.');return [...matched][0];
}
function desired(state,input){
 const key=pon(input.ponKey),current=state.ports.find(row=>row.ponKey===key);if(!current||typeof input.enabled!=='boolean')fail('Status dan pilihan PON wajib sesuai',400);
 if(state.global.enabled)fail('ONU-PnP global sedang aktif. Pengaturan per PON ditahan agar tidak mengubah cakupan registrasi global.');
 if(!input.enabled)return{ponKey:key,enabled:false};
 if(input.vlans!==undefined)fail('Multi-VLAN selektif belum didukung jalur PnP native ini. Trunk transparan bukan filter VLAN terpilih.',400);
 if(!validName(input.bandwidth)||input.bandwidth.length>32||!state.catalogue.tcont.some(row=>row.name===input.bandwidth))fail('Pilih profil bandwidth yang tersedia di OLT',400);
 if(input.bandwidthMode==='auto60'){const row=state.catalogue.tcont.find(row=>row.name===input.bandwidth);if(row.type!==4||row.fixed!==0||row.assured!==0||row.maximum!==60000)fail('Profil otomatis harus Type 4, fixed/assured 0 dan maksimum 60 Mbps');}
 const onuType=resolveOnuType(state,key,input.onuType);
 if(!['fixed','transparent'].includes(input.vlanMode))fail('Pilih mode VLAN yang valid',400);
 const vlan=input.vlanMode==='fixed'?Number(input.vlan):null;if(input.vlanMode==='fixed'&&(!Number.isSafeInteger(vlan)||vlan<2||vlan>4094||!state.catalogue.vlans.includes(vlan)))fail('VLAN harus sudah tersedia di OLT (2-4094)',400);
 const globalChanged=state.global.bandwidth!==input.bandwidth||state.global.onuType!==onuType;
 if(globalChanged&&(state.ports.length!==state.physicalPorts.length||state.physicalPorts.some(key=>!state.ports.some(row=>row.ponKey===key))||state.ports.some(row=>row.ponKey!==key&&row.enabled)))fail('Preset bandwidth/ONU-type dipakai bersama. PON lain harus diperiksa dan tidak boleh sedang memakai ONU-PnP.');
 return{ponKey:key,enabled:true,bandwidth:input.bandwidth,...(input.bandwidthMode==='auto60'?{bandwidthMode:'auto60'}:{}),onuType,autoMatch:!input.onuType&&!state.global.onuType,vlanMode:input.vlanMode,vlan};
}
function mutations(state,value){
 desired(state,value);const key='gpon-olt_'+value.ponKey,current=state.ports.find(row=>row.ponKey===value.ponKey);
 if(!value.enabled)return['disable '+key];
 return[...(current.enabled?['disable '+key]:[]),...(state.global.bandwidth!==value.bandwidth?['bandwidth gpon '+value.bandwidth]:[]),...(state.global.onuType!==value.onuType?['onu-type-default gpon '+value.onuType]:[]),value.vlanMode==='fixed'?`olt-vlan untag ${key} vlan ${value.vlan}`:`olt-vlan transparent ${key}`,value.vlanMode==='fixed'?`onu-vlan ${key} mode tag vlan ${value.vlan}`:`onu-vlan ${key} mode transparent`,'enable '+key];
}
function writeCommands(state,value){return[...readCommands(state.ports.map(row=>row.ponKey)),'configure terminal','onu-pnp',...mutations(state,value),'end','show onu-pnp config',portCommand(value.ponKey)];}
function readback(result,grant){
 const global=globalState(output(result,'show onu-pnp config',true)),state=portState(output(result,portCommand(grant.value.ponKey),true),grant.value.ponKey),value=grant.value;
 const expectedGlobal=value.enabled?{...grant.state.global,bandwidth:value.bandwidth,onuType:value.onuType}:grant.state.global;
 if(hash(global)!==hash(expectedGlobal)||state.enabled!==value.enabled)fail('Status akhir ONU-PnP belum sesuai permintaan');
 if(value.enabled&&(state.onu.mode!==(value.vlanMode==='fixed'?'tag':'transparent')||state.olt.mode!==(value.vlanMode==='fixed'?'untag':'transparent')||state.onu.vlan!==value.vlan||state.olt.vlan!==value.vlan))fail('Preset VLAN akhir belum sesuai permintaan');
 return{global,state,checkedAt:new Date().toISOString()};
}
function verifyStep(outputs,grant,index,prompt){
 const n=readCommands(grant.state.ports.map(row=>row.ponKey)).length;
 if(index===n-1&&proof(inspect({outputs},grant.state.ports.map(row=>row.ponKey)),grant.value)!==proof(grant.state,grant.value))fail('Status ONU-PnP berubah sebelum penerapan');
 if(index===n&&!/\(config\)#\s*$/.test(prompt)||index>=n+1&&index<n+2+mutations(grant.state,grant.value).length&&!/\(config-onu-pnp\)#\s*$/.test(prompt))fail('Mode ONU-PnP belum terverifikasi');
 if(index>=n+2&&/%Code|(?:^|\n)\s*%|\b(?:invalid|error|failed|failure)\b/i.test(outputs.at(-1)?.stdout||''))fail('OLT menolak pengaturan ONU-PnP');
 if(index===grant.commands.length-1){readback({outputs},grant);grant.verified=true;}
}
async function prepare(data,device,actor,input,options={}){
 check(data,device,actor);pon(input.ponKey);const selection=selectedPreset(device,input),previous=saved(device);if(!previous)fail('Baca status ONU-PnP terlebih dahulu');reserve(device);
 try{const state=await readState(data,device,selection.enabled?previous.physicalPorts:[selection.ponKey],options);if(selection.enabled&&selection.bandwidthMode==='auto60'){const row=require('./olt-zte-bandwidth').policy(state.catalogue).profiles[0];if(row.action!=='reuse')fail('Siapkan profil best-effort 60/120 Mbps terlebih dahulu');selection.bandwidth=row.name;}const value=desired(state,selection);remember(device,state);
  const now=Date.now();for(const[token,row]of plans)if(row.expires<=now)plans.delete(token);while(plans.size>=64)plans.delete(plans.keys().next().value);
  const token=crypto.randomBytes(24).toString('base64url');plans.set(token,{actorId:actor.id,signature:signature(device),deviceId:device.id,state,value,presetRevision:input.presetRevision,expires:now+PLAN_MS});
  return{token,revision:device.updatedAt||'',value,checkedAt:state.checkedAt,canSubmit:process.env.MIGRATION_MODE!=='1'||options.explicitDevAccess===true};
 }finally{pending.delete(device.id);}
}
async function execute(data,device,actor,input,options={}){
 check(data,device,actor);const plan=plans.get(input.token);
 if(!plan||plan.expires<=Date.now()||plan.actorId!==actor.id||plan.deviceId!==device.id||plan.signature!==signature(device)||input.revision!==(device.updatedAt||'')||input.confirmTarget!==plan.value.ponKey||input.confirmId!==device.id||input.confirmImpact!==true)fail('Konfirmasi ONU-PnP tidak sesuai pratinjau');
 if(plan.presetRevision!==undefined&&presets(device)[plan.value.ponKey]?.revision!==plan.presetRevision)fail('Preset PON berubah setelah diperiksa. Periksa ulang sebelum menerapkan.');
 if(plan.result)return plan.result;if(plan.used)fail('Perintah sudah diproses. Baca status sebelum mengulang.');
 if(typeof options.beforeSend!=='function'||typeof options.afterSend!=='function')fail('Audit penerapan ONU-PnP wajib tersedia');
 if(process.env.MIGRATION_MODE==='1'&&options.explicitDevAccess!==true)fail('Penerapan ONU-PnP pada Dev memerlukan izin eksplisit');
 if(pending.has(device.id)||pending.size>=2)fail('OLT sedang digunakan');pending.add(device.id);plan.used=true;
 try{await options.beforeSend(plan.value,{presetRevision:plan.presetRevision});const[,context,transport]=await vendors.loadLibrary();let result;
  try{result=await context.withContext(data,device,()=>{context.authorizePnpOperation(plan.state,plan.value);return transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:writeCommands(plan.state,plan.value),timeoutMs:17000});},{...(options.transportOptions||{}),allowZteDevRead:options.explicitDevAccess===true,pnpActionAllowed:true,explicitDevPnpAction:options.explicitDevAccess===true,timeoutMs:18000});}catch{result={success:false,submitted:null};}
  let state=null;if(result.success)try{state=readback(result,{state:plan.state,value:plan.value});}catch{}
  const verified=Boolean(state),submitted=result.submitted===true,uncertain=result.submitted==null||submitted&&!verified;cache.delete(signature(device));
  plan.result={ok:verified,verified,submitted,uncertain,state,message:verified?`ONU-PnP PON ${plan.value.ponKey} ${plan.value.enabled?'aktif':'nonaktif'}; hasil telah dibaca ulang dari OLT.`:uncertain?'Hasil ONU-PnP belum pasti. Baca status OLT sebelum mengulang; perintah tidak dikirim ulang otomatis.':'Perubahan belum diterapkan. Baca ulang status OLT.'};
  try{await options.afterSend(plan.result,plan.value);}catch{plan.result.persistenceWarning=true;plan.result.message+=' Pencatatan hasil belum berhasil.';}return plan.result;
 }finally{pending.delete(device.id);}
}
const invalidate=device=>cache.delete(signature(device));
module.exports={globalState,portState,types,discovery,readCommands,inspect,proof,canManage,check,read,saved,signature,desired,mutations,writeCommands,readback,verifyStep,prepare,execute,resolveOnuType,presets,savePreset,selectedPreset,invalidate,CACHE_MS,PLAN_MS,MAX_PORTS};
