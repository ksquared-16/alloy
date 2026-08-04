---
title: Blocked-send visibility — delivery record
status: sprint
stage: realization
sprint: interactive-tour-delivery (slot 4)
base: origin/staging @ 0aa49972a
date: 2026-08-04
---

# Blocked-send visibility

**State:** delivered; browser proof outstanding.

What the platform does when it refuses to send, and what an operator can see.
Concrete state only — no estimates, no percentages.

---

## 1. The defect this record closes

The Interactive Tour certification drove a real send against a real provider. A
hard bounce suppressed the SMS address. The booking committed, the email queued,
and the SMS **existed nowhere**: no message row, no delivery event, no workflow
event. "We refused to send" was indistinguishable from "nobody ever tried".

Two independent causes, both now corrected.

---

## 2. Delivered — enqueue-time refusals are durable

`web/lib/communications/canonicalOutboundEnqueue.ts`

A refused send writes a `communication_messages` row with:

| Column | Value |
| --- | --- |
| `status` | `blocked` |
| `error` | `policy:<BLOCK_CODE>` |
| `eligibility_decision` | audit object — `outcome`, `reason`, `operator_message`, `defer_until`, `contract_version`, `evaluated_at`, `stage: "enqueue"` |
| `eligibility_snapshot` | full decision inputs, `decision.allowed = false` |
| `body` / `subject` | the rendered content that would have gone out |
| `audience` / `category` / `purpose` / `to_address` | classification and recipient, unchanged from a permitted send |

**The vocabulary was not invented.** Migration `20260731101000` added
`eligibility_decision` for exactly this — *"so a blocked message is explainable
to an operator rather than silently absent"* — and `20260731102000` documented
`status = 'blocked'` as *"policy says never; terminal, and NOT a provider
failure"*. The dispatcher already wrote both. Enqueue was the one boundary that
dropped the decision.

**A durable row is not a sendable row.** The dispatch poller selects
`status in.(queued,deferred)` (`backend/app/services/communication_message_sender.py`),
so `blocked` is unreachable by construction.

**The caller contract did not change.** Callers test
`!result.communicationMessageId` to mean "not going out". That field stays
`null`; the blocked row id is returned separately as
`blockedCommunicationMessageId`.

---

## 3. Delivered — a refusal reaches the record it concerns

Enqueue emits `workflow_events.message_blocked` against the **caller's**
`primaryEntityType` / `primaryEntityId`, which is what
`web/lib/admin/loadOpportunityRelatedActivityEvents.ts` queries. If the durable
row fails to write, no event is emitted — an event pointing at a nonexistent
message is a dangling reference on an operator surface.

---

## 4. Delivered — operator-safe labels for blocked and deferred

`message_blocked` and `message_deferred` were **unmapped** in the channel-aware
labeller, so every refusal the dispatcher has emitted since it was written
reached operators as a raw event key. This is the same failure mode recorded in
that file for `message_delivered`.

| Surface | Change |
| --- | --- |
| `web/lib/admin/activityMessageEventLabels.ts` | "SMS blocked" / "Email deferred", worded apart from `failed` — a policy refusal is not a provider incident |
| `web/lib/admin/enrichActivityEventsWithCommunicationChannels.ts` | channel backfilled; the channel **is** the finding when email queues and SMS is blocked |
| `web/lib/admin/activityTimelineFormat.ts` | `operator_message` renders as the timeline detail, falling back to the humanized block code |

One detail rule serves both boundaries: the Python dispatcher spreads
`DispatchDecision.to_audit()` at payload top level, so `operator_message` and
`reason` are in the same place from either producer.

---

## 5. Delivered — dispatcher event subject scoping

`backend/app/services/communication_workflow_events.py`

The dispatcher filed its policy events with `entity_id = org_id`. They were
durable and unreachable: activity projections match `entity_type` / `entity_id`
exactly, so no record could ever show them.

The subject is now **resolved at the canonical producer** rather than passed in
as a loose pair, so no call site can state a subject that contradicts what it
knows.

| Question | Answer |
| --- | --- |
| Authoritative fields | `communication_threads.primary_entity_type` and `primary_entity_id` — the pair `communication_threads_identity_uq` is defined over |
| Entity-type vocabulary | echoed **verbatim**. The admin API's singular→plural aliasing applies to the query parameter only, never to stored rows. Translating at the dispatcher would file `message_blocked` under `opportunities` while the same thread's `message_sent` sits under `opportunity` |
| Entity-type assumptions | none. A thread may be an opportunity, a person, a job, or anything a caller made canonical |
| No valid primary entity | the event is still emitted, filed against the org, and **marked** `subject_scope: "org_fallback"` with the thread's declared type and id. Durable beats precise; silently-degraded beats neither |
| Inbound | passes its own resolved anchor via `subject_entity`. Inbound reuses a canonical SMS thread by recipient key whose primary entity may be an older business object, so thread-derivation would refile it onto the wrong record |
| blocked vs deferred | distinct event types, distinct `outcome` values, same record |
| Retry | `workflow_events` is append-only. A deferred message that later dispatches emits `message_sent` alongside the earlier `message_deferred`; the refusal is not erased. Note the *row's* `eligibility_decision` is patched, so the row is last-write-wins while the event history is complete |

---

## 6. Not delivered — `render_blocked` durability

See `closeout/04-TECHNICAL-DEBT-REGISTER.md` D-13. It is an open ownership
decision, not an oversight, and it does **not** affect Interactive Tour: all six
parent-facing Tour templates clear the canonical renderer on both channels
(`web/tests/tours/tourCommsTemplates.test.ts`).

---

## 7. Not delivered — browser proof

The controlled channel-failure run (email succeeds, SMS blocked through a real
supported condition, booking committed, one durable blocked row, one event,
operator Activity showing a human-safe reason) is **not** captured.

Blocker: operator sign-in in the certification app targets
`https://127.0.0.1/auth/v1/token` — scheme upgraded, port dropped — against a
stack configured at `http://127.0.0.1:54421`. Desktop evidence resumes when that
is repaired.

---

## 8. Workstream state — facts only

| WS | Concrete change |
| --- | --- |
| WS5 Delivery Telemetry | Blocked and deferred outcomes are durable at both boundaries and reach the record they concern. Blocked sends still write no `communication_delivery_events` row — deliberate: that table is provider-neutral **delivery** lifecycle, and a policy refusal is explicitly not a provider outcome |
| WS8 Preferences | Opt-out, suppression, marketing-opt-in and emergency-permission refusals are each explainable on the record. Tour sends still take the counted `operational` category fallback rather than classifying explicitly |
| WS12 Template Platform | Unchanged. Preview endpoint still not converged (D-1) |

---

## 9. Next exact action

Repair certification-app auth, then run the controlled channel failure and
capture desktop evidence of email queued, SMS not sent, and a human-safe reason
on one record.
