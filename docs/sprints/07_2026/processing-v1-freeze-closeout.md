# Processing V1 — Freeze Closeout

**Date:** 2026-07-08  
**Branch merged:** `feat/processing-form-composer-v1` → `staging`  
**Product name:** Digital Mailroom  
**Status:** **Frozen** — shell is canonical; no further shell redesigns unless a functional gap is discovered during real operator use.

---

## What shipped

Digital Mailroom is a first-class operator product inside AdminV2:

| Surface | Purpose |
|---------|---------|
| **Overview** | Import form, active work, form library; workspace KPI tiles; recent work/forms; folder shortcuts |
| **Work** | Folder-aware queue + document review (PDF hero + question resolution) |
| **Studio** | Forms asset library (Packets / Fields / Branding placeholders) |
| **Builder** | Canvas-first form builder opened from Studio; engine unchanged |

Processing APIs, case model, form-draft pipeline, and question resolution engine are unchanged from V1 composer work.

---

## Final polish (this sprint)

1. **Parent panel hierarchy** — Work review uses three explicit surfaces: Queue, Source document, Review questions (`ProcessingParentPanel`).
2. **KPI tiles** — Overview activity strip reuses `SurfaceHeaderKpiCard` from `WorkspaceHeader` (compact density).
3. **Color audit** — Processing shell standardized on Midnight Forge, Bend Pine, Stone, White.
4. **Queue density** — Outlook-style rows; reduced typography and row height.
5. **Review inspector** — Each detected question reads as one grouped unit with subtle borders.
6. **Folder icons** — System folders use `ProcessingFolderIcon` in Work, Studio, and Overview.
7. **Dev UI removed** — Cleanup banner, build markers, and development hints hidden from production shell.

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
cd web && npm run test -- \
  tests/pos/questionResolutionModel.test.ts \
  tests/pos/formComposerV1.test.ts \
  tests/forms/formRowComposition.test.ts \
  tests/forms/processingFormBranding.test.ts

cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

Screenshots: `docs/sprints/07_2026/digital-mailroom-identity-screenshots/`

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
