-- Placement invariant certification — dependency fixture.
--
-- The placement foundation migration carries foreign keys and a consistency trigger that read
-- orgs, locations, customers, persons, customer_members, opportunities and
-- opportunity_customer_members. This stands up the minimum shape those reads need, so the
-- assertions run against the REAL constraints rather than a reimplementation of them.
--
-- Deliberately minimal: only the columns the placement FKs and trigger actually touch. Anything
-- more would be this fixture asserting a schema it does not own.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The placement migration attaches an updated_at trigger using this shared helper, which earlier
-- migrations create. Provided here so this suite replays the placement migration as written.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$fn$;

-- The placement migration's RLS policies reference auth.uid(), the Supabase client roles and
-- public.user_roles. Supplied here for the same reason as the Trust suite's fixture: so the
-- placement invariants are proven in isolation rather than re-proving the whole schema chain.
-- Create the auth shim only when the image does not already provide one. A Supabase-derived image
-- ships `auth.uid()` and owns the schema, so defining it again is both unnecessary and denied.
DO $auth$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'auth' AND p.proname = 'uid'
    ) THEN
        EXECUTE 'CREATE SCHEMA IF NOT EXISTS auth';
        EXECUTE 'CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $q$ SELECT NULL::uuid $q$';
    END IF;
END
$auth$;

DO $roles$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $roles$;

CREATE TABLE IF NOT EXISTS public.user_roles (user_id uuid, org_id uuid, role text);

CREATE TABLE IF NOT EXISTS public.orgs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text
);

CREATE TABLE IF NOT EXISTS public.locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.persons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    date_of_birth date
);

CREATE TABLE IF NOT EXISTS public.customer_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
    person_id uuid REFERENCES public.persons (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.opportunities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
    location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.opportunity_customer_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    opportunity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
    customer_member_id uuid REFERENCES public.customer_members (id) ON DELETE SET NULL,
    location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL
);

-- Two orgs, so cross-tenant assertions have somewhere to go wrong.
INSERT INTO public.orgs (id, name) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Org A'),
    ('22222222-2222-2222-2222-222222222222', 'Org B');

INSERT INTO public.locations (id, org_id) VALUES
    ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
    ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');

INSERT INTO public.customers (id, org_id) VALUES
    ('a0000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111');

INSERT INTO public.persons (id, org_id, date_of_birth) VALUES
    ('a0000000-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', '2024-01-01');

INSERT INTO public.customer_members (id, org_id, customer_id, person_id) VALUES
    ('a0000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111',
     'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000f1');

INSERT INTO public.opportunities (id, org_id, customer_id, location_id) VALUES
    ('a0000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111',
     'a0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000001');

INSERT INTO public.opportunity_customer_members (id, org_id, opportunity_id, customer_member_id, location_id) VALUES
    ('a0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111',
     'a0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000d1',
     'a0000000-0000-0000-0000-000000000001');
