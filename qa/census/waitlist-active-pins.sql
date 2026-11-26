-- Read-only: which waitlist candidates in the Firefly INFANT section carry an ACTIVE manual pin,
-- and what ordinal does each store? Needed to explain why a persisted pin_ordinal of 4 renders the
-- candidate at section position 5 while a pin of 1 renders at 1.
SELECT
    po.id                         AS override_id,
    po.placement_candidate_id,
    po.program_room_cohort_key    AS override_cohort_key,
    po.override_kind,
    po.is_active,
    po.payload ->> 'pin_ordinal'  AS pin_ordinal,
    po.reason,
    po.created_at,
    pc.program_room_cohort_key    AS candidate_cohort_key,
    pc.status                     AS candidate_status
FROM placement_overrides po
LEFT JOIN placement_candidates pc
       ON pc.id = po.placement_candidate_id
      AND pc.org_id = po.org_id
WHERE po.override_kind = 'pin'
  AND po.is_active = true
ORDER BY po.created_at DESC
LIMIT 50;
