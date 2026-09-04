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
`deliveryClassFor` / `isRoutineProgress` implementation:

| | BEFORE | AFTER |
|---|---|---|
| Records written to the store | 500 | **255** |
| Push attempted / eligible (phone ON) | 222 | **255** |
| Push delivered (phone OFF) | 222 | **0** |

| Delivery class | Records | Opens a record | Push-eligible |
|---|---|---|---|
| `routine_automatic` | 245 | 0 | 0 |
| `important_terminal` | 222 | 222 | 222 |
| `human_action_required` | 33 | 33 | 33 |

(Event totals drift by one or two against the census table above: the store is
live and kept collecting real events between the audit and the replay.)

### Stated honestly: this is a re-targeting, not a reduction

Push-eligible volume goes **up**, 222 → 255. That increase is exactly the 33
approval requests that previously reached nobody. It would be easy to present
this pass as a 70% cut by also silencing routine completions, and that would be
a worse product: a completion is the end of work the operator personally asked
for, and they are entitled to hear about it.

What actually improves:

- **Notification-feed volume falls 49%** — 245 of 500 records (`worker_resumed`
  232, `governed_action_complete` 13) stop being written at all and remain
  visible as lane activity and in the audit log.
- **The inversion is corrected.** 33 → 33 of the actionable class are now
  eligible, from 0.
- **The operator gets an actual off switch**, which is the only thing in this
  pass that reduces delivered push to zero, and it is theirs to choose.

### What the phone switch does and does not do

| | Phone ON | Phone OFF |
|---|---|---|
| Push to device | yes | **no** |
| Needs You | unchanged | **unchanged** |
| Activity feed | unchanged | **unchanged** |
| Lane state / unseen counts | unchanged | **unchanged** |
| Audit log | unchanged | **unchanged** |

Nothing is queued while it is off. The switch gates delivery inside
`sendPushToSubscriptions` — the one function every push passes through — and the
durable record is always written before delivery is attempted, so the guarantee
holds by construction rather than by remembering to honour it at each call site.

## DEFERRED

Active-client presence detection ("only notify my phone when I am away") is not
built here. The feature delivered in this pass is the manual ON/OFF preference.
