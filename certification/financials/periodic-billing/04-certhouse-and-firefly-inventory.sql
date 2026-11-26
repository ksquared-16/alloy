-- CERTHOUSE CONVERGENCE (canonical, not preview) + WHAT FIREFLY CAN HOST AS A SPECIMEN.
--
-- §2 requires actual occurrence/charge convergence for both Certhouse assignments, read from the
-- rows themselves rather than from previewTuitionGeneration — which has now been shown to report
-- `generated` for periods that already carry a charge.
--
-- §5 requires a certification specimen that is NOT Certhouse. Whether that means creating a family
-- or accepting a term on an existing un-termed agreement depends on what Firefly already holds, so
-- the inventory is read here rather than assumed.
--
-- READ ONLY.
select 'certhouse_convergence' as question_id, 'row' as kind,
  json_build_object(
    'certa', json_build_object(
      'ocm', '79f8011d-a236-4054-bee7-af10f1dbc632',
      'agreement', '43ef5615-11c8-4ea9-96ce-5002a4664fd1',
      'charges', (select json_agg(json_build_object(
          'id', c.id::text, 'service_date', c.service_date::text, 'status', c.status,
          'amount_cents', c.amount_cents, 'created_at', c.created_at::text) order by c.service_date)
        from public.charges c
        where c.billable_source_type = 'enrollment_agreement'
          and c.billable_source_id = '43ef5615-11c8-4ea9-96ce-5002a4664fd1'
          and c.charge_category = 'tuition')),
    'certb', json_build_object(
      'ocm', 'cf044308-3ee4-47ab-a8fb-205eb172aa48',
      'agreement', 'fa3767f8-3391-4655-b3a0-b7d461dae574',
      'charges', (select json_agg(json_build_object(
          'id', c.id::text, 'service_date', c.service_date::text, 'status', c.status,
          'amount_cents', c.amount_cents, 'created_at', c.created_at::text) order by c.service_date)
        from public.charges c
        where c.billable_source_type = 'enrollment_agreement'
          and c.billable_source_id = 'fa3767f8-3391-4655-b3a0-b7d461dae574'
          and c.charge_category = 'tuition')),
    'today_utc', (now() at time zone 'utc')::date::text
  )::text as payload
union all
select 'firefly_agreements', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'agreement_id', a.id::text,
      'ocm', a.opportunity_customer_member_id::text,
      'status', a.status,
      'customer_member_id', a.customer_member_id::text,
      'site_location_id', a.site_location_id::text,
      'start_date', a.start_date::text,
      'live_tuition_term', exists (select 1 from public.enrollment_pricing_terms t
          where t.enrollment_agreement_id = a.id and t.superseded_at is null and t.term_kind = 'tuition'),
      'tuition_charges', (select count(*) from public.charges c
          where c.billable_source_type = 'enrollment_agreement' and c.billable_source_id = a.id
            and c.charge_category = 'tuition')) order by a.created_at)
    from public.child_enrollment_agreements a
    where a.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'))::text
union all
-- `opportunity_customer_members` carries customer_member_id, not customer_id; the customer lives
-- on customer_members. An earlier version of this census assumed the former and the WHOLE census
-- failed on that one column, returning nothing about Certhouse convergence either.
select 'firefly_children', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'ocm', m.id::text,
      'customer_member_id', m.customer_member_id::text,
      'customer_id', cm.customer_id::text,
      'opportunity_id', m.opportunity_id::text,
      'child_name', trim(coalesce(cm.first_name,'') || ' ' || coalesce(cm.last_name,''))) order by m.created_at)
    from public.opportunity_customer_members m
    left join public.customer_members cm on cm.id = m.customer_member_id
    where m.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'))::text
union all
select 'firefly_rate_plans', 'row',
  json_build_object(
    'tuition_template', (select json_agg(json_build_object('id', t.id::text, 'key', t.template_key))
        from public.financial_charge_templates t
        where t.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' and t.template_key = 'tuition'),
    'policies', (select json_agg(json_build_object('type', f.policy_type, 'effective_start', f.effective_start::text))
        from public.financial_policies f where f.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'),
    'observed_at', now()::text)::text;
