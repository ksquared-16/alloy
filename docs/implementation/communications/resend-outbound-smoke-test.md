# Resend outbound — canonical `communication_*` smoke test (staging)

**Scope:** Email only. **Do not** enable `COMMUNICATION_DUAL_WRITE`. **Do not** rely on `public.messages` for this path — the worker uses `communication_messages` via `process_communication_messages`.

## Files inspected (reference)

| File | Role |
|------|------|
| `supabase/migrations/20260430254100_communications_v1_foundation.sql` | `communication_threads` / `communication_messages` shape + thread unique key |
| `backend/app/services/communication_message_sender.py` | Dequeues `direction=outbound`, `status=queued`; Resend send; patches row; emits events |
| `backend/app/integrations/resend_client.py` | `POST https://api.resend.com/emails` |
| `backend/app/services/message_sender.py` | Legacy **`public.messages`** SMS only — not used for Resend |
| `backend/app/services/communications/binding_resolver.py` | Resolves org/email binding when row has no `communication_provider_binding_id` |
| `backend/app/routes/messages_sender.py` | `POST /internal/messages/process` → legacy SMS + **`process_communication_messages`** |
| `backend/app/services/communication_workflow_events.py` | `message_sent` / `message_failed` (UUID `entity_id` required) |
| `web/lib/communications/canonicalOutboundEnqueue.ts` | App-side enqueue pattern (optional alternative to SQL) |

## Preconditions

- Staging org: `93667019-bd28-49b5-a688-acc9bb1e0a19`
- Active Resend binding (`channel=email`, `provider=resend`, `status=active`, `secret_ref=env:RESEND_API_KEY`, `from_email` verified)
- Render: `RESEND_API_KEY`, `SUPABASE_*`, `INTERNAL_CRON_TOKEN` set
- `COMMUNICATION_DUAL_WRITE` unset/false on web

## Safest enqueue: SQL (no repo secrets)

Use:** `scripts/dev/communications-resend-smoke-enqueue.sql`**

Synthetic thread identity:

- `primary_entity_type = 'staging_resend_smoke'`
- `primary_entity_type` + `primary_entity_id` UUID is **not** a real CRM row — only satisfies thread uniqueness and backend `emit_for_communication_message` UUID validation
- `recipient_key` = normalized email `kurz16@gmail.com` (aligned with `normalizeRecipientKeyEmail`)
- `to_address` = `kurz16@gmail.com`

Run the script in **Supabase SQL Editor (staging)**. The final `INSERT … RETURNING` shows the new `communication_messages.id`.

## Trigger the worker

**Endpoint:** `POST {BACKEND_ORIGIN}/internal/messages/process`  
**Header:** `x-cron-token: {INTERNAL_CRON_TOKEN}` (same value as Render `INTERNAL_CRON_TOKEN`)  
**Body (optional):** `{"limit": 25}`

```bash
curl -sS -X POST "https://REPLACE_WITH_RENDER_STAGING_ORIGIN/internal/messages/process" \
  -H "Content-Type: application/json" \
  -H "x-cron-token: REPLACE_WITH_INTERNAL_CRON_TOKEN" \
  -d '{"limit": 10}'
```

Replace:

- `REPLACE_WITH_RENDER_STAGING_ORIGIN` — e.g. `https://your-service.onrender.com`
- `REPLACE_WITH_INTERNAL_CRON_TOKEN` — from Render env (do not commit)

**Response JSON** includes `communication_messages` with `processed`, `sent`, `failed`, `errors`, `message_ids`.

**Note:** If Render has **no** Twilio env vars, the same call still runs the **legacy** branch and may return `legacy_messages` with `skipped`/errors for SMS — that is unrelated to Resend. Inspect `communication_messages` in the JSON for the canonical result.

## Verify `communication_messages`

```sql
SELECT id, status, channel, to_address, provider, provider_message_id, error, sent_at, created_at
FROM public.communication_messages
WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
  AND channel = 'email'
ORDER BY created_at DESC
LIMIT 10;
```

**Success:** `status = 'sent'`, `provider = 'resend'`, `provider_message_id` non-null (Resend id), `error` null, `sent_at` set.

**Failure:** `status = 'failed'`, `error` populated (see next fixes).

## Verify `workflow_events` (optional)

SQL enqueue does **not** emit `message_queued` (that path is in the web app). After the worker runs you should see **`message_sent`** or **`message_failed`**:

```sql
SELECT id, event_type, entity_type, entity_id, payload, occurred_at
FROM public.workflow_events
WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
  AND event_type IN ('message_sent', 'message_failed')
ORDER BY occurred_at DESC
LIMIT 20;
```

Filter on your smoke `communication_message_id`:

```sql
SELECT id, event_type, payload
FROM public.workflow_events
WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
  AND (payload->>'communication_message_id') = 'PASTE_MESSAGE_UUID';
```

## Cleanup (optional)

```sql
DELETE FROM public.communication_messages
WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
  AND thread_id IN (
    SELECT id FROM public.communication_threads
    WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
      AND primary_entity_type = 'staging_resend_smoke'
  );

DELETE FROM public.communication_threads
WHERE org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid
  AND primary_entity_type = 'staging_resend_smoke';
```

## What we did / did not run from the repo

- **Created:** this doc + `scripts/dev/communications-resend-smoke-enqueue.sql`
- **Did not run:** staging `curl` or SQL (needs your Supabase session and Render secrets)

## Failure triage

| Symptom | Likely fix |
|---------|------------|
| `RESEND_API_KEY not configured` | `secret_ref` env name not set on Render, or literal `resolve_secret_plaintext` returns empty |
| `Resend HTTP 4xx` | Domain/from not verified, bad API key env, or `from_email` mismatch |
| `email requires active resend binding` | No active `resend` row for org, or resolver filter |
| Still `queued` | Worker not called, wrong URL/token, or different Supabase DB than enqueue |
| `thread missing entity_id` | Thread row corrupted — rerun thread insert from script |
