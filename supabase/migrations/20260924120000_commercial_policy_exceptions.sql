-- =============================================================================
-- COMMERCIAL POLICY EXCEPTIONS
-- =============================================================================
-- Versioned 20260924120000, after staging's latest (20260923120000_payment_holds).
-- It was authored as 20260920140000 while staging sat 52 commits back; staging has
-- since taken seven migrations dated 0919-0923. There is no version COLLISION and
-- nothing structural to conflict with — the newer migrations do not alter
-- `commercial_policies`, `opportunity_customer_members` or `orgs` — but a migration
-- whose version sorts before four already-applied ones is a skip waiting to happen
-- in any ledger that tracks a high-water mark. It has been applied nowhere, so
-- correcting its own version costs nothing and removes the question.
-- =============================================================================
-- "This otherwise-valid commercial policy is intentionally excluded for this
-- specific commercial relationship, for this effective window, by this
-- operator, for this reason."
--
-- ── WHY THIS IS NOT A BOOLEAN ────────────────────────────────────────────────
-- `discount_enabled = false` on an assignment would answer a different and
-- much worse question: it says "no discounts here" about every policy at once,
-- for all time, with nobody's name on it. An organisation that later authors a
-- second policy would silently suppress that one too. What an operator actually
-- decides is narrower and attributable: THIS policy, THIS relationship, FROM a
-- date, BECAUSE of something.
--
-- ── THE RELATIONSHIP KEY IS THE ONE PRICING ALREADY USES ─────────────────────
-- `opportunity_customer_member_id` is the assignment, and
-- `enrollment_pricing_terms` already calls it "the through-line across" the
-- commercial relationship. Reusing it means an exception is scoped to exactly
-- the thing an accepted price is scoped to, and no new "assignment id" concept
-- is invented for discounts. `customer_member_id` travels alongside for the
-- same reason it does there: the subject the money is about.
--
-- ── SHAPE BORROWED, NOT INVENTED ─────────────────────────────────────────────
-- Effective dating and supersession are the pattern `enrollment_pricing_terms`,
-- `child_placements` and `schedule_assignments` already use, so a reader learns
-- one pattern for the whole of assignment history.
-- =============================================================================

create table if not exists public.commercial_policy_exceptions (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs(id) on delete cascade,

    -- ── WHICH POLICY, AND FOR WHOM ───────────────────────────────────────────
    -- Restrict, not cascade: a policy with exceptions against it is a policy an
    -- organisation has deliberately reasoned about, and deleting it silently
    -- would take that reasoning with it.
    policy_id uuid not null
        references public.commercial_policies(id) on delete restrict,
    opportunity_customer_member_id uuid not null
        references public.opportunity_customer_members(id) on delete cascade,
    /* The subject the exception is about. Carried for the same reason the term
       carries it: a reader must not have to join to learn whose money this is. */
    customer_member_id uuid not null,

    -- ── EFFECTIVE DATING AND SUPERSESSION ────────────────────────────────────
    effective_start date not null,
    effective_end date,
    supersedes_exception_id uuid
        references public.commercial_policy_exceptions(id) on delete restrict,
    superseded_at timestamptz,

    -- ── WHO SAID SO, AND WHY ─────────────────────────────────────────────────
    /* NOT NULLABLE. An exception to commercial policy without a reason is an
       unattributable discount decision, and the whole point of modelling it as
       an exception rather than a flag is that somebody owns it. */
    reason text not null,
    created_by uuid,
    created_at timestamptz not null default now(),
    ended_by uuid,
    ended_at timestamptz,

    constraint commercial_policy_exceptions_dates_ordered
        check (effective_end is null or effective_end >= effective_start),
    constraint commercial_policy_exceptions_reason_stated
        check (length(btrim(reason)) > 0)
);

-- -----------------------------------------------------------------------------
-- ONE LIVE EXCEPTION PER POLICY, PER RELATIONSHIP, PER EFFECTIVE DATE.
--
-- The same reasoning the pricing term uses: a retry or a double submit must not
-- leave two live exceptions for the same day, and a service check races with
-- itself where a unique index does not. Superseded rows are excluded so history
-- accumulates underneath.
-- -----------------------------------------------------------------------------
create unique index if not exists ux_commercial_policy_exceptions_live
    on public.commercial_policy_exceptions
       (org_id, policy_id, opportunity_customer_member_id, effective_start)
    where superseded_at is null;

create index if not exists idx_commercial_policy_exceptions_lookup
    on public.commercial_policy_exceptions (org_id, opportunity_customer_member_id)
    where superseded_at is null;
create index if not exists idx_commercial_policy_exceptions_policy
    on public.commercial_policy_exceptions (org_id, policy_id)
    where superseded_at is null;

-- -----------------------------------------------------------------------------
-- TENANT COHERENCE, ENFORCED WHERE IT CANNOT BE SKIPPED.
--
-- An exception must not bind another organisation's policy or another
-- organisation's assignment. A service check would be one copy of the rule and
-- a second writer would not have it; this is the rule itself.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_commercial_policy_exception_org_parity()
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
            'commercial_policy_exception_org_mismatch: policy % does not belong to org %',
            new.policy_id, new.org_id
            using errcode = '0A000';
    end if;

    select o.org_id, o.customer_member_id into ocm_org, ocm_member
      from public.opportunity_customer_members o
     where o.id = new.opportunity_customer_member_id;
    if ocm_org is null or ocm_org <> new.org_id then
        raise exception
            'commercial_policy_exception_org_mismatch: assignment % does not belong to org %',
            new.opportunity_customer_member_id, new.org_id
            using errcode = '0A000';
    end if;

    -- The subject must be the assignment's own child, not an unrelated member.
    if ocm_member is not null and new.customer_member_id <> ocm_member then
        raise exception
            'commercial_policy_exception_subject_mismatch: member % is not the subject of assignment %',
            new.customer_member_id, new.opportunity_customer_member_id
            using errcode = '0A000';
    end if;

    return new;
end;
$function$;

drop trigger if exists trg_enforce_commercial_policy_exception_org_parity
    on public.commercial_policy_exceptions;
create trigger trg_enforce_commercial_policy_exception_org_parity
    before insert or update on public.commercial_policy_exceptions
    for each row execute function public.enforce_commercial_policy_exception_org_parity();

comment on table public.commercial_policy_exceptions is
    'Intentional, attributable exclusions of one commercial policy for one commercial relationship over an effective window. Scoped by the same opportunity_customer_member_id an accepted pricing term uses. NOT a discounts on/off flag: it names the policy, the relationship, the window, the operator and the reason, and it supersedes rather than mutating so history survives.';
