# Configuration Runtime QA Fix 2 — Browser Style Audit

**Date:** June 26, 2026  
**Method:** Playwright computed-style inspection on live `/settings` and `/settings/processes` (Chromium 1440×960).  
**Screenshots:** `docs/sprints/06_2026/configuration-runtime-qa-fix-2/01–11`

## Visual spec (Alloy Configuration Mode)

| Role | Target |
|------|--------|
| Canvas | `#FFFFFF` |
| Cards | `#FFFFFF` |
| Selected soft background | `rgba(0, 162, 131, 0.08)` |
| Selected border / accent / check | `#00A283` / `rgb(0, 162, 131)` |
| Text | `alloy-midnight` / `alloy-forge` |
| Borders | `alloy-stone` / `alloy-forge` low opacity |
| No blue checkmarks | — |

---

## Computed-style results

### Configuration rail — selected item

| | |
|---|---|
| **Component** | `SidebarConfigurationModeNav.tsx` |
| **Element** | `[data-testid="config-mode-nav-processes"]` |
| **className** | `adminv2-sidebar-config-link adminv2-sidebar-config-link--active` (+ Lucide icon) |
| **Background** | `rgba(0, 162, 131, 0.14)` (inset highlight via box-shadow layer) |
| **Border** | none (rail uses inset shadow) |
| **Text** | `rgb(0, 162, 131)` — Bend Pine |
| **Accent** | n/a |
| **Match** | ✅ Bend Pine active state |

### Process card — selected

| | |
|---|---|
| **Component** | `BusinessProcessProcessSelectorStrip.tsx` / `LifecycleActivationBoard.tsx` |
| **Element** | `[data-testid="lifecycle-process-card-enrollment"]` |
| **className** | `process-config-work-view-list-card process-config-work-view-list-card--active` |
| **Background** | `rgba(0, 162, 131, 0.08)` |
| **Border** | pine-tinted via `--cr-pine-border` |
| **Text** | `rgb(26, 35, 50)` midnight |
| **Match** | ✅ |

### Stage list card — selected

| | |
|---|---|
| **Component** | `BusinessProcessStagesListColumn.tsx` |
| **Element** | `[data-testid^="business-process-stage-list-"]` |
| **className** | `process-config-work-view-list-card--active` when selected |
| **Background** | `rgba(0, 162, 131, 0.08)` when active |
| **Match** | ✅ |

### Work View list card — selected

| | |
|---|---|
| **Component** | `BusinessProcessWorkViewsListColumn.tsx` |
| **Element** | `[data-testid^="business-process-work-view-list-"]` |
| **className** | `process-config-work-view-list-card--active` |
| **Background** | `rgba(0, 162, 131, 0.08)` |
| **Match** | ✅ |

### Checkboxes (Actions workspace)

| | |
|---|---|
| **Component** | `BusinessProcessActionsQueueWorkspace.tsx` |
| **Element** | `[data-testid^="business-process-action-enabled-"]` |
| **className** | `config-mode-control h-4 w-4 rounded border-alloy-stone/40` |
| **accent-color (computed)** | `rgb(0, 162, 131)` via `configurationRuntime.css` |
| **Match** | ✅ No blue checkmarks |

### Primary buttons

| | |
|---|---|
| **Component** | `configurationRuntime.css` — `.config-runtime-btn-primary` |
| **Background** | `rgb(0, 162, 131)` |
| **Text** | white |
| **Match** | ✅ |

### Cards / panels

| | |
|---|---|
| **Component** | `.process-config-setup-card`, `.config-runtime-operational-card` |
| **Background** | `rgb(255, 255, 255)` |
| **Border** | stone/forge low-opacity mix |
| **Match** | ✅ White-on-white canvas |

### Empty workspace panels

| | |
|---|---|
| **Component** | Stage / Actions empty states |
| **Background** | white card on white shell |
| **Text** | `alloy-midnight/50` muted |
| **Match** | ✅ No gray dashboard shell |

---

## UX corrections verified

| Requirement | Status |
|-------------|--------|
| `/settings` hub tiles (9 surfaces) | ✅ `SettingsConfigurationHub.tsx` |
| Settings rail Lucide icons + Home | ✅ `SidebarConfigurationModeNav.tsx` |
| Ready Check removed from Stages | ✅ Playwright `getByText("Ready Check")` count 0 |
| Stages collapsed by default | ✅ Screenshot 03 |
| Operating plan work items collapsed | ✅ Screenshots 04–05 |
| Work Views condensed, presentation below sort | ✅ Screenshots 06, 09 |
| Multi-sort controls | ✅ Screenshot 08 |
| Relative date presets | ✅ Screenshot 07 |
| Actions queue/workspace (not matrix default) | ✅ Screenshot 10 |
| Full page with BOS | ✅ Screenshot 11 |

## Deferred

- **Operator filters** — Runtime filter chips for operators (`Operator filters` collapsed section) not implemented in this pass. Work View conditions cover authoring-time filters; runtime-adjustable filter chips remain a follow-up.

## CSS fixes applied (QA Fix 2)

- Global checkbox/radio `accent-color: rgb(0, 162, 131)` in `configurationRuntime.css` (explicit RGB for reliable computed-style match).
- Actions enabled checkbox uses `config-mode-control` (removed `accent-alloy-pine` Tailwind-only path).
- Playwright `colorClose()` accepts both `rgb(0, 162, 131)` and `#00a283`.

## Final follow-up (June 26, 2026)

### Perceived color fixes

| Source | Issue | Fix |
|--------|-------|-----|
| `.adminv2-sidebar-config-link--active` | Mint `#7ee8cc` text read as cyan/blue on dark rail | White text + pine `#00a283` icon on collapsed rail |
| `--cr-pine-soft` | `color-mix` could vary by browser | Explicit `rgba(0, 162, 131, 0.08)` |
| Settings canvas | Shell ambient could tint content | Force `#ffffff` on `.config-runtime-shell` |

### Work View editor

- Collapsible sections with localStorage persistence (`useWorkViewEditorSectionState`).
- **Default:** Basics open; conditions, sort, presentation, visibility, advanced collapsed.
- Sort summary when collapsed: `Updated · Newest first` (+N more when multi-sort).
- Direction labels: Newest first / Oldest first.

### Configuration Health

- Nav label: **Configuration Health**
- Queue shows single whole-process item (not stage list)
- Workspace copy clarifies process-level evaluation, not stage readiness

### Updated screenshots

- `06-work-views-collapsed-default.png`
- `07-work-view-conditions-expanded.png`
- `08-work-view-multi-sort.png`
- `09-work-view-presentation-selectors.png`
- `11-full-page-color-proof.png`
