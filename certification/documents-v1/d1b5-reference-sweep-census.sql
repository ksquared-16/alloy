-- Documents V1 / D1b.5 (S3) -- whole-schema reference sweep for the stored objects with no documents row. READ-ONLY.
--
-- Director authorization: "SECURITY CONVERGENCE … S3 — prepare a reversible quarantine execution plan … verify references
-- across Documents, Forms, Processing, Vendors and other consumers" (2026-10-23).
--
-- Every text, varchar and jsonb column of every public table is searched for each unreferenced object's stored name.
-- That covers the full storage path and the final segment, which carries a UUID prefix and so is distinctive. The search
-- uses the same query_to_xml counting technique the certification baseline uses (one read-only count per column).
-- Emits only table, column and hit counts per object class. Never a name, path or value. Also re-states the set.
-- A positive-control class (five referenced objects) must hit, so a zero for the unreferenced classes is meaningful.
-- One statement; question_id | row_kind | payload(json).
with unref as (
    select o.id, o.name,
           regexp_replace(o.name, '^.*/', '') as basename,
           case when split_part(o.name, '/', 2) = 'opportunity' then 'opportunity'
                when split_part(o.name, '/', 1) = 'vendors' then 'legacy_vendor'
                else 'other' end as class
    from storage.objects o
    where o.bucket_id = 'org_documents'
      and not exists (select 1 from public.documents d where d.bucket = o.bucket_id and d.storage_path = o.name)
),
control as (
    -- POSITIVE CONTROL: five objects that ARE referenced by a documents row. Their names must be found (at least in
    -- documents.storage_path), or a zero for the unreferenced classes proves nothing about the search.
    select o.id, regexp_replace(o.name, '^.*/', '') as basename
    from storage.objects o
    where o.bucket_id = 'org_documents'
      and exists (select 1 from public.documents d where d.bucket = o.bucket_id and d.storage_path = o.name)
    order by o.created_at desc
    limit 5
),
needles as (
    select class, array_agg(basename) as names from unref group by class
    union all
    select 'positive_control', array_agg(basename) from control
),
cols as (
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')
),
hits as (
    select cols.table_name, cols.column_name, n.class,
           (xpath('/row/c/text()', query_to_xml(format(
               'select count(*) as c from public.%I where %I is not null and %I::text ~ %L',
               cols.table_name, cols.column_name, cols.column_name,
               '(' || array_to_string(array(select regexp_replace(x, '([.\[\]()*+?^$|\\{}-])', '\\\1', 'g') from unnest(n.names) x), '|') || ')'
           ), false, true, '')))[1]::text::bigint as c
    from cols cross join needles n
)
select question_id, 'data' as row_kind, payload
from (
    select 'r00_identity'::text as question_id,
           json_build_object(
               'objects_total', (select count(*) from storage.objects where bucket_id = 'org_documents'),
               'unreferenced', (select count(*) from unref),
               'by_class', (select json_object_agg(class, n) from (select class, count(*) n from unref group by class) s),
               'columns_searched', (select count(*) from cols)
           )::text as payload

    union all

    select 'r01_hit',
           json_build_object('table', h.table_name, 'column', h.column_name, 'class', h.class, 'rows', h.c)::text
    from hits h
    where h.c > 0
) census
order by question_id, payload
