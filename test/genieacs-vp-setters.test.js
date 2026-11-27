'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const genie = require('../src/genieacs'), wan = require('../src/genieacs-wan');
const wlan = 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1';
const ppp = 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.';
function evaluate(name, leaves, input) {
  let commits = 0;
  const writes = [], reads = [];
  const declare = (pattern, freshness, write) => {
    if (write) {writes.push({path:pattern,value:write.value});return {};}
    reads.push({pattern,freshness});
    const regex = new RegExp('^' + pattern.split('.').map(part => part === '*' ? '[^.]+' : part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\.') + '$');
    const matches = Object.keys(leaves).filter(key => regex.test(key));
    const rows = matches.map(key => ({path:key, get writable(){return commits>=2 ? leaves[key].writable === true : undefined;}, get value(){return commits>=2 ? [leaves[key].value] : undefined;}}));
    rows.size=rows.length;
    for(const key of ['path','writable','value'])Object.defineProperty(rows,key,{get:()=>rows[0]?.[key]});
    return rows;
  };
  const source = fs.readFileSync(path.join(__dirname,'../deploy/genieacs/virtual-parameters',name+'.js'),'utf8');
  const result = vm.runInNewContext('(function(){'+source+'})()', {declare, commit:()=>commits++, args:[{},input===undefined?{}:{value:[input]}]});
  return {result,writes,reads};
}
test('WiFi virtual setter writes one discovered writable alias, not every vendor path',()=>{
  const leaves = {[wlan+'.PreSharedKey.1.KeyPassphrase']:{value:'original-pass',writable:true},[wlan+'.KeyPassphrase']:{value:'',writable:true}};
  const output=evaluate('WlanPassword',leaves,'replacement-pass');
  assert.deepEqual(output.writes,[{path:wlan+'.PreSharedKey.1.KeyPassphrase',value:'replacement-pass'}]);
  assert.equal(output.result.writable,true);
  assert.equal(evaluate('WlanPassword',leaves).result.value[0],'original-pass');
  assert.throws(()=>evaluate('WlanPassword',{},'replacement-pass'),/belum terbaca/);
  assert.throws(()=>evaluate('WlanPassword',leaves,'short'),/8-63/);
});
test('PPP virtual username excludes management and refuses ambiguous active Internet WANs',()=>{
  const leaves = {
    [ppp+'1.Username']:{value:'member',writable:true},[ppp+'1.ConnectionStatus']:{value:'Connected'},
    [ppp+'1.X_ZTE-COM_VLANID']:{value:111},[ppp+'2.Username']:{value:'management',writable:true},
    [ppp+'2.ConnectionStatus']:{value:'Connected'},[ppp+'2.X_ZTE-COM_VLANID']:{value:100}
  };
  assert.deepEqual(evaluate('pppoeUsername',leaves,'changed').writes,[{path:ppp+'1.Username',value:'changed'}]);
  const ambiguous={...leaves,[ppp+'3.Username']:{value:'another',writable:true},[ppp+'3.ConnectionStatus']:{value:'Connected'}};
  assert.throws(()=>evaluate('pppoeUsername',ambiguous,'changed'),/belum pasti/);
  assert.equal(evaluate('pppoeUsername',ambiguous).result.writable,false);
});
test('PPP virtual password stays on the selected Internet username and never broadcasts',()=>{
  const leaves={
    'VirtualParameters.pppoeUsername':{value:'member'},[ppp+'1.Username']:{value:'member'},
    [ppp+'1.Password']:{value:'old',writable:true},[ppp+'2.Username']:{value:'management'},
    [ppp+'2.Password']:{value:'secret',writable:true}
  };
  assert.deepEqual(evaluate('pppoePassword',leaves,'new-password').writes,[{path:ppp+'1.Password',value:'new-password'}]);
  assert.throws(()=>evaluate('pppoePassword',{[ppp+'1.Password']:{value:'old',writable:true}},'new-password'),/belum pasti/);
});
test('WiFi detail refresh includes discovered metadata leaves whose values are not cached yet',()=>{
  const config={SSID:{_value:'Home'},Enable:{_value:true},BeaconType:{_object:false,_writable:true}};
  const device={InternetGatewayDevice:{LANDevice:{1:{WLANConfiguration:{1:config}}}}};
  const names=genie._internal.existingWifiDetailParameterNames(device);
  assert(names.includes(wlan+'.BeaconType'));
  assert(names.includes(wlan+'.SSID'));
  assert(!names.some(name=>name.endsWith('.*')));
});
function f670(){
  const lan={LANEthernetInterfaceConfig:{1:{Enable:{_value:true}}},WLANConfiguration:{1:{Enable:{_value:true},SSID:{_value:'Home'}}}};
  const internet={Username:{_value:'member'},ConnectionType:{_value:'IP_Routed'},'X_ZTE-COM_VLANID':{_value:111}};
  const connections={1:{WANPPPConnection:{1:internet}},2:{WANIPConnection:{1:{'X_ZTE-COM_VLANID':{_value:100}}}}};
  return {
    _deviceId:{_Manufacturer:'ZTE',_ProductClass:'F670L'},
    InternetGatewayDevice:{
      LANDevice:{1:lan},WANDevice:{1:{WANConnectionDevice:connections}},
      'X_ZTE-COM_PortBinding':{1:{LANInterface:{_value:'',_writable:true},WANInterface:{_value:'',_writable:true}}}
    }
  };
}
test('F670L uses verified native PortBinding rows without writing a guessed per-WAN binding alias',()=>{
  const device=f670(),target=ppp+'1';
  assert.equal(wan.detectWanVendor(device).wanWriteSupported,true);
  const plan=wan.prepareWanProvision(device,{mode:'pppoe',vlan:111,username:'member',targetWan:target,bindings:['LAN1','SSID1']});
  assert.equal(plan.bindingValues.length,2);
  assert(plan.bindingValues.every(([name])=>name.startsWith('InternetGatewayDevice.X_ZTE-COM_PortBinding.1.')));
  assert.equal(plan.bindingValues.find(([name])=>name.endsWith('.WANInterface'))[1],target);
  assert(!plan.bindingValues.some(([name])=>name.endsWith('X_ZTE-COM_LanInterface')));
  assert(![...plan.parameterValues,...plan.bindingValues].some(([name])=>name.includes('.WANConnectionDevice.2.')));
  const row=device.InternetGatewayDevice['X_ZTE-COM_PortBinding'][1];
  row.WANInterface._value=target;row.LANInterface._value=plan.bindingValues[0][1];
  assert.deepEqual(wan.summarizeWanConnections(device).primary.bindings,['LAN1','SSID1']);
});
test('F670L unknown, read-only, occupied or duplicate binding tables fail before CPE writes',()=>{
  for(const mode of ['missing-values','readonly','occupied','duplicate']){
    const device=f670(),table=device.InternetGatewayDevice['X_ZTE-COM_PortBinding'];
    if(mode==='missing-values')delete table[1].LANInterface._value;
    if(mode==='readonly')table[1].LANInterface._writable=false;
    if(mode==='occupied')table[1].WANInterface._value='InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1';
    if(mode==='duplicate'){table[1].WANInterface._value=ppp+'1';table[2]=structuredClone(table[1]);}
    assert.throws(()=>wan.prepareWanProvision(device,{mode:'pppoe',vlan:111,username:'member',targetWan:ppp+'1',bindings:['LAN1']}),/PortBinding|beberapa baris/);
  }
});

test('a fresh F670L requests explicit binding allocation instead of inventing instance 1',()=>{
  const device=f670();device.InternetGatewayDevice['X_ZTE-COM_PortBinding']={_object:true,_writable:true};
  assert.equal(wan.detectWanVendor(device).wanWriteSupported,true);
  let error;try{wan.prepareWanProvision(device,{mode:'pppoe',vlan:111,username:'member',targetWan:ppp+'1',bindings:['LAN1']});}catch(e){error=e;}
  assert.equal(error?.requiresPortBindingAllocation,true);
  assert.deepEqual(Object.keys(device.InternetGatewayDevice['X_ZTE-COM_PortBinding']).sort(),['_object','_writable']);
});

test('F670L preserves unknown existing LAN-interface paths when changing known bindings',()=>{
  const device=f670(),target=ppp+'1',row=device.InternetGatewayDevice['X_ZTE-COM_PortBinding'][1];
  const extra='InternetGatewayDevice.LANDevice.1.WLANConfiguration.10';
  row.WANInterface._value=target;row.LANInterface._value=extra;
  const plan=wan.prepareWanBinding(device,{targetWan:target,bindings:['LAN1']});
  assert(plan.bindingValues.find(([name])=>name.endsWith('.LANInterface'))[1].includes(extra));
});

test('ZTE GPON allocates only the writable WAN connection within its existing shared container',()=>{
  const device=f670(),connections=device.InternetGatewayDevice.WANDevice[1].WANConnectionDevice;
  connections[1].WANPPPConnection._object=true;connections[1].WANPPPConnection._writable=true;
  const plan=wan.prepareWanProvision(device,{mode:'pppoe',vlan:111,username:'member',password:'test-password',targetWan:'new',createWan:true,bindings:[]});
  assert.equal(plan.createConnectionDevice,false);
  assert.equal(plan.connectionIndex,1);
  assert.equal(plan.instance,2);
  assert.equal(plan.objectRootPath,'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection');
  assert(plan.parameterValues.every(([name])=>name.includes('.WANPPPConnection.2.')));
});

test('Bridge stays off for restricted ZTE GPON models but remains available for F663 variants',()=>{
  for(const model of ['F609','F660','F670L','F679L']){
    const device=f670();device._deviceId._ProductClass=model;
    assert.equal(wan.detectWanVendor(device).bridgeSupported,false,model);
    assert.throws(()=>wan.prepareWanProvision(device,{mode:'bridge',vlan:131,targetWan:'new',createWan:true,bindings:[]}),/Bridge otomatis/);
  }
  for(const model of ['F663NV3A','F663NV3a','F663NV9']){
    const device=f670();device._deviceId._ProductClass=model;
    assert.equal(wan.detectWanVendor(device).bridgeSupported,true,model);
  }
});

// Match GenieACS's lazy wrappers: attributes not requested in timestamps are
// absent, and inspecting a wrapper after declare() commits the pending batch.
function readVirtual(name, leaves, options={}) {
 let pending=false,commits=0;const reads=[],writes=[];
 const commit=()=>{commits++;pending=false;if(commits>8)throw Error('Unbounded virtual read commits');};
 const declare=(pattern,attributes={},write)=>{
  if(write){writes.push({pattern,write});throw Error('Read-only virtual attempted a native write');}
  reads.push(pattern);pending=true;const regex=new RegExp('^'+pattern.split('.').map(p=>p==='*'?'[^.]+':p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\.')+'$');
  const paths=Object.keys(leaves).filter(path=>regex.test(path));
  const rows={get size(){if(pending)commit();return paths.length;},*[Symbol.iterator](){if(pending)commit();for(const path of paths)yield wrap(path);}};
  function wrap(path){const row={get path(){if(pending)commit();return path;}};if(attributes.value>=1)Object.defineProperty(row,'value',{get(){if(pending)commit();return[leaves[path].value,leaves[path].type||'xsd:string'];}});if(attributes.writable>=1)Object.defineProperty(row,'writable',{get(){if(pending)commit();return leaves[path].writable;}});return row;}
  for(const key of ['path','value','writable'])Object.defineProperty(rows,key,{get:()=>paths.length?wrap(paths[0])[key]:undefined});return rows;
 };
 const source=fs.readFileSync(path.join(__dirname,'../deploy/genieacs/virtual-parameters',name+'.js'),'utf8');const result=new Function('declare','commit','args',source)(declare,commit,[{},options.desired===undefined?{}:{value:[options.desired]}]);return{result,reads,writes,commits};
}
test('active-client virtual reads16SSID and host metadata in bounded batches instead of hundreds of commits',()=>{
 const leaves={'DeviceID.ProductClass':{value:'F672Y'}};
 for(let i=1;i<=16;i++){const base='InternetGatewayDevice.LANDevice.1.WLANConfiguration.'+i;leaves[base+'.SSID']={value:'Customer '+i};leaves[base+'.Enable']={value:true};leaves[base+'.TotalAssociations']={value:1};}
 const output=readVirtual('activedevices',leaves);assert.equal(output.result.value[0],'16');assert(output.commits<=2);assert.deepEqual(output.writes,[]);
 const restricted=readVirtual('activedevices',{'DeviceID.ProductClass':{value:'FL327D'},[wlan+'.TotalAssociations']:{value:2}});assert(restricted.reads.every(p=>!p.includes('Hosts.Host')));
});
test('VLAN virtual reads explicit aliases and tagged WAN names, keeps zero untagged and refuses unrelated templates',()=>{
 const make=(base,vlan,name,username='member')=>({'VirtualParameters.pppoeUsername':{value:username},[base+'.Username']:{value:username},[base+'.ConnectionStatus']:{value:'Connected'},[base+'.Name']:{value:name},...(vlan===undefined?{}:{[base+'.X_HW_VLAN']:{value:vlan}})});
 assert.equal(readVirtual('wanVlan',make(ppp+'1',101,'Internet')).result.value[0],'101');
 assert.equal(readVirtual('wanVlan',make(ppp+'1',undefined,'1_INTERNET_R_VID_131')).result.value[0],'131');
 assert.equal(readVirtual('wanVlan',make(ppp+'1',0,'Internet')).result.value[0],'0');
 const missing=make(ppp+'3',undefined,'4_INTERNET_R_VID_');Object.assign(missing,make(ppp+'1',undefined,'2_INTERNET_R_VID_200','old-template'));missing['VirtualParameters.pppoeUsername']={value:'member'};assert.equal(readVirtual('wanVlan',missing).result.value[0],'');
 const dual={...make(ppp+'1',101,'Internet'),...make(ppp+'2',102,'Internet')};assert.equal(readVirtual('wanVlan',dual).result.value[0],'');
});
test('VLAN virtual follows TR181LowerLayers rather than taking a management VLAN from the first index',()=>{
 const leaves={'VirtualParameters.pppoeUsername':{value:'member'},'Device.PPP.Interface.2.Username':{value:'member'},'Device.PPP.Interface.2.LowerLayers':{value:'Device.Ethernet.Link.4'},'Device.Ethernet.Link.4.LowerLayers':{value:'Device.Ethernet.VLANTermination.3'},'Device.Ethernet.VLANTermination.1.VLANID':{value:100},'Device.Ethernet.VLANTermination.3.VLANID':{value:777}};
 const output=readVirtual('wanVlan',leaves);assert.equal(output.result.value[0],'777');assert(output.commits<=1);
});
test('cached virtual readers request actual values and retain unknown uptime or counters without writes',()=>{
 const leaves={'InternetGatewayDevice.DeviceInfo.XponInterface.MACAddress':{value:'AA:BB:CC:DD:EE:01'},[ppp+'1.MACAddress']:{value:'AA:BB:CC:DD:EE:02'},'InternetGatewayDevice.DeviceInfo.UpTime':{value:65},[ppp+'1.Uptime']:{value:120},'VirtualParameters.pppoeIP':{value:'192.0.2.8'}};
 for(const[name,expected]of [['PonMac','AA:BB:CC:DD:EE:01'],['pppoeMac','AA:BB:CC:DD:EE:02'],['getdeviceuptime','0d 00:01:05'],['getpppuptime','0d 00:02:00'],['ip','192.0.2.8']]){const output=readVirtual(name,leaves);assert.equal(output.result.value[0],expected,name);assert(output.commits<=2,name);assert.deepEqual(output.writes,[]);}
 for(const name of['getdeviceuptime','getpppuptime','LANActiveClients','LANClients','activedevices'])assert.equal(readVirtual(name,{}).result.value[0],'',name);
});
test('PPPIP and username virtual reads do not mix a management address or require write eligibility',()=>{
 const leaves={'VirtualParameters.pppoeUsername':{value:'member'},[ppp+'1.Username']:{value:'member'},[ppp+'1.ExternalIPAddress']:{value:'192.0.2.8'},[ppp+'2.Username']:{value:'acs'},[ppp+'2.ExternalIPAddress']:{value:'192.0.2.100'}};
 assert.equal(readVirtual('pppoeIP',leaves).result.value[0],'192.0.2.8');
 const combined={[ppp+'1.Username']:{value:'member',writable:true},[ppp+'1.ConnectionStatus']:{value:'Connected'},[ppp+'1.X_HW_VLAN']:{value:101},[ppp+'1.X_HW_SERVICELIST']:{value:'TR069_INTERNET'}};
 const output=readVirtual('pppoeUsername',combined);assert.equal(output.result.value[0],'member');assert.equal(output.result.writable,false);assert(output.commits<=2);
});
test('PPP password contract never treats a username virtual as a password',()=>{
 const cfg=genie.normalizeSettings({});assert(cfg.pppPasswordParameters.includes('VirtualParameters.pppoePassword'));assert(!cfg.pppPasswordParameters.some(p=>p.endsWith('pppoeUsername')||p.endsWith('.pppoe')||p.endsWith('pppoeUsername2')));
});
test('installer cache backfill executes the same VP readers, preserves custom definitions and refuses native writes',()=>{
 const{evaluateCachedVirtualParameters}=require('../deploy/genieacs/bootstrap');const sources=['wanVlan','getSerialNumber','getdeviceuptime'].map(name=>({name,script:fs.readFileSync(path.join(__dirname,'../deploy/genieacs/virtual-parameters',name+'.js'),'utf8')}));
 const doc={_id:'unit',_deviceId:{_SerialNumber:'HWTC11223344'},VirtualParameters:{custom:{_value:'owner-kept'}},InternetGatewayDevice:{DeviceInfo:{UpTime:{_value:65}},WANDevice:{1:{WANConnectionDevice:{1:{WANPPPConnection:{1:{Username:{_value:'member'},ConnectionStatus:{_value:'Connected'},Name:{_value:'1_INTERNET_R_VID_131'}}}}}}}}};
 const output=evaluateCachedVirtualParameters(doc,sources);assert.deepEqual(output.errors,[]);assert.equal(output.set['VirtualParameters.wanVlan']._value,'131');assert.equal(output.set['VirtualParameters.getSerialNumber']._value,'HWTC11223344');assert.equal(output.set['VirtualParameters.getdeviceuptime']._value,'0d 00:01:05');assert(!Object.hasOwn(output.set,'VirtualParameters.custom'));assert(Object.keys(output.set).every(p=>p.startsWith('VirtualParameters.')));
 const malicious=evaluateCachedVirtualParameters(doc,[{name:'bad',script:'declare("Device.WAN.1.Enable", null, {value:false});return {writable:false,value:["bad","xsd:string"]};'}]);assert.equal(Object.keys(malicious.set).length,0);assert.equal(malicious.errors.length,1);
});
