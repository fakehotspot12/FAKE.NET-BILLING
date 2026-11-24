'use strict';
const crypto=require('node:crypto'),vendors=require('./olt-vendors'),redis=require('./redis-cache');
const INTERVAL_MS=30000,FAST_MS=15000,SLOW_MS=60000,MODEL_MS=86400000,RETRY_MS=30000,MAX_RETRY_MS=300000,MAX_PENDING=2;
const cache=new(require('./bounded-json-cache').BoundedJsonCache)({maxEntries:64,maxBytes:262144,maxEntryBytes:4096}),pending=new Map(),restoring=new Map();let preparing=false;
function percent(value){if(value===null||value===undefined||value==='')return null;const match=String(value).match(/^\s*(\d+(?:\.\d+)?)\s*%?\s*$/);const number=match?Number(match[1]):NaN;return Number.isFinite(number)&&number<=100?number:null;}
function model(value){const text=String(value||'').trim();return text.length<=80&&/^[A-Za-z0-9][A-Za-z0-9 ._()+/-]*$/.test(text)&&! /^(?:olt|epon|gpon|unknown|n\/a|none)$/i.test(text)?text:'';}
function key(device){return crypto.createHash('sha256').update(JSON.stringify([device.id,device.host,device.port,device.vendor,device.enabled,device.cliEnabled,device.cliProtocol,device.cliPort,device.webPort,device.cliUsername,device.cliPasswordEnc,device.communityEnc,'adaptive-resources-v1'])).digest('hex').slice(0,24);}
const stamp=value=>Number(value?.attemptedAt)||Date.parse(value?.checkedAt||'')||0;
function cached(device,previous={}){const signature=key(device),value=cache.get(signature),old=previous&&(previous.signature===undefined||previous.signature===signature)?previous:{};return value&&stamp(value)>=stamp(old)?value:old;}
async function remember(device,value){cache.set(key(device),value,MODEL_MS);if(redis.enabled())try{await redis.set('olt-resources:'+key(device),JSON.stringify(value),86400);}catch{}return value;}
async function restore(device,previous={}){
 const signature=key(device),local=cached(device,previous);if(cache.get(signature))return local;
 if(!redis.enabled())return local;if(restoring.has(signature))return restoring.get(signature);if(restoring.size>=64)return local;
 const task=(async()=>{let value=local;try{const raw=await redis.get('olt-resources:'+signature);if(raw&&Buffer.byteLength(raw)<=4096){const row=JSON.parse(raw);if(row.signature===signature&&Number.isFinite(row.nextReadAt)&&row.nextReadAt<=Date.now()+MODEL_MS+MAX_RETRY_MS&&[row.cpuPercent,row.ramPercent].every(x=>x==null||typeof x==='number'&&percent(x)!==null)&&stamp(row)>stamp(value))value=row;}}catch{}const current=cached(device,previous);if(stamp(current)>stamp(value))value=current;cache.set(signature,value,MODEL_MS);return value;})().finally(()=>restoring.delete(signature));restoring.set(signature,task);return task;
}
function resources(device,previous={},now=Date.now()){
 const value=cached(device,previous),checked=Date.parse(value.checkedAt||''),interval=Number(value.intervalMs)||INTERVAL_MS;
 return{cpuPercent:percent(value.cpuPercent),ramPercent:percent(value.ramPercent),checkedAt:Number.isFinite(checked)?value.checkedAt:'',intervalSeconds:Math.round(interval/1000),stale:Boolean(value.stale||!Number.isFinite(checked)||now-checked>Math.max(90000,interval*2))};
}
function parseCdata(outputs=[]){
 const output=command=>outputs.find(row=>row.command===command)?.stdout||'',device=output('show device'),modelRows=[...device.matchAll(/^\s*\d+\s+(FD[A-Z0-9-]+)\s+(?:Normal|Online|Working)\b/gim)];
 const type=modelRows.map(row=>model(row[1])).find(value=>/^FD\d{4}/.test(value))||'';
 const cpu=output('show cpu').match(/Load Average\s*\(5sec\)\s*:\s*([\d.]+)%/i)||output('show cpu').match(/Load Average\s*\(1min\)\s*:\s*([\d.]+)%/i);
 const ram=output('show memory').match(/Utilization\s*:\s*([\d.]+)%/i);
 return{model:type,family:'',modelSource:type?'cli-device':'',cpuPercent:percent(cpu?.[1]),ramPercent:percent(ram?.[1]),source:'cli'};
}
function parseZte(outputs=[]){
 const output=command=>outputs.find(row=>row.command===command)?.stdout||'',card=output('show card'),processor=output('show processor');
 if(!/Rack\s+Shelf\s+Slot\s+CfgType/.test(card)||! /Rack\s+Shelf\s+Slot\s+CPU\(5s\)\s+CPU\(1m\)/.test(processor))throw Error('Format resource ZTE belum dikenali');
 const controllers=card.split(/\r?\n/).map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+SMXA\w*\s+.*\bINSERVICE\s*$/)).filter(Boolean);
 if(controllers.length!==1)throw Error('Kartu pengendali aktif ZTE belum pasti');
 const target=controllers[0].slice(1,4).join('/'),rows=processor.split(/\r?\n/).map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s+\d+\s+(\d+(?:\.\d+)?)%\s*$/)).filter(row=>row&&row.slice(1,4).join('/')===target);
 if(rows.length!==1||percent(rows[0][4])===null||percent(rows[0][7])===null)throw Error('Resource kartu pengendali ZTE belum lengkap');
 return{model:'',family:'',modelSource:'',cpuPercent:percent(rows[0][4]),ramPercent:percent(rows[0][7]),source:'cli-control-board'};
}
function parseHioso(adapter,html){
 const body=adapter.extractJavascriptArrayBody(html,'sysInfo');if(body===null)throw new Error('System Info HIOSO belum lengkap');
 const values=adapter.parseJavascriptArrayValues(body);if(values.length<13)throw new Error('Format System Info HIOSO belum didukung');
 return{model:model(values[3]),family:'',modelSource:model(values[3])?'web-system':'',cpuPercent:percent(values[11]),ramPercent:percent(values[12]),source:'web'};
}
function parseHsgq(outputs=[]){
 const values=command=>outputs.filter(row=>row.command===command),cpu=values('show cpu-usage'),memory=values('show memory statistics');
 if(cpu.length!==1||memory.length!==1)throw Error('Resource HSGQ belum lengkap');
 const cpus=[...cpu[0].stdout.matchAll(/^\s*Get the CPU usage is\s+(\d+(?:\.\d+)?)%\s*$/gm)],rams=[...memory[0].stdout.matchAll(/^\s*Memory\s+(\d+)\s+kB\s+(\d+)\s+kB\s+(\d+(?:\.\d+)?)%\s*$/gm)];
 if(cpus.length!==1||rams.length!==1||percent(cpus[0][1])===null||percent(rams[0][3])===null||Number(rams[0][1])<=0||Number(rams[0][2])>Number(rams[0][1])||Math.abs(Number(rams[0][2])/Number(rams[0][1])*100-Number(rams[0][3]))>.1)throw Error('Format CPU/RAM HSGQ belum terverifikasi');
 return{model:'',family:'',modelSource:'',cpuPercent:percent(cpus[0][1]),ramPercent:percent(rams[0][3]),source:'cli-hsgq'};
}
async function read(data,device,previous={},options={}){
 const now=options.now??Date.now(),signature=key(device),old=cached(device,previous);
 if(old.nextReadAt>now)return old;
 if(process.env.MIGRATION_MODE==='1'&&!(device.vendor==='zte'&&options.allowZteDevRead===true))return old;
 if(pending.has(signature))return pending.get(signature);if(pending.size>=MAX_PENDING)return old;
 const task=(async()=>{const started=performance.now();try{
  const [,context,transport]=await vendors.loadLibrary();
  const value=await context.withContext(data,device,async()=>{
   if(device.vendor==='hioso'){
    const[factory]=await vendors.loadLibrary(),adapter=factory.createOltAdapter(vendors.legacyDevice(device)),response=await adapter.fetchWebPath('/system.asp');if(!response.ok)throw new Error('System Info belum tersedia');
    const result=parseHioso(adapter,await response.text());
    if(!result.model&&(!old.modelNextReadAt||old.modelNextReadAt<=now)){
     const menu=await adapter.fetchWebPath('/item.asp');if(menu.ok){const body=await menu.text(),families=[...body.matchAll(/(?:\bvar\s+)?\bproduct\s*=\s*["'](HA\d{4}[A-Z0-9-]*)["']\s*;/g)].map(row=>row[1]);if(families.length&&new Set(families).size===1)result.family=model(families[0]);}
    }
    return result;
   }
   if(device.vendor==='cdata'&&device.cliEnabled&&device.cliPasswordEnc){
    const commands=['enable',...(!old.modelNextReadAt||old.modelNextReadAt<=now?['show device']:[]),'show cpu','show memory'],result=await transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands,timeoutMs:5000});
    if(!result.success)throw new Error('Telemetri CLI belum tersedia');const reading=parseCdata(result.outputs);if(reading.cpuPercent===null||reading.ramPercent===null)throw Error('Resource CDATA belum lengkap');return reading;
   }
   if(device.vendor==='zte'&&device.cliEnabled&&device.cliPasswordEnc){
    const result=await transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:['enable','terminal length 0','show card','show processor'],timeoutMs:5000});
    if(!result.success)throw Error('Resource CLI ZTE belum tersedia');return parseZte(result.outputs);
   }
   if(device.vendor==='hsgq'&&device.cliEnabled&&device.cliPasswordEnc){
    const result=await transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:['enable','configure','show cpu-usage','show memory statistics'],timeoutMs:5000});
    if(!result.success)throw Error('Resource CLI HSGQ belum tersedia');return parseHsgq(result.outputs);
   }
   const snmp=await import('./olt-vendor-library/services/snmp.js'),olt=vendors.legacyDevice(device),models=await snmp.snmpWalk({olt,oid:'.1.3.6.1.2.1.47.1.1.1.1.13'}),values=[...models.values()].map(row=>model(String(row).replace(/^"|"$/g,''))).filter(Boolean);
   return{model:values.length===1?values[0]:'',family:'',modelSource:values.length===1?'snmp-entity':'',cpuPercent:null,ramPercent:null,source:'snmp'};
  },{...options,timeoutMs:5000});
  if(['cdata','hioso','zte','hsgq'].includes(device.vendor)&&(value.cpuPercent===null||value.ramPercent===null))throw Error('Resource belum lengkap');
  const elapsed=options.elapsedMs??performance.now()-started,fastStreak=elapsed<=750?(Number(old.fastStreak)||0)+1:0,intervalMs=!['cdata','hioso','zte','hsgq'].includes(device.vendor)?MODEL_MS:elapsed>=2000?SLOW_MS:fastStreak>=3?FAST_MS:INTERVAL_MS;
  const result={...value,model:value.model||old.model||'',family:value.family||old.family||'',modelSource:value.modelSource||old.modelSource||'',modelNextReadAt:old.modelNextReadAt>now?old.modelNextReadAt:now+MODEL_MS,signature,checkedAt:new Date(now).toISOString(),attemptedAt:now,intervalMs,nextReadAt:now+intervalMs,fastStreak:Math.min(3,fastStreak),failures:0,stale:false};
  return remember(device,result);
 }catch{const failures=Math.min(5,(Number(old.failures)||0)+1),intervalMs=Math.min(MAX_RETRY_MS,RETRY_MS*2**(failures-1));return remember(device,{...old,signature,attemptedAt:now,nextReadAt:now+intervalMs,intervalMs,failures,fastStreak:0,stale:true,cpuPercent:old.cpuPercent??null,ramPercent:old.ramPercent??null});}
 })().finally(()=>pending.delete(signature));pending.set(signature,task);return task;
}
async function pollDevices(data,devices,options={}){
 if(process.env.MIGRATION_MODE==='1'||preparing||!devices.some(row=>row.enabled))return{skipped:true};preparing=true;
 try{
  const [, ,transport]=await vendors.loadLibrary(),now=options.now??Date.now(),due=[];
  for(const device of devices.filter(row=>row.enabled).slice(0,32)){
   if(pending.has(key(device))||transport.isBusy(device.id)||require('./olt-terminal').isOpen(device.id)||require('./olt-cli').isBusy(device.id))continue;
   const previous=await restore(device,(await options.getPrevious?.(device))||{});if((previous.nextReadAt||0)<=now)due.push({device,previous});
  }
  due.sort((a,b)=>(a.previous.nextReadAt||0)-(b.previous.nextReadAt||0));
  return Promise.all(due.slice(0,Math.max(0,MAX_PENDING-pending.size)).map(({device,previous})=>read(data,device,previous,options).then(value=>({id:device.id,checkedAt:value.checkedAt||'',stale:!!value.stale}))));
 }finally{preparing=false;}
}
function label(device,telemetry,fallback=''){
 const brand=device.vendor==='cdata'?'CDATA':vendors.profile(device.vendor)?.label?.replace(/\s+(?:GPON.*|EPON.*)$/,'')||device.vendor;
 return telemetry?.model?`${brand} ${telemetry.model}`:telemetry?.family?`${brand} ${telemetry.family}`:fallback||brand;
}
module.exports={read,restore,cached,resources,pollDevices,isBusy:device=>pending.has(key(device)),percent,model,parseCdata,parseZte,parseHioso,parseHsgq,label,INTERVAL_MS,FAST_MS,SLOW_MS,MODEL_MS,RETRY_MS,MAX_RETRY_MS};
