-- CARD 13 — Placeholder inserts for communication_provider_bindings
-- REPLACE ALL PLACEHOLDER UUIDs BEFORE RUNNING IN ANY ENVIRONMENT.
-- No secrets belong in JSONB — use secret_ref string only.

-- Example: Org-level email (Resend)
/*
INSERT INTO public.communication_provider_bindings (
  id,
  org_id,
  channel,
  provider,
  scope,
  location_id,
  user_id,
  inbound_to_e164,
  display_label,
  status,
  is_primary,
  config,
  secret_ref,
  updated_at
) VALUES (
  gen_random_uuid(),
  '<ORG_UUID_HERE>'::uuid,
  'email',
  'resend',
  'org',
  NULL,
  NULL,
  NULL,
  'Primary transactional email',
  'active',
  true,
  jsonb_build_object(
    'from_email', 'no-reply@YOUR_VERIFIED_DOMAIN.com',
    'subject', 'Message from Alloy'
  ),
  'env:RESEND_API_KEY',
  now()
);
*/

-- Example: Org-level SMS (Twilio Messaging Service via env secrets)
/*
INSERT INTO public.communication_provider_bindings (
  id,
  org_id,
  channel,
  provider,
  scope,
  location_id,
  user_id,
  inbound_to_e164,
  display_label,
  status,
  is_primary,
  config,
  secret_ref,
  updated_at
) VALUES (
  gen_random_uuid(),
  '<ORG_UUID_HERE>'::uuid,
  'sms',
  'twilio',
  'org',
  NULL,
  NULL,
  '+1YOURTWILIOSMSNUMBER',
  'Main SMS inbound',
  'active',
  true,
  jsonb_build_object(
    'twilio_account_sid', 'ACxxxxxxxx',
    'messaging_service_sid', 'MGxxxxxxxx'
  ),
  'env:TENANT_TWILIO_AUTH_TOKEN',
  now()
);
*/

-- Example: Location-scoped SMS (same shape; set scope + location_id)
/*
INSERT INTO public.communication_provider_bindings (
  org_id,
  channel,
  provider,
  scope,
  location_id,
  inbound_to_e164,
  display_label,
  status,
  is_primary,
  config,
  secret_ref
) VALUES (
  '<ORG_UUID_HERE>'::uuid,
  'sms',
  'twilio',
  'location',
  '<LOCATION_UUID_HERE>'::uuid,
  '+1LOCATIONNUMBER',
  'Regional SMS line',
  'active',
  false,
  jsonb_build_object('twilio_account_sid', 'ACxxxx', 'messaging_service_sid', 'MGxxxx'),
  'env:TENANT_TWILIO_AUTH_TOKEN'
);
*/

-- Bridge pattern for Alloy Services legacy global Twilio:
-- secret_ref = 'legacy_global_twilio' (see binding_resolver / secret_ref docs).
