-- Card 8 — medication demo public links: explicit auto-create flags for end-to-end demo (production-safe default is false when keys absent).

UPDATE public.form_public_links fpl
SET metadata =
    fpl.metadata
    || jsonb_build_object(
        'auto_create_person', true,
        'auto_create_customer', true,
        'auto_create_customer_member', true,
        'auto_create_opportunity', true
    )
FROM public.form_definitions fd
WHERE fpl.form_definition_id = fd.id
  AND fd.key = 'medication_authorization_demo';
