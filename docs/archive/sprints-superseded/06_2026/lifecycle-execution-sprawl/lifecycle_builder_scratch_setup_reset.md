# Lifecycle Builder — Scratch Setup UX Reset

**Date:** 2026-05-31  
**Scope:** Replace prefilled top-half with build-from-scratch wizard/workbench.

Related: **`lifecycle_builder_ux_coherence_pass_2.md`**, **`lifecycle_stage_setup_ux_pass_v1.md`**.

---

## Problem

The Lifecycle page felt like editing a pre-seeded Enrollment demo: duplicate Department/Lifecycle/name fields, hardcoded stage tabs, and repeated status blocks.

## Core decision

**Department and Lifecycle are the same concept in this UX.** Backend still stores config on `departments.metadata`, but the UI does not expose a separate department selector or duplicate lifecycle naming.

---

## New flow

### 1. Empty / no saved lifecycles

Single card: **Create a Lifecycle**

- Lifecycle name (Enrollment, Billing, Scheduling, …)
- Primary record type (default: Opportunity / Lead)
- **Create Lifecycle** button

No prefilled Enrollment process. GET `/lifecycle-builder` returns empty config when metadata is absent (does not auto-seed).

### 2. Saved lifecycles exist, none selected

**Landing:** Start new lifecycle · Open existing lifecycle (list)

Enrollment demo data may remain in metadata but is not auto-opened.

### 3. Lifecycle open, no stages

Workbench header (name + primary record) → **Add your first stage**

- Stage name
- Short description
- Optional starting status

### 4. Stage setup wizard

Sequential accordion — **one step expanded at a time:**

1. Required Information  
2. Statuses  
3. Operational Queue  
4. Actions  
5. Forms & Packets  
6. Attention signals  

Collapsed rows show a one-line summary.

---

## Removed from UI

- Department selector on this page (first allowed department used silently)
- Separate Lifecycle selector (only when multiple saved lifecycles + “Switch lifecycle”)
- Duplicate “Lifecycle name” edit field in toolbar
- Hardcoded Enrollment stage tabs on load
- `LifecycleStageSummary` duplicate status block
- “Enrollment is the first working example” page copy
- Auto-seed of Enrollment on first GET

---

## Storage (unchanged)

`departments.metadata.lifecycle_builder_v1` — processes + stages.  
New stages support optional `description`.  
`create_process` starts with **zero stages**.  
`clear_active_process` supports landing state.

---

## Components

| Component | Role |
|-----------|------|
| `LifecycleCreateForm` | Empty / create lifecycle |
| `LifecycleLanding` | Start new / open existing |
| `LifecycleWorkbenchHeader` | Active lifecycle + stage tabs |
| `LifecycleAddStageForm` | First / additional stage |
| `LifecycleStageSetupWizard` | Sequential setup accordion |

---

## Validation

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/adminV2/lifecycleBuilderScratchSetup.test.ts tests/lifecycle/lifecycleBuilderConfig.test.ts tests/adminV2/enrollmentProcessHub.test.ts
```

---

## Follow-ups

- Wire custom stage keys through requirements, queue, forms runtime
- Editable primary record type after create
- Multi-department orgs: lifecycle picker at org level if silent first-dept is insufficient
