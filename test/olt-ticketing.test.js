'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ticketing=require('../src/olt-ticketing'),auth=require('../src/auth'),{createDefaultStore}=require('../src/store');
function fixture(){const data=createDefaultStore();data.users=['admin','technician','secretary','finance'].map((role,index)=>({id:role,username:role,name:'Unit '+role,role,active:true,phone:'08120000000'+index}));data.oltDevices=[{id:'olt-a',name:'OLT A',enabled:true,nasId:'nas-a'}];data.settings.waGateway.enabled=true;data.settings.oltTicketing={whatsappEnabled:true,recipientIds:['technician','secretary']};data.oltTickets=[{id:'t1',number:'OLT-UNIT',oltId:'olt-a',scope:'onu',serialNumber:'HWTCAABB0001',status:'new',assignedTo:'',createdAt:'2026-11-13T01:00:00Z',updatedAt:'2026-11-13T01:00:00Z'}];return data;}
const enqueue=(data,payload)=>{const message={...payload,id:'wa-'+data.waMessages.length,status:'queued',queueRevision:0};data.waMessages.push(message);return message;};
test('planned reboot blocks a new automatic fault before queue and again at delivery, without blocking invoices or manual tickets',()=>{
 const planned=require('../src/olt-planned-reboot'),now=Date.now(),data=fixture(),ticket=data.oltTickets[0];Object.assign(ticket,{source:'olt-los',pon:'0/0/1',createdAt:new Date(now+1).toISOString()});planned.begin(data,{source:'olt',serialNumber:ticket.serialNumber,oltId:'olt-a',onuIndex:'4718593',pon:ticket.pon},{id:'admin'},now);
 const suppressed=ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue);assert.equal(suppressed.queued,0);assert(suppressed.suppressed);assert.equal(data.waMessages.length,0);
 const racing=fixture(),racingTicket=racing.oltTickets[0];Object.assign(racingTicket,{source:'olt-los',pon:'0/0/1',createdAt:new Date(now+1).toISOString()});assert.equal(ticketing.enqueueNotifications(racing,racingTicket,'detected','https://billing.example.test',enqueue).queued,2);racing.waMessages.push({id:'invoice',type:'invoiceIssued',status:'queued'});planned.begin(racing,{source:'olt',serialNumber:racingTicket.serialNumber,oltId:'olt-a',onuIndex:'4718593',pon:racingTicket.pon},{id:'admin'},now);assert(!ticketing.deliveryAllowed(racing,racing.waMessages[0]));ticketing.cancelQueued(racing);assert(racing.waMessages.filter(row=>row.type==='oltTicket').every(row=>row.status==='cancelled'));assert.equal(racing.waMessages.at(-1).status,'queued');
 const manual=fixture();planned.begin(manual,{source:'acs',deviceId:'OUI-ONT-48575443AABB0001'},{id:'admin'},now);assert.equal(ticketing.enqueueNotifications(manual,manual.oltTickets[0],'detected','https://billing.example.test',enqueue).queued,2);
});
test('OLT messages prioritize real customer without treating raw ONU descriptions as a verified owner',()=>{
 const data=fixture(),olt=require('../src/olt-monitor'),ticket={...data.oltTickets[0],source:'olt-los',onuName:'House Alpha',pon:'0/0/1',customerId:'member-a'};data.customers=[{id:'member-a',name:'Alpha Customer',address:'Customer Address'}];
 const text=ticketing.messageText(data,ticket,'detected','https://billing.example.test');assert(text.includes('Pelanggan: Alpha Customer'));assert(text.includes('Lokasi: Customer Address'));assert(text.includes('Referensi: OLT A / PON 0/0/1'));assert(!text.includes('SN:'));assert(!text.includes(ticket.serialNumber));assert(text.includes('/tkt.html?id='));
 data.customers=[];assert(ticketing.messageText(data,ticket,'detected','https://billing.example.test').includes('Pelanggan: -'));
 data.settings.oltTicketing.templates={detected:'Custom [customer] [ticket_no]'};assert(olt.renderTicketTemplate(data,ticket).startsWith('Custom -'));
 const psb={...ticket,source:'staff-service',scope:'service',category:'new-installation',customerName:'New Prospect',contactPhone:'081200000001',contactAddress:'Survey Address',messages:[{role:'staff',text:'Survey needed'}]};const message=ticketing.messageText(data,psb,'detected','https://billing.example.test');assert(message.includes('PERMINTAAN PASANG BARU'));assert(message.includes('New Prospect'));assert(message.includes('Survey Address'));assert(message.includes('Survey needed'));
});
test('ticket notification defaults to disabled and validates explicit authorized recipients',()=>{
 const empty=createDefaultStore();assert.equal(ticketing.settingsFor(empty).whatsappEnabled,false);const data=fixture();assert.deepEqual(ticketing.eligibleUsers(data).map(row=>row.role),['admin','technician','secretary']);
 for(const recipientIds of [[],['finance'],['unknown']])assert.throws(()=>ticketing.validateSettings(data,{whatsappEnabled:true,recipientIds}));
 assert.throws(()=>ticketing.validateSettings(data,{whatsappEnabled:'yes',recipientIds:['technician']}));assert.deepEqual(ticketing.validateSettings(data,{whatsappEnabled:false,recipientIds:[]}),{whatsappEnabled:false,recipientIds:[],customerOutageEnabled:false});
 data.users[1].phone='';assert.throws(()=>ticketing.validateSettings(data,{whatsappEnabled:true,recipientIds:['technician']}));
});
test('ticket URLs are fixed internal paths with no password or login bypass',()=>{
 const ticket=fixture().oltTickets[0];assert.equal(ticketing.ticketLink('https://billing.example.test/base',ticket),'https://billing.example.test/tkt.html?id=t1');
 for(const origin of ['javascript:alert(1)','https://user:pass@example.test','//evil.test','https://example.test/?return=evil','https://example.test/#evil'])assert.equal(ticketing.ticketLink(origin,ticket),'');
 assert(ticketing.messageText(fixture(),ticket,'detected','https://billing.example.test').includes('/tkt.html?id=t1'));
});
test('event notifications are bounded and idempotent even when WA history was pruned',()=>{
 const data=fixture(),ticket=data.oltTickets[0];let result=ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue);assert.equal(result.queued,2);assert.equal(data.waMessages.length,2);assert.equal(data.waMessages[0].phone,'081200000001');assert.equal(data.waMessages[0].type,'oltTicket');assert.equal(data.waMessages[0].bulk,false);assert(data.waMessages[0].text.includes('/tkt.html?id=t1'));
 assert.equal(ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,0);data.waMessages=[];assert.equal(ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,0);
});
test('role, active-user, phone and NAS boundaries are rechecked for queued delivery',()=>{
 const data=fixture(),ticket=data.oltTickets[0];data.users[1].lockedNasIds=['nas-b'];assert.deepEqual(ticketing.recipientsFor(data,ticket).map(row=>row.id),['secretary']);ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue);const message=data.waMessages[0];assert.equal(ticketing.deliveryAllowed(data,message),true);
 data.users[2].role='finance';assert.equal(ticketing.deliveryAllowed(data,message),false);assert.equal(ticketing.cancelQueued(data),1);assert.equal(message.status,'cancelled');assert.equal(message.queueRevision,1);
});
test('disabling ticket notifications cancels only queued ticket messages, not invoice messages',()=>{
 const data=fixture(),ticket=data.oltTickets[0];ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue);const invoice=enqueue(data,{type:'paymentPaid'}),sent=enqueue(data,{type:'oltTicket'});sent.status='sent';
 data.settings.oltTicketing.whatsappEnabled=false;assert.equal(ticketing.cancelQueued(data),2);assert(data.waMessages.filter(row=>row.oltTicketId).every(row=>row.status==='cancelled'));assert.equal(invoice.status,'queued');assert.equal(sent.status,'sent');assert.equal(ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,0);
});
test('accounts with the same WhatsApp number receive one message per incident event',()=>{
 const data=fixture();data.users[2].phone=data.users[1].phone;assert.equal(ticketing.enqueueNotifications(data,data.oltTickets[0],'detected','https://billing.example.test',enqueue).queued,1);assert.equal(data.waMessages.length,1);assert.equal(data.waMessages[0].oltTicketRecipientIds.length,2);assert.equal(ticketing.enqueueNotifications(data,data.oltTickets[0],'detected','https://billing.example.test',enqueue).queued,0);
});
test('claim and progress never send WhatsApp and resolution goes only to the assigned technician',()=>{
 const data=fixture(),ticket=data.oltTickets[0];for(const kind of ['claimed','progress','resolved','invalid'])assert.throws(()=>ticketing.eventKey(ticket,kind));
 ticket.assignedTo='technician';ticket.status='working';ticket.history=[{id:'p1',kind:'progress',note:'Unit progress'}];assert.equal(ticketing.enqueueNotifications(data,ticket,'progress','https://billing.example.test',enqueue).queued,0);assert.equal(ticketing.enqueueNotifications(data,ticket,'claimed','https://billing.example.test',enqueue).queued,0);assert.equal(data.waMessages.length,0);
 ticket.status='resolved';ticket.autoResolved=true;assert.equal(ticketing.enqueueNotifications(data,ticket,'resolved','https://billing.example.test',enqueue).queued,1);assert.equal(data.waMessages[0].oltTicketRecipientId,'technician');assert.equal(ticketing.deliveryAllowed(data,data.waMessages.at(-1)),true);assert.equal(ticketing.enqueueNotifications(data,ticket,'resolved','https://billing.example.test',enqueue).queued,0);
});
test('ticket pagination has deterministic newest-first order, independent status counts and bounded payloads',()=>{
 const data=fixture();data.oltTickets=Array.from({length:122},(_,i)=>({...data.oltTickets[0],id:'t'+i,number:'UNIT-'+i,updatedAt:new Date(1700000000000+i*1000).toISOString(),status:i%2?'resolved':'new',scope:i%3?'onu':'pon',history:[{note:'Hidden history'}],waNotifications:{detected:{eventKey:'private'}},affectedSerialNumbers:['HWTCAABB0001','HWTCAABB0002']}));
 const user=auth.publicUser(data.users[0]),page=ticketing.ticketPage(data,user,{status:'all',page:2,limit:25});assert.equal(page.total,122);assert.equal(page.tickets.length,25);assert.equal(page.tickets[0].id,'t96');assert.equal(page.counts.open,61);assert.equal(page.counts.resolved,61);assert.equal(page.tickets[0].history,undefined);assert.equal(page.tickets[0].waNotifications,undefined);assert.equal(page.tickets[0].affectedSerialNumbers,undefined);assert.equal(page.tickets[0].affectedTotal,2);
 assert.equal(ticketing.ticketPage(data,user,{status:'resolved'}).total,61);assert.equal(ticketing.ticketPage(data,user,{search:'UNIT-121',status:'all'}).total,1);assert.equal(ticketing.ticketPage(data,user,{nasId:'outside'}).total,0);assert.equal(ticketing.ticketPage(data,user,{scope:'pon',status:'all'}).total,41);assert.equal(ticketing.ticketPage(data,user,{limit:100000,status:'all'}).tickets.length,25);assert.equal(ticketing.ticketPage(data,user,{page:1000,limit:100,status:'all'}).page,2);assert.throws(()=>ticketing.ticketPage(data,user,{status:'fake'}),/Status/);
});
test('fault notifications bypass the broadcast backlog but retain a single safe paced lane',()=>{
 const data=fixture();data.settings.waGateway.minDelaySeconds=15;data.waMessages=Array.from({length:370},(_,i)=>({id:'broadcast-'+i,type:'broadcast',status:'queued',scheduledAt:'2099-01-01T00:00:00Z'}));const before=structuredClone(data.waMessages),now=Date.now();
 ticketing.enqueueNotifications(data,data.oltTickets[0],'detected','https://billing.example.test',enqueue);const messages=data.waMessages.filter(row=>row.type==='oltTicket');assert.equal(messages.length,2);assert.equal(messages[0].deliveryMode,'transactional');assert.equal(messages[0].priority,3);assert.equal(messages[0].throttleDelaySeconds,15);assert(Date.parse(messages[0].scheduledAt)<=now+2000);assert(Date.parse(messages[1].scheduledAt)-Date.parse(messages[0].scheduledAt)>=14900);assert.deepEqual(data.waMessages.filter(row=>row.type==='broadcast'),before);
 assert.equal(Date.parse(ticketing.ticketSchedule(data,20,0).scheduledAt),390000);data.settings.waGateway.minDelaySeconds=45;assert.equal(ticketing.ticketSchedule(data,0,0).throttleDelaySeconds,45);assert.equal(Date.parse(ticketing.ticketSchedule(data,1,0).scheduledAt),45000);
});
test('only legacy pending ticket jobs are rescheduled and invalidated, leaving customer jobs unchanged',()=>{
 const data=fixture();data.settings.waGateway.minDelaySeconds=15;ticketing.enqueueNotifications(data,data.oltTickets[0],'detected','https://billing.example.test',enqueue);for(const row of data.waMessages){delete row.ticketQueueVersion;row.deliveryMode='bulk';row.scheduledAt='2099-01-01T00:00:00Z';row.queueJobId='legacy';row.priority=8;}
 const paid=enqueue(data,{type:'paymentPaid',scheduledAt:'2026-11-01T00:00:00Z'}),before=structuredClone(paid),result=ticketing.normalizeQueuedTicketMessages(data,Date.now());assert.equal(result.updated,2);assert.equal(result.changed,true);assert.deepEqual(paid,before);assert(data.waMessages.filter(row=>row.type==='oltTicket').every(row=>row.ticketQueueVersion===ticketing.TICKET_QUEUE_VERSION&&row.priority===3&&row.queueRevision===1&&row.queueJobId===''));assert.equal(ticketing.normalizeQueuedTicketMessages(data).changed,false);
});
test('resolution ignores the broadcast recipient list but preserves role, NAS and active-user checks',()=>{
 const data=fixture(),ticket=data.oltTickets[0];ticket.status='resolved';ticket.assignedTo='admin';assert.deepEqual(ticketing.recipientsFor(data,ticket,'resolved').map(user=>user.id),['admin']);assert.equal(ticketing.enqueueNotifications(data,ticket,'resolved','https://billing.example.test',enqueue).queued,1);assert.equal(data.waMessages[0].phone,data.users[0].phone);
 data.users[0].active=false;assert.equal(ticketing.deliveryAllowed(data,data.waMessages[0]),false);data.users[0].active=true;ticket.assignedTo='technician';data.users[1].lockedNasIds=['other'];assert.equal(ticketing.recipientsFor(data,ticket,'resolved').length,0);ticket.assignedTo='';assert.equal(ticketing.enqueueNotifications(data,ticket,'resolved','https://billing.example.test',enqueue).queued,0);
});
test('an ONU fault is notified once per recipient for 30 minutes across tickets and history pruning',()=>{
 const data=fixture(),first=data.oltTickets[0],now=Date.now();ticketing.enqueueNotifications(data,first,'detected','https://billing.example.test',enqueue);
 for(const message of data.waMessages){message.status='sent';message.sentAt=new Date(now).toISOString();ticketing.recordDelivery(data,message,message.sentAt);}
 first.status='resolved';const next={...first,id:'t2',status:'new',waNotifications:undefined,createdAt:new Date(now).toISOString()};data.oltTickets.push(next);data.waMessages=[];
 assert.equal(ticketing.enqueueNotifications(data,next,'detected','https://billing.example.test',enqueue).queued,0);assert.equal(data.waMessages.length,0);
 for(const key of Object.keys(data.settings.oltTicketing.notificationCooldowns))data.settings.oltTicketing.notificationCooldowns[key]=now-1;
 assert.equal(ticketing.enqueueNotifications(data,next,'detected','https://billing.example.test',enqueue).queued,2);assert.equal(data.waMessages.length,2);
 const other={...next,id:'t3',serialNumber:'HWTCAABB0002',waNotifications:undefined};data.oltTickets.push(other);assert.equal(ticketing.enqueueNotifications(data,other,'detected','https://billing.example.test',enqueue).queued,2);
});
test('recurring faults coalesce pending messages by ONU/recipient but never merge different ONUs',()=>{
 const data=fixture(),first=data.oltTickets[0];ticketing.enqueueNotifications(data,first,'detected','https://billing.example.test',enqueue);const queued=data.waMessages.slice();
 const second={...first,id:'t2',waNotifications:undefined,createdAt:new Date().toISOString()};data.oltTickets.push(second);assert.equal(ticketing.enqueueNotifications(data,second,'detected','https://billing.example.test',enqueue).queued,0);
 first.status='resolved';assert.equal(ticketing.enqueueNotifications(data,second,'detected','https://billing.example.test',enqueue).queued,2);assert(queued.every(message=>message.status==='cancelled'));assert.equal(data.oltTickets.length,2);
});
test('legacy claim, progress, unassigned completion and broadcast completion messages are cancelled without deleting history',()=>{
 const data=fixture(),ticket=data.oltTickets[0];ticket.status='resolved';ticket.assignedTo='technician';
 for(const kind of ['claimed','progress','detected','resolved'])for(const user of data.users.slice(1,3))enqueue(data,{type:'oltTicket',oltTicketId:ticket.id,oltTicketKind:kind,oltTicketRecipientId:user.id,oltTicketEventKey:kind+':old',phone:user.phone,ticketQueueVersion:1});
 const payment=enqueue(data,{type:'paymentPaid'}),invoice=enqueue(data,{type:'invoiceIssued'}),sent=enqueue(data,{type:'oltTicket',oltTicketKind:'progress',oltTicketId:ticket.id});sent.status='sent';const unchanged=structuredClone([payment,invoice,sent]);const count=data.waMessages.length;
 const normalized=ticketing.normalizeQueuedTicketMessages(data);assert.equal(normalized.cancelled,7);assert.equal(normalized.updated,1);assert.equal(data.waMessages.length,count);assert.deepEqual([payment,invoice,sent],unchanged);const pending=data.waMessages.filter(row=>row.type==='oltTicket'&&row.status==='queued');assert.equal(pending.length,1);assert.equal(pending[0].oltTicketKind,'resolved');assert.equal(pending[0].phone,data.users[1].phone);assert.equal(ticketing.normalizeQueuedTicketMessages(data).changed,false);
});
test('taking a ticket cancels pending new-fault broadcasts immediately',()=>{
 const data=fixture(),ticket=data.oltTickets[0];ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue);ticket.assignedTo='technician';ticket.status='assigned';assert.equal(ticketing.cancelQueued(data),2);assert(data.waMessages.every(row=>row.status==='cancelled'));assert.equal(ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,0);
});
test('cooldown remains bounded and does not expose customer identifiers in keys',()=>{
 const data=fixture(),now=Date.now();data.settings.oltTicketing.notificationCooldowns=Object.fromEntries(Array.from({length:2100},(_,i)=>[String(i).padStart(64,'0'),now+100000+i]));ticketing.normalizeQueuedTicketMessages(data,now);assert.equal(Object.keys(data.settings.oltTicketing.notificationCooldowns).length,2048);const key=ticketing.faultKeyFor(data.oltTickets[0],data.users[1].phone);assert.match(key,/^[a-f0-9]{64}$/);assert(!key.includes(data.users[1].phone));
});
test('completion is not sent again after editing notes or changing the resolved history entry',()=>{
 const data=fixture(),ticket=data.oltTickets[0];ticket.status='resolved';ticket.assignedTo='technician';ticket.resolvedAt=new Date().toISOString();ticket.history=[{id:'closed',kind:'recovered'}];assert.equal(ticketing.enqueueNotifications(data,ticket,'resolved','https://billing.example.test',enqueue).queued,1);const message=data.waMessages[0];message.status='sent';message.sentAt=new Date().toISOString();const key=ticketing.eventKey(ticket,'resolved');ticket.history.push({id:'edit',kind:'updated',note:'Revised note'});ticket.updatedAt=new Date(Date.now()+1000).toISOString();assert.equal(ticketing.eventKey(ticket,'resolved'),key);assert.equal(ticketing.enqueueNotifications(data,ticket,'resolved','https://billing.example.test',enqueue).queued,0);
});

test('service WhatsApp messages omit NAS only from text and resolve old ticket contacts from current member data',()=>{
 const data=fixture();data.customers=[{id:'member-current',name:'Current Customer',phone:'081200000001',address:'Full Street and House Number',latitude:-0.5,longitude:117.15}];
 const ticket={id:'service-old',number:'TKT-OLD',source:'wifiku',scope:'service',kind:'request',category:'billing',customerId:'member-current',customerName:'Old Name',nasId:'nas-a',nasName:'PRIVATE_NAS_NAME',messages:[{text:'Please check my bill'}]};
 const before=structuredClone(data),text=ticketing.messageText(data,ticket,'detected','https://billing.example.test');
 assert(text.includes('Pelanggan: Current Customer'));assert(text.includes('Kontak: 081200000001'));assert(text.includes('Alamat: Full Street and House Number'));
 assert(text.includes('https://www.google.com/maps/dir/?api=1&destination=-0.5%2C117.15'));assert(!text.includes('NAS:'));assert(!text.includes('PRIVATE_NAS_NAME'));
 assert.equal(ticket.nasId,'nas-a');assert.equal(ticket.nasName,'PRIVATE_NAS_NAME');assert.deepEqual(data,before);
 const unknown=ticketing.messageText(data,{...ticket,customerId:'missing',customerName:'New Prospect'},'detected','https://billing.example.test');assert(unknown.includes('Alamat: Belum dilengkapi'));assert(unknown.includes('Arah pelanggan: Belum dilengkapi'));assert(!unknown.includes('destination=0'));
});

test('two service bucket tabs include every active workflow status and resolved works without an explicit status',()=>{
 const data=fixture(),base=data.oltTickets[0];
 data.oltTickets=['new','assigned','working','resolved'].flatMap((status,index)=>[
  {...base,id:'fault-'+status,status,kind:'fault',updatedAt:new Date(1700000000000+index).toISOString()},
  {...base,id:'request-'+status,source:'wifiku',scope:'service',oltId:'',nasId:'nas-a',status,kind:'request',category:'billing',customerId:'member-a',updatedAt:new Date(1700000001000+index).toISOString()}
 ]);
 const user=auth.publicUser(data.users[0]),before=structuredClone(data);
 for(const kind of ['fault','request']){
  const active=ticketing.ticketPage(data,user,{kind,bucket:'open'});
  assert.deepEqual(new Set(active.tickets.map(row=>row.status)),new Set(['new','assigned','working']));assert.equal(active.total,3);assert.equal(active.counts.resolved,1);assert.equal(active.counts.all,4);
  const resolved=ticketing.ticketPage(data,user,{kind,bucket:'resolved'});
  assert.equal(resolved.total,1,'resolved tab must override the legacy default-open filter');assert.equal(resolved.tickets[0].status,'resolved');assert.equal(resolved.counts.open,3);
 }
 assert.equal(ticketing.ticketPage(data,user,{bucket:'open',status:'working'}).total,2);
 assert.equal(ticketing.ticketPage(data,user,{bucket:'resolved',status:'all'}).total,2);
 assert.deepEqual(data,before);
});

test('service ticket paging respects NAS and roles without OLT linkage and strips private conversations',()=>{
 const data=fixture();data.radiusNas=[{id:'radius-a',monitoringTargetId:'nas-a'}];
 data.oltTickets=['nas-a','nas-b',''].map((nasId,i)=>({id:'service-'+i,source:'wifiku',scope:'service',kind:i?'request':'fault',category:'billing',nasId,nasName:'NAS '+i,oltId:'',status:'new',title:'Service '+i,customerId:'member-'+i,customerName:'Member '+i,messages:[{text:'PRIVATE_CHAT'}],description:'PRIVATE_NOTE',history:[{note:'PRIVATE_HISTORY'}],password:'PRIVATE_PASSWORD',waNotifications:{detected:'PRIVATE_WA'},updatedAt:new Date(1700000000000+i).toISOString()}));
 const technician={...auth.publicUser(data.users[1]),lockedNasIds:['radius-a']};
 const page=ticketing.ticketPage(data,technician);assert.deepEqual(page.tickets.map(row=>row.id),['service-0']);assert(!JSON.stringify(page).includes('PRIVATE_'));assert.equal(ticketing.ticketPage(data,technician,{nasId:'nas-b'}).total,0);
 assert.equal(ticketing.ticketPage(data,auth.publicUser(data.users[2]),{kind:'request'}).total,2);assert.equal(ticketing.ticketPage(data,auth.publicUser(data.users[3])).total,3);
 assert.equal(ticketing.ticketPage(data,auth.publicUser(data.users[0]),{search:'Member 1'}).total,1);
});

test('service fault dedup keys isolate customer and category, and notifications recheck NAS authorization',()=>{
 const data=fixture(),base={id:'service-a',number:'TKT-UNIT',source:'wifiku',scope:'service',kind:'request',category:'billing',customerId:'member-a',customerName:'Member A',nasId:'nas-a',nasName:'NAS A',oltId:'',status:'new',assignedTo:'',createdAt:new Date().toISOString(),messages:[{role:'customer',text:'Customer request'}],description:'PRIVATE_NOTE',history:[{note:'PRIVATE_HISTORY'}]};
 data.oltTickets=[base];data.users[1].lockedNasIds=['nas-b'];
 assert.deepEqual(ticketing.recipientsFor(data,base).map(row=>row.id),['secretary']);assert.equal(ticketing.enqueueNotifications(data,base,'detected','https://billing.example.test',enqueue).queued,1);
 const message=data.waMessages[0];assert(message.text.includes('Customer request'));assert(message.text.includes('Member A'));assert(!message.text.includes('PRIVATE_'));assert.equal(ticketing.deliveryAllowed(data,message),true);
 const key=ticketing.faultKeyFor(base,message.phone);assert.match(key,/^[a-f0-9]{64}$/);assert.equal(ticketing.faultKeyFor({...base,id:'new-ticket'},message.phone),key);
 assert.notEqual(ticketing.faultKeyFor({...base,customerId:'member-b'},message.phone),key);assert.notEqual(ticketing.faultKeyFor({...base,category:'addon'},message.phone),key);
 data.users[2].role='finance';assert.equal(ticketing.deliveryAllowed(data,message),false);assert.equal(ticketing.cancelQueued(data),1);
});
