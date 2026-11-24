'use strict';

const crypto=require('node:crypto');
const busy=new Set(),attempts=new Map();
const opticalCache=new(require('./bounded-json-cache').BoundedJsonCache)({maxEntries:2048,maxBytes:2*1024*1024,maxEntryBytes:4096}),opticalPending=new Map(),opticalAttempts=new Map(),opticalOnuAttempts=new Map();
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const output=(result,command,last=false)=>{const rows=(result.outputs||[]).filter(row=>row.command===command);if(!rows.length||!last&&rows.length!==1)fail('Respons HSGQ belum lengkap',503);return rows[last?rows.length-1:0].stdout;};
function position(value){
 const match=String(value||'').match(/^0\/([1-9]|1[0-6]):(0|[1-9]\d?|1[01]\d|12[0-7]):([A-Z0-9]{12})$/);return match?{slot:0,pon:Number(match[1]),onuId:Number(match[2]),ponKey:'0/0/'+Number(match[1]),serialNumber:match[3],identifierKind:'serial'}:null;
}
function identity(text){
 const product=String(text).match(/^\s*Product\s*:\s*(HSGQ-G\d+[A-Z0-9-]*)\s*$/m)?.[1],software=String(text).match(/^\s*Software Version\s*:\s*(\S+)\s*$/m)?.[1];
 if(!product||!software)fail('Identitas GPON HSGQ belum terverifikasi',503);return{product,software,verified:product==='HSGQ-G008ID'&&software==='HSGQ-G008ID_I_V1.1.10C_Rel'};
}
function missingDetailResponse(command,text){
 return /^show ont-info (?:[1-9]|1[0-6]) (?:0|[1-9]\d?|1[01]\d|12[0-7])$/.test(command)&&/^\s*Error, GET ont-auth table fail, reason: ONU is not exist\.\s*$/m.test(text);
}
function detail(text,target,{allowMissing=false}={}){
 if(missingDetailResponse(detailCommand(target),text)||/(?:^|\n)\s*(?:vty%\s*)?(?:The\s+)?(?:ont|onu)\s+(?:does not exist|not exist|not found)\b/i.test(text)){if(allowMissing)return{state:'missing'};fail('ONU HSGQ tidak lagi terdaftar');}
 const field=label=>{const rows=[...String(text).matchAll(new RegExp('^\\s*'+label+'\\s*:[ \\t]*([^\\r\\n]*)','gm'))];if(rows.length!==1)fail('Detail identitas HSGQ belum lengkap',503);return rows[0][1].trim();};
 const pon=field('PON ID'),id=field('ONU ID'),sn=field('SerialNumber').toUpperCase(),run=field('Run State').toLowerCase();
 if(pon!==String(target.pon)||id!==String(target.onuId)||sn!==target.serialNumber)fail('SN atau posisi ONU HSGQ berubah; aksi dibatalkan');
 // This firmware keeps unused, inactive registrations in Initial rather than Offline.
 const inactiveInitial=run==='initial'&&field('State').toLowerCase()==='inactive'&&field('Config State').toLowerCase()==='initial'&&field('Match State').toLowerCase()==='initial';
 return{state:run==='online'?'online':run==='offline'||inactiveInitial?'offline':'unknown',description:field('ONU Name')};
}
const detailCommand=target=>'show ont-info '+target.pon+' '+target.onuId;
const tableCommand=target=>'show ont-info '+target.pon+' all';
function removalTable(text,target){
 const value=String(text||'').replace(/\r/g,'');if(!/PON\/ONU\s+Serial\s+State\s+Run\s+Config\s+Match/.test(value))fail('Tabel PON HSGQ belum lengkap',503);
 const totals=[...value.matchAll(/Total:\s*(\d+)\s+Online:\s*(\d+)\s+Offline:\s*(\d+)/g)],rows=[];
 for(const line of value.split('\n')){if(!/^\s*\d+\/\d+\s+/.test(line))continue;const m=line.trim().match(/^(\d+)\/(\d+)\s+([A-Za-z0-9]{12})\s+(Active|Inactive)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/i);
  if(!m||Number(m[1])!==target.pon||Number(m[2])>127||rows.length>=128)fail('Baris atau posisi PON HSGQ tidak valid');rows.push({pon:Number(m[1]),onuId:Number(m[2]),serialNumber:m[3].toUpperCase(),control:m[4].toLowerCase(),run:m[5].toLowerCase(),config:m[6].toLowerCase(),match:m[7].toLowerCase()});
 }
 if(totals.length!==1||Number(totals[0][1])!==rows.length||Number(totals[0][2])+Number(totals[0][3])!==rows.length||Number(totals[0][2])!==rows.filter(row=>row.run==='online').length||new Set(rows.map(row=>row.onuId)).size!==rows.length||new Set(rows.map(row=>row.serialNumber)).size!==rows.length)fail('Jumlah atau identitas tabel PON HSGQ tidak cocok');
 const selected=rows.find(row=>row.onuId===target.onuId),registry=rows.map(({pon,onuId,serialNumber})=>({pon,onuId,serialNumber})).sort((a,b)=>a.onuId-b.onuId);
 if(!selected){if(rows.some(row=>row.serialNumber===target.serialNumber))fail('SN ONU HSGQ berpindah posisi');return{state:'missing',registry};}
 if(selected.serialNumber!==target.serialNumber)fail('SN ONU HSGQ berubah; penghapusan dibatalkan');
 const initial=selected.run==='initial'&&selected.control==='inactive'&&selected.config==='initial'&&selected.match==='initial';
 return{state:selected.run==='online'&&selected.control==='active'?'online':selected.run==='offline'||initial?'offline':'unknown',registry};
}
const actionsFor=value=>({rename:value.verified,reboot:value.verified,delete:value.verified,saveConfig:value.verified});
const opticalConnection=device=>digest([device.id,device.host,device.port,device.communityEnc,device.cliProtocol,device.cliPort,device.cliUsername,device.cliPasswordEnc,device.webPort]);
const opticalKey=(device,row)=>opticalConnection(device)+':'+row.id+':'+row.serialNumber;
function cachedOptical(device,rows){return rows.map(row=>{const value=opticalCache.get(opticalKey(device,row));return value?{...row,...value}:row;});}
function opticalReading(value,target,now=Date.now()){
 if(!value||value.port_id!==target.pon||value.ont_id!==target.onuId)return null;
 const number=(text,unit,min,max)=>{const match=typeof text==='string'&&text.trim().match(new RegExp('^(-?\\d+(?:\\.\\d+)?)\\s*'+unit+'$')),result=match?Number(match[1]):NaN;return Number.isFinite(result)&&result>=min&&result<=max?result:null;},rxPower=number(value.receive_power,'dBm',-60,10);if(rxPower===null)return null;
 return{rxPower,txPower:number(value.transmit_power,'dBm',-60,20),rxPowerAt:new Date(now).toISOString(),opticalSource:'hsgq-web-onu-optical'};
}

function isReadCommands(commands){
 if(!Array.isArray(commands)||commands.length<3||commands.length>20||commands[0]!=='enable'||commands[1]!=='configure')return false;
 return commands.slice(2).every(command=>typeof command==='string'&&/^(?:show (?:ont-info(?: all| [1-9]\d?(?: (?:all|0|[1-9]\d?|1[01]\d|12[0-7]))?)?|ont-version (?:[1-9]|1[0-6]) (?:0|[1-9]\d?|1[01]\d|12[0-7])|ont-optical(?: all| [1-9]\d?)|onu-info all|ont-autofind|cpu-usage|memory statistics|version))$/.test(command));
}
function isProbeCommands(commands){
 if(!Array.isArray(commands)||commands[0]!=='enable')return false;
 return commands.length===2&&commands[1]==='save ?'||commands.length===3&&commands[1]==='configure'&&/^(?:show ont-(?:info|optical)(?: (?:all|[1-9]\d?))? \?|save \?|\?)$/.test(commands[2])||commands.length===4&&commands[1]==='configure'&&/^interface gpon (?:[1-9]|1[0-6])$/.test(commands[2])&&/^ont(?: setting (?:0|[1-9]\d?|1[01]\d|12[0-7])| (?:delete|reboot))? \?$/.test(commands[3]);
}
function actionCommands(spec){
 if(spec.operation==='save')return['enable','configure','show version','save'];
 const target=position(spec.address);if(!target||target.serialNumber!==spec.serialNumber)fail('Target aksi HSGQ tidak valid');
 const action=spec.operation==='rename'?`ont setting ${target.onuId} name ${spec.description}`:`ont ${spec.operation} ${target.onuId}`;
 const query=spec.operation==='delete'&&spec.inventoryProof===true?tableCommand(target):detailCommand(target);
 return['enable','configure','show version',query,'interface gpon '+target.pon,action,...(spec.operation==='reboot'?[]:['exit',query])];
}
function authorize(spec){
 if(!spec||!['rename','reboot','delete','save'].includes(spec.operation)||!identity(spec.version).verified)fail('Aksi firmware HSGQ belum terverifikasi');
 const target=spec.operation==='save'?null:position(spec.address);if(spec.operation!=='save'&&(!target||target.serialNumber!==spec.serialNumber))fail('Target aksi HSGQ tidak valid');
 if(target){const current=spec.operation==='delete'&&spec.inventoryProof===true?removalTable(spec.before,target):detail(spec.before,target);if(spec.operation==='delete'&&current.state!=='offline'||spec.operation==='reboot'&&current.state!=='online')fail('Status ONU HSGQ belum sesuai untuk aksi ini');if(spec.operation==='rename'){const name=require('./olt-cli').description(spec.description);if(name.length>30||name!==spec.description||current.description!==spec.previousDescription)fail('Nama atau konfirmasi sebelumnya tidak sesuai');}}
 const commands=actionCommands(spec);return{...spec,commands,used:false,submitted:false,verified:false,mutationIndex:spec.operation==='save'?3:5};
}
function verifyStep(outputs,grant,index,prompt){
 const result={outputs};if(index===1&&!/\(config\)#\s*$/.test(prompt))fail('Mode konfigurasi HSGQ belum pasti');
 if(index===2&&(!identity(outputs.at(-1)?.stdout).verified||digest(identity(outputs.at(-1).stdout))!==digest(identity(grant.version))))fail('Firmware HSGQ berubah');
 const target=grant.operation==='save'?null:position(grant.address);
 if(index===3&&target){const parse=grant.operation==='delete'&&grant.inventoryProof===true?removalTable:detail,current=parse(outputs.at(-1)?.stdout,target);if(digest(current)!==digest(parse(grant.before,target)))fail('Identitas atau status ONU HSGQ berubah sebelum pengiriman');}
 if(index===4&&target&&!new RegExp('\\(config-gpon-'+target.pon+'\\)#\\s*$').test(prompt))fail('Interface GPON HSGQ belum terverifikasi');
 if(index!==grant.commands.length-1)return;
 if(grant.operation==='save'){grant.verified=require('./olt-cli').saveConfirmed(outputs.at(-1)?.stdout);return;}
 if(grant.operation==='reboot')return;
 if(grant.operation==='delete'&&grant.inventoryProof===true){const current=removalTable(output(result,tableCommand(target),true),target),expected=removalTable(grant.before,target).registry.filter(row=>row.onuId!==target.onuId);grant.verified=current.state==='missing'&&digest(current.registry)===digest(expected);return;}
 const current=detail(output(result,detailCommand(target),true),target,{allowMissing:grant.operation==='delete'});grant.verified=grant.operation==='delete'?current.state==='missing':current.description===grant.description;
}
async function readInventory(adapter,helpers={}){
 const vendors=require('./olt-vendors'),[,context,transport]=await vendors.loadLibrary(),snmp=await import('./olt-vendor-library/services/snmp.js');
 const interfaces=Array.isArray(helpers.physicalInterfaces)?helpers.physicalInterfaces:[...((await snmp.snmpWalk({olt:adapter.olt,oid:'.1.3.6.1.2.1.2.2.1.2',timeoutMs:2500}))?.values()||[])],pons=[...new Set(interfaces.map(row=>String(row.value||'').replace(/^"|"$/g,'').match(/^PON(0?[1-9]|1[0-6])$/)?.[1]).filter(Boolean).map(Number))].sort((a,b)=>a-b);
 if(!pons.length)fail('Daftar PON fisik HSGQ belum terverifikasi',503);
 const commands=['enable','configure','show version',...pons.map(pon=>'show ont-info '+pon+' all')],raw=await transport.executeOltCommands({olt:adapter.olt,password:context.decryptSecret(adapter.olt.password_encrypted),commands,timeoutMs:15000});
 if(!raw.success)fail('Inventory HSGQ belum terbaca lengkap; data terakhir dipertahankan',503);
 const version=identity(output(raw,'show version')),items=[];
 for(const pon of pons){const text=output(raw,'show ont-info '+pon+' all'),parsed=adapter.parseOntInfoTable(text),summary=adapter.parseOntInfoSummary(text);if(!/PON\/ONU\s+Serial/.test(text)||!summary||summary.total_onu!==parsed.length||summary.online+summary.offline!==summary.total_onu||summary.online!==parsed.filter(row=>row.status==='online').length||parsed.some(row=>row.pon!==pon)||new Set(parsed.map(row=>row.onu_id)).size!==parsed.length)fail('Daftar ONU HSGQ terpotong atau berasal dari PON lain',503);items.push(...parsed);}
 const rows=vendors.normalizeOnus(items,{...helpers,classifyCause:typeof helpers.classifyCause==='function'?value=>helpers.classifyCause(adapter.normalizeDownCause(value)):undefined,minimumOnuId:0});if(rows.length!==items.length)fail('Identitas ONU HSGQ belum lengkap',503);
 return{available:true,rows:cachedOptical(context.current().device,rows),modelLabel:version.product,hsgqActions:actionsFor(version),version,warning:version.verified?'':'Monitoring HSGQ aktif; aksi tulis firmware ini belum terverifikasi.'};
}
async function enrichPage(data,device,rows,options={}){
 const cached=()=>cachedOptical(device,rows);if(process.env.MIGRATION_MODE==='1'||device.vendor!=='hsgq'||!device.enabled||!device.cliEnabled||rows.length>8||busy.has(device.id)||require('./olt-terminal').isOpen(device.id))return cached();
 const needed=rows.filter(row=>{const target=position(row.id),key=opticalKey(device,row),current=opticalCache.get(key)||row;return row.status==='online'&&target?.serialNumber===row.serialNumber&&Date.now()-(opticalOnuAttempts.get(key)||0)>=30000&&(!current.rxPowerAt||Date.now()-Date.parse(current.rxPowerAt)>60000);}),pons=[...new Set(needed.map(row=>row.pon))];if(!needed.length||pons.length!==1)return cached();
 const key=opticalConnection(device);if(opticalPending.has(key)){if(options.background!==true)await opticalPending.get(key);return cached();}if(opticalPending.size>=2||Date.now()-(opticalAttempts.get(key)||0)<5000)return cached();opticalAttempts.set(key,Date.now());while(opticalAttempts.size>64)opticalAttempts.delete(opticalAttempts.keys().next().value);
 const task=(async()=>{const vendors=require('./olt-vendors'),[factory,context,transport]=await vendors.loadLibrary();return context.withContext(data,device,async()=>{
   const adapter=factory.createOltAdapter(vendors.legacyDevice(device)),command='show ont-info '+pons[0]+' all',raw=await transport.executeOltCommands({olt:adapter.olt,password:context.decryptSecret(device.cliPasswordEnc),commands:['enable','configure','show version',command],timeoutMs:3000});if(!raw.success||!identity(output(raw,'show version')).verified)return;
   const text=output(raw,command),fresh=adapter.parseOntInfoTable(text),summary=adapter.parseOntInfoSummary(text);if(!summary||summary.total_onu!==fresh.length||new Set(fresh.map(row=>row.onu_id)).size!==fresh.length)return;
   for(const row of needed){if(context.remaining()<500)break;const target=position(row.id),matched=fresh.filter(item=>item.pon===target.pon&&item.onu_id===target.onuId&&item.sn===target.serialNumber&&item.status==='online');if(matched.length!==1||fresh.filter(item=>item.sn===target.serialNumber).length!==1)continue;
    const entry=opticalKey(device,row);opticalOnuAttempts.set(entry,Date.now());while(opticalOnuAttempts.size>2048)opticalOnuAttempts.delete(opticalOnuAttempts.keys().next().value);
    const payload=await adapter.fetchWebJson('/gponont_mgmt?form=ont_optical&port_id='+target.pon+'&ont_id='+target.onuId),value=payload?.code===1?opticalReading(payload.data,target):null;if(value)opticalCache.set(entry,value,15*60*1000);
   }
  },{...options,timeoutMs:4500});})();const settled=task.catch(()=>{}).finally(()=>opticalPending.delete(key));opticalPending.set(key,settled);if(options.background!==true)await settled;return cached();
}
async function execute(data,device,spec,options={}){
 const vendors=require('./olt-vendors'),[,context,transport]=await vendors.loadLibrary();return context.withContext(data,device,()=>{context.authorizeHsgqOperation(spec);return transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:actionCommands(spec),timeoutMs:15000});},{...options,hsgqActionAllowed:true,cliInteractive:true,timeoutMs:32000});
}
async function waitForOptical(device){
 const pending=opticalPending.get(opticalConnection(device));if(!pending)return;let timer;
 try{await Promise.race([pending,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Pembacaan redaman belum selesai; coba kembali sebentar lagi'),{status:503})),5000);timer.unref?.();})]);}finally{clearTimeout(timer);}
}
async function run(data,device,onu,operation,payload={},options={}){
 if(device.vendor!=='hsgq'||!device.enabled||!device.cliEnabled||!device.cliUsername||!device.cliPasswordEnc)fail('Akses pengelolaan HSGQ belum dikonfigurasi',400);
 const target=position(onu?.id);if(!target||target.serialNumber!==onu.serialNumber||!['inspect','rename','reboot','delete'].includes(operation))fail('Posisi dan SN ONU HSGQ tidak cocok',400);
 if(require('./olt-terminal').isOpen(device.id)||busy.has(device.id)||busy.size>=2)fail('Tutup terminal atau tunggu operasi HSGQ selesai',429);
 const key=device.id+':'+onu.id;if(operation!=='inspect'&&Date.now()-(attempts.get(key)||0)<(operation==='rename'?5000:60000))fail('Perintah baru diproses; periksa hasil sebelum mengulang',429);
 busy.add(device.id);
 try{
  await waitForOptical(device);
  const inventoryProof=operation==='delete'||operation==='inspect'&&payload.purpose==='delete',query=inventoryProof?tableCommand(target):detailCommand(target);
  const vendors=require('./olt-vendors'),[,context,transport]=await vendors.loadLibrary(),deadline=Date.now()+32000;let raw;
  // Retry only an incomplete read, never a mutation or a rejected identity.
  for(let attempt=0;attempt<2;attempt++){
   const remaining=deadline-Date.now();if(remaining<1000)break;
   raw=await context.withContext(data,device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:['enable','configure','show version',query],timeoutMs:Math.min(12000,remaining)}),{...options,cliInteractive:true,timeoutMs:remaining});
   if(!inventoryProof||raw.success||raw.error!=='Batas waktu pembacaan vendor terlampaui')break;
  }
  if(!raw?.success)fail('Identitas ONU HSGQ belum dapat diverifikasi',503);const version=output(raw,'show version'),before=output(raw,query);if(!identity(version).verified)fail('Aksi firmware HSGQ ini belum terverifikasi');
  const current=inventoryProof?removalTable(before,target):detail(before,target,{allowMissing:operation==='inspect'});if(operation==='inspect')return{...current,actions:actionsFor(identity(version))};if(operation==='delete'&&current.state==='missing')return{deleteConfirmed:true,alreadyAbsent:true};
  const spec={operation,address:onu.id,serialNumber:onu.serialNumber,version,before,...(inventoryProof?{inventoryProof:true}:{}),...(operation==='rename'?{description:require('./olt-cli').description(payload.description),previousDescription:payload.previousDescription}:{})};authorize(spec);
  attempts.set(key,Date.now());while(attempts.size>512)attempts.delete(attempts.keys().next().value);const result=await execute(data,device,spec,options);
  if(!result.success||result.verified!==true&&operation!=='reboot')fail(result.submitted?'Perintah HSGQ sudah dikirim tetapi hasil belum pasti. Periksa sebelum mengulang.':'Aksi HSGQ belum terkirim atau target berubah.',502);
  return operation==='rename'?{description:spec.description,descriptionConfirmed:true}:operation==='delete'?{deleteConfirmed:result.verified===true,alreadyAbsent:false}:{submitted:result.submitted===true,confirmed:false};
 }finally{busy.delete(device.id);}
}
async function saveConfig(data,device,options={}){
 if(device.vendor!=='hsgq'||!device.enabled||!device.cliEnabled||!device.cliPasswordEnc)fail('Akses HSGQ belum dikonfigurasi',400);if(busy.has(device.id)||busy.size>=2||require('./olt-terminal').isOpen(device.id))fail('Akses HSGQ sedang digunakan',429);busy.add(device.id);
 try{await waitForOptical(device);const vendors=require('./olt-vendors'),[,context,transport]=await vendors.loadLibrary(),raw=await context.withContext(data,device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:['enable','show version'],timeoutMs:5000}),options);if(!raw.success)fail('Identitas OLT HSGQ belum terverifikasi');const spec={operation:'save',version:output(raw,'show version')};authorize(spec);const result=await execute(data,device,spec,options);return{saveConfirmed:result.success===true&&result.verified===true};}finally{busy.delete(device.id);}
}

module.exports={isReadCommands,isProbeCommands,position,identity,detail,removalTable,missingDetailResponse,actionCommands,authorize,verifyStep,readInventory,enrichPage,opticalReading,cachedOptical,run,saveConfig,isBusy:id=>busy.has(id)};
