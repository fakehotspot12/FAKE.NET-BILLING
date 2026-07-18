'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { messageJobId, redisConnectionOptions } = require('../src/whatsapp-queue');
const { createDefaultStore } = require('../src/store');
const { __test: serverInternals } = require('../src/server');

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
