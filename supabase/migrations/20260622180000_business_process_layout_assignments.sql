-- =============================================================================
-- Business Process Layout Assignments — presentation routing layer
-- =============================================================================
-- Maps (org, business_process, stage/status, surface) → entity_layouts row.
-- Does not store LayoutDoc content; assignments reference published layouts only.
-- Resolution falls back to surface defaults when no assignment matches.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."business_process_layout_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "business_process_key" "text" NOT NULL,
    "stage_key" "text",
    "status_key" "text",
    "surface_key" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "surface" "text" NOT NULL,
    "layout_key" "text" NOT NULL,
    "entity_layout_id" "uuid",
    "priority" integer NOT NULL DEFAULT 0,
    "is_active" boolean NOT NULL DEFAULT true,
    "version" integer NOT NULL DEFAULT 1,
    "metadata" "jsonb" NOT NULL DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "business_process_layout_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_process_layout_assignments_org_id_fkey"
        FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE,
    CONSTRAINT "business_process_layout_assignments_entity_layout_id_fkey"
        FOREIGN KEY ("entity_layout_id") REFERENCES "public"."entity_layouts"("id") ON DELETE SET NULL,
    CONSTRAINT "business_process_layout_assignments_surface_check"
        CHECK ("surface" = ANY (ARRAY['drawer'::"text", 'queue'::"text"])),
    CONSTRAINT "business_process_layout_assignments_version_check"
        CHECK ("version" >= 1)
);

CREATE INDEX IF NOT EXISTS "idx_bp_layout_assignments_org_process_surface"
    ON "public"."business_process_layout_assignments" ("org_id", "business_process_key", "surface_key", "is_active");

CREATE INDEX IF NOT EXISTS "idx_bp_layout_assignments_org_process_stage"
    ON "public"."business_process_layout_assignments" ("org_id", "business_process_key", "stage_key")
    WHERE "stage_key" IS NOT NULL;

COMMENT ON TABLE "public"."business_process_layout_assignments" IS
    'Routes layout resolution by business process + stage/status + surface. References entity_layouts; presentation-only.';

ALTER TABLE "public"."business_process_layout_assignments" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bp_layout_assignments_select_by_org_role" ON "public"."business_process_layout_assignments";
CREATE POLICY "bp_layout_assignments_select_by_org_role" ON "public"."business_process_layout_assignments"
    FOR SELECT TO "authenticated" USING ((EXISTS (
        SELECT 1 FROM "public"."user_roles" "ur"
        WHERE "ur"."user_id" = "auth"."uid"()
          AND "ur"."org_id" = "business_process_layout_assignments"."org_id"
          AND "ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"])
    )));

DROP POLICY IF EXISTS "bp_layout_assignments_mutate_by_org_admin" ON "public"."business_process_layout_assignments";
CREATE POLICY "bp_layout_assignments_mutate_by_org_admin" ON "public"."business_process_layout_assignments"
    FOR ALL TO "authenticated" USING ((EXISTS (
        SELECT 1 FROM "public"."user_roles" "ur"
        WHERE "ur"."user_id" = "auth"."uid"()
          AND "ur"."org_id" = "business_process_layout_assignments"."org_id"
          AND "ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])
    ))) WITH CHECK ((EXISTS (
        SELECT 1 FROM "public"."user_roles" "ur"
        WHERE "ur"."user_id" = "auth"."uid"()
          AND "ur"."org_id" = "business_process_layout_assignments"."org_id"
          AND "ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])
    )));

GRANT ALL ON TABLE "public"."business_process_layout_assignments" TO "service_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."business_process_layout_assignments" TO "authenticated";
