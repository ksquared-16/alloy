-- W7 Scenario 9 — after seeding W7 QA · Tuition Family and accepting its tuition. Read-only, one statement.
-- (1) The accepted term, as generation will read it. (2) The household holds no money. (3) Certhouse's
-- monthly term and its November tuition are untouched. (4) No other W7 household gained a tuition term.
with hh as (select 'fd000000-0000-4000-8000-0000007c0006'::uuid as id),
     kid as (select 'fd000000-0000-4000-8000-0000007d0007'::uuid as id),
     agr as (select 'fd000000-0000-4000-8000-0000007a0007'::uuid as id)
select 'term', 'row', json_build_object('label', 'w7_tuition_term',
  'term_id', t.id, 'state', t.state, 'cadence', t.cadence_key, 'amount_cents', t.amount_cents, 'currency', t.currency_code,
  'effective_start', t.effective_start, 'effective_end', t.effective_end, 'superseded', t.superseded_at is not null,
  'agreement_linked', t.enrollment_agreement_id = (select id from agr), 'source_entity', t.source_entity, 'source_id', t.source_id,
  'location_is_north', (select l.label from locations l where l.id = t.location_id), 'accepted_by_set', t.accepted_by is not null,
  'live_terms_for_assignment', (select count(*) from enrollment_pricing_terms x where x.opportunity_customer_member_id = t.opportunity_customer_member_id and x.superseded_at is null))::text
  from enrollment_pricing_terms t where t.opportunity_customer_member_id = 'fd000000-0000-4000-8000-000000790002'::uuid
union all
select 'household', 'row', json_build_object('label', 'w7_tuition_household',
  'name', (select name from customers where id = (select id from hh)),
  'agreement', (select status || ' from ' || start_date from child_enrollment_agreements where id = (select id from agr)),
  'charges', (select count(*) from charges c where c.billable_source_id in ((select id from hh), (select id from kid), (select id from agr))),
  'payments', (select count(*) from payments p where p.customer_id = (select id from hh)),
  'responsibility_shares', (select count(*) from financial_responsibility_shares s where s.arrangement_id = 'fd000000-0000-4000-8000-0000007e0006'::uuid))::text
union all
select 'certhouse', 'row', json_build_object('label', 'certhouse_monthly_untouched',
  'term_state', t.state, 'term_amount_cents', t.amount_cents, 'term_superseded', t.superseded_at is not null,
  'november_tuition_charges', (select count(*) from charges c where c.billable_source_type = 'enrollment_agreement' and c.billable_source_id = t.enrollment_agreement_id
                                 and c.charge_category = 'tuition' and c.service_date = '2026-11-01'))::text
  from enrollment_pricing_terms t where t.id = '2a23f980-26d3-499a-b5bb-394e5c657499'::uuid
union all
select 'w7_terms', 'row', json_build_object('label', 'w7_households_with_tuition_terms',
  'households', (select json_agg(distinct c.name) from enrollment_pricing_terms t join customer_members m on m.id = t.customer_member_id
                   join customers c on c.id = m.customer_id where c.name like 'W7 QA%' and t.superseded_at is null))::text
