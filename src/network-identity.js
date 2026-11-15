'use strict';

// Read-only identity directory. Runtime observations never overwrite customer data.
let directories=new WeakMap();
const observations=new WeakMap();
const clean=value=>String(value??'').trim().toLowerCase();
function serial(value) {
  const raw=String(value||'').trim().toUpperCase();
  if(/^[0-9A-F]{16}$/.test(raw)){const vendor=Buffer.from(raw.slice(0,8),'hex').toString('ascii');if(/^[A-Z]{4}$/.test(vendor))return vendor+raw.slice(8);}
  return raw;
}
function add(map,key,value){if(!key)return;const rows=map.get(key)||[];if(!rows.includes(value))rows.push(value);map.set(key,rows);}
function unique(rows){const values=[...new Set(rows.filter(Boolean))];return values.length===1?values[0]:null;}
function createDirectory(data={}) {
  const customers=new Map((data.customers||[]).map(row=>[row.id,row])),byName=new Map(),byCustomerName=new Map(),byCustomerUserId=new Map(),byCustomer=new Map(),byUserId=new Map(),byDevice=new Map(),bySerial=new Map(),nasAliases=new Map();
  for(const row of [...(data.monitoringTargets||[]),...(data.radiusNas||[])]){
    const aliases=[row.id,row.monitoringTargetId,row.monitoringId,row.name,row.address,row.host,row.site,...(row.aliases||[])].map(clean).filter(Boolean);
    for(const key of aliases){const set=nasAliases.get(key)||new Set();aliases.forEach(value=>set.add(value));nasAliases.set(key,set);}
  }
  const aliasesFor=value=>{const key=clean(value),set=new Set([key].filter(Boolean));for(const alias of nasAliases.get(key)||[])set.add(alias);return [...set];};
  const nasValues=row=>[row.nasId,row.nasName,row.nas,row.siteName,row.site,row.nasIpAddress].flatMap(aliasesFor).filter(Boolean);
  const compatible=(left,right)=>{const a=nasValues(left),b=nasValues(right);return !a.length||!b.length||a.some(value=>b.includes(value));};
  for(const user of data.radiusUsers||[]){add(byName,clean(user.username),user);add(byCustomer,user.customerId,user);add(byUserId,user.id,user);}
  function userForCustomer(customer={}) {
    const explicit=unique([...(byCustomer.get(customer.id)||[]),...(byUserId.get(customer.radiusUserId)||[])]);
    if(explicit)return explicit;
    if((byCustomer.get(customer.id)||[]).length||(byUserId.get(customer.radiusUserId)||[]).length)return null;
    return unique((byName.get(clean(customer.username))||[]).filter(user=>compatible(customer,user)));
  }
  for(const customer of customers.values()){
    add(byCustomerName,clean(customer.username),customer);
    add(byCustomerUserId,customer.radiusUserId,customer);
    const user=userForCustomer(customer)||{};
    for(const value of [customer.genieAcsDeviceId,user.genieAcsDeviceId])add(byDevice,clean(value),customer);
    for(const value of [customer.genieAcsSerialNumber,user.genieAcsSerialNumber])add(bySerial,serial(value),customer);
  }
  function customerForUser(user={}) {
    if(user.customerId)return customers.get(user.customerId)||null;
    const explicit=byCustomerUserId.get(user.id)||[];
    return explicit.length?unique(explicit):unique((byCustomerName.get(clean(user.username))||[]).filter(customer=>compatible(customer,user)));
  }
  function customerForAcs(row={}) {
    const bound=[...(byDevice.get(clean(row.id))||[]),...(bySerial.get(serial(row.serialNumber||row.sn))||[])],explicit=unique(bound);
    const users=(byName.get(clean(row.username))||[]).filter(user=>compatible(user,row));
    const matched=unique([...users.map(customerForUser),...(users.length?[]:(byCustomerName.get(clean(row.username))||[]).filter(customer=>compatible(customer,row)))]);
    if(bound.length){if(!explicit||!compatible(userForCustomer(explicit)||explicit,row)||(matched&&matched.id!==explicit.id))return null;const user=userForCustomer(explicit);if(user?.username&&row.username&&clean(user.username)!==clean(row.username))return null;return explicit;}
    return matched;
  }
  function customerForSerial(value,nas={}) {
    const sn=serial(value),bound=bySerial.get(sn)||[];
    if(bound.length)return unique(bound.filter(customer=>compatible(userForCustomer(customer)||customer,nas)));
    const rows=observations.get(data)?.get(sn)||[],now=Date.now();
    return unique(rows.filter(row=>now-row.at<300000).map(row=>{const customer=customers.get(row.customerId),user=customer&&userForCustomer(customer);return customer&&compatible(user||customer,nas)&&(!user?.username||clean(user.username)===row.username)?customer:null;}));
  }
  function referencesAcs(row={}){return Boolean((byName.get(clean(row.username))||[]).length||(byCustomerName.get(clean(row.username))||[]).length||(byDevice.get(clean(row.id))||[]).length||(bySerial.get(serial(row.serialNumber||row.sn))||[]).length);}
  return {customerById:id=>customers.get(id)||null,userForCustomer,customerForAcs,customerForSerial,referencesAcs,aliasesFor,compatible};
}
function directory(data={}) {
  const old=directories.get(data),refs=[data.customers,data.radiusUsers,data.monitoringTargets,data.radiusNas];
  if(old&&old.revision===data.updatedAt&&old.refs.every((value,i)=>value===refs[i])&&Date.now()-old.at<1000)return old.value;
  const value=createDirectory(data);directories.set(data,{value,refs,revision:data.updatedAt,at:Date.now()});return value;
}
function invalidate(){directories=new WeakMap();}
function observeAcs(data,rows=[]){
  const identities=directory(data),entries=observations.get(data)||new Map();observations.set(data,entries);
  for(const row of rows){const customer=identities.customerForAcs(row),sn=serial(row.serialNumber||row.sn);if(!customer||!sn)continue;const prior=(entries.get(sn)||[]).filter(value=>Date.now()-value.at<300000&&value.customerId!==customer.id);prior.push({customerId:customer.id,username:clean(row.username),at:Date.now()});entries.set(sn,prior.slice(-4));}
  while(entries.size>5000)entries.delete(entries.keys().next().value);
}
function strictDeviceCandidate(rows=[],options={}) {
  const username=clean(options.username),ids=new Set((options.boundDeviceIds||[]).map(clean)),sns=new Set((options.boundSerialNumbers||[]).map(serial)),nas=(options.nasAliases||[]).map(clean).filter(Boolean);
  const candidates=[...new Map(rows.filter(row=>{
    const exact=username&&clean(row.username)===username,bound=ids.has(clean(row.id))||sns.has(serial(row.serialNumber));
    if(!exact&&!bound)return false;
    if(bound&&username&&row.username&&!exact)return false;
    const known=new Set((options.knownNasAliases||nas).map(clean));
    const rowNas=[row.nasId,row.nasName,row.nasIpAddress,...(row.tags||[]).filter(tag=>known.has(clean(tag)))].map(clean).filter(Boolean);
    return !nas.length||!rowNas.length||rowNas.some(value=>nas.includes(value));
  }).map(row=>[row.id,row])).values()];
  if(candidates.length<=1)return candidates[0]||null;
  const fresh=candidates.filter(row=>row.online===true);
  if(fresh.length===1)return fresh[0];
  const bound=(fresh.length?fresh:candidates).filter(row=>ids.has(clean(row.id))||sns.has(serial(row.serialNumber)));
  return unique(bound);
}
module.exports={directory,createDirectory,invalidate,observeAcs,serial,strictDeviceCandidate};
