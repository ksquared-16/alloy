---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# The Operational Decision Platform — what Alloy actually is

**Status:** Proposed — Iteration-4 discovery, and the apex of this initiative. The first three iterations discovered planning; this one discovers that **planning was one instance of a larger thing.** Alloy is not fundamentally a platform that *manages work*. It is a platform that helps organizations **move from operational pressure to operational truth** — a **Decision Platform**. Scheduling was simply the first domain that revealed it.

**The final constraint governs everything here:** *do not invent a new runtime.* This document's central claim is that the Decision Platform **already exists**, unassembled, in Alloy's frozen capabilities. The deliverable is the **missing abstraction** — three names and one boundary — not new machinery.

---

## 1. The spine: Pressure → Decision → Truth

Everything reduces to one sentence:

> **An operator's whole job is to move operational reality from *pressure* to *truth*, one decision at a time.**

- **Pressure** is where a gap has opened between what *should/will be* and what *is*.
- **Decision** is the operator choosing a reality that closes the gap.
- **Truth** is that reality, committed and authoritative.

Three words, and each is already a first-class thing in Alloy — we just never named the middle one or connected the three.

---

## 2. The missing abstraction #1 — **Operational Pressure is a Gap**

The mission asks: *what creates pressure? how is it represented? can it exist without work? without planning?* The answers are already frozen in doctrine, under a different name.

Alloy's **Operational Expectations** architecture ([`operational-expectations-system-design.md`](../core/operational-expectations-system-design.md)) establishes **two authored ledgers** — **Facts** ("what IS") and **Expectations** ("what SHOULD / WILL be") — and rules that **everything else is *derived*.** The first derived thing is the **Gap**: the pure comparison of `(Expectation, Facts, clock)`.

**That Gap is Operational Pressure.** Run the mission's own examples through it:

| Pressure | Expectation (should/will) | Fact (is) | = Gap |
|----------|---------------------------|-----------|-------|
| Ratio exceeded | room within ratio tier | projected occupancy over tier | ratio gap |
| Child needs a room | enrolled child is placed & scheduled | no committed schedule | placement gap |
| Teacher called out | room is staffed to ratio | staff on hand short | coverage gap |
| Attendance changed | expected attendance | actual attendance differs | attendance gap |
| Payment failed | balance is paid | balance unpaid | billing gap |
| Unread communication | inbound answered within SLA | no reply | response gap |
| Unprocessed document | inbound classified & routed | unclassified | processing gap |
| Forecast predicts pressure | future room within ratio | *projected* future occupancy over tier | **projected** gap |

**Every operational pressure is a gap between an expectation and reality — present or projected.** This is the single most important discovery of the sprint, and it is not new architecture: it is the recognition that the Gap the Expectations engine already derives *is* the pressure operators feel.

Consequences (answering the mission directly):

- **Pressure is derived, not stored.** It is computed from the two ledgers + clock — never an authored table. (Honors Law 2: derived, non-authoritative.)
- **Pressure can exist without work.** A gap exists the instant an expectation diverges from fact, before any work item, queue row, or plan. Work is one *way to surface* pressure; the pressure predates it.
- **Pressure can exist without planning.** Planning is one *way to resolve* pressure; the gap is there whether or not anyone plans a response.
- **Forecasting is pressure surfaced early.** A forecast is a gap computed against *projected* facts — the same primitive, read forward. Forecasting is not a separate thing; it is early pressure detection.
- **Pressure is the reusable platform primitive the sprint sought.** It is domain-neutral: a gap is a gap whether the ledgers are about ratios, payments, or unread mail.

> **Missing abstraction #1:** *Operational Pressure* = a surfaced **Gap** between the Expectations ledger and the Facts ledger. Extract it as a first-class, cross-domain read model. No new store; it is derived.

---

## 3. The missing abstraction #2 — **Decision** is the primitive

The mission asks whether **Decision** becomes *the* platform primitive, and how it differs from an action and from work. It does, and the distinctions are clean.

**A Decision** is a bounded, reversible-until-commit episode that takes a **Gap** (pressure) and produces a **committed change to reality** (or a deliberate no-op) that closes it.

| | Definition | Relationship |
|---|-----------|--------------|
| **Gap / Pressure** | the divergence that demands attention | the *input* to a decision |
| **Decision** | choosing a reality that closes the gap | the *episode* |
| **Action** | a single authoritative write | what a *committed* decision *emits* (Action ⊂ Decision's output) |
| **Work** | a container that needs attention | the *where* a decision often surfaces (but a decision can exist without a pre-standing work item — e.g. a forecast gap) |

- **Decision vs Action.** An action *executes* (mark present, send message, write a row). A decision *chooses among alternative realities* and then, at Commit, emits one-or-many actions atomically. **Action = execute; Decision = choose, then execute.** Every action is the tail of a decision; most decisions are trivial (one obvious option) and collapse to a single action.
- **Decision vs Work.** Work is *"a unit that needs attention"* — a container. A decision is *what happens to it under pressure.* Not all work is a decision (pure reporting — *"what happened?"* — is witnessing, not choosing), and not all decisions attach to pre-existing work (a forecast opens a decision before any work item exists). They overlap; they are not the same.

**Can every operational product be modeled around decisions?** Yes — §7 validates it across nine domains. Each domain is a **decision domain**: it detects its own gap-types, proposes its own alternatives, and commits its own truth, over one shared loop.

> **Missing abstraction #2:** *Decision* — the bounded episode from Gap to committed change. Actions are what decisions emit; work is where decisions surface. Extract Decision as the platform primitive that Planning, Processing, Communications, Billing… all specialize.

---

## 4. The Decision Loop — and why it needs no new runtime

The mission proposes a loop and says *challenge it, refine it, replace it if necessary.* Refined:

```
   Operational Reality
        │
        ▼
   PRESSURE (a Gap surfaces)                 ← Expectations − Facts (present or projected)
        │
        ▼
   UNDERSTAND                                ← Focus Panel: the gap, its cause, its consequence (BOS explains)
        │
        ▼
   GENERATE candidate realities              ← deterministic search + BOS + operator (this is "Optimization")
        │
        ▼
   COMPARE consequences                      ← Simulation: project each candidate via registered Calculations
        │
        ▼
   CHOOSE                                     ← the operator (never BOS)
        │
        ▼
   COMMIT ───────────────────────────────    ← the Decision → Truth boundary (§6)
        │
        ▼
   Operational Truth  →  (new Gaps)
```

**This loop is not new. It is the BPR Execution Runtime Alloy already ships**, whose four phases are **`Resolve → Evaluate → Preview → Commit`** ([`business-process-execution-platform.md`](../modules/business-process-execution-platform.md)), producing an atomic `MutationResult` + `mutation_events` outbox. Map it:

| Decision Loop step | Existing Alloy machinery |
|--------------------|--------------------------|
| Pressure | derived **Gap** (Expectations) surfaced as **attention** (BOS computes; queue shows) |
| Understand | **Focus Panel** / Record of Attention + Context Frame; BOS explanation |
| Generate | mutation-runtime candidate generation + **BOS proposals** (`bosProposalLifecycle`) |
| Compare | **Preview** phase + registered **Operational Calculations** (Simulation) |
| Choose | operator (Intent layer) |
| Commit | mutation-runtime **Commit** phase → effective-dated supersede |
| Truth | **Facts / Intent** ledgers; new gaps derive |

The only genuinely *new* element is naming the **Generate + Compare** step as a first-class, multi-candidate stage — and even that is just **Preview run over N candidate realities**, which the runtime already supports one-at-a-time. **No new runtime. One boundary line and three names.**

### The loop has a fast path and a full path

Not every gap needs alternatives. **Resolution of a gap is either a *witnessed fact* or a *decided change*:**

- **Fast path (witness / obvious):** the gap closes with a single authored fact — *child arrived → mark present.* One option, no comparison. This is the *"WHAT HAPPENED?"* completion Alloy already has.
- **Full path (decide):** the gap has genuinely different possible resolutions — *ratio breach → move a child, add staff, or shed a session.* Generate → compare → choose.

The loop **scales**: trivial decisions collapse to one click; hard decisions expand to alternative-reality comparison. Processing and Communications are mostly fast-path; Scheduling and Capacity are often full-path. Same loop, different depth. This keeps the model honest — Alloy does not turn *"mark present"* into a heavyweight decision ceremony.

> **Missing abstraction #3:** the **Decision Loop** = the existing Execution Runtime, generalized with an explicit multi-candidate Generate/Compare stage and a fast/full path. Extract the *shape*, reuse the *runtime*.

---

## 5. What is "Resolve"? (challenge resolved)

Iteration 3 made **Resolve** the operator verb. Challenged now: is it a command, workflow, runtime, interaction, capability, or just UI language?

**Verdict: Resolve survives — as the universal *interaction* that opens a Decision on a Gap.** It is:

- **not a runtime** (the runtime is the Execution/mutation runtime);
- **not a workflow** (workflows are per-domain; Resolve is universal);
- **not mere UI language** — it is a real capability: *"take this pressure and run the decision loop against it."*
- It is a **universal Intent-layer verb**, alongside the ones Alloy already has (`focus · complete · create · review · switch`). And it fills a real gap in that set: those verbs are mostly **retrospective** (report/navigate); **Resolve is the prospective verb** — *choose the reality that closes this gap.* Alloy's operator verbs split into **Witness** (*what happened* → author a Fact) and **Decide/Resolve** (*what should happen* → choose & commit). `complete` is witnessing; `resolve` is deciding.

So: the **capability** is *Decision*; the **interaction** that invokes it is *Resolve*. Extract Resolve as a member of the universal verb set — `resolve(gap)` — not as a new subsystem.

---

## 6. Commit — the permanent boundary between Decision and Truth

The mission asks whether Commit is *the* boundary between decision and truth, and whether that becomes doctrine. **Yes — and it should be ratified as permanent Alloy doctrine:**

> **The Commit Boundary.** Commit is the single boundary between decision and truth. **Everything before Commit is reversible** (candidate realities are disposable, write-free, consequence-free). **Everything after Commit is operational truth** — authoritative, effective-dated, and corrected only by a *new* decision that supersedes, never by deletion.

This is not new mechanism; it is the promotion of two things Alloy already enforces to a stated law:

- the mutation runtime's atomic **Commit** phase (all-or-nothing, outbox-notified);
- Record's distinction between **optimistic** (pre-commit, reversible) and **authoritative-confirmed** (post-commit, never optimistically "succeeded") mutations, and the **effective-dated supersede** law (never overwrite history).

Commit is where a *decision* becomes a *fact/intent*. The ledger of commits on any subject is its decision history — auditable and replayable. **Extract the Commit Boundary as doctrine.**

---

## 7. Cross-domain validation — every domain is a decision domain

The acid test: the loop must hold across **Processing, Communications, Scheduling, Attendance, Commercial, Billing, Capacity, Forecasting, Operational Intelligence** — or it is Scheduling, not platform. Full table in [`decision-cross-domain-validation.md`](./decision-cross-domain-validation.md). Summary:

Every domain has a **gap** (its pressure), a way to **generate** resolutions, a **consequence** projection, and a **commit to truth** — over the *same* loop. **Processing** (unclassified document → classify/route → routed) and **Communications** (unanswered message → reply/route → answered) validate it *outside* Scheduling, which is the decisive result: they are mostly fast-path decisions, but the loop is identical. Two domains are special:

- **Forecasting** is not a decision domain — it is **early pressure detection** (gaps against projected facts). It *feeds* decisions everywhere.
- **Operational Intelligence** is not a decision domain — it is **pressure detection + outcome measurement** (KPIs surface gaps; it reads the results of committed decisions). It *frames* decisions everywhere.

So the nine domains are seven **decision domains** over one loop, plus two **decision-neighbors** (Forecasting surfaces pressure; OI frames it and measures outcomes). Nothing here is Scheduling-specific.

---

## 8. BOS — the decision assistant, woven, never deciding

The mission asks BOS's natural role. It is already ratified: *BOS computes attention/recommendations; Operational applies* and *BOS proposes; humans approve.* In decision terms, BOS participates at **every step except Choose and Commit:**

| Loop step | BOS role |
|-----------|----------|
| Pressure | **surface** — compute the gap, rank attention |
| Understand | **explain** — why this gap, what it will cost |
| Generate | **propose** — non-obvious candidate realities |
| Compare | **simulate & explain tradeoffs** — project consequences, narrate |
| Choose | *(operator only)* |
| Commit | *(operator only — BOS never commits)* |

BOS does not *replace* decision-making; it **improves** it — better pressure detection, better alternatives, clearer tradeoffs. AI (BOS) earns its place when the candidate space is large or non-obvious; **deterministic search suffices** when the space is enumerable and the objective is clear. BOS is the woven decision-assistant, exactly the "woven layer, never a destination" it already is.

---

## 9. Is this a new platform layer? No — it is the operator-experience *reading* of the existing stack

Per the final instruction, the honest answer: **the Decision Platform is not a new runtime and not a new layer. It is the *name* for what the existing composition already does** when you look at it from the operator's side:

```
Operational Expectations + Facts  →  GAP (Pressure)
   →  Attention/Queue (surface)  →  Focus Panel (understand)
   →  Execution Runtime: Resolve→Evaluate→Preview→Commit  (decide)
        with registered Calculations (compare) + BOS (assist)
   →  effective-dated Truth  (commit boundary)
```

Read top-to-bottom it is "the operating system." Read as an operator's lived experience it is **"see pressure → make a decision → commit truth."** Same machinery, named. That naming is the deliverable — it tells every future domain (and every mockup) what to build: *detect your gaps, offer resolutions, commit truth,* over one loop.

**What this reframes:** the entire `planning/` subtree is now understood as **the Scheduling decision domain** — Planning = making decisions over scheduling gaps; "proposed reality" = a candidate decision; "Resolve" = opening a decision; "Commit" = the boundary. Nothing in Iterations 1–3 is discarded; it is **subsumed** as the first worked example of the Decision Platform.

---

## 10. Deliverable map

| Mission deliverable | Where |
|---------------------|-------|
| Operational Decision Platform | this doc |
| Decision Runtime | §4 (= existing Execution Runtime; no new runtime) |
| Operational Pressure model | §2 + [`operational-pressure-and-decision-loop.md`](./operational-pressure-and-decision-loop.md) |
| Decision Loop | §4 + pressure/loop doc |
| Simulation architecture | §4 (Compare = Preview + Calculations); [`operational-simulation.md`](./operational-simulation.md) |
| Optimization architecture | §4 (Generate); [`operational-optimization.md`](./operational-optimization.md) |
| Commit architecture | §6 (the Commit Boundary doctrine) |
| BOS participation model | §8 |
| Cross-domain validation | §7 + [`decision-cross-domain-validation.md`](./decision-cross-domain-validation.md) |
| Fourth-generation mockups | [`mockups/scheduling-planning-mockups-v4.html`](./mockups/scheduling-planning-mockups-v4.html) |
| Platform doctrine updates | §2 (Pressure=Gap), §3 (Decision), §6 (Commit Boundary) — proposed additions to the Expectations/Truth-flow/Execution docs |

---

## Cross-references

- [`operational-pressure-and-decision-loop.md`](./operational-pressure-and-decision-loop.md) — the pressure taxonomy, the loop, Decision vs Action vs Work, the Resolve verb.
- [`decision-cross-domain-validation.md`](./decision-cross-domain-validation.md) — the nine-domain table.
- [`operational-planning-runtime.md`](./operational-planning-runtime.md) — the Scheduling decision domain (Iteration 3), now one instance of this platform.
- [`../core/operational-expectations-system-design.md`](../core/operational-expectations-system-design.md) — the two ledgers and the derived Gap (= Pressure).
- [`../modules/business-process-execution-platform.md`](../modules/business-process-execution-platform.md) — Resolve→Evaluate→Preview→Commit (= the Decision Runtime).
- [`../foundation/os-runtime-map.md`](../foundation/os-runtime-map.md) — the composition, and the "no new runtimes" discipline this honors.
