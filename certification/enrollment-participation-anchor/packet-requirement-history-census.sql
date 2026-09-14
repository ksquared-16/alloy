-- Did a PUBLISHED Business Process revision ever require the Enrollment packet?
--
-- WHY. The Enrolling stage's requirement for `Enrollment Paperwork 2026–2027` was observed in the
-- editable draft on 2026-09-11 and is absent from both draft and publication on 2026-09-14. A
-- publication happened in between (revision 31, 2026-09-12T15:13:49Z). Drafts are mutable and carry
-- no per-save history, so the only durable evidence of what the configuration used to contain is
-- `business_process_revisions`, which is immutable by design.
--
-- WHAT IT MEASURES. Every revision for the Enrollment department, oldest to newest, with whether its
-- payload mentions the packet at all — by the packet's own id, and separately by the requirement
-- KIND, so a requirement pointing at some other packet is still visible. Plus the current draft, for
-- the same two questions, so draft and publication can be compared in one read.
--
-- ALWAYS EMITS. The first row is unconditional context (does the org exist, does the department
-- exist, how many revisions are there). A census that can come back silent cannot report absence,
-- and absence is the finding being tested.
--
-- COLUMN NAMES ARE THE TABLE'S, NOT THE ONES A READER EXPECTS. A first run of this census failed on
-- `r.created_at`; publications record `published_at`/`published_by`, because a revision is published
-- rather than created. Corrected here rather than guessed again.
--
-- READ-ONLY. Counts, timestamps, ids and booleans over configuration. No participant data, no
-- payload bodies — a revision payload is large and is not what this question needs.
select question_id, 'data' as row_kind, payload
from (
    -- ALWAYS ONE ROW.
    select 'r_context'::text as question_id,
           json_build_object(
               'org_id', '93667019-bd28-49b5-a688-acc9bb1e0a19',
               'org_exists', (
                   select count(*) > 0 from public.orgs o
                   where o.id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
               ),
               'department_id', '3933ac47-077a-4de8-aaac-8aed48d80413',
               'department_exists', (
                   select count(*) > 0 from public.departments d
                   where d.id = '3933ac47-077a-4de8-aaac-8aed48d80413'::uuid
                     and d.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
               ),
               'revisions_total', (
                   select count(*) from public.business_process_revisions r
                   where r.department_id = '3933ac47-077a-4de8-aaac-8aed48d80413'::uuid
                     and r.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
               ),
               'packet_definition_id', 'c03425c9-2b05-4847-8495-2b2713e36243'
           )::text as payload

    union all

    -- ONE ROW PER REVISION, oldest first. `payload::text` is searched rather than walked: the
    -- question is only whether the packet is mentioned, and a text search cannot miss it by
    -- traversing the wrong nesting — which is the exact failure being investigated.
    select 'r_revision'::text as question_id,
           json_build_object(
               'revision_number', r.revision_number,
               'revision_id', r.id,
               'published_at', r.published_at,
               'published_by', r.published_by,
               'source_draft_id', r.source_draft_id,
               'mentions_packet_id', (r.payload::text like '%c03425c9-2b05-4847-8495-2b2713e36243%'),
               'mentions_packet_kind', (r.payload::text like '%"kind":"packet"%'
                                        or r.payload::text like '%"kind": "packet"%'),
               'mentions_packet_definition_key', (r.payload::text like '%packet_definition_id%'),
               'mentions_enrollment_packet_requirement_id', (r.payload::text like '%enrollment_packet%')
           )::text as payload
    from public.business_process_revisions r
    where r.department_id = '3933ac47-077a-4de8-aaac-8aed48d80413'::uuid
      and r.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid

    union all

    -- THE CURRENT DRAFT, asked the same way.
    select 'r_draft'::text as question_id,
           json_build_object(
               'draft_id', d.id,
               'draft_revision', d.draft_revision,
               'base_revision_id', d.base_revision_id,
               'draft_status', d.draft_status,
               'mentions_packet_id', (d.payload::text like '%c03425c9-2b05-4847-8495-2b2713e36243%'),
               'mentions_packet_kind', (d.payload::text like '%"kind":"packet"%'
                                        or d.payload::text like '%"kind": "packet"%'),
               'mentions_packet_definition_key', (d.payload::text like '%packet_definition_id%'),
               'mentions_enrollment_packet_requirement_id', (d.payload::text like '%enrollment_packet%')
           )::text as payload
    from public.business_process_drafts d
    where d.department_id = '3933ac47-077a-4de8-aaac-8aed48d80413'::uuid
      and d.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
) rows
order by question_id, payload;
