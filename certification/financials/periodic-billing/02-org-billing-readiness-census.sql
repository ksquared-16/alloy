-- CAN ANY ORGANISATION OTHER THAN THE HUMAN-QA TENANT HOST A BILLING SPECIMEN?
--
-- The Periodic Billing schedule is per ORGANISATION, and the Human-QA family lives in Firefly
-- Early Learning. So "use a dedicated certification specimen" and "do not activate Kelly's tenant"
-- can only both hold if some OTHER organisation can be made to bill — which needs more than a
-- family: an accepted tuition term needs a rate plan, a billable cadence, a tuition charge
-- template for the pipeline to resolve, and a proration policy for partial periods.
--
-- The template table is `financial_charge_templates`. An earlier version of this census guessed
-- `charge_templates` and the WHOLE census failed on that one line, returning nothing about any of
-- the other four questions — a census is atomic, so one unverified identifier costs all of it.
--
-- This counts what each organisation actually has, so the activation plan is chosen from measured
-- readiness rather than from hope. READ ONLY.
select 'per_org_readiness' as question_id, 'row' as kind,
  json_build_object('orgs', (select json_agg(x order by x->>'name') from (
    select json_build_object(
      'id', o.id::text,
      'name', o.name,
      'locations', (select count(*) from public.locations l where l.org_id = o.id),
      'customers', (select count(*) from public.customers c where c.org_id = o.id),
      'opportunities', (select count(*) from public.opportunities p where p.org_id = o.id),
      'enrollment_agreements', (select count(*) from public.child_enrollment_agreements a where a.org_id = o.id),
      'live_tuition_terms', (select count(*) from public.enrollment_pricing_terms t
                              where t.org_id = o.id and t.superseded_at is null and t.term_kind = 'tuition'),
      'financial_policies', (select count(*) from public.financial_policies f where f.org_id = o.id),
      'proration_policy', exists (select 1 from public.financial_policies f
                                   where f.org_id = o.id and f.policy_type = 'proration'),
      'due_date_policy', exists (select 1 from public.financial_policies f
                                  where f.org_id = o.id and f.policy_type = 'due_date'),
      'charges', (select count(*) from public.charges c where c.org_id = o.id),
      'tuition_charges', (select count(*) from public.charges c
                           where c.org_id = o.id and c.charge_category = 'tuition')
    ) as x
    from public.orgs o) x))::text as payload
union all
select 'charge_templates', 'row',
  json_build_object('by_org', (select json_agg(y) from (
      select t.org_id::text as org_id, count(*) as templates,
             json_agg(distinct t.template_key) filter (where t.template_key is not null) as keys
      from public.financial_charge_templates t group by t.org_id) y))::text
union all
select 'humanqa_terms', 'row',
  json_build_object('terms', (select json_agg(json_build_object(
      'ocm', t.opportunity_customer_member_id::text,
      'cadence', t.cadence_key,
      'amount_cents', t.amount_cents,
      'effective_start', t.effective_start::text,
      'effective_end', t.effective_end::text,
      'state', t.state,
      'agreement', t.enrollment_agreement_id::text))
      from public.enrollment_pricing_terms t
      where t.superseded_at is null and t.term_kind = 'tuition'
        and t.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'))::text
union all
select 'humanqa_tuition_charges', 'row',
  json_build_object(
    'rows', (select json_agg(json_build_object(
        'agreement', c.billable_source_id::text,
        'service_date', c.service_date::text,
        'status', c.status,
        'amount_cents', c.amount_cents) order by c.service_date)
      from public.charges c
      where c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
        and c.charge_category = 'tuition'
        and c.billable_source_type = 'enrollment_agreement'),
    'observed_at', now()::text)::text;
