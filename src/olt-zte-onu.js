'use strict';

const crypto=require('node:crypto'),inventory=require('./olt-zte-inventory');
const busy=new Set(),attempts=new Map();
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const empty=text=>/%Code 62310-GPONSRV\s*:\s*No related information to show\./.test(text);
function target(row){const value=inventory.position(row?.id);if(!value||value.onuId>128||!/^[A-Z0-9]{12}$/.test(row.serialNumber||''))fail('Posisi atau SN ONU ZTE tidak valid',400);return{...value,serialNumber:row.serialNumber,identifierKind:'serial'};}
function version(text){const rows=[...String(text).matchAll(/^\d+\/\d+\/\d+\s+\S+\s+MVR\s+(\S+)/gm)];if(!rows.length||rows.some(row=>row[1]!=='V2.1.0'))fail('Aksi ONU belum terverifikasi pada firmware ZTE ini',422);return[...new Set(rows.map(row=>row[1]))];}
const readCommands=(t,detail=true)=>['enable','terminal length 0','show version-running','show gpon onu by sn '+t.serialNumber,...(detail?['show gpon onu detail-info gpon-onu_'+t.id]:[]),'show gpon onu baseinfo gpon-olt_'+t.ponKey,'show gpon onu state gpon-olt_'+t.ponKey];
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
function commands(spec){const t=target(spec.target),reads=readCommands(t);return[...reads,'configure terminal',spec.operation==='delete'?'interface gpon-olt_'+t.ponKey:'pon-onu-mng gpon-onu_'+t.id,spec.operation==='delete'?'no onu '+t.onuId:'reboot','end',...(spec.operation==='delete'?readCommands(t,false).slice(2):[])];}
function authorize(spec){
 if(!['delete','reboot'].includes(spec.operation))fail('Aksi ONU ZTE tidak diizinkan');const t=target(spec.target),before=inspect(spec.before,t,false,{summary:true});
 if(before.state!==(spec.operation==='delete'?'offline':'online'))fail(spec.operation==='delete'?'ONU masih online atau belum terverifikasi offline. Penghapusan ditahan.':'Reboot hanya untuk ONU yang terverifikasi online.');
 return{...spec,target:t,baseline:before,commands:commands(spec),mutationIndex:readCommands(t).length+2,used:false,submitted:false,verified:false};
}
function verifyStep(outputs,grant,index,prompt){
 const n=readCommands(grant.target).length;
 if(index===n-1&&hash(inspect({success:true,outputs},grant.target))!==hash(grant.baseline))fail('Identitas, status atau daftar ONU berubah sebelum aksi');
 if(index===n&&!/\(config\)#\s*$/.test(prompt))fail('Mode konfigurasi ZTE belum terverifikasi');
 if(index===n+1&&!(grant.operation==='delete'?/\(config-if\)#\s*$/.test(prompt):new RegExp('\\(gpon-onu-mng '+grant.target.id.replaceAll('/','\\/').replaceAll(':','\\:')+'\\)#\\s*$').test(prompt)))fail('Mode atau posisi ONU ZTE belum terverifikasi');
 if(index>=n&&index<=n+3&&/%Code|(?:^|\n)\s*%\s*(?:Error|Failure)|\b(?:failed|failure|error)\b/i.test(outputs.at(-1)?.stdout||''))fail('OLT menolak aksi ONU ZTE');
 if(index!==grant.commands.length-1)return;
 if(grant.operation==='reboot'){grant.verified=true;return;}
 const after=inspect({success:true,outputs},grant.target,true,{summary:true}),remaining=grant.baseline.registry.filter(row=>row.id!==grant.target.id);
 if(after.state!=='missing'||hash(after.registry)!==hash(remaining))fail('Penghapusan ONU belum sesuai atau daftar ONU lain berubah');grant.verified=true;
}
async function run(data,device,onu,operation,payload={},options={}){
 if(device.vendor!=='zte'||!device.enabled||!device.cliEnabled||!device.cliUsername||!device.cliPasswordEnc||process.env.MIGRATION_MODE==='1')fail('Pengelolaan ONU ZTE asli belum aktif',400);
 if(!['inspect','delete','reboot'].includes(operation))fail('Aksi ini belum tersedia untuk ONU ZTE',400);const t=target(onu);
 if(busy.has(device.id)||busy.size>=2||require('./olt-terminal').isOpen(device.id)||require('./olt-zte-registration').isBusy(device.id)||require('./olt-zte-bridge').isMutating(device.id))fail('Tunggu proses OLT atau tutup terminal sebelum melanjutkan',429);
 const key=device.id+':'+t.id;if(operation!=='inspect'&&Date.now()-(attempts.get(key)||0)<60000)fail('Perintah baru diproses. Periksa hasil sebelum mengulang.',429);busy.add(device.id);
 try{
  const vendors=require('./olt-vendors'),[,context,transport]=await vendors.loadLibrary(),native=async(list,spec=null)=>context.withContext(data,device,()=>{if(spec)context.authorizeZteOnuOperation(spec);return transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:list,timeoutMs:15000});},{...options,cliQueue:true,cliInteractive:true,timeoutMs:32000,zteOnuActionAllowed:Boolean(spec)});
  const before=await native(readCommands(t,false)),current=inspect(before,t,false,{summary:true});if(operation==='inspect')return current;if(operation==='delete'&&current.state==='missing')return{deleteConfirmed:true,alreadyAbsent:true};
  const spec={operation,target:t,before};authorize(spec);attempts.set(key,Date.now());while(attempts.size>512)attempts.delete(attempts.keys().next().value);
  const result=await native(commands(spec),spec);if(!result.success||result.verified!==true)fail(result.submitted?'Perintah terkirim tetapi hasil belum pasti. Periksa ulang sebelum tindakan berikutnya.':'Aksi ONU belum dikirim; identitas atau kondisi berubah.',502);
  return operation==='delete'?{deleteConfirmed:true,alreadyAbsent:false}:{submitted:true,confirmed:false};
 }finally{busy.delete(device.id);}
}
function capabilities(device,snapshot){const supported=device.vendor==='zte'&&snapshot?.inventoryAvailable===true&&/\bC(?:300|320)\b/.test(snapshot.modelLabel||snapshot.description||'');return{delete:supported,reboot:supported};}
module.exports={target,version,readCommands,inspect,commands,authorize,verifyStep,run,capabilities,isBusy:id=>busy.has(id)};
