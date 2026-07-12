# Sprint: Settings Control Plane Closeout (May 2026)

**Path:** `docs/sprints/archive/05_2026/completed/settings_control_plane_closeout.md`  
**Status:** **Closed (foundation checkpoint)**  
**Scope:** Fast pass on **Layouts**, **Actions**, and **Workflow/Status ownership** — no new builder architecture.

**Canonical system docs:** [`docs/system/configuration-system.md`](../../system/configuration-system.md) (four-plane model), [`docs/archive/2026-06-superseded-system/actions-and-workflows.md`](../../system/actions-and-workflows.md) (placement vs execution).

---

## Goal

Close the current **configuration foundation** so operators have a coherent four-plane model without reopening Record Experience Builder Cards 5–9 or building a no-code engine.

---

## Settings index (operator IA)

| Group | Tile | Copy intent |
|-------|------|-------------|
| Records & layouts | **Record layouts** | Choose drawer sections and fields |
| Records & layouts | **Fields** | Labels, visibility, required rules |
| Records & layouts | **Statuses** | Manage status names and order |
| Workflows & automation | **Action buttons** | Create and place operator buttons that trigger approved actions or workflows |
| Workflows & automation | **Automations** | Workflows, triggers, status-changing automation |
| Diagnostics | **Workflow automation rules** | Read-only: when conditions are met, workflows may update status |

Action buttons is **not** under Records & layouts. Tiles use the same default card style (no special emphasis/disabled tint).

---

## What is configurable now

| Plane | Route | Operator can |
|-------|-------|----------------|
| **Layouts** | `/adminV2/settings/layouts` | Compose opportunity workflow v1 drawer: section order, show/hide, section names (catalog + workflow titles), move eligible fields between sections, add custom sections to layout, restore layout-hidden sections; deep-link to Action buttons per section |
| **Fields** | `/adminV2/settings/fields` | Field definitions, policies, visibility, required rules |
| **Actions** | `/adminV2/settings/actions` | Create org placement from approved catalog; edit org placements (enabled, record type, surface, slot, section key, order); org-owned action label; built-in → Add org placement |
| **Statuses** | `/adminV2/settings/statuses` | Status display names, sort order, active flag per entity type |
| **Automations** | `/adminV2/workflows` | Workflow definitions and execution (not placement) |

**BOS:** `config_layout_assist` only for layout proposals; human approval + same PATCH routes. No raw `config_json` editor.

---

## What remains read-only

| Item | Where | Notes |
|------|-------|-------|
| Platform-global `action_placements` | Actions | `org_id` null — view in Settings; use **Add org placement** for org override |
| `condition_config` on placements/definitions | Actions | Not editable in Settings V1 |
| Action execution / handlers | Runtime | `executeAdminAction` unchanged |
| Workflow automation rules | `/adminV2/settings/status-transition-rules` | Read-only reference (`status_transition_rules`) |
| Job/schedule drawer composition | Layouts | Preview + read-only banner |
| Layout integrity | Layouts (optional panel) | Diagnostic only |
| Raw `config_json` | — | No operator UI |
| Workflow virtual `field_keys` | Layouts | Platform/workflow config — rename/reorder/hide only |
| `surface=workspace` (root) | Actions / runtime | In schema; AdminV2 resolves `right_rail` and `queue_row` today |

---

## Ownership: Layouts vs Actions vs Workflows

| Concern | Owner | Storage |
|---------|--------|---------|
| Drawer section order & visibility | **Layouts** | `record_drawer_layouts.config_json` (`overview_*`, `inquiry_workflow_sections`) |
| Section **name** in drawer (custom sections) | **Layouts** (edits `field_section_definitions.label` for catalog-backed sections) | Same + catalog table |
| Field **placement** in drawer | **Layouts** (batch) or **Fields** (single) | `field_definitions.section_key`, `sort_order` |
| Form/catalog taxonomy (bulk) | **Field grouping** (`/adminV2/settings/field-sections`) | `field_section_definitions` — advanced; not drawer composition |
| Button **where** it appears | **Actions** | `action_placements` |
| Button **label** (org-owned defs) | **Actions** | `action_definitions.label` |
| Button **what it does** | **Automations** / platform code | workflows, `executeAdminAction` |
| Status **labels** | **Statuses** | `status_definitions` |
| Status **changes from business events** | **Automations** (workflows) | `status_transition_rules` + workflow runs — not a standalone “status rules” product |

---

## Key implementation paths

| Area | Location |
|------|----------|
| Layouts composition UI | `web/components/adminV2/settings/RecordDrawerCompositionWorkspace.tsx`, `OpportunityWorkflowV1SectionsEditor.tsx`, `LayoutSectionFieldsPanel.tsx` |
| Layout preview / editor sections | `web/lib/recordChrome/effectiveDrawerLayoutPreview.ts` |
| Layout field picker filter | `web/lib/adminV2/layouts/layoutFieldPickerEligibility.ts` |
| Section type copy | `web/lib/adminV2/layouts/sectionTypePresentation.ts` |
| Action Settings UI | `web/components/adminV2/settings/ActionPlacementsSettingsClient.tsx`, `ActionButtonCreatePanel.tsx`, `ActionPlacementFormFields.tsx` |
| Action placement APIs | `web/app/api/admin/action-placements/route.ts`, `…/[id]/route.ts`, `web/app/api/admin/actions/definition-catalog/route.ts` |
| Action validation / copy | `web/lib/admin/actions/actionPlacementMutation.ts`, `actionPlacementPresentation.ts`, `actionPlacementEditorUi.ts`, `actionButtonCreateUi.ts` |
| Runtime resolve | `web/lib/admin/actions/resolveActionsForContext.ts`, `GET /api/admin/actions` |

---

## Workstream notes

### Layouts
- Sections list = **drawer composition** only (visible + layout-hidden + explicitly ordered catalog keys) — not all `field_section_definitions` rows.
- Copy uses **section name** (not a separate “label” concept in primary flow).
- Field picker uses layout eligibility (`layoutFieldPickerEligibility.ts`), not Fields-settings hide list.
- Built-in / workflow / custom section types use operator labels in `sectionTypePresentation.ts`.

### Actions
- Settings index: **Workflows & automation**.
- **Create button from existing action** — org `action_placements` row only (`POST` + catalog `GET`).
- **Org-owned placements** fully editable: enabled, record type, where (surface), position (slot), section key, order; org-owned definition labels.
- **Built-in placements** read-only with **Add org placement** (prefilled create form).
- Operator surface/slot help in `actionPlacementPresentation.ts`.
- **Workspace:** assign via **Workspace (side panel)** → `right_rail`, **Workspace (queue row)** → `queue_row`. Root `surface=workspace` deferred.

### Status / workflow
- **Statuses** — display names and order only.
- **Workflow automation rules** — read-only diagnostics; example copy: tour date set → Tour Scheduled is **Automations**, not Layouts or Statuses alone.
- Custom action execution / full automation builder — **deferred**.

---

## Related / follow-on (outside this sprint closeout)

- **Linked record field editing V1** — see `docs/sprints/archive/05_2026/linked_record_field_editing_v1.md`.
- **Record Experience Builder Phase 1** Cards 5–9 — action preview in Layouts, job/schedule editors, etc. — see `docs/sprints/archive/05_2026/record_experience_builder_phase_1.md` §23.

## Deferred (do not start without new sprint)

- Record Experience Builder **Cards 5–9** (in-layout action preview, broad builder scope)
- **Workflow Status Configuration V1** — editable transition matrix UI
- Full `record_actions` → registry migration
- Raw JSON layout editor
- Autonomous BOS apply
- New action execution types from Settings

---

## Verification

```bash
cd web && npx tsc --noEmit

cd web && npm run test -- \
  tests/adminV2/layoutCompositionCapabilities.test.ts \
  tests/fields/fieldPlacementBatch.test.ts \
  tests/adminV2/layoutSettingsCapabilities.test.ts \
  tests/adminV2/layoutsSettingsEntities.test.ts \
  tests/recordChrome/effectiveDrawerLayoutPreview.test.ts \
  tests/adminV2/layoutFieldPickerEligibility.test.ts \
  tests/admin/actionPlacementEditorUi.test.ts \
  tests/admin/actionPlacementMutation.test.ts \
  tests/admin/actionButtonCreateUi.test.ts \
  tests/admin/actionPlacementPresentation.test.ts
```
