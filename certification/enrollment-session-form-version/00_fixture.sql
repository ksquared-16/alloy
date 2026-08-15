-- Minimal tenancy fixture for the D-94 session-version suite.
--
-- The Forms migrations reference public.orgs, public.user_roles and auth.uid(), plus the
-- three Supabase client roles. This supplies exactly those, so the suite proves the D-94
-- invariants in isolation rather than re-proving the whole schema chain. Orgs themselves
-- are inserted by the assertion file, which owns its own fixture data.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.orgs (id uuid PRIMARY KEY, name text);
CREATE TABLE IF NOT EXISTS public.user_roles (user_id uuid, org_id uuid);

-- Referenced by Forms FKs (persons, customers, customer_members, opportunities, documents).
-- Stub shells only: this suite proves the D-94 version invariants, not those tables'
-- semantics, and modelling them fully would make the fixture the thing under test.
CREATE TABLE IF NOT EXISTS public.persons (id uuid PRIMARY KEY, org_id uuid);
CREATE TABLE IF NOT EXISTS public.customers (id uuid PRIMARY KEY, org_id uuid);
CREATE TABLE IF NOT EXISTS public.customer_members (id uuid PRIMARY KEY, org_id uuid);
CREATE TABLE IF NOT EXISTS public.opportunities (id uuid PRIMARY KEY, org_id uuid);
CREATE TABLE IF NOT EXISTS public.documents (id uuid PRIMARY KEY, org_id uuid, entity_type text);

-- RLS policies in the Forms migrations call this. Returning false is the safe stub: this
-- suite asserts as the table owner (who bypasses RLS), so the policies must be creatable
-- but are deliberately not the thing under test.
CREATE OR REPLACE FUNCTION public.has_org_role(p_org uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

-- The Forms migrations attach an updated_at trigger to several tables. Supplying the
-- platform's own shape keeps the suite honest: the triggers actually fire here, so an
-- UPDATE in the assertions exercises the same path production does.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;
