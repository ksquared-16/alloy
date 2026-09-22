-- PRE-ACTIVATION TRUTH for automatic Periodic Billing.
--
-- Three questions this run cannot answer from the application session, which is bound to one
-- organization and cannot see the shape of the estate around it:
--
--   1. How many organizations exist, and which one holds the Human-QA family. The certification
--      specimen must not share a Periodic Billing schedule with Kelly's tenant, and the schedule
--      is per organization — so whether a separate certification org EXISTS decides the whole
--      activation plan rather than being a detail.
--   2. Whether any Periodic Billing schedule already exists. Promotion must not have activated a
--      tenant, and "the code shipped" is not evidence of that.
--   3. Whether the staging clock is actually running, because every end-to-end proof below
--      depends on a real wake rather than a handler called by hand.
--
-- READ ONLY. No table is written. No credential is read; only presence is counted.
select 'orgs' as question_id, 'row' as kind,
  json_build_object(
    'org_count', (select count(*) from public.orgs),
    'orgs', (select json_agg(json_build_object('id', o.id, 'name', o.name) order by o.name) from public.orgs o)
  )::text as payload
union all
select 'humanqa_org', 'row',
  json_build_object(
    'certa_ocm', '79f8011d-a236-4054-bee7-af10f1dbc632',
    'certb_ocm', 'cf044308-3ee4-47ab-a8fb-205eb172aa48',
    'org_of_certa', (select t.org_id::text from public.enrollment_pricing_terms t
                      where t.opportunity_customer_member_id = '79f8011d-a236-4054-bee7-af10f1dbc632' limit 1),
    'org_of_certb', (select t.org_id::text from public.enrollment_pricing_terms t
                      where t.opportunity_customer_member_id = 'cf044308-3ee4-47ab-a8fb-205eb172aa48' limit 1)
  )::text
union all
select 'schedules', 'row',
  json_build_object(
    'total', (select count(*) from public.scheduled_work),
    'by_handler', (select json_agg(x) from (
        select handler_key, count(*) as n, count(*) filter (where is_active) as active
        from public.scheduled_work group by handler_key order by handler_key) x),
    'periodic_billing_rows', (select count(*) from public.scheduled_work
                               where handler_key = 'financials.periodic_billing.evaluate'),
    'periodic_billing_labels', (select json_agg(json_build_object(
        'id', s.id, 'org_id', s.org_id, 'label', s.label, 'recurrence', s.recurrence_kind,
        'is_active', s.is_active, 'next_due_at', s.next_due_at::text))
        from public.scheduled_work s where s.handler_key = 'financials.periodic_billing.evaluate')
  )::text
union all
select 'clock', 'row',
  json_build_object(
    'wake_count', (select wake_count from public.scheduled_work_clock where id = 'singleton'),
    'last_wake_at', (select last_wake_at::text from public.scheduled_work_clock where id = 'singleton'),
    'cron_job_active', (select active from cron.job where jobname = 'scheduled-work-clock'),
    'cron_schedule', (select schedule from cron.job where jobname = 'scheduled-work-clock'),
    'observed_at', now()::text
  )::text
union all
select 'terms_by_org', 'row',
  json_build_object(
    'live_tuition_terms', (select json_agg(x) from (
        select t.org_id::text as org_id, count(*) as terms,
               count(distinct t.opportunity_customer_member_id) as assignments,
               json_agg(distinct t.cadence_key) as cadences
        from public.enrollment_pricing_terms t
        where t.superseded_at is null and t.term_kind = 'tuition'
        group by t.org_id) x)
  )::text;
