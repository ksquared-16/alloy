# Workspace Tile Visibility — Browser Truth Debug Pass

**Sprint:** June 2026  
**Status:** Implemented

## Root cause (updated)

**False Pass:** `workspace_api` used `catalogValidationTruth().visible_in_workspace_api`, which was true when the **catalog row’s** department (e.g. legacy Enrollment) appeared in the workspace list — even when the **selected lifecycle’s** `department_id` (new builder-owned dept) was not in the API’s 5 ids.

**Exact-ID rule:** All workspace checks now use `selectedDepartmentId === id` in `tileTrace.apiDepartmentIds` / `renderedTileIds`, not “some department exists.”

Earlier cache/dedupe issues still apply:

1. **sessionStorage workspace root cache** hydrates stale `departments[]` on mount (`readWorkspaceRootCache` in `useLayoutEffect`) while the API already includes a new lifecycle department.
2. **`dedupeAdminFetch`** coalesces `/api/admin/departments` — a refetch after repair could complete with an in-flight pre-repair response.
3. **`notifyWorkspaceDepartmentsChanged`** invalidated sessionStorage but did not bust in-flight department fetches; settings pages do not share `accessScopeFingerprint` with workspace layout (broad invalidation still applied).

The workspace **renderer** (`WorkspaceRootDepartmentGrid`) does **not** filter by work unit count, metadata, or department type — only the page’s `filterActiveWorkspaceDepartments` (`is_active !== false`) after GET `/api/admin/departments`.

## End-to-end path

| Step | Location |
|------|----------|
| Page | `web/app/adminV2/workspace/page.tsx` |
| API | `GET /api/admin/departments` (`web/app/api/admin/departments/route.ts`) |
| Transform | `web/lib/workspace/workspaceRootTilePipeline.ts` |
| Render | `WorkspaceRootShell` → `WorkspaceRootDepartmentGrid` |
| Cache | `web/lib/workspace/adminV2WorkspaceSessionCache.ts` (sessionStorage) |
| Refetch signal | `notifyWorkspaceDepartmentsChanged` → `alloy:workspace-departments-changed` |

## Fix

1. **Shared pipeline** — `traceWorkspaceRootDepartmentTiles()` used by workspace page and server validation.
2. **Validation checks** — `workspace_rendered_tiles` (server transform) + `workspace_browser_cache` (client network vs sessionStorage).
3. **Cache bust** — `bustWorkspaceDepartmentsFetchDedupe()` on notify; workspace page re-invalidates session cache on `alloy:workspace-departments-changed`; departments fetch uses `cache: "no-store"`.
4. **Dev debug** — `WorkspaceTileDebugPanel` on workspace (development only): API IDs → after active filter → rendered tile IDs.

## Tests

`web/tests/workspace/workspaceTileVisibilityTruth.test.ts`

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/workspace/workspaceTileVisibilityTruth.test.ts
```
