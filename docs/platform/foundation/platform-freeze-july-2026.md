# Alloy Platform Freeze

**Status:** COMPLETE  
**Date:** July 2026

---

## Purpose

This document certifies that Alloy's foundational platform architecture is **complete**.

The platform is now considered **stable**. Future engineering effort should improve operator experience and product capability rather than introduce additional foundational runtime systems.

This is a **declaration** — not a roadmap, audit, or sprint log. For the certification record and merge evidence, see [`platform-certification-july-2026.md`](./platform-certification-july-2026.md). For engineering philosophy, see [`platform-manifesto.md`](./platform-manifesto.md).

---

## Canonical Runtime Ownership

Each responsibility has **exactly one** canonical runtime owner. No duplicate runtime owns these responsibilities.

| Runtime | Owns |
|---------|------|
| **Presentation Runtime** | Workspace, Work Unit, Queue Region, Focus Panel host, Right Rail presentation tree |
| **Surface Host** | Client-held surfaces; focus exchange without route teardown |
| **Navigation Runtime** | URL projection, deep links, surface routing (within Surface Host) |
| **Motion Runtime** | Operational motion tokens, reveal transitions, surface enter/exit |
| **Queue Runtime** | Queue preview lanes, hold semantics, lane reveal (within Presentation) |
| **Focus Panel Runtime** | Canonical record execution surface (cards, modes, operational context) |
| **Current Work Runtime** | Stage work completion inside Focus Panel |
| **Business Process Runtime** | Landing → stage queues → record focus |
| **Processing Runtime** | Digital Mailroom operational workspace |
| **Communications Runtime** | Command Center + Activity embed |
| **Configuration Runtime** | Settings `/settings/*` control plane |
| **VM Runtime** | Entity compose, cache, reveal (Opportunity, Person, Child) |

**No duplicate runtime owns these responsibilities.**

Ownership map: [`../governance/runtime-ownership-migration-map.md`](../governance/runtime-ownership-migration-map.md) (historical filename; describes **current** ownership, not an active migration program).

---

## Eliminated Architecture

Major removals completed during Platform Stabilization (July 2026):

| Removed | Replaced by |
|---------|-------------|
| Legacy Drawer Runtime (`AdminEntityDrawerLegacy`) | VM Runtime + Focus Panel |
| Legacy entity drawer ownership | Fail-closed `AdminEntityDrawer` router |
| Duplicate VM runtime paths | Single VM compose + reveal contract |
| Legacy admin runtime as operator surface | `/workspace` + Settings Configuration Mode |
| Historical fallback routing for unsupported entities | Explicit fail closed |
| Permanent dual-runtime model | Deployment/Git rollback only — no code-path kill switches |
| Generic drawer creation for locations | Settings `/settings/locations` inline create |

**Deletion was preferred over compatibility.** Compatibility infrastructure that remains (`contacts`, archived client modules) is import-path debt — not supported product ownership.

---

## Engineering Principles

The platform now follows these rules:

1. **Prefer deletion over duplication.** Two owners for the same concern is a defect.
2. **Prefer extension over new runtime creation.** Configuration and card behavior extend existing runtimes.
3. **The product defines architecture.** Domain modules plug into runtimes — not bespoke navigation spines.
4. **Canonical ownership is singular.** One runtime per responsibility (see table above).
5. **Historical compatibility is not product ownership.** Archived paths are not operator surfaces.
6. **Every new abstraction must justify itself.** Name what gets deleted before adding.
7. **Runtime expansion requires an RFC.** No silent parallel systems.

Constitutional detail: [`platform-manifesto.md`](./platform-manifesto.md).

---

## Current Product Direction

Future work focuses on **product evolution**, not platform construction:

- **Scheduling**
- **Attendance**
- **Billing**
- **Payments**
- **Commercial**
- **Automation**
- **Operational Intelligence**
- **AI**
- **Partner APIs**
- **Experience** (Parent Experience, Teacher Experience, operator UX polish)

Perceived-performance continuity (Work View pills, queue hold, Focus Panel seed identity) is **complete** — see [`../../sprints/07_2026/perceived-performance-sprint-closeout.md`](../../sprints/07_2026/perceived-performance-sprint-closeout.md).

---

## Platform Status

| Area | Status |
|------|--------|
| Architecture | **Stable** |
| Runtime ownership | **Stable** |
| Interaction model | **Stable** |
| Navigation | **Stable** |
| VM | **Stable** |
| Processing | **Stable** |
| Communications | **Stable** |
| Current Work | **Stable** |
| Configuration | **Stable** |
| Presentation + Surface Host | **Stable** |
| Focus Panel identity plane | **Stable** |

---

## Final Promotion Record

Platform Stabilization initiative **closed** on staging with these merges:

| PR | Purpose | Merge SHA |
|----|---------|-----------|
| #148 | Legacy drawer elimination | `e94811914` |
| #151 | VM drawer runtime test hardening | `bb720f495` |
| #156 | Platform certification + manifesto | `29fbcfb93` |
| #157 | Work View count + pill continuity | `c6e1adec8` |
| #159 | Queue continuity (Step D) | `faa129ac9` |
| #160 | Focus Panel seeded identity (E1-a/b) | `e52e5fa2c` |
| #162 | Perceived performance closeout | `51641dc44` |

**Superseded without merge:** #150, #153 (replaced by #156).

**Deployment incident (not E1 regression):** Preview `e32c6c3` failed on pre-existing identity-surface circular import; fixed in `291660a4b`, included in #160 merge.

---

## Historical Note

**Platform Stabilization is complete.**

Future work belongs to **product evolution** rather than platform construction. Track new effort under product initiatives — not Platform Stabilization sprints.

Sprint and audit history remain in `docs/sprints/` and `docs/audits/` for archaeology only. A new engineer should start with:

1. [`platform-freeze-july-2026.md`](./platform-freeze-july-2026.md) (this document)
2. [`platform-manifesto.md`](./platform-manifesto.md)
3. [`system-overview.md`](./system-overview.md)
4. [`platform-capabilities.md`](./platform-capabilities.md)
