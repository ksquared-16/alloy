-- The household payment views stop scanning the whole org, one receipt-source at a time.
--
-- MEASURED, against the certification tenant, boundary by boundary:
--
--   1. payments ORG-WIDE paged scan   3,517 rows   1.43 MB   4 sequential pages
--   2. household per billable source     66 sources          65 SEQUENTIAL reads
--   3. payment_allocations by payment 3,547 rows   1.08 MB  ~40 batches
--   4. charges those applications name 3,175 rows    457 KB  ~40 batches
--   5. customers (payer names)             1 row       80 B   1
--
-- Roughly 150 sequential round trips. On the local stack that is 502 ms; on the hosted primary it
-- is the 1,131-4,211 ms `payments;dur` span that is now the Financials pole.
--
-- The shape is the cost, not the rows. `resolveHouseholdPaymentViews` reads EVERY inbound receipt
-- in the organisation, then discovers which household each one belongs to by resolving its
-- billable source ONE AT A TIME, then throws away the 319 that are not this family's (3,517
-- scanned, 3,198 kept, measured on the certification tenant). The comment
-- above that read says so plainly and defers the narrowing to a later change. This is that change.
--
-- The account fact bundle already resolves the household's billable sources server-side, so the
-- receipts can be selected by them directly — which is what `payments_by_source` has always done.
-- What remains is to carry the few columns and the few dependent sets the views also consume.
--
-- WHAT THIS DOES NOT DO
--
-- It decides nothing. Payer identity, payment method, application, status, provider state,
-- autopay, recognition, collectibility and available prepaid are all still decided by the
-- canonical application code that owns them. This returns rows: the same rows, the same columns,
-- under the same predicates. `direction = inbound` and `refunds_payment_id IS NULL` are
-- deliberately NOT applied here — they are the views resolver's rule and stay with it, so the
-- superset travels and each consumer keeps its own filter.
--
-- PRIVILEGE
--
-- PostgreSQL grants EXECUTE to PUBLIC by default, and the deployed catalog confirmed it:
-- `=X/postgres` alongside authenticated and service_role. RLS is on for payments, charges and
-- customers, and the function is SECURITY INVOKER, so PUBLIC could never read what it was not
-- already entitled to — but a default is not a decision. The inspected runtime contract has ONE
-- caller: `app/api/admin/financials/card/route.ts`, through `createAdminClient()`, which is
-- service_role. So EXECUTE is revoked from PUBLIC and from authenticated, and granted to
-- service_role explicitly.

BEGIN;

CREATE OR REPLACE FUNCTION public.financials_account_fact_bundle(
    p_org_id uuid,
    p_customer_id uuid,
    p_customer_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_agreement_ids uuid[];
    v_member_ids uuid[];
    v_customer_id uuid;
    v_source_ids uuid[];
    v_charge_ids uuid[];
    v_policy_ids uuid[];
    v_payment_ids uuid[];
    v_household_payment_ids uuid[];
    v_view_agreement_ids uuid[];
    v_view_source_ids uuid[];
    v_alloc_charge_ids uuid[];
    v_payer_ids uuid[];
    v_alloc_ids uuid[];
    v_share_ids uuid[];
    v_party_ids uuid[];
    v_claim_ids uuid[];
    v_line_ids uuid[];
    v_result jsonb;
BEGIN
    SELECT array_agg(a.id), array_agg(DISTINCT a.customer_member_id)
      INTO v_agreement_ids, v_member_ids
      FROM public.child_enrollment_agreements a
     WHERE a.org_id = p_org_id
       AND (
            (p_customer_member_id IS NOT NULL AND a.customer_member_id = p_customer_member_id)
         OR (p_customer_member_id IS NULL AND a.customer_id = p_customer_id)
       );
    v_agreement_ids := coalesce(v_agreement_ids, ARRAY[]::uuid[]);
    v_member_ids := coalesce(v_member_ids, ARRAY[]::uuid[]);

    v_customer_id := p_customer_id;
    IF v_customer_id IS NULL THEN
        SELECT a.customer_id INTO v_customer_id
          FROM public.child_enrollment_agreements a
         WHERE a.org_id = p_org_id AND a.id = ANY(v_agreement_ids) AND a.customer_id IS NOT NULL
         LIMIT 1;
    END IF;

    v_source_ids := v_agreement_ids;
    IF v_customer_id IS NOT NULL THEN
        v_source_ids := v_source_ids || v_customer_id;
    END IF;

    SELECT array_agg(c.id) INTO v_charge_ids
      FROM public.charges c
     WHERE c.org_id = p_org_id AND c.billable_source_id = ANY(v_source_ids);
    v_charge_ids := coalesce(v_charge_ids, ARRAY[]::uuid[]);

    SELECT array_agg(DISTINCT r.commercial_policy_id) INTO v_policy_ids
      FROM public.financial_reduction_applications r
     WHERE r.org_id = p_org_id AND r.enrollment_agreement_id = ANY(v_agreement_ids)
       AND r.commercial_policy_id IS NOT NULL;
    v_policy_ids := coalesce(v_policy_ids, ARRAY[]::uuid[]);

    /*
     * ── THE RECEIPTS RESOLVE THE HOUSEHOLD SLIGHTLY MORE WIDELY THAN THE LEDGER ─────────────────
     *
     * `child_enrollment_agreements.customer_id` is NULLABLE. The ledger's agreement set matches it
     * directly and always has. `resolveBillableSourceHouseholdId`, which the payment views use,
     * does not: when the column is null it falls back to the CHILD's household through
     * `customer_members.customer_id`.
     *
     * So the views' set is a superset of the ledger's, and this reproduces that rule rather than
     * quietly picking one. On the certification tenant the two coincide exactly — it holds no
     * agreement with a null `customer_id` — so this branch is faithful to the resolver by
     * construction rather than by measurement, and is called out here for that reason.
     */
    SELECT array_agg(a.id) INTO v_view_agreement_ids
      FROM public.child_enrollment_agreements a
      LEFT JOIN public.customer_members m
             ON m.org_id = a.org_id AND m.id = a.customer_member_id
     WHERE a.org_id = p_org_id
       AND (
            (p_customer_member_id IS NOT NULL AND a.customer_member_id = p_customer_member_id)
         OR (p_customer_member_id IS NULL AND (
                a.customer_id = p_customer_id
             OR (a.customer_id IS NULL AND m.customer_id = p_customer_id)
            ))
       );
    v_view_agreement_ids := coalesce(v_view_agreement_ids, ARRAY[]::uuid[]);
    v_view_source_ids := v_view_agreement_ids;
    IF v_customer_id IS NOT NULL THEN
        v_view_source_ids := v_view_source_ids || v_customer_id;
    END IF;

    SELECT array_agg(p.id), array_agg(DISTINCT p.customer_id) FILTER (WHERE p.customer_id IS NOT NULL)
      INTO v_household_payment_ids, v_payer_ids
      FROM public.payments p
     WHERE p.org_id = p_org_id
       AND p.billable_source_type = ANY(ARRAY['enrollment_agreement','customer'])
       AND p.billable_source_id = ANY(v_view_source_ids);
    v_household_payment_ids := coalesce(v_household_payment_ids, ARRAY[]::uuid[]);
    v_payer_ids := coalesce(v_payer_ids, ARRAY[]::uuid[]);

    /*
     * Allocations reach this account two ways and NEITHER contains the other: a payment outside
     * the household can be applied to one of its charges, and one of its receipts can be applied
     * to a charge outside the account. The union travels; each consumer applies its own key.
     */
    SELECT array_agg(DISTINCT pa.payment_id) FILTER (WHERE pa.payment_id IS NOT NULL),
           array_agg(DISTINCT pa.charge_id) FILTER (WHERE pa.charge_id IS NOT NULL)
      INTO v_payment_ids, v_alloc_charge_ids
      FROM public.payment_allocations pa
     WHERE pa.org_id = p_org_id
       AND (pa.charge_id = ANY(v_charge_ids) OR pa.payment_id = ANY(v_household_payment_ids));
    v_payment_ids := coalesce(v_payment_ids, ARRAY[]::uuid[]);
    v_alloc_charge_ids := coalesce(v_alloc_charge_ids, ARRAY[]::uuid[]);

    SELECT array_agg(ra.id),
           array_agg(DISTINCT ra.share_id) FILTER (WHERE ra.share_id IS NOT NULL),
           array_agg(DISTINCT ra.responsible_party_id) FILTER (WHERE ra.responsible_party_id IS NOT NULL AND ra.is_unassigned IS NOT TRUE)
      INTO v_alloc_ids, v_share_ids, v_party_ids
      FROM public.financial_responsibility_allocations ra
     WHERE ra.org_id = p_org_id AND ra.state = 'active' AND ra.charge_id = ANY(v_charge_ids);
    v_alloc_ids := coalesce(v_alloc_ids, ARRAY[]::uuid[]);
    v_share_ids := coalesce(v_share_ids, ARRAY[]::uuid[]);
    v_party_ids := coalesce(v_party_ids, ARRAY[]::uuid[]);

    SELECT array_agg(DISTINCT cl.claim_id), array_agg(cl.id)
      INTO v_claim_ids, v_line_ids
      FROM public.financial_subsidy_claim_lines cl
     WHERE cl.org_id = p_org_id AND cl.charge_id = ANY(v_charge_ids);
    v_claim_ids := coalesce(v_claim_ids, ARRAY[]::uuid[]);
    v_line_ids := coalesce(v_line_ids, ARRAY[]::uuid[]);

    SELECT jsonb_build_object(
        'resolved_customer_id', to_jsonb(v_customer_id),

        'agreements', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', a.id, 'customer_member_id', a.customer_member_id,
                'customer_id', a.customer_id, 'status', a.status))
            FROM public.child_enrollment_agreements a
            WHERE a.org_id = p_org_id AND a.id = ANY(v_agreement_ids)), '[]'::jsonb),

        'members', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', m.id, 'first_name', m.first_name, 'last_name', m.last_name,
                'display_name', m.display_name, 'person_id', m.person_id))
            FROM public.customer_members m
            WHERE m.org_id = p_org_id AND m.id = ANY(v_member_ids)), '[]'::jsonb),

        'reductions_by_agreement', coalesce((
            SELECT jsonb_agg(to_jsonb(r))
            FROM (
                SELECT r.id, r.reduction_kind, r.enrollment_agreement_id, r.customer_member_id,
                       r.charge_id, r.source_charge_id, r.amount_cents, r.currency_code, r.reason,
                       r.period_key, r.created_at, r.reversed_by_id, r.reverses_id,
                       r.commercial_policy_id, r.policy_kind, r.basis, r.basis_value,
                       r.basis_amount_cents, r.capped, r.explanation, r.period_start, r.period_end
                FROM public.financial_reduction_applications r
                WHERE r.org_id = p_org_id AND r.enrollment_agreement_id = ANY(v_agreement_ids)
            ) r), '[]'::jsonb),

        'commercial_policies', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', cp.id, 'effective_start', cp.effective_start,
                'effective_end', cp.effective_end, 'is_active', cp.is_active))
            FROM public.commercial_policies cp
            WHERE cp.org_id = p_org_id AND cp.id = ANY(v_policy_ids)), '[]'::jsonb),

        'charges', coalesce((
            SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
            FROM (
                SELECT c.id, c.billable_source_type, c.billable_source_id, c.source_charge_id,
                       c.charge_category, c.charge_type, c.status, c.amount_cents, c.currency_code,
                       c.charge_template_id, c.service_date, c.occurs_on, c.billable_on,
                       c.due_date, c.posted_at, c.voided_at, c.description, c.metadata, c.created_at
                FROM public.charges c
                WHERE c.org_id = p_org_id AND c.billable_source_id = ANY(v_source_ids)
            ) c), '[]'::jsonb),

        /* The charges the APPLICATIONS name, which may sit outside this account's own sources. */
        'charges_for_allocations', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', c.id, 'description', c.description,
                'charge_category', c.charge_category, 'service_date', c.service_date))
            FROM public.charges c
            WHERE c.org_id = p_org_id AND c.id = ANY(v_alloc_charge_ids)), '[]'::jsonb),

        'reductions_by_charge', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'source_charge_id', r.source_charge_id, 'amount_cents', r.amount_cents))
            FROM public.financial_reduction_applications r
            WHERE r.org_id = p_org_id AND r.source_charge_id = ANY(v_charge_ids)), '[]'::jsonb),

        'payment_allocations', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', pa.id, 'charge_id', pa.charge_id, 'payment_id', pa.payment_id,
                'allocated_amount_cents', pa.allocated_amount_cents, 'status', pa.status,
                'allocated_at', pa.allocated_at, 'reversed_at', pa.reversed_at,
                'reversal_reason', pa.reversal_reason))
            FROM public.payment_allocations pa
            WHERE pa.org_id = p_org_id
              AND (pa.charge_id = ANY(v_charge_ids) OR pa.payment_id = ANY(v_household_payment_ids))), '[]'::jsonb),

        'responsibility_allocations', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', ra.id, 'charge_id', ra.charge_id,
                'responsible_party_id', ra.responsible_party_id,
                'is_unassigned', ra.is_unassigned,
                'assigned_amount_cents', ra.assigned_amount_cents, 'share_id', ra.share_id))
            FROM public.financial_responsibility_allocations ra
            WHERE ra.org_id = p_org_id AND ra.state = 'active'
              AND ra.charge_id = ANY(v_charge_ids)), '[]'::jsonb),

        'subsidy_claim_lines', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', cl.id, 'charge_id', cl.charge_id, 'claim_id', cl.claim_id,
                'claimed_amount_cents', cl.claimed_amount_cents))
            FROM public.financial_subsidy_claim_lines cl
            WHERE cl.org_id = p_org_id AND cl.charge_id = ANY(v_charge_ids)), '[]'::jsonb),

        'payments_backing', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', p.id, 'status', p.status, 'payer_entity_type', p.payer_entity_type))
            FROM public.payments p
            WHERE p.org_id = p_org_id AND p.id = ANY(v_payment_ids)), '[]'::jsonb),

        'responsibility_attributions', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'responsibility_allocation_id', at.responsibility_allocation_id,
                'amount_cents', at.amount_cents))
            FROM public.payment_responsibility_attributions at
            WHERE at.org_id = p_org_id
              AND at.responsibility_allocation_id = ANY(v_alloc_ids)), '[]'::jsonb),

        'responsible_persons', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name,
                'full_name', pr.full_name))
            FROM public.persons pr
            WHERE pr.org_id = p_org_id AND pr.id = ANY(v_party_ids)), '[]'::jsonb),

        'funding_by_allocation', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'expected_amount_cents', f.expected_amount_cents,
                'percent_basis_points', f.percent_basis_points,
                'basis', f.basis, 'allocation_id', f.allocation_id, 'share_id', f.share_id))
            FROM public.financial_expected_funding f
            WHERE f.org_id = p_org_id AND f.state = 'active'
              AND f.allocation_id = ANY(v_alloc_ids)), '[]'::jsonb),

        'funding_by_share', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'expected_amount_cents', f.expected_amount_cents,
                'percent_basis_points', f.percent_basis_points,
                'basis', f.basis, 'allocation_id', f.allocation_id, 'share_id', f.share_id))
            FROM public.financial_expected_funding f
            WHERE f.org_id = p_org_id AND f.state = 'active'
              AND f.allocation_id IS NULL AND f.share_id = ANY(v_share_ids)), '[]'::jsonb),

        'funding_for_responsibility', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'funding_source_label', f.funding_source_label,
                'funding_source_type', f.funding_source_type,
                'expected_amount_cents', f.expected_amount_cents,
                'percent_basis_points', f.percent_basis_points, 'state', f.state))
            FROM public.financial_expected_funding f
            WHERE f.org_id = p_org_id AND f.state = 'active'
              AND f.share_id = ANY(v_share_ids)), '[]'::jsonb),

        'subsidy_claims', coalesce((
            SELECT jsonb_agg(jsonb_build_object('id', cm.id, 'state', cm.state))
            FROM public.financial_subsidy_claims cm
            WHERE cm.org_id = p_org_id AND cm.id = ANY(v_claim_ids)), '[]'::jsonb),

        'subsidy_variances', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'claim_line_id', v.claim_line_id, 'variance_cents', v.variance_cents,
                'state', v.state, 'resolution_kind', v.resolution_kind))
            FROM public.financial_subsidy_variances v
            WHERE v.org_id = p_org_id AND v.claim_line_id = ANY(v_line_ids)), '[]'::jsonb),

        'collection_attempts', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', ca.id, 'rail', ca.rail, 'processor_state', ca.processor_state,
                'provider_action_type', ca.provider_action_type, 'charge_id', ca.charge_id,
                'requested_amount_cents', ca.requested_amount_cents, 'currency', ca.currency,
                'updated_at', ca.updated_at, 'canonical_payment_id', ca.canonical_payment_id))
            FROM public.payment_collection_attempts ca
            WHERE ca.org_id = p_org_id AND ca.charge_id = ANY(v_charge_ids)
              AND ca.canonical_payment_id IS NULL), '[]'::jsonb),

        /*
         * The household's receipts. `direction` and `refunds_payment_id` travel so the views
         * resolver can apply its own inbound/not-a-refund rule, which is its rule and not SQL's.
         */
        /* The VIEWS' receipts, under the resolver's own wider household rule. */
        'payments_for_views', coalesce((
            SELECT jsonb_agg(to_jsonb(p) ORDER BY p.received_at DESC NULLS LAST, p.id)
            FROM (
                SELECT p.id, p.direction, p.refunds_payment_id, p.reversal_origin, p.amount_cents,
                       p.currency, p.status, p.payment_method, p.processor, p.received_at,
                       p.posted_at, p.reference_number, p.notes, p.processor_transaction_id,
                       p.customer_id, p.billable_source_type, p.billable_source_id
                FROM public.payments p
                WHERE p.org_id = p_org_id
                  AND p.billable_source_type = ANY(ARRAY['enrollment_agreement','customer'])
                  AND p.billable_source_id = ANY(v_view_source_ids)
            ) p), '[]'::jsonb),

        /* The LEDGER's receipts, under the agreement set the ledger has always used. */
        'payments_by_source', coalesce((
            SELECT jsonb_agg(to_jsonb(p) ORDER BY p.received_at DESC NULLS LAST, p.id)
            FROM (
                SELECT p.id, p.direction, p.refunds_payment_id, p.reversal_origin, p.amount_cents,
                       p.currency, p.status, p.payment_method, p.processor, p.received_at,
                       p.posted_at, p.reference_number, p.notes, p.processor_transaction_id,
                       p.customer_id, p.billable_source_type, p.billable_source_id
                FROM public.payments p
                WHERE p.org_id = p_org_id
                  AND p.billable_source_type = ANY(ARRAY['enrollment_agreement','customer'])
                  AND p.billable_source_id = ANY(v_source_ids)
            ) p), '[]'::jsonb),

        /*
         * What has been given back out of these receipts. Refunds are outbound rows pointing at a
         * payment, and the views asked for them ONE RECEIPT AT A TIME — an awaited read per view,
         * alongside the unapplied read beside it, which is the bulk of what the payment views cost.
         * The `status <> voided` rule is NOT applied here: it belongs to `readPaymentRefundedCents`
         * and stays there, so the superset travels and the authority keeps its own filter.
         */
        'payment_refunds', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', p.id, 'refunds_payment_id', p.refunds_payment_id,
                'amount_cents', p.amount_cents, 'status', p.status))
            FROM public.payments p
            WHERE p.org_id = p_org_id
              AND p.refunds_payment_id = ANY(v_household_payment_ids)), '[]'::jsonb),

        /* The households those receipts were taken against — named, never inferred from a child. */
        'payer_customers', coalesce((
            SELECT jsonb_agg(jsonb_build_object('id', cu.id, 'name', cu.name))
            FROM public.customers cu
            WHERE cu.org_id = p_org_id AND cu.id = ANY(v_payer_ids)), '[]'::jsonb),

        'counts', jsonb_build_object(
            'agreements', coalesce(array_length(v_agreement_ids, 1), 0),
            'charges', coalesce(array_length(v_charge_ids, 1), 0),
            'allocations', coalesce(array_length(v_alloc_ids, 1), 0),
            'claim_lines', coalesce(array_length(v_line_ids, 1), 0),
            'household_payments', coalesce(array_length(v_household_payment_ids, 1), 0)
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.financials_account_fact_bundle(uuid, uuid, uuid) IS
'Gathers the Financials card''s dependent fact chain, including the household''s own receipts and '
'what they name, in one round trip. Returns rows only; every figure is still computed by the '
'canonical application authorities. SECURITY INVOKER, org-scoped on every statement.';

-- PostgreSQL's default EXECUTE grant to PUBLIC is a default, not a decision. The inspected runtime
-- contract has one caller — the Financials card route, through a service-role client.
REVOKE ALL ON FUNCTION public.financials_account_fact_bundle(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.financials_account_fact_bundle(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.financials_account_fact_bundle(uuid, uuid, uuid) TO service_role;

COMMIT;
