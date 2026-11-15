'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),ticketing=require('../src/olt-ticketing'),customerWa=require('../src/ticket-customer-notifications');
const NOW=Date.now(),sn=i=>'HWTC'+String(i).padStart(8,'0');
function fixture(){
 const customers=Array.from({length:4},(_,i)=>({id:'c'+i,name:'Customer '+i,phone:'08120000000'+i,nasId:'a',status:'active'})),ticket={id:'t',number:'TKT-UNIT',source:'olt-los',scope:'odp',fiberPointId:'odp',oltId:'olt',status:'new',createdAt:new Date(NOW).toISOString(),updatedAt:new Date(NOW).toISOString(),affectedSerialNumbers:customers.map((row,i)=>sn(i)),recoveryTargets:customers.map((row,i)=>({serialNumber:sn(i),customerId:row.id,pon:'0/0/1',odp:'odp'}))};
 return{settings:{waGateway:{enabled:true,minDelaySeconds:45},oltTicketing:{whatsappEnabled:false,recipientIds:[],customerOutageEnabled:true,customerOutageEnabledAt:new Date(NOW-1000).toISOString()}},users:[],customers,radiusUsers:[],radiusNas:[{id:'a'}],monitoringTargets:[],fiberPoints:[{id:'odp',name:'Area Unit'}],oltDevices:[{id:'olt',enabled:true,nasId:'a',links:Object.fromEntries(customers.map((row,i)=>[sn(i),{customerId:row.id,fiberPointId:'odp'}]))}],oltTickets:[ticket],waMessages:[]};
}
const enqueue=(data,payload)=>{const row={...payload,id:'msg'+data.waMessages.length,status:'queued',queueRevision:0,createdAt:new Date().toISOString()};data.waMessages.push(row);return row;};
test('customer notices default off, never backfill old incidents, and are independent from staff notifications',()=>{
 const data=fixture(),ticket=data.oltTickets[0];assert.equal(ticketing.settingsFor({settings:{}}).customerOutageEnabled,false);
 delete data.settings.oltTicketing.customerOutageEnabled;assert.equal(ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,0);
 data.settings.oltTicketing.customerOutageEnabled=true;ticket.createdAt=new Date(NOW-2000).toISOString();assert.equal(ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,0);
 ticket.createdAt=new Date(NOW).toISOString();assert.equal(ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,4);assert.equal(ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,0);
 assert(data.waMessages.every(row=>row.oltTicketAudience==='customer'&&ticketing.deliveryAllowed(data,row)));assert(data.waMessages.every(row=>!row.text.includes('/tkt.html')));
});
test('mass notices have bounded pacing, deduplicate phone and revalidate owner, NAS, phone and switch before sending',()=>{
 const data=fixture(),ticket=data.oltTickets[0];data.customers[1].phone=data.customers[0].phone;assert.equal(ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,3);
 const times=data.waMessages.map(row=>Date.parse(row.scheduledAt)).sort();assert(times[1]-times[0]>=45000);assert(times[2]-times[1]>=45000);assert(data.waMessages.every(row=>row.throttleDelaySeconds>=45&&row.priority===4));
 const row=data.waMessages.find(row=>row.oltTicketCustomerIds.includes('c2'));assert(ticketing.deliveryAllowed(data,row));data.customers[2].phone='081299999999';assert(!ticketing.deliveryAllowed(data,row));data.customers[2].phone=row.phone;data.customers[2].nasId='b';assert(!ticketing.deliveryAllowed(data,row));
 data.waMessages.push({id:'invoice',type:'invoiceIssued',status:'queued'});data.settings.oltTicketing.customerOutageEnabled=false;ticketing.cancelQueued(data);assert(data.waMessages.filter(row=>row.type==='oltTicket').every(row=>row.status==='cancelled'));assert.equal(data.waMessages.at(-1).status,'queued');
});
test('repair notices only follow delivered incidents and distinguish online, power-off and remaining LOS',()=>{
 const data=fixture(),ticket=data.oltTickets[0];ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue);for(const row of data.waMessages.slice(0,3))Object.assign(row,{status:'sent',sentAt:new Date(NOW+1000).toISOString()});
 Object.assign(ticket,{status:'resolved',resolvedAt:new Date(NOW+2000).toISOString(),recovery:{ready:true,residualSerialNumbers:[sn(1)],poweredOffSerialNumbers:[sn(2)]}});
 assert.equal(ticketing.enqueueNotifications(data,ticket,'resolved','https://billing.example.test',enqueue).queued,3);const messages=data.waMessages.filter(row=>row.oltTicketKind==='resolved');assert.equal(messages.length,3);
 assert(messages.find(row=>row.oltTicketCustomerIds.includes('c0')).text.includes('kembali terhubung'));assert(messages.find(row=>row.oltTicketCustomerIds.includes('c1')).text.includes('pemeriksaan lanjutan'));assert(messages.find(row=>row.oltTicketCustomerIds.includes('c2')).text.includes('Silakan nyalakan modem'));assert(messages.every(row=>ticketing.deliveryAllowed(data,row)));
 ticketing.cancelQueued(data);assert.equal(data.waMessages.find(row=>row.oltTicketKind==='detected'&&row.oltTicketCustomerIds.includes('c3')).status,'cancelled');assert.equal(ticketing.enqueueNotifications(data,ticket,'resolved','https://billing.example.test',enqueue).queued,0);
});
test('moved/reassigned ONU, unproven ownership and inactive subscriptions do not receive customer broadcasts',()=>{
 const data=fixture(),ticket=data.oltTickets[0];data.oltDevices[0].links[sn(0)].customerId='c1';ticket.recoveryTargets[1].customerId='forged';data.customers[2].status='terminated';data.customers[3].phone='invalid';assert.equal(customerWa.recipients(data,ticket,'detected').length,0);
});
test('persistent incident receipts prevent duplicate notifications after WA history pruning',()=>{
 const data=fixture(),ticket=data.oltTickets[0];ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue);
 const sent=data.waMessages[0];Object.assign(sent,{status:'sent',sentAt:new Date().toISOString()});ticketing.recordDelivery(data,sent,sent.sentAt);data.waMessages=[];
 assert.equal(ticketing.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,0);
 Object.assign(ticket,{status:'resolved',resolvedAt:new Date().toISOString(),recovery:{ready:true,residualSerialNumbers:[],poweredOffSerialNumbers:[]}});
 assert.equal(ticketing.enqueueNotifications(data,ticket,'resolved','https://billing.example.test',enqueue).queued,1);data.waMessages=[];assert.equal(ticketing.enqueueNotifications(data,ticket,'resolved','https://billing.example.test',enqueue).queued,0);
});
