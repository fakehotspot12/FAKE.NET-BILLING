'use strict';

const identity=require('./network-identity');
const automatic=require('./olt-auto-identity');
const THRESHOLD=90,MAX_TARGETS=4096;
const grouped=ticket=>['odp','pon','odc'].includes(ticket?.scope)&&!ticket.serialNumber;

function topology(data,device,rows){
  const points=new Set((data.fiberPoints||[]).map(row=>row.id));
  return rows.map(row=>{
    const link=device.links?.[row.serialNumber]||{},customer=automatic.manualCustomerFor(data,device,row)||automatic.customerFor(data,device,row)?.customer;
    const odp=link.fiberPointId||customer?.fiberPointId||customer?.odpId||customer?.distributionPointId||customer?.distribution_point_id||customer?.odp;
    return{serialNumber:identity.serial(row.serialNumber),id:String(row.id),identifierKind:row.identifierKind||'serial',pon:row.ponKey||'',odp:points.has(odp)?odp:'',customerId:customer?.id||''};
  });
}
function targetsFor(ticket,topologyRows){
  return topologyRows.filter(row=>ticket.scope==='odp'?row.odp===ticket.fiberPointId:Boolean(ticket.pon&&row.pon===ticket.pon));
}
function measure(ticket,rows,currentTargets){
  const current=rows instanceof Map?rows:new Map(),duplicates=new Set();if(!(rows instanceof Map))for(const row of rows){const sn=identity.serial(row.serialNumber);if(current.has(sn))duplicates.add(sn);else current.set(sn,row);}
  const targets=new Map();
  for(const row of [...(ticket.recoveryTargets||[]),...currentTargets])if(row?.serialNumber&&!targets.has(row.serialNumber))targets.set(row.serialNumber,row);
  // Old incidents may have no saved membership: missing affected devices still count as unknown.
  for(const sn of ticket.affectedSerialNumbers||[])if(!targets.has(sn))targets.set(sn,{serialNumber:sn,pon:ticket.pon||'',odp:ticket.fiberPointId||''});
  const groups=new Map(),residualSerialNumbers=[],poweredOffSerialNumbers=[];let total=0,online=0,poweredOff=0,remainingLos=0,unknown=0;
  for(const target of targets.values()){
    total++;const raw=duplicates.has(target.serialNumber)?null:current.get(target.serialNumber),row=raw&&(!target.pon||target.pon===raw.ponKey)?raw:null;
    const key=ticket.scope==='odp'?ticket.fiberPointId:target.odp||'unmapped',part=groups.get(key)||{id:key,total:0,online:0,poweredOff:0,remainingLos:0,unknown:0};groups.set(key,part);part.total++;
    if(row?.status==='online'){online++;part.online++;}
    else if(row?.status==='offline'&&row.causeKnown===true&&row.condition==='dying-gasp'){poweredOff++;part.poweredOff++;if(poweredOffSerialNumbers.length<MAX_TARGETS)poweredOffSerialNumbers.push(target.serialNumber);}
    else if(row?.status==='offline'&&row.causeKnown===true&&row.condition==='los'&&!row.plannedReboot){remainingLos++;part.remainingLos++;if(residualSerialNumbers.length<MAX_TARGETS)residualSerialNumbers.push(target.serialNumber);}
    else{unknown++;part.unknown++;if(residualSerialNumbers.length<MAX_TARGETS)residualSerialNumbers.push(target.serialNumber);}
  }
  for(const part of groups.values()){part.eligible=part.total-part.poweredOff;part.required=Math.ceil(part.eligible*THRESHOLD/100);part.ready=part.eligible>0&&part.online>=part.required;}
  const eligible=total-poweredOff,required=Math.ceil(eligible*THRESHOLD/100),ready=total>0&&total<=MAX_TARGETS&&groups.size>0&&[...groups.values()].every(row=>row.ready);
  return{threshold:THRESHOLD,total,eligible,required,online,poweredOff,remainingLos,unknown,ready,residualSerialNumbers,poweredOffSerialNumbers,groups:[...groups.values()],...(targets.size<=MAX_TARGETS?{targets:[...targets.values()]}:{})};
}
function publicResult(result){const{targets,...safe}=result;return safe;}
async function forTicket(data,ticket,options={}){
  if(!grouped(ticket))return null;
  const device=(data.oltDevices||[]).find(row=>row.id===ticket.oltId&&row.enabled!==false);if(!device)return{available:false,ready:false,threshold:THRESHOLD};
  const olt=require('./olt-monitor'),snapshot=await(options.snapshot||olt.snapshotFor)(device),now=options.now??Date.now(),at=Date.parse(snapshot?.checkedAt||'');
  if(snapshot?.status!=='online'||snapshot.stale||snapshot.pendingRefresh||snapshot.inventoryAvailable===false||snapshot.simulated&&process.env.MIGRATION_MODE!=='1'||!Number.isFinite(at)||now-at>olt.CACHE_MS*2||at>now+30000)return{available:false,ready:false,threshold:THRESHOLD};
  return{...publicResult(measure(ticket,snapshot.onus||[],targetsFor(ticket,topology(data,device,snapshot.onus||[])))),available:true,checkedAt:snapshot.checkedAt};
}
async function validateResolution(data,ticket,payload,options={}){
  if(!grouped(ticket)||ticket.status==='resolved'||(payload.status!=='resolved'&&payload.stage!=='resolved'))return null;
  if(['oltId','pon','scope','fiberPointId','serialNumber'].some(key=>Object.hasOwn(payload,key)&&String(payload[key]??'')!==String(ticket[key]??''))){const error=new Error('Simpan perubahan identitas jaringan terlebih dahulu sebelum mengonfirmasi selesai.');error.status=409;throw error;}
  if(!ticket.assignedTo){const error=new Error('Ambil atau tugaskan tiket sebelum mengonfirmasi selesai.');error.status=409;throw error;}
  const result=await forTicket(data,ticket,options);
  if(!result?.available||!result.ready){const error=new Error(result?.available?`Target pemulihan belum tercapai: ${result.online}/${result.eligible} ONU online. Setiap ODP minimal ${THRESHOLD}%; ${result.poweredOff} modem kehilangan daya dikecualikan.`:'Data OLT terbaru belum tersedia untuk memverifikasi pemulihan.');error.status=409;throw error;}
  return result;
}

module.exports={THRESHOLD,MAX_TARGETS,grouped,topology,targetsFor,measure,publicResult,forTicket,validateResolution};
