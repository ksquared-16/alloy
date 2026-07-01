-- =============================================================================
-- Forms Engine V1 — demo/example medication authorization form (Card 10)
-- =============================================================================
-- Idempotent when Alloy Bend staging org exists; otherwise skipped with NOTICE.
-- Maintained in sync with `web/lib/forms/seeds/medicationAuthorizationDemo.ts`.
-- Select/multiselect option_sets: `20260507130000_forms_medication_demo_option_sets.sql`.
-- Regenerate JSON via: `node --experimental-strip-types scripts/dumpMedicationDemoSchemaJson.ts`
-- =============================================================================

DO $$
DECLARE
    v_org uuid := '7803388d-cdee-4afb-89cf-23a137f39423'::uuid;
    v_form_id uuid;
    v_ver_id uuid;
    v_token_hash text := encode(extensions.digest(convert_to('alloy_demo_medication_authorization_v1', 'UTF8'), 'sha256'), 'hex');
    v_schema jsonb := $med_demo_schema$
{"schema_version":1,"title":"Medication Authorization — Demo","sections":[{"id":"sec_child","title":"Child","field_ids":["child_first_name","child_last_name","child_dob"]},{"id":"sec_guardian","title":"Guardian","field_ids":["guardian_full_name","guardian_email","guardian_phone"]},{"id":"sec_instructions","title":"Instructions","field_ids":["needs_special_instructions","special_instructions"]},{"id":"sec_meds","title":"Medications","field_ids":["medications"]},{"id":"sec_auth","title":"Authorization","field_ids":["authorization_acknowledgement","signature_guardian"]}],"fields":[{"id":"child_first_name","type":"text","label":"Child first name","required":true,"pdf_slot":"child_first"},{"id":"child_last_name","type":"text","label":"Child last name","required":true,"pdf_slot":"child_last"},{"id":"child_dob","type":"date","label":"Child date of birth","required":true,"pdf_slot":"dob"},{"id":"guardian_full_name","type":"text","label":"Guardian full name","required":true,"pdf_slot":"guardian_name"},{"id":"guardian_email","type":"text","label":"Guardian email","required":true,"validate":{"pattern":"^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"}},{"id":"guardian_phone","type":"text","label":"Guardian phone","required":false},{"id":"needs_special_instructions","type":"boolean","label":"Add special administration instructions?","required":true},{"id":"special_instructions","type":"text","label":"Special instructions","required":false,"visibility":{"all":[{"field_id":"needs_special_instructions","op":"eq","value":true}]},"validate":{"max_length":2000}},{"id":"medications","type":"group","label":"Medications","required":true,"repeat":{"min":1,"max":5},"fields":[{"id":"med_name","type":"text","label":"Medication name","required":true,"pdf_slot":"med_name"},{"id":"dose_strength","type":"text","label":"Dose / strength","required":true},{"id":"schedule","type":"select","label":"Schedule","option_set_key":"med_demo_schedule","required":true,"pdf_slot":"med_schedule"},{"id":"route","type":"multiselect","label":"Route(s)","option_set_key":"med_demo_route","required":false}]},{"id":"authorization_acknowledgement","type":"boolean","label":"I confirm this demo authorization is for testing only and is not an official state form.","required":true},{"id":"signature_guardian","type":"signature","label":"Guardian signature","required":true,"pdf_slot":"sig_line","signature":{"require_acknowledgment":true,"require_typed_name":true,"require_drawn_asset":false},"visibility":{"all":[{"field_id":"authorization_acknowledgement","op":"eq","value":true}]}}]}
$med_demo_schema$::jsonb;
    v_pdf jsonb := $med_demo_pdf$
{"engine":"stub_v1","template_key":"medication_authorization_demo_v1","slots":{"child_first":{"path":"values.child_first_name"},"child_last":{"path":"values.child_last_name"},"dob":{"path":"values.child_dob"},"guardian_name":{"path":"values.guardian_full_name"},"med_name":{"path":"groups.medications.0.values.med_name"},"med_schedule":{"path":"groups.medications.0.values.schedule"},"sig_line":{"path":"signatures.signature_guardian.typed_full_name"}}}
$med_demo_pdf$::jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = v_org) THEN
        RAISE NOTICE 'forms medication demo seed skipped — org % not found', v_org;
        RETURN;
    END IF;

    INSERT INTO public.form_definitions (
        org_id,
        key,
        name,
        description,
        kind,
        is_active,
        metadata
    )
    VALUES (
        v_org,
        'medication_authorization_demo',
        'Medication Authorization — Demo',
        'Demo/example-only schema — not an official state compliance form.',
        'center',
        true,
        jsonb_build_object(
            'demo', true,
            'compliance_status', 'example_only',
            'not_official_state_form', true
        )
    )
    ON CONFLICT (org_id, key) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        metadata = EXCLUDED.metadata,
        updated_at = now()
    RETURNING id INTO v_form_id;

    IF v_form_id IS NULL THEN
        SELECT id INTO v_form_id FROM public.form_definitions WHERE org_id = v_org AND key = 'medication_authorization_demo';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.form_definition_versions v WHERE v.form_definition_id = v_form_id AND v.version_number = 1
    ) THEN
        INSERT INTO public.form_definition_versions (
            form_definition_id,
            org_id,
            version_number,
            status,
            schema_json,
            pdf_mapping_json,
            published_at,
            published_by_user_id,
            metadata
        )
        VALUES (
            v_form_id,
            v_org,
            1,
            'published',
            v_schema,
            v_pdf,
            now(),
            NULL,
            jsonb_build_object('demo', true, 'compliance_status', 'example_only')
        )
        RETURNING id INTO v_ver_id;
    ELSE
        SELECT v.id INTO v_ver_id
        FROM public.form_definition_versions v
        WHERE v.form_definition_id = v_form_id AND v.version_number = 1
        LIMIT 1;
    END IF;

    INSERT INTO public.form_public_links (
        org_id,
        token_hash,
        token_prefix,
        form_definition_id,
        pinned_form_definition_version_id,
        is_active,
        allowed_embed_origins,
        metadata
    )
    VALUES (
        v_org,
        v_token_hash,
        'demo_med',
        v_form_id,
        v_ver_id,
        true,
        ARRAY['http://localhost:3000', 'http://127.0.0.1:3000']::text[],
        jsonb_build_object(
            'demo', true,
            'seed', 'medication_authorization_demo'
        )
    )
    ON CONFLICT (token_hash) DO NOTHING;
END $$;
