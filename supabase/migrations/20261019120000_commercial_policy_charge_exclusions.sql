-- CHARGE-LEVEL COMMERCIAL POLICY EXCLUSION — "this policy was deliberately not applied to THIS
-- charge, and here is who decided that and why."
--
-- ── WHY THE RELATIONSHIP EXCEPTION COULD NOT BE REUSED ────────────────────────────────────────
--
-- `commercial_policy_exceptions` is keyed to the relationship — its own comment says an exception
-- is scoped to exactly the thing an accepted price is scoped to. Dating one narrowly enough to
-- cover a single charge's service date would waive the policy for that family across the whole
-- window, so every other charge in it would silently lose the discount too. That is a different
-- decision from the one the operator made, recorded as if it were the same.
--
-- So the grain is the charge, and nothing else about the doctrine changes: the same restrict-not-
-- cascade on the policy, the same non-nullable reason, the same supersession vocabulary, the same
-- refusal to let a discount decision go unattributed.
--
-- ── WHAT THIS IS NOT ──────────────────────────────────────────────────────────────────────────
--
-- Not a boolean on the charge. Not a second discount engine. The one canonical resolver consults
-- this alongside the relationship exception and reports `excluded_by_charge_exception` as its own
-- reason, so a reader can tell "no policy applied" from "a policy applied and was waived".
--
-- Re-runnable throughout.

create table if not exists public.commercial_policy_charge_exclusions (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.orgs(id) on delete cascade,

    /* Restrict for the same reason the relationship exception restricts: a policy somebody has
       reasoned about must not lose that reasoning to a delete. */
    policy_id uuid not null
        references public.commercial_policies(id) on delete restrict,
    charge_id uuid not null
        references public.charges(id) on delete cascade,

    /* NOT NULLABLE, deliberately. An excluded discount without a reason is an unattributable
       decision about somebody's money, and modelling it as an exclusion rather than a flag is
       exactly so that a person owns it. */
    reason text not null check (btrim(reason) <> ''),

    created_by uuid,
    created_at timestamptz not null default now(),
    /* Lifting an exclusion ends it rather than deleting it — the fact that it once stood is part
       of the charge's history. */
    ended_by uuid,
    ended_at timestamptz,
    supersedes_exclusion_id uuid
        references public.commercial_policy_charge_exclusions(id) on delete restrict,
    superseded_at timestamptz,

    updated_at timestamptz not null default now()
);

/*
 * ONE LIVE EXCLUSION PER POLICY PER CHARGE.
 *
 * Two live rows would make "was this waived" depend on which one a reader happened to see, and
 * both would claim to be the reason. Ended and superseded rows stay, and do not collide.
 */
create unique index if not exists commercial_policy_charge_exclusions_live_idx
    on public.commercial_policy_charge_exclusions (org_id, policy_id, charge_id)
    where ended_at is null and superseded_at is null;

create index if not exists commercial_policy_charge_exclusions_charge_idx
    on public.commercial_policy_charge_exclusions (org_id, charge_id);

/*
 * ORG PARITY IN THE DATABASE. A valid UUID from another tenant is still a valid UUID, and the
 * foreign keys alone would not notice that this charge and this policy belong to different
 * organisations.
 */
create or replace function public.commercial_policy_charge_exclusion_parity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    charge_org uuid;
    policy_org uuid;
begin
    select c.org_id into charge_org from public.charges c where c.id = new.charge_id;
    select p.org_id into policy_org from public.commercial_policies p where p.id = new.policy_id;

    if charge_org is null then
        raise exception 'charge_exclusion_charge_missing: the named charge does not exist';
    end if;
    if charge_org <> new.org_id then
        raise exception 'charge_exclusion_org_mismatch: the charge belongs to another organization';
    end if;
    if policy_org is not null and policy_org <> new.org_id then
        raise exception 'charge_exclusion_policy_org_mismatch: the policy belongs to another organization';
    end if;

    return new;
end;
$$;

drop trigger if exists commercial_policy_charge_exclusion_parity_trg
    on public.commercial_policy_charge_exclusions;
create trigger commercial_policy_charge_exclusion_parity_trg
    before insert or update on public.commercial_policy_charge_exclusions
    for each row execute function public.commercial_policy_charge_exclusion_parity();

alter table public.commercial_policy_charge_exclusions enable row level security;

/*
 * RLS: a new public table defaults to granting authenticated SELECT through default privileges,
 * so the policy is stated rather than left implied. Service-role paths (every writer here) bypass
 * RLS; operator reads go through the app's own org-scoped services.
 */
drop policy if exists commercial_policy_charge_exclusions_org_read
    on public.commercial_policy_charge_exclusions;
create policy commercial_policy_charge_exclusions_org_read
    on public.commercial_policy_charge_exclusions
    for select
    using (
        exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid() and ur.org_id = commercial_policy_charge_exclusions.org_id
        )
    );
