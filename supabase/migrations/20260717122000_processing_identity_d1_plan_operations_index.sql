CREATE INDEX IF NOT EXISTS idx_processing_plan_operations_plan
    ON public.processing_plan_operations (plan_id, op_order);
