# Lifecycle Activation Path — Audit & Validation Pass

**Date:** 2026-05-31  
**Status:** Audit complete → additive implementation in progress  
**Principle:** Configuration is not successful until it appears in runtime.

Related: **`lifecycle_builder_stabilization_pass.md`**, **`lifecycle_builder_scratch_setup_reset.md`**.

---

## 1. Runtime source audit

### `/adminV2/workspace` — lifecycle / department tile

| Source | Details |
|--------|---------|
| **Page** | `web/app/adminV2/workspace/page.tsx` |
| **Data** | `GET /api/admin/departments` → `departments` rows (`id`, `name`, `key`, `metadata`) |
| **UI** | `WorkspaceRootShell` + `WorkspaceRootDepartmentGrid` — one tile per department |
| **Layout** | `getDepartmentWorkspaceLayout(dept.key)` from `web/lib/workspace/registry.ts` (code registry, not lifecycle metadata) |

**Implication:** There is no separate “lifecycle tile.” Activation validates that the **target department** (typically `key=enrollment`) appears on workspace. Lifecycle builder metadata does not create workspace tiles by itself.

### `/adminV2/workspace/dept/:departmentId` — Work Unit Queue

| Source | Details |
|--------|---------|
| **Page** | `web/app/adminV2/workspace/dept/[departmentId]/page.tsx` |
| **Work units** | `GET /api/admin/work-units?department_id=` → `work_units` table |
| **Pipeline UI** | When `enrollment_pipeline` work unit exists, `resolveDeptPipelineExecSurface` shows lane cards linking to work-unit routes |
| **Display name** | `work_units.name` (operator-facing queue name) |

**Implication:** Creating `work_units` row with `key=enrollment_pipeline` on the enrollment department makes the queue visible on `/dept`. Custom queue **name** (e.g. “New Leads”) is the panel title via `resolveDeptWorkUnitDisplayLabel`.

### `/adminV2/workspace/dept/:departmentId/work-unit/:workUnitId` — matching records

| Source | Details |
|--------|---------|
| **Page** | `web/app/adminV2/workspace/dept/.../work-unit/.../page.tsx` |
| **Filters** | `work_units.queue_definition` JSON (v2 lanes); lane `filters` / `filters_compat_v1` with `type: status` / `case_status` |
| **Status assignment** | `status_definitions.metadata.enrollment_operator_stage` (via status-stages PATCH) |
| **Sync** | `syncDepartmentQueueForStage` copies stage status keys into lane filters for `ENROLLMENT_STAGE_QUEUE_KEYS[stage]` |

**Implication:** Records appear when opportunity `status_key` is in the lane filter set. Stage must use a **platform operator key** (`lead`, `qualification`, …) so `ENROLLMENT_STAGE_QUEUE_KEYS` maps to a lane (e.g. `lead` → `new_leads`). Custom stage slugs without that mapping will not update queue filters today.

### Drawer → Actions overflow menu

| Source | Details |
|--------|---------|
| **Resolver** | `resolveActionsForContext` → `action_placements` + `action_definitions` |
| **Menu** | `flattenOpportunityRecordHeaderActionsForMenu` in `AdminEntityDrawer` / `OpportunityDrawerHeaderActionsMenu` |
| **Slots** | `record_header` surfaces: `primary`, `secondary`, `overflow` → flattened into one Actions menu |

**Implication:** Placements on `record_header` + `slot: overflow` appear in the Actions dropdown. Activation should create **overflow only** (no header pills, queue row, or rails).

---

## 2. Tables / metadata driving each surface

| Surface | Primary storage |
|---------|-----------------|
| Workspace dept tiles | `departments` |
| Lifecycle builder config | `departments.metadata.lifecycle_builder_v1` |
| Status ↔ stage binding | `status_definitions.metadata.enrollment_operator_stage` |
| Work unit + queue | `work_units` (`key`, `name`, `queue_definition`, `department_id`) |
| Actions | `action_definitions`, `action_placements` (`condition_config.lifecycle_operator_stage` for stage scope) |
| Activation audit trail (new) | `departments.metadata.lifecycle_activation_v1` |

---

## 3. Minimal additive connection

1. **Settings entry** — “Lifecycle Activation Preview” mode alongside existing builder (no removal).
2. **Activation wizard** — Reuse existing APIs: lifecycle-builder, status-stages, stage-work-unit POST, stage-actions POST (overflow-only mode).
3. **Persist activation bundle** — `lifecycle_activation_v1` on department metadata (department id, process id, stage key, work unit id, status keys) for validation and rollback.
4. **Validation API** — `GET .../lifecycle-activation/validate` checks four runtime criteria server-side and returns pass/fail + links + failure reasons.
5. **No global runtime changes** — Enrollment demo, waitlist, attention, and existing placements unchanged unless activation explicitly writes new org-scoped rows.

**Constraints for Lead-style path (this pass):**

- Target department with `key=enrollment` (or first department if missing).
- Stage name should resolve to operator key `lead` (slugify).
- Status keys assigned via existing status-stages flow.
- `enrollment_pipeline` work unit + auto queue filter sync on status save.
- Single overflow placement per activation action.

**Out of scope:** Waitlist child/candidate filters, Needs Attention in stage setup, workspace registry layout changes, new department creation.

---

## 4. Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Overwrites Enrollment demo metadata | Medium | Activation uses separate process name; does not delete existing `lifecycle_builder_v1` processes; activation pointer is additive |
| Duplicate `enrollment_pipeline` work unit | High | POST returns 409 if pipeline exists — activation reuses existing pipeline and updates name/filters |
| Custom stage keys lack queue lane mapping | Medium | Validation explains; docs require platform keys for queue proof |
| Action appears on all stages | Low | `condition_config.lifecycle_operator_stage` scopes placement |
| Org-wide action definition clone | Low | Same pattern as stabilization pass (`ensureOrgLifecycleActionDefinition`) |

---

## 5. Rollback plan

1. Delete `departments.metadata.lifecycle_activation_v1` (or PATCH clear).
2. Remove activation-created org `action_placements` (by id from activation bundle).
3. Optionally revert status assignments via status-stages reset for the stage key.
4. Work unit name/queue_definition can be restored from backup or re-run Enrollment seed scripts.
5. Disable Activation Preview UI by hiding tab (builder unchanged).

No migrations required; all changes are metadata/placement rows.

---

## 6. Implementation (additive)

See code:

- `LifecycleSettingsShell` — builder + activation tabs
- `LifecycleActivationClient` — 6-step wizard + validation
- `validateLifecycleActivationRuntime.ts` — checklist engine
- `lifecycle-activation/route.ts` — persist activation bundle
- `lifecycle-activation/validate/route.ts` — runtime checklist

---

## 7. Validation checklist (runtime)

After setup, operator sees:

| Check | Pass criteria |
|-------|----------------|
| Workspace | Department row exists and is listed for org |
| Department | `enrollment_pipeline` work unit listed for department |
| Work unit | Lane filter status keys ⊇ activation status keys; opportunity count > 0 if data exists |
| Drawer Actions | Overflow placement active for stage-scoped definition |

Each item: Pass / Fail, link, failure explanation.

---

## 8. Follow-ups

- Custom lifecycle stages → dynamic queue lane keys (not only `ENROLLMENT_STAGE_QUEUE_KEYS`)
- Waitlist candidate filters
- Lifecycle-level Needs Attention (not per-stage)
- DB-backed `department_workspace_layouts` instead of code registry
