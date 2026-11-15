'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
const auth=require('../src/auth'),service=require('../src/service-tickets');

test('finance may create service tickets by default without technical administration',()=>{
 const user=auth.publicUser({id:'finance',role:'finance'});
 assert(user.ticketCreationAllowed);assert(auth.hasPermission(user,'olt:tickets:create'));assert(auth.hasPermission(user,'olt:tickets:read'));
 for(const permission of ['olt:tickets:write','olt:manage','olt:onu:delete','olt:onu:reboot','settings:write'])assert(!auth.hasPermission(user,permission),permission);
 const blocked=auth.publicUser({...user,ticketCreationAllowed:false});assert(!auth.hasPermission(blocked,'olt:tickets:create'));assert(!auth.hasPermission(blocked,'olt:tickets:read'));
});
test('an explicit per-user grant is strict, revocable and cannot remove technical role duties',()=>{
 for(const role of ['viewer','collector','partner','reseller_voucher']){
  for(const value of [undefined,false,'true',1])assert(!auth.hasPermission(auth.publicUser({role,ticketCreationAllowed:value}),'olt:tickets:create'));
  const granted=auth.publicUser({role,ticketCreationAllowed:true});assert(auth.hasPermission(granted,'olt:tickets:create'));assert(auth.hasPermission(granted,'olt:tickets:read'));assert(!auth.hasPermission(granted,'olt:tickets:write'));assert(!auth.hasPermission(granted,'olt:manage'));
 }
 for(const role of ['admin','owner','secretary','technician','noc'])assert(auth.publicUser({role,ticketCreationAllowed:false}).ticketCreationAllowed);
});
test('create and edit persist explicit permissions but malformed values are rejected before mutation',()=>{
 const data={users:[{id:'admin',username:'admin',role:'admin',active:true}]};let user=auth.createUser(data,{username:'finance01',role:'finance',password:'unitpass123',ticketCreationAllowed:false});assert.equal(user.ticketCreationAllowed,false);
 user=auth.updateUser(data,user.id,{ticketCreationAllowed:true});assert(user.ticketCreationAllowed);
 const before=structuredClone(data);for(const value of ['true',1,null,{}]){assert.throws(()=>auth.updateUser(data,user.id,{name:'MUST NOT CHANGE',ticketCreationAllowed:value}),/Izin/);assert.deepEqual(data,before);}
 auth.updateUser(data,user.id,{name:'Updated'});assert(auth.publicUser(data.users.find(row=>row.id===user.id)).ticketCreationAllowed);
});
test('finance creates an auditable ticket but cannot update it; disabling checkbox rejects new tickets',async()=>{
 const actor={id:'f1',role:'finance',active:true,name:'Finance'},data={users:[actor],customers:[],radiusUsers:[],oltTickets:[]};
 const payload={category:'billing',customerName:'Unit Customer',address:'Unit Address',text:'Please review payment'};
 const created=await service.createStaff(data,payload,actor);assert.equal(created.createdBy,'f1');assert.equal(created.source,'staff-service');assert.equal(created.status,'new');assert.equal(created.contactAddress,'Unit Address');
 assert.throws(()=>service.update(data,{status:'resolved'},actor,created),error=>error.status===403);
 actor.ticketCreationAllowed=false;await assert.rejects(service.createStaff(data,payload,actor),error=>error.status===403);
});
test('delegated users without a ticket-reading role can only read their own service tickets',()=>{
 const user={id:'collector',role:'collector',ticketCreationAllowed:true},data={users:[user],customers:[],radiusUsers:[],monitoringTargets:[],radiusNas:[],oltDevices:[]},own={id:'own',source:'staff-service',scope:'service',createdBy:'collector'};
 assert(service.visible(data,user,own));assert(!service.visible(data,user,{...own,createdBy:'another'}));assert(!service.visible(data,user,{...own,source:'olt-los'}));
 user.ticketCreationAllowed=false;assert(!service.visible(data,user,own));
});
test('per-user grants keep NAS and partner suffix boundaries',async()=>{
 const user={id:'p',role:'partner',ticketCreationAllowed:true,lockedNasIds:['a'],partnerUsernameSuffixes:['@example.test']},customer={id:'c',username:'demo@foreign.test',name:'Demo',nasId:'a'},data={users:[user],customers:[customer],radiusUsers:[{id:'u',username:customer.username,customerId:'c',nasId:'a'}],monitoringTargets:[{id:'a'},{id:'b'}],radiusNas:[],oltDevices:[],oltTickets:[]};
 assert(!service.visible(data,user,{source:'staff-service',scope:'service',customerId:'c',nasId:'a'}));
 customer.username='demo@example.test';data.radiusUsers[0].username=customer.username;require('../src/network-identity').invalidate();assert(service.visible(data,user,{source:'staff-service',scope:'service',customerId:'c',nasId:'a'}));assert(!service.visible(data,user,{source:'staff-service',scope:'service',customerId:'c',nasId:'b'}));
});
