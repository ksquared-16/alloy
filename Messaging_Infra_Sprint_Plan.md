# Communications V2 — Messaging Infrastructure Sprint (Phase 0 audit + proposal)

Baseline `6a355028` (UI-6.1). **Read-only audit + plan. No code changed.** Propose the smallest safe sequence, then implement on approval (much of this is migrations + Python backend + live webhooks, which need your gate/sandbox to verify).

## 1. Current-state verification

| Area | Found | Implication |
|---|---|---|
| `communication_delivery_events` | **EXISTS** in repo (`20260611130000_comms_v2_delivery_events_receipts.sql`): `id, org_id, message_id, event_type, provider, occurred_at, payload`. | Cursor's "missing" = the comms_v2 migrations **aren't applied** to the inspected DB. Phase 1 = **additive ALTER**, not CREATE. |
| `communication_message_recipients` | **EXISTS** in repo (`20260611140000_comms_v2_preferences_recipients.sql`): `id, org_id, message_id, person_id, address, recipient_role, status, delivered_at, opened_at, clicked_at, replied_at, created_at, metadata`. | Same — additive ALTER. UI-5H already reads these. |
| `communication_messages` | `status, sent_at, delivered_at, error, provider, provider_message_id, metadata, …` | Delivery truth lives here today; we add per-recipient + event tables alongside (not replace). |
| `communication_provider_bindings` | `id, org_id, channel, provider, scope, location_id, user_id, inbound_to_e164, display_label, status, is_primary, config, secret_ref` | Already supports `org/location/user` scope. Phase 3 is resolver/precedence + callback + per-tenant auth, **no schema gap**. |
| Resend webhook | `web/app/api/webhooks/resend/route.ts` (166 ln): Svix verify (`RESEND_WEBHOOK_SECRET`), routes events → `applyOutboundProviderDeliveryPatch`. | Patches `communication_messages` only. Phase 2 = also write events + recipients. |
| Twilio status webhook | `web/app/api/webhooks/twilio/sms-status/route.ts` (231 ln): `X-Twilio-Signature` + **global `TWILIO_AUTH_TOKEN`** verify; patches messages. | Multi-tenant gap (global token). Phase 2 + Phase 3. |
| Shared apply helper | `web/lib/communications/providerDeliveryPersistence.ts` → `applyOutboundProviderDeliveryPatch` (lookup by `provider_message_id`, patch status/delivered_at). | **Single extension point** for Phase 2 — extend here and both webhooks benefit. |
| Python SMS | `backend/app/routes/sms_inbound.py`, `backend/app/integrations/twilio_client.py`, `backend/app/services/communications/binding_resolver.py`, `backend/tests/test_twilio_inbound_signature.py` | SMS inbound mostly implemented (Phase 4 = validate/harden). Need to check `twilio_client.send` sets `statusCallback` (Phase 3). |
| Email inbound | none | Phase 5 = new. |
| Tests | 37 comms test files (`web/tests/communications`, incl. `v2/`), with `commsV2DeliveryEventsSchema`, `commsV2DeliveryReceipts`, `providerDeliveryPersistence`, `commsV2InboundNormalization`. | Schema-contract tests assert columns → additive ALTERs must keep them green (verify they don't assert "exactly these columns"). |

**Headline reconciliation:** the receipt tables and webhook routes already exist; this sprint **extends** them. The biggest real gaps are (a) tables under-columned for full receipt truth, (b) webhooks don't persist events/per-recipient state, (c) Twilio multi-tenant auth + per-message `statusCallback`, (d) **email inbound entirely missing**.

## 2. Migration plan (additive only, safe for existing rows)

Two new additive migrations (no drops, no data loss; `ADD COLUMN IF NOT EXISTS`):

- **`communication_delivery_events`** add: `recipient_id uuid null`, `channel text null`, `provider_message_id text null`, `provider_event_id text null`, `event_status text null`, `received_at timestamptz default now()`, `raw_payload jsonb default '{}'`, `metadata jsonb default '{}'` (keep existing `payload`; new writes use `raw_payload`). **Idempotency:** `UNIQUE (provider, provider_event_id) WHERE provider_event_id IS NOT NULL` + index `(message_id, occurred_at)`.
- **`communication_message_recipients`** add: `recipient_key text null`, `channel text null`, `provider text null`, `provider_message_id text null`, `queued_at`, `sent_at`, `bounced_at`, `complained_at`, `failed_at`, `last_event_at timestamptz null`. Index `(org_id, provider_message_id)` + `(message_id)`.
- **Backfill (safe, idempotent):** one-time `INSERT ... SELECT` to create a `communication_message_recipients` row per existing `communication_messages` (recipient_key/address/provider/provider_message_id/status/sent_at/delivered_at from the message), `ON CONFLICT DO NOTHING`. No event backfill (events are forward-only).
- **Apply order:** ensure the 4 comms_v2 migrations are applied first (they create the base tables) — staging via the existing only-if-missing path; the two new ALTER migrations follow.

## 3. Files changed (proposed)

- `supabase/migrations/2026…_comms_v2_receipt_columns.sql` (new ALTERs + indexes + backfill).
- `web/lib/communications/providerDeliveryPersistence.ts` — extend: insert `communication_delivery_events` (idempotent) + upsert `communication_message_recipients` + keep message patch.
- `web/app/api/webhooks/resend/route.ts` — map the 8 Resend events → status/timestamps; call the extended helper.
- `web/app/api/webhooks/twilio/sms-status/route.ts` — map the 5 statuses; call the extended helper; per-tenant auth (Phase 3).
- `backend/app/integrations/twilio_client.py` — add `status_callback` (Phase 3).
- `backend/app/services/communications/binding_resolver.py` — confirm/extend precedence (Phase 3).
- `backend/app/routes/sms_inbound.py` — validate/harden (Phase 4).
- `web/app/api/webhooks/email-inbound/route.ts` (or provider receive route) — new (Phase 5).
- Read-model: `web/lib/communications/v2/familyWorkspace/{loadFamilyThreadsData,aggregateFamilyTimeline}.ts` — wire `unread` + `last_activity` from recipients/events (Phase 6).
- Tests across `web/tests/communications` + `backend/tests` (Phase 7).

## 4–7 (summarized; detail per phase above)

- **Receipts (P1/P2):** events table is the append-only truth (idempotent by `(provider, provider_event_id)`); recipients table is per-recipient rollup; messages keeps a convenience status. One helper writes all three.
- **Twilio hardening (P3):** (1) set per-message `statusCallback = ${PUBLIC_WEBHOOK_BASE}/api/webhooks/twilio/sms-status` (or `…/{binding_id}`) in `twilio_client.send`; (2) per-tenant auth — verify signature against the **binding's** subaccount token (resolve from `secret_ref`) instead of the global `TWILIO_AUTH_TOKEN`, falling back to global for sandbox; (3) binding-scoped callback URL only needed if subaccounts require it — recommend `/{binding_id}` suffix so the handler can resolve the right token before signature check.
- **Provider bindings recommendation:** keep precedence **user → location → org → primary** (schema already supports it). **Support location-level overrides without a separate tenant**: a location row (`scope='location'`, `location_id`) overrides the org default (`scope='org'`) for both email sender and Twilio number/service; resolver picks the most specific active binding for the send's location. Keep `user` scope **stubbed** (no UI). Keep global sandbox env behavior as the final fallback.
- **SMS reply (P4):** harden `/sms/inbound` + `/sms/inbound/{binding_id}` — signature, `inbound_to_e164` binding match, persistence, thread match, unknown/ambiguous → unknown bucket (200, no retry storm), set `replied_at` + thread `last_activity_at` + unread.
- **Email reply (P5):** new inbound route; verify provider signature; parse sender/recipient/subject/body/headers; thread match by **(1) provider thread header → (2) reply-to token/encoded thread id → (3) sender+family recipient → (4) unknown bucket**; create inbound `communication_messages`, attach to thread, set `replied_at`, update read model. (Recommend a signed reply-to token, e.g. `reply+<threadId>.<hmac>@inbound-domain`, set as `Reply-To` on outbound — small, safe, deterministic matching.)
- **Thread intelligence (P6):** compute `unread` (inbound messages without a viewer read / `last_read_at`), thread `last_activity_at`, family unread rollups, attention + reply indicators — feed the existing `FamilyCommunicationWorkspaceVM` (`ThreadVM.unread`, `healthSummary`); **no UI redesign** (the View already renders status/unread fields).

## 8. Tests to add/update

`web/tests/communications`: resend event persistence + recipient upsert; twilio status persistence; idempotent duplicate webhook (same `provider_event_id` → one event, one state); unknown `provider_message_id` → 200, recorded, no throw; binding resolver precedence (location override); twilio `statusCallback` URL generation. `backend/tests`: SMS inbound persistence + thread match + unknown/ambiguous; email inbound parse + thread match (if built); per-tenant signature. **Keep the existing suite green** (schema-contract tests must tolerate added columns — verify before ALTER).

## 9. Final QA (local + sandbox)

1. Apply migrations (comms_v2 base if needed, then receipt-column ALTERs); existing comms suite green (`npm run test -- tests/communications`).
2. **Resend sandbox:** send → trigger delivered/opened/bounced webhooks (Svix) → assert `communication_delivery_events` rows (idempotent), `communication_message_recipients` timestamps, `communication_messages.status`, and the workspace timeline status badge (UI-5H) flips Sent→Delivered→Opened.
3. **Twilio sandbox:** send with `statusCallback` → queued/sent/delivered/failed callbacks → same assertions; replay a duplicate callback → no second event.
4. **SMS inbound:** text the sandbox number → inbound message persisted, thread matched, `replied_at` + unread updated.
5. **Email inbound (if built):** send a reply to the reply-to token → matched + inbound message + `replied_at`.
6. **Bindings:** configure an org default + a location override → confirm the location send uses the override sender/number.

## Smallest safe implementation sequence (on approval)

1. **P1 migration** (additive ALTERs + indexes + backfill) — verify schema-contract tests still pass. *(Checkpoint.)*
2. **P2 persistence** — extend `providerDeliveryPersistence` + both webhook routes to write events + recipients (pure-mappable; unit-testable with mocked supabase). *(Checkpoint + tests.)*
3. **P6 read-model** — surface `unread`/`last_activity` into the VM (the View already renders them). *(Checkpoint.)*
4. **P3 Twilio hardening** — `statusCallback` + per-tenant auth + location-scope resolver. *(Checkpoint; needs sandbox.)*
5. **P4 SMS inbound** — harden + tests.
6. **P5 email inbound** — new route + reply-to token. *(Largest new surface; last.)*

Each step is flag-safe/additive, keeps the 51/51 (37 files) green, and touches no UI layout, BOS, or Announcements.

**Recommendation:** approve P1→P2→P6 first (the receipt truth + read-model that the UI-5H/5B work already expects — highest value, lowest risk, no Python). Then tackle P3→P4→P5 (provider hardening + inbound) as a second wave, since they need the Python backend and live sandbox credentials to verify. Awaiting go-ahead before coding.
