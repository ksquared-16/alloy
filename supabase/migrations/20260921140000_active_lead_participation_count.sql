-- P0-7.6 — ONE CANONICAL COUNT FOR ACTIVE LEAD PARTICIPATIONS
--
-- ── WHY THIS EXISTS ──
--
-- The Work Unit header's lead number is answered today by materialising the whole enrollment
-- participant projection and counting it in JavaScript: work unit -> department work units ->
-- department-wide opportunities -> opportunity_customer_members -> process_instances ->
-- customer_members/locations -> stitch -> count. Five to six SEQUENTIAL round trips, every row
-- pulled into application memory, to produce one integer. Measured on deployed staging it is
-- ~838ms — about 80% of all metric work behind that header, and the reason the document's KPI seed
-- cannot land before its join.
--
-- The header needs ONE number. This is that number, and nothing else.
--
-- ── THIS IS NOT A NEW DEFINITION ──
--
-- The predicate below is the one the existing implementation already computes, transcribed rather
-- than reinterpreted. Its equivalence to `countActiveLeadParticipants` over
-- `enrollmentProjection.load` was proven before this migration was written:
--
--   · all seven real staging work units in the department (oracle 20, candidate 20, on each);
--   · the department expansion, which discriminates — without it six of the seven answer 0;
--   · an INACTIVE customer_member discriminator, plus its active control, on the isolated
--     certification stack (staging holds no inactive members to test with);
--   · every individual site scope, their union, and the proof that no site scope exceeds org-wide;
--   · over a population containing 33 members with multiple enrollment PIs, 277 NULL states,
--     4 closed PIs, 2 multi-OCM opportunities and 315 dangling-context rows.
--
-- The existing projection REMAINS the certification oracle. It simply stops running to answer this
-- one count.
--
-- ── THE GRAIN, WHICH IS THE EASIEST THING TO GET WRONG ──
--
-- The count is of PARTICIPATIONS — process_instances rows — not opportunities, not distinct
-- customer members, not distinct people. Participants are built only from PI rows, so a legacy lead
-- with no process_instance contributes ZERO, and a member holding several qualifying enrollment
-- participations contributes one per participation. A COUNT(DISTINCT subject_id) here would be a
-- different metric wearing the same name; 33 members in the staging population would expose it.
--
-- ── SECURITY INVOKER, DELIBERATELY ──
--
-- This function grants nothing. It filters by the org it is given and nothing wider, and the caller
-- still performs the analytics-read check, the org/resource scope resolution and the site-access
-- assertion it performs today. SECURITY DEFINER would turn a count into a privilege, and there is
-- no reason for one: the existing caller already reaches these tables with the same authority.
-- Authorization stays request-time and is never persisted or inferred here.

CREATE OR REPLACE FUNCTION public.count_active_lead_participations(
    p_org_id uuid,
    /** NULL = org scope. A work unit expands to its DEPARTMENT footprint — see below. */
    p_work_unit_id uuid DEFAULT NULL,
    /** NULL = no location narrowing. Never widens; only ever intersects. */
    p_location_ids uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT count(*)::integer
      FROM public.process_instances pi
      JOIN public.customer_members cm
        ON cm.id = pi.subject_id
       AND cm.org_id = pi.org_id
      /*
       * THE CONTEXT ANCHOR, BOTH WAYS.
       *
       * pi.context_id is EITHER an opportunity id OR an opportunity_customer_members id: Enrollment
       * journeys began anchoring to the child's participation, and resolving only one anchor makes
       * the other vanish silently — a shorter list, never an error. In the staging population 19
       * rows anchor to an opportunity and 4 to a participation. This COALESCE is the whole reason a
       * PostgREST decomposition was rejected: it would have re-expressed this in client code.
       */
      JOIN public.opportunities o
        ON o.org_id = pi.org_id
       AND o.id = COALESCE(
             (SELECT m.opportunity_id
                FROM public.opportunity_customer_members m
               WHERE m.id = pi.context_id AND m.org_id = pi.org_id),
             pi.context_id)
     WHERE pi.org_id = p_org_id
       AND pi.process_key = 'enrollment'
       AND pi.subject_type = 'child'
       -- isOpenInstance
       AND pi.close_reason_key IS NULL
       -- attributes.subjectActive !== false  (NULL is not false)
       AND COALESCE(cm.is_active, true) IS NOT FALSE
       -- CLOSED_CONTEXT_STATUS_KEYS
       AND COALESCE(lower(btrim(o.status_key)), '') NOT IN ('closed', 'lost', 'archived', 'inactive')
       -- TERMINAL_ENROLLMENT_STATES; a NULL state COUNTS (277 such rows on staging)
       AND COALESCE(lower(btrim(pi.state)), '') NOT IN ('enrolled', 'withdrawn', 'not_enrolling')
       /*
        * DEPARTMENT EXPANSION, NOT THE REQUESTED WORK UNIT.
        *
        * After Move to Waitlist a family often stays parked on the Lead work unit while the child's
        * participation is waitlist. Narrowing to a single work_unit_id is the "park defect" the
        * projection warns about, and it is measurable: without this expansion six of the seven
        * staging work units answer 0 instead of 20.
        */
       AND (
            p_work_unit_id IS NULL
            OR o.work_unit_id IN (
                SELECT w2.id
                  FROM public.work_units w2
                 WHERE w2.org_id = p_org_id
                   AND w2.department_id = (
                        SELECT w1.department_id FROM public.work_units w1 WHERE w1.id = p_work_unit_id)
            )
       )
       /*
        * PARTICIPANT-GRAIN LOCATION: the subject's own participation location when it has one,
        * otherwise the context's — the same coalesce order the projection's participant attributes
        * use. Narrowing only; a scope can never admit a row org-wide scope would exclude.
        */
       AND (
            p_location_ids IS NULL
            OR COALESCE(
                 (SELECT m.location_id
                    FROM public.opportunity_customer_members m
                   WHERE m.opportunity_id = o.id
                     AND m.customer_member_id = pi.subject_id
                     AND m.org_id = pi.org_id
                   LIMIT 1),
                 o.location_id) = ANY (p_location_ids)
       )
$$;

COMMENT ON FUNCTION public.count_active_lead_participations(uuid, uuid, uuid[]) IS
    'P0-7.6. Canonical count of ACTIVE LEAD PARTICIPATIONS (process_instances grain, never '
    'opportunity or distinct-member). Replaces a 5-6 read materialized participant projection on '
    'the Work Unit header metric path. Equivalence to countActiveLeadParticipants is proven by '
    'tests/runtime/leadCountOracleEquivalence.live.test.ts; that projection remains the oracle. '
    'SECURITY INVOKER: grants nothing, and the caller keeps its request-time authorization.';

-- ── SELF-TEST ──
--
-- Every fixture below exists only inside this block: it ends by raising SELFTEST_CLEANUP so the
-- whole thing rolls back, leaving no durable specimen. Each case is one of the axes the equivalence
-- work identified, asserted against an exact expected count rather than a relative change.
DO $selftest$
DECLARE
    v_org   uuid;
    v_dept  uuid;
    v_wu_a  uuid;
    v_wu_b  uuid;
    v_cust  uuid;
    v_cm    uuid;
    v_cm2   uuid;
    v_loc_a uuid;
    v_loc_b uuid;
    v_opp_a uuid;
    v_opp_b uuid;
    v_opp_closed uuid;
    v_ocm   uuid;
    n       integer;
BEGIN
    INSERT INTO public.orgs (name, slug) VALUES ('__selftest_lead__', '__selftest_' || gen_random_uuid())
        RETURNING id INTO v_org;
    INSERT INTO public.departments (org_id, key, name) VALUES (v_org, 'selftest_dept', 'Selftest Dept') RETURNING id INTO v_dept;
    INSERT INTO public.work_units (org_id, department_id, key, name)
        VALUES (v_org, v_dept, 'wu_a', 'WU A') RETURNING id INTO v_wu_a;
    INSERT INTO public.work_units (org_id, department_id, key, name)
        VALUES (v_org, v_dept, 'wu_b', 'WU B') RETURNING id INTO v_wu_b;
    INSERT INTO public.locations (org_id, label) VALUES (v_org, 'Site A') RETURNING id INTO v_loc_a;
    INSERT INTO public.locations (org_id, label) VALUES (v_org, 'Site B') RETURNING id INTO v_loc_b;
    INSERT INTO public.customers (org_id, name) VALUES (v_org, 'Selftest Family') RETURNING id INTO v_cust;
    INSERT INTO public.customer_members (org_id, customer_id, display_name)
        VALUES (v_org, v_cust, 'Child One') RETURNING id INTO v_cm;
    INSERT INTO public.customer_members (org_id, customer_id, display_name)
        VALUES (v_org, v_cust, 'Child Two') RETURNING id INTO v_cm2;

    -- Opportunity A sits on WU A at site A; opportunity B on WU B at site B — same department.
    INSERT INTO public.opportunities (org_id, stage_key, work_unit_id, location_id)
        VALUES (v_org, 'lead', v_wu_a, v_loc_a) RETURNING id INTO v_opp_a;
    INSERT INTO public.opportunities (org_id, stage_key, work_unit_id, location_id)
        VALUES (v_org, 'lead', v_wu_b, v_loc_b) RETURNING id INTO v_opp_b;
    INSERT INTO public.opportunities (org_id, stage_key, work_unit_id, location_id, status_key)
        VALUES (v_org, 'lead', v_wu_a, v_loc_a, 'closed') RETURNING id INTO v_opp_closed;

    -- 0 · NO PARTICIPATIONS YET. A legacy lead with no process_instance contributes ZERO.
    SELECT public.count_active_lead_participations(v_org, v_wu_a) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'SELFTEST: legacy lead with no PI counted (%)', n; END IF;

    -- 1 · ONE QUALIFYING PARTICIPATION, opportunity-anchored, NULL state — counts.
    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, context_id, stage_key)
        VALUES (v_org, 'enrollment', 'child', v_cm, v_opp_a, 'lead');
    SELECT public.count_active_lead_participations(v_org, v_wu_a) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'SELFTEST: NULL-state qualifying participation did not count (%)', n; END IF;

    -- 2 · DEPARTMENT EXPANSION. A participation on the sibling work unit counts from either unit.
    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, context_id, stage_key)
        VALUES (v_org, 'enrollment', 'child', v_cm2, v_opp_b, 'lead');
    SELECT public.count_active_lead_participations(v_org, v_wu_a) INTO n;
    IF n <> 2 THEN RAISE EXCEPTION 'SELFTEST: department expansion did not include the sibling work unit (%)', n; END IF;
    SELECT public.count_active_lead_participations(v_org, v_wu_b) INTO n;
    IF n <> 2 THEN RAISE EXCEPTION 'SELFTEST: expansion is not symmetric across the department (%)', n; END IF;

    /*
     * 3 · NO DEDUPE. A second qualifying participation for the SAME member counts again.
     *
     * It must hang off a DIFFERENT context: ux_process_instances_scope is unique on
     * (org_id, process_key, subject_id, context_id), so a member cannot hold two enrollment
     * participations on one opportunity. That constraint is also why the 33 staging members with
     * multiple enrollment PIs necessarily span several opportunities.
     */
    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, context_id, stage_key)
        VALUES (v_org, 'enrollment', 'child', v_cm, v_opp_b, 'lead');
    SELECT public.count_active_lead_participations(v_org, v_wu_a) INTO n;
    IF n <> 3 THEN RAISE EXCEPTION 'SELFTEST: multiple qualifying PIs for one member were deduped (%)', n; END IF;

    -- 4 · TERMINAL STATE is excluded; 5 · a CLOSED instance is excluded.
    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, context_id, stage_key, state)
        VALUES (v_org, 'enrollment', 'child', v_cm2, v_opp_a, 'lead', 'enrolled');
    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, context_id, stage_key, close_reason_key)
        VALUES (v_org, 'enrollment', 'child', v_cm2, v_opp_closed, 'lead', 'withdrew');
    SELECT public.count_active_lead_participations(v_org, v_wu_a) INTO n;
    IF n <> 3 THEN RAISE EXCEPTION 'SELFTEST: terminal state or closed instance was counted (%)', n; END IF;

    -- 6 · CLOSED CONTEXT. A participation whose opportunity is closed does not count.
    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, context_id, stage_key)
        VALUES (v_org, 'enrollment', 'child', v_cm, v_opp_closed, 'lead');
    SELECT public.count_active_lead_participations(v_org, v_wu_a) INTO n;
    IF n <> 3 THEN RAISE EXCEPTION 'SELFTEST: a closed-context participation was counted (%)', n; END IF;

    -- 7 · OCM CONTEXT ANCHOR. A participation anchored to the participation row resolves too.
    INSERT INTO public.opportunity_customer_members (org_id, opportunity_id, customer_member_id, location_id)
        VALUES (v_org, v_opp_a, v_cm, v_loc_a) RETURNING id INTO v_ocm;
    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, context_id, stage_key)
        VALUES (v_org, 'enrollment', 'child', v_cm, v_ocm, 'lead');
    SELECT public.count_active_lead_participations(v_org, v_wu_a) INTO n;
    IF n <> 4 THEN RAISE EXCEPTION 'SELFTEST: an OCM-anchored participation was not resolved (%)', n; END IF;

    -- 8 · DANGLING CONTEXT. Neither an opportunity nor a participation: dropped, as the oracle drops it.
    INSERT INTO public.process_instances (org_id, process_key, subject_type, subject_id, context_id, stage_key)
        VALUES (v_org, 'enrollment', 'child', v_cm, gen_random_uuid(), 'lead');
    SELECT public.count_active_lead_participations(v_org, v_wu_a) INTO n;
    IF n <> 4 THEN RAISE EXCEPTION 'SELFTEST: a dangling-context participation was counted (%)', n; END IF;

    -- 9 · INACTIVE MEMBER. Every participation whose subject is inactive drops out.
    UPDATE public.customer_members SET is_active = false WHERE id = v_cm;
    SELECT public.count_active_lead_participations(v_org, v_wu_a) INTO n;
    IF n <> 1 THEN RAISE EXCEPTION 'SELFTEST: inactive member participations were counted (%)', n; END IF;
    UPDATE public.customer_members SET is_active = true WHERE id = v_cm;
    SELECT public.count_active_lead_participations(v_org, v_wu_a) INTO n;
    IF n <> 4 THEN RAISE EXCEPTION 'SELFTEST: restoring the member did not restore the count (%)', n; END IF;

    /*
     * 10 · SITE SCOPE narrows and never widens.
     *
     * Participant grain: the OCM row's location when the subject has one on that opportunity,
     * else the opportunity's. Only (opp_a, v_cm) has an OCM row, so the two participations
     * resolving through opportunity A sit at site A and the two on opportunity B at site B.
     */
    SELECT public.count_active_lead_participations(v_org, v_wu_a, ARRAY[v_loc_a]) INTO n;
    IF n <> 2 THEN RAISE EXCEPTION 'SELFTEST: site A scope is wrong (%)', n; END IF;
    SELECT public.count_active_lead_participations(v_org, v_wu_a, ARRAY[v_loc_b]) INTO n;
    IF n <> 2 THEN RAISE EXCEPTION 'SELFTEST: site B scope is wrong (%)', n; END IF;
    SELECT public.count_active_lead_participations(v_org, v_wu_a, ARRAY[v_loc_a, v_loc_b]) INTO n;
    IF n <> 4 THEN RAISE EXCEPTION 'SELFTEST: the site union is not the whole scope (%)', n; END IF;

    -- 11 · ORG SCOPE. A null work unit spans the org, never less than the department.
    SELECT public.count_active_lead_participations(v_org, NULL) INTO n;
    IF n < 4 THEN RAISE EXCEPTION 'SELFTEST: org scope is narrower than the department (%)', n; END IF;

    -- 12 · TENANCY. Another org sees none of this.
    SELECT public.count_active_lead_participations(gen_random_uuid(), NULL) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'SELFTEST: a foreign org saw these participations (%)', n; END IF;

    RAISE EXCEPTION 'SELFTEST_CLEANUP';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'SELFTEST_CLEANUP' THEN RAISE; END IF;
END
$selftest$;
