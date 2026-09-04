---
owner: platform
status: sprint
last_reviewed: 2026-09-04
---

# Lane accountability, navigation and notification hygiene

Four claims are made in this document and they are not equally strong. The
labels are load-bearing:

- **OBSERVED** — measured on this host, from real records. Reproducible.
- **IMPLEMENTED** — shipped code with tests. Not yet observed in production use.
- **PROJECTED** — computed from observed data through shipped code. Honest
  arithmetic, not a field measurement.
- **DEFERRED** — deliberately not built. Named so it is not mistaken for done.

## 1. Notification hygiene

**OBSERVED.** 500 records; the full census and method are in
[`NOTIFICATION-AUDIT.md`](NOTIFICATION-AUDIT.md). The headline contradicted the
premise the work started from: automatic authorization had **not** created push
noise. All 245 `governed_action_*` records pushed zero times. The real defects
were an **inversion** (33 approval requests, the only actionable class, never
reached the phone) and a **feed flood** (`governed_action_worker_resumed` at 46%
of every record ever written).

**IMPLEMENTED.** One semantic policy, `deliveryClassFor()`, classifying on
canonical metadata — attention class, run state, event type — never on action
identity. Obligation is evaluated before routine, so suppression cannot mute a
live demand. Routine progress no longer opens a record but may still close one,
which is what keeps a resolved approval from becoming a stale Needs You item.
17 tests.

**PROJECTED.** Replaying the same 500 records through the shipped code:
records written 500 → 255, push-*eligible* 222 → 252. On its own that is a
**re-targeting, not a reduction**.

**OBSERVED.** Breaking the 252 down by category is what changed the design:
**185 of them (73%) are completions**. The automation everybody suspected pushes
nothing at all. So the phone noise was, almost entirely, work finishing.

**IMPLEMENTED.** Category preferences — Needs You, Failures, Completions — with
completions defaulting off. Delivered push falls **222 → 67, a 70% reduction**,
while the 33 approval requests that previously reached nobody now arrive. One
checkbox restores completions.

**DEFERRED.** Presence detection ("only notify when I am away").

**INCIDENT.** During acceptance I called `resetNotificationsForTests()` against
the live runtime root and destroyed the operator's 500-record store and its read
state. Authoritative history (2,116 events in `notifications/events.jsonl`, the
audit logs, the execution-run store) was untouched — the store is a bounded
derived projection. Nothing awaiting a decision was lost (0 governed actions were
pending). I did not reconstruct it: read state cannot be recovered, and
fabricating notification history is worse than the gap. The helper now refuses
any non-disposable root. Full account in
[`NOTIFICATION-AUDIT.md`](NOTIFICATION-AUDIT.md).

## 2. The phone switch

**IMPLEMENTED.** A durable server-side preference, gated inside
`sendPushToSubscriptions` — the one function every push passes through, so a
path added later inherits it without anyone remembering. It is a primary
control rendered above the folded delivery-status report, not inside it.

The guarantee, and it holds by construction rather than by discipline: the
durable record is always written **before** delivery is attempted, so OFF
removes the interruption and provably nothing else. Needs You, Activity, lane
state, unseen counts and the audit log are untouched. Nothing queues for replay
— turning it back on means "tell me what happens next".

## 3. Progress accountability

**IMPLEMENTED.** `progress_percent`, `confidence`, `summary`, `remaining_work`,
`source` and `updated_at` already existed with a 30-minute freshness window.
Added: a **finish estimate** — `estimated_remaining_minutes` or
`estimated_finish_at`, plus `estimate_confidence`, `estimate_source` and
`estimate_updated_at`.

**It is reported, never derived.** The product already refused to compute an
ETA, on the grounds that elapsed time divided by a provider's own guess is "a
lie with a decimal point on it". That refusal stands, and a test enforces it: a
percentage alone produces no finish estimate. What is new is a different claim —
the provider stating how much longer it needs — which only the party holding
the plan can make. Minutes normalise to an absolute instant against the
report's own timestamp, so the claim can only ever age honestly.

Rendered through `operatorStatusLine()`, the single projection all six surfaces
already share: `Working · ~62% · ~20m left · Claude`. A stale or absent claim
drops out of the line rather than rendering an empty slot.

**A finish claim is also gated on the run still moving.** Observed on the
installed runtime with a real estimate: a lane that reached `NEEDS_INPUT` still
rendered `Needs you · ~80% · ~19m left`. It was not nineteen minutes from
finishing — it was stopped, waiting for a person, and would have said nineteen
minutes for as long as nobody answered. `FAILED` promised a finish for work that
had stopped; `COMPLETE` promised one it had already reached. The percentage
describes the past and survives; the finish time is a promise about the future,
which only a moving run can make.

**IMPLEMENTED.** Solicitation: `progressSolicitationDue()` marks an active run
whose estimate is missing or stale, and the request rides the orientation text
the provider already receives. **The provider is asked; the operator is not** —
they are the party waiting for the answer, and interrupting them to ask how
long their own agent needs is exactly backwards. It raises no notification, and
a test asserts the solicitation path touches no notification API and names only
CLI flags that `vac-run-status.mjs` actually parses.

## 4. Navigation

**OBSERVED — already satisfied, not rebuilt.** Repository → folder → lane
nesting, lanes ordered by canonical activity with `observed_at` excluded so
polling cannot reshuffle the list, collapse memory, and unfiled lanes under a
quiet "Lanes" group **inside** the repository rather than a red "No folder".
All of it landed in earlier work on this lane and is covered by 9 passing rail
tests. Verified rather than reimplemented; Home vs Lanes is unchanged.

## Test position

788 → 830 tests. The same 18 failures present on `origin/staging` before this
work, pinned by name and compared per run, so the claim is "no new failures",
not "the suite is green".

One further pre-existing failure surfaced during acceptance,
`development-mission-delegation-integration`. It is environment-sensitive, not
caused by this work: it fails identically on the toolkit built from staging
**before** this merge (`42be8411d545`) and after (`ef9b58032a78`), while having
passed in the worktree earlier the same day. A required deterministic gate
measures `false` where it previously measured unmeasured. Recorded, not
attributed to this change.
