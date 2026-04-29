-- =============================================================================
-- Opportunity-stage family & contacts (no contacts model, no customer_id on link)
-- - Table: opportunity_persons
-- - Action: add_family_member (open_form) + placement on family_contacts / secondary
-- - Deactivate add_related_person placements on customer_booking (avoid duplicate CTAs)
-- - Childcare drawer layout: family_contacts section (empty fields + custom renderer)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) opportunity_persons
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.opportunity_persons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    opportunity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
    person_id uuid NOT NULL REFERENCES public.persons (id) ON DELETE CASCADE,
    role_type text NOT NULL DEFAULT 'family_member',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_opportunity_persons_opp_person'
          AND conrelid = 'public.opportunity_persons'::regclass
    ) THEN
        ALTER TABLE public.opportunity_persons
            ADD CONSTRAINT uq_opportunity_persons_opp_person UNIQUE (opportunity_id, person_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunity_persons_org_opportunity
    ON public.opportunity_persons (org_id, opportunity_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_persons_org_person
    ON public.opportunity_persons (org_id, person_id);

CREATE OR REPLACE FUNCTION public.validate_opportunity_persons_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    opp_org uuid;
    person_org uuid;
BEGIN
    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.opportunity_id;
    IF opp_org IS NULL THEN
        RAISE EXCEPTION 'opportunity_persons: opportunity_id % not found', NEW.opportunity_id;
    END IF;
    IF NEW.org_id IS DISTINCT FROM opp_org THEN
        RAISE EXCEPTION 'opportunity_persons: org_id mismatch (row %, opportunity %)', NEW.org_id, opp_org;
    END IF;

    SELECT p.org_id INTO person_org FROM public.persons p WHERE p.id = NEW.person_id;
    IF person_org IS NULL THEN
        RAISE EXCEPTION 'opportunity_persons: person_id % not found', NEW.person_id;
    END IF;
    IF NEW.org_id IS DISTINCT FROM person_org THEN
        RAISE EXCEPTION 'opportunity_persons: org_id mismatch (row %, person %)', NEW.org_id, person_org;
    END IF;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_validate_opportunity_persons_consistency ON public.opportunity_persons;
CREATE TRIGGER trg_validate_opportunity_persons_consistency
BEFORE INSERT OR UPDATE ON public.opportunity_persons
FOR EACH ROW EXECUTE FUNCTION public.validate_opportunity_persons_consistency();

DROP TRIGGER IF EXISTS trg_opportunity_persons_updated_at ON public.opportunity_persons;
CREATE TRIGGER trg_opportunity_persons_updated_at
BEFORE UPDATE ON public.opportunity_persons
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.opportunity_persons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_ops_full_access" ON public.opportunity_persons;
CREATE POLICY "admin_ops_full_access" ON public.opportunity_persons
USING (
    EXISTS (
        SELECT 1
        FROM public.app_users au
        WHERE au.id = auth.uid()
          AND au.role = ANY (ARRAY['admin'::text, 'ops'::text])
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.app_users au
        WHERE au.id = auth.uid()
          AND au.role = ANY (ARRAY['admin'::text, 'ops'::text])
    )
);

GRANT ALL ON TABLE public.opportunity_persons TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.opportunity_persons TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Action: add_family_member (global template)
-- ---------------------------------------------------------------------------

INSERT INTO public.action_definitions (
    org_id,
    key,
    label,
    description,
    entity_type,
    action_type,
    priority,
    payload_schema,
    is_active
)
SELECT
    NULL::uuid,
    'add_family_member'::text,
    'Add family member'::text,
    'Create or link a person on this opportunity (opportunity-scoped; no contacts record).'::text,
    'opportunity'::text,
    'open_form'::text,
    75,
    jsonb_build_object(
        'form_key', 'add_family_member',
        'required_fields', jsonb_build_array('first_name', 'last_name'),
        'optional_fields', jsonb_build_array('phone', 'email', 'role_type')
    ),
    true
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_definitions ad
    WHERE ad.org_id IS NULL
      AND ad.key = 'add_family_member'
);

INSERT INTO public.action_placements (
    org_id,
    action_definition_id,
    surface,
    slot,
    entity_type,
    department_id,
    work_unit_id,
    section_key,
    order_index,
    display_style,
    is_active
)
SELECT
    NULL::uuid,
    ad.id,
    'record_section'::text,
    'secondary'::text,
    'opportunity'::text,
    NULL::uuid,
    NULL::uuid,
    'family_contacts'::text,
    20,
    'button'::text,
    true
FROM public.action_definitions ad
WHERE ad.org_id IS NULL
  AND ad.key = 'add_family_member'
  AND NOT EXISTS (
      SELECT 1
      FROM public.action_placements ap
      WHERE ap.org_id IS NULL
        AND ap.action_definition_id = ad.id
        AND ap.surface = 'record_section'
        AND ap.slot = 'secondary'
        AND ap.entity_type IS NOT DISTINCT FROM 'opportunity'::text
        AND ap.section_key IS NOT DISTINCT FROM 'family_contacts'::text
  );

-- ---------------------------------------------------------------------------
-- 3) Deactivate legacy add_related_person on customer_booking (global placements)
-- ---------------------------------------------------------------------------

UPDATE public.action_placements ap
SET is_active = false,
    updated_at = now()
FROM public.action_definitions ad
WHERE ap.action_definition_id = ad.id
  AND ad.key = 'add_related_person'
  AND ap.surface = 'record_section'
  AND ap.section_key IS NOT DISTINCT FROM 'customer_booking'::text
  AND COALESCE(ap.is_active, true) = true;

-- ---------------------------------------------------------------------------
-- 4) Childcare opportunity drawer: add family_contacts to layout config
-- ---------------------------------------------------------------------------

WITH childcare_orgs AS (
    SELECT o.id AS org_id
    FROM public.orgs o
    JOIN public.industries i ON i.id = o.industry_id
    WHERE i.key = 'childcare'
      AND COALESCE(i.is_active, true) = true
),
merged AS (
    SELECT
        r.id,
        (
            jsonb_set(
                jsonb_set(
                    COALESCE(r.config_json, '{}'::jsonb),
                    '{inquiry_workflow_sections}',
                    COALESCE(
                        (
                            SELECT jsonb_agg(value ORDER BY sort_i)
                            FROM (
                                SELECT
                                    w.value,
                                    row_number() OVER () AS sort_i
                                FROM jsonb_array_elements(
                                    COALESCE(r.config_json -> 'inquiry_workflow_sections', '[]'::jsonb)
                                ) AS w (value)
                                WHERE COALESCE(w.value ->> 'key', '') <> 'family_contacts'
                                UNION ALL
                                SELECT
                                    jsonb_build_object(
                                        'key', 'family_contacts',
                                        'title', 'Family & Contacts',
                                        'field_keys', '[]'::jsonb,
                                        'allow_empty', true,
                                        'default_expanded', true
                                    ),
                                    999999
                            ) merged_sections (value, sort_i)
                        ),
                        '[]'::jsonb
                    )
                ),
                '{overview_section_order}',
                CASE
                    WHEN COALESCE(r.config_json -> 'overview_section_order', '[]'::jsonb) @> '"family_contacts"'::jsonb
                    THEN r.config_json -> 'overview_section_order'
                    ELSE COALESCE(r.config_json -> 'overview_section_order', '[]'::jsonb)
                        || jsonb_build_array('family_contacts')
                END
            )
        ) AS new_json
    FROM public.record_drawer_layouts r
    JOIN childcare_orgs c ON c.org_id = r.org_id
    WHERE r.entity_type = 'opportunity'
      AND r.surface = 'drawer'
      AND r.key = 'default'
      AND COALESCE(r.is_active, true) = true
)
UPDATE public.record_drawer_layouts r
SET config_json = m.new_json,
    updated_at = now()
FROM merged m
WHERE r.id = m.id;
