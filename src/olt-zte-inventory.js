'use strict';

const MAX_ONUS=8192,MAX_PONS=128,READ_BUDGET_MS=45000;
const METADATA_MS=1800000,RX_MS=900000;
const liveCache=new Map(),livePending=new Map(),liveAttempts=new Map();
const META_OIDS={serial:'.1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.18',name:'.1.3.6.1.4.1.3902.1082.500.10.2.3.3.1.2',distance:'.1.3.6.1.4.1.3902.1082.500.10.2.3.10.1.2'};
const tidy=value=>String(value||'').replace(/--\s*More\s*--\s*/gi,'').replace(/\r/g,'');
function position(value){const m=String(value||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,2}):([1-9]\d{0,3})$/);if(!m)return null;const[frame,slot,pon,onuId]=m.slice(1).map(Number);return frame<=31&&slot<=31&&pon>=1&&pon<=32&&onuId<=1024?{frame,slot,pon,onuId,ponKey:`${frame}/${slot}/${pon}`,id:`${frame}/${slot}/${pon}:${onuId}`}:null;}
function output(result,command){if(!result?.success)throw Error('Inventory CLI ZTE belum terbaca lengkap');const matches=(result.outputs||[]).filter(row=>row.command===command);if(matches.length!==1)throw Error('Tabel ZTE tidak lengkap');return tidy(matches[0].stdout);}
function states(value){
 const text=tidy(value);if(!/OnuIndex\s+Admin State\s+OMCC State\s+Phase State\s+Channel/.test(text))throw Error('Format status ONU ZTE belum dikenali');
 const rows=new Map();for(const line of text.split('\n')){const match=line.trim().match(/^(\d+\/\d+\/\d+:\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/);if(!match){if(/^\s*\d+\/\d+\/\d+:/.test(line))throw Error('Baris status ONU terpotong');continue;}const p=position(match[1]);if(!p||rows.has(p.id)||rows.size>=MAX_ONUS)throw Error('Posisi ONU ZTE tidak valid atau ganda');
  const phase=match[4].toLowerCase().replace(/[-_]/g,''),admin=match[2].toLowerCase()==='enable',online=phase==='working'&&admin&&match[3].toLowerCase()==='enable',power=['dyinggasp','poweroff','pwrdown'].includes(phase),los=['los','losi','losf'].includes(phase),offline=power||los||['offline','down','disabled'].includes(phase);
  rows.set(p.id,{...p,status:online?'online':offline?'offline':'unknown',condition:online?'online':offline?(admin&&power?'dying-gasp':admin&&los?'los':'other'):'unknown',downCause:offline&&admin&&(power||los)?match[4]:'',causeKnown:offline&&admin&&(power||los)});
 }
 const total=text.match(/ONU Number:\s*(\d+)\s*\/\s*(\d+)/i);if(!total||Number(total[2])!==rows.size||Number(total[1])!==[...rows.values()].filter(row=>row.status==='online').length)throw Error('Jumlah ONU ZTE tidak cocok dengan tabel; pembacaan ditahan');return rows;
}
function base(value,pon){
 const text=tidy(value);if(!/OnuIndex\s+Type\s+Mode\s+AuthInfo\s+State/.test(text))throw Error('Format identitas ONU ZTE belum dikenali');
 const rows=new Map();for(const line of text.split('\n')){if(!/^\s*gpon-onu_/.test(line))continue;const match=line.trim().match(/^gpon-onu_(\d+\/\d+\/\d+:\d+)\s+(\S+)\s+(\S+)\s+(.+?)\s+(ready|configuring|notready)\s*$/i),p=match&&position(match[1]),sn=match?.[4].match(/(?:^|\s)SN:([A-Za-z0-9]{12})(?=\s|$)/)?.[1]?.toUpperCase();
  if(!p||p.ponKey!==pon||rows.has(p.id)||!sn||rows.size>=MAX_ONUS)throw Error('Identitas ONU belum lengkap atau berpindah PON');rows.set(p.id,{...p,serialNumber:sn,model:match[2].slice(0,80)});
 }return rows;
}
function cards(value){
 const text=tidy(value),lines=text.split('\n'),header=lines.find(line=>/Rack\s+Shelf\s+Slot\s+CfgType\s+RealType\s+Port/.test(line));if(!header)throw Error('Daftar kartu OLT ZTE belum dikenali');
 const columns=[...header.matchAll(/\S+/g)].map(match=>({name:match[0],start:match.index})),ports=new Map();
 for(const line of lines){if(!/^\s*\d+\s+\d+\s+\d+\s+/.test(line))continue;const row=Object.fromEntries(columns.map((column,index)=>[column.name,line.slice(column.start,columns[index+1]?.start).trim()]));if(!/^(?:GTG|FTG)[A-Z0-9]*$/.test(row.CfgType)||row.RealType&&!/^(?:GTG|FTG)[A-Z0-9]*$/.test(row.RealType))continue;
  const frame=Number(row.Shelf),slot=Number(row.Slot),count=Number(row.Port);if(![frame,slot,count].every(Number.isSafeInteger)||frame<0||frame>31||slot<0||slot>31||count<1||count>32)throw Error('Jumlah port kartu GPON belum terverifikasi');
  for(let pon=1;pon<=count;pon++){const ponKey=`${frame}/${slot}/${pon}`;if(ports.has(ponKey)||ports.size>=MAX_PONS)throw Error('Daftar PON ZTE ambigu atau melebihi batas');ports.set(ponKey,{id:'zte:'+ponKey,name:'gpon-olt_'+ponKey,ponKey,kind:'pon',status:row.Status==='INSERVICE'?'unknown':'offline'});}
 }if(!ports.size)throw Error('Kartu GPON ZTE belum terverifikasi');return [...ports.values()];
}
function join(statuses,identities,ports){
 if(statuses.size!==identities.size)throw Error('Jumlah status dan identitas ONU berubah; baca ulang');const knownPorts=new Set(ports.map(row=>row.ponKey)),counts=new Map();for(const row of identities.values())counts.set(row.serialNumber,(counts.get(row.serialNumber)||0)+1);
 const rows=[];for(const[id,state]of statuses){const identity=identities.get(id);if(!identity||identity.ponKey!==state.ponKey||!knownPorts.has(state.ponKey))throw Error('Posisi atau identitas ONU tidak cocok dengan kartu OLT');const ambiguous=counts.get(identity.serialNumber)!==1;
  rows.push({...state,serialNumber:identity.serialNumber,identifierKind:'serial',model:identity.model,modelSource:'zte-configured-type',name:'',rxPower:null,txPower:null,distance:null,identityAmbiguous:ambiguous,causeKnown:ambiguous?false:state.causeKnown,source:'zte-cli-bulk'});
 }
 return{available:true,rows,ports:ports.map(port=>({...port,status:rows.some(row=>row.ponKey===port.ponKey&&row.status==='online')?'online':port.status})),source:'zte-cli-bulk'};
}
async function readStatus(data,device,key,options={}){
 require('./olt-pon').ponKey(key);
 if(device.vendor!=='zte'||!device.enabled||!device.cliEnabled)throw Error('Status langsung memerlukan OLT ZTE dan CLI aktif');
 const cacheKey=require('./olt-zte-pnp').signature(device)+':'+key,old=liveCache.get(cacheKey);
 if(old&&Date.now()-Date.parse(old.checkedAt)<5000)return structuredClone(old);
 if(livePending.has(cacheKey))return structuredClone(await livePending.get(cacheKey));
 const connection=require('./olt-zte-pnp').signature(device);
 if(Date.now()-(liveAttempts.get(connection)||0)<5000)return{...(old||{}),stale:true,message:'Data terakhir; menunggu giliran pembaruan status PON.'};
 if(livePending.size>=2||require('./olt-terminal').isOpen(device.id)||require('./olt-zte-registration').isBusy(device.id)||require('./olt-zte-bridge').isBusy(device.id))return{...(old||{}),stale:true,message:'Data terakhir; menunggu proses konfigurasi selesai.'};
 liveAttempts.set(connection,Date.now());while(liveAttempts.size>32)liveAttempts.delete(liveAttempts.keys().next().value);
 const task=(async()=>{
  try{
   const vendors=require('./olt-vendors'),[,context,transport]=await vendors.loadLibrary(),stateCommand='show gpon onu state gpon-olt_'+key,baseCommand='show gpon onu baseinfo gpon-olt_'+key;
   const result=await context.withContext(data,device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:['enable','terminal length 0',baseCommand,stateCommand],timeoutMs:12000}),{...(options.transportOptions||{}),allowZteDevRead:options.allowZteDevRead===true,cliQueue:true,timeoutMs:14000});
   const status=states(output(result,stateCommand)),identities=base(output(result,baseCommand),key),value={ponKey:key,rows:join(status,identities,[{ponKey:key}]).rows,checkedAt:new Date().toISOString(),stale:false};
   liveCache.set(cacheKey,value);while(liveCache.size>32)liveCache.delete(liveCache.keys().next().value);return value;
  }catch{return{...(old||{}),stale:true,message:'Status belum dapat diperbarui melalui jaringan. Menampilkan data terakhir.'};}
 })();livePending.set(cacheKey,task);try{return structuredClone(await task);}finally{livePending.delete(cacheKey);}
}
function overlayStatus(snapshot,value){
 if(!value?.rows||Date.parse(value.checkedAt)<Date.parse(snapshot?.checkedAt||''))return snapshot;
 const old=new Map((snapshot?.onus||[]).map(row=>[row.id+':'+row.serialNumber,row])),other=(snapshot?.onus||[]).filter(row=>row.ponKey!==value.ponKey),seen=new Set(other.map(row=>row.serialNumber));
 const changed=value.rows.map(row=>{
  const previous=old.get(row.id+':'+row.serialNumber),{status,condition,downCause,causeKnown}=row;
  return{...row,...(previous||{}),status,condition,downCause,causeKnown:!seen.has(row.serialNumber)&&causeKnown,identityAmbiguous:seen.has(row.serialNumber)||row.identityAmbiguous,statusCheckedAt:value.checkedAt,statusStale:value.stale,lastOnlineAt:status==='online'&&!value.stale?value.checkedAt:previous?.lastOnlineAt||''};
 });return{...snapshot,onus:[...other,...changed]};
}
function powers(value,pon,expected=[]){
 const text=tidy(value);if(!/Onu\s+Rx power/i.test(text))throw Error('Tabel RX ONU belum dikenali');const rows=new Map();
 for(const line of text.split('\n')){if(!/^\s*gpon-onu_/.test(line))continue;const match=line.trim().match(/^gpon-onu_(\d+\/\d+\/\d+:\d+)\s+(N\/A|[-+]?\d+(?:\.\d+)?\s*\(dbm\))\s*$/i),p=match&&position(match[1]);if(!p||p.ponKey!==pon||rows.has(p.id))throw Error('Posisi RX ONU ambigu atau terpotong');const number=match[2]==='N/A'?null:Number(match[2].replace(/\s*\(dbm\)/i,''));rows.set(p.id,Number.isFinite(number)&&number<0&&number>=-60?number:null);}
 if(expected.some(row=>!rows.has(row.id))||rows.size!==expected.length)throw Error('Jumlah RX ONU tidak sesuai inventory');return rows;
}
function metadataColumn(entries,oid){const result=new Map();for(const[key,entry]of entries||[]){if(!key.startsWith(oid+'.'))continue;const match=key.slice(oid.length+1).match(/^(\d+)\.([1-9]\d{0,3})$/);if(!match||result.size>=MAX_ONUS)continue;const id=match[1]+':'+match[2];if(result.has(id))throw Error('Indeks metadata ONU ganda');result.set(id,String(entry.value||'').replace(/^"|"$/g,'').replace(/[\x00-\x1f\x7f]/g,'').slice(0,160));}return result;}
function metadataKey(row){return row.frame===1?String(0x11010000+row.slot*256+row.pon)+':'+row.onuId:'';}
function selectTelemetryPons(rows,old,pons){
 const grouped=new Map();for(const row of rows){const group=grouped.get(row.ponKey)||[];group.push(row);grouped.set(row.ponKey,group);}
 return pons.map(pon=>{const group=grouped.get(pon)||[];return{pon,urgent:group.some(row=>{const saved=old.get(row.id+':'+row.serialNumber);return row.status==='online'&&(saved?.status!=='online'||saved?.rxPending===true||saved?.rxPending===undefined&&saved?.rxPower===null);}),at:Math.min(...group.map(row=>Date.parse(old.get(row.id+':'+row.serialNumber)?.rxPowerAt||'')||0))};}).sort((a,b)=>Number(b.urgent)-Number(a.urgent)||a.at-b.at).slice(0,4);
}
function enrich(result,previous,columns,optics,now=Date.now(),verifiedIdentities=new Map()){
 const old=new Map((previous?.onus||[]).filter(row=>!row.identityAmbiguous).map(row=>[row.id+':'+row.serialNumber,row]));
 const recent=at=>{const age=now-Date.parse(at||'');return age>=0&&age<METADATA_MS;},checkedAt=new Date(now).toISOString();
 result.rows=result.rows.map(row=>{if(row.identityAmbiguous)return row;const saved=old.get(row.id+':'+row.serialNumber),key=metadataKey(row),observed=columns.serial?.get(key),serial=observed?.match(/^1,([A-Z0-9]{12})$/i)?.[1]?.toUpperCase();if(observed!==undefined&&serial!==row.serialNumber)return row;
  const verified=serial===row.serialNumber||verifiedIdentities.get(row.id)===row.serialNumber,named=verified?columns.name?.get(key):undefined,distanceText=verified?columns.distance?.get(key):undefined,distance=distanceText&&/^\d+$/.test(distanceText)?Number(distanceText):null;
  const nameAt=saved?.nameCheckedAt||saved?.metadataCheckedAt,distanceAt=saved?.distanceCheckedAt||saved?.metadataCheckedAt,hasDistance=distance!==null&&distance>0&&distance<=100000;
  const value=verified?optics.get(row.id):undefined,readAt=value?.at||saved?.rxPowerAt,power=value?value.value:saved?.rxPower,rxValid=row.status==='online'&&typeof power==='number'&&power<0&&power>=-60&&now-Date.parse(readAt||'')<RX_MS;
  return{...row,name:named!==undefined?named:recent(nameAt)?saved.name:'',nameCheckedAt:named!==undefined?checkedAt:recent(nameAt)?nameAt:'',distance:hasDistance?distance:recent(distanceAt)?saved.distance:null,distanceCheckedAt:hasDistance?checkedAt:recent(distanceAt)?distanceAt:'',metadataCheckedAt:named!==undefined&&distanceText!==undefined?checkedAt:recent(saved?.metadataCheckedAt)?saved.metadataCheckedAt:'',metadataPending:row.status==='online'&&!hasDistance&&!(saved?.distance>0)&&distanceText===undefined&&(saved?.status!=='online'||saved?.metadataPending===true),rxPower:rxValid?power:null,rxPowerAt:value?value.at:saved?.rxPowerAt||'',rxPending:row.status==='online'&&!value&&(saved?.status!=='online'||saved?.rxPending===true||saved?.rxPending===undefined&&saved?.rxPower===null),rxSource:rxValid?'zte-cli-onu-rx':''};
 });return result;
}
async function read(data,device,helpers={},options={}){
 const vendors=require('./olt-vendors'),[,context,transport]=await vendors.loadLibrary(),deadline=Date.now()+READ_BUDGET_MS;
 const run=commands=>{const remaining=deadline-Date.now();if(remaining<=0)throw Error('Batas waktu inventory ZTE tercapai');const timeoutMs=Math.min(remaining,18000);return context.withContext(data,device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:['enable','terminal length 0',...commands],timeoutMs}),{...options,cliQueue:true,timeoutMs});};
 const first=await run(['show card','show gpon onu state']),ports=cards(output(first,'show card')),status=states(output(first,'show gpon onu state')),pons=[...new Set([...status.values()].map(row=>row.ponKey))],identities=new Map();
 if(pons.length>MAX_PONS)throw Error('Terlalu banyak port PON dalam satu pembacaan');
 // Read one table per populated PON, not one command per subscriber. Each batch
 // stays inside the existing CLI byte/command/time budgets.
 let latest=status;
 for(let offset=0;offset<pons.length;offset+=16){const selected=pons.slice(offset,offset+16),last=offset+16>=pons.length,result=await run([...selected.map(pon=>'show gpon onu baseinfo gpon-olt_'+pon),...(last?['show gpon onu state']:[])]);for(const pon of selected)for(const[id,row]of base(output(result,'show gpon onu baseinfo gpon-olt_'+pon),pon)){if(identities.has(id))throw Error('Identitas ONU ganda');identities.set(id,row);}if(last)latest=states(output(result,'show gpon onu state'));}
 if(latest.size!==status.size||[...status.keys()].some(id=>!latest.has(id)))throw Error('Posisi ONU berubah selama pembacaan; baca ulang');
 const result=join(latest,identities,ports);
 if(options.includeTelemetry){
  const snmp=await import('./olt-vendor-library/services/snmp.js'),columns={},optics=new Map(),verifiedIdentities=new Map(),previous=options.previousSnapshot,old=new Map((previous?.onus||[]).map(row=>[row.id+':'+row.serialNumber,row]));
  const ranked=selectTelemetryPons(result.rows,old,pons);
  const metadataDeadline=deadline-18000;
  const column=async(name,index)=>{const remaining=metadataDeadline-Date.now();if(remaining<1250)return;const timeoutMs=Math.min(remaining,5000);try{const entries=await context.withContext(data,device,()=>snmp.snmpWalk({olt:vendors.legacyDevice(device),oid:META_OIDS[name]+'.'+index,timeoutMs,maxBuffer:524288,maxRepetitions:15,udpTimeoutMs:1000,maxAttempts:3}),{...options,timeoutMs});if(entries){columns[name]||=new Map();for(const[key,value]of metadataColumn(entries,META_OIDS[name]))columns[name].set(key,value);}}catch{}};
  // The whole-column walk can exceed a VPN timeout; enrich only the same four
  // PONs selected for RX, retaining verified identity-bound cache for the rest.
  for(const{pon}of ranked){const rows=result.rows.filter(row=>row.ponKey===pon),index=metadataKey(rows[0]).split(':')[0];if(!index)continue;const needsMeta=rows.some(row=>{const saved=old.get(row.id+':'+row.serialNumber);return!saved?.metadataCheckedAt||saved.metadataPending===true||Date.now()-Date.parse(saved.metadataCheckedAt)>=METADATA_MS||row.status==='online'&&saved.status!=='online'&&!(saved.distance>0);});if(needsMeta){await column('name',index);await column('distance',index);}}
  let response;
  if(ranked.length&&deadline-Date.now()>6000){try{response=await run(ranked.flatMap(({pon})=>['show pon power onu-rx gpon-olt_'+pon,'show gpon onu baseinfo gpon-olt_'+pon]));}catch{}}
  if(response?.success)for(const{pon}of ranked){
   const expected=result.rows.filter(row=>row.ponKey===pon),identities=base(output(response,'show gpon onu baseinfo gpon-olt_'+pon),pon);
   if(identities.size!==expected.length||expected.some(row=>identities.get(row.id)?.serialNumber!==row.serialNumber))throw Error('Identitas ONU berubah selama pembacaan optik; pembacaan ditahan');
   for(const row of expected)verifiedIdentities.set(row.id,row.serialNumber);
   const value=response.outputs?.find(row=>row.command==='show pon power onu-rx gpon-olt_'+pon);if(value)try{for(const[id,power]of powers(value.stdout,pon,expected))optics.set(id,{value:power,at:new Date().toISOString()});}catch{}
  }
  enrich(result,previous,columns,optics,Date.now(),verifiedIdentities);
  const known=result.rows.filter(row=>row.rxPower!==null).length;result.warning=`RX ONU dibaca bergiliran per PON; ${known} / ${result.rows.length} nilai tersedia. Nilai tidak tersedia tidak dihitung sebagai 0 dBm.`;
 }
 result.ports=await require('./olt-pon').readPortStates(device,result.ports,options.previousSnapshot?.ports,run,deadline);
 return result;
}
module.exports={read,readStatus,overlayStatus,states,base,cards,join,powers,metadataColumn,metadataKey,selectTelemetryPons,enrich,position,META_OIDS,METADATA_MS,RX_MS,MAX_ONUS,MAX_PONS,READ_BUDGET_MS};
