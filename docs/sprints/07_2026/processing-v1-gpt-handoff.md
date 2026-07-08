# GPT Handoff — Processing V2+ (post-freeze)

**Paste this into a new ChatGPT / Cursor thread when continuing Processing work.**

---

## Context

Alloy **Digital Mailroom** (Processing V1) shipped and is **frozen** as of 2026-07-08 on `staging`.

- **Product:** Digital Mailroom — “Where operational work happens.”
- **Modes:** Work (Overview | Work) and Studio (Forms | Packets | Fields | Branding)
- **Pipeline:** Import form → Review questions → Generate native form → Studio Builder
- **Rule:** Do **not** redesign the shell. Future work goes **inside** the shell.

Canonical docs:

- `docs/platform/modules/documents-and-forms.md`
- `docs/sprints/07_2026/processing-v1-freeze-closeout.md`
- `docs/sprints/07_2026/processing-v1-implementation-handoff.md`

Screenshots: `docs/sprints/07_2026/digital-mailroom-identity-screenshots/`

---

## Frozen shell layout

**Work review (document case):**

- **Queue** (~22%) — `ProcessingParentPanel` + `ProcessingQueueList`
- **Source document** (~55%) — PDF / region map
- **Review questions** (~23%) — grouped question cards

**Overview:** action cards + compact workspace KPI tiles (`SurfaceHeaderKpiCard`) + folder shortcuts with icons.

**Colors:** Midnight Forge, Bend Pine, Stone, White only.

---

## What NOT to do

- No shell redesign, no new top-level tabs, no duplicate heroes
- No API / engine / workflow changes unless the sprint explicitly says so
- No amber/emerald/legacy gray palette in Processing UI
- No dev banners, build markers, or cleanup hints in production surfaces

---

## Suggested next threads

Pick **one** per thread:

| Thread | Goal |
|--------|------|
| **OCR intake** | Scanned PDF path through existing Work review panels |
| **AI extraction** | Smarter question detection; same review UX |
| **Studio Packets** | Replace placeholder tab with packet library |
| **Studio Fields / Branding** | Config-only tabs inside Studio |
| **Runtime submission** | Public form submit → processing case linkage |
| **Family experience** | Parent-facing form completion (outside AdminV2 modal) |
| **BOS in Work** | Summarize queue / draft follow-ups via Actions rail |

---

## Key files (quick reference)

```
web/app/adminV2/processing/ProcessingModal.tsx
web/app/adminV2/pos/DigitalMailroomShell.tsx
web/app/adminV2/pos/PosProcessingWorkspace.tsx
web/app/adminV2/pos/PosTemplateSetupColumn.tsx
web/app/adminV2/pos/ProcessingQuestionReviewList.tsx
web/app/adminV2/processing/ProcessingQueueList.tsx
web/app/adminV2/pos/ProcessingOverviewLanding.tsx
web/app/adminV2/pos/ProcessingFormBuilder.tsx
web/lib/pos/processingCase/formDraft/questionResolutionModel.ts
```

---

## Validation commands

```bash
cd web && npm run test -- tests/pos/questionResolutionModel.test.ts tests/pos/formComposerV1.test.ts
cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

Repo: `/Users/Kelly/Alloy` — branch `staging` after merge.
