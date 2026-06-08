-- Configuration / Layout Assist V1 — Cards 1–3 foundational columns (additive).
-- requirement_policy / interaction_policy: nullable; legacy rows derive policy in application code until backfilled.
-- field_section_definitions: archive + section_config for layout visibility (Card 3).

ALTER TABLE public.field_definitions
    ADD COLUMN IF NOT EXISTS requirement_policy jsonb,
    ADD COLUMN IF NOT EXISTS interaction_policy jsonb;

COMMENT ON COLUMN public.field_definitions.requirement_policy IS
    'FieldRequirementPolicyV1 JSON. When null, app derives from is_required. Sync is_required on write for backward compatibility.';

COMMENT ON COLUMN public.field_definitions.interaction_policy IS
    'FieldInteractionPolicyV1 JSON (editability + write ownership). When null, app uses safe legacy defaults.';

ALTER TABLE public.field_section_definitions
    ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS section_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.field_section_definitions.is_archived IS
    'When true, section is hidden from new placements; existing field section_key references remain until moved.';

COMMENT ON COLUMN public.field_section_definitions.section_config IS
    'FieldSectionConfigV1 JSON (layout visibility hints, versioned).';

-- Optional backfill: map legacy is_required → requirement_policy.mode (idempotent).
UPDATE public.field_definitions fd
SET requirement_policy = jsonb_build_object(
    'version', 1,
    'mode', CASE WHEN fd.is_required THEN 'required' ELSE 'optional' END,
    'validation_scope', 'save'
)
WHERE fd.requirement_policy IS NULL;
