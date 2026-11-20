'use strict';

const crypto=require('node:crypto'),profiles=require('./olt-zte-profiles'),pnp=require('./olt-zte-pnp'),vendors=require('./olt-vendors');
const plans=new Map(),pending=new Set(),attempts=new Map(),PLAN_MS=120000;
const CATALOGUE=['show version-running','show gpon profile tcont','show gpon profile traffic','show gpon onu profile vlan','show vlan summary'];
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function nativePolicy(catalogue,input){
 const up=catalogue.tcont.find(row=>row.name===input.tcontProfile),down=catalogue.traffic.find(row=>row.name===input.trafficProfile);
 if(!up||!down||up.type!==4||up.fixed!==0||up.assured!==0||down.sir!==0||up.maximum<64||up.maximum>1000000||down.pir<64||down.pir>1000000)fail('Pilih profil best-effort tanpa reservasi bandwidth yang tersedia di OLT.',400);
 return{kbps:up.maximum,...(down.pir!==up.maximum?{downloadKbps:down.pir}:{}),maxOnus:128,fixedKbps:0,assuredKbps:0,profiles:[{kind:'tcont',...up,action:'reuse'},{kind:'traffic',...down,action:'reuse'}]};
}
function profileSelection(device,input){
 if(input.kind!=='onu'||input.profileMode!=='catalogue')return input;
 const row=require('./olt-zte-catalogue').profile(device,input.profileId);
 if(!row)fail('Profil bandwidth sudah tidak tersedia. Baca ulang daftar profil.');
 return{...input,uploadKbps:row.uploadKbps,downloadKbps:row.downloadKbps};
}
function assertProfile(device,value){
 if(value.selection?.mode!=='catalogue')return;
 const row=require('./olt-zte-catalogue').profile(device,value.selection.id);
 if(!row||row.uploadKbps!==value.policies[0].kbps||row.downloadKbps!==(value.policies[0].downloadKbps??value.policies[0].kbps))fail('Profil katalog berubah. Periksa ulang perubahan bandwidth.');
}
function policy(catalogue,kbps=60000){
 if(![60000,120000].includes(kbps))fail('Pilih batas ONU 60 atau 120 Mbps',400);
 return customPolicy(catalogue,kbps,kbps);
}
function customPolicy(catalogue,uploadKbps,downloadKbps){
 for(const rate of[uploadKbps,downloadKbps])if(!Number.isSafeInteger(rate)||rate<64||rate>1000000)fail('Kecepatan profil harus 64-1.000.000 Kbps',400);
 const up=catalogue.tcont.filter(row=>row.type===4&&row.fixed===0&&row.assured===0&&row.maximum===uploadKbps&&row.name.length<=32).sort((a,b)=>a.name.localeCompare(b.name))[0]||{name:`FB-BE${uploadKbps/1000}-UP`,type:4,fixed:0,assured:0,maximum:uploadKbps};
 const down=catalogue.traffic.filter(row=>row.sir===0&&row.pir===downloadKbps&&row.name.length<=32).sort((a,b)=>a.name.localeCompare(b.name))[0]||{name:`FB-BE${downloadKbps/1000}-DOWN`,sir:0,pir:downloadKbps};
 const rows=[{kind:'tcont',...up},{kind:'traffic',...down}].map(row=>{const existing=catalogue[row.kind].find(other=>other.name===row.name);if(existing&&Object.keys(row).filter(key=>!['kind','name'].includes(key)).some(key=>existing[key]!==row[key]))fail('Nama profil best-effort bertabrakan; profil lama tidak akan ditimpa');return{...row,action:existing?'reuse':'create'};});
 return{kbps:uploadKbps,...(uploadKbps!==downloadKbps?{downloadKbps}:{}),maxOnus:128,fixedKbps:0,assuredKbps:0,profiles:rows};
}
function inspect(result,target=null,last=false){
 if(!result?.success)fail('Pembacaan bandwidth OLT belum lengkap',503);
 const get=command=>{const rows=(result.outputs||[]).filter(row=>row.command===command);if(!rows.length||!last&&rows.length!==1)fail('Respons bandwidth OLT terpotong',503);return rows[last?rows.length-1:0];};
 const catalogue=profiles.parseCatalogue({success:true,outputs:CATALOGUE.map(get)}),global=pnp.globalState(get('show onu-pnp config').stdout);
 if(catalogue.firmwares.some(value=>value!=='V2.1.0'))fail('Penulisan profil belum terverifikasi pada firmware ini');
 const onu=target?profiles.verifySerial(profiles.parseOnu({success:true,outputs:onuCommands(target).map(get)},target.address),target.serialNumber):null;
 if(target){const positions=require('./olt-zte-registration').bySerial(get('show gpon onu by sn '+target.serialNumber).stdout,target.serialNumber);if(positions.length!==1||positions[0]!==target.address)fail('SN ONU berpindah atau ganda. Baca ulang inventory.');}
 return{catalogue,global,onu};
}
function onuCommands(target){return['show gpon onu by sn '+target.serialNumber,'show gpon onu detail-info gpon-onu_'+target.address,'show running-config interface gpon-onu_'+target.address,'show gpon remote-onu capability gpon-onu_'+target.address,'show onu-type gpon '+target.type];}
function readCommands(target=null){return['enable','terminal length 0',...CATALOGUE,'show onu-pnp config',...(target?onuCommands(target):[])];}
const fingerprint=state=>hash({catalogue:state.catalogue,global:state.global,onu:state.onu?{...state.onu,status:undefined,configState:undefined}:null});
function target(input){
 if(!profiles.address(input.address)||!/^[A-Z0-9]{12}$/.test(input.serialNumber||'')||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(input.type||''))fail('Pilih ONU yang telah dibaca dari inventory',400);
 return{address:input.address,serialNumber:input.serialNumber,type:input.type};
}
function build(state,input){
 const kind=input.kind;if(!['standards','onu','custom'].includes(kind))fail('Jenis perubahan bandwidth tidak valid',400);
 const mode=input.profileMode||'standard';if(kind==='onu'&&!['standard','catalogue','native'].includes(mode))fail('Pilihan profil ONU tidak valid.',400);
 const policies=kind==='standards'?[policy(state.catalogue,60000),policy(state.catalogue,120000)]:kind==='custom'||kind==='onu'&&mode==='catalogue'?[customPolicy(state.catalogue,input.uploadKbps,input.downloadKbps)]:kind==='onu'&&mode==='native'?[nativePolicy(state.catalogue,input)]:[policy(state.catalogue,input.kbps)];
 const value={kind,policies,profiles:policies.flatMap(row=>row.profiles),target:null,allocation:null};
 if(kind==='onu'){
  const unit=state.onu,selection=target(input);if(!unit||unit.address!==selection.address||unit.serialNumber!==selection.serialNumber||unit.type!==selection.type)fail('Identitas ONU telah berubah');
  if(unit.status.toLowerCase()!=='working'||unit.configState.toLowerCase()!=='success')fail('ONU harus online dan konfigurasi berhasil sebelum mengubah bandwidth');
  const service=unit.services.find(row=>row.id===input.servicePortId);if(!service)fail('Pilih layanan existing yang valid',400);
  if(input.profileMode){
   const gem=unit.gems.find(row=>row.id===service.gem),tc=unit.tcont.find(row=>row.id===gem?.tcont);
   if(!gem||!tc||unit.services.filter(row=>row.gem===gem.id).length!==1)fail('GEM dipakai beberapa layanan; perubahan ditahan agar VLAN lain tidak berubah.');
   const related=unit.gems.filter(row=>row.tcont===tc.id),services=unit.services.filter(row=>related.some(gem=>gem.id===row.gem));
   if(related.some(gem=>!services.some(row=>row.gem===gem.id)))fail('T-CONT memiliki GEM tanpa pemetaan layanan yang pasti.');
   if(related.length>1&&input.allowSharedUpload!==true)fail('T-CONT dipakai beberapa layanan; periksa dampak upload bersama terlebih dahulu.');
   const up=value.profiles[0],down=value.profiles[1];
   if(tc.profile===up.name&&gem.downstream===down.name)fail('Profil layanan ONU sudah sesuai; tidak perlu dikirim ulang.');
   value.selection={mode,...(mode==='catalogue'?{id:input.profileId}:{})};
   value.target=selection;value.allocation={rows:[{vlan:service.vlan,userVlan:service.userVlan,tcontId:tc.id,gemId:gem.id,servicePortId:service.id}],tcontId:tc.id,usedTcont:unit.tcont.length,usedGem:unit.gems.length,limits:unit.limits,sharedUpload:related.length>1,sharedServices:services.map(row=>({id:row.id,vlan:row.vlan,userVlan:row.userVlan})),aggregateUploadKbps:policies[0].kbps,perGemDownloadKbps:policies[0].downloadKbps??policies[0].kbps,previous:{tcontProfile:tc.profile,downstreamProfile:gem.downstream||''}};
   return value;
  }
  // Use the existing resource validator without allocating another T-CONT/GEM.
  const cat=structuredClone(state.catalogue);for(const row of value.profiles)if(row.action==='create'){const{kind,action,...item}=row;cat[kind].push(item);}
  const edit=profiles.plan(cat,{mode:'manual',operation:'edit',servicePortId:service.id,uploadKbps:input.kbps,downloadKbps:input.kbps,vlans:[service.vlan],tcontProfile:value.profiles[0].name,trafficProfile:value.profiles[1].name},unit);
  value.target=selection;value.allocation=edit.allocation;
 }
 return value;
}
function profileCommands(value){return value.profiles.filter(row=>row.action==='create').map(row=>row.kind==='tcont'?`profile tcont ${row.name} type 4 maximum ${row.maximum}`:`profile traffic ${row.name} sir 0 pir ${row.pir}`);}
function writeCommands(state,value){
 const created=profileCommands(value),row=value.allocation?.rows[0];
 return[...readCommands(value.target),'configure terminal',...(created.length?['gpon',...created,'exit']:[]),...(row?['interface gpon-onu_'+value.target.address,`tcont ${row.tcontId} profile ${value.profiles[0].name}`,`gemport ${row.gemId} traffic-limit downstream ${value.profiles[1].name}`]:[]),'end',...CATALOGUE,'show onu-pnp config',...(value.target?onuCommands(value.target):[])];
}
function verifyResult(result,grant){
 const actual=inspect(result,grant.value.target,true),expected=structuredClone(grant.state);
 if(actual.onu&&(actual.onu.status.toLowerCase()!=='working'||actual.onu.configState.toLowerCase()!=='success'))fail('Konfigurasi ONU belum terverifikasi sesudah perubahan');
 for(const row of grant.value.profiles)if(row.action==='create'){const{kind,action,...item}=row;expected.catalogue[kind].push(item);}
 if(grant.value.target){const allocation=grant.value.allocation.rows[0];expected.onu.tcont.find(row=>row.id===allocation.tcontId).profile=grant.value.profiles[0].name;expected.onu.gems.find(row=>row.id===allocation.gemId).downstream=grant.value.profiles[1].name;}
 const canonical=value=>{const copy=structuredClone(value);for(const key of['tcont','traffic','vlan'])copy.catalogue[key].sort((a,b)=>a.name.localeCompare(b.name));return fingerprint(copy);};
 if(canonical(actual)!==canonical(expected))fail('Hasil bandwidth belum sesuai; jangan ulangi sebelum membaca OLT');return actual;
}
function verifyStep(outputs,grant,index,prompt){
 const n=readCommands(grant.value.target).length,created=profileCommands(grant.value),last=grant.commands.length-1;
 if(index===n-1){const fresh=inspect({success:true,outputs},grant.value.target);if(fingerprint(fresh)!==fingerprint(grant.state))fail('Profil, ONU, atau preset global berubah sebelum perintah dikirim');build(fresh,inputFor(grant.value));}
 if(index===n&&!/\(config\)#\s*$/.test(prompt))fail('Mode konfigurasi belum terverifikasi');
 if(created.length&&index>=n+1&&index<=n+1+created.length&&!/\(config-gpon\)#\s*$/.test(prompt))fail('Mode profil GPON belum terverifikasi');
 const iface=n+1+(created.length?created.length+2:0);
 if(grant.value.target&&index>=iface&&index<=iface+2&&!/\(config-if\)#\s*$/.test(prompt))fail('Mode ONU belum terverifikasi');
 if(index>=n&&index<=grant.mutationEnd&&/%Code|(?:^|\n)\s*%|\b(?:invalid|error|failed|failure)\b/i.test(outputs.at(-1)?.stdout||''))fail('OLT menolak perubahan bandwidth');
 if(index===last){verifyResult({success:true,outputs},grant);grant.verified=true;}
}
function inputFor(value){return value.kind==='standards'?{kind:'standards'}:value.kind==='custom'?{kind:'custom',uploadKbps:value.policies[0].kbps,downloadKbps:value.policies[0].downloadKbps??value.policies[0].kbps}:{kind:'onu',...value.target,kbps:value.policies[0].kbps,servicePortId:value.allocation.rows[0].servicePortId,...(value.selection?{profileMode:value.selection.mode,profileId:value.selection.id,uploadKbps:value.policies[0].kbps,downloadKbps:value.policies[0].downloadKbps??value.policies[0].kbps,tcontProfile:value.profiles[0].name,trafficProfile:value.profiles[1].name,allowSharedUpload:value.allocation.sharedUpload}: {})};}
function authorize(state,value){
 const input=inputFor(value);
 if(hash(build(state,input))!==hash(value))fail('Rencana bandwidth tidak sesuai');return{state,value,commands:writeCommands(state,value),mutationStart:readCommands(value.target).length+1,mutationEnd:writeCommands(state,value).indexOf('end'),used:false,submitted:false,verified:false};
}
async function readState(data,device,selection,options){
 const[,context,transport]=await vendors.loadLibrary();return context.withContext(data,device,async()=>inspect(await transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:readCommands(selection),timeoutMs:17000}),selection),{...(options.transportOptions||{}),allowZteDevRead:options.explicitDevAccess===true,cliQueue:true,timeoutMs:18000});
}
async function prepare(data,device,actor,input,options={}){
 pnp.check(data,device,actor);if(!['standards','onu','custom'].includes(input.kind))fail('Jenis perubahan bandwidth tidak valid',400);
 const now=Date.now(),key=pnp.signature(device);if(pending.has(device.id)||pending.size>=2||now-(attempts.get(key)||0)<3000)fail('Pemeriksaan bandwidth sedang berjalan; tunggu sebentar',429);
 pending.add(device.id);attempts.set(key,now);while(attempts.size>64)attempts.delete(attempts.keys().next().value);
 try{input=profileSelection(device,input);const selection=input.kind==='onu'?target(input):null,state=await readState(data,device,selection,options),value=build(state,input);for(const[token,row]of plans)if(row.expires<=now)plans.delete(token);while(plans.size>=64)plans.delete(plans.keys().next().value);
  const token=crypto.randomBytes(24).toString('base64url');plans.set(token,{deviceId:device.id,signature:key,actorId:actor.id,state,value,expires:Date.now()+PLAN_MS});return{token,revision:device.updatedAt||'',value};
 }finally{pending.delete(device.id);}
}
async function execute(data,device,actor,input,options={}){
 pnp.check(data,device,actor);const plan=plans.get(input.token);
 if(!plan||plan.expires<=Date.now()||plan.actorId!==actor.id||plan.deviceId!==device.id||plan.signature!==pnp.signature(device)||input.revision!==(device.updatedAt||'')||input.confirmId!==device.id||input.confirmTarget!==(plan.value.target?.serialNumber||(plan.value.kind==='custom'?plan.value.policies[0].kbps+'/'+(plan.value.policies[0].downloadKbps??plan.value.policies[0].kbps):'60/120'))||input.confirmImpact!==true)fail('Konfirmasi profil bandwidth tidak sesuai');
 assertProfile(device,plan.value);if(plan.value.allocation?.sharedUpload&&input.confirmSharedUpload!==true)fail('Konfirmasi dampak upload bersama pada VLAN lain di ONU ini.',400);
 if(plan.result)return structuredClone(plan.result);if(plan.used)fail('Perintah sudah diproses; baca hasil sebelum mengulang');
 if(typeof options.beforeSend!=='function'||typeof options.afterSend!=='function')fail('Pencatatan audit perubahan bandwidth wajib tersedia');
 if(process.env.MIGRATION_MODE==='1'&&options.explicitDevAccess!==true)fail('Perubahan bandwidth pada Dev memerlukan izin eksplisit');
 if(pending.has(device.id)||pending.size>=2||require('./olt-zte-registration').isBusy(device.id)||require('./olt-zte-bridge').isBusy(device.id)||require('./olt-pon').isBusy?.(device.id))fail('Tunggu operasi OLT lainnya selesai sebelum mengubah profil.',429);pending.add(device.id);plan.used=true;
 try{await options.beforeSend(plan.value);const[,context,transport]=await vendors.loadLibrary();let result;
  try{result=await context.withContext(data,device,()=>{context.authorizeBandwidthOperation(plan.state,plan.value);return transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:writeCommands(plan.state,plan.value),timeoutMs:17000});},{...(options.transportOptions||{}),allowZteDevRead:options.explicitDevAccess===true,bandwidthActionAllowed:true,explicitDevBandwidthAction:options.explicitDevAccess===true,cliQueue:true,timeoutMs:18000});}catch{result={success:false,submitted:null};}
  let verified=false,actual=null;if(result.success)try{actual=verifyResult(result,plan);verified=true;}catch{}
  const submitted=result.submitted===true,uncertain=result.submitted==null||submitted&&!verified;
  profiles.invalidate(device);const catalogue=require('./olt-zte-catalogue');if(actual)catalogue.updateBandwidth(device,actual.catalogue);else catalogue.invalidate(device);pnp.invalidate(device);
  plan.result={ok:verified,verified,submitted,uncertain,message:verified?(plan.value.target?'Bandwidth layanan ONU terpilih berhasil diubah; VLAN dan preset PON tetap.':'Profil best-effort 60/120 Mbps tersedia. ONU dan preset PON belum diubah.'):uncertain?'Hasil belum pasti. Baca ulang OLT; tidak ada pengiriman ulang otomatis.':'Perubahan belum diterapkan. Baca kembali OLT.'};
  try{await options.afterSend(plan.result,plan.value);}catch{plan.result.persistenceWarning=true;plan.result.message+=' Pencatatan hasil belum berhasil.';}return structuredClone(plan.result);
 }finally{pending.delete(device.id);}
}
module.exports={policy,customPolicy,nativePolicy,assertProfile,inspect,build,readCommands,writeCommands,verifyStep,verifyResult,authorize,prepare,execute,isBusy:id=>pending.has(id),PLAN_MS};
