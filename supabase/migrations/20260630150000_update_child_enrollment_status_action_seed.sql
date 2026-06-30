-- Register update_child_enrollment_status as a mutation_command action.
-- Domain: enrollment_status — writes opportunity_customer_members.outcome_status_key only.
-- Subject entity: opportunity_customer_member (OCM grain, not Case grain).

insert into action_definitions (key, label, action_type, entity_type, payload_schema, is_active, metadata)
values (
    'update_child_enrollment_status',
    'Update Child Enrollment Status',
    'mutation_command',
    'opportunity_customer_member',
    '{"domain": "enrollment_status"}'::jsonb,
    true,
    '{}'::jsonb
)
on conflict (key) do update
  set label         = excluded.label,
      action_type   = excluded.action_type,
      entity_type   = excluded.entity_type,
      payload_schema = excluded.payload_schema,
      is_active     = excluded.is_active;

-- Platform placement: record detail section / primary slot on child enrollment rows
insert into action_placements (action_definition_id, surface, slot, sort_order, is_active, metadata)
select ad.id, 'record_section', 'primary', 10, true, '{}'::jsonb
from action_definitions ad
where ad.key = 'update_child_enrollment_status'
on conflict do nothing;
