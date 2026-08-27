# Triage — the unpublished Gateway delta in `wt5-vacilando-gateway-v2`

The MacBook Gateway ran, until Phase A, from the `wt5-vacilando-gateway-v2` **working tree**:
20 modified + 30 untracked files, ~1,625 changed lines, committed nowhere. wt5's git state was
not touched; the delta is preserved at
`~/.local/state/alloy-dev/gateway/backups/phase-a-preserved/`.

## Classification

| Area | Lines | Load-bearing for cutover? | Disposition |
|---|---|---|---|
| `execution-stale.mjs` | 16 | **Yes — run durability** | Root cause folded into PR #487 (below) |
| `execution-reconcile.mjs` | 9 | Yes — idle capacity release feeding admission | Belongs to the Gateway lane |
| `execution-admission.mjs` | 95 | Yes — Phase C Proof 3 concurrency | Belongs to the Gateway lane |
| `lane-execution-capacity.mjs` | 52 | Yes — Phase E governor limits | Belongs to the Gateway lane |
| `agent-session-lifecycle.mjs` | 212 | Yes — session health | Belongs to the Gateway lane |
| `trusted-host-actions.mjs` | 471 | Partly — governed-action depth | Belongs to the Gateway lane |
| `governed-action-request.mjs` | 466 | Partly | Belongs to the Gateway lane |
| `trusted-host-migrate.mjs` | 267 | No — migration tooling | Belongs to the Gateway lane |
| `apps/vacilando/capture-*.mjs`, `qa/` (30 untracked) | — | No — QA capture scripts | Archived only |

## The one fix folded into this lane

`execution-stale.mjs` measured settle time from `created_at`:

```js
const start = parseMs(run?.started_at) || parseMs(run?.created_at) || facts.delivered_ms;
```

**Queue wait is not settle time.** A run can sit `QUEUED` for hours; measuring from creation
makes it eligible for auto-abandon the instant it starts executing. Canonical's settle window
is 2 minutes, so on canonical this is immediate.

PR #487 already raises settle to 20 minutes and replaces dead liveness signals with positive
ones, which protects the observed case. But the settle *clock* was still wrong, so this lane
now measures from the last `EXECUTING` transition and never from `created_at`, with two
regression tests:

* `a long queue wait is not settle time`
* `settle is measured even when started_at predates the field`

`Execution Run durability: PASS=6 FAIL=0` (20 stale-contract assertions).

## What is still owed, and by whom

The remaining ~1,600 lines are **the Gateway lane's own work** (`wt5-vacilando-gateway-v2`).
This lane deliberately did not commit into a sibling worktree. Before the MacBook is wiped or
that worktree is deleted, its owner must commit and promote it — in particular
`execution-admission.mjs` and `lane-execution-capacity.mjs`, which Phase C Proof 3 (controlled
concurrency) and Phase E (governor limits) both depend on.

**Migration risk if this is skipped:** the mini would run a Gateway whose admission and
capacity behaviour is *older* than what the MacBook has been running, and the concurrency
proof would certify behaviour that the MacBook never actually used.
