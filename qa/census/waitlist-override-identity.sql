-- Read-only, no joins: every field packed into one column so the labeled-row census format cannot
-- drop the identifying ones. The previous attempt failed because it joined placement_candidates for
-- a child_display_name column that does not exist on that table (the display name is derived, not
-- stored). Candidate-to-child mapping is read from the application instead.
SELECT
    po.id::text
    || ' candidate=' || po.placement_candidate_id::text
    || ' ordinal='   || COALESCE(po.payload ->> 'pin_ordinal', '(null)')
    || ' created='   || to_char(po.created_at, 'YYYY-MM-DD HH24:MI:SS')
    || ' updated='   || COALESCE(to_char(po.updated_at, 'YYYY-MM-DD HH24:MI:SS'), '(never)')
    || ' actor='     || COALESCE(po.created_by::text, '(none)')
    || ' cohort='    || COALESCE(po.program_room_cohort_key, '(none)')
        AS override_identity
FROM placement_overrides po
WHERE po.override_kind = 'pin'
  AND po.is_active = true
ORDER BY po.created_at;
