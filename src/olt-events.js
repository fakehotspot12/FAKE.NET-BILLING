'use strict';

const fs=require('node:fs/promises'),net=require('node:net'),crypto=require('node:crypto'),dgram=require('node:dgram');
const normalize=address=>String(address||'').replace(/^::ffff:/,'');
const equal=(a,b)=>{const left=Buffer.from(String(a||'')),right=Buffer.from(String(b||''));return left.length===right.length&&crypto.timingSafeEqual(left,right);};
const fail=()=>{throw Error('Konfigurasi event OLT tidak valid');};
function config(value){
 if(!value||value.enabled===false)return null;
 const privateBind=/^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
 if(typeof value!=='object'||Array.isArray(value)||net.isIP(value.bindAddress)!==4||!privateBind.test(value.bindAddress)||!Number.isInteger(value.port)||value.port<1024||value.port>65535||!Array.isArray(value.sources)||!value.sources.length||value.sources.length>32)fail();
 const sources=value.sources.map(row=>{
  if(!row||typeof row.oltId!=='string'||!row.oltId||row.oltId.length>100||typeof row.host!=='string'||!row.host||row.host.length>253||net.isIP(normalize(row.sourceAddress))!==4||/^(?:0\.|22[4-9]\.|23\d\.|24\d\.|25[0-5]\.)/.test(normalize(row.sourceAddress))||typeof row.community!=='string'||row.community.length<16||row.community.length>128||/[\x00-\x20\x7f]/.test(row.community))fail();
  return{oltId:row.oltId,host:row.host,sourceAddress:normalize(row.sourceAddress),community:row.community};
 });
 if(new Set(sources.map(row=>row.sourceAddress+':'+row.community)).size!==sources.length)fail();
 const fallbackMs=value.fallbackMs??20000;if(!Number.isInteger(fallbackMs)||fallbackMs<5000||fallbackMs>60000)fail();
 return{bindAddress:value.bindAddress,port:value.port,sources,fallbackMs};
}
function eligible(data,setting){
 const registration=require('./olt-zte-registration'),pnp=require('./olt-zte-pnp');
 return setting.sources.filter(source=>{const device=(data.oltDevices||[]).find(row=>row.id===source.oltId&&row.enabled&&row.vendor==='zte'&&row.host===source.host);return device&&Object.values(registration.settings(device)).some(row=>row.enabled&&(process.env.MIGRATION_MODE!=='1'||row.devAllowed)&&(data.users||[]).some(actor=>actor.id===row.actorId&&pnp.canManage(data,device,actor)));});
}
function trapOid(pdu){
 if(!pdu||![166,167].includes(pdu.type)||!Array.isArray(pdu.varbinds)||pdu.varbinds.length>32)return'';
 const rows=pdu.varbinds.filter(row=>row.oid==='1.3.6.1.6.3.1.1.4.1.0');if(rows.length!==1||rows[0].type!==6||typeof rows[0].value!=='string')return'';
 const oid=rows[0].value;if(oid.length>256)return'';return /^1\.3\.6\.1\.4\.1\.3902\.(?:\d+\.)*\d+$/.test(oid)||/^1\.3\.6\.1\.6\.3\.1\.1\.5\.[1234]$/.test(oid)?oid:'';
}
function create({load,wake,onError=()=>{},snmpFactory,datagrams=dgram,now=Date.now,file=process.env.OLT_EVENTS_CONFIG_FILE||'/etc/fakenet-billing-olt-events.json',readFile=async name=>{
 const stat=await fs.lstat(name);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768||(stat.mode&0o077)!==0)fail();return JSON.parse(await fs.readFile(name,'utf8'));
}}){
 let receiver=null,socket=null,refreshTimer=null,fallbackTimer=null,stopped=true,setting=null,sources=[],signature='',lastError=0,refreshing=false;
 const rawRates=new Map(),wakeRates=new Map(),seen=new Map(),stats={listening:false,accepted:0,rejected:0,lastEventAt:'',lastWakeAt:'',bindFailed:false};let globalRate={at:0,count:0};
 const report=()=>{if(now()-lastError>=60000){lastError=now();onError(Error('Event OLT belum tersedia; pemindaian cadangan tetap berjalan'));}};
 function admit(buffer,info){
  if(stopped||!Buffer.isBuffer(buffer)||buffer.length<20||buffer.length>8192||!sources.some(row=>row.sourceAddress===normalize(info.address)))return false;
  if(now()-globalRate.at>=1000)globalRate={at:now(),count:0};if(++globalRate.count>40)return false;
  const key=normalize(info.address),old=rawRates.get(key),row=old&&now()-old.at<1000?old:{at:now(),count:0};row.count++;rawRates.set(key,row);return row.count<=10;
 }
 function receive(error,notification){
  if(stopped)return;if(error){stats.rejected++;return;}
  const source=sources.find(row=>row.sourceAddress===normalize(notification?.rinfo?.address)&&equal(row.community,notification?.pdu?.community));
  if(!source||!trapOid(notification?.pdu)){stats.rejected++;return;}
  stats.accepted++;stats.lastEventAt=new Date(now()).toISOString();const state=seen.get(source.oltId)||{accepted:0,lastEventAt:'',lastWakeAt:''};state.accepted++;state.lastEventAt=stats.lastEventAt;seen.set(source.oltId,state);while(seen.size>32)seen.delete(seen.keys().next().value);
  const old=wakeRates.get(source.oltId),row=old&&now()-old.at<60000?old:{at:now(),count:0,last:-Infinity};
  if(now()-row.last<2000||row.count>=6)return;row.count++;row.last=now();wakeRates.set(source.oltId,row);
  if(wake(source.oltId)){stats.lastWakeAt=new Date(now()).toISOString();state.lastWakeAt=stats.lastWakeAt;}
 }
 function closeReceiver(){if(receiver){try{receiver.close();}catch{try{socket?.close();}catch{}}}receiver=null;socket=null;stats.listening=false;signature='';}
 async function refresh(){
  if(stopped||refreshing)return;clearTimeout(refreshTimer);refreshing=true;
  try{
   const next=config(await readFile(file)),data=next?await load():null;if(stopped)return;
   const active=next?eligible(data,next):[],nextSignature=active.length?JSON.stringify([next.bindAddress,next.port,active]):'';
   setting=next;sources=active;if(signature!==nextSignature){rawRates.clear();wakeRates.clear();}
   if(signature!==nextSignature||stats.bindFailed){closeReceiver();stats.bindFailed=false;if(nextSignature){
    const snmp=snmpFactory||require('net-snmp');
    const filtered={createSocket(type){socket=datagrams.createSocket(type);const on=socket.on.bind(socket);socket.on=(event,listener)=>event==='message'?on(event,(buffer,info)=>{if(admit(buffer,info))listener(buffer,info);else stats.rejected++;}):on(event,listener);socket.on('listening',()=>{stats.listening=true;socket.unref?.();});socket.on('error',()=>{stats.bindFailed=true;stats.listening=false;report();});return socket;}};
    receiver=snmp.createReceiver({address:next.bindAddress,port:next.port,transport:'udp4',disableAuthorization:false,includeAuthentication:true,dgramModule:filtered},receive);
    for(const community of new Set(active.map(row=>row.community)))receiver.getAuthorizer().addCommunity(community);signature=nextSignature;
   }}
  }catch(error){if(error.code==='ENOENT'){sources=[];setting=null;closeReceiver();}else{sources=[];setting=null;closeReceiver();report();}}
  finally{refreshing=false;if(!stopped){refreshTimer=setTimeout(()=>void refresh(),30000);refreshTimer.unref?.();if(!fallbackTimer&&setting&&sources.length){fallbackTimer=setTimeout(fallback,setting.fallbackMs);fallbackTimer.unref?.();}else if(!sources.length){clearTimeout(fallbackTimer);fallbackTimer=null;}}}
 }
 function fallback(){fallbackTimer=null;if(stopped||!setting||!sources.length)return;for(const id of new Set(sources.map(row=>row.oltId)))wake(id);fallbackTimer=setTimeout(fallback,setting.fallbackMs);fallbackTimer.unref?.();}
 async function start(){if(!stopped)return;stopped=false;await refresh();}
 function stop(){stopped=true;clearTimeout(refreshTimer);clearTimeout(fallbackTimer);sources=[];rawRates.clear();wakeRates.clear();closeReceiver();}
 return{start,stop,refresh,status:id=>id?{listening:stats.listening,configured:sources.some(row=>row.oltId===id),bindFailed:stats.bindFailed,...(seen.get(id)||{accepted:0,lastEventAt:'',lastWakeAt:''})}:{...stats,sources:sources.length},receive,admit};
}
module.exports={config,eligible,trapOid,create};
