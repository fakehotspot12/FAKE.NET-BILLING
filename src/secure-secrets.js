'use strict';

const crypto = require('crypto');

const SECRET_VERSION = 'v1';

function ensureSecuritySettings(data = {}) {
  if (!data.settings || typeof data.settings !== 'object') {
    data.settings = {};
  }
  if (!data.settings.security || typeof data.settings.security !== 'object') {
    data.settings.security = {};
  }
  if (!data.settings.security.secretKey) {
    data.settings.security.secretKey = crypto.randomBytes(32).toString('base64');
  }
  return data.settings.security;
}

function secretKey(data = {}) {
  const security = ensureSecuritySettings(data);
  const raw = Buffer.from(String(security.secretKey || ''), 'base64');
  if (raw.length === 32) {
    return raw;
  }

  const replacement = crypto.randomBytes(32);
  security.secretKey = replacement.toString('base64');
  return replacement;
}

function encryptSecret(data, value) {
  const plain = String(value || '');
  if (!plain) {
    return '';
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(data), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SECRET_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
}

function decryptSecret(data, encoded) {
  const text = String(encoded || '');
  if (!text) {
    return '';
  }
  if (!text.startsWith(`${SECRET_VERSION}:`)) {
    return text;
  }

  const [, ivText, tagText, payloadText] = text.split(':');
  if (!ivText || !tagText || !payloadText) {
    throw new Error('Secret terenkripsi tidak valid');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    secretKey(data),
    Buffer.from(ivText, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadText, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function hasSecret(value) {
  return Boolean(String(value || '').trim());
}

module.exports = {
  decryptSecret,
  encryptSecret,
  ensureSecuritySettings,
  hasSecret
};
