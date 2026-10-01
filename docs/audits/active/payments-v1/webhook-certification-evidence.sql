-- Payments — THE FIRST REAL STRIPE DELIVERIES, in detail. Read only, ONE statement.
--
-- payment_provider_events was empty at 15:51 today and carries two rows now. They arrived at
-- 16:12:15 and 16:13:12, which is exactly the window in which the connected account transitioned
-- reviewing -> ready, and the merchant's readiness_checked_at is 16:13:12.851 — the same moment as
-- the second event. So the webhook did not merely arrive; it DROVE the readiness convergence.
--
-- This reads only safe metadata. No payload, no KYC, no secret. The account reference is truncated
-- to its prefix because the full identifier is adapter detail, not operator or evidence material.
--
-- What each column proves:
--   provider_event_id      a real Stripe event identity, distinct per delivery
--   connected_account_ref  the event was a CONNECTED-ACCOUNT event — the only kind that can resolve
--                          a tenant, and the thing a platform-account event could never establish
--   org_id                 tenancy was resolved, and resolved through payment_provider_merchants
--   disposition            the adapter's own verdict on what it did with the event
--   provider_created_at    Stripe's clock, retained alongside ours
select
    'webhook_certification' as question_id,
    'row' as kind,
    json_build_object(
        'rows', (select json_agg(row_to_json(e) order by e.received_at)
                   from (
                       select
                           left(provider_event_id, 12) || '…'      as event_id_prefix,
                           provider_event_type                      as event_type,
                           processor,
                           left(connected_account_ref, 10) || '…'   as connected_account_prefix,
                           (org_id is not null)                     as org_attributed,
                           (org_id = (select org_id from public.payment_provider_merchants
                                       where provider_account_ref = pe.connected_account_ref
                                         and is_active limit 1))    as org_matches_merchant,
                           disposition,
                           disposition_detail,
                           received_at::text,
                           processed_at::text,
                           provider_created_at::text
                       from public.payment_provider_events pe
                       order by received_at
                   ) e),
        'distinct_event_ids',   (select count(distinct provider_event_id) from public.payment_provider_events),
        'total_rows',           (select count(*) from public.payment_provider_events),
        -- Idempotency shape: a repeated Stripe event id must never become a second row.
        'max_rows_per_event_id',(select max(n) from (
                                    select count(*) as n from public.payment_provider_events
                                    group by provider_event_id) c),
        'merchant_readiness',   (select readiness from public.payment_provider_merchants where is_active limit 1),
        'merchant_checked_at',  (select readiness_checked_at::text from public.payment_provider_merchants where is_active limit 1)
    )::text as payload;
