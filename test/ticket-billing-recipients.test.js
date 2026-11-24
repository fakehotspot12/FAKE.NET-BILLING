'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),notifications=require('../src/olt-ticketing'),service=require('../src/service-tickets'),auth=require('../src/auth');
function fixture(){
 const users=[{id:'tech',name:'Technician',role:'technician',active:true,phone:'081200000001',lockedNasIds:['nas-a']},{id:'collector',name:'Collector',role:'collector',active:true,ticketCreationAllowed:true,phone:'081200000002',lockedNasIds:['nas-a']},{id:'finance',name:'Finance',role:'finance',active:true,phone:'081200000003',lockedNasIds:['nas-a']},{id:'blocked',name:'No ticket access',role:'collector',active:true,phone:'081200000004'}];
 const ticket={id:'billing',source:'wifiku',scope:'service',category:'billing',kind:'request',customerId:'member',nasId:'nas-a',status:'new',assignedTo:'',number:'TKT-UNIT',createdAt:new Date().toISOString(),messages:[]};
 const data={users,settings:{waGateway:{enabled:true},oltTicketing:{enabled:true,whatsappEnabled:true,recipientIds:['tech','collector','finance']}},customers:[{id:'member',name:'Member',nasId:'nas-a'}],radiusUsers:[],radiusNas:[],monitoringTargets:[{id:'nas-a',name:'Area A'},{id:'nas-b',name:'Area B'}],oltDevices:[{id:'olt',nasId:'nas-a'}],oltTickets:[ticket],waMessages:[]};return{data,users,ticket};
}
const enqueue=(data,payload)=>{const row={...payload,id:'wa-'+data.waMessages.length,status:'queued'};data.waMessages.push(row);return row;};
test('settings offer billing recipients with role, phone, NAS and disabled access state, without adding technical assignees',()=>{
 const{data}=fixture(),options=notifications.recipientOptions(data);assert.equal(options.length,4);assert.equal(options.find(row=>row.id==='collector').scope,'billing');assert.deepEqual(options.find(row=>row.id==='collector').nasNames,['Area A']);assert.equal(options.find(row=>row.id==='blocked').canReceive,false);assert.deepEqual(notifications.eligibleUsers(data).map(row=>row.id),['tech']);
 assert.throws(()=>notifications.validateSettings(data,{whatsappEnabled:true,recipientIds:['blocked']}));assert.doesNotThrow(()=>notifications.validateSettings(data,{whatsappEnabled:true,recipientIds:['collector','finance']}));
});
test('collector and finance receive billing only, never faults, PSB, add-ons or OLT LOS',()=>{
 const{data,ticket}=fixture();assert.deepEqual(notifications.recipientsFor(data,ticket).map(row=>row.id),['collector','finance']);
 for(const category of['internet-down','wifi-modem','new-installation','addon','package-change'])assert.deepEqual(notifications.recipientsFor(data,{...ticket,category}).map(row=>row.id),['tech'],category);
 assert.deepEqual(notifications.recipientsFor(data,{...ticket,source:'olt-los',scope:'onu',category:undefined,oltId:'olt',serialNumber:'HWTCAABB0001'}).map(row=>row.id),['tech']);
});
test('selected collector can read billing in its NAS but cannot read another NAS or other staff/customer technical tickets',()=>{
 const{data,users,ticket}=fixture(),collector=users[1];assert(service.visible(data,collector,ticket));assert(!service.visible(data,collector,{...ticket,nasId:'nas-b'}));assert(!service.visible(data,collector,{...ticket,category:'wifi-modem'}));assert(!service.visible(data,collector,{...ticket,source:'olt-los',scope:'onu',oltId:'olt'}));
 assert(!service.visible(data,collector,{...ticket,source:'staff-service',nasId:'',customerId:'',createdBy:'someone-else'}));
 data.settings.oltTicketing.recipientIds=['tech'];assert(!service.visible(data,collector,ticket));
});
test('billing recipients do not gain claim, progress, technical writes or OLT actions from a checkbox',()=>{
 const{users}=fixture();for(const user of users.filter(row=>['finance','collector'].includes(row.role)))for(const permission of['olt:tickets:write','olt:manage','olt:onu:reboot','olt:onu:delete'])assert(!auth.hasPermission(auth.publicUser(user),permission),user.role+': '+permission);
});
test('queued delivery rechecks recipient selection, active state, access grant and NAS',()=>{
 for(const type of['removed','inactive','access','nas']){const{data,users,ticket}=fixture();notifications.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue);const message=data.waMessages.find(row=>row.oltTicketRecipientId==='collector');assert(message);assert(notifications.deliveryAllowed(data,message));if(type==='removed')data.settings.oltTicketing.recipientIds=['tech','finance'];if(type==='inactive')users[1].active=false;if(type==='access')users[1].ticketCreationAllowed=false;if(type==='nas')users[1].lockedNasIds=['nas-b'];assert(!notifications.deliveryAllowed(data,message),type);}
});
test('phone deduplication spans billing recipients without changing financial or user data',()=>{
 const{data,users,ticket}=fixture();users[2].phone=users[1].phone;const before=JSON.stringify(data.users);assert.equal(notifications.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue).queued,1);assert.equal(JSON.stringify(data.users),before);assert.equal(data.waMessages.filter(row=>row.phone===users[1].phone).length,1);
});
test('admin, owner and secretary have independent billing choices defaulting to unchecked without changing superuser access',()=>{
 for(const role of['admin','owner','secretary']){const{data,ticket}=fixture(),user={id:'super',role,active:true,phone:'081200000005'};data.users.push(user);data.settings.oltTicketing.recipientIds=['super'];const options=notifications.recipientOptions(data).find(row=>row.id==='super');assert.deepEqual(options.scopes,['technical','billing']);assert.deepEqual(notifications.settingsFor(data).billingRecipientIds,[]);assert.equal(notifications.recipientsFor(data,ticket).length,0);assert.deepEqual(notifications.recipientsFor(data,{...ticket,category:'wifi-modem',kind:'fault'}).map(row=>row.id),['super']);assert(service.visible(data,user,ticket));assert(auth.hasPermission(auth.publicUser(user),'olt:manage'));}
});
test('an administrator can choose billing only, faults only or both; selections never imply one another',()=>{
 for(const[technical,billing]of[[true,false],[false,true],[true,true]]){const{data,ticket}=fixture();data.users.push({id:'admin',role:'admin',active:true,phone:'081200000005'});data.settings.oltTicketing=notifications.validateSettings(data,{whatsappEnabled:true,recipientIds:technical?['admin']:[],billingRecipientIds:billing?['admin']:[]});assert.equal(notifications.recipientsFor(data,ticket).some(row=>row.id==='admin'),billing);assert.equal(notifications.recipientsFor(data,{...ticket,category:'internet-down',kind:'fault'}).some(row=>row.id==='admin'),technical);}
});
test('explicit empty billing selection revokes delivery and collector visibility even if legacy IDs are present',()=>{
 const{data,users,ticket}=fixture();notifications.enqueueNotifications(data,ticket,'detected','https://billing.example.test',enqueue);const message=data.waMessages.find(row=>row.oltTicketRecipientId==='collector');data.settings.oltTicketing.billingRecipientIds=[];assert.equal(notifications.recipientsFor(data,ticket).length,0);assert(!notifications.deliveryAllowed(data,message));assert(!service.visible(data,users[1],ticket));
});
test('legacy financial opt-ins are preserved without subscribing existing administrators or technicians to billing',()=>{
 const{data}=fixture();data.users.push({id:'admin',role:'admin',active:true,phone:'081200000005'});data.settings.oltTicketing.recipientIds.push('admin');const before=structuredClone(data);assert.deepEqual(notifications.settingsFor(data).recipientIds,['tech','admin']);assert.deepEqual(notifications.settingsFor(data).billingRecipientIds,['collector','finance']);assert.deepEqual(data,before);const next=notifications.validateSettings(data,{whatsappEnabled:true,recipientIds:['tech','collector','finance','admin']});assert.deepEqual(next.recipientIds,['tech','admin']);assert.deepEqual(next.billingRecipientIds,['collector','finance']);
});
test('category-scoped settings reject wrong roles, invalid arrays and too many recipients before mutation',()=>{
 const{data}=fixture(),before=structuredClone(data);for(const payload of[{recipientIds:['collector'],billingRecipientIds:[]},{recipientIds:[],billingRecipientIds:['tech']},{recipientIds:[],billingRecipientIds:'admin'},{recipientIds:[],billingRecipientIds:[null]},{recipientIds:[],billingRecipientIds:Array(26).fill('finance')},{recipientIds:[],billingRecipientIds:['blocked']}])assert.throws(()=>notifications.validateSettings(data,{whatsappEnabled:true,...payload}));assert.deepEqual(data,before);
});
test('old clients preserve an explicit billing choice rather than erasing or auto-enabling administrator billing',()=>{
 const{data}=fixture();data.users.push({id:'admin',role:'admin',active:true,phone:'081200000005'});data.settings.oltTicketing.billingRecipientIds=['admin'];const result=notifications.validateSettings(data,{whatsappEnabled:true,recipientIds:['tech']});assert.deepEqual(result.billingRecipientIds,['admin']);data.settings.oltTicketing.billingRecipientIds=[];assert.deepEqual(notifications.validateSettings(data,{whatsappEnabled:true,recipientIds:['tech']}).billingRecipientIds,[]);
});
test('a role change removes category authority even when the previous recipient ID remains selected',()=>{
 const{data,ticket}=fixture(),admin={id:'admin',role:'admin',active:true,phone:'081200000005'};data.users.push(admin);data.settings.oltTicketing.billingRecipientIds=['admin'];assert(notifications.recipientsFor(data,ticket).some(row=>row.id==='admin'));admin.role='technician';assert(!notifications.recipientsFor(data,ticket).some(row=>row.id==='admin'));
});
