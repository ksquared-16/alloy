# Alloy Platform Manifesto

**Status:** Canonical constitutional doctrine (July 2026). **Required reading** for every engineer, agent, and contributor working on Alloy.

This document states what Alloy **is** today and how we build from here. It is **philosophy** — not certification. For the formal architectural freeze declaration, see [`platform-freeze-july-2026.md`](./platform-freeze-july-2026.md). For merge evidence and statistics, see [`platform-certification-july-2026.md`](./platform-certification-july-2026.md) and [`../milestones/platform-stabilization-july-2026.md`](../milestones/platform-stabilization-july-2026.md).

---

## I. The platform is architecturally stable

Alloy has completed its foundational runtime construction phase. Presentation, Surface Host, Focus Panel, VM, Business Process, Processing, Communications, Configuration, Current Work, Queue, Motion, and Navigation runtimes are **shipped and canonical**.

Future engineering improves **experience, performance, automation, and intelligence** — not parallel platform layers.

---

## II. Foundational runtimes are complete

The operator plane is composed of finalized runtimes with single ownership. Do not introduce competing owners for the same responsibility.

| Runtime | Owns |
|---------|------|
| Presentation Runtime | Workspace, Work Unit, Queue Region, Focus Panel host, Right Rail presentation tree |
| Surface Host | Client-held surfaces; focus exchange without route teardown |
| Navigation Runtime | URL projection, deep links, surface routing (within Surface Host) |
| Motion Runtime | Operational motion tokens, reveal transitions, surface enter/exit |
| Focus Panel Runtime | Canonical record execution surface |
| VM Runtime | Entity compose, cache, reveal (Opportunity, Person, Child) |
| Queue Runtime | Queue preview lanes, hold semantics, lane reveal (within Presentation) |
| Business Process Runtime | Landing → stage queues → record focus |
| Processing Runtime | Digital Mailroom operational workspace |
| Communications Runtime | Command Center + Activity embed |
| Configuration Runtime | Settings `/settings/*` control plane |
| Current Work Runtime | Stage work completion inside Focus Panel |

**There is no legacy entity drawer runtime.** Unsupported entities fail closed.

---

## III. Engineering prefers deletion over duplication

When two paths solve the same problem, **delete one**. Alloy's July 2026 stabilization removed ~20,000 lines of duplicate drawer runtime because two owners for entity detail was unsustainable.

Before adding a new module, runtime, or abstraction, ask:

1. Does an existing runtime already own this?
2. Can configuration extend what exists?
3. If we add this, what will we delete?

If you cannot name what gets deleted, do not add it.

---

## IV. Operator experience is the highest priority

Architecture exists to serve operators running high-context workflows from one trusted workspace. Performance doctrine (Queue Hold, Surface Hold, progressive reveal, branded boot shell) is **protected infrastructure** — not optional polish.

Operators should never see:

- Blank loading surfaces between holds
- False empty queues during cold load
- Legacy drawer fallbacks for unsupported entities
- Page-navigation feel when switching operational surfaces

---

## V. The product defines architecture

Alloy is a configurable business operations platform — not a codebase searching for a product. Domain modules (Scheduling, Attendance, Billing, Commercial) **plug into existing runtimes**; they do not receive bespoke navigation spines or parallel drawer products.

Enrollment is a reference implementation. Childcare labels belong in tenant configuration — not shared platform branches.

---

## VI. Historical compatibility is not product ownership

Compatibility infrastructure exists (`contacts` table, archived `/legacy-admin` client modules, legacy `messages` parallel tables). These are **migration and import-path debt** — not supported product surfaces.

- `/legacy-admin` landing redirects to `/workspace`
- Locations operate through `/settings/locations` — not drawer `id: "new"`
- Global Search routes to canonical surfaces — not legacy drawer opens

Do not expand compatibility paths. Relocate or delete them when safe.

---

## VII. Every new abstraction must justify itself

Alloy already has: events, workflows, actions, queues, records, VM compose, Focus Panel cards, Settings four-plane control, Operational Workspace shells, and BOS assist.

New abstractions require explicit doctrine approval and a deletion plan for what they replace. Config-driven behavior is preferred over code branches. Platform rules + vertical presets beat industry-specific forks in shared modules.

---

## VIII. What we build next

The next era of Alloy focuses on:

| Priority | Examples |
|----------|----------|
| **Experience** | Focus Panel card editing substrate, Experience Builder adoption, module UX polish |
| **Performance** | Backend query/payload optimization, warm-cache expansion |
| **Automation** | Action catalog completion, workflow RBAC alignment, waitlist mutator |
| **Intelligence** | BOS assist depth, operational intelligence surfaces |
| **Domain productization** | Scheduling, Attendance, Billing, Payments, Commercial surfaces atop truth-flow backend |
| **Partner APIs** | External API expansion on internal platform foundation |

We do **not** build: additional foundational runtimes, legacy drawer restoration, dept-first navigation, or autonomous agent catalogs (paused).

---

## IX. Doctrine hierarchy

When documents conflict, resolve in this order:

1. This manifesto
2. [`platform-certification-july-2026.md`](./platform-certification-july-2026.md)
3. `docs/platform/foundation/*` and `docs/platform/operator/*` canonical doctrine
4. `docs/system/adminv2-runtime-performance-doctrine.md` (protected infrastructure)
5. Sprint closeouts and audits (historical execution records)

---

## X. Commitment

Alloy has transitioned from **platform construction** to **platform operation**.

We maintain what is canonical. We delete what is duplicate. We extend what operators need — through configuration and surfaces, not parallel systems.

**The platform is the product.**
