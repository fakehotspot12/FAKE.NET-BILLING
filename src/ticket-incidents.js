'use strict';

const identity = require('./network-identity');
const automatic = require('./olt-auto-identity');
const FAULT_CATEGORIES = new Set(['internet-down', 'internet-slow', 'wifi-modem', 'addon-fault', 'other-fault']);
const ACTIVE = new Set(['new', 'assigned', 'working']);
const MAX_DEVICES = 8;

function isFault(ticket) {
  if (['wifiku', 'staff-service'].includes(ticket.source) && ticket.scope === 'service') return FAULT_CATEGORIES.has(ticket.category);
  return ticket.scope === 'onu' && Boolean(ticket.oltId && ticket.serialNumber);
}

function owner(data, device, onu, now = Date.now()) {
  if (!device) return { customer: null, conflict: false };
  if (automatic.manualConflict(data, device, onu, now)) return { customer: null, conflict: true };
  const directory = identity.directory(data);
  const matches = [automatic.manualCustomerFor(data, device, onu, now), automatic.customerFor(data, device, onu, now)?.customer,
    directory.customerForSerial(onu.serialNumber, { nasId: device.nasId })].filter(Boolean);
  const customers = new Map(matches.map(customer => [customer.id, customer]));
  if (customers.size > 1) return { customer: null, conflict: true };
  const customer = customers.values().next().value || null;
  return { customer: customer && directory.compatible(directory.userForCustomer(customer) || customer, { nasId: device.nasId }) ? customer : null, conflict: false };
}

function customerForTicket(data, ticket, now = Date.now()) {
  const directory = identity.directory(data), device = (data.oltDevices || []).find(row => row.id === ticket.oltId);
  const known = ticket.customerId && directory.customerById(ticket.customerId);
  const resolved = device && ticket.serialNumber ? owner(data, device, { serialNumber: ticket.serialNumber, ...(ticket.onuIndex ? { id: ticket.onuIndex } : {}) }, now) : null;
  if (resolved?.conflict || known && resolved?.customer && known.id !== resolved.customer.id) return null;
  const customer = known || resolved?.customer;
  return customer && directory.compatible(directory.userForCustomer(customer) || customer, { nasId: device?.nasId || ticket.nasId }) ? customer : null;
}

function activeIndex(data, now = Date.now()) {
  const byCustomer = new Map();
  for (const ticket of data.oltTickets || []) {
    if (!ACTIVE.has(ticket.status) || !isFault(ticket)) continue;
    const customer = customerForTicket(data, ticket, now);
    if (!customer) continue;
    const previous = byCustomer.get(customer.id);
    if (!previous || String(ticket.createdAt || '') < String(previous.createdAt || '')) byCustomer.set(customer.id, ticket);
  }
  return byCustomer;
}

function activeFault(data, customer, now = Date.now()) {
  return customer?.id ? activeIndex(data, now).get(customer.id) || null : null;
}

function captureInitial(data, ticket, now = Date.now()) {
  if (!isFault(ticket) || !ticket.customerId) return ticket;
  const customer = identity.directory(data).customerById(ticket.customerId);
  const current = customer && automatic.currentForCustomer(data, customer, now);
  if (current) ticket.incidentDevices = [{ customerId: customer.id, oltId: current.device.id, nasId: current.device.nasId || '', serialNumber: current.serialNumber,
    onuIndex: current.position.index, pon: current.position.pon, capturedAt: current.checkedAt, observedAt: current.checkedAt, state: 'online' }];
  return ticket;
}

const positionKey = (device, onu) => JSON.stringify([device.id, identity.serial(onu.serialNumber), String(onu.id || ''), onu.ponKey || '']);
function observationGuard(data, now = Date.now()) {
  const byCustomer = activeIndex(data, now), positions = new Map(), updates = new Map();
  const directory = identity.directory(data);
  const tracked=[...byCustomer.entries()];
  // A handled LOS on a removed modem is not a new incident until it comes online.
  for(const ticket of data.oltTickets||[])if(ticket.status==='resolved'&&isFault(ticket)&&ticket.incidentDevices?.some(row=>row.state==='los')){
    const customer=customerForTicket(data,ticket,now);if(customer)tracked.push([customer.id,ticket]);
  }
  for (const [customerId, ticket] of tracked) for (const row of (ticket.incidentDevices || []).slice(0, MAX_DEVICES)) {
    if(ticket.status==='resolved'&&row.state!=='los')continue;
    if (row.customerId !== customerId || !row.oltId || !row.serialNumber || !row.onuIndex || !row.pon || !Number.isFinite(Date.parse(row.capturedAt))) continue;
    const device = (data.oltDevices || []).find(device => device.id === row.oltId);
    if (!device || !directory.compatible({ nasId: row.nasId }, { nasId: device.nasId })) continue;
    const key=positionKey(device,{serialNumber:row.serialNumber,id:row.onuIndex,ponKey:row.pon});if(!positions.has(key))positions.set(key,ticket);
  }
  function cover(device, seen, checkedAt, confirmed) {
    const covered = new Set();
    if (!byCustomer.size&&!positions.size) return covered;
    for (const onu of seen.values()) {
      const key = positionKey(device, onu), current = owner(data, device, onu, now);
      if (current.conflict) continue;
      const saved = positions.get(key), ticket = current.customer ? byCustomer.get(current.customer.id)||(saved&&customerForTicket(data,saved,now)?.id===current.customer.id?saved:null) : saved;
      if (!ticket || current.customer && saved && customerForTicket(data, saved, now)?.id !== current.customer.id) continue;
      // The original ONU workflow retains its existing recovery/closure logic.
      if (ticket.oltId === device.id && identity.serial(ticket.serialNumber) === identity.serial(onu.serialNumber)) continue;
      const customer = current.customer || customerForTicket(data, ticket, now);
      if (!customer || !directory.compatible(directory.userForCustomer(customer) || customer, { nasId: device.nasId })) continue;
      if (onu.status === 'offline') covered.add(onu.serialNumber);
      const los = onu.status === 'offline' && onu.condition === 'los' && onu.causeKnown === true && !onu.plannedReboot && confirmed(onu);
      if (!customer || !onu.id || !onu.ponKey || onu.status !== 'online' && !los) continue;
      let update = updates.get(ticket.id);
      const records = update?.records || (ticket.incidentDevices || []).slice(0, MAX_DEVICES);
      const index = records.findIndex(row => positionKey({ id: row.oltId }, { serialNumber: row.serialNumber, id: row.onuIndex, ponKey: row.pon }) === key);
      const previous = records[index], state = los ? 'los' : 'online';
      if (previous?.state === state) continue;
      if (index < 0 && records.length >= MAX_DEVICES) continue;
      if (!update) { update = { kind: 'incident', id: ticket.id, records: records.slice(), events: [] }; updates.set(ticket.id, update); }
      const record = { customerId: customer.id, oltId: device.id, nasId: device.nasId || '', serialNumber: identity.serial(onu.serialNumber), onuIndex: String(onu.id), pon: onu.ponKey,
        capturedAt: previous?.capturedAt || checkedAt, state, observedAt: checkedAt };
      if (index >= 0) update.records[index] = record;
      else update.records.push(record);
      positions.set(key, ticket);
      if (los) update.events.push('LOS modem ' + record.serialNumber + ' dicatat pada penanganan gangguan yang sedang berjalan; tidak dibuat tiket baru.');
    }
    return covered;
  }
  return { cover, changes: () => [...updates.values()], byCustomer };
}

module.exports = { isFault, activeFault, activeIndex, owner, customerForTicket, captureInitial, observationGuard, MAX_DEVICES };
