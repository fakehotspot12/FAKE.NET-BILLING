'use strict';

// Read views are independent of write eligibility. Native mutations still use
// the strict parser and a new preflight; partial views never authorize writes.
const net=require('node:net'),pnp=require('./olt-zte-pnp'),tr=require('./olt-zte-tr069'),vendors=require('./olt-vendors');
const cache=new Map(),pending=new Map(),types=new Map(),acsCache=new Map(),acsPending=new Map();
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const get=(raw,command)=>raw.outputs?.find(row=>row.command===command)?.stdout||'';
const field=(text,label)=>String(text).replace(/\r/g,'').match(new RegExp('^[ \\t]*'+label+'[ \\t]*:[ \\t]*([^\\n]*)','im'))?.[1]?.trim()||'';
const validIp=value=>net.isIP(value)===4&&!/^(?:0|127|22[4-9]|23\d|24\d|25[0-5])\./.test(value);
const bounded=(map,max=64)=>{while(map.size>max)map.delete(map.keys().next().value);};
function identity(raw,value){
 const iface='gpon-onu_'+value.address,detail=get(raw,'show gpon onu detail-info '+iface),sn=field(detail,'Serial number').toUpperCase(),type=field(detail,'Type');
 if(field(detail,'ONU interface')!==iface||sn!==value.serialNumber||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(type))fail('SN atau posisi ONU berubah; baca ulang daftar ONU');
 const positions=require('./olt-zte-registration').bySerial(get(raw,'show gpon onu by sn '+value.serialNumber),value.serialNumber);if(positions.length!==1||positions[0]!==value.address)fail('Posisi SN ONU belum tunggal');
 return{type,status:field(detail,'Phase state'),configState:field(detail,'Config state')};
}
function hostRows(text){
 const blocks=String(text||'').replace(/\r/g,'').split(/(?:^|\n)[ \t]*Host\s+ID\s*:\s*/i).slice(1),rows=[];
 for(const block of blocks){const id=Number(block.split('\n')[0].trim());if(!Number.isSafeInteger(id)||id<1||id>127||rows.some(row=>row.id===id))fail('Indeks IP Host tidak lengkap atau ganda');
  const take=(...labels)=>labels.map(label=>field(block,label)).find(Boolean)||'',ip=take('Current IP address'),configuredIp=take('IP addres','IP address'),dhcp=take('DHCP enable').toLowerCase();
  const row={id,dhcp:['enable','disable'].includes(dhcp)?dhcp:'unknown',ip:net.isIP(ip)===4?ip:null,configuredIp:net.isIP(configuredIp)===4?configuredIp:null,available:['enable','disable'].includes(dhcp)&&net.isIP(ip)===4&&net.isIP(configuredIp)===4};
  for(const[key,labels]of Object.entries({mask:['Current mask','Current subnet mask'],gateway:['Current gateway','Current default gateway'],dns1:['Current primary DNS','Current primary DNS server'],dns2:['Current second DNS','Current secondary DNS','Current secondary DNS server']})){const value=take(...labels);if(net.isIP(value)===4)row[key]=value;}
  const mac=take('MAC address').replace(/[^a-f0-9]/gi,'').toUpperCase();if(/^[A-F0-9]{12}$/.test(mac)&&!/^0{12}$/.test(mac))row.mac=mac;
  rows.push(row);
 }return rows;
}
function graph(raw,value,meta,issues){
 const iface='gpon-onu_'+value.address,text=get(raw,'show running-config interface '+iface),cap=get(raw,'show gpon remote-onu capability '+iface),tcont=[],gems=[],services=[];
 let lines=[];try{lines=tr.lines(text,'interface '+iface);}catch{issues.push('Konfigurasi layanan belum lengkap');}
 for(const line of lines){let m;
  if((m=line.match(/^tcont (\d+)(?: name \S+)? profile (\S+)$/)))tcont.push({id:Number(m[1]),profile:m[2]});
  else if((m=line.match(/^gemport (\d+)(?: name \S+)?(?: unicast)? tcont (\d+)$/)))gems.push({id:Number(m[1]),tcont:Number(m[2])});
  else if((m=line.match(/^gemport (\d+) traffic-limit downstream (\S+)$/))){const gem=gems.find(row=>row.id===Number(m[1]));if(gem)gem.downstream=m[2];}
  else if((m=line.match(/^service-port (\d+) vport (\d+) user-vlan (\d+) vlan (\d+)(.*)$/))){services.push({id:Number(m[1]),gem:Number(m[2]),userVlan:Number(m[3]),vlan:Number(m[4]),...(m[5]?{advanced:true}:{})});if(m[5])issues.push('Pemetaan layanan lanjutan ditampilkan untuk pemeriksaan');}
  else if(/^(?:tcont|gemport|service-port)\b/.test(line))issues.push('Konfigurasi layanan existing memiliki parameter lanjutan');
 }
 const count=label=>{const n=Number(field(cap,label));return Number.isSafeInteger(n)&&n>0&&n<=4096?n:0;};
 return{address:value.address,serialNumber:value.serialNumber,...meta,limits:{tcont:count('T-CONT number'),gem:count('GEM port number')},tcont,gems,services};
}
function serviceRows(text,value){
 const source=String(text||'').replace(/\r/g,''),total=Number(source.match(/Sport total number:\s*(\d+)/)?.[1]);
 if(!new RegExp('^Interface gpon-onu_'+value.address+'[ \t]*$','m').test(source)||!Number.isSafeInteger(total)||total<0||total>128)return null;
 const rows=[];for(const line of source.split('\n')){const cols=line.trim().split(/\s+/);if(!/^\d+$/.test(cols[0])||cols.length<12)continue;const [id,gem,begin,end]=cols.slice(0,4).map(Number),vlan=Number(cols[8]);if(![id,gem,begin,end,vlan].every(Number.isSafeInteger)||id<1||gem<1||begin<2||end>4094||vlan<2||vlan>4094)return null;rows.push({id,gem,userVlan:begin,vlan,...(begin!==end||cols.slice(4,8).some(x=>x!=='--')?{advanced:true}:{})});}
 if(rows.length!==total||new Set(rows.map(x=>x.id)).size!==total)return null;return rows;
}
function parse(raw,value){
 const meta=identity(raw,value),issues=[],iface='gpon-onu_'+value.address;
 let strict;try{strict=tr.inspect(raw,{...value,type:meta.type});}catch(error){issues.push(error.message);}
 let management=[];try{management=tr.managementLines(get(raw,'show onu running config '+iface),'pon-onu-mng '+iface);}catch{try{management=tr.lines(get(raw,'show onu running config '+iface),'pon-onu-mng '+iface);}catch{}issues.push('Sebagian pengaturan manajemen existing hanya dapat dilihat');}
 let hosts=[];try{hosts=hostRows(get(raw,'show gpon remote-onu ip-host '+iface));}catch{issues.push('Tabel IP Host belum lengkap; periksa ulang.');}if(!hosts.length)issues.push('OLT belum mengirim tabel IP Host; layanan yang terbaca tetap ditampilkan');
 const cap=get(raw,'show gpon remote-onu capability '+iface),count=label=>{const n=Number(field(cap,label));return Number.isSafeInteger(n)&&n>0&&n<=255?n:0;};
 const unit=strict?.unit||graph(raw,value,meta,issues),ports=serviceRows(get(raw,'show service-port interface '+iface),value);if(ports&&JSON.stringify(ports)!==JSON.stringify(unit.services)){unit.services=ports;strict=null;issues.push('Pemetaan VLAN dibaca dari tabel service-port OLT; editor menunggu verifikasi konfigurasi lengkap.');}const state={...(strict||{}),unit,management,hosts,capabilities:strict?.capabilities||{ipHosts:count('IP host number'),veips:count('VEIP number')},writeVerified:!!strict,readIssues:[...new Set(issues)],checkedAt:new Date().toISOString()};
 return state;
}
async function run(data,device,commands,options){
 const[,context,transport]=await vendors.loadLibrary();return context.withContext(data,device,()=>transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands,timeoutMs:18000}),{...(options.transportOptions||{}),cliQueue:true,timeoutMs:20000,allowZteDevRead:options.explicitDevAccess===true});
}
async function read(data,device,actor,input,options={}){
 pnp.check(data,device,actor,{readOnly:true});const value=require('./olt-zte-acs').target(input),key=pnp.signature(device)+':'+value.address+':'+value.serialNumber,old=cache.get(key);
 if(pending.has(key))return structuredClone(await pending.get(key));if(!input.force&&old&&Date.now()-old.at<15000)return structuredClone(old.state);
 if(pending.size>=8)fail('Antrean pembacaan ONU penuh. Coba kembali sebentar.',429);
 const task=require('./olt-zte-registration').managementOperation(data,device,actor,async()=>{
  let type=types.get(key);const iface='gpon-onu_'+value.address;
  if(!type){const raw=await run(data,device,['enable','terminal length 0','show gpon onu by sn '+value.serialNumber,'show gpon onu detail-info '+iface],options);type=identity(raw,value).type;types.set(key,type);bounded(types);}
  const commands=['enable','terminal length 0','show gpon onu by sn '+value.serialNumber,'show gpon onu detail-info '+iface,'show running-config interface '+iface,'show onu running config '+iface,'show gpon remote-onu ip-host '+iface,'show service-port interface '+iface,'show gpon remote-onu capability '+iface,'show onu-type gpon '+type,'show version-running','show vlan 100'];
  const raw=await run(data,device,commands,options),state=parse(raw,value);types.set(key,state.unit.type);cache.set(key,{state,at:Date.now()});bounded(cache);return state;
 },{invalidate:false,readOnly:true});pending.set(key,task);
 try{return structuredClone(await task);}finally{pending.delete(key);}
}
function correlate(state,rows=[]){
 const hosts=structuredClone(state.hosts),wans=rows.filter(row=>validIp(row.ip));
 for(const host of hosts){const own=state.management.map(line=>line.match(new RegExp('^vlan-filter iphost '+host.id+' pri [0-7] vlan (\\d+)$'))).filter(Boolean),vlan=own.length===1?Number(own[0][1]):null;
  const matching=wans.filter(row=>vlan!==null&&row.vlan===vlan&&row.fresh),other=wans.filter(row=>row.fresh&&row.ip===host.ip&&vlan!==null&&row.vlan!==null&&row.vlan!==vlan);
  host.reportedIp=host.ip;host.displayIp=validIp(host.ip)?host.ip:null;host.ipSource=host.displayIp?'olt-omci':'unreported';host.ipNote='';
  if(matching.length===1){host.displayIp=matching[0].ip;host.ipSource='acs-wan';host.ipCheckedAt=matching[0].checkedAt;host.ipNote='IP WAN VLAN '+vlan+' dari ACS, SN perangkat cocok.';}
  else if(other.length){host.displayIp=null;host.ipSource='different-wan';host.ipNote='Alamat yang dilaporkan OLT cocok dengan WAN VLAN '+[...new Set(other.map(row=>row.vlan))].join(', ')+', bukan bukti IP DHCP VLAN '+vlan+'.';}
  else if(!host.displayIp){host.ipNote=host.mac?'OLT belum melaporkan IP aktif; lease DHCP belum terverifikasi.':'IP Host/MAC belum dilaporkan ONU melalui OMCI; status DHCP belum terverifikasi.';}
  if(!own.length&&host.dhcp==='disable')host.ipNote=host.displayIp?'IP dilaporkan tanpa binding VLAN; host tidak dianggap kosong.':host.ipNote;
 }return hosts;
}
async function wanSources(settings,serialNumber,force=false){
 const genie=require('./genieacs');if(!genie.configured(genie.normalizeSettings(settings)))return[];
 const key=require('node:crypto').createHash('sha256').update(JSON.stringify(genie.normalizeSettings(settings))).digest('hex')+':'+serialNumber,old=acsCache.get(key);if(!force&&old&&Date.now()-old.at<15000)return structuredClone(old.rows);if(acsPending.has(key))try{return structuredClone(await acsPending.get(key));}catch{return[];}
 const task=(async()=>{const rows=await genie.onuWanAddresses(settings,serialNumber);acsCache.set(key,{rows,at:Date.now()});bounded(acsCache);return rows;})();acsPending.set(key,task);try{return structuredClone(await task);}catch{return[];}finally{acsPending.delete(key);}
}
function invalidate(device){const prefix=pnp.signature(device)+':';for(const key of cache.keys())if(key.startsWith(prefix))cache.delete(key);}
module.exports={invalidate,read,parse,serviceRows,hostRows,identity,correlate,wanSources};
