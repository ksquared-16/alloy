---
owner: engineering
status: in-progress
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
phase: scope-inheritance-landing-convergence
---

# Organization Scope, Inheritance, and Landing Convergence

## Phase 0 — preserved

- Programs removed from `/organization` peer landing (`9c160f04c`)
- Financials landing at `/organization/financials` (`56b748463`)
- `/organization/programs` compatibility retained via `PROGRAMS_CONFIGURATION_DOMAIN`
- Slice 1 IA correction remains intact; this sprint continues without redoing IA

## Phase 1 — authority snapshot (code-evident)

### Programs

| Layer | Authority | Storage / API |
|-------|-----------|---------------|
| Organization definition | `public.programs` + drafts/revisions | `POST /api/admin/configuration/programs` `create_draft` / `update_draft` / `validate_draft` / `publish` |
| Location assignment | Distribution → LPC row | `assign` / `preview` on same route; writes `location_program_categories` with `program_id` + `program_revision_id` |
| Location override | Coarse offering fields only | PATCH `/api/admin/location-program-categories`: `is_active`, `metadata`, `local_description_override`, `local_authorization_evidence`. **Label blocked** when `program_revision_id` set (409) |

**Override granularity:** offering/availability + local description/evidence — **not** full field-level Program inheritance.

### Tuition

| Layer | Authority |
|-------|-----------|
| Org default | `commercial_tuition_rates.location_id` null |
| Location override | non-null `location_id`; clear restores inherit |
| UI | Organization default / Inherited / Location override vocabulary aligned under Financials Continuity |

## Implemented in this sprint

### Program assignment / create (Phases 2–3)

- Location → Programs → Add Program opens in-context `LocationAddProgramPanel`
- Paths: Use existing published Program · Create new Organization Program then assign
- Active Location preselected and locked; multi-Location assignment supported
- Mutations via `/api/admin/configuration/programs` only — no duplicate local Program identity
- Stay on Location Programs; invalidate Programs + Locations collections; select associated LPC

### Program edit scope (Phases 4–5)

- Explicit `ConfigMutationScopeSelector` before save
- **This Location only** writes LPC offering fields (supported authority)
- **Organization default** disabled on Location editor with ownership explanation (definition edits remain on Programs workspace; Location panel does not silently broaden)
- Ownership badges + effective source copy; restore Organization default clears `local_description_override`

### Shared primitives (Phase 7)

- `web/lib/configRuntime/organizationLocationScope.ts`
- `ConfigOwnershipSourceBadge`, `ConfigMutationScopeSelector`
- Domain adapters retain Programs / Tuition mutation payloads

### Domain landings (Phases 9–12)

| Domain | Bare route | Section entry |
|--------|------------|---------------|
| Data Model | `/settings/entities` | `?section=entities` + sibling settings routes |
| Access | `/settings/users-roles` | `?section=users\|roles`; Departments `/settings/departments` |
| Business Processes | `/settings/processes` | `?section=stages\|actions\|automation\|health` |
| Surfaces | `/settings/surfaces` | `?section=focus-panels\|…` |

Access is framed as permission / visibility / assignment — **not** inheritance.

## Domain applicability matrix (Phase 8)

| Domain | Classification |
|--------|----------------|
| Programs | Org definition + assignment + coarse Location override |
| Tuition | Org default + Location override |
| Financial rules / policies | Org default; Location scope where already supported |
| Surfaces | Org definition + assignment; overrides unproven |
| Business Processes | Org definition + activation/assignment; overrides unproven |
| Data Model | Organization only |
| Access | Permission/scope assignment (not inheritance) |
| Automation | Owned inside process builder today — follow process classification |
| Communications | Not changed this sprint |

## Limitations

1. Location Program editor cannot mutate Organization-locked identity fields; Organization-default scope is intentionally disabled there with explicit copy.
2. Age / room-type metadata remain Location offering metadata — not Organization draft fields.
3. Process and Surfaces section deep-links set initial section state; some builder navigation remains in-memory after entry.
4. Full Organization-default Program publish-from-Location with multi-Location impact confirmation is deferred to Programs workspace confirmation UX (primitive + impact helper exist).

## Test evidence

- `web/tests/configRuntime/organizationLocationScope.test.ts`
- `web/tests/configRuntime/locationProgramAssociation.test.ts`
- `web/tests/configRuntime/organizationDomainLandings.test.ts`
- Existing Programs / Locations / Tuition / organization IA suites

## Operator QA checklist

See final handoff in sprint response.
