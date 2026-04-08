# Workspace, work unit, scope, and record — doctrine

## Separation of concerns

| Concept | Role |
|---------|------|
| **Record** | **Truth, inspection, editing** — authoritative state, history, and structured detail. |
| **Work unit** | **Execution** — where operational work is done today (queues, checklists, assignments in motion). |
| **Department** | **Coordination and throughput** — lane of responsibility spanning multiple work units and people. |
| **Queue** | A **projection** of work within a work unit (filtered/sorted view), **not** the record itself. |
| **Drawer** | **Lightweight inspect / quick act** — fast path; may show a **subset** of resolver payload. |
| **Full record workspace** | **Deeper editing and context** when the drawer is insufficient. |

**Queue preview ≠ record truth** — Row summaries are optimized for triage; the resolver-backed record is authoritative when decisions matter.

## Actions

One **action definition** (same underlying capability) may appear in **queue**, **drawer**, or **full record** depending on **configuration** and context — without duplicating business logic in three places.

## Org model

| Concept | Definition |
|---------|------------|
| **Org** | Tenant / company boundary — data isolation and billing. |
| **Location** | **Physical or geographic operating site** (service address, facility, etc.) — distinct from department. |
| **Department** | **Functional lane of work** (e.g. scheduling, billing, customer success) — **not** the same as GL/cost-center “department codes.” |
| **Work unit** | **Configurable execution surface** within a department **and** within a **scope** — not a hardcoded vertical screen. |
| **Scope** | Where a user or surface **may operate** (org-wide, location set, customer portfolio, etc.) — **role alone is insufficient** long term. |

## Access (directional)

Future access checks should combine:

- **Role** (coarse membership / admin vs ops patterns),
- **Scope** (which subset of org data),
- **Capabilities** (fine-grained permissions),
- **Work unit membership** (which execution surfaces).

Today the codebase may only implement a **subset** (e.g. org-scoped `user_roles`); doctrine states the **target composition** without requiring immediate schema completion.

## Multiplicity

- **One record may appear in multiple work units** (e.g. handoff, cross-functional work) — routing is **config + resolver**, not a single permanent “screen owner.”
- **Multi-location orgs** must be supported **without fake sub-orgs** — locations attach to customers, jobs, or other entities as appropriate; org stays the tenant.

## Relationship to schema today

See [implementation-gap-audit.md](./implementation-gap-audit.md) for how `departments`, `work_units`, `jobs.work_unit_id`, and RLS align or fall short of this doctrine.

**Terms:** [glossary.md](./glossary.md)

## Future AI compatibility (not implementation now)

**AI operates within doctrine; it does not replace it.** Automated agents may **suggest** or **tune**:

- Overview **layout** or band visibility (within allowed templates),
- **Queue prioritization** and ordering hints,
- **Work unit grouping** or routing suggestions,
- **Signal thresholds** (what counts as urgent),

based on behavior and telemetry. Human-approved **config and governance** remain authoritative; AI proposals are constrained by the same resolver, scope, and permission models as the rest of the product.
