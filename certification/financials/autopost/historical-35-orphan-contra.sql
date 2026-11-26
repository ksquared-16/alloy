-- WERE SOME OF THE 35 HISTORICAL DRAFTS LEFT BEHIND BY THE REDUCTIONCORE DEFECT?
--
-- This question was not asked until the deployed-schema proof planted the defect back and the
-- planted run left an ORPHAN contra charge behind. `applyReductionCore` creates the contra charge
-- FIRST and inserts the application rows that explain it SECOND. When S2 made
-- `billing_period_generation` NOT NULL and the writer did not populate it, the second step failed —
-- so every attempted reduction on deployed left a draft contra charge standing with nothing behind
-- it. Thirteen of the 35 historical drafts are `adjustment`-type with a reduction source, which is
-- exactly that shape.
--
-- The difference matters for disposition. A stranded TUITION draft is money a family owes that was
-- never billed: it is a prospective-recreation candidate. An orphaned CONTRA charge is the debris of
-- a failed write: nothing is owed, nothing was decided, and recreating it would credit a household
-- for a reduction nobody ever granted.
--
-- READ-ONLY. Nothing here mutates, posts, voids or retries.
--
-- q1  the 35, split by whether an application row actually explains the charge
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'charge_type', c.charge_type,
           'charge_category', c.charge_category,
           'source', coalesce(c.metadata ->> 'source', '(null)'),
           'drafts', count(*),
           'cents', sum(c.amount_cents),
           -- an application whose charge_id IS this charge: the record that explains it
           'with_explaining_application', count(*) FILTER (
               WHERE EXISTS (SELECT 1 FROM public.financial_reduction_applications a
                              WHERE a.charge_id = c.id)),
           -- an application that REDUCES this charge: only meaningful for gross charges
           'reduced_by_an_application', count(*) FILTER (
               WHERE EXISTS (SELECT 1 FROM public.financial_reduction_applications a
                              WHERE a.source_charge_id = c.id)),
           'with_obligation', count(*) FILTER (
               WHERE EXISTS (SELECT 1 FROM public.resolved_obligations o
                              WHERE o.draft_charge_id = c.id))
       )::text AS payload
  FROM public.charges c
 WHERE c.status = 'draft'
 GROUP BY c.charge_type, c.charge_category, coalesce(c.metadata ->> 'source', '(null)')

UNION ALL

-- q2  THE ORPHAN TEST, stated as one number per draft so nothing is inferred from a group total
SELECT 'q2', 'row',
       json_build_object(
           'charge_id', c.id,
           'charge_type', c.charge_type,
           'charge_category', c.charge_category,
           'source', coalesce(c.metadata ->> 'source', '(null)'),
           'amount_cents', c.amount_cents,
           'created_at', c.created_at,
           'reduces_charge_id', c.metadata ->> 'reduces_charge_id',
           'explaining_applications', (SELECT count(*) FROM public.financial_reduction_applications a
                                        WHERE a.charge_id = c.id),
           'is_orphan_contra', (c.charge_type = 'adjustment'
                                AND coalesce(c.metadata ->> 'source', '') IN ('manual_reduction', 'financial_reduction')
                                AND NOT EXISTS (SELECT 1 FROM public.financial_reduction_applications a
                                                 WHERE a.charge_id = c.id))
       )::text
  FROM public.charges c
 WHERE c.status = 'draft'
   AND c.charge_type = 'adjustment'

UNION ALL

-- q3  the headline split, so the disposition census can be read without re-deriving it
SELECT 'q3', 'row',
       json_build_object(
           'total_drafts', count(*),
           'total_cents', sum(c.amount_cents),
           'orphan_contra_charges', count(*) FILTER (WHERE orphan),
           'orphan_contra_cents', coalesce(sum(c.amount_cents) FILTER (WHERE orphan), 0),
           'gross_drafts', count(*) FILTER (WHERE NOT orphan),
           'gross_cents', coalesce(sum(c.amount_cents) FILTER (WHERE NOT orphan), 0)
       )::text
  FROM (
      SELECT c2.*,
             (c2.charge_type = 'adjustment'
              AND coalesce(c2.metadata ->> 'source', '') IN ('manual_reduction', 'financial_reduction')
              AND NOT EXISTS (SELECT 1 FROM public.financial_reduction_applications a
                               WHERE a.charge_id = c2.id)) AS orphan
        FROM public.charges c2 WHERE c2.status = 'draft') c

UNION ALL

-- q4  and the same question across ALL charges, not just drafts: did the defect strand anything
--     that later got posted, which would be a different and worse story
SELECT 'q4', 'row',
       json_build_object(
           'status', c.status,
           'adjustment_charges_from_a_reduction_source', count(*),
           'without_explaining_application', count(*) FILTER (
               WHERE NOT EXISTS (SELECT 1 FROM public.financial_reduction_applications a
                                  WHERE a.charge_id = c.id))
       )::text
  FROM public.charges c
 WHERE c.charge_type = 'adjustment'
   AND coalesce(c.metadata ->> 'source', '') IN ('manual_reduction', 'financial_reduction')
 GROUP BY c.status

ORDER BY 1
