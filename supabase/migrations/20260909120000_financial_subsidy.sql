-- ============================================================================================
-- SUBSIDY: WHO AUTHORIZED IT, WHAT WAS CLAIMED, WHAT ARRIVED, AND WHAT IS STILL MISSING.
--
-- Thread 6 established that expected funding attaches to a responsible party's share and is not
-- money. Thread 9 gives that expectation a provenance and a life: an agency authorizes care, the
-- provider claims a period, the agency remits, cash lands through Thread 8, and whatever did not
-- arrive stays visible as an UNRESOLVED VARIANCE until somebody decides what to do about it.
--
-- ── THE TWO THINGS THIS SCHEMA REFUSES TO DO ──
--
-- It never reduces what a family owes. `charge_category = 'subsidy_offset'` exists in the taxonomy
-- and is used by nothing; the design lab models it as a contra-revenue reduction, which would make
-- a subsidy indistinguishable from a discount and would quietly forgive the family the moment an
-- agency was late. Subsidy is FUNDING of a share somebody still owes.
--
-- And it never transfers a shortfall by itself. When $900 was expected and $825 arrived, the $75 is
-- a variance row in `pending`/`short_paid`, not an extra $75 on a parent's bill. Somebody chooses.
--
-- ── COLLECTIBILITY IS DERIVED, NOT STORED ──
--
-- The approved policy is that a SUBMITTED claim may suppress family collection for its attributed
-- amount. Nothing here stores a suppressed balance: the suppression is computed from claim state,
-- claim-line amounts and Thread 8 outstanding, so it cannot drift, cannot be edited, and cannot
-- become a second balance. See `resolveFamilyCollectible`.
-- ============================================================================================

-- --------------------------------------------------------------------------------------------
-- AGENCIES — the narrowest identity that does the job.
--
-- A funding agency is not a household (`customers` is a family-shaped account shell) and not a
-- contractor (`vendors` belongs to the jobs vertical). It needs exactly four things a bare string
-- cannot give: a stable id to be a payer on `payments.payer_entity_id`, org isolation, provenance,
-- and something for a remittance to reconcile against. So it gets a small, bounded, Financials-owned
-- table rather than a platform-wide party redesign that subsidy does not justify.
-- --------------------------------------------------------------------------------------------
create table if not exists public.financial_funding_agencies (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,
    name text not null,
    /* Stable operator-facing key, unique per tenant, so imports and remittances can name it. */
    agency_key text not null,
    jurisdiction text,
    external_reference text,
    contact_email text,
    is_active boolean not null default true,
    metadata jsonb not null default '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint financial_funding_agencies_key_unique unique (org_id, agency_key)
);

-- --------------------------------------------------------------------------------------------
-- PROGRAMS — configuration steers; code owns the money and tenancy invariants.
--
-- Nothing here names a state, an agency or a statute. A tenant authors "Child Care Assistance" the
-- same way another authors an employer scholarship, and the platform learns no jurisdiction.
-- --------------------------------------------------------------------------------------------
create table if not exists public.financial_subsidy_programs (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,
    agency_id uuid not null references public.financial_funding_agencies (id) on delete restrict,
    name text not null,
    program_key text not null,
    /* The Commercial Execution funding vocabulary, quoted rather than re-invented. */
    funding_source_type text not null default 'government_subsidy' check (funding_source_type in (
        'government_subsidy', 'employer_sponsorship', 'scholarship', 'corporate_program'
    )),
    jurisdiction text,
    /* Claim/remittance rules and required identifiers — configuration, not schema. */
    claim_rules jsonb not null default '{}'::jsonb,
    required_identifiers jsonb not null default '[]'::jsonb,
    config_version text,
    is_active boolean not null default true,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint financial_subsidy_programs_key_unique unique (org_id, program_key)
);

-- --------------------------------------------------------------------------------------------
-- AUTHORIZATIONS — effective-dated, superseded, never edited.
--
-- The authorization is the financially operative decision. Eligibility is evidence TOWARD it and is
-- deliberately not modelled as a second financial owner: a family can be eligible and unauthorized,
-- and only the authorization says which child, which period, how much and what the family still pays.
-- --------------------------------------------------------------------------------------------
create table if not exists public.financial_subsidy_authorizations (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,
    program_id uuid not null references public.financial_subsidy_programs (id) on delete restrict,

    customer_id uuid not null references public.customers (id) on delete restrict,
    customer_member_id uuid not null references public.customer_members (id) on delete restrict,
    opportunity_customer_member_id uuid references public.opportunity_customer_members (id) on delete set null,

    external_case_id text,
    external_authorization_id text,

    coverage_start date not null,
    coverage_end date,

    /* What was authorised: units and/or an amount. Both may be present; neither may be negative. */
    authorized_units numeric check (authorized_units is null or authorized_units >= 0),
    authorized_unit_kind text check (authorized_unit_kind in ('day', 'hour', 'week', 'month')),
    authorized_amount_cents bigint check (authorized_amount_cents is null or authorized_amount_cents >= 0),
    rate_cents bigint check (rate_cents is null or rate_cents >= 0),
    /*
     * WHAT THE FAMILY STILL PAYS, as the agency states it. Recorded because it is the agency's
     * figure, and NOT applied to responsibility: what a family owes is Thread 6's, decided by an
     * arrangement naming people, and an agency does not get to reassign it.
     */
    family_copay_cents bigint check (family_copay_cents is null or family_copay_cents >= 0),

    state text not null default 'active' check (state in ('active', 'superseded', 'expired', 'revoked')),
    source_document_id uuid references public.documents (id) on delete set null,
    source_key text,
    notes text,

    supersedes_id uuid references public.financial_subsidy_authorizations (id) on delete restrict,
    superseded_by_id uuid references public.financial_subsidy_authorizations (id) on delete set null,

    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint financial_subsidy_authorizations_window_chk
        check (coverage_end is null or coverage_end >= coverage_start)
);

/*
 * ONE ACTIVE AUTHORIZATION PER CHILD PER PROGRAM AT A TIME, refused by the database exactly as
 * Thread 6 refuses overlapping responsibility arrangements. Two overlapping authorisations would
 * make "how much is expected for March" depend on row order.
 */
create extension if not exists btree_gist;
alter table public.financial_subsidy_authorizations
    drop constraint if exists financial_subsidy_authorizations_no_overlap;
alter table public.financial_subsidy_authorizations
    add constraint financial_subsidy_authorizations_no_overlap
    exclude using gist (
        org_id with =,
        program_id with =,
        customer_member_id with =,
        daterange(coverage_start, coverage_end, '[]') with &&
    ) where (state = 'active');

create index if not exists financial_subsidy_authorizations_child_idx
    on public.financial_subsidy_authorizations (org_id, customer_member_id, coverage_start);

-- Thread 6 owns expected funding; this is the provenance it was missing.
alter table public.financial_expected_funding
    add column if not exists subsidy_authorization_id uuid
        references public.financial_subsidy_authorizations (id) on delete restrict;
create index if not exists financial_expected_funding_authorization_idx
    on public.financial_expected_funding (org_id, subsidy_authorization_id);

-- --------------------------------------------------------------------------------------------
-- CLAIMS — a period asked for, and the obligations it was asked against.
--
-- Submission is the event the approved collection policy turns on: an authorization does not
-- suppress family collection and neither does a draft. Submitting is the provider doing the thing
-- that makes the money genuinely receivable.
-- --------------------------------------------------------------------------------------------
create table if not exists public.financial_subsidy_claims (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,
    program_id uuid not null references public.financial_subsidy_programs (id) on delete restrict,
    agency_id uuid not null references public.financial_funding_agencies (id) on delete restrict,
    authorization_id uuid references public.financial_subsidy_authorizations (id) on delete restrict,

    period_key text not null,
    service_period_start date,
    service_period_end date,

    state text not null default 'draft' check (state in ('draft', 'submitted', 'accepted', 'denied', 'void')),
    submitted_at timestamptz,
    external_reference text,

    idempotency_key text not null,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- A submitted claim knows when it was submitted. The two cannot drift.
    constraint financial_subsidy_claims_submitted_chk check (
        (state in ('draft', 'void') and submitted_at is null)
        or (state in ('submitted', 'accepted', 'denied') and submitted_at is not null)
    )
);
create unique index if not exists financial_subsidy_claims_idempotency_unique
    on public.financial_subsidy_claims (org_id, idempotency_key);

create table if not exists public.financial_subsidy_claim_lines (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,
    claim_id uuid not null references public.financial_subsidy_claims (id) on delete cascade,

    /* EXPLICIT LINE-LEVEL ATTRIBUTION. A claim spanning three children must say which obligation
       each dollar was asked against, or a remittance cannot be reconciled to anything. */
    charge_id uuid not null references public.charges (id) on delete restrict,
    responsibility_allocation_id uuid
        references public.financial_responsibility_allocations (id) on delete restrict,
    expected_funding_id uuid references public.financial_expected_funding (id) on delete set null,
    customer_member_id uuid references public.customer_members (id) on delete set null,

    service_period_start date,
    service_period_end date,
    claimed_units numeric check (claimed_units is null or claimed_units >= 0),
    claimed_amount_cents bigint not null check (claimed_amount_cents > 0),

    idempotency_key text not null,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists financial_subsidy_claim_lines_idempotency_unique
    on public.financial_subsidy_claim_lines (org_id, idempotency_key);
create index if not exists financial_subsidy_claim_lines_charge_idx
    on public.financial_subsidy_claim_lines (org_id, charge_id);

-- --------------------------------------------------------------------------------------------
-- REMITTANCES — what the agency SAID, kept separate from what actually settled.
--
-- Advice and cash can arrive apart, and treating an advice as money is how a provider ends up
-- believing it was paid. `payment_id` is null until Thread 8 has a real receipt.
-- --------------------------------------------------------------------------------------------
create table if not exists public.financial_subsidy_remittances (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,
    agency_id uuid not null references public.financial_funding_agencies (id) on delete restrict,

    external_remittance_id text,
    advice_date date,
    settled_date date,
    total_amount_cents bigint not null check (total_amount_cents >= 0),

    /* The Thread 8 receipt, when cash has actually arrived. NULL means advice only. */
    payment_id uuid references public.payments (id) on delete restrict,

    source_document_id uuid references public.documents (id) on delete set null,
    reconciliation_state text not null default 'pending'
        check (reconciliation_state in ('pending', 'reconciled', 'partially_reconciled', 'disputed')),

    idempotency_key text not null,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists financial_subsidy_remittances_idempotency_unique
    on public.financial_subsidy_remittances (org_id, idempotency_key);

create table if not exists public.financial_subsidy_remittance_lines (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,
    remittance_id uuid not null references public.financial_subsidy_remittances (id) on delete cascade,
    claim_line_id uuid not null references public.financial_subsidy_claim_lines (id) on delete restrict,

    /* Zero is legitimate and meaningful: a denial pays nothing and says why. */
    amount_cents bigint not null check (amount_cents >= 0),
    adjustment_reason text,
    denial_reason text,
    state text not null default 'paid' check (state in ('paid', 'denied', 'adjusted', 'recouped')),

    idempotency_key text not null,
    created_by uuid,
    created_at timestamptz not null default now()
);
create unique index if not exists financial_subsidy_remittance_lines_idempotency_unique
    on public.financial_subsidy_remittance_lines (org_id, idempotency_key);
create index if not exists financial_subsidy_remittance_lines_claim_line_idx
    on public.financial_subsidy_remittance_lines (org_id, claim_line_id);

-- --------------------------------------------------------------------------------------------
-- VARIANCE — the difference, held in the open until somebody decides.
--
-- Its own fact, not a shade of claim state or payment state. A claim can be `accepted` while its
-- money is short; a payment can be `posted` while a line was denied. Overloading either would lose
-- the question an operator actually has to answer.
-- --------------------------------------------------------------------------------------------
create table if not exists public.financial_subsidy_variances (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs (id) on delete restrict,
    claim_line_id uuid not null references public.financial_subsidy_claim_lines (id) on delete restrict,

    expected_cents bigint not null,
    actual_cents bigint not null,
    /* actual − expected. Negative is a shortfall; positive is an overpayment. Stored signed. */
    variance_cents bigint not null,

    state text not null check (state in (
        'pending', 'matched', 'short_paid', 'overpaid', 'denied', 'unapplied', 'recouped', 'under_review'
    )),

    /*
     * NO DEFAULT. The approved policy is explicit: a shortfall never silently becomes a family
     * charge, a write-off or a resubmission. It stays here until an operator names one.
     */
    resolution_kind text check (resolution_kind in (
        'accept_family_responsibility', 'resubmit', 'write_off', 'hold_under_review', 'correct_authorization'
    )),
    resolution_reference text,
    resolution_note text,
    resolved_by uuid,
    resolved_at timestamptz,

    idempotency_key text not null,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint financial_subsidy_variances_resolution_chk check (
        (resolution_kind is null and resolved_at is null)
        or (resolution_kind is not null and resolved_at is not null)
    )
);
create unique index if not exists financial_subsidy_variances_idempotency_unique
    on public.financial_subsidy_variances (org_id, idempotency_key);
/* ONE live variance per claim line: a second would double-count the same missing money. */
create unique index if not exists financial_subsidy_variances_claim_line_unique
    on public.financial_subsidy_variances (org_id, claim_line_id);

-- --------------------------------------------------------------------------------------------
-- RLS — the three-policy shape Threads 6 and 10 use. Subsidy administration is operator work:
-- owner / admin / ops, with the server additionally requiring `fin.subsidy`. No parent-facing
-- visibility is authorized in this thread and none is expressed here.
-- --------------------------------------------------------------------------------------------
do $$
declare t text;
begin
    foreach t in array array[
        'financial_funding_agencies',
        'financial_subsidy_programs',
        'financial_subsidy_authorizations',
        'financial_subsidy_claims',
        'financial_subsidy_claim_lines',
        'financial_subsidy_remittances',
        'financial_subsidy_remittance_lines',
        'financial_subsidy_variances'
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
        execute format('create policy %I on public.%I for all using (auth.role() = ''service_role'')', t || '_service_all', t);
    end loop;
end $$;

comment on table public.financial_funding_agencies is
    'A funder with a stable identity: enough to be a payer on a Thread 8 receipt, to isolate by org, '
    'to carry provenance and to reconcile a remittance against. Deliberately narrow — not a party '
    'platform, not a household, not a vendor.';
comment on table public.financial_subsidy_authorizations is
    'The financially operative decision: which child, which period, how much, and what the agency '
    'says the family still pays. Effective-dated and superseded; overlapping active windows for one '
    'child and programme are refused by the database.';
comment on column public.financial_subsidy_authorizations.family_copay_cents is
    'The agency''s figure for what the family still pays. RECORDED, never applied — what a family '
    'owes is Thread 6''s, decided by an arrangement naming people.';
comment on table public.financial_subsidy_variances is
    'The difference between what was claimed and what arrived, held in the open. Never resolved by '
    'default: a shortfall does not become a family charge, a write-off or a resubmission until '
    'somebody chooses one.';
