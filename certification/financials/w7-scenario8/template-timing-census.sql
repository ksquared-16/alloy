-- W7-F017 — which ACTIVE charge templates override the organisation's invoice timing?
-- Read-only, one statement. A template whose billable_on_strategy is anything but 'billing_policy'
-- dates its invoices itself; older templates kept 'immediate' when the policy default changed.
with org as (select '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid as id)
select 'template', 'row', json_build_object(
  'label', t.label, 'id', t.id, 'template_key', t.template_key, 'billable_on_strategy', t.billable_on_strategy,
  'billable_offset_days', t.billable_offset_days, 'occurs_on_strategy', t.occurs_on_strategy,
  'amount_strategy', t.amount_strategy, 'amount_cents', t.amount_cents, 'charge_category', t.charge_category,
  'is_active', t.is_active, 'effective_start', t.effective_start, 'effective_end', t.effective_end
)::text
from financial_charge_templates t, org
where t.org_id = org.id and t.is_active and (t.effective_end is null or t.effective_end >= current_date)
order by 3
