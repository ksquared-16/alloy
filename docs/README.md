# Alloy documentation

**Purpose:** Authoritative navigation for engineers, implementers, and AI agents. Prefer these files over chat memory or archived sprint material.

**June 2026 rebaseline:** Canonical platform docs live under **`docs/platform/`**. Schema reference under **`docs/schema/`** (generated). Business Process → Stage → Record is the operator mental model; work units are documented as runtime constructs.

For behavior-changing work, include **`docs/platform/governance/design-and-operational-doctrine.md`** in context.

**Cross-cutting UX model:** How every operational domain (Enrollment, Attendance, Scheduling, Billing, Staffing, Subsidy, POS, Capacity, Compliance) shares one architecture — five planes, Operations/Records split, progressive drawers, tabs-vs-actions — is defined in **`platform/operational-ux-doctrine.md`** (the **surface axis**).

**Cross-cutting truth model:** The complementary **truth-flow axis** — Configuration → Operational Intent → Operational Expectations (derived) → Operational Facts (immutable) → Operational Consequences (financial) — is defined in **`platform/operational-truth-flow-doctrine.md`**. It locks: expectations are derived/non-authoritative; financials derive from facts (billing generalizes before childcare billing); facts are immutable + effective-dated; childcare builds only on the committed enrollment foundation; job-vertical schedule/financial tables are off-limits to childcare.

**Canonical interaction model:** The single operator spine every domain inherits — **Workspace → Perspective → Queue → Row → Drawer → Context Frame → Mode → Card → Section → Field** — plus the one universal drawer (Record of Truth / Record of Attention / Context Frame) is defined in **`platform/operator/canonical-interaction-model.md`**, with laws in **`platform/operator/interaction-grammar.md`** and the lived flow in **`platform/operator/operator-story.md`**. How that model should **look and feel** (the bridge into mockups) is **`platform/operator/alloy-visual-language.md`**.

**Runtime Specification (read before building any operational domain):** The synthesis of all interaction/visual doctrine into one implementation-ready spec is **`platform/operator/alloy-runtime-specification.md`**. *The Runtime Specification is the implementation bridge between doctrine and visual mockups* — it freezes behavior; mockups express it; implementation expresses the mockups.

**Runtime Surface Section Map (diagnostics):** Every visible region of the Work Unit and Workspace surfaces has a stable section id (`WU-00`…`WU-15`, `WS-00`…`WS-10`) with owner, data source, cache, and blocking/snapshot contract in **`platform/operator/runtime-surface-section-map.md`** (code source of truth: `web/lib/perf/alloySectionMap.ts`). Use `data-alloy-section-id` and `[perf:section]` logs to diagnose load/reveal issues by section id.

**Surface ViewModel Composition (ownership):** Each route composes one above-fold Surface ViewModel that owns readiness; components present its sections and never decide surface readiness. See **`platform/operator/surface-view-model-composition.md`** for the shell-nav / `/workspace` / work-unit commit contracts (code: `web/lib/adminV2/runtime/surface/*`) and what patches quietly after commit.

**Alloy OS Runtime V1 (architecture complete — June 2026):** The operator runtime is architecturally finished. Surface ViewModels are the presentation ownership model, runtime ownership is consolidated (one authoritative renderer per region), **Queue → Focus Panel** is the canonical operating model, the **Focus Panel shell owns subject identity** (clicked-row seed commits synchronously; cards hydrate after shell commit). Remaining work is **product completion and polish** — final card implementations, KPI ownership completion, Experience Builder integration, embedded-workspace completion, and Runtime Polish V2 — **not** architectural redesign. Milestone notes: **`platform/operator/alloy-runtime-specification.md`** (Part 16).

**Presentation Runtime (unifying presentation architecture):** How every operator surface — queue row, Focus Panel, dashboard, document, POS, portal — becomes one **Design Surface** authored in one **Experience Builder**, built renderer-first on three axes (composition: Design Surface → Zone → Card → Slot → Renderer; selection: Perspective; audience: Viewpoint), with Analytics as a Dashboard category, is defined in **`platform/operator/presentation-runtime-doctrine.md`** (design stage). Full sprint: `sprints/06_2026/presentation-runtime-architecture/`.

---

## What Alloy is

A configurable operating system for service businesses. Primary documentation is **industry-agnostic**; childcare enrollment appears as a reference implementation in supplemental docs.

Start here: **`platform/foundation/system-overview.md`**

---

## Load order (onboarding)

**Agent load order (Cursor / AI):** matches **`.cursor/rules/alloy-project-context.mdc`** — start at `docs/README.md`, then foundation → core → operator → modules → governance → schema.

### 1. Foundation

1. `platform/foundation/system-overview.md`
2. `platform/foundation/platform-capabilities.md`
3. `platform/foundation/product-roadmap.md`
4. `platform/foundation/architecture.md`
5. `platform/governance/glossary.md`

### 2. Core platform

6. `platform/core/business-process-system.md` — **operator model: Business Process → Stage → Record**
7. `platform/core/entity-model.md`
8. `platform/core/placement-system.md` — **School → Program → Room; lead vs child authority**
9. `platform/core/navigation-and-workspace-doctrine.md`
10. `platform/core/record-system.md`
11. `platform/core/status-and-state-system.md`

### 3. Operator experience

11. `platform/operational-ux-doctrine.md` — **operational UX architecture / surface axis** (five planes, Operations/Records, progressive drawers, tabs vs actions)
11b. `platform/operational-truth-flow-doctrine.md` — **truth-flow axis** (Configuration → Intent → Expectations → Facts → Consequences; complementary to the planes)
12. `platform/operator/canonical-interaction-model.md` — **canonical interaction spine** (Workspace → … → Field; one universal drawer)
13. `platform/operator/interaction-grammar.md` — **interaction laws** (records own truth, projections observe, cards talk through records)
14. `platform/operator/operator-story.md` — **lived operator experience** (open → work → interrupt → return)
15. `platform/operator/alloy-visual-language.md` — **visual doctrine** (how the model looks/feels; bridge into mockups)
16. `platform/operator/alloy-runtime-specification.md` — **runtime specification** (synthesis; read before building any domain)
17. `platform/operator/alloy-os-runtime-completion.md` — **Runtime Completion & Freeze** (✅ runtime complete; ownership matrix, config handoff, final verdict — start here for runtime status)
16a. `platform/operator/operational-grammar.md` — **Alloy Operational Grammar** (foundation: operators answer operational questions; cards are answers; platform hierarchy)
16b. `platform/operator/card-language.md` — **Alloy Card Language** (how every card behaves: anatomy, evidence hierarchy, density, interaction, color)
16c. `platform/operator/card-archetypes.md` — **Alloy Card Archetypes** (reusable operational patterns; Identity = Household reference card)
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
27. `platform/operator/queue-system.md`
28. `platform/operator/drawer-system.md`
29. `platform/operator/drawer-sunset-roadmap.md` — **Drawer Sunset & Focus Panel Convergence** (sunset status matrix, freeze rule, editing-gap blocker, Household-then-Children targets — convergence lock)
30. `platform/operator/operational-action-doctrine.md` — **Operational Actions** (status via action pipeline; Manage/rail catalog alignment; invariant example)
31. `platform/operator/experience-builder-doctrine.md` — LayoutDoc, builder, queue v3, actions/widgets
32. `platform/operator/presentation-runtime-doctrine.md` — **Presentation Runtime** (unifying umbrella: Design Surfaces, Experience Builder, renderer-first model, three axes — composition/Perspective/Viewpoint, Analytics-as-Dashboard, ownership + lifecycle; design stage)
33. `platform/operator/business-process-layout-assignments.md` — BP stage layout routing

### 4. Platform modules (load when touching area)

| Module | Doc |
|--------|-----|
| Documents & forms | `platform/modules/documents-and-forms.md` |
| Communications | `platform/modules/communications-platform.md` |
| Actions & workflows | `platform/modules/actions-and-workflows.md` |
| Configuration | `platform/modules/configuration-platform.md` |
| Attendance (L4 facts — doctrine) | `platform/modules/attendance-system.md` |
| Financial platform domain (canonical entities — frozen) | `platform/modules/financial-platform-domain.md` |
| Billing & financials platform (L5 — doctrine) | `platform/modules/billing-financials-platform.md` |
| AI / BOS | `platform/modules/ai-platform.md` |
| Operational intelligence | `platform/modules/operational-intelligence-platform.md` |

### 5. Governance & standards

| Topic | Doc |
|-------|-----|
| Design & operational doctrine | `platform/governance/design-and-operational-doctrine.md` |
| Documentation rules | `platform/governance/documentation-governance.md` |
| Agent repo boundaries | `governance/agent-repo-boundaries.md` |
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
| Configuration Runtime (Settings IA) | `system/configuration-runtime-design-alignment.md` |
| Configuration Mode doctrine (frozen) | `system/configuration-mode-doctrine.md` |
| Configuration Runtime V1 (frozen) | `system/configuration-runtime-v1.md` |
| Configuration Runtime sprint closeout | `sprints/06_2026/configuration_runtime_sprint_completion.md` |
| Legacy inventory | `system/legacy-architecture-inventory.md` |

---

## Supplemental (vertical / expanded reference)

| Doc | Use |
|-----|-----|
| `product/crm-system.md` | Enrollment pipeline grain detail (childcare) |
| `product/billing-and-financials.md` | Billing maturity |
| `system/*` (remaining) | Transitional expanded references — prefer `platform/` |
| `core/system-overview.md` | Redirect — see platform foundation |
| `execution/roadmap-and-gaps.md` | Transitional detailed gap list |

---

## Sprints, audits, archive

| Location | Purpose |
|----------|---------|
| `sprints/active/` | In-flight initiatives (index) |
| `sprints/completed/` | Shipped closeout index |
| `sprints/archive/` | Historical sprint artifacts |
| `sprints/05_2026/`, `06_2026/` | **Transitional paths** — migrating to active/completed/archive |
| `audits/` | Point-in-time investigations |
| `archive/` | Superseded docs — not current truth |
| `export/` | Portable handoff packs |

**Agent development:** [`governance/agent-repo-boundaries.md`](governance/agent-repo-boundaries.md) — Cursor vs Claude repo separation, branching, merge flow

**Rebaseline audit:** `audits/documentation-audit.md`  
**Governance follow-up:** `audits/documentation-governance-followup.md`  
**Closeout:** `audits/documentation-closeout-report.md`

---

## Current platform direction (June 2026)

Alloy is moving from "Enrollment CRM + configured drawers" toward a **universal operational platform** standardizing on the canonical interaction spine (**Workspace → Perspective → Queue → Row → Drawer → Context Frame → Mode → Card → Section → Field**). Enrollment is the reference implementation; **Billing is the validation case**; Attendance and Scheduling should fit with no new paradigm. Mockups should derive from doctrine (`platform/operator/canonical-interaction-model.md`), and future implementation should refactor **toward shared primitives**, not one-off screens. Doctrine, current implementation, and gaps are tracked separately in that doc.

## Active initiatives (June 2026)

See `sprints/active/README.md` and `platform/foundation/product-roadmap.md`.

**Experience Builder / unified actions (shipped to staging):** layout library + BP assignment, queue v3 composer, relationship action framework, OCM-first enrollment status, Create Lead lifecycle binding, New Leads legacy alias compatibility. Backlog status: `backlog/experience-builder-framework-backlog.md`.

**Childcare operational enrollment V1 (flag-gated):** post-approval operational layer — `child_enrollment_agreements`, effective-dated `child_placements` and `schedule_assignments`, approve-handoff from enrollment proposals, and operator edit flows (placement/schedule supersede; agreement ending/ended/cancel). See `sprints/06_2026/childcare_operational_enrollment_batches.md` and `platform/core/placement-system.md`.

---

## When this README must be updated

Canonical path changes, new frozen doctrine files, consolidation moves, or schema regeneration workflow changes.
