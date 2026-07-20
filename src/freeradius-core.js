'use strict';

const { createId } = require('./store');

function text(value) {
  return String(value || '').trim();
}

function numberValue(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePaymentStatus(value) {
  const status = text(value).toLowerCase();
  if (status === 'free') return 'free';
  if (status === 'unpaid') return 'unpaid';
  return status ? 'paid' : '';
}

function parseDurationSeconds(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return 0;
  const number = Number(raw);
  if (Number.isFinite(number)) return Math.max(0, Math.trunc(number));
  const match = raw.match(/^(\d+(?:\.\d+)?)(m|menit|minute|minutes|h|hour|hours|j|jam|d|day|days)$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2];
  const factor = ['m', 'menit', 'minute', 'minutes'].includes(unit)
    ? 60
    : ['h', 'hour', 'hours', 'j', 'jam'].includes(unit)
      ? 3600
      : 86400;
  return Math.max(0, Math.trunc(amount * factor));
}

function parseBytes(value) {
  const raw = text(value).toLowerCase().replace(/\s+/g, '');
  if (!raw) return 0;
  const number = Number(raw);
  if (Number.isFinite(number)) return Math.max(0, Math.trunc(number));
  const match = raw.match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb|tb)$/);
  if (!match) return 0;
  const powers = { b: 0, kb: 1, mb: 2, gb: 3, tb: 4 };
  return Math.max(0, Math.trunc(Number(match[1]) * (1024 ** powers[match[2]])));
}

function normalizeExpiredMode(value) {
  const mode = text(value).toLowerCase().replace(/[\s_]+/g, '-');
  if (['remove', 'remove-record', 'notice', 'notice-record'].includes(mode)) return mode;
  if (['remove&record', 'remove-and-record'].includes(mode)) return 'remove-record';
  if (['notice&record', 'notice-and-record'].includes(mode)) return 'notice-record';
  return 'none';
}

function normalizeServiceType(value) {
  const type = text(value).toLowerCase();
  return ['pppoe', 'hotspot'].includes(type) ? type : 'pppoe';
}

function normalizeStaticIp(value) {
  const raw = text(value);
  if (!raw) return '';
  const octets = raw.split('.');
  const invalidMessage = 'IP static tidak valid. Gunakan IPv4 host yang bisa dipakai, bukan network/broadcast seperti .0 atau .255. Kosongkan untuk IP dinamis.';
  if (octets.length !== 4) throw new Error(invalidMessage);
  const numbers = octets.map((part) => {
    if (!/^\d{1,3}$/.test(part)) throw new Error(invalidMessage);
    const number = Number(part);
    if (!Number.isInteger(number) || number < 0 || number > 255) throw new Error(invalidMessage);
    return number;
  });
  const [first, , , last] = numbers;
  if (first === 0 || first >= 224 || last === 0 || last === 255) throw new Error(invalidMessage);
  return numbers.join('.');
}

function normalizeStatus(value) {
  const status = text(value).toLowerCase();
  if (['isolir', 'suspend', 'suspended'].includes(status)) return 'isolated';
  if (['terminate', 'terminated', 'berhenti', 'diberhentikan'].includes(status)) return 'terminated';
  if (['disable', 'disabled', 'inactive', 'nonaktif'].includes(status)) return 'disabled';
  if (['pending', 'unpaid', 'belum-bayar', 'belum bayar'].includes(status)) return 'pending';
  if (status === 'isolated') return 'isolated';
  if (status === 'active') return 'active';
  return 'active';
}

function profileServiceType(data = {}, profileId = '') {
  const profile = (data.radiusProfiles || []).find((item) => item.id === text(profileId)) || {};
  return profile.serviceType ? normalizeServiceType(profile.serviceType) : '';
}

function radiusUserServiceType(data = {}, input = {}, current = {}) {
  const profileId = input.profileId !== undefined ? input.profileId : current.profileId;
  const typeFromProfile = profileServiceType(data, profileId);
  if (typeFromProfile) return typeFromProfile;
  return normalizeServiceType(input.serviceType || current.serviceType);
}

function radiusUserPassword(username, password, serviceType) {
  return serviceType === 'hotspot' ? text(username) : text(password);
}

function profileGroupName(profile = {}) {
  const stableId = text(profile.id);
  if (stableId) return stableId.replace(/[^A-Za-z0-9_.:-]/g, '_');
  const label = text(profile.groupName || profile.group || profile.name);
  return label.replace(/[^A-Za-z0-9_.:-]/g, '_');
}

function clampPriority(value) {
  const number = Math.trunc(numberValue(value, 8));
  return Math.max(1, Math.min(8, number || 8));
}

function normalizeMikrotikRatePair(value, label = 'Rate Limit') {
  const raw = text(value);
  if (!raw) return '';
  const normalized = raw.replace(/\s*\/\s*/g, '/');
  const parts = normalized.split('/');
  const valid = parts.length <= 2 && parts.every((part) => /^(?:0|\d+(?:\.\d+)?[kKmMgG]?)$/.test(part));
  if (!valid) {
    throw new Error(`${label} tidak valid. Gunakan format RouterOS seperti 10M/10M atau 512k/2M.`);
  }
  return parts.map((part) => {
    const match = part.match(/^(.*?)([kKmMgG])?$/);
    if (!match?.[2]) return part;
    const suffix = match[2].toLowerCase() === 'k' ? 'k' : match[2].toUpperCase();
    return `${match[1]}${suffix}`;
  }).join('/');
}

function normalizeMikrotikTimePair(value, label = 'Burst Time') {
  const raw = text(value);
  if (!raw) return '';
  const normalized = raw.replace(/\s*\/\s*/g, '/').toLowerCase();
  const parts = normalized.split('/');
  const valid = parts.length <= 2 && parts.every((part) => /^\d+(?:\.\d+)?(?:ms|s|m|h|d|w)?$/.test(part));
  if (!valid) {
    throw new Error(`${label} tidak valid. Gunakan format RouterOS seperti 16s/16s.`);
  }
  return normalized;
}

function normalizeProfileBandwidth(input = {}, useMikrotikProfile = false) {
  if (useMikrotikProfile) {
    return {
      rateLimit: '',
      burstLimit: '',
      burstThreshold: '',
      burstTime: '',
      minRate: '',
      priority: clampPriority(input.priority)
    };
  }
  const bandwidth = {
    rateLimit: normalizeMikrotikRatePair(input.rateLimit, 'Rate Limit'),
    burstLimit: normalizeMikrotikRatePair(input.burstLimit, 'Burst Limit'),
    burstThreshold: normalizeMikrotikRatePair(input.burstThreshold, 'Burst Threshold'),
    burstTime: normalizeMikrotikTimePair(input.burstTime, 'Burst Time'),
    minRate: normalizeMikrotikRatePair(input.minRate, 'Min Rate'),
    priority: clampPriority(input.priority)
  };
  const hasDependentLimit = Boolean(
    bandwidth.burstLimit
    || bandwidth.burstThreshold
    || bandwidth.burstTime
    || bandwidth.minRate
  );
  if (!bandwidth.rateLimit && hasDependentLimit) {
    throw new Error('Rate Limit wajib diisi ketika Burst atau Min Rate digunakan.');
  }
  return bandwidth;
}

function normalizeQueueType(value, serviceType = 'pppoe') {
  const queueType = text(value).toLowerCase();
  if (!queueType) return '';
  const common = ['default', 'default-small', 'cake-default'];
  const allowed = normalizeServiceType(serviceType) === 'hotspot'
    ? [...common, 'hotspot-default']
    : [...common, 'pcq-default'];
  if (!allowed.includes(queueType)) {
    throw new Error(`Queue Type ${queueType} tidak didukung untuk ${normalizeServiceType(serviceType) === 'hotspot' ? 'Hotspot' : 'PPP-DHCP'}.`);
  }
  return queueType;
}

function queueTypeRouterValue(profile = {}) {
  const serviceType = normalizeServiceType(profile.serviceType);
  const queueType = normalizeQueueType(profile.queueType, serviceType);
  if (!queueType) return '';
  if (serviceType === 'pppoe') {
    if (queueType === 'pcq-default') return 'pcq-upload-default/pcq-download-default';
    return `${queueType}/${queueType}`;
  }
  return queueType;
}

function queueCarrierGroupName(profile = {}) {
  if (profile.useMikrotikProfile === true) return '';
  const queueType = normalizeQueueType(profile.queueType, profile.serviceType);
  if (!queueType) return '';
  const service = normalizeServiceType(profile.serviceType) === 'hotspot' ? 'HS' : 'PPP';
  return `FBQ-${service}-${queueType.replace(/[^a-z0-9]+/g, '-')}`;
}

function mikrotikRateLimit(profile = {}) {
  // RouterOS must inherit rate-limit from Mikrotik-Group when the profile is linked.
  if (profile.useMikrotikProfile === true) return '';
  const bandwidth = normalizeProfileBandwidth(profile, false);
  const rateLimit = bandwidth.rateLimit;
  if (!rateLimit) return '';
  const burstLimit = bandwidth.burstLimit;
  const burstThreshold = bandwidth.burstThreshold;
  const burstTime = bandwidth.burstTime;
  const priority = String(bandwidth.priority);
  const minRate = bandwidth.minRate;
  const hasExtendedLimit = Boolean(burstLimit || burstThreshold || burstTime || minRate || bandwidth.priority !== 8);
  if (!hasExtendedLimit) return rateLimit;
  const tokens = [rateLimit];
  tokens.push(burstLimit || rateLimit);
  tokens.push(burstThreshold || burstLimit || rateLimit);
  tokens.push(burstTime || '1s');
  tokens.push(priority);
  if (minRate) {
    tokens.push(minRate);
  }
  return tokens.join(' ');
}

function ensureArrays(data) {
  data.radiusNas = Array.isArray(data.radiusNas) ? data.radiusNas : [];
  data.radiusProfiles = Array.isArray(data.radiusProfiles) ? data.radiusProfiles : [];
  data.radiusUsers = Array.isArray(data.radiusUsers) ? data.radiusUsers : [];
  data.monitoringTargets = Array.isArray(data.monitoringTargets) ? data.monitoringTargets : [];
}

function booleanValue(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = text(value).toLowerCase();
  if (['1', 'true', 'yes', 'on', 'aktif', 'active'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'nonaktif', 'inactive'].includes(normalized)) return false;
  return fallback;
}

function radiusConfig(target = {}) {
  return target.radius && typeof target.radius === 'object' ? target.radius : {};
}

function radiusNasEntries(data, options = {}) {
  ensureArrays(data);
  const includeUnconfigured = options.includeUnconfigured === true;
  const entries = [];
  const seen = new Set();
  const pushEntry = (entry = {}) => {
    const id = text(entry.id || entry.nasname || entry.address || entry.name);
    const address = text(entry.address || entry.nasname || entry.host);
    if (!id || !address) return;
    const key = `${id.toLowerCase()}|${address.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({
      id,
      name: text(entry.name || entry.shortname || address),
      address,
      secret: text(entry.secret),
      type: text(entry.type) || 'mikrotik',
      ports: Math.max(0, Math.trunc(numberValue(entry.ports || entry.port, 3799))),
      site: text(entry.site || entry.location || entry.server),
      active: entry.active !== false,
      source: entry.source || 'radius'
    });
  };

  for (const item of data.radiusNas) {
    if (item.active === false && !includeUnconfigured) continue;
    pushEntry({ ...item, source: item.source || 'manual' });
  }

  for (const target of data.monitoringTargets) {
    const cfg = radiusConfig(target);
    const secret = text(cfg.secret || target.radiusSecret);
    const explicitEnabled = cfg.enabled !== undefined || target.radiusEnabled !== undefined;
    const enabled = booleanValue(cfg.enabled ?? target.radiusEnabled, Boolean(secret));
    if (!includeUnconfigured && (!enabled || !secret)) continue;
    pushEntry({
      id: text(cfg.id || target.radiusNasId || target.id),
      name: text(cfg.name || target.name),
      address: text(target.host || cfg.address || target.radiusAddress),
      secret,
      type: text(cfg.type || target.radiusType) || 'mikrotik',
      ports: Math.max(0, Math.trunc(numberValue(cfg.port || target.radiusPort, 3799))),
      site: text(target.location || target.name),
      active: target.status !== 'inactive' && (explicitEnabled ? enabled : Boolean(secret)),
      source: 'site'
    });
  }

  return entries.filter((entry) => includeUnconfigured || entry.active !== false);
}

function publicNas(nas = {}) {
  return { ...nas };
}

function publicProfile(profile = {}) {
  return { ...profile };
}

function publicRadiusUser(data, user = {}) {
  const profile = (data.radiusProfiles || []).find((item) => item.id === user.profileId) || {};
  const nas = radiusNasEntries(data, { includeUnconfigured: true }).find((item) => item.id === user.nasId) || {};
  const customer = (data.customers || []).find((item) => item.id === user.customerId) || {};
  const serviceType = radiusUserServiceType(data, user, user);
  return {
    ...user,
    serviceType,
    password: radiusUserPassword(user.username, user.password, serviceType),
    profileName: profile.name || '',
    nasName: nas.name || '',
    nasAddress: nas.address || '',
    customerName: customer.name || ''
  };
}

function addNas(data, input, actor) {
  ensureArrays(data);
  const name = text(input.name);
  const address = text(input.address);
  if (!name) throw new Error('Nama NAS wajib diisi');
  if (!address) throw new Error('IP/host NAS wajib diisi');
  const now = new Date().toISOString();
  const item = {
    id: createId('nas'),
    name,
    address,
    secret: text(input.secret),
    type: text(input.type) || 'mikrotik',
    ports: Math.max(0, Math.trunc(numberValue(input.ports, 3799))),
    site: text(input.site),
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
    updatedBy: actor?.name || actor?.username || 'Sistem'
  };
  data.radiusNas.push(item);
  return item;
}

function updateNas(data, id, input, actor) {
  ensureArrays(data);
  const item = data.radiusNas.find((nas) => nas.id === id);
  if (!item) throw new Error('NAS tidak ditemukan');
  item.name = text(input.name) || item.name;
  item.address = text(input.address) || item.address;
  item.secret = text(input.secret);
  item.type = text(input.type) || item.type || 'mikrotik';
  item.ports = Math.max(0, Math.trunc(numberValue(input.ports, item.ports || 3799)));
  item.site = text(input.site);
  item.active = input.active !== false;
  item.updatedAt = new Date().toISOString();
  item.updatedBy = actor?.name || actor?.username || 'Sistem';
  return item;
}

function deleteNas(data, id) {
  ensureArrays(data);
  const used = data.radiusUsers.some((user) => user.nasId === id);
  const index = data.radiusNas.findIndex((nas) => nas.id === id);
  if (index === -1) throw new Error('NAS tidak ditemukan');
  if (used) {
    data.radiusNas[index].active = false;
    data.radiusNas[index].updatedAt = new Date().toISOString();
    return data.radiusNas[index];
  }
  return data.radiusNas.splice(index, 1)[0];
}

function addProfile(data, input, actor) {
  ensureArrays(data);
  const name = text(input.name);
  if (!name) throw new Error('Nama profile wajib diisi');
  const now = new Date().toISOString();
  const useMikrotikProfile = input.useMikrotikProfile === true;
  const bandwidth = normalizeProfileBandwidth(input, useMikrotikProfile);
  const serviceType = normalizeServiceType(input.serviceType);
  const item = {
    id: createId('rpf'),
    name,
    groupName: text(input.groupName || input.group) || name,
    useMikrotikProfile,
    mikrotikGroup: text(input.mikrotikGroup || input.routerProfile),
    serviceType,
    queueType: useMikrotikProfile ? '' : normalizeQueueType(input.queueType, serviceType),
    ...bandwidth,
    validity: text(input.validity),
    validitySeconds: parseDurationSeconds(input.validitySeconds || input.validity),
    quota: text(input.quota),
    quotaBytes: parseBytes(input.quotaBytes || input.quota),
    sharedUsers: Math.max(1, Math.trunc(numberValue(input.sharedUsers, 1)) || 1),
    expiredMode: normalizeExpiredMode(input.expiredMode),
    triggerCoa: true,
    price: Math.max(0, Math.round(numberValue(input.price))),
    active: input.active !== false,
    note: text(input.note),
    createdAt: now,
    updatedAt: now,
    updatedBy: actor?.name || actor?.username || 'Sistem'
  };
  data.radiusProfiles.push(item);
  return item;
}

function updateProfile(data, id, input, actor) {
  ensureArrays(data);
  const item = data.radiusProfiles.find((profile) => profile.id === id);
  if (!item) throw new Error('Profile tidak ditemukan');
  const useMikrotikProfile = input.useMikrotikProfile === true;
  const bandwidth = normalizeProfileBandwidth(input, useMikrotikProfile);
  const serviceType = normalizeServiceType(input.serviceType || item.serviceType);
  item.name = text(input.name) || item.name;
  item.groupName = text(input.groupName || input.group) || item.groupName || item.name;
  item.useMikrotikProfile = useMikrotikProfile;
  item.mikrotikGroup = text(input.mikrotikGroup || input.routerProfile);
  item.serviceType = serviceType;
  item.queueType = useMikrotikProfile ? '' : normalizeQueueType(input.queueType, serviceType);
  Object.assign(item, bandwidth);
  item.validity = text(input.validity);
  item.validitySeconds = parseDurationSeconds(input.validitySeconds || input.validity);
  item.quota = text(input.quota);
  item.quotaBytes = parseBytes(input.quotaBytes || input.quota);
  item.sharedUsers = Math.max(1, Math.trunc(numberValue(input.sharedUsers, item.sharedUsers || 1)) || 1);
  item.expiredMode = normalizeExpiredMode(input.expiredMode || item.expiredMode);
  item.triggerCoa = true;
  item.price = Math.max(0, Math.round(numberValue(input.price)));
  item.active = input.active !== false;
  item.note = text(input.note);
  item.updatedAt = new Date().toISOString();
  item.updatedBy = actor?.name || actor?.username || 'Sistem';
  return item;
}

function deleteProfile(data, id) {
  ensureArrays(data);
  const used = data.radiusUsers.some((user) => user.profileId === id);
  const index = data.radiusProfiles.findIndex((profile) => profile.id === id);
  if (index === -1) throw new Error('Profile tidak ditemukan');
  if (used) {
    data.radiusProfiles[index].active = false;
    data.radiusProfiles[index].updatedAt = new Date().toISOString();
    return data.radiusProfiles[index];
  }
  return data.radiusProfiles.splice(index, 1)[0];
}

function addRadiusUser(data, input, actor) {
  ensureArrays(data);
  const username = text(input.username);
  if (!username) throw new Error('Username Radius wajib diisi');
  const exists = data.radiusUsers.some((user) => user.username.toLowerCase() === username.toLowerCase());
  if (exists) throw new Error('Username Radius sudah ada');
  const now = new Date().toISOString();
  const paymentStatus = normalizePaymentStatus(input.paymentStatus);
  const serviceType = radiusUserServiceType(data, input);
  const status = normalizeStatus(input.status);
  const isolated = status === 'isolated';
  const terminated = status === 'terminated';
  const item = {
    id: createId('rus'),
    username,
    password: radiusUserPassword(username, input.password, serviceType),
    serviceType,
    accessType: text(input.accessType || input.type || (serviceType === 'hotspot' ? 'Hotspot' : 'PPPoE')),
    serviceName: text(input.serviceName || input.service),
    profileId: text(input.profileId),
    nasId: text(input.nasId),
    customerId: text(input.customerId),
    staticIp: normalizeStaticIp(input.staticIp),
    callerId: text(input.callerId),
    status,
    isolatedAt: text(input.isolatedAt || input.isolationDate),
    isolationSource: isolated ? (text(input.isolationSource || input.isolatedSource) || 'manual') : '',
    isolationReason: isolated ? text(input.isolationReason || input.suspendReason) : '',
    isolatedByName: isolated ? text(input.isolatedByName || actor?.name || actor?.username) : '',
    isolatedByUsername: isolated ? text(input.isolatedByUsername || actor?.username) : '',
    isolatedByRole: isolated ? text(input.isolatedByRole || actor?.role) : '',
    terminatedAt: terminated ? (text(input.terminatedAt) || now.slice(0, 10)) : '',
    terminationSource: terminated ? (text(input.terminationSource || input.terminatedSource) || 'manual') : '',
    terminationReason: terminated ? text(input.terminationReason || input.terminateReason) : '',
    terminatedByName: terminated ? text(input.terminatedByName || actor?.name || actor?.username) : '',
    terminatedByUsername: terminated ? text(input.terminatedByUsername || actor?.username) : '',
    terminatedByRole: terminated ? text(input.terminatedByRole || actor?.role) : '',
    expiration: text(input.expiration),
    validUntil: text(input.validUntil),
    voucherMode: text(input.voucherMode),
    voucherBatchId: text(input.voucherBatchId),
    hotspotServer: text(input.hotspotServer || input.server),
    paymentStatus,
    paidAt: paymentStatus === 'paid' ? (text(input.paidAt) || now) : '',
    amount: paymentStatus === 'free' ? 0 : Math.max(0, Math.round(numberValue(input.amount || input.price))),
    activeDate: text(input.activeDate),
    note: text(input.note),
    createdAt: now,
    updatedAt: now,
    createdByName: actor?.name || actor?.username || 'Sistem',
    createdByUsername: actor?.username || '',
    createdByRole: actor?.role || '',
    updatedBy: actor?.name || actor?.username || 'Sistem'
  };
  data.radiusUsers.push(item);
  return item;
}

function updateRadiusUser(data, id, input, actor) {
  ensureArrays(data);
  const item = data.radiusUsers.find((user) => user.id === id);
  if (!item) throw new Error('User Radius tidak ditemukan');
  const username = text(input.username) || item.username;
  const exists = data.radiusUsers.some((user) => user.id !== id && user.username.toLowerCase() === username.toLowerCase());
  if (exists) throw new Error('Username Radius sudah ada');
  const serviceType = radiusUserServiceType(data, input, item);
  item.username = username;
  if (serviceType === 'hotspot' || text(input.password)) {
    item.password = radiusUserPassword(username, input.password || item.password, serviceType);
  }
  item.serviceType = serviceType;
  item.accessType = text(input.accessType || input.type || item.accessType || (item.serviceType === 'hotspot' ? 'Hotspot' : 'PPPoE'));
  if (Object.prototype.hasOwnProperty.call(input, 'serviceName') || Object.prototype.hasOwnProperty.call(input, 'service')) {
    item.serviceName = text(input.serviceName || input.service);
  }
  item.profileId = text(input.profileId);
  item.nasId = text(input.nasId);
  if (Object.prototype.hasOwnProperty.call(input, 'customerId')) {
    item.customerId = text(input.customerId);
  }
  item.staticIp = normalizeStaticIp(input.staticIp);
  item.callerId = text(input.callerId);
  const previousStatus = item.status;
  item.status = normalizeStatus(input.status);
  if (item.status === 'isolated' && previousStatus !== 'isolated' && !text(input.isolatedAt || item.isolatedAt)) {
    item.isolatedAt = new Date().toISOString().slice(0, 10);
  } else {
    item.isolatedAt = text(input.isolatedAt || input.isolationDate);
  }
  if (item.status === 'isolated') {
    item.isolationSource = text(input.isolationSource || input.isolatedSource || item.isolationSource)
      || (previousStatus !== 'isolated' ? 'manual' : '');
    item.isolationReason = text(input.isolationReason || input.suspendReason || item.isolationReason);
    item.isolatedByName = text(input.isolatedByName || actor?.name || actor?.username || item.isolatedByName);
    item.isolatedByUsername = text(input.isolatedByUsername || actor?.username || item.isolatedByUsername);
    item.isolatedByRole = text(input.isolatedByRole || actor?.role || item.isolatedByRole);
  } else {
    item.isolationSource = '';
    item.isolationReason = '';
    item.isolatedByName = '';
    item.isolatedByUsername = '';
    item.isolatedByRole = '';
  }
  if (item.status === 'terminated' && previousStatus !== 'terminated' && !text(input.terminatedAt || item.terminatedAt)) {
    item.terminatedAt = new Date().toISOString().slice(0, 10);
  } else if (item.status === 'terminated') {
    item.terminatedAt = text(input.terminatedAt || item.terminatedAt);
  } else {
    item.terminatedAt = '';
  }
  if (item.status === 'terminated') {
    item.terminationSource = text(input.terminationSource || input.terminatedSource || item.terminationSource)
      || (previousStatus !== 'terminated' ? 'manual' : '');
    item.terminationReason = text(input.terminationReason || input.terminateReason || item.terminationReason);
    item.terminatedByName = text(input.terminatedByName || actor?.name || actor?.username || item.terminatedByName);
    item.terminatedByUsername = text(input.terminatedByUsername || actor?.username || item.terminatedByUsername);
    item.terminatedByRole = text(input.terminatedByRole || actor?.role || item.terminatedByRole);
  } else {
    item.terminationSource = '';
    item.terminationReason = '';
    item.terminatedByName = '';
    item.terminatedByUsername = '';
    item.terminatedByRole = '';
  }
  item.expiration = text(input.expiration);
  item.validUntil = text(input.validUntil);
  item.voucherMode = text(input.voucherMode || item.voucherMode);
  item.voucherBatchId = text(input.voucherBatchId || item.voucherBatchId);
  item.hotspotServer = text(input.hotspotServer || input.server);
  const previousPaymentStatus = item.paymentStatus;
  item.paymentStatus = normalizePaymentStatus(input.paymentStatus || item.paymentStatus);
  if (item.paymentStatus === 'paid' && previousPaymentStatus !== 'paid' && !text(input.paidAt || item.paidAt)) {
    item.paidAt = new Date().toISOString();
  } else if (item.paymentStatus === 'paid') {
    item.paidAt = text(input.paidAt || item.paidAt);
  } else {
    item.paidAt = '';
  }
  item.amount = item.paymentStatus === 'free' ? 0 : Math.max(0, Math.round(numberValue(input.amount || input.price, item.amount || 0)));
  item.activeDate = text(input.activeDate || item.activeDate);
  item.note = text(input.note);
  item.updatedAt = new Date().toISOString();
  item.updatedBy = actor?.name || actor?.username || 'Sistem';
  return item;
}

function deleteRadiusUser(data, id) {
  ensureArrays(data);
  const index = data.radiusUsers.findIndex((user) => user.id === id);
  if (index === -1) throw new Error('User Radius tidak ditemukan');
  return data.radiusUsers.splice(index, 1)[0];
}

function freeradiusRows(data) {
  ensureArrays(data);
  const radcheck = [];
  const radreply = [];
  const radusergroup = [];
  const radgroupcheck = [];
  const radgroupreply = [];
  const nas = [];
  const radiusSettings = data.settings?.radius && typeof data.settings.radius === 'object'
    ? data.settings.radius
    : {};
  const accountingInterimIntervalSeconds = Math.max(0, Math.trunc(numberValue(radiusSettings.accountingInterimIntervalSeconds, 60)) || 0);

  for (const item of radiusNasEntries(data)) {
    nas.push({
      nasname: item.address,
      shortname: item.name,
      type: item.type || 'mikrotik',
      ports: item.ports || 3799,
      secret: item.secret || '',
      server: '',
      community: '',
      description: item.site || item.name
    });
  }

  for (const profile of data.radiusProfiles) {
    if (profile.active === false) continue;
    const groupname = profileGroupName(profile);
    if (!groupname) continue;
    const rateLimit = mikrotikRateLimit(profile);
    if (accountingInterimIntervalSeconds > 0) {
      radgroupreply.push({
        groupname,
        attribute: 'Acct-Interim-Interval',
        op: ':=',
        value: String(accountingInterimIntervalSeconds)
      });
    }
    if (profile.serviceType === 'pppoe') {
      radgroupreply.push({
        groupname,
        attribute: 'Service-Type',
        op: ':=',
        value: 'Framed-User'
      });
      radgroupreply.push({
        groupname,
        attribute: 'Framed-Protocol',
        op: ':=',
        value: 'PPP'
      });
    }
    if (rateLimit) {
      radgroupreply.push({
        groupname,
        attribute: 'Mikrotik-Rate-Limit',
        op: ':=',
        value: rateLimit
      });
    }
    const mikrotikGroup = profile.useMikrotikProfile === true
      ? text(profile.mikrotikGroup)
      : queueCarrierGroupName(profile);
    if (mikrotikGroup) {
      radgroupreply.push({
        groupname,
        attribute: 'Mikrotik-Group',
        op: ':=',
        value: mikrotikGroup
      });
    }
    if (profile.serviceType === 'hotspot') {
      const sharedUsers = Math.max(1, Math.trunc(numberValue(profile.sharedUsers, 1)) || 1);
      radgroupcheck.push({
        groupname,
        attribute: 'Simultaneous-Use',
        op: ':=',
        value: String(sharedUsers)
      });
      const validitySeconds = Math.max(0, Math.trunc(numberValue(profile.validitySeconds || parseDurationSeconds(profile.validity))));
      if (validitySeconds > 0) {
        radgroupreply.push({
          groupname,
          attribute: 'Session-Timeout',
          op: ':=',
          value: String(validitySeconds)
        });
      }
      const quotaBytes = Math.max(0, Math.trunc(numberValue(profile.quotaBytes || parseBytes(profile.quota))));
      if (quotaBytes > 0) {
        radgroupreply.push({
          groupname,
          attribute: 'Mikrotik-Total-Limit',
          op: ':=',
          value: String(quotaBytes)
        });
      }
    }
  }

  for (const user of data.radiusUsers) {
    const profile = data.radiusProfiles.find((item) => item.id === user.profileId) || {};
    const serviceType = radiusUserServiceType(data, user, user);
    const terminatedPortalAccess = user.status === 'terminated' && serviceType !== 'hotspot';
    if (['disabled', 'pending'].includes(user.status) || (user.status === 'terminated' && !terminatedPortalAccess)) continue;
    const userReplyStart = radreply.length;
    const isolation = data.settings?.radius && typeof data.settings.radius === 'object' ? data.settings.radius : {};
    const restrictedAccess = user.status === 'isolated' || terminatedPortalAccess;
    const restrictedWithNetworkOverride = restrictedAccess
      && (text(isolation.isolationMikrotikGroup) || text(isolation.isolationPool));
    radcheck.push({
      username: user.username,
      attribute: 'Cleartext-Password',
      op: ':=',
      value: radiusUserPassword(user.username, user.password, serviceType)
    });
    if (restrictedAccess) {
      const isolationRateLimit = text(isolation.isolationRateLimit) || '128k/128k';
      radreply.push({
        username: user.username,
        attribute: 'Mikrotik-Rate-Limit',
        op: ':=',
        value: isolationRateLimit
      });
      if (text(isolation.isolationMikrotikGroup)) {
        radreply.push({
          username: user.username,
          attribute: 'Mikrotik-Group',
          op: ':=',
          value: text(isolation.isolationMikrotikGroup)
        });
      }
      if (text(isolation.isolationPool)) {
        radreply.push({
          username: user.username,
          attribute: 'Framed-Pool',
          op: ':=',
          value: text(isolation.isolationPool)
        });
      }
      if (serviceType === 'pppoe') {
        radreply.push({
          username: user.username,
          attribute: 'Service-Type',
          op: ':=',
          value: 'Framed-User'
        });
        radreply.push({
          username: user.username,
          attribute: 'Framed-Protocol',
          op: ':=',
          value: 'PPP'
        });
      }
    }
    if (user.staticIp && !restrictedWithNetworkOverride) {
      radreply.push({
        username: user.username,
        attribute: 'Framed-IP-Address',
        op: ':=',
        value: user.staticIp
      });
    }
    if (user.callerId) {
      radcheck.push({
        username: user.username,
        attribute: 'Calling-Station-Id',
        op: '==',
        value: user.callerId
      });
    }
    if (user.expiration) {
      radcheck.push({
        username: user.username,
        attribute: 'Expiration',
        op: ':=',
        value: user.expiration
      });
    }
    const groupname = profileGroupName(profile);
    if (groupname && !restrictedWithNetworkOverride) {
      if (radreply.length > userReplyStart) {
        radreply.push({
          username: user.username,
          attribute: 'Fall-Through',
          op: '=',
          value: 'Yes'
        });
      }
      radusergroup.push({
        username: user.username,
        groupname,
        priority: 1
      });
    }
  }

  return { nas, radcheck, radreply, radusergroup, radgroupcheck, radgroupreply };
}

module.exports = {
  addNas,
  addProfile,
  addRadiusUser,
  deleteNas,
  deleteProfile,
  deleteRadiusUser,
  freeradiusRows,
  mikrotikRateLimit,
  normalizeQueueType,
  profileGroupName,
  publicNas,
  publicProfile,
  queueCarrierGroupName,
  queueTypeRouterValue,
  publicRadiusUser,
  radiusUserServiceType,
  radiusNasEntries,
  updateNas,
  updateProfile,
  updateRadiusUser
};
