'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');
const auth = require('../src/auth');
const olt = require('../src/olt-monitor');
const service = require('../src/service-tickets');
const { createDefaultStore } = require('../src/store');

const NOW = Date.parse('2026-11-13T04:00:00Z');
const customer = { id: 'customer-a', name: 'Customer A', username: 'pppoe-a', password: 'PRIVATE_PASSWORD' };
const other = { id: 'customer-b', name: 'Customer B', username: 'pppoe-b' };
const actor = { id: 'tech', name: 'Technician', role: 'technician', active: true };
const post = (extra = {}) => ({ category: 'internet-down', text: 'Lampu LOS merah', ...extra });
const status = code => error => error.status === code;

function fixture() {
  const data = createDefaultStore();
  data.customers = [structuredClone(customer), structuredClone(other)];
  data.users = [actor, { id: 'finance', role: 'finance', active: true }, { id: 'inactive', role: 'technician', active: false }];
  data.oltTickets = [];
  return data;
}
async function opened(data = fixture(), extra = {}, context = {}) {
  return (await service.create(data, customer, post(extra), { now: NOW, nasId: 'nas-a', ...context })).ticket;
}
async function photoDirectory(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fakenet-service-photo-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return path.join(root, 'private');
}
async function imageData(format = 'png', width = 24, height = 12) {
  const buffer = await sharp({ create: { width, height, channels: 3, background: '#7d2e93' } }).withMetadata({ orientation: 6 })[format]().toBuffer();
  return 'data:image/' + (format === 'jpeg' ? 'jpeg' : format) + ';base64,' + buffer.toString('base64');
}

test('customer ticket creation derives identity and kind without financial, subscription or WA mutations', async () => {
  const data = fixture(), before = structuredClone({ ...data, oltTickets: undefined });
  const ticket = await opened(data, { category: 'billing', customerId: other.id, status: 'resolved', assignedTo: 'finance', nasId: 'nas-b', kind: 'fault', source: 'olt-los', password: 'FORGED' });
  assert.equal(ticket.customerId, customer.id);
  assert.equal(ticket.createdBy, 'customer:' + customer.id);
  assert.equal(ticket.nasId, 'nas-a');
  assert.equal(ticket.kind, 'request');
  assert.equal(ticket.source, 'wifiku');
  assert.equal(ticket.status, 'new');
  assert.equal(ticket.assignedTo, '');
  assert.equal(ticket.oltId, '');
  assert.equal(ticket.password, undefined);
  assert.equal(ticket.messages[0].role, 'customer');
  assert.equal(ticket.messages[0].name, 'Anda');
  assert.match(ticket.number, /^TKT-20261113-[A-F0-9]{6}$/);
  assert.deepEqual({ ...data, oltTickets: undefined }, before);
});

test('same category deduplicates only within the same customer and active ticket', async () => {
  const data = fixture(), first = await opened(data);
  const duplicate = await service.create(data, customer, post(), { now: NOW + 1 });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.ticket.id, first.id);
  assert.equal(first.messages.length, 1);
  const followup = await service.create(data, customer, post({ text: 'Masih merah' }), { now: NOW + 10000 });
  assert.equal(followup.created, false);
  assert.equal(followup.ticket.messages.length, 2);
  const separate = await service.create(data, other, post(), { now: NOW + 10000 });
  assert.equal(separate.created, true);
  assert.notEqual(separate.ticket.id, first.id);
  first.status = 'resolved';
  assert.equal((await service.create(data, customer, post(), { now: NOW + 20000 })).created, true);
  data.oltTickets.push({ ...first, id: 'internal', source: 'olt-los' });
  assert.deepEqual(service.customerTickets(data, other).map(row => row.id), [separate.ticket.id]);
  assert.equal(service.customerTickets(data, customer).length, 2);
});

test('customer projection is an allowlist without internal notes, credentials, identity or photo paths', async () => {
  const data = fixture(), ticket = await opened(data);
  Object.assign(ticket, { assignedTo: 'tech', description: 'PRIVATE_NOTE', history: [{ note: 'PRIVATE_HISTORY' }], password: 'PRIVATE_PASSWORD', communityEnc: 'PRIVATE_COMMUNITY', waNotifications: { detected: 'PRIVATE_WA' }, notificationError: 'PRIVATE_ERROR' });
  Object.assign(ticket.messages[0], { internalNote: 'PRIVATE_MESSAGE', photos: [{ id: 'photo-id', path: '/PRIVATE_PATH', size: 42, filename: 'PRIVATE_FILENAME' }] });
  const summary = service.publicTicket(data, ticket), detail = service.publicTicket(data, ticket, true);
  assert.equal(summary.messages, undefined);
  assert.equal(detail.staffName, actor.name);
  assert.deepEqual(Object.keys(detail).sort(), ['id', 'number', 'title', 'kind', 'category', 'categoryLabel', 'status', 'statusLabel', 'staffName', 'createdAt', 'updatedAt', 'unread', 'messages', 'progress'].sort());
  assert.deepEqual(Object.keys(detail.messages[0]).sort(), ['id', 'role', 'name', 'text', 'at', 'photos'].sort());
  assert.deepEqual(detail.messages[0].photos, [{ id: 'photo-id' }]);
  assert(!JSON.stringify(detail).includes('PRIVATE_'));
  ticket.messages = Array.from({ length: 110 }, (_, i) => ({ id: String(i), role: 'customer', text: 'Text', photos: [] }));
  assert.equal(service.publicTicket(data, ticket, true).messages.length, 100);
  assert.equal(service.publicTicket(data, ticket, true).messages[0].id, '10');
});

test('old service tickets derive current member contact and directions without rewriting stored records', async () => {
  const data=fixture(),ticket=await opened(data);
  Object.assign(data.customers[0],{name:'Updated Name',phone:'081200000001',address:'Full Customer Address',latitude:'-0.5',longitude:'117.15'});
  const before=structuredClone(data),location=service.ticketLocation(data,ticket);
  assert.equal(ticket.contactAddress,undefined);
  assert.equal(location.name,'Updated Name');assert.equal(location.phone,'081200000001');assert.equal(location.address,'Full Customer Address');
  assert.deepEqual(location.coordinates,{latitude:-0.5,longitude:117.15});
  assert.equal(new URL(location.locationUrl).searchParams.get('destination'),'-0.5,117.15');
  assert.deepEqual(data,before);
  for(const point of [[0,0],['','117'],[null,117],[91,117],[-0.5,181],['bad',117]])assert.equal(service.coordinates(...point),null);
  assert.deepEqual(service.coordinates(0,117),{latitude:0,longitude:117});
  const prospective={customerName:'Prospect',contactPhone:'081200000002',contactAddress:'Survey Location',latitude:-0.6,longitude:117.2,locationUrl:'javascript:evil()'};
  assert.match(service.ticketLocation(data,prospective).locationUrl,/^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.equal(service.ticketLocation(data,{...prospective,latitude:0,longitude:0}).locationUrl,'');
});

test('service progress needs no free-text bureaucracy, preserves claim checks and exposes only explicit public notes', async () => {
  const data=fixture(),ticket=await opened(data),before=structuredClone(data);
  assert.throws(()=>service.progress(ticket,{stage:'checking'},actor,NOW+1000),/Ambil atau tugaskan/);
  let next=olt.claimTicket(ticket,actor,NOW+1000);
  assert.throws(()=>service.progress(next,{stage:'checking'},{...actor,id:'other'},NOW+2000),status(403));
  assert.throws(()=>service.progress(next,{stage:'private-secret'},actor,NOW+2000),status(400));
  assert.throws(()=>service.progress(next,{stage:'resolved',status:'working'},actor,NOW+2000),status(400));
  next=service.progress(next,{stage:'on-way',note:'PRIVATE_INTERNAL',publicNote:'Kami sedang menuju lokasi.'},actor,NOW+2000);
  assert.equal(next.status,'working');assert.equal(next.history.at(-1).note,'PRIVATE_INTERNAL');
  assert.equal(service.progress(next,{stage:'on-way',note:'PRIVATE_INTERNAL',publicNote:'Kami sedang menuju lokasi.'},actor,NOW+2001),next);
  next=service.progress(next,{stage:'checking'},actor,NOW+3000);
  const progress=service.publicTicket(data,next,true).progress;
  assert.deepEqual(progress.map(row=>row.stage),['received','assigned','on-way','checking']);
  assert.equal(progress[2].note,'Kami sedang menuju lokasi.');
  assert(!JSON.stringify(progress).includes('PRIVATE_INTERNAL'));assert(!JSON.stringify(progress).includes(actor.id));
  assert.equal(service.publicTicket(data,next).progress,undefined);
  next=service.progress(next,{stage:'resolved'},actor,NOW+4000);
  assert.equal(next.status,'resolved');assert.equal(service.publicProgress(next).at(-1).label,'Selesai');
  assert.throws(()=>service.progress(next,{stage:'checking'},actor,NOW+5000),/sudah selesai/);
  assert.deepEqual(data,before);
});

test('public progress deduplicates repeated stages, ignores private metadata and bounds the timeline', async () => {
  const ticket={status:'working',createdAt:new Date(NOW).toISOString(),updatedAt:new Date(NOW+100000).toISOString(),history:[{status:'new',at:new Date(NOW).toISOString(),note:'PRIVATE'},{status:'assigned',at:new Date(NOW+1).toISOString()},{status:'assigned',at:new Date(NOW+2).toISOString(),note:'PRIVATE_AGAIN'}]};
  assert.deepEqual(service.publicProgress(ticket).map(row=>row.stage),['received','assigned','handling']);
  ticket.history=Array.from({length:60},(_,i)=>({status:'working',publicStage:i%2?'checking':'on-way',publicNote:'Visible '+i,note:'PRIVATE',userId:'PRIVATE_USER',at:new Date(NOW+i).toISOString()}));
  const progress=service.publicProgress(ticket);assert.equal(progress.length,12);assert.equal(progress[0].stage,'received');assert.equal(progress.at(-1).note,'Visible 59');assert(!JSON.stringify(progress).includes('PRIVATE'));
});

test('customer timeline explains each actual stage even without a public note and never falls back to private reasons', async () => {
  const data=fixture(),ticket=await opened(data);
  let next=olt.claimTicket(ticket,actor,NOW+1000);
  next=service.progress(next,{stage:'waiting-customer',note:'PRIVATE_INTERNAL_REASON'},actor,NOW+2000);
  const timeline=service.publicProgress(next);
  assert(timeline.every(row=>typeof row.note==='string'&&row.note.trim()));
  assert.equal(timeline.at(-1).note,'Penanganan menunggu konfirmasi atau kesiapan Anda.');
  assert(!JSON.stringify(timeline).includes('PRIVATE_INTERNAL_REASON'));
});

test('customer status follows actual latest progress in both list and detail, with custom explanations distinguished from defaults',async()=>{
  const data=fixture(),ticket=await opened(data);let next=olt.claimTicket(ticket,actor,NOW+1000);
  next=service.progress(next,{stage:'waiting-customer',publicNote:'Mohon pastikan modem menyala.'},actor,NOW+2000);data.oltTickets=[next];
  assert.equal(service.publicTicket(data,next).statusLabel,'Menunggu konfirmasi Anda');assert.equal(service.customerList(data,customer).tickets[0].statusLabel,'Menunggu konfirmasi Anda');
  const detail=service.publicTicket(data,next,true);assert.equal(detail.progress.at(-1).customNote,true);assert.equal(detail.progress[0].customNote,false);
  next=service.progress(next,{stage:'checking'},actor,NOW+3000);assert.equal(service.publicTicket(data,next).statusLabel,'Sedang diperiksa');
});

test('a real customer reply clears the confirmation prompt without inventing technician progress or rewriting history',async()=>{
  const data=fixture(),ticket=await opened(data);let next=service.progress(olt.claimTicket(ticket,actor,NOW+1000),{stage:'waiting-customer'},actor,NOW+2000);
  const history=structuredClone(next.history);await service.appendMessage(data,next,{text:'Modem sudah menyala.'},customer,{customer:true,now:NOW+13000});
  assert.equal(service.publicTicket(data,next).statusLabel,'Balasan Anda diterima');assert.equal(service.publicProgress(next).at(-1).stage,'customer-replied');assert.equal(next.status,'working');assert.deepEqual(next.history,history);
  assert.throws(()=>service.progress(next,{stage:'customer-replied'},actor,NOW+14000),status(400));
  next=service.progress(next,{stage:'checking'},actor,NOW+15000);assert.equal(service.publicTicket(data,next).statusLabel,'Sedang diperiksa');
});

test('ambiguous legacy pause wording is clarified only in customer projection without rewriting a custom title or old record',async()=>{
  const data=fixture(),ticket=await opened(data,{category:'pause-stop'});ticket.title='Berhenti sementara / berlangganan';
  assert.equal(service.publicTicket(data,ticket).title,'Berhenti sementara / tutup layanan');assert.equal(ticket.title,'Berhenti sementara / berlangganan');
  ticket.title='Permintaan penghentian sementara';assert.equal(service.publicTicket(data,ticket).title,ticket.title);
});

test('read cursor never marks a newer unseen staff update read and remains idempotent and monotonic',async()=>{
  const data=fixture(),ticket=await opened(data);ticket.lastStaffMessageAt=new Date(NOW+2000).toISOString();
  assert.equal(service.markRead(ticket,new Date(NOW+1000).toISOString(),NOW+3000),true);assert.equal(service.publicTicket(data,ticket).unread,true);
  assert.equal(service.markRead(ticket,new Date(NOW+500).toISOString(),NOW+3000),false);
  assert.equal(service.markRead(ticket,new Date(NOW+2000).toISOString(),NOW+3000),true);assert.equal(service.publicTicket(data,ticket).unread,false);
  assert.equal(service.markRead(ticket,new Date(NOW+2000).toISOString(),NOW+3000),false);
  for(const seen of ['bad','',42,null])assert.throws(()=>service.markRead(ticket,seen,NOW+3000),status(400));
});

test('edit ticket can publish customer explanation without exposing private description or resetting the actual progress stage', async () => {
  const data=fixture(),ticket=await opened(data),before=structuredClone(data);
  let next=service.progress(olt.claimTicket(ticket,actor,NOW+1000),{stage:'checking'},actor,NOW+2000);
  next=service.update(data,{description:'PRIVATE_DESCRIPTION',publicNote:'Kabel sedang diperiksa di lokasi.'},actor,next);
  assert.equal(next.description,'PRIVATE_DESCRIPTION');assert.equal(next.history.at(-1).publicNote,'Kabel sedang diperiksa di lokasi.');
  const customerView=service.publicTicket(data,next,true);
  assert.equal(customerView.progress.at(-1).stage,'checking');assert.equal(customerView.progress.at(-1).note,'Kabel sedang diperiksa di lokasi.');
  assert(!JSON.stringify(customerView).includes('PRIVATE_DESCRIPTION'));assert.equal(customerView.unread,true);
  const privateEdit=service.update(data,{description:'PRIVATE_EDIT_ONLY'},actor,next);assert.equal(privateEdit.lastStaffMessageAt,next.lastStaffMessageAt);assert.deepEqual(service.publicProgress(privateEdit),service.publicProgress(next));
  assert.throws(()=>service.update(data,{publicNote:'x'.repeat(301)},actor,next),status(400));
  assert.deepEqual(data,before);
});

test('prospect coordinates are optional and validated while registered member coordinates cannot be forged', async () => {
  const data=fixture(),payload={category:'new-installation',customerName:'Prospect',text:'Survey request',coordinates:'-0.5, 117.15'};
  const ticket=await service.createStaff(data,payload,actor);assert.equal(ticket.latitude,-0.5);assert.equal(ticket.longitude,117.15);
  for(const coordinates of ['0,0','-0.5','91,117','-0.5,181','bad,117'])await assert.rejects(service.createStaff(data,{...payload,coordinates},actor),status(400));
  Object.assign(data.customers[0],{latitude:-0.6,longitude:117.2});
  const linked=await service.createStaff(data,{...payload,customerId:customer.id,coordinates:'0,0'},actor);
  assert.equal(linked.latitude,-0.6);assert.equal(linked.longitude,117.2);
});

test('customer lists paginate each bucket, clamp pages and count unread without cross-customer leakage', async () => {
  const data = fixture(), template = await opened(data);
  data.oltTickets = Array.from({ length: 23 }, (_, i) => ({ ...template, id: 'a-' + i, status: i < 11 ? 'resolved' : 'working', updatedAt: new Date(NOW + i * 1000).toISOString(), lastStaffMessageAt: new Date(NOW + 5000).toISOString(), customerReadAt: i === 0 ? new Date(NOW + 6000).toISOString() : '' }));
  data.oltTickets.push({ ...template, id: 'other', customerId: other.id }, { ...template, id: 'internal', source: 'olt-los' });
  const before = structuredClone(data);
  const open = service.customerList(data, customer);
  assert.equal(open.total, 12);
  assert.equal(open.pages, 2);
  assert.equal(open.tickets.length, 10);
  assert.equal(open.tickets[0].id, 'a-22');
  assert.equal(open.unread, 22);
  assert.equal(open.closed, false);
  const closed = service.customerList(data, customer, { closed: '1', page: '99999' });
  assert.equal(closed.total, 11);
  assert.equal(closed.page, 2);
  assert.deepEqual(closed.tickets.map(row => row.id), ['a-0']);
  for (const page of ['-1', 'bad', '0']) assert.equal(service.customerList(data, customer, { page }).page, 1);
  assert.equal(service.customerList(data, { id: 'missing' }).pages, 1);
  assert.equal(service.customerList(data, { id: 'missing' }).total, 0);
  assert.deepEqual(data, before);
});

test('messages enforce the exact customer rate window, deduplicate retries and leave state untouched on rejection', async () => {
  const data = fixture(), ticket = await opened(data), before = structuredClone(ticket);
  assert.equal((await service.appendMessage(data, ticket, post(), customer, { customer: true, now: NOW + 1 })).changed, false);
  await assert.rejects(service.appendMessage(data, ticket, post({ text: 'New' }), customer, { customer: true, now: NOW + 9999 }), status(429));
  assert.deepEqual(ticket, before);
  assert.equal((await service.appendMessage(data, ticket, post({ text: 'New' }), customer, { customer: true, now: NOW + 10000 })).changed, true);
  assert.equal(ticket.customerReadAt, new Date(NOW + 10000).toISOString());
  await service.appendMessage(data, ticket, post({ text: 'Staff response' }), actor, { now: NOW + 10001 });
  assert.equal(ticket.lastStaffMessageAt, new Date(NOW + 10001).toISOString());
  assert.equal(service.publicTicket(data, ticket).unread, true);
  assert.equal((await service.appendMessage(data, ticket, post({ text: 'Staff response' }), actor, { now: NOW + 10002 })).changed, false);
  assert.equal((await service.appendMessage(data, ticket, post({ text: 'Staff response' }), actor, { now: NOW + 130001 })).changed, true);
});

test('invalid categories, empty or oversized messages and controls are rejected atomically', async () => {
  for (const payload of [post({ category: 'invented' }), post({ text: '' }), post({ text: '  ' }), post({ text: 42 }), post({ text: 'x'.repeat(1501) }), post({ text: 'bad\u0000' }), post({ text: 'bad\u007f' })]) {
    const data = fixture(), before = structuredClone(data);
    await assert.rejects(service.create(data, customer, payload, { now: NOW }), status(400));
    assert.deepEqual(data, before);
  }
  const ticket = await opened(fixture(), { text: ' \n' + 'x'.repeat(1496) + '\t ' });
  assert.equal(ticket.messages[0].text.length, 1496);
});

test('resolved tickets reject customer and staff replies, and conversation and photo counts are bounded', async () => {
  const data = fixture(), ticket = await opened(data);
  ticket.status = 'resolved';
  for (const isCustomer of [true, false]) await assert.rejects(service.appendMessage(data, ticket, post(), actor, { customer: isCustomer, now: NOW + 20000 }), status(409));
  ticket.status = 'working';
  ticket.messages = Array.from({ length: 99 }, (_, i) => ({ id: String(i), role: 'staff', text: String(i), at: new Date(NOW).toISOString(), photos: [] }));
  await service.appendMessage(data, ticket, post({ text: 'Message 100' }), actor, { now: NOW + 20000 });
  const before = structuredClone(ticket);
  await assert.rejects(service.appendMessage(data, ticket, post({ text: 'Message 101' }), actor, { now: NOW + 20001 }), status(409));
  assert.deepEqual(ticket, before);
  ticket.messages = [{ role: 'staff', photos: Array.from({ length: 5 }, (_, i) => ({ id: String(i) })) }];
  await assert.rejects(service.appendMessage(data, ticket, post({ text: 'Sixth photo', photo: 'invalid' }), actor, { now: NOW + 20000 }), /5 foto/);
});

test('active customer ceiling is five but continuing an existing category remains available', async () => {
  const data = fixture();
  for (const category of service.CATEGORIES.slice(0, 5)) await opened(data, { category: category.id });
  const before = structuredClone(data);
  await assert.rejects(opened(data, { category: service.CATEGORIES[5].id }), status(429));
  assert.deepEqual(data, before);
  assert.equal((await service.create(data, customer, post({ text: 'Follow up' }), { now: NOW + 10000 })).created, false);
  assert.equal((await service.create(data, other, post(), { now: NOW })).created, true);
});

test('ten daily submissions include resolved tickets and expire at the 24-hour boundary', async () => {
  const data = fixture(), template = await opened(data);
  data.oltTickets = Array.from({ length: 10 }, (_, i) => ({ ...template, id: 'daily-' + i, status: 'resolved', createdAt: new Date(NOW - 86400000 + 1).toISOString() }));
  await assert.rejects(opened(data), status(429));
  assert.equal((await service.create(data, other, post(), { now: NOW })).created, true);
  for (const ticket of service.customerTickets(data, customer)) ticket.createdAt = new Date(NOW - 86400000).toISOString();
  assert.equal((await service.create(data, customer, post(), { now: NOW })).created, true);
});

test('global active ceiling includes OLT incidents but not resolved history', async () => {
  const data = fixture();
  data.oltTickets = Array.from({ length: 500 }, (_, i) => ({ id: 'olt-' + i, source: 'olt-los', status: 'new' }));
  await assert.rejects(opened(data), status(429));
  data.oltTickets[0].status = 'resolved';
  assert.equal((await service.create(data, customer, post(), { now: NOW })).created, true);
  assert.equal((await service.create(data, customer, post({ text: 'Follow up' }), { now: NOW + 10000 })).created, false);
});

test('service visibility checks role and NAS locks including monitoring/radius aliases and missing NAS', async () => {
  const data = fixture(), ticket = await opened(data);
  data.radiusNas = [{ id: 'radius-a', monitoringTargetId: 'nas-a', monitoringId: 'monitor-a' }];
  for (const role of ['admin', 'owner', 'noc', 'secretary']) assert.equal(service.visible(data, auth.publicUser({ role, lockedNasIds: ['other'] }), ticket), true, role);
  for (const role of ['collector', 'reseller_voucher', 'partner']) assert.equal(service.visible(data, auth.publicUser({ role }), ticket), false, role);
  for (const role of ['finance', 'viewer']) assert.equal(service.visible(data, auth.publicUser({ role }), ticket), true, role);
  for (const locks of [[], ['all'], ['nas-a'], ['radius-a'], ['monitor-a']]) assert.equal(service.visible(data, { ...actor, lockedNasIds: locks }, ticket), true);
  assert.equal(service.visible(data, { ...actor, lockedNasId: 'nas-a' }, ticket), true);
  assert.equal(service.visible(data, { ...actor, lockedNasIds: ['nas-b'] }, ticket), false);
  assert.equal(service.visible(data, { ...actor, active: false }, ticket), false);
  assert.equal(service.visible(data, { role: 'admin', active: false }, ticket), false);
  assert.equal(service.visible(data, { ...actor, lockedNasIds: ['nas-a'] }, { ...ticket, nasId: '' }), false);
  data.oltDevices = [{ id: 'olt-a', enabled: true, nasId: 'nas-a' }];
  assert.equal(service.visible(data, { ...actor, lockedNasIds: ['nas-a'] }, { source: 'olt-los', oltId: 'olt-a' }), true);
  assert.equal(service.visible(data, { ...actor, lockedNasIds: ['nas-b'] }, { source: 'olt-los', oltId: 'olt-a' }), false);
});

test('staff update bounds history and preserves service identity without executing billing requests', async () => {
  const data = fixture(), ticket = await opened(data, { category: 'pause-stop' });
  ticket.history = Array.from({ length: 55 }, (_, i) => ({ id: String(i), note: 'Old' }));
  const before = structuredClone(data);
  const updated = service.update(data, { title: 'Checked', description: 'PRIVATE_NOTE', status: 'resolved', assignedTo: actor.id, customerId: other.id, nasId: 'nas-b', category: 'addon', source: 'olt-los', oltId: 'olt-forged', amount: 0 }, actor, ticket);
  assert.equal(updated.status, 'resolved');
  assert(updated.resolvedAt);
  assert.equal(updated.history.length, 50);
  assert.equal(updated.history.at(-1).userId, actor.id);
  for (const key of ['id', 'customerId', 'nasId', 'category', 'source', 'kind', 'oltId', 'messages']) assert.deepEqual(updated[key], ticket[key], key);
  assert.equal(service.update(data, { description: 'Edited' }, actor, updated).resolvedAt, updated.resolvedAt);
  assert.equal(service.update(data, { status: 'working' }, actor, updated).resolvedAt, '');
  assert.deepEqual(data, before);
  for (const payload of [{ title: '' }, { title: 'x'.repeat(161) }, { description: 'x'.repeat(1501) }, { status: 'paid' }, { assignedTo: 'finance' }, { assignedTo: 'inactive' }, { assignedTo: 'missing' }, { assignedTo: 'x'.repeat(101) }]) assert.throws(() => service.update(data, payload, actor, ticket));
  data.users.push({ id: 'outside', role: 'technician', active: true, lockedNasIds: ['nas-b'] });
  assert.throws(() => service.update(data, { assignedTo: 'outside' }, actor, ticket));
});

test('OLT recovery never automatically resolves a customer service ticket', async () => {
  const data = fixture(), ticket = await opened(data);
  data.oltDevices = [{ id: 'olt-a', enabled: true, updatedAt: 'r1', links: { HWTCAABB0001: { customerId: customer.id } } }];
  const before = structuredClone(ticket);
  for (const condition of ['los', 'online']) {
    const observation = { deviceId: 'olt-a', deviceUpdatedAt: 'r1', snapshot: { status: 'online', checkedAt: new Date(NOW + (condition === 'online' ? 1000 : 0)).toISOString(), onus: [{ serialNumber: 'HWTCAABB0001', ponKey: '0/0/1', status: condition === 'los' ? 'offline' : 'online', condition, causeKnown: true, downCause: condition === 'los' ? 'LOS' : '' }] } };
    olt.applyLosTicketPlan(data, olt.losTicketPlan(data, [observation], { now: NOW + 1000 }), NOW + 1000);
  }
  assert.deepEqual(data.oltTickets.find(row => row.id === ticket.id), before);
  assert(data.oltTickets.some(row => row.source === 'olt-los' && row.status === 'resolved'));
});

test('private photos transcode JPG, PNG and WebP, strip metadata and use restrictive filesystem modes', async t => {
  const root = await photoDirectory(t);
  for (const format of ['jpeg', 'png', 'webp']) {
    const photo = await service.savePhoto(await imageData(format, 1800, 1000), root);
    assert.match(photo.id, /^[a-f0-9-]{36}$/);
    assert(photo.size > 0 && photo.size <= 256000);
    assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
    const file = path.join(root, photo.id + '.webp'), stat = await fs.stat(file), metadata = await sharp(file).metadata();
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(stat.size, photo.size);
    assert.equal(metadata.format, 'webp');
    assert(metadata.width <= 1200 && metadata.height <= 1200);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.orientation, undefined);
  }
});

test('private photos reject wrong types, untrusted MIME, corrupt bytes, oversized payloads and pixel bombs without writes', async t => {
  const root = await photoDirectory(t);
  const hugePixels = await imageData('png', 4000, 3001);
  for (const value of [null, {}, '', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/gif;base64,R0lGODlh', 'data:image/png;base64,AAAA', 'data:image/png;base64,@@@', 'https://evil.test/photo.png', 'data:image/png;base64,' + Buffer.alloc(800001).toString('base64'), 'x'.repeat(1200001), hugePixels]) await assert.rejects(service.savePhoto(value, root), status(400));
  await assert.rejects(fs.stat(root), { code: 'ENOENT' });
});

test('photo append is atomic on decode errors, preserves text with photos and enforces the fifth-photo boundary', async t => {
  const root = await photoDirectory(t), data = fixture(), ticket = await opened(data), before = structuredClone(ticket);
  await assert.rejects(service.appendMessage(data, ticket, post({ text: 'Photo', photo: 'data:image/png;base64,AAAA' }), customer, { customer: true, now: NOW + 10000, photoRoot: root }), status(400));
  assert.deepEqual(ticket, before);
  const photo = await imageData();
  for (let i = 1; i <= 5; i++) await service.appendMessage(data, ticket, post({ text: 'Photo ' + i, photo }), customer, { customer: true, now: NOW + i * 10000, photoRoot: root });
  assert.equal((await fs.readdir(root)).length, 5);
  const full = structuredClone(ticket);
  await assert.rejects(service.appendMessage(data, ticket, post({ text: 'Photo 6', photo }), customer, { customer: true, now: NOW + 60000, photoRoot: root }), /5 foto/);
  assert.deepEqual(ticket, full);
  assert.equal((await fs.readdir(root)).length, 5);
});

test('photo cleanup removes only old unreferenced UUID files, respects the batch cap and never follows symlinks', async t => {
  const root = await photoDirectory(t);
  await fs.mkdir(root, { mode: 0o700 });
  const old = new Date(NOW - 8 * 86400000), fresh = new Date(NOW), referenced = crypto.randomUUID();
  async function file(name, date = old) { const target = path.join(root, name); await fs.writeFile(target, 'test', { mode: 0o600 }); await fs.utimes(target, date, date); return target; }
  const keep = [referenced + '.webp', crypto.randomUUID() + '.webp', 'notes.txt', 'not-a-uuid.webp'];
  for (const name of keep) await file(name, name === keep[1] ? fresh : old);
  for (let i = 0; i < 101; i++) await file(crypto.randomUUID() + '.webp');
  const external = await file('outside.txt'), link = crypto.randomUUID() + '.webp';
  await fs.symlink(external, path.join(root, link));
  await fs.mkdir(path.join(root, crypto.randomUUID() + '.webp'));
  const data = { oltTickets: [{ messages: [{ photos: [{ id: referenced }] }] }] };
  assert.equal(await service.cleanupPhotos(data, root, NOW), 100);
  assert.equal(await service.cleanupPhotos(data, root, NOW), 1);
  for (const name of [...keep, link, 'outside.txt']) await fs.lstat(path.join(root, name));
  assert.equal(await service.cleanupPhotos(data, path.join(root, 'missing'), NOW), 0);
});
