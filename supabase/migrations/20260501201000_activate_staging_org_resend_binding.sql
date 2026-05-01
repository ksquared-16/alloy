-- Activate org-scoped Resend email binding for staging (no SMS changes, no secrets in JSONB).
-- Idempotent: repeating UPDATE sets the same values.

UPDATE public.communication_provider_bindings
SET
  status = 'active',
  secret_ref = 'env:RESEND_API_KEY',
  config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{from_email}',
    to_jsonb('no-reply@kurzmancapital.com'::text),
    true
  ),
  updated_at = now()
WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
  AND channel = 'email'
  AND provider = 'resend'
  AND scope = 'org';
