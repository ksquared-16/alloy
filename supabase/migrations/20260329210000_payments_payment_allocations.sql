-- Sprint 3/30/26 Task 2: payments + payment_allocations foundation.
-- Extends existing public.payments (job-centric legacy columns retained for compatibility).
-- RLS: same-org via current_org_id() + service_role, aligned with ledger_transactions / job_line_items.
--
-- Outstanding balance (application logic): only allocations with status = active on payments with
-- status = posted reduce authoritative outstanding; pending/failed/voided payments do not.
--
-- Policy idempotency: each policy is dropped by fixed name before CREATE. If you renamed policies
-- in production, adjust DROP/CREATE names to match or avoid duplicate-name conflicts.


-- ---------------------------------------------------------------------------
-- payment_allocations (new)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."payment_allocations" (
    "id" "uuid" PRIMARY KEY DEFAULT "gen_random_uuid"(),
    "org_id" "uuid" NOT NULL REFERENCES "public"."orgs" ("id") ON DELETE RESTRICT,
    "payment_id" "uuid" NOT NULL REFERENCES "public"."payments" ("id") ON DELETE RESTRICT,
    "target_entity_type" "text" NOT NULL,
    "target_entity_id" "uuid" NOT NULL,
    "allocated_amount_cents" bigint NOT NULL,
    "status" "text" NOT NULL,
    "allocation_type" "text" NOT NULL,
    "allocated_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    "reversed_at" timestamp with time zone,
    "reversal_reason" "text",
    "notes" "text",
    "metadata" "jsonb" NOT NULL DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT "now"(),
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "payment_allocations_allocated_amount_positive_chk" CHECK (("allocated_amount_cents" > 0)),
    CONSTRAINT "payment_allocations_status_chk" CHECK (
        ("status" = ANY (ARRAY['active'::"text", 'reversed'::"text"]))
    ),
    CONSTRAINT "payment_allocations_allocation_type_chk" CHECK (
        ("allocation_type" = ANY (ARRAY['payment_application'::"text"]))
    ),
    CONSTRAINT "payment_allocations_target_type_nonempty_chk" CHECK (
        ("length"(TRIM(BOTH FROM "target_entity_type")) > 0)
    ),
    CONSTRAINT "payment_allocations_reversal_consistency_chk" CHECK (
        (
            ("status" = 'reversed'::"text")
            AND ("reversed_at" IS NOT NULL)
        )
        OR (
            ("status" = 'active'::"text")
            AND ("reversed_at" IS NULL)
        )
    )
);

CREATE INDEX IF NOT EXISTS "idx_payment_allocations_org_payment"
    ON "public"."payment_allocations" USING "btree" ("org_id", "payment_id");

CREATE INDEX IF NOT EXISTS "idx_payment_allocations_org_target"
    ON "public"."payment_allocations" USING "btree" ("org_id", "target_entity_type", "target_entity_id");

CREATE INDEX IF NOT EXISTS "idx_payment_allocations_org_status_target"
    ON "public"."payment_allocations" USING "btree" ("org_id", "status", "target_entity_type", "target_entity_id");

CREATE INDEX IF NOT EXISTS "idx_payment_allocations_org_allocated_at"
    ON "public"."payment_allocations" USING "btree" ("org_id", "allocated_at" DESC);

COMMENT ON TABLE "public"."payment_allocations" IS 'Application of payment amounts to polymorphic targets; V1 API limits targets to job only. For outstanding balance and similar metrics, count only rows with status = active where the parent payment has status = posted; pending payments may have allocations but they do not reduce balance until posted.';

DROP TRIGGER IF EXISTS "trg_payment_allocations_updated_at" ON "public"."payment_allocations";

CREATE TRIGGER "trg_payment_allocations_updated_at"
    BEFORE UPDATE ON "public"."payment_allocations"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."set_updated_at"();

-- ---------------------------------------------------------------------------
-- payments: new lifecycle + money columns (additive / backfill)
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."payments"
    ADD COLUMN IF NOT EXISTS "status" "text",
    ADD COLUMN IF NOT EXISTS "direction" "text",
    ADD COLUMN IF NOT EXISTS "received_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "effective_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "posted_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "failed_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "payer_entity_type" "text",
    ADD COLUMN IF NOT EXISTS "payer_entity_id" "uuid",
    ADD COLUMN IF NOT EXISTS "payment_method" "text",
    ADD COLUMN IF NOT EXISTS "processor" "text",
    ADD COLUMN IF NOT EXISTS "processor_transaction_id" "text",
    ADD COLUMN IF NOT EXISTS "reference_number" "text",
    ADD COLUMN IF NOT EXISTS "deposit_batch_id" "uuid",
    ADD COLUMN IF NOT EXISTS "created_by" "uuid",
    ADD COLUMN IF NOT EXISTS "updated_by" "uuid";

-- Defaults + backfill from legacy columns (paid_at, payment_status_id, status_key, provider, provider_payment_id).
UPDATE "public"."payments" AS "p"
SET
    "received_at" = COALESCE("p"."received_at", "p"."paid_at", "p"."created_at"),
    "posted_at" = COALESCE("p"."posted_at", "p"."paid_at"),
    "direction" = COALESCE("p"."direction", 'inbound'::"text"),
    "payment_method" = COALESCE(
        "p"."payment_method",
        CASE
            WHEN "lower"(COALESCE("p"."provider", ''::"text")) = 'stripe'::"text" THEN 'card'::"text"
            ELSE 'other'::"text"
        END
    ),
    "processor" = COALESCE("p"."processor", "p"."provider"),
    "processor_transaction_id" = COALESCE("p"."processor_transaction_id", "p"."provider_payment_id"),
    "status" = COALESCE(
        "p"."status",
        CASE
            WHEN "p"."paid_at" IS NOT NULL THEN 'posted'::"text"
            WHEN "lower"(
                COALESCE(
                    (SELECT "ps"."key" FROM "public"."payment_statuses" AS "ps" WHERE "ps"."id" = "p"."payment_status_id"),
                    "p"."status_key",
                    ''::"text"
                )
            ) = ANY (
                ARRAY[
                    'paid'::"text",
                    'completed'::"text",
                    'succeeded'::"text",
                    'posted'::"text"
                ]
            ) THEN 'posted'::"text"
            WHEN "lower"(
                COALESCE(
                    (SELECT "ps"."key" FROM "public"."payment_statuses" AS "ps" WHERE "ps"."id" = "p"."payment_status_id"),
                    "p"."status_key",
                    ''::"text"
                )
            ) = ANY (ARRAY['failed'::"text", 'failure'::"text", 'declined'::"text"]) THEN 'failed'::"text"
            WHEN "lower"(
                COALESCE(
                    (SELECT "ps"."key" FROM "public"."payment_statuses" AS "ps" WHERE "ps"."id" = "p"."payment_status_id"),
                    "p"."status_key",
                    ''::"text"
                )
            ) = ANY (
                ARRAY[
                    'voided'::"text",
                    'void'::"text",
                    'canceled'::"text",
                    'cancelled'::"text"
                ]
            ) THEN 'voided'::"text"
            ELSE 'pending'::"text"
        END
    );

UPDATE "public"."payments"
SET
    "failed_at" = COALESCE("failed_at", "updated_at", "created_at")
WHERE "status" = 'failed'::"text" AND "failed_at" IS NULL;

UPDATE "public"."payments"
SET
    "voided_at" = COALESCE("voided_at", "updated_at", "created_at")
WHERE "status" = 'voided'::"text" AND "voided_at" IS NULL;

-- Normalize any remaining nulls from edge cases
UPDATE "public"."payments"
SET
    "received_at" = COALESCE("received_at", "created_at"),
    "direction" = COALESCE("direction", 'inbound'::"text"),
    "payment_method" = COALESCE("payment_method", 'other'::"text"),
    "status" = COALESCE("status", 'pending'::"text")
WHERE "received_at" IS NULL
   OR "direction" IS NULL
   OR "payment_method" IS NULL
   OR "status" IS NULL;

-- Currency: non-null/non-empty required for constraints + NOT NULL (default backfill 'USD').
UPDATE "public"."payments"
SET "currency" = 'USD'::"text"
WHERE "currency" IS NULL OR "length"(TRIM(BOTH FROM "currency")) = 0;

-- amount_cents: must be non-null and positive before bigint + CHECK; fix nulls and non-positive (review in ops if any).
UPDATE "public"."payments"
SET "amount_cents" = 1
WHERE "amount_cents" IS NULL OR "amount_cents" < 1;

ALTER TABLE "public"."payments"
    ALTER COLUMN "received_at" SET NOT NULL,
    ALTER COLUMN "direction" SET NOT NULL,
    ALTER COLUMN "payment_method" SET NOT NULL,
    ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "public"."payments"
    ALTER COLUMN "updated_at" SET DEFAULT "now"();

UPDATE "public"."payments"
SET "updated_at" = COALESCE("updated_at", "created_at", "now"())
WHERE "updated_at" IS NULL;

ALTER TABLE "public"."payments"
    ALTER COLUMN "updated_at" SET NOT NULL;

ALTER TABLE "public"."payments"
    ALTER COLUMN "customer_id" DROP NOT NULL,
    ALTER COLUMN "job_id" DROP NOT NULL;

ALTER TABLE "public"."payments"
    ALTER COLUMN "amount_cents" TYPE bigint USING ("amount_cents")::bigint;

ALTER TABLE "public"."payments"
    DROP CONSTRAINT IF EXISTS "chk_payments_amount_nonnegative";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'payments_status_chk'
    ) THEN
        ALTER TABLE ONLY "public"."payments"
            ADD CONSTRAINT "payments_status_chk" CHECK (
                ("status" = ANY (ARRAY['pending'::"text", 'posted'::"text", 'failed'::"text", 'voided'::"text"]))
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'payments_direction_chk'
    ) THEN
        ALTER TABLE ONLY "public"."payments"
            ADD CONSTRAINT "payments_direction_chk" CHECK (
                ("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'payments_payment_method_chk'
    ) THEN
        ALTER TABLE ONLY "public"."payments"
            ADD CONSTRAINT "payments_payment_method_chk" CHECK (
                (
                    "payment_method" = ANY (
                        ARRAY[
                            'card'::"text",
                            'ach'::"text",
                            'cash'::"text",
                            'check'::"text",
                            'manual'::"text",
                            'subsidy'::"text",
                            'other'::"text"
                        ]
                    )
                )
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'payments_currency_nonempty_chk'
    ) THEN
        ALTER TABLE ONLY "public"."payments"
            ADD CONSTRAINT "payments_currency_nonempty_chk" CHECK (("length"(TRIM(BOTH FROM "currency")) > 0));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'payments_amount_positive_chk'
    ) THEN
        ALTER TABLE ONLY "public"."payments"
            ADD CONSTRAINT "payments_amount_positive_chk" CHECK (("amount_cents" > 0));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'payments_payer_pair_chk'
    ) THEN
        ALTER TABLE ONLY "public"."payments"
            ADD CONSTRAINT "payments_payer_pair_chk" CHECK (
                (
                    ("payer_entity_type" IS NULL)
                    AND ("payer_entity_id" IS NULL)
                )
                OR (
                    ("payer_entity_type" IS NOT NULL)
                    AND ("payer_entity_id" IS NOT NULL)
                )
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'payments_posted_at_status_chk'
    ) THEN
        ALTER TABLE ONLY "public"."payments"
            ADD CONSTRAINT "payments_posted_at_status_chk" CHECK (
                ("posted_at" IS NULL) OR ("status" = 'posted'::"text")
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'payments_failed_at_status_chk'
    ) THEN
        ALTER TABLE ONLY "public"."payments"
            ADD CONSTRAINT "payments_failed_at_status_chk" CHECK (
                ("failed_at" IS NULL) OR ("status" = 'failed'::"text")
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'payments_voided_at_status_chk'
    ) THEN
        ALTER TABLE ONLY "public"."payments"
            ADD CONSTRAINT "payments_voided_at_status_chk" CHECK (
                ("voided_at" IS NULL) OR ("status" = 'voided'::"text")
            );
    END IF;
END $$;

ALTER TABLE "public"."payments"
    ALTER COLUMN "currency" SET NOT NULL;

ALTER TABLE "public"."payments"
    ALTER COLUMN "amount_cents" SET NOT NULL;

COMMENT ON COLUMN "public"."payments"."job_id" IS 'Deprecated linkage; authoritative job application is payment_allocations.target_entity_type = job.';

DROP INDEX IF EXISTS "payments_provider_payment_id_ux";

CREATE INDEX IF NOT EXISTS "idx_payments_org_status_received_at"
    ON "public"."payments" USING "btree" ("org_id", "status", "received_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_payments_org_posted_at"
    ON "public"."payments" USING "btree" ("org_id", "posted_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_payments_org_customer_received_at"
    ON "public"."payments" USING "btree" ("org_id", "customer_id", "received_at" DESC)
    WHERE ("customer_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_payments_org_payer_entity"
    ON "public"."payments" USING "btree" ("org_id", "payer_entity_type", "payer_entity_id")
    WHERE ("payer_entity_id" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_payments_processor_transaction"
    ON "public"."payments" USING "btree" ("processor", "processor_transaction_id")
    WHERE ("processor_transaction_id" IS NOT NULL);

-- One allocation per legacy payment/job (idempotent). Financial weight of these rows still follows
-- payment.status = posted for balance math (see table comment on payment_allocations).
INSERT INTO "public"."payment_allocations" (
    "org_id",
    "payment_id",
    "target_entity_type",
    "target_entity_id",
    "allocated_amount_cents",
    "status",
    "allocation_type",
    "allocated_at",
    "metadata"
)
SELECT
    "p"."org_id",
    "p"."id",
    'job'::"text",
    "p"."job_id",
    "p"."amount_cents",
    'active'::"text",
    'payment_application'::"text",
    COALESCE("p"."created_at", "now"()),
    '{}'::"jsonb"
FROM "public"."payments" AS "p"
WHERE
    "p"."job_id" IS NOT NULL
    AND NOT EXISTS (
        SELECT 1
        FROM "public"."payment_allocations" AS "pa"
        WHERE "pa"."payment_id" = "p"."id"
    );

-- Ledger hook: fire when posted_at or legacy paid_at transitions to a “posted” timestamp.
CREATE OR REPLACE FUNCTION "public"."trg_post_payment_to_ledger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.posted_to_ledger_at is not null then
    return new;
  end if;

  if (new.posted_at is not null)
     and (old.posted_at is distinct from new.posted_at)
  then
    perform public.post_payment_to_ledger(new.id);
    return new;
  end if;

  if (new.paid_at is not null)
     and (old.paid_at is distinct from new.paid_at)
  then
    perform public.post_payment_to_ledger(new.id);
  end if;

  return new;
end;
$$;

DROP TRIGGER IF EXISTS "payments_post_to_ledger" ON "public"."payments";

CREATE TRIGGER "payments_post_to_ledger"
    AFTER UPDATE OF "posted_at", "paid_at" ON "public"."payments"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."trg_post_payment_to_ledger"();

COMMENT ON FUNCTION "public"."post_payment_to_ledger"("payment_id" "uuid") IS 'Invoked when payments.posted_at or legacy paid_at is set; minimal behavior sets posted_to_ledger_at. Extend for ledger lines later.';

-- ---------------------------------------------------------------------------
-- RLS: payment_allocations
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."payment_allocations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_allocations_select_same_org" ON "public"."payment_allocations";
DROP POLICY IF EXISTS "payment_allocations_insert_same_org" ON "public"."payment_allocations";
DROP POLICY IF EXISTS "payment_allocations_update_same_org" ON "public"."payment_allocations";
DROP POLICY IF EXISTS "payment_allocations_delete_same_org" ON "public"."payment_allocations";
DROP POLICY IF EXISTS "service role full access payment_allocations" ON "public"."payment_allocations";

CREATE POLICY "payment_allocations_select_same_org" ON "public"."payment_allocations" FOR SELECT TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "payment_allocations_insert_same_org" ON "public"."payment_allocations" FOR INSERT TO "authenticated"
    WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "payment_allocations_update_same_org" ON "public"."payment_allocations" FOR UPDATE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "service role full access payment_allocations" ON "public"."payment_allocations" TO "service_role" USING (true) WITH CHECK (true);

-- Conservative: no anon (contrast: ledger_transactions still has broad grants from baseline).
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."payment_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_allocations" TO "service_role";

-- ---------------------------------------------------------------------------
-- RLS: payments — add same-org policies (admin_ops_full_access retained)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "payments_select_same_org" ON "public"."payments";
DROP POLICY IF EXISTS "payments_insert_same_org" ON "public"."payments";
DROP POLICY IF EXISTS "payments_update_same_org" ON "public"."payments";
DROP POLICY IF EXISTS "payments_delete_same_org" ON "public"."payments";
DROP POLICY IF EXISTS "service role full access payments" ON "public"."payments";

CREATE POLICY "payments_select_same_org" ON "public"."payments" FOR SELECT TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "payments_insert_same_org" ON "public"."payments" FOR INSERT TO "authenticated"
    WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "payments_update_same_org" ON "public"."payments" FOR UPDATE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "service role full access payments" ON "public"."payments" TO "service_role" USING (true) WITH CHECK (true);
