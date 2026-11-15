'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),ref=require('../src/ticket-reference'),olt=require('../src/olt-monitor'),ticketing=require('../src/olt-ticketing');
test('legacy ticket numbers display as TKT without changing IDs or source records',()=>{
 const ticket={id:'old-id',number:'OLT-20261101-ABCDEF'},before=structuredClone(ticket);
 assert.equal(ref.number(ticket),'TKT-20261101-ABCDEF');assert.deepEqual(ticket,before);
 assert.equal(ref.number({number:'TKT-UNIT'}),'TKT-UNIT');assert.equal(ref.number({number:'CUSTOM-UNIT'}),'CUSTOM-UNIT');
 assert.equal(ticketing.ticketLink('https://billing.example.test',ticket),'https://billing.example.test/tkt.html?id=old-id');
 const data={oltDevices:[{id:'olt',enabled:true}],oltTickets:[],users:[]};const created=olt.saveTicket(data,{oltId:'olt',title:'Unit ticket'},{id:'admin'});assert.match(created.number,/^TKT-\d{8}-[A-F0-9]{6}$/);
});
test('canonical ticket APIs map only exact namespace boundaries to existing guarded handlers',()=>{
 for(const suffix of['','/a','/a/team','/a/progress','/a/photos/b'])assert.equal(ref.apiPath('/api/tickets'+suffix),'/api/monitoring/olt/tickets'+suffix);
 assert.equal(ref.apiPath('/api/tickets/options'),'/api/monitoring/olt/service-options');assert.equal(ref.apiPath('/api/tickets/settings'),'/api/monitoring/olt/ticket-settings');assert.equal(ref.apiPath('/api/tickets/templates'),'/api/monitoring/olt/ticket-templates');
 for(const path of['/api/ticketsx','/api/monitoring/olt/tickets','/api/public/wifiku/tickets','/api/ticket'])assert.equal(ref.apiPath(path),path);
});
