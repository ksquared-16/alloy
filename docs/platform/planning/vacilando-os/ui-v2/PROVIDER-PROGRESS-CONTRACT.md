---
owner: platform
status: sprint
last_reviewed: 2026-09-03
---

# Provider Progress Contract

**Status: SHIPPED (runtime + CLI + API + UI). PROVIDER_REQUIRED per lane until
providers adopt it.**

## The problem

A lane could sit at "Working" for twenty minutes and the operator still could
not tell whether it was starting or finishing. The Execution Run already carried
`latest_progress` — a worker-reported *sentence* — which answered "what is
happening" and never "how far along".

## What it is, and what it is not

It is **an estimate**. The provider is the only party that knows how much of its
own plan remains, and it knows that only approximately.

It is **not deterministic truth**, and **no ETA is ever derived from it**. There
is no estimator in this product; a percentage divided by elapsed time is a guess
with a decimal point on it. Every consumer must render it as an estimate.

## Where it lives

`lib/vacilando/execution-run.mjs` — the same owner as every other run fact. It
extends the existing `latest_progress` field family rather than opening a second
progress system: `latest_progress` keeps its meaning, and `progress_estimate`
sits beside it.

## The shape

```js
run.progress_estimate = {
  percent: 62,                 // 0–100, clamped and rounded; null if only a summary was sent
  confidence: "medium",        // low | medium | high  (unknown values degrade to "low")
  summary: "E2E driver built; automated certification in progress",
  remaining_work: null,        // optional
  source: "provider_estimate", // provider_estimate | deterministic | operator | derived
  updated_at: "2026-09-03T22:41:10.402Z",
}
```

Exports: `normalizeProgressEstimate()`, `progressEstimateIsStale()`,
`PROGRESS_CONFIDENCES`, `PROGRESS_SOURCES`, `PROGRESS_STALE_MS`,
`PROGRESS_SUMMARY_MAX`, `PROGRESS_REMAINING_MAX`.

## Reporting it

### Worker CLI — the path workers already use

```bash
# At a milestone, alongside a state report:
vac run-status <run_id> executing \
  --progress 62 --progress-confidence medium \
  --progress-summary "E2E driver built; certification in progress" \
  --lane <lane_id>

# Or on its own — the state argument is optional:
vac run-status <run_id> --progress 62 --progress-summary "Implementation started"
```

The CLI echoes what landed, so a worker can tell a persisted estimate from a
silently dropped one:

```
erun_… lane_… EXECUTING
progress ~62% (medium confidence, provider_estimate) — E2E driver built
```

### HTTP — for integrations that are not a shell

`POST /api/v2/lanes/run/progress`

```json
{ "lane_id": "lane_…", "percent": 62, "confidence": "medium",
  "summary": "Tests underway", "source": "provider_estimate" }
```

`POST /api/v2/lanes/run/report` accepts the same `progress_*` fields alongside a
state report.

## When to report — milestones, not tokens

Report at **meaningful phase boundaries**, never per message or per token:

- investigation complete
- implementation started
- implementation substantially complete
- tests underway
- certification underway
- blocked
- finalizing

A run that has not reported inside `PROGRESS_STALE_MS` (30 minutes) is **not**
"62% and frozen" — it is unknown, and the UI says so.

## Terminal runs

- `COMPLETE` → the estimate is replaced with `{ percent: 100, confidence: "high",
  source: "deterministic" }`. It is measured at that point, not estimated.
- `FAILED` / `ABANDONED` → the estimate is **dropped**. Leaving 62% on a failed
  run is exactly the false precision this contract exists to refuse.

## Presentation rules

**Progress is an adjective on the lane's status, not a section of its own.**

The first implementation gave progress its own labelled band — a bar, a
`Provider estimate: ~62% complete` caption and an `Updated 1m ago` timestamp,
sitting near the lane's state. Two things then described what the lane was
doing, in two visual languages, and the operator had to reconcile them. A
percentage is not a peer of the state; it *qualifies* the state.

So it now renders inside the one status line the operator already reads:

```
Trust Runtime    ● Working · ~62% · Claude
```

| Situation | Rendering |
|---|---|
| Fresh estimate with a percent | `● Working · ~62% · Claude` |
| `source: provider_estimate` | `~` prefix — the tilde IS the word "estimate" |
| `source: deterministic` | The percentage with **no** `~` — it was measured |
| Stale (> 30m) | The percentage is **omitted**. `● Working · Claude` |
| Never reported | The percentage is **omitted**. `● Working · Claude` |
| Terminal run | No percentage; the state carries the outcome |

A stale or absent estimate produces *no* percentage and *no* apology. "Progress
estimate unavailable" was a sentence spent telling the operator about a field
rather than about their lane.

There is **no bar**, on any surface. A bar is a second progress subsystem: it
needs a track, a fill, a hatch for low confidence and a rule for zero width,
and it competes with the status dot for the same meaning. The certification
asserts that no `.vprogress` element exists anywhere.

No ETA is derived, on any surface, ever.

`laneOperatorStatus()` and `operatorStatusLine()` in
`apps/vacilando/public/vacilando-ui-model.mjs` are the single consumer-side
derivation, so the Lane header, the lane list, the rail and Home cannot
disagree about the same run.

## Consumers

| Consumer | Status |
|---|---|
| Lane header status line | SHIPPED |
| Lane list row | SHIPPED |
| Rail lane row | SHIPPED |
| Home · Lanes | SHIPPED |
| Notifications / Activity | DEFERRED — a progress milestone is not yet an activity event |
| Analytics | DEFERRED — see the telemetry backlog |

## Adoption

The runtime accepts estimates today. Until the worker package instructs agents to
send them, most lanes will render "Progress estimate unavailable", which is the
correct and honest state. Adoption follow-up is tracked in
[the telemetry backlog](TELEMETRY-BACKLOG.md).

Covered by `tests/development-gateway-ui-v2.test.mjs` §2 (normalization,
clamping, staleness, progress-only reports, terminal behaviour, CLI flags, and
the no-ETA rule).
