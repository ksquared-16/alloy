---
owner: platform
status: canonical
last_reviewed: 2026-07-14
supersedes: []
---

# Alloy Platform Handbook

**Audience:** Every engineer and AI agent joining Alloy  
**Role:** Teach how the platform *thinks*. This is the map — not the encyclopedia.

| Layer | Role |
|-------|------|
| **This handbook** | Teaches Alloy from first principles |
| **Canonical doctrine** (`docs/platform/`, `docs/system/`) | Defines current truth |
| **[`platform-decisions.md`](./platform-decisions.md)** | Records durable cross-platform decisions and rationale |

Deeper truth lives under `docs/platform/`, locked runtime detail under `docs/system/`, and generated reference under `docs/schema/` and `docs/api/`. Sprint and archive trees are **history**, not onboarding.

---

## Chapter 1 — What is Alloy?

Alloy is a **configurable operating system for service businesses**.

Operators should run high-context work from one trusted workspace: records, queues, communication, workflows, documents, scheduling, financial-adjacent operations, and AI-assisted action — without treating Alloy as a CRM, a form builder, or a vertical point solution.

Childcare enrollment is the first primary market and a **reference implementation**. Platform layers stay industry-agnostic. Vertical labels, presets, and templates belong in tenant configuration — not in shared platform identity.

**Philosophy**

- Configuration steers behavior; code owns invariants.
- Org scoping (`org_id`) is non-negotiable.
- Meaning precedes schema: operators see **operational meaning**, not a configurable database UI.
- AI increasingly assists coordination, but only through existing records, workflows, permissions, config, events, and audit paths.

**Read next**

- [`system-overview.md`](./system-overview.md)
- [`platform-manifesto.md`](./platform-manifesto.md)
- [`platform-capabilities.md`](./platform-capabilities.md)
- [`architecture.md`](./architecture.md)

---

## Chapter 2 — How Alloy Thinks

Alloy’s primary mental model is not “tickets” or “work units.” It is:

```text
Organization
  └── Business Process
        └── Stage
              └── Record
```

| Concept | Meaning |
|---------|---------|
| **Organization** | Tenant boundary. Every meaningful read/write is org-scoped. |
| **Business Process** | The operator-facing process (e.g. enrollment). Stages and work views live inside it. |
| **Stage** | Where a record sits in the process; stages frame queues and attention. |
| **Record** | Authoritative operational subject for attention and mutation. |
| **Action** | Registered mutation / side-effect path — not ad-hoc UI writes. |
| **Outcome** | Durable result that advances process state. |
| **Operational truth** | Authored facts and expectations; projections and queues are not systems of record. |

**Work units** are implementation/runtime constructs inside the Business Process System. Useful for navigation and surface composition; **not** the operator’s primary noun.

**Read next**

- [`../core/business-process-system.md`](../core/business-process-system.md)
- [`../core/status-and-state-system.md`](../core/status-and-state-system.md)
- [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md)
- [`../core/operational-expectations-system-design.md`](../core/operational-expectations-system-design.md)
- [`../governance/glossary.md`](../governance/glossary.md)

---

## Chapter 3 — Operational Platform

Operators work the business one process at a time.

- **Business Processes** define the journey.
- **Work Views / Current Work** show what matters now in context.
- **Queues** are **preview and selection surfaces** — never authoritative detail.
- **Needs Attention** and status surface grain-correct pressure (person, child, household, process instance — status has a **grain**).
- **Actions** mutate through registered paths.
- **Outcomes** create durable state; they are not cosmetic labels.

Authoritative detail comes from entity APIs, record responders, and underlying tables — after selection from a queue row.

**Read next**

- [`../operator/queue-system.md`](../operator/queue-system.md)
- [`../operator/action-system.md`](../operator/action-system.md)
- [`../operator/current-work-surface.md`](../operator/current-work-surface.md)
- [`../operator/operator-story.md`](../operator/operator-story.md)
- [`../modules/business-process-execution-platform.md`](../modules/business-process-execution-platform.md)
- [`../modules/actions-and-workflows.md`](../modules/actions-and-workflows.md)

---

## Chapter 4 — Data Platform

Data is modeled so **identity, relationships, fields, and status** stay coherent across configuration and runtime.

| Concern | Platform stance |
|---------|-----------------|
| **Entities** | Typed owned shapes; childcare entities are instances of general patterns. |
| **Records** | Operational subjects resolved by authoritative responders — not queue payloads. |
| **Relationships** | Explicit edge/model ownership (e.g. person–child); no silent identity forks. |
| **Fields** | Catalogued field system + ownership; avoid hardcoding industry branches in shared modules. |
| **Status** | Belongs to a grain; operator status and data-contract status have distinct owners. |
| **Configuration** | Steers layouts, available fields, and behaviors without becoming source of financial/ledger truth. |
| **Identity** | Prefer `persons` + `customer_persons`; `contacts` are compatibility infrastructure. |

**Read next**

- [`../core/entity-model.md`](../core/entity-model.md)
- [`../core/record-system.md`](../core/record-system.md)
- [`../core/data/README.md`](../core/data/README.md)
- [`../core/data/data-system.md`](../core/data/data-system.md)
- [`../core/data/field-system.md`](../core/data/field-system.md)
- [`../core/data/status-architecture.md`](../core/data/status-architecture.md)
- [`../modules/communications-identity-platform.md`](../modules/communications-identity-platform.md)
- Generated: [`../../schema/schema-tables.md`](../../schema/schema-tables.md)

---

## Chapter 5 — Operator Experience

The operator spine is shared across domains:

```text
Workspace → Perspective → Queue → Row → Focus Panel → Card → Section → Field
```

- **Workspace** is the operational home (not a configurable database browser).
- **Navigation** preserves continuity: warm cache, held prior content, coherent reveal.
- **Focus Panel** is the attention surface for the selected subject (drawer vocabulary is largely infrastructure history).
- **Cards** answer operational questions with weight, density, and evidence hierarchy.
- **Presentation Runtime** is the unifying presentation architecture for shell, work unit, focus panel, and rails.

Surface philosophy: **one composition for above-fold readiness**; no false empties while cold-loading; configuration powers experience without exposing raw schema as the UX.

**Read next**

- [`../operator/canonical-interaction-model.md`](../operator/canonical-interaction-model.md)
- [`../operator/interaction-grammar.md`](../operator/interaction-grammar.md)
- [`../operator/alloy-visual-language.md`](../operator/alloy-visual-language.md)
- [`../core/navigation-and-workspace-doctrine.md`](../core/navigation-and-workspace-doctrine.md)
- [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md)
- [`../experience/presentation-runtime-v2.md`](../experience/presentation-runtime-v2.md)
- [`../operator/alloy-runtime-specification.md`](../operator/alloy-runtime-specification.md)

---

## Chapter 6 — Configuration Platform

Configuration is how Alloy adapts without forking the platform.

- Fields, layouts, actions, forms, and commercial offerings are **config surfaces**.
- Ownership and inheritance decide what a site or org can change.
- Builders (Experience Builder, surface composers) author persisted composition — they do not invent a second runtime.

**Philosophy:** configuration steers; it must not silently redefine permissions, ledgers, or invariants that belong in code and schema.

**Read next**

- [`../modules/configuration-platform.md`](../modules/configuration-platform.md)
- [`../modules/commercial-configuration.md`](../modules/commercial-configuration.md)
- [`../core/configuration-ownership-and-inheritance.md`](../core/configuration-ownership-and-inheritance.md)
- [`../operator/experience-builder-doctrine.md`](../operator/experience-builder-doctrine.md)
- [`../../system/configuration-runtime-v1.md`](../../system/configuration-runtime-v1.md)
- [`../../system/configuration-ownership-doctrine.md`](../../system/configuration-ownership-doctrine.md)

---

## Chapter 7 — Runtime

Runtime is how the OS stays trustworthy under navigation and load.

At a conceptual level:

- **OS Runtime** layers (kernel → intent → navigation → experience → surface → card → record → entity → operational/BOS) map ownership of behavior.
- **View Models** compose above-fold readiness; UI components present — they do not invent surface readiness.
- **Reveal** is coordinated: partial above-fold reveal is not allowed; unloaded queue ≠ empty.
- **Caching / prefetch** are allowed; clearing valid displayed data before replacement is not.
- **Events** drive meaningful lifecycle, ledger, scheduling, and communications side effects.

**Read next**

- [`os-runtime-map.md`](./os-runtime-map.md)
- [`../runtime/operational-runtime-doctrine.md`](../runtime/operational-runtime-doctrine.md)
- [`../experience/loading-and-reveal-contract.md`](../experience/loading-and-reveal-contract.md)
- [`../operator/surface-view-model-composition.md`](../operator/surface-view-model-composition.md)
- [`../../system/adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md)
- [`platform-event-catalog.md`](./platform-event-catalog.md)

---

## Chapter 8 — Commercial Platform

Commercial capability is a platform layer — not a billing UI glued onto childcare.

Understand at handbook level:

- **Commercial model** — offerings, ownership, programs.
- **Execution** — how commercial intent becomes operable.
- **Consumption** — operational consumption of commercial reality.
- **Funding / pricing / billing** — financial-adjacent consequences derived from operational truth, not invented in presentation.

Childcare tuition and enrollment commercial patterns are vertical applications of this layer.

**Read next**

- [`../commercial/commercial-platform-v1.md`](../commercial/commercial-platform-v1.md)
- [`../commercial/ownership-model.md`](../commercial/ownership-model.md)
- [`../commercial/program-offerings.md`](../commercial/program-offerings.md)
- [`../modules/commercial-configuration.md`](../modules/commercial-configuration.md)
- [`../modules/operational-consumption-platform.md`](../modules/operational-consumption-platform.md)
- [`../modules/billing-financials-platform.md`](../modules/billing-financials-platform.md)
- [`../modules/financial-platform-domain.md`](../modules/financial-platform-domain.md)
- [`../core/commercial-operating-model.md`](../core/commercial-operating-model.md)

---

## Chapter 9 — AI Platform

Alloy’s AI is assistive and **platform-grounded**.

- **BOS** (Business Operating System assist) recommends and drafts inside operator context.
- Recommendations must use the same records, permissions, workflows, and audit paths as humans.
- **Human in the loop** is law: AI recommends; humans decide; commits are explicit.

Do not invent parallel data planes or privileged client-side service-role shortcuts for “AI features.”

**Read next**

- [`../modules/ai-platform.md`](../modules/ai-platform.md)
- [`../../system/bos-identity-doctrine.md`](../../system/bos-identity-doctrine.md)
- [`../../product/bos-foundation.md`](../../product/bos-foundation.md)
- [`../../product/ai-system.md`](../../product/ai-system.md)

---

## Chapter 10 — Platform Principles

Hold these as operating rules:

1. **One owner** — every concept and every document has a single obvious owner.
2. **One truth** — projections and queues never replace authored ledgers or entity GET.
3. **Configuration steers** — it does not redefine protected invariants.
4. **Code owns invariants** — RLS, org scope, audit, registered events, permissions.
5. **Operators think in Business Processes** — not work-unit plumbing.
6. **Queues are previews** — selection surfaces only.
7. **Records are truth** — resolve detail through authoritative paths.
8. **Actions mutate** — side effects follow events/workflows/admin actions.
9. **Outcomes create durable state** — process advances for real.
10. **Status belongs to a grain** — do not invent status without ownership.
11. **AI recommends; humans decide** — always.
12. **Every concept has one owner / every document has one owner** — no parallel doctrine.

**Where to go from here**

| Need | Start |
|------|--------|
| Full library map | [`../../README.md`](../../README.md) |
| Platform Decisions | [`platform-decisions.md`](./platform-decisions.md) |
| Freeze / certification | [`../milestones/freeze-july-2026.md`](../milestones/freeze-july-2026.md) |
| Design & operational law | [`../governance/design-and-operational-doctrine.md`](../governance/design-and-operational-doctrine.md) |
| Documentation governance | [`../governance/documentation-governance.md`](../governance/documentation-governance.md) |
| Schema | [`../../schema/schema-tables.md`](../../schema/schema-tables.md) |
| History | `docs/sprints/`, `docs/archive/` (not day-one reading) |

This handbook is the door. The canonical trees are the building.