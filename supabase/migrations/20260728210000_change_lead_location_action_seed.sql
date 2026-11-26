-- Register change_lead_location for Focus Panel / drawer Manage (record_header).
-- Writes opportunities.location_id (family default). Child site authority stays on OCM.

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
    'change_lead_location',
    'Change lead location',
    'ui_intent',
    'opportunity',
    jsonb_build_object('form_key', 'change_lead_location', 'grain', 'lead_default_location'),
    true,
    null
where not exists (
    select 1 from action_definitions
    where key = 'change_lead_location'
      and org_id is null
);

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
    'secondary',
    'opportunity',
    40,
    true,
    null
from action_definitions ad
where ad.key = 'change_lead_location'
  and ad.org_id is null
  and not exists (
    select 1 from action_placements ap
    where ap.action_definition_id = ad.id
      and ap.surface = 'record_header'
      and ap.org_id is null
  );
