-- Communications Identity Platform — Phase 3 administration fields
-- default_access_mode, health/verification timestamps for operator surfaces.

ALTER TABLE public.communication_identities
    ADD COLUMN IF NOT EXISTS default_access_mode text NOT NULL DEFAULT 'open_until_restricted'
        CHECK (default_access_mode IN ('open_until_restricted', 'explicit_grants_required')),
    ADD COLUMN IF NOT EXISTS last_verification_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS last_successful_send_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS last_failed_send_at timestamptz NULL;

ALTER TABLE public.communication_provider_accounts
    ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS last_successful_operation_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS last_failed_operation_at timestamptz NULL;

ALTER TABLE public.communication_identity_location_bindings
    ADD COLUMN IF NOT EXISTS updated_by uuid NULL,
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.communication_identities.default_access_mode IS
    'Grant policy: open_until_restricted (backfilled/default) or explicit_grants_required (new identities).';

-- Backfilled identities remain open until restricted (Phase 2 compatibility).
UPDATE public.communication_identities
SET default_access_mode = 'open_until_restricted'
WHERE metadata->>'backfill_source' = 'communication_provider_bindings'
  AND default_access_mode IS DISTINCT FROM 'open_until_restricted';
