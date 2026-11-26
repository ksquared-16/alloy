CREATE TABLE IF NOT EXISTS public.processing_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    case_id uuid NOT NULL REFERENCES public.processing_cases (id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES public.processing_commit_plans (id) ON DELETE CASCADE,
    plan_version integer NOT NULL,
    plan_content_hash text NOT NULL,
    approving_actor uuid NOT NULL,
    approval_authority text NOT NULL DEFAULT 'standard',
    decision text NOT NULL DEFAULT 'approved',
    included_operation_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    approved_at timestamptz DEFAULT now() NOT NULL,
    invalidated_at timestamptz,
    invalidation_reason text,
    retention_class text NOT NULL DEFAULT 'audit_authoritative',
    created_at timestamptz DEFAULT now() NOT NULL
);
