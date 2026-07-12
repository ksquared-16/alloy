# BOS Identity System — Sprint 02 Migration Report

**Path:** `docs/sprints/archive/06_2026/bos_identity_system_sprint02_migration_report.md`  
**Status:** Complete (identity consolidation)  
**Date:** 2026-06-10  
**Depends on:** `docs/sprints/archive/06_2026/bos_identity_system_sprint01.md`

---

## Objective

Complete BOS identity migration — one visual language everywhere. No competing icons, no legacy motifs, no mixed identity systems.

**Core rule:** BOS identity = Alloy Mark + Horizon + Smoke + Cloud Workspace. Nothing else.

---

## 1. Replaced BOS Symbols

| Legacy symbol | Replacement | Files migrated |
|---------------|-------------|----------------|
| **BosGenieLampIcon** (genie lamp) | **BosMark** (Alloy brandmark, Bend Pine) | See table below |
| Custom BOS header copy/layout | **BosHeader** (`BOS` / `Operational Intelligence`) | Action workspace shells, Command Center rail, Comms modal, Forms review |
| Generic parse/analyze loading text | **BosWorkingState** + smoke | Paste canvas, intake panel, forms review |
| Plain BOS Assist button (no mark) | **BosMark** inline | Composer reply cluster |
| Modal panel chrome only | **BosWorkspaceShell** perimeter | Composer BOS enhance modal |
| Action workspace panel (no perimeter) | **bos-workspace-shell** atmosphere | Production `ActionWorkspaceBosShell` |

### BosGenieLampIcon → BosMark file list

| File | Change |
|------|--------|
| `web/app/adminV2/components/bos/BosGenieLampIcon.tsx` | Deprecated wrapper → renders `BosMark` |
| `web/app/adminV2/components/aiCommandSurface/bosRail/BosRailPresentation.tsx` | `BosHeader` + `BosMark` on starter cards |
| `web/components/admin/actions/ActionWorkspaceBosCloudShell.tsx` | `BosHeader` onDark |
| `web/components/admin/opportunity/actions/ActionIntakePastePanel.tsx` | `BosMark` + `BosWorkingState` when parsing |
| `web/components/layout/proofShell/ProofRecordModal.tsx` | `BosMark` on simulated CTA |
| `web/app/dev/action-workspace-v2-mockups/*` | `BosMark` |
| `web/app/dev/bos-identity-exploration/BosIdentityExplorationGallery.tsx` | `BosMark` |

**No Sparkles, Wand, Brain, or Magic icons** were found on production BOS surfaces (pre-existing tests already guard Action Workspace).

---

## 2. Entry Point Audit (Phase 2)

| Entry point | Mark | Header | Notes |
|-------------|------|--------|-------|
| Work with BOS (drawer) | ✅ `BosMark` | N/A (button) | `BosDrawerAssistCta` |
| Work with BOS (queue row) | ✅ `BosMark` | N/A | `QueueRowActionsMenu` |
| Analyze with BOS | ✅ `BosMark` | N/A | `ActionWorkspacePasteCanvas` |
| Parse with BOS | ✅ `BosMark` | N/A | `ActionIntakePastePanel` |
| BOS Assist (composer) | ✅ `BosMark` | ✅ `BosHeader` | Reply cluster + enhance modal |
| Command Center rail | ✅ `BosMark` | ✅ `BosHeader` | Starter suggestion cards |
| Operational proposal cards | ✅ `BosMark` | Eyebrow only | `OperationalProposalCardFrame` |
| Create Lead success | ✅ `BosMark` + horizon | N/A | `ActionWorkspaceSuccessState` |
| BOS suggestions banner | ✅ `BosMark` + horizon | Section title | `ActionWorkspaceBosBanner` |
| Proof shell demo | ✅ `BosMark` | N/A | Simulated only |

---

## 3. Header Audit (Phase 3)

All BOS experiences now use **`BosHeader`** with standardized copy (title overridable; subtitle defaults to *Operational Intelligence*):

| Surface | Implementation |
|---------|----------------|
| Action Workspace (production) | `ActionWorkspaceBosShell` → `BosHeader` onDark, title from `BOS_SHELL_TERRITORY_TITLE` |
| Action Workspace (cloud dev) | `ActionWorkspaceBosCloudShell` → `BosHeader` onDark |
| Command Center rail | `BosRailHeader` → `BosHeader` size sm |
| Communications V2 enhance | `ComposerBosEnhanceModal` → `BosHeader`, title "BOS Assist" |
| Forms packet review | `BosReviewSummaryPlaceholder` → `BosHeader` size sm |

**Removed:** Custom inline BOS title/subtitle blocks in the above files.

---

## 4. Workspace Audit (Phase 4)

| BOS environment | Shell treatment |
|-----------------|-----------------|
| **Action Workspace (Create Lead)** | `bos-workspace-shell` perimeter + atmosphere on panel (`ActionWorkspaceBosShell`) |
| **Communications V2 BOS enhance** | Full `BosWorkspaceShell` wrapper |
| **Cloud dev shell** | Existing `BosTerritoryShell` (dev-only); header migrated to `BosHeader` |
| **Identity gallery** | `BosWorkspaceShell` reference implementation |

**Not migrated (intentional):**

- `AdminV2WorkspaceBosModalShell` — drawer geometry frame for Inbox/My Tasks, not a BOS identity territory
- Future workflow builder / reporting — not built; use `BosWorkspaceShell` when added

---

## 5. Motion Audit (Phase 5)

### Smoke allowed (BOS actively thinking)

| Surface | State | Component |
|---------|-------|-----------|
| Create Lead paste analyze | analyzing | `BosWorkingState` in `ActionWorkspacePasteCanvas` |
| Intake paste parse | parsing | `BosWorkingState` in `ActionIntakePastePanel` |
| Forms review summary load | preparing | `BosWorkingState` in `BosReviewSummaryPlaceholder` |

Smoke is **only** rendered via `BosWorkingState` → `BosSmoke`. No direct `BosSmoke` imports outside identity primitives.

### Documented non-violations (no smoke)

| Surface | Loader | Rationale |
|---------|--------|-----------|
| Route / drawer prep | `BosExecutionLoader` (neural pulse) | Operational data prep, not BOS thinking narrative |
| Action execute steps | `BosExecutionLoader` (phased assembly) | Execution assembly, not smoke motion |
| Drawer opening overlay | `BosExecutionLoader` drawer variant | Record navigation, not BOS thinking |
| Button busy (`Saving…`, `Sending…`) | Text / disabled state | Micro-loader exclusion per doctrine |

### Violations found and fixed

- None remaining in production paths after Sprint 02.

---

## 6. Alloy Mark Verification (Phase 6)

- **Source of truth:** `web/public/brand/alloy-brandmark-blue.svg`
- **Implementation:** `ALLOY_BRANDMARK_PATHS` in `web/lib/bos/bosIdentityTokens.ts` — all 5 paths copied verbatim
- **Test:** `tests/bos/bosIdentitySystem.test.ts` asserts each path exists in official SVG
- **Rules enforced:** Single-color pine fill at render; no gradient; no geometry edits; sizing via `sm` / `md` / `lg` only
- **Horizon:** Separate `BosHorizon` component — never merged into mark SVG

---

## 7. Remaining BOS Surfaces (not identity-heavy)

These surfaces expose BOS **functionality** without requiring mark/header/shell migration:

| Surface | Status |
|---------|--------|
| `OperationalReviewAssistBand` | Recommendation copy only; CTA lives in drawer header (`BosDrawerAssistCta`) |
| `PersonDrawerParentSummaryBosPanel` | Completion guardrails; calm text, no icon |
| `PersonDrawerChildSummaryBosPanel` | Same |
| `AdminV2WorkspaceBosModalShell` | Geometry shell for inbox/tasks |
| `AICommandSurfaceShell` | Full command surface; rail uses identity primitives |
| Agent Lab / workflow assist proposal frames | Uses `OperationalProposalCardFrame` (mark on eyebrow) |

---

## 8. Screenshots

**Gallery:** `http://localhost:3000/dev/bos-identity-system`

```bash
cd web && npm run screenshots:bos-identity-system
```

**Output:** `docs/sprints/archive/06_2026/assets/bos-identity-system/`

| File | State |
|------|-------|
| `mark.png` | BosMark sizes + horizon |
| `horizon.png` | Horizon sizes |
| `smoke.png` | thinking / converging |
| `working.png` | BosWorkingState examples |
| `button.png` | BosButton variants |
| `header.png` | BosHeader light / onDark |
| `notification.png` | BosNotification |
| `shell.png` | BosWorkspaceShell |
| `gallery-full.png` | Full page |

---

## 9. Doctrine Compliance Summary

| Rule | Status |
|------|--------|
| BOS belongs to Alloy (Alloy mark, not alternate logo) | ✅ |
| Horizon is BOS-only, not part of Alloy logo | ✅ |
| No genie lamp / sparkle / AI clip art on production BOS surfaces | ✅ |
| Single header copy pattern via `BosHeader` | ✅ |
| Smoke only when BOS is thinking | ✅ |
| No smoke on navigation / route / drawer open | ✅ |
| Cloud workspace perimeter on BOS environments | ✅ (Action Workspace + Comms modal) |
| No new functionality | ✅ |
| Identical Alloy mark geometry | ✅ (verified by test) |

---

## Tests

```bash
cd web && npm run test -- tests/bos/bosIdentitySystem.test.ts
cd web && npm run test -- tests/admin/actions/actionWorkspaceFoundation.test.ts
cd web && npx tsc --noEmit
```

---

## Suggested commit message

```
Complete BOS identity migration (Sprint 02): retire genie lamp, standardize BosMark/BosHeader/BosWorkspaceShell across all BOS surfaces.
```
