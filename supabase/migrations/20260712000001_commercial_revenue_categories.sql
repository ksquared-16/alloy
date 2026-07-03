-- =============================================================================
-- Commercial Revenue Categories — the Accounting-facing reference + GL mapping
-- =============================================================================
-- Doctrine: Commercial products carry a free-text `revenue_category` label.
-- Accounting owns the mapping from that label to a GL code. This table is that
-- mapping surface — operator-managed, org-scoped, minimal. No posting engine.
--
-- Non-destructive, additive. Consistent with the commercial family: no RLS
-- (protection at the API layer via service-role admin client + org scoping).
-- =============================================================================

set search_path to public;

create table if not exists public.commercial_revenue_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  label       text not null,
  gl_code     text,                                  -- placeholder; Accounting owns the chart of accounts
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  constraint commercial_revenue_categories_org_label_unique unique (org_id, label)
);

comment on table public.commercial_revenue_categories is
  'Accounting-facing revenue categories. Commercial products reference a revenue_category label; this table maps that label to a GL code. Reference model, not a posting engine.';
comment on column public.commercial_revenue_categories.gl_code is
  'GL code placeholder. Accounting owns the chart-of-accounts mapping; this is the reference surface.';

create index if not exists idx_commercial_revenue_categories_org
  on public.commercial_revenue_categories (org_id);

grant select, insert, update, delete on table public.commercial_revenue_categories to authenticated;
grant all on table public.commercial_revenue_categories to service_role;
