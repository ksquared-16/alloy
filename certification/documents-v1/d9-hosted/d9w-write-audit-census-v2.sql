-- Documents D9-H2 W-C1 census v2 (after migration 20261222090000): the four effect kinds that census v1
-- (d9w-write-audit-census.sql, 009063d0) could only pair by time are now proven by STORED audit id.
--   review / validity  document_version_review_events.audit_event_id   → document_version_reviewed / _validity_set
--   link / unlink      document_subjects.link_audit_event_id / unlink_audit_event_id → document_subject_changed
--   escalation         processing_cases.metadata.api_upload_escalation.audit_event_id → document_unfiled_upload_escalated
-- Each stored id must name a workflow_events row in the same QA org, about the same document, of the expected type, with
-- the expected facts (version; change + subject), written by the expected kind of actor (an application for the API
-- writes, the system escalation process for escalations), strictly before the effect, and bound to no other effect.
-- A NULL id on any of these effects FAILS: v2 is valid only for a run whose writes all happened after the migration
-- was applied (it reads the new columns, so on an unmigrated database it errors rather than passing).
-- Upload / filing / archive / restore and the QA-org scope checks stay in v1; run v1 and v2 at the same step
-- (D9-H2-HOSTED-RUN-ORDER.md step 7, after certify and before cleanup).
-- LIMIT (recorded): an escalation whose annotation was lost and later repaired has no stored id (the repair writes no
-- audit and cannot recover the original id); v2 reports it as a failure, never as linked.
-- Selects only by the two QA org ids and the D9 application slugs. No PII column, no secret.
with qa as (
    select unnest(array['4acc9386-c485-486f-aa1f-05d83499d142'::uuid, 'ad53fee2-2570-460f-9300-f0e106c473b6'::uuid]) as org_id
),
wapps as (
    select a.id from public.developer_applications a
     where a.slug in ('d9-documents-write-cert', 'd9-documents-review-cert', 'd9-documents-write-scope-cert')
),
docs as (
    select d.id, d.org_id, d.created_at, d.metadata
      from public.documents d
     where d.metadata->>'source' = 'api_v1_upload'
       and d.metadata->'received_via'->>'application_id' in (select id::text from wapps)
),
ev as (
    select we.id, we.org_id, we.event_type, we.entity_id, we.created_at, we.payload
      from public.workflow_events we
     where we.event_type in ('document_version_reviewed', 'document_version_validity_set',
                             'document_subject_changed', 'document_unfiled_upload_escalated')
       and we.org_id in (select org_id from qa)
       and we.entity_id in (select id from docs)
),
bound as (
    -- review / validity
    select case when r.kind = 'review' then 'review' else 'validity' end as kind, r.document_id, r.org_id,
           r.created_at as effect_at, r.audit_event_id as audit_id,
           case when r.kind = 'review' then 'document_version_reviewed' else 'document_version_validity_set' end as event_type,
           jsonb_build_object('version_id', r.version_id::text, 'actor_kind', 'application') as must
      from public.document_version_review_events r
     where r.document_id in (select id from docs) and r.kind in ('review', 'validity')
    union all
    -- context link, except rows written inside an API filing's transaction (v1's link_in_filing, covered by the filing's id)
    select 'link', s.document_id, s.org_id, s.created_at, s.link_audit_event_id, 'document_subject_changed',
           jsonb_build_object('change', 'link', 'subject_id', s.subject_id::text, 'actor_kind', 'application')
      from public.document_subjects s join docs d on d.id = s.document_id
     where not s.is_primary
       and s.created_at is distinct from (d.metadata->'filing'->>'filed_at')::timestamptz
    union all
    select 'unlink', s.document_id, s.org_id, s.ended_at, s.unlink_audit_event_id, 'document_subject_changed',
           jsonb_build_object('change', 'unlink', 'subject_id', s.subject_id::text, 'actor_kind', 'application')
      from public.document_subjects s
     where s.document_id in (select id from docs) and not s.is_primary and s.ended_at is not null
    union all
    select 'escalation', (c.metadata->'api_upload_escalation'->>'document_id')::uuid, c.org_id, c.created_at,
           (c.metadata->'api_upload_escalation'->>'audit_event_id')::uuid, 'document_unfiled_upload_escalated',
           jsonb_build_object('actor_kind', 'system', 'actor_process', 'api_upload_escalation')
      from public.processing_cases c
     where c.metadata->'api_upload_escalation'->>'kind' = 'api_v1_unfiled_upload'
       and c.metadata->'api_upload_escalation'->>'document_id' in (select id::text from docs)
),
checked as (
    select b.*,
           b.audit_id is not null
           and exists (select 1 from ev e
                        where e.id = b.audit_id and e.org_id = b.org_id and e.entity_id = b.document_id
                          and e.event_type = b.event_type and e.payload @> b.must and e.created_at < b.effect_at)
           and (select count(*) from bound o where o.audit_id = b.audit_id) = 1 as ok
      from bound b
)
select question_id, kind, payload
from (
    select 'd9w_c1v2_effects_present'::text as question_id, 'check'::text as kind,
           'document_version_review_events ~ d9_write_review_effects ~ at_least_one ~ '
           || exists (select 1 from checked where kind = 'review')::text as payload,
           '01'::text as sort_key
    union all
    select 'd9w_c1v2_review_audit_id', 'check',
           'document_version_review_events ~ d9_write_review_or_validity_without_matching_stored_audit_id ~ zero ~ '
           || ((select count(*) from checked where kind in ('review', 'validity') and not ok) = 0)::text,
           '02'
    union all
    select 'd9w_c1v2_link_audit_id', 'check',
           'document_subjects ~ d9_write_link_or_unlink_without_matching_stored_audit_id ~ zero ~ '
           || ((select count(*) from checked where kind in ('link', 'unlink') and not ok) = 0)::text,
           '03'
    union all
    select 'd9w_c1v2_escalation_audit_id', 'check',
           'processing_cases ~ d9_write_escalation_without_matching_stored_audit_id ~ zero ~ '
           || ((select count(*) from checked where kind = 'escalation' and not ok) = 0)::text,
           '04'
    union all
    select 'd9w_c1v2_effects', 'data',
           coalesce((select json_object_agg(k.kind, json_build_object('examined', k.n, 'failed', k.bad))
                       from (select kind, count(*)::int as n, count(*) filter (where not ok)::int as bad
                               from checked group by kind) k), '{}'::json)::text,
           '05'
    union all
    select 'd9w_c1v2_failures', 'data',
           coalesce((select json_agg(json_build_object('kind', f.kind, 'document_id', f.document_id,
                                                       'effect_at', f.effect_at, 'audit_event_id', f.audit_id)
                                     order by f.effect_at, f.document_id)
                       from checked f where not f.ok), '[]'::json)::text,
           '06'
) q
order by sort_key;
