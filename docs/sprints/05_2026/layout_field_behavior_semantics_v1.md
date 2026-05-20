# Layout + field behavior semantics v1 (Phase 1)

**Path:** `docs/sprints/05_2026/layout_field_behavior_semantics_v1.md`  
**Status:** **Phase 1 complete — paused.** Do not continue iterating in this sprint.  
**Phase 2 backlog:** `docs/sprints/05_2026/layout_field_behavior_semantics_phase_2.md`  
**Scope lock:** May 2026

## Sprint goal

Move operator-facing **Required** and **Editability** configuration from the primary Fields Settings surface to **Record layouts** (`field_placements_v1` on org `record_drawer_layouts.config_json`) for the **opportunity workflow v1** drawer, while keeping `field_definitions` policies as **compatibility defaults** (not the primary operator control for drawer behavior).

## Risk gate decisions (locked)

| Gate | Decision |
|------|----------|
| **G0** | Use `record_drawer_layouts.config_json.field_placements_v1` JSON overlay for v1. **No new DB table.** |
| **G1** | Confirm no new table for v1. |
| **G2** | Layout placement writes must **NOT** overwrite `field_definitions.requirement_policy` or `interaction_policy`. |
| **G3** | **No automatic sync** from placement writes to `field_definitions.is_required` in v1. |
| **G4** | Baseline policy tests green before Card 0. |
| **G5** | Hardcoded inquiry summary layout migration remains **out of scope**. |

## Resolution order (runtime)

For surface `drawer_overview` only (opportunity workflow v1 drawer today):

1. **Placement override** — `field_placements_v1` → `surfaces.drawer_overview`
2. **Definition default** — `field_definitions` policies / legacy `is_required`
3. **System preset** — `drawerFieldPolicyAdapter` caps

Implemented in `resolveEffectiveFieldBehavior` + `buildDrawerFieldPolicyResolvedMap` (`web/lib/fields/`).

## OUT of scope (Phase 1)

Forms, public booking, workflow status-transition enforcement, inquiry_child/OCM placement behavior, config assist new ops, new DB table, inquiry summary migration, advanced conditional requiredness, job drawer layout behavior controls, unified forms/workflows placement model, configurable drawer header summary grid.

---

## Implementation cards

| Card | Status | Summary |
|------|--------|---------|
| 0 | **Done** | Types, `fieldPlacementV1` parser, `resolveEffectiveFieldBehavior`, unit tests |
| 1 | **Done** | `PATCH …/opportunity-workflow-v1-field-placements` (layout JSON only) |
| 2 | **Done** | Opportunity drawer GET `_field_policy_resolved` |
| 3 | **Done** | Opportunity PATCH enforcement via effective policies |
| 4 | **Done** | Placement-aware layout integrity |
| 5 | **Done** | Layouts Settings — Required / Editability per field |
| 5.5 | **Done** | Layouts UX — section labels, save/remove feedback |
| 5.6 | **Done** | Cohesive drawer model — header as section row, built-in sections useful, shorter settings chrome |
| 6 | **Done** | Fields Settings de-emphasis (opportunity/job) |
| 7 | **Done** | Doctrine + active topic docs |
| 8 | **Paused** | Broad UI density polish — superseded by targeted operational UX + drawer breathing passes |
| **Ops UX** | **Done** | Settings header simplification, debug metadata behind Developer details, stable section selection, save/remove clarity |
| **Drawer density** | **Done** | Opportunity modal header compressed vs pre-cleanup; final ~2–4px breathing-room pass on title/actions/tabs (still materially shorter than original) |

---

## Final implementation summary

| Layer | Behavior |
|-------|----------|
| **Storage** | `field_placements_v1[]` on effective org `record_drawer_layouts.config_json` when `inquiry_drawer_mode === workflow_v1` |
| **Layouts Settings** | One drawer model: **Drawer header** + body sections; per-field Required/Editability → Card 1 PATCH; section order/visibility separate API |
| **Fields Settings** | Opportunity/job: structure/defaults primary; CTA to Record layouts for drawer behavior |
| **Drawer GET** | Placement-aware `_field_policy_resolved` on opportunity workflow v1 |
| **Drawer PATCH** | `enforceDrawerFieldPoliciesOnPatch` uses effective policies + layout config |
| **Integrity** | `required_on_layout_not_visible` when layout-required field absent from preview |
| **Job** | Definition-based enforcement unchanged (no layout placement plane) |

**Operator UX (Phase 1):** Section types labeled Header / Standard section / Workflow section / Custom section. Built-in sections show fixed rows and behavior controls where field definitions exist. Debug provenance/fidelity/IDs only under collapsed **Developer details** on Layouts. Section selection is local (no left-panel reload flash on click).

**Not done (deferred to Phase 2):** Configurable header summary grid, archive/delete layout sections, inquiry child grid column configuration, forms/workflows reuse of placement model, multi-surface layouts beyond opportunity drawer overview.

---

## Files / areas changed (Phase 1)

**Policy & API**

- `web/lib/fields/fieldPlacementV1.ts`, `resolveEffectiveFieldBehavior.ts`, `drawerFieldPolicyAdapter.ts`
- `web/lib/admin/opportunityWorkflowV1FieldPlacements.ts`
- `web/lib/fields/enforceDrawerFieldPoliciesOnPatch.ts`
- `web/lib/config/layoutIntegrityValidator.ts`
- `web/app/api/admin/record-drawer-layouts/opportunity-workflow-v1-field-placements/`
- Opportunity entity GET/PATCH paths (placement-aware policy map)

**Layouts Settings UI**

- `web/lib/adminV2/layouts/layoutSectionOperatorUi.ts`, `layoutFieldBehaviorUi.ts`, `layoutCompositionCapabilities.ts`, `sectionTypePresentation.ts`
- `web/components/adminV2/settings/RecordDrawerCompositionWorkspace.tsx`
- `web/components/adminV2/settings/OpportunityWorkflowV1SectionsEditor.tsx`
- `web/components/adminV2/settings/LayoutSectionFieldsPanel.tsx`
- `web/components/adminV2/settings/LayoutFieldBehaviorControls.tsx`
- `web/components/adminV2/settings/EffectiveDrawerLayoutPreviewPanel.tsx` (developer mode only)
- `web/app/adminV2/settings/layouts/`, `LayoutsSettingsHubClient.tsx`
- `web/lib/adminV2/settingsPageSubtitles.ts`

**Fields Settings UI**

- `web/app/adminV2/settings/fields/`, `SettingsFieldsHubClient.tsx`
- `web/components/admin/EntityFieldsClient.tsx` (+ person/location field clients)

**Drawer chrome (density only — no behavior change)**

- `web/components/admin/Drawer.tsx`
- `web/components/admin/AdminEntityDrawer.tsx`
- `web/lib/ui-v2/adminV2LoadingGeometry.ts` (timeline reserve; not expanded in final pass)

**Tests**

- `web/tests/adminV2/layoutSectionOperatorUi.test.ts`
- `web/tests/adminV2/layoutFieldBehaviorUi.test.ts`
- Existing field policy / enforcement / integrity tests (baseline + extensions)

**Docs (active topic)**

- `docs/system/configuration-system.md`, `docs/system/record-system.md`, `docs/execution/operating-doctrine.md`

---

## Final acceptance status

| Criterion | Status |
|-----------|--------|
| `field_placements_v1` on layout JSON; no new table | **Met** |
| Placement → definition → preset on opportunity drawer | **Met** |
| Layout PATCH does not mutate `field_definitions` policies | **Met** |
| Drawer GET/PATCH use effective behavior | **Met** |
| Layout integrity placement-aware | **Met** |
| Layouts owns Required/Editability for opportunity workflow v1 | **Met** |
| Fields de-emphasized for opportunity/job | **Met** |
| Cohesive layouts operator model (header row, no debug in main UI) | **Met** |
| Stable section selection; trustworthy save/remove copy | **Met** |
| Opportunity modal header compact but not cramped (final breathing pass) | **Met** |
| Forms/workflows unified with placement model | **Not met** (Phase 2) |
| Configurable drawer header / child grid columns | **Not met** (Phase 2) |

---

## Known limitations (Phase 1)

- **Drawer header** is a UI section row for behavior on catalog-backed summary keys; **title/status/summary grid composition is not operator-configurable.**
- **Inquiry children / tuition** built-in sections: fixed grid columns in v1; behavior controls only where keys resolve to opportunity `field_definitions`.
- **Workflow virtual sections:** behavior only for `field_keys` present in effective preview.
- **`field_placements_v1` is JSON** on `config_json` — no first-class placement table, no cross-surface editor.
- **Job / schedule / other entities:** no layout behavior controls in Settings; job PATCH remains definition-based.
- **Forms, public booking, config assist, BOS** do not read placement overlays.
- **Status/action “required on phase”** not modeled in placements.
- **Card 8** large density redesign intentionally not pursued; targeted passes only.

---

## Do not continue iterating in this sprint

Phase 1 delivers a **good enough** operator split: **Fields = structure**, **Layouts = drawer behavior** for opportunity workflow v1. Further work belongs in **Phase 2** (`layout_field_behavior_semantics_phase_2.md`) or unrelated sprints — not additional cards on this doc.

Do **not** reopen Phase 1 for: new schema, enforcement changes, forms/booking integration, header grid configuration, or open-ended UI polish.

---

## JSON shape (`field_placements_v1`)

```json
{
  "field_placements_v1": [
    {
      "field_key": "notes",
      "surfaces": {
        "drawer_overview": {
          "requirement": { "version": 1, "mode": "required_on_save", "validation_scope": "save" },
          "interaction": { "version": 1, "editability_mode": "read_only", "ownership": { "…": "…" } }
        }
      }
    }
  ]
}
```

Presets: requirement `optional` | `required` | `required_on_save`; interaction `editable` | `read_only`.

---

## Final manual QA checklist

### Layouts → Opportunity

1. **Drawer header** is first section row; no standalone header callout above the list.
2. Built-in sections (Inquiry children, Tuition/pricing) show useful rows and behavior where supported; fixed columns noted compactly.
3. Custom section: add/remove fields, **Remove from layout** (not delete), field order save feedback.
4. Required/Editability: saving / saved / error on dropdown change.
5. Click sections rapidly — left list does not flash **Loading drawer sections…**
6. **Developer details** collapsed by default — no provenance/IDs/fidelity in main view.
7. Settings pages (Layouts, Fields, Actions, Field grouping): one subtitle, work surface high on page.

### Fields → Opportunity / Job

1. No Required/Editability columns; layout behavior note + link to Record layouts.
2. Field structure edits still save.

### Drawer (opportunity modal)

1. Header-to-tabs spacing materially shorter than pre-cleanup; tabs not glued to border; text has inner breathing room.
2. Action buttons and tabs still work.
3. Placement change reflected in save validation and `_field_policy_resolved` on GET.
4. `field_definitions.is_required` unchanged after layout-only behavior save.

### Integrity

1. `required_on_layout_not_visible` when layout-required field missing from drawer preview.

---

## References

- `docs/sprints/05_2026/layout_field_behavior_semantics_phase_2.md` — deferred enhancements
- `docs/system/configuration-system.md` — Fields vs Layouts planes
- `docs/system/record-system.md` — `_field_policy_resolved`, integrity
- `docs/execution/operating-doctrine.md` — structure vs layout behavior
