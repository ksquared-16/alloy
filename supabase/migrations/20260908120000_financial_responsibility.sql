-- ============================================================================================
-- WHO CONTRACTUALLY OWES THIS, AND WHERE IT IS EXPECTED TO BE FUNDED FROM.
--
-- Thread 10 finished the question "what does this family owe" — gross less discounts, credits and
-- adjustments. Thread 6 answers the next one, and the Director's decision fixes its hardest edge:
-- responsibility resolves to an EXPLICIT NAMED PARTY. It is never inferred from account ownership,
-- from being the primary contact, from being a parent or guardian, from the `payer` contact role,
-- from `resolved_obligations.responsibility_key = 'household'`, or from who happened to pay.
--
-- That decision has a direct consequence in this schema: when nothing says who owes a charge, the
-- honest answer is "nobody has said yet", and it must be RECORDED rather than quietly handed to
-- whichever adult sorted first. So an allocation may carry a null party and `is_unassigned = true`.
-- No fake person is created. The reconciliation invariant — allocations sum exactly to the net —
-- holds either way, because the unassigned row is a real row carrying real cents.
--
-- ── THREE TABLES, EACH OWNING ONE THING ──
--
--   arrangements   the INTENT: for this account (and optionally this child), over this window,
--                  responsibility is shared like so. Effective-dated, superseded, never edited.
--   shares         WHO, and HOW MUCH, within one arrangement.
--   allocations    the CONSEQUENCE: for one real charge, this party owes exactly these cents,
--                  against a snapshot of the net it was computed from.
--
-- ── WHAT THIS IS NOT ──
--
-- Not a balance. `buildFinancialsCardVM` remains the single balance authority and Thread 8 remains
-- the only thing that reduces outstanding. Allocations explain how one charge's net divides between
-- people; nothing here is summed to answer what is still owed.
--
-- Not a funding decision either. `financial_expected_funding` records where a party's own share is
-- EXPECTED to come from — an employer, a scholarship, a subsidy agency. Expected funding is not
-- payment, does not reduce outstanding, and does not make the funder responsible. Making an
-- external party contractually responsible takes an explicit arrangement share, like anyone else.
-- ============================================================================================

create extension if not exists btree_gist;

-- --------------------------------------------------------------------------------------------
-- ARRANGEMENTS — the intent, effective-dated.
-- --------------------------------------------------------------------------------------------
create table if not exists public.financial_responsibility_arrangements (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,

    -- Scope. The account always; ONE CHILD optionally, because a household can divide two
    -- children's tuition differently and an account-only model cannot say so.
    customer_id uuid not null references public.customers (id) on delete restrict,
    customer_member_id uuid references public.customer_members (id) on delete restrict,
    opportunity_customer_member_id uuid references public.opportunity_customer_members (id) on delete set null,

    effective_start date not null,
    /* NULL means open-ended. Superseding an arrangement closes it rather than deleting it. */
    effective_end date,

    state text not null default 'active' check (state in ('active', 'superseded')),
    /* What the operator is recording FROM — an agreement, a court order reference, a conversation. */
    source_key text,
    source_reference text,
    /*
     * A PLACE FOR A POLICY REFERENCE, AND NOTHING MORE. Separated/co-parent visibility policy is
     * deliberately undecided (Director decision 3), so this column claims no semantics: nothing
     * reads it, nothing branches on it, and it exists so a later decision has somewhere to land
     * without a migration that moves money.
     */
    visibility_policy_key text,

    supersedes_id uuid references public.financial_responsibility_arrangements (id) on delete restrict,
    superseded_by_id uuid references public.financial_responsibility_arrangements (id) on delete set null,

    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint financial_responsibility_arrangements_window_chk
        check (effective_end is null or effective_end >= effective_start)
);

/*
 * AMBIGUITY IS REFUSED BY THE DATABASE, NOT BY A READ.
 *
 * Two active arrangements whose windows overlap for one scope is not a hard question to answer
 * badly — some resolver picks one, and which party owes money depends on row order. `btree_gist`
 * lets the schema state the rule instead: for one org, one account and one child (the sentinel
 * stands in for "the whole account", so an account-wide arrangement and a child-specific one for
 * the same child cannot both be open), active effective windows may not overlap.
 */
alter table public.financial_responsibility_arrangements
    drop constraint if exists financial_responsibility_arrangements_no_overlap;
alter table public.financial_responsibility_arrangements
    add constraint financial_responsibility_arrangements_no_overlap
    exclude using gist (
        org_id with =,
        customer_id with =,
        coalesce(customer_member_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
        daterange(effective_start, effective_end, '[]') with &&
    ) where (state = 'active');

create index if not exists financial_responsibility_arrangements_scope_idx
    on public.financial_responsibility_arrangements (org_id, customer_id, customer_member_id, effective_start);

-- --------------------------------------------------------------------------------------------
-- SHARES — who, and how much, inside one arrangement.
-- --------------------------------------------------------------------------------------------
create table if not exists public.financial_responsibility_shares (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,
    arrangement_id uuid not null
        references public.financial_responsibility_arrangements (id) on delete cascade,

    /*
     * THE PARTY IS NAMED, AND IT IS A CANONICAL PERSON. Not a role, not a contact designation, not
     * a household. `persons` already owns human identity and this does not duplicate it.
     */
    responsible_party_type text not null default 'person' check (responsible_party_type in ('person')),
    responsible_party_id uuid not null references public.persons (id) on delete restrict,

    method text not null check (method in ('percentage', 'fixed', 'remainder')),
    /* Basis points, so 70% is 7000 and a third of a percent is expressible without a float. */
    percent_basis_points integer check (percent_basis_points between 0 and 10000),
    amount_cents bigint check (amount_cents >= 0),
    /* Order in which fixed shares are taken, and the order the certification can rely on. */
    priority integer not null default 100,

    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint financial_responsibility_shares_method_chk check (
        (method = 'percentage' and percent_basis_points is not null and amount_cents is null)
        or (method = 'fixed' and amount_cents is not null and percent_basis_points is null)
        or (method = 'remainder' and amount_cents is null and percent_basis_points is null)
    ),
    -- One person appears once in an arrangement; two rows for the same party is an authoring
    -- mistake that would silently double their share.
    constraint financial_responsibility_shares_party_unique unique (arrangement_id, responsible_party_id)
);

/* At most ONE remainder-taker: two would make "the rest" ambiguous in cents. */
create unique index if not exists financial_responsibility_shares_one_remainder
    on public.financial_responsibility_shares (arrangement_id)
    where method = 'remainder';

-- --------------------------------------------------------------------------------------------
-- ALLOCATIONS — the consequence, per charge.
-- --------------------------------------------------------------------------------------------
create table if not exists public.financial_responsibility_allocations (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,

    charge_id uuid not null references public.charges (id) on delete restrict,
    arrangement_id uuid references public.financial_responsibility_arrangements (id) on delete restrict,
    share_id uuid references public.financial_responsibility_shares (id) on delete set null,

    /*
     * NULL PARTY MEANS NOBODY HAS SAID YET, and `is_unassigned` says so out loud rather than
     * leaving a null to be interpreted. This is the Director's decision made structural: the
     * platform will hold unallocated cents in the open before it will name a responsible person it
     * has no record for.
     */
    responsible_party_type text check (responsible_party_type in ('person')),
    responsible_party_id uuid references public.persons (id) on delete restrict,
    is_unassigned boolean not null default false,

    assigned_amount_cents bigint not null,
    currency_code text not null default 'USD',

    /* THE NET THIS WAS COMPUTED FROM, snapshotted with its parts, so the number can be re-derived
       a year later even after the reductions behind it have been corrected. */
    net_snapshot_cents bigint not null,
    gross_snapshot_cents bigint not null,
    reductions_snapshot_cents bigint not null,

    basis text check (basis in ('percentage', 'fixed', 'remainder', 'unassigned')),
    basis_value integer,
    explanation text,

    period_key text,
    service_date date,

    state text not null default 'active' check (state in ('active', 'superseded')),
    supersedes_id uuid references public.financial_responsibility_allocations (id) on delete restrict,
    superseded_by_id uuid references public.financial_responsibility_allocations (id) on delete set null,

    idempotency_key text not null,

    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint financial_responsibility_allocations_party_chk check (
        (is_unassigned and responsible_party_id is null and responsible_party_type is null)
        or (not is_unassigned and responsible_party_id is not null and responsible_party_type is not null)
    )
);

create unique index if not exists financial_responsibility_allocations_idempotency_unique
    on public.financial_responsibility_allocations (org_id, idempotency_key);
create index if not exists financial_responsibility_allocations_charge_idx
    on public.financial_responsibility_allocations (org_id, charge_id, state);
create index if not exists financial_responsibility_allocations_party_idx
    on public.financial_responsibility_allocations (org_id, responsible_party_id, state);

-- --------------------------------------------------------------------------------------------
-- EXPECTED FUNDING — attached to one party's share, never a substitute for it.
-- --------------------------------------------------------------------------------------------
create table if not exists public.financial_expected_funding (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,

    /* Attached to the RESPONSIBILITY, which is what makes this funding and not a second payer. */
    arrangement_id uuid references public.financial_responsibility_arrangements (id) on delete cascade,
    share_id uuid references public.financial_responsibility_shares (id) on delete cascade,
    allocation_id uuid references public.financial_responsibility_allocations (id) on delete cascade,

    /* The Commercial Execution funding vocabulary, quoted rather than re-invented. */
    funding_source_type text not null check (funding_source_type in (
        'private_pay', 'government_subsidy', 'employer_sponsorship', 'scholarship', 'corporate_program'
    )),
    /* An agency or employer is not a `persons` row, so identity here is a label plus an optional
       external reference. Thread 9 owns the program/authorization store; this names the source. */
    funding_source_label text not null,
    funding_source_reference text,

    basis text not null check (basis in ('percentage', 'fixed_amount')),
    percent_basis_points integer check (percent_basis_points between 0 and 10000),
    expected_amount_cents bigint check (expected_amount_cents >= 0),

    effective_start date,
    effective_end date,
    state text not null default 'active' check (state in ('active', 'superseded')),
    idempotency_key text not null,

    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint financial_expected_funding_basis_chk check (
        (basis = 'percentage' and percent_basis_points is not null and expected_amount_cents is null)
        or (basis = 'fixed_amount' and expected_amount_cents is not null and percent_basis_points is null)
    ),
    -- Funding attaches to SOMETHING responsibility-shaped; floating expected money belongs to no one.
    constraint financial_expected_funding_anchor_chk check (
        share_id is not null or allocation_id is not null
    )
);

create unique index if not exists financial_expected_funding_idempotency_unique
    on public.financial_expected_funding (org_id, idempotency_key);
create index if not exists financial_expected_funding_share_idx
    on public.financial_expected_funding (org_id, share_id, state);

-- --------------------------------------------------------------------------------------------
-- PAYMENT ATTRIBUTION — which responsibility a payment application satisfied.
--
-- Thread 8 remains the ONLY authority that reduces charge outstanding. This explains, after the
-- fact, whose share an application went against — and it is explicit, never guessed from who
-- happened to pay, because a grandparent paying does not make the grandparent responsible.
-- --------------------------------------------------------------------------------------------
create table if not exists public.payment_responsibility_attributions (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,
    payment_allocation_id uuid not null references public.payment_allocations (id) on delete cascade,
    responsibility_allocation_id uuid not null
        references public.financial_responsibility_allocations (id) on delete restrict,
    amount_cents bigint not null check (amount_cents > 0),
    idempotency_key text not null,
    created_by uuid,
    created_at timestamptz not null default now()
);

create unique index if not exists payment_responsibility_attributions_idempotency_unique
    on public.payment_responsibility_attributions (org_id, idempotency_key);
create index if not exists payment_responsibility_attributions_application_idx
    on public.payment_responsibility_attributions (payment_allocation_id);

-- --------------------------------------------------------------------------------------------
-- RLS — the three-policy shape `enrollment_pricing_terms` and Thread 10 use. Reading and writing
-- responsibility is operator work: owner / admin / ops, with the server additionally requiring the
-- `fin.responsibility` grant, which RLS does not express and must not be mistaken for.
-- --------------------------------------------------------------------------------------------
do $$
declare t text;
begin
    foreach t in array array[
        'financial_responsibility_arrangements',
        'financial_responsibility_shares',
        'financial_responsibility_allocations',
        'financial_expected_funding',
        'payment_responsibility_attributions'
    ] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists %I on public.%I', t || '_select_org', t);
        execute format(
            'create policy %I on public.%I for select using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.org_id = %I.org_id))',
            t || '_select_org', t, t);
        execute format('drop policy if exists %I on public.%I', t || '_mutate_ops', t);
        execute format(
            'create policy %I on public.%I for all using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.org_id = %I.org_id and ur.role = any (array[''owner'', ''admin'', ''ops''])))',
            t || '_mutate_ops', t, t);
        execute format('drop policy if exists %I on public.%I', t || '_service_all', t);
        execute format(
            'create policy %I on public.%I for all using (auth.role() = ''service_role'')',
            t || '_service_all', t);
    end loop;
end $$;

comment on table public.financial_responsibility_arrangements is
    'The intent: for this account and optionally this child, over this effective window, '
    'responsibility is shared like so. Effective-dated and superseded, never edited. Active '
    'windows for one scope cannot overlap — the database refuses the ambiguity rather than a '
    'resolver picking a winner by row order.';
comment on table public.financial_responsibility_allocations is
    'The consequence: for one charge, this named party owes exactly these cents, against a '
    'snapshot of the net they were computed from. A row with is_unassigned = true holds cents '
    'nobody has yet been made responsible for — recorded openly rather than handed to whichever '
    'adult sorted first. Never a balance.';
comment on table public.financial_expected_funding is
    'Where a responsible party''s own share is EXPECTED to be funded from. Not payment, does not '
    'reduce outstanding, and does not make the funder responsible — that takes an arrangement share.';
comment on table public.payment_responsibility_attributions is
    'Which responsibility a payment application satisfied. Explanation only: Thread 8 remains the '
    'sole authority that reduces charge outstanding.';
