'use strict';
const crypto=require('node:crypto'),auth=require('./auth'),vendors=require('./olt-vendors');
const inventory=require('./olt-zte-inventory'),position=require('./olt-terminal-policy').position;
const cdata=require('./olt-cdata-pon');
const plans=new Map(),pending=new Set(),attempts=new Map(),live=new Map();
const PLAN_MS=120000,STATE_MS=300000,RECOVERY_MS=300000,RETENTION_MS=900000,MAX_MARKERS=512;
const CONTROL_DRIVERS=Object.freeze({zte:'zte-cli-v1',cdata:'cdata-cli-v1'});
const supports=device=>Boolean(device&&Object.hasOwn(CONTROL_DRIVERS,device.vendor)&&(device.vendor!=='cdata'||(device.cliProtocol||'telnet')==='telnet'));
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const connection=device=>crypto.createHash('sha256').update(JSON.stringify([device.id,device.vendor,device.host,device.cliProtocol||'telnet',device.cliPort||23])).digest('hex');
const signature=device=>crypto.createHash('sha256').update(JSON.stringify([connection(device),device.updatedAt,device.cliUsername,device.cliPasswordEnc,device.enabled,device.cliEnabled])).digest('hex');
function ponKey(value){const row=position(value);if(!row||row.onuId||row.ponKey!==value)fail('Posisi PON tidak valid',400);return value;}
const interfaceName=pon=>'gpon-olt_'+ponKey(pon);
const configCommand=pon=>'show running-config interface '+interfaceName(pon);
const stateCommand=pon=>'show gpon onu state '+interfaceName(pon);
function readCommands(pon,vendor='zte'){if(vendor==='cdata')return cdata.readCommands(pon);return['enable','terminal length 0','show card','show interface '+interfaceName(pon),configCommand(pon),stateCommand(pon),'show gpon onu baseinfo '+interfaceName(pon),'show gpon onu uncfg'];}
function writeCommands(pon,enabled,vendor='zte'){if(vendor==='cdata')return cdata.writeCommands(pon,enabled);return[...readCommands(pon),'configure terminal','interface '+interfaceName(pon),enabled?'no shutdown':'shutdown','end','show interface '+interfaceName(pon),configCommand(pon)];}
function output(result,command,last=false){const rows=(result.outputs||[]).filter(row=>row.command===command);if(!rows.length||!last&&rows.length!==1)fail('Pembacaan PON belum lengkap');return rows[last?rows.length-1:0].stdout||'';}
function configState(text,pon){
 const lines=String(text).replace(/\r/g,'').split('\n'),headers=lines.map((line,index)=>({line:line.trim(),index})).filter(row=>row.line.startsWith('interface '));
 if(headers.length!==1||headers[0].line!=='interface '+interfaceName(pon))fail('Target konfigurasi PON tidak cocok');
 const tail=lines.slice(headers[0].index+1),end=tail.findIndex(line=>/^\s*(?:!|end)\s*$/.test(line));if(end<0)fail('Konfigurasi PON terpotong');
 const states=tail.slice(0,end).map(line=>line.trim()).filter(line=>/^(?:no )?shutdown$/.test(line));if(states.length!==1)fail('Status administratif PON belum pasti');
 return states[0]==='shutdown'?'disabled':'enabled';
}
function interfaceState(text,pon){
 const lines=String(text).replace(/\r/g,'').split('\n'),rows=lines.map(line=>line.trim()).filter(line=>/^gpon-olt_/.test(line));
 const name=interfaceName(pon),match=rows.length===1&&rows[0].match(/^gpon-olt_(\d+\/\d+\/\d+) is [A-Za-z -]+,\s*line protocol is (up|down)\.$/i);
 const counts=[...String(text).matchAll(/the number of registered onus is (\d+)\./gi)];
 if(!match||match[1]!==pon||counts.length!==1||Number(counts[0][1])>1024)fail('Identitas atau jumlah ONU pada '+name+' belum terverifikasi');
 return{operState:match[2].toLowerCase(),registered:Number(counts[0][1])};
}
function unregistered(text,pon){
 if(/%Code 62310-GPONSRV\s*:\s*No related information to show\./i.test(text)){if(/gpon-onu_\d+\/\d+\/\d+:/.test(text))fail('Daftar ONU belum terdaftar bertentangan');return[];}
 if(!/OnuIndex\s+Sn\s+State/i.test(text))fail('Daftar ONU belum terdaftar belum terverifikasi');
 const rows=[],seen=new Set();for(const line of String(text).split(/\r?\n/)){
  if(!/^\s*gpon-onu_/.test(line))continue;const match=line.trim().match(/^gpon-onu_(\d+\/\d+\/\d+:\d+)\s+([A-Za-z0-9]{12})\s+(\S+)\s*$/),p=match&&inventory.position(match[1]);
  if(!p||seen.has(match[1]))fail('Daftar ONU belum terdaftar ambigu');seen.add(match[1]);if(p.ponKey===pon)rows.push({id:p.id,serialNumber:match[2].toUpperCase()});
 }if(seen.size>8192||!seen.size&&!/No related information/i.test(text))fail('Daftar ONU belum terdaftar terpotong');return rows;
}
function inspect(result,pon,vendor='zte'){
 if(vendor==='cdata')return cdata.inspect(result,pon);
 const ports=inventory.cards(output(result,'show card'));if(!ports.some(row=>row.ponKey===pon))fail('PON tidak ditemukan pada kartu GPON saat ini');
 const state=interfaceState(output(result,'show interface '+interfaceName(pon)),pon),adminState=configState(output(result,configCommand(pon)),pon);
 const statusText=output(result,stateCommand(pon));
 const registered=!state.registered&&/%Code 62310-GPONSRV\s*:\s*No related information to show\./i.test(statusText)&&!/^\s*\d+\/\d+\/\d+:/m.test(statusText)?[]:[...inventory.states(statusText).values()];
 if(registered.some(row=>row.ponKey!==pon))fail('Status ONU berasal dari PON lain; aksi ditahan');
 if(state.registered!==registered.length)fail('Jumlah ONU pada PON berubah; periksa ulang');
 const identitiesText=output(result,'show gpon onu baseinfo '+interfaceName(pon));
 const identities=!registered.length&&/No related information to show\./i.test(identitiesText)?new Map():inventory.base(identitiesText,pon);
 if(identities.size!==registered.length||registered.some(row=>!identities.has(row.id)))fail('Identitas ONU berubah; periksa PON kembali');
 const extra=unregistered(output(result,'show gpon onu uncfg'),pon),onus=registered.map(row=>[row.id,identities.get(row.id).serialNumber,row.status]).sort(),newOnus=extra.map(row=>[row.id,row.serialNumber]).sort();
 const proof=crypto.createHash('sha256').update(JSON.stringify([ports.map(row=>row.ponKey).sort(),pon,adminState,onus,newOnus])).digest('hex');
 return{ponKey:pon,adminState,operState:state.operState,registered:registered.length,online:registered.filter(row=>row.status==='online').length,unregistered:extra.length,proof,checkedAt:new Date().toISOString()};
}
function readback(result,pon,vendor='zte'){if(vendor==='cdata')return cdata.readback(result,pon);return{ponKey:pon,adminState:configState(output(result,configCommand(pon),true),pon),...interfaceState(output(result,'show interface '+interfaceName(pon),true),pon),checkedAt:new Date().toISOString()};}
function verifyStep(outputs,grant,index,prompt){
 if(grant.vendor==='cdata'){
  const slot=cdata.target(grant.ponKey).slot;
  if(index===2&&!/\(config\)#\s*$/.test(prompt))fail('Mode konfigurasi CDATA belum terverifikasi');
  if(index===3&&!new RegExp('\\(config-gpon-0/'+slot+'\\)#\\s*$').test(prompt))fail('Mode interface PON CDATA belum terverifikasi');
 }
 else{
  if(index===8&&!/\(config\)#\s*$/.test(prompt))fail('Mode konfigurasi ZTE belum terverifikasi');
  if(index===9&&!/\(config-if\)#\s*$/.test(prompt))fail('Mode interface PON ZTE belum terverifikasi');
 }
 if(index===(grant.vendor==='cdata'?6:7)&&inspect({outputs},grant.ponKey,grant.vendor).proof!==grant.proof)fail('Data PON berubah sebelum aksi; periksa ulang');
 if(index===(grant.vendor==='cdata'?9:13))grant.verified=readback({outputs},grant.ponKey,grant.vendor).adminState===(grant.enabled?'enabled':'disabled');
}
function canManage(data,device,actor){const user=(data.users||[]).find(row=>row.id===actor?.id);return Boolean(user&&user.active!==false&&auth.hasPermission(auth.publicUser(user),'olt:pon:manage')&&require('./olt-reboot').scopedDevices(data,user).some(row=>row.id===device.id));}
function check(data,device,actor){if(!canManage(data,device,actor))fail('Tidak memiliki izin mengatur PON ini',403);if(!supports(device)||!device.enabled||!device.cliEnabled||!device.cliUsername||!device.cliPasswordEnc||/^demo-olt-/.test(device.id))fail('Kontrol PON belum terverifikasi untuk driver perangkat ini');if(require('./olt-terminal').isOpen(device.id)||require('./olt-cli').isBusy(device.id)||require('./olt-zte-bridge').isBusy(device.id))fail('Tutup terminal atau tunggu aksi OLT selesai sebelum mengatur PON');}
function remember(device,state){const key=connection(device)+':'+state.ponKey;live.set(key,state);while(live.size>512)live.delete(live.keys().next().value);}
function cached(device,pon,now=Date.now()){const row=live.get(connection(device)+':'+pon);return row&&now-Date.parse(row.checkedAt)>=0&&now-Date.parse(row.checkedAt)<STATE_MS?row:null;}
async function read(data,device,pon,options={}){const[,context,transport]=await vendors.loadLibrary();const result=await context.withContext(data,device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:readCommands(pon,device.vendor),timeoutMs:16000}),{...options,allowZteDevRead:options.explicitDevAccess===true,timeoutMs:18000});if(!result.success)fail('Status PON belum dapat dibaca. Periksa akses CLI.',503);const state=inspect(result,pon,device.vendor);remember(device,state);return state;}
async function prepare(data,device,actor,pon,options={}){
 check(data,device,actor);ponKey(pon);if(pending.has(device.id)||pending.size>=2)fail('Pembacaan PON sedang berjalan',429);
 const key=connection(device)+':'+pon,now=Date.now();if(now-(attempts.get(key)||0)<3000)fail('Tunggu sebentar sebelum memeriksa PON kembali',429);attempts.set(key,now);while(attempts.size>128)attempts.delete(attempts.keys().next().value);
 pending.add(device.id);try{
  const state=await read(data,device,pon,options);for(const[token,plan]of plans)if(plan.expires<=now)plans.delete(token);while(plans.size>=64)plans.delete(plans.keys().next().value);
  const token=crypto.randomBytes(24).toString('base64url');plans.set(token,{actorId:actor.id,deviceId:device.id,signature:signature(device),state,expires:Date.now()+PLAN_MS});
  return{...state,token,revision:device.updatedAt||'',available:true,canSubmit:process.env.MIGRATION_MODE!=='1'||options.explicitDevAccess===true,enabled:state.adminState==='disabled',requiresOnlineConsent:state.adminState==='enabled'&&state.online>0,confirmTarget:pon};
 }finally{pending.delete(device.id);}
}
async function execute(data,device,actor,payload={},options={}){
 check(data,device,actor);const plan=plans.get(payload.token);
 if(!plan||plan.expires<=Date.now()||plan.actorId!==actor.id||plan.deviceId!==device.id||plan.signature!==signature(device)||payload.revision!==(device.updatedAt||'')||payload.confirmId!==device.id||payload.confirmTarget!==plan.state.ponKey||payload.confirmImpact!==true||payload.enabled!==(plan.state.adminState==='disabled'))fail('Pratinjau, PON dan konfirmasi dampak wajib sesuai');
 if(!payload.enabled&&plan.state.online>0&&(payload.confirmDisconnectOnline!==true||payload.confirmOnlineCount!==plan.state.online))fail(`PON ini memiliki ${plan.state.online} ONU online. Konfirmasi khusus pemutusan wajib sesuai pratinjau.`);
 if(plan.result)return plan.result;if(plan.used)fail('Perintah sudah diproses. Periksa status; jangan mengulang.');if(pending.has(device.id)||pending.size>=2)fail('OLT sedang digunakan',409);if(typeof options.beforeSend!=='function'||typeof options.afterSend!=='function')fail('Pencatatan pemeliharaan PON wajib tersedia');
 if(process.env.MIGRATION_MODE==='1'&&options.explicitDevAccess!==true)fail('Aksi PON asli pada mode dev memerlukan konfirmasi khusus');
 pending.add(device.id);plan.used=true;let marker,result;
 try{
  marker=await options.beforeSend(plan.state.ponKey,payload.enabled,{online:plan.state.online,registered:plan.state.registered,unregistered:plan.state.unregistered});if(!marker?.id)fail('Penanda pemeliharaan PON belum tersimpan');
  const[,context,transport]=await vendors.loadLibrary(),deadline=Date.now()+18000;let connectionAttempts=0;
  for(let attempt=0;attempt<2;attempt++){
   if(Date.now()>=deadline)break;
   let attempted=false;connectionAttempts++;
   try{const timeoutMs=Math.min(17000,deadline-Date.now());result=await context.withContext(data,device,async()=>{context.authorizePonOperation({ponKey:plan.state.ponKey,enabled:payload.enabled,proof:plan.state.proof});attempted=true;return transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:writeCommands(plan.state.ponKey,payload.enabled,device.vendor),timeoutMs});},{...(options.transportOptions||{}),allowZteDevRead:options.explicitDevAccess===true,ponActionAllowed:true,explicitDevPonAction:options.explicitDevAccess===true,timeoutMs:Math.min(18000,deadline-Date.now())});}
   catch{result={success:false,submitted:attempted?null:false};}
   // Reconnect only after a proven login timeout with no command sent. Never
   // replay any command after partial preflight, an action, or uncertain delivery.
   const reconnect=attempt===0&&result.submitted===false&&result.completedCommands===0&&result.failedCommandIndex===-1&&result.error==='Batas waktu login CLI vendor terlampaui'&&Date.now()+6000<deadline&&typeof options.validateBeforeRetry==='function';
   if(!reconnect)break;
   try{await options.validateBeforeRetry();}catch{result={...result,error:'Izin atau koneksi OLT berubah sebelum sambung ulang'};break;}
  }
  let state=null;if(result.success)try{state=readback(result,plan.state.ponKey,device.vendor);remember(device,state);}catch{}
  const verified=state?.adminState===(payload.enabled?'enabled':'disabled'),submitted=result.submitted===true,uncertain=result.submitted==null||submitted&&!verified;
  const failureCode=verified?'':/Batas waktu|budget exhausted/i.test(result.error||'')?'cli-timeout':/sedang digunakan/.test(result.error||'')?'cli-busy':/Login|password/i.test(result.error||'')?'cli-login':/Target atau status PON/.test(result.error||'')?'target-verification':/didukung firmware/.test(result.error||'')?'unsupported-command':'cli-incomplete';
  const message=verified?`PON ${plan.state.ponKey} berhasil ${payload.enabled?'diaktifkan':'dinonaktifkan'}; status OLT terverifikasi.`:submitted||uncertain?'Hasil akhir PON belum terverifikasi. Periksa status sebelum mengulang; perintah tidak dikirim ulang otomatis.':failureCode==='cli-timeout'?'Sesi CLI melewati batas waktu sebelum perintah perubahan PON terkirim. Periksa status lalu coba kembali.':'Perintah belum terkirim. Data PON mungkin berubah; periksa ulang.';
  plan.result={ok:verified,submitted,uncertain,verified,ponKey:plan.state.ponKey,state,failureCode,connectionAttempts,completedCommands:result.completedCommands,failedCommandIndex:result.failedCommandIndex,cliStage:result.cliStage,receivedBytes:result.receivedBytes,message};
  try{await options.afterSend(marker,plan.result,payload.enabled);}catch{plan.result.persistenceWarning=true;plan.result.message+=' Pencatatan hasil belum berhasil; periksa audit sebelum melanjutkan.';}
  return plan.result;
 }finally{pending.delete(device.id);}
}
function markerRows(data,now=Date.now()){return(Array.isArray(data.settings?.plannedPonChanges)?data.settings.plannedPonChanges:[]).filter(row=>row&&typeof row.oltId==='string'&&typeof row.connection==='string'&&/^\d+\/\d+\/\d+$/.test(row.ponKey)&&['pending','disabled','recovering'].includes(row.state)&&Number.isFinite(Date.parse(row.startedAt))&&Date.parse(row.startedAt)<=now+30000&&(!row.until||Date.parse(row.until)+RETENTION_MS>now)).slice(-MAX_MARKERS);}
function begin(data,device,pon,enabled,actor,now=Date.now()){
 ponKey(pon);const rows=markerRows(data,now),previous=rows.find(row=>row.oltId===device.id&&row.connection===connection(device)&&row.ponKey===pon)||null,others=rows.filter(row=>row!==previous);
 if(others.length>=MAX_MARKERS)fail('Penanda pemeliharaan PON penuh');const marker={id:crypto.randomUUID(),oltId:device.id,connection:connection(device),ponKey:pon,state:'pending',requestedEnabled:enabled,actorId:actor.id,startedAt:new Date(now).toISOString(),until:''};
 data.settings??={};data.settings.plannedPonChanges=[...others,marker];data.oltLosObservations=(data.oltLosObservations||[]).filter(row=>row.oltId!==device.id||row.pon!==pon);return{id:marker.id,previous};
}
function finish(data,marker,result,enabled,now=Date.now()){
 const rows=markerRows(data,now),row=rows.find(row=>row.id===marker.id);if(!row)return false;
 if(!result.submitted&&!result.uncertain){data.settings.plannedPonChanges=[...rows.filter(item=>item!==row),...(marker.previous?[marker.previous]:[])];return true;}
 if(result.verified){row.state=enabled?'recovering':'disabled';row.until=enabled?new Date(now+RECOVERY_MS).toISOString():'';row.checkedAt=result.state.checkedAt;}data.settings.plannedPonChanges=rows;return true;
}
function maintenance(data,device,pon,checkedAt,now=Date.now()){
 const at=Date.parse(checkedAt||'');if(!Number.isFinite(at))return null;return markerRows(data,now).find(row=>row.oltId===device.id&&row.connection===connection(device)&&row.ponKey===pon&&at>=Date.parse(row.startedAt)&&(!row.until||now<Date.parse(row.until)||at<=Date.parse(row.until)))||null;
}
function decorate(data,device,ports,now=Date.now()){return ports.map(port=>{if(port.kind!=='pon'||!supports(device))return port;const cachedState=cached(device,port.ponKey,now),state=cachedState&&Date.parse(cachedState.checkedAt)>=(Date.parse(port.adminCheckedAt)||0)?cachedState:null,at=state?.checkedAt||port.adminCheckedAt||'',known=now-Date.parse(at)>=0&&now-Date.parse(at)<STATE_MS;return{...port,adminState:known?(state?.adminState||port.adminState||'unknown'):'unknown',adminCheckedAt:known?at:'',operState:state?.operState||port.operState||''};});}
async function readPortStates(device,ports,previous,run,deadline){
 const now=Date.now(),old=new Map((previous||[]).map(row=>[row.ponKey,row])),saved=new Map();
 for(const port of ports){const latest=cached(device,port.ponKey,now),before=old.get(port.ponKey);if(latest&&Date.parse(latest.checkedAt)>=(Date.parse(before?.adminCheckedAt)||0))saved.set(port.ponKey,{adminState:latest.adminState,adminCheckedAt:latest.checkedAt});else if(before&&now-Date.parse(before.adminCheckedAt)>=0&&now-Date.parse(before.adminCheckedAt)<STATE_MS)saved.set(port.ponKey,{adminState:before.adminState,adminCheckedAt:before.adminCheckedAt});}
 const selected=ports.filter(port=>port.kind==='pon'&&!saved.has(port.ponKey)).sort((a,b)=>(Date.parse(old.get(a.ponKey)?.adminCheckedAt)||0)-(Date.parse(old.get(b.ponKey)?.adminCheckedAt)||0)).slice(0,device.vendor==='cdata'?4:16);
 if(selected.length&&deadline-Date.now()>3000)try{
  if(device.vendor==='cdata'){const result=await run(cdata.stateCommands(selected));for(const row of result.outputs||[])if(/^show port info /.test(row.command)){const key=String(row.stdout).match(/^\s*Port\s*:\s*gpon (0\/\d+\/\d+)\s*$/m)?.[1];if(selected.some(port=>port.ponKey===key))try{saved.set(key,{adminState:cdata.portInfo(row.stdout,key).adminState,adminCheckedAt:new Date().toISOString()});}catch{}}}
  else{const result=await run(selected.map(port=>configCommand(port.ponKey)));for(const port of selected)try{saved.set(port.ponKey,{adminState:configState(output(result,configCommand(port.ponKey)),port.ponKey),adminCheckedAt:new Date().toISOString()});}catch{}}
 }catch{}
 return ports.map(port=>({...port,...(saved.get(port.ponKey)||{adminState:'unknown',adminCheckedAt:''})}));
}
function reconciliation(data,observations,now=Date.now()){
 const original=data.settings?.plannedPonChanges||[],rows=markerRows(data,now).map(row=>({...row}));
 for(const row of rows){const device=(data.oltDevices||[]).find(device=>device.id===row.oltId&&connection(device)===row.connection);if(!device)continue;
  const observation=observations.find(item=>item.deviceId===device.id&&item.deviceUpdatedAt===device.updatedAt),snapshot=observation?.snapshot;
  if(!snapshot||snapshot.status!=='online'||snapshot.stale||snapshot.inventoryAvailable===false||now-Date.parse(snapshot.checkedAt)>STATE_MS)continue;
  const port=snapshot.ports?.find(port=>port.kind==='pon'&&port.ponKey===row.ponKey),at=Date.parse(port?.adminCheckedAt||'');
  if(!Number.isFinite(at)||at<Date.parse(row.startedAt)||at>now+30000||now-at>=STATE_MS)continue;
  if(port.adminState==='enabled'&&row.state!=='recovering'){row.state='recovering';row.checkedAt=port.adminCheckedAt;row.until=new Date(at+RECOVERY_MS).toISOString();}
  else if(port.adminState==='disabled'&&row.state!=='disabled'){row.state='disabled';row.checkedAt=port.adminCheckedAt;row.until='';}
 }
 return{rows,changed:JSON.stringify(original)!==JSON.stringify(rows)};
}
function suppressNotification(data,ticket,now=Date.now()){
 if(ticket.source!=='olt-los'||!ticket.pon)return false;const device=(data.oltDevices||[]).find(row=>row.id===ticket.oltId);return Boolean(device&&maintenance(data,device,ticket.pon,ticket.createdAt,now));
}
module.exports={supports,prepare,execute,inspect,readback,verifyStep,configState,interfaceState,unregistered,readCommands,writeCommands,ponKey,canManage,signature,connection,begin,finish,maintenance,markerRows,decorate,suppressNotification,remember,cached,readPortStates,reconciliation,isBusy:id=>pending.has(id),STATE_MS,RECOVERY_MS};
