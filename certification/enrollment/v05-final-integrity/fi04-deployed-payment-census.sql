-- FI-04 deployed: QA family ZZQAFI120104 — every charge with its child subject, every payment with
-- its payer and processor, and every allocation (which charge each payment settled). Stripe test mode.
WITH fam AS (
    SELECT id FROM public.customers WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND name LIKE '%ZZQAFI120104%'
)
SELECT question_id, kind, payload
FROM (
    SELECT 'c1_charges' AS question_id, 'row' AS kind,
           concat_ws(' | ', left(c.id::text, 8), c.status, c.amount_cents::text,
                     'subject=' || left(coalesce(c.metadata ->> 'subject_customer_member_id', '-'), 8),
                     'source=' || coalesce(c.billable_source_type, '-')) AS payload
      FROM public.charges c
     WHERE c.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
       AND c.billable_source_type = 'customer' AND c.billable_source_id IN (SELECT id FROM fam)
    UNION ALL
    SELECT 'p1_payments', 'row',
           concat_ws(' | ', left(p.id::text, 8), coalesce(p.status, p.status_key, '-'), p.amount_cents::text, coalesce(p.direction, '-'),
                     'payer=' || coalesce(p.payer_entity_type, '-') || ':' || left(coalesce(p.payer_entity_id::text, '-'), 8),
                     'processor=' || coalesce(p.processor, '-'),
                     'txn=' || left(coalesce(p.processor_transaction_id, p.provider_payment_id, '-'), 8),
                     'posted=' || (p.posted_at IS NOT NULL OR p.posted_to_ledger_at IS NOT NULL)::text)
      FROM public.payments p
     WHERE p.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19' AND p.customer_id IN (SELECT id FROM fam)
    UNION ALL
    SELECT 'a1_allocations', 'row',
           concat_ws(' | ', left(a.payment_id::text, 8), '→ charge ' || left(coalesce(a.charge_id::text, a.target_entity_id::text), 8),
                     a.allocated_amount_cents::text, coalesce(a.status, '-'), coalesce(a.allocation_type, '-'))
      FROM public.payment_allocations a
     WHERE a.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
       AND a.payment_id IN (SELECT p.id FROM public.payments p WHERE p.customer_id IN (SELECT id FROM fam))
) q
ORDER BY question_id, payload;
