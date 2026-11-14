'use strict';
const olt=require('./olt-monitor');
const identity=require('./network-identity');
const indexes=new Map();
function indexFor(device,snapshot) {
  const old=indexes.get(device.id);if(old?.snapshot===snapshot&&old.revision===device.updatedAt)return old;
  const serials=new Map(),customerSerials=new Map();
  for(const onu of snapshot.onus||[]){const sn=olt.normalizeSerial(onu.serialNumber);if(sn)serials.set(sn,serials.has(sn)?null:onu);}
  for(const [sn,link]of Object.entries(device.links||{}))if(link.customerId){if(!customerSerials.has(link.customerId))customerSerials.set(link.customerId,[]);customerSerials.get(link.customerId).push(olt.normalizeSerial(sn));}
  const value={snapshot,revision:device.updatedAt,serials,customerSerials};indexes.set(device.id,value);while(indexes.size>64)indexes.delete(indexes.keys().next().value);return value;
}
async function modemStatus(data,customer,acs = {},nasIds = [],now = Date.now()) {
  const user=identity.directory(data).userForCustomer(customer)||{};
  const serial=olt.normalizeSerial(acs?.serialNumber||acs?.sn||customer.genieAcsSerialNumber||user.genieAcsSerialNumber||''),candidates=[];
  for(const device of olt.deviceRows(data).filter(device=>device.enabled&&(!nasIds.length||nasIds.includes(device.nasId)))){
    const snapshot=await olt.snapshotFor(device);if(!snapshot)continue;const index=indexFor(device,snapshot);
    const sns=serial?[serial]:index.customerSerials.get(customer.id)||[];
    for(const sn of new Set(sns)){const onu=index.serials.get(sn);if(onu)candidates.push({snapshot,onu});}
  }
  if(candidates.length===1){const {snapshot,onu}=candidates[0],age=now-Date.parse(snapshot.checkedAt||'');
    if(snapshot.status==='online'&&!snapshot.stale&&!snapshot.pendingRefresh&&Number.isFinite(age)&&age>=-30000&&age<=olt.CACHE_MS*2){
      if(onu.status==='online')return {code:'online',label:'Modem terhubung',hint:'Koneksi modem terpantau aktif.',checkedAt:snapshot.checkedAt,source:'olt'};
      if(onu.status==='offline'&&onu.causeKnown===true&&onu.condition==='los')return {code:'los',label:'Sinyal fiber terputus',hint:'Modem tidak menerima sinyal internet dari kabel fiber. Silakan laporkan jika masih bermasalah.',checkedAt:snapshot.checkedAt,source:'olt'};
      if(onu.status==='offline'&&onu.causeKnown===true&&onu.condition==='dying-gasp')return {code:'power',label:'Modem kehilangan daya',hint:'Modem terakhir melaporkan listrik atau daya terputus. Periksa listrik dan adaptor modem.',checkedAt:snapshot.checkedAt,source:'olt'};
      if(onu.status==='offline')return {code:'offline',label:'Modem belum terhubung',hint:'Penyebab koneksi terputus belum diketahui.',checkedAt:snapshot.checkedAt,source:'olt'};
    }
    const fallback=acsStatus(acs);if(fallback)return fallback;
    return {code:'unknown',label:'Status belum diperbarui',hint:'Informasi modem terakhir belum tersedia. Silakan muat ulang beberapa saat lagi.',checkedAt:snapshot.checkedAt||'',source:'olt'};
  }
  const fallback=acsStatus(acs);if(fallback)return fallback;
  return {code:'unknown',label:'Status belum tersedia',hint:'Data modem belum dapat dicocokkan.',source:''};
}
function acsStatus(acs) {
  if(!acs?.id)return null;
  return {code:acs.online?'online':'offline',label:acs.online?'Modem terhubung':'Modem belum terhubung',hint:acs.online?'Modem terpantau aktif melalui ACS.':'Belum ada informasi penyebab koneksi terputus.',source:'acs',...(acs.lastInform?{checkedAt:acs.lastInform}:{})};
}
module.exports={modemStatus};
