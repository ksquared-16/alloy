CREATE OR REPLACE FUNCTION public.processing_commit_plans_immutable_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
AS $d1_guard$
BEGIN
    IF NEW.version IS DISTINCT FROM OLD.version
        OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
        OR NEW.case_id IS DISTINCT FROM OLD.case_id
        OR NEW.org_id IS DISTINCT FROM OLD.org_id
        OR NEW.built_at IS DISTINCT FROM OLD.built_at THEN
        RAISE EXCEPTION 'processing_commit_plans core columns are immutable; create a new version instead';
    END IF;
    RETURN NEW;
END;
$d1_guard$;

DROP TRIGGER IF EXISTS trg_processing_commit_plans_immutable ON public.processing_commit_plans;
CREATE TRIGGER trg_processing_commit_plans_immutable
    BEFORE UPDATE ON public.processing_commit_plans
    FOR EACH ROW EXECUTE FUNCTION public.processing_commit_plans_immutable_guard();
