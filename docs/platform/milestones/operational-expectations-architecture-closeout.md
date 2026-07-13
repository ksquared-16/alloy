---
owner: platform
status: frozen
last_reviewed: 2026-07-13
supersedes: []
---

# Operational Expectations — Architecture Initiative Closeout

**Status:** FROZEN closeout (2026-07-13). This document formally closes the Operational Expectations
architecture initiative. Architecture is **complete and frozen**; what remains is **engineering
implementation**. No new capabilities, no further ontology, no terminology refinement, no
implementation detail are introduced here.

**Companion artifacts (the frozen corpus):**
- Architecture / system design — [`../operational-expectations-system-design.md`](../operational-expectations-system-design.md)
- Doctrine convergence certification — [`./operational-expectations-doctrine-convergence.md`](./operational-expectations-doctrine-convergence.md)
- Truth-flow doctrine (reconciled) — [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md)
- Engineering realization plan (implementation baseline) — [`./operational-expectations-engineering-realization.md`](./operational-expectations-engineering-realization.md)

---

## 1. Executive Summary

Operational Expectations is now a **frozen Alloy platform capability**: the **second authored
ledger**, the twin of Operational Facts. Where Facts record **observed** operational truth ("what
IS"), Expectations record **authored, intended** operational truth ("what SHOULD / WILL be").
Neither ledger derives from the other — that non-derivability is precisely why each is a capability
rather than a projection. Everything else in the operating model — Judgment, Gap, Projection, Current
Work, Scheduling, Forecasting, Billing, Communications, Recommendations — is **derived**.

The initiative delivered three things and stopped cleanly:

1. A **frozen ontology and semantic model** — an Expectation is the tuple
   ⟨Authority · Modality · Subject · Condition · Temporal Frame · [Beneficiary]⟩ over a **closed set
   of five modalities**, with a measurable that sits **below the semantic line** and a **judgment
   that is derived and modality-relative**.
2. A **frozen system design** — responsibilities, boundaries, runtime, evaluation, authoring,
   consumption, surfaces, configuration, processing, security, extension, and a package plan — that
   resolves the three previously-open questions at the **system-design** level so engineering makes
   no architectural decisions.
3. A **converged documentation corpus** — one consistent ontology across all canonical docs, with
   "Expectation" reserved for the authored ledger and "Projection" reserved for derived state, Law 2
   rewritten accordingly, and a certification of consistency.

The architecture is done. Implementation may begin.

---

## 2. Architecture Timeline — the progression and why earlier abstractions were rejected

The capability converged through four framings. Each earlier framing was **not wrong** — it was a
partial view that the next framing subsumed. The rejections all trace to the same root: the earlier
abstraction confused a **derived** thing with the **authored** thing.

```
Activation  →  Projection  →  Reconciliation  →  Operational Expectations (FROZEN)
```

- **Activation — rejected.** The first framing treated the capability as *activating* expected work:
  an expectation "turns on," advances, and fires a response. This makes the expectation a **workflow
  engine with a program counter** — it violates the **Purity law** (an Expectation carries no
  response) and the **Acyclic law** (state changes only by authoring a Fact). Activation smuggles the
  effector into the assertion. Rejected: an Expectation asserts; it does not run.

- **Projection — rejected as the *final* abstraction (retained as the derived layer).** The second
  framing treated expected state as a **pure projection** of Configuration + Intent (the old "L3
  Operational Expectations — derived"). A projection is deterministic, downstream, and
  non-authoritative — it *cannot legitimately disagree* with what its inputs compute. But real
  operations require authored intent that **diverges** from what config would derive (a director
  overrides tomorrow's ratio; a promise is made to a family; a forecast asserts a future). A
  projection can neither hold a commitment nor be independently **revised**. Rejected as the truth
  itself — **kept** as the derived read layer, now correctly named **Projection**.

- **Reconciliation — rejected.** The third framing treated the capability as the **reconciliation of
  expected vs actual** — the diffing activity. But reconciliation is a **derived comparison**; that is
  exactly **Judgment** and **Gap**, which are outputs, not the source of truth. Making Reconciliation
  the capability elevates a derived read to a system of record and leaves the *authored intent* it
  compares against undefined. Rejected: reconciliation is downstream of the two ledgers, not one of
  them.

- **Operational Expectations — accepted and frozen.** The fourth framing names the authored intended
  truth directly, as a **ledger twinned with Facts**: same substrate (identity, lineage, replay,
  bitemporal), opposite semantics (assert vs witness; revise vs correct). Activation, Projection, and
  Reconciliation all reappear — correctly — as **derived** consequences of comparing this ledger
  against Facts. The progression converged because only an authored, non-derived ledger can carry
  intent that facts are measured against.

---

## 3. Final Frozen Architecture

### Operational Facts
Authored ledger of **observed** truth ("what IS"). Facts **witness** reality; immutable / append-only;
**corrected** by reference (the past did not change — our record did). Time is an observation, so
clock-facts are Facts and deadlines need no timer. Already exists in the platform; converged, not
rebuilt.

### Operational Expectations
Authored ledger of **intended** truth ("what SHOULD / WILL be"). Expectations **assert** reality;
same bitemporal / lineage / replay substrate as Facts; **revised** when the future legitimately
changes (re-plan) vs **corrected** when a prior assertion was never valid (unwind). **Authoritative;
never derived from any other layer.**

### Judgment
**Derived** comparison between Facts and Expectations. Modality-relative:
`required → satisfied/violated`, `committed → honored/breached (+ wronged beneficiary)`,
`prohibited → respected/breached`, `intended → achieved/unachieved`,
`predicted → confirmed/disconfirmed`, plus **at-risk** (predicted-to-miss). Only deontic/commissive
modalities can be "violated." Never authored.

### Projection
**Derived** operational state / read model (the former "L3 Operational Expectations"). Includes the
"Expected X" values, **Scheduling** (projection over committed expectations), and **Forecasting**
(projection over predicted expectations). Never a system of record; always recomputable.

### Platform Laws (six, frozen)
1. **Purity** — an Expectation carries no response.
2. **Acyclic** — state changes only by authoring a Fact; intent only by authoring an Expectation; a
   Gap is only ever read; effectors close gaps by producing new Facts/Expectations.
3. **Authored-vs-Derived** — assertion acts are permanent; judgments are derived and never authored;
   **there is no "mark fulfilled" verb.**
4. Facts **witness** / Expectations **assert** / Judgment **compares**.
5. **Non-derivability** of the two ledgers.
6. **Standing is meaning** — AI/external proposals do not bind until **ratified**.

### Semantic Model
An Expectation **is** the tuple ⟨ **Authority · Modality · Subject(s) · Condition · Temporal Frame ·
[Beneficiary]** ⟩. **Modality is a closed set of five:** `required · prohibited · intended ·
committed · predicted` (permission/authorization deliberately excluded — not truth-apt against
reality). Schedules, reservations, requirements, constraints, goals, promises, forecasts, and
policies are all this one tuple at different facet values (a **policy** is a universal-subject-scope
generator). The **measurable sits below the semantic line** — the Condition is on reality; the
measurable is evidentiary configuration for how Facts witness it.

### System Design
The runtime is a **read-derivable comparison engine over two append-only ledgers**: Authoring Intake
→ Expectation Store (extensional) → Generators (virtual-by-default, condense-on-exception) → pure
Evaluation Engine → derived read layer (Gap/Judgment/Projection/Preview) → effector boundary. The
three previously-open questions are resolved at system-design level: (A1) Conditions are Type-fixed
predicate shapes with the measurable bound in Configuration below the line; (A2) exactly **one**
gap→effector binding — the existing Business-Process trigger model generalized; (A3) **incremental,
footprint-indexed** evaluation, never a standing full sweep.

### Integration
Records own **neither** ledger (a record is a view over both). Actions author intent. Communications
is an effector consuming gaps and typed transitions (un-says stale messages via lineage). Business
Processes read facts/expectations/gaps, author expectations, and may be bound as a gap-response.
Configuration owns the intensional layer (Types/Templates/Policies/Recurrence/Bindings). Processing
owns clock/recurrence/evaluation/replay/propagation mechanics and never chooses responses. **Billing
(D12a) is the financial-modality consumer** and the **parity proof** for the generalized engine.

---

## 4. Repository Status

- **Doctrine convergence — COMPLETE.** One consistent ontology across all canonical docs. "Expectation"
  reserved for the authored ledger; "Projection" for derived state; **Law 2 rewritten**. Nine files
  reconciled; full-tree scan clean. See the convergence certification.
- **Architecture documents — COMPLETE.** The frozen system design and this closeout are the two
  authoritative architecture artifacts; the convergence certification is the consistency record.
- **Canonical references — ALIGNED.** `operational-truth-flow-doctrine.md` (Law 2 + L3→Projection),
  `operational-ux-doctrine.md`, `operational-expansion-phase1.md` (RFC), `attendance-system.md`,
  `financial-platform-domain.md`, `billing-financials-platform.md`, `glossary.md` (terminology map),
  and the active Phase A audit all carry the two-ledger ontology.
- **Remaining documentation (additive, NOT conflicts).** `foundation/platform-capabilities.md` does
  not yet list Operational Expectations / Operational Facts as capabilities (an addition pending the
  build). Legacy code symbols under `expectations/*` still carry `Expectation` names and denote L3
  Projections (an implementation rename). Neither affects ontological consistency.

---

## 5. Frozen Decisions

Immutable unless a **future architecture initiative explicitly changes them**:

1. **Two authored ledgers** — Operational Facts (observed) and Operational Expectations (intended) —
   neither derivable from the other.
2. **Expectations are authored and authoritative**, not derived (the rewritten Law 2).
3. **The Expectation tuple** ⟨Authority · Modality · Subject · Condition · Temporal Frame ·
   [Beneficiary]⟩.
4. **The closed set of five modalities** (required/prohibited/intended/committed/predicted);
   permission/authorization excluded.
5. **The measurable is below the semantic line** (Condition on reality; measurable in Config).
6. **Judgment is derived and modality-relative**; Gap is derived and read-only.
7. **The six Platform Laws** — Purity, Acyclic, Authored-vs-Derived (no "mark fulfilled"),
   Witness/Assert/Compare, Non-derivability, Standing-is-meaning.
8. **Revision ≠ Correction** (re-plan forward vs unwind).
9. **Everything downstream is derived** — Projection is the derived layer; Scheduling/Forecasting are
   Projections; Current Work is a surface over unresolved gaps; Billing is a financial Projection +
   effector.
10. **Terminology lock** — "Expectation" = authored ledger; "Projection" = derived state.
11. **One gap→effector binding mechanism** = the generalized Business-Process trigger model (no second
    trigger system).
12. **Billing (D12a) is consumer #1** and the parity proof; the evaluation engine is
    modality-agnostic.
13. **Standing / ratification** — AI and low-trust external authors produce only proposed
    expectations; deontic/commissive proposals bind only when ratified; AI never self-ratifies.

---

## 6. Remaining Work

### Architecture — **COMPLETE.**
There is no remaining architecture work. Ontology, semantic model, laws, boundaries, and system design
are frozen. The three previously-open architecture questions were resolved at the system-design level.

### Implementation — the entirety of what remains.
The engineering packages (detailed in the system design, §14) — substrate + doctrine-reconciliation
landing, the Expectation ledger + authoring intake, Configuration (intensional layer), the generalized
evaluation engine + Billing parity retrofit, Processing, derived Surfaces, Current Work integration,
effector bindings, and the AI authoring path — are all **implementation**. See §8.

---

## 7. Risks (implementation only)

1. **Purity leak** — response logic creeping into the ledger/engine, or the engine invoking an
   effector directly. Guard: effectors only via Config binding; engine is a pure function.
2. **The "mark fulfilled" temptation** — a complete/resolve action on an expectation. Fulfillment is a
   Fact; a gap closes only when a Fact re-derives satisfaction.
3. **A second trigger system** — building a gap→response evaluator parallel to Business-Process
   triggers. Unify at one binding location.
4. **Revision/Correction conflation** — mishandling the two as one causes over-billing or orphaned
   draft charges (the adversarially-verified D12 scenario). Type the transitions.
5. **Cyclic writes** — a derived read writing the ledger, or a consumer mutating expectations directly
   instead of authoring.
6. **Ledger explosion or lost exceptions** — materializing every policy/recurrence instance, or never
   condensing exceptions. Virtual-by-default, condense-on-exception.
7. **Measurable above the line** — coupling a Condition to a sensor rather than to reality.
8. **Impure evaluation** — reading now-dependent state not captured as a Fact/clock-fact, breaking
   replay determinism.
9. **Standing bypass** — unratified deontic/commissive expectations binding a consumer.
10. **Non-derivability erosion** — auto-authoring one ledger from the other, or "closing" an
    expectation because a fact appeared without re-evaluation.

*(All are implementation risks. No architectural risks remain — the architecture is frozen.)*

---

## 8. Recommended Engineering Sequence (high-level packages only)

1. **P0 — Doctrine-reconciliation landing + substrate alignment.** (Reconciliation already authored;
   confirm the bitemporal/lineage/replay substrate hosts the Expectation ledger.)
2. **P1 — Expectation Ledger & Authoring Intake** (with Security/Standing).
3. **P2 — Configuration (intensional layer)** incl. the unified gap→effector binding.
4. **P3 — Generalized Evaluation Engine + Billing (D12a) parity retrofit** — the keystone / parity
   proof.
5. **P4 — Processing** (clock/recurrence/evaluation/replay/propagation; footprint index).
6. **P5 — Derived Surfaces** (Timeline/Grid/GapView/History/Preview).
7. **P6 — Current Work integration.**
8. **P7 — Effector bindings** (Communications + process-as-response).
9. **P8 — AI authoring path** (proposed expectations + ratification + Preview + Forecasting/
   Recommendations).

**Sequencing principle:** prove the engine on the existing Billing consumer before any net-new
consumer; land the correction-aware contract before wiring drafts.

---

## 9. Open Questions (implementation only)

All ontology and architecture questions are closed. Remaining questions are engineering choices that
do **not** affect meaning:

1. **Ledger persistence mechanics** — storage/indexing for the extensional Expectation store and its
   bitemporal/lineage columns on the existing substrate.
2. **Footprint-index realization** — the concrete indexing and incremental-recompute mechanism, and
   its cost envelope under production fact-arrival rates.
3. **Condense trigger implementation** — where virtual generator instances materialize into
   extensional rows (exception vs durable-identity need).
4. **Parity-harness construction** — how the Billing retrofit reproduces shipped Consumption outcomes
   for the parity gate.
5. **Surface composition** — how the five surfaces are assembled in Surface Builder, including the
   subject-indexed timeline read model.
6. **Migration/sequencing** — ordering of the package rollout against the current staging tree.

*(None reopen ontology, semantics, laws, or boundaries.)*

---

## 10. Formal Handoff

The Operational Expectations architecture initiative is **complete**. The ontology, semantic model,
platform laws, system design, and integration boundaries are **frozen**. The documentation corpus is
**converged and certified consistent**. The remaining scope is **engineering implementation**,
sequenced above, to be executed against the frozen system design **without further architectural
decisions**.

**Implementation may begin.**

---

**Platform Discovery is complete. Operational Expectations is now a frozen Alloy platform capability.
Future work belongs to engineering implementation rather than architectural discovery.**
