---
owner: sprint
status: ready_for_pr
sprint: assignment-card-model-correction
slot: 6
staging_base: 160e75d924a2249cb02b8dbd41d405ba9b2a7a47
last_reviewed: 2026-08-04
---

# Assignment Card Product Model Correction — Handoff

## Environment

| Field | Value |
|-------|-------|
| Slot | 6 · port 3016 |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt6-assignment-card-model-correction` |
| Branch | `agent/cursor/6-assignment-card-model-correction` |

## Final product model (frozen)

The Focus Panel Assignments card answers: **what operational assignment is currently being proposed or committed for this child in this enrollment context?**

One coherent offer: site, program, room, schedule, start, tuition plan, estimated tuition, quote, compact proposed/committed state, contextual readiness.

Family-request fields are optional Children/enrollment placements — not Assignment sections. No five-section report. No multi-entry collection.

## Cardinality

Backend already supports concurrent `schedule_assignments` / secondary creation. Multi-entry collection UI (`3238489b1`) was **reverted** as a product over-correction. See `CARDINALITY-DECISION.md`.

## Certification

Kelly approved **CI-preview cert** as alternative to local 3016 browser matrix.

| Gate | Result |
|------|--------|
| Focused unit suites | 38/38 |
| `typecheck` / `typecheck:tests` | pass |
| Vercel Firefly Preview deploy | success (SSO blocks unattended Playwright) |
| Local browser matrix | waived — host-resource blocker |

Evidence: `.alloy-agent-evidence/enrollment-assignment-effective-dates/browser/CI-PREVIEW-CERT.md`  
Before (five-section): `.../archive-before-five-section/`  
Host blocker note: `.../HOST-RESOURCE-BLOCKER.md`

## Promotion

Synced onto `origin/staging` via `alloy-worktree-sync`. Open PR into staging; do not auto-merge.
