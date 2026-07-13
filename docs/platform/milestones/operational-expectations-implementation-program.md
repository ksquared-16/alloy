---
owner: platform
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Operational Expectations — Implementation Program (Platform Realization)

**Status:** Canonical governing implementation program, 2026-07-13. Platform Discovery is **complete**;
Engineering Realization is **complete**; the architecture is **frozen**. This document opens **Platform
Realization** and **governs every future Operational Expectations implementation thread**. It introduces
**no architecture, no ontology, no new package, no new concept** — it is the execution program derived
from the frozen corpus.

> **Corpus authority (do not re-derive).** This program executes, and never modifies, the frozen corpus:
> [system design](../operational-expectations-system-design.md) (packages P0–P8, §A resolutions,
> dependency order, gates), [engineering realization plan](./operational-expectations-engineering-realization.md)
> (Part I program + Part II execution contracts), [doctrine convergence certification](./operational-expectations-doctrine-convergence.md),
> and [architecture closeout](./operational-expectations-architecture-closeout.md). Where this program
> refers to a package boundary, a Stable Public Interface, a certification gate, a migration, a flag,
> or a risk, the **realization plan is the source of truth** and is cited by section (e.g. "§13", "§17").

---

## 0. Discovery Closeout & Governance Declaration (Phases 1–3)

### Discovery is closed
```
Platform Discovery:      Complete
Engineering Realization:  Complete
Architecture:            Frozen
Operating Mode:          Implementation-Governed (Platform Realization)
```
The Operational Expectations corpus is merged to `staging` (PR #188, merge commit `7f8c545e8`). The nine
canonical concepts — Operational Facts · Operational Expectations · Judgment · Projection · Current Work ·
Business Processes · Communications · AI · Operational Consumption — are **frozen and immutable**.

### The governing rule (binding on every implementation thread)
> **Implementation threads may not modify architecture.**

- Any implementation ambiguity is **escalated back to the architecture corpus** (realization plan §22),
  never resolved by a local, thread-local interpretation.
- Implementation teams are **not authorized to create local architectural interpretations.** A boundary,
  a Stable Public Interface, an ontology term, a modality, a law, or a gate is changed only through
  explicit architecture governance — never inside a package thread.
- A package thread may choose techniques **only within its declared Internal Implementation Freedom**
  (realization §13). Everything else is fixed.

### Operating-mode transition
From this point the operating model is **Platform Realization**. The prior System-Architect posture is
closed; work proceeds as **Chief Implementation Engineer**: execute the frozen architecture; preserve
package boundaries, ownership contracts, certification gates, migration strategy, rollout strategy,
backward compatibility, and the §18 implementation constraints. **Discovery is not revisited; the
platform is not redesigned.**

---

## 1. Program Overview

**Implementation philosophy — prove, then propagate.** The entire program is shaped by one discipline
(realization §1): **prove the one generalized engine on an already-shipped consumer (Billing/D12a) before
building any net-new consumer.** Nothing downstream of the keystone begins until parity is green. This is
what keeps the capability from fragmenting into per-domain logic.

**Cadence — gated increments, not calendar sprints.** Work advances package-by-package along the frozen
dependency order; a package is "done" only when its §19 checklists are fully checked and its §17 gate(s)
are green. Gates are standing invariants in CI (a green gate that later regresses **blocks the next
package**). Cadence is *certification-paced*, not date-paced.

**Sequencing.** The frozen order (realization §3/§15): `P0 → P1 → {P2 ∥ P3} → P3 keystone → P4 →
{P5 ∥ P7 ∥ P4-hardening} → P6 → P8`. P0 is a blocking prerequisite; P3 is the hard serialization point;
after P3+P4 the program fans into parallel lanes that reconverge at P6, with P8 last.

**Certification philosophy — binary, evidence-based, observable.** Each package ends with an **observable
proof** (realization §16) that *architecture, not custom code, produces the behavior* — not merely a
passing test. Gates are binary; there is no partial credit. Capability certification (M7) requires the
full gate column green **plus** the live §10 lifecycle **plus** the merged Billing parity.

**Rollout philosophy — shadow-first, flag-gated, reversible.** No consumer is cut over before its
judgment is proven against a live oracle. Every cutover has a proven `off = current behavior` fallback
(the `oe.*` flags, realization §8) and stays reversible until the retired path is deleted.

**Migration philosophy — additive-then-cutover, never big-bang, never history-mutating.** The three
migrations (doctrine sweep; Billing shadow→compare→cutover; Current Work gap-selection — realization §6)
run old-path-live-until-new-path-certifies. Both ledgers are append-only; corrections supersede, never
overwrite.

---

## 2. Package Program

One governing entry per package. Fields are execution attributes derived from the realization plan;
**complexity is relative** (S/M/L/XL) with rationale — no calendar estimate. "Definition of
implementation complete" is the §13 Completion Definition reinforced by the §19 checklists and §17 gates.

### P0 — Doctrine Reconciliation & Substrate Alignment
- **Mission.** Land the reconciliation and confirm the substrate hosts the Expectation ledger as the twin
  of Facts. *(Realization: this is **substantially already satisfied** — the doctrine sweep and freeze
  declaration merged in PR #186/#188; P0 closes out the remaining substrate-fitness confirmation.)*
- **Objectives.** Doctrine ambiguity eliminated (done); substrate proven to host a second append-only
  bitemporal lineage ledger; Fact Contract confirmed as the read seam.
- **Dependencies.** Merged corpus. **Unlocked by:** nothing (root). **Unlocks:** P1 (and therefore all).
- **Complexity.** **S** — docs + substrate confirmation, minimal code.
- **Major risks.** Partial sweep leaving name ambiguity (E3); a frozen-doc edited in-flight (E14).
- **Gates.** **G-Reconciliation** (retires R11).
- **Migration impact.** Migration 6.1 (doctrine) — largely landed.
- **Consumers affected.** None yet (foundational).
- **Rollback.** Revert doctrine edits; block P1 until grep-clean. Docs-only, trivially reversible.
- **Done when.** No doctrine use of "Expectation"=derived; substrate hosts the twin ledger; R11 retired.

### P1 — Expectation Ledger & Authoring Intake  *(foundation trunk)*
- **Mission.** The authored ledger + the one authoring intake; Security/Standing lands here.
- **Objectives.** Five verbs; tuple grammar; modality closure; semantic-line enforcement; Temporal-Frame
  presence; Revision≠Correction typing; Authority→Standing gate; footprint declaration.
- **Dependencies.** P0. **Unlocked by:** P0. **Unlocks:** P2, P3, P4, P8.
- **Complexity.** **L** — the substrate everything attaches to; grammar + standing + lineage are subtle
  and high-leverage; its Stable Public Interfaces (tuple grammar, five verbs, Revision≠Correction) are
  branched on by nearly every other package.
- **Major risks.** Divergent tuple/standing assumptions if downstream starts early; standing bypass (E12);
  a "mark fulfilled" verb creeping in (R2).
- **Gates.** G-Modality-Closure, G-Standing (authoring), G-Revision; contributes G-Acyclic.
- **Migration impact.** None (net-new ledger on existing substrate).
- **Consumers affected.** All future consumers depend on its contracts.
- **Rollback.** `oe.ledger.author` off ⇒ Facts-only behavior (today's system) preserved.
- **Done when.** Grammar rejects malformed/6th-modality; revision re-plans, correction unwinds; every act
  attributable; no author asserts beyond Authority.

### P2 — Configuration (intensional layer)
- **Mission.** Types/Templates/Policies/Recurrence + both bindings; the one unified gap→effector binding.
- **Objectives.** Effective-dated supersede-not-patch definitions; measurable bindings (A1); the single
  gap→effector binding generalizing the existing Business-Process trigger model (A2).
- **Dependencies.** P1 grammar. **Unlocked by:** P1. **Unlocks:** P3 (measurable bindings), P7 (effector
  bindings).
- **Complexity.** **M** — mostly definitional; the subtlety is proving the binding is *the one* mechanism
  (no second evaluator).
- **Major risks.** A second gap→response evaluator improvised under pressure (E4/R3).
- **Gates.** G-Unified-Binding, G-Semantic-Line (config half).
- **Migration impact.** None directly; enables the Billing retrofit's binding.
- **Consumers affected.** P3 engine, P7 effectors.
- **Rollback.** Config authoring dark until consumers exist; revert a binding definition without runtime
  effect.
- **Done when.** Two measurable bindings for one Condition → identical judgment; exactly one gap→effector
  mechanism.

### P3 — Generalized Evaluation Engine + Billing Parity Retrofit  *(**keystone**)*
- **Mission.** The pure modality-relative engine, proven by retrofitting D12a Billing as consumer #1.
- **Objectives.** Pure `(Expectation, Facts, clock) → Judgment + Gap`; modality-relative verdicts;
  at-risk; Billing consumes the engine; reproduce shipped Consumption V1 outcomes exactly.
- **Dependencies.** P1, P2, Facts read seam, **Consumption V1 outcomes as the parity oracle**.
  **Unlocked by:** P1+P2. **Unlocks:** P4 and every consumer (P5/P6/P7/P8).
- **Complexity.** **XL** — highest effort and highest risk; purity + determinism + bit-for-bit parity +
  correction-aware unwind. **The make-or-break package.**
- **Major risks.** Parity masks a replicated V1 defect (E1); correction wired before the correction-aware
  contract → over-bill/orphan (E6); cutover before zero-divergence (E5); purity leak (R1).
- **Gates.** **G-Parity (keystone)**, G-Purity (engine), G-Correction (financial).
- **Migration impact.** Migration 6.2 — Billing shadow → compare → cutover; old `financial_*` path retired
  behind a flag.
- **Consumers affected.** Billing/Operational Consumption directly; all future consumers transitively.
- **Rollback.** `oe.engine.authoritative.billing` off ⇒ Consumption V1 resumes authority; reversible until
  the old path is deleted.
- **Done when.** Generalized engine, as Billing's consumer, reproduces every shipped Consumption V1
  outcome bit-for-bit (shadow then cutover) with no over-bill/orphan on a downward correction.

### P4 — Processing
- **Mission.** Mechanics only — clock, recurrence, footprint-incremental evaluation, replay, typed
  transition fan-out.
- **Objectives.** Clock-facts (no timer); virtual-by-default recurrence, condense-on-exception; footprint
  index + incremental cost model (A3); deterministic replay; fan-out to registered consumers.
- **Dependencies.** P1 (footprints), **P3 (proven engine)**, Facts. **Unlocked by:** P3. **Unlocks:** P5,
  P6, P7.
- **Complexity.** **L** — performance + correctness (incrementality, determinism) are demanding.
- **Major risks.** Evaluation cost exceeds the incremental prediction (E7); replay non-determinism from
  un-captured now-state (E10); fan-out misses a consumer (E11).
- **Gates.** G-Replay-Determinism, G-Acyclic (mechanics).
- **Migration impact.** None.
- **Consumers affected.** All surfaces/effectors that read transitions.
- **Rollback.** Throttle non-critical recompute; widen footprint granularity; no consumer-visible truth
  change (derived layer).
- **Done when.** A fact in one footprint recomputes only dependents (no full sweep); replay reproduces
  recorded judgment; every transition reaches every registered consumer.

### P5 — Derived Surfaces
- **Mission.** Timeline/Grid/GapView/History/Preview on the subject-indexed read model.
- **Objectives.** Five read-model surfaces via Surface Builder; the subject-indexed timeline read model;
  Preview as pure hypothetical (write-free).
- **Dependencies.** P3, P4, Surface Builder. **Unlocked by:** P4. **Unlocks:** P6 (GapView feed), P8
  (Preview).
- **Complexity.** **M** — mostly read-model composition; the subject-indexed read model is a required
  build (jsonb subject isn't indexable).
- **Major risks.** Missing subject-indexed read model blocks Timeline (E9); a Preview write (purity).
- **Gates.** Preview-purity; G-Coverage (partial).
- **Migration impact.** None (additive feeds).
- **Consumers affected.** Current Work (GapView), AI (Preview).
- **Rollback.** `oe.surfaces.*` dark-launch read-only; hold a surface without runtime effect.
- **Done when.** Preview writes nothing; History shows Revision vs Correction; GapView is the sole raw
  gap feed.

### P6 — Current Work Integration
- **Mission.** Evolve Current Work to *select* over GapView with a reconciliation identity.
- **Objectives.** Threshold selection; reconciliation-by-gap-identity; un-say/withdraw on transition; no
  work-generation logic.
- **Dependencies.** P5 (GapView), P4 (fan-out). **Unlocked by:** P5. **Unlocks:** — (converges the lanes).
- **Complexity.** **M** — selection + reconciliation over an existing surface; no engine work.
- **Major risks.** Orphaned items after a transition; a "mark done" close path (R2).
- **Gates.** G-Correction (work); G-Coverage (partial).
- **Migration impact.** Migration 6.3 — additive; existing queues run until gap-selection certifies.
- **Consumers affected.** Operators.
- **Rollback.** `oe.currentwork.gap-selection` off ⇒ existing queues; narrow, high-threshold class first.
- **Done when.** A correction withdraws the item; no orphaned items; work is entirely composed from gaps.

### P7 — Effector Bindings
- **Mission.** Route gaps + transitions through the one unified Binding to Comms and process-as-response.
- **Objectives.** Bind gap-shapes/transitions to Comms + BP triggers via A2's one mechanism; un-say on
  transition.
- **Dependencies.** P2 (bindings), P4 (fan-out), Comms/BP surfaces. **Unlocked by:** P4. **Unlocks:** —.
- **Complexity.** **M** — routing + un-say; the discipline is *no second binding mechanism*.
- **Major risks.** Purity leak (engine→effector) (R1); propagation incompleteness / stale message (E11).
- **Gates.** G-Purity (full); propagation-completeness.
- **Migration impact.** None.
- **Consumers affected.** Communications; Business Processes (as bound effectors).
- **Rollback.** `oe.effectors.*` per-effector disable; revert a binding.
- **Done when.** No engine/ledger→effector path except the binding; a correction un-says its message; no
  stale message/orphan draft.

### P8 — AI Authoring Path
- **Mission.** AI proposes; the platform ratifies; nothing AI-specific enters operational state.
- **Objectives.** Proposed-expectation authoring (via P1 intake); ratification gate; Preview-before-ratify;
  Forecasting (`predicted`); Recommendations.
- **Dependencies.** P1 (intake), P5 (Preview), X0 (ratification). **Unlocked by:** P1+P5. **Unlocks:** —
  (terminal).
- **Complexity.** **L** — the gating (standing/ratification) and preview integration are the substance.
- **Major risks.** Ratification bypass — an unratified deontic proposal binds (E12); AI-owned state (R9).
- **Gates.** G-Standing (full).
- **Migration impact.** None.
- **Consumers affected.** Operators (recommendations/forecasts).
- **Rollback.** `oe.ai.propose` staged (predicted → intended → deontic); `oe.ai.ratify-required` enforced;
  AI never self-ratifies.
- **Done when.** No unratified deontic proposal binds; every proposal previewable; no AI-specific
  operational behavior.

### X0 — Security · Standing · Ratification  *(cross-cutting; delivered inside P1 & P8)*
Not a package thread and **not a late hardening phase.** Standing/Authority ships **with P1**;
ratification ships **with P8**. Governed by G-Standing. Treating X0 as deferrable is an execution error.

---

## 3. Critical Path

The single canonical implementation critical path (realization §3/§15):

```
P0 ─► P1 ─► P3(keystone) ─► P4 ─► P6            ← longest hard chain; staff strongest engineering on P1 & P3
        │        ▲
        └─► P2 ──┘   (P2 ∥ P3-skeleton after P1; converge at the parity step)

        after P3+P4 green, fan out (all reconverge at P6):
           Lane A: P5 Surfaces
           Lane B: P7 Effectors
           Lane C: P4 hardening (footprint cost model, replay corpus)
        then ► P6 ► P8 (last, most gated)
```

- **Hard dependencies (must-precede):** P0→(all); P1→P2/P3/P4/P8; P2→P3/P7; P3→P4 and all consumers;
  P4→P5/P6/P7; P1+P5→P8. Consumption V1 (shipped) → P3 as the parity oracle.
- **Soft dependencies (preferred):** P5 wants P4 fan-out stable; P6 wants P5 GapView; P7 wants P4 fan-out.
- **Parallel work:** (P2 ∥ P3-skeleton) after P1; (P5 ∥ P7 ∥ P4-hardening) after P3+P4.
- **Serialization points:** P0 alone first; P1 as the trunk; **P3 the hard serialization** — nothing
  downstream starts until **G-Parity** is green.
- **Certification gates on the path:** G-Reconciliation (after P0) · G-Modality-Closure/G-Standing/
  G-Revision (after P1) · G-Unified-Binding/G-Semantic-Line (after P2) · **G-Parity** + G-Purity(engine)
  + G-Correction(fin) (after P3) · G-Replay-Determinism/G-Acyclic (after P4) · Preview-purity (P5) ·
  G-Correction(work) (P6) · G-Purity(full)/propagation-completeness (P7) · G-Standing(full) (P8).
- **Feature-flag transitions:** `oe.ledger.author` (P1) → `oe.engine.shadow` → `oe.engine.authoritative.
  billing` (P3) → `oe.surfaces.*` (P5) → `oe.currentwork.gap-selection` (P6) → `oe.effectors.*` (P7) →
  `oe.ai.propose`/`oe.ai.ratify-required` (P8).
- **Migration checkpoints:** 6.1 doctrine (P0, largely landed) · **6.2 Billing shadow→compare→cutover
  (P3)** · 6.3 Current Work gap-selection (P6).
- **Billing retrofit:** the P3 keystone — the parity proof and the first consumer.
- **Scheduling proof:** at the P5/P6 stage — Scheduling demonstrated as a Projection over committed
  temporal expectations, zero scheduling-specific code (realization §10.1). The first proof of
  composition after Billing.
- **Current Work evolution:** P6 — from queues to composed gap-selection.
- **AI integration:** P8 — last; consumes canonical operational state, owns none.
- **Operational Consumption adoption:** at P3 — Consumption/Billing is the generalized engine's first
  consumer and the parity oracle; later consumers follow the same shadow→compare→cutover template.

---

## 4. Package Readiness Review

| Package | Classification | Why |
|---|---|---|
| **P0** | **Ready Now** | Root of the DAG; only dependency (merged corpus) is satisfied. Doctrine sweep already merged; only substrate-fitness confirmation remains. |
| **P1** | Needs prerequisite implementation | Blocked by **P0** (substrate confirmation + G-Reconciliation). The moment P0 is green, P1 is the trunk to start. |
| **P2** | Blocked by another package | Needs P1's tuple grammar. Can then run **parallel** to the P3 engine skeleton. |
| **P3** | Blocked by another package | Needs P1 + P2 + the Consumption V1 parity oracle. The keystone — cannot begin meaningfully until its inputs exist. |
| **P4** | Blocked by certification | Needs **P3 proven (G-Parity green)** — building against an unproven engine bakes in wrong assumptions. |
| **P5** | Blocked by another package | Needs P3 + P4 (derived layer + transition fan-out). Then Lane A. |
| **P6** | Blocked by another package | Needs P5 GapView + P4 fan-out. Converges the lanes. |
| **P7** | Blocked by another package | Needs P2 bindings + P4 fan-out. Then Lane B. |
| **P8** | Blocked by another package | Needs P1 intake + P5 Preview + X0 ratification. Terminal, most gated. |

**Only P0 is Ready Now.** Every other package is gated by a hard dependency or a certification gate — by
design (the DAG is the schedule).

---

## 5. Recommended First Package

**Begin with P0 — Doctrine Reconciliation & Substrate Alignment — immediately, and stage P1 to start the
instant G-Reconciliation is green.**

Justified by the dependency graph, not preference:

- **Minimum implementation risk.** P0 is the lowest-complexity package (S): docs + substrate confirmation,
  the doctrine half already merged. Its rollback is trivial (revert docs).
- **Maximum architectural confidence.** P0 clears **G-Reconciliation** and retires **R11** — it removes the
  one naming ambiguity six architecture iterations existed to eliminate. Every later reviewer then reads
  "Expectations = authored" unambiguously.
- **Maximum downstream leverage.** P0 is the **unique root** of the DAG: it has **no inbound dependency**
  and **every other package depends on it** (directly or transitively). It is the single highest-leverage
  unblock in the program — and the realization plan makes it *blocking on all P1 code* (no ledger ships
  before the sweep lands, or the ledger reads as a Law-2 violation).

P0 is small, safe, and total-unblocking — the textbook first move. **P1 is the immediate successor** (the
foundation trunk whose Stable Public Interfaces the whole program branches on); it should be resourced and
queued so it starts with zero latency once P0 certifies.

---

## 6. Implementation Program Risks (execution only)

Program-level execution risks (the full per-package register is realization §20 — E1–E15; these are the
top program risks a delivery org must actively manage). **No architectural risks appear here — the
architecture is frozen.**

| # | Risk | Prob | Impact | Detection | Mitigation | Rollback |
|---|---|---|---|---|---|---|
| PR-1 | **Downstream thread starts before G-Parity** (the keystone slips and pressure mounts) | Med | High | A P4/P5/P6/P7 branch opens with parity red | Hard gate discipline: nothing past P3 starts until G-Parity green; the DAG serializes it | Freeze/close the premature branch until the keystone certifies |
| PR-2 | **Parity green masks a replicated V1 defect** (engine matches a V1 bug, not correct derivation) | Med | High | An out-of-corpus correction case fails though parity is green | Pair G-Parity with G-Correction on cases V1 never exercised; parity target = behavioral outcome, not path | Keep Consumption V1 authoritative (flag off) until correction cases pass |
| PR-3 | **A second binding/evaluator is improvised** under delivery pressure | Med | High | Review finds a "when-gap-then-do" path parallel to the one Binding | Land the unified binding early (P2, §15 step 3); §18 forbids it | Revert the parallel path; route through the one Binding |
| PR-4 | **Billing cutover before zero-divergence** / correction wired before the correction-aware contract | Low | High | Post-cutover diff ≠ 0; a downward correction over-bills or orphans a draft | Cutover gated on compare; correction-aware contract before draft-wiring; only DRAFT (never posted) voided | Flip `oe.engine.authoritative.billing` off ⇒ V1 resumes; void orphaned drafts |
| PR-5 | **Evaluation cost exceeds the incremental prediction** at fact volume | Med | Med | Judgment-freshness / evaluation-lag SLO breach under load | A3 footprint index; SLO instrumented from first fact load (P4) | Throttle non-critical recompute; widen footprint granularity |
| PR-6 | **Staff-presence facts don't exist**, so ratio expectations are unjudgeable (the live-vertical data gap) | High | High | G-Coverage flags Conditions with no measurable binding | Treat staff-presence-fact emission as an explicit prerequisite for the ratio vertical; don't schedule that lifecycle demo until it lands | Defer the ratio vertical; demo a vertical whose facts exist |
| PR-7 | **Multi-thread merge conflict** from parallel lanes touching shared interfaces before they're stable | Med | Med | Conflicts on P3/P4 Stable Public Interfaces across lanes | Branch lanes only after P3+P4 interfaces freeze; lanes touch disjoint code | Rebase the late lane onto the stabilized interface |
| PR-8 | **A gate regresses after going green** and a later package proceeds on a broken invariant | Low | High | CI standing-gate check flips red on a merged package | Gates are standing CI invariants; a regressed gate blocks the next package | Revert the regressing change; re-certify before proceeding |
| PR-9 | **Ratification bypass in code** (unratified AI proposal binds) | Low | High | A deontic proposal binds without a Ratification Act | Standing gate at intake; `oe.ai.ratify-required`; AI never self-ratifies | Revoke the unratified binding; require ratification |

---

## 7. Multi-thread Strategy

Divide work to maximize throughput **without** letting any thread touch the frozen architecture.

**Centralized / single-threaded (do NOT parallelize):**
- **P0, P1, P3** — the foundation trunk and the keystone. These define the substrate, the Stable Public
  Interfaces, and the proven engine that every other thread depends on. Splitting them invites divergent
  tuple/standing/engine assumptions. One coordinated thread, strongest engineers, serialized.
- **X0** rides inside P1 and P8 — never its own late thread.

**May proceed independently (only after their unlock, and only touching disjoint code):**
- After P1: **P2** can run parallel to the **P3 engine skeleton** (converging at the parity step).
- After **P3+P4 green**: **Lane A (P5 Surfaces)**, **Lane B (P7 Effectors)**, **Lane C (P4 hardening)** —
  they share only the frozen P3/P4 Stable Public Interfaces (verdicts, gaps, transitions) and touch
  disjoint files.

**Synchronization checkpoints (all threads pause and reconcile):**
1. **G-Reconciliation** (after P0) — before any ledger code.
2. **P1 Stable Public Interfaces frozen** — before P2/P3 attach.
3. **G-Parity (keystone)** — the program-wide barrier: **no downstream thread proceeds until green.**
4. **P3/P4 interfaces frozen** — before the parallel lanes branch.
5. **P6 convergence** — Lanes A+B rejoin before Current Work integration.

**When threads must pause for certification:** a thread merges only when its §19 checklists are complete
and its §17 gate(s) are green; a downstream thread does not start until its upstream gate is green. Gates
are the throttle — throughput is maximized *between* gates (parallel lanes), never *through* them.

**The throughput rule:** parallelize aggressively **after** the keystone; serialize strictly **through**
P0→P1→P3. That single shape yields maximum engineering throughput while the frozen architecture stays
inviolate.

---

## When this program must be updated

- The realization plan's package set (§14), dependency order (§15), gates (§17), or Part II contracts
  change — which can only happen through architecture governance (realization §22).
- Implementation evidence updates a package's readiness, a gate's status, or a rollback record — recorded
  here **without** altering architectural meaning.
- **This program never modifies the frozen architecture.** Any contradiction it surfaces is escalated to
  the corpus, not resolved locally.

## Cross-references

- [Engineering realization plan](./operational-expectations-engineering-realization.md) — Part I program +
  Part II execution contracts. **The direct source of truth for this program.**
- [System design](../operational-expectations-system-design.md) — packages, §A resolutions, gates.
- [Architecture closeout](./operational-expectations-architecture-closeout.md) — the freeze.
- [Documentation governance](../governance/documentation-governance.md) — freeze policy + status vocabulary.
