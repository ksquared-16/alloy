-- §23 — the critical one: a SECOND real wake over the same over-bound backlog, with nothing
-- converged in between. If N=2 were "two at a time", C would now hold two charges and one
-- outstanding period. It must hold zero and three.
--
-- D and E are re-counted in the same read, because "no duplicate on a second evaluation" (§17) is
-- the same question asked of the assignments that WERE billed.
--
-- READ ONLY.
select 'attempts' as question_id, 'row' as kind,
  json_build_object('rows', (select json_agg(json_build_object(
      'occurrence_id', a.occurrence_id::text, 'attempt_number', a.attempt_number,
      'worker_id', a.worker_id, 'outcome', a.outcome, 'started_at', a.started_at::text,
      'counts', a.diagnostic->'counts', 'periods_billed', a.diagnostic->'periods_billed',
      'requires_operator', a.diagnostic->'requires_operator') order by a.started_at desc)
    from public.scheduled_work_attempts a
    join public.scheduled_work_occurrences o on o.id = a.occurrence_id
    where o.scheduled_work_id = '5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a'
      and a.started_at > now() - interval '20 minutes'))::text as payload
union all
select 'charge_counts', 'row',
  json_build_object(
    'C_over_bound', (select count(*) from public.charges c where c.billable_source_id='570ef2e5-d236-4edd-9465-64dee41b18df' and c.charge_category='tuition'),
    'D_one_period', (select count(*) from public.charges c where c.billable_source_id='a09f8a86-edad-4562-a868-9bcaeede0ae0' and c.charge_category='tuition'),
    'E_two_periods', (select count(*) from public.charges c where c.billable_source_id='a09eceb9-6e8f-41b6-8d7b-8d3f5bce261b' and c.charge_category='tuition'),
    'certa', (select count(*) from public.charges c where c.billable_source_id='43ef5615-11c8-4ea9-96ce-5002a4664fd1' and c.charge_category='tuition'),
    'certb', (select count(*) from public.charges c where c.billable_source_id='fa3767f8-3391-4655-b3a0-b7d461dae574' and c.charge_category='tuition'))::text
union all
select 'occurrence_history', 'row',
  json_build_object('count', (select count(*) from public.scheduled_work_occurrences o
      where o.scheduled_work_id='5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a'),
    'statuses', (select json_agg(distinct o.status) from public.scheduled_work_occurrences o
      where o.scheduled_work_id='5925c0ec-e5c3-4ec4-9b3a-bf6daa8c160a'),
    'wake_count', (select wake_count from public.scheduled_work_clock where id='singleton'),
    'now', now()::text)::text;
