-- Minimal tenancy the Business Process publication migrations depend on.
--
-- Only the prerequisites the real migrations reference, and nothing about the
-- change under test: the schema being certified is created by the actual
-- migration files, not restated here. A fixture that hand-built
-- `business_process_revisions` would certify a table this repository does not
-- ship.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Supabase's standard roles. The migrations GRANT to them, and a bare Postgres
-- image has none — so without these the suite would fail on a detail that has
-- nothing to do with what it certifies.
DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
-- Same stub the Trust Runtime V1 fixture uses: the RLS policies call it, and
-- this suite never authenticates as an end user.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE IF NOT EXISTS public.orgs (
    id uuid PRIMARY KEY,
    name text
);

-- `20260718140000_has_org_role_security_definer` reads this.
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id uuid,
    org_id uuid,
    role text
);

CREATE TABLE IF NOT EXISTS public.locations (
    id uuid PRIMARY KEY,
    org_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
    name text
);

CREATE TABLE IF NOT EXISTS public.workflow_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid,
    event_type text,
    entity_type text,
    entity_id uuid,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- `metadata` matters: the publish RPC projects the published payload into
-- `departments.metadata.lifecycle_builder_v1`.
CREATE TABLE IF NOT EXISTS public.departments (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    name text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- `20260722020000` ALTERs this table, so it must pre-exist. Only the columns
-- that migration references are declared; the rest of its real shape is
-- irrelevant to Business Process lineage and is deliberately not invented.
CREATE TABLE IF NOT EXISTS public.location_program_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
    location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
    key text,
    label text,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.orgs (id, name)
VALUES ('93667019-0000-4000-8000-000000000001', 'Cert Tenant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.departments (id, org_id, name)
VALUES ('3933ac47-0000-4000-8000-000000000001', '93667019-0000-4000-8000-000000000001', 'Enrollment')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id)
VALUES ('b2562c99-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
