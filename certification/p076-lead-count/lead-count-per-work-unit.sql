-- P0-7.6 — candidate lead count per work unit, for a MULTI-SPECIMEN oracle comparison.
--
-- The canonical specimen proved 20 === 20, but it cannot discriminate: with the department
-- expansion (l1) and without it (l2) it answered 20 either way, so the department axis — the one
-- semantic the source explicitly warns about ("the park defect") — went untested. Every work unit
-- in the department is a separate specimen, and each can be asked of the ORACLE independently by
-- requesting enrollment.active_leads with that work_unit_id.
--
-- This returns the candidate's answer for each, plus the ids so the oracle can be asked the same
-- question. Read-only.
SELECT question_id, kind, payload
FROM (
    SELECT 'p1_per_work_unit_candidate' AS question_id, 'row' AS kind,
           concat_ws(' | ', 'work_unit=' || w.id::text, 'name=' || coalesce(w.name,'-'),
               'candidate_dept_expanded=' || (
                 SELECT count(*) FROM public.process_instances pi
                   JOIN public.customer_members cm ON cm.id = pi.subject_id AND cm.org_id = pi.org_id
                   JOIN public.opportunities o ON o.org_id = pi.org_id AND o.id = COALESCE(
                       (SELECT m.opportunity_id FROM public.opportunity_customer_members m
                         WHERE m.id = pi.context_id AND m.org_id = pi.org_id), pi.context_id)
                  WHERE pi.org_id = w.org_id AND pi.process_key = 'enrollment' AND pi.subject_type = 'child'
                    AND pi.close_reason_key IS NULL
                    AND coalesce(cm.is_active, true) IS NOT FALSE
                    AND coalesce(lower(btrim(o.status_key)),'') NOT IN ('closed','lost','archived','inactive')
                    AND coalesce(lower(btrim(pi.state)),'') NOT IN ('enrolled','withdrawn','not_enrolling')
                    AND o.work_unit_id IN (SELECT w2.id FROM public.work_units w2
                                            WHERE w2.org_id = w.org_id AND w2.department_id = w.department_id)
               )::text,
               'candidate_single_wu=' || (
                 SELECT count(*) FROM public.process_instances pi
                   JOIN public.customer_members cm ON cm.id = pi.subject_id AND cm.org_id = pi.org_id
                   JOIN public.opportunities o ON o.org_id = pi.org_id AND o.id = COALESCE(
                       (SELECT m.opportunity_id FROM public.opportunity_customer_members m
                         WHERE m.id = pi.context_id AND m.org_id = pi.org_id), pi.context_id)
                  WHERE pi.org_id = w.org_id AND pi.process_key = 'enrollment' AND pi.subject_type = 'child'
                    AND pi.close_reason_key IS NULL
                    AND coalesce(cm.is_active, true) IS NOT FALSE
                    AND coalesce(lower(btrim(o.status_key)),'') NOT IN ('closed','lost','archived','inactive')
                    AND coalesce(lower(btrim(pi.state)),'') NOT IN ('enrolled','withdrawn','not_enrolling')
                    AND o.work_unit_id = w.id
               )::text) AS payload,
           1 AS ord
      FROM public.work_units w
     WHERE w.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
       AND w.department_id = (SELECT w1.department_id FROM public.work_units w1
                               WHERE w1.id = '587de5bc-c43d-47b1-b1a0-0a3ee2ff2c37')
) q
ORDER BY ord, payload;
