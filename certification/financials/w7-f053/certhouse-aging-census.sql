-- W7-F053 — Certhouse Family: every owed charge row with the facts Past due (accountDueClassification)
-- and automatic settlement (planSettlement → resolveFamilyCollectible) each read, so the two totals
-- can be reconciled to the cent. Read-only. One statement; one row per charge: charge|row|<json>.
with hh as (select '29944d3e-8267-45b7-8dcb-7405060e2573'::uuid as id),
src as (
  select hh.id as source_id from hh
  union all
  select a.id from child_enrollment_agreements a, hh where a.customer_id = hh.id
),
ch as (
  select c.* from charges c
  where c.billable_source_id in (select source_id from src)
    and c.status in ('posted','partially_paid','paid')
)
select 'charge', 'row', json_build_object(
  'id', ch.id,
  'org_id', ch.org_id,
  'category', ch.charge_category,
  'description', ch.description,
  'status', ch.status,
  'amount_cents', ch.amount_cents,
  'due_date', ch.due_date,
  'billable_on', ch.billable_on,
  'correction_kind', ch.metadata->>'correction_kind',
  'source_charge_id', ch.source_charge_id,
  'child', (select m.display_name from child_enrollment_agreements a join customer_members m on m.id = a.customer_member_id where a.id = ch.billable_source_id),
  'applied_posted_cents', coalesce((select sum(pa.allocated_amount_cents) from payment_allocations pa join payments p on p.id = pa.payment_id
       where pa.charge_id = ch.id and pa.status = 'active' and p.status = 'posted'), 0),
  'applied_posted_agency_cents', coalesce((select sum(pa.allocated_amount_cents) from payment_allocations pa join payments p on p.id = pa.payment_id
       where pa.charge_id = ch.id and pa.status = 'active' and p.status = 'posted' and p.payer_entity_type = 'agency'), 0),
  'linked_negative_cents', coalesce((select sum(x.amount_cents) from charges x where x.source_charge_id = ch.id and x.amount_cents < 0
       and x.status <> 'void' and coalesce(x.metadata->>'correction_kind','') <> 'reversal'), 0),
  'reversed', exists(select 1 from charges x where x.source_charge_id = ch.id and x.metadata->>'correction_kind' = 'reversal' and x.status <> 'void'),
  'reductions_cents', coalesce((select sum(r.amount_cents) from financial_reduction_applications r where r.source_charge_id = ch.id), 0),
  'responsibility', coalesce((select json_agg(json_build_object(
        'alloc_id', fra.id, 'unassigned', fra.is_unassigned, 'party', (select p.full_name from persons p where p.id = fra.responsible_party_id),
        'assigned_cents', fra.assigned_amount_cents,
        'attributed_active_cents', coalesce((select sum(at.amount_cents) from payment_responsibility_attributions at join payment_allocations pa on pa.id = at.payment_allocation_id
              where at.responsibility_allocation_id = fra.id and pa.status = 'active'), 0),
        'funding', coalesce((select json_agg(json_build_object('basis', f.basis, 'expected_cents', f.expected_amount_cents, 'bps', f.percent_basis_points))
              from financial_expected_funding f where f.state = 'active' and (f.allocation_id = fra.id or (f.allocation_id is null and f.share_id = fra.share_id))), '[]'::json)))
     from financial_responsibility_allocations fra where fra.charge_id = ch.id and fra.state = 'active'), '[]'::json),
  'claims', coalesce((select json_agg(json_build_object('claimed_cents', l.claimed_amount_cents, 'state', cl.state,
        'open_variance_cents', coalesce((select sum(v.variance_cents) from financial_subsidy_variances v where v.claim_line_id = l.id and v.resolution_kind is null), 0)))
     from financial_subsidy_claim_lines l join financial_subsidy_claims cl on cl.id = l.claim_id where l.charge_id = ch.id), '[]'::json)
)::text
from ch
order by ch.due_date nulls last, ch.id
