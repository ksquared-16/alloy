-- Read-only. Maps each active manual-position override to its candidate.
--
-- Shaped to the census format rather than against it. Observed from two censuses that parsed:
-- column 1 becomes `question_id`, column 2 is consumed and discarded, columns 3+ are joined with
-- "|" into the row. That is why `placement_candidate_id` vanished when it sat in column 2, and why
-- a single packed column failed to parse at all. Both ids therefore travel together in column 1.
--
-- Every column here is one that already returned successfully in an earlier census; there are no
-- joins, because the earlier join failed on `placement_candidates.child_display_name`, which does
-- not exist (the display name is derived). Candidate-to-child mapping is read from the app instead.
SELECT
    po.id::text || '::' || po.placement_candidate_id::text   AS override_and_candidate,
    'pin'                                                    AS discarded_label,
    COALESCE(po.payload ->> 'pin_ordinal', '(null)')         AS pin_ordinal,
    to_char(po.created_at, 'YYYY-MM-DD HH24:MI:SS')          AS created_at,
    COALESCE(to_char(po.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '(never)') AS updated_at,
    COALESCE(po.created_by::text, '(none)')                  AS actor,
    COALESCE(po.reason, '(none)')                            AS reason
FROM placement_overrides po
WHERE po.override_kind = 'pin'
  AND po.is_active = true
ORDER BY po.created_at;
