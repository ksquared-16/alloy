# Lifecycle Builder — Cleanup, Debug Removal, and Delete Support

**Path:** `docs/sprints/archive/06_2026/lifecycle_builder_cleanup_delete_support.md`  
**Status:** Implemented (May 2026)

## Summary

Lifecycle Builder and `/workspace` no longer show engineering debug panels by default. Builder-owned lifecycles have a supported **Delete lifecycle** flow with confirmation, scoped teardown, and catalog/workspace refresh. Admins can remove sprint test departments via **Remove test lifecycles** (narrow matcher).

## Debug UI

Hidden unless `NEXT_PUBLIC_LIFECYCLE_DEBUG_UI=1` in `.env.local`:

| Surface | Module |
|---------|--------|
| Access scope debug | `AdminAccessScopeDebugPanel` |
| Workspace tile pipeline debug | `WorkspaceTileDebugPanel` |
| Runtime identity debug row | `LifecycleRuntimeIdentityDebug` |
| Department ID audit table (validation) | `LifecycleDepartmentIdAuditTable` (validation step) |
| Dev Create + verify | `LifecycleDevCreateVerifyButton` |
| Persistence audit on create | `LifecycleCreateForm` (console + callback only when flag on) |

Helper: `web/lib/lifecycle/lifecycleDebugUi.ts` → `isLifecycleDebugUiEnabled()`.

## Delete lifecycle

**UI:** `Delete Lifecycle` on activation header when `activation_owned` or `catalogEntry.can_delete`; catalog **Delete** opens the same confirmation modal.

**Modal:** `LifecycleActivationDeleteModal` — lists config, stages, WU queue, placements, `user_department_access`, builder-owned department; warns that **opportunities/records are not deleted**.

**API:** `DELETE /api/admin/departments/:id/lifecycle-activation` → `deleteActivationLifecycleForDepartment`:

- Deactivates builder-owned work unit
- Deactivates action placements (row ids + definition)
- Deletes `user_department_access` for department
- Deletes department when `lifecycle_builder_owned_v1` (or legacy activation-owned dedicated dept)

**Legacy:** Header shows manage hint; catalog delete requires `legacy_delete_confirm` and blocks `enrollment` department key.

## Test lifecycle cleanup

| Mechanism | Path |
|-----------|------|
| Settings UI (admin) | `LifecycleTestCleanupButton` → `POST /api/admin/lifecycle-catalog/cleanup-test` |
| CLI | `web/scripts/cleanupTestLifecycleDepartments.ts` |
| Matcher | `isRemovableTestLifecycleDepartment` in `lifecycleTestLifecycleMarkers.ts` |

**Never deletes:** departments with keys `enrollment`, `operations`, `finance`, `compliance`, `system`.

**Targets:** simulation markers, `Admissions Test`, `[SIM]`, `Verify Lifecycle *`, builder-owned + test name/metadata flags.

## Post-delete

- `notifyWorkspaceDepartmentsChanged` (workspace cache bust)
- `loadCatalog()` / clear selected identity
- Empty create state when no selection

## Tests

```bash
cd web && npm run test -- tests/lifecycle/lifecycleBuilderCleanupDeleteSupport.test.ts tests/lifecycle/lifecycleActivationOwnedDelete.test.ts
cd web && npx tsc --noEmit
```

## Manual cleanup (optional)

```bash
cd web
# Preview
SIMULATION_ORG_ID=<org-uuid> npx tsx scripts/cleanupTestLifecycleDepartments.ts
# Execute
CONFIRM_TEST_LIFECYCLE_CLEANUP=1 SIMULATION_ORG_ID=<org-uuid> npx tsx scripts/cleanupTestLifecycleDepartments.ts
```

Or use **Remove test lifecycles** on `/adminV2/settings/lifecycle` (admin role).
