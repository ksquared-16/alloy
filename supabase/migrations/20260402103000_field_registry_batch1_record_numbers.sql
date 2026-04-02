-- =============================================================================
-- Batch 1 — Field registry hardening: native record-number columns
-- =============================================================================
-- Adds bigint *number columns (if missing), backfills NULLs only, sets NOT NULL,
-- and creates unique indexes on (org_id, <number_column>).
--
-- Does not modify field_definitions or field_values.
--
-- Idempotency (safe if some steps were already applied manually in Supabase):
--   • ADD COLUMN IF NOT EXISTS — no-op when column exists
--   • Integer/smallint → bigint widening — only when information_schema says so
--   • org_id backfill on opportunities — only WHERE org_id IS NULL
--   • Record backfills — only WHERE <number> IS NULL (jobs: see section 4)
--   • SET NOT NULL — succeeds if already NOT NULL
--   • CREATE UNIQUE INDEX IF NOT EXISTS — no-op when index name exists
--
-- Safety: opportunities must have org_id after customer-linked backfill; migration
-- raises if any row still has org_id NULL (precheck may have passed earlier; this
-- remains the guardrail at apply time).
--
-- Apply order: run this file before 20260402103100_field_registry_batch1_field_definition_seeds.sql
--
-- Jobs: set job_number from job_number_for_customer where job_number IS NULL;
-- then clear duplicate (org_id, job_number) keeping earliest (created_at, id);
-- then assign sequential bigint per org for remaining NULL job_number.
--
-- ---------------------------------------------------------------------------
-- Validation (run in SQL editor after migrate; expect nulls = 0, dup rows = 0)
-- ---------------------------------------------------------------------------
-- -- Any NULL record numbers:
-- SELECT 'customers' AS t, COUNT(*) FILTER (WHERE customer_number IS NULL) AS nulls
-- FROM public.customers
-- UNION ALL SELECT 'jobs', COUNT(*) FILTER (WHERE job_number IS NULL) FROM public.jobs
-- UNION ALL SELECT 'opportunities', COUNT(*) FILTER (WHERE opportunity_number IS NULL) FROM public.opportunities
-- UNION ALL SELECT 'locations', COUNT(*) FILTER (WHERE location_number IS NULL) FROM public.locations
-- UNION ALL SELECT 'persons', COUNT(*) FILTER (WHERE person_number IS NULL) FROM public.persons
-- UNION ALL SELECT 'vendors', COUNT(*) FILTER (WHERE vendor_number IS NULL) FROM public.vendors
-- UNION ALL SELECT 'schedules', COUNT(*) FILTER (WHERE schedule_number IS NULL) FROM public.schedules;
--
-- -- Duplicate (org_id, number) pairs (expect no rows):
-- SELECT 'customers'::text AS t, c.org_id, c.customer_number AS n, COUNT(*)::bigint AS cnt
-- FROM public.customers c GROUP BY c.org_id, c.customer_number HAVING COUNT(*) > 1
-- UNION ALL
-- SELECT 'jobs', j.org_id, j.job_number, COUNT(*) FROM public.jobs j GROUP BY j.org_id, j.job_number HAVING COUNT(*) > 1
-- UNION ALL
-- SELECT 'opportunities', o.org_id, o.opportunity_number, COUNT(*) FROM public.opportunities o GROUP BY o.org_id, o.opportunity_number HAVING COUNT(*) > 1
-- UNION ALL
-- SELECT 'locations', l.org_id, l.location_number, COUNT(*) FROM public.locations l GROUP BY l.org_id, l.location_number HAVING COUNT(*) > 1
-- UNION ALL
-- SELECT 'persons', p.org_id, p.person_number, COUNT(*) FROM public.persons p GROUP BY p.org_id, p.person_number HAVING COUNT(*) > 1
-- UNION ALL
-- SELECT 'vendors', v.org_id, v.vendor_number, COUNT(*) FROM public.vendors v GROUP BY v.org_id, v.vendor_number HAVING COUNT(*) > 1
-- UNION ALL
-- SELECT 'schedules', s.org_id, s.schedule_number, COUNT(*) FROM public.schedules s GROUP BY s.org_id, s.schedule_number HAVING COUNT(*) > 1;
--
-- -- Indexes present (optional):
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'ux_%_org_%number%'
-- ORDER BY indexname;

-- ---------------------------------------------------------------------------
-- 1) Columns (bigint; skip if already present)
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."customers" ADD COLUMN IF NOT EXISTS "customer_number" bigint;

ALTER TABLE "public"."jobs" ADD COLUMN IF NOT EXISTS "job_number" bigint;

ALTER TABLE "public"."opportunities" ADD COLUMN IF NOT EXISTS "opportunity_number" bigint;

ALTER TABLE "public"."locations" ADD COLUMN IF NOT EXISTS "location_number" bigint;

ALTER TABLE "public"."persons" ADD COLUMN IF NOT EXISTS "person_number" bigint;

ALTER TABLE "public"."vendors" ADD COLUMN IF NOT EXISTS "vendor_number" bigint;

ALTER TABLE "public"."schedules" ADD COLUMN IF NOT EXISTS "schedule_number" bigint;

-- Widen legacy integer/smallint columns to bigint (skip when already bigint or absent).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "information_schema"."columns" c
        WHERE c."table_schema" = 'public'
          AND c."table_name" = 'customers'
          AND c."column_name" = 'customer_number'
          AND c."data_type" = ANY (ARRAY['integer', 'smallint'])
    ) THEN
        ALTER TABLE "public"."customers"
            ALTER COLUMN "customer_number" TYPE bigint USING ("customer_number")::bigint;
    END IF;
    IF EXISTS (
        SELECT 1 FROM "information_schema"."columns" c
        WHERE c."table_schema" = 'public' AND c."table_name" = 'jobs'
          AND c."column_name" = 'job_number'
          AND c."data_type" = ANY (ARRAY['integer', 'smallint'])
    ) THEN
        ALTER TABLE "public"."jobs"
            ALTER COLUMN "job_number" TYPE bigint USING ("job_number")::bigint;
    END IF;
    IF EXISTS (
        SELECT 1 FROM "information_schema"."columns" c
        WHERE c."table_schema" = 'public' AND c."table_name" = 'opportunities'
          AND c."column_name" = 'opportunity_number'
          AND c."data_type" = ANY (ARRAY['integer', 'smallint'])
    ) THEN
        ALTER TABLE "public"."opportunities"
            ALTER COLUMN "opportunity_number" TYPE bigint USING ("opportunity_number")::bigint;
    END IF;
    IF EXISTS (
        SELECT 1 FROM "information_schema"."columns" c
        WHERE c."table_schema" = 'public' AND c."table_name" = 'locations'
          AND c."column_name" = 'location_number'
          AND c."data_type" = ANY (ARRAY['integer', 'smallint'])
    ) THEN
        ALTER TABLE "public"."locations"
            ALTER COLUMN "location_number" TYPE bigint USING ("location_number")::bigint;
    END IF;
    IF EXISTS (
        SELECT 1 FROM "information_schema"."columns" c
        WHERE c."table_schema" = 'public' AND c."table_name" = 'persons'
          AND c."column_name" = 'person_number'
          AND c."data_type" = ANY (ARRAY['integer', 'smallint'])
    ) THEN
        ALTER TABLE "public"."persons"
            ALTER COLUMN "person_number" TYPE bigint USING ("person_number")::bigint;
    END IF;
    IF EXISTS (
        SELECT 1 FROM "information_schema"."columns" c
        WHERE c."table_schema" = 'public' AND c."table_name" = 'vendors'
          AND c."column_name" = 'vendor_number'
          AND c."data_type" = ANY (ARRAY['integer', 'smallint'])
    ) THEN
        ALTER TABLE "public"."vendors"
            ALTER COLUMN "vendor_number" TYPE bigint USING ("vendor_number")::bigint;
    END IF;
    IF EXISTS (
        SELECT 1 FROM "information_schema"."columns" c
        WHERE c."table_schema" = 'public' AND c."table_name" = 'schedules'
          AND c."column_name" = 'schedule_number'
          AND c."data_type" = ANY (ARRAY['integer', 'smallint'])
    ) THEN
        ALTER TABLE "public"."schedules"
            ALTER COLUMN "schedule_number" TYPE bigint USING ("schedule_number")::bigint;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Opportunities: org_id from customer when missing (needed for org-scoped numbers)
-- ---------------------------------------------------------------------------
UPDATE "public"."opportunities" AS o
SET "org_id" = c."org_id"
FROM "public"."customers" AS c
WHERE o."customer_id" IS NOT NULL
  AND o."org_id" IS NULL
  AND c."id" = o."customer_id";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "public"."opportunities" o WHERE o."org_id" IS NULL) THEN
        RAISE EXCEPTION
            'field_registry_batch1: opportunities.org_id is NULL for at least one row after customer backfill; fix or link a customer before applying NOT NULL';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Generic backfill: org-scoped sequential, ordered by created_at, id
-- ---------------------------------------------------------------------------
WITH "mx" AS (
    SELECT "org_id", COALESCE(MAX("customer_number"), 0)::bigint AS "base"
    FROM "public"."customers"
    GROUP BY "org_id"
),
"numbered" AS (
    SELECT
        c."id",
        m."base" + (ROW_NUMBER() OVER (
            PARTITION BY c."org_id" ORDER BY c."created_at" NULLS LAST, c."id"
        ))::bigint AS "new_num"
    FROM "public"."customers" c
    INNER JOIN "mx" m ON m."org_id" = c."org_id"
    WHERE c."customer_number" IS NULL
)
UPDATE "public"."customers" c
SET "customer_number" = n."new_num"
FROM "numbered" n
WHERE c."id" = n."id";

WITH "mx" AS (
    SELECT "org_id", COALESCE(MAX("location_number"), 0)::bigint AS "base"
    FROM "public"."locations"
    GROUP BY "org_id"
),
"numbered" AS (
    SELECT
        l."id",
        m."base" + (ROW_NUMBER() OVER (
            PARTITION BY l."org_id" ORDER BY l."created_at" NULLS LAST, l."id"
        ))::bigint AS "new_num"
    FROM "public"."locations" l
    INNER JOIN "mx" m ON m."org_id" = l."org_id"
    WHERE l."location_number" IS NULL
)
UPDATE "public"."locations" l
SET "location_number" = n."new_num"
FROM "numbered" n
WHERE l."id" = n."id";

WITH "mx" AS (
    SELECT "org_id", COALESCE(MAX("person_number"), 0)::bigint AS "base"
    FROM "public"."persons"
    GROUP BY "org_id"
),
"numbered" AS (
    SELECT
        p."id",
        m."base" + (ROW_NUMBER() OVER (
            PARTITION BY p."org_id" ORDER BY p."created_at" NULLS LAST, p."id"
        ))::bigint AS "new_num"
    FROM "public"."persons" p
    INNER JOIN "mx" m ON m."org_id" = p."org_id"
    WHERE p."person_number" IS NULL
)
UPDATE "public"."persons" p
SET "person_number" = n."new_num"
FROM "numbered" n
WHERE p."id" = n."id";

WITH "mx" AS (
    SELECT "org_id", COALESCE(MAX("vendor_number"), 0)::bigint AS "base"
    FROM "public"."vendors"
    GROUP BY "org_id"
),
"numbered" AS (
    SELECT
        v."id",
        m."base" + (ROW_NUMBER() OVER (
            PARTITION BY v."org_id" ORDER BY v."created_at" NULLS LAST, v."id"
        ))::bigint AS "new_num"
    FROM "public"."vendors" v
    INNER JOIN "mx" m ON m."org_id" = v."org_id"
    WHERE v."vendor_number" IS NULL
)
UPDATE "public"."vendors" v
SET "vendor_number" = n."new_num"
FROM "numbered" n
WHERE v."id" = n."id";

WITH "mx" AS (
    SELECT "org_id", COALESCE(MAX("schedule_number"), 0)::bigint AS "base"
    FROM "public"."schedules"
    GROUP BY "org_id"
),
"numbered" AS (
    SELECT
        s."id",
        m."base" + (ROW_NUMBER() OVER (
            PARTITION BY s."org_id" ORDER BY s."created_at" NULLS LAST, s."id"
        ))::bigint AS "new_num"
    FROM "public"."schedules" s
    INNER JOIN "mx" m ON m."org_id" = s."org_id"
    WHERE s."schedule_number" IS NULL
)
UPDATE "public"."schedules" s
SET "schedule_number" = n."new_num"
FROM "numbered" n
WHERE s."id" = n."id";

WITH "mx" AS (
    SELECT "org_id", COALESCE(MAX("opportunity_number"), 0)::bigint AS "base"
    FROM "public"."opportunities"
    GROUP BY "org_id"
),
"numbered" AS (
    SELECT
        o."id",
        m."base" + (ROW_NUMBER() OVER (
            PARTITION BY o."org_id" ORDER BY o."created_at" NULLS LAST, o."id"
        ))::bigint AS "new_num"
    FROM "public"."opportunities" o
    INNER JOIN "mx" m ON m."org_id" = o."org_id"
    WHERE o."opportunity_number" IS NULL
)
UPDATE "public"."opportunities" o
SET "opportunity_number" = n."new_num"
FROM "numbered" n
WHERE o."id" = n."id";

-- ---------------------------------------------------------------------------
-- 4) Jobs: job_number_for_customer first, dedupe, then sequential for NULLs
-- ---------------------------------------------------------------------------
UPDATE "public"."jobs" j
SET "job_number" = j."job_number_for_customer"::bigint
WHERE j."job_number" IS NULL
  AND j."job_number_for_customer" IS NOT NULL;

WITH "dup_ids" AS (
    SELECT j."id"
    FROM (
        SELECT
            j2."id",
            ROW_NUMBER() OVER (
                PARTITION BY j2."org_id", j2."job_number" ORDER BY j2."created_at" NULLS LAST, j2."id"
            ) AS "rn"
        FROM "public"."jobs" j2
        WHERE j2."job_number" IS NOT NULL
    ) j
    WHERE j."rn" > 1
)
UPDATE "public"."jobs" j
SET "job_number" = NULL
WHERE j."id" IN (SELECT "id" FROM "dup_ids");

WITH "mx" AS (
    SELECT "org_id", COALESCE(MAX("job_number"), 0)::bigint AS "base"
    FROM "public"."jobs"
    GROUP BY "org_id"
),
"numbered" AS (
    SELECT
        j."id",
        m."base" + (ROW_NUMBER() OVER (
            PARTITION BY j."org_id" ORDER BY j."created_at" NULLS LAST, j."id"
        ))::bigint AS "new_num"
    FROM "public"."jobs" j
    INNER JOIN "mx" m ON m."org_id" = j."org_id"
    WHERE j."job_number" IS NULL
)
UPDATE "public"."jobs" j
SET "job_number" = n."new_num"
FROM "numbered" n
WHERE j."id" = n."id";

-- ---------------------------------------------------------------------------
-- 5) NOT NULL (after backfill)
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."customers" ALTER COLUMN "customer_number" SET NOT NULL;

ALTER TABLE "public"."jobs" ALTER COLUMN "job_number" SET NOT NULL;

ALTER TABLE "public"."opportunities" ALTER COLUMN "opportunity_number" SET NOT NULL;

ALTER TABLE "public"."locations" ALTER COLUMN "location_number" SET NOT NULL;

ALTER TABLE "public"."persons" ALTER COLUMN "person_number" SET NOT NULL;

ALTER TABLE "public"."vendors" ALTER COLUMN "vendor_number" SET NOT NULL;

ALTER TABLE "public"."schedules" ALTER COLUMN "schedule_number" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 6) Unique indexes (org_id, *number)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "ux_customers_org_customer_number"
    ON "public"."customers" ("org_id", "customer_number");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_jobs_org_job_number"
    ON "public"."jobs" ("org_id", "job_number");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_opportunities_org_opportunity_number"
    ON "public"."opportunities" ("org_id", "opportunity_number");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_locations_org_location_number"
    ON "public"."locations" ("org_id", "location_number");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_persons_org_person_number"
    ON "public"."persons" ("org_id", "person_number");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_vendors_org_vendor_number"
    ON "public"."vendors" ("org_id", "vendor_number");

CREATE UNIQUE INDEX IF NOT EXISTS "ux_schedules_org_schedule_number"
    ON "public"."schedules" ("org_id", "schedule_number");
