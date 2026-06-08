# Lifecycle Builder UX consolidation (June 2026)

## Goal

Simplify the Lifecycle Builder so operators can run a full lifecycle configuration from scratch (Create → Add stages → Configure stage → Validate runtime) without wizard cards, legacy clutter, or developer tooling in the main path.

No new engines, orchestration, or runtime behavior changes in this pass.

## Changes

### Lifecycle selection

- Replaced large **Available Lifecycles** card grid with **`LifecycleCatalogRail`**: compact buttons per lifecycle plus **+ New Lifecycle**.
- Rail shows `lifecycle_name` only (no Legacy / Builder-owned badges).

### Builder layout (`LifecycleActivationBoard`)

- **Header**: lifecycle name, **Rename**, **Delete lifecycle**, runtime status, optional workspace repair.
- **Stage navigation**: tab rail (`LifecycleStageNav`) with **+ Add Stage** in the tab row (not footer or header).
- **Stage configuration**: stacked sections (`LifecycleStageConfiguration`): Required information, Statuses, Work unit queue, Actions, Forms.
- **Runtime validation**: moved to a bottom section (`lifecycle-runtime-validation-section`).

### Delete lifecycle

- **Delete** in header opens confirmation via `LifecycleBuilderPrimary` + `LifecycleActivationDeleteModal` (builder-owned activation delete or legacy catalog delete with confirm).
- Modal explains scope (config, stages, work units, placements, access, builder-owned department) and that opportunities/persons/customers are not deleted.

### Rename lifecycle

- **`LifecycleRenameModal`** updates process name via lifecycle-builder API and syncs activation / department name when builder-owned.

### Developer tooling

- **Remove test lifecycles** (`LifecycleTestCleanupButton`) only when `NEXT_PUBLIC_LIFECYCLE_DEBUG_UI=1`.
- Legacy hub remains under **Advanced legacy editor** in settings shell (unchanged).

### Selection behavior

- Selecting a lifecycle hydrates builder + stages and auto-selects the first stage when activation has no saved stage.

## Files (primary)

| Area | Files |
|------|--------|
| Shell | `LifecycleBuilderPrimary.tsx`, `LifecycleCatalogRail.tsx` |
| Board | `LifecycleActivationBoard.tsx`, `LifecycleStageNav.tsx`, `LifecycleStageConfiguration.tsx`, `LifecycleRenameModal.tsx` |
| Tests | `web/tests/adminV2/lifecycleBuilderUxConsolidation.test.ts` |

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/adminV2/lifecycleBuilderUxConsolidation.test.ts
cd web && npm run test -- tests/lifecycle/lifecycleBuilderCleanupDeleteSupport.test.ts
cd web && npm run test -- tests/adminV2/lifecycleBuilderActivationConsolidation.test.ts
```

## Next step (explicit stop)

After this pass, **do not redesign the shell**. Run a complete **Enrollment** lifecycle from scratch in the product and document friction in a follow-up note before further structural UI changes.
