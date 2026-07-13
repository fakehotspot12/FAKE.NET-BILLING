'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const PRODUCT_CODE = 'FAKENET-BILLING';
const LICENSE_VERSION = 1;
const DEFAULT_SECRET = 'change-this-license-secret-before-release';
const DURATION_PRESETS = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '180d': 180,
  '1y': 365,
  lifetime: 0
};
const EDITION_BY_DURATION = {
  '7d': 'Trial Edition',
  '30d': 'Monthly Edition',
  '90d': 'Quarterly Edition',
  '180d': 'Semiannual Edition',
  '1y': 'Annual Edition',
  lifetime: 'Lifetime Edition'
};

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value = '') {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function hexEncode(value = '') {
  return Buffer.from(String(value || ''), 'utf8').toString('hex').toUpperCase();
}

function hexDecode(value = '') {
  return Buffer.from(String(value || ''), 'hex').toString('utf8');
}

function licenseSecret() {
  return String(process.env.LICENSE_SECRET || process.env.FAKENET_LICENSE_SECRET || DEFAULT_SECRET);
}

function pemEnv(name = '') {
  const value = String(process.env[name] || '').trim();
  return value ? value.replace(/\\n/g, '\n') : '';
}

function privateKeyPem() {
  return pemEnv('LICENSE_PRIVATE_KEY') || pemEnv('FAKENET_LICENSE_PRIVATE_KEY');
}

function publicKeyPem() {
  return pemEnv('LICENSE_PUBLIC_KEY') || pemEnv('FAKENET_LICENSE_PUBLIC_KEY');
}

function signingAlgorithm() {
  return privateKeyPem() ? 'ed25519' : 'hmac';
}

function hmac(payload, secret = licenseSecret()) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function signLicenseBody(body = '', secret = licenseSecret()) {
  const privatePem = privateKeyPem();
  if (privatePem) {
    return crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(privatePem)).toString('hex').toUpperCase();
  }
  return crypto.createHmac('sha256', secret).update(body).digest('hex').toUpperCase().slice(0, 32);
}

function verifyLicenseSignature(body = '', signature = '', payload = {}, secret = licenseSecret()) {
  if (payload.alg === 'ed25519') {
    const publicPem = publicKeyPem() || (privateKeyPem() ? crypto.createPublicKey(crypto.createPrivateKey(privateKeyPem())).export({ type: 'spki', format: 'pem' }) : '');
    if (!publicPem) return false;
    try {
      return crypto.verify(null, Buffer.from(body), crypto.createPublicKey(publicPem), Buffer.from(String(signature || ''), 'hex'));
    } catch {
      return false;
    }
  }
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex').toUpperCase().slice(0, 32);
  const actual = Buffer.from(String(signature || ''));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}

function groupKey(value = '') {
  return String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().match(/.{1,5}/g)?.join('-') || '';
}

function groupToken(value = '') {
  return String(value || '')
    .split('.')
    .map((part) => groupKey(part))
    .join('.');
}

function ungroupToken(value = '') {
  return String(value || '')
    .trim()
    .replace(/^FNB-/i, '')
    .split('.')
    .map((part) => part.replace(/[^A-Z0-9]/gi, ''))
    .join('.');
}

function readFirst(paths = []) {
  for (const item of paths) {
    try {
      const value = fs.readFileSync(item, 'utf8').trim();
      if (value) return value;
    } catch {
      // Ignore missing host identity files.
    }
  }
  return '';
}

function machineFingerprint() {
  const machineId = readFirst(['/etc/machine-id', '/var/lib/dbus/machine-id']);
  const raw = [
    machineId,
    os.hostname(),
    os.platform(),
    os.arch()
  ].filter(Boolean).join('|');
  const hash = crypto.createHash('sha256').update(raw || os.hostname()).digest('hex').toUpperCase();
  return `MC-${hash.slice(0, 5)}-${hash.slice(5, 10)}-${hash.slice(10, 15)}-${hash.slice(15, 20)}`;
}

function normalizeMachineCode(value = '') {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return machineFingerprint();
  const clean = raw.replace(/[^A-Z0-9]/g, '');
  if (clean.startsWith('MC')) {
    return groupKey(clean);
  }
  const hash = crypto.createHash('sha256').update(clean).digest('hex').toUpperCase();
  return `MC-${hash.slice(0, 5)}-${hash.slice(5, 10)}-${hash.slice(10, 15)}-${hash.slice(15, 20)}`;
}

function normalizeDate(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function addDays(date = new Date(), days = 0) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return next.toISOString().slice(0, 10);
}

function expiryFromDuration(duration = '', issuedAt = new Date()) {
  const key = String(duration || '').trim().toLowerCase();
  if (key === 'lifetime') return '';
  const days = DURATION_PRESETS[key];
  if (!days) return '';
  const base = new Date(`${normalizeDate(issuedAt) || new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return addDays(base, days);
}

function createLicensePayload(input = {}) {
  const now = new Date().toISOString();
  const issuedAt = normalizeDate(input.issuedAt || now) || now.slice(0, 10);
  const duration = String(input.duration || input.durationPreset || '').trim().toLowerCase();
  const expiresAt = normalizeDate(input.expiresAt || input.expiry || '') || expiryFromDuration(duration, issuedAt);
  const edition = EDITION_BY_DURATION[duration] || String(input.edition || 'Standard Edition').trim().slice(0, 40) || 'Standard Edition';
  return {
    v: LICENSE_VERSION,
    alg: signingAlgorithm(),
    product: PRODUCT_CODE,
    licenseId: String(input.licenseId || `LIC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`).trim(),
    licensedTo: String(input.licensedTo || input.customer || 'Pelanggan').trim().slice(0, 120),
    machineCode: normalizeMachineCode(input.machineCode || input.machineId || ''),
    issuedAt,
    expiresAt,
    duration,
    edition,
    maxSites: 0,
    sitesUnlimited: true
  };
}

function encodeLicense(payload = {}, secret = licenseSecret()) {
  const body = hexEncode(JSON.stringify(payload));
  const signature = signLicenseBody(body, secret);
  return `FNB-${groupToken(`${body}.${signature}`)}`;
}

function generateLicense(input = {}, secret = licenseSecret()) {
  const payload = createLicensePayload(input);
  return {
    key: encodeLicense(payload, secret),
    payload
  };
}

function parseLicenseKey(key = '') {
  const clean = ungroupToken(key);
  const index = clean.lastIndexOf('.');
  if (index === -1) throw new Error('Format license key tidak valid');
  const body = clean.slice(0, index);
  const signature = clean.slice(index + 1);
  const payload = JSON.parse(hexDecode(body));
  return { body, signature, payload };
}

function validateLicenseKey(key = '', options = {}) {
  const secret = options.secret || licenseSecret();
  const machineCode = normalizeMachineCode(options.machineCode || '');
  let parsed;
  try {
    parsed = parseLicenseKey(key);
  } catch {
    return { ok: false, error: 'License key tidak valid', machineCode };
  }
  if (!verifyLicenseSignature(parsed.body, parsed.signature, parsed.payload, secret)) {
    return { ok: false, error: 'Signature license tidak valid', machineCode };
  }
  const payload = parsed.payload || {};
  if (payload.product !== PRODUCT_CODE) {
    return { ok: false, error: 'License bukan untuk FAKE.NET Billing', machineCode };
  }
  if (normalizeMachineCode(payload.machineCode) !== machineCode) {
    return { ok: false, error: 'License key tidak cocok dengan machine code server ini', machineCode, payload };
  }
  if (payload.expiresAt) {
    const expiry = new Date(`${payload.expiresAt}T23:59:59.999Z`).getTime();
    if (Number.isFinite(expiry) && expiry < Date.now()) {
      return { ok: false, error: 'License key sudah expired', machineCode, payload };
    }
  }
  return { ok: true, machineCode, payload };
}

function licenseEnforced() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.LICENSE_ENFORCE || process.env.FAKENET_LICENSE_ENFORCE || '').toLowerCase());
}

function publicLicenseStatus(data = {}) {
  const enforce = licenseEnforced();
  const machineCode = machineFingerprint();
  const license = data.settings?.license && typeof data.settings.license === 'object' ? data.settings.license : {};
  const validation = license.key ? validateLicenseKey(license.key, { machineCode }) : { ok: false, error: 'Belum aktivasi', machineCode };
  return {
    ok: true,
    enforced: enforce,
    active: enforce ? validation.ok : (validation.ok || license.active === true),
    machineCode,
    licenseId: validation.payload?.licenseId || license.licenseId || '',
    licensedTo: validation.payload?.licensedTo || license.licensedTo || '',
    edition: validation.payload?.edition || license.edition || '',
    issuedAt: validation.payload?.issuedAt || license.issuedAt || '',
    expiresAt: validation.payload?.expiresAt || license.expiresAt || '',
    activatedAt: license.activatedAt || '',
    error: validation.ok ? '' : validation.error
  };
}

module.exports = {
  PRODUCT_CODE,
  DURATION_PRESETS,
  EDITION_BY_DURATION,
  generateLicense,
  licenseEnforced,
  machineFingerprint,
  normalizeMachineCode,
  publicLicenseStatus,
  validateLicenseKey
};
