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
| **Exception work unit** | A work unit whose **primary purpose** is **exception / attention** work (risk, follow-up, intervention) rather than steady-state throughput. Same abstraction as other work units; **queues** and optional **exception-type** lanes differ. **Needs Attention** is the canonical first-class example. |
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
- **Records in multiple contexts** — The same underlying **record** (e.g. a job) may legitimately appear in **different operational contexts** at once: a throughput lane, an **exception** lane, and a full-record workspace. Context changes **what the UI emphasizes** (queue vs truth); it does **not** fork entity identity. Schema may still use a **single primary** operational FK (e.g. `work_unit_id`) while **projections** include the record in exception queues by predicate.
- **Needs Attention (first-class)** — Treat **Needs Attention** as a **first-class exception work unit** in product language: a dedicated place for **exception-driven** queues (not a generic “filter on the main list”). Implementation may align a stable **`needs_attention`** work-unit key with **exception-type** lanes inside that surface.
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
