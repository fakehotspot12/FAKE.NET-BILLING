'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { createDefaultStore } = require('../src/store');
const { __test: serverInternals } = require('../src/server');

async function radbooxStyleWorkbookBase64() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Import User PPPoE');
  worksheet.addRow(['FORMAT IMPORT USER PPPoE DAN DHCP - RadbooX']);
  worksheet.addRow([
    'No',
    'Type User',
    'Username',
    'Password',
    'Profile',
    'Nas',
    'IP Address',
    'Service Name',
    'Add On Billing',
    'Full Name',
    'No KTP/SIM',
    'No. Whatsapp',
    'Email',
    'Address',
    'Payment Type',
    'Billing Period',
    'Create Invoice',
    'Invoice Status',
    'Active Date',
    'PPN %',
    'Discount %'
  ]);
  worksheet.addRow([1, 'PPPoE', 'contoh@radboox.net', 'contoh', 'Paket 2Mb', 'KAMPUNG.NET', '', '', 'Ya', 'Contoh', '', '085200000000', '', 'Alamat contoh', 'PASCABAYAR', 'Fixed Date', 'Yes', 'UNPAID', '2021-07-15']);
  worksheet.addRow([2, 'PPPoE', 'contoh2@radboox.net', 'contoh', 'Paket 2Mb', 'KAMPUNG.NET', '', '', 'Ya', 'Contoh 2', '', '085200000001', '', 'Alamat contoh', 'PASCABAYAR', 'Fixed Date', 'No', 'PAID', '2021-07-15']);
  worksheet.addRow([3, 'DHCP', 'AA:BB:CC:DD:EE:FF', '', 'Paket 2Mb', 'KAMPUNG.NET', '', '', 'Ya', 'Contoh DHCP', '', '085200000002', '', 'Alamat contoh', 'PASCABAYAR', 'Fixed Date', 'No', 'PAID', '2021-07-15']);
  worksheet.addRow(['Diatas adalah contoh, untuk menambahkan user yang akan di import, silahkan tambah setelah kolom ini mulai nomor 7']);
  worksheet.addRow([
    1,
    'PPPoE',
    'bejo@kampung.net',
    'bejo@kampung.net',
    'PAKET B SILVER 20 Mb',
    'KAMPUNG.NET',
    '',
    '',
    'Ya',
    'Bejo',
    '6472010101010001',
    '085246713195',
    'bejo@kampung.net',
    'ARAH PULAU ATAS | MAKROMAN ROMBONGAN 6 GANG PLN',
    'PASCABAYAR',
    'Fixed Date',
    'No',
    'Paid',
    46184,
    11,
    0
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}

test('imports Radboox PPP-DHCP XLSX header and active date', async () => {
  const data = createDefaultStore();
  data.radiusProfiles.push({
    id: 'profile-silver',
    name: 'PAKET B SILVER 20 Mb',
    serviceType: 'pppoe',
    price: 150000,
    active: true
  });
  data.radiusNas.push({
    id: 'nas-kampung',
    name: 'KAMPUNG.NET',
    address: '10.10.20.1',
    active: true
  });

  const rows = await serverInternals.readWorkbookRowsFromBase64(await radbooxStyleWorkbookBase64());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].active_date, '46184');
  assert.equal(rows[0].type_user, 'PPPoE');
  assert.equal(rows[0].add_on_billing, 'Ya');

  const summary = serverInternals.importPppUsers(data, rows, { name: 'Admin', username: 'admin' });
  assert.equal(summary.errors.length, 0);
  assert.equal(summary.created.length, 1);
  assert.equal(data.radiusUsers[0].username, 'bejo@kampung.net');
  assert.equal(data.radiusUsers[0].activeDate, '2026-06-11');
  assert.equal(data.customers.length, 1);
  assert.equal(data.customers[0].name, 'Bejo');
  assert.equal(data.customers[0].activeDate, '2026-06-11');
  assert.equal(data.customers[0].paymentType, 'postpaid');
  assert.equal(data.customers[0].billingPeriod, 'fixed');
  assert.equal(data.customers[0].firstInvoiceStatus, 'paid');
  assert.equal(data.customers[0].ppn, '11');
});
