-- Organization-owned provider credentials — the canonical secret authority.
--
-- THE PROBLEM. Every credential in Alloy is a DEPLOYMENT environment variable.
-- That makes provider setup an Alloy-employee act: an organization administrator
-- could fill in every field the Communications page owns and still be told the
-- credential was unavailable, with nothing on the page able to fix it. Self-service
-- setup is impossible while the only place a secret can live is `process.env`.
--
-- WHY THIS IS NOT A SECOND SECRET STORE. `supabase_vault` is already installed and
-- was never used by any application code. This migration does not store secrets; it
-- delegates to Vault and adds the one thing Vault has no concept of — TENANCY.
--
-- WHY FUNCTIONS RATHER THAN A VIEW OR DIRECT ACCESS. PostgREST exposes only
-- `public` and `graphql_public` (`config.toml: schemas`), so the `vault` schema is
-- unreachable over the API by construction. The Python sender talks to PostgREST
-- over HTTP with the service-role key and holds no direct Postgres connection, so a
-- view would be reachable by neither runtime. A `public` SECURITY DEFINER function
-- is the only seam both runtimes can share, which is also what keeps the resolution
-- semantics single — TypeScript and Python call the SAME function rather than each
-- reimplementing the grammar.
--
-- THE TENANCY RULE, which is the whole security model:
--   a secret is resolvable ONLY through a provider account row that already carries
--   the caller's `org_id`. There is no code path that turns a bare secret reference
--   into plaintext. Tenant A presenting Tenant B's reference gets NULL, because the
--   ownership predicate is inside the function, not in the caller.

-- ---------------------------------------------------------------------------
-- Audit — what happened to a credential, never the credential.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_provider_credential_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    provider_account_id uuid,
    -- `created` first grant · `replaced` rotation · `revoked` withdrawal.
    action text NOT NULL CHECK (action IN ('created', 'replaced', 'revoked')),
    actor_user_id uuid,
    -- Deliberately NOT the secret, and deliberately not the vault id either: this
    -- table is read by operators, and an audit row must never widen exposure.
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organization_provider_credential_events IS
    'Credential lifecycle for organization-owned provider connections. Never contains a secret or a vault identifier.';

CREATE INDEX IF NOT EXISTS organization_provider_credential_events_org_idx
    ON public.organization_provider_credential_events (org_id, created_at DESC);

ALTER TABLE public.organization_provider_credential_events ENABLE ROW LEVEL SECURITY;

-- No policies: service_role only, like `communication_inbound_ingress`. An operator
-- reads this through an API route that has already resolved their organization.

-- ---------------------------------------------------------------------------
-- Store / rotate.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.org_provider_credential_put(
    p_org_id uuid,
    p_provider_account_id uuid,
    p_secret text,
    p_actor_user_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
-- Empty search_path: every reference below is schema-qualified, so a caller cannot
-- shadow `vault` or `public` with a temp schema and capture the plaintext.
SET search_path = ''
AS $$
DECLARE
    v_existing text;
    v_secret_id uuid;
    v_action text;
BEGIN
    IF p_org_id IS NULL OR p_provider_account_id IS NULL THEN
        RAISE EXCEPTION 'org and provider account are required';
    END IF;
    IF p_secret IS NULL OR btrim(p_secret) = '' THEN
        RAISE EXCEPTION 'refusing to store an empty credential';
    END IF;

    -- The account must already belong to this organization. This is what stops a
    -- caller writing a credential onto another tenant's connection.
    SELECT a.secret_ref INTO v_existing
      FROM public.communication_provider_accounts a
     WHERE a.id = p_provider_account_id AND a.org_id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'provider account does not belong to this organization';
    END IF;

    IF v_existing IS NOT NULL AND v_existing LIKE 'vault:%' THEN
        -- Rotation: update in place so the reference stays stable and every
        -- binding pointing at it keeps working.
        v_secret_id := substring(v_existing from 7)::uuid;
        PERFORM vault.update_secret(v_secret_id, p_secret);
        v_action := 'replaced';
    ELSE
        v_secret_id := vault.create_secret(
            p_secret,
            -- Named by account, not by anything guessable about the tenant.
            'org_provider_credential:' || p_provider_account_id::text,
            'Organization-owned provider credential'
        );
        v_action := 'created';
    END IF;

    UPDATE public.communication_provider_accounts
       SET secret_ref = 'vault:' || v_secret_id::text,
           updated_at = now()
     WHERE id = p_provider_account_id AND org_id = p_org_id;

    INSERT INTO public.organization_provider_credential_events (org_id, provider_account_id, action, actor_user_id)
    VALUES (p_org_id, p_provider_account_id, v_action, p_actor_user_id);

    RETURN 'vault:' || v_secret_id::text;
END;
$$;

COMMENT ON FUNCTION public.org_provider_credential_put(uuid, uuid, text, uuid) IS
    'Store or rotate an organization-owned provider credential. Returns the opaque reference, never the secret.';

-- ---------------------------------------------------------------------------
-- Resolve — the ONLY path from a reference to plaintext.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.org_provider_credential_resolve(
    p_org_id uuid,
    p_secret_ref text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_secret_id uuid;
    v_plain text;
BEGIN
    IF p_org_id IS NULL OR p_secret_ref IS NULL OR p_secret_ref NOT LIKE 'vault:%' THEN
        RETURN NULL;
    END IF;

    BEGIN
        v_secret_id := substring(p_secret_ref from 7)::uuid;
    EXCEPTION WHEN others THEN
        -- A malformed reference is "no secret", never an error that could tell a
        -- caller whether some other tenant's reference exists.
        RETURN NULL;
    END;

    -- TENANCY. The reference is only meaningful through an account this
    -- organization owns. Presenting another tenant's reference finds nothing.
    PERFORM 1
       FROM public.communication_provider_accounts a
      WHERE a.org_id = p_org_id
        AND a.secret_ref = p_secret_ref;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT s.decrypted_secret INTO v_plain
      FROM vault.decrypted_secrets s
     WHERE s.id = v_secret_id;

    RETURN v_plain;
END;
$$;

COMMENT ON FUNCTION public.org_provider_credential_resolve(uuid, text) IS
    'Resolve an organization-owned credential to plaintext. Returns NULL unless the reference belongs to that organization.';

-- ---------------------------------------------------------------------------
-- Revoke.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.org_provider_credential_revoke(
    p_org_id uuid,
    p_provider_account_id uuid,
    p_actor_user_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing text;
    v_secret_id uuid;
BEGIN
    SELECT a.secret_ref INTO v_existing
      FROM public.communication_provider_accounts a
     WHERE a.id = p_provider_account_id AND a.org_id = p_org_id;

    IF NOT FOUND OR v_existing IS NULL OR v_existing NOT LIKE 'vault:%' THEN
        RETURN false;
    END IF;

    v_secret_id := substring(v_existing from 7)::uuid;

    -- Destroy the secret, then drop the reference. Order matters: a reference
    -- surviving a deleted secret would read as "connected" and fail at dispatch.
    DELETE FROM vault.secrets WHERE id = v_secret_id;

    UPDATE public.communication_provider_accounts
       SET secret_ref = 'unconfigured',
           status = 'disabled',
           updated_at = now()
     WHERE id = p_provider_account_id AND org_id = p_org_id;

    INSERT INTO public.organization_provider_credential_events (org_id, provider_account_id, action, actor_user_id)
    VALUES (p_org_id, p_provider_account_id, 'revoked', p_actor_user_id);

    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.org_provider_credential_revoke(uuid, uuid, uuid) IS
    'Destroy an organization-owned provider credential and disable its connection.';

-- ---------------------------------------------------------------------------
-- Grants.
--
-- REVOKING FROM `PUBLIC` IS NOT ENOUGH, and assuming otherwise is how this
-- shipped a hole the first time. `pg_default_acl` on this database grants EXECUTE
-- on every new `public` function EXPLICITLY to `anon`, `authenticated` and
-- `service_role`. An explicit grant is not removed by revoking the implicit
-- PUBLIC one, so after `REVOKE ... FROM PUBLIC` an ordinary logged-in user could
-- still call the resolver and receive plaintext.
--
-- Caught by asking `has_function_privilege` rather than trusting the REVOKE:
--   anon=false, authenticated=TRUE, service_role=true.
-- `anon` was already clean only because a previous platform change stripped it.
--
-- So each role is named. Verified after applying, not assumed.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.org_provider_credential_put(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_provider_credential_resolve(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.org_provider_credential_revoke(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.org_provider_credential_put(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_provider_credential_resolve(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.org_provider_credential_revoke(uuid, uuid, uuid) TO service_role;
