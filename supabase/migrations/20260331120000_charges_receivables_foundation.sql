-- Migration 1: charge-level receivables — structural schema only.
-- Adds public.charges, public.charge_line_items; nullable payment_allocations.charge_id;
-- schedules.status_key default + backfill (operational status lives on status_key, not a "status" column).
-- RLS: same-org via public.current_org_id() + service_role, aligned with payment_allocations / job_line_items.
-- Policy idempotency: each policy is dropped by fixed name before CREATE.

-- ---------------------------------------------------------------------------
-- charges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."charges" (
    "id" "uuid" PRIMARY KEY DEFAULT "gen_random_uuid"(),
    "org_id" "uuid" NOT NULL REFERENCES "public"."orgs" ("id") ON DELETE RESTRICT,
    "job_id" "uuid" NOT NULL REFERENCES "public"."jobs" ("id") ON DELETE RESTRICT,
    "schedule_id" "uuid" REFERENCES "public"."schedules" ("id") ON DELETE SET NULL,
    "subscription_id" "uuid" REFERENCES "public"."customer_subscriptions" ("id") ON DELETE SET NULL,
    "source_charge_id" "uuid" REFERENCES "public"."charges" ("id") ON DELETE SET NULL,
    "charge_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "currency_code" "text" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "service_date" "date",
    "due_date" "date",
    "posted_at" timestamp with time zone,
    "voided_at" timestamp with time zone,
    "description" "text",
    "metadata" "jsonb" NOT NULL DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    CONSTRAINT "charges_charge_type_chk" CHECK (
        ("charge_type" = ANY (ARRAY['service'::"text", 'fee'::"text", 'adjustment'::"text"]))
    ),
    CONSTRAINT "charges_status_chk" CHECK (
        (
            "status" = ANY (
                ARRAY[
                    'draft'::"text",
                    'posted'::"text",
                    'partially_paid'::"text",
                    'paid'::"text",
                    'void'::"text"
                ]
            )
        )
    ),
    CONSTRAINT "charges_amount_cents_nonzero_chk" CHECK (("amount_cents" <> 0))
);

CREATE INDEX IF NOT EXISTS "idx_charges_org_job"
    ON "public"."charges" USING "btree" ("org_id", "job_id");

CREATE INDEX IF NOT EXISTS "idx_charges_org_status"
    ON "public"."charges" USING "btree" ("org_id", "status");

CREATE INDEX IF NOT EXISTS "idx_charges_org_due_date"
    ON "public"."charges" USING "btree" ("org_id", "due_date");

CREATE INDEX IF NOT EXISTS "idx_charges_org_charge_type"
    ON "public"."charges" USING "btree" ("org_id", "charge_type");

CREATE INDEX IF NOT EXISTS "idx_charges_org_job_status"
    ON "public"."charges" USING "btree" ("org_id", "job_id", "status");

CREATE INDEX IF NOT EXISTS "idx_charges_org_schedule_id_partial"
    ON "public"."charges" USING "btree" ("org_id", "schedule_id")
    WHERE ("schedule_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_charges_org_subscription_id_partial"
    ON "public"."charges" USING "btree" ("org_id", "subscription_id")
    WHERE ("subscription_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_charges_org_source_charge_id_partial"
    ON "public"."charges" USING "btree" ("org_id", "source_charge_id")
    WHERE ("source_charge_id" IS NOT NULL);

COMMENT ON TABLE "public"."charges" IS 'First-class receivable charge; schedule_id is optional context only. Job targeting remains on job_id; payment_allocations.charge_id is for future charge-level allocation (nullable until backfill).';

DROP TRIGGER IF EXISTS "trg_charges_updated_at" ON "public"."charges";

CREATE TRIGGER "trg_charges_updated_at"
    BEFORE UPDATE ON "public"."charges"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."set_updated_at"();

-- ---------------------------------------------------------------------------
-- charge_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."charge_line_items" (
    "id" "uuid" PRIMARY KEY DEFAULT "gen_random_uuid"(),
    "org_id" "uuid" NOT NULL REFERENCES "public"."orgs" ("id") ON DELETE RESTRICT,
    "charge_id" "uuid" NOT NULL REFERENCES "public"."charges" ("id") ON DELETE CASCADE,
    "job_line_item_id" "uuid" REFERENCES "public"."job_line_items" ("id") ON DELETE SET NULL,
    "description_snapshot" "text",
    "amount_cents" bigint NOT NULL,
    "metadata" "jsonb" NOT NULL DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    CONSTRAINT "charge_line_items_amount_cents_nonzero_chk" CHECK (("amount_cents" <> 0))
);

CREATE INDEX IF NOT EXISTS "idx_charge_line_items_org_charge"
    ON "public"."charge_line_items" USING "btree" ("org_id", "charge_id");

CREATE INDEX IF NOT EXISTS "idx_charge_line_items_org_job_line_item_id_partial"
    ON "public"."charge_line_items" USING "btree" ("org_id", "job_line_item_id")
    WHERE ("job_line_item_id" IS NOT NULL);

COMMENT ON TABLE "public"."charge_line_items" IS 'Line-level detail for a charge; optional link to job_line_items for provenance.';

-- ---------------------------------------------------------------------------
-- payment_allocations: nullable charge_id (no cutover / no backfill in this migration)
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."payment_allocations"
    ADD COLUMN IF NOT EXISTS "charge_id" "uuid";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "pg_constraint"
        WHERE "conname" = 'payment_allocations_charge_id_fkey'
    ) THEN
        ALTER TABLE ONLY "public"."payment_allocations"
            ADD CONSTRAINT "payment_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "public"."charges" ("id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_payment_allocations_org_charge_id_partial"
    ON "public"."payment_allocations" USING "btree" ("org_id", "charge_id")
    WHERE ("charge_id" IS NOT NULL);

COMMENT ON COLUMN "public"."payment_allocations"."charge_id" IS 'Future charge-level allocation target; nullable. Job-level application remains via target_entity_type/target_entity_id until cutover.';

-- ---------------------------------------------------------------------------
-- schedules: default operational status on status_key (column name in this schema)
-- ---------------------------------------------------------------------------
ALTER TABLE ONLY "public"."schedules"
    ALTER COLUMN "status_key" SET DEFAULT 'scheduled'::"text";

UPDATE "public"."schedules" AS "s"
SET
    "status_key" = 'scheduled'::"text"
WHERE
    "s"."status_key" IS NULL
    OR "s"."status_key" = 'none'::"text";

-- ---------------------------------------------------------------------------
-- RLS: charges
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."charges" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "charges_select_same_org" ON "public"."charges";
DROP POLICY IF EXISTS "charges_insert_same_org" ON "public"."charges";
DROP POLICY IF EXISTS "charges_update_same_org" ON "public"."charges";
DROP POLICY IF EXISTS "charges_delete_same_org" ON "public"."charges";
DROP POLICY IF EXISTS "service role full access charges" ON "public"."charges";

CREATE POLICY "charges_select_same_org" ON "public"."charges" FOR SELECT TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "charges_insert_same_org" ON "public"."charges" FOR INSERT TO "authenticated"
    WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "charges_update_same_org" ON "public"."charges" FOR UPDATE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "service role full access charges" ON "public"."charges" TO "service_role" USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."charges" TO "authenticated";
GRANT ALL ON TABLE "public"."charges" TO "service_role";

-- ---------------------------------------------------------------------------
-- RLS: charge_line_items
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."charge_line_items" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "charge_line_items_select_same_org" ON "public"."charge_line_items";
DROP POLICY IF EXISTS "charge_line_items_insert_same_org" ON "public"."charge_line_items";
DROP POLICY IF EXISTS "charge_line_items_update_same_org" ON "public"."charge_line_items";
DROP POLICY IF EXISTS "charge_line_items_delete_same_org" ON "public"."charge_line_items";
DROP POLICY IF EXISTS "service role full access charge_line_items" ON "public"."charge_line_items";

CREATE POLICY "charge_line_items_select_same_org" ON "public"."charge_line_items" FOR SELECT TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "charge_line_items_insert_same_org" ON "public"."charge_line_items" FOR INSERT TO "authenticated"
    WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "charge_line_items_update_same_org" ON "public"."charge_line_items" FOR UPDATE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "service role full access charge_line_items" ON "public"."charge_line_items" TO "service_role" USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."charge_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."charge_line_items" TO "service_role";
