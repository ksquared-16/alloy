-- S5 §3/§4/§14/§20 — WHAT CORRECTION AUTHORITY ALREADY EXISTS, AND WHAT SHAPE ARE THE NINE?
--
-- The instruction is explicit that no second correction engine should be built if an existing
-- canonical authority can be extended. Source reading already says the reduction authority carries
-- every field S5 needs — a source charge, a correction amount, a reason, and an effective date from
-- which the period is resolved. This census tests that reading against the deployed estate rather
-- than trusting it, and answers the three questions that would change the model decision:
--
--   q1/q2  THE NINE. Are the existing cross-period reductions intentional corrections, ordinary
--          reductions whose dates simply differ, or legacy artifacts? Their mere existence proves
--          nothing about whether today's semantics are right, so this reads their shape.
--   q3     LEGACY SOURCES. Most history is legacy. Can an application reference a legacy charge
--          without inventing a canonical historical period for it?
--   q4     LINEAGE. What invariant actually governs corrections today — at the charge level and at
--          the application level — so S5 binds the real rule rather than a supposed one.
--   q5     Where provenance currently lives, measured: does the contra charge a reduction creates
--          carry charge-level lineage, or is the application row the only link?
--
-- READ-ONLY. Nothing here mutates.
--
-- q1  the cross-period reductions, one row each, with both periods side by side
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'application_id', a.id,
           'reduction_kind', a.reduction_kind,
           'policy_kind', a.policy_kind,
           'amount_cents', a.amount_cents,
           'reason', left(coalesce(a.reason, ''), 60),
           'created_at', a.created_at,
           -- the correction's own period
           'correction_generation', a.billing_period_generation,
           'correction_period_key', a.period_key,
           'correction_legacy_key', a.legacy_billing_period_key,
           'correction_billing_period_id', a.billing_period_id,
           -- the source it points at
           'source_charge_id', a.source_charge_id,
           'source_status', src.status,
           'source_generation', src.billing_period_generation,
           'source_legacy_key', src.legacy_billing_period_key,
           'source_billing_period_id', src.billing_period_id,
           'source_service_date', src.service_date,
           -- the contra charge it created
           'contra_charge_id', a.charge_id,
           'contra_status', contra.status,
           'contra_service_date', contra.service_date,
           'contra_source_charge_id', contra.source_charge_id,
           'contra_generation', contra.billing_period_generation,
           'contra_legacy_key', contra.legacy_billing_period_key
       )::text AS payload
  FROM public.financial_reduction_applications a
  JOIN public.charges src ON src.id = a.source_charge_id
  LEFT JOIN public.charges contra ON contra.id = a.charge_id
 WHERE a.legacy_billing_period_key IS DISTINCT FROM src.legacy_billing_period_key
    OR a.billing_period_id IS DISTINCT FROM src.billing_period_id

UNION ALL

-- q2  the same population summarised, so the shape is stated rather than inferred from nine rows
SELECT 'q2', 'row',
       json_build_object(
           'applications_with_source', count(*),
           'cross_period', count(*) FILTER (
               WHERE a.legacy_billing_period_key IS DISTINCT FROM src.legacy_billing_period_key
                  OR a.billing_period_id IS DISTINCT FROM src.billing_period_id),
           'same_period', count(*) FILTER (
               WHERE a.legacy_billing_period_key IS NOT DISTINCT FROM src.legacy_billing_period_key
                 AND a.billing_period_id IS NOT DISTINCT FROM src.billing_period_id),
           'by_reduction_kind', (SELECT coalesce(json_agg(json_build_object('kind', k.kind, 'n', k.n)), '[]'::json)
                                   FROM (SELECT a2.reduction_kind AS kind, count(*) AS n
                                           FROM public.financial_reduction_applications a2
                                          WHERE a2.source_charge_id IS NOT NULL
                                          GROUP BY a2.reduction_kind) k),
           'source_in_closed_period', count(*) FILTER (WHERE bp.status = 'closed'),
           'source_in_open_period', count(*) FILTER (WHERE bp.status = 'open'),
           'source_has_no_canonical_period', count(*) FILTER (WHERE src.billing_period_id IS NULL)
       )::text
  FROM public.financial_reduction_applications a
  JOIN public.charges src ON src.id = a.source_charge_id
  LEFT JOIN public.financial_billing_periods bp ON bp.id = src.billing_period_id

UNION ALL

-- q3  LEGACY SOURCES — can provenance point at a legacy charge today, and does it already?
SELECT 'q3', 'row',
       json_build_object(
           'applications_total', (SELECT count(*) FROM public.financial_reduction_applications),
           'with_a_source_charge', (SELECT count(*) FROM public.financial_reduction_applications
                                     WHERE source_charge_id IS NOT NULL),
           'source_is_legacy_generation', (
               SELECT count(*) FROM public.financial_reduction_applications a2
                 JOIN public.charges s2 ON s2.id = a2.source_charge_id
                WHERE s2.billing_period_generation = 'legacy'),
           'source_is_canonical_generation', (
               SELECT count(*) FROM public.financial_reduction_applications a2
                 JOIN public.charges s2 ON s2.id = a2.source_charge_id
                WHERE s2.billing_period_generation = 'canonical'),
           -- is there any FK or CHECK forcing the source to be canonical?
           'source_fk_definition', (
               SELECT pg_get_constraintdef(con.oid)
                 FROM pg_constraint con
                 JOIN pg_class rel ON rel.oid = con.conrelid
                WHERE rel.relname = 'financial_reduction_applications'
                  AND con.contype = 'f'
                  AND pg_get_constraintdef(con.oid) ILIKE '%source_charge_id%'
                LIMIT 1),
           'charges_with_canonical_period', (SELECT count(*) FROM public.charges
                                              WHERE billing_period_generation = 'canonical'),
           'charges_legacy', (SELECT count(*) FROM public.charges
                               WHERE billing_period_generation = 'legacy')
       )::text

UNION ALL

-- q4  LINEAGE — the invariant that actually governs corrections today
SELECT 'q4', 'row',
       json_build_object(
           'charge_level_lineage_trigger', (
               SELECT coalesce(json_agg(tg.tgname), '[]'::json)
                 FROM pg_trigger tg JOIN pg_class rel ON rel.oid = tg.tgrelid
                WHERE rel.relname = 'charges' AND NOT tg.tgisinternal
                  AND tg.tgname ILIKE '%correction%'),
           -- how many charges are themselves corrections, i.e. carry charge-level lineage
           'charges_with_source_charge_id', (SELECT count(*) FROM public.charges
                                              WHERE source_charge_id IS NOT NULL),
           'reversal_charges', (SELECT count(*) FROM public.charges
                                 WHERE metadata ->> 'correction_kind' = 'reversal'),
           -- CONTRA charges created by reductions: do they carry charge-level lineage at all?
           'contra_charges_from_reductions', (
               SELECT count(*) FROM public.charges c
                WHERE EXISTS (SELECT 1 FROM public.financial_reduction_applications a3
                               WHERE a3.charge_id = c.id)),
           'contra_charges_with_charge_level_source', (
               SELECT count(*) FROM public.charges c
                WHERE c.source_charge_id IS NOT NULL
                  AND EXISTS (SELECT 1 FROM public.financial_reduction_applications a4
                               WHERE a4.charge_id = c.id)),
           -- more than one application against one source: already permitted?
           'sources_with_multiple_applications', (
               SELECT count(*) FROM (
                   SELECT source_charge_id FROM public.financial_reduction_applications
                    WHERE source_charge_id IS NOT NULL
                    GROUP BY source_charge_id HAVING count(*) > 1) m),
           'max_applications_against_one_source', (
               SELECT coalesce(max(n), 0) FROM (
                   SELECT count(*) AS n FROM public.financial_reduction_applications
                    WHERE source_charge_id IS NOT NULL
                    GROUP BY source_charge_id) m2)
       )::text

UNION ALL

-- q5  the unique/idempotency key that makes a repeat one consequence
SELECT 'q5', 'row',
       json_build_object(
           'uniques_on_applications', (
               SELECT coalesce(json_agg(con.conname || ' :: ' || pg_get_constraintdef(con.oid)), '[]'::json)
                 FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
                WHERE rel.relname = 'financial_reduction_applications' AND con.contype IN ('u', 'p')),
           'distinct_idempotency_keys', (SELECT count(DISTINCT idempotency_key)
                                           FROM public.financial_reduction_applications),
           'rows', (SELECT count(*) FROM public.financial_reduction_applications)
       )::text

ORDER BY 1
