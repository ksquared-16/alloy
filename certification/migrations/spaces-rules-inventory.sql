select 'spaces_rules_inventory' as question_id, 'row' as kind,
  json_build_object(
    'ratio_rules', (
      select coalesce(json_agg(json_build_object(
          'id', r.id, 'scope', r.scope_type,
          'site', (select l.label from public.locations l where l.id = r.site_location_id),
          'room', (select l.label from public.locations l where l.id = r.room_location_id),
          'room_role', (select coalesce(l.unit_role,'(null)') from public.locations l where l.id = r.room_location_id),
          'program', (select c.label from public.location_program_categories c where c.id = r.program_category_id),
          'age_group', r.age_group_key,
          'effective_start', r.effective_start::text, 'effective_end', r.effective_end::text,
          'tiers', (select coalesce(json_agg(json_build_object(
                'required_staff', t.required_staff, 'max_children', t.max_children, 'sort', t.sort_order)
              order by t.sort_order),'[]'::json)
            from public.childcare_ratio_rule_tiers t where t.ratio_rule_id = r.id))
        order by r.effective_start),'[]'::json)
      from public.childcare_ratio_rules r),
    'counts', json_build_object(
      'capacity_rules', (select count(*) from public.childcare_capacity_rules),
      'ratio_rules', (select count(*) from public.childcare_ratio_rules),
      'ratio_tiers', (select count(*) from public.childcare_ratio_rule_tiers),
      'operating_windows', (select count(*) from public.childcare_operating_windows),
      'schedule_rules', (select count(*) from public.childcare_schedule_rules)),
    'scope_distribution', (
      select coalesce(json_agg(x order by x->>'family', x->>'scope'),'[]'::json) from (
        select json_build_object('family','capacity','scope',scope_type,'rows',count(*)) x
          from public.childcare_capacity_rules group by scope_type
        union all
        select json_build_object('family','ratio','scope',scope_type,'rows',count(*))
          from public.childcare_ratio_rules group by scope_type
        union all
        select json_build_object('family','operating_window','scope',scope_type,'rows',count(*))
          from public.childcare_operating_windows group by scope_type
        union all
        select json_build_object('family','schedule','scope',scope_type,'rows',count(*))
          from public.childcare_schedule_rules group by scope_type) s),
    'closed_versions', json_build_object(
      'capacity_closed', (select count(*) from public.childcare_capacity_rules where effective_end is not null),
      'ratio_closed', (select count(*) from public.childcare_ratio_rules where effective_end is not null)),
    'program_categories', (
      select coalesce(json_agg(json_build_object('id', c.id, 'label', c.label, 'key', c.key) order by c.label),'[]'::json)
      from public.location_program_categories c),
    'observed_at', now()::text)::text as payload;
