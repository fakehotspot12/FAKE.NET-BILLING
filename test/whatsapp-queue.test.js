'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { messageJobId, redisConnectionOptions } = require('../src/whatsapp-queue');
const { createDefaultStore } = require('../src/store');
const { __test: serverInternals } = require('../src/server');

test('new installations enable the local Whatsapp gateway for 24-hour delivery', () => {
  const data = createDefaultStore();
  assert.equal(data.settings.waGateway.enabled, true);
  assert.equal(data.settings.waGateway.provider, 'waha');
  assert.equal(data.settings.waGateway.sender, 'default');
  assert.equal(data.settings.waGateway.quietStart, '00:00');
  assert.equal(data.settings.waGateway.quietEnd, '23:59');
});

test('BullMQ Whatsapp job ID is deterministic per message revision', () => {
  const first = messageJobId('wa-message-1', 0);
  const duplicate = messageJobId('wa-message-1', 0);
  const retry = messageJobId('wa-message-1', 1);

  assert.equal(first, duplicate);
  assert.notEqual(first, retry);
  assert.match(first, /^wa-[a-f0-9]{32}-0$/);
});

test('BullMQ connection follows REDIS_URL including database and TLS', () => {
  const plain = redisConnectionOptions('redis://queue-user:queue-pass@127.0.0.1:6380/4');
  assert.equal(plain.host, '127.0.0.1');
  assert.equal(plain.port, 6380);
  assert.equal(plain.username, 'queue-user');
  assert.equal(plain.password, 'queue-pass');
  assert.equal(plain.db, 4);
  assert.equal(plain.tls, undefined);

  const secure = redisConnectionOptions('rediss://redis.example.test/2');
  assert.deepEqual(secure.tls, {});
  assert.equal(secure.db, 2);
});

test('Whatsapp outbox never drops queued messages above history limit', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  data.settings.waGateway.minDelaySeconds = 15;
  data.settings.waGateway.maxPerBatch = 200;

  for (let index = 0; index < 650; index += 1) {
    serverInternals.queueWaGatewayMessage(data, {
      phone: `08123456${String(index).padStart(4, '0')}`,
      subject: `Reminder ${index}`,
      text: `Pesan ${index}`
    });
  }

  assert.equal(data.waMessages.length, 650);
  assert.equal(data.waMessages.every((message) => message.status === 'queued'), true);
  assert.equal(data.waMessages.every((message) => message.queueRevision === 0), true);
});

test('transactional Whatsapp messages are immediate and pending duplicates are reused', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  data.settings.waGateway.minDelaySeconds = 45;
  const before = Date.now();

  const first = serverInternals.queueWaGatewayMessage(data, {
    type: 'paymentPaid',
    phone: '081234567890',
    invoiceId: 'inv-paid-1',
    invoiceNo: '000001',
    text: 'Pembayaran diterima'
  });
  const duplicate = serverInternals.queueWaGatewayMessage(data, {
    type: 'paymentPaid',
    phone: '081234567890',
    invoiceId: 'inv-paid-1',
    invoiceNo: '000001',
    text: 'Pembayaran diterima'
  });

  assert.equal(first.id, duplicate.id);
  assert.equal(data.waMessages.length, 1);
  assert.equal(first.deliveryMode, 'transactional');
  assert.ok(new Date(first.scheduledAt).getTime() - before < 1000);
});

test('bulk Whatsapp messages retain safe staggered delivery', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  data.settings.waGateway.minDelaySeconds = 45;

  const first = serverInternals.queueWaGatewayMessage(data, {
    type: 'paymentReminder', phone: '081234567891', text: 'Reminder satu', bulk: true
  });
  const second = serverInternals.queueWaGatewayMessage(data, {
    type: 'paymentReminder', phone: '081234567892', text: 'Reminder dua', bulk: true
  });

  assert.equal(first.deliveryMode, 'bulk');
  assert.equal(second.deliveryMode, 'bulk');
  assert.ok(new Date(second.scheduledAt).getTime() - new Date(first.scheduledAt).getTime() >= 44000);
});

test('WAHA provider response ID is normalized and ACK advances to read', () => {
  const data = createDefaultStore();
  data.settings.waGateway.sender = 'default';
  const providerMessageId = serverInternals.wahaProviderMessageId({
    key: {
      remoteJid: '6281234567890@c.us',
      fromMe: true,
      id: 'AABBCCDDEEFF00112233445566778899'
    }
  });
  data.waMessages.push({
    id: 'wa-ack-1',
    providerMessageId,
    status: 'sent',
    sentAt: '2026-07-19T00:00:00.000Z'
  });

  const result = serverInternals.applyWahaAckEvent(data, {
    event: 'message.ack',
    session: 'default',
    payload: {
      id: providerMessageId,
      ack: 3,
      ackName: 'READ'
    }
  });

  assert.equal(result.matched, true);
  assert.equal(data.waMessages[0].status, 'read');
  assert.ok(data.waMessages[0].deliveredAt);
  assert.ok(data.waMessages[0].readAt);
});

test('WAHA webhook signature only accepts the raw body HMAC', () => {
  const raw = JSON.stringify({ event: 'message.ack', payload: { id: 'message-1', ack: 2 } });
  const secret = 'test-webhook-secret';
  const signature = crypto.createHmac('sha512', secret).update(raw).digest('hex');

  assert.equal(serverInternals.verifyWahaWebhookSignature({
    'x-webhook-hmac': signature,
    'x-webhook-hmac-algorithm': 'sha512'
  }, raw, secret), true);
  assert.throws(() => serverInternals.verifyWahaWebhookSignature({
    'x-webhook-hmac': `${signature.slice(0, -1)}0`
  }, raw, secret), /tidak cocok/);
});
