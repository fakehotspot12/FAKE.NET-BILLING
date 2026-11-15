'use strict';

function number(ticket) {
  return String(ticket?.number || '').replace(/^OLT-/, 'TKT-');
}
function apiPath(pathname) {
  if (!/^\/api\/tickets(?:\/|$)/.test(pathname)) return pathname;
  const suffix = pathname.slice('/api/tickets'.length);
  const aliases = { '/options': 'service-options', '/settings': 'ticket-settings', '/templates': 'ticket-templates' };
  return '/api/monitoring/olt/' + (aliases[suffix] || 'tickets' + suffix);
}

module.exports = { number, apiPath };
