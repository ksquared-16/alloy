-- Read-only. Who are the six candidates named in the manual-position override ledger?
--
-- Five of the six map to rows visible in the deployed Firefly INFANT section. One does not:
-- 94984f6c-f269-4f86-8b1b-9a4607cac2c6 holds an override created 2026-08-21 and renumbered
-- 2 -> 3 by the faulty writer, yet appears nowhere among the twelve rendered rows. Restoring
-- its ordinal to 2 would collide with TP8 if it shares the section, so the repair holds that
-- row until this answers.
--
-- All six are asked for at once because the answer is comparative: `status` and
-- `program_room_cohort_key` are what decide whether a candidate renders in a section, and the
-- five that DO render are the control group.
--
-- Shaped to match qa/census/waitlist-override-identity.sql, which parsed: seven columns, no
-- joins, and NO comments inside the statement. Column 1 becomes `question_id`, column 2 is
-- discarded, columns 3+ are joined with "|". An earlier form of this query carried `--` notes
-- inside the IN list and failed `execution_failed`; the header is the only safe place for them.
-- There are no joins because `placement_candidates` has no display-name column, and joining
-- onto one is what failed an earlier attempt.
SELECT
    pc.id::text                                              AS candidate_id,
    'candidate'                                              AS discarded_label,
    pc.status                                                AS status,
    pc.program_room_cohort_key                               AS cohort_key,
    COALESCE(pc.program_room_group_label, '(none)')          AS group_label,
    COALESCE(pc.site_id::text, '(none)')                     AS site_id,
    COALESCE(to_char(pc.wait_since, 'YYYY-MM-DD'), '(none)') AS wait_since
FROM placement_candidates pc
WHERE pc.id::text IN (
    '94984f6c-f269-4f86-8b1b-9a4607cac2c6',
    '9e230cf8-d444-4d0c-8f8b-54be3162a6ad',
    'e392cb90-29a7-4327-b91e-b063b06fa4b6',
    '89729749-e923-4cbc-9b11-e14b42620219',
    'b34bbdec-fa92-4218-a3b1-e420e03d857c',
    '698f850a-2441-48d5-bed3-0b0870afa848'
)
ORDER BY pc.program_room_cohort_key, pc.status, pc.id;
