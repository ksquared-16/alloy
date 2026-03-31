-- Migration 2: backfill one service charge per financially relevant job + link job-targeted payment_allocations.charge_id.
-- Depends on: 20260331120000_charges_receivables_foundation.sql (charges, charge_line_items, payment_allocations.charge_id).
--
-- Canonical receivable (aligned with web/lib/admin/jobPaymentBalances.ts getJobPricingTotalCents):
--   If the job has at least one active job_line_items row (is_active IS NOT FALSE): SUM(amount_cents) over those rows.
--   Else: jobs.total_cents.
-- Fallback when that value is NULL or <= 0 but the job still has financial signals (posted allocations, etc.):
--   1) jobs.amount_due_cents when total_cents is zero and no positive line sum
--   2) SUM(active payment_allocations to job where parent payment.status = 'posted')
--   3) GREATEST(COALESCE(gross_price_cents,0), COALESCE(estimated_total_cents,0)) when > 0 and no conflicting line-item sum.
--
-- Idempotent: skips jobs that already have a v1 backfill charge; only sets payment_allocations.charge_id where NULL.
-- Does not alter target_entity_type / target_entity_id / allocated_amount_cents.

-- ---------------------------------------------------------------------------
-- 1) Insert backfilled charges
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
"has_any_alloc" AS (
    SELECT DISTINCT "pa"."target_entity_id" AS "job_id"
    FROM "public"."payment_allocations" AS "pa"
    WHERE "lower"(TRIM(BOTH FROM "pa"."target_entity_type")) = 'job'::"text"
),
"has_payment" AS (
    SELECT DISTINCT "p"."job_id" AS "job_id"
    FROM "public"."payments" AS "p"
    WHERE "p"."job_id" IS NOT NULL
),
"best_schedule" AS (
    SELECT DISTINCT ON ("s"."job_id")
        "s"."job_id",
        "s"."id" AS "schedule_id"
    FROM "public"."schedules" AS "s"
    WHERE "s"."canceled_at" IS NULL
    ORDER BY "s"."job_id", "s"."start_at" ASC NULLS LAST, "s"."created_at" ASC
),
"service_date_q" AS (
    SELECT
        "s"."job_id",
        MIN(("s"."start_at")::"date") AS "service_date"
    FROM "public"."schedules" AS "s"
    WHERE "s"."canceled_at" IS NULL
      AND "s"."start_at" IS NOT NULL
    GROUP BY "s"."job_id"
),
"candidates" AS (
    SELECT
        "j"."id" AS "job_id",
        "j"."org_id" AS "org_id",
        "bs"."schedule_id" AS "schedule_id",
        COALESCE("jl"."active_line_count", 0::bigint) AS "active_line_count",
        COALESCE("jl"."line_sum_cents", 0::bigint) AS "line_sum_cents",
        COALESCE("pa"."posted_alloc_cents", 0::bigint) AS "posted_alloc_cents",
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
        END AS "charge_amount_cents",
        CASE
            WHEN COALESCE("jl"."active_line_count", 0::bigint) > 0 AND COALESCE("jl"."line_sum_cents", 0::bigint) > 0 THEN 'job_line_items'::"text"
            WHEN COALESCE("jl"."active_line_count", 0::bigint) > 0
                 AND COALESCE("jl"."line_sum_cents", 0::bigint) = 0
                 AND COALESCE("pa"."posted_alloc_cents", 0::bigint) > 0 THEN 'posted_allocations_fallback'::"text"
            WHEN COALESCE("jl"."active_line_count", 0::bigint) = 0 AND COALESCE("j"."total_cents", 0) > 0 THEN 'jobs.total_cents'::"text"
            WHEN COALESCE("jl"."active_line_count", 0::bigint) = 0 AND COALESCE("j"."total_cents", 0) = 0 AND COALESCE("j"."amount_due_cents", 0) > 0
                THEN 'jobs.amount_due_cents'::"text"
            WHEN COALESCE("pa"."posted_alloc_cents", 0::bigint) > 0 THEN 'posted_allocations_fallback'::"text"
            ELSE 'gross_or_estimated_total_cents'::"text"
        END AS "receivable_basis",
        (
            "j"."archived_at" IS NOT NULL
            OR "lower"(TRIM(BOTH FROM COALESCE("j"."status_key", ''::"text"))) IN (
                'canceled'::"text",
                'cancelled'::"text",
                'void'::"text",
                'voided'::"text",
                'archived'::"text"
            )
        ) AS "is_void_job",
        COALESCE("sd"."service_date", ("j"."scheduled_at")::"date", ("j"."completed_at")::"date") AS "service_date",
        COALESCE(
            "j"."pricing_locked_at",
            (
                SELECT MIN("p1"."posted_at")
                FROM "public"."payment_allocations" AS "pa1"
                INNER JOIN "public"."payments" AS "p1" ON "p1"."id" = "pa1"."payment_id" AND "p1"."org_id" = "pa1"."org_id"
                WHERE "lower"(TRIM(BOTH FROM "pa1"."target_entity_type")) = 'job'::"text"
                  AND "pa1"."target_entity_id" = "j"."id"
                  AND "pa1"."org_id" = "j"."org_id"
                  AND "p1"."status" = 'posted'::"text"
                  AND "p1"."posted_at" IS NOT NULL
            ),
            (
                SELECT MIN("p2"."posted_at")
                FROM "public"."payments" AS "p2"
                WHERE "p2"."job_id" = "j"."id"
                  AND "p2"."org_id" = "j"."org_id"
                  AND "p2"."status" = 'posted'::"text"
                  AND "p2"."posted_at" IS NOT NULL
            ),
            (
                SELECT MIN("p3"."effective_at")
                FROM "public"."payments" AS "p3"
                WHERE "p3"."job_id" = "j"."id"
                  AND "p3"."org_id" = "j"."org_id"
                  AND "p3"."status" = 'posted'::"text"
                  AND "p3"."effective_at" IS NOT NULL
            ),
            (
                SELECT MIN("p4"."paid_at")
                FROM "public"."payments" AS "p4"
                WHERE "p4"."job_id" = "j"."id"
                  AND "p4"."org_id" = "j"."org_id"
                  AND "p4"."paid_at" IS NOT NULL
            ),
            "j"."scheduled_at",
            "j"."completed_at",
            "j"."created_at"
        ) AS "posted_at_ts",
        COALESCE(
            "j"."archived_at",
            (
                SELECT MAX("s2"."canceled_at")
                FROM "public"."schedules" AS "s2"
                WHERE "s2"."job_id" = "j"."id"
                  AND "s2"."org_id" = "j"."org_id"
                  AND "s2"."canceled_at" IS NOT NULL
            ),
            "j"."updated_at",
            "j"."created_at"
        ) AS "void_ts_fallback",
        COALESCE(
            (
                SELECT "jli2"."currency_code"
                FROM "public"."job_line_items" AS "jli2"
                WHERE "jli2"."job_id" = "j"."id"
                  AND COALESCE("jli2"."is_active", true)
                ORDER BY "jli2"."created_at" ASC NULLS LAST
                LIMIT 1
            ),
            'USD'::"text"
        ) AS "currency_code"
    FROM "public"."jobs" AS "j"
    LEFT JOIN "jl" ON "jl"."job_id" = "j"."id"
    LEFT JOIN "posted_alloc" AS "pa" ON "pa"."job_id" = "j"."id"
    LEFT JOIN "best_schedule" AS "bs" ON "bs"."job_id" = "j"."id"
    LEFT JOIN "service_date_q" AS "sd" ON "sd"."job_id" = "j"."id"
    WHERE
        CASE
            WHEN COALESCE("jl"."active_line_count", 0::bigint) > 0 THEN
                COALESCE("jl"."line_sum_cents", 0::bigint) <> 0
                OR COALESCE("pa"."posted_alloc_cents", 0::bigint) > 0
            WHEN COALESCE("j"."total_cents", 0) > 0 THEN true
            WHEN COALESCE("pa"."posted_alloc_cents", 0::bigint) > 0 THEN true
            WHEN EXISTS (
                SELECT 1 FROM "has_payment" AS "hp" WHERE "hp"."job_id" = "j"."id"
            ) THEN true
            WHEN EXISTS (
                SELECT 1 FROM "has_any_alloc" AS "ha" WHERE "ha"."job_id" = "j"."id"
            ) THEN true
            WHEN GREATEST(COALESCE("j"."gross_price_cents", 0), COALESCE("j"."estimated_total_cents", 0)) > 0 THEN true
            WHEN COALESCE("j"."amount_due_cents", 0) > 0 THEN true
            WHEN COALESCE("j"."amount_paid_cents", 0) > 0 THEN true
            ELSE false
        END
),
"to_insert" AS (
    SELECT
        "c"."org_id",
        "c"."job_id",
        "c"."schedule_id",
        "c"."charge_amount_cents",
        "c"."posted_alloc_cents",
        "c"."is_void_job",
        "c"."posted_at_ts",
        "c"."void_ts_fallback",
        "c"."service_date",
        COALESCE("c"."service_date", ("j"."created_at")::"date") AS "due_date",
        "c"."currency_code",
        "c"."receivable_basis",
        "j"."created_at" AS "job_created_at"
    FROM "candidates" AS "c"
    INNER JOIN "public"."jobs" AS "j" ON "j"."id" = "c"."job_id"
    WHERE "c"."charge_amount_cents" IS NOT NULL
      AND "c"."charge_amount_cents" > 0
      AND NOT EXISTS (
          SELECT 1
          FROM "public"."charges" AS "ex"
          WHERE "ex"."job_id" = "c"."job_id"
            AND "ex"."charge_type" = 'service'::"text"
            AND COALESCE(("ex"."metadata"->>'backfilled')::boolean, false) = true
            AND ("ex"."metadata"->>'backfill_version') = '1'
            AND ("ex"."metadata"->>'backfill_source') = 'job_level_receivable_migration'
      )
),
"with_status" AS (
    SELECT
        "ti".*,
        CASE
            WHEN "ti"."is_void_job" THEN
                CASE
                    WHEN "ti"."posted_alloc_cents" >= "ti"."charge_amount_cents" THEN 'paid'::"text"
                    WHEN "ti"."posted_alloc_cents" > 0 THEN 'partially_paid'::"text"
                    ELSE 'void'::"text"
                END
            WHEN "ti"."posted_alloc_cents" >= "ti"."charge_amount_cents" THEN 'paid'::"text"
            WHEN "ti"."posted_alloc_cents" > 0 THEN 'partially_paid'::"text"
            ELSE 'posted'::"text"
        END AS "charge_status",
        CASE
            WHEN
                "ti"."is_void_job"
                AND "ti"."posted_alloc_cents" < "ti"."charge_amount_cents"
                AND "ti"."posted_alloc_cents" = 0
            THEN "ti"."void_ts_fallback"
            ELSE NULL::timestamp with time zone
        END AS "voided_at_ts"
    FROM "to_insert" AS "ti"
)
INSERT INTO "public"."charges" (
    "org_id",
    "job_id",
    "schedule_id",
    "subscription_id",
    "source_charge_id",
    "charge_type",
    "status",
    "currency_code",
    "amount_cents",
    "service_date",
    "due_date",
    "posted_at",
    "voided_at",
    "description",
    "metadata",
    "created_at",
    "updated_at"
)
SELECT
    "ws"."org_id",
    "ws"."job_id",
    "ws"."schedule_id",
    NULL::"uuid",
    NULL::"uuid",
    'service'::"text",
    "ws"."charge_status",
    "ws"."currency_code",
    "ws"."charge_amount_cents",
    "ws"."service_date",
    "ws"."due_date",
    "ws"."posted_at_ts",
    "ws"."voided_at_ts",
    'Backfilled service charge'::"text",
    "jsonb_strip_nulls"(
        "jsonb_build_object"(
            'backfilled', true,
            'backfill_version', 1,
            'backfill_source', 'job_level_receivable_migration',
            'receivable_basis', "ws"."receivable_basis",
            'voided_at_inferred', (
                "ws"."voided_at_ts" IS NOT NULL
                AND "ws"."void_ts_fallback" IS NOT DISTINCT FROM "ws"."voided_at_ts"
            ),
            'posted_alloc_cents_at_backfill', "ws"."posted_alloc_cents"
        )
    ),
    "now"(),
    "now"()
FROM "with_status" AS "ws";

-- ---------------------------------------------------------------------------
-- 2) Map job-targeted allocations to the backfilled charge for that job
--    (DISTINCT ON: deterministic if multiple service rows ever match)
-- ---------------------------------------------------------------------------
UPDATE "public"."payment_allocations" AS "pa"
SET "charge_id" = "bc"."id"
FROM (
    SELECT DISTINCT ON ("c"."job_id", "c"."org_id")
        "c"."id",
        "c"."job_id",
        "c"."org_id"
    FROM "public"."charges" AS "c"
    WHERE "c"."charge_type" = 'service'::"text"
      AND COALESCE(("c"."metadata"->>'backfilled')::boolean, false) = true
      AND ("c"."metadata"->>'backfill_version') = '1'
      AND ("c"."metadata"->>'backfill_source') = 'job_level_receivable_migration'
    ORDER BY "c"."job_id", "c"."org_id", "c"."created_at" ASC
) AS "bc"
WHERE "pa"."charge_id" IS NULL
  AND "lower"(TRIM(BOTH FROM "pa"."target_entity_type")) = 'job'::"text"
  AND "pa"."target_entity_id" = "bc"."job_id"
  AND "pa"."org_id" = "bc"."org_id";
