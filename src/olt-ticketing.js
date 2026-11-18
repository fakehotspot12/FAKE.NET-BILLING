'use strict';

const auth = require('./auth');
const olt = require('./olt-monitor');
const crypto = require('node:crypto');
const serviceTickets = require('./service-tickets');
const plannedReboot = require('./olt-planned-reboot');
const ticketTeam = require('./ticket-team');
const KINDS = Object.freeze(['detected', 'claimed', 'progress', 'resolved']);
const NOTIFICATION_KINDS = Object.freeze(['detected', 'resolved']);
const TICKET_QUEUE_VERSION = 2;
const FAULT_COOLDOWN_MS = 30 * 60 * 1000;

function ticketSchedule(data, position, now = Date.now()) {
  const configured = Number(data.settings?.waGateway?.minDelaySeconds);
  const delay = Math.max(15,Number.isFinite(configured) ? configured : 15);
  return { scheduledAt:new Date(now + position*delay*1000 + Math.floor(position/20)*90000).toISOString(),
    deliveryMode:'transactional',bulkProfile:'transactional',throttleDelaySeconds:delay,priority:3,ticketQueueVersion:TICKET_QUEUE_VERSION };
}

function normalizeQueuedTicketMessages(data, now = Date.now()) {
  const cooldownChanged=saveCooldowns(data,deliveryContext(data,now).recentFaults,now);
  const cancelled=cancelQueued(data),pending=(data.waMessages||[]).filter(row=>row.type==='oltTicket'&&row.status==='queued');
  const legacy=pending.filter(row=>row.ticketQueueVersion!==TICKET_QUEUE_VERSION).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  let position=pending.length-legacy.length;
  for(const message of legacy)Object.assign(message,ticketSchedule(data,position++,now),{
    queueRevision:(Number(message.queueRevision)||0)+1,queueJobId:'',enqueuedAt:'',updatedAt:new Date(now).toISOString() });
  return {changed:Boolean(legacy.length||cancelled||cooldownChanged),updated:legacy.length,cancelled};
}

function phoneFor(user) {
  const digits = String(user.phone || user.whatsapp || user.mobile || '').replace(/\D/g, '');
  const normalized = digits.startsWith('62') ? '0' + digits.slice(2) : digits.startsWith('8') ? '0' + digits : digits;
  return /^08\d{8,12}$/.test(normalized) ? normalized : '';
}

function eligibleUsers(data) {
  return (data.users || []).filter(user => user.active !== false
    && auth.hasPermission(auth.publicUser(user), 'olt:tickets:write'));
}

function recipientOptions(data) {
  const directory=require('./network-identity').directory(data);
  return (data.users||[]).filter(user=>user.active!==false&&(auth.hasPermission(auth.publicUser(user),'olt:tickets:write')||['finance','collector'].includes(user.role))).map(user=>{
    const safe=auth.publicUser(user),billing=['finance','collector'].includes(user.role),locks=safe.lockedNasIds||[];
    const nasNames=!locks.length||locks.includes('all')?['Semua NAS']:[...new Set([...(data.radiusNas||[]),...(data.monitoringTargets||[])].filter(row=>locks.some(id=>directory.aliasesFor(id).includes(String(row.id).toLowerCase()))).map(row=>row.name).filter(Boolean))];
    const scopes=billing?['billing']:['admin','owner','secretary'].includes(user.role)?['technical','billing']:['technical'];
    return{id:user.id,name:user.name||user.username,role:user.role,phone:phoneFor(user),scope:billing?'billing':'technical',scopes,canReceive:auth.hasPermission(safe,billing?'olt:tickets:read':'olt:tickets:write'),nasNames};
  });
}

function notificationUsers(data, scope) {
  const allowed=new Set(recipientOptions(data).filter(row=>row.canReceive&&(!scope||row.scopes.includes(scope))).map(row=>row.id));
  return (data.users||[]).filter(user=>allowed.has(user.id));
}

function settingsFor(data) {
  const value = data.settings?.oltTicketing || {};
  const legacyBilling=new Set((data.users||[]).filter(user=>['finance','collector'].includes(user.role)).map(user=>user.id));
  const ids=Array.isArray(value.recipientIds)?[...new Set(value.recipientIds)].slice(0,25):[];
  return { whatsappEnabled: value.whatsappEnabled === true,
    customerOutageEnabled:value.customerOutageEnabled===true,
    recipientIds:ids.filter(id=>!legacyBilling.has(id)),
    billingRecipientIds:Array.isArray(value.billingRecipientIds)?[...new Set(value.billingRecipientIds)].slice(0,25):ids.filter(id=>legacyBilling.has(id)) };
}

function validateSettings(data, payload) {
  if(payload.customerOutageEnabled!==undefined&&typeof payload.customerOutageEnabled!=='boolean')throw new Error('Pengaturan pesan gangguan massal tidak valid');
  if (typeof payload.whatsappEnabled !== 'boolean' || !Array.isArray(payload.recipientIds)
    || payload.recipientIds.length > 25 || payload.recipientIds.some(id => typeof id !== 'string')
    || payload.billingRecipientIds!==undefined&&(!Array.isArray(payload.billingRecipientIds)||payload.billingRecipientIds.length>25||payload.billingRecipientIds.some(id=>typeof id!=='string'))) {
    throw new Error('Pengaturan notifikasi tiket tidak valid');
  }
  const options=new Map(recipientOptions(data).map(row=>[row.id,row])),current=settingsFor(data),legacy=payload.billingRecipientIds===undefined;
  const ids=[...new Set(payload.recipientIds)];
  const billingIds=[...new Set(payload.billingRecipientIds??(Array.isArray(data.settings?.oltTicketing?.billingRecipientIds)?current.billingRecipientIds:ids.filter(id=>['finance','collector'].includes(options.get(id)?.role))))];
  const technicalIds=legacy?ids.filter(id=>!['finance','collector'].includes(options.get(id)?.role)):ids;
  for(const [values,scope]of[[technicalIds,'technical'],[billingIds,'billing']])if(values.some(id=>{const user=options.get(id);return !user?.canReceive||!user.phone||!user.scopes.includes(scope);}))throw new Error('Penerima wajib user berwenang dengan nomor WhatsApp valid dan kategori yang sesuai');
  if(payload.whatsappEnabled&&!technicalIds.length&&!billingIds.length)throw new Error('Pilih minimal satu penerima notifikasi tiket');
  return { whatsappEnabled: payload.whatsappEnabled, recipientIds:technicalIds,billingRecipientIds:billingIds,customerOutageEnabled:payload.customerOutageEnabled??current.customerOutageEnabled };
}

function recipientsFor(data, ticket, kind = 'detected') {
  if(!NOTIFICATION_KINDS.includes(kind))return [];
  const settings=settingsFor(data),billing=serviceTickets.isServiceTicket(ticket)&&ticket.category==='billing';
  const ids = new Set(kind==='resolved' ? ticketTeam.memberIds(ticket) : billing?settings.billingRecipientIds:settings.recipientIds);
  return (kind==='resolved'?eligibleUsers(data):notificationUsers(data,billing?'billing':'technical')).filter(user => ids.has(user.id) && phoneFor(user)
    && (!['finance','collector'].includes(user.role)||serviceTickets.isServiceTicket(ticket)&&ticket.category==='billing')
    && serviceTickets.visible(data, auth.publicUser(user),ticket));
}

function ticketLink(origin, ticket) {
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    return new URL('/tkt.html?id=' + encodeURIComponent(ticket.id), url.origin).href;
  } catch { return ''; }
}

function eventKey(ticket, kind) {
  if (!KINDS.includes(kind)) throw new Error('Jenis pesan tiket tidak valid');
  if (kind === 'claimed' && !ticket.assignedTo) throw new Error('Tiket belum diambil');
  if (kind === 'progress' && !(ticket.history || []).some(row => row.kind === 'progress')) throw new Error('Belum ada progres tiket');
  if (kind === 'resolved' && ticket.status !== 'resolved') throw new Error('Tiket belum selesai');
  if (kind === 'resolved') return 'resolved:' + (ticket.resolvedAt || ticket.losDetection?.recoveredAt || ticket.updatedAt);
  const event = kind === 'claimed' ? (ticket.history || []).findLast(row => row.kind === 'claimed')
    : ['progress', 'resolved'].includes(kind) ? (ticket.history || []).at(-1) : null;
  return kind + ':' + (event?.id || (kind === 'detected' ? ticket.createdAt : ticket.updatedAt));
}

function messageText(data, ticket, kind, origin) {
  ticket={...ticket,number:require('./ticket-reference').number(ticket)};
  const link = ticketLink(origin, ticket);
  if (!link) throw new Error('URL publik billing belum diatur di Payment Gateway');
  const location=serviceTickets.ticketLocation(data,ticket);
  const rendered=olt.renderTicketTemplate(data,ticket,kind).replaceAll('[ticket_link]',link);
  const contact=!serviceTickets.isServiceTicket(ticket)?[location.phone&&!rendered.includes(location.phone)?'Kontak: '+location.phone:'',location.locationUrl&&!rendered.includes(location.locationUrl)?'Arah pelanggan: '+location.locationUrl:''].filter(Boolean).join('\n'):'';
  const message=rendered+(contact?'\n'+contact:'');
  return message.includes(link) ? message : message + (kind==='resolved'?'\n\nLihat hasil penanganan:\n':'\n\nBuka / ambil tiket:\n') + link;
}

function enqueueStaffNotifications(data, ticket, kind, origin, enqueue, actor = {}) {
  if (!settingsFor(data).whatsappEnabled || data.settings?.waGateway?.enabled !== true) return { queued: 0 };
  if(!KINDS.includes(kind))throw new Error('Jenis pesan tiket tidak valid');
  if(!NOTIFICATION_KINDS.includes(kind))return {queued:0,suppressed:true,reason:'Pesan pengambilan dan progres tiket hanya dicatat di web'};
  if(kind==='detected'&&plannedReboot.suppressNotification(data,ticket))return {queued:0,suppressed:true,reason:'Reboot terencana; notifikasi gangguan otomatis dijeda'};
  if(kind==='detected'&&(ticket.status!=='new'||ticket.assignedTo))return {queued:0,suppressed:true,reason:'Gangguan sudah ditangani atau selesai'};
  const key = eventKey(ticket, kind), recipients = recipientsFor(data, ticket, kind);
  const previous = ticket.waNotifications?.[kind];
  const sent = new Set(previous && (previous.eventKey === key || kind==='resolved') ? previous.recipientIds : []);
  let pending = recipients.filter(user => !sent.has(user.id));
  if (!pending.length) return { queued: 0,reason:recipients.length?'Pesan kejadian ini sudah pernah diantrikan':'Petugas/penerima WhatsApp yang berwenang belum tersedia' };
  normalizeQueuedTicketMessages(data);
  const now=Date.now(),delivery=deliveryContext(data,now);
  if(kind==='detected')pending=pending.filter(user=>{
    const faultKey=faultKeyFor(ticket,phoneFor(user));
    return !(delivery.recentFaults.get(faultKey)>now)&&!delivery.pendingFaults.has(faultKey);
  });
  if(!pending.length)return {queued:0,suppressed:true,reason:'Gangguan yang sama dibatasi satu notifikasi dalam 30 menit atau masih memiliki pesan antre'};
  const text = messageText(data, ticket, kind, origin);
  let position=(data.waMessages||[]).filter(row=>row.type==='oltTicket'&&row.status==='queued').length;
  const byPhone = new Map();
  for (const user of pending) { const phone=phoneFor(user);if(!byPhone.has(phone))byPhone.set(phone,[]);byPhone.get(phone).push(user); }
  for (const [phone, users] of byPhone) {
    const user=users[0],schedule=ticketSchedule(data,position++),message = enqueue(data, { type: 'oltTicket', phone, recipientName: user.name || user.username,
      subject: 'Tiket ' + ticket.number, text, bulk: false, scheduledAt:schedule.scheduledAt,actorName: actor.name || actor.username || 'Sistem OLT' });
    Object.assign(message, schedule,{ oltTicketId: ticket.id, oltTicketKind: kind, oltTicketRecipientId: user.id, oltTicketRecipientIds:users.map(row=>row.id),oltTicketEventKey: key,
      ...(kind==='detected'?{oltFaultKey:faultKeyFor(ticket,phone)}:{}) });
    for(const recipient of users)sent.add(recipient.id);
  }
  ticket.waNotifications = { ...ticket.waNotifications, [kind]: { eventKey: key, recipientIds: [...sent].slice(-(kind==='resolved'?ticketTeam.MAX_COMPANIONS+1:25)) } };
  return { queued: byPhone.size };
}

function enqueueNotifications(data,ticket,kind,origin,enqueue,actor={}){
  const staff=enqueueStaffNotifications(data,ticket,kind,origin,enqueue,actor),customers=require('./ticket-customer-notifications');
  const extra=customers.enabled(data,ticket)&&NOTIFICATION_KINDS.includes(kind)?customers.enqueue(data,ticket,kind,enqueue,deliveryContext(data)):{queued:0};
  return{...staff,queued:staff.queued+extra.queued};
}

function faultKeyFor(ticket, phone) {
  const scope=ticket.source==='wifiku'?'service:'+ticket.customerId+':'+ticket.category:olt.normalizeSerial(ticket.serialNumber)|| (ticket.scope==='odp'&&ticket.fiberPointId?'odp:'+ticket.fiberPointId:ticket.pon?'pon:'+ticket.pon:'ticket:'+ticket.id);
  return crypto.createHash('sha256').update(JSON.stringify([ticket.oltId,scope,phone])).digest('hex');
}
function sentBefore(message) {
  return ['sent','delivered','read','seen'].includes(message.status)||Number.isFinite(Date.parse(message.sentAt||''));
}
function basicDeliveryAllowed(data, message, context) {
  if(!NOTIFICATION_KINDS.includes(message.oltTicketKind)||sentBefore(message))return false;
  const ticket = context.tickets.get(message.oltTicketId);
  if(message.oltTicketAudience==='customer')return Boolean(ticket&&require('./ticket-customer-notifications').allowed(data,ticket,message,context));
  if (!settingsFor(data).whatsappEnabled) return false;
  if(message.oltTicketKind==='detected'&&ticket?.recovery?.ready)return false;
  if(ticket&&message.oltTicketKind==='detected'&&plannedReboot.suppressNotification(data,ticket,context.now))return false;
  if (!ticket || (message.oltTicketKind==='detected'?(ticket.status!=='new'||ticket.assignedTo):(ticket.status!=='resolved'||!ticket.assignedTo))) return false;
  const recipientKey=ticket.id+':'+message.oltTicketKind;
  if(!context.recipients.has(recipientKey))context.recipients.set(recipientKey,recipientsFor(data,ticket,message.oltTicketKind));
  const recipients=context.recipients.get(recipientKey);
  if(message.oltTicketKind==='resolved')return recipients.some(user=>phoneFor(user)===message.phone);
  const ids=new Set(message.oltTicketRecipientIds||[message.oltTicketRecipientId]);
  return recipients.some(user => ids.has(user.id) && phoneFor(user) === message.phone);
}
function deliveryContext(data, now = Date.now()) {
  const tickets=new Map((data.oltTickets||[]).map(ticket=>[ticket.id,ticket])),recentFaults=new Map(),completedEvents=new Set(),pendingFaults=new Set(),winners=new Map();
  const context={tickets,recentFaults,pendingFaults,winners,recipients:new Map(),now};
  for(const [key,value]of Object.entries(data.settings?.oltTicketing?.notificationCooldowns||{}))if(Number(value)>now)recentFaults.set(key,Number(value));
  for(const message of data.waMessages||[]){
    if(message.type!=='oltTicket'||!sentBefore(message))continue;
    if(message.oltTicketKind==='resolved')completedEvents.add(JSON.stringify([message.oltTicketId,message.phone]));
    if(message.oltTicketKind!=='detected')continue;
    const ticket=tickets.get(message.oltTicketId),key=message.oltFaultKey||(ticket?faultKeyFor(ticket,message.phone):'');
    const at=Date.parse(message.sentAt||message.createdAt||'');
    if(key&&Number.isFinite(at)&&at<=now+30000&&at+FAULT_COOLDOWN_MS>now)recentFaults.set(key,Math.max(recentFaults.get(key)||0,at+FAULT_COOLDOWN_MS));
  }
  const queued=(data.waMessages||[]).filter(message=>message.type==='oltTicket'&&message.status==='queued')
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(b.id).localeCompare(String(a.id)));
  for(const message of queued){
    if(!basicDeliveryAllowed(data,message,context))continue;
    const ticket=tickets.get(message.oltTicketId),key=message.oltTicketKind==='detected'?faultKeyFor(ticket,message.phone):JSON.stringify([message.oltTicketId,message.phone]);
    if(message.oltTicketKind==='detected'&&recentFaults.get(key)>now)continue;
    if(message.oltTicketKind==='resolved'&&completedEvents.has(key))continue;
    const event=message.oltTicketKind+':'+key;
    if(!winners.has(event)){winners.set(event,message.id);if(message.oltTicketKind==='detected')pendingFaults.add(key);}
  }
  return context;
}
function deliveryAllowed(data, message, context = deliveryContext(data)) {
  if(!basicDeliveryAllowed(data,message,context))return false;
  const ticket=context.tickets.get(message.oltTicketId),key=message.oltTicketKind==='detected'?faultKeyFor(ticket,message.phone):JSON.stringify([message.oltTicketId,message.phone]);
  return context.winners.get(message.oltTicketKind+':'+key)===message.id;
}
function recordDelivery(data, message, sentAt) {
  if(message.type!=='oltTicket'||message.oltTicketKind!=='detected')return;
  const ticket=(data.oltTickets||[]).find(row=>row.id===message.oltTicketId);if(!ticket)return;
  require('./ticket-customer-notifications').recordDelivery(ticket,message);
  const now=Date.parse(sentAt),context=deliveryContext(data,now);
  context.recentFaults.set(faultKeyFor(ticket,message.phone),now+FAULT_COOLDOWN_MS);
  saveCooldowns(data,context.recentFaults,now);
}
function saveCooldowns(data,recentFaults,now) {
  const notificationCooldowns=Object.fromEntries([...recentFaults].filter(([,until])=>until>now).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,2048));
  if(JSON.stringify(notificationCooldowns)===JSON.stringify(data.settings?.oltTicketing?.notificationCooldowns||{}))return false;
  data.settings.oltTicketing={...(data.settings.oltTicketing||{}),notificationCooldowns};return true;
}

function cancelQueued(data, reason = 'Pesan tiket dibatalkan: tidak relevan, bukan petugas tiket, atau dibatasi untuk mencegah pesan berulang') {
  let count = 0;const context=deliveryContext(data);
  for (const message of data.waMessages || []) {
    if (message.type !== 'oltTicket' || message.status !== 'queued' || deliveryAllowed(data, message, context)) continue;
    message.status = sentBefore(message) ? 'sent' : 'cancelled'; message.lastError = reason;
    message.queueRevision = (Number(message.queueRevision) || 0) + 1;
    message.queueJobId = ''; message.updatedAt = new Date().toISOString(); count++;
  }
  return count;
}

function ticketPage(data, user, query = {}) {
  const devices = olt.visibleDevices(data, user), byId = new Map(devices.map(device => [device.id, device]));
  const status = query.status === undefined ? (query.bucket==='resolved'?'':'open') : query.status === 'all' ? '' : String(query.status);
  if(query.bucket&&!['open','resolved'].includes(query.bucket))throw new Error('Kelompok tiket tidak valid');
  if(query.kind&&!['fault','request'].includes(query.kind))throw new Error('Jenis tiket tidak valid');
  if (!['', 'open', ...olt.TICKET_STATUSES].includes(status)) throw new Error('Status tiket tidak valid');
  const search = String(query.search || '').trim().toLocaleLowerCase('id-ID').slice(0, 100);
  const limit = [10,25,50,100].includes(Number(query.limit)) ? Number(query.limit) : 25;
  const visible=(data.oltTickets||[]).filter(serviceTickets.visibilityFilter(data,user,devices));
  const scoped = visible.filter(ticket => {
    const device = byId.get(ticket.oltId);
    return (!query.oltId || query.oltId === 'all' || ticket.oltId === query.oltId)
      && (!query.nasId || query.nasId === 'all' || (device?.nasId||ticket.nasId) === query.nasId)
      && (!query.kind || (ticket.kind||'fault') === query.kind)
      && (!query.scope || ticket.scope === query.scope) && (!query.pon || ticket.pon === query.pon)
      && (!search || [ticket.number,ticket.title,ticket.serialNumber,ticket.customerName,ticket.fiberPointName,ticket.description,device?.name,ticket.nasName]
        .some(value => String(value || '').toLocaleLowerCase('id-ID').includes(search)));
  });
  const counts = Object.fromEntries(olt.TICKET_STATUSES.map(key => [key,0]));
  for(const ticket of scoped)if(Object.hasOwn(counts,ticket.status))counts[ticket.status]++;
  counts.all = scoped.length; counts.open = counts.new + counts.assigned + counts.working;
  const filtered = scoped.filter(ticket => (!query.bucket||(query.bucket==='resolved'?ticket.status==='resolved':ticket.status!=='resolved'))&&(!status || (status === 'open' ? ticket.status !== 'resolved' : ticket.status === status)));
  filtered.sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || String(a.id).localeCompare(String(b.id)));
  const pages = Math.max(1,Math.ceil(filtered.length / limit)), page = Math.max(1,Math.min(pages,parseInt(query.page,10) || 1));
  const fields = ['id','number','oltId','title','scope','source','kind','category','nasId','nasName','pon','serialNumber','fiberPointId','fiberPointName','customerName','assignedTo','companionIds','status','updatedAt','createdAt','autoResolved','affectedCount','losDetection'];
  const tickets = filtered.slice((page-1)*limit,page*limit).map(ticket => ({...Object.fromEntries(fields.filter(key => ticket[key] !== undefined).map(key => [key,ticket[key]])),number:require('./ticket-reference').number(ticket),...(ticket.recovery?{recovery:Object.fromEntries(['ready','threshold','total','online','eligible','poweredOff','remainingLos','unknown'].map(key=>[key,ticket.recovery[key]]))}:{}),affectedTotal:ticket.affectedSerialNumbers?.length || ticket.affectedCount || (ticket.serialNumber ? 1 : 0)}));
  return { tickets, counts, page, limit, pages, total: filtered.length,nasIds:[...new Set([...devices.map(row=>row.nasId),...visible.map(row=>row.nasId)].filter(Boolean))],
    devices: devices.map(device => ({id:device.id,name:device.name,nasId:device.nasId || ''})) };
}

module.exports = { KINDS, NOTIFICATION_KINDS, TICKET_QUEUE_VERSION, FAULT_COOLDOWN_MS, phoneFor, eligibleUsers, recipientOptions, notificationUsers, settingsFor, validateSettings, recipientsFor, ticketLink, eventKey, messageText, enqueueNotifications, deliveryAllowed, cancelQueued, ticketPage, ticketSchedule, normalizeQueuedTicketMessages, faultKeyFor, recordDelivery };
