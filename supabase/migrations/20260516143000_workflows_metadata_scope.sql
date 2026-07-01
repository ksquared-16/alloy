-- Workflow Assist V1: optional metadata for department/work-unit scope (no FK churn in V1).
-- Phase 2 may add workflows.department_id / work_unit_id FKs; scope lives in metadata until then.

ALTER TABLE public.workflows
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.workflows.metadata IS
    'Org-scoped JSON. Workflow Assist uses metadata.scope.department_id / work_unit_id for workspace panels; workflow_assist.* for draft provenance.';

CREATE INDEX IF NOT EXISTS idx_workflows_metadata_scope_department
    ON public.workflows ((metadata -> 'scope' ->> 'department_id'))
    WHERE (metadata -> 'scope' ->> 'department_id') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_metadata_scope_work_unit
    ON public.workflows ((metadata -> 'scope' ->> 'work_unit_id'))
    WHERE (metadata -> 'scope' ->> 'work_unit_id') IS NOT NULL;
