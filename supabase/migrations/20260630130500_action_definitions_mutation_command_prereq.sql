-- =============================================================================
-- Prerequisite for the Mutation Runtime action seeds
-- =============================================================================
-- The action seeds (update_lead_status / update_child_enrollment_status /
-- bpep_action_catalog_seeds) insert action_definitions rows with a `metadata`
-- jsonb payload and action_type = 'mutation_command'. Neither existed in the
-- action_definitions schema. This migration adds both, idempotently, without
-- breaking existing action types or rows.
--
-- Existing action_type values in use (all remain valid): navigate, open_drawer,
-- open_form, update_status, update_field, start_workflow, external_link, ui_intent.
-- =============================================================================

-- 1. metadata column (idempotent). Existing rows default to '{}'.
ALTER TABLE public.action_definitions
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Widen the action_type CHECK to include 'mutation_command' (keeps all prior values).
ALTER TABLE public.action_definitions
    DROP CONSTRAINT IF EXISTS action_definitions_action_type_check;

ALTER TABLE public.action_definitions
    ADD CONSTRAINT action_definitions_action_type_check
    CHECK (action_type = ANY (ARRAY[
        'navigate'::text,
        'open_drawer'::text,
        'open_form'::text,
        'update_status'::text,
        'update_field'::text,
        'start_workflow'::text,
        'external_link'::text,
        'ui_intent'::text,
        'mutation_command'::text
    ]));
