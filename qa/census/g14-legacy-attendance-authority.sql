-- G-14 retirement evidence: is the legacy attendance producer registry still a
-- production authority?
--
-- Step 12 may only drop `attendance_integration_producers`,
-- `attendance_integration_producer_sites` and `attendance_integration_mappings`
-- once it is proven that nothing resolves credentials, boundaries or external
-- ids from them. Row counts alone do not prove that -- a table can be empty and
-- still be the code path -- but a NON-empty table settles the question the other
-- way immediately: it names integrations that would lose their authority.
--
-- Read-only. Counts and coarse status only; no credential material, no external
-- identifiers, no child identity.
SELECT 'producers_total'            AS measure, count(*)::text AS value FROM public.attendance_integration_producers
UNION ALL SELECT 'producers_active',        count(*)::text FROM public.attendance_integration_producers WHERE status = 'active'
UNION ALL SELECT 'producers_revoked',       count(*)::text FROM public.attendance_integration_producers WHERE status <> 'active'
UNION ALL SELECT 'producers_with_credential', count(*)::text FROM public.attendance_integration_producers WHERE credential_hash IS NOT NULL
UNION ALL SELECT 'producers_seen_last_90d', count(*)::text FROM public.attendance_integration_producers WHERE last_seen_at >= now() - interval '90 days'
UNION ALL SELECT 'producer_sites_total',    count(*)::text FROM public.attendance_integration_producer_sites
UNION ALL SELECT 'mappings_total',          count(*)::text FROM public.attendance_integration_mappings
UNION ALL SELECT 'mappings_active',         count(*)::text FROM public.attendance_integration_mappings WHERE status = 'active'
UNION ALL SELECT 'events_via_producer',     count(*)::text FROM public.attendance_integration_events WHERE producer_id IS NOT NULL
UNION ALL SELECT 'events_unattributed',     count(*)::text FROM public.attendance_integration_events WHERE producer_id IS NULL
UNION ALL SELECT 'orgs_with_producers',     count(DISTINCT org_id)::text FROM public.attendance_integration_producers
ORDER BY 1;
