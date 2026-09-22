-- §12 — the guard read immediately before asking for an evaluation.
--
-- Nothing is assumed from the earlier census: if the specimen's term moved, or a charge appeared,
-- or Certhouse gained outstanding work, the evaluation must not be requested at all.
--
-- READ ONLY.
select 'specimen' as question_id, 'row' as kind,
  json_build_object(
    'term', (select json_build_object(
        'term_id', t.id::text, 'cadence', t.cadence_key, 'amount_cents', t.amount_cents,
        'effective_start', t.effective_start::text, 'state', t.state,
        'agreement', t.enrollment_agreement_id::text)
      from public.enrollment_pricing_terms t
      where t.opportunity_customer_member_id = 'ef10654a-e4cf-494d-b38e-82900af1163e'
        and t.superseded_at is null and t.term_kind = 'tuition' limit 1),
    'tuition_charges', (select count(*) from public.charges c
      where c.billable_source_type='enrollment_agreement'
        and c.billable_source_id='771c085f-d145-4650-adee-4653db661975'
        and c.charge_category='tuition'),
    'today_utc', (now() at time zone 'utc')::date::text,
    'now', now()::text)::text as payload
union all
select 'certhouse_guard', 'row',
  json_build_object(
    'certa', (select json_agg(json_build_object('service_date', c.service_date::text, 'status', c.status, 'cents', c.amount_cents) order by c.service_date)
      from public.charges c where c.billable_source_id='43ef5615-11c8-4ea9-96ce-5002a4664fd1' and c.charge_category='tuition'),
    'certb', (select json_agg(json_build_object('service_date', c.service_date::text, 'status', c.status, 'cents', c.amount_cents) order by c.service_date)
      from public.charges c where c.billable_source_id='fa3767f8-3391-4655-b3a0-b7d461dae574' and c.charge_category='tuition'),
    'certhouse_terms', (select json_agg(json_build_object('ocm', t.opportunity_customer_member_id::text, 'cadence', t.cadence_key, 'cents', t.amount_cents, 'state', t.state))
      from public.enrollment_pricing_terms t
      where t.superseded_at is null and t.term_kind='tuition'
        and t.opportunity_customer_member_id in ('79f8011d-a236-4054-bee7-af10f1dbc632','cf044308-3ee4-47ab-a8fb-205eb172aa48')))::text
union all
select 'schedule', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'id', s.id::text, 'org_id', s.org_id::text, 'next_due_at', s.next_due_at::text,
      'is_active', s.is_active, 'label', s.label))
    from public.scheduled_work s where s.handler_key='financials.periodic_billing.evaluate'),
    'open_occurrences', (select count(*) from public.scheduled_work_occurrences o
      where o.handler_key='financials.periodic_billing.evaluate' and o.status in ('pending','claimed')))::text;
