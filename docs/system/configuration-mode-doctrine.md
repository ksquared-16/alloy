# Configuration Mode Doctrine

**Status:** Frozen — June 2026

Configuration Mode is the operator-facing settings experience that mirrors Runtime layout without redesigning runtime primitives.

## Interaction pattern (frozen)

Every Configuration surface follows:

| Region | Role | Runtime analogue |
|--------|------|------------------|
| **Top** | Configuration Context | Process / work unit context |
| **Left** | Configuration Queue / options | Queue / perspective options |
| **Center** | Configuration Workspace | Focus Panel / setup surface |
| **Right** | Existing BOS Assist rail | BOS (unchanged) |

**First implementation:** `/settings/processes`  
**Pattern applies next to:** Layouts, Fields, Statuses, Analytics, Actions

### `/settings/processes` queue (left)

- Stages
- Work Views
- Actions
- Automation
- Health

**Presentation is not a top-level queue item.** Queue and Focus Panel layout assignment lives inside the selected **Work View** setup workspace (and stage-level presentation remains stage-scoped in Stages when needed).

---

## Visual doctrine — do NOT use

- Blue selected states
- Blue-gray admin cards
- Generic slate dashboards
- Gray-on-gray inactive UI
- Legacy admin table styling as primary layout
- Mockup greens that are not Alloy tokens
- `alloy-blue` accents on Configuration Runtime primary surfaces

## Visual doctrine — use

- **Bend Pine / Alloy pine** (`alloy-pine`, soft tint `rgba(0, 162, 131, 0.08)`)
- **Midnight / Forge** text (`alloy-midnight`, `alloy-forge`)
- White cards on settings canvas background
- Stone borders at low opacity (`alloy-forge/10`–`alloy-forge/14`)
- Soft pine selected state (left accent + pine tint background)
- Pine icon tiles
- Runtime-style spacing and hierarchy (`rounded-xl` / `rounded-2xl`, generous padding)

Shared CSS classes: `process-config-*`, `config-runtime-*` under `web/app/adminV2/settings/configurationRuntime.css`.

---

## Work View setup (required sections)

1. Operators see
2. Purpose
3. Show work when… (typed controls — never generic “Value” for known fields)
4. Date controls: Today, Tomorrow, This week, Next week, Next/Previous `[n]` days/weeks/months, Custom date
5. Status dropdown (configured statuses)
6. Location / current site
7. Sort
8. Presentation assignments (Queue layout, Focus Panel layout)
9. Visibility / order
10. Preview Runtime
11. Advanced · technical identity (collapsed; only place for raw ids)

---

## Explicitly forbidden routes

- `/settings/queue-builder`
- `/settings/focus-panel-builder`

Queue and Focus Panel presentation is authored in **Layouts / Experience Builder**; Processes and Work Views **assign** published layouts only.

---

## Related docs

- `configuration-runtime-design-alignment.md`
- `configuration-workspace-v1-doctrine.md`
- `configuration_runtime_final_ui_review.md`
- `docs/sprints/06_2026/configuration_runtime_business_processes_ux_redesign.md`
