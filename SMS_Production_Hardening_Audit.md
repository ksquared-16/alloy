# Communications V2 — SMS Production Hardening Audit (P3 / P3.1 / P4)

Read-only audit. No code changed. Baseline `6d0dd2b7` (P1/P2/P6 green, 41 files / 225 tests).

**One thing to fix in your mental model up front:** SMS spans **two stacks**. Inbound + outbound *send* are **Python** (`backend/`); the delivery-status webhook is **TypeScript** (`web/app/api/webhooks/twilio/sms-status/route.ts`). They resolve Twilio auth differently. The multi-tenant gap you flagged is **only in the TS status-callback route** — the Python inbound route already resolves per-binding tokens.

---

## 1. Twilio Production Hardening audit (P3)

### 1.1 Current binding-resolution path
`communication_message_sender.process_communication_messages` (outbound worker):
1. If the message row carries `communication_provider_binding_id` → `find_binding_by_id` (explicit binding).
2. Else → `resolve_outbound_binding(org_id, channel, location_id, user_id)`.

`resolve_outbound_binding` (`binding_resolver.py`) fetches active bindings for `(org_id, channel)` and applies precedence **user → location → org → primary**, exactly as specified:
- `user` scope: matched only if `scope='user'` rows exist (stubbed; none today → no-op).
- `location` scope: `scope='location'` AND `location_id == send location` → `_prefer_primary`.
- `org` scope: `scope='org'` with no `location_id` → `_prefer_primary`.
- Fallbacks: any `scope='org'`, then any row.

The bindings table already supports this (`scope ∈ {org,location,user}`, `location_id`, `is_primary`, partial indexes on `(org_id, location_id, channel, scope)`). **No schema gap.**

### 1.2 How auth tokens are resolved (send)
`secret_ref.py` keeps no plaintext in the DB. Conventions:
- `legacy_global_twilio` → use process env (`send_sms` with settings `TWILIO_*`).
- `env:VAR_NAME` → `os.getenv(VAR_NAME)` → `send_sms_with_credentials(account_sid, auth_token, messaging_service_sid)` where `account_sid`/`messaging_service_sid` come from `binding.config` and the token from the env var.
- `unconfigured` / unknown → refuse.

So **per-tenant outbound auth already works** through `config.twilio_account_sid` + `config.messaging_service_sid` + `secret_ref='env:…'`.

### 1.3 Can webhook verification resolve the auth token from the binding?
**Inbound (Python `sms_inbound.py`): YES, already.** `resolve_inbound_twilio_auth_token(binding_row)` uses the binding's `secret_ref` (`env:*` → resolved token; `legacy_global_twilio`/empty → global) before `RequestValidator`. The bound route `/sms/inbound/{binding_id}` loads the binding first, so it verifies against the **subaccount** token. The legacy `/sms/inbound` route has no binding context → verifies with the **global** token.

**Status callback (TS `sms-status/route.ts`): NO.** It reads `process.env.TWILIO_AUTH_TOKEN` only — a single global token. This is the real P3 gap: a subaccount-signed status callback fails verification (403) unless the subaccount happens to share the global token. The handler *parses* `MessageSid` but does not resolve the message → binding → secret before verifying, so it cannot select the right token.

### 1.4 Do location-level bindings work end-to-end?
**Resolution: yes.** `resolve_outbound_binding` honours `scope='location'` + `location_id`, and `process_communication_messages` resolves the send's `location_id` (`resolveContextLocationId` on the enqueue side).
**Sending: yes**, provided each location binding's `config` carries its own `twilio_account_sid` + `messaging_service_sid` and an `env:*` `secret_ref`.
**Status callbacks: no (broken for non-global subaccounts)** — see 1.3 and §2.
**Inbound: yes for the bound URL** (`/sms/inbound/{binding_id}` matched on `inbound_to_e164`), **partly for the legacy URL** (works only when exactly one active SMS binding matches the Twilio `To`; ambiguous/none → legacy-only, no canonical persistence).

### 1.5 Recommended implementation (P3)
1. **Per-tenant status-callback verification (TS route).** Before signature check: parse `MessageSid` → look up `communication_messages` by `provider_message_id` → read its `communication_provider_binding_id` → load the binding → resolve the token from `secret_ref` (mirror `resolve_inbound_twilio_auth_token`), falling back to global. Verify against the resolved token. Keeps global sandbox working; closes the subaccount gap. (Requires a small TS equivalent of `secret_ref` resolution for `env:*`.)
2. **Bind the callback to a known binding (preferred, see §2).** Send a per-message `statusCallback` ending in `/{binding_id}` (or `?binding_id=`) so the handler resolves the binding **without** a DB round-trip and before it has a verified `MessageSid`.
3. **Keep the legacy global path** as the fallback for `legacy_global_twilio` bindings and the sandbox.

### 1.6 Risk assessment (P3)
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Subaccount status callbacks rejected (403) → receipts never advance past `sent` | High once any subaccount is used | High (silent — looks like non-delivery) | Per-tenant verification (1.5.1) + `/{binding_id}` callback (1.5.2) |
| Token resolution duplicated across Py/TS drifts | Medium | Medium | Single documented convention; TS resolver mirrors `secret_ref.py`; unit-test parity |
| Reading the binding before verifying = unauthenticated DB lookup | Low | Low | Lookup is read-only, indexed, by opaque SID; no mutation pre-verify |
| Misconfigured binding (`config` missing SID/`env:` unset) | Medium | Medium (send raises today) | Pre-flight binding validation + readiness checklist §6 |

---

## 2. Status Callback Reliability audit (P3.1)

### Findings
- **`statusCallback` is NOT passed per message.** Both `send_sms` and `send_sms_with_credentials` call `client.messages.create(body, messaging_service_sid, to)` with **no `status_callback`**. There is no `TWILIO_STATUS_CALLBACK*` setting anywhere.
- **Delivery callbacks therefore depend entirely on Messaging Service console config** (the MG service's "Delivery Status Callback URL"). If that field is blank, **no `queued/sent/delivered/failed/undelivered` events arrive** — receipts stall at the synchronous `queued`/`sent` returned by the send call.
- **Different Messaging Service SID per location = silent divergence.** Each location binding can carry its own `messaging_service_sid`. Status delivery for that location depends on *that* MG service's console callback being set correctly. Adding a location ⇒ a manual Twilio-console step that is easy to forget and invisible until receipts go missing. There is no per-message override compensating for it.

### Recommended canonical approach
**Pass `statusCallback` explicitly on every outbound `messages.create`.** Add a `status_callback` parameter to both send functions and have the sender compute it from a single base setting, suffixed with the binding id:

```
{PUBLIC_TWILIO_STATUS_CALLBACK_BASE}/api/webhooks/twilio/sms-status/{binding_id}
```

Rationale: per-message `statusCallback` overrides/augments MG-service config, is independent of console state, works identically across locations and Messaging Services, and the `{binding_id}` suffix lets the TS route resolve the verification token (P3.1 and P3 close together). The TS route must accept the optional `{binding_id}` path segment (additive; the bare path stays valid for the sandbox).

**Goal state:** every outbound SMS deterministically emits `queued → sent → delivered` (or `failed`/`undelivered`) into `communication_delivery_events` + `communication_message_recipients` via the P2 helper — regardless of console configuration or which Messaging Service the location uses.

---

## 3. SMS Inbound audit (P4)

### Existing behavior (works today)
- **Two routes** (`sms_inbound.py`): `/sms/inbound/{binding_id}` (deterministic org) and `/sms/inbound` (legacy; canonical only when one active SMS binding matches Twilio `To`).
- **Kill switch + signature**: `COMMUNICATIONS_SMS_INBOUND_ENABLED` gate; `X-Twilio-Signature` validated via `RequestValidator` with a binding-resolved (bound route) or global (legacy) token; signature URL overridable via `COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL` (proxy-safe). Missing token/sig → 403.
- **Dual write**: always inserts legacy `public.messages`; additionally `persist_inbound_communication_sms` into `communication_*` when org resolvable.
- **Person matching** (`communication_inbound.py`): `persons.phone == normalize_phone(From)` within org → **exactly one** ⇒ `persons` + person_id; **zero** ⇒ `communications_unknown` surrogate (`unknown_sender`); **multiple** ⇒ `communications_unknown` ambiguous surrogate + `candidate_person_ids` (no guessing; deterministic uuid5; capped at 22).
- **Thread routing**: `_row_exists_or_create_thread` upserts on the canonical identity `(org, primary_entity_type, primary_entity_id, channel='sms', recipient_key=normalized From)` (matches the table's `communication_threads_identity_uq`).
- **Message**: inbound `communication_messages` row, `status='delivered'`, `provider='twilio'`, `provider_message_id=MessageSid`, resolution metadata; emits `message_received` workflow event.

### Validation against the five required behaviors
1. **Family routing** — ✅ via person→customer (a single-person match anchors `persons/person_id`, which the Family Workspace resolves to the family). ⚠️ **unknown/ambiguous senders land in `communications_unknown` surrogate threads that the Family Communication Workspace does not load** (it queries customer/person/opportunity threads) — they exist but are invisible in the workspace (an "unknown bucket" with no surfacing).
2. **Thread routing** — ✅ deterministic + idempotent on canonical identity. ⚠️ **parity caveat:** inbound always anchors on `persons`; an **outbound** SMS anchored on `opportunities`/`jobs` produces a *different* thread row. The Family Workspace merges them into one unified timeline (so the UI looks correct), but they are distinct thread rows with independent `unread`/`last_activity`. Phone normalization is consistent (web `normalizeRecipientKeySms` ≈ Python `normalize_phone` for US numbers).
3. **Recipient matching** — ✅ person-first by normalized phone, org-scoped, with explicit zero/one/many handling.
4. **Unread creation** — ✅ **by construction**: P6 unread = absence of a `communication_message_reads` row, so a new inbound is unread for every viewer with no extra write. ⚠️ no thread-level `attention_state`/needs-response flag is set on inbound.
5. **Last-activity updates** — ⚠️ **inbound does NOT update `communication_threads.last_message_at`.** The Family Workspace is shielded by the **P6 fallback** (`lastActivityAt = last_message_at ?? max(message.created_at)`), so the workspace orders correctly. But the **inbox** service and anything reading `thread.last_message_at` directly (it sorts on it) will see stale ordering for inbound-only activity.

### Gaps / edge cases / required fixes (no redesign)
| # | Gap | Severity | Required fix (minimal) |
|---|---|---|---|
| G1 | Inbound reply does **not set `replied_at`** on the prior outbound message/recipient (UI-5H reply indicator never lights) | High | On inbound persist, find the latest outbound message in the matched thread and stamp message + recipient `replied_at` (reuse the P2 helper's recipient update). |
| G2 | Inbound does **not bump `communication_threads.last_message_at`** | Medium | Patch the thread's `last_message_at` (and `updated_at`) on inbound insert. |
| G3 | Unknown/ambiguous surrogate threads not surfaced in the Family Workspace | Medium | Out of scope to redesign; document as the unknown bucket. Optionally add an org-level "unknown SMS" surfacing later. |
| G4 | Outbound `opportunities`/`jobs` anchor vs inbound `persons` anchor → split thread rows | Low–Med | Accept (timeline merges) **or** normalize the inbound anchor to the outbound thread when a recent outbound thread for that phone exists. Decision needed; do **not** redesign now. |
| G5 | Legacy `/sms/inbound` silently skips canonical persistence on ambiguous/zero `To` match | Low | Already logged; ensure all production numbers use the bound `/{binding_id}` URL (checklist §6). |
| G6 | No `attention_state` set on inbound (needs-response signal) | Low | Optional: set thread `attention_state='needs_response'` on inbound; defer if it risks BOS/UI assumptions. |

**Note:** G1 and G2 are the two that materially affect the P6 read-model you just shipped. Recommend they are the core of the P4 implementation; G3/G4/G6 are decisions/deferrals, not redesigns.

---

## 4. Location-level binding recommendation (Provider Architecture Decision)

**Recommendation: support both org-level and location-level sender identities within a single tenant — do NOT create separate tenants per location.**

The schema and resolver already support it:
- `communication_provider_bindings.scope ∈ {org, location, user}`, `location_id`, `is_primary`, `config`, `secret_ref` — all present.
- `resolve_outbound_binding` precedence **user → location → org → primary** already selects the most specific active binding for the send's location.
- Inbound already maps a Twilio `To` number to its binding/org via `inbound_to_e164`.

So Location A (`locationa@company.com` / `+15551234567`) and Location B (`locationb@company.com` / `+15557654321`) are modeled as two `scope='location'` rows (one per channel each) under the **same org**, with an optional `scope='org'` default as fallback. Email uses the location binding's sender; SMS uses the location binding's `messaging_service_sid` + number.

What's required to make it production-true (none of it new schema):
1. **Status callbacks per location** (§2) — the only thing that breaks today when locations use different Messaging Services.
2. **Per-tenant status-callback verification** (§1.5) for subaccount tokens.
3. **Inbound bound URL per number** — set each location number's Twilio webhook to `/sms/inbound/{that binding's id}`.
4. **No UI for `user` scope** — keep it stubbed (resolver already no-ops).

Separate tenants would duplicate org data and break the family/household model; the binding model is the correct abstraction and is already most of the way there.

---

## 5. Production-readiness checklist (SMS)

**Config / infra**
- [ ] `PUBLIC_TWILIO_STATUS_CALLBACK_BASE` (new) set to the public origin Twilio reaches.
- [ ] Outbound sender passes per-message `statusCallback = …/api/webhooks/twilio/sms-status/{binding_id}`.
- [ ] TS status route accepts optional `/{binding_id}` and resolves the verification token per-binding (global fallback).
- [ ] Each location SMS binding `config` has `twilio_account_sid` + `messaging_service_sid`; `secret_ref='env:…'` with the env var set; or `legacy_global_twilio` for the shared sandbox account.
- [ ] Every production inbound number's Twilio webhook → `/sms/inbound/{binding_id}` (not the bare legacy URL).
- [ ] `COMMUNICATIONS_SMS_INBOUND_ENABLED=1`; `COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL` set if behind a proxy.

**Behavior**
- [ ] Outbound SMS emits `queued→sent→delivered` (or `failed`/`undelivered`) into `communication_delivery_events` + `communication_message_recipients` (P2), independent of MG-service console config.
- [ ] Inbound reply persists, threads to the matched person, sets thread `last_message_at` (G2), and stamps the prior outbound `replied_at` (G1).
- [ ] New inbound is unread (no `communication_message_reads` row) and surfaces in the Family Workspace unread rollup (P6).
- [ ] Unknown/ambiguous senders go to the surrogate bucket without 5xx and without retry storms (Twilio gets `<Response></Response>`).
- [ ] Duplicate status callbacks dedupe (P2 idempotency by `(provider, provider_event_id)`).

**Security**
- [ ] No plaintext secrets in `config`; tokens only via `env:*`.
- [ ] Signature verified before any canonical write on both routes (per-tenant token).
- [ ] No tokens/phone numbers/bodies in logs (current masking preserved).

---

## 6. Detailed implementation plan (for approval — not started)

Sequenced smallest-safe; each its own checkpoint + bundle; keeps 225 green; no UI/BOS/Announcements.

**P3.1 — Outbound statusCallback (Python)** *(do first; unblocks all receipt verification)*
1. Add `status_callback: str | None` to `send_sms` + `send_sms_with_credentials`; pass to `messages.create` when set.
2. New setting `PUBLIC_TWILIO_STATUS_CALLBACK_BASE`; sender builds `…/sms-status/{binding_id}` from the resolved binding id.
3. Tests: callback URL built per binding; omitted when base unset (sandbox still works via console config).

**P3 — Per-tenant status-callback verification (TS)**
4. TS route accepts optional `/{binding_id}` segment (additive route file) or `?binding_id=`.
5. TS token resolver mirroring `secret_ref` (`env:*` → `process.env`; `legacy_global_twilio`/empty → global). Resolve binding from path → token; fallback to global.
6. Tests: subaccount token path verifies; global/sandbox path unchanged; unknown/missing binding → global fallback; bad signature → 403.

**P4 — Inbound read-model correctness (Python)**
7. G2: patch thread `last_message_at`/`updated_at` on inbound persist.
8. G1: locate latest outbound message in the matched thread; stamp `replied_at` on the message + its recipient row (reuse P2 receipt semantics).
9. Tests: inbound updates last activity; reply stamps prior outbound; unknown/ambiguous unchanged (still surrogate, still 200); idempotent on duplicate `MessageSid`.

**Decisions to confirm before coding** (no redesign either way): G4 (split opportunity/person threads — accept vs normalize) and G6 (set `attention_state` on inbound — yes/defer). G3 unknown-bucket surfacing stays deferred.

**Email inbound: explicitly NOT in this plan** — separate sprint after SMS is proven in the Twilio sandbox.

---

## 7. Sandbox Validation Plan (P4.1)

Exact steps to prove outbound status, delivered receipts, inbound replies, family-thread updates, and unread indicators in the Twilio sandbox. (Steps that depend on the P3.1 `statusCallback` change are marked **[needs P3.1]**; until then, configure the callback URL on the Messaging Service in the console as the interim path.)

### Required Twilio settings
- A trial/sandbox **Account SID + Auth Token**, one **Messaging Service (MG…)** with a sandbox number attached.
- **Messaging Service → Integration → Delivery Status Callback URL**: `https://<public-host>/api/webhooks/twilio/sms-status` (interim, until per-message `statusCallback` lands).
- **Inbound**: the number's (or Messaging Service's) **Inbound webhook** → `https://<public-host>/sms/inbound/<binding_id>` (HTTP POST). Use the bound URL, not the bare legacy path.
- Public tunnel (ngrok/Cloudflared) if testing locally; note the exact origin (must match signature URL).

### Required Alloy settings
- Backend env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `COMMUNICATIONS_SMS_INBOUND_ENABLED=1`, and `COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL=https://<public-host>` (must equal the tunnel origin).
- Web env: `TWILIO_AUTH_TOKEN` (for status-route verification today) and `PUBLIC_TWILIO_WEBHOOK_BASE_URL=https://<public-host>`.
- A `communication_provider_bindings` row: `channel='sms'`, `provider='twilio'`, `scope='org'`, `status='active'`, `is_primary=true`, `inbound_to_e164=<sandbox number in E.164>`, `config={twilio_account_sid, messaging_service_sid}`, `secret_ref='legacy_global_twilio'` (sandbox) — note its `id` for the inbound URL.
- A test family: a `customers` row with a `persons` row whose `phone` = the mobile you'll text **from**, in E.164.
- Flags for viewing: `NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER=1`, `NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE=1` (restart dev server — `NEXT_PUBLIC_*` inline at boot).

### Exact test sequence
1. **Outbound send.** From the Family Workspace (or `POST /api/admin/communications/family-send` with `confirm:true`), send an SMS to the test person. Expect a `communication_messages` row, `provider='twilio'`, `provider_message_id=SM…`, `status` `queued`/`sent`.
2. **Status callbacks → receipts. [needs P3.1 for guarantee]** Within seconds, confirm `communication_delivery_events` has `sent` then `delivered` rows for that `provider_message_id` (idempotent — replaying a callback adds no duplicate), and `communication_message_recipients` shows `sent_at`/`delivered_at` + `status='delivered'`. The workspace timeline badge flips Sent → Delivered (UI-5H).
3. **Delivered receipt failure path.** Send to an invalid/unreachable number → expect a `failed`/`undelivered` event and `recipient.status='failed'`, badge shows Failed.
4. **Inbound reply.** From the test mobile, text the sandbox number. Expect: `<Response></Response>` 200 to Twilio; a new inbound `communication_messages` row (`direction='inbound'`, `status='delivered'`) on the **same person thread**; `message_received` workflow event.
5. **Family thread update.** Reload the Family Workspace → the inbound appears in the unified timeline; **last activity reflects the inbound** (works via P6 fallback even before G2; after G2 the thread row's `last_message_at` also updates).
6. **Unread indicator.** Before opening the thread, the family unread rollup (`healthSummary.unreadCount`) and the thread `unread` count include the new inbound. Mark read (a `communication_message_reads` row) → unread drops to 0.
7. **Reply indicator. [needs P4/G1]** After the inbound, the prior outbound shows `replied` (UI-5H) once `replied_at` stamping lands.
8. **Unknown sender.** Text the sandbox number from a phone **not** on any person → 200, no canonical person thread (surrogate `communications_unknown`), legacy `public.messages` still inserted, no 5xx/retry.
9. **Ambiguous sender.** Put the same phone on two `persons` rows → inbound resolves to the ambiguous surrogate with `candidate_person_ids`, no guessing, 200.
10. **Signature negative test.** POST to `/sms/inbound/<binding_id>` with a bad `X-Twilio-Signature` → 403, nothing persisted.

Pass criteria: steps 1–6 and 8–10 green on current code; 2/3/7 fully green after P3.1 + P4 land (the purpose of this sprint).
