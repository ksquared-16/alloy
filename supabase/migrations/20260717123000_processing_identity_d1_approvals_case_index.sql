CREATE INDEX IF NOT EXISTS idx_processing_approvals_case
    ON public.processing_approvals (org_id, case_id);
