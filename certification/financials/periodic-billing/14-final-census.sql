-- §24, §25, §26, §28, §29 — automation after operator convergence, and the closing state.
--
-- C's backlog was converged through Generate Tuition. Automation must now re-read canonical truth,
-- find nothing outstanding, and say so — the refusal must not persist as a high-water mark. And
-- the whole Firefly picture is read once more so the Human-QA starting state is measured, not
-- remembered.
--
-- READ ONLY.
select 'latest_attempt' as question_id, 'row' as kind,
  json_build_object('rows', (select json_agg(json_build_object(
      'occurrence_id', a.occurrence_id::text, 'worker_id', a.worker_id, 'outcome', a.outcome,
      'started_at', a.started_at::text, 'counts', a.diagnostic->'counts',
      'periods_billed', a.diagnostic->'periods_billed',
      'requires_operator', a.diagnostic->'requires_operator',
      'assignments_considered', a.diagnostic->'assignments_considered') order by a.started_at desc)
    from public.scheduled_work_attempts a
    join public.scheduled_work_occurrences o on o.id = a.occurrence_id
    where o.scheduled_work_id = '5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a'
      and a.started_at > now() - interval '12 minutes'))::text as payload
union all
select 'charge_counts', 'row',
  json_build_object(
    'A', (select count(*) from public.charges c where c.billable_source_id='771c085f-d145-4650-adee-4653db661975' and c.charge_category='tuition'),
    'B', (select count(*) from public.charges c where c.billable_source_id='e5a7471e-73f3-4e8d-b677-1b76cd274e28' and c.charge_category='tuition'),
    'C', (select count(*) from public.charges c where c.billable_source_id='570ef2e5-d236-4edd-9465-64dee41b18df' and c.charge_category='tuition'),
    'D', (select count(*) from public.charges c where c.billable_source_id='a09f8a86-edad-4562-a868-9bcaeede0ae0' and c.charge_category='tuition'),
    'E', (select count(*) from public.charges c where c.billable_source_id='a09eceb9-6e8f-41b6-8d7b-8d3f5bce261b' and c.charge_category='tuition'),
    'certa', (select count(*) from public.charges c where c.billable_source_id='43ef5615-11c8-4ea9-96ce-5002a4664fd1' and c.charge_category='tuition'),
    'certb', (select count(*) from public.charges c where c.billable_source_id='fa3767f8-3391-4655-b3a0-b7d461dae574' and c.charge_category='tuition'),
    'certhouse_max_created', (select max(c.created_at)::text from public.charges c where c.charge_category='tuition'
      and c.billable_source_id in ('43ef5615-11c8-4ea9-96ce-5002a4664fd1','fa3767f8-3391-4655-b3a0-b7d461dae574')))::text
union all
select 'three_consumers', 'row',
  json_build_object(
    'schedules_by_handler', (select json_agg(x) from (
      select handler_key, count(*) n, count(*) filter (where is_active) active
      from public.scheduled_work group by handler_key order by handler_key) x),
    'periodic_billing_schedule', (select json_build_object('id', s.id::text, 'next_due_at', s.next_due_at::text, 'is_active', s.is_active)
      from public.scheduled_work s where s.id='5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a'),
    'clock_wakes', (select wake_count from public.scheduled_work_clock where id='singleton'),
    'now', now()::text)::text;
