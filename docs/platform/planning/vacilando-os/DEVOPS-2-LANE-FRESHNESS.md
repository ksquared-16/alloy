---
owner: platform
status: canonical
last_reviewed: 2026-09-12
supersedes: []
---

# DevOps 2 — Lane Freshness & Resume V1

**Status.** Implemented and certified. Candidate held behind the active Host
Lifecycle soak.

**Baseline.** `origin/staging` @ `84e382e56`, with DevOps 1 (`2eb5c3f27`) merged in
as the first commit — this mission is required to *use* `resolveLaneBootstrap`,
`laneBootstrapIsStale` and `LANE_BOOTSTRAP_CONTRACT_VERSION`, none of which are in
staging yet.

---

## 1. The failure, re-measured

A Governance lane was once found 654 commits behind staging — **at promotion
time**, after the work was done. Re-measured on 2026-09-12, the live fleet still
carried lanes **207, 390, 719, 915 and 1930** commits behind.

That is not a thing a lane should discover at the end.

## 2. Authority audit — everything was already owned

| Fact | Canonical owner | New? |
|---|---|---|
| Bootstrap contract, baseline | `lane-bootstrap.mjs` (DevOps 1) | reused |
| Worktree, branch, slot binding | `lane-worktree-lifecycle.mjs` | reused |
| Git truth, divergence, durability | `worktree-retirement-observe.mjs` (`measureWorktreeGit`) | reused |
| Shared branch references | `branch-reference.mjs` | reused |
| Lane activity | lane `updated_at` + run timestamps | **derived, not stored** |
| Per-slot QA identity | `browser-auth.mjs` | reused, extended |
| Doctor | `health.mjs` `CHECKS` / `finding()` | reused |

**No new registry, lifecycle, poller or recovery system.** Nothing persists a
freshness verdict — a stored verdict is one that can be wrong, because staging
moves underneath it.

## 3. Thresholds, chosen from measurement

The mission's example values were deliberately not adopted. The fleet was
measured:

**Inactivity.** Nine lanes had acted within 6h; the next three sat at 27h, 77h and
108h. *Nothing occupied the range between.* → `recent_hours: 12` (contains the
active cluster with room for an overnight pause), `long_inactive_hours: 72`.

**Divergence.** Healthy active lanes carried 0, 12, 20 behind. Diverged ones
carried 112, 207, 390, 719, 915. *Nothing sat between 20 and 112.* →
`material_behind: 50`, placed in that empty gap.

All four live in `FRESHNESS_POLICY`, env-overridable, in one place.

## 4. Inactivity and divergence — and what each actually decides

The first cut of this required *recency* for a lane to be CURRENT, which made
**idleness alone sufficient to declare staleness** — exactly what the instruction
says not to do. A lane idle 30 hours with zero divergence and a current bootstrap
has nothing to reconcile, and sending it to a no-op rebase is how a freshness gate
becomes something people route around.

Corrected:

- **Divergence and the bootstrap contract decide staleness.**
- **Inactivity decides whether the BASE can be trusted.**

That second half is the real content of "mandatory base revalidation". `behind` is
measured against the *local* `origin/staging` ref, which is only as current as the
last fetch — so for a long-quiet lane, "0 behind" may mean "identical to a staging
from last Tuesday". A reassuring number computed from a stale input is worse than
no number. A long-inactive lane is therefore routed through reconciliation (which
fetches first) rather than declared current on an unverified base.

## 5. Refusals

Evaluated **before** staleness, because a dirty or shared worktree must be refused
whether or not it is behind. Each names its reason; none is converted into a
generic approval prompt, because **no operator decision makes rebasing a dirty
worktree safe**.

`BLOCKED_DIRTY` · `BLOCKED_SHARED` · `BLOCKED_CERTIFICATION` · `BLOCKED_CONFLICT` ·
`UNRESOLVED_BOOTSTRAP`

Reconciliation re-evaluates rather than trusting the caller's verdict: between an
evaluation and a mutation a worktree can become dirty or a commit can become a
candidate.

**No new Git strategy.** Fetch, then rebase the lane's own commits onto current
staging — the operation the promotion path already assumes, since every candidate
in this programme is cut fresh from staging. A conflict **aborts** and restores the
pre-image; the pre-image SHA is returned on every path, success or failure. A
control asserts the command stream contains no `--force`, `reset --hard`, `clean`
or `push`.

The promotion-candidate guard defaults to convention (`promote/*` branch, or a
worktree under the promotions root) and is deliberately **broad**: a false positive
costs a manual rebase; a false negative silently uncertifies a candidate. It is
injectable so DevOps 6 can replace convention with a registry.

## 6. The QA correction — capability must be uniform

Re-measured, and **the DevOps 1 observation had moved**: slot 12 had since gained
an identity. Actual state was **slots 7, 9, 10, 11 undeclared**.

The root cause is structural, not accidental: `alloy-config.example` declares
identities for slots **1–6** because `ALLOY_MAX_AGENTS` was 6 when it was written.
The host runs **12** managed slots, and the gap was patched one slot at a time in
the *installed* config whenever a lane happened to land somewhere undeclared.

That meant **which slot the scheduler picked decided what a lane could do** —
`qaIdentityForSlot` is what browser auth, mounted certification and the governed QA
session actions all resolve through. The uniform-baseline invariant, inverted.

Three changes, all on the existing mechanism:

1. **`alloy-config.example` now declares every managed slot**, with the rule
   stated: keep the list in step with `ALLOY_MAX_AGENTS`.
2. **`qaCapabilityForSlot(slot)`** — resolves capability and returns. Mints
   nothing, launches nothing, acquires nothing.
3. **Absence is no longer cached.** `qaIdentityForSlot` cached `null` alongside
   hits, which made a missing identity *permanent for the life of the process* —
   so declaring one required a Gateway restart, which an active soak forbids. The
   one safe, canonical, non-destructive fix was unavailable for a reason nobody
   could see. Hits are still cached; a miss re-reads a small file on a cold path.

An assigned managed slot that cannot resolve QA is now `UNRESOLVED_BOOTSTRAP` —
drift, not an optional gap.

## 7. Live fleet, classified read-only

```
problem  lanes 13 · unresolved 3 · stale 4 · blocked 6 · max_behind 1930

  Payments            UNRESOLVED_BOOTSTRAP  (slot 7 — no QA identity)
  UI-Vac              UNRESOLVED_BOOTSTRAP  (slot 9 — no QA identity)
  Troubleshooting     UNRESOLVED_BOOTSTRAP  (lane_slot_unregistered)
  Communications      1930 behind — safe to reconcile
  Trust Runtime        469 behind — safe to reconcile
  Documentation & API  207 behind — safe to reconcile
  Work Items            20 behind — bootstrap contract stale
  6 lanes             BLOCKED_DIRTY (work in progress)
```

**Nothing was mutated.** A separate finding worth carrying: **slot 8 is claimed by
two ACTIVE lanes** (Troubleshooting and Documentation & API), which is why
Troubleshooting cannot resolve its slot. That is ownership ambiguity, and it is
DevOps 3's to resolve.

## 8. Certification

`lane-freshness` — **22 passed, 0 failed**, covering all twelve required cases plus
the corrected QA contract: recent/current mutates nothing and is not even fetched;
inactive + diverged reconciles through fetch→rebase; a stale bootstrap makes an
otherwise-current lane reconcilable; dirty, untracked, shared, and
certification-candidate all refuse without touching git; a conflict aborts and
restores; no command stream may contain a force or a hard reset; slotless lanes are
valid; a managed slot without QA is drift; every managed slot resolves QA against
the shipped baseline; a later declaration is visible without a restart; evaluation
acquires nothing (asserted by injection); reconciliation is idempotent; and the
fleet classifies read-only including a lane that throws.

Regression green across the bootstrap, health, durable-lane, browser-auth,
QA-identity, QA-slot-preflight, slot-topology, placement, branch-reconcile,
folders, provisioning, admission, control-plane, activity, agent-session and
provider-session suites.

## 9. DevOps 3 — canonical seam

`inventoryLaneFreshness()` gives, per lane: worktree path, branch, head SHA,
divergence, dirty/untracked counts, idle hours, QA capability, and a verdict. That
is the ownership and safety input retention decisions need.

`measureWorktreeGit` (reused here, not wrapped) already reports **branch
durability** — reachable from the canonical remote, merged, or pushed-not-merged —
which is the fact that separates "safe to reclaim" from "the only copy".

**Deliberately not done here:** no worktree deleted, no state machine for
ACTIVE/PARKED/PROMOTED/ABANDONED, no retention policy, no disk reclamation. The
slot-8 double-claim is reported, not resolved.

## Promotion

`READY_TO_PROMOTE_BLOCKED_ON_ACTIVE_HOST_SOAK`. Nothing installed, no Gateway
restarted, no toolkit replaced, Host Lifecycle lane and soak evidence untouched.
Held with the other certified candidates for coordinated sequencing: `16601e54f`
(Governance + Async Ack), `25c85997d` (Thread 5 cert-auth), `2eb5c3f27` (DevOps 1).
This candidate lands **after** DevOps 1, or with it.
