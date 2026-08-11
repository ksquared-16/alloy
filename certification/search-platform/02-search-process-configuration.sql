-- =============================================================================
-- Search Platform V2 — configured Business Processes for certification
-- =============================================================================
-- Publishes THREE processes so Search can resolve their labels from tenant
-- configuration.
--
-- Published through the CANONICAL path — a validated draft handed to
-- `publish_business_process_revision_v1` — not by writing
-- `departments.metadata.lifecycle_builder_v1` directly, and with NO guard bypass.
--
-- An earlier revision of this file called `begin_lifecycle_projection_write`
-- because the publish RPC was itself broken (migration 20260807090000 dropped its
-- capability token). Migration 20260810220000 repaired the RPC, so the bypass is
-- gone and certification now exercises the real publication path.
--
-- The first version of this script did write the projection directly, and the
-- platform refused it:
--
--     lifecycle_builder_v1 is publication-owned; direct writes are not permitted
--
-- That guard is correct, and the refusal made the fixture better: certifying
-- against a genuinely PUBLISHED revision proves Search reads published
-- configuration, which a hand-written projection would not have proven.
--
-- This is the anti-hardcoding control: the names below exist ONLY here, in
-- configuration. `web/lib/search` contains none of them — a test greps for that.
-- =============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
    v_org      uuid;
    v_dept     uuid;
    v_actor    uuid;
    v_draft    uuid;
    v_payload  jsonb;
    v_checksum text := 'search-cert-processes-v1';
    v_res      jsonb;
    v_existing int;
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
        RAISE EXCEPTION 'No active department to carry process configuration.';
    END IF;

    SELECT user_id INTO v_actor FROM public.user_roles
     WHERE org_id = v_org ORDER BY role LIMIT 1;

    v_payload := jsonb_build_object(
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

    -- Idempotence: publication is NOT idempotent (a duplicate call mints a new
    -- revision), so skip when the projection already carries these processes.
    SELECT count(*) INTO v_existing
      FROM public.departments d,
           LATERAL jsonb_array_elements(COALESCE(d.metadata -> 'lifecycle_builder_v1' -> 'processes', '[]'::jsonb)) p
     WHERE d.id = v_dept AND p ->> 'id' LIKE 'cert-p-%';
    IF v_existing >= 3 AND coalesce(current_setting('alloy.cert_force_publish', true), '') <> 'on' THEN
        RAISE NOTICE 'Search certification processes already published — skipping.';
        RETURN;
    END IF;

    -- Draft → validated → publish, exactly as an operator would.
    SELECT id INTO v_draft FROM public.business_process_drafts
     WHERE org_id = v_org AND department_id = v_dept LIMIT 1;

    IF v_draft IS NULL THEN
        INSERT INTO public.business_process_drafts (org_id, department_id, payload, draft_status)
        VALUES (v_org, v_dept, v_payload, 'draft')
        RETURNING id INTO v_draft;
    ELSE
        UPDATE public.business_process_drafts SET payload = v_payload WHERE id = v_draft;
    END IF;

    UPDATE public.business_process_drafts
       SET draft_status = 'validated', validated_at = now(), validation_errors = '[]'::jsonb
     WHERE id = v_draft;

    v_res := public.publish_business_process_revision_v1(v_org, v_dept, v_actor, v_checksum);

    RAISE NOTICE 'Published Search certification processes: revision %, department %.',
        v_res ->> 'revision_number', v_dept;
END $$;

-- Verification: the PUBLISHED projection must expose three active processes with
-- the configured labels Search will display.
DO $$
DECLARE
    v_count  int;
    v_labels text;
BEGIN
    SELECT count(*), string_agg(p ->> 'name', ', ' ORDER BY p ->> 'name')
      INTO v_count, v_labels
      FROM public.departments d,
           LATERAL jsonb_array_elements(COALESCE(d.metadata -> 'lifecycle_builder_v1' -> 'processes', '[]'::jsonb)) p
     WHERE d.org_id = (SELECT id FROM public.orgs WHERE slug = 'northwind-early-learning')
       AND (p ->> 'is_active')::boolean IS TRUE
       AND p ->> 'id' LIKE 'cert-p-%';

    IF v_count < 3 THEN
        RAISE EXCEPTION 'process configuration incomplete: % active certification processes, need 3', v_count;
    END IF;
    RAISE NOTICE 'Published configuration verified: % processes (%).', v_count, v_labels;
END $$;
