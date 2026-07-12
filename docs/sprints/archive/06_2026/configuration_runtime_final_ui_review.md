# Configuration Runtime — Final Processes UI Review

**Date:** June 2026  
**Scope:** `/settings/processes` Configuration Mode layout  
**Doctrine:** `docs/system/configuration-mode-doctrine.md`

## Approved mockup reference

- `docs/sprints/archive/06_2026/configuration-runtime-bp-ux-redesign/mockup-business-processes-page.png`
- `docs/sprints/archive/06_2026/configuration-runtime-bp-ux-redesign/mockup-perspective-card.png`
- `docs/sprints/archive/06_2026/configuration-runtime-bp-ux-redesign/mockup-presentation-assignment.png`

## Configuration Mode pattern

| Region | `/settings/processes` |
| --- | --- |
| **Top — Configuration Context** | Process selector strip + create process |
| **Left — Configuration Queue** | Stages, Work Views, Actions, Automation, Health (no top-level Presentation) |
| **Center-left — list column** | Stage list or Work Views list when selected |
| **Center-right — Configuration Workspace** | Selected stage setup or Work View editor |
| **Right — BOS rail** | Existing BOS Assist (unchanged) |

## Visual doctrine (frozen)

**Do not use:** blue selected states, blue-gray admin cards, slate dashboards, gray-on-gray inactive UI, legacy admin table styling, arbitrary non-token greens.

**Use:** Alloy pine selected state (`rgba(0, 162, 131, 0.08)`), midnight/forge text, white cards, stone borders, pine icon tiles, runtime spacing.

Shared tokens: `process-config-*`, `config-runtime-*`, `config-mode-*` in `web/app/adminV2/settings/configurationRuntime.css`.

## Work View editor sections

Operators see · **Purpose** · Show work when… (typed controls including relative date: Next/Previous `[n]` days/weeks/months) · Sort · Presentation assignments (Queue + Focus Panel) · Visibility/order · Preview Runtime · Advanced (technical ids only).

## Screenshots (after)

Captured in `docs/sprints/archive/06_2026/configuration-runtime-final-ui/`:

1. `01-processes-full-page-with-bos.png` — full page with BOS rail
2. `02-stages-selected.png` — Stages queue + stage list + setup
3. `03-work-views-selected.png` — Work Views list column
4. `04-work-view-editor.png` — selected Work View setup card
5. `05-date-condition-options.png` — date preset dropdown
6. `06-relative-date-control.png` — Next/Previous relative date control
7. `07-status-condition-options.png` — status options dropdown
8. `08-presentation-assignment-cards.png` — queue / focus panel assignment (inside Work View)
9. `09-preview-runtime.png` — preview runtime navigation (when lane mapped)

Prior visual pass screenshots remain in `docs/sprints/archive/06_2026/configuration-runtime-visual-parity/` for comparison.

## Remaining deviations

- **Actions / Automation / Health** use nav + setup workspace but do not yet have dedicated list columns.
- **Drag reorder** on Work View list cards is visual affordance only (⠿ icon); order still edited via Display order field.
- **Layouts hub** (`/settings/layouts`) was not restructured in this pass — only Processes Configuration Mode layout.
- **Preview runtime** requires a mapped compatibility queue lane; screenshot 09 is conditional on environment data.
- **Stage-level presentation** remains inside stage setup cards — not a top-level queue item.

## Tests

- `web/tests/adminV2/configurationModeDoctrine.test.ts`
- `web/tests/adminV2/configurationRuntimeFinalUi.test.ts`
- `web/playwright/tests/configuration-runtime-final-ui.spec.ts`
