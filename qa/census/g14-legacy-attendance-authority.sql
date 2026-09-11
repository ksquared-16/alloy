-- G-14 retirement evidence: is the legacy attendance producer registry still a
-- production authority?
--
-- Step 12 may only drop `attendance_integration_producers`,
-- `attendance_integration_producer_sites` and `attendance_integration_mappings`
-- once nothing resolves credentials, boundaries or external ids from them. Row
-- counts alone cannot prove that -- a table can be empty and still be the code
-- path -- but a NON-empty table settles the question the other way immediately:
-- it names integrations that would lose their authority on the day it is dropped.
--
-- Read-only, one row, coarse counts only. No credential material, no external
-- identifiers, no child identity.
SELECT
    (SELECT count(*) FROM public.attendance_integration_producers)                                        AS producers_total,
    (SELECT count(*) FROM public.attendance_integration_producers WHERE status = 'active')                AS producers_active,
    (SELECT count(*) FROM public.attendance_integration_producers WHERE status <> 'active')               AS producers_revoked,
    (SELECT count(*) FROM public.attendance_integration_producers WHERE credential_hash IS NOT NULL)      AS producers_with_credential,
    (SELECT count(*) FROM public.attendance_integration_producers
      WHERE last_seen_at >= now() - interval '90 days')                                                   AS producers_seen_90d,
    (SELECT count(DISTINCT org_id) FROM public.attendance_integration_producers)                          AS orgs_with_producers,
    (SELECT count(*) FROM public.attendance_integration_producer_sites)                                   AS producer_sites_total,
    (SELECT count(*) FROM public.attendance_integration_mappings)                                         AS mappings_total,
    (SELECT count(*) FROM public.attendance_integration_mappings WHERE status = 'active')                 AS mappings_active,
    (SELECT count(*) FROM public.attendance_integration_events WHERE producer_id IS NOT NULL)             AS events_via_producer,
    (SELECT count(*) FROM public.attendance_integration_events WHERE producer_id IS NULL)                 AS events_unattributed;
