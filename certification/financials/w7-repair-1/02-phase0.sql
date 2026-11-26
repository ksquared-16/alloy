-- PHASE 0 (corrected for the real schema). READ ONLY. Nothing is mutated.
select 'w7_results' as question_id, 'row' as kind,
  json_build_object('rows', (select json_agg(json_build_object(
      'scenario_key', r.scenario_key, 'result', r.result, 'observation', r.observation,
      'expected_result', r.expected_result, 'classification', r.classification,
      'evidence_reference', r.evidence_reference,
      'scenario_definition_version', r.scenario_definition_version,
      'deployed_revision', r.deployed_revision, 'tester_email', r.tester_email,
      'environment', r.environment,
      'started_at', r.started_at::text, 'completed_at', r.completed_at::text) order by r.completed_at)
    from public.qa_director_acceptance_results r
    where r.suite_key = 'core_financials_director_qa'))::text as payload
union all
-- The Alvarez rows, by their own columns. billable_source_* is how a charge names its subject.
select 'alvarez_field_trip', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'charge_id', c.id, 'description', c.description,
      'charge_type', c.charge_type, 'charge_category', c.charge_category,
      'billable_source_type', c.billable_source_type, 'billable_source_id', c.billable_source_id,
      'amount_cents', c.amount_cents, 'status', c.status,
      'service_date', c.service_date::text, 'due_date', c.due_date::text,
      'posted_at', c.posted_at::text, 'posted_by', c.posted_by,
      'created_at', c.created_at::text, 'created_by', c.created_by,
      'updated_at', c.updated_at::text,
      'charge_template_id', c.charge_template_id, 'job_id', c.job_id,
      'schedule_id', c.schedule_id, 'subscription_id', c.subscription_id,
      'source_charge_id', c.source_charge_id, 'metadata', c.metadata) order by c.created_at)
    from public.charges c
    where c.description ilike '%field trip%'))::text as payload
union all
-- Responsibility for those charges. is_unassigned is the likely source of "Not allocated".
select 'alvarez_responsibility', 'row',
  json_build_object('rows', (select json_agg(json_build_object(
      'charge_id', a.charge_id, 'allocation_id', a.id, 'state', a.state,
      'is_unassigned', a.is_unassigned,
      'responsible_party_type', a.responsible_party_type, 'responsible_party_id', a.responsible_party_id,
      'basis', a.basis, 'basis_value', a.basis_value,
      'assigned_amount_cents', a.assigned_amount_cents,
      'supersedes_id', a.supersedes_id, 'superseded_by_id', a.superseded_by_id,
      'created_at', a.created_at::text, 'created_by', a.created_by) order by a.created_at)
    from public.financial_responsibility_allocations a
    where a.charge_id in (select c.id from public.charges c where c.description ilike '%field trip%')))::text as payload
union all
-- How many charges exist per (description, created_at second) — cardinality evidence for one submission.
select 'field_trip_cardinality', 'row',
  json_build_object('groups', (select json_agg(json_build_object(
      'created_second', g.sec, 'n', g.n, 'sources', g.sources, 'creators', g.creators))
    from (select date_trunc('second', c.created_at)::text as sec, count(*) as n,
                 json_agg(distinct c.billable_source_type) as sources,
                 json_agg(distinct c.created_by::text) as creators
          from public.charges c where c.description ilike '%field trip%'
          group by date_trunc('second', c.created_at)) g))::text as payload;
