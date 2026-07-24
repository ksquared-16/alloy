---
owner: engineering
status: active
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
phase: programs-locations-ia
---

# Programs & Locations Organization IA

## Decision

Programs and Locations are two perspectives on one operational system:

- **Programs** — what services the Organization provides (reusable definition)
- **Locations** — where and how those services are delivered

They share one Organization peer domain: **Programs & Locations**.

They are **not** merged into one collection/detail workspace.

## Organization landing peers

1. Programs & Locations → `/organization/programs-locations`
2. Financials
3. Access
4. Communications
5. Data Model
6. Business Processes
7. Surfaces
8. Automation
9. Operational Intelligence

Programs is **not** a standalone peer. Locations is **not** a standalone peer.

Financials consumes Programs (via Delivery Options → Tuition / fees). Financials does not own Programs.

## Landing

`/organization/programs-locations` introduces the relationship with two launch tiles:

| Tile | Href |
|------|------|
| Programs | `/organization/programs` (preserved) |
| Locations | `/organization/locations` (preserved) |

## Authority (unchanged)

| Concern | Owner |
|---------|--------|
| Program identity / Delivery Options / assignment | Organization Programs |
| Local offering, rooms, capacity, schedule, overrides | Location |

## Navigation / Continuity

- Config-mode Organization nav: **Programs & Locations**
- Breadcrumbs on Programs and Locations collections link back to the relationship landing
- Continuity warm set includes `/organization/programs-locations`

## Non-goals for this change

No Programs, Locations, Financials, or Tuition redesign. No authority changes. Local commits only.

## Superseding freeze

Full ownership / assignment / inheritance / override / execution contract:

`docs/audits/active/organization-configuration-relationship-model-2026-07.md`
