-- =============================================================================
-- Search Platform V2 — configured Business Processes for certification
-- =============================================================================
-- Publishes THREE processes into the department's `lifecycle_builder_v1`
-- metadata so Search can resolve their labels from tenant configuration.
--
-- This is the anti-hardcoding control: the names below exist ONLY here, in
-- configuration. `web/lib/search` contains none of them — a test greps for that.
-- Renaming any `name` value below must change what Search displays, with no code
-- change, and must change which query terms promote which process.
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
    v_org  uuid;
    v_dept uuid;
    v_cfg  jsonb;
BEGIN
    SELECT id INTO v_org FROM public.orgs WHERE slug = 'northwind-early-learning';
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Refusing to run outside the disposable certification tenant.';
    END IF;

    SELECT id INTO v_dept
      FROM public.departments
     WHERE org_id = v_org AND is_active IS NOT FALSE
     ORDER BY sort_order NULLS LAST, key
     LIMIT 1;
    IF v_dept IS NULL THEN
        RAISE EXCEPTION 'No active department in the certification tenant to carry process configuration.';
    END IF;

    v_cfg := jsonb_build_object(
        'version', 1,
        'processes', jsonb_build_array(
            jsonb_build_object(
                'id', 'cert-p-enrollment', 'key', 'enrollment', 'name', 'Enrollment',
                'primary_entity', 'customer_members', 'sort_order', 1, 'is_active', true,
                'stages', jsonb_build_array(
                    jsonb_build_object('id','cert-s-enrolling','key','enrolling','label','Enrolling','sort_order',1,'is_active',true),
                    jsonb_build_object('id','cert-s-enrolled','key','enrolled','label','Enrolled','sort_order',2,'is_active',true)
                )
            ),
            jsonb_build_object(
                'id', 'cert-p-annual', 'key', 'annual_registration', 'name', 'Annual Registration',
                'primary_entity', 'customer_members', 'sort_order', 2, 'is_active', true,
                'stages', jsonb_build_array(
                    jsonb_build_object('id','cert-s-needdocs','key','needs_documents','label','Needs documents','sort_order',1,'is_active',true)
                )
            ),
            jsonb_build_object(
                'id', 'cert-p-subsidy', 'key', 'subsidy_renewal', 'name', 'Subsidy Renewal',
                'primary_entity', 'customer_members', 'sort_order', 3, 'is_active', true,
                'stages', jsonb_build_array(
                    jsonb_build_object('id','cert-s-review','key','review_due','label','Review due','sort_order',1,'is_active',true)
                )
            )
        )
    );

    UPDATE public.departments
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('lifecycle_builder_v1', v_cfg)
     WHERE id = v_dept;

    RAISE NOTICE 'Configured 3 processes on department % for Search certification.', v_dept;
END $$;

-- Verification: the configuration must actually parse into three active processes.
DO $$
DECLARE
    v_count int;
BEGIN
    SELECT count(*) INTO v_count
      FROM public.departments d,
           LATERAL jsonb_array_elements(d.metadata -> 'lifecycle_builder_v1' -> 'processes') p
     WHERE d.org_id = (SELECT id FROM public.orgs WHERE slug = 'northwind-early-learning')
       AND (p ->> 'is_active')::boolean IS TRUE;
    IF v_count < 3 THEN
        RAISE EXCEPTION 'process configuration incomplete: % active processes, need 3', v_count;
    END IF;
    RAISE NOTICE 'Process configuration verified: % active processes.', v_count;
END $$;
