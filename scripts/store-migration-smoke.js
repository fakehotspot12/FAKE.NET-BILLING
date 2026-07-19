'use strict';

const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const store = require('../src/store');

const databaseUrl = process.env.DATABASE_URL || '';
if (!databaseUrl || !/fakenet_billing_store_test/.test(databaseUrl)) {
  throw new Error('Smoke test hanya boleh memakai database fakenet_billing_store_test');
}

function psql(sql) {
  const result = spawnSync('psql', ['-X', '-q', '-d', databaseUrl, '-t', '-A'], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(result.stderr || 'psql gagal');
  return result.stdout.trim();
}

function item(prefix, index, extra = {}) {
  return {
    id: `${prefix}-${String(index).padStart(6, '0')}`,
    createdAt: '2026-07-19T00:00:00.000Z',
    notes: 'x'.repeat(320),
    ...extra
  };
}

async function main() {
  const legacy = store.createDefaultStore();
  legacy.customers = Array.from({ length: 798 }, (_, index) => item('customer', index, { name: `Pelanggan ${index}` }));
  legacy.invoices = Array.from({ length: 7230 }, (_, index) => item('invoice', index, { customerId: `customer-${String(index % 798).padStart(6, '0')}`, amount: 150000 }));
  legacy.payments = Array.from({ length: 7509 }, (_, index) => item('payment', index, { invoiceId: `invoice-${String(index % 7230).padStart(6, '0')}`, amount: 150000 }));
  legacy.waMessages = Array.from({ length: 143 }, (_, index) => item('wa', index, { status: 'sent', phone: `0812000${index}` }));
  legacy.activity = Array.from({ length: 80 }, (_, index) => item('activity', index, { type: 'test' }));
  const hex = Buffer.from(JSON.stringify(legacy), 'utf8').toString('hex');

  psql(`
    drop table if exists app_activity, app_wa_messages, app_payments, app_invoices, app_customers, app_store cascade;
    create table app_store (
      id text primary key,
      data jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    insert into app_store (id, data)
    values ('main', convert_from(decode('${hex}', 'hex'), 'UTF8')::jsonb);
  `);

  const migrationStarted = performance.now();
  const data = await store.loadStore();
  const migrationMs = performance.now() - migrationStarted;
  if (data.invoices.length !== 7230 || data.payments.length !== 7509 || data.customers.length !== 798) {
    throw new Error('Jumlah data berubah setelah migrasi');
  }
  const coreUpdatedAt = psql("select extract(epoch from updated_at)::text from app_store where id = 'main';");

  const cacheStarted = performance.now();
  for (let index = 0; index < 1000; index += 1) await store.loadStore();
  const cacheMs = performance.now() - cacheStarted;

  data.waMessages[0].status = 'read';
  const targetedWriteStarted = performance.now();
  await store.saveStore(data, { collections: ['waMessages'], includeCore: false });
  const targetedWriteMs = performance.now() - targetedWriteStarted;
  await store.saveStore(data, { collections: ['waMessages'], includeCore: false });

  const result = JSON.parse(psql(`
    select json_build_object(
      'coreHasCollections', data ?| array['customers','invoices','payments','waMessages','activity'],
      'customers', (select count(*) from app_customers),
      'invoices', (select count(*) from app_invoices),
      'payments', (select count(*) from app_payments),
      'waMessages', (select count(*) from app_wa_messages),
      'activity', (select count(*) from app_activity),
      'changedWaRows', (select count(*) from app_wa_messages where updated_at > created_at),
      'coreUpdatedAt', extract(epoch from updated_at)::text,
      'coreBytes', pg_column_size(data)
    )::text
    from app_store where id = 'main';
  `));
  if (result.coreHasCollections || result.changedWaRows !== 1 || result.coreUpdatedAt !== coreUpdatedAt) {
    throw new Error(`Write-diff tidak sesuai: ${JSON.stringify(result)}`);
  }

  process.stdout.write(`${JSON.stringify({ migrationMs: Math.round(migrationMs), cacheMs: Number(cacheMs.toFixed(2)), targetedWriteMs: Number(targetedWriteMs.toFixed(2)), ...result })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
