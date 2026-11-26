-- Activate org-scoped Twilio SMS binding for staging (mirrors 20260501201000 email activation).
-- Idempotent: repeating UPDATE sets the same values. Does not store secrets in config JSONB.

UPDATE public.communication_provider_bindings
SET
  status = 'active',
  secret_ref = 'env:TWILIO_AUTH_TOKEN',
  updated_at = now()
WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
  AND channel = 'sms'
  AND provider = 'twilio'
  AND scope = 'org';
