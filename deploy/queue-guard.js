'use strict';
const fs = require('node:fs');
const path = require('node:path');

async function guard(action, root, file, options = {}) {
  if (!process.env.REDIS_URL && !options.Queue) return;
  const Queue = options.Queue || require(require.resolve('bullmq', { paths: [root] })).Queue;
  const { redisConnectionOptions } = require(path.join(root, 'src/whatsapp-queue'));
  const connection = { ...redisConnectionOptions(options.redisUrl), connectTimeout: 5000, retryStrategy: () => null };
  const queue = new Queue(process.env.WA_BULLMQ_QUEUE_NAME || 'whatsapp-delivery', { connection, prefix: process.env.WA_BULLMQ_PREFIX || 'fakenet-billing:bullmq' });
  queue.on('error', () => {});
  try {
    await queue.waitUntilReady();
    if (action === 'pause') {
      const wasPaused = await queue.isPaused();
      fs.writeFileSync(file, JSON.stringify({ wasPaused }), { mode: 0o600 });
      if (!wasPaused) await queue.pause();
      for (let attempt = 0; attempt < 90; attempt++) {
        if (await queue.getActiveCount() === 0) return;
        await (options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))))(1000);
      }
      throw Error('Pesan WA masih diproses; update ditunda agar pengiriman tidak terputus');
    } else if (action === 'resume') {
      if (!JSON.parse(fs.readFileSync(file, 'utf8')).wasPaused) await queue.resume();
    } else throw Error('Aksi antrean tidak valid');
  } finally { await queue.close(); }
}
if (require.main === module) guard(...process.argv.slice(2)).catch(() => {
  console.error('ERROR: antrean WA belum aman untuk pergantian runtime. Periksa koneksi Redis/pekerjaan aktif.'); process.exitCode = 1;
});
module.exports = { guard };
