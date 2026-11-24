'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const inventory=require('../src/olt-zte-inventory'),vendors=require('../src/olt-vendors'),olt=require('../src/olt-monitor'),secrets=require('../src/secure-secrets');
process.env.MIGRATION_MODE='0';process.env.REDIS_CACHE='0';
const header='Rack Shelf Slot CfgType RealType Port  HardVer SoftVer         Status';
const card=()=>header+'\n-------------------------------------------------------------------------------\n1    1     1    GTGH    GTGHG    16    V1.0.0  V2.1.0          INSERVICE\n1    1     3    SMXA    SMXA     3     V1.0.0  V2.1.0          INSERVICE\n1    1     4    SMXA             3                             OFFLINE\nOLT#';
const stateHeader='OnuIndex   Admin State  OMCC State  Phase State  Channel\n--------------------------------------------------------------\n';
function status(rows=[['1/1/1:1','working'],['1/1/1:2','DyingGasp'],['1/1/2:1','OffLine']]){
 return stateHeader+rows.map(([id,phase,admin='enable'])=>`${id} ${admin} ${phase==='working'?'enable':'disable'} ${phase} 1(GPON)`).join('\n')+`\nONU Number: ${rows.filter(([,phase,admin='enable'])=>phase==='working'&&admin==='enable').length}/${rows.length}\nOLT#`;
}
function base(pon,rows){return'OnuIndex            Type        Mode    AuthInfo                State\n-------------------------------------------------------------------------------\n'+rows.map(([id,sn])=>`gpon-onu_${pon}:${id} UNIT-2G sn SN:${sn} ready`).join('\n')+'\nOLT#';}
const samples=()=>new Map([['1/1/1',base('1/1/1',[[1,'HWTCAABBCC01'],[2,'HWTCAABBCC02']])],['1/1/2',base('1/1/2',[[1,'ZTEGAABBCC01']])]]);
function identities(){const result=new Map();for(const[pon,stdout]of samples())for(const[id,row]of inventory.base(stdout,pon))result.set(id,row);return result;}
function fixture(id='zte-inventory-unit'){const data={settings:{},oltDevices:[]},device={id,name:'Unit OLT',vendor:'zte',host:'192.0.2.66',port:161,enabled:true,cliEnabled:true,cliUsername:'unit',cliProtocol:'telnet',cliPort:23,links:{},updatedAt:new Date().toISOString()};device.communityEnc=secrets.encryptSecret(data,'unit-read');device.cliPasswordEnc=secrets.encryptSecret(data,'unit-password');data.oltDevices=[device];return{data,device};}
const table=async(_,name)=>name==='system'?[{oid:olt.OIDS.system+'.2.0',type:'OID',value:'.1.3.6.1.4.1.3902.1082.1001.320.2.1'},{oid:olt.OIDS.system+'.1.0',type:'STRING',value:'C320 Version V2.1.0 Software'},{oid:olt.OIDS.system+'.5.0',type:'STRING',value:'OLT'}]:[];
test('verified C320 cards include all sixteen physical PONs, including empty PONs, without treating control boards as PONs',()=>{
 const ports=inventory.cards(card());assert.equal(ports.length,16);assert.equal(ports[0].ponKey,'1/1/1');assert.equal(ports.at(-1).ponKey,'1/1/16');assert(ports.every(row=>row.status==='unknown'));
 const result=inventory.join(inventory.states(status()),identities(),ports);assert.equal(result.rows.length,3);assert.equal(result.ports[0].status,'online');assert.equal(result.ports[1].status,'unknown');assert.equal(result.ports.at(-1).status,'unknown');assert(result.rows.every(row=>row.frame===1));
});
test('status parser separates online, explicit Dying Gasp, explicit LOS, unknown and generic offline without manufacturing an outage',()=>{
 const rows=[...inventory.states(status([['1/1/1:1','working'],['1/1/1:2','DyingGasp'],['1/1/1:3','LOS'],['1/1/1:4','OffLine'],['1/1/1:5','syncMib'],['1/1/1:6','LOS','disable']])).values()];assert.deepEqual(rows.map(row=>row.condition),['online','dying-gasp','los','other','unknown','other']);assert.deepEqual(rows.map(row=>row.causeKnown),[false,true,true,false,false,false]);
});
test('incomplete tables, footer mismatches, invalid positions and duplicate positions fail closed',()=>{
 for(const raw of[status().replace('1/3','0/3'),status().replace('1/3','1/4'),status().replace('ONU Number:','Truncated:'),status().replace('1/1/2:1','1/1/1:1'),status().replace('1/1/2:1','1/1/0:1'),status().replace('OffLine 1(GPON)','OffLine')])assert.throws(()=>inventory.states(raw));
 assert.equal(inventory.states(status([])).size,0);
 for(const value of['1/1/1:1;write','1/1/1:1\nreboot','1/1/0:1','1/1/33:1','1/1/1:0','99/1/1:1'])assert.equal(inventory.position(value),null);
});
test('missing identities, duplicate identities and mismatched PONs cannot silently reduce ONU totals',()=>{
 assert.throws(()=>inventory.base(samples().get('1/1/1'),'1/1/2'));assert.throws(()=>inventory.base(samples().get('1/1/1').replace('HWTCAABBCC01','-'),'1/1/1'));
 assert.throws(()=>inventory.base(base('1/1/1',[[1,'HWTCAABBCC01'],[1,'HWTCAABBCC02']]),'1/1/1'));
 const ids=identities();ids.delete('1/1/2:1');assert.throws(()=>inventory.join(inventory.states(status()),ids,inventory.cards(card())));
 assert.throws(()=>inventory.join(inventory.states(status()),identities(),inventory.cards(card()).slice(2)));
});
test('duplicate serials across PONs remain separate ambiguous observations, never merged into one ONU',()=>{
 const ids=identities();ids.get('1/1/2:1').serialNumber='HWTCAABBCC01';const result=inventory.join(inventory.states(status()),ids,inventory.cards(card()));assert.equal(result.rows.length,3);assert.equal(result.rows.filter(row=>row.identityAmbiguous).length,2);assert(result.rows.filter(row=>row.identityAmbiguous).every(row=>!row.causeKnown));
});
test('unverified cards or invalid physical port counts cannot invent a topology',()=>{
 assert.throws(()=>inventory.cards(card().replace('GTGH    GTGHG','UNKNOWN UNKNOWN')));
 assert.throws(()=>inventory.cards(card().replace('GTGHG    16','GTGHG    99')));
 assert.throws(()=>inventory.cards('invalid'));
});
test('ZTE physical port merging preserves frames, skips virtual ONU interfaces and deduplicates SNMP/CLI PONs',()=>{
 const result=vendors.monitoringPorts({vendor:'zte'},[{id:'snmp1',name:'gpon-olt_1/1/1',status:'online'},{id:'onu1',name:'gpon-onu_1/1/1:1',status:'online'},{id:'uplink',name:'gei_1/3/1',status:'online'}],{ports:inventory.cards(card()),modelLabel:'ZTE C320'});
 assert.equal(result.ports.filter(row=>row.kind==='pon').length,16);assert.equal(result.ports.filter(row=>row.kind==='uplink').length,1);assert.equal(result.modelLabel,'ZTE C320');assert.equal(vendors.ponPosition('gpon_olt-1/1/2','zte').ponKey,'1/1/2');assert.equal(vendors.ponPosition('gpon-onu_1/1/2:1','zte'),null);
});
test('large inventory uses per-PON bulk tables with session-only pagination, not per-ONU detail queries',async()=>{
 const{data,device}=fixture();let calls=0;const requested=[];
 const result=await vendors.readInventory(data,device,{}, {transports:{commands:async({commands,timeoutMs})=>{calls++;requested.push(...commands);assert(timeoutMs>12000&&timeoutMs<=18000);assert.deepEqual(commands.slice(0,2),['enable','terminal length 0']);return{success:true,outputs:commands.map(command=>({command,stdout:command==='show card'?card():command==='show gpon onu state'?status():samples().get(command.split('_').at(-1))||'OLT#'}))};}}});
 assert.equal(calls,3);assert.equal(requested.filter(command=>command.startsWith('show running-config interface gpon-olt_')).length,16);assert.equal(requested.filter(command=>command.includes('baseinfo')).length,2);assert.equal(requested.filter(command=>command==='show gpon onu state').length,2);assert.equal(result.rows.length,3);assert.equal(result.ports.length,16);assert(!JSON.stringify(result).includes('unit-password'));assert(!JSON.stringify(result).includes('stdout'));assert(requested.every(command=>command==='enable'||command==='terminal length 0'||command.startsWith('show ')));
});
test('failed or incomplete CLI results and inventory changes during a read do not report a successful zero inventory',async()=>{
 for(const failure of['transport','identity','changed']){const{data,device}=fixture();let calls=0;await assert.rejects(inventory.read(data,device,{}, {transports:{commands:async({commands})=>{calls++;return{success:failure!=='transport',outputs:commands.filter(command=>!(calls===2&&failure==='identity'&&command.includes('baseinfo'))).map(command=>({command,stdout:command==='show card'?card():command==='show gpon onu state'?status(calls===2&&failure==='changed'?[['1/1/1:1','working']]:undefined):samples().get(command.split('_').at(-1))||'OLT#'}))};}}}));}
});
test('monitoring reads system and cached topology correctly and retains a previous snapshot after a partial refresh',async()=>{
 const{data,device}=fixture('zte-poll-preserve'),original=vendors.readInventory;try{vendors.readInventory=async()=>inventory.join(inventory.states(status()),identities(),inventory.cards(card()));const first=await olt.poll(data,device,table);assert.equal(first.modelLabel,'ZTE C320');assert.equal(first.summary.total,3);assert.equal(first.summary.online,1);assert.equal(first.ports.length,16);
 vendors.readInventory=async()=>{throw Error('truncated');};const next=await olt.poll(data,device,table);assert(next.stale);assert.equal(next.status,'online');assert.equal(next.inventoryAvailable,false);assert.equal(next.summary.total,3);assert.equal(next.ports.length,16);assert.deepEqual(next.onus,first.onus);assert(next.lastSuccessAt);
 }finally{vendors.readInventory=original;}
});
test('CLI-card ZTE inventory avoids unsupported IF-MIB walks while leaving non-ZTE polling unchanged',async()=>{
 const{data,device}=fixture(),original=vendors.readInventory,calls=[];try{vendors.readInventory=async()=>inventory.join(inventory.states(status()),identities(),inventory.cards(card()));await olt.collect(data,device,async(...args)=>{calls.push(args[1]);return table(...args);});assert.deepEqual(calls,['system']);}finally{vendors.readInventory=original;}
});
test('ZTE identity uses one bounded four-value GET, including retry for a dropped UDP response, not a system MIB walk',async()=>{
 let calls=0;const rows=await olt.readSystemIdentity({host:'192.0.2.60',port:1616,community:'unit-read'},async(command,args,options)=>{calls++;assert.equal(command,'snmpget');assert.deepEqual(args.slice(-4),['2.0','1.0','3.0','5.0'].map(suffix=>olt.OIDS.system+'.'+suffix));assert(args.includes('192.0.2.60:1616'));assert.equal(args[args.indexOf('-r')+1],'0');assert.equal(args[args.indexOf('-t')+1],'1');assert.equal(options.timeout,2000);assert.equal(options.maxBuffer,32768);if(calls===1)throw Object.assign(Error('timeout'),{code:1,stderr:'Timeout: No Response'});return{stdout:'1.3.6.1.2.1.1.2.0 = OID: .1.3.6.1.4.1.3902\n1.3.6.1.2.1.1.1.0 = STRING: C320 Version V2.1.0'};});assert.equal(calls,2);assert.equal(rows.length,2);
});
test('ambiguous duplicate SN observations are never attributed to a manual customer link',()=>{
 const{data,device}=fixture();data.customers=[{id:'m1',name:'Unit Customer'}];device.links={'HWTCAABBCC01':{customerId:'m1'}};const row=olt.linkedOnus(data,device,[{...identities().get('1/1/1:1'),identityAmbiguous:true,status:'online'}])[0];assert.equal(row.customerId,'');assert.equal(row.customerName,'');
});
test('non-ZTE SNMP identity cannot be combined with ZTE ONU inventory',async()=>{
 const{data,device}=fixture();await assert.rejects(olt.collect(data,device,async()=>[{oid:olt.OIDS.system+'.2.0',type:'OID',value:'.1.3.6.1.4.1.17409'}]),/bukan OLT ZTE/);
});
test('dev manual refresh exception is ZTE-only and its grant is forwarded without enabling other vendors or global refresh',async()=>{
 const{data,device}=fixture('zte-refresh-dev'),original=vendors.readInventory;process.env.MIGRATION_MODE='1';let granted=false;
 try{vendors.readInventory=async(_,__,___,options)=>{granted=options.allowZteDevRead;return inventory.join(inventory.states(status()),identities(),inventory.cards(card()));};await olt.collect(data,device,table,undefined,{allowZteDevRead:true});assert.equal(granted,true);assert.throws(()=>olt.requestRefresh(data,device),/terisolasi/);assert.throws(()=>olt.requestRefresh(data,{...device,vendor:'cdata'},{allowZteDevRead:true}),/terisolasi/);assert.throws(()=>olt.requestRefreshAll(data,[device]),/terisolasi/);
 }finally{process.env.MIGRATION_MODE='0';vendors.readInventory=original;}
});
test('ONU pagination and PON filters use cached inventory and never query the OLT on a page read',async()=>{
 const{data,device}=fixture('zte-inventory-pages'),original=vendors.readInventory;let calls=0;try{vendors.readInventory=async()=>{calls++;return inventory.join(inventory.states(status()),identities(),inventory.cards(card()));};await olt.poll(data,device,table);const result=await olt.onuPage(data,[device],{oltId:device.id,pon:'1/1/2',limit:25},true);assert.equal(result.total,1);assert.equal(result.onus[0].serialNumber,'ZTEGAABBCC01');assert.equal(result.device.onuDeleteAvailable,true);assert.equal(result.device.onuRebootAvailable,true);assert.equal(result.device.onuRenameAvailable,false);assert.equal(calls,1);assert.equal(result.ports.length,16);assert(!JSON.stringify(result).includes('unit-password'));}finally{vendors.readInventory=original;}
});
test('600 ONU synthetic tables parse without reducing counts or flattening physical shelf positions',()=>{
 const rows=Array.from({length:600},(_,index)=>[`1/1/${Math.floor(index/60)+1}:${index%60+1}`,index%10?'working':'DyingGasp']);const states=inventory.states(status(rows)),ids=new Map();for(let pon=1;pon<=10;pon++)for(const[id,row]of inventory.base(base(`1/1/${pon}`,Array.from({length:60},(_,index)=>[index+1,'HWTC'+((pon-1)*60+index).toString(16).padStart(8,'0')])),`1/1/${pon}`))ids.set(id,row);const result=inventory.join(states,ids,inventory.cards(card()));assert.equal(result.rows.length,600);assert.equal(result.rows.filter(row=>row.status==='online').length,540);assert.equal(result.ports.length,16);
});
test('installer and updater both verify new inventory and preview modules before activation',()=>{
 for(const name of['install.sh','deploy/bin/fakenet-billing-update']){const script=require('./helpers/install-payload').payloadSource(name);for(const module of['src/olt-zte-inventory.js','src/olt-zte-profiles.js'])assert(script.includes('    '+module+'\n'));}
 const source=fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8'),part=source.slice(source.indexOf("if (action === 'refresh' && method === 'POST')"),source.indexOf("if (action === 'link-options'"));assert(part.includes("device?.vendor === 'zte'"));assert(part.includes("auth.hasPermission(context.user,'olt:manage')"));
});
test('ONU RX parser keeps the native signed dBm value, never OLT-side power or N/A as zero',()=>{
 const expected=[{id:'1/1/1:1'},{id:'1/1/1:2'},{id:'1/1/1:3'}],text='Onu Rx power\ngpon-onu_1/1/1:1 -19.532(dbm)\ngpon-onu_1/1/1:2 N/A\ngpon-onu_1/1/1:3 +3.5(dbm)\nOLT#',result=inventory.powers(text,'1/1/1',expected);assert.equal(result.get('1/1/1:1'),-19.532);assert.equal(result.get('1/1/1:2'),null);assert.equal(result.get('1/1/1:3'),null);assert.throws(()=>inventory.powers(text,'1/1/2',expected));assert.throws(()=>inventory.powers(text,'1/1/1',[...expected,{id:'1/1/1:4'}]));
});
test('SNMP metadata is attributed only when physical index and exact SN match the CLI inventory',()=>{
 const result=inventory.join(inventory.states(status()),identities(),inventory.cards(card())),now=Date.now(),row=result.rows[0],key=inventory.metadataKey(row),columns={serial:new Map([[key,'1,'+row.serialNumber]]),name:new Map([[key,'Nama Asli']]),distance:new Map([[key,'2894']])},optics=new Map([[row.id,{value:-19.532,at:new Date(now).toISOString()}]]);inventory.enrich(result,null,columns,optics,now);assert.equal(result.rows[0].name,'Nama Asli');assert.equal(result.rows[0].distance,2894);assert.equal(result.rows[0].rxPower,-19.532);assert.equal(result.rows[1].name,'');assert.equal(result.rows[1].rxPower,null);
 const changed=inventory.join(inventory.states(status()),identities(),inventory.cards(card()));columns.serial.set(key,'1,HWTCFFFFFFFF');inventory.enrich(changed,{onus:result.rows},columns,optics,now+1000);assert.equal(changed.rows[0].name,'');assert.equal(changed.rows[0].rxPower,null);
});
test('cached optical values retain their measurement time and expire instead of becoming freshly measured on every refresh',()=>{
 const now=Date.now(),result=inventory.join(inventory.states(status()),identities(),inventory.cards(card())),row=result.rows[0],key=inventory.metadataKey(row),at=new Date(now-300000).toISOString(),previous={onus:[{...row,name:'Unit',distance:1234,rxPower:-20,rxPowerAt:at,metadataCheckedAt:at}]},columns={serial:new Map([[key,'1,'+row.serialNumber]])};inventory.enrich(result,previous,columns,new Map(),now);assert.equal(result.rows[0].rxPower,-20);assert.equal(result.rows[0].rxPowerAt,at);const snapshot={status:'online',checkedAt:new Date(now).toISOString(),onus:result.rows};assert.equal(olt.lastOptical(snapshot,result.rows[0]).at,at);
 const expired=inventory.join(inventory.states(status()),identities(),inventory.cards(card()));inventory.enrich(expired,previous,columns,new Map(),now+inventory.RX_MS);assert.equal(expired.rows[0].rxPower,null);
});
test('telemetry joins bounded SNMP columns and native per-PON RX reads only after exact CLI serial re-verification',async()=>{
 for(const mismatch of[false,true]){const{data,device}=fixture(),walks=[],commandsSeen=[],rows=inventory.join(inventory.states(status()),identities(),inventory.cards(card())).rows;let sessions=0;
  const read=()=>inventory.read(data,device,{}, {includeTelemetry:true,transports:{
   commands:async({commands})=>{sessions++;commandsSeen.push(...commands);return{success:true,outputs:commands.map(command=>{const pon=command.split('_').at(-1);let stdout=command==='show card'?card():command==='show gpon onu state'?status():command.includes('baseinfo')?samples().get(pon)||'OLT#':command.includes('onu-rx')?'Onu Rx power\n'+rows.filter(row=>row.ponKey===pon).map(row=>'gpon-onu_'+row.id+' -19.532(dbm)').join('\n')+'\nOLT#':'OLT#';if(mismatch&&sessions===3&&command.includes('baseinfo'))stdout=stdout.replace('HWTCAABBCC01','HWTCFFFFFFFF');return{command,stdout};})};},
   exec:async(command,args,options)=>{assert.equal(command,'snmpbulkwalk');assert(args.includes('-Cr15'));assert(options.timeout<=5000);const oid=args.at(-1),name=Object.keys(inventory.META_OIDS).find(key=>oid.startsWith(inventory.META_OIDS[key]+'.'));assert(name);const index=oid.slice(inventory.META_OIDS[name].length+1);assert(/^\d+$/.test(index));walks.push(name);return{stdout:rows.map((row,ordinal)=>({row,ordinal})).filter(({row})=>inventory.metadataKey(row).startsWith(index+':')).map(({row,ordinal})=>inventory.META_OIDS[name]+'.'+inventory.metadataKey(row).replace(':','.')+' = '+(name==='distance'?'INTEGER: 2894':'STRING: "'+(name==='serial'?'1,'+(mismatch&&ordinal===0?'HWTCFFFFFFFF':row.serialNumber):'Nama '+ordinal)+'"')).join('\n')};}
  }});
  if(mismatch){await assert.rejects(read(),/Identitas ONU berubah/);continue;}const result=await read();assert.deepEqual(walks,['name','distance','name','distance']);assert.equal(result.rows.length,3);assert.equal(result.rows[0].name,'Nama 0');assert.equal(result.rows[0].rxPower,-19.532);assert.equal(result.rows[0].distance,2894);assert(result.rows.slice(1).every(row=>row.rxPower===null));assert.equal(commandsSeen.filter(command=>command.includes('onu-rx')).length,2);assert(commandsSeen.every(command=>command==='enable'||command==='terminal length 0'||command.startsWith('show ')));
 }
});
test('native RX survives missing SNMP, partial metadata cache has independent age, and changed identity never borrows it',()=>{
 const now=Date.now(),result=inventory.join(inventory.states(status()),identities(),inventory.cards(card())),row=result.rows[0],key=inventory.metadataKey(row),at=new Date(now).toISOString(),proof=new Map([[row.id,row.serialNumber]]),optics=new Map([[row.id,{value:-20,at}]]);
 inventory.enrich(result,null,{name:new Map([[key,'Native name']])},optics,now,proof);assert.equal(result.rows[0].rxPower,-20);assert.equal(result.rows[0].name,'Native name');assert.equal(result.rows[0].metadataCheckedAt,'');
 const next=inventory.join(inventory.states(status()),identities(),inventory.cards(card()));inventory.enrich(next,{onus:result.rows},{distance:new Map([[key,'2894']])},new Map(),now+1000,proof);assert.equal(next.rows[0].name,'Native name');assert.equal(next.rows[0].distance,2894);assert.equal(next.rows[0].nameCheckedAt,at);assert.equal(next.rows[0].rxPowerAt,at);
 const changed=inventory.join(inventory.states(status()),identities(),inventory.cards(card()));changed.rows[0].serialNumber='HWTCFFFFFFFF';inventory.enrich(changed,{onus:next.rows},{},optics,now+2000,proof);assert.equal(changed.rows[0].name,'');assert.equal(changed.rows[0].rxPower,null);assert.equal(changed.rows[0].distance,null);
});
test('SNMP retry is opt-in, capped at three fresh sockets, and does not retry unsupported OIDs',async()=>{
 const{data,device}=fixture(),[,context]=await vendors.loadLibrary(),snmp=await import('../src/olt-vendor-library/services/snmp.js');let calls=0;
 const options={transports:{exec:async(_,args)=>{calls++;assert.equal(args[args.indexOf('-t')+1],'1');if(calls<3)throw Object.assign(Error('timeout'),{code:1,stderr:'Timeout: No Response from host'});return{stdout:inventory.META_OIDS.name+'.285278465.1 = STRING: "Unit"'};}}};
 const result=await context.withContext(data,device,()=>snmp.snmpWalk({olt:vendors.legacyDevice(device),oid:inventory.META_OIDS.name,udpTimeoutMs:1000,maxAttempts:3}),options);assert.equal(calls,3);assert.equal(result.size,1);
 calls=0;options.transports.exec=async()=>{calls++;return{stdout:'.1 = No Such Object available on this agent'};};await context.withContext(data,device,()=>snmp.snmpWalk({olt:vendors.legacyDevice(device),oid:inventory.META_OIDS.name,maxAttempts:3}),options);assert.equal(calls,1);
 for(const extra of[{maxAttempts:4},{maxAttempts:0},{maxAttempts:'3'},{udpTimeoutMs:50},{udpTimeoutMs:6000}])await assert.rejects(context.withContext(data,device,()=>snmp.snmpWalk({olt:vendors.legacyDevice(device),oid:inventory.META_OIDS.name,...extra}),options),/retry budget rejected/);
});
test('SNMP bulk sizing is opt-in and invalid sizes are rejected before spawning a process',async()=>{
 const{data,device}=fixture(),[,context]=await vendors.loadLibrary(),snmp=await import('../src/olt-vendor-library/services/snmp.js');let calls=0;
 const read=size=>context.withContext(data,device,()=>snmp.snmpWalk({olt:vendors.legacyDevice(device),oid:inventory.META_OIDS.name,maxRepetitions:size}),{transports:{exec:async(_,args)=>{calls++;assert(!args.some(arg=>arg.startsWith('-Cr')));return{stdout:''};}}});
 await read(undefined);assert.equal(calls,1);for(const size of[0,51,1.5,'15',null])await assert.rejects(read(size),/bulk size rejected/);assert.equal(calls,1);
});
test('an ONU returning online takes priority on the next existing bounded optical round, not a new poller',()=>{
 const rows=Array.from({length:6},(_,index)=>({id:`1/1/${index+1}:1`,ponKey:`1/1/${index+1}`,serialNumber:'HWTC'+String(index).padStart(8,'0'),status:'online'})),old=new Map(rows.map((row,index)=>[row.id+':'+row.serialNumber,{...row,status:index===5?'offline':'online',rxPowerAt:new Date(Date.now()-10000+index).toISOString()}]));
 const selection=inventory.selectTelemetryPons(rows,old,rows.map(row=>row.ponKey));assert.equal(selection.length,4);assert.equal(selection[0].pon,'1/1/6');
 const row=rows[5],result={rows:[row]};inventory.enrich(result,{onus:[old.get(row.id+':'+row.serialNumber)]},{},new Map());assert.equal(result.rows[0].rxPending,true);assert.equal(result.rows[0].metadataPending,true);
 const next={rows:[row]},value=new Map([[row.id,{value:null,at:new Date().toISOString()}]]);inventory.enrich(next,{onus:result.rows},{},value,Date.now(),new Map([[row.id,row.serialNumber]]));assert.equal(next.rows[0].rxPending,false);assert.equal(next.rows[0].rxPower,null);
});
test('live PON reads coalesce, classify only reported phases and retain original time on VPN failure',async()=>{
 const{data,device}=fixture('live-pon-test'),realNow=Date.now;let now=realNow(),phase='working',calls=0,failed=false;Date.now=()=>now;
 const options={transportOptions:{transports:{commands:async({commands})=>{calls++;if(failed)throw Error('VPN unavailable');await new Promise(resolve=>setImmediate(resolve));return{success:true,outputs:commands.map(command=>({command,stdout:command.includes('baseinfo')?base('1/1/1',[[1,'HWTCAABBCC01']]):command.includes('onu state')?status([['1/1/1:1',phase]]):'OLT#'}))};}}}};
 try{
  const[first,duplicate]=await Promise.all([inventory.readStatus(data,device,'1/1/1',options),inventory.readStatus(data,device,'1/1/1',options)]);assert.deepEqual(first,duplicate);assert.equal(calls,1);assert.equal(first.rows[0].condition,'online');
  for(const[value,condition,known]of[['LOS','los',true],['DyingGasp','dying-gasp',true],['OffLine','other',false]]){now+=6000;phase=value;const result=await inventory.readStatus(data,device,'1/1/1',options);assert.equal(result.rows[0].condition,condition);assert.equal(result.rows[0].causeKnown,known);assert(!result.stale);}
  const previous=await inventory.readStatus(data,device,'1/1/1',options);now+=6000;failed=true;const last=await inventory.readStatus(data,device,'1/1/1',options);assert(last.stale);assert.equal(last.checkedAt,previous.checkedAt);assert.equal(last.rows[0].condition,'other');assert.equal(calls,5);
 }finally{Date.now=realNow;}
});
test('live status overlays are view-only and cannot reuse another serial customer or advance a full snapshot timestamp',()=>{
 const old={checkedAt:'2026-11-20T08:00:00Z',onus:[{id:'1/1/1:1',ponKey:'1/1/1',serialNumber:'HWTC11111111',customerId:'private-customer',name:'Old Name',status:'online'},{id:'1/1/2:1',ponKey:'1/1/2',serialNumber:'HWTC22222222',status:'online'}]},before=structuredClone(old);
 const value={ponKey:'1/1/1',checkedAt:'2026-11-20T08:00:10Z',stale:false,rows:[{id:'1/1/1:1',ponKey:'1/1/1',serialNumber:'HWTC33333333',status:'offline',condition:'los',causeKnown:true}]},view=inventory.overlayStatus(old,value);
 assert.equal(view.checkedAt,old.checkedAt);assert.equal(view.onus.length,2);assert(!view.onus.find(row=>row.ponKey==='1/1/1').customerId);assert(!view.onus.find(row=>row.ponKey==='1/1/1').name);assert.deepEqual(old,before);
 const stale=inventory.overlayStatus(old,{...value,checkedAt:'2026-11-20T07:59:00Z'});assert.equal(stale,old);
});
