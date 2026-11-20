'use strict';

const crypto=require('node:crypto'),net=require('node:net'),profiles=require('./olt-zte-profiles');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function setting(input){
 if(input===undefined)return null;
 if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.enabled!=='boolean'||Object.keys(input).some(key=>!['enabled','acsUrl'].includes(key)))fail('Pengaturan TR069 tidak valid',400);
 const value=String(input.acsUrl||'').trim();if(!input.enabled&&!value)return{enabled:false,acsUrl:''};
 let url;try{url=new URL(value);}catch{fail('URL ACS harus berupa HTTP atau HTTPS',400);}
 // These URLs become native CLI arguments, not server-side HTTP requests.
 if(value.length>128||url.href.length>128||!/^https?:\/\/[A-Za-z0-9.:/-]+$/.test(value)||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!url.hostname||url.hostname==='localhost'||net.isIP(url.hostname)===4&&(/^(?:0|127)\./.test(url.hostname)||Number(url.hostname.split('.')[0])>=224))fail('URL ACS tidak valid untuk konfigurasi ONU',400);
 return{enabled:input.enabled,acsUrl:url.href};
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
  return{id,dhcp,ip,configuredIp};});
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
 return other;
}
function commands(value){
 if(!profiles.address(value.address)||!/^[A-Z0-9]{12}$/.test(value.serialNumber)||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value.type))fail('Identitas ONU TR069 tidak valid',400);
 const iface='gpon-onu_'+value.address;return['enable','terminal length 0','show version-running','show gpon onu by sn '+value.serialNumber,...require('./olt-zte-registration').unitCommands(value),'show onu running config '+iface,'show gpon remote-onu ip-host '+iface,'show vlan 100'];
}
function inspect(result,value,last=false){
 const get=command=>{const rows=(result.outputs||[]).filter(row=>row.command===command);if(!rows.length||!last&&rows.length!==1)fail('Respons TR069 terpotong',503);return rows[last?rows.length-1:0].stdout;};
 const registration=require('./olt-zte-registration'),iface='gpon-onu_'+value.address,unit=profiles.parseOnu({success:true,outputs:registration.unitCommands(value).map(command=>({command,stdout:get(command)}))},value.address);profiles.verifySerial(unit,value.serialNumber);
 const positions=registration.bySerial(get('show gpon onu by sn '+value.serialNumber),value.serialNumber);if(positions.length!==1||positions[0]!==value.address||unit.type!==value.type||unit.status.toLowerCase()!=='working'||unit.configState.toLowerCase()!=='success')fail('Identitas atau kondisi ONU berubah; TR069 ditahan');
 const version=String(get('show version-running'));if(!/\bMVR\s+V2\.1\.0\b/.test(version)||/\bMVR\s+(?!V2\.1\.0\b)\S+/.test(version))fail('TR069 pada firmware ini belum terverifikasi');
 if(!/^vlanid\s*:100\s*$/m.test(String(get('show vlan 100')).replace(/\r/g,'')))fail('VLAN100 belum tersedia; tidak dibuat otomatis');
 const management=managementLines(get('show onu running config '+iface),'pon-onu-mng '+iface),interfaceLines=lines(get('show running-config interface '+iface),'interface '+iface),hosts=hostRows(get('show gpon remote-onu ip-host '+iface));
 const capability=String(get('show gpon remote-onu capability '+iface)),capabilities={ipHosts:Number(capability.match(/^IP host number:\s*(\d+)/m)?.[1]),veips:Number(capability.match(/^VEIP number:\s*(\d+)/m)?.[1])};
 if(!Number.isSafeInteger(capabilities.ipHosts)||capabilities.ipHosts<1||capabilities.ipHosts>127||!Number.isSafeInteger(capabilities.veips)||capabilities.veips<1||capabilities.veips>255)fail('Kemampuan IP Host/VEIP fisik ONU belum mendukung TR069 ini');
 return{unit,management,interfaceLines,hosts,capabilities};
}
function plan(state,input){
 const config=setting(input);if(!config?.enabled)fail('TR069 belum diaktifkan pada preset PON');
 const services=state.unit.services.filter(row=>row.vlan===100||row.userVlan===100);if(services.length!==1||services[0].vlan!==100||services[0].userVlan!==100)fail('Jalur VLAN100 ONU belum tunggal; periksa pemetaan existing');
 const service=services[0],mapped=state.management.filter(line=>/^service\b/.test(line)).map(line=>line.match(/^service (\S+) gemport (\d+) vlan (\d+)$/));
 if(mapped.some(row=>!row)||mapped.filter(row=>Number(row[3])===100).length!==1||!mapped.some(row=>Number(row[2])===service.gem&&Number(row[3])===100)||mapped.some(row=>Number(row[2])===service.gem&&Number(row[3])!==100))fail('GEM manajemen VLAN100 ambigu; jalur existing tidak ditimpa');
 const filters=state.management.filter(line=>/^vlan-filter iphost\b/.test(line));let hostId=1;
 if(filters.length){const matching=filters.map(line=>line.match(/^vlan-filter iphost (\d+) pri (\d+) vlan (\d+)$/));if(matching.some(row=>!row)||matching.filter(row=>Number(row[3])===100).length!==1)fail('VLAN IP Host existing ambigu');hostId=Number(matching.find(row=>Number(row[3])===100)[1]);}
 const host=state.hosts.find(row=>row.id===hostId);if(!host)fail('IP Host fisik untuk TR069 belum tersedia');
 const bindings=state.management.filter(line=>/^switchport-bind\b/.test(line)),ipBindings=bindings.filter(line=>new RegExp(' iphost '+hostId+'$').test(line));
 if(ipBindings.length>1||ipBindings.some(line=>!/^switchport-bind switch_\d+\/\d+ iphost \d+$/.test(line)))fail('Binding IP Host existing ambigu');
 let binding=ipBindings[0];
 if(!binding){if(bindings.length||state.management.some(line=>/^flow\b/.test(line)))fail('Switch OMCI existing memerlukan pemeriksaan; tidak ditimpa');binding=`switchport-bind switch_0/1 iphost ${hostId}`;}
 const own=state.management.filter(line=>new RegExp('^(?:ip-host|vlan-filter-mode iphost|vlan-filter iphost) '+hostId+'(?: |$)').test(line));
 if(own.some(line=>/^ip-host\b/.test(line)&&!/^ip-host \d+ dhcp-enable enable(?: ping-response (?:enable|disable))?(?: traceroute-response (?:enable|disable))?$/.test(line)))fail('IP Host existing bukan DHCP sederhana; tidak ditimpa');
 if(!filters.length&&(host.ip!=='0.0.0.0'||host.configuredIp!=='0.0.0.0'||host.dhcp==='enable'&&!own.some(line=>/^ip-host \d+ dhcp-enable enable/.test(line))))fail('IP Host sudah dipakai tanpa pemetaan VLAN yang pasti');
 const tr069=state.management.filter(line=>/^tr069-mgmt\b/.test(line));let veipId=1;
 if(tr069.length){const parsed=tr069.map(line=>line.match(/^tr069-mgmt (\d+) state (unlock|lock) tag pri (\d+) vlan (\d+)(?: acs (\S+))?$/));if(parsed.some(row=>!row)||parsed.length!==1||Number(parsed[0][4])!==100)fail('WAN TR069 existing ambigu; tidak membuat WAN ganda');veipId=Number(parsed[0][1]);if(parsed[0][5]&&setting({enabled:true,acsUrl:parsed[0][5]}).acsUrl!==config.acsUrl)fail('ACS existing berbeda; tidak dialihkan otomatis');}
 if(hostId<1||hostId>state.capabilities.ipHosts||veipId<1||veipId>state.capabilities.veips)fail('Indeks manajemen melebihi kemampuan fisik ONU');
 const expected=[binding,`ip-host ${hostId} dhcp-enable enable ping-response enable traceroute-response enable`,`vlan-filter-mode iphost ${hostId} tag-filter vlan-filter untag-filter discard`,`vlan-filter iphost ${hostId} pri 0 vlan 100`,`tr069-mgmt ${veipId} state unlock tag pri 0 vlan 100 acs ${config.acsUrl}`];
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
 if(removed.length||additions.some(line=>!expected.writes.includes(line))||expected.writes.some(line=>!actual.management.includes(line)))fail('Konfigurasi TR069 belum terbaca sesuai rencana');
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
module.exports={setting,commands,inspect,plan,proof,writeCommands,authorize,verifyStep,verifyResult,hostRows};
