-- =============================================================================
-- Global default for needs_a_quote (opportunities): org_id NULL, industry_key NULL
-- =============================================================================
-- Idempotent. Corrects wrongly industry-scoped global rows (e.g. home_services)
-- and inserts the canonical global default when missing. Does not delete rows or
-- touch org-specific definitions.
--
-- Unique scope: (coalesce(org_id), coalesce(industry_key,''), entity_type, status_key)
-- Only one global row (org_id NULL, industry empty) may exist for this status_key.
--
-- UPDATE filters to COALESCE(industry_key,'') <> '' so we do not touch rows that are
-- already generic; avoids turning two globals (one legacy industry + one null) into
-- duplicate (NULL,NULL) rows in one statement.
-- =============================================================================

-- 1) Force correct global state: clear industry on any incorrectly scoped *global* row.
UPDATE public.status_definitions
SET industry_key = NULL
WHERE entity_type = 'opportunities'
  AND status_key = 'needs_a_quote'
  AND org_id IS NULL
  AND COALESCE(industry_key, '') <> '';

-- 2) Ensure the row exists (idempotent insert; no duplicate globals).
INSERT INTO public.status_definitions (
    id,
    org_id,
    industry_key,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    metadata,
    created_at
)
SELECT
    gen_random_uuid(),
    NULL::uuid,
    NULL::text,
    'opportunities',
    'needs_a_quote',
    'Needs a Quote',
    15,
    true,
    true,
    '{}'::jsonb,
    now()
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.entity_type = 'opportunities'
      AND sd.status_key = 'needs_a_quote'
      AND sd.org_id IS NULL
      AND COALESCE(sd.industry_key, '') = ''
);
