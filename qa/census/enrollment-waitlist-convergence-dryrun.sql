-- Read-only. Phase 5 dry-run: which placement-waitlisted children are NOT on child Waitlist?
--
-- `qaConvergePlacementWaitlistedChildren` selects a child as placement-waitlisted from either of two
-- independent facts, because either one alone is a real half-recorded state: the child's own
-- disposition on `opportunity_customer_members`, or a live `placement_candidates` row. It then
-- converges only those whose enrollment `process_instances.stage_key` is not already `waitlist`.
--
-- This asks the same question without writing anything, so the dry-run population is measured from
-- the deployed database rather than asserted. Three numbers per org: how many children the script
-- would consider, how many are already converged, and how many it would actually move. The third is
-- the one that must reach zero and stay there after an apply.
--
-- Shaped to the census output contract: column 1 becomes `question_id`, column 2 is discarded,
-- columns 3+ are joined with "|". No comments inside the statement — the header is the only safe
-- place for them, which an earlier artifact learned by failing `execution_failed`.
WITH waitlisted AS (
    SELECT DISTINCT ocm.org_id, ocm.opportunity_id, ocm.customer_member_id
    FROM opportunity_customer_members ocm
    WHERE ocm.outcome_status_key = 'waitlisted'
    UNION
    SELECT DISTINCT pc.org_id, pc.opportunity_id, pc.customer_member_id
    FROM placement_candidates pc
    WHERE pc.status NOT IN ('withdrawn', 'placed')
      AND pc.customer_member_id IS NOT NULL
      AND pc.opportunity_id IS NOT NULL
),
staged AS (
    SELECT w.org_id,
           w.opportunity_id,
           w.customer_member_id,
           (
               SELECT pi.stage_key
               FROM process_instances pi
               WHERE pi.org_id = w.org_id
                 AND pi.process_key = 'enrollment'
                 AND pi.subject_id = w.customer_member_id
                 AND pi.close_reason_key IS NULL
               ORDER BY pi.created_at DESC
               LIMIT 1
           ) AS stage_key
    FROM waitlisted w
)
SELECT s.org_id::text AS question_id,
       'convergence' AS discarded_label,
       COUNT(*)::text AS considered,
       COUNT(*) FILTER (WHERE s.stage_key = 'waitlist')::text AS already_converged,
       COUNT(*) FILTER (WHERE s.stage_key IS DISTINCT FROM 'waitlist')::text AS would_converge,
       COUNT(*) FILTER (WHERE s.stage_key IS NULL)::text AS no_enrollment_track
FROM staged s
GROUP BY s.org_id
ORDER BY s.org_id;
