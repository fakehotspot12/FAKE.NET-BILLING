'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{PassThrough}=require('node:stream');
const tr=require('../src/olt-zte-tr069'),reg=require('../src/olt-zte-registration'),pnp=require('../src/olt-zte-pnp'),vendors=require('../src/olt-vendors');
const fns=require('./helpers/olt-registration-fixture'),config={enabled:true,acsUrl:'http://192.0.2.10:7547/'};
function reply(command,model){
 const iface='gpon-onu_'+model.onu.address;
 if(command==='show vlan 100')return'vlanid          :100\nname: VLAN0100\nOLT#';
 if(command==='show gpon remote-onu capability '+iface)return fns.reply(command,model).replace('OLT#','IP host number: 2\nVEIP number: 1\nOLT#');
 if(command==='show onu running config '+iface)return fns.reply(command,model).replace('!\n',model.trLines.join('\n')+'\n!\n');
 if(command==='show gpon remote-onu ip-host '+iface)return[1,2].map(id=>`Host ID: ${id}\nIP addres: 0.0.0.0\nDHCP enable: ${id===1&&model.trLines.some(line=>line.startsWith('ip-host 1 '))?'enable':'disable'}\nCurrent IP address: 0.0.0.0\n`).join('\n')+'OLT#';
 if(/^(?:switchport-bind |ip-host |vlan-filter|tr069-mgmt )/.test(command)){if(!model.trLines.includes(command))model.trLines.push(command);return`OLT(gpon-onu-mng ${model.onu.address})#`;}
 return fns.reply(command,model);
}
const response=(commands,model)=>({success:true,submitted:commands.some(line=>/^(?:ip-host |vlan-filter|tr069-mgmt )/.test(line)),outputs:commands.map(command=>({command,stdout:reply(command,model)}))});
async function fixture(enabled=true){
 const f=fns.fixture();f.model.trLines=[];const sent=[];
 const options={explicitDevAccess:true,transportOptions:{transports:{commands:async({commands})=>{sent.push(...commands);return response(commands,f.model);}}},persist:async job=>reg.record(f.device,job)};
 await pnp.read(f.data,f.device,f.actor,fns.key,options);pnp.savePreset(f.data,f.device,f.actor,{ponKey:fns.key,vlanMode:'selected',vlans:[100,101,102],bandwidthMode:'auto60',onuType:'',requestedEnabled:true,presetRevision:'',...(enabled?{tr069:config}:{})});
 const job=await reg.processJob(f.data,f.device,f.actor,fns.key,f.model.onu.serialNumber,options);assert.equal(job.status,'verified',job.message);
 const value={...job.value,tr069:config},raw=response(tr.commands(value),f.model),state=tr.inspect(raw,value);
 f.device.updatedAt=new Date(Date.now()+1).toISOString();await pnp.read(f.data,f.device,f.actor,fns.key,options);return{...f,options,job,value,state,sent};
}
test('TR069 URL/boolean validation rejects CLI injection, credentials, unsafe protocols and default stays off',()=>{
 assert.equal(tr.setting(undefined),null);assert.deepEqual(tr.setting({enabled:false}),{enabled:false,acsUrl:''});assert.deepEqual(tr.setting({enabled:true,acsUrl:'http://192.0.2.10:7547'}),config);
 for(const bad of[null,true,{enabled:'true'},{enabled:true,acsUrl:'file:///etc/passwd'},{enabled:true,acsUrl:'http://x/;reboot'},{enabled:true,acsUrl:'http://x/\nreboot'},{enabled:true,acsUrl:'http://user:pass@x/'},{enabled:true,acsUrl:'http://127.0.0.1/'},{enabled:true,acsUrl:'http://x/?token=secret'},{...config,hostId:2}])assert.throws(()=>tr.setting(bad));
});
test('automatic registration can provision management DHCP without enabling TR069',async()=>{
 const f=fns.fixture();f.model.trLines=[];const sent=[],options={explicitDevAccess:true,transportOptions:{transports:{commands:async({commands})=>{sent.push(...commands);return response(commands,f.model);}}},persist:async job=>reg.record(f.device,job)};
 await pnp.read(f.data,f.device,f.actor,fns.key,options);pnp.savePreset(f.data,f.device,f.actor,{ponKey:fns.key,vlanMode:'selected',vlans:[100,101],bandwidthMode:'auto60',onuType:'',requestedEnabled:true,presetRevision:'',tr069:{enabled:false,managementEnabled:true,acsUrl:''}});
 const job=await reg.processJob(f.data,f.device,f.actor,fns.key,f.model.onu.serialNumber,options);assert.equal(job.status,'verified',job.message);assert(job.tr069Result.configured);assert(sent.some(x=>x.startsWith('ip-host ')));assert(!sent.some(x=>x.startsWith('tr069-mgmt ')));
});
test('registration reuses VLAN100/GEM1/service1, configures only management and never claims ACS Inform',async()=>{
 const f=await fixture();assert(f.job.tr069Result.configured);assert.equal(f.job.tr069Result.acsVerified,false);assert.equal(f.job.tr069Result.dhcpAddress,null);assert.equal(f.model.onu.services.length,3);assert.equal(f.model.management.length,3);assert.equal(f.sent.filter(line=>/^service-port 1 /.test(line)).length,1);assert.equal(f.sent.filter(line=>/^service FBV100 /.test(line)).length,1);
 assert.deepEqual(tr.plan(f.state,config).writes,[]);assert(!f.sent.some(line=>/^switchport-bind.*(?:ethuni|wifi|veip)|^no |^vlan 100|^reboot|^shutdown/.test(line)));
});
test('disabled/default preset never sends any TR069 commands; enabling requires existing VLAN100 selection',async()=>{
 const f=await fixture(false);assert.equal(f.job.tr069Result,undefined);assert.deepEqual(f.model.trLines,[]);const preset=pnp.presets(f.device)[fns.key];assert.throws(()=>pnp.savePreset(f.data,f.device,f.actor,{...preset,vlans:[101],tr069:config,presetRevision:preset.revision}),/VLAN100/);
});
test('duplicate/translated VLAN, occupied IP host, foreign ACS and ambiguous existing WAN are held',async()=>{
 const f=await fixture(false);
 for(const change of[state=>state.unit.services.push({...state.unit.services[0],id:4}),state=>state.unit.services[0].userVlan=101,state=>state.hosts[0].dhcp='enable',state=>state.management.push('tr069-mgmt 1 state unlock tag pri 0 vlan 100 acs http://192.0.2.99/'),state=>state.management.push('tr069-mgmt 1 state unlock tag pri 0 vlan 101'),state=>state.management.push('vlan-filter iphost 1 pri 0 vlan 101'),state=>state.management.push('service CLONE gemport 1 vlan 100')]){const state=structuredClone(f.state);change(state);assert.throws(()=>tr.plan(state,config));}
});
test('existing identical TR069 is reused; disabling future preset does not delete or reset current ONU',async()=>{
 const f=await fixture(),before=structuredClone(f.model),preset=pnp.presets(f.device)[fns.key];pnp.savePreset(f.data,f.device,f.actor,{...preset,tr069:{...config,enabled:false},presetRevision:preset.revision});assert.deepEqual(f.model,before);assert.equal(pnp.presets(f.device)[fns.key].tr069.enabled,false);
});
test('a new IP Host switch never binds Ethernet/WiFi/VEIP or replaces an existing switch topology',async()=>{
 const f=await fixture(false),value=tr.plan(f.state,config);assert.equal(value.writes[0],'switchport-bind switch_0/1 iphost 1');assert(!value.writes.some(line=>/\b(?:ethuni|wifi|veip)\b/.test(line)));
 for(const line of['switchport-bind switch_0/1 ethuni eth_0/1','flow 1 pri 0 vlan 101']){const state=structuredClone(f.state);state.management.push(line);assert.throws(()=>tr.plan(state,config),/Switch OMCI/);}
 const state=structuredClone(f.state);state.management.push('ip-host 1 dhcp-enable enable ping-response enable traceroute-response enable');state.hosts[0].dhcp='enable';assert(!tr.plan(state,config).writes.some(line=>line.startsWith('ip-host ')));state.hosts[0].ip='192.0.2.1';assert.throws(()=>tr.plan(state,config),/sudah dipakai/);
});
test('finite transport preflight checks exact SN, native mode, stable config and full readback',async()=>{
 const f=await fixture(false),preset=pnp.presets(f.device)[fns.key];pnp.savePreset(f.data,f.device,f.actor,{...preset,tr069:config,presetRevision:preset.revision});f.value.presetRevision=pnp.presets(f.device)[fns.key].revision;
 const spec={phase:'tr069',device:f.device,value:f.value,tr069State:f.state,tr069Plan:tr.plan(f.state,config)},[,context,transport]=await vendors.loadLibrary();
 const run=()=>context.withContext(f.data,f.device,()=>{context.authorizeRegistrationOperation(spec);context.current().registrationGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(f.device),password:'unit',commands:reg.phaseCommands(spec),timeoutMs:3000},({ready})=>{const stream=new PassThrough();stream.write=chunk=>{const text=reply(String(chunk).trim(),f.model);queueMicrotask(()=>stream.emit('data',text));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{registrationActionAllowed:true});
 let result=await run();assert(result.success,result.error);assert(result.verified);assert(result.submitted);
 f.model.trLines=[];f.model.onu.serialNumber='HWTC11223344';result=await run();assert(!result.success);assert.equal(result.submitted,false);assert.deepEqual(f.model.trLines,[]);
});
test('readback rejects removed Internet service or missing TR069 command, even when native command returned success',async()=>{
 const f=await fixture(false),state=f.state,tr069Plan=tr.plan(state,config),spec={value:f.value,tr069State:state,tr069Plan};for(const command of tr069Plan.writes)reply(command,f.model);
 assert(tr.verifyResult(response(tr.commands(f.value),f.model),spec).configured);f.model.trLines.pop();assert.throws(()=>tr.verifyResult(response(tr.commands(f.value),f.model),spec));
});
test('actual firmware splits TR069 state, ACS URL and VLAN into three readback declarations without duplicating WAN',async()=>{
 const f=await fixture(),raw=response(tr.commands(f.value),f.model),row=raw.outputs.find(row=>row.command.startsWith('show onu running config ')),single=`tr069-mgmt 1 state unlock tag pri 0 vlan 100 acs ${config.acsUrl}`;
 row.stdout=row.stdout.replace(single,`tr069-mgmt 1 state unlock\n tr069-mgmt 1 acs ${config.acsUrl}\n tr069-mgmt 1 tag pri 0 vlan 100`);const state=tr.inspect(raw,f.value);assert.deepEqual(tr.plan(state,config).writes,[]);assert.equal(state.management.filter(line=>line.startsWith('tr069-mgmt ')).length,1);
 row.stdout=row.stdout.replace('tr069-mgmt 1 state unlock','tr069-mgmt 1 state unlock\n tr069-mgmt 1 state unlock');assert.throws(()=>tr.inspect(raw,f.value),/ambigu/);
});
test('physical IP Host/VEIP capacities and normalized URL length are checked before a configuration grant',async()=>{
 const f=await fixture(false),raw=response(tr.commands(f.value),f.model),row=raw.outputs.find(row=>row.command.startsWith('show gpon remote-onu capability '));row.stdout=row.stdout.replace('VEIP number: 1','VEIP number: 0');assert.throws(()=>tr.inspect(raw,f.value),/Kemampuan/);
 const state=structuredClone(f.state);state.capabilities.ipHosts=0;assert.throws(()=>tr.plan(state,config),/kemampuan fisik/);
 assert.throws(()=>tr.setting({enabled:true,acsUrl:'http://'+('a'.repeat(63))+'.'+('b'.repeat(57))}),/URL ACS/);
});
test('registration API projection excludes cached plans, raw CLI output, connection credentials and historical diagnostics',()=>{
 const result=reg.publicJob({id:'unit',status:'held',serialNumber:'HWTCAABBCCDD',value:{acsUrl:'private'},connection:'secret',unknownSecret:'private',diagnostic:{phase:'tr069',submitted:true,error:'Held',nativeMessage:'%Code 63850: Switch port does not exist.',nativeResponse:'Password: private'},tr069Result:{configured:true}});
 assert(!JSON.stringify(result).includes('private'));assert.equal(result.diagnostic.phase,'tr069');assert(result.tr069Result.configured);assert.equal(result.connection,undefined);
});
test('existing ONU apply persists held on uncertain delivery without retrying; revoked role sends nothing',async()=>{
 const f=await fixture(false),preset=pnp.presets(f.device)[fns.key];pnp.savePreset(f.data,f.device,f.actor,{...preset,tr069:config,presetRevision:preset.revision});
 const input={ponKey:fns.key,address:f.job.address,serialNumber:f.job.serialNumber,presetRevision:pnp.presets(f.device)[fns.key].revision,confirmTarget:f.job.serialNumber,confirmImpact:true,confirmId:f.device.id};let attempts=0;
 const options={...f.options,transportOptions:{transports:{commands:async({commands})=>{if(commands.some(line=>line.startsWith('tr069-mgmt '))){attempts++;return{success:false,submitted:true,outputs:[]};}return response(commands,f.model);}}}};
 const job=await reg.applyExistingTr069(f.data,f.device,f.actor,input,options);assert.equal(job.status,'held');assert.equal(attempts,1);assert.equal(job.kind,'tr069');f.actor.role='collector';await assert.rejects(reg.applyExistingTr069(f.data,f.device,f.actor,input,options));assert.equal(attempts,1);
});
