'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const assert = require('node:assert/strict');
const exec = promisify(execFile);

async function checkRuntime(root, dependencies = {}) {
  const env = dependencies.env || process.env;
  const get = dependencies.fetch || fetch;
  const command = dependencies.exec || exec;
  const checks = [];
  async function check(name, action) {
    try { await action(); checks.push({ name, ok: true }); }
    catch { checks.push({ name, ok: false }); }
  }
  async function json(url) {
    const response = await get(url, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    return response.json();
  }
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  await check('Billing dan versi runtime', async () => {
    assert.equal((await json('http://127.0.0.1:' + (env.PORT || 8891) + '/api/health')).ok, true);
    const branding = await json('http://127.0.0.1:' + (env.PORT || 8891) + '/api/branding');
    assert.equal(branding.branding.appVersion, version);
  });
  for (const [name, port, page] of [['Isolir', env.ISOLIR_PORT || 8892, '/isolir'], ['Voucher', env.VOUCHER_PORT || 8893, '/voucher'], ['WifiKu', env.WIFIKU_PORT || 8894, '/wifiku']]) {
    await check(name, async () => assert.equal((await get('http://127.0.0.1:' + port + page, { signal: AbortSignal.timeout(5000) })).status, 200));
  }
  const isolated = env.MIGRATION_MODE === '1';
  const databases = [];
  if (!isolated || env.DATABASE_URL || env.POSTGRES_URL) databases.push(['PostgreSQL Billing', env.DATABASE_URL || env.POSTGRES_URL, env.POSTGRES_STORE_TABLE || 'app_store']);
  else await check('Data JSON lingkungan uji', async () => assert(JSON.parse(fs.readFileSync(path.join(root, 'data/store.json'), 'utf8')).settings));
  if (!isolated) databases.push(['PostgreSQL RADIUS', env.FREERADIUS_DATABASE_URL || env.FREERADIUS_DB_URL, 'radacct']);
  for (const [name, url, table] of databases) {
    await check(name, async () => {
      assert(url, 'Koneksi database wajib tersedia');
      const Client = dependencies.PgClient || require(require.resolve('pg', { paths: [root] })).Client;
      const client = new Client({ connectionString: url, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
      try {
        await client.connect();
        const result = await client.query('SELECT to_regclass($1) AS name', ['public.' + table]);
        assert(result.rows[0].name, 'Tabel wajib belum tersedia');
      } finally { await client.end(); }
    });
  }
  await check('Redis dan dependency antrean WA', async () => {
    assert(env.REDIS_URL);
    const Redis = dependencies.Redis || require(require.resolve('ioredis', { paths: [root] }));
    const redis = new Redis(env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000, commandTimeout: 3000, maxRetriesPerRequest: 0, retryStrategy: () => null });
    redis.on('error', () => {});
    try { await redis.connect(); assert.equal(await redis.ping(), 'PONG'); }
    finally { redis.disconnect(); }
    require(require.resolve('bullmq', { paths: [root] }));
  });
  if (!isolated) await check('FreeRADIUS aktif dan konfigurasi valid', async () => {
    await command('systemctl', ['is-active', '--quiet', 'freeradius.service'], { timeout: 5000 });
    await command('freeradius', ['-XC'], { timeout: 15000, maxBuffer: 1024 * 1024 });
  });
  if (env.GENIEACS_SOURCE !== 'disabled' && env.GENIEACS_ENABLED === '1') {
    await check('GenieACS NBI dan seluruh Virtual Parameters', async () => {
      const port = env.GENIEACS_NBI_PORT || 7557;
      const rows = await json('http://127.0.0.1:' + port + '/virtualParameters');
      assert(Array.isArray(rows));
      const scripts = new Map(rows.map(row => [row._id, row.script]));
      for (const file of fs.readdirSync(path.join(root, 'deploy/genieacs/virtual-parameters')).filter(name => name.endsWith('.js'))) {
        assert.equal(scripts.get(file.slice(0, -3)), fs.readFileSync(path.join(root, 'deploy/genieacs/virtual-parameters', file), 'utf8'));
      }
      const { stdout } = await command('ss', ['-H', '-lnt'], { timeout: 5000 });
      const addresses = stdout.split('\n').map(line => line.trim().split(/\s+/)[3]).filter(value => value?.endsWith(':' + port));
      assert(addresses.length && addresses.every(value => /^(127\.0\.0\.1|\[?::1\]?):/.test(value)), 'NBI harus localhost');
    });
    if (env.FAKENET_BUNDLED_GENIEACS === '1') {
      await check('GenieACS UI dan MongoDB lokal', async () => {
        assert.equal(await (await get('http://127.0.0.1:' + (env.GENIEACS_UI_PORT || 7568) + '/status', { signal: AbortSignal.timeout(5000) })).text(), 'OK');
        const { stdout } = await command('ss', ['-H', '-lnt'], { timeout: 5000 });
        for (const port of [env.GENIEACS_CWMP_PORT || 7547, env.GENIEACS_FS_PORT || 7567, 27017]) assert(stdout.split('\n').some(line => line.trim().split(/\s+/)[3]?.endsWith(':' + port)));
        const mongo = stdout.split('\n').map(line => line.trim().split(/\s+/)[3]).filter(value => value?.endsWith(':27017'));
        assert(mongo.every(value => /^(127\.0\.0\.1|\[?::1\]?):/.test(value)));
      });
    }
  }
  return { ok: checks.every(row => row.ok), checks };
}

if (require.main === module) checkRuntime(path.resolve(process.argv[2] || '.')).then(result => {
  for (const item of result.checks) console.log((item.ok ? '[OK] ' : '[GAGAL] ') + item.name);
  if (!result.ok) process.exitCode = 1;
}).catch(() => { console.error('ERROR: pemeriksaan runtime gagal, periksa log service lokal.'); process.exitCode = 1; });
module.exports = { checkRuntime };
