'use strict';

const crypto=require('node:crypto');
const acs=require('./genieacs');
const identity=require('./network-identity');
const states=new Map();
const keys=new WeakMap();
const proofs=new WeakMap();
let revision=0;
const INTERVAL_MS=180000,TTL_MS=300000,MAX_ROWS=10000;
const clean=value=>String(value||'').trim();
const onuKey=onu=>onu?.identifierKind==='mac'?(/^[A-F0-9]{12}$/.test(onu.serialNumber)?'mac:'+onu.serialNumber:''):identity.serial(onu?.serialNumber);
const deviceSignature=device=>JSON.stringify([device.host,device.nasId,device.updatedAt]);
function configuration(data){
  const raw=data.settings?.genieAcs||{},signature=JSON.stringify([raw.enabled,raw.baseUrl,raw.token,raw.excludeUsernameSuffixes,raw.usernameParameters,raw.rxPowerParameters,process.env.GENIEACS_ENABLED,process.env.GENIEACS_BASE_URL,process.env.GENIEACS_TOKEN,process.env.GENIEACS_EXCLUDE_USERNAME_SUFFIXES]),old=keys.get(data);
  if(old?.signature===signature)return old;
  const cfg=acs.normalizeSettings(data.settings||{}),key=crypto.createHash('sha256').update(JSON.stringify([cfg.enabled,cfg.baseUrl,cfg.token,cfg.excludeUsernameSuffixes,cfg.usernameParameters,cfg.rxPowerParameters])).digest('hex'),value={key,signature,configured:acs.configured(cfg)};keys.set(data,value);return value;
}
const keyFor=data=>configuration(data).key;
function available(data){return data.settings?.networkIntegrationEnabled===true&&configuration(data).configured&&(data.oltDevices||[]).some(device=>device.enabled!==false);}
function locations(observations,now){
  const map=new Map();let count=0;
  for(const {device,snapshot}of observations){
    const at=Date.parse(snapshot?.checkedAt||'');
    if(!device?.id||device.enabled===false||snapshot?.status!=='online'||snapshot.stale||snapshot.pendingRefresh||!Number.isFinite(at)||now-at>360000||at>now+30000)continue;
    for(const onu of snapshot.onus||[]){
      if(++count>32768)throw new Error('Pemetaan ONU melebihi batas aman');
      const sn=onuKey(onu);if(!/^(?:mac:)?[A-Z0-9]{12}$/.test(sn))continue;
      const rows=map.get(sn)||[];rows.push({deviceId:device.id,signature:deviceSignature(device),index:String(onu.id),status:onu.status,pon:onu.ponKey||''});map.set(sn,rows);
      if(map.size>32768)throw new Error('Pemetaan ONU melebihi batas aman');
    }
  }
  return map;
}
function chosenPosition(rows=[]){const online=rows.filter(row=>row.status==='online');return rows.length===1?rows[0]:online.length===1?online[0]:null;}
async function refresh(data,observations=[],options={}){
  if(!available(data)||(process.env.MIGRATION_MODE==='1'&&!options.allowDemo))return {skipped:true};
  const now=options.now??Date.now(),key=keyFor(data),previous=states.get(key);
  const positions=locations(observations,now);if(previous){previous.positions=positions;previous.revision=++revision;}
  if(previous?.pending)return previous.pending;
  if(previous&&previous.nextAt>now)return {skipped:true,cached:true};
  if(!positions.size)return {skipped:true};
  const state=previous||{rows:new Map(),positions:new Map(),checkedAt:0};state.positions=positions;state.revision=++revision;state.nextAt=now+INTERVAL_MS;states.set(key,state);while(states.size>4)states.delete(states.keys().next().value);
  const pending=(async()=>{
    try{
      const rows=await(options.fetch||acs.identityDevices)(data.settings||{},{optical:true});if(!Array.isArray(rows)||rows.length>MAX_ROWS)throw new Error('Identitas ACS tidak valid');
      const indexed=new Map(),accounts=new Map();
      for(const source of rows){const sn=identity.serial(source.serialNumber),username=clean(source.username);if(!/^[A-Z0-9]{6,32}$/.test(sn)||!source.id||!username)continue;
        const interfaceMacs=Array.isArray(source.interfaceMacs)?[...new Set(source.interfaceMacs.filter(value=>typeof value==='string'&&/^[A-F0-9]{12}$/.test(value)&&!/^0{12}$|^F{12}$/.test(value)&&(parseInt(value.slice(0,2),16)&1)===0))].slice(0,2):[];
        const rxAt=Date.parse(source.rxPowerAt||''),registered=Date.parse(source.registered||''),validRx=typeof source.rxPowerValue==='number'&&Number.isFinite(source.rxPowerValue)&&source.rxPowerValue<0&&source.rxPowerValue>=-60&&Number.isFinite(rxAt)&&rxAt<=now+30000&&(!Number.isFinite(registered)||rxAt>=registered);
        const row={id:clean(source.id),serialNumber:sn,username,lastInform:clean(source.lastInform),registered:clean(source.registered),productClass:clean(source.productClass),nasId:clean(source.nasId),interfaceMacs,tags:Array.isArray(source.tags)?source.tags.map(clean).slice(0,32):[],rxPowerValue:validRx?source.rxPowerValue:null,rxPowerAt:validRx?new Date(rxAt).toISOString():''};
        for(const key of [...(/^[A-Z0-9]{12}$/.test(sn)?[sn]:[]),...interfaceMacs.map(value=>'mac:'+value)])if(positions.has(key)){const group=indexed.get(key)||[];group.push(row);indexed.set(key,group);}
        const key=username.toLowerCase(),peers=accounts.get(key)||[];peers.push(row);accounts.set(key,peers);
      }
      state.rows=indexed;state.accounts=accounts;state.checkedAt=now;state.failed=false;state.revision=++revision;
      return {ok:true,serials:indexed.size,checkedAt:new Date(now).toISOString()};
    }catch{state.failed=true;state.nextAt=now+30000;state.revision=++revision;return {ok:false};}
    finally{state.pending=null;}
  })();state.pending=pending;return pending;
}
function deviceFor(data,device,onu,now){
  if(!device||!available(data)||device.enabled===false)return null;
  const state=states.get(keyFor(data));if(!state||state.failed||now-state.checkedAt>TTL_MS||now<state.checkedAt-30000)return null;
  const implicitMac=!onu?.identifierKind&&/^[A-F0-9]{12}$/.test(onu?.serialNumber||'')&&state.positions.has('mac:'+onu.serialNumber)&&!state.positions.has(onu.serialNumber);
  const sn=onuKey(implicitMac?{...onu,identifierKind:'mac'}:onu),mac=onu?.identifierKind==='mac'||implicitMac,position=chosenPosition(state.positions.get(sn));
  if(!position||position.deviceId!==device.id||position.signature!==deviceSignature(device)||(onu?.id!==undefined&&position.index!==String(onu.id)))return null;
  const directory=identity.directory(data);
  let proofCache=proofs.get(data);
  if(!proofCache||proofCache.directory!==directory||proofCache.revision!==state.revision){proofCache={directory,revision:state.revision,rows:new Map(),knownNasAliases:[...(data.monitoringTargets||[]),...(data.radiusNas||[])].flatMap(row=>[row.id,row.name,row.address,row.host]).filter(Boolean)};proofs.set(data,proofCache);}
  const proofKey=JSON.stringify([device.id,position.index,sn]),knownNasAliases=proofCache.knownNasAliases;
  if(proofCache.rows.has(proofKey))return proofCache.rows.get(proofKey);
  const freshness=row=>({...row,online:Number.isFinite(Date.parse(row.lastInform))&&now-Date.parse(row.lastInform)<=900000&&Date.parse(row.lastInform)<=now+30000});
  const candidates=(state.rows.get(sn)||[]).map(freshness),nasAliases=directory.aliasesFor(device.nasId);
  if(mac&&(candidates.length!==1||!candidates[0].online||state.positions.get(sn)?.length!==1))return null;
  const modem=identity.strictDeviceCandidate(candidates,{boundDeviceIds:mac?[candidates[0].id]:[],boundSerialNumbers:mac?[]:[sn],nasAliases,knownNasAliases});if(!modem)return null;
  const current=identity.strictDeviceCandidate((state.accounts.get(modem.username.toLowerCase())||[]).map(freshness),{username:modem.username,nasAliases,knownNasAliases});
  if(!current||current.id!==modem.id)return null;
  const informed=Date.parse(modem.lastInform);if(!Number.isFinite(informed)||informed>now+30000)return null;
  const proof={modem,position,directory};proofCache.rows.set(proofKey,proof);while(proofCache.rows.size>2000)proofCache.rows.delete(proofCache.rows.keys().next().value);return proof;
}
function manualConflict(data,device,onu,now=Date.now()){
  const manual=device?.links?.[identity.serial(onu?.serialNumber)]?.customerId;if(!manual)return false;
  const proof=deviceFor(data,device,onu,now);if(!proof)return false;
  const member=proof.directory.customerById(manual),user=member&&proof.directory.userForCustomer(member);
  return Boolean(user?.username&&clean(user.username).toLowerCase()!==clean(proof.modem.username).toLowerCase());
}
function manualCustomerFor(data,device,onu,now=Date.now()){
  const id=device?.links?.[identity.serial(onu?.serialNumber)]?.customerId;
  if(!id||manualConflict(data,device,onu,now))return null;
  const directory=identity.directory(data),member=directory.customerById(id);
  return member&&directory.compatible(directory.userForCustomer(member)||member,{nasId:device.nasId})?member:null;
}
function customerFor(data,device,onu,now=Date.now()){
  const proof=deviceFor(data,device,onu,now);if(!proof)return null;
  const {modem,position,directory}=proof,sn=identity.serial(onu.serialNumber),member=directory.customerForAcs(modem),user=member&&directory.userForCustomer(member);
  if(!member||!user||clean(user.username).toLowerCase()!==clean(modem.username).toLowerCase()||!directory.compatible(user,{nasId:device.nasId}))return null;
  const manual=device.links?.[sn]?.customerId;if(manual&&manual!==member.id)return null;
  return {customer:member,account:user,modem,position};
}
function customerForTicket(data,ticket,device,now=Date.now()){
  if(!device||!ticket.serialNumber||(!ticket.customerId&&ticket.status==='resolved'))return null;
  const match=customerFor(data,device,{serialNumber:ticket.serialNumber},now);if(!match)return null;
  if(ticket.pon&&ticket.pon!==match.position.pon)return null;
  if(ticket.onuIndex&&String(ticket.onuIndex)!==match.position.index)return null;
  if(ticket.customerId&&ticket.customerId!==match.customer.id)return null;
  const registered=Date.parse(match.modem.registered||'');if(!ticket.customerId&&Number.isFinite(registered)&&registered>Date.parse(ticket.createdAt||''))return null;
  return match;
}
function modemFor(data,device,onu,now=Date.now()){return deviceFor(data,device,onu,now)?.modem||null;}
function currentForCustomer(data,customer,now=Date.now()){
  if(!available(data))return null;
  const state=states.get(keyFor(data));if(!state||state.failed||now-state.checkedAt>TTL_MS||now<state.checkedAt-30000)return null;
  const directory=identity.directory(data),account=directory.userForCustomer(customer),username=clean(account?.username||customer?.username).toLowerCase();
  if(!username)return null;
  const candidates=(state.accounts.get(username)||[]).map(row=>({...row,online:Number.isFinite(Date.parse(row.lastInform))&&now-Date.parse(row.lastInform)<=900000&&Date.parse(row.lastInform)<=now+30000}));
  const modem=identity.strictDeviceCandidate(candidates,{username,nasAliases:directory.aliasesFor(account?.nasId||customer?.nasId),knownNasAliases:[...(data.radiusNas||[]),...(data.monitoringTargets||[])].flatMap(row=>[row.id,row.name,row.address,row.host]).filter(Boolean)});
  if(!modem||directory.customerForAcs(modem)?.id!==customer.id)return null;
  for(const key of[modem.serialNumber,...(modem.interfaceMacs||[]).map(value=>'mac:'+value)]){
    const position=chosenPosition(state.positions.get(key));if(!position||position.status!=='online')continue;
    const device=(data.oltDevices||[]).find(row=>row.id===position.deviceId),onu={serialNumber:key.replace(/^mac:/,''),identifierKind:key.startsWith('mac:')?'mac':'serial',id:position.index};
    const match=customerFor(data,device,onu,now);if(match?.customer.id===customer.id)return{device,position,serialNumber:onu.serialNumber,checkedAt:new Date(state.checkedAt).toISOString()};
  }
  return null;
}
function modemForTicket(data,ticket,device,now=Date.now()){
  if(!device||!ticket.serialNumber||ticket.status==='resolved')return null;
  const proof=deviceFor(data,device,{serialNumber:ticket.serialNumber},now);if(!proof||ticket.pon&&ticket.pon!==proof.position.pon||ticket.onuIndex&&String(ticket.onuIndex)!==proof.position.index)return null;
  const member=proof.directory.customerForAcs(proof.modem);if(ticket.customerId&&member?.id!==ticket.customerId)return null;
  const registered=Date.parse(proof.modem.registered||'');if(!ticket.customerId&&Number.isFinite(registered)&&registered>Date.parse(ticket.createdAt||''))return null;
  return proof.modem;
}
function cacheVersion(data){const key=keyFor(data),state=states.get(key);return key+':'+(state?.revision||revision)+':'+Boolean(available(data)&&state&&!state.failed&&Date.now()-state.checkedAt<=TTL_MS);}
function invalidate(){states.clear();revision++;}
module.exports={refresh,customerFor,customerForTicket,modemFor,modemForTicket,currentForCustomer,manualConflict,manualCustomerFor,cacheVersion,available,invalidate,INTERVAL_MS,TTL_MS};
