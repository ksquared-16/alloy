# Visual Layout Configuration Builder — Phase 5.8 Report

**Date:** 2026-06-16  
**Scope:** Opportunity drawer editor/runtime parity hardening before Person/Child duplication.

---

## Summary

Phase 5.8 makes the Opportunity Drawer Layout Builder **trustworthy at publish time**: household/contact blocks render from LayoutDoc when visual config is active, child row template metadata drives enrollment presentation, and block registry templates declare runtime-effective vs preview-only behavior.

---

## Parity matrix

| Section key | Editor renderer | Runtime renderer | Parity | Known mismatch | Fix in 5.8? |
|---|---|---|---|---|---|
| `lead_summary` | `LayoutRuntimePlanView` (section slice) | `LayoutRuntimePlanView` via composition | **Aligned** | Summary widgets use operating-summary cards when composition hints on | No (intentional shell polish) |
| `household_contact` | `LayoutRuntimePlanView` + `honorLayoutDocBlocks` | `LayoutRuntimePlanView` when visual config on; legacy `DrawerHouseholdProfileSection` when off | **Aligned when published** | Legacy path still substitutes profile card when visual config disabled | **Yes** — runtime honors LayoutDoc when visual config / editor preview active |
| `children_enrollment` | `LayoutRuntimePlanView` + row template metadata | `LeadEnrollmentCardList` / `LayoutRuntimeEnrollmentGrid` with row template presentation | **Aligned when published** | `open_schedule` action not supported yet | **Yes** — avatar/status/meta/layout mode wired; unsupported actions labeled |
| `lead_source` | `LayoutRuntimePlanView` | `LayoutRuntimePlanView` | **Aligned** | Collapse-when-empty metadata | No |
| `notes_communication` | `LayoutRuntimePlanView` widget placeholders | Widget-owned (`LayoutRuntimeNotesCommunicationWidget`) | **Preview-only widgets** | Timeline field internals opaque | No (deferred) |
| `activity` | `LayoutRuntimePlanView` widget placeholders | Widget-owned (`LeadActivityPreview`) | **Preview-only widgets** | Activity field internals opaque | No (deferred) |
| Right rail (`notes_communication`, `activity`) | Same as above | Same as above | **Preview-only widgets** | Widget internals | No |
| Overflow sections | `LayoutRuntimePlanView` overflow stack | Overflow fallback in composition | **Aligned** | Rare custom sections | No |

---

## Workstream deliverables

### A — Editor/runtime parity audit
- Parity matrix above in this report
- Household substitution gated via `resolveLayoutEditorHouseholdRendering.ts`

### B — Household/profile substitution
- Runtime uses LayoutDoc rows when `opportunityEntityLayoutsVisualConfig` or `honorLayoutDocBlocks`
- Visual editor preview always sets `honorLayoutDocBlocks: true`
- Legacy `DrawerHouseholdProfileSection` remains when visual config is off

### C — Child row template runtime adoption
- `resolveLeadEnrollmentRowTemplatePresentation.ts` drives card list/grid choice
- `LeadEnrollmentCardList` respects avatar, status pill, secondary metadata, edit enrollment action
- `open_schedule` marked unsupported / coming later

### D — Block add/remove/reorder validity
- `runtimeEffective` flag on block templates
- Duplicate Primary Contact Card rejected via `validateOpportunityDrawerLayoutBlocks`
- Preview-only templates labeled in Add block menu

### E — Inline editing UX
- Field settings **Done** deselects field (no toggle-close)
- Add field selects target block context first

### F — Live preview accuracy
- Editor uses `leadOverviewVisualEditorCompositionHints()` for parity with published runtime
- Row template + display metadata update preview through shared runtime path

### G — Relationship role clarity
- Contact block settings explain role semantics via `contactRoleEditorDescription`
- Role change regenerates role-aware field refs

### H — Link behavior clarification
- Human labels + page vs drawer helper text in field settings

### I — Builder primitives extraction
- `web/lib/layout/layoutEditorPrimitives.ts` documents reusable vs opportunity-specific pieces

---

## Runtime-effective vs preview-only

| Template | Runtime-effective |
|---|---|
| Primary / Secondary / Emergency / Billing Contact Card | Yes |
| Household Card, Location Card | Yes |
| Child Row Template | Yes |
| Custom Contact Card | Preview only |
| Address Card | Preview only |
| Child Summary Card | Preview only |
| Notes / Activity / Communication widgets | Widget-owned (opaque V1) |

---

## Reusable for Person/Child

- `layoutEditorPrimitives.ts` exports
- Display config, visibility presets, inspect/trace patterns
- Block registry pattern (catalog + runtimeEffective + validation)

**Still opportunity-specific:** surface registry, field catalog, household substitution helper, enrollment row template resolver, OpportunityDrawerLayout* UI.

---

## Risks before Person/Child

1. Emergency/billing contact refKeys may not hydrate until platform manifest expands
2. Address card preview-only until address fields are manifest-backed
3. Widget blocks remain opaque — do not imply column-level timeline configurability
4. Legacy household profile path still active when visual config kill switch is off

---

## Tests

```bash
cd web && npm run test -- \
  tests/layout/opportunityDrawerLayoutPhase58.test.ts \
  tests/layout/opportunityDrawerLayoutPhase57.test.ts \
  tests/layout/opportunityDrawerLayoutPhase56.test.ts \
  tests/layout/opportunityDrawerEntityLayoutVisibility.test.ts
```

---

## Suggested commit message

```
feat(layout): Phase 5.8 opportunity drawer editor/runtime parity hardening

Honor LayoutDoc household blocks when visual config is active, wire child row
template metadata into enrollment rendering, and validate runtime-effective blocks.
```
