-- Payments V1 · W5 — WHICH ACCOUNT IS THE CERTIFICATION FIXTURE? Read only, ONE statement.
--
-- The merchant is card-ready and the webhook boundary is certified by real delivery. W5's remaining
-- requirement is one real-clock Autopay occurrence, which needs a fixture: an account with something
-- actually collectible, a payer, and a stored card.
--
-- The card is the one piece this lane cannot create. Stripe tokenization happens in the browser and
-- Alloy never sees the number — the design working, not an obstacle. So this measures everything
-- else, so the operator instruction can name one family rather than describe a shape.
--
-- Outstanding is approximated as posted charge amount minus ACTIVE allocations. The canonical figure
-- is readChargeBalance, and the handler re-resolves it live at collection; this only picks a candidate.
select
    'w5_fixture' as question_id,
    'row' as kind,
    json_build_object(
        'payment_methods_total',  (select count(*) from public.payment_methods),
        'autopay_total',          (select count(*) from public.payment_autopay_arrangements),
        'merchant_readiness',     (select readiness from public.payment_provider_merchants where is_active limit 1),
        'merchant_ach_readiness', (select ach_readiness from public.payment_provider_merchants where is_active limit 1),
        'direct_candidates', (select json_agg(row_to_json(c)) from (
            select
                cu.id   as customer_id,
                cu.name as account_name,
                count(*) as due_charges,
                min(ch.due_date)::text as earliest_due,
                sum(ch.amount_cents - coalesce((select sum(pa.allocated_amount_cents)
                                                  from public.payment_allocations pa
                                                 where pa.charge_id = ch.id
                                                   and pa.status = 'active'), 0)) as outstanding_cents
            from public.charges ch
            join public.customers cu on cu.id = ch.billable_source_id
            where ch.status = 'posted'
              and ch.billable_source_type = 'customer'
              and ch.due_date is not null
            group by cu.id, cu.name
            limit 8
        ) c),
        'agreement_candidates', (select json_agg(row_to_json(a)) from (
            select
                ea.customer_id,
                count(*) as due_charges,
                min(ch.due_date)::text as earliest_due,
                sum(ch.amount_cents - coalesce((select sum(pa.allocated_amount_cents)
                                                  from public.payment_allocations pa
                                                 where pa.charge_id = ch.id
                                                   and pa.status = 'active'), 0)) as outstanding_cents
            from public.charges ch
            join public.child_enrollment_agreements ea on ea.id = ch.billable_source_id
            where ch.status = 'posted'
              and ch.billable_source_type = 'enrollment_agreement'
              and ch.due_date is not null
            group by ea.customer_id
            limit 8
        ) a)
    )::text as payload;
