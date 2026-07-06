# Browser Validation Protocol — Perceived Performance Sprint Phase 1

**Do not commit Phase 1 until this protocol completes with measured results.**

## Worktree vs main repo

| Run | Code source | Dev server | Port |
|-----|-------------|------------|------|
| **BEFORE (baseline)** | `/Users/Kelly/Alloy` — branch `staging` @ `a5b8f66` (no Phase 1) | Already running if `npm run dev` from main `web/` | **3000** (default) |
| **AFTER (Phase 1)** | `/Users/Kelly/Alloy/.worktrees/perceived-performance-sprint` | `PORT=3001 npm run dev` from worktree `web/` | **3001** |

Open Cursor on the **worktree path** for sprint edits:
`/Users/Kelly/Alloy/.worktrees/perceived-performance-sprint`

The status bar may still show branch names from other roots — verify with:
```bash
cd /Users/Kelly/Alloy/.worktrees/perceived-performance-sprint && git branch --show-current
# → feat/perceived-performance-sprint
```

## Setup

### BEFORE server (baseline — should already be running)
```bash
cd /Users/Kelly/Alloy/web && npm run dev
# → http://localhost:3000
```

### AFTER server (Phase 1 worktree)
```bash
cd /Users/Kelly/Alloy/.worktrees/perceived-performance-sprint/web
npm install   # first time only
PORT=3001 npm run dev
# → http://localhost:3001
```

## Load validation harness

In DevTools Console (both ports), paste the contents of:
`docs/sprints/07_2026/perceived-performance-browser-validation.js`

Confirm: `[perceived-validation] loaded`

## Operator path script (same for every run)

Perform these steps in order, at a natural pace (not rushed, not paused):

1. **Workspace** — land on `/workspace`, wait for process grid ready
2. **Work Unit** — click a Work View row on a process tile (or sidebar link)
3. **Pill switch** — click a different Work View pill (same host if available)
4. **Queue row** — click a queue row (hover 300ms first on AFTER run to test prefetch)
5. **Focus Panel** — wait for inline panel seed header, then body resolve
6. **Person** — open person link from focus panel card (if available)
7. **Child** — drill to child or open child drawer (if available)
8. **Back** — browser back once
9. **Forward** — browser forward once

Skip steps 6–7 if no person/child links on test data — note in run log.

## Capture procedure (3 runs × 2 conditions = 6 runs)

For each run:
```javascript
__alloyPerceivedValidation.startRun({ label: "before-run-1" })  // or before-run-2, before-run-3
// ... perform operator path ...
__alloyPerceivedValidation.endRun()
```

After all 6 runs:
```javascript
__alloyPerceivedValidation.exportSummary()
// JSON copied to clipboard — paste into sprint report
```

### Run matrix

| Run label | URL | Phase 1 code? |
|-----------|-----|---------------|
| before-run-1 | localhost:3000 | No |
| before-run-2 | localhost:3000 | No |
| before-run-3 | localhost:3000 | No |
| after-run-1 | localhost:3001 | Yes |
| after-run-2 | localhost:3001 | Yes |
| after-run-3 | localhost:3001 | Yes |

## Metrics captured

| Metric | How measured |
|--------|--------------|
| Acknowledgement time | `ack_pill_ms`, `ack_row_ms` (pointerdown → selected state, 1 rAF) |
| Motion start | Manual: Performance panel or observe `motion-*` class first frame |
| First meaningful content | `run_end` dom snapshot + Focus Panel seed event |
| Completion | `__alloyPerf` marks at run end |
| Skeleton exposure | `skeleton_start` / `skeleton_end` episodes + frame poll |
| Queue hold | `queue_hold` events (`aria-busy` on row list while loading) |
| Surface hold | `surface_hold` events (`data-surface-mode="held"`) |
| Prefetch hit/miss | AFTER: `[perf:perceived]` warm marks; BEFORE: compare fetch timing on row click with/without hover |
| Duplicate fetches | `duplicate_fetches` in run summary |
| Duplicate VM/renders | React Profiler (manual) or note visual flicker |

## Comparison table template

| Interaction | Before (median) | After (median) | Delta | Notes |
|-------------|-----------------|----------------|-------|-------|
| Pill ack (ms) | | | | |
| Row ack (ms) | | | | |
| Pill switch skeleton frames | | | | |
| Queue hold engaged | | | | |
| Surface hold engaged | | | | |
| Row click w/ hover prefetch | | | | |
| Row click cold (no hover) | | | | |
| Focus seed → resolved | | | | |
| API fetches per path | | | | |
| Duplicate fetches | | | | |

## Commit gate

Commit Phase 1 **only if**:
- No metric regresses without documented cause, AND
- At least one of: measurable perceived improvement OR instrumentation-only with zero behavioral regression

Kill switch for marks: `NEXT_PUBLIC_PERF_PERCEIVED_MARKS=0`
