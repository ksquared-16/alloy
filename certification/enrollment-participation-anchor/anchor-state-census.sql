-- REAL ENROLLMENT V1 -- Completion Anchor: deployed-state census, before applying the backfill.
--
-- WHY THIS EXISTS
-- Three migrations carry the Completion Anchor and none of them is in any promoted SHA:
--
--     20260827160000  Enrollment Participation without an acquisition Opportunity
--     20260827170000  a context-free participation is EPISODE scoped
--     20260827180000  anchor existing journeys to their participation (the backfill)
--
-- The previously recorded expectation was 19 Enrollment journeys, 18 needing a context-free
-- participation, 1 deterministically anchorable, 0 ambiguous, 0 Opportunities created. That
-- number is now weeks old. This census RE-MEASURES rather than trusting it, and it is the
-- before-half of a before/after pair: the same artifact is re-run after the backfill.
--
-- SHAPE
-- The trusted-host reader takes column 1 as question_id, column 2 as a discarded row-kind
-- marker, and column 3 onward as payload. So column 2 is a fixed literal and every fact
-- travels inside the JSON payload, where nothing is positionally consumed.
--
-- DATA MINIMIZATION
-- Counts, org ids, and process-instance ids only. No child name, no family, no address, no
-- contact value, no artifact content. Ids are returned only for the ambiguous and dangling
-- rows, which are the rows a human has to look at by identity.
--
-- READ-ONLY BASIS
-- One statement. Every leaf is a SELECT over catalog or public tables. No DDL, no writes,
-- no function call that writes.
select
    question_id,
    'data' as row_kind,
    payload
from (
    -- Q1 LEDGER. Which of the three anchor migrations the deployed database has recorded.
    --      Emitted per-version with a boolean so an absent version is a row saying false,
    --      not a missing row that reads as "the question never ran".
    select
        'ledger'::text as question_id,
        json_build_object(
            'version', v.version,
            'recorded', exists (
                select 1 from supabase_migrations.schema_migrations m where m.version = v.version
            )
        )::text as payload
    from (values ('20260827160000'), ('20260827170000'), ('20260827180000')) as v(version)

    union all

    select
        'ledger_ceiling'::text,
        json_build_object('max_recorded_version', max(m.version))::text
    from supabase_migrations.schema_migrations m

    union all

    -- Q2 SCHEMA. Is the acquisition Opportunity optional on the participation yet?
    select
        'schema_participation_column'::text,
        json_build_object(
            'table', 'opportunity_customer_members',
            'column', a.attname,
            'is_nullable', not a.attnotnull
        )::text
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'opportunity_customer_members'
      and a.attname = 'opportunity_id'
      and a.attnum > 0
      and not a.attisdropped

    union all

    -- Q3 SCHEMA. Which identity rule guards a context-free participation.
    --      Both index names are asked for: the superseded one still present would mean the
    --      episode correction never landed.
    select
        'schema_participation_index'::text,
        json_build_object(
            'index', i.relname,
            'definition', pg_get_indexdef(x.indexrelid)
        )::text
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'opportunity_customer_members'
      and i.relname in ('uq_ocm_context_free_participation', 'uq_ocm_active_context_free_participation', 'uq_opportunity_customer_members_unique')

    union all

    -- Q4 TRIGGER. The consistency trigger refused a NULL opportunity by looking it up
    --      unconditionally. A constraint list cannot show this, so the deployed function
    --      body is asked whether it handles absence.
    select
        'schema_consistency_trigger'::text,
        json_build_object(
            'function', p.proname,
            'handles_absent_opportunity', position('opportunity_id IS NOT NULL' in p.prosrc) > 0
        )::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'validate_opportunity_customer_members_consistency'

    union all

    -- Q5 JOURNEYS. Every child Enrollment journey by the anchor it currently carries and by
    --      whether its episode is still open. This is the population the backfill acts on.
    select
        'journey_population'::text,
        json_build_object(
            'context_type', g.context_type,
            'has_context_id', g.has_context_id,
            'episode_open', g.episode_open,
            'journeys', g.journeys,
            'children', g.children,
            'orgs', g.orgs
        )::text
    from (
        select
            coalesce(pi.context_type, 'null') as context_type,
            pi.context_id is not null as has_context_id,
            coalesce(pi.state, '') not in ('enrolled', 'withdrawn', 'not_enrolling') as episode_open,
            count(*) as journeys,
            count(distinct pi.subject_id) as children,
            count(distinct pi.org_id) as orgs
        from public.process_instances pi
        where pi.process_key = 'enrollment'
          and pi.subject_type = 'child'
        group by 1, 2, 3
    ) g

    union all

    -- Q6 BACKFILL PROJECTION. For each OPEN journey that is not yet anchored, how many
    --      ACTIVE participations its child holds. 0 means the backfill creates a
    --      context-free one; 1 means it is deterministically anchorable; more than 1 is
    --      ambiguous and the migration deliberately leaves it alone.
    select
        'backfill_projection'::text,
        json_build_object(
            'active_participations_for_child', g.active_participations,
            'journeys', g.journeys
        )::text
    from (
        select
            proj.active_participations,
            count(*) as journeys
        from (
            select
                pi.id,
                (
                    select count(*)
                    from public.opportunity_customer_members o
                    where o.org_id = pi.org_id
                      and o.customer_member_id = pi.subject_id
                      and coalesce(o.outcome_status_key, '') not in ('withdrawn', 'not_enrolling')
                ) as active_participations
            from public.process_instances pi
            join public.customer_members cm on cm.id = pi.subject_id and cm.org_id = pi.org_id
            where pi.process_key = 'enrollment'
              and pi.subject_type = 'child'
              and pi.context_id is null
              and coalesce(pi.state, '') not in ('enrolled', 'withdrawn', 'not_enrolling')
        ) proj
        group by proj.active_participations
    ) g

    union all

    -- Q7 AMBIGUOUS ROWS BY IDENTITY. The ones a human must look at. Ids only.
    select
        'ambiguous_journey'::text,
        json_build_object('process_instance_id', proj.id, 'org_id', proj.org_id, 'active_participations', proj.active_participations)::text
    from (
        select
            pi.id,
            pi.org_id,
            (
                select count(*)
                from public.opportunity_customer_members o
                where o.org_id = pi.org_id
                  and o.customer_member_id = pi.subject_id
                  and coalesce(o.outcome_status_key, '') not in ('withdrawn', 'not_enrolling')
            ) as active_participations
        from public.process_instances pi
        where pi.process_key = 'enrollment'
          and pi.subject_type = 'child'
          and pi.context_id is null
          and coalesce(pi.state, '') not in ('enrolled', 'withdrawn', 'not_enrolling')
    ) proj
    where proj.active_participations > 1

    union all

    -- Q8 ANCHOR RESOLUTION. A journey already anchored to a participation must point at a
    --      row that exists. A dangling anchor is worse than none: consumers resolve it to
    --      nothing and report an empty Work View rather than an error.
    select
        'anchor_resolution'::text,
        json_build_object(
            'anchored_journeys', count(*),
            'resolves_to_participation', count(*) filter (where o.id is not null),
            'dangling', count(*) filter (where o.id is null),
            'participation_carries_opportunity', count(*) filter (where o.opportunity_id is not null),
            'participation_context_free', count(*) filter (where o.id is not null and o.opportunity_id is null)
        )::text
    from public.process_instances pi
    left join public.opportunity_customer_members o
      on o.id = pi.context_id and o.org_id = pi.org_id
    where pi.process_key = 'enrollment'
      and pi.subject_type = 'child'
      and pi.context_type = 'enrollment_participation'

    union all

    -- Q9 OPPORTUNITY BASELINE. The number no completion path may move. Re-read after the
    --      backfill, an increase here is a fabricated acquisition.
    select
        'opportunity_baseline'::text,
        json_build_object(
            'opportunities', (select count(*) from public.opportunities),
            'participations', (select count(*) from public.opportunity_customer_members),
            'participations_context_free', (select count(*) from public.opportunity_customer_members where opportunity_id is null),
            'participations_active_context_free', (
                select count(*) from public.opportunity_customer_members
                where opportunity_id is null
                  and coalesce(outcome_status_key, '') not in ('withdrawn', 'not_enrolling')
            )
        )::text

    union all

    -- Q10 DUPLICATE GUARD. More than one ACTIVE context-free participation for one child is
    --      exactly what the episode-scoped index forbids. Non-zero before the index means
    --      the index will not build; non-zero after means it is not doing its job.
    select
        'duplicate_active_context_free'::text,
        json_build_object('groups', count(*))::text
    from (
        select o.org_id, o.customer_member_id
        from public.opportunity_customer_members o
        where o.opportunity_id is null
          and coalesce(o.outcome_status_key, '') not in ('withdrawn', 'not_enrolling')
        group by o.org_id, o.customer_member_id
        having count(*) > 1
    ) dup

    union all

    -- Q11 PACKET AND SESSION IDENTITY. The backfill must preserve what a parent already
    --      started. This is the before-count of participant sessions bound to an Enrollment
    --      journey; the after-count must be identical.
    select
        'participant_session_baseline'::text,
        json_build_object(
            'sessions_bound_to_enrollment_journey', count(*),
            'distinct_journeys', count(distinct s.process_instance_id)
        )::text
    from public.form_packet_sessions s
    join public.process_instances pi on pi.id = s.process_instance_id
    where pi.process_key = 'enrollment'
      and pi.subject_type = 'child'
) census
order by question_id, payload
