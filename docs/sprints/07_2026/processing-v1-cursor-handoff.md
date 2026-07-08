# Cursor Handoff — Processing V1 (UI frozen)

**Use when continuing work in Cursor on Digital Mailroom.**

---

## State

Digital Mailroom V1 UI is **frozen** on `staging` as of 2026-07-08.

This is **productization complete** — not a design sprint. Do not invent new layouts, tabs, or shell concepts.

---

## Canonical entry points

| Surface | File |
|---------|------|
| Modal shell + nav | `web/app/adminV2/pos/DigitalMailroomShell.tsx` |
| Shared two-level nav | `web/app/adminV2/components/OperationalWorkspaceModeNav.tsx` |
| Overview | `web/app/adminV2/pos/ProcessingOverviewLanding.tsx` |
| Work queue + review | `web/app/adminV2/pos/PosProcessingWorkspace.tsx` |
| Document review | `web/app/adminV2/pos/PosTemplateSetupColumn.tsx` |
| Question inspector | `web/app/adminV2/pos/ProcessingQuestionReviewList.tsx` |
| Queue list | `web/app/adminV2/processing/ProcessingQueueList.tsx` |
| Studio | `web/app/adminV2/pos/ProcessingStudioShell.tsx` + asset library |

Communications reference: `web/app/adminV2/communications/CommunicationsWorkspaceShell.tsx`

---

## Visual contract

- **Nav:** Reuse `OperationalWorkspaceModeNav` + `CommsModalTabBar` + `AlloyModeSwitch` — do not approximate
- **Colors:** Midnight Forge (structure), Bend Pine (action/selection), Stone (background), White (surfaces)
- **Dividers:** Horizontal under nav levels; vertical between Queue and workspace; flat panels inside review (no nested card chrome)
- **Sub-tab label:** **Queue** (not Work). Top-level mode stays **Work**.

---

## Do not touch (unless sprint says otherwise)

Import engine · question detection · mappings · generation · form builder engine · drag/drop · inline tokens · branding logic · row composition · folder persistence · delete/archive APIs

---

## Safe UI-only edits

Spacing, typography, divider weight, icon contrast, card chrome — when matching Communications/Workspace tokens.

---

## Validation before merge

```bash
cd web && npm run verify:module-imports
cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
cd web && npm run test -- tests/pos/questionResolutionModel.test.ts tests/pos/formComposerV1.test.ts
```

Acceptance: Communications and Processing should read as the same designer.

---

## Next work (inside shell)

See `docs/sprints/07_2026/processing-v1-gpt-handoff.md` for OCR, AI extraction, Packets, runtime, BOS threads.
