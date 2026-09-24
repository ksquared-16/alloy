-- §14-§16, §21, §22, §25 — what the real clock did, read from the scheduler's and Financials' own rows.
--
-- One wake exercises every billable assignment in the organisation, so a single read covers the
-- one-period specimen, the two-period specimen, the three-period specimen and the Certhouse guard
-- at one instant. Nothing here is inferred from timing.
--
-- READ ONLY.
select 'occurrences' as question_id, 'row' as kind,
  json_build_object('rows', (select json_agg(json_build_object(
      'id', o.id::text, 'due_at', o.due_at::text, 'status', o.status,
      'attempt_count', o.attempt_count, 'claimed_by', o.claimed_by,
      'lease_expires_at', o.lease_expires_at::text, 'completed_at', o.completed_at::text,
      'failure_reason', o.failure_reason) order by o.due_at)
    from public.scheduled_work_occurrences o
    where o.scheduled_work_id = '5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a'))::text as payload
union all
select 'attempts', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'occurrence_id', a.occurrence_id::text, 'attempt_number', a.attempt_number,
      'worker_id', a.worker_id, 'outcome', a.outcome,
      'started_at', a.started_at::text, 'finished_at', a.finished_at::text,
      'diagnostic', a.diagnostic) order by a.started_at)
    from public.scheduled_work_attempts a
    join public.scheduled_work_occurrences o on o.id = a.occurrence_id
    where o.scheduled_work_id = '5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a'))::text
union all
select 'specimen_charges', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'agreement', c.billable_source_id::text, 'charge_id', c.id::text,
      'service_date', c.service_date::text, 'status', c.status, 'amount_cents', c.amount_cents,
      'due_date', c.due_date::text, 'charge_category', c.charge_category,
      'created_at', c.created_at::text) order by c.billable_source_id, c.service_date)
    from public.charges c
    where c.billable_source_type = 'enrollment_agreement'
      and c.billable_source_id in (
        '771c085f-d145-4650-adee-4653db661975',
        'e5a7471e-73f3-4e8d-b677-1b76cd274e28',
        '570ef2e5-d236-4edd-9465-64dee41b18df')))::text
union all
select 'certhouse_guard', 'row',
  json_build_object(
    'certa_count', (select count(*) from public.charges c
      where c.billable_source_id='43ef5615-11c8-4ea9-96ce-5002a4664fd1' and c.charge_category='tuition'),
    'certb_count', (select count(*) from public.charges c
      where c.billable_source_id='fa3767f8-3391-4655-b3a0-b7d461dae574' and c.charge_category='tuition'),
    'certhouse_max_created', (select max(c.created_at)::text from public.charges c
      where c.charge_category='tuition'
        and c.billable_source_id in ('43ef5615-11c8-4ea9-96ce-5002a4664fd1','fa3767f8-3391-4655-b3a0-b7d461dae574')))::text
union all
select 'schedule_and_clock', 'row',
  json_build_object(
    'next_due_at', (select s.next_due_at::text from public.scheduled_work s where s.id='5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a'),
    'wake_count', (select wake_count from public.scheduled_work_clock where id='singleton'),
    'last_wake_at', (select last_wake_at::text from public.scheduled_work_clock where id='singleton'),
    'now', now()::text)::text;
