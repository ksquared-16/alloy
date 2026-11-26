-- Documents D9-H2: are the write-proof preconditions P4 and P5 (D9-2-3-HOSTED-QA-PLAN.md §1) met on the deployed primary?
-- Read-only, catalog only (pg_proc via to_regprocedure, and the migration ledger). It reads no application rows.
--   CHECKS
--     d9w_p4_document_archive_fn      public.document_archive(uuid,uuid,text,text,uuid,uuid) exists   (20261217090000)
--     d9w_p4_document_unarchive_fn    public.document_unarchive(uuid,uuid,text,uuid,uuid) exists      (20261217090000)
--     d9w_p4_ledger_20261217090000    the version is on supabase_migrations.schema_migrations
--     d9w_p5_open_case_atomic_fn      public.open_processing_case_with_primary_source(uuid,text,uuid,text) exists (20261215093000)
--     d9w_p5_ledger_20261215093000    the version is on supabase_migrations.schema_migrations
--   The ledger rows are read separately because an apply may not write the ledger: a function present with its
--   version absent is a ledger gap, not a missing migration.
--   DATA d9w_ledger_head: the highest ledger version and the row count.
select question_id, kind, payload
from (
    select 'd9w_p4_document_archive_fn'::text as question_id, 'check'::text as kind,
           'pg_proc ~ document_archive_6arg ~ present ~ '
           || (to_regprocedure('public.document_archive(uuid,uuid,text,text,uuid,uuid)') is not null)::text as payload,
           '01'::text as sort_key
    union all
    select 'd9w_p4_document_unarchive_fn', 'check',
           'pg_proc ~ document_unarchive_5arg ~ present ~ '
           || (to_regprocedure('public.document_unarchive(uuid,uuid,text,uuid,uuid)') is not null)::text,
           '02'
    union all
    select 'd9w_p4_ledger_20261217090000', 'check',
           'schema_migrations ~ 20261217090000 ~ present ~ '
           || exists (select 1 from supabase_migrations.schema_migrations where version = '20261217090000')::text,
           '03'
    union all
    select 'd9w_p5_open_case_atomic_fn', 'check',
           'pg_proc ~ open_processing_case_with_primary_source_4arg ~ present ~ '
           || (to_regprocedure('public.open_processing_case_with_primary_source(uuid,text,uuid,text)') is not null)::text,
           '04'
    union all
    select 'd9w_p5_ledger_20261215093000', 'check',
           'schema_migrations ~ 20261215093000 ~ present ~ '
           || exists (select 1 from supabase_migrations.schema_migrations where version = '20261215093000')::text,
           '05'
    union all
    select 'd9w_ledger_head', 'data',
           (select json_build_object('head', max(version), 'rows', count(*)) from supabase_migrations.schema_migrations)::text,
           '06'
) q
order by sort_key;
