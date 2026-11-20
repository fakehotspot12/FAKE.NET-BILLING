'use strict';
const crypto=require('node:crypto'),vendors=require('./olt-vendors');
const INTERVAL_MS=300000,MODEL_MS=86400000,RETRY_MS=900000;
function percent(value){if(value===null||value===undefined||value==='')return null;const match=String(value).match(/^\s*(\d+(?:\.\d+)?)\s*%?\s*$/);const number=match?Number(match[1]):NaN;return Number.isFinite(number)&&number<=100?number:null;}
function model(value){const text=String(value||'').trim();return text.length<=80&&/^[A-Za-z0-9][A-Za-z0-9 ._()+/-]*$/.test(text)&&! /^(?:olt|epon|gpon|unknown|n\/a|none)$/i.test(text)?text:'';}
function key(device){return crypto.createHash('sha256').update(JSON.stringify([device.host,device.vendor,device.cliProtocol,device.cliPort,device.webPort,device.cliUsername,device.cliPasswordEnc,device.communityEnc])).digest('hex').slice(0,24);}
function parseCdata(outputs=[]){
 const output=command=>outputs.find(row=>row.command===command)?.stdout||'',device=output('show device'),modelRows=[...device.matchAll(/^\s*\d+\s+(FD[A-Z0-9-]+)\s+(?:Normal|Online|Working)\b/gim)];
 const type=modelRows.map(row=>model(row[1])).find(value=>/^FD\d{4}/.test(value))||'';
 const cpu=output('show cpu').match(/Load Average\s*\(1min\)\s*:\s*([\d.]+)%/i)||output('show cpu').match(/Load Average\s*\(5sec\)\s*:\s*([\d.]+)%/i);
 const ram=output('show memory').match(/Utilization\s*:\s*([\d.]+)%/i);
 return{model:type,family:'',modelSource:type?'cli-device':'',cpuPercent:percent(cpu?.[1]),ramPercent:percent(ram?.[1]),source:'cli'};
}
function parseZte(outputs=[]){
 const output=command=>outputs.find(row=>row.command===command)?.stdout||'',card=output('show card'),processor=output('show processor');
 if(!/Rack\s+Shelf\s+Slot\s+CfgType/.test(card)||! /Rack\s+Shelf\s+Slot\s+CPU\(5s\)\s+CPU\(1m\)/.test(processor))throw Error('Format resource ZTE belum dikenali');
 const controllers=card.split(/\r?\n/).map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+SMXA\w*\s+.*\bINSERVICE\s*$/)).filter(Boolean);
 if(controllers.length!==1)throw Error('Kartu pengendali aktif ZTE belum pasti');
 const target=controllers[0].slice(1,4).join('/'),rows=processor.split(/\r?\n/).map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s+\d+\s+(\d+(?:\.\d+)?)%\s*$/)).filter(row=>row&&row.slice(1,4).join('/')===target);
 if(rows.length!==1||percent(rows[0][5])===null||percent(rows[0][7])===null)throw Error('Resource kartu pengendali ZTE belum lengkap');
 return{model:'',family:'',modelSource:'',cpuPercent:percent(rows[0][5]),ramPercent:percent(rows[0][7]),source:'cli-control-board'};
}
function parseHioso(adapter,html){
 const body=adapter.extractJavascriptArrayBody(html,'sysInfo');if(body===null)throw new Error('System Info HIOSO belum lengkap');
 const values=adapter.parseJavascriptArrayValues(body);if(values.length<13)throw new Error('Format System Info HIOSO belum didukung');
 return{model:model(values[3]),family:'',modelSource:model(values[3])?'web-system':'',cpuPercent:percent(values[11]),ramPercent:percent(values[12]),source:'web'};
}
async function read(data,device,previous={},options={}){
 const now=options.now??Date.now(),signature=key(device),old=previous?.signature===signature?previous:{};
 if(old.nextReadAt>now)return old;
 if(process.env.MIGRATION_MODE==='1'&&!(device.vendor==='zte'&&options.allowZteDevRead===true))return old;
 const [,context,transport]=await vendors.loadLibrary();
 try{
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
    if(!result.success)throw new Error('Telemetri CLI belum tersedia');return parseCdata(result.outputs);
   }
   if(device.vendor==='zte'&&device.cliEnabled&&device.cliPasswordEnc){
    const result=await transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:['enable','terminal length 0','show card','show processor'],timeoutMs:5000});
    if(!result.success)throw Error('Resource CLI ZTE belum tersedia');return parseZte(result.outputs);
   }
   const snmp=await import('./olt-vendor-library/services/snmp.js'),olt=vendors.legacyDevice(device),models=await snmp.snmpWalk({olt,oid:'.1.3.6.1.2.1.47.1.1.1.1.13'}),values=[...models.values()].map(row=>model(String(row).replace(/^"|"$/g,''))).filter(Boolean);
   return{model:values.length===1?values[0]:'',family:'',modelSource:values.length===1?'snmp-entity':'',cpuPercent:null,ramPercent:null,source:'snmp'};
  },{...options,timeoutMs:5000});
  const result={...value,model:value.model||old.model||'',family:value.family||old.family||'',modelSource:value.modelSource||old.modelSource||'',modelNextReadAt:old.modelNextReadAt>now?old.modelNextReadAt:now+MODEL_MS,signature,checkedAt:new Date(now).toISOString(),nextReadAt:now+(['cdata','hioso','zte'].includes(device.vendor)?INTERVAL_MS:MODEL_MS),stale:false};
  return result;
 }catch{return{...old,signature,nextReadAt:now+RETRY_MS,stale:true,cpuPercent:old.cpuPercent??null,ramPercent:old.ramPercent??null};}
}
function label(device,telemetry,fallback=''){
 const brand=device.vendor==='cdata'?'CDATA':vendors.profile(device.vendor)?.label?.replace(/\s+(?:GPON.*|EPON.*)$/,'')||device.vendor;
 return telemetry?.model?`${brand} ${telemetry.model}`:telemetry?.family?`${brand} ${telemetry.family}`:fallback||brand;
}
module.exports={read,percent,model,parseCdata,parseZte,parseHioso,label,INTERVAL_MS,MODEL_MS,RETRY_MS};
