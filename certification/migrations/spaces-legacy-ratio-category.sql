select 'spaces_legacy_ratio_category' as question_id, 'row' as kind,
  json_build_object(
    'units_with_legacy_ratio_or_category', (
      select coalesce(json_agg(json_build_object(
          'label', l.label,
          'site', (select p.label from public.locations p where p.id = l.parent_location_id),
          'role', coalesce(l.unit_role,'(null)'),
          'category', l.metadata->>'category',
          'semantic_kind', l.metadata->>'semantic_kind',
          'room_category', l.metadata->>'room_category',
          'student_teacher_ratio', l.metadata->>'student_teacher_ratio',
          'ratio', l.metadata->>'ratio',
          'ratio_licensing_notes', l.metadata->>'ratio_licensing_notes',
          'licensing_ratio', l.metadata->>'licensing_ratio',
          'capacity', l.metadata->>'capacity') order by l.label),'[]'::json)
      from public.locations l
      where l.location_type = 'unit'
        and (l.metadata ? 'category' or l.metadata ? 'semantic_kind' or l.metadata ? 'room_category'
             or l.metadata ? 'student_teacher_ratio' or l.metadata ? 'ratio'
             or l.metadata ? 'ratio_licensing_notes' or l.metadata ? 'licensing_ratio')),
    'sites_metadata_keys', (
      select coalesce(json_agg(json_build_object(
          'label', l.label, 'keys', (select coalesce(json_agg(k order by k),'[]'::json)
                                     from jsonb_object_keys(l.metadata) k)) order by l.label),'[]'::json)
      from public.locations l where l.location_type = 'site'),
    'any_ratio_like_15_or_211', (
      select coalesce(json_agg(json_build_object('label', l.label, 'value', v.val)),'[]'::json)
      from public.locations l
      cross join lateral (values
          (l.metadata->>'student_teacher_ratio'), (l.metadata->>'ratio'),
          (l.metadata->>'ratio_licensing_notes'), (l.metadata->>'licensing_ratio')) v(val)
      where v.val is not null and (v.val like '%5%' or v.val like '%11%')),
    'observed_at', now()::text)::text as payload;
