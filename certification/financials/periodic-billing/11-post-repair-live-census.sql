-- §15-§17, §21-§23, §25 — the repaired automation, read from the rows it produced.
--
-- Five certification assignments now exist, each shaped to exercise one rule:
--   A (771c085f) and B (e5a7471e)  already converged by the defective wake — must gain NOTHING
--   C (570ef2e5)  three unconverged periods  — must be REFUSED with zero mutation
--   D (a09f8a86)  one unconverged period     — must gain exactly ONE charge, for 09-22 only
--   E (a09eceb9)  two unconverged periods    — must gain exactly TWO, for 09-15 and 09-22 only
-- and Certhouse must gain nothing at all.
--
-- READ ONLY.
select 'attempts' as question_id, 'row' as kind,
  json_build_object('rows', (select json_agg(json_build_object(
      'occurrence_id', a.occurrence_id::text, 'attempt_number', a.attempt_number,
      'worker_id', a.worker_id, 'outcome', a.outcome,
      'started_at', a.started_at::text, 'diagnostic', a.diagnostic) order by a.started_at desc)
    from public.scheduled_work_attempts a
    join public.scheduled_work_occurrences o on o.id = a.occurrence_id
    where o.scheduled_work_id = '5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a'
      and a.started_at > now() - interval '30 minutes'))::text as payload
union all
select 'specimen_charges', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'agreement', c.billable_source_id::text, 'service_date', c.service_date::text,
      'status', c.status, 'cents', c.amount_cents, 'due_date', c.due_date::text,
      'created_at', c.created_at::text) order by c.billable_source_id, c.service_date)
    from public.charges c
    where c.billable_source_type='enrollment_agreement' and c.charge_category='tuition'
      and c.billable_source_id in (
        '771c085f-d145-4650-adee-4653db661975','e5a7471e-73f3-4e8d-b677-1b76cd274e28',
        '570ef2e5-d236-4edd-9465-64dee41b18df','a09f8a86-edad-4562-a868-9bcaeede0ae0',
        'a09eceb9-6e8f-41b6-8d7b-8d3f5bce261b')))::text
union all
select 'charge_counts', 'row',
  json_build_object(
    'A_771c085f', (select count(*) from public.charges c where c.billable_source_id='771c085f-d145-4650-adee-4653db661975' and c.charge_category='tuition'),
    'B_e5a7471e', (select count(*) from public.charges c where c.billable_source_id='e5a7471e-73f3-4e8d-b677-1b76cd274e28' and c.charge_category='tuition'),
    'C_570ef2e5', (select count(*) from public.charges c where c.billable_source_id='570ef2e5-d236-4edd-9465-64dee41b18df' and c.charge_category='tuition'),
    'D_a09f8a86', (select count(*) from public.charges c where c.billable_source_id='a09f8a86-edad-4562-a868-9bcaeede0ae0' and c.charge_category='tuition'),
    'E_a09eceb9', (select count(*) from public.charges c where c.billable_source_id='a09eceb9-6e8f-41b6-8d7b-8d3f5bce261b' and c.charge_category='tuition'))::text
union all
select 'certhouse_guard', 'row',
  json_build_object(
    'certa_count', (select count(*) from public.charges c where c.billable_source_id='43ef5615-11c8-4ea9-96ce-5002a4664fd1' and c.charge_category='tuition'),
    'certb_count', (select count(*) from public.charges c where c.billable_source_id='fa3767f8-3391-4655-b3a0-b7d461dae574' and c.charge_category='tuition'),
    'max_created', (select max(c.created_at)::text from public.charges c where c.charge_category='tuition'
      and c.billable_source_id in ('43ef5615-11c8-4ea9-96ce-5002a4664fd1','fa3767f8-3391-4655-b3a0-b7d461dae574')))::text
union all
select 'clock', 'row',
  json_build_object(
    'next_due_at', (select s.next_due_at::text from public.scheduled_work s where s.id='5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a'),
    'wake_count', (select wake_count from public.scheduled_work_clock where id='singleton'),
    'last_wake_at', (select last_wake_at::text from public.scheduled_work_clock where id='singleton'),
    'now', now()::text)::text;
