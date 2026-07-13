'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const license = require('../src/license');

test('license duration presets validate against local machine code', () => {
  const machineCode = license.machineFingerprint();
  for (const duration of ['7d', '30d', '90d', '180d', '1y']) {
    const generated = license.generateLicense({ licensedTo: 'Test ISP', machineCode, duration });
    const validation = license.validateLicenseKey(generated.key, { machineCode });
    assert.equal(validation.ok, true);
    assert.match(generated.payload.expiresAt, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('lifetime license has no expiry date', () => {
  const machineCode = license.machineFingerprint();
  const generated = license.generateLicense({ licensedTo: 'Test ISP', machineCode, duration: 'lifetime' });
  const validation = license.validateLicenseKey(generated.key, { machineCode });
  assert.equal(validation.ok, true);
  assert.equal(generated.payload.expiresAt, '');
});

test('license generated from displayed HWID validates on the same server', () => {
  const machineCode = license.machineFingerprint();
  const generated = license.generateLicense({ licensedTo: 'Test ISP', machineCode, duration: '7d' });
  const validation = license.validateLicenseKey(generated.key);
  assert.equal(validation.ok, true);
  assert.equal(validation.machineCode, machineCode);
});

test('license is bound to machine code', () => {
  const machineCode = license.machineFingerprint();
  const generated = license.generateLicense({ licensedTo: 'Test ISP', machineCode, duration: '7d' });
  const validation = license.validateLicenseKey(generated.key, { machineCode: 'MC-AAAAA-BBBBB-CCCCC-DDDDD' });
  assert.equal(validation.ok, false);
});
