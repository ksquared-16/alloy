---
title: Outbound Send-Path and Bypass Matrix
status: complete — enumeration finished, classification applied
date: 2026-07-30
---

# Outbound Send-Path and Bypass Matrix

**Scope of the sweep:** every code path in either runtime that can create, queue, or dispatch an outbound communication. TypeScript, Python, migrations, scripts, and tests.

**Architecture in one line:** `enqueueCanonicalOutboundMessage` (`web/lib/communications/canonicalOutboundEnqueue.ts:136`, insert at `:120`) is the **only** TypeScript function that inserts an outbound `communication_messages` row. `executeCommunicationsSend` (`:93`) is a *wrapper* around it, not the floor. Provider dispatch is **100% Python** — TypeScript never calls Twilio or Resend.

---

## 1. Full enumeration — 22 paths

Classification legend: **CR** canonical & retained · **CM** canonical, must be modified · **AD** compatibility path requiring adapter · **RM** direct bypass to remove · **DC** dead code to retire · **TO** test-only

| # | Entry point | Trigger | Primitive | Via `executeSend`? | Perm gate? | Channels | Class |
|---|---|---|---|---|---|---|---|
| 1 | `app/api/admin/communications/send/route.ts:122` | Drawer composer, Quick Message | `executeCommunicationsSend` | YES | YES `:47` | sms, email, in_app | **CM** |
| 2 | `app/api/admin/communications/family-send/route.ts:86` | Family workspace fan-out | `executeCommunicationsSend` | YES | YES `:28` | email, sms | **CM** |
| 3 | `app/api/admin/communications/family-note/route.ts:68` | Command Center internal note | `executeCommunicationsSend` | YES | **NO** | in_app | **CM** |
| 4 | `app/api/admin/ai/task-assist/apply/route.ts:69` | Operator approves AI proposal | `executeCommunicationsSend` | YES | YES `:31` | sms, email | **CM** |
| 5 | `app/api/admin/opportunities/[id]/form-deliver/route.ts:113` | Operator delivers a form | `executeCommunicationsSend` | YES | **NO** | email, sms | **CM** |
| 6 | `lib/communications/communicationScheduledSendsService.ts:648` | `process-due` drain (cron token = all orgs, or admin session) | `executeCommunicationsSend` | YES | route-level only | email, sms | **CM** |
| 7 | `lib/tours/comms/tourCommsOrchestrator.ts:282` (dep `:394`) | Tour create/confirm/reschedule/cancel/no-show — incl. **unauthenticated** `api/public/tour-booking/[token]/book:90` and BOS adapters | `enqueueCanonicalOutboundMessage` | **NO** | **NO** | email, sms | **CM** |
| 8 | `lib/tours/comms/tourSchedulingScheduledSends.ts:210` | Same tour lifecycle → schedules reminders | direct INSERT `communication_scheduled_sends` | indirect (via #6) | NO | email, sms | **CM** |
| 9 | `app/api/admin/opportunities/[id]/enrollment-packet-launch/route.ts:358` | Operator launches packet | `enqueueCanonicalOutboundMessage` | **NO** | YES `:238` | email | **CM** |
| 10 | `lib/communications/mirrorQueuedMessage.ts:133` | `workflowRun.ts:1801` mirror; `COMMUNICATION_DUAL_WRITE` **default OFF** | `enqueueCanonicalOutboundMessage` | **NO** | NO | sms, email | **AD** |
| 11 | `lib/workflowRun.ts:1725` `create_message` | Any workflow rule | direct INSERT `public.messages` | **NO** | **NO** | sms (dispatched), email (row only) | **AD** |
| 12 | `lib/workflowRun.ts:2028` `send_message` | Any workflow rule | direct INSERT `public.messages` | **NO** | **NO** | sms | **AD** |
| 13 | `lib/workflowRun.ts:2070` `send_message` | Any workflow rule | direct INSERT `messages_outbox` | **NO** | **NO** | sms, email | **DC** |
| 14 | `lib/communications/v2/scheduleAnnouncementSendout.ts:143` | `announcements/[id]/schedule:38` | direct INSERT `communication_scheduled_sends` (`source='announcement'`) | **NO** | **NO** | email, sms | **CM** |
| 15 | `scripts/seedOneGoldenPathEnrollmentRecord.ts:385` | `npm run demo:seed:golden-path`; guarded `:148,:155` | direct INSERT `communication_messages` | **NO** | NO | email | **TO** |
| 16 | `scripts/seedRealisticChildcareDemoData.ts:1278` | `npm run seed`; **no production guard** `:2314` | direct INSERT `communication_messages` | **NO** | NO | email, sms | **TO (must be modified)** |
| 17 | `scripts/dev/communications-resend-smoke-enqueue.sql:26` | Paste into SQL Editor | raw SQL INSERT, `status='queued'` | **NO** | NO | email | **TO (live hazard)** |
| 18 | `backend/app/services/communication_message_sender.py:113` | `POST /internal/messages/process` | **Python dispatch** — Twilio `:260`/`:270`, Resend `:339`, in_app `:383` | n/a | n/a | all | **CM** |
| 19 | `backend/app/services/message_sender.py:26` | same route | **Python dispatch** — legacy `public.messages`, Twilio `:91` | n/a | n/a | sms | **AD** |
| 20 | `backend/app/routes/messages_sender.py:36` | `x-cron-token`; **no in-repo cron** | invokes #18 + #19 | n/a | n/a | all | **CR** |
| 21 | `backend/app/routes/dispatch.py:214` `POST /dispatch` | **UNAUTHENTICATED** | `ghl_client.send_conversation_sms:293` — **no message row created** | **NO** | **NO** | sms | **RM (S-1)** |
| 22 | `backend/app/routes/dispatch.py:941` `POST /contractor-reply` | **UNAUTHENTICATED** | 9 SMS sites `:1019…:1403` | **NO** | **NO** | sms | **RM (S-1)** |

### Verified NOT send paths

- `lib/workflowRun.ts:2395` `create_action_link` — mints a link consumed by `send_message` templates; does not send.
- **BOS command-session adapters** (`lib/bos/commandSession/adapters/**`) — zero hits for `executeCommunicationsSend|enqueueCanonical|communication_messages|communications/send`. Their only reach is indirect: `cancelTourBosAdapter` → `cancelTourAdapter.ts:492` → `cancelTourBooking` → path #7.
- **Python cannot create an outbound row.** Every Python INSERT into `communication_messages` (`communication_inbound.py:410`) and `public.messages` (`sms_inbound.py:95`) hardcodes `"direction": "inbound"`.

---

## 2. Why the current gate protects nothing

`executeCommunicationsSend.ts:113-124` fails for **four independent reasons**, any one sufficient:

| # | Reason | Cite |
|---|---|---|
| 1 | `comms_v2_compliance` not in `CORE_COMMS_V2_FLAGS` → `resolveCommsV2Flag` returns `false` by default | `v2/flags.ts:54-59`, `:70` |
| 2 | **Skipped when `recipient_person_id` is absent or non-UUID** — and `/send` accepts free-text `to`/`to_address` with no person id → **bypassed by construction** | `executeCommunicationsSend.ts:117-118`; `send/route.ts:69,74` |
| 3 | Skipped entirely for `in_app` | `:116` |
| 4 | Category defaults to *transactional*; `evaluateConsent` permits every transactional send absent an opt-out on `*_transactional`. An opt-out on `email_marketing` blocks nothing | `consentEnforcement.ts:14-16,27`; `consentGate.ts:49-53` |

---

## 3. Choke-point analysis

**There is no single choke point without a Python change.** Stated explicitly, as required.

**TypeScript floor:** `insertCommunicationMessageRow` (`canonicalOutboundEnqueue.ts:78`, insert `:120`), reachable only via `enqueueCanonicalOutboundMessage` (`:136`). Exactly **four** product call sites reach it — `executeCommunicationsSend.ts:291`, `mirrorQueuedMessage.ts:133`, `tourCommsOrchestrator.ts:394`, `enrollment-packet-launch:358`.

Relocating the gate there covers paths **1–10** with zero re-pointing.

**Remaining coverage requirement:**

| Vector | Covered by |
|---|---|
| Paths 1–10 | TS floor at `enqueueCanonicalOutboundMessage` |
| Paths 11–13 (legacy `messages` / `messages_outbox`) | Adapter — re-point or gate independently; **and** Python dispatch revalidation (#19) |
| Paths 8, 14 (schedule-time producers) | Gate at schedule time **and** at drain (#6) **and** at dispatch |
| Paths 15–17 (scripts, raw SQL) | **Python dispatch revalidation** — this is what makes the DB trigger unnecessary |
| Path 18–20 (Python dispatch) | The revalidation itself |
| **Paths 21–22 (`dispatch.py`)** | **Nothing in this contract. No row exists to gate. S-1 — out of scope.** |

**Two enforcement layers, per your §2 decision:**

1. **TypeScript enqueue** — authoritative classification, consent/preference resolution, channel eligibility, quiet hours, recipient resolution, operator-safe blockers, audit intent, refusal before enqueue
2. **Python dispatch** — fail-closed revalidation immediately before the provider call

The Python layer covers direct database inserts because it is the only route to a provider for any row. That is why no database trigger is required.

---

## 4. Classification summary

| Class | Count | Paths |
|---|---|---|
| **CR** canonical & retained | 1 | 20 |
| **CM** canonical, must be modified | 12 | 1–9, 14, 18 |
| **AD** compatibility adapter | 4 | 10, 11, 12, 19 |
| **DC** dead code to retire | 1 | 13 (`messages_outbox` — **verified**: zero `messages_outbox` references in `backend/**/*.py`, so no consumer exists) |
| **RM** direct bypass to remove | 2 | 21, 22 — **S-1, out of Phase 0 scope** |
| **TO** test-only | 3 | 15, 16, 17 |

---

## 5. Coverage claim — bounded, per your instruction

**I do not claim "all paths protected."**

After Phase 0, the accurate claim will be:

> Every path that creates a row in `communication_messages`, `messages`, or `messages_outbox` is gated at enqueue **and** revalidated at dispatch. **Paths 21 and 22 (`dispatch.py`) create no row and are not gated.**

This claim becomes assertable only when the test matrix in the Phase 0 contract passes with **one test per path in classes CM, AD, and TO**, so a regression names the specific path rather than failing generically.

---

## 6. Two adjacent defects absorbed into Phase 0

| Defect | Why absorbed |
|---|---|
| `communication_message_sender.py:113,133` has **no claim step** — no `status='sending'`, no `FOR UPDATE SKIP LOCKED`, no lease → concurrent `POST /internal/messages/process` double-sends | Not fixed in Phase 0 (it is Phase 2 per your §5), but the dispatch revalidation must be **idempotent** so it does not itself become a second double-send vector |
| `resend_client.py:38-41` + `communication_message_sender.py:342` — a binding config carrying `html` **silently discards the per-message body** and sends the static binding HTML | Absorbed into P0-3: rendering enforcement is unverifiable while the rendered body can be discarded downstream |
