-- SEEDING IS ATOMIC BECAUSE IT HAPPENS WHERE THE FACT LIVES.
--
-- An Assignment and its intervals are written through supabase-js, which has no
-- multi-statement transaction: an application-side "insert the Assignment, then insert
-- its intervals" is two round trips, and the failure between them leaves an operator
-- looking at a successful save whose hours silently do not exist.
--
-- Seeding in a trigger removes that window entirely. The intervals are written in the
-- same statement as the Assignment, so either both exist or neither does, and every
-- writer is covered — including any this slice did not find.
--
-- ── WHAT IT DOES AND DOES NOT DECIDE ──
--
-- It seeds the pattern's DEFAULTS. It never overwrites intervals that already exist,
-- so an explicit authoring path that writes its own hours afterwards keeps them, and a
-- re-run cannot silently revert an operator's decision to a template.
--
-- On UPDATE it re-seeds only when `schedule_pattern_id` actually changes, because that
-- is a change of recurrence and the old weekdays no longer describe the Assignment.
-- Editing the reusable pattern itself does NOT reach this trigger: a pattern edit does
-- not touch schedule_assignments, which is exactly the independence the model requires.

create or replace function public.seed_assignment_weekday_intervals()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_weekdays smallint[];
    v_metadata jsonb;
    v_arrive time;
    v_depart time;
begin
    if new.schedule_pattern_id is null then
        return new;
    end if;

    -- A pattern change is a recurrence change: the previous materialization described
    -- days this Assignment no longer works.
    if tg_op = 'UPDATE' then
        if new.schedule_pattern_id is not distinct from old.schedule_pattern_id then
            return new;
        end if;
        delete from public.assignment_weekday_intervals where assignment_id = new.id;
    end if;

    -- Never clobber hours that already exist. An explicit authoring path writes its
    -- own intervals and this must not undo them.
    if exists (select 1 from public.assignment_weekday_intervals where assignment_id = new.id) then
        return new;
    end if;

    select sp.weekdays, sp.metadata into v_weekdays, v_metadata
    from public.schedule_patterns sp
    where sp.id = new.schedule_pattern_id and sp.org_id = new.org_id;

    if v_weekdays is null or cardinality(v_weekdays) = 0 then
        return new;
    end if;

    select h.arrive, h.depart into v_arrive, v_depart
    from public.pattern_default_hours_compat(v_metadata) h;

    insert into public.assignment_weekday_intervals
        (org_id, assignment_id, weekday, start_time, end_time, source_key)
    select
        new.org_id,
        new.id,
        w::smallint,
        v_arrive,
        v_depart,
        case when v_arrive is null then 'pattern_seed_hours_unknown' else 'pattern_seed' end
    from unnest(v_weekdays) w
    where w between 0 and 6
    on conflict do nothing;

    return new;
end;
$$;

drop trigger if exists seed_assignment_weekday_intervals_ins on public.schedule_assignments;
create trigger seed_assignment_weekday_intervals_ins
    after insert on public.schedule_assignments
    for each row execute function public.seed_assignment_weekday_intervals();

drop trigger if exists seed_assignment_weekday_intervals_upd on public.schedule_assignments;
create trigger seed_assignment_weekday_intervals_upd
    after update of schedule_pattern_id on public.schedule_assignments
    for each row execute function public.seed_assignment_weekday_intervals();
