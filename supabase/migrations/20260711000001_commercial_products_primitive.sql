-- =============================================================================
-- Commercial Product primitive + Commercial Categories configuration
-- =============================================================================
-- Doctrine: Fee / Add-on / Deposit are not separate entities — they are
-- `commercial_type` values of one Commercial Product primitive, differentiated
-- by typed `behavior`, not structure. Categories become operator-managed
-- configuration (no free-text categories in the primary model).
--
-- Non-destructive: the legacy tables (commercial_fees, commercial_addons,
-- commercial_deposits) are RETAINED as transitional storage. This migration
-- only adds the canonical model and backfills from them.
--
-- Tuition is intentionally NOT collapsed here. Tuition remains
-- Program -> Offering -> Variant -> commercial_tuition_rates.
--
-- Consistent with the commercial family: no RLS (protection at the API layer
-- via service-role admin client + org scoping), matching commercial_fees etc.
-- =============================================================================

set search_path to public;

-- -----------------------------------------------------------------------------
-- 1. commercial_categories — org-scoped, operator-managed configuration
-- -----------------------------------------------------------------------------
create table if not exists public.commercial_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  key         text not null,
  label       text not null,
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  constraint commercial_categories_org_key_unique unique (org_id, key)
);

comment on table public.commercial_categories is
  'Operator-managed commercial product categories (childcare merchandising groups). Distinct from revenue_category, which is the Accounting-facing GL reference.';

create index if not exists idx_commercial_categories_org
  on public.commercial_categories (org_id);

-- -----------------------------------------------------------------------------
-- 2. commercial_products — the canonical primitive
-- -----------------------------------------------------------------------------
create table if not exists public.commercial_products (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  location_id       uuid references public.locations(id) on delete set null,
  program_key       text,
  name              text not null,
  description       text,
  commercial_type   text not null check (commercial_type in ('fee','addon','deposit')),
  category_id       uuid references public.commercial_categories(id) on delete set null,
  amount_cents      integer not null check (amount_cents >= 0),
  cadence_key       text,                                  -- null = one-time
  revenue_category  text,                                  -- Accounting maps to GL
  effective_start   date,                                  -- null = active from day one
  effective_end     date,
  behavior          jsonb not null default '{}'::jsonb,    -- typed per commercial_type
  is_active         boolean not null default true,
  metadata          jsonb not null default '{}'::jsonb,
  -- Backfill provenance (nullable; only set for rows migrated from legacy tables)
  source_table      text,
  source_id         uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

comment on table public.commercial_products is
  'Canonical Commercial Product primitive. commercial_type in (fee|addon|deposit); behavior jsonb carries type-specific rules. Legacy commercial_fees/addons/deposits are transitional.';
comment on column public.commercial_products.behavior is
  'Typed behavior: fee={required:bool}; addon={package:{unit_count,unit_type,expires_days}}; deposit={refundable:bool,apply_to_balance:bool,due_timing:text}.';
comment on column public.commercial_products.source_table is
  'Transitional: name of the legacy table a backfilled row came from (commercial_fees|commercial_addons|commercial_deposits). Null for natively-created products.';

create index if not exists idx_commercial_products_org
  on public.commercial_products (org_id);
create index if not exists idx_commercial_products_org_type
  on public.commercial_products (org_id, commercial_type);
create index if not exists idx_commercial_products_org_category
  on public.commercial_products (org_id, category_id) where category_id is not null;
create index if not exists idx_commercial_products_org_program
  on public.commercial_products (org_id, program_key) where program_key is not null;

-- Idempotent backfill guard: one product per legacy source row
create unique index if not exists uq_commercial_products_source
  on public.commercial_products (source_table, source_id)
  where source_id is not null;

-- -----------------------------------------------------------------------------
-- 3. Seed default categories for every org
-- -----------------------------------------------------------------------------
insert into public.commercial_categories (org_id, key, label, sort_order, is_active)
select o.id, v.key, v.label, v.sort_order, true
from public.orgs o
cross join (
  values
    ('registration'::text,  'Registration'::text,   10::int),
    ('enrollment',          'Enrollment',           20),
    ('materials',           'Materials',            30),
    ('transportation',      'Transportation',       40),
    ('food',                'Food',                 50),
    ('enrichment',          'Enrichment',           60),
    ('other',               'Other',                99)
) as v (key, label, sort_order)
on conflict (org_id, key) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Backfill products from legacy tables (idempotent via source_table/source_id)
-- -----------------------------------------------------------------------------
-- Category resolution: best-effort match legacy free-text type to a seeded
-- category by case-insensitive label; fall back to the org's 'other' category.
-- Original free-text type is preserved in metadata.legacy_type.

-- 4a. Fees
insert into public.commercial_products (
  org_id, location_id, program_key, name, description, commercial_type,
  category_id, amount_cents, cadence_key, revenue_category,
  effective_start, effective_end, behavior, is_active, metadata,
  source_table, source_id, created_at, updated_at
)
select
  f.org_id, f.location_id, f.program_key, f.name, f.description, 'fee',
  coalesce(
    (select c.id from public.commercial_categories c
       where c.org_id = f.org_id and lower(c.label) = lower(f.fee_type) limit 1),
    (select c.id from public.commercial_categories c
       where c.org_id = f.org_id and c.key = 'other' limit 1)
  ),
  f.amount_cents, f.cadence_key, f.revenue_category,
  f.effective_start, f.effective_end,
  jsonb_build_object('required', f.is_required),
  f.is_active,
  coalesce(f.metadata, '{}'::jsonb) || jsonb_build_object('legacy_type', f.fee_type),
  'commercial_fees', f.id, f.created_at, f.updated_at
from public.commercial_fees f
on conflict (source_table, source_id) where source_id is not null do nothing;

-- 4b. Add-ons
insert into public.commercial_products (
  org_id, location_id, program_key, name, description, commercial_type,
  category_id, amount_cents, cadence_key, revenue_category,
  effective_start, effective_end, behavior, is_active, metadata,
  source_table, source_id, created_at, updated_at
)
select
  a.org_id, a.location_id, a.program_key, a.name, a.description, 'addon',
  coalesce(
    (select c.id from public.commercial_categories c
       where c.org_id = a.org_id and lower(c.label) = lower(a.addon_type) limit 1),
    (select c.id from public.commercial_categories c
       where c.org_id = a.org_id and c.key = 'other' limit 1)
  ),
  a.amount_cents, a.cadence_key, a.revenue_category,
  a.effective_start, a.effective_end,
  case
    when a.package_unit_count is not null then
      jsonb_build_object('package', jsonb_build_object(
        'unit_count',   a.package_unit_count,
        'unit_type',    a.package_unit_type,
        'expires_days', a.package_expires_days))
    else '{}'::jsonb
  end,
  a.is_active,
  coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object('legacy_type', a.addon_type),
  'commercial_addons', a.id, a.created_at, a.updated_at
from public.commercial_addons a
on conflict (source_table, source_id) where source_id is not null do nothing;

-- 4c. Deposits
insert into public.commercial_products (
  org_id, location_id, program_key, name, description, commercial_type,
  category_id, amount_cents, cadence_key, revenue_category,
  effective_start, effective_end, behavior, is_active, metadata,
  source_table, source_id, created_at, updated_at
)
select
  d.org_id, d.location_id, d.program_key, d.name, d.description, 'deposit',
  (select c.id from public.commercial_categories c
     where c.org_id = d.org_id and c.key = 'other' limit 1),
  d.amount_cents, null, d.revenue_category,
  d.effective_start, d.effective_end,
  jsonb_build_object(
    'refundable',       d.is_refundable,
    'apply_to_balance', d.apply_to_balance,
    'due_timing',       d.due_timing),
  d.is_active,
  coalesce(d.metadata, '{}'::jsonb),
  'commercial_deposits', d.id, d.created_at, d.updated_at
from public.commercial_deposits d
on conflict (source_table, source_id) where source_id is not null do nothing;

-- -----------------------------------------------------------------------------
-- Grants (consistent with commercial family — service role via admin client)
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on table public.commercial_categories to authenticated;
grant all on table public.commercial_categories to service_role;
grant select, insert, update, delete on table public.commercial_products to authenticated;
grant all on table public.commercial_products to service_role;
