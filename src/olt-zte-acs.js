'use strict';

const crypto=require('node:crypto'),pnp=require('./olt-zte-pnp'),profiles=require('./olt-zte-profiles'),tr=require('./olt-zte-tr069'),policy=require('./olt-acs-policy'),vendors=require('./olt-vendors');
const plans=new Map(),attempts=new Map(),states=new Map(),TTL=120000;
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted=lines=>[...lines].sort();
function target(input){
 if(!profiles.address(input.address)||Number(input.address.split(':')[1])>128||!/^[A-Z0-9]{12}$/.test(input.serialNumber||''))fail('Pilih ONU dengan SN dan alamat yang valid',400);
 return{address:input.address,serialNumber:input.serialNumber};
}
function config(device,serial,manualUrl,managementEnabled,operation){const value=manualUrl?{acsUrl:manualUrl}:serial&&require('./olt-onu-policy').get(device,serial).acsUrl?{acsUrl:require('./olt-onu-policy').get(device,serial).acsUrl}:policy.settings(device);if(operation!=='management'&&!value.acsUrl)fail('Isi URL ACS pada Otomasi ACS OLT dahulu');return tr.setting({enabled:operation!=='management',acsUrl:value.acsUrl||'',...(operation==='management'?{managementEnabled:true}:managementEnabled!==undefined?{managementEnabled}:value.managementEnabled!==undefined?{managementEnabled:value.managementEnabled}:{})});}
function build(state,acs,operation='enable',allowAcsReplace=false){
 if(!['enable','disable','management'].includes(operation))fail('Pilih pengaturan VLAN100, Enable atau Disable TR069',400);
 if(operation==='management')acs=tr.setting({...acs,enabled:false,managementEnabled:true});
 const next=structuredClone(state),interfaceAdd=[],managementAdd=[],managementReplace=[];
 if(operation==='disable'){
  const rows=state.management.filter(line=>/^tr069-mgmt\b/.test(line)),match=rows.length===1&&rows[0].match(/^tr069-mgmt (\d+) state (unlock|lock) tag pri ([0-7]) vlan (\d+) acs (\S+)$/);
  if(!match||tr.setting({enabled:true,acsUrl:match[5]}).acsUrl!==acs.acsUrl)fail('TR069 untuk ACS OLT belum terpasang; gunakan Enable TR069 dahulu');
  if(match[2]==='unlock')managementReplace.push({before:rows[0],after:rows[0].replace(' state unlock ',' state lock ')});
  return{operation,config:acs,vlan:Number(match[4]),allocation:null,interfaceAdd,managementAdd,managementReplace,managementWrites:managementReplace.map(()=>`tr069-mgmt ${match[1]} state lock`)};
 }
 if(!tr.managementEnabled(acs)){
  const management=tr.plan(state,acs,{allowAcsReplace});
  if(management.writes.length){if(management.before)managementReplace.push({before:management.before,after:management.after});else managementAdd.push(management.after);}
  return{operation,...(allowAcsReplace?{allowAcsReplace:true}:{}),config:acs,vlan:management.vlan,existingOnly:true,allocation:null,interfaceAdd,managementAdd,managementReplace,managementWrites:management.writes,veipId:management.veipId,reusesService:true,gemId:management.gemId,servicePortId:management.servicePortId};
 }
 const candidates=state.unit.services.filter(row=>row.vlan===100||row.userVlan===100);let allocation=null;
 if(!candidates.length){
  if(state.management.some(line=>/^service\b/.test(line)&&/\bvlan 100$/.test(line)))fail('Pemetaan OMCI VLAN100 belum cocok dengan service-port; periksa layanan existing');
  if(state.unit.tcont.length!==1||!state.unit.gems.length||state.unit.gems.some(row=>row.tcont!==state.unit.tcont[0].id))fail('T-CONT layanan existing belum tunggal; penambahan VLAN100 perlu pemeriksaan');
  const down=state.unit.gems.find(row=>row.downstream)?.downstream;if(!down)fail('Profil downstream layanan existing belum tersedia');
  const free=(max,rows)=>{for(let n=1;n<=max;n++)if(!rows.some(row=>row.id===n))return n;fail('Slot GEM atau service-port ONU penuh; tipe ONU tidak diubah otomatis');};
  const gem=free(Math.min(state.unit.limits.gem,128),state.unit.gems),service=free(128,state.unit.services),tc=state.unit.tcont[0].id;
  if(state.management.some(line=>/^service FBACS100\b/.test(line)))fail('Nama layanan FBACS100 sudah digunakan');
  interfaceAdd.push(`gemport ${gem} tcont ${tc}`,`gemport ${gem} traffic-limit downstream ${down}`,`service-port ${service} vport ${gem} user-vlan 100 vlan 100`);
  managementAdd.push(`service FBACS100 gemport ${gem} vlan 100`);
  next.unit.gems.push({id:gem,tcont:tc,downstream:down});next.unit.services.push({id:service,gem,userVlan:100,vlan:100});
  next.interfaceLines.push(...interfaceAdd);next.management.push(...managementAdd);
  allocation={gemId:gem,servicePortId:service,tcontId:tc,downstreamProfile:down};
 }
 const management=tr.plan(next,acs,{allowAdditionalHost:true,allowAcsReplace}),managementWrites=[...managementAdd,...management.writes];
 for(const line of management.writes){
  const id=line.match(/^tr069-mgmt (\d+) state unlock /)?.[1],previous=id&&state.management.find(row=>row.startsWith('tr069-mgmt '+id+' '));
  if(previous&&previous!==line)managementReplace.push({before:previous,after:line});else managementAdd.push(line);
 }
 return{operation,...(allowAcsReplace?{allowAcsReplace:true}:{}),config:acs,vlan:100,allocation,interfaceAdd,managementAdd,managementReplace,managementWrites,hostId:management.hostId,veipId:management.veipId,reusesService:!allocation,gemId:management.gemId,servicePortId:management.servicePortId};
}
function publicState(state,device){
 const rows=state.unit.services.filter(row=>row.vlan===100||row.userVlan===100),acs=state.management.filter(line=>/^tr069-mgmt\b/.test(line)).map(line=>line.match(/\bacs (\S+)$/)?.[1]).filter(Boolean),configured=require('./olt-onu-policy').get(device,state.unit.serialNumber).acsUrl?{acsUrl:require('./olt-onu-policy').get(device,state.unit.serialNumber).acsUrl}:policy.settings(device);
 const management=state.management.filter(line=>/^tr069-mgmt\b/.test(line)),matched=management.length===1&&management[0].match(/^tr069-mgmt \d+ state (unlock|lock) tag pri [0-7] vlan (\d+) acs (\S+)$/),tr069State=!management.length?'absent':matched&&tr.setting({enabled:true,acsUrl:matched[3]}).acsUrl===configured.acsUrl?(matched[1]==='unlock'?'enabled':'disabled'):'other';
 return{target:{address:state.unit.address,serialNumber:state.unit.serialNumber},policy:require('./olt-onu-policy').get(device,state.unit.serialNumber),oltAutomation:policy.settings(device),type:state.unit.type,vlan100:rows.length===1&&rows[0].vlan===100&&rows[0].userVlan===100,tr069State,tr069Vlan:matched?Number(matched[2]):null,acsUrls:acs,acsUrl:configured.acsUrl,dhcpIPs:state.hosts.filter(row=>row.dhcp==='enable'&&row.ip&&row.ip!=='0.0.0.0').map(row=>row.ip),checkedAt:new Date().toISOString()};
}
async function run(data,device,value,options,spec){
 const[,context,transport]=await vendors.loadLibrary();
 return context.withContext(data,device,()=>{if(spec)context.authorizeRegistrationOperation(spec);return transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:spec?writeCommands(spec):tr.commands(value),timeoutMs:22000});},
  {...(options.transportOptions||{}),allowZteDevRead:options.explicitDevAccess===true,registrationActionAllowed:Boolean(spec),explicitDevRegistrationAction:options.explicitDevAccess===true,cliQueue:true,timeoutMs:24000});
}
async function load(data,device,input,options){
 const selected=target(input),unit=await profiles.readOnu(data,device,selected.address,{...(options.transportOptions||{}),...options,allowZteDevRead:options.explicitDevAccess===true,serialNumber:selected.serialNumber,force:input.force===true,...(input.type?{type:input.type}:{})}),value={...selected,type:unit.type};
 value.tr069={enabled:false,managementEnabled:input.operation==='management'||input.managementEnabled===true,acsUrl:''};
 const raw=await run(data,device,value,options);if(!raw.success)fail('Status layanan dan manajemen ONU belum dapat dibaca',503);
 return{value,state:tr.inspect(raw,value)};
}
const stateKey=(device,value)=>pnp.signature(device)+':'+value.address+':'+value.serialNumber;
function remember(device,value,state){states.set(stateKey(device,value),{value,state,at:Date.now()});while(states.size>64)states.delete(states.keys().next().value);}
function throttle(device,actor,action){const key=device.id+':'+actor.id+':'+action;if(Date.now()-(attempts.get(key)||0)<2500)fail('Tunggu sebentar sebelum membaca ulang ONU',429);attempts.set(key,Date.now());while(attempts.size>128)attempts.delete(attempts.keys().next().value);}
async function read(data,device,actor,input,options={}){
 const view=require('./olt-zte-view'),state=await view.read(data,device,actor,input,options),sources=await view.wanSources(data.settings||{},state.unit.serialNumber,input.force===true),hosts=view.correlate(state,sources);
 return{...publicState({...state,hosts:hosts.map(row=>({...row,ip:row.displayIp}))},device),readOnly:!state.writeVerified,readIssues:state.readIssues,wanSources:sources};
}
async function prepare(data,device,actor,input,options={}){
 pnp.check(data,device,actor);const acs=config(device,input.serialNumber,input.acsUrl,input.managementEnabled,input.operation);if(input.policyMode!==undefined&&!['inherit','manual'].includes(input.policyMode))fail('Pilihan kebijakan ACS tidak valid',400);if(input.policyMode==='inherit'&&(!policy.settings(device).enabled||acs.acsUrl!==policy.settings(device).acsUrl))fail('Mengikuti OLT memerlukan otomasi aktif dan URL ACS OLT');throttle(device,actor,'prepare-'+(input.operation||'enable')+':'+input.serialNumber);
 return require('./olt-zte-registration').managementOperation(data,device,actor,async()=>{
  const cached=states.get(stateKey(device,target(input))),loaded=cached&&Date.now()-cached.at<30000?structuredClone(cached):await load(data,device,{...input,managementEnabled:tr.managementEnabled(acs)},options),{value:targetValue,state}=loaded,operation=input.operation||'enable',value={...targetValue,tr069:acs,operation,...(input.managementEnabled!==undefined?{managementEnabled:input.managementEnabled}:{}),...(input.policyMode?{policyMode:input.policyMode}:{}),...(input.acsUrl?{acsUrl:acs.acsUrl}:{})},native=build(state,acs,operation,Boolean(input.acsUrl)),snapshot=publicState(state,device);remember(device,targetValue,state);
  if(!native.interfaceAdd.length&&!native.managementAdd.length&&!native.managementReplace.length)return{alreadyConfigured:true,snapshot,message:operation==='disable'?'TR069 sudah Disable. Jalur layanan dan IP Host tetap.':operation==='management'?'VLAN100 dan IP Host DHCP sudah sesuai. TR069 tidak diubah.':'TR069 sudah sesuai. Inform ACS diperiksa terpisah.'};
  for(const[token,plan]of plans)if(plan.expires<=Date.now())plans.delete(token);while(plans.size>=64)plans.delete(plans.keys().next().value);
  const token=crypto.randomBytes(24).toString('base64url');plans.set(token,{state,value,native,deviceId:device.id,signature:pnp.signature(device),actorId:actor.id,policyHash:hash(require('./olt-onu-policy').get(device,value.serialNumber)),expires:Date.now()+TTL});
  return{token,revision:device.updatedAt||'',snapshot,value:{operation,...(value.policyMode?{policyMode:value.policyMode}:{}),target:target(value),acsUrl:acs.acsUrl,vlan:native.vlan,existingOnly:native.existingOnly===true,addsService:!!native.allocation,allocation:native.allocation,hostId:native.hostId,veipId:native.veipId}};
 },{invalidate:false});
}
function writeCommands(spec){
 const reads=tr.commands({...spec.value,tr069:spec.native.config}),iface='gpon-onu_'+spec.value.address,native=spec.native;
 return[...reads,'configure terminal',...(native.interfaceAdd.length?['interface '+iface,...native.interfaceAdd,'exit']:[]),'pon-onu-mng '+iface,...native.managementWrites,'end',...reads.slice(2)];
}
function authorize(spec){
 if(hash(build(spec.state,config(spec.device,spec.value.serialNumber,spec.value.acsUrl,spec.value.managementEnabled,spec.value.operation),spec.value.operation||'enable',spec.native.allowAcsReplace===true))!==hash(spec.native))fail('Rencana atau URL ACS OLT berubah');
 const commands=writeCommands(spec);return{...spec,commands,mutationStart:commands.indexOf('configure terminal')+1,mutationEnd:commands.indexOf('end'),submitted:false,verified:false,used:false};
}
function verifyResult(raw,spec){
 const actual=tr.inspect(raw,{...spec.value,tr069:spec.native.config},true),native=spec.native;
 const expect=(before,added,after)=>hash(sorted([...before,...added]))===hash(sorted(after));
 const remaining=spec.state.management.filter(line=>!native.managementReplace.some(row=>row.before===line)),added=[...native.managementAdd,...native.managementReplace.map(row=>row.after)];
 if(!expect(spec.state.interfaceLines,native.interfaceAdd,actual.interfaceLines)||!expect(remaining,added,actual.management))fail('Hasil pengaturan TR069 belum sesuai; periksa layanan ONU sebelum mencoba kembali');
 const pending=build(actual,native.config,native.operation,native.allowAcsReplace===true);if(pending.interfaceAdd.length||pending.managementAdd.length||pending.managementReplace.length)fail('Pengaturan TR069 belum lengkap');
 if(native.operation==='disable'){
  if(hash(actual.hosts)!==hash(spec.state.hosts))fail('IP Host berubah saat Disable TR069');
  return{configured:true,enabled:false,vlan:native.vlan,acsVerified:false};
 }
 if(native.existingOnly){if(hash(actual.hosts)!==hash(spec.state.hosts))fail('IP Host existing berubah saat pengaturan TR069');return{configured:true,enabled:true,vlan:native.vlan,existingOnly:true,acsVerified:false};}
 if(actual.hosts.length!==spec.state.hosts.length||actual.hosts.some(row=>row.id!==native.hostId&&hash(row)!==hash(spec.state.hosts.find(other=>other.id===row.id))))fail('IP Host lain berubah saat penerapan');
 const host=actual.hosts.find(row=>row.id===native.hostId);if(host?.dhcp!=='enable')fail('DHCP VLAN100 belum terverifikasi');
 return{configured:true,enabled:native.config.enabled,managementConfigured:true,vlan:100,gemId:native.gemId,servicePortId:native.servicePortId,hostId:native.hostId,dhcpAddress:host.ip==='0.0.0.0'?null:host.ip,acsVerified:false};
}
function verifyStep(outputs,grant,index,prompt){
 const start=grant.commands.indexOf('configure terminal'),command=grant.commands[index];
 if(index===start-1&&tr.proof(tr.inspect({success:true,outputs},{...grant.value,tr069:grant.native.config}))!==tr.proof(grant.state))fail('Konfigurasi atau identitas ONU berubah sebelum perubahan manajemen');
 if(index===start&&!/\(config\)#\s*$/.test(prompt))fail('Mode konfigurasi belum terverifikasi');
 if(index>start&&index<grant.mutationEnd){
  if(command.startsWith('interface ')&&!/\(config-if\)#\s*$/.test(prompt)||command.startsWith('pon-onu-mng ')&&!prompt.trim().endsWith('(gpon-onu-mng '+grant.value.address+')#'))fail('Target konfigurasi ONU belum pasti');
  if(/%Code|(?:^|\n)\s*%|\b(?:invalid|error|failed|failure)\b/i.test(outputs.at(-1)?.stdout||''))fail('OLT menolak push VLAN100');
 }
 if(index===grant.commands.length-1){verifyResult({success:true,outputs},grant);grant.verified=true;}
}
async function execute(data,device,actor,input,options={}){
 pnp.check(data,device,actor);const plan=plans.get(input.token);
 if(!plan||plan.expires<=Date.now()||plan.actorId!==actor.id||plan.deviceId!==device.id||plan.signature!==pnp.signature(device)||plan.policyHash!==hash(require('./olt-onu-policy').get(device,plan.value.serialNumber))||input.revision!==(device.updatedAt||'')||input.confirmId!==device.id||input.confirmTarget!==plan.value.serialNumber||input.confirmImpact!==true)fail('Konfirmasi push VLAN100 tidak sesuai atau sudah kedaluwarsa');
 if(plan.used)fail('Permintaan sudah diproses. Periksa ulang hasil sebelum mengirim lagi');
 if(typeof options.beforeSend!=='function'||typeof options.afterSend!=='function')fail('Audit push VLAN100 wajib tersedia');
 if(process.env.MIGRATION_MODE==='1'&&options.explicitDevAccess!==true)fail('Akses perubahan perangkat di Dev belum diizinkan');
 return require('./olt-zte-registration').managementOperation(data,device,actor,async()=>{
  plan.used=true;require('./olt-zte-view').invalidate(device);await options.beforeSend(plan.value);const spec={phase:'acs-onu',device,state:plan.state,value:plan.value,native:plan.native};let raw;
  try{raw=await run(data,device,plan.value,options,spec);}catch{raw={success:false,submitted:null};}
  let result;try{if(raw.success)result=verifyResult(raw,spec);}catch{}
  states.delete(stateKey(device,plan.value));if(result)remember(device,plan.value,tr.inspect(raw,plan.value,true));
  const verified=Boolean(result),submitted=raw.submitted===true,uncertain=raw.submitted==null||submitted&&!verified;
  const output={verified,submitted,uncertain,...(result?{result}:{}),message:verified?(plan.value.operation==='disable'?'TR069 Disable. VLAN, IP Host dan layanan internet dipertahankan.':plan.value.operation==='management'?'VLAN100 dan IP Host DHCP tersimpan. TR069 dan layanan gabungan tidak diubah.':plan.native.existingOnly?'TR069 tersimpan pada jalur existing. VLAN dan IP Host tidak diubah.':'TR069, VLAN100 dan IP Host DHCP tersimpan. Menunggu Inform ACS.'):uncertain?'Hasil pengaturan belum pasti. Periksa ulang ONU; tidak ada pengiriman ulang otomatis.':'Pengaturan belum diterapkan. Periksa koneksi dan baca ulang ONU.'};
  try{await options.afterSend(output,plan.value);}catch{output.persistenceWarning=true;output.message+=' Audit hasil belum tersimpan.';}return output;
 });
}
module.exports={target,build,publicState,read,prepare,execute,writeCommands,authorize,verifyStep,verifyResult,load};
