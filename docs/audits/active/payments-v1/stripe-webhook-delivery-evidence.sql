-- Payments — HAS ANY STRIPE WEBHOOK EVER REACHED ALLOY? Read only, ONE statement.
--
-- Stripe reported 129 TEST-mode deliveries to https://staging-alloy.onrender.com/stripe/webhook,
-- all HTTP 404, starting 2026-09-20, with delivery to be stopped on 2026-09-29.
--
-- Measured independently of Stripe: that host returns 404 to a POST right now, and Alloy's canonical
-- route POST /api/stripe/webhook returns 400 "missing Stripe-Signature header" — alive, and refusing
-- an unsigned request exactly as the signature boundary should.
--
-- What remains unmeasured is the consequence: whether ANY provider event has ever been recorded.
-- `payment_provider_events` is the durable claim the adapter writes on admission, so an empty table
-- means the 404s are not a cosmetic delivery problem — they mean the provider lifecycle has never
-- reached this platform at all, and every downstream convergence (recognition, refunds, disputes,
-- mandate invalidation, readiness) has been running on nothing.
--
-- `connected_account_ref` is the Connect question: platform-account events carry none, and a
-- connected-account event is the only kind that can resolve a tenant through
-- payment_provider_merchants.
select
    'webhook_delivery' as question_id,
    'row' as kind,
    json_build_object(
        'events_total',            (select count(*) from public.payment_provider_events),
        'events_by_type',          (select json_object_agg(t, n) from (
                                        select provider_event_type as t, count(*) as n
                                        from public.payment_provider_events group by provider_event_type) x),
        'events_by_disposition',   (select json_object_agg(coalesce(d,'null'), n) from (
                                        select disposition as d, count(*) as n
                                        from public.payment_provider_events group by disposition) y),
        'with_connected_account',  (select count(*) from public.payment_provider_events where connected_account_ref is not null),
        'with_org_attributed',     (select count(*) from public.payment_provider_events where org_id is not null),
        'with_attempt_linked',     (select count(*) from public.payment_provider_events where collection_attempt_id is not null),
        'first_received_at',       (select min(received_at)::text from public.payment_provider_events),
        'last_received_at',        (select max(received_at)::text from public.payment_provider_events),
        'distinct_event_ids',      (select count(distinct provider_event_id) from public.payment_provider_events),
        -- The provider side of the same question: a merchant exists, so account.updated at least
        -- should have been deliverable since it was connected.
        'merchant_count',          (select count(*) from public.payment_provider_merchants where is_active),
        'merchant_readiness',      (select readiness from public.payment_provider_merchants where is_active order by created_at desc limit 1),
        'merchant_created_at',     (select created_at::text from public.payment_provider_merchants where is_active order by created_at desc limit 1),
        'collection_attempts',     (select count(*) from public.payment_collection_attempts),
        'payments_total',          (select count(*) from public.payments)
    )::text as payload;

-- RE-MEASURED 2026-09-25 after the operator reported the webhook infrastructure complete:
-- stale Render destination removed, canonical destination configured at
-- staging.workwithalloy.com/api/stripe/webhook, Connect delivery on, STRIPE_WEBHOOK_SECRET
-- provisioned, staging redeployed. A behaviour probe still answers
-- "no webhook signing secret is configured", so this asks whether any delivery has been admitted.
