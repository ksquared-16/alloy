---
owner: platform
status: sprint
last_reviewed: 2026-09-04
---

# Notification audit — what Vacilando actually sends

**OBSERVED.** 500 real records from the Gateway's own store
(`~/.local/state/alloy-dev/gateway/vacilando/notifications.json`), joined to the
canonical governed-action store by `request_id`. No sampling, no estimation.

The audit was run BEFORE any policy was written, and it did not find what the
instruction expected. That is the point of running it first.

## The BEFORE census

| Event type | Records | **Pushed** | Attention class |
|---|---|---|---|
| `governed_action_worker_resumed` | 232 | **0** | informational |
| `complete` | 188 | **188** | informational |
| `governed_action_approval_required` | 33 | **0** | **actionable** |
| `failed` | 21 | **21** | informational |
| `abandoned` | 13 | **13** | informational |
| `governed_action_complete` | 13 | **0** | informational |
| **Total** | **500** | **222** | |

Attention class overall: 467 informational, 33 actionable.

Authorization mode, for the 278 notifications that resolve to a governed record:

| Mode | Count |
|---|---|
| `operator_approved` | 143 |
| (request not retained in store) | 92 |
| `director_approved` | 35 |
| `existing_lane_standing_authorization` | 5 |
| `policy_default_requires_operator` | 2 |
| `privileged_read_requires_operator` | 1 |

The other 222 notifications carry no `request_id`: they are run-lifecycle events,
and they are exactly the 222 that push.

## The finding: the flow is inverted

**The only actionable class never reaches the phone.** All 33
`governed_action_approval_required` records — the one category that genuinely
needs a human — have `delivery.attempted: false`. Meanwhile 188 routine
"Work complete and ready for review." events push every time.

This is structural, not a tuning problem. `lane-push.mjs:notifyRunOutcome` is the
only path that calls `sendPushToSubscriptions`, and it fires on RUN STATE
(`COMPLETE` / `NEEDS_INPUT` / `FAILED` / `ABANDONED`). Governed-action
notifications are recorded by `lane-notifications.mjs` and never enter that path
at all. So the phone hears about work finishing and never about being asked.

## The second finding: the noise is in the feed, not the phone

`governed_action_worker_resumed` is **232 of 500 records — 46%** of everything in
the store, and it pushes nothing. It is routine automation announcing itself:
exactly what `isRoutineProgress()` exists to suppress, and it is missing from
`ROUTINE_PROGRESS_EVENTS`.

So the instruction's premise — that increased automatic authorization has created
*push* noise — is not what the data shows. Automatic operations are already
push-silent. What they do is flood the in-app notification feed.

## Redundancy

None. 222 pushes across 222 distinct `subject_key` and 222 distinct `run_id`.
No subject pushed twice. The per-run keying introduced earlier is holding.

Pushed summaries: 117 "Work complete and ready for review.", 29
`operator_follow_up`, 14 `undelivered_provider_prompt_block`, 9
`needs_input_without_operator_input`, 4 `operator_cancelled`, 3
`turn_finished_session_remains`, 2 `managed_reports_without_recent_activity`.

## Classification

| Class | Event types | Records | Push today | Push under policy |
|---|---|---|---|---|
| **A. Human action required** | `governed_action_approval_required` | 33 | 0 | **eligible** (was never eligible) |
| **B. Important terminal** | `failed`, `abandoned` | 34 | 34 | eligible |
| **B. Important terminal** | `complete` | 188 | 188 | eligible |
| **C. Routine automatic** | `governed_action_worker_resumed`, `governed_action_complete` | 245 | 0 | never — Activity only |
| **D. Diagnostic** | none observed | 0 | 0 | never |

## MEASURED after-policy

Not a projection. The 500 records were replayed through the shipped
`deliveryClassFor` / `isRoutineProgress` / `categoryForPush` implementation.

### Step 1 — the semantic policy

| | BEFORE | AFTER |
|---|---|---|
| Records written to the store | 500 | **255** |
| Push-*eligible* by policy | 222 | **252** |

On its own this is a **re-targeting, not a reduction**: eligible push rises, and
the rise is exactly the 33 approval requests that previously reached nobody.
Reported honestly as such rather than presented as a win.

### Step 2 — what the 252 eligible events actually are

This is the breakdown that changed the design. Categorising them:

| category | records | push-eligible | share of push |
|---|---|---|---|
| **completion** | 185 | **185** | **73%** |
| Needs You / approval required | 33 | 33 | 13% |
| failure requiring recovery | 21 | 21 | 8% |
| abandoned (Vacilando closed it) | 13 | 13 | 5% |
| routine automatic | 248 | 0 | 0% |

**Completions are 73% of everything that reaches a phone.** The automation
everybody suspected pushes nothing at all. "Too many notifications" was, almost
entirely, the sound of work finishing.

### Step 3 — category preferences, and the real reduction

| | count |
|---|---|
| Originally delivered | 222 |
| Delivered under default preferences (Needs You + Failures) | **67** |
| **Reduction in phone pushes** | **70%** |
| Delivered with the phone switched off | **0** |

A completion is worth knowing and rarely worth waking up for: nothing is
blocked, and it will still be done in the morning. It remains in Needs You,
Activity and the lane — only the phone stays quiet. One checkbox brings it back.

The two categories that stay on are the ones where *not* telling someone has a
cost: a decision blocking work, and a failure needing recovery.

### What the phone switch does and does not do

| | Phone ON | Phone OFF |
|---|---|---|
| Push to device | per category | **no** |
| Needs You | unchanged | **unchanged** |
| Activity feed | unchanged | **unchanged** |
| Lane state / unseen counts | unchanged | **unchanged** |
| Audit log | unchanged | **unchanged** |

Nothing is queued while it is off. The switch and the category gate both live
inside `sendPushToSubscriptions` — the one function every push passes through —
and the durable record is always written *before* delivery is attempted, so the
guarantee holds by construction rather than by discipline.

## DEFERRED

Active-client presence detection ("only notify my phone when I am away").

## INCIDENT — live notification store destroyed during this acceptance

While verifying the `worker_resumed` suppression, `resetNotificationsForTests()`
was called with `ALLOY_RUNTIME_ROOT` pointed at the Gateway's own runtime root.
It emptied the operator's live store: **500 durable records and their read
state**, in one call that looked harmless at the call site.

**What survived.** The authoritative history was untouched —
`notifications/events.jsonl` (2,116 governed events since 2026-08-19),
`audit.jsonl`, `governed-actions/audit.jsonl`, and the execution-run store. The
notification store is a *bounded derived projection* (capped at 500, newest
first), not a system of record.

**What was lost.** The derived record list and, materially, the operator's
read/seen state. At the moment of loss the store held 1 actionable and 2 unseen
items; there were 0 governed actions still pending an operator, so nothing
genuinely awaiting a decision was dropped.

**Not reconstructed, deliberately.** Run-lifecycle records could be re-derived
from the execution-run store, but their read and delivery state could not — that
would have meant fabricating notification history, which is worse than the gap.

**Closed by code, not by resolve.** `resetNotificationsForTests()` now refuses
any root that is not demonstrably disposable (an OS temp directory, or an
explicit `VACILANDO_ALLOW_DESTRUCTIVE_RESET=1`). The suffix "ForTests" was the
only protection it had, and a name is not a guard.
