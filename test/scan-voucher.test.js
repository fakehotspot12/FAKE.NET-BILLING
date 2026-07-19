'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const QRCode = require('qrcode');
const jsQrModule = require('../public/jsQR.js');

const jsQR = jsQrModule.default || jsQrModule;

function scannerParser(search = '') {
  const element = () => ({
    hidden: false,
    className: '',
    textContent: '',
    href: '',
    addEventListener() {},
    getContext() { return {}; }
  });
  const context = vm.createContext({
    URL,
    URLSearchParams,
    navigator: { userAgent: '', mediaDevices: {} },
    HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    document: {
      getElementById: element,
      addEventListener() {},
      forms: {}
    },
    window: {
      location: {
        href: `https://voucher.example.test/scan-voucher.html${search}`,
        search,
        origin: 'https://voucher.example.test',
        pathname: '/scan-voucher.html',
        hash: ''
      },
      history: { length: 1, back() {} },
      cancelAnimationFrame() {},
      addEventListener() {},
      setTimeout() {},
      opener: null
    }
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'scan-voucher.js'), 'utf8');
  vm.runInContext(`${source}\nglobalThis.__voucherLoginPayload = voucherLoginPayload;`, context);
  return context.__voucherLoginPayload;
}

test('scanner accepts current fragment and legacy query voucher URLs', () => {
  const parse = scannerParser();
  const current = parse('http://site.hotspot/login#fnb_autologin=1&username=Kode1&password=Pass1');
  assert.equal(current.username, 'Kode1');
  assert.equal(current.password, 'Pass1');
  assert.match(current.destination, /fnb_autologin=1/);

  const legacy = parse('http://site.hotspot/login?username=Kode2&password=Pass2');
  assert.equal(legacy.username, 'Kode2');
  assert.equal(legacy.password, 'Pass2');
  assert.equal(new URL(legacy.destination).searchParams.has('username'), false);
  assert.match(legacy.destination, /username=Kode2/);
});

test('scanner maps a plain voucher code to the captive return URL', () => {
  const returnUrl = encodeURIComponent('http://site.hotspot/login');
  const parse = scannerParser(`?return_url=${returnUrl}`);
  const payload = parse('VoucherBaru');
  assert.equal(payload.username, 'VoucherBaru');
  assert.equal(payload.password, 'VoucherBaru');
  assert.match(payload.destination, /^http:\/\/site\.hotspot\/login#/);
  assert.equal(parse('WIFI:S:Example;T:WPA;P:secret;;'), null);
});

test('printed voucher QR data survives an encode and decode roundtrip', () => {
  const value = 'http://site.hotspot/login#fnb_autologin=1&username=Kode3&password=Kode3';
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const quiet = 4;
  const scale = 8;
  const width = (qr.modules.size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  pixels.fill(255);
  for (let y = 0; y < qr.modules.size; y += 1) {
    for (let x = 0; x < qr.modules.size; x += 1) {
      if (!qr.modules.get(x, y)) continue;
      for (let offsetY = 0; offsetY < scale; offsetY += 1) {
        for (let offsetX = 0; offsetX < scale; offsetX += 1) {
          const pixel = (((y + quiet) * scale + offsetY) * width + ((x + quiet) * scale + offsetX)) * 4;
          pixels[pixel] = 0;
          pixels[pixel + 1] = 0;
          pixels[pixel + 2] = 0;
          pixels[pixel + 3] = 255;
        }
      }
    }
  }
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
  const decoded = jsQR(pixels, width, width, { inversionAttempts: 'attemptBoth' });
  assert.equal(decoded?.data, value);
});
