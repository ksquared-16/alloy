-- Make Program Available — durable grouped command operations + idempotency.
-- Supports compound create→validate→publish→assign without duplicate Program identity on retry.

CREATE TABLE IF NOT EXISTS public.configuration_command_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    command_key text NOT NULL,
    idempotency_key text NOT NULL,
    status text NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'committed', 'partial', 'blocked', 'failed')),
    request_fingerprint text NOT NULL,
    entry_point text,
    program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
    publication_id uuid REFERENCES public.configuration_publications(id) ON DELETE SET NULL,
    revision_id uuid REFERENCES public.program_revisions(id) ON DELETE SET NULL,
    distribution_run_id uuid REFERENCES public.configuration_distribution_runs(id) ON DELETE SET NULL,
    result jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT configuration_command_operations_command_nonempty
        CHECK (char_length(btrim(command_key)) > 0),
    CONSTRAINT configuration_command_operations_idempotency_unique
        UNIQUE (org_id, command_key, idempotency_key)
);

COMMENT ON TABLE public.configuration_command_operations IS
    'Grouped configuration command operations (parent audit + idempotency). First use: programs.make_available.v1.';

CREATE INDEX IF NOT EXISTS configuration_command_operations_org_created_idx
    ON public.configuration_command_operations (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS configuration_command_operations_program_idx
    ON public.configuration_command_operations (org_id, program_id)
    WHERE program_id IS NOT NULL;

ALTER TABLE public.configuration_command_operations ENABLE ROW LEVEL SECURITY;
