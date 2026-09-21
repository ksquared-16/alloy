-- MATERIALIZE EXISTING ASSIGNMENT TIME.
--
-- Every Assignment that exists today gets its own weekday intervals, derived from the
-- pattern it was created from. After this runs the pattern is history: editing it will
-- not move an Assignment that has already been materialized.
--
-- ── THE PARSER IS MIRRORED, NOT REINVENTED ──
--
-- `readPatternDefaultHours` in web/lib/scheduling/editorPatterns.ts is the one current
-- definition of "what hours does this pattern default to". The function below mirrors
-- it EXACTLY, including the parts that look incidental:
--
--   * three accepted shapes, in the same precedence order: `default_hours` (or
--     `defaultHours`), then `hours: { opens_at, closes_at }`, then flat
--     `defaultArrive` / `defaultDepart`
--   * the same strict HH:MM 24-hour pattern, so "8:00" is NOT a time and neither is
--     "08:00:00" — a looser regex here would invent hours the runtime never showed
--   * depart strictly after arrive, else the range is rejected whole
--
-- Divergence between the two would show up as an Assignment whose hours changed the
-- day this migration ran, which is the one outcome a backfill must never produce.

create or replace function public.pattern_default_hours_compat(p_metadata jsonb)
returns table (arrive time, depart time)
language plpgsql
immutable
set search_path = public
as $$
declare
    v_re constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
    v_a text;
    v_d text;
    v_obj jsonb;
begin
    if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
        return;
    end if;

    -- Shape 1 — nested default_hours / defaultHours.
    v_obj := coalesce(p_metadata->'default_hours', p_metadata->'defaultHours');
    if v_obj is not null and jsonb_typeof(v_obj) = 'object' then
        v_a := btrim(v_obj->>'arrive'); v_d := btrim(v_obj->>'depart');
        if v_a ~ v_re and v_d ~ v_re and v_d > v_a then
            arrive := v_a::time; depart := v_d::time; return next; return;
        end if;
    end if;

    -- Shape 2 — Locations Schedule config v3: hours { opens_at, closes_at }.
    v_obj := p_metadata->'hours';
    if v_obj is not null and jsonb_typeof(v_obj) = 'object' then
        v_a := btrim(coalesce(v_obj->>'opens_at', v_obj->>'opensAt'));
        v_d := btrim(coalesce(v_obj->>'closes_at', v_obj->>'closesAt'));
        if v_a ~ v_re and v_d ~ v_re and v_d > v_a then
            arrive := v_a::time; depart := v_d::time; return next; return;
        end if;
    end if;

    -- Shape 3 — flat defaultArrive / defaultDepart.
    v_a := btrim(p_metadata->>'defaultArrive'); v_d := btrim(p_metadata->>'defaultDepart');
    if v_a ~ v_re and v_d ~ v_re and v_d > v_a then
        arrive := v_a::time; depart := v_d::time; return next; return;
    end if;

    return;
end;
$$;

-- One row per Assignment per weekday its pattern runs.
--
-- Where the pattern resolves hours, the interval carries them. Where it does not, the
-- row carries NULL times and means "this weekday recurs, hours unknown" — the
-- Assignment is never dropped and hours are never manufactured.
--
-- `source_key` distinguishes an inherited default from an operator decision, so a
-- later reader can tell which Assignments have genuinely been scheduled by a human.
insert into public.assignment_weekday_intervals
    (org_id, assignment_id, weekday, start_time, end_time, source_key, created_at, updated_at)
select
    sa.org_id,
    sa.id,
    w.weekday::smallint,
    h.arrive,
    h.depart,
    case when h.arrive is null then 'backfill_hours_unknown' else 'backfill_pattern_default' end,
    now(),
    now()
from public.schedule_assignments sa
join public.schedule_patterns sp
  on sp.id = sa.schedule_pattern_id and sp.org_id = sa.org_id
cross join lateral unnest(sp.weekdays) as w(weekday)
left join lateral public.pattern_default_hours_compat(sp.metadata) as h on true
where w.weekday between 0 and 6
on conflict do nothing;
