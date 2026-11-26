-- =============================================================================
-- Commercial Policies — Commercial-owned policy definitions (Commercial Execution)
-- =============================================================================
-- Policies belong to Commercial; the Commercial Execution Platform EVALUATES them
-- (most-specific-wins) so they MODIFY a Commercial Resolution's lines. Policies
-- never create charges and never post money — configuration only.
--
-- This is the Commercial-owned counterpart to the legacy financial_policies table.
-- It is scoped to COMMERCIAL keys (org / location / program / offering / variant),
-- NOT to Substrate-A service_id / rate_plan_id. financial_policies is left intact
-- for the legacy consumer and retired later with Substrate A.
--
-- Resolution-time policy types only: proration, discount, sibling_discount,
-- waiver, eligibility, approval. Payment-time policies (late_fee, nsf_fee,
-- grace_period, posting_review, refund, billing_cadence) stay in the Billing /
-- Money domain and never touch the commercial valuation.
--
-- Doctrine: docs/platform/core/commercial-execution-platform.md §7 (Policy stage).
-- =============================================================================

create table if not exists public.commercial_policies (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid not null references public.orgs (id) on delete cascade,
    scope_type      text not null check (scope_type in ('org', 'location', 'program', 'offering', 'variant')),
    location_id     uuid references public.locations (id) on delete cascade,
    program_key     text,
    offering_id     uuid references public.program_offerings (id) on delete cascade,
    variant_id      uuid references public.program_offering_variants (id) on delete cascade,
    policy_type     text not null check (policy_type in ('proration', 'discount', 'sibling_discount', 'waiver', 'eligibility', 'approval')),
    label           text,
    description     text,
    value           jsonb not null default '{}'::jsonb,
    effective_start date not null default '2000-01-01',
    effective_end   date,
    is_active       boolean not null default true,
    source_key      text not null default 'config',
    metadata        jsonb not null default '{}'::jsonb,
    created_by      uuid,
    updated_by      uuid,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    -- Each scope_type requires its own scope reference to be present.
    constraint commercial_policies_scope_ref_chk check (
        (scope_type = 'org')
        or (scope_type = 'location' and location_id is not null)
        or (scope_type = 'program' and program_key is not null)
        or (scope_type = 'offering' and offering_id is not null)
        or (scope_type = 'variant' and variant_id is not null)
    ),
    constraint commercial_policies_end_after_start check (effective_end is null or effective_end >= effective_start)
);

comment on table public.commercial_policies is
    'Commercial-owned policy definitions. Commercial Execution evaluates them (most-specific-wins) so they modify a Commercial Resolution. Resolution-time types only; never creates charges or posts money.';

create index if not exists idx_commercial_policies_org_type
    on public.commercial_policies (org_id, policy_type);
create index if not exists idx_commercial_policies_org_scope
    on public.commercial_policies (org_id, scope_type);

drop trigger if exists trg_commercial_policies_updated_at on public.commercial_policies;
create trigger trg_commercial_policies_updated_at
    before update on public.commercial_policies
    for each row execute function public.set_updated_at();

-- ── RLS: standard org-scoped 5-policy shape (identical to Commercial V1 tables) ──
alter table public.commercial_policies enable row level security;

drop policy if exists commercial_policies_select_org on public.commercial_policies;
create policy commercial_policies_select_org on public.commercial_policies for select to authenticated
    using (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

drop policy if exists commercial_policies_insert_org on public.commercial_policies;
create policy commercial_policies_insert_org on public.commercial_policies for insert to authenticated
    with check (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

drop policy if exists commercial_policies_update_org on public.commercial_policies;
create policy commercial_policies_update_org on public.commercial_policies for update to authenticated
    using (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    with check (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

drop policy if exists commercial_policies_delete_org on public.commercial_policies;
create policy commercial_policies_delete_org on public.commercial_policies for delete to authenticated
    using (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

drop policy if exists commercial_policies_all_service_role on public.commercial_policies;
create policy commercial_policies_all_service_role on public.commercial_policies for all to service_role
    using (true) with check (true);

grant select, insert, update, delete on table public.commercial_policies to authenticated;
grant all on table public.commercial_policies to service_role;
