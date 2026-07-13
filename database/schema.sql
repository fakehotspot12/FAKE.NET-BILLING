create table if not exists app_settings (
  id smallint primary key default 1,
  business_name text not null default 'Kampung Net',
  default_due_day integer not null default 10 check (default_due_day between 1 and 28),
  currency text not null default 'IDR',
  package_prices jsonb not null default '{}'::jsonb,
  radboox_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  name text not null,
  role text not null default 'viewer',
  active boolean not null default true,
  password_hash text not null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_role_check check (role in ('owner', 'admin', 'finance', 'technician', 'noc', 'viewer'))
);

create unique index if not exists app_users_username_idx
  on app_users (lower(username));

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  external_id text,
  username text,
  name text not null,
  phone text,
  address text,
  package_name text,
  price numeric(14,2) not null default 0,
  status text not null default 'active',
  due_day integer not null default 10 check (due_day between 1 and 28),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_external_id_idx
  on customers (external_id)
  where external_id is not null and external_id <> '';

create unique index if not exists customers_username_idx
  on customers (lower(username))
  where username is not null and username <> '';

create index if not exists customers_status_idx on customers (status);
create index if not exists customers_package_idx on customers (package_name);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'generated',
  external_id text,
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null,
  username text,
  package_name text,
  period char(7) not null,
  amount numeric(14,2) not null default 0,
  due_date date,
  status text not null default 'pending',
  paid_at date,
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoices_external_id_idx
  on invoices (external_id)
  where external_id is not null and external_id <> '';

create unique index if not exists invoices_customer_period_idx
  on invoices (customer_id, period)
  where customer_id is not null;

create index if not exists invoices_period_status_idx on invoices (period, status);
create index if not exists invoices_due_date_idx on invoices (due_date);

create table if not exists monthly_earnings (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'radboox',
  external_id text,
  period char(7) not null,
  amount numeric(14,2) not null default 0,
  transaction_count integer not null default 0,
  note text,
  raw jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists monthly_earnings_source_period_idx
  on monthly_earnings (source, period);

create table if not exists external_incomes (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  receipt_no text,
  category text not null,
  payer_name text,
  item_name text,
  description text,
  amount numeric(14,2) not null default 0,
  payment_method text,
  status text not null default 'active',
  void_reason text,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_incomes_date_idx on external_incomes (date);
create index if not exists external_incomes_category_idx on external_incomes (category);
create index if not exists external_incomes_receipt_no_idx on external_incomes (receipt_no);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  amount numeric(14,2) not null default 0,
  paid_at date not null,
  method text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists payments_paid_at_idx on payments (paid_at);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category text not null,
  vendor text,
  description text,
  amount numeric(14,2) not null default 0,
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on expenses (date);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text,
  name text not null,
  category text not null default 'Perangkat',
  unit text not null default 'pcs',
  quantity numeric(14,2) not null default 0,
  minimum_stock numeric(14,2) not null default 0,
  location text,
  vendor text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_status_idx on inventory_items (status);
create index if not exists inventory_items_category_idx on inventory_items (category);
create index if not exists inventory_items_sku_idx on inventory_items (sku);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references inventory_items(id) on delete set null,
  item_name text,
  type text not null default 'in',
  quantity numeric(14,2) not null default 0,
  before_quantity numeric(14,2) not null default 0,
  after_quantity numeric(14,2) not null default 0,
  reference text,
  notes text,
  at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_item_idx on stock_movements (item_id);
create index if not exists stock_movements_at_idx on stock_movements (at);

create table if not exists network_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'Server',
  site text,
  location text,
  brand text,
  model text,
  serial_number text,
  owner text,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists network_assets_status_idx on network_assets (status);
create index if not exists network_assets_site_idx on network_assets (site);

create table if not exists monitoring_targets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host text not null,
  method text not null default 'snmp',
  snmp_version text not null default '2c',
  community text not null default 'public',
  oid text not null default '1.3.6.1.2.1.1.3.0',
  port integer not null default 161,
  asset_id uuid references network_assets(id) on delete set null,
  location text,
  timeout_ms integer not null default 3000,
  status text not null default 'unknown',
  last_checked_at timestamptz,
  last_latency_ms integer,
  last_value text,
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists monitoring_targets_status_idx on monitoring_targets (status);
create index if not exists monitoring_targets_host_idx on monitoring_targets (host);
create index if not exists monitoring_targets_oid_idx on monitoring_targets (oid);
create index if not exists expenses_category_idx on expenses (category);

create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_created_at_idx on activity (created_at desc);
