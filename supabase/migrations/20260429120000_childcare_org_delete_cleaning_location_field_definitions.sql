-- =============================================================================
-- Demo Childcare Co — remove cleaning-style location field_definitions only
-- =============================================================================
-- Org: 93667019-bd28-49b5-a688-acc9bb1e0a19 (industry childcare).
-- Deletes exactly four keys on entity location; does not touch access_method /
-- access_method_id. field_values for these defs CASCADE on delete if any exist.
--
-- Idempotent: re-run deletes zero rows once definitions are gone.
-- =============================================================================

DO $$
DECLARE
  c_org_id constant uuid := '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
  n_deleted integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = c_org_id) THEN
    RAISE EXCEPTION 'childcare_field_cleanup: org % not found', c_org_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orgs o
    INNER JOIN public.industries i ON i.id = o.industry_id
    WHERE o.id = c_org_id
      AND i.key = 'childcare'
  ) THEN
    RAISE EXCEPTION 'childcare_field_cleanup: org % is not industry childcare; abort', c_org_id;
  END IF;

  DELETE FROM public.field_definitions fd
  WHERE fd.org_id = c_org_id
    AND fd.entity_type = 'location'
    AND fd.field_key IN (
      'beds',
      'baths',
      'home_type',
      'square_footage_tier'
    );

  GET DIAGNOSTICS n_deleted = ROW_COUNT;
  RAISE NOTICE 'childcare_field_cleanup: deleted % field_definitions (location beds/baths/home_type/square_footage_tier) for org %', n_deleted, c_org_id;
END $$;
