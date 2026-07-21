---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Operational Planning Platform — architecture discovery (RFC)

**Status:** Proposed — Product Office / Chief Product Architect discovery artifact. Not doctrine until ratified. Scheduling is the proving ground; the platform architecture is the deliverable.

**One-sentence thesis.** Operational Planning is **not a new truth-flow layer and not a new product** — it is the maturation of Alloy's already-ratified **Planning *plane*** into a first-class **Planning *runtime***: a reusable `propose → simulate → optimize → commit` loop that composes primitives Alloy has already built, and that every future operational domain plugs into. Scheduling is its first complete expression.

> **Iteration-2 refinement (validated by inheritance).** Forcing this architecture to live inside the frozen Alloy workspace refined it in three ways, without breaking the thesis: (1) the loop is **design-time**, so it lives in **Studio, not Work** — and Studio itself is a reusable platform capability ([`studio-platform.md`](./studio-platform.md)); (2) the operator-facing identity is that **Alloy commits *plans*, not records** ([`architecture-validation.md`](./architecture-validation.md) §4); (3) Optimization is **futures generation + comparison**, not recommendation. Work reverts to the Alloy spine (Overview + Work Views + Focus Panel), so Scheduling is indistinguishable from Processing.

---

## 0. How to read this document

This is the spine of the discovery. It answers the sprint's core questions at the platform altitude and hands off the specifics to five companion docs:

| Companion | Owns |
|-----------|------|
| [`operational-plan-and-commit.md`](./operational-plan-and-commit.md) | The Operational Plan object and the Operational Commit lifecycle |
| [`operational-simulation.md`](./operational-simulation.md) | Operational Simulation as a reusable platform primitive |
| [`operational-optimization.md`](./operational-optimization.md) | Operational Optimization: candidate generation, ranking, consequences, BOS |
| [`scheduling-reference-implementation.md`](./scheduling-reference-implementation.md) | Scheduling as the first Planning plugin (product + domain + workspace model) |
| [`planning-focus-panel-evolution.md`](./planning-focus-panel-evolution.md) | The planning card, cross-domain planning, cross-workspace experience |
| [`platform-discoveries-and-roadmap.md`](./platform-discoveries-and-roadmap.md) | The running classification ledger, MVP/V2/V3 roadmap, doctrine updates |

Every claim about the existing platform is anchored to a canonical doc or a code path so this discovery can be audited against what is actually built.

---

## 1. The question the sprint asked, and the honest answer

The mission proposed a pipeline:

```
Configuration → Operational Planning → Operational Execution → Facts → Calculations → Expectations → Intelligence
```

and asked: **is Operational Planning a new platform layer?**

The disciplined answer, forced by Alloy's own frozen doctrine, is **no — and that constraint is the discovery.** Alloy already models its operating system on **two orthogonal axes** ([`operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md), [`operational-ux-doctrine.md`](../core/operational-ux-doctrine.md)):

- **Surface axis (planes)** — *where the operator stands when they act:* Configuration / **Planning** / Operations / Records / Intelligence-BOS.
- **Truth-flow axis (layers)** — *what is true and what it derives from:* L1 Configuration → L2 Intent → L3 Projections → L4 Facts → L5 Consequences.

Two ratified facts settle the layer question before we begin:

1. **"No sixth layer."** RFC D1 ([`operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md)) froze the truth-flow axis at five layers and ruled that *"Forecasting must live in the Planning plane over calculations, never as a store."* An Operational Planning **layer** is therefore doctrinally out of bounds.
2. **The Planning plane already exists — and is empty.** *"Planning models future state without committing changes… it proposes and explores, it does not write operational truth. Proposed/forecast state and committed state stay separate."* ([`operational-ux-doctrine.md`](../core/operational-ux-doctrine.md)). Forecasting is recorded as **Missing** in the expansion audit — doctrine reserved a room and never furnished it.

So the mission's "Operational Planning" is not a new layer to *insert*; it is the **Planning plane to finally *build*** — and to build it we discover it needs to be more than a forecast viewer. It needs to let an operator **author candidate change, see its consequences, choose the best option, and commit it.** That is a *runtime*, not a screen. Naming and extracting that runtime — and proving it against Scheduling — is this sprint.

> **Restated pipeline (corrected to Alloy's model).** Planning is a *plane* that operates a loop **over** the truth-flow layers: it drafts candidate **L2 Intent**, projects **L3** and **L5** to simulate, ranks with **BOS**, and **commits** by writing L2 Intent — after which Facts (L4) and Consequences (L5) flow through the existing pipeline unchanged. Planning sits *beside* Execution, not above a new layer of it.

---

## 2. The discovery: the Planning Runtime

**Operational Planning is a thin planning engine + per-domain planning plugins** — mirroring exactly how the Operational/BOS layer is defined as *"a thin engine + per-domain configuration/plugins… not a monolith"* ([`os-runtime-map.md`](../foundation/os-runtime-map.md)). The engine owns the loop; each domain (Scheduling first) contributes what a plan proposes, how it is projected, and what committing it writes.

### 2.1 The loop

```
        ┌───────────────────────────────────────────────────────────────┐
        │  L1 CONFIGURATION  (rules: ratios, capacity, schedule, rates)  │
        └───────────────────────────────────────────────────────────────┘
                                     │ read
        PLANNING RUNTIME (the Planning plane, made first-class)
        ┌───────────────────────────────────────────────────────────────┐
        │  ① PROPOSE   draft candidate L2 Intent — write-free            │
        │      → an Operational Plan (a bundle of proposed Intent deltas)│
        │  ② SIMULATE  project L3 + L5 over the proposed state           │
        │      → deterministic, write-free (the Preview primitive)       │
        │  ③ OPTIMIZE  generate + rank candidate Plans (BOS proposes)    │
        │      → ranked options with projected consequences              │
        │  ④ COMMIT    ratify the chosen Plan → write L2 Intent          │
        │      → effective-dated supersede; atomic; auditable            │
        └───────────────────────────────────────────────────────────────┘
                                     │ writes L2 Intent
        EXECUTION (unchanged existing pipeline)
        L2 Intent → L3 Projections → L4 Facts → L5 Consequences → Intelligence
```

Each stage is a **named platform primitive** (§4). None of them is invented from nothing — the discovery is that Alloy already built the hard parts in scattered places, and Planning is what happens when they are **named, unified, and given an operator surface.**

### 2.2 Why this is the right altitude

- It **obeys the frozen laws.** No sixth layer; no new authoritative store; proposed and committed stay separate; financials still derive from Facts; BOS proposes and humans approve.
- It is **reusable by construction.** The loop is domain-neutral. Scheduling supplies the *plugin*; Attendance, Staffing, Capacity, Commercial, Enrollment Convergence supply the next plugins with **zero new runtime**.
- It **turns four existing half-built ideas into one coherent capability** instead of five domains each re-inventing "preview then save."

---

## 3. What already exists (the discovery is extraction, not invention)

The single most important finding of this sprint: **every primitive the Planning Runtime needs already exists somewhere in Alloy, proven in at least one domain.** Planning's job is to name them and compose them.

| Planning primitive | Already exists as | Where | Maturity |
|--------------------|-------------------|-------|----------|
| **Operational Plan** (proposed, uncommitted change) | Enrollment *proposal* (OCM columns) held separately from committed placement; Operational Expectations authored in **`proposed` standing**, not binding until ratified | [`placement-system.md`](../core/placement-system.md); `web/lib/operationalExpectations/standing/`, `ratification/`; `web/lib/bos/bosProposalLifecycle.ts` | Proven per-domain; **not generalized** |
| **Operational Simulation** (write-free projection of consequences) | The **Preview** primitive — *"the 'if authored, then' projection of a proposed act before ratification… pure evaluation over a hypothetical ledger; no writes"*; the Commercial Execution simulator (`evaluate() → attribute() → expand()`, *"creates no financial truth"*, deterministic `resolutionKey`); BPR Execution Runtime **Phase 3 Preview** | [`operational-expectations-system-design.md`](../core/operational-expectations-system-design.md); [`commercial-execution-simulator-deltas.md`](../core/commercial-execution-simulator-deltas.md); [`business-process-execution-platform.md`](../modules/business-process-execution-platform.md) | **Strong** in 3 domains; no unified operator surface |
| **Projected quantities** (expected occupancy/ratio/staffing) | **Registered Operational Calculations** — L3 projections are deterministic, versioned, reproducible Results | [`operational-calculations.md`](../core/operational-calculations.md); `web/lib/operationalCalculations/families/scheduling.ts`, `web/lib/childcareOperational/.../scheduleExpectationCore.ts` | **Built** |
| **Operational Optimization** (candidate generation + ranking) | BOS proposal lifecycle (*"BOS proposes; humans approve"*); no ranking/scenario engine | `web/lib/bos/`; **no `web/lib/planning/`** | **Greenfield** (the real new work) |
| **Operational Commit** (turn a plan into truth) | The **`approve_enrollment` handoff** (proposal → committed placement/schedule); BPR **Phase 4 Commit** (atomic `MutationResult` + `mutation_events` outbox); Expectations **ratification**; **effective-dated supersede** | [`placement-system.md`](../core/placement-system.md); [`business-process-execution-platform.md`](../modules/business-process-execution-platform.md); `web/lib/childcareOperational/effectiveDating.ts` | **Strong but hardcoded** to enrollment |
| **The commitment vocabulary** | `draft → proposed → reviewed → approved → committed → posted → voided → reversed` (RFC D5, ratified) | [`operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) | **Ratified** |
| **The committed target a plan writes** | `child_enrollment_agreements → child_placements → schedule_assignments`, effective-dated, supersede-not-patch, provenance FKs | [`placement-system.md`](../core/placement-system.md) | **Built** |

**Read this table as the sprint's central result.** The Planning Runtime is ~70% assembly of proven parts and ~30% genuinely new (the plan/scenario model as a first-class object, the optimization engine, and the operator workspace). That ratio is *why* Planning earns platform status without violating the "no new runtimes unless justified" bias in [`os-runtime-map.md`](../foundation/os-runtime-map.md): it is mostly **one boundary line and a handful of extractions**, additively — the same shape as every prior platform correction.

---

## 4. The four Planning primitives (platform definitions)

These are the extracted, domain-neutral definitions. Companion docs elaborate each.

### 4.1 Operational Plan — *a proposed change to operational Intent, held apart from truth*

An **Operational Plan** is a named, addressable bundle of **proposed L2 Intent deltas** (and the proposed Expectations they imply), in **`proposed` standing**, that has not been committed. It is the unit an operator experiments on.

- A Plan **writes nothing authoritative.** It obeys the ratified law *"Proposed state and committed state must remain separate."* This is not a new store — it reuses the **proposed-standing** substrate that Expectations already have (`web/lib/operationalExpectations/standing/`), plus a thin plan-envelope that groups deltas and records provenance.
- A Plan has a **grain** (§6) — for Scheduling, **Room × Day**.
- A Plan carries a lifecycle position in the ratified vocabulary: `draft → proposed → reviewed → approved → committed`.
- Plans are **branchable and comparable** — an operator can hold several candidate Plans against the same current state and diff their simulated consequences. This is the "safely experiment before committing" the mission asks for.

### 4.2 Operational Simulation — *the deterministic, write-free projection of a Plan's consequences*

**Simulation** runs the existing **Preview** evaluation and the registered **Operational Calculations** over a Plan's *projected* state (current Intent + the Plan's proposed deltas) to produce projected L3 (occupancy, ratio, staffing demand, fill) and projected L5 (tuition, subsidy, revenue, labor cost) — **without writing any truth.**

- Simulation is **pure and reproducible.** Same Plan + same config version ⇒ same projection (the Commercial simulator already guarantees this via `resolutionKey`; Simulation generalizes the guarantee).
- Simulation **does not introduce a new calculation authority.** It calls the *same* registered Calculations that Execution calls — it just feeds them a hypothetical Intent set. This is the discipline that keeps Simulation honest: *what you simulate is computed by exactly what will compute reality after you commit.*
- The output is a **projected reality** the operator reads *before* committing — occupancy, ratios, labor, commercial impact, and downstream conflicts. See [`operational-simulation.md`](./operational-simulation.md).

### 4.3 Operational Optimization — *generated, ranked candidate Plans over the Calculations*

**Optimization** produces and ranks candidate Plans that satisfy an operator's intent ("place this child," "cover this ratio gap"). It **emerges from Operational Calculations — it does not replace them.**

- **Deterministic-first.** Option *generation* is a deterministic search over Configuration + current Intent (valid rooms, valid schedule patterns, valid staffing moves); option *scoring* is a deterministic function of the simulated Calculations (ratio headroom, occupancy fit, labor delta, commercial delta, conflict count). BOS is **not required** for the MVP — a scored list of valid options is optimization.
- **BOS-assisted next.** BOS contributes *candidate generation beyond the obvious* (swap Noah, add a float teacher, delay start one day) and *natural-language rationale*, under the ratified rule *"BOS proposes; humans approve."* BOS never commits.
- Optimization **visualizes consequences per option** (the mission's "projected impacts" board) by running Simulation on each candidate. See [`operational-optimization.md`](./operational-optimization.md).

### 4.4 Operational Commit — *the bounded handoff that turns a chosen Plan into committed Intent*

**Commit** is the single, explicit, auditable act that converts a `proposed` Plan into **committed L2 Intent** via effective-dated supersede, after which the normal pipeline takes over.

- Commit is the **generalization of `approve_enrollment`.** That handoff already converts an enrollment *proposal* into committed `child_placements` / `schedule_assignments`. Commit lifts that single hardcoded bridge into a **reusable primitive** any Planning plugin invokes.
- Commit is **atomic and previewed.** It reuses BPR's **Preview → Commit** engine (atomic `MutationResult`, `mutation_events` outbox) so *"the operator is never surprised by an action's consequences,"* and it never overwrites history — corrections are new effective-dated rows (the supersede law).
- Commit is **reversible by supersede, not by deletion.** Rollback = a new effective-dated commit that restores the prior state, preserving the timeline. See [`operational-plan-and-commit.md`](./operational-plan-and-commit.md).

---

## 5. Planning vs Execution (the boundary the mission asked for)

| | **Planning** | **Execution** |
|---|---|---|
| Question | *"What should we commit?"* | *"What actually happened / is happening?"* |
| Writes | Nothing until Commit | Authors L4 Facts via Actions |
| Truth touched | Reads L1/L2/L3/L4; drafts proposed L2 | Writes L4; L5 derives |
| Reversibility | Free — plans are disposable | Immutable — corrected only by new facts |
| Surface | Planning plane (this runtime) | Operations plane (queues) + Records plane (Focus Panel) |
| Commitment | The **Commit** primitive is the one-way door | Each Action is a fact-authoring door |

**The seam is Commit.** Everything before Commit is disposable and consequence-free; Commit is the one-way door into truth. This is the cleanest expression of the ratified separation *"proposed state and committed state must remain separate"* — Planning is precisely the plane where "proposed" is a first-class, manipulable object, and Commit is the only bridge across the seam.

---

## 6. Operational grain — validating Room × Day

The sprint's central grain hypothesis is **Room × Day**, and the evidence supports it strongly (validation detail in [`scheduling-reference-implementation.md`](./scheduling-reference-implementation.md)):

- The **placement cascade** is `School → Program → Room → Schedule` per child ([`placement-system.md`](../core/placement-system.md)). Room is the physical convergence point; the schedule pattern resolves a child onto *specific days*.
- Every projection Scheduling cares about is **keyed by room and day**: expected occupancy (children in room on day), expected ratio (staff:children in room on day), expected staffing demand (coverage for room on day), capacity/fill (room binding capacity vs projected occupancy on day). These are exactly the registered Calculations in `web/lib/operationalCalculations/families/`.
- Commercial consumption resolves against a *scheduled occurrence* on a day ([`commercial-execution-simulator-deltas.md`](../core/commercial-execution-simulator-deltas.md)).

**Finding: Room × Day is the *projection join key*, and therefore the correct planning grain for Scheduling** — but the *Plan* grain and the *cell* grain differ. A **Plan** spans many Room×Day cells (you plan a week for a room, or a term for a child); a **Room×Day cell** is the atomic unit the grid renders and the Calculations key on. This is the same relationship the platform already draws between a Business Process grain and a queue row. Grain is **per-plugin**, not universal: Staffing may plan on Staff × Day, Capacity on Room × Term. The *engine* is grain-neutral; the *plugin* declares its grain — exactly like Business Processes declare their row grain.

---

## 7. The per-domain plugin contract

A Planning plugin (Scheduling, then Attendance, Staffing, Capacity, Commercial…) supplies a fixed artifact set — the same discipline as *"each domain ships the same artifact set rather than a bespoke UX"* ([`operational-ux-doctrine.md`](../core/operational-ux-doctrine.md)):

| Plugin supplies | Scheduling example |
|-----------------|--------------------|
| **Grain** | Room × Day |
| **Proposable deltas** (what a Plan may contain) | place/move child, set/adjust schedule pattern, assign/float staff, open/close room-day |
| **Projection set** (which registered Calculations to run) | expected occupancy, ratio, staffing demand, capacity/fill |
| **Consequence set** (which L5 to project) | tuition/revenue, subsidy, labor cost |
| **Constraint set** (what makes a delta valid / a plan conflicting) | ratio rules, room capacity, license capacity, schedule validity |
| **Commit target** (what committed Intent the plan writes) | `schedule_assignments`, `child_placements` (supersede) |
| **Optimization objectives** (what "better" means) | ratio compliance, fill, minimal labor, minimal conflict |

The **engine** owns propose/simulate/optimize/commit, the plan store, the diff/compare, the workspace shell, and the Focus Panel card. The **plugin** owns the seven rows above. Adding Staffing planning is *a plugin*, not a product.

---

## 8. Boundaries — what Planning must NOT own (the one-owner law)

Per *"one owner per concern; if two layers both own a concern, one is wrong"* ([`os-runtime-map.md`](../foundation/os-runtime-map.md)):

- Planning **does not compute truth** — it calls registered **Operational Calculations**. (No parallel projection math.)
- Planning **does not author Facts** — only Execution does (L4). Committing a Plan writes **Intent (L2)**, never Facts.
- Planning **does not own a new authoritative store** — Plans live as proposed-standing bundles; simulated projections are non-authoritative recomputable caches (Law 2).
- Planning **does not replace BOS** — BOS proposes options; Planning is where the operator ranks and commits them.
- Planning **does not invent a workspace shell** — it inherits Family A `WorkspaceShell` (Work | Studio). See [`scheduling-reference-implementation.md`](./scheduling-reference-implementation.md).
- Planning **does not own Configuration** — schedule/ratio/rate rules stay first-class L1 config; Planning reads them.

---

## 9. Success criteria mapped

| Sprint question | Answer (this doc) |
|-----------------|-------------------|
| What is Operational Planning? | The Planning plane made a first-class runtime: a `propose→simulate→optimize→commit` loop (§2). |
| Is it a new platform layer? | **No** — it is a plane→runtime maturation; a sixth truth-flow layer is doctrinally forbidden (§1). |
| What is an Operational Planning Workspace? | A Family-A `WorkspaceShell` (Work \| Studio) hosting the loop over a plugin's grain (§7; scheduling doc). |
| Planning vs Execution? | The seam is **Commit**; before it, disposable; after it, truth (§5). |
| How do Focus Panels evolve? | A universal **planning card** per workspace + cross-domain planning cards (focus-panel doc). |
| How does Optimization fit? | Emerges from Calculations; deterministic-first, BOS-assisted; never replaces Calculations (§4.3). |
| How does Simulation work? | Generalized **Preview** + registered Calculations over projected Intent; write-free, deterministic (§4.2). |
| What is an Operational Commit? | The generalized `approve_enrollment` handoff; atomic, previewed, supersede-based (§4.4). |
| How does Scheduling become the reference for future domains? | Via the plugin contract (§7); Attendance/Staffing/Capacity/Commercial follow with no new runtime. |
| What becomes permanent platform architecture? | The four primitives (§4) + the plugin contract (§7) + the planning card. See the ledger (roadmap doc). |

---

## 10. What would make this real (engineering, only as validation)

Named only to prove the architecture is buildable, not as an implementation plan:

- **`web/lib/planning/`** — the engine: plan envelope over proposed-standing, the simulate adapter (calls registered Calculations + Preview), the commit adapter (calls BPR Preview→Commit + effective-dating), the optimize adapter (deterministic search + BOS proposal bridge).
- **A Scheduling plugin** declaring the seven artifacts of §7, committing to `schedule_assignments` / `child_placements`.
- **A Scheduling `WorkspaceShell`** (Family A) — the first real Scheduling workspace (none exists today; doctrine already names it an intended inheritor).
- **A `planning` Focus Panel card key** following the `billing_preview` read-only template, evolving toward a write-capable planning card.

None of these is a new runtime layer. All are additive.

---

## Cross-references

| Concern | Doctrine |
|---------|----------|
| Two axes; five truth-flow layers; four laws | [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) |
| Five planes incl. the Planning plane | [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) |
| "No sixth layer"; projection classification; Forecasting = Missing | [`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md) |
| Preview / ratification / two-ledger ontology | [`../core/operational-expectations-system-design.md`](../core/operational-expectations-system-design.md) |
| Registered projections as Calculations | [`../core/operational-calculations.md`](../core/operational-calculations.md) |
| Preview→Commit engine, outbox | [`../modules/business-process-execution-platform.md`](../modules/business-process-execution-platform.md) |
| Committed Intent foundation (commit target) | [`../core/placement-system.md`](../core/placement-system.md) |
| Existing simulator precedent | [`../core/commercial-execution-simulator-deltas.md`](../core/commercial-execution-simulator-deltas.md) |
| One-owner law, no-new-runtimes bias | [`../foundation/os-runtime-map.md`](../foundation/os-runtime-map.md) |
