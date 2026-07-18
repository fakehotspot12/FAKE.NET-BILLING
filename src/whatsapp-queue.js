'use strict';

const crypto = require('crypto');
const { Queue, Worker } = require('bullmq');

const DEFAULT_QUEUE_NAME = 'whatsapp-delivery';
const DEFAULT_PREFIX = 'fakenet-billing:bullmq';

function redisConnectionOptions(redisUrl = process.env.REDIS_URL || '') {
  if (!redisUrl) {
    throw new Error('REDIS_URL wajib tersedia untuk antrean Whatsapp Gateway');
  }
  const url = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(url.protocol)) {
    throw new Error('REDIS_URL harus memakai redis:// atau rediss://');
  }
  const database = url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname || '127.0.0.1',
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username || '') || undefined,
    password: decodeURIComponent(url.password || '') || undefined,
    db: Number.isFinite(database) ? database : 0,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  };
}

function messageJobId(messageId = '', revision = 0) {
  const digest = crypto.createHash('sha256').update(String(messageId)).digest('hex').slice(0, 32);
  return `wa-${digest}-${Math.max(0, Number(revision) || 0)}`;
}

class WhatsAppQueue {
  constructor(options = {}) {
    this.queueName = options.queueName || process.env.WA_BULLMQ_QUEUE_NAME || DEFAULT_QUEUE_NAME;
    this.prefix = options.prefix || process.env.WA_BULLMQ_PREFIX || DEFAULT_PREFIX;
    this.connection = redisConnectionOptions(options.redisUrl || process.env.REDIS_URL || '');
    this.queue = null;
    this.worker = null;
    this.logger = options.logger || console;
  }

  async start(processor) {
    if (this.worker) return this;
    this.queue = new Queue(this.queueName, {
      connection: this.connection,
      prefix: this.prefix,
      defaultJobOptions: {
        removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 2000 }
      }
    });
    this.worker = new Worker(this.queueName, processor, {
      connection: this.connection,
      prefix: this.prefix,
      concurrency: 1
    });
    this.worker.on('error', (error) => {
      this.logger.error(`BullMQ Whatsapp worker error: ${error.message || error}`);
    });
    await Promise.all([this.queue.waitUntilReady(), this.worker.waitUntilReady()]);
    return this;
  }

  async enqueue(message = {}, settings = {}) {
    if (!this.queue) throw new Error('BullMQ Whatsapp belum aktif');
    const revision = Math.max(0, Number(message.queueRevision) || 0);
    const jobId = messageJobId(message.id, revision);
    const scheduledAt = new Date(message.scheduledAt || Date.now()).getTime();
    const delay = Math.max(0, Number.isFinite(scheduledAt) ? scheduledAt - Date.now() : 0);
    const attemptsMade = Math.max(0, Number(message.attempts) || 0);
    const attempts = Math.max(1, 3 - Math.min(attemptsMade, 2));
    const backoffDelay = Math.max(15, Number(settings.minDelaySeconds) || 45) * 1000;
    const priorityByType = {
      paymentPaid: 1,
      accountActive: 2,
      paymentReminder: 3,
      paymentCancel: 4,
      invoiceIssued: 5,
      accountSuspend: 6,
      broadcast: 10
    };
    const priority = Math.max(1, Number(message.priority || priorityByType[message.type] || 8) || 8);
    const job = await this.queue.add('send-whatsapp', {
      messageId: message.id,
      revision
    }, {
      jobId,
      delay,
      priority,
      attempts,
      backoff: {
        type: 'fixed',
        delay: backoffDelay
      }
    });
    return {
      jobId: job.id,
      delay,
      attempts
    };
  }

  async counts() {
    if (!this.queue) return null;
    const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused');
    return {
      backend: 'bullmq',
      available: true,
      ...counts
    };
  }

  async close() {
    const tasks = [];
    if (this.worker) tasks.push(this.worker.close(true));
    if (this.queue) tasks.push(this.queue.close());
    await Promise.allSettled(tasks);
    this.worker = null;
    this.queue = null;
  }
}

module.exports = {
  WhatsAppQueue,
  messageJobId,
  redisConnectionOptions
};
