-- ASSIGNMENT TIME — the authoring path the model always assumed and never had.
--
-- `seed_assignment_weekday_intervals` materialises hours from a pattern when an
-- Assignment is created, and its own comment reserves the ground: "An explicit
-- authoring path writes its own intervals and this must not undo them." That path
-- was never built. The consequence reached all the way to the operating product:
-- every child Assignment on staging carries recurrence with NULL hours, so no room
-- ever requires a staff member, so no staffing gap can exist to be seen or filled.
--
-- Three things an operator could not do, and now can:
--
--   * give an Assignment hours at all, after it was created
--   * change those hours without changing the reusable pattern
--   * work different hours on different weekdays — the trigger seeds ONE
--     arrive/depart pair across every weekday, so Mon/Wed/Fri 08:00-16:30 beside
--     Tue/Thu 09:00-17:30 was not expressible on one Assignment
--
-- ── WHY THIS IS A FUNCTION AND NOT APPLICATION CODE ──
--
-- Replacing a week is a delete and an insert. supabase-js has no multi-statement
-- transaction, so an application-side pair has a window in which an Assignment has
-- had its old hours removed and not yet received its new ones — and a reader in
-- that window sees an operator's schedule as unknown. The same reasoning made
-- Coverage's supersede a function.
--
-- Pattern independence is preserved exactly as before: this writes the Assignment's
-- own intervals and never touches `schedule_patterns`. Editing a reusable pattern
-- still does not reach an Assignment that already has hours.

create or replace function public.set_assignment_weekday_intervals(
    p_assignment_id uuid,
    p_days jsonb,
    p_actor uuid default null
) returns integer
language plpgsql
as $$
declare
    v_org uuid;
    v_day jsonb;
    v_weekday smallint;
    v_start time;
    v_end time;
    v_count integer := 0;
begin
    select org_id into v_org from public.schedule_assignments where id = p_assignment_id;
    if v_org is null then
        raise exception 'assignment_time: assignment % not found', p_assignment_id
            using errcode = 'no_data_found';
    end if;

    if p_days is null or jsonb_typeof(p_days) <> 'array' then
        raise exception 'assignment_time: days must be an array' using errcode = '22023';
    end if;

    -- The whole week is replaced, so a weekday the operator removed stops
    -- producing recurrence rather than lingering as a row nobody can see.
    delete from public.assignment_weekday_intervals where assignment_id = p_assignment_id;

    for v_day in select * from jsonb_array_elements(p_days)
    loop
        v_weekday := (v_day->>'weekday')::smallint;
        if v_weekday is null or v_weekday < 0 or v_weekday > 6 then
            raise exception 'assignment_time: weekday % is not 0-6', v_day->>'weekday'
                using errcode = '22023';
        end if;

        -- Absent or null times mean UNKNOWN for that weekday, which is a real
        -- answer the model has always carried and this must keep being able to say.
        v_start := nullif(btrim(coalesce(v_day->>'start_time', '')), '')::time;
        v_end := nullif(btrim(coalesce(v_day->>'end_time', '')), '')::time;

        if (v_start is null) <> (v_end is null) then
            raise exception 'assignment_time: weekday % has half an interval', v_weekday
                using errcode = '22023';
        end if;
        if v_start is not null and v_end <= v_start then
            raise exception 'assignment_time: weekday % must end after it starts', v_weekday
                using errcode = '22023';
        end if;

        insert into public.assignment_weekday_intervals
            (org_id, assignment_id, weekday, start_time, end_time, source_key, created_by, updated_by)
        values
            (v_org, p_assignment_id, v_weekday, v_start, v_end, 'operator', p_actor, p_actor);
        v_count := v_count + 1;
    end loop;

    return v_count;
end;
$$;

comment on function public.set_assignment_weekday_intervals(uuid, jsonb, uuid) is
    'Replace one Assignment''s recurring weekday hours in a single transaction. Operator-authored; never touches the reusable schedule pattern.';

do $$
declare
    v_exists integer;
begin
    select count(*) into v_exists from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'set_assignment_weekday_intervals';
    if v_exists = 0 then
        raise exception 'assignment_time: authoring function did not materialize';
    end if;
end;
$$;
