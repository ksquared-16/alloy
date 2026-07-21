-- Idempotent Organization Programs identity reconcile from Location Program Categories.
-- Safe re-run: ON CONFLICT DO NOTHING. Does not publish. Does not flip LPC is_active.
-- Executable TypeScript twin: web/lib/programs/publication/reconcileOrganizationProgramsFromLpc.ts
-- CLI: cd web && DRY_RUN=1 npm run dev:backfill:organization-programs-from-lpc

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
