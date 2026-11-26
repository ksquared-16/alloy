-- Catalog only. Which columns these tables actually carry, so the Phase 0 data census
-- asks for fields that exist rather than fields I assumed. READ ONLY.
select 'cols' as question_id, 'row' as kind,
  json_build_object('tables', (select json_agg(t)
    from (
      select json_build_object(
        'table', c.relname,
        'columns', (select json_agg(a.attname order by a.attname)
                    from pg_attribute a
                    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)) as t
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('charges','financial_responsibility_allocations','qa_director_acceptance_results')
    ) s))::text as payload;
