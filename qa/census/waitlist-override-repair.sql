-- Read-only: identify the exact pre-existing director manual-position overrides on the Firefly
-- Infant waitlist, with the candidate each belongs to and full lineage, so a controlled repair can
-- restore the known-good pre-QA ordering without creating, replacing or rewriting any override.
SELECT
    po.id                          AS override_id,
    po.placement_candidate_id      AS candidate_id,
    pc.program_room_cohort_key     AS candidate_cohort_key,
    pc.status                      AS candidate_status,
    po.payload ->> 'pin_ordinal'   AS current_ordinal,
    po.reason                      AS original_reason,
    po.created_by                  AS original_actor,
    po.created_at                  AS original_created_at,
    po.updated_at                  AS last_updated_at,
    po.is_active
FROM placement_overrides po
JOIN placement_candidates pc
  ON pc.id = po.placement_candidate_id
 AND pc.org_id = po.org_id
WHERE po.override_kind = 'pin'
  AND po.is_active = true
  AND pc.status = 'active'
ORDER BY (po.payload ->> 'pin_ordinal')::int NULLS LAST, po.created_at;
