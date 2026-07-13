'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const license = require('./license');
const packageInfo = require('../package.json');

const PORT = Number(process.env.LICENSE_SERVER_PORT || 8896);
const HOST = process.env.LICENSE_SERVER_HOST || '0.0.0.0';
const ADMIN_TOKEN = String(process.env.LICENSE_ADMIN_TOKEN || '').trim();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function send(res, status, body, contentType = 'text/html; charset=utf-8') {
  const text = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': text.length,
    'Cache-Control': 'no-store'
  });
  res.end(text);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function escapeHtml(value = '') {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 256 * 1024) {
        reject(new Error('Payload terlalu besar'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Payload JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

function authorized(req) {
  if (!ADMIN_TOKEN) return true;
  const header = String(req.headers.authorization || '');
  const token = header.replace(/^Bearer\s+/i, '').trim() || String(req.headers['x-license-token'] || '').trim();
  return token === ADMIN_TOKEN;
}

function page() {
  const durations = Object.keys(license.DURATION_PRESETS);
  const editionMap = license.EDITION_BY_DURATION;
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FAKE.NET License Generator</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; background:#eef3f8; color:#0f172a; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:18px; background:linear-gradient(135deg,#eef7ff,#f7fbff 46%,#e8f2fb); }
    main { width:min(960px, 100%); background:#fff; border:1px solid #d9e2ec; border-radius:16px; box-shadow:0 20px 58px rgba(15,23,42,.14); overflow:hidden; }
    header { display:flex; align-items:center; gap:14px; padding:20px 22px; background:#071f4a; color:#fff; }
    header img { width:58px; height:58px; object-fit:contain; border-radius:10px; background:#fff; padding:4px; }
    h1 { margin:0 0 4px; font-size:24px; }
    p { margin:0; color:#dbeafe; }
    .body { padding:22px; }
    form { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
    label { display:grid; gap:6px; font-weight:700; font-size:13px; }
    input, select, textarea { border:1px solid #ccd8e4; border-radius:9px; padding:11px 12px; font:inherit; min-width:0; background:#fff; }
    input[readonly] { background:#f4f8fc; color:#29435b; }
    small { color:#64748b; font-weight:600; line-height:1.35; }
    textarea { grid-column:1 / -1; min-height:130px; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; font-size:12px; }
    .full { grid-column:1 / -1; }
    .actions { display:flex; gap:10px; justify-content:flex-end; grid-column:1 / -1; }
    button { border:0; border-radius:9px; background:#008ed0; color:#fff; padding:11px 16px; font-weight:800; cursor:pointer; }
    button.secondary { background:#e6eef6; color:#123450; }
    .result { margin-top:16px; border:1px dashed #9fc5df; border-radius:12px; padding:14px; background:#f7fbff; display:grid; gap:8px; }
    code { overflow-wrap:anywhere; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; }
    @media (max-width: 720px) { body { padding:10px; } header { padding:16px; align-items:flex-start; } form { grid-template-columns:1fr; } .body { padding:16px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <img src="/fakenet-logo.png" alt="FAKE.NET">
      <div>
        <h1>FAKE.NET License Generator</h1>
        <p>Generate license key untuk aktivasi FAKE.NET Billing berbasis HWID mesin pelanggan.</p>
      </div>
    </header>
    <div class="body">
      <form id="licenseForm">
        <label><span>Nama pelanggan</span><input name="licensedTo" required placeholder="Nama usaha / pelanggan"></label>
        <label><span>HWID / Machine Code</span><input name="machineCode" required placeholder="MC-XXXXX-XXXXX-XXXXX-XXXXX"></label>
        <label><span>Durasi</span><select name="duration">${durations.map((item) => `<option value="${item}">${escapeHtml(editionMap[item] || item)} (${item})</option>`).join('')}</select></label>
        <label><span>Edition</span><input name="edition" value="${escapeHtml(editionMap[durations[0]] || '')}" readonly></label>
        <label>
          <span>Site/NAS</span>
          <input value="Unlimited" readonly>
          <small>Jumlah site/NAS tidak dibatasi. Aktivasi tetap dikunci per VM melalui HWID / machine code.</small>
        </label>
        <label><span>Token admin generator</span><input name="token" type="password" placeholder="Opsional jika server diset token"></label>
        <div class="actions">
          <button class="secondary" type="reset">Reset</button>
          <button type="submit">Generate License</button>
        </div>
      </form>
      <div id="result" class="result" hidden></div>
    </div>
  </main>
  <script>
    const form = document.getElementById('licenseForm');
    const result = document.getElementById('result');
    const editionMap = ${JSON.stringify(editionMap)};
    function syncEdition() {
      form.edition.value = editionMap[form.duration.value] || 'Standard Edition';
    }
    form.duration.addEventListener('change', syncEdition);
    form.addEventListener('reset', () => setTimeout(syncEdition, 0));
    syncEdition();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      result.hidden = false;
      result.textContent = 'Memproses...';
      const body = Object.fromEntries(new FormData(form).entries());
      const token = body.token || '';
      delete body.token;
      const response = await fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        result.innerHTML = '<strong>Gagal</strong><span>' + (payload.error || 'Request gagal') + '</span>';
        return;
      }
      result.innerHTML = '<strong>License Key</strong><code>' + payload.key + '</code><strong>Edition</strong><span>' + payload.payload.edition + '</span><strong>Expired</strong><span>' + (payload.payload.expiresAt || 'Lifetime') + '</span><button type="button" id="copyKey">Copy Key</button>';
      document.getElementById('copyKey')?.addEventListener('click', () => navigator.clipboard?.writeText(payload.key));
    });
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, app: 'fakenet-license-server', billingVersion: packageInfo.version });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      send(res, 200, page());
      return;
    }
    if (req.method === 'GET' && url.pathname === '/fakenet-logo.png') {
      const logo = fs.readFileSync(path.join(PUBLIC_DIR, 'fakenet-logo.png'));
      send(res, 200, logo, 'image/png');
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/licenses') {
      if (!authorized(req)) {
        sendJson(res, 401, { ok: false, error: 'Token admin license salah' });
        return;
      }
      const payload = await readBody(req);
      const generated = license.generateLicense(payload);
      sendJson(res, 201, { ok: true, ...generated });
      return;
    }
    sendJson(res, 404, { ok: false, error: 'Halaman tidak tersedia' });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message || 'Request gagal' });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`FAKE.NET License Generator berjalan di http://${HOST}:${PORT}`);
  });
}

module.exports = { server };
