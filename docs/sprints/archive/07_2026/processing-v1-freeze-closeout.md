# Processing V1 — Freeze Closeout

**Date:** 2026-07-08  
**Branch:** `feat/processing-form-composer-v1` → `staging`  
**Product name:** Digital Mailroom  
**Status:** **Locked** — see `docs/sprints/archive/07_2026/processing-v1-lock-closeout.md` for final closeout.

---

## What shipped

Digital Mailroom is a first-class operator product inside AdminV2:

| Surface | Purpose |
|---------|---------|
| **Overview** | Import form, active work, form library; workspace KPI tiles; recent work/forms; folder shortcuts |
| **Work → Queue** | Folder-aware queue + document review (PDF hero + question resolution) |
| **Studio** | Forms asset library (Packets / Fields / Branding placeholders) |
| **Builder** | Canvas-first form builder opened from Studio; engine unchanged |

Processing APIs, case model, form-draft pipeline, and question resolution engine are unchanged from V1 composer work.

---

## Final visual freeze (2026-07-08)

1. **Shared navigation** — `OperationalWorkspaceModeNav` mirrors Communications exactly: Work | Studio, divider, Overview | Queue, divider, workspace execution surface. Sub-tab label **Queue** (top-level Work mode unchanged).
2. **Compact review header** — Stepper, metadata, and status collapsed into one ~28px row; PDF begins immediately below.
3. **Lightweight question rows** — Review questions use spacing and dividers instead of nested card borders; Bend Pine reserved for confidence only.
4. **Queue density** — Row height and typography reduced slightly for more visible rows; layout unchanged.
5. **Parent panel hierarchy** — Work review uses three explicit surfaces: Queue, Source document, Review questions (`ProcessingParentPanel`).
6. **KPI tiles** — Overview activity strip reuses `SurfaceHeaderKpiCard` from `WorkspaceHeader` (compact density).
7. **Dev UI removed** — Cleanup banner, build markers, version attributes, and development hints hidden from production shell.

---

## Layout contract (Work review)

| Zone | Approx. width | Component |
|------|---------------|-----------|
| Queue | 22% | `ProcessingQueueList` in `ProcessingParentPanel` |
| Source document | 55% | PDF / region map in `ProcessingParentPanel` |
| Review questions | 23% | `ProcessingQuestionReviewList` in `ProcessingParentPanel` |

---

## Validation

```bash
cd web && npm run verify:module-imports
cd web && npm run test -- \
  tests/pos/questionResolutionModel.test.ts \
  tests/pos/formComposerV1.test.ts \
  tests/forms/formRowComposition.test.ts \
  tests/forms/processingFormBranding.test.ts

cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

Screenshots: `docs/sprints/archive/07_2026/digital-mailroom-identity-screenshots/`

---

## Explicitly out of scope (future work inside shell)

- OCR / scanned PDF extraction
- AI-assisted extraction and BOS actions
- Packets, Fields, Branding Studio tabs (placeholders only)
- Runtime submission engine
- Family-facing experience
- Shell redesign

---

## Canonical docs updated

- `docs/platform/modules/documents-and-forms.md` — Digital Mailroom product model and freeze note
