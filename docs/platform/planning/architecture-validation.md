---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Architecture validation — Iteration 2

**Status:** Proposed — the record of forcing the Operational Planning architecture to live inside the frozen Alloy workspace, challenging every Iteration-1 assumption, and converging the model with mockups that inherit Processing / Communications / Work Items.

**Method.** For each surface: compose it *only* from existing Alloy primitives; where a deviation appears, decide **(A) the mockup is wrong** or **(B) the architecture is wrong**; if (B), revise the architecture, then rebuild. Repeat to convergence. The per-surface results are in §5.

---

## 1. What survived, what changed

| Iteration-1 claim | Verdict | Change |
|-------------------|---------|--------|
| Planning is the Planning *plane* matured into a runtime; no sixth layer | **Survived** | — |
| The loop is `propose → simulate → optimize → commit` | **Survived** | — |
| Commit generalizes `approve_enrollment`; supersede; reversible | **Survived, deepened** | Reframed: Alloy commits **Plans, not records** (§4) |
| The loop lives in **Work** mode, rendered as a board | **Failed** | Moved to **Studio**; board demoted to a Studio canvas perspective ([`studio-platform.md`](./studio-platform.md)) |
| Optimization ≈ ranked recommendations | **Failed** | Reframed as **futures generation + comparison** (§3) |
| Simulation ≈ write-free preview of a plan | **Survived, deepened** | Reframed as **alternative-reality construction + comparison** (§2) |
| Scheduling gets a planning workspace | **Failed** | Scheduling is Processing's workspace; Planning is its **Studio** |

The load-bearing failure was **placement**: planning is design-time, so it belongs in Studio. That single correction dissolved the "feels like a Scheduling app" problem, because Work reverts to the Alloy spine (Overview + Work Views + Focus Panel) and the board becomes Studio content on an inherited canvas.

---

## 2. Simulation — reframed as *alternative-reality construction*

**Challenge:** is Simulation just "preview a save"? No. Simulation constructs a **second reality** and holds it against the first.

```
Current Reality  (committed Intent + Facts, projected by registered Calculations)
        │  apply Plan deltas (in memory, write-free)
        ▼
Alternative Reality  (projected Intent, same Calculations)
        │
        ▼
Operational Projection  (occupancy · ratio · staffing · fill · tuition · conflicts, per Room × Day)
        │
        ▼
Comparison  (diff the two realities — this is the operator-facing artifact)
        │
        ▼
Commit  (make the Alternative Reality the Current Reality)
```

The primitive is not "preview"; it is **two realities, comparable**. Determinism and fidelity are unchanged (same registered Calculations compute both realities — `aggregateExpectedOccupancyByRoomDate`, `resolveOperationalCapacity`, `resolveRatio`). What Iteration 2 adds is that **Comparison is first-class**: the operator reads the *delta between realities*, not a single projected number. This is why Simulation and Optimization share machinery — Optimization is Simulation run across many alternative realities.

---

## 3. Optimization — reframed as *futures*, not recommendation

**Challenge:** Iteration 1 treated Optimization as "ranked recommendations," which quietly centres BOS and hides the operator. The truer shape:

```
Current Reality
        │
        ▼
Generate Futures     (deterministic search + BOS generation — many candidate Plans)
        │
        ▼
Compare Futures      (each future = an Alternative Reality via Simulation)
        │
        ▼
Rank Futures         (deterministic score over a configurable objective)
        │
        ▼
Operator Decision    (the operator chooses a future — never BOS)
        │
        ▼
Operational Commit → Execution
```

Consequences of the reframe:

- **Recommendation is one *generator*, not the definition.** Deterministic search (valid rooms/patterns) and BOS generation (non-obvious moves) both *produce futures*; ranking orders them; the operator decides. "Recommended" is just the top-ranked future, labelled.
- **Explainability is per-future**, carried as each future's Simulation delta + a rationale line — not a black-box score.
- **Confidence** is a property of a future (how sensitive its projection is to assumptions), shown alongside rank.
- **Reversibility** is guaranteed downstream by Commit (supersede), so choosing a future is safe.
- **Comparison UX** is the core Optimization surface — a Work View of futures with their projected deltas — not a recommendation list.

Optimization is therefore **"explore the space of possible tomorrows, then commit one."** That is a defining Alloy capability, reusable by every planning domain.

---

## 4. Operational Commit — Alloy commits *plans*, not records

**Challenge:** what is actually committed? The deepest Iteration-2 discovery: a record system *saves rows*; Alloy **commits plans**.

| Question | Answer |
|----------|--------|
| **What is committed** | An **Operational Plan** — a versioned bundle of intended change — not an individual row edit. |
| **Where plans live before commit** | As `proposed`/draft-standing bundles in the Studio design environment (reusing the Expectations proposed-standing substrate); never in authoritative tables. |
| **Approval lifecycle** | The ratified vocabulary `draft → proposed → reviewed → approved → committed → posted → voided → reversed`; approval gated by `operational_authorities`. |
| **Rollback** | A new effective-dated commit that supersedes — never a delete or in-place edit. |
| **Versioning** | Every commit is a new version of the affected Intent; the plan that produced it is retained as provenance. |
| **Comparison** | Any two plans (or a plan vs current reality) diff via Simulation. |
| **History** | The timeline of committed plans on a subject (room/child) is a complete, auditable ledger. |
| **Operational replay** | Because commits are effective-dated supersedes with provenance, the sequence of committed plans can be replayed against a base to reconstruct or audit any point in time. |

**This is a platform-identity statement:** Alloy is a **plan-commit operating system**, not CRUD-over-records. The record is the *residue* of a committed plan; the plan is the unit of operator intent. Commit is the door; the ledger of committed plans is the operational history.

---

## 5. Per-surface critique results (convergence record)

Each second-generation mockup was composed only from inherited primitives and checked against the Alloy Runtime Specification, Canonical Interaction Model, Workspace Doctrine, Visual Language, and the Processing / Communications / Work Items references.

| Surface | Composed from (inherited) | Deviation found | Verdict → resolution |
|---------|---------------------------|-----------------|----------------------|
| **Overview (Work)** | WorkspaceShell · WorkspaceHeader · Work\|Studio nav · Operational Health strip · action cards · Today's-activity KPI tiles · info zones | none | Clone of Processing Overview |
| **Work Views / Queue** | WorkspaceQueueRow · queue list · Operational Health | v1 had no queue at all | **B: architecture wrong** — Work must be queues, not a board. Fixed: Work = Unplaced / Ratio risk / Mismatch / Awaiting-commit Work Views |
| **Focus Panel (planning card)** | FocusPanelShell · mode grid · card (billing_preview template) | v1 card ok, but lived beside a board | **A: mockup wrong** — re-hosted in the real Focus Panel mode grid |
| **Studio · Plans** | WorkspaceShell (Studio mode) · list+detail · Focus Panel inspector | Studio existed only as config in the frozen refs | **B: architecture refined** — Studio generalized to operational design ([`studio-platform.md`](./studio-platform.md)) |
| **Studio · Plan canvas (Room × Day)** | The `ProcessingFormBuilder` design-time frame (publish toolbar → segmented Edit/Simulate/Committed → canvas + inspector) | v1 board was bespoke chrome in Work | **B→A**: placed in Studio; rebuilt on the certified builder frame — **Simulate⟷Preview, Commit⟷Publish** |
| **Optimization** | Work View of futures (rows) + Focus Panel compare | v1 was a bespoke card stack | **A: mockup wrong** — rebuilt as a Work View of futures + comparison |
| **Simulation / Commit** | Focus Panel (compare realities) + commit action | v1 mostly ok | **A: mockup wrong** — expressed as reality-comparison in Focus Panel |
| **Cross-workspace / Embedded cards** | Focus Panel card handoff · embedded workspace (Activity) | route-nav gap | Named platform gap (unchanged) |

**Convergence reached:** every surface is either a direct clone of an existing workspace surface or the inherited Studio design environment with Scheduling *content*. No new shell, header, nav model, action placement, KPI layout, or visual language was introduced.

---

## 6. Extracted platform discoveries (Iteration 2)

| Bucket | Discovery |
|--------|-----------|
| **Operational Planning Platform** | The loop is the operational specialization of Studio; Planning ⊂ Studio |
| **Studio Platform** | The reusable operational design environment (author → preview → compare → door); config and planning are two instances |
| **Planning Runtime** | Studio's operational-design runtime; per-domain plan plugins |
| **Simulation Runtime** | Alternative-reality construction + comparison; deterministic; same Calculations as Execution |
| **Optimization Runtime** | Generate → compare → rank futures; recommendation is one generator; operator decides |
| **Operational Commit** | Alloy commits plans (versioned, approvable, reversible, replayable), not records |
| **Focus Panel Evolution** | The planning card = a subject's plan/futures; write-capable in Studio |
| **Workspace Evolution** | Studio graduates from config-authoring to operational design; Work stays the Alloy spine; the board is Studio canvas content |
| **BOS Evolution** | BOS is a *futures generator* + consequence explainer in Studio; proposes futures, never commits |
| **Future Platform Doctrine** | "The design environment must faithfully predict the runtime" unifies publish-parity (config) and simulate-fidelity (planning) |

---

## Cross-references

- [`studio-platform.md`](./studio-platform.md) — the Studio discovery.
- [`operational-planning-platform.md`](./operational-planning-platform.md) — the runtime (Studio specialization).
- [`operational-simulation.md`](./operational-simulation.md) · [`operational-optimization.md`](./operational-optimization.md) · [`operational-plan-and-commit.md`](./operational-plan-and-commit.md) — the primitives, as refined here.
- [`scheduling-reference-implementation.md`](./scheduling-reference-implementation.md) — Work vs Studio placement, updated.
