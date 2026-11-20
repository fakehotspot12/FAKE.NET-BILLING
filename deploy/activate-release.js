'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { releaseFiles } = require('./verify-release');
const hash = file => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
function save(dir, value) { fs.writeFileSync(path.join(dir, 'activation.json'), JSON.stringify(value), { mode: 0o600 }); }
function moveTree(source, target) {
  try { fs.renameSync(source, target); }
  catch (error) {
    if (error.code !== 'EXDEV') throw error;
    const copy = target + '.copy';
    fs.cpSync(source, copy, { recursive: true, preserveTimestamps: true });
    fs.renameSync(copy, target);
    fs.rmSync(source, { recursive: true });
  }
}
function atomic(target, source, mode, owner) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const next = target + '.fakenet-next';
  fs.copyFileSync(source, next); fs.chmodSync(next, mode);
  if (owner && process.getuid?.() === 0) fs.chownSync(next, owner.uid, owner.gid);
  fs.renameSync(next, target);
}
function activate(root, source, backup) {
  assert(!fs.existsSync(path.join(backup, 'activation.json')), 'Transaksi aktivasi sudah ada');
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  const base = fs.realpathSync(root);
  const records = releaseFiles(source).map(file => {
    const target = path.join(root, file), stat = fs.existsSync(target) ? fs.lstatSync(target) : null;
    if (stat) assert(stat.isFile() && !stat.isSymbolicLink() && fs.realpathSync(target).startsWith(base + path.sep), 'Target source tidak aman');
    let parent = path.dirname(target);
    while (!fs.existsSync(parent)) parent = path.dirname(parent);
    assert(fs.realpathSync(parent) === base || fs.realpathSync(parent).startsWith(base + path.sep), 'Direktori source tidak aman');
    if (stat) { fs.mkdirSync(path.dirname(path.join(backup, 'source', file)), { recursive: true }); fs.copyFileSync(target, path.join(backup, 'source', file)); }
    return { file, before: hash(target), after: hash(path.join(source, file)), mode: stat ? stat.mode & 0o777 : fs.statSync(path.join(source, file)).mode & 0o777, uid: stat?.uid, gid: stat?.gid };
  });
  const state = { root, records, hadModules: fs.existsSync(path.join(root, 'node_modules')), modules: true, completed: false };
  save(backup, state);
  if (fs.existsSync(path.join(root, 'node_modules'))) moveTree(path.join(root, 'node_modules'), path.join(backup, 'node_modules.previous'));
  moveTree(path.join(source, 'node_modules'), path.join(root, 'node_modules'));
  for (const row of records) atomic(path.join(root, row.file), path.join(source, row.file), row.mode, row.before ? row : null);
  return records.length;
}
function rollback(root, backup) {
  const state = JSON.parse(fs.readFileSync(path.join(backup, 'activation.json'), 'utf8'));
  assert.equal(state.root, root);
  for (const row of state.records) {
    const target = path.join(root, row.file), current = hash(target);
    if (current === row.before) continue;
    assert.equal(current, row.after, 'Source diubah proses lain, rollback ditahan: ' + row.file);
    if (row.before) atomic(target, path.join(backup, 'source', row.file), row.mode, row);
    else fs.unlinkSync(target);
  }
  if (state.modules && (fs.existsSync(path.join(backup, 'node_modules.previous')) || !state.hadModules)) {
    if (fs.existsSync(path.join(root, 'node_modules'))) moveTree(path.join(root, 'node_modules'), path.join(backup, 'node_modules.failed'));
    if (fs.existsSync(path.join(backup, 'node_modules.previous'))) moveTree(path.join(backup, 'node_modules.previous'), path.join(root, 'node_modules'));
  }
  state.rolledBack = true; save(backup, state);
}
function commit(root, backup, sha) {
  const state = JSON.parse(fs.readFileSync(path.join(backup, 'activation.json'), 'utf8'));
  assert.equal(state.root, root);
  for (const row of state.records) assert.equal(hash(path.join(root, row.file)), row.after, 'Checksum aktivasi berbeda: ' + row.file);
  if (sha) {
    assert(/^[a-f0-9]{40}$/.test(sha));
    const git = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 30000 }).trim();
    const old = git(['rev-parse', 'HEAD']), ref = git(['symbolic-ref', 'HEAD']);
    git(['merge-base', '--is-ancestor', old, sha]);
    const index = path.resolve(root, git(['rev-parse', '--git-path', 'index']));
    fs.copyFileSync(index, path.join(backup, 'git-index.previous'));
    try { git(['read-tree', sha]); git(['update-ref', ref, sha, old]); }
    catch (error) { fs.copyFileSync(path.join(backup, 'git-index.previous'), index); throw error; }
    state.previousGitCommit = old;
  }
  state.completed = true; save(backup, state);
}
if (require.main === module) {
  try {
    const [action, root, location, extra] = process.argv.slice(2);
    if (action === 'activate') console.log('Source diaktifkan: ' + activate(root, location, extra) + ' berkas');
    else if (action === 'rollback') rollback(root, location);
    else if (action === 'commit') commit(root, location, extra);
    else throw Error('Aksi aktivasi tidak valid');
  } catch (error) { console.error('ERROR: ' + error.message); process.exitCode = 1; }
}
module.exports = { activate, rollback, commit };
