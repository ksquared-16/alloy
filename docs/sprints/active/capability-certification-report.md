---
owner: engineering
status: certification
last_reviewed: 2026-07-24
supersedes: []
---

# Capability Certification Report

Every claim below was executed against the running application (slot 1, `127.0.0.1:3011`,
authenticated QA identity) on the live tenant record **Wenc Family**
(`b13ecce9-74d4-442d-9891-7c88f587bc23`), department `3933ac47…`, stage `lead`, work item
`130064f9…`. Subjects were harvested from the app's own view models — no fixtures, no seeded
data. Evidence: `docs/sprints/active/assets/capability-certification/`.

**One thing was not executed, deliberately.** The tenant's recipient of record is
`tarynw@hotmail.com` / `+1408…` — a real personal email and phone. Nothing available in the
worktree proves a send stays on this machine, so **Message and Send Form were never
dispatched**. Everything up to the send is certified; the send itself is not. That is a
decision I need from you, not an omission (see §6).

---

## 1. Certification Matrix

| Capability | Executes | Persists | Activity | BP | Recompose | Rollback | Operator Trust | Certified |
|---|---|---|---|---|---|---|---|---|
| **Record Outcome** | YES | YES | YES | YES | YES | YES | YES | **YES** |
| **Schedule Tour** | YES | YES | YES | **NO** | YES | YES | **NO** | **NO** |
| **Message** | **NOT EXECUTED** | — | — | — | — | — | — | **NO** |
| **Send Form** | **NO** — nothing to send | — | — | **NO** | — | — | **NO** | **NO** |
| **Add Child** | **NOT EXPOSED** | — | — | — | — | — | — | **NO** |
| **Add Family Member** | **NOT EXPOSED** | — | — | — | — | — | — | **NO** |
| **Requirement handoffs** | partial | n/a | n/a | n/a | — | n/a | — | **NO** |
| **Lifecycle transitions** | **NOT EXPOSED** | — | — | — | — | — | — | **NO** |

**One capability of eight is certified.**

### Record Outcome — the certified chain

Executed for real three times. Correlation `fa2b48bb-ddfc-4e15-81b2-5738eca7121f` (third run):

| Stage | Observed |
|---|---|
| Capability Resolution | `record_outcome` resolved from capability metadata; outcome list came from the tenant plan (`reached_qualified / left_message / awaiting_response / unable_to_reach / contact_closed_lost`) |
| Validation | `validate` step `ok`, 0 ms |
| Platform Transaction | `committed`, `changed: true`, 4 steps all `ok`, server total 4 593 ms |
| Canonical Persistence | `work_state` 1 055 ms — `attempt_count` 2 → 3, `last_outcome` → `{left_message, 2026-07-24T02:33:53Z}`, `due_at` → +2 days |
| Business Process | `apply_outcome_rules` 1 023 ms — applied `reopen_work{template_key: contact_family, due_days: 2}`; `failed_targets: []` |
| Activity | `contact_outcome_trace` 1 746 ms — `workflow_events` 11 → 12, one row `stage_work_outcome_recorded`, **payload carries the same correlation id** |
| Cache / Recomposition | one `stage-work` refetch; SPA marker survived; **0 hard navigations**, **0 page reloads** |
| Visible UI | card re-rendered with the new attempt state |
| Integrity | **1** POST (no duplicate execution), no ghost rows — `tour_bookings` count unchanged at 1 across all three runs |

Rollback certified separately and non-destructively: a configured outcome against a
non-existent work item gives `validate:ok → work_state:failed → apply_outcome_rules:skipped`,
HTTP 400, `changed: false`, no `integrity_breach`.

---

## 2. Defects Found

### Runtime

**R1 — the activity row carried no correlation id.** A recorded outcome returned correlation
`81551a0f…` while its `workflow_events` payload had none, so an activity record could not be
traced back to the transaction that produced it. **FIXED** (§3).

**R2 — the rollback plan leaked into the API response.** `outcome_execution.undo` serialized
its closures to hollow objects in the operator-facing payload. **FIXED** (§3).

**No other runtime defects found.** Specifically observed absent, not assumed: ghost records,
ghost activities, duplicate execution, duplicate requests, stale VM, page reloads, partial
commits, false success, false failure.

### Business Process

**B1 — the configured attempt cap is not enforced.** The work template configures
`min_attempts: 3, max_attempts: 3` ("Requires 3 attempts within 7 days"). At attempt **3 — the
configured maximum** — the `left_message` rule still applied `reopen_work` and pushed `due_at`
out another 2 days. The completion-policy path correctly stops at the cap
(`shouldRepeatWorkAfterRetryOutcome` returns `repeat: false` when `attemptCount >= max`), but
the configured `outcome_rules` target reopens the work independently and has no attempt
awareness. **A lead loops in Contact Family forever and never escalates.** The gating mechanism
exists (`when_attempt_count_lt`) and is simply not set on this rule. Not fixed — you said not to
author Business Process behaviour this session.

**B2 — a confirmed tour advances nothing.** Carried from the prior session and still true:
booking emits `{tour_booking, scheduled}` and matches zero configured rules. The Wenc lead has
a **confirmed tour on 27 Jul 2026** and is still in stage `lead`.

### Configuration

**C1 — Send Form is exposed with nothing to send.** The host mounts and renders *"No active
forms are configured for this organization."* The operator is offered an action that cannot
function on this tenant.

**C2 — published tenant plans shadow code defaults.** Carried and re-confirmed live: the
tenant's lead outcomes (`reached_qualified`, `awaiting_response`, `unable_to_reach`,
`contact_closed_lost`) differ from the code defaults (`reached_family`, `needs_follow_up`,
`interested`, `not_interested`). There is still no re-publish path.

### Capability

**P1 — Schedule Tour sends the operator to an action that isn't there.** With a booking already
active, the host correctly refuses and says *"An active tour booking already exists for this
opportunity. Pick a new time with Reschedule."* `reschedule_tour` is **not exposed** anywhere on
What's Next. The instruction is a dead end.

**P2 — four scoped capabilities are not on the surface.** `add_child`, `add_family_member`,
`update_enrollment_status`, `mark_lost`, `mark_won` are in the capability registry but resolve
to nothing on this record's What's Next. They cannot be certified through this surface.

### Data

**D1 — the certification fixture holds real contact details.** `tarynw@hotmail.com`,
`+14088859652`. This is what blocks Message/Send Form certification.

### UX

**U1 — "Blocked" alongside four enabled actions.** The card shows a `Blocked` chip (Children →
Program, Date of Birth outstanding) while all four actions stay enabled, and Record Outcome
succeeds. Reported as an observation, not a defect: I do not know whether "Blocked" is meant to
describe stage advancement or the work item. Needs your ruling.

---

## 3. Fixes Applied

### R1 — activity row missing the correlation id

- **Root cause:** `recordStageWorkContactOutcomeTrace` never received the transaction's
  correlation id, so `emitEvent` wrote a payload without one. The chain was instrumented
  everywhere except its last link.
- **Owner:** platform / lifecycle.
- **Commit:** `28e677481`.
- **Evidence:** re-executed for real — correlation `fa2b48bb-ddfc-4e15-81b2-5738eca7121f` now
  appears in both the HTTP response and the `workflow_events` payload of row
  `7fa3d21f-1188-42e1-9ba4-3f6cd3a0bfb0`.

### R2 — rollback plan in the API response

- **Root cause:** the route returned `outcome_execution` verbatim, including the internal
  `undo` array of compensation closures.
- **Owner:** platform.
- **Commit:** `28e677481` (same).
- **Evidence:** response payload no longer contains `undo`; 30 unit tests and the project
  typecheck gate pass.

No other fixes were applied. B1, B2, C1, C2, P1, P2 are reported, not fixed — each is either a
configuration change or a product decision, and this session was certification.

---

## 4. Remaining Uncertified Items

| Item | Why not certified |
|---|---|
| **Message** | Never executed end-to-end. Blocked on D1 — a send would reach a real person. Host resolution, warm open (72 ms), request hygiene and recipient resolution ARE certified; the send, persistence, activity and Business Process are not. |
| **Send Form** | Cannot be executed — no active forms configured (C1). |
| **Schedule Tour** | Execution, persistence, activity, recomposition and rollback are certified. Fails on **BP** (B2) and **Operator Trust** (P1). |
| **Add Child / Add Family Member / Lifecycle transitions** | Not exposed on What's Next (P2). Nothing to certify on this surface. |
| **Requirement handoffs** | The owner group renders and is navigable (`data-work-readiness-owner="children"` → `child:program_interest`, `child:date_of_birth`), but I did not execute the handoff navigation and back. Partially observed only. |
| **Tour reschedule / cancel / complete / no-show** | Made atomic and unit-certified earlier this sprint, but **not executed live** — every one of them runs the comms orchestrator, which is subject to D1. |

---

## 5. Release Recommendation

> **Would you deploy this platform to a production childcare organization today?**

# NO

Blocking issues only:

1. **Two of the four operator actions on the primary surface are unproven.** Message has never
   been executed end-to-end anywhere, and Send Form cannot execute at all on a tenant with no
   forms configured. A director's day is mostly messaging families.
2. **Booking a tour changes nothing in the Business Process** (B2). The Wenc lead has a
   confirmed tour and still sits in `lead`. A director would book a tour, see the process not
   move, and stop trusting the process.
3. **Contact work never escalates** (B1). The configured 3-attempt cap is defeated by the
   configured reopen rule; a lead that is never reached loops indefinitely with no hand-off.
   Leads go quietly stale — the single worst failure mode for an enrollment funnel.
4. **Schedule Tour instructs the operator to use an action that does not exist** (P1).

That is the whole list. Everything else found is recorded above as non-blocking.

---

## 6. Decision I need from you

**May I execute Message (and Send Form, once a form exists) against this tenant?** It would
dispatch a real email and/or SMS to `tarynw@hotmail.com` / `+14088859652`. I did not do this on
my own authority.

Cheaper alternatives, if you prefer: point the QA fixture at an address you own, or confirm
that this tenant's comms bindings are disabled in dev — in which case I can certify the send
path immediately and the Message row of the matrix can be closed.

---

## 7. How to re-run

```bash
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json npx playwright test playwright/tests/capability-certification-record-outcome.spec.ts playwright/tests/capability-certification-hosts.spec.ts playwright/tests/capability-certification-surface.spec.ts playwright/tests/platform-transaction-cert.spec.ts --workers=1
```

Record Outcome is the only mutating spec: each run adds one contact attempt to the Wenc lead.
