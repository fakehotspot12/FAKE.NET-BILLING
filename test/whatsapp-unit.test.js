'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('gateway service supports a verified image override without requiring changes to existing env files', () => {
  const source = fs.readFileSync(path.join(__dirname, '../deploy/systemd/fakenet-billing-waha.service'), 'utf8');
  assert.match(source, /^Environment=WAHA_IMAGE=devlikeapro\/waha$/m);
  assert(source.indexOf('Environment=WAHA_IMAGE=') < source.indexOf('EnvironmentFile='));
  assert.match(source, /^ExecStart=.* \$\{WAHA_IMAGE\}$/m);
  assert.match(source, /-p 127\.0\.0\.1:\$\{WAHA_PORT\}:3000/);
  assert.match(source, /-v \/opt\/fakenet-billing-waha\/sessions:\/app\/\.sessions/);
  assert.doesNotMatch(source, /rm\s+(?:-[^ ]+\s+)*\/opt\/fakenet-billing-waha\/sessions/);
});

test('new gateway installations default to WEBJS while billing controls whether messages may be sent', () => {
  const source = fs.readFileSync(path.join(__dirname, '../deploy/fakenet-billing-waha.env'), 'utf8');
  assert.match(source, /^WHATSAPP_DEFAULT_ENGINE=WEBJS$/m);
  assert.match(source, /^WAHA_PRINT_QR=false$/m);
  assert.match(source, /^WAHA_PORT=8895$/m);
  const { createDefaultStore } = require('../src/store');
  assert.equal(createDefaultStore().settings.waGateway.enabled, false);
});
