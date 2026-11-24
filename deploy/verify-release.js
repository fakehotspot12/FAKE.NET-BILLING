'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function releaseFiles(root) {
  const base = fs.realpathSync(root);
  const files = fs.readFileSync(path.join(base, 'deploy/release-files.list'), 'utf8').split(/\r?\n/)
    .filter(line => line && !line.startsWith('#'));
  assert(files.length > 200 && new Set(files).size === files.length, 'Manifest rilis tidak lengkap atau memiliki duplikat');
  for (const file of files) {
    assert(/^[A-Za-z0-9_./-]+$/.test(file) && !file.startsWith('/') && !file.split('/').includes('..'), 'Jalur manifest tidak aman');
    assert(!/^(?:data|node_modules|\.git)\//.test(file) && file !== '.env', 'Data privat tidak boleh masuk manifest');
    const target = path.join(base, file);
    assert(fs.lstatSync(target).isFile() && fs.realpathSync(target).startsWith(base + path.sep), 'Berkas rilis hilang atau symlink: ' + file);
  }
  return files;
}

async function verifyRelease(root, options = {}) {
  const files = releaseFiles(root);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, pkg.version, 'Versi lockfile berbeda');
  assert.equal(lock.packages?.['']?.version, pkg.version, 'Versi root lockfile berbeda');
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies, 'Dependency lockfile berbeda');
  assert(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').includes('## [' + pkg.version + '] - ' + pkg.releaseDate), 'Changelog rilis tidak cocok');
  if (options.runtime) {
    for (const name of Object.keys(pkg.dependencies)) require(require.resolve(name, { paths: [root] }));
    const { Terminal } = require(require.resolve('@xterm/headless', { paths: [root] }));
    const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
    terminal.dispose();
    for (const module of ['olt-monitor', 'olt-hsgq', 'onu-model', 'olt-pon', 'olt-cdata-pon', 'olt-terminal-native', 'olt-zte-pnp', 'olt-zte-bandwidth',
      'olt-zte-registration', 'olt-zte-tr069', 'olt-zte-catalogue', 'olt-zte-bridge', 'olt-zte-onu', 'ont-radio-capability', 'whatsapp-queue',
      'payment-promise', 'login-turnstile', 'olt-auto-identity', 'olt-device-removal', 'customer-device-removal', 'network-address',
      'olt-planned-reboot', 'olt-ticketing', 'olt-ticket-control', 'service-tickets', 'ticket-incidents', 'ticket-network', 'ticket-team', 'ticket-reference',
      'ticket-recovery', 'ticket-templates', 'ticket-customer-notifications', 'wifiku-modem-status']) require(path.join(root, 'src', module));
    await require(path.join(root, 'src/olt-vendors')).loadLibrary();
    const xterm = require.resolve('@xterm/xterm', { paths: [root] });
    fs.accessSync(path.join(path.dirname(xterm), '../css/xterm.css'));
    require.resolve('@xterm/addon-fit', { paths: [root] });
    if (process.platform === 'linux') await new Promise((resolve, reject) => {
      const pty = require(require.resolve('node-pty', { paths: [root] })).spawn('/usr/bin/printf', ['installer-pty-ok'], { name: 'xterm', cols: 80, rows: 24, cwd: root, env: { PATH: '/usr/bin:/bin' } });
      let output = '';
      const timer = setTimeout(() => { pty.kill(); reject(Error('Smoke test PTY melewati batas waktu')); }, 5000);
      pty.onData(value => { output += value; });
      pty.onExit(event => { clearTimeout(timer); if (event.exitCode === 0 && output.includes('installer-pty-ok')) resolve(); else reject(Error('Smoke test PTY gagal')); });
    });
  }
  return { version: pkg.version, files: files.length, runtime: Boolean(options.runtime) };
}

if (require.main === module) verifyRelease(path.resolve(process.argv[2] || '.'), { runtime: process.argv.includes('--runtime') })
  .then(result => console.log('Verifikasi rilis: ' + JSON.stringify(result)))
  .catch(error => { console.error('ERROR: ' + error.message); process.exitCode = 1; });
module.exports = { releaseFiles, verifyRelease };
