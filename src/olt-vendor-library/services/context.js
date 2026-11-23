import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),secrets=require('../../secure-secrets');
const contexts=new AsyncLocalStorage();
export function current(){const value=contexts.getStore();if(!value)throw new Error('Vendor read context required');return value;}
export function remaining(){const context=current(),time=context.deadline-Date.now();if(time<=0||context.controller.signal.aborted)throw new Error('Vendor read budget exhausted');return time;}
export function request(){const context=current();remaining();if(++context.requests>24)throw new Error('Vendor request limit reached');return context;}
export function decryptSecret(value){return value?secrets.decryptSecret(current().data,value):'';}
export async function withContext(data,device,operation,options={}){
  if(process.env.MIGRATION_MODE==='1'&&!(device.vendor==='zte'&&options.allowZteDevRead===true)&&!(options.rebootProbe===true&&options.allowDevRebootProbe===true))throw new Error('Mode dev terisolasi: pembacaan OLT asli dinonaktifkan');
  const context={data,device,controller:new AbortController(),deadline:Date.now()+Math.min(options.timeoutMs||16000,18000),requests:0,transports:options.transports||{},hiosoActionAllowed:options.hiosoActionAllowed===true,hiosoGrant:null,rebootProbe:options.rebootProbe===true,oltRebootAllowed:options.oltRebootAllowed===true,oltRebootGrant:null,ponActionAllowed:options.ponActionAllowed===true,explicitDevPonAction:options.explicitDevPonAction===true,ponGrant:null};
  context.pnpActionAllowed=options.pnpActionAllowed===true;context.explicitDevPnpAction=options.explicitDevPnpAction===true;context.pnpGrant=null;
  context.bandwidthActionAllowed=options.bandwidthActionAllowed===true;context.explicitDevBandwidthAction=options.explicitDevBandwidthAction===true;context.bandwidthGrant=null;
  context.registrationActionAllowed=options.registrationActionAllowed===true;context.explicitDevRegistrationAction=options.explicitDevRegistrationAction===true;context.registrationGrant=null;
  context.bridgeActionAllowed=options.bridgeActionAllowed===true;context.explicitDevBridgeAction=options.explicitDevBridgeAction===true;context.bridgeGrant=null;
  context.hsgqActionAllowed=options.hsgqActionAllowed===true;context.hsgqGrant=null;
  context.cliQueue=device.vendor==='hsgq'||options.cliQueue===true&&device.vendor==='zte';
  const timer=setTimeout(()=>context.controller.abort(),context.deadline-Date.now());
  try{return await contexts.run(context,operation);}finally{clearTimeout(timer);context.controller.abort();}
}
export function authorizeOltReboot(commands){
  const context=current(),prefix=commands?.slice(0,-1),command=commands?.at(-1);
  if(!context.oltRebootAllowed||process.env.MIGRATION_MODE==='1'||context.oltRebootGrant||!Array.isArray(commands)||!['reboot','reload','system reboot'].includes(command)||!['["enable"]','["enable","config"]','["enable","configure terminal"]','["enable","system-view"]',...(context.device.vendor==='hsgq'?['["enable","configure"]']:[])].includes(JSON.stringify(prefix)))throw new Error('OLT reboot authorization rejected');
  context.oltRebootGrant={commands:[...commands],used:false,submitted:false,acknowledged:false};
}
export function authorizePonOperation({ponKey,enabled,proof}){
  const context=current(),pon=require('../../olt-pon');
  if(!pon.supports(context.device)||!context.ponActionAllowed||context.ponGrant||typeof enabled!=='boolean'||!/^[0-9a-f]{64}$/.test(proof)||process.env.MIGRATION_MODE==='1'&&!(context.device.vendor==='zte'&&context.explicitDevPonAction))throw new Error('PON operation authorization rejected');
  pon.ponKey(ponKey);context.ponGrant={vendor:context.device.vendor,ponKey,enabled,proof,commands:pon.writeCommands(ponKey,enabled,context.device.vendor),used:false,submitted:false,verified:false};
}
export function authorizePnpOperation(state,value){
  const context=current(),pnp=require('../../olt-zte-pnp');
  if(context.device.vendor!=='zte'||!context.pnpActionAllowed||context.pnpGrant||process.env.MIGRATION_MODE==='1'&&!context.explicitDevPnpAction)throw new Error('ONU-PnP authorization rejected');
  pnp.desired(state,value);context.pnpGrant={state,value,commands:pnp.writeCommands(state,value),mutationStart:pnp.readCommands(state.ports.map(row=>row.ponKey)).length+2,used:false,submitted:false,verified:false};
}
export function authorizeBandwidthOperation(state,value){
  const context=current();
  if(context.device.vendor!=='zte'||!context.bandwidthActionAllowed||context.bandwidthGrant||process.env.MIGRATION_MODE==='1'&&!context.explicitDevBandwidthAction)throw new Error('Bandwidth authorization rejected');
  context.bandwidthGrant=require('../../olt-zte-bandwidth').authorize(state,value);
}
export function authorizeRegistrationOperation(spec){
  const context=current();
  if(context.device.vendor!=='zte'||!context.registrationActionAllowed||context.registrationGrant||spec.device.id!==context.device.id||process.env.MIGRATION_MODE==='1'&&!context.explicitDevRegistrationAction)throw new Error('ONU registration authorization rejected');
  context.registrationGrant=require('../../olt-zte-registration').authorize(spec);
}
export function authorizeBridgeOperation(state,value){
  const context=current();
  if(context.device.vendor!=='zte'||!context.bridgeActionAllowed||context.bridgeGrant||process.env.MIGRATION_MODE==='1'&&!context.explicitDevBridgeAction)throw new Error('ONU bridge authorization rejected');
  context.bridgeGrant=require('../../olt-zte-bridge').authorize(state,value);
}
export function authorizeHsgqOperation(spec){
 const context=current();if(context.device.vendor!=='hsgq'||!context.hsgqActionAllowed||context.hsgqGrant||process.env.MIGRATION_MODE==='1')throw Error('HSGQ action authorization rejected');context.hsgqGrant=require('../../olt-hsgq').authorize(spec);
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
  const requestController=context.device.vendor==='hsgq'?new AbortController():null;
  const signal=requestController?AbortSignal.any([context.controller.signal,requestController.signal,...(options.signal?[options.signal]:[])]):context.controller.signal;
  const headers=context.device.vendor==='hsgq'?new Headers(options.headers):options.headers;if(context.device.vendor==='hsgq'&&method==='GET'&&options.body===undefined)headers.delete('content-type');
  const response=await(context.transports.fetch||fetch)(url,{...options,headers,method,redirect:'manual',signal});
  if(Number(response.headers.get('content-length')||0)>524288)throw new Error('Vendor response too large');
  if(!response.body)return response;
  const reader=response.body.getReader(),parts=[];let bytes=0;
  const hsgqJson=context.device.vendor==='hsgq'&&!response.headers.has('content-length')&&!response.headers.has('transfer-encoding')&&['/userlogin','/gponmgmt','/gponont_mgmt','/ontinfo_table','/onumgmt'].includes(url.pathname);
  try{while(true){remaining();const{done,value:chunk}=await reader.read();if(done)break;bytes+=chunk.length;if(bytes>524288)throw new Error('Vendor response too large');parts.push(chunk);
    // Some HSGQ firmware leaves unframed JSON responses open on keep-alive.
    if(hsgqJson&&/[}\]]\s*$/.test(Buffer.from(chunk).toString('utf8'))){let complete=false;try{const body=JSON.parse(Buffer.concat(parts).toString('utf8'));complete=body!==null&&typeof body==='object'&&!Array.isArray(body)&&Object.hasOwn(body,'code');}catch{}if(complete){void reader.cancel().catch(()=>{});requestController.abort();break;}}
  }}catch(error){await reader.cancel().catch(()=>{});throw error;}
  const body=Buffer.concat(parts);
  if(hiosoWrite&&/<title>\s*(?:error|denied)\b|>[^<>]{0,120}\b(?:operation failed|invalid operation|access denied)\b/i.test(body.toString('utf8')))throw new Error('HIOSO rejected operation');
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}
