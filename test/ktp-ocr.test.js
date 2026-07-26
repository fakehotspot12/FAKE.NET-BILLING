'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { __test: serverInternals } = require('../src/server');

test('extracts KTP NIK from OCR text', () => {
  assert.equal(
    serverInternals.extractKtpNikFromOcrText('NIK : 6472 0101 0101 0001'),
    '6472010101010001'
  );
  assert.equal(
    serverInternals.extractKtpNikFromOcrText('N1K 64.72.010101010001'),
    '6472010101010001'
  );
});
