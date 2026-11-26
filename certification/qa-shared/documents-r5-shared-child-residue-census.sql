-- Documents R5 — SHARED-CHILD fixture ZERO_RESIDUE census (supplementary, read-only).
-- The registered 20-check census (documents-zero-residue-census.sql, 7957a51a…) measures aa000000- subjects but no
-- customer, child or participation, and nothing in the ac000000- namespace this fixture reserves. Until the plan owner
-- folds these checks into a re-pinned registered census, this file is read with database.read_census (from a NEW
-- execution run: the census dedupe is run-scoped) after qa_documents_shared_child_reset, as the R125 Forms census was.
--   ZERO: ac000000- households, children, participations, leads and work units, in EVERY organization (the namespace
--         is reserved, so a row anywhere is residue or a collision); form submissions and documents still naming a
--         fixture subject id.
--   RETAINED BY DESIGN: audit history (mutation_events / workflow_events) of the product lead deletions — reported as
--         data, never as residue. Only existing tables; no query names a table that may not exist.
select question_id, kind, payload
from (
    select 'r5sc_00'::text as question_id, 'data'::text as kind,
           json_build_object(
               'fixture', 'qa_documents_shared_child',
               'namespace', 'ac000000-',
               'qa_shared', '4acc9386-c485-486f-aa1f-05d83499d142',
               'cleanup', 'zero_residue'
           )::text as payload,
           '00'::text as sort_key
    union all
    select 'r5sc_households', 'check',
           'customers ~ ac000000_fixture ~ zero ~ '
           || ((select count(*) from public.customers x where x.id::text like 'ac000000-%') = 0)::text,
           '01'
    union all
    select 'r5sc_children', 'check',
           'customer_members ~ ac000000_fixture ~ zero ~ '
           || ((select count(*) from public.customer_members x where x.id::text like 'ac000000-%') = 0)::text,
           '02'
    union all
    select 'r5sc_participations', 'check',
           'opportunity_customer_members ~ ac000000_fixture ~ zero ~ '
           || ((select count(*) from public.opportunity_customer_members x
                 where x.id::text like 'ac000000-%'
                    or x.opportunity_id::text like 'ac000000-%'
                    or x.customer_member_id::text like 'ac000000-%') = 0)::text,
           '03'
    union all
    select 'r5sc_leads_work_units', 'check',
           'opportunities_work_units ~ ac000000_fixture ~ zero ~ '
           || (((select count(*) from public.opportunities x where x.id::text like 'ac000000-%')
              + (select count(*) from public.work_units x where x.id::text like 'ac000000-%')) = 0)::text,
           '04'
    union all
    select 'r5sc_submissions_on_fixture_subjects', 'check',
           'form_submissions ~ names_ac000000_subject ~ zero ~ '
           || ((select count(*) from public.form_submissions s
                 where s.customer_id::text like 'ac000000-%'
                    or s.customer_member_id::text like 'ac000000-%'
                    or s.opportunity_id::text like 'ac000000-%') = 0)::text,
           '05'
    union all
    select 'r5sc_documents_on_fixture_subjects', 'check',
           'documents ~ entity_ac000000 ~ zero ~ '
           || ((select count(*) from public.documents d where d.entity_id::text like 'ac000000-%') = 0)::text,
           '06'
    union all
    select 'r5sc_retained_audit', 'data',
           json_build_object(
               'artifact', 'lead deletion audit history',
               'status', 'retained_by_design',
               'not_residue', true,
               'qa_shared_mutation_event_rows', coalesce((
                 select count(*)::int from public.mutation_events me
                  where me.org_id = '4acc9386-c485-486f-aa1f-05d83499d142'::uuid
               ), 0)
           )::text,
           '07'
) q
order by sort_key;
