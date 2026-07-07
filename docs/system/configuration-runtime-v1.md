# Configuration Runtime V1

**Status:** Frozen — June 2026

Configuration Runtime V1 is **frozen**. All operator Configuration surfaces use a single shared shell and ownership model. The next sprint begins **Surfaces** (presentation authoring; route compatibility may remain `/settings/layouts`).

## Frozen interaction model

**Context → Queue → Workspace → BOS**

| Page | Route |
|------|-------|
| Settings index | `/settings` |
| Processes | `/settings/processes` |
| Statuses | `/settings/statuses` |
| Fields | `/settings/fields` |
| Access | `/settings/users-roles` |
| Communications | `/settings/communications` |
| Locations | `/settings/locations` |

Future surfaces (Surfaces, Operational Intelligence, Automation) inherit the same shell — no page-specific layout hacks.

## Shell geometry (frozen)

Defined in `web/app/adminV2/settings/configurationRuntime.css` and `ConfigurationModeLayout.tsx`:

| Region | Width |
|--------|-------|
| App rail | 64px (existing AdminV2 shell) |
| Section Queue | **260px** fixed |
| Object Queue | **320px** fixed |
| Workspace | **flex** (`min-width: 0`, fills remainder — ~950px on 1920-wide displays) |
| BOS | unchanged |

CSS variables: `--config-section-queue-width: 260px`, `--config-object-queue-width: 320px`.

## Settings index (frozen)

The `/settings` landing uses a **compact context row** only:

- Title: **Settings**
- Subtitle: *Configure Alloy by area.*
- No bordered hero card; tiles begin ~24px below the context row

## Frozen ownership

| Surface | Owns |
|---------|------|
| **Locations** | Campuses, programs, rooms, and schedule templates |
| **Fields** | Canonical data definitions |
| **Statuses** | Status vocabulary |
| **Processes** | Behavior — stages, Work Views (including catch-all views with empty `filters_v1`), operating plan, process actions |
| **Surfaces** | Presentation — queue rows, Focus Panel modes, cards, field placement, action placement |
| **Access** | Users, roles, permissions, location/department scope |
| **Communications** | Channels, templates, send rules, quiet hours, signatures |
| **Operational Intelligence** | Metrics, targets, indicator placement |
| **Automation** | Workflow definitions and triggers |
| **Action definitions** (internal `/settings/actions`) | Platform catalog only — not operator-facing configuration |

See `configuration-ownership-doctrine.md` for the full matrix.

### Work View catch-all (`filters_v1: []`)

A process-wide **All work in this process** Work View is stored with **empty `filters_v1`**. The builder exposes this as an explicit scope mode; runtime treats empty filters as include-all over the work unit all-records base (no grouped views, no extra schema). Mixed-grain validation applies only when the operator scopes a view to incompatible stages — not for catch-all views.

## What changes after V1

Allowed:

- Bug fixes on V1 surfaces
- Small visual polish
- Wiring **Surfaces** into the frozen shell

Not allowed without explicit doctrine update:

- Configuration IA changes
- New primary nav items duplicating ownership
- Per-page shell width overrides

## Related docs

- `configuration-mode-doctrine.md`
- `configuration-ownership-doctrine.md`
- `configuration-workspace-v1-doctrine.md`

## Sprint artifacts

Screenshots: `docs/sprints/06_2026/configuration-runtime-v1-final/`
