-- =============================================================================
-- Child-grain Work Views — the cohorts a CHILD can actually belong to.
--
-- WHY THIS FIXTURE EXISTS
--
-- The certification tenant publishes four Work Views and every one of them is
-- `row_grain_v1: family` with no predicates. That is a coherent configuration, but it
-- means no child in this tenant belongs to ANY Work View: a family lens rows at the
-- case, so the row is the household and not the child. Search is therefore right to
-- offer a child nothing — and the child half of the destination contract cannot be
-- exercised at all.
--
-- So this authors CONFIGURATION ONLY, and only the kind the platform already supports:
-- three child-grain lenses over stages the tenant already publishes as `grain: child`.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
-- It does not touch any stage's `primary_action`. Changing that would alter what the
-- Business Process asserts an operator can do, to make a test pass — and publication is
-- a one-way door. The child stages here configure no primary action, which is exactly
-- the live Firefly shape, and the child path is designed to stay enterable there.
--
-- THE COHORTS, AND WHY THESE THREE
--
--   waitlist_children   stage-scoped   [waitlist]              a single truthful membership
--   all_children        stage-independent child inventory      OVERLAPS every live child
--   priority_children   stage-scoped   [waitlist, enrolling]   OVERLAPS the first two
--
-- A child at `waitlist` therefore belongs to all THREE; a child at `enrolling` belongs
-- to two, and NOT to `waitlist_children`. That is the sibling-independence proof: one
-- household, one case, two children, two different membership sets — with no stage
-- semantics changed to arrange it.
--
-- `all_children` carries no `filters_v1` on purpose. A filterless lens is a process-wide
-- catch-all whose grain cannot be derived from stages, so it MUST declare
-- `row_grain_v1: child` or law G-1 refuses it as grain-ambiguous. That declaration is
-- the whole reason a child inventory lens is expressible.
--
-- Publication is not idempotent by call but IS by checksum, so this may run on every pass.
-- =============================================================================

DO $publish$
DECLARE
    v_org      uuid;
    v_dept     uuid;
    v_actor    uuid;
    v_draft    uuid;
    v_rev      uuid;
    v_res      jsonb;
    v_meta     jsonb;
    v_payload  jsonb;
    v_views    jsonb;
    v_new      jsonb;
    v_checksum text := 'search-cert-child-grain-work-views-v1';
BEGIN
    SELECT id INTO v_org FROM public.orgs WHERE slug = 'northwind-early-learning';
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Refusing to run outside the disposable certification tenant.';
    END IF;

    SELECT d.id, d.metadata -> 'lifecycle_builder_v1'
      INTO v_dept, v_meta
      FROM public.departments d
     WHERE d.org_id = v_org
       AND d.is_active IS TRUE
       AND d.metadata -> 'lifecycle_builder_v1' IS NOT NULL
     ORDER BY d.created_at
     LIMIT 1;

    IF v_dept IS NULL THEN
        RAISE EXCEPTION 'No published Business Process to extend — run 02 first.';
    END IF;

    SELECT user_id INTO v_actor FROM public.user_roles
     WHERE org_id = v_org ORDER BY role LIMIT 1;

    -- Law 4: the draft opens against the CURRENT publication or the RPC refuses it as stale.
    SELECT cp.revision_id INTO v_rev
      FROM public.configuration_publications cp
     WHERE cp.org_id = v_org AND cp.domain_key = 'business_process' AND cp.subject_id = v_dept
     ORDER BY cp.revision_number DESC
     LIMIT 1;

    -- The three child cohorts, appended to whatever the tenant already publishes. Built
    -- from the LIVE payload rather than a copied literal, so this never silently reverts
    -- configuration authored elsewhere — the failure mode that wiped `row_grain_v1` before.
    v_new := $views$[
      {
        "id": "waitlist_children",
        "label": "Waitlist Children",
        "mission": "Every child holding a place, in the order they will be offered one.",
        "row_grain_v1": "child",
        "filters_v1": [{"field_key": "opportunity_stage", "operator": "is_any_of", "value": ["waitlist"]}],
        "display_order": 5,
        "visible_in_runtime": true
      },
      {
        "id": "all_children",
        "label": "All Children",
        "mission": "Every live child participation, whatever stage it sits at.",
        "row_grain_v1": "child",
        "display_order": 6,
        "visible_in_runtime": true
      },
      {
        "id": "priority_children",
        "label": "Priority Children",
        "mission": "Children at a stage that needs a decision this week.",
        "row_grain_v1": "child",
        "filters_v1": [{"field_key": "opportunity_stage", "operator": "is_any_of", "value": ["waitlist", "enrolling"]}],
        "display_order": 7,
        "visible_in_runtime": true
      }
    ]$views$::jsonb;

    -- Replace by id, then append the ones that were absent: re-running must not duplicate.
    SELECT jsonb_agg(p ORDER BY ord)
      INTO v_payload
      FROM (
        SELECT
            CASE WHEN p ->> 'id' = v_meta ->> 'active_process_id'
                 THEN jsonb_set(
                        p,
                        '{work_views_v1}',
                        (
                            SELECT coalesce(jsonb_agg(v), '[]'::jsonb)
                              FROM (
                                SELECT v FROM jsonb_array_elements(coalesce(p -> 'work_views_v1', '[]'::jsonb)) v
                                 WHERE NOT (v ->> 'id' IN (SELECT n ->> 'id' FROM jsonb_array_elements(v_new) n))
                                UNION ALL
                                SELECT n FROM jsonb_array_elements(v_new) n
                              ) merged
                        )
                      )
                 ELSE p
            END AS p,
            ord
          FROM jsonb_array_elements(v_meta -> 'processes') WITH ORDINALITY AS t(p, ord)
      ) rebuilt;

    v_payload := jsonb_set(v_meta, '{processes}', v_payload);

    SELECT id INTO v_draft FROM public.business_process_drafts
     WHERE org_id = v_org AND department_id = v_dept LIMIT 1;

    IF v_draft IS NULL THEN
        INSERT INTO public.business_process_drafts
            (org_id, department_id, payload, draft_status, base_revision_id, validated_at, validation_errors)
        VALUES (v_org, v_dept, v_payload, 'validated', v_rev, now(), '[]'::jsonb)
        RETURNING id INTO v_draft;
    ELSE
        -- `guard_business_process_draft_revision`: any change must advance `draft_revision`
        -- in the SAME statement.
        UPDATE public.business_process_drafts
           SET payload           = v_payload,
               base_revision_id  = v_rev,
               draft_status      = 'validated',
               validated_at      = now(),
               validation_errors = '[]'::jsonb,
               draft_revision    = draft_revision + 1
         WHERE id = v_draft;
    END IF;

    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, v_checksum);
    RAISE NOTICE 'Published child-grain Work Views: revision %, department %.',
        v_res ->> 'revision_number', v_dept;
END $publish$;

-- =============================================================================
-- Verification — POSITIVE CONTROLS.
--
-- "The rows I wrote are there" is not proof of anything. What has to hold is that a real
-- child in this tenant now EVALUATES INTO more than one of these cohorts, and that the
-- family lenses did not quietly become child destinations.
-- =============================================================================
DO $verify$
DECLARE
    v_org       uuid;
    v_meta      jsonb;
    v_active    jsonb;
    v_child     integer;
    v_family    integer;
    v_waitlist  integer;
    v_overlap   integer;
BEGIN
    SELECT id INTO v_org FROM public.orgs WHERE slug = 'northwind-early-learning';

    SELECT d.metadata -> 'lifecycle_builder_v1' INTO v_meta
      FROM public.departments d
     WHERE d.org_id = v_org AND d.metadata -> 'lifecycle_builder_v1' IS NOT NULL
     ORDER BY d.created_at LIMIT 1;

    SELECT p INTO v_active
      FROM jsonb_array_elements(v_meta -> 'processes') p
     WHERE p ->> 'id' = v_meta ->> 'active_process_id';

    SELECT count(*) INTO v_child
      FROM jsonb_array_elements(coalesce(v_active -> 'work_views_v1', '[]'::jsonb)) v
     WHERE v ->> 'row_grain_v1' = 'child'
       AND coalesce((v ->> 'visible_in_runtime')::boolean, true) IS TRUE;

    IF v_child < 3 THEN
        RAISE EXCEPTION 'expected 3 visible child-grain Work Views, found % — the child destination contract cannot be exercised', v_child;
    END IF;

    -- The family lenses must SURVIVE. This fixture extends configuration; it does not
    -- replace it, and a household must keep its own cohorts.
    SELECT count(*) INTO v_family
      FROM jsonb_array_elements(coalesce(v_active -> 'work_views_v1', '[]'::jsonb)) v
     WHERE v ->> 'row_grain_v1' = 'family';

    IF v_family = 0 THEN
        RAISE EXCEPTION 'the family-grain Work Views were lost — this fixture must EXTEND configuration, never replace it';
    END IF;

    -- A real child, actually at `waitlist`. Without one, all of the above is a
    -- configuration statement about nobody.
    SELECT count(*) INTO v_waitlist
      FROM public.process_instances pi
     WHERE pi.org_id = v_org
       AND pi.stage_key = 'waitlist';

    IF v_waitlist = 0 THEN
        RAISE EXCEPTION 'no participation sits at stage "waitlist" — the overlap fixture would prove nothing';
    END IF;

    -- OVERLAP, stated as the evaluator will see it: a child at `waitlist` is inside
    -- `waitlist_children` (stage-scoped), `priority_children` (stage-scoped, wider) and
    -- `all_children` (stage-independent). Three cohorts, one child, no stage changed.
    SELECT count(*) INTO v_overlap
      FROM jsonb_array_elements(coalesce(v_active -> 'work_views_v1', '[]'::jsonb)) v
     WHERE v ->> 'row_grain_v1' = 'child'
       AND (
             v -> 'filters_v1' IS NULL
             OR EXISTS (
                 SELECT 1
                   FROM jsonb_array_elements(v -> 'filters_v1') f
                  WHERE f ->> 'field_key' = 'opportunity_stage'
                    AND f -> 'value' ? 'waitlist'
             )
           );

    IF v_overlap < 3 THEN
        RAISE EXCEPTION 'a waitlisted child evaluates into only % child cohort(s) — overlapping membership is not exercisable', v_overlap;
    END IF;

    RAISE NOTICE 'Verified: % child-grain views, % family-grain views preserved, % waitlist participation(s), % overlapping cohorts for a waitlisted child.',
        v_child, v_family, v_waitlist, v_overlap;
END $verify$;
