-- Minimal Supabase-compatible base for OE live certification.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), current_user) $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;

CREATE TABLE public.orgs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.user_roles (user_id uuid, org_id uuid, role text);
CREATE TABLE public.permissions (key text PRIMARY KEY, group_key text, label text, is_active boolean);
CREATE TABLE public.permission_keys (key text PRIMARY KEY, label text, group_key text, description text, is_active boolean);
CREATE TABLE public.permission_definitions (key text PRIMARY KEY, group_key text, label text, is_active boolean);
CREATE TABLE public.role_permission_grants (org_id uuid, role_key text, permission_key text, allowed boolean,
    PRIMARY KEY (org_id, role_key, permission_key));
CREATE TABLE public.mutation_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, mutation_id uuid,
    command_key text, domain text, subject_id uuid, subject_type text, previous_state text, new_state text,
    operator_id text, origin text, context_payload jsonb, committed_at timestamptz DEFAULT now(), effective_at timestamptz DEFAULT now());
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO authenticated;
