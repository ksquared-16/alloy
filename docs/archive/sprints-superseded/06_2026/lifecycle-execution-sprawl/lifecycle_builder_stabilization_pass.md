# Lifecycle Builder — Stabilization Pass

**Date:** 2026-05-31  
**Scope:** Simplify and stabilize scratch setup flow — no new layout.

Related: **`lifecycle_builder_scratch_setup_reset.md`**, **`lifecycle_builder_ux_coherence_pass_2.md`**.

---

## UX model (unchanged layout)

1. Create Lifecycle  
2. Add Stage (name + optional description only)  
3. Configure stage (accordion wizard):
   - Required Fields
   - Statuses
   - Work Unit Queue
   - Actions
   - Forms
   - Attention

---

## Removed / simplified

| Removed | Replacement |
|---------|-------------|
| Starting status on add stage | Assign statuses in Statuses step |
| Sync queue button / helper | Auto-sync on status save (`syncDepartmentQueueForStage`) |
| Full action catalog in builder | Six base actions + custom label |
| Operational Queue label | **Work Unit Queue** |
| Status list in accordion summaries | Count only |
| Repeated status summary blocks | Single assignment in Statuses step |

---

## Work Unit Queue

- Copy: “This queue shows records that are currently in this stage.”
- Filter derives from statuses assigned to the stage (server-side on status PATCH).
- Create/name queue only — no manual sync UI.

---

## Actions

1. Choose base action (Add Person, Add Child, Send Form, Schedule Tour, Change Status, Create Task)  
2. Enter operator label (e.g. Add Parent)  
3. Multi-select placements: Drawer, Work Unit Queue Row, Work Unit Right Rail, Department Right Rail, Overflow Menu  
4. Save → org-scoped definition when label differs; placements tagged `lifecycle_operator_stage`

Active list: label, base action, placements, remove.

---

## Fields

Palette uses `lifecycleFieldRequirementsCatalog` labels (e.g. **Phone**, not Mobile). Deprecated composite rules stay hidden.

---

## Validation

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/adminV2/lifecycleBuilderStabilizationPass.test.ts tests/adminV2/lifecycleBuilderScratchSetup.test.ts
```
