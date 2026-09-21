-- COVERAGE — a cancellation must not overwrite why the allocation existed.
--
-- `staff_coverage_cancel` wrote its reason into `reason_key`, the column holding
-- the reason the allocation was AUTHORED. Cancelling a correction therefore
-- replaced "this was a correction" with "we cancelled it", and the authored
-- reason was gone for good.
--
-- That is edit-in-place in an authority whose whole claim is that nothing is
-- edited in place. Every other lifecycle operation writes a new row; only this
-- one reached back into an existing one and destroyed a field.
--
-- The two reasons are different facts about different moments, so they get
-- different columns. Found by the hosted audit projection: a CORRECTED event
-- reported the cancellation's reason because the correction's had been erased.
--
-- No backfill. Distinguishing a clobbered reason from a genuine one is not
-- possible after the fact, and guessing would be worse than the gap — the
-- relocation would be right for rows cancelled WITH a reason and wrong for rows
-- cancelled without one, with nothing in the row to tell them apart. It costs
-- nothing here: every coverage row in existence when this lands is bounded QA
-- data from this slice's own certification, and no operator-authored Coverage
-- has been cancelled anywhere.

alter table public.staff_coverage_allocations
    add column if not exists cancel_reason_key text;

comment on column public.staff_coverage_allocations.reason_key is
    'Why this allocation was authored. Never rewritten by a later lifecycle operation.';
comment on column public.staff_coverage_allocations.cancel_reason_key is
    'Why this allocation was cancelled. Null unless lifecycle_state = cancelled.';

create or replace function public.staff_coverage_cancel(
    p_coverage_id uuid,
    p_reason_key text default null,
    p_actor uuid default null
) returns void
language plpgsql
as $$
declare
    prior public.staff_coverage_allocations%rowtype;
begin
    select * into prior from public.staff_coverage_allocations where id = p_coverage_id for update;
    if not found then
        raise exception 'staff_coverage: allocation % not found', p_coverage_id using errcode = 'no_data_found';
    end if;
    if prior.lifecycle_state <> 'active' then
        raise exception 'staff_coverage: allocation % is already %', p_coverage_id, prior.lifecycle_state
            using errcode = '22023';
    end if;

    -- reason_key is deliberately untouched: it says why this allocation existed,
    -- which cancelling it does not change.
    update public.staff_coverage_allocations
       set lifecycle_state = 'cancelled',
           cancelled_at = now(),
           cancelled_by = p_actor,
           cancel_reason_key = p_reason_key
     where id = p_coverage_id;
end;
$$;

do $$
declare
    v_id uuid;
    v_reason text;
    v_cancel text;
begin
    if not exists (select 1 from public.staff_coverage_allocations limit 1) then
        return;
    end if;

    -- Self-test on a real row is not available here without authoring one, and
    -- authoring Coverage from a migration would put fiction in an operator's
    -- schedule. The column's presence is asserted instead; behaviour is covered
    -- by the certification suite.
    select column_name into v_reason from information_schema.columns
     where table_schema='public' and table_name='staff_coverage_allocations' and column_name='cancel_reason_key';
    if v_reason is null then
        raise exception 'staff_coverage: cancel_reason_key did not materialize';
    end if;
end;
$$;
