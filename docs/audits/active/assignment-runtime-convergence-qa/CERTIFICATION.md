# Assignment Platform — Runtime Convergence Certification

Slot 5 · `wt5-assignment-platform-phase-2` · `http://localhost:3015`  
Evidence: `docs/audits/active/assignment-runtime-convergence-qa/`  
**Do not commit. Do not push.**

## Operator controls

```
alloy-root
alloy-worker-status
alloy-worker-pause 5
alloy-worker-resume 5
alloy-worker-doctor 5
alloy-sprint-finish 5
```

## 1. Raw keys removed

- Pattern / Category / Validation surfaces use registry labels (`resolveOperatorLabel`); missing → `Label unavailable` (never echo key).
- Room Board age-group meta resolves via `ORG_PROGRAM_CATEGORY_LABELS` (`pre_k` → Pre-K).
- Roster/detail no longer fall back to raw DB `status`.
- Bulk placeholders no longer say “pattern id” / “room location id”.
- Action key codes removed from Actions inventory; calc keys behind Advanced details.
- Surface linked-field summary: “Displays the child’s Primary Assignment summary” (not `Linked → Scheduling · …`).

## 2. Proposed terminology / color

- Lifecycle resolver always labels `commitment_kind=proposed` as **Proposed** (blue tone).
- Focus Panel, Roster badges, Room Board proposed demand, Assignment detail use `#00458C`.
- Copy updated away from “Planning only” / “Planned” for commitment authority.

## 3. Workspace runtime architecture + timings

Shared site bootstrap in `SchedulingWorkspace` (parallel overview, roster, assignment roster, categories, patterns, studio_config, calculations) with `siteBootstrapSeqRef` stale guard.

| Signal | Cold (measured) |
|--------|-----------------|
| Modal open | ~127–172 ms |
| Core snapshot ready | **4337 ms** |
| Categories tab switch | **472 ms** (8 cards, 0 raw keys) |
| Patterns tab switch | **25 ms** (6 patterns) |

Attrs: `[data-assignments-ws-timings]` / `data-ws-core-ready`.

## 4. Roster expand

- Shared `WorkspaceExpandControl` in `WorkspaceShell` (all modules via `AdminV2WorkspaceBosModalShell`).
- Expand/Restore preserves site/tab; Escape restores before close.
- Expanded panel z-index sits under BOS command surface.

## 5–6. Room / cell interaction

- No Daily/Weekly toggles.
- Room name → weekly detail (`data-room-week-header`).
- Day cell → daily detail (`data-room-day-header`).
- Proven: 7 rooms / 35 cells; weekly + daily scopes (shots 11–13).

## 7–8. Room Board detail / hierarchy

- Cells: committed / +Proposed / projected / staff hierarchy.
- Proposed roster section shows Proposed (blue); Secondary repetition reduced.
- Unevaluated capacity no longer paints false “Capacity unavailable” / “Healthy”.

## 9. Avatar live-runtime

- Kurzman Work Unit Children card shows **Add photo** under LK / WK (shot 15).
- `IdentityAvatarEditable` on summary + context; `ChildFocusEdit` upload when Photos on.
- Canonical path: documents upload → `persons.metadata.profile_photo_document_id` (no Assignment-local store).

## 10. Children Save timings

- Instrumented via `childrenSavePerfMarks` (click → request → response → done).
- Save disabled while saving; double-click guarded.

## 11. Pattern Save defect

- **Root cause:** Save only existed after Edit; legacy rows could leave `canSave` false.
- **Fix:** Auto-enter edit when `canMutate`; sticky footer; disabled label explains required fields.
- **Browser:** Soccer Shots editor shows sticky **Save schedule (complete required fields)** (shot 16).

## 12. Pattern canonical source

- Owner: `schedule_patterns` via `/api/admin/schedule-patterns`.
- Locations + Assignments Studio share `mapRawPattern` / same API (convergence test green).

## 13–14. Action menu / Surface keys

- Radix portal menu (prior); Proposed Delete / committed End-Archive retained.
- Linked-field operator language cleaned (Advanced retains source transparency).

## 15. Workspace expand + BOS

- Proven shot 02: Restore control + BOS overlay above expanded workspace.

## Screenshots / routes

| Shot | Route / surface |
|------|-----------------|
| 01–02 | `/workspace` Assignments modal · expand/BOS |
| 03–04 | Studio Categories / Patterns |
| 08 | Operational roster · Proposed blue |
| 11–13 | Room Board · weekly/daily |
| 15 | `/workspace/work-unit/new-leads` Kurzman · Add photo |
| 16 | `/organization/locations` · Scheduling · Soccer Shots Save |

## Tests

```
tests/adminV2/scheduling/operatorLabelAndProposedPresentation.test.ts
tests/adminV2/scheduling/assignmentsWorkspaceRuntimeConvergence.test.ts
tests/adminV2/scheduling/schedulePatternShapeConvergence.test.ts
tests/operationalAssignments/assignmentLifecycleState.test.ts
```

22/22 passed. Production `typecheck` green earlier this pass.

## Remaining genuine future work

- Full photo upload→save→reopen→Roster E2E (controls proven; file upload persistence still to time).
- Children text/Gender/image save timing numbers under load (instrumentation present).
- Locations ↔ Studio reverse-edit round-trip with a saved hours change (Save UI proven; hours must be set to enable).
- Roster report command (seam only: `rosterReportCommandSeam.ts` — no UI placeholder).
- Capacity/ratio Operational Calculations binding for rooms currently returning null capacity.
