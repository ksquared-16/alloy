-- Alvarez "Field trip" rows, across every field that could carry that label. READ ONLY.
-- Only tables already confirmed to exist are referenced.
select 'field_trip_any' as question_id, 'row' as kind,
  json_build_object('rows', (select json_agg(json_build_object(
      'charge_id', c.id, 'description', c.description, 'charge_type', c.charge_type,
      'charge_category', c.charge_category, 'amount_cents', c.amount_cents, 'status', c.status,
      'billable_source_type', c.billable_source_type, 'billable_source_id', c.billable_source_id::text,
      'service_date', c.service_date::text, 'created_at', c.created_at::text,
      'created_by', c.created_by::text, 'posted_by', c.posted_by::text,
      'charge_template_id', c.charge_template_id::text, 'job_id', c.job_id::text,
      'schedule_id', c.schedule_id::text, 'metadata', c.metadata) order by c.created_at desc)
    from public.charges c
    where c.description ilike '%field%' or c.charge_type ilike '%field%'
       or c.charge_category ilike '%field%'
       or coalesce(c.metadata::text,'') ilike '%field%'))::text as payload
union all
select 'recent_charges', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'charge_id', c.id, 'description', c.description, 'charge_type', c.charge_type,
      'amount_cents', c.amount_cents, 'status', c.status,
      'billable_source_type', c.billable_source_type, 'billable_source_id', c.billable_source_id::text,
      'created_at', c.created_at::text, 'created_by', c.created_by::text) order by c.created_at desc)
    from (select * from public.charges order by created_at desc limit 25) c))::text as payload
union all
-- Responsibility rows written most recently, to see whether the 50/50 preview ever persisted.
select 'recent_responsibility', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'charge_id', a.charge_id::text, 'state', a.state, 'is_unassigned', a.is_unassigned,
      'responsible_party_type', a.responsible_party_type,
      'responsible_party_id', a.responsible_party_id::text,
      'basis', a.basis, 'basis_value', a.basis_value,
      'assigned_amount_cents', a.assigned_amount_cents,
      'created_at', a.created_at::text) order by a.created_at desc)
    from (select * from public.financial_responsibility_allocations order by created_at desc limit 25) a))::text as payload;
