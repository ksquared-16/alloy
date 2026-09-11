-- Read-only. Who is actually IN the Firefly INFANT section?
--
-- This settles the one question the ordering repair is blocked on. The section renders twelve
-- rows. Candidate 94984f6c holds a live pin but appears in none of them, and the two available
-- readings contradict each other: both observed renders reproduce only with that candidate
-- ABSENT from the list, while the candidate census reports it active, in infant_0_18_months, at
-- the same site as the other five - which would normally mean present.
--
-- Counting the section's membership decides it. If exactly eleven active candidates sit in
-- infant_0_18_months at that site, the twelve rendered rows are those eleven plus the single
-- degraded `infant` row, 94984f6c is one of them, and the repair derivation is unsound. If there
-- are twelve, then one active candidate does not render, and the renders are right.
--
-- `wait_since` and `desired_start_date` come along because they are the canonical tie-breakers -
-- useful for narrowing the natural order, though not sufficient for it, since the priority
-- buckets depend on household flags that live elsewhere.
--
-- Only placement_candidates is touched. It is the one table censuses have returned from
-- repeatedly; a LEFT JOIN onto opportunities failed execution_failed. Seven columns, no comments
-- inside the statement.
SELECT
    pc.id::text                                                      AS candidate_id,
    'candidate'                                                      AS discarded_label,
    pc.program_room_cohort_key                                       AS cohort_key,
    pc.status                                                        AS status,
    COALESCE(to_char(pc.wait_since, 'YYYY-MM-DD HH24:MI'), '(none)') AS wait_since,
    COALESCE(to_char(pc.desired_start_date, 'YYYY-MM-DD'), '(none)') AS desired_start,
    COALESCE(pc.site_id::text, '(none)')                             AS site_id
FROM placement_candidates pc
WHERE pc.site_id::text = '1a5644a7-45c4-413b-9021-5f556118b6e2'
  AND pc.program_room_cohort_key IN ('infant_0_18_months', 'infant')
ORDER BY pc.program_room_cohort_key, pc.status, pc.wait_since, pc.id;
