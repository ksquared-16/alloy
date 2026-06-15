# UI-5F — Send Architecture Review (no implementation)

Locks the send architecture before code. Grounded in the existing path: `POST /api/admin/communications/send` → `executeCommunicationsSend({ recipientPersonIdRaw, entityType, entityId, channel, subjectRawEmail, ... })` (single recipient; consent via `enforceConsentForSend` when `comms_v2_compliance` on), receipts on `communication_message_recipients` + `communication_delivery_events`, threads keyed `(org, primary_entity_type, primary_entity_id, channel, recipient_key)`.

## Recommended architecture (summary)

The UI submits **one logical family message**; a new **family-send orchestrator fans out** to per-recipient sends by **reusing `executeCommunicationsSend` unchanged** (one call per recipient). Each recipient send is **person-anchored** (`entity_type=persons`, `entity_id=recipient_person_id`) → its own transport thread (matches the "one thread per recipient/channel" doctrine), and the family timeline **merges** them via the existing `aggregateFamilyThreads`. Consent is enforced **per recipient/channel/category before each send**; blocked/ineligible recipients are returned with reasons. Partial success is first-class. No new transport, no schema change for v1.

---

## 1. Multi-recipient send

**Yes — one logical family message that fans out internally.** The composer submits `recipient_person_ids[]` + `channel` + `subject` + `body` + customer context. The orchestrator loops `executeCommunicationsSend` once per recipient (it already produces a per-recipient/channel thread + message). Rationale: zero new transport code, reuses the consent/eligibility/thread logic, and the existing `composerModel.buildSendPayloads` already fans out per recipient. The operator's mental model stays "one message to the family."

## 2. Thread storage — doctrine confirmed

- **UI:** one unified family conversation (the merged timeline).
- **Transport:** recipient/channel-specific threads, created on demand via the existing thread identity key (`primary_entity person` + `channel` + `recipient_key`). No new thread model.
- **Family timeline:** `aggregateFamilyThreads` (UI-5B) unions the family's threads (customer + each family person + opportunities) into one chronological view. Selecting a thread filters to that sub-conversation. **No change required** — this is exactly what 5B built.

## 3. Send route shape (proposed contract)

New, additive endpoint (keep `POST /send` untouched for single/quick sends). Dark behind `comms_v2_command_center`; consent enforced when `comms_v2_compliance` on.

`POST /api/admin/communications/family-send`
```jsonc
// request
{
  "customer_id": "uuid",                 // family/customer context (required)
  "recipient_person_ids": ["uuid", ...], // 1..N selected eligible recipients
  "channel": "email" | "sms" | "note",
  "subject": "string | null",            // required for email
  "body": "string",
  "reply_to_thread_id": "uuid | null",   // when replying within a selected thread
  "confirm": true,                        // REVIEW-FIRST: send only when true; absent/false => dry-run preflight
  "client_token": "uuid"                 // idempotency (dedupe double-submits)
}
// 200 response
{
  "mode": "preflight" | "sent",
  "results": [
    { "recipient_person_id": "uuid", "ok": true,  "thread_id": "uuid", "message_id": "uuid", "status": "queued" },
    { "recipient_person_id": "uuid", "ok": false, "code": "consent_blocked" | "no_address" | "provider_error", "reason": "..." }
  ],
  "summary": { "requested": 2, "sent": 1, "blocked": 1, "failed": 0 }
}
```
- **Review-first:** no `confirm:true` ⇒ **preflight only** — returns per-recipient eligibility/consent decisions (who would send, who's blocked and why) with **zero sends**. The UI shows this, operator clicks Send → same payload with `confirm:true`. Mirrors the "review-first, no auto-send" lock.
- **Idempotency:** `client_token` recorded in message metadata to dedupe retries.
- `note` channel = internal note (no provider, no consent), single internal thread.

## 4. Consent enforcement (mapping)

Evaluated **before send, per recipient, per channel, per category**, reusing `enforceConsentForSend` → `evaluateConsent`:

| Dimension | Source |
|---|---|
| When | In the orchestrator, **before** each recipient's `executeCommunicationsSend` (and in preflight). |
| Per recipient | loop over `recipient_person_ids[]`. |
| Per channel | `channel` → `enforceConsentForSend({ channel })`. |
| Per category | default = channel **transactional**; **marketing** category + lifecycle + promo override when the send is classified marketing (announcements path, not here). |
| Lifecycle | from the family VM (`family.lifecycleStage`, derived from customer/opportunity). |
| Disabled vs blocked | **disabled** (no address / provider not configured) caught by `buildChannelEligibility` (UI-5A) and returned with `code:"no_address"`/`"email_not_configured"`; **blocked** (opted out) caught by `evaluateConsent` with `code:"consent_blocked"`. Both surfaced per recipient with reasons; neither sends. |

Enforcement is active only when `comms_v2_compliance` is on (matches existing `executeCommunicationsSend` behavior); otherwise consent is passive (UI still shows eligibility, no hard block) — flag-gated rollout.

## 5. Delivery & receipts (store / return)

Reuse existing tables — **no schema change**:

| State | Stored | Set by |
|---|---|---|
| queued | `communication_messages.status='queued'` | `executeCommunicationsSend` (synchronous) |
| sent | `communication_messages.status='sent'`, `sent_at` | send path / provider adapter |
| failed | `communication_messages.status='failed'`, `error` | send path on provider error |
| delivered | `communication_message_recipients.delivered_at` + `communication_delivery_events(event_type='delivered')` | **provider webhook ingestion (deferred infra)** |
| opened/read | `communication_message_recipients.opened_at` + delivery event `opened` | webhook ingestion |
| replied | `communication_message_recipients.replied_at` (+ inbound message) | inbound route / `selectOutboundToMarkReplied` |

Returned to UI: `TimelineEventVM` gains real `deliveredAt/openedAt/repliedAt` once the **receipts join** (left null in 5B) is added — additive, no schema. v1 of send returns `queued`/`sent`/`failed` synchronously; delivered/opened/replied populate as ingestion lands. **Webhook ingestion (Resend/Twilio → delivery_events → recipients) is the one infra dependency** and is out of UI-5F/5G scope (documented).

## 6. Draft behavior

**Client-only for v1** (To/Subject/Body already client state in UI-5E). Persisted drafts are deferred — they'd require a `communication_drafts` table (a migration) + autosave; not justified yet. Decision: keep client-only; revisit if operators ask for cross-session drafts.

## 7. Failure behavior (Mom ✓ / Dad ✗)

**Partial success, per recipient — no all-or-nothing rollback** (each recipient is an independent transport send). UI shows a per-recipient result row: *Mom — Sent ✓*, *Dad — Failed: provider error ✗ [Retry]* or *Dad — Blocked: opted out of email*. The message appears in the merged timeline for successful recipients; failed/blocked recipients get an inline reason + a **Retry just this recipient** affordance (re-calls family-send with that single id). The composer keeps the draft until at least one success (or operator dismisses). `summary` drives a banner ("1 sent, 1 blocked").

---

## Exact route changes

- **NEW** `POST /api/admin/communications/family-send` (preflight + send). Dark behind `comms_v2_command_center`; consent active under `comms_v2_compliance`.
- **UNCHANGED** `POST /api/admin/communications/send` (single/quick) and `GET …/threads/[id]/messages`, `GET …/family-workspace`.

## Exact functions / files to edit (when implemented — UI-5G)

| File | Change |
|---|---|
| `app/api/admin/communications/family-send/route.ts` | **NEW** — auth, validate, call orchestrator (preflight/confirm). |
| `lib/communications/v2/familyWorkspace/sendFamilyMessage.ts` | **NEW** — orchestrator: resolve send context per recipient, run consent preflight, loop `executeCommunicationsSend`, aggregate `results`/`summary`. |
| `lib/communications/v2/familyWorkspace/resolveRecipientSendContext.ts` | **NEW (pure)** — `recipient_person_id` (+ family VM) → `{ entityType:"persons", entityId, recipientPersonId, reply_thread_id? }`. |
| `lib/communications/v2/familyWorkspace/types.ts` | add `SendRecipientResult`, `FamilySendResult`. |
| `lib/communications/executeCommunicationsSend.ts` | **NO CHANGE** (reused as-is, one call per recipient). |
| `lib/communications/v2/consentEnforcement.ts` | **NO CHANGE** (reused for per-recipient preflight). |
| `app/adminV2/communications/CommandCenterShell.tsx` | wire `Send now` → preflight → confirm; render per-recipient results + Retry; flag-gated `comms_v2_live_workspace`. |
| `app/adminV2/communications/index`/flags | reuse `comms_v2_compliance` for enforcement; no new flag required. |

## Tests needed

- `resolveRecipientSendContext.test.ts` (pure) — person → send context; reply-thread mapping; missing person.
- `sendFamilyMessage.test.ts` — orchestrator with **mocked `executeCommunicationsSend` + consent**: all-eligible success; one consent-blocked; one no-address; partial success summary; preflight performs no sends; idempotency token passthrough.
- `familySendRoute.test.ts` (light) — 400 (bad customer_id / empty recipients / email without subject), 404 (customer not in org), envelope shape, preflight vs confirm.
- Existing 5A–5E suites unaffected.

## Migration needs

**None for v1.** All states use existing columns/tables. Optional, later & additive (no UI-5G blocker): (a) `communication_drafts` table only if persisted drafts are adopted; (b) provider webhook ingestion to populate `delivered/opened` (no schema — writes existing `delivery_events`/`recipients`).

## Implementation sequence (UI-5G, on approval)

1. `resolveRecipientSendContext` (pure) + tests.
2. `sendFamilyMessage` orchestrator (preflight + send, partial results) + tests with mocked send/consent.
3. `family-send` route (dark) + route tests.
4. CommandCenterShell wiring: Send → preflight modal/inline → confirm → per-recipient results + Retry (flag-gated).
5. (Separate, infra) receipts join for `delivered/opened/replied` + provider webhook ingestion.

## Open decisions to confirm before UI-5G

1. **Per-recipient person-anchored threads** (recommended) vs a single customer-anchored thread for all recipients — recommend per-recipient (matches transport identity + doctrine; merged in UI).
2. **Preflight as a dry-run on the same endpoint** (recommended) vs a separate `/family-send/preflight`.
3. **Consent under `comms_v2_compliance`** (recommended; passive until enabled) vs hard-on for family-send.
4. Reply semantics: a reply with the thread selected targets **that thread's single recipient/channel** (recommended) — confirm vs allowing reply to add recipients.
