# Current Work + Process Builder — Pre-Operator Retest Certification

Branch: `fix/current-work-process-builder-qa`  
Final HEAD: `fb01302709417f570f8e1e3a62a77ee893a6fffa`  
Base: `origin/staging` @ `25bc25c7ef581fa8500aef6ad70198a3229c4ce4`

## Scope boundary

Household and Children identity cards were **not** modified on this branch.

## Implementation summary

| Area | Result |
|------|--------|
| Config-driven action resolution | `resolveConfiguredOperatorOptions` + `resolveOutgoingProcessTransitions`; no global action-library scan |
| Stage status validation | Platform-managed stages exempt via `stageRequiresManualStatusSelection` / `effectiveLifecycleStageStatusKeys` |
| Requirement vs work classification | Explicit `CurrentWorkChecklistItemKind` at adapter boundary |
| Waiting attention rules | `waiting_on_family` / `waiting_on_provider` marked unsupported in editor; runtime skips |
| Capability filtering | Intentional: no parallel capability registry; registered ≠ available |
| Operator guidance | `OperatorGuidanceBlock` — supporting section, not primary card |

## Browser QA (local `localhost:3000`, branch worktree)

### Process Builder — Enrollment

| Check | Result | Notes |
|-------|--------|-------|
| Open Enrollment process | PASS | `/settings/processes` |
| Tour stage loads | PASS | Platform-managed participation; no forced status picker |
| Save stage without status error | PASS | Save disabled (no dirty state); no status validation banner |
| Lead configured outcomes | PASS | 5 outcomes; transitions from configuration |
| Process Actions catalog | PASS | 10 configured actions; disabled actions not auto-available |
| Arbitrary stage transitions | PASS (unit) | Edge-based resolver tests 51–65 |
| Tour outcome work templates | DEFERRED | Tour has 0 work items in dev fixture; configure in operator re-test |

Evidence: `evidence/01-lead-outcomes-configured.png`, `evidence/05-tour-stage-save-status.png`, `evidence/06-enrollment-process-actions-catalog.png`

### Process Builder — Billing/Collections

| Check | Result | Notes |
|-------|--------|-------|
| Payment Follow-up stage UI | N/A | Billing process not provisioned in dev tenant |
| No childcare action leakage | PASS (unit) | `resolveConfiguredOperatorOptions.test.ts` billing fixtures |

### Current Work operator surface

| Check | Result | Notes |
|-------|--------|-------|
| Record drawer / focus panel | PARTIAL | Work-unit slug routing blocked live record open; VM covered by component tests |
| Requirements / Work Items separation | PASS (unit) | `currentWorkProcessBuilderQa.test.tsx`, `currentWorkCard.test.tsx` |
| Operator guidance presentation | PASS (unit) | `CurrentWorkCard` source + VM tests |

### Viewport / focus / activity

| Check | Result | Notes |
|-------|--------|-------|
| Focus 1280×720 / 125% zoom | PASS (unit) | Prior commit `c9bb641ef` focus-surface tests |
| Recent Activity | PASS (unit) | `currentWorkCardEvidence.test.ts` |

## Validation gates

| Gate | Result |
|------|--------|
| Focused QA suite (8 files, 66 tests) | PASS |
| `npm run typecheck` | PASS |
| `npm run typecheck:tests` | PASS |
| `npm run build` | PASS |
| `npm run verify:module-imports` | PASS |

## Pre-existing failures (not introduced by branch)

- `lifecycleActionsMatrixAndValidation.test.ts` — missing `docs/sprints/archive/06_2026/desired_start_field_audit.md` (ENOENT on staging)
- Broader lifecycle integration tests (`tourBpRuntimeIntegration`, `workViewConditionFieldRegistry`) — pre-existing on staging

## Intentional limitations

1. No tenant capability registry on action rows — availability owned by stage catalog, Work Template refs, and configured transitions.
2. `waiting_on_family` / `waiting_on_provider` attention rules: editor shows unsupported; no runtime inference.
3. Billing process browser QA deferred to preview — unit fixtures prove anti-leakage.

## Ready for operator re-test

Branch is pushed; PR targets `staging`. Operator should re-test on Vercel preview with full enrollment Tour configuration and a live record drawer.
