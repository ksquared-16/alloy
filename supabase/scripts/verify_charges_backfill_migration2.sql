-- Verification queries for Migration 2: charges_receivables_backfill (20260331130000).
-- Run manually after applying the migration (e.g. psql, Supabase SQL editor).
-- Read-only; safe to run in production for reporting.

-- ---------------------------------------------------------------------------
-- 0) Labels (run in psql or ignore in other clients)
-- ---------------------------------------------------------------------------
-- \echo '--- Backfilled charge row count ---'

-- ---------------------------------------------------------------------------
-- 1) Backfilled v1 service charges (inserted by migration)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS "backfilled_charge_count"
FROM "public"."charges" AS "c"
WHERE "c"."charge_type" = 'service'::"text"
  AND COALESCE(("c"."metadata"->>'backfilled')::boolean, false) = true
  AND ("c"."metadata"->>'backfill_version') = '1'
  AND ("c"."metadata"->>'backfill_source') = 'job_level_receivable_migration';

-- ---------------------------------------------------------------------------
-- 2) Backfill-eligible jobs (matches Migration 2 “charge_amount_cents” rule only)
--    A job counts here iff the migration would compute a positive receivable amount:
--    same CASE as 20260331130000_charges_receivables_backfill.sql (lines → total_cents →
--    amount_due → posted job allocations on posted payments → gross/estimated).
--    Excludes: payments.job_id alone, amount_paid alone, allocations without a positive basis.
-- ---------------------------------------------------------------------------
WITH "jl" AS (
    SELECT
        "jli"."job_id",
        COUNT(*) FILTER (WHERE COALESCE("jli"."is_active", true)) AS "active_line_count",
        COALESCE(
            SUM("jli"."amount_cents") FILTER (WHERE COALESCE("jli"."is_active", true)),
            0
        )::bigint AS "line_sum_cents"
    FROM "public"."job_line_items" AS "jli"
    GROUP BY "jli"."job_id"
),
"posted_alloc" AS (
    SELECT
        "pa"."target_entity_id" AS "job_id",
        SUM("pa"."allocated_amount_cents")::bigint AS "posted_alloc_cents"
    FROM "public"."payment_allocations" AS "pa"
    INNER JOIN "public"."payments" AS "p" ON "p"."id" = "pa"."payment_id" AND "p"."org_id" = "pa"."org_id"
    WHERE "lower"(TRIM(BOTH FROM "pa"."target_entity_type")) = 'job'::"text"
      AND "pa"."status" = 'active'::"text"
      AND "p"."status" = 'posted'::"text"
    GROUP BY "pa"."target_entity_id"
),
"with_charge_basis" AS (
    SELECT
        "j"."id" AS "job_id",
        CASE
            WHEN COALESCE("jl"."active_line_count", 0::bigint) > 0 THEN
                CASE
                    WHEN COALESCE("jl"."line_sum_cents", 0::bigint) > 0 THEN "jl"."line_sum_cents"
                    WHEN COALESCE("pa"."posted_alloc_cents", 0::bigint) > 0 THEN "pa"."posted_alloc_cents"
                    ELSE NULL::bigint
                END
            WHEN COALESCE("j"."total_cents", 0) > 0 THEN "j"."total_cents"::bigint
            WHEN COALESCE("j"."amount_due_cents", 0) > 0 THEN "j"."amount_due_cents"::bigint
            WHEN COALESCE("pa"."posted_alloc_cents", 0::bigint) > 0 THEN "pa"."posted_alloc_cents"
            WHEN GREATEST(COALESCE("j"."gross_price_cents", 0), COALESCE("j"."estimated_total_cents", 0)) > 0 THEN
                GREATEST(COALESCE("j"."gross_price_cents", 0), COALESCE("j"."estimated_total_cents", 0))::bigint
            ELSE NULL::bigint
        END AS "charge_amount_cents"
    FROM "public"."jobs" AS "j"
    LEFT JOIN "jl" ON "jl"."job_id" = "j"."id"
    LEFT JOIN "posted_alloc" AS "pa" ON "pa"."job_id" = "j"."id"
)
SELECT COUNT(*) AS "backfill_eligible_job_count"
FROM "with_charge_basis" AS "w"
WHERE "w"."charge_amount_cents" IS NOT NULL
  AND "w"."charge_amount_cents" > 0;

-- ---------------------------------------------------------------------------
-- 3) Backfill-eligible jobs (positive charge_amount basis) missing a v1 backfilled charge
-- ---------------------------------------------------------------------------
WITH "jl" AS (
    SELECT
        "jli"."job_id",
        COUNT(*) FILTER (WHERE COALESCE("jli"."is_active", true)) AS "active_line_count",
        COALESCE(
            SUM("jli"."amount_cents") FILTER (WHERE COALESCE("jli"."is_active", true)),
            0
        )::bigint AS "line_sum_cents"
    FROM "public"."job_line_items" AS "jli"
    GROUP BY "jli"."job_id"
),
"posted_alloc" AS (
    SELECT
        "pa"."target_entity_id" AS "job_id",
        SUM("pa"."allocated_amount_cents")::bigint AS "posted_alloc_cents"
    FROM "public"."payment_allocations" AS "pa"
    INNER JOIN "public"."payments" AS "p" ON "p"."id" = "pa"."payment_id" AND "p"."org_id" = "pa"."org_id"
    WHERE "lower"(TRIM(BOTH FROM "pa"."target_entity_type")) = 'job'::"text"
      AND "pa"."status" = 'active'::"text"
      AND "p"."status" = 'posted'::"text"
    GROUP BY "pa"."target_entity_id"
),
"with_charge_basis" AS (
    SELECT
        "j"."id" AS "job_id",
        "j"."org_id",
        "j"."job_number_for_customer",
        "j"."created_at",
        CASE
            WHEN COALESCE("jl"."active_line_count", 0::bigint) > 0 THEN
                CASE
                    WHEN COALESCE("jl"."line_sum_cents", 0::bigint) > 0 THEN "jl"."line_sum_cents"
                    WHEN COALESCE("pa"."posted_alloc_cents", 0::bigint) > 0 THEN "pa"."posted_alloc_cents"
                    ELSE NULL::bigint
                END
            WHEN COALESCE("j"."total_cents", 0) > 0 THEN "j"."total_cents"::bigint
            WHEN COALESCE("j"."amount_due_cents", 0) > 0 THEN "j"."amount_due_cents"::bigint
            WHEN COALESCE("pa"."posted_alloc_cents", 0::bigint) > 0 THEN "pa"."posted_alloc_cents"
            WHEN GREATEST(COALESCE("j"."gross_price_cents", 0), COALESCE("j"."estimated_total_cents", 0)) > 0 THEN
                GREATEST(COALESCE("j"."gross_price_cents", 0), COALESCE("j"."estimated_total_cents", 0))::bigint
            ELSE NULL::bigint
        END AS "charge_amount_cents"
    FROM "public"."jobs" AS "j"
    LEFT JOIN "jl" ON "jl"."job_id" = "j"."id"
    LEFT JOIN "posted_alloc" AS "pa" ON "pa"."job_id" = "j"."id"
)
SELECT "w"."job_id", "w"."org_id", "w"."job_number_for_customer", "w"."charge_amount_cents"
FROM "with_charge_basis" AS "w"
WHERE "w"."charge_amount_cents" IS NOT NULL
  AND "w"."charge_amount_cents" > 0
  AND NOT EXISTS (
      SELECT 1
      FROM "public"."charges" AS "c"
      WHERE "c"."job_id" = "w"."job_id"
        AND "c"."charge_type" = 'service'::"text"
        AND COALESCE(("c"."metadata"->>'backfilled')::boolean, false) = true
        AND ("c"."metadata"->>'backfill_version') = '1'
        AND ("c"."metadata"->>'backfill_source') = 'job_level_receivable_migration'
  )
ORDER BY "w"."created_at" DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 4) Job-targeted allocations still missing charge_id
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS "job_alloc_missing_charge_id"
FROM "public"."payment_allocations" AS "pa"
WHERE "lower"(TRIM(BOTH FROM "pa"."target_entity_type")) = 'job'::"text"
  AND "pa"."charge_id" IS NULL;

SELECT "pa"."id", "pa"."org_id", "pa"."payment_id", "pa"."target_entity_id" AS "job_id", "pa"."status"
FROM "public"."payment_allocations" AS "pa"
WHERE "lower"(TRIM(BOTH FROM "pa"."target_entity_type")) = 'job'::"text"
  AND "pa"."charge_id" IS NULL
ORDER BY "pa"."allocated_at" DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 5) Zero-dollar backfilled charges (should be none — violates charges check / migration rules)
-- ---------------------------------------------------------------------------
SELECT "c"."id", "c"."org_id", "c"."job_id", "c"."amount_cents"
FROM "public"."charges" AS "c"
WHERE COALESCE(("c"."metadata"->>'backfilled')::boolean, false) = true
  AND ("c"."metadata"->>'backfill_version') = '1'
  AND ("c"."metadata"->>'backfill_source') = 'job_level_receivable_migration'
  AND "c"."amount_cents" = 0;

-- ---------------------------------------------------------------------------
-- 6) Allocation → charge mapping integrity (org / job alignment)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS "alloc_charge_mismatch_count"
FROM "public"."payment_allocations" AS "pa"
INNER JOIN "public"."charges" AS "c" ON "c"."id" = "pa"."charge_id"
WHERE "pa"."charge_id" IS NOT NULL
  AND (
      "pa"."org_id" IS DISTINCT FROM "c"."org_id"
      OR "pa"."target_entity_id" IS DISTINCT FROM "c"."job_id"
  );

SELECT "pa"."id" AS "allocation_id", "pa"."org_id" AS "pa_org", "c"."org_id" AS "charge_org", "pa"."target_entity_id", "c"."job_id"
FROM "public"."payment_allocations" AS "pa"
INNER JOIN "public"."charges" AS "c" ON "c"."id" = "pa"."charge_id"
WHERE "pa"."charge_id" IS NOT NULL
  AND (
      "pa"."org_id" IS DISTINCT FROM "c"."org_id"
      OR "pa"."target_entity_id" IS DISTINCT FROM "c"."job_id"
  )
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 7) Aggregates: backfilled receivable total vs posted allocations to those jobs (active + posted payment)
-- ---------------------------------------------------------------------------
WITH "bf" AS (
    SELECT "c"."job_id", "c"."amount_cents"::bigint AS "charge_amt"
    FROM "public"."charges" AS "c"
    WHERE "c"."charge_type" = 'service'::"text"
      AND COALESCE(("c"."metadata"->>'backfilled')::boolean, false) = true
      AND ("c"."metadata"->>'backfill_version') = '1'
      AND ("c"."metadata"->>'backfill_source') = 'job_level_receivable_migration'
),
"posted_job" AS (
    SELECT
        "pa"."target_entity_id" AS "job_id",
        SUM("pa"."allocated_amount_cents")::bigint AS "posted_alloc_cents"
    FROM "public"."payment_allocations" AS "pa"
    INNER JOIN "public"."payments" AS "p" ON "p"."id" = "pa"."payment_id" AND "p"."org_id" = "pa"."org_id"
    WHERE "lower"(TRIM(BOTH FROM "pa"."target_entity_type")) = 'job'::"text"
      AND "pa"."status" = 'active'::"text"
      AND "p"."status" = 'posted'::"text"
    GROUP BY "pa"."target_entity_id"
),
"alloc_via_charge" AS (
    SELECT
        "pa"."charge_id",
        SUM("pa"."allocated_amount_cents")::bigint AS "alloc_on_charge_cents"
    FROM "public"."payment_allocations" AS "pa"
    INNER JOIN "public"."payments" AS "p" ON "p"."id" = "pa"."payment_id" AND "p"."org_id" = "pa"."org_id"
    WHERE "pa"."charge_id" IS NOT NULL
      AND "pa"."status" = 'active'::"text"
      AND "p"."status" = 'posted'::"text"
    GROUP BY "pa"."charge_id"
),
"bf_charge" AS (
    SELECT "c"."id" AS "charge_id", "c"."job_id", "c"."amount_cents"::bigint AS "charge_amt"
    FROM "public"."charges" AS "c"
    WHERE "c"."charge_type" = 'service'::"text"
      AND COALESCE(("c"."metadata"->>'backfilled')::boolean, false) = true
      AND ("c"."metadata"->>'backfill_version') = '1'
      AND ("c"."metadata"->>'backfill_source') = 'job_level_receivable_migration'
)
SELECT
    (SELECT COALESCE(SUM("charge_amt"), 0) FROM "bf") AS "sum_backfilled_charge_cents",
    (SELECT COALESCE(SUM("posted_alloc_cents"), 0) FROM "posted_job" WHERE "job_id" IN (SELECT "job_id" FROM "bf")) AS "sum_posted_alloc_to_backfilled_jobs_cents",
    (SELECT COALESCE(SUM("alloc_on_charge_cents"), 0) FROM "alloc_via_charge" WHERE "charge_id" IN (SELECT "charge_id" FROM "bf_charge"))
        AS "sum_posted_alloc_on_backfill_charge_ids_cents";

-- ---------------------------------------------------------------------------
-- 8) Row-level: backfilled job — charge amount vs posted alloc vs expected status
-- ---------------------------------------------------------------------------
WITH "posted_job" AS (
    SELECT
        "pa"."target_entity_id" AS "job_id",
        SUM("pa"."allocated_amount_cents")::bigint AS "posted_alloc_cents"
    FROM "public"."payment_allocations" AS "pa"
    INNER JOIN "public"."payments" AS "p" ON "p"."id" = "pa"."payment_id" AND "p"."org_id" = "pa"."org_id"
    WHERE "lower"(TRIM(BOTH FROM "pa"."target_entity_type")) = 'job'::"text"
      AND "pa"."status" = 'active'::"text"
      AND "p"."status" = 'posted'::"text"
    GROUP BY "pa"."target_entity_id"
),
"bf" AS (
    SELECT
        "c"."id" AS "charge_id",
        "c"."job_id",
        "c"."org_id",
        "c"."amount_cents"::bigint AS "charge_amt",
        "c"."status" AS "charge_status",
        "c"."voided_at",
        COALESCE(("c"."metadata"->>'receivable_basis'), '') AS "receivable_basis"
    FROM "public"."charges" AS "c"
    WHERE "c"."charge_type" = 'service'::"text"
      AND COALESCE(("c"."metadata"->>'backfilled')::boolean, false) = true
      AND ("c"."metadata"->>'backfill_version') = '1'
      AND ("c"."metadata"->>'backfill_source') = 'job_level_receivable_migration'
)
SELECT
    "bf"."job_id",
    "bf"."charge_id",
    "bf"."charge_amt",
    COALESCE("pj"."posted_alloc_cents", 0::bigint) AS "posted_alloc_cents",
    "bf"."charge_status",
    CASE
        WHEN COALESCE("pj"."posted_alloc_cents", 0::bigint) >= "bf"."charge_amt" THEN 'paid'::"text"
        WHEN COALESCE("pj"."posted_alloc_cents", 0::bigint) > 0 THEN 'partially_paid'::"text"
        ELSE 'posted'::"text"
    END AS "expected_status_non_void",
    "bf"."voided_at",
    "bf"."receivable_basis"
FROM "bf"
LEFT JOIN "posted_job" AS "pj" ON "pj"."job_id" = "bf"."job_id"
INNER JOIN "public"."jobs" AS "j" ON "j"."id" = "bf"."job_id"
WHERE
    NOT (
        "j"."archived_at" IS NOT NULL
        OR "lower"(TRIM(BOTH FROM COALESCE("j"."status_key", ''::"text"))) IN (
            'canceled'::"text", 'cancelled'::"text", 'void'::"text", 'voided'::"text", 'archived'::"text"
        )
    )
    AND "bf"."charge_status" NOT IN ('void'::"text")
    AND "bf"."charge_status" IS DISTINCT FROM (
        CASE
            WHEN COALESCE("pj"."posted_alloc_cents", 0::bigint) >= "bf"."charge_amt" THEN 'paid'::"text"
            WHEN COALESCE("pj"."posted_alloc_cents", 0::bigint) > 0 THEN 'partially_paid'::"text"
            ELSE 'posted'::"text"
        END
    )
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 9) Void backfills: expect voided_at when status = void
-- ---------------------------------------------------------------------------
SELECT "c"."id", "c"."job_id", "c"."status", "c"."voided_at"
FROM "public"."charges" AS "c"
WHERE COALESCE(("c"."metadata"->>'backfilled')::boolean, false) = true
  AND ("c"."metadata"->>'backfill_version') = '1'
  AND ("c"."metadata"->>'backfill_source') = 'job_level_receivable_migration'
  AND "c"."status" = 'void'::"text"
  AND "c"."voided_at" IS NULL;

-- ---------------------------------------------------------------------------
-- 10) Duplicate v1 backfilled charges per job (should not happen)
-- ---------------------------------------------------------------------------
SELECT "c"."job_id", COUNT(*) AS "cnt"
FROM "public"."charges" AS "c"
WHERE "c"."charge_type" = 'service'::"text"
  AND COALESCE(("c"."metadata"->>'backfilled')::boolean, false) = true
  AND ("c"."metadata"->>'backfill_version') = '1'
  AND ("c"."metadata"->>'backfill_source') = 'job_level_receivable_migration'
GROUP BY "c"."job_id"
HAVING COUNT(*) > 1;
