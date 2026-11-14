'use strict';

const identity=require('./network-identity');
const olt=require('./olt-monitor');
const acs=require('./genieacs');
const autoIdentity=require('./olt-auto-identity');
const caches=new WeakMap();
const ttl=30000;
const clean=value=>String(value||'').trim();
const pointId=customer=>clean(customer?.fiberPointId||customer?.odpId||customer?.distributionPointId||customer?.distribution_point_id||customer?.odp);
const serialTerms=sn=>[sn,...(/^[A-Z0-9]{4}[A-F0-9]{8}$/.test(sn)?[Buffer.from(sn.slice(0,4),'ascii').toString('hex').toUpperCase()+sn.slice(4)]:[])];

async function lookup(data,selector){
  if(process.env.MIGRATION_MODE==='1'||!acs.configured(data.settings||{}))return null;
  const {sn,customer,user,nasId}=selector,directory=identity.directory(data);
  const boundDeviceIds=[customer?.genieAcsDeviceId,user?.genieAcsDeviceId].filter(Boolean);
  const boundSerialNumbers=sn?[sn]:[customer?.genieAcsSerialNumber,user?.genieAcsSerialNumber].filter(Boolean);
  const username=user?.username||customer?.username||'';
  const terms=sn?serialTerms(sn):[...boundDeviceIds,...boundSerialNumbers,username].filter(Boolean);
  if(!terms.length)return null;
  return acs.findBestDevice(data.settings||{},terms,{compact:true,strictIdentity:true,
    username:sn?'':username,boundDeviceIds:sn?[]:boundDeviceIds,boundSerialNumbers,
    nasAliases:directory.aliasesFor(nasId||user?.nasId||customer?.nasId||customer?.nas||customer?.site),
    knownNasAliases:[...(data.radiusNas||[]),...(data.monitoringTargets||[])].flatMap(row=>[row.id,row.name,row.address,row.host]).filter(Boolean)});
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
  let modem=automatic?.modem||null;
  if(!modem&&!conflicting&&(sn||customer)&&(options.lookup||ticket.scope==='service'||ticket.customerId||link.customerId)){
    let timer;
    try{modem=await Promise.race([(options.lookup||lookup)(data,{sn,customer,user,nasId:requested?.nasId||ticket.nasId}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),2500);})]);}catch{}finally{clearTimeout(timer);}
  }
  if(modem){
    const matches=(!sn||identity.serial(modem.serialNumber)===sn)&&directory.compatible(modem,{nasId:requested?.nasId||ticket.nasId});
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
  if(sn)await Promise.all(permitted.map(async device=>{try{const snapshot=await (options.snapshot||olt.snapshotFor)(device);for(const onu of snapshot?.onus||[])if(identity.serial(onu.serialNumber)===sn)hits.push({device,onu});}catch{}}));
  const hit=hits.length===1?hits[0]:null,device=hit?.device||requested;
  link=hit?.device.links?.[sn]||link;
  if(!customer&&!conflicting&&link.customerId){const candidate=customers.get(link.customerId),account=candidate&&directory.userForCustomer(candidate);if(candidate&&directory.compatible(account||candidate,{nasId:device?.nasId})){customer=candidate;user=account;}}
  const odpIds=[link.fiberPointId,ticket.fiberPointId,pointId(customer)].filter(Boolean),odp=(data.fiberPoints||[]).find(row=>row.id===odpIds[0]);
  const knownUsername=user?.username||customer?.username||'';
  return {customer:{name:customer?.name||customer?.customerName||'',memberId:customer?.code||customer?.memberCode||customer?.accountId||''},
    account:{username:knownUsername||modem?.username||'',type:user?.service||'',status:user?.status||customer?.status||''},
    modem:{serialNumber:sn||'',model:modem?.productClass||hit?.onu.model||''},
    network:{olt:device?.name||'',pon:hit?.onu.ponKey||ticket.pon||'',odp:odp?[odp.code,odp.name].filter(Boolean).join(' - '):''},
    ownerVerified:Boolean(customer),acsMatched:Boolean(modem)};
}

async function context(data,ticket,devices,options={}){
  let cache=caches.get(data);
  if(!cache||cache.revision!==data.updatedAt||cache.customers!==data.customers||cache.users!==data.radiusUsers||cache.olts!==data.oltDevices||cache.points!==data.fiberPoints){cache={revision:data.updatedAt,customers:data.customers,users:data.radiusUsers,olts:data.oltDevices,points:data.fiberPoints,rows:new Map(),pending:new Map()};caches.set(data,cache);}
  const key=JSON.stringify([ticket.id,ticket.updatedAt,devices.map(row=>[row.id,row.updatedAt]),autoIdentity.cacheVersion(data)]);
  const previous=cache.rows.get(key);if(!options.lookup&&previous?.until>Date.now())return structuredClone(previous.value);
  if(!options.lookup&&cache.pending.has(key))return structuredClone(await cache.pending.get(key));
  if(cache.pending.size>=16)throw new Error('Pembacaan identitas sedang penuh. Coba kembali.');
  const pending=resolve(data,ticket,devices,options);cache.pending.set(key,pending);
  try{const value=await pending;cache.rows.set(key,{until:Date.now()+ttl,value});while(cache.rows.size>256)cache.rows.delete(cache.rows.keys().next().value);return structuredClone(value);}finally{if(cache.pending.get(key)===pending)cache.pending.delete(key);}
}

module.exports={context};
