-- Register update_lead_status as a mutation_command action.
-- Replaces update_status_add_note for the Lead Status domain.
-- update_status_add_note remains active for legacy paths only.

insert into action_definitions (
    key,
    label,
    action_type,
    entity_type,
    payload_schema,
    is_active,
    org_id
)
select
    'update_lead_status',
    'Update Lead Status',
    'mutation_command',
    'opportunity',
    jsonb_build_object('domain', 'lead_status'),
    true,
    null -- platform global
where not exists (
    select 1 from action_definitions
    where key = 'update_lead_status'
      and org_id is null
);

-- Platform placement: record_header primary (replaces generic Update status button)
insert into action_placements (
    action_definition_id,
    surface,
    slot,
    entity_type,
    order_index,
    is_active,
    org_id
)
select
    ad.id,
    'record_header',
    'primary',
    'opportunity',
    10,
    true,
    null
from action_definitions ad
where ad.key = 'update_lead_status'
  and ad.org_id is null
  and not exists (
    select 1 from action_placements ap
    where ap.action_definition_id = ad.id
      and ap.surface = 'record_header'
      and ap.org_id is null
  );
