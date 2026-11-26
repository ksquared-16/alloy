-- W7-F022 — the organization's charge templates keyed 'tuition' (and every tuition-category template),
-- in the order `listChargeTemplates` returns them (no ORDER BY — table order), with their effective
-- windows. Read-only.
with org as (select org_id as id from customers where id = 'fd000000-0000-4000-8000-0000007c0006'::uuid)
select 'template', 'row', json_build_object('label', t.template_key, 'id', t.id, 'name', t.label, 'category', t.charge_category,
  'is_active', t.is_active, 'effective_start', t.effective_start, 'effective_end', t.effective_end,
  'amount_strategy', t.amount_strategy, 'amount_cents', t.amount_cents, 'billable_on_strategy', t.billable_on_strategy,
  'created_at', t.created_at, 'updated_at', t.updated_at, 'source_key', t.source_key,
  'supersedes', t.metadata ->> 'supersedes_template_id', 'version_of', t.metadata ->> 'version_of')::text
  from financial_charge_templates t, org
 where t.org_id = org.id and (t.template_key = 'tuition' or t.charge_category = 'tuition')
union all
select 'event_type', 'row', json_build_object('label', e.event_key, 'charge_template_key', e.charge_template_key, 'is_active', e.is_active,
  'effective_start', e.effective_start, 'effective_end', e.effective_end, 'org_scoped', e.org_id is not null)::text
  from consumption_event_types e, org
 where e.event_key = 'schedule.recurring_tuition' and (e.org_id = org.id or e.org_id is null)
