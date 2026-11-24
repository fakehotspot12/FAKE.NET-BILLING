'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const pnp=require('../src/olt-zte-pnp'),vendors=require('../src/olt-vendors'),auth=require('../src/auth');
const {fixture}=require('./helpers/olt-pon-fixture');
const key='1/1/13';
function state(){return{global:{enabled:false,bandwidth:'default',onuType:''},ports:Array.from({length:16},(_,i)=>({ponKey:'1/1/'+(i+1),enabled:false,onu:{mode:'n/a',vlan:null},olt:{mode:'n/a',vlan:null}})),physicalPorts:Array.from({length:16},(_,i)=>'1/1/'+(i+1)),catalogue:{firmwares:['V2.1.0'],tcont:[{name:'default',type:1,fixed:10000,assured:0,maximum:0},{name:'UP-50',type:4,fixed:0,assured:0,maximum:50000}],traffic:[{name:'default',sir:10000,pir:10000}],vlan:[],vlans:[1,100]},onuTypes:[{name:'UNIT-2G',tcont:8,gem:32}],newOnus:[{ponKey:key,model:'HG-SAMPLE',serialNumber:'HWTCAABBCCDD',modelSource:'olt-discovery',ambiguous:false}]};}
const selection=extra=>({ponKey:key,enabled:true,bandwidth:'UP-50',onuType:'UNIT-2G',vlanMode:'fixed',vlan:100,...extra});
function reply(command,model){
 if(command==='show card')return'Rack Shelf Slot CfgType RealType Port  HardVer SoftVer         Status\n1    1     1    GTGH    GTGHG    16    V1.0.0  V2.1.0          INSERVICE\nOLT#';
 if(command==='show onu-pnp config')return`EPON bandwidth profile: default\nGPON bandwidth profile: ${model.global.bandwidth}\nONU PNP global state: ${model.global.enabled?'enable':'disable'}\nDefault ONU type:\n EPON: N/A\n GPON: ${model.global.onuType||'N/A'}\nOLT#`;
 if(command.startsWith('show onu-pnp olt config ')){const port=model.ports.find(row=>command.endsWith('_'+row.ponKey));return`OLT: gpon-olt_${port.ponKey}\nONU PNP state:${port.enabled?'enable':'disable'}\nONU VLAN mode:${port.onu.mode==='n/a'?'N/A':port.onu.mode}${port.onu.vlan===null?'':' ONU VLAN:'+port.onu.vlan}\nOLT VLAN mode:${port.olt.mode==='n/a'?'N/A':port.olt.mode}${port.olt.vlan===null?'':' OLT VLAN:'+port.olt.vlan}\nOLT#`;}
 if(command==='show onu-type gpon')return'ONU type name: UNIT-2G\nPON type: GPON\nMax T-CONT: 8\nMax GEM port: 32\nOLT#';
 if(command==='show pon onu uncfg')return'OltIndex Model SN PW\ngpon-olt_1/1/13 HG-SAMPLE HWTCAABBCCDD N/A\nOLT#';
 if(command==='show version-running')return'1/1/1 GTGHG MVR V2.1.0 time 123\nOLT#';
 if(command==='show gpon profile tcont')return'Profile name :default\n Type FBW(kbps) ABW(kbps) MBW(kbps) PRIORITY\n 1 10000 0 0 N/A\nProfile name :UP-50\n4 0 0 50000 N/A\nOLT#';
 if(command==='show gpon profile traffic')return'Profile name :default\n SIR(kbps) PIR(kbps) CBS(kbytes) PBS(kbytes)\n 10000 10000 default default\nOLT#';
 if(command==='show gpon onu profile vlan')return'%Code 62310-GPONSRV : No related information to show.\nOLT#';
 if(command==='show vlan summary')return`All created vlan num: ${model.catalogue.vlans.length}\nDetails are following:\n${model.catalogue.vlans.join(',')}\nOLT#`;
 if(command==='configure terminal')return'OLT(config)#';
 if(command==='onu-pnp')return'OLT(config-onu-pnp)#';
 if(command==='end'||command==='enable'||command==='terminal length 0')return'OLT#';
 const port=model.ports.find(row=>command.includes('gpon-olt_'+row.ponKey)&&new RegExp('gpon-olt_'+row.ponKey+'(?: |$)').test(command));
 if(command.startsWith('bandwidth gpon '))model.global.bandwidth=command.slice(15);
 else if(command.startsWith('onu-type-default gpon '))model.global.onuType=command.slice(22);
 else if(/^enable gpon-olt_/.test(command))port.enabled=true;
 else if(/^disable gpon-olt_/.test(command))port.enabled=false;
 else if(/^olt-vlan /.test(command))port.olt={mode:command.includes('transparent')?'transparent':'untag',vlan:command.includes(' vlan ')?Number(command.split(' ').at(-1)):null};
 else if(/^onu-vlan /.test(command))port.onu={mode:command.includes('transparent')?'transparent':'tag',vlan:command.includes(' vlan ')?Number(command.split(' ').at(-1)):null};
 else throw Error('Unexpected command '+command);
 return'OLT(config-onu-pnp)#';
}
const readReply=(commands,model)=>({success:true,outputs:commands.map(command=>({command,stdout:reply(command,model)}))});
test('native PnP parses actual global/per-PON state, bandwidth and physical model separately from fallback type',()=>{
 const model=state(),result=pnp.inspect(readReply(pnp.readCommands([key]),model),[key]);assert.equal(result.global.enabled,false);assert.equal(result.ports[0].enabled,false);assert.equal(result.newOnus[0].model,'HG-SAMPLE');assert.equal(result.onuTypes[0].name,'UNIT-2G');assert.equal(result.catalogue.tcont[1].maximum,50000);assert.equal(result.physicalPorts.length,16);assert(!JSON.stringify(result).includes('PW'));
 assert.equal(pnp.readCommands(model.physicalPorts).length,27);assert.throws(()=>pnp.readCommands(Array.from({length:21},(_,i)=>'1/1/'+i)));
});
test('native discovery accepts model names with spaces but preserves serial, duplicate and truncation guards',()=>{
 const header='OltIndex Model SN PW\n',row='gpon-olt_1/1/13 GM220-S XPON ZICG00112233 unit-secret';
 const parsed=pnp.discovery(header+row+'\nOLT#');assert.equal(parsed.length,1);assert.equal(parsed[0].model,'GM220-S XPON');assert.equal(parsed[0].serialNumber,'ZICG00112233');assert(!JSON.stringify(parsed).includes('unit-secret'));
 for(const value of[row.replace('ZICG00112233','ZICG0011223'),row.replace(' unit-secret',''),row.replace('GM220-S XPON','Model; reboot'),row.replace('GM220-S XPON','M'.repeat(81))])assert.throws(()=>pnp.discovery(header+value));
 assert.throws(()=>pnp.discovery(header+row+'\n'+row));const duplicate=pnp.discovery(header+row+'\n'+row.replace('1/1/13','1/1/12'));assert(duplicate.every(x=>x.ambiguous));
});
test('malformed, cross-PON, special UNI and ambiguous model/type output fail closed',()=>{
 assert.throws(()=>pnp.globalState('GPON bandwidth profile: default\nGPON: N/A'));
 assert.throws(()=>pnp.portState(reply('show onu-pnp olt config gpon-olt_'+key,state()),'1/1/12'));
 assert.throws(()=>pnp.portState(reply('show onu-pnp olt config gpon-olt_'+key,state())+'\nUNI Mode VLAN\neth_0/1 tag 100',key));
 assert.throws(()=>pnp.types(reply('show onu-type gpon',state()).replace('GPON','EPON')));
 assert.throws(()=>pnp.discovery('OltIndex Model SN PW\ngpon-olt_1/1/13 truncated'));
 const both=pnp.discovery('OltIndex Model SN PW\ngpon-olt_1/1/13 M HWTCAABBCCDD N/A\ngpon-olt_1/1/12 M HWTCAABBCCDD N/A');assert(both.every(row=>row.ambiguous));
});
test('empty discovery recognizes both verified firmware codes and rejects contradictory or unrelated errors',()=>{
 for(const code of['62310-GPONSRV','70285'])assert.deepEqual(pnp.discovery('show pon onu uncfg\n%Code '+code+' : No related information to show.\nOLT#'),[]);
 assert.throws(()=>pnp.discovery('%Code 70285 : No related information to show.\ngpon-olt_1/1/13 M HWTCAABBCCDD N/A'));
 assert.throws(()=>pnp.discovery('%Code 10000 : Unauthorized'));
});
test('safe settings require existing real profiles/VLAN and protect shared globals and existing ONU commands',()=>{
 const model=state(),before=structuredClone(model),desired=pnp.desired(model,selection());assert.equal(desired.vlan,100);
 for(const extra of[{bandwidth:'unknown'},{onuType:'HG-SAMPLE'},{bandwidth:'UP-50\nwrite'},{vlan:1},{vlan:101},{vlanMode:'qinq'},{ponKey:key+';reboot'},{enabled:'true'}])assert.throws(()=>pnp.desired(model,selection(extra)));
 const commands=pnp.writeCommands(model,desired);assert(!commands.includes('enable gpon-olt_1/1/12'));assert(!commands.some(command=>/shutdown|no onu |^onu [0-9]|^write$|^reboot$/.test(command)));assert.equal(commands.filter(command=>command==='enable').length,1);assert.equal(commands.at(-3),'end');assert.equal(commands.at(-4),'enable gpon-olt_'+key);assert.deepEqual(model,before);
 model.ports[0].enabled=true;assert.throws(()=>pnp.desired(model,selection()),/bersama/);model.global.bandwidth='UP-50';model.global.onuType='UNIT-2G';assert(pnp.desired(model,selection()).enabled);model.global.enabled=true;assert.throws(()=>pnp.desired(model,selection({enabled:false})),/global/);
});
test('disable is PON-specific and never deletes existing ONU or changes VLAN/profile/global activation',()=>{
 const model=state(),value=pnp.desired(model,{ponKey:key,enabled:false});assert.deepEqual(pnp.mutations(model,value),['disable gpon-olt_'+key]);assert(!pnp.writeCommands(model,value).includes('disable'));assert(!pnp.writeCommands(model,value).some(command=>/^interface |^onu \d/.test(command)));
});
test('automatic ONU-type reuses an existing OLT fallback or one exact discovered model, never guessing vendor or radio aliases',()=>{
 const model=state();model.global.onuType='UNIT-2G';assert.equal(pnp.desired(model,selection({onuType:''})).onuType,'UNIT-2G');model.global.onuType='';model.onuTypes.push({name:'HG-SAMPLE',tcont:8,gem:32});assert.equal(pnp.desired(model,selection({onuType:''})).onuType,'HG-SAMPLE');model.newOnus[0].model='Huawei 5G';assert.throws(()=>pnp.desired(model,selection({onuType:''})),/belum terpetakan/);model.newOnus[0].model='HG-SAMPLE';model.newOnus[0].ambiguous=true;assert.throws(()=>pnp.desired(model,selection({onuType:''})));assert.equal(pnp.desired(model,selection({enabled:false,onuType:''})).enabled,false);
});
test('automatically resolved fallback is tied to the observed PON models before any configuration command',()=>{
 const model=state();model.onuTypes.push({name:'HG-SAMPLE',tcont:8,gem:32});const value=pnp.desired(model,selection({onuType:''}));assert.equal(value.autoMatch,true);const first=pnp.proof(model,value),changed=structuredClone(model);changed.newOnus[0].model='OTHER';assert.notEqual(pnp.proof(changed,value),first);changed.newOnus[0].model='HG-SAMPLE';changed.newOnus[0].ambiguous=true;assert.notEqual(pnp.proof(changed,value),first);changed.newOnus[0].ambiguous=false;changed.newOnus[0].serialNumber='HWTC11223344';assert.equal(pnp.proof(changed,value),first);
});
test('native PnP is a PON preset, not approval for the one sample SN or a per-ONU acceptance queue',()=>{
 const model=state();model.global.onuType='UNIT-2G';const value=pnp.desired(model,selection({onuType:''})),before=pnp.proof(model,value),commands=pnp.mutations(model,value);
 assert(!commands.some(command=>/\bsn\b|HWTCAABBCCDD|^onu \d|^interface gpon-onu_/i.test(command)));
 model.newOnus=[];assert.equal(pnp.proof(model,value),before);assert.deepEqual(pnp.mutations(model,pnp.desired(model,selection({onuType:''}))),commands);
 model.newOnus=[{ponKey:key,model:'ANOTHER-MODEL',serialNumber:'ZTEG11223344',ambiguous:false},{ponKey:key,model:'THIRD-MODEL',serialNumber:'FHTT55667788',ambiguous:false}];
 assert.equal(pnp.proof(model,value),before);assert.deepEqual(pnp.mutations(model,pnp.desired(model,selection({onuType:''}))),commands);
 assert.equal(commands.at(-1),'enable gpon-olt_'+key);assert(!commands.includes('enable'));assert(!commands.includes('write'));
});
test('native trunk never claims to enforce a chosen VLAN list or silently uses its first entry',()=>{
 for(const vlanMode of['fixed','transparent'])assert.throws(()=>pnp.desired(state(),selection({vlanMode,vlans:[100,200]})),/Multi-VLAN selektif/);
 const value=pnp.desired(state(),selection({vlanMode:'transparent'})),commands=pnp.mutations(state(),value);assert.equal(value.vlan,null);assert(commands.includes('olt-vlan transparent gpon-olt_'+key));assert(commands.includes('onu-vlan gpon-olt_'+key+' mode transparent'));assert(!commands.some(command=>/vlan 100/.test(command)));
});
test('several selected VLANs persist separately per PON and survive JSON reload without changing native PnP or business data',async()=>{
 const{data,device,actor}=fixture(),model=state();model.catalogue.vlans=[1,100,200,300];let calls=0;
 await pnp.read(data,device,actor,key,{transportOptions:{transports:{commands:async({commands})=>{calls++;return readReply(commands,model);}}}});
 const before={customers:structuredClone(data.customers),payments:structuredClone(data.payments),settings:structuredClone(data.settings)},revision=device.updatedAt;
 const first=pnp.savePreset(data,device,actor,{ponKey:key,vlanMode:'selected',vlans:[200,100],bandwidth:'UP-50',onuType:'',presetRevision:''}),second=pnp.savePreset(data,device,actor,{ponKey:'1/1/1',vlanMode:'selected',vlans:[300,200],bandwidth:'default',onuType:'UNIT-2G',presetRevision:''});
 assert.deepEqual(first.vlans,[100,200]);assert.deepEqual(second.vlans,[200,300]);assert.equal(calls,1);assert.equal(device.updatedAt,revision);assert.equal(model.ports.find(row=>row.ponKey===key).enabled,false);
 const loaded=require('../src/store').ensureShape(JSON.parse(JSON.stringify(data))),copy=loaded.oltDevices.find(row=>row.id===device.id);assert.deepEqual(pnp.presets(copy)[key],first);assert.deepEqual(pnp.presets(copy)['1/1/1'],second);assert(!JSON.stringify(pnp.presets(copy)).includes('connection'));assert(!JSON.stringify(pnp.presets(copy)).includes('unit-password'));
 await assert.rejects(pnp.prepare(data,device,actor,{ponKey:key,enabled:true,presetRevision:first.revision},{transportOptions:{transports:{commands:()=>{throw Error('No transport allowed');}}}}),/multi-VLAN tersimpan/);assert.equal(calls,1);
 const edited=pnp.savePreset(data,device,actor,{...first,vlans:[100],presetRevision:first.revision});assert.notEqual(edited.revision,first.revision);assert.deepEqual(pnp.presets(device)['1/1/1'],second);assert.deepEqual(pnp.selectedPreset(device,{ponKey:key,presetRevision:edited.revision,enabled:true}),{ponKey:key,enabled:true,bandwidth:'UP-50',onuType:'',vlanMode:'fixed',vlan:100});
 assert.throws(()=>pnp.selectedPreset(device,{ponKey:key,presetRevision:first.revision,enabled:true}),/berubah/);assert.deepEqual(data.customers,before.customers);assert.deepEqual(data.payments,before.payments);assert.deepEqual(data.settings,before.settings);
});
test('preset validation rejects stale edits, cross-OLT connections, unavailable VLANs, injection and unauthorized roles',async()=>{
 const{data,device,actor}=fixture(),model=state(),input={ponKey:key,vlanMode:'selected',vlans:[100],bandwidth:'UP-50',onuType:'',presetRevision:''};
 await pnp.read(data,device,actor,key,{transportOptions:{transports:{commands:async({commands})=>readReply(commands,model)}}});
 for(const change of[{vlans:[]},{vlans:[100,100]},{vlans:[101]},{vlans:['100']},{vlans:[1]},{vlans:[100.5]},{vlans:Array.from({length:17},(_,i)=>i+2)},{vlanMode:'transparent'},{vlanMode:'bogus'},{bandwidth:'UP-50\nreboot'},{onuType:'not-known'},{ponKey:'1/1/17'},{ponKey:key+';reboot'},{presetRevision:'stale'}]){const before=JSON.stringify(data);assert.throws(()=>pnp.savePreset(data,device,actor,{...input,...change}));assert.equal(JSON.stringify(data),before);}
 const row=pnp.savePreset(data,device,actor,input);assert.throws(()=>pnp.savePreset(data,device,actor,input),/berubah/);const changed={...device,host:'192.0.2.199'};assert.deepEqual(pnp.presets(changed),{});assert.throws(()=>pnp.selectedPreset(changed,{ponKey:key,presetRevision:row.revision,enabled:true}));
 actor.role='finance';assert.throws(()=>pnp.savePreset(data,device,actor,{...input,presetRevision:row.revision}),error=>error.status===403);actor.role='technician';actor.position='Kepala Teknisi';actor.lockedNasIds=['nas-other'];assert.throws(()=>pnp.savePreset(data,device,actor,{...input,presetRevision:row.revision}),error=>error.status===403);
});
test('auto60 preset persists before profiles exist, never inherits fixed 10M, and holds unsafe numeric reservations',async()=>{
 const{data,device,actor}=fixture(),model=state();await pnp.read(data,device,actor,key,{transportOptions:{transports:{commands:async({commands})=>readReply(commands,model)}}});
 const preset=pnp.savePreset(data,device,actor,{ponKey:key,vlanMode:'selected',vlans:[100],bandwidthMode:'auto60',bandwidth:'default',onuType:'UNIT-2G',presetRevision:''});assert.equal(preset.bandwidth,'FB-BE60-UP');assert.equal(preset.bandwidthMode,'auto60');assert.equal(pnp.presets(device)[key].bandwidthMode,'auto60');assert.equal(pnp.selectedPreset(device,{ponKey:key,presetRevision:preset.revision,enabled:true}).bandwidthMode,'auto60');assert.equal(model.global.bandwidth,'default');
 for(const row of[{type:1,fixed:60000,assured:0,maximum:0},{type:4,fixed:64,assured:0,maximum:60000},{type:4,fixed:0,assured:64,maximum:60000},{type:4,fixed:0,assured:0,maximum:120000}]){model.catalogue.tcont.push({name:'UNSAFE',...row});assert.throws(()=>pnp.desired(model,selection({bandwidthMode:'auto60',bandwidth:'UNSAFE'})),/fixed\/assured 0/);model.catalogue.tcont.pop();}
 model.catalogue.tcont.push({name:'FB-BE60-UP',type:4,fixed:0,assured:0,maximum:60000});assert.equal(pnp.desired(model,selection({bandwidthMode:'auto60',bandwidth:'FB-BE60-UP'})).bandwidthMode,'auto60');
});
test('saving the PnP enable choice persists per PON across reloads without claiming or changing actual native state',async()=>{
 const{data,device,actor}=fixture(),model=state();let reads=0;const original=structuredClone(model),input={ponKey:key,vlanMode:'selected',vlans:[100],bandwidth:'UP-50',onuType:'',presetRevision:''};
 await pnp.read(data,device,actor,key,{transportOptions:{transports:{commands:async({commands})=>{reads++;return readReply(commands,model);}}}});
 const selected=pnp.savePreset(data,device,actor,{...input,requestedEnabled:true}),other=pnp.savePreset(data,device,actor,{...input,ponKey:'1/1/1',requestedEnabled:false});
 const loaded=JSON.parse(JSON.stringify(data)).oltDevices.find(row=>row.id===device.id);assert.equal(pnp.presets(loaded)[key].requestedEnabled,true);assert.equal(pnp.presets(loaded)['1/1/1'].requestedEnabled,false);assert.deepEqual(model,original);assert.equal(pnp.saved(device).ports.find(row=>row.ponKey===key).enabled,false);assert.equal(reads,1);
 const unchanged=pnp.savePreset(data,device,actor,{...input,presetRevision:selected.revision});assert.equal(unchanged.requestedEnabled,true);const disabled=pnp.savePreset(data,device,actor,{...input,presetRevision:unchanged.revision,requestedEnabled:false});assert.equal(disabled.requestedEnabled,false);assert.deepEqual(pnp.presets(device)['1/1/1'],other);
 for(const requestedEnabled of['true','false',1,0,null,[],{}])assert.throws(()=>pnp.savePreset(data,device,actor,{...input,presetRevision:disabled.revision,requestedEnabled}),/aktif\/nonaktif PnP/);
 const multi=pnp.savePreset(data,device,actor,{...input,presetRevision:disabled.revision,requestedEnabled:true,vlanMode:'transparent',vlans:[]});assert.equal(multi.requestedEnabled,true);assert.throws(()=>pnp.selectedPreset(device,{ponKey:key,presetRevision:multi.revision,enabled:false}),/Simpan pilihan/);assert.equal(pnp.selectedPreset(device,{ponKey:key,presetRevision:multi.revision,enabled:true}).enabled,true);assert.deepEqual(model,original);assert.equal(reads,1);
});
test('same-session preflight, configuration prompt, vendor errors and mismatching final state are all checked',()=>{
 const model=pnp.inspect(readReply(pnp.readCommands(state().physicalPorts),state()),state().physicalPorts),value=pnp.desired(model,selection()),grant={state:model,value,commands:pnp.writeCommands(model,value)},n=pnp.readCommands(model.physicalPorts).length;
 pnp.verifyStep(readReply(pnp.readCommands(model.physicalPorts),model).outputs,grant,n-1,'OLT#');const other=structuredClone(model);other.global.bandwidth='UP-50';assert.throws(()=>pnp.verifyStep(readReply(pnp.readCommands(model.physicalPorts),other).outputs,grant,n-1,'OLT#'));
 assert.throws(()=>pnp.verifyStep([],grant,n,'OLT#'));assert.throws(()=>pnp.verifyStep([],grant,n+1,'OLT(config-if)#'));assert.throws(()=>pnp.verifyStep([{stdout:'%Code 1000 : denied'}],grant,n+2,'OLT(config-onu-pnp)#'));
 assert.throws(()=>pnp.readback(readReply(['show onu-pnp config','show onu-pnp olt config gpon-olt_'+key],model),grant));
});
test('PnP management is limited to admin, secretary and actual head technicians with NAS scope',()=>{
 const{data,device}=fixture();for(const [role,position,allowed]of[['admin','',true],['secretary','',true],['technician','Kepala Teknisi dan Perlengkapan',true],['technician','Staf Teknisi',false],['finance','',false],['collector','',false],['owner','',false],['noc','',false]]){const actor={id:'roles',role,position,active:true};data.users=[actor];assert.equal(pnp.canManage(data,device,actor),allowed,role+position);assert.equal(auth.hasPermission(auth.publicUser(actor),'olt:pnp:manage'),allowed);}
 const actor={id:'head',role:'technician',position:'Kepala Teknisi',active:true,lockedNasIds:['nas-other']};data.users=[actor];assert.equal(pnp.canManage(data,device,actor),false);actor.active=false;assert.equal(pnp.canManage(data,device,actor),false);
});
test('native shell applies only after unchanged preflight and verifies enable/disable readback without touching another PON',async()=>{
 const{PassThrough}=require('node:stream'),[,context,transport]=await vendors.loadLibrary();
 for(const scenario of['enable','disable','changed','wrong-prompt','vendor-error']){
  const{data,device}=fixture(),model=state();if(scenario==='disable')model.ports.find(row=>row.ponKey===key).enabled=true;
  const baseline=pnp.inspect(readReply(pnp.readCommands(model.physicalPorts),model),model.physicalPorts),value=pnp.desired(baseline,selection({enabled:scenario!=='disable'})),commands=pnp.writeCommands(baseline,value),writes=[];
  const result=await context.withContext(data,device,()=>{context.authorizePnpOperation(baseline,value);context.current().pnpGrant.used=true;return transport.shellSession({olt:vendors.legacyDevice(device),password:'unit',commands,timeoutMs:2000},({ready})=>{const stream=new PassThrough();stream.write=chunk=>{writes.push(chunk);const command=String(chunk).trim();if(scenario==='changed'&&command==='show onu-pnp config')model.global.bandwidth='UP-50';let text=reply(command,model);if(scenario==='wrong-prompt'&&command==='onu-pnp')text='OLT(config-if)#';if(scenario==='vendor-error'&&command.startsWith('bandwidth gpon '))text='%Code 123 : rejected\nOLT(config-onu-pnp)#';queueMicrotask(()=>stream.emit('data',text));return true;};ready(stream,()=>{},true);queueMicrotask(()=>stream.emit('data','OLT#'));});},{pnpActionAllowed:true});
  if(['enable','disable'].includes(scenario)){assert.equal(result.success,true,result.error);assert(result.verified);assert(result.submitted);assert.equal(model.ports.find(row=>row.ponKey===key).enabled,scenario==='enable');assert(model.ports.filter(row=>row.ponKey!==key).every(row=>!row.enabled));assert(!model.global.enabled);}
  else{assert(!result.success);assert.equal(writes.includes('enable gpon-olt_'+key+'\n'),false);if(scenario!=='vendor-error')assert.equal(result.submitted,false);}
 }
});
test('one-shot grant rejects raw mutations, altered target/commands, repeat use and unconfirmed Dev writes',async()=>{
 const{data,device}=fixture(),[,context,transport]=await vendors.loadLibrary(),model=state(),value=pnp.desired(model,selection());process.env.MIGRATION_MODE='1';let calls=0;
 try{await assert.rejects(context.withContext(data,device,()=>context.authorizePnpOperation(model,value),{allowZteDevRead:true,pnpActionAllowed:true}),/authorization/);
 await context.withContext(data,device,async()=>{await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(device),commands:['onu-pnp','enable gpon-olt_'+key]}));context.authorizePnpOperation(model,value);const commands=pnp.writeCommands(model,value);await assert.rejects(transport.executeOltCommands({olt:{...vendors.legacyDevice(device),id:'other'},commands}));},{allowZteDevRead:true,pnpActionAllowed:true,explicitDevPnpAction:true});
 await context.withContext(data,device,async()=>{context.authorizePnpOperation(model,value);const commands=pnp.writeCommands(model,value);await transport.executeOltCommands({olt:vendors.legacyDevice(device),commands});await assert.rejects(transport.executeOltCommands({olt:vendors.legacyDevice(device),commands}));},{allowZteDevRead:true,pnpActionAllowed:true,explicitDevPnpAction:true,transports:{commands:async()=>{calls++;return{success:false,submitted:false};}}});assert.equal(calls,1);
 }finally{process.env.MIGRATION_MODE='0';}
});
test('prepared native PnP is bound to actor/revision/confirmation, audited and never replayed after uncertain delivery',async()=>{
 const{data,device,actor}=fixture(),model=state();let calls=0,audits=0,reads=0;
 const options={transportOptions:{transports:{commands:async({commands})=>{if(commands.includes('onu-pnp')){calls++;return{success:false,submitted:true,error:'lost readback'};}reads++;return readReply(commands,model);}}},beforeSend:async()=>{audits++;},afterSend:async()=>{audits++;}};
 const before=structuredClone(data);await pnp.read(data,device,actor,key,options);assert.equal(pnp.saved(device).ports[0].enabled,false);await new Promise(resolve=>setTimeout(resolve,3010));const plan=await pnp.prepare(data,device,actor,selection(),options),input={token:plan.token,revision:device.updatedAt||'',confirmId:device.id,confirmTarget:key,confirmImpact:true};
 await assert.rejects(pnp.execute(data,device,actor,{...input,confirmImpact:false},options));await assert.rejects(pnp.execute(data,{...device,updatedAt:'changed'},actor,input,options));
 const result=await pnp.execute(data,device,actor,input,options);assert.equal(result.uncertain,true);assert.equal(result.verified,false);assert.equal(calls,1);assert.equal(audits,2);assert.equal(reads,2);assert.equal(pnp.saved(device),null);assert.deepEqual(await pnp.execute(data,device,actor,input,options),result);assert.equal(calls,1);assert.deepEqual(data,before);
});
test('endpoint uses stored roles/NAS, bounded body, before-send audit and cache-only GET; scripts include runtime',()=>{
 const server=fs.readFileSync(require.resolve('../src/server.js'),'utf8'),part=server.slice(server.indexOf('const oltZtePnp='),server.indexOf('const oltZteProfiles='));for(const text of["requirePermission(req,res,'olt:pnp:manage')",'scopedDevices','readBody(req,4096)','beforeSend:','afterSend:','pnp.signature(latest)','state:pnp.saved(device)'])assert(part.includes(text),text);
 for(const file of['../install.sh','../deploy/bin/fakenet-billing-update'])assert(require('./helpers/install-payload').payloadSource(file.replace(/^\.\.\//,'')).includes('src/olt-zte-pnp.js'));
});
