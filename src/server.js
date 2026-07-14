'use strict';

const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const fsSync = require('fs');
const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const { promisify } = require('util');
const { URL } = require('url');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const QRCode = require('qrcode');
const packageInfo = require('../package.json');

const execFileAsync = promisify(execFile);

const {
  addActivity,
  addMonthsToPeriod,
  addExpense,
  addExternalIncome,
  addManualCustomer,
  currentPeriod,
  customerBillableInPeriod,
  dueDateForPeriod,
  generateInvoices,
  invoiceBlocksPeriod,
  invoiceCoveredPeriods,
  invoiceRuntimeStatus,
  markInvoicePaid,
  markInvoiceUnpaid,
  nextBillingInvoiceNumber,
  normalizePeriod,
  paymentIsActive,
  resolvePrice,
  summarize,
  deleteExpense,
  deleteExternalIncome,
  updateExpense,
  updateExternalIncome,
  upsertMonthlyEarning
} = require('./finance');
const auth = require('./auth');
const mediaServices = require('./media-services');
const operations = require('./operations');
const freeradius = require('./freeradius-core');
const freeradiusCoa = require('./freeradius-coa');
const freeradiusSessions = require('./freeradius-sessions');
const freeradiusSql = require('./freeradius-sql');
const genieAcs = require('./genieacs');
const license = require('./license');
const secureSecrets = require('./secure-secrets');
const { CACHE_MODE, DEFAULT_COLLECTOR_DAILY_BONUS_TIERS, createId, ensureShape, loadStore, publicSettings, redisStatus, saveStore, STORAGE_MODE, STORE_PATH } = require('./store');

const PORT = Number(process.env.PORT || 8891);
const HOST = process.env.HOST || '0.0.0.0';
const APP_MODE = String(process.env.APP_MODE || 'standalone').toLowerCase();
const BILLING_SOURCE = String(process.env.BILLING_SOURCE || (APP_MODE === 'standalone' ? 'local' : 'radboox')).toLowerCase();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const APP_ROOT = path.join(__dirname, '..');
const APP_VERSION = String(process.env.APP_VERSION || packageInfo.version || '1.0.0');
const APP_BUILD_VERSION = String(process.env.APP_BUILD_VERSION || packageInfo.buildVersion || '20260713.3');
const APP_RELEASE_DATE = String(process.env.APP_RELEASE_DATE || '2026-07-10');
const RADBOOX_AUTO_SYNC_MIN_SECONDS = 60;
const RADBOOX_AUTO_SYNC_MAX_SECONDS = 5 * 60;
const BILLING_AUTOMATION_INTERVAL_MS = Math.max(60_000, Number(process.env.BILLING_AUTOMATION_INTERVAL_MS || 300_000) || 300_000);
const RADBOOX_AUTO_SYNC_DEFAULT_SECONDS = 120;
const RADBOOX_DASHBOARD_MEMBER_TTL_MS = 5 * 60 * 1000;
const RADBOOX_DASHBOARD_MEMBER_MAX_PAGES = 1;
const BODY_LIMIT_BYTES = 3 * 1024 * 1024;
const BACKUP_RESTORE_LIMIT_BYTES = 25 * 1024 * 1024;
const LOGO_DATA_URL_LIMIT_BYTES = 2 * 1024 * 1024;
const XENDIT_WITHDRAW_TTL_MS = 10 * 60 * 1000;
const WA_GATEWAY_SEND_INTERVAL_MS = Math.max(15_000, Number(process.env.WA_GATEWAY_SEND_INTERVAL_MS || 30_000) || 30_000);
const WA_GATEWAY_HTTP_TIMEOUT_MS = Math.max(5_000, Number(process.env.WA_GATEWAY_HTTP_TIMEOUT_MS || 15_000) || 15_000);
const WAHA_ENV_FILE = process.env.WAHA_ENV_FILE || '/etc/fakenet-billing-waha.env';
const APP_UPDATE_COMMAND = process.env.FAKENET_UPDATE_COMMAND || '/usr/local/bin/fakenet-billing-update';
const APP_UPDATE_LOG = process.env.FAKENET_UPDATE_LOG || '/var/log/fakenet-billing/update.log';
const APP_UPDATE_REMOTE_TIMEOUT_MS = Math.max(2000, Number(process.env.FAKENET_UPDATE_REMOTE_TIMEOUT_MS || 5000) || 5000);
const APP_UPDATE_STATUS_TTL_MS = Math.max(60_000, Number(process.env.FAKENET_UPDATE_STATUS_TTL_MS || 300_000) || 300_000);
const WA_GATEWAY_PROVIDERS = {
  waha: { label: 'Whatsapp Gateway', baseUrl: 'http://127.0.0.1:8895', autoBaseUrl: false }
};
const LOGIN_VERIFICATION_TTL_MS = Math.max(60_000, Number(process.env.LOGIN_VERIFICATION_TTL_MS || 180_000) || 180_000);
const LOGIN_VERIFICATION_MAX_ATTEMPTS = Math.max(1, Number(process.env.LOGIN_VERIFICATION_MAX_ATTEMPTS || 3) || 3);
const WIFIKU_OTP_MAX_ATTEMPTS = Math.max(1, Number(process.env.WIFIKU_OTP_MAX_ATTEMPTS || 5) || 5);
const INDONESIAN_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DEFAULT_WA_TEMPLATES = {
  invoiceIssued: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan Invoice anda telah terbit dan dapat dibayarkan, berikut rinciannya :\nID Pelanggan: [uid]\nNomor Invoice: [no_invoice]\nAmount: Rp [amount]\nTotal: Rp [total]\nItem: [pppoe_profile]\nJatuh tempo: [due_date]\nPeriod: [period]\n\nMohon segera lakukan pembayaran sebelum jatuh tempo, jika tidak dibayarkan setelah *H+5 (5 hari)* dari tanggal jatuh tempo maka akan otomatis ditangguhkan *(ISOLIR).*\n\n*Metode Pembayaran Otomatis*\nBank Virtual Account, OVO, DANA, LinkAja, ShopeePay, QRIS, BRILink, Alfamart, Alfamidi dan Indomaret terdekat!\nKlik => [payment_gateway]\n\n*Jika sudah melakukan pembayaran mohon mengirim resi/konfirmasi ke whatsapp ini.*\n\nTerima kasih.',
  paymentReminder: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan tagihan anda senilai Rp. [total] belum di bayar, Mohon segera lakukan pembayaran sebelum jatuh tempo, jika tidak dibayarkan setelah *H+5 (5 hari)* dari tanggal jatuh tempo maka akan otomatis ditangguhkan *(ISOLIR).*\n\nAbaikan pesan ini bila sudah membayar.\n\n*Metode Pembayaran Otomatis*\nBank Virtual Account, OVO, DANA, LinkAja, ShopeePay, QRIS, BRILink, Alfamart, Alfamidi dan Indomaret terdekat!\nKlik => [payment_gateway]\n\n*Jika sudah melakukan pembayaran mohon mengirim resi/konfirmasi ke whatsapp ini.*\n\nTerima kasih.',
  invoiceOverdue: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nDi informasikan, Account anda telah ditangguhkan *(ISOLIR)* oleh *System Billing* kami, dikarenakan keterlambatan dalam pembayaran.\n\nSaat ini anda tidak dapat menggunakan internet, sampai anda menyelesaikan pembayaran senilai Rp. [total]\n\n*Metode Pembayaran Otomatis*\nBank Virtual Account, OVO, DANA, LinkAja, ShopeePay, QRIS, BRILink, Alfamart, Alfamidi dan Indomaret terdekat!\nKlik => [payment_gateway]\n\n*Jika sudah melakukan pembayaran mohon mengirim resi/konfirmasi ke whatsapp ini*\n\nTerima kasih.',
  paymentPaid: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan tagihan anda telah dibayar, berikut rinciannya :\nID Pelanggan: [uid]\nNomor Invoice: [no_invoice]\nTotal: Rp [total]\nItem: [pppoe_profile]\nPeriod: [period]\nStatus: Paid\nPayment Method: [paid_method]\n\nTerima kasih.',
  paymentCancel: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan pembayaran anda telah dibatalkan, berikut rinciannya :\nNomor Invoice: [no_invoice]\nInvoice Date: [invoice_date]\nTotal: Rp [total]\nDue Date: [due_date]\nPeriod: [period]\nStatus: Unpaid\nSegera lakukan pembayaran\n\n*Metode Pembayaran Otomatis*\nBank Virtual Account, OVO, DANA, LinkAja, ShopeePay, QRIS, BRILink, Alfamart, Alfamidi dan Indomaret terdekat!\nKlik => [payment_gateway]\n\nTerima kasih.',
  accountSuspend: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan Internet Account anda dalam penangguhan (Isolir).\nSaat ini anda tidak dapat menggunakan layanan internet. Segera konfirmasi ke admin layanan kami terkait hal ini.\n\n*Metode Pembayaran Otomatis*\nBank Virtual Account, OVO, DANA, LinkAja, ShopeePay, QRIS, BRILink, Alfamart, Alfamidi dan Indomaret terdekat!\nKlik => [payment_gateway]\n\n*Jika sudah melakukan pembayaran mohon mengirim resi/konfirmasi ke whatsapp ini*\n\nTerima kasih!',
  accountActive: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nKami informasikan Internet Account anda telah di aktifkan, berikut rincian data account anda :\n\nID Pelanggan: [uid]\nItem: [pppoe_profile]\n\nMohon untuk mematikan dan menyalakan kembali tombol modem jika internet masih belum aktif setelah pembayaran ini. Terima kasih!\n\n*Ini adalah pesan otomatis*',
  voucherIssued: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nPembayaran voucher Hotspot berhasil.\nReference: [reference]\nPaket: [voucher_profile]\nHarga: Rp [voucher_price]\nUsername: [voucher_user]\nPassword: [voucher_pass]\nMasa aktif: [validity]\nBerlaku sampai: [valid_until]\nLink login: [login_url]\n\nSimpan voucher ini sampai masa aktif habis.\n\nTerima kasih.',
  voucherExpired: 'Salam Bapak/Ibu [fullname]\nPelanggan [nama_usaha]\n\nMasa aktif voucher Hotspot anda sudah habis.\nUsername: [voucher_user]\nPaket: [voucher_profile]\nBerlaku sampai: [valid_until]\n\nSilakan beli voucher baru jika ingin menggunakan layanan kembali.\nLink login: [login_url]\n\nTerima kasih.',
  memberStatus: 'Halo *[fullname]*, status layanan internet Anda saat ini [status].\n\n[footer]'
};

const xenditWithdrawRequests = new Map();
const wifiKuOtpChallenges = new Map();
const wifiKuSessions = new Map();
let wahaApiKeyCache;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function staticCacheControl(ext) {
  if (['.html', '.js', '.css'].includes(ext)) {
    return 'no-store';
  }
  return 'public, max-age=86400';
}

let writeQueue = Promise.resolve();

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

function sendNoContent(res) {
  res.writeHead(204, { 'Cache-Control': 'no-store' });
  res.end();
}

let updateStatusCache = {
  expiresAt: 0,
  value: null
};

async function gitOutput(args = [], options = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: APP_ROOT,
    timeout: options.timeout || APP_UPDATE_REMOTE_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0'
    }
  });
  return String(stdout || '').trim();
}

function redactGitRemoteUrl(value = '') {
  return String(value || '').replace(/:\/\/([^/@\s]+)@/g, '://***@');
}

async function appUpdateStatus(options = {}) {
  const now = Date.now();
  if (!options.force && updateStatusCache.value && updateStatusCache.expiresAt > now) {
    return updateStatusCache.value;
  }

  const status = {
    sourceMode: fsSync.existsSync(path.join(APP_ROOT, '.git')) ? 'git' : 'archive',
    updaterInstalled: fsSync.existsSync(APP_UPDATE_COMMAND),
    currentCommit: '',
    currentCommitShort: '',
    remoteCommit: '',
    remoteCommitShort: '',
    branch: '',
    remoteUrl: '',
    dirty: false,
    updateAvailable: false,
    checkedAt: new Date().toISOString(),
    error: ''
  };

  if (status.sourceMode !== 'git') {
    status.error = 'Source aplikasi bukan Git checkout';
    updateStatusCache = { value: status, expiresAt: now + APP_UPDATE_STATUS_TTL_MS };
    return status;
  }

  try {
    status.currentCommit = await gitOutput(['rev-parse', 'HEAD']);
    status.currentCommitShort = status.currentCommit.slice(0, 7);
    status.branch = await gitOutput(['branch', '--show-current']).catch(() => '');
    status.remoteUrl = redactGitRemoteUrl(await gitOutput(['remote', 'get-url', 'origin']).catch(() => ''));
    const dirtyOutput = await gitOutput(['status', '--short', '--untracked-files=no']).catch(() => '');
    status.dirty = Boolean(dirtyOutput.trim());
    const branch = status.branch || 'main';
    const remoteLine = await gitOutput(['ls-remote', 'origin', `refs/heads/${branch}`], { timeout: APP_UPDATE_REMOTE_TIMEOUT_MS });
    status.remoteCommit = String(remoteLine || '').split(/\s+/)[0] || '';
    status.remoteCommitShort = status.remoteCommit.slice(0, 7);
    status.updateAvailable = Boolean(status.currentCommit && status.remoteCommit && status.currentCommit !== status.remoteCommit);
  } catch (error) {
    status.error = error.message || 'Status update tidak bisa dicek';
  }

  updateStatusCache = { value: status, expiresAt: now + APP_UPDATE_STATUS_TTL_MS };
  return status;
}

async function updateLogTail(limitBytes = 12_000) {
  try {
    const stat = await fs.stat(APP_UPDATE_LOG);
    const start = Math.max(0, stat.size - limitBytes);
    const handle = await fs.open(APP_UPDATE_LOG, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return '';
  }
}

function startUpdateProcess() {
  if (!fsSync.existsSync(APP_UPDATE_COMMAND)) {
    throw new Error(`Command update tidak ditemukan: ${APP_UPDATE_COMMAND}`);
  }
  const child = spawn(APP_UPDATE_COMMAND, [], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      APP_DIR: APP_ROOT
    }
  });
  child.unref();
  return child.pid;
}

const loginVerificationChallenges = new Map();
const LOGIN_VERIFICATION_CHARS = '23456789';

function cleanupLoginVerificationChallenges(now = Date.now()) {
  for (const [id, challenge] of loginVerificationChallenges.entries()) {
    if (!challenge || Number(challenge.expiresAt || 0) <= now) {
      loginVerificationChallenges.delete(id);
    }
  }
}

function randomLoginVerificationCode(length = 5) {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += LOGIN_VERIFICATION_CHARS[crypto.randomInt(0, LOGIN_VERIFICATION_CHARS.length)];
  }
  return value;
}

function loginVerificationSvg(code = '') {
  const safeCode = String(code || '').replace(/[^0-9]/g, '');
  const width = 172;
  const height = 52;
  const segmentMap = {
    0: ['a', 'b', 'c', 'd', 'e', 'f'],
    1: ['b', 'c'],
    2: ['a', 'b', 'g', 'e', 'd'],
    3: ['a', 'b', 'c', 'd', 'g'],
    4: ['f', 'g', 'b', 'c'],
    5: ['a', 'f', 'g', 'c', 'd'],
    6: ['a', 'f', 'e', 'd', 'c', 'g'],
    7: ['a', 'b', 'c'],
    8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    9: ['a', 'b', 'c', 'd', 'f', 'g']
  };
  const segmentRect = (segment, x, y) => {
    const rects = {
      a: [x + 5, y, 15, 4],
      b: [x + 19, y + 4, 4, 13],
      c: [x + 19, y + 21, 4, 13],
      d: [x + 5, y + 34, 15, 4],
      e: [x + 1, y + 21, 4, 13],
      f: [x + 1, y + 4, 4, 13],
      g: [x + 5, y + 17, 15, 4]
    };
    const [rx, ry, rw, rh] = rects[segment];
    return `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="2"/>`;
  };
  const noise = Array.from({ length: 9 }, (_, index) => {
    const x1 = crypto.randomInt(0, width);
    const y1 = crypto.randomInt(0, height);
    const x2 = crypto.randomInt(0, width);
    const y2 = crypto.randomInt(0, height);
    const alpha = 0.12 + (index % 4) * 0.05;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(24,94,152,${alpha.toFixed(2)})" stroke-width="${1 + (index % 2)}"/>`;
  }).join('');
  const digits = safeCode.split('').map((digit, index) => {
    const x = 16 + (index * 29);
    const y = 7 + crypto.randomInt(-1, 2);
    const rotate = crypto.randomInt(-9, 10);
    const segments = segmentMap[digit] || [];
    return `<g transform="rotate(${rotate} ${x + 12} ${y + 19})">${segments.map((segment) => segmentRect(segment, x, y)).join('')}</g>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Kode verifikasi">
  <rect width="100%" height="100%" rx="8" fill="#f8fafc"/>
  <path d="M0 41 C28 25, 55 49, 88 30 S144 15, 172 31" fill="none" stroke="#89c2f0" stroke-width="4" opacity=".65"/>
  ${noise}
  <g fill="#0f3358">${digits}</g>
</svg>`;
}

function createLoginVerificationChallenge() {
  cleanupLoginVerificationChallenges();
  const id = crypto.randomBytes(16).toString('hex');
  const code = randomLoginVerificationCode();
  const svg = loginVerificationSvg(code);
  loginVerificationChallenges.set(id, {
    code,
    attempts: 0,
    expiresAt: Date.now() + LOGIN_VERIFICATION_TTL_MS
  });
  return {
    id,
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    expiresInSeconds: Math.round(LOGIN_VERIFICATION_TTL_MS / 1000)
  };
}

function verifyLoginVerificationChallenge(id = '', input = '') {
  cleanupLoginVerificationChallenges();
  const key = String(id || '').trim();
  const challenge = loginVerificationChallenges.get(key);
  if (!challenge) {
    return { ok: false, error: 'Kode verifikasi kedaluwarsa, muat ulang kode' };
  }
  if (Number(challenge.expiresAt || 0) <= Date.now()) {
    loginVerificationChallenges.delete(key);
    return { ok: false, error: 'Kode verifikasi kedaluwarsa, muat ulang kode' };
  }
  const expected = String(challenge.code || '').trim().toUpperCase();
  const actual = String(input || '').trim().replace(/\s+/g, '').toUpperCase();
  if (!actual || actual !== expected) {
    challenge.attempts = Number(challenge.attempts || 0) + 1;
    if (challenge.attempts >= LOGIN_VERIFICATION_MAX_ATTEMPTS) {
      loginVerificationChallenges.delete(key);
      return { ok: false, error: 'Kode verifikasi salah, muat ulang kode' };
    }
    return { ok: false, error: 'Kode verifikasi salah' };
  }
  loginVerificationChallenges.delete(key);
  return { ok: true };
}

function sendBinary(res, status, body, contentType, filename = '') {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
    ...(filename ? { 'Content-Disposition': `attachment; filename="${String(filename).replace(/"/g, '')}"` } : {})
  });
  res.end(buffer);
}

function qrTextParam(value = '') {
  return String(value || '').trim().slice(0, 1000);
}

function normalizeWaProvider(provider = '') {
  const value = String(provider || '').trim().toLowerCase();
  if (['custom', 'standalone', 'self', 'sendiri', 'wa-sendiri', 'waha'].includes(value)) {
    return 'waha';
  }
  return 'waha';
}

function waProviderBaseUrl(provider = 'waha', baseUrl = '') {
  const normalized = normalizeWaProvider(provider);
  const typed = String(baseUrl || '').trim();
  return typed || WA_GATEWAY_PROVIDERS[normalized]?.baseUrl || WA_GATEWAY_PROVIDERS.waha.baseUrl;
}

function joinUrl(baseUrl = '', suffix = '') {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const pathSuffix = String(suffix || '').trim().replace(/^\/+/, '');
  return pathSuffix ? `${base}/${pathSuffix}` : base;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = WA_GATEWAY_HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();
    let payload = {};
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = { raw: text };
      }
    }
    if (!response.ok) {
      const message = payload.error || payload.message || payload.raw || `HTTP ${response.status}`;
      const error = new Error(String(message));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function notFound(res) {
  sendJson(res, 404, { error: 'Endpoint tidak ditemukan' });
}

function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

function unauthorized(res) {
  sendJson(res, 401, { error: 'Silakan login terlebih dahulu' }, {
    'Set-Cookie': auth.clearSessionCookie()
  });
}

function forbidden(res) {
  sendJson(res, 403, { error: 'Role user tidak memiliki akses untuk aksi ini' });
}

async function readBody(req, limitBytes = BODY_LIMIT_BYTES) {
  const { payload } = await readBodyWithRaw(req, limitBytes);
  return payload;
}

function parseRequestBody(raw = '', contentType = '') {
  if (!String(raw || '').trim()) {
    return {};
  }
  const type = String(contentType || '').toLowerCase();
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }
  return JSON.parse(raw);
}

async function readBodyWithRaw(req, limitBytes = BODY_LIMIT_BYTES) {
  const chunks = [];
  let size = 0;
  const maxBytes = Math.max(1024, Number(limitBytes || BODY_LIMIT_BYTES) || BODY_LIMIT_BYTES);

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error('Body terlalu besar');
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return { payload: {}, raw: '' };
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    return { payload: {}, raw };
  }

  return {
    payload: parseRequestBody(raw, req.headers['content-type'] || ''),
    raw
  };
}

function normalizeListQuery(url) {
  return {
    period: url.searchParams.get('period') || currentPeriod(),
    status: url.searchParams.get('status') || 'all',
    search: String(url.searchParams.get('search') || '').trim().toLowerCase()
  };
}

function filterSearch(items, search, fields) {
  if (!search) {
    return items;
  }

  return items.filter((item) => fields.some((field) => String(item[field] || '').toLowerCase().includes(search)));
}

function sortByDateDesc(items, field = 'createdAt') {
  return [...items].sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || '')));
}

function parseLocalTransactionTime(value) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  const raw = String(value || '').trim();
  if (!raw) return 0;

  const localDateTime = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(?::\d{2})?)$/);
  if (localDateTime) {
    const parsed = Date.parse(`${localDateTime[1]}T${localDateTime[2]}+08:00`);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = Date.parse(`${raw}T00:00:00+08:00`);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const localDisplay = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}:\d{2}(?::\d{2})?))?$/);
  if (localDisplay) {
    const [, day, month, year, time = '00:00:00'] = localDisplay;
    const parsed = Date.parse(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}+08:00`);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function reportTransactionTime(transaction = {}) {
  const candidates = [
    transaction.paidAt,
    transaction.paymentAt,
    transaction.submittedAt,
    transaction.submittedRaw,
    transaction.createdAt,
    transaction.updatedAt,
    transaction.date
  ];
  for (const candidate of candidates) {
    const timestamp = parseLocalTransactionTime(candidate);
    if (timestamp) return timestamp;
  }
  return 0;
}

function sortReportTransactionsNewestFirst(a, b) {
  return reportTransactionTime(b) - reportTransactionTime(a)
    || String(b.id || '').localeCompare(String(a.id || ''));
}

function movementDate(movement = {}) {
  const at = String(movement.at || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return at;
  const createdAt = String(movement.createdAt || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(createdAt) ? createdAt : '';
}

function movementTypeFilter(value) {
  const type = String(value || 'all').trim().toLowerCase();
  return ['all', 'in', 'out', 'adjust'].includes(type) ? type : 'all';
}

function stockMovementSummary(movements = []) {
  return movements.reduce((summary, movement) => {
    const quantity = Number(movement.quantity || 0);
    summary.total += 1;
    if (movement.type === 'in') {
      summary.inCount += 1;
      summary.inQuantity += quantity;
    } else if (movement.type === 'out') {
      summary.outCount += 1;
      summary.outQuantity += quantity;
    } else if (movement.type === 'adjust') {
      summary.adjustCount += 1;
      summary.adjustQuantity += quantity;
    }
    return summary;
  }, {
    total: 0,
    inCount: 0,
    inQuantity: 0,
    outCount: 0,
    outQuantity: 0,
    adjustCount: 0,
    adjustQuantity: 0
  });
}

function inventoryDirectory(items = []) {
  return new Map((items || []).map((item) => [item.id, item]));
}

function publicStockMovement(movement = {}, directory = new Map()) {
  const item = directory.get(movement.itemId) || {};
  return {
    ...movement,
    itemName: movement.itemName || item.name || '',
    unit: movement.unit || item.unit || 'unit',
    date: movementDate(movement)
  };
}

function sanitizeLogoUrl(value, fallback = '/fakenet-logo.png') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (raw.length <= LOGO_DATA_URL_LIMIT_BYTES && /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(raw)) {
    return raw.replace(/\s+/g, '');
  }
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const parsed = new URL(raw);
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.toString();
  } catch {
    return fallback;
  }
  return fallback;
}

function sanitizePublicUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw.slice(0, 200);
  try {
    const parsed = new URL(raw);
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.toString().slice(0, 200);
  } catch {
    return '';
  }
  return '';
}

function publicBranding(settings = {}) {
  return {
    businessName: String(settings.businessName || 'FAKE.NET Ops').trim() || 'FAKE.NET Ops',
    appSubtitle: String(settings.appSubtitle || 'ISP Ops').trim() || 'ISP Ops',
    logoUrl: sanitizeLogoUrl(settings.logoUrl),
    copyrightYear: new Date().getFullYear(),
    copyrightName: 'FAKE.NET',
    appVersion: APP_VERSION,
    buildVersion: APP_BUILD_VERSION,
    releaseDate: APP_RELEASE_DATE,
    loginVerificationEnabled: settings?.security?.loginVerificationEnabled !== false
  };
}

function appReleaseInfo() {
  return {
    version: APP_VERSION,
    buildVersion: APP_BUILD_VERSION,
    releaseDate: APP_RELEASE_DATE
  };
}

function publicSystemInfo() {
  return {
    app: packageInfo.name || 'fakenet-billing',
    description: packageInfo.description || '',
    version: APP_VERSION,
    buildVersion: APP_BUILD_VERSION,
    releaseDate: APP_RELEASE_DATE,
    updateCommand: APP_UPDATE_COMMAND
  };
}

function licenseStatusForStore(data = {}) {
  return license.publicLicenseStatus(data);
}

function licenseBlocksAccess(data = {}) {
  const status = licenseStatusForStore(data);
  return status.enforced && !status.active;
}

function publicAppSettings(settings = {}) {
  return {
    ...publicSettings(settings),
    appInfo: appReleaseInfo()
  };
}

function loginVerificationEnabled(settings = {}) {
  return settings?.security?.loginVerificationEnabled !== false;
}

function actorPayload(user = {}) {
  const name = user.name || user.username || '';
  const username = user.username || '';
  const role = user.role || '';
  return {
    actorName: name,
    actorUsername: username,
    actorRole: role,
    createdByName: name,
    createdByUsername: username,
    createdByRole: role,
    updatedByName: name,
    updatedByUsername: username,
    updatedByRole: role
  };
}

const RADBOOX_STALE_MS = 10 * 60 * 1000;

function envFlag(value, fallback = true) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['0', 'false', 'off', 'no', 'disabled'].includes(normalized)) return false;
  if (['1', 'true', 'on', 'yes', 'enabled'].includes(normalized)) return true;
  return fallback;
}

function radbooxAutoSyncIntervalMs() {
  const rawSeconds = process.env.RADBOOX_AUTO_SYNC_SECONDS || process.env.RADBOOX_AUTO_SYNC_INTERVAL_SECONDS;
  const rawMinutes = process.env.RADBOOX_AUTO_SYNC_MINUTES || process.env.RADBOOX_AUTO_SYNC_INTERVAL_MINUTES;
  const rawMs = process.env.RADBOOX_AUTO_SYNC_INTERVAL_MS;
  const seconds = rawMs
    ? Number(rawMs) / 1000
    : (rawSeconds
      ? Number(rawSeconds)
      : Number(rawMinutes) * 60);
  const safeSeconds = Number.isFinite(seconds) ? seconds : RADBOOX_AUTO_SYNC_DEFAULT_SECONDS;
  return Math.round(Math.min(RADBOOX_AUTO_SYNC_MAX_SECONDS, Math.max(RADBOOX_AUTO_SYNC_MIN_SECONDS, safeSeconds)) * 1000);
}

function standaloneMode(data = null) {
  const mode = String(data?.settings?.appMode || APP_MODE || '').toLowerCase();
  const source = String(data?.settings?.billingSource || BILLING_SOURCE || '').toLowerCase();
  return mode === 'standalone' || source === 'local';
}

const RADBOOX_AUTO_SYNC_ENABLED = !standaloneMode() && envFlag(process.env.RADBOOX_AUTO_SYNC, true);
const RADBOOX_AUTO_SYNC_INTERVAL_MS = radbooxAutoSyncIntervalMs();

function intervalLabel(ms) {
  const seconds = Math.round(Number(ms || 0) / 1000);
  if (seconds < 60) return `${seconds} detik`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} menit`;
}

function todayIso() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDateParam(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : todayIso();
}

function truthyQuery(value) {
  return ['1', 'true', 'yes', 'radboox'].includes(String(value || '').toLowerCase());
}

function paginationParams(url, defaultLimit = 10, maxLimit = 100, options = {}) {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const rawLimit = String(url.searchParams.get('limit') || '').trim().toLowerCase();
  const requestedLimit = rawLimit === 'all' && options.allowAll === true
    ? Number.MAX_SAFE_INTEGER
    : Number.parseInt(rawLimit || String(defaultLimit), 10) || defaultLimit;
  const limit = requestedLimit === Number.MAX_SAFE_INTEGER
    ? requestedLimit
    : Math.min(maxLimit, Math.max(1, requestedLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginationPayload(page, limit, total) {
  const totalPages = Math.max(1, Math.ceil(Number(total || 0) / Number(limit || 1)));
  const currentPage = Math.min(Math.max(1, Number(page || 1)), totalPages);
  return {
    page: currentPage,
    limit,
    total,
    totalPages,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages
  };
}

function normalizeCustomerStatusLocal(value) {
  const status = String(value || '').trim().toLowerCase();
  if (['active', 'aktif', 'enabled', ''].includes(status)) return 'active';
  if (['pending', 'unpaid', 'belum-bayar', 'belum bayar'].includes(status)) return 'pending';
  if (['isolated', 'isolir', 'suspend', 'suspended'].includes(status)) return 'isolated';
  if (['terminated', 'terminate', 'diberhentikan', 'inactive', 'disabled', 'disable', 'nonaktif'].includes(status)) return 'terminate';
  if (['removed', 'cabut'].includes(status)) return 'removed';
  return status;
}

function radiusStatusForCustomer(user = {}) {
  const status = String(user.status || '').trim().toLowerCase();
  if (['pending', 'unpaid', 'belum-bayar', 'belum bayar'].includes(status)) return 'pending';
  if (['isolated', 'isolir', 'suspend', 'suspended'].includes(status)) return 'isolated';
  if (['terminated', 'terminate', 'disabled', 'disable', 'inactive', 'nonaktif'].includes(status)) return 'terminate';
  return 'active';
}

function terminationSourceText(...values) {
  return values.map((value) => String(value || '').trim().toLowerCase()).find(Boolean) || '';
}

function billingManagedTerminationSource(value = '') {
  return ['billing', 'overdue', 'system', 'auto', 'invoice', 'payment'].includes(terminationSourceText(value));
}

function statusSeverity(status = '') {
  const normalized = normalizeCustomerStatusLocal(status);
  if (normalized === 'removed') return 4;
  if (normalized === 'terminate') return 3;
  if (normalized === 'isolated') return 2;
  if (normalized === 'active') return 1;
  return 0;
}

function strongestCustomerStatus(...statuses) {
  return statuses
    .map(normalizeCustomerStatusLocal)
    .filter(Boolean)
    .sort((a, b) => statusSeverity(b) - statusSeverity(a))[0] || 'active';
}

function customerKeys(customer = {}) {
  return [
    customer.id,
    customer.radiusUserId,
    customer.username,
    customer.code,
    customer.accountId,
    customer.internet,
    customer.userId
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
}

function radiusStatusResolver(data = {}) {
  const byKey = new Map();
  const add = (key, status) => {
    const cleanKey = String(key || '').trim().toLowerCase();
    if (!cleanKey) return;
    const next = normalizeCustomerStatusLocal(status);
    byKey.set(cleanKey, strongestCustomerStatus(byKey.get(cleanKey), next));
  };
  for (const user of data.radiusUsers || []) {
    const status = radiusStatusForCustomer(user);
    add(user.id, status);
    add(user.customerId, status);
    add(user.username, status);
  }
  return {
    byKey,
    statusForCustomer(customer = {}) {
      const keys = customerKeys(customer);
      const radiusStatuses = keys.map((key) => byKey.get(key)).filter(Boolean);
      return strongestCustomerStatus(customer.status, ...radiusStatuses);
    },
    statusForInvoice(invoice = {}, customer = {}) {
      const keys = [
        invoice.customerId,
        invoice.username,
        invoice.accountId,
        invoice.internet,
        ...customerKeys(customer)
      ];
      const radiusStatuses = keys.map((key) => byKey.get(String(key || '').trim().toLowerCase())).filter(Boolean);
      return strongestCustomerStatus(customer.status, invoice.customerStatus, ...radiusStatuses);
    },
    statusForRadiusUser(user = {}) {
      return radiusStatusForCustomer(user);
    }
  };
}

function findCustomerForRadiusUser(data = {}, radiusUser = {}) {
  const candidates = [
    radiusUser.customerId,
    radiusUser.id,
    radiusUser.username
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (!candidates.length) return null;
  return (data.customers || []).find((customer) => {
    return customerKeys(customer).some((key) => candidates.includes(key));
  }) || null;
}

function normalizeIndonesianPhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

function normalizeLocalPhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62') && digits.length >= 10) return `0${digits.slice(2)}`;
  if (digits.startsWith('8') && digits.length >= 9) return `0${digits}`;
  if (digits.startsWith('0')) return digits;
  return digits;
}

function customerPhoneKeys(customer = {}) {
  return [
    customer.phone,
    customer.whatsapp,
    customer.mobile,
    customer.telephone
  ].map(normalizeIndonesianPhone).filter(Boolean);
}

function findCustomerByPhone(data = {}, phone = '') {
  const target = normalizeIndonesianPhone(phone);
  if (!target) return null;
  return (data.customers || []).find((customer) => customerPhoneKeys(customer).includes(target)) || null;
}

function wifiKuSettings(data = {}) {
  const settings = data.settings?.wifiKu && typeof data.settings.wifiKu === 'object' ? data.settings.wifiKu : {};
  return {
    enabled: settings.enabled !== false,
    publicPath: String(settings.publicPath || '/wifiku').trim() || '/wifiku',
    requireOtp: settings.requireOtp !== false,
    otpTtlMinutes: clampInteger(settings.otpTtlMinutes, 1, 30, 5),
    sessionTtlHours: clampInteger(settings.sessionTtlHours, 1, 72, 12)
  };
}

function cleanupWifiKuAuth(now = Date.now()) {
  for (const [id, challenge] of wifiKuOtpChallenges.entries()) {
    if (!challenge || Number(challenge.expiresAt || 0) <= now) {
      wifiKuOtpChallenges.delete(id);
    }
  }
  for (const [token, session] of wifiKuSessions.entries()) {
    if (!session || Number(session.expiresAt || 0) <= now) {
      wifiKuSessions.delete(token);
    }
  }
}

function wifiKuTokenFromRequest(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function createWifiKuSession(data = {}, customer = {}) {
  const settings = wifiKuSettings(data);
  const token = crypto.randomBytes(32).toString('hex');
  wifiKuSessions.set(token, {
    customerId: customer.id,
    phone: normalizeIndonesianPhone(customer.phone || customer.whatsapp || ''),
    expiresAt: Date.now() + settings.sessionTtlHours * 60 * 60 * 1000
  });
  return token;
}

async function requireWifiKuSession(req, res) {
  cleanupWifiKuAuth();
  const token = wifiKuTokenFromRequest(req);
  const session = token ? wifiKuSessions.get(token) : null;
  if (!session) {
    sendJson(res, 401, { error: 'Sesi WifiKu tidak valid, login ulang' });
    return null;
  }
  const data = await loadStore();
  const settings = wifiKuSettings(data);
  if (!settings.enabled) {
    forbidden(res);
    return null;
  }
  const customer = (data.customers || []).find((item) => item.id === session.customerId);
  if (!customer) {
    wifiKuSessions.delete(token);
    sendJson(res, 401, { error: 'Pelanggan tidak ditemukan' });
    return null;
  }
  session.expiresAt = Date.now() + settings.sessionTtlHours * 60 * 60 * 1000;
  return { data, customer, session, token };
}

function radiusUserForCustomer(data = {}, customer = {}) {
  const keys = customerKeys(customer);
  return (data.radiusUsers || []).find((user) => {
    return keys.includes(String(user.customerId || '').trim().toLowerCase())
      || keys.includes(String(user.id || '').trim().toLowerCase())
      || keys.includes(String(user.username || '').trim().toLowerCase());
  }) || null;
}

function publicWifiKuCustomer(customer = {}, radiusUser = {}) {
  return {
    id: customer.id,
    memberId: customer.code || customer.accountId || customer.id || '',
    name: customer.name || customer.customerName || customer.username || '',
    username: radiusUser.username || customer.username || '',
    phone: normalizeLocalPhone(customer.phone || customer.whatsapp || ''),
    address: customer.address || '',
    status: customer.status || radiusUser.status || '',
    packageName: customer.packageName || '',
    dueDate: customer.dueDate || customer.nextDue || ''
  };
}

function wifiKuInvoiceMatchesCustomer(invoice = {}, customer = {}, radiusUser = {}) {
  const customerKeys = [
    customer.id,
    customer.code,
    customer.accountId,
    customer.username,
    radiusUser.customerId,
    radiusUser.username
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (!customerKeys.length) return false;
  const invoiceKeys = [
    invoice.customerId,
    invoice.accountId,
    invoice.username
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  return invoiceKeys.some((key) => customerKeys.includes(key));
}

function wifiKuBillingSummary(data = {}, customer = {}, radiusUser = {}, period = currentPeriod()) {
  const selectedPeriod = normalizePeriod(period);
  const invoices = (data.invoices || [])
    .filter((invoice) => invoiceBlocksPeriod(invoice))
    .filter((invoice) => invoiceCoversPeriod(invoice, selectedPeriod))
    .filter((invoice) => wifiKuInvoiceMatchesCustomer(invoice, customer, radiusUser))
    .sort((a, b) => {
      const priority = (invoice) => {
        const status = invoiceRuntimeStatus(invoice);
        if (['pending', 'overdue', 'unpaid'].includes(status)) return 0;
        if (status === 'paid') return 1;
        return 2;
      };
      return priority(a) - priority(b)
        || String(b.dueDate || b.createdAt || '').localeCompare(String(a.dueDate || a.createdAt || ''));
    });

  const periodLabel = periodDisplayText(selectedPeriod);
  if (!invoices.length) {
    return {
      exists: false,
      invoiceCount: 0,
      period: periodLabel,
      status: 'none',
      statusLabel: 'Tidak ada tagihan',
      message: `Tidak ada tagihan untuk periode ${periodLabel}.`,
      canPay: false,
      checkoutUrl: ''
    };
  }

  const invoice = invoices[0];
  const publicInvoice = publicPaymentGatewayInvoicePayload(data, invoice);
  const status = publicInvoice.status || invoiceRuntimeStatus(invoice);
  const paymentGatewayEnabled = data.settings?.paymentGateway?.enabled === true;
  const canPay = ['pending', 'overdue', 'unpaid'].includes(status)
    && publicInvoice.canPay !== false
    && paymentGatewayEnabled
    && Boolean(publicInvoice.reference);
  const paymentPath = paymentGatewayPaymentPath(data.settings || {});
  const checkoutUrl = publicInvoice.reference
    ? `${paymentPath}?id=${encodeURIComponent(publicInvoice.reference)}`
    : '';
  const statusLabel = status === 'paid'
    ? 'Sudah dibayar'
    : (status === 'overdue' ? 'Lewat tempo' : 'Belum dibayar');

  return {
    exists: true,
    invoiceCount: invoices.length,
    ...publicInvoice,
    period: publicInvoice.period || periodLabel,
    status,
    statusLabel,
    paymentGatewayEnabled,
    canPay,
    checkoutUrl: canPay ? checkoutUrl : '',
    message: status === 'paid'
      ? `Tagihan ${publicInvoice.period || periodLabel} sudah tercatat lunas.`
      : (canPay
        ? `Tagihan ${publicInvoice.period || periodLabel} belum dibayar.`
        : 'Tagihan ditemukan, tetapi pembayaran online belum tersedia. Hubungi admin layanan.')
  };
}

function usageRowForUsername(payload = {}, username = '') {
  const key = radiusSessionUsername(username);
  return (payload.rows || []).find((row) => radiusSessionUsername(row.usernameKey || row.username) === key) || {
    username,
    inputOctets: 0,
    outputOctets: 0,
    totalOctets: 0,
    upload: '0 B',
    download: '0 B',
    totalUsageText: '0 B',
    sessionCount: 0,
    lastSeenAt: ''
  };
}

async function radiusUsageDetailForUsername(username = '', period = currentPeriod(), limit = 40) {
  const selectedPeriod = normalizePeriod(period || currentPeriod());
  const cleanUsername = String(username || '').trim();
  const usagePayload = await freeradiusSessions.monthlyUsageByUsernames(cleanUsername ? [cleanUsername] : [], selectedPeriod);
  const usage = usageRowForUsername(usagePayload, cleanUsername);
  return {
    ok: usagePayload.ok !== false,
    source: usagePayload.source || 'freeradius-radacct',
    period: selectedPeriod,
    error: usagePayload.error || '',
    inputOctets: usage.inputOctets || 0,
    outputOctets: usage.outputOctets || 0,
    totalOctets: usage.totalOctets || 0,
    upload: usage.upload || '0 B',
    download: usage.download || '0 B',
    totalUsageText: usage.totalUsageText || '0 B',
    sessionCount: usage.sessionCount || 0,
    lastSeenAt: usage.lastSeenAt || ''
  };
}

async function wifiKuPortalPayload(data = {}, customer = {}, period = currentPeriod()) {
  const radiusUser = radiusUserForCustomer(data, customer) || {};
  const username = radiusUser.username || customer.username || '';
  const usage = await radiusUsageDetailForUsername(username, period, 40);
  let device = null;
  let genieError = '';
  if (genieAcs.configured(data.settings || {})) {
    const searchKeys = [
      customer.genieAcsDeviceId,
      customer.genieAcsSerialNumber,
      radiusUser.genieAcsDeviceId,
      radiusUser.genieAcsSerialNumber,
      username
    ].map((value) => String(value || '').trim()).filter(Boolean);
    for (const search of searchKeys) {
      try {
        device = await genieAcs.findDevice(data.settings || {}, search);
        if (device) break;
      } catch (error) {
        genieError = error.message || 'GenieACS tidak bisa dibaca';
        break;
      }
    }
  }
  return {
    ok: true,
    period: normalizePeriod(period),
    customer: publicWifiKuCustomer(customer, radiusUser),
    billing: wifiKuBillingSummary(data, customer, radiusUser, period),
    usage,
    device,
    genieAcs: {
      enabled: genieAcs.normalizeSettings(data.settings || {}).enabled,
      configured: genieAcs.configured(data.settings || {}),
      error: genieError
    }
  };
}

function resolveGenieAcsNas(data = {}, row = {}, radiusUser = {}) {
  const direct = radiusFindNas(data, radiusUser.nasId || radiusUser.nasName || radiusUser.nas || row.nasId || row.nasName || row.nasIpAddress);
  if (direct) return direct;

  const tags = Array.isArray(row.tags)
    ? row.tags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const entries = freeradius.radiusNasEntries(data, { includeUnconfigured: true });
  if (tags.length) {
    const tagged = entries.find((nas) => {
      return [nas.id, nas.name, nas.address, nas.site].some((value) => tags.includes(String(value || '').trim().toLowerCase()));
    });
    if (tagged) return tagged;
  }

  const activeSiteNas = entries.filter((nas) => nas.active !== false && nas.source === 'site');
  return activeSiteNas.length === 1 ? activeSiteNas[0] : {};
}

async function enrichGenieAcsRowsWithLocalData(data = {}, rows = [], period = currentPeriod()) {
  void period;
  const customers = radiusCustomerDirectory(data);
  const usersByUsername = radiusUserByUsername(data);
  return rows.map((row) => {
    const radiusUser = usersByUsername.get(radiusSessionUsername(row.username)) || {};
    const customer = customers.get(radiusUser.customerId) || findCustomerForRadiusUser(data, radiusUser) || {};
    const nas = resolveGenieAcsNas(data, row, radiusUser);
    const acsIpAddress = row.ipAddress || row.pppoeIpAddress || '';
    return {
      ...row,
      customerId: customer.id || '',
      customerName: customer.name || customer.customerName || radiusUser.customerName || '',
      phone: normalizeLocalPhone(customer.phone || customer.whatsapp || ''),
      address: customer.address || '',
      radiusStatus: radiusUser.status || customer.status || '',
      packageName: customer.packageName || '',
      nasName: nas.name || radiusUser.nasName || row.nasName || '',
      nasIpAddress: nas.address || row.nasIpAddress || '',
      ipAddress: acsIpAddress,
      framedIpAddress: acsIpAddress,
      staticIp: radiusUser.staticIp || '',
      sessionOnline: false,
      sessionSource: 'genieacs',
      usage: {
        inputOctets: 0,
        outputOctets: 0,
        totalOctets: 0,
        upload: '0 B',
        download: '0 B',
        totalUsageText: '0 B'
      }
    };
  });
}

function dataWithResolvedCustomerStatuses(data = {}) {
  const resolver = radiusStatusResolver(data);
  return {
    ...data,
    customers: (data.customers || []).map((customer) => ({
      ...customer,
      status: resolver.statusForCustomer(customer)
    }))
  };
}

function reconcileRadiusCustomerStatuses(data = {}) {
  for (const user of data.radiusUsers || []) {
    syncRadiusCustomerStatus(data, user);
  }
  return data;
}

function localBillingSites(data = {}) {
  const sites = new Map();
  (data.monitoringTargets || [])
    .filter((target) => target.status !== 'inactive')
    .forEach((target) => {
      sites.set(String(target.id), {
        id: String(target.id),
        name: target.name || target.location || target.id,
        location: target.location || ''
      });
    });
  (data.customers || []).forEach((customer) => {
    const siteName = String(customer.site || customer.siteName || customer.nas || '').trim();
    if (!siteName) return;
    const id = siteName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || siteName;
    if (!sites.has(id)) {
      sites.set(id, { id, name: siteName, location: '' });
    }
  });
  return [...sites.values()];
}

function invoiceCoversPeriod(invoice = {}, period = currentPeriod()) {
  return invoiceCoveredPeriods(invoice).includes(normalizePeriod(period));
}

function invoiceCoverageText(invoice = {}) {
  const periods = invoiceCoveredPeriods(invoice);
  if (!periods.length) return normalizePeriod(invoice.period || currentPeriod());
  return periods.length > 1 ? `${periods[0]} s/d ${periods[periods.length - 1]}` : periods[0];
}

function localBillingInvoiceRows(data = {}, period = currentPeriod()) {
  const selectedPeriod = normalizePeriod(period);
  const customers = new Map((data.customers || []).map((customer) => [customer.id, customer]));
  const resolver = radiusStatusResolver(data);
  const paymentsByInvoice = new Map();
  for (const payment of activePayments(data)) {
    const invoiceId = String(payment.invoiceId || '');
    if (!invoiceId) continue;
    const current = paymentsByInvoice.get(invoiceId);
    if (!current || String(payment.createdAt || payment.paidAt || '') > String(current.createdAt || current.paidAt || '')) {
      paymentsByInvoice.set(invoiceId, payment);
    }
  }
  return (data.invoices || [])
    .filter((invoice) => invoiceCoversPeriod(invoice, selectedPeriod))
    .map((invoice) => {
      const customer = customers.get(invoice.customerId) || {};
      const payment = paymentsByInvoice.get(invoice.id) || {};
      const storedInvoiceNo = invoice.externalId || invoice.invoiceNo || invoice.id;
      const publicInvoiceNo = displayBillingInvoiceNo(storedInvoiceNo);
      const runtimeStatus = invoiceRuntimeStatus(invoice);
      const customerStatus = resolver.statusForInvoice(invoice, customer);
      const siteName = customer.site || customer.siteName || customer.nas || invoice.siteName || '';
      const siteId = String(siteName || 'default').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default';
      return {
        ...invoice,
        period: selectedPeriod,
        originalPeriod: invoice.period || '',
        coverageText: invoiceCoverageText(invoice),
        invoiceId: invoice.id,
        reminderId: invoice.id,
        radbooxInvoiceId: '',
        invoiceNo: publicInvoiceNo,
        externalId: publicInvoiceNo,
        legacyInvoiceNo: storedInvoiceNo,
        customerName: invoice.customerName || customer.name || customer.username || '-',
        accountId: customer.code || invoice.username || customer.username || '',
        username: invoice.username || customer.username || '',
        phone: normalizeLocalPhone(customer.phone || customer.whatsapp || ''),
        address: customer.address || '',
        item: invoice.packageName || invoice.notes || customer.packageName || '',
        subscribe: invoice.packageName || customer.packageName || '',
        siteId,
        siteName,
        nas: customer.nas || '',
        amount: Number(invoice.amount || 0),
        status: runtimeStatus === 'pending' ? 'unpaid' : runtimeStatus,
        rawStatus: invoice.status || '',
        customerStatus,
        serviceStatus: customerStatus,
        isIsolated: customerStatus === 'isolated',
        dueDate: invoice.dueDate || '',
        invoiceDate: invoice.createdAt || '',
        lastActiveAt: customer.lastActiveAt || '',
        paidAt: invoice.paidAt || payment.paidAt || '',
        paymentMethod: invoice.paymentMethod || payment.method || '',
        paidByName: invoice.paidByName || payment.createdByName || payment.admin || '',
        paidByUsername: invoice.paidByUsername || payment.createdByUsername || ''
      };
    });
}

function localBillingMonitorPayload(data = {}, query = {}) {
  const period = query.period || currentPeriod();
  const selectedStatus = String(query.status || 'all').toLowerCase();
  const selectedCustomerStatus = String(query.customerStatus || 'all').toLowerCase();
  const selectedSite = String(query.site || 'all');
  const search = String(query.search || '').trim().toLowerCase();
  const sites = localBillingSites(data);
  const allRows = localBillingInvoiceRows(data, period).filter((invoice) => invoice.status !== 'cancelled');
  const periodRows = [...allRows];
  let rows = [...allRows];

  if (selectedStatus !== 'all') {
    rows = rows.filter((invoice) => invoice.status === selectedStatus || (selectedStatus === 'unpaid' && invoice.status === 'pending'));
  }
  if (selectedCustomerStatus !== 'all') {
    rows = rows.filter((invoice) => invoice.customerStatus === selectedCustomerStatus);
  }
  if (selectedSite !== 'all') {
    rows = rows.filter((invoice) => invoice.siteId === selectedSite || invoice.siteName === selectedSite);
  }
  if (search) {
    rows = rows.filter((invoice) => [
      invoice.customerName,
      invoice.accountId,
      invoice.username,
      invoice.phone,
      invoice.address,
      invoice.invoiceNo,
      invoice.externalId,
      invoice.siteName
    ].some((value) => String(value || '').toLowerCase().includes(search)));
  }

  const paidRows = periodRows.filter((invoice) => invoice.status === 'paid');
  const unpaidRows = periodRows.filter((invoice) => ['unpaid', 'pending'].includes(invoice.status));
  const overdueRows = periodRows.filter((invoice) => invoice.status === 'overdue');
  const summary = {
    total: periodRows.length,
    totalAmount: periodRows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    paid: paidRows.length,
    paidAmount: paidRows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    periodPaidCount: paidRows.length,
    periodPaidAmount: paidRows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    unpaid: unpaidRows.length,
    unpaidAmount: unpaidRows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    overdue: overdueRows.length,
    overdueAmount: overdueRows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    filteredCount: rows.length,
    filteredAmount: rows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
  };

  return {
    ok: true,
    source: 'local',
    sites,
    summary,
    rows
  };
}

function radiusPagination(rows = [], page = 1, limit = 10) {
  const pagination = paginationPayload(page, limit, rows.length);
  const offset = (pagination.page - 1) * limit;
  return {
    rows: rows.slice(offset, offset + limit),
    pagination
  };
}

function radiusUiStatus(status = '') {
  const normalized = String(status || '').toLowerCase();
  if (['isolated', 'isolir', 'suspend', 'suspended'].includes(normalized)) return 'suspend';
  if (['disabled', 'inactive'].includes(normalized)) return 'disabled';
  if (['terminate', 'terminated'].includes(normalized)) return 'terminate';
  return 'active';
}

function radiusProfileDirectory(data = {}) {
  return new Map((data.radiusProfiles || []).map((profile) => [profile.id, profile]));
}

function radiusNasDirectory(data = {}) {
  return new Map(freeradius.radiusNasEntries(data, { includeUnconfigured: true }).map((nas) => [nas.id, nas]));
}

function radiusNasByAddress(data = {}) {
  return new Map(freeradius.radiusNasEntries(data, { includeUnconfigured: true }).map((nas) => [String(nas.address || '').toLowerCase(), nas]));
}

function radiusCustomerDirectory(data = {}) {
  return new Map((data.customers || []).map((customer) => [customer.id, customer]));
}

function radiusSessionUsername(value = '') {
  return String(value || '').trim().toLowerCase();
}

function radiusActiveSessionMap(sessions = []) {
  const map = new Map();
  for (const session of sessions) {
    const key = radiusSessionUsername(session.username);
    if (!key || map.has(key)) continue;
    map.set(key, session);
  }
  return map;
}

function radiusUserByUsername(data = {}) {
  const map = new Map();
  for (const user of data.radiusUsers || []) {
    const key = radiusSessionUsername(user.username);
    if (key) map.set(key, user);
  }
  return map;
}

function radiusSessionServiceType(data = {}, session = {}, user = null) {
  if (user?.serviceType) return user.serviceType;
  const framedProtocol = String(session.framedProtocol || '').trim().toLowerCase();
  const serviceType = String(session.serviceType || '').trim().toLowerCase();
  const nasPortType = String(session.nasPortType || '').trim().toLowerCase();
  if (framedProtocol === 'ppp' || serviceType === 'framed-user' || nasPortType.includes('ppp')) return 'pppoe';
  return 'hotspot';
}

function radiusFindProfile(data = {}, value = '', serviceType = '') {
  const needle = String(value || '').trim().toLowerCase();
  if (!needle) return null;
  return (data.radiusProfiles || []).find((profile) => {
    const typeOk = !serviceType || profile.serviceType === serviceType;
    return typeOk && [profile.id, profile.name].some((item) => String(item || '').toLowerCase() === needle);
  }) || null;
}

function radiusFindNas(data = {}, value = '') {
  const needle = String(value || '').trim().toLowerCase();
  if (!needle) return null;
  return freeradius.radiusNasEntries(data, { includeUnconfigured: true }).find((nas) => {
    return [nas.id, nas.name, nas.address].some((item) => String(item || '').toLowerCase() === needle);
  }) || null;
}

function radiusProfileRowsLocal(data = {}, serviceType = 'pppoe') {
  return (data.radiusProfiles || [])
    .filter((profile) => profile.serviceType === serviceType)
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      group: profile.groupName || profile.name || (serviceType === 'hotspot' ? 'Hotspot' : 'PPP-DHCP'),
      groupName: profile.groupName || profile.name || '',
      useMikrotikProfile: profile.useMikrotikProfile === true || (Boolean(profile.mikrotikGroup) && !profile.rateLimit),
      mikrotikGroup: profile.mikrotikGroup || '',
      price: profile.price || 0,
      rateLimit: profile.rateLimit || '',
      burstLimit: profile.burstLimit || '',
      burstThreshold: profile.burstThreshold || '',
      burstTime: profile.burstTime || '',
      minRate: profile.minRate || '',
      priority: profile.priority || 8,
      validity: profile.validity || '',
      validitySeconds: profile.validitySeconds || 0,
      quota: profile.quota || '',
      quotaBytes: profile.quotaBytes || 0,
      sharedUsers: profile.sharedUsers || 1,
      expiredMode: profile.expiredMode || 'none',
      triggerCoa: true,
      rateLimitText: freeradius.mikrotikRateLimit(profile),
      status: profile.active === false ? 'disabled' : 'active',
      note: profile.note || '',
      updatedAt: profile.updatedAt || profile.createdAt || ''
    }));
}

function defaultHotspotVoucherTemplate() {
  const now = new Date().toISOString();
  return {
    id: 'default',
    name: 'Voucher Standar',
    title: 'Hotspot Voucher',
    subtitle: '',
    footer: 'Simpan voucher sampai masa aktif habis.',
    loginLabel: 'Link login',
    showPrice: true,
    showQr: true,
    active: true,
    editable: true,
    createdAt: now,
    updatedAt: now
  };
}

function hotspotVoucherTemplates(data = {}) {
  const rows = Array.isArray(data.radiusHotspotTemplates) ? data.radiusHotspotTemplates : [];
  return rows.length ? rows : [defaultHotspotVoucherTemplate()];
}

function radiusTemplateRowsLocal(data = {}) {
  return hotspotVoucherTemplates(data).map((template) => ({
    id: template.id || 'default',
    name: template.name || 'Voucher Standar',
    title: template.title || 'Hotspot Voucher',
    subtitle: template.subtitle || '',
    footer: template.footer || '',
    loginLabel: template.loginLabel || 'Link login',
    showPrice: template.showPrice !== false,
    showQr: template.showQr !== false,
    active: template.active !== false,
    editable: template.editable !== false,
    status: template.active === false ? 'disabled' : 'active',
    updatedAt: template.updatedAt || template.createdAt || ''
  }));
}

function hotspotVoucherTemplatePayload(payload = {}, current = {}) {
  return {
    name: String(payload.name || current.name || 'Voucher Standar').trim().slice(0, 80) || 'Voucher Standar',
    title: String(payload.title || current.title || 'Hotspot Voucher').trim().slice(0, 80) || 'Hotspot Voucher',
    subtitle: String(payload.subtitle || current.subtitle || '').trim().slice(0, 80),
    footer: String(payload.footer || current.footer || '').trim().slice(0, 180),
    loginLabel: String(payload.loginLabel || current.loginLabel || 'Link login').trim().slice(0, 40) || 'Link login',
    showPrice: payload.showPrice !== false,
    showQr: payload.showQr !== false,
    active: payload.active !== false,
    editable: true
  };
}

function ensureHotspotVoucherTemplateStore(data = {}) {
  if (!Array.isArray(data.radiusHotspotTemplates) || !data.radiusHotspotTemplates.length) {
    data.radiusHotspotTemplates = [defaultHotspotVoucherTemplate()];
  }
  return data.radiusHotspotTemplates;
}

function upsertHotspotVoucherTemplate(data = {}, id = '', payload = {}, actor = {}) {
  const templates = ensureHotspotVoucherTemplateStore(data);
  const now = new Date().toISOString();
  const cleanId = String(id || payload.id || '').trim();
  const index = cleanId ? templates.findIndex((template) => String(template.id) === cleanId) : -1;
  if (index >= 0) {
    templates[index] = {
      ...templates[index],
      ...hotspotVoucherTemplatePayload(payload, templates[index]),
      id: templates[index].id,
      updatedAt: now,
      updatedBy: actor?.name || actor?.username || 'Sistem'
    };
    return templates[index];
  }
  const item = {
    id: cleanId || createId('hvt'),
    ...hotspotVoucherTemplatePayload(payload),
    createdAt: now,
    updatedAt: now,
    updatedBy: actor?.name || actor?.username || 'Sistem'
  };
  templates.push(item);
  return item;
}

function deleteHotspotVoucherTemplate(data = {}, id = '') {
  const templates = ensureHotspotVoucherTemplateStore(data);
  const index = templates.findIndex((template) => String(template.id) === String(id || ''));
  if (index === -1) throw new Error('Template voucher tidak ditemukan');
  if (templates[index].id === 'default' || templates.length <= 1) {
    templates[index].active = false;
    templates[index].updatedAt = new Date().toISOString();
    return templates[index];
  }
  return templates.splice(index, 1)[0];
}

function radiusNasRowsLocal(data = {}) {
  return freeradius.radiusNasEntries(data, { includeUnconfigured: true }).map((nas) => ({
    id: nas.id,
    name: nas.name,
    ipAddress: nas.address,
    address: nas.address,
    timezone: nas.site || '',
    site: nas.site || '',
    connected: nas.active !== false,
    source: nas.source || 'site',
    credentialStored: Boolean(nas.secret),
    status: nas.active === false ? 'disabled' : 'active',
    updatedAt: nas.updatedAt || nas.createdAt || ''
  }));
}

function radiusUserRowsLocal(data = {}, serviceType = 'pppoe', sessionsByUsername = new Map()) {
  const profiles = radiusProfileDirectory(data);
  const nasMap = radiusNasDirectory(data);
  const customers = radiusCustomerDirectory(data);
  return (data.radiusUsers || [])
    .filter((user) => user.serviceType === serviceType)
    .map((user) => {
      const profile = profiles.get(user.profileId) || {};
      const nas = nasMap.get(user.nasId) || {};
      const customer = customers.get(user.customerId) || {};
      const session = sessionsByUsername.get(radiusSessionUsername(user.username)) || null;
      return {
        id: user.id,
        username: user.username,
        customerId: user.customerId || '',
        customerName: customer.name || user.customerName || '',
        owner: customer.name || '',
        profile: profile.name || '',
        profileId: profile.id || user.profileId || '',
        nas: nas.name || '',
        nasId: nas.id || user.nasId || '',
        site: nas.site || customer.site || '',
        ipAddress: session?.framedIpAddress || user.staticIp || '',
        sessionIpAddress: session?.framedIpAddress || '',
        staticIp: user.staticIp || '',
        macAddress: session?.callingStationId || user.callerId || '',
        callerId: user.callerId || '',
        status: radiusUiStatus(user.status),
        rawStatus: user.status || 'active',
        password: user.password || '',
        internetStatus: session ? 'online' : 'offline',
        sessionOnline: Boolean(session),
        sessionId: session?.sessionId || '',
        startedAt: session?.startedAt || '',
        uptime: session?.uptime || '',
        upload: session?.upload || '',
        download: session?.download || '',
        usageText: session?.usageText || '',
        totalUsageText: session?.totalUsageText || session?.usageText || '',
        usageNote: session?.usageNote || '',
        usageSource: session?.usageSource || '',
        isolatedAt: user.isolatedAt || '',
        isolationSource: user.isolationSource || '',
        isolationReason: user.isolationReason || '',
        isolatedByName: user.isolatedByName || '',
        isolatedByUsername: user.isolatedByUsername || '',
        isolatedByRole: user.isolatedByRole || '',
        terminatedAt: user.terminatedAt || '',
        validUntil: user.validUntil || '',
        voucherMode: user.voucherMode || '',
        voucherBatchId: user.voucherBatchId || '',
        onlineOrderId: user.onlineOrderId || '',
        onlineOrderReference: user.onlineOrderReference || '',
        paymentStatus: user.paymentStatus || '',
        amount: user.amount || 0,
        paidAt: user.paidAt || '',
        price: profile.price || 0,
        service: user.accessType || (serviceType === 'hotspot' ? 'Hotspot' : 'PPPoE'),
        type: user.accessType || (serviceType === 'hotspot' ? 'Hotspot' : 'PPPoE'),
        server: nas.name || 'all',
        createdByName: user.createdByName || '',
        createdByUsername: user.createdByUsername || '',
        createdByRole: user.createdByRole || '',
        updatedByName: user.updatedByName || user.updatedBy || '',
        updatedByUsername: user.updatedByUsername || '',
        updatedByRole: user.updatedByRole || '',
        updatedBy: user.updatedBy || '',
        updatedAt: user.updatedAt || user.createdAt || '',
        createdAt: user.createdAt || '',
        note: user.note || ''
      };
    });
}

function radiusSessionRowsLocal(data = {}, serviceType = 'pppoe', sessions = []) {
  const profiles = radiusProfileDirectory(data);
  const nasMap = radiusNasDirectory(data);
  const nasAddressMap = radiusNasByAddress(data);
  const customers = radiusCustomerDirectory(data);
  const usersByUsername = radiusUserByUsername(data);
  return sessions
    .map((session) => {
      const user = usersByUsername.get(radiusSessionUsername(session.username)) || null;
      const resolvedServiceType = radiusSessionServiceType(data, session, user);
      if (resolvedServiceType !== serviceType) return null;
      const profile = user ? (profiles.get(user.profileId) || {}) : {};
      const nas = (user && nasMap.get(user.nasId)) || nasAddressMap.get(String(session.nasIpAddress || '').toLowerCase()) || {};
      const customer = user ? (customers.get(user.customerId) || {}) : {};
      const suppressedDuplicateCount = Number(session.suppressedDuplicateCount || 0);
      const duplicateNote = suppressedDuplicateCount > 0 ? `${suppressedDuplicateCount} duplicate session disembunyikan` : '';
      const usageNote = [session.usageNote || '', duplicateNote].filter(Boolean).join(' · ');
      return {
        id: session.id || session.uniqueId || `${session.username}-${session.startedAt}`,
        username: session.username,
        customerId: user?.customerId || '',
        acctSessionId: session.sessionId || '',
        sessionId: session.sessionId || '',
        acctUniqueId: session.uniqueId || '',
        customerName: customer.name || user?.customerName || '',
        owner: customer.name || '',
        profile: profile.name || '',
        profileId: profile.id || user?.profileId || '',
        nas: nas.name || session.nasIpAddress || '',
        nasIpAddress: session.nasIpAddress || nas.address || '',
        nasId: nas.id || user?.nasId || '',
        nasPortId: session.nasPortId || '',
        nasPortType: session.nasPortType || '',
        site: nas.site || customer.site || '',
        ipAddress: session.framedIpAddress || user?.staticIp || '',
        framedIpAddress: session.framedIpAddress || user?.staticIp || '',
        macAddress: session.callingStationId || user?.callerId || '',
        callingStationId: session.callingStationId || user?.callerId || '',
        calledStationId: session.calledStationId || '',
        status: 'online',
        rawStatus: 'online',
        internetStatus: 'online',
        sessionOnline: true,
        startedAt: session.startedAt || '',
        updatedAt: session.updatedAt || session.startedAt || '',
        uptime: session.uptime || '',
        upload: session.upload || '',
        download: session.download || '',
        usageText: session.usageText || '',
        totalUsageText: session.totalUsageText || session.usageText || '',
        usageNote,
        usageSource: session.usageSource || '',
        duplicateCount: Number(session.duplicateCount || 1),
        suppressedDuplicateCount,
        service: user?.accessType || (serviceType === 'hotspot' ? 'Hotspot' : 'PPPoE'),
        type: user?.accessType || (serviceType === 'hotspot' ? 'Hotspot' : 'PPPoE'),
        server: nas.name || session.nasIpAddress || 'all',
        voucherBatchId: user?.voucherBatchId || '',
        onlineOrderId: user?.onlineOrderId || '',
        onlineOrderReference: user?.onlineOrderReference || '',
        createdByName: user?.createdByName || '',
        createdByUsername: user?.createdByUsername || '',
        createdByRole: user?.createdByRole || '',
        updatedByName: user?.updatedByName || user?.updatedBy || '',
        updatedByUsername: user?.updatedByUsername || '',
        updatedByRole: user?.updatedByRole || '',
        updatedBy: user?.updatedBy || '',
        note: ''
      };
    })
    .filter(Boolean);
}

function radiusFilterRows(rows = [], query = {}) {
  const search = String(query.search || '').trim().toLowerCase();
  const nas = String(query.nas || '').trim().toLowerCase();
  const status = String(query.status || '').trim().toLowerCase();
  const profile = String(query.profile || '').trim().toLowerCase();
  const internet = String(query.internet || query.online || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (nas && ![row.nas, row.nasId, row.ipAddress, row.site].some((value) => String(value || '').toLowerCase() === nas)) return false;
    if (status && radiusUiStatus(row.status) !== radiusUiStatus(status)) return false;
    if (profile && ![row.profile, row.profileId].some((value) => String(value || '').toLowerCase() === profile)) return false;
    if (['online', 'offline'].includes(internet)) {
      const rowInternet = row.sessionOnline === true || String(row.internetStatus || '').toLowerCase() === 'online' ? 'online' : 'offline';
      if (rowInternet !== internet) return false;
    }
    if (search && ![
      row.username,
      row.customerName,
      row.owner,
      row.profile,
      row.nas,
      row.site,
      row.ipAddress,
      row.macAddress,
      row.name,
      row.rateLimit,
      row.rateLimitText,
      row.burstLimit,
      row.burstThreshold,
      row.minRate,
      row.mikrotikGroup,
      row.groupName
    ].some((value) => String(value || '').toLowerCase().includes(search))) return false;
    return true;
  });
}

function radiusSummaryInfo(rows = []) {
  return {
    total: rows.length,
    active: rows.filter((row) => radiusUiStatus(row.status) === 'active').length,
    online: rows.filter((row) => row.sessionOnline === true || String(row.internetStatus || '').toLowerCase() === 'online').length,
    suspend: rows.filter((row) => radiusUiStatus(row.status) === 'suspend').length,
    terminate: rows.filter((row) => radiusUiStatus(row.status) === 'terminate').length
  };
}

async function radiusPayloadLocal(data = {}, section = 'ppp-dhcp', query = {}) {
  const serviceType = section === 'hotspot' ? 'hotspot' : 'pppoe';
  const tab = String(query.tab || 'users').trim();
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 10);
  let sessionPayload = { ok: true, rows: [] };
  if (['users', 'sessions'].includes(tab)) {
    sessionPayload = await freeradiusSessions.activeSessions({ limit: 2000 });
  }
  const sessions = Array.isArray(sessionPayload.rows) ? sessionPayload.rows : [];
  const sessionsByUsername = radiusActiveSessionMap(sessions);
  let rows;
  if (tab === 'profiles') {
    rows = radiusProfileRowsLocal(data, serviceType);
  } else if (tab === 'sessions') {
    rows = radiusSessionRowsLocal(data, serviceType, sessions);
  } else if (tab === 'templates') {
    rows = serviceType === 'hotspot' ? radiusTemplateRowsLocal(data) : [];
  } else {
    rows = radiusUserRowsLocal(data, serviceType, sessionsByUsername);
  }
  if (section === 'hotspot' && ['users', 'sessions'].includes(tab) && query.viewer) {
    rows = rows.filter((row) => resellerHotspotVoucherRowVisible(row, query.viewer));
  }
  const filterQuery = ['users', 'sessions'].includes(tab)
    ? query
    : { ...query, nas: '', profile: '', internet: '' };
  rows = radiusFilterRows(rows, filterQuery);
  const paged = radiusPagination(rows, page, limit);
  return {
    ok: sessionPayload.ok !== false,
    source: tab === 'sessions' ? 'freeradius-radacct' : 'freeradius-local',
    section,
    tab,
    rows: paged.rows,
    topInfo: radiusSummaryInfo(rows),
    pagination: paged.pagination,
    sessionSource: sessionPayload.source || 'freeradius-radacct',
    sessionError: sessionPayload.ok === false ? sessionPayload.error || 'Session FreeRADIUS tidak bisa dibaca' : '',
    checkedAt: new Date().toISOString()
  };
}

function radiusUserPayload(payload = {}, serviceType = 'pppoe', data = {}) {
  const profile = radiusFindProfile(data, payload.profileId || payload.profile, serviceType);
  const nas = radiusFindNas(data, payload.nasId || payload.nas || payload.routerNas);
  const accessType = payload.type || payload.accessType || (serviceType === 'hotspot' ? 'Hotspot' : 'PPPoE');
  const paymentStatus = normalizeRadiusUserPaymentStatus(payload.paymentStatus);
  const firstInvoiceUnpaid = serviceType === 'pppoe'
    && payloadEnabled(payload.addToMember)
    && String(payload.memberInvoiceStatus || payload.invoiceStatus || '').trim().toLowerCase() === 'unpaid';
  const username = String(payload.username || '').trim()
    || (String(accessType).toLowerCase() === 'dhcp'
      ? String(payload.macAddress || payload.callerId || payload.memberCode || payload.memberPhone || '').trim()
      : '');
  return {
    username,
    password: String(accessType).toLowerCase() === 'dhcp' ? '' : payload.password,
    serviceType,
    accessType,
    profileId: profile?.id || '',
    nasId: nas?.id || '',
    staticIp: payload.staticIp || payload.ipAddress || '',
    callerId: payload.callerId || payload.macAddress || '',
    status: firstInvoiceUnpaid ? 'pending' : (payload.status || (payload.disabled ? 'disabled' : 'active')),
    isolatedAt: payload.isolatedAt || payload.isolationDate || '',
    isolationSource: payload.isolationSource || payload.isolatedSource || '',
    isolationReason: payload.isolationReason || payload.suspendReason || '',
    isolatedByName: payload.isolatedByName || '',
    isolatedByUsername: payload.isolatedByUsername || '',
    isolatedByRole: payload.isolatedByRole || '',
    terminatedAt: payload.terminatedAt || '',
    terminationSource: payload.terminationSource || payload.terminatedSource || '',
    terminationReason: payload.terminationReason || payload.terminateReason || '',
    terminatedByName: payload.terminatedByName || '',
    terminatedByUsername: payload.terminatedByUsername || '',
    terminatedByRole: payload.terminatedByRole || '',
    validUntil: payload.validUntil || '',
    voucherMode: payload.voucherMode || '',
    voucherBatchId: payload.voucherBatchId || '',
    hotspotServer: payload.hotspotServer || payload.server || '',
    paymentStatus,
    paidAt: payload.paidAt || '',
    amount: paymentStatus === 'free' ? 0 : (payload.amount || payload.price || ''),
    activeDate: payload.memberActiveDate || payload.activeDate || '',
    note: payload.note || payload.notes || ''
  };
}

function normalizeRadiusUserPaymentStatus(value = '') {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'free') return 'free';
  if (status === 'unpaid') return 'unpaid';
  if (status === 'paid') return 'paid';
  return status ? 'paid' : '';
}

function radiusProfilePayload(payload = {}, serviceType = 'pppoe') {
  const useMikrotikProfile = payloadEnabled(payload.useMikrotikProfile)
    || (!payload.rateLimit && !payload.burstLimit && !payload.burstThreshold && !payload.burstTime && !payload.minRate && Boolean(payload.mikrotikGroup || payload.routerProfile));
  return {
    name: payload.name || payload.profile || payload.group,
    groupName: payload.groupName || payload.group || payload.name || payload.profile,
    useMikrotikProfile,
    mikrotikGroup: useMikrotikProfile ? (payload.mikrotikGroup || payload.routerProfile || '') : '',
    serviceType,
    rateLimit: useMikrotikProfile ? '' : (payload.rateLimit || payload.limit || ''),
    burstLimit: useMikrotikProfile ? '' : (payload.burstLimit || ''),
    burstThreshold: useMikrotikProfile ? '' : (payload.burstThreshold || ''),
    burstTime: useMikrotikProfile ? '' : (payload.burstTime || ''),
    minRate: useMikrotikProfile ? '' : (payload.minRate || ''),
    priority: useMikrotikProfile ? 8 : (payload.priority || 8),
    validity: payload.validity || '',
    validitySeconds: payload.validitySeconds || '',
    quota: payload.quota || '',
    quotaBytes: payload.quotaBytes || '',
    sharedUsers: payload.sharedUsers || 1,
    expiredMode: payload.expiredMode || 'none',
    triggerCoa: true,
    price: payload.price || 0,
    active: payload.active !== false && payload.status !== 'disabled',
    note: payload.note || ''
  };
}

const PPP_IMPORT_COLUMNS = [
  'no',
  'type_user',
  'username',
  'password',
  'type',
  'profile',
  'nas',
  'ip_address',
  'static_ip',
  'service_name',
  'mac_address',
  'status',
  'add_on_billing',
  'add_to_member',
  'full_name',
  'member_name',
  'no_ktp_sim',
  'ktp',
  'whatsapp',
  'no_whatsapp',
  'email',
  'address',
  'payment_type',
  'billing_period',
  'create_invoice',
  'invoice_status',
  'active_date',
  'ppn',
  'ppn_%',
  'discount_%',
  'discount',
  'price',
  'note'
];

const MAX_IMPORT_XLSX_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_XLSX_ROWS = 2000;

function excelCellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || '').join('');
  }
  if (Object.prototype.hasOwnProperty.call(value, 'result')) {
    return excelCellText(value.result);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'text')) {
    return excelCellText(value.text);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'hyperlink')) {
    return excelCellText(value.hyperlink);
  }
  return String(value);
}

async function workbookBuffer(sheets = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FAKE.NET Billing';
  workbook.created = new Date();
  for (const [name, rows] of Object.entries(sheets)) {
    const worksheet = workbook.addWorksheet(name.slice(0, 31) || 'Sheet1');
    const columns = [...new Set((rows || []).flatMap((row) => Object.keys(row || {})))];
    worksheet.columns = columns.map((key) => ({
      header: key,
      key,
      width: Math.max(12, Math.min(34, key.length + 4))
    }));
    for (const row of rows || []) {
      const textRow = {};
      for (const column of columns) {
        textRow[column] = row?.[column] === null || row?.[column] === undefined
          ? ''
          : String(row[column]);
      }
      worksheet.addRow(textRow);
    }
    if (columns.length) {
      worksheet.getRow(1).font = { bold: true };
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length }
      };
      columns.forEach((_, columnIndex) => {
        const column = worksheet.getColumn(columnIndex + 1);
        column.numFmt = '@';
        column.eachCell({ includeEmpty: true }, (cell) => {
          cell.numFmt = '@';
          cell.alignment = { vertical: 'middle', wrapText: true };
        });
      });
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function pppImportTemplateBuffer() {
  return workbookBuffer({
    ppp_dhcp_users: [
      {
        username: 'pppoe-contoh',
        password: 'password-ppp',
        type: 'PPPoE',
        profile: 'Nama Profile PPP',
        nas: 'Nama NAS atau IP NAS',
        static_ip: '',
        mac_address: '',
        status: 'active',
        add_to_member: 'yes',
        member_name: 'Nama Pelanggan PPP',
        ktp: '',
        whatsapp: '080000000001',
        email: 'pelanggan@example.net',
        address: 'Alamat pelanggan PPP',
        payment_type: 'postpaid',
        billing_period: 'fixed',
        invoice_status: 'paid',
        active_date: localTodayIso(),
        ppn: '',
        discount: '',
        price: '150000',
        note: 'Contoh PPPoE: username dan password wajib'
      },
      {
        username: '',
        password: '',
        type: 'DHCP',
        profile: 'Nama Profile DHCP',
        nas: 'Nama NAS atau IP NAS',
        static_ip: '',
        mac_address: 'AA:BB:CC:DD:EE:FF',
        status: 'active',
        add_to_member: 'yes',
        member_name: 'Nama Pelanggan DHCP',
        ktp: '',
        whatsapp: '080000000002',
        email: 'pelanggan-dhcp@example.net',
        address: 'Alamat pelanggan DHCP',
        payment_type: 'postpaid',
        billing_period: 'fixed',
        invoice_status: 'paid',
        active_date: localTodayIso(),
        ppn: '',
        discount: '',
        price: '150000',
        note: 'Contoh DHCP: MAC address wajib, username boleh kosong'
      }
    ],
    petunjuk: [
      { kolom: 'username', wajib: 'PPPoE wajib. DHCP boleh kosong.', contoh: 'pppoe-budi', keterangan: 'Untuk DHCP yang kosong, aplikasi memakai MAC address sebagai identitas radius.' },
      { kolom: 'password', wajib: 'PPPoE wajib. DHCP boleh kosong.', contoh: 'password123', keterangan: 'Password PPPoE. Tidak dipakai untuk DHCP.' },
      { kolom: 'type', wajib: 'Ya', contoh: 'PPPoE / DHCP', keterangan: 'Isi PPPoE atau DHCP.' },
      { kolom: 'profile', wajib: 'Ya', contoh: '10M', keterangan: 'Harus sama dengan nama profile PPP-DHCP yang sudah dibuat.' },
      { kolom: 'nas', wajib: 'Ya', contoh: 'FAKE.NET atau 10.1.13.14', keterangan: 'Harus sama dengan nama/IP NAS di Monitoring > Site.' },
      { kolom: 'static_ip', wajib: 'Tidak', contoh: '172.16.7.10', keterangan: 'Kosongkan jika IP dinamis.' },
      { kolom: 'mac_address', wajib: 'Wajib jika DHCP', contoh: 'AA:BB:CC:DD:EE:FF', keterangan: 'Dipakai sebagai Caller-ID DHCP.' },
      { kolom: 'status', wajib: 'Tidak', contoh: 'active', keterangan: 'active, isolated, terminated, disabled, pending.' },
      { kolom: 'add_to_member', wajib: 'Tidak', contoh: 'yes', keterangan: 'Isi yes jika user juga dibuatkan data member.' },
      { kolom: 'member_name', wajib: 'Jika add_to_member yes', contoh: 'Budi', keterangan: 'Nama pelanggan/member.' },
      { kolom: 'ktp', wajib: 'Tidak', contoh: '6472xxxxxxxxxxxx', keterangan: 'Nomor identitas pelanggan jika tersedia.' },
      { kolom: 'whatsapp', wajib: 'Jika add_to_member yes', contoh: '080000000001', keterangan: 'Kolom diformat teks supaya angka 0 depan tidak hilang di Excel.' },
      { kolom: 'email', wajib: 'Tidak', contoh: 'budi@example.net', keterangan: 'Email pelanggan jika tersedia.' },
      { kolom: 'address', wajib: 'Tidak', contoh: 'Jl. Contoh No. 1', keterangan: 'Alamat pelanggan.' },
      { kolom: 'payment_type', wajib: 'Tidak', contoh: 'postpaid / prepaid', keterangan: 'Bisa juga memakai PASCABAYAR / PRABAYAR dari format Radboox.' },
      { kolom: 'billing_period', wajib: 'Tidak', contoh: 'fixed / cycle / renewal', keterangan: 'Bisa juga memakai Fixed Date / Billing Cycle / Renewal.' },
      { kolom: 'invoice_status', wajib: 'Tidak', contoh: 'paid / unpaid', keterangan: 'Jika unpaid, user awal tersimpan pending sampai pembayaran pertama dicatat.' },
      { kolom: 'active_date', wajib: 'Tidak', contoh: localTodayIso(), keterangan: 'Tanggal aktif/pasang. Jika pelanggan dipasang bulan kemarin, isi tanggal aktif aslinya.' },
      { kolom: 'ppn', wajib: 'Tidak', contoh: '11', keterangan: 'PPN persen jika dipakai.' },
      { kolom: 'discount', wajib: 'Tidak', contoh: '0', keterangan: 'Diskon persen jika dipakai.' },
      { kolom: 'price', wajib: 'Tidak', contoh: '150000', keterangan: 'Harga manual jika diperlukan, biasanya ikut profile.' },
      { kolom: 'note', wajib: 'Tidak', contoh: 'Catatan opsional', keterangan: 'Catatan internal.' }
    ]
  });
}

function pppExportRows(data = {}) {
  const profiles = radiusProfileDirectory(data);
  const nasMap = radiusNasDirectory(data);
  const customers = radiusCustomerDirectory(data);
  return (data.radiusUsers || [])
    .filter((user) => user.serviceType === 'pppoe')
    .map((user) => {
      const profile = profiles.get(user.profileId) || {};
      const nas = nasMap.get(user.nasId) || {};
      const customer = customers.get(user.customerId) || {};
      return {
        username: user.username || '',
        password: user.password || '',
        type: user.accessType || 'PPPoE',
        profile: profile.name || '',
        nas: nas.name || nas.address || '',
        static_ip: user.staticIp || '',
        mac_address: user.callerId || '',
        status: user.status || 'active',
        add_to_member: user.customerId ? 'yes' : 'no',
        member_name: customer.name || '',
        ktp: customer.ktp || customer.idCard || '',
        whatsapp: normalizeLocalPhone(customer.whatsapp || customer.phone || ''),
        email: customer.email || '',
        address: customer.address || '',
        payment_type: customer.paymentType || '',
        billing_period: customer.billingPeriod || '',
        invoice_status: customer.firstInvoiceStatus || customer.initialInvoiceStatus || '',
        active_date: customer.activeDate || user.activeDate || '',
        ppn: customer.ppn || '',
        discount: customer.discount || '',
        price: profile.price || customer.price || '',
        note: user.note || ''
      };
    });
}

function normalizeImportRow(row = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    const cleanKey = normalizeImportKey(key);
    normalized[cleanKey] = value;
  }
  return normalized;
}

function normalizeImportKey(key = '') {
  return String(key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function normalizePppImportAccessType(value = '') {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase().replace(/[\s_]+/g, '-');
  if (!normalized || ['ppp', 'pppoe', 'ppp-dhcp'].includes(normalized)) return 'PPPoE';
  if (normalized === 'dhcp') return 'DHCP';
  throw new Error('Type wajib PPPoE atau DHCP');
}

function normalizeImportDate(value = '') {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const local = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial >= 20_000 && serial <= 80_000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return raw;
}

function periodFromDateInput(value = '') {
  const normalized = normalizeImportDate(value);
  const match = String(normalized || '').match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function dayFromDateInput(value = '', fallback = 10) {
  const normalized = normalizeImportDate(value);
  const match = String(normalized || '').match(/^\d{4}-\d{2}-(\d{2})$/);
  const parsed = match ? Number(match[1]) : Number(fallback);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(31, Math.round(parsed)));
}

function anchoredDueDateFromActiveDate(activeDate = '', invoiceStatus = 'paid', fallbackDay = 10) {
  const activePeriod = periodFromDateInput(activeDate);
  if (!activePeriod) return '';
  const dueDay = dayFromDateInput(activeDate, fallbackDay);
  const status = String(invoiceStatus || 'paid').trim().toLowerCase();
  const invoicePeriod = status === 'unpaid' ? activePeriod : addMonthsToPeriod(activePeriod, 1);
  return dueDateForPeriod(invoicePeriod, dueDay);
}

function normalizeImportPaymentType(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['prepaid', 'prabayar', 'pra'].includes(normalized)) return 'prepaid';
  if (['postpaid', 'pascabayar', 'pasca'].includes(normalized)) return 'postpaid';
  return value ? String(value).trim().toLowerCase() : 'postpaid';
}

function normalizeImportBillingPeriod(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (['fixed', 'fixeddate', 'tanggalfixed', 'tetap'].includes(normalized)) return 'fixed';
  if (['cycle', 'billingcycle', 'siklus'].includes(normalized)) return 'cycle';
  if (['renewal', 'renew'].includes(normalized)) return 'renewal';
  return value ? String(value).trim().toLowerCase() : 'fixed';
}

function decodeXmlText(value = '') {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripXmlTags(value = '') {
  return String(value || '').replace(/<[^>]*>/g, '');
}

function xlsxColumnName(ref = '') {
  return String(ref || '').match(/[A-Z]+/)?.[0] || '';
}

function xlsxColumnIndex(column = '') {
  return [...String(column || '')].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function xlsxSharedStrings(sharedXml = '') {
  const strings = [];
  for (const match of String(sharedXml || '').matchAll(/<si[\s\S]*?<\/si>/g)) {
    const text = [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((part) => decodeXmlText(part[1]))
      .join('');
    strings.push(text);
  }
  return strings;
}

function xlsxRowsFromSheetXml(sheetXml = '', sharedStrings = []) {
  const rows = [];
  for (const rowMatch of String(sheetXml || '').matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(rowMatch[1]);
    const cells = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c[^>]*r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = cellMatch[1];
      const attrs = cellMatch[2] || '';
      const body = cellMatch[3] || '';
      const type = attrs.match(/t="([^"]+)"/)?.[1] || '';
      let value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '';
      if (type === 's') {
        value = sharedStrings[Number(value)] || '';
      } else if (type === 'inlineStr') {
        value = stripXmlTags(body);
      }
      cells[xlsxColumnIndex(xlsxColumnName(ref))] = decodeXmlText(value);
    }
    rows.push({ rowNumber, cells });
  }
  return rows;
}

function importHeaderScore(headers = []) {
  const keys = new Set(headers.map(normalizeImportKey).filter(Boolean));
  let score = 0;
  if (keys.has('username')) score += 2;
  if (keys.has('password')) score += 1;
  if (keys.has('profile')) score += 1;
  if (keys.has('nas') || keys.has('router')) score += 1;
  if (keys.has('type') || keys.has('type_user')) score += 1;
  if (keys.has('active_date') || keys.has('full_name') || keys.has('add_on_billing')) score += 1;
  return score;
}

function detectImportHeader(rows = []) {
  let best = null;
  for (const row of rows.slice(0, 20)) {
    const headers = row.cells || [];
    const score = importHeaderScore(headers);
    if (!best || score > best.score) {
      best = { rowNumber: row.rowNumber, headers, score };
    }
  }
  if (!best || best.score < 4) {
    throw new Error('Header import PPP-DHCP tidak ditemukan. Pastikan ada kolom Username, Profile, NAS, dan Type.');
  }
  return best;
}

function detectImportDataStartRow(rows = [], headerRowNumber = 1) {
  const marker = rows.find((row) => {
    if (row.rowNumber <= headerRowNumber || row.rowNumber > headerRowNumber + 20) return false;
    const text = (row.cells || []).join(' ').toLowerCase();
    return text.includes('diatas adalah contoh') || text.includes('silahkan tambah') || text.includes('silakan tambah');
  });
  return marker ? marker.rowNumber + 1 : headerRowNumber + 1;
}

async function readWorkbookRowsFromXlsxBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings = xlsxSharedStrings(await zip.file('xl/sharedStrings.xml')?.async('string') || '');
  const sheetFile = zip.file('xl/worksheets/sheet1.xml');
  if (!sheetFile) throw new Error('Sheet import tidak ditemukan');
  const rows = xlsxRowsFromSheetXml(await sheetFile.async('string'), sharedStrings);
  const header = detectImportHeader(rows);
  const dataStartRow = detectImportDataStartRow(rows, header.rowNumber);
  const result = [];
  for (const row of rows) {
    if (row.rowNumber < dataStartRow || result.length >= MAX_IMPORT_XLSX_ROWS) continue;
    const item = {};
    let hasValue = false;
    header.headers.forEach((columnHeader, columnNumber) => {
      if (!columnHeader) return;
      const value = row.cells[columnNumber] || '';
      item[columnHeader] = value;
      if (String(value || '').trim()) hasValue = true;
    });
    if (hasValue) {
      const normalized = normalizeImportRow(item);
      normalized.__row_number = row.rowNumber;
      result.push(normalized);
    }
  }
  return result;
}

async function readWorkbookRowsFromBase64(contentBase64 = '') {
  const clean = String(contentBase64 || '').replace(/^data:.*?;base64,/, '');
  const buffer = Buffer.from(clean, 'base64');
  if (!buffer.length) throw new Error('File import kosong');
  if (buffer.length > MAX_IMPORT_XLSX_BYTES) throw new Error('File import terlalu besar, maksimal 2MB');
  return readWorkbookRowsFromXlsxBuffer(buffer);
}

function importPppUsers(data = {}, rows = [], actor = {}) {
  const created = [];
  const updated = [];
  const errors = [];
  rows.forEach((row, index) => {
    let username = String(row.username || '').trim();
    try {
      const accessType = normalizePppImportAccessType(row.type || row.type_user || 'PPPoE');
      const isDhcp = accessType.toLowerCase() === 'dhcp';
      const password = String(row.password ?? '').trim();
      const profileName = String(row.profile || row.profile_name || '').trim();
      const nasName = String(row.nas || row.router || row.nas_name || '').trim();
      const macAddress = String(row.mac_address || row.mac || '').trim();
      const addToMember = row.add_to_member || row.add_on_billing || row.member || '';
      const memberName = String(row.member_name || row.full_name || row.name || username || '').trim();
      const memberPhone = normalizeLocalPhone(row.whatsapp || row.no_whatsapp || row.phone || row.no_hp || row.telepon || '');
      const activeDate = normalizeImportDate(row.active_date || row.tanggal_aktif || row.installed_at || row.install_date || '');
      const invoiceStatus = String(row.invoice_status || row.status_invoice || '').trim();

      if (isDhcp && !username) {
        username = macAddress;
      }
      if (!username) {
        throw new Error(isDhcp ? 'MAC address wajib diisi untuk DHCP' : 'Username PPPoE wajib diisi');
      }
      if (!isDhcp && !password) {
        throw new Error('Password PPPoE wajib diisi');
      }
      if (isDhcp && !macAddress) {
        throw new Error('MAC address wajib diisi untuk DHCP');
      }
      if (!profileName) {
        throw new Error('Profile wajib diisi');
      }
      if (!radiusFindProfile(data, profileName, 'pppoe')) {
        throw new Error(`Profile "${profileName}" tidak ditemukan`);
      }
      if (!nasName) {
        throw new Error('NAS wajib diisi');
      }
      if (!radiusFindNas(data, nasName)) {
        throw new Error(`NAS "${nasName}" tidak ditemukan`);
      }
      const existing = (data.radiusUsers || []).find((user) => user.serviceType === 'pppoe' && String(user.username || '').toLowerCase() === username.toLowerCase());
      const existingMember = existing ? findCustomerForRadiusUser(data, existing) : null;
      if (payloadEnabled(addToMember)) {
        if (!memberName && !existingMember?.name) {
          throw new Error('Nama member wajib diisi jika add_to_member yes');
        }
        if (!memberPhone && !normalizeLocalPhone(existingMember?.whatsapp || existingMember?.phone || '')) {
          throw new Error('WhatsApp wajib diisi jika add_to_member yes');
        }
      }

      const payload = {
        username,
        password,
        type: accessType,
        profile: profileName,
        nas: nasName,
        ipAddress: row.static_ip || row.ip_address || '',
        macAddress,
        status: row.status || 'active',
        note: row.note || row.notes || '',
        addToMember,
        memberName: memberName || username,
        memberCode: row.member_code || row.code || username,
        memberPhone,
        memberKtp: row.ktp || row.no_ktp_sim || row.no_ktp || row.id_card || '',
        memberEmail: row.email || '',
        memberAddress: row.address || '',
        memberPaymentType: normalizeImportPaymentType(row.payment_type || row.tipe_pembayaran || ''),
        memberBillingPeriod: normalizeImportBillingPeriod(row.billing_period || row.periode_billing || ''),
        memberInvoiceStatus: invoiceStatus,
        memberActiveDate: activeDate,
        activeDate,
        memberPpn: row.ppn || row.ppn_ || row.vat || '',
        memberDiscount: row.discount || row.discount_ || row.diskon || '',
        memberPrice: row.price || row.harga || ''
      };
      const next = existing
        ? freeradius.updateRadiusUser(data, existing.id, radiusUserPayload(payload, 'pppoe', data), actor)
        : freeradius.addRadiusUser(data, radiusUserPayload(payload, 'pppoe', data), actor);
      if (payloadEnabled(payload.addToMember)) {
        const currentMember = findCustomerForRadiusUser(data, next);
        if (currentMember) {
          updateRadiusMemberFromImport(currentMember, payload, next, data, actor);
          next.customerId = currentMember.id;
        } else {
          const member = radiusMemberFromPayload(data, payload, next, actor);
          next.customerId = member.id;
        }
      }
      if (existing) updated.push(next);
      else created.push(next);
    } catch (error) {
      errors.push({ row: row.__row_number || index + 2, username, error: error.message || 'Gagal import user' });
    }
  });
  return { created, updated, errors };
}

const BACKUP_RECORD_KEYS = [
  'users',
  'customers',
  'radiusUsers',
  'radiusProfiles',
  'radiusNas',
  'invoices',
  'payments',
  'externalIncomes',
  'expenses',
  'inventoryItems',
  'stockMovements',
  'networkAssets',
  'monitoringTargets',
  'waMessages',
  'hotspotVoucherOrders',
  'paymentGatewayTransactions',
  'radiusVoucherRecords'
];

function backupRecordSummary(data = {}) {
  return BACKUP_RECORD_KEYS.reduce((summary, key) => {
    summary[key] = Array.isArray(data[key]) ? data[key].length : 0;
    return summary;
  }, {});
}

function appBackupPayload(data = {}, actor = {}) {
  const snapshot = ensureShape(data);
  return {
    app: 'fakenet-billing',
    name: 'FAKE.NET Billing and Office ISP dan RT/RW Net solution',
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: actor?.username || actor?.name || '',
    appInfo: {
      version: APP_VERSION,
      buildVersion: APP_BUILD_VERSION,
      releaseDate: APP_RELEASE_DATE
    },
    storage: {
      mode: STORAGE_MODE,
      cacheMode: CACHE_MODE
    },
    summary: backupRecordSummary(snapshot),
    data: snapshot
  };
}

function restoreStoreFromPayload(payload = {}) {
  const candidate = payload?.backup?.data || payload?.data || payload?.store || (payload?.settings ? payload : null);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('File backup tidak valid');
  }
  if (!candidate.settings || typeof candidate.settings !== 'object') {
    throw new Error('File backup tidak memuat pengaturan aplikasi');
  }
  return ensureShape(candidate);
}

function replaceStore(target = {}, source = {}) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, source);
}

function voucherCharacters(mode = 'mixed') {
  const normalized = String(mode || 'mixed').toLowerCase();
  if (normalized === 'number') return '0123456789';
  if (normalized === 'upper') return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (normalized === 'lower') return 'abcdefghijklmnopqrstuvwxyz';
  if (normalized === 'upper-number') return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  if (normalized === 'lower-number') return 'abcdefghijklmnopqrstuvwxyz0123456789';
  return 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
}

function randomVoucherCode(length = 6, mode = 'mixed') {
  const size = Math.max(3, Math.min(32, Math.trunc(Number(length || 6)) || 6));
  const chars = voucherCharacters(mode);
  let value = '';
  for (let index = 0; index < size; index += 1) {
    value += chars[crypto.randomInt(0, chars.length)];
  }
  return value;
}

function generateHotspotVouchers(data = {}, payload = {}, actor = {}) {
  const profile = radiusFindProfile(data, payload.profileId || payload.profile, 'hotspot');
  if (!profile) throw new Error('Profile Hotspot wajib dipilih');
  const nas = radiusFindNas(data, payload.nasId || payload.nas || payload.routerNas);
  const count = Math.max(1, Math.min(500, Math.trunc(Number(payload.count || 1)) || 1));
  const length = Math.max(3, Math.min(32, Math.trunc(Number(payload.nameLength || 6)) || 6));
  const prefix = String(payload.prefix || '').trim();
  const character = String(payload.character || 'mixed').trim();
  const userMode = 'same';
  const batchId = createId('vbatch');
  const created = [];
  for (let index = 0; index < count; index += 1) {
    let username = '';
    do {
      username = `${randomVoucherCode(length, character)}${prefix}`;
    } while ((data.radiusUsers || []).some((user) => String(user.username || '').toLowerCase() === username.toLowerCase()) || created.some((user) => user.username.toLowerCase() === username.toLowerCase()));
    const password = username;
    const user = freeradius.addRadiusUser(data, {
      username,
      password,
      serviceType: 'hotspot',
      accessType: 'Hotspot',
      profileId: profile.id,
      nasId: nas?.id || '',
      status: 'active',
      validUntil: payload.validUntil || '',
      voucherMode: userMode,
      voucherBatchId: batchId,
      note: payload.note || `Voucher ${profile.name}`
    }, actor);
    created.push(user);
  }
  return { batchId, created };
}

function syncRadiusCustomerStatus(data = {}, radiusUser = {}) {
  if (!radiusUser) return null;
  const customer = findCustomerForRadiusUser(data, radiusUser);
  if (!customer) return null;
  radiusUser.customerId = customer.id;
  const nextStatus = radiusUser.status === 'terminated'
    ? 'terminate'
    : radiusUser.status === 'isolated'
      ? 'isolir'
      : radiusUser.status === 'disabled'
        ? 'inactive'
        : 'active';
  customer.status = nextStatus;
  if (nextStatus === 'isolir') {
    customer.isolationSource = radiusUser.isolationSource || '';
    customer.isolationReason = radiusUser.isolationReason || '';
    customer.isolatedByName = radiusUser.isolatedByName || radiusUser.updatedBy || '';
    customer.isolatedByUsername = radiusUser.isolatedByUsername || '';
    customer.isolatedByRole = radiusUser.isolatedByRole || '';
  } else {
    customer.isolationSource = '';
    customer.isolationReason = '';
    customer.isolatedByName = '';
    customer.isolatedByUsername = '';
    customer.isolatedByRole = '';
  }
  if (nextStatus === 'terminate') {
    customer.terminatedAt = radiusUser.terminatedAt || customer.terminatedAt || localTodayIso();
    customer.terminationSource = terminationSourceText(
      radiusUser.terminationSource,
      radiusUser.terminatedSource,
      customer.terminationSource
    ) || 'manual';
    customer.terminationReason = radiusUser.terminationReason || radiusUser.terminateReason || customer.terminationReason || '';
    customer.terminatedByName = radiusUser.terminatedByName || radiusUser.updatedBy || customer.terminatedByName || '';
    customer.terminatedByUsername = radiusUser.terminatedByUsername || customer.terminatedByUsername || '';
    customer.terminatedByRole = radiusUser.terminatedByRole || customer.terminatedByRole || '';
  } else {
    customer.terminatedAt = '';
    customer.terminationSource = '';
    customer.terminationReason = '';
    customer.terminatedByName = '';
    customer.terminatedByUsername = '';
    customer.terminatedByRole = '';
  }
  customer.updatedAt = new Date().toISOString();
  customer.updatedBy = radiusUser.updatedBy || 'Radius';
  return customer;
}

function payloadEnabled(value) {
  return value === true || ['1', 'true', 'yes', 'y', 'ya', 'iya', 'on', 'aktif', 'active'].includes(String(value || '').toLowerCase());
}

function generateMemberCode(data = {}) {
  const used = new Set((data.customers || []).flatMap((customer) => [
    customer.code,
    customer.accountId,
    customer.userId
  ]).map((value) => String(value || '').trim()).filter(Boolean));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(crypto.randomInt(0, 1_000_000_000)).padStart(9, '0');
    if (!used.has(code)) return code;
  }
  return String(Date.now()).slice(-9).padStart(9, '0');
}

function radiusMemberFromPayload(data = {}, payload = {}, radiusUser = {}, actor = {}) {
  const username = String(radiusUser.username || payload.username || '').trim();
  if (!username) {
    throw new Error('Username Radius wajib tersedia untuk membuat member');
  }
  const duplicate = (data.customers || []).find((customer) => {
    return String(customer.username || '').trim().toLowerCase() === username.toLowerCase();
  });
  if (duplicate) {
    throw new Error(`Member untuk username ${username} sudah ada`);
  }

  const profile = radiusFindProfile(data, payload.profileId || payload.profile || radiusUser.profileId, 'pppoe') || {};
  const nas = radiusFindNas(data, payload.nasId || payload.nas || radiusUser.nasId) || {};
  const phone = normalizeLocalPhone(payload.memberPhone || payload.phone || '');
  if (!phone) {
    throw new Error('Nomor telepon/WhatsApp member wajib diisi');
  }
  const activeDate = normalizeImportDate(payload.memberActiveDate || payload.activeDate || localTodayIso());
  const memberName = String(payload.memberName || payload.customerName || '').trim();
  if (!memberName) {
    throw new Error('Nama Member wajib diisi');
  }
  const memberCode = String(payload.memberCode || payload.accountId || generateMemberCode(data)).trim();
  const latitude = String(payload.memberLatitude || payload.latitude || '').trim();
  const longitude = String(payload.memberLongitude || payload.longitude || '').trim();
  const locationAccuracy = String(payload.memberLocationAccuracy || payload.locationAccuracy || '').trim();
  const locationUrl = latitude && longitude ? `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}` : '';
  const invoiceStatus = String(payload.memberInvoiceStatus || payload.invoiceStatus || 'paid').trim().toLowerCase() === 'unpaid' ? 'unpaid' : 'paid';
  const fallbackDueDay = payload.memberDueDay || data.settings?.billing?.postpaidDueDay || data.settings?.defaultDueDay || 10;
  const dueDay = dayFromDateInput(activeDate, fallbackDueDay);
  const explicitNextDue = normalizeImportDate(payload.memberNextDue || payload.nextDue || payload.dueDate || '');
  const nextDue = explicitNextDue || anchoredDueDateFromActiveDate(activeDate, invoiceStatus, dueDay);
  const customer = addManualCustomer(data, {
    username,
    name: memberName,
    phone,
    email: payload.memberEmail || payload.email || '',
    ktp: payload.memberKtp || payload.ktp || payload.idCard || '',
    address: payload.memberAddress || payload.address || '',
    latitude,
    longitude,
    locationAccuracy,
    locationUrl,
    packageName: payload.memberPackageName || profile.name || payload.profile || '',
    price: payload.memberPrice || profile.price || 0,
    status: payload.memberStatus || (invoiceStatus === 'unpaid' ? 'pending' : 'active'),
    dueDay
  });

  Object.assign(customer, {
    source: 'radius',
    code: memberCode,
    accountId: memberCode,
    customerName: memberName,
    whatsapp: phone,
    email: String(payload.memberEmail || payload.email || '').trim(),
    ktp: String(payload.memberKtp || payload.ktp || payload.idCard || '').trim(),
    paymentType: String(payload.memberPaymentType || 'postpaid').trim(),
    billingPeriod: String(payload.memberBillingPeriod || 'fixed').trim(),
    ppn: String(payload.memberPpn || payload.ppn || '').trim(),
    discount: String(payload.memberDiscount || payload.discount || '').trim(),
    firstInvoiceStatus: invoiceStatus,
    initialInvoiceStatus: invoiceStatus,
    nextDue,
    dueDate: nextDue,
    radiusUserId: radiusUser.id || '',
    nas: nas.name || '',
    site: nas.site || '',
    siteName: nas.site || nas.name || '',
    latitude,
    longitude,
    locationAccuracy,
    locationUrl,
    activeDate,
    housePhotoUrl: String(payload.memberHousePhotoUrl || payload.housePhotoUrl || '').trim(),
    updatedBy: actor.name || actor.username || 'Sistem'
  });
  addActivity(data, 'customer', `Member ${customer.name || customer.username} dibuat dari user PPP-DHCP`, {
    customerId: customer.id,
    radiusUserId: radiusUser.id || '',
    username
  });
  return customer;
}

function updateRadiusMemberFromImport(customer = {}, payload = {}, radiusUser = {}, data = {}, actor = {}) {
  const profile = radiusFindProfile(data, payload.profileId || payload.profile || radiusUser.profileId, 'pppoe') || {};
  const nas = radiusFindNas(data, payload.nasId || payload.nas || radiusUser.nasId) || {};
  const memberName = String(payload.memberName || payload.customerName || '').trim();
  const phone = normalizeLocalPhone(payload.memberPhone || payload.phone || customer.whatsapp || customer.phone || '');
  const activeDate = normalizeImportDate(payload.memberActiveDate || payload.activeDate || customer.activeDate || '');
  const invoiceStatus = String(payload.memberInvoiceStatus || payload.invoiceStatus || customer.firstInvoiceStatus || 'paid').trim().toLowerCase() === 'unpaid' ? 'unpaid' : 'paid';
  const fallbackDueDay = payload.memberDueDay || customer.dueDay || data.settings?.billing?.postpaidDueDay || data.settings?.defaultDueDay || 10;
  const dueDay = activeDate ? dayFromDateInput(activeDate, fallbackDueDay) : dayFromDateInput(customer.activeDate, fallbackDueDay);
  const explicitNextDue = normalizeImportDate(payload.memberNextDue || payload.nextDue || payload.dueDate || '');
  if (memberName) {
    customer.name = memberName;
    customer.customerName = memberName;
  }
  if (phone) {
    customer.phone = phone;
    customer.whatsapp = phone;
  }
  customer.email = String(payload.memberEmail || payload.email || customer.email || '').trim();
  customer.ktp = String(payload.memberKtp || payload.ktp || payload.idCard || customer.ktp || customer.idCard || '').trim();
  customer.address = String(payload.memberAddress || payload.address || customer.address || '').trim();
  customer.packageName = payload.memberPackageName || profile.name || payload.profile || customer.packageName || '';
  customer.price = payload.memberPrice || profile.price || customer.price || 0;
  customer.paymentType = normalizeImportPaymentType(payload.memberPaymentType || customer.paymentType || 'postpaid');
  customer.billingPeriod = normalizeImportBillingPeriod(payload.memberBillingPeriod || customer.billingPeriod || 'fixed');
  customer.ppn = String(payload.memberPpn || payload.ppn || customer.ppn || '').trim();
  customer.discount = String(payload.memberDiscount || payload.discount || customer.discount || '').trim();
  customer.dueDay = dueDay;
  customer.firstInvoiceStatus = invoiceStatus;
  customer.initialInvoiceStatus = invoiceStatus;
  customer.radiusUserId = radiusUser.id || customer.radiusUserId || '';
  customer.username = radiusUser.username || customer.username || '';
  customer.nas = nas.name || customer.nas || '';
  customer.site = nas.site || customer.site || '';
  customer.siteName = nas.site || nas.name || customer.siteName || '';
  if (activeDate) customer.activeDate = activeDate;
  if (explicitNextDue) {
    customer.nextDue = explicitNextDue;
    customer.dueDate = explicitNextDue;
  } else if (!customer.nextDue && !customer.dueDate && customer.activeDate) {
    const anchoredDue = anchoredDueDateFromActiveDate(customer.activeDate, invoiceStatus, dueDay);
    customer.nextDue = anchoredDue;
    customer.dueDate = anchoredDue;
  }
  if (!customer.code && !customer.accountId) {
    const memberCode = String(payload.memberCode || payload.accountId || generateMemberCode(data)).trim();
    customer.code = memberCode;
    customer.accountId = memberCode;
  }
  if (customer.status === 'pending' && invoiceStatus === 'paid') {
    customer.status = 'active';
  }
  customer.updatedAt = new Date().toISOString();
  customer.updatedBy = actor.name || actor.username || 'Sistem';
  return customer;
}

function deleteRadiusLinkedMember(data = {}, radiusUser = {}, actor = {}) {
  const customer = findCustomerForRadiusUser(data, radiusUser);
  if (!customer) return null;
  const customerKeysForDeletedUser = new Set(customerKeys(customer));
  const stillLinked = (data.radiusUsers || []).some((user) => {
    if (user.id === radiusUser.id) return false;
    const userKeys = [
      user.customerId,
      user.id,
      user.username
    ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
    return userKeys.some((key) => customerKeysForDeletedUser.has(key));
  });
  if (stillLinked) return null;
  const index = (data.customers || []).findIndex((item) => item.id === customer.id);
  if (index === -1) return null;
  const [removed] = data.customers.splice(index, 1);
  const actorName = actor?.name || actor?.username || 'Sistem';
  for (const invoice of data.invoices || []) {
    if (invoice.customerId !== removed.id) continue;
    const runtimeStatus = invoiceRuntimeStatus(invoice);
    if (runtimeStatus === 'paid' || runtimeStatus === 'cancelled') continue;
    invoice.status = 'cancelled';
    invoice.notes = [invoice.notes, `Dibatalkan otomatis karena member dihapus bersama user Radius oleh ${actorName}.`]
      .filter(Boolean)
      .join(' ');
    invoice.updatedAt = new Date().toISOString();
  }
  recordRadiusRemovedUser(data, radiusUser, removed, actor);
  return removed;
}

function radiusRemovedRecordKey(radiusUser = {}, customer = {}) {
  return [
    radiusUser.id,
    customer.radiusUserId,
    customer.id,
    radiusUser.customerId,
    radiusUser.username,
    customer.username
  ].map((value) => String(value || '').trim().toLowerCase()).find(Boolean) || '';
}

function recordRadiusRemovedUser(data = {}, radiusUser = {}, customer = {}, actor = {}) {
  const serviceType = String(radiusUser.serviceType || customer.serviceType || 'pppoe').trim().toLowerCase();
  if (serviceType !== 'pppoe') return null;
  data.radiusRemovedRecords = Array.isArray(data.radiusRemovedRecords) ? data.radiusRemovedRecords : [];
  const now = new Date().toISOString();
  const key = radiusRemovedRecordKey(radiusUser, customer);
  const record = {
    id: radiusUser.id || createId('cab'),
    key: key || createId('cab'),
    serviceType: 'pppoe',
    radiusUserId: radiusUser.id || customer.radiusUserId || '',
    customerId: customer.id || radiusUser.customerId || '',
    username: radiusUser.username || customer.username || '',
    customerName: customer.name || customer.customerName || radiusUser.customerName || radiusUser.username || '',
    memberCode: customer.code || customer.memberCode || '',
    installedAt: customer.activeDate || radiusUser.activeDate || customer.createdAt || radiusUser.createdAt || '',
    radiusCreatedAt: radiusUser.createdAt || '',
    memberCreatedAt: customer.createdAt || '',
    profileId: radiusUser.profileId || customer.profileId || '',
    profileName: customer.packageName || radiusUser.profileName || '',
    nasId: radiusUser.nasId || customer.nasId || '',
    lastStatus: radiusUser.status || customer.status || '',
    removedAt: now,
    removedByName: actor?.name || actor?.username || 'Sistem',
    removedByUsername: actor?.username || '',
    removedByRole: actor?.role || '',
    status: 'removed'
  };
  const index = data.radiusRemovedRecords.findIndex((item) => {
    return (record.key && item.key === record.key)
      || (record.radiusUserId && item.radiusUserId === record.radiusUserId);
  });
  if (index >= 0) {
    data.radiusRemovedRecords[index] = {
      ...data.radiusRemovedRecords[index],
      ...record
    };
  } else {
    data.radiusRemovedRecords.unshift(record);
  }
  data.radiusRemovedRecords = data.radiusRemovedRecords.slice(0, 10000);
  return index >= 0 ? data.radiusRemovedRecords[index] : record;
}

function deleteOrphanRadiusMembers(data = {}, actor = {}) {
  const users = Array.isArray(data.radiusUsers) ? data.radiusUsers : [];
  const linkedCustomerIds = new Set(users.map((user) => String(user.customerId || '').trim()).filter(Boolean));
  const linkedRadiusIds = new Set(users.map((user) => String(user.id || '').trim()).filter(Boolean));
  const linkedUsernames = new Set(users.map((user) => String(user.username || '').trim().toLowerCase()).filter(Boolean));
  const removed = [];
  data.customers = (data.customers || []).filter((customer) => {
    if (customer.source !== 'radius') return true;
    const linked = linkedCustomerIds.has(String(customer.id || '').trim())
      || linkedRadiusIds.has(String(customer.radiusUserId || '').trim())
      || linkedUsernames.has(String(customer.username || '').trim().toLowerCase());
    if (linked) return true;
    removed.push(customer);
    return false;
  });
  if (removed.length) {
    const actorName = actor?.name || actor?.username || 'Sistem';
    for (const customer of removed) {
      for (const invoice of data.invoices || []) {
        if (invoice.customerId !== customer.id) continue;
        const runtimeStatus = invoiceRuntimeStatus(invoice);
        if (runtimeStatus === 'paid' || runtimeStatus === 'cancelled') continue;
        invoice.status = 'cancelled';
        invoice.notes = [invoice.notes, `Dibatalkan otomatis karena member orphan dibersihkan oleh ${actorName}.`].filter(Boolean).join(' ');
        invoice.updatedAt = new Date().toISOString();
      }
      recordRadiusRemovedUser(data, {}, customer, actor);
    }
    addActivity(data, 'customer', `${removed.length} member orphan Radius dibersihkan oleh ${actorName}`, {
      action: 'radius-member-orphan-cleanup',
      count: removed.length
    });
  }
  return removed;
}

function publicXenditPayload(result = {}, user = {}) {
  const canViewBalance = auth.hasPermission(user, 'xendit:balance');
  const canWithdraw = auth.hasPermission(user, 'xendit:withdraw');
  const payload = {
    ...result,
    canViewBalance,
    canWithdraw
  };
  if (!canViewBalance) {
    payload.account = null;
    payload.balance = null;
    if (payload.errors && typeof payload.errors === 'object') {
      const {
        balance,
        ...errors
      } = payload.errors;
      payload.errors = errors;
    }
  }
  return payload;
}

function xenditSensitiveUsers(data = {}) {
  const configured = process.env.XENDIT_SENSITIVE_USERS
    || data.settings?.radboox?.xenditSensitiveUsers
    || data.settings?.xendit?.sensitiveUsers
    || 'admin';
  return new Set(String(configured)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean));
}

function xenditSensitiveAllowed(authContext = {}, credentials = {}, permission = 'xendit:balance') {
  const user = authContext.user || {};
  if (!auth.hasPermission(user, permission)) {
    return false;
  }
  if (['admin', 'owner'].includes(String(user.role || '').toLowerCase())) {
    return true;
  }
  const allowed = xenditSensitiveUsers(authContext.data || {});
  const appUsername = String(user.username || '').trim().toLowerCase();
  const radbooxUsername = String(credentials.username || user.radbooxUsername || '').trim().toLowerCase();
  return allowed.has(appUsername) || allowed.has(radbooxUsername);
}

function publicXenditPayloadForContext(result = {}, authContext = {}, credentials = {}) {
  const payload = publicXenditPayload(result, authContext.user || {});
  const canViewBalance = xenditSensitiveAllowed(authContext, credentials, 'xendit:balance');
  const canWithdraw = xenditSensitiveAllowed(authContext, credentials, 'xendit:withdraw');
  payload.canViewBalance = canViewBalance;
  payload.canWithdraw = canWithdraw;
  if (!canViewBalance) {
    payload.account = null;
    payload.balance = null;
  }
  return payload;
}

function dashboardFinanceAllowed(user = {}) {
  return auth.hasPermission(user, 'external-incomes:read')
    || auth.hasPermission(user, 'expenses:read');
}

function radiusSectionAllowedForUser(user = {}, section = '') {
  if (String(user.role || '') === 'reseller_voucher') {
    return section === 'hotspot';
  }
  return true;
}

function canCreateRadiusLinkedMember(user = {}) {
  return auth.hasPermission(user, 'customers:manage')
    || auth.hasPermission(user, 'members:contact:write')
    || auth.hasPermission(user, 'radius:write')
    || auth.hasPermission(user, 'radius:ppp-users:write');
}

function userLockedNasId(user = {}) {
  return String(user.lockedNasId || user.resellerNasId || user.voucherNasId || '').trim();
}

function resolveUserLockedNas(data = {}, user = {}) {
  const lockedNasId = userLockedNasId(user);
  if (!lockedNasId) return null;
  return radiusFindNas(data, lockedNasId) || null;
}

function requireResellerLockedNas(data = {}, user = {}) {
  if (String(user.role || '') !== 'reseller_voucher') return null;
  const lockedNasId = userLockedNasId(user);
  if (!lockedNasId) return null;
  const nas = resolveUserLockedNas(data, user);
  if (!nas) {
    throw new Error('NAS reseller voucher tidak ditemukan atau sudah dinonaktifkan');
  }
  return nas;
}

function applyResellerVoucherNasLock(data = {}, payload = {}, user = {}) {
  const next = { ...payload };
  const nas = requireResellerLockedNas(data, user);
  if (!nas) return next;
  next.nasId = nas.id;
  next.nas = nas.id;
  next.routerNas = nas.id;
  return next;
}

function resellerHotspotVoucherRowVisible(row = {}, user = {}) {
  if (String(user.role || '') !== 'reseller_voucher') return true;
  if (row.customerId) return false;
  if (row.onlineOrderId || row.onlineOrderReference) return false;
  const lockedNasId = userLockedNasId(user);
  if (lockedNasId && String(row.nasId || '') !== lockedNasId) return false;
  return actorMatchesDashboardUser(row, user);
}

function hotspotFreeUserWritable(row = {}) {
  if (!row || row.serviceType !== 'hotspot') return false;
  const paymentStatus = String(row.paymentStatus || '').trim().toLowerCase();
  if (paymentStatus !== 'free') return false;
  if (row.voucherBatchId || row.voucherMode || row.onlineOrderId || row.onlineOrderReference) return false;
  if (String(row.createdByRole || '').trim().toLowerCase() === 'reseller_voucher') return false;
  return true;
}

function hotspotFreeUserPayload(payload = {}) {
  return {
    ...payload,
    paymentStatus: 'free',
    amount: 0,
    price: 0,
    paidAt: '',
    voucherMode: '',
    voucherBatchId: ''
  };
}

function canManageHotspotUser(user = {}, existing = null) {
  if (auth.hasPermission(user, 'radius:write')) return true;
  if (!auth.hasPermission(user, 'radius:hotspot-free:write')) return false;
  return existing ? hotspotFreeUserWritable(existing) : true;
}

function publicManagedUser(data = {}, user = {}) {
  const safe = auth.publicUser(user);
  if (!safe) return null;
  const nas = resolveUserLockedNas(data, safe);
  if (nas) {
    safe.lockedNasName = nas.name || nas.address || safe.lockedNasName || '';
    safe.lockedNasAddress = nas.address || '';
  }
  return safe;
}

function prepareManagedUserPayload(data = {}, payload = {}, existing = null) {
  const next = { ...payload };
  const nextRole = String(next.role || existing?.role || 'viewer').trim().toLowerCase();
  if (nextRole !== 'reseller_voucher') {
    next.lockedNasId = '';
    next.lockedNasName = '';
    return next;
  }
  const nas = radiusFindNas(
    data,
    next.lockedNasId
      || next.resellerNasId
      || next.voucherNasId
      || next.nasId
      || next.nas
      || existing?.lockedNasId
      || ''
  );
  if (!nas) {
    throw new Error('NAS reseller voucher wajib dipilih');
  }
  next.lockedNasId = nas.id;
  next.lockedNasName = nas.name || nas.address || '';
  return next;
}

function normalizedActorText(value = '') {
  return String(value || '').trim().toLowerCase();
}

function actorMatchesDashboardUser(row = {}, user = {}) {
  const username = normalizedActorText(user.username);
  const name = normalizedActorText(user.name);
  const usernameFields = [
    row.createdByUsername,
    row.updatedByUsername,
    row.paidByUsername,
    row.actorUsername,
    row.adminUsername
  ].map(normalizedActorText).filter(Boolean);
  const nameFields = [
    row.createdByName,
    row.updatedByName,
    row.paidByName,
    row.actorName,
    row.admin,
    row.updatedBy
  ].map(normalizedActorText).filter(Boolean);
  return Boolean((username && usernameFields.includes(username)) || (name && nameFields.includes(name)));
}

function dashboardCommissionPercent(settings = {}, key = '') {
  return Math.max(0, Math.min(100, Number(settings[key] || 0) || 0));
}

function collectorDailyBonusEnabled(settings = {}) {
  return settings.collectorDailyBonusEnabled !== false;
}

function collectorDailyBonusTiers(settings = {}) {
  const source = Array.isArray(settings.collectorDailyBonusTiers) && settings.collectorDailyBonusTiers.length
    ? settings.collectorDailyBonusTiers
    : DEFAULT_COLLECTOR_DAILY_BONUS_TIERS;
  return source
    .map((tier) => ({
      minAmount: Math.max(0, Math.round(Number(tier.minAmount || 0) || 0)),
      maxAmount: Math.max(0, Math.round(Number(tier.maxAmount || 0) || 0)),
      bonusAmount: Math.max(0, Math.round(Number(tier.bonusAmount || 0) || 0))
    }))
    .filter((tier) => tier.minAmount > 0 && tier.bonusAmount > 0)
    .sort((a, b) => a.minAmount - b.minAmount);
}

function sanitizeCollectorDailyBonusTiers(rows = []) {
  const source = Array.isArray(rows) && rows.length ? rows : DEFAULT_COLLECTOR_DAILY_BONUS_TIERS;
  const sanitized = source
    .map((tier) => ({
      minAmount: Math.max(0, Math.round(Number(tier.minAmount || 0) || 0)),
      maxAmount: Math.max(0, Math.round(Number(tier.maxAmount || 0) || 0)),
      bonusAmount: Math.max(0, Math.round(Number(tier.bonusAmount || 0) || 0))
    }))
    .filter((tier) => tier.minAmount > 0 && tier.bonusAmount > 0)
    .sort((a, b) => a.minAmount - b.minAmount);
  return sanitized.length ? sanitized : DEFAULT_COLLECTOR_DAILY_BONUS_TIERS;
}

function collectorDailyBonusForAmount(amount = 0, settings = {}) {
  if (!collectorDailyBonusEnabled(settings)) return 0;
  const value = Math.max(0, Number(amount || 0));
  const tier = collectorDailyBonusTiers(settings).find((item) => {
    if (value < item.minAmount) return false;
    return item.maxAmount <= 0 || value <= item.maxAmount;
  });
  return tier ? tier.bonusAmount : 0;
}

function paymentCountsAsPaid(data = {}, payment = {}) {
  if (!paymentIsActive(payment)) return false;
  const invoiceId = String(payment.invoiceId || '');
  if (!invoiceId) return true;
  const invoice = (data.invoices || []).find((item) => item.id === invoiceId);
  return invoice ? invoiceRuntimeStatus(invoice) === 'paid' : true;
}

function activePayments(data = {}) {
  return (data.payments || []).filter((payment) => paymentCountsAsPaid(data, payment));
}

function userIsCollector(user = {}) {
  return String(user.role || '') === 'collector';
}

function collectorUsers(data = {}) {
  return (data.users || []).filter((user) => user.active !== false && userIsCollector(user));
}

function paymentDateKey(payment = {}) {
  return String(payment.paidAt || payment.createdAt || '').slice(0, 10);
}

function paymentBelongsToCollector(data = {}, payment = {}) {
  if (String(payment.createdByRole || '').toLowerCase() === 'collector') return true;
  return collectorUsers(data).some((collector) => actorMatchesDashboardUser(payment, collector));
}

function collectorReportPayments(data = {}, user = {}) {
  const payments = activePayments(data);
  return userIsCollector(user)
    ? payments.filter((payment) => actorMatchesDashboardUser(payment, user))
    : payments;
}

function dashboardCollectorScope(data = {}, user = {}, period = currentPeriod()) {
  const selectedPeriod = normalizePeriod(period);
  const settings = data.settings || {};
  const rows = activePayments(data)
    .filter((payment) => String(payment.paidAt || payment.createdAt || '').slice(0, 7) === selectedPeriod)
    .filter((payment) => actorMatchesDashboardUser(payment, user));
  const teamDailyTotals = new Map();
  activePayments(data)
    .filter((payment) => String(payment.paidAt || payment.createdAt || '').slice(0, 7) === selectedPeriod)
    .filter((payment) => paymentBelongsToCollector(data, payment))
    .forEach((payment) => {
      const date = paymentDateKey(payment);
      if (!date) return;
      teamDailyTotals.set(date, (teamDailyTotals.get(date) || 0) + Number(payment.amount || 0));
    });
  const activeDays = new Set(rows.map(paymentDateKey).filter(Boolean));
  const bonuses = [...activeDays].map((date) => ({
    date,
    bonusAmount: collectorDailyBonusForAmount(teamDailyTotals.get(date) || 0, settings)
  }));
  const earning = bonuses.reduce((sum, item) => sum + Number(item.bonusAmount || 0), 0);
  const todayBonus = bonuses.find((item) => item.date === localTodayIso())?.bonusAmount || 0;
  return {
    type: 'collector',
    title: 'Pendapatan Collector',
    earning,
    transactionCount: rows.length,
    itemCount: rows.length,
    ratePercent: 0,
    fixedDailyAmount: 0,
    activeDays: activeDays.size,
    qualifiedDays: bonuses.filter((item) => Number(item.bonusAmount || 0) > 0).length,
    todayBonus,
    bonusEnabled: collectorDailyBonusEnabled(settings),
    bonusMode: 'daily-tier',
    bonusTiers: collectorDailyBonusTiers(settings),
    metricLabel: 'Pendapatan Saya',
    countLabel: 'Pembayaran Saya',
    helperText: 'Bonus dihitung dari tier total tagihan collector per hari.'
  };
}

function voucherOrderMatchesDashboardUser(order = {}, user = {}, usersById = new Map()) {
  if (actorMatchesDashboardUser(order, user)) return true;
  const ids = Array.isArray(order.voucherUserIds) ? order.voucherUserIds : [];
  return ids.some((id) => actorMatchesDashboardUser(usersById.get(id) || {}, user));
}

function voucherOrdersVisibleForUser(data = {}, orders = [], user = {}) {
  if (String(user.role || '') !== 'reseller_voucher') return orders;
  const usersById = new Map(hotspotVoucherReportUsers(data).map((row) => [row.id, row]));
  return orders
    .filter((order) => ['generated', 'manual'].includes(String(order.source || '').toLowerCase()))
    .filter((order) => voucherOrderMatchesDashboardUser(order, user, usersById));
}

function voucherResellerForOrder(data = {}, order = {}) {
  const resellerUsers = (data.users || []).filter((user) => String(user.role || '') === 'reseller_voucher');
  const resellerByUsername = new Map(resellerUsers.map((user) => [String(user.username || '').trim().toLowerCase(), user]));
  const usernames = [
    order.createdByUsername,
    order.updatedByUsername,
    order.paidByUsername,
    ...(Array.isArray(order.vouchers) ? order.vouchers.map((voucher) => voucher.createdByUsername) : [])
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  for (const username of usernames) {
    const reseller = resellerByUsername.get(username);
    if (reseller) {
      return {
        id: reseller.id || '',
        username: reseller.username || '',
        name: reseller.name || reseller.username || ''
      };
    }
  }
  if (String(order.createdByRole || '').toLowerCase() === 'reseller_voucher' && order.createdByUsername) {
    return {
      id: '',
      username: order.createdByUsername || '',
      name: order.createdByName || order.createdByUsername || ''
    };
  }
  return null;
}

function voucherReportCommissionPercent(settings = {}) {
  return Math.max(0, Math.min(100, Number(settings.voucherRevenueSharePercent || 0) || 0));
}

function enrichVoucherOrderForReport(data = {}, order = {}) {
  const reseller = voucherResellerForOrder(data, order);
  const amount = Math.max(0, Math.round(Number(order.amount || 0) || 0));
  const commissionPercent = reseller ? voucherReportCommissionPercent(data.settings || {}) : 0;
  const commissionAmount = Math.round((amount * commissionPercent) / 100);
  const methodGroup = paymentMethodGroup(order.paymentMethod || order.method || '');
  return {
    ...order,
    amount,
    resellerId: reseller?.id || '',
    resellerUsername: reseller?.username || '',
    resellerName: reseller?.name || '',
    commissionPercent,
    commissionAmount,
    netAmount: Math.max(0, amount - commissionAmount),
    methodGroup,
    sourceLabel: String(order.source || '') === 'generated'
      ? 'Generated'
      : String(order.source || '') === 'manual'
        ? 'Manual'
        : 'Online'
  };
}

function voucherReportFilterOptions(data = {}, orders = [], user = {}) {
  const scoped = String(user.role || '') === 'reseller_voucher';
  const unique = (items = []) => {
    const map = new Map();
    for (const item of items) {
      const value = String(item.value || '').trim();
      const label = String(item.label || '').trim();
      if (value && label && !map.has(value)) map.set(value, { value, label });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  };
  return {
    scoped,
    commissionPercent: voucherReportCommissionPercent(data.settings || {}),
    nas: unique(orders.map((order) => ({
      value: order.nasId || order.nasName || '',
      label: order.nasName || order.nasId || ''
    }))),
    profiles: unique(orders.map((order) => ({
      value: order.profileId || order.profileName || order.packageLabel || '',
      label: order.profileName || order.packageLabel || order.profileId || ''
    }))),
    resellers: scoped
      ? [{ value: user.username || '', label: user.name || user.username || 'Saya' }]
      : unique((data.users || [])
        .filter((row) => String(row.role || '') === 'reseller_voucher')
        .map((row) => ({ value: row.username || '', label: row.name || row.username || '' })))
  };
}

function filterVoucherReportOrders(data = {}, orders = [], query = {}, user = {}) {
  const scoped = String(user.role || '') === 'reseller_voucher';
  const nas = String(query.nas || '').trim().toLowerCase();
  const reseller = scoped
    ? String(user.username || '').trim().toLowerCase()
    : String(query.reseller || '').trim().toLowerCase();
  const profile = String(query.profile || '').trim().toLowerCase();
  const method = String(query.method || '').trim().toLowerCase();
  return orders
    .map((order) => enrichVoucherOrderForReport(data, order))
    .filter((order) => {
      if (nas && nas !== 'all' && ![order.nasId, order.nasName].some((value) => String(value || '').toLowerCase() === nas)) return false;
      if (reseller && reseller !== 'all' && ![order.resellerUsername, order.createdByUsername].some((value) => String(value || '').toLowerCase() === reseller)) return false;
      if (profile && profile !== 'all' && ![order.profileId, order.profileName, order.packageLabel].some((value) => String(value || '').toLowerCase() === profile)) return false;
      if (method && method !== 'all' && order.methodGroup !== method) return false;
      return true;
    });
}

function voucherReportSummary(orders = []) {
  return {
    totalCount: orders.length,
    totalAmount: orders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
    voucherCount: orders.reduce((sum, order) => sum + Number(order.quantity || order.vouchers?.length || 0), 0),
    commissionAmount: orders.reduce((sum, order) => sum + Number(order.commissionAmount || 0), 0),
    netAmount: orders.reduce((sum, order) => sum + Number(order.netAmount || 0), 0),
    cashAmount: orders.filter((order) => order.methodGroup === 'cash').reduce((sum, order) => sum + Number(order.amount || 0), 0),
    transferAmount: orders.filter((order) => order.methodGroup !== 'cash').reduce((sum, order) => sum + Number(order.amount || 0), 0)
  };
}

async function dashboardResellerVoucherScope(data = {}, user = {}, period = currentPeriod()) {
  const selectedPeriod = normalizePeriod(period);
  const percent = dashboardCommissionPercent(data.settings || {}, 'voucherRevenueSharePercent');
  const orders = voucherOrdersVisibleForUser(data, await paidVoucherOrdersForReport(data, selectedPeriod), user);
  const gross = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const voucherCount = orders.reduce((sum, order) => sum + Number(order.quantity || order.vouchers?.length || 0), 0);
  return {
    type: 'reseller_voucher',
    title: 'Pendapatan Reseller Voucher',
    earning: Math.round((gross * percent) / 100),
    transactionCount: orders.length,
    itemCount: voucherCount,
    ratePercent: percent,
    fixedDailyAmount: 0,
    activeDays: 0,
    metricLabel: 'Pendapatan Voucher Saya',
    countLabel: 'Voucher Saya',
    helperText: 'Dihitung dari voucher Hotspot yang dibuat atau dikelola oleh akun ini.'
  };
}

async function dashboardPersonalScope(data = {}, user = {}, period = currentPeriod()) {
  const role = String(user.role || '').trim();
  if (role === 'collector') return dashboardCollectorScope(data, user, period);
  if (role === 'reseller_voucher') return dashboardResellerVoucherScope(data, user, period);
  return null;
}

async function publicDashboardSummary(summary = {}, data = {}, user = {}, period = currentPeriod()) {
  if (dashboardFinanceAllowed(user)) {
    return summary;
  }
  const personalScope = await dashboardPersonalScope(data, user, period);
  return personalScope ? { period: summary.period, personalScope } : { period: summary.period };
}

function dashboardMonthlyTransactionCount(data = {}, period = currentPeriod()) {
  const selectedPeriod = normalizePeriod(period);
  const dateInPeriod = (value = '') => String(value || '').slice(0, 7) === selectedPeriod;
  const payments = activePayments(data).filter((payment) => dateInPeriod(payment.paidAt || payment.createdAt)).length;
  const externalIncomes = (data.externalIncomes || []).filter((income) => {
    const status = String(income.status || '').toLowerCase();
    return dateInPeriod(income.date || income.createdAt) && !['cancelled', 'canceled', 'void', 'batal'].includes(status);
  }).length;
  const expenses = (data.expenses || []).filter((expense) => dateInPeriod(expense.date || expense.createdAt)).length;
  return payments + externalIncomes + expenses;
}

function radiusRemovedRecordCount(data = {}, serviceType = 'pppoe', period = currentPeriod()) {
  const selectedPeriod = normalizePeriod(period || currentPeriod());
  const selectedType = String(serviceType || '').trim().toLowerCase();
  return (data.radiusRemovedRecords || []).filter((record) => {
    const type = String(record.serviceType || 'pppoe').trim().toLowerCase();
    const removedPeriod = String(record.removedAt || record.createdAt || '').slice(0, 7);
    return type === selectedType && removedPeriod === selectedPeriod;
  }).length;
}

function dashboardRadiusServiceSummary(data = {}, serviceType = 'pppoe', period = currentPeriod()) {
  const selectedPeriod = normalizePeriod(period);
  const users = (data.radiusUsers || []).filter((user) => user.serviceType === serviceType);
  const counts = {
    total: users.length,
    new: 0,
    online: 0,
    sessionOnline: 0,
    active: 0,
    activeAccounts: 0,
    isolated: 0,
    terminated: 0,
    removed: 0
  };
  users.forEach((user) => {
    if (String(user.createdAt || '').slice(0, 7) === selectedPeriod) counts.new += 1;
    const status = normalizeCustomerStatusLocal(user.status);
    if (status === 'isolated') counts.isolated += 1;
    else if (status === 'terminate') counts.terminated += 1;
    else if (status === 'removed') {
      // Cabut dihitung dari arsip delete PPP-DHCP per periode, bukan status yang tersisa.
    }
    else counts.active += 1;
  });
  counts.removed += radiusRemovedRecordCount(data, serviceType, selectedPeriod);
  counts.activeAccounts = counts.active;
  return counts;
}

async function dashboardRadiusSummary(data = {}, period = currentPeriod()) {
  const summary = {
    pppDhcp: dashboardRadiusServiceSummary(data, 'pppoe', period),
    hotspot: dashboardRadiusServiceSummary(data, 'hotspot', period),
    sessionSource: 'freeradius-radacct',
    sessionError: ''
  };
  try {
    const sessionPayload = await freeradiusSessions.activeSessions({ limit: 5000, allowCache: false });
    const sessions = Array.isArray(sessionPayload.rows) ? sessionPayload.rows : [];
    const usersByUsername = new Map((data.radiusUsers || []).map((user) => [radiusSessionUsername(user.username), user]));
    const online = {
      pppoe: new Set(),
      hotspot: new Set()
    };
    for (const session of sessions) {
      const username = radiusSessionUsername(session.username);
      if (!username) continue;
      const user = usersByUsername.get(username) || null;
      const serviceType = user?.serviceType || radiusSessionServiceType(data, session, user);
      if (serviceType === 'hotspot') online.hotspot.add(username);
      else if (serviceType === 'pppoe') online.pppoe.add(username);
    }
    summary.pppDhcp.online = online.pppoe.size;
    summary.pppDhcp.sessionOnline = online.pppoe.size;
    summary.hotspot.online = online.hotspot.size;
    summary.hotspot.sessionOnline = online.hotspot.size;
    summary.sessionSource = sessionPayload.source || 'freeradius-radacct';
    if (sessionPayload.ok === false) {
      summary.sessionError = sessionPayload.error || 'Session FreeRADIUS tidak bisa dibaca';
    }
  } catch (error) {
    summary.sessionError = error.message || 'Session FreeRADIUS tidak bisa dibaca';
  }
  return summary;
}

function monitoringRadiusSessionRows(data = {}, sessions = []) {
  const profiles = radiusProfileDirectory(data);
  const nasMap = radiusNasDirectory(data);
  const nasAddressMap = radiusNasByAddress(data);
  const customers = radiusCustomerDirectory(data);
  const usersByUsername = radiusUserByUsername(data);
  return (sessions || [])
    .map((session) => {
      const user = usersByUsername.get(radiusSessionUsername(session.username)) || null;
      const type = radiusSessionServiceType(data, session, user);
      if (!['pppoe', 'hotspot'].includes(type)) return null;
      const profile = user ? (profiles.get(user.profileId) || {}) : {};
      const nas = (user && nasMap.get(user.nasId)) || nasAddressMap.get(String(session.nasIpAddress || '').toLowerCase()) || {};
      const customer = user ? (customers.get(user.customerId) || {}) : {};
      const username = session.username || user?.username || '';
      const clientIp = session.framedIpAddress || user?.staticIp || '';
      const siteId = nas.id || user?.nasId || session.nasIpAddress || 'unknown';
      const siteName = nas.name || customer.site || session.nasIpAddress || 'NAS';
      return {
        id: session.id || session.uniqueId || `${type}:${username}:${session.startedAt || ''}`,
        siteId,
        siteName,
        siteLocation: nas.site || customer.site || '',
        host: nas.address || session.nasIpAddress || '',
        nasIpAddress: session.nasIpAddress || nas.address || '',
        type,
        username,
        interfaceName: session.nasPortId || (type === 'pppoe' ? `<pppoe-${username}>` : username) || '-',
        customerName: customer.name || user?.customerName || '',
        profile: profile.name || '',
        ipAddress: clientIp,
        framedIpAddress: session.framedIpAddress || '',
        staticIp: user?.staticIp || '',
        macAddress: session.callingStationId || user?.callerId || '',
        status: 'online',
        startedAt: session.startedAt || '',
        updatedAt: session.updatedAt || session.startedAt || '',
        uptime: session.uptime || '',
        totalUsageText: session.totalUsageText || '',
        usageText: session.usageText || '',
        source: 'freeradius-radacct'
      };
    })
    .filter(Boolean);
}

function siteMatchesMonitoringRow(site = {}, row = {}) {
  const rowSiteId = String(row.siteId || '').toLowerCase();
  const rowHost = String(row.host || row.nasIpAddress || '').toLowerCase();
  return [site.id, site.name].some((value) => String(value || '').toLowerCase() === rowSiteId)
    || [site.host, site.ipAddress].some((value) => String(value || '').toLowerCase() === rowHost);
}

function monitoringCustomerRowKey(row = {}, fallbackType = '') {
  const type = String(row.type || fallbackType || '').trim().toLowerCase();
  const username = radiusSessionUsername(row.username || row.interfaceName || '');
  return type && username ? `${type}:${username}` : '';
}

function enrichMonitoringCustomerRow(row = {}, radiusRow = null, fallbackType = '') {
  const type = row.type || fallbackType || radiusRow?.type || '';
  const radiusIpAddress = radiusRow?.framedIpAddress || radiusRow?.ipAddress || '';
  return {
    ...(radiusRow || {}),
    ...row,
    type,
    customerName: row.customerName || radiusRow?.customerName || '',
    profile: row.profile || radiusRow?.profile || '',
    ipAddress: radiusIpAddress || row.ipAddress || row.staticIp || '',
    framedIpAddress: radiusRow?.framedIpAddress || row.framedIpAddress || '',
    staticIp: row.staticIp || radiusRow?.staticIp || '',
    macAddress: row.macAddress || radiusRow?.macAddress || '',
    nasIpAddress: row.nasIpAddress || radiusRow?.nasIpAddress || '',
    host: row.host || radiusRow?.host || '',
    source: row.source || 'mikrotik-snmp',
    radiusSource: radiusRow?.source || ''
  };
}

function applyRadiusSessionsToMonitoringCustomers(data = {}, payload = {}, sessionPayload = {}) {
  const sessionOk = sessionPayload.ok !== false;
  const sites = Array.isArray(payload.sites) ? payload.sites.map((site) => ({ ...site })) : [];
  if (!sessionOk) {
    return {
      ...payload,
      summary: {
        ...(payload.summary || {}),
        sessionSource: sessionPayload.source || 'freeradius-radacct',
        sessionError: sessionPayload.error || 'Session FreeRADIUS tidak bisa dibaca'
      }
    };
  }

  const rows = monitoringRadiusSessionRows(data, sessionPayload.rows || []);
  const rowsByKey = new Map(rows.map((row) => [monitoringCustomerRowKey(row), row]).filter(([key]) => key));
  const usedKeys = new Set();
  const ensureSite = (row) => {
    let site = sites.find((entry) => siteMatchesMonitoringRow(entry, row));
    if (site) return site;
    site = {
      id: row.siteId || row.host || row.siteName || 'unknown',
      name: row.siteName || row.host || 'NAS',
      host: row.host || row.nasIpAddress || '',
      location: row.siteLocation || '',
      status: 'up',
      online: 0,
      totalCustomerInterfaces: 0,
      pppoe: 0,
      hotspot: 0,
      pppoeUsers: [],
      hotspotUsers: [],
      interfaceCount: 0,
      oid: '',
      error: '',
      latencyMs: 0,
      checkedAt: new Date().toISOString()
    };
    sites.push(site);
    return site;
  };

  for (const site of sites) {
    site.pppoeUsers = (Array.isArray(site.pppoeUsers) ? site.pppoeUsers : []).map((row) => {
      const key = monitoringCustomerRowKey(row, 'pppoe');
      const radiusRow = key ? rowsByKey.get(key) : null;
      if (key && radiusRow) usedKeys.add(key);
      return enrichMonitoringCustomerRow(row, radiusRow, 'pppoe');
    });
    site.hotspotUsers = (Array.isArray(site.hotspotUsers) ? site.hotspotUsers : []).map((row) => {
      const key = monitoringCustomerRowKey(row, 'hotspot');
      const radiusRow = key ? rowsByKey.get(key) : null;
      if (key && radiusRow) usedKeys.add(key);
      return enrichMonitoringCustomerRow(row, radiusRow, 'hotspot');
    });
  }

  for (const row of rows) {
    const key = monitoringCustomerRowKey(row);
    if (key && usedKeys.has(key)) continue;
    const site = ensureSite(row);
    const next = {
      ...row,
      siteId: site.id || row.siteId,
      siteName: site.name || row.siteName,
      siteLocation: row.siteLocation || site.location || site.host || '',
      host: row.host || site.host || ''
    };
    if (key) usedKeys.add(key);
    if (row.type === 'hotspot') site.hotspotUsers.push(next);
    else site.pppoeUsers.push(next);
  }

  for (const site of sites) {
    site.pppoe = site.pppoeUsers.length;
    site.hotspot = site.hotspotUsers.length;
    site.online = site.pppoe;
    site.totalCustomerInterfaces = site.pppoe + site.hotspot;
  }

  const previousSummary = payload.summary || {};
  const summary = sites.reduce((totals, site) => {
    totals.online += Number(site.online || 0);
    totals.pppoe += Number(site.pppoe || 0);
    totals.hotspot += Number(site.hotspot || 0);
    totals.totalCustomerInterfaces += Number(site.totalCustomerInterfaces || 0);
    totals.interfaceCount += Number(site.interfaceCount || 0);
    if (site.status === 'up') totals.upCount += 1;
    if (site.status === 'down') totals.downCount += 1;
    return totals;
  }, {
    online: 0,
    pppoe: 0,
    hotspot: 0,
    totalCustomerInterfaces: 0,
    interfaceCount: 0,
    upCount: 0,
    downCount: 0
  });

  return {
    ...payload,
    ok: payload.ok !== false || sessionOk,
    source: 'mikrotik-snmp+freeradius-radacct',
    summary: {
      ...previousSummary,
      ...summary,
      siteCount: sites.length,
      customerMode: 'snmp-list-and-radius-ip-priority',
      onlineMeaning: 'snmp-active-interfaces-with-radius-session-ip',
      generatedAt: new Date().toISOString(),
      sourceMode: 'mikrotik-snmp+freeradius-radacct',
      sessionSource: sessionPayload.source || 'freeradius-radacct',
      sessionError: ''
    },
    sites
  };
}

function memberIdentityKey(member = {}) {
  return [
    member.id,
    member.uuid,
    member.accountId,
    member.userId,
    member.pppoeId,
    member.internet,
    member.username,
    member.fullName
  ].map((value) => String(value || '').trim().toLowerCase()).find(Boolean) || '';
}

function dashboardMemberEntry(member = {}, status = '') {
  const key = memberIdentityKey(member);
  if (!key) return null;
  return {
    key,
    id: member.id || '',
    userId: member.userId || member.accountId || '',
    username: member.internet || member.username || '',
    name: member.fullName || member.customerName || member.internet || member.username || '',
    status,
    lastSeenAt: new Date().toISOString()
  };
}

function dashboardMemberStore(data = {}) {
  const radbooxSettings = data.settings?.radboox;
  return radbooxSettings && typeof radbooxSettings.dashboardMembers === 'object'
    ? radbooxSettings.dashboardMembers
    : {};
}

function publicDashboardMembers(summary = {}) {
  return {
    ok: summary.ok !== false,
    active: Number(summary.active || 0),
    isolated: Number(summary.isolated || 0),
    terminated: Number(summary.terminated || 0),
    removed: Number(summary.removed || 0),
    newlyRemoved: Number(summary.newlyRemoved || 0),
    checkedAt: summary.checkedAt || '',
    source: summary.source || 'local',
    cache: summary.cache || '',
    trackingReady: Boolean(summary.trackingReady),
    error: summary.error || ''
  };
}

function localMemberSummaryRows(data = {}) {
  const resolver = radiusStatusResolver(data);
  const rows = (data.customers || []).map((customer) => {
    const paymentType = String(customer.paymentType || 'postpaid').trim().toLowerCase();
    const billingPeriod = String(customer.billingPeriod || 'fixed').trim().toLowerCase();
    return {
      status: resolver.statusForCustomer(customer),
      paymentType,
      billingPeriod
    };
  });
  return {
    total: rows.length,
    prepaidFixed: rows.filter((row) => row.paymentType === 'prepaid' && row.billingPeriod === 'fixed').length,
    prepaidRenewal: rows.filter((row) => row.paymentType === 'prepaid' && row.billingPeriod === 'renewal').length,
    postpaidFixed: rows.filter((row) => row.paymentType === 'postpaid' && row.billingPeriod === 'fixed').length,
    postpaidCycle: rows.filter((row) => row.paymentType === 'postpaid' && row.billingPeriod === 'cycle').length
  };
}

async function fetchDashboardMemberGroup(settings = {}, status = '') {
  const limit = 25;
  const members = [];
  let totalRows = 0;
  let capped = false;
  for (let page = 1; page <= RADBOOX_DASHBOARD_MEMBER_MAX_PAGES; page += 1) {
    const result = await radboox.listBillingMembers(settings, {
      page,
      limit,
      status,
      search: '',
      mode: 'web'
    });
    const rows = Array.isArray(result.members) ? result.members : [];
    members.push(...rows);
    totalRows = Number(result.totalRows || totalRows || members.length);
    if (!rows.length || rows.length < limit || members.length >= totalRows) {
      break;
    }
    if (page === RADBOOX_DASHBOARD_MEMBER_MAX_PAGES) {
      capped = true;
    }
  }
  return {
    totalRows: totalRows || members.length,
    members,
    capped
  };
}

async function fetchDashboardMemberSummary(settings = {}) {
  const [active, isolated, terminated] = await Promise.all([
    fetchDashboardMemberGroup(settings, 'active'),
    fetchDashboardMemberGroup(settings, 'suspend'),
    fetchDashboardMemberGroup(settings, 'terminate')
  ]);
  const entries = [];
  [
    ['active', active.members],
    ['isolated', isolated.members],
    ['terminated', terminated.members]
  ].forEach(([status, members]) => {
    members.map((member) => dashboardMemberEntry(member, status)).filter(Boolean).forEach((entry) => {
      entries.push(entry);
    });
  });
  const deduped = new Map();
  entries.forEach((entry) => {
    if (!deduped.has(entry.key)) {
      deduped.set(entry.key, entry);
    }
  });
  return {
    active: active.totalRows,
    isolated: isolated.totalRows,
    terminated: terminated.totalRows,
    members: [...deduped.values()],
    capped: active.capped || isolated.capped || terminated.capped,
    checkedAt: new Date().toISOString()
  };
}

function mergeDashboardRemovedMembers(previous = {}, currentMembers = []) {
  const previousMembers = Array.isArray(previous.members) ? previous.members : [];
  const existingRemoved = Array.isArray(previous.removedMembers) ? previous.removedMembers : [];
  const currentKeys = new Set(currentMembers.map((member) => member.key).filter(Boolean));
  const removedKeys = new Set(existingRemoved.map((member) => member.key).filter(Boolean));
  const removedAt = new Date().toISOString();
  const newlyRemoved = previousMembers
    .filter((member) => member.key && !currentKeys.has(member.key) && !removedKeys.has(member.key))
    .map((member) => ({
      ...member,
      removedAt
    }));
  return {
    removedMembers: [...newlyRemoved, ...existingRemoved].slice(0, 5000),
    newlyRemoved
  };
}

async function dashboardCustomerSummary(data = {}, options = {}) {
  const selectedPeriod = normalizePeriod(options.period || currentPeriod());
  if (standaloneMode(data)) {
    const customers = Array.isArray(data.customers) ? data.customers : [];
    const resolver = radiusStatusResolver(data);
    const aliasToCustomerId = new Map();
    customers.forEach((customer) => {
      customerKeys(customer).forEach((key) => aliasToCustomerId.set(key, String(customer.id || key).toLowerCase()));
    });
    const statusByKey = new Map();
    const addStatus = (key, status) => {
      const cleanKey = String(key || '').trim().toLowerCase();
      if (!cleanKey) return;
      statusByKey.set(cleanKey, strongestCustomerStatus(statusByKey.get(cleanKey), status));
    };
    customers.forEach((customer) => {
      const status = resolver.statusForCustomer(customer);
      const keys = customerKeys(customer);
      addStatus(keys[0] || customer.id, status);
    });
    (data.radiusUsers || []).forEach((user) => {
      const key = aliasToCustomerId.get(String(user.customerId || '').trim().toLowerCase())
        || aliasToCustomerId.get(String(user.id || '').trim().toLowerCase())
        || aliasToCustomerId.get(String(user.username || '').trim().toLowerCase())
        || String(user.customerId || user.username || user.id || '').trim().toLowerCase();
      addStatus(key, resolver.statusForRadiusUser(user));
    });
    const statuses = [...statusByKey.values()];
    const active = statuses.filter((status) => normalizeCustomerStatusLocal(status) === 'active').length;
    const isolated = statuses.filter((status) => normalizeCustomerStatusLocal(status) === 'isolated').length;
    const terminated = statuses.filter((status) => normalizeCustomerStatusLocal(status) === 'terminate').length;
    const removed = radiusRemovedRecordCount(data, 'pppoe', selectedPeriod);
    return publicDashboardMembers({
      ok: true,
      source: 'local',
      active,
      isolated,
      terminated,
      removed,
      newlyRemoved: 0,
      checkedAt: new Date().toISOString(),
      trackingReady: true,
      cache: 'local'
    });
  }

  const stored = dashboardMemberStore(data);
  const checkedAtMs = Date.parse(stored.checkedAt || '');
  const fresh = checkedAtMs && Date.now() - checkedAtMs < RADBOOX_DASHBOARD_MEMBER_TTL_MS;
  if (!options.force && fresh) {
    return publicDashboardMembers({
      ...stored,
      cache: 'store'
    });
  }
  const info = radboox.status(data.settings || {});
  if (!info.credentialReady) {
    return publicDashboardMembers({
      ...stored,
      ok: false,
      cache: stored.checkedAt ? 'store-stale' : '',
      error: 'Kredensial Radboox belum tersedia'
    });
  }

  try {
    const fetched = await fetchDashboardMemberSummary(data.settings);
    const previous = dashboardMemberStore(data);
    const hasPreviousSnapshot = Array.isArray(previous.members) && previous.members.length > 0;
    const completeSnapshot = !fetched.capped;
    const removed = hasPreviousSnapshot && completeSnapshot
      ? mergeDashboardRemovedMembers(previous, fetched.members)
      : {
        removedMembers: Array.isArray(previous.removedMembers) ? previous.removedMembers : [],
        newlyRemoved: []
      };
    const nextSummary = {
      ok: true,
      source: 'radboox',
      active: Number(fetched.active || 0),
      isolated: Number(fetched.isolated || 0),
      terminated: Number(fetched.terminated || 0),
      removed: removed.removedMembers.length,
      newlyRemoved: removed.newlyRemoved.length,
      checkedAt: fetched.checkedAt,
      trackingReady: hasPreviousSnapshot && completeSnapshot,
      capped: Boolean(fetched.capped),
      members: fetched.members,
      removedMembers: removed.removedMembers,
      error: ''
    };
    const mutation = await mutate((store) => {
      store.settings = store.settings || {};
      store.settings.radboox = store.settings.radboox || {};
      store.settings.radboox.dashboardMembers = nextSummary;
      if (removed.newlyRemoved.length) {
        addActivity(store, 'sync', `${removed.newlyRemoved.length} user Radboox terdeteksi cabut`, {
          count: removed.newlyRemoved.length
        });
      }
      return nextSummary;
    });
    return publicDashboardMembers({
      ...mutation.result,
      cache: ''
    });
  } catch (error) {
    return publicDashboardMembers({
      ...stored,
      ok: false,
      cache: stored.checkedAt ? 'store-stale' : '',
      error: error.message || 'Ringkasan member Radboox belum bisa dibaca'
    });
  }
}

function transactionItems(payload) {
  return (Array.isArray(payload.items) ? payload.items : [payload])
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const amount = Number(item.amount || item.subtotal || item.baseAmount) || 0;
      return {
        ...item,
        amount
      };
    })
    .filter((item) => item.amount > 0);
}

function linePayloadAmount(item = {}) {
  const amount = Number(item.amount || item.subtotal || item.baseAmount) || 0;
  if (amount > 0) return amount;
  const quantity = Number(item.quantity || item.qty || item.pcs) || 1;
  const unitPrice = Number(item.unitPrice || item.price || item.unitAmount) || 0;
  return Math.round(Math.max(1, quantity) * unitPrice);
}

function payloadAmount(payload) {
  if (Array.isArray(payload.items)) {
    return payload.items.reduce((sum, item) => {
      if (!item || typeof item !== 'object') return sum;
      return sum + linePayloadAmount(item);
    }, 0);
  }
  return linePayloadAmount(payload);
}

function radbooxFreshness(earning) {
  if (!earning || !earning.fetchedAt) {
    return {
      lastFetchedAt: '',
      ageMs: null,
      stale: true
    };
  }

  const fetchedAt = new Date(earning.fetchedAt).getTime();
  const ageMs = Number.isFinite(fetchedAt) ? Date.now() - fetchedAt : null;
  return {
    lastFetchedAt: earning.fetchedAt,
    ageMs,
    stale: ageMs === null || ageMs > RADBOOX_STALE_MS
  };
}

function upsertRadbooxDailyReport(data, report) {
  if (!Array.isArray(data.radbooxDailyReports)) {
    data.radbooxDailyReports = [];
  }
  const date = normalizeDateParam(report.date);
  const now = new Date().toISOString();
  const next = {
    ...report,
    date,
    updatedAt: now
  };
  const index = data.radbooxDailyReports.findIndex((item) => item.date === date);
  const existing = index === -1 ? null : data.radbooxDailyReports[index];
  const shouldLogActivity = !existing ||
    Number(existing.totalIncome || 0) !== Number(next.totalIncome || 0) ||
    Number(existing.transactionCount || 0) !== Number(next.transactionCount || 0) ||
    Number(existing.cashIncome || 0) !== Number(next.cashIncome || 0) ||
    Number(existing.transferIncome || 0) !== Number(next.transferIncome || 0);
  if (index === -1) {
    data.radbooxDailyReports.push(next);
  } else {
    data.radbooxDailyReports[index] = {
      ...data.radbooxDailyReports[index],
      ...next
    };
  }
  if (shouldLogActivity) {
    addActivity(data, 'sync', `Tagihan harian Radboox ${date}: ${Number(next.totalIncome || 0).toLocaleString('id-ID')}`, {
      date,
      amount: Number(next.totalIncome || 0),
      transactionCount: Number(next.transactionCount || 0)
    });
  }
  return index === -1 ? next : data.radbooxDailyReports[index];
}

function dailyReportResponse(report) {
  if (!report) {
    return null;
  }
  const adminAliases = {
    47304: 'fakenet'
  };
  return {
    ...report,
    adminDirectory: {
      ...(report.adminDirectory || {}),
      ...adminAliases
    },
    transactions: Array.isArray(report.transactions)
      ? report.transactions.map((item) => {
        const label = item && item.adminId ? adminAliases[item.adminId] : '';
        return label ? { ...item, adminName: label, admin: label } : item;
      })
      : []
  };
}

function localDailyReport(data = {}, date = normalizeDateParam(), options = {}) {
  const invoices = new Map((data.invoices || []).map((invoice) => [invoice.id, invoice]));
  const customers = new Map((data.customers || []).map((customer) => [customer.id, customer]));
  const sites = localBillingSites(data);
  const payments = Array.isArray(options.payments) ? options.payments : activePayments(data);
  const includeDueInvoices = options.includeDueInvoices !== false;
  const paymentsForDate = new Map();
  for (const payment of payments) {
    const paidDate = String(payment.paidAt || payment.createdAt || '').slice(0, 10);
    if (paidDate !== date) continue;
    paymentsForDate.set(payment.invoiceId, payment);
  }
  const invoiceIds = new Set([
    ...[...paymentsForDate.keys()].filter(Boolean),
    ...(includeDueInvoices
      ? (data.invoices || [])
        .filter((invoice) => String(invoice.dueDate || '').slice(0, 10) === date && String(invoice.status || '').toLowerCase() !== 'cancelled')
        .map((invoice) => invoice.id)
      : [])
  ]);
  const transactions = [...invoiceIds]
    .map((invoiceId) => {
      const invoice = invoices.get(invoiceId) || {};
      const payment = paymentsForDate.get(invoiceId) || null;
      const customer = customers.get(payment?.customerId || invoice.customerId) || {};
      const siteName = customer.site || customer.siteName || customer.nas || invoice.siteName || '';
      const site = sites.find((item) => item.name === siteName || item.id === siteName) || {};
      const method = payment?.method || invoice.paymentMethod || 'Tunai';
      const status = invoiceRuntimeStatus(invoice);
      const admin = payment?.admin || payment?.createdBy || payment?.createdByName || invoice.createdByName || 'Sistem';
      const storedInvoiceNo = invoice.externalId || invoice.invoiceNo || invoice.id || payment?.invoiceId || payment?.id;
      const paidAt = payment?.createdAt || payment?.paidAt || invoice.paidAt || '';
      return {
        id: payment?.id || invoice.id,
        invoiceId: invoice.id || '',
        invoiceNo: displayBillingInvoiceNo(storedInvoiceNo),
        externalId: displayBillingInvoiceNo(storedInvoiceNo),
        legacyInvoiceNo: storedInvoiceNo,
        info: customer.name || invoice.customerName || invoice.username || payment?.id || invoice.id,
        customerName: customer.name || invoice.customerName || '',
        username: customer.username || invoice.username || '',
        phone: normalizeLocalPhone(customer.phone || customer.whatsapp || ''),
        item: invoice.packageName || customer.packageName || 'Tagihan internet',
        method: payment ? method : '-',
        status,
        admin,
        adminName: admin,
        adminId: admin,
        siteId: site.id || '',
        siteName: site.name || siteName || '',
        dueDate: invoice.dueDate || '',
        paymentAt: paidAt,
        paymentRaw: paidAt,
        paymentTime: paidAt ? new Date(paidAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' }) : '',
        amount: Number(invoice.amount || payment?.amount || 0),
        income: payment ? Number(payment.amount || invoice.amount || 0) : 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.paymentAt || a.dueDate || '').localeCompare(String(b.paymentAt || b.dueDate || '')));
  const transferIncome = transactions
    .filter((item) => /transfer|bank|qris|xendit|gateway/i.test(item.method || ''))
    .reduce((sum, item) => sum + Number(item.income || 0), 0);
  const totalIncome = transactions.reduce((sum, item) => sum + Number(item.income || 0), 0);
  const cashIncome = totalIncome - transferIncome;
  return {
    source: 'local',
    date,
    cashIncome,
    transferIncome,
    totalIncome,
    transactionCount: transactions.length,
    transactions,
    sites,
    adminDirectory: {},
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function activeReportSites(data = {}) {
  return (data.monitoringTargets || [])
    .filter((target) => target.status !== 'inactive')
    .map((target) => ({
      id: target.id,
      name: target.name,
      location: target.location,
      aliases: target.aliases
    }))
    .filter((site) => site.id && site.name);
}

function updateRadbooxAutoSyncStatus(data, patch = {}) {
  if (!data.settings || typeof data.settings !== 'object') {
    data.settings = {};
  }
  if (!data.settings.radboox || typeof data.settings.radboox !== 'object') {
    data.settings.radboox = {};
  }
  const current = data.settings.radboox.autoSync && typeof data.settings.radboox.autoSync === 'object'
    ? data.settings.radboox.autoSync
    : {};
  data.settings.radboox.autoSync = {
    ...current,
    ...patch,
    monthly: {
      ...(current.monthly || {}),
      ...(patch.monthly || {})
    },
    daily: {
      ...(current.daily || {}),
      ...(patch.daily || {})
    }
  };
  return data.settings.radboox.autoSync;
}

function sanitizeRadbooxSettings(payload, current, data) {
  const next = {
    ...current
  };

  for (const key of [
    'mode',
    'baseUrl',
    'apiBaseUrl',
    'earningsPath',
    'customersPath',
    'invoicesPath',
    'loginPath',
    'webEarningsPath',
    'webCustomersPath',
    'webInvoicesPath',
    'loginUsernameField',
    'loginPasswordField'
  ]) {
    if (typeof payload[key] === 'string') {
      next[key] = payload[key].trim();
    }
  }

  persistRadbooxCredentials(next, payload, data);

  return next;
}

function sanitizeOltManagerSettings(payload, current) {
  const next = {
    ...current
  };

  for (const key of [
    'baseUrl',
    'loginPath',
    'summaryPath',
    'onlineOnusPath',
    'lowRxOnusPath'
  ]) {
    if (typeof payload[key] === 'string') {
      next[key] = payload[key].trim();
    }
  }

  for (const key of ['token', 'username', 'password']) {
    if (typeof payload[key] === 'string' && payload[key].trim()) {
      next[key] = payload[key].trim();
    }
  }

  return next;
}

function sanitizeMediaServicesSettings(payload, current) {
  const next = {
    ...current
  };

  for (const key of ['tvheadendUrl', 'tvheadendUsername', 'embyUrl']) {
    if (typeof payload[key] === 'string') {
      next[key] = payload[key].trim();
    }
  }
  if (typeof payload.tvheadendPassword === 'string' && payload.tvheadendPassword.trim()) {
    next.tvheadendPassword = payload.tvheadendPassword.trim();
  }
  if (typeof payload.embyApiKey === 'string' && payload.embyApiKey.trim()) {
    next.embyApiKey = payload.embyApiKey.trim();
  }
  if (payload.siteServices && typeof payload.siteServices === 'object') {
    const currentSites = current.siteServices && typeof current.siteServices === 'object' ? current.siteServices : {};
    next.siteServices = { ...currentSites };
    for (const [siteId, servicePayload] of Object.entries(payload.siteServices)) {
      const cleanSiteId = String(siteId || '').trim();
      if (!cleanSiteId || !servicePayload || typeof servicePayload !== 'object') continue;
      const currentSite = currentSites[cleanSiteId] && typeof currentSites[cleanSiteId] === 'object'
        ? currentSites[cleanSiteId]
        : {};
      const nextSite = { ...currentSite };
      for (const key of ['tvheadendUrl', 'tvheadendUsername', 'embyUrl']) {
        if (typeof servicePayload[key] === 'string') {
          nextSite[key] = servicePayload[key].trim();
        }
      }
      if (typeof servicePayload.tvheadendPassword === 'string' && servicePayload.tvheadendPassword.trim()) {
        nextSite.tvheadendPassword = servicePayload.tvheadendPassword.trim();
      }
      if (typeof servicePayload.embyApiKey === 'string' && servicePayload.embyApiKey.trim()) {
        nextSite.embyApiKey = servicePayload.embyApiKey.trim();
      }
      next.siteServices[cleanSiteId] = nextSite;
    }
  }

  return next;
}

function sanitizeGenieAcsSettings(payload = {}, current = {}) {
  const next = { ...current };
  for (const key of [
    'usernameParameters',
    'rxPowerParameters',
    'wifiPasswordParameters',
    'wifiSsidParameters',
    'wifi5gSsidParameters',
    'wifiClientCountParameters',
    'wifi5gClientCountParameters'
  ]) {
    delete next[key];
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'enabled')) {
    next.enabled = payloadEnabled(payload.enabled);
  }
  if (typeof payload.baseUrl === 'string') {
    const raw = payload.baseUrl.trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(raw);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        next.baseUrl = parsed.toString().replace(/\/+$/, '');
      }
    } catch {
      if (!raw) next.baseUrl = '';
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'clearToken') && payloadEnabled(payload.clearToken)) {
    next.token = '';
  } else if (typeof payload.token === 'string') {
    next.token = keepSecret(current.token, payload.token);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'connectionRequest')) {
    next.connectionRequest = payloadEnabled(payload.connectionRequest);
  }
  return next;
}

function publicGenieAcsSettings(settings = {}) {
  const cfg = genieAcs.normalizeSettings(settings || {});
  return {
    enabled: cfg.enabled,
    baseUrl: cfg.baseUrl,
    connectionRequest: cfg.connectionRequest,
    token: '',
    tokenConfigured: Boolean(settings?.genieAcs?.token || process.env.GENIEACS_TOKEN),
    wifiKu: {
      enabled: settings?.wifiKu?.enabled !== false,
      publicPath: settings?.wifiKu?.publicPath || '/wifiku',
      requireOtp: settings?.wifiKu?.requireOtp !== false,
      otpTtlMinutes: clampInteger(settings?.wifiKu?.otpTtlMinutes, 1, 30, 5),
      sessionTtlHours: clampInteger(settings?.wifiKu?.sessionTtlHours, 1, 72, 12)
    }
  };
}

function sanitizeWifiKuSettings(payload = {}, current = {}) {
  const next = { ...current };
  if (Object.prototype.hasOwnProperty.call(payload, 'enabled')) {
    next.enabled = payloadEnabled(payload.enabled);
  }
  if (typeof payload.publicPath === 'string') {
    const pathValue = payload.publicPath.trim();
    next.publicPath = pathValue.startsWith('/') && !pathValue.startsWith('//')
      ? pathValue.replace(/\/+$/, '') || '/wifiku'
      : current.publicPath || '/wifiku';
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'requireOtp')) {
    next.requireOtp = payloadEnabled(payload.requireOtp);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'otpTtlMinutes')) {
    next.otpTtlMinutes = clampInteger(payload.otpTtlMinutes, 1, 30, current.otpTtlMinutes || 5);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'sessionTtlHours')) {
    next.sessionTtlHours = clampInteger(payload.sessionTtlHours, 1, 72, current.sessionTtlHours || 12);
  }
  return next;
}

function sanitizeRadiusSettings(payload = {}, current = {}) {
  const next = { ...current };
  if (typeof payload.isolationRateLimit === 'string') {
    next.isolationRateLimit = payload.isolationRateLimit.trim() || '128k/128k';
  }
  if (typeof payload.isolationMikrotikGroup === 'string') {
    next.isolationMikrotikGroup = payload.isolationMikrotikGroup.trim();
  }
  if (typeof payload.isolationPool === 'string') {
    next.isolationPool = payload.isolationPool.trim();
  }
  if (typeof payload.isolationNote === 'string') {
    next.isolationNote = payload.isolationNote.trim();
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'accountingInterimIntervalSeconds')) {
    next.accountingInterimIntervalSeconds = clampInteger(payload.accountingInterimIntervalSeconds, 0, 86400, 60);
  }
  return next;
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function sanitizeTime(value, fallback = '00:00') {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

function sanitizeBillingSettings(payload = {}, current = {}) {
  return {
    ...current,
    postpaidDueDay: clampInteger(payload.postpaidDueDay ?? payload.defaultDueDay, 1, 28, current.postpaidDueDay || 10),
    fixedInvoiceAdvanceDays: clampInteger(payload.fixedInvoiceAdvanceDays, 0, 31, current.fixedInvoiceAdvanceDays ?? 7),
    suspendGraceDays: clampInteger(payload.suspendGraceDays, 0, 365, current.suspendGraceDays || 0),
    notificationBeforeDueDays: clampInteger(payload.notificationBeforeDueDays, 0, 31, current.notificationBeforeDueDays || 0),
    autoSuspendTime: sanitizeTime(payload.autoSuspendTime, current.autoSuspendTime || '00:00'),
    invoiceNumberFormat: 'XXXXXX',
    invoiceBusinessCode: current.invoiceBusinessCode || 'FAKE.NET',
    notifyInvoiceIssued: payload.notifyInvoiceIssued !== false,
    notifyPaymentStatus: payload.notifyPaymentStatus !== false,
    notifyMemberStatus: payload.notifyMemberStatus !== false,
    mergeInvoice: payload.mergeInvoice === true
  };
}

function sanitizeReceiptBusinessCode(value, fallback = 'FAKE.NET') {
  const clean = String(value || '').trim().replace(/[^a-z0-9.-]+/gi, '').toUpperCase().slice(0, 30);
  return clean || fallback || 'FAKE.NET';
}

function keepSecret(currentValue, nextValue) {
  if (typeof nextValue !== 'string') return currentValue || '';
  const value = nextValue.trim();
  if (!value || value === 'tersimpan') return currentValue || '';
  return value;
}

function sanitizeWaGatewaySettings(payload = {}, current = {}) {
  const templates = payload.templates && typeof payload.templates === 'object' ? payload.templates : {};
  const templateBase = payload.resetTemplates === true ? DEFAULT_WA_TEMPLATES : (current.templates || {});
  const provider = normalizeWaProvider(payload.provider || current.provider || 'waha');
  const previousProvider = normalizeWaProvider(current.provider || 'waha');
  const providerDefault = WA_GATEWAY_PROVIDERS[provider] || WA_GATEWAY_PROVIDERS.waha;
  const requestedBaseUrl = String(payload.baseUrl || '').trim();
  return {
    ...current,
    enabled: Object.prototype.hasOwnProperty.call(payload, 'enabled') ? payload.enabled === true : current.enabled === true,
    provider,
    baseUrl: provider === 'waha'
      ? providerDefault.baseUrl
      : requestedBaseUrl || (provider !== previousProvider ? providerDefault.baseUrl : current.baseUrl) || providerDefault.baseUrl,
    token: provider === 'waha' ? '' : keepSecret(current.token, payload.token),
    tokenConfigured: undefined,
    sender: provider === 'waha' ? 'default' : String(payload.sender || current.sender || '').trim(),
    minDelaySeconds: clampInteger(payload.minDelaySeconds, 15, 3600, current.minDelaySeconds || 45),
    maxPerBatch: clampInteger(payload.maxPerBatch, 1, 200, current.maxPerBatch || 20),
    quietStart: sanitizeTime(payload.quietStart, current.quietStart || '08:00'),
    quietEnd: sanitizeTime(payload.quietEnd, current.quietEnd || '20:00'),
    templates: {
      ...templateBase,
      invoiceIssued: String(templates.invoiceIssued || templateBase.invoiceIssued || '').trim(),
      paymentReminder: String(templates.paymentReminder || templateBase.paymentReminder || '').trim(),
      invoiceOverdue: String(templates.invoiceOverdue || templateBase.invoiceOverdue || '').trim(),
      paymentPaid: String(templates.paymentPaid || templateBase.paymentPaid || '').trim(),
      paymentCancel: String(templates.paymentCancel || templateBase.paymentCancel || '').trim(),
      accountSuspend: String(templates.accountSuspend || templateBase.accountSuspend || '').trim(),
      accountActive: String(templates.accountActive || templateBase.accountActive || '').trim(),
      voucherIssued: String(templates.voucherIssued || templateBase.voucherIssued || '').trim(),
      voucherExpired: String(templates.voucherExpired || templateBase.voucherExpired || '').trim(),
      memberStatus: String(templates.memberStatus || templateBase.memberStatus || '').trim()
    }
  };
}

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localTodayIso() {
  const parts = localDateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localTimeText(date = new Date()) {
  const parts = localDateParts(date);
  return `${parts.hour}:${parts.minute}`;
}

function addDaysIso(dateIso = localTodayIso(), days = 0) {
  const [year, month, day] = String(dateIso).split('-').map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
  date.setUTCDate(date.getUTCDate() + Math.trunc(Number(days) || 0));
  return date.toISOString().slice(0, 10);
}

function invoiceGenerationDue(settings = {}, period = currentPeriod(), today = localTodayIso()) {
  const dueDate = dueDateForPeriod(period, settings.postpaidDueDay || 10);
  const advanceDays = clampInteger(settings.fixedInvoiceAdvanceDays ?? 7, 0, 31, 7);
  const advanceStart = addDaysIso(dueDate, -advanceDays);
  return today >= advanceStart;
}

function activeHotspotVoucherUsersWithValidity(data = {}) {
  const profiles = radiusProfileDirectory(data);
  return (data.radiusUsers || []).filter((user) => {
    if (user.serviceType !== 'hotspot' || user.status !== 'active' || !user.username) return false;
    if (user.validUntil) return false;
    const profile = profiles.get(user.profileId) || {};
    return Number(profile.validitySeconds || 0) > 0;
  });
}

function stampHotspotVoucherValidityFromFirstOnline(data = {}, firstOnlineByUsername = new Map(), actor = {}) {
  const profiles = radiusProfileDirectory(data);
  const nowIso = new Date().toISOString();
  const stamped = [];
  for (const user of activeHotspotVoucherUsersWithValidity(data)) {
    const profile = profiles.get(user.profileId) || {};
    const validitySeconds = Math.max(0, Math.trunc(Number(profile.validitySeconds || 0)) || 0);
    const firstOnlineAt = firstOnlineByUsername.get(radiusSessionUsername(user.username));
    const startedAtMs = Date.parse(firstOnlineAt || '');
    if (!validitySeconds || !Number.isFinite(startedAtMs)) continue;
    const validUntil = new Date(startedAtMs + (validitySeconds * 1000)).toISOString();
    user.voucherFirstOnlineAt = user.voucherFirstOnlineAt || new Date(startedAtMs).toISOString();
    user.voucherValidityStartedAt = user.voucherValidityStartedAt || user.voucherFirstOnlineAt;
    user.voucherValiditySeconds = validitySeconds;
    user.validUntil = validUntil;
    user.updatedAt = nowIso;
    user.updatedBy = actor.name || actor.username || 'Billing';
    stamped.push(user);
  }
  if (stamped.length) {
    addActivity(data, 'monitoring', `Masa aktif ${stamped.length} voucher Hotspot ditandai dari session pertama`, {
      action: 'hotspot-voucher-validity-stamp',
      count: stamped.length,
      usernames: stamped.map((user) => user.username).slice(0, 20)
    });
  }
  return stamped;
}

async function stampHotspotVoucherValidityFromSessions(data = {}, actor = {}) {
  const users = activeHotspotVoucherUsersWithValidity(data);
  if (!users.length) return [];
  const result = await freeradiusSessions.firstOnlineByUsernames(users.map((user) => user.username));
  if (!result.ok) return [];
  const firstOnlineByUsername = new Map((result.rows || [])
    .filter((row) => row.usernameKey && row.firstOnlineAt)
    .map((row) => [radiusSessionUsername(row.usernameKey), row.firstOnlineAt]));
  return stampHotspotVoucherValidityFromFirstOnline(data, firstOnlineByUsername, actor);
}

function syncCustomerToRadiusActive(data = {}, customer = {}, actor = {}) {
  const user = (data.radiusUsers || []).find((item) => {
    return item.customerId === customer.id
      || item.id === customer.radiusUserId
      || String(item.username || '').trim().toLowerCase() === String(customer.username || '').trim().toLowerCase();
  });
  if (!user) return null;
  user.status = 'active';
  user.isolatedAt = '';
  user.isolationSource = '';
  user.isolationReason = '';
  user.isolatedByName = '';
  user.isolatedByUsername = '';
  user.isolatedByRole = '';
  user.terminatedAt = '';
  user.terminationSource = '';
  user.terminationReason = '';
  user.terminatedByName = '';
  user.terminatedByUsername = '';
  user.terminatedByRole = '';
  user.updatedAt = new Date().toISOString();
  user.updatedBy = actor.name || actor.username || 'Billing';
  customer.status = 'active';
  customer.isolationSource = '';
  customer.isolationReason = '';
  customer.isolatedByName = '';
  customer.isolatedByUsername = '';
  customer.isolatedByRole = '';
  customer.terminatedAt = '';
  customer.terminationSource = '';
  customer.terminationReason = '';
  customer.terminatedByName = '';
  customer.terminatedByUsername = '';
  customer.terminatedByRole = '';
  customer.updatedAt = user.updatedAt;
  customer.updatedBy = user.updatedBy;
  return user;
}

function radiusUserForCustomer(data = {}, customer = {}) {
  if (!customer?.id && !customer?.username && !customer?.radiusUserId) return null;
  const username = String(customer.username || '').trim().toLowerCase();
  return (data.radiusUsers || []).find((item) => {
    return item.customerId === customer.id
      || item.id === customer.radiusUserId
      || (username && String(item.username || '').trim().toLowerCase() === username);
  }) || null;
}

function customerAutoReactivationState(data = {}, customer = {}) {
  const user = radiusUserForCustomer(data, customer) || {};
  const status = normalizeCustomerStatusLocal(customer.status || radiusStatusForCustomer(user));
  if (status === 'isolated') {
    return { eligible: true, requiresAdmin: false, status, source: customer.isolationSource || user.isolationSource || '', user };
  }
  if (status === 'terminate') {
    const source = terminationSourceText(customer.terminationSource, user.terminationSource);
    const eligible = billingManagedTerminationSource(source);
    return { eligible, requiresAdmin: !eligible, status, source, user };
  }
  return { eligible: false, requiresAdmin: false, status, source: '', user };
}

function hotspotVoucherOrderForUser(data = {}, user = {}) {
  const orders = Array.isArray(data.hotspotVoucherOrders) ? data.hotspotVoucherOrders : [];
  const userId = String(user.id || '');
  const username = radiusSessionUsername(user.username);
  return orders.find((order) => order.id && order.id === user.onlineOrderId)
    || orders.find((order) => Array.isArray(order.voucherUserIds) && order.voucherUserIds.includes(userId))
    || orders.find((order) => Array.isArray(order.vouchers) && order.vouchers.some((voucher) => {
      return String(voucher.id || '') === userId || radiusSessionUsername(voucher.username) === username;
    }))
    || {};
}

function hotspotVoucherTemplateValues(data = {}, order = {}, vouchers = [], user = {}) {
  const rows = (Array.isArray(vouchers) && vouchers.length ? vouchers : [user])
    .filter((voucher) => voucher && (voucher.username || voucher.id));
  const first = rows[0] || user || {};
  const profile = radiusFindProfile(data, first.profileId || user.profileId || order.profileId || order.profile, 'hotspot') || {};
  const nas = radiusFindNas(data, first.nasId || user.nasId || order.nasId || order.nas) || {};
  const customer = findCustomerForRadiusUser(data, user);
  const businessName = data.settings?.businessName || data.settings?.receiptBusinessCode || 'ISP Billing';
  const fullName = order.buyerName || customer.name || customer.username || first.voucherBuyerName || first.username || 'Pelanggan';
  const validity = profile.validity || (profile.validitySeconds ? `${Math.round(Number(profile.validitySeconds) / 3600)} jam` : '-');
  const validUntil = first.validUntil || user.validUntil || order.validUntil || '';
  const voucherList = rows.map((voucher, index) => {
    const password = voucher.password || voucher.voucherPassword || voucher.username || '';
    return `${index + 1}. ${voucher.username || ''}${password ? ` / ${password}` : ''}`;
  }).join('\n');
  const loginUrl = String(data.settings?.voucherLoginUrl || data.settings?.hotspotVoucherOnline?.loginUrl || '').trim() || '-';
  const amount = Number(order.amount || first.amount || user.amount || profile.price || 0);
  return {
    full_name: fullName,
    fullname: fullName,
    nama_usaha: businessName,
    reference: order.reference || first.onlineOrderReference || first.username || '',
    voucher_user: first.username || '',
    voucher_pass: first.password || first.voucherPassword || first.username || '',
    voucher_profile: order.packageLabel || order.profileName || profile.name || '',
    voucher_price: formatMoneyNumberText(order.unitPrice || first.amount || user.amount || profile.price || 0),
    amount: formatMoneyNumberText(amount),
    total: formatMoneyNumberText(amount),
    validity,
    valid_until: validUntil ? dateTimeDisplayText(validUntil) : 'Setelah login pertama',
    started_at: (first.voucherFirstOnlineAt || user.voucherFirstOnlineAt) ? dateTimeDisplayText(first.voucherFirstOnlineAt || user.voucherFirstOnlineAt) : '',
    expired_at: validUntil ? dateTimeDisplayText(validUntil) : '',
    login_url: loginUrl,
    voucher_list: voucherList,
    quantity: String(order.quantity || rows.length || 1),
    nas: order.nasName || nas.name || '',
    footer: businessName,
    status: order.status || user.status || ''
  };
}

function queueVoucherExpiryNotice(data = {}, user = {}, profile = {}, actor = {}) {
  const settings = data.settings?.hotspotVoucherOnline || {};
  if (settings.sendVoucherWa === false) return null;
  const order = hotspotVoucherOrderForUser(data, user);
  const customer = findCustomerForRadiusUser(data, user);
  const phone = order.whatsapp || user.voucherBuyerWhatsapp || customer?.whatsapp || customer?.phone || '';
  if (!phone) return null;
  const values = hotspotVoucherTemplateValues(data, order, [{ ...user, profileId: user.profileId || profile.id }], user);
  const template = data.settings?.waGateway?.templates?.voucherExpired || DEFAULT_WA_TEMPLATES.voucherExpired;
  const text = renderWaTemplate(template, values);
  if (!text.trim()) return null;
  return queueWaGatewayMessage(data, {
    type: 'voucherExpired',
    phone,
    recipientName: values.fullname,
    subject: `Voucher Hotspot ${values.voucher_user} expired`,
    text,
    actorName: actor.name || actor.username || ''
  });
}

function archiveHotspotVoucherRecord(data = {}, user = {}, profile = {}, mode = 'remove-record', actor = {}, nowIso = new Date().toISOString(), today = localTodayIso()) {
  data.radiusVoucherRecords = Array.isArray(data.radiusVoucherRecords) ? data.radiusVoucherRecords : [];
  const record = {
    ...user,
    id: user.id || createId('vrec'),
    radiusUserId: user.id || '',
    serviceType: 'hotspot',
    accessType: user.accessType || 'Hotspot',
    profileId: user.profileId || profile.id || '',
    profileName: profile.name || user.profileName || '',
    status: 'terminated',
    terminatedAt: user.terminatedAt || today,
    voucherExpiredAt: user.voucherExpiredAt || nowIso,
    voucherRecordMode: mode,
    archivedAt: nowIso,
    updatedAt: nowIso,
    updatedBy: actor.name || actor.username || 'Billing'
  };
  const existingIndex = data.radiusVoucherRecords.findIndex((item) => {
    return String(item.id || '') === String(record.id || '')
      || (record.username && String(item.username || '').trim().toLowerCase() === String(record.username).trim().toLowerCase());
  });
  if (existingIndex >= 0) {
    data.radiusVoucherRecords[existingIndex] = {
      ...data.radiusVoucherRecords[existingIndex],
      ...record
    };
  } else {
    data.radiusVoucherRecords.unshift(record);
  }
  data.radiusVoucherRecords = data.radiusVoucherRecords.slice(0, 5000);
  return existingIndex >= 0 ? data.radiusVoucherRecords[existingIndex] : record;
}

function applyHotspotVoucherExpirations(data = {}, actor = {}) {
  data.radiusUsers = Array.isArray(data.radiusUsers) ? data.radiusUsers : [];
  const nowIso = new Date().toISOString();
  const today = localTodayIso();
  const profiles = radiusProfileDirectory(data);
  const removed = [];
  const updated = [];
  const notices = [];
  const remaining = [];

  for (const user of data.radiusUsers) {
    const isExpirableVoucher = user.serviceType === 'hotspot'
      && user.status === 'active'
      && user.validUntil
      && String(user.validUntil) <= nowIso;
    if (!isExpirableVoucher) {
      remaining.push(user);
      continue;
    }

    const profile = profiles.get(user.profileId) || {};
    const mode = String(profile.expiredMode || 'none').trim().toLowerCase();
    if (mode === 'none') {
      remaining.push(user);
      continue;
    }

    user.voucherExpiredAt = user.voucherExpiredAt || nowIso;
    user.updatedAt = nowIso;
    user.updatedBy = actor.name || actor.username || 'Billing';

    if (!user.voucherExpiredNoticeAt) {
      const notice = queueVoucherExpiryNotice(data, user, profile, actor);
      if (notice) notices.push(notice);
      user.voucherExpiredNoticeAt = nowIso;
    }

    if (mode === 'remove') {
      removed.push(user);
      continue;
    }

    if (mode === 'remove-record') {
      user.status = 'terminated';
      user.terminatedAt = user.terminatedAt || today;
      updated.push(archiveHotspotVoucherRecord(data, user, profile, mode, actor, nowIso, today));
      continue;
    }

    if (mode === 'notice' || mode === 'notice-record') {
      user.status = 'terminated';
      user.terminatedAt = user.terminatedAt || today;
      user.voucherRecordMode = mode;
      updated.push(user);
    }

    remaining.push(user);
  }

  data.radiusUsers = remaining;
  if (removed.length || updated.length || notices.length) {
    addActivity(data, 'monitoring', `Expired voucher Hotspot: ${removed.length} dihapus, ${updated.length} direkam, ${notices.length} notifikasi`, {
      action: 'hotspot-voucher-expire',
      removed: removed.length,
      recorded: updated.length,
      notices: notices.length
    });
  }
  return { removed, updated, notices };
}

async function disconnectExpiredVoucherSessions(data = {}, voucherExpirations = {}, actor = {}) {
  const targets = [
    ...(voucherExpirations.removed || []),
    ...(voucherExpirations.updated || [])
  ].filter((user) => user && user.username);
  const results = [];
  for (const user of targets) {
    try {
      const coa = await freeradiusCoa.disconnectUser(data, user);
      results.push({ username: user.username, ok: coa.ok === true, coa });
    } catch (error) {
      results.push({ username: user.username, ok: false, error: error.message || 'CoA disconnect gagal' });
    }
  }
  if (results.length) {
    addActivity(data, 'monitoring', `CoA expired voucher Hotspot: ${results.filter((item) => item.ok).length}/${results.length} session diputus`, {
      action: 'hotspot-voucher-expire-coa',
      count: results.length,
      ok: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      actor: actor.name || actor.username || ''
    });
  }
  return results;
}

function paidInvoiceCoverageByCustomer(data = {}) {
  const coverage = new Map();
  for (const invoice of data.invoices || []) {
    if (!invoice.customerId || invoiceRuntimeStatus(invoice) !== 'paid' || !invoiceBlocksPeriod(invoice)) continue;
    const key = String(invoice.customerId);
    const periods = coverage.get(key) || new Set();
    for (const period of invoiceCoveredPeriods(invoice)) {
      periods.add(period);
    }
    coverage.set(key, periods);
  }
  return coverage;
}

function invoiceUncoveredPeriods(invoice = {}, paidCoverage = new Map()) {
  const periods = invoiceCoveredPeriods(invoice);
  if (!invoice.customerId || !periods.length) return periods;
  const covered = paidCoverage.get(String(invoice.customerId));
  if (!covered) return periods;
  return periods.filter((period) => !covered.has(period));
}

function customerHasUncoveredInvoices(data = {}, customer = {}) {
  if (!customer?.id) return false;
  const coverage = paidInvoiceCoverageByCustomer(data);
  return (data.invoices || []).some((item) => {
    if (item.customerId !== customer.id) return false;
    if (!['pending', 'overdue'].includes(invoiceRuntimeStatus(item))) return false;
    return invoiceUncoveredPeriods(item, coverage).length > 0;
  });
}

function reactivateCustomerAfterPaidInvoice(data = {}, invoice = {}, actor = {}) {
  const customer = customerForInvoice(data, invoice);
  if (!customer?.id) {
    return { customer: null, activatedUser: null, requiresAdmin: false, source: '' };
  }
  const state = customerAutoReactivationState(data, customer);
  if (!state.eligible) {
    return {
      customer,
      activatedUser: null,
      requiresAdmin: state.requiresAdmin,
      source: state.source,
      status: state.status
    };
  }
  if (customerHasUncoveredInvoices(data, customer)) {
    return { customer, activatedUser: null, requiresAdmin: false, source: state.source, status: state.status };
  }
  const activatedUser = syncCustomerToRadiusActive(data, customer, actor);
  return {
    customer,
    activatedUser,
    requiresAdmin: false,
    source: state.source,
    status: state.status
  };
}

function standaloneBillingAutomation(data = {}, actor = { username: 'billing-auto', name: 'Billing Auto' }) {
  if (!standaloneMode(data)) return { created: [], isolatedUsers: [], activatedUsers: [], voucherExpirations: { removed: [], updated: [], notices: [] } };
  const settings = data.settings?.billing || {};
  const today = localTodayIso();
  const period = currentPeriod();
  const created = invoiceGenerationDue(settings, period, today) ? generateInvoices(data, period) : [];
  const activatedUsers = [];
  const isolatedUsers = [];
  const reminderInvoices = [];
  const voucherExpirations = applyHotspotVoucherExpirations(data, actor);
  const customers = new Map((data.customers || []).map((customer) => [customer.id, customer]));
  const unpaidByCustomer = new Map();
  const paidCoverage = paidInvoiceCoverageByCustomer(data);

  for (const invoice of data.invoices || []) {
    const status = invoiceRuntimeStatus(invoice, today);
    if (!['pending', 'overdue'].includes(status)) continue;
    const uncoveredPeriods = invoiceUncoveredPeriods(invoice, paidCoverage);
    if (!uncoveredPeriods.length) continue;
    const key = invoice.customerId || '';
    if (!key) continue;
    const amount = Number(invoice.amount || 0);
    const current = unpaidByCustomer.get(key) || { dueDate: invoice.dueDate || '', amount: 0 };
    current.amount += amount;
    if (invoice.dueDate && (!current.dueDate || invoice.dueDate < current.dueDate)) {
      current.dueDate = invoice.dueDate;
    }
    unpaidByCustomer.set(key, current);
  }

  const reminderDays = Number(settings.notificationBeforeDueDays || 0);
  if (reminderDays > 0) {
    for (const invoice of data.invoices || []) {
      const status = invoiceRuntimeStatus(invoice, today);
      if (!['pending', 'overdue'].includes(status) || !invoice.dueDate) continue;
      if (!invoiceUncoveredPeriods(invoice, paidCoverage).length) continue;
      const reminderStart = addDaysIso(invoice.dueDate, -reminderDays);
      if (today < reminderStart || today > invoice.dueDate) continue;
      if (invoice.paymentReminderDueDate === invoice.dueDate && invoice.paymentReminderSentAt) continue;
      const queued = queueInvoiceWaMessage(data, invoice, 'paymentReminder', actor);
      if (!queued) continue;
      invoice.paymentReminderDueDate = invoice.dueDate;
      invoice.paymentReminderSentAt = new Date().toISOString();
      invoice.updatedAt = invoice.paymentReminderSentAt;
      reminderInvoices.push(invoice);
    }
  }

  for (const invoice of data.invoices || []) {
    if (invoiceRuntimeStatus(invoice, today) !== 'paid') continue;
    const customer = customers.get(invoice.customerId);
    if (!customer) continue;
    const hasUnpaid = unpaidByCustomer.has(customer.id);
    if (!hasUnpaid) {
      const activation = reactivateCustomerAfterPaidInvoice(data, invoice, actor);
      if (activation.activatedUser) activatedUsers.push(activation.activatedUser);
    }
  }

  const graceDays = Number(settings.suspendGraceDays || 0);
  if (graceDays > 0 && localTimeText() >= (settings.autoSuspendTime || '00:00')) {
    for (const [customerId, info] of unpaidByCustomer.entries()) {
      if (!info.dueDate || today < addDaysIso(info.dueDate, graceDays)) continue;
      const customer = customers.get(customerId);
      if (!customer || normalizeCustomerStatusLocal(customer.status) === 'terminate') continue;
      const user = (data.radiusUsers || []).find((item) => item.customerId === customer.id || item.id === customer.radiusUserId || String(item.username || '').trim().toLowerCase() === String(customer.username || '').trim().toLowerCase());
      if (!user || user.status === 'terminated') continue;
      user.status = 'isolated';
      user.isolatedAt = user.isolatedAt || today;
      user.isolationSource = 'billing';
      user.isolationReason = 'overdue';
      user.isolatedByName = actor.name || actor.username || 'Billing';
      user.isolatedByUsername = actor.username || '';
      user.isolatedByRole = actor.role || 'system';
      user.updatedAt = new Date().toISOString();
      user.updatedBy = actor.name || actor.username || 'Billing';
      customer.status = 'isolir';
      customer.isolationSource = 'billing';
      customer.isolationReason = 'overdue';
      customer.isolatedByName = user.isolatedByName;
      customer.isolatedByUsername = user.isolatedByUsername;
      customer.isolatedByRole = user.isolatedByRole;
      customer.updatedAt = user.updatedAt;
      customer.updatedBy = user.updatedBy;
      isolatedUsers.push(user);
    }
  }

  for (const invoice of created) {
    queueInvoiceWaMessage(data, invoice, 'invoiceIssued', actor);
  }
  for (const user of isolatedUsers) {
    const customer = (data.customers || []).find((item) => {
      return item.id === user.customerId
        || item.id === user.radiusUserId
        || String(item.username || '').trim().toLowerCase() === String(user.username || '').trim().toLowerCase();
    }) || {};
    const invoice = (data.invoices || []).find((item) => {
      return item.customerId === customer.id
        && ['pending', 'overdue'].includes(invoiceRuntimeStatus(item, today))
        && invoiceUncoveredPeriods(item, paidCoverage).length;
    })
      || { id: '', customerId: customer.id, customerName: customer.name || user.username, username: user.username, amount: unpaidByCustomer.get(customer.id)?.amount || 0, dueDate: unpaidByCustomer.get(customer.id)?.dueDate || '', period };
    queueInvoiceWaMessage(data, invoice, 'accountSuspend', actor);
  }
  for (const user of activatedUsers) {
    const customer = (data.customers || []).find((item) => {
      return item.id === user.customerId
        || item.id === user.radiusUserId
        || String(item.username || '').trim().toLowerCase() === String(user.username || '').trim().toLowerCase();
    }) || {};
    const invoice = (data.invoices || []).find((item) => item.customerId === customer.id && invoiceRuntimeStatus(item, today) === 'paid')
      || { id: '', customerId: customer.id, customerName: customer.name || user.username, username: user.username, amount: customer.price || 0, dueDate: customer.dueDate || '', period };
    queueInvoiceWaMessage(data, invoice, 'accountActive', actor);
  }

  if (created.length || reminderInvoices.length || isolatedUsers.length || activatedUsers.length) {
    addActivity(data, 'invoice', `Billing otomatis: ${created.length} invoice, ${reminderInvoices.length} reminder, ${isolatedUsers.length} isolir, ${activatedUsers.length} aktif`, {
      action: 'billing-automation',
      period,
      created: created.length,
      reminders: reminderInvoices.length,
      isolated: isolatedUsers.length,
      activated: activatedUsers.length,
      expiredVouchers: voucherExpirations.removed.length + voucherExpirations.updated.length
    });
  }
  return { created, reminderInvoices, isolatedUsers, activatedUsers, voucherExpirations };
}

function publicWaGatewaySettings(settings = {}) {
  const provider = normalizeWaProvider(settings.provider || 'waha');
  return {
    ...settings,
    provider,
    providerLabel: WA_GATEWAY_PROVIDERS[provider]?.label || provider,
    providers: Object.entries(WA_GATEWAY_PROVIDERS).map(([value, providerInfo]) => ({
      value,
      label: providerInfo.label,
      baseUrl: providerInfo.baseUrl,
      autoBaseUrl: providerInfo.autoBaseUrl === true
    })),
    token: '',
    tokenConfigured: provider !== 'waha' && Boolean(settings.token)
  };
}

function sanitizeProviderSecrets(payloadProvider = {}, currentProvider = {}) {
  const next = { ...currentProvider };
  for (const [key, value] of Object.entries(payloadProvider || {})) {
    if (/key|token|secret|private/i.test(key)) {
      next[key] = keepSecret(currentProvider[key], value);
    } else if (typeof value === 'string') {
      next[key] = value.trim();
    }
  }
  return next;
}

function decimalNumber(value = 0) {
  return Number(String(value ?? '').trim().replace(',', '.')) || 0;
}

function sanitizePaymentGatewaySettings(payload = {}, current = {}) {
  return {
    ...current,
    enabled: Object.prototype.hasOwnProperty.call(payload, 'enabled') ? payload.enabled === true : current.enabled === true,
    provider: String(payload.provider || current.provider || 'tripay').trim().toLowerCase() || 'tripay',
    mode: ['production', 'sandbox'].includes(String(payload.mode || '').toLowerCase()) ? String(payload.mode).toLowerCase() : (current.mode || 'sandbox'),
    callbackUrl: String(payload.callbackUrl || current.callbackUrl || '').trim(),
    publicBaseUrl: String(payload.publicBaseUrl ?? current.publicBaseUrl ?? '').trim().replace(/\/+$/, ''),
    paymentPath: sanitizePublicPath(payload.paymentPath || current.paymentPath || '/payment-invoice.html', '/payment-invoice.html'),
    monthlyPaymentMethod: '',
    voucherPaymentMethod: 'QRIS',
    monthlyAdminFee: Math.max(0, Math.round(decimalNumber(payload.monthlyAdminFee ?? current.monthlyAdminFee ?? 0))),
    voucherAdminFee: Math.max(0, Math.round(decimalNumber(payload.voucherAdminFee ?? current.voucherAdminFee ?? 750))),
    voucherAdminFeePercent: Math.max(0, decimalNumber(payload.voucherAdminFeePercent ?? current.voucherAdminFeePercent ?? 0.70)),
    checkoutTtlMinutes: Math.max(5, Math.min(1440, Math.round(decimalNumber(payload.checkoutTtlMinutes ?? current.checkoutTtlMinutes ?? 60) || 60))),
    settlementReserveAmount: Math.max(0, Math.round(Number(payload.settlementReserveAmount ?? current.settlementReserveAmount ?? 10000) || 0)),
    tripay: sanitizeProviderSecrets(payload.tripay, current.tripay || {}),
    midtrans: sanitizeProviderSecrets(payload.midtrans, current.midtrans || {}),
    xendit: sanitizeProviderSecrets(payload.xendit, current.xendit || {}),
    doku: sanitizeProviderSecrets(payload.doku, current.doku || {}),
    duitku: sanitizeProviderSecrets(payload.duitku, current.duitku || {}),
    ipaymu: sanitizeProviderSecrets(payload.ipaymu, current.ipaymu || {}),
    custom: sanitizeProviderSecrets(payload.custom, current.custom || {})
  };
}

function sanitizePublicPath(value = '', fallback = '/voucher') {
  const raw = String(value || fallback || '/voucher').trim();
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const clean = withSlash
    .replace(/[^A-Za-z0-9/_.-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/-+/g, '-')
    .slice(0, 80);
  return clean && clean !== '/' ? clean : '/voucher';
}

function sanitizeHotspotVoucherOnlineSettings(payload = {}, current = {}, data = {}) {
  const next = {
    ...current,
    enabled: Object.prototype.hasOwnProperty.call(payload, 'enabled') ? payload.enabled === true : current.enabled === true,
    title: String(payload.title || current.title || 'Beli Voucher Hotspot').trim().slice(0, 80) || 'Beli Voucher Hotspot',
    publicPath: sanitizePublicPath(payload.publicPath, current.publicPath || '/voucher'),
    defaultNas: String(payload.defaultNas || '').trim(),
    autoGenerateOnPaid: Object.prototype.hasOwnProperty.call(payload, 'autoGenerateOnPaid') ? payload.autoGenerateOnPaid === true : current.autoGenerateOnPaid !== false,
    paymentMethod: 'qris',
    codeLength: clampInteger(payload.codeLength, 3, 32, current.codeLength || 6),
    codePrefix: String(payload.codePrefix || current.codePrefix || '').trim().slice(0, 24),
    codeCharacter: ['mixed', 'number', 'upper', 'lower', 'upper-number', 'lower-number'].includes(String(payload.codeCharacter || current.codeCharacter || 'mixed'))
      ? String(payload.codeCharacter || current.codeCharacter || 'mixed')
      : 'mixed',
    requireWhatsapp: Object.prototype.hasOwnProperty.call(payload, 'requireWhatsapp') ? payload.requireWhatsapp === true : current.requireWhatsapp !== false,
    sendVoucherWa: Object.prototype.hasOwnProperty.call(payload, 'sendVoucherWa') ? payload.sendVoucherWa === true : current.sendVoucherWa !== false,
    showPrice: Object.prototype.hasOwnProperty.call(payload, 'showPrice') ? payload.showPrice === true : current.showPrice !== false,
    successMessage: String(payload.successMessage || current.successMessage || '').trim().slice(0, 240),
    terms: String(payload.terms || current.terms || '').trim().slice(0, 1000),
    packages: {}
  };
  const incomingPackages = payload.packages && typeof payload.packages === 'object' ? payload.packages : {};
  const currentPackages = current.packages && typeof current.packages === 'object' ? current.packages : {};
  for (const profile of data.radiusProfiles || []) {
    if (profile.serviceType !== 'hotspot') continue;
    const profileId = String(profile.id || '').trim();
    if (!profileId) continue;
    const incoming = incomingPackages[profileId] && typeof incomingPackages[profileId] === 'object' ? incomingPackages[profileId] : null;
    const previous = currentPackages[profileId] && typeof currentPackages[profileId] === 'object' ? currentPackages[profileId] : {};
    const source = incoming || previous;
    next.packages[profileId] = {
      enabled: incoming ? source.enabled === true : previous.enabled === true,
      label: String(source.label || profile.name || '').trim().slice(0, 80),
      maxPerOrder: clampInteger(source.maxPerOrder, 1, 50, previous.maxPerOrder || 1),
      sort: clampInteger(source.sort, 0, 999, previous.sort || 0)
    };
  }
  return next;
}

function publicHotspotVoucherOnlinePayload(data = {}) {
  const settings = data.settings?.hotspotVoucherOnline || {};
  const packages = settings.packages && typeof settings.packages === 'object' ? settings.packages : {};
  const profiles = radiusProfileRowsLocal(data, 'hotspot')
    .map((profile) => {
      const online = packages[profile.id] && typeof packages[profile.id] === 'object' ? packages[profile.id] : {};
      const activeVouchers = (data.radiusUsers || []).filter((user) => {
        return user.serviceType === 'hotspot'
          && user.profileId === profile.id
          && user.status === 'active'
          && !user.customerId;
      }).length;
      return {
        ...profile,
        online: {
          enabled: online.enabled === true,
          label: online.label || profile.name || '',
          maxPerOrder: Number(online.maxPerOrder || 1),
          sort: Number(online.sort || 0),
          activeVouchers
        }
      };
    })
    .sort((a, b) => Number(a.online.sort || 0) - Number(b.online.sort || 0) || String(a.name || '').localeCompare(String(b.name || '')));
  const nasRows = radiusNasRowsLocal(data);
  const paymentSettings = data.settings?.paymentGateway || {};
  const waSettings = data.settings?.waGateway || {};
  const enabledPackages = profiles.filter((profile) => profile.online.enabled);
  return {
    ok: true,
    source: 'local',
    section: 'hotspot',
    tab: 'voucher-online',
    settings: {
      enabled: settings.enabled === true,
      title: settings.title || 'Beli Voucher Hotspot',
      publicPath: settings.publicPath || '/voucher',
      defaultNas: settings.defaultNas || '',
      autoGenerateOnPaid: settings.autoGenerateOnPaid !== false,
      paymentMethod: 'qris',
      codeLength: Number(settings.codeLength || 6),
      codePrefix: settings.codePrefix || '',
      codeCharacter: settings.codeCharacter || 'mixed',
      requireWhatsapp: settings.requireWhatsapp !== false,
      sendVoucherWa: settings.sendVoucherWa !== false,
      showPrice: settings.showPrice !== false,
      successMessage: settings.successMessage || 'Voucher akan dikirim setelah pembayaran berhasil.',
      terms: settings.terms || ''
    },
    rows: profiles,
    profiles,
    nas: nasRows,
    integrations: {
      paymentGatewayEnabled: paymentSettings.enabled === true,
      paymentGatewayProvider: paymentSettings.provider || 'tripay',
      paymentMethod: 'QRIS',
      waGatewayEnabled: waSettings.enabled === true,
      waGatewayProvider: waSettings.provider || 'waha'
    },
    topInfo: {
      total: profiles.length,
      active: enabledPackages.length,
      suspend: profiles.length - enabledPackages.length,
      terminate: 0
    },
    summary: {
      profileCount: profiles.length,
      enabledPackageCount: enabledPackages.length,
      activeVoucherStock: profiles.reduce((sum, profile) => sum + Number(profile.online.activeVouchers || 0), 0)
    },
    pagination: paginationPayload(1, Math.max(1, profiles.length || 1), profiles.length),
    checkedAt: new Date().toISOString()
  };
}

function enabledHotspotVoucherPackages(data = {}) {
  const settings = data.settings?.hotspotVoucherOnline || {};
  const packages = settings.packages && typeof settings.packages === 'object' ? settings.packages : {};
  return radiusProfileRowsLocal(data, 'hotspot')
    .map((profile) => {
      const online = packages[profile.id] && typeof packages[profile.id] === 'object' ? packages[profile.id] : {};
      return {
        ...profile,
        online: {
          enabled: online.enabled === true,
          label: online.label || profile.name || '',
          maxPerOrder: Number(online.maxPerOrder || 1),
          sort: Number(online.sort || 0)
        }
      };
    })
    .filter((profile) => profile.online.enabled === true)
    .sort((a, b) => Number(a.online.sort || 0) - Number(b.online.sort || 0) || String(a.name || '').localeCompare(String(b.name || '')));
}

function publicHotspotVoucherStorefrontPayload(data = {}) {
  const settings = data.settings?.hotspotVoucherOnline || {};
  const paymentSettings = data.settings?.paymentGateway || {};
  const waSettings = data.settings?.waGateway || {};
  const packages = enabledHotspotVoucherPackages(data).map((profile) => ({
    id: profile.id,
    name: profile.name,
    label: profile.online.label || profile.name,
    price: Number(profile.price || 0),
    priceText: formatCurrencyText(profile.price || 0),
    validity: profile.validity || '',
    quota: profile.quota || '',
    sharedUsers: profile.sharedUsers || 1,
    maxPerOrder: Math.max(1, Number(profile.online.maxPerOrder || 1)),
    sort: Number(profile.online.sort || 0)
  }));
  return {
    ok: true,
    enabled: settings.enabled === true,
    businessName: data.settings?.businessName || 'FAKE.NET',
    logoUrl: data.settings?.logoUrl || '/fakenet-logo.png',
    title: settings.title || 'Beli Voucher Hotspot',
    publicPath: settings.publicPath || '/voucher',
    paymentMethod: 'QRIS',
    paymentMethods: [{ id: 'qris', label: 'QRIS' }],
    paymentGatewayEnabled: paymentSettings.enabled === true,
    paymentGatewayProvider: paymentSettings.provider || 'tripay',
    requireWhatsapp: settings.requireWhatsapp !== false,
    sendVoucherWa: settings.sendVoucherWa !== false && waSettings.enabled === true,
    showPrice: settings.showPrice !== false,
    successMessage: settings.successMessage || 'Voucher akan dikirim setelah pembayaran berhasil.',
    terms: settings.terms || '',
    packages
  };
}

function nextHotspotVoucherOrderReference(data = {}) {
  const date = localTodayIso().replace(/-/g, '');
  const prefix = `VO-${date}-`;
  const numbers = [
    ...(data.hotspotVoucherOrders || []).map((order) => order.reference),
    ...(data.paymentGatewayTransactions || []).map((row) => row.reference)
  ].map((value) => {
    const match = String(value || '').match(new RegExp(`^${prefix}(\\d+)$`));
    return match ? Number(match[1]) || 0 : 0;
  });
  return `${prefix}${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}

function findHotspotVoucherOrder(data = {}, value = '') {
  const needle = String(value || '').trim().toLowerCase();
  return (data.hotspotVoucherOrders || []).find((order) => {
    return [order.id, order.reference, order.paymentReference].some((item) => String(item || '').trim().toLowerCase() === needle);
  }) || null;
}

const PAYMENT_GATEWAY_WEBHOOK_PATHS = new Set([
  '/tripay/webhook',
  '/tripay/callback',
  '/payment-gateway/webhook',
  '/payment-gateway/callback',
  '/api/public/payment-gateway/qris/callback',
  '/api/public/payment-gateway/tripay/webhook',
  '/api/public/payment-gateway/tripay/callback'
]);

function isPaymentGatewayWebhookPath(pathname = '') {
  return PAYMENT_GATEWAY_WEBHOOK_PATHS.has(String(pathname || '').replace(/\/+$/, '') || '/');
}

function paymentGatewayCallbackSecrets(settings = {}) {
  const provider = String(settings.provider || '').toLowerCase();
  const providerSettings = settings[provider] && typeof settings[provider] === 'object' ? settings[provider] : {};
  const values = [
    settings.callbackToken,
    providerSettings.callbackToken,
    providerSettings.privateKey,
    providerSettings.secretKey,
    providerSettings.sharedKey,
    providerSettings.apiKey,
    providerSettings.serverKey
  ];
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function safeStringEqual(actual = '', expected = '') {
  const actualText = String(actual || '').trim();
  const expectedText = String(expected || '').trim();
  if (!actualText || !expectedText) return false;
  const actualBuffer = Buffer.from(actualText);
  const expectedBuffer = Buffer.from(expectedText);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function paymentGatewaySignatureSecrets(settings = {}) {
  const provider = String(settings.provider || '').toLowerCase();
  const providerSettings = settings[provider] && typeof settings[provider] === 'object' ? settings[provider] : {};
  return [
    providerSettings.privateKey,
    providerSettings.secretKey,
    providerSettings.sharedKey,
    providerSettings.callbackToken
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function verifyPaymentGatewayCallback(req, payload = {}, settings = {}, rawBody = '') {
  const signature = String(
    req.headers['x-callback-signature']
      || req.headers['x-tripay-signature']
      || req.headers['x-signature']
      || ''
  ).trim().toLowerCase();
  if (signature && rawBody) {
    const signatureSecrets = paymentGatewaySignatureSecrets(settings);
    const matched = signatureSecrets.some((secret) => {
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex').toLowerCase();
      return safeStringEqual(signature, expected);
    });
    if (matched) return;
    throw new Error('Signature callback payment gateway tidak valid');
  }

  const secrets = paymentGatewayCallbackSecrets(settings);
  if (!secrets.length) {
    throw new Error('Token callback payment gateway belum dikonfigurasi');
  }
  const incoming = String(
    req.headers['x-callback-token']
      || req.headers['x-callback-secret']
      || req.headers['x-payment-token']
      || payload.callbackToken
      || payload.token
      || ''
  ).trim();
  if (!incoming || !secrets.includes(incoming)) {
    throw new Error('Token callback payment gateway tidak valid');
  }
}

function normalizePaymentStatus(value = '') {
  const status = String(value || '').trim().toLowerCase();
  if (['paid', 'success', 'settled', 'completed', 'capture'].includes(status)) return 'paid';
  if (['cancel', 'cancelled', 'canceled', 'expired', 'failed', 'deny'].includes(status)) return 'cancelled';
  return 'pending';
}

function createHotspotVoucherOrder(data = {}, payload = {}) {
  const settings = data.settings?.hotspotVoucherOnline || {};
  if (settings.enabled !== true) throw new Error('Voucher online belum aktif');
  if (data.settings?.paymentGateway?.enabled !== true) throw new Error('Payment Gateway QRIS belum aktif');
  const profile = radiusFindProfile(data, payload.profileId || payload.packageId || payload.profile, 'hotspot');
  if (!profile) throw new Error('Paket voucher tidak ditemukan');
  const packages = settings.packages && typeof settings.packages === 'object' ? settings.packages : {};
  const online = packages[profile.id] && typeof packages[profile.id] === 'object' ? packages[profile.id] : {};
  if (online.enabled !== true) throw new Error('Paket voucher tidak dijual online');
  const quantity = clampInteger(payload.quantity, 1, Math.max(1, Number(online.maxPerOrder || 1)), 1);
  const buyerName = String(payload.buyerName || payload.name || '').trim().slice(0, 80) || 'Pembeli Voucher';
  const whatsapp = normalizeLocalPhone(payload.whatsapp || payload.phone || '');
  if (settings.requireWhatsapp !== false && !whatsapp) throw new Error('Nomor WhatsApp wajib diisi');
  const price = Math.max(0, Math.round(Number(profile.price || 0)));
  if (price <= 0) throw new Error('Harga profile Hotspot belum diisi');
  const baseAmount = price * quantity;
  const gatewayBreakdown = paymentGatewayAmountBreakdown(data.settings || {}, baseAmount, 'voucher');
  const nas = radiusFindNas(data, payload.nasId || settings.defaultNas || '');
  const now = new Date().toISOString();
  const reference = nextHotspotVoucherOrderReference(data);
  const paymentSettings = data.settings?.paymentGateway || {};
  const provider = paymentSettings.provider || 'tripay';
  const order = {
    id: createId('hvo'),
    reference,
    profileId: profile.id,
    profileName: profile.name,
    packageLabel: online.label || profile.name,
    nasId: nas?.id || '',
    nasName: nas?.name || '',
    quantity,
    unitPrice: price,
    amount: baseAmount,
    baseAmount,
    adminFee: gatewayBreakdown.adminFee,
    gatewayAmount: gatewayBreakdown.totalAmount,
    totalAmount: gatewayBreakdown.totalAmount,
    buyerName,
    whatsapp,
    status: 'pending',
    paymentMethod: 'QRIS',
    paymentProvider: provider,
    paymentReference: reference,
    voucherUserIds: [],
    vouchers: [],
    createdAt: now,
    updatedAt: now
  };
  data.hotspotVoucherOrders = Array.isArray(data.hotspotVoucherOrders) ? data.hotspotVoucherOrders : [];
  data.hotspotVoucherOrders.unshift(order);
  data.hotspotVoucherOrders = data.hotspotVoucherOrders.slice(0, 1000);
  return order;
}

function removeUnpaidHotspotVoucherPaymentGatewayTransaction(data = {}, order = {}) {
  data.paymentGatewayTransactions = Array.isArray(data.paymentGatewayTransactions) ? data.paymentGatewayTransactions : [];
  data.paymentGatewayTransactions = data.paymentGatewayTransactions.filter((row) => {
    if (row.voucherOrderId !== order.id && row.reference !== order.reference) return true;
    return ['paid', 'settled', 'success'].includes(String(row.status || '').toLowerCase());
  });
}

function upsertPaidHotspotVoucherPaymentGatewayTransaction(data = {}, order = {}) {
  data.paymentGatewayTransactions = Array.isArray(data.paymentGatewayTransactions) ? data.paymentGatewayTransactions : [];
  const now = new Date().toISOString();
  const existing = data.paymentGatewayTransactions.find((row) => row.voucherOrderId === order.id || row.reference === order.reference);
  const next = {
    ...(existing || {}),
    id: existing?.id || createId('pg'),
    kind: 'voucher-online',
    transactionKind: 'hotspot-voucher',
    sourceType: 'hotspot',
    provider: order.paymentProvider || 'tripay',
    method: 'QRIS',
    paymentMethod: 'QRIS',
    reference: order.reference || '',
    description: `Voucher Hotspot ${order.packageLabel || order.profileName || '-'} x${order.quantity || 1}`,
    invoiceNo: order.reference || '',
    customerName: order.buyerName || '',
    amount: Number(order.gatewayAmount || order.totalAmount || order.amount || 0),
    baseAmount: Number(order.baseAmount || order.amount || 0),
    fee: Number(order.adminFee ?? existing?.fee ?? 0),
    adminFee: Number(order.adminFee ?? existing?.adminFee ?? 0),
    status: 'paid',
    voucherOrderId: order.id || '',
    paidAt: order.paidAt || now,
    paymentAt: order.paidAt || now,
    externalId: order.paymentExternalId || existing?.externalId || '',
    paidByName: order.paidByName || existing?.paidByName || '',
    paidByUsername: order.paidByUsername || existing?.paidByUsername || '',
    paidByRole: order.paidByRole || existing?.paidByRole || '',
    createdAt: existing?.createdAt || order.createdAt || now,
    updatedAt: now,
    date: String(order.paidAt || now).slice(0, 10)
  };
  if (existing) {
    Object.assign(existing, next);
  } else {
    data.paymentGatewayTransactions.unshift(next);
  }
  data.paymentGatewayTransactions = data.paymentGatewayTransactions.slice(0, 1000);
  return next;
}

function paymentGatewayTransactionKind(row = {}) {
  const raw = String(row.transactionKind || row.sourceType || row.kind || '').trim().toLowerCase();
  const reference = String(row.reference || row.invoiceNo || '').trim().toLowerCase();
  if (['hotspot-voucher', 'voucher-hotspot', 'voucher-online', 'hotspot', 'voucher'].includes(raw)) return 'hotspot-voucher';
  if (raw.includes('voucher') || row.voucherOrderId || reference.startsWith('vo-')) return 'hotspot-voucher';
  if (['monthly-package', 'monthly-invoice', 'billing-invoice', 'paket-bulanan', 'invoice', 'billing'].includes(raw)) return 'monthly-package';
  if (raw.includes('invoice') || raw.includes('billing') || raw.includes('monthly') || row.invoiceId || row.customerId) return 'monthly-package';
  if (raw === 'balance') return 'balance';
  if (raw === 'fee') return 'fee';
  return 'other';
}

function paymentGatewayTransactionKindLabel(kind = '') {
  const labels = {
    'hotspot-voucher': 'Hotspot Voucher',
    'monthly-package': 'Paket Bulanan',
    balance: 'Balance',
    fee: 'Fee',
    other: 'Lainnya'
  };
  return labels[kind] || labels.other;
}

function queueHotspotVoucherWa(data = {}, order = {}, vouchers = [], actor = {}) {
  const settings = data.settings?.hotspotVoucherOnline || {};
  if (settings.sendVoucherWa === false || !order.whatsapp || !vouchers.length) return null;
  const values = hotspotVoucherTemplateValues(data, order, vouchers, {});
  const template = data.settings?.waGateway?.templates?.voucherIssued || DEFAULT_WA_TEMPLATES.voucherIssued;
  const text = renderWaTemplate(template, values);
  if (!text.trim()) return null;
  return queueWaGatewayMessage(data, {
    type: 'hotspotVoucherPaid',
    phone: order.whatsapp,
    recipientName: values.fullname || order.buyerName || '',
    subject: `Voucher Hotspot ${order.reference || values.voucher_user || ''}`.trim(),
    text,
    actorName: actor.name || actor.username || 'Payment Gateway'
  });
}

function fulfillHotspotVoucherOrder(data = {}, value = '', payment = {}, actor = {}) {
  const order = findHotspotVoucherOrder(data, value);
  if (!order) throw new Error('Order voucher tidak ditemukan');
  if (order.status === 'paid' && order.vouchers?.length) {
    upsertPaidHotspotVoucherPaymentGatewayTransaction(data, order);
    return { order, vouchers: order.vouchers, reused: true };
  }
  const status = normalizePaymentStatus(payment.status || 'paid');
  const now = new Date().toISOString();
  if (status !== 'paid') {
    order.status = status;
    order.updatedAt = now;
    removeUnpaidHotspotVoucherPaymentGatewayTransaction(data, order);
    return { order, vouchers: [], reused: false };
  }
  const settings = data.settings?.hotspotVoucherOnline || {};
  const generated = generateHotspotVouchers(data, {
    profileId: order.profileId,
    nasId: order.nasId,
    count: order.quantity,
    nameLength: settings.codeLength || 6,
    prefix: settings.codePrefix || '',
    character: settings.codeCharacter || 'mixed',
    userMode: 'same',
    note: `Voucher online ${order.reference}`
  }, actor);
  const vouchers = generated.created.map((user) => {
    user.onlineOrderId = order.id;
    user.onlineOrderReference = order.reference;
    user.voucherBuyerName = order.buyerName || '';
    user.voucherBuyerWhatsapp = order.whatsapp || '';
    return {
      id: user.id,
      username: user.username,
      password: user.password,
      profileName: order.profileName,
      nasName: order.nasName
    };
  });
  order.status = 'paid';
  order.paidAt = payment.paidAt || now;
  order.updatedAt = now;
  order.paymentExternalId = payment.externalId || payment.transactionId || order.paymentExternalId || '';
  order.paidByName = actor.name || actor.username || order.paidByName || '';
  order.paidByUsername = actor.username || order.paidByUsername || '';
  order.paidByRole = actor.role || order.paidByRole || '';
  order.voucherBatchId = generated.batchId;
  order.voucherUserIds = vouchers.map((voucher) => voucher.id);
  order.vouchers = vouchers;
  upsertPaidHotspotVoucherPaymentGatewayTransaction(data, order);
  queueHotspotVoucherWa(data, order, vouchers, actor);
  return { order, vouchers, reused: false };
}

function publicPaymentGatewaySettings(settings = {}) {
  const mask = (provider = {}) => Object.fromEntries(Object.entries(provider || {}).map(([key, value]) => {
    if (/key|token|secret|private/i.test(key)) {
      return [key, value ? 'tersimpan' : ''];
    }
    return [key, value];
  }));
  return {
    ...settings,
    tripay: mask(settings.tripay),
    midtrans: mask(settings.midtrans),
    xendit: mask(settings.xendit),
    doku: mask(settings.doku),
    duitku: mask(settings.duitku),
    ipaymu: mask(settings.ipaymu),
    custom: mask(settings.custom)
  };
}

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function romanMonth(period = currentPeriod()) {
  const month = Number(String(period || '').slice(5, 7)) || Number(todayIso().slice(5, 7));
  return ROMAN_MONTHS[Math.max(0, Math.min(11, month - 1))] || 'I';
}

function nextBillingInvoiceNo(data = {}, period = currentPeriod()) {
  return nextBillingInvoiceNumber(data, period);
}

function displayBillingInvoiceNo(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/#\s*(\d+)/) || raw.match(/^(\d+)$/);
  if (!match) return raw;
  return String(Number(match[1]) || match[1]).padStart(6, '0');
}

function paymentMethodGroup(value = '') {
  const method = String(value || '').trim().toLowerCase();
  if (method.includes('tunai') || method.includes('cash')) return 'cash';
  return 'transfer';
}

function dailyFinanceRow(date = '') {
  return {
    date,
    incomeCash: 0,
    incomeTransfer: 0,
    expenseCash: 0,
    expenseTransfer: 0,
    incomeTotal: 0,
    expenseTotal: 0,
    profit: 0,
    transactionCount: 0
  };
}

function addDailyFinanceAmount(groups, date, field, amount, count = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return;
  const row = groups.get(date) || dailyFinanceRow(date);
  row[field] += Number(amount || 0);
  row.transactionCount += Number(count || 0);
  row.incomeTotal = row.incomeCash + row.incomeTransfer;
  row.expenseTotal = row.expenseCash + row.expenseTransfer;
  row.profit = row.incomeTotal - row.expenseTotal;
  groups.set(date, row);
}

function periodExpenseDailyGroups(data = {}, period = currentPeriod()) {
  const groups = new Map();
  for (const expense of data.expenses || []) {
    const date = String(expense.date || expense.createdAt || '').slice(0, 10);
    if (date.slice(0, 7) !== period) continue;
    const method = paymentMethodGroup(expense.paymentMethod || expense.method || expense.type);
    addDailyFinanceAmount(groups, date, method === 'cash' ? 'expenseCash' : 'expenseTransfer', Number(expense.amount || 0));
  }
  return groups;
}

function periodDailyRows(period = currentPeriod(), groups = new Map()) {
  const normalized = normalizePeriod(period);
  const [year, month] = normalized.split('-').map((item) => Number(item));
  const daysInMonth = new Date(year, month, 0).getDate();
  const rows = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${normalized}-${String(day).padStart(2, '0')}`;
    rows.push(groups.get(date) || dailyFinanceRow(date));
  }
  return rows;
}

function monthlyBillingDailyRows(data = {}, period = currentPeriod(), options = {}) {
  const groups = options.includeExpenses === false ? new Map() : periodExpenseDailyGroups(data, period);
  const invoices = new Map((data.invoices || []).map((invoice) => [invoice.id, invoice]));
  const payments = Array.isArray(options.payments) ? options.payments : activePayments(data);
  for (const payment of payments) {
    const invoice = invoices.get(payment.invoiceId) || {};
    const date = String(payment.paidAt || payment.createdAt || invoice.paidAt || '').slice(0, 10);
    if (date.slice(0, 7) !== period) continue;
    const method = paymentMethodGroup(payment.method || invoice.paymentMethod);
    const amount = Number(payment.amount || invoice.amount || 0);
    addDailyFinanceAmount(groups, date, method === 'cash' ? 'incomeCash' : 'incomeTransfer', amount, 1);
  }
  return periodDailyRows(period, groups);
}

function reportableGeneratedVoucherUsers(data = {}) {
  return hotspotVoucherReportUsers(data)
    .filter((user) => user.serviceType === 'hotspot')
    .filter((user) => user.voucherBatchId)
    .filter((user) => !user.customerId)
    .filter((user) => !user.onlineOrderId && !user.onlineOrderReference)
    .filter((user) => !['free', 'unpaid'].includes(String(user.paymentStatus || '').toLowerCase()));
}

function hotspotVoucherReportUsers(data = {}) {
  const rows = [
    ...(Array.isArray(data.radiusUsers) ? data.radiusUsers : []),
    ...(Array.isArray(data.radiusVoucherRecords) ? data.radiusVoucherRecords : [])
  ];
  const seen = new Set();
  return rows.filter((user) => {
    const key = String(user.id || user.radiusUserId || user.username || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function generatedVoucherFirstOnlineMap(data = {}) {
  const users = reportableGeneratedVoucherUsers(data);
  if (!users.length) return new Map();
  const result = await freeradiusSessions.firstOnlineByUsernames(users.map((user) => user.username));
  if (!result.ok) return new Map();
  return new Map((result.rows || [])
    .filter((row) => row.usernameKey && row.firstOnlineAt)
    .map((row) => [radiusSessionUsername(row.usernameKey), row.firstOnlineAt]));
}

function paidVoucherOrders(data = {}, period = currentPeriod(), firstOnlineByUsername = new Map()) {
  const onlineOrders = (data.hotspotVoucherOrders || [])
    .filter((order) => String(order.status || '').toLowerCase() === 'paid')
    .filter((order) => String(order.paidAt || order.updatedAt || order.createdAt || '').slice(0, 7) === period)
    .map((order) => ({
      ...order,
      date: String(order.paidAt || order.updatedAt || order.createdAt || '').slice(0, 10),
      amount: Number(order.amount || 0),
      paymentMethod: order.paymentMethod || 'QRIS',
      createdByName: order.createdByName || order.paidByName || '',
      createdByUsername: order.createdByUsername || order.paidByUsername || '',
      updatedByName: order.updatedByName || order.paidByName || '',
      updatedByUsername: order.updatedByUsername || order.paidByUsername || ''
    }));
  const profileById = new Map((data.radiusProfiles || []).map((profile) => [profile.id, profile]));
  const nasById = new Map(radiusNasRowsLocal(data).map((nas) => [nas.id, nas]));
  const manualOrders = hotspotVoucherReportUsers(data)
    .filter((user) => user.serviceType === 'hotspot')
    .filter((user) => !user.customerId)
    .filter((user) => !user.onlineOrderId && !user.onlineOrderReference)
    .filter((user) => {
      const paymentStatus = String(user.paymentStatus || '').toLowerCase();
      if (user.voucherBatchId) return !['free', 'unpaid'].includes(paymentStatus) && firstOnlineByUsername.has(radiusSessionUsername(user.username));
      return paymentStatus === 'paid';
    })
    .map((user) => {
      const profile = profileById.get(user.profileId) || {};
      const nas = nasById.get(user.nasId) || {};
      const generated = Boolean(user.voucherBatchId);
      const paidAt = generated
        ? firstOnlineByUsername.get(radiusSessionUsername(user.username))
        : (user.paidAt || user.createdAt || user.updatedAt || '');
      const amount = Number(user.amount || profile.price || 0);
      return {
        id: `manual-${user.id}`,
        reference: user.username || user.id,
        paymentReference: '',
        buyerName: generated ? 'Generated Voucher' : 'Manual Voucher',
        whatsapp: '',
        profileId: user.profileId || '',
        profileName: profile.name || user.profileName || '',
        packageLabel: profile.name || user.profileName || '-',
        nasId: user.nasId || '',
        nasName: nas.name || user.nasName || '',
        quantity: 1,
        unitPrice: amount,
        amount,
        status: 'paid',
        paymentMethod: generated ? 'First Online' : 'Paid',
        source: generated ? 'generated' : 'manual',
        createdByName: user.createdByName || user.updatedBy || '',
        createdByUsername: user.createdByUsername || '',
        createdByRole: user.createdByRole || '',
        updatedByName: user.updatedByName || user.updatedBy || '',
        updatedByUsername: user.updatedByUsername || '',
        updatedByRole: user.updatedByRole || '',
        voucherUserIds: [user.id],
        vouchers: [{
          id: user.id,
          username: user.username,
          password: user.password,
          profileName: profile.name || '',
          nasName: nas.name || ''
        }],
        date: String(paidAt).slice(0, 10),
        paidAt,
        createdAt: user.createdAt || '',
        updatedAt: user.updatedAt || ''
      };
    })
    .filter((order) => order.date.slice(0, 7) === period);
  return [...onlineOrders, ...manualOrders];
}

async function paidVoucherOrdersForReport(data = {}, period = currentPeriod(), firstOnlineByUsername = null) {
  const firstOnlineMap = firstOnlineByUsername || await generatedVoucherFirstOnlineMap(data);
  return paidVoucherOrders(data, period, firstOnlineMap);
}

function monthlyVoucherDailyRows(data = {}, period = currentPeriod(), voucherOrders = null) {
  const groups = new Map();
  for (const order of voucherOrders || paidVoucherOrders(data, period)) {
    const method = paymentMethodGroup(order.paymentMethod);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(order.date || ''))) continue;
    const row = groups.get(order.date) || {
      date: order.date,
      cashAmount: 0,
      transferAmount: 0,
      totalAmount: 0,
      commissionAmount: 0,
      netAmount: 0,
      transactionCount: 0,
      voucherCount: 0
    };
    const amount = Number(order.amount || 0);
    if (method === 'cash') row.cashAmount += amount;
    else row.transferAmount += amount;
    row.totalAmount += amount;
    row.commissionAmount += Number(order.commissionAmount || 0);
    row.netAmount += Number(order.netAmount || 0);
    row.transactionCount += 1;
    row.voucherCount += Number(order.quantity || order.vouchers?.length || 0);
    groups.set(order.date, row);
  }
  const normalized = normalizePeriod(period);
  const [year, month] = normalized.split('-').map((item) => Number(item));
  const daysInMonth = new Date(year, month, 0).getDate();
  const rows = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${normalized}-${String(day).padStart(2, '0')}`;
    rows.push(groups.get(date) || {
      date,
      cashAmount: 0,
      transferAmount: 0,
      totalAmount: 0,
      commissionAmount: 0,
      netAmount: 0,
      transactionCount: 0,
      voucherCount: 0
    });
  }
  return rows;
}

function statisticsDailyRow(date = '') {
  return {
    date,
    newInstallCount: 0,
    removedCount: 0,
    netGrowth: 0,
    voucherBuyerCount: 0,
    voucherCount: 0,
    voucherAmount: 0
  };
}

function statisticsMonthlyRow(period = '') {
  return {
    period,
    newInstallCount: 0,
    removedCount: 0,
    netGrowth: 0,
    voucherBuyerCount: 0,
    voucherCount: 0,
    voucherAmount: 0
  };
}

function statisticsPeriodRows(period = currentPeriod(), groups = new Map()) {
  const normalized = normalizePeriod(period);
  const [year, month] = normalized.split('-').map((item) => Number(item));
  const daysInMonth = new Date(year, month, 0).getDate();
  const rows = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${normalized}-${String(day).padStart(2, '0')}`;
    const row = groups.get(date) || statisticsDailyRow(date);
    row.netGrowth = Number(row.newInstallCount || 0) - Number(row.removedCount || 0);
    rows.push(row);
  }
  return rows;
}

function statisticsMonthPeriods(period = currentPeriod(), count = 12) {
  const normalized = normalizePeriod(period);
  const total = Math.max(1, Math.min(36, Number(count || 12) || 12));
  const start = addMonthsToPeriod(normalized, -(total - 1));
  const periods = [];
  let cursor = start;
  for (let index = 0; index < total; index += 1) {
    periods.push(cursor);
    cursor = addMonthsToPeriod(cursor, 1);
  }
  return periods;
}

function statisticsMonthlyRows(periods = [], groups = new Map()) {
  return periods.map((period) => {
    const normalized = normalizePeriod(period);
    const row = groups.get(normalized) || statisticsMonthlyRow(normalized);
    row.netGrowth = Number(row.newInstallCount || 0) - Number(row.removedCount || 0);
    return row;
  });
}

function pppInstallDateForUser(data = {}, user = {}) {
  const customer = findCustomerForRadiusUser(data, user) || {};
  return String(
    customer.activeDate
    || user.activeDate
    || customer.createdAt
    || user.createdAt
    || ''
  ).slice(0, 10);
}

function pppInstallDateForRemovedRecord(record = {}) {
  return String(
    record.installedAt
    || record.activeDate
    || record.radiusCreatedAt
    || record.memberCreatedAt
    || ''
  ).slice(0, 10);
}

function statisticsRecordKey(prefix = '', item = {}) {
  const value = String(item.key || item.id || item.radiusUserId || item.customerId || item.username || '').trim().toLowerCase();
  return value ? `${prefix}:${value}` : '';
}

async function reportStatisticsPayload(data = {}, period = currentPeriod()) {
  const selectedPeriod = normalizePeriod(period);
  const dailyGroups = new Map();
  const monthlyGroups = new Map();
  const monthPeriods = statisticsMonthPeriods(selectedPeriod, 12);
  const monthPeriodSet = new Set(monthPeriods);
  const newInstallKeys = new Set();
  const removedKeys = new Set();
  const addRow = (date = '', field = '', amount = 1) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return;
    const rowPeriod = date.slice(0, 7);
    if (monthPeriodSet.has(rowPeriod)) {
      const monthlyRow = monthlyGroups.get(rowPeriod) || statisticsMonthlyRow(rowPeriod);
      monthlyRow[field] += Number(amount || 0);
      monthlyRow.netGrowth = monthlyRow.newInstallCount - monthlyRow.removedCount;
      monthlyGroups.set(rowPeriod, monthlyRow);
    }
    if (rowPeriod === selectedPeriod) {
      const dailyRow = dailyGroups.get(date) || statisticsDailyRow(date);
      dailyRow[field] += Number(amount || 0);
      dailyRow.netGrowth = dailyRow.newInstallCount - dailyRow.removedCount;
      dailyGroups.set(date, dailyRow);
    }
  };

  for (const user of data.radiusUsers || []) {
    if (user.serviceType !== 'pppoe') continue;
    const date = pppInstallDateForUser(data, user);
    if (date.slice(0, 7) !== selectedPeriod) continue;
    const key = statisticsRecordKey('active', user);
    if (!key || newInstallKeys.has(key)) continue;
    newInstallKeys.add(key);
    addRow(date, 'newInstallCount', 1);
  }

  for (const record of data.radiusRemovedRecords || []) {
    const type = String(record.serviceType || 'pppoe').trim().toLowerCase();
    if (type !== 'pppoe') continue;
    const removedDate = String(record.removedAt || '').slice(0, 10);
    if (removedDate.slice(0, 7) === selectedPeriod) {
      const key = statisticsRecordKey('removed', record);
      if (key && !removedKeys.has(key)) {
        removedKeys.add(key);
        addRow(removedDate, 'removedCount', 1);
      }
    }
    const installedDate = pppInstallDateForRemovedRecord(record);
    if (installedDate.slice(0, 7) === selectedPeriod) {
      const key = statisticsRecordKey('removed-install', record);
      if (key && !newInstallKeys.has(key)) {
        newInstallKeys.add(key);
        addRow(installedDate, 'newInstallCount', 1);
      }
    }
  }

  const firstOnlineByUsername = await generatedVoucherFirstOnlineMap(data);
  for (const monthPeriod of monthPeriods) {
    const voucherOrders = await paidVoucherOrdersForReport(data, monthPeriod, firstOnlineByUsername);
    for (const order of voucherOrders) {
      const date = String(order.date || order.paidAt || order.updatedAt || order.createdAt || '').slice(0, 10);
      if (date.slice(0, 7) !== monthPeriod) continue;
      addRow(date, 'voucherBuyerCount', 1);
      addRow(date, 'voucherCount', Number(order.quantity || order.vouchers?.length || 0));
      addRow(date, 'voucherAmount', Number(order.amount || 0));
    }
  }

  const dailyRows = statisticsPeriodRows(selectedPeriod, dailyGroups);
  const monthlyRows = statisticsMonthlyRows(monthPeriods, monthlyGroups);
  const summary = dailyRows.reduce((acc, row) => {
    acc.newInstallCount += Number(row.newInstallCount || 0);
    acc.removedCount += Number(row.removedCount || 0);
    acc.voucherBuyerCount += Number(row.voucherBuyerCount || 0);
    acc.voucherCount += Number(row.voucherCount || 0);
    acc.voucherAmount += Number(row.voucherAmount || 0);
    return acc;
  }, {
    newInstallCount: 0,
    removedCount: 0,
    voucherBuyerCount: 0,
    voucherCount: 0,
    voucherAmount: 0
  });
  summary.netGrowth = summary.newInstallCount - summary.removedCount;

  return {
    ok: true,
    period: selectedPeriod,
    summary,
    monthlyRows,
    dailyRows,
    checkedAt: new Date().toISOString()
  };
}

function localManualInvoiceMembers(data = {}, query = {}) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const limit = Math.max(1, Math.min(25, Number(query.limit || 5) || 5));
  const search = String(query.search || '').trim().toLowerCase();
  let members = (data.customers || [])
    .filter((customer) => String(customer.status || 'active').toLowerCase() !== 'terminate')
    .map((customer) => ({
      id: customer.id,
      userId: customer.code || customer.username || customer.id,
      fullName: customer.name || customer.customerName || customer.username || '',
      whatsapp: normalizeLocalPhone(customer.whatsapp || customer.phone || ''),
      address: customer.address || '',
      packageName: customer.packageName || '',
      price: Number(customer.price || customer.amount || 0),
      dueDate: customer.nextDue || customer.dueDate || ''
    }));
  if (search) {
    members = members.filter((member) => [
      member.fullName,
      member.userId,
      member.whatsapp,
      member.address,
      member.packageName
    ].some((value) => String(value || '').toLowerCase().includes(search)));
  }
  const pagination = paginationPayload(page, limit, members.length);
  const offset = (pagination.page - 1) * limit;
  return {
    members: members.slice(offset, offset + limit),
    pagination
  };
}

function dashboardBillingSummary(data = {}, period = currentPeriod()) {
  const selectedPeriod = normalizePeriod(period);
  const rows = localBillingInvoiceRows(data, selectedPeriod).filter((invoice) => invoice.status !== 'cancelled');
  const unpaidRows = rows.filter((invoice) => ['unpaid', 'pending', 'overdue'].includes(String(invoice.status || '').toLowerCase()));
  const overdueRows = unpaidRows.filter((invoice) => {
    const customerStatus = normalizeCustomerStatusLocal(invoice.customerStatus || invoice.serviceStatus);
    return customerStatus === 'isolated' || customerStatus === 'terminate';
  });
  const paidRows = rows.filter((invoice) => {
    if (String(invoice.status || '').toLowerCase() !== 'paid') return false;
    const paidPeriod = String(invoice.paidAt || invoice.updatedAt || invoice.createdAt || '').slice(0, 7);
    return paidPeriod ? paidPeriod === selectedPeriod : true;
  });
  return {
    totalUnpaidCount: unpaidRows.length,
    totalUnpaidAmount: unpaidRows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    overdueCount: overdueRows.length,
    overdueAmount: overdueRows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    monthlyPaidCount: paidRows.length,
    monthlyPaidAmount: paidRows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
    monthlyInvoiceCount: rows.length,
    monthlyInvoiceAmount: rows.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
  };
}

function formatCurrencyText(value) {
  return `Rp ${Math.round(Number(value || 0)).toLocaleString('id-ID')}`;
}

function formatMoneyNumberText(value) {
  return Math.round(Number(value || 0)).toLocaleString('id-ID');
}

function stripCurrencyPrefix(value = '') {
  return String(value || '').replace(/^rp\.?\s*/i, '').trim();
}

function dateDisplayText(value = '') {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const local = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : (local ? { year: Number(local[3]), month: Number(local[2]), day: Number(local[1]) } : null);
  if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
    return readablePeriodText(text);
  }
  return `${String(parts.day).padStart(2, '0')}-${String(parts.month).padStart(2, '0')}-${parts.year}`;
}

function dateTimeDisplayText(value = '') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dateDisplayText(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}`;
}

function periodDisplayText(value = '') {
  return readablePeriodText(value);
}

function readablePeriodText(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\b(\d{4})-(\d{2})(?!-\d{2})\b/g, (_, year, month) => {
    const index = Number(month) - 1;
    return `${INDONESIAN_MONTHS[Math.max(0, Math.min(11, index))]} ${year}`;
  });
}

function customerInvoiceCoverage(data = {}, customerId = '') {
  const coverage = new Set();
  for (const invoice of data.invoices || []) {
    if (invoice.customerId !== customerId || !invoiceBlocksPeriod(invoice)) continue;
    for (const period of invoiceCoveredPeriods(invoice)) {
      coverage.add(period);
    }
  }
  return coverage;
}

function nextUncoveredPeriods(data = {}, customerId = '', startPeriod = currentPeriod(), count = 1) {
  const covered = customerInvoiceCoverage(data, customerId);
  const periods = [];
  let cursor = normalizePeriod(startPeriod);
  let guard = 0;
  while (periods.length < count && guard < 120) {
    if (!covered.has(cursor)) {
      periods.push(cursor);
    }
    cursor = addMonthsToPeriod(cursor, 1);
    guard += 1;
  }
  return periods;
}

function manualInvoiceBasePeriod(customer = {}) {
  const dueDateText = String(customer.nextDue || customer.dueDate || '').trim();
  if (dueDateText) {
    return normalizePeriod(periodFromDateInput(dueDateText) || dueDateText.slice(0, 7));
  }
  const activePeriod = periodFromDateInput(customer.activeDate || customer.installedAt || '');
  const firstInvoiceStatus = String(customer.firstInvoiceStatus || customer.initialInvoiceStatus || 'paid').toLowerCase();
  if (firstInvoiceStatus === 'unpaid') {
    return activePeriod || currentPeriod();
  }
  let cursor = currentPeriod();
  if (activePeriod && normalizePeriod(cursor) < activePeriod) {
    cursor = activePeriod;
  }
  let guard = 0;
  while (!customerBillableInPeriod(customer, cursor) && guard < 120) {
    cursor = addMonthsToPeriod(cursor, 1);
    guard += 1;
  }
  return cursor;
}

function localManualInvoicePreview(data = {}, customer = {}, subPeriod = 1) {
  const months = clampInteger(subPeriod, 1, 12, 1);
  const billingSettings = data.settings?.billing || {};
  const amount = Number(resolvePrice(data.settings || {}, customer) || customer.amount || 0) * months;
  const dueDay = customer.dueDay || dayFromDateInput(customer.activeDate || customer.installedAt || '', billingSettings.postpaidDueDay || data.settings?.defaultDueDay || 10);
  const baseInvoicePeriod = manualInvoiceBasePeriod(customer);
  const coveredPeriods = nextUncoveredPeriods(data, customer.id, baseInvoicePeriod, months);
  const period = coveredPeriods[0] || baseInvoicePeriod;
  const dueDate = dueDateForPeriod(period, dueDay);
  return {
    fullName: customer.name || customer.customerName || customer.username || '',
    dueDate,
    dueDateDisplay: dateDisplayText(dueDate),
    period,
    coveredPeriods,
    coveredPeriodText: coveredPeriods.length
      ? `${periodDisplayText(coveredPeriods[0])}${coveredPeriods.length > 1 ? ` s/d ${periodDisplayText(coveredPeriods[coveredPeriods.length - 1])}` : ''}`
      : periodDisplayText(period),
    subPeriodMonths: months,
    subscribe: `${months} Bulan`,
    item: customer.packageName || `Tagihan internet ${period}`,
    amount: formatCurrencyText(amount),
    ppn: '-',
    discount: '-',
    total: formatCurrencyText(amount),
    totalAmount: amount
  };
}

function createLocalManualInvoice(data = {}, customer = {}, subPeriod = 1, actor = {}, options = {}) {
  const preview = localManualInvoicePreview(data, customer, subPeriod);
  const conflicts = (preview.coveredPeriods || []).filter((period) => {
    return customerInvoiceCoverage(data, customer.id).has(period);
  });
  if (conflicts.length) {
    throw new Error(`Periode ${conflicts.map(periodDisplayText).join(', ')} untuk ${customer.name || customer.username} sudah memiliki invoice aktif. Refresh preview invoice terlebih dulu.`);
  }
  const now = new Date().toISOString();
  const numbering = nextBillingInvoiceNo(data, preview.period);
  const invoiceNo = numbering.invoiceNo;
  const coveredPeriods = preview.coveredPeriods || [preview.period];
  const invoice = {
    id: createId('inv'),
    source: options.source || 'manual',
    externalId: invoiceNo,
    invoiceNo,
    invoiceSeq: numbering.invoiceSeq,
    customerId: customer.id,
    customerName: customer.name || customer.customerName || customer.username || '',
    username: customer.username || '',
    packageName: customer.packageName || preview.item || '',
    period: preview.period,
    coveredPeriods,
    subPeriodMonths: preview.subPeriodMonths || Number(subPeriod) || 1,
    coverageStartPeriod: coveredPeriods[0] || preview.period,
    coverageEndPeriod: coveredPeriods[coveredPeriods.length - 1] || preview.period,
    amount: Number(preview.totalAmount || 0),
    dueDate: preview.dueDate,
    status: Number(preview.totalAmount || 0) > 0 ? 'pending' : 'cancelled',
    paidAt: '',
    paymentMethod: '',
    notes: options.notes || `Invoice manual ${preview.subscribe}`,
    createdByName: actor.name || actor.username || '',
    createdAt: now,
    updatedAt: now
  };
  data.invoices.push(invoice);
  const queued = options.queueWa === false ? null : queueInvoiceWaMessage(data, invoice, 'invoiceIssued', actor);
  if (queued) {
    invoice.invoiceIssuedSentAt = now;
  }
  addActivity(data, 'invoice', `${options.activityLabel || 'Invoice manual'} ${invoice.invoiceNo} periode ${preview.coveredPeriodText || preview.period} dibuat oleh ${actor.name || actor.username || 'Sistem'}`, {
    action: options.activityAction || 'manual-invoice',
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
    coveredPeriods: invoice.coveredPeriods,
    memberId: customer.id || '',
    memberName: customer.name || customer.username || '',
    waQueued: Boolean(queued)
  });
  return { invoice, preview, queued };
}

function normalizeWaPhone(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

const WA_TEMPLATE_ALIASES = {
  name: 'full_name',
  fullname: 'full_name',
  fullName: 'full_name',
  customerName: 'full_name',
  customer_id: 'uid',
  customerId: 'uid',
  invoiceNo: 'no_invoice',
  invoice_no: 'no_invoice',
  invoiceDate: 'invoice_date',
  dueDate: 'due_date',
  paymentGateway: 'payment_gateway',
  paymentLink: 'payment_gateway',
  paymentMutasi: 'payment_mutasi',
  bankTransfer: 'payment_mutasi',
  paymentMethod: 'paid_method',
  paidMethod: 'paid_method',
  payment_method: 'paid_method',
  businessName: 'nama_usaha',
  business_name: 'nama_usaha',
  companyName: 'nama_usaha',
  company_name: 'nama_usaha',
  vat: 'ppn',
  tax: 'ppn'
};

function waTemplateValue(values = {}, key = '') {
  const raw = String(key || '').trim();
  const snake = raw.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const mapped = WA_TEMPLATE_ALIASES[raw] || WA_TEMPLATE_ALIASES[snake] || snake;
  const value = values[mapped] ?? values[raw] ?? values[snake];
  return value === undefined || value === null ? '' : String(value);
}

function renderWaTemplate(template = '', values = {}) {
  return String(template || '')
    .replace(/\[([a-zA-Z0-9_]+)\]/g, (_, key) => waTemplateValue(values, key));
}

function paymentGatewayOrigin(settings = {}) {
  const paymentSettings = settings.paymentGateway || settings || {};
  const configured = String(paymentSettings.publicBaseUrl || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const callbackUrl = String(paymentSettings.callbackUrl || '').trim();
  if (!callbackUrl) return '';
  try {
    const parsed = new URL(callbackUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function paymentGatewayPaymentPath(settings = {}) {
  const paymentSettings = settings.paymentGateway || settings || {};
  return sanitizePublicPath(paymentSettings.paymentPath || '/payment-invoice.html', '/payment-invoice.html');
}

function paymentGatewayAdminFee(settings = {}, kind = 'monthly', amount = 0) {
  const paymentSettings = settings.paymentGateway || settings || {};
  if (kind === 'voucher') {
    const fixedFee = Math.max(0, Math.round(decimalNumber(paymentSettings.voucherAdminFee ?? 750)));
    const percent = Math.max(0, decimalNumber(paymentSettings.voucherAdminFeePercent ?? 0.70));
    const percentFee = (Math.max(0, Number(amount || 0)) * percent) / 100;
    return fixedFee + Math.max(0, Math.ceil(percentFee - 1e-9));
  }
  return Math.max(0, Math.round(decimalNumber(paymentSettings.monthlyAdminFee || 0)));
}

function paymentGatewayAmountBreakdown(settings = {}, amount = 0, kind = 'monthly') {
  const baseAmount = Math.max(0, Math.round(Number(amount || 0) || 0));
  const adminFee = paymentGatewayAdminFee(settings, kind, baseAmount);
  return {
    baseAmount,
    adminFee,
    totalAmount: baseAmount + adminFee
  };
}

function paymentGatewayInvoiceReference(invoice = {}) {
  return displayBillingInvoiceNo(invoice.externalId || invoice.invoiceNo || invoice.id || '');
}

function defaultInvoicePaymentGatewayLink(data = {}, invoice = {}) {
  const origin = paymentGatewayOrigin(data.settings || {});
  const reference = paymentGatewayInvoiceReference(invoice);
  if (!origin || !reference) return '';
  const pathName = paymentGatewayPaymentPath(data.settings || {});
  return `${origin}${pathName}?id=${encodeURIComponent(reference)}`;
}

function invoicePaymentGatewayLink(dataOrInvoice = {}, invoiceMaybe = null) {
  const data = invoiceMaybe ? dataOrInvoice : {};
  const invoice = invoiceMaybe || dataOrInvoice || {};
  return String(
    invoice.paymentGatewayUrl
    || invoice.paymentGatewayLink
    || invoice.paymentLink
    || invoice.checkoutUrl
    || invoice.invoiceUrl
    || invoice.paymentUrl
    || (invoiceMaybe ? defaultInvoicePaymentGatewayLink(data, invoice) : '')
    || ''
  ).trim();
}

function invoiceTransferPaymentMethod(invoice = {}, customer = {}) {
  return String(
    invoice.paymentMutasi
    || invoice.bankTransfer
    || invoice.transferMethod
    || invoice.paymentMethod
    || customer.paymentMutasi
    || customer.bankTransfer
    || customer.transferMethod
    || ''
  ).trim();
}

function radiusUserForInvoice(data = {}, invoice = {}, customer = {}) {
  const candidates = [
    invoice.radiusUserId,
    customer.radiusUserId,
    invoice.customerId,
    customer.id,
    invoice.username,
    customer.username
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (!candidates.length) return {};
  return (data.radiusUsers || []).find((user) => {
    return [
      user.id,
      user.customerId,
      user.username
    ].some((value) => candidates.includes(String(value || '').trim().toLowerCase()));
  }) || {};
}

function invoiceWaTemplateValues(data = {}, invoice = {}) {
  const customer = customerForInvoice(data, invoice);
  const radiusUser = radiusUserForInvoice(data, invoice, customer);
  const profile = radiusFindProfile(data, radiusUser.profileId || radiusUser.profile || invoice.profileId || invoice.profile || customer.profileId, radiusUser.serviceType || 'pppoe')
    || radiusFindProfile(data, radiusUser.profileId || radiusUser.profile || invoice.profileId || invoice.profile || customer.profileId, '')
    || {};
  const invoiceNo = displayBillingInvoiceNo(invoice.externalId || invoice.invoiceNo || invoice.id || '');
  const amountNumber = Number(invoice.subtotal ?? invoice.baseAmount ?? invoice.amount ?? customer.price ?? 0) || 0;
  const ppnNumber = Number(invoice.ppnAmount ?? invoice.taxAmount ?? invoice.vatAmount ?? 0) || 0;
  const discountNumber = Number(invoice.discountAmount ?? invoice.discountValue ?? 0) || 0;
  const totalNumber = Number(invoice.total ?? invoice.totalAmount ?? invoice.amount ?? amountNumber + ppnNumber - discountNumber) || 0;
  const ppnText = ppnNumber > 0
    ? formatMoneyNumberText(ppnNumber)
    : stripCurrencyPrefix(invoice.ppn || invoice.vat || customer.ppn || '');
  const discountText = discountNumber > 0
    ? formatMoneyNumberText(discountNumber)
    : stripCurrencyPrefix(invoice.discount || customer.discount || '');
  const fullname = customer.name || customer.customerName || invoice.customerName || invoice.username || customer.username || 'Pelanggan';
  const uid = customer.code || customer.accountId || invoice.accountId || customer.id || invoice.customerId || customer.username || radiusUser.username || '';
  const period = periodDisplayText(invoiceCoverageText(invoice) || invoice.period || currentPeriod());
  const latestPayment = activePayments(data)
    .filter((payment) => payment.invoiceId === invoice.id)
    .sort((a, b) => String(b.createdAt || b.paidAt || '').localeCompare(String(a.createdAt || a.paidAt || '')))[0] || {};
  const paidMethod = invoice.paymentMethod || latestPayment.method || latestPayment.paymentMethod || '-';
  const businessName = data.settings?.businessName || data.settings?.receiptBusinessCode || 'ISP Billing';
  const gatewayLink = invoicePaymentGatewayLink(data, invoice);
  const gatewayBreakdown = paymentGatewayAmountBreakdown(data.settings || {}, totalNumber, 'monthly');
  return {
    full_name: fullname,
    fullname,
    nama_usaha: businessName,
    uid,
    pppoe_user: radiusUser.username || invoice.username || customer.username || '',
    pppoe_pass: radiusUser.password || '',
    pppoe_profile: profile.name || invoice.packageName || customer.packageName || '',
    no_invoice: invoiceNo,
    invoice_date: dateDisplayText(invoice.invoiceDate || invoice.createdAt || invoice.date || localTodayIso()),
    amount: formatMoneyNumberText(amountNumber),
    ppn: ppnText || '-',
    discount: discountText || '-',
    total: formatMoneyNumberText(totalNumber),
    period,
    due_date: dateDisplayText(invoice.dueDate || ''),
    payment_gateway: gatewayLink,
    admin_fee: formatMoneyNumberText(gatewayBreakdown.adminFee),
    gateway_total: formatMoneyNumberText(gatewayBreakdown.totalAmount),
    payment_total: formatMoneyNumberText(gatewayBreakdown.totalAmount),
    payment_mutasi: invoiceTransferPaymentMethod(invoice, customer),
    paid_method: paidMethod,
    footer: businessName,
    status: invoiceRuntimeStatus(invoice),
    name: fullname,
    invoiceNo,
    dueDate: invoice.dueDate || '',
    invoiceDate: invoice.invoiceDate || invoice.createdAt || invoice.date || '',
    paymentGateway: gatewayLink,
    adminFee: gatewayBreakdown.adminFee,
    gatewayTotal: gatewayBreakdown.totalAmount,
    paymentMutasi: invoiceTransferPaymentMethod(invoice, customer)
  };
}

function queueWaGatewayMessage(data = {}, payload = {}) {
  data.waMessages = Array.isArray(data.waMessages) ? data.waMessages : [];
  const settings = data.settings?.waGateway || {};
  const now = Date.now();
  const queuedCount = data.waMessages.filter((message) => message.status === 'queued').length;
  const delayMs = queuedCount * Math.max(15, Number(settings.minDelaySeconds || 45)) * 1000;
  const batchDelayMs = Math.floor(queuedCount / Math.max(1, Number(settings.maxPerBatch || 20))) * 30 * 60 * 1000;
  const invoiceNo = displayBillingInvoiceNo(payload.invoiceNo || '') || String(payload.invoiceNo || '').replace(/^payment\s+inv\s*#?/i, '').replace(/^#/, '').trim();
  const message = {
    id: createId('wa'),
    type: payload.type || 'paymentReminder',
    provider: settings.provider || 'waha',
    sessionKey: settings.sender || settings.provider || 'default',
    phone: normalizeLocalPhone(payload.phone),
    recipientName: payload.recipientName || '',
    subject: String(payload.subject || (invoiceNo ? `Payment INV #${invoiceNo}` : payload.type || 'Pesan WA')).trim(),
    invoiceId: payload.invoiceId || '',
    invoiceNo: invoiceNo || payload.invoiceNo || '',
    text: payload.text || '',
    status: settings.enabled ? 'queued' : 'draft',
    scheduledAt: new Date(now + delayMs + batchDelayMs).toISOString(),
    attempts: 0,
    createdBy: payload.actorName || '',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString()
  };
  data.waMessages.unshift(message);
  data.waMessages = data.waMessages.slice(0, 500);
  return message;
}

function customerForInvoice(data = {}, invoice = {}) {
  return (data.customers || []).find((customer) => customer.id === invoice.customerId)
    || (data.customers || []).find((customer) => String(customer.username || '').trim().toLowerCase() === String(invoice.username || '').trim().toLowerCase())
    || {};
}

function queueInvoiceWaMessage(data = {}, invoice = {}, type = 'paymentReminder', actor = {}) {
  const settings = data.settings?.waGateway || {};
  const billingSettings = data.settings?.billing || {};
  const notificationAllowed = type === 'paymentReminder'
    || (type === 'invoiceIssued' && billingSettings.notifyInvoiceIssued !== false)
    || (['paymentPaid', 'paymentCancel'].includes(type) && billingSettings.notifyPaymentStatus !== false)
    || (['accountSuspend', 'accountActive'].includes(type) && billingSettings.notifyMemberStatus !== false);
  if (!notificationAllowed) return null;

  const customer = customerForInvoice(data, invoice);
  const values = invoiceWaTemplateValues(data, invoice);
  const invoiceNo = values.no_invoice || displayBillingInvoiceNo(invoice.externalId || invoice.invoiceNo || invoice.id || '');
  const template = settings.templates?.[type] || settings.templates?.paymentReminder || '';
  const text = renderWaTemplate(template, values) || `Halo ${values.fullname}, tagihan internet ${values.period} sebesar Rp ${values.total || values.amount}. No invoice ${values.no_invoice}.`;
  const phone = customer.phone || customer.whatsapp || invoice.phone || '';
  const localPhone = normalizeLocalPhone(phone);
  const waPhone = normalizeWaPhone(localPhone);
  if (!waPhone || !text.trim()) return null;
  return queueWaGatewayMessage(data, {
    type,
    phone: localPhone,
    recipientName: values.fullname,
    invoiceId: invoice.id,
    invoiceNo,
    text,
    actorName: actor.name || actor.username || ''
  });
}

function broadcastRecipients(data = {}, filters = {}) {
  const targetStatus = String(filters.target || filters.recipientType || 'all').trim().toLowerCase();
  const selectedNas = String(filters.nas || 'all').trim().toLowerCase();
  const resolver = radiusStatusResolver(data);
  const usersByCustomer = new Map();
  for (const user of data.radiusUsers || []) {
    if (!user.customerId) continue;
    usersByCustomer.set(user.customerId, user);
  }
  const nasMap = radiusNasDirectory(data);
  return (data.customers || []).filter((customer) => {
    const status = resolver.statusForCustomer(customer);
    if (targetStatus === 'active' && status !== 'active') return false;
    if (['suspend', 'isolated'].includes(targetStatus) && status !== 'isolated') return false;
    if (['terminated', 'terminate'].includes(targetStatus) && status !== 'terminate') return false;
    if (selectedNas && selectedNas !== 'all') {
      const user = usersByCustomer.get(customer.id) || {};
      const nas = nasMap.get(user.nasId) || {};
      const values = [customer.nas, customer.site, nas.id, nas.name, nas.address].map((value) => String(value || '').toLowerCase());
      if (!values.includes(selectedNas)) return false;
    }
    return Boolean(normalizeWaPhone(customer.whatsapp || customer.phone));
  });
}

function queueBroadcastMessages(data = {}, payload = {}, actor = {}) {
  const subject = String(payload.subject || '').trim();
  const text = String(payload.text || payload.message || '').trim();
  if (!text) throw new Error('Text broadcast wajib diisi');
  const recipients = broadcastRecipients(data, payload);
  const queued = [];
  for (const customer of recipients) {
    queued.push(queueWaGatewayMessage(data, {
      type: 'broadcast',
      phone: normalizeLocalPhone(customer.whatsapp || customer.phone),
      recipientName: customer.name || customer.username || '',
      subject: subject || 'Broadcast',
      text: [subject ? `*${subject}*` : '', text].filter(Boolean).join('\n\n'),
      actorName: actor.name || actor.username || ''
    }));
  }
  return { queued, recipientCount: recipients.length };
}

function withinWaSendWindow(settings = {}, now = new Date()) {
  const start = sanitizeTime(settings.quietStart, '08:00');
  const end = sanitizeTime(settings.quietEnd, '20:00');
  const current = localTimeText(now);
  if (start === end) return true;
  if (start < end) return current >= start && current <= end;
  return current >= start || current <= end;
}

function wahaSessionName(settings = {}) {
  return String(settings.sender || 'default').trim() || 'default';
}

function readEnvFileValue(filePath = '', key = '') {
  try {
    const content = fsSync.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || match[1] !== key) continue;
      return match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {
    return '';
  }
  return '';
}

function wahaInternalApiKey(settings = {}) {
  if (settings.token) return settings.token;
  const envKey = process.env.WAHA_API_KEY || process.env.WHATSAPP_API_KEY || process.env.FAKENET_WAHA_API_KEY || '';
  if (envKey) return envKey;
  if (wahaApiKeyCache !== undefined) return wahaApiKeyCache;
  wahaApiKeyCache = readEnvFileValue(WAHA_ENV_FILE, 'WAHA_API_KEY')
    || readEnvFileValue(path.join(__dirname, '..', 'deploy', 'fakenet-billing-waha.env'), 'WAHA_API_KEY')
    || '';
  return wahaApiKeyCache;
}

function wahaHeaders(settings = {}, extra = {}) {
  const apiKey = wahaInternalApiKey(settings);
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
    ...extra
  };
}

function wahaBaseUrl(settings = {}) {
  return waProviderBaseUrl('waha', settings.baseUrl);
}

async function wahaJson(settings = {}, suffix = '', options = {}) {
  const { timeoutMs = WA_GATEWAY_HTTP_TIMEOUT_MS, ...fetchOptions } = options;
  return fetchJsonWithTimeout(joinUrl(wahaBaseUrl(settings), suffix), {
    ...fetchOptions,
    headers: wahaHeaders(settings, fetchOptions.headers || {})
  }, timeoutMs);
}

async function wahaSessionStatus(settings = {}, options = {}) {
  const session = wahaSessionName(settings);
  try {
    return await wahaJson(settings, `/api/sessions/${encodeURIComponent(session)}`, options);
  } catch (error) {
    const sessions = await wahaJson(settings, '/api/sessions', options);
    if (Array.isArray(sessions)) {
      return sessions.find((item) => String(item.name || item.id || '').trim() === session) || { name: session, status: 'STOPPED' };
    }
    return sessions;
  }
}

async function wahaSessionMe(settings = {}, options = {}) {
  const session = wahaSessionName(settings);
  return wahaJson(settings, `/api/sessions/${encodeURIComponent(session)}/me`, options);
}

async function wahaSessionStatusWithProfile(settings = {}, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || WA_GATEWAY_HTTP_TIMEOUT_MS) || WA_GATEWAY_HTTP_TIMEOUT_MS);
  const status = await wahaSessionStatus(settings, { timeoutMs });
  const me = await wahaSessionMe(settings, { timeoutMs: Math.min(timeoutMs, 3000) }).catch(() => null);
  if (!me || typeof me !== 'object') return status;
  return {
    ...status,
    me: {
      ...(status?.me || {}),
      ...me
    }
  };
}

function wahaLinkedPhoneFromStatus(status = {}) {
  const me = status?.me || status?.user || status?.account || {};
  const candidates = [
    me.id,
    me.jid,
    me.user,
    me.phone,
    status.jid,
    status.phone
  ];
  for (const candidate of candidates) {
    let text = String(candidate || '').trim();
    if (!text) continue;
    if (text.includes('@')) text = text.split('@')[0];
    if (text.includes(':')) text = text.split(':')[0];
    const phone = normalizeWaPhone(text);
    if (phone && phone.length >= 10) return phone;
  }
  return '';
}

function wahaLinkedNameFromStatus(status = {}) {
  const me = status?.me || status?.user || status?.account || {};
  return String(me.pushName || me.name || me.verifiedName || status.profile?.name || status.pushName || '').trim();
}

async function wahaDeleteSession(settings = {}) {
  const session = wahaSessionName(settings);
  try {
    return await wahaJson(settings, `/api/sessions/${encodeURIComponent(session)}`, {
      method: 'DELETE',
      body: JSON.stringify({})
    });
  } catch (error) {
    if ([404, 405].includes(Number(error.status))) {
      return { name: session, status: 'STOPPED' };
    }
    throw error;
  }
}

function wahaStatusText(status = {}) {
  if (!status || typeof status !== 'object') return '';
  return String(status.status || status.state || status.engine?.state || '').trim().toUpperCase();
}

function wahaIsConnected(status = {}) {
  const state = wahaStatusText(status);
  return ['WORKING', 'CONNECTED', 'READY'].includes(state);
}

function wahaFriendlyMessage(message = '') {
  const text = String(message || '').trim();
  if (!text) return '';
  if (/session status is not as expected|try again later|restart the session|scan_qr_code|starting|stopped|failed/i.test(text)) {
    return 'Session WAHA sedang disiapkan. Klik Tampilkan QR lagi beberapa detik lagi, lalu scan jika QR muncul.';
  }
  return text;
}

async function wahaStartSession(settings = {}) {
  const session = wahaSessionName(settings);
  const current = await wahaSessionStatus(settings).catch(() => null);
  if (wahaStatusText(current) === 'FAILED') {
    await wahaDeleteSession(settings).catch(() => null);
  }
  try {
    await wahaJson(settings, '/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name: session, start: false })
    });
  } catch (error) {
    if (![400, 409, 422].includes(Number(error.status))) throw error;
  }
  try {
    return await wahaJson(settings, `/api/sessions/${encodeURIComponent(session)}/start`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  } catch (error) {
    if (Number(error.status) === 422) {
      return wahaSessionStatus(settings);
    }
    throw error;
  }
}

async function wahaStopSession(settings = {}) {
  const session = wahaSessionName(settings);
  try {
    return await wahaJson(settings, `/api/sessions/${encodeURIComponent(session)}/stop`, {
      method: 'POST',
      body: JSON.stringify({})
    });
  } catch (error) {
    if (![404, 405, 500].includes(Number(error.status))) throw error;
    return wahaDeleteSession(settings);
  }
}

async function wahaLogoutSession(settings = {}) {
  const session = wahaSessionName(settings);
  const encodedSession = encodeURIComponent(session);
  const attempts = [
    `/api/sessions/${encodedSession}/logout`,
    `/api/${encodedSession}/auth/logout`
  ];
  let lastError = null;
  for (const suffix of attempts) {
    try {
      await wahaJson(settings, suffix, {
        method: 'POST',
        body: JSON.stringify({})
      });
      return await wahaSessionStatus(settings).catch(() => ({ name: session, status: 'STOPPED' }));
    } catch (error) {
      lastError = error;
      if (![400, 404, 405, 409, 422, 500].includes(Number(error.status))) {
        break;
      }
    }
  }
  try {
    return await wahaDeleteSession(settings);
  } catch (error) {
    lastError = error;
  }
  try {
    return await wahaStopSession(settings);
  } catch (error) {
    throw lastError || error;
  }
}

async function wahaQr(settings = {}) {
  const session = wahaSessionName(settings);
  let status = await wahaSessionStatus(settings).catch(() => null);
  const initialState = wahaStatusText(status);
  if (['FAILED', 'STOPPED'].includes(initialState)) {
    status = await wahaStartSession(settings).catch(() => status);
  }
  if (status && wahaIsConnected(status)) {
    return {
      connected: true,
      status,
      message: 'WAHA sudah terhubung. Klik Logout jika ingin scan ulang perangkat.'
    };
  }
  const suffixes = [
    `/api/${encodeURIComponent(session)}/auth/qr?format=base64`,
    `/api/${encodeURIComponent(session)}/auth/qr`,
    `/api/sessions/${encodeURIComponent(session)}/auth/qr?format=base64`,
    `/api/sessions/${encodeURIComponent(session)}/auth/qr`
  ];
  let lastError = null;
  for (const suffix of suffixes) {
    try {
      return await wahaJson(settings, suffix, {
        headers: { Accept: 'application/json' }
      });
    } catch (error) {
      lastError = error;
      if (Number(error.status) === 422 && error.payload?.status) {
        const state = wahaStatusText(error.payload);
        if (['FAILED', 'STOPPED'].includes(state)) {
          await wahaStartSession(settings).catch(() => null);
        }
        return {
          connected: wahaIsConnected(error.payload),
          status: error.payload,
          message: wahaFriendlyMessage(error.payload.error || error.message)
        };
      }
    }
  }
  throw lastError || new Error('QR WAHA belum tersedia');
}

async function deliverWaMessage(settings = {}, message = {}) {
  const provider = normalizeWaProvider(settings.provider || message.provider || 'waha');
  if (provider !== 'waha') {
    throw new Error(`Provider ${provider} belum memakai worker lokal. Pilih Whatsapp Gateway untuk pengiriman otomatis.`);
  }
  const phone = normalizeWaPhone(message.phone);
  if (!phone) throw new Error('Nomor WhatsApp kosong');
  const payload = await wahaJson(settings, '/api/sendText', {
    method: 'POST',
    body: JSON.stringify({
      session: wahaSessionName(settings),
      chatId: `${phone}@c.us`,
      text: String(message.text || '')
    })
  });
  return {
    providerMessageId: payload.id || payload.messageId || payload._data?.id || '',
    response: payload
  };
}

let waGatewaySenderRunning = false;
let waGatewaySenderTimer = null;

async function runWaGatewaySender(reason = 'interval', options = {}) {
  if (waGatewaySenderRunning) return null;
  waGatewaySenderRunning = true;
  const now = new Date();
  try {
    const data = await loadStore();
    const settings = data.settings?.waGateway || {};
    const provider = normalizeWaProvider(settings.provider || 'waha');
    if (!settings.enabled || provider !== 'waha' || (!options.ignoreWindow && !withinWaSendWindow(settings, now))) {
      return { sent: 0, skipped: true };
    }
    const maxPerBatch = Math.max(1, Math.min(20, Number(settings.maxPerBatch || 20) || 20));
    const dueMessages = (data.waMessages || [])
      .filter((message) => {
        if (options.messageId && message.id !== options.messageId) return false;
        if (!['queued', 'failed'].includes(String(message.status || ''))) return false;
        if (options.messageId) return true;
        return !message.scheduledAt || new Date(message.scheduledAt).getTime() <= now.getTime();
      })
      .slice(0, maxPerBatch);
    if (!dueMessages.length) return { sent: 0 };

    const results = [];
    for (const message of dueMessages) {
      try {
        const delivery = await deliverWaMessage(settings, message);
        results.push({
          id: message.id,
          status: 'sent',
          providerMessageId: delivery.providerMessageId,
          sentAt: new Date().toISOString(),
          lastError: ''
        });
      } catch (error) {
        const attempts = Number(message.attempts || 0) + 1;
        const retryDelaySeconds = Math.max(15, Number(settings.minDelaySeconds || 45)) * Math.min(attempts, 10);
        results.push({
          id: message.id,
          status: attempts >= 3 ? 'failed' : 'queued',
          attempts,
          scheduledAt: new Date(Date.now() + retryDelaySeconds * 1000).toISOString(),
          lastError: error.message || 'Whatsapp Gateway gagal mengirim'
        });
      }
    }

    await mutate((store) => {
      const byId = new Map(results.map((item) => [item.id, item]));
      for (const message of store.waMessages || []) {
        const update = byId.get(message.id);
        if (!update) continue;
        Object.assign(message, update, {
          provider,
          updatedAt: new Date().toISOString()
        });
      }
      if (results.length) {
        addActivity(store, 'settings', `Whatsapp Gateway ${reason}: ${results.filter((item) => item.status === 'sent').length} terkirim`, {
          action: 'wa-gateway-send',
          attempted: results.length
        });
      }
    });
    return {
      sent: results.filter((item) => item.status === 'sent').length,
      failed: results.filter((item) => item.status === 'failed').length,
      retried: results.filter((item) => item.status === 'queued').length
    };
  } finally {
    waGatewaySenderRunning = false;
  }
}

function startWaGatewaySender() {
  const run = (reason) => {
    runWaGatewaySender(reason).catch((error) => {
      console.error(`Whatsapp Gateway sender gagal: ${error.message || error}`);
    });
  };
  const initialTimer = setTimeout(() => run('startup'), 15_000);
  initialTimer.unref?.();
  waGatewaySenderTimer = setInterval(() => run('interval'), WA_GATEWAY_SEND_INTERVAL_MS);
  waGatewaySenderTimer.unref?.();
  console.log(`Whatsapp Gateway sender aktif setiap ${Math.round(WA_GATEWAY_SEND_INTERVAL_MS / 1000)} detik`);
}

function paymentGatewayReportPayload(data = {}, query = {}) {
  const from = String(query.from || '').trim();
  const to = String(query.to || '').trim();
  const search = String(query.search || '').trim().toLowerCase();
  const method = String(query.method || 'all').trim().toLowerCase();
  const kind = String(query.kind || 'all').trim().toLowerCase();
  const allRows = Array.isArray(data.paymentGatewayTransactions) ? data.paymentGatewayTransactions : [];
  let rows = allRows.map((row) => {
    const transactionKind = paymentGatewayTransactionKind(row);
    return {
      ...row,
      transactionKind,
      transactionKindLabel: paymentGatewayTransactionKindLabel(transactionKind)
    };
  }).filter((row) => {
    const date = String(row.date || row.createdAt || '').slice(0, 10);
    if (from && date && date < from) return false;
    if (to && date && date > to) return false;
    if (method !== 'all' && String(row.method || row.paymentMethod || '').toLowerCase() !== method) return false;
    if (kind !== 'all' && row.transactionKind !== kind) return false;
    if (search && ![
      row.reference,
      row.description,
      row.invoiceNo,
      row.customerName,
      row.provider,
      row.method,
      row.transactionKindLabel,
      row.transactionKind,
      row.status
    ].some((value) => String(value || '').toLowerCase().includes(search))) return false;
    return true;
  });
  rows = sortByDateDesc(rows, 'createdAt');
  const pending = rows.filter((row) => ['pending', 'waiting', 'unpaid'].includes(String(row.status || '').toLowerCase()));
  const fees = rows.reduce((sum, row) => sum + Number(row.fee || 0), 0);
  const paid = rows.filter((row) => ['paid', 'settled', 'success'].includes(String(row.status || '').toLowerCase()));
  return {
    transactions: rows,
    balanceHistory: rows.filter((row) => row.kind === 'balance'),
    pending,
    reports: rows.filter((row) => Number(row.fee || 0) > 0 || row.kind === 'fee'),
    summary: {
      total: rows.length,
      totalAmount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      paid: paid.length,
      paidAmount: paid.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      pending: pending.length,
      pendingAmount: pending.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      fees
    }
  };
}

function publicSiteMediaServices(target = {}, fallbackMediaServices = {}) {
  const {
    tvheadendPassword,
    embyApiKey,
    ...safeMediaServices
  } = target.mediaServices && typeof target.mediaServices === 'object' ? target.mediaServices : {};
  const fallback = fallbackMediaServices && typeof fallbackMediaServices === 'object' ? fallbackMediaServices : {};
  const useFallback = Object.keys(fallback).length > 0;
  return {
    ...safeMediaServices,
    tvheadendUrl: safeMediaServices.tvheadendUrl || (useFallback ? (process.env.TVHEADEND_URL || fallback.tvheadendUrl) : '') || '',
    tvheadendUsername: safeMediaServices.tvheadendUsername || (useFallback ? (process.env.TVHEADEND_USERNAME || fallback.tvheadendUsername) : '') || '',
    embyUrl: safeMediaServices.embyUrl || (useFallback ? (process.env.EMBY_URL || fallback.embyUrl) : '') || '',
    hasTvheadendLogin: Boolean(
      (safeMediaServices.tvheadendUsername && tvheadendPassword) ||
      (useFallback && process.env.TVHEADEND_USERNAME && process.env.TVHEADEND_PASSWORD) ||
      (useFallback && fallback.tvheadendUsername && fallback.tvheadendPassword)
    ),
    hasEmbyApiKey: Boolean(embyApiKey || (useFallback && process.env.EMBY_API_KEY) || (useFallback && fallback.embyApiKey))
  };
}

function publicMonitoringTarget(target = {}, fallbackMediaServices = {}) {
  const radius = target.radius && typeof target.radius === 'object' ? target.radius : {};
  return {
    ...target,
    radius: {
      enabled: radius.enabled === true,
      name: radius.name || target.name || '',
      address: target.host || radius.address || '',
      port: radius.port || 3799,
      type: radius.type || 'mikrotik',
      credentialStored: Boolean(radius.secret)
    },
    mediaServices: publicSiteMediaServices(target, fallbackMediaServices)
  };
}

function persistRadbooxCredentials(radbooxSettings, payload = {}, data = null) {
  for (const key of ['token', 'username', 'password']) {
    if (typeof payload[key] === 'string' && payload[key].trim()) {
      radbooxSettings[key] = payload[key].trim();
    }
  }
  if (payload.clearActionPassword === true || payload.clearActionPassword === 'true') {
    delete radbooxSettings.actionPasswordEnc;
  }
  if (typeof payload.actionPassword === 'string' && payload.actionPassword) {
    if (!data) {
      throw new Error('Store belum tersedia untuk menyimpan password aksi Radboox');
    }
    radbooxSettings.actionPasswordEnc = secureSecrets.encryptSecret(data, payload.actionPassword);
  }
}

async function mutate(mutator) {
  const run = async () => {
    const data = await loadStore();
    const result = await mutator(data);
    const saved = await saveStore(data);
    return { data: saved, result };
  };

  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

async function syncFreeradiusIfNeeded(data, actor, action) {
  if (!freeradiusSql.enabled()) {
    return null;
  }
  return freeradiusSql.syncAll(data, { actor, action });
}

let billingAutomationRunning = false;
let billingAutomationTimer = null;

async function runStandaloneBillingAutomation(reason = 'interval') {
  if (billingAutomationRunning) return null;
  billingAutomationRunning = true;
  const actor = { username: 'billing-auto', name: 'Billing Auto' };
  try {
    const { result } = await mutate(async (data) => {
      const stampedVouchers = await stampHotspotVoucherValidityFromSessions(data, actor);
      const automation = standaloneBillingAutomation(data, actor);
      automation.stampedVouchers = stampedVouchers;
      const expiredVouchers = (automation.voucherExpirations?.removed?.length || 0) + (automation.voucherExpirations?.updated?.length || 0);
      if (automation.created.length || automation.isolatedUsers.length || automation.activatedUsers.length || expiredVouchers) {
        await syncFreeradiusIfNeeded(data, actor, `billing-automation-${reason}`);
      }
      if (expiredVouchers) {
        automation.expiredVoucherDisconnects = await disconnectExpiredVoucherSessions(data, automation.voucherExpirations, actor);
      }
      return automation;
    });
    return result;
  } finally {
    billingAutomationRunning = false;
  }
}

function startStandaloneBillingAutomation() {
  if (!['standalone', 'local'].includes(APP_MODE) && BILLING_SOURCE !== 'local') return;
  const run = (reason) => {
    runStandaloneBillingAutomation(reason).catch((error) => {
      console.error(`Billing otomatis gagal: ${error.message || error}`);
    });
  };
  const initialTimer = setTimeout(() => run('startup'), 10_000);
  initialTimer.unref?.();
  billingAutomationTimer = setInterval(() => run('interval'), BILLING_AUTOMATION_INTERVAL_MS);
  billingAutomationTimer.unref?.();
  console.log(`Billing otomatis aktif setiap ${Math.round(BILLING_AUTOMATION_INTERVAL_MS / 1000)} detik`);
}

let radbooxAutoSyncRunning = false;
let radbooxAutoSyncTimer = null;

function radbooxSyncError(error) {
  return error && error.message ? error.message : 'Sinkron Radboox gagal';
}

function radbooxStatusResponse(data = {}) {
  return {
    configured: false,
    credentialReady: false,
    mode: 'disabled',
    source: 'local',
    baseUrl: '',
    apiBaseUrl: '',
    message: 'Mode standalone memakai data billing lokal.',
    autoSync: {
      enabled: false,
      intervalMs: 0,
      lastStartedAt: '',
      lastFinishedAt: '',
      lastSuccessAt: '',
      lastError: ''
    }
  };
}

function radbooxActionCredentials(authContext) {
  const rawUser = (authContext.data.users || []).find((item) => item.id === authContext.user.id);
  return auth.radbooxCredentialsForUser(authContext.data, rawUser || authContext.user);
}

function radbooxDefaultActionCredentials(data = {}) {
  const settings = data.settings?.radboox || {};
  const adminUser = (data.users || []).find((user) => user.active !== false && user.username === 'admin')
    || (data.users || []).find((user) => user.active !== false && user.role === 'admin');
  const username = String(settings.username || adminUser?.radbooxUsername || adminUser?.username || '').trim();
  const password = secureSecrets.decryptSecret(data, adminUser?.radbooxPasswordEnc)
    || secureSecrets.decryptSecret(data, settings.actionPasswordEnc)
    || String(settings.password || '').trim();
  if (!username || !password) {
    throw new Error('Kredensial default Radboox belum tersedia');
  }
  return { username, password };
}

function radbooxDefaultReadCredentials(data = {}) {
  const settings = data.settings?.radboox || {};
  const adminUser = (data.users || []).find((user) => user.active !== false && user.username === 'admin')
    || (data.users || []).find((user) => user.active !== false && user.role === 'admin');
  const settingsUsername = String(settings.username || '').trim();
  const settingsPassword = String(settings.password || '').trim();
  const actionPassword = secureSecrets.decryptSecret(data, settings.actionPasswordEnc);
  if (settingsUsername && settingsPassword) {
    return { username: settingsUsername, password: settingsPassword };
  }
  if (settingsUsername && actionPassword) {
    return { username: settingsUsername, password: actionPassword };
  }
  const adminUsername = String(adminUser?.radbooxUsername || adminUser?.username || '').trim();
  const adminPassword = secureSecrets.decryptSecret(data, adminUser?.radbooxPasswordEnc);
  if (adminUsername && adminPassword) {
    return { username: adminUsername, password: adminPassword };
  }
  return radbooxDefaultActionCredentials(data);
}

function radbooxWriteCredentials(authContext) {
  try {
    const credentials = radbooxActionCredentials(authContext);
    const defaultUsername = String(authContext.data.settings?.radboox?.username || '').trim().toLowerCase();
    if (!credentials.usesDefaultPassword || !defaultUsername || String(credentials.username || '').trim().toLowerCase() === defaultUsername) {
      return credentials;
    }
    return radbooxDefaultReadCredentials(authContext.data);
  } catch {
    return radbooxDefaultReadCredentials(authContext.data);
  }
}

function cleanupXenditWithdrawRequests() {
  const now = Date.now();
  for (const [token, request] of xenditWithdrawRequests.entries()) {
    if (!request || Number(request.expiresAt || 0) <= now) {
      xenditWithdrawRequests.delete(token);
    }
  }
}

function createXenditWithdrawRequest(userId, result = {}) {
  cleanupXenditWithdrawRequests();
  const sign = String(result.sign || '').trim();
  if (!sign) {
    throw new Error('Token verifikasi withdraw tidak diterima dari Radboox');
  }
  const token = crypto.randomUUID();
  xenditWithdrawRequests.set(token, {
    userId,
    sign,
    amount: Number(result.amount || 0),
    bank: result.bank || '',
    accountName: result.accountName || '',
    accountNumberMasked: result.accountNumberMasked || '',
    expiresAt: Date.now() + XENDIT_WITHDRAW_TTL_MS
  });
  return token;
}

function takeXenditWithdrawRequest(userId, token) {
  cleanupXenditWithdrawRequests();
  const safeToken = String(token || '').trim();
  const request = safeToken ? xenditWithdrawRequests.get(safeToken) : null;
  if (!request || request.userId !== userId) {
    throw new Error('Sesi verifikasi withdraw tidak valid atau sudah kedaluwarsa');
  }
  xenditWithdrawRequests.delete(safeToken);
  return request;
}

async function notificationSummary(data = {}, user = {}) {
  const notifications = {
    inventory: {
      visible: auth.hasPermission(user, 'inventory:read'),
      count: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      message: ''
    },
    asset: {
      visible: auth.hasPermission(user, 'network-assets:read'),
      count: 0,
      damagedCount: 0,
      lostCount: 0,
      message: ''
    },
    billing: {
      visible: auth.hasPermission(user, 'billing-monitor:read'),
      count: 0,
      amount: 0,
      message: '',
      error: ''
    },
    onlinePayments: {
      visible: auth.hasPermission(user, 'payment-gateway:manage'),
      count: 0,
      message: '',
      events: []
    }
  };

  if (notifications.inventory.visible) {
    const summary = operations.inventorySummary(data.inventoryItems || []);
    notifications.inventory.lowStockCount = Number(summary.lowStockCount || 0);
    notifications.inventory.outOfStockCount = Number(summary.outOfStockCount || 0);
    notifications.inventory.count = notifications.inventory.lowStockCount + notifications.inventory.outOfStockCount;
    notifications.inventory.message = notifications.inventory.count
      ? `${notifications.inventory.count} barang perlu restock`
      : 'Stok aman';
  }

  if (notifications.asset.visible) {
    const summary = operations.networkSummary(data.networkAssets || []);
    notifications.asset.damagedCount = Number(summary.damagedCount || 0);
    notifications.asset.lostCount = Number(summary.lostCount || 0);
    notifications.asset.count = notifications.asset.damagedCount + notifications.asset.lostCount;
    notifications.asset.message = notifications.asset.count
      ? `${notifications.asset.count} aset rusak/hilang`
      : 'Aset aman';
  }

  if (notifications.billing.visible) {
    const payload = localBillingMonitorPayload(data, {
      status: 'unpaid',
      customerStatus: 'all',
      site: 'all',
      period: currentPeriod(),
      search: ''
    });
    const summary = payload.summary || {};
    notifications.billing.count = Number(summary.unpaid || 0);
    notifications.billing.amount = Number(summary.unpaidAmount || 0);
    notifications.billing.message = notifications.billing.count
      ? `${notifications.billing.count} pelanggan belum bayar`
      : 'Tagihan aman';
  }

  if (notifications.onlinePayments.visible) {
    const cutoff = Date.now() - (10 * 60 * 1000);
    const rows = (data.paymentGatewayTransactions || [])
      .filter((row) => ['paid', 'settled', 'success'].includes(String(row.status || '').toLowerCase()))
      .filter((row) => {
        const timestamp = Date.parse(row.paidAt || row.paymentAt || row.updatedAt || row.createdAt || '');
        return Number.isFinite(timestamp) && timestamp >= cutoff;
      })
      .sort((a, b) => Date.parse(b.paidAt || b.paymentAt || b.updatedAt || b.createdAt || '') - Date.parse(a.paidAt || a.paymentAt || a.updatedAt || a.createdAt || ''))
      .slice(0, 10);
    notifications.onlinePayments.count = rows.length;
    notifications.onlinePayments.message = rows.length
      ? `${rows.length} pembayaran online terbaru`
      : '';
    notifications.onlinePayments.events = rows.map((row) => {
      const kind = paymentGatewayTransactionKind(row);
      const reference = row.invoiceNo || row.reference || row.externalId || row.id || '';
      const customerName = row.customerName || row.username || row.paidByName || '';
      const amount = Number(row.amount || row.baseAmount || 0);
      return {
        id: row.id || `${kind}:${reference}:${row.paidAt || row.paymentAt || row.updatedAt || ''}`,
        type: kind,
        title: `${paymentGatewayTransactionKindLabel(kind)} dibayar`,
        description: [
          customerName || reference || 'Pembayaran online',
          formatCurrencyText(amount)
        ].filter(Boolean).join(' - '),
        amount,
        amountText: formatCurrencyText(amount),
        reference,
        customerName,
        paidAt: row.paidAt || row.paymentAt || row.updatedAt || row.createdAt || '',
        paidAtText: dateTimeDisplayText(row.paidAt || row.paymentAt || row.updatedAt || row.createdAt || '')
      };
    });
  }

  return notifications;
}

async function runRadbooxAutoSync(reason = 'interval') {
  if (!RADBOOX_AUTO_SYNC_ENABLED) {
    return { skipped: true, reason: 'disabled' };
  }
  if (radbooxAutoSyncRunning) {
    return { skipped: true, reason: 'already-running' };
  }

  radbooxAutoSyncRunning = true;
  const startedAt = new Date().toISOString();
  const finished = {
    ok: false,
    monthly: null,
    daily: null,
    errors: []
  };

  try {
    let data = await loadStore();
    const info = radboox.status(data.settings);
    if (!info.configured || !info.credentialReady) {
      const message = !info.configured
        ? 'Endpoint Radboox belum lengkap.'
        : 'Kredensial Radboox belum tersedia.';
      await mutate((store) => updateRadbooxAutoSyncStatus(store, {
        enabled: true,
        intervalMs: RADBOOX_AUTO_SYNC_INTERVAL_MS,
        lastStartedAt: startedAt,
        lastFinishedAt: new Date().toISOString(),
        lastErrorAt: new Date().toISOString(),
        lastError: message,
        lastReason: reason
      }));
      return { ok: false, error: message };
    }

    const period = currentPeriod();
    try {
      const monthly = await radboox.syncMonthlyEarning(data.settings, {
        period,
        noCache: true,
        cache: false,
        refresh: true,
        force: true
      });
      const mutation = await mutate((store) => {
        const result = upsertMonthlyEarning(store, monthly.earning);
        updateRadbooxAutoSyncStatus(store, {
          enabled: true,
          intervalMs: RADBOOX_AUTO_SYNC_INTERVAL_MS,
          lastStartedAt: startedAt,
          lastReason: reason,
          monthly: {
            ok: true,
            mode: monthly.mode,
            period: monthly.period,
            amount: Number(result.amount || 0),
            transactionCount: Number(result.transactionCount || 0),
            fetchedAt: result.fetchedAt || '',
            lastSuccessAt: new Date().toISOString(),
            lastError: ''
          }
        });
        return result;
      });
      data = mutation.data;
      finished.monthly = mutation.result;
      finished.ok = true;
    } catch (error) {
      const message = radbooxSyncError(error);
      finished.errors.push(`Monthly: ${message}`);
      await mutate((store) => updateRadbooxAutoSyncStatus(store, {
        enabled: true,
        intervalMs: RADBOOX_AUTO_SYNC_INTERVAL_MS,
        lastStartedAt: startedAt,
        lastReason: reason,
        monthly: {
          ok: false,
          period,
          lastErrorAt: new Date().toISOString(),
          lastError: message
        }
      }));
    }

    data = await loadStore();
    const date = todayIso();
    try {
      const daily = await radboox.syncDailyReport(data.settings, {
        date,
        sites: activeReportSites(data),
        noCache: true,
        cache: false,
        refresh: true,
        force: true
      });
      const mutation = await mutate((store) => {
        const result = upsertRadbooxDailyReport(store, daily.report);
        updateRadbooxAutoSyncStatus(store, {
          enabled: true,
          intervalMs: RADBOOX_AUTO_SYNC_INTERVAL_MS,
          lastStartedAt: startedAt,
          lastReason: reason,
          daily: {
            ok: true,
            mode: daily.mode,
            date: daily.date,
            totalIncome: Number(result.totalIncome || 0),
            transactionCount: Number(result.transactionCount || 0),
            fetchedAt: result.fetchedAt || '',
            lastSuccessAt: new Date().toISOString(),
            lastError: ''
          }
        });
        return result;
      });
      finished.daily = mutation.result;
      finished.ok = true;
    } catch (error) {
      const message = radbooxSyncError(error);
      finished.errors.push(`Harian: ${message}`);
      await mutate((store) => updateRadbooxAutoSyncStatus(store, {
        enabled: true,
        intervalMs: RADBOOX_AUTO_SYNC_INTERVAL_MS,
        lastStartedAt: startedAt,
        lastReason: reason,
        daily: {
          ok: false,
          date,
          lastErrorAt: new Date().toISOString(),
          lastError: message
        }
      }));
    }

    const lastFinishedAt = new Date().toISOString();
    await mutate((store) => updateRadbooxAutoSyncStatus(store, {
      enabled: true,
      intervalMs: RADBOOX_AUTO_SYNC_INTERVAL_MS,
      lastStartedAt: startedAt,
      lastFinishedAt,
      lastReason: reason,
      lastSuccessAt: finished.ok ? lastFinishedAt : (store.settings?.radboox?.autoSync?.lastSuccessAt || ''),
      lastErrorAt: finished.errors.length ? lastFinishedAt : '',
      lastError: finished.errors.join(' | ')
    }));

    return finished;
  } finally {
    radbooxAutoSyncRunning = false;
  }
}

function startRadbooxAutoSync() {
  if (!RADBOOX_AUTO_SYNC_ENABLED) {
    console.log('Radboox auto-sync nonaktif');
    return;
  }
  const run = (reason) => {
    runRadbooxAutoSync(reason).catch((error) => {
      console.error(`Radboox auto-sync gagal: ${error.message || error}`);
    });
  };
  const initialDelayMs = Math.min(30000, Math.max(5000, Math.round(RADBOOX_AUTO_SYNC_INTERVAL_MS / 6)));
  const initialTimer = setTimeout(() => run('startup'), initialDelayMs);
  initialTimer.unref?.();
  radbooxAutoSyncTimer = setInterval(() => run('interval'), RADBOOX_AUTO_SYNC_INTERVAL_MS);
  radbooxAutoSyncTimer.unref?.();
  console.log(`Radboox auto-sync aktif setiap ${intervalLabel(RADBOOX_AUTO_SYNC_INTERVAL_MS)}`);
}

async function ensureStartupData() {
  const { result } = await mutate((data) => operations.ensureDefaultInventoryItems(data));
  if (result && result.created && result.created.length) {
    console.log(`Master inventaris dibuat: ${result.created.length} barang`);
  }
}

async function requirePermission(req, res, permission) {
  const data = await loadStore();
  const user = auth.requestUser(req, data);
  if (!user) {
    unauthorized(res);
    return null;
  }
  if (!auth.hasPermission(user, permission)) {
    forbidden(res);
    return null;
  }
  return { data, user };
}

async function requireAnyPermission(req, res, permissions = []) {
  const data = await loadStore();
  const user = auth.requestUser(req, data);
  if (!user) {
    unauthorized(res);
    return null;
  }
  if (!permissions.some((permission) => auth.hasPermission(user, permission))) {
    forbidden(res);
    return null;
  }
  return { data, user };
}

function paymentGatewayCallbackPayload(payload = {}) {
  const nested = payload.data && typeof payload.data === 'object' ? payload.data : {};
  return {
    ...nested,
    ...payload
  };
}

function paymentGatewayPayloadMerchantReference(payload = {}) {
  return String(
    payload.merchant_ref
      || payload.merchantRef
      || payload.external_id
      || payload.externalId
      || payload.order_id
      || payload.orderId
      || payload.invoiceNo
      || payload.invoice_no
      || payload.no_invoice
      || payload.paymentReference
      || payload.reference
      || ''
  ).trim();
}

function paymentGatewayPayloadExternalReference(payload = {}) {
  return String(
    payload.reference
      || payload.transaction_id
      || payload.transactionId
      || payload.id
      || payload.gatewayReference
      || ''
  ).trim();
}

function paymentGatewayPayloadAmount(payload = {}) {
  return Math.round(Number(
    payload.amount
      || payload.total_amount
      || payload.totalAmount
      || payload.gross_amount
      || payload.grossAmount
      || payload.nominal
      || 0
  ) || 0);
}

function paymentGatewayPayloadFee(payload = {}) {
  return Math.round(Number(
    payload.fee
      || payload.total_fee
      || payload.totalFee
      || payload.admin_fee
      || payload.adminFee
      || 0
  ) || 0);
}

function paymentGatewayPayloadMethod(payload = {}, fallback = 'Payment Gateway') {
  return String(
    payload.payment_method
      || payload.paymentMethod
      || payload.method
      || payload.payment_channel
      || payload.paymentChannel
      || payload.payment_name
      || payload.paymentName
      || payload.channel
      || fallback
  ).trim() || fallback;
}

function paymentGatewayPayloadPaidAt(payload = {}) {
  return payload.paidAt
    || payload.paid_at
    || payload.settlement_time
    || payload.settlementTime
    || payload.paid_time
    || payload.paidTime
    || payload.updated_at
    || payload.updatedAt
    || new Date().toISOString();
}

function cleanPaymentGatewayInvoiceReference(value = '') {
  return String(value || '')
    .replace(/^payment\s+inv\s*#?/i, '')
    .replace(/^invoice\s*#?/i, '')
    .replace(/^#/, '')
    .trim();
}

function findBillingInvoiceByReference(data = {}, value = '') {
  const needle = cleanPaymentGatewayInvoiceReference(value).toLowerCase();
  if (!needle) return null;
  return (data.invoices || []).find((invoice) => {
    const candidates = [
      invoice.id,
      invoice.externalId,
      invoice.invoiceNo,
      displayBillingInvoiceNo(invoice.externalId || invoice.invoiceNo || invoice.id)
    ].map(cleanPaymentGatewayInvoiceReference)
      .map((item) => item.toLowerCase())
      .filter(Boolean);
    return candidates.includes(needle);
  }) || null;
}

function upsertPaidBillingPaymentGatewayTransaction(data = {}, invoice = {}, payment = {}, actor = {}) {
  data.paymentGatewayTransactions = Array.isArray(data.paymentGatewayTransactions) ? data.paymentGatewayTransactions : [];
  const now = new Date().toISOString();
  const invoiceNo = displayBillingInvoiceNo(invoice.externalId || invoice.invoiceNo || invoice.id);
  const reference = payment.merchantReference || invoiceNo || invoice.id || '';
  const existing = data.paymentGatewayTransactions.find((row) => {
    return (row.invoiceId && row.invoiceId === invoice.id)
      || (reference && row.reference === reference)
      || (invoiceNo && row.invoiceNo === invoiceNo);
  });
  const customer = customerForInvoice(data, invoice);
  const next = {
    ...(existing || {}),
    id: existing?.id || createId('pg'),
    kind: 'billing-online',
    transactionKind: 'monthly-package',
    sourceType: 'billing',
    provider: payment.provider || data.settings?.paymentGateway?.provider || 'tripay',
    method: payment.method || 'Payment Gateway',
    paymentMethod: payment.method || 'Payment Gateway',
    reference,
    invoiceNo,
    description: `Paket Bulanan ${invoice.packageName || customer.packageName || invoice.period || ''}`.trim(),
    customerId: invoice.customerId || '',
    invoiceId: invoice.id || '',
    customerName: customer.name || invoice.customerName || invoice.username || '',
    username: customer.username || invoice.username || '',
    amount: Number(payment.amount || invoice.amount || 0),
    baseAmount: Number(payment.baseAmount || invoice.amount || 0),
    fee: Number(payment.adminFee ?? payment.fee ?? existing?.fee ?? 0),
    adminFee: Number(payment.adminFee ?? payment.fee ?? existing?.adminFee ?? 0),
    status: 'paid',
    paidAt: payment.paidAt || now,
    paymentAt: payment.paidAt || now,
    externalId: payment.externalId || existing?.externalId || '',
    paidByName: actor.name || actor.username || existing?.paidByName || 'Payment Gateway',
    paidByUsername: actor.username || existing?.paidByUsername || 'payment-gateway',
    paidByRole: actor.role || existing?.paidByRole || '',
    createdAt: existing?.createdAt || invoice.createdAt || now,
    updatedAt: now,
    date: String(payment.paidAt || now).slice(0, 10)
  };
  if (existing) {
    Object.assign(existing, next);
  } else {
    data.paymentGatewayTransactions.unshift(next);
  }
  data.paymentGatewayTransactions = data.paymentGatewayTransactions.slice(0, 1000);
  return next;
}

function fulfillBillingInvoicePaymentGateway(data = {}, value = '', payment = {}, actor = {}) {
  const invoice = findBillingInvoiceByReference(data, value);
  if (!invoice) throw new Error('Invoice bulanan tidak ditemukan');
  const status = normalizePaymentStatus(payment.status || 'paid');
  if (status !== 'paid') {
    return { invoice, status, transaction: null, reused: false };
  }
  const amount = Math.round(Number(payment.amount || 0) || 0);
  const gatewayBreakdown = paymentGatewayAmountBreakdown(data.settings || {}, invoice.amount || 0, 'monthly');
  if (amount > 0 && amount < gatewayBreakdown.totalAmount) {
    throw new Error('Nominal pembayaran lebih kecil dari invoice');
  }
  const existingPayment = activePayments(data).find((item) => item.invoiceId === invoice.id);
  const wasPaid = invoiceRuntimeStatus(invoice) === 'paid';
  const paid = wasPaid
    ? invoice
    : markInvoicePaid(data, invoice.id, {
      paymentMethod: payment.method || 'Payment Gateway',
      amount: invoice.amount,
      paidAt: payment.paidAt || localTodayIso(),
      notes: payment.externalId ? `Payment Gateway ${payment.externalId}` : 'Payment Gateway',
      createdByName: actor.name || actor.username || 'Payment Gateway',
      createdByUsername: actor.username || 'payment-gateway',
      createdByRole: actor.role || 'system'
    });
  if (paid && !wasPaid) {
    queueInvoiceWaMessage(data, paid, 'paymentPaid', actor);
  }
  const activation = reactivateCustomerAfterPaidInvoice(data, paid || invoice, actor);
  let activatedUser = activation.activatedUser || null;
  if (activatedUser) {
    queueInvoiceWaMessage(data, paid || invoice, 'accountActive', actor);
  } else if (activation.requiresAdmin && !wasPaid) {
    addActivity(data, 'invoice', `Pembayaran ${invoice.customerName || invoice.username || invoice.invoiceNo} tercatat, aktivasi pelanggan terminated menunggu validasi admin`, {
      action: 'terminated-payment-awaiting-admin',
      invoiceId: invoice.id,
      customerId: activation.customer?.id || invoice.customerId || '',
      source: activation.source || 'manual'
    });
  }
  const transaction = upsertPaidBillingPaymentGatewayTransaction(data, paid || invoice, {
    ...payment,
    amount: amount || gatewayBreakdown.totalAmount,
    baseAmount: gatewayBreakdown.baseAmount,
    fee: payment.fee || gatewayBreakdown.adminFee,
    adminFee: gatewayBreakdown.adminFee
  }, actor);
  return { invoice: paid || invoice, status: 'paid', transaction, activatedUser, reused: wasPaid || Boolean(existingPayment) };
}

function fulfillPaymentGatewayCallback(data = {}, payload = {}, actor = {}) {
  const merchantReference = paymentGatewayPayloadMerchantReference(payload);
  if (!merchantReference) throw new Error('Reference callback payment gateway kosong');
  const status = normalizePaymentStatus(payload.status || payload.payment_status || payload.transaction_status || payload.paymentStatus || 'paid');
  const provider = data.settings?.paymentGateway?.provider || 'tripay';
  const externalReference = paymentGatewayPayloadExternalReference(payload);
  const payment = {
    status,
    provider,
    method: paymentGatewayPayloadMethod(payload, 'Payment Gateway'),
    amount: paymentGatewayPayloadAmount(payload),
    fee: paymentGatewayPayloadFee(payload),
    paidAt: paymentGatewayPayloadPaidAt(payload),
    externalId: externalReference || merchantReference,
    merchantReference
  };
  const voucherOrder = findHotspotVoucherOrder(data, merchantReference);
  if (voucherOrder) {
    const expectedAmount = Number(voucherOrder.gatewayAmount || voucherOrder.totalAmount || voucherOrder.amount || 0);
    if (payment.amount > 0 && payment.amount < expectedAmount) {
      throw new Error('Nominal pembayaran lebih kecil dari order');
    }
    const fulfilled = fulfillHotspotVoucherOrder(data, voucherOrder.id, {
      status,
      paidAt: payment.paidAt,
      externalId: payment.externalId
    }, actor);
    return {
      type: 'hotspot-voucher',
      reference: fulfilled.order.reference,
      status: fulfilled.order.status,
      order: fulfilled.order,
      vouchers: fulfilled.vouchers,
      reused: fulfilled.reused
    };
  }
  const billing = fulfillBillingInvoicePaymentGateway(data, merchantReference, payment, actor);
  return {
    type: 'monthly-package',
    reference: displayBillingInvoiceNo(billing.invoice.externalId || billing.invoice.invoiceNo || billing.invoice.id),
    status: billing.status,
    invoice: billing.invoice,
    transaction: billing.transaction,
    reused: billing.reused
  };
}

function publicPaymentGatewayInvoicePayload(data = {}, invoice = {}) {
  const customer = customerForInvoice(data, invoice);
  const radiusUser = radiusUserForInvoice(data, invoice, customer);
  const invoiceNo = paymentGatewayInvoiceReference(invoice);
  const breakdown = paymentGatewayAmountBreakdown(data.settings || {}, invoice.amount || 0, 'monthly');
  const periodText = periodDisplayText(invoiceCoverageText(invoice) || invoice.period || '');
  const customerStatus = strongestCustomerStatus(customer.status, invoice.customerStatus, radiusUser.status);
  const isolationSource = String(radiusUser.isolationSource || customer.isolationSource || invoice.isolationSource || '').trim().toLowerCase();
  const manualIsolation = customerStatus === 'isolated' && ['manual', 'admin', 'operator'].includes(isolationSource);
  return {
    id: invoice.id || '',
    invoiceNo,
    reference: invoiceNo,
    status: invoiceRuntimeStatus(invoice),
    customerStatus,
    isIsolated: customerStatus === 'isolated',
    isolationMode: manualIsolation ? 'manual' : (customerStatus === 'isolated' ? (isolationSource || 'billing') : ''),
    manualIsolation,
    canPay: !manualIsolation,
    isolationSource,
    isolationReason: radiusUser.isolationReason || customer.isolationReason || invoice.isolationReason || '',
    isolatedByName: radiusUser.isolatedByName || customer.isolatedByName || '',
    customerName: customer.name || invoice.customerName || invoice.username || '',
    username: customer.username || invoice.username || '',
    phone: normalizeLocalPhone(customer.phone || customer.whatsapp || ''),
    packageName: invoice.packageName || customer.packageName || '',
    period: periodText,
    periodRaw: invoiceCoverageText(invoice) || invoice.period || '',
    dueDate: dateDisplayText(invoice.dueDate || ''),
    dueDateRaw: invoice.dueDate || '',
    amount: breakdown.baseAmount,
    amountText: formatCurrencyText(breakdown.baseAmount),
    adminFee: breakdown.adminFee,
    adminFeeText: formatCurrencyText(breakdown.adminFee),
    gatewayAmount: breakdown.totalAmount,
    gatewayAmountText: formatCurrencyText(breakdown.totalAmount),
    paymentMethod: 'Semua metode tersedia',
    paymentProvider: data.settings?.paymentGateway?.provider || 'tripay',
    paymentGatewayLink: invoicePaymentGatewayLink(data, invoice)
  };
}

function tripayApiBase(settings = {}) {
  return String(settings.mode || '').toLowerCase() === 'production'
    ? 'https://tripay.co.id/api'
    : 'https://tripay.co.id/api-sandbox';
}

function paymentGatewayReturnUrl(data = {}, fallbackPath = '/') {
  const origin = paymentGatewayOrigin(data.settings || {});
  if (!origin) return '';
  return `${origin}${fallbackPath.startsWith('/') ? fallbackPath : `/${fallbackPath}`}`;
}

function tripayChannelPayload(channel = {}, amount = 0) {
  const minimumAmount = Number(channel.minimum_amount || channel.min_amount || channel.minimumAmount || 0) || 0;
  const maximumAmount = Number(channel.maximum_amount || channel.max_amount || channel.maximumAmount || 0) || 0;
  return {
    code: String(channel.code || '').trim().toUpperCase(),
    name: String(channel.name || channel.title || channel.code || '').trim(),
    group: String(channel.group || '').trim(),
    type: String(channel.type || '').trim(),
    iconUrl: String(channel.icon_url || channel.iconUrl || '').trim(),
    active: channel.active !== false,
    minimumAmount,
    maximumAmount,
    available: !amount
      || ((!minimumAmount || amount >= minimumAmount) && (!maximumAmount || amount <= maximumAmount)),
    feeMerchant: channel.fee_merchant || channel.feeMerchant || {},
    feeCustomer: channel.fee_customer || channel.feeCustomer || {},
    totalFee: channel.total_fee || channel.totalFee || {}
  };
}

function isTripayQrisChannel(channel = {}) {
  const code = String(channel.code || '').trim().toUpperCase();
  const name = String(channel.name || '').trim().toLowerCase();
  const group = String(channel.group || '').trim().toLowerCase();
  return code === 'QRIS' || code === 'QRIS2' || name.includes('qris') || group.includes('qris');
}

function firstTripayQrisChannel(channels = []) {
  return (Array.isArray(channels) ? channels : []).find(isTripayQrisChannel) || null;
}

async function tripayPaymentChannels(data = {}, options = {}) {
  const settings = data.settings?.paymentGateway || {};
  const tripay = settings.tripay || {};
  const apiKey = String(tripay.apiKey || '').trim();
  if (!apiKey) throw new Error('API Key Tripay belum lengkap');
  const amount = Math.max(0, Math.round(Number(options.amount || 0) || 0));
  const response = await fetch(`${tripayApiBase(settings)}/merchant/payment-channel`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  });
  const bodyText = await response.text();
  let body = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { message: bodyText };
  }
  if (!response.ok || body.success === false) {
    throw new Error(body.message || body.error || `Tripay channel HTTP ${response.status}`);
  }
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows
    .map((channel) => tripayChannelPayload(channel, amount))
    .filter((channel) => channel.code && channel.active && channel.available);
}

async function paymentGatewayChannels(data = {}, options = {}) {
  const settings = data.settings?.paymentGateway || {};
  if (settings.enabled !== true) throw new Error('Payment Gateway belum aktif');
  const provider = String(settings.provider || 'tripay').trim().toLowerCase();
  if (provider === 'tripay') {
    const channels = await tripayPaymentChannels(data, options);
    const kind = String(options.kind || '').trim().toLowerCase();
    if (kind.includes('voucher')) {
      const qris = firstTripayQrisChannel(channels);
      return qris ? [qris] : [];
    }
    return channels;
  }
  return [];
}

async function createTripayCheckout(data = {}, params = {}) {
  const settings = data.settings?.paymentGateway || {};
  const tripay = settings.tripay || {};
  const merchantCode = String(tripay.merchantCode || '').trim();
  const apiKey = String(tripay.apiKey || '').trim();
  const privateKey = String(tripay.privateKey || '').trim();
  if (!merchantCode || !apiKey || !privateKey) {
    throw new Error('Credential Tripay belum lengkap');
  }
  const merchantRef = String(params.reference || '').trim();
  const amount = Math.max(0, Math.round(Number(params.amount || 0) || 0));
  if (!merchantRef || amount <= 0) {
    throw new Error('Reference dan nominal payment gateway wajib tersedia');
  }
  const kind = String(params.kind || '').trim().toLowerCase();
  let method = '';
  if (kind.includes('voucher')) {
    const channels = await tripayPaymentChannels(data, { amount, kind });
    method = firstTripayQrisChannel(channels)?.code || '';
    if (!method) throw new Error('Channel QRIS Tripay untuk voucher belum aktif');
  } else {
    method = String(params.method || settings.monthlyPaymentMethod || '').trim().toUpperCase();
  }
  if (!method || ['ALL', 'SEMUA'].includes(method)) {
    throw new Error('Metode pembayaran wajib dipilih');
  }
  const signature = crypto.createHmac('sha256', privateKey)
    .update(`${merchantCode}${merchantRef}${amount}`)
    .digest('hex');
  const payload = {
    merchant_ref: merchantRef,
    amount,
    customer_name: String(params.customerName || 'Pelanggan').trim() || 'Pelanggan',
    customer_email: String(params.customerEmail || '').trim() || 'customer@example.com',
    customer_phone: normalizeWaPhone(params.customerPhone || ''),
    order_items: [{
      sku: merchantRef,
      name: String(params.itemName || params.description || merchantRef).trim() || merchantRef,
      price: amount,
      quantity: 1
    }],
    return_url: params.returnUrl || paymentGatewayReturnUrl(data, '/'),
    expired_time: Math.floor(Date.now() / 1000) + (Math.max(5, Number(settings.checkoutTtlMinutes || 60) || 60) * 60),
    signature
  };
  payload.method = method;
  const response = await fetch(`${tripayApiBase(settings)}/transaction/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const bodyText = await response.text();
  let body = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { message: bodyText };
  }
  if (!response.ok || body.success === false) {
    throw new Error(body.message || body.error || `Tripay HTTP ${response.status}`);
  }
  const trx = body.data && typeof body.data === 'object' ? body.data : body;
  return {
    ok: true,
    provider: 'tripay',
    method: method || 'Semua metode tersedia',
    reference: merchantRef,
    externalReference: trx.reference || '',
    amount,
    checkoutUrl: trx.checkout_url || trx.payment_url || trx.paymentUrl || '',
    paymentUrl: trx.checkout_url || trx.payment_url || trx.paymentUrl || '',
    qrUrl: trx.qr_url || trx.qrUrl || '',
    qrString: trx.qr_string || trx.qrString || '',
    expiredAt: trx.expired_time || trx.expiredAt || ''
  };
}

async function createPaymentGatewayCheckout(data = {}, params = {}) {
  const settings = data.settings?.paymentGateway || {};
  if (settings.enabled !== true) throw new Error('Payment Gateway belum aktif');
  const provider = String(settings.provider || 'tripay').trim().toLowerCase();
  if (provider === 'tripay') {
    return createTripayCheckout(data, params);
  }
  throw new Error(`Provider ${provider} belum mendukung checkout otomatis`);
}

async function handlePaymentGatewayWebhook(req, res, url) {
  const method = req.method || 'GET';
  if (method === 'GET') {
    const data = await loadStore();
    sendJson(res, 200, {
      ok: true,
      success: true,
      endpoint: 'payment-gateway-webhook',
      provider: data.settings?.paymentGateway?.provider || 'tripay',
      callbackUrl: data.settings?.paymentGateway?.callbackUrl || '',
      method: 'POST'
    });
    return;
  }
  if (method !== 'POST') {
    sendJson(res, 405, {
      ok: false,
      success: false,
      error: 'Webhook payment gateway hanya menerima POST'
    });
    return;
  }

  const { payload: rawPayload, raw } = await readBodyWithRaw(req);
  const payload = paymentGatewayCallbackPayload(rawPayload);
  const actor = { username: 'payment-gateway', name: 'Payment Gateway' };
  try {
    const { result } = await mutate(async (store) => {
      verifyPaymentGatewayCallback(req, payload, store.settings?.paymentGateway || {}, raw);
      const fulfilled = fulfillPaymentGatewayCallback(store, payload, actor);
      addActivity(store, 'monitoring', `Callback payment gateway ${fulfilled.reference}: ${fulfilled.status}`, {
        action: 'payment-gateway-callback',
        provider: store.settings?.paymentGateway?.provider || 'tripay',
        type: fulfilled.type,
        reference: fulfilled.reference,
        status: fulfilled.status,
        path: url.pathname
      });
      if (fulfilled.type === 'hotspot-voucher' && fulfilled.status === 'paid') {
        await syncFreeradiusIfNeeded(store, actor, 'hotspot-voucher-online-paid');
      }
      if (fulfilled.type === 'monthly-package' && fulfilled.status === 'paid' && fulfilled.activatedUser) {
        await syncFreeradiusIfNeeded(store, actor, 'payment-gateway-billing-paid');
      }
      return fulfilled;
    });
    sendJson(res, 200, {
      ok: true,
      success: true,
      type: result.type,
      reference: result.reference,
      status: result.status,
      voucherCount: Array.isArray(result.vouchers) ? result.vouchers.length : 0
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      success: false,
      error: error.message || 'Callback QRIS gagal diproses'
    });
  }
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      app: 'fakenet-billing',
      storage: STORAGE_MODE,
      cache: CACHE_MODE,
      redis: redisStatus(),
      storePath: STORE_PATH
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/license/status') {
    const data = await loadStore();
    sendJson(res, 200, {
      ok: true,
      license: licenseStatusForStore(data),
      system: publicSystemInfo()
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/license/activate') {
    const payload = await readBody(req);
    const key = String(payload.licenseKey || payload.key || '').trim();
    const validation = license.validateLicenseKey(key);
    if (!validation.ok) {
      sendJson(res, 400, { ok: false, error: validation.error || 'License key tidak valid', license: validation });
      return;
    }
    const { data } = await mutate((store) => {
      store.settings = store.settings || {};
      store.settings.license = {
        key,
        licenseId: validation.payload.licenseId || '',
        licensedTo: validation.payload.licensedTo || '',
        edition: validation.payload.edition || '',
        issuedAt: validation.payload.issuedAt || '',
        expiresAt: validation.payload.expiresAt || '',
        machineCode: validation.machineCode || '',
        activatedAt: new Date().toISOString()
      };
      addActivity(store, 'settings', `Aplikasi diaktivasi untuk ${validation.payload.licensedTo || validation.payload.licenseId || 'pelanggan'}`, {
        action: 'license-activate',
        licenseId: validation.payload.licenseId || '',
        machineCode: validation.machineCode || ''
      });
    });
    sendJson(res, 200, { ok: true, license: licenseStatusForStore(data) });
    return;
  }

  if (!['/api/branding', '/api/license/status', '/api/license/activate'].includes(pathname)) {
    const data = await loadStore();
    if (licenseBlocksAccess(data)) {
      sendJson(res, 423, {
        ok: false,
        error: 'Aplikasi belum diaktivasi',
        license: licenseStatusForStore(data)
      });
      return;
    }
  }

  if (isPaymentGatewayWebhookPath(pathname)) {
    await handlePaymentGatewayWebhook(req, res, url);
    return;
  }

  if (method === 'GET' && pathname === '/api/public/hotspot-voucher-online') {
    const data = await loadStore();
    sendJson(res, 200, publicHotspotVoucherStorefrontPayload(data));
    return;
  }

  if (method === 'POST' && pathname === '/api/public/hotspot-voucher-orders') {
    const payload = await readBody(req);
    try {
      const { data, result } = await mutate((store) => {
        const order = createHotspotVoucherOrder(store, payload);
        addActivity(store, 'monitoring', `Order voucher online ${order.reference} dibuat`, {
          action: 'hotspot-voucher-online-order',
          reference: order.reference,
          amount: order.amount
        });
        return { order };
      });
      const order = result.order;
      sendJson(res, 201, {
        ok: true,
        order: {
          id: order.id,
          reference: order.reference,
          status: order.status,
          packageLabel: order.packageLabel,
          quantity: order.quantity,
          amount: order.amount,
          amountText: formatCurrencyText(order.amount),
          adminFee: Number(order.adminFee || 0),
          adminFeeText: formatCurrencyText(order.adminFee || 0),
          gatewayAmount: Number(order.gatewayAmount || order.totalAmount || order.amount || 0),
          gatewayAmountText: formatCurrencyText(order.gatewayAmount || order.totalAmount || order.amount || 0),
          buyerName: order.buyerName,
          whatsapp: order.whatsapp,
          paymentMethod: 'QRIS',
          paymentProvider: order.paymentProvider,
          paymentReference: order.paymentReference || order.reference,
          createdAt: order.createdAt
        },
        payment: {
          method: 'QRIS',
          provider: order.paymentProvider,
          reference: order.paymentReference || order.reference,
          amount: order.amount,
          amountText: formatCurrencyText(order.amount),
          adminFee: Number(order.adminFee || 0),
          adminFeeText: formatCurrencyText(order.adminFee || 0),
          gatewayAmount: Number(order.gatewayAmount || order.totalAmount || order.amount || 0),
          gatewayAmountText: formatCurrencyText(order.gatewayAmount || order.totalAmount || order.amount || 0),
          message: 'Selesaikan pembayaran QRIS melalui payment gateway. Voucher otomatis dibuat setelah status paid.'
        },
        storefront: publicHotspotVoucherStorefrontPayload(data)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Order voucher gagal dibuat'
      });
    }
    return;
  }

  const publicVoucherOrderMatch = pathname.match(/^\/api\/public\/hotspot-voucher-orders\/([^/]+)$/);
  if (method === 'GET' && publicVoucherOrderMatch) {
    const data = await loadStore();
    const order = findHotspotVoucherOrder(data, decodeURIComponent(publicVoucherOrderMatch[1]));
    if (!order) {
      sendJson(res, 404, { ok: false, error: 'Order voucher tidak ditemukan' });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      order: {
        id: order.id,
        reference: order.reference,
        status: order.status,
        buyerName: order.buyerName,
        whatsapp: order.whatsapp,
        packageLabel: order.packageLabel,
        profileName: order.profileName,
        quantity: order.quantity,
        unitPrice: order.unitPrice,
        amount: order.amount,
        amountText: formatCurrencyText(order.amount),
        adminFee: Number(order.adminFee || 0),
        adminFeeText: formatCurrencyText(order.adminFee || 0),
        gatewayAmount: Number(order.gatewayAmount || order.totalAmount || order.amount || 0),
        gatewayAmountText: formatCurrencyText(order.gatewayAmount || order.totalAmount || order.amount || 0),
        paymentMethod: 'QRIS',
        paymentProvider: order.paymentProvider,
        paymentReference: order.paymentReference || order.reference,
        createdAt: order.createdAt,
        paidAt: order.paidAt || '',
        vouchers: order.status === 'paid' ? (order.vouchers || []) : []
      }
    });
    return;
  }

  const publicVoucherCheckoutMatch = pathname.match(/^\/api\/public\/hotspot-voucher-orders\/([^/]+)\/checkout$/);
  if (method === 'POST' && publicVoucherCheckoutMatch) {
    const data = await loadStore();
    const order = findHotspotVoucherOrder(data, decodeURIComponent(publicVoucherCheckoutMatch[1]));
    if (!order) {
      sendJson(res, 404, { ok: false, error: 'Order voucher tidak ditemukan' });
      return;
    }
    if (String(order.status || '').toLowerCase() === 'paid') {
      sendJson(res, 200, { ok: true, paid: true, order });
      return;
    }
    try {
      const checkout = await createPaymentGatewayCheckout(data, {
        kind: 'hotspot-voucher',
        reference: order.reference,
        method: 'QRIS',
        amount: Number(order.gatewayAmount || order.totalAmount || order.amount || 0),
        customerName: order.buyerName || 'Pembeli Voucher',
        customerPhone: order.whatsapp || '',
        itemName: `Voucher Hotspot ${order.packageLabel || order.profileName || ''}`.trim(),
        returnUrl: paymentGatewayReturnUrl(data, `/status-order.html?id=${encodeURIComponent(order.reference || order.id || '')}`)
      });
      sendJson(res, 200, {
        ok: true,
        order: {
          reference: order.reference,
          status: order.status,
          amount: Number(order.amount || 0),
          adminFee: Number(order.adminFee || 0),
          gatewayAmount: Number(order.gatewayAmount || order.totalAmount || order.amount || 0)
        },
        checkout
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Checkout payment gateway voucher gagal'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/public/payment-gateway/channels') {
    const data = await loadStore();
    const amount = decimalNumber(url.searchParams.get('amount') || 0);
    const kind = String(url.searchParams.get('kind') || 'monthly-package').trim();
    try {
      const channels = await paymentGatewayChannels(data, { amount, kind });
      sendJson(res, 200, {
        ok: true,
        provider: data.settings?.paymentGateway?.provider || 'tripay',
        channels
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Channel payment gateway gagal dibaca',
        channels: []
      });
    }
    return;
  }

  const publicGatewayInvoiceMatch = pathname.match(/^\/api\/public\/payment-gateway\/invoices\/([^/]+)$/);
  if (method === 'GET' && publicGatewayInvoiceMatch) {
    const data = await loadStore();
    const invoice = findBillingInvoiceByReference(data, decodeURIComponent(publicGatewayInvoiceMatch[1]));
    if (!invoice) {
      sendJson(res, 404, { ok: false, error: 'Invoice tidak ditemukan' });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      businessName: data.settings?.businessName || data.settings?.receiptBusinessCode || 'ISP Billing',
      appSubtitle: data.settings?.appSubtitle || 'ISP Billing',
      logoUrl: data.settings?.logoUrl || '/fakenet-logo.png',
      paymentGatewayEnabled: data.settings?.paymentGateway?.enabled === true,
      invoice: publicPaymentGatewayInvoicePayload(data, invoice)
    });
    return;
  }

  const publicGatewayInvoiceCheckoutMatch = pathname.match(/^\/api\/public\/payment-gateway\/invoices\/([^/]+)\/checkout$/);
  if (method === 'POST' && publicGatewayInvoiceCheckoutMatch) {
    const data = await loadStore();
    const invoice = findBillingInvoiceByReference(data, decodeURIComponent(publicGatewayInvoiceCheckoutMatch[1]));
    if (!invoice) {
      sendJson(res, 404, { ok: false, error: 'Invoice tidak ditemukan' });
      return;
    }
    const publicInvoice = publicPaymentGatewayInvoicePayload(data, invoice);
    if (publicInvoice.status === 'paid') {
      sendJson(res, 200, { ok: true, paid: true, invoice: publicInvoice });
      return;
    }
    try {
      const payload = await readBody(req);
      const customer = customerForInvoice(data, invoice);
      const checkout = await createPaymentGatewayCheckout(data, {
        kind: 'monthly-package',
        reference: publicInvoice.reference,
        method: payload.method || payload.paymentMethod || '',
        amount: publicInvoice.gatewayAmount,
        customerName: publicInvoice.customerName || 'Pelanggan',
        customerEmail: customer.email || '',
        customerPhone: publicInvoice.phone || '',
        itemName: `Tagihan ${publicInvoice.packageName || publicInvoice.period || publicInvoice.invoiceNo}`.trim(),
        returnUrl: publicInvoice.paymentGatewayLink
      });
      sendJson(res, 200, {
        ok: true,
        invoice: publicInvoice,
        checkout
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Checkout payment gateway invoice gagal'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/public/wifiku/settings') {
    const data = await loadStore();
    const settings = wifiKuSettings(data);
    sendJson(res, 200, {
      ok: true,
      settings: {
        enabled: settings.enabled,
        requireOtp: settings.requireOtp,
        publicPath: settings.publicPath,
        otpTtlMinutes: settings.otpTtlMinutes,
        businessName: data.settings?.businessName || 'WifiKu',
        logoUrl: sanitizeLogoUrl(data.settings?.logoUrl || '/fakenet-logo.png')
      }
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/public/wa-admin-contact') {
    const data = await loadStore();
    const settings = {
      ...(data.settings?.waGateway || {}),
      provider: 'waha'
    };
    try {
      const status = await wahaSessionStatusWithProfile(settings, { timeoutMs: 3500 });
      const waPhone = wahaLinkedPhoneFromStatus(status);
      sendJson(res, 200, {
        ok: true,
        available: Boolean(waPhone),
        online: wahaIsConnected(status),
        name: wahaLinkedNameFromStatus(status) || data.settings?.businessName || 'Admin',
        phone: normalizeLocalPhone(waPhone),
        waPhone,
        link: waPhone ? `https://wa.me/${waPhone}` : '',
        status: wahaStatusText(status)
      });
    } catch (error) {
      sendJson(res, 200, {
        ok: true,
        available: false,
        online: false,
        name: data.settings?.businessName || 'Admin',
        phone: '',
        waPhone: '',
        link: '',
        status: 'Offline',
        error: error.message || 'Nomor WAHA belum terbaca'
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/public/wifiku/request-otp') {
    const payload = await readBody(req);
    const data = await loadStore();
    const settings = wifiKuSettings(data);
    if (!settings.enabled) {
      forbidden(res);
      return;
    }
    const phone = normalizeIndonesianPhone(payload.phone);
    const customer = findCustomerByPhone(data, phone);
    if (!customer) {
      sendJson(res, 404, { ok: false, error: 'Nomor WhatsApp belum terdaftar sebagai pelanggan' });
      return;
    }
    if (!settings.requireOtp) {
      const token = createWifiKuSession(data, customer);
      sendJson(res, 200, {
        ok: true,
        requireOtp: false,
        token,
        portal: await wifiKuPortalPayload(data, customer, payload.period || currentPeriod())
      });
      return;
    }
    const waSettings = data.settings?.waGateway || {};
    if (waSettings.enabled !== true) {
      sendJson(res, 400, { ok: false, error: 'Whatsapp Gateway belum aktif untuk mengirim OTP' });
      return;
    }
    cleanupWifiKuAuth();
    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const id = createId('wifiku_otp');
    wifiKuOtpChallenges.set(id, {
      phone,
      customerId: customer.id,
      otp,
      attempts: 0,
      expiresAt: Date.now() + settings.otpTtlMinutes * 60 * 1000
    });
    queueWaGatewayMessage(data, {
      phone,
      recipientName: customer.name || customer.username || 'Pelanggan',
      subject: 'WifiKu OTP',
      text: `Kode OTP WifiKu anda: *${otp}*\nBerlaku ${settings.otpTtlMinutes} menit.\n\nJangan bagikan kode ini kepada siapa pun.`,
      status: 'queued',
      type: 'wifiku-otp',
      actorName: 'WifiKu'
    });
    await saveStore(data);
    sendJson(res, 200, {
      ok: true,
      requireOtp: true,
      challengeId: id,
      expiresInSeconds: settings.otpTtlMinutes * 60
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/public/wifiku/login') {
    const payload = await readBody(req);
    const data = await loadStore();
    const settings = wifiKuSettings(data);
    if (!settings.enabled) {
      forbidden(res);
      return;
    }
    const phone = normalizeIndonesianPhone(payload.phone);
    const customer = findCustomerByPhone(data, phone);
    if (!customer) {
      sendJson(res, 404, { ok: false, error: 'Nomor WhatsApp belum terdaftar sebagai pelanggan' });
      return;
    }
    if (settings.requireOtp) {
      cleanupWifiKuAuth();
      const challenge = wifiKuOtpChallenges.get(String(payload.challengeId || ''));
      if (!challenge || challenge.customerId !== customer.id || challenge.phone !== phone) {
        sendJson(res, 400, { ok: false, error: 'OTP tidak valid atau sudah kedaluwarsa' });
        return;
      }
      challenge.attempts += 1;
      if (challenge.attempts > WIFIKU_OTP_MAX_ATTEMPTS) {
        wifiKuOtpChallenges.delete(String(payload.challengeId || ''));
        sendJson(res, 400, { ok: false, error: 'OTP terlalu banyak dicoba, minta kode baru' });
        return;
      }
      if (String(payload.otp || '').trim() !== challenge.otp) {
        sendJson(res, 400, { ok: false, error: 'Kode OTP salah' });
        return;
      }
      wifiKuOtpChallenges.delete(String(payload.challengeId || ''));
    }
    const token = createWifiKuSession(data, customer);
    sendJson(res, 200, {
      ok: true,
      token,
      portal: await wifiKuPortalPayload(data, customer, payload.period || currentPeriod())
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/public/wifiku/me') {
    const authContext = await requireWifiKuSession(req, res);
    if (!authContext) return;
    sendJson(res, 200, await wifiKuPortalPayload(authContext.data, authContext.customer, url.searchParams.get('period') || currentPeriod()));
    return;
  }

  if (method === 'POST' && pathname === '/api/public/wifiku/reboot') {
    const authContext = await requireWifiKuSession(req, res);
    if (!authContext) return;
    const portal = await wifiKuPortalPayload(authContext.data, authContext.customer, currentPeriod());
    if (!portal.device?.id) {
      sendJson(res, 404, { ok: false, error: 'Perangkat GenieACS pelanggan belum ditemukan' });
      return;
    }
    try {
      await genieAcs.reboot(authContext.data.settings || {}, portal.device.id);
      sendJson(res, 200, { ok: true, message: 'Perintah reboot dikirim ke perangkat' });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || 'Reboot perangkat gagal' });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/public/wifiku/wifi-password') {
    const authContext = await requireWifiKuSession(req, res);
    if (!authContext) return;
    const payload = await readBody(req);
    const portal = await wifiKuPortalPayload(authContext.data, authContext.customer, currentPeriod());
    if (!portal.device?.id) {
      sendJson(res, 404, { ok: false, error: 'Perangkat GenieACS pelanggan belum ditemukan' });
      return;
    }
    try {
      await genieAcs.setWifiPassword(authContext.data.settings || {}, portal.device.id, payload.password);
      sendJson(res, 200, { ok: true, message: 'Perintah ganti password WiFi dikirim' });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || 'Ganti password WiFi gagal' });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/public/wifiku/wifi-ssid') {
    const authContext = await requireWifiKuSession(req, res);
    if (!authContext) return;
    const payload = await readBody(req);
    const portal = await wifiKuPortalPayload(authContext.data, authContext.customer, currentPeriod());
    if (!portal.device?.id) {
      sendJson(res, 404, { ok: false, error: 'Perangkat GenieACS pelanggan belum ditemukan' });
      return;
    }
    try {
      await genieAcs.setWifiSsid(authContext.data.settings || {}, portal.device.id, payload.ssid, payload.band || '2.4g');
      sendJson(res, 200, { ok: true, message: 'Perintah ganti nama WiFi dikirim' });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || 'Ganti nama WiFi gagal' });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/public/payment-gateway/qris/callback') {
    const payload = await readBody(req);
    const actor = { username: 'payment-gateway', name: 'Payment Gateway' };
    try {
      const { result } = await mutate(async (store) => {
        verifyPaymentGatewayCallback(req, payload, store.settings?.paymentGateway || {});
        const reference = payload.reference || payload.merchant_ref || payload.external_id || payload.externalId || payload.invoiceNo || payload.order_id || payload.orderId;
        const order = findHotspotVoucherOrder(store, reference);
        if (!order) throw new Error('Order voucher tidak ditemukan');
        const amount = Math.round(Number(payload.amount || payload.total_amount || payload.gross_amount || 0) || 0);
        if (amount > 0 && amount < Number(order.amount || 0)) throw new Error('Nominal pembayaran lebih kecil dari order');
        const fulfilled = fulfillHotspotVoucherOrder(store, order.id, {
          status: payload.status || payload.payment_status || payload.transaction_status || 'paid',
          paidAt: payload.paidAt || payload.paid_at || payload.settlement_time || new Date().toISOString(),
          externalId: payload.transactionId || payload.transaction_id || payload.id || ''
        }, actor);
        addActivity(store, 'monitoring', `Callback QRIS voucher ${order.reference}: ${fulfilled.order.status}`, {
          action: 'hotspot-voucher-online-callback',
          reference: order.reference,
          status: fulfilled.order.status
        });
        if (fulfilled.order.status === 'paid') {
          await syncFreeradiusIfNeeded(store, actor, 'hotspot-voucher-online-paid');
        }
        return fulfilled;
      });
      sendJson(res, 200, {
        ok: true,
        reference: result.order.reference,
        status: result.order.status,
        voucherCount: result.vouchers.length
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Callback QRIS gagal diproses'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/branding') {
    const data = await loadStore();
    sendJson(res, 200, { branding: publicBranding(data.settings) });
    return;
  }

  if (method === 'GET' && pathname === '/api/auth/verification-code') {
    const data = await loadStore();
    if (!loginVerificationEnabled(data.settings || {})) {
      sendJson(res, 200, {
        ok: true,
        enabled: false,
        verification: null
      });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      enabled: true,
      verification: createLoginVerificationChallenge()
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const payload = await readBody(req);
    const settingsData = await loadStore();
    if (loginVerificationEnabled(settingsData.settings || {})) {
      const verification = verifyLoginVerificationChallenge(payload.verificationId, payload.verificationCode);
      if (!verification.ok) {
        sendJson(res, 400, { error: verification.error || 'Kode verifikasi salah' });
        return;
      }
    }
    const { data, result } = await mutate((data) => {
      auth.ensureDefaultUsers(data);
      const user = auth.findUserByUsername(data, payload.username);
      if (!user || user.active === false || !auth.verifyPassword(payload.password, user.passwordHash)) {
        return null;
      }
      user.lastLoginAt = new Date().toISOString();
      user.updatedAt = user.updatedAt || user.lastLoginAt;
      return auth.publicUser(user);
    });

    if (!result) {
      sendJson(res, 401, { error: 'Username atau password salah' });
      return;
    }

    const sessionId = auth.createSession(result);
    sendJson(res, 200, {
      user: result,
      roles: auth.publicRoles(),
      settings: publicAppSettings(data.settings),
      branding: publicBranding(data.settings)
    }, {
      'Set-Cookie': auth.sessionCookie(sessionId)
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/auth/me') {
    const data = await loadStore();
    const user = auth.requestUser(req, data);
    if (!user) {
      unauthorized(res);
      return;
    }
    sendJson(res, 200, {
      user,
      roles: auth.publicRoles(),
      settings: publicAppSettings(data.settings),
      branding: publicBranding(data.settings)
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/tools/qr') {
    const authContext = await requirePermission(req, res, 'radius:read');
    if (!authContext) return;
    const text = qrTextParam(url.searchParams.get('text') || '');
    if (!text) {
      badRequest(res, 'Data QR kosong');
      return;
    }
    const width = Math.min(384, Math.max(96, Number.parseInt(url.searchParams.get('size') || '160', 10) || 160));
    const svg = await QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width,
      color: {
        dark: '#07111f',
        light: '#ffffff'
      }
    });
    sendBinary(res, 200, svg, 'image/svg+xml; charset=utf-8');
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    auth.destroySession(auth.getSessionId(req));
    sendJson(res, 200, { ok: true }, {
      'Set-Cookie': auth.clearSessionCookie()
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/notifications') {
    const data = await loadStore();
    const user = auth.requestUser(req, data);
    if (!user) {
      unauthorized(res);
      return;
    }
    const notifications = await notificationSummary(data, user);
    sendJson(res, 200, { notifications });
    return;
  }

  if (method === 'GET' && pathname === '/api/dashboard') {
    const authContext = await requirePermission(req, res, 'dashboard:read');
    if (!authContext) return;
    let data = authContext.data;
    const period = url.searchParams.get('period') || currentPeriod();
    const refreshRadboox = !standaloneMode(data) && truthyQuery(url.searchParams.get('refreshRadboox'));
    const radbooxSync = {
      attempted: refreshRadboox,
      ok: false,
      error: ''
    };

    if (refreshRadboox) {
      const radbooxInfo = radboox.status(data.settings);
      if (!auth.hasPermission(authContext.user, 'radboox:sync')) {
        radbooxSync.error = 'Role user tidak memiliki akses sinkron Radboox.';
      } else if (!radbooxInfo.credentialReady) {
        radbooxSync.error = 'Kredensial Radboox belum tersedia. Isi token atau username/password saat sinkron.';
      } else {
        try {
          const earning = await radboox.syncMonthlyEarning(data.settings, { period });
          const mutation = await mutate((store) => upsertMonthlyEarning(store, earning.earning));
          data = mutation.data;
          radbooxSync.ok = true;
          radbooxSync.mode = earning.mode;
          radbooxSync.period = earning.period;
          if (mutation.result && mutation.result.syncWarning) {
            radbooxSync.warning = mutation.result.syncWarning;
          }
        } catch (error) {
          radbooxSync.error = error.message || 'Sinkron Radboox gagal';
        }
      }
    }

    const summary = summarize(standaloneMode(data) ? dataWithResolvedCustomerStatuses(data) : data, period);
    summary.monthlyTransactionCount = dashboardMonthlyTransactionCount(data, period);
    summary.billingSummary = dashboardBillingSummary(data, period);
    const members = await dashboardCustomerSummary(data, { force: refreshRadboox, period });
    const response = {
      summary: await publicDashboardSummary(summary, data, authContext.user, period),
      canViewFinance: dashboardFinanceAllowed(authContext.user),
      members,
      radiusSummary: await dashboardRadiusSummary(data, period),
      settings: publicAppSettings(data.settings)
    };
    if (!standaloneMode(data)) {
      response.radboox = radbooxStatusResponse(data);
      response.radbooxSync = {
        ...radbooxSync,
        ...radbooxFreshness(summary.lastRadbooxEarning)
      };
    }
    sendJson(res, 200, response);
    return;
  }

  if (method === 'GET' && pathname === '/api/dashboard/router-nas') {
    const authContext = await requirePermission(req, res, 'dashboard:read');
    if (!authContext) return;
    try {
      const payload = await operations.routerDashboardSummary(authContext.data.monitoringTargets || []);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        source: 'mikrotik-snmp',
        routers: [],
        summary: {
          total: 0,
          upCount: 0,
          downCount: 0,
          generatedAt: new Date().toISOString()
        },
        error: error.message || 'Monitoring router NAS belum tersedia'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/activity') {
    const authContext = await requirePermission(req, res, 'dashboard:read');
    if (!authContext) return;
    const data = authContext.data;
    const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
    const type = String(url.searchParams.get('type') || 'all').trim().toLowerCase();
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    let activity = Array.isArray(data.activity) ? [...data.activity] : [];
    if (type !== 'all') {
      activity = activity.filter((item) => String(item.type || '').toLowerCase() === type);
    }
    activity = filterSearch(activity, search, ['type', 'message']);
    activity = sortByDateDesc(activity, 'at');
    const total = activity.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(page, totalPages);
    const currentOffset = (currentPage - 1) * limit;
    sendJson(res, 200, {
      activity: activity.slice(currentOffset, currentOffset + limit),
      pagination: {
        page: currentPage,
        limit,
        total,
        totalPages,
        hasPrev: currentPage > 1,
        hasNext: currentPage < totalPages
      }
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/reports/daily') {
    const wantsRefresh = truthyQuery(url.searchParams.get('refreshRadboox'));
    const authContext = await requirePermission(req, res, 'reports:daily:read');
    if (!authContext) return;
    let data = authContext.data;
    const refreshRadboox = !standaloneMode(data) && wantsRefresh;
    const date = normalizeDateParam(url.searchParams.get('date'));
    const sites = activeReportSites(data);
    const radbooxSync = {
      attempted: wantsRefresh,
      ok: false,
      error: wantsRefresh && !refreshRadboox ? 'Mode standalone memakai data transaksi lokal.' : ''
    };

    if (standaloneMode(data)) {
      const collectorReport = userIsCollector(authContext.user);
      const report = dailyReportResponse(localDailyReport(data, date, {
        payments: collectorReport ? collectorReportPayments(data, authContext.user) : undefined,
        includeDueInvoices: !collectorReport
      }));
      sendJson(res, 200, {
        source: 'local',
        date,
        report,
        collector: collectorReport ? { scoped: true, name: authContext.user.name || '', username: authContext.user.username || '' } : null,
        sites: report.sites || sites
      });
      return;
    }

    if (refreshRadboox) {
      const radbooxInfo = radboox.status(data.settings);
      if (!radbooxInfo.credentialReady) {
        radbooxSync.error = 'Kredensial Radboox belum tersedia.';
      } else {
        try {
          const reportResult = await radboox.syncDailyReport(data.settings, { date, sites });
          const mutation = await mutate((store) => upsertRadbooxDailyReport(store, reportResult.report));
          data = mutation.data;
          radbooxSync.ok = true;
          radbooxSync.mode = reportResult.mode;
          radbooxSync.date = reportResult.date;
          radbooxSync.note = mutation.result && mutation.result.note ? mutation.result.note : '';
        } catch (error) {
          radbooxSync.error = error.message || 'Sinkron tagihan harian Radboox gagal';
        }
      }
    }

    const report = dailyReportResponse((data.radbooxDailyReports || []).find((item) => item.date === date) || null);
    sendJson(res, 200, {
      date,
      report,
      sites,
      radboox: radbooxStatusResponse(data),
      radbooxSync
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/reports/statistics') {
    const authContext = await requirePermission(req, res, 'reports:daily:read');
    if (!authContext) return;
    if (userIsCollector(authContext.user)) {
      forbidden(res);
      return;
    }
    const period = normalizePeriod(url.searchParams.get('period') || currentPeriod());
    const payload = await reportStatisticsPayload(authContext.data, period);
    sendJson(res, 200, payload);
    return;
  }

  if (method === 'GET' && pathname === '/api/reports/radboox-transactions') {
    const authContext = await requirePermission(req, res, 'reports:daily:read');
    if (!authContext) return;
    if (userIsCollector(authContext.user)) {
      forbidden(res);
      return;
    }
    if (standaloneMode(authContext.data)) {
      notFound(res);
      return;
    }
    const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 10) || 10));
    const from = normalizeDateParam(url.searchParams.get('from') || url.searchParams.get('start'));
    const to = normalizeDateParam(url.searchParams.get('to') || url.searchParams.get('end') || from);
    const methodFilter = String(url.searchParams.get('method') || 'all').trim();
    const search = String(url.searchParams.get('search') || '').trim();

    try {
      const result = await radboox.listCashierTransactions(authContext.data.settings, {
        page,
        limit,
        from,
        to,
        method: methodFilter,
        search,
        mode: 'web',
        cache: false
      });
      const totalPages = Math.max(1, Math.ceil(Number(result.totalRows || 0) / result.limit));
      sendJson(res, 200, {
        ok: true,
        from: result.from,
        to: result.to,
        method: result.method,
        search: result.search,
        summary: result.summary,
        transactions: result.transactions,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.totalRows,
          totalPages,
          hasPrev: result.page > 1,
          hasNext: result.page < totalPages
        },
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error.message || 'Transaksi Radboox tidak bisa dibaca',
        from,
        to,
        method: methodFilter,
        search,
        summary: {},
        transactions: [],
        pagination: { page: 1, limit, total: 0, totalPages: 1, hasPrev: false, hasNext: false },
        checkedAt: new Date().toISOString()
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/reports/monthly-billing') {
    const authContext = await requirePermission(req, res, 'reports:daily:read');
    if (!authContext) return;
    const data = authContext.data;
    const period = normalizePeriod(url.searchParams.get('period') || currentPeriod());
    const status = String(url.searchParams.get('status') || 'all').trim().toLowerCase();
    const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    const collectorReport = userIsCollector(authContext.user);
    const reportPayments = collectorReportPayments(data, authContext.user);
    const periodPaymentInvoiceIds = new Set(reportPayments
      .filter((payment) => String(payment.paidAt || payment.createdAt || '').slice(0, 7) === period)
      .map((payment) => String(payment.invoiceId || ''))
      .filter(Boolean));
    let invoices = localBillingInvoiceRows(data, period).filter((invoice) => invoice.status !== 'cancelled');
    if (collectorReport) {
      invoices = invoices.filter((invoice) => periodPaymentInvoiceIds.has(String(invoice.invoiceId || invoice.id || '')));
    }
    if (status !== 'all') {
      invoices = invoices.filter((invoice) => invoice.status === status || (status === 'unpaid' && ['unpaid', 'pending'].includes(invoice.status)));
    }
    invoices = filterSearch(invoices, search, ['invoiceNo', 'externalId', 'customerName', 'username', 'phone', 'address', 'packageName', 'item', 'siteName', 'status']);
    invoices.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')) || String(a.customerName || '').localeCompare(String(b.customerName || '')));
    let allPeriodInvoices = localBillingInvoiceRows(data, period).filter((invoice) => invoice.status !== 'cancelled');
    if (collectorReport) {
      allPeriodInvoices = allPeriodInvoices.filter((invoice) => periodPaymentInvoiceIds.has(String(invoice.invoiceId || invoice.id || '')));
    }
    const summary = {
      totalCount: allPeriodInvoices.length,
      totalAmount: allPeriodInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
      paidCount: allPeriodInvoices.filter((invoice) => invoice.status === 'paid').length,
      paidAmount: allPeriodInvoices.filter((invoice) => invoice.status === 'paid').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
      unpaidCount: allPeriodInvoices.filter((invoice) => ['unpaid', 'pending'].includes(invoice.status)).length,
      unpaidAmount: allPeriodInvoices.filter((invoice) => ['unpaid', 'pending'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0),
      overdueCount: allPeriodInvoices.filter((invoice) => invoice.status === 'overdue').length,
      overdueAmount: allPeriodInvoices.filter((invoice) => invoice.status === 'overdue').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
    };
    const pagination = paginationPayload(page, limit, invoices.length);
    const offset = (pagination.page - 1) * limit;
    sendJson(res, 200, {
      ok: true,
      period,
      status,
      search,
      summary,
      collector: collectorReport ? { scoped: true, name: authContext.user.name || '', username: authContext.user.username || '' } : null,
      dailyRows: monthlyBillingDailyRows(data, period, {
        payments: collectorReport ? reportPayments : undefined,
        includeExpenses: !collectorReport
      }),
      invoices: invoices.slice(offset, offset + limit),
      pagination,
      checkedAt: new Date().toISOString()
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/reports/voucher-daily') {
    const authContext = await requirePermission(req, res, 'reports:voucher:read');
    if (!authContext) return;
    const data = authContext.data;
    const date = normalizeDateParam(url.searchParams.get('date') || todayIso());
    const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
    const filters = {
      nas: String(url.searchParams.get('nas') || '').trim(),
      reseller: String(url.searchParams.get('reseller') || '').trim(),
      profile: String(url.searchParams.get('profile') || '').trim(),
      method: String(url.searchParams.get('method') || '').trim()
    };
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    const baseOrders = voucherOrdersVisibleForUser(data, await paidVoucherOrdersForReport(data, date.slice(0, 7)), authContext.user);
    let orders = filterVoucherReportOrders(data, baseOrders, filters, authContext.user)
      .filter((order) => order.date === date);
    orders = filterSearch(orders, search, ['reference', 'paymentReference', 'buyerName', 'whatsapp', 'profileName', 'packageLabel', 'nasName', 'paymentMethod', 'source', 'sourceLabel', 'resellerName', 'resellerUsername', 'createdByName', 'createdByUsername']);
    orders.sort((a, b) => String(b.paidAt || b.updatedAt || '').localeCompare(String(a.paidAt || a.updatedAt || '')));
    const summary = voucherReportSummary(orders);
    const pagination = paginationPayload(page, limit, orders.length);
    const offset = (pagination.page - 1) * limit;
    sendJson(res, 200, {
      ok: true,
      date,
      search,
      filters,
      filterOptions: voucherReportFilterOptions(data, filterVoucherReportOrders(data, baseOrders, {}, authContext.user), authContext.user),
      summary,
      orders: orders.slice(offset, offset + limit),
      pagination,
      checkedAt: new Date().toISOString()
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/reports/voucher-monthly') {
    const authContext = await requirePermission(req, res, 'reports:voucher:read');
    if (!authContext) return;
    const data = authContext.data;
    const period = normalizePeriod(url.searchParams.get('period') || currentPeriod());
    const filters = {
      nas: String(url.searchParams.get('nas') || '').trim(),
      reseller: String(url.searchParams.get('reseller') || '').trim(),
      profile: String(url.searchParams.get('profile') || '').trim(),
      method: String(url.searchParams.get('method') || '').trim()
    };
    const baseOrders = voucherOrdersVisibleForUser(data, await paidVoucherOrdersForReport(data, period), authContext.user);
    const orders = filterVoucherReportOrders(data, baseOrders, filters, authContext.user);
    const rows = monthlyVoucherDailyRows(data, period, orders);
    const summary = voucherReportSummary(orders);
    sendJson(res, 200, {
      ok: true,
      period,
      filters,
      filterOptions: voucherReportFilterOptions(data, filterVoucherReportOrders(data, baseOrders, {}, authContext.user), authContext.user),
      summary,
      dailyRows: rows,
      checkedAt: new Date().toISOString()
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/reports/monthly-transactions') {
    const authContext = await requirePermission(req, res, 'reports:daily:read');
    if (!authContext) return;
    if (userIsCollector(authContext.user)) {
      forbidden(res);
      return;
    }
    const data = authContext.data;
    const period = normalizePeriod(url.searchParams.get('period') || currentPeriod());
    const methodFilter = String(url.searchParams.get('method') || 'all').trim().toLowerCase();
    const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    const invoices = new Map((data.invoices || []).map((invoice) => [invoice.id, invoice]));
    const customers = new Map((data.customers || []).map((customer) => [customer.id, customer]));
    const billingTransactions = activePayments(data)
      .map((payment) => {
        const invoice = invoices.get(payment.invoiceId) || {};
        const customer = customers.get(payment.customerId || invoice.customerId) || {};
        const invoiceNo = displayBillingInvoiceNo(invoice.externalId || invoice.invoiceNo || invoice.id || payment.invoiceId || payment.id);
        return {
          id: `billing-${payment.id}`,
          source: 'billing',
          sourceLabel: 'Tagihan',
          invoiceNo,
          legacyInvoiceNo: invoice.externalId || invoice.invoiceNo || invoice.id || payment.invoiceId || payment.id,
          customerName: customer.name || invoice.customerName || '',
          username: customer.username || invoice.username || '',
          packageName: invoice.packageName || customer.packageName || '',
          amount: Number(payment.amount || invoice.amount || 0),
          method: payment.method || invoice.paymentMethod || 'Tunai',
          paidAt: payment.paidAt || payment.createdAt || '',
          submittedAt: payment.paidAt || payment.createdAt || '',
          submittedRaw: payment.paidAt || payment.createdAt || '',
          item: invoice.packageName || customer.packageName || 'Tagihan internet',
          description: payment.notes || customer.name || invoice.customerName || '',
          type: 'Pembayaran',
          admin: payment.admin || payment.createdBy || payment.createdByName || 'Sistem',
          notes: payment.notes || invoice.notes || ''
        };
      })
      .filter((transaction) => String(transaction.paidAt || '').slice(0, 7) === period);
    const voucherOrders = filterVoucherReportOrders(data, await paidVoucherOrdersForReport(data, period), {}, authContext.user);
    const voucherTransactions = voucherOrders.map((order) => ({
      id: `voucher-${order.id || order.reference}`,
      source: 'voucher',
      sourceLabel: 'Voucher',
      invoiceNo: order.reference || '',
      legacyInvoiceNo: order.reference || '',
      customerName: order.buyerName || 'Pembeli Voucher',
      username: Array.isArray(order.vouchers) ? order.vouchers.map((voucher) => voucher.username).filter(Boolean).join(', ') : '',
      packageName: order.packageLabel || order.profileName || 'Voucher Hotspot',
      amount: Number(order.amount || 0),
      method: order.paymentMethod || 'QRIS',
      paidAt: order.paidAt || order.updatedAt || order.createdAt || '',
      submittedAt: order.paidAt || order.updatedAt || order.createdAt || '',
      submittedRaw: order.paidAt || order.updatedAt || order.createdAt || '',
      item: order.packageLabel || order.profileName || 'Voucher Hotspot',
      description: `${order.sourceLabel || 'Voucher'} ${order.quantity || 1} voucher${order.nasName ? ` - ${order.nasName}` : ''}`,
      type: 'Voucher',
      admin: order.resellerName || order.createdByName || order.paidByName || 'Sistem',
      notes: order.reference || '',
      paymentGatewayReference: order.reference || ''
      }));
    const voucherReferences = new Set(voucherTransactions.map((transaction) => String(transaction.invoiceNo || '').trim()).filter(Boolean));
    const billingReferences = new Set(billingTransactions.flatMap((transaction) => [
      transaction.invoiceNo,
      transaction.legacyInvoiceNo
    ]).map((value) => String(value || '').trim()).filter(Boolean));
    const paymentGatewayTransactions = (paymentGatewayReportPayload(data, { kind: 'all' }).transactions || [])
      .filter((row) => ['paid', 'settled', 'success'].includes(String(row.status || '').toLowerCase()))
      .filter((row) => String(row.paidAt || row.paymentAt || row.date || row.createdAt || '').slice(0, 7) === period)
      .filter((row) => {
        const kind = paymentGatewayTransactionKind(row);
        const references = [
          row.reference,
          row.invoiceNo,
          row.externalId
        ].map((value) => String(value || '').trim()).filter(Boolean);
        if (kind === 'hotspot-voucher' && references.some((reference) => voucherReferences.has(reference))) return false;
        if (kind === 'monthly-package' && references.some((reference) => billingReferences.has(reference))) return false;
        return true;
      })
      .map((row) => ({
        id: `pg-${row.id || row.reference}`,
        source: 'payment-gateway',
        sourceLabel: 'Payment Gateway',
        invoiceNo: row.reference || row.invoiceNo || row.id || '',
        legacyInvoiceNo: row.reference || row.invoiceNo || row.id || '',
        customerName: row.customerName || row.description || '',
        username: row.username || '',
        packageName: paymentGatewayTransactionKindLabel(paymentGatewayTransactionKind(row)),
        amount: Number(row.amount || 0),
        method: row.method || row.paymentMethod || row.provider || 'Transfer',
        paidAt: row.paidAt || row.paymentAt || row.date || row.createdAt || '',
        submittedAt: row.paidAt || row.paymentAt || row.date || row.createdAt || '',
        submittedRaw: row.paidAt || row.paymentAt || row.date || row.createdAt || '',
        item: row.description || paymentGatewayTransactionKindLabel(paymentGatewayTransactionKind(row)),
        description: row.description || row.customerName || '',
        type: 'Payment Gateway',
        admin: row.paidByName || row.provider || 'Payment Gateway',
        notes: row.externalId || '',
        paymentGatewayReference: row.reference || row.invoiceNo || ''
      }));
    let transactions = billingTransactions.concat(voucherTransactions, paymentGatewayTransactions);
    if (methodFilter !== 'all') {
      transactions = transactions.filter((transaction) => {
        const group = paymentMethodGroup(transaction.method);
        return methodFilter === group || String(transaction.method || '').toLowerCase().includes(methodFilter);
      });
    }
    transactions = filterSearch(transactions, search, ['invoiceNo', 'customerName', 'username', 'packageName', 'method', 'admin', 'notes', 'sourceLabel', 'description', 'paymentGatewayReference']);
    transactions.sort(sortReportTransactionsNewestFirst);
    const summary = {
      totalCount: transactions.length,
      totalAmount: transactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
      billingCount: transactions.filter((transaction) => transaction.source === 'billing').length,
      billingAmount: transactions.filter((transaction) => transaction.source === 'billing').reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
      voucherCount: transactions.filter((transaction) => transaction.source === 'voucher').length,
      voucherAmount: transactions.filter((transaction) => transaction.source === 'voucher').reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
      gatewayCount: transactions.filter((transaction) => transaction.source === 'payment-gateway').length,
      gatewayAmount: transactions.filter((transaction) => transaction.source === 'payment-gateway').reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
      cashCount: transactions.filter((transaction) => paymentMethodGroup(transaction.method) === 'cash').length,
      cashAmount: transactions.filter((transaction) => paymentMethodGroup(transaction.method) === 'cash').reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
      transferCount: transactions.filter((transaction) => paymentMethodGroup(transaction.method) !== 'cash').length,
      transferAmount: transactions.filter((transaction) => paymentMethodGroup(transaction.method) !== 'cash').reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
    };
    const pagination = paginationPayload(page, limit, transactions.length);
    const offset = (pagination.page - 1) * limit;
    sendJson(res, 200, {
      ok: true,
      period,
      method: methodFilter,
      search,
      summary,
      transactions: transactions.slice(offset, offset + limit),
      pagination,
      checkedAt: new Date().toISOString()
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/reports/finance-recap') {
    const authContext = await requirePermission(req, res, 'reports:daily:read');
    if (!authContext) return;
    if (userIsCollector(authContext.user)) {
      forbidden(res);
      return;
    }
    const data = authContext.data;
    const period = normalizePeriod(url.searchParams.get('period') || currentPeriod());
    const invoices = new Map((data.invoices || []).map((invoice) => [invoice.id, invoice]));
    const payments = activePayments(data)
      .filter((payment) => String(payment.paidAt || payment.createdAt || '').slice(0, 7) === period)
      .map((payment) => {
        const invoice = invoices.get(payment.invoiceId) || {};
        return {
          type: 'billing',
          category: 'Tagihan Internet',
          description: invoice.customerName || invoice.username || payment.notes || 'Pembayaran tagihan',
          amount: Number(payment.amount || invoice.amount || 0),
          date: payment.paidAt || payment.createdAt || ''
        };
      });
    const externalIncomes = (data.externalIncomes || [])
      .filter((income) => String(income.date || income.createdAt || '').slice(0, 7) === period && String(income.status || 'active') !== 'cancelled')
      .map((income) => ({
        type: 'external',
        category: income.category || 'Pemasukan Lain',
        description: income.payerName || income.itemName || income.description || income.receiptNo || '',
        amount: Number(income.amount || 0),
        date: income.date || income.createdAt || ''
      }));
    const expenses = (data.expenses || [])
      .filter((expense) => String(expense.date || expense.createdAt || '').slice(0, 7) === period)
      .map((expense) => ({
        category: expense.category || 'Pengeluaran',
        description: expense.payee || expense.vendor || expense.itemName || expense.description || expense.noteNo || '',
        amount: Number(expense.amount || 0),
        date: expense.date || expense.createdAt || ''
      }));
    const incomeRows = payments.concat(externalIncomes);
    const groupRows = (rows) => {
      const groups = new Map();
      rows.forEach((row) => {
        const key = row.category || '-';
        const current = groups.get(key) || { category: key, count: 0, amount: 0 };
        current.count += 1;
        current.amount += Number(row.amount || 0);
        groups.set(key, current);
      });
      return [...groups.values()].sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
    };
    const incomeTotal = incomeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    sendJson(res, 200, {
      ok: true,
      period,
      summary: {
        incomeCount: incomeRows.length,
        incomeTotal,
        expenseCount: expenses.length,
        expenseTotal,
        profit: incomeTotal - expenseTotal
      },
      incomeGroups: groupRows(incomeRows),
      expenseGroups: groupRows(expenses),
      checkedAt: new Date().toISOString()
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/reports/inventory-stock') {
    const authContext = await requirePermission(req, res, 'inventory:read');
    if (!authContext) return;
    const data = authContext.data;
    const period = normalizePeriod(url.searchParams.get('period') || currentPeriod());
    const type = movementTypeFilter(url.searchParams.get('type'));
    const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    const itemDirectory = inventoryDirectory(data.inventoryItems || []);
    let movements = (data.stockMovements || [])
      .map((movement) => publicStockMovement(movement, itemDirectory))
      .filter((movement) => !period || movement.date.slice(0, 7) === period);
    if (type !== 'all') {
      movements = movements.filter((movement) => movement.type === type);
    }
    movements = filterSearch(movements, search, ['itemName', 'type', 'reference', 'updatedByName', 'updatedByUsername', 'updatedByRole', 'notes', 'date']);
    movements = sortByDateDesc(movements, 'createdAt');
    const summary = stockMovementSummary(movements);
    const pagination = paginationPayload(page, limit, movements.length);
    const offset = (pagination.page - 1) * limit;
    sendJson(res, 200, {
      period,
      type,
      search,
      movements: movements.slice(offset, offset + limit),
      summary,
      pagination
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/customers') {
    const authContext = await requirePermission(req, res, 'customers:manage');
    if (!authContext) return;
    const data = authContext.data;
    const { status, search } = normalizeListQuery(url);
    let customers = [...data.customers];
    if (status !== 'all') {
      customers = customers.filter((customer) => customer.status === status);
    }
    customers = filterSearch(customers, search, ['name', 'username', 'phone', 'address', 'packageName']);
    customers.sort((a, b) => String(a.name || a.username).localeCompare(String(b.name || b.username)));
    sendJson(res, 200, { customers });
    return;
  }

  if (method === 'POST' && pathname === '/api/customers') {
    const authContext = await requirePermission(req, res, 'customers:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    if (!payload.name && !payload.username) {
      badRequest(res, 'Nama atau username pelanggan wajib diisi');
      return;
    }
    const { result } = await mutate((data) => addManualCustomer(data, payload));
    sendJson(res, 201, { customer: result });
    return;
  }

  if (method === 'GET' && pathname === '/api/invoices') {
    const authContext = await requirePermission(req, res, 'invoices:manage');
    if (!authContext) return;
    const data = authContext.data;
    const { period, status, search } = normalizeListQuery(url);
    let invoices = data.invoices
      .filter((invoice) => invoiceCoversPeriod(invoice, period))
      .map((invoice) => ({
        ...invoice,
        period: normalizePeriod(period),
        originalPeriod: invoice.period || '',
        coverageText: invoiceCoverageText(invoice),
        runtimeStatus: invoiceRuntimeStatus(invoice)
      }));
    if (status !== 'all') {
      invoices = invoices.filter((invoice) => invoice.runtimeStatus === status);
    }
    invoices = filterSearch(invoices, search, ['customerName', 'username', 'packageName', 'notes']);
    invoices.sort((a, b) => {
      const statusOrder = { overdue: 0, pending: 1, paid: 2, cancelled: 3 };
      return (statusOrder[a.runtimeStatus] ?? 9) - (statusOrder[b.runtimeStatus] ?? 9)
        || String(a.dueDate || '').localeCompare(String(b.dueDate || ''))
        || String(a.customerName || a.username).localeCompare(String(b.customerName || b.username));
    });
    sendJson(res, 200, { invoices });
    return;
  }

  if (method === 'POST' && pathname === '/api/invoices/generate') {
    const authContext = await requirePermission(req, res, 'invoices:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    const period = payload.period || currentPeriod();
    const { result } = await mutate((data) => {
      if (standaloneMode(data)) {
        reconcileRadiusCustomerStatuses(data);
      }
      const created = generateInvoices(data, period);
      for (const invoice of created) {
        queueInvoiceWaMessage(data, invoice, 'invoiceIssued', authContext.user);
      }
      return created;
    });
    sendJson(res, 201, { created: result.length, invoices: result });
    return;
  }

  const payMatch = pathname.match(/^\/api\/invoices\/([^/]+)\/pay$/);
  if (method === 'PATCH' && payMatch) {
    const authContext = await requirePermission(req, res, 'invoices:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    const invoiceId = decodeURIComponent(payMatch[1]);
    const { result } = await mutate((data) => {
      const invoice = markInvoicePaid(data, invoiceId, {
        ...payload,
        ...actorPayload(authContext.user)
      });
      if (invoice) {
        queueInvoiceWaMessage(data, invoice, 'paymentPaid', authContext.user);
        const activation = reactivateCustomerAfterPaidInvoice(data, invoice, authContext.user);
        if (activation.activatedUser) {
          queueInvoiceWaMessage(data, invoice, 'accountActive', authContext.user);
        } else if (activation.requiresAdmin) {
          addActivity(data, 'invoice', `Pembayaran ${invoice.customerName || invoice.username || invoice.invoiceNo} tercatat, aktivasi pelanggan terminated menunggu validasi admin`, {
            action: 'terminated-payment-awaiting-admin',
            invoiceId: invoice.id,
            customerId: activation.customer?.id || invoice.customerId || '',
            source: activation.source || 'manual'
          });
        }
      }
      return invoice;
    });
    if (!result) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { invoice: result });
    return;
  }

  const unpayMatch = pathname.match(/^\/api\/invoices\/([^/]+)\/unpay$/);
  if (method === 'PATCH' && unpayMatch) {
    const authContext = await requirePermission(req, res, 'invoices:manage');
    if (!authContext) return;
    const invoiceId = decodeURIComponent(unpayMatch[1]);
    const { result } = await mutate((data) => {
      const invoice = markInvoiceUnpaid(data, invoiceId);
      if (invoice) queueInvoiceWaMessage(data, invoice, 'paymentCancel', authContext.user);
      return invoice;
    });
    if (!result) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { invoice: result });
    return;
  }

  if (method === 'GET' && pathname === '/api/billing/settings') {
    const authContext = await requirePermission(req, res, 'billing-settings:manage');
    if (!authContext) return;
    sendJson(res, 200, {
      ok: true,
      settings: authContext.data.settings?.billing || {}
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/genieacs/devices') {
    const authContext = await requirePermission(req, res, 'genieacs:read');
    if (!authContext) return;
    const { page, limit } = paginationParams(url, 10, 100);
    const search = String(url.searchParams.get('search') || '').trim();
    const status = String(url.searchParams.get('status') || 'all').trim().toLowerCase();
    try {
      const payload = await genieAcs.listDevices(authContext.data.settings || {}, {
        page,
        limit,
        search,
        status
      });
      const rows = await enrichGenieAcsRowsWithLocalData(authContext.data, payload.rows || [], currentPeriod());
      sendJson(res, 200, {
        ...payload,
        rows,
        settings: genieAcs.normalizeSettings(authContext.data.settings || {})
      });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        enabled: genieAcs.normalizeSettings(authContext.data.settings || {}).enabled,
        configured: genieAcs.configured(authContext.data.settings || {}),
        rows: [],
        summary: {
          total: 0,
          online: 0,
          offline: 0,
          filtered: 0,
          redamanCount: 0,
          redamanHighCount: 0,
          redamanHighThreshold: -26.5,
          redamanHighThresholdText: '-26,5 dBm',
          redamanAverage: null,
          redamanAverageText: '-'
        },
        pagination: paginationPayload(page, limit, 0),
        settings: genieAcs.normalizeSettings(authContext.data.settings || {}),
        error: error.message || 'GenieACS tidak bisa dibaca'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/genieacs/settings') {
    const authContext = await requirePermission(req, res, 'genieacs:read');
    if (!authContext) return;
    sendJson(res, 200, {
      ok: true,
      settings: publicGenieAcsSettings(authContext.data.settings || {})
    });
    return;
  }

  if (method === 'PUT' && pathname === '/api/genieacs/settings') {
    const authContext = await requirePermission(req, res, 'settings:write');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { data } = await mutate((store) => {
        store.settings = store.settings || {};
        store.settings.genieAcs = sanitizeGenieAcsSettings(payload.genieAcs || payload, store.settings.genieAcs || {});
        if (payload.wifiKu && typeof payload.wifiKu === 'object') {
          store.settings.wifiKu = sanitizeWifiKuSettings(payload.wifiKu, store.settings.wifiKu || {});
        }
        addActivity(store, 'settings', `Setting GenieACS diperbarui oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'genieacs-settings-update',
          baseUrl: store.settings.genieAcs.baseUrl || ''
        });
      });
      sendJson(res, 200, {
        ok: true,
        settings: publicGenieAcsSettings(data.settings || {})
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || 'Setting GenieACS gagal disimpan' });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/genieacs/devices/batch') {
    const authContext = await requirePermission(req, res, 'genieacs:write');
    if (!authContext) return;
    const payload = await readBody(req);
    const action = String(payload.action || '').trim().toLowerCase();
    const ids = Array.isArray(payload.ids)
      ? [...new Set(payload.ids.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 50)
      : [];
    if (!['reboot', 'delete'].includes(action)) {
      badRequest(res, 'Aksi batch GenieACS tidak valid');
      return;
    }
    if (!ids.length) {
      badRequest(res, 'Pilih minimal 1 perangkat GenieACS');
      return;
    }
    const results = [];
    for (const deviceId of ids) {
      try {
        if (action === 'reboot') {
          await genieAcs.reboot(authContext.data.settings || {}, deviceId);
        } else {
          await genieAcs.deleteDevice(authContext.data.settings || {}, deviceId);
        }
        results.push({ id: deviceId, ok: true });
      } catch (error) {
        results.push({ id: deviceId, ok: false, error: error.message || 'Gagal diproses' });
      }
    }
    const successCount = results.filter((item) => item.ok).length;
    await mutate((store) => {
      addActivity(store, 'monitoring', `GenieACS batch ${action} ${successCount}/${ids.length} perangkat oleh ${authContext.user.name || authContext.user.username}`, {
        action: `genieacs-batch-${action}`,
        ids,
        successCount,
        total: ids.length
      });
    });
    sendJson(res, successCount ? 200 : 400, {
      ok: successCount > 0,
      action,
      successCount,
      failedCount: ids.length - successCount,
      results
    });
    return;
  }

  const genieAcsDeleteMatch = pathname.match(/^\/api\/genieacs\/devices\/([^/]+)$/);
  if (method === 'DELETE' && genieAcsDeleteMatch) {
    const authContext = await requirePermission(req, res, 'genieacs:write');
    if (!authContext) return;
    const deviceId = decodeURIComponent(genieAcsDeleteMatch[1]);
    try {
      await genieAcs.deleteDevice(authContext.data.settings || {}, deviceId);
      await mutate((store) => {
        addActivity(store, 'monitoring', `GenieACS device dihapus oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'genieacs-delete',
          deviceId
        });
      });
      sendJson(res, 200, { ok: true, message: 'Device GenieACS dihapus' });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || 'Device GenieACS gagal dihapus' });
    }
    return;
  }

  const genieAcsDeviceActionMatch = pathname.match(/^\/api\/genieacs\/devices\/([^/]+)\/(refresh|reboot|wifi|wifi-password|wifi-ssid)$/);
  if (genieAcsDeviceActionMatch && method === 'POST') {
    const authContext = await requirePermission(req, res, 'genieacs:write');
    if (!authContext) return;
    const deviceId = decodeURIComponent(genieAcsDeviceActionMatch[1]);
    const action = genieAcsDeviceActionMatch[2];
    const payload = await readBody(req);
    try {
      if (action === 'refresh') {
        await genieAcs.refreshDevice(authContext.data.settings || {}, deviceId);
      } else if (action === 'reboot') {
        await genieAcs.reboot(authContext.data.settings || {}, deviceId);
      } else if (action === 'wifi') {
        await genieAcs.setWifiCredentials(authContext.data.settings || {}, deviceId, payload);
      } else if (action === 'wifi-password') {
        await genieAcs.setWifiPassword(authContext.data.settings || {}, deviceId, payload.password, payload.parameter);
      } else if (action === 'wifi-ssid') {
        await genieAcs.setWifiSsid(authContext.data.settings || {}, deviceId, payload.ssid, payload.band, payload.parameter);
      }
      await mutate((store) => {
        addActivity(store, 'monitoring', `GenieACS ${action} dikirim oleh ${authContext.user.name || authContext.user.username}`, {
          action: `genieacs-${action}`,
          deviceId
        });
      });
      sendJson(res, 200, { ok: true, message: 'Perintah GenieACS dikirim' });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || 'Perintah GenieACS gagal' });
    }
    return;
  }

  if (method === 'PUT' && pathname === '/api/billing/settings') {
    const authContext = await requirePermission(req, res, 'billing-settings:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { data, result } = await mutate(async (store) => {
        store.settings = store.settings || {};
        store.settings.billing = sanitizeBillingSettings(payload.billing || payload, store.settings.billing || {});
        store.settings.defaultDueDay = store.settings.billing.postpaidDueDay;
        const stampedVouchers = await stampHotspotVoucherValidityFromSessions(store, authContext.user);
        const automation = standaloneBillingAutomation(store, authContext.user);
        automation.stampedVouchers = stampedVouchers;
        const expiredVouchers = (automation.voucherExpirations?.removed?.length || 0) + (automation.voucherExpirations?.updated?.length || 0);
        if (automation.created.length || automation.isolatedUsers.length || automation.activatedUsers.length || expiredVouchers) {
          await syncFreeradiusIfNeeded(store, authContext.user, 'billing-settings-automation');
        }
        if (expiredVouchers) {
          automation.expiredVoucherDisconnects = await disconnectExpiredVoucherSessions(store, automation.voucherExpirations, authContext.user);
        }
        addActivity(store, 'settings', `Pengaturan billing diperbarui oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'billing-settings-update'
        });
        return automation;
      });
      sendJson(res, 200, {
        ok: true,
        settings: data.settings.billing || {},
        automation: {
          created: result.created.length,
          isolated: result.isolatedUsers.length,
          activated: result.activatedUsers.length
        }
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Pengaturan billing gagal disimpan'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/expenses') {
    const authContext = await requirePermission(req, res, 'expenses:read');
    if (!authContext) return;
    const data = authContext.data;
    const { period, search } = normalizeListQuery(url);
    let expenses = data.expenses
      .filter((expense) => String(expense.date || '').startsWith(period))
      .map((expense) => ({
        ...expense,
        itemSearch: (expense.items || []).map((item) => [
          item.category,
          item.itemName,
          item.description
        ].filter(Boolean).join(' ')).join(' ')
      }));
    expenses = filterSearch(expenses, search, ['category', 'payee', 'vendor', 'noteNo', 'itemName', 'description', 'paymentMethod', 'itemSearch']);
    sendJson(res, 200, { expenses: sortByDateDesc(expenses, 'date') });
    return;
  }

  if (method === 'GET' && pathname === '/api/external-incomes') {
    const authContext = await requirePermission(req, res, 'external-incomes:read');
    if (!authContext) return;
    const data = authContext.data;
    const { period, search } = normalizeListQuery(url);
    let externalIncomes = (data.externalIncomes || [])
      .filter((income) => String(income.date || '').startsWith(period))
      .map((income) => ({
        ...income,
        itemSearch: (income.items || []).map((item) => [
          item.category,
          item.itemName,
          item.description
        ].filter(Boolean).join(' ')).join(' ')
      }));
    externalIncomes = filterSearch(externalIncomes, search, ['receiptNo', 'category', 'payerName', 'itemName', 'description', 'paymentMethod', 'itemSearch']);
    sendJson(res, 200, { externalIncomes: sortByDateDesc(externalIncomes, 'date') });
    return;
  }

  if (method === 'POST' && pathname === '/api/external-incomes') {
    const authContext = await requirePermission(req, res, 'external-incomes:write');
    if (!authContext) return;
    const payload = await readBody(req);
    if (payloadAmount(payload) <= 0) {
      badRequest(res, 'Nominal pemasukan wajib diisi');
      return;
    }
    const { result } = await mutate((data) => addExternalIncome(data, {
      ...payload,
      ...actorPayload(authContext.user)
    }));
    sendJson(res, 201, {
      externalIncome: result,
      externalIncomes: [result],
      created: 1
    });
    return;
  }

  const externalIncomeMatch = pathname.match(/^\/api\/external-incomes\/([^/]+)$/);
  if (externalIncomeMatch && method === 'PUT') {
    const authContext = await requirePermission(req, res, 'external-incomes:write');
    if (!authContext) return;
    const payload = await readBody(req);
    if (payloadAmount(payload) <= 0) {
      badRequest(res, 'Nominal pemasukan wajib diisi');
      return;
    }
    const incomeId = decodeURIComponent(externalIncomeMatch[1]);
    const { result } = await mutate((data) => updateExternalIncome(data, incomeId, {
      ...payload,
      ...actorPayload(authContext.user)
    }));
    if (!result) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { externalIncome: result });
    return;
  }

  if (externalIncomeMatch && method === 'DELETE') {
    const authContext = await requirePermission(req, res, 'external-incomes:write');
    if (!authContext) return;
    const incomeId = decodeURIComponent(externalIncomeMatch[1]);
    const { result } = await mutate((data) => deleteExternalIncome(data, incomeId));
    if (!result) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { externalIncome: result });
    return;
  }

  if (method === 'POST' && pathname === '/api/expenses') {
    const authContext = await requirePermission(req, res, 'expenses:write');
    if (!authContext) return;
    const payload = await readBody(req);
    if (payloadAmount(payload) <= 0) {
      badRequest(res, 'Nominal pengeluaran wajib diisi');
      return;
    }
    const { result } = await mutate((data) => addExpense(data, payload));
    sendJson(res, 201, {
      expense: result,
      expenses: [result],
      created: 1
    });
    return;
  }

  const expenseMatch = pathname.match(/^\/api\/expenses\/([^/]+)$/);
  if (expenseMatch && method === 'PUT') {
    const authContext = await requirePermission(req, res, 'expenses:write');
    if (!authContext) return;
    const payload = await readBody(req);
    if (payloadAmount(payload) <= 0) {
      badRequest(res, 'Nominal pengeluaran wajib diisi');
      return;
    }
    const expenseId = decodeURIComponent(expenseMatch[1]);
    const { result } = await mutate((data) => updateExpense(data, expenseId, payload));
    if (!result) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { expense: result });
    return;
  }

  if (expenseMatch && method === 'DELETE') {
    const authContext = await requirePermission(req, res, 'expenses:write');
    if (!authContext) return;
    const expenseId = decodeURIComponent(expenseMatch[1]);
    const { result } = await mutate((data) => deleteExpense(data, expenseId));
    if (!result) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { expense: result });
    return;
  }

  if (method === 'GET' && pathname === '/api/inventory') {
    const authContext = await requirePermission(req, res, 'inventory:read');
    if (!authContext) return;
    const data = authContext.data;
    const { status, search } = normalizeListQuery(url);
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    let items = [...(data.inventoryItems || [])];
    if (status !== 'all') {
      items = items.filter((item) => item.status === status);
    }
    items = filterSearch(items, search, ['sku', 'name', 'category', 'location', 'vendor', 'notes']);
    items.sort((a, b) => {
      const statusOrder = { active: 0, maintenance: 1, damaged: 2, lost: 3, inactive: 4 };
      return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
        || String(a.category || '').localeCompare(String(b.category || ''))
        || String(a.name || '').localeCompare(String(b.name || ''));
    });
    const pagination = paginationPayload(page, limit, items.length);
    const offset = (pagination.page - 1) * limit;
    const itemDirectory = inventoryDirectory(data.inventoryItems || []);
    const movements = sortByDateDesc(
      (data.stockMovements || []).map((movement) => publicStockMovement(movement, itemDirectory)),
      'createdAt'
    ).slice(0, 12);
    sendJson(res, 200, {
      items: items.slice(offset, offset + limit),
      movements,
      pagination,
      summary: operations.inventorySummary(data.inventoryItems || [])
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/inventory') {
    const authContext = await requirePermission(req, res, 'inventory:write');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { result } = await mutate((data) => operations.addInventoryItem(data, {
        ...payload,
        ...actorPayload(authContext.user)
      }));
      sendJson(res, 201, { item: result });
    } catch (error) {
      badRequest(res, error.message || 'Barang tidak bisa dibuat');
    }
    return;
  }

  const inventoryMovementMatch = pathname.match(/^\/api\/inventory\/([^/]+)\/movements$/);
  if (inventoryMovementMatch && method === 'POST') {
    const authContext = await requirePermission(req, res, 'inventory:write');
    if (!authContext) return;
    const payload = await readBody(req);
    const itemId = decodeURIComponent(inventoryMovementMatch[1]);
    try {
      const { result } = await mutate((data) => operations.addStockMovement(data, itemId, {
        ...payload,
        ...actorPayload(authContext.user)
      }));
      if (!result) {
        notFound(res);
        return;
      }
      sendJson(res, 201, result);
    } catch (error) {
      badRequest(res, error.message || 'Mutasi stok tidak bisa dibuat');
    }
    return;
  }

  const inventoryMatch = pathname.match(/^\/api\/inventory\/([^/]+)$/);
  if (inventoryMatch && method === 'PUT') {
    const authContext = await requirePermission(req, res, 'inventory:write');
    if (!authContext) return;
    const payload = await readBody(req);
    const itemId = decodeURIComponent(inventoryMatch[1]);
    try {
      const { result } = await mutate((data) => operations.updateInventoryItem(data, itemId, {
        ...payload,
        ...actorPayload(authContext.user)
      }));
      if (!result) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { item: result });
    } catch (error) {
      badRequest(res, error.message || 'Barang tidak bisa diperbarui');
    }
    return;
  }

  if (inventoryMatch && method === 'DELETE') {
    const authContext = await requirePermission(req, res, 'inventory:write');
    if (!authContext) return;
    const itemId = decodeURIComponent(inventoryMatch[1]);
    const { result } = await mutate((data) => operations.archiveInventoryItem(data, itemId));
    if (!result) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { item: result });
    return;
  }

  if (method === 'GET' && pathname === '/api/network-assets') {
    const authContext = await requirePermission(req, res, 'network-assets:read');
    if (!authContext) return;
    const data = authContext.data;
    const { status, search } = normalizeListQuery(url);
    let assets = [...(data.networkAssets || [])];
    if (status !== 'all') {
      assets = assets.filter((asset) => asset.status === status);
    }
    assets = filterSearch(assets, search, ['name', 'type', 'site', 'location', 'brand', 'model', 'serialNumber', 'owner', 'notes']);
    assets.sort((a, b) => {
      const statusOrder = { active: 0, maintenance: 1, inactive: 2 };
      return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
        || String(a.site || '').localeCompare(String(b.site || ''))
        || String(a.name || '').localeCompare(String(b.name || ''));
    });
    sendJson(res, 200, {
      assets,
      summary: operations.networkSummary(data.networkAssets || [])
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/network-assets') {
    const authContext = await requirePermission(req, res, 'network-assets:write');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { result } = await mutate((data) => operations.addNetworkAsset(data, payload));
      sendJson(res, 201, { asset: result });
    } catch (error) {
      badRequest(res, error.message || 'Aset tidak bisa dibuat');
    }
    return;
  }

  const networkAssetMatch = pathname.match(/^\/api\/network-assets\/([^/]+)$/);
  if (networkAssetMatch && method === 'PUT') {
    const authContext = await requirePermission(req, res, 'network-assets:write');
    if (!authContext) return;
    const payload = await readBody(req);
    const assetId = decodeURIComponent(networkAssetMatch[1]);
    try {
      const { result } = await mutate((data) => operations.updateNetworkAsset(data, assetId, payload));
      if (!result) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { asset: result });
    } catch (error) {
      badRequest(res, error.message || 'Aset tidak bisa diperbarui');
    }
    return;
  }

  if (networkAssetMatch && method === 'DELETE') {
    const authContext = await requirePermission(req, res, 'network-assets:write');
    if (!authContext) return;
    const assetId = decodeURIComponent(networkAssetMatch[1]);
    const { result } = await mutate((data) => operations.archiveNetworkAsset(data, assetId));
    if (!result) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { asset: result });
    return;
  }

  if (method === 'GET' && pathname === '/api/monitoring') {
    const authContext = await requirePermission(req, res, 'monitoring:read');
    if (!authContext) return;
    const data = authContext.data;
    const { status, search } = normalizeListQuery(url);
    let targets = [...(data.monitoringTargets || [])];
    if (status !== 'all') {
      targets = targets.filter((target) => target.status === status);
    }
    targets = filterSearch(targets, search, ['name', 'host', 'method', 'snmpVersion', 'oid', 'location', 'notes']);
    targets.sort((a, b) => {
      const statusOrder = { down: 0, unknown: 1, up: 2, inactive: 3 };
      return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
        || String(a.name || '').localeCompare(String(b.name || ''));
    });
    const legacyServiceTargetId = (data.monitoringTargets || []).find((target) => target.status !== 'inactive')?.id || '';
    sendJson(res, 200, {
      targets: targets.map((target) => publicMonitoringTarget(
        target,
        target.id === legacyServiceTargetId ? data.settings.mediaServices : {}
      )),
      summary: operations.monitoringSummary(data.monitoringTargets || [])
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/monitoring') {
    const authContext = await requirePermission(req, res, 'monitoring:write');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { result } = await mutate(async (data) => {
        const target = operations.addMonitoringTarget(data, payload);
        await syncFreeradiusIfNeeded(data, authContext.user, 'monitoring-site-create');
        return target;
      });
      sendJson(res, 201, { target: publicMonitoringTarget(result) });
    } catch (error) {
      badRequest(res, error.message || 'Target monitoring tidak bisa dibuat');
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/monitoring/check') {
    const authContext = await requirePermission(req, res, 'monitoring:check');
    if (!authContext) return;
    const payload = await readBody(req);
    const { data, result } = await mutate((store) => operations.runMonitoringCheck(store, payload.targetId || ''));
    sendJson(res, 200, {
      targets: result,
      summary: operations.monitoringSummary(data.monitoringTargets || [])
    });
    return;
  }

  const monitoringMatch = pathname.match(/^\/api\/monitoring\/([^/]+)$/);
  const monitoringReservedPath = monitoringMatch
    ? ['member-contact', 'member-payment'].includes(monitoringMatch[1])
    : false;
  if (monitoringMatch && !monitoringReservedPath && method === 'PUT') {
    const authContext = await requirePermission(req, res, 'monitoring:write');
    if (!authContext) return;
    const payload = await readBody(req);
    const targetId = decodeURIComponent(monitoringMatch[1]);
    try {
      const { result } = await mutate(async (data) => {
        const target = operations.updateMonitoringTarget(data, targetId, payload);
        if (target) {
          await syncFreeradiusIfNeeded(data, authContext.user, 'monitoring-site-update');
        }
        return target;
      });
      if (!result) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { target: publicMonitoringTarget(result) });
    } catch (error) {
      badRequest(res, error.message || 'Target monitoring tidak bisa diperbarui');
    }
    return;
  }

  if (monitoringMatch && !monitoringReservedPath && method === 'DELETE') {
    const authContext = await requirePermission(req, res, 'monitoring:write');
    if (!authContext) return;
    const targetId = decodeURIComponent(monitoringMatch[1]);
    const { result } = await mutate(async (data) => {
      const target = operations.deleteMonitoringTarget(data, targetId);
      if (target) {
        await syncFreeradiusIfNeeded(data, authContext.user, 'monitoring-site-delete');
      }
      return target;
    });
    if (!result) {
      notFound(res);
      return;
    }
    sendJson(res, 200, { target: publicMonitoringTarget(result) });
    return;
  }

  if (method === 'GET' && pathname === '/api/monitoring/customers') {
    const authContext = await requirePermission(req, res, 'monitoring:read');
    if (!authContext) return;
    try {
      const [snmpPayload, sessionPayload] = await Promise.all([
        operations.mikrotikCustomerSummary(authContext.data.monitoringTargets || []),
        freeradiusSessions.activeSessions({ limit: 5000, allowCache: false }).catch((error) => ({
          ok: false,
          source: 'freeradius-radacct',
          rows: [],
          error: error.message || 'Session FreeRADIUS tidak bisa dibaca'
        }))
      ]);
      sendJson(res, 200, applyRadiusSessionsToMonitoringCustomers(authContext.data, snmpPayload, sessionPayload));
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        source: 'mikrotik-snmp+freeradius-radacct',
        error: error.message || 'Data pelanggan MikroTik tidak bisa dibaca via SNMP',
        summary: {
          online: 0,
          pppoe: 0,
          hotspot: 0,
          interfaceCount: 0,
          totalCustomerInterfaces: 0,
          upCount: 0,
          downCount: 0,
          siteCount: 0,
          customerMode: 'summary-and-per-site',
          onlineMeaning: 'pppoe-only',
          generatedAt: '',
          sourceMode: 'mikrotik-snmp+freeradius-radacct',
          sessionSource: 'freeradius-radacct',
          sessionError: error.message || 'Session FreeRADIUS tidak bisa dibaca'
        },
        sites: []
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/monitoring/services') {
    const authContext = await requirePermission(req, res, 'monitoring:read');
    if (!authContext) return;
    const services = await mediaServices.siteServicesStatus(
      authContext.data.settings,
      authContext.data.monitoringTargets || []
    );
    sendJson(res, 200, { services });
    return;
  }

  if (method === 'GET' && pathname === '/api/radius/ppp-dhcp') {
    const authContext = await requirePermission(req, res, 'radius:read');
    if (!authContext) return;
    if (!radiusSectionAllowedForUser(authContext.user, 'ppp-dhcp')) {
      forbidden(res);
      return;
    }
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    const result = await radiusPayloadLocal(authContext.data, 'ppp-dhcp', {
      tab: String(url.searchParams.get('tab') || 'users').trim(),
      page,
      limit,
      search: String(url.searchParams.get('search') || '').trim(),
      nas: String(url.searchParams.get('nas') || '').trim(),
      status: String(url.searchParams.get('status') || '').trim(),
      profile: String(url.searchParams.get('profile') || '').trim(),
      internet: String(url.searchParams.get('internet') || '').trim(),
      viewer: authContext.user
    });
    sendJson(res, 200, result);
    return;
  }

  if (method === 'GET' && pathname === '/api/radius/ppp-dhcp/users/template.xlsx') {
    const authContext = await requirePermission(req, res, 'radius:read');
    if (!authContext) return;
    if (!radiusSectionAllowedForUser(authContext.user, 'ppp-dhcp')) {
      forbidden(res);
      return;
    }
    sendBinary(
      res,
      200,
      await pppImportTemplateBuffer(),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'template-import-ppp-dhcp.xlsx'
    );
    return;
  }

  if (method === 'GET' && pathname === '/api/radius/ppp-dhcp/users/export.xlsx') {
    const authContext = await requirePermission(req, res, 'radius:read');
    if (!authContext) return;
    if (!radiusSectionAllowedForUser(authContext.user, 'ppp-dhcp')) {
      forbidden(res);
      return;
    }
    sendBinary(
      res,
      200,
      await workbookBuffer({ ppp_dhcp_users: pppExportRows(authContext.data) }),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      `export-ppp-dhcp-${localTodayIso()}.xlsx`
    );
    return;
  }

  if (method === 'POST' && pathname === '/api/radius/ppp-dhcp/users/import') {
    const authContext = await requirePermission(req, res, 'radius:write');
    if (!authContext) return;
    if (!radiusSectionAllowedForUser(authContext.user, 'ppp-dhcp')) {
      forbidden(res);
      return;
    }
    const payload = await readBody(req);
    try {
      const rows = await readWorkbookRowsFromBase64(payload.contentBase64 || payload.file || '');
      const { result } = await mutate(async (store) => {
        const summary = importPppUsers(store, rows, authContext.user);
        addActivity(store, 'monitoring', `Import PPP-DHCP: ${summary.created.length} baru, ${summary.updated.length} update, ${summary.errors.length} gagal`, {
          action: 'radius-ppp-import',
          created: summary.created.length,
          updated: summary.updated.length,
          errors: summary.errors.length
        });
        await syncFreeradiusIfNeeded(store, authContext.user, 'radius-ppp-import');
        return summary;
      });
      sendJson(res, 200, {
        ok: true,
        created: result.created.length,
        updated: result.updated.length,
        errors: result.errors
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Import PPP-DHCP gagal'
      });
    }
    return;
  }

  const radiusSessionDisconnectMatch = pathname.match(/^\/api\/radius\/(ppp-dhcp|hotspot)\/sessions\/disconnect$/);
  if (method === 'POST' && radiusSessionDisconnectMatch) {
    const authContext = await requirePermission(req, res, 'radius:write');
    if (!authContext) return;
    if (!radiusSectionAllowedForUser(authContext.user, radiusSessionDisconnectMatch[1])) {
      forbidden(res);
      return;
    }
    const payload = await readBody(req);
    const username = String(payload.username || '').trim();
    if (!username) {
      badRequest(res, 'Username session wajib diisi');
      return;
    }
    if (String(authContext.user.role || '') === 'reseller_voucher' && radiusSessionDisconnectMatch[1] === 'hotspot') {
      const existing = (authContext.data.radiusUsers || []).find((user) => {
        return user.serviceType === 'hotspot' && String(user.username || '').trim().toLowerCase() === username.toLowerCase();
      });
      if (!existing || !resellerHotspotVoucherRowVisible(existing, authContext.user)) {
        forbidden(res);
        return;
      }
    }
    try {
      const { result } = await mutate(async (store) => {
        const coa = await freeradiusCoa.disconnectUser(store, {
          username,
          nasId: payload.nasId || '',
          nas: payload.nas || payload.nasIpAddress || '',
          nasName: payload.nasName || payload.nas || '',
          nasIpAddress: payload.nasIpAddress || '',
          acctSessionId: payload.acctSessionId || payload.sessionId || '',
          sessionId: payload.sessionId || payload.acctSessionId || '',
          acctUniqueId: payload.acctUniqueId || '',
          framedIpAddress: payload.framedIpAddress || payload.ipAddress || '',
          ipAddress: payload.ipAddress || payload.framedIpAddress || '',
          callingStationId: payload.callingStationId || payload.macAddress || '',
          calledStationId: payload.calledStationId || '',
          nasPortId: payload.nasPortId || '',
          nasPortType: payload.nasPortType || ''
        });
        addActivity(store, 'monitoring', `Session Radius ${username} dikick oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'radius-session-disconnect',
          section: radiusSessionDisconnectMatch[1],
          username,
          nas: payload.nas || payload.nasIpAddress || '',
          ok: coa.ok === true
        });
        return coa;
      });
      sendJson(res, result.ok ? 200 : 400, {
        ok: result.ok === true,
        coa: result,
        message: result.ok ? 'Session berhasil dikick' : (result.error || 'Kick session gagal')
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Kick session gagal'
      });
    }
    return;
  }

  const radiusPppUserMatch = pathname.match(/^\/api\/radius\/ppp-dhcp\/users(?:\/([^/]+))?$/);
  if (radiusPppUserMatch && ['POST', 'PUT', 'DELETE'].includes(method)) {
    const authContext = await requireAnyPermission(req, res, ['radius:write', 'radius:ppp-users:write']);
    if (!authContext) return;
    if (!radiusSectionAllowedForUser(authContext.user, 'ppp-dhcp')) {
      forbidden(res);
      return;
    }
    const id = radiusPppUserMatch[1] ? decodeURIComponent(radiusPppUserMatch[1]) : '';
    const payload = method === 'DELETE' ? {} : await readBody(req);
    if (method !== 'POST' && !id) {
      badRequest(res, 'ID user PPP-DHCP tidak tersedia');
      return;
    }

    try {
      const { result, data } = await mutate(async (store) => {
        const existing = method === 'DELETE'
          ? (store.radiusUsers || []).find((user) => user.id === id)
          : method === 'PUT'
            ? (store.radiusUsers || []).find((user) => user.id === id)
            : null;
        if (existing && !resellerHotspotVoucherRowVisible(existing, authContext.user)) {
          throw new Error('Role user tidak memiliki akses ke voucher Hotspot ini');
        }
        const next = method === 'POST'
          ? freeradius.addRadiusUser(store, radiusUserPayload(payload, 'pppoe', store), authContext.user)
          : method === 'PUT'
            ? freeradius.updateRadiusUser(store, id, radiusUserPayload(payload, 'pppoe', store), authContext.user)
            : freeradius.deleteRadiusUser(store, id);
        let member = null;
        let invoice = null;
        let waQueued = null;
        let removedMember = null;
        let orphanMembers = [];
        let coa = null;
        if (method === 'POST' && payloadEnabled(payload.addToMember)) {
          if (!canCreateRadiusLinkedMember(authContext.user)) {
            throw new Error('Role user tidak memiliki akses membuat member');
          }
          member = radiusMemberFromPayload(store, payload, next, authContext.user);
          next.customerId = member.id;
          if (String(member.firstInvoiceStatus || member.initialInvoiceStatus || '').toLowerCase() === 'unpaid') {
            const created = createLocalManualInvoice(store, member, 1, authContext.user, {
              source: 'initial-unpaid',
              notes: 'Invoice awal pemasangan',
              activityLabel: 'Invoice awal',
              activityAction: 'initial-unpaid-invoice'
            });
            invoice = created.invoice;
            waQueued = created.queued;
          }
        }
        if (method === 'DELETE') {
          removedMember = deleteRadiusLinkedMember(store, next, authContext.user);
          orphanMembers = deleteOrphanRadiusMembers(store, authContext.user);
        } else {
          syncRadiusCustomerStatus(store, next);
        }
        const targetUsername = payload.username || url.searchParams.get('username') || next.username || id;
        addActivity(store, 'monitoring', `Radius PPP-DHCP user ${targetUsername || id} ${method === 'POST' ? 'ditambahkan' : method === 'PUT' ? 'diperbarui' : 'dihapus'} oleh ${authContext.user.name || authContext.user.username}`, {
          action: method === 'POST' ? 'radius-ppp-create' : method === 'PUT' ? 'radius-ppp-update' : 'radius-ppp-delete',
          radiusUserId: id || next.id || '',
          radiusUsername: targetUsername || ''
        });
        if (removedMember) {
          addActivity(store, 'customer', `Member ${removedMember.name || removedMember.username || targetUsername} dihapus bersama user PPP-DHCP oleh ${authContext.user.name || authContext.user.username}`, {
            action: 'radius-member-delete',
            radiusUserId: next.id || id || '',
            customerId: removedMember.id || '',
            radiusUsername: targetUsername || ''
          });
        }
        await syncFreeradiusIfNeeded(store, authContext.user, `radius-ppp-user-${method.toLowerCase()}`);
        if (method !== 'POST') {
          coa = await freeradiusCoa.disconnectUser(store, next);
        }
        return { user: next, member, invoice, waQueued, removedMember, orphanMembers, coa };
      });
      sendJson(res, 200, {
        ok: true,
        user: radiusUserRowsLocal(data, 'pppoe').find((row) => row.id === result.user?.id) || result.user,
        member: result.member || null,
        invoice: result.invoice || null,
        waQueued: result.waQueued || null,
        removedMember: result.removedMember || null,
        orphanMembers: result.orphanMembers || [],
        coa: result.coa || null
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Aksi user PPP-DHCP gagal'
      });
    }
    return;
  }

  const radiusPppProfileMatch = pathname.match(/^\/api\/radius\/ppp-dhcp\/profiles(?:\/([^/]+))?$/);
  if (radiusPppProfileMatch && ['POST', 'PUT', 'DELETE'].includes(method)) {
    const authContext = await requirePermission(req, res, 'radius:write');
    if (!authContext) return;
    if (!radiusSectionAllowedForUser(authContext.user, 'ppp-dhcp')) {
      forbidden(res);
      return;
    }
    const id = radiusPppProfileMatch[1] ? decodeURIComponent(radiusPppProfileMatch[1]) : '';
    const payload = method === 'DELETE' ? {} : await readBody(req);
    if (method !== 'POST' && !id) {
      badRequest(res, 'ID profile PPP-DHCP tidak tersedia');
      return;
    }
    try {
      const { result, data } = await mutate(async (store) => {
        const next = method === 'POST'
          ? freeradius.addProfile(store, radiusProfilePayload(payload, 'pppoe'), authContext.user)
          : method === 'PUT'
            ? freeradius.updateProfile(store, id, radiusProfilePayload(payload, 'pppoe'), authContext.user)
            : freeradius.deleteProfile(store, id);
        addActivity(store, 'monitoring', `Profile PPP-DHCP ${next.name || id} ${method === 'POST' ? 'ditambahkan' : method === 'PUT' ? 'diperbarui' : 'dihapus'} oleh ${authContext.user.name || authContext.user.username}`, {
          action: method === 'POST' ? 'radius-ppp-profile-create' : method === 'PUT' ? 'radius-ppp-profile-update' : 'radius-ppp-profile-delete',
          radiusProfileId: id || next.id || '',
          radiusProfileName: next.name || '',
          triggerCoa: next.triggerCoa === true
        });
        await syncFreeradiusIfNeeded(store, authContext.user, `radius-ppp-profile-${method.toLowerCase()}`);
        return next;
      });
      sendJson(res, 200, {
        ok: true,
        profile: radiusProfileRowsLocal(data, 'pppoe').find((row) => row.id === result.id) || result
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Aksi profile PPP-DHCP gagal'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/radius/hotspot') {
    const authContext = await requirePermission(req, res, 'radius:read');
    if (!authContext) return;
    const tab = String(url.searchParams.get('tab') || 'users').trim();
    if (tab === 'voucher-online') {
      if (String(authContext.user.role || '') === 'reseller_voucher') {
        forbidden(res);
        return;
      }
      sendJson(res, 200, publicHotspotVoucherOnlinePayload(authContext.data));
      return;
    }
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    const lockedNas = resolveUserLockedNas(authContext.data, authContext.user);
    const result = await radiusPayloadLocal(authContext.data, 'hotspot', {
      tab,
      page,
      limit,
      search: String(url.searchParams.get('search') || '').trim(),
      nas: lockedNas?.id || String(url.searchParams.get('nas') || '').trim(),
      status: String(url.searchParams.get('status') || '').trim(),
      profile: String(url.searchParams.get('profile') || '').trim(),
      internet: String(url.searchParams.get('internet') || '').trim(),
      viewer: authContext.user
    });
    sendJson(res, 200, result);
    return;
  }

  if (method === 'GET' && pathname === '/api/radius/hotspot/voucher-online') {
    const authContext = await requirePermission(req, res, 'radius:read');
    if (!authContext) return;
    if (String(authContext.user.role || '') === 'reseller_voucher') {
      forbidden(res);
      return;
    }
    sendJson(res, 200, publicHotspotVoucherOnlinePayload(authContext.data));
    return;
  }

  if (method === 'PUT' && pathname === '/api/radius/hotspot/voucher-online') {
    const authContext = await requirePermission(req, res, 'radius:write');
    if (!authContext) return;
    if (String(authContext.user.role || '') === 'reseller_voucher') {
      forbidden(res);
      return;
    }
    const payload = await readBody(req);
    try {
      const { data } = await mutate((store) => {
        store.settings = store.settings || {};
        store.settings.hotspotVoucherOnline = sanitizeHotspotVoucherOnlineSettings(payload, store.settings.hotspotVoucherOnline || {}, store);
        addActivity(store, 'monitoring', `Pengaturan voucher online Hotspot diperbarui oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'radius-hotspot-voucher-online-update',
          enabled: store.settings.hotspotVoucherOnline.enabled === true
        });
      });
      sendJson(res, 200, publicHotspotVoucherOnlinePayload(data));
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Pengaturan voucher online gagal disimpan'
      });
    }
    return;
  }

  const hotspotVoucherPaidMatch = pathname.match(/^\/api\/radius\/hotspot\/voucher-online\/orders\/([^/]+)\/paid$/);
  if (method === 'POST' && hotspotVoucherPaidMatch) {
    const authContext = await requirePermission(req, res, 'radius:write');
    if (!authContext) return;
    if (String(authContext.user.role || '') === 'reseller_voucher') {
      forbidden(res);
      return;
    }
    const payload = await readBody(req);
    try {
      const { result } = await mutate(async (store) => {
        const fulfilled = fulfillHotspotVoucherOrder(store, hotspotVoucherPaidMatch[1], {
          status: 'paid',
          paidAt: payload.paidAt || new Date().toISOString(),
          externalId: payload.externalId || ''
        }, authContext.user);
        addActivity(store, 'monitoring', `Voucher online ${fulfilled.order.reference} dikonfirmasi paid oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'hotspot-voucher-online-manual-paid',
          reference: fulfilled.order.reference,
          voucherCount: fulfilled.vouchers.length
        });
        await syncFreeradiusIfNeeded(store, authContext.user, 'hotspot-voucher-online-manual-paid');
        return fulfilled;
      });
      sendJson(res, 200, {
        ok: true,
        order: result.order,
        vouchers: result.vouchers
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Konfirmasi paid voucher gagal'
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/radius/hotspot/users/generate') {
    const authContext = await requirePermission(req, res, 'radius:write');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { result, data } = await mutate(async (store) => {
        const generated = generateHotspotVouchers(store, applyResellerVoucherNasLock(store, payload, authContext.user), authContext.user);
        addActivity(store, 'monitoring', `Generate ${generated.created.length} voucher Hotspot oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'radius-hotspot-voucher-generate',
          batchId: generated.batchId,
          created: generated.created.length
        });
        await syncFreeradiusIfNeeded(store, authContext.user, 'radius-hotspot-voucher-generate');
        return generated;
      });
      const rows = radiusUserRowsLocal(data, 'hotspot').filter((row) => result.created.some((user) => user.id === row.id));
      sendJson(res, 200, {
        ok: true,
        batchId: result.batchId,
        created: result.created.length,
        vouchers: rows
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Generate voucher Hotspot gagal'
      });
    }
    return;
  }

  const radiusHotspotUserMatch = pathname.match(/^\/api\/radius\/hotspot\/users(?:\/([^/]+))?$/);
  if (radiusHotspotUserMatch && ['POST', 'PUT', 'DELETE'].includes(method)) {
    const authContext = await requireAnyPermission(req, res, ['radius:write', 'radius:hotspot-free:write']);
    if (!authContext) return;
    const id = radiusHotspotUserMatch[1] ? decodeURIComponent(radiusHotspotUserMatch[1]) : '';
    const payload = method === 'DELETE' ? {} : await readBody(req);
    if (method !== 'POST' && !id) {
      badRequest(res, 'ID user Hotspot tidak tersedia');
      return;
    }

    try {
      const { result, data } = await mutate(async (store) => {
        const existing = ['PUT', 'DELETE'].includes(method)
          ? (store.radiusUsers || []).find((user) => user.id === id)
          : null;
        if (existing && !resellerHotspotVoucherRowVisible(existing, authContext.user)) {
          throw new Error('Role user tidak memiliki akses ke voucher Hotspot ini');
        }
        if (!canManageHotspotUser(authContext.user, existing)) {
          throw new Error('Teknisi hanya bisa mengelola user Hotspot Free manual');
        }
        const rolePayload = auth.hasPermission(authContext.user, 'radius:write')
          ? payload
          : hotspotFreeUserPayload(payload);
        const lockedPayload = method === 'DELETE'
          ? rolePayload
          : applyResellerVoucherNasLock(store, rolePayload, authContext.user);
        const next = method === 'POST'
          ? freeradius.addRadiusUser(store, radiusUserPayload(lockedPayload, 'hotspot', store), authContext.user)
          : method === 'PUT'
            ? freeradius.updateRadiusUser(store, id, radiusUserPayload(lockedPayload, 'hotspot', store), authContext.user)
            : freeradius.deleteRadiusUser(store, id);
        let coa = null;
        let removedMember = null;
        let orphanMembers = [];
        const targetUsername = payload.username || url.searchParams.get('username') || next.username || id;
        if (method === 'DELETE') {
          removedMember = deleteRadiusLinkedMember(store, next, authContext.user);
          orphanMembers = deleteOrphanRadiusMembers(store, authContext.user);
        } else {
          syncRadiusCustomerStatus(store, next);
        }
        addActivity(store, 'monitoring', `Radius Hotspot user ${targetUsername || id} ${method === 'POST' ? 'ditambahkan' : method === 'PUT' ? 'diperbarui' : 'dihapus'} oleh ${authContext.user.name || authContext.user.username}`, {
          action: method === 'POST' ? 'radius-hotspot-create' : method === 'PUT' ? 'radius-hotspot-update' : 'radius-hotspot-delete',
          radiusUserId: id || next.id || '',
          radiusUsername: targetUsername || ''
        });
        await syncFreeradiusIfNeeded(store, authContext.user, `radius-hotspot-user-${method.toLowerCase()}`);
        if (method !== 'POST') {
          coa = await freeradiusCoa.disconnectUser(store, next);
        }
        return { user: next, coa, removedMember, orphanMembers };
      });
      sendJson(res, 200, {
        ok: true,
        user: radiusUserRowsLocal(data, 'hotspot').find((row) => row.id === result.user?.id) || result.user,
        removedMember: result.removedMember || null,
        orphanMembers: result.orphanMembers || [],
        coa: result.coa || null
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Aksi user Hotspot gagal'
      });
    }
    return;
  }

  const radiusHotspotProfileMatch = pathname.match(/^\/api\/radius\/hotspot\/profiles(?:\/([^/]+))?$/);
  if (radiusHotspotProfileMatch && ['POST', 'PUT', 'DELETE'].includes(method)) {
    const authContext = await requirePermission(req, res, 'radius:write');
    if (!authContext) return;
    const id = radiusHotspotProfileMatch[1] ? decodeURIComponent(radiusHotspotProfileMatch[1]) : '';
    const payload = method === 'DELETE' ? {} : await readBody(req);
    if (method !== 'POST' && !id) {
      badRequest(res, 'ID profile Hotspot tidak tersedia');
      return;
    }
    try {
      const { result, data } = await mutate(async (store) => {
        const next = method === 'POST'
          ? freeradius.addProfile(store, radiusProfilePayload(payload, 'hotspot'), authContext.user)
          : method === 'PUT'
            ? freeradius.updateProfile(store, id, radiusProfilePayload(payload, 'hotspot'), authContext.user)
            : freeradius.deleteProfile(store, id);
        addActivity(store, 'monitoring', `Profile Hotspot ${next.name || id} ${method === 'POST' ? 'ditambahkan' : method === 'PUT' ? 'diperbarui' : 'dihapus'} oleh ${authContext.user.name || authContext.user.username}`, {
          action: method === 'POST' ? 'radius-hotspot-profile-create' : method === 'PUT' ? 'radius-hotspot-profile-update' : 'radius-hotspot-profile-delete',
          radiusProfileId: id || next.id || '',
          radiusProfileName: next.name || '',
          triggerCoa: next.triggerCoa === true
        });
        await syncFreeradiusIfNeeded(store, authContext.user, `radius-hotspot-profile-${method.toLowerCase()}`);
        return next;
      });
      sendJson(res, 200, {
        ok: true,
        profile: radiusProfileRowsLocal(data, 'hotspot').find((row) => row.id === result.id) || result
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Aksi profile Hotspot gagal'
      });
    }
    return;
  }

  const radiusHotspotTemplateMatch = pathname.match(/^\/api\/radius\/hotspot\/templates(?:\/([^/]+))?$/);
  if (radiusHotspotTemplateMatch && ['POST', 'PUT', 'DELETE'].includes(method)) {
    const authContext = await requirePermission(req, res, 'radius:write');
    if (!authContext) return;
    const id = radiusHotspotTemplateMatch[1] ? decodeURIComponent(radiusHotspotTemplateMatch[1]) : '';
    const payload = method === 'DELETE' ? {} : await readBody(req);
    if (method !== 'POST' && !id) {
      badRequest(res, 'ID template voucher tidak tersedia');
      return;
    }
    try {
      const { result, data } = await mutate((store) => {
        const next = method === 'DELETE'
          ? deleteHotspotVoucherTemplate(store, id)
          : upsertHotspotVoucherTemplate(store, id, payload, authContext.user);
        addActivity(store, 'monitoring', `Template voucher Hotspot ${next.name || id} ${method === 'POST' ? 'ditambahkan' : method === 'PUT' ? 'diperbarui' : 'dihapus'} oleh ${authContext.user.name || authContext.user.username}`, {
          action: method === 'POST' ? 'radius-hotspot-template-create' : method === 'PUT' ? 'radius-hotspot-template-update' : 'radius-hotspot-template-delete',
          templateId: next.id || id || '',
          templateName: next.name || ''
        });
        return next;
      });
      sendJson(res, 200, {
        ok: true,
        template: radiusTemplateRowsLocal(data).find((row) => row.id === result.id) || result
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Aksi template voucher gagal'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/radius/settings') {
    const authContext = await requirePermission(req, res, 'radius:read');
    if (!authContext) return;
    if (!radiusSectionAllowedForUser(authContext.user, 'settings')) {
      forbidden(res);
      return;
    }
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    const rows = radiusFilterRows(radiusNasRowsLocal(authContext.data), {
      search: String(url.searchParams.get('search') || '').trim()
    });
    const paged = radiusPagination(rows, page, limit);
    sendJson(res, 200, {
      ok: true,
      source: 'local',
      section: 'settings',
      rows: paged.rows,
      radius: authContext.data.settings?.radius || {},
      sync: freeradiusSql.status(authContext.data),
      pagination: paged.pagination,
      checkedAt: new Date().toISOString()
    });
    return;
  }

  if (method === 'PUT' && pathname === '/api/radius/settings') {
    const authContext = await requirePermission(req, res, 'settings:write');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { data } = await mutate(async (store) => {
        store.settings = store.settings || {};
        store.settings.radius = sanitizeRadiusSettings(payload.radius || payload, store.settings.radius || {});
        addActivity(store, 'settings', `Pengaturan isolir Radius diperbarui oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'radius-settings-update'
        });
        await syncFreeradiusIfNeeded(store, authContext.user, 'radius-settings-update');
      });
      sendJson(res, 200, {
        ok: true,
        radius: data.settings.radius || {},
        sync: freeradiusSql.status(data)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Pengaturan Radius gagal disimpan'
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/radius/sync') {
    const authContext = await requirePermission(req, res, 'settings:write');
    if (!authContext) return;
    try {
      const { data, result } = await mutate(async (store) => {
        const sync = await freeradiusSql.syncAll(store, {
          actor: authContext.user,
          action: 'radius-sync-manual'
        });
        addActivity(store, 'settings', `FreeRADIUS disinkron manual oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'radius-sync-manual',
          rowCounts: sync.rowCounts || {}
        });
        return sync;
      });
      sendJson(res, 200, {
        ok: true,
        sync: result.status || freeradiusSql.status(data)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Sinkron FreeRADIUS gagal'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/monitoring/billing-unpaid') {
    const authContext = await requirePermission(req, res, 'billing-monitor:read');
    if (!authContext) return;
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    const status = String(url.searchParams.get('status') || 'all').trim().toLowerCase();
    const customerStatus = String(url.searchParams.get('customerStatus') || 'all').trim().toLowerCase();
    const site = String(url.searchParams.get('site') || 'all').trim();
    const period = url.searchParams.get('period') || currentPeriod();
    const search = String(url.searchParams.get('search') || '').trim();
    const billingSites = (authContext.data.monitoringTargets || [])
      .filter((target) => target.status !== 'inactive')
      .map((target) => ({
        id: target.id,
        name: target.name,
        location: target.location
      }));
    if (standaloneMode(authContext.data)) {
      const local = localBillingMonitorPayload(authContext.data, {
        status,
        customerStatus,
        site,
        period,
        search
      });
      const pagination = paginationPayload(page, limit, local.rows.length);
      const offset = (pagination.page - 1) * limit;
      sendJson(res, 200, {
        ok: true,
        source: 'local',
        sites: local.sites.length ? local.sites : billingSites,
        summary: local.summary,
        invoices: local.rows.slice(offset, offset + limit),
        pagination,
        checkedAt: new Date().toISOString()
      });
      return;
    }

    const radbooxInfo = radboox.status(authContext.data.settings);
    if (!radbooxInfo.credentialReady) {
      sendJson(res, 200, {
        ok: false,
        source: 'radboox',
        error: 'Kredensial Radboox belum tersedia.',
        sites: billingSites,
        summary: {},
        invoices: [],
        pagination: { page: 1, limit, total: 0, totalPages: 1, hasPrev: false, hasNext: false }
      });
      return;
    }

    try {
      const payload = await radboox.invoiceMonitorStatus(authContext.data.settings, {
        status,
        customerStatus,
        site,
        period,
        sites: billingSites,
        search,
        page,
        limit,
        refresh: truthyQuery(url.searchParams.get('refresh'))
      });
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        source: 'radboox',
        error: error.message || 'Data tagihan Radboox tidak bisa dibaca.',
        sites: billingSites,
        summary: {},
        invoices: [],
        pagination: { page: 1, limit, total: 0, totalPages: 1, hasPrev: false, hasNext: false }
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/monitoring/billing-reminder') {
    const authContext = await requirePermission(req, res, 'billing-monitor:read');
    if (!authContext) return;
    const payload = await readBody(req);
    const invoiceId = String(payload.invoiceId || payload.id || payload.radbooxInvoiceId || payload.reminderId || '').trim();
    const invoiceNo = String(payload.invoiceNo || '').trim();
    const customerName = String(payload.customerName || '').trim();
    if (!invoiceId) {
      badRequest(res, 'ID invoice tidak tersedia untuk kirim reminder');
      return;
    }

    if (standaloneMode(authContext.data)) {
      const invoice = (authContext.data.invoices || []).find((item) => item.id === invoiceId
        || item.externalId === invoiceId
        || item.invoiceNo === invoiceId
        || displayBillingInvoiceNo(item.externalId || item.invoiceNo || item.id) === invoiceId);
      if (!invoice) {
        badRequest(res, 'Invoice tidak ditemukan untuk reminder');
        return;
      }
      const customer = (authContext.data.customers || []).find((item) => item.id === invoice.customerId) || {};
      const localPhone = normalizeLocalPhone(customer.phone || customer.whatsapp || '');
      const waPhone = normalizeWaPhone(localPhone);
      const settings = authContext.data.settings?.waGateway || {};
      const invoiceNumber = displayBillingInvoiceNo(invoice.externalId || invoice.invoiceNo || invoice.id);
      const values = invoiceWaTemplateValues(authContext.data, invoice);
      const message = renderWaTemplate(settings.templates?.paymentReminder, values) || `Halo ${values.fullname}, tagihan internet ${values.period} sebesar ${values.total || values.amount} jatuh tempo ${values.due_date}. No invoice ${values.no_invoice}.`;
      const { result } = await mutate((data) => {
        const queued = queueWaGatewayMessage(data, {
          type: 'paymentReminder',
          phone: localPhone,
          recipientName: values.fullname,
          invoiceId: invoice.id,
          invoiceNo: invoiceNumber,
          text: message,
          actorName: authContext.user.name || authContext.user.username
        });
        addActivity(data, 'monitoring', `Reminder WA invoice ${invoiceNumber} disiapkan`, {
          invoiceId: invoice.id,
          customerName: customer.name || invoice.customerName || ''
        });
        return queued;
      });
      sendJson(res, 200, {
        ok: true,
        source: 'standalone',
        mode: result.status,
        invoiceId: invoice.id,
        invoiceNo: invoiceNumber,
        phone: localPhone,
        message,
        url: waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}` : '',
        queued: result
      });
      return;
    }

    try {
      const result = await radboox.sendInvoiceReminder(authContext.data.settings, {
        invoiceId,
        invoiceNo,
        customerName
      });
      await mutate((data) => {
        addActivity(
          data,
          'monitoring',
          `Reminder WA invoice ${invoiceNo || invoiceId} dikirim via Radboox${customerName ? ` untuk ${customerName}` : ''}`,
          { invoiceId, invoiceNo, customerName, mode: result.mode }
        );
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'Reminder WA Radboox gagal dikirim'
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/monitoring/billing-action') {
    const authContext = await requirePermission(req, res, 'invoices:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    const action = String(payload.action || '').trim().toLowerCase();
    const invoiceNo = String(payload.invoiceNo || payload.externalId || '').trim();
    const customerName = String(payload.customerName || '').trim();
    if (!invoiceNo) {
      badRequest(res, 'Nomor invoice tidak tersedia');
      return;
    }
    if (!['pay', 'rollback'].includes(action)) {
      badRequest(res, 'Aksi invoice tidak valid');
      return;
    }

    if (standaloneMode(authContext.data)) {
      const result = await mutate((data) => {
        const invoice = (data.invoices || []).find((item) => {
          return item.id === invoiceNo
            || item.externalId === invoiceNo
            || item.invoiceNo === invoiceNo
            || displayBillingInvoiceNo(item.externalId || item.invoiceNo || item.id) === invoiceNo;
        });
        if (!invoice) {
          throw new Error('Invoice tidak ditemukan');
        }
        if (action === 'pay') {
          const paid = markInvoicePaid(data, invoice.id, {
            paymentMethod: payload.paymentMethod || payload.method || 'Tunai',
            amount: payload.amount || invoice.amount,
            notes: payload.notes || `Dibayar oleh ${authContext.user.name || authContext.user.username}`,
            ...actorPayload(authContext.user)
          });
          if (paid) {
            queueInvoiceWaMessage(data, paid, 'paymentPaid', authContext.user);
            const activation = reactivateCustomerAfterPaidInvoice(data, paid, authContext.user);
            if (activation.activatedUser) {
              queueInvoiceWaMessage(data, paid, 'accountActive', authContext.user);
            } else if (activation.requiresAdmin) {
              addActivity(data, 'invoice', `Pembayaran ${paid.customerName || paid.username || paid.invoiceNo} tercatat, aktivasi pelanggan terminated menunggu validasi admin`, {
                action: 'terminated-payment-awaiting-admin',
                invoiceId: paid.id,
                customerId: activation.customer?.id || paid.customerId || '',
                source: activation.source || 'manual'
              });
            }
          }
          return paid;
        }
        const rollback = markInvoiceUnpaid(data, invoice.id);
        if (rollback) queueInvoiceWaMessage(data, rollback, 'paymentCancel', authContext.user);
        return rollback;
      }).catch((error) => ({ error }));

      if (result.error) {
        badRequest(res, result.error.message || 'Aksi invoice gagal');
        return;
      }

      sendJson(res, 200, {
        ok: true,
        source: 'standalone',
        invoice: result.result,
        invoiceNo,
        message: action === 'pay' ? 'Invoice ditandai lunas' : 'Invoice dikembalikan ke belum bayar'
      });
      return;
    }

    let credentials;
    try {
      credentials = radbooxActionCredentials(authContext);
    } catch (error) {
      badRequest(res, error.message || 'Kredensial Radboox user tidak tersedia');
      return;
    }

    try {
      const runtime = {
        invoiceNo,
        customerName,
        paymentMethod: payload.paymentMethod || payload.method || '1',
        username: credentials.username,
        password: credentials.password,
        mode: 'web',
        forceSession: true,
        cache: false
      };
      const result = action === 'pay'
        ? await radboox.payInvoice(authContext.data.settings, runtime)
        : await radboox.rollbackInvoice(authContext.data.settings, runtime);
      await mutate((data) => {
        addActivity(
          data,
          'monitoring',
          action === 'pay'
            ? `Invoice ${result.invoiceNo || invoiceNo} dibayar via Radboox oleh ${credentials.username}${customerName ? ` untuk ${customerName}` : ''}`
            : `Invoice ${result.invoiceNo || invoiceNo} di-rollback via Radboox oleh ${credentials.username}${customerName ? ` untuk ${customerName}` : ''}`,
          {
            action,
            invoiceNo: result.invoiceNo || invoiceNo,
            invoiceId: result.invoiceId || '',
            customerName,
            radbooxUsername: credentials.username,
            paymentMethod: result.paymentMethodLabel || result.paymentMethod || ''
          }
        );
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, Number(error.status) === 501 ? 501 : 502, {
        ok: false,
        error: error.message || 'Aksi invoice Radboox gagal dijalankan',
        code: error.code || ''
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/monitoring/members') {
    const authContext = await requireAnyPermission(req, res, ['billing-monitor:read', 'members:read']);
    if (!authContext) return;
    if (standaloneMode(authContext.data)) {
      const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
      const status = String(url.searchParams.get('status') || 'all').trim().toLowerCase();
      const paymentType = String(url.searchParams.get('paymentType') || 'all').trim().toLowerCase();
      const billingPeriod = String(url.searchParams.get('billingPeriod') || 'all').trim().toLowerCase();
      const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
      const resolver = radiusStatusResolver(authContext.data);
      let members = (authContext.data.customers || []).map((customer) => ({
        id: customer.id,
        memberId: customer.id,
        userId: customer.code || customer.username || customer.id,
        accountId: customer.code || customer.username || '',
        internet: customer.username || '',
        username: customer.username || '',
        fullName: customer.name || customer.customerName || customer.username || '',
        customerName: customer.name || customer.customerName || '',
        whatsapp: normalizeLocalPhone(customer.whatsapp || customer.phone || ''),
        phone: normalizeLocalPhone(customer.phone || customer.whatsapp || ''),
        email: customer.email || '',
        ktp: customer.ktp || customer.idCard || '',
        address: customer.address || '',
        latitude: customer.latitude || '',
        longitude: customer.longitude || '',
        locationAccuracy: customer.locationAccuracy || '',
        locationUrl: customer.locationUrl || (customer.latitude && customer.longitude ? `https://www.google.com/maps?q=${encodeURIComponent(`${customer.latitude},${customer.longitude}`)}` : ''),
        housePhotoUrl: customer.housePhotoUrl || customer.memberHousePhotoUrl || '',
        status: resolver.statusForCustomer(customer),
        paymentType: customer.paymentType || 'postpaid',
        billingPeriod: customer.billingPeriod || 'fixed',
        activeDate: customer.activeDate || customer.createdAt || '',
        nextDue: customer.nextDue || customer.dueDate || '',
        dueDate: customer.dueDate || customer.nextDue || '',
        price: Number(customer.price || customer.amount || 0),
        ppn: customer.ppn || '',
        discount: customer.discount || '',
        packageName: customer.packageName || ''
      }));
      if (status !== 'all') {
        members = members.filter((member) => member.status === normalizeCustomerStatusLocal(status));
      }
      if (paymentType !== 'all') {
        members = members.filter((member) => String(member.paymentType || '').toLowerCase() === paymentType);
      }
      if (billingPeriod !== 'all') {
        members = members.filter((member) => String(member.billingPeriod || '').toLowerCase() === billingPeriod);
      }
      if (search) {
        members = members.filter((member) => [
          member.fullName,
          member.customerName,
          member.userId,
          member.accountId,
          member.internet,
          member.whatsapp,
          member.phone,
          member.email,
          member.ktp,
          member.address,
          member.latitude,
          member.longitude
        ].some((value) => String(value || '').toLowerCase().includes(search)));
      }
      const totalRows = members.length;
      const totalPages = Math.max(1, Math.ceil(totalRows / limit));
      const currentPage = Math.min(page, totalPages);
      const offset = (currentPage - 1) * limit;
      sendJson(res, 200, {
        ok: true,
        source: 'local',
        members: members.slice(offset, offset + limit),
        summary: localMemberSummaryRows(authContext.data),
        pagination: {
          page: currentPage,
          limit,
          total: totalRows,
          totalPages,
          hasPrev: currentPage > 1,
          hasNext: currentPage < totalPages
        },
        checkedAt: new Date().toISOString()
      });
      return;
    }
    try {
      const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
      const rawLimit = String(url.searchParams.get('limit') || '').trim().toLowerCase();
      const limit = rawLimit === 'all'
        ? 100
        : Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 10) || 10));
      const result = await radboox.listBillingMembers(authContext.data.settings, {
        page,
        limit,
        search: url.searchParams.get('search') || '',
        status: url.searchParams.get('status') || '',
        paymentType: url.searchParams.get('paymentType') || '',
        billingPeriod: url.searchParams.get('billingPeriod') || '',
        mode: 'web',
        cache: false
      });
      sendJson(res, 200, {
        ok: true,
        members: result.members,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.totalRows,
          totalPages: Math.max(1, Math.ceil(Number(result.totalRows || 0) / result.limit)),
          hasPrev: result.page > 1,
          hasNext: result.page < Math.max(1, Math.ceil(Number(result.totalRows || 0) / result.limit))
        },
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error.message || 'Member Radboox tidak bisa dibaca',
        members: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasPrev: false, hasNext: false },
        checkedAt: new Date().toISOString()
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/monitoring/member-detail') {
    const authContext = await requireAnyPermission(req, res, ['billing-monitor:read', 'members:read']);
    if (!authContext) return;
    const memberId = String(url.searchParams.get('memberId') || url.searchParams.get('id') || '').trim();
    const section = String(url.searchParams.get('section') || 'all').trim().toLowerCase();
    const period = normalizePeriod(url.searchParams.get('period') || currentPeriod());
    if (!memberId) {
      badRequest(res, 'ID member tidak tersedia');
      return;
    }
    if (standaloneMode(authContext.data)) {
      const customer = (authContext.data.customers || []).find((item) => item.id === memberId);
      if (!customer) {
        notFound(res);
        return;
      }
      const radiusUser = (authContext.data.radiusUsers || []).find((user) => {
        return user.customerId === customer.id
          || String(user.username || '').trim().toLowerCase() === String(customer.username || '').trim().toLowerCase();
      }) || {};
      const profile = radiusFindProfile(authContext.data, radiusUser.profileId || customer.packageName, radiusUser.serviceType || 'pppoe') || {};
      const nas = radiusFindNas(authContext.data, radiusUser.nasId || customer.nas || customer.siteName) || {};
      const invoices = (authContext.data.invoices || [])
        .filter((invoice) => invoice.customerId === customer.id
          || String(invoice.username || '').trim().toLowerCase() === String(customer.username || '').trim().toLowerCase()
          || String(invoice.accountId || '').trim().toLowerCase() === String(customer.code || customer.accountId || '').trim().toLowerCase())
        .sort((a, b) => String(b.dueDate || b.invoiceDate || b.createdAt || '').localeCompare(String(a.dueDate || a.invoiceDate || a.createdAt || '')))
        .slice(0, 12)
        .map((invoice) => ({
          id: invoice.id || '',
          invoiceNo: invoice.invoiceNo || invoice.externalId || '',
          externalId: invoice.externalId || invoice.invoiceNo || '',
          amount: Number(invoice.total || invoice.totalAmount || invoice.amount || 0),
          dueDate: invoice.dueDate || '',
          invoiceDate: invoice.invoiceDate || invoice.date || '',
          status: invoiceRuntimeStatus(invoice),
          paymentMethod: invoice.paymentMethod || invoice.method || '',
          paidAt: invoice.paidAt || '',
          customerName: invoice.customerName || customer.name || '',
          username: invoice.username || customer.username || '',
          accountId: invoice.accountId || customer.code || customer.accountId || ''
        }));
      const contact = {
        fullName: customer.name || customer.customerName || '',
        whatsapp: normalizeLocalPhone(customer.whatsapp || customer.phone || ''),
        phone: normalizeLocalPhone(customer.phone || customer.whatsapp || ''),
        email: customer.email || '',
        ktp: customer.ktp || customer.idCard || '',
        address: customer.address || '',
        latitude: customer.latitude || '',
        longitude: customer.longitude || '',
        locationAccuracy: customer.locationAccuracy || '',
        locationUrl: customer.locationUrl || (customer.latitude && customer.longitude ? `https://www.google.com/maps?q=${encodeURIComponent(`${customer.latitude},${customer.longitude}`)}` : ''),
        housePhotoUrl: customer.housePhotoUrl || customer.memberHousePhotoUrl || ''
      };
      const payment = {
        paymentType: customer.paymentType || 'postpaid',
        billingPeriod: customer.billingPeriod || 'fixed',
        nextDue: customer.nextDue || customer.dueDate || '',
        dueDate: customer.dueDate || customer.nextDue || '',
        price: Number(customer.price || customer.amount || 0),
        ppn: customer.ppn || '',
        discount: customer.discount || ''
      };
      const internet = {
        username: radiusUser.username || customer.username || '',
        serviceType: radiusUser.serviceType || 'pppoe',
        accessType: radiusUser.accessType || '',
        profile: profile.name || customer.packageName || '',
        nas: nas.name || customer.nas || customer.siteName || '',
        ipAddress: radiusUser.staticIp || '',
        macAddress: radiusUser.callerId || '',
        status: radiusUser.status || customer.status || '',
        activeDate: customer.activeDate || ''
      };
      const usage = section === 'contact' || section === 'payment'
        ? null
        : await radiusUsageDetailForUsername(internet.username || customer.username || '', period, 40);
      sendJson(res, 200, {
        ok: true,
        source: 'local',
        memberId,
        period,
        contact: section === 'payment' ? null : contact,
        payment: section === 'contact' ? null : payment,
        internet,
        usage,
        invoices,
        checkedAt: new Date().toISOString()
      });
      return;
    }
    try {
      const runtime = {
        memberId,
        mode: 'web',
        cache: false
      };
      const [contact, payment] = await Promise.all([
        section === 'payment' ? Promise.resolve(null) : radboox.getBillingMemberContactDetail(authContext.data.settings, runtime),
        section === 'contact' ? Promise.resolve(null) : radboox.getBillingMemberPaymentDetail(authContext.data.settings, runtime)
      ]);
      sendJson(res, 200, {
        ok: true,
        memberId,
        contact: contact ? contact.contact : null,
        payment: payment ? payment.payment : null,
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'Detail member Radboox tidak bisa dibaca'
      });
    }
    return;
  }

  if (method === 'PUT' && pathname === '/api/monitoring/member-contact') {
    const authContext = await requireAnyPermission(req, res, ['customers:manage', 'members:contact:write']);
    if (!authContext) return;
    const payload = await readBody(req);
    const memberId = String(payload.memberId || payload.id || '').trim();
    if (!memberId) {
      badRequest(res, 'ID member tidak tersedia');
      return;
    }
    if (standaloneMode(authContext.data)) {
      try {
        const { result } = await mutate((data) => {
          const customer = (data.customers || []).find((item) => item.id === memberId);
          if (!customer) {
            throw new Error('Member tidak ditemukan');
          }
          customer.name = String(payload.fullName || payload.name || customer.name || '').trim();
          customer.customerName = customer.name;
          customer.phone = normalizeLocalPhone(payload.whatsapp || payload.phone || customer.phone || '');
          customer.whatsapp = customer.phone;
          customer.email = String(payload.email || '').trim();
          customer.ktp = String(payload.ktp || payload.idCard || '').trim();
          customer.address = String(payload.address || '').trim();
          customer.latitude = String(payload.latitude || payload.memberLatitude || '').trim();
          customer.longitude = String(payload.longitude || payload.memberLongitude || '').trim();
          customer.locationAccuracy = String(payload.locationAccuracy || payload.memberLocationAccuracy || '').trim();
          customer.locationUrl = customer.latitude && customer.longitude ? `https://www.google.com/maps?q=${encodeURIComponent(`${customer.latitude},${customer.longitude}`)}` : '';
          if (typeof payload.housePhotoUrl === 'string' || typeof payload.memberHousePhotoUrl === 'string') {
            customer.housePhotoUrl = String(payload.housePhotoUrl || payload.memberHousePhotoUrl || '').trim();
          }
          customer.updatedAt = new Date().toISOString();
          customer.updatedBy = authContext.user.name || authContext.user.username;
          addActivity(data, 'monitoring', `Contact member ${customer.name || customer.username || memberId} diperbarui oleh ${authContext.user.name || authContext.user.username}`, {
            action: 'member-contact-update',
            memberId
          });
          return customer;
        });
        sendJson(res, 200, { ok: true, source: 'local', contact: result, message: 'Contact detail berhasil diperbarui' });
      } catch (error) {
        badRequest(res, error.message || 'Contact detail gagal diperbarui');
      }
      return;
    }
    let credentials;
    try {
      credentials = radbooxActionCredentials(authContext);
    } catch (error) {
      badRequest(res, error.message || 'Kredensial Radboox user tidak tersedia');
      return;
    }

    try {
      const result = await radboox.updateBillingMemberContactDetail(authContext.data.settings, {
        ...payload,
        memberId,
        username: credentials.username,
        password: credentials.password,
        mode: 'web',
        forceSession: true,
        cache: false
      });
      await mutate((data) => {
        addActivity(data, 'monitoring', `Contact detail member Radboox ${memberId} diperbarui oleh ${credentials.username}`, {
          action: 'member-contact-update',
          memberId,
          radbooxUsername: credentials.username
        });
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'Contact detail member Radboox gagal diperbarui'
      });
    }
    return;
  }

  if (method === 'PUT' && pathname === '/api/monitoring/member-payment') {
    const authContext = await requirePermission(req, res, 'customers:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    const memberId = String(payload.memberId || payload.id || '').trim();
    if (!memberId) {
      badRequest(res, 'ID member tidak tersedia');
      return;
    }
    if (standaloneMode(authContext.data)) {
      try {
        const { result } = await mutate((data) => {
          const customer = (data.customers || []).find((item) => item.id === memberId);
          if (!customer) {
            throw new Error('Member tidak ditemukan');
          }
          customer.paymentType = String(payload.paymentType || customer.paymentType || 'postpaid').trim();
          customer.billingPeriod = String(payload.billingPeriod || customer.billingPeriod || 'fixed').trim();
          customer.nextDue = String(payload.nextDue || payload.dueDate || customer.nextDue || customer.dueDate || '').trim();
          customer.dueDate = customer.nextDue;
          customer.ppn = String(payload.ppn || '').trim();
          customer.discount = String(payload.discount || '').trim();
          customer.updatedAt = new Date().toISOString();
          customer.updatedBy = authContext.user.name || authContext.user.username;
          addActivity(data, 'monitoring', `Payment member ${customer.name || customer.username || memberId} diperbarui oleh ${authContext.user.name || authContext.user.username}`, {
            action: 'member-payment-update',
            memberId
          });
          return customer;
        });
        sendJson(res, 200, { ok: true, source: 'local', payment: result, message: 'Payment detail berhasil diperbarui' });
      } catch (error) {
        badRequest(res, error.message || 'Payment detail gagal diperbarui');
      }
      return;
    }
    let credentials;
    try {
      credentials = radbooxActionCredentials(authContext);
    } catch (error) {
      badRequest(res, error.message || 'Kredensial Radboox user tidak tersedia');
      return;
    }

    try {
      const result = await radboox.updateBillingMemberPaymentDetail(authContext.data.settings, {
        ...payload,
        memberId,
        username: credentials.username,
        password: credentials.password,
        mode: 'web',
        forceSession: true,
        cache: false
      });
      await mutate((data) => {
        addActivity(data, 'monitoring', `Payment detail member Radboox ${memberId} diperbarui oleh ${credentials.username}`, {
          action: 'member-payment-update',
          memberId,
          radbooxUsername: credentials.username
        });
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'Payment detail member Radboox gagal diperbarui'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/monitoring/billing-manual-invoice/members') {
    const authContext = await requirePermission(req, res, 'billing-monitor:read');
    if (!authContext) return;
    if (standaloneMode(authContext.data)) {
      const result = localManualInvoiceMembers(authContext.data, {
        page: url.searchParams.get('page') || '1',
        limit: url.searchParams.get('limit') || '5',
        search: url.searchParams.get('search') || ''
      });
      sendJson(res, 200, {
        ok: true,
        source: 'standalone',
        members: result.members,
        pagination: result.pagination
      });
      return;
    }
    if (!auth.hasPermission(authContext.user, 'radboox:sync')) {
      forbidden(res);
      return;
    }
    let credentials;
    try {
      credentials = radbooxActionCredentials(authContext);
    } catch (error) {
      badRequest(res, error.message || 'Kredensial Radboox user tidak tersedia');
      return;
    }

    try {
      const page = Math.max(1, Number(url.searchParams.get('page') || 1) || 1);
      const limit = Math.max(1, Math.min(25, Number(url.searchParams.get('limit') || 5) || 5));
      const result = await radboox.listBillingMembers(authContext.data.settings, {
        page,
        limit,
        search: url.searchParams.get('search') || '',
        username: credentials.username,
        password: credentials.password,
        mode: 'web',
        cache: false
      });
      sendJson(res, 200, {
        ok: true,
        members: result.members,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.totalRows,
          totalPages: Math.max(1, Math.ceil(Number(result.totalRows || 0) / result.limit))
        }
      });
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'Member Radboox tidak bisa dibaca'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/monitoring/billing-manual-invoice/preview') {
    const authContext = await requirePermission(req, res, 'billing-monitor:read');
    if (!authContext) return;
    if (standaloneMode(authContext.data)) {
      const memberId = String(url.searchParams.get('memberId') || '').trim();
      const customer = (authContext.data.customers || []).find((item) => item.id === memberId);
      if (!customer) {
        badRequest(res, 'Member tidak ditemukan');
        return;
      }
      const preview = localManualInvoicePreview(authContext.data, customer, url.searchParams.get('subPeriod') || '1');
      sendJson(res, 200, {
        ok: true,
        source: 'standalone',
        preview
      });
      return;
    }
    if (!auth.hasPermission(authContext.user, 'radboox:sync')) {
      forbidden(res);
      return;
    }
    let credentials;
    try {
      credentials = radbooxActionCredentials(authContext);
    } catch (error) {
      badRequest(res, error.message || 'Kredensial Radboox user tidak tersedia');
      return;
    }

    try {
      const result = await radboox.previewManualInvoice(authContext.data.settings, {
        memberId: url.searchParams.get('memberId') || '',
        subPeriod: url.searchParams.get('subPeriod') || '1',
        username: credentials.username,
        password: credentials.password,
        mode: 'web',
        cache: false
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'Preview invoice Radboox gagal dibaca'
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/monitoring/billing-manual-invoice') {
    const authContext = await requirePermission(req, res, 'invoices:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    const memberId = String(payload.memberId || payload.idMember || '').trim();
    const memberName = String(payload.memberName || '').trim();
    const subPeriod = String(payload.subPeriod || '1').trim();
    if (!memberId) {
      badRequest(res, 'ID member tidak tersedia untuk buat invoice');
      return;
    }

    if (standaloneMode(authContext.data)) {
      try {
        const { result } = await mutate((data) => {
          const customer = (data.customers || []).find((item) => item.id === memberId);
          if (!customer) {
            throw new Error('Member tidak ditemukan');
          }
          return createLocalManualInvoice(data, customer, subPeriod, authContext.user).invoice;
        });
        sendJson(res, 200, {
          ok: true,
          source: 'standalone',
          invoice: result,
          invoiceNo: result.invoiceNo || result.externalId,
          message: `Invoice ${result.invoiceNo || result.externalId} berhasil dibuat`
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: error.message || 'Invoice manual gagal dibuat'
        });
      }
      return;
    }

    if (!auth.hasPermission(authContext.user, 'radboox:sync')) {
      forbidden(res);
      return;
    }

    let credentials;
    try {
      credentials = radbooxActionCredentials(authContext);
    } catch (error) {
      badRequest(res, error.message || 'Kredensial Radboox user tidak tersedia');
      return;
    }

    try {
      const result = await radboox.generateManualInvoice(authContext.data.settings, {
        memberId,
        subPeriod,
        username: credentials.username,
        password: credentials.password,
        mode: 'web',
        forceSession: true,
        cache: false
      });
      await mutate((data) => {
        addActivity(
          data,
          'monitoring',
          `Invoice manual Radboox dibuat oleh ${credentials.username}${memberName ? ` untuk ${memberName}` : ''}`,
          {
            action: 'manual-invoice',
            memberId,
            memberName,
            subPeriod: result.subPeriod,
            radbooxUsername: credentials.username
          }
        );
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'Invoice manual Radboox gagal dibuat'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/xendit') {
    const authContext = await requirePermission(req, res, 'xendit:read');
    if (!authContext) return;
    let credentials;
    try {
      credentials = radbooxActionCredentials(authContext);
    } catch (error) {
      badRequest(res, error.message || 'Kredensial Radboox user tidak tersedia');
      return;
    }

    try {
      const canViewBalance = xenditSensitiveAllowed(authContext, credentials, 'xendit:balance');
      const runtime = {
        tab: url.searchParams.get('tab') || '',
        from: url.searchParams.get('from') || '',
        to: url.searchParams.get('to') || '',
        type: url.searchParams.get('type') || '',
        paymentMethod: url.searchParams.get('paymentMethod') || url.searchParams.get('method') || '',
        search: url.searchParams.get('search') || '',
        limit: url.searchParams.get('limit') || '15',
        nextId: url.searchParams.get('nextId') || '',
        refresh: truthyQuery(url.searchParams.get('refresh')),
        username: credentials.username,
        password: credentials.password,
        includeBalance: canViewBalance,
        mode: 'web'
      };
      let result;
      let effectiveCredentials = credentials;
      try {
        result = await radboox.xenditGatewayStatus(authContext.data.settings, runtime);
      } catch (error) {
        if (canViewBalance) {
          throw error;
        }
        const fallbackCredentials = radbooxDefaultActionCredentials(authContext.data);
        effectiveCredentials = fallbackCredentials;
        result = await radboox.xenditGatewayStatus(authContext.data.settings, {
          ...runtime,
          username: fallbackCredentials.username,
          password: fallbackCredentials.password,
          includeBalance: false,
          forceSession: true,
          refresh: true
        });
        result.credentialFallback = true;
      }
      sendJson(res, 200, publicXenditPayloadForContext(result, authContext, effectiveCredentials));
    } catch (error) {
      sendJson(res, 502, publicXenditPayloadForContext({
        ok: false,
        source: 'radboox-xendit',
        error: error.message || 'Data Xendit Radboox tidak bisa dibaca',
        account: null,
        balance: { text: '', amount: 0 },
        tab: url.searchParams.get('tab') || 'transactions',
        transactions: [],
        balanceHistory: [],
        pending: [],
        pendingSummary: {},
        reports: [],
        summary: {},
        cursor: { nextPage: false, nextId: '' }
      }, authContext, credentials));
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/xendit/withdraw-request') {
    const authContext = await requirePermission(req, res, 'xendit:withdraw');
    if (!authContext) return;
    const payload = await readBody(req);
    let credentials;
    try {
      credentials = radbooxActionCredentials(authContext);
    } catch (error) {
      badRequest(res, error.message || 'Kredensial Radboox user tidak tersedia');
      return;
    }
    if (!xenditSensitiveAllowed(authContext, credentials, 'xendit:withdraw')) {
      forbidden(res);
      return;
    }

    try {
      const result = await radboox.requestXenditWithdraw(authContext.data.settings, {
        amount: payload.amount,
        bankIndex: payload.bankIndex,
        pin: payload.pin,
        username: credentials.username,
        password: credentials.password,
        mode: 'web',
        forceSession: true,
        cache: false
      });
      const withdrawToken = createXenditWithdrawRequest(authContext.user.id, result);
      await mutate((data) => {
        addActivity(
          data,
          'xendit',
          `Withdraw Xendit diminta oleh ${authContext.user.name || authContext.user.username} ke ${result.bank || 'rekening terdaftar'} ${result.accountNumberMasked || ''}`,
          {
            action: 'withdraw-request',
            amount: Number(result.amount || payload.amount || 0),
            bank: result.bank || '',
            accountName: result.accountName || '',
            accountNumberMasked: result.accountNumberMasked || '',
            radbooxUsername: credentials.username
          }
        );
      });
      const {
        sign,
        ...publicResult
      } = result;
      sendJson(res, 200, {
        ...publicResult,
        withdrawToken,
        expiresInSeconds: Math.round(XENDIT_WITHDRAW_TTL_MS / 1000)
      });
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'Request withdraw Xendit gagal'
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/xendit/withdraw-verify') {
    const authContext = await requirePermission(req, res, 'xendit:withdraw');
    if (!authContext) return;
    const payload = await readBody(req);
    let credentials;
    try {
      credentials = radbooxActionCredentials(authContext);
    } catch (error) {
      badRequest(res, error.message || 'Kredensial Radboox user tidak tersedia');
      return;
    }
    if (!xenditSensitiveAllowed(authContext, credentials, 'xendit:withdraw')) {
      forbidden(res);
      return;
    }

    try {
      const pendingWithdraw = takeXenditWithdrawRequest(authContext.user.id, payload.withdrawToken || payload.token);
      const result = await radboox.verifyXenditWithdraw(authContext.data.settings, {
        otp: payload.otp,
        sign: pendingWithdraw.sign,
        username: credentials.username,
        password: credentials.password,
        mode: 'web',
        forceSession: true,
        cache: false
      });
      await mutate((data) => {
        addActivity(
          data,
          'xendit',
          `Withdraw Xendit diverifikasi oleh ${authContext.user.name || authContext.user.username}`,
          {
            action: 'withdraw-verify',
            amount: Number(pendingWithdraw.amount || payload.amount || 0),
            bank: pendingWithdraw.bank || '',
            accountName: pendingWithdraw.accountName || '',
            accountNumberMasked: pendingWithdraw.accountNumberMasked || '',
            radbooxUsername: credentials.username
          }
        );
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'Verifikasi withdraw Xendit gagal'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/users') {
    const authContext = await requirePermission(req, res, 'users:manage');
    if (!authContext) return;
    sendJson(res, 200, {
      users: authContext.data.users.map((user) => publicManagedUser(authContext.data, user)),
      roles: auth.publicRoles()
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/users') {
    const authContext = await requirePermission(req, res, 'users:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { result } = await mutate((data) => auth.createUser(data, prepareManagedUserPayload(data, payload)));
      sendJson(res, 201, { user: result });
    } catch (error) {
      badRequest(res, error.message || 'User tidak bisa dibuat');
    }
    return;
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && method === 'PUT') {
    const authContext = await requirePermission(req, res, 'users:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    const userId = decodeURIComponent(userMatch[1]);
    try {
      const { result } = await mutate((data) => {
        const existing = (data.users || []).find((item) => item.id === userId) || null;
        return auth.updateUser(data, userId, prepareManagedUserPayload(data, payload, existing));
      });
      if (!result) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { user: result });
    } catch (error) {
      badRequest(res, error.message || 'User tidak bisa diperbarui');
    }
    return;
  }

  if (userMatch && method === 'DELETE') {
    const authContext = await requirePermission(req, res, 'users:manage');
    if (!authContext) return;
    const userId = decodeURIComponent(userMatch[1]);
    try {
      const { result } = await mutate((data) => auth.deleteUser(data, userId, authContext.user.id));
      if (!result) {
        notFound(res);
        return;
      }
      sendJson(res, 200, { user: result });
    } catch (error) {
      badRequest(res, error.message || 'User tidak bisa dihapus');
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/wa-gateway') {
    const authContext = await requirePermission(req, res, 'wa-gateway:manage');
    if (!authContext) return;
    const messages = Array.isArray(authContext.data.waMessages) ? authContext.data.waMessages : [];
    const { page, limit } = paginationParams(url, 10, 100, { allowAll: true });
    const pagination = paginationPayload(page, limit, messages.length);
    const offset = (pagination.page - 1) * limit;
    sendJson(res, 200, {
      ok: true,
      settings: publicWaGatewaySettings(authContext.data.settings?.waGateway || {}),
      messages: messages.slice(offset, offset + limit),
      pagination,
      summary: {
        total: messages.length,
        queued: messages.filter((message) => message.status === 'queued').length,
        draft: messages.filter((message) => message.status === 'draft').length,
        sent: messages.filter((message) => message.status === 'sent').length,
        failed: messages.filter((message) => message.status === 'failed').length
      }
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/wa-gateway/messages/batch-resend') {
    const authContext = await requirePermission(req, res, 'wa-gateway:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    const ids = [...new Set((Array.isArray(payload.ids) ? payload.ids : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean))]
      .slice(0, 100);
    if (!ids.length) {
      badRequest(res, 'Pilih pesan WA yang akan dikirim ulang');
      return;
    }
    try {
      const { result } = await mutate((store) => {
        const idSet = new Set(ids);
        let queued = 0;
        const now = new Date().toISOString();
        for (const message of store.waMessages || []) {
          if (!idSet.has(message.id)) continue;
          message.status = 'queued';
          message.scheduledAt = now;
          message.lastError = '';
          message.updatedAt = now;
          message.retriedBy = authContext.user.name || authContext.user.username;
          queued += 1;
        }
        if (!queued) throw new Error('Pesan WA terpilih tidak ditemukan');
        addActivity(store, 'settings', `${queued} pesan WA dikirim ulang oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'wa-message-batch-resend',
          ids: ids.slice(0, 20),
          count: queued
        });
        return { queued };
      });
      const delivery = await runWaGatewaySender('manual-batch', { ignoreWindow: true });
      sendJson(res, 200, {
        ok: true,
        ...result,
        delivery
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Pesan WA gagal dikirim ulang'
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/wa-gateway/messages/batch-delete') {
    const authContext = await requirePermission(req, res, 'wa-gateway:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    const ids = [...new Set((Array.isArray(payload.ids) ? payload.ids : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean))]
      .slice(0, 100);
    if (!ids.length) {
      badRequest(res, 'Pilih pesan WA yang akan dihapus');
      return;
    }
    try {
      const { result } = await mutate((store) => {
        const idSet = new Set(ids);
        const before = Array.isArray(store.waMessages) ? store.waMessages.length : 0;
        store.waMessages = (store.waMessages || []).filter((message) => !idSet.has(message.id));
        const deleted = before - store.waMessages.length;
        if (!deleted) throw new Error('Pesan WA terpilih tidak ditemukan');
        addActivity(store, 'settings', `${deleted} pesan WA dihapus oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'wa-message-batch-delete',
          ids: ids.slice(0, 20),
          count: deleted
        });
        return { deleted };
      });
      sendJson(res, 200, {
        ok: true,
        ...result
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Pesan WA gagal dihapus'
      });
    }
    return;
  }

  const waMessageSendMatch = pathname.match(/^\/api\/wa-gateway\/messages\/([^/]+)\/send$/);
  if (method === 'POST' && waMessageSendMatch) {
    const authContext = await requirePermission(req, res, 'wa-gateway:manage');
    if (!authContext) return;
    const messageId = decodeURIComponent(waMessageSendMatch[1] || '');
    try {
      const { result } = await mutate((store) => {
        const message = (store.waMessages || []).find((item) => item.id === messageId);
        if (!message) throw new Error('Pesan WA tidak ditemukan');
        if (message.status === 'sent') return message;
        message.status = 'queued';
        message.scheduledAt = new Date().toISOString();
        message.lastError = '';
        message.updatedAt = new Date().toISOString();
        message.retriedBy = authContext.user.name || authContext.user.username;
        addActivity(store, 'settings', `Pesan WA ${message.subject || message.invoiceNo || message.id} dikirim ulang oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'wa-message-retry',
          messageId
        });
        return message;
      });
      const delivery = await runWaGatewaySender('manual', { ignoreWindow: true, messageId });
      sendJson(res, 200, {
        ok: true,
        message: 'Pesan WA masuk antrean kirim ulang',
        waMessage: result,
        delivery
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Pesan WA gagal dikirim ulang'
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/wa-gateway/broadcast') {
    const authContext = await requirePermission(req, res, 'wa-gateway:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { result } = await mutate((store) => {
        const broadcast = queueBroadcastMessages(store, payload, authContext.user);
        addActivity(store, 'settings', `Broadcast WA disiapkan untuk ${broadcast.recipientCount} member oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'wa-broadcast',
          target: payload.target || payload.recipientType || 'all',
          nas: payload.nas || 'all',
          queued: broadcast.queued.length
        });
        return broadcast;
      });
      sendJson(res, 200, {
        ok: true,
        queued: result.queued.length,
        recipientCount: result.recipientCount
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Broadcast WA gagal dibuat'
      });
    }
    return;
  }

  if (method === 'PUT' && pathname === '/api/wa-gateway') {
    const authContext = await requirePermission(req, res, 'wa-gateway:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { data } = await mutate((store) => {
        store.settings = store.settings || {};
        store.settings.waGateway = sanitizeWaGatewaySettings(payload.waGateway || payload, store.settings.waGateway || {});
        addActivity(store, 'settings', `Whatsapp Gateway diperbarui oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'wa-gateway-update',
          provider: store.settings.waGateway.provider
        });
      });
      sendJson(res, 200, {
        ok: true,
        settings: publicWaGatewaySettings(data.settings.waGateway || {})
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Whatsapp Gateway gagal disimpan'
      });
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/wa-gateway/templates/reset') {
    const authContext = await requirePermission(req, res, 'wa-gateway:manage');
    if (!authContext) return;
    try {
      const { data } = await mutate((store) => {
        store.settings = store.settings || {};
        const current = store.settings.waGateway || {};
        store.settings.waGateway = sanitizeWaGatewaySettings({
          ...current,
          resetTemplates: true,
          templates: DEFAULT_WA_TEMPLATES
        }, current);
        addActivity(store, 'settings', `Template Whatsapp Gateway direset oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'wa-template-reset'
        });
      });
      sendJson(res, 200, {
        ok: true,
        settings: publicWaGatewaySettings(data.settings.waGateway || {})
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Template WA gagal direset'
      });
    }
    return;
  }

  if (pathname.startsWith('/api/wa-gateway/waha/')) {
    const authContext = await requirePermission(req, res, 'wa-gateway:manage');
    if (!authContext) return;
    const settings = {
      ...(authContext.data.settings?.waGateway || {}),
      provider: 'waha'
    };
    try {
      if (method === 'GET' && pathname === '/api/wa-gateway/waha/status') {
        const status = await wahaSessionStatusWithProfile(settings, { timeoutMs: 5000 });
        sendJson(res, 200, {
          ok: true,
          session: wahaSessionName(settings),
          status
        });
        return;
      }
      if (method === 'POST' && pathname === '/api/wa-gateway/waha/start') {
        const status = await wahaStartSession(settings);
        sendJson(res, 200, {
          ok: true,
          session: wahaSessionName(settings),
          status
        });
        return;
      }
      if (method === 'POST' && pathname === '/api/wa-gateway/waha/stop') {
        const status = await wahaStopSession(settings);
        sendJson(res, 200, {
          ok: true,
          session: wahaSessionName(settings),
          status
        });
        return;
      }
      if (method === 'POST' && pathname === '/api/wa-gateway/waha/logout') {
        const status = await wahaLogoutSession(settings);
        sendJson(res, 200, {
          ok: true,
          session: wahaSessionName(settings),
          status
        });
        return;
      }
      if (method === 'GET' && pathname === '/api/wa-gateway/waha/qr') {
        const qr = await wahaQr(settings);
        sendJson(res, 200, {
          ok: true,
          session: wahaSessionName(settings),
          qr
        });
        return;
      }
      notFound(res);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.message || 'WAHA tidak bisa diakses',
        session: wahaSessionName(settings)
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/payment-gateway') {
    const authContext = await requirePermission(req, res, 'payment-gateway:manage');
    if (!authContext) return;
    const report = paymentGatewayReportPayload(authContext.data, {
      from: url.searchParams.get('from') || '',
      to: url.searchParams.get('to') || '',
      method: url.searchParams.get('method') || 'all',
      kind: url.searchParams.get('kind') || 'all',
      search: url.searchParams.get('search') || ''
    });
    sendJson(res, 200, {
      ok: true,
      settings: publicPaymentGatewaySettings(authContext.data.settings?.paymentGateway || {}),
      providers: [
        { value: 'tripay', label: 'Tripay' },
        { value: 'midtrans', label: 'Midtrans' },
        { value: 'xendit', label: 'Xendit' },
        { value: 'doku', label: 'Doku' },
        { value: 'duitku', label: 'Duitku' },
        { value: 'ipaymu', label: 'iPaymu' },
        { value: 'custom', label: 'Custom' }
      ],
      ...report
    });
    return;
  }

  if (method === 'PUT' && pathname === '/api/payment-gateway') {
    const authContext = await requirePermission(req, res, 'payment-gateway:manage');
    if (!authContext) return;
    const payload = await readBody(req);
    try {
      const { data } = await mutate((store) => {
        store.settings = store.settings || {};
        store.settings.paymentGateway = sanitizePaymentGatewaySettings(payload.paymentGateway || payload, store.settings.paymentGateway || {});
        addActivity(store, 'settings', `Payment Gateway diperbarui oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'payment-gateway-update',
          provider: store.settings.paymentGateway.provider
        });
      });
      sendJson(res, 200, {
        ok: true,
        settings: publicPaymentGatewaySettings(data.settings.paymentGateway || {})
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Payment Gateway gagal disimpan'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/system/update/status') {
    const authContext = await requirePermission(req, res, 'settings:write');
    if (!authContext) return;
    const [log, update] = await Promise.all([
      updateLogTail(),
      appUpdateStatus({ force: url.searchParams.get('refresh') === '1' })
    ]);
    sendJson(res, 200, {
      ok: true,
      system: publicSystemInfo(),
      updaterInstalled: fsSync.existsSync(APP_UPDATE_COMMAND),
      update,
      log
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/system/update') {
    const authContext = await requirePermission(req, res, 'settings:write');
    if (!authContext) return;
    try {
      const pid = startUpdateProcess();
      const { data } = await mutate((store) => {
        addActivity(store, 'settings', `Update aplikasi dijalankan oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'system-update-start',
          pid,
          command: APP_UPDATE_COMMAND
        });
      });
      sendJson(res, 202, {
        ok: true,
        message: 'Update aplikasi dimulai. Service akan restart otomatis setelah update selesai.',
        pid,
        settings: publicAppSettings(data.settings)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Update aplikasi gagal dijalankan'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/settings/backup') {
    const authContext = await requirePermission(req, res, 'settings:write');
    if (!authContext) return;
    const filename = `fakenet-billing-backup-${localTodayIso()}.json`;
    sendBinary(
      res,
      200,
      `${JSON.stringify(appBackupPayload(authContext.data, authContext.user), null, 2)}\n`,
      'application/json; charset=utf-8',
      filename
    );
    return;
  }

  if (method === 'POST' && pathname === '/api/settings/restore') {
    const authContext = await requirePermission(req, res, 'settings:write');
    if (!authContext) return;
    try {
      const payload = await readBody(req, BACKUP_RESTORE_LIMIT_BYTES);
      const restored = restoreStoreFromPayload(payload);
      const { data } = await mutate((store) => {
        addActivity(restored, 'settings', `Backup dipulihkan oleh ${authContext.user.name || authContext.user.username}`, {
          action: 'settings-restore',
          source: payload?.backup?.app || payload?.app || 'manual-json',
          summary: backupRecordSummary(restored)
        });
        replaceStore(store, restored);
      });
      sendJson(res, 200, {
        ok: true,
        settings: publicAppSettings(data.settings),
        summary: backupRecordSummary(data)
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message || 'Restore backup gagal'
      });
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/settings') {
    const authContext = await requirePermission(req, res, 'settings:read');
    if (!authContext) return;
    const data = authContext.data;
    sendJson(res, 200, { settings: publicAppSettings(data.settings) });
    return;
  }

  if (method === 'PUT' && pathname === '/api/settings') {
    const authContext = await requirePermission(req, res, 'settings:write');
    if (!authContext) return;
    const payload = await readBody(req);
    const { data } = await mutate((store) => {
      if (typeof payload.businessName === 'string') {
        store.settings.businessName = payload.businessName.trim() || store.settings.businessName;
      }
      if (typeof payload.appSubtitle === 'string') {
        store.settings.appSubtitle = payload.appSubtitle.trim().slice(0, 60) || store.settings.appSubtitle || 'ISP Ops';
      }
      if (typeof payload.receiptBusinessCode === 'string') {
        store.settings.receiptBusinessCode = sanitizeReceiptBusinessCode(payload.receiptBusinessCode, store.settings.receiptBusinessCode || store.settings.billing?.invoiceBusinessCode || 'FAKE.NET');
      }
      if (typeof payload.voucherLoginUrl === 'string') {
        store.settings.voucherLoginUrl = sanitizePublicUrl(payload.voucherLoginUrl);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'voucherRevenueSharePercent')) {
        store.settings.voucherRevenueSharePercent = Math.max(0, Math.min(100, Number(payload.voucherRevenueSharePercent) || 0));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'collectorDailyBonusEnabled')) {
        store.settings.collectorDailyBonusEnabled = payloadEnabled(payload.collectorDailyBonusEnabled);
      }
      if (payload.security && typeof payload.security === 'object') {
        store.settings.security = store.settings.security && typeof store.settings.security === 'object'
          ? store.settings.security
          : {};
        if (Object.prototype.hasOwnProperty.call(payload.security, 'loginVerificationEnabled')) {
          store.settings.security.loginVerificationEnabled = payloadEnabled(payload.security.loginVerificationEnabled);
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'collectorDailyBonusTiers')) {
        store.settings.collectorDailyBonusTiers = sanitizeCollectorDailyBonusTiers(payload.collectorDailyBonusTiers);
      } else if (!Array.isArray(store.settings.collectorDailyBonusTiers) || !store.settings.collectorDailyBonusTiers.length) {
        store.settings.collectorDailyBonusTiers = DEFAULT_COLLECTOR_DAILY_BONUS_TIERS;
      }
      store.settings.collectorDailyBonusPercent = 0;
      store.settings.collectorDailyBonusAmount = 0;
      if (typeof payload.logoUrl === 'string') {
        store.settings.logoUrl = sanitizeLogoUrl(payload.logoUrl);
      }
      if (payload.defaultDueDay) {
        store.settings.defaultDueDay = Math.max(1, Math.min(28, Number(payload.defaultDueDay) || 10));
      }
      if (payload.packagePrices && typeof payload.packagePrices === 'object') {
        const nextPrices = {};
        for (const [name, amount] of Object.entries(payload.packagePrices)) {
          const cleanName = String(name).trim();
          if (cleanName) {
            nextPrices[cleanName] = Math.max(0, Number(amount) || 0);
          }
        }
        store.settings.packagePrices = nextPrices;
      }
      if (payload.radboox && typeof payload.radboox === 'object') {
        if (!standaloneMode(store)) {
          if (!auth.hasPermission(authContext.user, 'radboox:configure')) {
            throw new Error('Hanya admin yang boleh mengubah koneksi Radboox');
          }
          store.settings.radboox = sanitizeRadbooxSettings(payload.radboox, store.settings.radboox, store);
        }
      }
      if (payload.oltManager && typeof payload.oltManager === 'object') {
        store.settings.oltManager = sanitizeOltManagerSettings(payload.oltManager, store.settings.oltManager);
      }
      if (payload.mediaServices && typeof payload.mediaServices === 'object') {
        store.settings.mediaServices = sanitizeMediaServicesSettings(payload.mediaServices, store.settings.mediaServices);
      }
      if (payload.genieAcs && typeof payload.genieAcs === 'object') {
        store.settings.genieAcs = sanitizeGenieAcsSettings(payload.genieAcs, store.settings.genieAcs || {});
      }
      if (payload.wifiKu && typeof payload.wifiKu === 'object') {
        store.settings.wifiKu = sanitizeWifiKuSettings(payload.wifiKu, store.settings.wifiKu || {});
      }
      if (payload.radius && typeof payload.radius === 'object') {
        store.settings.radius = sanitizeRadiusSettings(payload.radius, store.settings.radius || {});
      }
    });
    sendJson(res, 200, { settings: publicAppSettings(data.settings) });
    return;
  }

  if (method === 'GET' && pathname === '/api/radboox/status') {
    const authContext = await requirePermission(req, res, 'radboox:read');
    if (!authContext) return;
    if (standaloneMode(authContext.data)) {
      notFound(res);
      return;
    }
    const data = authContext.data;
    sendJson(res, 200, { radboox: radbooxStatusResponse(data) });
    return;
  }

  if (method === 'POST' && pathname === '/api/radboox/sync') {
    const authContext = await requirePermission(req, res, 'radboox:sync');
    if (!authContext) return;
    if (standaloneMode(authContext.data)) {
      notFound(res);
      return;
    }
    const payload = await readBody(req);
    const data = authContext.data;
    const earning = await radboox.syncMonthlyEarning(data.settings, payload || {});
    const { data: saved, result } = await mutate((store) => {
      if (auth.hasPermission(authContext.user, 'radboox:configure')) {
        persistRadbooxCredentials(store.settings.radboox, payload, store);
      }
      return upsertMonthlyEarning(store, earning.earning);
    });
    sendJson(res, 200, {
      mode: earning.mode,
      period: earning.period,
      earning: result,
      warning: result && result.syncWarning ? result.syncWarning : '',
      summary: summarize(saved, earning.period)
    });
    return;
  }

  notFound(res);
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') {
    pathname = '/index.html';
  }
  try {
    const data = await loadStore();
    const voucherPath = data.settings?.hotspotVoucherOnline?.publicPath || '/voucher';
    const wifiKuPath = data.settings?.wifiKu?.publicPath || '/wifiku';
    if (pathname === voucherPath || pathname === `${voucherPath}/`) {
      pathname = '/order-voucher.html';
    } else if (pathname === wifiKuPath || pathname === `${wifiKuPath}/`) {
      pathname = '/wifiku.html';
    } else {
      const voucherBase = voucherPath.endsWith('/') ? voucherPath : `${voucherPath}/`;
      if (pathname.startsWith(voucherBase)) {
        const nested = pathname.slice(voucherBase.length);
        const allowedVoucherFiles = new Set([
          'order-voucher.html',
          'buy.html',
          'status-order.html',
          'hotspot-voucher.html',
          'hotspot-voucher.css',
          'hotspot-voucher.js',
          'fakenet-logo.png'
        ]);
        if (allowedVoucherFiles.has(nested)) {
          pathname = `/${nested}`;
        }
      }
      const wifiKuBase = wifiKuPath.endsWith('/') ? wifiKuPath : `${wifiKuPath}/`;
      if (pathname.startsWith(wifiKuBase)) {
        const nested = pathname.slice(wifiKuBase.length);
        const allowedWifiKuFiles = new Set([
          'wifiku.html',
          'wifiku.css',
          'wifiku.js',
          'fakenet-logo.png'
        ]);
        if (allowedWifiKuFiles.has(nested)) {
          pathname = `/${nested}`;
        }
      }
    }
  } catch (error) {
    // Static assets must keep serving even if the store is temporarily unavailable.
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    notFound(res);
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      notFound(res);
      return;
    }
    const ext = path.extname(filePath);
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': staticCacheControl(ext)
    });
    res.end(body);
  } catch (error) {
    if (pathname !== '/index.html' && !pathname.includes('.')) {
      const body = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, {
        'Content-Type': MIME_TYPES['.html'],
        'Content-Length': body.length,
        'Cache-Control': 'no-store'
      });
      res.end(body);
      return;
    }
    notFound(res);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'OPTIONS') {
      sendNoContent(res);
      return;
    }
    if (isPaymentGatewayWebhookPath(url.pathname)) {
      await handlePaymentGatewayWebhook(req, res, url);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    const message = error instanceof SyntaxError ? 'Payload JSON tidak valid' : error.message;
    sendJson(res, error instanceof SyntaxError ? 400 : 500, { error: message || 'Server error' });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`FAKE.NET Billing berjalan di http://${HOST}:${PORT}`);
    ensureStartupData().catch((error) => {
      console.error(`Inisialisasi data awal gagal: ${error.message || error}`);
    });
    startStandaloneBillingAutomation();
    startWaGatewaySender();
  });
}

module.exports = {
  __test: {
    applyHotspotVoucherExpirations,
    collectorReportPayments,
    createHotspotVoucherOrder,
    dashboardRadiusServiceSummary,
    dashboardCollectorScope,
    deleteRadiusLinkedMember,
    deleteOrphanRadiusMembers,
    fulfillHotspotVoucherOrder,
    fulfillPaymentGatewayCallback,
    hotspotFreeUserWritable,
    invoiceGenerationDue,
    importPppUsers,
    isPaymentGatewayWebhookPath,
    localDailyReport,
    localManualInvoicePreview,
    monthlyBillingDailyRows,
    paymentGatewayPayloadMerchantReference,
    paymentGatewayReportPayload,
    publicPaymentGatewayInvoicePayload,
    reportStatisticsPayload,
    readWorkbookRowsFromBase64,
    verifyPaymentGatewayCallback,
    filterVoucherReportOrders,
    radiusPayloadLocal,
    radiusTemplateRowsLocal,
    resellerHotspotVoucherRowVisible,
    sanitizeBillingSettings,
    stampHotspotVoucherValidityFromFirstOnline,
    syncRadiusCustomerStatus,
    standaloneBillingAutomation
  }
};
