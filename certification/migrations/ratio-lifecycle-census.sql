select 'ratio_lifecycle_census' as question_id, 'row' as kind,
  json_build_object(
    'spaces', (
      select coalesce(json_agg(x order by x->>'site', x->>'space'),'[]'::json) from (
        select json_build_object(
          'org_id', l.org_id,
          'site', (select p.label from public.locations p where p.id = l.parent_location_id),
          'space_id', l.id,
          'space', l.label,
          'role', coalesce(l.unit_role,'(null=>operational_group)'),
          'legacy', l.metadata->>'student_teacher_ratio',
          'rule_id', r.id,
          'rule_start', r.effective_start::text,
          'rule_end', r.effective_end::text,
          'in_force', (r.id is not null
                       and r.effective_start <= current_date
                       and (r.effective_end is null or r.effective_end >= current_date)),
          'authored_via', r.metadata->>'authored_via',
          'rule_metadata', r.metadata,
          'canonical_tiers', (
            select coalesce(json_agg(t.required_staff || ':' || t.max_children order by t.sort_order),'[]'::json)
            from public.childcare_ratio_rule_tiers t where t.ratio_rule_id = r.id)
        ) as x
        from public.locations l
        left join lateral (
          select r2.* from public.childcare_ratio_rules r2
          where r2.room_location_id = l.id
            and r2.scope_type = 'room'
            and r2.age_group_key is null
            and r2.effective_start <= current_date
            and (r2.effective_end is null or r2.effective_end >= current_date)
          order by r2.effective_start desc, r2.created_at desc
          limit 1) r on true
        where l.location_type = 'unit'
          and (l.metadata ? 'student_teacher_ratio' or r.id is not null)
      ) s),
    'authored_via_values', (
      select coalesce(json_agg(json_build_object('value', v.val, 'rules', v.n) order by v.n desc),'[]'::json)
      from (select coalesce(metadata->>'authored_via','(absent)') val, count(*) n
            from public.childcare_ratio_rules group by 1) v),
    'ratio_rule_totals', json_build_object(
      'all', (select count(*) from public.childcare_ratio_rules),
      'in_force', (select count(*) from public.childcare_ratio_rules
                   where effective_start <= current_date and (effective_end is null or effective_end >= current_date)),
      'object_editor', (select count(*) from public.childcare_ratio_rules where metadata->>'authored_via' = 'object_editor')),
    'today', current_date::text,
    'observed_at', now()::text)::text as payload;
