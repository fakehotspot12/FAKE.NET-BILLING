'use strict';

const crypto=require('node:crypto');
const recovery=require('./ticket-recovery');
const automatic=require('./olt-auto-identity');
const reference=require('./ticket-reference');
const templates=require('./ticket-templates');
const MAX_RECIPIENTS=1024;
function phoneFor(customer){const digits=String(customer.phone||customer.whatsapp||'').replace(/\D/g,''),phone=digits.startsWith('62')?'0'+digits.slice(2):digits.startsWith('8')?'0'+digits:digits;return/^08\d{8,12}$/.test(phone)?phone:'';}
function enabled(data,ticket){
  const settings=data.settings?.oltTicketing||{},since=Date.parse(settings.customerOutageEnabledAt||'');
  return settings.customerOutageEnabled===true&&data.settings?.waGateway?.enabled===true&&ticket.source==='olt-los'&&recovery.grouped(ticket)&&Number.isFinite(since)&&Date.parse(ticket.createdAt)>=since;
}
function recipients(data,ticket,kind){
  if(!enabled(data,ticket)||!['detected','resolved'].includes(kind))return[];
  const device=(data.oltDevices||[]).find(row=>row.id===ticket.oltId&&row.enabled!==false);if(!device)return[];
  if(kind==='detected'&&(ticket.status==='resolved'||ticket.recovery?.ready)||kind==='resolved'&&ticket.status!=='resolved')return[];
  const affected=new Set(ticket.affectedSerialNumbers||[]),members=new Map();
  const delivered=kind==='resolved'?new Set([...(ticket.customerNoticeReceipts?.delivered||[]),...(data.waMessages||[]).filter(row=>row.type==='oltTicket'&&row.oltTicketAudience==='customer'&&row.oltTicketId===ticket.id&&row.oltTicketKind==='detected'&&(['sent','delivered','read','seen'].includes(row.status)||row.sentAt)).flatMap(row=>row.oltTicketCustomerIds||[])]):null;
  for(const target of(ticket.recoveryTargets||[]).slice(0,recovery.MAX_TARGETS)){
    if(kind==='detected'&&!affected.has(target.serialNumber))continue;
    const customer=automatic.manualCustomerFor(data,device,target)||automatic.customerFor(data,device,target)?.customer;
    if(!customer||!target.customerId||customer.id!==target.customerId||['terminated','disabled','inactive'].includes(customer.status)||delivered&&!delivered.has(customer.id))continue;
    const phone=phoneFor(customer);if(!phone)continue;
    const row=members.get(customer.id)||{id:customer.id,name:customer.name||customer.username||'Pelanggan',phone,serials:[]};row.serials.push(target.serialNumber);members.set(customer.id,row);
    if(members.size>=MAX_RECIPIENTS)break;
  }
  return[...members.values()];
}
function condition(ticket,recipient){
  const residual=new Set(ticket.recovery?.residualSerialNumbers||[]),off=new Set(ticket.recovery?.poweredOffSerialNumbers||[]);
  if(!ticket.recovery?.ready||recipient.serials.some(sn=>residual.has(sn)))return'pending';
  return recipient.serials.some(sn=>off.has(sn))?'poweredOff':'resolved';
}
function message(data,ticket,recipient,kind){
  const point=(data.fiberPoints||[]).find(row=>row.id===ticket.fiberPointId),key=kind==='detected'?'customerOutageDetected':{pending:'customerOutagePending',poweredOff:'customerOutagePoweredOff',resolved:'customerOutageResolved'}[condition(ticket,recipient)];
  const available=require('./olt-monitor').ticketTemplates(data);
  return templates.render(available[key],{customer:recipient.name,area:point?[point.code,point.name].filter(Boolean).join(' - '):ticket.scope==='odp'?'jaringan distribusi pelanggan':'jaringan utama pelanggan',ticket_no:reference.number(ticket)});
}
function schedule(data,index,seed,now=Date.now()){
  const delay=Math.max(45,Number(data.settings?.waGateway?.minDelaySeconds)||45),jitter=crypto.createHash('sha1').update(seed).digest()[0]%6;
  return{scheduledAt:new Date(now+(index*(delay+5)+Math.floor(index/20)*120+jitter)*1000).toISOString(),deliveryMode:'transactional',bulkProfile:'transactional',throttleDelaySeconds:delay,priority:4,ticketQueueVersion:2};
}
function enqueue(data,ticket,kind,enqueueMessage,context){
  if(!enabled(data,ticket))return{queued:0};
  const existing=(data.waMessages||[]).filter(row=>row.type==='oltTicket'&&row.oltTicketAudience==='customer'&&row.oltTicketId===ticket.id&&row.oltTicketKind===kind),seen=new Set([...(ticket.customerNoticeReceipts?.[kind]||[]),...existing.flatMap(row=>row.oltTicketCustomerIds||[])]);
  const people=recipients(data,ticket,kind).filter(row=>!seen.has(row.id)),byPhone=new Map();
  const staffPhones=new Set((data.waMessages||[]).filter(row=>row.type==='oltTicket'&&row.oltTicketAudience!=='customer'&&row.oltTicketId===ticket.id&&row.oltTicketKind===kind&&['queued','sent','delivered','read','seen'].includes(row.status)).map(row=>row.phone));
  for(const person of people){if(staffPhones.has(person.phone))continue;const key=require('./olt-ticketing').faultKeyFor(ticket,person.phone);if(kind==='detected'&&(context.recentFaults.get(key)>Date.now()||context.pendingFaults.has(key)))continue;const list=byPhone.get(person.phone)||[];list.push(person);byPhone.set(person.phone,list);}
  let position=(data.waMessages||[]).filter(row=>row.type==='oltTicket'&&row.oltTicketAudience==='customer'&&row.status==='queued').length;
  for(const[phone,people]of byPhone){const primary=people[0],serials=people.flatMap(row=>row.serials),recipient={...primary,serials};const payload={type:'oltTicket',phone,recipientName:primary.name,subject:'Informasi layanan '+reference.number(ticket),text:message(data,ticket,recipient,kind),bulk:false,...schedule(data,position++,ticket.id+phone)};
    const row=enqueueMessage(data,payload);Object.assign(row,{oltTicketId:ticket.id,oltTicketKind:kind,oltTicketAudience:'customer',oltTicketCustomerIds:people.map(row=>row.id),oltTicketRecipientIds:people.map(row=>'customer:'+row.id),oltTicketEventKey:kind+':'+ticket.id,oltTicketCustomerCondition:kind==='resolved'?condition(ticket,recipient):'detected',...schedule(data,position-1,ticket.id+phone)});people.forEach(person=>seen.add(person.id));
  }
  if(byPhone.size)ticket.customerNoticeReceipts={...(ticket.customerNoticeReceipts||{}),[kind]:[...seen].slice(0,MAX_RECIPIENTS)};
  return{queued:byPhone.size};
}
function allowed(data,ticket,message,context){
  if(!enabled(data,ticket))return false;
  const key=ticket.id+':'+message.oltTicketKind+':customer';if(!context.recipients.has(key))context.recipients.set(key,recipients(data,ticket,message.oltTicketKind));
  const ids=new Set(message.oltTicketCustomerIds||[]),people=context.recipients.get(key).filter(row=>ids.has(row.id)&&row.phone===message.phone);
  if(!people.length)return false;
  if(message.oltTicketKind==='resolved')return condition(ticket,{serials:people.flatMap(row=>row.serials)})===message.oltTicketCustomerCondition;
  return true;
}
function recordDelivery(ticket,message){if(message.oltTicketAudience!=='customer'||message.oltTicketKind!=='detected')return;ticket.customerNoticeReceipts={...(ticket.customerNoticeReceipts||{}),delivered:[...new Set([...(ticket.customerNoticeReceipts?.delivered||[]),...(message.oltTicketCustomerIds||[])])].slice(0,MAX_RECIPIENTS)};}
module.exports={MAX_RECIPIENTS,phoneFor,enabled,recipients,condition,message,schedule,enqueue,allowed,recordDelivery};
