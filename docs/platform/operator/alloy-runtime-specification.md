# Alloy Runtime Specification — First Edition

**Status:** Canonical synthesis (June 2026). **Implementation-ready runtime specification.**

This is **not** another doctrine document. It is the **synthesis** that converts approved doctrine into one specification used **before implementing any operational domain**. It freezes *behavior*; mockups express it; implementation expresses the mockups.

**Audience:** future Alloy engineers, Cursor implementation sessions, future UX work, future platform contributors.

> **The Runtime Specification is the implementation bridge between doctrine and visual mockups.**

**Source doctrine (canonical — do not rewrite; this doc synthesizes them):**

| Doctrine | Role |
|----------|------|
| [Canonical Interaction Model](./canonical-interaction-model.md) | Primitives (the spine) |
| [Interaction Grammar](./interaction-grammar.md) | Laws (ownership + movement) |
| [Operator Story](./operator-story.md) | Lived experience |
| [Alloy Visual Language](./alloy-visual-language.md) | Look & feel (mockup bridge) |
| [Operational UX Architecture](../core/operational-ux-doctrine.md) | Planes / domains share one architecture |

> **Vocabulary note:** **Subject** and **Mission** are the operator-facing names for what the Canonical Interaction Model calls **Record of Attention** and **Context Frame** (both now in the glossary). **Summary / Work / Activity** are the **canonical runtime vocabulary** for the three drawer **Modes** (earlier drafts used Overview / Operations / Activity). The concepts are identical across docs. See [Part 2](#part-2--runtime-spine).

> **Runtime diagnostics:** every visible surface region has a stable section id (`WU-00`…`WU-15`, `WS-00`…`WS-10`). See the [Runtime Surface Section Map](./runtime-surface-section-map.md) for owners, data sources, blocking/snapshot contracts, and the `data-alloy-section-id` / `[perf:section]` diagnostics used during QA.

> **Surface ownership:** each route composes one above-fold **Surface ViewModel** that owns readiness; components present its sections. See [Surface ViewModel Composition](./surface-view-model-composition.md) for the `workspaceSurfaceReady` / `workUnitSurfaceReady` / shell-nav commit contracts and what patches after commit.

---

## Part 1 — Runtime Philosophy

Alloy is a **work-centric operational platform**.

- Operators move through **work**, not software.
- **Records** support work.
- **Cards** support decisions.
- **Configuration** expresses the platform.
- The **runtime remains universal** across every domain.

The runtime never exposes raw configuration as the primary experience. Operators see operational meaning; schema lives underneath.

---

## Part 2 — Runtime Spine

The canonical runtime hierarchy (frozen):

```
Workspace
  → Perspective
    → Queue
      → Row
        → Drawer
          → Subject
            → Mission
              → Summary / Work / Activity     (Modes)
                → Card
                  → Section
                    → Field
```

### Subject and Mission

| Term | Means | Doctrine equivalent |
|------|-------|---------------------|
| **Subject** | *Who/what* the operator is working on | Record of Attention |
| **Mission** | *Why* they are here right now | Context Frame |

**Example:**

```
Subject:  Wright Family
Mission:  Today's Tour
```

The **same Subject** can be reused across **different Missions** — the Wright Family opened from *Today's Tour* vs. from *Failed Payment* is the same Subject with a different Mission, leading with different modes and cards. The underlying **Record of Truth** is unchanged (see Canonical Interaction Model § The drawer carries three concepts).

### Modes

| Mode | Purpose |
|------|---------|
| **Summary** | Ambient understanding of current operating state |
| **Work** | Active operational surfaces (cards) for the work in play |
| **Activity** | History / timeline of facts |

Per-domain operational surfaces (Billing, Attendance, Schedule, Placement) appear as **cards within Work** — never as separate drawer products. Progressive Hidden / Startable / Active states carry forward unchanged from `../core/operational-ux-doctrine.md`.

### Work Unit entry (Operational Mode — default state)

When an operator opens a Work Unit, the runtime **does not** land in a full-width browsing queue.

**Canonical entry flow:**

```
Resolve Perspective → Resolve Queue → Resolve Default Operational Subject → Open Focus Panel
```

Operational Mode (condensed queue + resolved subject + open Focus Panel) is the **only normal operator state**. Full-width expanded queue and Browse Mode are **retired from active UX** — implementations remain as dormant infrastructure.

Detail: [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md).

---

## Part 3 — Universal Workspace

**Purpose:** The operator's home for getting work done — begins with *work*, not with a thing.

**Responsibilities:** surface what needs attention; route operators into queues and records; preserve scope and context across the session.

**Anatomy:**

| Element | Role |
|---------|------|
| **Navigation** | Business processes + groups; Home → workspace. Not department-first. |
| **KPIs** | At-a-glance health/throughput strip; reads facts, never authors them. |
| **Perspective rail** | The operating lenses available (Today's Tours, Failed Payments, …). |
| **Queue** | Preview/selection surface for the active perspective. |
| **Drawer relationship** | Selecting a row opens the drawer **in place** — workspace does not remount. |
| **Search** | Jump to any subject; opens the same universal drawer. |
| **Bulk actions** | Multi-row operator intent through the canonical action path. |
| **Empty states** | Intentional, not broken — communicate "nothing needs you here." |

No implementation details here — see `../core/navigation-and-workspace-doctrine.md`.

---

## Part 4 — Universal Queue

**Purpose:** A preview/selection lens for a perspective. Queues **do not own data** (Interaction Grammar law 3).

| Aspect | Specification |
|--------|---------------|
| **Queue grammar** | Filter · sort · group · select · navigate. Never business logic, workflows, financial math, or identity resolution. |
| **Row hierarchy** | Lead with recognition + state (meaning before fields); enough to pick, never the source of truth to act. |
| **Selection** | Single select → drawer; multi-select → bulk action. On Work Unit open, runtime resolves **Default Operational Subject** (strategy-driven) — not arbitrary “first row.” |
| **Default subject** | Each Work Unit owns a **Default Operational Subject Strategy** (e.g. Highest Priority, Largest Balance). Platform resolves active row; Focus Panel opens automatically. |
| **Strategy override** | Operator may temporarily change strategy from queue header — reorders queue, re-resolves subject, updates Focus Panel; does not persist to Work Unit config. |
| **Bulk actions** | Explicit operator intent across selected rows. |
| **Previous / Next** | Follows the **current filtered & sorted queue** — not the underlying table (law 8). |
| **Relationship to drawer** | Row → drawer in place; queue context preserved (law 7). |
| **Relationship to perspectives** | A queue is the materialization of the active perspective's lens. |
| **Relationship to KPIs** | KPIs summarize the cohort; the queue is the workable list. |
| **Relationship to Mission (Context Frame)** | The perspective the row was opened from sets the Subject's Mission in the drawer. |

Detail: `./queue-system.md`, `../core/record-system.md`.

---

## Part 5 — Universal Drawer

There is **one universal drawer**. It is an operating surface, not a form, and **never becomes a separate product** per entity.

| Layer | Specification |
|-------|---------------|
| **Drawer shell** | Persistent chrome that preserves workspace/perspective/queue context. |
| **Subject** | Who/what is being worked (Record of Attention). |
| **Mission** | Why it was opened now (Context Frame) — sets which mode/cards lead. |
| **Current business state** | The headline operating state, surfaced before fields. |
| **Primary action** | The expected next move, always discoverable (actions never hidden by hidden surfaces). |
| **Summary (mode)** | Ambient understanding. |
| **Work (mode)** | Active operational cards. |
| **Activity (mode)** | History / timeline. |

**Invariants:**

- The drawer **preserves workspace context** — opening/closing returns the operator exactly where they were.
- The drawer **never becomes a separate product** — Opportunity, Person, Child, Billing Account, Attendance Event, and Location remain records, but the *experience* is one contextual drawer.
- Chrome makes the active context obvious: Subject, Mission, source perspective, active location/scope, Previous/Next, primary action, attention/risk state.

Detail: `./drawer-system.md`, Canonical Interaction Model.

---

## Part 6 — Screen Grammar

Every screen inherits the same information hierarchy:

```
Situation   →   what's going on
  Decision  →   what must be decided
  Action    →   what to do about it
  Detail    →   the supporting specifics
  History   →   what happened before
```

Situation and Decision lead (business meaning first). Detail and History support. A screen that opens on Detail (raw fields) before Situation violates the grammar.

---

## Part 7 — Universal Card System

Cards are **reusable business primitives** that answer a business question — not field groups. **Platform owns the card anatomy and hierarchy; configuration owns composition.**

### Universal card anatomy

| # | Element | Answers |
|---|---------|---------|
| 1 | **Card Identity** | What card is this? |
| 2 | **Business State** | What state is it in? (ready / blocked / at-risk / done) |
| 3 | **Business Meaning** | What does that mean for the operator? |
| 4 | **Primary Action** | What's the expected next move? |
| 5 | **Supporting Detail** | The specifics that back the meaning. |
| 6 | **Metadata** | Quiet context (dates, ids, source). |
| 7 | **Related Actions** | Secondary moves. |

### Card tiers (importance, platform-owned)

| Tier | Name | Role |
|------|------|------|
| **Tier 1** | **Mission Cards** | Directly serve the current Mission — lead the Work mode. |
| **Tier 2** | **Context Cards** | Adjacent operational context for this Subject. |
| **Tier 3** | **Reference Cards** | Stable supporting facts (identity, placement reference). |
| **Tier 4** | **Historical Cards** | Timeline / past facts. |

**Ownership:** Platform owns the tier **hierarchy**; configuration owns **composition** (which cards, and order *within* a tier). See [Part 11](#part-11--runtime-hierarchy) and [Part 12](#part-12--platform-vs-configuration).

---

## Part 8 — Card Blueprint Library

The platform owns **blueprint types**. Business domains **configure** them; they are **not** domain-specific implementations.

| Blueprint | Business question it answers | Example domain expressions |
|-----------|------------------------------|----------------------------|
| **Readiness** | Is this ready? what's missing? | Enrollment Readiness, Compliance Readiness |
| **Decision** | What must be decided now? | Placement decision, Approval |
| **State** | What is the current operating state? | Enrollment state, Agreement state |
| **Relationship** | Who are the people and their scoped authority? | Family, Guardians, Payers |
| **Work** | What work remains on this subject? | Operational Work, Tasks |
| **Timeline** | What happened, in order? | Activity, Attendance history |
| **Financial** | What is owed / paid / set up? | Billing Setup, Balance, Funding |
| **Capacity** | How full / what's the room? | Room capacity, Program fill |
| **Communication** | What's been said, to whom? | Communications, Outreach |

A blueprint composes from **record truth** and is reusable across drawer, queue snapshot, planning, analytics, reports, and BOS (Interaction Grammar laws 4–5). Domains supply data bindings, rules, and labels — not new card runtimes.

---

## Part 9 — Platform Inputs

Input primitives must be **platform-owned components**, consistent across every domain — not repeated per surface.

| Input | Notes |
|-------|-------|
| Date picker | Platform primitive (currently cumbersome — see gaps) |
| Time picker | Platform primitive |
| Dropdown | Consistent styling/disabled/read-only affordance |
| Lookup | Entity reference selection |
| Relationship picker | Scoped relationship/authority selection |
| Person picker | Person identity selection |
| Money | Currency input |
| Phone | Phone input |
| Address | Address input |
| Status | Status control |

**Current UX alignment gaps (acknowledged, not yet closed):**

- Drawers feel too grid/form-like.
- Date/time controls feel cumbersome.
- Dropdown styling, background, font color, disabled state, read-only state, and editable affordance need platform-level consistency.
- Field density should be controlled intentionally.
- Modernizing these primitives is **not cosmetic** — it makes the runtime cohesive.

Mirrors `./alloy-visual-language.md` § 7 and Canonical Interaction Model § Known UX alignment gaps. These do **not** weaken locked runtime/performance doctrine.

---

## Part 10 — Runtime Motion

Motion exists to **preserve understanding**, not to decorate.

| Transition | Motion's job |
|------------|--------------|
| Queue → Drawer | Show focus into the selected subject without losing the queue. |
| Card expansion | Reveal detail in place; no layout jump. |
| Completion | Make the action feel resolved. |
| Previous / Next | Show progression through the current queue. |
| State transitions | Update state without disorientation. |
| Context preservation | Keep background context stable while focus shifts. |

Forbidden: flashing, layout jumps, skeleton morphing, sudden reordering, animations that delay work. Motion must respect atomic reveal / composed-payload readiness (`../../system/adminv2-runtime-performance-doctrine.md`).

---

## Part 11 — Runtime Hierarchy

The importance model is frozen:

```
Mission Cards
  ↓
Context Cards
  ↓
Reference Cards
  ↓
Historical Cards
```

- **Configuration MAY** reorder cards **inside** a tier.
- **Configuration MAY NOT** violate the tier hierarchy (a Reference card cannot outrank a Mission card).

This guarantees the operator always meets the work that matters first, regardless of tenant configuration.

---

## Part 12 — Platform vs Configuration

| Platform owns (universal, code) | Configuration owns (expression, tenant) |
|---------------------------------|------------------------------------------|
| Workspace shell | Card selection |
| Queue shell | Card ordering within tiers |
| Drawer shell | Field visibility |
| Modes (Summary / Work / Activity) | Rules |
| Card anatomy | Actions |
| Motion | Conditions |
| Interaction | Business process logic |
| Hierarchy (tiers) | Perspective definitions |
| Default Operational Subject Strategy (resolver catalog) | Work Unit default strategy selection (future) |
| Operational Mode entry flow | Operator strategy override (session-only, future) |
| Platform inputs | Tenant-specific behavior |

**Why this split matters:**

- It prevents **hardcoding**: the platform never bakes a domain's specifics into the shell, so new domains plug in as configuration + cards, not new products.
- It prevents **runaway configurability**: configuration can express, reorder, and gate — but cannot break the spine, the tier hierarchy, the card anatomy, or the input primitives. Code owns invariants; config steers (see `../modules/configuration-platform.md`).

---

## Part 13 — Runtime Validation

The runtime is universal only if every domain **inherits** it without a new paradigm. These are **not redesigns** — just inheritance statements.

| Domain | Perspective (example) | Subject | Mission | Lead Mission cards | Inherits |
|--------|------------------------|---------|---------|--------------------|----------|
| **Enrollment** (reference) | Today's Tours | Family | Tour | Readiness, Tour, Family | Full spine |
| **Billing** (validation) | Failed Payments | Family / billing account | Billing | Financial (Billing Setup, Balance) | Same shell |
| **Attendance** | Missing Check-ins | Child-day | Attendance | State, Timeline | Same shell |
| **Scheduling** | Schedule Conflicts | Child schedule | Schedule | Decision, State, Capacity | Same shell |
| **Staffing** | Coverage Gaps | Staff / shift | Staffing | Work, Capacity | Same shell |
| **Subsidy** | Renewals Due | Funding case | Subsidy | Readiness, Financial | Same shell |
| **Compliance** | Expiring Requirements | Requirement | Compliance | Readiness, Timeline | Same shell |
| **Transportation** | Route Exceptions | Route / rider | Transportation | State, Work | Same shell |
| **Meals** | Counts & Restrictions | Roster / child | Meals | State, Relationship (allergies) | Same shell |
| **Health** | Health Holds | Child health | Health & Safety | Readiness, Relationship | Same shell |

If any domain needs a different drawer product, navigation spine, or interaction model — fix the surface, not the runtime.

---

## Part 14 — Refactor Guidance

The runtime refactor expresses doctrine through existing primitives. **Goal: expression, not replacement.**

**Move toward:**

| From | To |
|------|----|
| Section-first rendering | **Card-first** rendering |
| Entity-first drawers | **Contextual** drawers (Subject + Mission) |
| Field-first layouts | **Business-first** layouts |
| Stage navigation | **Perspectives** |

**Do NOT rewrite stable platform primitives unnecessarily. Reuse:**

Business Processes · Experience Builder · Configuration · Operational Work · Communications · Workflows · Analytics · Forms · BOS · Entity model · Relationship model · Status system.

These are the substrate the runtime *expresses*. The refactor is a presentation/composition evolution on top of them, not a teardown.

---

## Part 15 — Relationship to Mockups

```
Runtime Specification   freezes     behavior
Mockups                 express     the Runtime Specification
Implementation          expresses   the mockups
```

No implementation or visual decision may **redefine the runtime**. If a mockup or implementation needs behavior this spec doesn't allow, the spec is amended first (through doctrine), then mockups, then code.

---

## Part 16 — Alloy OS Runtime V1 Milestone (June 2026)

**Status: Runtime V1 architecture complete.** The runtime is now considered architecturally
finished. Future work is **product completion and polish**, not runtime architecture. No new reveal
primitive, loader, cache layer, or coordination layer should be introduced to "fix" runtime feel —
the ownership model below is the answer.

**Presentation ownership model (canonical):** Each route composes one above-fold **Surface
ViewModel** (`shell_nav`, `workspace`, `work_unit`) that owns surface readiness; components present
its sections and never decide readiness independently. See
[Surface ViewModel Composition](./surface-view-model-composition.md). Runtime ownership has been
**consolidated** — for every visible region exactly one renderer is authoritative (no fallback +
legacy + metric + OIP + cache + payload owners competing for the same slot).

**Canonical operating model:** **Queue → Focus Panel.** The queue is a preview/selection surface; a
row click commits a **Subject** into the Focus Panel. The **Focus Panel shell owns subject
identity** — on click the selected-row seed becomes the visible subject **synchronously**, before
any payload resolves. The legacy drawer-title fallback is unreachable while a runtime subject is
selected. **Cards hydrate after the shell commits**, inside the already-switched shell; a slower or
stale payload can never change the visible subject identity (latest click wins).

### Completed

- Surface ViewModel architecture (presentation ownership)
- Queue-first operational mode
- Default operational subject (auto-open, manual-selection guarded)
- Focus Panel shell
- Subject identity ownership (seed-first, payload hydrates after commit)
- Runtime section map (`WU-00…`, `WS-00…` + `data-alloy-section-id` / `[perf:section]`)
- Runtime ownership cleanup (single authoritative renderer per region)
- Performance stabilization (coordinated reveal, prewarm throttling)
- Warm navigation (hold prior committed surface on warm transition)
- Resume affordance
- Idle session framework

### Remaining (intentional — completion & polish, not redesign)

- Final card implementations (System 5 archetypes/templates/content)
- KPI ownership completion (finish platform-placement convergence across all KPI slots)
- Experience Builder integration (runtime editing of surfaces/cards)
- Embedded workspace completion (Activity-mode embedded surfaces)
- Runtime Polish V2 (transition refinement only)

These items are feature completion and refinement on top of the frozen runtime spine. They do not
reopen the architecture.

---

## Cross-references

| Concern | Doc |
|---------|-----|
| Interaction primitives | [`./canonical-interaction-model.md`](./canonical-interaction-model.md) |
| Interaction laws | [`./interaction-grammar.md`](./interaction-grammar.md) |
| Lived operator experience | [`./operator-story.md`](./operator-story.md) |
| Visual doctrine | [`./alloy-visual-language.md`](./alloy-visual-language.md) |
| Planes / domains | [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) |
| Drawer / queue / record | [`./drawer-system.md`](./drawer-system.md), [`./queue-system.md`](./queue-system.md), [`../core/record-system.md`](../core/record-system.md) |
| Card / section / field authoring | [`./experience-builder-doctrine.md`](./experience-builder-doctrine.md) |
| Platform vs configuration | [`../modules/configuration-platform.md`](../modules/configuration-platform.md) |
| Relationship / location scope | [`../core/record-system.md`](../core/record-system.md), [`../core/placement-system.md`](../core/placement-system.md) |
| Capability / maturity status | [`../foundation/platform-capabilities.md`](../foundation/platform-capabilities.md) |

---

## When this doc must be updated

- The runtime spine, modes, card anatomy, tiers, or platform/configuration split changes.
- A new operational domain validates or breaks the runtime.
- A blueprint type or platform input is added/retired.
- Source doctrine changes in a way the synthesis must reflect.
