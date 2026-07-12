CREATE INDEX IF NOT EXISTS idx_processing_commit_plans_case
    ON public.processing_commit_plans (org_id, case_id);
