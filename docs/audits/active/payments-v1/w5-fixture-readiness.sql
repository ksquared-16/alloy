-- Payments V1 · W5 — WHICH ACCOUNT IS THE CERTIFICATION FIXTURE? Read only, ONE statement.
--
-- The merchant is card-ready and the webhook boundary is certified. W5's remaining requirement is one
-- real-clock Autopay occurrence, and that needs a fixture: an account with something actually
-- collectible, a payer, and a stored card.
--
-- The card is the one piece this lane cannot create — Stripe tokenization happens in the browser and
-- Alloy never sees the number, which is the design working rather than an obstacle. So this measures
-- everything ELSE, so the operator instruction can name one family rather than describe a shape.
--
-- Outstanding is approximated here as posted charge amount minus active allocations. The canonical
-- figure is readChargeBalance and the handler re-resolves it live at collection; this is only for
-- choosing a candidate.
select
    'w5_fixture' as question_id,
    'row' as kind,
    json_build_object(
        'payment_methods_total',   (select count(*) from public.payment_methods),
        'autopay_total',           (select count(*) from public.payment_autopay_arrangements),
        'merchant_readiness',      (select readiness from public.payment_provider_merchants where is_active limit 1),
        'merchant_ach_readiness',  (select ach_readiness from public.payment_provider_merchants where is_active limit 1),
        'candidates', (select json_agg(row_to_json(c) order by (c.outstanding_cents) desc)
                         from (
                             select
                                 cu.id                                   as customer_id,
                                 cu.name                                 as account_name,
                                 count(ch.id)                            as posted_charges,
                                 count(ch.due_date)                      as charges_with_due_date,
                                 min(ch.due_date)::text                  as earliest_due,
                                 max(ch.due_date)::text                  as latest_due,
                                 coalesce(sum(ch.amount_cents), 0)
                                   - coalesce((select sum(pa.amount_cents)
                                                 from public.payment_allocations pa
                                                where pa.charge_id = any(array_agg(ch.id))
                                                  and pa.status = 'active'), 0) as outstanding_cents
                             from public.customers cu
                             join public.charges ch
                               on ch.org_id = cu.org_id
                              and ch.status = 'posted'
                              and ch.billable_source_type = 'customer'
                              and ch.billable_source_id = cu.id
                             group by cu.id, cu.name
                             having count(ch.due_date) > 0
                             limit 8
                         ) c),
        -- Tuition bills to the agreement rather than the customer, so count that path too.
        'agreement_charge_accounts', (select count(distinct ea.customer_id)
                                        from public.child_enrollment_agreements ea
                                        join public.charges ch
                                          on ch.billable_source_type = 'enrollment_agreement'
                                         and ch.billable_source_id = ea.id
                                         and ch.status = 'posted'
                                         and ch.due_date is not null)
    )::text as payload;
