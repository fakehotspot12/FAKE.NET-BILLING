'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {radioEvidence}=require('../src/ont-radio-capability');
const leaf=_value=>({_value});
test('radio detection uses explicit bands and never uses serial, SSID index, client counts or a 5G template name',()=>{
 assert.deepEqual(radioEvidence({Device:{WiFi:{Radio:{1:{SupportedFrequencyBands:leaf('2.4GHz,5GHz'),Enable:leaf(false)}}}}}).bands,['2.4','5']);
 assert.deepEqual(radioEvidence({InternetGatewayDevice:{LANDevice:{1:{WLANConfiguration:{5:{X_HW_RFBand:leaf('5GHz'),TotalAssociations:leaf(0)},1:{OperatingFrequencyBand:leaf('2.4GHz')}}}}}}).bands,['2.4','5']);
 for(const raw of[{_id:'HWTC-5G'}, {ProductClass:'HUAWEI-5G'}, {InternetGatewayDevice:{LANDevice:{1:{WLANConfiguration:{5:{SSID:leaf('5G'),TotalAssociations:leaf(10)}}}}}}])assert.deepEqual(radioEvidence(raw).bands,[]);
});
test('cached ACS evidence is exact-serial, ambiguity/freshness guarded, credential-isolated and never fetches',()=>{
 const file=require.resolve('../src/genieacs'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8')+'\nmodule.exports.__seed=(cfg,rows)=>deviceListCache.set(deviceListCacheKey(normalizeSettings(cfg)),{rows,staleUntil:Date.now()+60000,expiresAt:Date.now()+60000});',file);
 const acs=m.exports,sn='HWTCAABBCCDD',cfg={genieAcs:{enabled:true,baseUrl:'http://192.0.2.1:7557',token:'first-ABCDEF'}},other={genieAcs:{...cfg.genieAcs,token:'other-ABCDEF'}},raw={_id:'unit-a',_deviceId:{_SerialNumber:sn},_lastInform:new Date().toISOString(),Device:{WiFi:{Radio:{1:{SupportedFrequencyBands:{...leaf('2.4GHz,5GHz'),_timestamp:Date.now()}}}}}};
 const oldFetch=global.fetch;global.fetch=()=>{throw Error('Must not query ACS');};
 try{acs.__seed(cfg,[raw]);assert.deepEqual(acs.cachedRadioCapabilities(cfg,[sn]).get(sn).bands,['2.4','5']);assert.equal(acs.cachedRadioCapabilities(other,[sn]).size,0);assert.equal(acs.cachedRadioCapabilities(cfg,['HWTC11223344']).size,0);
 acs._internal.clearDeviceListCache();acs.__seed(cfg,[raw,{...raw,_id:'unit-b'}]);assert.equal(acs.cachedRadioCapabilities(cfg,[sn]).size,0);
 acs._internal.clearDeviceListCache();acs.__seed(cfg,[raw,{...raw,_id:'unit-b',Device:{}}]);assert.equal(acs.cachedRadioCapabilities(cfg,[sn]).size,0);
 acs._internal.clearDeviceListCache();acs.__seed(cfg,[raw,{...raw,Device:{WiFi:{Radio:{1:{OperatingFrequencyBand:{...leaf('2.4GHz'),_timestamp:Date.now()}}}}}}]);assert.deepEqual(acs.cachedRadioCapabilities(cfg,[sn]).get(sn).bands,['2.4','5']);
 acs._internal.clearDeviceListCache();acs.__seed(cfg,[{...raw,_lastInform:'2020-01-01T00:00:00Z'}]);assert.equal(acs.cachedRadioCapabilities(cfg,[sn]).size,0);
 acs._internal.clearDeviceListCache();acs.__seed(cfg,[{...raw,Device:{WiFi:{Radio:{1:{SupportedFrequencyBands:{...leaf('2.4GHz,5GHz'),_timestamp:Date.now()-1800000}}}}}}]);assert.equal(acs.cachedRadioCapabilities(cfg,[sn]).size,0);
 }finally{global.fetch=oldFetch;}
});
test('fresh inform cannot make stale or undated radio parameters look recently measured',()=>{
 const now=Date.parse('2026-11-20T03:00:00Z'),raw={Device:{WiFi:{Radio:{1:{SupportedFrequencyBands:{...leaf('2.4GHz,5GHz'),_timestamp:now-1800000}},2:{OperatingFrequencyBand:leaf('5GHz')}}}}};
 assert.deepEqual(radioEvidence(raw,{now,requireFresh:true}).bands,[]);
 raw.Device.WiFi.Radio[1].SupportedFrequencyBands._timestamp=now-2000;
 assert.deepEqual(radioEvidence(raw,{now,requireFresh:true}).bands,['2.4','5']);assert.equal(radioEvidence(raw,{now,requireFresh:true}).measuredAt,new Date(now-2000).toISOString());
 raw.Device.WiFi.Radio[1].SupportedFrequencyBands._timestamp=now+30001;assert.deepEqual(radioEvidence(raw,{now,requireFresh:true}).bands,[]);
});
