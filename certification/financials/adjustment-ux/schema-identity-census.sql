-- ADJUSTMENT UX CONVERGENCE — the deployed schema this slice depends on, re-measured.
--
-- WHY THIS EXISTS: the merge was refused with `hosted_migration_evidence_stale` — the hosted
-- census was 60 hours old. THIS SLICE SHIPS NO MIGRATION, so there is nothing new to prove applied;
-- what the gate needs is current evidence about the deployed schema, and what is worth measuring is
-- the schema this slice READS AND WRITES THROUGH. If any of it were missing on deployed, the slice
-- would be broken there regardless of what the local stack says.
--
-- CATALOG-ONLY. Every question reads `information_schema` or `pg_catalog`. Nothing selects from a
-- product table, so this cannot fail on a table that does not exist on the target and cannot touch
-- a single row of anyone's money.
--
-- READ-ONLY.
--
-- q1  the three columns the correction authority writes through, on `charges`.
--     `due_date` is the one this slice newly populates for an increase; the two binding columns are
--     S2's and the whole prospective-correction model rests on them.
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'table', 'charges',
           'due_date', (SELECT count(*) FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'charges'
                           AND column_name = 'due_date'),
           'billing_period_id', (SELECT count(*) FROM information_schema.columns
                                  WHERE table_schema = 'public' AND table_name = 'charges'
                                    AND column_name = 'billing_period_id'),
           'legacy_billing_period_key', (SELECT count(*) FROM information_schema.columns
                                          WHERE table_schema = 'public' AND table_name = 'charges'
                                            AND column_name = 'legacy_billing_period_key'),
           'billing_period_generation', (SELECT count(*) FROM information_schema.columns
                                          WHERE table_schema = 'public' AND table_name = 'charges'
                                            AND column_name = 'billing_period_generation')
       )::text AS payload

UNION ALL

-- q2  the correction record itself. `reason` is §16's durable provenance — the slice uses the
--     existing column rather than creating a parallel notes store, so its presence is the claim.
--     `source_charge_id` is the source fact; `reverses_id` / `reversed_by_id` are §17's lineage.
SELECT 'q2', 'row',
       json_build_object(
           'table', 'financial_reduction_applications',
           'reason', (SELECT count(*) FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = 'financial_reduction_applications'
                         AND column_name = 'reason'),
           'explanation', (SELECT count(*) FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'financial_reduction_applications'
                              AND column_name = 'explanation'),
           'source_charge_id', (SELECT count(*) FROM information_schema.columns
                                 WHERE table_schema = 'public' AND table_name = 'financial_reduction_applications'
                                   AND column_name = 'source_charge_id'),
           'reverses_id', (SELECT count(*) FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'financial_reduction_applications'
                              AND column_name = 'reverses_id'),
           'reversed_by_id', (SELECT count(*) FROM information_schema.columns
                               WHERE table_schema = 'public' AND table_name = 'financial_reduction_applications'
                                 AND column_name = 'reversed_by_id'),
           'period_key', (SELECT count(*) FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'financial_reduction_applications'
                             AND column_name = 'period_key')
       )::text AS payload

UNION ALL

-- q3  S3/S4 commercial finality, which the correction path refuses against. Table, close columns,
--     and the shape CHECKs that make a closed period mean something.
SELECT 'q3', 'row',
       json_build_object(
           'table_present', (SELECT count(*) FROM information_schema.tables
                              WHERE table_schema = 'public' AND table_name = 'financial_billing_periods'),
           'status', (SELECT count(*) FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = 'financial_billing_periods'
                         AND column_name = 'status'),
           'closed_at', (SELECT count(*) FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'financial_billing_periods'
                            AND column_name = 'closed_at'),
           'close_actor', (SELECT count(*) FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'financial_billing_periods'
                              AND column_name = 'close_actor'),
           'close_shape_chk', (SELECT count(*) FROM pg_constraint
                                WHERE conname = 'financial_billing_periods_close_shape_chk'),
           'close_actor_shape_chk', (SELECT count(*) FROM pg_constraint
                                      WHERE conname = 'financial_billing_periods_close_actor_shape_chk')
       )::text AS payload

UNION ALL

-- q4  the generation shape CHECKs S2 installed, which every correction write must satisfy, and the
--     immutability triggers that make "history is appended, never edited" a database fact rather
--     than a convention this slice could have broken.
SELECT 'q4', 'row',
       json_build_object(
           'charges_shape_chk', (SELECT count(*) FROM pg_constraint
                                  WHERE conname = 'charges_billing_period_shape_chk'),
           'reduction_shape_chk', (SELECT count(*) FROM pg_constraint
                                    WHERE conname = 'fin_reduction_billing_period_shape_chk'),
           'charge_immutability_trigger', (SELECT count(*) FROM pg_proc
                                            WHERE proname = 'enforce_childcare_charge_immutability'),
           'period_immutability_trigger', (SELECT count(*) FROM pg_proc
                                            WHERE proname = 'enforce_financial_billing_period_immutability'),
           'correction_lineage_trigger', (SELECT count(*) FROM pg_proc
                                           WHERE proname = 'enforce_charge_correction_lineage')
       )::text AS payload

UNION ALL

-- q5  the due-date policy row shape. §14 resolves through `financial_policies`, and the account
--     dimension this slice repaired (`scope_type = 'customer'`) has to be expressible there.
SELECT 'q5', 'row',
       json_build_object(
           'table_present', (SELECT count(*) FROM information_schema.tables
                              WHERE table_schema = 'public' AND table_name = 'financial_policies'),
           'policy_type', (SELECT count(*) FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'financial_policies'
                              AND column_name = 'policy_type'),
           'scope_type', (SELECT count(*) FROM information_schema.columns
                           WHERE table_schema = 'public' AND table_name = 'financial_policies'
                             AND column_name = 'scope_type'),
           'customer_id', (SELECT count(*) FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = 'financial_policies'
                              AND column_name = 'customer_id')
       )::text AS payload

UNION ALL

-- q6  THE NEGATIVE CLAIM, measured rather than asserted: this slice introduces no table of its own.
--     S5 decided against a `financial_corrections` table and the Director forbade a second money
--     engine; if one had appeared, this is where it would show.
SELECT 'q6', 'row',
       json_build_object(
           'financial_corrections', (SELECT count(*) FROM information_schema.tables
                                      WHERE table_schema = 'public' AND table_name = 'financial_corrections'),
           'adjustment_notes', (SELECT count(*) FROM information_schema.tables
                                 WHERE table_schema = 'public' AND table_name = 'adjustment_notes'),
           'correction_notes', (SELECT count(*) FROM information_schema.tables
                                 WHERE table_schema = 'public' AND table_name = 'correction_notes')
       )::text AS payload
