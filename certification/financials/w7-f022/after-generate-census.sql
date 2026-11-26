-- W7-F022 — AFTER the deployed run on 17959e62: exactly one November tuition charge per target, and its dates. Read-only.
with t as (
  select x.id as term_id, x.opportunity_customer_member_id as ocm, x.enrollment_agreement_id as agr, x.customer_member_id as kid,
         x.state, x.amount_cents, x.cadence_key, x.effective_start, x.superseded_at, x.updated_at,
         case when x.opportunity_customer_member_id = 'fd000000-0000-4000-8000-000000790002'::uuid then 'tilly' else 'certb' end as who
    from enrollment_pricing_terms x
   where x.id in ('b09b5f15-2e64-4560-8b4a-6ba1b99553e0'::uuid, '2a23f980-26d3-499a-b5bb-394e5c657499'::uuid)
)
select 'term', 'row', json_build_object('label', t.who, 'term_id', t.term_id, 'state', t.state, 'amount_cents', t.amount_cents,
  'cadence', t.cadence_key, 'effective_start', t.effective_start, 'superseded', t.superseded_at is not null, 'updated_at', t.updated_at,
  'agreement', t.agr)::text
  from t
union all
select 'nov_charge', 'row', json_build_object('label', t.who, 'charge_id', c.id, 'status', c.status, 'category', c.charge_category,
  'amount_cents', c.amount_cents, 'service_date', c.service_date, 'billable_on', c.billable_on, 'due_date', c.due_date,
  'created_at', c.created_at, 'voided_at', c.voided_at)::text
  from t join charges c on c.billable_source_type = 'enrollment_agreement' and c.billable_source_id = t.agr
 where c.service_date between '2026-11-01' and '2026-11-30' or c.created_at > '2026-10-15'
union all
select 'event', 'row', json_build_object('label', t.who, 'event_id', e.id, 'status', e.status, 'event_key', e.event_key,
  'occurs_on', e.occurs_on, 'idempotency_key', e.idempotency_key, 'created_at', e.created_at, 'updated_at', e.updated_at,
  'context_generated_by', e.context ->> 'generated_by', 'context_service_period', e.context ->> 'service_period')::text
  from t join consumption_events e on e.source_entity_id = t.agr
 where e.occurs_on between '2026-11-01' and '2026-11-30' or e.created_at > '2026-10-15'
union all
select 'obligation', 'row', json_build_object('label', t.who, 'obligation_id', o.id, 'status', o.status, 'kind', o.obligation_kind,
  'amount_cents', o.amount_cents, 'occurs_on', o.occurs_on, 'billable_on', o.billable_on, 'period', o.period_start || '..' || o.period_end,
  'template_set', o.charge_template_id is not null, 'draft_charge_id', o.draft_charge_id, 'review_status', o.review_status,
  'suppression_reason', o.suppression_reason, 'explanation', o.explanation, 'created_at', o.created_at, 'updated_at', o.updated_at)::text
  from t join consumption_events e on e.source_entity_id = t.agr
  join resolved_obligations o on o.consumption_event_id = e.id
 where e.occurs_on between '2026-11-01' and '2026-11-30' or e.created_at > '2026-10-15'
union all
select 'mutation', 'row', json_build_object('label', m.command_key, 'committed_at', m.committed_at, 'origin', m.origin,
  'subject_type', m.subject_type, 'new_state', left(m.new_state::text, 300), 'context', left(m.context_payload::text, 1500))::text
  from mutation_events m, (select org_id from customers where id = 'fd000000-0000-4000-8000-0000007c0006'::uuid) o
 where m.org_id = o.org_id and m.committed_at > '2026-10-15' and (m.command_key ilike '%tuition%' or m.command_key ilike '%generate%')
union all
select 'nov_tuition_count', 'row', json_build_object('label', t.who,
  'november_tuition_charges', (select count(*) from charges c where c.billable_source_type = 'enrollment_agreement' and c.billable_source_id = t.agr
                                 and c.charge_category = 'tuition' and c.service_date between '2026-11-01' and '2026-11-30'),
  'responsibility_allocations', (select count(*) from financial_responsibility_allocations a
                                   join charges c on c.id = a.charge_id
                                  where c.billable_source_type = 'enrollment_agreement' and c.billable_source_id = t.agr
                                    and c.charge_category = 'tuition' and c.service_date between '2026-11-01' and '2026-11-30'))::text
  from t
