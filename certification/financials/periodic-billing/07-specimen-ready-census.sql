-- §9 + §20 — the specimen's canonical billing state before any clock wake, and the Certhouse guard.
--
-- The specimen is a FRESH child (Pbchild Automation) with an accepted weekly term effective
-- 2026-09-22. If the doctrine holds, exactly one canonical period has begun (2026-09-22 to
-- 09-28) and no tuition charge exists for it yet. Certhouse is re-counted in the same read so the
-- guard and the specimen state come from one instant.
--
-- READ ONLY.
select 'specimen' as question_id, 'row' as kind,
  json_build_object(
    'ocm', 'ef10654a-e4cf-494d-b38e-82900af1163e',
    'agreement', '771c085f-d145-4650-adee-4653db661975',
    'terms', (select json_agg(json_build_object(
        'term_id', t.id::text, 'cadence', t.cadence_key, 'amount_cents', t.amount_cents,
        'effective_start', t.effective_start::text, 'effective_end', t.effective_end::text,
        'state', t.state, 'agreement', t.enrollment_agreement_id::text, 'superseded_at', t.superseded_at::text))
      from public.enrollment_pricing_terms t
      where t.opportunity_customer_member_id = 'ef10654a-e4cf-494d-b38e-82900af1163e'),
    'tuition_charges', (select count(*) from public.charges c
      where c.billable_source_type='enrollment_agreement'
        and c.billable_source_id='771c085f-d145-4650-adee-4653db661975'
        and c.charge_category='tuition'),
    'today_utc', (now() at time zone 'utc')::date::text)::text as payload
union all
select 'firefly_billable_assignments', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'ocm', t.opportunity_customer_member_id::text,
      'cadence', t.cadence_key,
      'amount_cents', t.amount_cents,
      'effective_start', t.effective_start::text,
      'agreement', t.enrollment_agreement_id::text,
      'tuition_charges', (select count(*) from public.charges c
          where c.billable_source_type='enrollment_agreement'
            and c.billable_source_id = t.enrollment_agreement_id
            and c.charge_category='tuition')))
    from public.enrollment_pricing_terms t
    where t.org_id='93667019-bd28-49b5-a688-acc9bb1e0a19'
      and t.superseded_at is null and t.term_kind='tuition'))::text
union all
select 'certhouse_guard', 'row',
  json_build_object(
    'certa_charges', (select count(*) from public.charges c
      where c.billable_source_id='43ef5615-11c8-4ea9-96ce-5002a4664fd1' and c.charge_category='tuition'),
    'certb_charges', (select count(*) from public.charges c
      where c.billable_source_id='fa3767f8-3391-4655-b3a0-b7d461dae574' and c.charge_category='tuition'),
    'certhouse_latest_charge_created', (select max(c.created_at)::text from public.charges c
      where c.charge_category='tuition'
        and c.billable_source_id in ('43ef5615-11c8-4ea9-96ce-5002a4664fd1','fa3767f8-3391-4655-b3a0-b7d461dae574')))::text
union all
select 'schedule_state', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'id', s.id::text, 'org_id', s.org_id::text, 'next_due_at', s.next_due_at::text,
      'is_active', s.is_active, 'recurrence_kind', s.recurrence_kind, 'label', s.label))
    from public.scheduled_work s where s.handler_key='financials.periodic_billing.evaluate'),
    'now', now()::text)::text;
