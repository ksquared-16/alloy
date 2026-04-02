-- =============================================================================
-- Batch 3.9 — Field section definitions + public booking visibility (schema)
-- =============================================================================
-- Creates org-scoped section metadata for field_definitions.section_key and adds
-- field_definitions.is_visible_in_public_booking for public API gating.
--
-- Prerequisites: public.orgs, public.field_definitions (from baseline).
--
-- Idempotency:
--   • CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS
--   • RLS policies: DROP IF EXISTS then CREATE (safe to re-run in dev)
--
-- Verification (run after migrate):
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'field_definitions'
--     AND column_name = 'is_visible_in_public_booking';
--
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.field_section_definitions'::regclass;
--
--   SELECT policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'field_section_definitions';
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."field_section_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "section_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "field_section_definitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "field_section_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE,
    CONSTRAINT "field_section_definitions_org_entity_section_key" UNIQUE ("org_id", "entity_type", "section_key")
);

CREATE INDEX IF NOT EXISTS "idx_field_section_definitions_org_entity"
    ON "public"."field_section_definitions" USING "btree" ("org_id", "entity_type", "sort_order");

ALTER TABLE "public"."field_definitions"
    ADD COLUMN IF NOT EXISTS "is_visible_in_public_booking" boolean DEFAULT false NOT NULL;

COMMENT ON TABLE "public"."field_section_definitions" IS 'Display metadata for field_definitions.section_key (admin, public, reporting).';
COMMENT ON COLUMN "public"."field_definitions"."is_visible_in_public_booking" IS 'When true, field may be exposed on public booking/site APIs for this org.';

ALTER TABLE "public"."field_section_definitions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "field_section_definitions_delete_by_org_role" ON "public"."field_section_definitions";
CREATE POLICY "field_section_definitions_delete_by_org_role" ON "public"."field_section_definitions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_section_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));

DROP POLICY IF EXISTS "field_section_definitions_insert_by_org_role" ON "public"."field_section_definitions";
CREATE POLICY "field_section_definitions_insert_by_org_role" ON "public"."field_section_definitions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_section_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));

DROP POLICY IF EXISTS "field_section_definitions_select_by_org_role" ON "public"."field_section_definitions";
CREATE POLICY "field_section_definitions_select_by_org_role" ON "public"."field_section_definitions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_section_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]))))));

DROP POLICY IF EXISTS "field_section_definitions_update_by_org_role" ON "public"."field_section_definitions";
CREATE POLICY "field_section_definitions_update_by_org_role" ON "public"."field_section_definitions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_section_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_section_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));

GRANT ALL ON TABLE "public"."field_section_definitions" TO "service_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."field_section_definitions" TO "authenticated";
