'use strict';

const crypto = require('node:crypto');
const net = require('node:net');

const ACTION = 'billing_login';
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TOKEN_TTL_MS = 300000;

function normalizeHostname(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

function configuration(env = process.env) {
  const domains = value => (Array.isArray(value) ? value : String(value || '').split(/[\s,]+/))
    .map(normalizeHostname).filter(domain => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain));
  let additionalSites = [];
  try {
    const parsed = JSON.parse(env.LOGIN_TURNSTILE_ADDITIONAL_SITES || '[]');
    if (Array.isArray(parsed)) additionalSites = parsed.slice(0, 20).filter(site => site && typeof site === 'object').map(site => ({
      domains: domains(site.domains), siteKey: String(site.siteKey || '').trim(), secretKey: String(site.secretKey || '').trim()
    }));
  } catch {}
  return {
    enabled: ['1', 'true', 'yes', 'on'].includes(String(env.LOGIN_TURNSTILE_ENABLED || '').trim().toLowerCase()),
    siteKey: String(env.LOGIN_TURNSTILE_SITE_KEY || '').trim(),
    secretKey: String(env.LOGIN_TURNSTILE_SECRET_KEY || '').trim(),
    domains: domains(env.LOGIN_TURNSTILE_DOMAINS),
    additionalSites
  };
}

function siteForHostname(host, cfg) {
  return [cfg, ...cfg.additionalSites].flatMap(site => site.domains
    .filter(domain => host === domain || host.endsWith('.' + domain))
    .map(domain => ({ site, specificity: domain.length })))
    .sort((left, right) => right.specificity - left.specificity)[0]?.site || null;
}

function verificationPolicy(hostname = '', enabled = true, env = process.env) {
  if (!enabled) return { enabled: false, provider: 'disabled' };
  const host = normalizeHostname(hostname);
  const cfg = configuration(env);
  if (!cfg.enabled) return { enabled: true, provider: 'code' };
  const site = siteForHostname(host, cfg);
  if (!site) return { enabled: true, provider: 'code' };
  return { enabled: true, provider: 'turnstile', siteKey: site.siteKey, action: ACTION, configured: Boolean(site.siteKey && site.secretKey) };
}

function createTurnstileVerifier({ fetchImpl = (...args) => globalThis.fetch(...args), now = Date.now, timeoutMs = 5000, maxTokens = 5000 } = {}) {
  const used = new Map();
  const inFlight = new Set();
  const invalid = () => ({ ok: false, status: 400, error: 'Verifikasi Cloudflare tidak valid atau kedaluwarsa. Ulangi verifikasi.' });
  const unavailable = () => ({ ok: false, status: 503, error: 'Verifikasi Cloudflare belum tersedia. Periksa koneksi lalu coba lagi.' });
  return async function verify(token, { hostname = '', ipAddress = '', env = process.env } = {}) {
    const cfg = configuration(env);
    const host = normalizeHostname(hostname);
    const site = siteForHostname(host, cfg);
    if (!cfg.enabled || !site?.siteKey || !site.secretKey) return unavailable();
    if (typeof token !== 'string' || !token.trim() || token.length > 2048) return invalid();
    const value = token.trim();
    const timestamp = now();
    for (const [key, expiresAt] of used) if (expiresAt <= timestamp) used.delete(key);
    const digest = crypto.createHash('sha256').update(value).digest('hex');
    if (used.has(digest) || inFlight.has(digest)) return invalid();
    if (used.size + inFlight.size >= maxTokens) return unavailable();
    inFlight.add(digest);
    try {
      const response = await fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: site.secretKey,
          response: value,
          ...(net.isIP(ipAddress) ? { remoteip: ipAddress } : {})
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) return unavailable();
      const result = await response.json();
      if (result.success !== true || normalizeHostname(result.hostname) !== host || result.action !== ACTION) return invalid();
      const challengeAt = Date.parse(result.challenge_ts);
      if (!Number.isFinite(challengeAt) || challengeAt < timestamp - TOKEN_TTL_MS || challengeAt > timestamp + 30000) return invalid();
      used.set(digest, now() + TOKEN_TTL_MS);
      return { ok: true };
    } catch {
      return unavailable();
    } finally {
      inFlight.delete(digest);
    }
  };
}

module.exports = { ACTION, configuration, createTurnstileVerifier, normalizeHostname, verificationPolicy };
