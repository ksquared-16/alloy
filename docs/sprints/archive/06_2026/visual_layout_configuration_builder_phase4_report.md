# Visual Layout Configuration Builder — Phase 4 Report

**Date:** 2026-06-15  
**Scope:** Opportunity drawer runtime adoption of `entity_layouts` visual config — `layoutEditorHidden` section visibility.

---

## Summary

Phase 4 wires **published `entity_layouts` section metadata** into the opportunity drawer **layout runtime read path** for one behavior: **`layoutEditorHidden`** suppresses registered layout sections at render time.

Adoption is gated by **`isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabled*()`**, which requires opportunity drawer body runtime and defaults **on** (kill switch: `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_ENTITY_LAYOUTS_VISUAL_CONFIG=0`).

No drawer shell, reveal gate, BOS, lifecycle rail, tabs, or actions bar changes.

---

## Runtime behavior

| Input | Runtime effect |
|-------|----------------|
| `section.metadata.layoutEditorHidden === true` on registered `opportunity_drawer` section key | Section omitted from composition + `LayoutRuntimePlanView` when adoption flag on |
| Adoption flag off | Metadata ignored (settings preview only, same as Phase 3) |
| Platform-reserved section keys | Never suppressed (validation already rejects as layout sections) |
| Unregistered / custom section keys | Never suppressed via `layoutEditorHidden` |
| Empty / unrenderable published doc | `resolveEffectiveProductionLayoutDoc` → `buildLeadDrawerDefaultDoc()` (unchanged) |

### Composition alignment

Existing zone mapping unchanged:

- **summary_strip** — `splitDrawerLayoutDocShellZones` + `LayoutRuntimePlanView` with `sectionPresentation: summary_strip`
- **main** — `LeadOverviewRuntimeComposition` household + enrollment slots (now visibility-gated)
- **right_rail** — `resolveLeadOverviewRightRailSections` (visibility ctx passed through)

---

## Files changed

| File | Change |
|------|--------|
| `web/lib/layout/runtime/opportunityDrawerEntityLayoutVisibility.ts` | Pure adoption helpers |
| `web/lib/layout/runtime/resolveLayoutRuntimeSectionVisibility.ts` | Early `layoutEditorHidden` check |
| `web/lib/layout/featureFlag.ts` | Phase 4 adoption gate |
| `web/lib/layout/runtime/resolveLeadOverviewRightRailSections.ts` | Visibility ctx parameter |
| `web/components/layout/LeadOverviewRuntimeComposition.tsx` | Household/enrollment visibility + ctx |
| `web/components/layout/LayoutRuntimePlanView.tsx` | Unified section visibility ctx |
| `web/components/adminV2/settings/LegacyWorkflowV1LayoutEditorBanner.tsx` | Legacy editor warning |
| `web/components/adminV2/settings/OpportunityWorkflowV1SectionsEditor.tsx` | Banner |
| `web/components/adminV2/settings/OpportunityWorkflowV1DrawerOrderEditor.tsx` | Banner |
| `web/tests/layout/opportunityDrawerEntityLayoutVisibility.test.ts` | Phase 4 tests |
| `docs/platform/modules/configuration-platform.md` | Canonical storage doctrine |

---

## Tests

```bash
cd web && npm run test -- \
  tests/layout/opportunityDrawerEntityLayoutVisibility.test.ts \
  tests/layout/opportunityDrawerLayoutVisualEditor.test.ts \
  tests/layout/resolveEffectiveProductionLayoutDoc.test.ts \
  tests/layout/leadDrawerPatch16.test.tsx
```

---

## Remaining dual-write risks

| Legacy write path | Table / API | Conflicts with entity_layouts |
|-------------------|-------------|-------------------------------|
| `recordDrawerLayoutPersist.ts` | `record_drawer_layouts` | Section order / `overview_hidden_sections` vs `layoutEditorHidden` + section order in LayoutDoc |
| `opportunity-workflow-v1-sections` PATCH | same | Show/hide + titles |
| `opportunity-workflow-v1-order` PATCH | same | Section order |
| `opportunity-workflow-v1-field-placements` PATCH | same | Field required/editable (orthogonal to composition, but same config surface) |

VM workflow v1 overview path may still read `record_drawer_layouts` when layout runtime body flag is off.

**Mitigation (not Phase 4):** per-org migration script, legacy editors read-only, single settings entry point.

---

## Rollback

Set `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_ENTITY_LAYOUTS_VISUAL_CONFIG=0` (and public client mirror). `layoutEditorHidden` metadata remains in DB but is ignored at runtime.

---

## Suggested commit message

```
feat(layout): Phase 4 adopt layoutEditorHidden on opportunity drawer runtime

Honor entity_layouts section visibility metadata behind layout runtime gate;
warn legacy workflow v1 editors; document entity_layouts as canonical layout store.
```
