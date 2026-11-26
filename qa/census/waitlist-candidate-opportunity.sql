-- Read-only. Does candidate 94984f6c's opportunity place it in the rendered queue at all?
--
-- The decisive open question in the ordering repair. The candidate census says 94984f6c is
-- `active` in `infant_0_18_months` at the same site as the other five, which would ordinarily
-- mean it renders in the INFANT section. But it does not appear among the twelve rows, and the
-- renders agree: replaying BOTH observed lists reproduces them only when 94984f6c is absent from
-- the list, and never when it is present holding its stored ordinal. Two independent renders
-- agreeing is evidence; "active and in the cohort, therefore rendered" is an assumption about
-- queue scope, and that assumption is what this asks about.
--
-- Queue rows are projected from OPPORTUNITIES, so an active candidate hanging off an opportunity
-- that is out of queue scope would be invisible while still carrying a live override. That is the
-- hypothesis. `o.name` also finally resolves candidate-to-child identity, which no query so far
-- has returned — placement_candidates has no display-name column, and the name lives here.
--
-- Seven columns, one LEFT JOIN in the style that already returned successfully in
-- qa/census/waitlist-active-pins.sql, and no comments inside the statement.
SELECT
    pc.id::text                                    AS candidate_id,
    'candidate'                                    AS discarded_label,
    COALESCE(o.status, '(null)')                   AS opp_status,
    COALESCE(o.status_key, '(null)')               AS opp_status_key,
    COALESCE(o.name, o.title, '(none)')            AS opp_name,
    COALESCE(o.location_id::text, '(none)')        AS opp_location_id,
    COALESCE(o.pipeline_stage_id::text, '(none)')  AS opp_stage_id
FROM placement_candidates pc
LEFT JOIN opportunities o
       ON o.id = pc.opportunity_id
      AND o.org_id = pc.org_id
WHERE pc.id::text IN (
    '94984f6c-f269-4f86-8b1b-9a4607cac2c6',
    '9e230cf8-d444-4d0c-8f8b-54be3162a6ad',
    'e392cb90-29a7-4327-b91e-b063b06fa4b6',
    '89729749-e923-4cbc-9b11-e14b42620219',
    'b34bbdec-fa92-4218-a3b1-e420e03d857c',
    '698f850a-2441-48d5-bed3-0b0870afa848'
)
ORDER BY pc.id;
