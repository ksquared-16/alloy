-- =============================================================================
-- Search Platform V2 — certification fixtures
-- =============================================================================
-- Adds ONLY what the four remaining Search scenarios need, on top of the
-- representative seed (org `northwind-early-learning`):
--
--   A. sibling schedule grain      — Joe M/W/F, Emma Tue/Thu, at CHILD grain
--   B. multi-process child         — Joe in THREE configured Business Processes
--   C. duplicate-name disambiguation — two accessible "Joe Smith", different households
--   D. permission-restricted absence — a third Joe at a campus a restricted operator cannot reach
--
-- Runs ONLY against the disposable local certification tenant. It resolves the
-- org by slug and fails loudly if that org is absent, so it cannot be pointed at
-- a shared or hosted tenant by accident.
--
-- Idempotent: deterministic UUIDs in a fixture-owned range (…-0000-4000-8000-
-- 00005xxxxxxx) with ON CONFLICT DO UPDATE, so re-running is safe.
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE slug = 'northwind-early-learning') THEN
        RAISE EXCEPTION
            'Search certification fixtures target the disposable cert tenant only (org slug northwind-early-learning). Refusing to run.';
    END IF;
END $$;

\set ORG_SLUG 'northwind-early-learning'

-- Resolve the tenant + campuses by stable natural keys rather than hardcoding.
CREATE TEMP TABLE _ctx AS
SELECT
    o.id                                                              AS org_id,
    (SELECT l.id FROM public.locations l
      WHERE l.org_id = o.id AND l.location_type = 'site'
        AND l.label ILIKE '%Riverside%' LIMIT 1)                      AS site_a,
    (SELECT l.id FROM public.locations l
      WHERE l.org_id = o.id AND l.location_type = 'site'
        AND l.label ILIKE '%Lakeside%'  LIMIT 1)                      AS site_b,
    (SELECT d.id FROM public.departments d
      WHERE d.org_id = o.id AND d.is_active IS NOT FALSE
      ORDER BY d.sort_order NULLS LAST, d.key LIMIT 1)                AS dept_id,
    -- The Work Unit that HOSTS these families operationally. A fixture household
    -- with no `work_unit_id` belongs to no queue, so no Work View's evaluated page
    -- ever contains it and every `?subject_id=` deep link to it is answered
    -- `subject_unavailable` — the Focus Panel never composes. Resolved by key so a
    -- renamed unit fails loudly here rather than silently emptying the surface.
    (SELECT wu.id FROM public.work_units wu
      WHERE wu.org_id = o.id AND wu.key = 'enrollment_pipeline' LIMIT 1)  AS host_work_unit
FROM public.orgs o
WHERE o.slug = :'ORG_SLUG';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM _ctx WHERE host_work_unit IS NOT NULL) THEN
        RAISE EXCEPTION
            'No work unit keyed `enrollment_pipeline` — the certification households would belong to no queue and no Focus Panel could compose for them.';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Fixture identifiers (deterministic)
-- -----------------------------------------------------------------------------
\set SMITH_HH      '00000000-0000-4000-8000-000050000001'
\set RIVERS_HH     '00000000-0000-4000-8000-000050000002'
\set LAKESIDE_HH   '00000000-0000-4000-8000-000050000003'
\set JANE_PERSON   '00000000-0000-4000-8000-000050000010'
\set JOE_PERSON    '00000000-0000-4000-8000-000050000011'
\set EMMA_PERSON   '00000000-0000-4000-8000-000050000012'
\set JOE2_PERSON   '00000000-0000-4000-8000-000050000013'
\set JOE_MEMBER    '00000000-0000-4000-8000-000050000020'
\set EMMA_MEMBER   '00000000-0000-4000-8000-000050000021'
\set JOE2_MEMBER   '00000000-0000-4000-8000-000050000022'
\set JOE3_MEMBER   '00000000-0000-4000-8000-000050000023'
\set SMITH_OPP     '00000000-0000-4000-8000-000050000030'
\set RIVERS_OPP    '00000000-0000-4000-8000-000050000031'
\set LAKESIDE_OPP  '00000000-0000-4000-8000-000050000032'
\set PATTERN_MWF   '00000000-0000-4000-8000-000050000040'
\set PATTERN_TT    '00000000-0000-4000-8000-000050000041'
\set AGREEMENT_JOE '00000000-0000-4000-8000-000050000050'
\set AGREEMENT_EMM '00000000-0000-4000-8000-000050000051'

-- -----------------------------------------------------------------------------
-- Households
-- -----------------------------------------------------------------------------
INSERT INTO public.customers (id, org_id, name)
SELECT :'SMITH_HH'::uuid, org_id, 'Smith Household' FROM _ctx
UNION ALL SELECT :'RIVERS_HH'::uuid, org_id, 'Rivers Household' FROM _ctx
UNION ALL SELECT :'LAKESIDE_HH'::uuid, org_id, 'Smith Household (Lakeside)' FROM _ctx
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- -----------------------------------------------------------------------------
-- People — canonical human identity
-- -----------------------------------------------------------------------------
INSERT INTO public.persons (id, org_id, first_name, last_name, full_name, email, phone, date_of_birth)
SELECT :'JANE_PERSON'::uuid, org_id, 'Jane', 'Smith', 'Jane Smith',
       'jane.smith@northwind.invalid', '555-0101', NULL::date FROM _ctx
UNION ALL SELECT :'JOE_PERSON'::uuid, org_id, 'Joe', 'Smith', 'Joe Smith', NULL, NULL, '2021-04-12'::date FROM _ctx
UNION ALL SELECT :'EMMA_PERSON'::uuid, org_id, 'Emma', 'Smith', 'Emma Smith', NULL, NULL, '2019-09-03'::date FROM _ctx
UNION ALL SELECT :'JOE2_PERSON'::uuid, org_id, 'Joe', 'Smith', 'Joe Smith', NULL, NULL, '2020-02-20'::date FROM _ctx
ON CONFLICT (id) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        full_name  = EXCLUDED.full_name,
        email      = EXCLUDED.email,
        phone      = EXCLUDED.phone,
        date_of_birth = EXCLUDED.date_of_birth;

-- Jane is the household's primary contact — drives the "Primary contact" note
-- and the related-children recognition line.
INSERT INTO public.customer_persons (org_id, customer_id, person_id, role_type, is_primary)
SELECT org_id, :'SMITH_HH'::uuid, :'JANE_PERSON'::uuid, 'parent_guardian', true FROM _ctx
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Children — durable child profile truth
--   Joe + Emma  → Smith Household   (siblings, DIFFERENT schedules)
--   Joe (2nd)   → Rivers Household  (duplicate name, accessible)
--   Joe (3rd)   → Lakeside          (duplicate name, RESTRICTED away)
-- -----------------------------------------------------------------------------
INSERT INTO public.customer_members
    (id, org_id, customer_id, person_id, display_name, first_name, last_name, relationship, dob)
SELECT :'JOE_MEMBER'::uuid,  org_id, :'SMITH_HH'::uuid,    :'JOE_PERSON'::uuid,  'Joe Smith',  'Joe',  'Smith', 'child', '2021-04-12'::date FROM _ctx
UNION ALL SELECT :'EMMA_MEMBER'::uuid, org_id, :'SMITH_HH'::uuid,    :'EMMA_PERSON'::uuid, 'Emma Smith', 'Emma', 'Smith', 'child', '2019-09-03'::date FROM _ctx
UNION ALL SELECT :'JOE2_MEMBER'::uuid, org_id, :'RIVERS_HH'::uuid,   :'JOE2_PERSON'::uuid, 'Joe Smith',  'Joe',  'Smith', 'child', '2020-02-20'::date FROM _ctx
UNION ALL SELECT :'JOE3_MEMBER'::uuid, org_id, :'LAKESIDE_HH'::uuid, NULL,                 'Joe Smith',  'Joe',  'Smith', 'child', '2020-07-07'::date FROM _ctx
ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        customer_id  = EXCLUDED.customer_id,
        person_id    = EXCLUDED.person_id,
        relationship = EXCLUDED.relationship;

-- -----------------------------------------------------------------------------
-- Opportunities — the CONTEXT each process instance runs in, and the surface a
-- child without a person row opens. Riverside vs Lakeside is what the restricted
-- operator's site scope discriminates on.
--
-- These must be OPERATIONALLY REAL, not just present. A Focus Panel composes for a
-- subject only when that subject is on the active Work View's evaluated page, and
-- three fields decide that:
--
--   work_unit_id — which unit's queues evaluate this record at all
--   status_key   — queue-lane membership is by `case_status`; the lanes accept
--                  `new_inquiry` / `open` / `new`, so the previous `active` put
--                  these households in NO lane
--   stage_key    — must be an ACTIVE CONFIGURED FAMILY-TRACK stage whose operating
--                  plan carries a primary work template with a `primary_action`,
--                  or the answer refuses with `no_truthful_primary_action` rather
--                  than claiming operational on identity alone
--
-- `lead` is the stage used because it is the only family-track stage in this
-- tenant's published process that offers a reachable primary action: `tour` and
-- `decision` are `outcome_led` templates with no `primary_action.action_ref`, so a
-- household parked there composes nothing. That is a property of the published
-- configuration, not of these fixtures — the verification below asserts it rather
-- than assuming it, so a configuration change fails here instead of surfacing as
-- an unexplained empty panel during certification.
-- -----------------------------------------------------------------------------
INSERT INTO public.opportunities (id, org_id, customer_id, location_id, name, title, status_key, stage_key, work_unit_id)
SELECT :'SMITH_OPP'::uuid,    org_id, :'SMITH_HH'::uuid,    site_a, 'Smith Household',            'Smith Household',            'open', 'lead', host_work_unit FROM _ctx
UNION ALL SELECT :'RIVERS_OPP'::uuid,   org_id, :'RIVERS_HH'::uuid,   site_a, 'Rivers Household',           'Rivers Household',           'open', 'lead', host_work_unit FROM _ctx
UNION ALL SELECT :'LAKESIDE_OPP'::uuid, org_id, :'LAKESIDE_HH'::uuid, site_b, 'Smith Household (Lakeside)', 'Smith Household (Lakeside)', 'open', 'lead', host_work_unit FROM _ctx
ON CONFLICT (id) DO UPDATE
    SET customer_id  = EXCLUDED.customer_id,
        location_id  = EXCLUDED.location_id,
        name         = EXCLUDED.name,
        title        = EXCLUDED.title,
        status_key   = EXCLUDED.status_key,
        stage_key    = EXCLUDED.stage_key,
        work_unit_id = EXCLUDED.work_unit_id;

-- -----------------------------------------------------------------------------
-- B. Multi-process participation — THREE configured processes for Joe.
--
-- process_key values must match the department's published lifecycle_builder_v1
-- (02-search-process-configuration.sql). Search resolves the LABEL from that
-- configuration; nothing here names a process in operator-facing text.
-- -----------------------------------------------------------------------------
INSERT INTO public.process_instances
    (org_id, process_key, subject_type, subject_id, context_type, context_id, stage_key, state, metadata)
SELECT org_id, 'enrollment',          'child', :'JOE_MEMBER'::uuid,  'opportunity', :'SMITH_OPP'::uuid,
       'enrolling', 'enrolling', jsonb_build_object('location_id', site_a) FROM _ctx
UNION ALL SELECT org_id, 'annual_registration', 'child', :'JOE_MEMBER'::uuid,  'opportunity', :'SMITH_OPP'::uuid,
       'needs_documents', NULL, jsonb_build_object('location_id', site_a) FROM _ctx
UNION ALL SELECT org_id, 'subsidy_renewal',     'child', :'JOE_MEMBER'::uuid,  'opportunity', :'SMITH_OPP'::uuid,
       'review_due', NULL, jsonb_build_object('location_id', site_a) FROM _ctx
-- Emma participates in ONE process, so the sibling comparison is not symmetric.
UNION ALL SELECT org_id, 'enrollment',          'child', :'EMMA_MEMBER'::uuid, 'opportunity', :'SMITH_OPP'::uuid,
       'enrolled', 'enrolled', jsonb_build_object('location_id', site_a) FROM _ctx
UNION ALL SELECT org_id, 'enrollment',          'child', :'JOE2_MEMBER'::uuid, 'opportunity', :'RIVERS_OPP'::uuid,
       'enrolling', 'enrolling', jsonb_build_object('location_id', site_a) FROM _ctx
UNION ALL SELECT org_id, 'enrollment',          'child', :'JOE3_MEMBER'::uuid, 'opportunity', :'LAKESIDE_OPP'::uuid,
       'enrolling', 'enrolling', jsonb_build_object('location_id', site_b) FROM _ctx
ON CONFLICT (org_id, process_key, subject_id, context_id) DO UPDATE
    SET stage_key = EXCLUDED.stage_key,
        state     = EXCLUDED.state,
        metadata  = EXCLUDED.metadata;

-- -----------------------------------------------------------------------------
-- A. Schedules — CHILD grain. `schedule_patterns.label` is the configured
-- display value; Search formats nothing itself.
-- -----------------------------------------------------------------------------
INSERT INTO public.schedule_patterns
    (id, org_id, site_location_id, key, label, schedule_type_key, weekdays, sort_order, is_active)
SELECT :'PATTERN_MWF'::uuid, org_id, site_a, 'mwf', 'Mon / Wed / Fri', 'part_time', ARRAY[1,3,5]::smallint[], 10, true FROM _ctx
UNION ALL SELECT :'PATTERN_TT'::uuid,  org_id, site_a, 'tt',  'Tue / Thu',       'part_time', ARRAY[2,4]::smallint[],   20, true FROM _ctx
ON CONFLICT (id) DO UPDATE
    SET label = EXCLUDED.label, weekdays = EXCLUDED.weekdays, is_active = true;

INSERT INTO public.child_enrollment_agreements
    (id, org_id, opportunity_id, customer_member_id, customer_id, person_id, site_location_id, status, start_date, source_key)
SELECT :'AGREEMENT_JOE'::uuid, org_id, :'SMITH_OPP'::uuid, :'JOE_MEMBER'::uuid,  :'SMITH_HH'::uuid, :'JOE_PERSON'::uuid,  site_a, 'active', DATE '2026-01-05', 'certification' FROM _ctx
UNION ALL SELECT :'AGREEMENT_EMM'::uuid, org_id, :'SMITH_OPP'::uuid, :'EMMA_MEMBER'::uuid, :'SMITH_HH'::uuid, :'EMMA_PERSON'::uuid, site_a, 'active', DATE '2026-01-05', 'certification' FROM _ctx
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, start_date = EXCLUDED.start_date;

INSERT INTO public.schedule_assignments
    (org_id, enrollment_agreement_id, schedule_pattern_id, customer_member_id, start_date, status, assignment_kind, source_key)
SELECT org_id, :'AGREEMENT_JOE'::uuid, :'PATTERN_MWF'::uuid, :'JOE_MEMBER'::uuid,  DATE '2026-01-05', 'active', 'base', 'certification' FROM _ctx
UNION ALL SELECT org_id, :'AGREEMENT_EMM'::uuid, :'PATTERN_TT'::uuid,  :'EMMA_MEMBER'::uuid, DATE '2026-01-05', 'active', 'base', 'certification' FROM _ctx
ON CONFLICT DO NOTHING;

DROP TABLE _ctx;

-- =============================================================================
-- Verification — fails loudly if a scenario is not actually provable.
-- =============================================================================
DO $$
DECLARE
    v_org uuid;
    v_processes int;
    v_schedules int;
    v_dupes int;
    v_hostable int;
BEGIN
    SELECT id INTO v_org FROM public.orgs WHERE slug = 'northwind-early-learning';

    SELECT count(*) INTO v_processes FROM public.process_instances
     WHERE org_id = v_org AND subject_id = '00000000-0000-4000-8000-000050000020'::uuid;
    IF v_processes < 3 THEN
        RAISE EXCEPTION 'multi-process fixture incomplete: Joe has % process instances, need 3', v_processes;
    END IF;

    SELECT count(DISTINCT sa.customer_member_id) INTO v_schedules
      FROM public.schedule_assignments sa
     WHERE sa.org_id = v_org AND sa.status = 'active'
       AND sa.customer_member_id IN ('00000000-0000-4000-8000-000050000020'::uuid,
                                     '00000000-0000-4000-8000-000050000021'::uuid);
    IF v_schedules < 2 THEN
        RAISE EXCEPTION 'sibling schedule fixture incomplete: % children with active schedules, need 2', v_schedules;
    END IF;

    SELECT count(*) INTO v_dupes FROM public.customer_members
     WHERE org_id = v_org AND display_name = 'Joe Smith';
    IF v_dupes < 3 THEN
        RAISE EXCEPTION 'duplicate-name fixture incomplete: % children named Joe Smith, need 3', v_dupes;
    END IF;

    -- POSITIVE CONTROL for the Focus Panel destination. Everything above proves the
    -- records EXIST; none of it proves an operator can be taken to one. A household
    -- that belongs to no work unit, carries a status no queue lane accepts, or holds
    -- a stage with no operating plan is invisible to every Work View — Search then
    -- resolves a destination the surface answers `subject_unavailable`, and the
    -- scenario fails as an empty panel rather than as a broken fixture.
    SELECT count(*) INTO v_hostable
      FROM public.opportunities o
      JOIN public.work_units wu ON wu.id = o.work_unit_id AND wu.org_id = o.org_id
      JOIN public.departments d ON d.id = wu.department_id
     WHERE o.org_id = v_org
       AND o.id IN ('00000000-0000-4000-8000-000050000030'::uuid,
                    '00000000-0000-4000-8000-000050000031'::uuid,
                    '00000000-0000-4000-8000-000050000032'::uuid)
       AND o.status_key IN ('new_inquiry', 'open', 'new')
       AND EXISTS (
           SELECT 1
             FROM jsonb_array_elements(
                      coalesce(d.metadata -> 'lifecycle_builder_v1' -> 'processes', '[]'::jsonb)) p,
                  jsonb_array_elements(coalesce(p -> 'stages', '[]'::jsonb)) s
            WHERE (p ->> 'is_active')::boolean IS TRUE
              AND (s ->> 'is_active')::boolean IS TRUE
              AND s ->> 'key' = o.stage_key
              -- Not merely "has an operating plan": the answer refuses unless a work
              -- template on that plan carries `primary_action.action_ref`.
              AND EXISTS (
                  SELECT 1
                    FROM jsonb_array_elements(
                             coalesce(s -> 'stage_operating_plan_v1' -> 'work_templates', '[]'::jsonb)) t
                   WHERE nullif(btrim(coalesce(t -> 'primary_action' ->> 'action_ref', '')), '') IS NOT NULL));

    IF v_hostable < 3 THEN
        RAISE EXCEPTION
            'certification households are not operationally hostable: % of 3 have a work unit, a queue-eligible status, and a configured stage with an operating plan — no Focus Panel can compose for the rest',
            v_hostable;
    END IF;

    RAISE NOTICE 'Search certification fixtures verified: 3 processes, 2 sibling schedules, % same-named children, % hostable households',
        v_dupes, v_hostable;
END $$;
