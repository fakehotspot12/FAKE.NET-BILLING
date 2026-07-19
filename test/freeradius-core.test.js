'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const freeradius = require('../src/freeradius-core');
const freeradiusSessions = require('../src/freeradius-sessions');
const { createDefaultStore } = require('../src/store');

test('hotspot radius users always use username as password', () => {
  const data = createDefaultStore();
  const profile = freeradius.addProfile(data, {
    name: 'Voucher Hotspot',
    serviceType: 'hotspot'
  });

  const created = freeradius.addRadiusUser(data, {
    username: 'p4EdAv',
    password: 'rseU55',
    serviceType: 'pppoe',
    profileId: profile.id
  }, { username: 'admin', name: 'Admin' });

  assert.equal(created.serviceType, 'hotspot');
  assert.equal(created.password, 'p4EdAv');

  const updated = freeradius.updateRadiusUser(data, created.id, {
    username: 'p4EdAv2',
    password: 'another-random',
    profileId: profile.id,
    serviceType: 'hotspot'
  }, { username: 'admin', name: 'Admin' });

  assert.equal(updated.password, 'p4EdAv2');

  data.radiusUsers.push({
    id: 'legacy-hotspot',
    username: 'legacy001',
    password: 'old-random-pass',
    profileId: profile.id,
    serviceType: 'pppoe',
    status: 'active'
  });

  const publicUser = freeradius.publicRadiusUser(data, data.radiusUsers.at(-1));
  assert.equal(publicUser.serviceType, 'hotspot');
  assert.equal(publicUser.password, 'legacy001');
  assert.equal(freeradius.freeradiusRows(data).radcheck.find((row) => (
    row.username === 'legacy001' && row.attribute === 'Cleartext-Password'
  ))?.value, 'legacy001');
});

test('ppp static IP must be a usable host address', () => {
  const data = createDefaultStore();

  const dynamic = freeradius.addRadiusUser(data, {
    username: 'dynamic-user',
    password: 'secret',
    serviceType: 'pppoe',
    staticIp: ''
  }, { username: 'admin', name: 'Admin' });
  assert.equal(dynamic.staticIp, '');

  const valid = freeradius.addRadiusUser(data, {
    username: 'valid-user',
    password: 'secret',
    serviceType: 'pppoe',
    staticIp: '172.16.7.254'
  }, { username: 'admin', name: 'Admin' });
  assert.equal(valid.staticIp, '172.16.7.254');

  assert.throws(() => freeradius.addRadiusUser(data, {
    username: 'broadcast-user',
    password: 'secret',
    serviceType: 'pppoe',
    staticIp: '172.16.7.255'
  }, { username: 'admin', name: 'Admin' }), /IP static tidak valid/);

  assert.throws(() => freeradius.updateRadiusUser(data, valid.id, {
    username: 'valid-user',
    password: 'secret',
    serviceType: 'pppoe',
    staticIp: '172.16.7.0'
  }, { username: 'admin', name: 'Admin' }), /IP static tidak valid/);
});

test('linked MikroTik profile inherits RouterOS rate limit without Radius override', () => {
  const data = createDefaultStore();
  const profile = freeradius.addProfile(data, {
    name: 'Paket RouterOS',
    serviceType: 'pppoe',
    useMikrotikProfile: true,
    mikrotikGroup: 'Paket RouterOS',
    rateLimit: 'unlimited unlimited',
    burstLimit: 'unlimited unlimited'
  });
  freeradius.addRadiusUser(data, {
    username: 'linked-profile-user',
    password: 'secret',
    serviceType: 'pppoe',
    profileId: profile.id
  }, { username: 'admin', name: 'Admin' });

  assert.equal(profile.rateLimit, '');
  assert.equal(profile.burstLimit, '');
  const rows = freeradius.freeradiusRows(data);
  const groupName = freeradius.profileGroupName(profile);
  assert.ok(rows.radgroupreply.some((row) => (
    row.groupname === groupName
      && row.attribute === 'Mikrotik-Group'
      && row.value === 'Paket RouterOS'
  )));
  assert.equal(rows.radgroupreply.some((row) => (
    row.groupname === groupName && row.attribute === 'Mikrotik-Rate-Limit'
  )), false);

  profile.rateLimit = 'unlimited unlimited';
  assert.equal(freeradius.mikrotikRateLimit(profile), '');
  assert.equal(freeradius.freeradiusRows(data).radgroupreply.some((row) => (
    row.groupname === groupName && row.attribute === 'Mikrotik-Rate-Limit'
  )), false);
});

test('linked Hotspot profile inherits RouterOS profile while manual Hotspot keeps Radius limit', () => {
  const data = createDefaultStore();
  const linked = freeradius.addProfile(data, {
    name: 'Hotspot RouterOS',
    serviceType: 'hotspot',
    useMikrotikProfile: true,
    mikrotikGroup: 'Hotspot RouterOS',
    rateLimit: 'unlimited unlimited'
  });
  const manual = freeradius.addProfile(data, {
    name: 'Hotspot Manual 10M',
    serviceType: 'hotspot',
    useMikrotikProfile: false,
    rateLimit: '10M/10M'
  });

  const rows = freeradius.freeradiusRows(data).radgroupreply;
  const linkedGroup = freeradius.profileGroupName(linked);
  const manualGroup = freeradius.profileGroupName(manual);
  assert.ok(rows.some((row) => (
    row.groupname === linkedGroup
      && row.attribute === 'Mikrotik-Group'
      && row.value === 'Hotspot RouterOS'
  )));
  assert.equal(rows.some((row) => (
    row.groupname === linkedGroup && row.attribute === 'Mikrotik-Rate-Limit'
  )), false);
  assert.ok(rows.some((row) => (
    row.groupname === manualGroup
      && row.attribute === 'Mikrotik-Rate-Limit'
      && row.value === '10M/10M'
  )));
});

test('manual Hotspot and PPP profiles emit valid RouterOS rate limits', () => {
  const data = createDefaultStore();
  const hotspot = freeradius.addProfile(data, {
    name: 'Hotspot Manual',
    serviceType: 'hotspot',
    rateLimit: '10m / 10m'
  });
  const ppp = freeradius.addProfile(data, {
    name: 'PPP Manual Burst',
    serviceType: 'pppoe',
    rateLimit: '10M/20M',
    burstLimit: '20M/40M',
    burstThreshold: '8M/16M',
    burstTime: '16s/16s',
    minRate: '2M/4M',
    priority: 5
  });

  assert.equal(freeradius.mikrotikRateLimit(hotspot), '10M/10M');
  assert.equal(
    freeradius.mikrotikRateLimit(ppp),
    '10M/20M 20M/40M 8M/16M 16s/16s 5 2M/4M'
  );
});

test('manual profile fills a valid burst time and rejects malformed limits', () => {
  const data = createDefaultStore();
  const customPriority = freeradius.addProfile(data, {
    name: 'PPP Priority',
    serviceType: 'pppoe',
    rateLimit: '10M/10M',
    priority: 4
  });
  assert.equal(
    freeradius.mikrotikRateLimit(customPriority),
    '10M/10M 10M/10M 10M/10M 1s 4'
  );

  assert.throws(() => freeradius.addProfile(data, {
    name: 'Hotspot Invalid',
    serviceType: 'hotspot',
    rateLimit: '10 Mbps'
  }), /Rate Limit tidak valid/);
  assert.throws(() => freeradius.addProfile(data, {
    name: 'PPP Invalid Burst',
    serviceType: 'pppoe',
    rateLimit: '10M/10M',
    burstTime: 'secepatnya'
  }), /Burst Time tidak valid/);
});

test('manual profiles can select a shared RouterOS queue carrier', () => {
  const data = createDefaultStore();
  const hotspot = freeradius.addProfile(data, {
    name: 'Hotspot CAKE',
    serviceType: 'hotspot',
    rateLimit: '10M/10M',
    queueType: 'cake-default'
  });
  const ppp = freeradius.addProfile(data, {
    name: 'PPP PCQ',
    serviceType: 'pppoe',
    rateLimit: '20M/20M',
    queueType: 'pcq-default'
  });
  const rows = freeradius.freeradiusRows(data).radgroupreply;

  assert.equal(freeradius.queueCarrierGroupName(hotspot), 'FBQ-HS-cake-default');
  assert.equal(freeradius.queueTypeRouterValue(hotspot), 'cake-default');
  assert.equal(freeradius.queueCarrierGroupName(ppp), 'FBQ-PPP-pcq-default');
  assert.equal(freeradius.queueTypeRouterValue(ppp), 'pcq-upload-default/pcq-download-default');
  assert.ok(rows.some((row) => (
    row.groupname === freeradius.profileGroupName(hotspot)
      && row.attribute === 'Mikrotik-Group'
      && row.value === 'FBQ-HS-cake-default'
  )));
  assert.ok(rows.some((row) => (
    row.groupname === freeradius.profileGroupName(ppp)
      && row.attribute === 'Mikrotik-Group'
      && row.value === 'FBQ-PPP-pcq-default'
  )));
});

test('linked profiles ignore queue selection and unsupported service choices are rejected', () => {
  const data = createDefaultStore();
  const linked = freeradius.addProfile(data, {
    name: 'Linked PPP',
    serviceType: 'pppoe',
    useMikrotikProfile: true,
    mikrotikGroup: 'Paket RouterOS',
    queueType: 'cake-default'
  });
  assert.equal(linked.queueType, '');
  assert.equal(freeradius.queueCarrierGroupName(linked), '');

  assert.throws(() => freeradius.addProfile(data, {
    name: 'Hotspot PCQ Pair',
    serviceType: 'hotspot',
    rateLimit: '10M/10M',
    queueType: 'pcq-default'
  }), /Queue Type .* tidak didukung/);
});

test('stale session cleanup only closes an older duplicate with a fresh replacement', () => {
  const query = freeradiusSessions.__test.closeSupersededSessionsQuery();

  assert.match(query, /active_rank > 1/);
  assert.match(query, /replacement_started_at > ranked\.acctstarttime/);
  assert.match(query, /replacement_updated_at >=/);
  assert.match(query, /ranked\.updated_at </);
  assert.match(query, /Stale-Replaced/);
});
