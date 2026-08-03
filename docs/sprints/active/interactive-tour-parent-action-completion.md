---
owner: platform
status: active-sprint
last_reviewed: 2026-08-03
supersedes: []
---

# Interactive Tour — Parent Action Completion

Completes the customer lifecycle the invitation links already promise. Slice C built
the authority, Slice D sends the invitation; this slice makes the parent's side work.

Worktree `wt4-interactive-tour-delivery` (slot 4, port 3014), branch
`agent/claude/4-interactive-tour-delivery`.

---

## 1. Legacy-route convergence audit

The surface is two files: an 8-line server shell and a 114-line client.

**The transport is already converged.** The client calls only
`/api/public/tour-booking/<token>/{resolve,slots,book}`, and Slice C moved all three
behind `guardTourActionRoute` → `authorizeTourAction`. There is no parallel token
path and no parallel booking path to dismantle. What is wrong with the page is
**presentation**, not architecture.

### Answers

**1. What token type does the page expect?**
The opaque raw token in the URL path — byte-identical to what `mintTourInvitation`
issues. Only its SHA-256 hash is stored. No second format exists.

**2. Where is token validation performed?**
Entirely server-side, inside `guardTourActionRoute`. The client never inspects,
parses, or validates the token; it forwards it. Forgery-shaped failures return 404.

**3. Does the page independently resolve or mutate bookings?**
No. Every read and write goes through the guarded routes. There is no Supabase client
in the page, and `check:service-client-principal` records these routes as
transitive-only holders.

**4. Does it bypass scoped public-action authorization?**
No — post-Slice C. Each route declares a constant `requiredActions`, so a
decline-only token cannot read slots and a view token cannot book.

**5. Can one route support all six actions without separate runtimes?**
Yes, and it must. The token's own `action_kind` already decides capability, and
`/resolve` returns `available_actions` derived from the credential. The page branches
on **what the parent may do**, not on which runtime to enter. One page, one
credential, six outcomes.

**6. Which legacy code becomes unreachable and should be deleted?**
`TourBookingPublicClient.tsx` in its entirety — 114 lines. It is a developer harness,
not a parent experience, and three of its behaviours are actively wrong for a
customer surface:

- it renders raw server error strings straight to the parent (`setErr(j.error)`)
- it fakes a booked state by string-appending the internal `status_key` to the label
- it exposes no decline, confirm, reschedule, cancel, expiry, or consumed state

It is replaced, not preserved. No production caller depends on it beyond the route
itself. `page.tsx` is reusable unchanged.

**7. What is the single canonical action-consumption boundary?**
`consumeTourAction` inside `authorizeTourAction`, reached only via
`guardTourActionRoute`. It is a conditional `UPDATE ... WHERE consumed_at IS NULL`,
which is what makes consumption atomic under concurrency. The page never consumes.

### Classification

| Part | Verdict |
|---|---|
| `page.tsx` server shell | reusable unchanged |
| Seven public API routes | reusable unchanged (converged by Slice C) |
| Token handling | reusable unchanged |
| `TourBookingPublicClient.tsx` | **obsolete — delete after parity** |
| Client-side error surfacing | obsolete — leaks raw errors |
| Client-side `status_key` display | obsolete — leaks internal vocabulary |
| Dangerous parallel token/booking behaviour | **none found** |

---

## 2. Authority chain

```
parent opens link
  → guardTourActionRoute            token → invitation + allowed action (404 on forgery)
  → authorizeTourAction             org, invitation, action kind, expiry, state
  → route handler                   one route per action, constant requiredActions
  → canonical tour booking service  createTourBooking / confirm / reschedule / cancel
  → consumeTourAction               atomic single-use close
  → recordTourEvent                 workflow_events
  → tourCommsOrchestrator           canonical render + enqueue
  → Business Process outcome        registered execution path, never a public write
```

The public route never writes stage, status, work, or queue membership.

---

## 3. Booking authority boundary (Director decision, 2026-08-03)

The canonical `tour_bookings` row is domain truth. Business Process stage movement and
communications are downstream consequences: observable and retryable, never part of the
transaction that decides whether the parent booked.

**Before** — all inside, so any could revoke the booking:

```
authorize · validate slot · insert booking · consume action · invitation update
· opportunity metadata mirror · CONFIGURED STAGE SIGNAL · lifecycle event
```

**After** — the transaction owns only what determines success:

```
inside:   authorize · validate slot · insert booking · consume action
          · invitation update · opportunity metadata mirror · lifecycle event
outside:  stage signal · stage/work sufficiency · communications
          · stage-sync follow-up
```

**BP authority is not bypassed.** The signal still runs through
`applyConfiguredStageRulesForDomainSignal`; nothing writes `stage_key`, status, queue
membership or Current Work directly. When no transition is configured the mirror is
kept (it is truthful — the tour exists) and the precise domain, signal and reason are
recorded through the existing canonical activity path as
`tour_stage_sync_follow_up_required` with `retryable: true` and
`booking_committed: true`. No new reliability platform was introduced.

A genuine integration **write** failure still rolls back. Only an unapplied stage rule
is treated as downstream.

**Second defect, found by writing the replay test:** the book route's
idempotent-replay branch was unreachable. The authorizer denied a consumed credential
with 409 before the route could return the prior booking, so a parent who
double-submitted saw an error next to a booking that had succeeded. Consumption is now
decided at the END of authorization — after recipient, invitation-state and
org/opportunity/location binding — so replay is strictly **more** checked than a first
use, and is served only where a route opts in.

No schema change.

## 4. Correction to the durable record

An earlier revision of the Slice D artifact claimed `orchestrateTourCommsForBooking`
had **zero production callers**. That was **wrong** — a grep artifact, because the real
callers are named `orchestrateTourBookingConfirmed`, `…Rescheduled`, `…Canceled`,
`…Completed`, `…NoShow`.

Verified truth:

- the orchestrator already has production callers in `tourBookingService.ts`
  (lines 333, 515, 589, 642, 685, 728)
- booking lifecycle communications were **already wired**, including on the create
  path, where confirmation comms run only when the booking is not pending approval
- Slice D **extended the same orchestrator** to invitation subjects via
  `TourCommsSubject`
- **no second communications runtime was created**

## 5. Out of scope

No-show follow-up, inbound SMS replies, calendar-provider sync, parent portal or
login, second invitation state machine.
