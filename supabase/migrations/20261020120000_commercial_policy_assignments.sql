-- =============================================================================
-- AFFIRMATIVE RELATIONSHIP POLICY ASSIGNMENT — "this commercial relationship
-- RECEIVES this configured policy."
--
-- ── WHAT WAS MEASURED BEFORE THIS WAS WRITTEN ────────────────────────────────
-- Three tables reference `commercial_policies`, and not one of them is
-- affirmative at the relationship grain:
--
--   financial_reduction_applications   the RESULT, after the fact
--   commercial_policy_exceptions       NEGATIVE, per relationship
--   commercial_policy_charge_exclusions NEGATIVE, per charge
--
-- And a policy's own reach is scoped by `scope_type` — org, location, program,
-- offering, variant — never by relationship or child. So until now a child
-- received a discount only by satisfying a RULE: sibling rank and count for
-- `sibling_discount`, `requires: employee_household` for `discount`. An
-- operator who wanted to give one family a configured discount the rules did
-- not already reach had no way to say so, and nothing in the model could
-- record that they had decided it.
--
-- This is the affirmative half, and deliberately the smallest one.
--
-- ── IT DOES NOT DUPLICATE POLICY ECONOMICS ───────────────────────────────────
-- No percentage, no amount, no basis, no cap, no eligibility rule. Those are
-- `commercial_policies.value` and stay there: an assignment that carried its
-- own rate would be a second place the discount is worth something, and the two
-- would disagree the first time an organisation edited the policy. This row
-- carries IDENTITY — which policy, which relationship — and provenance.
--
-- ── IT DOES NOT OVERRIDE POLICY IMPOSSIBILITY ────────────────────────────────
-- Assignment answers "which policies does this child receive". It does NOT
-- answer "does this policy apply to this charge". A sibling discount assigned
-- to a child still cannot reduce a Registration Fee if the policy's own
-- `applies_to` excludes fees, and still cannot reduce a charge whose category
-- is not discountable at all. That intersection lives in the one canonical
-- resolver and this table is an input to it, never a bypass of it.
--
-- ── THE RELATIONSHIP KEY IS THE ONE PRICING ALREADY USES ─────────────────────
-- `opportunity_customer_member_id`, exactly as the exception beside it does, so
-- the affirmative and the negative are scoped to the same thing and a reader
-- learns one relationship key for the whole of commercial policy.
--
-- ── SHAPE BORROWED, NOT INVENTED ─────────────────────────────────────────────
-- Effective dating, supersession and org parity are the pattern
-- `commercial_policy_exceptions` already established. The one deliberate
-- difference: a reason is OPTIONAL here. An exception must be justified because
-- it takes money's worth away from a family; giving a family a discount the
-- configuration already describes is the ordinary act, and demanding prose for
-- it would train operators to type "yes" into a required box.
-- =============================================================================

create table if not exists public.commercial_policy_assignments (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs(id) on delete cascade,

    -- ── WHICH POLICY, AND FOR WHOM ───────────────────────────────────────────
    -- Restrict, not cascade: a policy somebody has deliberately assigned is a
    -- policy an organisation has reasoned about, and deleting it silently would
    -- take that reasoning with it.
    policy_id uuid not null
        references public.commercial_policies(id) on delete restrict,
    opportunity_customer_member_id uuid not null
        references public.opportunity_customer_members(id) on delete cascade,
    /* The subject the money is about, carried so a reader need not join for it. */
    customer_member_id uuid not null,

    -- ── EFFECTIVE DATING AND SUPERSESSION ────────────────────────────────────
    effective_start date not null,
    effective_end date,
    supersedes_assignment_id uuid
        references public.commercial_policy_assignments(id) on delete restrict,
    superseded_at timestamptz,

    -- ── WHO SAID SO ──────────────────────────────────────────────────────────
    /* Optional, unlike the exception's. See the header: the affirmative act is
       the ordinary one, and a required box teaches operators to fill it with
       nothing. When a reason IS given it is kept and shown. */
    reason text,
    created_by uuid,
    created_at timestamptz not null default now(),
    ended_by uuid,
    ended_at timestamptz,

    constraint commercial_policy_assignments_dates_ordered
        check (effective_end is null or effective_end >= effective_start)
);

-- -----------------------------------------------------------------------------
-- ONE LIVE ASSIGNMENT PER POLICY, PER RELATIONSHIP, PER EFFECTIVE DATE.
--
-- A retry or a double submit must not leave two live assignments for the same
-- day, and a service check races with itself where a unique index does not.
-- Superseded rows are excluded so history accumulates underneath.
-- -----------------------------------------------------------------------------
create unique index if not exists ux_commercial_policy_assignments_live
    on public.commercial_policy_assignments
       (org_id, policy_id, opportunity_customer_member_id, effective_start)
    where superseded_at is null;

create index if not exists idx_commercial_policy_assignments_lookup
    on public.commercial_policy_assignments (org_id, opportunity_customer_member_id)
    where superseded_at is null;
create index if not exists idx_commercial_policy_assignments_policy
    on public.commercial_policy_assignments (org_id, policy_id)
    where superseded_at is null;

-- -----------------------------------------------------------------------------
-- TENANT AND SUBJECT COHERENCE, ENFORCED WHERE IT CANNOT BE SKIPPED.
--
-- An assignment must not bind another organisation's policy, another
-- organisation's relationship, or a child who is not that relationship's
-- subject. A service check would be one copy of the rule and a second writer
-- would not have it; this is the rule itself.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_commercial_policy_assignment_parity()
returns trigger
language plpgsql
as $function$
declare
    policy_org uuid;
    ocm_org uuid;
    ocm_member uuid;
begin
    select p.org_id into policy_org
      from public.commercial_policies p
     where p.id = new.policy_id;
    if policy_org is null or policy_org <> new.org_id then
        raise exception
            'commercial_policy_assignment_org_mismatch: policy % does not belong to org %',
            new.policy_id, new.org_id
            using errcode = '0A000';
    end if;

    select o.org_id, o.customer_member_id into ocm_org, ocm_member
      from public.opportunity_customer_members o
     where o.id = new.opportunity_customer_member_id;
    if ocm_org is null or ocm_org <> new.org_id then
        raise exception
            'commercial_policy_assignment_org_mismatch: relationship % does not belong to org %',
            new.opportunity_customer_member_id, new.org_id
            using errcode = '0A000';
    end if;

    -- The subject must be the relationship's own child, not an unrelated member.
    -- This is what stops one child's assignment reaching a sibling.
    if ocm_member is not null and new.customer_member_id <> ocm_member then
        raise exception
            'commercial_policy_assignment_subject_mismatch: member % is not the subject of relationship %',
            new.customer_member_id, new.opportunity_customer_member_id
            using errcode = '0A000';
    end if;

    return new;
end;
$function$;

drop trigger if exists trg_enforce_commercial_policy_assignment_parity
    on public.commercial_policy_assignments;
create trigger trg_enforce_commercial_policy_assignment_parity
    before insert or update on public.commercial_policy_assignments
    for each row execute function public.enforce_commercial_policy_assignment_parity();

alter table public.commercial_policy_assignments enable row level security;

/*
 * RLS: a new public table defaults to granting authenticated SELECT through default privileges,
 * so the policy is stated rather than left implied. Service-role paths (every writer here) bypass
 * RLS; operator reads go through the app's own org-scoped services.
 */
drop policy if exists commercial_policy_assignments_org_read
    on public.commercial_policy_assignments;
create policy commercial_policy_assignments_org_read
    on public.commercial_policy_assignments
    for select
    using (
        exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid() and ur.org_id = commercial_policy_assignments.org_id
        )
    );

comment on table public.commercial_policy_assignments is
    'Affirmative record that one commercial relationship RECEIVES one configured commercial policy, over an effective window. The counterpart to commercial_policy_exceptions and scoped by the same opportunity_customer_member_id. Carries policy IDENTITY and provenance only — never a rate, amount, basis, cap or eligibility rule, which stay in commercial_policies.value. An assignment satisfies a policy''s RELATIONSHIP-level eligibility (sibling rank, employee household); it does NOT override the policy''s own charge applicability or the category''s discountability, both of which the canonical resolver still enforces.';
