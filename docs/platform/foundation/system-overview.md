# System overview

**Status:** Canonical platform entry point (July 2026 stabilization).

---

## What Alloy is

Alloy is a configurable operating system for service businesses. Childcare is the first primary market; platform layers remain industry-agnostic. Operators run high-context workflows from one workspace: records, queues, communications, workflows, documents, scheduling, and AI-assisted action — scoped by org, permissions, and configuration.

---

## Operator hierarchy (June 2026)

```
Organization
  └── Business Process
        └── Stage
              └── Record
```

Work units, departments, and internal routing constructs support this model but are **implementation details** — see `../core/business-process-system.md`.

---

## Architecture planes

| Plane | Entry | Purpose |
|-------|-------|---------|
| **Operator** | `/workspace` | Business process landing → stage queues → record drawer |
| **Configuration** | `/admin` | Business processes, fields, layouts, actions, forms, workflows |
| **Data** | Supabase + RLS | Org-scoped truth; service-role server mutations |

`/legacy-admin` is archived — landing redirects to `/workspace`. Settings and operator surfaces are canonical.

---

## Technical spine

- **App:** Next.js App Router (`web/`)
- **Database:** Supabase Postgres with RLS (`org_id` scoping)
- **Side effects:** Events (`workflow_events`) → workflows → actions → effects
- **Record truth:** Resolver-backed entity GET — not queue previews
- **Identity:** `persons` + `customer_persons` canonical; `contacts` compatibility only

---

## Frozen doctrine index

| Topic | Doc |
|-------|-----|
| Business Process Execution Platform | `../modules/business-process-execution-platform.md` |
| Business processes | `../core/business-process-system.md` |
| Status and state | `../core/status-and-state-system.md` |
| Navigation | `../core/navigation-and-workspace-doctrine.md` |
| Canonical interaction model | `../operator/canonical-interaction-model.md` |
| Interaction grammar (laws) | `../operator/interaction-grammar.md` |
| Operator story (lived flow) | `../operator/operator-story.md` |
| Alloy visual language (mockup bridge) | `../operator/alloy-visual-language.md` |
| Alloy Runtime Specification (synthesis) | `../operator/alloy-runtime-specification.md` |
| Records | `../core/record-system.md` |
| Queues | `../operator/queue-system.md` |
| Drawers | `../operator/drawer-system.md` |
| Performance (locked) | `../../system/adminv2-runtime-performance-doctrine.md` |
| BOS identity | `../../system/bos-identity-doctrine.md` |
| Roles | `../governance/roles-and-permissions.md` |

---

## Principles

1. **Multi-tenant by org** — all reads/writes assume org isolation.
2. **Persons are canonical** — do not design new features on `contacts` as primary identity.
3. **Config steers, code owns invariants** — JSON does not replace authorization or workflow effects.
4. **Event/workflow path** — meaningful mutations emit events and run workflows where the product already does.
5. **Queues are previews** — authoritative detail from entity GET / RRS.
6. **AI respects boundaries** — validated APIs only; human-in-the-loop for BOS assist.

---

## Platform maturity (July 2026)

The architecture is **stable**. Foundational runtimes — Presentation, Surface Host, Focus Panel, VM, Business Process, Processing, Communications, Configuration, and Current Work — are **complete**. Legacy entity drawer runtime has been **removed**.

Future work primarily improves **experience**, **performance**, **automation**, and **operator intelligence** — plus domain productization (Scheduling, Attendance, Billing, Payments, Commercial, AI, Partner APIs). It should **not** introduce additional foundational runtimes or restore legacy drawer paths.

Milestone record: [`../milestones/platform-stabilization-july-2026.md`](../milestones/platform-stabilization-july-2026.md). Capability inventory: `platform-capabilities.md`. Sequencing: `product-roadmap.md`.

---

## Load order (onboarding)

1. This file
2. `../governance/glossary.md`
3. `architecture.md`
4. `platform-capabilities.md`
5. `../core/business-process-system.md`
6. `../core/entity-model.md`
7. `../core/record-system.md`
8. `../milestones/platform-stabilization-july-2026.md`
9. `../operator/queue-system.md` + `../operator/drawer-system.md`
10. Schema layer (`docs/schema/`) when touching DB/RLS

---

## When this doc must be updated

When org model, operator hierarchy, technical spine, or platform maturity framing changes materially.
