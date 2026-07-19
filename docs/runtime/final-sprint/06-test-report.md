---
owner: platform
status: final-sprint-report
last_reviewed: 2026-07-19
report: Runtime Test
---

# Runtime Test Report — Final Sprint

## Headline numbers (this sprint's changes)

- **Source typecheck: clean** at the runtime source baseline (only the pre-existing `tests/*` and
  transient `.next/dev/types/*` generated-file errors remain; no new source errors).
- **`tests/adminV2/runtime/` focus-panel suite:** 75 → **74** failures (net **−1**; my changes fixed
  more than they obsoleted, no new red introduced).
- **`tests/runtime/` + `tests/adminV2/runtime/` combined:** **79 failed / 1199 passed / 5 skipped**
  (1283 total). Roughly flat vs the documented pre-existing baseline (~80).

## What I changed in the suite (H, bounded)

Aligned the two tests my Current Work summary trim directly obsoleted to the **final** contract
(commit `d8325011f`):

- `currentWorkFinalPolish.test.tsx` — "collapsed summary" now asserts progress + `Open Work` and the
  **absence** of Quick actions / Other transitions (those moved to the drill-in workspace). Passes.
- `currentWorkCard.test.tsx` — "renders Summary" no longer expects the Recent-activity preview in the
  committed summary. Passes.

## The remaining red — categorized (NOT fixed this sprint)

The runtime/focus-panel suite is **heavily pre-existing red** — this was true on clean HEAD before this
sprint and before the prior session (documented in `runtime-consumer-completion-status.md`). The failures
fall into known buckets:

1. **Architecture-cutover assertions** — tests asserting the *old* pre-runtime shapes (drawer-VM
   coupling, per-key composition, the old Current Work workspace-in-summary). These are **superseded by
   the final contract** and should be rewritten/deleted, not "fixed" — they encode behavior the runtime
   deliberately changed.
2. **VM-builder assertions** independent of my changes (e.g. `currentWorkFinalPolish` "shows no Other
   Transitions" asserts `vm.alternatePaths === []` from `buildCurrentWorkSurfaceVM`; fails on the
   fixture, pre-existing).
3. **Source-grep tests** (`routes Contact Family through resolveWorkItemHandoff`, `wires supporting
   actions`) — brittle string-presence checks over `CurrentWorkCard.tsx`; pre-existing failures,
   confirmed failing at the pre-sprint commit.
4. **D1/D4 provisioning + settlement geometry tests** (`d1ProvisioningAnswer`, `d4SettlementReservedGeometry`)
   — pre-existing red carried from prior sessions.

## Why the suite is not repaired to green this sprint

The suite requires a **dedicated rewrite sweep** to the final contract, which the prior session
explicitly deferred and which is genuinely large (dozens of intricate assertions encoding superseded
behavior). Repairing it piecemeal risks encoding *wrong* assertions. It is a named freeze blocker (see
the Freeze Recommendation) — **Runtime V1 must not freeze with a baseline-red runtime suite** — but it
is a self-contained workstream best done as one focused pass, not interleaved with the behavioral
changes of this sprint.

## Recommended sweep plan

1. Triage every red runtime/focus-panel test into: **rewrite** (asserts final contract differently),
   **delete** (asserts deleted/superseded behavior), or **real bug** (fix the source).
2. Start with the architecture-cutover bucket (largest, mostly delete/rewrite).
3. Replace source-grep tests with behavioral tests where the grep was standing in for behavior.
4. Green the D1/D4 provisioning/settlement tests against the final answer shape (this sprint added
   `focusPanelSummaryDoc` to the answer — those fixtures need updating).
5. Gate: the runtime suite must be green before freeze.
