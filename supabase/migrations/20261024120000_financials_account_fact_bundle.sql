-- The Financials card's dependency DEPTH becomes one round trip.
--
-- Opening Details waits on one request. That request is not slow because any query is slow —
-- measured on deployed staging through Server-Timing, no single span is the pole. It is slow
-- because the reads happen in FIVE dependent network waves: the agreements answer names the
-- billable sources, those name the charges, the charges name their allocations and claim lines,
-- and those name the payments, people, funding, claims and variances behind them. Five waves at
-- roughly 300 ms of round-trip each is most of a 2.0-2.4 s response.
--
-- No amount of client-side concurrency removes that: every wave genuinely needs the previous
-- wave's ids. The only way to collapse it is to let the database follow the chain, where the
-- hops cost microseconds instead of a network round trip.
--
-- WHAT THIS IS NOT
--
-- It is not a second economic engine. It computes no balance, no collectible position, no
-- responsibility split, no reduction eligibility, no prepaid availability. It returns the same
-- ROWS the same readers already select, with the same predicates, and the existing canonical
-- computation continues to own every figure. The change is transport and acquisition only:
-- one round trip instead of five, for facts that were always being fetched.
--
-- It is not a generic Financials RPC either. It carries exactly the dependent chain and stops:
-- the org-grain configuration reads, the merchant, the payment methods and the household payment
-- views stay where they are, because they depend on nothing and already go out in the first wave.
--
-- SECURITY
--
-- SECURITY INVOKER, deliberately. The caller is the route's service-role client, which is the
-- same client that issues these reads today, so the rows this returns are exactly the rows the
-- caller can already obtain — this broadens nothing. Under any other role RLS still applies,
-- which a SECURITY DEFINER version would have silently removed. Every statement carries
-- `org_id = p_org_id`, so a household id from another tenant resolves to nothing rather than to
-- that tenant's ledger, and the org is passed from the authenticated session by the route, never
-- from the query string. It is not an authorization authority: admission and `fin.read` are
-- decided before it is called and are unchanged.

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
    v_alloc_ids uuid[];
    v_share_ids uuid[];
    v_party_ids uuid[];
    v_claim_ids uuid[];
    v_line_ids uuid[];
    v_result jsonb;
BEGIN
    /*
     * WAVE 1 — the billable sources. Scoped by member when the caller named a child, by household
     * otherwise, which is the same branch `buildFinancialsCardVM` takes.
     */
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

    /*
     * The account the card is about. When the caller gave only a child, the household is the one
     * its agreements name — the same fallback the builder applies.
     */
    v_customer_id := p_customer_id;
    IF v_customer_id IS NULL THEN
        SELECT a.customer_id INTO v_customer_id
          FROM public.child_enrollment_agreements a
         WHERE a.org_id = p_org_id AND a.id = ANY(v_agreement_ids)
           AND a.customer_id IS NOT NULL
         LIMIT 1;
    END IF;

    /*
     * A household's account is the union of what its enrolments owe and what the household itself
     * owes — the pre-enrolment fees that have no agreement to hang off.
     */
    v_source_ids := v_agreement_ids;
    IF v_customer_id IS NOT NULL THEN
        v_source_ids := v_source_ids || v_customer_id;
    END IF;

    SELECT array_agg(c.id) INTO v_charge_ids
      FROM public.charges c
     WHERE c.org_id = p_org_id AND c.billable_source_id = ANY(v_source_ids);
    v_charge_ids := coalesce(v_charge_ids, ARRAY[]::uuid[]);

    /* The policy windows the reduction history names — the wave that only appears when a family
       has policy-produced reductions, and the one a fixture without them never sees. */
    SELECT array_agg(DISTINCT r.commercial_policy_id) INTO v_policy_ids
      FROM public.financial_reduction_applications r
     WHERE r.org_id = p_org_id
       AND r.enrollment_agreement_id = ANY(v_agreement_ids)
       AND r.commercial_policy_id IS NOT NULL;
    v_policy_ids := coalesce(v_policy_ids, ARRAY[]::uuid[]);

    /* Charge-keyed ids, gathered once so the dependent sets below need no further hops. */
    SELECT array_agg(DISTINCT pa.payment_id) INTO v_payment_ids
      FROM public.payment_allocations pa
     WHERE pa.org_id = p_org_id AND pa.charge_id = ANY(v_charge_ids) AND pa.payment_id IS NOT NULL;
    v_payment_ids := coalesce(v_payment_ids, ARRAY[]::uuid[]);

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

    /*
     * Every set below selects the SAME columns under the SAME predicates as the reader it
     * replaces. Where two readers ask for one table differently, the SUPERSET is returned with
     * the discriminating column included, so each consumer applies its own rule unchanged — the
     * filter stays with the authority that owns it rather than moving into SQL.
     */
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
            SELECT jsonb_agg(to_jsonb(r) - 'org_id')
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

        /* Keyed by source_charge_id — the reduction's effect on a charge, not its history. */
        'reductions_by_charge', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'source_charge_id', r.source_charge_id, 'amount_cents', r.amount_cents))
            FROM public.financial_reduction_applications r
            WHERE r.org_id = p_org_id AND r.source_charge_id = ANY(v_charge_ids)), '[]'::jsonb),

        /* SUPERSET: the collectible reader takes every row and reads `status`; the ledger reader
           wants only active. `status` travels so each keeps its own rule. */
        'payment_allocations', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', pa.id, 'charge_id', pa.charge_id,
                'allocated_amount_cents', pa.allocated_amount_cents,
                'status', pa.status, 'payment_id', pa.payment_id))
            FROM public.payment_allocations pa
            WHERE pa.org_id = p_org_id AND pa.charge_id = ANY(v_charge_ids)), '[]'::jsonb),

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

        /* Funding hangs off BOTH anchors a claim reads: the allocation, or the share. */
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

        /* The responsibility card's own funding shape — a different projection of the same rows,
           kept distinct because the two readers present different columns. */
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
         * COUNTS, so a caller can tell KNOWN ZERO from a set that was never gathered. An empty
         * array here means "asked, and there are none" — never "not loaded". A failure raises
         * rather than returning an empty bundle, so the reader's fail-closed contract is intact.
         */
        'counts', jsonb_build_object(
            'agreements', coalesce(array_length(v_agreement_ids, 1), 0),
            'charges', coalesce(array_length(v_charge_ids, 1), 0),
            'allocations', coalesce(array_length(v_alloc_ids, 1), 0),
            'claim_lines', coalesce(array_length(v_line_ids, 1), 0)
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.financials_account_fact_bundle(uuid, uuid, uuid) IS
'Gathers the Financials card''s dependent fact chain in one round trip. Returns rows only; every '
'figure is still computed by the canonical application authorities. SECURITY INVOKER, org-scoped '
'on every statement.';

GRANT EXECUTE ON FUNCTION public.financials_account_fact_bundle(uuid, uuid, uuid)
    TO authenticated, service_role;

COMMIT;
