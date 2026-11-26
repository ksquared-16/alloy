-- D1 tables only (certification split — guards in 20260717125000).

CREATE TABLE IF NOT EXISTS public.processing_commit_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.processing_cases (id) ON DELETE CASCADE,
    version integer NOT NULL,
    content_hash text NOT NULL,
    source_resolution_versions jsonb NOT NULL DEFAULT '[]'::jsonb,
    preconditions jsonb NOT NULL DEFAULT '[]'::jsonb,
    atomic_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
    downstream_effect_preview jsonb NOT NULL DEFAULT '[]'::jsonb,
    requires_approval boolean NOT NULL DEFAULT true,
    requires_privileged_approval boolean NOT NULL DEFAULT false,
    reversible boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'draft',
    built_at timestamptz DEFAULT now() NOT NULL,
    superseded_by uuid REFERENCES public.processing_commit_plans (id) ON DELETE SET NULL,
    superseded_at timestamptz,
    retention_class text NOT NULL DEFAULT 'audit_authoritative',
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT uq_processing_commit_plans_case_version UNIQUE (case_id, version)
);
