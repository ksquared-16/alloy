---
owner: platform
status: canonical
last_reviewed: 2026-07-14
supersedes: []
---

# Platform Decision: Configuration is Object-Centric

**Status:** Canonical platform decision. (This repository has no separate ADR/decision registry; platform decisions are authored as governed canonical doctrine — see `../governance/documentation-governance.md`.)

> **Operators configure operational objects. Not records. Not tables. Not CRUD.**

---

## Decision

Alloy configuration is **object-centric**. The unit of configuration is an **operational object** — a thing the operator runs — with an owner, a state, and a health. Configuration is an **operational experience**, not data entry.

Every configuration domain adopts one platform: the **Configuration Workspace Platform** (`../operator/configuration-workspace-platform-doctrine.md`). Domains supply their objects and a business-language translation of their substrate; they inherit the experience. No domain designs its own configuration interaction model.

## Context

Building Locations (Phase B) surfaced the realization that an operator configuring a location is not editing a row — they are **running Downtown Campus**: assessing its health, seeing what needs attention, adjusting the parts they own. Designed as CRUD, configuration becomes a form to decode; designed as an operational experience, it becomes obvious. The clickable evidence is the Operational Configuration Experience prototype; the doctrine is the deliverable.

## What this commits us to

- **Objects, not tables.** Configuration is organized around objects (Location, Program, Room, Commercial Offering, Business Process, Communication Template, Automation, Role, Surface, Field), each with its own workspace.
- **The business, not the machine.** Operators configure in business language; providers, resolvers, precedence, effective-dating, and engines are consumed and never exposed.
- **Ownership is the IA.** Every concern is configured on the object that owns it, summarized above, and configured in exactly one place.
- **One experience, inherited.** The workspace anatomy, the two-status model (Attention + Setup Progress), quiet inheritance, and inline/focused editing are the same across all domains.

## What this rules out

Large CRUD forms; edit drawers over tables; database-first screens; provider/precedence terminology; configuration-precedence UI; implementation-driven navigation; table editors as primary experiences; and configuration pages that configure a setting owned by no object. (Full list: the Anti-patterns section of the platform doctrine.)

## Reference implementation

**Locations is the reference implementation of the Configuration Workspace Platform** — the way Processing/Operational Runtime and the Focus Panel each have reference surfaces. Future configuration domains **reference Locations**; they do not invent their own experience.

## Future inheritance

This platform is intended to power, without changing the interaction model: **Commercial, Communications, Business Processes, Fields, Surfaces, Automation, Access, AI Configuration**, and every future operational configuration domain.

## Consequences for existing doctrine

- Supersedes the two "Configuration Workspace" experience doctrines (`../../system/configuration-workspace-doctrine.md`, `../../system/configuration-workspace-v1-doctrine.md`) via the platform doctrine; their ownership rules are carried forward.
- Reframes the four-plane control-plane model (`../modules/configuration-platform.md`) as the **substrate/capability layer** beneath the object experience — orthogonal, not superseded.
- Flags for reconciliation: the frozen surface-ownership matrix vs the proposed four-owner+inheritance model must be unified before implementation.

## Related docs

- `../operator/configuration-workspace-platform-doctrine.md` — the doctrine this decision establishes.
- `../operator/configuration-workspace-visual-language.md`, `../operator/configuration-workspace-component-library.md`.
- `platform-capabilities.md` — where the Configuration Workspace Platform is registered as a capability.

## When this doc must be updated

The object-centric commitment is amended or retired, or the set of inheriting domains materially changes.
