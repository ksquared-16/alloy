-- Track A Batch 1: enforce jobs.org_id matches work_units.org_id when work_unit_id is set.
-- CHECK constraints cannot reference other tables; use a BEFORE trigger.

CREATE OR REPLACE FUNCTION public.enforce_jobs_work_unit_same_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  w_org uuid;
BEGIN
  IF NEW.work_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT w.org_id INTO w_org
  FROM public.work_units AS w
  WHERE w.id = NEW.work_unit_id;

  IF w_org IS NULL THEN
    RAISE EXCEPTION 'jobs.work_unit_id % does not reference an existing work unit', NEW.work_unit_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.org_id IS DISTINCT FROM w_org THEN
    RAISE EXCEPTION 'jobs.org_id (%) must match work_units.org_id (%) for work_unit_id % (job org and work unit org must be the same tenant)',
      NEW.org_id, w_org, NEW.work_unit_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_jobs_work_unit_same_org() IS
  'Ensures jobs.org_id equals the org of jobs.work_unit_id when work_unit_id is non-null (Track A integrity).';

DROP TRIGGER IF EXISTS trg_jobs_work_unit_org_integrity ON public.jobs;

CREATE TRIGGER trg_jobs_work_unit_org_integrity
  BEFORE INSERT OR UPDATE OF org_id, work_unit_id
  ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_jobs_work_unit_same_org();
