# Processing Alloy UX Completion — Closeout

**Status:** Staging QA candidate  
**Branch:** `feat/processing-form-workflow-finish`  
**Base:** rebased onto latest `origin/staging` before promotion  
**Scope:** UX completion only — shell architecture unchanged

## What this release is

A scoped operator-experience pass for Processing native form authoring. No shell redesign, no identity resolution, no Field Platform changes.

## Operator-language contract

Operators see record-oriented language, not implementation terms:

| Before (engineering) | After (operator) |
|----------------------|------------------|
| Display as | Question label |
| Question type | Answer type |
| Destination | Store answer in |
| Destination field | Field |
| Processing only | Form field only |

Raw canonical references (`entity.field_key`) appear only under collapsed **Technical reference** in the builder inspector — never as primary UI.

## Alloy control treatment

Shared primitives in `ProcessingAlloyControls.tsx` style text, textarea, select, checkbox, radio, segment controls, and secondary buttons with Midnight Forge / Bend Pine / Stone workspace tokens. Scoped paths: builder question inspector, generate form name, review inspector, pending manual field editor.

Focus, disabled, selected, and required states remain readable. Native checkbox/radio inputs are visually hidden with accessible labels preserved.

## Inspector grammar

When a canvas question is selected, `ProcessingFormQuestionInspector.tsx` presents:

1. **Question** — context header (question name)
2. **Presentation** — question label, help text, required
3. **Answer** — answer type; Needs destination callout when applicable
4. **Store answer in** — record + field pickers via existing canonical field consumer (`processingFormBuilderLibrary` / registry)
5. **Layout** — width segments (Full / Half / Third / Quarter), section
6. **Publishing** — link to distribution panel

Canvas selection and inspector state stay synchronized via existing `selectedFieldId` wiring.

## Published-bar behavior

`ProcessingFormPublishedBar.tsx` appears after successful publish:

- Replaces the green **Publish** CTA when a published version exists
- **Copy link**, **Copy iframe**, **Open runtime**
- **Manage distribution** opens the distribution inspector section
- **Republish** remains secondary (toolbar + bar)
- **Return to forms** closes the builder intentionally
- Published state persists on reopen via existing `has_published_version` read model

## Row-grid behavior

`FormFieldLayoutWidth` extended to `full | half | third | quarter` on a 12-unit row grid:

| Width | Units |
|-------|-------|
| full | 12 |
| half | 6 |
| third | 4 |
| quarter | 3 |

Every row uses the same packing rules — not first-row special. Canvas, builder preview, and persisted `layout_width` share `groupFieldsIntoRows` / `fieldLayoutFlexClass`. Existing full/half forms remain backward compatible (unset width defaults to full).

## Auto-detect behavior

For `processingIntent === "generate_form"` with supported formats (PDF, DOCX, plain text):

- Skips manual “Detect questions” gate
- Shows detecting state until draft loads or error
- Single auto-detect attempt per case (ref guard)
- Failure exposes retry
- **Re-detect** remains in review toolbar
- Unsupported formats (e.g. images) show honest unsupported message — no fake detection

## Field Platform caveat

Destination mapping continues through the curated canonical field consumer (`PROCESSING_BUILDER_CANONICAL_FIELDS`, `processingReviewFieldCatalog`). This sprint does not expand the Field Platform or registry surface.

## Identity Resolution

Identity Resolution is the **next separate initiative** — not included in this branch.

## Known non-blocking follow-ups

1. **Branding inspector** — legacy collapsible + native color input
2. **Drag/drop slot defaults** — drops still default to half/full; smarter quarter/third inference deferred
3. **Import-modal final polish** — wording/control pass only where already touched; full visual pass deferred

## Files changed

| Area | Files |
|------|-------|
| Alloy controls | `web/app/adminV2/pos/ProcessingAlloyControls.tsx` |
| Builder inspector | `web/app/adminV2/pos/ProcessingFormQuestionInspector.tsx` |
| Published bar | `web/app/adminV2/pos/ProcessingFormPublishedBar.tsx` |
| Builder shell | `web/app/adminV2/pos/ProcessingFormBuilder.tsx` |
| Canvas | `web/app/adminV2/pos/ProcessingFormCanvas.tsx` |
| Review / Generate | `web/app/adminV2/pos/PosTemplateSetupColumn.tsx`, `ProcessingQuestionReviewList.tsx`, `PendingManualFieldEditor.tsx` |
| Library | `web/app/adminV2/pos/ProcessingFormBuilderLibraryPanel.tsx` |
| Layout engine | `web/lib/forms/formRowComposition.ts`, `web/lib/forms/schema.ts`, `web/lib/forms/useFormSchemaFieldAuthoring.ts`, `web/lib/pos/processingCase/formDraft/types.ts` |
| Tests | `web/tests/forms/formRowComposition.test.ts` |

## Validation

```bash
cd web
NODE_OPTIONS='--max-old-space-size=8192' npx tsc --noEmit
npm run verify:module-imports
npm run test -- tests/forms/formRowComposition.test.ts tests/pos/processingFormWorkflowFinish.test.ts
```

## Live QA checklist

- [ ] Import modal
- [ ] Automatic detection (supported generate-form)
- [ ] Review inspector (operator language + Alloy controls)
- [ ] Generate step (sticky footer, readable destinations)
- [ ] Direct form builder (inspector groups)
- [ ] Two-column layout on multiple rows
- [ ] Thirds and quarters on canvas + preview
- [ ] Published action bar (copy link/iframe, runtime, distribution)
- [ ] Distribution (all sites / selected sites)
- [ ] Public runtime
