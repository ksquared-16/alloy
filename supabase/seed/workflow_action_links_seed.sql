-- Idempotent seed: workflows, workflow_conditions, workflow_actions.
-- Run once after replacing v_org_id with your org UUID. No table nukes.

DO $$
DECLARE
  v_org_id uuid := '00000000-0000-0000-0000-000000000000';  -- REPLACE with actual org_id
  wf_id uuid;
BEGIN
  -- ========== 1. Booking: Set opportunity Booked + job scheduled + create_assignment ==========
  DELETE FROM workflow_actions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Booking: Set opportunity Booked');
  DELETE FROM workflow_conditions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Booking: Set opportunity Booked');
  DELETE FROM workflows WHERE org_id = v_org_id AND name = 'Booking: Set opportunity Booked';

  INSERT INTO workflows (id, org_id, name, description, enabled, event_type, entity_type, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, 'Booking: Set opportunity Booked', 'On booking_confirmed: set opportunity to Booked stage, job to scheduled, create assignment if job has assigned_vendor_id', true, 'booking_confirmed', 'job', now(), now())
  RETURNING id INTO wf_id;

  INSERT INTO workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload)
  VALUES
    (gen_random_uuid(), wf_id, 1, 'update_entity', 'opportunity', jsonb_build_object('id_path', 'opportunity.id', 'patch', jsonb_build_object('pipeline_stage_id', '{{booked_stage_id}}', 'status', 'booked'))),
    (gen_random_uuid(), wf_id, 2, 'update_entity', 'job', jsonb_build_object('id_path', 'job.id', 'patch', jsonb_build_object('job_status_id', '{{scheduled_job_status_id}}'))),
    (gen_random_uuid(), wf_id, 3, 'create_assignment', 'schedule', jsonb_build_object('schedule_id_path', 'schedule.id', 'job_id_path', 'job.id', 'vendor_id_path', 'job.assigned_vendor_id', 'status_key', 'offered'));

  -- ========== 2. Quote started: Set opportunity stage ==========
  DELETE FROM workflow_actions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Quote started: Set opportunity stage');
  DELETE FROM workflow_conditions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Quote started: Set opportunity stage');
  DELETE FROM workflows WHERE org_id = v_org_id AND name = 'Quote started: Set opportunity stage';

  INSERT INTO workflows (id, org_id, name, description, enabled, event_type, entity_type, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, 'Quote started: Set opportunity stage', 'On quote_started: set opportunity pipeline_stage_id and status open', true, 'quote_started', 'opportunity', now(), now())
  RETURNING id INTO wf_id;

  INSERT INTO workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload)
  VALUES (gen_random_uuid(), wf_id, 1, 'update_entity', 'opportunity', jsonb_build_object('id_path', 'opportunity.id', 'patch', jsonb_build_object('pipeline_stage_id', '{{quote_started_stage_id}}', 'status', 'open')));

  -- ========== 3. Action link: vendor_accept_job → update job ==========
  DELETE FROM workflow_actions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Action link: vendor_accept_job update job');
  DELETE FROM workflow_conditions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Action link: vendor_accept_job update job');
  DELETE FROM workflows WHERE org_id = v_org_id AND name = 'Action link: vendor_accept_job update job';

  INSERT INTO workflows (id, org_id, name, description, enabled, event_type, entity_type, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, 'Action link: vendor_accept_job update job', 'On action_link_consumed (job): when action_type=vendor_accept_job, set job.vendor_id', true, 'action_link_consumed', 'job', now(), now())
  RETURNING id INTO wf_id;

  INSERT INTO workflow_conditions (id, workflow_id, target_entity, field, operator, value, enabled)
  VALUES (gen_random_uuid(), wf_id, 'job', 'action_type', 'eq', 'vendor_accept_job', true);
  INSERT INTO workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload)
  VALUES (gen_random_uuid(), wf_id, 1, 'update_entity', 'job', jsonb_build_object('entity_id', '{{entity_id}}', 'patch', jsonb_build_object('vendor_id', '{{vendor_id}}')));

  -- ========== 4. Action link: customer_cancel → cancel schedule ==========
  DELETE FROM workflow_actions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Action link: customer_cancel cancel schedule');
  DELETE FROM workflow_conditions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Action link: customer_cancel cancel schedule');
  DELETE FROM workflows WHERE org_id = v_org_id AND name = 'Action link: customer_cancel cancel schedule';

  INSERT INTO workflows (id, org_id, name, description, enabled, event_type, entity_type, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, 'Action link: customer_cancel cancel schedule', 'On action_link_consumed (schedule): when action_type=customer_cancel, set schedule canceled_at/canceled_by/cancel_reason', true, 'action_link_consumed', 'schedule', now(), now())
  RETURNING id INTO wf_id;

  INSERT INTO workflow_conditions (id, workflow_id, target_entity, field, operator, value, enabled)
  VALUES (gen_random_uuid(), wf_id, 'schedule', 'action_type', 'eq', 'customer_cancel', true);
  INSERT INTO workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload)
  VALUES (gen_random_uuid(), wf_id, 1, 'update_entity', 'schedule', jsonb_build_object('entity_id', '{{entity_id}}', 'patch', jsonb_build_object('canceled_at', '{{occurred_at}}', 'canceled_by', '{{canceled_by}}', 'cancel_reason', '{{cancel_reason}}')));

  -- ========== 5. Job action: assign_vendor → job status assigned ==========
  DELETE FROM workflow_actions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Job action: assign_vendor to assigned');
  DELETE FROM workflow_conditions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Job action: assign_vendor to assigned');
  DELETE FROM workflows WHERE org_id = v_org_id AND name = 'Job action: assign_vendor to assigned';

  INSERT INTO workflows (id, org_id, name, description, enabled, event_type, entity_type, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, 'Job action: assign_vendor to assigned', 'On job_action: when action=assign_vendor, set job_status_id to assigned', true, 'job_action', 'job', now(), now())
  RETURNING id INTO wf_id;

  INSERT INTO workflow_conditions (id, workflow_id, target_entity, field, operator, value, enabled)
  VALUES (gen_random_uuid(), wf_id, 'job', 'action', 'eq', 'assign_vendor', true);
  INSERT INTO workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload)
  VALUES (gen_random_uuid(), wf_id, 1, 'update_entity', 'job', jsonb_build_object('id_path', 'job.id', 'patch', jsonb_build_object('job_status_id', '{{assigned_job_status_id}}')));

  -- ========== 6. Job action: mark_completed → job completed ==========
  DELETE FROM workflow_actions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Job action: mark_completed');
  DELETE FROM workflow_conditions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Job action: mark_completed');
  DELETE FROM workflows WHERE org_id = v_org_id AND name = 'Job action: mark_completed';

  INSERT INTO workflows (id, org_id, name, description, enabled, event_type, entity_type, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, 'Job action: mark_completed', 'On job_action: when action=mark_completed, set job_status_id and completed_at', true, 'job_action', 'job', now(), now())
  RETURNING id INTO wf_id;

  INSERT INTO workflow_conditions (id, workflow_id, target_entity, field, operator, value, enabled)
  VALUES (gen_random_uuid(), wf_id, 'job', 'action', 'eq', 'mark_completed', true);
  INSERT INTO workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload)
  VALUES (gen_random_uuid(), wf_id, 1, 'update_entity', 'job', jsonb_build_object('id_path', 'job.id', 'patch', jsonb_build_object('job_status_id', '{{completed_job_status_id}}', 'completed_at', '{{occurred_at}}')));

  -- ========== 7. Schedule vendor assigned: create assignment ==========
  DELETE FROM workflow_actions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Schedule vendor assigned: create assignment');
  DELETE FROM workflow_conditions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Schedule vendor assigned: create assignment');
  DELETE FROM workflows WHERE org_id = v_org_id AND name = 'Schedule vendor assigned: create assignment';

  INSERT INTO workflows (id, org_id, name, description, enabled, event_type, entity_type, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, 'Schedule vendor assigned: create assignment', 'On schedule_vendor_assigned: create/update assignment with status offered', true, 'schedule_vendor_assigned', 'schedule', now(), now())
  RETURNING id INTO wf_id;

  INSERT INTO workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload)
  VALUES (gen_random_uuid(), wf_id, 1, 'create_assignment', 'schedule', jsonb_build_object('schedule_id', '{{schedule_id}}', 'job_id', '{{job_id}}', 'vendor_id', '{{vendor_id}}', 'status_key', 'offered'));

  -- ========== 8. Schedule created: create assignment from job default ==========
  DELETE FROM workflow_actions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Schedule created: create assignment from job default');
  DELETE FROM workflow_conditions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Schedule created: create assignment from job default');
  DELETE FROM workflows WHERE org_id = v_org_id AND name = 'Schedule created: create assignment from job default';

  INSERT INTO workflows (id, org_id, name, description, enabled, event_type, entity_type, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, 'Schedule created: create assignment from job default', 'On schedule_created: create assignment when job has assigned_vendor_id', true, 'schedule_created', 'schedule', now(), now())
  RETURNING id INTO wf_id;

  INSERT INTO workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload)
  VALUES (gen_random_uuid(), wf_id, 1, 'create_assignment', 'schedule', jsonb_build_object('schedule_id_path', 'schedule.id', 'job_id_path', 'job.id', 'vendor_id_path', 'job.assigned_vendor_id', 'status_key', 'offered'));

  -- ========== 9. Job default vendor applied: apply to upcoming ==========
  DELETE FROM workflow_actions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Job default vendor applied: apply to upcoming');
  DELETE FROM workflow_conditions WHERE workflow_id IN (SELECT id FROM workflows WHERE org_id = v_org_id AND name = 'Job default vendor applied: apply to upcoming');
  DELETE FROM workflows WHERE org_id = v_org_id AND name = 'Job default vendor applied: apply to upcoming';

  INSERT INTO workflows (id, org_id, name, description, enabled, event_type, entity_type, created_at, updated_at)
  VALUES (gen_random_uuid(), v_org_id, 'Job default vendor applied: apply to upcoming', 'On job_default_vendor_applied: apply job.assigned_vendor_id to all upcoming schedules', true, 'job_default_vendor_applied', 'job', now(), now())
  RETURNING id INTO wf_id;

  INSERT INTO workflow_actions (id, workflow_id, action_order, action_type, target_entity, payload)
  VALUES (gen_random_uuid(), wf_id, 1, 'apply_job_vendor_to_upcoming', 'job', jsonb_build_object('job_id_path', 'job.id'));

END $$;

-- ========== POST-SEED VERIFICATION (run manually; replace :v_org_id with your org_id) ==========
-- Count workflows/actions/conditions:
--   SELECT org_id, COUNT(*) AS workflows FROM workflows WHERE org_id = 'YOUR_ORG_ID' GROUP BY org_id;
--   SELECT w.org_id, COUNT(*) AS actions FROM workflow_actions a JOIN workflows w ON w.id = a.workflow_id WHERE w.org_id = 'YOUR_ORG_ID' GROUP BY w.org_id;
--   SELECT w.org_id, COUNT(*) AS conditions FROM workflow_conditions c JOIN workflows w ON w.id = c.workflow_id WHERE w.org_id = 'YOUR_ORG_ID' GROUP BY w.org_id;
-- List workflows:
--   SELECT name, enabled, event_type, entity_type FROM workflows WHERE org_id = 'YOUR_ORG_ID' ORDER BY name;

-- Placeholders to replace in your org (or add to API payloads):
--   {{booked_stage_id}}       - passed by book-v2/confirm
--   {{quote_started_stage_id}} - passed by quote-start
--   {{scheduled_job_status_id}} - add to book-v2/confirm payload or set in workflow payload to your job_status id for key=scheduled
--   {{assigned_job_status_id}} - add to admin job PATCH payload or set in workflow to your job_status id for key=assigned
--   {{completed_job_status_id}} - add to admin job PATCH payload or set in workflow to your job_status id for key=completed
