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

Backend already supports concurrent `schedule_assignments` / secondary creation. A multi-entry collection UI was attempted (`3238489b1`) and **reverted** (`387695dfa`) as a product over-correction. Decision: `CARDINALITY-DECISION.md`.

## Keep

Offer-model correction, Children optional request fields, contextual readiness, integrated commercial estimate, effective-date / quote immutability / readiness enforcement / primary-contact untouched. Multi-assignment **backend** remains.

## Validation (unit)

Focused enrollment suites + `typecheck` / `typecheck:tests` green on the reverted offer model (see prior sprint notes).

## Browser certification — blocked / incomplete

Port **3016** was restarted via Vacilando; `heavy-next-dev` + `browser-certification` were acquired. Cert did **not** complete:

1. Next on 3016 repeatedly went stale under machine contention (multiple Next instances; free RAM critically low).
2. Slot6 auth storage is **401**; working auth is **slot3** (`ALLOY_AUTH_SLOT=slot3`).
3. Playwright reached Kurzman subject resolve after seed-id fix, then `page.goto` timed out (120s) while cold-compiling `/workspace/work-unit/new-leads`.

**Before evidence (five-section era) preserved at:**

`.alloy-agent-evidence/enrollment-assignment-effective-dates/browser/archive-before-five-section/`

**After (coherent offer) screenshots:** not captured — matrix run did not reach Assignments paint.

Permits released; 3016 stopped. Resume cert when the machine has ≤1 other Next and slot6 login is refreshed (`alloy-agent-login 6`), then:

```bash
alloy-compute acquire heavy-next-dev --holder cursor-slot6 --reason "assignment offer browser cert"
alloy-compute acquire browser-certification --holder cursor-slot6 --reason "assignment offer card cert"
alloy-dev-start wt6-assignment-card-model-correction
# wait until curl http://127.0.0.1:3016 → 200
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3016 ALLOY_AUTH_SLOT=slot3 \
  npx playwright test playwright/tests/enrollment-assignment-effective-dates-evidence.spec.ts \
  --config=playwright.config.ts
```

## Do not merge automatically

PR-ready for code/docs after browser certification passes. Kelly authorizes open/merge. Do not `alloy-sprint-finish 6` until cert matrix is green.

## Host-resource blocker (resume gate)

Latest attempt stopped cleanly: 3016 down, slot-6 permits released. Concurrent wt4 Next + low free RAM prevented a durable Playwright matrix. Evidence note: `.alloy-agent-evidence/enrollment-assignment-effective-dates/browser/HOST-RESOURCE-BLOCKER.md`. Resume when slot 6 can own Next alone.
