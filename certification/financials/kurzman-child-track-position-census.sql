-- =============================================================================
-- THREAD 11 — WHERE ARE THE KURZMAN CHILDREN, AT THE GRAIN THAT OWNS MEMBERSHIP?
--
-- Canonical doctrine, from 20260713000000_process_instances.sql itself: a process instance is the
-- running journey of a SUBJECT through a PROCESS within a CONTEXT. `stage_key` is the POSITION and
-- `state` is the durable state that replaced opportunity_customer_members.outcome_status_key. So
-- child-track stage membership is process_instances.stage_key, and `waitlisted` is a STATE value,
-- never a membership condition.
--
-- The queue repair therefore turns on a fact nobody has measured: do the Kurzman children have
-- process instances at all, and if so what stage are they at? A lane keyed on child stage position
-- admits nothing if the instances were never created.
--
-- Ids, keys and counts only. No names, no contact details, no money.
-- =============================================================================
select json_build_object(
    'case', (
        select json_build_object('stage_key', o.stage_key, 'status_key', o.status_key)
        from public.opportunities o
        where o.id = 'd097e1a8-c3c0-4c51-a113-2275b009b9a9'
    ),
    -- The child-track journeys for THIS case, at the grain that owns membership.
    'instances_on_case', (
        select json_agg(x) from (
            select json_build_object(
                'process_key', pi.process_key,
                'subject_type', pi.subject_type,
                'stage_key', pi.stage_key,
                'state', pi.state,
                'rows', count(*)
            ) as x
            from public.process_instances pi
            where pi.context_id = 'd097e1a8-c3c0-4c51-a113-2275b009b9a9'
            group by pi.process_key, pi.subject_type, pi.stage_key, pi.state
        ) a
    ),
    -- Tenant-wide shape, so an empty answer above can be told apart from a tenant with no instances.
    'instances_tenant', (
        select json_agg(y) from (
            select json_build_object(
                'process_key', pi.process_key,
                'stage_key', pi.stage_key,
                'state', pi.state,
                'rows', count(*)
            ) as y
            from public.process_instances pi
            group by pi.process_key, pi.stage_key, pi.state
        ) b
    ),
    -- Case-grain positions, for the Lead/Tour lanes under the same doctrine.
    'case_stages_tenant', (
        select json_agg(z) from (
            select json_build_object('stage_key', o.stage_key, 'status_key', o.status_key,
                                     'cases', count(*)) as z
            from public.opportunities o
            group by o.stage_key, o.status_key
        ) c
    ),
    'totals', (select json_build_object(
        'process_instances', (select count(*) from public.process_instances),
        'opportunities', (select count(*) from public.opportunities),
        'ocm_rows', (select count(*) from public.opportunity_customer_members)
    ))
) as kurzman_child_track_position;
