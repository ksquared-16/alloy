-- G-14 retirement evidence: does any ACTIVE production Attendance integration
-- producer still depend on the legacy credential, boundary or mapping path?
--
-- ── THE OUTPUT CONTRACT, LEARNED THE HARD WAY ──
--
-- The census harness parses each emitted line as
--
--     question_id | kind | payload
--
-- taking the first pipe and the second pipe, and treating everything after the
-- second as the payload. A line with fewer than two pipes is SKIPPED, and a
-- result with no surviving lines fails `result_parse_failed` before it reaches
-- the host. Two earlier forms of this artifact were unreadable for that reason:
-- a UNION ALL rowset, and a single labelled text column with no pipes at all.
--
-- A plain multi-column SELECT is also wrong, though it appears to work: psql
-- emits `a|b|c|…` and the harness silently consumes the first TWO columns as
-- question_id and kind, so an eleven-column census reports nine values that
-- cannot be aligned to their measures.
--
-- So: one row, three columns, with the measures as JSON in the payload. The
-- harness JSON-parses the payload when it can, which makes every measure
-- labelled and unambiguous however the output is rendered.
--
-- Read-only. Counts and coarse classification only: no credential material, no
-- external identifiers, no child identity, no organisation names.
SELECT
    'g14_legacy_authority' AS question_id,
    'row'                  AS kind,
    json_build_object(
        'producers_total',              (SELECT count(*) FROM public.attendance_integration_producers),
        'producers_active',             (SELECT count(*) FROM public.attendance_integration_producers WHERE status = 'active'),
        'producers_inactive',           (SELECT count(*) FROM public.attendance_integration_producers WHERE status <> 'active'),
        'producers_with_credential',    (SELECT count(*) FROM public.attendance_integration_producers WHERE credential_hash IS NOT NULL),
        'producer_sites_total',         (SELECT count(*) FROM public.attendance_integration_producer_sites),
        'mappings_total',               (SELECT count(*) FROM public.attendance_integration_mappings),
        'mappings_active',              (SELECT count(*) FROM public.attendance_integration_mappings WHERE status = 'active'),
        -- Conversion blockers, in the vocabulary the certified planner refuses on.
        'active_no_site_rows',          (SELECT count(*) FROM public.attendance_integration_producers p
                                          WHERE p.status = 'active'
                                            AND NOT EXISTS (SELECT 1 FROM public.attendance_integration_producer_sites s WHERE s.producer_id = p.id)),
        'active_missing_producer_key',  (SELECT count(*) FROM public.attendance_integration_producers p
                                          WHERE p.status = 'active' AND (p.producer_key IS NULL OR btrim(p.producer_key) = '')),
        'active_unmappable_capability', (SELECT count(*) FROM public.attendance_integration_producers p
                                          WHERE p.status = 'active'
                                            AND EXISTS (SELECT 1 FROM unnest(COALESCE(p.capabilities, ARRAY[]::text[])) AS c(cap)
                                                        WHERE c.cap NOT IN ('attendance.record','attendance.capture','locations.read'))),
        'active_ambiguous_mappings',    (SELECT count(*) FROM (
                                            SELECT m.producer_id, m.external_entity_type, m.external_id
                                            FROM public.attendance_integration_mappings m
                                            JOIN public.attendance_integration_producers p ON p.id = m.producer_id AND p.status = 'active'
                                            WHERE m.status = 'active'
                                            GROUP BY 1,2,3
                                            HAVING count(DISTINCT COALESCE(m.child_customer_member_id::text, m.location_id::text)) > 1
                                          ) amb),
        'active_already_installed',     (SELECT count(*) FROM public.attendance_integration_producers p
                                          WHERE p.status = 'active'
                                            AND EXISTS (SELECT 1 FROM public.app_installations i
                                                        WHERE i.org_id = p.org_id AND i.producer_key = p.producer_key)),
        'events_via_producer',          (SELECT count(*) FROM public.attendance_integration_events WHERE producer_id IS NOT NULL),
        'orgs_with_active_producers',   (SELECT count(DISTINCT org_id) FROM public.attendance_integration_producers WHERE status = 'active')
    )::text AS payload;
