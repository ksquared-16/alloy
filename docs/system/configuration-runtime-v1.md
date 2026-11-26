---
owner: runtime
status: frozen
last_reviewed: 2026-07-16
supersedes: []
---

# Configuration Runtime V1

**Status:** Frozen — July 2026

Configuration Runtime V1 is **frozen**. All operator Configuration surfaces use a single shared shell and ownership model. **Locations is the reference implementation for Configuration Runtime V1.** Organization Configuration Runtime is the first post-freeze implementation consumer; it inherits this model rather than redesigning it.

Locations is feature-frozen after this closeout. Further Locations work is limited to bug fixes, security fixes, and corrections required to preserve the frozen contracts.

## Frozen interaction model

**Context → Queue → Workspace → BOS**

| Page | Route |
|------|-------|
| Settings index | `/settings` |
| Organization | `/organization` |
| Processes | `/settings/processes` |
| Statuses | `/settings/statuses` |
| Fields | `/settings/fields` |
| Access | `/settings/users-roles` |
| Communications | `/organization/communications` |
| Locations | `/settings/locations` |

Future surfaces (Surfaces, Operational Intelligence, Automation) inherit the same shell — no page-specific layout hacks.

Organization Configuration Runtime V2 owns the frozen publisher/consumer, domain-card, inheritance, publication, distribution, and cross-location governance contracts above Locations. See `organization-configuration-runtime-v2.md`.

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
| **Locations** | Campuses, Programs offered, Rooms/Delivery Resources, and local schedule templates |
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
- Wiring **Surfaces** into the frozen shell
- New configuration domains inheriting the Locations reference grammar

Not allowed without explicit doctrine update:

- Configuration IA changes
- New primary nav items duplicating ownership
- Per-page shell width overrides
- New Locations features or interaction patterns that bypass the reference workspace primitives

## Locations reference freeze

The frozen Locations surface includes:

- organization landing and first-class Location selector;
- object hero and owned-concern tabs;
- two-row Overview composition (operational glance + explained readiness; attention + owned capabilities);
- Program-offering, Room/Delivery Resource, and Schedule master/detail with distinct create, view, and edit modes;
- Tour Window create/edit, Placement Business Process + Stage ranking, and location Access editing;
- shell-owned contextual actions, BOS assistance through the same boundaries, and inline actions attached to their affected object;
- authoritative mutation confirmation plus local summary/readiness updates and hard-refresh persistence.

Canonical experience doctrine: `../platform/operator/configuration-workspace-platform-doctrine.md`.
Closeout evidence: `../sprints/completed/locations-config-runtime/`.

## Related docs

- `configuration-mode-doctrine.md`
- `configuration-ownership-doctrine.md`
- `configuration-workspace-v1-doctrine.md`

## Sprint artifacts

Screenshots: `docs/sprints/archive/06_2026/configuration-runtime-v1-final/`
