# Communications V1 — Staging-safe provider bindings (setup card)

**Source sprint context:** [`docs/Sprints/05_2026/Communications.txt`](../../Sprints/05_2026/Communications.txt)

This card is staging-oriented: placeholders only, **no production behavior changes**, **no real secrets**, and **leave `COMMUNICATION_DUAL_WRITE` unset/false**.

---

## 1. Files inspected (inventory)

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260430254100_communications_v1_foundation.sql` | `communication_provider_bindings` DDL, constraints, RLS |
| `docs/implementation/communications/provider-setup-runbook.md` | Env overview, Resend/Twilio outlines |
| `docs/implementation/communications/seed_bindings_placeholder.sql` | Example INSERT shapes |
| `backend/app/services/communications/binding_resolver.py` | Outbound precedence: user → location → org ; inbound lookup |
| `backend/app/services/communications/secret_ref.py` | `env:VAR`, `legacy_global_twilio`, `unconfigured` |
| `backend/app/services/communication_message_sender.py` | Sends SMS (Twilio) / email (Resend) using binding + secrets |
| `web/app/api/admin/communications/bindings/route.ts` | Admin GET bindings (sanitized) |
| `web/lib/communications/composerChannels.ts` | `availableComposerChannels` / `activeOutboundBindings` |
| `backend/app/routes/sms_inbound.py` | Twilio webhook: `/sms/inbound/{binding_id}` |

---

## 2. Exact table shape — `communication_provider_bindings`

From migration **`20260430254100_communications_v1_foundation.sql`**:

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` | PK; default `gen_random_uuid()` |
| `org_id` | `uuid` | NOT NULL → `orgs(id)` CASCADE |
| `channel` | `text` | NOT NULL; **`'sms'` \| `'email'`** |
| `provider` | `text` | NOT NULL (app expects e.g. **`twilio`**, **`resend`** for email sends) |
| `scope` | `text` | NOT NULL DEFAULT `'org'` — **`'org'` \| `'location'` \| `'user'`** |
| `location_id` | `uuid` | FK → `locations(id)` NULL; use when `scope = 'location'` |
| `user_id` | `uuid` | NULL (user scope reserved for future) |
| `inbound_to_e164` | `text` | SMS inbound “To” number (E.164); **nullable** |
| `display_label` | `text` | nullable |
| `status` | `text` | NOT NULL DEFAULT **`'active'`** — **`'active'` \| `'disabled'` \| `'pending_verification'`** |
| `is_primary` | `boolean` | NOT NULL DEFAULT false |
| `config` | `jsonb` | NOT NULL DEFAULT `{}` — **non-secrets only** |
| `secret_ref` | `text` | NOT NULL DEFAULT **`'unconfigured'`** — `env:VAR_NAME` \| `legacy_global_twilio` \| `unconfigured` |
| `created_at` | `timestamptz` | default `now()` |
| `updated_at` | `timestamptz` | default `now()` |

Constraints / indexes relevant to staging:

- **Unique (partial):** `(org_id, inbound_to_e164)` where `inbound_to_e164 IS NOT NULL`.
- **Comment:** Secrets must never live in `config`; resolve via **`secret_ref`** only.

Outbound resolution (dispatcher): **`user`** (if matching rows exist) **`>` `location`** (match `location_id`) **`>` `org`**; within each tier, **`is_primary` desc**, then **`updated_at` desc** (`binding_resolver.resolve_outbound_binding`).

Email send path (`communication_message_sender.py`): requires **`provider`** lowercased **`resend`**, resolves API key via binding’s **`secret_ref`** then fallback **`env:RESEND_API_KEY`**, **`from_email`** from `config.from_email` or backend default helper.

SMS send path (`communication_message_sender.py`): non-legacy bindings need **`twilio_account_sid`** and **`messaging_service_sid`** in **`config`** and auth token plaintext from **`resolve_secret_plaintext(secret_ref)`** (`env:…`). **`legacy_global_twilio`** uses global env Twilio helper (migration/Alloy Services only — avoid for tenant staging).

---

## 3. Staging plan — Resend email binding

1. **External:** Create Resend account (staging project), verify a **staging** sending domain (`RESEND_SETUP` below).
2. **Secrets:** Generate API key; store **only** in backend (Render staging) env, e.g. `RESEND_API_KEY` — **not** in JSONB.
3. **Bindings row:** INSERT one **`channel = 'email'`**, **`provider = 'resend'`**, **`scope = 'org'`**, `location_id` NULL, **`secret_ref = 'env:RESEND_API_KEY'`** (or a staging-specific name, e.g. `env:STAGING_RESEND_API_KEY`, matching Render).
4. **`config` (non-secret only):** minimal `from_email` on verified domain; optional **`subject`** string; **`html`** only if you intentionally store static template snippets (prefer app-generated body; keep staging minimal).
5. **Web:** Composer visibility requires **active** email binding with **`provider === 'resend'`** and **`secret_ref !== unconfigured`** (`composerChannels.ts`). No composer enablement implies “ready” equals “non-unconfigured”; **live send** still depends on dispatcher + queued rows + backend secrets.

---

## 4. Staging plan — Twilio SMS binding

1. **External:** Twilio subaccount/project for staging; number or Messaging Service; webhook URL (**`TWILIO_SETUP`** below).
2. **Secrets:** Auth token → Render env **`env:STAGING_TWILIO_AUTH_TOKEN`** (example name — **never** paste token into SQL).
3. **Bindings row:** **`channel = 'sms'`**, **`provider = 'twilio'`**, **`scope = 'org'`** (or **`location`** + **`location_id`** for location-scoped test).
4. **`config` (non-secret only):** `twilio_account_sid`, `messaging_service_sid` (strings — **identifiers, not secrets**).
5. **`inbound_to_e164`:** E.164 of the inbound number/message service “To” mapping (must be **unique per org** among non-null inbound values).
6. **`secret_ref`:** `env:STAGING_TWILIO_AUTH_TOKEN` (must match backend env).

---

## 5. Placeholder SQL (staging only — do not paste secrets)

Run in **Supabase SQL editor** or migration **after** replacing every placeholder. Keep **`COMMUNICATION_DUAL_WRITE` off** in web (no canonical mirror automation change from this SQL alone).

```sql
-- =====================================================================
-- Staging placeholders — replace ALL_angle_bracket placeholders.
-- Never put API keys, auth tokens, or Resend secrets in jsonb config.
-- =====================================================================

BEGIN;

-- Optional: persist binding UUID for Twilio Messaging Service webhook:
-- INSERT ... RETURNING id; use that UUID in webhook URL below.

SELECT gen_random_uuid() AS staging_email_binding_id;
SELECT gen_random_uuid() AS staging_sms_binding_id;

-- Uncomment and edit after assigning UUIDs:

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
  created_at,
  updated_at
) VALUES (
  '<EMAIL_BINDING_UUID>'::uuid,
  '<ORG_UUID_PLACEHOLDER>'::uuid,
  'email',
  'resend',
  'org',
  NULL,
  NULL,
  NULL,
  'Staging — Resend (transactional)',
  'active',
  true,
  jsonb_build_object(
    'from_email', '<no-reply@YOUR_STAGING_DOMAIN.resend-ready>',
    'subject', '<Staging Alloy notification>'
    -- optionally: 'html' only for non-sensitive static stubs
  ),
  'env:RESEND_API_KEY',
  now(),
  now()
);
*/

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
  created_at,
  updated_at
) VALUES (
  '<SMS_BINDING_UUID>'::uuid,
  '<ORG_UUID_PLACEHOLDER>'::uuid,
  'sms',
  'twilio',
  'org',
  NULL,
  NULL,
  '+1xxxxxxxxxx',
  'Staging — Twilio SMS',
  'active',
  true,
  jsonb_build_object(
    'twilio_account_sid', '<ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>',
    'messaging_service_sid', '<MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>'
  ),
  'env:<STAGING_TWILIO_AUTH_TOKEN_VAR_NAME>',
  now(),
  now()
);
*/

-- Location-scoped example (same table shape):

/*
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
  created_at,
  updated_at
) VALUES (
  '<ORG_UUID_PLACEHOLDER>'::uuid,
  'sms',
  'twilio',
  'location',
  '<LOCATION_UUID_PLACEHOLDER>'::uuid,
  NULL,
  '+1yyyyyyyyyy',
  'Staging — location line',
  'active',
  false,
  jsonb_build_object(
    'twilio_account_sid', '<ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>',
    'messaging_service_sid', '<MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx>'
  ),
  'env:<STAGING_TWILIO_AUTH_TOKEN_VAR_NAME>',
  now(),
  now()
);
*/

COMMIT;
```

---

## 6. Environment variable checklist

### Local web (`web/.env.local`)

| Variable | Staging posture |
|----------|----------------|
| **`COMMUNICATION_DUAL_WRITE`** | **Leave unset/false.** Do **not** enable dual-write unless explicitly staging that experiment. |
| **`INTERNAL_MESSAGES_PROCESS_URL`** | Full URL to backend **`POST`** queue processor **`/internal/messages/process`** (staging backend base). Required if you trigger canonical processing from local admin against staging APIs. |
| **`INTERNAL_CRON_TOKEN`** | Must match backend **same-named** secret for **`x-cron-token`**. |

### Vercel (staging)

Same as local web rows; point **`INTERNAL_MESSAGES_PROCESS_URL`** at **staging** Render URL. **`COMMUNICATION_DUAL_WRITE`** unset/false per policy.

### Backend (Render staging)

| Variable | Purpose |
|----------|---------|
| **`INTERNAL_CRON_TOKEN`** | Match web / cron callers. |
| **`SUPABASE_URL`** + Supabase keys | PostgREST for dispatcher (**existing** Alloy pattern). |
| **`RESEND_API_KEY`** | Default/fallback target for **`env:RESEND_API_KEY`** email path. Per-tenant **`env:TENANT_KEY`** overrides if **`secret_ref`** says so. |
| **`RESEND_FROM_EMAIL`** | Backend fallback **`from`** if binding **`config`** omits **`from_email`**. Prefer explicit **`from_email`** in binding for clarity. |
| **`env:…` names referenced in `secret_ref`** | Must exist on backend (e.g. **`STAGING_TWILIO_AUTH_TOKEN`**). |
| **`TWILIO_*`** (legacy) | Only for **`legacy_global_twilio`** / legacy pipeline — **avoid** as sole tenant staging model (`Communications.txt` Card 1.5). |

---

## 7. External setup — Resend (staging)

1. Create Org / staging project on Resend.
2. Add and verify DNS for a **staging** sending domain (SPF/DKIM per Resend UI).
3. Create **staging** API key → store in **Render** as `RESEND_API_KEY` or `env:…` name matching **`secret_ref`**.
4. Choose **`from_email`** only on verified domain root (e.g. `no-reply@staging.mail.example.com`).
5. (Optional) Add receiving routes only if inbound email is in scope later — **SMS/Webhooks are Twilio-centric** today.

---

## 8. External setup — Twilio (staging)

1. Create/access **staging** Twilio account or sub-project.
2. **Messaging Service:** create SMS-capable Messaging Service → note **`MG…`** SID.
3. **Account SID:** `AC…` → put in **`config.twilio_account_sid`** (non-secret identifier).
4. **Auth token:** set only in **Render** env; referenced by **`secret_ref`** → **`env:…`**.
5. **Inbound webhook URL (binding-deterministic routing):**

   **`POST https://<BACKEND_STAGING_ORIGIN>/sms/inbound/<BINDING_UUID>`**

   Replace **`<BINDING_UUID>`** with the **`communication_provider_bindings.id`** for that Twilio binding (see **`backend/app/routes/sms_inbound.py`**). Legacy **`POST …/sms/inbound`** remains for backward compatibility — **prefer binding-scoped URL** per `Communications.txt` deterministic routing doctrine.
6. **`inbound_to_e164`** in DB: set to the staging number’s **E.164** that Twilio POSTs as **`To`** (aligns matcher **`find_binding_by_inbound_to`**).

---

## 9. `GET /api/admin/communications/bindings` — behavior when rows exist

**Handler:** `web/app/api/admin/communications/bindings/route.ts`.

- **Auth:** Admin/ops **`requireAdminOrOps`**; **`getAdminContext()`** resolves **`ctx.orgId`**.
- **Query:** `.from('communication_provider_bindings').select(...) .eq('org_id', ctx.orgId)` ordered by **`updated_at`** desc.
- **Response:** JSON with:
  - **`bindings`** — sanitized list (**no plaintext secrets**). Each item includes **`from_email_hint`** (trimmed **`config.from_email`**), **`inbound_to_e164`** if set, **`ready_for_composer`** ( **`true`** if **`secret_ref`** is present and **`not equal to `unconfigured`** **case-insensitive** ),
  - **`channels_available`** — derives **`sms`** / **`email`** / **`in_app`** (`composerChannels.ts`: email needs **`provider === 'resend'`** + non-unconfigured **`secret_ref`** ; SMS needs non-unconfigured **`secret_ref`** ),
  - **`selectable_by_channel`** — **`activeOutboundBindings`** subsets for **`sms`** and **`email`**,
  - **`permission_stub`** (`communications.send` note).

Binding rows with **`secret_ref='unconfigured'`** appear in **`bindings`** but **do not** enable **`sms`/`email`** in **`channels_available`**.

---

## 10. What is still blocked before “real sending” end-to-end

Even with bindings + secrets:

| Gate | Detail |
|------|--------|
| **Queued canonical rows** | **`process_communication_messages`** consumes **`communication_messages`** with **`direction=outbound`** and **`status=queued`**. Rows must exist (composer/send API/workflow enqueue) with valid **`thread_id`** and **`org_id`. |
| **`COMMUNICATION_DUAL_WRITE` intentionally off** | Legacy **`public.messages`** may still be primary for some mirrors; canonical path is separate. Do **not** flip dual-write unless staging experiment is approved (`provider-setup-runbook.md`). |
| **Binding completeness — SMS** | **`twilio_account_sid`**, **`messaging_service_sid`**, **`resolve_secret_plaintext(secret_ref)`** must all succeed or send raises **“SMS binding incompletely configured”**. |
| **Binding completeness — email** | **`provider`** must **`resend`**; API key plaintext non-empty (**binding `secret_ref`** or **`env:RESEND_API_KEY`** fallback). |
| **`to_address`** | Outbound canonical rows must have recipient **`to_address`** populated (`communication_message_sender.py`). |
| **Thread validity** | Thread must **`primary_entity_id`** non-empty or message marked **failed**. |
| **Cron / triggers** | **`INTERNAL_MESSAGES_PROCESS_URL`** + token must successfully hit backend processor on schedule or manual invocation. |

---

## What to do next (staging sequencing)

1. Replace placeholders; run **`INSERT`** for Resend + Twilio bindings for **staging `org_id`** (and **`location_id`** if testing location precedence).
2. Set **backend** secrets on **Render staging** (**Resend API key**, **Twilio auth token** env referenced by **`secret_ref`**).
3. Configure Twilio webhook → **`/sms/inbound/{binding_uuid}`**.
4. Set **web staging** (**Vercel**) internal process URL/token if admin triggers dispatcher.
5. Open admin → verify **`GET /api/admin/communications/bindings`** shows bindings, **`channels_available`** includes **`sms`** / **`email`** as expected.
6. Run **one** outbound test (**staging recipient only**) via approved composer/send path once queue + worker validated.
7. **Do not enable `COMMUNICATION_DUAL_WRITE`** until explicitly approved.

---

*Cross-link: foundational env notes remain in **`provider-setup-runbook.md`;** INSERT examples also in **`seed_bindings_placeholder.sql`**.
