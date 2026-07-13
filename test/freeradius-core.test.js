'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const freeradius = require('../src/freeradius-core');
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
