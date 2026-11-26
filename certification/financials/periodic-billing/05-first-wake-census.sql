-- §11 + §12 — DID THE REAL CLOCK RUN FINANCIALS, AND DID CERTHOUSE MOVE?
--
-- The chain has to be read from the scheduler's own rows, not inferred from the fact that time
-- passed: the schedule, the occurrence it materialized, the claim that took it, the attempt that
-- ran it and the outcome the handler returned. And Certhouse's charges are re-counted against the
-- pre-activation snapshot, because "activation touched nobody" is a claim that has to be measured
-- rather than asserted.
--
-- READ ONLY.
select 'schedule' as question_id, 'row' as kind,
  json_build_object('rows', (select json_agg(json_build_object(
      'id', s.id::text, 'org_id', s.org_id::text, 'handler_key', s.handler_key,
      'recurrence_kind', s.recurrence_kind, 'is_active', s.is_active,
      'next_due_at', s.next_due_at::text, 'label', s.label,
      'created_at', s.created_at::text, 'updated_at', s.updated_at::text))
    from public.scheduled_work s
    where s.handler_key = 'financials.periodic_billing.evaluate'))::text as payload
union all
select 'occurrences', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'id', o.id::text, 'scheduled_work_id', o.scheduled_work_id::text, 'org_id', o.org_id::text,
      'handler_key', o.handler_key, 'due_at', o.due_at::text, 'status', o.status,
      'attempt_count', o.attempt_count, 'claimed_by', o.claimed_by,
      'lease_expires_at', o.lease_expires_at::text, 'completed_at', o.completed_at::text,
      'failure_reason', o.failure_reason) order by o.due_at)
    from public.scheduled_work_occurrences o
    where o.handler_key = 'financials.periodic_billing.evaluate'))::text
union all
select 'attempts', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'id', a.id::text, 'occurrence_id', a.occurrence_id::text, 'attempt_number', a.attempt_number,
      'worker_id', a.worker_id, 'outcome', a.outcome,
      'started_at', a.started_at::text, 'finished_at', a.finished_at::text,
      'diagnostic', a.diagnostic) order by a.started_at)
    from public.scheduled_work_attempts a
    where a.handler_key = 'financials.periodic_billing.evaluate'))::text
union all
select 'clock', 'row',
  json_build_object(
    'wake_count', (select wake_count from public.scheduled_work_clock where id='singleton'),
    'last_wake_at', (select last_wake_at::text from public.scheduled_work_clock where id='singleton'),
    'observed_at', now()::text)::text
union all
select 'certhouse_after', 'row',
  json_build_object(
    'certa_charges', (select count(*) from public.charges c
        where c.billable_source_type='enrollment_agreement'
          and c.billable_source_id='43ef5615-11c8-4ea9-96ce-5002a4664fd1' and c.charge_category='tuition'),
    'certb_charges', (select count(*) from public.charges c
        where c.billable_source_type='enrollment_agreement'
          and c.billable_source_id='fa3767f8-3391-4655-b3a0-b7d461dae574' and c.charge_category='tuition'),
    'certhouse_rows', (select json_agg(json_build_object(
        'agreement', c.billable_source_id::text, 'service_date', c.service_date::text,
        'status', c.status, 'amount_cents', c.amount_cents, 'created_at', c.created_at::text)
        order by c.billable_source_id, c.service_date)
      from public.charges c
      where c.charge_category='tuition' and c.billable_source_type='enrollment_agreement'
        and c.billable_source_id in ('43ef5615-11c8-4ea9-96ce-5002a4664fd1','fa3767f8-3391-4655-b3a0-b7d461dae574')),
    'live_tuition_terms', (select count(*) from public.enrollment_pricing_terms t
        where t.org_id='93667019-bd28-49b5-a688-acc9bb1e0a19' and t.superseded_at is null and t.term_kind='tuition'),
    'specimen_agreement_charges', (select count(*) from public.charges c
        where c.billable_source_type='enrollment_agreement'
          and c.billable_source_id='9134bf85-e00f-4bc6-8917-a02cda58395f'))::text;
