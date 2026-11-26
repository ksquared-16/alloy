-- Minimal stubs for the prerequisites my migration depends on, so the publication RPC can be
-- exercised against real Postgres in an isolated database. Mirrors the real shapes only as far as
-- the RPC touches them.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE public.orgs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL DEFAULT 'test org'
);

CREATE TABLE public.departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    key text NOT NULL,
    name text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

CREATE TABLE public.workflow_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    event_type text NOT NULL,
    entity_type text,
    entity_id uuid,
    action_type text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Verbatim from 20260722020000_configuration_publication_runtime_v1.sql:94-109
CREATE TABLE public.configuration_publications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    domain_key text NOT NULL,
    subject_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    revision_number integer NOT NULL CHECK (revision_number > 0),
    payload_checksum text NOT NULL,
    published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    published_at timestamptz NOT NULL DEFAULT now(),
    audit_event_id uuid REFERENCES public.workflow_events(id) ON DELETE SET NULL,
    CONSTRAINT configuration_publications_domain_nonempty CHECK (char_length(btrim(domain_key)) > 0),
    CONSTRAINT configuration_publications_revision_unique UNIQUE (org_id, domain_key, revision_id),
    CONSTRAINT configuration_publications_subject_number_unique
        UNIQUE (org_id, domain_key, subject_id, revision_number)
);

-- Verbatim generic guard from the same migration (:226-235)
CREATE OR REPLACE FUNCTION public.configuration_publication_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $function$
BEGIN
    RAISE EXCEPTION '% rows are immutable; publish or append a new record instead', TG_TABLE_NAME
        USING ERRCODE = '0A000';
END;
$function$;

CREATE TRIGGER trg_configuration_publications_immutable
    BEFORE UPDATE OR DELETE ON public.configuration_publications
    FOR EACH ROW EXECUTE FUNCTION public.configuration_publication_immutable_guard();

-- RLS helper referenced by the policy loop.
CREATE OR REPLACE FUNCTION public.has_org_role(p_org_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

CREATE ROLE authenticated;
CREATE ROLE service_role;
