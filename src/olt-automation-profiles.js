'use strict';
const crypto=require('node:crypto'),pnp=require('./olt-zte-pnp');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
function rows(device){return(device.onuAutomationProfiles||[]).filter(row=>row.connection===policyConnection(device)).slice(0,128);}
const policyConnection=device=>pnp.signature({...device,updatedAt:''});
function view(device){return{profiles:rows(device).map(({connection,...row})=>({...row,ponCount:Object.values(device.onuAutomationAssignments||{}).filter(id=>id===row.id).length})),presets:pnp.presets(device)};}
function save(data,device,actor,input){
 if(!pnp.canManage(data,device,actor))fail('Tidak memiliki izin profil otomasi',403);
 if(require('./olt-zte-registration').isBusy(device.id)||require('./olt-zte-bandwidth').isBusy(device.id)||require('./olt-zte-bridge').isBusy(device.id))fail('Tunggu operasi OLT selesai',429);
 const profiles=rows(device),existing=profiles.find(row=>row.id===input.id);
 if(input.action==='capture'){
  if(typeof input.label!=='string'||!input.label.trim()||input.label.length>80||/[\x00-\x1f<>]/.test(input.label))fail('Nama profil tidak valid',400);
  const source=pnp.presets(device)[input.ponKey];if(!source||source.revision!==input.presetRevision)fail('Preset PON berubah. Baca ulang.');
  if(profiles.length>=128)fail('Batas profil otomasi tercapai');
  const config=Object.fromEntries(['vlanMode','vlans','bandwidth','bandwidthMode','bandwidthPresetId','onuType'].filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
  config.vlans=[...(device.onuPnpPresets[input.ponKey].vlans)];
  // ACS and registration enable switches are deliberately independent.
  const row={id:crypto.randomUUID(),label:input.label.trim(),config,connection:policyConnection(device),revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};device.onuAutomationProfiles=[...profiles,row];return view(device);
 }
 if(!existing||existing.revision!==input.profileRevision)fail('Profil otomasi berubah atau tidak ditemukan');
 if(input.action==='delete'){
  if(Object.values(device.onuAutomationAssignments||{}).includes(existing.id))fail('Profil masih ditautkan ke PON. Ganti profil PON dahulu.');
  device.onuAutomationProfiles=profiles.filter(row=>row.id!==existing.id);return view(device);
 }
 if(input.action!=='assign'||input.confirmTarget!==input.ponKey||input.confirmImpact!==true)fail('Konfirmasi penerapan profil tidak sesuai',400);
 const previous=pnp.presets(device)[input.ponKey],enabled=require('./olt-zte-registration').settings(device)[input.ponKey]?.enabled===true;
 if(enabled)fail('Nonaktifkan registrasi otomatis PON ini sebelum mengganti profil; aktifkan kembali setelah diperiksa.');
 const config=require('./olt-acs-policy').preset(device,existing.config);
 pnp.savePreset(data,device,actor,{...config,ponKey:input.ponKey,presetRevision:input.presetRevision,requestedEnabled:previous?.requestedEnabled??false,tr069:config.tr069||previous?.tr069||{enabled:false,acsUrl:''}});
 device.onuAutomationAssignments={...(device.onuAutomationAssignments||{}),[input.ponKey]:existing.id};return view(device);
}
module.exports={view,save};
