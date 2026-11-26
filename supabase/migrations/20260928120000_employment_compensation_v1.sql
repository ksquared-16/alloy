-- =============================================================================
-- Staff & Workforce V2 · Slice 9 — Compensation terms
--
-- What this employment is paid, on what basis, and since when.
--
-- ── IT IS A HISTORY, NOT A FIELD ──
--
-- A mutable `pay_rate` column on `employments` would have been one line and would
-- have destroyed the only question anyone actually asks about pay: what were they
-- earning in March? A raise is not a correction — both rates were true, on
-- different dates — so terms are effective-dated rows and a new rate SUPERSEDES
-- the prior one instead of overwriting it. Nothing here is ever updated in place
-- except to close an open period.
--
-- ── GRAIN: EMPLOYMENT ──
--
-- The same reasoning as Qualifications and Availability. A person can work for two
-- organizations at two rates, so Person-global pay would be wrong the first time
-- that happened. `org_id` rides beside `employment_id` so a scoped read never has
-- to join to be safe.
--
-- ── WHAT THIS IS NOT ──
--
-- Not payroll. There is no run, no tax, no withholding, no benefit, no paycheck
-- and no provider here, and none of those may be inferred from a rate. Not labor
-- cost: cost is a PROJECTION over these terms and a time authority, computed when
-- asked, never stored as a financial transaction. Not a pay code: a pay code
-- classifies an occurrence of time, and Alloy has no time-occurrence authority to
-- attach one to (`staff_presence_events` records arrival and departure, and has no
-- break concept, so a duration derived from it is on-site time rather than
-- payroll-grade worked time).
--
-- ── SECURITY: TWO INDEPENDENT BOUNDARIES ──
--
-- Slice 3 shipped four tables with RLS off, and a default privilege meant every
-- authenticated principal could read every organization's credentials. That must
-- not recur, and compensation is the most sensitive fact in the Staff domain, so
-- this migration closes BOTH doors in the file that opens them:
--
--   1. The default `authenticated` grant is REVOKED. Unlike every other staff
--      table, no browser principal reaches these rows at all; the application
--      reads them through the service role and answers for the caller itself.
--   2. RLS is enabled with policies narrower than the Staff norm — owner and
--      admin only. `manager` and `ops` legitimately read qualifications and
--      availability to run a day; neither is a reason to see somebody's salary.
--
-- Either boundary alone would be enough to keep a stranger out. Both are present
-- because the cost of being wrong here is disclosing every employee's pay.
-- =============================================================================

create table if not exists public.employment_compensation_terms (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs(id) on delete cascade,
    employment_id uuid not null references public.employments(id) on delete cascade,

    -- HOURLY or SALARY. The basis decides how the amount is read, so the two
    -- travel together and the unit is constrained to match rather than trusted.
    pay_basis text not null check (pay_basis in ('hourly', 'salary')),
    rate_amount numeric(12, 2) not null check (rate_amount >= 0),
    rate_unit text not null check (rate_unit in ('hour', 'annual')),
    rate_currency text not null default 'USD' check (char_length(rate_currency) = 3),

    -- Open-ended by default: most terms end when the next raise begins, and a
    -- close date invented at insert time would be a guess about the future.
    effective_start date not null,
    effective_end date,

    -- The row this one replaces. History is kept, never overwritten.
    supersedes_id uuid references public.employment_compensation_terms(id),
    is_active boolean not null default true,
    note text,

    created_by uuid,
    created_at timestamptz not null default now(),
    updated_by uuid,
    updated_at timestamptz not null default now(),

    constraint employment_compensation_end_after_start
        check (effective_end is null or effective_end >= effective_start),
    -- An hourly annual rate is a data-entry error that would read as a 30x pay cut.
    constraint employment_compensation_basis_unit
        check ((pay_basis = 'hourly' and rate_unit = 'hour')
            or (pay_basis = 'salary' and rate_unit = 'annual')),
    constraint employment_compensation_not_self_superseding
        check (supersedes_id is null or supersedes_id <> id)
);

create index if not exists employment_compensation_terms_employment_idx
    on public.employment_compensation_terms (org_id, employment_id, effective_start desc);

-- At most ONE open-ended active term per employment: two open rates is not a
-- history, it is an unanswerable question about what the person earns today.
create unique index if not exists employment_compensation_terms_one_open_idx
    on public.employment_compensation_terms (org_id, employment_id)
    where is_active and effective_end is null;

alter table public.employment_compensation_terms enable row level security;

-- BOUNDARY 1 — no browser principal reaches pay rows at all.
revoke all on public.employment_compensation_terms from authenticated;
revoke all on public.employment_compensation_terms from anon;

-- BOUNDARY 2 — and if a grant is ever restored, RLS still admits only owner/admin.
drop policy if exists employment_compensation_terms_service_all on public.employment_compensation_terms;
create policy employment_compensation_terms_service_all
    on public.employment_compensation_terms for all
    using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists employment_compensation_terms_org_owner_select on public.employment_compensation_terms;
create policy employment_compensation_terms_org_owner_select
    on public.employment_compensation_terms for select
    using (has_org_role(org_id, array['owner', 'admin']));

drop policy if exists employment_compensation_terms_org_owner_insert on public.employment_compensation_terms;
create policy employment_compensation_terms_org_owner_insert
    on public.employment_compensation_terms for insert
    with check (has_org_role(org_id, array['owner', 'admin']));

drop policy if exists employment_compensation_terms_org_owner_update on public.employment_compensation_terms;
create policy employment_compensation_terms_org_owner_update
    on public.employment_compensation_terms for update
    using (has_org_role(org_id, array['owner', 'admin']))
    with check (has_org_role(org_id, array['owner', 'admin']));

comment on table public.employment_compensation_terms is
    'Effective-dated compensation terms for one employment. History, not a field: a raise supersedes rather than overwrites. Not payroll, not labor cost, not a pay code.';

-- ---------------------------------------------------------------------------
-- THE CAPABILITIES.
--
-- Two keys, not one: a principal who may SEE a rate is not thereby a principal
-- who may CHANGE one, and collapsing them would make every viewer a raise-giver.
--
-- They are catalogued here because a declared capability that no catalog seeds is
-- worse than no capability at all — it cannot be granted, so the feature would be
-- permanently unreachable rather than fail-closed-until-granted. The route table
-- test caught exactly that and is the reason this block exists.
--
-- Group `workforce`, deliberately NOT `financials`. Financials answers what the
-- organization earns and owes; this answers what it pays one person. Filing pay
-- under Financials would hand every bookkeeper the payroll file by accident.
-- ---------------------------------------------------------------------------
insert into public.permission_definitions (key, label, group_key, description)
values
    ('staff.compensation.read', 'View staff compensation', 'workforce',
     'See an employment''s compensation terms and effective history. Deliberately separate from every other staff read: qualifications and availability are read to run a day, and a salary is not.'),
    ('staff.compensation.write', 'Manage staff compensation', 'workforce',
     'Record a new effective-dated compensation term, superseding the open one. Creates no payroll run and no financial transaction.')
on conflict (key) do update
   set label = excluded.label,
       group_key = excluded.group_key,
       description = excluded.description,
       is_active = true;

-- The `admin` role carries every catalogued capability, which is the
-- estate's existing doctrine rather than a judgement made here. OPS is
-- deliberately NOT granted: the RLS policies above admit owner and admin only,
-- and a grant that the database would refuse is a promise the product cannot keep.
-- Joined to `role_definitions`, not cross-joined against every org: not every
-- organization defines an administrator role, and inventing the grant row for one
-- that does not violates the (org_id, role_key) foreign key. The join is also the
-- honest statement of intent — grant this to the administrator role WHERE THAT
-- ROLE EXISTS, rather than asserting every tenant has one.
insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
select rd.org_id, rd.role_key, k.permission_key, true
from public.role_definitions rd
cross join (values ('staff.compensation.read'), ('staff.compensation.write')) as k(permission_key)
where rd.role_key = 'admin'
on conflict (org_id, role_key, permission_key) do nothing;
