# Opportunity Drawer Runtime Ownership Map

**Scope:** Layout Runtime hard cutover for the Opportunity Drawer (gold-standard reference implementation).  
**Date:** 2026-06-08  
**Status:** Active — use this map before extending Person or Child drawer cutover.

---

## Architecture Layers

| Layer | Source | Role |
|-------|--------|------|
| **Layout doc** | `entity_layouts` (Settings → Layouts) | Visible UI structure: sections, fields, widgets, related lists |
| **Layout Runtime** | `useDrawerLayoutRuntimeBody`, `LayoutRuntimePlanView`, `DrawerLayoutRuntimeOverviewBody` | Resolves layout doc + record → rendered overview body |
| **VM (View Model)** | `useOpportunityDrawerVmPayload`, drawer VM builders | Data, actions, lifecycle, caching, save coordinator host |
| **VM Runtime shell** | `OpportunityDrawerVmRuntime` | Orchestrates drawer open/reveal, header shell, tab panes, modals |

**Rule:** Layout owns *what* is visible. VM owns *data*, *actions*, *lifecycle*, and *operating save coordination*.

---

## VM-Owned (Runtime Chrome & Operations)

These remain VM-injected regardless of layout cutover:

| Surface | Owner | Implementation |
|---------|-------|----------------|
| **Drawer open/reveal gate** | VM Runtime | `OpportunityDrawerVmRuntime` — Opening Lead overlay until VM + layout body ready; `drawerOpen` gated on `overviewLayoutShellReady` |
| **Header shell composition** | VM Runtime | `OpportunityDrawerProofLayoutHeader` composes VM controls into `ProofRecordModalHeaderShell` |
| **Title + location** | VM | `formatOpportunityInquiryDrawerTitle`, `opportunityDisplayLocationFromRecord` |
| **Work with BOS** | VM Actions | `OpportunityDrawerHeaderControls` → `BosDrawerAssistCta` |
| **Actions menu** | VM Actions | `OpportunityDrawerHeaderActionsMenu` + `useOpportunityDrawerVmHeaderActions` + registry modals (`useOpportunityDrawerVmRegistryModals`) |
| **Status dropdown** | VM | `VmProgressiveStatusDropdown` + `displayVm.header.status` |
| **Save / Revert** | VM Save coordinator | `OpportunityDrawerHeaderSaveActions` polls `drawerOperatingSaveCoordinator`; layout person-contact edits register as `layout_runtime_person_contact` |
| **Tab strip** | VM Layout | `displayVm.layout.tabs` (fallback: inquiry workflow tab strip) |
| **Lifecycle rail** | **VM — NOT a layout widget** | `buildOpportunityVmLifecycleRailModel` → `ProofDoctrineLifecycleRail`, passed as `lifecycleRail` prop to header shell |
| **Queue navigator** | VM | `OpportunityDrawerQueueNavigatorControls` |
| **Communications preload** | VM | `CommunicationsDrawerBackgroundLoader` |
| **Non-overview tab panes** | VM | `OpportunityDrawerVmTabPanes` (Communications, Notes, Documents, Activity) |
| **Action modals host** | VM | Sibling of `<Drawer>` at fragment root — `data-vm-drawer-action-modals-host="true"` |
| **Record data / PATCH** | VM | `patchDisplayRecord`, person-contact save via `layoutRuntimePersonContactEdit` |

### Lifecycle Rail — Explicit Answer

The lifecycle rail is **VM-injected runtime chrome**, not a Layout Runtime widget.

- Built by: `buildOpportunityVmLifecycleRailModel`
- Rendered by: `ProofDoctrineLifecycleRail` inside `OpportunityDrawerProofLayoutHeader` / legacy drawer body
- **Not** resolved from `entity_layouts` widget keys
- Future: could become a layout widget only after explicit product decision + catalog seed

---

## Layout Runtime-Owned (Overview Body)

These are driven by Settings → Layouts and the layout runtime pipeline:

| Surface | Owner | Implementation |
|---------|-------|----------------|
| **Overview body structure** | Layout | `entity_layouts` doc → API `/api/admin/layout-runtime/opportunity-drawer-body` |
| **Section / field / widget rendering** | Layout Runtime | `LayoutRuntimeDrawerBodyView` → `LayoutRuntimePlanView` |
| **Field values (display)** | Layout Runtime record map | `buildOpportunityLayoutRuntimeRecordFromVm` |
| **Person-contact editable fields** | Layout Runtime + Save coordinator | `LayoutRuntimeDrawerEditProvider`, `ValueCell` for supported refKeys only |
| **Tasks widget presentation** | Layout Runtime widget | `LayoutRuntimeTasksWidget` — operational chip styling from inquiry summary |
| **Attention widget presentation** | Layout Runtime widget | Attention block in `LayoutRuntimePlanView` (data from VM-mapped record) |
| **Related lists (e.g. Child Information)** | Layout Runtime | Related list cells; adornment navigation via `handleLayoutRuntimeAdornmentOpenDrawer` |
| **Hold / error states** | Layout Runtime | `OpportunityDrawerLayoutRuntimeOverviewHold`, `LayoutRuntimeErrorPanel` (hard cutover) |
| **Emergency fallback** | Layout Runtime flag | `LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK=1` only — otherwise error panel |

---

## Shared / Boundary

| Concern | Layout | VM |
|---------|--------|-----|
| Tasks data | Renders widget | Supplies `_overview_data.tasks` via record mapper |
| Attention data | Renders widget | Supplies attention payload via record mapper |
| Save dirty state | Registers `layout_runtime_person_contact` | Header polls coordinator |
| Adornment open drawer | Handles click + routing | Supplies person/child ids on record |
| Staging diagnostic | `DrawerLayoutRuntimeStagingDiagnostic` | Gated: `NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG=1` only |

---

## DOM Markers (QA)

| Marker | Expected when |
|--------|----------------|
| `data-opportunity-drawer-opening-overlay="true"` | Loading — before drawer reveals |
| `data-proof-layout-header-variant="opportunity-drawer-runtime"` | Cutover header ready |
| `data-drawer-layout-runtime-overview="true"` | Layout body ready |
| `data-layout-runtime-tasks-widget="true"` | Tasks widget rendered |
| `data-opportunity-drawer-save-changes="true"` | Dirty + Save visible |
| `data-vm-drawer-action-modals-host="true"` | Action modals mounted |

**Should NOT appear in normal runtime:**

- `data-layout-runtime-staging-diagnostic="true"` (unless debug flag)
- `data-drawer-vm-runtime-overview="true"` on opportunity overview (emergency fallback only)
- Blank white drawer body before overlay dismisses

---

## Still VM-Owned After Cutover (Do Not Move to Layout Without Explicit Decision)

1. Lifecycle rail
2. Header actions (BOS, Actions, Status, Save chrome)
3. Tab navigation
4. Action execution + modals
5. Status mutations
6. Queue navigation
7. Communications/Notes/Documents/Activity tab content

---

## Follow-On (Out of Scope for Stabilization)

- Person drawer cutover (use this map as template)
- Child drawer cutover
- Field catalog cleanup / seed consolidation
- Performance / preload implementation
- Child Information related-list data gaps (separate mapping task)
