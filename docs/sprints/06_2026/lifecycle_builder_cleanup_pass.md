# Lifecycle Builder cleanup pass (June 2026)

**Status:** Build fixed; catalog + delete audited; UI changes **not implemented** (per plan).

## 1. Build fixed

### `countIntakeWorkspaceFilters` duplicate export

Inspected `web/lib/forms/intakeWorkspaceFilters.ts`: there is **one** `export function countIntakeWorkspaceFilters` (line ~307). No second export or re-export barrel in the repo. If Turbopack still reports a duplicate, check for an unmerged conflict block in that file locally.

### TypeScript / `next build`

Failures were in lifecycle E2E scripts included in the project `tsconfig`:

| File | Fix |
|------|-----|
| `scripts/simulatePreFixLifecycleE2E.ts` | `buildDim()` return type → `AdminAccessScopeDimensions`; `allowedDepartmentIds: null` when scope is `all` |
| `scripts/validateLifecycleWorkspaceE2E.ts` | `getWorkUnitQueueSummaries({ orgId, workUnitId, countAccuracy })` + use `queues[].count` |

**Verification:** `cd web && npm run build` completes successfully.

---

## 2. Catalog audit — Department vs Lifecycle vs Process

### Definitions (as implemented today)

| Concept | Storage | What operators see |
|---------|---------|-------------------|
| **Department** | `departments` row (`id`, `key`, `name`, `metadata`, `is_active`) | Workspace **tile** (e.g. “Enrollment”, “Admissions Test”). One department can host multiple processes in metadata. |
| **Process** | `departments.metadata.lifecycle_builder_v1.processes[]` | A configured business flow: `id`, `key`, `name`, `stages[]`, `primary_entity`. **Catalog uses `process.name` as the selector label** (`lifecycle_name`). |
| **Lifecycle** (product language) | Not a separate table | Marketing term for “a process you configure in Lifecycle Builder,” usually backed by one process (+ optionally a dedicated builder-owned department for runtime). |

**Catalog construction** (`buildLifecycleCatalog` in `web/lib/lifecycle/lifecycleCatalog.ts`):

```
FOR each department in org:
  FOR each active process in lifecycle_builder_v1.processes:
    EMIT catalog entry { id: departmentId:processId, lifecycle_name: process.name, ... }
```

So the selector is currently **“one row per active process,”** not “one row per department” and not “one row per distinct business lifecycle.”

### Why you see Enrollment / Enrollment(s) / Lead Management

Typical causes in dev/staging orgs:

1. **Multiple processes on the same department** (often `departments.key = enrollment`):
   - Default seed includes one process named **Enrollment** (`defaultLifecycleBuilderV1()`).
   - **+ New Lifecycle** / `createLifecycleProcess` **appends** another process to the **same** department metadata when creation reuses the enrollment department (legacy path) or when operators experiment on the shared enrollment dept.
   - Duplicate names like **Enrollment(s)** are duplicate `process.name` values (manual rename or copy), each with its own `process.id` → separate catalog rows.

2. **Lead Management** is a **second process** on the enrollment department (E2E scripts expect `findProcessInDepartmentMetadata(..., "Lead Management")` on Enrollment). It is not a separate department tile; it is another process entry in the same metadata blob.

3. **Separate builder-owned departments** (metadata `lifecycle_builder_owned_v1`) each emit their own catalog row; their `lifecycle_name` is the process name, which may also be “Enrollment” → **label collision** across departments.

### What should appear in the selector (recommended rules — not implemented)

Only **selector-eligible lifecycles**:

| Include | Exclude |
|---------|---------|
| Builder-owned departments (`lifecycle_builder_owned_v1`) — one process per dedicated dept | Duplicate processes on shared platform departments except the canonical active process |
| Legacy shared dept: **only** `active_process_id` (or single canonical process per `department.key`) | Orphan / test processes (`Enrollment(s)` duplicates) unless explicitly marked active |
| Distinct `catalog.id` = `departmentId:processId` after dedupe | Raw enumeration of every `processes[]` entry |

**Implementation sketch (future, not in this pass):**

- Add `catalog_selector_eligible` (or filter in API) using:
  - `isLifecycleBuilderOwnedDepartmentMetadata` → include active process on that dept.
  - Else if `department.key` in `PROTECTED_DEPARTMENT_KEYS` → include **only** process matching `active_process_id`.
  - Else include all active processes (or one per dept).
- Optional admin tool: “merge/remove duplicate process” on enrollment metadata (Advanced only).

---

## 3. Delete ownership audit

### User-visible error

> Cannot remove processes from the Enrollment department via this action. Use Advanced legacy editor.

Thrown by `POST /api/admin/lifecycle-catalog/delete` when `department.key === "enrollment"` (`web/app/api/admin/lifecycle-catalog/delete/route.ts`).

### Two delete code paths

| Path | Trigger (UI) | What is deleted | Records (opportunities, persons, customers) |
|------|----------------|-----------------|---------------------------------------------|
| **A. Activation DELETE** | `entry.activation_owned === true` → `DELETE .../lifecycle-activation` | `deleteActivationLifecycleForDepartment`: deactivates builder work unit, deactivates action placements, removes `user_department_access`, strips activation + builder metadata; **deletes `departments` row** if `lifecycle_builder_owned_v1` | **Not deleted** |
| **B. Catalog POST delete** | Otherwise → `POST .../lifecycle-catalog/delete` with `process_id` + `legacy_delete_confirm` | If activation-owned metadata on shared dept: same as A without necessarily deleting dept row. Else **legacy**: `removeProcessFromConfig` — removes one process from `lifecycle_builder_v1.processes` on that department | **Not deleted** |

`LifecycleBuilderPrimary.deleteEntry` chooses A vs B from `entry.activation_owned` (department-level builder-owned flag), **not** from `entry.source === "legacy"`.

### Why Delete on “Enrollment” fails

- Enrollment catalog rows usually sit on the **shared** `enrollment` department (`activation_owned: false` on the entry).
- UI uses **path B** (catalog delete).
- Path B **explicitly blocks** any process removal when `dept.key === "enrollment"` to avoid breaking the platform demo/runtime enrollment hub.

**Nothing is deleted** when the API returns 400; the process and department metadata remain unchanged.

### Protected lifecycles / departments

| Protection | Mechanism |
|------------|-----------|
| `enrollment` department key | Hard block in catalog delete route |
| Platform keys | `PROTECTED_DEPARTMENT_KEYS`: enrollment, operations, finance, compliance, system (cleanup scripts; related doctrine) |
| Demo enrollment config | `canDeleteActivationLifecycle` rejects non-builder-owned departments without activation bundle |
| Builder-owned dedicated dept | Full delete allowed via path A |

### How deletion **should** behave (documented model — implement later)

1. **Builder-owned lifecycle** (dedicated department): Delete = path A only; copy matches modal (department + config + access + queue deactivation).
2. **Legacy process on shared platform dept**: Delete = path B with confirm; **never** for `enrollment` key — use **Advanced Configuration** to edit processes, or a dedicated “retire process” migration.
3. **Duplicate Enrollment(s) processes**: Should be removable via path B **if** not on protected key, or via metadata cleanup tool — not via primary Delete on enrollment row.
4. **UI**: Disable Delete or show inline explanation when `department_key === "enrollment"` or `!can_delete`; do not open a modal that always fails.

---

## 4. Updated UI plan (not implemented)

Per product direction — **no shell changes in this pass** until catalog/delete rules are agreed.

### Lifecycle selector (secondary)

Replace `LifecycleCatalogRail` button row with:

```
Lifecycle: [ dropdown ▼ ]     [ + New Lifecycle ]
```

- Dropdown lists **selector-eligible** catalog entries only (after API filter).
- Selecting an entry loads board + stages (unchanged hydration).
- Lifecycles are **context**, not primary navigation.

### Stage navigation (primary)

Keep / strengthen `LifecycleStageNav` as the main horizontal nav:

```
[ Lead ] [ Qualification ] [ Tour ] [ Waitlist ] [ Enrollment ] [ Enrolled ] [ + ]
```

- First stage auto-selected on lifecycle load (already in board).
- **+** adds stage in-tab (not footer).

### Legacy language

| Remove from primary | Move to |
|---------------------|---------|
| “Legacy”, “Builder-owned”, legacy delete modal titles | **Advanced Configuration** section (rename from “Advanced legacy editor”) |
| `LifecycleActivationDeleteModal` legacy variant copy in main builder | Advanced + explicit protected-lifecycle messaging |

`LifecycleSettingsShell`: rename toggle to **Advanced Configuration**; hide all “legacy” wording in builder primary.

### Delete UX (after ownership doc)

- Gate Delete by `can_delete` + `department_key`.
- Enrollment / protected: no Delete in header; link to Advanced Configuration.
- Builder-owned: path A modal only.
- Eligible legacy non-protected: path B with confirm.

---

## 5. Next steps

1. Run `cd web && npm run build` before any further UI work.
2. Product decision: catalog filter rules for selector eligibility.
3. Implement catalog API filter + dropdown (separate PR).
4. Run full Enrollment lifecycle from scratch; log friction separately.
