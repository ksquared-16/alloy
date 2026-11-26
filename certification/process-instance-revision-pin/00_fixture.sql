-- Minimal tenancy the Business Process publication and process_instances migrations depend on.
--
-- Only the prerequisites the real migrations reference. Nothing under test is restated here: the
-- pin column, its triggers, `business_process_revisions` and the publish/rollback RPCs are all
-- created by the actual migration files. A fixture that hand-built them would certify a schema this
-- repository does not ship.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE IF NOT EXISTS public.orgs (id uuid PRIMARY KEY, name text);

-- `20260718140000_has_org_role_security_definer` reads this.
CREATE TABLE IF NOT EXISTS public.user_roles (user_id uuid, org_id uuid, role text);

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
    action_type text,
    payload jsonb,
    occurred_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- `metadata` matters: the publish RPC projects the published payload into
-- `departments.metadata.lifecycle_builder_v1`, and the LEGACY requirement keys this suite mutates
-- live in the same column.
CREATE TABLE IF NOT EXISTS public.departments (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    name text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- The publish and rollback RPCs stamp this when they write the runtime projection.
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- `20260722020000` ALTERs this table, so it must pre-exist.
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

-- Two orgs: cross-tenant refusal is a claim only a second tenant can prove.
INSERT INTO public.orgs (id, name) VALUES
    ('93667019-0000-4000-8000-000000000001', 'Cert Tenant A'),
    ('93667019-0000-4000-8000-000000000002', 'Cert Tenant B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.departments (id, org_id, name) VALUES
    ('3933ac47-0000-4000-8000-000000000001', '93667019-0000-4000-8000-000000000001', 'Enrollment A'),
    ('3933ac47-0000-4000-8000-000000000002', '93667019-0000-4000-8000-000000000002', 'Enrollment B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id)
VALUES ('b2562c99-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;
