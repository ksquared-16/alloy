-- =============================================================================
-- Search Platform V2 — a site-restricted operator for the permission scenario
-- =============================================================================
-- Creates a SECOND disposable operator whose site scope covers only the
-- Riverside campus. The Lakeside "Joe Smith" fixture must then be absent from
-- that operator's search results entirely — not shown and disabled.
--
--   Restricted operator: qa.restricted@northwind.invalid
--   Password:            alloy-local-cert   (same class as the seeded operator:
--                        local-only, non-secret, disposable stack only)
--
-- Local-only by construction: refuses to run outside the certification tenant.
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
    v_org    uuid;
    v_user   uuid := '00000000-0000-4000-8000-000050000099'::uuid;
    v_site_a uuid;
BEGIN
    SELECT id INTO v_org FROM public.orgs WHERE slug = 'northwind-early-learning';
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Refusing to run outside the disposable certification tenant.';
    END IF;

    SELECT id INTO v_site_a
      FROM public.locations
     WHERE org_id = v_org AND location_type = 'site' AND label ILIKE '%Riverside%'
     LIMIT 1;
    IF v_site_a IS NULL THEN
        RAISE EXCEPTION 'Riverside campus not found — cannot build a restricted site scope.';
    END IF;

    -- Auth identity. `confirmed_at` is generated; setting email_confirmed_at is enough.
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'qa.restricted@northwind.invalid', crypt('alloy-local-cert', gen_salt('bf')),
            now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO UPDATE
        SET encrypted_password = EXCLUDED.encrypted_password,
            email_confirmed_at = COALESCE(auth.users.email_confirmed_at, now());

    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    VALUES (v_user, v_user, v_user::text, 'email',
            jsonb_build_object('sub', v_user::text, 'email', 'qa.restricted@northwind.invalid', 'email_verified', true),
            now(), now())
    ON CONFLICT (provider, provider_id) DO NOTHING;

    -- Capability: an ordinary operator role, not owner/admin.
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (v_user, v_org, 'ops')
    ON CONFLICT (user_id, org_id, role) DO NOTHING;

    -- Data scope: all departments, but ONLY the Riverside site.
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
    VALUES (v_user, v_org, 'all', 'restricted')
    ON CONFLICT (user_id, org_id) DO UPDATE
        SET department_scope = EXCLUDED.department_scope,
            site_scope       = EXCLUDED.site_scope;

    INSERT INTO public.user_site_access (user_id, org_id, location_id)
    VALUES (v_user, v_org, v_site_a)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Restricted operator ready (site scope: Riverside only).';
END $$;

-- Verification: the restricted operator must reach exactly one site, and the
-- Lakeside Joe must exist so its ABSENCE is a real proof rather than a vacuous one.
DO $$
DECLARE
    v_sites int;
    v_lakeside_joe int;
BEGIN
    SELECT count(*) INTO v_sites
      FROM public.user_site_access
     WHERE user_id = '00000000-0000-4000-8000-000050000099'::uuid;
    IF v_sites <> 1 THEN
        RAISE EXCEPTION 'restricted operator should reach exactly 1 site, found %', v_sites;
    END IF;

    SELECT count(*) INTO v_lakeside_joe
      FROM public.customer_members
     WHERE id = '00000000-0000-4000-8000-000050000023'::uuid;
    IF v_lakeside_joe <> 1 THEN
        RAISE EXCEPTION 'Lakeside Joe fixture missing — absence could not be proven. Run 01 first.';
    END IF;

    RAISE NOTICE 'Restricted-operator scenario is provable: 1 reachable site, Lakeside subject exists.';
END $$;
