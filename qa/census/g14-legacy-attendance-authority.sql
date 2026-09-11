-- G-14 retirement evidence: does any ACTIVE production Attendance integration
-- producer still depend on the legacy credential, boundary or mapping path?
--
-- Step 12 may only retire `attendance_integration_producers`,
-- `attendance_integration_producer_sites` and `attendance_integration_mappings`
-- once nothing resolves credentials, boundaries or external ids from them. Row
-- counts cannot prove that on their own -- a table can be empty and still be the
-- code path -- but a NON-empty table settles it the other way at once, by naming
-- how many integrations would lose their authority on the day it is dropped.
--
-- ── ONE ROW, ONE COLUMN, LABELLED ──
--
-- An earlier form of this artifact returned eleven scalar columns and the census
-- harness reported nine values, which cannot be aligned to measures and is
-- therefore unreadable. A form before that was a UNION ALL rowset and failed
-- `result_parse_failed` before it ever reached the host. So this emits a single
-- labelled text column: immune to column-count truncation, and self-describing
-- whatever the harness does with the shape.
--
-- Read-only. Counts and coarse classification only: no credential material, no
-- external identifiers, no child identity, no organisation names.
SELECT
       'producers_total='                  || (SELECT count(*) FROM public.attendance_integration_producers)
    || ' producers_active='                || (SELECT count(*) FROM public.attendance_integration_producers WHERE status = 'active')
    || ' producers_inactive='              || (SELECT count(*) FROM public.attendance_integration_producers WHERE status <> 'active')
    || ' producers_with_credential='       || (SELECT count(*) FROM public.attendance_integration_producers WHERE credential_hash IS NOT NULL)
    || ' producer_sites_total='            || (SELECT count(*) FROM public.attendance_integration_producer_sites)
    || ' mappings_total='                  || (SELECT count(*) FROM public.attendance_integration_mappings)
    || ' mappings_active='                 || (SELECT count(*) FROM public.attendance_integration_mappings WHERE status = 'active')
    -- Conversion blockers, in the exact vocabulary the certified planner refuses on.
    || ' active_no_site_rows='             || (SELECT count(*) FROM public.attendance_integration_producers p
                                               WHERE p.status = 'active'
                                                 AND NOT EXISTS (SELECT 1 FROM public.attendance_integration_producer_sites s WHERE s.producer_id = p.id))
    || ' active_missing_producer_key='     || (SELECT count(*) FROM public.attendance_integration_producers p
                                               WHERE p.status = 'active' AND (p.producer_key IS NULL OR btrim(p.producer_key) = ''))
    || ' active_unmappable_capability='    || (SELECT count(*) FROM public.attendance_integration_producers p
                                               WHERE p.status = 'active'
                                                 AND EXISTS (SELECT 1 FROM unnest(COALESCE(p.capabilities, ARRAY[]::text[])) AS c(cap)
                                                             WHERE c.cap NOT IN ('attendance.record','attendance.capture','locations.read')))
    -- One external id claiming two different targets within one producer is what
    -- integration_resource_refs would have to guess between, so the planner refuses it.
    || ' active_ambiguous_mappings='       || (SELECT count(*) FROM (
                                                 SELECT m.producer_id, m.external_entity_type, m.external_id
                                                 FROM public.attendance_integration_mappings m
                                                 JOIN public.attendance_integration_producers p ON p.id = m.producer_id AND p.status = 'active'
                                                 WHERE m.status = 'active'
                                                 GROUP BY 1,2,3
                                                 HAVING count(DISTINCT COALESCE(m.child_customer_member_id::text, m.location_id::text)) > 1
                                               ) amb)
    -- Already converted: an installation carrying the same durable producer key.
    || ' active_already_installed='        || (SELECT count(*) FROM public.attendance_integration_producers p
                                               WHERE p.status = 'active'
                                                 AND EXISTS (SELECT 1 FROM public.app_installations i
                                                             WHERE i.org_id = p.org_id AND i.producer_key = p.producer_key))
    || ' events_via_producer='             || (SELECT count(*) FROM public.attendance_integration_events WHERE producer_id IS NOT NULL)
    || ' orgs_with_active_producers='      || (SELECT count(DISTINCT org_id) FROM public.attendance_integration_producers WHERE status = 'active')
    AS g14_legacy_authority_census;
