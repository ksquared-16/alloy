-- The full published Business Process payload for the active Enrollment department.
--
-- WHY THE WHOLE PAYLOAD. The corrected revision's Law 4 checksum is sha256 over a JS-canonical
-- serialization, so it must be computed by product code from the exact deployed bytes. A summary
-- cannot produce it.
--
-- WHY IT IS CHUNKED. The payload is a single long jsonb text value, and the host parses one line
-- per row. Emitting it whole risks a truncated line that would either fail to parse or, worse,
-- parse into a payload that is quietly incomplete — and a checksum over a truncated payload is
-- exactly the kind of wrong-but-plausible artefact this program has already paid for. Fixed 3000
-- character chunks with an explicit index and total let the lane reassemble and verify length
-- before trusting a single byte of it.
--
-- OUTPUT CONTRACT: `question_id|row_kind|payload` with payload as JSON text — the shape
-- post-orphan-sweep-census.sql used successfully. The first version of this file returned ordinary
-- tabular columns and failed `result_parse_failed`.
with active as (
    select cp.subject_id as department_id,
           cp.revision_id,
           cp.revision_number,
           cp.payload_checksum,
           r.payload::text as payload_text
    from public.configuration_publications cp
    join public.business_process_revisions r on r.id = cp.revision_id
    where cp.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
      and cp.domain_key = 'business_process'
      and cp.revision_number = (
          select max(i.revision_number) from public.configuration_publications i
          where i.org_id = cp.org_id and i.domain_key = cp.domain_key and i.subject_id = cp.subject_id
      )
)
select question_id, 'data' as row_kind, payload
from (
    select 'revision_identity'::text as question_id,
           json_build_object(
               'department_id', a.department_id,
               'revision_id', a.revision_id,
               'revision_number', a.revision_number,
               'payload_checksum', a.payload_checksum,
               'payload_length', length(a.payload_text),
               'chunk_size', 3000,
               'chunk_total', ceil(length(a.payload_text) / 3000.0)::int
           )::text as payload
    from active a

    union all

    select 'payload_chunk'::text,
           json_build_object(
               'department_id', a.department_id,
               'revision_id', a.revision_id,
               'i', g.i,
               'text', substr(a.payload_text, (g.i - 1) * 3000 + 1, 3000)
           )::text
    from active a,
         lateral generate_series(1, ceil(length(a.payload_text) / 3000.0)::int) as g(i)
) census
order by question_id, payload
