# Configuration Runtime Concept A — UI Implementation

**Status:** **Superseded** — see [configuration_runtime_processes_layouts_alignment.md](./configuration_runtime_processes_layouts_alignment.md)

Prior stage-level and partial process-level UI passes are **not** the target model. Await alignment approval before the Processes vertical slice.

---

## Problem (before)

Business Processes at `/settings/business-processes` still felt like legacy admin:

- Configuration workspace left sidebar stacked inside the page
- Process selection disappeared after opening a process
- Section labeled **Perspectives** with form-like editor
- Technical queue keys visible in primary UI
- Did not match approved Concept A mockups

**Before baseline:** [configuration-runtime-phase-2b/business-processes-stage-workspace.png](./configuration-runtime-phase-2b/business-processes-stage-workspace.png)

---

## What changed

| Area | Implementation |
|------|----------------|
| Navigation | Hide `SettingsWorkspaceNav` on Business Processes; process cards + stage pills are page navigation |
| Process hub | `LifecycleProcessCatalogCards` compact strip stays visible while configuring a process |
| Stage workspace | Universal Card grid (`LifecycleStageWorkspace`) — status, requirements, work views, presentation, operating plan, ready check |
| Work Views | UI copy renamed from Perspectives; `WorkViewOperationalLensCard` replaces form grid |
| Presentation | `LifecycleStagePresentationCard` — queue + focus panel previews, layout name, Change, Open in Layouts |
| Layout width | Removed `max-w-5xl` cap so BOS rail + content breathe |

Internal persistence remains `perspectives_v1` / `PerspectiveConfigV1` — UI only says **Work Views**.

---

## After screenshots

| File | Shows |
|------|-------|
| [concept-a-process-hub.png](./configuration-runtime-concept-a/concept-a-process-hub.png) | Process card hub (no settings sidebar) |
| [concept-a-stage-workspace.png](./configuration-runtime-concept-a/concept-a-stage-workspace.png) | Stage workspace card grid |
| [concept-a-work-view-card.png](./configuration-runtime-concept-a/concept-a-work-view-card.png) | Work View operational lens card |
| [concept-a-presentation-card.png](./configuration-runtime-concept-a/concept-a-presentation-card.png) | Presentation assignment card |
| [concept-a-full-page-bos-rail.png](./configuration-runtime-concept-a/concept-a-full-page-bos-rail.png) | Full page with BOS rail |

---

## Mockup alignment

| Mockup | Match | Notes |
|--------|-------|-------|
| Business Processes hub | **Mostly** | Process cards + stage pills; no inner settings nav |
| Stage workspace | **Mostly** | Universal Card grid; all six cards present (mockup hub shows subset) |
| Work View card | **Mostly** | Row-based lens card; work-included read-only (no editable filter rows yet) |
| Presentation card | **Mostly** | Dual previews + Change + Open in Layouts; no rich wireframe thumbnails yet |

---

## Remaining deviations

| Deviation | Why |
|-----------|-----|
| Work included filters read-only chips | `filters_v1` not in schema — editable “Show work when…” deferred |
| Presentation thumbnails are CSS wireframes | Live EB preview API not wired in settings tier |
| Process Actions still in collapsible section below stage | Process-level matrix not yet moved into Universal Card grid |
| BOS config intelligence | UX-5 — rail present, recommendations not built |
| Display order not editable inline | Uses synced lane order; numeric stepper deferred |
| Global Settings breadcrumb remains | Authenticated app chrome — not marketing; only inner config nav removed on BP |

---

## Validation

```bash
cd web && npm run test -- tests/adminV2/configurationRuntimeConceptA.test.ts
cd web && npx playwright test playwright/tests/configuration-runtime-concept-a-ui.spec.ts
```

Auth / app shell unchanged: `/settings` remains protected; no marketing chrome (`settings-app-shell.spec.ts`).

---

## Key files

- `WorkViewOperationalLensCard.tsx`
- `LifecycleStagePerspectivesEditor.tsx`
- `LifecycleStagePresentationCard.tsx`
- `LifecycleStageWorkspace.tsx`
- `LifecycleProcessCatalogCards.tsx` (compact strip)
- `LifecycleBuilderPrimary.tsx`
- `AdminV2SettingsClientProviders.tsx` (hide nav on BP)
- `businessProcessUiLabels.ts` (Work Views copy)
