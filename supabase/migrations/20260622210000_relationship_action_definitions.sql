-- =============================================================================
-- Unified Actions Phase 3: relationship action_definitions (platform global)
-- =============================================================================
-- Seeds global action_definitions for relationship framework keys.
-- action_type ui_intent + intent relationship_action → client opens shared wizard.
-- No global placements — Business Process / Settings control availability.
-- Updates add_child to use relationship executor (no duplicate open_form path).
-- =============================================================================

WITH relationship_defs AS (
    SELECT *
    FROM (VALUES
        (
            'add_emergency_contact'::text,
            'Add Emergency Contact'::text,
            'Add or link an emergency contact scoped to children.'::text,
            'opportunity'::text,
            40
        ),
        (
            'add_authorized_pickup',
            'Add Authorized Pickup',
            'Authorize a person for pickup on selected children.',
            'opportunity',
            41
        ),
        (
            'add_billing_contact',
            'Add Billing Contact',
            'Assign billing/payer responsibility on children or enrollment.',
            'opportunity',
            42
        ),
        (
            'add_parent_guardian',
            'Add Parent / Guardian',
            'Add or link a parent/guardian for children or household.',
            'opportunity',
            43
        ),
        (
            'link_existing_person',
            'Link Existing Person',
            'Link an existing household person with a selected role.',
            'opportunity',
            44
        ),
        (
            'link_existing_child',
            'Link Existing Child',
            'Link an existing household child to this enrollment.',
            'opportunity',
            45
        ),
        (
            'make_primary_contact',
            'Make Primary Contact',
            'Promote a contact to household primary (confirmation required).',
            'opportunity',
            46
        )
    ) AS v(key, label, description, entity_type, priority)
),
relationship_payload AS (
    SELECT
        rd.*,
        jsonb_build_object(
            'intent', 'relationship_action',
            'relationship_action_key', rd.key,
            'confirmation_required', true,
            'catalog', jsonb_build_object(
                'executor', CASE
                    WHEN rd.key = 'make_primary_contact' THEN 'dedicated_modal'
                    ELSE 'relationship_execute'
                END,
                'input_schema', 'relationship_wizard',
                'implementation_status', 'existing'
            )
        ) AS payload_schema
    FROM relationship_defs rd
),
inserted AS (
    INSERT INTO public.action_definitions (
        org_id,
        key,
        label,
        description,
        entity_type,
        action_type,
        priority,
        payload_schema,
        is_active
    )
    SELECT
        NULL::uuid,
        rp.key,
        rp.label,
        rp.description,
        rp.entity_type,
        'ui_intent'::text,
        rp.priority,
        rp.payload_schema,
        true
    FROM relationship_payload rp
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.action_definitions ad
        WHERE ad.org_id IS NULL
          AND ad.key = rp.key
    )
    RETURNING key
),
updated AS (
    UPDATE public.action_definitions ad
    SET
        label = rp.label,
        description = rp.description,
        entity_type = rp.entity_type,
        action_type = 'ui_intent',
        priority = rp.priority,
        payload_schema = rp.payload_schema,
        is_active = true,
        updated_at = now()
    FROM relationship_payload rp
    WHERE ad.org_id IS NULL
      AND ad.key = rp.key
    RETURNING ad.key
)
SELECT
    (SELECT count(*) FROM inserted) AS inserted_count,
    (SELECT count(*) FROM updated) AS updated_count;

-- Align add_child with canonical relationship executor (single path from registry surfaces).
UPDATE public.action_definitions ad
SET
    action_type = 'ui_intent',
    description = 'Add or link a child on this opportunity or household.',
    payload_schema = jsonb_build_object(
        'intent', 'relationship_action',
        'relationship_action_key', 'add_child',
        'confirmation_required', true,
        'catalog', jsonb_build_object(
            'executor', 'relationship_execute',
            'input_schema', 'relationship_wizard',
            'implementation_status', 'existing'
        )
    ),
    updated_at = now()
WHERE ad.org_id IS NULL
  AND ad.key = 'add_child';
