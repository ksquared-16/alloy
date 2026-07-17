---
owner: platform
status: canonical
last_reviewed: 2026-07-14
supersedes: []
---

# Platform Decisions

**Purpose:** Concise register of consequential, durable, cross-platform decisions.

| Artifact | Role |
|----------|------|
| **Canonical doctrine** | How Alloy works today |
| **RFCs** | Proposals and ratification paths |
| **Release history** | Shipped capability milestones |
| **Sprint / audit / archive** | Execution and investigation history |
| **This register** | Durable decisions and their rationale |

Detailed behavior always lives in the **canonical owner** documents linked below — not here.

## Entry format

```text
## YYYY-MM — Decision title

**Decision:** what was decided.
**Why:** why it was necessary.
**Consequences:** what future work must respect.
**Canonical owners:** links to detailed doctrine.
**Status:** Active | Superseded
**Superseded by:** link when applicable.
```

---

## 2026-07 — Organization publishes; Locations consume

**Decision:**
Organization Configuration Runtime V2 is frozen. Organization publishes reusable configuration through nine first-class domains; Locations consume it through inheritance, assignment, or provider-gated Apply. Programs is the operator-facing reusable service catalog. Locations own Programs offered, Rooms/Delivery Resources, and local scheduling; resources and runtime own capacity.

**Why:**
Organization configuration needed one canonical ownership and distribution model above the frozen Locations experience. Treating Programs as Location-owned room containers conflated reusable service identity with operational delivery.

**Consequences:**
Future Configuration domains use the Configuration Domain Card and publisher/consumer contract. Commercial may remain an internal compatibility runtime/route name, but operator language is Programs. No downstream domain may infer health, expose Apply without authoritative delivery, or move resource/capacity/scheduling truth into Programs.

**Canonical owners:** [`../../system/organization-configuration-runtime-v2.md`](../../system/organization-configuration-runtime-v2.md), [`../modules/configuration-platform.md`](../modules/configuration-platform.md), [`../core/configuration-ownership-and-inheritance.md`](../core/configuration-ownership-and-inheritance.md).

**Status:** Active

---

## 2026-07 — Operational Expectations Authority represented by a governed catalog + assignments

**Decision:**
The already-frozen **Authority** tuple facet of an Operational Expectation is represented by (1) a governed
org-scoped **authority catalog**, (2) append-only **effective-dated held-authority assignments** (holder
= human/policy/process/external, never AI; scoped), and (3) one **canonical held-authority resolver**.
**RBAC permission authorizes commands; a held-authority assignment authorizes semantic Standing** — both
may be required, neither implies the other. This is the implementation *representation* of a frozen facet,
**not** a new platform concept.

**Why:**
The frozen doctrine requires authority-holding gating (§12: "an author may assert only expectations whose
Authority they hold") and self-ratification within authority (§5), but the substrate had only a free-text
`authority_key` claim. A governed representation was required to certify G-Standing without inventing new
architecture.

**Consequences:**
Future work must resolve held authority through the single resolver; must not equate RBAC permission,
admin role, or service-role with held authority; must keep AI non-holding; and must not add an authority
hierarchy unless the frozen contract defines dominance (current rule: exact authority-key match). Legacy
free-text authority claims remain readable but can never bind.

**Canonical owners:** [`platform/core/operational-expectations-system-design.md`](../core/operational-expectations-system-design.md) (§5·§12), [`platform/milestones/operational-expectations-engineering-realization.md`](../milestones/operational-expectations-engineering-realization.md) (X0), [`platform/milestones/operational-expectations-p1-wave-c-standing-ratification.md`](../milestones/operational-expectations-p1-wave-c-standing-ratification.md).
**Status:** Active

---

## 2026-07 — Documentation Platform v1.0 frozen

**Decision:**  
Documentation is **production infrastructure**. Active doctrine has **one canonical owner** per concept. Feature work that changes platform behavior updates its owning canonical document in the **same change**. Sprint, audit, closeout, and archive material do **not** redefine current doctrine. No additional **broad** documentation reorganization is planned.

**Why:**  
Canonical ownership, governance, docs-lint/CI, handbook onboarding, history separation, curation, and repository certification are complete. The repository must maintain documentation **incrementally** with feature work rather than periodically rebuilding it.

**Consequences:**  
- New docs fit established lifecycle and placement rules.  
- Documentation regressions are CI-governed.  
- Future cleanup is ordinary maintenance — not a new platform initiative.

**Canonical owners:**  
- [`../governance/documentation-governance.md`](../governance/documentation-governance.md)  
- [`alloy-platform-handbook.md`](./alloy-platform-handbook.md)  
- [`../milestones/documentation-rebaseline-v2-certification.md`](../milestones/documentation-rebaseline-v2-certification.md)  
- `docs/sprints/completed/documentation-rebaseline-v2/00-closeout.md` *(initiative history — not current doctrine)*  
- [`../../README.md`](../../README.md)

**Status:** Active  

**Superseded by:** —

---

## 2026-07 — Business Process is the operator-facing execution model

**Decision:**  
Operators think in **Business Process → Stage / Work View → Record**. Work units and queue definitions remain **implementation/runtime** constructs. **Status does not replace** stage, work, or outcome.

**Why:**  
Alloy is an operations OS, not a CRM-first, work-unit-first, or queue-as-truth product. The operator model must stay stable across domains.

**Consequences:**  
Surfaces, language, and new domains orient to Business Processes first. Runtime constructs may exist underneath but must not become the primary nouns in product or platform docs.

**Canonical owners:**  
- [`../core/business-process-system.md`](../core/business-process-system.md)  
- [`../core/status-and-state-system.md`](../core/status-and-state-system.md)  
- [`../modules/business-process-execution-platform.md`](../modules/business-process-execution-platform.md)  
- [`alloy-platform-handbook.md`](./alloy-platform-handbook.md) (Ch. 2–3)

**Status:** Active  

**Superseded by:** —

---

## 2026-07 — One truth and one owner per platform concern

**Decision:**  
Every durable concern has **one canonical owner**. Queue rows are **previews**; record/entity resolvers provide authoritative detail. Configuration **steers** behavior and presentation; **code owns** invariants and executable semantics. Status belongs to a **named subject grain**.

**Why:**  
Parallel doctrine and dual sources of truth produce operator distrust and implementation churn. Ownership must be discoverable and enforced.

**Consequences:**  
Do not introduce a second owner for an already-owned concern. Prefer config and vertical presets over industry-specific branches in shared modules. Treat queue payloads as selection, not truth.

**Canonical owners:**  
- [`../core/entity-model.md`](../core/entity-model.md)  
- [`../core/record-system.md`](../core/record-system.md)  
- [`../core/status-and-state-system.md`](../core/status-and-state-system.md)  
- [`../core/data/status-architecture.md`](../core/data/status-architecture.md)  
- [`../modules/configuration-platform.md`](../modules/configuration-platform.md)  
- [`../operator/queue-system.md`](../operator/queue-system.md)  
- [`../governance/design-and-operational-doctrine.md`](../governance/design-and-operational-doctrine.md)

**Status:** Active  

**Superseded by:** —

---

## 2026-07 — Runtime is stable infrastructure

**Decision:**  
Runtime work proceeds by **correcting ownership domains**, not rediscovering or multiplying runtimes. **One runtime owner** per concern. Compatibility paths are **migration mechanisms** and must be deleted after parity. Primary operational surfaces reveal as **stable, complete** experiences (coordinated reveal; no false empties).

**Why:**  
Architecture discovery is finished for OS Runtime / Presentation Runtime. Remaining work is product completion and ownership cleanup inside the locked model.

**Consequences:**  
Do not invent parallel reveal engines, shells, or ownership trees. Prefetch is allowed; partial above-fold reveal is not. Update ownership maps when moving runtimes.

**Canonical owners:**  
- [`../runtime/operational-runtime-doctrine.md`](../runtime/operational-runtime-doctrine.md)  
- [`os-runtime-map.md`](./os-runtime-map.md)  
- [`../experience/presentation-runtime-v2.md`](../experience/presentation-runtime-v2.md)  
- [`../governance/runtime-ownership-migration-map.md`](../governance/runtime-ownership-migration-map.md)  
- [`../../system/adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md)

**Status:** Active  

**Superseded by:** —

---

## 2026-07 — AI remains human-in-the-loop

**Decision:**  
BOS may **assist, recommend, explain, and prepare**. Authoritative or irreversible decisions remain governed by **validated platform actions** and **human confirmation**. AI does **not** create parallel mutation paths.

**Why:**  
Alloy’s trust model requires the same records, permissions, workflows, events, and audit paths for AI-assisted work as for human operators.

**Consequences:**  
No privileged client-side service-role shortcuts “for AI.” Recommendations stay grounded in platform commands and config. Product pauses on agent expansion do not change this law.

**Canonical owners:**  
- [`../modules/ai-platform.md`](../modules/ai-platform.md)  
- [`../modules/actions-and-workflows.md`](../modules/actions-and-workflows.md)  
- [`../../system/bos-identity-doctrine.md`](../../system/bos-identity-doctrine.md)  
- [`../../product/bos-foundation.md`](../../product/bos-foundation.md)

**Status:** Active  

**Superseded by:** —

---

## 2026-07 — Configuration is object-centric

**Decision:**  
Operators configure **operational objects** — Location, Program, Room, Commercial Offering, Business Process, Communication Template, Automation, Role, Surface, Field — **not records, tables, or CRUD forms**. Configuration is an operational experience. Every configuration domain inherits **one** platform (the Configuration Workspace Platform); no domain invents its own configuration experience. **Locations is the reference implementation.**

**Why:**  
Building Locations surfaced that the operator is *running a place*, not editing its row. Designed as CRUD, configuration becomes a form to decode; designed as an operational experience — object, health, attention, the parts you own — it becomes obvious. CRUD-first, database-first, and drawer-over-table configuration are prohibited because they expose implementation (providers, precedence, versioning) the operator must never meet, and because per-domain reinvention forks the platform.

**Consequences:**  
New configuration domains adopt the platform's object model, workspace anatomy, two-status model (Attention + Setup Progress), business-language and quiet-inheritance rules, and inline/focused editing. No large CRUD forms, edit drawers over tables, provider/precedence terminology, configuration-precedence UI, implementation-driven navigation, generic forms, or object-less settings pages. Commercial Configuration validates the platform as a second consumer; future domains reference Locations.

**Canonical owners:**  
- [`../operator/configuration-workspace-platform-doctrine.md`](../operator/configuration-workspace-platform-doctrine.md)  
- [`../operator/configuration-workspace-visual-language.md`](../operator/configuration-workspace-visual-language.md)  
- [`../operator/configuration-workspace-component-library.md`](../operator/configuration-workspace-component-library.md)  
- [`../modules/configuration-platform.md`](../modules/configuration-platform.md) *(control-plane substrate — orthogonal layer)*

**Status:** Active  

**Superseded by:** —
