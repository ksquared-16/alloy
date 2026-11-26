select 'ratio_config' as question_id, 'row' as kind,
  json_build_object(
    'ratio_tables', (select coalesce(json_agg(json_build_object(
            'table', t.table_name,
            'columns', (select coalesce(json_agg(c.column_name order by c.ordinal_position),'[]'::json)
                        from information_schema.columns c
                        where c.table_schema='public' and c.table_name=t.table_name)
        ) order by t.table_name),'[]'::json)
        from information_schema.tables t
        where t.table_schema='public' and t.table_name like '%ratio%'),
    'row_counts', (select coalesce(json_object_agg(x.t, x.n),'{}'::json) from (
        select 'childcare_ratio_rules' as t, (select count(*) from public.childcare_ratio_rules) as n
        union all
        select 'childcare_ratio_rule_tiers', (select count(*) from public.childcare_ratio_rule_tiers)
    ) x),
    'observed_at', now()::text)::text as payload;
