-- W5 AUTOPAY REAL-CLOCK CERTIFICATION CENSUS
--
-- Reconstructs the unattended chain from durable evidence, because the real clock fired at
-- 2026-09-29T21:00:01Z — before this run's Phase 0 finished. Nothing is reset and nothing is
-- manufactured; this reads what actually happened.
--
-- ONE statement, emitting question_id | kind | payload. No secrets: provider identifiers are
-- references, never credentials, and no PAN/CVC/client-secret column is selected.
WITH arrangement AS (
    SELECT id, org_id, customer_id, payer_entity_id, payment_method_id, status,
           effective_from, amount_policy, max_amount_cents, timing_policy, timing_offset_days,
           retry_policy, failure_count, last_attempt_at, last_failure_reason, authorized_at
    FROM public.payment_autopay_arrangements
    WHERE id = '0fa8c3b7-f4c7-4ccb-9fc5-68fa4999abd0'
),
sched AS (
    SELECT sw.id, sw.handler_key, sw.recurrence_kind, sw.interval_seconds,
           sw.next_due_at, sw.is_active, sw.domain_ref, sw.label
    FROM public.scheduled_work sw
    WHERE sw.domain_ref::text LIKE '%0fa8c3b7-f4c7-4ccb-9fc5-68fa4999abd0%'
),
occ AS (
    SELECT o.id, o.scheduled_work_id, o.handler_key, o.due_at, o.status,
           o.claimed_by, o.lease_expires_at, o.attempt_count,
           o.failure_reason, o.completed_at, o.created_at
    FROM public.scheduled_work_occurrences o
    WHERE o.scheduled_work_id IN (SELECT id FROM sched)
),
att AS (
    SELECT a.id, a.occurrence_id, a.handler_key, a.attempt_number, a.worker_id,
           a.started_at, a.finished_at, a.outcome, a.diagnostic
    FROM public.scheduled_work_attempts a
    WHERE a.occurrence_id IN (SELECT id FROM occ)
),
coll AS (
    -- No customer_id on this table: an attempt names the CHARGE it is collecting and the payer.
    SELECT c.id, c.org_id, c.processor, c.merchant_id, c.provider_account_ref, c.rail,
           c.billable_source_type, c.billable_source_id, c.charge_id, c.payer_person_id,
           c.payment_method_id, c.currency, c.requested_amount_cents, c.intent_key,
           c.provider_transaction_id, c.processor_state, c.processor_state_at,
           c.canonical_payment_id, c.canonical_posted_at, c.expected_settlement_on,
           c.created_at, c.updated_at
    FROM public.payment_collection_attempts c
    WHERE c.created_at > '2026-09-29T20:55:00Z'
),
evt AS (
    SELECT e.id, e.processor, e.provider_event_id, e.provider_event_type,
           e.connected_account_ref, e.org_id, e.provider_transaction_id,
           e.collection_attempt_id, e.disposition, e.disposition_detail,
           e.received_at, e.processed_at, e.provider_created_at
    FROM public.payment_provider_events e
    WHERE e.received_at > '2026-09-29T20:55:00Z'
)
SELECT 'w5_arrangement' AS question_id, 'row' AS kind, to_jsonb(a.*)::text AS payload FROM arrangement a
UNION ALL
SELECT 'w5_schedule', 'row', to_jsonb(s.*)::text FROM sched s
UNION ALL
SELECT 'w5_occurrence', 'row', to_jsonb(o.*)::text FROM occ o
UNION ALL
SELECT 'w5_attempt', 'row', to_jsonb(t.*)::text FROM att t
UNION ALL
SELECT 'w5_collection_attempt', 'row', to_jsonb(c.*)::text FROM coll c
UNION ALL
SELECT 'w5_provider_event', 'row', to_jsonb(e.*)::text FROM evt e
UNION ALL
SELECT 'w5_counts', 'scalar',
       json_build_object(
           'occurrences', (SELECT count(*) FROM occ),
           'attempts', (SELECT count(*) FROM att),
           'collection_attempts', (SELECT count(*) FROM coll),
           'provider_events', (SELECT count(*) FROM evt)
       )::text;
