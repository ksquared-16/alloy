-- P3 KEEP-CODE items: does a fresh migration chain deliver them? (permission_keys and permissions no longer exist: dropped by 20260729120000.)
select 'K1 permission_definitions', count(*) from permission_definitions
union all select 'K2 fn seed_default_role_definitions', count(*) from pg_proc where proname='seed_default_role_definitions'
union all select 'K3 action_definitions', (select count(*) from action_definitions)
union all select 'K3 action_placements', (select count(*) from action_placements)
union all select 'K4 metric_definitions', (select count(*) from metric_definitions)
union all select 'K4 metric_placements', (select count(*) from metric_placements)
union all select 'K4 metric_visualizations', (select count(*) from metric_visualizations)
union all select 'K5 status_definitions', (select count(*) from status_definitions)
union all select 'K6 industry_default_entity_labels', (select count(*) from industry_default_entity_labels)
union all select 'K6 entity_layouts (org_id null)', (select count(*) from entity_layouts where org_id is null)
union all select 'K6 record_layouts', (select count(*) from record_layouts)
union all select 'K7 customer_person_role_types', (select count(*) from customer_person_role_types);
