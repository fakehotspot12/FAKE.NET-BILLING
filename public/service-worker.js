'use strict';

const PAYMENT_URL = '/#paymentGateway';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }
  const id = String(payload.id || payload.reference || Date.now());
  const tag = `fakenet-payment-${id}`;
  event.waitUntil((async () => {
    await self.registration.showNotification(payload.title || 'Pembayaran Online Masuk', {
      body: payload.body || 'Pembayaran online berhasil diterima.',
      icon: '/fakenet-logo.png',
      badge: '/fakenet-logo.png',
      tag,
      renotify: true,
      requireInteraction: true,
      data: {
        id,
        url: payload.url || PAYMENT_URL
      }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || PAYMENT_URL, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(targetUrl);
      return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
