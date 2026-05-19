# Sprint: Settings Control Plane Closeout (May 2026)

**Path:** `docs/sprints/05_2026/settings_control_plane_closeout.md`  
**Status:** **Closed (foundation checkpoint)**  
**Scope:** Fast pass on **Layouts**, **Actions**, and **Workflow/Status ownership** — no new builder architecture.

---

## Goal

Close the current **configuration foundation** so operators have a coherent four-plane model without reopening Record Experience Builder Cards 5–9 or building a no-code engine.

---

## What is configurable now

| Plane | Route | Operator can |
|-------|-------|----------------|
| **Layouts** | `/adminV2/settings/layouts` | Compose opportunity workflow v1 drawer: section order, show/hide, section names (catalog + workflow titles), move eligible fields between sections, add custom sections to layout, restore layout-hidden sections |
| **Fields** | `/adminV2/settings/fields` | Field definitions, policies, visibility, required rules |
| **Actions** | `/adminV2/settings/actions` | Org-owned placement: enable, display label (org defs), surface/slot/section/order for `record_header` / `record_section` |
| **Statuses** | `/adminV2/settings/statuses` | Status display labels, sort order, active flag per entity type |
| **Automations** | `/adminV2/workflows` | Workflow definitions and execution (not placement) |

**BOS:** `config_layout_assist` only for layout proposals; human approval + same PATCH routes. No raw `config_json` editor.

---

## What remains read-only

| Item | Where | Notes |
|------|-------|-------|
| Platform-global `action_placements` | Actions | `org_id` null — locked in Settings |
| `condition_config` on placements/definitions | Actions | Not editable in Settings V1 |
| Action execution / handlers | Runtime | `executeAdminAction` unchanged |
| Status transition rules | `/adminV2/settings/status-transition-rules` | Read-only reference table |
| Job/schedule drawer composition | Layouts | Preview + read-only banner |
| Layout integrity | Layouts (optional panel) | Diagnostic only |
| Raw `config_json` | — | No operator UI |
| Workflow virtual `field_keys` | Layouts | Platform/workflow config — rename/reorder/hide only |

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
| Status **transitions** | Platform seeds / engineering | `status_transition_rules` — not Layouts |

---

## Deferred (do not start in this pass)

- Record Experience Builder **Cards 5–9** (action preview in Layouts, linked-record primitives, job/schedule editors, assist apply expansion)
- **Workflow Status Configuration V1** — editable transition matrix, transition requirements, permissions, automation hooks UI
- Full `record_actions` → registry migration
- Raw JSON layout editor
- Autonomous BOS apply

---

## Workstream notes (2026-05-18 closeout)

### Layouts
- Sections list = **drawer composition** only (visible + layout-hidden + explicitly ordered catalog keys) — not all `field_section_definitions` rows.
- Copy uses **section name** (not a separate “label” concept in primary flow).
- Field picker uses layout eligibility (drawer-visible), not Fields-settings hide list.

### Actions
- Promoted on Settings index to **Records & layouts** (daily operator use).
- Inventory supports `entity_type` / `section_key` query filters; deep-link from Layouts section detail.

### Status / workflow
- **Statuses** settings remain the home for display labels.
- **Status transition rules** stay read-only diagnostics; follow-up sprint owns editable transitions.

---

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/adminV2/layoutCompositionCapabilities.test.ts tests/fields/fieldPlacementBatch.test.ts tests/adminV2/layoutSettingsCapabilities.test.ts tests/adminV2/layoutsSettingsEntities.test.ts tests/recordChrome/effectiveDrawerLayoutPreview.test.ts tests/adminV2/layoutFieldPickerEligibility.test.ts tests/admin/actionPlacementEditorUi.test.ts
```
