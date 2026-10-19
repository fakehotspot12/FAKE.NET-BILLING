'use strict';

const PAYMENT_URL = '/#paymentGateway';
const AUTH_DB = 'fakenet-payment-auth';

async function pushAuth(value) {
  return new Promise((resolve) => {
    const request = indexedDB.open(AUTH_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      const write = value !== undefined;
      const transaction = db.transaction('state', write ? 'readwrite' : 'readonly');
      const item = write ? transaction.objectStore('state').put(value, 'auth') : transaction.objectStore('state').get('auth');
      let result = null;
      item.onsuccess = () => { result = write ? value : item.result; };
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = transaction.onabort = () => { db.close(); resolve(null); };
    };
  });
}

async function closePaymentNotifications() {
  const existing = await self.registration.getNotifications();
  existing.filter(item => String(item.tag || '').startsWith('fakenet-payment-')).forEach(item => item.close());
}

async function verifiedPaymentEvent(signal = {}) {
  const local = await pushAuth();
  if (!local?.enabled || !signal.sessionKey || signal.sessionKey !== local.sessionKey) return null;
  try {
    const query = new URLSearchParams({ eventId: String(signal.id || ''), sessionKey: signal.sessionKey });
    const response = await fetch(`/api/notifications/web-push?${query}`, {
      credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const current = await pushAuth();
    if (!current?.enabled || current.sessionKey !== signal.sessionKey || payload.sessionKey !== signal.sessionKey) return null;
    return payload.event || null;
  } catch {
    return null;
  }
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await closePaymentNotifications();
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  const message = event.data || {};
  if (!['FAKENET_PUSH_LOGIN', 'FAKENET_PUSH_LOGOUT'].includes(message.type)) return;
  event.waitUntil((async () => {
    const enabled = message.type === 'FAKENET_PUSH_LOGIN' && /^[a-f0-9]{64}$/.test(message.sessionKey || '');
    const result = await pushAuth({ enabled, sessionKey: enabled ? message.sessionKey : '' });
    if (!enabled) await closePaymentNotifications();
    event.ports?.[0]?.postMessage({ ok: Boolean(result) });
  })());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }
  const id = String(payload.id || '');
  const tag = `fakenet-payment-${id}`;
  event.waitUntil((async () => {
    if (payload.type !== 'payment-signal' || !id || !payload.sessionKey) return;
    const payment = await verifiedPaymentEvent(payload);
    if (!payment) {
      const current = await pushAuth();
      if (!current?.enabled || current.sessionKey === payload.sessionKey) await closePaymentNotifications();
      return;
    }
    const existing = await self.registration.getNotifications({ tag });
    if (existing.length) return;
    const icon = payment.icon || payment.badge || '/fakenet-logo.png';
    await self.registration.showNotification(payment.title || 'Pembayaran Online Masuk', {
      body: payment.body || 'Pembayaran online berhasil diterima.',
      icon,
      badge: payment.badge || icon,
      tag,
      renotify: false,
      requireInteraction: true,
      data: {
        id,
        sessionKey: payload.sessionKey,
        url: PAYMENT_URL
      }
    });
    const current = await pushAuth();
    if (!current?.enabled || current.sessionKey !== payload.sessionKey) await closePaymentNotifications();
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(PAYMENT_URL, self.location.origin).href;
  event.waitUntil((async () => {
    const local = await pushAuth();
    const expected = event.notification.data?.sessionKey || '';
    if (expected && (!local?.enabled || local.sessionKey !== expected)) return;
    try {
      const response = await fetch('/api/notifications/web-push', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const config = await response.json();
      if (expected && config.sessionKey !== expected) return;
    } catch { return; }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(targetUrl);
      return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
