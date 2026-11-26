-- =============================================================================
-- ENROLLMENT PRICING TERMS — the effective-dated commercial terms OF AN ENROLLMENT
-- ASSIGNMENT, held as a row rather than as a note inside somebody else's JSON.
--
-- Commercial Configuration authors the options. Commercial Execution resolves which of them applies.
-- Neither owns the operator's decision, and until now nothing did: the accepted amount lived in
-- `process_instances.metadata.assignment_quote_snapshots[]`, whose own author wrote that it belonged
-- there "UNTIL A DEDICATED TABLE IS WARRANTED". The warrant is that a later charge-generation thread
-- has to READ what was accepted:
--
--   * A JSONB array on a process instance cannot be joined, constrained, or org-scoped by the
--     database. Nothing stopped two entries claiming one effective date, nothing stopped a retry
--     appending a second identical one, and nothing linked the amount to the assignment it priced.
--
--   * It carried no provenance beyond a single id — mislabelled `offering_id` while holding a RATE
--     id — so "why is this family paying this" could not be answered from the record.
--
--   * It could not express an override at all. An exception path that cannot be told apart from a
--     recommendation is not an exception path.
--
-- ── WHAT THIS IS, AND WHAT IT IS NOT ──
--
-- It is the COMMERCIAL TERMS OF AN ASSIGNMENT: this child, in this program, on this schedule, at
-- this location, from this date, at this amount, for this reason. It is not a quote, and there is no
-- quote lifecycle here: a resolution for an assignment that is proposed, future-effective, or not
-- yet operational is still a resolution for that assignment, and needs no second entity to live in.
-- It is not billing setup either. It creates no obligation, no charge, no invoice and no schedule —
-- turning accepted terms into money stays Billing's job, later, in its own thread.
--
-- ── ANCHORED TO THE ASSIGNMENT, NOT TO ENROLMENT ──
--
-- `opportunity_customer_members` IS the assignment: it carries the child's program, schedule type,
-- location and start date, and it exists from the moment the assignment is proposed. The enrollment
-- agreement carries `opportunity_customer_member_id`, so the assignment is the through-line across
-- both states, and the agreement is recorded here as an ADDITIONAL, NULLABLE link the moment it
-- exists — which is what lets a later thread join accepted terms to the billable source.
--
-- Anchoring on the agreement alone was the first shape of this table and it was wrong for exactly
-- the reason Thread 2's Add Charge defect was wrong: the representative tenant holds 3000 assignments
-- and ZERO agreements, because a family is priced before it enrols. A pricing model reachable only
-- after enrolment cannot price the decision to enrol.
--
-- ── OWNERSHIP, UNCHANGED ──
--
-- `commercial_tuition_rates` still owns the authored amount; this row records WHICH authored option
-- was accepted and what it resolved to at acceptance time. The two are meant to drift — a catalog is
-- edited, a rate expires — because history must not move when configuration does.
-- =============================================================================

create table if not exists public.enrollment_pricing_terms (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs(id) on delete cascade,

    -- ── WHOSE TERMS: the assignment, the child, and the agreement once there is one ───────────
    opportunity_customer_member_id uuid not null
        references public.opportunity_customer_members(id) on delete cascade,
    customer_member_id uuid not null,
    /* Null until the assignment becomes an enrolment. Populated so charge generation can join
       accepted terms to the billable source it already writes against. */
    enrollment_agreement_id uuid
        references public.child_enrollment_agreements(id) on delete set null,

    -- ── WHAT WAS ACCEPTED ────────────────────────────────────────────────────────────────────
    /*
     * NOT TUITION-EXCLUSIVE, because the Commercial model it draws from is not.
     *
     * Commercial already authors fees, add-ons, deposits and products beside tuition, and its
     * execution contract already names a source generically: `CommercialSourceRef { entity, id }`.
     * This table records the same pair, so an assignment-associated fee becomes another KIND of
     * term rather than another column or another table. Thread 3 implements only `tuition`; the
     * check list is where a later thread extends it.
     */
    term_kind text not null default 'tuition' check (term_kind in ('tuition')),
    /** The Commercial V1 entity that produced this term (CommercialSourceRef.entity). */
    source_entity text not null,
    /** That entity's id (CommercialSourceRef.id). */
    source_id uuid not null,
    /** What the resolver recommended, retained even when the operator chose otherwise. */
    recommended_source_id uuid,
    /*
     * Referential integrity for the kind that exists, without making the shape tuition-only: a
     * stored generated column carries the FK when the source IS a tuition rate, and is null
     * otherwise. RESTRICT, not CASCADE — deleting a rate must not erase the record of a family
     * having agreed to it.
     */
    tuition_rate_id uuid generated always as (
        case when source_entity = 'commercial_tuition_rates' then source_id end
    ) stored references public.commercial_tuition_rates(id) on delete restrict,

    -- The commercial coordinates the resolution landed on, kept so the record explains itself
    -- without re-reading a catalog that may since have moved.
    variant_id uuid references public.program_offering_variants(id) on delete restrict,
    offering_id uuid references public.program_offerings(id) on delete restrict,
    program_key text,
    location_id uuid references public.locations(id) on delete set null,
    /** Billing frequency, in Commercial's own vocabulary (`billing_cadences` item key). */
    cadence_key text not null,
    payer_type text not null default 'private_pay',

    /** The amount as resolved AT ACCEPTANCE. Copied deliberately — see the header. */
    amount_cents integer not null check (amount_cents >= 0),
    currency_code text not null default 'USD',

    -- ── HOW IT WAS ARRIVED AT ────────────────────────────────────────────────────────────────
    -- `accepted` took the recommendation. `overridden` did not, and must say why.
    state text not null check (state in ('accepted', 'overridden')),
    override_reason text,
    /** Deterministic key over (facts + config version) — the same resolution, twice, is one term. */
    resolution_key text not null,
    /** The canonical assignment facts and matched rules the recommendation was computed from. */
    resolved_facts jsonb not null default '{}'::jsonb,
    config_version text,

    -- ── WHEN IT APPLIES ──────────────────────────────────────────────────────────────────────
    -- Effective dating and supersession, the same shape `child_placements` and
    -- `schedule_assignments` already use, so a reader learns one pattern for assignment history.
    effective_start date not null,
    effective_end date,
    supersedes_term_id uuid references public.enrollment_pricing_terms(id) on delete restrict,
    superseded_at timestamptz,

    -- ── WHO, AND WHEN THEY SAID SO ───────────────────────────────────────────────────────────
    accepted_by uuid,
    accepted_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz,

    constraint enrollment_pricing_terms_dates_ordered
        check (effective_end is null or effective_end >= effective_start),
    /* An override without a reason is an untraceable free-floating amount. Refused here, so no
       caller can decline to explain itself. */
    constraint enrollment_pricing_terms_override_states_a_reason
        check (state <> 'overridden' or (override_reason is not null and length(btrim(override_reason)) > 0)),
    /* A tuition term is priced by a tuition rate. Stated so the generated FK above cannot be
       bypassed by naming some other entity while meaning tuition. */
    constraint enrollment_pricing_terms_tuition_sources_a_rate
        check (term_kind <> 'tuition' or source_entity = 'commercial_tuition_rates')
);

-- -----------------------------------------------------------------------------
-- ONE LIVE TERM PER ASSIGNMENT, PER KIND, PER EFFECTIVE DATE.
--
-- This is what makes a retry harmless. An operator who double-submits, or a client that resends
-- after a timeout, must not leave the child with two live prices for the same day — and a service
-- check races with itself where a unique index does not. Superseded rows are excluded, so history
-- accumulates freely underneath. Keyed by kind so a future fee term does not collide with tuition.
-- -----------------------------------------------------------------------------
create unique index if not exists ux_enrollment_pricing_terms_live_per_effective_date
    on public.enrollment_pricing_terms
       (org_id, opportunity_customer_member_id, term_kind, effective_start)
    where superseded_at is null;

create index if not exists idx_enrollment_pricing_terms_org_assignment
    on public.enrollment_pricing_terms (org_id, opportunity_customer_member_id);
create index if not exists idx_enrollment_pricing_terms_agreement
    on public.enrollment_pricing_terms (org_id, enrollment_agreement_id)
    where enrollment_agreement_id is not null;
create index if not exists idx_enrollment_pricing_terms_member
    on public.enrollment_pricing_terms (org_id, customer_member_id);
/* The downstream read: the live terms for an org, newest effective first. */
create index if not exists idx_enrollment_pricing_terms_live
    on public.enrollment_pricing_terms (org_id, effective_start desc)
    where superseded_at is null;

-- -----------------------------------------------------------------------------
-- AN ACCEPTED TERM IS HISTORY, AND HISTORY DOES NOT MOVE.
--
-- The commercial columns, the amount, the provenance and the actor are fixed once written. What a
-- later event may still do is CLOSE a term — end it, or supersede it with a new one — which is how
-- a price change is recorded without rewriting what was true before it. The one other permitted
-- change is LEARNING THE AGREEMENT: an assignment priced before enrolment gains its agreement id
-- when it enrols, and that is not a change to the terms.
--
-- Stated in the database rather than in the service for the reason Thread 1 states its own
-- immutability there: a rule that lives only in a service is a rule until somebody writes a second
-- service.
-- -----------------------------------------------------------------------------
create or replace function public.enrollment_pricing_terms_immutable()
returns trigger
language plpgsql
as $$
begin
    if new.org_id is distinct from old.org_id
        or new.opportunity_customer_member_id is distinct from old.opportunity_customer_member_id
        or new.customer_member_id is distinct from old.customer_member_id
        or new.term_kind is distinct from old.term_kind
        or new.source_entity is distinct from old.source_entity
        or new.source_id is distinct from old.source_id
        or new.recommended_source_id is distinct from old.recommended_source_id
        or new.variant_id is distinct from old.variant_id
        or new.offering_id is distinct from old.offering_id
        or new.cadence_key is distinct from old.cadence_key
        or new.payer_type is distinct from old.payer_type
        or new.amount_cents is distinct from old.amount_cents
        or new.currency_code is distinct from old.currency_code
        or new.state is distinct from old.state
        or new.override_reason is distinct from old.override_reason
        or new.resolution_key is distinct from old.resolution_key
        or new.resolved_facts is distinct from old.resolved_facts
        or new.effective_start is distinct from old.effective_start
        or new.accepted_by is distinct from old.accepted_by
        or new.accepted_at is distinct from old.accepted_at
    then
        raise exception
            'an accepted enrollment pricing term is immutable; supersede it with a new term instead'
            using errcode = 'check_violation';
    end if;
    -- The agreement is LEARNED, never re-pointed: once an assignment's terms name an agreement,
    -- that link is as fixed as the rest.
    if old.enrollment_agreement_id is not null
        and new.enrollment_agreement_id is distinct from old.enrollment_agreement_id
    then
        raise exception
            'an enrollment pricing term cannot be moved to a different enrollment agreement'
            using errcode = 'check_violation';
    end if;
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_enrollment_pricing_terms_immutable on public.enrollment_pricing_terms;
create trigger trg_enrollment_pricing_terms_immutable
    before update on public.enrollment_pricing_terms
    for each row execute function public.enrollment_pricing_terms_immutable();

-- -----------------------------------------------------------------------------
-- RLS — the same three-policy shape `child_placements` uses, so assignment history is read and
-- written under one rule. Accepting a price is an operational act: owner / admin / ops.
-- -----------------------------------------------------------------------------
alter table public.enrollment_pricing_terms enable row level security;

drop policy if exists enrollment_pricing_terms_select_org on public.enrollment_pricing_terms;
create policy enrollment_pricing_terms_select_org
    on public.enrollment_pricing_terms for select
    using (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid() and ur.org_id = enrollment_pricing_terms.org_id
    ));

drop policy if exists enrollment_pricing_terms_mutate_ops on public.enrollment_pricing_terms;
create policy enrollment_pricing_terms_mutate_ops
    on public.enrollment_pricing_terms for all
    using (exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.org_id = enrollment_pricing_terms.org_id
          and ur.role = any (array['owner', 'admin', 'ops'])
    ));

drop policy if exists enrollment_pricing_terms_service_all on public.enrollment_pricing_terms;
create policy enrollment_pricing_terms_service_all
    on public.enrollment_pricing_terms for all
    using (auth.role() = 'service_role');

comment on table public.enrollment_pricing_terms is
    'Effective-dated commercial terms of an enrollment assignment: which authored option was '
    'accepted, at what amount, from when, and why. Not a quote and not billing setup — it owns no '
    'authored pricing and creates no charges.';
comment on column public.enrollment_pricing_terms.opportunity_customer_member_id is
    'The assignment these terms price. Present from the moment the assignment is proposed, which is '
    'before any enrollment agreement exists.';
comment on column public.enrollment_pricing_terms.enrollment_agreement_id is
    'Learned when the assignment enrols, so charge generation can join accepted terms to the '
    'billable source. Null before then; never re-pointed afterwards.';
comment on column public.enrollment_pricing_terms.term_kind is
    'Which commercial term this is. Only tuition is implemented; the check list is where a later '
    'thread adds assignment-associated fees, without a new column or a new table.';
comment on column public.enrollment_pricing_terms.amount_cents is
    'The amount as resolved at acceptance. Deliberately copied: a later catalog edit must not move history.';
comment on column public.enrollment_pricing_terms.resolved_facts is
    'The canonical assignment facts and matched rules the recommendation was computed from.';
