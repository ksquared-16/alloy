---
title: Phase 0 — Production Safety & Schema Repair — Implementation Contract
status: awaiting go / awaiting D3 + S-1 scope decision
date: 2026-07-30
evidence: PHASE-0-LIVE-VERIFICATION.md
---

# Phase 0 — Implementation Contract

**Scope:** P0-1 eligibility gate · P0-2 signed-URL authorization · P0-3 server-authoritative rendering · P0-4 `announcement_targets` repair.

**Two items must be resolved before I start:** **D3** (category vocabulary — P0-1 has no input without it) and **S-1** (a newly-discovered unauthenticated SMS surface, §0.2 — outside the scope you defined, so yours to scope in or out).

---

## 0. Findings that changed this contract after you wrote the direction

### 0.1 `executeCommunicationsSend` is not the floor — and its gate protects nothing today

The discovery report treated `executeCommunicationsSend.ts:113-124` as *the* consent gate. Verified: it is a **wrapper**, and the gate is inert for **four independent reasons**, any one of which alone would defeat it:

1. `comms_v2_compliance` is not in `CORE_COMMS_V2_FLAGS` (`v2/flags.ts:54-59`) → `resolveCommsV2Flag` returns `false` by default (`:70`). Dead code unless the env var is explicitly set.
2. It is **skipped when `recipient_person_id` is absent or non-UUID** (`:117-118`). `/api/admin/communications/send` accepts a free-text `to`/`to_address` with no person id (`route.ts:69,74`) — **bypassed by construction**, not by misconfiguration.
3. It is skipped entirely for `in_app` (`:116`).
4. Even when it runs, category defaults to *transactional* (`consentEnforcement.ts:14-16,27`) and `evaluateConsent` permits every transactional send absent an opt-out row on `email_transactional`/`sms_transactional` (`consentGate.ts:49-53`). An opt-out recorded on `email_marketing` blocks nothing.

**Consequence for the contract:** your instruction *"do not merely enable `comms_v2_compliance`"* is not just correct, it is an understatement. Enabling the flag would still leave three bypasses.

**The true TypeScript floor is `insertCommunicationMessageRow` (`canonicalOutboundEnqueue.ts:78`, insert at `:120`), reachable only via `enqueueCanonicalOutboundMessage` (`:136`).** Exactly four TS product call sites reach it. Moving the gate down one level covers every currently-gated path **plus** the tour orchestrator, packet launch, and the workflow mirror — with **zero re-pointing**.

### 0.2 🔴 S-1 — NEW FINDING, outside your defined scope: two unauthenticated SMS-sending endpoints

Verified independently, not taken on the sub-agent's word:

```
backend/app/server.py:28   app.include_router(dispatch.router)      ← mounted, no prefix
backend/app/routes/dispatch.py:214   @router.post("/dispatch")         ← no Depends(), no token, no auth
backend/app/routes/dispatch.py:941   @router.post("/contractor-reply") ← no Depends(), no token, no auth
```

Ten SMS call sites across the two handlers, all dispatching through `ghl_client.send_conversation_sms` (`ghl_client.py:293` → `POST {LC_BASE_URL}/conversations/messages` `:316`). **They create no `communication_messages` row, no `public.messages` row, and no audit row — only a log line.**

Three consequences:
- **No row-level or database-level gate can ever reach them.** They are structurally invisible to every mechanism in this contract.
- They are an **unauthenticated outbound-SMS surface**: abuse potential (SMS pumping / toll fraud / sending from the org's number) independent of consent.
- `dispatch.py:1380` appends *"Reply STOP to unsubscribe."* while `sms_inbound.py` never inspects inbound bodies for keywords — so this path makes a promise the platform cannot keep.

This is the cleaning vertical (`server.py:13` — *"API for dispatching cleaning jobs"*), plausibly dead for childcare, but it is **mounted and live**.

> **Raising, not deciding.** Options: **(a)** authenticate both routes; **(b)** decommission them; **(c)** gate `send_conversation_sms` itself; **(d)** out of Phase 0 scope, tracked separately. I recommend **(a) now, (b) soon** — authentication is a small, safe change that closes the abuse surface without a product decision about the cleaning vertical. **I will not touch these without your instruction**, because decommissioning a live route is a product decision, not a repair.

### 0.3 A live hazard in a dev script

`scripts/dev/communications-resend-smoke-enqueue.sql:26` inserts a `status='queued'` message with a **hard-coded real org UUID** (`93667019-bd28-49b5-a688-acc9bb1e0a19`, the staging org seeded by `20260501200000`) and a **real personal address** (`kurz16@gmail.com`). Pasting it into the SQL Editor enqueues a message that the Python queue **will dispatch**. Related to the known "comms not dispatched — QA fixture holds a real email/phone" item.

Phase 0 will add the DB-level floor that makes this row non-dispatchable to a suppressed recipient, and will add a header warning to the file. **It will not delete the file** (dev tooling, not my call).

---

## 1. Exact affected files and tables

### 1.1 P0-1 — eligibility gate & keyword processing

**Tables**

| Table | Change |
|---|---|
| `communication_messages` | `+ category text NOT NULL DEFAULT 'operational'` (closed CHECK); `+ purpose text NULL`; `+ eligibility_decision jsonb NULL` (audit of the gate's verdict) |
| `communication_preferences` | no DDL — becomes the single canonical truth |
| `communication_preference_events` | no DDL — gains its first writer |
| `communication_scheduled_sends` | `+ category text` (snapshot at schedule time) |
| `messages`, `messages_outbox` (legacy) | trigger only |

**Files — gate relocation and hardening**

| File | Change |
|---|---|
| `web/lib/communications/canonicalOutboundEnqueue.ts:78,120,136` | **The gate moves here.** Fail-closed evaluation before insert |
| `web/lib/communications/executeCommunicationsSend.ts:113-124` | Remove the local gate (now redundant); keep recipient resolution |
| `web/lib/communications/v2/consentEnforcement.ts:14-16,27` | Remove channel-derived category default; require explicit category |
| `web/lib/communications/v2/consentGate.ts:34-63` | Extend to category vocabulary + quiet hours + emergency override |
| `web/lib/communications/v2/flags.ts:54-59` | `comms_v2_compliance` → `CORE_COMMS_V2_FLAGS` (default ON) |
| `web/lib/communications/v2/preferenceMutations.ts` | Gains its first production caller |
| `web/lib/communications/v2/smsKeywords.ts` | Gains its first production caller |

**Files — bypass closure (LIST B)**

| File | Change |
|---|---|
| `web/lib/workflowRun.ts:1725` (`create_message`) | Re-point to canonical enqueue **or** gate independently |
| `web/lib/workflowRun.ts:2028` (`send_message` → `messages`) | Same |
| `web/lib/workflowRun.ts:2070` (`send_message` → `messages_outbox`) | Same (no Python consumer — audit-only today) |
| `web/lib/tours/comms/tourSchedulingScheduledSends.ts:210` | Gate at **schedule** time |
| `web/lib/communications/v2/scheduleAnnouncementSendout.ts:143` | Gate at schedule time |
| `web/lib/communications/v2/announcementFanout.ts:48-50` | **Collapse its separate consent implementation into `consentGate`** |
| `web/lib/tours/comms/tourCommsOrchestrator.ts:282,394` | Covered automatically by the relocation |
| `web/app/api/admin/opportunities/[id]/enrollment-packet-launch/route.ts:358` | Covered automatically |
| `web/lib/communications/mirrorQueuedMessage.ts:133` | Covered automatically |

**Files — Python enforcement (defense in depth)**

| File | Change |
|---|---|
| `backend/app/services/communication_message_sender.py:113,133` | Re-check eligibility between the queue read and the provider calls (`:260`, `:270`, `:339`) |
| `backend/app/services/message_sender.py:26,91` | Same, if legacy survives |
| `backend/app/routes/sms_inbound.py:117-124` | Parse STOP/START/HELP → preference mutation + audit |

**Files — missing permission gates**

`communication-scheduled-sends/process-due/route.ts:31` · `communications/family-note/route.ts:14` · `opportunities/[id]/form-deliver/route.ts:33` — add `assertCommunicationsSendAllowed`.

### 1.2 P0-2 — signed-URL authorization

| File | Change |
|---|---|
| `web/app/api/admin/documents/[id]/signed-url/route.ts:10-16` | Role + relationship authorization; path-ownership assertion; fail-closed |
| `web/app/api/admin/vendors/[id]/documents/signed-url/route.ts:14-15` | Same |
| `web/app/api/admin/persons/[id]/profile-photo/route.ts:108` | Same |
| `web/lib/documents/assertDocumentAccess.ts` | **NEW** — the single authorization helper all three call |
| `web/lib/vendors/publicVendorApplication.ts:352-353` | Write org-prefixed paths |
| `web/app/api/vendor-application/route.ts:77-98` | Size cap + MIME allowlist |

**Tables:** `documents` (no DDL). **Storage:** an explicit deny-by-default `storage.objects` policy so the current fail-closed posture becomes *intentional*, plus re-pathing the 6 `vendors/…` objects.

### 1.3 P0-3 — server-authoritative rendering

| File | Change |
|---|---|
| `web/lib/communications/render/renderOutboundMessage.ts` | **NEW** — the one canonical renderer |
| `web/lib/communications/canonicalOutboundEnqueue.ts:136` | Render + validate before insert; **block on unresolved tokens** |
| `web/lib/communications/v2/templateTokens.ts` | Becomes the single engine; gains HTML escaping |
| `web/lib/communications/v2/templateRender.ts` | **DELETE** (engine C) — port `hasUnresolvedTokens`/`canSendTemplate` first |
| `web/lib/tours/comms/tourCommsTemplates.ts:170` | Engine D folds into the canonical renderer |
| `web/app/adminV2/components/QuickMessageModal.tsx:228-232` | Template apply keeps tokens; server resolves |
| `web/app/adminV2/communications/AnnouncementsWorkspace.tsx:448,685` | Same; preview uses the same renderer |
| `web/app/api/admin/communications/templates/[id]/preview/route.ts` | Same renderer as send — **preview and send become identical by construction** |

**Tables:** `communication_messages` `+ rendered_snapshot jsonb`, `+ template_id uuid`, `+ template_version integer`.

### 1.4 P0-4 — `announcement_targets`

**Tables:** `announcement_targets` only. **Files:** `web/app/api/admin/communications/announcements/[id]/targets/route.ts:78-85`, plus a schema-drift assertion test.

---

## 2. Canonical owner for each concern

| Concern | Canonical owner | Everything else |
|---|---|---|
| **Eligibility decision** (consent, opt-out, channel, quiet hours, legal) | `web/lib/communications/v2/consentGate.ts` — pure, no I/O | `announcementFanout`'s parallel implementation is deleted |
| **Gate enforcement (TS)** | `enqueueCanonicalOutboundMessage` (`canonicalOutboundEnqueue.ts:136`) | `executeCommunicationsSend` becomes a convenience wrapper |
| **Gate enforcement (dispatch)** | `process_communication_messages` (`communication_message_sender.py:113`) | Defense in depth, not the primary |
| **Gate enforcement (floor)** | `BEFORE INSERT` trigger on the three message tables | Catches raw SQL and seed scripts |
| **Preference truth** | `communication_preferences` | `field_values.communication_opt_out` → migrated then read-only; `persons.metadata.*_opt_in` → migrated |
| **Preference audit** | `communication_preference_events` | — |
| **Keyword processing** | `smsKeywords.parseSmsKeyword` → `preferenceMutations` | One path, called from Python inbound |
| **Message category** | Platform, closed CHECK (D3) | Not tenant-configurable |
| **Rendering** | `renderOutboundMessage` | Engines A/B/C/D collapse into it |
| **Document authorization** | `assertDocumentAccess` | All three routes delegate |
| **Storage tenancy** | `{org_id}/…` path convention **+** an explicit deny-by-default policy | Convention alone is not enforcement |

---

## 3. Migration list

Ordered, additive-first, each independently revertible.

| # | Migration | Purpose |
|---|---|---|
| 1 | `20260731100000_announcement_targets_shape_repair.sql` | **P0-4.** Idempotent, shape-agnostic: add `target_type`/`target_ref`/`rule` if absent, drop `target_spec NOT NULL`, backfill either direction where derivable, add the B4 CHECK. Must be safe on both shapes and re-runnable. |
| 2 | `20260731101000_communication_message_category.sql` | **P0-1.** `+ category` (NOT NULL, `DEFAULT 'operational'`, closed CHECK), `+ purpose`, `+ eligibility_decision`; `+ category` on `communication_scheduled_sends`. |
| 3 | `20260731102000_communication_preferences_backfill.sql` | **P0-1.** Migrate `field_values.communication_opt_out` and `persons.metadata.*_opt_in` → `communication_preferences` + `communication_preference_events` with `source='migration'`. **Live: 0 rows to migrate** — the migration asserts that and fails loudly if another environment differs. |
| 4 | `20260731103000_communication_eligibility_floor.sql` | **P0-1.** `BEFORE INSERT` trigger on `communication_messages`, `messages`, `messages_outbox` rejecting outbound rows to a suppressed `(person, channel, category)`. |
| 5 | `20260731104000_communication_message_render_columns.sql` | **P0-3.** `+ rendered_snapshot`, `+ template_id`, `+ template_version`. |
| 6 | `20260731105000_storage_objects_deny_by_default.sql` | **P0-2.** Explicit deny-by-default `storage.objects` policy — makes the verified-incidental posture intentional. |
| 7 | `20260731106000_communication_status_check.sql` | Hygiene: pin the six live `status` values; `provider_message_id` unique index. |

**Not in Phase 0:** `communication_thread_links`, structured `content`, retry columns, hierarchy tables. Those are Phase 1+.

---

## 4. API and worker changes

**Behavioral (require coordinated client changes)**

| Endpoint | Change | Breaking? |
|---|---|---|
| `POST /api/admin/communications/send` | `category` **required**; free-text `to` without `recipient_person_id` now **rejected** (this is bypass #2) | **Yes** — see §5 |
| `POST /api/admin/communications/family-send` | `category` required | Yes |
| `POST /api/admin/communications/announcements/[id]/schedule` | `category` required; consent evaluated at schedule time | Yes |
| `POST .../announcements/[id]/targets` | Writes the canonical shape post-repair | No |
| `POST /api/admin/communication-scheduled-sends` | `category` required and snapshotted | Yes |

**Additive**

`.../process-due`, `.../family-note`, `.../form-deliver` gain `assertCommunicationsSendAllowed`. Three signed-URL routes gain `assertDocumentAccess`. `web/middleware.ts:41-42` adds the `[binding_id]` Twilio bypass.

**Workers**

`process_communication_messages` gains an eligibility re-check between the queue read (`:133`) and provider dispatch (`:260`/`:270`/`:339`), and skips-with-audit rather than failing. `sms_inbound.py` gains keyword parsing before persistence.

**Providers:** no change. **Note (absorbed defect):** `resend_client.py:38-41` + `communication_message_sender.py:342` — a binding config carrying `html` silently discards the per-message body and sends static binding HTML. Fixed as part of P0-3 because it makes rendering unverifiable.

---

## 5. Backfill and compatibility behavior

| Concern | Behavior |
|---|---|
| `category` on existing rows | `DEFAULT 'operational'` — the **safer** class (opt-out honored, quiet hours applied). A mis-classification under-sends. Live: 7 rows. |
| Explicit classification | Every call site passes `category` explicitly; a test asserts **no production caller relies on the default**, satisfying your "not an undocumented default" requirement. |
| Preference migration | 3 stores → 1. Live has **0 rows in all three**, so this is greenfield wiring; the migration asserts emptiness and **fails loudly** if another environment has data, rather than silently guessing precedence. |
| `field_values.communication_opt_out` | Kept and made **read-only in the UI**, rendered from `communication_preferences`. Not deleted in Phase 0. |
| Free-text `to` rejection | **The one genuinely breaking change.** Ships behind `COMMS_REQUIRE_RECIPIENT_PERSON` (default OFF for one release, logging violations), then flipped. Prevents a silent break of any caller I have not found. |
| `announcement_targets` | Repair is idempotent and shape-agnostic; safe on fresh, PKG-05-first, and (hypothetically) B4-first databases. Live: 0 rows, so no data risk. |
| Legacy `messages` / `messages_outbox` | **Not retired** (D8). Trigger-gated only. |
| Rendering | Inline bodies (no template) pass through unchanged. Only template-sourced bodies gain mandatory resolution. |

---

## 6. Security implications

**Closed by this phase**

| ID | Issue | Closure |
|---|---|---|
| S-A | Consent gate bypassable four ways | Gate relocated to the insert floor; three bypasses removed; DB trigger backstop |
| S-B | Any org member reads any document | `assertDocumentAccess`: org + role + relationship + path ownership, fail-closed |
| S-C | 6 objects outside the org-prefix convention | Re-pathed; convention asserted at write |
| S-D | Unauthenticated upload, no size/MIME limit | Cap + allowlist |
| S-E | Three send-capable routes ungated | Gates added |
| S-F | Raw tokens deliverable | Render blocks enqueue |
| S-G | Storage posture incidental | Explicit deny-by-default policy |
| S-H | `[binding_id]` webhook outside the bypass | Added |

**Explicitly NOT closed by this phase**

| ID | Issue | Why |
|---|---|---|
| **S-1** | **Unauthenticated SMS endpoints (`dispatch.py`)** | **Outside your defined scope — §0.2. Awaiting your decision.** |
| S-2 | Cross-tenant credential fallback (`communication_message_sender.py:329-334`) | Phase 2 (provider setup) |
| S-3 | Grants fail open | D7, Phase 4 |
| S-4 | `GRANT ALL … TO anon` | Phase 1 hygiene |
| S-5 | Comms metrics ignore location scope | Phase 4 |

**New surface introduced:** none. Phase 0 only removes authority.

---

## 7. Test matrix

**Prerequisite: a DB-backed integration harness.** There is currently **zero** DB-backed and **zero** route-level coverage in communications, and `executeCommunicationsSend` has no test file. Building the harness is the first task, not the last.

| Dimension | Values |
|---|---|
| Category | `transactional`, `operational`, `marketing`, `emergency`, `internal` |
| Channel | `email`, `sms`, `in_app` |
| Preference state | `opted_in`, `opted_out`, `unset`, no row |
| Entry point | all 6 LIST A + all 8 LIST B + raw SQL insert + Python dispatch |
| Quiet hours | inside / outside / `emergency` inside |
| Recipient identity | resolvable person / free-text address / ambiguous / none |

**Required assertions**

- Every LIST B path is blocked for an opted-out recipient — **one test per path**, so a regression names the path
- A raw SQL insert of a suppressed outbound row is rejected by the trigger
- Python dispatch skips-with-audit a row that became ineligible after enqueue
- STOP → `opted_out` + audit row + the **next** send blocked; START re-opts; HELP replies without changing state
- `emergency` is never suppressed by quiet hours; `transactional` is never blocked by opt-out; `marketing` requires opt-in
- No message reaches a provider containing `{{`
- Preview output === send output for the same template + context (byte-identical)
- Signed URL: guessed id, cross-org, low-privilege viewer, cross-location, cross-child, malformed path, non-conforming path — **all fail closed**
- `announcement_targets` repair is idempotent (run twice) and correct on both shapes
- Migration replay from empty reaches canonical schema

**Deleted:** every `readFileSync`-regex shape test replaced by a real one.

---

## 8. Rollout and rollback

**Order (each independently deployable and revertible):**

1. Test harness — no production change
2. **P0-4** — migration + route. *Lowest risk, currently broken, immediate win.* Rollback: revert route; the additive columns are harmless.
3. **P0-2** — `assertDocumentAccess` + three routes + re-path + storage policy. Rollback: revert helper; routes revert to prior behavior.
4. **P0-3** — renderer + block-on-unresolved. Rollback: feature-flag the block, keep rendering.
5. **P0-1** — the largest. Sub-staged:
   - 5a. `category` column, default, explicit call sites (no enforcement)
   - 5b. Preference migration + STOP/START/HELP + audit
   - 5c. Gate relocation + Python re-check, **in shadow mode** — evaluate and log, do not block
   - 5d. Read shadow logs; confirm zero unexpected blocks
   - 5e. Enforce
   - 5f. DB trigger floor last (the backstop, once nothing should hit it)

**Rollback:** each stage is a revert. The gate is enforced by a flag flip (5e), so disabling enforcement is instant and needs no deploy. The DB trigger is `DROP TRIGGER`.

**Shadow mode is the core of the strategy.** Live volume is 6 messages, so shadow will be quiet here — its value is in whatever environment has real traffic.

---

## 9. Live verification steps

Read-only unless stated. Same method as `PHASE-0-LIVE-VERIFICATION.md`.

**Before**
1. Re-confirm `announcement_targets` shape (guard against drift since verification)
2. Confirm preference stores still empty — if not, **stop**; the migration's precedence assumption is invalid
3. Confirm bucket still private, storage policies still zero
4. Read `persons/[id]/profile-photo` auth (the one route not yet read)
5. Confirm whether anything drives `process-due` in production

**After each stage**
- P0-4: insert a target via the API (**write — a real announcement in the staging org**), confirm it persists, delete it
- P0-2: authenticate as a low-privilege role and attempt a signed URL for a document that role should not reach; expect 403
- P0-3: send one message from a template to an internal address; assert no `{{` and that `rendered_snapshot` matches
- P0-1: set a test person to `opted_out`, attempt a send from **each** LIST A and LIST B path, assert all blocked and audited; send STOP from a test handset, assert the preference flips and the next send blocks

**Post-deploy**
- Zero outbound rows with `category = 'operational'` that were not explicitly classified
- Zero delivered messages containing `{{`
- Shadow-mode logs show no unexpected blocks before 5e

---

## 10. Explicit non-goals

Phase 0 does **not**:

1. **Redesign storage.** Live verification demonstrates it is unnecessary — bucket private, RLS fail-closed.
2. Retire legacy `public.messages` / `messages_outbox` (D8).
3. Converge composers, or delete the orphaned/legacy composer surfaces.
4. Add `communication_thread_links` or structured `content` (D1/D2 — Phase 1).
5. Add retry, DLQ, queue lease, or a scheduler (Phase 2) — **except** the eligibility re-check.
6. Build identity/provider write paths (Phase 2).
7. Wire announcement **delivery** (Phase 4) — Phase 0 repairs the schema and adds the disclosure banner only.
8. Add quiet-hours **configuration UI** — Phase 0 enforces `emergency` exemption using existing tour config; general quiet hours are Phase 4.
9. Touch `dispatch.py` (**S-1 — awaiting your decision**).
10. Delete `scripts/dev/communications-resend-smoke-enqueue.sql` — a warning header only.
11. Introduce any new runtime, or weaken any org, relationship, audit, consent, or permission boundary.

---

## 11. Boundary check

Per your stop-condition rule, three choices could be read as touching a canonical ownership boundary. My assessment:

| Choice | Boundary? | Reasoning |
|---|---|---|
| Moving the gate from `executeCommunicationsSend` to `enqueueCanonicalOutboundMessage` | **No** | Both are Communications Runtime internals. Relocation within one owner. |
| Python re-check at dispatch | **No** | Defense in depth. Python already owns dispatch; adding a check does not move ownership. Flagged last turn; I consider it in-contract. |
| **DB trigger as the eligibility floor** | **Arguably yes — flagging** | Your boundary states *"code owns security and executable invariants."* A trigger is code owning an invariant, but it relocates part of that invariant into the database. I recommend it because it is the **only** mechanism covering raw SQL and seed scripts, and the live smoke-SQL hazard (§0.3) is a concrete instance. **If you prefer the invariant stay in application code, say so and I will drop migration #4** — the cost is that raw-SQL inserts remain ungated. |

Everything else in this contract is repair within existing ownership.

---

## 12. Ready-to-start checklist

| Gate | Status |
|---|---|
| Contract internally consistent | ✅ |
| No new architectural decision required | ⚠️ **Two open: D3, and the §11 trigger question** |
| Scope decision outstanding | ⚠️ **S-1 (`dispatch.py`)** |
| Live verification complete | ✅ |
| Commit separation | ✅ Phase 0 commits on their own, separate from Conversation Platform work |
