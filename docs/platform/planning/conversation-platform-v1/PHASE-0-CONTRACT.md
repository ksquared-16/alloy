---
title: Phase 0 — Production Safety & Schema Repair — Implementation Contract (v2)
status: COMPLETE — authorized to execute
supersedes: v1 (2026-07-30 morning)
date: 2026-07-30
evidence: PHASE-0-LIVE-VERIFICATION.md · SEND-PATH-MATRIX.md
---

# Phase 0 — Implementation Contract (v2)

**Scope:** P0-1 eligibility gate & keyword processing · P0-2 signed-URL authorization · P0-3 server-authoritative rendering · P0-4 `announcement_targets` repair.

## Changes from v1

| Change | Source |
|---|---|
| Category enum is **4 values** (`transactional`/`operational`/`marketing`/`emergency`); `internal` moves to a separate `audience` axis | Decision §1 |
| `audience` added as a first-class column — internal messages do **not** inherit external consent behavior | Decision §1 |
| **DB trigger dropped.** Migration #4 removed | Decision §2 — two layers named (TS enqueue, Python dispatch); Python dispatch covers direct DB inserts because it is the only route to a provider |
| Enqueue/dispatch responsibility split specified with an eligibility **snapshot** + minimum live rechecks | Decision §2 |
| Storage debt explicitly classified as blocking / non-blocking for authorization | Decision §3 |
| P0-4 promoted to first execution slot | Decision §4 |
| Phase 2 renamed and rescoped (separate doc) | Decision §5 |
| Send-path enumeration complete and classified (separate doc) | Decision §6 |

**Unresolved and excluded:** **S-1** — `dispatch.py`'s two unauthenticated SMS endpoints. Not addressed in your decisions; **out of Phase 0 scope; not touched.** They remain a live unauthenticated outbound-SMS surface that no mechanism in this contract can reach (they create no row).

---

## 1. Classification model

### 1.1 Four orthogonal axes

```text
audience:  external | internal
channel:   email | sms | in_app            (in_app == the "internal" transport)
category:  transactional | operational | marketing | emergency
purpose:   domain/tenant key (free text, compliance-inert)
```

**Note on `channel`.** Your model names the internal transport `internal`; the live DB CHECK is `('sms','email','in_app')`. Phase 0 **keeps `in_app`** and does not rename the enum — renaming is a breaking change across 6 tables and every reader, for zero safety gain. `audience='internal'` is the semantically load-bearing field. Renaming is Phase 1 hygiene at the earliest.

### 1.2 Category semantics — as decided

| Category | Suppressible by | Honors | Notes |
|---|---|---|---|
| `transactional` | Not by broad marketing opt-out | Unusable channels, identity uncertainty, provider restrictions, legal delivery constraints | Still fails closed on channel/identity problems |
| `operational` | Operational opt-out | Channel preference, quiet hours, contact priority, recipient eligibility | The default class for ambiguous cases |
| `marketing` | All applicable opt-outs | Explicit eligibility required (opt-in) | Strictest |
| `emergency` | Nothing | Nothing suppresses it | **Permissioned + audited.** Requires `communications.send.emergency`; every use writes an audit row naming the actor. Not available as a convenience bypass. |

`audience='internal'` short-circuits recipient-consent evaluation entirely — an internal note is not a communication to a data subject. It still evaluates channel availability and org scope.

### 1.3 Defaulting and its retirement — as required

**New sends must not silently default.** Three-step, observable, migration-retired:

1. **Migration** adds `category text NOT NULL DEFAULT 'operational'` — the default exists **only** to make the column addable against existing rows (live: 7). `operational` is the *safer* class, so any mis-classification under-sends.
2. **API requires `category` explicitly.** Missing → `400 CATEGORY_REQUIRED`. A bounded compatibility fallback exists for exactly one release behind `COMMS_CATEGORY_FALLBACK` (default OFF), and **every use increments a counter and logs the call site** — observable by construction.
3. **Retirement migration** `ALTER COLUMN category DROP DEFAULT` once the counter reads zero for a full release. After that, an insert without a category fails at the database.

A test asserts **no production caller relies on the fallback**.

---

## 2. Eligibility enforcement — the enqueue/dispatch split

### 2.1 Canonical policy contract

One versioned pure decision function, `evaluateEligibility(input) → Decision`, owned by TypeScript (`v2/consentGate.ts`). Python does **not** reimplement it.

The seam is a **persisted eligibility snapshot** plus a **minimum live recheck set**:

```jsonc
// communication_messages.eligibility_snapshot
{
  "policy_version": "2026-07-31.1",
  "decision": "allow",
  "audience": "external", "category": "operational", "purpose": "tour_reminder",
  "recipient": { "person_id": "…", "address": "…", "channel": "sms" },
  "authorized_by": { "user_id": "…", "permission": "communications.send" },
  "consent_inputs": [ { "category": "sms_operational", "state": "unset", "updated_at": "…" } ],
  "quiet_hours": { "basis": "location", "window": "21:00-08:00", "tz": "America/Los_Angeles" },
  "evaluated_at": "…"
}
```

Drift between runtimes is caught by a **shared golden-fixture file** that both the TS engine and the Python recheck execute against in CI. A divergence fails the build rather than surfacing in production.

### 2.2 Immutable at enqueue vs revalidated at dispatch

**The principle: classification and authorization are *authoring facts*. Recipient state and time-dependent constraints are *live facts*.**

| Concern | Where | Why |
|---|---|---|
| `audience`, `category`, `purpose` | **Immutable** | An authoring decision by an authorized operator. Re-deriving at dispatch would let a queued message silently change class. |
| Authorizing actor + permission | **Immutable** | Authorization already occurred. Python has no session context and must not invent one. |
| Recipient resolution (person, address) | **Immutable** | Re-resolving could select a *different* person than the operator addressed. |
| Quiet-hours basis (tz, window) | **Immutable** | The configuration that applied at authoring time. |
| **Preference / consent state** | **REVALIDATE** | **The critical one.** The queue→dispatch gap is unbounded; a STOP or opt-out may land in between. |
| **Suppression state** (hard bounce, complaint) | **REVALIDATE** | May have occurred after enqueue. |
| **Quiet hours — the clock** | **REVALIDATE** | A message that sat in the queue may now be *inside* the window. Applies to `operational` and `marketing`; `transactional` and `emergency` exempt. |
| **Communication identity validity** | **REVALIDATE** | Identity/account may have been disabled, revoked, or lost its `secret_ref`. |
| **Structural coherence** | **REVALIDATE** | `direction='outbound'`, `to_address` present and channel-consistent, `audience='external'` for provider dispatch. |
| **Category presence & validity** | **REVALIDATE** | A directly-inserted row (raw SQL, seed script) may have none → **fail closed**. This is what replaces the DB trigger. |

Six live checks. Python reads the snapshot, re-reads preferences/suppression/identity, re-evaluates the clock, and asserts structure. It does not re-derive classification, authorization, or recipient identity.

**Dispatch failure behavior:** skip, mark `status='blocked'` with `eligibility_decision`, emit an audit event, **do not retry**. A blocked message is a policy outcome, not a transient failure. Blocking is **idempotent** — re-running the drain over a blocked row is a no-op, so revalidation cannot itself become a double-send vector.

### 2.3 Bypass coverage

| Vector | Covered by |
|---|---|
| Paths 1–10 (canonical TS) | Gate relocated to `enqueueCanonicalOutboundMessage:136` |
| Paths 11–13 (legacy tables) | Adapter + Python dispatch revalidation |
| Paths 8, 14 (schedule-time) | Gate at schedule **and** drain **and** dispatch |
| Paths 15–17 (scripts, raw SQL) | **Python dispatch revalidation** |
| Paths 21–22 (`dispatch.py`) | **Nothing. S-1, out of scope.** |

---

## 3. P0-2 — storage debt: blocking vs non-blocking

You asked whether the three debt items block reliable document authorization. Verified answers:

| Debt | Blocks authorization? | Reasoning | Phase 0 action |
|---|---|---|---|
| **34 storage objects not in `documents`** | **NO** | The signed-URL routes resolve **by `documents.id`**. An object with no row is unreachable through them — it is orphaned storage, not an authorization gap. | Track as debt. No remediation. |
| **6 `vendors/…` objects without org prefix** | **NO for the `documents` route; YES for path-ownership validation** | They are reachable via `vendors/[id]/documents/signed-url`, which is in scope. The path-ownership check must not *assume* an org prefix, or it will either reject legitimate vendor documents or be written so loosely it validates nothing. | **Smallest required remediation:** validate path ownership against the *row's* `org_id` + `bucket` + `storage_path` rather than against a prefix convention, and re-path the 6 objects so the convention becomes true. |
| **Object-storage ↔ metadata reconciliation** | **NO** | Authorization is row-driven throughout. | Track as debt. |

**Net:** only the vendor re-pathing is required, and only because path-ownership validation would otherwise be unsound. No storage redesign.

---

## 4. Affected files and tables

### 4.1 P0-1

**Tables:** `communication_messages` `+ audience`, `+ category`, `+ purpose`, `+ eligibility_snapshot`, `+ eligibility_decision`; `communication_scheduled_sends` `+ audience`, `+ category`, `+ purpose`; `communication_preferences` and `communication_preference_events` gain their first writers (no DDL).

**Gate relocation:** `canonicalOutboundEnqueue.ts:78,120,136` (gate lands here) · `executeCommunicationsSend.ts:113-124` (local gate removed) · `v2/consentEnforcement.ts:14-16,27` (channel-derived default removed) · `v2/consentGate.ts:34-63` (4 categories, audience short-circuit, quiet hours, emergency override) · `v2/flags.ts:54-59` (`comms_v2_compliance` → core, default ON).

**Bypass closure:** `workflowRun.ts:1725,2028` (adapter) · `workflowRun.ts:2070` (retire) · `tourSchedulingScheduledSends.ts:210` and `v2/scheduleAnnouncementSendout.ts:143` (schedule-time gate) · `v2/announcementFanout.ts:48-50` (**collapse its parallel consent implementation into `consentGate`**) · paths 7, 9, 10 covered automatically.

**Keywords:** `v2/smsKeywords.ts` and `v2/preferenceMutations.ts` gain their first production callers, from `backend/app/routes/sms_inbound.py:117-124`.

**Python:** `communication_message_sender.py:113,133` (revalidation before `:260`/`:270`/`:339`) · `message_sender.py:26,91` (same, legacy).

**Permission gates:** `process-due/route.ts:31` · `family-note/route.ts:14` · `form-deliver/route.ts:33`.

**Scripts:** `seedRealisticChildcareDemoData.ts:2314` (production guard) · `scripts/dev/communications-resend-smoke-enqueue.sql` (warning header).

### 4.2 P0-2

`lib/documents/assertDocumentAccess.ts` (**NEW**, single helper) · `documents/[id]/signed-url/route.ts:10-16` · `vendors/[id]/documents/signed-url/route.ts:14-15` · `persons/[id]/profile-photo/route.ts:108` · `lib/vendors/publicVendorApplication.ts:352-353` (org-prefixed paths) · `api/vendor-application/route.ts:77-98` (size cap + MIME allowlist).

### 4.3 P0-3

`lib/communications/render/renderOutboundMessage.ts` (**NEW**, canonical) · `canonicalOutboundEnqueue.ts:136` (render + block on unresolved) · `v2/templateTokens.ts` (single engine, gains escaping) · `v2/templateRender.ts` (**DELETE** — port `hasUnresolvedTokens`/`canSendTemplate` first) · `tours/comms/tourCommsTemplates.ts:170` (folds in) · `QuickMessageModal.tsx:228-232` · `AnnouncementsWorkspace.tsx:448,685` · `templates/[id]/preview/route.ts` (**same renderer as send**) · `backend/app/integrations/resend_client.py:38-41` + `communication_message_sender.py:342` (stop discarding the per-message body).

**Tables:** `communication_messages` `+ rendered_snapshot`, `+ template_id`, `+ template_version`.

### 4.4 P0-4

`announcement_targets` (canonical shape declared) · `announcements/[id]/targets/route.ts:78-85`.

---

## 5. Canonical owners

| Concern | Owner |
|---|---|
| Eligibility decision | `v2/consentGate.ts` — pure, versioned. `announcementFanout`'s parallel implementation deleted |
| Enforcement (TS) | `enqueueCanonicalOutboundMessage:136` |
| Enforcement (dispatch) | `process_communication_messages:113` — snapshot + 6 live rechecks |
| Preference truth | `communication_preferences` (`field_values.communication_opt_out` migrated then read-only; `persons.metadata.*_opt_in` migrated) |
| Preference audit | `communication_preference_events` |
| Keyword processing | `smsKeywords.parseSmsKeyword` → `preferenceMutations` |
| Category vocabulary | Platform, closed CHECK. `purpose` owned by domain/config |
| Rendering | `renderOutboundMessage` — engines A/B/C/D collapse into it |
| Document authorization | `assertDocumentAccess` |

---

## 6. Migration list

| # | Migration | Purpose |
|---|---|---|
| 1 | `20260731100000_announcement_targets_canonical_repair.sql` | **P0-4.** Idempotent, shape-agnostic, non-destructive |
| 2 | `20260731101000_communication_classification.sql` | `+ audience`, `+ category` (CHECK, transitional default), `+ purpose`, `+ eligibility_snapshot`, `+ eligibility_decision`; same on scheduled sends |
| 3 | `20260731102000_communication_preferences_backfill.sql` | 3 stores → 1; **asserts source emptiness** (live: 0 rows) and fails loudly otherwise |
| 4 | `20260731103000_communication_render_columns.sql` | `+ rendered_snapshot`, `+ template_id`, `+ template_version` |
| 5 | `20260731104000_storage_objects_deny_by_default.sql` | Makes the verified-incidental fail-closed posture explicit |
| 6 | `20260731105000_communication_status_check.sql` | Pin the 6 live `status` values; `provider_message_id` unique index |
| 7 | `20260801100000_communication_category_drop_default.sql` | **Retirement** — after the fallback counter reads zero for a release |

*(v1's DB-trigger migration is removed.)*

---

## 7. Test matrix

**Prerequisite: a DB-backed integration + route-level harness.** Communications currently has **zero** of both, and `executeCommunicationsSend` has no test file. See §9 for why this is commit 0.

| Dimension | Values |
|---|---|
| audience | external, internal |
| category | transactional, operational, marketing, emergency |
| channel | email, sms, in_app |
| preference state | opted_in, opted_out, unset, no row |
| entry point | **one test per path** in classes CM, AD, TO (16 paths) |
| quiet hours | inside, outside, emergency-inside, transactional-inside |
| recipient identity | resolvable person, free-text address, ambiguous, none |
| timing | preference changed **between enqueue and dispatch** |

**Required assertions**

- Every CM/AD path blocked for an opted-out recipient — one named test each
- **A row inserted by raw SQL with no category is blocked at dispatch** (replaces the trigger)
- **A preference that changes after enqueue blocks the message at dispatch**
- Re-running the drain over a blocked row is a no-op (idempotence)
- STOP → `opted_out` + audit + next send blocked; START re-opts; HELP replies without state change
- `emergency` never suppressed; requires its permission; writes an audit row
- `audience='internal'` never evaluates recipient consent and never reaches a provider
- `transactional` still fails closed on unusable channel / invalid identity
- No message reaches a provider containing `{{`
- **Preview output === send output**, byte-identical, same renderer
- Signed URL: guessed id, cross-org, low-privilege viewer, cross-location, cross-child, malformed path, non-conforming path — all fail closed
- `announcement_targets` repair idempotent (run twice), correct on fresh replay **and** from the live shape, non-destructive
- TS engine and Python recheck agree on the shared golden fixtures

**Deleted:** every `readFileSync`-regex shape test replaced by a real one.

---

## 8. Rollout, rollback, live verification

**Shadow mode is the core of the strategy.** P0-1 enforcement ships evaluating-and-logging first; enforcement is a flag flip, so disabling it needs no deploy. Live volume is 7 messages, so shadow is quiet here — its value is any environment with real traffic.

**Rollback:** every commit is independently revertible. Migrations are additive; the only destructive step (#7, drop default) is deliberately deferred to a later release.

**Live verification — before:** re-confirm `announcement_targets` shape; re-confirm all preference stores empty (**if not, stop** — the migration's assumption is invalid); re-confirm bucket private and storage policies zero; read `persons/[id]/profile-photo` auth; determine what drives `process-due` in production.

**Live verification — after each commit:** P0-4 → create a real announcement + target via the API, confirm, delete. P0-2 → authenticate as a low-privilege role, attempt a signed URL for an out-of-scope document, expect 403. P0-3 → send one templated message to an internal address, assert no `{{` and `rendered_snapshot` matches. P0-1 → set a test person `opted_out`, attempt from **each** CM/AD path, assert all blocked and audited; send STOP from a test handset.

---

## 9. Execution order and commit plan

Your order is adopted with **one change, explained before execution as required**.

### The change: a test harness must be commit 0

Your item 7 places "integration tests, live verification, and closeout" last. Final integration tests belong there. But the **harness itself** must come first, because:

- There is **zero** DB-backed and **zero** route-level test infrastructure in communications today. Not thin — absent.
- Every commit from 1 onward makes a safety claim (`this path is now gated`, `this document is now protected`) that is **unverifiable without it**.
- ~23 existing "contract" tests are `readFileSync` + regex asserting code *shape*. They pass while behavior is broken — which is precisely how P0-1 and D4 stayed invisible.

Writing the harness after the repairs would mean shipping seven safety commits on the same evidentiary basis that produced the defects.

### Commit plan

| # | Commit | Concern | Depends on | Independently revertible |
|---|---|---|---|---|
| **0** | `test(comms): DB-backed integration + route-level harness` | Prerequisite | — | Yes (test-only) |
| **1** | `fix(comms): repair announcement_targets to canonical shape` | P0-4 | 0 | Yes |
| **2** | `feat(comms): communication classification + eligibility foundation` | P0-1a | 0 | Yes |
| **3** | `feat(comms): SMS keyword processing (STOP/START/HELP)` | P0-1b | 2 | Yes |
| **4** | `feat(comms): dispatch-time eligibility revalidation` | P0-1c | 2 | Yes |
| **5** | `feat(comms): server-authoritative template rendering` | P0-3 | 0 | Yes |
| **6** | `fix(security): document signed-URL authorization` | P0-2 | 0 | Yes |
| **7** | `test(comms): integration coverage, live verification, closeout` | Closeout | 1–6 | Yes |

**Rationale for the rest of the order (unchanged from yours):**

- **1 first** — highest-confidence currently-broken defect, smallest blast radius, needs no decision, and delivers a working feature immediately.
- **2 before 3 and 4** — keyword handling writes preferences; dispatch revalidation reads the snapshot. Both require the classification foundation.
- **6 is fully independent** of 1–5 and could move anywhere; kept at your position.
- **7 last** — final integration and closeout, as you specified.

**Commit isolation:** Phase 0 commits are separate from all Conversation Platform planning commits, and each of 1–6 addresses exactly one concern.

---

## 10. Explicit non-goals

Phase 0 does **not**: redesign storage (verification shows it unnecessary) · retire legacy `public.messages`/`messages_outbox` (D8) · converge composers · add `communication_thread_links` or structured `content` (Phase 1) · add retry, DLQ, lease, or scheduler (Phase 2, except the revalidation) · build identity write paths (Phase 2) · wire announcement *delivery* (Phase 4 — Phase 0 repairs schema and adds the disclosure banner only) · add quiet-hours configuration UI (Phase 4) · **touch `dispatch.py` (S-1)** · delete the smoke-SQL file · reconcile the 34 orphaned storage objects · rename the `channel` enum · introduce any new runtime · weaken any org, relationship, audit, consent, or permission boundary.

---

## 11. Readiness

| Gate | Status |
|---|---|
| Enumeration complete and classified | ✅ `SEND-PATH-MATRIX.md` |
| Contract internally consistent | ✅ |
| No unresolved canonical ownership change | ✅ — DB-trigger question resolved by Decision §2 (two layers; Python dispatch covers direct inserts) |
| Decisions required to start | ✅ D3 answered |
| Out-of-scope item flagged, not silently absorbed | ⚠️ **S-1 open** — excluded, not resolved |
| Coverage claim bounded | ✅ Paths 21–22 explicitly excluded from any "all paths protected" claim |
| Commit isolation | ✅ |
