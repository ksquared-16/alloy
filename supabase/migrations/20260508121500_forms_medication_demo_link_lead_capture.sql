-- Enable CRM intake on seeded medication demo public links when a default vertical exists.
-- Document generation requires a linked CRM entity; intake maps guardian/child form values via buildFormIntakeMetaFromPayload.

DO $$
DECLARE
    v_vertical uuid;
BEGIN
    SELECT id
    INTO v_vertical
    FROM public.verticals
    WHERE slug = 'cleaning' AND is_active = true
    LIMIT 1;

    IF v_vertical IS NULL THEN
        RAISE NOTICE 'forms medication demo lead_capture skipped — no active vertical with slug cleaning';
        RETURN;
    END IF;

    UPDATE public.form_public_links fpl
    SET metadata = fpl.metadata
        || jsonb_build_object(
            'lead_capture', true,
            'default_vertical_id', v_vertical::text
        )
    FROM public.form_definitions fd
    WHERE fpl.form_definition_id = fd.id
      AND fd.key = 'medication_authorization_demo';
END $$;
