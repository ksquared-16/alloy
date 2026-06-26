# Configuration Runtime Sprint — Completion Report

**Branch:** `feat/configuration-runtime-phase-3`  
**Status:** Shipped (June 2026)  
**Canonical doctrine:** [`docs/system/configuration-mode-doctrine.md`](../../system/configuration-mode-doctrine.md)

---

## Objective

Deliver a **Configuration Mode** experience for `/settings/*` that mirrors Runtime interaction (Context → Queue → Workspace → BOS), replaces legacy blue/gray admin styling with Alloy white + Bend Pine, and makes `/settings/processes` the primary surface for stages, work views, actions, automation, and health — without starting a Layouts rebuild or backend-only features.

---

## What shipped

### 1. Configuration Mode shell

| Deliverable | Location |
|-------------|----------|
| Settings mode left rail (9 surfaces, Lucide icons) | `web/app/adminV2/components/SidebarConfigurationModeNav.tsx`, `web/lib/adminV2/configurationModeNav.ts` |
| Home + Settings icons always available in rail | `web/app/adminV2/components/Sidebar.tsx` |
| `/settings` configuration hub (9 tiles) | `web/app/adminV2/settings/SettingsConfigurationHub.tsx` |
| Shared CSS tokens (`config-runtime-*`, `process-config-*`) | `web/app/adminV2/settings/configurationRuntime.css` |
| Reusable shell (Context / Queue / Workspace) | `web/components/adminV2/settings/configurationRuntime/ConfigurationModeShell.tsx` |
| Frozen interaction + visual doctrine | `docs/system/configuration-mode-doctrine.md` |

### 2. `/settings/processes` — Business Process Configuration

| Region | Implementation |
|--------|----------------|
| **Context** | Process selector strip (chips ≤5, dropdown + search >5), Create Process, Process options menu |
| **Queue** | Grouped nav: Configure (Stages, Work Views) · Process (Actions, Automation) · Health |
| **List column** | Stage list, Work Views list, Actions list, Health list |
| **Workspace** | Stage setup, Work View editor, Actions setup, Automation shell, Health / Ready Check |

**Presentation is not a top-level queue item.** Queue and Focus Panel layout assignment lives inside the selected Work View editor.

### 3. Stages workspace (QA-final)

- Compact sticky header (stage name + Preview work unit + Save stage)
- Stacked collapsible cards: Status membership · Required information · Operating plan
- **Ready Check removed** from Stages (remains under Health)
- Operating plan: collapsible Work items (queue → workspace) and Attention (queue → workspace)
- Process-level actions moved out of stage workspace (Process options menu)

### 4. Work Views editor

- Two-column condensed layout (operators see / purpose / conditions / sort | visibility / order / presentation / preview)
- Typed filter controls via `WorkViewConditionValueControl` (date presets, relative Next/Previous n days/weeks/months, status, location, boolean)
- Compact presentation selectors (`LayoutAssignmentCard`: dropdown + Default/Published/Draft chip + Open in Layouts — no oversized thumbnails)
- Advanced technical identity collapsed in `<details>`

### 5. Actions workspace

- Queue list + setup workspace (replaces matrix table default)
- Bend Pine checkboxes and toggles
- Per-action help copy (what the action does / data captured)
- Premium card styling, not spreadsheet layout

### 6. Work Views runtime convergence (Phase 3)

- `work_views_v1` filter evaluation, runtime context resolution, layout assignment helpers
- Preview runtime link when compatibility queue lane is mapped
- API/layout runtime paths aligned for queue + focus panel layout pins

### 7. Visual system alignment

- White background, white cards, Bend Pine selected states
- No blue checkmarks, slate selected states, or gray active cards on Configuration surfaces
- Breadcrumb links use `alloy-pine` not `alloy-blue`

---

## Sprint phases (artifacts)

| Phase | Doc / folder | Screenshots |
|-------|--------------|-------------|
| Concept A freeze | `configuration_runtime_concept_a_freeze.md` | `configuration-runtime-concept-a/` |
| BP UX redesign mockups | `configuration_runtime_business_processes_ux_redesign.md` | `configuration-runtime-bp-ux-redesign/` |
| Phase 2A/2B design reviews | `configuration_runtime_phase_2a_design_review.md`, `phase_2b_*` | `configuration-runtime-phase-2a/`, `phase-2b/` |
| Phase 3A implementation | `configuration_runtime_phase_3a_implementation.md` | `configuration-runtime-phase-3a/` |
| Vertical slice | `configuration-runtime-vertical-slice/` | `01`–`08` PNGs |
| Core interaction | `configuration_runtime_core_interaction_doctrine.md` | `configuration-runtime-core-interaction/` |
| Final UI review | `configuration_runtime_final_ui_review.md` | `configuration-runtime-final-ui/` |
| Visual parity | — | `configuration-runtime-visual-parity/` |
| End-to-end | — | `configuration-runtime-end-to-end/` |
| **QA fix (final)** | this report §3–5 | `configuration-runtime-qa-fix/` |

---

## QA fix acceptance (final pass)

Captured in `docs/sprints/06_2026/configuration-runtime-qa-fix/`:

1. `01-settings-hub-tiles.png` — `/settings` hub with 9 config tiles  
2. `02-settings-rail-icons-home.png` — Settings rail with Lucide icons + Home  
3. `03-stages-workspace-clean.png` — compact Stages workspace  
4. `04-operating-plan-work-collapsed.png` — Work items section collapsed  
5. `05-operating-plan-work-expanded.png` — selected work item workspace  
6. `06-operating-plan-attention-collapsed.png` — Attention collapsed  
7. `07-operating-plan-attention-expanded.png` — selected attention rule workspace  
8. `08-work-views-condensed-editor.png` — two-column Work View editor  
9. `09-work-view-dynamic-date-controls.png` — relative date controls  
10. `10-work-view-presentation-selectors.png` — compact layout selectors  
11. `11-actions-premium-workspace.png` — Actions queue + workspace  
12. `12-full-page-with-bos-rail.png` — full page with BOS rail  

---

## Tests

| Suite | Path |
|-------|------|
| Configuration Mode doctrine | `web/tests/adminV2/configurationModeDoctrine.test.ts` |
| Concept A drift | `web/tests/adminV2/configurationRuntimeConceptA.test.ts` |
| Core interaction | `web/tests/adminV2/configurationRuntimeCoreInteraction.test.ts` |
| Final UI | `web/tests/adminV2/configurationRuntimeFinalUi.test.ts` |
| End-to-end drift | `web/tests/adminV2/configurationRuntimeEndToEnd.test.ts` |
| **QA fix** | `web/tests/adminV2/configurationRuntimeQaFix.test.ts` |
| Work view filters | `web/tests/lifecycle/workViewFilterValueControls.test.ts`, `evaluateWorkViewFiltersV1.test.ts` |
| Settings IA | `web/tests/adminV2/settingsIndexIaCleanup.test.ts` |

Playwright capture specs under `web/playwright/tests/configuration-runtime-*.spec.ts`.

Run focused drift suite:

```bash
cd web && npm run test -- \
  tests/adminV2/configurationModeDoctrine.test.ts \
  tests/adminV2/configurationRuntimeConceptA.test.ts \
  tests/adminV2/configurationRuntimeCoreInteraction.test.ts \
  tests/adminV2/configurationRuntimeFinalUi.test.ts \
  tests/adminV2/configurationRuntimeEndToEnd.test.ts \
  tests/adminV2/configurationRuntimeQaFix.test.ts \
  tests/adminV2/settingsIndexIaCleanup.test.ts
```

---

## Explicitly out of scope (unchanged)

- Layouts hub rebuild (`/settings/layouts` — assign-only from Processes for now)
- Operational Intelligence / Analytics hub rebuild
- Backend-only configuration APIs without UI
- AdminV2 runtime reveal gate changes (protected infrastructure)

---

## Follow-ups

1. Extend Configuration Mode shell to Layouts, Fields, Statuses when those hubs are rebuilt.
2. Drag reorder on Work View list (visual affordance exists; order still via Display order field).
3. Remember last `/settings` surface via `configurationModeLastSurface` (hub exists; deep-link memory optional polish).
4. Stage-level presentation cards remain stage-scoped — not promoted to top-level queue.

---

## Related platform docs updated

- `docs/system/configuration-mode-doctrine.md` — frozen visual + interaction rules  
- `docs/system/configuration-runtime-design-alignment.md` — alignment checklist  
- `docs/sprints/06_2026/configuration_runtime_core_interaction_doctrine.md` — core interaction (updated: `/settings` hub)  
- `docs/platform/operator/universal-card-system.md` — operational surface references where touched  
