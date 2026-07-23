'use strict';

const fs = require('fs');
const path = require('path');

const uiBase = `http://127.0.0.1:${Number(process.env.GENIEACS_UI_PORT || 7568)}`;
const nbiBase = `http://127.0.0.1:${Number(process.env.GENIEACS_NBI_PORT || 7557)}`;
const uiUsername = String(process.env.GENIEACS_UI_USERNAME || 'billing');
const uiPassword = String(process.env.GENIEACS_UI_PASSWORD || 'billing123');
const cwmpUsername = String(process.env.GENIEACS_CWMP_AUTH_USERNAME || 'admin');
const cwmpPassword = String(process.env.GENIEACS_CWMP_AUTH_PASSWORD || '1sampai10');
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
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

async function installVirtualParameters(token) {
  for (const name of ['RXPower', 'gettemp']) {
    const script = fs.readFileSync(path.join(assetsDir, `${name}.js`), 'utf8');
    await uiPut(token, `virtualParameters/${encodeURIComponent(name)}`, { script });
  }

  const provision = [
    'const daily = Date.now(86400000);',
    'declare("VirtualParameters.RXPower", {value: daily});',
    'declare("VirtualParameters.gettemp", {value: daily});'
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
  await waitForUi();
  const token = await bootstrapUser();
  await uiPut(token, 'config/cwmp.auth', {
    value: `AUTH(${JSON.stringify(cwmpUsername)}, ${JSON.stringify(cwmpPassword)})`
  });
  await installVirtualParameters(token);
  process.stdout.write('Bootstrap GenieACS selesai: akun UI, autentikasi Inform, dan Virtual Parameters aktif.\n');
}

main().catch((error) => {
  console.error(`Bootstrap GenieACS gagal: ${error.message || error}`);
  process.exitCode = 1;
});
