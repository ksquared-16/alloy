# Platform Capability Model (API-first doctrine)

**Status:** Doctrine (Phase 3 API Platform closeout). Defines **how Alloy thinks about
capabilities** as platform units, and the API-first expectation for new operational modules.

> **Not** the same as [`foundation/platform-capabilities.md`](foundation/platform-capabilities.md),
> which is the canonical *inventory* of what Alloy has built. This document is the **doctrine**:
> the model every capability is described with, and the rule that new modules are designed as
> capabilities first. Read the two together — inventory answers "what exists?", this answers "how
> is a capability shaped and exposed?".

---

## What a capability is

A **capability** is a product/platform unit — not an endpoint and not a screen. It is the unit that
many surfaces consume through a stable, typed boundary:

- Workspace
- Configuration
- BOS (AI assist)
- Actions
- Workflows
- Analytics
- Parent Experience
- Staff Experience
- Future public APIs / SDKs

A capability owns its **canonical entities**, exposes a **canonical API**, is consumed through a
**canonical client**, and emits **primary events**. UI is a *consumer* of a capability, never its
definition.

### The capability model

Every capability is described with this shape:

```txt
Capability
→ Purpose            (the operational job it does)
→ Canonical entities (the records it owns / is authoritative for)
→ Canonical API      (the stable HTTP boundary under web/app/api/**)
→ Canonical client   (how consumers call it — preferably the generated internal client)
→ Primary events     (the lifecycle/domain events it emits)
→ Consumers          (which surfaces depend on it)
→ OpenAPI status     (none / v0 / expansion-pending)
→ Notes              (freshness, bulk, realtime, scope, sunset, caveats)
```

---

## Core principle

> **New operational modules should be designed as platform capabilities first, then surfaced
> through UI.**

Concretely, a new module (Attendance, Scheduling, Billing, …) should define — **before** building
screens:

1. Canonical entities and ownership/authority boundaries.
2. A canonical API on the normalized response contract (`apiOk` / `apiError`, correlation id).
3. Freshness class, pagination model, bulk-access pattern, and the event model **up front**
   (see [`../api/api-data-access-performance.md`](../api/api-data-access-performance.md)).
4. The path to OpenAPI admission + a generated client method (see
   [`../api/api-platform-governance.md`](../api/api-platform-governance.md) — Definition of Done
   and the API lifecycle).

This is what "API-first" means here: the capability's boundary is a deliberate contract, not a
byproduct of whatever a screen happened to need.

---

## Current capabilities (on the platform today)

These four families are normalized, in OpenAPI v0, and reachable through the generated internal
client (`web/lib/api/alloyApiClient.ts`).

### Actions

- **Purpose:** Execute operator/automation "do work" against records (preflight, execute, inventory).
- **Canonical entities:** action definitions + placements; the target record being acted on.
- **Canonical API:** `/api/admin/actions/*` (`inventory`, `preflight`, `execute`).
- **Canonical client:** internal API client — `api.actions.*`.
- **Primary events:** action execution → workflow events / audited mutations.
- **Consumers:** workspace, command surfaces, BOS, workflows.
- **OpenAPI status:** v0.
- **Notes:** `ACTION_BLOCKED` failures carry preflight context under `error.details`.

### Analytics Metrics

- **Purpose:** Define, evaluate, and trend operator metrics/KPIs.
- **Canonical entities:** metric definitions; evaluations; snapshots.
- **Canonical API:** `/api/admin/analytics/metrics/*` (list/create/get/update/copy/preview/snapshot/trend).
- **Canonical client:** internal API client — `api.metrics.*`.
- **Primary events:** snapshot creation; metric definition lifecycle.
- **Consumers:** dashboards, workspace, future reports.
- **OpenAPI status:** v0.
- **Notes:** server-computed values/labels/sparklines; sibling analytics routes are expansion-pending.

### Entity Read

- **Purpose:** Resolve the authoritative composed record for a given entity type + id.
- **Canonical entities:** all read entity types (persons, opportunities, jobs, customers, …).
- **Canonical API:** `/api/admin/entity/{type}/{id}`.
- **Canonical client:** internal API client — `api.entity.get(type, id)`.
- **Primary events:** none (read surface).
- **Consumers:** workspace, record surfaces, BOS, future SDKs.
- **OpenAPI status:** v0.
- **Notes:** `data.entity` is wide and type-dependent; the `{ _create: true }` sentinel marks new records.

### Reference Data

- **Purpose:** Configurable person-model reference rows used in configuration/settings.
- **Canonical entities:** customer person role types; person relationship type settings.
- **Canonical API:** `/api/admin/customer-person-role-types/*`, `/api/admin/person-relationship-type-settings/*`.
- **Canonical client:** internal API client — `api.referenceData.*`.
- **Primary events:** none (configuration data).
- **Consumers:** settings / configuration surfaces.
- **OpenAPI status:** v0.
- **Notes:** bounded archived/static catalogs; delete is `405 NOT_IMPLEMENTED` (deactivate instead).

---

## Operational capabilities (expansion-pending)

These exist operationally or are upcoming; their **capability API** is expansion work governed by
the readiness gate and Definition of Done. Designing them API-first is the expectation.

### Enrollment

- **Status:** exists operationally; capability API expansion pending.
- **Canonical entities:** opportunity, person, child / customer member, tour, placement candidate.
- **Consumers:** workspace, forms, communications, analytics, BOS.
- **OpenAPI status:** expansion-pending.
- **Notes:** should become a first-class capability API (read + lifecycle) as expansion resumes;
  reuse the entity-read + actions capabilities rather than inventing parallel paths.

### Attendance

- **Status:** upcoming operational capability.
- **API-first expectation:** **yes.**
- **Notes:** define **bulk access, realtime/event model, and freshness** up front — attendance is
  high-volume and time-sensitive; do not recreate per-record polling.

### Scheduling

- **Status:** upcoming operational capability.
- **API-first expectation:** **yes.**
- **Notes:** define entities (schedules, sessions, assignments), recurrence, and conflict semantics
  as part of the canonical API.

### Billing

- **Status:** upcoming operational capability.
- **API-first expectation:** **yes.**
- **Notes:** ledger/financial truth is code-owned; route side effects through events/workflows, not
  ad hoc writes. Define idempotency and audit up front.

### Processing

- **Status:** upcoming operational capability.
- **API-first expectation:** **yes.**
- **Notes:** define async/long-running semantics and status/result contracts (the future async
  export pattern applies here).

### Parent Experience

- **Status:** future external-facing capability.
- **API-first expectation:** **yes.**
- **Notes:** external-facing — must pass the public-API admission policy (field exposure, auth, rate
  limits, versioning) before any public surface; internal capability API comes first.

### Staff Experience

- **Status:** future external-facing capability.
- **API-first expectation:** **yes.**
- **Notes:** same public-admission requirements as Parent Experience; build the internal capability
  API first, expose deliberately later.

---

## Related

- [`foundation/platform-capabilities.md`](foundation/platform-capabilities.md) — capability **inventory** (what exists).
- [`../api/api-platform-completion.md`](../api/api-platform-completion.md) — API Platform foundation closeout.
- [`../api/api-platform-governance.md`](../api/api-platform-governance.md) — Definition of Done + lifecycle.
- [`../api/api-data-access-performance.md`](../api/api-data-access-performance.md) — freshness/pagination/sync/SLOs.
- [`../api/internal-typescript-client.md`](../api/internal-typescript-client.md) — the generated client.
- [`foundation/architecture.md`](foundation/architecture.md) — system context.
