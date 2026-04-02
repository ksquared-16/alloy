-- =============================================================================
-- Org-scoped record numbers: automatic assignment on INSERT (concurrency-safe)
-- =============================================================================
-- Batch 1 (20260402103000) added NOT NULL *number columns and unique
-- (org_id, *number) indexes but did not assign values for new rows — inserts fail.
--
-- Design:
--   • next_org_scoped_record_number(org_id, entity): SECURITY DEFINER, bypasses RLS
--     for the MAX scan; uses pg_advisory_xact_lock per (org_id, entity) so concurrent
--     inserts in the same org cannot compute the same next value.
--   • BEFORE INSERT triggers on the seven tables; if *number IS NULL and org_id set,
--     assign next value. Explicit non-NULL numbers are left unchanged (imports).
--
-- Prerequisites: columns + unique indexes from 20260402103000_field_registry_batch1_record_numbers.sql
--
-- Idempotency: DROP TRIGGER IF EXISTS / CREATE OR REPLACE FUNCTION
--
-- Verification (after migrate):
--   -- Smoke: next number for an org (run as postgres / service_role):
--   SELECT public.next_org_scoped_record_number('<org_uuid>'::uuid, 'person');
--
--   -- No nulls:
--   SELECT 'persons' AS t, COUNT(*) FILTER (WHERE person_number IS NULL) AS nulls FROM public.persons
--   UNION ALL SELECT 'customers', COUNT(*) FILTER (WHERE customer_number IS NULL) FROM public.customers
--   UNION ALL SELECT 'jobs', COUNT(*) FILTER (WHERE job_number IS NULL) FROM public.jobs
--   UNION ALL SELECT 'opportunities', COUNT(*) FILTER (WHERE opportunity_number IS NULL) FROM public.opportunities
--   UNION ALL SELECT 'locations', COUNT(*) FILTER (WHERE location_number IS NULL) FROM public.locations
--   UNION ALL SELECT 'vendors', COUNT(*) FILTER (WHERE vendor_number IS NULL) FROM public.vendors
--   UNION ALL SELECT 'schedules', COUNT(*) FILTER (WHERE schedule_number IS NULL) FROM public.schedules;
--
--   SELECT tgname, tgrelid::regclass FROM pg_trigger
--   WHERE tgname LIKE 'trg_assign_org_record_number_%' AND NOT tgisinternal;
-- =============================================================================

CREATE OR REPLACE FUNCTION public.next_org_scoped_record_number(p_org_id uuid, p_entity text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entity text;
  v_tbl text;
  v_col text;
  v_next bigint;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'next_org_scoped_record_number: org_id is required';
  END IF;

  v_entity := lower(trim(p_entity));
  IF v_entity IS NULL OR v_entity = '' THEN
    RAISE EXCEPTION 'next_org_scoped_record_number: entity is required';
  END IF;

  -- Serialize allocators per org + entity (transaction-scoped; released at commit/rollback).
  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text || '|' || v_entity));

  CASE v_entity
    WHEN 'customer' THEN
      v_tbl := 'customers';
      v_col := 'customer_number';
    WHEN 'job' THEN
      v_tbl := 'jobs';
      v_col := 'job_number';
    WHEN 'opportunity' THEN
      v_tbl := 'opportunities';
      v_col := 'opportunity_number';
    WHEN 'location' THEN
      v_tbl := 'locations';
      v_col := 'location_number';
    WHEN 'person' THEN
      v_tbl := 'persons';
      v_col := 'person_number';
    WHEN 'vendor' THEN
      v_tbl := 'vendors';
      v_col := 'vendor_number';
    WHEN 'schedule' THEN
      v_tbl := 'schedules';
      v_col := 'schedule_number';
    ELSE
      RAISE EXCEPTION 'next_org_scoped_record_number: unknown entity % (expected customer, job, opportunity, location, person, vendor, schedule)', p_entity;
  END CASE;

  EXECUTE format(
    'SELECT COALESCE(MAX(%I), 0::bigint) + 1 FROM public.%I WHERE org_id = $1',
    v_col,
    v_tbl
  )
  INTO v_next
  USING p_org_id;

  RETURN v_next;
END;
$$;

ALTER FUNCTION public.next_org_scoped_record_number(uuid, text) OWNER TO postgres;

COMMENT ON FUNCTION public.next_org_scoped_record_number(uuid, text) IS
  'Returns next org-scoped monotonic record number using MAX+1 under advisory xact lock; SECURITY DEFINER to bypass RLS on MAX.';

REVOKE ALL ON FUNCTION public.next_org_scoped_record_number(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_org_scoped_record_number(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_org_scoped_record_number(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.trg_assign_org_scoped_record_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  CASE TG_TABLE_NAME::text
    WHEN 'persons' THEN
      IF NEW.person_number IS NULL THEN
        IF NEW.org_id IS NULL THEN
          RAISE EXCEPTION 'persons: org_id is required when person_number is omitted';
        END IF;
        NEW.person_number := public.next_org_scoped_record_number(NEW.org_id, 'person');
      END IF;

    WHEN 'customers' THEN
      IF NEW.customer_number IS NULL THEN
        IF NEW.org_id IS NULL THEN
          RAISE EXCEPTION 'customers: org_id is required when customer_number is omitted';
        END IF;
        NEW.customer_number := public.next_org_scoped_record_number(NEW.org_id, 'customer');
      END IF;

    WHEN 'jobs' THEN
      IF NEW.job_number IS NULL THEN
        IF NEW.org_id IS NULL THEN
          RAISE EXCEPTION 'jobs: org_id is required when job_number is omitted';
        END IF;
        NEW.job_number := public.next_org_scoped_record_number(NEW.org_id, 'job');
      END IF;

    WHEN 'opportunities' THEN
      IF NEW.opportunity_number IS NULL THEN
        IF NEW.org_id IS NULL THEN
          RAISE EXCEPTION 'opportunities: org_id is required when opportunity_number is omitted';
        END IF;
        NEW.opportunity_number := public.next_org_scoped_record_number(NEW.org_id, 'opportunity');
      END IF;

    WHEN 'locations' THEN
      IF NEW.location_number IS NULL THEN
        IF NEW.org_id IS NULL THEN
          RAISE EXCEPTION 'locations: org_id is required when location_number is omitted';
        END IF;
        NEW.location_number := public.next_org_scoped_record_number(NEW.org_id, 'location');
      END IF;

    WHEN 'vendors' THEN
      IF NEW.vendor_number IS NULL THEN
        IF NEW.org_id IS NULL THEN
          RAISE EXCEPTION 'vendors: org_id is required when vendor_number is omitted';
        END IF;
        NEW.vendor_number := public.next_org_scoped_record_number(NEW.org_id, 'vendor');
      END IF;

    WHEN 'schedules' THEN
      IF NEW.schedule_number IS NULL THEN
        IF NEW.org_id IS NULL THEN
          RAISE EXCEPTION 'schedules: org_id is required when schedule_number is omitted';
        END IF;
        NEW.schedule_number := public.next_org_scoped_record_number(NEW.org_id, 'schedule');
      END IF;

    ELSE
      RAISE EXCEPTION 'trg_assign_org_scoped_record_number: unexpected table %', TG_TABLE_NAME::text;
  END CASE;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_assign_org_scoped_record_number() OWNER TO postgres;

COMMENT ON FUNCTION public.trg_assign_org_scoped_record_number() IS
  'BEFORE INSERT: sets *number from next_org_scoped_record_number when NULL and org_id present.';

REVOKE ALL ON FUNCTION public.trg_assign_org_scoped_record_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_assign_org_scoped_record_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_assign_org_scoped_record_number() TO authenticated;


DROP TRIGGER IF EXISTS trg_assign_org_record_number_persons ON public.persons;
CREATE TRIGGER trg_assign_org_record_number_persons
  BEFORE INSERT ON public.persons
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assign_org_scoped_record_number();

DROP TRIGGER IF EXISTS trg_assign_org_record_number_customers ON public.customers;
CREATE TRIGGER trg_assign_org_record_number_customers
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assign_org_scoped_record_number();

DROP TRIGGER IF EXISTS trg_assign_org_record_number_jobs ON public.jobs;
CREATE TRIGGER trg_assign_org_record_number_jobs
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assign_org_scoped_record_number();

DROP TRIGGER IF EXISTS trg_assign_org_record_number_opportunities ON public.opportunities;
CREATE TRIGGER trg_assign_org_record_number_opportunities
  BEFORE INSERT ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assign_org_scoped_record_number();

DROP TRIGGER IF EXISTS trg_assign_org_record_number_locations ON public.locations;
CREATE TRIGGER trg_assign_org_record_number_locations
  BEFORE INSERT ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assign_org_scoped_record_number();

DROP TRIGGER IF EXISTS trg_assign_org_record_number_vendors ON public.vendors;
CREATE TRIGGER trg_assign_org_record_number_vendors
  BEFORE INSERT ON public.vendors
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assign_org_scoped_record_number();

DROP TRIGGER IF EXISTS trg_assign_org_record_number_schedules ON public.schedules;
CREATE TRIGGER trg_assign_org_record_number_schedules
  BEFORE INSERT ON public.schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assign_org_scoped_record_number();
