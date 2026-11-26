# Visual Layout Configuration Builder — Phase 5.14B Report

**Sprint:** 5.14B — Final Builder MVP Blocker Pass + Pre-Go-Live Certification  
**Surface:** Opportunity Drawer only  
**Baseline:** Phase 5.14A (section rows, widget/related-list sections, inline editing)

## Summary

Phase 5.14B closes the remaining MVP blockers for the Opportunity Drawer Layout Builder: contact/household related-list runtime, platform slot clarity, starter templates, publish guards for preview-only items, widget tone metadata, empty-state hardening, and certification layout tests.

## Workstreams

| Workstream | Decision / outcome |
|------------|-------------------|
| A — Related list runtime | **Contacts** and **household_members** are runtime-supported via `readLayoutRuntimeContactRepeaterRows` + `LeadContactRepeaterCardList`. Opportunities remain preview-only. |
| B — Fixed slot parity | **Option B:** `household_contact` and `children_enrollment` stay in the 4/5/3 grid. Builder shows “Platform composition slot” badge; delete blocked with clear copy. |
| C — Starter templates | Eight starters added in builder sidebar (`layoutEditorOpportunityDrawerStarterTemplates.ts`). |
| D — Action runtime | **Option B:** Publish guard blocks layouts containing preview-only action buttons or preview-only block templates. |
| E — Widget style | `layoutEditorWidgetStyle` metadata (tone + description); builder controls + runtime accent on widgets. |
| F — Empty states | Contact/children related lists use `DrawerOverviewEmptyState` with intentional copy. |
| G — Publish hardening | Publish guards integrated into `validateOpportunityDrawerLayoutDoc`. |
| H — Certification | Five certification layout fixtures tested in `opportunityDrawerLayoutPhase514b.test.ts`. |

## Files changed

### Runtime / model
- `web/lib/layout/runtime/mapLayoutRuntimeContactRepeaterRows.ts` *(new)*
- `web/lib/layout/runtime/readLayoutRuntimeRepeaterRows.ts`
- `web/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue.ts`
- `web/lib/layout/layoutEditorRelatedListConfig.ts`
- `web/lib/layout/layoutEditorPublishGuards.ts` *(new)*
- `web/lib/layout/layoutEditorWidgetStyle.ts` *(new)*
- `web/lib/layout/layoutEditorOpportunityDrawerStarterTemplates.ts` *(new)*
- `web/lib/layout/layoutEditorSectionLayout.ts`
- `web/lib/layout/opportunityDrawerLayoutEditorModel.ts`
- `web/lib/layout/platformFieldResolutionManifest.ts`
- `web/lib/layout/surfaceLayoutRegistry.ts`
- `web/lib/layout/validateLayoutDocForSurface.ts`

### UI
- `web/components/layout/lead/LeadContactRepeaterCardList.tsx` *(new)*
- `web/components/layout/LayoutRuntimePlanView.tsx`
- `web/components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx`
- `web/components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx`
- `web/components/adminV2/settings/OpportunityDrawerLayoutSectionRowEditor.tsx`

### Tests
- `web/tests/layout/opportunityDrawerLayoutPhase514b.test.ts` *(new)*

## Blockers resolved

1. Contacts / household members related lists render at runtime (not preview-only).
2. Fixed shell slots are clearly labeled; operators cannot delete primary composition slots.
3. Starter templates cover common production patterns.
4. Preview-only action buttons cannot be published.
5. Widget sections support tone/description metadata aligned with drawer visual language.

## Remaining non-MVP follow-ups

1. **Opportunities related list** — entity type stored but not runtime-backed.
2. **Layout action button live wiring** — publish blocked until handler dispatch ships (row-template actions already work).
3. **Preview-only block templates** (`address_card`, `child_summary_card`) — publish blocked; runtime implementation optional.
4. **Replacing 4/5/3 household/enrollment slots with row groups** — deferred; would require shell composition refactor.

## Production readiness assessment

**YELLOW**

The builder is MVP-complete for opportunity drawer layout authoring: operators can build, validate, save, and publish production-quality layouts using supported primitives. Remaining yellow items are narrow (opportunities entity, action button live dispatch, optional block templates) and do not block cloning the current production drawer through starters + section composition.

Recommended staging QA: run certification layouts A–E manually through save → publish → refresh → reopen → rollback.

## Suggested commit message

```
feat(layout): complete opportunity drawer builder MVP blocker pass
```
