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
| **Actions** | `/adminV2/settings/actions` (Settings → Workflows & automation) | Create org placement from approved catalog; enable; surface/slot/section/order; org-owned label |
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

## Follow-on shipped (May 2026)

- **Linked record field editing V1** — Opportunity drawer → primary person (`first_name`, `last_name`, `email`, `phone`) via `interaction_policy` + `PATCH /api/admin/persons/:id`. See **`linked_record_field_editing_v1.md`**.

## Deferred (do not start in this pass)

- Record Experience Builder **Cards 5–9** (action preview in Layouts, job/schedule linked-record editors, assist apply expansion)
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
- Settings index: **Workflows & automation** (same card style as other settings — no emphasis/disabled tint).
- **Create button from existing action** — `POST /api/admin/action-placements` + `GET /api/admin/actions/definition-catalog` (org placement only; no new execution handlers).
- **Org-owned placements** fully editable: enabled, record type, surface (record header, record section, workspace side panel, workspace queue row), slot, section key, order; org-owned definition labels.
- **Built-in placements** read-only; **Add org placement** clones from catalog with prefilled context.
- Operator copy for surfaces/slots in `actionPlacementPresentation.ts`.
- **Deferred:** `surface=workspace` on workspace root (schema allows it; UI resolves `right_rail` / `queue_row` today).

### Status / workflow
- **Statuses** — display names and order only.
- **Workflow automation rules** (formerly “status transition rules” in copy) — read-only diagnostics; behavior like “tour date set → Tour Scheduled” is **Automations**, not a standalone status-rules product.
- Custom action execution / full automation builder — **deferred**.

---

## Verification

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/adminV2/layoutCompositionCapabilities.test.ts tests/fields/fieldPlacementBatch.test.ts tests/adminV2/layoutSettingsCapabilities.test.ts tests/adminV2/layoutsSettingsEntities.test.ts tests/recordChrome/effectiveDrawerLayoutPreview.test.ts tests/adminV2/layoutFieldPickerEligibility.test.ts tests/admin/actionPlacementEditorUi.test.ts
```
