# Action System

**Status:** Canonical (July 2026)  
**Scope:** Platform-wide action inventory, ownership, configuration, and runtime alignment with Current Work  
**Related:** [actions-current-work-alignment.md](./actions-current-work-alignment.md), [current-work-surface.md](./current-work-surface.md), [operational-action-doctrine.md](./operational-action-doctrine.md), [actions-and-workflows.md](../modules/actions-and-workflows.md)

---

## Doctrine

**Current Work owns operational progression.** Actions are the execution layer that supports it — not a parallel runtime.

| Tier | Role | Surfaces |
|------|------|----------|
| **Primary** | Stage-work completion, checklist handoffs, intake (Create Lead) | Current Work Focus, outcome picker |
| **Supporting** | Configured assists that do not compete with completion | Current Work supporting row, workflow actions |
| **Administrative** | Record admin — duplicate, archive, export, delete | Manage menu (`header_menu` / overflow slot) |
| **Communication** | Composers and outreach | Checklist handoffs, registry comms intents |
| **Future BOS** | Suggest → configured action; never bypass outcome completion | BOS band, Ask BOS, queue BOS chip |

Enrollment is the reference implementation. Domains (Attendance, Billing, Licensing, HR) inherit the same model via configuration — not enrollment branches in shared modules.

---

## Architecture spine

```
action_definitions + action_placements (DB)
        ↓
resolveActionsForContext (server)
        ↓
Surface-specific projection / filter
        ↓
applyRegistryResolvedActionClient (client)  OR  runRegisteredAction (server execute)
```

| Layer | Path | Role |
|-------|------|------|
| **DB config** | `action_definitions`, `action_placements` | Label, placement, conditions, order |
| **Placement resolver** | `web/lib/admin/actions/resolveActionsForContext.ts` | Returns `ResolvedActionsBySlot` |
| **Canonical metadata** | `web/lib/admin/actions/canonicalActionRegistry.ts` | Categories, allowed placements, executor kind |
| **Executable handlers** | `web/lib/adminV2/actions/actionRegistry.ts` | Code-owned: validate, eligibility, preview, execute |
| **Client dispatch** | `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` | Single client router |
| **Logical placements** | `web/lib/platform/commands/invocationContext.ts` | Maps physical surfaces → operator families |

**Physical surfaces:** `record_header`, `record_section`, `queue_row`, `work_unit`, `department`, `workspace`, `right_rail`.

**Logical placements:** `work_unit_actions`, `focus_panel_manage`, `queue_row_menu`, `bos_recommendations`.

---

## Action entry points

### Current Work

| Entry | Source | Runtime | Tier |
|-------|--------|---------|------|
| Primary completion CTA | Stage operating plan outcomes | `projectCurrentWork` → outcome picker → `completeStageWorkWithOutcome` | Primary |
| Checklist handoffs | Work template `handoffKind` | `resolveWorkItemHandoff` | Primary |
| Supporting buttons | `record_header` primary/secondary/header | `deriveCurrentWorkSupportingActions` | Supporting |

Completion is **outside** the action registry by design — stage-work runtime owns progression.

Supporting filter: `web/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActionSurfacePolicy.ts`  
- Excludes Manage overflow slot (config placement)  
- Excludes `status_lifecycle` when outcome picker active (cross-domain)  
- Legacy enrollment admin keys as compat fallback  

### Manage menu

| Entry | Source | Runtime | Tier |
|-------|--------|---------|------|
| Focus Panel Manage | `record_header` flattened | `buildOpportunityDrawerHeaderMenuActions` → `buildSubjectManageMenuFromResolvedActions` | Administrative |
| Legacy entity drawers | Hardcoded stubs | `buildRecordManageMenuForEntity` | Administrative (legacy) |

Manage is a **pass-through** of configured `record_header` actions. Admin actions should use the **overflow** slot in config.

### Header

| Entry | Source | Runtime | Tier |
|-------|--------|---------|------|
| BOS assist CTA | Hardcoded when enabled | `triggerBosDrawerAssistHandoff` | Future BOS |
| Record section actions | `record_section` + `section_key` | Client resolve → `applyRegistryResolvedActionClient` | Supporting |

Focus Panel header does **not** render stage-movement CTAs or unrestricted status dropdown ([operational-action-doctrine.md](./operational-action-doctrine.md)).

### Right rail

| Entry | Source | Runtime | Tier |
|-------|--------|---------|------|
| Workspace rail | `surface=workspace`, `right_rail` | `loadWorkspaceRootActionsServer` | Supporting |
| Work unit rail | `surface=work_unit`, `right_rail` | `loadRightRailActionsBundleServer` | Supporting |
| Current Work demotion | Same + stage-work state | `filterRightRailActionsForCurrentWork` | Policy |

When Current Work owns completion, demotes `communication` and `status_lifecycle` categories from rail.

### BOS

| Entry | Source | Runtime | Tier |
|-------|--------|---------|------|
| Drawer BOS band | Record metadata | `buildOpportunityDrawerBosSummary` | Future BOS (display) |
| Ask BOS / quick_message | Registry + UI intent | `launchContextualAskBos` | Future BOS |
| Registered create_lead | Code registry | `runRegisteredAction` | Primary (intake) |

**Rule:** BOS must not call `completeStageWorkWithOutcome` or write `stage_key` directly.

### Communications

| Entry | Source | Runtime | Tier |
|-------|--------|---------|------|
| Registry comms actions | DB placements | `applyRegistryResolvedActionClient` → `launchContextualQuickMessage` | Communication |
| Outreach checklist fallback | Pattern match on `header_menu` | `resolveCommunicationsComposerAction` | Communication |
| Queue preview Open/Call/Email | Layout `ui.row_preview.actions` | Hardcoded shortcuts | Communication |

### Queue

| Entry | Source | Runtime | Tier |
|-------|--------|---------|------|
| Legacy row rail | `surface=queue_row`, `row_inline` | `resolveActionsForContext` | Supporting |
| Presentation V2 condensed row | — | **Not wired** (gap) | — |

---

## Registry alignment

### Categories (`canonicalActionRegistry`)

| Category | Typical use | Current Work interaction |
|----------|-------------|-------------------------|
| `relationship` | Add child, family member | Supporting — allowed |
| `record` | Open record, admin | Manage (overflow slot) |
| `communication` | Message, email | Rail demoted when CW owns completion; checklist handoff preferred |
| `workflow` | Schedule tour, send form | Supporting — allowed |
| `status_lifecycle` | Update/close status | Demoted when CW outcome picker active |
| `bos_native` | Ask BOS | Future BOS |

### Executable vs metadata-only

- **Registered handlers** (`actionRegistry.ts`): `update_status`, `create_lead`, `confirm_tour`
- **Known metadata** (`canonicalActionRegistry`, `ACTION_BUTTON_LIBRARY`): all other configured keys
- **Unknown keys:** fail loudly in dev/test; disabled in production UI

Config may only reference **known** keys. Config cannot invent executable behavior.

---

## Current Work consumption contract

1. **One resolve** of `record_header` per drawer open  
2. **`buildCurrentWorkSurfaceVM`** projects config + runtime into presentation-safe tiers  
3. **UI renders `surface` VM only** — no domain-specific keys in components  
4. **Right rail** resolved separately; demoted when Current Work owns completion  

---

## Cross-domain readiness

| Domain | Status | Notes |
|--------|--------|-------|
| **Enrollment** | Reference implementation | Stage operating plans, outcome picker, Contact Family template |
| **Attendance** | Config-ready | Use same Current Work + category policy; domain actions via registry |
| **Billing** | Config-ready | `status_lifecycle` demotion applies to invoice/payment status actions when registered |
| **Licensing** | Config-ready | No enrollment assumptions in CW policy module |
| **HR** | Config-ready | Manage overflow slot pattern for admin actions |

**Remaining enrollment-specific compat:** legacy manage keys in `currentWorkActionSurfacePolicy.ts` until billing/HR admin keys are registered with overflow placement.

---

## Key files

| File | Role |
|------|------|
| `web/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork.ts` | Current Work ViewModel |
| `web/lib/adminV2/runtime/focusPanel/currentWork/currentWorkActionSurfacePolicy.ts` | Cross-domain action competition policy |
| `web/lib/adminV2/runtime/focusPanel/currentWork/deriveCurrentWorkSupportingActions.ts` | Supporting action projection |
| `web/lib/adminV2/runtime/focusPanel/currentWork/filterRightRailActionsForCurrentWork.ts` | Rail demotion |
| `web/lib/admin/actions/resolveActionsForContext.ts` | DB placement resolver |
| `web/lib/adminV2/actions/actionRegistry.ts` | Executable handler registry |
| `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` | Client execution router |

---

## Superseded / historical

| Doc | Status |
|-----|--------|
| `docs/sprints/archive/06_2026/actions_runtime_audit.md` | Phase 1 audit — foundation complete; see this doc for current inventory |
| `docs/archive/2026-06-superseded-system/actions-and-workflows.md` | Transitional — prefer `platform/modules/actions-and-workflows.md` + this doc |
| `docs/sprints/archive/05_2026/adminv2_action_runtime_audit_and_plan_v1.md` | Historical |

---

## Phase 2 remainders

- BOS contextual chips in Focus tied to open work template  
- Operating-plan publish reconciliation for in-stage records (production path)  
- Presentation V2 queue row action rail wiring  
- Unify work-unit rail and drawer VM into single resolver module  
- Full Operational Action Rule Set configuration UI + invariant engine  
- Pre-complete communications composer for contact outcomes (beyond trace)
