-- Canonical Resend smoke: enqueue one outbound email (no secrets, no dual-write).
-- Run in Supabase SQL Editor (staging). Then POST /internal/messages/process on Render.
--
-- Org + synthetic thread identity (not a real opportunity/customer UUID).
-- Recipient: kurz16@gmail.com (matches recipient_key normalization).

-- 1) Idempotent thread (fixed composite key)
INSERT INTO public.communication_threads (
  org_id,
  primary_entity_type,
  primary_entity_id,
  channel,
  recipient_key,
  metadata
) VALUES (
  '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
  'staging_resend_smoke',
  'a0000001-0000-4000-8000-000000000001'::uuid,
  'email',
  'kurz16@gmail.com',
  '{}'::jsonb
)
ON CONFLICT ON CONSTRAINT communication_threads_identity_uq DO NOTHING;

-- 2) New queued outbound message (safe to run multiple times for repeat tests)
INSERT INTO public.communication_messages (
  org_id,
  thread_id,
  channel,
  direction,
  status,
  body,
  body_format,
  to_address,
  metadata
)
SELECT
  '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid,
  t.id,
  'email',
  'outbound',
  'queued',
  '[Staging] Communications V1 Resend canonical smoke test (safe to delete).',
  'plain',
  'kurz16@gmail.com',
  '{}'::jsonb
FROM public.communication_threads t
WHERE t.org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
  AND t.primary_entity_type = 'staging_resend_smoke'
  AND t.primary_entity_id = 'a0000001-0000-4000-8000-000000000001'::uuid
  AND t.channel = 'email'
  AND t.recipient_key = 'kurz16@gmail.com'
RETURNING id, thread_id, status, to_address;
