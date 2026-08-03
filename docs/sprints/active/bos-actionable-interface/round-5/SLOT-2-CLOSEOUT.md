---
owner: platform
status: closeout
last_reviewed: 2026-07-27
---

# Slot 2 closeout — BOS actionable interface (Round 5 partial)

| | |
|---|---|
| Slot | 2 · cursor |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt2-bos-actionable-interface-plan` |
| Branch | `agent/cursor/2-bos-actionable-interface-plan` |
| Port | 3012 |
| Close disposition | Promote committed branch to `staging`; leave uncommitted WIP documented (not merged) |

## Promoted in this closeout

Timing-persistence fix and prior Round 5 Create Lead commits on the branch tip through:

- `b6ff424f0` — `fix(lifecycle): persist Builder requirement timing in rule_meta_v1`

Product policy (Option 1) remains:

- Create Lead hard block = code floor + explicit `record_creation` only
- Stage Required/Enforced without `record_creation` = recommended during Create Lead
- Builder must persist and hydrate timing truthfully via `rule_meta_v1`

Firefly verified after fix: Schools Req + Creating the record → meta persists → intake required → Form/Review agree.

## Not promoted (uncommitted at close)

Left dirty on the worktree / stash — **do not treat as on staging** until a follow-up sprint commits and promotes them.

### A. Create Lead department scope (BOS Form sections)

Work Unit snapshot / settlement was baking `departmentId: null`, so Create Lead fell back to Person-only platform floor on some surfaces.

Uncommitted paths:

- `web/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot.ts`
- `web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts`
- `web/lib/presentation/runtime/useWorkUnitSettlement.ts`
- `web/components/presentation/workUnit/WorkUnitSurface.tsx`
- `web/components/presentation/workspace/WorkspaceSurface.tsx`
- `web/components/presentation/rightRail/BosWorkspaceScopeSync.tsx` (untracked)
- `web/tests/bos/commandSession/bosWorkspaceScopeSync.test.ts` (untracked)
- related controller / section presentation / settlement tests

### B. Unrelated data-model / entity-labels polish

Uncommitted and out of Round 5 Create Lead scope:

- `web/app/api/admin/entity-labels/route.ts`
- `web/lib/admin/entityLabelsResolve.ts`
- `web/components/adminV2/settings/dataModel/entities/EntityRelationshipsTab.tsx`
- `web/lib/dataModel/dataModelWorkspaceVm.ts`
- `web/lib/dataModel/loadDataModelEntitiesWorkspaceVm.ts`
- `web/lib/dataModel/platformRelationshipPresentation.ts` (untracked)
- matching tests under `web/tests/dataModel/` and `web/tests/lib/admin/`

### C. Round 5 packages still open

See `EXECUTION-LEDGER.md`: F5-03, F5-05–F5-10 (Conversation/Form parity, Review/Processing, execute/success, retirement, full cert, final pause). Entity-group Form and timing persistence landed; end-to-end certification is not claimed complete.

## Follow-up

1. New managed sprint for department-scope Create Lead Form truth (group A).
2. Separate lane for data-model / entity-labels (group B) if still desired.
3. Continue Round 5 packages from ledger after staging absorb.
