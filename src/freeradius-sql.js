'use strict';

const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const freeradius = require('./freeradius-core');

function enabled() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.FREERADIUS_SYNC_ENABLED || '').toLowerCase());
}

function databaseUrl() {
  return process.env.FREERADIUS_DATABASE_URL || process.env.FREERADIUS_DB_URL || '';
}

function configured() {
  return Boolean(databaseUrl());
}

function driver() {
  const requested = String(process.env.FREERADIUS_SYNC_DRIVER || '').trim().toLowerCase();
  if (['postgres', 'postgresql', 'pg'].includes(requested)) return 'postgres';
  if (['mysql', 'mariadb'].includes(requested)) return 'mysql';
  const url = databaseUrl();
  if (/^mysql:\/\//i.test(url) || /^mariadb:\/\//i.test(url)) return 'mysql';
  return 'postgres';
}

function ensureState(data) {
  data.radiusSyncState = data.radiusSyncState && typeof data.radiusSyncState === 'object'
    ? data.radiusSyncState
    : {};
  data.radiusSyncState.managed = data.radiusSyncState.managed && typeof data.radiusSyncState.managed === 'object'
    ? data.radiusSyncState.managed
    : {};
  data.radiusSyncState.managed.usernames = Array.isArray(data.radiusSyncState.managed.usernames)
    ? data.radiusSyncState.managed.usernames
    : [];
  data.radiusSyncState.managed.groupnames = Array.isArray(data.radiusSyncState.managed.groupnames)
    ? data.radiusSyncState.managed.groupnames
    : [];
  data.radiusSyncState.managed.nasnames = Array.isArray(data.radiusSyncState.managed.nasnames)
    ? data.radiusSyncState.managed.nasnames
    : [];
  return data.radiusSyncState;
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function rowCounts(rows = {}) {
  return {
    nas: (rows.nas || []).length,
    radcheck: (rows.radcheck || []).length,
    radreply: (rows.radreply || []).length,
    radusergroup: (rows.radusergroup || []).length,
    radgroupcheck: (rows.radgroupcheck || []).length,
    radgroupreply: (rows.radgroupreply || []).length
  };
}

function reloadFreeradiusIfNasChanged(previous = {}, current = {}) {
  if (String(process.env.FREERADIUS_AUTO_RELOAD || '1') === '0') return Promise.resolve(false);
  const before = unique(previous.nasnames || []).sort().join('|');
  const after = unique(current.nasnames || []).sort().join('|');
  if (before === after) return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn('systemctl', ['reload', 'freeradius.service']);
    child.once('close', (code) => {
      if (code === 0) {
        resolve(true);
        return;
      }
      const fallback = spawn('systemctl', ['restart', 'freeradius.service']);
      fallback.once('close', () => resolve(true));
      fallback.once('error', () => resolve(false));
    });
    child.once('error', () => resolve(false));
  });
}

function managedKeys(rows = {}) {
  return {
    usernames: unique([
      ...(rows.radcheck || []).map((row) => row.username),
      ...(rows.radreply || []).map((row) => row.username),
      ...(rows.radusergroup || []).map((row) => row.username)
    ]),
    groupnames: unique([
      ...(rows.radusergroup || []).map((row) => row.groupname),
      ...(rows.radgroupcheck || []).map((row) => row.groupname),
      ...(rows.radgroupreply || []).map((row) => row.groupname)
    ]),
    nasnames: unique((rows.nas || []).map((row) => row.nasname))
  };
}

function mergeManagedKeys(previous = {}, current = {}) {
  return {
    usernames: unique([...(previous.usernames || []), ...(current.usernames || [])]),
    groupnames: unique([...(previous.groupnames || []), ...(current.groupnames || [])]),
    nasnames: unique([...(previous.nasnames || []), ...(current.nasnames || [])])
  };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function sqlNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.trunc(number)) : String(fallback);
}

function sqlList(values = []) {
  const clean = unique(values);
  return clean.length ? clean.map(sqlLiteral).join(', ') : '';
}

function insertRows(table, columns, rows = {}) {
  const values = (rows[table] || []).map((row) => {
    const mapped = columns.map((column) => {
      if (column.numeric) return sqlNumber(row[column.key], column.fallback || 0);
      return sqlLiteral(row[column.key] || '');
    });
    return `(${mapped.join(', ')})`;
  });
  if (!values.length) return '';
  return `INSERT INTO ${table} (${columns.map((column) => column.name).join(', ')}) VALUES\n${values.join(',\n')};`;
}

function buildSql(rows, previousManaged = {}) {
  const currentManaged = managedKeys(rows);
  const deleteKeys = mergeManagedKeys(previousManaged, currentManaged);
  const statements = ['BEGIN;'];
  const usernameList = sqlList(deleteKeys.usernames);
  const groupList = sqlList(deleteKeys.groupnames);
  const nasList = sqlList(deleteKeys.nasnames);

  if (usernameList) {
    statements.push(`DELETE FROM radcheck WHERE username IN (${usernameList});`);
    statements.push(`DELETE FROM radreply WHERE username IN (${usernameList});`);
    statements.push(`DELETE FROM radusergroup WHERE username IN (${usernameList});`);
  }
  if (groupList) {
    statements.push(`DELETE FROM radgroupcheck WHERE groupname IN (${groupList});`);
    statements.push(`DELETE FROM radgroupreply WHERE groupname IN (${groupList});`);
    statements.push(`DELETE FROM radusergroup WHERE groupname IN (${groupList});`);
  }
  if (nasList) {
    statements.push(`DELETE FROM nas WHERE nasname IN (${nasList});`);
  }

  statements.push(insertRows('nas', [
    { name: 'nasname', key: 'nasname' },
    { name: 'shortname', key: 'shortname' },
    { name: 'type', key: 'type' },
    { name: 'ports', key: 'ports', numeric: true, fallback: 3799 },
    { name: 'secret', key: 'secret' },
    { name: 'server', key: 'server' },
    { name: 'community', key: 'community' },
    { name: 'description', key: 'description' }
  ], rows));
  statements.push(insertRows('radcheck', [
    { name: 'username', key: 'username' },
    { name: 'attribute', key: 'attribute' },
    { name: 'op', key: 'op' },
    { name: 'value', key: 'value' }
  ], rows));
  statements.push(insertRows('radreply', [
    { name: 'username', key: 'username' },
    { name: 'attribute', key: 'attribute' },
    { name: 'op', key: 'op' },
    { name: 'value', key: 'value' }
  ], rows));
  statements.push(insertRows('radusergroup', [
    { name: 'username', key: 'username' },
    { name: 'groupname', key: 'groupname' },
    { name: 'priority', key: 'priority', numeric: true, fallback: 1 }
  ], rows));
  statements.push(insertRows('radgroupcheck', [
    { name: 'groupname', key: 'groupname' },
    { name: 'attribute', key: 'attribute' },
    { name: 'op', key: 'op' },
    { name: 'value', key: 'value' }
  ], rows));
  statements.push(insertRows('radgroupreply', [
    { name: 'groupname', key: 'groupname' },
    { name: 'attribute', key: 'attribute' },
    { name: 'op', key: 'op' },
    { name: 'value', key: 'value' }
  ], rows));
  statements.push('COMMIT;');
  return {
    currentManaged,
    sql: statements.filter(Boolean).join('\n')
  };
}

function spawnWithInput(command, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(options.env || {})
      }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error((stderr || stdout || `${command} keluar dengan status ${code}`).trim());
      error.code = code;
      reject(error);
    });
    child.stdin.end(input);
  });
}

async function runPostgres(sql) {
  const tempPath = path.join('/tmp', `fakenet-freeradius-${process.pid}-${Date.now()}.sql`);
  await fs.writeFile(tempPath, sql, { mode: 0o600 });
  try {
    return await spawnWithInput('psql', [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-d',
      databaseUrl(),
      '-f',
      tempPath
    ], '');
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

function mysqlArgsFromUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const args = [
    '--batch',
    '--raw',
    '--protocol=TCP',
    `--host=${parsed.hostname || '127.0.0.1'}`,
    `--port=${parsed.port || '3306'}`,
    `--user=${decodeURIComponent(parsed.username || '')}`,
    '--default-character-set=utf8mb4'
  ];
  const database = decodeURIComponent((parsed.pathname || '').replace(/^\//, ''));
  if (database) args.push(database);
  return {
    args,
    env: parsed.password ? { MYSQL_PWD: decodeURIComponent(parsed.password) } : {}
  };
}

async function runMysql(sql) {
  const parsed = mysqlArgsFromUrl(databaseUrl());
  return spawnWithInput('mysql', parsed.args, sql, { env: parsed.env });
}

function status(data = {}) {
  const state = ensureState(data);
  const previewRows = freeradius.freeradiusRows(data);
  const counts = rowCounts(previewRows);
  return {
    enabled: enabled(),
    configured: configured(),
    driver: driver(),
    source: 'freeradius-sql',
    rowCounts: state.rowCounts || counts,
    previewCounts: counts,
    lastSyncAt: state.lastSyncAt || '',
    lastSyncOk: state.lastSyncOk === true,
    lastError: state.lastError || '',
    managed: {
      usernames: (state.managed.usernames || []).length,
      groupnames: (state.managed.groupnames || []).length,
      nasnames: (state.managed.nasnames || []).length
    }
  };
}

async function syncAll(data = {}, context = {}) {
  const state = ensureState(data);
  const rows = freeradius.freeradiusRows(data);
  const counts = rowCounts(rows);

  if (!enabled()) {
    state.lastSyncOk = false;
    state.lastError = '';
    state.rowCounts = counts;
    return {
      ok: false,
      skipped: true,
      reason: 'FreeRADIUS SQL sync belum aktif',
      status: status(data)
    };
  }
  if (!configured()) {
    state.lastSyncOk = false;
    state.lastError = 'FREERADIUS_DATABASE_URL belum diisi';
    state.rowCounts = counts;
    throw new Error(state.lastError);
  }

  const built = buildSql(rows, state.managed);
  try {
    if (driver() === 'mysql') {
      await runMysql(built.sql);
    } else {
      await runPostgres(built.sql);
    }
    const previousManaged = state.managed;
    state.managed = built.currentManaged;
    state.rowCounts = counts;
    state.lastSyncAt = new Date().toISOString();
    state.lastSyncOk = true;
    state.lastError = '';
    state.lastAction = context.action || '';
    state.lastActor = context.actor?.name || context.actor?.username || '';
    await reloadFreeradiusIfNasChanged(previousManaged, built.currentManaged);
    return {
      ok: true,
      rowCounts: counts,
      status: status(data)
    };
  } catch (error) {
    state.rowCounts = counts;
    state.lastSyncAt = new Date().toISOString();
    state.lastSyncOk = false;
    state.lastError = error.message || 'Sinkron FreeRADIUS SQL gagal';
    throw new Error(state.lastError);
  }
}

module.exports = {
  configured,
  enabled,
  status,
  syncAll
};
