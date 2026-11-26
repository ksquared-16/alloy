# Assignment Platform Phase 2C-A — Browser certification

**Sprint:** Assignment Experience Completion (Focus Panel)  
**Worktree:** `wt5-assignment-platform-phase-2` · port `3015`  
**Date:** 2026-07-25  
**Code status:** Implementation complete (local, uncommitted)  
**Browser cert status:** Partial

## Code complete (Goals 1–8)

- List-as-summary (Primary first); no separate Summary page
- Compact assignment rows
- Detail owns Timeline / Financial placeholder / History / Edit·Archive·Duplicate·Make Primary
- Create: Add → Type → Editor → Save (ungated UI; DB types may be empty until migrations)
- Settings inventory doc
- Timeline unit tests green

## Screenshots captured

| File | Notes |
|------|--------|
| `01-scheduling-overview.png` | Workspace overview (pre-rename capture path) |

## Blocked interactive Focus Panel scenarios

Documented in `docs/platform/planning/assignment-platform-phase-2d-remaining.md`:

1. `operational_assignment_types` missing on connected DB  
2. New Leads layout omits Scheduling card  
3. Queue prep flakiness (`All locations`)

## Unit tests (passed 2026-07-25)

```bash
cd web && npm run test -- tests/operationalAssignments/assignmentTimeline.test.ts
```

## Commit

Await Kelly approval. No commit made.
