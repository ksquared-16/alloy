-- W7 Scenario 9 — WHO does deployed "Generate a period's tuition" (2026-11) reach? Read-only, one statement.
-- The preview's seven assignment ids, matched to the accepted pricing term (by term id or by
-- opportunity customer member id), with cadence, amount, the child and household, and how many
-- tuition charges the term's child already carries per service month. No email, no contact data.
with ids(id) as (values
  ('cf044308-3ee4-47ab-a8fb-205eb172aa48'::uuid), ('ef10654a-e4cf-494d-b38e-82900af1163e'::uuid),
  ('329ca704-4a36-4dbc-93db-04a94af5c758'::uuid), ('40971cd2-3a41-42cf-b744-3b5c7c49652b'::uuid),
  ('afde2aa1-b4cb-423e-bbb3-0813ddbd8740'::uuid), ('e978987c-56d1-4972-af34-54ccc32f37e2'::uuid),
  ('79f8011d-a236-4054-bee7-af10f1dbc632'::uuid))
select 'term', 'row', json_build_object(
  'label', ids.id,
  'matched_as', case when t.id = ids.id then 'term_id' else 'opportunity_customer_member_id' end,
  'term_id', t.id, 'cadence', t.cadence_key, 'amount_cents', t.amount_cents, 'state', t.state,
  'term_kind', t.term_kind, 'effective_start', t.effective_start, 'effective_end', t.effective_end,
  'child', cm.display_name, 'household', c.name, 'customer_id', c.id, 'customer_member_id', cm.id,
  'tuition_charges_by_month', (select json_object_agg(m, n) from (
      select to_char(ch.service_date, 'YYYY-MM') m, count(*) n from charges ch
       where ch.org_id = t.org_id and ch.billable_source_id = cm.id and ch.charge_category = 'tuition'
       group by 1) x)
)::text
from ids
left join enrollment_pricing_terms t on (t.id = ids.id or t.opportunity_customer_member_id = ids.id)
left join customer_members cm on cm.id = t.customer_member_id
left join customers c on c.id = cm.customer_id
