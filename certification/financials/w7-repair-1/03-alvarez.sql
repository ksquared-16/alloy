-- Find the "Field trip" charges by any field that could carry that label. READ ONLY.
select 'field_trip_any' as question_id, 'row' as kind,
  json_build_object('rows', (select json_agg(json_build_object(
      'charge_id', c.id, 'description', c.description, 'charge_type', c.charge_type,
      'charge_category', c.charge_category, 'amount_cents', c.amount_cents, 'status', c.status,
      'billable_source_type', c.billable_source_type, 'billable_source_id', c.billable_source_id,
      'service_date', c.service_date::text, 'created_at', c.created_at::text,
      'created_by', c.created_by::text, 'posted_by', c.posted_by::text,
      'charge_template_id', c.charge_template_id::text, 'job_id', c.job_id::text,
      'schedule_id', c.schedule_id::text, 'metadata', c.metadata) order by c.created_at desc)
    from public.charges c
    where c.description ilike '%field%' or c.charge_type ilike '%field%'
       or c.charge_category ilike '%field%'
       or coalesce(c.metadata::text,'') ilike '%field trip%'))::text as payload
union all
-- The most recent charges overall, which is where a QA-session Add Charge would land.
select 'recent_charges', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'charge_id', c.id, 'description', c.description, 'charge_type', c.charge_type,
      'amount_cents', c.amount_cents, 'status', c.status,
      'billable_source_type', c.billable_source_type,
      'created_at', c.created_at::text, 'created_by', c.created_by::text) order by c.created_at desc)
    from (select * from public.charges order by created_at desc limit 25) c))::text as payload
union all
-- Charge templates, to learn where a business label like "Field trip" actually lives.
select 'templates', 'row',
  json_build_object('rows', (select json_agg(json_build_object('id', t.id, 'label', t.label) order by t.label)
    from public.charge_templates t limit 40))::text as payload;
