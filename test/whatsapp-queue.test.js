'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { messageJobId, messagePriority, redisConnectionOptions } = require('../src/whatsapp-queue');
const { createDefaultStore } = require('../src/store');
const { __test: serverInternals } = require('../src/server');

test('new installations keep Whatsapp gateway disabled until owner enables it', () => {
  const data = createDefaultStore();
  assert.equal(data.settings.waGateway.enabled, false);
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

test('WifiKu OTP has the highest Whatsapp queue priority', () => {
  assert.equal(messagePriority('wifiku-otp'), 1);
  assert.ok(messagePriority('wifiku-otp') < messagePriority('paymentPaid'));
  assert.ok(messagePriority('paymentPaid') < messagePriority('broadcast'));
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
  assert.equal(first.bulkProfile, 'bulk');
  assert.equal(second.throttleVersion, 2);
  assert.ok(new Date(second.scheduledAt).getTime() - new Date(first.scheduledAt).getTime() >= 23000);
});

test('transactional Whatsapp messages stay fast even when batch flag is sent', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  const message = serverInternals.queueWaGatewayMessage(data, {
    type: 'paymentPaid',
    phone: '081234567893',
    invoiceId: 'inv-paid-batch',
    invoiceNo: '000777',
    text: 'Pembayaran diterima',
    bulk: true
  });

  assert.equal(message.deliveryMode, 'transactional');
  assert.equal(message.bulkProfile, 'transactional');
  assert.equal(message.throttleDelaySeconds, 6);
});

test('WifiKu OTP stays transactional and retains its delivery expiry', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  const expiresAt = '2026-08-23T12:05:00.000Z';
  const message = serverInternals.queueWaGatewayMessage(data, {
    type: 'wifiku-otp',
    phone: '081234567894',
    text: 'Kode OTP WifiKu',
    expiresAt,
    bulk: true
  });

  assert.equal(message.deliveryMode, 'transactional');
  assert.equal(message.expiresAt, expiresAt);
});

test('new WifiKu OTP supersedes an older queued code for the same phone', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  const first = serverInternals.queueWaGatewayMessage(data, {
    type: 'wifiku-otp',
    phone: '081234567895',
    text: 'Kode lama'
  });

  assert.equal(serverInternals.supersedeQueuedWifiKuOtp(data, '6281234567895'), 1);
  assert.equal(first.status, 'failed');
  assert.equal(first.text.includes('Kode lama'), false);
  assert.equal(first.queueRevision, 1);
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

test('WAJS/WebJS provider response ID and ACK string statuses are normalized', () => {
  const data = createDefaultStore();
  data.settings.waGateway.sender = 'default';
  const providerMessageId = serverInternals.wahaProviderMessageId({
    message: {
      id: {
        remoteJid: '6281234567890@c.us',
        fromMe: true,
        id: 'WEBJSAABBCCDDEEFF001122334455'
      }
    }
  });
  data.waMessages.push({
    id: 'wa-webjs-ack',
    providerMessageId,
    status: 'sent',
    sentAt: '2026-07-19T00:00:00.000Z'
  });

  const result = serverInternals.applyWahaAckEvent(data, {
    event: 'message_ack',
    session: 'default',
    payload: {
      message: { id: { _serialized: providerMessageId } },
      ack: 'DELIVERED'
    }
  });

  assert.equal(providerMessageId.includes('WEBJSAABBCCDDEEFF001122334455'), true);
  assert.equal(result.matched, true);
  assert.equal(data.waMessages[0].status, 'delivered');
  assert.ok(data.waMessages[0].deliveredAt);
});

test('temporary Whatsapp Gateway session errors are treated as retryable', () => {
  assert.equal(serverInternals.isTransientWaGatewayError({
    status: 422,
    message: 'Session status is not as expected. Try again later or restart the session'
  }), true);
  assert.equal(serverInternals.isTransientWaGatewayError({
    message: 'fetch failed'
  }), true);
  assert.equal(serverInternals.isTransientWaGatewayError({
    status: 400,
    message: 'Nomor WhatsApp kosong'
  }), false);
  assert.equal(serverInternals.isTransientWaGatewayError({
    status: 500,
    message: 'No LID for user'
  }), false);
  assert.equal(serverInternals.waGatewayDeliveryMaxAttempts({ type: 'wifiku-otp' }), 3);
  assert.ok(serverInternals.waGatewayDeliveryMaxAttempts({ type: 'paymentReminder' }) > 3);
});

test('WAJS/WebJS connection states are recognized as online or QR-required', () => {
  assert.equal(serverInternals.wahaIsConnected({ engine: { state: 'CONNECTED' } }), true);
  assert.equal(serverInternals.wahaIsConnected({ status: 'OPEN' }), true);
  assert.equal(serverInternals.wahaNeedsQr({ status: 'SCAN_QR_CODE' }), true);
  assert.equal(serverInternals.wahaNeedsQr({ status: 'UNPAIRED' }), true);
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

test('enabling Whatsapp recovers only relevant invoice drafts automatically', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  data.invoices.push(
    { id: 'inv-draft-pending', status: 'pending', amount: 100000, dueDate: '2099-07-20' },
    { id: 'inv-draft-paid', status: 'paid', amount: 100000, paidAt: '2026-07-19' }
  );
  data.waMessages.push(
    {
      id: 'wa-draft-relevant', status: 'draft', type: 'paymentReminder', invoiceId: 'inv-draft-pending',
      phone: '081234567890', text: 'Tagihan belum dibayar', queueRevision: 0
    },
    {
      id: 'wa-draft-obsolete', status: 'draft', type: 'paymentReminder', invoiceId: 'inv-draft-paid',
      phone: '081234567891', text: 'Tagihan belum dibayar', queueRevision: 0
    }
  );

  const recovered = serverInternals.recoverRelevantWaGatewayDrafts(data);

  assert.deepEqual(recovered.map((message) => message.id), ['wa-draft-relevant']);
  assert.equal(data.waMessages[0].status, 'queued');
  assert.equal(data.waMessages[0].deliveryMode, 'transactional');
  assert.equal(data.waMessages[0].queueRevision, 1);
  assert.equal(data.waMessages[1].status, 'draft');
});

test('enabling Whatsapp recovers voucher delivery drafts automatically', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  data.waMessages.push({
    id: 'wa-voucher-draft',
    status: 'draft',
    type: 'voucherIssued',
    phone: '081234567899',
    text: 'Voucher berhasil',
    queueRevision: 0
  });

  const recovered = serverInternals.recoverRelevantWaGatewayDrafts(data);

  assert.deepEqual(recovered.map((message) => message.id), ['wa-voucher-draft']);
  assert.equal(data.waMessages[0].status, 'queued');
  assert.equal(data.waMessages[0].deliveryMode, 'transactional');
  assert.equal(data.waMessages[0].queueRevision, 1);
});

test('paid online voucher notifications retain transactional priority', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  const message = serverInternals.queueWaGatewayMessage(data, {
    type: 'hotspotVoucherPaid', phone: '081234567899', text: 'Voucher online dibayar', bulk: true
  });
  assert.equal(messagePriority(message.type), messagePriority('voucherIssued'));
  assert.equal(message.deliveryMode, 'transactional');
  assert.equal(message.throttleDelaySeconds, 6);
});

test('enabling Whatsapp recovers paid online voucher drafts without an invoice', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  data.waMessages.push({
    id: 'wa-online-voucher-draft', status: 'draft', type: 'hotspotVoucherPaid',
    phone: '081234567899', text: 'Voucher online berhasil', queueRevision: 0
  });
  const recovered = serverInternals.recoverRelevantWaGatewayDrafts(data);
  assert.deepEqual(recovered.map(message => message.id), ['wa-online-voucher-draft']);
  assert.equal(recovered[0].deliveryMode, 'transactional');
});

test('voucher draft recovery does not confuse different customers or voucher codes', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  data.waMessages.push(
    { id: 'voucher-already-sent', status: 'delivered', type: 'voucherIssued', phone: '081234567891', text: 'Kode voucher AAA' },
    { id: 'voucher-other-customer', status: 'draft', type: 'voucherIssued', phone: '081234567892', text: 'Kode voucher BBB' },
    { id: 'voucher-other-code', status: 'draft', type: 'voucherIssued', phone: '081234567891', text: 'Kode voucher CCC' },
    { id: 'voucher-duplicate', status: 'draft', type: 'voucherIssued', phone: '6281234567891', text: 'Kode voucher AAA' }
  );
  const recovered = serverInternals.recoverRelevantWaGatewayDrafts(data);
  assert.deepEqual(recovered.map(message => message.id), ['voucher-other-customer', 'voucher-other-code']);
  assert.equal(data.waMessages[3].status, 'draft');
});

test('draft recovery preserves safe billing cycle throttling', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  data.invoices.push({ id: 'inv-cycle-draft', status: 'pending', amount: 100000, dueDate: '2099-10-15' });
  data.waMessages.push({
    id: 'wa-cycle-draft', status: 'draft', type: 'paymentReminder', invoiceId: 'inv-cycle-draft',
    phone: '081234567899', text: 'Reminder cycle', deliveryMode: 'bulk', bulkProfile: 'billingCycle',
    throttleDelaySeconds: 24, throttleVersion: 2
  });
  const recovered = serverInternals.recoverRelevantWaGatewayDrafts(data);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].deliveryMode, 'bulk');
  assert.equal(recovered[0].bulkProfile, 'billingCycle');
  assert.equal(recovered[0].throttleDelaySeconds, 24);
});

test('recovering a billing cycle batch retains stagger and the batch pause', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  for (let index = 0; index < 121; index += 1) {
    const invoiceId = `cycle-recovery-${index}`;
    data.invoices.push({ id: invoiceId, status: 'pending', amount: 100000, dueDate: '2099-10-15' });
    data.waMessages.push({
      id: `wa-cycle-recovery-${index}`, status: 'draft', type: 'paymentReminder', invoiceId,
      phone: `08123456${String(index).padStart(4, '0')}`, text: `Reminder ${index}`,
      deliveryMode: 'bulk', bulkProfile: 'billingCycle'
    });
  }
  const recovered = serverInternals.recoverRelevantWaGatewayDrafts(data);
  assert.equal(recovered.length, 121);
  for (let index = 1; index < recovered.length; index += 1) {
    const delay = new Date(recovered[index].scheduledAt) - new Date(recovered[index - 1].scheduledAt);
    assert.ok(delay >= 24000, `message ${index} lost its spacing`);
    if (index === 120) assert.ok(delay >= 624000, 'batch pause was lost');
  }
});

test('broadcast batch is staggered while new paid notifications remain immediate', () => {
  const data = createDefaultStore();
  data.settings.waGateway.enabled = true;
  const batch = [];
  for (let index = 0; index < 101; index += 1) {
    batch.push(serverInternals.queueWaGatewayMessage(data, {
      type: 'broadcast', phone: `08123456${String(index).padStart(4, '0')}`, text: 'Broadcast audit'
    }));
  }
  for (let index = 1; index < batch.length; index += 1) {
    const delay = new Date(batch[index].scheduledAt) - new Date(batch[index - 1].scheduledAt);
    assert.ok(delay >= 30000);
    if (index === 100) assert.ok(delay >= 750000);
  }
  const before = Date.now();
  const payment = serverInternals.queueWaGatewayMessage(data, {
    type: 'paymentPaid', phone: '081234567899', invoiceId: 'paid-during-broadcast', text: 'Sudah dibayar'
  });
  assert.ok(new Date(payment.scheduledAt).getTime() - before < 1000);
  assert.ok(messagePriority(payment.type) < messagePriority('broadcast'));
});
