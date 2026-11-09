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
