-- PostgreSQL 14+ / Neon. O script é idempotente e pode ser executado novamente.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null,
  name text not null,
  picture_url text,
  last_login_at timestamptz,
  last_seen_at timestamptz,
  last_logout_at timestamptz,
  login_count integer not null default 0 check (login_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_lower_idx on users (lower(email));
create index if not exists users_last_seen_at_idx on users (last_seen_at desc nulls last);

create table if not exists login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  logged_in_at timestamptz not null default now()
);

create index if not exists login_events_user_id_logged_in_at_idx
  on login_events (user_id, logged_in_at desc);

create table if not exists payment_orders (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  user_id uuid not null references users(id) on delete restrict,
  provider text not null default 'mercado_pago',
  provider_preference_id text,
  provider_plan_id text,
  provider_payment_id text,
  provider_subscription_id text,
  plan_code text not null check (plan_code in ('premium_monthly', 'premium_annual')),
  amount_cents integer not null check (amount_cents > 0),
  currency char(3) not null default 'BRL',
  status text not null,
  next_payment_at timestamptz,
  last_payment_status text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payment_orders add column if not exists provider_plan_id text;
alter table payment_orders add column if not exists provider_subscription_id text;
alter table payment_orders add column if not exists next_payment_at timestamptz;
alter table payment_orders add column if not exists last_payment_status text;
alter table payment_orders add column if not exists approved_at timestamptz;

create index if not exists payment_orders_user_created_at_idx
  on payment_orders (user_id, created_at desc);
create index if not exists payment_orders_provider_subscription_id_idx
  on payment_orders (provider_subscription_id) where provider_subscription_id is not null;
create index if not exists payment_orders_provider_plan_id_idx
  on payment_orders (provider_plan_id) where provider_plan_id is not null;

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete restrict,
  source_order_id uuid not null unique references payment_orders(id) on delete restrict,
  provider text not null,
  provider_subscription_id text not null unique,
  status text not null,
  next_payment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists entitlements (
  user_id uuid primary key references users(id) on delete cascade,
  plan_code text not null,
  active boolean not null default false,
  active_until timestamptz,
  source_order_id uuid references payment_orders(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists courtesy_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  granted_by_user_id uuid not null references users(id) on delete restrict,
  active boolean not null default true,
  active_until timestamptz,
  note varchar(200),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references users(id) on delete restrict
);

create index if not exists courtesy_grants_user_id_idx
  on courtesy_grants (user_id, granted_at desc);
create unique index if not exists courtesy_grants_one_active_per_user_idx
  on courtesy_grants (user_id) where active = true;

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table webhook_events add column if not exists payload jsonb not null default '{}'::jsonb;

create index if not exists webhook_events_processed_at_idx
  on webhook_events (processed_at desc);

create table if not exists property_searches (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  cnpj char(14) not null,
  company_name varchar(200) not null,
  service_type text not null check (service_type in ('previous', 'qualified', 'registration_view', 'digital_certificate')),
  state char(2) not null,
  city varchar(120) not null,
  purpose text not null check (purpose in ('supplier_analysis', 'credit_analysis', 'rights_protection', 'authorized_due_diligence', 'other_legitimate')),
  status text not null default 'prepared' check (status in ('prepared')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists property_searches_user_created_at_idx
  on property_searches (user_id, created_at desc) where deleted_at is null;
