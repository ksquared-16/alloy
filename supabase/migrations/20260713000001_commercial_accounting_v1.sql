-- =============================================================================
-- Accounting V1 — GL Accounts + Revenue Category → GL Account mapping
-- =============================================================================
-- Doctrine:
--   Commercial Product → Revenue Category → GL Account
--   Tuition Rate       → Revenue Category → GL Account
-- Accounting owns GL accounts and the Revenue Category → GL Account mapping.
-- Commercial NEVER stores GL codes directly — it references a revenue category.
--
-- Scope guardrails: no posting engine, no exports, no charge generation.
-- Non-destructive, additive. Consistent with the commercial family: no RLS
-- (protection at the API layer via service-role admin client + org scoping).
-- =============================================================================

set search_path to public;

-- -----------------------------------------------------------------------------
-- 1. GL Accounts — controlled chart of accounts (not free text)
-- -----------------------------------------------------------------------------
create table if not exists public.commercial_gl_accounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  account_name  text not null,
  account_code  text not null,
  account_type  text not null default 'revenue',
  is_active     boolean not null default true,
  sort_order    integer not null default 100,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,
  constraint commercial_gl_accounts_org_code_unique unique (org_id, account_code)
);

comment on table public.commercial_gl_accounts is
  'Accounting-owned chart of GL accounts. Revenue categories map to these; Commercial never stores GL codes directly.';

create index if not exists idx_commercial_gl_accounts_org
  on public.commercial_gl_accounts (org_id);

-- Seed a small default revenue chart per org (operator-editable).
insert into public.commercial_gl_accounts (org_id, account_name, account_code, account_type, sort_order)
select o.id, v.account_name, v.account_code, 'revenue', v.sort_order
from public.orgs o
cross join (
  values
    ('Tuition Revenue'::text,       '4000'::text, 10::int),
    ('Registration Revenue',        '4010',       20),
    ('Materials Revenue',           '4020',       30),
    ('Enrichment Revenue',          '4030',       40),
    ('Extended Care Revenue',       '4040',       50),
    ('Deposits Held (liability)',   '2100',       60),
    ('Other Revenue',               '4900',       99)
) as v (account_name, account_code, sort_order)
on conflict (org_id, account_code) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Revenue Categories — add mapping to a GL account (was: free-text gl_code)
-- -----------------------------------------------------------------------------
alter table public.commercial_revenue_categories
  add column if not exists mapped_gl_account_id uuid
    references public.commercial_gl_accounts(id) on delete set null;

comment on column public.commercial_revenue_categories.mapped_gl_account_id is
  'Accounting mapping: which GL account this revenue category posts to. Replaces the free-text gl_code (kept transitional).';

create index if not exists idx_commercial_revenue_categories_gl
  on public.commercial_revenue_categories (mapped_gl_account_id)
  where mapped_gl_account_id is not null;

-- -----------------------------------------------------------------------------
-- 3. Commercial Products — reference a configured Revenue Category (not free text)
-- -----------------------------------------------------------------------------
alter table public.commercial_products
  add column if not exists revenue_category_id uuid
    references public.commercial_revenue_categories(id) on delete set null;

comment on column public.commercial_products.revenue_category_id is
  'FK to commercial_revenue_categories. Preferred over free-text revenue_category (kept transitional for backfill).';

create index if not exists idx_commercial_products_revenue_category
  on public.commercial_products (revenue_category_id)
  where revenue_category_id is not null;

-- -----------------------------------------------------------------------------
-- 4. Tuition Rates — forward-compat reference to a Revenue Category
-- -----------------------------------------------------------------------------
-- V1: column only (nullable). UI wiring is the documented next step; tuition
-- pricing behavior is unchanged.
alter table public.commercial_tuition_rates
  add column if not exists revenue_category_id uuid
    references public.commercial_revenue_categories(id) on delete set null;

comment on column public.commercial_tuition_rates.revenue_category_id is
  'Forward-compat: Tuition Rate → Revenue Category → GL Account. Nullable; UI wiring is a next step.';

create index if not exists idx_commercial_tuition_rates_revenue_category
  on public.commercial_tuition_rates (revenue_category_id)
  where revenue_category_id is not null;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on table public.commercial_gl_accounts to authenticated;
grant all on table public.commercial_gl_accounts to service_role;
