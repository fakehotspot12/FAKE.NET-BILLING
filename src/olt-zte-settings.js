'use strict';

const crypto=require('node:crypto'),net=require('node:net');
const pnp=require('./olt-zte-pnp'),profiles=require('./olt-zte-profiles'),tr=require('./olt-zte-tr069'),catalogue=require('./olt-zte-catalogue'),vendors=require('./olt-vendors'),policy=require('./olt-onu-policy');
const plans=new Map(),states=new Map(),attempts=new Map(),TTL=120000;
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(a,b)=>hash(a)===hash(b),sorted=rows=>[...rows].sort();
const name=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value);
const profileCommands=['show version-running','show gpon profile tcont','show gpon profile traffic','show gpon onu profile vlan','show vlan summary'];
const readCommands=value=>[...tr.commands(value),...profileCommands.filter(command=>!tr.commands(value).includes(command))];
function number(value,min,max,label){if(!Number.isSafeInteger(value)||value<min||value>max)fail(label+' tidak valid',400);return value;}
function hostView(state){
 return state.hosts.filter(row=>!state.capabilities.ipHosts||row.id<=state.capabilities.ipHosts).map(row=>{
  const id=row.id,own=state.management.filter(line=>new RegExp('^(?:ip-host |pppoe |vlan-filter(?:-mode)? iphost )'+id+'(?: |$)').test(line));
  const filters=own.filter(line=>line.startsWith('vlan-filter iphost ')),tag=filters.length===1&&filters[0].match(/^vlan-filter iphost \d+ pri ([0-7]) vlan (\d+)$/);
  const stat=own.map(line=>line.match(/^ip-host \d+ ip (\S+) mask (\S+)(?: gateway (\S+))?$/)).find(Boolean),dns=own.map(line=>line.match(/^ip-host \d+ primary-dns (\S+)(?: second-dns (\S+))?$/)).find(Boolean);
  const ppp=tr.pppoeConfig(state.management,id),mode=ppp?'pppoe':row.dhcp==='enable'?'dhcp':stat?'static':'disabled';
  const configured=own.some(line=>/^ip-host |^pppoe |^vlan-filter iphost /.test(line))||Boolean(row.ip&&row.ip!=='0.0.0.0')||Boolean(row.configuredIp&&row.configuredIp!=='0.0.0.0');
  const acs=Boolean(tag&&state.management.some(line=>new RegExp('^tr069-mgmt \\d+ .* vlan '+tag[2]+' acs ').test(line)));
  const unknown=own.some(line=>!/^ip-host \d+ (?:dhcp-enable (?:enable|disable) ping-response (?:enable|disable) traceroute-response (?:enable|disable)|ip \S+ mask \S+(?: gateway \S+)?|primary-dns \S+(?: second-dns \S+)?)$/.test(line)&&!/^vlan-filter(?:-mode)? iphost /.test(line)&&!/^pppoe /.test(line));
  const reserved=state.management.some(line=>new RegExp('^(?:ip-profile|wan-ip|ip-service-map) '+id+'(?: |$)').test(line)||!/^switchport-bind |^vlan-filter(?:-mode)? /.test(line)&&new RegExp('\\biphost '+id+'(?: |$)').test(line));
  const managed=id<=tr.MANAGED_HOST_LIMIT,reason=state.writeVerified===false?'Konfigurasi existing dapat dilihat; perubahan menunggu verifikasi native lengkap.':row.available===false?'Status IP Host belum lengkap; pembacaan tetap tersedia.':!managed?'Di luar batas dua IP Host billing; konfigurasi existing tetap.':acs?'Dipakai WAN TR069; kelola melalui tab ACS/TR069.':ppp?.unsupported?'Parameter PPPoE existing belum dikenali.':reserved?'IP Host masih dirujuk konfigurasi WAN atau profil lanjutan.':configured&&(!tag||filters.length!==1)?'Pemetaan VLAN IP Host belum tunggal.':unknown?'Parameter IP Host lanjutan belum didukung.':'';
  return{id,managed,configured:configured||reserved,mode,...(ppp&&!ppp.unsupported?{pppUsername:ppp.username||'',pppPasswordConfigured:!!ppp.password,natEnabled:ppp.nat==='enable'}:{}),vlan:tag?Number(tag[2]):null,priority:tag?Number(tag[1]):0,ip:Object.hasOwn(row,'displayIp')?row.displayIp:row.ip,...(row.ipSource?{ipSource:row.ipSource,ipNote:row.ipNote||'',reportedIp:row.reportedIp,ipCheckedAt:row.ipCheckedAt||''}:{}),configuredIp:stat?.[1]||row.configuredIp,mask:row.mask||stat?.[2]||'',gateway:row.gateway||stat?.[3]||'',dns1:row.dns1||dns?.[1]||'',dns2:row.dns2||dns?.[2]||'',acs,editable:!reason,reason};
 });
}
function publicState(state,device,cat){
 const native=cat||{vlans:[...new Set(state.unit.services.map(row=>row.vlan))],tcont:[],traffic:[]};
 return{target:{address:state.unit.address,serialNumber:state.unit.serialNumber,type:state.unit.type},unit:state.unit,hosts:hostView(state),capacity:{...state.capabilities,managedIpHosts:Math.min(tr.MANAGED_HOST_LIMIT,state.capabilities.ipHosts)},policy:policy.get(device,state.unit.serialNumber),vlans:native.vlans,profiles:{upload:native.tcont.map(row=>({...row,...require('./olt-zte-bandwidth').nativeProfileStatus(row,'upload')})),download:native.traffic.map(row=>({...row,...require('./olt-zte-bandwidth').nativeProfileStatus(row,'download')}))},readOnly:state.writeVerified===false,readIssues:state.readIssues||[],wanSources:state.wanSources||[],capabilities:{serviceChannel:state.writeVerified!==false&&!!cat,ipHostModes:['dhcp','static','pppoe'],wanEdit:false,wanReason:'IP Host DHCP/Static/PPPoE dikelola pada tab IP Host. IP WAN dari ACS ditampilkan bersama sumber dan VLAN-nya.'},checkedAt:state.checkedAt||new Date().toISOString()};
}

function channels(state,cat,input){
 const {unit}=state,next={tcont:input.tcont,gems:input.gems,services:input.services};
 for(const[key,max]of[['tcont',unit.limits.tcont],['gems',Math.min(unit.limits.gem,128)],['services',128]]){
  if(!Array.isArray(next[key])||next[key].length>max)fail('Jumlah '+key+' melebihi kapasitas ONU',400);
  next[key]=next[key].map(row=>({...row}));const ids=next[key].map(row=>number(row.id,1,max,key));if(new Set(ids).size!==ids.length)fail('ID '+key+' ganda',400);
 }
 const selectable=(rows,value,direction,existing)=>{
  if(!name(value)||!rows.some(row=>row.name===value))fail('Pilih profil '+direction+' yang tersedia di OLT',400);
  const row=rows.find(row=>row.name===value),status=require('./olt-zte-bandwidth').nativeProfileStatus(row,direction);
  if(value!==existing&&(status.selectable===false||status.reserved))fail('Pilih profil best-effort tanpa reservasi melalui editor layanan; profil reservasi dikelola melalui Bandwidth.');
 };
 next.tcont=next.tcont.map(row=>{selectable(cat.tcont,row.profile,'upload',unit.tcont.find(item=>item.id===row.id)?.profile);return{id:row.id,profile:row.profile};});
 next.gems=next.gems.map(row=>{if(!next.tcont.some(tc=>tc.id===row.tcont))fail('GEM harus menunjuk T-CONT yang tersedia',400);selectable(cat.traffic,row.downstream,'download',unit.gems.find(item=>item.id===row.id)?.downstream);return{id:row.id,tcont:row.tcont,downstream:row.downstream};});
 next.services=next.services.map(row=>{if(!next.gems.some(gem=>gem.id===row.gem))fail('Layanan harus menunjuk GEM yang tersedia',400);number(row.vlan,2,4094,'VLAN');if(row.userVlan!==row.vlan||!cat.vlans.includes(row.vlan))fail('Editor ini memakai VLAN existing tanpa translasi',400);return{id:row.id,gem:row.gem,userVlan:row.userVlan,vlan:row.vlan};});
 if(new Set(next.services.map(row=>row.vlan)).size!==next.services.length)fail('VLAN layanan ganda',400);
 const changed=(key)=>unit[key].filter(row=>!next[key].some(other=>same(row,other))),added=key=>next[key].filter(row=>!unit[key].some(other=>same(row,other)));
 const removed=changed('services'),oldGems=changed('gems'),oldTc=changed('tcont');
 for(const gem of oldGems)if(state.management.some(line=>new RegExp('^gemport '+gem.id+'(?: |$)').test(line)))fail('GEM '+gem.id+' masih memakai aturan OMCI lanjutan.');
 // No cascading deletion. A referenced resource must be removed or reassigned in
 // the same submitted topology, and native OMCI dependencies remain protected.
 const dependentVlans=new Set(removed.filter(row=>!next.services.some(other=>other.vlan===row.vlan&&other.gem===row.gem)).map(row=>row.vlan));
 for(const vlan of dependentVlans){
  if(state.management.some(line=>!/^service /.test(line)&&new RegExp('\\bvlan '+vlan+'(?: |$)').test(line)))fail('VLAN '+vlan+' masih dipakai LAN/WiFi, IP Host atau WAN. Lepas dependensinya terlebih dahulu.');
 }
 for(const gem of oldGems)if(!next.gems.some(row=>row.id===gem.id)&&next.services.some(row=>row.gem===gem.id))fail('GEM masih dipakai layanan');
 for(const tc of oldTc)if(!next.tcont.some(row=>row.id===tc.id)&&next.gems.some(row=>row.tcont===tc.id))fail('T-CONT masih dipakai GEM');
 const mapping=state.management.filter(line=>/^service /.test(line)).map(line=>({line,match:line.match(/^service ([A-Za-z0-9][A-Za-z0-9_.-]{0,31}) gemport (\d+) vlan (\d+)$/)}));
 if(mapping.some(row=>!row.match))fail('Pemetaan OMCI layanan lanjutan harus diperiksa manual');
 const managementRemove=[],managementAdd=[];
 for(const row of removed){const matches=mapping.filter(item=>Number(item.match[2])===row.gem&&Number(item.match[3])===row.vlan);if(matches.length!==1)fail('Pemetaan OMCI layanan tidak tunggal');managementRemove.push(matches[0].line);}
 for(const row of added('services')){
  const previous=removed.find(item=>item.id===row.id),existing=previous&&mapping.find(item=>Number(item.match[2])===previous.gem&&Number(item.match[3])===previous.vlan),serviceName=existing?.match[1]||'FBV'+row.vlan;
  if(mapping.some(item=>item.match[1]===serviceName&&!managementRemove.includes(item.line)))fail('Nama layanan OMCI sudah digunakan');managementAdd.push(`service ${serviceName} gemport ${row.gem} vlan ${row.vlan}`);
 }
 const interfaceRemove=state.interfaceLines.filter(line=>removed.some(row=>line.startsWith('service-port '+row.id+' '))||oldGems.some(row=>line.startsWith('gemport '+row.id+' '))||oldTc.some(row=>line.startsWith('tcont '+row.id+' ')));
 // Recreate only changed resources and their native downstream declarations.
 const interfaceAdd=[...added('tcont').map(row=>`tcont ${row.id} profile ${row.profile}`),...added('gems').flatMap(row=>[`gemport ${row.id} tcont ${row.tcont}`,`gemport ${row.id} traffic-limit downstream ${row.downstream}`]),...added('services').map(row=>`service-port ${row.id} vport ${row.gem} user-vlan ${row.userVlan} vlan ${row.vlan}`)];
 const interfaceWrites=[...removed.map(row=>'no service-port '+row.id),...oldGems.map(row=>'no gemport '+row.id),...oldTc.map(row=>'no tcont '+row.id),...interfaceAdd];
 // Profile edits keep the T-CONT identity, but rebuilding a parent with retained
 // children is unnecessary and disruptive. Use the native in-place profile form.
 for(const row of oldTc)if(next.tcont.some(other=>other.id===row.id)){interfaceWrites.splice(interfaceWrites.indexOf('no tcont '+row.id),1);}
 for(const row of oldGems)if(next.gems.some(other=>other.id===row.id&&other.tcont===row.tcont))interfaceWrites.splice(interfaceWrites.indexOf('no gemport '+row.id),1);
 for(const row of oldGems)if(next.gems.some(other=>other.id===row.id&&other.tcont!==row.tcont)&&unit.services.some(service=>service.gem===row.id&&!removed.some(other=>other.id===service.id)))fail('Untuk memindahkan GEM ke T-CONT lain, sesuaikan pemetaan layanan bersamanya.');
 const impacts=unit.services.filter(row=>removed.some(item=>item.id===row.id)||oldGems.some(item=>item.id===row.gem)||oldTc.some(tc=>unit.gems.some(gem=>gem.id===row.gem&&gem.tcont===tc.id))).map(row=>'VLAN '+row.vlan+' / layanan '+row.id);
 return{kind:'services',input:next,interfaceRemove,interfaceAdd,interfaceWrites,managementRemove,managementAdd,managementWrites:managementAdd,impacts};
}
function iphost(state,cat,input){
 const id=number(input.id,1,Math.min(state.capabilities.ipHosts,tr.MANAGED_HOST_LIMIT),'IP Host (maksimal dua)'),host=hostView(state).find(row=>row.id===id);if(!host)fail('Indeks IP Host belum dilaporkan perangkat');if(!host.editable)fail(host.reason);
 if(!['save','remove'].includes(input.operation))fail('Aksi IP Host tidak valid',400);
 const own=state.management.filter(line=>new RegExp('^(?:ip-host |pppoe |vlan-filter(?:-mode)? iphost )'+id+'(?: |$)').test(line)),oldPpp=tr.pppoeConfig(own,id),desired=[],managementWrites=[],bindingAdd=[];
 const token=(value,label)=>{if(typeof value!=='string'||!/^[A-Za-z0-9_.@%+=:,/!#$*?-]{1,25}$/.test(value)||value.includes('?'))fail(label+' harus 1–25 karakter tanpa spasi atau pemisah perintah',400);return value;};
 let nextPpp,pppWrite;
 if(input.operation==='remove'){if(!host.configured)fail('IP Host ini sudah kosong');}
 else{
  if(!['dhcp','static','pppoe'].includes(input.mode))fail('Pilih mode DHCP, Static atau PPPoE',400);
  number(input.vlan,2,4094,'VLAN');number(input.priority,0,7,'Prioritas');
  if(!cat.vlans.includes(input.vlan)||state.unit.services.filter(row=>row.vlan===input.vlan&&row.userVlan===input.vlan).length!==1)fail('Siapkan satu jalur layanan VLAN ini pada tab Layanan dahulu');
  if(input.vlan===100&&hostView(state).some(row=>row.id!==id&&row.configured&&row.vlan===100))fail('VLAN100 sudah terpasang pada IP Host lain. Gunakan host existing; tidak membuat duplikat.');
  const bindings=state.management.filter(line=>/^switchport-bind /.test(line)),bound=bindings.filter(line=>line.endsWith(' iphost '+id));
  if(!bindings.length&&state.management.some(line=>/^flow\b/.test(line)))fail('Topologi flow belum memiliki binding switch yang terverifikasi');
  if(bound.length>1||bound.some(line=>!/^switchport-bind switch_0\/1 iphost \d+$/.test(line))||bindings.some(line=>!/^switchport-bind switch_0\/1 (?:iphost|veip|ethuni|wifi) [A-Za-z0-9_/]+$/.test(line)))fail('Binding switch IP Host memerlukan pemeriksaan manual');
  if(!bound.length)bindingAdd.push(`switchport-bind switch_0/1 iphost ${id}`);
  desired.push(`ip-host ${id} dhcp-enable ${input.mode==='dhcp'?'enable':'disable'} ping-response enable traceroute-response enable`);
  if(input.mode==='static'){
   for(const key of['ip','mask','gateway','dns1','dns2'])if((input[key]||key==='ip'||key==='mask')&&net.isIP(input[key])!==4)fail('Isian '+key+' harus IPv4',400);
   const bits=input.mask.split('.').map(row=>Number(row).toString(2).padStart(8,'0')).join('');if(!/^1+0+$/.test(bits)||/^(?:0|127|22[4-9]|23\d|24\d|25[0-5])\./.test(input.ip))fail('IP atau subnet mask tidak valid',400);
   desired.push(`ip-host ${id} ip ${input.ip} mask ${input.mask}${input.gateway?' gateway '+input.gateway:''}`);
   if(input.dns2&&!input.dns1)fail('Isi DNS utama dahulu',400);if(input.dns1)desired.push(`ip-host ${id} primary-dns ${input.dns1}${input.dns2?' second-dns '+input.dns2:''}`);
  }
  if(input.mode==='pppoe'){
   const username=token(input.pppUsername,'Username PPPoE');if(typeof input.natEnabled!=='boolean')fail('Pilihan NAT tidak valid',400);
   if(input.pppPassword){const password=token(input.pppPassword,'Password PPPoE');nextPpp={...(oldPpp||{auth:'auto',connect:'always',timer:'1200'}),id,nat:input.natEnabled?'enable':'disable',username,password};pppWrite=`pppoe ${id} nat ${nextPpp.nat} user ${username} password ${password}`;}
   else{if(!oldPpp?.password||oldPpp.username!==username)fail('Isi password untuk akun PPPoE baru atau username yang diubah',400);nextPpp={...oldPpp,nat:input.natEnabled?'enable':'disable'};if(nextPpp.nat!==oldPpp.nat)pppWrite=`pppoe ${id} nat ${nextPpp.nat}`;}
   desired.push(tr.pppoeLine(nextPpp));
  }
  desired.push(`vlan-filter-mode iphost ${id} tag-filter vlan-filter untag-filter discard`,`vlan-filter iphost ${id} pri ${input.priority} vlan ${input.vlan}`);
 }
 const managementRemove=own.filter(line=>!desired.includes(line)),managementAdd=[...bindingAdd,...desired.filter(line=>!own.includes(line))];
 if(oldPpp&&!nextPpp)managementWrites.push('no pppoe '+id);
 for(const line of managementRemove.filter(line=>line.startsWith('vlan-filter iphost ')))managementWrites.push('no '+line);
 if(managementRemove.some(line=>line.startsWith('vlan-filter-mode ')))managementWrites.push('no vlan-filter-mode iphost '+id);
 const resetHost=input.operation==='remove'||managementRemove.some(line=>/^ip-host \d+ (?:ip |primary-dns )/.test(line));
 if(resetHost&&own.some(line=>line.startsWith('ip-host ')))managementWrites.push('no ip-host '+id);
 managementWrites.push(...bindingAdd,...managementAdd.filter(line=>!/^pppoe |^switchport-bind /.test(line)&&(!resetHost||!/^ip-host /.test(line))),...(resetHost?desired.filter(line=>/^ip-host /.test(line)):[]),...(pppWrite?[pppWrite]:[]));
 return{kind:'iphost',input:{...input,id},interfaceRemove:[],interfaceAdd:[],interfaceWrites:[],managementRemove,managementAdd,managementWrites,impacts:[`IP Host ${id}${host.vlan?' / VLAN '+host.vlan:''}${host.mode==='pppoe'?' / PPPoE Internet':''}`]};
}
function build(state,cat,input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Pengaturan ONU tidak valid',400);
 const value=input.kind==='services'?channels(state,cat,input):input.kind==='iphost'?iphost(state,cat,input):fail('Jenis pengaturan ONU tidak valid',400);
 if(value.interfaceWrites.length+value.managementRemove.length+value.managementWrites.length>64)fail('Perubahan terlalu besar. Terapkan beberapa layanan secara bertahap.');return value;
}
function writeCommands(spec){
 const reads=readCommands(spec.value),native=spec.native,iface='gpon-onu_'+spec.value.address;
 return[...reads,'configure terminal',...(native.managementRemove.length?['pon-onu-mng '+iface,...(native.kind==='services'?native.managementRemove.map(line=>'no service '+line.split(' ')[1]):[]),'exit']:[]),...(native.interfaceWrites.length?['interface '+iface,...native.interfaceWrites,'exit']:[]),...(native.managementWrites.length?['pon-onu-mng '+iface,...native.managementWrites]:[]),'end',...reads.slice(2)];
}
function authorize(spec){
 if(!same(build(spec.state,spec.catalogue,spec.native.input.kind?spec.native.input:{kind:spec.native.kind,...spec.native.input}),spec.native))fail('Rencana pengaturan ONU berubah');
 const commands=writeCommands(spec);return{...spec,commands,mutationStart:commands.indexOf('configure terminal')+1,mutationEnd:commands.indexOf('end'),used:false,submitted:false,verified:false};
}
function verifyResult(raw,spec){
 const actual=tr.inspect(raw,spec.value,true),n=spec.native;
 if(!same(actual.capabilities,spec.state.capabilities)||actual.hosts.length!==spec.state.hosts.length)fail('Kemampuan atau daftar IP Host berubah');
 const outputs=profileCommands.map(command=>raw.outputs?.filter(row=>row.command===command).at(-1)).filter(Boolean);
 if(outputs.length!==profileCommands.length||!same(profiles.parseCatalogue({success:true,outputs}),spec.catalogue))fail('Definisi profil atau VLAN OLT berubah saat penerapan');
 for(const[key,remove,add]of[['interfaceLines',n.interfaceRemove,n.interfaceAdd],['management',n.managementRemove,n.managementAdd]]){
  const expected=spec.state[key].filter(line=>!remove.includes(line)).concat(add);
  if(!same(sorted(expected),sorted(actual[key])))fail('Hasil '+n.kind+' belum sesuai; baca ulang sebelum mengirim lagi');
 }
 if(n.kind==='services'){
  if(!same(actual.unit.tcont,n.input.tcont)||!same(actual.unit.gems,n.input.gems)||!same(actual.unit.services,n.input.services)){
   for(const key of['tcont','gems','services'])if(!same([...actual.unit[key]].sort((a,b)=>a.id-b.id),[...n.input[key]].sort((a,b)=>a.id-b.id)))fail('Topologi layanan belum sesuai');
  }
 }else{
  const host=actual.hosts.find(row=>row.id===n.input.id),ppp=tr.pppoeConfig(actual.management,n.input.id);if(n.input.operation==='remove'?(host.dhcp!=='disable'||host.configuredIp!=='0.0.0.0'||ppp):n.input.mode==='dhcp'?host.dhcp!=='enable'||ppp:n.input.mode==='static'?host.dhcp!=='disable'||host.configuredIp!==n.input.ip||ppp:host.dhcp!=='disable'||!ppp)fail('IP Host belum terverifikasi');
 }
 for(const row of actual.hosts)if((n.kind!=='iphost'||row.id!==n.input.id)&&!same({...row,ip:undefined},{...spec.state.hosts.find(other=>other.id===row.id),ip:undefined}))fail('IP Host lain berubah');
 return actual;
}
function verifyStep(outputs,grant,index,prompt){
 const start=grant.commands.indexOf('configure terminal'),command=grant.commands[index];
 if(index===start-1){
  if(tr.proof(tr.inspect({outputs},grant.value))!==tr.proof(grant.state))fail('Konfigurasi atau SN ONU berubah sebelum penyimpanan');
  const nativeProfiles=profiles.parseCatalogue({success:true,outputs:outputs.filter(row=>profileCommands.includes(row.command))});if(!same(nativeProfiles,grant.catalogue))fail('Profil atau VLAN OLT berubah sebelum penyimpanan. Baca ulang katalog.');
 }
 if(index===start&&!/\(config\)#\s*$/.test(prompt))fail('Mode konfigurasi belum pasti');
 if(index>start&&index<grant.mutationEnd){
  if(command.startsWith('interface ')&&!/\(config-if\)#\s*$/.test(prompt)||command.startsWith('pon-onu-mng ')&&!prompt.trim().endsWith('(gpon-onu-mng '+grant.value.address+')#'))fail('Target konfigurasi ONU belum pasti');
  const response=String(outputs.at(-1)?.stdout||'').replace(/\r/g,'').split('\n').filter(line=>/^\s*%/.test(line)||line.trim()!==command&&line.trim().replace(/^.*?#\s*/,'')!==command).join('\n');
  if(/%Code|(?:^|\n)\s*%|\b(?:invalid|error|failed|failure)\b/i.test(response))fail('OLT menolak perubahan pengaturan ONU');
 }
 if(index===grant.commands.length-1){verifyResult({outputs},grant);grant.verified=true;}
}
const stateKey=(device,input)=>pnp.signature(device)+':'+input.address+':'+input.serialNumber;
function remember(device,input,state,cat){states.set(stateKey(device,input),{value:{address:state.unit.address,serialNumber:state.unit.serialNumber,type:state.unit.type},state,catalogue:cat,at:Date.now()});while(states.size>64)states.delete(states.keys().next().value);}
function throttle(device,actor,input={}){const key=device.id+':'+actor.id+':'+(input.serialNumber||'');if(Date.now()-(attempts.get(key)||0)<2500)fail('Tunggu sebentar sebelum membaca ulang ONU',429);attempts.set(key,Date.now());while(attempts.size>128)attempts.delete(attempts.keys().next().value);}
async function load(data,device,actor,input,options){
 const selected=require('./olt-zte-acs').target(input),cached=states.get(stateKey(device,selected));
 if(!input.force&&cached&&Date.now()-cached.at<30000)return structuredClone(cached);
 let cat=catalogue.saved(device);if(!cat||Date.now()-Date.parse(cat.checkedAt)>300000)cat=await catalogue.read(data,device,actor,options);
 const result=await require('./olt-zte-acs').load(data,device,input,options);remember(device,selected,result.state,cat.catalogue);return{...result,catalogue:cat.catalogue};
}
async function read(data,device,actor,input,options={}){
 const view=require('./olt-zte-view'),state=await view.read(data,device,actor,input,options);let cat=catalogue.saved(device)?.catalogue;
 if(!cat&&state.writeVerified&&input.section!=='hosts'&&input.section!=='wan')try{cat=(await catalogue.read(data,device,actor,options)).catalogue;}catch{state.readIssues.push('Daftar profil belum terbaca; IP Host dan layanan existing tetap ditampilkan.');}
 const sources=await view.wanSources(data.settings||{},state.unit.serialNumber,input.force===true);state.hosts=view.correlate(state,sources);state.wanSources=sources;return publicState(state,device,cat);
}

async function prepare(data,device,actor,input,options={}){
 pnp.check(data,device,actor);throttle(device,actor,input);
 return require('./olt-zte-registration').managementOperation(data,device,actor,async()=>{
  const loaded=await load(data,device,actor,input,options),native=build(loaded.state,loaded.catalogue,input.change);
  if(!native.interfaceWrites.length&&!native.managementWrites.length&&!native.managementRemove.length)return{alreadyConfigured:true,message:'Pengaturan sudah sesuai.',snapshot:publicState(loaded.state,device,loaded.catalogue)};
  for(const[token,row]of plans)if(row.expires<Date.now())plans.delete(token);while(plans.size>=64)plans.delete(plans.keys().next().value);
  const token=crypto.randomBytes(24).toString('base64url');plans.set(token,{...loaded,native,deviceId:device.id,signature:pnp.signature(device),policy:hash(policy.get(device,loaded.value.serialNumber)),actorId:actor.id,expires:Date.now()+TTL});
  return{token,revision:device.updatedAt||'',kind:native.kind,target:loaded.value,impacts:native.impacts,summary:native.kind==='services'?native.input:{id:native.input.id,operation:native.input.operation,mode:native.input.mode,vlan:native.input.vlan}};
 },{invalidate:false});
}
async function execute(data,device,actor,input,options={}){
 pnp.check(data,device,actor);const plan=plans.get(input.token);
 if(!plan||plan.expires<Date.now()||plan.actorId!==actor.id||plan.deviceId!==device.id||plan.signature!==pnp.signature(device)||plan.policy!==hash(policy.get(device,plan.value.serialNumber))||input.revision!==(device.updatedAt||'')||input.confirmId!==device.id||input.confirmTarget!==plan.value.serialNumber||input.confirmImpact!==true)fail('Konfirmasi pengaturan ONU berubah atau kedaluwarsa');
 if(plan.used)fail('Permintaan sudah diproses. Baca ulang hasilnya.');
 if(typeof options.beforeSend!=='function'||typeof options.afterSend!=='function')fail('Audit pengaturan ONU wajib tersedia');
 if(process.env.MIGRATION_MODE==='1'&&options.explicitDevAccess!==true)fail('Akses perubahan perangkat Dev belum diizinkan');
 return require('./olt-zte-registration').managementOperation(data,device,actor,async()=>{
  plan.used=true;await options.beforeSend({...plan.value,kind:plan.native.kind});
  const [,context,transport]=await vendors.loadLibrary(),spec={phase:'settings-onu',device,...plan};let raw;
  try{raw=await context.withContext(data,device,()=>{context.authorizeRegistrationOperation(spec);return transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands:writeCommands(spec),timeoutMs:22000});},{...(options.transportOptions||{}),allowZteDevRead:options.explicitDevAccess===true,registrationActionAllowed:true,explicitDevRegistrationAction:options.explicitDevAccess===true,cliQueue:true,timeoutMs:24000});}catch{raw={success:false,submitted:null};}
  let actual;try{if(raw.success)actual=verifyResult(raw,spec);}catch{}
  states.delete(stateKey(device,plan.value));require('./olt-zte-view').invalidate(device);const verified=Boolean(actual),submitted=raw.submitted===true,uncertain=raw.submitted==null||submitted&&!verified;
  const output={verified,submitted,uncertain,message:verified?'Pengaturan tersimpan dan dibaca ulang dari ONU.':uncertain?'Hasil belum pasti. Baca ulang ONU sebelum mencoba lagi.':'Perubahan belum diterapkan. Baca ulang ONU.'};
  if(actual){remember(device,plan.value,actual,plan.catalogue);output.snapshot=publicState(actual,device,plan.catalogue);}
  try{await options.afterSend(output,{...plan.value,kind:plan.native.kind});}catch{output.persistenceWarning=true;output.message+=' Audit hasil belum tersimpan.';}return output;
 });
}
module.exports={hostView,publicState,build,writeCommands,authorize,verifyStep,verifyResult,read,prepare,execute};
