-- FIFTH PROOF — IS THE NEW CHARGE ACTUALLY DIVIDED, AND ARE THE SIX OLD ONES UNTOUCHED?
--
-- The fourth proof established that the arrangement inherits. It did NOT establish that the net is
-- divided: `financial_responsibility_allocations` was empty for every charge. This census asks both
-- halves of the Batch-1 close at once — that the ONE new charge reaches durable allocations, and
-- that the six pre-existing Certfree charges still carry none. The six are evidence; a count that
-- moved on them would mean a backfill, which is itself a defect.
--
-- The W7 defect was that PREVIEW responsibility did not become POSTED CHARGE responsibility, so the
-- invariant is identity between the standing arrangement and the persisted allocation. The surface
-- is not asked; the store is.
--
-- Fixture: Certfree Family, customer 7796a568-3b5f-4606-80f9-fee2dae2a419 — disposable, unreserved
-- by the W7 acceptance packet, one responsible party (Ada Certfree), configured to 100% through the
-- product immediately before one Field trip charge was added without touching Charge To.
--
-- GROUP BY names expressions, never output positions.
--
-- Nothing here writes.
--
-- q1  every charge on this account, so "exactly one submission -> exactly one charge" is countable
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'charge_id', c.id,
           'charge_type', c.charge_type,
           'status', c.status,
           'amount_cents', c.amount_cents,
           'service_date', c.service_date,
           'occurs_on', c.occurs_on,
           'billable_on', c.billable_on,
           'due_date', c.due_date,
           'billable_source_type', c.billable_source_type,
           'created_at', c.created_at,
           'created_by_set', (c.created_by IS NOT NULL),
           'source', c.metadata->>'source'
       )::text AS payload
FROM public.charges c
WHERE c.billable_source_id = '7796a568-3b5f-4606-80f9-fee2dae2a419'

UNION ALL

-- q2  the standing arrangement on the account, as the product saved it
SELECT 'q2', 'row',
       json_build_object(
           'arrangement_id', a.id,
           'state', a.state,
           'charge_id', a.charge_id,
           'effective_start', a.effective_start,
           'effective_end', a.effective_end,
           'created_at', a.created_at
       )::text
FROM public.financial_responsibility_arrangements a
WHERE a.customer_id = '7796a568-3b5f-4606-80f9-fee2dae2a419'

UNION ALL

-- q3  the shares of every arrangement on this account — the standing answer, in its own words
SELECT 'q3', 'row',
       json_build_object(
           'arrangement_id', s.arrangement_id,
           'arrangement_charge_id', a.charge_id,
           'arrangement_state', a.state,
           'responsible_party_id', s.responsible_party_id,
           'method', s.method,
           'percent_basis_points', s.percent_basis_points,
           'amount_cents', s.amount_cents
       )::text
FROM public.financial_responsibility_shares s
JOIN public.financial_responsibility_arrangements a ON a.id = s.arrangement_id
WHERE a.customer_id = '7796a568-3b5f-4606-80f9-fee2dae2a419'

UNION ALL

-- q4  the persisted ALLOCATION against each charge — what the charge actually ended up owing to whom
SELECT 'q4', 'row',
       json_build_object(
           'charge_id', al.charge_id,
           'responsible_party_id', al.responsible_party_id,
           'assigned_amount_cents', al.assigned_amount_cents,
           'is_unassigned', al.is_unassigned,
           'basis', al.basis,
           'explanation', al.explanation,
           'arrangement_id', al.arrangement_id,
           'state', al.state,
           'created_at', al.created_at
       )::text
FROM public.financial_responsibility_allocations al
JOIN public.charges c ON c.id = al.charge_id
WHERE c.billable_source_id = '7796a568-3b5f-4606-80f9-fee2dae2a419'

UNION ALL

-- q5  allocations per charge as a COUNT — "the new charge only" has to be countable, not eyeballed.
--     GROUP BY names the expressions; position 3 is the json_build_object holding count(*).
SELECT 'q5', 'row',
       json_build_object(
           'charge_id', c.id,
           'service_date', c.service_date,
           'allocation_count', count(al.id),
           'allocated_cents', coalesce(sum(al.assigned_amount_cents), 0),
           'charge_cents', c.amount_cents,
           'divided', (count(al.id) > 0)
       )::text
FROM public.charges c
LEFT JOIN public.financial_responsibility_allocations al ON al.charge_id = c.id
WHERE c.billable_source_id = '7796a568-3b5f-4606-80f9-fee2dae2a419'
GROUP BY c.id, c.service_date, c.amount_cents

ORDER BY 1
