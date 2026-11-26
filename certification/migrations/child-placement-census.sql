select 'child_placement' as question_id, 'row' as kind,
  json_build_object(
    'children', (select coalesce(json_agg(json_build_object(
            'assignment_id', sa.id,
            'agreement', sa.enrollment_agreement_id,
            'site', a.site_location_id,
            'room', p.room_location_id,
            'pattern', sa.schedule_pattern_id,
            'weekdays', (select coalesce(json_agg(i.weekday order by i.weekday),'[]'::json)
                         from public.assignment_weekday_intervals i where i.assignment_id = sa.id)
        ) order by sa.id),'[]'::json)
        from public.schedule_assignments sa
        left join public.child_enrollment_agreements a on a.id = sa.enrollment_agreement_id
        left join public.child_placements p on p.enrollment_agreement_id = sa.enrollment_agreement_id
             and p.status in ('planned','active','ending')
        where sa.subject_type='child' and sa.status in ('planned','active','ending')),
    'observed_at', now()::text)::text as payload;
