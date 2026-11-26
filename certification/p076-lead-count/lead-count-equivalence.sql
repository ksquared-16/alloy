-- P0-7.6 — lead-count oracle equivalence + adversarial-shape distribution.
--
-- ORACLE (the implementation being replaced), derived from source:
--   participants are built ONLY from process_instances rows (`if (!piRows.length) return []`),
--   so the COUNT GRAIN is the participation, not the opportunity and not the customer member.
--   A legacy lead with no process_instance contributes ZERO.
--
--   isActiveLeadParticipant(p) =
--       p.process_key = 'enrollment'                          (participantMatchesProcess)
--     AND p.subject_type = 'child'                            (contract subject_type)
--     AND p.close_reason_key IS NULL                          (isOpenInstance)
--     AND subject customer_members.is_active IS NOT FALSE     (attributes.subjectActive !== false)
--     AND lower(trim(opportunity.status_key)) NOT IN
--           ('closed','lost','archived','inactive')           (CLOSED_CONTEXT_STATUS_KEYS)
--     AND lower(trim(p.state)) NOT IN
--           ('enrolled','withdrawn','not_enrolling')          (TERMINAL_ENROLLMENT_STATES; NULL counts)
--
--   Scope: a work-unit request expands to the DEPARTMENT footprint — every work unit sharing the
--   scoped unit's department — because waitlisted children whose family is parked on Lead must
--   still count. Narrowing to one work_unit_id is the "park defect" the source warns about.
--
--   Context anchor: pi.context_id is EITHER an opportunity id OR an opportunity_customer_members
--   id (the projection resolves both anchors). q3 below measures how often each occurs, because a
--   candidate query that handles only one anchor would silently undercount.
--
-- This census does NOT switch anything. It answers: does the candidate expression reproduce the
-- oracle's deployed answer (20) for the canonical specimen, and do the adversarial shapes that
-- would break a naive count actually exist in this data?
SELECT question_id, kind, payload
FROM (
    -- The candidate count, expressed over the same rows the projection loads.
    SELECT 'l1_candidate_active_leads' AS question_id, 'scalar' AS kind, count(*)::text AS payload, 1 AS ord
      FROM public.process_instances pi
      JOIN public.customer_members cm ON cm.id = pi.subject_id AND cm.org_id = pi.org_id
      JOIN public.opportunities o
        ON o.org_id = pi.org_id
       AND o.id = COALESCE(
             (SELECT m.opportunity_id FROM public.opportunity_customer_members m
               WHERE m.id = pi.context_id AND m.org_id = pi.org_id),
             pi.context_id)
     WHERE pi.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
       AND pi.process_key = 'enrollment'
       AND pi.subject_type = 'child'
       AND pi.close_reason_key IS NULL
       AND coalesce(cm.is_active, true) IS NOT FALSE
       AND coalesce(lower(btrim(o.status_key)), '') NOT IN ('closed','lost','archived','inactive')
       AND coalesce(lower(btrim(pi.state)), '') NOT IN ('enrolled','withdrawn','not_enrolling')
       AND o.work_unit_id IN (
             SELECT w2.id FROM public.work_units w2
              WHERE w2.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
                AND w2.department_id = (SELECT w1.department_id FROM public.work_units w1
                                         WHERE w1.id = '587de5bc-c43d-47b1-b1a0-0a3ee2ff2c37'))

    UNION ALL

    -- Same predicate WITHOUT the department expansion — the "park defect" a naive narrowing causes.
    SELECT 'l2_candidate_single_work_unit', 'scalar', count(*)::text, 2
      FROM public.process_instances pi
      JOIN public.customer_members cm ON cm.id = pi.subject_id AND cm.org_id = pi.org_id
      JOIN public.opportunities o
        ON o.org_id = pi.org_id
       AND o.id = COALESCE(
             (SELECT m.opportunity_id FROM public.opportunity_customer_members m
               WHERE m.id = pi.context_id AND m.org_id = pi.org_id),
             pi.context_id)
     WHERE pi.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
       AND pi.process_key = 'enrollment' AND pi.subject_type = 'child'
       AND pi.close_reason_key IS NULL
       AND coalesce(cm.is_active, true) IS NOT FALSE
       AND coalesce(lower(btrim(o.status_key)), '') NOT IN ('closed','lost','archived','inactive')
       AND coalesce(lower(btrim(pi.state)), '') NOT IN ('enrolled','withdrawn','not_enrolling')
       AND o.work_unit_id = '587de5bc-c43d-47b1-b1a0-0a3ee2ff2c37'

    UNION ALL

    -- Which anchor does context_id use? A candidate handling only one would undercount.
    SELECT 'l3_context_anchor_shape', 'row',
           concat_ws(' | ', 'anchor=' || anchor, 'n=' || n::text), 3
      FROM (
        SELECT CASE
                 WHEN EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = pi.context_id AND o.org_id = pi.org_id) THEN 'opportunity'
                 WHEN EXISTS (SELECT 1 FROM public.opportunity_customer_members m WHERE m.id = pi.context_id AND m.org_id = pi.org_id) THEN 'ocm'
                 WHEN pi.context_id IS NULL THEN 'null'
                 ELSE 'dangling' END AS anchor,
               count(*) AS n
          FROM public.process_instances pi
         WHERE pi.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
           AND pi.process_key = 'enrollment'
         GROUP BY 1
      ) s

    UNION ALL

    -- Adversarial shapes: do they exist here at all?
    SELECT 'l4_adversarial_shapes', 'row', concat_ws(' | ', 'shape=' || shape, 'n=' || n::text), 4
      FROM (
        SELECT 'opportunities_with_multiple_ocm' AS shape, count(*) AS n FROM (
            SELECT m.opportunity_id FROM public.opportunity_customer_members m
             WHERE m.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
             GROUP BY m.opportunity_id HAVING count(*) > 1) a
        UNION ALL
        SELECT 'members_with_multiple_enrollment_pi', count(*) FROM (
            SELECT pi.subject_id FROM public.process_instances pi
             WHERE pi.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND pi.process_key = 'enrollment'
             GROUP BY pi.subject_id HAVING count(*) > 1) b
        UNION ALL
        SELECT 'enrollment_pi_with_null_state', count(*) FROM public.process_instances pi
         WHERE pi.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND pi.process_key = 'enrollment' AND pi.state IS NULL
        UNION ALL
        SELECT 'enrollment_pi_closed', count(*) FROM public.process_instances pi
         WHERE pi.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND pi.process_key = 'enrollment' AND pi.close_reason_key IS NOT NULL
        UNION ALL
        SELECT 'inactive_subject_members', count(*) FROM public.customer_members cm
         WHERE cm.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND cm.is_active IS FALSE
      ) t

    UNION ALL

    -- Department footprint size — how much wider the authorized scope is than one work unit.
    SELECT 'l5_department_footprint', 'row',
           concat_ws(' | ', 'work_units_in_department=' || count(*)::text), 5
      FROM public.work_units w2
     WHERE w2.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
       AND w2.department_id = (SELECT w1.department_id FROM public.work_units w1
                                WHERE w1.id = '587de5bc-c43d-47b1-b1a0-0a3ee2ff2c37')
) q
ORDER BY ord, payload;
