-- Hierarchy foundation: departments, work_units, jobs.work_unit_id (nullable).
-- See docs/HIERARCHY_SCHEMA_V1.md for rationale and follow-ups.
-- Non-destructive: additive tables/column only; no NOT NULL on jobs.work_unit_id.

-- ---------------------------------------------------------------------------
-- A. departments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "departments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT,
    CONSTRAINT "uq_departments_org_key" UNIQUE ("org_id", "key"),
    CONSTRAINT "departments_key_nonempty" CHECK (("btrim"("key") <> ''::"text")),
    CONSTRAINT "departments_name_nonempty" CHECK (("btrim"("name") <> ''::"text"))
);

ALTER TABLE "public"."departments" OWNER TO "postgres";

COMMENT ON TABLE "public"."departments" IS 'Tenant-scoped business function (Org → Department → Work unit → Record).';

CREATE INDEX IF NOT EXISTS "idx_departments_org_id" ON "public"."departments" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_departments_org_active_sort" ON "public"."departments" USING "btree" ("org_id", "is_active", "sort_order");

-- ---------------------------------------------------------------------------
-- B. work_units
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."work_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "queue_definition" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "work_units_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "work_units_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT,
    CONSTRAINT "work_units_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE,
    CONSTRAINT "uq_work_units_department_key" UNIQUE ("department_id", "key"),
    CONSTRAINT "work_units_key_nonempty" CHECK (("btrim"("key") <> ''::"text")),
    CONSTRAINT "work_units_name_nonempty" CHECK (("btrim"("name") <> ''::"text"))
);

ALTER TABLE "public"."work_units" OWNER TO "postgres";

COMMENT ON TABLE "public"."work_units" IS 'Operational queue/cohort within a department; optional JSON queue_definition for future filter DSL.';
COMMENT ON COLUMN "public"."work_units"."org_id" IS 'Denormalized from department.org_id for RLS and admin queries; must match parent department.org_id (enforced on write via RLS WITH CHECK).';
COMMENT ON COLUMN "public"."work_units"."queue_definition" IS 'Structured queue/filter config; semantics defined by app (v1: often {}).';

CREATE INDEX IF NOT EXISTS "idx_work_units_org_id" ON "public"."work_units" USING "btree" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_work_units_department_id" ON "public"."work_units" USING "btree" ("department_id");

CREATE INDEX IF NOT EXISTS "idx_work_units_org_department_active_sort" ON "public"."work_units" USING "btree" ("org_id", "department_id", "is_active", "sort_order");

-- ---------------------------------------------------------------------------
-- C. jobs.work_unit_id (nullable FK)
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."jobs"
    ADD COLUMN IF NOT EXISTS "work_unit_id" "uuid";

COMMENT ON COLUMN "public"."jobs"."work_unit_id" IS 'Optional work unit for routing/UI V2; null = unassigned to a work unit.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'jobs_work_unit_id_fkey'
    ) THEN
        ALTER TABLE ONLY "public"."jobs"
            ADD CONSTRAINT "jobs_work_unit_id_fkey"
            FOREIGN KEY ("work_unit_id") REFERENCES "public"."work_units"("id") ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_jobs_work_unit_id" ON "public"."jobs" USING "btree" ("work_unit_id") WHERE ("work_unit_id" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- RLS (aligned with org-scoped tables using current_org_id())
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."departments" FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."work_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."work_units" FORCE ROW LEVEL SECURITY;

CREATE POLICY "departments_select_same_org" ON "public"."departments" FOR SELECT TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "departments_insert_same_org" ON "public"."departments" FOR INSERT TO "authenticated"
    WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "departments_update_same_org" ON "public"."departments" FOR UPDATE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));

CREATE POLICY "departments_delete_same_org" ON "public"."departments" FOR DELETE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "service role full access departments" ON "public"."departments" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "work_units_select_same_org" ON "public"."work_units" FOR SELECT TO "authenticated"
    USING (
        ("org_id" = "public"."current_org_id"())
        AND (EXISTS (
            SELECT 1 FROM "public"."departments" "d"
            WHERE ("d"."id" = "work_units"."department_id") AND ("d"."org_id" = "work_units"."org_id")
        ))
    );

CREATE POLICY "work_units_insert_same_org" ON "public"."work_units" FOR INSERT TO "authenticated"
    WITH CHECK (
        ("org_id" = "public"."current_org_id"())
        AND (EXISTS (
            SELECT 1 FROM "public"."departments" "d"
            WHERE ("d"."id" = "work_units"."department_id") AND ("d"."org_id" = "org_id")
        ))
    );

CREATE POLICY "work_units_update_same_org" ON "public"."work_units" FOR UPDATE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()))
    WITH CHECK (
        ("org_id" = "public"."current_org_id"())
        AND (EXISTS (
            SELECT 1 FROM "public"."departments" "d"
            WHERE ("d"."id" = "work_units"."department_id") AND ("d"."org_id" = "org_id")
        ))
    );

CREATE POLICY "work_units_delete_same_org" ON "public"."work_units" FOR DELETE TO "authenticated"
    USING (("org_id" = "public"."current_org_id"()));

CREATE POLICY "service role full access work_units" ON "public"."work_units" TO "service_role" USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Grants (match pattern used for other org-scoped app tables)
-- ---------------------------------------------------------------------------
GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";

GRANT ALL ON TABLE "public"."work_units" TO "anon";
GRANT ALL ON TABLE "public"."work_units" TO "authenticated";
GRANT ALL ON TABLE "public"."work_units" TO "service_role";
