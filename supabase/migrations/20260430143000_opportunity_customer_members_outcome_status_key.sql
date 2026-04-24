-- =============================================================================
-- Childcare MVP — Inquiry child disposition (configurable)
-- =============================================================================
-- Product principle:
-- - Opportunity status_key = overall inquiry lifecycle (existing).
-- - Child-level inquiry outcome/disposition must be configurable per org (NOT hardcoded).
--
-- Approach (minimum aligned):
-- - Store `outcome_status_key` on opportunity_customer_members (nullable).
-- - Resolve labels from existing org-scoped `status_definitions` by entity_type:
--     entity_type = 'opportunity_customer_members'
-- - Seed a small default set for childcare orgs (editable in Admin Settings → Statuses).
-- - Do NOT enforce allowed keys via CHECK/enum; do NOT mirror full opportunity statuses.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Table change: add outcome_status_key
-- -----------------------------------------------------------------------------
ALTER TABLE public.opportunity_customer_members
ADD COLUMN IF NOT EXISTS outcome_status_key text;

-- Optional index for filtering by outcome (future; safe to add now)
CREATE INDEX IF NOT EXISTS idx_opportunity_customer_members_org_outcome_status
  ON public.opportunity_customer_members (org_id, outcome_status_key);

-- -----------------------------------------------------------------------------
-- 2) Seed default outcome statuses for childcare orgs (org-scoped; editable)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _childcare_mvp_seed_target_orgs (org_id uuid PRIMARY KEY);

INSERT INTO _childcare_mvp_seed_target_orgs (org_id)
SELECT o.id
FROM public.orgs o
WHERE o.industry_id IN (
    SELECT i.id
    FROM public.industries i
    WHERE i.key = 'childcare'
      AND COALESCE(i.is_active, true) = true
)
ON CONFLICT DO NOTHING;

-- Seed only when missing; never overwrites org customizations.
INSERT INTO public.status_definitions (
    org_id,
    entity_type,
    status_key,
    status_label,
    sort_order,
    is_active,
    is_system,
    metadata,
    industry_key,
    is_default
)
SELECT
    t.org_id,
    'opportunity_customer_members'::text,
    v.status_key,
    v.status_label,
    v.sort_order,
    true,
    false,
    jsonb_build_object('seed_source', 'migration_20260430143000_opportunity_customer_members_outcome_status_key'),
    NULL::text,
    false
FROM _childcare_mvp_seed_target_orgs t
CROSS JOIN (
    VALUES
        ('interested'::text, 'Interested'::text, 10::int),
        ('waitlisted', 'Waitlisted', 20),
        ('enrolling', 'Enrolling', 30),
        ('enrolled', 'Enrolled', 40),
        ('not_enrolling', 'Not enrolling', 50),
        ('deferred', 'Deferred', 60)
) AS v (status_key, status_label, sort_order)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions sd
    WHERE sd.org_id = t.org_id
      AND sd.entity_type = 'opportunity_customer_members'
      AND sd.status_key = v.status_key
);

-- -----------------------------------------------------------------------------
-- Verification queries (run manually)
-- -----------------------------------------------------------------------------
-- A) Column exists
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='opportunity_customer_members'
--   ORDER BY ordinal_position;
--
-- B) Seeded statuses exist for childcare org(s)
--   SELECT org_id, entity_type, status_key, status_label, sort_order, is_active
--   FROM public.status_definitions
--   WHERE entity_type='opportunity_customer_members'
--   ORDER BY org_id, sort_order;

