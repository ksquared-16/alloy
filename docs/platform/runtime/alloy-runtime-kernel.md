---
owner: runtime
status: ratified
last_reviewed: 2026-07-19
supersedes: []
---

# The Alloy Runtime Kernel

> **Runtime V1 freeze (2026-07-19).** This kernel is RATIFIED and realized. Its four systems (K1
> Attention, K2 Provisioning, K3 Focus, K4 Instrumentation) are the runtime that exists. The Runtime V1
> freeze re-expresses this same lifecycle in the operator vocabulary **Destination → Preparation →
> Provisioning → Commit → Settlement**; the mapping to the kernel's K1/K2/K3 names lives in the Runtime
> Constitution V1 (`docs/runtime/runtime-constitution-v1.md` §2). No architecture changed — only the
> phase names were made linear for the Constitution. This document remains the authoritative kernel spec.

**Derived from:** [The Alloy Operating System — Constitution](./runtime-realization-architecture.md)
(frozen) and the [Runtime Realization Engineering Specification](./runtime-realization-engineering-specification.md).
**Status:** Proposed. The final architectural artifact before implementation.

> The Constitution defines **what Alloy is**.
> The Engineering Specification defines **how Alloy is realized**.
> This document defines **what runtime actually exists inside Alloy**.

**Method.** Every runtime implementation is assumed gone: every file, component, hook, cache,
coordinator, and service. Only the two frozen documents remain. The kernel below is derived from them
alone. Today's implementation appears **only** in §7, after the kernel is complete, and it was not
permitted to influence §1–§6.

---

## The kernel in one sentence

> **Attention is where the operator wants to be. Focus is where the operator is.
> The kernel exists to close the gap between them without the operator noticing.**

Everything follows from that gap:

| The gap | Is called | Constitution |
|---|---|---|
| The gap opens | **attention moved** | Art 2.3 |
| The gap is acknowledged | **Acknowledged** | Art 1.3, 4.1 |
| The gap is being closed | **Transitioning** — focus holds valid truth while truth is obtained | Art 4.1 |
| The gap closes | **Operational Commit** — *focus catches up to attention* | Art OC.1 |
| Everything else catches up | **Settled** | Art 4.1, 4.4 |

**Operational Commit — "the operator can continue working" — is exactly the moment focus equals
attention.** That equivalence is the kernel's organising idea, and it produces the entire design.

---

# 1 — The Kernel

## 1.1 The four systems

The Constitution requires exactly four things of a runtime. Each is one system:

| # | System | The question it owns | Owns |
|---|---|---|---|
| **K1** | **ATTENTION** | *Where does the operator want to be?* | the operator's intent, at every scope |
| **K2** | **PROVISIONING** | *What truth does that require, and is it here yet?* | truth acquisition + terminal outcomes |
| **K3** | **FOCUS** | *Where is the operator, and what do they see?* | the visible world + when it changes |
| **K4** | **INSTRUMENTATION** | *Did we keep our promises?* | the operator signals |

**That is the whole kernel.** Four systems, no overlap, no compatibility, no fifth.

## 1.2 Why not fewer

- **Attention and Focus cannot merge.** During a transition they *differ* — attention is at the
  destination, focus is still on valid truth. **The gap between them is the transition itself.** A
  runtime that merges them has no way to be in one place while wanting another, which is to say no way
  to hold anything. That is the entire defect the Constitution exists to forbid.
- **Provisioning cannot merge into Focus.** Focus decides what is *seen*; Provisioning decides what is
  *true and here*. Merging them recreates the original sin: a thing that shows and fetches at once,
  free to reveal what it is still fetching.
- **Instrumentation cannot merge into anything.** A system that both acts and grades itself will grade
  itself favourably — which is precisely how a specification asserting "no blank frame" passed while
  the operator watched a skeleton (Spec §7.5). Measurement must be structurally unable to be the thing
  measured.

## 1.3 Why not more

Everything else proposed for the kernel is either a **responsibility** of one of the four, or a
**neighbour** outside it:

| Candidate | Verdict | Because |
|---|---|---|
| Retention | **responsibility of K3 Focus** | Retention is Focus's memory of contexts. It has no independent state — it *is* Focus's state, held over time. |
| URL / History / Projection | **responsibility of K3 Focus** | A projection has no owned state; it is a pure function of committed focus (Art 2.4). Giving it a system would create two owners of "where the operator is." |
| Settlement | **responsibility of K2 Provisioning** | Settlement is truth acquisition after commit. Same activity, same declarations, different phase. Two systems would mean two owners of "get this surface's truth" — a fork by construction. |
| Preparation-warming | **responsibility of K2 Provisioning** | Warming *is* preparation begun at intent (Art 4.3). It was never a separate thing; treating it as one is what let it become fire-and-forget. |
| Deadline | **responsibility of K2 Provisioning** | Its only product is a terminal `error` (Art 4.5). It belongs to the thing that terminates. |
| Reload floor | **responsibility of K3 Focus** | It is the visible world being rebuilt. Only Focus may change the visible world. |
| Readiness | **not a thing** | Readiness is Provisioning's terminal outcome (Art 4.6). A readiness system is the disease. |
| Navigation | **not a thing** | Navigation is an output of Focus (Art 2.4). A navigation runtime is a category error. |
| Reconciliation | **neighbour — Records** | Constitutionally owned by the record layer, below the seam (Art 4.8). |
| Entry Resources | **neighbour — server** | They answer Provisioning; they are not part of it. |

---

# 2 — The Runtime Systems

*Implementation-independent. No framework, transport, or language is named or implied.*

---

## K1 — ATTENTION

**Purpose.** To know what the operator is attempting to accomplish, and to answer them instantly.
Attention is the kernel's only cause (Art 2.3).

**Responsibilities**
1. Receive every attention movement, at every scope, from every expression (gesture, keyboard,
   command, search, deep link, agent-on-behalf-of-operator).
2. **Acknowledge unconditionally, in under 50 ms, before anything else exists** (Art 1.3). Acknowledgment
   is never contingent on network, truth, or destination.
3. Resolve scope (§2.1.1) and target.
4. Decide supersession: **the newest attention wins, always** — and say so once, for the whole kernel.
5. Emit `attention.moved`.

**Owned state.** The current attention (scope + target) and its supersession identity. Nothing else.

> **Cohort selection is part of the intent, and is stated rather than inferred.** Attention carries
> whether the operator selected a Work View at all — `cohort: "none"` when they named a **record**
> instead. This is not a second kind of state: it is the same intent the other coordinates carry, and it
> is here because nothing else can carry it from the gesture to the answer and back through a reload.
>
> It cannot be folded into `lens: null`, and the reason is exact. `lens: null` already means *"no lens
> was NAMED — resolve the configured default"*, which is what nearly every Workspace link, every cold
> URL without `?work_view_id`, and every Search click has always sent. Reading that same absence as *"no
> cohort was SELECTED"* would make ordinary destinations contextual by accident and darken pills that
> operators rely on. Two different intents were sharing one encoding; they are now separate.
>
> A **LENS** movement clears it — choosing a cohort is precisely what stops being contextual — and a
> **SURFACE** movement does not inherit it, because arriving somewhere new must not carry the previous
> surface's answer about whether a cohort was chosen. It is projected as `?cohort=none` so a reload
> restores the absence instead of resolving a default.

**Inputs.** Operator expressions. Cold-load hydration (a URL is read *once*, into attention — Art 2.4).

**Outputs.** `attention.moved`. The acknowledgment obligation discharged.

**Events emitted.** `attention.moved(target, scope, id)`.

**Contracts**
- Acknowledgment is unconditional and unbounded by any other system's state.
- **One mechanism at every scope** (Art 2.3, Anti-Fork). Attention does not know that surfaces are
  larger than subjects; it only knows scope is a number.
- Attention never fetches, never renders, never commits.
- A URL may hydrate attention on cold load; a URL may never *move* attention (Art 2.4).

**Failure model.** Attention cannot fail. A movement is always accepted and always acknowledged; if
everything downstream fails, the operator was still answered. **This is deliberate: acknowledgment is
the one promise that must survive total failure of the rest of the kernel.**

**Recovery model.** None required. It has no external dependency to lose.

**Relationships**
- → **K2 Provisioning**: every movement causes preparation, and supersedes the prior.
- → **K3 Focus**: Focus reads attention to know what it must catch up to. **Focus never writes it.**
- → **K4 Instrumentation**: emits t₀ (the moment intent existed) and the acknowledgment mark.
- **Records / Presentation / Business Processes**: no relationship. Attention knows nothing of truth,
  appearance, or domain.

**Engineering ownership boundary.** Owns intent and scope. **Does not own** navigation, routing, the
URL, focus, truth, or rendering.

**Certification responsibility.** `acknowledgment_ms ≤ 50 ms at every scope, on every path, cold and
warm`; and the anti-fork assertion: exactly one mechanism serves all scopes.

### 2.1.1 Scope (owned by K1)

Scopes are **nested**, and this nesting is a kernel law:

```
   SURFACE  ⊃  LENS  ⊃  SUBJECT  ⊃  ASPECT
   "Billing"   "Waitlist"  "the Wright family"  "their activity"
```

> **Law of Scope Supersession.** An attention movement at a coarser scope supersedes every
> finer-scope movement and preparation within the context it leaves.

Moving to another surface abandons the lens, subject, and aspect work inside the old one — instantly
and without argument. Without this law, a stale subject preparation could commit inside a surface the
operator has already left. **The lifecycle is scope-parameterised; only the quantity of preparation
differs — never the mechanism** (Art 2.3).

---

## K2 — PROVISIONING

**Purpose.** To obtain the truth a destination requires, in one answer, and to **terminate** — so that
something in the runtime can finally say *"this is over."*

> The absence of this system is the root defect the Engineering Specification identified: the 2.5 s
> clock existed **because nothing could say a preparation was over** (Spec §4.1).

**Responsibilities**
1. **Prepare**: fulfil a scope's declared **Preparation Contract** — *nothing more* (Art 3.2.2).
2. Guarantee **one answer**: dependent resolution happens where the answers live, never as a second
   round-trip (Art 4.3 §2).
3. Key, share, and supersede: one destination prepared twice is one preparation; a superseded
   preparation can never win.
4. **Terminate**: resolve exactly once to `operational` · `empty` · `error`.
5. Own **the deadline** — single, runtime-owned; **its only product is `error`** (Art 4.5).
6. **Settle**: after commit, fulfil the **Settlement Contract**, never gating, discarding by key.

**Owned state.** The set of preparations, keyed by `(scope, target, lens, principal, tenant)`, each
with a lifecycle and exactly one terminal outcome; and in-flight settlement, keyed identically.

**Inputs.** `attention.moved` (begin/supersede). `focus.committed` (begin settlement). Surface
declarations (Preparation and Settlement Contracts). Entry Resource answers. Record truth.

**Outputs.** `preparation.terminal(key, outcome, snapshot)` — an **immutable** snapshot. Settlement
patches.

**Events emitted.** `preparation.terminal`, `settlement.resolved`.

**Contracts**
- One round-trip per Preparation Contract. A dependent chain across a network is a **design error**,
  not a latency problem (Art 4.3 §2 corollary).
- Bounded by declaration: *nothing more*. This is the permanent limit on the appetite of preparation.
- A snapshot is immutable at commit; change arrives by settlement or reconciliation.
- **Provisioning never renders and never commits.** It produces truth; it does not decide appearance
  or timing.
- Settlement begins only after commit and may never gate one.

**Failure model.** Four terminal outcomes, all of them **workable places** (Art OC.4 Law 4):
`operational` · `empty (authoritatively)` · `error (honestly)` · `contextual (no cohort selected)`.
**There is no non-outcome:** a preparation that will not conclude is concluded by the deadline as
`error`.

> **The enumeration was three, and the correction is worth stating.** The rule this clause protects is
> *no non-outcome* — every preparation reaches exactly one terminal, so that something can say a
> preparation is over. That is unchanged. What the three-outcome list got wrong is that it assumed every
> destination selects a cohort: `operational` and `empty` both presuppose a chosen Work View (rows, or a
> cohort observed to hold none), and `error` says the answer failed. None of them can say *"the operator
> named a record, and chose no cohort"* — so that state had to borrow a lens to be expressible at all,
> which is how opening a person landed on the host unit's first Work View with its pill lit. `contextual`
> is that absence, made serveable. `empty` means a **selected** cohort holds no rows; `contextual` means
> none was selected, so there is nothing whose emptiness could be reported.

**Recovery model.** The deadline is the recovery: it converts a stall into a truth. It may produce
`error` and **never** `operational` (Art OC.4 Law 3). Beyond that, Provisioning does not recover — a
runtime that cannot even terminate is Focus's reload floor.

**Relationships**
- ← **K1 Attention**: caused by movement; superseded by movement.
- → **K3 Focus**: hands it terminal outcomes. **Focus commits on them; Provisioning never asks to be
  shown.**
- ← **Surfaces**: reads their declared contracts. Provisioning does not decide what is required — the
  surface declares it.
- ← **Entry Resources / Records**: asks them for truth.
- → **K4 Instrumentation**: preparation timing, terminal outcome, round-trip count.

**Engineering ownership boundary.** Owns truth acquisition and termination for a scope. **Does not
own** what truth *means* (Records), what is *required* (the surface's declaration), when it is *shown*
(Focus), or how it *looks* (Presentation).

**Certification responsibility.** One round-trip per Preparation Contract; every preparation reaches a
terminal outcome; the deadline never produces `operational`; settlement never gates a commit; a
superseded response never lands.

---

## K3 — FOCUS

**Purpose.** To be the single authority on **where the operator is and what they see** — and the only
system in Alloy permitted to change it.

**Responsibilities**
1. Hold `current`, `outgoing`, `incoming` — **per scope**.
2. **Hold valid truth** while attention is ahead of focus. The outgoing is kept, mounted and
   non-interactive, until its successor is Operational (Art 3.4).
3. **Commit** — atomically — on `preparation.terminal`, and on nothing else. Never on a clock, never
   on the DOM, never on a component's opinion.
4. **Retain** — surfaces and their operator context persist while attention is elsewhere (Art 3.5).
   Retention, not reconstruction.
5. **Project** — serialize committed focus to the URL/history. Hydrate from it on cold load only.
6. **Recover** — the reload floor, when the runtime cannot reach a terminal outcome at all.

**Owned state.** Per scope: `current`, `outgoing`, `incoming`, phase. The retained contexts. The
projected URL. **This is the entire visible world of Alloy.**

**Inputs.** Attention (what to catch up to). `preparation.terminal` (permission to commit). Cold-load
URL (hydration, once).

**Outputs.** The committed focus — what Presentation renders. The projected URL. `focus.committed`.

**Events emitted.** `focus.committed(scope, target)`, `focus.settled(scope)`, `focus.recovered(reason)`.

**Contracts**
- **A surface is never shown before it is Operational** (Art OC.4 Law 1). There is no partial arrival.
- **Commit is atomic** and is caused by truth, never by time (Art OC.4 Law 3).
- **Time may change what the operator is told; it may never show a non-Operational destination.**
  Focus may escalate an affordance; it may not escalate a reveal.
- No surface is destroyed before its successor is Operational (Art 3.4).
- Promotion `incoming → current` is a change of role, **never a rebuild**.
- **Focus never fetches.** It waits.
- **Focus never un-commits.** Once Operational, a surface stays Operational; truth may change its
  contents (Art 4.8) but may never revoke its commit.

**Failure model.** Focus itself has one failure: it cannot obtain a terminal outcome at all — the
runtime is inconsistent. All other failures arrive as terminal outcomes and are simply committed
(an honest error surface is a workable place).

**Recovery model.** The **reload floor** — a deliberate, correct rebuild (Art 4.5). Retained forever,
never the default, and never reached by slowness. It answers an inconsistent runtime, not a slow one.

**Relationships**
- ← **K1 Attention**: reads it; never writes it. The gap between them is the transition.
- ← **K2 Provisioning**: receives terminal outcomes; commits on them.
- → **Presentation**: hands it the committed world to render. Presentation never asks Focus for
  permission and never tells Focus it is ready.
- → **K4 Instrumentation**: commit and settle marks; continuity breaks.
- **Records**: none. Focus does not know what a record *is*; it only knows where the operator is.

**Engineering ownership boundary.** Owns the visible world, its retention, and its address. **Does not
own** truth, appearance, motion curves, or domain.

**Certification responsibility.** `visible_construction_ms = 0`; `continuity_breaks = 0`; zero
rebuilds across an exchange; URL⇄focus parity under link, back/forward, and deep link; the floor is
never reached by slowness.

---

## K4 — INSTRUMENTATION

**Purpose.** To know whether the kernel kept the Constitution's promises — and to be **structurally
incapable of flattering itself**.

**Responsibilities**
1. Emit the operator signals (Art 4.7): `acknowledgment_ms`, `operational_commit_ms`,
   `visible_construction_ms`, `continuity_breaks`.
2. Observe, never participate.
3. Be the sole input to Certification.

**Owned state.** The per-movement record: t₀, acknowledgment, terminal outcome, commit, settle,
observed construction, observed breaks.

**Inputs.** Events from K1, K2, K3. Direct observation of the rendered world.

**Outputs.** The operator signals. Nothing else.

**Events emitted.** None. **Instrumentation is silent by construction** — a system that emits events
can be depended upon, and a measurement that is depended upon has become a mechanism.

**Contracts**
- **Instrumentation may never be an input to kernel behaviour.** No system may read it. Nothing may
  branch on it.
- It measures the **operator**, never the machine. Requests, caches, and durations are diagnostics;
  they are never acceptance (Art 4.7).
- **A certification that cannot fail the current implementation is not a certification** (Spec §7.5).

**Failure model.** Instrumentation failing must never affect the operator. If it cannot measure, it
says so; it never degrades the runtime to be measurable.

**Recovery model.** None. It is not on any operator path.

**Relationships.** Observes K1, K2, K3, and the rendered world. **Nothing observes it.** This
asymmetry is the point.

**Engineering ownership boundary.** Owns operator truth about the runtime. **Does not own** budgets
(Product ratifies them — D-6) or verdicts (Certification renders them).

**Certification responsibility.** Itself: it must demonstrably distinguish a conforming runtime from a
non-conforming one **before** it is trusted to grade either.

---

# 3 — The Runtime Event Model

## 3.1 The complete model

The kernel has **five events**. Two axes, and no more.

| # | Event | Axis | Emitted by | Caused by |
|---|---|---|---|---|
| **E1** | `attention.moved(target, scope, id)` | attention | **K1** | the operator — the kernel's only external cause |
| **E2** | `preparation.terminal(key, operational \| empty \| error, snapshot)` | attention | **K2** | truth arriving, or the deadline concluding |
| **E3** | `focus.committed(scope, target)` | attention | **K3** | E2 — *focus catches up to attention* |
| **E4** | `focus.settled(scope)` | attention | **K3** | settlement resolving |
| **E5** | `focus.recovered(reason)` | attention | **K3** | a runtime that cannot terminate |

And, on the other axis, **outside the kernel**:

| # | Event | Axis | Emitted by |
|---|---|---|---|
| **X1** | `truth.moved(record)` | truth | **Records** (Art 4.8) — the world, or the operator's own act |

## 3.2 Are more events required?

**No.** Each candidate was tested and rejected:

| Candidate | Verdict |
|---|---|
| `acknowledged` | **Not an event — an obligation.** K1 discharges it unconditionally; K4 marks it. Making it an event would invite something to *wait* for it, and nothing may ever wait for an acknowledgment. |
| `navigation.*` | **Not an event.** Navigation is an output of E3 (Art 2.4). |
| `ready` / `readiness.changed` | **Not an event.** Readiness is E2's outcome. A readiness event is the disease the Constitution names. |
| `mutation.*` | **Not an event.** Mutation is X1 with the operator as source (Art 4.8). It required no event at ratification and requires none here. |
| `settlement.started` | **Not an event.** It is the consequence of E3; nothing may observe it, because nothing may depend on it. |
| `timeout` | **Prohibited.** The deadline produces E2 with outcome `error`. There is no timeout event, and there must never be one — an event named `timeout` is an invitation to branch on it. |

## 3.3 The two axes never cross

```
   ATTENTION AXIS      E1 ──► E2 ──► E3 ──► E4        (moves the operator; may commit)
                                      │
                                      ▼
   ─────────────────────────  the committed world  ─────────────────────────
                                      ▲
                                      │
   TRUTH AXIS          X1 ────────────┘                (moves beneath the operator; NEVER commits)
```

> **X1 may never produce E3.** Truth moving can change what a surface *contains*; it can never change
> *where the operator is*, and can never revoke a commit (Art 4.8).
>
> **E1 is the only event the operator causes. X1 is the only event the world causes.**
> Two axes, orthogonal — which is precisely why the truth axis is not a second attention mechanism and
> does not violate the Anti-Fork Rule (Art 2.3).

---

# 4 — Canonical Runtime Ownership

```
                         ┌──────────────────────────────────────┐
                         │            THE OPERATOR              │
                         └───────────────────┬──────────────────┘
                                             │ gesture
                                             ▼
   ╔═══════════════════════════════ RUNTIME KERNEL ═══════════════════════════════╗
   ║                                                                              ║
   ║   ┌──────────────┐   E1: attention.moved   ┌──────────────────────────┐      ║
   ║   │ K1 ATTENTION │──────────────┬─────────►│    K2 PROVISIONING       │      ║
   ║   │              │              │          │                          │      ║
   ║   │ where they   │              │          │ what truth is required   │      ║
   ║   │ WANT to be   │              │          │ + is it here yet         │      ║
   ║   │ · acknowledge│              │          │ · one answer · keyed     │      ║
   ║   │ · scope      │              │          │ · superseded · terminal  │      ║
   ║   │ · supersede  │              │          │ · THE DEADLINE (→error)  │      ║
   ║   └──────┬───────┘              │          │ · settlement (post-commit)│     ║
   ║          │ read (never written) │          └────────────┬─────────────┘      ║
   ║          ▼                      │          E2: preparation.terminal          ║
   ║   ┌──────────────────────────────────────┐              │                    ║
   ║   │            K3 FOCUS                  │◄─────────────┘                    ║
   ║   │  where they ARE, and what they SEE   │                                   ║
   ║   │  · hold outgoing (valid truth)       │  E3: focus.committed              ║
   ║   │  · COMMIT (atomic, on E2 only)       │  E4: focus.settled                ║
   ║   │  · retain  · project URL             │  E5: focus.recovered              ║
   ║   │  · reload floor                      │                                   ║
   ║   └──────────────────┬───────────────────┘                                   ║
   ║                      │ the committed world          ┌──────────────────────┐ ║
   ║                      │                              │ K4 INSTRUMENTATION   │ ║
   ║                      │        (observes all) ◄──────│ silent · observes    │ ║
   ║                      │                              │ never participates   │ ║
   ╚══════════════════════╪══════════════════════════════╧══════════════════════╧═╝
                          ▼
        ┌─────────────────────────────┐        ┌──────────────────────────────┐
        │        PRESENTATION         │        │           RECORDS            │
        │  renders the committed world│◄───X1──│  truth · reconciliation      │
        │  never fetches · never      │        │  · optimistic mutation       │
        │  decides readiness          │        │  (X1 never reaches K3)       │
        └─────────────────────────────┘        └──────────────────────────────┘

        ┌─────────────────────────────┐        ┌──────────────────────────────┐
        │      BUSINESS PROCESSES     │        │           PRODUCT            │
        │  what work exists · stages  │        │  DECLARES THE FOUR CONTRACTS │
        │  · actions · current work   │        │  (what "Operational" means)  │
        └─────────────────────────────┘        └──────────────────────────────┘
```

## 4.1 The ownership register

| Responsibility | Owner |
|---|---|
| Acknowledgment | **K1** |
| Attention / scope / supersession | **K1** |
| Hydrating attention from a cold URL | **K1** |
| Preparation, keying, sharing, cancellation | **K2** |
| Terminal outcome (= readiness) | **K2** |
| The deadline (produces `error` only) | **K2** |
| Settlement | **K2** |
| Holding the outgoing world | **K3** |
| Commit timing | **K3** |
| Retention | **K3** |
| URL / history projection | **K3** |
| Reload floor | **K3** |
| Operator signals | **K4** |
| — | — |
| Appearance, motion, geometry, regions | **Presentation** *(outside)* |
| Truth, reconciliation, optimistic mutation, subject identity | **Records** *(outside)* |
| What work exists, stages, actions | **Business Processes** *(outside)* |
| **The four contracts** | **Product** *(outside)* |
| Composing a Preparation Contract in one answer | **Entry Resources** *(outside, server)* |
| Framework, transport, build, harness | **Engineering infrastructure** *(outside, subordinate)* |

**No responsibility appears twice. Nothing is unowned.**

---

# 5 — The Runtime Lifecycle

*From operator attention to settled truth. Runtime, not implementation.*

```
  ①  The operator wants something                                    [K1]
     attention.moved(target, scope, id)  ── E1
     ├─ acknowledged in < 50 ms, unconditionally         → the promise is made
     └─ everything finer-scope inside the old context is superseded  (Law of Scope Supersession)

  ②  The gap opens                                                   [K1 ≠ K3]
     attention is at the destination; focus is not.
     THIS GAP IS THE TRANSITION. It has no other definition.

  ③  Truth is obtained, invisibly                                    [K2]
     prepare(scope, target) — one answer, bounded by the Preparation Contract, keyed and shared
     ├─ superseded by a newer E1 → cancelled; it can never win
     └─ the deadline stands by, able to produce `error` and nothing else

  ④  Valid truth is held                                             [K3]
     the outgoing world stays — mounted, visible, non-interactive.
     time may change what the operator is TOLD.
     time may not change what the operator is SHOWN.

  ⑤  Preparation terminates                                          [K2]
     preparation.terminal(operational | empty | error | contextual)  ── E2
     all four are workable places. there is no non-outcome.
     contextual = the operator named a RECORD. no cohort was selected, so no pill is lit.

  ⑥  The gap closes                                                  [K3]
     focus.committed  ── E3        ← OPERATIONAL COMMIT: focus catches up to attention
     ├─ atomic: the outgoing is released; the incoming becomes current
     ├─ promotion is a change of role, never a rebuild
     ├─ the URL is projected (it follows; it never led)
     └─ the operator can continue working. they never learned any of this happened.

  ⑦  Everything else catches up                                      [K2 → K3]
     settlement fulfils the Settlement Contract, quietly, into reserved space
     focus.settled  ── E4

  ⑧  Meanwhile, on the other axis, at any time                       [Records]
     truth.moved  ── X1  → reconciles into the committed world
     never commits · never moves attention · never revokes ⑥
```

**Recovery** is not a step. `error` is an outcome of ⑤, committed at ⑥ like any other. The reload floor
(E5) exists only for a runtime that cannot reach ⑤ at all.

---

# 6 — Runtime Boundaries

## 6.1 Inside the kernel

Only: **attention, truth acquisition, the visible world, and measurement of the four.** Nothing else
is kernel. The test: *if removing it would make the Constitution unenforceable, it is kernel.*

## 6.2 Outside the kernel

| Neighbour | Owns | May never |
|---|---|---|
| **Presentation** | Appearance: regions, geometry, motion, the rendering of the committed world. Queue, Focus Panel, cards, headers, rails **as visual regions**. | fetch its own Preparation Contract · decide readiness · gate a commit · own loading |
| **Records** | Truth: server-authoritative state, the change stream, reconciliation, optimistic mutation, subject identity. | commit a surface · move attention · reach *into* the kernel |
| **Business Processes** | Domain: what work exists, stages, actions, attention rules, Current Work. | own runtime behaviour · declare readiness · fetch on the operator's path |
| **Product** | **The four contracts** — including what "the operator can continue working" *means* for each surface. | be overruled by engineering convenience |
| **Entry Resources** (server) | Composing a Preparation Contract into one answer. | exceed the contract (*nothing more*) |
| **Engineering infrastructure** | Framework, routing, transport, build, tests, harness. | appear on the operator's critical path · define runtime behaviour |

## 6.3 The boundary that matters most

> **Product owns the Operational Contract. Engineering owns everything beneath it.**

"The operator can continue working" is a **product judgement**, not an engineering one. Engineering
cannot decide it, cannot negotiate it, and cannot quietly widen it to make a build easier. This single
boundary is what keeps the kernel honest: engineering owns *how fast*, product owns *what counts*.

---

# 7 — Runtime Mapping

*Only now does today's implementation appear. Each existing subsystem is judged against the kernel
above, which was derived without it.*

| Existing subsystem | Verdict | Why |
|---|---|---|
| **Surface Host** | **KEEP → becomes K3 Focus** | It is already the right idea: current/outgoing/incoming with stable slots. It **absorbs** retention and URL projection (both had no independent state), and **sheds** its DOM polling and its clock — the two things that made it obey something other than truth. Its anatomy was right; its nervous system was not. |
| **Presentation Runtime** | **MOVE — outside the kernel** | It renders. That is a neighbour's job, and a complete one. Inside the kernel it would be free to fetch and to judge its own readiness — which is exactly what happened. |
| **Focus Panel Runtime** | **MERGE → K1+K2+K3 at subject scope** | It is today's *best* implementation of the kernel: seed-first identity (acknowledge), hold-prior payload (hold), latest-wins (supersede). It is not a separate runtime — **it is the kernel, working, at one scope**. Generalising it *is* the Anti-Fork Rule. The Focus Panel as a visual region stays in Presentation. |
| **VM Runtime** | **SPLIT → Records + K2** | Composing a record's truth is **Records**; delivering it is **K2 Provisioning** (settlement phase). As an independent runtime it is deleted: it was a fetching pipeline that had grown the right to decide timing. |
| **Queue Runtime** | **SPLIT → K2 + Presentation** | Rows are truth (K2, via an Entry Resource); the queue is a region (Presentation). It is not a runtime; it never was. |
| **Current Work Runtime** | **MOVE → Business Processes** | It is a domain projection of an open subject. It has no runtime responsibility. |
| **Business Process Runtime** | **MOVE — outside** | Domain. The kernel must not know what a stage is. |
| **Navigation Runtime** | **DELETE — the concept dissolves** | Navigation is an *output* of K3 (Art 2.4). A runtime for it is a category error, and building one would rebuild the defect: navigation deciding when preparation may begin. |
| **Cache systems** (module caches, session caches, dedupe, TTLs) | **MERGE → K2 freshness + K3 retention; DELETE the rest** | The kernel has exactly two memories: *is this prepared answer still good* (K2) and *what did the operator have* (K3). Every other cache existed to hide a reconstruction that will no longer occur. |
| **Preparation / warming systems** | **MERGE → K2** | Warming *is* preparation begun at intent. Treating it as separate is what allowed it to be fire-and-forget while the route blocked. |
| **Readiness systems** (conjunctions, `data-surface-ready`, rAF polling) | **DELETE** | Readiness is E2. There is nothing here to keep — this is the disease, not a subsystem. |
| **Instrumentation** | **KEEP → REPLACE its basis (K4)** | The apparatus survives; its subject changes from the machine to the operator. Its first obligation is to prove it can fail a runtime that today it passes. |
| **The 2.5 s settle timer** | **DELETE** | Its legitimate function — concluding a stall — moves to K2's deadline, whose only product is `error`. Its illegitimate function — revealing — was never lawful (Art OC.4 Law 3). |
| **Entry Resources** | **KEEP as a neighbour** | Server-side, below the seam. K2's supplier, not part of K2. |
| **Reload floor** | **KEEP → K3** | Unchanged in purpose; narrowed in trigger. It answers an inconsistent runtime, never a slow one. |

## 7.1 What this mapping reveals

- **Nothing in the kernel is new.** Every kernel system already exists in today's runtime — but
  distributed across many owners, so no single one could be held to a law.
- **The largest change is subtraction.** Readiness systems, the timer, navigation-as-runtime, and most
  caches do not move — **they cease to have a reason to exist**.
- **The best-behaved code we have is the Focus Panel**, and the kernel's central claim is that it was
  never special: it was the kernel, at one scope, working correctly. Everything else is that same
  thing, done at other scopes, badly.

---

# 8 — Implementation Implications

*Architectural movement only. No code, no tasks, no waves.*

1. **The runtime stops being a place and becomes four systems.** Today "the runtime" is a region of
   the codebase. In the kernel it is four owners with four questions. Most existing runtime code is
   not kernel code at all — it is Presentation or Records that acquired timing authority.
2. **Authority moves inward; work moves outward.** The kernel gains *authority* (commit, terminal
   outcome, acknowledgment) and sheds *work* (rendering, composing, fetching-by-component). The kernel
   should end up **small** — if it is large, responsibilities have leaked back in.
3. **Ownership consolidates, then code deletes.** Each system's arrival makes several existing modules
   redundant rather than refactorable. The dominant movement is deletion, not migration.
4. **The seam hardens.** Dependent resolution moves below it (Entry Resources); the client stops
   orchestrating and starts asking.
5. **Spec §2.1 is superseded by this document.** The Specification named **eight** subsystems; the
   kernel derives **four** plus neighbours — Retention and URL Projection collapse into K3 (no owned
   state), Settlement collapses into K2 (same activity, different phase), and Entry Resources are
   reclassified as a neighbour. **Fewer systems is not a constitutional change**: the Constitution
   names no subsystem count, and Spec §2.1 forbids a *ninth*, not a smaller kernel. The Specification's
   §2.1, §2.6, and §3 register should be re-expressed against K1–K4 at its next revision.
6. **The kernel is implementation-independent by construction.** No system above names a framework, a
   transport, a language, or a component model. A future Alloy may replace all of them without
   touching K1–K4 — which is the test of whether this is a kernel at all.

---

# 9 — Final Review

> **If Alloy were built again from scratch five years from now, could Engineering build the Runtime
> entirely from the Runtime Constitution, the Engineering Specification, and this Runtime Kernel?**

**Yes — and the honest reasoning, including what they would still have to be given:**

| They would need | It exists | Where |
|---|---|---|
| Why the runtime exists at all | ✓ | Constitution, Layers 1–2 |
| What "done" means for a surface | ✓ | Constitution Art OC + the four contracts — **declared by Product**, per surface |
| Which systems to build | ✓ | Kernel §1–§2 — four, with purpose, state, contracts, failure, recovery |
| What may happen | ✓ | Kernel §3 — five events, plus one outside; and the reasoning for every event *not* admitted |
| Who owns what | ✓ | Kernel §4 — nothing twice, nothing unowned |
| What the runtime does, in order | ✓ | Kernel §5 |
| What is *not* theirs | ✓ | Kernel §6 |
| How to know they succeeded | ✓ | Constitution Art 4.7 + Spec §7 + each system's certification duty |
| How to decide a dispute | ✓ | Spec §3.0 register + Constitution Art 5.2's ten tests |
| **The four contracts for each surface** | **✗ — and correctly so** | These are **product decisions** (D-1). No architecture document may pre-empt them. A future team must obtain them, not read them. |

**The one thing they cannot get from these documents is the one thing they should not:** what
"the operator can continue working" means for a given surface. That is Product's, permanently. The
kernel's completeness is that it makes the *absence* explicit and blocks implementation until it is
supplied.

**Assessment: the kernel is complete.** A future team could build the runtime from these three
documents and their own framework choices, without inventing a runtime concept — which was the test.

## 9.1 The kernel's own failure condition

This kernel is wrong if any of these ever becomes true:

- A fifth system is needed to express the Constitution.
- A sixth event is needed on the attention axis.
- Two systems both decide what the operator sees.
- A surface must be given runtime in order to exist.
- The truth axis needs to commit.

**None is true today.** If one becomes true, this document is amended — and, if the cause is
constitutional rather than architectural, the Constitution is amended first (Art 5.3).
