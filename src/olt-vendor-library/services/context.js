import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),secrets=require('../../secure-secrets');
const contexts=new AsyncLocalStorage();
export function current(){const value=contexts.getStore();if(!value)throw new Error('Vendor read context required');return value;}
export function remaining(){const context=current(),time=context.deadline-Date.now();if(time<=0||context.controller.signal.aborted)throw new Error('Vendor read budget exhausted');return time;}
export function request(){const context=current();remaining();if(++context.requests>24)throw new Error('Vendor request limit reached');return context;}
export function decryptSecret(value){return value?secrets.decryptSecret(current().data,value):'';}
export async function withContext(data,device,operation,options={}){
  if(process.env.MIGRATION_MODE==='1')throw new Error('Mode dev terisolasi: pembacaan OLT asli dinonaktifkan');
  const context={data,device,controller:new AbortController(),deadline:Date.now()+Math.min(options.timeoutMs||16000,18000),requests:0,transports:options.transports||{},hiosoActionAllowed:options.hiosoActionAllowed===true,hiosoGrant:null};
  const timer=setTimeout(()=>context.controller.abort(),context.deadline-Date.now());
  try{return await contexts.run(context,operation);}finally{clearTimeout(timer);context.controller.abort();}
}
export function authorizeHiosoOperation({address,operation,name=''}){
  const context=current();
  if(context.device.vendor!=='hioso'||!context.hiosoActionAllowed||context.hiosoGrant||!/^0\/(?:\d+\/)?[1-9]\d*:[1-9]\d*$/.test(address)||!['nonOp','rebootOp','delete'].includes(operation))throw new Error('HIOSO action authorization rejected');
  if(operation!=='delete'&&(typeof name!=='string'||!name||name.length>30||/[\x00-\x1f]/.test(name)))throw new Error('HIOSO operation name rejected');
  context.hiosoGrant={address,operation,name,used:false};
}
export function authorizeHiosoSave(mode='web'){
  const context=current();
  if(context.device.vendor!=='hioso'||!context.hiosoActionAllowed||context.hiosoGrant||!['cli','web'].includes(mode))throw new Error('HIOSO save authorization rejected');
  context.hiosoGrant={operation:mode==='cli'?'saveConfigCli':'saveConfig',used:false};
}
export function authorizeHiosoCliOnu({address,serialNumber,operation}){
  const context=current(),match=String(address||'').match(/^0\/([1-9]|1[0-6]):([1-9]\d?|1[01]\d|12[0-8])$/);
  if(context.device.vendor!=='hioso'||!context.hiosoActionAllowed||context.hiosoGrant||!match||!/^[A-F0-9]{12}$/.test(serialNumber)||!['reboot','delete'].includes(operation))throw new Error('HIOSO CLI ONU authorization rejected');
  context.hiosoGrant={operation:'onuCli',action:operation,address,serialNumber,pon:Number(match[1]),onuId:Number(match[2]),used:false};
}
export async function readOnlyFetch(value,options={}){
  const context=request(),url=new URL(value),host=url.hostname.replace(/^\[|\]$/g,''),method=String(options.method||'GET').toUpperCase();
  const login=method==='POST'&&((url.pathname==='/goform/SetLogin')||(url.pathname==='/userlogin'&&url.searchParams.get('form')==='login'));
  const hiosoDeleteView=context.device.vendor==='hioso'&&method==='GET'&&url.pathname==='/onuDeleteOnuList.asp'&&url.searchParams.size===1&&/^0\/(?:\d+\/)?[1-9]\d*$/.test(url.searchParams.get('oltponno')||'');
  const hiosoSaveView=context.device.vendor==='hioso'&&method==='GET'&&url.pathname==='/system_save.asp'&&!url.search;
  let hiosoWrite=false;
  if(context.device.vendor==='hioso'&&context.hiosoActionAllowed&&method==='GET'&&context.hiosoGrant?.operation==='saveConfig')hiosoWrite=!context.hiosoGrant.used&&url.pathname==='/goform/saveConfiguration'&&url.searchParams.size===1&&url.searchParams.getAll('savecfg').length===1&&url.searchParams.get('savecfg')===''&&options.body===undefined;
  if(context.device.vendor==='hioso'&&context.hiosoActionAllowed&&method==='POST'&&context.hiosoGrant){
    const grant=context.hiosoGrant,body=new URLSearchParams(options.body),deleting=grant.operation==='delete',keys=deleting?['onuId']:['onuId','onuName','onuOperation'];
    hiosoWrite=!grant.used&&!url.search&&url.pathname===(deleting?'/goform/deleteOnu':'/goform/setOnu')&&[...body.keys()].length===keys.length&&keys.every(key=>body.getAll(key).length===1)&&body.get('onuId')===grant.address&&(deleting||body.get('onuName')===grant.name&&body.get('onuOperation')===grant.operation);
  }
  if(!['http:','https:'].includes(url.protocol)||host!==context.device.host||url.username||url.password||Number(url.port||(url.protocol==='https:'?443:80))!==(context.device.webPort||80))throw new Error('Vendor web target rejected');
  if(!login&&!hiosoWrite&&!hiosoDeleteView&&!hiosoSaveView&&(method!=='GET'||/(?:delete|reboot|reset|restart|restore|cfgload|setonu|save|update|remove|\/goform\/)/i.test(url.pathname)))throw new Error('Vendor web write actions are locked');
  if(!login&&[...url.searchParams].some(([key,value])=>/^(?:action|operation|op|cmd|command|method)$/i.test(key)&&!/^(?:get|read|list|show|status|detail)$/i.test(value)))throw new Error('Vendor web query action rejected');
  if(hiosoWrite)context.hiosoGrant.used=true;
  const response=await(context.transports.fetch||fetch)(url,{...options,method,redirect:'manual',signal:context.controller.signal});
  if(Number(response.headers.get('content-length')||0)>524288)throw new Error('Vendor response too large');
  if(!response.body)return response;
  const reader=response.body.getReader(),parts=[];let bytes=0;
  try{while(true){remaining();const{done,value:chunk}=await reader.read();if(done)break;bytes+=chunk.length;if(bytes>524288)throw new Error('Vendor response too large');parts.push(chunk);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
  const body=Buffer.concat(parts);
  if(hiosoWrite&&/<title>\s*(?:error|denied)\b|>[^<>]{0,120}\b(?:operation failed|invalid operation|access denied)\b/i.test(body.toString('utf8')))throw new Error('HIOSO rejected operation');
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}
