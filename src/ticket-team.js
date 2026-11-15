'use strict';

const crypto = require('node:crypto');
const auth = require('./auth');
const MAX_COMPANIONS = 32;

function companionIds(ticket) {
  return [...new Set((Array.isArray(ticket?.companionIds) ? ticket.companionIds : [])
    .filter(id => typeof id === 'string' && id && id.length <= 100 && id !== ticket.assignedTo))].slice(0, MAX_COMPANIONS);
}
function memberIds(ticket) { return ticket?.assignedTo ? [ticket.assignedTo, ...companionIds(ticket)] : []; }
function writer(actor) { return actor?.active !== false && auth.hasPermission(auth.publicUser(actor), 'olt:tickets:write'); }
function coordinator(actor) { return writer(actor) && actor.role !== 'technician'; }
function canClose(actor,ticket) { return writer(actor) && (['admin','secretary'].includes(actor.role) || actor.role==='technician'&&require('./ticket-recovery').grouped(ticket)&&memberIds(ticket).includes(actor.id)); }
function requireStatusChange(ticket,payload,actor) {
  const closing=payload.status==='resolved'||payload.stage==='resolved',reopening=ticket?.status==='resolved'&&payload.status&&payload.status!=='resolved';
  if (closing&&!canClose(actor,ticket)||reopening&&(!writer(actor)||!['admin','secretary'].includes(actor.role))) throw error('Penutupan tiket memerlukan Admin/Sekretaris; teknisi hanya untuk ODP/ODC yang ditugaskan setelah target pemulihan terpenuhi',403);
}
function canHandle(ticket, actor) { return writer(actor) && Boolean(ticket?.assignedTo) && (coordinator(actor) || memberIds(ticket).includes(actor.id)); }
function canManage(ticket, actor) { return writer(actor) && Boolean(ticket?.assignedTo) && ticket.status !== 'resolved' && (coordinator(actor) || ticket.assignedTo === actor.id); }
function publicTeam(data, ticket) {
  const users = new Map((data.users || []).map(user => [user.id, user]));
  return memberIds(ticket).map(id => {
    const user = users.get(id);
    return { id, name: user?.name || user?.username || 'User tidak tersedia', lead: id === ticket.assignedTo, active: Boolean(user && writer(user)) };
  });
}
function candidates(data, ticket, visible) {
  return (data.users || []).filter(user => user.id !== ticket.assignedTo && writer(user) && visible(data, user, ticket))
    .map(user => ({ id: user.id, name: user.name || user.username || user.id })).sort((a,b) => a.name.localeCompare(b.name, 'id'));
}
function error(message, status = 409) { return Object.assign(new Error(message), { status }); }
function update(data, ticket, payload, actor, visible, now = Date.now()) {
  const current = (data.users || []).find(user => user.id === actor.id);
  if (!current || !canManage(ticket, current) || !visible(data, current, ticket)) throw error('Hanya penanggung jawab atau koordinator yang dapat mengatur pendamping', 403);
  if (typeof payload.revision !== 'string' || payload.revision !== ticket.updatedAt) throw error('Tiket berubah. Buka ulang tim sebelum menyimpan.');
  if (!Array.isArray(payload.companionIds) || payload.companionIds.length > MAX_COMPANIONS || payload.companionIds.some(id => typeof id !== 'string' || !id || id.length > 100)) throw error('Pilihan teknisi pendamping tidak valid', 400);
  const ids = [...new Set(payload.companionIds)], allowed = new Set(candidates(data, ticket, visible).map(user => user.id));
  if (ids.some(id => !allowed.has(id))) throw error('Pendamping harus user aktif berwenang dan berada dalam cakupan tiket', 400);
  if (JSON.stringify([...ids].sort()) === JSON.stringify(companionIds(ticket).sort())) return ticket;
  const at = new Date(Math.max(now, (Date.parse(ticket.updatedAt) || 0) + 1)).toISOString();
  const names = new Map((data.users || []).map(user => [user.id, user.name || user.username || user.id]));
  return { ...ticket, companionIds: ids, updatedAt: at, updatedBy: current.id,
    history: [...(ticket.history || []), { id: crypto.randomUUID(), at, userId: current.id, userName: current.name || current.username,
      kind: 'team', status: ticket.status, note: ids.length ? 'Pendamping: ' + ids.map(id => names.get(id)).join(', ') : 'Penanganan tanpa pendamping', companionIds: ids }].slice(-50) };
}

module.exports = { MAX_COMPANIONS, companionIds, memberIds, canHandle, canManage, canClose, requireStatusChange, publicTeam, candidates, update };
