---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Alloy — the Decision Architecture

**Status:** Proposed — the single, final architecture. This document stands alone. It is the synthesis the initiative was for; read it and nothing else is required. (The prior documents in this folder are the discovery trail that produced it — [`README.md`](./README.md) indexes them, but this is the architecture.)

---

## In one sentence

**Alloy turns operational pressure into operational truth — one decision at a time.**

- To an **operator**: *Alloy shows you what needs deciding, helps you weigh the tradeoffs, and lets you commit — safely.*
- To the **platform**: *Alloy detects the gap between what should be and what is, and resolves it through one primitive — the **Decision**.*
- To an **engineer**: *the Decision is the existing execution runtime (`resolve → evaluate → preview → commit`) reading two ledgers (Expectations, Facts) and writing effective-dated truth. No new runtime.*

Everything below is that sentence, expanded three ways.

---

## 1. The one primitive: the Decision

There is exactly one operational primitive. Everything the earlier work called *planning, resolve, simulation, optimization, commit, plan, alternative reality, proposed reality* is one of its parts:

```
             PRESSURE  ──►  ┌──────────  DECISION  ──────────┐  ──►  TRUTH
        (what needs deciding)│  options → tradeoffs → choose  │   (committed, real)
                             └────────────── COMMIT ──────────┘
                                             (the edge)
```

- **Pressure** is the *input*: a gap between what should be and what is.
- **Preview** is the *inside*: projecting each option's consequences before anything is real.
- **Commit** is the *edge*: the one boundary where a choice becomes truth.

A Decision is **reversible until Commit, and truth after it.** That is the whole model. Its power is that it is the *same* primitive in every domain (§4) and the *same* runtime underneath (§5).

---

## 2. Operator model — what a person experiences

Operators never see *expectations, facts, gaps, simulations, calculations, runtime, or ledgers.* They see five things:

| They see | Meaning |
|----------|---------|
| **A problem** | something needs a decision (*"Sunflower is over ratio Thursday"*) |
| **Options** | the ways to resolve it — ranked, with one recommended |
| **Tradeoffs** | what each option would change (before → after) |
| **Resolve** | choose the option that fits |
| **Commit** | make it real — reversible until this moment |

### The operator journey

> **A problem appears → you resolve it → it's done.**

Expanded only as far as it needs to be:

```
See what needs deciding  →  weigh the options and tradeoffs  →  commit  →  done
```

Most problems are one obvious move — *mark present, route the form, send the reply* — and collapse to a single click. Only genuine forks — *which room, which plan, which rate* — open the options-and-tradeoffs view. **The experience scales with the difficulty of the decision, never above it.** An operator learns it once and it is the same in every workspace.

Nothing else is in the operator's head. No "plan," no "simulation engine," no "optimization run." Just: *here's a problem, here are my options, here's what changes, commit.*

---

## 3. Platform model — the smallest platform

Four named concepts, over two ledgers Alloy already froze.

**The two ledgers (existing, unchanged):**
- **Expectation** — what *should / will* be (authored intent, targets, rules).
- **Fact** — what *is* (observed, immutable, effective-dated).

**The four platform concepts:**
1. **Pressure** — the derived gap between Expectation and Fact, present or projected. The single cross-domain signal that a decision is needed. *Derived, never stored.*
2. **Decision** — the bounded, reversible-until-commit episode that resolves a Pressure. The one primitive.
3. **Preview** — projecting a candidate decision's consequences through the same calculations that compute reality. *Write-free, deterministic.*
4. **Commit** — the single boundary from proposed to authoritative. Everything before is reversible; everything after is truth (corrected only by a new decision, never overwritten).

Plus **BOS**, the assistant woven through the Decision (§6) — it never becomes a fifth primitive because it never decides.

That is the entire platform: **Pressure → Decision (with Preview) → Commit → Truth**, reading Expectation and Fact. Four words. Everything else is a *view* of one of them.

---

## 4. Every domain is a decision domain

The primitive is domain-neutral. Each domain only fills in *what its pressures are, what options exist, and what truth it commits*:

| Domain | Pressure | Options | Commit → Truth | Typical shape |
|--------|----------|---------|----------------|---------------|
| **Scheduling** | ratio breach; child unplaced | move · staff · adjust | schedule assignment | full (real forks) |
| **Attendance** | expected ≠ actual; under-covered | transfer · cover · correct | attendance fact | fast |
| **Billing** | balance unpaid | plan · discount · retry | billing intent | fast + full |
| **Processing** | document unclassified | classify · route · reject | routed record | fast |
| **Communications** | message unanswered | reply · route · schedule | answered / task | fast |
| **Commercial** | offering underperforms | rate · offering · bundle | commercial intent | full |
| **Capacity** | fill vs target | open · close · reserve | capacity intent | full |

**Forecasting** and **Operational Intelligence** are not decision domains — they are the *pressure system*: Forecasting detects pressure early (gaps against projected facts); OI frames pressure (targets, KPIs) and measures the outcome of committed decisions. They feed decisions everywhere and decide nothing.

That Processing and Communications — Alloy's already-shipped, non-Scheduling workspaces — are decision domains under this model is the proof it is the platform and not a Scheduling feature. Scheduling did not need a new architecture; it revealed the one already there.

---

## 5. Engineering composition — who owns what (no new runtime)

Each responsibility maps onto an **existing** Alloy capability. Nothing new is built; the Decision is a *naming and composition* of the platform.

| Responsibility | Owning capability (exists today) |
|----------------|----------------------------------|
| **Expectation** (should/will) | Operational Expectations ledger |
| **Fact** (is) | Operational Facts ledger |
| **Pressure** (the gap) | derived by the Expectations comparison engine; surfaced as attention via **BOS** + **Current Work** / queue. *No new store.* |
| **Decision** (the episode) | the **Business Process / Execution Runtime**: `resolve → evaluate → preview → commit`. *No new runtime.* |
| **Preview** (consequences) | the runtime's **preview** phase running registered **Operational Calculations** over a candidate |
| **Options** (generate + rank) | deterministic search + **BOS** proposals + scoring |
| **Commit** (the edge) | the runtime's **commit** phase + **effective-dated supersede** (reality); the **Configuration Publication Runtime** for config assets (this is what "Publish" is) |
| **Actions** (what commit emits) | the existing **Actions / workflow** spine |
| **The Decision surface** | a **Focus Panel** card archetype (§7) |
| **The assistant** | **BOS** (§6) |
| **First decision domain** | **Scheduling** |

**Commit, Publish, and Apply are one pattern** — *cross the boundary from proposed to authoritative truth* — with two homes: **Commit** in Work (over live reality), **Publish** in Studio (over reusable configuration assets). Studio survives, and only for that: authoring the reusable assets (rules, patterns, templates, forms) that decisions operate within. Work is where decisions happen.

---

## 6. BOS — permanent doctrine

BOS improves decisions; it never makes them. This is the complete, final statement:

| BOS… | …does |
|------|-------|
| **sees** | both ledgers and every derived pressure, across all domains |
| **computes** | which pressure matters most (ranking), candidate options, their previewed consequences |
| **explains** | why a pressure exists, what each option changes, the tradeoffs — in plain language |
| **proposes** | a recommended option (a rank, a suggestion) |
| **never** | **chooses, commits, or writes truth** |

The **Choose** and the **Commit** are human-held, always. BOS is present at every other step and is never a destination. Deterministic search suffices when options are enumerable and the objective is clear; BOS earns its place when the option space is large or non-obvious. This is the ratified *"BOS proposes; humans approve,"* stated once, for good.

---

## 7. The Decision card — one reusable Focus Panel archetype

The Focus Panel gains exactly one new card archetype: the **Decision card**. It is the operator's whole decision experience in one card, and it is identical across domains — only its content changes.

```
┌───────────────────────────────────────────────┐
│ WHAT NEEDS DECIDING            [ severity ]     │   ← the problem, in plain language
│ Sunflower is over ratio Thursday (12 of 11)     │
├───────────────────────────────────────────────┤
│ OPTIONS                                         │
│ ● Move Ethan → Sunshine        recommended      │   ← ranked; one recommended (BOS)
│ ○ Add a teacher Thursday                        │
│ ○ Drop one Thursday session                     │
├───────────────────────────────────────────────┤
│ TRADEOFFS   now 12/11 over  →  then 11/11 ok    │   ← before → after (Preview)
│ labor $0 · tuition $0 · no new conflicts        │
├───────────────────────────────────────────────┤
│                              [ Commit ]         │   ← the boundary
└───────────────────────────────────────────────┘
```

It works for Scheduling, Attendance, Billing, Processing, Commercial, Communications, and Forecasting hand-offs, because every one of those produces the same four things: a problem, options, tradeoffs, and a commit. **It is a reusable archetype** — extract it as the `decision` card in the Focus Panel card library, alongside the existing profile/status/summary/metric archetypes.

---

## 8. Vocabulary — one word per concept, per audience

The final, fixed vocabulary. A concept has one word in each register; nobody uses another register's word.

| Concept | Operator says | Platform says | Engineer says |
|---------|---------------|---------------|---------------|
| something needs deciding | **problem** | **pressure** | **gap** (Expectation − Fact) |
| the ways to resolve it | **options** | candidate **decisions** | generated candidates |
| what each would change | **tradeoffs** | **preview** | preview phase + calculations |
| choosing one | **resolve** | **decide** | operator select (Intent) |
| making it real | **commit** *(Studio: publish)* | **commit** | commit phase + supersede |
| what should be | — *(never sees)* | **expectation** | Expectations ledger |
| what is | — *(never sees)* | **fact** | Facts ledger |
| the assistant | *(sees suggestions)* | **BOS** | AI platform |

**Retired for good** — merged or removed, appearing nowhere in the final product: *Planning, Plan, Operational Planning, Simulation, Alternative Reality, Proposed Reality, Optimization, Apply, Studio-canvas, plan board, futures.* Each was scaffolding; the concept it pointed at survives under one of the words above.

---

## 9. Why it feels inevitable

- **One primitive** (Decision) with three parts (Pressure in, Preview inside, Commit edge). No concept needs another vocabulary to explain it.
- **Two ledgers** it reads, both already frozen.
- **Zero new runtimes** — it *is* the execution runtime, named.
- **One card** for the operator, everywhere.
- **One boundary** (Commit) between reversible and true.

An operator understands it in two minutes: *see a problem, weigh the options, commit.* An engineer understands it in fifteen: *pressure is a derived gap; a decision is the execution runtime; commit is the supersede.* That is the architecture.

---

## Cross-references (the discovery trail, for provenance only)

The reasoning that produced this — pressure = gap, planning-in-Work, reality-not-plans, cross-domain validation — is recorded in [`operational-decision-platform.md`](./operational-decision-platform.md), [`operational-pressure-and-decision-loop.md`](./operational-pressure-and-decision-loop.md), and [`decision-cross-domain-validation.md`](./decision-cross-domain-validation.md). Ratification path and dispositions: [`decision-rfc-recommendations.md`](./decision-rfc-recommendations.md).
