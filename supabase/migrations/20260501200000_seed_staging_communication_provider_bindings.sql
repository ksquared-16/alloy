-- Staging-safe Communications V1 provider binding placeholders.
-- pending_verification + secret_ref unconfigured — no real sending until updated.
-- Idempotent: WHERE NOT EXISTS guards (no unique constraint on org+email channel alone).

INSERT INTO public.communication_provider_bindings (
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
)
SELECT
  '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
  'sms',
  'twilio',
  'org',
  NULL,
  NULL,
  '+15555555555',
  'Primary SMS',
  'pending_verification',
  true,
  jsonb_build_object(
    'twilio_account_sid',
    '<TWILIO_ACCOUNT_SID_PLACEHOLDER>',
    'messaging_service_sid',
    '<TWILIO_MESSAGING_SERVICE_SID_PLACEHOLDER>'
  ),
  'unconfigured',
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.communication_provider_bindings b
  WHERE b.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
    AND b.channel = 'sms'
    AND b.provider = 'twilio'
    AND b.scope = 'org'
    AND b.inbound_to_e164 IS NOT DISTINCT FROM '+15555555555'::text
);

INSERT INTO public.communication_provider_bindings (
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
)
SELECT
  '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
  'email',
  'resend',
  'org',
  NULL,
  NULL,
  NULL,
  'Primary Email',
  'pending_verification',
  true,
  jsonb_build_object(
    'from_email',
    '<no-reply@YOUR_VERIFIED_DOMAIN_PLACEHOLDER>'
  ),
  'unconfigured',
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.communication_provider_bindings b
  WHERE b.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
    AND b.channel = 'email'
    AND b.provider = 'resend'
    AND b.scope = 'org'
    AND b.display_label IS NOT DISTINCT FROM 'Primary Email'::text
);
