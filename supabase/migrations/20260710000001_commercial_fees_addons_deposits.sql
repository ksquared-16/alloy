set search_path to public;

-- commercial_fees: required/triggered charges beyond tuition
create table commercial_fees (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  location_id   uuid references locations(id) on delete set null,
  program_key   text,
  name          text not null,
  description   text,
  fee_type      text not null check (fee_type in ('registration','application','materials','annual','other')),
  amount_cents  integer not null check (amount_cents >= 0),
  is_required   boolean not null default true,
  cadence_key   text,  -- null = one-time; 'monthly'/'annual' = recurring
  is_active     boolean not null default true,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index on commercial_fees(org_id);
create index on commercial_fees(org_id, program_key) where program_key is not null;

-- commercial_addons: optional commercial products/services
create table commercial_addons (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  location_id   uuid references locations(id) on delete set null,
  program_key   text,
  name          text not null,
  description   text,
  addon_type    text not null check (addon_type in ('extended_care','enrichment','lunch','transport','other')),
  amount_cents  integer not null check (amount_cents >= 0),
  cadence_key   text not null,  -- 'monthly'|'weekly'|'per_session'|'one_time'
  is_active     boolean not null default true,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index on commercial_addons(org_id);

-- commercial_deposits: separate primitive (not a fee subtype) — refund lifecycle in Billing V2
create table commercial_deposits (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  location_id       uuid references locations(id) on delete set null,
  program_key       text,
  name              text not null,
  description       text,
  amount_cents      integer not null check (amount_cents >= 0),
  is_refundable     boolean not null default true,
  apply_to_balance  boolean not null default false,
  due_timing        text not null default 'at_enrollment' check (due_timing in ('at_enrollment','at_acceptance','at_contract','other')),
  is_active         boolean not null default true,
  metadata          jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
create index on commercial_deposits(org_id);
