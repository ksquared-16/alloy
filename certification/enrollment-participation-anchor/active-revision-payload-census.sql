-- The deployed Enrollment configuration payload, chunked.
--
-- WHY THIS VERSION EXISTS. The previous artifact joined from `configuration_publications` and
-- returned NOTHING; the trusted host reports empty output as `result_parse_failed`, so a census that
-- finds no rows looks exactly like a census that is broken. This one always emits `payload_source`
-- first and can never come back silent.
--
-- AND IT TAKES THE PAYLOAD FROM WHEREVER IT ACTUALLY IS. `publish_business_process_revision_v1`
-- writes an immutable revision AND projects it into `departments.metadata.lifecycle_builder_v1`. A
-- tenant configured before that runtime existed has only the projection. `source` on every row says
-- which one these bytes came from, because the correction and its Law 4 checksum must be computed
-- over the payload the runtime actually reads.
--
-- CHUNKED because the host parses one line per row and the payload is a single long value. A line
-- truncated in transit would still parse as JSON and still produce a confident checksum over
-- configuration the tenant does not have, so every chunk carries an index and the identity row
-- declares the total length to verify the reassembly against.
with src as (
    select d.id as department_id,
           coalesce(
               (select r.payload
                  from public.business_process_revisions r
                  join public.configuration_publications cp
                    on cp.revision_id = r.id
                   and cp.domain_key = 'business_process'
                   and cp.subject_id = d.id
                 where r.org_id = d.org_id and r.department_id = d.id
                 order by cp.revision_number desc
                 limit 1),
               d.metadata->'lifecycle_builder_v1'
           ) as payload,
           case when exists (
               select 1 from public.configuration_publications cp
               where cp.org_id = d.org_id and cp.domain_key = 'business_process' and cp.subject_id = d.id
           ) then 'published_revision' else 'departments_projection' end as source,
           (select cp.revision_id from public.configuration_publications cp
             where cp.org_id = d.org_id and cp.domain_key = 'business_process' and cp.subject_id = d.id
             order by cp.revision_number desc limit 1) as revision_id,
           (select cp.revision_number from public.configuration_publications cp
             where cp.org_id = d.org_id and cp.domain_key = 'business_process' and cp.subject_id = d.id
             order by cp.revision_number desc limit 1) as revision_number,
           (select cp.payload_checksum from public.configuration_publications cp
             where cp.org_id = d.org_id and cp.domain_key = 'business_process' and cp.subject_id = d.id
             order by cp.revision_number desc limit 1) as payload_checksum
    from public.departments d
    where d.org_id = '93667019-3b1a-4c9a-9c9f-6b7b0e6a4d33'
      and d.metadata ? 'lifecycle_builder_v1'
),
active as (
    select department_id,
           source,
           coalesce(revision_id::text, 'none') as revision_id,
           coalesce(revision_number, 0) as revision_number,
           coalesce(payload_checksum, 'none') as payload_checksum,
           payload::text as payload_text
    from src
    where payload is not null
)
select question_id, 'data' as row_kind, payload
from (
    -- ALWAYS ONE ROW, even when nothing below matches.
    select 'payload_source'::text as question_id,
           json_build_object(
               'departments_with_builder', (select count(*) from src),
               'payloads_available', (select count(*) from active),
               'sources', (select coalesce(json_agg(distinct source), '[]'::json) from active)
           )::text as payload

    union all

    select 'revision_identity'::text,
           json_build_object(
               'department_id', a.department_id,
               'source', a.source,
               'revision_id', a.revision_id,
               'revision_number', a.revision_number,
               'payload_checksum', a.payload_checksum,
               'payload_length', length(a.payload_text),
               'chunk_size', 3000,
               'chunk_total', ceil(length(a.payload_text) / 3000.0)::int
           )::text
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
