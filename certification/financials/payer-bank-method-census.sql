-- WHAT THE PAYER'S AUTHORIZATION ACTUALLY WROTE, and what it did not.
--
-- The operator's own admin route projects only safe display fields, which is correct and is why it
-- cannot answer three of the questions this certification has to answer: whether a mandate
-- reference exists, whether the row is scoped to the account, and — the one that matters most —
-- whether any operator is recorded as having written it.
--
-- Nothing here returns a credential, because none is stored. The two provider references and the
-- mandate reference are reported as PRESENCE and by prefix only.
--
-- q1  the canonical row, in safe facts
SELECT
    'q1' AS question_id,
    'row' AS kind,
    json_build_object(
        'rail', pm.rail,
        'processor', pm.processor,
        'display_brand', pm.display_brand,
        'display_last4', pm.display_last4,
        'verification_state', pm.verification_state,
        'usability_state', pm.usability_state,
        'is_default', pm.is_default,
        'payer_entity_type', pm.payer_entity_type,
        'payer_is_named', (pm.payer_entity_id IS NOT NULL),
        'account_scoped', (pm.customer_id IS NOT NULL),
        'provider_method_ref_prefix', left(coalesce(pm.provider_method_ref, ''), 3),
        'provider_customer_ref_prefix', left(coalesce(pm.provider_customer_ref, ''), 4),
        'mandate_ref_present', (pm.mandate_ref IS NOT NULL),
        'mandate_ref_prefix', left(coalesce(pm.mandate_ref, ''), 5),
        'mandate_accepted_at_present', (pm.mandate_accepted_at IS NOT NULL),
        -- THE PROOF THAT NO OPERATOR ACTED. The card path records the operator in `created_by`;
        -- the payer path passes null, because no operator was there.
        'created_by_present', (pm.created_by IS NOT NULL),
        'verified_at_present', (pm.verified_at IS NOT NULL)
    )::text AS payload
FROM public.payment_methods pm
WHERE pm.rail = 'ach'
  AND pm.customer_id = 'fcaa839f-6960-4b09-b663-b247b99ea9d9'

UNION ALL

-- q2  how many bank methods this account has at all, so "exactly one" is a measurement
SELECT 'q2', 'scalar', count(*)::text
FROM public.payment_methods
WHERE rail = 'ach' AND customer_id = 'fcaa839f-6960-4b09-b663-b247b99ea9d9'

UNION ALL

-- q3  no column on this table could hold a bank credential, whatever any row contains
SELECT 'q3', 'row',
       json_build_object('credential_shaped_columns', coalesce(string_agg(column_name, ','), 'none'))::text
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payment_methods'
  AND (column_name ILIKE '%routing%' OR column_name ILIKE '%account_number%'
       OR column_name ILIKE '%secret%' OR column_name ILIKE '%credential%')

UNION ALL

-- q4  the setup request itself: one link, to one named person, consumed exactly once
SELECT 'q4', 'row',
       json_build_object(
           'links', count(*),
           'entity_types', coalesce(string_agg(DISTINCT entity_type, ','), 'none'),
           'consumed', count(*) FILTER (WHERE consumed_at IS NOT NULL),
           'revoked', count(*) FILTER (WHERE revoked_at IS NOT NULL),
           'expiry_hours_min', coalesce(min(round(extract(epoch FROM (expires_at - created_at)) / 3600))::text, 'none')
       )::text
FROM public.action_links
WHERE action_type = 'payment_method_setup'

UNION ALL

-- q5  and the canonical money spine is untouched: asking and authorizing move no money
SELECT 'q5', 'row',
       json_build_object(
           'payments', (SELECT count(*) FROM public.payments p
                        WHERE p.customer_id = 'fcaa839f-6960-4b09-b663-b247b99ea9d9'),
           -- `payment_collection_attempts` has no customer column; it reaches an account through
           -- the charge it collects, which is the join the engine itself uses.
           'collection_attempts', (SELECT count(*) FROM public.payment_collection_attempts a
                                   JOIN public.charges c ON c.id = a.charge_id
                                   JOIN public.child_enrollment_agreements ag
                                     ON ag.id = c.billable_source_id
                                    AND c.billable_source_type = 'enrollment_agreement'
                                   WHERE ag.customer_id = 'fcaa839f-6960-4b09-b663-b247b99ea9d9')
       )::text;
