---
owner: runtime
status: frozen
last_reviewed: 2026-07-17
supersedes: []
---

# Configuration Ownership Doctrine

**Status:** Frozen — Configuration Runtime V1 + Organization Configuration Runtime V2.

## Frozen ownership model

| Surface | Owns | Does **not** own |
|---------|------|------------------|
| **Organization settings** | Domain registry, publisher/consumer model, inheritance, publication, distribution, and cross-location governance contracts | Domain payloads, Location-owned objects, duplicate domain editors |
| **Programs** | Reusable service catalog, categories, eligibility, licensing/resource requirements, commercial/funding/billing defaults, publication | Rooms/Delivery Resources, capacity, schedules, local operational truth |
| **Locations** | Campuses, Programs offered, Rooms/Delivery Resources, and local schedule templates | Program identity, process behavior, surface presentation |
| **Fields** | Canonical data definitions — types, labels, formats, validation | Drawer placement, stage requiredness, action behavior |
| **Statuses** | Status vocabulary — label, color, sort, active/inactive | Which stage a status rolls up into |
| **Action definitions** (internal catalog at `/settings/actions`) | Platform action metadata — key, description, parameters, default label | Operator configuration, placements, process enablement |
| **Processes** | Behavior — stages, Work Views, operating plan, process actions, requirements, attention | Action definition authoring, surface placement |
| **Surfaces** | Presentation — queue rows, Focus Panel modes, cards, field placement, action placement | Whether an action exists for a process/stage |
| **Access** (`/settings/users-roles`) | Users, roles, permissions, location/department scope | — |
| **Communications** | Channels, templates, send rules, quiet hours, signatures | — |
| **Operational Intelligence** | Metrics, targets, indicator placement | KPI strip geometry (runtime) |
| **Automation** | Workflow definitions and triggers | Process operating plan semantics |

**Actions is not an operator-facing configuration area.** Action definitions remain an internal/platform catalog at `/settings/actions`.

**Operator navigation does not include Action definitions.**

---

## Interaction pattern (frozen)

**Context → Queue → Workspace → BOS**

---

## Processes vs Surfaces vs Actions

### Processes decides behavior

- Should Schedule Tour exist for this process/stage?
- Primary / secondary / outcome actions
- Requirements, preflight, completion rules
- Attention rules
- Button labels at the process level

### Surfaces decides presentation

- Queue row placement
- Focus Panel header / card / overflow
- Which published surface documents an action appears on

Processes **must not** own global action definition authoring or default surface catalog management.

Route compatibility: product concept is **Surfaces**; legacy route `/settings/layouts` may remain until cutover.

---

## Status ownership

| Surface | Owns |
|---------|------|
| **Statuses** | Vocabulary only |
| **Processes → stage membership** | Stage assignment / rollups |

---

## Future changes

Configuration Runtime V1 is frozen. Future changes are limited to:

- Bug fixes
- Small visual polish
- Wiring Surfaces into the frozen shell

Organization Runtime V2 is the explicit doctrine update that adds the Organization landing and Programs operator language. Further IA changes require another doctrine update.

---

## Related docs

- `docs/system/configuration-mode-doctrine.md`
- `docs/system/configuration-runtime-v1.md`
- `docs/system/configuration-workspace-v1-doctrine.md`
- `docs/system/configuration-runtime-design-alignment.md`
