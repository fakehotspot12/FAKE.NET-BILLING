'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),team=require('../src/ticket-team'),olt=require('../src/olt-monitor'),service=require('../src/service-tickets'),notifications=require('../src/olt-ticketing');
function fixture(){
 const users=[{id:'lead',name:'Lead',role:'technician',phone:'081200000001'},{id:'a',name:'Assistant A',role:'technician',phone:'081200000002'},{id:'b',name:'Assistant B',role:'technician',phone:'081200000003'},{id:'other',role:'technician'},{id:'admin',role:'admin'},{id:'finance',role:'finance'},{id:'inactive',role:'technician',active:false},{id:'foreign',role:'technician',lockedNasIds:['nas-b']}];
 const data={users,settings:{waGateway:{enabled:true},oltTicketing:{enabled:true,whatsappEnabled:true,recipientIds:['lead']}},customers:[],radiusUsers:[],radiusNas:[],monitoringTargets:[{id:'nas-a'},{id:'nas-b'}],oltDevices:[],waMessages:[]};
 const ticket={id:'ticket',number:'T-001',source:'staff-service',scope:'service',category:'billing',kind:'request',title:'Unit',status:'assigned',assignedTo:'lead',nasId:'nas-a',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),history:[]};data.oltTickets=[ticket];return{data,ticket,users,actor:users[0]};
}
test('legacy tickets retain one primary owner and public team never exposes contact credentials',()=>{
 const f=fixture();assert.deepEqual(team.memberIds(f.ticket),['lead']);assert.deepEqual(team.publicTeam(f.data,f.ticket),[{id:'lead',name:'Lead',lead:true,active:true}]);assert(!JSON.stringify(team.publicTeam(f.data,f.ticket)).includes('0812'));
});
test('manual closure is restricted to admin/secretary except assigned ODP/ODC technicians; reopening remains administrative',()=>{
 const f=fixture(),group={...f.ticket,scope:'odp',source:'olt-los',fiberPointId:'odp',companionIds:['a']};
 for(const role of['admin','secretary'])assert(team.canClose({id:role,role,active:true},f.ticket));
 for(const role of['technician','noc','owner','finance','collector','viewer','reseller_voucher'])assert.equal(team.canClose({id:'lead',role,active:true},f.ticket),false);
 assert(team.canClose(f.actor,group));assert(team.canClose(f.users[1],group));assert(!team.canClose(f.users[3],group));
 assert.throws(()=>team.requireStatusChange(f.ticket,{stage:'resolved'},f.actor),error=>error.status===403);assert.doesNotThrow(()=>team.requireStatusChange(group,{status:'resolved'},f.actor));
 assert.throws(()=>team.requireStatusChange({...group,status:'resolved'},{status:'working'},f.actor),error=>error.status===403);assert.doesNotThrow(()=>team.requireStatusChange({...group,status:'resolved'},{status:'working'},f.users.find(row=>row.role==='admin')));
});
test('lead chooses multiple companions, preserves status and adds one internal audit history entry',()=>{
 const f=fixture(),before=structuredClone(f.ticket),next=team.update(f.data,f.ticket,{revision:f.ticket.updatedAt,companionIds:['a','b','a']},f.actor,service.visible);
 assert.equal(next.assignedTo,'lead');assert.equal(next.status,'assigned');assert.deepEqual(next.companionIds,['a','b']);assert.equal(next.history.at(-1).kind,'team');assert.equal(next.lastStaffMessageAt,undefined);assert.deepEqual(f.ticket,before);assert.equal(team.update(f.data,next,{revision:next.updatedAt,companionIds:['b','a']},f.actor,service.visible),next);
});
test('companions can progress and reply but cannot change team or take over the owner',()=>{
 const f=fixture();f.ticket.companionIds=['a','b'];for(const id of ['a','b']){const actor=f.users.find(row=>row.id===id);assert(team.canHandle(f.ticket,actor));assert(!team.canManage(f.ticket,actor));assert.equal(olt.progressTicket(f.ticket,{note:'Checked'},actor).status,'working');assert.doesNotThrow(()=>olt.requireTicketEditor(f.ticket,{},actor));assert.throws(()=>olt.requireTicketEditor(f.ticket,{assignedTo:'lead'},actor),error=>error.status===403);assert.throws(()=>team.update(f.data,f.ticket,{revision:f.ticket.updatedAt,companionIds:[]},actor,service.visible),error=>error.status===403);assert.throws(()=>olt.claimTicket(f.ticket,actor),/sudah diambil/);}
 assert.throws(()=>olt.progressTicket(f.ticket,{note:'Cannot touch'},f.users.find(row=>row.id==='other')),error=>error.status===403);
 assert(!team.canHandle(f.ticket,f.users.find(row=>row.id==='finance')));
});
test('invalid, inactive, unauthorized, primary-owner and foreign-NAS candidates are rejected',()=>{
 const f=fixture();for(const id of ['lead','finance','inactive','missing','foreign'])assert.throws(()=>team.update(f.data,f.ticket,{revision:f.ticket.updatedAt,companionIds:[id]},f.actor,service.visible),error=>error.status===400,id);
 for(const value of [null,'a',[1],Array.from({length:33},()=> 'a')])assert.throws(()=>team.update(f.data,f.ticket,{revision:f.ticket.updatedAt,companionIds:value},f.actor,service.visible));
 for(const revision of [undefined,'old'])assert.throws(()=>team.update(f.data,f.ticket,{revision,companionIds:['a']},f.actor,service.visible),error=>error.status===409);
 assert(!team.candidates(f.data,f.ticket,service.visible).some(row=>['lead','inactive','finance','foreign'].includes(row.id)));
});
test('coordinator may manage team but resolved/unclaimed tickets and revoked actors stay protected',()=>{
 const f=fixture(),admin=f.users.find(row=>row.id==='admin');assert(team.canManage(f.ticket,admin));assert.deepEqual(team.update(f.data,f.ticket,{revision:f.ticket.updatedAt,companionIds:['a']},admin,service.visible).companionIds,['a']);
 for(const change of [{status:'resolved'},{assignedTo:''}])assert.throws(()=>team.update(f.data,{...f.ticket,...change},{revision:f.ticket.updatedAt,companionIds:['a']},admin,service.visible));f.actor.active=false;assert.throws(()=>team.update(f.data,f.ticket,{revision:f.ticket.updatedAt,companionIds:['a']},f.actor,service.visible),error=>error.status===403);
});
test('private team changes never alter the customer-facing progress timeline',()=>{
 const f=fixture();Object.assign(f.ticket,{status:'working',history:[{kind:'progress',publicStage:'on-way',status:'working',at:f.ticket.updatedAt}]});const before=service.publicProgress(f.ticket);const next=team.update(f.data,f.ticket,{revision:f.ticket.updatedAt,companionIds:['a']},f.actor,service.visible);assert.deepEqual(service.publicProgress(next),before);
});
test('resolution recipients include only current authorized team and use existing notification scheduling',()=>{
 const f=fixture();f.ticket.companionIds=['a','b','inactive','finance','foreign'];f.ticket.status='resolved';f.ticket.resolvedAt=new Date().toISOString();assert.deepEqual(notifications.recipientsFor(f.data,f.ticket,'resolved').map(row=>row.id),['lead','a','b']);
 const result=notifications.enqueueNotifications(f.data,f.ticket,'resolved','https://billing.example.test',(data,payload)=>{const message={...payload,id:'wa-'+data.waMessages.length,status:'queued'};data.waMessages.push(message);return message;});assert.equal(result.queued,3);assert(notifications.messageText(f.data,f.ticket,'resolved','https://billing.example.test').includes('Assistant A'));f.ticket.companionIds=[];assert.equal(notifications.cancelQueued(f.data),2);assert.equal(f.data.waMessages.filter(row=>row.status==='queued').length,1);
});
