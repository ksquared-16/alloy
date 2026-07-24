-- Idempotent Organization Programs identity reconcile from Location Program Categories.
-- Safe re-run: ON CONFLICT DO NOTHING. Does not publish. Does not flip LPC is_active.
-- Executable TypeScript twin: web/lib/programs/publication/reconcileOrganizationProgramsFromLpc.ts
-- CLI: cd web && DRY_RUN=1 npm run dev:backfill:organization-programs-from-lpc
--
-- DEPENDENCY / ORDER NOTE (clean-apply safety):
-- This backfill reads/writes public.programs + public.program_drafts, which are created in the
-- LATER-timestamped migration 20260722020000_configuration_publication_runtime_v1.sql. On a clean
-- apply (`supabase db reset`) this migration therefore runs BEFORE those tables exist. That is a
-- supported timeline state: a freshly-migrated database has no tenant LPC data to reconcile yet,
-- so there is nothing to backfill here. The guard below skips precisely when the target tables are
-- absent and runs the full reconcile when they exist (existing databases, or any environment that
-- already carries LPC data). An already-applied instance on an existing database is not re-run by
-- `supabase db push`, so editing this file's body does not disturb migration history.
-- Do NOT create the programs schema here — its owner is 20260722020000; duplicating it would drift.
DO $$
BEGIN
    IF to_regclass('public.programs') IS NULL
       OR to_regclass('public.program_drafts') IS NULL
       OR to_regclass('public.location_program_categories') IS NULL THEN
        RAISE NOTICE 'programs identity reconcile skipped: dependent tables not present yet (clean-apply ordering — nothing to reconcile).';
        RETURN;
    END IF;

    INSERT INTO public.programs (org_id, program_key, created_at)
    SELECT DISTINCT lpc.org_id, btrim(lpc.key), min(lpc.created_at)
    FROM public.location_program_categories lpc
    WHERE char_length(btrim(lpc.key)) BETWEEN 2 AND 64
    GROUP BY lpc.org_id, btrim(lpc.key)
    ON CONFLICT (org_id, program_key) DO NOTHING;

    INSERT INTO public.program_drafts (
        org_id,
        program_id,
        label,
        description,
        category,
        audience,
        required_resource_type,
        qualification_requirements,
        created_at,
        updated_at
    )
    SELECT
        p.org_id,
        p.id,
        coalesce(
            (
                SELECT nullif(btrim(lpc.label), '')
                FROM public.location_program_categories lpc
                WHERE lpc.org_id = p.org_id AND btrim(lpc.key) = p.program_key
                ORDER BY lpc.created_at, lpc.id
                LIMIT 1
            ),
            p.program_key
        ),
        null,
        null,
        '{}'::jsonb,
        null,
        '[]'::jsonb,
        p.created_at,
        now()
    FROM public.programs p
    ON CONFLICT (org_id, program_id) DO NOTHING;

    UPDATE public.location_program_categories lpc
    SET program_id = p.id
    FROM public.programs p
    WHERE lpc.program_id IS NULL
      AND p.org_id = lpc.org_id
      AND p.program_key = btrim(lpc.key);
END $$;
