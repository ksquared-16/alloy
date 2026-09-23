-- Payments — WHY DOES A COMPLETED STRIPE TEST ONBOARDING MAP TO `restricted`? Read only, ONE statement.
--
-- The operator finished Stripe-hosted onboarding, chose a payout test account and a payout schedule,
-- and returned to Alloy. Alloy then rendered "Needs attention" with both rails unavailable.
--
-- Alloy's mapping is three lines: charges_enabled true is ready, else details_submitted true is
-- restricted, else onboarding_incomplete. So `restricted` means Stripe answered
-- details_submitted = true AND charges_enabled != true. The question this census exists to settle is
-- WHY Stripe says that, and `readiness_detail` is the only place the provider's own answer survives:
-- persistReadiness records disabled_reason and the COUNTS of currently_due and past_due.
--
-- That distinction decides the whole investigation:
--   · outstanding requirement counts, or a disabled_reason naming missing information
--        -> Stripe genuinely wants more, and the repair is operator-safe language, not a mapping change
--   · zero due, and a disabled_reason like pending verification
--        -> nothing is owed by the operator; the account is being reviewed and will settle by itself
--   · nothing anywhere, yet charges are disabled
--        -> the v1 projection of a v2 account is not carrying the fact, and the mapping is wrong
--
-- No KYC value is read. Counts and state only.
select
    'provider_readiness' as question_id,
    'row' as kind,
    json_build_object(
        'merchant_count',        (select count(*) from public.payment_provider_merchants),
        'active_count',          (select count(*) from public.payment_provider_merchants where is_active),
        'processor',             (select processor from public.payment_provider_merchants where is_active order by created_at desc limit 1),
        'readiness',             (select readiness from public.payment_provider_merchants where is_active order by created_at desc limit 1),
        'ach_readiness',         (select ach_readiness from public.payment_provider_merchants where is_active order by created_at desc limit 1),
        'readiness_checked_at',  (select readiness_checked_at::text from public.payment_provider_merchants where is_active order by created_at desc limit 1),
        'readiness_detail',      (select readiness_detail::text from public.payment_provider_merchants where is_active order by created_at desc limit 1),
        'account_ref_prefix',    (select left(provider_account_ref, 5) from public.payment_provider_merchants where is_active order by created_at desc limit 1),
        'created_at',            (select created_at::text from public.payment_provider_merchants where is_active order by created_at desc limit 1),
        'seconds_since_checked', (select round(extract(epoch from (now() - readiness_checked_at)))
                                    from public.payment_provider_merchants where is_active order by created_at desc limit 1),
        -- W5 is waiting on this: nothing can be enrolled until a method exists, and no method can
        -- exist until the merchant can charge.
        'payment_methods_total', (select count(*) from public.payment_methods),
        'autopay_total',         (select count(*) from public.payment_autopay_arrangements)
    )::text as payload;
