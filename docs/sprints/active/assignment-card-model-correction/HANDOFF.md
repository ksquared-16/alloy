---
owner: sprint
status: active
sprint: assignment-card-model-correction
slot: 6
staging_base: 8fa5697a3df724946eba8cdd4481fa6f6fe48fa1
staging_merged_through: ce4d58d66
last_reviewed: 2026-08-04
---

# Assignment Card Product Model Correction — Handoff

## Environment

| Field | Value |
|-------|-------|
| Slot | 6 · port 3016 |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt6-assignment-card-model-correction` |
| Branch | `agent/cursor/6-assignment-card-model-correction` |

## Final product model

The Focus Panel Assignments card answers: **what operational assignment is currently being proposed or committed for this child in this enrollment context?**

One coherent offer: site, program, room, schedule, start, tuition plan, estimated tuition, quote, compact proposed/committed state, contextual readiness.

Family-request fields are optional Children/enrollment placements — not Assignment sections.

## Cardinality investigation

Backend already supports concurrent `schedule_assignments` / secondary creation. A multi-entry collection UI was attempted (`3238489b1`) and **reverted** as a product over-correction. See `CARDINALITY-DECISION.md`.

## Keep

Offer-model correction, Children optional request fields, contextual readiness, integrated commercial estimate, effective-date / quote immutability / readiness enforcement / primary-contact untouched.

## Validation

Focused enrollment unit suites + typecheck required before PR. Browser cert on 3016 after revert.

## Do not merge automatically

PR-ready after browser certification; Kelly authorizes open/merge.
