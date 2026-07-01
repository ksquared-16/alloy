-- Enrollment field catalog E3 repair — tag legacy/integration/system fields for operator pickers.
-- Idempotent UPDATE only; no deletes.

-- Opportunity / Lead — home-services, pricing, workflow residue
UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'legacy_home_services'),
    updated_at = now()
WHERE fd.entity_type = 'opportunity'
  AND fd.field_key IN (
      'appointment_id',
      'discount_amount',
      'discount_code',
      'discount_validated_at',
      'estimated_price',
      'estimated_price_cents',
      'quote_subtotal',
      'quote_total',
      'recurring_price',
      'recurring_price_cents',
      'display_total_cents',
      'monetary_value',
      'monetary_value_cents',
      'job_date',
      'job_time_window',
      'fee_schedule',
      'tuition',
      'tuition_pricing'
  )
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'legacy_home_services';

UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'system_workflow'),
    updated_at = now()
WHERE fd.entity_type = 'opportunity'
  AND fd.field_key IN (
      'status',
      'status_key',
      'status_group',
      'assigned_to',
      'lost_reason',
      'notes',
      'follow_up_notes',
      'next_follow_up_at',
      'customer_notes'
  )
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'system_workflow';

UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'integration'),
    updated_at = now()
WHERE fd.entity_type = 'opportunity'
  AND fd.field_key IN ('external_id', 'external_source', 'vertical')
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'integration';

UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'relationship_reference'),
    updated_at = now()
WHERE fd.entity_type = 'opportunity'
  AND fd.field_key IN ('customer_id', 'contact_id', 'primary_contact_id', 'primary_person_id', 'assigned_vendor_id')
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'relationship_reference';

-- Family / customer — integration and internal identifiers
UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'integration'),
    updated_at = now()
WHERE fd.entity_type = 'customer'
  AND fd.field_key IN (
      'stripe_customer_id',
      'external_id',
      'external_source',
      'vertical',
      'customer_type',
      'customer_number'
  )
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'integration';

-- Child — legacy program alias and workflow status
UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'legacy_compatibility'),
    updated_at = now()
WHERE fd.entity_type = 'inquiry_child'
  AND fd.field_key = 'desired_program_type'
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'legacy_compatibility';

UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'system_workflow'),
    updated_at = now()
WHERE fd.entity_type = 'inquiry_child'
  AND fd.field_key IN ('outcome_status_key', 'notes')
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'system_workflow';

-- Location — home-services / integration residue
UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'legacy_home_services'),
    updated_at = now()
WHERE fd.entity_type = 'location'
  AND fd.field_key IN (
      'access_method',
      'access_method_id',
      'access_notes',
      'customer_id',
      'vendor_id',
      'lat',
      'lng',
      'latitude',
      'longitude'
  )
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'legacy_home_services';

UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object('operator_catalog_class', 'integration'),
    updated_at = now()
WHERE fd.entity_type = 'location'
  AND fd.field_key IN ('external_id', 'external_source')
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'integration';

-- Canonical Program field — operator configurable when present
UPDATE public.field_definitions fd
SET
    config = COALESCE(fd.config, '{}'::jsonb) || jsonb_build_object(
        'operator_catalog_class', 'operator_configurable',
        'option_source', 'programs_for_location',
        'depends_on_field_key', 'location_id'
    ),
    label = COALESCE(NULLIF(trim(fd.label), ''), 'Program'),
    updated_at = now()
WHERE fd.entity_type = 'inquiry_child'
  AND fd.field_key = 'desired_program_category_id'
  AND COALESCE(fd.config ->> 'operator_catalog_class', '') <> 'operator_configurable';
