'use strict';

const {pathToFileURL}=require('node:url');
const path=require('node:path');
const busy=new Set(),attempts=new Map(),capabilityCache=new Map();
function fail(message,status=409){const error=new Error(message);error.status=status;return error;}
function position(value){
  const match=String(value||'').match(/^(\d+)\/(\d+):(\d+):([A-F0-9]{12})$/);
  if(!match)return null;
  const slot=Number(match[1]),pon=Number(match[2]),onuId=Number(match[3]);
  return slot<=31&&pon>=1&&pon<=16&&onuId>=1&&onuId<=1024?{slot,pon,onuId,ponKey:`0/${slot}/${pon}`,serialNumber:match[4],identifierKind:'mac'}:null;
}
function formCapabilities(html){
  const form=String(html).match(/<form\b[^>]*\baction\s*=\s*["']?\/goform\/setOnu(?=["'\s>])[^>]*>/i)?.[0]||'';
  const select=String(html).match(/<select\b[^>]*\bname\s*=\s*["']?onuOperation(?=["'\s>])[^>]*>([\s\S]*?)<\/select>/i)?.[1]||'';
  const operations=[...select.matchAll(/<option\b[^>]*\bvalue\s*=\s*["']?([A-Za-z]+)["'\s>]/gi)].map(row=>row[1]);
  const valid=/\bmethod\s*=\s*["']?post["'\s>]/i.test(form)&&/<input\b[^>]*\bname\s*=\s*["']?onuId["'\s>]/i.test(html)&&/<input\b[^>]*\bname\s*=\s*["']?onuName["'\s>]/i.test(html);
  return{rename:valid&&operations.includes('nonOp'),reboot:valid&&operations.includes('rebootOp'),delete:false};
}
async function deleteCapability(adapter,target){
  const pon=target.snmp_onu_index.split(':')[0],response=await adapter.fetchWebPath('/onuDeleteOnuList.asp?oltponno='+encodeURIComponent(pon));if(!response.ok)return false;
  const html=await response.text(),form=html.match(/<form\b[^>]*\baction\s*=\s*["']?\/goform\/deleteOnu(?=["'\s>])[^>]*>([\s\S]*?)<\/form>/i);
  return Boolean(form&&/\bmethod\s*=\s*["']?post(?=["'\s>])/i.test(form[0])&&/<input\b[^>]*\bname\s*=\s*["']?onuId(?=["'\s>])/i.test(form[1]));
}
async function details(adapter,target){
  const address=target.snmp_onu_index,response=await adapter.fetchWebPath('/onuConfig.asp?onuno='+encodeURIComponent(address));
  if(!response.ok)throw fail('Detail web ONU HIOSO belum dapat dibaca',502);
  const html=await response.text(),current=adapter.parseWebOnuConfig(html);
  if(!current||current.sn!==target.sn||current.address!==address)throw fail('MAC atau posisi ONU HIOSO berubah. Segarkan data dahulu.');
  return{...current,actions:formCapabilities(html)};
}
async function probe(adapter,items){
  const target=items.find(row=>row.status==='online')||items[0];
  if(!target?.snmp_onu_index)return{};
  const key=JSON.stringify([adapter.olt.host,adapter.olt.web_port,adapter.olt.username,adapter.olt.password_encrypted]),cached=capabilityCache.get(key);if(cached?.until>Date.now())return cached.actions;
  let actions={};try{actions=(await details(adapter,target)).actions;try{actions.delete=await deleteCapability(adapter,target);}catch{actions.delete=false;}}catch{}
  capabilityCache.set(key,{actions,until:Date.now()+(actions.rename&&actions.reboot&&actions.delete?3600000:60000)});while(capabilityCache.size>64)capabilityCache.delete(capabilityCache.keys().next().value);return actions;
}
async function inventory(adapter){
  const response=await adapter.fetchWebPath('/onuAllPonOnuList.asp');
  if(!response.ok)throw fail('Inventory web HIOSO belum tersedia',502);
  const html=await adapter.readWebResponseText(response),body=adapter.extractJavascriptArrayBody(html,'onutable');
  if(body===null)throw fail('Inventory HIOSO belum lengkap; tidak dianggap kosong',502);
  const values=adapter.parseJavascriptArrayValues(body),rows=adapter.parseWebOnuList(html);
  if(values.length&&(!rows.length||rows.length*adapter.detectWebOnuRowLength(html,values)!==values.length))throw fail('Format inventory HIOSO belum terverifikasi',502);
  return rows;
}
async function run(data,device,onu,action,payload={},options={}){
  if(device.vendor!=='hioso'||!device.enabled||!device.cliEnabled||!device.cliUsername||!device.cliPasswordEnc)throw fail('Akses web HIOSO belum dikonfigurasi',400);
  const address=position(onu.id);
  if(!address||address.serialNumber!==onu.serialNumber||!['inspect','rename','reboot','delete'].includes(action))throw fail('Posisi dan MAC ONU HIOSO tidak cocok',400);
  const key=device.id+':'+onu.id,now=Date.now();for(const[key,at]of attempts)if(now-at>60000)attempts.delete(key);
  if(busy.has(device.id)||busy.size>=2)throw fail('Aksi HIOSO sedang berjalan. Tunggu hasilnya.',429);
  if(action!=='inspect'&&now-(attempts.get(key)||0)<(action==='rename'?5000:60000))throw fail('Perintah baru saja dikirim. Periksa hasil sebelum mengulang.',429);
  busy.add(device.id);
  try{
    const vendors=require('./olt-vendors'),[,context]=await vendors.loadLibrary(),{HiosoAdapter}=await import(pathToFileURL(path.join(__dirname,'olt-vendor-library/adapters/hioso.adapter.js')).href);
    return await context.withContext(data,device,async()=>{
      const adapter=new HiosoAdapter(vendors.legacyDevice(device)),rows=await inventory(adapter),matches=rows.filter(row=>Number(row.slot)===address.slot&&Number(row.pon)===address.pon&&Number(row.onu_id)===address.onuId);
      if(!matches.length){if(action==='inspect')return{state:'missing'};if(action==='delete')return{deleteConfirmed:true,alreadyAbsent:true};throw fail('ONU tidak terdaftar pada posisi yang dipilih');}
      const target=matches[0];
      if(matches.length!==1||target.sn!==onu.serialNumber||rows.filter(row=>row.sn===target.sn).length!==1)throw fail('Identitas ONU HIOSO ambigu atau berubah. Aksi dibatalkan.');
      const current=await details(adapter,target);
      if(action==='delete'||action==='inspect')current.actions.delete=await deleteCapability(adapter,target);
      if(action==='inspect')return{state:current.status===target.status?current.status:'unknown',description:current.raw_name,actions:current.actions};
      if(!current.actions[action])throw fail('Form web firmware HIOSO belum mendukung aksi ini',400);
      if(action==='delete'&&(current.status!=='offline'||target.status!=='offline'))throw fail('ONU HIOSO harus offline terverifikasi sebelum dihapus');
      if(action==='reboot'&&(current.status!=='online'||target.status!=='online'))throw fail('ONU HIOSO belum online terverifikasi untuk reboot');
      const name=action==='rename'?require('./olt-cli').description(payload.description):current.raw_name;
      if(action!=='delete'&&(!name||name.length>30))throw fail('Nama ONU HIOSO harus 1-30 karakter',400);
      if(action==='rename'&&payload.previousDescription!==current.raw_name)throw fail('Nama asli ONU berubah. Buka ulang sebelum menyimpan.');
      if(action==='rename'&&name===current.raw_name)return{description:name,descriptionConfirmed:true};
      const operation=action==='delete'?'delete':action==='reboot'?'rebootOp':'nonOp';
      context.authorizeHiosoOperation({address:target.snmp_onu_index,operation,name});
      attempts.set(key,Date.now());while(attempts.size>512)attempts.delete(attempts.keys().next().value);
      let submissionError;
      try{if(action==='delete')await adapter.submitWebOnuDelete(target);else await adapter.submitWebOnuOperation({onu:target,name,operation});}catch(error){submissionError=error;}
      // A lost HTTP acknowledgement must never trigger a second mutation.
      if(action==='reboot'){if(submissionError)throw fail('Hasil pengiriman reboot belum pasti. Periksa status perangkat sebelum mengulang.',502);return{submitted:true,confirmed:false};}
      if(action==='rename'){
        const after=await details(adapter,target);
        if(after.raw_name!==name)throw fail('Perintah dikirim tetapi nama ONU belum terverifikasi. Periksa ulang, jangan kirim ulang otomatis.',502);
        return{description:name,descriptionConfirmed:true};
      }
      const after=await inventory(adapter),stillPresent=after.some(row=>Number(row.slot)===address.slot&&Number(row.pon)===address.pon&&Number(row.onu_id)===address.onuId);
      return{deleteConfirmed:!stillPresent,alreadyAbsent:false};
    },{...options,hiosoActionAllowed:true});
  }finally{busy.delete(device.id);}
}
module.exports={position,formCapabilities,probe,run};
