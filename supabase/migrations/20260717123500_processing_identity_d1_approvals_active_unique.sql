CREATE UNIQUE INDEX IF NOT EXISTS uq_processing_approvals_active_plan
    ON public.processing_approvals (plan_id)
    WHERE invalidated_at IS NULL AND decision = 'approved';
