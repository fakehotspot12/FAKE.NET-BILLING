'use strict';

const crypto = require('crypto');
const { createId } = require('./store');
const secureSecrets = require('./secure-secrets');

const SESSION_COOKIE = 'isp_finance_session';
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const PASSWORD_MIN_LENGTH = 6;

const ROLE_DEFINITIONS = {
  admin: {
    label: 'Admin',
    description: 'Akses tertinggi untuk user, pengaturan sistem, billing, dan operasional.',
    permissions: [
      'dashboard:read',
      'external-incomes:read',
      'external-incomes:write',
      'expenses:read',
      'expenses:write',
      'reports:daily:read',
      'reports:voucher:read',
      'billing-monitor:read',
      'settings:read',
      'settings:write',
      'users:manage',
      'customers:manage',
      'invoices:manage',
      'billing-settings:manage',
      'wa-gateway:manage',
      'payment-gateway:manage',
      'xendit:read',
      'xendit:balance',
      'xendit:withdraw',
      'inventory:read',
      'inventory:write',
      'network-assets:read',
      'network-assets:write',
      'radius:read',
      'radius:write',
      'genieacs:read',
      'genieacs:write',
      'monitoring:read',
      'monitoring:write',
      'monitoring:check'
    ]
  },
  owner: {
    label: 'Owner',
    description: 'Akses bisnis dan operasional tanpa pengaturan sistem.',
    permissions: [
      'dashboard:read',
      'external-incomes:read',
      'external-incomes:write',
      'expenses:read',
      'expenses:write',
      'reports:daily:read',
      'reports:voucher:read',
      'billing-monitor:read',
      'customers:manage',
      'invoices:manage',
      'billing-settings:manage',
      'wa-gateway:manage',
      'payment-gateway:manage',
      'xendit:read',
      'xendit:balance',
      'xendit:withdraw',
      'inventory:read',
      'inventory:write',
      'network-assets:read',
      'network-assets:write',
      'radius:read',
      'radius:write',
      'genieacs:read',
      'genieacs:write',
      'monitoring:read',
      'monitoring:write',
      'monitoring:check'
    ]
  },
  finance: {
    label: 'Finance',
    description: 'Kelola pemasukan, pengeluaran, laporan tagihan, dan transaksi billing.',
    permissions: [
      'dashboard:read',
      'external-incomes:read',
      'external-incomes:write',
      'expenses:read',
      'expenses:write',
      'reports:daily:read',
      'reports:voucher:read',
      'billing-monitor:read',
      'customers:manage',
      'invoices:manage',
      'billing-settings:manage',
      'wa-gateway:manage',
      'payment-gateway:manage',
      'xendit:read'
    ]
  },
  technician: {
    label: 'Teknisi',
    description: 'Akses teknis lapangan tanpa data kas, pemasukan, atau pengeluaran.',
    permissions: [
      'dashboard:read',
      'inventory:read',
      'inventory:write',
      'network-assets:read',
      'radius:read',
      'radius:ppp-users:write',
      'radius:hotspot-free:write',
      'members:read',
      'members:contact:write',
      'genieacs:read',
      'genieacs:write',
      'monitoring:read',
      'monitoring:check'
    ]
  },
  noc: {
    label: 'NOC',
    description: 'Kelola aset dan monitoring jaringan tanpa akses buku kas.',
    permissions: [
      'dashboard:read',
      'inventory:read',
      'network-assets:read',
      'network-assets:write',
      'radius:read',
      'radius:write',
      'genieacs:read',
      'genieacs:write',
      'monitoring:read',
      'monitoring:write',
      'monitoring:check'
    ]
  },
  reseller_voucher: {
    label: 'Reseller Voucher',
    description: 'Jual dan kelola voucher hotspot, melihat member/tagihan yang terkait, tanpa akses kas pengeluaran.',
    permissions: [
      'dashboard:read',
      'reports:voucher:read',
      'radius:read',
      'radius:write'
    ]
  },
  collector: {
    label: 'Collector',
    description: 'Tukang tagihan pembayaran: melihat tagihan, kirim reminder, dan mencatat pembayaran.',
    permissions: [
      'dashboard:read',
      'billing-monitor:read',
      'customers:manage',
      'invoices:manage'
    ]
  },
  viewer: {
    label: 'Viewer',
    description: 'Lihat dashboard tanpa akses buku kas, laporan tagihan, atau pengaturan.',
    permissions: [
      'dashboard:read',
      'radius:read'
    ]
  }
};

const sessions = new Map();

function normalizeRole(role) {
  return ROLE_DEFINITIONS[role] ? role : 'viewer';
}

function permissionsForRole(role) {
  return ROLE_DEFINITIONS[normalizeRole(role)].permissions;
}

function publicRoles() {
  return Object.entries(ROLE_DEFINITIONS).map(([value, role]) => ({
    value,
    label: role.label,
    description: role.description,
    permissions: role.permissions
  }));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const normalized = String(password || '');
  const hash = crypto.scryptSync(normalized, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, encoded) {
  const [scheme, salt, hash] = String(encoded || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) {
    return false;
  }

  const expected = hashPassword(password, salt).split('$')[2];
  const actualBuffer = Buffer.from(hash, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  const role = normalizeRole(user.role);
  const lockedNasId = String(user.lockedNasId || user.resellerNasId || user.voucherNasId || '').trim();
  return {
    id: user.id,
    username: user.username,
    name: user.name || user.username,
    role,
    roleLabel: ROLE_DEFINITIONS[role].label,
    active: user.active !== false,
    lastLoginAt: user.lastLoginAt || '',
    createdAt: user.createdAt || '',
    updatedAt: user.updatedAt || '',
    radbooxUsername: user.radbooxUsername || '',
    hasRadbooxPassword: Boolean(user.radbooxPasswordEnc || user.radbooxPassword),
    lockedNasId,
    lockedNasName: user.lockedNasName || '',
    resellerNasId: lockedNasId,
    permissions: permissionsForRole(role)
  };
}

function ensureDefaultUsers(data) {
  if (!Array.isArray(data.users)) {
    data.users = [];
  }
  if (data.users.length) {
    return false;
  }

  const now = new Date().toISOString();
  data.users.push({
    id: createId('usr'),
    username: process.env.APP_ADMIN_USERNAME || process.env.APP_OWNER_USERNAME || 'admin',
    name: process.env.APP_ADMIN_NAME || process.env.APP_OWNER_NAME || 'Admin Billing',
    role: 'admin',
    active: true,
    passwordHash: hashPassword(process.env.APP_ADMIN_PASSWORD || process.env.APP_OWNER_PASSWORD || 'billing123'),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: ''
  });
  return true;
}

function findUserByUsername(data, username) {
  const normalized = String(username || '').trim().toLowerCase();
  return (data.users || []).find((user) => String(user.username || '').toLowerCase() === normalized) || null;
}

function activeAdminCount(data) {
  return (data.users || []).filter((user) => user.active !== false && normalizeRole(user.role) === 'admin').length;
}

function userWithSession(user) {
  const safeUser = publicUser(user);
  return {
    ...safeUser,
    permissions: safeUser ? permissionsForRole(safeUser.role) : []
  };
}

function parseCookies(header = '') {
  return String(header || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const index = item.indexOf('=');
      if (index === -1) {
        return cookies;
      }
      const key = decodeURIComponent(item.slice(0, index).trim());
      const value = decodeURIComponent(item.slice(index + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function getSessionId(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[SESSION_COOKIE] || '';
}

function createSession(user) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, {
    userId: user.id,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  });
  return sessionId;
}

function destroySession(sessionId) {
  if (sessionId) {
    sessions.delete(sessionId);
  }
}

function sessionCookie(sessionId) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`
  ].join('; ');
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function requestUser(req, data) {
  const sessionId = getSessionId(req);
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  const user = (data.users || []).find((item) => item.id === session.userId && item.active !== false);
  if (!user) {
    sessions.delete(sessionId);
    return null;
  }

  session.expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  return userWithSession(user);
}

function hasPermission(user, permission) {
  if (!permission) {
    return true;
  }
  return Boolean(user && Array.isArray(user.permissions) && user.permissions.includes(permission));
}

function validateUsername(username) {
  const normalized = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(normalized)) {
    throw new Error('Username 3-40 karakter, gunakan huruf kecil, angka, titik, underscore, atau minus');
  }
  return normalized;
}

function validatePassword(password, required = true) {
  const normalized = String(password || '');
  if (!normalized && !required) {
    return '';
  }
  if (normalized.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password minimal ${PASSWORD_MIN_LENGTH} karakter`);
  }
  return normalized;
}

function createUser(data, payload = {}) {
  const username = validateUsername(payload.username);
  if (findUserByUsername(data, username)) {
    throw new Error('Username sudah digunakan');
  }

  const now = new Date().toISOString();
  const role = normalizeRole(payload.role || 'viewer');
  const lockedNasId = String(payload.lockedNasId || payload.resellerNasId || payload.voucherNasId || '').trim();
  const user = {
    id: createId('usr'),
    username,
    name: String(payload.name || username).trim(),
    role,
    active: payload.active !== false && payload.active !== 'false',
    passwordHash: hashPassword(validatePassword(payload.password)),
    radbooxUsername: String(payload.radbooxUsername || '').trim(),
    radbooxPasswordEnc: secureSecrets.encryptSecret(data, payload.radbooxPassword || ''),
    lockedNasId: role === 'reseller_voucher' ? lockedNasId : '',
    lockedNasName: role === 'reseller_voucher' ? String(payload.lockedNasName || '').trim() : '',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: ''
  };
  data.users.push(user);
  return publicUser(user);
}

function updateUser(data, userId, payload = {}) {
  const user = (data.users || []).find((item) => item.id === userId);
  if (!user) {
    return null;
  }

  const before = { ...user };

  if (payload.username) {
    const username = validateUsername(payload.username);
    const duplicate = findUserByUsername(data, username);
    if (duplicate && duplicate.id !== user.id) {
      throw new Error('Username sudah digunakan');
    }
    user.username = username;
  }

  if (typeof payload.name === 'string') {
    user.name = payload.name.trim() || user.username;
  }
  if (typeof payload.role === 'string') {
    user.role = normalizeRole(payload.role);
  }
  if (user.role === 'reseller_voucher') {
    user.lockedNasId = String(payload.lockedNasId || payload.resellerNasId || payload.voucherNasId || user.lockedNasId || '').trim();
    user.lockedNasName = String(payload.lockedNasName || user.lockedNasName || '').trim();
  } else {
    user.lockedNasId = '';
    user.lockedNasName = '';
  }
  if (payload.active !== undefined) {
    user.active = payload.active !== false && payload.active !== 'false';
  }
  if (payload.password) {
    user.passwordHash = hashPassword(validatePassword(payload.password));
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'radbooxUsername')) {
    user.radbooxUsername = String(payload.radbooxUsername || '').trim();
  }
  if (payload.radbooxPassword) {
    user.radbooxPasswordEnc = secureSecrets.encryptSecret(data, payload.radbooxPassword);
  }
  if (activeAdminCount(data) < 1) {
    Object.assign(user, before);
    throw new Error('Minimal harus ada satu admin aktif');
  }
  user.updatedAt = new Date().toISOString();
  return publicUser(user);
}

function deleteUser(data, userId, currentUserId) {
  if (userId === currentUserId) {
    throw new Error('User yang sedang login tidak bisa dihapus');
  }

  const index = (data.users || []).findIndex((item) => item.id === userId);
  if (index === -1) {
    return null;
  }

  const user = data.users[index];
  if (user.active !== false && normalizeRole(user.role) === 'admin' && activeAdminCount(data) <= 1) {
    throw new Error('Minimal harus ada satu admin aktif');
  }

  const [deleted] = data.users.splice(index, 1);
  return publicUser(deleted);
}

function radbooxCredentialsForUser(data = {}, user = {}) {
  const settings = data.settings?.radboox || {};
  const username = String(user.radbooxUsername || settings.actionUsername || settings.username || user.username || '').trim();
  const password = secureSecrets.decryptSecret(data, user.radbooxPasswordEnc)
    || secureSecrets.decryptSecret(data, settings.actionPasswordEnc)
    || settings.actionPassword
    || settings.password
    || '';
  if (!username || !password) {
    throw new Error('Kredensial Radboox user tidak tersedia');
  }
  return { username, password };
}

module.exports = {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  createUser,
  deleteUser,
  destroySession,
  ensureDefaultUsers,
  findUserByUsername,
  getSessionId,
  hashPassword,
  hasPermission,
  publicRoles,
  publicUser,
  radbooxCredentialsForUser,
  requestUser,
  sessionCookie,
  updateUser,
  verifyPassword
};
