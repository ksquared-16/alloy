-- Read-only census: is the document_field_definitions subsystem adopted, or designed and never wired?
--
-- Three role-title gates sit on POST/PATCH/DELETE /api/admin/document-field-definitions. The model is
-- a per-org, per-doc_type extraction schema - field_key, field_label, field_type, is_required,
-- is_ai_extractable, extraction_hint - with a companion document_field_values table holding what was
-- captured against a document.
--
-- Source says it has no runtime: outside its own two routes, NOTHING in web/lib or web/app/api reads
-- document_field_definitions, against 136 files that read the canonical field_definitions. The only
-- lib reference to document_field_values is a cascade delete when an opportunity lead is removed.
-- The authoring UI is a legacy client, mounted at an adminV2 path whose nav entry is filtered out by
-- advanced: true - the same shape the Departments census found.
--
-- So the question is whether the deployed tenants ever used it. A definition with no values is a
-- schema nobody captured against; values with no definition id would mean the definitions are not
-- even the authority for what was captured.
--
-- Counts, dates and booleans only; no tenant-authored labels or captured values are read.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
select question_id, kind, payload
from (
    select 'definitions'::text, 'summary'::text,
           ('rows=' || count(*)::text
            || ' orgs=' || count(distinct org_id)::text
            || ' doc_types=' || count(distinct doc_type)::text
            || ' required=' || count(*) filter (where is_required)::text
            || ' ai_extractable=' || count(*) filter (where is_ai_extractable)::text
            || ' first=' || coalesce(min(created_at)::date::text,'none')
            || ' last_created=' || coalesce(max(created_at)::date::text,'none')
            || ' last_updated=' || coalesce(max(updated_at)::date::text,'never'))::text,
           'a1'::text
    from public.document_field_definitions

    union all
    -- THE DECISIVE ONE. A definition nobody has ever captured a value against is a schema with no use.
    select 'values'::text, 'decisive'::text,
           ('rows=' || count(*)::text
            || ' orgs=' || count(distinct org_id)::text
            || ' with_definition_id=' || count(*) filter (where field_definition_id is not null)::text
            || ' orphaned_by_key_only=' || count(*) filter (where field_definition_id is null)::text
            || ' first=' || coalesce(min(created_at)::date::text,'none')
            || ' last=' || coalesce(max(created_at)::date::text,'none'))::text,
           'b1'::text
    from public.document_field_values

    union all
    -- How many definitions have ever been referenced by a captured value?
    select 'definitions_used'::text, 'decisive'::text,
           ('definitions=' || (select count(*) from public.document_field_definitions)::text
            || ' referenced_by_a_value=' || (
                 select count(*) from public.document_field_definitions d
                  where exists (select 1 from public.document_field_values v
                                 where v.field_definition_id = d.id))::text)::text,
           'b2'::text

    union all
    -- Context: does the tenant have documents at all? A zero here would make the whole area moot.
    select 'document_context'::text, 'context'::text,
           ('documents=' || (select count(*) from public.documents)::text
            || ' distinct_doc_types_on_documents=' || (
                 select count(distinct doc_type) from public.documents where doc_type is not null)::text)::text,
           'c1'::text

    union all
    -- The canonical peer, for contrast: the Field System everything else uses.
    select 'canonical_peer'::text, 'context'::text,
           ('field_definitions=' || (select count(*) from public.field_definitions)::text)::text,
           'c2'::text

    union all
    -- PROBE 1: where does a definition identity appear, and is it required?
    select 'not_null_probe'::text, 'probe'::text,
           (coalesce(string_agg(table_name || '.' || column_name || '=' || is_nullable, ' ~ ' order by table_name), 'none'))::text,
           'd1'::text
    from information_schema.columns
    where table_schema='public' and column_name in ('field_definition_id','document_field_definition_id')

    union all
    select 'nonvacuity'::text, 'guard'::text,
           ('definitions_table=' || (to_regclass('public.document_field_definitions') is not null)::text
            || ' values_table=' || (to_regclass('public.document_field_values') is not null)::text
            || ' orgs=' || (select count(*) from public.orgs)::text)::text,
           'zz0'::text
) q(question_id, kind, payload, sort_key)
order by sort_key;
