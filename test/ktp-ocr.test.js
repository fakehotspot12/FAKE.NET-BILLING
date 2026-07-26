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
  assert.equal(
    serverInternals.extractKtpNikFromOcrText('WIK ; &64720413099b0005'),
    '6472041309960005'
  );
  assert.equal(
    serverInternals.extractKtpNikFromOcrText('NIK + bY?20413099L0005'),
    '6472041309960005'
  );
  assert.equal(
    serverInternals.extractKtpNikFromOcrText('NIK: BH720413099b0005\nTempat/Tgl Lahir SAMARINDA 13-09-1996'),
    '6472041309960005'
  );
  assert.equal(
    serverInternals.extractKtpNikFromOcrText('NIK : 6472042309960005\nTempat/Tgl Lahir SAMARINDA, 13-09-1996'),
    '6472041309960005'
  );
  assert.equal(
    serverInternals.extractKtpNikFromOcrText('7\n647204130990005\n15091996\n08\n0397'),
    ''
  );
});
