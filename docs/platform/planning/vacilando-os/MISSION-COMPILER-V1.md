# Mission Compiler V1 — architecture (blueprint for the upstream half of Vacilando)

> Status: architecture for approval. **Design only — do not implement.** Worker
> Runtime implementation remains on hold. Builds on
> `MISSION-RUNTIMES-ARCHITECTURE-V1.md` (approved) and
> `WORKER-RUNTIME-V1-MISSION-PACKAGE.md` (the execution contract).

The manually-authored Mission Package is acceptable for bootstrapping but is not
the long-term architecture. Kelly should not assemble packages; Director should
not invent them. **Packages are compiled** from a one-line operator intent.

Two levels of orchestration, both deterministic, neither reasoning:
- **Director** conducts the *macro* pipeline (stages, gates, state, routing).
- **Mission Compiler** conducts the *micro* assembly of one package (scoped calls
  to Knowledge/Reasoning to fill fields), at stage 5 only.

---

## 1. Complete compile pipeline

A Director-owned state machine. Each stage: **owner · inputs · outputs ·
escalation**.

### Stage 0 — Mission Intent
- **Owner:** Kelly (operator) — the trigger.
- **Inputs:** one natural-language line ("Improve Scheduling", "Build Access &
  Roles V2", "Finish Communications").
- **Outputs:** `MissionIntent { intent_id, text, actor, created_at }`.
- **Escalation:** none — ambiguity is resolved downstream (Stage 1).

### Stage 1 — Capability Resolution
- **Owner:** Director.
- **Inputs:** `MissionIntent`; project registry; capability registry; index of
  existing missions/packages.
- **Determines:** `project_id`, `capability`, whether this continues an existing
  mission or starts a new one, `mission_id`.
- **Outputs:** `ResolvedTarget { project_id, capability, mission_id, mode:
  new|continue, prior_package_ref? }`.
- **Escalation:** intent matches 0 or >1 capability → operator disambiguation
  (Needs You). Unknown project → operator. **Resolve deterministically or ask —
  never guess.**

### Stage 2 — Knowledge Retrieval
- **Owner:** Knowledge Runtime (dispatched by Director).
- **Inputs:** `ResolvedTarget`.
- **Retrieves:** architecture, specifications, screenshots (approved *and*
  rejected), previous missions + outputs, accepted decisions, rejected patterns,
  implementation state (current repo state for the capability), QA/evidence
  history.
- **Outputs:** `KnowledgeSet` — a **ranked, typed, provenance-stamped** set —
  plus an **immutable `knowledge_snapshot_id`** (reproducibility).
- **Escalation:** capability has no corpus ("cold capability") → flag it (the
  compiler will produce a thinner package with more operator gates); stale index
  → refresh before returning.

### Stage 3 — Gap Analysis
- **Owner:** Reasoning Engine (invoked by Director with the `KnowledgeSet` as
  *supplied* context — Reasoning never fetches its own).
- **Inputs:** `MissionIntent` + `KnowledgeSet`.
- **Determines:** contradictions, missing requirements, missing acceptance
  criteria, unclear scope, unresolved product truth, and generated clarification
  questions.
- **Outputs:** `GapFindings { contradictions[], missing_requirements[],
  missing_criteria[], scope_ambiguities[], unresolved_product_truth[],
  clarification_questions[] }` — **findings only, no implementation, no package**.
- **Escalation:** unresolved product truth / blocking contradictions → become
  `operator_decision_gates` / blocking questions in the package; a severe
  contradiction may loop Director back to Stage 2 for more retrieval.

### Stage 4 — Mission Compilation
- **Owner:** Mission Compiler.
- **Inputs:** `MissionIntent`, `KnowledgeSet` (+ snapshot), `accepted_decisions`,
  `GapFindings`.
- **Process:** deterministic assembly of the Mission Package. May issue **scoped,
  field-level** calls to Knowledge (fill references) and Reasoning (derive
  acceptance criteria, recommend decomposition) — each recorded in
  `compiler_trace`. Runs readiness validation (§3 of the Worker Runtime contract).
- **Outputs:** **Draft Mission Package** (`package_origin=compiled`,
  `readiness_status` computed) + `compiler_trace` + embedded `knowledge_snapshot`.
- **Escalation:** unresolved blocking gaps → readiness `awaiting_operator` /
  `blocked` with findings. Intent too large (Reasoning decomposition says so) →
  emit a **Split recommendation** (N draft packages) back to Director.

### Stage 5 — Operator Review
- **Owner:** Kelly (the gate is owned by Director).
- **Inputs:** Draft Package + readiness + `compiler_trace` + gap summary.
- **Outcomes:** **Approve** (→ ready) · **Reject** (→ superseded) · **Revise**
  (edit fields → recompile+validate) · **Ask GPT** (targeted Reasoning
  invocation; result folded back) · **Split Mission** (decompose into N packages,
  each re-enters the pipeline).
- **Outputs:** decision; on Approve → package `ready`.
- **Escalation:** Revise / Ask-GPT loop back to Stage 4; Split loops back to
  Stage 1 per child.

### Stage 6 — Mission Package Ready
- **Owner:** Director (state).
- **Outputs:** `readiness_status = ready`, bound to the mission.
- **Escalation:** inputs changed since compile (repo moved, decision superseded)
  → package **stale** → recompile before execution.

### Stage 7 — Worker Runtime Execute
- **Owner:** Worker Runtime (the already-designed execution contract).
- **Inputs:** the ready Mission Package.
- **Outputs:** execution → `waiting_for_acceptance` / `waiting_for_operator` /
  `blocked` / `failed` / `stopped`.

```
Mission Intent (Kelly)
  → Capability Resolution (Director)
  → Knowledge Retrieval (Knowledge Runtime)
  → Gap Analysis (Reasoning Engine)
  → Mission Compilation (Mission Compiler)
  → Operator Review (Kelly / Director gate)
  → Ready
  → Worker Runtime (execute)
```

## 2. Runtime responsibilities

| Runtime | Owns | Never |
|---|---|---|
| **Director** | workflow, gates, state, routing, approvals, mission lifecycle; drives the pipeline state machine | reasons · retrieves · generates · becomes a GPT |
| **Knowledge Runtime** | retrieval, ranking, indexing, relationships, references, history; immutable snapshots | reasons |
| **Reasoning Engine** | bounded reasoning on *supplied* context: gap analysis, decomposition, criteria derivation, feedback classification, clarification questions, summarization; stateless | executes · retrieves its own context · orchestrates |
| **Mission Compiler** | compilation/assembly only; scoped orchestration of Knowledge+Reasoning to fill fields; `compiler_trace`; readiness validation | executes · reasons independently · retrieves in substance (delegates) |
| **Product Definition Runtime** | durable classified operator-feedback rules; feeds decisions/patterns/rules | executes · reasons (may *call* Reasoning to classify) |
| **Acceptance Runtime** | typed criteria + evidence binding + gate + decision ledger | executes |
| **Worker Runtime** | durable execution of a ready package | invents mission definition |
| **Provider Runtime** | auth + transport (used by Worker turns AND Reasoning turns) | — |

## 3. Mission Package lifecycle

Schema additions to the Worker Runtime contract:

```
package_origin: manual | compiled | revised | superseded
compiler_trace: {
  stages[]:              { stage, runtime, request, result_ref, at }
  sources_used[]         // knowledge item ids
  decisions_used[]       // accepted-decision ids
  references_used[]      // screenshot/doc/code refs
  reasoning_invocations[]// { task, input_ref, result_ref, at }
}
knowledge_snapshot: {
  snapshot_id, retrieved_at,
  items[]: { id, type, uri, rank, provenance }   // the EXACT retrieval set
}
```

`compiler_trace` + `knowledge_snapshot` make every compiled package
**reproducible**: the same sources + decisions + reasoning results reconstruct it.

**Lifecycle:**
`created (manual author | compiled draft) → validated (draft|blocked|
awaiting_operator|ready) → [revise → new version, prior superseded] → ready →
bound → executed → superseded (replaced/rejected)`.

Every compile/revise **bumps version**; the prior version is `superseded`;
**immutable once dispatched** to a worker. A stale ready package (inputs moved)
recompiles rather than executing outdated truth.

## 4. Knowledge lifecycle

- **Ingest:** durable items flow in from Product Definition (rules), Acceptance
  (criteria/decisions/evidence), Worker outputs (prior mission outputs),
  git-tracked docs/screenshots, QA history.
- **Index:** build/refresh on repo change + on new durable writes; maintain
  relationships (capability ↔ docs ↔ decisions ↔ screenshots ↔ missions).
- **Retrieve:** scoped query → ranked typed set + **immutable snapshot**.
- **Rank deterministically** (versioned ranking function: capability match,
  recency, status, type) — ranking is a recorded function, never a model opinion.
- **Never reasons.** Serves Director and the Compiler.

## 5. Reasoning lifecycle

- **Invoke:** Director or Compiler calls with a *specific task* + the *exact
  context* (from Knowledge).
- **Run:** a **bounded** turn on the Provider Runtime — short, never a mission.
- **Return:** typed structured result (findings / decomposition / criteria /
  classification / questions).
- **Persist:** the **caller** persists durable results (into the package via
  `compiler_trace`, or into the Product-Def ledger). The engine holds nothing.
- **Never** executes, retrieves, or orchestrates. Every invocation audited.
- **Determinism note:** reasoning outputs are non-deterministic, so they are
  captured as **fixed artifacts** in `compiler_trace` (not re-derived on replay);
  anything load-bearing passes through an operator gate.

## 6. Director orchestration lifecycle

The pipeline state machine Director owns:

```
intent_received → resolving_capability → retrieving_knowledge → analyzing_gaps
  → compiling → operator_review → ready → executing → (waiting_for_acceptance | …)
```

Transitions are **deterministic**, triggered by runtime results + operator
decisions. Loopbacks: `revise → compiling`, `split → resolving (×N)`,
`stale → retrieving/compiling`, `severe contradiction → retrieving`. Director owns
the operator gates (review, approvals) and the mission lifecycle; it routes to the
next specialist but performs none of their work.

## 7. Scheduling walkthrough

**Intent:** "Improve Scheduling."

1. **Capability Resolution (Director):** project=`alloy`, capability=`scheduling`;
   finds existing scheduling work (SchedulingProjection, `placement` family,
   `placement.room_fit` calc, Milestone-1 impl) → `mode=continue`, new child
   mission.
2. **Knowledge Retrieval:** scheduling architecture; approved screenshots
   (card+editor mockups); **rejected layouts** (the v1 blank-form / orphaned-
   projection Kelly rejected); previous missions + outputs; **accepted decisions**
   (proposed-vs-operational tiers; enrollment = materialization boundary;
   "scheduling starts by opening a child"); **rejected patterns** (OCM removed; no
   needs-placement queue gate; no `/dev` harnesses); implementation state; QA
   (37/37, 99/99 vitest).
3. **Gap Analysis (Reasoning):** "improve" is unscoped → **scope ambiguity** +
   a clarification question ("which axis — room-fit accuracy, proposed→operational
   transition, UI density, or performance?"); flags missing acceptance criteria
   for an open-ended "improve." No major contradiction.
4. **Compilation:** assembles a Draft Package — scope pulled from decisions
   (exclude enrollment materialization — it's the boundary), `inherited_product_
   rules` (proposed-vs-operational; entry is the child), `rejected_patterns`
   (blank-form, OCM, queue gate) so the worker is constrained up front,
   `acceptance_criteria` (Reasoning-derived), references (approved mockups,
   room_fit calc), `QA_plan` (vitest + browser cert) + snapshot + trace.
   `readiness = awaiting_operator` (the clarification is blocking).
5. **Kelly Review:** answers the clarification ("room-fit accuracy +
   proposed→operational transition"), **Approves** → recompile fills
   objective/scope → `ready`.
6. **Worker Runtime:** executes the ready package.

**Where prior iterations collapse:** the memory record shows Scheduling was
rebuilt repeatedly — v1 rejected, rebuilt, room-fit root-caused, decisions
(proposed-vs-operational) and rejected patterns (OCM, queue gate, blank form)
re-explained each round. The compiler **retrieves all of that automatically** and
bakes the rejected patterns into the package, so the worker never rediscovers and
Kelly never re-explains. The multi-round rejection loop (Kelly rejecting v1 for a
reason *already known*) is eliminated because that rejected pattern is inherited
and constrains the worker from turn one. **N review rounds → ~1 scope
clarification.**

## 8. Access & Roles V2 walkthrough — why one approval suffices

**Intent:** "Build Access & Roles V2."

1. **Capability Resolution:** new mission under `access-roles`; "V2" implies a
   documented V1 whose decisions/patterns are durable.
2. **Knowledge Retrieval:** V1 architecture, V1 accepted decisions (role model,
   permission taxonomy), V1 rejected patterns, screenshots, QA — a **rich,
   unambiguous** set because the capability is mature.
3. **Gap Analysis:** few gaps — V2 is a *delta* on a known model; requirements are
   largely derivable from V1 + the "V2" delta; criteria derive from the
   established permission taxonomy; minimal contradictions.
4. **Compilation:** a **complete** package — objective (the V2 delta), scope from
   V1 decisions, derived criteria, references to V1, clear exclusions.
   `readiness = ready` (or a single scope-confirmation gate).
5. **Operator Review:** **one** approval — Kelly confirms the V2 scope delta →
   `ready`.
6. **Worker Runtime:** executes.

**Principle:** *the number of pre-implementation approvals is inversely
proportional to the maturity of the capability's durable knowledge.* A mature
capability (Access & Roles V2) compiles to a ready-or-one-gate package; a cold
capability needs more operator gates to establish product truth first. This is the
payoff of Product Definition + Acceptance + Knowledge: they front-load durable
truth so compilation converges in one approval.

## 9. Remaining architectural gaps

Honest dependencies — none of the upstream runtimes exist yet:

1. **Knowledge Runtime** (biggest dependency) — retrieval + ranking + relationship
   index + immutable snapshots don't exist; today it's manual grep/memory.
   Compilation is impossible without it.
2. **Product Definition Runtime** — `accepted_decisions` / `rejected_patterns` /
   rules are sourced ad hoc (memory + docs), not a queryable, inheritable ledger.
3. **Acceptance Runtime** — no typed home or gate for `acceptance_criteria`;
   criteria are Reasoning-generated but not durably owned or evaluated.
4. **Reasoning Engine** — gap analysis, decomposition, criteria derivation,
   feedback classification, clarification-question generation are unimplemented;
   need a provider-neutral bounded-reasoning service (can run on Provider Runtime).
5. **Capability & project registries** — Director's Stage-1 resolution needs a real
   catalog (which capabilities exist, their maturity, their corpus pointers).
6. **Knowledge staleness detection** — packages must invalidate when repo/decisions
   move; needs change detection to mark a ready package `stale`.
7. **Reasoning determinism / reproducibility** — model outputs are
   non-deterministic; reproducibility rests on the deterministic
   `knowledge_snapshot` + captured reasoning artifacts in `compiler_trace`, with
   operator gates for load-bearing conclusions.
8. **Split-mission orchestration** — multi-package decomposition + dependency
   ordering between child missions is unspecified beyond "loop back."
9. **Visual knowledge** — ranking approved-vs-rejected *screenshots* needs an
   image-aware index (metadata-only for V1).

**Recommended first build (unchanged from the approved bottom-up order):** Worker
Runtime V1 (executes a package) → **Knowledge Runtime V1** (the compiler's hard
dependency) → Acceptance → Product Definition → **Mission Compiler V1** →
Reasoning Engine → Director conductor. The compiler is meaningful only once
Knowledge exists to feed it.

**Stop. Do not implement.** This is the blueprint for the upstream half.
