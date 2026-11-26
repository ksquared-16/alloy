-- ═════════════════════════════════════════════════════════════════════════════
-- Developer application registration — the write owner the catalog never had
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `developer_applications` shipped with a schema, four readers, an installation
-- API, a credential API, an Integrations UI and a chooser — and no way to create
-- a row. Not a missing route: nothing in the product could write the table at
-- all. RLS is FORCED with every grant revoked and deliberately no policy, so the
-- only writer possible was a service-role connection, and none existed. The
-- deployed catalog therefore held zero rows, and the half of the Integrations
-- surface that begins at "an installation exists" was uncertifiable.
--
-- The authority lives HERE, in one function, rather than in a route or an action
-- handler, for the reason the table has no policy: an application is a global
-- software identity, so its invariants cannot be enforced per tenant by RLS.
-- One SECURITY DEFINER function is the only place that sees every registration,
-- whoever calls it.
--
-- WHAT V1 DELIBERATELY DOES NOT DO. It does not create an installation, a
-- credential or a tenant relationship — those are the existing product flows and
-- pre-creating them would certify the fixture instead of the surface. It does
-- not add `org_id`. It registers `alloy_managed` only: `tenant_private` is
-- schema vocabulary that no current model can answer "whose private application
-- is this?" for, since the table has no owner column and an installation cannot
-- exist before the application does. Registering one today would invent an
-- ownership semantics by accident. It is refused by name, not ignored.

-- ── 1. The audit vocabulary ──────────────────────────────────────────────────
--
-- `app_security_audit` is the existing owner of Developer Platform provenance,
-- and its CHECK admits only credential/installation/authentication events. A
-- registration has no installation and no organization, which is exactly the
-- case the table was built to record honestly: "Nulls are meaningful … it has no
-- organization. Recording that as NULL is the honest answer." So this extends
-- the vocabulary rather than starting a second audit table beside it.
ALTER TABLE public.app_security_audit
    DROP CONSTRAINT IF EXISTS app_security_audit_event_type_check;

ALTER TABLE public.app_security_audit
    ADD CONSTRAINT app_security_audit_event_type_check CHECK (event_type IN (
        'credential.created',
        'credential.rotated',
        'credential.revoked',
        'installation.created',
        'installation.suspended',
        'installation.revoked',
        'installation.scopes_changed',
        'authentication.succeeded',
        'authentication.rejected',
        -- New in V1 registration. Platform-scope: org_id and installation_id are
        -- NULL, application_id is the row just created (or NULL on a refusal).
        'application.registered'
    ));

-- ── 2. The single write owner ────────────────────────────────────────────────
--
-- Returns a structured result instead of raising, because every caller is a
-- governed action that must record WHY a registration did not happen. An
-- exception collapses "you asked for an unsupported ownership mode" and "the
-- database was unreachable" into one failure at the transport, and the operator
-- reading the audit cannot tell them apart.
--
-- DUPLICATE BEHAVIOUR IS THE RETRY CONTRACT. A governed action may be retried,
-- and `uq_developer_applications_slug` makes the second attempt an error rather
-- than a no-op. So a re-registration that asks for exactly the state already on
-- disk succeeds and reports `duplicate: true` — the request's intent is already
-- true, which is what idempotent means. One that asks for a DIFFERENT shape
-- under a slug that exists is refused with both states named, because silently
-- returning the old row would let a caller believe it had changed something.
CREATE OR REPLACE FUNCTION public.register_developer_application(
    p_slug text,
    p_name text,
    p_publisher text,
    p_ownership_mode text DEFAULT 'alloy_managed',
    p_environment text DEFAULT 'sandbox',
    p_distribution_mode text DEFAULT 'private',
    p_status text DEFAULT 'active',
    p_registered_by text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_slug text := btrim(coalesce(p_slug, ''));
    v_name text := btrim(coalesce(p_name, ''));
    v_publisher text := btrim(coalesce(p_publisher, ''));
    v_existing public.developer_applications%ROWTYPE;
    v_row public.developer_applications%ROWTYPE;
    v_audit_id uuid;
    v_refusal text;
BEGIN
    -- Ordered so the answer names the FIRST thing wrong, and so the V1 ownership
    -- decision is the first gate rather than a footnote after field validation.
    IF p_ownership_mode IS DISTINCT FROM 'alloy_managed' THEN
        v_refusal := 'unsupported_ownership_mode';
    ELSIF v_slug = '' THEN
        v_refusal := 'missing_slug';
    ELSIF v_name = '' THEN
        v_refusal := 'missing_name';
    ELSIF v_publisher = '' THEN
        v_refusal := 'missing_publisher';
    ELSIF p_environment NOT IN ('sandbox', 'production') THEN
        v_refusal := 'unsupported_environment';
    ELSIF p_distribution_mode NOT IN ('private', 'listed') THEN
        v_refusal := 'unsupported_distribution_mode';
    ELSIF p_status NOT IN ('active', 'disabled') THEN
        v_refusal := 'unsupported_status';
    END IF;

    IF v_refusal IS NOT NULL THEN
        -- A refusal is provenance too: an attempt to register a tenant_private
        -- application is exactly the event the ownership debt will be reopened
        -- from, and it should be readable a year later.
        INSERT INTO public.app_security_audit (
            event_type, outcome, reason_code, actor_user_id, metadata
        ) VALUES (
            'application.registered', 'denied', v_refusal, NULL,
            jsonb_build_object(
                'requested_slug', v_slug,
                'requested_ownership_mode', p_ownership_mode,
                'requested_environment', p_environment,
                'requested_distribution_mode', p_distribution_mode,
                'requested_status', p_status,
                'registered_by', p_registered_by
            )
        );
        RETURN jsonb_build_object(
            'ok', false,
            'code', v_refusal,
            'detail', CASE v_refusal
                WHEN 'unsupported_ownership_mode' THEN
                    'V1 registration supports ownership_mode = alloy_managed only. '
                    || 'tenant_private and partner_managed are reserved until an explicit '
                    || 'publisher/application ownership model exists.'
                ELSE NULL
            END,
            'requested_ownership_mode', p_ownership_mode
        );
    END IF;

    SELECT * INTO v_existing FROM public.developer_applications WHERE slug = v_slug;

    IF FOUND THEN
        IF v_existing.name = v_name
            AND v_existing.publisher = v_publisher
            AND v_existing.ownership_mode = p_ownership_mode
            AND v_existing.environment = p_environment
            AND v_existing.distribution_mode = p_distribution_mode
            AND v_existing.status = p_status
        THEN
            RETURN jsonb_build_object(
                'ok', true,
                'duplicate', true,
                'application', to_jsonb(v_existing),
                'audit_id', NULL
            );
        END IF;

        INSERT INTO public.app_security_audit (
            event_type, outcome, reason_code, application_id, metadata
        ) VALUES (
            'application.registered', 'denied', 'duplicate_slug_conflict', v_existing.id,
            jsonb_build_object(
                'requested_slug', v_slug,
                'registered_by', p_registered_by
            )
        );
        RETURN jsonb_build_object(
            'ok', false,
            'code', 'duplicate_slug_conflict',
            'detail', 'An application with this key already exists in a different state.',
            'existing', to_jsonb(v_existing)
        );
    END IF;

    INSERT INTO public.developer_applications (
        slug, name, publisher, ownership_mode, distribution_mode, environment, status, metadata
    ) VALUES (
        v_slug, v_name, v_publisher, p_ownership_mode, p_distribution_mode, p_environment, p_status,
        coalesce(p_metadata, '{}'::jsonb)
    )
    RETURNING * INTO v_row;

    INSERT INTO public.app_security_audit (
        event_type, outcome, application_id, metadata
    ) VALUES (
        'application.registered', 'allowed', v_row.id,
        jsonb_build_object(
            'slug', v_row.slug,
            'name', v_row.name,
            'publisher', v_row.publisher,
            'ownership_mode', v_row.ownership_mode,
            'distribution_mode', v_row.distribution_mode,
            'environment', v_row.environment,
            'status', v_row.status,
            'registered_by', p_registered_by
        )
    )
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object(
        'ok', true,
        'duplicate', false,
        'application', to_jsonb(v_row),
        'audit_id', v_audit_id
    );
END;
$$;

-- The function is the write owner, so it must not become a privilege-escalation
-- path: SECURITY DEFINER plus a grant to `authenticated` would hand every signed-in
-- user the catalog the table's own RLS denies them. Only a service-role caller —
-- the trusted host — may execute it.
REVOKE ALL ON FUNCTION public.register_developer_application(
    text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_developer_application(
    text, text, text, text, text, text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.register_developer_application(
    text, text, text, text, text, text, text, text, jsonb) FROM authenticated;

COMMENT ON FUNCTION public.register_developer_application(
    text, text, text, text, text, text, text, text, jsonb) IS
    'V1 platform-operated registration of a global alloy_managed developer application. '
    'Creates no installation, no credential and no tenant relationship. '
    'tenant_private and partner_managed are refused by name.';
