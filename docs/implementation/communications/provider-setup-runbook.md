# Communications — Provider setup runbook (Card 13)

This runbook aligns with **`secret_ref` only**: `env:VAR_NAME`, `legacy_global_twilio`, or `unconfigured`.  
**Never** store API keys, auth tokens, or Twilio secrets in `config` JSONB.

---

## Environment variables

### Web (Next / Vercel)

| Variable | Purpose |
|---------|---------|
| `COMMUNICATION_DUAL_WRITE` | Optional `true`/`1`/`yes` — mirror `create_message` → canonical (`communication_*`). Default off. |
| `INTERNAL_MESSAGES_PROCESS_URL` | Full URL POST for backend queue processor (`/internal/messages/process`). |
| `INTERNAL_CRON_TOKEN` | Header `x-cron-token` for that POST. |

### Backend (Render or equivalent)

| Variable | Purpose |
|---------|---------|
| `INTERNAL_CRON_TOKEN` | Match web when triggering process. |
| `SUPABASE_URL` / Supabase API key vars | Existing PostgREST access for dispatcher. |
| `TWILIO_*` | Legacy **global** pipeline only (`legacy_global_twilio` sentinel path). Prefer per-binding `env:*` refs. |
| `RESEND_API_KEY` | Default Resend fallback when bindings use `env:RESEND_API_KEY`. |
| `RESEND_FROM_EMAIL` | Fallback from address when binding config omits `from_email`. |
| Arbitrary vars | Names referenced after `env:` in `secret_ref` (e.g. `env:TENANT_TWILIO_AUTH`). |

Twilio inbound console: use  
`POST https://<BACKEND_ORIGIN>/sms/inbound/<COMMUNICATION_BINDING_UUID>`  
(plus legacy `/sms/inbound` during transition.)

---

## Resend onboarding (outline)

1. Create Resend account; verify billing if required.
2. Add sending domain DNS records until verified.
3. Create API key; store server-side (`RESEND_API_KEY` or per-tenant `env:…`).
4. Decide canonical `from` address on verified domain → put in binding `config.from_email`.

---

## Twilio onboarding (outline)

1. Buy or allocate phone number OR configure Messaging Service.
2. Messaging Service webhook → binding URL `/sms/inbound/{binding_uuid}` **or** number-level webhook.
3. Collect **non-secret** ids in binding `config`: `twilio_account_sid`, `messaging_service_sid`.  
   Auth token path: `secret_ref` → `env:YOUR_AUTH_TOKEN_VAR` plus set that var on backend.

---

## Inserting bindings (manual / SQL Console)

Prefer Supabase Dashboard with **service role context** or vetted migrations.

See **`seed_bindings_placeholder.sql`** in this directory — copy with your UUID placeholders.
