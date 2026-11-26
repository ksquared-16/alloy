CREATE OR REPLACE FUNCTION public.processing_plan_operations_immutable_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
AS $d1_ops_guard$
BEGIN
    RAISE EXCEPTION 'processing_plan_operations rows are immutable; build a new plan version instead';
END;
$d1_ops_guard$;

DROP TRIGGER IF EXISTS trg_processing_plan_operations_immutable ON public.processing_plan_operations;
CREATE TRIGGER trg_processing_plan_operations_immutable
    BEFORE UPDATE OR DELETE ON public.processing_plan_operations
    FOR EACH ROW EXECUTE FUNCTION public.processing_plan_operations_immutable_guard();
