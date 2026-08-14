-- =============================================================================
-- An OVERSIZED child-grain cohort — more members than the page can show.
--
-- WHY THIS FIXTURE EXISTS
--
-- `PROVISIONING_ROW_PAGE_CAP = 100`. The selection guard used to resolve a named subject against the
-- published PAGE, which answers "is this record in the Work View?" with "is it in the first 100
-- rows?". Below the cap those questions agree, so no fixture smaller than 100 members can tell the
-- repair from the defect — the bug is INVISIBLE in a small tenant.
--
-- So this seeds enough live child participations that `all_children` (the stage-independent child
-- inventory lens) holds well over the cap, and a searched child can genuinely sort past it.
--
-- WHAT IT DOES NOT DO
--
-- It does not raise the cap, touch any stage's `primary_action`, or alter Business Process semantics.
-- It authors PARTICIPATION DATA only, against children and cases the tenant already ships.
--
-- Idempotent: participations are keyed on (subject, context) and re-staged rather than duplicated.
-- =============================================================================

DO $seed$
DECLARE
    v_org    uuid := '00000000-0000-4000-8000-000000000001';
    v_made   integer := 0;
    v_target integer := 80;   -- comfortably past PROVISIONING_ROW_PAGE_CAP (100)
    r        record;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = v_org AND slug = 'northwind-early-learning') THEN
        RAISE EXCEPTION 'Refusing to run outside the disposable certification tenant.';
    END IF;

    -- Children that have a household case to participate in, and no Enrollment participation yet.
    -- Ordered by id so re-runs pick the same population.
    -- THE CASE MUST NOT BE CLOSED.
    --
    -- Membership is live PARTICIPATIONS, and `isLiveEnrollmentParticipant` excludes a participation
    -- whose case is closed. An earlier revision of this fixture ignored that and seeded 140 rows, 60
    -- of which hung off closed cases — the lens published 82 members, under the cap, and the
    -- pagination scenario could prove nothing. Counting rows is not counting MEMBERS.
    FOR r IN
        SELECT cm.id AS member_id, o.id AS case_id
          FROM public.customer_members cm
          JOIN LATERAL (
                SELECT o.id
                  FROM public.opportunities o
                 WHERE o.org_id = v_org
                   AND o.customer_id = cm.customer_id
                   AND o.stage_key <> 'closed'
                 ORDER BY o.created_at
                 LIMIT 1
               ) o ON TRUE
         WHERE cm.org_id = v_org
           AND NOT EXISTS (
                 SELECT 1 FROM public.process_instances pi
                  WHERE pi.org_id = v_org
                    AND pi.process_key = 'enrollment'
                    AND pi.subject_id = cm.id
               )
         ORDER BY cm.id
         LIMIT v_target
    LOOP
        INSERT INTO public.process_instances
            (id, org_id, process_key, subject_type, subject_id, context_type, context_id,
             stage_key, state, metadata, created_at, stage_entered_at)
        VALUES
            (gen_random_uuid(), v_org, 'enrollment', 'child', r.member_id, 'opportunity', r.case_id,
             'enrolling', 'active', '{}'::jsonb, now(), now());
        v_made := v_made + 1;
    END LOOP;

    RAISE NOTICE 'Seeded % additional child participations.', v_made;
END $seed$;

-- =============================================================================
-- Verification — the cohort must actually EXCEED the cap.
--
-- A fixture that lands at 98 members would pass every assertion downstream while proving nothing,
-- because below the cap the page and the membership are the same set.
-- =============================================================================
DO $verify$
DECLARE
    v_org   uuid := '00000000-0000-4000-8000-000000000001';
    v_live  integer;
    v_cap   integer := 100;   -- PROVISIONING_ROW_PAGE_CAP, restated so drift is visible here
BEGIN
    -- Counts MEMBERS, not rows. A participation on a CLOSED case is not a member of the lens
    -- (`isLiveEnrollmentParticipant`), and counting those is how an earlier revision of this fixture
    -- reported success while the lens published only 82.
    SELECT count(*) INTO v_live
      FROM public.process_instances pi
      JOIN public.opportunities o ON o.id = pi.context_id
     WHERE pi.org_id = v_org
       AND pi.process_key = 'enrollment'
       AND pi.subject_type = 'child'
       AND pi.state = 'active'
       AND o.stage_key <> 'closed';

    IF v_live <= v_cap THEN
        RAISE EXCEPTION
            'only % LIVE child members (participations on non-closed cases) — at or below the % row cap, so the page and the membership are the SAME set and this fixture cannot distinguish the repair from the defect',
            v_live, v_cap;
    END IF;

    RAISE NOTICE 'Verified: % live child participations — % beyond the page cap.', v_live, v_live - v_cap;
END $verify$;
