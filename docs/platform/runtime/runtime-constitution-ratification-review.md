---
owner: runtime
status: proposed
last_reviewed: 2026-07-16
supersedes: []
---

# Runtime Constitution — Ratification Review

**Reviewed document:** [The Alloy Operating System — Constitution](./runtime-realization-architecture.md)
**Role:** Chief Reviewer. **Posture:** adversarial. The document was attacked, not defended.
**Assumption:** this Constitution governs Alloy Runtime for the next decade.

**Verdict:** **AMEND, THEN FREEZE.** Two required amendments (§B). Both are additive, both close
governance holes, and **both strengthen the laws they touch — neither weakens a principle.** Everything
else survived attack and should be frozen as written.

---

# A — Constitutional Findings

## A.0 What survived attack (stated first, so the failures are legible)

The following were attacked and **held**; they should be frozen unchanged:

| Attacked | Attack | Outcome |
|---|---|---|
| **The four contracts** (Art 3.2) | Analytics: a report can take minutes; does Law 1 force the runtime to hold the prior surface for minutes? | **Held — and correctly forced the right answer.** An Analytics surface's Operational Contract is the question + controls; results are Settlement, in reserved space. The model produced the correct design without amendment. |
| **Preparation's one round-trip** (Art 4.3 §2) | Offline: zero round-trips available | **Held.** "One" is a ceiling, not a floor. Preparation resolves from local truth to `operational`, or terminally to `empty`/`error`. |
| **Attention as a layer** (Layer 2) | Is it decoration? Delete it — what is lost? | **Held.** It produces the single event and the Anti-Fork Rule, which are load-bearing. Without it, record-switch and surface-move remain two mechanisms with no law forbidding it. |
| **Operational Commit** (Art OC.1–OC.5) | Four of the five conditions are unmeasurable | **Held.** OC.3's keyboard test collapses them to one decidable question, and the declared contract is what instrumentation measures. Conditions 2–5 govern the *declaration*, not the measurement. |
| **Product's power to reject** (Art 1.2 + 5.2) | Can Product reject an implementation with only this document? | **Held.** Art 1.2 (never-experiences) + Art 5.2 (ten tests) + OC.3 are sufficient to reject without engineering input. |
| **Extensibility** | Mobile · AI-by-command · new domains · unknown surfaces | **Held.** Surfaces, attention, contracts, commit all apply unchanged. |

## A.1 FINDING 1 (fatal to governance) — A stalled preparation has no constitutional resolution

**Class:** Internal inconsistency + testability + engineering clarity.

**The proof:**

1. Art OC.4 Law 3 states, absolutely: *"There exists no permitted edge from 'time passed' to 'show the
   operator something.'"*
2. Art 4.5 enumerates situations: preparation *slow* · *fails* · *genuinely empty* · *superseded* ·
   *truth changes mid-movement* · *runtime inconsistent*.
3. **A stall is none of them.** A preparation that never resolves and never errors matches only "slow"
   → *"Keep holding valid truth."* Forever.
4. "Runtime inconsistent → reload floor" does not apply: a stall is not an inconsistency, and the
   Constitution offers no way to *detect* one without a deadline.
5. Therefore: **a stalled preparation is constitutionally required to hold the operator's outgoing
   surface forever**, escalating a message that will never resolve. Law 3 forbids the deadline that
   would end it.

**The evidence that this ambiguity bites — and it is damning:**

The **Engineering Specification**, the first document written under this Constitution, by the same
author, within the same week, states in its §2.2 state machine:

```
t ≥ Tmax  RELOAD FLOOR — recovery, never a partial reveal     (Art 4.5)
```

That is a **time → what-the-operator-is-shown edge**, and it cites Art 4.5 as authority. **Art 4.5
grants no such authority** — it authorizes the reload floor for an *inconsistent runtime*, not for
elapsed time. The Constitution was violated at exactly the point of ambiguity, by its own author, in
its first derived document. **If it cannot survive its author for one week, it will not survive an
engineering organization for a decade.**

**Two teams, two runtimes** (criterion 6 failure):
- *Team A (literal):* no deadline may ever change what is shown → infinite hold on a stall.
- *Team B (purposive):* the deadline causes a terminal `error`; commit is caused by the outcome, not
  the clock → legal.

Both readings are defensible from the text. That is disqualifying for a governing document.

**Why this is not a nitpick:** Law 3 was written in reaction to a specific, certified harm (a 2.5 s
clock revealing a 6.6 s skeleton). The reaction over-rotated: it forbade *time* rather than forbidding
*time substituting for truth*. The two are not the same, and the difference is the entire failure
model.

## A.2 FINDING 2 (fatal to completeness) — The runtime has exactly one event, but the world also moves

**Class:** Completeness + internal inconsistency + extensibility.

**The proof:**

1. Layer 2 preamble: *"Everything the runtime does is a response to this and nothing else."*
   Art 2.3: *"The runtime has exactly one event: attention moved."* Art 2.5: *"That is its whole
   purpose. It has no other."*
2. But truth changes while attention is **stationary**: a message arrives; another operator edits the
   record on screen; a workflow completes; a webhook resolves a payment; BOS acts autonomously.
3. In each case **the runtime must act, and no attention has moved.** By Art 2.3 and 2.5, the runtime
   has no event for this and no purpose that admits it.

**The internal contradiction is sharper still — "Settlement" carries two different scopes:**

- **Art 3.2.4 (the Settlement *Contract*)** is worded broadly: *"Everything that may continue after
  Operational Commit without interrupting work."* An inbound message satisfies this exactly.
- **Art 4.4 (the Settlement *Runtime*)** is scoped narrowly to resolving a *preparation's* remainder:
  law 6 — *"A settlement response for a superseded destination or subject is discarded by key."*
  **A server push is not a response.** It answers no request and belongs to no preparation.

The same word governs two different things in two articles. An engineer reading 3.2.4 concludes
inbound truth is Settlement; an engineer reading 4.4 concludes it is not. Both are reading the
Constitution correctly.

**Which surfaces this breaks (criterion 1 — "does every surface inherit naturally?"):**

| Surface | Inherits? |
|---|---|
| Workspace · Work Unit · Processing · Settings · Analytics | **Yes** |
| **Communications** | **No.** Its defining behavior — a conversation arriving — has no constitutional home. |
| **Collaborative work** (criterion 5, explicitly named) | **No.** Another operator's edit is not attention moving. |

**The consequence is precisely the failure this Constitution exists to prevent.** An engineer building
Communications finds no owner for inbound truth and must invent one. Whatever they invent is either a
second mechanism (violating the Anti-Fork Rule, Art 2.3) or a surface owning its own live data
(violating Art 3.3). **The Constitution's silence forces a violation of the Constitution.**

**Aggravating fact:** existing, already-ratified platform doctrine
(`foundation/os-runtime-map.md`) *already contains this concept* — Record's contract explicitly
includes *"server-authoritative reconciliation: it subscribes to Entity's change stream so another
operator's edit (or a server push) reconciles in."* **This Constitution dropped a concept the platform
had already ratified.** That is a regression in governance, not merely an omission.

## A.3 FINDING 3 (fatal to sufficiency) — Operator mutation is a gesture with no runtime event

**Class:** Sufficiency + internal inconsistency.

**The proof:**

1. Art 1.1 §1 promises, unconditionally: *"The application answers instantly. **Every gesture** is met
   before the operator can wonder whether it landed."*
2. A save, a completion, an outcome recorded, a status changed — these are gestures.
3. Art 2.3 admits exactly one event: attention moved. **A mutation is not attention moving** — the
   operator stays exactly where they are; the world changes.
4. The runtime state model (Art 4.1) is a *movement* model: Acknowledged → **Transitioning** →
   **Operational** → Settled. A save has no Transitioning and no Operational Commit; it has no lawful
   path through the state machine.
5. Therefore **Layer 1 makes a promise that Layers 2–4 provide no mechanism to keep.**

**Criterion 3 failure, verbatim.** An engineer implementing "Record outcome" must say: *"We need
another runtime concept"* — optimistic mutation, rollback, and confirmation. Nothing in the
Constitution provides it, and nothing forbids them from inventing it badly.

**Why this is material, not academic:** Alloy is an *operational* platform. Completing work is not a
peripheral gesture — it is arguably the operator's primary act. A runtime constitution that governs
how an operator *arrives* at work but is silent on how they *complete* it is incomplete at its centre.

**Note:** Findings 2 and 3 share one root — *the Constitution governs attention movement, while Layer 1
governs the whole operator experience.* The gap between those two scopes is where mutation and inbound
truth fall. One amendment closes both (§B.2).

---

# B — Required Amendments

*Only these two. Both are additive. **Neither weakens a principle; both strengthen the law they
touch.** Stated as requirements, not drafted text — drafting belongs to ratification.*

## B.1 — Amend Art OC.4 Law 3 and Art 4.5: distinguish *revealing* from *concluding*

**What is required:**

1. **Art OC.4 Law 3** must forbid what it meant to forbid: **time may never reveal a destination that
   is not Operational.** It must not forbid time from *establishing a terminal outcome*.
2. **Art 4.5** must gain the missing row: **preparation that does not conclude**. A deadline may
   resolve it to terminal `error`. Commit then occurs — as always — on the terminal outcome (Law 4,
   unchanged), never on the clock.

**Why this does not reopen the timeout:** a deadline may produce **only** `error`. It may never
produce `operational`. The certified harm was a clock producing a *reveal of an unfinished
destination*; that remains absolutely prohibited. What becomes legal is a clock concluding that
preparation has **failed** — and an honest error surface is already, by Law 4, a workable place.

**Ambiguity it prevents:** the two-team divergence in A.1 (infinite hold vs. deadline-to-error), and
the smuggling of unauthorized time edges into derived documents — which has already happened once.

**Where:** Part I (Art OC.4; Art 4.5). It is a law about reveal and failure; it cannot live in Part II.

## B.2 — Add one boundary article: what the Constitution does not govern, and what those things inherit

**What is required:** a single article establishing that the Constitution governs **continuity of
attention**, and that two neighbouring phenomena are **governed elsewhere** — while still inheriting
Layer 1:

| Phenomenon | Governed by | Inherits from Layer 1 (non-negotiable) |
|---|---|---|
| **Operator mutation** (save, complete, execute) | the Record / Operational layers (`os-runtime-map.md`) | acknowledgment < 50 ms; no reconstruction; quiet, legible resolution |
| **External truth change** (inbound message, another operator's edit, workflow/webhook completion, autonomous BOS) | the Record layer's server-authoritative reconciliation (already ratified doctrine) | never interrupts; lands in reserved space; never lowers established truth; never announces |

**The article must also resolve the Art 3.2.4 / Art 4.4 scope collision** — deciding, explicitly,
whether inbound truth is Settlement (widening Art 4.4) or reconciliation (a neighbouring concern
delegated by this article). **Either resolution is acceptable; the ambiguity is not.**

**Why a boundary article and not a new runtime concept:** the concepts already exist in ratified
doctrine. The Constitution's failure is **silence**, not absence. This amendment invents nothing — it
declares a border and an inheritance, which is the minimum that prevents an engineer from inventing a
second mechanism.

**Ambiguity it prevents:** Communications and collaborative work inventing per-surface live-data
mechanisms (Anti-Fork / Art 3.3 violations); mutation inventing an unowned optimistic path.

**Where:** Part I. A scope boundary is constitutional by nature — it defines what the document governs,
and a document that does not state its own limits cannot govern.

**Consequential check:** this does **not** disturb Art 3.2's *"exactly four contracts. No more. No
less."* A boundary article declares what is out of scope; it adds no contract. If ratification instead
chooses to bring external truth *inside* the runtime, then Art 3.2's "four" must be re-examined — which
is precisely why this must be decided at ratification and not discovered during implementation.

---

# C — Optional Improvements

*Explicitly **not** required. The Constitution governs adequately without them. Listed for the
ratification record only; **recommend deferring all three** rather than delaying the freeze.*

| # | Observation | Why optional |
|---|---|---|
| **C-1** | The **Retention Contract** (Art 3.2.3) declares *what survives* but never *what must never survive*. A tenant/principal switch must flush retention or it is a cross-tenant leak. | Expressible today: a surface declares its retention boundary. Existing doctrine already mandates tenant-scoped caches. Constitutionalising tenancy risks importing security policy into a runtime document. |
| **C-2** | **"Visible construction"** is defined by example (Art 1.2), not by an observable. `visible_construction_ms = 0` is therefore measured by proxy. | The Engineering Specification (§7) is the correct home for the observable definition. A constitution should name the harm, not the sensor. |
| **C-3** | Art 4.5's row *"Truth changes mid-movement → snapshot commits; settlement reconciles"* is the only nod to a moving world, and it is confined to a transition. | Subsumed by B.2. If B.2 is ratified, this row becomes consistent. |

---

# D — Freeze Recommendation

## **AMEND, THEN FREEZE.**

**Not "freeze immediately."** Two findings are governance-fatal, and one has already caused a
violation in the first document derived from the Constitution. Freezing now would freeze a document
that (a) requires the runtime to hang forever on a stall, and (b) forces Communications and
collaborative work to violate the Anti-Fork Rule in order to exist. Those are not blemishes; they are
articles that cannot be complied with.

**Not "continue architecture."** The architecture is sound and survived sustained attack. Layers 1–3,
the four contracts, Operational Commit, the ownership model, the Anti-Fork Rule, and the ten tests all
held — including against attacks designed to break them (Analytics, offline, "is Attention
decoration?"). **Both required amendments are additive and close holes; neither reopens a decision.**
Continuing architecture would risk the far more likely failure mode: refining a correct document until
it is a worse one.

## Constitutional stability

Further refinement is now **more likely to weaken than improve** this document. The evidence:

- Every attack except the three above **strengthened** the document's standing rather than exposing a
  gap.
- The one place refinement *did* occur under pressure — Law 3, written in reaction to a certified harm
  — is precisely where the document over-rotated into an unenforceable absolute. **Reactive refinement
  is how this document acquires flaws, and A.1 is the proof.**
- The remaining candidates (§C) are all cases where adding constitutional text would import
  implementation or security policy into a document whose power comes from declining to contain them.

**Therefore:** apply B.1 and B.2 — narrowly, as specified, without reopening anything else — and
**freeze**. After the freeze, the document changes only by amendment (Art 5.3), in the open, on the
record.

## Post-amendment freeze conditions

The Constitution is frozen when, and only when:

1. **B.1** is applied to Art OC.4 Law 3 and Art 4.5 (deadline → `error` only; never → `operational`).
2. **B.2** is applied as one boundary article, and the Art 3.2.4 / Art 4.4 scope collision is
   explicitly resolved.
3. **The Engineering Specification §2.2 is corrected** — its `t ≥ Tmax → RELOAD FLOOR` edge must be
   re-derived from the amended Law 3, or removed. *(A specification defect, surfaced by this review;
   it is not an amendment to the Constitution.)*
4. **D-1 … D-6 are ratified** (Art 7.6). They are already required before implementation
   (Specification §10, gate G-1); the freeze does not depend on them, but implementation does.

Nothing else is required. Nothing else should be changed.
