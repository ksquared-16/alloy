# Configuration Runtime — Core Interaction Doctrine

**Status:** Frozen — June 2026  
**Scope:** Configuration Mode interaction model for `/settings/*`

## Pattern (frozen)

Every Configuration surface follows:

```
Configuration Context → Configuration Queue → Configuration Workspace → BOS rail
```

Runtime already uses **Context → Queue → Workspace → BOS**. Configuration must mirror it — not dashboard-style admin pages.

## Settings mode navigation

When the operator enters `/settings/*`, the **left app rail** switches to Configuration Mode.

- Settings icon remains the global bottom entry point.
- Inside Settings Mode, the left rail shows:
  - Processes
  - Layouts
  - Fields
  - Statuses
  - Actions
  - Automation
  - Operational Intelligence
  - Integrations
  - Security / Roles
- **No duplicate settings sidebar** inside page content (`SettingsWorkspaceNav` removed).

## `/settings` landing

`/settings` renders a **configuration hub** with tiles for all nine Configuration Mode surfaces (Processes, Layouts, Fields, Statuses, Actions, Automation, Operational Intelligence, Integrations, Security / Roles). It is not a blank redirect-only page. Last-surface memory via localStorage may still apply on deep navigation; the hub remains the canonical entry when visiting `/settings` directly.

## `/settings/processes`

### Top — Configuration Context

- Title: **Processes**
- Process selector (chips when ≤5, searchable dropdown when >5)
- **Create Process**

Auto-opens the first/default process when the catalog loads.

### Left — Configuration Queue (~240–280px)

Grouped queue:

| Group | Items |
|-------|--------|
| **Configure** | Stages, Work Views |
| **Process** | Actions, Automation |
| **Health** | Health |

**Presentation is not a top-level queue item.** Queue and Focus Panel layout assignment lives inside the selected **Work View** setup.

Selected state: soft Bend Pine background, pine left accent, pine icon, Midnight text. **No blue, slate, or gray active states.**

### Center — list column + workspace

- **Stages:** stage list + selected stage setup (compact card tabs — not a long form stack)
- **Work Views:** Work View list + selected Work View setup (two-column editor where appropriate)
- **Actions:** action list + selected action workspace (not an Excel matrix)
- **Automation:** shell + honest empty state
- **Health:** stage health list + selected stage ready check

### Operating Plan (inside stage setup)

Work items use **queue → workspace**:

- Left: work item list (Review Lead, Contact Family, …)
- Workspace: Purpose, required/optional, due timing, completion policy, outcomes, automation, attention rules

### Work View setup

- Operators see, Purpose, Show work when… (typed controls), Sort
- Side column: Presentation assignments, Visibility, Preview Runtime
- Advanced · technical identity (collapsed)

### Right — BOS rail

Existing BOS Assist rail — **unchanged**.

## Visual doctrine

**Use:** Alloy pine, midnight/forge, white cards, stone borders, soft pine selected states.

**Do not use:** blue selected states, slate dashboards, gray-on-gray inactive UI, legacy admin table styling, arbitrary generated greens.

Shared tokens: `process-config-*`, `config-runtime-*`, `config-mode-*` in `web/app/adminV2/settings/configurationRuntime.css`.

## Reuse for Layouts (next)

`ConfigurationModeShell` wraps Queue → list column → workspace. Layouts will follow the same shell:

```
Context → Layout queue → Layout workspace → BOS
```

Do not hardcode the pattern only for Processes.

## Related docs

- `docs/system/configuration-mode-doctrine.md`
- `docs/sprints/06_2026/configuration_runtime_final_ui_review.md`

## Screenshots

Captured in `docs/sprints/06_2026/configuration-runtime-core-interaction/` after Playwright pass.
