-- Minimal tenancy fixture for the Slice 1 invariant suite.
--
-- The Trust migration references public.orgs, public.user_roles and auth.uid().
-- This fixture supplies exactly those, so the suite proves the TRUST invariants
-- in isolation rather than re-proving the whole schema chain. Replaying the
-- migration inside the full chain is a separate check.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.orgs (id uuid PRIMARY KEY, name text);
CREATE TABLE IF NOT EXISTS public.user_roles (user_id uuid, org_id uuid);

INSERT INTO public.orgs (id, name) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Cert Org A'),
    ('99999999-9999-9999-9999-999999999999', 'Cert Org B')
ON CONFLICT (id) DO NOTHING;
