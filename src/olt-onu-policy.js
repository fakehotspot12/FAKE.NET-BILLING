'use strict';

// Exceptions follow the physical SN and connection, never a reusable ONU index.
const pnp=require('./olt-zte-pnp'),tr=require('./olt-zte-tr069');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const connection=device=>pnp.signature({...device,updatedAt:''});
function get(device,serial){
 const row=device.onuOverrides?.[serial];
 return row?.connection===connection(device)?{services:row.services||'inherit',acs:row.acs||'inherit',...(row.acsUrl?{acsUrl:row.acsUrl}:{}),updatedAt:row.updatedAt}:{services:'inherit',acs:'inherit'};
}
function save(device,serial,input){
 if(!/^[A-Z0-9]{12}$/.test(serial))fail('SN ONU tidak valid',400);
 const previous=get(device,serial),next={...previous};
 if(input.services!==undefined){if(!['inherit','manual'].includes(input.services))fail('Kebijakan layanan tidak valid',400);next.services=input.services;}
 if(input.acs!==undefined){if(!['inherit','manual','disabled'].includes(input.acs))fail('Kebijakan ACS tidak valid',400);next.acs=input.acs;delete next.acsUrl;if(input.acs==='manual'&&input.acsUrl)next.acsUrl=tr.setting({enabled:true,acsUrl:input.acsUrl}).acsUrl;}
 const rows=Object.fromEntries(Object.entries(device.onuOverrides||{}).filter(([,row])=>row.connection===connection(device)));
 if(!rows[serial]&&Object.keys(rows).length>=2048)fail('Batas pengecualian ONU pada OLT tercapai');
 rows[serial]={...next,connection:connection(device),updatedAt:new Date().toISOString()};device.onuOverrides=rows;return get(device,serial);
}
function acs(device,serial){const row=get(device,serial);return row.acs==='disabled'?{enabled:false,acsUrl:''}:row.acs==='manual'&&row.acsUrl?{enabled:true,acsUrl:row.acsUrl}:require('./olt-acs-policy').settings(device);}
function assertAutomation(device,serial){if(get(device,serial).services==='manual')fail('Layanan ONU diatur manual. Periksa Pengaturan ONU sebelum melanjutkan otomasi.');}
module.exports={get,save,acs,assertAutomation};
