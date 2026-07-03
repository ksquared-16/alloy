-- BPEP Builder Sprint — Action Catalog Seeds
-- Seeds semantic operator actions in the platform action catalog.
-- These route through the Mutation Runtime using existing domain handlers.
--
-- close_lead       → lead_status domain (update_lead_status execution path)
-- waitlist_child   → enrollment_status domain (update_child_enrollment_status execution path)
-- enroll_child     → enrollment_status domain (update_child_enrollment_status execution path)
--
-- V1 note: status filtering by semantic purpose (closed/waitlisted/enrolled categories)
-- is a follow-up sprint item. V1 presents full status pickers for all three actions.

-- ─── close_lead ──────────────────────────────────────────────────────────────

insert into action_definitions (key, label, action_type, entity_type, payload_schema, is_active, metadata)
values (
    'close_lead',
    'Close Lead',
    'mutation_command',
    'opportunity',
    '{"domain": "lead_status"}'::jsonb,
    true,
    '{}'::jsonb
)
on conflict (key) where org_id is null do update
  set label          = excluded.label,
      action_type    = excluded.action_type,
      entity_type    = excluded.entity_type,
      payload_schema = excluded.payload_schema,
      is_active      = excluded.is_active;

-- Placement: Focus Panel Manage overflow (action_placements uses order_index, no metadata col)
insert into action_placements (action_definition_id, surface, slot, order_index, is_active)
select ad.id, 'record_header', 'overflow', 20, true
from action_definitions ad
where ad.key = 'close_lead' and ad.org_id is null
on conflict do nothing;

-- ─── waitlist_child ──────────────────────────────────────────────────────────

insert into action_definitions (key, label, action_type, entity_type, payload_schema, is_active, metadata)
values (
    'waitlist_child',
    'Waitlist Child',
    'mutation_command',
    'opportunity_customer_member',
    '{"domain": "enrollment_status"}'::jsonb,
    true,
    '{}'::jsonb
)
on conflict (key) where org_id is null do update
  set label          = excluded.label,
      action_type    = excluded.action_type,
      entity_type    = excluded.entity_type,
      payload_schema = excluded.payload_schema,
      is_active      = excluded.is_active;

-- Placement: record section / children (appears as row-level action on child rows)
insert into action_placements (action_definition_id, surface, slot, section_key, order_index, is_active)
select ad.id, 'record_section', 'primary', 'children', 20, true
from action_definitions ad
where ad.key = 'waitlist_child' and ad.org_id is null
on conflict do nothing;

-- ─── enroll_child ────────────────────────────────────────────────────────────

insert into action_definitions (key, label, action_type, entity_type, payload_schema, is_active, metadata)
values (
    'enroll_child',
    'Enroll Child',
    'mutation_command',
    'opportunity_customer_member',
    '{"domain": "enrollment_status"}'::jsonb,
    true,
    '{}'::jsonb
)
on conflict (key) where org_id is null do update
  set label          = excluded.label,
      action_type    = excluded.action_type,
      entity_type    = excluded.entity_type,
      payload_schema = excluded.payload_schema,
      is_active      = excluded.is_active;

-- Placement: record section / children (appears as row-level action on child rows)
insert into action_placements (action_definition_id, surface, slot, section_key, order_index, is_active)
select ad.id, 'record_section', 'primary', 'children', 30, true
from action_definitions ad
where ad.key = 'enroll_child' and ad.org_id is null
on conflict do nothing;
