-- Documents V1 / D0 -- deployed document volume census. READ-ONLY, aggregate counts only.
--
-- Director authorization: "AUTHORIZE GOVERNED READ-ONLY CENSUS" (D0 closure, 2026-10-20).
-- Sizes the D2 backfill (documents -> versions + associations) and its compatibility risks.
--
-- Emits NO titles, file names, storage paths, metadata bodies, extracted_text / extracted_data
-- (OCR) or ids. Free-text vocabularies (doc_type, processing_intent, version_role, path segment)
-- are emitted only when they match a structural token pattern; anything else is '<freeform>'.
--
-- Tables created after the 2026-03-29 baseline are counted through query_to_xml behind a
-- to_regclass guard, so a table absent on this database answers null instead of failing the
-- whole statement at parse time. Baseline tables (documents, document_versions,
-- document_field_*, vendors, orgs) and processing_cases/_sources (already read on this target by
-- certification/work-items-convergence/h-virtual-source-census.sql) are referenced directly.
--
-- v00 is unconditional (org and table totals), so an all-zero answer cannot be a wrong target.
-- Output obeys the trusted-host parser: question_id | row_kind | payload(json).
select question_id, 'data' as row_kind, payload
from (
    select 'v00_totals'::text as question_id,
           json_build_object(
               'ledger_head', (select max(version) from supabase_migrations.schema_migrations),
               'orgs_total', (select count(*) from public.orgs),
               'orgs_with_documents', (select count(distinct org_id) from public.documents),
               'documents_total', (select count(*) from public.documents),
               'documents_bytes', (select coalesce(sum(byte_size), 0) from public.documents),
               'documents_null_storage_path', (select count(*) from public.documents where storage_path is null),
               'documents_null_bucket', (select count(*) from public.documents where bucket is null),
               'documents_null_checksum', (select count(*) from public.documents where checksum_sha256 is null),
               'documents_public_url_set', (select count(*) from public.documents where public_url is not null),
               'documents_owner_contact_set', (select count(*) from public.documents where owner_contact_id is not null),
               'documents_generated_from_set', (select count(*) from public.documents where generated_from_document_id is not null),
               'documents_template_key_set', (select count(*) from public.documents where template_key is not null),
               'duplicate_checksum_groups', (select count(*) from (select 1 from public.documents where checksum_sha256 is not null group by org_id, checksum_sha256 having count(*) > 1) x),
               'documents_in_duplicate_groups', (select coalesce(sum(n), 0) from (select count(*) as n from public.documents where checksum_sha256 is not null group by org_id, checksum_sha256 having count(*) > 1) x),
               'document_versions_total', (select count(*) from public.document_versions),
               'document_versions_distinct_documents', (select count(distinct document_id) from public.document_versions),
               'document_field_definitions_total', (select count(*) from public.document_field_definitions),
               'document_field_values_total', (select count(*) from public.document_field_values),
               'oldest_document', (select min(created_at)::date from public.documents),
               'newest_document', (select max(created_at)::date from public.documents)
           )::text as payload

    union all

    select 'v01_by_entity_bucket_status'::text,
           json_build_object(
               'entity_type', g.entity_type,
               'bucket', g.bucket,
               'status', g.status,
               'documents', g.n,
               'orgs', g.orgs,
               'bytes', g.bytes,
               'null_entity_id', g.null_entity_id,
               'null_checksum', g.null_checksum
           )::text
    from (
        select coalesce(case when d.entity_type ~ '^[a-z_]{1,40}$' then d.entity_type else '<freeform>' end, '<null>') as entity_type,
               coalesce(case when d.bucket ~ '^[a-z_-]{1,40}$' then d.bucket else '<freeform>' end, '<null>') as bucket,
               coalesce(case when d.status ~ '^[a-z_]{1,40}$' then d.status else '<freeform>' end, '<null>') as status,
               count(*) as n,
               count(distinct d.org_id) as orgs,
               coalesce(sum(d.byte_size), 0) as bytes,
               count(*) filter (where d.entity_id is null) as null_entity_id,
               count(*) filter (where d.checksum_sha256 is null) as null_checksum
        from public.documents d
        group by 1, 2, 3
    ) g

    union all

    select 'v02_by_doc_type'::text,
           json_build_object(
               'doc_type', g.doc_type,
               'documents', g.n,
               'orgs', g.orgs
           )::text
    from (
        select coalesce(case when d.doc_type ~ '^[a-z0-9_.-]{1,64}$' then d.doc_type else '<freeform>' end, '<null>') as doc_type,
               count(*) as n,
               count(distinct d.org_id) as orgs
        from public.documents d
        group by 1
    ) g

    union all

    select 'v03_pos_intake'::text,
           json_build_object(
               'entity_type_null', g.entity_null,
               'case_status', g.case_status,
               'processing_intent', g.intent,
               'documents', g.n
           )::text
    from (
        select i.entity_null, i.case_status, i.intent, count(*) as n
        from (
            select (d.entity_type is null) as entity_null,
                   coalesce((select pc.status
                             from public.processing_case_sources s
                             join public.processing_cases pc on pc.id = s.processing_case_id
                             where s.source_id = d.id and s.org_id = d.org_id
                             order by pc.created_at desc
                             limit 1), '<no_case>') as case_status,
                   coalesce(case when (d.metadata ->> 'processing_intent') ~ '^[a-z_]{1,40}$' then d.metadata ->> 'processing_intent' else '<freeform>' end, '<null>') as intent
            from public.documents d
            where d.storage_path like '%/pos_intake/%'
        ) i
        group by 1, 2, 3
    ) g

    union all

    select 'v04_storage_reconciliation'::text,
           json_build_object(
               'bucket', g.bucket,
               'documents_with_path', g.with_path,
               'object_found_same_bucket', g.found_same,
               'object_found_any_bucket', g.found_any,
               'object_missing', g.with_path - g.found_any
           )::text
    from (
        select coalesce(d.bucket, '<null>') as bucket,
               count(*) as with_path,
               count(*) filter (where exists (select 1 from storage.objects o where o.bucket_id = d.bucket and o.name = d.storage_path)) as found_same,
               count(*) filter (where exists (select 1 from storage.objects o where o.name = d.storage_path)) as found_any
        from public.documents d
        where d.storage_path is not null
        group by 1
    ) g

    union all

    select 'v05_objects_without_document'::text,
           json_build_object(
               'bucket', g.bucket_id,
               'objects', g.n,
               'objects_without_document_row', g.orphans
           )::text
    from (
        select o.bucket_id,
               count(*) as n,
               count(*) filter (where not exists (select 1 from public.documents d where d.storage_path = o.name)) as orphans
        from storage.objects o
        where o.bucket_id in ('org_documents', 'vendor_documents')
        group by o.bucket_id
    ) g

    union all

    select 'v06_path_org_prefix'::text,
           json_build_object(
               'bucket', g.bucket,
               'seg1_matches_org', g.matches,
               'seg1_other', g.other,
               'seg1_word', g.seg1_word
           )::text
    from (
        select coalesce(d.bucket, '<null>') as bucket,
               count(*) filter (where split_part(d.storage_path, '/', 1) = d.org_id::text) as matches,
               count(*) filter (where split_part(d.storage_path, '/', 1) <> d.org_id::text) as other,
               case when split_part(d.storage_path, '/', 1) = d.org_id::text then '<org_id>'
                    when split_part(d.storage_path, '/', 1) ~ '^[a-z_]{1,40}$' then split_part(d.storage_path, '/', 1)
                    else '<other>' end as seg1_word
        from public.documents d
        where d.storage_path is not null
        group by 1, 4
    ) g

    union all

    select 'v07_version_role'::text,
           json_build_object(
               'version_role', g.role,
               'source', g.src,
               'documents', g.n
           )::text
    from (
        select coalesce(case when (d.metadata ->> 'version_role') ~ '^[a-z_]{1,40}$' then d.metadata ->> 'version_role' else '<freeform>' end, '<null>') as role,
               coalesce(case when (d.metadata ->> 'source') ~ '^[a-z0-9_]{1,40}$' then d.metadata ->> 'source' else '<freeform>' end, '<null>') as src,
               count(*) as n
        from public.documents d
        group by 1, 2
    ) g

    union all

    select 'v08_dependents'::text,
           json_build_object(
               'vendors_insurance_doc', (select count(*) from public.vendors where insurance_doc_file_id is not null),
               'vendors_drivers_license_doc', (select count(*) from public.vendors where drivers_license_doc_file_id is not null),
               'staff_qualification_evidence', case when to_regclass('public.staff_qualification_evidence') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.staff_qualification_evidence', false, true, '')))[1]::text::bigint end,
               'safeguarding_evidence_document', case when to_regclass('public.child_safeguarding_restrictions') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.child_safeguarding_restrictions where evidence_document_id is not null', false, true, '')))[1]::text::bigint end,
               'signature_drawn_asset', case when to_regclass('public.form_submission_signatures') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.form_submission_signatures where drawn_asset_document_id is not null', false, true, '')))[1]::text::bigint end,
               'fsd_total', case when to_regclass('public.form_submission_documents') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.form_submission_documents', false, true, '')))[1]::text::bigint end,
               'fsd_generated_pdf', case when to_regclass('public.form_submission_documents') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.form_submission_documents where role = ''generated_pdf''', false, true, '')))[1]::text::bigint end,
               'fsd_signature_asset', case when to_regclass('public.form_submission_documents') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.form_submission_documents where role = ''signature_asset''', false, true, '')))[1]::text::bigint end,
               'fsd_upload', case when to_regclass('public.form_submission_documents') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.form_submission_documents where role = ''upload''', false, true, '')))[1]::text::bigint end,
               'fsd_other', case when to_regclass('public.form_submission_documents') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.form_submission_documents where role = ''other''', false, true, '')))[1]::text::bigint end,
               'subsidy_authorization_source_doc', case when to_regclass('public.financial_subsidy_authorizations') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.financial_subsidy_authorizations where source_document_id is not null', false, true, '')))[1]::text::bigint end,
               'subsidy_remittance_source_doc', case when to_regclass('public.financial_subsidy_remittances') is null then null else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.financial_subsidy_remittances where source_document_id is not null', false, true, '')))[1]::text::bigint end,
               'processing_sources_document', (select count(*) from public.processing_case_sources where source_kind = 'document'),
               'processing_sources_by_kind', (select json_object_agg(k, n) from (select source_kind as k, count(*) as n from public.processing_case_sources group by 1) x)
           )::text
) census
order by question_id, payload
