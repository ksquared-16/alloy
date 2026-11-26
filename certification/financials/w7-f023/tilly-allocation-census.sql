-- W7-F023 — Tilly Tuition's November tuition draft after the governed Resolve: its allocations (all states)
-- and the charge itself (amount, dates, status). Read-only.
select 'allocation', 'row', json_build_object('label', a.state, 'party', p.full_name, 'assigned_cents', a.assigned_amount_cents,
  'basis', a.basis, 'basis_value', a.basis_value, 'is_unassigned', a.is_unassigned, 'net_snapshot_cents', a.net_snapshot_cents,
  'arrangement_is_tuition_family', a.arrangement_id = 'fd000000-0000-4000-8000-0000007e0006'::uuid, 'created_at', a.created_at)::text
  from financial_responsibility_allocations a left join persons p on p.id = a.responsible_party_id
 where a.charge_id = 'cd67ecc2-480e-40db-8a75-a48e371a24b4'::uuid
union all
select 'charge', 'row', json_build_object('label', c.status, 'amount_cents', c.amount_cents, 'service_date', c.service_date,
  'billable_on', c.billable_on, 'due_date', c.due_date, 'posted_at', c.posted_at, 'updated_at', c.updated_at)::text
  from charges c where c.id = 'cd67ecc2-480e-40db-8a75-a48e371a24b4'::uuid
