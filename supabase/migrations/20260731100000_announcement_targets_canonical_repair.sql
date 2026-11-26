-- Phase 0 / P0-4 — announcement_targets canonical shape repair.
--
-- PROBLEM (verified live against project ikaxilmwmrmbagoidedu, 2026-07-30):
--   Two migrations define public.announcement_targets with incompatible shapes:
--     * 20260619150000 (PKG-05):  target_spec jsonb NOT NULL, resolved_count
--     * 20260622123000 (B4):      target_type NOT NULL + CHECK, target_ref, rule
--   B4 uses CREATE TABLE IF NOT EXISTS, so on any database where PKG-05 ran
--   first the B4 definition is a silent NO-OP. Both versions are recorded in
--   supabase_migrations.schema_migrations, so the ledger reports success while
--   the schema is PKG-05's.
--
--   Live schema today is PKG-05's. The live API
--   (web/app/api/admin/communications/announcements/[id]/targets/route.ts:78-85)
--   inserts {target_type, target_ref, rule} — three columns that DO NOT EXIST.
--   The feature has never worked: announcement_targets has 0 rows.
--
--   Unlike the templates pair (repaired by 20260623130000), no repair migration
--   was ever written for announcement_targets.
--
-- CANONICAL SHAPE: B4. It is what the API writes and what
-- web/lib/communications/v2/announcementSchema.ts:26 declares.
--
-- PROPERTIES OF THIS MIGRATION:
--   * Idempotent      — safe to run repeatedly.
--   * Shape-agnostic  — correct against a PKG-05-first DB, a B4-first DB, and
--                       a fresh replay. It asserts nothing about which ran.
--   * Non-destructive — target_spec and resolved_count are RETAINED, not
--                       dropped. Any unmappable spec is preserved inside rule.
--
-- ADDITIVE ONLY. No table drops. DROP POLICY IF EXISTS is not used here.

-- 1) Canonical columns (no-ops where B4 already applied).
ALTER TABLE public.announcement_targets ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE public.announcement_targets ADD COLUMN IF NOT EXISTS target_ref  uuid;
ALTER TABLE public.announcement_targets ADD COLUMN IF NOT EXISTS rule        jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Backfill from the legacy target_spec, non-destructively.
--    Accepts both the documented key names and their short forms. Anything that
--    cannot be mapped becomes 'custom' with the ORIGINAL spec preserved in rule,
--    so no targeting intent is lost.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'announcement_targets'
          AND column_name  = 'target_spec'
    ) THEN
        UPDATE public.announcement_targets
        SET target_type = COALESCE(
                target_type,
                NULLIF(target_spec ->> 'target_type', ''),
                NULLIF(target_spec ->> 'type', ''),
                'custom'
            ),
            target_ref = COALESCE(
                target_ref,
                NULLIF(target_spec ->> 'target_ref', '')::uuid,
                NULLIF(target_spec ->> 'ref', '')::uuid
            ),
            rule = CASE
                WHEN rule IS NULL OR rule = '{}'::jsonb THEN COALESCE(target_spec, '{}'::jsonb)
                ELSE rule
            END
        WHERE target_type IS NULL;
    END IF;
END
$$;

-- 3) Any row still unmapped (no legacy column to read from) becomes 'custom'.
UPDATE public.announcement_targets SET target_type = 'custom' WHERE target_type IS NULL;

-- 4) Legacy target_spec must not block canonical inserts. Retained, relaxed.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'announcement_targets'
          AND column_name  = 'target_spec'
          AND is_nullable  = 'NO'
    ) THEN
        ALTER TABLE public.announcement_targets ALTER COLUMN target_spec DROP NOT NULL;
    END IF;
END
$$;

-- 5) Canonical constraints. Vocabulary mirrors ANNOUNCEMENT_TARGET_TYPES in
--    web/lib/communications/v2/announcementSchema.ts:26 (parity test guards drift).
ALTER TABLE public.announcement_targets ALTER COLUMN target_type SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.announcement_targets'::regclass
          AND conname  = 'announcement_targets_target_type_chk'
    ) THEN
        ALTER TABLE public.announcement_targets
            ADD CONSTRAINT announcement_targets_target_type_chk
            CHECK (target_type IN (
                'all_families', 'active_families', 'waitlist',
                'program', 'room', 'location', 'custom'
            ));
    END IF;
END
$$;

-- 6) Index parity with the B4 definition.
CREATE INDEX IF NOT EXISTS idx_announcement_targets_org_announcement
    ON public.announcement_targets (org_id, announcement_id);

COMMENT ON COLUMN public.announcement_targets.target_type IS
    'Canonical (B4) segment kind. Mirrors ANNOUNCEMENT_TARGET_TYPES in web/lib/communications/v2/announcementSchema.ts.';
COMMENT ON COLUMN public.announcement_targets.target_spec IS
    'LEGACY (PKG-05). Retained for history; nullable. Canonical targeting is target_type/target_ref/rule.';
