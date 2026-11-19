'use strict';

const identity=require('./network-identity');
const olt=require('./olt-monitor');
const acs=require('./genieacs');
const autoIdentity=require('./olt-auto-identity');
const crypto=require('node:crypto');
const caches=new WeakMap();
const lookups=new Map();
const ttl=30000;
const clean=value=>String(value||'').trim();
const pointId=customer=>clean(customer?.fiberPointId||customer?.odpId||customer?.distributionPointId||customer?.distribution_point_id||customer?.odp);
const serialTerms=sn=>[sn,...(/^[A-Z0-9]{4}[A-F0-9]{8}$/.test(sn)?[Buffer.from(sn.slice(0,4),'ascii').toString('hex').toUpperCase()+sn.slice(4)]:[])];

function contextKind(ticket={}){
  if(ticket.kind==='request')return'none';
  if(require('./ticket-recovery').grouped(ticket))return'affected';
  if(ticket.scope==='service')return require('./ticket-incidents').isFault(ticket)?'device':'none';
  return ticket.scope==='onu'||ticket.serialNumber?'device':'none';
}
function presentation(ticket){
  const {waNotifications,notificationError,recoveryTargets,customerNoticeReceipts,incidentDevices,...result}=ticket;
  result.number=require('./ticket-reference').number(ticket);result.contextKind=contextKind(ticket);
  if(result.contextKind==='none')for(const key of['username','oltId','pon','serialNumber','onuIndex','onuName','fiberPointId','fiberPointName','losDetection','affectedCount','affectedSerialNumbers','recovery','oltOptical','acsOptical','opticalSummary'])delete result[key];
  if(result.contextKind==='affected')for(const key of['customerId','customerName','username','contactPhone','contactAddress','latitude','longitude','locationUrl','coordinates','serialNumber','onuIndex','onuName','oltOptical','acsOptical','opticalSummary'])delete result[key];
  return result;
}

async function affectedContext(data,ticket,devices,options={}){
  const recovery=require('./ticket-recovery'),device=devices.find(row=>row.id===ticket.oltId),directory=identity.directory(data),now=options.now??Date.now();
  const limit=[10,25,50].includes(Number(options.limit))?Number(options.limit):10,search=clean(options.search).toLocaleLowerCase('id-ID').slice(0,100);
  let snapshot=null;if(device)try{snapshot=await(options.snapshot||olt.snapshotFor)(device);}catch{}
  const at=Date.parse(snapshot?.checkedAt||''),fresh=Boolean(device&&device.enabled!==false&&Array.isArray(snapshot?.onus)&&snapshot.status==='online'&&!snapshot.stale&&!snapshot.pendingRefresh&&snapshot.inventoryAvailable!==false&&(!snapshot.simulated||process.env.MIGRATION_MODE==='1')&&Number.isFinite(at)&&at<=now+30000&&now-at<=olt.CACHE_MS*2);
  const seen=new Map(),ambiguous=new Set(),targets=new Map();
  if(fresh)for(const row of snapshot.onus.slice(0,8192)){if(!row?.serialNumber)continue;const sn=identity.serial(row.serialNumber);if(seen.has(sn))ambiguous.add(sn);else seen.set(sn,row);}
  for(const row of(Array.isArray(ticket.recoveryTargets)?ticket.recoveryTargets:[]).slice(0,recovery.MAX_TARGETS)){
    if(!row?.serialNumber)continue;
    const sn=identity.serial(row.serialNumber),old=targets.get(sn);if(old&&JSON.stringify([old.id,old.pon,old.customerId])!==JSON.stringify([row.id,row.pon,row.customerId]))ambiguous.add(sn);else targets.set(sn,row);
  }
  const raw=Array.isArray(ticket.affectedSerialNumbers)&&ticket.affectedSerialNumbers.length?ticket.affectedSerialNumbers:[...targets.keys()];
  const serials=[...new Set(raw.slice(0,recovery.MAX_TARGETS).map(identity.serial).filter(sn=>/^[A-Z0-9]{12}$/.test(sn)))];
  const customers=new Map();let unmapped=0;
  const rank={online:0,'power-off':1,unknown:2,los:3};
  for(const sn of serials){
    const target=targets.get(sn),row=seen.get(sn);let customer=null,state='unknown';
    const positionMatches=row&&!ambiguous.has(sn)&&(!target?.id||String(target.id)===String(row.id))&&(!target?.pon||target.pon===row.ponKey)&&(!ticket.pon||ticket.pon===row.ponKey);
    if(device&&!ambiguous.has(sn)){
      if(fresh&&positionMatches){
        customer=require('./ticket-incidents').owner(data,device,row,now).customer;
        if(target?.customerId&&customer?.id!==target.customerId)customer=null;
        const mappedOdp=device.links?.[sn]?.fiberPointId||pointId(customer)||target?.odp;
        if(ticket.scope==='odp'&&mappedOdp!==ticket.fiberPointId)customer=null;
        if(row.status==='online')state='online';
        else if(row.status==='offline'&&row.causeKnown===true&&row.condition==='dying-gasp')state='power-off';
        else if(row.status==='offline'&&row.causeKnown===true&&row.condition==='los'&&!row.plannedReboot)state='los';
      }else if((!fresh||!row)&&target?.customerId&&(!ticket.pon||target.pon===ticket.pon)&&(ticket.scope!=='odp'||target.odp===ticket.fiberPointId)){
        const current=require('./ticket-incidents').owner(data,device,{serialNumber:sn,...(target.id?{id:target.id}:{})},now);
        if(!current.conflict&&(!current.customer||current.customer.id===target.customerId))customer=directory.customerById(target.customerId);
      }
    }
    if(!customer||!directory.compatible(directory.userForCustomer(customer)||customer,{nasId:device?.nasId})){unmapped++;continue;}
    const previous=customers.get(customer.id),entry={id:customer.id,name:customer.name||customer.customerName||'Nama belum dilengkapi',memberId:customer.code||customer.memberCode||customer.accountId||'',state};
    if(!previous||rank[state]>rank[previous.state])customers.set(customer.id,entry);
  }
  const all=[...customers.values()].sort((a,b)=>a.name.localeCompare(b.name,'id',{numeric:true,sensitivity:'base'})||a.id.localeCompare(b.id)),filtered=all.filter(row=>!search||[row.name,row.memberId].some(value=>String(value).toLocaleLowerCase('id-ID').includes(search)));
  const pages=Math.max(1,Math.ceil(filtered.length/limit)),page=Math.max(1,Math.min(pages,parseInt(options.page,10)||1));
  const measured=device&&fresh?await recovery.forTicket(data,ticket,{...options,now,snapshot:async()=>snapshot}):{available:false,ready:false,threshold:recovery.THRESHOLD};
  const safeRecovery=Object.fromEntries(['available','ready','threshold','online','eligible','poweredOff','remainingLos','unknown'].filter(key=>measured[key]!==undefined).map(key=>[key,measured[key]]));
  return{kind:'affected',affected:{rows:filtered.slice((page-1)*limit,page*limit),total:filtered.length,mappedTotal:all.length,connections:serials.length,unmappedConnections:unmapped,page,pages,limit,available:fresh,checkedAt:fresh?snapshot.checkedAt:'',truncated:raw.length>recovery.MAX_TARGETS},recovery:safeRecovery};
}

function validOptical(reading,now=Date.now()){
  return Boolean(reading&&typeof reading.rxPower==='number'&&Number.isFinite(reading.rxPower)&&reading.rxPower<0&&reading.rxPower>=-60&&Number.isFinite(Date.parse(reading.at))&&Date.parse(reading.at)<=now+30000);
}
function optical(data,ticket,options={}){
  const now=options.now??Date.now(),device=options.device||(data.oltDevices||[]).find(row=>row.id===ticket.oltId);
  const bound=saved=>saved&&saved.oltId===ticket.oltId&&saved.serialNumber===ticket.serialNumber&&(!ticket.onuIndex||saved.onuIndex===ticket.onuIndex)&&(!ticket.pon||!saved.pon||saved.pon===ticket.pon);
  const oltReading=validOptical(options.oltReading,now)?options.oltReading:bound(ticket.oltOptical)&&validOptical(ticket.oltOptical,now)?ticket.oltOptical:null;
  if(oltReading)return{rxPower:oltReading.rxPower,at:oltReading.at,stale:oltReading.stale!==false,source:'OLT'};
  if(bound(ticket.acsOptical)&&ticket.acsOptical.customerId===(ticket.customerId||'')&&validOptical(ticket.acsOptical,now))return{rxPower:ticket.acsOptical.rxPower,at:ticket.acsOptical.at,stale:true,source:'ACS'};
  if(!device||!ticket.serialNumber||autoIdentity.manualConflict(data,device,{serialNumber:ticket.serialNumber},now))return{rxPower:null,at:'',stale:true};
  const modem=options.modem||autoIdentity.modemForTicket(data,ticket,device,now);
  if(!modem)return{rxPower:null,at:'',stale:true};
  const directory=identity.directory(data),sn=identity.serial(ticket.serialNumber),member=directory.customerForAcs(modem),reading={rxPower:modem.rxPowerValue,at:modem.rxPowerAt};
  const registered=Date.parse(modem.registered||''),memberCreated=Date.parse(member?.createdAt||''),at=Date.parse(reading.at||''),incident=Date.parse(ticket.losDetection?.firstDetectedAt||ticket.createdAt||'');
  const matches=identity.serial(modem.serialNumber)===sn||modem.interfaceMacs?.includes(sn);
  if(!matches||!directory.compatible(modem,{nasId:device.nasId})||ticket.customerId&&member?.id!==ticket.customerId||!validOptical(reading,now)||Number.isFinite(registered)&&at<registered||Number.isFinite(memberCreated)&&at<memberCreated||Number.isFinite(incident)&&at>incident+30000)return{rxPower:null,at:'',stale:true};
  return{...reading,stale:true,source:'ACS',deviceId:modem.id};
}
function captureOptical(data,ticket,candidates,now=Date.now()){
  const device=(data.oltDevices||[]).find(row=>row.id===ticket.oltId);
  if(ticket.serialNumber){const value=optical(data,ticket,{device,now});return value.source==='ACS'?{acsOptical:{...value,oltId:ticket.oltId,serialNumber:ticket.serialNumber,onuIndex:ticket.onuIndex||'',pon:ticket.pon||'',customerId:ticket.customerId||''}}:{};}
  if(!['odp','pon','odc'].includes(ticket.scope))return{};
  const values=[];
  for(const candidate of(candidates||[]).slice(0,1024)){
    const target={...ticket,serialNumber:candidate.serialNumber,onuIndex:candidate.onuIndex,pon:candidate.pon,customerId:''},value=optical(data,target,{device,oltReading:candidate.optical,now});
    if(validOptical(value,now))values.push(value);
  }
  if(!values.length)return{};
  return{opticalSummary:{oltId:ticket.oltId,pon:ticket.pon||'',fiberPointId:ticket.fiberPointId||'',minimum:Math.min(...values.map(row=>row.rxPower)),maximum:Math.max(...values.map(row=>row.rxPower)),count:values.length,total:ticket.affectedCount||ticket.affectedSerialNumbers?.length||values.length,sources:[...new Set(values.map(row=>row.source))].sort(),firstAt:new Date(Math.min(...values.map(row=>Date.parse(row.at)))).toISOString(),lastAt:new Date(Math.max(...values.map(row=>Date.parse(row.at)))).toISOString()}};
}
function opticalText(data,ticket){
  const value=ticket.serialNumber?optical(data,ticket):null,summary=ticket.opticalSummary;
  const zone=data.settings?.timezone||data.settings?.timeZone||'Asia/Makassar';
  const date=at=>{try{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).map(row=>[row.type,row.value]));return`${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;}catch{return'-';}};
  const number=rx=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(rx);
  if(value?.source)return`${number(value.rxPower)} dBm (${value.source}; data ${date(value.at)})`;
  if(!ticket.serialNumber&&summary&&summary.oltId===ticket.oltId&&summary.pon===(ticket.pon||'')&&summary.fiberPointId===(ticket.fiberPointId||'')&&Number.isInteger(summary.count)&&Number.isInteger(summary.total)&&Array.isArray(summary.sources)&&summary.count>0&&summary.count<=summary.total&&summary.total<=8192&&validOptical({rxPower:summary.minimum,at:summary.firstAt})&&validOptical({rxPower:summary.maximum,at:summary.lastAt}))return`${number(summary.minimum)}${summary.minimum===summary.maximum?'':' s/d '+number(summary.maximum)} dBm (${summary.count}/${summary.total} ONU; ${summary.sources.filter(source=>['OLT','ACS'].includes(source)).join('/')}; data terakhir ${date(summary.lastAt)})`;
  return'-';
}

async function lookup(data,selector){
  if(process.env.MIGRATION_MODE==='1'||!acs.configured(data.settings||{}))return null;
  const {sn,customer,user,nasId}=selector,directory=identity.directory(data);
  const boundDeviceIds=[customer?.genieAcsDeviceId,user?.genieAcsDeviceId].filter(Boolean);
  const boundSerialNumbers=sn?[sn]:[customer?.genieAcsSerialNumber,user?.genieAcsSerialNumber].filter(Boolean);
  const username=user?.username||customer?.username||'';
  const terms=sn?serialTerms(sn):[...boundDeviceIds,...boundSerialNumbers,username].filter(Boolean);
  if(!terms.length)return null;
  const cfg=acs.normalizeSettings(data.settings||{}),nasAliases=directory.aliasesFor(nasId||user?.nasId||customer?.nasId||customer?.nas||customer?.site);
  const knownNasAliases=[...(data.radiusNas||[]),...(data.monitoringTargets||[])].flatMap(row=>[row.id,row.name,row.address,row.host]).filter(Boolean);
  const key=crypto.createHash('sha256').update(JSON.stringify([cfg.enabled,cfg.baseUrl,cfg.token,cfg.excludeUsernameSuffixes,cfg.usernameParameters,cfg.rxPowerParameters,terms,username,boundDeviceIds,boundSerialNumbers,nasAliases,knownNasAliases])).digest('hex'),now=Date.now();
  for(const[key,row]of lookups)if(!row.pending&&row.until<=now)lookups.delete(key);
  const cached=lookups.get(key);if(cached?.pending)return structuredClone(await cached.pending);if(cached?.until>now)return structuredClone(cached.value);
  if([...lookups.values()].filter(row=>row.pending).length>=8)return null;
  const entry={pending:null,until:0,value:null};
  const pending=acs.findBestDevice(data.settings||{},terms,{compact:true,strictIdentity:true,
    username:sn?'':username,boundDeviceIds:sn?[]:boundDeviceIds,boundSerialNumbers,
    nasAliases,knownNasAliases}).catch(()=>null);
  entry.pending=pending;lookups.set(key,entry);
  while(lookups.size>128){const oldest=[...lookups.keys()].find(key=>!lookups.get(key).pending);if(!oldest)break;lookups.delete(oldest);}
  try{const value=await pending;entry.value=value;entry.until=Date.now()+(value?ttl:15000);return structuredClone(value);}finally{entry.pending=null;}
}

async function resolve(data,ticket,devices,options={}){
  const directory=identity.directory(data),customers=new Map((data.customers||[]).map(row=>[row.id,row]));
  const requested=devices.find(row=>row.id===ticket.oltId);
  let sn=identity.serial(ticket.serialNumber),link=requested?.links?.[sn]||{};
  let conflicting=Boolean(ticket.customerId&&link.customerId&&ticket.customerId!==link.customerId)||autoIdentity.manualConflict(data,requested,{serialNumber:sn});
  const automatic=autoIdentity.customerForTicket(data,ticket,requested);
  let customer=conflicting?null:customers.get(ticket.customerId)||customers.get(link.customerId)||automatic?.customer||(ticket.scope==='service'?directory.customerForSerial(sn,{nasId:requested?.nasId||ticket.nasId}):null);
  let user=customer?directory.userForCustomer(customer):null;
  if(customer&&!directory.compatible(user||customer,{nasId:requested?.nasId||ticket.nasId})){customer=null;user=null;}
  let modem=automatic?.modem||(!conflicting&&autoIdentity.modemForTicket(data,ticket,requested))||null;
  if(!modem&&!conflicting&&(sn||customer)&&(options.lookup||ticket.scope==='service'||ticket.customerId||link.customerId)){
    let timer;
    try{modem=await Promise.race([(options.lookup||lookup)(data,{sn,customer,user,nasId:requested?.nasId||ticket.nasId}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),2500);})]);}catch{}finally{clearTimeout(timer);}
  }
  if(modem){
    const matches=(!sn||identity.serial(modem.serialNumber)===sn||modem.interfaceMacs?.includes(sn))&&directory.compatible(modem,{nasId:requested?.nasId||ticket.nasId});
    const matched=matches?directory.customerForAcs(modem):null,matchedUser=matched&&directory.userForCustomer(matched);
    if(!matches||(matched&&!directory.compatible(matchedUser||matched,{nasId:requested?.nasId||ticket.nasId}))||(customer&&matched?.id!==customer.id)){modem=null;customer=null;user=null;conflicting=true;}
    else{
      const accounts=(data.radiusUsers||[]).filter(row=>clean(row.username).toLowerCase()===clean(modem.username).toLowerCase()&&directory.compatible(row,{nasId:requested?.nasId||ticket.nasId})&&directory.compatible(row,modem));
      customer=matched;user=matchedUser||(accounts.length===1?accounts[0]:null);conflicting=!matched;identity.observeAcs(data,[modem]);
    }
  }
  sn=sn||identity.serial(modem?.serialNumber||customer?.genieAcsSerialNumber||user?.genieAcsSerialNumber);
  const permitted=devices.filter(device=>!requested||device.id===requested.id).filter(device=>directory.compatible(user||customer||{nasId:ticket.nasId},{nasId:device.nasId}));
  const hits=[];
  if(sn)await Promise.all(permitted.map(async device=>{try{const snapshot=await (options.snapshot||olt.snapshotFor)(device);for(const onu of snapshot?.onus||[])if((identity.serial(onu.serialNumber)===sn||onu.identifierKind==='mac'&&modem?.interfaceMacs?.includes(onu.serialNumber))&&(!ticket.onuIndex||String(ticket.onuIndex)===String(onu.id))&&(!ticket.pon||!ticket.serialNumber||ticket.pon===onu.ponKey))hits.push({device,onu,snapshot});}catch{}}));
  const hit=hits.length===1?hits[0]:null,device=hit?.device||requested;
  link=hit?.device.links?.[sn]||link;
  if(!customer&&!conflicting&&link.customerId){const candidate=customers.get(link.customerId),account=candidate&&directory.userForCustomer(candidate);if(candidate&&directory.compatible(account||candidate,{nasId:device?.nasId})){customer=candidate;user=account;}}
  const odpIds=[link.fiberPointId,ticket.fiberPointId,pointId(customer)].filter(Boolean),odp=(data.fiberPoints||[]).find(row=>row.id===odpIds[0]);
  const knownUsername=user?.username||customer?.username||'';
  const observed=hit&&(!ticket.customerId||!conflicting)?olt.lastOptical(hit.snapshot,hit.onu):null,reading=optical(data,ticket,{device,oltReading:observed,modem:!conflicting?modem:null});
  return {customer:{name:customer?.name||customer?.customerName||'',memberId:customer?.code||customer?.memberCode||customer?.accountId||''},
    account:{username:knownUsername||modem?.username||'',type:user?.service||'',status:user?.status||customer?.status||''},
    modem:{serialNumber:sn||'',model:modem?.productClass||hit?.onu.model||''},
    network:{olt:device?.name||'',pon:hit?.onu.ponKey||ticket.pon||'',odp:odp?[odp.code,odp.name].filter(Boolean).join(' - '):'',optical:reading,...(require('./ticket-recovery').grouped(ticket)?{recovery:await require('./ticket-recovery').forTicket(data,ticket,options)}:{})},
    ownerVerified:Boolean(customer),acsMatched:Boolean(modem)};
}

async function context(data,ticket,devices,options={}){
  const kind=contextKind(ticket);if(kind==='none')return{kind};
  options={...options,page:Math.max(1,Math.min(4096,parseInt(options.page,10)||1)),limit:[10,25,50].includes(Number(options.limit))?Number(options.limit):10,search:clean(options.search).slice(0,100)};
  let cache=caches.get(data);
  if(!cache||cache.revision!==data.updatedAt||cache.customers!==data.customers||cache.users!==data.radiusUsers||cache.olts!==data.oltDevices||cache.points!==data.fiberPoints){cache={revision:data.updatedAt,customers:data.customers,users:data.radiusUsers,olts:data.oltDevices,points:data.fiberPoints,rows:new Map(),pending:new Map()};caches.set(data,cache);}
  const key=JSON.stringify([ticket.id,ticket.updatedAt,kind,options.page,options.limit,options.search,devices.map(row=>[row.id,row.updatedAt]),autoIdentity.cacheVersion(data)]);
  const previous=cache.rows.get(key);if(!options.lookup&&previous?.until>Date.now())return structuredClone(previous.value);
  if(!options.lookup&&cache.pending.has(key))return structuredClone(await cache.pending.get(key));
  if(cache.pending.size>=16)throw new Error('Pembacaan identitas sedang penuh. Coba kembali.');
  const pending=kind==='affected'?affectedContext(data,ticket,devices,options):resolve(data,ticket,devices,options).then(value=>({kind,...value}));cache.pending.set(key,pending);
  try{const value=await pending;cache.rows.set(key,{until:Date.now()+(kind==='affected'?5000:ttl),value});while(cache.rows.size>256)cache.rows.delete(cache.rows.keys().next().value);return structuredClone(value);}finally{if(cache.pending.get(key)===pending)cache.pending.delete(key);}
}

module.exports={context,contextKind,presentation,optical,captureOptical,opticalText};
