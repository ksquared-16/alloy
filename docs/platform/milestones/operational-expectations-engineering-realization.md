---
owner: platform
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Operational Expectations — Engineering Realization Plan

**Status:** Master implementation roadmap (Realization Phase), 2026-07-13. Architecture is **frozen**.
This document does **not** reopen ontology, re-argue semantics, or redesign the capability. It
translates the frozen [system design](../core/operational-expectations-system-design.md) into an
**executable engineering program**: packages, dependencies, milestones, certification, migration,
risk, rollout, and the recommended Cursor sequence.

## Corpus Freeze Declaration

```
Platform Discovery: Complete
Architecture: Frozen
Engineering Realization: Approved
Implementation Status: Not Started
```

This declaration governs the whole Operational Expectations corpus (the four documents in the
*Authority chain* below) under the existing
[documentation governance](../governance/documentation-governance.md) freeze policy — no new governance
concept is introduced. The frozen architecture carries `status: frozen` ("approved architecture locked
at a point in time"); this realization plan is the `status: canonical` implementation baseline over it.
The freeze means:

- **Architecture may not be reopened inside implementation threads.** The frozen ontology, the closed
  five-modality set, the six Platform Laws, the package boundaries (P0–P8, X0), and the §A resolutions
  are locked.
- **Implementation discrepancies escalate to the corpus.** A contradiction or a missing contract is
  raised to architecture governance (§22), never resolved by local, domain-specific behavior.
- **Package implementation may choose internal techniques only within its declared Internal
  Implementation Freedom** (§13) — never by altering a boundary or a Stable Public Interface.
- **Changes to a Stable Public Interface (§13) require explicit architecture governance.** They are not
  an in-thread decision.
- **Implementation evidence may update certification and rollout records** (§5, §8, §19, §20) without
  silently modifying architectural meaning.

The governing execution program derived from this plan (Platform Realization) is the
[implementation program](./operational-expectations-implementation-program.md).

> **Authority chain.** The [architecture closeout](./operational-expectations-architecture-closeout.md)
> froze the capability; the [system design](../core/operational-expectations-system-design.md) resolved the
> three open implementation questions at the design level (§A) and defined packages **P0–P8** (§14),
> the dependency order (§15), the risk areas (§16), and the certification gates (§17); the
> [doctrine convergence certification](./operational-expectations-doctrine-convergence.md) swept the
> canonical docs onto the two-ledger ontology. **This plan is downstream of all three.** Where it
> appears to make a decision, it is scheduling and sequencing an already-frozen one — never coining a
> new one. Any pressure to change a frozen decision is an **architecture escalation** (§14 of this
> doc), not a planning adjustment.

---

## 0. How to read this document

The system design answers *what each package is*. This plan answers *how the program runs*: what ships
first, what must be true before what, what proves each step, and how Billing/Scheduling/Current
Work/future domains fold in without touching the engine. Eight deliverables, numbered to the request:

1. **Implementation Package Map** — §2
2. **Dependency Graph** — §3
3. **Engineering Milestones** — §4
4. **Certification Matrix** — §5
5. **Migration Plan** — §6
6. **Risk Register** — §7
7. **Incremental Rollout Plan** — §8
8. **Recommended Cursor Implementation Sequence** — §9

Cross-cutting strategies the request calls out are folded into the deliverable that owns them:
backward compatibility (§6 + §8), billing retrofit (§4.M2 + §6.2 + §8.2), Current Work evolution
(§4.M4 + §8.4), scheduling composition proof (§4.M4 + §10.1), future-domain rollout (§10.2),
feature-flag strategy (§8.1), testing strategy (§11), migration sequencing (§6).

**Part II — Engineering Execution Contracts (§13–§20)** removes every remaining implementation
ambiguity so work can split across many independent Cursor threads without architectural discussion:
Package Interface Contracts (§13), Ownership Boundaries (§14), Engineering Build Order (§15), Canonical
Proofs (§16), Integration Dependency Matrix (§17), Forbidden During Implementation (§18), Engineering
Checklists (§19), Implementation Risk Register — Execution (§20). Part II adds **no architecture, no
ontology, no new package** — it is the contract layer over the frozen design.

**Non-goals (enforced):** no table design, no API design, no code, no schema, no implementation
detail. This is the program, not the build.

---

## 1. The single load-bearing idea of the program

Everything in the sequence exists to **prove one general engine on an already-shipped consumer before
building any net-new consumer.** The keystone is **P3 — the generalized modality-relative evaluation
engine, proven by retrofitting D12a Billing as consumer #1 and reproducing shipped Consumption V1
outcomes exactly (G-Parity).** Every package before P3 exists to make that retrofit possible; every
package after P3 is a consumer or surface that the parity proof has already de-risked.

If the program does only one thing correctly, it is this: **do not build a second consumer until the
engine has reproduced an existing one bit-for-bit.** That single discipline is what prevents the
capability from fragmenting into per-domain logic — the exact failure the closed-modality, one-engine
architecture was designed to prevent.

---

## 2. Deliverable 1 — Implementation Package Map

Nine packages (P0–P8) plus one cross-cutting concern. Each entry states the package **mission**, its
**boundary** (what it must not absorb), its **program-level definition of done** (behavioral, not
code), and the **gate(s)** it clears. Package scope is fixed by system-design §14 and is **not**
re-cut here.

### P0 — Doctrine Reconciliation & Substrate Alignment  *(prerequisite; blocks all code)*
- **Mission.** Land the §0.5 reconciliation sweep (rename derived-L3 "Expectations" → **Projection**;
  rewrite Law 2 to "Projections derived / Expectations authored"). Confirm the bitemporal / lineage /
  replay substrate already carrying Facts can host the second (Expectation) ledger, and that the Fact
  Contract is usable as the read seam.
- **Boundary.** No ledger code, no authoring. This is a **naming + substrate-fitness** package only.
- **Done when.** No occurrence of "Expectation" in canonical docs means derived state; the substrate
  demonstrably hosts a twin append-only/bitemporal/lineage ledger; the correction-carrying Fact
  Contract is present as a read interface.
- **Clears.** G-Reconciliation. Retires R11.

### P1 — Expectation Ledger & Authoring Intake  *(foundation)*
- **Mission.** The extensional, append-only, bitemporal, lineage-tracked store of Expectation
  assertions; the five authoring verbs (`create · revise · correct · replace · cancel`); tuple
  grammar; **modality closure**; **semantic-line** enforcement; Temporal-Frame presence; the
  **Revision ≠ Correction** typed distinction. **Security / Standing / Authority lands here**, not as
  later hardening.
- **Boundary.** No evaluation, no gaps, no effectors, no config UI. Authoring only. It never writes a
  Fact; it never selects a response.
- **Done when.** Grammar rejects malformed tuples and any sixth modality; a correction unwinds while a
  revision re-plans; every act is attributable (actor · authority · standing · transaction-time); no
  author can assert an expectation whose Authority they do not hold.
- **Clears.** G-Modality-Closure, G-Standing (authoring half), G-Correction/G-Revision (authoring
  half), contributes to G-Acyclic.

### P2 — Configuration (intensional layer)
- **Mission.** Types / Templates / Policies / Recurrence definitions, effective-dated and
  **supersede-not-patch**; **both** binding kinds — **measurable bindings** (A1) and the **unified
  gap→effector binding** (A2) that generalizes the *existing* Business-Process trigger model.
- **Boundary.** Config supplies **intensional** generators/constraints; the ledger stays
  **extensional**. There must be **exactly one** gap→response binding mechanism — no second
  "when-gap-then-do" evaluator.
- **Done when.** Two different measurable bindings for the same Condition yield identical judgment; the
  gap→effector binding is demonstrably the one, unified mechanism.
- **Clears.** G-Unified-Binding, G-Semantic-Line (config half).

### P3 — Generalized Evaluation Engine + Billing Parity Retrofit  *(**keystone**)*
- **Mission.** The pure, modality-relative comparison `(Expectation, relevant Facts, clock) →
  Judgment + Gap`; then **retrofit D12a Billing as consumer #1** and reproduce shipped Consumption V1
  outcomes exactly.
- **Boundary.** The engine is **pure** and **side-effect-free** — it derives, it never invokes an
  effector, never authors, never mutates a gap. Billing consumes; the engine does not know Billing
  exists.
- **Done when.** The generalized engine, run as Billing's financial-modality consumer, reproduces
  every shipped Consumption V1 (Slices 1–4) outcome bit-for-bit in shadow, then in cutover.
- **Clears.** **G-Parity (keystone)**, G-Purity (engine half), G-Correction (financial unwind).

### P4 — Processing
- **Mission.** Clock (emits clock-facts; **no separate timer subsystem**), recurrence expansion
  (virtual-by-default, condense-on-exception), evaluation scheduling on a **footprint index** with an
  **incremental** cost model (A3), replay, and **typed transition fan-out** on lineage.
- **Boundary.** Mechanics only — *when / how-often / how-much*. Processing **never chooses a response**
  and never selects an effector.
- **Done when.** Evaluation is incremental (no standing full sweep); replay is deterministic; every
  authored transition reaches every registered consumer as a typed event.
- **Clears.** G-Replay-Determinism, G-Acyclic (mechanics half), propagation-completeness evidence.

### P5 — Derived Surfaces
- **Mission.** Timeline · Grid · GapView · History · Preview, composed via the existing Surface
  Builder, on the **subject-indexed timeline read model** (the `workflow_events` jsonb subject is not
  indexable — this read model is a required build, not a nicety).
- **Boundary.** All five are **read models**. Preview writes nothing (pure evaluation over a
  hypothetical ledger). No surface authors, closes, or mutates.
- **Done when.** Preview produces zero writes; History renders Revision vs Correction distinctly;
  GapView is the raw feed Current Work selects from.
- **Clears.** Preview-purity evidence, contributes to G-Coverage (blind-spot surfacing).

### P6 — Current Work Integration
- **Mission.** GapView → Current Work **selection** (threshold: decision-bearing + material +
  governed-by-rule + actionable + accountable owner) with a **reconciliation identity**; un-say /
  withdraw on transitions.
- **Boundary.** Current Work **selects** gaps; it does not close them (a gap closes only when a Fact
  re-derives satisfaction — no "mark done"). It never authors an expectation to clear its own item.
- **Done when.** A correction withdraws the corresponding work item; no orphaned items after any
  transition.
- **Clears.** R2 guard (no mark-fulfilled), contributes to G-Correction.

### P7 — Effector Bindings
- **Mission.** Route gaps + typed transitions through the **unified binding** to **Communications**
  and **process-as-response**; un-say propagation on revision/correction/cancel.
- **Boundary.** Effectors are bound only in Config; the ledger/engine invokes nothing. Comms un-says
  stale messages via lineage.
- **Done when.** Purity holds end-to-end (no path from engine/ledger to an effector); propagation is
  complete (no stale message, no orphaned draft charge).
- **Clears.** G-Purity (full), propagation-completeness (full).

### P8 — AI Authoring Path
- **Mission.** Proposed-expectation authoring + **ratification gate** + Preview-before-ratify;
  Forecasting (`predicted`) and Recommendations (proposed `required`/`intended`).
- **Boundary.** AI authors **only proposed** expectations and **never self-ratifies**. A `predicted`
  expectation may stand at model standing (imposes no obligation); promotion to a deontic/commissive
  modality requires ratification.
- **Done when.** No unratified deontic/commissive expectation ever binds a consumer; every AI proposal
  can be previewed before it is ratified.
- **Clears.** G-Standing (full).

### X0 — Security · Standing · Ratification  *(cross-cutting, not a phase)*
- Underpins **P1** (authoring gate) and **P8** (ratification gate). Tracked as a spanning concern with
  its own acceptance evidence (G-Standing), but delivered **inside** P1 and P8 — never deferred to a
  "hardening" phase, because authoring without standing is a semantic violation, not a security
  gap.

---

## 3. Deliverable 2 — Dependency Graph

The system design fixes the order (§15). Rendered here as a **program DAG** with critical path, hard
vs soft edges, and the parallelizable lanes.

```
        Operational Facts (EXISTS) ───────────────────────────────┐  (read seam, correction-carrying)
                                                                   │
  ┌── P0 Reconciliation + Substrate ──┐                            │
  │        (blocks ALL code)          │                            │
  └──────────────┬────────────────────┘                           │
                 ▼                                                 │
         P1 Ledger + Authoring ──────────────┐                     │
          (Security/Standing here)           │                     │
                 │                            ▼                     ▼
                 ├──────────────► P2 Config ──┴──► P3 Engine + Billing Parity ◄── Consumption V1 (SHIPPED)
                 │                            │         │ ★ KEYSTONE (G-Parity)
                 │                            ▼         ▼
                 └──────────────────────► P4 Processing ◄┘
                                              │
              ┌───────────────────────────────┼───────────────────────────┐
              ▼                                ▼                           ▼
        P5 Surfaces                      P7 Effectors              (typed transition fan-out)
              │                                │
              ▼                                │
        P6 Current Work ◄────────────────────── ┘
              │
              ▼
        P8 AI Authoring   (needs P1 intake + P5 Preview + X0 ratification)
```

**Critical path (longest hard chain):** `P0 → P1 → P3 → P4 → P6`. P3 sits on the critical path and is
the keystone — schedule the strongest engineering there.

**Hard edges (must-precede, non-negotiable):**
- P0 → everything. No P1 code ships before the reconciliation sweep lands, or the ledger reads as a
  Law-2 violation to every reviewer (R11).
- P1 → P2, P1 → P3, P1 → P4. Authoring intake and the ledger substrate precede config, engine, and
  processing.
- P2 → P3 (measurable binding), P2 → P7 (gap→effector binding).
- P3 → P4 (processing schedules the engine), P3 → P5/P6/P7 (surfaces/consumers read judgment/gaps).
- P1 + P5(Preview) + X0 → P8.
- **Consumption V1 (shipped) → P3** as the parity oracle: the retrofit target must exist and be frozen
  before the engine is proven against it.

**Soft edges (preferred, not blocking):** P5 and P7 can proceed in parallel once P4's transition
fan-out is stable; P6 wants P5's GapView but can integrate against the read model directly.

**Parallelizable lanes after the keystone (P3 green):**
- Lane A: P5 Surfaces
- Lane B: P7 Effectors
- Lane C: P4 hardening (footprint cost model, replay corpus)
- These converge into P6, then P8 last.

---

## 4. Deliverable 3 — Engineering Milestones

Packages grouped into **shippable increments**. Each milestone has an entry condition, an exit
condition, and a **demo** (the observable proof — not a test count). A milestone is not "done" until
its demo runs on a live vertical.

### M0 — Reconciliation Landed  *(P0)*
- **Entry.** Frozen corpus merged to the working line; `origin/staging` base confirmed.
- **Exit.** Doctrine sweep merged; Law 2 amended; derived-L3 renamed Projection across docs; substrate
  fitness confirmed. **G-Reconciliation green; R11 retired.**
- **Demo.** A repo grep shows zero doctrine uses of "Expectation" for derived state; the truth-flow
  doctrine reads "Expectations authored."

### M1 — Ledger Foundation  *(P1 + X0)*
- **Entry.** M0 complete.
- **Exit.** Authoring intake admits the five verbs; grammar/modality-closure/semantic-line enforced;
  Revision≠Correction typed; Standing/Authority gate live.
- **Demo.** Author a `required` staffing-ratio expectation on a real room; attempt a malformed and a
  sixth-modality act (both rejected); revise it (re-plans) and correct it (unwinds) — lineage visible.
  **G-Modality-Closure, G-Standing (authoring) green.**

### M2 — Keystone Parity  *(P2 + P3)*  — **the make-or-break milestone**
- **Entry.** M1 complete; Consumption V1 outcomes frozen as the parity oracle.
- **Exit.** Config (Types/Policies/Recurrence + both bindings, unified gap→effector) live; the pure
  engine derives Judgment/Gap; **Billing D12a runs as consumer #1 and reproduces shipped Consumption
  V1 outcomes exactly**, first in shadow, then cutover.
- **Demo.** Replay the shipped Consumption V1 corpus through the generalized engine; diff against
  recorded outcomes = **zero divergence**; a downward financial correction unwinds without over-bill or
  orphaned draft. **G-Parity (keystone), G-Unified-Binding, G-Semantic-Line, G-Purity (engine),
  G-Correction (financial) green.**
- **Gate discipline.** No package past M2 starts until G-Parity is green. This is the program's
  hard checkpoint.

### M3 — Runtime & Replay  *(P4)*
- **Entry.** M2 complete (engine proven).
- **Exit.** Footprint-indexed incremental evaluation (no standing sweep); clock-facts drive deadline
  crossings; deterministic replay; typed transition fan-out to registered consumers.
- **Demo.** Land a Fact inside one footprint → only the dependent verdict recomputes; replay a
  historical `(valid-time, transaction-time)` → reproduces recorded judgment exactly. **G-Replay-
  Determinism, G-Acyclic green.**

### M4 — Surfaces, Current Work & Scheduling Composition Proof  *(P5 + P6)*
- **Entry.** M3 complete.
- **Exit.** Timeline/Grid/GapView/History/Preview on the subject-indexed read model; GapView → Current
  Work selection with reconciliation identity; un-say/withdraw on transitions. **Scheduling and
  Capacity demonstrated as pure Projections over committed/temporal expectations — no new capability
  (see §10.1).**
- **Demo.** The §10 lifecycle end-to-end on a live room: gap appears in GapView → selected into Current
  Work → a correction withdraws the item; the Grid renders rooms × slots × ratio-status purely from
  the ledgers. **Preview-purity, G-Coverage (partial) green.**

### M5 — Effectors  *(P7)*
- **Entry.** M4 complete.
- **Exit.** Gaps + transitions routed through the unified binding to Comms and process-as-response;
  un-say propagation.
- **Demo.** A ratio violation routes to a Comms alert and a staffing process (which authors a
  committed expectation for a floater); a Fact correction un-says the alert. **G-Purity (full),
  propagation-completeness green.**

### M6 — AI Authoring & Forecasting  *(P8)*
- **Entry.** M5 complete.
- **Exit.** Proposed-expectation authoring + ratification gate + Preview-before-ratify; Forecasting
  (`predicted`) and Recommendations live.
- **Demo.** An AI recommendation is authored as a **proposed** `intended` expectation, previewed, and
  binds **only** after an authority ratifies; an unratified deontic proposal never binds. **G-Standing
  (full) green.**

### M7 — Platform Certification  *(no new scope)*
- **Exit.** **All** §17 gates green **and** the §10 lifecycle demonstrated on a live vertical **and**
  the Billing parity retrofit merged. Capability declared **operational**.

---

## 5. Deliverable 4 — Certification Matrix

Every gate from system-design §17 mapped to the package that clears it, the milestone by which it must
be green, the evidence class, and the accountable role. Gates are **binary** — no partial credit.

| Gate | Cleared by | Green by | Evidence class | Owner |
|---|---|---|---|---|
| **G-Reconciliation** | P0 | M0 | Repo grep + doctrine diff; no "Expectation = derived" | Platform doctrine |
| **G-Modality-Closure** | P1 | M1 | Authoring rejects any 6th modality | Ledger eng |
| **G-Standing** | P1 + P8 (X0) | M1 (author), M6 (ratify) | No unratified deontic binds; AI can't self-ratify | Ledger + AI eng |
| **G-Correction** | P1 + P3 + P6 | M2 (financial), M4 (work) | Correction unwinds; no over-bill/orphan | Ledger + Billing eng |
| **G-Revision** | P1 | M1 | Revision re-plans forward; valid past intact | Ledger eng |
| **G-Unified-Binding** | P2 | M2 | Exactly one gap→response mechanism | Config eng |
| **G-Semantic-Line** | P2 + P1 | M2 | Two bindings, same Condition → identical judgment | Config eng |
| **G-Parity** *(keystone)* | P3 | M2 | Engine reproduces shipped Consumption V1 exactly | Engine + Billing eng |
| **G-Purity** | P3 + P7 | M2 (engine), M5 (full) | No engine/ledger → effector path | Engine + Effector eng |
| **G-Acyclic** | P1 + P4 | M3 | Gaps/judgments read-only; writes are authoring acts | Ledger + Processing eng |
| **G-Replay-Determinism** | P4 | M3 | Golden replay corpus reproduces judgment | Processing eng |
| **G-Coverage** | P5 + observability | M4 (partial), M7 (full) | Blind spots surfaced (unbindable Conditions, unwitnessed intent) | Surfaces eng |

**Certification rule:** M7 (capability operational) requires the full column green **plus** the live
§10 lifecycle demo **plus** merged Billing parity. Any gate regressing after green **blocks the next
milestone** — gates are standing invariants in CI, not one-time checks.

---

## 6. Deliverable 5 — Migration Plan

Three migrations, sequenced. Each is **additive-then-cutover**, never big-bang. Migration sequencing is
itself on the critical path (P0 before all code; parity before draft-wiring).

### 6.1 Doctrine & terminology migration  *(P0 / M0)*
- **What moves.** Derived-L3 "Expectations" → **Projection** in all canonical docs; Law 2 rewritten.
  Code-symbol renames (`scheduleExpectationCore.ts` etc.) and the `readiness_expectations` BP field are
  **explicit carve-outs** — impl-scope follow-ups, not part of the doctrine sweep (per the convergence
  certification). `platform-capabilities.md` gains Operational Expectations + Facts as capabilities.
- **Backward compatibility.** Docs-only; no runtime impact. The carve-out code symbols keep their
  names until a later, separately-scheduled rename so no import breaks during the ledger build.
- **Sequencing rule.** **Blocks all P1 code.** Land first, or every ledger review reads as a Law-2
  violation (R11).

### 6.2 Billing retrofit migration  *(P3 / M2)* — **the parity migration**
- **What moves.** D12a Billing shifts from consuming the **old financial_* config path** to consuming
  the **generalized engine's judgment** on committed/required financial-subject expectations.
- **Strategy — shadow → compare → cutover:**
  1. **Shadow.** Run the generalized engine alongside live Consumption V1; both produce outcomes; the
     live pipeline stays authoritative.
  2. **Compare.** Diff generalized-engine outcomes against shipped V1 outcomes across the frozen
     corpus (Slices 1–4). Target: **zero divergence** = G-Parity.
  3. **Cutover.** Only after zero-divergence, the generalized engine becomes Billing's source; the old
     path is retired behind a flag, then removed.
- **Backward compatibility.** The shipped Consumption V1 pipeline **keeps running unchanged** through
  shadow and compare. Cutover is reversible (flag flip) until the old path is deleted. **Posting stays
  the first authoritative write; DRAFT charges are the only thing a correction ever voids** — never a
  posted charge (the adversarially-verified D12 over-bill/orphan finding is the acceptance criterion).
- **Sequencing rule.** Wire the **correction-aware contract before wiring drafts.** A reversal /
  downward correction must never over-bill or orphan a draft.

### 6.3 Current Work evolution migration  *(P6 / M4)*
- **What moves.** Current Work evolves from today's queue/work-view model to **selecting over the
  derived GapView** with a reconciliation identity (the gap identity). Existing Work-Unit lead
  membership and queue semantics are the **selection substrate**, not replaced wholesale.
- **Backward compatibility.** GapView is additive — it is a new derived feed. Current Work adopts it as
  a source; existing surfaces keep functioning until selection is proven. Un-say/withdraw is the new
  behavior on transitions; it must never leave an orphaned item.
- **Sequencing rule.** Depends on P5 GapView + P4 transition fan-out being stable.

**Migration invariants (all three):** additive before subtractive; the old path stays live until the
new path certifies; every cutover is flag-reversible until the retired path is deleted; no migration
mutates history (both ledgers are append-only — corrections supersede, never overwrite).

---

## 7. Deliverable 6 — Risk Register

System-design §16 defines the **architectural** risk surface (R1–R11). This register keeps those as
standing guards and adds **program-execution** risks (R12–R17): scheduling, parity, cost, and the
known data gaps. Severity × exposure-phase × mitigation × guard/gate × early-warning × owner.

### 7.1 Architectural risks (standing — from §16; must never regress)

| # | Risk | Sev | Exposure | Mitigation / Guard | Early warning |
|---|---|---|---|---|---|
| R1 | Purity leak (response inside engine/ledger) | High | P3, P7 | Effectors bound only in Config; engine pure. **G-Purity** | A "when violated do X" branch appears in engine review |
| R2 | "Mark fulfilled" verb | High | P1, P6 | No lifecycle status beyond authored transitions. **Law 3** | A resolve/close/complete action on an expectation |
| R3 | Second trigger system | High | P2, P7 | One binding location (A2). **G-Unified-Binding** | A parallel gap→response evaluator proposed |
| R4 | Cyclic writes | High | P3–P7 | Derived layer read-only; all writes via intake. **G-Acyclic** | A consumer mutates expectations directly |
| R5 | Revision/Correction conflation | High | P1, P3, P6 | Typed transitions; consumers branch on type. **G-Correction/Revision** | A correction handled as a revision |
| R6 | Materializing the intensional layer | Med | P2, P4 | Virtual-by-default, condense-on-exception | Ledger row count tracks recurrence horizon |
| R7 | Measurable above the line | High | P1, P2 | Condition on reality; measurable is Config binding. **G-Semantic-Line** | An expectation names a sensor |
| R8 | Impure evaluation | High | P3, P4 | Clock is a Fact; replay-determinism in CI. **G-Replay-Determinism** | Replay diverges from recorded judgment |
| R9 | Standing bypass | High | P1, P8 | Standing gate at intake; deontic can't bind unratified. **G-Standing** | AI/external authoring binds without ratification |
| R10 | Non-derivability erosion | High | P1, P3 | Ledgers never write each other; only pure engine compares. **Law 5** | Auto-authoring an expectation from a fact |
| R11 | Name ambiguity (until P0) | Med | P0 | §0.5 sweep is P0-blocking. **G-Reconciliation** | Reviewer reads "Expectations" as derived-L3 |

### 7.2 Program-execution risks (new — this plan's responsibility)

| # | Risk | Sev | Exposure | Mitigation | Owner / early warning |
|---|---|---|---|---|---|
| **R12** | **Parity divergence hides a semantic error** — the engine "matches" V1 by replicating a V1 bug rather than deriving correctly | High | M2 | Parity target is *behavioral outcome*, not internal path; pair G-Parity with G-Correction (correction cases V1 may not have exercised) so the engine is proven on paths beyond the corpus | Engine eng; warning = parity green but a correction case fails |
| **R13** | **Evaluation cost blows up** — standing/continuous evaluation is more expensive than footprint-incremental predicts | High | M3 | A3 footprint index + incremental cost model; observability tracks evaluation lag / judgment freshness as an SLO from day one | Processing eng; warning = judgment-freshness SLO breach under fact load |
| **R14** | **Staffing-presence facts don't exist** — the §10 lifecycle needs staff-presence facts to judge ratio requirements; this is a known data gap | High | M2–M4 | Treat staff-presence-fact emission as an explicit prerequisite work item for the live vertical; do not schedule the ratio lifecycle demo until it lands | Platform; warning = ratio Conditions have no measurable binding (G-Coverage flags it) |
| **R15** | **Keystone slips and downstream starts early** — pressure to begin P5/P6 before G-Parity is green | High | M2→M3 | Hard gate discipline (§4.M2): no package past M2 starts until G-Parity green; the DAG makes this explicit | Program lead; warning = a P5/P6 branch opens with parity still red |
| **R16** | **Scope creep via a "sixth modality"** — a vertical appears to need a modality outside the closed five | Med | M4+, §10.2 | An apparent sixth modality is an **architecture escalation**, not a feature; route to the frozen-architecture owner, do not extend in-flight | Platform; warning = a Type won't fit required/prohibited/intended/committed/predicted |
| **R17** | **Corpus drift** — the frozen trio is amended informally during implementation, reopening architecture | Med | All | This plan and the trio are versioned; changes to §14/§15/§17 follow the system-design "when to update" clause; no in-flight edits to frozen semantics | Platform doctrine; warning = a PR edits a frozen doc's semantics |

---

## 8. Deliverable 7 — Incremental Rollout Plan

Rollout is **shadow-first, flag-gated, consumer-by-consumer, reversible.** No consumer is cut over
before its judgment is proven against a live oracle.

### 8.1 Feature-flag strategy
- **`oe.ledger.author`** — gates authoring intake (P1). Off → no expectations authored; the system is
  Facts-only, exactly as today.
- **`oe.engine.shadow`** — runs the generalized engine in shadow alongside live Billing (P3). Off →
  Consumption V1 is sole authority.
- **`oe.engine.authoritative.billing`** — flips Billing to consume the generalized engine (P3 cutover).
  Reversible until the old path is deleted.
- **`oe.surfaces.*`** — dark-launch each derived surface (P5) to operators before it drives work.
- **`oe.currentwork.gap-selection`** — Current Work selects over GapView (P6). Off → existing queues.
- **`oe.effectors.<comms|process>`** — enable each effector binding independently (P7).
- **`oe.ai.propose`** / **`oe.ai.ratify-required`** — AI may author proposed expectations; deontic
  proposals require explicit ratification (P8). AI can never self-ratify regardless of flag.

**Flag rule:** every cutover flag has a proven **off = current behavior** fallback until the retired
path is deleted. Flags gate *rollout*, never *semantics* — a flag never turns a proposed expectation
into a binding one.

### 8.2 Billing (consumer #1) rollout — the reference pattern
`shadow` → `compare (zero-divergence = G-Parity)` → `authoritative (flag flip)` → `retire old path`.
This is the template every future consumer follows.

### 8.3 Surfaces rollout
Dark-launch Timeline/Grid/GapView/History/Preview as **read-only** to operators; gather that they
render correctly from the ledgers **before** GapView feeds Current Work. Preview must be provably
write-free before it backs any AI proposal.

### 8.4 Current Work rollout
GapView available as a new feed → Current Work selects a **narrow, high-threshold** gap class first
(one modality, one vertical) → widen once un-say/withdraw is proven orphan-free → existing queues
remain until selection certifies.

### 8.5 AI rollout (last, most gated)
`predicted` (forecasting, non-binding, model standing) first → proposed `intended` (soft) →
proposed `required`/`committed` (deontic, ratification-mandatory) last. Ratification backlog is a
tracked observability number from the first proposal.

### 8.6 Backward-compatibility contract (spanning)
- Operational Facts is unchanged and remains the observed ledger throughout.
- Consumption V1's shipped pipeline runs unchanged until Billing cutover certifies.
- Existing Current Work queues run until gap-selection certifies.
- Carve-out code symbols keep their names until a separately-scheduled rename.
- Every retired path is flag-reversible until deleted; no history is ever mutated.

---

## 9. Deliverable 8 — Recommended Cursor Implementation Sequence

The concrete, ordered stream Cursor should follow. **Cursor makes no architectural decision** — each
step implements a frozen package against its gate. Where a step meets an unresolved question, it
**stops and escalates**; it does not decide. Checkpoints (◆) are hard gates: do not proceed past a red
checkpoint.

1. **P0 — Reconciliation sweep.** Land the §0.5 doctrine edits (rename derived-L3 → Projection; rewrite
   Law 2); confirm substrate fitness; add OE + Facts to `platform-capabilities.md`. ◆ **G-Reconciliation.**
2. **P1 — Ledger + authoring intake.** Extensional store on the twin substrate; five verbs; tuple
   grammar; modality closure; semantic-line enforcement; Revision≠Correction typing; **Standing/
   Authority gate**. ◆ **G-Modality-Closure, G-Standing (authoring), G-Revision.**
3. **P2 — Configuration.** Types/Templates/Policies/Recurrence (supersede-not-patch); measurable
   bindings (A1); **the one unified gap→effector binding** generalizing the existing BP trigger model
   (A2). ◆ **G-Unified-Binding, G-Semantic-Line.**
4. **P3 — Engine + Billing parity (KEYSTONE).** Pure modality-relative engine; retrofit D12a Billing as
   consumer #1; **shadow → compare → cutover**; correction-aware contract before draft-wiring.
   ◆◆ **G-Parity (hard program checkpoint), G-Purity (engine), G-Correction (financial).**
   **Do not start step 5 until G-Parity is green.**
5. **P4 — Processing.** Footprint index + incremental evaluation (A3); clock-facts (no timer); replay;
   typed transition fan-out. ◆ **G-Replay-Determinism, G-Acyclic.**
6. **P5 — Surfaces** *(parallel lane A)*. Subject-indexed timeline read model; Timeline/Grid/GapView/
   History/Preview via Surface Builder; Preview write-free. ◆ **Preview-purity.**
7. **P7 — Effectors** *(parallel lane B, after P4 fan-out stable)*. Route gaps + transitions through the
   unified binding to Comms and process-as-response; un-say propagation. ◆ **G-Purity (full),
   propagation-completeness.**
8. **P6 — Current Work.** GapView → selection with reconciliation identity; un-say/withdraw; prove the
   Scheduling/Capacity composition (§10.1) as pure projections. ◆ **G-Coverage (partial), G-Correction
   (work).**
9. **P8 — AI authoring.** Proposed-expectation authoring; ratification gate; Preview-before-ratify;
   Forecasting + Recommendations. ◆ **G-Standing (full).**
10. **M7 — Certification.** All gates green + live §10 lifecycle + merged Billing parity → declare
    operational.

**Cursor guardrails (restate at every step):** implement the frozen package, do not redesign it; the
engine is pure; there is exactly one gap→response binding; no "mark fulfilled" verb; the clock is a
Fact; AI authors only proposed expectations. An apparent need to violate any of these is an
**escalation**, not an implementation choice.

---

## 10. Composition proofs (why no new capability is needed)

### 10.1 Scheduling composition proof  *(request objective 13; proven at M4)*
Scheduling is **not** a new capability — it is a **Projection over committed temporal expectations**.
The proof, demonstrated at M4:
- The scheduling *act* authors `committed` temporal expectations through the **same P1 intake** (no
  scheduling-specific write path).
- The schedule *board* is the **Grid surface** (subjects × temporal frames × modality) — a pure read
  model over the ledgers (no scheduling-specific truth).
- Capacity is the same shape: a cap is `prohibited(exceed N)` / `required(≤ N)`; occupancy facts vs the
  cap derive at-risk/breach as a Projection.
- **Acceptance:** a schedule renders, a reservation authors a committed expectation, a conflict derives
  as a gap — with **zero scheduling-specific engine or ledger code**. If any is needed, that is a
  finding against the architecture, not a Scheduling feature.

### 10.2 Future-domain rollout strategy  *(request objective 14)*
The extension model (system-design §13) is the **repeatable playbook** for every future vertical
(compliance, maintenance, transport, health, etc.). A new domain adds **only four things and zero
engine change**:
1. **Expectation Types** (the tuple-shapes it authors).
2. **Measurable bindings** (how Facts witness its Conditions).
3. **A consumer** (its interpretation of judgment — the way D12a/Billing is finance's consumer).
4. **Gap→effector bindings** (through the one unified binding).

The **closed modality set is the guarantee**: an apparent need for a sixth modality is an architecture
escalation (R16), never a domain extension. Each new domain follows the **same shadow → compare →
cutover** rollout the Billing retrofit established (§8.2) — a new consumer is proven against a live
oracle before it drives anything. This is the identical pattern to the proven process-engine model (a
new process = a sibling definition folder, zero engine edits).

---

## 11. Testing strategy (proof classes, not test counts)

Testing is organized by the **invariant each class defends**, wired into CI as standing gates (a green
gate that later regresses blocks the next milestone):

- **Grammar / closure tests** — authoring rejects malformed tuples and any sixth modality (G-Modality-
  Closure).
- **Semantic-line tests** — two different measurable bindings for one Condition yield identical
  judgment (G-Semantic-Line).
- **Parity corpus** *(keystone)* — the generalized engine replays shipped Consumption V1 outcomes with
  zero divergence (G-Parity), extended with correction cases V1 may not have exercised (R12).
- **Replay-determinism corpus** — replaying any historical `(valid-time, transaction-time)` reproduces
  recorded judgment; divergence = a purity violation (G-Replay-Determinism).
- **Transition-typing tests** — revision re-plans forward; correction unwinds; no over-bill / orphan /
  stale message / stranded work item (G-Correction, G-Revision).
- **Purity tests** — no static path from engine/ledger to an effector; Preview produces zero writes
  (G-Purity).
- **Unified-binding test** — exactly one gap→response mechanism exists (G-Unified-Binding).
- **Standing tests** — no unratified deontic/commissive expectation binds; AI cannot self-ratify
  (G-Standing).
- **Coverage / blind-spot observability** — Conditions with no measurable binding (unjudgeable) and
  Facts with no governing expectation (unwitnessed intent) are surfaced (G-Coverage).

The **acceptance test for the whole capability** is the §10 operational lifecycle run end-to-end on a
live vertical — it exercises every seam and all six laws in one thread.

---

## 12. Milestone → gate → deliverable traceability (one-glance)

| Milestone | Packages | Gates turned green | Migration | Rollout flags |
|---|---|---|---|---|
| M0 Reconciliation | P0 | G-Reconciliation | 6.1 doctrine | — |
| M1 Ledger foundation | P1 + X0 | G-Modality-Closure, G-Standing(author), G-Revision | — | `oe.ledger.author` |
| **M2 Keystone parity** | P2 + P3 | **G-Parity**, G-Unified-Binding, G-Semantic-Line, G-Purity(engine), G-Correction(fin) | **6.2 billing retrofit** | `oe.engine.shadow` → `oe.engine.authoritative.billing` |
| M3 Runtime & replay | P4 | G-Replay-Determinism, G-Acyclic | — | — |
| M4 Surfaces + Current Work + Scheduling proof | P5 + P6 | Preview-purity, G-Coverage(partial), G-Correction(work) | 6.3 current work | `oe.surfaces.*`, `oe.currentwork.gap-selection` |
| M5 Effectors | P7 | G-Purity(full), propagation-completeness | — | `oe.effectors.*` |
| M6 AI authoring | P8 | G-Standing(full) | — | `oe.ai.propose`, `oe.ai.ratify-required` |
| M7 Certification | — | **all green + live lifecycle + merged parity** | — | — |

---

# Part II — Engineering Execution Contracts (Ambiguity Removal)

Part I is the program (packages, sequence, certification). **Part II removes every remaining
implementation ambiguity** so that work split across many independent Cursor threads never needs to
ask *who owns this, which package implements it, what is allowed, what consumes it, or when it is
done* — the answers are written here. Part II adds **no architecture, no ontology, no new package, no
new concept**; it is the contract layer over the frozen design.

### The frozen communication mechanisms (used everywhere below)

Packages communicate **only** through these frozen mechanisms — there is no other bus, and inventing a
second one is an architecture violation (R3, G-Unified-Binding). "Events" below are **logical domain
events** carried by these mechanisms, not a new messaging system or API design:

- **Authoring Act** — an immutable assertion committed to the Expectation ledger by P1 intake
  (`create · revise · correct · replace · cancel`). A **Ratification Act** is an Authoring Act that
  promotes proposed → binding.
- **Typed Transition Event** — the lineage-carried supersession type (`revision | correction |
  cancellation | replacement`) fanned out by P4 Processing. **The one propagation mechanism.**
- **Judgment Verdict (derived)** — the pure engine's modality-relative result (satisfied/violated ·
  honored/breached · respected/breached · achieved/unachieved · confirmed/disconfirmed · at-risk).
- **Gap (derived)** — reified difference on a negative/at-risk verdict; **read-only**.
- **Clock-Fact** — a time observation emitted by P4's clock; crossing a Temporal Frame triggers
  re-evaluation (no timer subsystem).
- **Fact Landing** — a Fact appearing on the Operational Facts ledger (external read seam,
  correction-carrying).
- **Configuration Version** — an effective-dated, supersede-not-patch intensional definition (Type /
  Template / Policy / Recurrence / Binding) published by P2.
- **Binding Invocation** — routing a gap/transition to an effector through **the single unified
  Binding** (A2). The only path from a derived gap to an effect.

A package "publishes" by making one of these observable; it "consumes" by reading one. **No package
reaches into another's internals** — all cross-package flow is one of the above.

---

## 13. Package Interface Contracts (Deliverable 1)

The engineering contract for each package. `Provides`/`Consumes` are the standing data/interfaces;
`Events Published`/`Consumed` are the async subset expressed in the frozen vocabulary above.
`Stable Public Interfaces` are **semantic contracts** (what is exchanged and its meaning) — **not** API
signatures or schemas (those are Internal Implementation Freedom). A thread implementing a package may
change anything under Internal Freedom without coordination; it may **not** change a Stable Public
Interface without a program-level change (§22).

### P0 — Doctrine Reconciliation & Substrate Alignment
- **Mission.** Land the §0.5 reconciliation and confirm the existing bitemporal/lineage/replay
  substrate can host the Expectation ledger as the twin of Facts.
- **Responsibilities.** Rename derived-L3 "Expectations" → Projection across canonical docs; rewrite
  Law 2; register Operational Expectations + Facts in `platform-capabilities.md`; confirm substrate
  fitness for a second append-only ledger; expose the correction-carrying Fact Contract as the read
  seam shape.
- **Explicit Non-Responsibilities.** No ledger code; no authoring; no engine; **no rename of code
  symbols** (`scheduleExpectationCore.ts`, `readiness_expectations` — carve-outs, separately
  scheduled); no schema/API.
- **Provides.** Reconciled doctrine; a substrate-fitness confirmation; the Fact Contract read seam
  (confirmed, not built).
- **Consumes.** The frozen corpus; the existing Facts substrate.
- **Events Published.** None.
- **Events Consumed.** None.
- **Required Inputs.** Frozen trio merged onto `origin/staging`.
- **Produced Outputs.** Amended doctrine/RFC/module text; capability registration; substrate-fitness
  note.
- **Stable Public Interfaces.** The correction-carrying Fact Contract (read seam) — its meaning, not
  its signature.
- **Internal Implementation Freedom.** How substrate fitness is demonstrated.
- **Certification Evidence.** G-Reconciliation (repo grep shows no doctrine use of "Expectation" for
  derived state; Law 2 amended).
- **Completion Definition.** Doctrine ambiguity eliminated; substrate proven to host the twin ledger;
  **R11 retired**. No P1 code exists before this is green.

### P1 — Expectation Ledger & Authoring Intake  *(foundation)*
- **Mission.** The authoritative authored Expectation ledger and the one intake that admits every
  authoring act. Security/Standing/Authority lands here.
- **Responsibilities.** Extensional append-only bitemporal lineage store; the five verbs; tuple
  grammar and typing; **modality closure**; **semantic-line** enforcement; Temporal-Frame presence;
  **Revision ≠ Correction** typing; Authority→Standing resolution and the authoring gate; ratification
  as an authoring act; declaration of each expectation's **dependency footprint** (handed to P4).
- **Explicit Non-Responsibilities.** No evaluation, no judgment, no gaps (P3); no clock/recurrence/
  scheduling/replay/fan-out (P4); no effector invocation (P7); no config storage/UI (P2); it **never
  writes a Fact** and **never selects a response**.
- **Provides.** The ledger read/query surface (expectation assertions + lineage); the authoring intake
  (the sole write path into the ledger); the Standing/Authority decision.
- **Consumes.** Configuration Types/Templates/Policies (P2) as authoring **constraints** (runtime
  data-flow; the build edge is P1→P2); authoring requests from Actions, Business Processes, AI (P8),
  External Systems.
- **Events Published.** **Authoring Act** (create/revise/correct/replace/cancel); **Ratification Act**.
- **Events Consumed.** None asynchronously (authoring requests are synchronous intake).
- **Required Inputs.** P0 substrate + Fact Contract read seam.
- **Produced Outputs.** Committed immutable assertion acts; lineage; standing-stamped rows.
- **Stable Public Interfaces.** The **tuple grammar** (`⟨Authority·Modality·Subject·Condition·
  TemporalFrame·[Beneficiary]⟩`); the **five verbs**; the **Revision≠Correction** typing; the
  **footprint declaration**; the Standing model. These are the contract every consumer branches on.
- **Internal Implementation Freedom.** Storage layout; indexing; validation implementation; how
  supersession is physically represented.
- **Certification Evidence.** G-Modality-Closure; G-Standing (authoring half); G-Revision; contributes
  to G-Acyclic.
- **Completion Definition.** Grammar rejects malformed/6th-modality acts; a revision re-plans and a
  correction unwinds (distinctly typed); every act is attributable; no author asserts beyond their
  Authority.

### P2 — Configuration (intensional layer)
- **Mission.** Store/version the intensional definitions and the two Bindings; supply the **one**
  unified gap→effector binding.
- **Responsibilities.** Types/Templates/Policies/Recurrence (effective-dated, supersede-not-patch);
  **measurable bindings** (A1: Condition → evidencing fact-type(s) + composition); **the unified
  gap→effector binding** (A2: gap-shape selector → effector reference, generalizing the existing
  Business-Process trigger model).
- **Explicit Non-Responsibilities.** No extensional assertions (that is the ledger, P1); no
  evaluation (P3); **no second gap→response evaluator** (there is exactly one binding mechanism); it
  does not invoke effectors (P7 routes through the binding it defines).
- **Provides.** Versioned Type/Template/Policy/Recurrence definitions; measurable bindings; the single
  gap→effector binding registry.
- **Consumes.** P1 grammar/typing primitives (Types must resolve to well-formed tuples).
- **Events Published.** **Configuration Version** (each definition, effective-dated).
- **Events Consumed.** None.
- **Required Inputs.** P1 tuple grammar.
- **Produced Outputs.** The intensional generators and constraints; both binding kinds.
- **Stable Public Interfaces.** The **Type shape contract**; the **measurable-binding contract**
  (Condition→evidence composition); the **single gap→effector binding contract** (selector→effector
  reference). Config version-at-authoring is what replay reads.
- **Internal Implementation Freedom.** Storage/versioning representation; authoring UI.
- **Certification Evidence.** G-Unified-Binding; G-Semantic-Line (config half).
- **Completion Definition.** Two measurable bindings for one Condition yield identical judgment; the
  gap→effector binding is demonstrably the one, unified mechanism.

### P3 — Generalized Evaluation Engine + Billing Parity Retrofit  *(**keystone**)*
- **Mission.** The pure modality-relative comparison, proven by retrofitting D12a Billing as consumer #1.
- **Responsibilities.** The pure function `(Expectation, relevant Facts, clock) → Judgment + Gap`;
  modality-relative verdicts; at-risk derivation; retrofit Billing to consume this judgment; reproduce
  shipped Consumption V1 outcomes exactly.
- **Explicit Non-Responsibilities.** **No side effects** — never authors, never writes a Fact, never
  mutates a gap, never invokes an effector, never knows a consumer exists; no scheduling/replay
  orchestration (P4 drives it); no config (P2); no financial logic beyond consuming judgment (Billing
  owns money).
- **Provides.** Judgment Verdicts and Gaps as **derived reads**; the modality-agnostic evaluation
  contract every consumer relies on.
- **Consumes.** Expectation assertions (P1); Fact Landings (Facts read seam); Clock-Facts (P4);
  measurable bindings (P2).
- **Events Published.** **Judgment Verdict (derived)**; **Gap (derived)**.
- **Events Consumed.** Fact Landing; Clock-Fact; Authoring Act (re-evaluate on author/revise/correct).
- **Required Inputs.** P1 ledger, P2 measurable bindings, Facts read seam, Consumption V1 outcomes as
  the parity oracle.
- **Produced Outputs.** Verdicts, gaps, at-risk signals — all reproducible by replay.
- **Stable Public Interfaces.** The **verdict vocabulary** (per-modality); the **gap contract**; the
  **purity guarantee** (same inputs → same outputs, no effects). Consumers depend on these, never on
  engine internals.
- **Internal Implementation Freedom.** Predicate evaluation algorithm; memoization; how the pure
  function is factored — provided it stays pure and deterministic.
- **Certification Evidence.** **G-Parity (keystone)**; G-Purity (engine half); G-Correction (financial
  unwind).
- **Completion Definition.** The generalized engine, as Billing's consumer, reproduces every shipped
  Consumption V1 (Slices 1–4) outcome bit-for-bit — first in shadow, then cutover — with no over-bill
  or orphaned draft on a downward correction.

### P4 — Processing
- **Mission.** All mechanics — *when/how-often/how-much* — never a response.
- **Responsibilities.** Clock (emits Clock-Facts; deadline = frame crossing, no timer); recurrence
  expansion (virtual-by-default, condense-on-exception); evaluation scheduling on a **footprint index**
  with an **incremental** cost model (A3); deterministic replay; **typed transition fan-out** on
  lineage to registered consumers.
- **Explicit Non-Responsibilities.** **Never chooses or invokes a response/effector**; never authors;
  never mutates the ledger except by driving P1 re-evaluation reads; never decides consumer reactions
  (it delivers typed transitions, consumers react).
- **Provides.** The clock; the footprint index; the incremental evaluation scheduler; the replay
  engine; the transition fan-out delivery.
- **Consumes.** Authoring Acts + Ratification Acts (P1); footprint declarations (P1); Fact Landings
  (Facts); Recurrence/Policy definitions (P2).
- **Events Published.** **Clock-Fact**; **Typed Transition Event** (revision|correction|cancellation|
  replacement); **Virtual Instance Condensed**; evaluation-recompute triggers to P3.
- **Events Consumed.** Authoring Act; Fact Landing; Configuration Version (recurrence).
- **Required Inputs.** P1 ledger + footprint declarations; P3 pure engine; Facts read seam.
- **Produced Outputs.** Scheduled recomputes; condensed rows on exception; deterministic replay
  results; delivered typed transitions.
- **Stable Public Interfaces.** The **typed transition event** contract (the one propagation
  mechanism); the **clock-fact** contract; the **replay determinism** guarantee; the **footprint
  registration** contract.
- **Internal Implementation Freedom.** Index structure; scheduling/queueing implementation; how
  incrementality is achieved; recurrence expansion representation.
- **Certification Evidence.** G-Replay-Determinism; G-Acyclic (mechanics half); propagation-completeness.
- **Completion Definition.** A Fact inside one footprint recomputes only dependent verdicts (no full
  sweep); replay reproduces recorded judgment exactly; every transition reaches every registered
  consumer.

### P5 — Derived Surfaces
- **Mission.** The five read-model surfaces via the existing Surface Builder on the subject-indexed
  read model.
- **Responsibilities.** Timeline · Grid · GapView · History · Preview; the **subject-indexed timeline
  read model** (required because `workflow_events` jsonb subject is not indexable); Preview as pure
  hypothetical evaluation.
- **Explicit Non-Responsibilities.** **No writes** (Preview especially); no authoring; no gap
  selection (that is Current Work, P6); no effector routing (P7); no truth of its own — every surface
  is a pure function of the ledgers + derived layer.
- **Provides.** The five surfaces; GapView as the raw gap feed Current Work selects from; Preview as
  the pre-ratification "if authored, then" projection.
- **Consumes.** Expectations (P1); Facts; Judgment Verdicts + Gaps (P3); Typed Transitions (P4).
- **Events Published.** **Blind-Spot Signal** (Conditions with no measurable binding; Facts with no
  governing expectation) for observability. No authoritative events.
- **Events Consumed.** Gap (derived); Verdict; Typed Transition.
- **Required Inputs.** P3 derived layer; P4 transitions; Surface Builder; subject-indexed read model.
- **Produced Outputs.** Read-only surfaces; blind-spot coverage signals.
- **Stable Public Interfaces.** The **GapView feed** contract (what Current Work selects from); the
  **Preview** contract (write-free hypothetical projection).
- **Internal Implementation Freedom.** Surface composition, rendering, read-model materialization.
- **Certification Evidence.** Preview-purity; G-Coverage (partial).
- **Completion Definition.** Preview produces zero writes; History shows Revision vs Correction
  distinctly; GapView is the sole raw feed for selection.

### P6 — Current Work Integration
- **Mission.** Evolve Current Work to **select** over the derived GapView with a reconciliation
  identity.
- **Responsibilities.** GapView → selection at the Current-Work threshold (decision-bearing + material
  + governed-by-rule + actionable + accountable owner); reconciliation identity (the gap identity);
  un-say/withdraw on transitions.
- **Explicit Non-Responsibilities.** **Never closes a gap** (a gap closes only when a Fact re-derives
  satisfaction — no "mark done", R2); **never authors an expectation to clear its own item**; never
  evaluates (reads P3 output); never generates work from custom logic (work is composed from gaps).
- **Provides.** The operator worklist as a **selection** over gaps; withdrawal on transition.
- **Consumes.** GapView (P5); Typed Transition Events (P4).
- **Events Published.** **Work Item Selected**; **Work Item Withdrawn** (Current Work's own projection
  state — not ledger writes).
- **Events Consumed.** Gap (derived); Typed Transition Event.
- **Required Inputs.** P5 GapView; P4 transition fan-out.
- **Produced Outputs.** The composed worklist; withdrawals reconciled by gap identity.
- **Stable Public Interfaces.** The **selection threshold** contract; the **reconciliation identity**
  (gap identity).
- **Internal Implementation Freedom.** Queue/assignment representation; UI; how existing Work-Unit
  membership feeds selection.
- **Certification Evidence.** R2 guard (no mark-fulfilled); G-Correction (work half); G-Coverage
  (partial).
- **Completion Definition.** A correction withdraws the corresponding item; no orphaned items after
  any transition; work is entirely composed from gaps (no work-generation logic).

### P7 — Effector Bindings
- **Mission.** Route gaps + transitions through the **single unified Binding** to Communications and
  process-as-response.
- **Responsibilities.** Bind gap-shapes/transitions to Comms templates and Business-Process triggers
  (via A2's one mechanism); un-say/retract propagation on revision/correction/cancel.
- **Explicit Non-Responsibilities.** **No second binding mechanism**; the ledger/engine invokes
  nothing (Purity); effectors do not mutate expectations (they close gaps by producing new Facts via
  their own domains); no evaluation.
- **Provides.** Effector routing through the one Binding; un-say propagation.
- **Consumes.** Gaps + Typed Transitions (P4/P5); gap→effector Bindings (P2).
- **Events Published.** **Binding Invocation** (to Comms / process-as-response); **Un-say/Retract** on
  transition.
- **Events Consumed.** Gap (derived); Typed Transition Event.
- **Required Inputs.** P2 gap→effector bindings; P4 transitions; Comms + Business-Process trigger
  surfaces (existing).
- **Produced Outputs.** Routed effector invocations; retractions.
- **Stable Public Interfaces.** The **Binding Invocation** contract (the one effector path); the
  **un-say** contract.
- **Internal Implementation Freedom.** How each effector reference resolves; delivery mechanics.
- **Certification Evidence.** G-Purity (full); propagation-completeness (full).
- **Completion Definition.** No path from engine/ledger to an effector except the binding; a correction
  un-says its message; no stale message or orphaned draft.

### P8 — AI Authoring Path
- **Mission.** AI proposes; the platform ratifies; nothing AI-specific enters operational state.
- **Responsibilities.** Proposed-expectation authoring (through P1 intake, standing = proposed);
  ratification gate; Preview-before-ratify; Forecasting (`predicted`); Recommendations (proposed
  `required`/`intended`).
- **Explicit Non-Responsibilities.** **Never self-ratifies**; **never owns operational state** (AI
  authors into the one ledger like any author); no AI-specific engine, gap, or evaluation; no new
  modality; a `predicted` expectation imposes no obligation (may stand at model standing).
- **Provides.** The AI authoring path; forecasts; recommendations — all as ordinary proposed
  expectations.
- **Consumes.** Judgment + Gaps + History (P3/P5); Facts; Preview (P5).
- **Events Published.** **Proposed Expectation Authored** (via P1); **Forecast Authored** (predicted);
  **Recommendation Authored** (proposed required/intended).
- **Events Consumed.** Judgment Verdict; Gap; Typed Transition.
- **Required Inputs.** P1 intake; P5 Preview; X0 ratification (§12 security).
- **Produced Outputs.** Proposed expectations; forecasts; recommendations — bind only on ratification.
- **Stable Public Interfaces.** The **proposed-standing** contract; the **ratification** contract
  (authority-gated, lineage-linked).
- **Internal Implementation Freedom.** Model choice; how proposals are generated; ranking.
- **Certification Evidence.** G-Standing (full).
- **Completion Definition.** No unratified deontic/commissive proposal ever binds; every proposal is
  previewable pre-ratification; AI adds no platform-specific operational behavior.

### X0 — Security · Standing · Ratification  *(cross-cutting, delivered inside P1 & P8)*
- **Mission.** Standing is meaning (Law 6); authoring is authority-gated; ratification promotes
  proposed → binding.
- **Responsibilities.** Authority-as-facet gating at intake; standing resolution; ratification as an
  authoring act; revision/correction authority ≥ original; effector authority = binding's configured
  authority.
- **Explicit Non-Responsibilities.** Not a workflow status; not a separate phase; **AI never
  self-ratifies**.
- **Certification Evidence.** G-Standing. **Completion Definition.** No unratified deontic binds;
  every act attributable; the ledger is the audit log.
- **Representation (P1 Wave C — clarification, not new architecture).** The already-frozen **Authority**
  tuple facet is *represented concretely* by: (1) **governed authority definitions** (an org-scoped
  catalog of valid authorities), (2) **effective-dated held-authority assignments** (append-only grants of
  an authority to a holder — human/policy/process/external, never AI — within a scope), and (3) a
  **single canonical held-authority resolver** answering "does actor X hold authority Y for org O in
  scope S at time T". RBAC permission authorizes *commands*; a held-authority assignment authorizes
  *semantic Standing* — both may be required, neither implies the other. Self-ratifying authoring (§5)
  and ratifier authority-sufficiency (§12) resolve through this one resolver. This is the implementation
  **representation** of the frozen Authority facet; it introduces **no** new operational primitive,
  modality, ledger, engine, event bus, state authority, or process runtime, and does not alter the
  ontology, package boundaries, gates, or dependency graph.

---

## 14. Ownership Boundaries (Deliverable 2)

The canonical ownership matrix. For each platform: what it **Owns**, **Must Never Own**, **May Read**,
**May Publish**, **May Consume**, **Must Never Evaluate**, **Must Never Store**, **Must Never Infer**.
This is the anti-drift contract — if a thread is about to make a platform do something in its "Must
Never" list, that is an ownership violation, not a feature.

### Operational Facts
- **Owns.** The observed ledger ("what IS"); Fact assertions; corrections (record changed, past
  didn't); clock-facts.
- **Must Never Own.** Intent/expectations; judgment; gaps; responses.
- **May Read.** Nothing it needs from Expectations (Facts are upstream; non-derivable from intent).
- **May Publish.** Fact Landings; corrections via the Fact Contract.
- **May Consume.** External observations, sensor/measurable evidence.
- **Must Never Evaluate.** Whether a Fact satisfies an expectation (that is Judgment).
- **Must Never Store.** Expectations, verdicts, gaps.
- **Must Never Infer.** What *should* be — Facts witness, they never assert intent.

### Operational Expectations (the authored ledger)
- **Owns.** The authored intent ledger ("what SHOULD/WILL be"); the tuple grammar; the five verbs;
  modality closure; the semantic line; lineage + Revision≠Correction; footprint declaration; Standing.
- **Must Never Own.** Reality/state (Facts); responses/effectors (Purity); clock/recurrence/replay
  mechanics (Processing); money (Billing); worklists (Current Work); messages (Comms).
- **May Read.** Facts (to be compared — via the engine, not by writing them); Configuration
  (intensional constraints).
- **May Publish.** Authoring Acts; Ratification Acts; declared footprints.
- **May Consume.** Authoring requests from Actions/Processes/AI/External.
- **Must Never Evaluate.** It does not itself compare — the **pure engine (P3)** derives judgment;
  the ledger asserts.
- **Must Never Store.** Verdicts, gaps, projections, effector state (all derived/downstream).
- **Must Never Infer.** Fulfillment — an expectation is fulfilled because a **Fact appears**, never
  because the ledger marks it.

### Judgment
- **Owns.** The derived modality-relative comparison (the verdict vocabulary); at-risk derivation.
- **Must Never Own.** The ledgers; responses; storage of authoritative truth.
- **May Read.** Expectations, Facts, clock.
- **May Publish.** Verdicts; Gaps.
- **May Consume.** Fact Landings; Clock-Facts; Authoring Acts (as recompute triggers).
- **Must Never Evaluate.** Anything impurely (no now-dependent state not captured as a Fact/clock-fact).
- **Must Never Store.** Authoritative results — judgment is a **derived read**, replayable and
  discardable.
- **Must Never Infer.** Intent or reality — it only compares what the two ledgers assert/witness.

### Projection (incl. Scheduling, Forecasting, Capacity, Staffing)
- **Owns.** Derived read models / state over the ledgers + judgment.
- **Must Never Own.** A system of record; any authoritative truth; authoring.
- **May Read.** Expectations, Facts, Judgment, Gaps.
- **May Publish.** Derived views (never authoritative events).
- **May Consume.** Verdicts, Gaps, Transitions.
- **Must Never Evaluate.** Re-derive judgment its own way (it consumes the one engine's output).
- **Must Never Store.** Truth — a projection is rebuildable from the ledgers.
- **Must Never Infer.** New intent — a projection **reads**; the authoring act (that feeds it) happens
  through intake, not the projection.

### Current Work
- **Owns.** Selection over gaps at its threshold; the worklist; reconciliation-by-gap-identity;
  withdrawal on transition.
- **Must Never Own.** Gap creation; work-generation logic; evaluation; the ledger.
- **May Read.** GapView; Typed Transitions.
- **May Publish.** Work Item Selected/Withdrawn (its own projection).
- **May Consume.** Gaps; Transitions.
- **Must Never Evaluate.** Whether an expectation is satisfied (it reads verdicts/gaps).
- **Must Never Store.** Expectations or gaps as its own truth (gaps are derived, owned upstream).
- **Must Never Infer.** Completion — it never closes a gap; a Fact does.

### Billing (Operational Consumption's financial consumer, D12a)
- **Owns.** Money — consumption events → obligations → draft charges; posting (first authoritative
  write); financial projection + financial effector.
- **Must Never Own.** A **Billing-specific expectation engine** (it consumes the one generalized
  engine); judgment logic; the expectation ledger.
- **May Read.** Judgment on committed/required financial-subject expectations.
- **May Publish.** Consumption events; obligations; draft/posted charges.
- **May Consume.** Verdicts; Typed Transitions (to supersede obligations / void DRAFT charges).
- **Must Never Evaluate.** Expectations its own way — parity requires the shared engine.
- **Must Never Store.** Expectations or verdicts as authoritative (it stores financial artifacts).
- **Must Never Infer.** Intent — it interprets judgment into money, nothing more.

### Scheduling
- **Owns.** A **Projection over committed temporal expectations** (the board/read model).
- **Must Never Own.** A **Scheduling-specific rule engine**; scheduling truth; conflict logic outside
  judgment.
- **May Read.** Committed temporal expectations; Facts; Judgment.
- **May Publish.** The schedule view; via intake, committed expectations authored by the scheduling
  *act*.
- **May Consume.** Verdicts; Gaps (conflicts).
- **Must Never Evaluate.** Conflicts with custom logic (a conflict is a derived gap).
- **Must Never Store.** Schedule as a separate truth (it is derived from committed expectations).
- **Must Never Infer.** New schedule truth — the authoring act feeds intake; the board is derived.

### Communications
- **Owns.** Messages; un-saying stale messages via lineage.
- **Must Never Own.** Gap creation; evaluation; the ledger; a second binding mechanism.
- **May Read.** Gaps; Typed Transitions.
- **May Publish.** Messages; retractions.
- **May Consume.** Binding Invocations (from the one Binding); Transitions.
- **Must Never Evaluate.** Judgment.
- **Must Never Store.** Expectations/gaps as truth.
- **Must Never Infer.** What to say beyond the bound gap/transition — Comms is an effector, invoked,
  never self-triggering.

### AI
- **Owns.** Proposed expectations; forecasts (predicted); recommendations — all as ordinary authored
  proposals.
- **Must Never Own.** **Operational state**; a system of record; self-ratification; an AI-specific
  engine/gap/modality.
- **May Read.** Judgment, Gaps, History, Facts, Preview.
- **May Publish.** Proposed/Forecast/Recommendation Authoring Acts (via intake).
- **May Consume.** Verdicts, Gaps, Transitions.
- **Must Never Evaluate.** Its own operational judgment (it reads the engine's).
- **Must Never Store.** Operational truth — proposals live in the one ledger at proposed standing.
- **Must Never Infer.** Binding intent — a proposal binds only when a human/authority ratifies.

### Operational Consumption
- **Owns.** The L4→L5 pipeline (Fact→Candidate→Event→Obligation→draft Charge); the generalized,
  modality-agnostic consumption pattern Billing specializes.
- **Must Never Own.** The expectation ledger; a per-consumer duplicate engine; judgment logic (it
  consumes verdicts).
- **May Read.** Judgment; Facts; Transitions.
- **May Publish.** Consumption events; obligations.
- **May Consume.** Verdicts; Typed Transitions (correction-aware supersession).
- **Must Never Evaluate.** Expectations independently of the shared engine.
- **Must Never Store.** Expectations/verdicts as authoritative.
- **Must Never Infer.** Intent — it turns judgment into obligations.

### Business Processes
- **Owns.** Process definitions/steps; the trigger model that the unified gap→effector binding
  **generalizes**; authoring expectations as a process author.
- **Must Never Own.** A standing invariant (an expectation has no program counter — an invariant is
  **not** a process); a second gap→response evaluator; the ledger.
- **May Read.** Facts, Expectations, Gaps.
- **May Publish.** Authoring Acts (process-authored expectations); process triggers as bound effectors.
- **May Consume.** Gaps (as a bound effector); Transitions.
- **Must Never Evaluate.** Judgment its own way.
- **Must Never Store.** Expectations as process-local state.
- **Must Never Infer.** Fulfillment — a process closes a gap only by producing Facts, never by marking.

---

## 15. Engineering Build Order (Deliverable 3)

Not milestones — the **construction order** and *why*: the technical debt each ordering avoids, the
merge conflicts it prevents, and where teams may branch. The order is the DAG (§3) read as a build
schedule.

1. **P0 first — always, alone.** *Why:* it is a **naming + substrate** change touching shared doctrine
   and the substrate every later package builds on. Building it first prevents the single largest merge
   hazard — every later PR would otherwise re-touch the same doctrine files and the substrate would be
   re-litigated per package. *Debt avoided:* a ledger that reads as a Law-2 violation and a substrate
   retrofitted twice. *Serialized:* nothing else starts until P0 lands.

2. **P1 next — the foundation trunk.** *Why:* the ledger + intake + Standing is the substrate P2/P3/P4
   all attach to; the tuple grammar is a Stable Public Interface many packages branch on. Building it
   before Config/Engine prevents those packages from inventing their own tuple/standing assumptions
   that would collide at integration. *Debt avoided:* divergent tuple/standing models; a security
   retrofit. *Serialized:* P2, P3, P4 depend on P1's Stable Public Interfaces existing.

3. **P2 and P3 attach to P1 — P2 slightly ahead of P3's parity step.** *Why:* P3's engine needs P2's
   measurable bindings to evaluate a Condition, and P2's unified gap→effector binding must exist before
   any effector (P7) is wired. Landing the **unified binding early** prevents the worst structural
   defect — a second gap→response evaluator (R3) — from being improvised later under delivery
   pressure. *Debt avoided:* duplicate binding/evaluation pipelines. *Parallel window:* P2 Types and
   P3 engine skeleton can be built in parallel once P1's grammar is stable, converging at the parity
   step.

4. **P3 keystone — the hard serialization point.** *Why:* the parity retrofit proves the engine is
   modality-agnostic on an already-shipped consumer **before** any net-new consumer exists. *Debt
   avoided:* per-domain evaluation logic (the fragmentation the whole architecture prevents). *Merge
   conflicts prevented:* net-new consumers (P5/P6/P7/P8) that would each encode their own judgment
   assumptions if built before the engine is proven. **Nothing downstream starts until G-Parity is
   green** — the one non-negotiable serialization (R15).

5. **P4 after the engine is proven.** *Why:* Processing schedules/replays/fans-out the *proven* engine;
   building it against an unproven engine would bake in assumptions that parity later invalidates.
   *Debt avoided:* a scheduler/replay coupled to a wrong engine shape. *Serialized before* the
   surfaces/effectors that consume its transition fan-out.

6. **Post-keystone parallel branch point — teams may safely split into three lanes:**
   - **Lane A — P5 Surfaces** (read models; the subject-indexed read model is a self-contained build).
   - **Lane B — P7 Effectors** (once P4 fan-out is stable; routes through the P2 binding).
   - **Lane C — P4 hardening** (footprint cost model, replay corpus).
   *Why parallel is safe:* the three lanes share only the P3/P4 Stable Public Interfaces (verdicts,
   gaps, transitions), which are frozen by this point; they touch disjoint code. *Merge conflicts
   prevented:* by branching only after the shared interfaces are stable.

7. **P6 Current Work — converges Lanes A+B.** *Why:* it needs P5's GapView and P4's transition
   fan-out; it is where surfaces and effectors meet in the operator worklist. *Serialized after* P5.

8. **P8 AI last — the most gated.** *Why:* it needs P1 intake + P5 Preview + X0 ratification and must
   never precede a stable ledger/standing model. *Debt avoided:* AI-specific state or an unratified
   binding path. *Serialized last.*

**Critical path:** `P0 → P1 → P3(keystone) → P4 → P6`. Staff the strongest engineering on P1 and P3.
**Safe branch points:** after P1 (P2 ∥ P3-skeleton), and after P3+P4 (Lane A ∥ Lane B ∥ Lane C).
**Never parallelize across a hard edge** (P0→P1, P1→P3, P3→P4, G-Parity gate) — those are serialized
by construction.

---

## 16. Canonical Proofs (Deliverable 4)

Each package ends with an **observable proof** that **architecture, not custom code, produces the
behavior**. Proofs are demonstrations, not tests (§11 covers the test classes that back them).

**P0 — Doctrine reconciled**
```
Doctrine says "Expectations are derived"   →   reconciliation sweep   →   Doctrine says "Expectations
are authored"; zero derived-state uses of the word; substrate hosts the twin ledger.
```

**P1 — Authoring is the only write path**
```
Intent to change the future   →   an Authoring Act (create/revise/correct/replace/cancel)   →   an
immutable ledger row with lineage.  No other path mutates intent; a revision re-plans, a correction
unwinds — from typing alone, not custom handlers.
```

**P2 — One binding, sensor-independent judgment**
```
Same Condition, two measurable bindings (badge-swipe vs manual roster)   →   evaluation   →   identical
judgment.  One gap→effector binding mechanism exists; no second evaluator can be found in the repo.
```

**P3 (keystone) — Billing behavior comes from the engine, not Billing code**
```
Shipped Consumption V1 behavior   →   replaced by the generalized engine as consumer #1   →   identical
operational behavior (zero divergence).  A downward correction unwinds with no over-bill, no orphaned
draft — from the engine + typing, not Billing-specific reversal code.
```

**P4 — Time and propagation are mechanical, not authored**
```
A deadline passes   →   a clock-fact crosses a Temporal Frame   →   re-evaluation, with no timer
subsystem.  A revision   →   a typed transition fans out to every consumer   →   each reconciles by its
own identity, none told what to do.  Replay reproduces recorded judgment exactly.
```

**P5 — Surfaces are pure reads; Preview writes nothing**
```
The ledgers + judgment   →   Timeline/Grid/GapView/History/Preview   →   views.  Author a hypothetical
in Preview   →   the projected consequence appears   →   zero writes occur.  Discard and rebuild any
surface from the ledgers — no surface holds truth.
```

**P6 — Current Work is entirely composed**
```
No work-generation logic exists.   →   Gaps are selected at the threshold   →   the worklist.  A
correction   →   the item is withdrawn (never "marked done").  Work exists because gaps exist, not
because Current Work created it.
```

**P7 — Effects are bound, never invoked by the engine**
```
A gap   →   the one unified Binding   →   a Comms message / a process trigger.  A correction   →   the
message is un-said via lineage.  No path from engine/ledger to an effector exists except the binding —
Purity holds by construction.
```

**P8 — AI adds recommendations, not platform behavior**
```
AI consumes the canonical operational model (judgment/gaps/history)   →   produces a proposed
expectation / forecast / recommendation   →   it binds only after an authority ratifies.  No
AI-specific engine, gap, modality, or operational state was added.
```

**Scheduling (composition proof, §10.1)**
```
No scheduling logic exists.   →   the scheduling act authors committed temporal expectations; the Grid
projects them   →   schedules emerge entirely from Expectations; a conflict is a derived gap.  Zero
scheduling-specific engine/ledger code.
```

**Whole capability — the §10 lifecycle**
```
Config policy   →   virtual expectation   →   authored exception   →   facts arrive   →   evaluation   →
gap   →   bound effectors   →   response as a new Fact   →   gap closes because a Fact appeared.
Every seam and all six laws exercised in one thread — behavior owned by the architecture.
```

---

## 17. Integration Dependency Matrix (Deliverable 5)

The master engineering index. Terse cells (package/gate/flag codes). This is the single lookup for
*what a package depends on, what consumes it, what it provides, and what it unlocks.*

| Pkg | Purpose | Depends On | Consumed By | Provides | Events Published | Events Consumed | Cert Gate | Unlocks | Migration | Feature Flag | Parallelizable |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **P0** | Doctrine + substrate | Frozen corpus, Facts substrate | P1 | Reconciled doctrine, twin-ledger substrate, Fact read seam | — | — | G-Reconciliation | P1 | 6.1 doctrine | — | No (blocks all) |
| **P1** | Ledger + authoring | P0 | P2,P3,P4,P8 | Ledger, intake, Standing, tuple grammar, footprint decl | Authoring Act, Ratification Act | — | G-Modality-Closure, G-Standing(a), G-Revision | P2,P3,P4 | — | `oe.ledger.author` | No (trunk) |
| **P2** | Config (intensional) | P1 | P3,P7 | Types/Policies/Recurrence, measurable + gap→effector bindings | Configuration Version | — | G-Unified-Binding, G-Semantic-Line | P3,P7 | — | — | Partial (∥ P3 skeleton) |
| **P3** | Engine + Billing parity ★ | P1,P2, Facts, Consumption V1 | Billing, P4,P5,P6,P7,P8 | Verdicts, Gaps, purity guarantee | Judgment Verdict, Gap | Fact Landing, Clock-Fact, Authoring Act | **G-Parity**, G-Purity(e), G-Correction(fin) | P4 + all consumers | 6.2 billing | `oe.engine.shadow` → `oe.engine.authoritative.billing` | No (keystone) |
| **P4** | Processing | P1,P3, Facts | P5,P6,P7 | Clock, footprint index, replay, transition fan-out | Clock-Fact, Typed Transition, Instance Condensed | Authoring Act, Fact Landing, Config Version | G-Replay-Determinism, G-Acyclic | P5,P6,P7 | — | — | No (drives consumers) |
| **P5** | Surfaces | P3,P4, Surface Builder | P6, operators | Timeline/Grid/GapView/History/Preview | Blind-Spot Signal | Gap, Verdict, Transition | Preview-purity, G-Coverage(p) | P6, P8(Preview) | 6.3 (feeds) | `oe.surfaces.*` | Yes (Lane A) |
| **P6** | Current Work | P5,P4 | operators | Composed worklist (gap selection) | Work Selected/Withdrawn | Gap, Transition | G-Correction(work), G-Coverage(p) | — | 6.3 current work | `oe.currentwork.gap-selection` | Converges A+B |
| **P7** | Effectors | P2,P4, Comms/BP | Comms, BP | Binding Invocation, un-say | Binding Invocation, Un-say | Gap, Transition | G-Purity(full), propagation-completeness | — | — | `oe.effectors.*` | Yes (Lane B) |
| **P8** | AI authoring | P1,P5(Preview),X0 | operators | Proposed expectations, forecasts, recommendations | Proposed/Forecast/Recommendation Authored | Verdict, Gap, Transition | G-Standing(full) | — | — | `oe.ai.propose`, `oe.ai.ratify-required` | No (last) |
| **X0** | Security/Standing | P1 | P1,P8 | Authority gate, ratification | Ratification Act | Authoring Act | G-Standing | P1,P8 | — | — | In P1 & P8 |

`★` = keystone. `(a)`=authoring half, `(e)`=engine half, `(p)`=partial, `(fin)`=financial.

---

## 18. Forbidden During Implementation (Deliverable 6)

Permanent constraints. Each is an **architecture violation, not a judgment call** — encountering a need
to do one is an escalation to the frozen-corpus owner (§22), never an in-thread decision. The guard/gate
that detects each is named.

- **No new operational modality.** The set is closed at five. A sixth is an architecture escalation
  (R16). *Guard:* G-Modality-Closure.
- **No consumer-owned evaluation.** Consumers read the one engine's verdicts; none re-derives judgment.
  *Guard:* G-Parity, G-Acyclic.
- **No Billing-specific expectation engine.** Billing consumes the generalized engine — the parity
  proof exists precisely to forbid this. *Guard:* G-Parity.
- **No Scheduling-specific rule engine.** Scheduling is a Projection over committed temporal
  expectations; conflicts are derived gaps. *Guard:* §10.1 composition proof.
- **No AI-owned operational state.** AI authors proposals into the one ledger; it owns no truth and
  never self-ratifies. *Guard:* G-Standing.
- **No duplicate evaluation pipelines.** One pure engine; replay uses the same function. *Guard:*
  G-Replay-Determinism.
- **No second gap→response binding.** Exactly one binding mechanism (A2). *Guard:* G-Unified-Binding, R3.
- **No direct consumer mutation of the ledger/gaps.** All writes are authoring acts; gaps are
  read-only. *Guard:* G-Acyclic, R4.
- **No "mark fulfilled / complete / resolve / close" verb on an expectation.** Fulfillment happens
  because a Fact appears. *Guard:* Law 3, R2.
- **No hidden package dependency / package bypass.** Packages communicate only through the §13
  contracts and §Frozen-Mechanisms; reaching into another package's internals is forbidden. *Guard:*
  the §13 Stable Public Interfaces.
- **No effector invoked by the engine/ledger.** Effectors are bound in Config and routed by P7 only
  (Purity). *Guard:* G-Purity, R1.
- **No measurable above the semantic line.** An expectation asserts a Condition on reality, never a
  sensor. *Guard:* G-Semantic-Line, R7.
- **No standing full-scan evaluation.** Evaluation is footprint-incremental, event-driven. *Guard:*
  A3, R13.
- **No materialized intensional layer.** Virtual-by-default; condense only on exception/consumer-need.
  *Guard:* R6.
- **No new ontology, no sixth operational primitive, no platform redesign.** The nine canonical
  concepts are immutable. *Guard:* §22 escalation, R17.

---

## 19. Engineering Checklists (Deliverable 7)

Objective completion criteria per package. A package advances only when its checklist is fully
checked. (X0 folds into P1 and P8.)

### P0
- **Ready to Begin:** ☐ frozen trio merged onto `origin/staging` ☐ substrate access confirmed.
- **Implementation Complete:** ☐ derived-L3 renamed Projection in all canonical docs ☐ Law 2 rewritten
  ☐ OE + Facts registered in `platform-capabilities.md` ☐ substrate-fitness note written.
- **Certification:** ☐ G-Reconciliation green (grep + doctrine diff) ☐ R11 retired.
- **Migration:** ☐ 6.1 doctrine sweep landed ☐ carve-out symbols left untouched.
- **Rollout:** ☐ docs-only, no runtime flag ☐ no P1 code opened before this closes.

### P1
- **Ready:** ☐ P0 green ☐ Fact Contract read seam available ☐ tuple grammar spec reviewed.
- **Complete:** ☐ five verbs admitted ☐ modality closure enforced ☐ semantic line enforced ☐
  Temporal-Frame required ☐ Revision≠Correction typed ☐ Standing/Authority gate live ☐ footprint
  declaration emitted.
- **Certification:** ☐ G-Modality-Closure ☐ G-Standing(authoring) ☐ G-Revision ☐ contributes G-Acyclic.
- **Migration:** ☐ ledger on the twin substrate ☐ no Fact writes from intake.
- **Rollout:** ☐ `oe.ledger.author` off = Facts-only behavior preserved.

### P2
- **Ready:** ☐ P1 grammar stable.
- **Complete:** ☐ Types/Templates/Policies/Recurrence (supersede-not-patch) ☐ measurable bindings ☐
  the single gap→effector binding.
- **Certification:** ☐ G-Unified-Binding ☐ G-Semantic-Line(config).
- **Migration:** ☐ no extensional assertions in Config ☐ generalizes existing BP trigger model (no new
  mechanism).
- **Rollout:** ☐ config authoring dark until consumers exist.

### P3 (keystone)
- **Ready:** ☐ P1 + P2 available ☐ Consumption V1 outcomes frozen as parity oracle ☐ Facts read seam.
- **Complete:** ☐ pure `(Expectation,Facts,clock)→Judgment+Gap` ☐ modality-relative verdicts ☐ at-risk
  ☐ Billing retrofit consumes engine.
- **Certification:** ☐ **G-Parity (zero divergence)** ☐ G-Purity(engine) ☐ G-Correction(financial: no
  over-bill/orphan).
- **Migration:** ☐ 6.2 shadow → compare → cutover ☐ correction-aware contract wired before drafts ☐
  old financial_* path retired behind flag.
- **Rollout:** ☐ `oe.engine.shadow` proven → `oe.engine.authoritative.billing` flip is reversible.

### P4
- **Ready:** ☐ P3 engine proven (G-Parity green).
- **Complete:** ☐ clock-facts (no timer) ☐ footprint index + incremental eval ☐ deterministic replay ☐
  typed transition fan-out.
- **Certification:** ☐ G-Replay-Determinism ☐ G-Acyclic(mechanics).
- **Migration:** ☐ no full-sweep path exists.
- **Rollout:** ☐ evaluation-lag SLO instrumented from first fact load.

### P5
- **Ready:** ☐ P3 + P4 stable ☐ Surface Builder available.
- **Complete:** ☐ subject-indexed timeline read model ☐ Timeline/Grid/GapView/History/Preview ☐ Preview
  write-free.
- **Certification:** ☐ Preview-purity ☐ G-Coverage(partial: blind spots surfaced).
- **Migration:** ☐ GapView is the sole raw gap feed.
- **Rollout:** ☐ `oe.surfaces.*` dark-launched read-only before driving work.

### P6
- **Ready:** ☐ P5 GapView + P4 fan-out stable.
- **Complete:** ☐ threshold selection ☐ reconciliation identity (gap identity) ☐ un-say/withdraw on
  transition ☐ no work-generation logic.
- **Certification:** ☐ G-Correction(work: correction withdraws item) ☐ no orphaned items.
- **Migration:** ☐ 6.3 gap-selection additive; existing queues run until certified.
- **Rollout:** ☐ `oe.currentwork.gap-selection` on a narrow high-threshold class first.

### P7
- **Ready:** ☐ P2 gap→effector bindings ☐ P4 fan-out ☐ Comms + BP surfaces available.
- **Complete:** ☐ route via the one Binding ☐ un-say propagation.
- **Certification:** ☐ G-Purity(full) ☐ propagation-completeness (no stale message/orphan draft).
- **Migration:** ☐ no second binding mechanism introduced.
- **Rollout:** ☐ `oe.effectors.*` per-effector enablement.

### P8
- **Ready:** ☐ P1 intake ☐ P5 Preview ☐ X0 ratification.
- **Complete:** ☐ proposed-only authoring ☐ ratification gate ☐ Preview-before-ratify ☐ Forecasting
  (predicted) ☐ Recommendations.
- **Certification:** ☐ G-Standing(full: no unratified deontic binds; AI can't self-ratify).
- **Migration:** ☐ no AI-specific operational state.
- **Rollout:** ☐ `oe.ai.propose` (predicted → intended → deontic) ☐ `oe.ai.ratify-required` enforced.

---

## 20. Implementation Risk Register — Execution (Deliverable 8)

Expands §7.2 from architectural risk to **execution** risk (merge, migration, flag, drift, and data
risks a delivery org hits). Each: Description · Likelihood · Impact · Detection · Mitigation ·
Rollback · Cert Gate · Owner.

**E1 — Shadow parity passes but hides a replicated V1 defect.**
L: Med · I: High · Detect: parity green while an out-of-corpus correction case fails · Mitigate: pair
G-Parity with G-Correction on cases V1 never exercised; parity target is behavioral outcome not
internal path · Rollback: keep V1 authoritative (flag off) until correction cases pass · Gate:
G-Parity + G-Correction · Owner: Engine + Billing eng.

**E2 — Downstream package started before G-Parity green.**
L: Med · I: High · Detect: a P5/P6/P7 branch opens with parity red · Mitigate: hard gate discipline
(§4.M2, §15); the DAG serializes it · Rollback: freeze/close the premature branch until keystone green
· Gate: G-Parity · Owner: Program lead.

**E3 — Doctrine sweep (P0) merges partially; "Expectation" ambiguity persists.**
L: Med · I: High · Detect: grep finds a derived-state use of the word · Mitigate: P0 is atomic and
blocking; grep is the acceptance check · Rollback: block all P1 merges until grep is clean · Gate:
G-Reconciliation · Owner: Platform doctrine.

**E4 — A second gap→response evaluator is improvised under delivery pressure.**
L: Med · I: High · Detect: code review finds a "when-gap-then-do" path parallel to the binding ·
Mitigate: land the unified binding early (§15 step 3); §18 forbids it · Rollback: revert the parallel
path; route through the one Binding · Gate: G-Unified-Binding · Owner: Config eng.

**E5 — Billing cutover flag flipped before zero-divergence.**
L: Low · I: High · Detect: post-cutover outcome diff ≠ 0 · Mitigate: cutover gated on the compare step;
flag reversible until old path deleted · Rollback: flip `oe.engine.authoritative.billing` off →
Consumption V1 resumes authority · Gate: G-Parity · Owner: Billing eng.

**E6 — Correction wired before the correction-aware contract → over-bill / orphaned draft.**
L: Med · I: High · Detect: a downward correction leaves a DRAFT charge or double-bills · Mitigate:
sequencing rule — correction-aware contract before draft-wiring; only DRAFT (never posted) is voided ·
Rollback: void orphaned drafts; supersede obligations by resolution key · Gate: G-Correction · Owner:
Billing eng.

**E7 — Evaluation cost exceeds the footprint-incremental prediction.**
L: Med · I: Med · Detect: judgment-freshness / evaluation-lag SLO breach under fact load · Mitigate: A3
footprint index; SLO instrumented from first load (P4 checklist) · Rollback: throttle non-critical
recompute; widen footprint granularity · Gate: G-Replay-Determinism (correctness) + SLO · Owner:
Processing eng.

**E8 — Staff-presence facts don't exist, so ratio expectations are unjudgeable.**
L: High · I: High · Detect: G-Coverage flags Conditions with no measurable binding · Mitigate: treat
staff-presence-fact emission as an explicit prerequisite for the live ratio vertical; don't schedule
the lifecycle demo until it lands · Rollback: defer the ratio vertical; demo a vertical whose facts
exist · Gate: G-Coverage · Owner: Platform.

**E9 — Subject-indexed read model missing → Timeline can't build on jsonb subject.**
L: Med · I: Med · Detect: Timeline queries can't index `workflow_events` subject · Mitigate: the
subject-indexed read model is a required P5 build item, not optional · Rollback: hold Timeline surface
until the read model lands (other surfaces proceed) · Gate: Preview-purity / G-Coverage · Owner:
Surfaces eng.

**E10 — Replay non-determinism from now-dependent state not captured as a Fact/clock-fact.**
L: Med · I: High · Detect: golden replay corpus diverges from recorded judgment · Mitigate: the clock
is a Fact; replay-determinism test in CI · Rollback: quarantine the impure input; re-express it as a
Fact · Gate: G-Replay-Determinism · Owner: Processing eng.

**E11 — Transition fan-out misses a consumer → stale message / orphaned item.**
L: Med · I: High · Detect: propagation-completeness check finds an unreconciled consumer after a
transition · Mitigate: P4 owns fan-out to **all** registered consumers; un-say is part of P7/P6 done ·
Rollback: replay the transition to the missed consumer · Gate: propagation-completeness · Owner:
Processing + Effector eng.

**E12 — Ratification bypass in code path (AI proposal binds unratified).**
L: Low · I: High · Detect: a deontic proposal binds a consumer without a Ratification Act · Mitigate:
standing gate at intake; `oe.ai.ratify-required` enforced; AI never self-ratifies · Rollback: revoke
the unratified binding; require ratification · Gate: G-Standing · Owner: AI + Ledger eng.

**E13 — Carve-out code-symbol rename done in-flight, breaking imports.**
L: Low · I: Med · Detect: build breakage on `scheduleExpectationCore.ts` et al. during P1–P4 ·
Mitigate: carve-outs are separately scheduled (§6.1); not part of the ledger build · Rollback: revert
the rename; reschedule as an isolated task · Gate: — (build) · Owner: Platform.

**E14 — Frozen doc edited in-flight, reopening architecture.**
L: Low · I: High · Detect: a PR edits a frozen doc's semantics · Mitigate: §22 escalation path; §21
Non-goals; frozen status on the trio · Rollback: revert the edit; route the concern as an escalation ·
Gate: §22 · Owner: Platform doctrine.

**E15 — Package reaches into another's internals (hidden dependency).**
L: Med · I: Med · Detect: a cross-package import bypassing the §13 Stable Public Interfaces ·
Mitigate: packages communicate only through published contracts + frozen mechanisms · Rollback: refactor
to the published interface · Gate: §13 contracts · Owner: owning package eng.

---

## 21. What this plan does not do

- It does **not** reopen ontology, semantics, the closed modality set, the six laws, or the three §A
  resolutions. Those are frozen inputs.
- It does **not** design tables, APIs, schemas, or code. Package scope is behavioral.
- It does **not** re-cut the packages, the dependency order, or the gates — those come from the system
  design; this plan sequences and certifies them.

## 22. When this plan must be updated

- A package (§2), a dependency edge (§3), a milestone (§4), or a gate (§5) changes — which can only
  happen if the system design changes first (its "when to update" clause governs).
- The Billing parity retrofit strategy (§6.2) is superseded by a better parity oracle.
- A program-execution risk (§7.2) materializes and changes the sequence.
- **Any pressure to change a frozen decision (§21) is an architecture escalation to the frozen-corpus
  owner — not an edit to this plan.**

## Cross-references

- [Architecture closeout](./operational-expectations-architecture-closeout.md) — froze the capability.
- [System design](../core/operational-expectations-system-design.md) — packages P0–P8, §A resolutions,
  §15 dependencies, §16 risks, §17 gates. **The direct upstream of this plan.**
- [Doctrine convergence certification](./operational-expectations-doctrine-convergence.md) — the P0
  doctrine sweep, carve-outs, follow-ups.
- [`../core/operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) — Law 2
  amended (Projections derived / Expectations authored).
- [`../modules/operational-consumption-platform.md`](../modules/operational-consumption-platform.md) —
  Consumption V1, the parity oracle (D12a, consumer #1).
