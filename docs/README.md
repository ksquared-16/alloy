---
owner: platform
status: canonical
last_reviewed: 2026-08-01
supersedes: []
---

# Alloy documentation

**Purpose:** Authoritative navigation for engineers, implementers, and AI agents. Prefer these files over chat memory or archived sprint material.

**Start here (onboarding):** **[`platform/foundation/alloy-platform-handbook.md`](platform/foundation/alloy-platform-handbook.md)** — the Alloy Platform Handbook. Teach the platform first; doctrine is the encyclopedia.

**Platform Decisions:** **[`platform/foundation/platform-decisions.md`](platform/foundation/platform-decisions.md)** — durable cross-platform decisions and rationale (not a substitute for doctrine).

**July 2026 platform freeze:** Foundational architecture is **complete and stable**. After the handbook: **`platform/milestones/freeze-july-2026.md`**, **`platform/foundation/platform-manifesto.md`**, **`platform/foundation/system-overview.md`**.

**June 2026 rebaseline:** Canonical platform docs live under **`docs/platform/`**. Schema reference under **`docs/schema/`** (generated). Business Process → Stage → Record is the operator mental model; work units are documented as runtime constructs.

For behavior-changing work, include **`docs/platform/governance/design-and-operational-doctrine.md`** in context.

**Cross-cutting UX model:** How every operational domain (Enrollment, Attendance, Scheduling, Billing, Staffing, Subsidy, POS, Capacity, Compliance) shares one architecture — five planes, Operations/Records split, progressive drawers, tabs-vs-actions — is defined in **`platform/core/operational-ux-doctrine.md`** (the **surface axis**).

**Cross-cutting truth model:** The complementary **truth-flow axis** — Configuration → Operational Intent → Operational Projections → Operational Facts (immutable) → Operational Consequences (financial) — is defined in **`platform/core/operational-truth-flow-doctrine.md`**. It locks: **Operational Projections are derived/non-authoritative** read models, while the **two authored ledgers — Operational Facts (observed, "what IS") and Operational Expectations (intended, "what SHOULD / WILL be") — are authoritative and neither is derived from the other** (the Operational Expectations two-ledger freeze; see **`platform/core/operational-expectations-system-design.md`**); financials derive from facts (billing generalizes before childcare billing); facts are immutable + effective-dated; childcare builds only on the committed enrollment foundation; job-vertical schedule/financial tables are off-limits to childcare.

**Canonical interaction model:** The single operator spine every domain inherits — **Workspace → Perspective → Queue → Row → Drawer → Context Frame → Mode → Card → Section → Field** — plus the one universal drawer (Record of Truth / Record of Attention / Context Frame) is defined in **`platform/operator/canonical-interaction-model.md`**, with laws in **`platform/operator/interaction-grammar.md`** and the lived flow in **`platform/operator/operator-story.md`**. How that model should **look and feel** (the bridge into mockups) is **`platform/operator/alloy-visual-language.md`**.

**Runtime Specification (read before building any operational domain):** The synthesis of all interaction/visual doctrine into one implementation-ready spec is **`platform/operator/alloy-runtime-specification.md`**. *The Runtime Specification is the implementation bridge between doctrine and visual mockups* — it freezes behavior; mockups express it; implementation expresses the mockups.

**Runtime Surface Section Map (diagnostics):** Every visible region of the Work Unit and Workspace surfaces has a stable section id (`WU-00`…`WU-15`, `WS-00`…`WS-10`) with owner, data source, cache, and blocking/snapshot contract in **`platform/operator/runtime-surface-section-map.md`** (code source of truth: `web/lib/perf/alloySectionMap.ts`). Use `data-alloy-section-id` and `[perf:section]` logs to diagnose load/reveal issues by section id.

**Surface ViewModel Composition (ownership):** Each route composes one above-fold Surface ViewModel that owns readiness; components present its sections and never decide surface readiness. See **`platform/operator/surface-view-model-composition.md`** for the shell-nav / `/workspace` / work-unit commit contracts (code: `web/lib/adminV2/runtime/surface/*`) and what patches quietly after commit.

**Alloy OS Runtime V1 (architecture complete — June 2026):** The operator runtime is architecturally finished. Surface ViewModels are the presentation ownership model, runtime ownership is consolidated (one authoritative renderer per region), **Queue → Focus Panel** is the canonical operating model, the **Focus Panel shell owns subject identity** (clicked-row seed commits synchronously; cards hydrate after shell commit). Remaining work is **product completion and polish** — final card implementations, KPI ownership completion, Experience Builder integration, embedded-workspace completion, and Runtime Polish V2 — **not** architectural redesign. Milestone notes: **`platform/operator/alloy-runtime-specification.md`** (Part 16).

**Presentation Runtime V2 (canonical, July 2026):** Shipped unifying presentation architecture — **`platform/experience/presentation-runtime-v2.md`**. Supersedes the June 2026 design-stage umbrella (archived at `archive/2026-06-presentation-runtime/`). Full sprint history: `sprints/archive/06_2026/presentation-runtime-architecture/`.

**Experience Builder V3 — Universal Surface Composition (frozen, July 2026):** The composition model that unifies every builder — `Surface → Canvas → Component → Evidence Group → Composition Item` (a **Card is one Component type**), with **Expanded = Open Surface** (nested via `openSurfaceId`) — is frozen in **`platform/operator/experience-builder-v3-universal-surface-composition.md`**. The /surfaces builders now author real, persisted configuration for it (stacked queue rows, grain/conditions, custom fields by namespace, nested surface editing for Children + Financial Configuration). **Presentation Runtime adoption starts from `platform/operator/presentation-runtime-carry-forward.md`** — what the live runtime must consume, the deferral list, and what it must NOT redesign. PRs #61/#63/#64/#68.

**Runtime Realization — the governing Runtime corpus (July 2026):** The Runtime's constitutional authority. **`platform/runtime/runtime-realization-architecture.md`** is the **Alloy Operating System Constitution** (canonical) — read it first. The **Kernel** (`platform/runtime/alloy-runtime-kernel.md`) defines the four runtime authorities **K1 Attention · K2 Provisioning · K3 Focus · K4 Instrumentation**; the **Engineering Specification** (`platform/runtime/runtime-realization-engineering-specification.md`) expresses K1–K4 as buildable structure; the **Implementation Authorization Package** (`platform/runtime/runtime-implementation-authorization.md`) carries the **ratified Work Unit contracts** — Operational (U-O1…U-O7), Preparation (U-P1…U-P7), Retention (U-R1…U-R8), Settlement (U-S1…U-S9) — the operator budgets, and the D1–D7 sequence. Provenance for the Constitution's ratification is **`platform/runtime/runtime-constitution-ratification-review.md`**. Product semantics are **not** owned here: the Runtime expresses **Record of Truth / Record of Attention / Context Frame** as defined in **`platform/operator/canonical-interaction-model.md`**.

**Operational Expectations — two-ledger architecture (frozen, July 2026):** The platform's authored operational truth is **two ledgers** — **Operational Facts** (observed) and **Operational Expectations** (intended) — with everything else (Judgment, Gap, Projection, Scheduling, Forecasting, Billing) **derived**. Architecture is frozen; implementation is sequenced P0–P8. Frozen corpus: **`platform/core/operational-expectations-system-design.md`** (system design + §0.5 reconciliation), **`platform/milestones/operational-expectations-architecture-closeout.md`** (freeze), **`platform/milestones/operational-expectations-doctrine-convergence.md`** (terminology sweep), **`platform/milestones/operational-expectations-engineering-realization.md`** (the implementation contract), **`platform/milestones/operational-expectations-implementation-program.md`** (execution index), **`platform/milestones/operational-expectations-p0-substrate-reconciliation.md`** (P0 / G-Reconciliation certification), and **`platform/milestones/operational-expectations-p1-certification.md`** (P1 / M1 certification — the append-only ledger, the one authoring intake, Authority→Standing, revision/correction effectivity). **P0 and P1 are complete;** authoring is server-side and flag-gated `oe.ledger.author` **OFF** by default with no operator surface, and Judgment/Gap (P3) onward are not started — so the capability is **not yet operational** (that is M7).

**Organization Configuration product realization (July 2026):** Programs, Locations, Financials, Access (UI), Business Processes, Surfaces, and Data Model share Collection → Selected → Focused workspace under `/organization/*`. Closeout: **`platform/milestones/organization-configuration-product-realization-closeout.md`**.

**BOS Command Runtime Convergence (Mission 1 — frozen, July 2026):** Business Process selects effective Commands; BOS prepares and confirms; shared bridge invokes Command Runtime once; domain executors own writes. Standalone Organization Commands product rejected; Surfaces do not configure Commands. Closeout: **`platform/milestones/bos-command-runtime-convergence-closeout.md`**.

**Operational Intelligence Platform V1 (frozen, July 2026):** Questions → Measurements → Definitions → Answers. Consumers present **Answers** (not Measurements). Freeze: **`platform/milestones/Operational-Intelligence-Platform-V1-Certified.md`**. Product closeout: **`sprints/07_2026/operational-intelligence-expansion/OPERATIONAL-INTELLIGENCE-PLATFORM-V1-COMPLETE.md`**. Phase 2 consumption: **`sprints/07_2026/operational-intelligence-expansion/PHASE-2-CONSUMPTION-MODEL.md`**. Module: **`platform/modules/operational-intelligence-platform.md`**.

**Trust Platform (publication in progress, August 2026):** Alloy’s cognitive platform for **trusted operational reasoning** — not an AI/prompt/model layer. Entry: **`platform/trust/trust-platform.md`**. Corpus index: **`platform/trust/README.md`**.

---

## What Alloy is

A configurable operating system for service businesses. Primary documentation is **industry-agnostic**; childcare enrollment appears as a reference implementation in supplemental docs.

**Onboarding entry:** **[`platform/foundation/alloy-platform-handbook.md`](platform/foundation/alloy-platform-handbook.md)**  
Then: **`platform/foundation/system-overview.md`**

---

## Load order (onboarding)

**Agent load order (Cursor / AI):** start at `docs/README.md`, then the **Platform Handbook**, then foundation → core → operator → modules → governance → schema. (Cursor rule load order still names the encyclopedia chain after the handbook.)

### 1. Foundation

0. `platform/foundation/alloy-platform-handbook.md` — **Alloy Platform Handbook** (teach the platform first)
0a. `platform/foundation/platform-decisions.md` — **Platform Decisions** (durable cross-platform decisions + rationale)
1. `platform/foundation/system-overview.md`
2. `platform/foundation/platform-capabilities.md`
3. `platform/foundation/product-roadmap.md`
4. `platform/foundation/architecture.md`
4a. `platform/foundation/os-runtime-map.md` — **OS Runtime Map** (the nine runtime layers — Kernel · Intent · Navigation · Experience · Surface · Card · Record · Entity · Operational/BOS — the three flows, the **client/server seam**, the **Effects/Integration** service, and the Architecture Evolution & Known Gaps appendix)
5. `platform/governance/glossary.md`

### 2. Core platform

6. `platform/core/business-process-system.md` — **operator model: Business Process → Stage → Record**
7. `platform/core/entity-model.md`
8. `platform/core/placement-system.md` — **School → Program → Room; lead vs child authority**
9. `platform/core/navigation-and-workspace-doctrine.md` — **Alloy Operational Workspace Doctrine V2** (frozen July 2026; reference: Processing; certified: Communications, Work Items; barrel: `web/components/workspace/doctrine.ts`)
10. `platform/core/record-system.md`
11. `platform/core/status-and-state-system.md`
11a. `platform/core/data/README.md` — **canonical data-contract layer** (data system, field catalog, status architecture)

### 3. Operator experience

11. `platform/core/operational-ux-doctrine.md` — **operational UX architecture / surface axis** (five planes, Operations/Records, progressive drawers, tabs vs actions)
11b. `platform/core/operational-truth-flow-doctrine.md` — **truth-flow axis** (Configuration → Intent → Projections → Facts → Consequences; complementary to the planes)
12. `platform/operator/canonical-interaction-model.md` — **canonical interaction spine** (Workspace → … → Field; one universal drawer)
13. `platform/operator/interaction-grammar.md` — **interaction laws** (records own truth, projections observe, cards talk through records)
14. `platform/operator/operator-story.md` — **lived operator experience** (open → work → interrupt → return)
15. `platform/operator/alloy-visual-language.md` — **visual doctrine** (how the model looks/feels; bridge into mockups)
16. `platform/operator/alloy-runtime-specification.md` — **runtime specification** (synthesis; read before building any domain)
17. `platform/operator/alloy-os-runtime-completion.md` — **Runtime Completion & Freeze** (✅ runtime complete; ownership matrix, config handoff, final verdict — start here for runtime status)
16a. `platform/operator/operational-grammar.md` — **Alloy Operational Grammar** (foundation: operators answer operational questions; cards are answers; platform hierarchy)
16b. `platform/operator/card-language.md` — **Alloy Card Language** (how every card behaves: anatomy, evidence hierarchy, density, interaction, color)
16c. `platform/operator/universal-card-archetypes.md` — **Alloy Card Archetypes** (reusable operational patterns; Identity = Household reference card)
16d. `platform/operator/operational-context-boundary.md` — **Operational Context Boundary** (runtime spine: Queue → Operational Context → Focus Panel → Cards; replaces "drawer" as the conceptual boundary)
16e. `platform/operator/household-reference-card.md` — **Household Reference Card** (Identity archetype **design freeze**: all states/densities, interaction + performance models, visual hierarchy, mock challenges)
16f. `platform/operator/focus-panel-runtime-cutover-report.md` — **Focus Panel Runtime Cutover** (migration report: one Focus Panel; drawer dependency ledger classified internal-compat vs needs-migration; staged removal D0→G)
16g. `platform/operator/card-composition-system.md` — **Card Composition System** (the layer between cards and Experience Builder: operational weight Heavy/Medium/Light, preferred partners, surface-owned composition, the balancing layout engine, side-by-side/stacked/full-width rules)
17. `platform/operator/universal-card-system.md` — **Universal Card System** (System 4 design freeze)
18. `platform/operator/operational-surface-design-system.md` — **Operational Surface Design System** (System 5 — **approved/frozen** June 2026)
19. `platform/operator/universal-card-archetypes.md` — **Universal Card Archetypes** (System 5A — implemented)
20. `platform/operator/card-interaction-expansion-doctrine.md` — **Card Interaction & Expansion** (System 5B — doctrine; expansion not fully built)
21. `platform/operator/card-content-template-field-inclusion-doctrine.md` — **Content Templates & Field Inclusion** (System 5C — doctrine; templates not fully built)
22. `platform/operator/focus-panel-edit-information-doctrine.md` — **Focus Panel** edit law + **implementation freeze**
23. `platform/operator/focus-panel-architecture-vocabulary.md` — **Focus Panel architecture vocabulary** (Operational Subject, Subject Composition, Embedded Workspace; drawer = infra)
24. `platform/operator/operational-mode-default-state-doctrine.md` — **Operational Mode as Default State** (approved/frozen)
25. `platform/operator/workspace-v3-command-center-doctrine.md` — **Workspace V3 — Operational Command Center** (Rev 2 — four zones, progressive depth, enterability)
26. `platform/operator/workspace-v3-operational-surface-doctrine.md` — **Workspace V3 — Operational Surface launcher** (storytelling, Work View deep links)
26a. `platform/operator/configuration-workspace-platform-doctrine.md` — **Configuration Workspace Platform Doctrine** (canonical owner of every configuration workspace: operators operate configuration objects; object model, workspace anatomy, two-status model, business-language & inheritance doctrine; **reference impl = Locations**; supersedes the `system/` configuration-workspace docs)
26b. `platform/operator/configuration-workspace-visual-language.md` — **Configuration Workspace Visual Language** (why configuration feels calm/object-shaped/consequence-first; extends `alloy-visual-language.md`)
26c. `platform/operator/configuration-workspace-component-library.md` — **Configuration Workspace Component Library** (platform primitives: Object Header, Operational Summary, Attention Panel, Setup Progress, Inline Property, Focused Editor, Consequence Sentence, Inherited Value, Configuration Dialog, …)
26d. `platform/operator/access-product-ui.md` — **Access product UI** (Users / Roles / Access Scopes / Security; UI realized; runtime deferred)
26e. `platform/operator/business-processes-product-ui.md` — **Business Processes product UI** (Collection → Selected Process → Focused workspace; UI realized)
26f. `platform/operator/surfaces-product-ui.md` — **Surfaces product UI** (Edit-first; collapsible inspector; tab-row Save/Publish; publication in collection list — **realized** July 2026)
26g. `platform/operator/data-model-product-ui.md` — **Data Model product UI** (Entity-centric IA; Definition/Usage/History for child objects; Operational Calculations deferred — **realized** July 2026)
27. `platform/operator/queue-system.md`
28. `platform/operator/drawer-system.md`
29. `platform/operator/drawer-sunset-roadmap.md` — **Drawer Sunset & Focus Panel Convergence** (sunset status matrix, freeze rule, editing-gap blocker, Household-then-Children targets — convergence lock)
30. `platform/operator/operational-action-doctrine.md` — **Operational Actions** (status via action pipeline; Manage/rail catalog alignment; invariant example)
30a. `platform/operator/action-system.md` — **Action System** (canonical entry-point inventory, registry alignment, Current Work consumption contract)
30b. `platform/operator/current-work-surface.md` — **Current Work Surface** (Summary/Focus operational progression; V1 merged staging)
30c. `platform/operator/actions-current-work-alignment.md` — **Actions ↔ Current Work Alignment** (surface roles, V1/P2 plan)
31. `platform/operator/experience-builder-doctrine.md` — LayoutDoc, builder, queue v3, actions/widgets
32. `platform/operator/archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md` — **Presentation Runtime** (unifying umbrella: Design Surfaces, Experience Builder, renderer-first model, three axes — composition/Perspective/Viewpoint, Analytics-as-Dashboard, ownership + lifecycle; design stage)
33. `platform/operator/business-process-layout-assignments.md` — BP stage layout routing

### 4. Platform modules (load when touching area)

| Module | Doc |
|--------|-----|
| Documents & forms | `platform/modules/documents-and-forms.md` |
| Communications | `platform/modules/communications-platform.md` |
| Communications Identity (foundational) | `platform/modules/communications-identity-platform.md` |
| Actions & workflows | `platform/modules/actions-and-workflows.md` |
| Configuration | `platform/modules/configuration-platform.md` |
| Attendance (L4 facts — doctrine) | `platform/modules/attendance-system.md` |
| Financial platform domain (canonical entities — frozen) | `platform/modules/financial-platform-domain.md` |
| Billing & financials platform (L5 — doctrine) | `platform/modules/billing-financials-platform.md` |
| Trust Platform (cognitive / reasoning) | `platform/trust/trust-platform.md` — corpus index `platform/trust/README.md` |
| AI / BOS | `platform/modules/ai-platform.md` |
| Operational intelligence | `platform/modules/operational-intelligence-platform.md` |

### 5. Governance & standards

| Topic | Doc |
|-------|-----|
| Design & operational doctrine | `platform/governance/design-and-operational-doctrine.md` |
| Documentation rules | `platform/governance/documentation-governance.md` |
| Agent repo boundaries | `platform/governance/agent-repo-boundaries.md` |
| **Director attention model** | `platform/governance/director-attention-model.md` |
| **Managed sprint operations** | `platform/governance/managed-sprint-operations.md` |
| Engineering Health (disk/Docker/caches) | `platform/governance/engineering-health.md` |
| Workspace orchestration | `platform/governance/workspace-orchestration.md` |
| API contracts | `platform/governance/api-contracts.md` |
| **API documentation (full inventory)** | `api/README.md` — per-domain reference + generated route index + audit |
| Roles & permissions | `platform/governance/roles-and-permissions.md` |
| Implementation patterns | `platform/governance/implementation-patterns.md` |
| Deployment | `platform/governance/deployment-and-environments.md` |
| Testing | `platform/governance/testing-and-quality.md` |

### 6. Roadmap & history

- `platform/foundation/product-roadmap.md` (also in §1)
- `platform/foundation/release-history.md`

### 7. Schema (when touching DB / RLS / triggers)

1. `schema/schema-tables.md`
2. `schema/schema-columns.md`
3. `schema/schema-constraints.md`
4. `schema/schema-indexes.md`
5. `schema/schema-functions.md`
6. `schema/schema-triggers.md`
7. `schema/schema-policies-and-security.md`

**Regenerate:**

```bash
DATABASE_URL=... npm run export:supabase-schema
node scripts/generate-schema-docs.mjs
```

CSV source: `supabase/reference/*.csv` (8 files)

---

## Locked runtime doctrines (do not duplicate)

| Topic | Doc |
|-------|-----|
| AdminV2 reveal / performance gates | `system/adminv2-runtime-performance-doctrine.md` |
| Platform performance passes | `system/platform-performance-doctrine.md` |
| Work unit page layout (V3) | `system/work-unit-layout-doctrine.md` |
| Queue record row layout | `system/queue-record-doctrine.md` |
| BOS visual identity | `system/bos-identity-doctrine.md` |
| Routing detail | `system/routing-doctrine.md` |
| Drawer VM contracts | `system/drawer-doctrine.md`, `drawer-operating-model-v1.md`, `drawer-view-model-runtime-contract.md` |
| Operating Plan runtime | `system/operating-plan-runtime-doctrine.md` |
| Configuration Runtime (Configuration IA) | `system/configuration-runtime-design-alignment.md` |
| Configuration Mode doctrine (frozen) | `system/configuration-mode-doctrine.md` |
| Configuration Runtime V1 (frozen) | `system/configuration-runtime-v1.md` |
| Organization Configuration Runtime V2 (frozen) | `system/organization-configuration-runtime-v2.md` |
| Configuration Runtime sprint closeout | `sprints/archive/06_2026/configuration_runtime_sprint_completion.md` |
| Legacy inventory | `system/legacy-architecture-inventory.md` |

---

## Supplemental (vertical / expanded reference)

| Doc | Use |
|-----|-----|
| `product/crm-system.md` | Enrollment pipeline grain detail (childcare) |
| `system/README.md` | **Locked runtime tier index** — authoritative implementation detail |
| `system/*` (remaining) | Locked runtime implementation detail |

---

## Documentation tiers

| Tier | Path | Rule |
|------|------|------|
| Canonical doctrine | `platform/` | Current truth only |
| Data contracts | `platform/core/data/` | SSOT for business facts |
| Milestones | `platform/milestones/` | Certification / freeze records |
| RFCs | `platform/rfcs/` | Ratified proposals |
| Locked runtime | `system/` | Implementation contracts |
| Generated | `schema/`, `api/` | Machine-produced |
| Vertical | `product/` | Childcare reference only |
| Execution | `sprints/{active,completed,archive}/` | Not doctrine |
| Investigations | `audits/{active,archive}/` | Point-in-time |
| Historical | `archive/` | Superseded material |

---

## Sprints, audits, archive

| Location | Purpose |
|----------|---------|
| `sprints/active/` | In-flight initiatives |
| `sprints/completed/` | Shipped closeout summaries |
| `sprints/archive/` | Historical sprint artifacts (`05_2026` … `08_2026` month folders) |
| `audits/active/` | Living investigations |
| `audits/archive/` | Closed audits |
| `archive/` | Superseded docs — not current truth |

**July 2026 documentation architecture planning** (historical):

- `audits/documentation-initiative-handoff-2026-07.md`
- `audits/documentation-architecture-audit-2026-07.md`
- `audits/documentation-migration-blueprint-2026-07.md`

**June 2026 rebaseline audit (prior art):** `audits/archive/2026-06-doc-rebaseline/`

**Agent development:** [`platform/governance/agent-repo-boundaries.md`](platform/governance/agent-repo-boundaries.md) · **Managed sprints:** [`platform/governance/managed-sprint-operations.md`](platform/governance/managed-sprint-operations.md)

**Documentation validation:** `npm run docs:lint` from repository root — see `scripts/README-docs-lint.md`

---

## Current platform direction (June 2026)

Alloy is moving from "Enrollment CRM + configured drawers" toward a **universal operational platform** standardizing on the canonical interaction spine (**Workspace → Perspective → Queue → Row → Drawer → Context Frame → Mode → Card → Section → Field**). Enrollment is the reference implementation; **Billing is the validation case**; Attendance and Scheduling should fit with no new paradigm. Mockups should derive from doctrine (`platform/operator/canonical-interaction-model.md`), and future implementation should refactor **toward shared primitives**, not one-off screens. Doctrine, current implementation, and gaps are tracked separately in that doc.

## Active initiatives (June 2026)

See `sprints/active/README.md` and `platform/foundation/product-roadmap.md`.

**Experience Builder backlog:** `sprints/active/experience-builder-framework-backlog.md`

**Childcare operational enrollment V1 (flag-gated):** post-approval operational layer — `child_enrollment_agreements`, effective-dated `child_placements` and `schedule_assignments`, approve-handoff from enrollment proposals, and operator edit flows (placement/schedule supersede; agreement ending/ended/cancel). See `sprints/archive/06_2026/childcare_operational_enrollment_batches.md` and `platform/core/placement-system.md`.

---

## When this README must be updated

Canonical path changes, new frozen doctrine files, consolidation moves, or schema regeneration workflow changes.
