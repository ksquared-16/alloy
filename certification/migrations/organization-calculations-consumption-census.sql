-- Read-only census: does anything on the deployed primary CONSUME an organization calculation?
--
-- The product-status census found nine calculations on one tenant, all authored in a two-day window
-- ending 2026-07-28, and `runtime_bound=0` — not one version bound through `consumer_bindings`.
-- That is not the whole consumption story, because Operational Intelligence binds differently: an OI
-- measurement stores `source.calculation_id` inside `org_settings.metadata`, and the answer paths
-- (`answerRoomUtilization`, `answerFutureRoomCapacity`, `answerMeasureQuestion`) evaluate through it.
--
-- So this asks the other half: does any org_settings row carry an OI measurement, and does any of
-- them name a calculation? A feature with authored rows and zero consumers is a proving slice; one
-- whose results reach an operator answer is load-bearing runtime, whatever its product surface.
--
-- Metadata KEY NAMES and counts only; no tenant content is read.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
select question_id, kind, payload
from (
    -- Which top-level metadata keys exist at all, across org_settings.
    select 'org_settings_keys'::text, 'vocabulary'::text,
           (k || ' x' || count(*)::text)::text, 'a_' || k
    from public.org_settings s, jsonb_object_keys(coalesce(s.metadata, '{}'::jsonb)) k
    group by k

    union all
    -- The decisive one: does ANY org_settings metadata mention a calculation id at all?
    select 'mentions_calculation'::text, 'decisive'::text,
           ('org_settings_rows=' || count(*)::text
            || ' mentioning_calculation_id=' || count(*) filter (
                 where coalesce(s.metadata::text,'') like '%calculation_id%')::text
            || ' mentioning_orgcalc=' || count(*) filter (
                 where coalesce(s.metadata::text,'') like '%orgcalc%')::text)::text,
           'b1'::text
    from public.org_settings s

    union all
    -- And does any surviving calculation id actually appear in that metadata? Names the join the
    -- OI answer paths rely on, without reading the documents themselves.
    select 'calculation_referenced'::text, 'decisive'::text,
           (c.key || ' ~ referenced_in_org_settings ~ '
            || (exists (select 1 from public.org_settings s
                         where s.org_id = c.org_id
                           and coalesce(s.metadata::text,'') like '%' || c.id::text || '%'))::text
            || ' ~ ' || (exists (select 1 from public.org_settings s
                         where s.org_id = c.org_id
                           and coalesce(s.metadata::text,'') like '%' || c.id::text || '%'))::text)::text,
           'c_' || c.key
    from public.organization_calculations c

    union all
    select 'nonvacuity'::text, 'guard'::text,
           ('org_settings_rows=' || (select count(*) from public.org_settings)::text
            || ' calculations=' || (select count(*) from public.organization_calculations)::text
            || ' orgs=' || (select count(*) from public.orgs)::text)::text,
           'zz0'::text
) q(question_id, kind, payload, sort_key)
order by sort_key;
