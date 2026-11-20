'use strict';
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

// NBI releases without /config can still provide a read-only Mongo snapshot.
async function snapshotConfig(env = process.env, run = spawnSync) {
  const url = env.GENIEACS_MONGODB_CONNECTION_URL || 'mongodb://127.0.0.1:27017/genieacs';
  const script = 'print(JSON.stringify(db.getCollection("config").find({}).toArray()))';
  let command, prefix = [];
  for (const candidate of ['mongosh', 'mongo']) if (run(candidate, ['--version'], { stdio: 'ignore', timeout: 5000 }).status === 0) { command = candidate; break; }
  if (!command && env.FAKENET_BUNDLED_GENIEACS === '1') { command = 'docker'; prefix = ['exec', 'fakenet-billing-genieacs-mongodb', 'mongosh']; }
  if (!command) {
    const roots = ['/opt/genieacs', '/usr/lib/node_modules/genieacs', '/usr/local/lib/node_modules/genieacs'];
    const binary = run('which', ['genieacs-nbi'], { encoding: 'utf8', timeout: 5000 });
    if (binary.status === 0) roots.unshift(require('node:path').dirname(fs.realpathSync(String(binary.stdout).trim())));
    let MongoClient;
    try { ({ MongoClient } = require(require.resolve('mongodb', { paths: roots }))); }
    catch { throw Error('NBI tidak menyediakan /config dan driver/shell MongoDB tidak tersedia; backup dibatalkan'); }
    const client = new MongoClient(url, { maxPoolSize: 1, serverSelectionTimeoutMS: 5000 });
    try { await client.connect(); return await client.db().collection('config').find({}, { maxTimeMS: 10000 }).toArray(); }
    finally { await client.close(); }
  }
  const result = run(command, [...prefix, '--quiet', url, '--eval', script], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw Error('Snapshot konfigurasi ACS melalui MongoDB gagal');
  const rows = JSON.parse(String(result.stdout || '').trim().split('\n').at(-1));
  if (!Array.isArray(rows)) throw Error('Snapshot konfigurasi ACS tidak valid');
  return rows;
}
if (require.main === module) {
  snapshotConfig().then(rows => fs.writeFileSync(process.argv[2], JSON.stringify(rows), { mode: 0o600 }))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { snapshotConfig };
