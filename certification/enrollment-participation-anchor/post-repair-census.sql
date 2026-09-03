-- POST-REPAIR snapshot: the same questions again, after the fixture's Opportunity leak was fixed
-- and the thirteen orphans swept.
--
-- A SEPARATE FILE ON PURPOSE. Re-requesting post-fixture-census.sql returned the 19:00:57 result
-- unchanged -- the census runner caches by query hash, so an identical query cannot produce a second
-- reading no matter what happened to the database in between. Re-running it and diffing would have
-- reported the pre-repair numbers as though they were post-repair. Three snapshots, three files,
-- three hashes: baseline, post-fixture (which exposed the leak), and this one (the delta claim).
-- REAL ENROLLMENT V1 -- per-migration DEPLOYED TRUTH, and the population baseline.
--
-- WHY THIS EXISTS
-- The certification ledger records five Enrollment migrations as applied. The first successful
-- census proved that is false for at least three of them: the indexes do not exist and the anchor
-- backfill left no trace. "The version string is in schema_migrations" is not evidence that a
-- migration ran, and this asks the only question that is: are its durable POSTCONDITIONS present?
--
-- Each migration is classified from its own objects, never inferred from application code:
--
--   20260827160000  opportunity_id nullable + consistency trigger tolerates an absent Opportunity
--   20260827170000  the episode-scoped context-free uniqueness index
--   20260827180000  the anchor backfill -- journeys carrying context_type=enrollment_participation
--   20260901120000  enrollment_requirement_exceptions table, its active-unique index, RLS, permission
--   20260902090000  uq_ocm_active_context_free_episode
--
-- SHAPE
-- The trusted-host reader takes column 1 as question_id, column 2 as a discarded row-kind marker,
-- and column 3 onward as payload, so every fact travels inside the JSON payload.
--
-- DATA MINIMIZATION
-- Counts, catalog names and booleans. No child, family, contact or artifact content. No ids except
-- where a human must look at a specific row by identity.
--
-- READ-ONLY BASIS
-- One statement. Every leaf is a SELECT over catalog or public tables.
select
    question_id,
    'data' as row_kind,
    payload
from (
    -- LEDGER, all five, so ledger-vs-effect can be compared in one artifact.
    select
        'ledger'::text as question_id,
        json_build_object(
            'version', v.version,
            'recorded', exists (
                select 1 from supabase_migrations.schema_migrations m where m.version = v.version
            )
        )::text as payload
    from (values
        ('20260827160000'), ('20260827170000'), ('20260827180000'),
        ('20260901120000'), ('20260902090000')
    ) as v(version)

    union all

    -- 20260827160000 -- POSTCONDITION A: the acquisition Opportunity is optional.
    select
        'post_20260827160000_nullable'::text,
        json_build_object('column', a.attname, 'is_nullable', not a.attnotnull)::text
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'opportunity_customer_members'
      and a.attname = 'opportunity_id' and a.attnum > 0 and not a.attisdropped

    union all

    -- 20260827160000 -- POSTCONDITION B: the consistency trigger tolerates an absent Opportunity.
    select
        'post_20260827160000_trigger'::text,
        json_build_object(
            'function', p.proname,
            'handles_absent_opportunity', position('opportunity_id IS NOT NULL' in p.prosrc) > 0
        )::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'validate_opportunity_customer_members_consistency'

    union all

    -- 20260827170000 and 20260902090000 -- every context-free uniqueness index, by name, with its
    -- predicate. Both migrations own an index here and the predicate is what distinguishes them.
    select
        'post_context_free_indexes'::text,
        json_build_object(
            'index', i.relname,
            'definition', pg_get_indexdef(x.indexrelid)
        )::text
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'opportunity_customer_members'

    union all

    -- 20260827180000 -- the backfill's only durable trace: journeys anchored to a participation.
    select
        'post_20260827180000_anchor'::text,
        json_build_object(
            'participation_anchored_journeys', g.anchored,
            'opportunity_anchored_journeys', g.opportunity_anchored,
            'unanchored_journeys', g.unanchored,
            'context_free_participations', (
                select count(*) from public.opportunity_customer_members where opportunity_id is null
            )
        )::text
    from (
        select
            count(*) filter (where pi.context_type = 'enrollment_participation') as anchored,
            count(*) filter (where pi.context_type = 'opportunity') as opportunity_anchored,
            count(*) filter (where pi.context_id is null) as unanchored
        from public.process_instances pi
        where pi.process_key = 'enrollment' and pi.subject_type = 'child'
    ) g

    union all

    -- 20260901120000 -- the exception table itself.
    select
        'post_20260901120000_table'::text,
        json_build_object(
            'table_exists', g.n > 0,
            'rls_enabled', g.rls,
            'rls_forced', g.forced
        )::text
    from (
        select count(*) as n, bool_or(c.relrowsecurity) as rls, bool_or(c.relforcerowsecurity) as forced
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'enrollment_requirement_exceptions'
    ) g

    union all

    -- 20260901120000 -- its indexes and policies, which a bare CREATE TABLE would not produce.
    select
        'post_20260901120000_objects'::text,
        json_build_object(
            'indexes', (
                select coalesce(json_agg(i.relname order by i.relname), '[]'::json)
                from pg_index x
                join pg_class i on i.oid = x.indexrelid
                join pg_class t on t.oid = x.indrelid
                join pg_namespace n2 on n2.oid = t.relnamespace
                where n2.nspname = 'public' and t.relname = 'enrollment_requirement_exceptions'
            ),
            'policies', (
                select coalesce(json_agg(pol.polname order by pol.polname), '[]'::json)
                from pg_policy pol
                join pg_class t on t.oid = pol.polrelid
                join pg_namespace n3 on n3.oid = t.relnamespace
                where n3.nspname = 'public' and t.relname = 'enrollment_requirement_exceptions'
            ),
            'permission_registered', exists (
                select 1 from public.permission_definitions
                where key = 'enrollment.requirement_exception.manage'
            )
        )::text

    union all

    -- POPULATION BASELINE, re-measured. The historical 19/18/1 expectation is stale and is not used.
    -- Grouped in a NESTED subquery. Aggregating inside json_build_object in a UNION branch puts
    -- count(*) into this branch's own GROUP BY -- Postgres refuses it, and the census returns
    -- nothing rather than the one number the whole exercise is about.
    select
        'journey_population'::text,
        json_build_object(
            'context_type', g.context_type,
            'episode_open', g.episode_open,
            'journeys', g.journeys,
            'children', g.children,
            'orgs', g.orgs
        )::text
    from (
        select
            coalesce(pi.context_type, 'null') as context_type,
            coalesce(pi.state, '') not in ('enrolled', 'withdrawn', 'not_enrolling') as episode_open,
            count(*) as journeys,
            count(distinct pi.subject_id) as children,
            count(distinct pi.org_id) as orgs
        from public.process_instances pi
        where pi.process_key = 'enrollment' and pi.subject_type = 'child'
        group by 1, 2
    ) g

    union all

    select
        'participation_baseline'::text,
        json_build_object(
            'opportunities', (select count(*) from public.opportunities),
            'participations', (select count(*) from public.opportunity_customer_members),
            'context_free', (select count(*) from public.opportunity_customer_members where opportunity_id is null),
            'active_context_free', (
                select count(*) from public.opportunity_customer_members
                where opportunity_id is null
                  and coalesce(outcome_status_key, '') not in ('withdrawn', 'not_enrolling', 'enrolled')
            ),
            'enrolled', (
                select count(*) from public.opportunity_customer_members where outcome_status_key = 'enrolled'
            )
        )::text

    union all

    -- Binding integrity: the backfill must preserve what a parent already started.
    select
        'session_baseline'::text,
        json_build_object(
            'sessions_bound_to_enrollment_journey', g.sessions,
            'distinct_journeys', g.journeys
        )::text
    from (
        select count(*) as sessions, count(distinct s.process_instance_id) as journeys
        from public.form_packet_sessions s
        join public.process_instances pi on pi.id = s.process_instance_id
        where pi.process_key = 'enrollment' and pi.subject_type = 'child'
    ) g

    union all

    -- Duplicate guard: more than one ACTIVE context-free participation per child is what the
    -- episode index forbids. Non-zero before the index means the index cannot build.
    select
        'duplicate_active_context_free'::text,
        json_build_object('groups', (select count(*) from (
        select o.org_id, o.customer_member_id
        from public.opportunity_customer_members o
        where o.opportunity_id is null
          and coalesce(o.outcome_status_key, '') not in ('withdrawn', 'not_enrolling', 'enrolled')
        group by o.org_id, o.customer_member_id
        having count(*) > 1
    ) dup))::text

    union all

    -- Ambiguity the backfill deliberately refuses to resolve: an unanchored open journey whose
    -- child holds more than one active participation. Ids, because a human must look at these.
    select
        'ambiguous_journey'::text,
        json_build_object('process_instance_id', proj.id, 'org_id', proj.org_id, 'active_participations', proj.n)::text
    from (
        select pi.id, pi.org_id,
            (select count(*) from public.opportunity_customer_members o
              where o.org_id = pi.org_id and o.customer_member_id = pi.subject_id
                and coalesce(o.outcome_status_key, '') not in ('withdrawn', 'not_enrolling')) as n
        from public.process_instances pi
        where pi.process_key = 'enrollment' and pi.subject_type = 'child'
          and pi.context_id is null
          and coalesce(pi.state, '') not in ('enrolled', 'withdrawn', 'not_enrolling')
    ) proj
    where proj.n > 1
    union all

    -- OPERATIONAL HANDOFF BASELINE. What exists before any certification journey runs, so the
    -- after-comparison can attribute exactly one agreement/placement/schedule to this run.
    select
        'operational_baseline'::text,
        json_build_object(
            'agreements', (select count(*) from public.child_enrollment_agreements),
            'placements', (select count(*) from public.child_placements),
            'schedule_assignments', (select count(*) from public.schedule_assignments)
        )::text

    union all

    -- GOVERNED EXCEPTIONS. Zero expected before certification exercises the capability.
    select
        'exception_baseline'::text,
        json_build_object(
            'total', (select count(*) from public.enrollment_requirement_exceptions),
            'active', (select count(*) from public.enrollment_requirement_exceptions where state = 'active'),
            'revoked', (select count(*) from public.enrollment_requirement_exceptions where state = 'revoked')
        )::text

) census
order by question_id, payload
