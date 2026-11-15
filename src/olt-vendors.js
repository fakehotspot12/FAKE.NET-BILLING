'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
const PROFILES=Object.freeze([
  {value:'cdata',label:'CDATA GPON',inventory:'native',writes:true},
  {value:'tarmoc',label:'Tarmoc',inventory:'adapter',writes:false},
  {value:'hsgq',label:'HSGQ GPON / EPON',inventory:'adapter',writes:false},
  {value:'hioso',label:'HIOSO EPON',inventory:'adapter',writes:false},
  {value:'btpon',label:'BTPON',inventory:'adapter',writes:false},
  {value:'zte',label:'ZTE',inventory:'basic',writes:false},
  {value:'huawei',label:'Huawei',inventory:'basic',writes:false},
  {value:'vsol',label:'VSOL',inventory:'basic',writes:false},
  {value:'bdcom',label:'BDCOM / Baudcom',inventory:'basic',writes:false},
  {value:'fiberhome',label:'FiberHome',inventory:'basic',writes:false}
]);
const aliases={'c-data':'cdata',cdata:'cdata',baudcom:'bdcom','v-sol':'vsol','hsgq-e':'hsgq','hsgq-g':'hsgq','fiber-home':'fiberhome'};
function normalize(value='cdata'){const key=String(value||'cdata').trim().toLowerCase().replace(/[_\s]+/g,'-');return aliases[key]||key;}
function profile(value){return PROFILES.find(row=>row.value===normalize(value));}
function canWrite(device){return profile(device.vendor)?.writes===true&&(device.cliProtocol||'telnet')==='telnet';}
function capabilities(device,snapshot){
  const configured=Boolean(device.enabled&&device.cliEnabled&&device.cliPasswordEnc),native=canWrite(device),hioso=normalize(device.vendor)==='hioso'?snapshot?.hiosoActions||{}:{};
  return{rename:configured&&(native||hioso.rename===true),reboot:configured&&(native||hioso.reboot===true),delete:configured&&(native||hioso.delete===true),saveConfig:configured&&(native||hioso.saveConfig===true)};
}
function options(){return PROFILES.map(row=>({...row,mode:row.writes?'verified':'read-only',note:row.writes?'Jalur CDATA terverifikasi':row.inventory==='basic'?'Monitoring SNMP dasar; inventory dan aksi ONU belum terverifikasi':'Monitoring ONU baca-saja; aksi tulis belum terverifikasi'}));}
let library;
async function loadLibrary(){if(!library)library=Promise.all(['adapters/index.js','services/context.js','services/olt-transport.js'].map(file=>import(pathToFileURL(path.join(__dirname,'olt-vendor-library',file)).href))).catch(error=>{library=null;throw error;});return library;}
function legacyDevice(device){return{id:device.id,name:device.name,vendor:device.vendor,host:device.host,port:device.cliPort||23,protocol:device.cliProtocol||'telnet',username:device.cliUsername,password_encrypted:device.cliPasswordEnc,snmp_port:device.port||161,snmp_version:'2c',snmp_community_ro_encrypted:device.communityEnc,web_port:device.webPort||80,web_username:device.cliUsername,web_password_encrypted:device.cliPasswordEnc};}
function text(value,max=160){return String(value||'').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,max);}
function metric(value,min,max){if(value===undefined||value===null||value==='')return null;const match=String(value).match(/^\s*(-?\d+(?:\.\d+)?)(?:\s*(?:dBm|m))?\s*$/i);if(!match)return null;const number=Number(match[1]);return Number.isFinite(number)&&number>=min&&number<=max?number:null;}
function normalizeOnus(rows,helpers={}){
  const output=[];for(const row of rows.slice(0,8192)){
    if(!row||/^unregistered|autofind|discovered$/i.test(String(row.status||'')))continue;
    const raw=String(row.sn||row.serialNumber||row.mac||'').trim().toUpperCase(),isMac=/^(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/.test(raw)||/^[0-9A-F]{12}$/.test(raw),sn=isMac?raw.replace(/[:-]/g,''):helpers.normalizeSerial?.(raw)||raw;
    if(!/^[A-Z0-9]{12}$/.test(sn))continue;
    const slot=Number(row.slot),pon=Number(row.pon),onuId=Number(row.onu_id),address=[slot,pon,onuId].every(Number.isSafeInteger)&&slot>=0&&slot<=31&&pon>=1&&pon<=16&&onuId>=1&&onuId<=1024;
    if(!address)continue;
    const state=String(row.status||'').toLowerCase(),status=['online','up','working'].includes(state)?'online':['offline','down'].includes(state)?'offline':'unknown',cause=text(row.down_cause,160),condition=status==='offline'?(helpers.classifyCause?.(cause)||'other'):status;
    output.push({id:`${slot}/${pon}:${onuId}:${sn}`,serialNumber:sn,identifierKind:isMac?'mac':'serial',slot,pon,onuId,ponKey:`0/${slot}/${pon}`,name:text(row.description||row.name),model:text(row.equipment_id||row.model,80),status,condition,downCause:status==='offline'?cause:'',causeKnown:status==='offline'&&Boolean(cause)&&condition!=='other',rxPower:metric(row.rx_power,-60,10),txPower:metric(row.tx_power,-60,20),distance:metric(row.distance,0,100000),source:'vendor-live-read'});
  }
  const exact=new Map();for(const row of output){const previous=exact.get(row.id);if(previous&&(previous.status!==row.status||previous.downCause!==row.downCause))exact.set(row.id,{...previous,status:'unknown',condition:'unknown',downCause:'',causeKnown:false});else if(!previous)exact.set(row.id,row);}return [...exact.values()];
}
function ponPosition(name, vendor) {
  const value=String(name||'').trim();
  const full=value.match(/^(?:xgpon|gpon|epon)\s+(0)\/(\d+)\/(\d+)$/i);
  const compact=value.match(/^(?:xgpon|gpon|epon)\s+(0)\/(\d+)$/i);
  const hioso=normalize(vendor)==='hioso'&&value.match(/^Pon-Nni\s*(\d+)$/i);
  const slot=full?Number(full[2]):1,pon=full?Number(full[3]):compact?Number(compact[2]):hioso?Number(hioso[1]):0;
  return slot<=31&&pon>=1&&pon<=16?{slot,pon,ponKey:`0/${slot}/${pon}`}:null;
}
function monitoringPorts(device, interfaces, inventory={}) {
  const vendor=normalize(device.vendor),ports=[],seen=new Map();
  for(const row of interfaces){
    const position=ponPosition(row.name,vendor);
    const port={...row,kind:position?'pon':'uplink',ponKey:position?.ponKey||''};
    if(!position){ports.push(port);continue;}
    const previous=seen.get(position.ponKey);
    if(previous){if(previous.status!==port.status)previous.status='unknown';continue;}
    seen.set(position.ponKey,port);ports.push(port);
  }
  if(vendor!=='hioso')return{ports,modelLabel:'',warning:''};
  const physical=[...seen.keys()],reported=inventory.ponNumbers||[],observed=(inventory.rows||[]).map(row=>row.ponKey);
  for(const key of [...reported.map(pon=>`0/1/${pon}`),...observed]){
    if(!/^0\/(?:[0-9]|[12][0-9]|3[01])\/(?:[1-9]|1[0-6])$/.test(key)||seen.has(key))continue;
    const port={id:`hioso:${key}`,name:`epon ${key}`,kind:'pon',ponKey:key,status:'unknown'};seen.set(key,port);ports.push(port);
  }
  // ONU positions alone cannot distinguish a partly populated 4-PON OLT from a 2-PON OLT.
  const authoritative=(reported.length?reported.map(pon=>`0/1/${pon}`):physical).slice().sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const count=authoritative.length,complete=[2,4].includes(count)&&authoritative.every((key,index)=>key===`0/1/${index+1}`);
  const conflict=reported.length&&physical.length&&physical.some(key=>!authoritative.includes(key))||complete&&[...seen.keys()].some(key=>!authoritative.includes(key));
  ports.sort((a,b)=>a.kind===b.kind?a.ponKey.localeCompare(b.ponKey,undefined,{numeric:true}):a.kind==='pon'?-1:1);
  return{ports,modelLabel:complete&&!conflict?`HIOSO ${count} PON`:'',warning:conflict?'Daftar port PON berbeda antar sumber; identitas model belum dipastikan.':!complete?'Jumlah port fisik HIOSO belum terverifikasi; posisi ONU yang terbaca tetap ditampilkan.':''};
}
async function readInventory(data,device,helpers={},transportOptions={}){
  const cfg=profile(device.vendor);if(!cfg||cfg.inventory==='basic')return {available:false,rows:[],warning:'Inventory ONU belum terverifikasi untuk model ini. Monitoring SNMP dasar tetap aktif; aksi tulis terkunci.'};
  if(!device.cliEnabled||!device.cliPasswordEnc)return {available:false,rows:[],warning:'Aktifkan akses CLI baca untuk melengkapi inventory ONU. Aksi tulis tetap terkunci.'};
  const[factory,context]=await loadLibrary();
  return context.withContext(data,device,async()=>{
    const adapter=factory.createOltAdapter(legacyDevice(device));
    // Bulk optical enrichers can issue dozens of per-ONU commands; keep them off page/background reads.
    adapter.getBulkOnuDetails=async rows=>rows;
    if(cfg.value==='btpon'){
      const snmp=await import('./olt-vendor-library/services/snmp.js');
      adapter.readOnuOperStatusMap=async(items=[])=>{
        const oid='.1.3.6.1.2.1.2.2.1.8',legacy=legacyDevice(device),descriptions=await snmp.snmpWalk({olt:legacy,oid:'.1.3.6.1.2.1.2.2.1.2'}),statuses=await snmp.snmpWalk({olt:legacy,oid}),positions=adapter.parseIfDescrOnuMap(descriptions),result=new Map();
        for(const item of items){const key=`${Number(item.pon)}:${Number(item.onu_id)}`,position=positions.get(key),value=position&&snmp.parseSnmpInteger(statuses?.get(oid+'.'+position.ifIndex));if(value===1||value===2)result.set(key,{ifIndex:position.ifIndex,if_oper_status:value,status:value===1?'online':'offline',down_cause:null,down_cause_label:null,description:position.description||item.description||null});}
        return result;
      };
      adapter.enrichOnuStatuses=async(items=[])=>{const statuses=await adapter.readOnuOperStatusMap(items);return items.map(item=>{const status=statuses.get(`${Number(item.pon)}:${Number(item.onu_id)}`);return{...item,status:status?.status||'unknown',description:status?.description||item.description,down_cause:null,down_cause_label:null};});};
    }
    let rows,ponNumbers=[],ponSource='',hiosoActions={};
    if(cfg.value==='hioso'){
      const result=await adapter.readInventory();rows=result.items;
      hiosoActions=await require('./olt-hioso').probe(adapter,rows);
      if(result.source==='web-hioso'){
        try{
          const response=await adapter.fetchWebPath('/oltPonPortStatusPonList.asp');
          if(response.ok){ponNumbers=[...new Set(adapter.parseWebPonList(await response.text()).map(value=>Number(value.split('/').at(-1))).filter(value=>Number.isSafeInteger(value)&&value>=1&&value<=16))].sort((a,b)=>a-b);ponSource=ponNumbers.length?'web-hioso':'';}
        }catch{}
      }else{
        const counts=[...new Set((result.olt_rows||[]).map(row=>Number(row.pon_count)))];
        if(counts.length===1&&[2,4].includes(counts[0])){ponNumbers=Array.from({length:counts[0]},(_,index)=>index+1);ponSource='cli-hioso';}
      }
    }
    else if(cfg.value==='tarmoc')rows=await adapter.readWebOnuStatus();
    else rows=(await adapter.getDashboardStats())?.registered_onus;
    if(!Array.isArray(rows)||!rows.length)return {available:false,rows:[],warning:'Inventory ONU belum dapat diverifikasi; bukan berarti tidak ada ONU.'};
    const normalized=normalizeOnus(rows,helpers);return normalized.length?{available:true,rows:normalized,ponNumbers,ponSource,hiosoActions}:{available:false,rows:[],warning:'Format identitas/posisi ONU belum terverifikasi untuk firmware ini.'};
  },transportOptions);
}
async function testConnection(data,device,transportOptions={}){
  const[,context,transport]=await loadLibrary();return context.withContext(data,device,async()=>{
    const olt=legacyDevice(device),command=['huawei','tarmoc'].includes(normalize(device.vendor))?'display version':'show version';const result=await transport.executeOltCommands({olt,password:context.decryptSecret(device.cliPasswordEnc),commands:['enable',command]});if(!result.success)throw new Error('Koneksi CLI vendor belum terverifikasi');return result;
  },transportOptions);
}
module.exports={PROFILES,normalize,profile,options,canWrite,capabilities,loadLibrary,legacyDevice,normalizeOnus,ponPosition,monitoringPorts,readInventory,testConnection};
