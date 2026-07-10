-- =============================================================================
-- Communications Identity Platform — Phase 2 foundation
-- =============================================================================
-- Splits communication_provider_bindings into provider accounts + communication
-- identities with location bindings and user grants. Legacy bindings remain;
-- backfill is idempotent via legacy_binding_id traceability.
-- Doctrine: docs/platform/modules/communications-identity-platform.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- communication_provider_accounts — tenant-owned provider connections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_provider_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    provider_type text NOT NULL,
    display_label text NULL,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled', 'pending_verification')),
    verification_state text NOT NULL DEFAULT 'unverified'
        CHECK (verification_state IN ('unverified', 'pending', 'verified', 'failed')),
    health_status text NOT NULL DEFAULT 'unknown'
        CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'unavailable')),
    secret_ref text NOT NULL DEFAULT 'unconfigured',
    capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    provider_account_ref text NULL,
    legacy_binding_id uuid NULL REFERENCES public.communication_provider_bindings (id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT communication_provider_accounts_provider_type_nonempty
        CHECK (char_length(btrim(provider_type)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS communication_provider_accounts_legacy_binding_uq
    ON public.communication_provider_accounts (legacy_binding_id)
    WHERE legacy_binding_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_provider_accounts_org
    ON public.communication_provider_accounts (org_id, provider_type)
    WHERE status = 'active';

COMMENT ON TABLE public.communication_provider_accounts IS
    'Tenant-owned provider connection (credentials via secret_ref only). One account may own many communication identities.';
COMMENT ON COLUMN public.communication_provider_accounts.legacy_binding_id IS
    'Traceability to communication_provider_bindings row that seeded this account during migration.';

-- -----------------------------------------------------------------------------
-- communication_identities — canonical send/receive addresses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    provider_account_id uuid NOT NULL REFERENCES public.communication_provider_accounts (id) ON DELETE CASCADE,
    channel text NOT NULL CHECK (channel IN ('sms', 'email', 'voice', 'internal')),
    identity_type text NOT NULL,
    canonical_address text NOT NULL,
    normalized_address text NOT NULL,
    display_name text NULL,
    inbound_enabled boolean NOT NULL DEFAULT true,
    outbound_enabled boolean NOT NULL DEFAULT true,
    verification_state text NOT NULL DEFAULT 'unverified'
        CHECK (verification_state IN ('unverified', 'pending', 'verified', 'failed')),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
    health_status text NOT NULL DEFAULT 'unknown'
        CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'unavailable')),
    capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
    provider_resource_ref text NULL,
    scope text NOT NULL DEFAULT 'tenant'
        CHECK (scope IN ('tenant', 'location', 'department', 'system')),
    is_default_for_scope boolean NOT NULL DEFAULT false,
    legacy_binding_id uuid NULL REFERENCES public.communication_provider_bindings (id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT communication_identities_address_nonempty
        CHECK (char_length(btrim(normalized_address)) > 0),
    CONSTRAINT communication_identities_type_nonempty
        CHECK (char_length(btrim(identity_type)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS communication_identities_legacy_binding_uq
    ON public.communication_identities (legacy_binding_id)
    WHERE legacy_binding_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_identities_org_channel
    ON public.communication_identities (org_id, channel, status)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_comm_identities_org_normalized
    ON public.communication_identities (org_id, channel, normalized_address)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_comm_identities_provider_account
    ON public.communication_identities (provider_account_id);

COMMENT ON TABLE public.communication_identities IS
    'Canonical communication address (phone, email, future voice/internal). Runtime resolves sends through identity, not provider.';

-- -----------------------------------------------------------------------------
-- communication_identity_location_bindings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_identity_location_bindings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    identity_id uuid NOT NULL REFERENCES public.communication_identities (id) ON DELETE CASCADE,
    location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE CASCADE,
    channel text NOT NULL CHECK (channel IN ('sms', 'email', 'voice', 'internal')),
    priority integer NOT NULL DEFAULT 100,
    is_default boolean NOT NULL DEFAULT false,
    inbound_routing_enabled boolean NOT NULL DEFAULT true,
    outbound_sending_enabled boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comm_identity_loc_bindings_location
    ON public.communication_identity_location_bindings (org_id, location_id, channel, status)
    WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS comm_identity_loc_default_uq
    ON public.communication_identity_location_bindings (org_id, location_id, channel)
    WHERE is_default = true AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS comm_identity_loc_binding_uq
    ON public.communication_identity_location_bindings (identity_id, location_id);

COMMENT ON TABLE public.communication_identity_location_bindings IS
    'Associates a communication identity with a location for inbound routing and outbound defaults.';

-- -----------------------------------------------------------------------------
-- communication_identity_grants — user permission to use/manage identities
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_identity_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    identity_id uuid NOT NULL REFERENCES public.communication_identities (id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    can_send boolean NOT NULL DEFAULT false,
    can_receive boolean NOT NULL DEFAULT false,
    can_configure boolean NOT NULL DEFAULT false,
    can_manage boolean NOT NULL DEFAULT false,
    can_override_default boolean NOT NULL DEFAULT false,
    can_use_across_locations boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT communication_identity_grants_user_uq UNIQUE (org_id, identity_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comm_identity_grants_user
    ON public.communication_identity_grants (org_id, user_id, status)
    WHERE status = 'active';

COMMENT ON TABLE public.communication_identity_grants IS
    'Operator grants to use or manage a communication identity. When no grants exist for an identity, org-level communications.send applies.';

-- -----------------------------------------------------------------------------
-- Extend communication_messages with canonical identity references
-- -----------------------------------------------------------------------------
ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS communication_identity_id uuid NULL
        REFERENCES public.communication_identities (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS communication_provider_account_id uuid NULL
        REFERENCES public.communication_provider_accounts (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comm_msgs_identity
    ON public.communication_messages (communication_identity_id)
    WHERE communication_identity_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_comm_provider_accounts_updated_at ON public.communication_provider_accounts;
CREATE TRIGGER trg_comm_provider_accounts_updated_at
    BEFORE UPDATE ON public.communication_provider_accounts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_comm_identities_updated_at ON public.communication_identities;
CREATE TRIGGER trg_comm_identities_updated_at
    BEFORE UPDATE ON public.communication_identities
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_comm_identity_loc_bindings_updated_at ON public.communication_identity_location_bindings;
CREATE TRIGGER trg_comm_identity_loc_bindings_updated_at
    BEFORE UPDATE ON public.communication_identity_location_bindings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_comm_identity_grants_updated_at ON public.communication_identity_grants;
CREATE TRIGGER trg_comm_identity_grants_updated_at
    BEFORE UPDATE ON public.communication_identity_grants
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.communication_provider_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_identity_location_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_identity_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY communication_provider_accounts_select_org
    ON public.communication_provider_accounts FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = communication_provider_accounts.org_id));

CREATE POLICY communication_provider_accounts_service_all
    ON public.communication_provider_accounts FOR ALL TO authenticated
    USING (auth.role() = 'service_role'::text)
    WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY communication_identities_select_org
    ON public.communication_identities FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = communication_identities.org_id));

CREATE POLICY communication_identities_service_all
    ON public.communication_identities FOR ALL TO authenticated
    USING (auth.role() = 'service_role'::text)
    WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY communication_identity_loc_bindings_select_org
    ON public.communication_identity_location_bindings FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = communication_identity_location_bindings.org_id));

CREATE POLICY communication_identity_loc_bindings_service_all
    ON public.communication_identity_location_bindings FOR ALL TO authenticated
    USING (auth.role() = 'service_role'::text)
    WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY communication_identity_grants_select_org
    ON public.communication_identity_grants FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.org_id = communication_identity_grants.org_id));

CREATE POLICY communication_identity_grants_service_all
    ON public.communication_identity_grants FOR ALL TO authenticated
    USING (auth.role() = 'service_role'::text)
    WITH CHECK (auth.role() = 'service_role'::text);

GRANT ALL ON TABLE public.communication_provider_accounts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.communication_identities TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.communication_identity_location_bindings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.communication_identity_grants TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Idempotent backfill from communication_provider_bindings
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    b RECORD;
    acct_id uuid;
    ident_id uuid;
    norm_addr text;
    id_type text;
    id_scope text;
    ver_state text;
    acct_ver text;
BEGIN
    FOR b IN
        SELECT *
        FROM public.communication_provider_bindings
        ORDER BY org_id, channel, updated_at ASC
    LOOP
        -- Skip if already backfilled
        IF EXISTS (
            SELECT 1 FROM public.communication_provider_accounts pa
            WHERE pa.legacy_binding_id = b.id
        ) THEN
            CONTINUE;
        END IF;

        ver_state := CASE b.status
            WHEN 'active' THEN 'verified'
            WHEN 'pending_verification' THEN 'pending'
            ELSE 'failed'
        END;
        acct_ver := ver_state;

        INSERT INTO public.communication_provider_accounts (
            org_id,
            provider_type,
            display_label,
            status,
            verification_state,
            health_status,
            secret_ref,
            capabilities,
            config,
            legacy_binding_id,
            metadata
        ) VALUES (
            b.org_id,
            b.provider,
            COALESCE(b.display_label, b.provider || ' account'),
            b.status,
            acct_ver,
            'unknown',
            b.secret_ref,
            '{}'::jsonb,
            COALESCE(b.config, '{}'::jsonb),
            b.id,
            jsonb_build_object('backfill_source', 'communication_provider_bindings', 'backfill_scope', b.scope)
        )
        RETURNING id INTO acct_id;

        -- Skip bindings without a resolvable sender address (do not fabricate placeholders).
        IF b.channel = 'sms' THEN
            norm_addr := COALESCE(
                NULLIF(btrim(b.inbound_to_e164), ''),
                NULLIF(btrim(COALESCE(b.config->>'from_number', '')), '')
            );
            IF norm_addr IS NULL OR btrim(norm_addr) = '' THEN
                RAISE NOTICE 'communications identity backfill skipped binding % — missing SMS address', b.id;
                CONTINUE;
            END IF;
            id_type := 'phone_number';
        ELSE
            norm_addr := lower(COALESCE(
                NULLIF(btrim(COALESCE(b.config->>'from_email', '')), ''),
                NULL
            ));
            IF norm_addr IS NULL OR btrim(norm_addr) = '' THEN
                RAISE NOTICE 'communications identity backfill skipped binding % — missing email from address', b.id;
                CONTINUE;
            END IF;
            id_type := CASE
                WHEN b.scope = 'system' OR COALESCE(b.display_label, '') ILIKE '%notification%' THEN 'system_email'
                WHEN b.scope = 'location' THEN 'location_email'
                ELSE 'shared_mailbox'
            END;
        END IF;

        id_scope := CASE b.scope
            WHEN 'location' THEN 'location'
            WHEN 'user' THEN 'tenant'
            ELSE 'tenant'
        END;

        INSERT INTO public.communication_identities (
            org_id,
            provider_account_id,
            channel,
            identity_type,
            canonical_address,
            normalized_address,
            display_name,
            inbound_enabled,
            outbound_enabled,
            verification_state,
            status,
            scope,
            is_default_for_scope,
            provider_resource_ref,
            legacy_binding_id,
            metadata
        ) VALUES (
            b.org_id,
            acct_id,
            b.channel,
            id_type,
            norm_addr,
            norm_addr,
            b.display_label,
            true,
            b.status = 'active',
            ver_state,
            CASE WHEN b.status = 'disabled' THEN 'disabled' ELSE 'active' END,
            id_scope,
            COALESCE(b.is_primary, false),
            COALESCE(b.config->>'messaging_service_sid', b.config->>'from_email'),
            b.id,
            jsonb_build_object(
                'backfill_source', 'communication_provider_bindings',
                'legacy_scope', b.scope,
                'legacy_user_id', b.user_id
            )
        )
        RETURNING id INTO ident_id;

        IF b.scope = 'location' AND b.location_id IS NOT NULL THEN
            INSERT INTO public.communication_identity_location_bindings (
                org_id,
                identity_id,
                location_id,
                channel,
                priority,
                is_default,
                status
            ) VALUES (
                b.org_id,
                ident_id,
                b.location_id,
                b.channel,
                CASE WHEN b.is_primary THEN 0 ELSE 100 END,
                COALESCE(b.is_primary, false),
                CASE WHEN b.status = 'disabled' THEN 'disabled' ELSE 'active' END
            )
            ON CONFLICT (identity_id, location_id) DO NOTHING;
        END IF;
    END LOOP;
END $$;
