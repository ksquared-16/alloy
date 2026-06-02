# Lifecycle Activation — Runtime Truth + UX Polish Pass

**Date:** 2026-05-31  
**Status:** Implemented  
**Principle:** Validation passes only when runtime surfaces show the configured lifecycle — not when config rows exist alone.

Related: **`lifecycle_activation_path_validation.md`**, **`lifecycle_activation_step3` blocker fix**.

---

## Blocker fix — workspace tile

**Problem:** Validation passed when any department row existed, while a newly created activation lifecycle was not visible on `/workspace`.

**Fix:**

1. Activation **creates an activation-owned department** (name = lifecycle name) via `POST /api/admin/departments` with `lifecycle_activation_owned_v1` metadata.
2. Workspace check uses the **same active department list** as `GET /api/admin/departments` (what `/adminV2/workspace` renders).
3. Pass requires tile `id` = activation department and tile `name` matches `lifecycle_activation_v1.lifecycle_name`.

---

## UX polish

| Item | Behavior |
|------|----------|
| Delete lifecycle | Confirmation modal; `DELETE .../lifecycle-activation`; removes owned dept + activation artifacts |
| Wizard nav | Back + **Save & continue** buttons (no “Continue →” text links) |
| Queue name | Blank until user enters; create disabled without name |
| Status filter copy | Shows **labels** (`New Lead`), not keys |
| Action placements | Checkbox list (Drawer Actions menu, queue row, rails); default Drawer Actions menu |
| Create Lead | `create_record` base action → `create_lead` definition with label `Create {Lead}` |
| Layout | Compact **activation board** — header + 3-column card grid |
| Validation | Real runtime checks; Fail + explanation when wiring missing |

---

## Runtime validation sources

| Check | Source |
|-------|--------|
| Workspace tile | Active `departments` rows (workspace root API) |
| Dept queue | `work_units` for activation `department_id`, listed on `/dept` |
| Work unit records | `queue_definition` lane filters + `opportunities.status_key` |
| Actions | `action_placements` for saved `action_definition_id` + `action_placement_ids` |

---

## Files (primary)

- `web/lib/lifecycle/validateLifecycleActivationRuntime.ts`
- `web/lib/lifecycle/lifecycleActivationOwned.ts`
- `web/components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx`
- `web/app/api/admin/departments/[departmentId]/lifecycle-activation/route.ts` (DELETE)
- `web/tests/lifecycle/lifecycleActivationRuntimeTruth.test.ts`

---

## Tests

Run:

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/lifecycle/lifecycleActivationRuntimeTruth.test.ts tests/lifecycle/lifecycleActivationStep3.test.ts tests/adminV2/lifecycleActivationPath.test.ts
```
