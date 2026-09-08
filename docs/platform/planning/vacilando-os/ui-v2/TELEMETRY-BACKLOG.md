---
owner: platform
status: sprint
last_reviewed: 2026-09-03
---

# Vacilando UI V2 — Telemetry & Instrumentation Backlog

Every gap the UI Foundation deliberately did **not** close, written down rather
than buried in a TODO comment. Each item names the field it unblocks, the
canonical owner it belongs to, and what has to exist first.

Ordered by how much operator value each unlocks per unit of work.

Classification vocabulary and the per-field table are in
[DATA-CONTRACT.md](DATA-CONTRACT.md).

---

## Tier 1 — cheap, and each closes a visible "Not available yet"

### 1. Provider progress adoption
- **Unblocks:** Lane progress, lane-list progress, Home lane progress.
- **Owner:** worker package / `AGENT-INSTRUCTIONS.md`.
- **State:** the runtime, the CLI (`vac run-status --progress`) and the API
  (`POST /api/v2/lanes/run/progress`) are shipped. Nothing instructs agents to
  use them, so most lanes correctly render "Progress estimate unavailable".
- **Work:** add the milestone list from
  [PROVIDER-PROGRESS-CONTRACT.md](PROVIDER-PROGRESS-CONTRACT.md) to the worker
  package, and promote the toolkit so the installed `vac` accepts the flags.

### 2. Lane-scoped Activity
- **Unblocks:** the lane Activity tab.
- **Owner:** `ui-v2-views.projectActivityFeed`.
- **Work:** accept a `lane_id` filter and pass it from the lane tab. The feed
  already carries `lane_id` on every row; this is a parameter, not a projection.

### 3. Runs tab
- **Unblocks:** the lane Runs tab.
- **Owner:** `execution-run.listExecutionRunsForLane()`.
- **Work:** a `GET /api/v2/views/lane/runs` returning `publicExecutionRun()` for
  each, and a list renderer. The history is already stored.

### 4. Host identity on Home
- **Unblocks:** the host name (currently the literal "Mac mini").
- **Owner:** `hostIdentity()` behind `/api/host`.
- **Work:** read it in `projectSystemSnapshot` and pass it through.

### 5. Gateway probe on Home/System
- **Unblocks:** genuine gateway health rather than "a snapshot resolved".
- **Owner:** `health-probes.probeGateway()`.
- **Work:** call it in `projectSystemSnapshot` within a budget and project the
  result.

### 6. Stale and failed process counts
- **Unblocks:** System › Runtime.
- **Owner:** `health-probes.probeProcessTable()` + `health.checkProvidersOrphaned`.
- **Work:** project the counts the health report already computes.

### 7. Health history
- **Unblocks:** System › Health history.
- **Owner:** `listPlatformResourceHistory()` behind `/api/v2/platform/resources`.
- **Work:** include it in the System projection. The samples already exist.

### 8. Slot capacity in the lane inspector
- **Unblocks:** "Slot 6 / 8" instead of "Slot 6".
- **Owner:** `managed-slots.managedSlotCount()`.
- **Work:** pass `executionCapacity.total` into the lane view from the list
  payload, which already carries it.

---

## Tier 2 — a projection has to be written, but no new collection

### 9. Lane provider usage aggregation
- **Unblocks:** Home › AI usage input/output/total tokens and cost.
- **Owner:** `usage.mjs`.
- **Problem:** `collectUsage()` skips every record whose `delivery` is not
  `provider-round-trip`, so it aggregates Director traffic only — the minority of
  real token spend. Lane provider usage is recorded per lane by
  `lane-telemetry.mjs` and never rolled up.
- **Work:** aggregate lane telemetry alongside Director round-trips, keyed by
  provider, and carry the model id with it.

### 10. Provider runtime and context aggregates
- **Unblocks:** Home › AI usage runtime and context utilisation.
- **Owner:** `usage.mjs` + `lane-telemetry.mjs`.
- **Work:** sum per-call durations; aggregate per-lane context into a fleet figure.

### 11. Runs completed / average runtime
- **Unblocks:** two AI-effectiveness cells.
- **Owner:** a new run-outcome projection over `execution-runs/events.jsonl`.
- **Work:** count terminal transitions and compute the mean of
  `started_at → completed_at`. Both timestamps already exist on every run.

### 12. Approval interruptions per run
- **Unblocks:** one AI-effectiveness cell.
- **Owner:** `governed-action-request.mjs`.
- **Work:** count governed actions per `run_id` and project the aggregate.

### 13. Commits and promotions
- **Unblocks:** two AI-effectiveness cells.
- **Owner:** `source-control.mjs`.
- **Work:** aggregate the commit and promotion events already emitted to
  `source-control/events.jsonl`.

### 14. Reserved slot count
- **Unblocks:** System › Capacity › Reserved.
- **Owner:** `execution-admission.mjs`.
- **Work:** project `PROVISIONING`/`ADMITTED` counts as a first-class number.

### 15. Governed action severity
- **Unblocks:** destructive-vs-authorize styling in Needs You.
- **Owner:** `governed-action-request.mjs`.
- **Work:** normalize a `severity` on `publicGovernedAction`. The UI already
  renders a distinct treatment and currently always sees `authorize`.

### 16. Provider on activity events
- **Unblocks:** the Activity provider filter (modelled, currently valueless).
- **Owner:** the event producers in `execution-run.mjs`.
- **Work:** stamp the lane's provider on run events at append time.

---

## Tier 3 — the platform does not collect this yet

### 17. Swap trajectory
- **Unblocks:** Home/System › Swap trajectory.
- **Owner:** a host-pressure projection.
- **Problem:** `capacity-policy.mjs` reads `swapouts_delta` from within a single
  live sample; nothing persists a series, so a *trend* has no source. macOS also
  keeps swap allocated long after pressure normalises, so the level alone is not
  a trend — this is precisely why the memory manager's own notes warn against
  keying on absolute swap.
- **Work:** persist a rolling swapout series and a resolver over it.

### 18. Run-outcome and intervention events
- **Unblocks:** autonomous completion %, human interventions, retry/rework rate
  — the three cells that decide whether the effectiveness surface means anything.
- **Owner:** a new effectiveness owner over the run event log.
- **Problem:** nothing distinguishes "completed autonomously" from "completed
  after the operator answered three questions". Both are one `COMPLETE`.
- **Work:** define and emit an intervention event (operator instruction into an
  open run, governed approval, manual recovery, cancel), and a run-outcome record
  that carries the intervention count. **This is the single highest-value gap on
  the list**, and until it exists the effectiveness surface honestly renders
  nothing.

### 19. Validation results per run
- **Unblocks:** tests run / passed, certifications.
- **Owner:** the validation broker.
- **Problem:** the broker runs tests and returns an exit code; no per-run record
  of what ran or what passed is retained.
- **Work:** record a validation result keyed by `run_id`.

### 20. Provider cache tokens
- **Unblocks:** Home › AI usage › Cache tokens.
- **Owner:** `usage.mjs`.
- **Problem:** no collector records cache read/write tokens at all.
- **Work:** capture the provider's cache fields where the provider reports them.

### 21. Historical usage windows (7d / 30d)
- **Unblocks:** the Today / 7 days / 30 days control on Home.
- **Owner:** `usage.mjs`.
- **Problem:** the collector reduces the director log to a today-only aggregate
  on every call; nothing is retained.
- **Work:** write daily rollups and read the window from them. The card
  currently states that it is showing today, which is honest but not what the
  control implies.

### 22. Provider pricing normalization
- **Unblocks:** estimated cost.
- **Owner:** `usage.mjs` `PRICING`.
- **Note:** the empty table is a deliberate refusal, not an oversight — cost is
  authoritative only when the provider reports it. Closing this means adopting a
  configured, versioned pricing table and labelling the result an estimate.

### 23. File-change attribution per run
- **Unblocks:** the lane Files tab.
- **Owner:** `source-control.mjs`.
- **Note:** checkpoint readiness already attributes changed paths to a run; it is
  computed on demand and not retained. Retaining it is the work.

---

## Explicitly refused

**ETA.** There is no estimator and none is planned in this phase. An ETA derived
from a provider's own completion guess is a schedule invented from a guess. The
field stays `PLACEHOLDER` and is never rendered in production. Building one means
building a real estimator first, and giving it its own maturity row.
