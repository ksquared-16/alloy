---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Operational Pressure & the Decision Loop

**Status:** Proposed — Iteration-4 companion to [`operational-decision-platform.md`](./operational-decision-platform.md). Details the two abstractions the platform turns on: **Operational Pressure** (a Gap) and the **Decision Loop** (the existing runtime, generalized).

---

## 1. Operational Pressure — the model

### 1.1 Definition

> **Operational Pressure is a surfaced Gap: a divergence between the Expectations ledger ("what SHOULD / WILL be") and the Facts ledger ("what IS"), evaluated at a clock.**

It is **derived**, never authored — the same derived comparison the Operational Expectations engine already computes (`Gap = compare(Expectation, Facts, clock)`, [`operational-expectations-system-design.md`](../core/operational-expectations-system-design.md)). Pressure is that Gap, made visible as **attention**.

### 1.2 The pressure taxonomy (one shape, many faces)

Pressure varies along a small set of axes — all domain-neutral:

| Axis | Values | Example |
|------|--------|---------|
| **Modality** (which expectation is unmet) | required · prohibited · intended · committed · predicted | ratio *required*; late fee *prohibited*; fill *intended* |
| **Temporality** | past · present · **projected** | attendance (past), ratio now (present), Oct forecast (projected) |
| **Severity** | advisory · at-risk · breach | ratio tight (at-risk) vs over (breach) |
| **Resolution shape** | witnessed-fact (fast) · decided-change (full) | mark present (fast) vs move a child (full) |
| **Subject** | child · room · staff · family · document · message · account | who/what the gap is about |

A ratio breach and an unread message are **the same architectural object** — a Gap with different axis values. That is why Pressure is a platform primitive, not a per-domain feature.

### 1.3 The four properties the mission asked to confirm

- **Pressure exists without work.** The Gap is computed from the ledgers the moment they diverge — before any queue row, work unit, or plan. Work is one *surface* for pressure, not its source.
- **Pressure exists without planning.** Planning is one *resolution* of pressure. The Gap is there regardless.
- **Pressure is not a store.** It is a derived read model (Law 2). Materialize only as a non-authoritative, recomputable cache.
- **Forecasting is pressure, early.** A forecast is a Gap against *projected* facts. Same primitive, read forward — so Forecasting is early pressure detection, not a separate capability.

### 1.4 How pressure is represented and surfaced

- **Represented** as a derived `Gap { subject, modality, temporality, severity, expectation_ref, fact_ref, projected_at }`.
- **Surfaced** through the machinery Alloy already has: **BOS computes attention** and ranks it; the **queue / Work View** shows it; the **Focus Panel** explains it (Record of Attention + Context Frame = *why now*). None of this is new — it is the attention system, now understood as *pressure surfacing*.

---

## 2. The Decision Loop

### 2.1 The loop (refined and final)

```
Reality → PRESSURE(gap) → UNDERSTAND → GENERATE realities → COMPARE consequences → CHOOSE → COMMIT → Truth → (new gaps)
```

Refinements over the mission's draft (`…→ Understand → Generate → Compare → Choose → Commit →…`):

1. **The loop starts from a Gap, not from "current reality" in the abstract.** Reality is always the ground; the loop *fires* on pressure.
2. **Generate produces candidate *realities*, not "options"** — each candidate is a fully-projected proposed reality (Iteration 3), so Compare is reality-vs-reality.
3. **Two paths (fast/full).** A gap whose resolution is obvious (a single witnessed fact) collapses Generate/Compare to nothing — *mark present.* Only genuine forks expand the full loop. The loop **scales with decision difficulty.**
4. **Choose and Commit are the human's;** everything else BOS may assist.

### 2.2 It is the existing runtime

The loop maps onto the **BPR Execution Runtime** (`Resolve → Evaluate → Preview → Commit`; [`business-process-execution-platform.md`](../modules/business-process-execution-platform.md)) — Understand/Generate live in Resolve/Evaluate, Compare is Preview + registered Calculations, Commit is Commit. **The only extraction is naming Generate/Compare as an explicit multi-candidate stage** (Preview over N candidates). No new runtime — the composition and the naming are the work.

### 2.3 Decision vs Action vs Work (the boundaries)

| | It is | It writes | Cardinality |
|---|-------|-----------|-------------|
| **Work** | a container that needs attention | nothing (a surface) | a decision often *lives in* one, but need not |
| **Decision** | the episode of choosing a reality that closes a gap | nothing until Commit | 1 gap → 1 decision |
| **Action** | a single authoritative write | truth (a fact/intent row) | 1 decision → 0..N actions, atomic at Commit |

- **Action ⊂ Decision output.** An action is what a committed decision *emits*. A trivial decision emits exactly one action and feels like "just an action."
- **Decision ⊄ Work, Work ⊄ Decision.** They overlap. Pure reporting (witness a fact) is work that is not a decision; a forecast gap is a decision with no pre-existing work item.

### 2.4 The Resolve verb

**Resolve** = the universal Intent-layer interaction *open a Decision on this Gap.* It is the **prospective** counterpart to the **retrospective** `complete` (*witness what happened*). Both close gaps and both write truth via the same runtime; they differ in whether the operator is **witnessing** reality or **choosing** it. Extract `resolve(gap)` into the universal verb set (`focus · complete · create · review · switch · resolve`) — not as a new subsystem.

---

## 3. Simulation, Optimization, Commit — in decision terms

- **Simulation** is the **consequence engine of a decision**: project a candidate reality through registered Calculations to answer *"what becomes true if I choose this."* Its many names (alternative reality / decision preview / projection / consequence engine) are one role: **consequence projection for a candidate decision.** Deterministic, write-free, same Calculations as execution ([`operational-simulation.md`](./operational-simulation.md)).
- **Optimization** is **one way to *generate* candidate decisions** — deterministic search and/or BOS — plus ranking by a configurable objective over simulated consequences. It is the Generate/Compare steps, not a feature ([`operational-optimization.md`](./operational-optimization.md)). *What generates?* search + BOS + the operator. *What ranks?* the objective over Simulation. *What explains?* the per-candidate consequence delta.
- **Commit** is the **Decision → Truth boundary** — reversible before, authoritative after; supersede-not-delete ([`operational-decision-platform.md`](./operational-decision-platform.md) §6).

---

## 4. Doctrine additions this proposes

| Owning doc | Proposed addition |
|------------|-------------------|
| [`operational-expectations-system-design.md`](../core/operational-expectations-system-design.md) | Name the derived **Gap** as **Operational Pressure** — the cross-domain attention primitive. |
| [`operational-truth-flow-doctrine.md`](../core/operational-truth-flow-doctrine.md) | Add the **Commit Boundary** law: Commit is the single decision→truth boundary; reversible before, authoritative (supersede) after. |
| [`business-process-execution-platform.md`](../modules/business-process-execution-platform.md) | Name the runtime's operator-facing shape the **Decision Loop**; add the explicit multi-candidate Generate/Compare stage and the fast/full path. |
| [`../operator/canonical-interaction-model.md`](../operator/canonical-interaction-model.md) | Add **`resolve`** to the universal verb set as the prospective counterpart to `complete`. |

None invents a runtime; each names an abstraction over existing machinery.

---

## Cross-references

- [`operational-decision-platform.md`](./operational-decision-platform.md) — the apex.
- [`decision-cross-domain-validation.md`](./decision-cross-domain-validation.md) — the loop across nine domains.
- [`../core/operational-expectations-system-design.md`](../core/operational-expectations-system-design.md) — Facts/Expectations/Gap.
