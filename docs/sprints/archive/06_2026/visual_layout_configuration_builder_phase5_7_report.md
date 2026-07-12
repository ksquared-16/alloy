# Visual Layout Configuration Builder — Phase 5.7 Report

**Date:** 2026-06-16  
**Scope:** Inline field editing, registry block creation, relationship roles, live preview, row template config, inspect mode, runtime transparency.

---

## Summary

Phase 5.7 closes the remaining “black box” gaps in the opportunity drawer visual editor. Operators can add contact and enrollment blocks from a registry, configure relationship roles explicitly, edit fields inline under the selected row, and inspect preview pixels to jump to configuration.

---

## Workstream deliverables

### A — Inline field editing
- Field settings expand directly under the selected field row (`data-visual-editor-field-settings-inline`)
- Removed detached bottom field settings panel

### B — Block creation
- Registry-driven **Add block** menu per section
- Contact, household, and child block templates with add / remove / reorder

### C — Relationship-aware blocks
- Contact cards store `layoutEditorContactRole` metadata
- Role change regenerates name / email / phone refKeys for primary, secondary, emergency, billing, any

### D — True live preview
- Label, icon, typography, visibility, and display changes use `onChange` and update `workingDoc` immediately
- Save persists only; preview never requires save

### E — Row template configuration
- Child row template stores `layoutEditorRowTemplate` metadata: layout mode, actions, display toggles

### F — Humanized link behavior
- UI shows operator labels (`Open Related Record Drawer`, etc.) while storing existing enum values

### G — Inspect mode
- Toolbar **Inspect** toggle
- Preview cells expose trace metadata; hover tooltips and click-to-select open inline configuration

### H — Runtime mapping
- `LayoutRuntimePlanView` adds `data-layout-editor-*` trace attributes in editor preview context

---

## Files changed

| File | Role |
|------|------|
| `web/lib/layout/layoutEditorBlockRegistry.ts` | Block templates, add/remove/move, role patch |
| `web/lib/layout/layoutEditorContactRoles.ts` | Relationship role vocabulary + field refs |
| `web/lib/layout/layoutEditorRowTemplateConfig.ts` | Child row template metadata |
| `web/lib/layout/layoutEditorInspectModel.ts` | Inspect info + path indexes |
| `web/lib/layout/layoutEditorRuntimeTraceContext.tsx` | Preview trace provider |
| `web/lib/layout/layoutEditorCompositionModel.ts` | Role-aware block titles, block helpers |
| `web/lib/layout/layoutEditorDisplayConfig.ts` | Human link behavior labels |
| `web/lib/layout/validateLayoutDocForSurface.ts` | Allow new editor metadata keys |
| `web/components/adminV2/settings/OpportunityDrawerLayoutCompositionPanel.tsx` | Inline editing, add block, block settings |
| `web/components/adminV2/settings/OpportunityDrawerLayoutBlockSettings.tsx` | Role + row template UI |
| `web/components/adminV2/settings/OpportunityDrawerLayoutFieldSettings.tsx` | Inline panel + live onChange |
| `web/components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx` | Trace provider + inspect wiring |
| `web/components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx` | Inspect mode toggle |
| `web/components/layout/LayoutRuntimePlanView.tsx` | Trace attrs on preview cells |
| `web/tests/layout/opportunityDrawerLayoutPhase57.test.ts` | Phase 5.7 tests |

---

## Tests

```bash
cd web && npm run test -- \
  tests/layout/opportunityDrawerLayoutPhase57.test.ts \
  tests/layout/opportunityDrawerLayoutPhase56.test.ts \
  tests/layout/opportunityDrawerLayoutPhase55.test.ts
```

---

## Remaining gaps

1. **Row template runtime** — layout mode / actions metadata stored; enrollment renderer still uses existing display paths until wired
2. **Emergency / billing refKeys** — editor-ready; runtime hydration depends on platform field manifest expansion
3. **Widget internals** — communication timeline subject/date/owner still widget-owned
4. **Household profile substitution** — runtime may still substitute household section component vs doc shape

---

## Suggested commit message

```
feat(layout): Phase 5.7 inline editing, block registry, inspect mode for drawer editor

Add relationship-role contact blocks, live preview field edits, row template metadata,
and preview trace/inspect wiring for fully explainable opportunity drawer layout editing.
```
