-- DEPLOYED CERTIFICATION CENSUS — the facts that tests cannot establish
--
-- Every question here is about the DEPLOYED estate after merge 55774d916 and after migration
-- 20261117120000 was applied. A green test suite proves the code is right; only this proves the
-- deployed schema and the deployed rows are what the code requires.
--
-- READ-ONLY. Catalog and aggregate reads only. Nothing here mutates, posts, retries or voids.
--
-- q1  §10 — DOES THE DEPLOYED OBLIGATION VOCABULARY ADMIT ALL FIVE STATES?
--     The repair writes status = 'posted'. Before 20261117120000 that violated the CHECK, so the
--     constraint's own text is the proof — not the ledger, which only records that an apply ran.
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'constraint_name', con.conname,
           'definition', pg_get_constraintdef(con.oid),
           'admits_previewed',  pg_get_constraintdef(con.oid) LIKE '%previewed%',
           'admits_drafted',    pg_get_constraintdef(con.oid) LIKE '%drafted%',
           'admits_no_charge',  pg_get_constraintdef(con.oid) LIKE '%no_charge%',
           'admits_superseded', pg_get_constraintdef(con.oid) LIKE '%superseded%',
           'admits_posted',     pg_get_constraintdef(con.oid) LIKE '%posted%'
       )::text AS payload
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
 WHERE ns.nspname = 'public' AND rel.relname = 'resolved_obligations'
   AND con.contype = 'c' AND con.conname = 'resolved_obligations_status_check'

UNION ALL

-- q2  §10 — the live distribution, so "admits" is read beside "actually holds"
SELECT 'q2', 'row',
       json_build_object('status', o.status, 'obligations', count(*))::text
  FROM public.resolved_obligations o
 GROUP BY o.status

UNION ALL

-- q3  §11 PRE-STATE — the shape of the column that broke reductionCore on deployed.
--     `is_not_null` is the constraint S2 introduced; `rows_missing_generation` must be 0 because
--     NOT NULL forbids them — if the column is nullable the repair was never actually needed.
SELECT 'q3', 'row',
       json_build_object(
           'table', 'financial_reduction_applications',
           'column', a.attname,
           'is_not_null', a.attnotnull,
           'has_default', pg_get_expr(d.adbin, d.adrelid),
           'total_rows', (SELECT count(*) FROM public.financial_reduction_applications),
           'rows_missing_generation', (SELECT count(*) FROM public.financial_reduction_applications
                                        WHERE billing_period_generation IS NULL),
           'generation_distribution', (SELECT coalesce(json_agg(json_build_object('generation', g.gen, 'n', g.n)
                                                                ORDER BY g.gen), '[]'::json)
                                         FROM (SELECT billing_period_generation AS gen, count(*) AS n
                                                 FROM public.financial_reduction_applications
                                                GROUP BY billing_period_generation) g)
       )::text
  FROM pg_attribute a
  JOIN pg_class rel ON rel.oid = a.attrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
 WHERE ns.nspname = 'public' AND rel.relname = 'financial_reduction_applications'
   AND a.attname = 'billing_period_generation' AND a.attnum > 0 AND NOT a.attisdropped

UNION ALL

-- q4  §12 — IS THERE ANY CONSTRAINT FORCING A CORRECTION'S PERIOD TO EQUAL ITS SOURCE'S?
--     S5 needs a closed November source to carry an open December correction. The repair populates
--     the correction's generation from the source's context, and the hazard is that someone later
--     hardens that convention into schema. This counts every CHECK, FK and trigger on the two
--     economic tables whose text mentions both a period column and a source column.
SELECT 'q4', 'row',
       json_build_object(
           'period_equality_checks', (
               SELECT coalesce(json_agg(json_build_object('table', rel.relname, 'name', con.conname,
                                                          'def', pg_get_constraintdef(con.oid))), '[]'::json)
                 FROM pg_constraint con
                 JOIN pg_class rel ON rel.oid = con.conrelid
                 JOIN pg_namespace ns ON ns.oid = rel.relnamespace
                WHERE ns.nspname = 'public'
                  AND rel.relname IN ('charges', 'financial_reduction_applications')
                  AND pg_get_constraintdef(con.oid) ILIKE '%source%'
                  AND (pg_get_constraintdef(con.oid) ILIKE '%billing_period%'
                       OR pg_get_constraintdef(con.oid) ILIKE '%period_key%')),
           'period_equality_triggers', (
               SELECT coalesce(json_agg(json_build_object('table', rel.relname, 'trigger', tg.tgname,
                                                          'function', p.proname)), '[]'::json)
                 FROM pg_trigger tg
                 JOIN pg_class rel ON rel.oid = tg.tgrelid
                 JOIN pg_namespace ns ON ns.oid = rel.relnamespace
                 JOIN pg_proc p ON p.oid = tg.tgfoid
                WHERE ns.nspname = 'public' AND NOT tg.tgisinternal
                  AND rel.relname IN ('charges', 'financial_reduction_applications')
                  AND pg_get_functiondef(p.oid) ILIKE '%source%'
                  AND pg_get_functiondef(p.oid) ILIKE '%billing_period%'
                  AND pg_get_functiondef(p.oid) ILIKE '%=%period%'),
           'all_triggers_on_the_two_tables', (
               SELECT coalesce(json_agg(DISTINCT (rel.relname || '.' || tg.tgname)), '[]'::json)
                 FROM pg_trigger tg
                 JOIN pg_class rel ON rel.oid = tg.tgrelid
                 JOIN pg_namespace ns ON ns.oid = rel.relnamespace
                WHERE ns.nspname = 'public' AND NOT tg.tgisinternal
                  AND rel.relname IN ('charges', 'financial_reduction_applications')),
           'cross_period_corrections_already_live', (
               SELECT count(*) FROM public.financial_reduction_applications a
                JOIN public.charges src ON src.id = a.source_charge_id
               WHERE a.legacy_billing_period_key IS DISTINCT FROM src.legacy_billing_period_key)
       )::text

UNION ALL

-- q5  §15 — HISTORICAL 35 PRESERVATION, compared against the pre-promotion baseline
--     baseline taken 2026-10-02T21:46:52Z on 876dc97c1:
--       draft_charges 35, gross_cents 485226, all_legacy true,
--       any_with_period_id false, any_with_post_attempt false,
--       ids_digest 089dc7fce7a12f4d18cbf5203f4a6b82
SELECT 'q5', 'row',
       json_build_object(
           'draft_charges', count(*),
           'gross_cents', coalesce(sum(c.amount_cents), 0),
           'all_legacy', bool_and(c.billing_period_generation = 'legacy'),
           'any_with_period_id', bool_or(c.billing_period_id IS NOT NULL),
           'any_with_post_attempt', bool_or(c.metadata ? 'post_attempt'),
           'any_with_post_gate', bool_or(c.metadata ? 'post_gate'),
           'ids_digest', md5(string_agg(c.id::text, ',' ORDER BY c.id)),
           'baseline_ids_digest', '089dc7fce7a12f4d18cbf5203f4a6b82',
           'preserved', (count(*) = 35
                         AND coalesce(sum(c.amount_cents), 0) = 485226
                         AND md5(string_agg(c.id::text, ',' ORDER BY c.id)) = '089dc7fce7a12f4d18cbf5203f4a6b82'
                         AND NOT bool_or(c.metadata ? 'post_attempt')
                         AND NOT bool_or(c.metadata ? 'post_gate'))
       )::text
  FROM public.charges c
 WHERE c.status = 'draft'

UNION ALL

-- q6  §15 — nothing was voided or posted out from under them either. A preserved digest over
--     status='draft' would still hold if a row had moved to 'posted' and another had appeared, so
--     count the terminal states the forward repair could have caused.
SELECT 'q6', 'row',
       json_build_object(
           'charges_by_status', (SELECT coalesce(json_agg(json_build_object('status', s.status, 'n', s.n)
                                                          ORDER BY s.status), '[]'::json)
                                   FROM (SELECT status, count(*) AS n FROM public.charges GROUP BY status) s),
           'drafts_with_post_gate', (SELECT count(*) FROM public.charges
                                      WHERE status = 'draft' AND metadata ? 'post_gate'),
           'any_charge_with_post_gate', (SELECT count(*) FROM public.charges WHERE metadata ? 'post_gate'),
           'any_charge_with_post_attempt', (SELECT count(*) FROM public.charges WHERE metadata ? 'post_attempt')
       )::text

UNION ALL

-- q7  §16 DISPOSITION — one row per historical draft, with every fact the grouping needs.
--     Read-only and deliberately flat: the Director groups these, the lane does not decide them.
--
--     A charge carries no customer_id and no child_id. It reaches the household the same way the
--     production binder does (resolveChargeCustomerId): a `customer`-grain charge IS the household,
--     and an `enrollment_agreement`-grain charge resolves through the agreement, preferring the
--     agreement's own customer_id and falling back to its member's. Any other grain is off-spine.
SELECT 'q7', 'row',
       json_build_object(
           'charge_id', c.id,
           'billable_source_type', c.billable_source_type,
           'customer_id', res.customer_id,
           'person_id', res.person_id,
           'site_location_id', res.site_location_id,
           'charge_type', c.charge_type,
           'charge_category', c.charge_category,
           'source', coalesce(c.metadata ->> 'source', '(null)'),
           'amount_cents', c.amount_cents,
           'period_key', c.legacy_billing_period_key,
           'generation', c.billing_period_generation,
           'service_date', c.service_date,
           'billable_on', c.billable_on,
           'occurs_on', c.occurs_on,
           'due_date', c.due_date,
           'created_at', c.created_at,
           'schedule_id', c.schedule_id,
           'service_id', c.service_id,
           -- the obligation this draft belongs to, and whether it was ever resolved another way
           'obligation', (SELECT json_build_object('id', o.id, 'status', o.status,
                                                   'review_status', o.review_status,
                                                   'review_required', o.review_required,
                                                   'service_id', o.service_id,
                                                   'superseded_by_event_id', o.superseded_by_event_id)
                            FROM public.resolved_obligations o
                           WHERE o.draft_charge_id = c.id
                           ORDER BY o.created_at DESC LIMIT 1),
           -- an equivalent obligation resolved WITHOUT this draft: same service, same billable day,
           -- same amount, a different draft. That is the duplicate/superseded signal.
           'equivalent_posted_obligations', (
               SELECT count(*) FROM public.resolved_obligations o2
                WHERE o2.org_id = c.org_id
                  AND o2.service_id IS NOT DISTINCT FROM c.service_id
                  AND o2.billable_on IS NOT DISTINCT FROM c.billable_on
                  AND o2.amount_cents = c.amount_cents
                  AND o2.draft_charge_id IS DISTINCT FROM c.id
                  AND o2.status = 'posted'),
           -- a later non-draft charge on the same spine, same type, same period
           'superseding_candidates', (
               SELECT count(*) FROM public.charges later
                WHERE later.id <> c.id
                  AND later.org_id = c.org_id
                  AND later.billable_source_type IS NOT DISTINCT FROM c.billable_source_type
                  AND later.billable_source_id IS NOT DISTINCT FROM c.billable_source_id
                  AND later.charge_type = c.charge_type
                  AND later.legacy_billing_period_key IS NOT DISTINCT FROM c.legacy_billing_period_key
                  AND later.status <> 'draft'),
           'corrections_of_this_charge', (
               SELECT count(*) FROM public.charges later WHERE later.source_charge_id = c.id),
           -- did anything economic ever touch it?
           'payment_allocations', (SELECT count(*) FROM public.payment_allocations pa
                                    WHERE pa.charge_id = c.id),
           'reduction_applications', (SELECT count(*) FROM public.financial_reduction_applications a
                                       WHERE a.source_charge_id = c.id OR a.charge_id = c.id),
           -- is the commercial relationship still live?
           'agreement_statuses', res.agreement_statuses,
           -- a draft is not on a statement and not on an invoice: it was never shown or collectible
           'ever_billed', (c.status <> 'draft'),
           'posted_at', c.posted_at,
           'voided_at', c.voided_at,
           'customer_has_canonical_calendar', (res.customer_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.financial_policies p
                WHERE p.policy_type = 'billing_calendar' AND p.scope_type = 'customer'
                  AND p.customer_id = res.customer_id AND p.is_active))
       )::text
  FROM public.charges c
  LEFT JOIN LATERAL (
      SELECT CASE WHEN c.billable_source_type = 'customer' THEN c.billable_source_id::uuid
                  ELSE coalesce(ag.customer_id, cm.customer_id) END AS customer_id,
             ag.person_id,
             ag.site_location_id,
             (SELECT coalesce(json_agg(DISTINCT a2.status), '[]'::json)
                FROM public.child_enrollment_agreements a2
               WHERE a2.person_id IS NOT NULL AND a2.person_id = ag.person_id) AS agreement_statuses
        FROM (SELECT 1) one
        LEFT JOIN public.child_enrollment_agreements ag
               ON c.billable_source_type = 'enrollment_agreement'
              AND ag.id = c.billable_source_id::uuid
              AND ag.org_id = c.org_id
        LEFT JOIN public.customer_members cm ON cm.id = ag.customer_member_id
  ) res ON true
 WHERE c.status = 'draft'

UNION ALL

-- q8  §8 ATTENTION SURFACE — the deployed work queue is where a terminally failed post lands.
--     Zero is the honest answer on a quiet estate; what matters is that the projection exists and
--     that no row is sitting there unexplained.
SELECT 'q8', 'row',
       json_build_object(
           'charges_post_failed', (SELECT count(*) FROM public.charges
                                    WHERE metadata ->> 'post_gate' = 'post_failed'),
           'charges_review_required', (SELECT count(*) FROM public.charges
                                        WHERE metadata ->> 'post_gate' = 'review_required'),
           'obligations_drafted', (SELECT count(*) FROM public.resolved_obligations WHERE status = 'drafted'),
           'obligations_posted', (SELECT count(*) FROM public.resolved_obligations WHERE status = 'posted'),
           'obligations_reviewed_without_post', (SELECT count(*) FROM public.resolved_obligations
                                                  WHERE review_status = 'reviewed' AND status <> 'posted')
       )::text

ORDER BY 1
