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
  const context={data,device,controller:new AbortController(),deadline:Date.now()+Math.min(options.timeoutMs||16000,18000),requests:0,transports:options.transports||{}};
  const timer=setTimeout(()=>context.controller.abort(),context.deadline-Date.now());
  try{return await contexts.run(context,operation);}finally{clearTimeout(timer);context.controller.abort();}
}
export async function readOnlyFetch(value,options={}){
  const context=request(),url=new URL(value),host=url.hostname.replace(/^\[|\]$/g,''),method=String(options.method||'GET').toUpperCase();
  const login=method==='POST'&&((url.pathname==='/goform/SetLogin')||(url.pathname==='/userlogin'&&url.searchParams.get('form')==='login'));
  if(!['http:','https:'].includes(url.protocol)||host!==context.device.host||url.username||url.password||Number(url.port||(url.protocol==='https:'?443:80))!==(context.device.webPort||80))throw new Error('Vendor web target rejected');
  if(!login&&(method!=='GET'||/(?:delete|reboot|reset|restart|restore|cfgload|setonu|save|update|remove|\/goform\/)/i.test(url.pathname)))throw new Error('Vendor web write actions are locked');
  if(!login&&[...url.searchParams].some(([key,value])=>/^(?:action|operation|op|cmd|command|method)$/i.test(key)&&!/^(?:get|read|list|show|status|detail)$/i.test(value)))throw new Error('Vendor web query action rejected');
  const response=await(context.transports.fetch||fetch)(url,{...options,method,redirect:'manual',signal:context.controller.signal});
  if(Number(response.headers.get('content-length')||0)>524288)throw new Error('Vendor response too large');
  if(!response.body)return response;
  const reader=response.body.getReader(),parts=[];let bytes=0;
  try{while(true){remaining();const{done,value:chunk}=await reader.read();if(done)break;bytes+=chunk.length;if(bytes>524288)throw new Error('Vendor response too large');parts.push(chunk);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
  return new Response(Buffer.concat(parts),{status:response.status,statusText:response.statusText,headers:response.headers});
}
