-- Firefly staging/demo org: align lifecycle builder to canonical enrollment process key
-- and consolidate guardrails onto the active Enrollment department.
-- Target org: 93667019-bd28-49b5-a688-acc9bb1e0a19 (Firefly Early Learning).
-- Non-destructive: no row deletes; legacy department deactivated only.

DO $$
DECLARE
    c_org_id constant uuid := '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
    c_canonical_dept constant uuid := '3933ac47-077a-4de8-aaac-8aed48d80413'::uuid;
    c_legacy_dept constant uuid := '04958a78-32ca-4091-bcd3-4bbaef3fee4b'::uuid;
    c_process_id constant text := '42be9074-443f-4047-bece-d68cd1d22788';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = c_org_id) THEN
        RAISE NOTICE 'Firefly org absent; skipping enrollment process config alignment.';
        RETURN;
    END IF;

    -- Canonicalize builder process key: lead_management -> enrollment (display name stays "Enrollment").
    UPDATE public.departments AS d
    SET
        metadata = jsonb_set(
            d.metadata,
            '{lifecycle_builder_v1,processes}',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        CASE
                            WHEN p->>'id' = c_process_id
                            THEN jsonb_set(p, '{key}', '"enrollment"'::jsonb, true)
                            ELSE p
                        END
                        ORDER BY ord
                    )
                    FROM jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') WITH ORDINALITY AS t(p, ord)
                ),
                '[]'::jsonb
            ),
            true
        ),
        updated_at = now()
    WHERE d.id = c_canonical_dept
      AND d.org_id = c_org_id
      AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(d.metadata->'lifecycle_builder_v1'->'processes') AS p
          WHERE p->>'id' = c_process_id
            AND p->>'key' = 'lead_management'
      );

    -- Align tour_scheduled guardrail to canonical Enrollment department; drop legacy WU scope.
    UPDATE public.status_transition_rules
    SET
        department_id = c_canonical_dept,
        work_unit_id = NULL,
        updated_at = now()
    WHERE org_id = c_org_id
      AND entity_type = 'opportunities'
      AND to_status_key = 'tour_scheduled'
      AND is_active = true
      AND (
          department_id IS DISTINCT FROM c_canonical_dept
          OR work_unit_id IS NOT NULL
      );

    -- Deactivate duplicate legacy Enrollment department (empty builder; guardrails moved).
    UPDATE public.departments
    SET
        is_active = false,
        name = 'Enrollment (legacy)',
        updated_at = now()
    WHERE id = c_legacy_dept
      AND org_id = c_org_id
      AND is_active = true;
END$$;
