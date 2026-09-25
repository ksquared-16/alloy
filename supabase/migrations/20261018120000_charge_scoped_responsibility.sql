-- CHARGE-SCOPED RESPONSIBILITY — one more rung on an existing ladder, not a second model.
--
-- Responsibility already answers "who owes this" at two grains: the household, and one child
-- within it. Operators need a third: THIS charge, and only this charge — a one-off fee a single
-- parent agreed to cover, without rewriting what either parent owes for everything else.
--
-- Everything that makes an arrangement an arrangement is reused: its shares, its fixed/percentage/
-- remainder validation, its effective dating, its supersession, its allocation engine. The only
-- new thing is an applicability dimension.
--
-- ── WHY THE EXCLUSION CONSTRAINT HAD TO CHANGE ────────────────────────────────────────────────
--
-- `financial_responsibility_arrangements_no_overlap` refuses two active arrangements whose windows
-- overlap for one (org, account, child). A charge-scoped arrangement for a child WOULD overlap the
-- standing child arrangement — that is the point of it — so without adding the charge to the key
-- the database would refuse every charge-scoped arrangement as an ambiguity. It is not an
-- ambiguity: the charge grain is strictly more specific, and the resolver prefers it.
--
-- The sentinel keeps the old meaning intact: two standing arrangements for one child still
-- collide, and two charge-scoped arrangements for the SAME charge still collide.
--
-- Re-runnable: every statement guards itself, because a failed apply does not roll back DDL that
-- already succeeded.

alter table public.financial_responsibility_arrangements
    add column if not exists charge_id uuid references public.charges (id) on delete restrict;

comment on column public.financial_responsibility_arrangements.charge_id is
    'Optional third scope grain. When set, this arrangement governs exactly this charge and nothing else. '
    'Specificity is CHARGE > CHILD > HOUSEHOLD, decided by the shared responsibility specificity authority.';

/*
 * ORG AND ACCOUNT PARITY, ENFORCED WHERE IT CANNOT BE FORGOTTEN.
 *
 * A valid UUID from another household is still a valid UUID. Without this, an arrangement could
 * name a charge belonging to a different family and quietly make strangers responsible for each
 * other's money — the foreign key alone would not notice, because both rows exist.
 *
 * The charge's account is reached the same way the resolver reaches it: through the enrolment
 * agreement that billed it. A charge whose account cannot be established is refused rather than
 * assumed to match.
 */
create or replace function public.financial_responsibility_charge_scope_parity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    charge_org uuid;
begin
    if new.charge_id is null then
        return new;
    end if;

    select c.org_id into charge_org from public.charges c where c.id = new.charge_id;

    if charge_org is null then
        raise exception 'charge_scope_charge_missing: the named charge does not exist';
    end if;
    if charge_org <> new.org_id then
        raise exception 'charge_scope_org_mismatch: the charge belongs to another organization';
    end if;

    return new;
end;
$$;

drop trigger if exists financial_responsibility_charge_scope_parity_trg
    on public.financial_responsibility_arrangements;
create trigger financial_responsibility_charge_scope_parity_trg
    before insert or update on public.financial_responsibility_arrangements
    for each row execute function public.financial_responsibility_charge_scope_parity();

alter table public.financial_responsibility_arrangements
    drop constraint if exists financial_responsibility_arrangements_no_overlap;
alter table public.financial_responsibility_arrangements
    add constraint financial_responsibility_arrangements_no_overlap
    exclude using gist (
        org_id with =,
        customer_id with =,
        coalesce(customer_member_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
        coalesce(charge_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
        daterange(effective_start, effective_end, '[]') with &&
    ) where (state = 'active');

create index if not exists financial_responsibility_arrangements_charge_idx
    on public.financial_responsibility_arrangements (org_id, charge_id)
    where charge_id is not null;
