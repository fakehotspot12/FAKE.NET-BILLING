'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const { verifyRelease, releaseFiles } = require('../deploy/verify-release');
const { activate, rollback, commit } = require('../deploy/activate-release');
const { checkRuntime } = require('../deploy/runtime-health');
const root = path.join(__dirname, '..');

function fixture(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-installer-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const current = path.join(tmp, 'current'), source = path.join(tmp, 'source'), backup = path.join(tmp, 'backup');
  for (const dir of [current, source]) for (const file of releaseFiles(root)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  for (const [dir, content] of [[current, 'old'], [source, 'new']]) {
    fs.mkdirSync(path.join(dir, 'node_modules')); fs.writeFileSync(path.join(dir, 'node_modules/sentinel'), content);
  }
  fs.mkdirSync(path.join(current, 'data')); fs.writeFileSync(path.join(current, 'data/store.json'), '{"payment":"paid"}');
  fs.writeFileSync(path.join(current, '.env'), 'PRIVATE=keep');
  fs.writeFileSync(path.join(source, 'public/app.js'), '// replacement fixture');
  return { current, source, backup };
}
test('release manifest covers every published source file and both entrypoints share it', async () => {
  const verified = await verifyRelease(root); assert(verified.files > 300);
  for (const file of ['install.sh', 'deploy/bin/fakenet-billing-update']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8'); assert(source.includes('installer-common.sh')); assert(source.includes('verify_release_payload'));
    assert(!source.includes('local required_files=('));
  }
  const git = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  if (git.status === 0) {
    const manifest = new Set(releaseFiles(root));
    for (const file of new Set(git.stdout.trim().split('\n'))) if (file !== 'data/.gitkeep') assert(manifest.has(file), 'Unpublished/missing manifest file: ' + file);
  }
});
test('missing module is rejected before source or dependencies are activated', t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.source, 'src/olt-zte-tr069.js'));
  assert.throws(() => activate(f.current, f.source, f.backup));
  assert.equal(fs.readFileSync(path.join(f.current, 'node_modules/sentinel'), 'utf8'), 'old');
});
test('lockfile version mismatch is rejected before runtime verification', async t => {
  const f = fixture(t), lock = JSON.parse(fs.readFileSync(path.join(f.source, 'package-lock.json'))); lock.version = '0.0.0';
  fs.writeFileSync(path.join(f.source, 'package-lock.json'), JSON.stringify(lock));
  await assert.rejects(verifyRelease(f.source), /lockfile/);
});
test('activation and rollback preserve private config and payments arriving after the backup', t => {
  const f = fixture(t); activate(f.current, f.source, f.backup);
  assert.equal(fs.readFileSync(path.join(f.current, 'node_modules/sentinel'), 'utf8'), 'new');
  fs.writeFileSync(path.join(f.current, 'data/store.json'), '{"payment":"new-payment"}');
  rollback(f.current, f.backup);
  assert.equal(fs.readFileSync(path.join(f.current, 'node_modules/sentinel'), 'utf8'), 'old');
  assert.equal(fs.readFileSync(path.join(f.current, '.env'), 'utf8'), 'PRIVATE=keep');
  assert.equal(fs.readFileSync(path.join(f.current, 'data/store.json'), 'utf8'), '{"payment":"new-payment"}');
  assert.notEqual(fs.readFileSync(path.join(f.current, 'public/app.js'), 'utf8'), '// replacement fixture');
});
test('rollback does not overwrite concurrent source edits', t => {
  const f = fixture(t); activate(f.current, f.source, f.backup);
  fs.writeFileSync(path.join(f.current, 'public/app.js'), '// owner change');
  assert.throws(() => rollback(f.current, f.backup), /rollback ditahan/);
});
test('commit validates every activated file checksum', t => {
  const f = fixture(t); activate(f.current, f.source, f.backup); commit(f.current, f.backup);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.backup, 'activation.json'))).completed, true);
});
test('manifest refuses a symlink leaving the release directory', t => {
  const f = fixture(t), file = path.join(f.source, 'src/olt-zte-tr069.js');
  fs.unlinkSync(file); fs.symlinkSync('/etc/hosts', file); assert.throws(() => releaseFiles(f.source));
});
test('runtime health cannot call a disconnected database or Redis healthy just because /api/health is OK', async () => {
  class PgClient { async connect() { throw Error('fixture database down'); } async end() {} }
  class Redis { on() {} async connect() { throw Error('fixture redis down'); } disconnect() {} }
  const result = await checkRuntime(root, { env: { DATABASE_URL: 'postgres://fixture', FREERADIUS_DATABASE_URL: 'postgres://fixture', REDIS_URL: 'redis://fixture', GENIEACS_SOURCE: 'disabled' },
    PgClient, Redis, exec: async () => ({}), fetch: async url => new Response(JSON.stringify(url.endsWith('/api/branding') ? { branding: { appVersion: require('../package.json').version } } : { ok: true })) });
  assert.equal(result.ok, false); assert(result.checks.find(row => row.name === 'Billing dan versi runtime').ok);
  assert(result.checks.filter(row => !row.ok).some(row => row.name.includes('PostgreSQL')));
  assert(result.checks.some(row => !row.ok && row.name.includes('Redis')));
});
test('installer/update scripts parse and enforce the two supported OS versions', () => {
  for (const file of ['install.sh', 'bootstrap-update.sh', 'deploy/bin/fakenet-billing-update', 'deploy/lib/installer-common.sh']) assert.equal(spawnSync('bash', ['-n', path.join(root, file)]).status, 0, file);
  for (const [id, version, accepted] of [['ubuntu','24.04',true],['debian','12',true],['ubuntu','22.04',false],['debian','11',false],['debian','13',false],['rocky','9',false]]) {
    const result = spawnSync('bash', ['-c', '. "$1"; os_version_supported "$2" "$3"', '_', path.join(root, 'deploy/lib/installer-common.sh'), id, version]);
    assert.equal(result.status === 0, accepted, id + ' ' + version);
  }
});
test('quoted initial ACS credentials survive .env replacement without shell interpolation', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-env-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const file = path.join(tmp, 'private.env'); fs.writeFileSync(file, 'TEST=placeholder\n');
  const source = fs.readFileSync(path.join(root, 'install.sh'), 'utf8').replace(/\nmain "\$@"\s*$/, '');
  const secret = 'fixture $dollar "quote" \\slash `tick` /&!';
  const r = spawnSync('bash', [], { input: source + '\nreplace_or_append_env "$PRIVATE_FILE" TEST "$(quote_env_value "$SECRET_VALUE")"\n. "$PRIVATE_FILE"\nprintf "%s" "$TEST"\n',
    env: { ...process.env, SOURCE_DIR: root, PRIVATE_FILE: file, SECRET_VALUE: secret }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, secret);
});
test('WA update guard drains active sends and restores the original paused policy', async t => {
  const { guard } = require('../deploy/queue-guard'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-queue-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const paused of [false, true]) {
    let pause = 0, resume = 0, active = 0;
    class Queue { on() {} async waitUntilReady() {} async isPaused() { return paused; } async pause() { pause++; } async resume() { resume++; } async getActiveCount() { return active++ < 2 ? 1 : 0; } async close() {} }
    const file = path.join(tmp, String(paused)), options = { Queue, redisUrl: 'redis://127.0.0.1', sleep: async () => {} };
    await guard('pause', root, file, options); await guard('resume', root, file, options);
    assert.equal(active, 3); assert.equal(pause, paused ? 0 : 1); assert.equal(resume, paused ? 0 : 1);
  }
});
test('new bundled ACS receives billing initial credentials, existing ACS is not reset', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-acs-env-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const billing = path.join(tmp, 'billing.env'), acs = path.join(tmp, 'acs.env');
  fs.writeFileSync(billing, 'APP_ADMIN_USERNAME=admin\nAPP_ADMIN_PASSWORD=fixture-initial-secret\n');
  fs.mkdirSync(path.join(tmp, 'deploy'));
  fs.copyFileSync(path.join(root, 'deploy/fakenet-billing-genieacs.env'), path.join(tmp, 'deploy/fakenet-billing-genieacs.env'));
  const source = fs.readFileSync(path.join(root, 'install.sh'), 'utf8').replace(/\nmain "\$@"\s*$/, '').replaceAll('/etc/fakenet-billing.env', billing);
  const script = source + '\nprepare_genieacs_env_file bundled\n. "$GENIEACS_ENV_FILE"\nprintf "%s/%s/%s" "$GENIEACS_UI_USERNAME" "$GENIEACS_UI_PASSWORD" "$GENIEACS_CWMP_AUTH_PASSWORD"\n';
  const env = { ...process.env, SOURCE_DIR: root, APP_DIR: tmp, GENIEACS_ENV_FILE: acs };
  const first = spawnSync('bash', [], { input: script, env, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr); assert.equal(first.stdout, 'admin/fixture-initial-secret/1sampai10');
  assert.equal(fs.statSync(acs).mode & 0o777, 0o600);
  fs.writeFileSync(billing, 'APP_ADMIN_USERNAME=admin\nAPP_ADMIN_PASSWORD=changed-later\n');
  const second = spawnSync('bash', [], { input: script, env, encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr); assert.equal(second.stdout, first.stdout);
});
test('ACS config backup uses read-only Mongo shell when NBI lacks /config', async () => {
  const { snapshotConfig } = require('../deploy/genieacs/snapshot-config');
  let queried = false;
  const rows = await snapshotConfig({ FAKENET_BUNDLED_GENIEACS: '1' }, (command, args) => {
    if (command !== 'docker') return { status: 1 };
    assert.deepEqual(args.slice(0, 3), ['exec', 'fakenet-billing-genieacs-mongodb', 'mongosh']);
    const code = args.at(-1); assert(code.includes('.find({}).toArray()')); assert(!code.includes('update') && !code.includes('delete'));
    queried = true; return { status: 0, stdout: '[{"_id":"fixture","value":"kept"}]\n' };
  });
  assert(queried); assert.equal(rows[0].value, 'kept');
});
test('runtime health validates all ACS definitions and rejects public NBI bindings', async () => {
  const scripts = fs.readdirSync(path.join(root, 'deploy/genieacs/virtual-parameters')).filter(name => name.endsWith('.js')).map(name => ({ _id: name.slice(0, -3), script: fs.readFileSync(path.join(root, 'deploy/genieacs/virtual-parameters', name), 'utf8') }));
  class PgClient { async connect() {} async query() { return { rows: [{ name: 'fixture' }] }; } async end() {} }
  class Redis { on() {} async connect() {} async ping() { return 'PONG'; } disconnect() {} }
  for (const binding of ['127.0.0.1', '0.0.0.0']) {
    const result = await checkRuntime(root, { env: { DATABASE_URL: 'postgres://fixture', FREERADIUS_DATABASE_URL: 'postgres://fixture', REDIS_URL: 'redis://fixture', GENIEACS_ENABLED: '1', GENIEACS_SOURCE: 'existing' }, PgClient, Redis,
      exec: async command => ({ stdout: command === 'ss' ? 'LISTEN 0 4096 ' + binding + ':7557 0.0.0.0:*\n' : '' }),
      fetch: async url => new Response(JSON.stringify(url.endsWith('/virtualParameters') ? scripts : url.endsWith('/api/branding') ? { branding: { appVersion: require('../package.json').version } } : { ok: true })) });
    assert.equal(result.ok, binding === '127.0.0.1');
  }
});
test('PostgreSQL setup reads protected SQL through stdin, not a postgres-readable temporary pathname', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-sql-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const file = path.join(tmp, 'private.sql'); fs.writeFileSync(file, 'SELECT 42;\n', { mode: 0o600 });
  const source = fs.readFileSync(path.join(root, 'install.sh'), 'utf8').replace(/\nmain "\$@"\s*$/, '');
  const r = spawnSync('bash', [], { input: source + '\npsql_superuser() { printf "args:%s\\n" "$*"; while IFS= read -r row; do printf "sql:%s\\n" "$row"; done; }; postgres_exec_file "$SQL_FIXTURE" fixture\n',
    env: { ...process.env, SOURCE_DIR: root, SQL_FIXTURE: file }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /sql:SELECT 42;/);
  assert(!r.stdout.includes('-f ') && !r.stdout.includes(file));
});
test('generated SQL files are private, unpredictable and removed after failed initialization', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-sql-')); t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const record = path.join(tmp, 'paths'), source = fs.readFileSync(path.join(root, 'install.sh'), 'utf8').replace(/\nmain "\$@"\s*$/, '');
  const input = source + `
command() { if [ "$1" = -v ] && [ "$2" = psql ]; then return 0; fi; builtin command "$@"; }
load_billing_env() { APP_DATABASE_PASSWORD=fixture-app; RADIUS_DATABASE_PASSWORD=fixture-radius; }
postgres_exec_file() { stat -c '%a' "$1"; printf '%s\\n' "$1" >> "$SQL_RECORD"; return 43; }
init_postgres_databases
`;
  const r = spawnSync('bash', [], { input, env: { ...process.env, SOURCE_DIR: root, APP_DIR: tmp, SQL_RECORD: record }, encoding: 'utf8' });
  assert.equal(r.status, 43, r.stderr); assert.equal(r.stdout.trim(), '600');
  const files = fs.readFileSync(record, 'utf8').trim().split('\n'); assert.equal(files.length, 1);
  assert(files.every(file => !fs.existsSync(file)));
});
test('installer Radius config validation fails closed and stores failure output root-only', t => {
  const source = fs.readFileSync(path.join(root, 'install.sh'), 'utf8').replace(/\nmain "\$@"\s*$/, '');
  const r = spawnSync('bash', [], { input: source + '\nfreeradius() { printf "fixture failed\\n"; return 19; }; validate_freeradius_config\n',
    env: { ...process.env, SOURCE_DIR: root }, encoding: 'utf8' });
  assert.equal(r.status, 19);
  const file = r.stderr.match(/lihat (\/tmp\/fakenet-freeradius-check\.[A-Za-z0-9]+)/)?.[1]; assert(file);
  t.after(() => fs.rmSync(file, { force: true })); assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
