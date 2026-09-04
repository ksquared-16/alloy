-- The full published Business Process payload for the active Enrollment department, so the
-- correction can be computed locally with the application's own serializer and checksum
-- function rather than a SQL re-implementation of them.
SELECT cp.subject_id      AS department_id,
       cp.revision_id     AS revision_id,
       cp.revision_number AS revision_number,
       cp.payload_checksum,
       r.payload::text    AS payload
FROM public.configuration_publications cp
JOIN public.business_process_revisions r ON r.id = cp.revision_id
WHERE cp.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
  AND cp.domain_key = 'business_process'
  AND cp.revision_number = (
      SELECT max(revision_number) FROM public.configuration_publications inner_cp
      WHERE inner_cp.org_id = cp.org_id
        AND inner_cp.domain_key = 'business_process'
        AND inner_cp.subject_id = cp.subject_id
  )
ORDER BY cp.subject_id;
