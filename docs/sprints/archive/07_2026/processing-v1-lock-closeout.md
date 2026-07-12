# Digital Mailroom V1 — Lock Closeout

**Date:** 2026-07-08  
**Branch:** `feat/processing-form-composer-v1` → `staging`  
**Product:** Digital Mailroom (Processing V1 UI)  
**Status:** **Locked** — approved visual direction; no shell redesigns

---

## What shipped

Digital Mailroom is a first-class AdminV2 modal product. Processing remains the engine; the operator sees **Digital Mailroom**.

| Layer | What |
|-------|------|
| **Modal shell** | `ProcessingModal` → `DigitalMailroomShell` (Communications-aligned BOS modal) |
| **Overview** | Import, resume work, Studio shortcuts, KPI strip, folder shortcuts |
| **Work → Queue** | Folder-aware queue + document review (PDF/regions + question resolution) |
| **Studio** | Forms asset library; Packets / Fields / Branding placeholders |
| **Builder** | Canvas-first form builder from Studio Forms (in-modal; no `/admin/forms` handoff) |

Pipeline: **Import form → Review questions → Generate native form → Studio Builder**

---

## Accepted visual structure (locked)

```
Digital Mailroom
Where operational work happens.
────────────────────────────────
Work | Studio                    ← AlloyModeSwitch (level 1)
────────────────────────────────
Overview | Queue                 ← CommsModalTabBar (Work mode)
Forms | Packets | Fields | Branding   ← CommsModalTabBar (Studio mode)
────────────────────────────────  ← border-b border-stone-200 (OperationalWorkspaceModeNav)
│ Queue │ Source document │ Review questions │
         ↑ border-r border-stone-200 (PosProcessingWorkspace)
```

**Navigation components (shared with Communications):**

- `OperationalWorkspaceModeNav` — two-level nav + horizontal divider under second-level tabs
- `AlloyModeSwitch` — Work | Studio
- `CommsModalTabBar` — Overview | Queue (Work) or Studio section tabs
- `OperationalModalHeader` — title, subtitle, Close

**Work review layout (document case):**

| Zone | ~Width | Component |
|------|--------|-----------|
| Queue | 22% | `ProcessingQueueList` in `ProcessingParentPanel` |
| Source document | 55% | `PosTemplateSetupColumn` / PDF or `PosPdfFieldMap` |
| Review questions | 23% | `ProcessingQuestionReviewList` |

**Colors:** Midnight Forge, Bend Pine, Stone, White only in shell chrome.

---

## Functionality preserved (do not regress)

- Import engine (PDF upload → processing case)
- Question detection and review (`questionResolutionModel`)
- PDF region mapping and manual mapping
- Generate native form (`form-draft` save/create)
- In-modal Studio Builder (canvas, sections, library, branding)
- Row composition, inline tokens, drag/drop in builder
- Folder rail (Incoming, category folders, Completed)
- Delete test upload / archive import
- Queue warm cache and selection

---

## Known gaps (next functionality sprints)

| Gap | Notes |
|-----|-------|
| OCR / scanned PDF | Text-only detection path today |
| AI-assisted extraction | Same review UX when added |
| Studio Packets / Fields / Branding | Placeholder tabs only |
| Runtime public submission polish | Engine exists; family UX out of scope |
| User-created folders | Defaults are seeds; persistence model TBD |
| Standalone `/admin/processing` page | Deep-link host only; modal is canonical UX |

---

## Runtime entry (proven)

```
Sidebar Processing → TopNavBar → ProcessingModal
  → DigitalMailroomShell
    → OperationalWorkspaceModeNav
    → PosProcessingWorkspace (Work / Queue)
    → PosTemplateSetupColumn (review)
```

Legacy / dead for modal path:

- `PosWorkspaceLayout.tsx` — unused
- `ProcessingKpiStrip.tsx`, `ProcessingDevCleanupHint.tsx` — unused
- `ProcessingQueueClient` — standalone `/admin/processing` deep links only

---

## Validation (lock commit)

```bash
cd web && npm run test -- \
  tests/forms/formRowComposition.test.ts \
  tests/forms/processingFormBranding.test.ts \
  tests/pos/questionResolutionModel.test.ts \
  tests/pos/formComposerV1.test.ts

cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --pretty false
```

Screenshots: `docs/sprints/07_2026/digital-mailroom-identity-screenshots/`

---

## Next-session handoff

**Do not redesign the shell.** Pick one functionality thread:

1. **OCR intake** — scanned PDF through existing review panels
2. **AI extraction** — smarter detection; same inspector
3. **Studio Packets** — replace placeholder tab
4. **Studio Fields / Branding** — config surfaces inside Studio
5. **Runtime forms** — submission → case linkage polish

Canonical docs: `docs/platform/modules/documents-and-forms.md`, `docs/sprints/07_2026/processing-v1-gpt-handoff.md`

Key files: `ProcessingModal.tsx`, `DigitalMailroomShell.tsx`, `PosProcessingWorkspace.tsx`, `PosTemplateSetupColumn.tsx`
