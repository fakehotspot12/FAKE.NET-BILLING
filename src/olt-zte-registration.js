'use strict';

const crypto=require('node:crypto'),pnp=require('./olt-zte-pnp'),profiles=require('./olt-zte-profiles'),bandwidth=require('./olt-zte-bandwidth'),inventory=require('./olt-zte-inventory'),pon=require('./olt-pon'),vendors=require('./olt-vendors');
const TYPE='FB-GPON-AUTO',TTL=120000,plans=new Map(),busy=new Set(),times=new Map();
const tr069States=new Map();
const discoveryCache=new(require('./bounded-json-cache').BoundedJsonCache)({maxEntries:16,maxBytes:4*1024*1024,maxEntryBytes:1024*1024});
const discoveryPending=new Map(),discoveryAttempts=new Map();
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const connection=device=>pnp.signature({...device,updatedAt:''});
const validSerial=value=>typeof value==='string'&&/^[A-Z0-9]{12}$/.test(value);
const empty=text=>/%Code 62310-GPONSRV\s*:\s*No related information to show\./i.test(text);
function output(result,command,last=false){const rows=(result.outputs||[]).filter(row=>row.command===command);if(!rows.length||!last&&rows.length!==1)fail('Respons registrasi terpotong',503);return rows[last?rows.length-1:0].stdout;}
function baseCommands(key){pon.ponKey(key);return pnp.readCommands([key]).concat(['show interface gpon-olt_'+key,'show running-config interface gpon-olt_'+key,'show gpon onu state gpon-olt_'+key,'show gpon onu baseinfo gpon-olt_'+key]);}
function registered(text,key,count){if(count===0&&empty(text))return[];return[...inventory.base(text,key).values()].map(row=>({id:row.id,serialNumber:row.serialNumber,type:row.model}));}
function inspect(result,key){
 if(!result?.success)fail('Status registrasi OLT belum terbaca',503);const state=pnp.inspect(result,[key]);
 if(state.catalogue.firmwares.some(value=>value!=='V2.1.0'))fail('Registrasi firmware ini belum terverifikasi');
 if(state.global.enabled||state.ports[0].enabled)fail('PnP native pada PON ini masih aktif; registrasi server ditahan agar tidak berlomba.');
 const port=pon.interfaceState(output(result,'show interface gpon-olt_'+key),key);if(pon.configState(output(result,'show running-config interface gpon-olt_'+key),key)!=='enabled')fail('Aktifkan port PON dahulu');
 const text=output(result,'show gpon onu state gpon-olt_'+key),statuses=port.registered===0&&empty(text)?new Map():inventory.states(text),units=registered(output(result,'show gpon onu baseinfo gpon-olt_'+key),key,port.registered);
 if(port.registered>128||units.length!==port.registered||statuses.size!==units.length||units.some(row=>!statuses.has(row.id))||new Set(units.map(row=>row.serialNumber)).size!==units.length)fail('Daftar ONU pada PON ambigu atau berubah');
 return{...state,units,registered:port.registered};
}
function settings(device){
 const source=device.onuRegistration||{},presets=pnp.presets(device),rows={};
 for(const[key,row]of Object.entries(source).slice(0,128))if(row&&row.connection===connection(device)&&presets[key]?.revision===row.presetRevision&&typeof row.enabled==='boolean')rows[key]={enabled:row.enabled,presetRevision:row.presetRevision,actorId:row.actorId,devAllowed:row.devAllowed===true,updatedAt:row.updatedAt};return rows;
}
function jobs(device){return(device.onuRegistrationJobs||[]).filter(row=>row&&row.connection===connection(device)&&validSerial(row.serialNumber)&&Date.now()-Date.parse(row.updatedAt||0)<30*86400000).slice(-128).map(({connection,...row})=>row);}
function publicJob(job){
 const fields=['id','kind','ponKey','serialNumber','address','type','model','status','automatic','actorId','presetRevision','catalogueRevision','message','updatedAt','tr069Result'];
 const safe=Object.fromEntries(fields.filter(key=>job[key]!==undefined).map(key=>[key,job[key]]));
 if(job.manualConfig||job.value?.manualConfig)safe.manualConfig=structuredClone(job.manualConfig||job.value.manualConfig);
 if(job.relocation)safe.relocation={oldAddress:job.relocation.oldAddress,destination:job.relocation.destination,status:job.relocation.status};
 if(job.diagnostic)safe.diagnostic=Object.fromEntries(['phase','submitted','error','completedCommands','failedCommandIndex','cliStage','connectionAttempts','nativeMessage'].filter(key=>job.diagnostic[key]!==undefined).map(key=>[key,typeof job.diagnostic[key]==='string'?job.diagnostic[key].slice(0,200):job.diagnostic[key]]));
 return safe;
}
function manualPreset(device,state,key,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(name=>!['vlans','bandwidthMode','bandwidth','bandwidthPresetId','onuType','tr069'].includes(name)))fail('Pengaturan manual ONU tidak valid',400);
 if(!Array.isArray(input.vlans)||!input.vlans.length||input.vlans.length>16||new Set(input.vlans).size!==input.vlans.length||input.vlans.some(vlan=>!Number.isSafeInteger(vlan)||vlan<2||vlan>4094||!state.catalogue.vlans.includes(vlan)))fail('Pilih 1-16 VLAN existing untuk ONU ini',400);
 if(!['auto60','catalogue','manual'].includes(input.bandwidthMode)||typeof input.onuType!=='string'||input.onuType&&!state.onuTypes.some(row=>row.name===input.onuType))fail('Profil atau jenis ONU manual tidak tersedia',400);
 if(input.bandwidthMode==='manual'&&(typeof input.bandwidth!=='string'||!state.catalogue.tcont.some(row=>row.name===input.bandwidth)))fail('Profil bandwidth manual tidak tersedia',400);
 if(input.bandwidthMode==='catalogue'&&typeof input.bandwidthPresetId!=='string')fail('Pilih profil bandwidth katalog',400);
 const tr069=require('./olt-zte-tr069').setting(input.tr069);if(require('./olt-zte-tr069').managementEnabled(tr069)&&!input.vlans.includes(100))fail('IP Host DHCP memerlukan VLAN100 pada ONU ini',400);
 return{ponKey:key,vlanMode:'selected',vlans:[...input.vlans].sort((a,b)=>a-b),bandwidthMode:input.bandwidthMode,...(input.bandwidthMode==='manual'?{bandwidth:input.bandwidth}:{}),...(input.bandwidthMode==='catalogue'?{bandwidthPresetId:input.bandwidthPresetId}:{}),onuType:input.onuType,...(tr069?{tr069}:{}),revision:pnp.presets(device)[key]?.revision};
}
function selection(device,state,key,manualConfig){
 const preset=manualConfig?manualPreset(device,state,key,manualConfig):pnp.presets(device)[key];if(!preset)fail('Simpan preset PON dahulu');if(preset.vlanMode!=='selected'||!preset.vlans.length)fail('Registrasi otomatis memakai VLAN terpilih, bukan trunk semua VLAN');
 if(preset.vlans.some(vlan=>!state.catalogue.vlans.includes(vlan)))fail('VLAN preset tidak lagi tersedia');
 const type=preset.onuType||TYPE,existing=state.onuTypes.find(row=>row.name===type);if(existing&&(existing.tcont<1||existing.gem<preset.vlans.length)||!existing&&type!==TYPE)fail('Kapasitas ONU-type tidak sesuai VLAN preset');
 if(type===TYPE&&existing&&(existing.tcont!==1||existing.gem!==16))fail('Profil GPON otomatis bertabrakan dengan definisi existing');
 let policy;if(preset.bandwidthMode==='catalogue')policy=require('./olt-zte-catalogue').policyFor(device,state,preset.bandwidthPresetId);else if(preset.bandwidthMode==='auto60')policy=bandwidth.policy(state.catalogue,60000);else{const up=state.catalogue.tcont.find(row=>row.name===preset.bandwidth);if(!up||up.type!==4||up.fixed!==0||up.assured!==0||![60000,120000].includes(up.maximum))fail('Pilih bandwidth best-effort 60/120 Mbps atau preset katalog');policy=bandwidth.policy(state.catalogue,up.maximum);}
 const normalized=manualConfig?{vlans:preset.vlans,bandwidthMode:preset.bandwidthMode,...(preset.bandwidthMode==='manual'?{bandwidth:preset.bandwidth}:{}),...(preset.bandwidthMode==='catalogue'?{bandwidthPresetId:preset.bandwidthPresetId}:{}),onuType:preset.onuType,...(preset.tr069?{tr069:preset.tr069}:{})}:null;
 return{ponKey:key,presetRevision:preset.revision,vlans:preset.vlans,type,createType:!existing,policy,...(require('./olt-zte-tr069').active(preset.tr069)?{tr069:require('./olt-zte-tr069').setting(preset.tr069)}:{}),...(normalized?{manualConfig:normalized}:{})};
}
function proof(state){return hash({global:state.global,ports:state.ports,physicalPorts:state.physicalPorts,catalogue:state.catalogue,onuTypes:state.onuTypes,units:state.units});}
function bySerial(text,serial){if(empty(text)&&!text.includes('gpon-onu_'))return[];const lines=String(text).replace(/\r/g,'').split('\n'),found=[];for(const line of lines){if(!/^\s*gpon-onu_/.test(line))continue;const match=line.trim().match(/^gpon-onu_(\d+\/\d+\/\d+:\d+)\s*$/);if(!match||!profiles.address(match[1]))fail('Pencarian SN ambigu');found.push(match[1]);}if(!found.length)fail('Pencarian SN belum terverifikasi',503);return found;}
function resolvedConfig(device,state,config,model){
 const preset=config.manualConfig||pnp.presets(device)[config.ponKey];if(preset?.onuType)return config;
 const type=require('./olt-zte-catalogue').resolveType(device,state,model,TYPE),existing=state.onuTypes.find(row=>row.name===type);
 if(type!==TYPE&&!existing||existing&&(existing.tcont<1||existing.gem<config.vlans.length))fail('Kapasitas template hasil deteksi model tidak sesuai');
 return{...config,type,createType:!existing};
}
function registerPlan(state,config,serial,device=null){
 if(!validSerial(serial))fail('Pilih SN dari ONU terdeteksi',400);const detected=state.newOnus.filter(row=>row.serialNumber===serial);if(detected.length!==1||detected[0].ponKey!==config.ponKey||detected[0].ambiguous)fail('SN berpindah atau terdeteksi ganda');
 if(state.units.some(row=>row.serialNumber===serial))fail('SN sudah terdaftar');const used=new Set(state.units.map(row=>Number(row.id.split(':')[1])));let id=1;while(used.has(id)&&id<=128)id++;if(id>128)fail('PON sudah berisi 128 ONU');
 if(device)config=resolvedConfig(device,state,config,detected[0].model);
 if(config.createType||config.policy.profiles.some(row=>row.action==='create'))fail('Siapkan profil otomatis dahulu');return{...config,serialNumber:serial,address:config.ponKey+':'+id,model:detected[0].model};
}
function setupMutations(config){return[...(config.createType?['pon',`onu-type ${TYPE} gpon max-tcont 1 max-gemport 16`,'exit']:[]),...(config.policy.profiles.some(row=>row.action==='create')?['gpon',...config.policy.profiles.filter(row=>row.action==='create').map(row=>row.kind==='tcont'?`profile tcont ${row.name} type 4 maximum ${row.maximum}`:`profile traffic ${row.name} sir 0 pir ${row.pir}`),'exit']:[])];}
function phaseCommands(spec){
 if(spec.phase==='settings-onu')return require('./olt-zte-settings').writeCommands(spec);
 if(spec.phase==='acs-onu')return require('./olt-zte-acs').writeCommands(spec);
 if(spec.phase==='tr069')return require('./olt-zte-tr069').writeCommands(spec);
 const key=spec.value.ponKey,serial=spec.value.serialNumber,iface='gpon-onu_'+spec.value.address;
 if(spec.phase==='setup')return[...baseCommands(key),'configure terminal',...setupMutations(spec.value),'end','show onu-type gpon','show version-running','show gpon profile tcont','show gpon profile traffic','show gpon onu profile vlan','show vlan summary'];
 if(spec.phase==='register')return[...baseCommands(key),'show gpon onu by sn '+serial,'configure terminal','interface gpon-olt_'+key,`onu ${spec.value.address.split(':')[1]} type ${spec.value.type} sn ${serial}`,'end','show gpon onu by sn '+serial,'show gpon onu baseinfo gpon-olt_'+key,'show gpon onu detail-info '+iface];
 const reads=['enable','terminal length 0','show gpon onu by sn '+serial,...unitCommands(spec.value),'show onu running config '+iface],offset=spec.offset||0,end=spec.end??Math.min(offset+2,spec.value.vlans.length),vlans=spec.value.vlans.slice(offset,end);
 return[...reads,'configure terminal','interface '+iface,...(!offset?[`tcont 1 profile ${spec.value.policy.profiles[0].name}`]:[]),...vlans.flatMap((vlan,i)=>{const id=offset+i+1;return[`gemport ${id} tcont 1`,`gemport ${id} traffic-limit downstream ${spec.value.policy.profiles[1].name}`,`service-port ${id} vport ${id} user-vlan ${vlan} vlan ${vlan}`];}),'exit','pon-onu-mng '+iface,...vlans.map((vlan,i)=>`service FBV${vlan} gemport ${offset+i+1} vlan ${vlan}`),'end',...unitCommands(spec.value),'show onu running config '+iface,'show gpon onu by sn '+serial];
}
function unitCommands(value){const iface='gpon-onu_'+value.address;return['show gpon onu detail-info '+iface,'show running-config interface '+iface,'show gpon remote-onu capability '+iface,'show onu-type gpon '+value.type];}
function unit(result,value,last=false){const parsed=profiles.parseOnu({success:true,outputs:unitCommands(value).map(command=>({command,stdout:output(result,command,last)}))},value.address);profiles.verifySerial(parsed,value.serialNumber);if(parsed.type!==value.type||parsed.limits.tcont<1||parsed.limits.gem<value.vlans.length)fail('Identitas atau kapasitas fisik ONU tidak sesuai');return parsed;}
function serviceProof(result,value,last=false){const parsed=unit(result,value,last),text=output(result,'show onu running config gpon-onu_'+value.address,last),rows=[...String(text).matchAll(/^\s*service (\S+) gemport (\d+) vlan (\d+)\s*$/gm)].map(m=>({name:m[1],gem:Number(m[2]),vlan:Number(m[3])}));return{parsed,rows};}
function serviceReadback(result,value,last=true,n=value.vlans.length){
 const actual=serviceProof(result,value,last);
 if(actual.parsed.tcont.length!==(n?1:0)||n&&(actual.parsed.tcont[0].id!==1||actual.parsed.tcont[0].profile!==value.policy.profiles[0].name)||actual.parsed.gems.length!==n||actual.parsed.services.length!==n||actual.rows.length!==n)fail('Layanan ONU belum lengkap');
 value.vlans.slice(0,n).forEach((vlan,i)=>{const id=i+1;if(!actual.parsed.gems.some(row=>row.id===id&&row.tcont===1&&row.downstream===value.policy.profiles[1].name)||!actual.parsed.services.some(row=>row.id===id&&row.gem===id&&row.vlan===vlan&&row.userVlan===vlan)||!actual.rows.some(row=>row.name==='FBV'+vlan&&row.gem===id&&row.vlan===vlan))fail('Pemetaan VLAN/GEM tidak sesuai');});return actual.parsed;
}
function authorize(spec){
 if(spec.phase==='settings-onu')return require('./olt-zte-settings').authorize(spec);
 if(spec.phase==='acs-onu')return require('./olt-zte-acs').authorize(spec);
 if(spec.phase==='tr069')return require('./olt-zte-tr069').authorize(spec);
 if(!['setup','register','services'].includes(spec.phase))fail('Tahap registrasi tidak valid');const config=selection(spec.device,spec.state,spec.value.ponKey,spec.value.manualConfig);
 if(spec.phase==='setup'){if(hash(config)!==hash(spec.value))fail('Profil persiapan berubah');}
 else if(spec.phase==='register'){if(hash(registerPlan(spec.state,config,spec.value.serialNumber,spec.device))!==hash(spec.value))fail('Rencana SN berubah');}
 else if(hash(canonical({...resolvedConfig(spec.device,spec.state,config,spec.value.model),createType:false,policy:{...config.policy,profiles:config.policy.profiles.map(row=>({...row,action:'reuse'}))}}))!==hash(canonical({...spec.value,serialNumber:undefined,address:undefined,model:undefined})))fail('Preset layanan berubah');
 if(spec.phase==='services'&&(!Number.isInteger(spec.offset)||spec.offset<0||spec.offset%2||spec.end!==Math.min(spec.offset+2,spec.value.vlans.length)||spec.offset>=spec.end))fail('Urutan batch layanan tidak valid');
 const commands=phaseCommands(spec),start=commands.indexOf('configure terminal')+1,end=commands.indexOf('end');return{...spec,commands,mutationStart:start,mutationEnd:end,used:false,submitted:false,verified:false};
}
function verifyStep(outputs,grant,index,prompt){
 if(grant.phase==='settings-onu')return require('./olt-zte-settings').verifyStep(outputs,grant,index,prompt);
 if(grant.phase==='acs-onu')return require('./olt-zte-acs').verifyStep(outputs,grant,index,prompt);
 if(grant.phase==='tr069')return require('./olt-zte-tr069').verifyStep(outputs,grant,index,prompt);
 const result={success:true,outputs},key=grant.value.ponKey,base=baseCommands(key).length,start=grant.commands.indexOf('configure terminal');
 if((grant.phase==='setup'||grant.phase==='register')&&index===base-1){const fresh=inspect(result,key);if(proof(fresh)!==proof(grant.state))fail('Status OLT/PON berubah sebelum registrasi');if(grant.phase==='register')registerPlan(fresh,selection(grant.device,fresh,key,grant.value.manualConfig),grant.value.serialNumber,grant.device);}
 if(grant.phase==='register'&&index===base){const addresses=bySerial(output(result,'show gpon onu by sn '+grant.value.serialNumber),grant.value.serialNumber);if(addresses.length)fail('SN masih terdaftar di posisi '+addresses.join(', ')+'. Selesaikan pemindahan registrasi lama dahulu.');}
 if(grant.phase==='services'&&index===start-1){const addresses=bySerial(output(result,'show gpon onu by sn '+grant.value.serialNumber),grant.value.serialNumber);if(addresses.length!==1||addresses[0]!==grant.value.address)fail('SN berpindah posisi');serviceReadback(result,grant.value,false,grant.offset);}
 if(index===start&&!/\(config\)#\s*$/.test(prompt))fail('Mode konfigurasi belum pasti');
 if(index>start&&index<grant.mutationEnd){const command=grant.commands[index];if(command==='pon'&&!/\(config-pon\)#\s*$/.test(prompt)||command==='gpon'&&!/\(config-gpon\)#\s*$/.test(prompt)||command.startsWith('interface ')&&!/\(config-if\)#\s*$/.test(prompt)||command.startsWith('pon-onu-mng ')&&!new RegExp('\\(gpon-onu-mng '+grant.value.address.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\)#\\s*$').test(prompt))fail('Mode registrasi belum pasti');
  if(/%Code|(?:^|\n)\s*%|\b(?:invalid|error|failed|failure)\b/i.test(outputs.at(-1)?.stdout||''))fail('OLT menolak tahap registrasi');
 }
 if(index===grant.commands.length-1){verifyResult(result,grant);grant.verified=true;}
}
function verifyResult(result,spec){
 if(spec.phase==='settings-onu')return require('./olt-zte-settings').verifyResult(result,spec);
 if(spec.phase==='acs-onu')return require('./olt-zte-acs').verifyResult(result,spec);
 if(spec.phase==='tr069')return require('./olt-zte-tr069').verifyResult(result,spec);
 if(spec.phase==='setup'){const types=pnp.types(output(result,'show onu-type gpon',true)),type=types.find(row=>row.name===spec.value.type);if(!type||type.tcont<1||type.gem<spec.value.vlans.length)fail('Profil ONU otomatis belum sesuai');const catalogue=profiles.parseCatalogue({success:true,outputs:['show version-running','show gpon profile tcont','show gpon profile traffic','show gpon onu profile vlan','show vlan summary'].map(command=>({command,stdout:output(result,command,true)}))});if(bandwidth.customPolicy(catalogue,spec.value.policy.kbps,spec.value.policy.downloadKbps??spec.value.policy.kbps).profiles.some(row=>row.action!=='reuse'))fail('Profil bandwidth belum tersedia');return{prepared:true};}
 const addresses=bySerial(output(result,'show gpon onu by sn '+spec.value.serialNumber,true),spec.value.serialNumber);if(addresses.length!==1||addresses[0]!==spec.value.address)fail('Posisi SN akhir tidak sesuai');
 if(spec.phase==='register'){const units=registered(output(result,'show gpon onu baseinfo gpon-olt_'+spec.value.ponKey,true),spec.value.ponKey,spec.state.units.length+1),detail=output(result,'show gpon onu detail-info gpon-onu_'+spec.value.address,true),field=label=>String(detail).replace(/\r/g,'').match(new RegExp('^\\s*'+label+'\\s*:\\s*([^\\n]+)','im'))?.[1]?.trim();
  // Baseinfo wraps long type names. Verify the full identity from detail-info,
  // while retaining the complete PON registry comparison for existing ONUs.
  if(units.length!==spec.state.units.length+1||spec.state.units.some(row=>!units.some(other=>row.id===other.id&&row.serialNumber===other.serialNumber&&row.type===other.type))||!units.some(row=>row.id===spec.value.address&&row.serialNumber===spec.value.serialNumber)||field('ONU interface')!=='gpon-onu_'+spec.value.address||field('Serial number')!==spec.value.serialNumber||field('Type')!==spec.value.type)fail('Identitas ONU sesudah pendaftaran belum cocok');return{registered:true};}
 const parsed=serviceReadback(result,spec.value,true,spec.end);return{configured:spec.end===spec.value.vlans.length,working:parsed.status.toLowerCase()==='working'&&parsed.configState.toLowerCase()==='success'};
}
async function run(data,device,commands,options={},spec=null){const[,context,transport]=await vendors.loadLibrary(),budget=Math.max(1,Math.min(options.commandBudgetMs||18000,18000));return context.withContext(data,device,()=>{if(spec)context.authorizeRegistrationOperation(spec);return transport.executeOltCommands({olt:vendors.legacyDevice(device),password:context.decryptSecret(device.cliPasswordEnc),commands,timeoutMs:Math.min(17000,budget)});},{...(options.transportOptions||{}),allowZteDevRead:options.explicitDevAccess===true,registrationActionAllowed:Boolean(spec),explicitDevRegistrationAction:options.explicitDevAccess===true,cliQueue:true,timeoutMs:budget});}
async function readState(data,device,key,options={}){return inspect(await run(data,device,baseCommands(key),options),key);}
async function preparation(data,device,key,prior,options){
 const value=prior?.value,extra=[];
 if(value){if(!validSerial(value.serialNumber)||!profiles.address(value.address)||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value.type||''))fail('Identitas proses sebelumnya tidak valid');extra.push('show gpon onu by sn '+value.serialNumber,...unitCommands(value),'show onu running config gpon-onu_'+value.address);}
 const read=async commands=>{let raw;try{raw=await run(data,device,commands,options);}catch(error){if(/(?:Batas waktu antrean|antrean.*penuh|Vendor read budget exhausted)/i.test(error.message))error.registrationDiagnostic={phase:'preflight',submitted:false,retryableRead:!prior,error:'Antrean pembacaan OLT belum tersedia',completedCommands:0};throw error;}
  if(!raw.success)throw Object.assign(Error('Status registrasi OLT belum terbaca. '+(raw.error||'')),{registrationDiagnostic:{phase:'preflight',submitted:false,retryableRead:!prior&&/batas waktu|timeout|budget exhausted/i.test(raw.error||''),error:raw.error,completedCommands:raw.completedCommands??raw.outputs?.length??0,failedCommandIndex:raw.failedCommandIndex??null}});return raw;};
 const raw=await read(baseCommands(key)),state=inspect(raw,key);
 // A rejected registration has only a planned address, not a native ONU to inspect.
 if(value&&state.units.some(row=>row.id===value.address&&row.serialNumber===value.serialNumber)&&!state.newOnus.some(row=>row.serialNumber===value.serialNumber)){const details=await read(['enable','terminal length 0',...extra]);raw.outputs.push(...details.outputs.filter(row=>!['enable','terminal length 0'].includes(row.command)));}
 return{state,raw};
}
function rememberPlan(data,device,actor,value){const now=Date.now();for(const[token,row]of plans)if(row.expires<now)plans.delete(token);while(plans.size>=64)plans.delete(plans.keys().next().value);const token=crypto.randomBytes(24).toString('base64url');plans.set(token,{...value,catalogueRevision:require('./olt-zte-catalogue').selectionRevision(device),actorId:actor.id,deviceId:device.id,signature:pnp.signature(device),expires:now+TTL});return{token,revision:device.updatedAt||'',value:value.value,kind:value.kind};}
function lastJob(device,key,serial){return jobs(device).filter(row=>row.serialNumber===serial&&row.ponKey===key).at(-1);}
function unsentPositionConflict(job){return job?.status==='held'&&job.diagnostic?.phase==='register'&&job.diagnostic?.submitted===false&&/^(?:SN telah terdaftar pada posisi lain|SN masih terdaftar di posisi )/.test(job.diagnostic.error||'');}
function retryableUnsent(job){return unsentPositionConflict(job)||job?.status==='held'&&job.diagnostic?.phase==='preflight'&&job.diagnostic?.submitted===false&&job.diagnostic?.retryableRead===true;}
function discoveryCandidate(automation,history,row,now){
 if(row.ambiguous||!automation[row.ponKey]?.enabled)return false;
 const latest=history.get(row.serialNumber)||new Map();
 for(const job of latest.values())if(job.ponKey!==row.ponKey&&job.status!=='verified'&&!retryableUnsent(job))return false;
 const previous=latest.get(row.ponKey);return !previous||(previous.status==='verified'||retryableUnsent(previous))&&now-Date.parse(previous.updatedAt)>=120000;
}
async function resumeState(data,device,state,config,prior,options,preparedRaw=null){
 const value=prior?.value?{...prior.value,presetRevision:config.presetRevision}:null;
 if(prior?.status!=='held'||!value||value.serialNumber!==prior.serialNumber||value.address!==prior.address||value.ponKey!==config.ponKey||!state.units.some(row=>row.id===value.address&&row.serialNumber===value.serialNumber)||state.newOnus.some(row=>row.serialNumber===value.serialNumber))fail('Proses sebelumnya tidak dapat dilanjutkan dengan aman');
 if(hash(canonical({...resolvedConfig(device,state,config,prior.model),createType:false}))!==hash(canonical({...value,serialNumber:undefined,address:undefined,model:undefined})))fail('Preset atau profil proses sebelumnya berubah');
 const raw=preparedRaw||await run(data,device,['enable','terminal length 0','show gpon onu by sn '+value.serialNumber,...unitCommands(value),'show onu running config gpon-onu_'+value.address],options);if(!raw.success)fail('Pemeriksaan kelanjutan ONU belum lengkap');const addresses=bySerial(output(raw,'show gpon onu by sn '+value.serialNumber),value.serialNumber);if(addresses.length!==1||addresses[0]!==value.address)fail('SN berpindah atau terdaftar ganda');
 const parsed=unit(raw,value),offset=parsed.services.length;if(offset>value.vlans.length||offset%2&&offset!==value.vlans.length)fail('Batch layanan sebelumnya belum lengkap; periksa manual');serviceReadback(raw,value,false,offset);return{value,offset,working:parsed.status.toLowerCase()==='working'&&parsed.configState.toLowerCase()==='success'};
}
async function prepare(data,device,actor,input,options={}){
 if(input.kind==='automation'&&input.enabled===false){if(!pnp.canManage(data,device,actor))fail('Tidak memiliki izin registrasi',403);const key=pon.ponKey(input.ponKey);return rememberPlan(data,device,actor,{kind:'automation',value:{ponKey:key,presetRevision:pnp.presets(device)[key]?.revision,enabled:false}});}
 pnp.check(data,device,actor,{readOnly:true});const key=pon.ponKey(input.ponKey);if(busy.has(device.id)||busy.size>=2)fail('Registrasi sedang digunakan',429);busy.add(device.id);
 try{if(!['automation','manual','resume'].includes(input.kind)||input.kind==='automation'&&typeof input.enabled!=='boolean')fail('Pilihan registrasi tidak valid',400);if(input.kind==='manual'&&settings(device)[key]?.enabled)fail('PON ini memakai registrasi otomatis. Nonaktifkan otomatis sebelum otorisasi manual.');if(input.kind==='resume'&&input.manualConfig!==undefined)fail('Kelanjutan memakai pengaturan proses sebelumnya; VLAN tidak dapat diganti.',400);
  const prior=input.kind!=='automation'?lastJob(device,key,input.serialNumber):null;if(input.kind==='resume'&&(!prior||prior.status!=='held'||!prior.address||prior.kind==='tr069'))fail('Pilih proses registrasi tertahan yang sudah memiliki alamat ONU.');
  const{state,raw}=await preparation(data,device,key,prior?.status==='held'?prior:null,options),config=selection(device,state,key,input.kind!=='automation'?(input.manualConfig??prior?.value?.manualConfig??prior?.manualConfig):undefined);
  const value=input.kind==='automation'?{...config,enabled:input.enabled}:{...config,serialNumber:input.serialNumber};if(input.kind!=='automation'){
   if(!validSerial(input.serialNumber))fail('Pilih SN terdeteksi yang tidak ganda');
   if(input.kind==='resume'||!state.newOnus.some(row=>row.ponKey===key&&row.serialNumber===input.serialNumber&&!row.ambiguous)){await resumeState(data,device,state,config,prior,options,raw);value.resumeJobId=prior.id;}
  }return rememberPlan(data,device,actor,{kind:input.kind,state,value});
 }finally{busy.delete(device.id);}
}
function confirmed(data,device,actor,input){const plan=plans.get(input.token);if(plan?.kind==='automation'&&!plan.value.enabled){if(!pnp.canManage(data,device,actor))fail('Tidak memiliki izin registrasi',403);}else pnp.check(data,device,actor);if(!plan||plan.expires<Date.now()||plan.actorId!==actor.id||plan.deviceId!==device.id||plan.signature!==pnp.signature(device)||plan.catalogueRevision!==require('./olt-zte-catalogue').selectionRevision(device)||input.revision!==(device.updatedAt||'')||input.confirmId!==device.id||input.confirmTarget!==(plan.kind==='automation'?plan.value.ponKey:plan.value.serialNumber)||input.confirmImpact!==true||pnp.presets(device)[plan.value.ponKey]?.revision!==plan.value.presetRevision)fail('Konfirmasi registrasi tidak sesuai');return plan;}
function activate(data,device,actor,input){const plan=confirmed(data,device,actor,input);if(plan.kind!=='automation')fail('Aksi bukan pengaturan otomatis');if(plan.value.enabled&&busy.has(device.id))fail('Tunggu registrasi yang sedang berjalan selesai',429);device.onuRegistration={...(device.onuRegistration||{}),[plan.value.ponKey]:{enabled:plan.value.enabled,presetRevision:plan.value.presetRevision,connection:connection(device),actorId:actor.id,devAllowed:process.env.MIGRATION_MODE==='1',updatedAt:new Date().toISOString()}};return{ok:true,enabled:plan.value.enabled,ponKey:plan.value.ponKey,message:plan.value.enabled?'Registrasi otomatis aktif. ONU baru diproses berdasarkan SN dan VLAN preset.':'Registrasi otomatis nonaktif; ONU existing tetap dipertahankan.'};}
function record(device,job){const rows=(device.onuRegistrationJobs||[]).filter(row=>row.connection===connection(device)&&row.id!==job.id&&Date.now()-Date.parse(row.updatedAt||0)<30*86400000);device.onuRegistrationJobs=[...rows,{...job,connection:connection(device),updatedAt:new Date().toISOString()}].slice(-128);}
async function phase(data,device,spec,options){
 const deadline=performance.now()+18000;let result,connectionAttempts=0;
 for(let attempt=0;attempt<2;attempt++){
  connectionAttempts++;result=await run(data,device,phaseCommands(spec),{...options,commandBudgetMs:Math.max(1,deadline-performance.now())},spec);
  // Only reconnect before the first command, after persistent permission/preset
  // validation. A partial read, any mutation or ambiguous result is never replayed.
  if(attempt||result.success||result.submitted!==false||result.completedCommands!==0||result.failedCommandIndex!==-1||result.error!=='Batas waktu login CLI vendor terlampaui'||deadline-performance.now()<6500||typeof options.validateBeforeRetry!=='function')break;
  await options.validateBeforeRetry();
 }
 if(!result.success){
  const nativeMessage=spec.phase==='tr069'?String(result.outputs?.at(-1)?.stdout||'').replace(/\r/g,'').split('\n').find(line=>/^\s*%Code \d+(?:-[A-Z0-9]+)?\s*:/i.test(line)&&!/password|secret|username/i.test(line)):'';
  const moved=result.submitted===false&&spec.phase==='register'&&/^(?:SN telah terdaftar pada posisi lain|SN masih terdaftar di posisi )/.test(result.error||'');
  throw Object.assign(Error(moved?result.error:result.submitted?'Pengiriman belum pasti; proses ditahan untuk pemeriksaan manual.':'Tahap registrasi belum terkirim.'),{registrationDiagnostic:{phase:spec.phase,submitted:result.submitted??null,error:result.error||'Respons belum lengkap',completedCommands:result.completedCommands??null,failedCommandIndex:result.failedCommandIndex??null,cliStage:result.cliStage,receivedBytes:result.receivedBytes,connectionAttempts,...(nativeMessage?{nativeMessage:nativeMessage.trim().replace(/[^\x20-\x7e]/g,'').slice(0,160)}:{})}});
 }
 return verifyResult(result,spec);
}
async function waitCapability(data,device,value,options){
 const deadline=performance.now()+35000;
 for(let attempt=0;attempt<8;attempt++){
  const raw=await run(data,device,['enable','terminal length 0','show gpon onu by sn '+value.serialNumber,...unitCommands(value)],{...options,commandBudgetMs:Math.max(1,Math.min(18000,deadline-performance.now()))});if(!raw.success)fail('Kemampuan ONU baru belum terbaca');const found=bySerial(output(raw,'show gpon onu by sn '+value.serialNumber),value.serialNumber);if(found.length!==1||found[0]!==value.address)fail('SN berubah sebelum pemeriksaan OMCI');
  try{return unit(raw,value);}catch(error){const delay=Math.min(2000+attempt*500,5000);if(!/(?:T-CONT fisik|GEM fisik)/.test(error.message)||attempt===7||performance.now()+delay>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,delay));}
 }
}
async function configureTr069(data,device,value,options){
 if(require('./olt-onu-policy').get(device,value.serialNumber).acs!=='inherit')fail('ACS ONU memakai pengecualian manual. Kelola melalui Pengaturan ONU > ACS/TR069.');
 const tr069=require('./olt-zte-tr069'),key=hash([pnp.signature(device),value]),cached=tr069States.get(key);let raw,tr069State;
 if(cached&&Date.now()-cached.at<60000){({raw,state:tr069State}=cached);}else{
  raw=await run(data,device,tr069.commands(value),options);if(!raw.success)fail('Status TR069 ONU belum lengkap; tidak ada perubahan dikirim',503);
  tr069State=tr069.inspect(raw,value);tr069States.set(key,{raw,state:tr069State,at:Date.now()});while(tr069States.size>32)tr069States.delete(tr069States.keys().next().value);
 }
 const tr069Plan=tr069.plan(tr069State,value.tr069),spec={phase:'tr069',device,value,tr069State,tr069Plan};
 if(typeof options.validateBeforeRetry!=='function')fail('Validasi persisten TR069 wajib tersedia');
 await options.validateBeforeRetry();
 // Every mutation still reads the complete native preflight in the same session.
 // A failed login may reuse the preview, never replay a partially sent command.
 if(!tr069Plan.writes.length){tr069States.delete(key);raw=await run(data,device,tr069.commands(value),options);if(!raw.success)fail('Verifikasi TR069 existing belum lengkap');return tr069.verifyResult(raw,spec);}
 try{const result=await phase(data,device,spec,options);tr069States.delete(key);return result;}catch(error){if(error.registrationDiagnostic?.submitted!==false||error.registrationDiagnostic?.completedCommands!==0)tr069States.delete(key);throw error;}
}
async function applyExistingTr069(data,device,actor,input,options={}){
 pnp.check(data,device,actor);const key=pon.ponKey(input.ponKey),address=profiles.address(input.address),serial=input.serialNumber;
 if(!address||!address.startsWith(key+':')||!validSerial(serial)||input.confirmTarget!==serial||input.confirmImpact!==true||input.confirmId!==device.id)fail('Konfirmasi ONU TR069 tidak sesuai',400);
 const preset=pnp.presets(device)[key];if(!require('./olt-zte-tr069').active(preset?.tr069)||preset.revision!==input.presetRevision)fail('Simpan dan baca ulang preset manajemen ONU dahulu');
 if(typeof options.persist!=='function')fail('Audit persisten TR069 wajib tersedia');if(busy.has(device.id)||busy.size>=2)fail('OLT sedang digunakan',429);
 const previous=jobs(device).find(row=>row.serialNumber===serial&&row.address===address&&row.type);if(!previous)fail('Identitas penuh ONU belum tersedia; registrasi existing tidak ditebak');
 const value={ponKey:key,address,serialNumber:serial,type:previous.type,presetRevision:preset.revision,tr069:preset.tr069};
 busy.add(device.id);let job={id:crypto.randomUUID(),kind:'tr069',ponKey:key,address,serialNumber:serial,type:value.type,actorId:actor.id,presetRevision:preset.revision,status:'configuring',value,message:'Memeriksa TR069 VLAN100 existing'};
 const persist=async patch=>{job={...job,...patch};await options.persist(job);};
 try{await persist({});const result=await configureTr069(data,device,value,{...options,validateBeforeRetry:()=>persist({message:'Validasi target sebelum konfigurasi TR069'})});await persist({status:'verified',tr069Result:result,message:'TR069 tersimpan pada ONU; koneksi ACS belum diverifikasi.'});return job;}
 catch(error){await persist({status:'held',message:error.message,...(error.registrationDiagnostic?{diagnostic:error.registrationDiagnostic}:{})}).catch(()=>{});return job;}
 finally{pnp.invalidate(device);profiles.invalidate(device);busy.delete(device.id);}
}
async function processJob(data,device,actor,key,serial,options){
 require('./olt-onu-policy').assertAutomation(device,serial);
 pnp.check(data,device,actor);if(typeof options.persist!=='function')fail('Audit persisten registrasi wajib tersedia');const prior=lastJob(device,key,serial);if(prior&&!(options.manual===true&&prior.status==='held')&&!(options.automatic===true&&options.retryUnsentId===prior.id&&(prior.status==='verified'||retryableUnsent(prior))&&Date.now()-Date.parse(prior.updatedAt)>=120000))fail('SN sudah diproses. Periksa hasil sebelumnya; tidak dikirim ulang otomatis.');if(options.resumeJobId&&prior?.id!==options.resumeJobId)fail('Proses kelanjutan sudah berubah');
 if(busy.has(device.id)||busy.size>=2)fail('OLT sedang digunakan',429);busy.add(device.id);let job={id:crypto.randomUUID(),ponKey:key,serialNumber:serial,status:'preparing',automatic:options.automatic===true,actorId:actor.id,catalogueRevision:require('./olt-zte-catalogue').selectionRevision(device),address:'',message:'Memeriksa prasyarat',...(options.resumeJobId?{address:prior.address,model:prior.model,type:prior.type,value:prior.value}:{})};
 const persist=async patch=>{job={...job,...patch};await options.persist(job);};
 const phaseOptions={...options,validateBeforeRetry:()=>persist({message:'Memulihkan koneksi CLI sebelum perintah pertama; belum ada layanan dikirim ulang.'})};
 try{let{state,raw}=await preparation(data,device,key,options.resumeJobId?prior:null,options),config=selection(device,state,key,options.manualConfig);await persist({status:'preparing',presetRevision:config.presetRevision,...(config.manualConfig?{manualConfig:config.manualConfig}:{})});
  if(config.createType||config.policy.profiles.some(row=>row.action==='create')){await phase(data,device,{phase:'setup',device,state,value:config},phaseOptions);state=await readState(data,device,key,options);config=selection(device,state,key,options.manualConfig);}
  let value,offset=0,configured;
  if(options.resumeJobId){const resume=await resumeState(data,device,state,config,prior,options,raw);({value,offset}=resume);configured={working:resume.working};await persist({status:'registered',address:value.address,model:value.model,type:value.type,value,presetRevision:config.presetRevision,message:'SN existing terverifikasi; melanjutkan layanan yang belum diterapkan'});}
  else{
   value=registerPlan(state,config,serial,device);await persist({status:'registering',address:value.address,model:value.model,type:value.type,value,presetRevision:config.presetRevision});
   try{await phase(data,device,{phase:'register',device,state,value},phaseOptions);}catch(error){
    const diagnostic=error.registrationDiagnostic;
    if(!options.automatic||diagnostic?.phase!=='register'||diagnostic.submitted!==false||!/^(?:SN telah terdaftar pada posisi lain|SN masih terdaftar di posisi )/.test(diagnostic.error||''))throw error;
    const command='show gpon onu by sn '+serial,lookup=await run(data,device,['enable','terminal length 0',command],options);if(!lookup.success)fail('Posisi registrasi lama belum dapat dipastikan');
    const addresses=bySerial(output(lookup,command),serial);if(addresses.length!==1||addresses[0].split(':')[0]===key)fail('Registrasi lama tidak tunggal atau masih berada pada PON tujuan');
    await persist({status:'relocating',message:'Memeriksa SN dan status offline pada registrasi lama',relocation:{oldAddress:addresses[0],destination:key,status:'checking'}});
    const moved=await require('./olt-zte-onu').relocateOffline(data,device,{id:addresses[0],serialNumber:serial},key,{...(options.transportOptions||{}),relocationBackupDir:options.relocationBackupDir,beforeRelocationDelete:async relocation=>{await persist({status:'relocating',message:'Cadangan tersimpan; memindahkan registrasi lama yang offline',relocation});pnp.check(data,device,actor);}});
    if(!moved.deleteConfirmed)fail('Penghapusan posisi lama belum terverifikasi');await persist({status:'relocating',message:'Registrasi lama sudah dilepas; memeriksa ulang PON tujuan',relocation:moved.relocation});
    state=await readState(data,device,key,options);config=selection(device,state,key,options.manualConfig);value=registerPlan(state,config,serial,device);
    await persist({status:'registering',address:value.address,model:value.model,type:value.type,value,presetRevision:config.presetRevision});await phase(data,device,{phase:'register',device,state,value},phaseOptions);
   }
   await persist({status:'registered',message:'SN terdaftar; menerapkan layanan VLAN'});await waitCapability(data,device,value,options);
  }
  for(;offset<value.vlans.length;offset+=2){await persist({status:'configuring',message:'Menerapkan VLAN '+(offset+1)+'-'+Math.min(offset+2,value.vlans.length)});configured=await phase(data,device,{phase:'services',device,state,value,offset,end:Math.min(offset+2,value.vlans.length)},phaseOptions);}
  let tr069Result;
  if(require('./olt-zte-tr069').active(value.tr069)&&require('./olt-onu-policy').get(device,serial).acs==='inherit'){await persist({status:'configuring',message:require('./olt-zte-tr069').managementEnabled(value.tr069)?'Memeriksa IP Host manajemen VLAN100':'Memeriksa jalur TR069 existing'});tr069Result=await configureTr069(data,device,value,phaseOptions);}
  await persist({status:configured.working?'verified':'checking',message:configured.working?(tr069Result?(value.tr069?.enabled?'ONU dan TR069 tersimpan; koneksi ACS belum diverifikasi.':'ONU dan IP Host DHCP tersimpan; TR069 tidak diubah.'):'ONU terdaftar dan layanan VLAN terverifikasi.'):'Layanan tersimpan; menunggu verifikasi OMCI.',value,...(tr069Result?{tr069Result}:{})});return job;
 }catch(error){await persist({status:'held',message:error.message,...(error.registrationDiagnostic?{diagnostic:error.registrationDiagnostic}:{})}).catch(()=>{});return job;}finally{pnp.invalidate(device);profiles.invalidate(device);discoveryCache.delete(connection(device));busy.delete(device.id);}
}
function executeManual(data,device,actor,input,options={}){const plan=confirmed(data,device,actor,input);if(!['manual','resume'].includes(plan.kind))fail('Aksi bukan registrasi manual atau kelanjutan layanan');const automatic=settings(device)[plan.value.ponKey]?.enabled===true;if(plan.kind==='manual'&&automatic)fail('PON ini memakai registrasi otomatis.');if(plan.used)fail('Permintaan sudah diproses');if(busy.has(device.id)||busy.size>=2)fail('Pendaftaran sedang berjalan. Tunggu proses selesai sebelum mengirim pendaftaran berikutnya.',429);const prior=lastJob(device,plan.value.ponKey,plan.value.serialNumber);if(prior&&prior.status!=='held'||plan.value.resumeJobId&&prior?.id!==plan.value.resumeJobId)fail('Proses ONU sudah berubah. Baca ulang status sebelum melanjutkan.');plan.used=true;return processJob(data,device,actor,plan.value.ponKey,plan.value.serialNumber,{...options,manual:true,automatic:plan.kind==='resume'&&automatic,resumeJobId:plan.value.resumeJobId,manualConfig:plan.value.manualConfig});}
async function verifyPending(data,device,job,config,options){
 const value=job.value,expired=Date.now()-Date.parse(job.updatedAt)>120000;
 try{if(!value)fail('Persiapan sebelumnya terputus');const commands=['enable','terminal length 0',...unitCommands(value),'show onu running config gpon-onu_'+value.address,'show gpon onu by sn '+value.serialNumber],raw=await run(data,device,commands,{...options,explicitDevAccess:config.devAllowed}),addresses=bySerial(output(raw,'show gpon onu by sn '+value.serialNumber),value.serialNumber),parsed=serviceReadback(raw,value);if(addresses.length!==1||addresses[0]!==value.address)fail('Posisi verifikasi SN berubah');if(parsed.status.toLowerCase()==='working'&&parsed.configState.toLowerCase()==='success')return options.persist(device,{...job,status:'verified',message:'ONU terdaftar dan layanan VLAN terverifikasi.'});if(expired)fail('Verifikasi OMCI belum berhasil');
 }catch(error){if(expired)return options.persist(device,{...job,status:'held',message:error.message+'; perlu pemeriksaan manual, tanpa pengiriman ulang otomatis.'});}
}
async function tick(data,options={}){
 const wakeId=typeof options.wakeDeviceId==='string'?options.wakeDeviceId:'',candidates=[];for(const device of(data.oltDevices||[]).filter(row=>row.vendor==='zte'&&row.enabled&&(!wakeId||row.id===wakeId)))for(const[key,config]of Object.entries(settings(device)).filter(([,row])=>row.enabled))if(!(process.env.MIGRATION_MODE==='1'&&!config.devAllowed)&&!busy.has(device.id)&&!require('./olt-zte-bridge').isBusy(device.id)&&Date.now()-(times.get(device.id)||0)>=(wakeId?2000:20000))candidates.push({device,key,config});
 candidates.sort((a,b)=>(times.get(a.device.id)||0)-(times.get(b.device.id)||0));const selected=candidates[0];if(!selected){const target=wakeId&&(data.oltDevices||[]).find(row=>row.id===wakeId&&row.vendor==='zte'&&row.enabled);if(target&&Object.values(settings(target)).some(row=>row.enabled)&& (busy.has(wakeId)||require('./olt-zte-bridge').isBusy(wakeId)))return{processed:0,waiting:true,deviceId:wakeId};return{processed:0};}let{device,key,config}=selected;let actor=(data.users||[]).find(row=>row.id===config.actorId);if(!pnp.canManage(data,device,actor))return{processed:0};const[,,transport]=await vendors.loadLibrary();if(transport.isBusy(device.id))return wakeId?{processed:0,waiting:true,deviceId:device.id}:{processed:0};times.set(device.id,Date.now());while(times.size>256)times.delete(times.keys().next().value);
 try{const checking=jobs(device).find(row=>settings(device)[row.ponKey]?.enabled&&!['held','verified'].includes(row.status));if(checking){await verifyPending(data,device,checking,settings(device)[checking.ponKey],options);return{checked:1};}
  const raw=await run(data,device,['enable','terminal length 0','show pon onu uncfg'],{...options,explicitDevAccess:config.devAllowed});if(!raw.success)fail('Discovery belum terbaca');const discovered=pnp.discovery(output(raw,'show pon onu uncfg'));rememberDiscovery(device,discovered);const automation=settings(device),history=new Map(),now=Date.now();for(const job of jobs(device)){if(!history.has(job.serialNumber))history.set(job.serialNumber,new Map());history.get(job.serialNumber).set(job.ponKey,job);}const detected=discovered.find(row=>discoveryCandidate(automation,history,row,now));
  if(detected){key=detected.ponKey;config=settings(device)[key];actor=(data.users||[]).find(row=>row.id===config.actorId);if(!pnp.canManage(data,device,actor))return{processed:0};await processJob(data,device,actor,key,detected.serialNumber,{...options,automatic:true,retryUnsentId:lastJob(device,key,detected.serialNumber)?.id,explicitDevAccess:config.devAllowed,persist:job=>options.persist(device,job)});return{processed:1,deviceId:device.id,more:discovered.some(row=>row.serialNumber!==detected.serialNumber&&discoveryCandidate(automation,history,row,now))};}return{processed:0};
 }catch(error){return{held:true,message:error.message};}
}
function rememberDiscovery(device,onus,checkedAt=new Date().toISOString()){
 const value={onus,checkedAt};if(!discoveryCache.set(connection(device),value,300000))fail('Daftar modem baru melebihi batas cache aman',503);return value;
}
function discoveryPage(data,device,actor,input={}){
 if(!pnp.canManage(data,device,actor))fail('Tidak memiliki izin registrasi ONU',403);
 const cached=discoveryCache.get(connection(device)),previous=pnp.saved(device),snapshot=cached||{onus:previous?.newOnus||[],checkedAt:previous?.checkedAt||''},automation=settings(device),latestJobs=new Map();
 for(const job of jobs(device))latestJobs.set(job.ponKey+':'+job.serialNumber,job);
 const key=input.pon?pon.ponKey(input.pon):'',search=String(input.search||'').trim().toLowerCase().slice(0,100),all=snapshot.onus.filter(row=>(!key||row.ponKey===key)&&[row.serialNumber,row.model,row.ponKey].some(value=>String(value||'').toLowerCase().includes(search))),limit=8,pages=Math.max(1,Math.ceil(all.length/limit)),page=Math.max(1,Math.min(pages,parseInt(input.page,10)||1));
 return{onus:all.slice((page-1)*limit,page*limit).map(row=>{const job=latestJobs.get(row.ponKey+':'+row.serialNumber),automatic=automation[row.ponKey]?.enabled===true,processing=job&&!['held','verified'].includes(job.status);return{...row,automatic,processing:Boolean(processing),canAuthorize:!row.ambiguous&&!automatic&&!processing&&job?.status!=='verified',...(job?{job:publicJob(job)}:{})};}),total:all.length,limit,page,pages,checkedAt:snapshot.checkedAt,stale:!snapshot.checkedAt||Date.now()-Date.parse(snapshot.checkedAt)>30000,automation,jobs:jobs(device).map(publicJob)};
}
async function refreshDiscovery(data,device,actor,options={}){
 pnp.check(data,device,actor,{readOnly:true});if(busy.has(device.id))fail('Tunggu registrasi ONU selesai sebelum membaca ulang',429);
 const key=connection(device);if(discoveryPending.has(key))return discoveryPending.get(key);
 const cached=discoveryCache.get(key);if(cached&&Date.now()-Date.parse(cached.checkedAt)<5000)return;
 if(discoveryPending.size>=2||Date.now()-(discoveryAttempts.get(key)||0)<5000)fail('Tunggu sebentar sebelum membaca modem baru lagi',429);
 discoveryAttempts.set(key,Date.now());while(discoveryAttempts.size>64)discoveryAttempts.delete(discoveryAttempts.keys().next().value);
 const task=(async()=>{const raw=await run(data,device,['enable','terminal length 0','show pon onu uncfg'],options);if(!raw.success)fail('Modem baru belum dapat dibaca dari OLT',503);rememberDiscovery(device,pnp.discovery(output(raw,'show pon onu uncfg')));})();
 discoveryPending.set(key,task);try{await task;}finally{discoveryPending.delete(key);}
}
const viewWaiters=new Map();
async function managementOperation(data,device,actor,operation,{invalidate=true,readOnly=false}={}){
 pnp.check(data,device,actor,{readOnly});
 if(readOnly&&(busy.has(device.id)||busy.size>=2)){
  const count=viewWaiters.get(device.id)||0;if(count>=6)fail('Antrean pembacaan ONU penuh',429);viewWaiters.set(device.id,count+1);const deadline=Date.now()+7000;
  try{while(busy.has(device.id)||busy.size>=2){if(Date.now()>=deadline)fail('OLT masih menyelesaikan operasi; data terakhir tetap tersedia',429);await new Promise(resolve=>setTimeout(resolve,150));pnp.check(data,device,actor,{readOnly:true});}}finally{const left=(viewWaiters.get(device.id)||1)-1;if(left)viewWaiters.set(device.id,left);else viewWaiters.delete(device.id);}
 }
 if(busy.has(device.id)||busy.size>=2)fail('Tunggu operasi ONU selesai',429);
 busy.add(device.id);try{return await operation();}finally{busy.delete(device.id);if(invalidate)profiles.invalidate(device);}
}
module.exports={TYPE,settings,jobs,publicJob,baseCommands,inspect,selection,registerPlan,phaseCommands,authorize,verifyStep,verifyResult,bySerial,unitCommands,prepare,activate,record,executeManual,processJob,tick,readState,applyExistingTr069,connection,discoveryPage,refreshDiscovery,managementOperation,isBusy:id=>busy.has(id),TTL};
