-- Vendor accept links: persist vendor_id on the link when job already has assigned_vendor_id
-- (create_action_link renders {{...}} in metadata — see web/lib/workflowRun.ts).

UPDATE public.workflow_actions
SET payload = jsonb_set(
        COALESCE(payload, '{}'::jsonb),
        '{metadata}',
        COALESCE(payload->'metadata', '{}'::jsonb) || '{"vendor_id": "{{job.assigned_vendor_id}}"}'::jsonb
    )
WHERE workflow_id = '00128446-ddac-41b8-8037-0d6ff6a8d1b7'
  AND action_type = 'create_action_link'
  AND (payload->>'action_type') = 'vendor_accept_job';
