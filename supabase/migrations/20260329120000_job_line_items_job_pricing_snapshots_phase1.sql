-- Phase 1: job line-item pricing model (additive only; no backfill, no trigger changes).
-- RLS: org isolation via public.current_org_id(), consistent with action_links / ledger / departments.

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

-- ---------------------------------------------------------------------------
-- job_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."job_line_items" (
    "id" "uuid" PRIMARY KEY DEFAULT "gen_random_uuid"(),
    "org_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL REFERENCES "public"."jobs" ("id") ON DELETE CASCADE,
    "sort_order" integer,
    "line_type" "text" NOT NULL,
    "category_key" "text",
    "label" "text" NOT NULL,
    "description" "text",
    "quantity" numeric NOT NULL DEFAULT 1,
    "unit_amount_cents" integer NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency_code" "text" NOT NULL DEFAULT 'USD',
    "is_taxable" boolean DEFAULT false,
    "tax_category_key" "text",
    "pricing_source" "text",
    "source_entity_type" "text",
    "source_entity_id" "uuid",
    "locked_at" timestamp with time zone,
    "is_system_generated" boolean DEFAULT true,
    "is_manual_override" boolean DEFAULT false,
    "manual_override_reason" "text",
    "replaced_line_item_id" "uuid" REFERENCES "public"."job_line_items" ("id"),
    "is_active" boolean DEFAULT true,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid"
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'job_line_items_line_type_check'
    ) THEN
        ALTER TABLE ONLY "public"."job_line_items"
            ADD CONSTRAINT "job_line_items_line_type_check"
            CHECK (
                "line_type" = ANY (
                    ARRAY[
                        'service'::text,
                        'addon'::text,
                        'discount'::text,
                        'fee'::text,
                        'adjustment'::text,
                        'tax'::text
                    ]
                )
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_job_line_items_job_id" ON "public"."job_line_items" USING "btree" ("job_id");
CREATE INDEX IF NOT EXISTS "idx_job_line_items_org_job" ON "public"."job_line_items" USING "btree" ("org_id", "job_id");
CREATE INDEX IF NOT EXISTS "idx_job_line_items_line_type" ON "public"."job_line_items" USING "btree" ("org_id", "line_type");
CREATE INDEX IF NOT EXISTS "idx_job_line_items_active" ON "public"."job_line_items" USING "btree" ("is_active");

-- ---------------------------------------------------------------------------
-- job_pricing_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."job_pricing_snapshots" (
    "id" "uuid" PRIMARY KEY DEFAULT "gen_random_uuid"(),
    "org_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL REFERENCES "public"."jobs" ("id") ON DELETE CASCADE,
    "snapshot_type" "text" NOT NULL,
    "version_number" integer NOT NULL,
    "summary" "jsonb" NOT NULL,
    "line_items" "jsonb" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);

CREATE INDEX IF NOT EXISTS "idx_job_pricing_snapshots_job_id" ON "public"."job_pricing_snapshots" USING "btree" ("job_id");
CREATE INDEX IF NOT EXISTS "idx_job_pricing_snapshots_org_job" ON "public"."job_pricing_snapshots" USING "btree" ("org_id", "job_id");

-- ---------------------------------------------------------------------------
-- jobs: additive pricing columns
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."jobs"
    ADD COLUMN IF NOT EXISTS "subtotal_cents" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "discount_total_cents" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "fee_total_cents" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "adjustment_total_cents" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "tax_total_cents" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "total_cents" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "amount_paid_cents" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "amount_due_cents" integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "pricing_status" "text" DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS "pricing_locked_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "pricing_version" integer DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'jobs_pricing_status_check'
    ) THEN
        ALTER TABLE ONLY "public"."jobs"
            ADD CONSTRAINT "jobs_pricing_status_check"
            CHECK (
                "pricing_status" = ANY (
                    ARRAY[
                        'draft'::text,
                        'locked'::text,
                        'overridden'::text,
                        'finalized'::text
                    ]
                )
            );
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RLS (org_id = session org via current_org_id())
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."job_line_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."job_pricing_snapshots" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_line_items_select_same_org" ON "public"."job_line_items" FOR SELECT TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "job_line_items_insert_same_org" ON "public"."job_line_items" FOR INSERT TO "authenticated"
    WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "job_line_items_update_same_org" ON "public"."job_line_items" FOR UPDATE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "job_line_items_delete_same_org" ON "public"."job_line_items" FOR DELETE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "service role full access job_line_items" ON "public"."job_line_items" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "job_pricing_snapshots_select_same_org" ON "public"."job_pricing_snapshots" FOR SELECT TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "job_pricing_snapshots_insert_same_org" ON "public"."job_pricing_snapshots" FOR INSERT TO "authenticated"
    WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "job_pricing_snapshots_update_same_org" ON "public"."job_pricing_snapshots" FOR UPDATE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "job_pricing_snapshots_delete_same_org" ON "public"."job_pricing_snapshots" FOR DELETE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "service role full access job_pricing_snapshots" ON "public"."job_pricing_snapshots" TO "service_role" USING (true) WITH CHECK (true);

GRANT ALL ON TABLE "public"."job_line_items" TO "anon";
GRANT ALL ON TABLE "public"."job_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."job_line_items" TO "service_role";

GRANT ALL ON TABLE "public"."job_pricing_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."job_pricing_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."job_pricing_snapshots" TO "service_role";
