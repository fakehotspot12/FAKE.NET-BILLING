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
    '080000000001',
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
  assert.match(data.customers[0].code, /^22\d{9}$/);
  assert.notEqual(data.customers[0].code, 'bejo@kampung.net');
  assert.equal(data.customers[0].countsAsPsb, false);
  assert.equal(data.customers[0].recordOrigin, 'import');
  assert.equal(serverInternals.dashboardRadiusServiceSummary(data, 'pppoe', '2026-06').psb, 0);
});

test('PPP-DHCP import can explicitly count a current installation as PSB', () => {
  const data = createDefaultStore();
  data.radiusProfiles.push({ id: 'profile-10m', name: '10M', serviceType: 'pppoe', price: 150000, active: true });
  data.radiusNas.push({ id: 'nas-site-a', name: 'SITE-A', address: '10.10.10.1', active: true });

  const summary = serverInternals.importPppUsers(data, [{
    username: 'psb-import@test',
    password: 'secret',
    type: 'PPPoE',
    profile: '10M',
    nas: 'SITE-A',
    service_name: 'internet',
    add_to_member: 'yes',
    member_name: 'PSB Import',
    whatsapp: '080000000003',
    active_date: '15/07/2099',
    count_as_psb: 'yes',
    invoice_status: 'paid'
  }], { name: 'Admin', username: 'admin' });

  assert.equal(summary.errors.length, 0);
  assert.equal(data.radiusUsers[0].serviceName, 'internet');
  assert.equal(data.customers[0].countsAsPsb, true);
  assert.equal(data.customers[0].recordOrigin, 'import');
  assert.equal(serverInternals.dashboardRadiusServiceSummary(data, 'pppoe', '2099-07').psb, 1);
});

test('PPP-DHCP import normalizes Excel phone variants to local 08 format', () => {
  const data = createDefaultStore();
  data.radiusProfiles.push({ id: 'profile-10m', name: '10M', serviceType: 'pppoe', price: 150000, active: true });
  data.radiusNas.push({ id: 'nas-site-a', name: 'SITE-A', address: '10.10.10.1', active: true });
  const variants = [
    ['phone-62@test', '6285246713195'],
    ['phone-plus@test', '+62 852 4671 3195'],
    ['phone-eight@test', '85246713195'],
    ['phone-quote@test', "'085246713195"],
    ['phone-decimal@test', '85246713195.0'],
    ['phone-science@test', '8.5246713195E+10']
  ];

  const summary = serverInternals.importPppUsers(data, variants.map(([username, whatsapp], index) => ({
    username,
    password: 'secret',
    type: 'PPPoE',
    profile: '10M',
    nas: 'SITE-A',
    add_to_member: 'yes',
    member_name: `Pelanggan ${index + 1}`,
    whatsapp,
    active_date: '15/07/2099',
    invoice_status: 'paid'
  })), { name: 'Admin', username: 'admin' });

  assert.equal(summary.errors.length, 0);
  assert.equal(summary.created.length, variants.length);
  assert.deepEqual(data.customers.map((customer) => customer.whatsapp), Array(variants.length).fill('085246713195'));
});

test('PPP-DHCP XLSX import accepts common Whatsapp header aliases with apostrophe numbers', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('ppp_dhcp_users');
  worksheet.addRow(['username', 'password', 'type', 'profile', 'nas', 'add_to_member', 'member_name', 'No Telp/WA']);
  worksheet.addRow(['Data Import Terbaca mulai dari 5']);
  worksheet.addRow([]);
  worksheet.addRow([]);
  worksheet.addRow(['alias-phone@test', 'secret', 'PPPoE', '10M', 'SITE-A', 'yes', 'Alias Phone', "'085246713195"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const rows = await serverInternals.readWorkbookRowsFromBase64(buffer.toString('base64'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].no_telp_wa, "'085246713195");

  const data = createDefaultStore();
  data.radiusProfiles.push({ id: 'profile-10m', name: '10M', serviceType: 'pppoe', price: 150000, active: true });
  data.radiusNas.push({ id: 'nas-site-a', name: 'SITE-A', address: '10.10.10.1', active: true });
  const summary = serverInternals.importPppUsers(data, rows, { name: 'Admin', username: 'admin' });
  assert.equal(summary.errors.length, 0);
  assert.equal(data.customers[0].whatsapp, '085246713195');
});

test('PPP-DHCP XLSX import keeps whatsapp as the standard contact column', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('ppp_dhcp_users');
  worksheet.addRow(['no', 'username', 'password', 'type', 'profile', 'nas', 'add_to_member', 'member_name', 'whatsapp']);
  worksheet.addRow(['1', 'Contoh', 'password', 'PPPoE', '10M', 'SITE-A', 'yes', 'Contoh Saja', '080000000001']);
  worksheet.addRow(['2', 'Contoh 2', 'password', 'PPPoE', '10M', 'SITE-A', 'yes', 'Contoh Dua', '080000000002']);
  worksheet.addRow(['Data Import Terbaca mulai dari 5']);
  worksheet.addRow(['1', 'standard-whatsapp@test', 'secret', 'PPPoE', '10M', 'SITE-A', 'yes', 'Standard Whatsapp', "'085246713195"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const rows = await serverInternals.readWorkbookRowsFromBase64(buffer.toString('base64'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].whatsapp, "'085246713195");

  const data = createDefaultStore();
  data.radiusProfiles.push({ id: 'profile-10m', name: '10M', serviceType: 'pppoe', price: 150000, active: true });
  data.radiusNas.push({ id: 'nas-site-a', name: 'SITE-A', address: '10.10.10.1', active: true });
  const summary = serverInternals.importPppUsers(data, rows, { name: 'Admin', username: 'admin' });
  assert.equal(summary.errors.length, 0);
  assert.equal(data.customers[0].whatsapp, '085246713195');
});

test('PPP-DHCP import can infer phone from a non-standard contact column without using KTP', () => {
  const data = createDefaultStore();
  data.radiusProfiles.push({ id: 'profile-10m', name: '10M', serviceType: 'pppoe', price: 150000, active: true });
  data.radiusNas.push({ id: 'nas-site-a', name: 'SITE-A', address: '10.10.10.1', active: true });

  const summary = serverInternals.importPppUsers(data, [{
    username: 'infer-phone@test',
    password: 'secret',
    type: 'PPPoE',
    profile: '10M',
    nas: 'SITE-A',
    add_to_member: 'yes',
    member_name: 'Infer Phone',
    ktp: '6472010101010001',
    kontak_pelanggan: "'085246713195",
    active_date: '15/07/2099',
    invoice_status: 'paid'
  }], { name: 'Admin', username: 'admin' });

  assert.equal(summary.errors.length, 0);
  assert.equal(data.customers[0].whatsapp, '085246713195');
});

test('PPP-DHCP import error reports the Excel row and sequence number', () => {
  const data = createDefaultStore();
  const summary = serverInternals.importPppUsers(data, [{
    __row_number: 8,
    no: '4',
    username: 'user-error',
    password: 'secret',
    type: 'PPPoE',
    profile: '',
    nas: 'SITE-A'
  }], { name: 'Admin', username: 'admin' });

  assert.equal(summary.created.length, 0);
  assert.deepEqual(summary.errors, [{
    row: 8,
    no: '4',
    username: 'user-error',
    error: 'Profile wajib diisi'
  }]);
});

test('PPP-DHCP XLSX template uses styled headers and local date format', async () => {
  const buffer = await serverInternals.pppImportTemplateBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet('ppp_dhcp_users');
  const headers = worksheet.getRow(1).values.slice(1);
  const activeDateColumn = headers.indexOf('active_date') + 1;
  const todayParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());

  assert.equal(worksheet.getCell('A1').fill.pattern, 'solid');
  assert.equal(worksheet.getCell('A1').fill.fgColor.argb, 'FF1769AA');
  assert.equal(worksheet.getCell('A1').font.color.argb, 'FFFFFFFF');
  assert.equal(worksheet.getCell('A1').font.bold, true);
  assert.equal(worksheet.getCell('A1').value, 'No');
  assert.equal(worksheet.getRow(1).height, 30);
  assert.equal(worksheet.getCell(2, activeDateColumn).value, todayParts);
  assert.equal(worksheet.getCell('A4').value, 'Data Import Terbaca mulai dari 5');
  assert.equal(worksheet.getCell('A4').isMerged, true);
  assert.equal(worksheet.getRow(4).height, 34);
  assert.ok(!headers.includes('service_name'));
  assert.ok(headers.includes('count_as_psb'));

  const templateRows = await serverInternals.readWorkbookRowsFromBase64(buffer.toString('base64'));
  assert.equal(templateRows.length, 0);
});

test('PPP-DHCP XLSX template starts import data at Excel row 5', async () => {
  const buffer = await serverInternals.pppImportTemplateBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet('ppp_dhcp_users');
  const headers = worksheet.getRow(1).values.slice(1);
  const values = {
    No: '1',
    username: 'uji-row-5',
    password: 'rahasia',
    type: 'PPPoE',
    profile: '10M',
    nas: 'SITE-A'
  };
  headers.forEach((header, index) => {
    if (Object.prototype.hasOwnProperty.call(values, header)) {
      worksheet.getCell(5, index + 1).value = values[header];
    }
  });

  const nextBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const rows = await serverInternals.readWorkbookRowsFromBase64(nextBuffer.toString('base64'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].__row_number, 5);
  assert.equal(rows[0].no, '1');
  assert.equal(rows[0].username, 'uji-row-5');
});
