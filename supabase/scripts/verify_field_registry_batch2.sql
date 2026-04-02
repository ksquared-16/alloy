-- Verification: Batch 1 record numbers + Batch 2 field registry assumptions.
-- Read-only. Run in Supabase SQL editor or psql after Batch 1 migrations and Batch 2 API deploy.
--
-- Optional: set session variables for API smoke record checks (psql):
--   \set customer_id '00000000-0000-0000-0000-000000000000'
--   (then uncomment the optional block at the bottom)

-- ---------------------------------------------------------------------------
-- 1) No NULL native record numbers
-- ---------------------------------------------------------------------------
SELECT 'customers' AS "entity", COUNT(*) FILTER (WHERE "customer_number" IS NULL) AS "null_count"
FROM "public"."customers"
UNION ALL
SELECT 'jobs', COUNT(*) FILTER (WHERE "job_number" IS NULL) FROM "public"."jobs"
UNION ALL
SELECT 'opportunities', COUNT(*) FILTER (WHERE "opportunity_number" IS NULL) FROM "public"."opportunities"
UNION ALL
SELECT 'locations', COUNT(*) FILTER (WHERE "location_number" IS NULL) FROM "public"."locations"
UNION ALL
SELECT 'persons', COUNT(*) FILTER (WHERE "person_number" IS NULL) FROM "public"."persons"
UNION ALL
SELECT 'vendors', COUNT(*) FILTER (WHERE "vendor_number" IS NULL) FROM "public"."vendors"
UNION ALL
SELECT 'schedules', COUNT(*) FILTER (WHERE "schedule_number" IS NULL) FROM "public"."schedules";
-- Expect null_count = 0 for each row.

-- ---------------------------------------------------------------------------
-- 2) No duplicate (org_id, *number) within each table
-- ---------------------------------------------------------------------------
SELECT 'customers_dupes' AS "check", COUNT(*) AS "violation_rows"
FROM (
    SELECT "org_id", "customer_number"
    FROM "public"."customers"
    GROUP BY "org_id", "customer_number"
    HAVING COUNT(*) > 1
) "x"
UNION ALL
SELECT 'jobs_dupes', COUNT(*) FROM (
    SELECT "org_id", "job_number" FROM "public"."jobs" GROUP BY "org_id", "job_number" HAVING COUNT(*) > 1
) "j"
UNION ALL
SELECT 'opportunities_dupes', COUNT(*) FROM (
    SELECT "org_id", "opportunity_number" FROM "public"."opportunities" GROUP BY "org_id", "opportunity_number" HAVING COUNT(*) > 1
) "o"
UNION ALL
SELECT 'locations_dupes', COUNT(*) FROM (
    SELECT "org_id", "location_number" FROM "public"."locations" GROUP BY "org_id", "location_number" HAVING COUNT(*) > 1
) "l"
UNION ALL
SELECT 'persons_dupes', COUNT(*) FROM (
    SELECT "org_id", "person_number" FROM "public"."persons" GROUP BY "org_id", "person_number" HAVING COUNT(*) > 1
) "p"
UNION ALL
SELECT 'vendors_dupes', COUNT(*) FROM (
    SELECT "org_id", "vendor_number" FROM "public"."vendors" GROUP BY "org_id", "vendor_number" HAVING COUNT(*) > 1
) "v"
UNION ALL
SELECT 'schedules_dupes', COUNT(*) FROM (
    SELECT "org_id", "schedule_number" FROM "public"."schedules" GROUP BY "org_id", "schedule_number" HAVING COUNT(*) > 1
) "s";
-- Expect violation_rows = 0 for each.

-- ---------------------------------------------------------------------------
-- 3) Batch 1 system field_definitions exist (7 keys × org)
-- ---------------------------------------------------------------------------
SELECT
    "fd"."org_id",
    COUNT(*) FILTER (
        WHERE "fd"."field_key" IN (
            'customer_number', 'job_number', 'opportunity_number', 'location_number',
            'person_number', 'vendor_number', 'schedule_number'
        )
    ) AS "batch1_record_field_defs"
FROM "public"."field_definitions" AS "fd"
GROUP BY "fd"."org_id"
ORDER BY "fd"."org_id";
-- Expect batch1_record_field_defs >= 7 per org (exactly 7 if no extras).

-- ---------------------------------------------------------------------------
-- 4) field_values rows still present (sanity — optional baseline)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS "field_values_total" FROM "public"."field_values";
-- Compare to a known baseline in your environment; expect no accidental wipe.

-- ---------------------------------------------------------------------------
-- 5) Optional: rows used by API smoke (uncomment and substitute UUIDs)
-- ---------------------------------------------------------------------------
-- SELECT 'smoke_customer' AS "t", "id", "customer_number", "name"
-- FROM "public"."customers" WHERE "id" = :'customer_id'::uuid;
-- SELECT 'smoke_job' AS "t", "id", "org_id", "job_number", "title"
-- FROM "public"."jobs" WHERE "id" = :'job_id'::uuid;
-- (repeat for person, opportunity, location as needed)
