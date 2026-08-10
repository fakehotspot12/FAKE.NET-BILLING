'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const uiBase = `http://127.0.0.1:${Number(process.env.GENIEACS_UI_PORT || 7568)}`;
const nbiBase = `http://127.0.0.1:${Number(process.env.GENIEACS_NBI_PORT || 7557)}`;
const uiUsername = String(process.env.GENIEACS_UI_USERNAME || 'billing');
const uiPassword = String(process.env.GENIEACS_UI_PASSWORD || 'billing123');
const cwmpUsername = String(process.env.GENIEACS_CWMP_AUTH_USERNAME || 'admin');
const cwmpPassword = String(process.env.GENIEACS_CWMP_AUTH_PASSWORD || '1sampai10');
const mongoUrl = String(process.env.GENIEACS_MONGODB_CONNECTION_URL || 'mongodb://127.0.0.1:27017/genieacs');
const assetsDir = path.join(__dirname, 'virtual-parameters');

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} HTTP ${response.status}: ${text.slice(0, 180)}`);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function waitForUi() {
  let lastError = null;
  const attempts = Math.max(1, Number(process.env.GENIEACS_UI_BOOTSTRAP_ATTEMPTS || 12) || 12);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await request(`${uiBase}/status`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError || new Error('GenieACS UI belum siap');
}

async function waitForNbi() {
  let lastError = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const devices = await request(`${nbiBase}/devices/?limit=1`);
      if (Array.isArray(devices)) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw lastError || new Error('GenieACS NBI belum siap');
}

async function login(username, password) {
  const token = await request(`${uiBase}/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  return String(token || '').replace(/^"|"$/g, '');
}

async function uiPut(token, resource, body) {
  return request(`${uiBase}/api/${resource}`, {
    method: 'PUT',
    headers: { Cookie: `genieacs-ui-jwt=${encodeURIComponent(token)}` },
    body: JSON.stringify(body)
  });
}

async function uiDelete(token, resource) {
  return request(`${uiBase}/api/${resource}`, {
    method: 'DELETE',
    headers: { Cookie: `genieacs-ui-jwt=${encodeURIComponent(token)}` }
  });
}

async function bootstrapUser() {
  const init = await request(`${uiBase}/init`);
  let token;
  if (init?.users === true) {
    await request(`${uiBase}/init`, {
      method: 'POST',
      body: JSON.stringify({ users: true, presets: true, filters: true, device: true, index: true, overview: true })
    });
    token = await login('admin', 'admin');
    await uiPut(token, `users/${encodeURIComponent(uiUsername)}`, { roles: 'admin' });
    await uiPut(token, `users/${encodeURIComponent(uiUsername)}/password`, { newPassword: uiPassword });
    token = await login(uiUsername, uiPassword);
    if (uiUsername !== 'admin') await uiDelete(token, 'users/admin');
    return token;
  }
  return login(uiUsername, uiPassword);
}

function virtualParameterScripts() {
  return fs.readdirSync(assetsDir)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((file) => ({
      name: path.basename(file, '.js'),
      script: fs.readFileSync(path.join(assetsDir, file), 'utf8')
    }));
}

async function installVirtualParametersViaUi(token, rows = []) {
  if (!token) throw new Error('Token UI GenieACS tidak tersedia');
  for (const row of rows) {
    await uiPut(token, `virtualParameters/${encodeURIComponent(row.name)}`, { script: row.script });
  }
}

function installVirtualParametersViaMongo(rows = []) {
  const command = ['mongosh', 'mongo'].find((candidate) => {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  });
  if (!command) throw new Error('mongosh/mongo tidak tersedia untuk fallback Virtual Parameters');

  const script = [
    'const rows = ' + JSON.stringify(rows) + ';',
    'for (const row of rows) {',
    '  db.getCollection("virtualParameters").updateOne({ _id: row.name }, { $set: { script: row.script } }, { upsert: true });',
    '}',
    'print("Virtual Parameters aktif: " + rows.map((row) => row.name).join(", "));'
  ].join('\n');
  const args = command === 'mongosh'
    ? ['--quiet', mongoUrl, '--eval', script]
    : ['--quiet', mongoUrl, '--eval', script];
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'fallback MongoDB gagal').trim());
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

async function installVirtualParameters(token) {
  const rows = virtualParameterScripts();
  let installed = false;
  if (token) {
    try {
      await installVirtualParametersViaUi(token, rows);
      installed = true;
    } catch (error) {
      process.stderr.write(`Peringatan: install Virtual Parameters via UI gagal: ${error.message || error}\n`);
    }
  }
  if (!installed) {
    installVirtualParametersViaMongo(rows);
  }

  const declarations = rows
    .map((row) => `declare("VirtualParameters.${row.name}", {path: daily, value: daily});`)
    .join('\n');
  const provision = [
    'const daily = Date.now(86400000);',
    declarations
  ].join('\n');
  await request(`${nbiBase}/provisions/fakenet-virtual-parameters`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/javascript' },
    body: provision
  });
  await request(`${nbiBase}/presets/fakenet-virtual-parameters`, {
    method: 'PUT',
    body: JSON.stringify({
      weight: 10,
      precondition: '{}',
      configurations: [{ type: 'provision', name: 'fakenet-virtual-parameters', args: [] }]
    })
  });
}

async function main() {
  await waitForNbi();
  let token = '';
  try {
    await waitForUi();
    token = await bootstrapUser();
    await uiPut(token, 'config/cwmp.auth', {
      value: `AUTH(${JSON.stringify(cwmpUsername)}, ${JSON.stringify(cwmpPassword)})`
    });
  } catch (error) {
    process.stderr.write(`Peringatan: bootstrap UI GenieACS dilewati: ${error.message || error}\n`);
  }
  await installVirtualParameters(token);
  process.stdout.write('Bootstrap GenieACS selesai: akun UI, autentikasi Inform, dan Virtual Parameters aktif.\n');
}

main().catch((error) => {
  console.error(`Bootstrap GenieACS gagal: ${error.message || error}`);
  process.exitCode = 1;
});
