-- W5 PRE-OCCURRENCE CENSUS — what the repaired Autopay should request at 2026-09-30T00:00:00Z.
--
-- Reads the FINANCIALS authorities for the suppression figure. Payments does not compute subsidy
-- economics and this census does not either: the suppression is read from the claim rows that own
-- it, and the collectible is the subtraction the canonical resolver already performs.
--
-- ONE statement, question_id | kind | payload. No secrets.
WITH arrangement AS (
    SELECT id, status, payment_method_id, payer_entity_id, amount_policy,
           max_amount_cents, timing_policy, timing_offset_days,
           failure_count, last_attempt_at, last_failure_reason
    FROM public.payment_autopay_arrangements
    WHERE id = '0fa8c3b7-f4c7-4ccb-9fc5-68fa4999abd0'
),
sched AS (
    SELECT id, handler_key, recurrence_kind, next_due_at, is_active
    FROM public.scheduled_work
    WHERE id = '77759009-7b12-4dd1-ab6c-d79506072cf1'
),
occs AS (
    SELECT id, due_at, status, claimed_by, attempt_count, completed_at
    FROM public.scheduled_work_occurrences
    WHERE scheduled_work_id = '77759009-7b12-4dd1-ab6c-d79506072cf1'
),
-- The charges this account can be collected against, with their canonical money position.
chg AS (
    SELECT c.id, c.due_date, c.status, c.amount_cents, c.currency_code,
           c.billable_source_type, c.billable_source_id
    FROM public.charges c
    WHERE c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
      AND c.status = 'posted'
      AND c.billable_source_id = '4e3aa47e-b9c8-4a56-92a7-4885ed0a7dba'
),
alloc AS (
    SELECT a.charge_id, sum(a.allocated_amount_cents) AS applied_cents
    FROM public.payment_allocations a
    WHERE a.charge_id IN (SELECT id FROM chg) AND a.reversed_at IS NULL
    GROUP BY a.charge_id
),
-- Submitted subsidy claims are the suppression the collection engine subtracts.
claims AS (
    SELECT sc.charge_id, sum(sc.claimed_amount_cents) AS submitted_cents
    FROM public.subsidy_claims sc
    WHERE sc.charge_id IN (SELECT id FROM chg)
    GROUP BY sc.charge_id
)
SELECT 'pre_arrangement' AS question_id, 'row' AS kind, to_jsonb(a.*)::text AS payload FROM arrangement a
UNION ALL
SELECT 'pre_schedule', 'row', to_jsonb(s.*)::text FROM sched s
UNION ALL
SELECT 'pre_occurrences', 'row', to_jsonb(o.*)::text FROM occs o
UNION ALL
SELECT 'pre_charge_position', 'row',
       json_build_object(
           'charge_id', c.id,
           'due_date', c.due_date,
           'amount_cents', c.amount_cents,
           'applied_cents', coalesce(al.applied_cents, 0),
           'outstanding_cents', c.amount_cents - coalesce(al.applied_cents, 0),
           'submitted_claim_cents', coalesce(cl.submitted_cents, 0),
           'expected_collectible_cents',
               greatest(0, c.amount_cents - coalesce(al.applied_cents, 0) - coalesce(cl.submitted_cents, 0))
       )::text
FROM chg c
LEFT JOIN alloc al ON al.charge_id = c.id
LEFT JOIN claims cl ON cl.charge_id = c.id;
