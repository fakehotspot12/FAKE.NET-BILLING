'use strict';

const clean=value=>String(value||'').trim();
function addressFromTags(data,modem,selected=''){
  if(!modem)return '';
  const reserved=new Set([...(data.radiusNas||[]),...(data.monitoringTargets||[])].flatMap(row=>[row.id,row.name,row.host,row.address,row.site,...(row.aliases||[])]).filter(Boolean).map(value=>clean(value).toLowerCase()));
  for(const value of [modem.username,modem.serialNumber,modem.productClass])if(value)reserved.add(clean(value).toLowerCase());
  const tags=[...new Set((Array.isArray(modem.tags)?modem.tags:[]).filter(value=>typeof value==='string').map(clean))].filter(value=>value&&value.length<=500&&!/[\x00-\x1f\x7f<>]/.test(value)&&!reserved.has(value.toLowerCase()));
  const candidates=tags.filter(value=>value===selected||/^alamat\s*:/i.test(value)||/\b(?:jl\.?|jalan|gg\.?|gang|rt\.?\s*\d|rw\.?\s*\d|perum(?:ahan)?|komplek(?:s)?|dusun|desa|kelurahan|kecamatan|blok)\b/i.test(value));
  const chosen=selected?candidates.find(value=>value===selected):candidates.length===1?candidates[0]:'';
  return clean(chosen).replace(/^(?:alamat\s*:\s*)+/i,'').trim();
}
module.exports={addressFromTags};
