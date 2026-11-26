-- Documents D9-H2, plan case W-C1 ("every write is in a QA org; every effect has its audit row written first"):
-- read-only census of the D9.2 / D9.3 write effects and their audit. Plan: D9-2-3-HOSTED-QA-PLAN.md §4 W-C1, §5.
-- Run order: D9-H2-HOSTED-RUN-ORDER.md step 7. A generic database.read_census (alloy_deployed_primary). Not the
-- registered residue census (d9-residue-census.sql e7e8d3d1…) and never attached to a close.
--
-- WHEN: after the driver's `certify` and BEFORE its `cleanup`. The effect rows live on the run's documents
-- (documents.metadata, document_subjects, document_version_review_events), which cleanup deletes. Read after cleanup,
-- the linkage checks pass vacuously; `d9w_c1_effects` reports how many effects each check examined, so a vacuous
-- reading is visible, and `d9w_c1_effects_present` turns false.
--
-- HOW AN EFFECT IS TIED TO ITS AUDIT ROW (served code, staging 5db26b46):
--   upload    documents.metadata.upload_audit_event_id            → workflow_events document_upload_authorized   (id link)
--   filing    documents.metadata.filing.audit_event_id             → document_filing_authorized                   (id link)
--   archive   documents.metadata.archive.audit_event_id            → document_archived                            (id link)
--   restore   documents.metadata.archive.restore_audit_event_id    → document_restored                            (id link)
--   review    document_version_review_events kind 'review'         → document_version_reviewed, same document and
--             payload version_id, created no later than the effect                                    (NO id link)
--   validity  document_version_review_events kind 'validity'       → document_version_validity_set, likewise  (NO id link)
--   link      document_subjects non-primary row created_at / ended_at → document_subject_changed change link /
--             unlink, same document and subject_id, created no later than the effect                (NO id link)
--   escalate  processing_cases.metadata.api_upload_escalation.document_id → document_unfiled_upload_escalated on that
--             document, created no later than the case                                               (NO id link)
-- Every timestamp compared here is the database's own now() (one clock), and the audit row is committed before the
-- effect's transaction starts, so "audit.created_at <= effect time" is request happens-before, not a cross-clock
-- comparison. For the id-linked effects the id link is the proof; the timestamp is checked as well.
--
--   CHECKS (true for every D9 write run; retained history of earlier runs cannot turn them false):
--     d9w_c1_effects_present          at least one write-app upload, filing and review effect exists (step 7 ran
--                                     between certify and cleanup)
--     d9w_c1_effects_in_qa_orgs       every write-app document effect is in qa_shared / qa_secondary
--     d9w_c1_tagged_documents_in_qa   every qa-d9w document is in a QA org
--     d9w_c1_events_in_qa_orgs        no workflow_events row names a D9 write application outside the QA orgs
--     d9w_c1_security_audit_in_qa     no app_security_audit row or installation of a D9 write application outside the QA orgs
--     d9w_c1_upload_audit_first       every write-app upload names its document_upload_authorized row: same org, same
--                                     document, same installation, created no later than the document
--     d9w_c1_filing_audit_first       every API filing names its document_filing_authorized row, same org/document,
--                                     application actor, created no later than filed_at
--     d9w_c1_archive_audit_first      every archive and restore of a write-app document names its audit row, created first
--     d9w_c1_review_audit_first       every review / validity event on a write-app document has an earlier matching
--                                     audit row (same document, same version)
--     d9w_c1_link_audit_first         every context link / unlink on a write-app document has an earlier matching audit row
--     d9w_c1_escalation_audit_first   every escalation case for a write-app upload has an earlier escalation audit row
--   DATA d9w_c1_effects: per effect kind, how many were examined and how many failed.
--   DATA d9w_c1_failures: the failing effects (kind, document id, effect time, audit id or null). Ids and times only.
-- The aged-upload fixture row (metadata.fixture_family 'documents_d9_aged_upload') carries no upload audit id by
-- design (no audit row is forged), so it is excluded from the upload check only; its escalation and filing are checked.
-- Selects only by the two QA org ids, the D9 application slugs and the qa-d9w tag. No PII column, no secret.
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
     where we.event_type in ('document_upload_authorized', 'document_filing_authorized', 'document_archived',
                             'document_restored', 'document_version_reviewed', 'document_version_validity_set',
                             'document_subject_changed', 'document_unfiled_upload_escalated')
       and we.org_id in (select org_id from qa)
       and we.entity_id in (select id from docs)
),
effects as (
    -- upload
    select 'upload'::text as kind, d.id as document_id, d.org_id, d.created_at as effect_at,
           d.metadata->>'upload_audit_event_id' as audit_id,
           exists (select 1 from ev e
                    where e.id::text = d.metadata->>'upload_audit_event_id'
                      and e.event_type = 'document_upload_authorized' and e.org_id = d.org_id and e.entity_id = d.id
                      and e.payload->>'actor_installation_id' = d.metadata->'received_via'->>'installation_id'
                      and e.created_at <= d.created_at) as ok
      from docs d
     where coalesce(d.metadata->>'fixture_family', '') <> 'documents_d9_aged_upload'
    union all
    -- filing through the API (the filing key is ext:<installation>:<Idempotency-Key>)
    select 'filing', d.id, d.org_id, (d.metadata->'filing'->>'filed_at')::timestamptz,
           d.metadata->'filing'->>'audit_event_id',
           exists (select 1 from ev e
                    where e.id::text = d.metadata->'filing'->>'audit_event_id'
                      and e.event_type = 'document_filing_authorized' and e.org_id = d.org_id and e.entity_id = d.id
                      and e.payload->>'actor_kind' = 'application'
                      and e.created_at <= (d.metadata->'filing'->>'filed_at')::timestamptz)
      from docs d
     where d.metadata ? 'filing' and d.metadata->'filing'->>'key' like 'ext:%'
    union all
    -- archive
    select 'archive', d.id, d.org_id, (d.metadata->'archive'->>'archived_at')::timestamptz,
           d.metadata->'archive'->>'audit_event_id',
           exists (select 1 from ev e
                    where e.id::text = d.metadata->'archive'->>'audit_event_id'
                      and e.event_type = 'document_archived' and e.org_id = d.org_id and e.entity_id = d.id
                      and e.created_at <= (d.metadata->'archive'->>'archived_at')::timestamptz)
      from docs d
     where d.metadata ? 'archive'
    union all
    -- staff restore
    select 'restore', d.id, d.org_id, (d.metadata->'archive'->>'restored_at')::timestamptz,
           d.metadata->'archive'->>'restore_audit_event_id',
           exists (select 1 from ev e
                    where e.id::text = d.metadata->'archive'->>'restore_audit_event_id'
                      and e.event_type = 'document_restored' and e.org_id = d.org_id and e.entity_id = d.id
                      and e.created_at <= (d.metadata->'archive'->>'restored_at')::timestamptz)
      from docs d
     where d.metadata->'archive' ? 'restored_at'
    union all
    -- review and validity events (no stored audit id)
    select case when r.kind = 'review' then 'review' else 'validity' end, r.document_id, r.org_id, r.created_at, null,
           exists (select 1 from ev e
                    where e.event_type = case when r.kind = 'review' then 'document_version_reviewed' else 'document_version_validity_set' end
                      and e.org_id = r.org_id and e.entity_id = r.document_id
                      and e.payload->>'version_id' = r.version_id::text
                      and e.created_at <= r.created_at)
      from public.document_version_review_events r
     where r.document_id in (select id from docs) and r.kind in ('review', 'validity')
    union all
    -- context link (row created) and unlink (row ended)
    select 'link', s.document_id, s.org_id, s.created_at, null,
           exists (select 1 from ev e
                    where e.event_type = 'document_subject_changed' and e.payload->>'change' = 'link'
                      and e.org_id = s.org_id and e.entity_id = s.document_id
                      and e.payload->>'subject_id' = s.subject_id::text and e.created_at <= s.created_at)
      from public.document_subjects s
     where s.document_id in (select id from docs) and not s.is_primary
    union all
    select 'unlink', s.document_id, s.org_id, s.ended_at, null,
           exists (select 1 from ev e
                    where e.event_type = 'document_subject_changed' and e.payload->>'change' = 'unlink'
                      and e.org_id = s.org_id and e.entity_id = s.document_id
                      and e.payload->>'subject_id' = s.subject_id::text and e.created_at <= s.ended_at)
      from public.document_subjects s
     where s.document_id in (select id from docs) and not s.is_primary and s.ended_at is not null
    union all
    -- 24 h escalation case
    select 'escalation', (c.metadata->'api_upload_escalation'->>'document_id')::uuid, c.org_id, c.created_at, null,
           exists (select 1 from ev e
                    where e.event_type = 'document_unfiled_upload_escalated' and e.org_id = c.org_id
                      and e.entity_id::text = c.metadata->'api_upload_escalation'->>'document_id'
                      and e.created_at <= c.created_at)
      from public.processing_cases c
     where c.metadata->'api_upload_escalation'->>'kind' = 'api_v1_unfiled_upload'
       and c.metadata->'api_upload_escalation'->>'document_id' in (select id::text from docs)
)
select question_id, kind, payload
from (
    select 'd9w_c1_effects_present'::text as question_id, 'check'::text as kind,
           'documents ~ d9_write_app_upload_filing_review_effects ~ at_least_one_each ~ '
           || (exists (select 1 from effects where kind = 'upload')
               and exists (select 1 from effects where kind = 'filing')
               and exists (select 1 from effects where kind = 'review'))::text as payload,
           '01'::text as sort_key
    union all
    select 'd9w_c1_effects_in_qa_orgs', 'check',
           'documents ~ d9_write_app_effects_outside_qa_orgs ~ zero ~ '
           || ((select count(*) from effects where org_id not in (select org_id from qa)) = 0
               and (select count(*) from docs where org_id not in (select org_id from qa)) = 0)::text,
           '02'
    union all
    select 'd9w_c1_tagged_documents_in_qa', 'check',
           'documents ~ qa_d9w_tagged_outside_qa_orgs ~ zero ~ '
           || ((select count(*) from public.documents d
                 where (d.title ilike '%qa-d9w-%' or d.original_filename ilike '%qa-d9w-%' or d.storage_path ilike '%qa-d9w-%')
                   and d.org_id not in (select org_id from qa)) = 0)::text,
           '03'
    union all
    select 'd9w_c1_events_in_qa_orgs', 'check',
           'workflow_events ~ d9_write_application_actor_outside_qa_orgs ~ zero ~ '
           || ((select count(*) from public.workflow_events we
                 where we.payload->>'actor_application_id' in (select id::text from wapps)
                   and we.org_id not in (select org_id from qa)) = 0)::text,
           '04'
    union all
    select 'd9w_c1_security_audit_in_qa', 'check',
           'app_security_audit_installations ~ d9_write_applications_outside_qa_orgs ~ zero ~ '
           || (((select count(*) from public.app_security_audit sa
                  where sa.application_id in (select id from wapps)
                    and sa.org_id is not null and sa.org_id not in (select org_id from qa))
              + (select count(*) from public.app_installations i
                  where i.application_id in (select id from wapps) and i.org_id not in (select org_id from qa))) = 0)::text,
           '05'
    union all
    select 'd9w_c1_upload_audit_first', 'check',
           'documents ~ d9_write_upload_without_prior_audit ~ zero ~ '
           || ((select count(*) from effects where kind = 'upload' and not ok) = 0)::text,
           '06'
    union all
    select 'd9w_c1_filing_audit_first', 'check',
           'documents ~ d9_write_filing_without_prior_audit ~ zero ~ '
           || ((select count(*) from effects where kind = 'filing' and not ok) = 0)::text,
           '07'
    union all
    select 'd9w_c1_archive_audit_first', 'check',
           'documents ~ d9_write_archive_or_restore_without_prior_audit ~ zero ~ '
           || ((select count(*) from effects where kind in ('archive', 'restore') and not ok) = 0)::text,
           '08'
    union all
    select 'd9w_c1_review_audit_first', 'check',
           'document_version_review_events ~ d9_write_review_or_validity_without_prior_audit ~ zero ~ '
           || ((select count(*) from effects where kind in ('review', 'validity') and not ok) = 0)::text,
           '09'
    union all
    select 'd9w_c1_link_audit_first', 'check',
           'document_subjects ~ d9_write_link_or_unlink_without_prior_audit ~ zero ~ '
           || ((select count(*) from effects where kind in ('link', 'unlink') and not ok) = 0)::text,
           '10'
    union all
    select 'd9w_c1_escalation_audit_first', 'check',
           'processing_cases ~ d9_write_escalation_without_prior_audit ~ zero ~ '
           || ((select count(*) from effects where kind = 'escalation' and not ok) = 0)::text,
           '11'
    union all
    select 'd9w_c1_effects', 'data',
           coalesce((select json_object_agg(k.kind, json_build_object('examined', k.n, 'failed', k.bad))
                       from (select kind, count(*)::int as n, count(*) filter (where not ok)::int as bad
                               from effects group by kind) k), '{}'::json)::text,
           '12'
    union all
    select 'd9w_c1_failures', 'data',
           coalesce((select json_agg(json_build_object('kind', f.kind, 'document_id', f.document_id,
                                                       'effect_at', f.effect_at, 'audit_event_id', f.audit_id)
                                     order by f.effect_at, f.document_id)
                       from effects f where not f.ok), '[]'::json)::text,
           '13'
) q
order by sort_key;
