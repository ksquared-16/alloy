-- =============================================================================
-- Operational Consumption — first event type: enrollment.registration (Slice 1)
-- =============================================================================
-- Registers the FIRST consumable operational fact as a GLOBAL registry row
-- (org_id NULL — mirrors the analytics metric_definitions seed convention):
--
--   enrollment.registration  (source family: agreement)
--     Meaning: an enrollment agreement activation created a registration-fee
--     consumption event. It resolves the Commercial Model Charge Template keyed
--     'registration_fee' (resolved per-org at runtime), yielding a draft
--     registration-fee obligation. Produces no money — Posting (separate) does.
--
-- Idempotent: INSERT ... WHERE NOT EXISTS on the global (org_id IS NULL) key.
-- ADDITIVE ONLY. Uses existing commercial configuration (the org's Charge
-- Template with template_key = 'registration_fee').
-- =============================================================================

INSERT INTO public.consumption_event_types
    (org_id, event_key, label, source_family, description, charge_template_key, default_responsibility_key, is_active, effective_start, metadata)
SELECT NULL, v.event_key, v.label, v.source_family, v.description, v.charge_template_key, v.default_responsibility_key, true, '2000-01-01'::date, v.metadata
FROM (VALUES
    (
        'enrollment.registration'::text,
        'Enrollment Registration'::text,
        'agreement'::text,
        'An enrollment agreement activation creates a registration-fee consumption event. Resolves the Commercial Model Charge Template keyed registration_fee into a draft obligation. Posts nothing.'::text,
        'registration_fee'::text,
        'household'::text,
        '{"schema_version": 1, "source_entity_type": "child_enrollment_agreements"}'::jsonb
    )
) AS v(event_key, label, source_family, description, charge_template_key, default_responsibility_key, metadata)
WHERE NOT EXISTS (
    SELECT 1 FROM public.consumption_event_types cet
    WHERE cet.org_id IS NULL AND cet.event_key = v.event_key
);
