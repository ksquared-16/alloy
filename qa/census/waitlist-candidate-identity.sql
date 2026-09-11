-- Read-only. Who are the six candidates named in the manual-position override ledger?
--
-- The ledger (qa/census/waitlist-override-identity.sql.results.json) names five active pins
-- plus Wrigley's cleared one. Five map to rows visible in the deployed Firefly INFANT section.
-- One does not: 94984f6c-f269-4f86-8b1b-9a4607cac2c6, which holds an override created
-- 2026-08-21 and renumbered 2 -> 3 by the faulty writer, yet appears nowhere in the twelve
-- rendered rows. Until that is explained, the repair table has a row it cannot name.
--
-- All six are queried together rather than the one unknown alone, because the answer is
-- comparative: `status` and `program_room_cohort_key` are what decide whether a candidate
-- renders in that section at all, and the known five are the control group. It should also
-- show the cohort-label drift directly — eleven rows under `infant_0_18_months` and one under
-- the degraded `infant` is the shape `applySectionManualPositions` was made robust to.
--
-- No joins. `placement_candidates` carries no display-name column (the name is derived from
-- the person/customer graph), and a join onto one is exactly what failed `execution_failed`
-- in an earlier attempt. Column 1 carries the id because `q15_labeled_rows` makes column 1
-- the question_id, discards column 2, and joins the rest with "|".
SELECT
    pc.id::text                                                        AS candidate_id,
    'candidate'                                                        AS discarded_label,
    pc.status                                                          AS status,
    pc.program_room_cohort_key                                         AS cohort_key,
    COALESCE(pc.program_room_group_label, '(none)')                    AS group_label,
    COALESCE(pc.site_id::text, '(none)')                               AS site_id,
    COALESCE(to_char(pc.wait_since, 'YYYY-MM-DD'), '(none)')           AS wait_since,
    COALESCE(to_char(pc.desired_start_date, 'YYYY-MM-DD'), '(none)')   AS desired_start,
    pc.org_id::text                                                    AS org_id,
    pc.is_synthetic_fallback::text                                     AS synthetic
FROM placement_candidates pc
WHERE pc.id IN (
    '94984f6c-f269-4f86-8b1b-9a4607cac2c6',  -- unmapped, override 489a6460
    '9e230cf8-d444-4d0c-8f8b-54be3162a6ad',  -- Test Process3, override f64c8389
    'e392cb90-29a7-4327-b91e-b063b06fa4b6',  -- Test Process8, override d0953b15
    '89729749-e923-4cbc-9b11-e14b42620219',  -- Test Process6, override 82cbc16f
    'b34bbdec-fa92-4218-a3b1-e420e03d857c',  -- PassB Kid,     override e23d6d6d
    '698f850a-2441-48d5-bed3-0b0870afa848'   -- Wrigley Kurzman, override 7e83e653 (cleared)
)
ORDER BY pc.program_room_cohort_key, pc.status, pc.id;
