'use strict';
const crypto=require('node:crypto'),identity=require('./network-identity');
const WINDOW_MS=5*60*1000,RETENTION_MS=15*60*1000,MAX_MARKERS=512;
const OLT_WINDOW_MS=15*60*1000;
const clean=value=>String(value||'').trim();
function serial(value){const sn=identity.serial(value);return /^[A-Z0-9]{12}$/.test(sn)?sn:'';}
function fromDeviceId(value){return serial(clean(value).split('-').at(-1));}
function rows(data,now=Date.now()){return(Array.isArray(data.settings?.plannedOnuReboots)?data.settings.plannedOnuReboots:[]).filter(row=>row&&serial(row.serialNumber)&&Number.isFinite(Date.parse(row.startedAt))&&Date.parse(row.until)>Date.parse(row.startedAt)&&Date.parse(row.until)-Date.parse(row.startedAt)<=WINDOW_MS&&Date.parse(row.startedAt)<=now+30000&&Date.parse(row.until)+RETENTION_MS>now).slice(-MAX_MARKERS);}
function begin(data,target,actor={},now=Date.now()){
 const sn=serial(target.serialNumber)||fromDeviceId(target.deviceId);if(!sn)return null;
 const existing=rows(data,now),oltId=clean(target.oltId),onuIndex=clean(target.onuIndex);
 if(oltId){const device=(data.oltDevices||[]).find(row=>row.id===oltId),epon=device?.vendor==='hsgq'?require('./olt-hsgq').position(onuIndex):require('./olt-hioso').position(onuIndex);if((!/^\d+$/.test(onuIndex)&&(!epon||epon.serialNumber!==sn||epon.ponKey!==clean(target.pon)))||!clean(target.pon))throw new Error('Posisi ONU untuk penanda reboot wajib sesuai');}
 if(existing.some(row=>row.serialNumber===sn&&Date.parse(row.until)>now)){const error=new Error('Reboot perangkat ini masih dalam jeda 5 menit. Tunggu perangkat pulih sebelum mengulang.');error.status=429;throw error;}
 if(existing.length>=MAX_MARKERS){const error=new Error('Penanda reboot sedang penuh. Coba lagi setelah jeda berakhir.');error.status=429;throw error;}
 const unrestricted=['admin','owner','secretary','noc'].includes(actor.role),nasIds=[...new Set([target.nasId,...(!unrestricted&&Array.isArray(actor.lockedNasIds)?actor.lockedNasIds:[]),...(!unrestricted?[actor.lockedNasId]:[])].map(clean).filter(Boolean))];
 const marker={id:crypto.randomUUID(),serialNumber:sn,oltId,onuIndex,pon:clean(target.pon),nasIds,source:['olt','acs','wifiku'].includes(target.source)?target.source:'acs',actorId:clean(actor.id),startedAt:new Date(now).toISOString(),until:new Date(now+WINDOW_MS).toISOString()};data.settings??={};data.settings.plannedOnuReboots=[...existing,marker];return marker;
}
function cancel(data,id){const before=Array.isArray(data.settings?.plannedOnuReboots)?data.settings.plannedOnuReboots:[],after=before.filter(row=>row.id!==id);if(after.length===before.length)return false;data.settings.plannedOnuReboots=after;return true;}
function inScope(data,marker,device){if(!marker.nasIds?.length||marker.nasIds.includes('all'))return true;if(!device.nasId)return false;const directory=identity.directory(data),aliases=directory.aliasesFor(device.nasId);return marker.nasIds.some(id=>directory.aliasesFor(id).some(alias=>aliases.includes(alias)));}
function match(data,marker,device,onu){return marker.serialNumber===serial(onu.serialNumber)&&(!marker.oltId||marker.oltId===device.id)&&(!marker.onuIndex||String(marker.onuIndex)===String(onu.id))&&(!marker.pon||marker.pon===onu.ponKey)&&inScope(data,marker,device);}
function oltRows(data,now=Date.now()){return(Array.isArray(data.settings?.plannedOltReboots)?data.settings.plannedOltReboots:[]).filter(row=>row&&typeof row.oltId==='string'&&row.oltId.length<=100&&Number.isFinite(Date.parse(row.startedAt))&&Date.parse(row.until)-Date.parse(row.startedAt)===OLT_WINDOW_MS&&Date.parse(row.startedAt)<=now+30000&&Date.parse(row.until)+RETENTION_MS>now).slice(-32);}
function beginOlt(data,device,actor={},now=Date.now()){
 if(!device?.id||!device.enabled)throw Error('OLT tidak aktif');const previous=oltRows(data,now);if(previous.some(row=>row.oltId===device.id&&Date.parse(row.until)>now)){const error=Error('Reboot OLT masih dalam jeda pemeliharaan. Periksa koneksi sebelum mengulang.');error.status=429;throw error;}
 const marker={id:crypto.randomUUID(),oltId:device.id,revision:device.updatedAt||'',actorId:actor.id||'',startedAt:new Date(now).toISOString(),until:new Date(now+OLT_WINDOW_MS).toISOString()};data.settings??={};data.settings.plannedOltReboots=[...previous.filter(row=>row.oltId!==device.id),marker];data.oltLosObservations=(data.oltLosObservations||[]).filter(row=>row.oltId!==device.id);return marker;
}
function cancelOlt(data,id){const before=data.settings?.plannedOltReboots||[],after=before.filter(row=>row.id!==id);if(after.length===before.length)return false;data.settings.plannedOltReboots=after;return true;}
function forOlt(data,device,options={}){const now=options.now??Date.now(),checked=options.checkedAt?Date.parse(options.checkedAt):now,markers=options.index?.get('olt:'+device.id)||oltRows(data,now);if(!Number.isFinite(checked))return null;return markers.find(row=>row.oltId===device.id&&row.revision===(device.updatedAt||'')&&checked>=Date.parse(row.startedAt)&&(now<Date.parse(row.until)||checked<=Date.parse(row.until)))||null;}
function index(data,now=Date.now()){const value=new Map();for(const marker of rows(data,now)){const list=value.get(marker.serialNumber)||[];list.push(marker);value.set(marker.serialNumber,list);}for(const marker of oltRows(data,now))value.set('olt:'+marker.oltId,[marker]);return value;}
function forOnu(data,device,onu,options={}){const now=options.now??Date.now(),checked=options.checkedAt?Date.parse(options.checkedAt):now,whole=forOlt(data,device,options);if(whole)return whole;const markers=(options.index||index(data,now)).get(serial(onu.serialNumber))||[];if(!Number.isFinite(checked))return null;return markers.find(marker=>match(data,marker,device,onu)&&checked>=Date.parse(marker.startedAt)&&(now<Date.parse(marker.until)||checked<=Date.parse(marker.until)))||null;}
function suppressNotification(data,ticket,now=Date.now()){
 if(ticket.source!=='olt-los')return false;const created=Date.parse(ticket.createdAt||'');if(!Number.isFinite(created))return false;
 if(require('./olt-pon').suppressNotification(data,ticket,now))return true;
 const whole=oltRows(data,now).find(row=>row.oltId===ticket.oltId&&row.revision===((data.oltDevices||[]).find(device=>device.id===ticket.oltId)?.updatedAt||'')&&created>=Date.parse(row.startedAt)&&created<=Date.parse(row.until));if(whole)return true;
 const sns=(ticket.serialNumber?[ticket.serialNumber]:ticket.affectedSerialNumbers||[]).map(serial).filter(Boolean);if(!sns.length)return false;
 const markers=index(data,now),device=(data.oltDevices||[]).find(row=>row.id===ticket.oltId)||{};return sns.every(sn=>(markers.get(sn)||[]).some(marker=>(!marker.oltId||marker.oltId===ticket.oltId)&&(!marker.pon||marker.pon===ticket.pon)&&inScope(data,marker,device)&&created>=Date.parse(marker.startedAt)&&created<=Date.parse(marker.until)));
}
module.exports={WINDOW_MS,begin,cancel,index,forOnu,suppressNotification,fromDeviceId,OLT_WINDOW_MS,beginOlt,cancelOlt,forOlt};
