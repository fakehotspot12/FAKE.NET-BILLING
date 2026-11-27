'use strict';

const crypto=require('node:crypto'),inventory=require('./olt-zte-inventory');
const busy=new Set(),attempts=new Map();
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const empty=text=>/%Code 62310-GPONSRV\s*:\s*No related information to show\./.test(text);
function target(row){const value=inventory.position(row?.id);if(!value||value.onuId>128||!/^[A-Z0-9]{12}$/.test(row.serialNumber||''))fail('Posisi atau SN ONU ZTE tidak valid',400);return{...value,serialNumber:row.serialNumber,identifierKind:'serial'};}
function version(text){const rows=[...String(text).matchAll(/^\d+\/\d+\/\d+\s+\S+\s+MVR\s+(\S+)/gm)];if(!rows.length||rows.some(row=>row[1]!=='V2.1.0'))fail('Aksi ONU belum terverifikasi pada firmware ZTE ini',422);return[...new Set(rows.map(row=>row[1]))];}
const readCommands=(t,detail=true)=>['enable','terminal length 0','show version-running','show gpon onu by sn '+t.serialNumber,...(detail?['show gpon onu detail-info gpon-onu_'+t.id]:[]),'show gpon onu baseinfo gpon-olt_'+t.ponKey,'show gpon onu state gpon-olt_'+t.ponKey];
function relocationReads(t){return[...readCommands(t),'show pon onu uncfg','show running-config interface gpon-onu_'+t.id,'show onu running config gpon-onu_'+t.id];}
function relocationProof(raw,t,destination){
 require('./olt-pon').ponKey(destination);if(destination===t.ponKey)fail('PON tujuan harus berbeda dari PON lama');
 const rows=require('./olt-zte-pnp').discovery(output(raw,'show pon onu uncfg')).filter(row=>row.serialNumber===t.serialNumber);
 if(rows.length!==1||rows[0].ambiguous||rows[0].ponKey!==destination)fail('SN pindahan belum terdeteksi tunggal pada PON tujuan');
 const config=output(raw,'show running-config interface gpon-onu_'+t.id),management=output(raw,'show onu running config gpon-onu_'+t.id);
 if(!config.split('\n').some(line=>line.trim()==='interface gpon-onu_'+t.id)||!management.split('\n').some(line=>line.trim()==='pon-onu-mng gpon-onu_'+t.id)||/%Code|(?:^|\n)\s*%/i.test(config+'\n'+management)||!/^\s*end\s*$/m.test(config)||!/(?:^|\n)!\s*\n(?:end\s*\n)?[^\r\n<>]{1,100}[>#]\s*$/.test(management))fail('Cadangan konfigurasi ONU lama belum lengkap');
 return hash({destination,serialNumber:t.serialNumber,model:rows[0].model,config,management});
}
async function backupRelocation(data,device,t,destination,raw,options){
 const fs=require('node:fs/promises'),path=require('node:path');
 if(Buffer.from(data.settings?.security?.secretKey||'','base64').length!==32)fail('Kunci cadangan belum tersedia; pemindahan ditahan');
 const directory=options.relocationBackupDir||path.join(__dirname,'..','data','olt-relocations');
 await fs.mkdir(directory,{recursive:true,mode:0o700});const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())fail('Folder cadangan ONU tidak aman');await fs.chmod(directory,0o700);
 // Bound disk use without deleting a recovery point whose retention is still active.
 const entries=(await fs.readdir(directory)).filter(name=>/^\d{13}-[0-9a-f-]{36}\.json$/.test(name)),now=Date.now();
 for(const name of entries)if(now-Number(name.slice(0,13))>30*86400000)await fs.unlink(path.join(directory,name));
 if(entries.filter(name=>now-Number(name.slice(0,13))<=30*86400000).length>=128)fail('Batas cadangan pemindahan tercapai; periksa cadangan sebelum melanjutkan');
 const id=now+'-'+crypto.randomUUID(),plain=JSON.stringify({at:new Date(now).toISOString(),oltId:device.id,serialNumber:t.serialNumber,oldAddress:t.id,destination,raw});if(Buffer.byteLength(plain)>1048576)fail('Cadangan ONU melebihi batas aman');
 const file=await fs.open(path.join(directory,id+'.json'),'wx',0o600);
 try{await file.writeFile(JSON.stringify({version:1,payload:require('./secure-secrets').encryptSecret(data,plain)}));await file.sync();}finally{await file.close();}
 const folder=await fs.open(directory,'r');try{await folder.sync();}finally{await folder.close();}return id;
}
function output(raw,command,last=false){const rows=(raw.outputs||[]).filter(row=>row.command===command);if(!rows.length||!last&&rows.length!==1)fail('Respons identitas ONU ZTE belum lengkap',503);const text=String(rows[last?rows.length-1:0].stdout||'').replace(/\r/g,'');if(Buffer.byteLength(text)>262144||/--\s*More\s*--/.test(text))fail('Respons ONU ZTE terpotong',503);return text;}
function inspect(raw,t,last=false,{summary=false}={}){
 if(!raw.success)fail('Status ONU ZTE belum dapat dibaca melalui CLI',503);const get=command=>output(raw,command,last),firmware=version(get('show version-running'));
 const addresses=require('./olt-zte-registration').bySerial(get('show gpon onu by sn '+t.serialNumber),t.serialNumber),baseText=get('show gpon onu baseinfo gpon-olt_'+t.ponKey),stateText=get('show gpon onu state gpon-olt_'+t.ponKey);
 const units=empty(baseText)?new Map():inventory.base(baseText,t.ponKey),states=empty(stateText)&&!units.size?new Map():inventory.states(stateText);
 if(units.size!==states.size||[...units.keys()].some(id=>!states.has(id))||new Set([...units.values()].map(row=>row.serialNumber)).size!==units.size)fail('Daftar ONU pada PON berubah atau ambigu');
 const registry=[...units.values()].map(row=>({id:row.id,serialNumber:row.serialNumber,type:row.model})).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
 if(!addresses.length&&!units.has(t.id)&&!registry.some(row=>row.serialNumber===t.serialNumber)&&(summary||empty(get('show gpon onu detail-info gpon-onu_'+t.id))))return{firmware,state:'missing',registry};
 if(addresses.length!==1||addresses[0]!==t.id||units.get(t.id)?.serialNumber!==t.serialNumber)fail('SN ONU berpindah atau berbeda dari posisi terpilih');
 if(summary&&!(raw.outputs||[]).some(row=>row.command==='show gpon onu detail-info gpon-onu_'+t.id))return{firmware,state:states.get(t.id).status,registry};
 const detail=get('show gpon onu detail-info gpon-onu_'+t.id);
 const field=label=>{const rows=[...detail.matchAll(new RegExp('^[ \\t]*'+label+'[ \\t]*:[ \\t]*([^\\n]*)','gm'))];if(rows.length!==1)fail('Identitas detail ONU tidak lengkap atau ganda');return rows[0][1].trim();};
 if(field('ONU interface')!=='gpon-onu_'+t.id||field('Serial number').toUpperCase()!==t.serialNumber)fail('Identitas ONU ZTE berbeda');
 const phase=field('Phase state').toLowerCase().replace(/[-_]/g,''),listed=states.get(t.id).status;
 const state=phase==='working'&&listed==='online'?'online':['offline','down','los','losi','losf','dyinggasp','poweroff'].includes(phase)&&listed==='offline'?'offline':'unknown';
 return{firmware,state,registry};
}
function commands(spec){const t=target(spec.target),reads=spec.relocation?relocationReads(t):readCommands(t);return[...reads,'configure terminal',spec.operation==='delete'?'interface gpon-olt_'+t.ponKey:'pon-onu-mng gpon-onu_'+t.id,spec.operation==='delete'?'no onu '+t.onuId:'reboot','end',...(spec.operation==='delete'?readCommands(t,false).slice(2):[]),...(spec.relocation?['show pon onu uncfg']:[])];}
function authorize(spec){
 if(!['delete','reboot'].includes(spec.operation))fail('Aksi ONU ZTE tidak diizinkan');const t=target(spec.target),before=inspect(spec.before,t,false,{summary:true});
 if(before.state!==(spec.operation==='delete'?'offline':'online'))fail(spec.operation==='delete'?'ONU masih online atau belum terverifikasi offline. Penghapusan ditahan.':'Reboot hanya untuk ONU yang terverifikasi online.');
 const relocation=spec.relocation;if(relocation&&(spec.operation!=='delete'||!/^\d{13}-[0-9a-f-]{36}$/.test(relocation.backupId||'')))fail('Cadangan pemindahan ONU belum terverifikasi');
 return{...spec,target:t,baseline:before,...(relocation?{relocationProof:relocationProof(spec.before,t,relocation.destination)}:{}),commands:commands(spec),mutationIndex:(relocation?relocationReads(t):readCommands(t)).length+2,used:false,submitted:false,verified:false};
}
function verifyStep(outputs,grant,index,prompt){
 const n=(grant.relocation?relocationReads(grant.target):readCommands(grant.target)).length;
 if(index===n-1&&hash(inspect({success:true,outputs},grant.target))!==hash(grant.baseline))fail('Identitas, status atau daftar ONU berubah sebelum aksi');
 if(index===n-1&&grant.relocation&&relocationProof({success:true,outputs},grant.target,grant.relocation.destination)!==grant.relocationProof)fail('Lokasi baru atau konfigurasi cadangan berubah sebelum pemindahan');
 if(index===n&&!/\(config\)#\s*$/.test(prompt))fail('Mode konfigurasi ZTE belum terverifikasi');
 if(index===n+1&&!(grant.operation==='delete'?/\(config-if\)#\s*$/.test(prompt):new RegExp('\\(gpon-onu-mng '+grant.target.id.replaceAll('/','\\/').replaceAll(':','\\:')+'\\)#\\s*$').test(prompt)))fail('Mode atau posisi ONU ZTE belum terverifikasi');
 if(index>=n&&index<=n+3&&/%Code|(?:^|\n)\s*%\s*(?:Error|Failure)|\b(?:failed|failure|error)\b/i.test(outputs.at(-1)?.stdout||''))fail('OLT menolak aksi ONU ZTE');
 if(index!==grant.commands.length-1)return;
 if(grant.operation==='reboot'){grant.verified=true;return;}
 const after=inspect({success:true,outputs},grant.target,true,{summary:true}),remaining=grant.baseline.registry.filter(row=>row.id!==grant.target.id);
 if(after.state!=='missing'||hash(after.registry)!==hash(remaining))fail('Penghapusan ONU belum sesuai atau daftar ONU lain berubah');
 if(grant.relocation){const rows=require('./olt-zte-pnp').discovery(output({outputs},'show pon onu uncfg',true)).filter(row=>row.serialNumber===grant.target.serialNumber);if(rows.length!==1||rows[0].ambiguous||rows[0].ponKey!==grant.relocation.destination)fail('SN berubah lokasi setelah registrasi lama dilepas');}grant.verified=true;
}
async function perform(data,device,onu,operation,payload={},options={},relocation=null){
 if(device.vendor!=='zte'||!device.enabled||!device.cliEnabled||!device.cliUsername||!device.cliPasswordEnc||process.env.MIGRATION_MODE==='1')fail('Pengelolaan ONU ZTE asli belum aktif',400);
 if(!['inspect','delete','reboot'].includes(operation))fail('Aksi ini belum tersedia untuk ONU ZTE',400);const t=target(onu);
 if(busy.has(device.id)||busy.size>=2||require('./olt-terminal').isOpen(device.id)||!relocation&&require('./olt-zte-registration').isBusy(device.id)||(relocation?require('./olt-zte-bridge').isBusy(device.id):require('./olt-zte-bridge').isMutating(device.id)))fail('Tunggu proses OLT atau tutup terminal sebelum melanjutkan',429);
 const key=device.id+':'+t.id;if(operation!=='inspect'&&Date.now()-(attempts.get(key)||0)<60000)fail('Perintah baru diproses. Periksa hasil sebelum mengulang.',429);busy.add(device.id);
 let attempted=false;
 try{
  const vendors=require('./olt-vendors'),[,context,transport]=await vendors.loadLibrary(),native=async(list,spec=null)=>context.withContext(data,device,()=>{if(spec)context.authorizeZteOnuOperation(spec);return transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:list,timeoutMs:15000});},{...options,cliQueue:true,cliInteractive:true,timeoutMs:32000,zteOnuActionAllowed:Boolean(spec)});
  const before=await native(relocation?relocationReads(t):readCommands(t,false)),current=inspect(before,t,false,{summary:!relocation});if(operation==='inspect')return current;if(operation==='delete'&&current.state==='missing'&&!relocation)return{deleteConfirmed:true,alreadyAbsent:true};
  if(relocation){if(current.state!=='offline')fail('Registrasi lama masih online atau belum pasti offline; pemindahan ditahan');relocationProof(before,t,relocation.destination);try{relocation.backupId=await backupRelocation(data,device,t,relocation.destination,before,options);}catch{fail('Cadangan konfigurasi gagal disimpan; pemindahan dibatalkan');}await options.beforeRelocationDelete({oldAddress:t.id,destination:relocation.destination,backupId:relocation.backupId,status:'prepared'});}
  const spec={operation,target:t,before,...(relocation?{relocation}:{})};authorize(spec);attempts.set(key,Date.now());while(attempts.size>512)attempts.delete(attempts.keys().next().value);
  attempted=true;const result=await native(commands(spec),spec);if(!result.success||result.verified!==true)throw Object.assign(Error(result.submitted?'Perintah terkirim tetapi hasil belum pasti. Periksa ulang sebelum tindakan berikutnya.':'Aksi ONU belum dikirim; identitas atau kondisi berubah.'),{status:502,...(relocation?{registrationDiagnostic:{phase:'relocation',submitted:result.submitted??null,error:result.error||'Hasil pemindahan belum terverifikasi'}}:{})});
  return operation==='delete'?{deleteConfirmed:true,alreadyAbsent:false,...(relocation?{relocation:{...relocation,oldAddress:t.id,status:'verified'}}:{})}:{submitted:true,confirmed:false};
 }catch(error){if(relocation&&!error.registrationDiagnostic)error.registrationDiagnostic={phase:attempted?'relocation':'preflight',submitted:attempted?null:false,...(!attempted?{retryableRead:true}:{}),error:error.message};throw error;}finally{busy.delete(device.id);}
}
function capabilities(device,snapshot){const supported=device.vendor==='zte'&&snapshot?.inventoryAvailable===true&&/\bC(?:300|320)\b/.test(snapshot.modelLabel||snapshot.description||'');return{delete:supported,reboot:supported};}
function run(data,device,onu,operation,payload={},options={}){return perform(data,device,onu,operation,payload,options);}
function relocateOffline(data,device,onu,destination,options={}){require('./olt-pon').ponKey(destination);if(typeof options.beforeRelocationDelete!=='function')fail('Audit persisten pemindahan wajib tersedia');return perform(data,device,onu,'delete',{},options,{destination});}
module.exports={target,version,readCommands,inspect,commands,authorize,verifyStep,run,relocateOffline,capabilities,isBusy:id=>busy.has(id)};
