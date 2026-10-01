-- PHASE 0 — preserve and measure. READ ONLY. Nothing is mutated.
--
-- Three questions, asked before any product change:
--   1. exactly what the Director has already submitted for W7, so it can be proven to survive;
--   2. what the two Alvarez "Field trip" rows actually are, and how many writes made them;
--   3. what provenance a ledger item can TRUTHFULLY answer, so no "created by" is fabricated.
select 'w7_results' as question_id, 'row' as kind,
  json_build_object('rows', (select json_agg(json_build_object(
      'scenario_key', r.scenario_key, 'result', r.result,
      'observation', r.observation, 'expected_result', r.expected_result,
      'classification', r.classification, 'evidence_reference', r.evidence_reference,
      'scenario_definition_version', r.scenario_definition_version,
      'deployed_revision', r.deployed_revision, 'tester_email', r.tester_email,
      'completed_at', r.completed_at::text) order by r.completed_at)
    from public.qa_director_acceptance_results r
    where r.suite_key = 'core_financials_director_qa'))::text as payload
union all
select 'w7_result_count', 'row',
  json_build_object(
    'total', (select count(*) from public.qa_director_acceptance_results where suite_key = 'core_financials_director_qa'),
    'by_revision', (select json_agg(json_build_object('revision', d.deployed_revision, 'n', d.n))
                    from (select deployed_revision, count(*) as n
                          from public.qa_director_acceptance_results
                          where suite_key = 'core_financials_director_qa'
                          group by deployed_revision) d)
  )::text as payload
union all
-- The Alvarez rows. Identity and provenance only; no economics are changed by reading them.
select 'alvarez_field_trip', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'charge_id', c.id, 'org_id', c.org_id, 'customer_id', c.customer_id,
      'customer_member_id', c.customer_member_id,
      'billable_source_type', c.billable_source_type, 'billable_source_id', c.billable_source_id,
      'amount_cents', c.amount_cents, 'status', c.status,
      'service_date', c.service_date::text, 'posted_at', c.posted_at::text,
      'created_at', c.created_at::text, 'updated_at', c.updated_at::text,
      'description', c.description, 'charge_template_id', c.charge_template_id) order by c.created_at)
    from public.charges c
    where c.description ilike '%field trip%'))::text as payload
union all
-- Which responsibility allocations exist for those charges, if any.
select 'alvarez_responsibility', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'charge_id', a.charge_id, 'allocation_id', a.id,
      'responsible_party_id', a.responsible_party_id,
      'basis', a.basis, 'percent_basis_points', a.percent_basis_points,
      'assigned_amount_cents', a.assigned_amount_cents, 'state', a.state,
      'created_at', a.created_at::text))
    from public.financial_responsibility_allocations a
    where a.charge_id in (select c.id from public.charges c where c.description ilike '%field trip%')))::text as payload
union all
-- WHAT PROVENANCE CAN BE ANSWERED AT ALL. Catalog only: which actor/source columns charges carry.
select 'charge_provenance_columns', 'row',
  json_build_object('columns', (select json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod)) order by a.attname)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'charges'
      and a.attnum > 0 and not a.attisdropped
      and (a.attname like '%created%' or a.attname like '%actor%' or a.attname like '%source%'
           or a.attname like '%by%' or a.attname like '%origin%' or a.attname like '%request%')))::text as payload
union all
-- Is there an action/request ledger that could name the human who submitted a charge.add?
select 'action_provenance_tables', 'row',
  json_build_object('tables', (select coalesce(json_agg(c.relname order by c.relname), '[]'::json)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname like '%action_request%' or c.relname like '%governed%' or c.relname like '%audit%'
           or c.relname like '%activity_log%' or c.relname like '%event%')))::text as payload;
