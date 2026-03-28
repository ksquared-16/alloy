-- Baseline: booking_confirmed + action_link_consumed SMS/action-link workflows, workflow_actions,
-- job status definitions (jobs), and canonical job_statuses rows for the live booking flow.
-- Idempotent: upserts by stable workflow / workflow_action IDs; prunes extra actions on these workflows only.
-- Scope: workflow / message / status config only (no test-data cleanup; no phone uniqueness / identity experiments).

-- ---------------------------------------------------------------------------
-- Workflows (stable IDs)
-- ---------------------------------------------------------------------------
INSERT INTO public.workflows (id, org_id, name, description, event_type, entity_type, enabled, created_at, updated_at)
SELECT v.id,
       COALESCE((SELECT w.org_id FROM public.workflows w WHERE w.id = v.id LIMIT 1), (SELECT o.id FROM public.orgs o ORDER BY o.created_at ASC NULLS LAST LIMIT 1)),
       v.name,
       NULL::text,
       v.event_type,
       v.entity_type,
       v.enabled,
       now(),
       now()
FROM (
    VALUES
        ('6597d056-b412-48c3-96b0-ea665facc23f'::uuid, 'Booking: Customer Cancel Link + SMS', 'booking_confirmed', 'job', true),
        ('00128446-ddac-41b8-8037-0d6ff6a8d1b7'::uuid, 'Booking: Notify Vendor Assigned', 'booking_confirmed', 'job', true),
        ('b23ddfcf-0741-4e5d-a54d-ae8e547f3a3c'::uuid, 'Vendor Accepted → Customer Notification', 'action_link_consumed', 'job', true)
) AS v(id, name, event_type, entity_type, enabled)
WHERE (SELECT COUNT(*) FROM public.orgs) > 0
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    event_type = EXCLUDED.event_type,
    entity_type = EXCLUDED.entity_type,
    enabled = EXCLUDED.enabled,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Remove actions not part of the final baseline for these workflows only
-- ---------------------------------------------------------------------------
DELETE FROM public.workflow_actions
WHERE workflow_id IN (
    '6597d056-b412-48c3-96b0-ea665facc23f',
    '00128446-ddac-41b8-8037-0d6ff6a8d1b7',
    'b23ddfcf-0741-4e5d-a54d-ae8e547f3a3c'
)
  AND id NOT IN (
    'de6353e2-810b-4849-bb84-331420a4ae35',
    'f4afa083-bcd7-4c85-8fd9-83b17a9a4676',
    '7eee1498-5251-46d8-b7dd-018fde2163ec',
    '6d4ba4f8-75d6-4381-99da-6b6d3246fb50',
    '339e33cd-85f9-4f8f-8694-2d0697f389e9',
    '1f3e7782-b75d-465c-94e2-398577651250',
    '667a16dd-2424-4247-8106-35937891e6d5',
    '677a3d3c-c60f-46a6-8d8a-318e492d544a'
);

-- ---------------------------------------------------------------------------
-- Workflow actions (stable IDs + payloads)
-- ---------------------------------------------------------------------------
INSERT INTO public.workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload, org_id, created_at)
VALUES (
    'de6353e2-810b-4849-bb84-331420a4ae35'::uuid,
    '00128446-ddac-41b8-8037-0d6ff6a8d1b7'::uuid,
    1,
    'create_action_link',
    NULL,
    $json${
  "metadata": {
    "source": "booking_confirmed",
    "vendor_id": "{{job.assigned_vendor_id}}"
  },
  "output_key": "vendor_accept_url",
  "action_type": "vendor_accept_job",
  "entity_type": "job",
  "entity_id_path": "job.id",
  "expires_in_minutes": 120
}$json$::jsonb,
    (SELECT org_id FROM public.workflows WHERE id = '00128446-ddac-41b8-8037-0d6ff6a8d1b7' LIMIT 1),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    workflow_id = EXCLUDED.workflow_id,
    action_order = EXCLUDED.action_order,
    action_type = EXCLUDED.action_type,
    target_entity = EXCLUDED.target_entity,
    payload = EXCLUDED.payload,
    org_id = COALESCE(EXCLUDED.org_id, public.workflow_actions.org_id);

INSERT INTO public.workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload, org_id, created_at)
VALUES (
    'f4afa083-bcd7-4c85-8fd9-83b17a9a4676'::uuid,
    '00128446-ddac-41b8-8037-0d6ff6a8d1b7'::uuid,
    3,
    'send_message',
    NULL,
    $json${
  "body": "\nNew cleaning opportunity\n\nCustomer: {{person.first_name}} {{person.last_name}}\n\nWhen: {{formatted_start_at}}\nZIP: {{location.postal_code}}\n\nHome:\n{{opportunity.metadata.quote_input.square_footage}}\n{{opportunity.metadata.bedrooms}} bd / {{opportunity.metadata.bathrooms}} ba\n\nPay: ${{job.metadata.quote_total}}\n\nAccept:\n{{vendor_accept_url}}\n",
  "channel": "sms",
  "to_value": "{{vendor.phone}}",
  "recipients": [
    {
      "max": 25,
      "type": "job_qualified_vendors",
      "source": "resolver"
    }
  ]
}$json$::jsonb,
    (SELECT org_id FROM public.workflows WHERE id = '00128446-ddac-41b8-8037-0d6ff6a8d1b7' LIMIT 1),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    workflow_id = EXCLUDED.workflow_id,
    action_order = EXCLUDED.action_order,
    action_type = EXCLUDED.action_type,
    target_entity = EXCLUDED.target_entity,
    payload = EXCLUDED.payload,
    org_id = COALESCE(EXCLUDED.org_id, public.workflow_actions.org_id);

INSERT INTO public.workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload, org_id, created_at)
VALUES (
    '7eee1498-5251-46d8-b7dd-018fde2163ec'::uuid,
    '6597d056-b412-48c3-96b0-ea665facc23f'::uuid,
    1,
    'create_action_link',
    NULL,
    $json${
  "metadata": {
    "source": "booking_confirmed"
  },
  "output_key": "cancel_url",
  "action_type": "customer_cancel",
  "entity_type": "schedule",
  "entity_id_path": "schedule.id",
  "expires_in_minutes": 120
}$json$::jsonb,
    (SELECT org_id FROM public.workflows WHERE id = '6597d056-b412-48c3-96b0-ea665facc23f' LIMIT 1),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    workflow_id = EXCLUDED.workflow_id,
    action_order = EXCLUDED.action_order,
    action_type = EXCLUDED.action_type,
    target_entity = EXCLUDED.target_entity,
    payload = EXCLUDED.payload,
    org_id = COALESCE(EXCLUDED.org_id, public.workflow_actions.org_id);

INSERT INTO public.workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload, org_id, created_at)
VALUES (
    '6d4ba4f8-75d6-4381-99da-6b6d3246fb50'::uuid,
    '6597d056-b412-48c3-96b0-ea665facc23f'::uuid,
    2,
    'create_action_link',
    NULL,
    $json${
  "metadata": {
    "source": "booking_confirmed"
  },
  "output_key": "reschedule_url",
  "action_type": "reschedule_schedule",
  "entity_type": "schedule",
  "entity_id_path": "schedule.id",
  "expires_in_minutes": 120
}$json$::jsonb,
    (SELECT org_id FROM public.workflows WHERE id = '6597d056-b412-48c3-96b0-ea665facc23f' LIMIT 1),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    workflow_id = EXCLUDED.workflow_id,
    action_order = EXCLUDED.action_order,
    action_type = EXCLUDED.action_type,
    target_entity = EXCLUDED.target_entity,
    payload = EXCLUDED.payload,
    org_id = COALESCE(EXCLUDED.org_id, public.workflow_actions.org_id);

INSERT INTO public.workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload, org_id, created_at)
VALUES (
    '339e33cd-85f9-4f8f-8694-2d0697f389e9'::uuid,
    '6597d056-b412-48c3-96b0-ea665facc23f'::uuid,
    3,
    'create_message',
    NULL,
    $json${
  "body": "\nHi {{person.first_name}},\n\nYour cleaning is confirmed for {{formatted_start_at}}.\nFirst service total: ${{job.metadata.quote_total}}.\n\nWe're matching you with a cleaner now and will send an update once assigned.\n\nReschedule: {{reschedule_url}}\nCancel: {{cancel_url}}\n",
  "channel": "sms",
  "to_value": "{{person.phone}}"
}$json$::jsonb,
    (SELECT org_id FROM public.workflows WHERE id = '6597d056-b412-48c3-96b0-ea665facc23f' LIMIT 1),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    workflow_id = EXCLUDED.workflow_id,
    action_order = EXCLUDED.action_order,
    action_type = EXCLUDED.action_type,
    target_entity = EXCLUDED.target_entity,
    payload = EXCLUDED.payload,
    org_id = COALESCE(EXCLUDED.org_id, public.workflow_actions.org_id);

INSERT INTO public.workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload, org_id, created_at)
VALUES (
    '1f3e7782-b75d-465c-94e2-398577651250'::uuid,
    'b23ddfcf-0741-4e5d-a54d-ae8e547f3a3c'::uuid,
    1,
    'update_entity',
    'job',
    $json${
  "patch": {
    "status_key": "assigned"
  },
  "id_path": "job.id"
}$json$::jsonb,
    (SELECT org_id FROM public.workflows WHERE id = 'b23ddfcf-0741-4e5d-a54d-ae8e547f3a3c' LIMIT 1),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    workflow_id = EXCLUDED.workflow_id,
    action_order = EXCLUDED.action_order,
    action_type = EXCLUDED.action_type,
    target_entity = EXCLUDED.target_entity,
    payload = EXCLUDED.payload,
    org_id = COALESCE(EXCLUDED.org_id, public.workflow_actions.org_id);

INSERT INTO public.workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload, org_id, created_at)
VALUES (
    '667a16dd-2424-4247-8106-35937891e6d5'::uuid,
    'b23ddfcf-0741-4e5d-a54d-ae8e547f3a3c'::uuid,
    2,
    'create_message',
    NULL,
    $json${
  "body": "\nHi {{person.first_name}},\n\nYour cleaner {{vendor.name}} has been assigned for {{formatted_start_at}}.\n\nWe're all set for your visit.\n",
  "channel": "sms",
  "to_value": "{{person.phone}}"
}$json$::jsonb,
    (SELECT org_id FROM public.workflows WHERE id = 'b23ddfcf-0741-4e5d-a54d-ae8e547f3a3c' LIMIT 1),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    workflow_id = EXCLUDED.workflow_id,
    action_order = EXCLUDED.action_order,
    action_type = EXCLUDED.action_type,
    target_entity = EXCLUDED.target_entity,
    payload = EXCLUDED.payload,
    org_id = COALESCE(EXCLUDED.org_id, public.workflow_actions.org_id);

INSERT INTO public.workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload, org_id, created_at)
VALUES (
    '677a3d3c-c60f-46a6-8d8a-318e492d544a'::uuid,
    'b23ddfcf-0741-4e5d-a54d-ae8e547f3a3c'::uuid,
    4,
    'create_message',
    NULL,
    $json${
  "body": "\nYou're assigned for {{formatted_start_at}}\n\nAddress:\n{{location.address_line1}}\n{{location.city}} {{location.postal_code}}\n\nCustomer:\n{{person.first_name}} {{person.last_name}}\n{{person.phone}}\n\nAccess:\n{{opportunity.metadata.access_method}} {{opportunity.metadata.access_note}}\n",
  "channel": "sms",
  "to_value": "{{vendor.phone}}"
}$json$::jsonb,
    (SELECT org_id FROM public.workflows WHERE id = 'b23ddfcf-0741-4e5d-a54d-ae8e547f3a3c' LIMIT 1),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    workflow_id = EXCLUDED.workflow_id,
    action_order = EXCLUDED.action_order,
    action_type = EXCLUDED.action_type,
    target_entity = EXCLUDED.target_entity,
    payload = EXCLUDED.payload,
    org_id = COALESCE(EXCLUDED.org_id, public.workflow_actions.org_id);

-- ---------------------------------------------------------------------------
-- status_definitions: job keys used by admin + jobs.status_key (per org)
-- ---------------------------------------------------------------------------
UPDATE public.status_definitions AS sd
SET
    status_label = v.status_label,
    sort_order = v.sort_order,
    is_default = v.is_default,
    is_active = true,
    updated_at = now()
FROM public.orgs AS o,
    (
        VALUES
            ('new', 'New', 10, true),
            ('pending_assignment', 'Pending Assignment', 15, false),
            ('assigned', 'Assigned', 25, false),
            ('in_progress', 'In Progress', 35, false),
            ('completed', 'Completed', 90, false),
            ('canceled', 'Canceled', 99, false)
    ) AS v(status_key, status_label, sort_order, is_default)
WHERE sd.org_id = o.id
  AND sd.entity_type = 'jobs'
  AND sd.status_key = v.status_key
  AND (sd.industry_key IS NULL OR btrim(sd.industry_key) = '');

INSERT INTO public.status_definitions (
    org_id,
    entity_type,
    industry_key,
    status_key,
    status_label,
    sort_order,
    is_default,
    is_active,
    metadata
)
SELECT
    o.id,
    'jobs',
    NULL::text,
    v.status_key,
    v.status_label,
    v.sort_order,
    v.is_default,
    true,
    '{}'::jsonb
FROM public.orgs AS o,
    (
        VALUES
            ('new', 'New', 10, true),
            ('pending_assignment', 'Pending Assignment', 15, false),
            ('assigned', 'Assigned', 25, false),
            ('in_progress', 'In Progress', 35, false),
            ('completed', 'Completed', 90, false),
            ('canceled', 'Canceled', 99, false)
    ) AS v(status_key, status_label, sort_order, is_default)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.status_definitions s
    WHERE s.org_id = o.id
      AND s.entity_type = 'jobs'
      AND s.status_key = v.status_key
      AND (s.industry_key IS NULL OR btrim(s.industry_key) = '')
);

-- ---------------------------------------------------------------------------
-- job_statuses: canonical keys for booking resolution (global unique key)
-- Maps: status_key -> key, status_label -> label, sort_order -> position
-- ---------------------------------------------------------------------------
INSERT INTO public.job_statuses (id, key, label, position, is_active, org_id)
VALUES
    (gen_random_uuid(), 'new', 'New', 10, true, NULL),
    (gen_random_uuid(), 'pending_assignment', 'Pending Assignment', 15, true, NULL),
    (gen_random_uuid(), 'assigned', 'Assigned', 25, true, NULL),
    (gen_random_uuid(), 'in_progress', 'In Progress', 35, true, NULL),
    (gen_random_uuid(), 'completed', 'Completed', 90, true, NULL),
    (gen_random_uuid(), 'canceled', 'Canceled', 99, true, NULL)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    position = EXCLUDED.position,
    is_active = EXCLUDED.is_active;
