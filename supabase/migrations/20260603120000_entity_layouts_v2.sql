-- =============================================================================
-- Layout Configuration V2 — entity_layouts (foundation)
-- =============================================================================
-- Database-backed, versioned, presentation-only layout documents. One row per
-- (org_id, entity_type, surface, layout_key, version). `doc` holds a validated
-- Layout V2 JSON document (Layout → Section → Row → Column → Item).
--
-- This is a FOUNDATION migration. NOTHING in the live runtime reads this table
-- yet: production drawers/queues continue to render from web/lib/entityPresentation.ts
-- ("Layer 0"). Resolution order at adoption time will be:
--     org published  →  default published (org_id NULL)  →  entityPresentation.ts
--
-- Scope (Sprint 1): surface ∈ {drawer, queue} only. Workspace/dashboard/record
-- surfaces are future phases and are rejected by the CHECK constraint below.
--
-- Presentation only: this table stores no lifecycle, status, workflow, action,
-- permission, color, theme, or CSS data. Lifecycle references layouts; layouts
-- do not own lifecycle.
--
-- Prerequisites: public.orgs (baseline).
--
-- Idempotency:
--   • CREATE TABLE/INDEX IF NOT EXISTS
--   • RLS policies: DROP IF EXISTS then CREATE (safe to re-run in dev)
--
-- Verification (run after migrate):
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'entity_layouts'
--   ORDER BY ordinal_position;
--
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.entity_layouts'::regclass;
--
--   SELECT policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'entity_layouts';
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."entity_layouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    -- NULL org_id ⇒ system/industry default layout (shared fallback).
    "org_id" "uuid",
    "industry_key" "text",
    "entity_type" "text" NOT NULL,
    "surface" "text" NOT NULL,
    "layout_key" "text" NOT NULL DEFAULT 'default',
    "name" "text" NOT NULL DEFAULT 'Untitled layout',
    "version" integer NOT NULL DEFAULT 1,
    "status" "text" NOT NULL DEFAULT 'draft',
    "is_system_default" boolean NOT NULL DEFAULT false,
    -- Validated Layout V2 document (see web/lib/layout/layoutV2Schema.ts).
    "doc" "jsonb" NOT NULL DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" NOT NULL DEFAULT '{}'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    CONSTRAINT "entity_layouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entity_layouts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE,
    CONSTRAINT "entity_layouts_surface_check" CHECK ("surface" = ANY (ARRAY['drawer'::"text", 'queue'::"text"])),
    CONSTRAINT "entity_layouts_status_check" CHECK ("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])),
    CONSTRAINT "entity_layouts_version_check" CHECK ("version" >= 1),
    -- Org-scoped uniqueness on a version. (Default rows, org_id NULL, are
    -- de-duplicated by the partial unique index below since SQL treats NULLs as
    -- distinct in multi-column UNIQUE constraints.)
    CONSTRAINT "entity_layouts_org_entity_surface_key_version"
        UNIQUE ("org_id", "entity_type", "surface", "layout_key", "version")
);

-- De-dupe default (org_id NULL) rows, which the table-level UNIQUE cannot cover.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_entity_layouts_default_version"
    ON "public"."entity_layouts" ("entity_type", "surface", "layout_key", "version")
    WHERE "org_id" IS NULL;

-- Primary resolver read path: org + entity + surface + status.
CREATE INDEX IF NOT EXISTS "idx_entity_layouts_org_entity_surface_status"
    ON "public"."entity_layouts" USING "btree" ("org_id", "entity_type", "surface", "status");

-- Default/fallback read path (org_id NULL).
CREATE INDEX IF NOT EXISTS "idx_entity_layouts_default_entity_surface"
    ON "public"."entity_layouts" USING "btree" ("entity_type", "surface", "status")
    WHERE "org_id" IS NULL;

COMMENT ON TABLE "public"."entity_layouts" IS
    'Layout Configuration V2: versioned, presentation-only layout documents per (org_id, entity_type, surface). org_id NULL = system/industry default. Not yet read by the live runtime (foundation).';
COMMENT ON COLUMN "public"."entity_layouts"."doc" IS
    'Validated Layout V2 JSON (Layout→Section→Row→Column→Item). Presentation only; no lifecycle/permissions/styling.';
COMMENT ON COLUMN "public"."entity_layouts"."surface" IS 'drawer | queue (Sprint 1 scope).';
COMMENT ON COLUMN "public"."entity_layouts"."status" IS 'draft | published. Resolver picks the highest published version.';

-- -----------------------------------------------------------------------------
-- RLS — org-scoped, mirrors field_section_definitions. The app reads/writes via
-- the service role (createAdminClient) which bypasses RLS; these policies are a
-- backstop for any authenticated direct access. Default (org_id NULL) rows are
-- managed by the service role only.
-- -----------------------------------------------------------------------------
ALTER TABLE "public"."entity_layouts" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_layouts_select_by_org_role" ON "public"."entity_layouts";
CREATE POLICY "entity_layouts_select_by_org_role" ON "public"."entity_layouts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "entity_layouts"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]))))));

DROP POLICY IF EXISTS "entity_layouts_insert_by_org_role" ON "public"."entity_layouts";
CREATE POLICY "entity_layouts_insert_by_org_role" ON "public"."entity_layouts" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "entity_layouts"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "entity_layouts_update_by_org_role" ON "public"."entity_layouts";
CREATE POLICY "entity_layouts_update_by_org_role" ON "public"."entity_layouts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "entity_layouts"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "entity_layouts"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "entity_layouts_delete_by_org_role" ON "public"."entity_layouts";
CREATE POLICY "entity_layouts_delete_by_org_role" ON "public"."entity_layouts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "entity_layouts"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

GRANT ALL ON TABLE "public"."entity_layouts" TO "service_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."entity_layouts" TO "authenticated";
