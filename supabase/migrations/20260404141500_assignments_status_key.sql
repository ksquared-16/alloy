-- Denormalized canonical assignment status key (mirrors assignment_statuses.key) for API/workflows without FK-only reads.
ALTER TABLE "public"."assignments"
    ADD COLUMN IF NOT EXISTS "status_key" "text";

UPDATE "public"."assignments" AS "a"
SET "status_key" = "s"."key"
FROM "public"."assignment_statuses" AS "s"
WHERE "a"."assignment_status_id" = "s"."id"
  AND ("a"."status_key" IS NULL OR TRIM("a"."status_key") = '');

CREATE INDEX IF NOT EXISTS "idx_assignments_status_key" ON "public"."assignments" USING "btree" ("org_id", "status_key");
