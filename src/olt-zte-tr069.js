'use strict';

const crypto=require('node:crypto'),net=require('node:net'),profiles=require('./olt-zte-profiles');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const MANAGED_HOST_LIMIT=2;
function pppoeConfig(source,id){
 const rows=source.filter(line=>new RegExp('^pppoe '+id+'(?: |$)').test(line));if(!rows.length)return null;
 const value={id,nat:'disable',auth:'auto',connect:'always',timer:'1200'},seen=new Set();
 for(const line of rows){let rest=line.replace(/^pppoe \d+\s*/,''),parts=0;
  while(rest){const field=rest.match(/^(nat (enable|disable)|auth (auto|chap|pap)|connect (always|on-demand|manual)|release-timer (internal|[1-9]\d{0,4})|user (\S+) password (\S+))(?: |$)/);if(!field)return{...value,unsupported:true};
   const key=field[2]?'nat':field[3]?'auth':field[4]?'connect':field[5]?'timer':'account';if(seen.has(key))return{...value,unsupported:true};seen.add(key);parts++;
   if(key==='account'){value.username=field[6];value.password=field[7];}else value[key]=field[2]||field[3]||field[4]||field[5];rest=rest.slice(field[0].length);
  }if(!parts)return{...value,unsupported:true};
 }return value;
}
function pppoeLine(value){return`pppoe ${value.id}${value.nat==='enable'?' nat enable':''}${value.auth&&value.auth!=='auto'?' auth '+value.auth:''}${value.connect&&value.connect!=='always'?' connect '+value.connect:''}${value.timer&&value.timer!=='1200'?' release-timer '+value.timer:''}${value.username!==undefined?' user '+value.username+' password '+value.password:''}`;}
function normalizePppoe(source){
 const ids=[...new Set(source.map(line=>line.match(/^pppoe (\d+)(?: |$)/)?.[1]).filter(Boolean))],result=[...source];
 for(const rawId of ids){const id=Number(rawId),value=pppoeConfig(source,id);if(!value||value.unsupported)continue;const first=result.findIndex(line=>new RegExp('^pppoe '+id+'(?: |$)').test(line));for(let at=result.length-1;at>=0;at--)if(new RegExp('^pppoe '+id+'(?: |$)').test(result[at]))result.splice(at,1);result.splice(first,0,pppoeLine(value));}
 return result;
}
function setting(input){
 if(input===undefined)return null;
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.enabled!=='boolean'||input.managementEnabled!==undefined&&typeof input.managementEnabled!=='boolean'||Object.keys(input).some(key=>!['enabled','acsUrl','managementEnabled'].includes(key)))fail('Pengaturan TR069 tidak valid',400);
 const split=input.managementEnabled===undefined?{}:{managementEnabled:input.managementEnabled};
 const value=String(input.acsUrl||'').trim();if(!input.enabled&&!value)return{enabled:false,acsUrl:'',...split};
 let url;try{url=new URL(value);}catch{fail('URL ACS harus berupa HTTP atau HTTPS',400);}
 // These URLs become native CLI arguments, not server-side HTTP requests.
 if(value.length>128||url.href.length>128||!/^https?:\/\/[A-Za-z0-9.:/-]+$/.test(value)||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!url.hostname||url.hostname==='localhost'||net.isIP(url.hostname)===4&&(/^(?:0|127)\./.test(url.hostname)||Number(url.hostname.split('.')[0])>=224))fail('URL ACS tidak valid untuk konfigurasi ONU',400);
 return{enabled:input.enabled,acsUrl:url.href,...split};
}
const managementEnabled=value=>value?.managementEnabled??value?.enabled===true;
const active=value=>value?.enabled===true||managementEnabled(value);
function existingTr069(state,config,options={}){
 const rows=state.management.filter(line=>/^tr069-mgmt\b/.test(line)),match=rows.length===1&&rows[0].match(/^tr069-mgmt (\d+) state (unlock|lock) tag pri ([0-7]) vlan (\d+) acs (\S+)$/);
 if(!rows.length){
  const dedicated=plan(state,{...config,managementEnabled:true},options);
  if(dedicated.writes.length!==1||!dedicated.writes[0].startsWith('tr069-mgmt '))fail('Jalur TR069 existing belum terbaca. Siapkan IP Host manajemen atau periksa layanan gabungan dahulu.');
  return{vlan:100,veipId:dedicated.veipId,gemId:dedicated.gemId,servicePortId:dedicated.servicePortId,before:null,after:dedicated.writes[0],writes:dedicated.writes};
 }
 if(!match||Number(match[1])<1||Number(match[1])>state.capabilities.veips||Number(match[4])<1||Number(match[4])>4094)fail('Jalur TR069 existing belum tunggal atau belum terbaca. VLAN dan IP Host tidak dibuat otomatis.');
 const service=state.unit.services.filter(row=>row.vlan===Number(match[4])&&row.userVlan===Number(match[4]));
 if(service.length!==1||!state.management.some(line=>new RegExp('^service \\S+ gemport '+service[0].gem+' vlan '+match[4]+'$').test(line)))fail('Jalur layanan TR069 existing belum terverifikasi; layanan gabungan tidak diubah.');
 if(setting({enabled:true,acsUrl:match[5]}).acsUrl!==config.acsUrl&&options.allowAcsReplace!==true)fail('ACS existing berbeda; URL tidak dialihkan otomatis.');
 const after=`tr069-mgmt ${match[1]} state unlock tag pri ${match[3]} vlan ${match[4]} acs ${config.acsUrl}`;
 return{vlan:Number(match[4]),veipId:Number(match[1]),gemId:service[0].gem,servicePortId:service[0].id,before:rows[0],after,writes:after===rows[0]?[]:[after]};
}
function lines(text,header){
 const raw=String(text||'').replace(/\r/g,'').split('\n'),start=raw.findIndex(line=>line.trim()===header);
 if(start<0||!raw.slice(start+1).some(line=>line.trim()==='!'))fail('Konfigurasi manajemen ONU belum lengkap',503);
 return raw.slice(start+1,start+1+raw.slice(start+1).findIndex(line=>line.trim()==='!')).map(line=>line.trim()).filter(Boolean);
}
function hostRows(text){
 const blocks=String(text||'').replace(/\r/g,'').split(/(?:^|\n)Host ID:\s*/).slice(1);
 if(!blocks.length||blocks.length>127)fail('IP Host ONU belum terbaca',503);
 const rows=blocks.map(block=>{const id=Number(block.split('\n')[0].trim()),field=name=>block.match(new RegExp('^'+name+'\\s*:\\s*([^\\n]*)','m'))?.[1]?.trim();
  const dhcp=field('DHCP enable'),ip=field('Current IP address'),configuredIp=field('IP addres');
  if(!Number.isSafeInteger(id)||id<1||id>127||!['enable','disable'].includes(dhcp)||net.isIP(ip)!==4||net.isIP(configuredIp)!==4)fail('Status IP Host belum lengkap',503);
  const extra={};
  for(const[key,labels]of Object.entries({mask:['Current mask','Current subnet mask','Subnet mask'],gateway:['Current gateway','Current default gateway','Gateway'],dns1:['Current primary DNS','Current primary DNS server','Primary DNS'],dns2:['Current secondary DNS','Current secondary DNS server','Secondary DNS']})){
   const found=labels.map(field).find(value=>net.isIP(value)===4);if(found)extra[key]=found;
  }
  return{id,dhcp,ip,configuredIp,...extra};});
 if(new Set(rows.map(row=>row.id)).size!==rows.length)fail('IP Host terdeteksi ganda');return rows;
}
function managementLines(text,header){
 const source=lines(text,header),groups=new Map(),other=[];
 for(const line of source){
  const match=line.match(/^tr069-mgmt (\d+) (.+)$/);if(!match){other.push(line);continue;}
  const id=Number(match[1]),body=match[2],group=groups.get(id)||{};let fields;
  const combined=body.match(/^state (unlock|lock) tag pri ([0-7]) vlan (\d+) acs (\S+)$/);
  if(combined)fields={state:combined[1],priority:combined[2],vlan:combined[3],acs:combined[4]};
  else if(/^state (?:unlock|lock)$/.test(body))fields={state:body.slice(6)};
  else if(/^acs \S+$/.test(body))fields={acs:body.slice(4)};
  else{const tag=body.match(/^tag pri ([0-7]) vlan (\d+)$/);if(tag)fields={priority:tag[1],vlan:tag[2]};}
  if(!fields||id<1||id>255||Object.keys(fields).some(key=>Object.hasOwn(group,key)))fail('Parameter WAN TR069 ambigu');
  groups.set(id,{...group,...fields});
 }
 for(const[id,group]of groups){if(!group.state||!group.acs||group.vlan===undefined)fail('Parameter WAN TR069 existing belum lengkap');const url=setting({enabled:true,acsUrl:group.acs}).acsUrl;other.push(`tr069-mgmt ${id} state ${group.state} tag pri ${group.priority} vlan ${group.vlan} acs ${url}`);}
 return normalizePppoe(other);
}
function commands(value){
 if(!profiles.address(value.address)||!/^[A-Z0-9]{12}$/.test(value.serialNumber)||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value.type))fail('Identitas ONU TR069 tidak valid',400);
 const iface='gpon-onu_'+value.address;return['enable','terminal length 0','show version-running','show gpon onu by sn '+value.serialNumber,...require('./olt-zte-registration').unitCommands(value),'show onu running config '+iface,'show gpon remote-onu ip-host '+iface,...(value.tr069&&!managementEnabled(value.tr069)?[]:['show vlan 100'])];
}
function inspect(result,value,last=false){
 const get=command=>{const rows=(result.outputs||[]).filter(row=>row.command===command);if(!rows.length||!last&&rows.length!==1)fail('Respons TR069 terpotong',503);return rows[last?rows.length-1:0].stdout;};
 const registration=require('./olt-zte-registration'),iface='gpon-onu_'+value.address,unit=profiles.parseOnu({success:true,outputs:registration.unitCommands(value).map(command=>({command,stdout:get(command)}))},value.address);profiles.verifySerial(unit,value.serialNumber);
 const positions=registration.bySerial(get('show gpon onu by sn '+value.serialNumber),value.serialNumber);if(positions.length!==1||positions[0]!==value.address||unit.type!==value.type)fail('SN, posisi atau tipe ONU berubah; baca ulang sebelum mengubah TR069');if(unit.status.toLowerCase()!=='working')fail('ONU belum online/working; perubahan TR069 ditahan');if(unit.configState.toLowerCase()!=='success')fail('OLT melaporkan Config state '+(unit.configState||'belum terbaca')+'; periksa sinkronisasi OMCI sebelum mengubah TR069');
 const version=String(get('show version-running'));if(!/\bMVR\s+V2\.1\.0\b/.test(version)||/\bMVR\s+(?!V2\.1\.0\b)\S+/.test(version))fail('TR069 pada firmware ini belum terverifikasi');
 if(commands(value).includes('show vlan 100')&&!/^vlanid\s*:100\s*$/m.test(String(get('show vlan 100')).replace(/\r/g,'')))fail('VLAN100 belum tersedia; tidak dibuat otomatis');
 const management=managementLines(get('show onu running config '+iface),'pon-onu-mng '+iface),interfaceLines=lines(get('show running-config interface '+iface),'interface '+iface),hosts=hostRows(get('show gpon remote-onu ip-host '+iface));
 const capability=String(get('show gpon remote-onu capability '+iface)),capabilities={ipHosts:Number(capability.match(/^IP host number:\s*(\d+)/m)?.[1]),veips:Number(capability.match(/^VEIP number:\s*(\d+)/m)?.[1])};
 if(!Number.isSafeInteger(capabilities.ipHosts)||capabilities.ipHosts<1||capabilities.ipHosts>127||!Number.isSafeInteger(capabilities.veips)||capabilities.veips<1||capabilities.veips>255)fail('Kemampuan IP Host/VEIP fisik ONU belum mendukung TR069 ini');
 return{unit,management,interfaceLines,hosts,capabilities};
}
function plan(state,input,options={}){
 const config=setting(input);if(!active(config))fail('VLAN100 atau TR069 belum diaktifkan pada preset PON');
 if(!managementEnabled(config)){const existing=existingTr069(state,config,options);return{config,...existing,reusesVlan:true,reusesService:true,existingOnly:true};}
 const services=state.unit.services.filter(row=>row.vlan===100||row.userVlan===100);if(services.length!==1||services[0].vlan!==100||services[0].userVlan!==100)fail('Jalur VLAN100 ONU belum tunggal; periksa pemetaan existing');
 const service=services[0],mapped=state.management.filter(line=>/^service\b/.test(line)).map(line=>line.match(/^service (\S+) gemport (\d+) vlan (\d+)$/));
 if(mapped.some(row=>!row)||mapped.filter(row=>Number(row[3])===100).length!==1||!mapped.some(row=>Number(row[2])===service.gem&&Number(row[3])===100)||mapped.some(row=>Number(row[2])===service.gem&&Number(row[3])!==100))fail('GEM manajemen VLAN100 ambigu; jalur existing tidak ditimpa');
 const filters=state.management.filter(line=>/^vlan-filter iphost\b/.test(line));let hostId=1;
 if(filters.length){
  const matching=filters.map(line=>line.match(/^vlan-filter iphost (\d+) pri (\d+) vlan (\d+)$/));if(matching.some(row=>!row))fail('VLAN IP Host existing ambigu');
  const own=matching.filter(row=>Number(row[3])===100);
  if(own.length===1){hostId=Number(own[0][1]);if(matching.some(row=>Number(row[1])===hostId&&Number(row[3])!==100))fail('IP Host VLAN100 juga dipakai VLAN layanan lain');}
  else if(!own.length&&options.allowAdditionalHost===true){
   const free=state.hosts.find(row=>row.id<=Math.min(state.capabilities.ipHosts,MANAGED_HOST_LIMIT)&&row.dhcp==='disable'&&row.ip==='0.0.0.0'&&row.configuredIp==='0.0.0.0'&&!state.management.some(line=>new RegExp('(?:^(?:ip-host|pppoe|ip-profile|wan-ip) |\\biphost )'+row.id+'(?: |$)').test(line)));
   if(!free)fail('Tidak ada IP Host kosong untuk ACS; IP Host internet tidak diubah');hostId=free.id;
  }else fail('VLAN IP Host existing ambigu');
 }
 const host=state.hosts.find(row=>row.id===hostId);if(!host)fail('IP Host fisik untuk TR069 belum tersedia');
 if(hostId>MANAGED_HOST_LIMIT)fail('IP Host VLAN100 existing di luar batas dua host billing; tidak dipindah atau ditimpa');
 if(state.management.some(line=>new RegExp('^(?:pppoe|ip-profile|wan-ip|ip-service-map) '+hostId+'(?: |$)').test(line)))fail('IP Host VLAN100 sudah dipakai PPPoE atau WAN lain; tidak diubah menjadi DHCP otomatis');
 const bindings=state.management.filter(line=>/^switchport-bind\b/.test(line)),ipBindings=bindings.filter(line=>new RegExp(' iphost '+hostId+'$').test(line));
 if(ipBindings.length>1||ipBindings.some(line=>!/^switchport-bind switch_\d+\/\d+ iphost \d+$/.test(line)))fail('Binding IP Host existing ambigu');
 let binding=ipBindings[0];
 if(!binding){
  const additional=options.allowAdditionalHost===true&&hostId!==1&&bindings.length>0&&bindings.every(line=>/^switchport-bind switch_0\/1 (?:iphost|veip) [1-9]\d*$/.test(line))&&state.hosts.find(row=>row.id===hostId)?.dhcp==='disable';
  if((bindings.length||state.management.some(line=>/^flow\b/.test(line)))&&!additional)fail('Switch OMCI existing memerlukan pemeriksaan; tidak ditimpa');
  binding=`switchport-bind switch_0/1 iphost ${hostId}`;
 }
 const own=state.management.filter(line=>new RegExp('^(?:ip-host|vlan-filter-mode iphost|vlan-filter iphost) '+hostId+'(?: |$)').test(line));
 if(own.some(line=>/^ip-host\b/.test(line)&&!/^ip-host \d+ dhcp-enable enable(?: ping-response (?:enable|disable))?(?: traceroute-response (?:enable|disable))?$/.test(line)))fail('IP Host existing bukan DHCP sederhana; tidak ditimpa');
 if(!filters.length&&(host.ip!=='0.0.0.0'||host.configuredIp!=='0.0.0.0'||host.dhcp==='enable'&&!own.some(line=>/^ip-host \d+ dhcp-enable enable/.test(line))))fail('IP Host sudah dipakai tanpa pemetaan VLAN yang pasti');
 const tr069=config.enabled?state.management.filter(line=>/^tr069-mgmt\b/.test(line)):[];let veipId=1;
 if(tr069.length){const parsed=tr069.map(line=>line.match(/^tr069-mgmt (\d+) state (unlock|lock) tag pri (\d+) vlan (\d+)(?: acs (\S+))?$/));if(parsed.some(row=>!row)||parsed.length!==1||Number(parsed[0][4])!==100)fail('WAN TR069 existing ambigu; tidak membuat WAN ganda');veipId=Number(parsed[0][1]);if(parsed[0][5]&&setting({enabled:true,acsUrl:parsed[0][5]}).acsUrl!==config.acsUrl&&options.allowAcsReplace!==true)fail('ACS existing berbeda; tidak dialihkan otomatis');}
 if(hostId<1||hostId>state.capabilities.ipHosts||veipId<1||veipId>state.capabilities.veips)fail('Indeks manajemen melebihi kemampuan fisik ONU');
 const expected=[binding,`ip-host ${hostId} dhcp-enable enable ping-response enable traceroute-response enable`,`vlan-filter-mode iphost ${hostId} tag-filter vlan-filter untag-filter discard`,`vlan-filter iphost ${hostId} pri 0 vlan 100`,...(config.enabled?[`tr069-mgmt ${veipId} state unlock tag pri 0 vlan 100 acs ${config.acsUrl}`]:[])];
 // Existing declarations are reused verbatim; conflicting policies are held.
 const writes=expected.filter(line=>!state.management.includes(line));
 for(const line of own)if(!expected.includes(line))fail('Kebijakan IP Host existing berbeda; tidak ditimpa');
 return{config,hostId,veipId,gemId:service.gem,servicePortId:service.id,reusesVlan:true,reusesService:true,writes};
}
function proof(state){return hash({serialNumber:state.unit.serialNumber,type:state.unit.type,management:state.management,interfaceLines:state.interfaceLines,capabilities:state.capabilities,hosts:state.hosts.map(({ip,...row})=>row)});}
function writeCommands(spec){const reads=commands(spec.value);return[...reads,'configure terminal','pon-onu-mng gpon-onu_'+spec.value.address,...spec.tr069Plan.writes,'end',...reads.slice(2)];}
function authorize(spec){
 const expected=plan(spec.tr069State,spec.value.tr069);if(hash(expected)!==hash(spec.tr069Plan))fail('Rencana TR069 berubah');
 const preset=require('./olt-zte-pnp').presets(spec.device)[spec.value.ponKey];if(preset?.revision!==spec.value.presetRevision||hash(setting(preset.tr069))!==hash(expected.config))fail('Preset TR069 berubah');
 const all=writeCommands(spec),start=all.indexOf('configure terminal');return{...spec,commands:all,mutationStart:start+2,mutationEnd:all.indexOf('end'),used:false,submitted:false,verified:false};
}
function verifyResult(result,spec){
 const actual=inspect(result,spec.value,true),expected=spec.tr069Plan;
 if(hash(actual.interfaceLines)!==hash(spec.tr069State.interfaceLines))fail('Jalur Internet/GEM existing berubah');
 const additions=actual.management.filter(line=>!spec.tr069State.management.includes(line)),removed=spec.tr069State.management.filter(line=>!actual.management.includes(line));
 if(removed.some(line=>!expected.existingOnly||line!==expected.before)||additions.some(line=>!expected.writes.includes(line))||expected.writes.some(line=>!actual.management.includes(line)))fail('Konfigurasi TR069 belum terbaca sesuai rencana');
 if(expected.existingOnly){if(hash(actual.hosts)!==hash(spec.tr069State.hosts))fail('IP Host existing berubah saat pengaturan TR069');return{configured:true,enabled:true,vlan:expected.vlan,existingOnly:true,veipId:expected.veipId,acsVerified:false};}
 const host=actual.hosts.find(row=>row.id===expected.hostId);if(host.dhcp!=='enable'||actual.hosts.some(row=>row.id!==expected.hostId&&hash(row)!==hash(spec.tr069State.hosts.find(before=>before.id===row.id))))fail('DHCP IP Host belum sesuai');
 return{configured:true,hostId:host.id,veipId:expected.veipId,vlan:100,gemId:expected.gemId,reusedVlan:true,reusedService:true,dhcpAddress:host.ip==='0.0.0.0'?null:host.ip,acsVerified:false};
}
function verifyStep(outputs,grant,index,prompt){
 const start=grant.commands.indexOf('configure terminal');
 if(index===start-1&&proof(inspect({outputs},grant.value))!==proof(grant.tr069State))fail('Konfigurasi ONU berubah sebelum TR069 dikirim');
 if(index===start&&!/\(config\)#\s*$/.test(prompt))fail('Mode konfigurasi TR069 belum pasti');
 if(index===start+1&&!prompt.trim().endsWith('(gpon-onu-mng '+grant.value.address+')#'))fail('Target ONU TR069 belum pasti');
 if(index>=grant.mutationStart&&index<grant.mutationEnd&&/%Code|(?:^|\n)\s*%|\b(?:invalid|error|failed|failure)\b/i.test(outputs.at(-1)?.stdout||''))fail('OLT menolak konfigurasi TR069');
 if(index===grant.commands.length-1){verifyResult({outputs},grant);grant.verified=true;}
}
module.exports={setting,managementEnabled,active,existingTr069,commands,inspect,plan,proof,writeCommands,authorize,verifyStep,verifyResult,hostRows,MANAGED_HOST_LIMIT,pppoeConfig,pppoeLine,normalizePppoe,lines,managementLines};
