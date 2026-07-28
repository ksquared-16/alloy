# Vacilando Product Architecture

*The canonical entry point to the Vacilando product architecture. Read this first.*

This is a navigation document, not a doctrine. It organizes, points to, and freezes the foundation; it introduces no new concepts, renames nothing, and extends nothing. Every model it references is authoritative in its own document. Where this index and a source document appear to differ, the source document wins.

The foundation is **complete**. Ten documents define it. This page tells a new contributor what exists, why, how it fits, and where the lines are.

---

## 1. Product Vision

**Vacilando is an Engineering Operating System.** It has two jobs, for one person — the operator (the author of the work):

- **Prepare engineering work well** — through **Director**, which acts as *counsel*: it improves the quality of the operator's engineering thinking before execution begins.
- **Operate engineering execution effortlessly** — through the **Engineering Operations Center**, which lets the operator manage *work* while providers, processes, ports, and branches disappear beneath it.

**The problem it solves.** Today the operator spends their day being the system: writing large prompts to convey context, manually reconstructing what's running and what's done, deciding when a conversation is exhausted, and restoring state by hand. They act as both the engineering-thinking scaffolding *and* the operating system. Vacilando takes both jobs.

**What is fundamentally different.** Every other AI tool optimizes to be *used more* — to answer, please, and become indispensable. Vacilando is built on the opposite instinct. Director is **counsel** that improves the operator's thinking and aims at their *independence*, not their dependence — it earns attention, stays mostly silent, disagrees when it must, and never owns the decision. The Operations Center makes execution's machinery *invisible*. And the durable value — understanding, relationship, history — belongs to **Director**, not to any provider, so it survives every conversation, model, and tool underneath it. The operator stops being the operating system and gets their day back for engineering.

---

## 2. Architectural Pillars

The architecture stands on three pillars. Two are the product; the third keeps the first two honest.

### Pillar I — Engineering Leadership (Director)

- **Purpose:** improve the quality of the operator's engineering thinking before execution — counsel, not answers.
- **Responsibilities:** who Director is and its law; how the relationship feels and matures; how Director perceives and decides; what it builds with the operator; how an episode of thought unfolds; the acts through which it counsels; and how all of that persists across conversations.
- **Contained documents:** [Engineering Leadership Doctrine](DIRECTOR-V2-LEADERSHIP-DOCTRINE.md), [Constitution of Engineering Leadership](CONSTITUTION-OF-ENGINEERING-LEADERSHIP.md), [Engineering Partnership Model](ENGINEERING-PARTNERSHIP-MODEL.md), [Leadership Intelligence Model](LEADERSHIP-INTELLIGENCE-MODEL.md), [Shared Understanding Model](SHARED-UNDERSTANDING-MODEL.md), [Engineering Session Model](ENGINEERING-SESSION-MODEL.md), [Leadership Moves Catalogue](LEADERSHIP-MOVES-CATALOGUE.md), [Persistent Engineering Continuity](PERSISTENT-ENGINEERING-CONTINUITY.md).
- **Boundary:** Director owns *thinking and counsel*. It never manages execution machinery, and it never owns a decision — the operator does. It is quiet and restrained by default.

### Pillar II — Engineering Operations (the Operations Center)

- **Purpose:** let the operator manage engineering *work* without ever managing provider sessions, slots, branches, ports, or servers.
- **Responsibilities:** the operational state of work; operational vs. execution health; capacity and admission; the operator's attention and when to interrupt; the provider-as-interchangeable-engine abstraction; and the operational intelligence that keeps the system honest.
- **Contained documents:** [Engineering Operations Center](ENGINEERING-OPERATIONS-CENTER.md).
- **Boundary:** Operations owns *execution visibility and control*. It never counsels on the engineering, and it never adjudicates the thinking — it runs, tracks, and reclaims. It is omniscient and informative by default (the opposite posture to Director), yet minimally demanding.

### Pillar III — Product Validation

- **Purpose:** prove the doctrine produces materially better behavior in the real situations Vacilando already contains — and say *no* where it doesn't.
- **Responsibilities:** audit the real Director conversations against every model; find the gaps between doctrine and behavior; name the smallest transformative slice; and gate implementation readiness on evidence.
- **Contained documents:** [Director Product Validation](DIRECTOR-PRODUCT-VALIDATION.md).
- **Boundary:** Validation judges behavior against doctrine; it does not create doctrine. It is the empirical check, not a design.

**Why validation is intentionally separate from doctrine.** Doctrine defines what *ought* to be true; validation tests whether the product *is*. Mixing them corrupts both — doctrine that quietly bends to fit current behavior stops being a standard, and validation that reasons from ideals instead of evidence stops being a check. Keeping them apart lets the doctrine stay principled and immutable while the validation stays honest and evidence-bound. The doctrine is the constitution; the validation is the audit. A constitution that rewrites itself to excuse the government's conduct is no constitution.

---

## 3. Relationship Diagram

Conceptual dependencies only — how the models build on one another. Not implementation.

```
                              ENGINEERING LEADERSHIP DOCTRINE   ── who Director is (mission & purpose)
                                          │
                              CONSTITUTION OF ENGINEERING LEADERSHIP   ── the immutable law
                                          │
                              ENGINEERING PARTNERSHIP MODEL   ── how the relationship feels & matures
                                          │
                              LEADERSHIP INTELLIGENCE MODEL   ── how Director thinks (perceive → Read → gate)
                                          │
                              SHARED UNDERSTANDING MODEL   ── what Director & the operator build (durable)
                                          │
                              ENGINEERING SESSION MODEL   ── how one episode of thought unfolds
                                          │
                              LEADERSHIP MOVES CATALOGUE   ── the acts through which counsel is expressed
                                          │
                                     ▼  D I R E C T O R  ▼   (the above, embodied)

        ┌───────────────────────────────────────────────────────────────────────────┐
        │  PERSISTENT ENGINEERING CONTINUITY  — spans ALL thinking; makes the         │
        │  understanding & relationship durable while conversations stay disposable.  │
        └───────────────────────────────────────────────────────────────────────────┘

        ┌───────────────────────────────────────────────────────────────────────────┐
        │  ENGINEERING OPERATIONS CENTER  — spans ALL execution; makes work visible   │
        │  while providers/engines stay disposable.  (Seam: a ready mission enters    │
        │  execution here; execution discoveries flow back to Director.)              │
        └───────────────────────────────────────────────────────────────────────────┘

        ┌───────────────────────────────────────────────────────────────────────────┐
        │  DIRECTOR PRODUCT VALIDATION  — grounds the entire system in the real        │
        │  conversations; the empirical floor beneath all of the above.               │
        └───────────────────────────────────────────────────────────────────────────┘
```

Read it as: the seven leadership models stack into **Director**; **Continuity** and **Operations** are the two spanning planes that make *thinking* and *execution* durable above disposable transport; **Validation** sits under everything as the evidence check. The recurring shape across the whole architecture: **value is durable and belongs to Director; the transport that carries it — conversations, providers, engines — is disposable.**

---

## 4. Responsibility Matrix

One row per document. This section exists to **eliminate overlap** — each responsibility is owned exactly once.

| Document | Purpose | Primary responsibility | Inputs | Outputs | Answers | Does **not** answer |
|---|---|---|---|---|---|---|
| **[Leadership Doctrine](DIRECTOR-V2-LEADERSHIP-DOCTRINE.md)** | Establish what Director fundamentally is | Director's identity & purpose | The product problem | The framing: counsel over answers; independence over dependence | *What is Director for?* | How it thinks/acts (later docs) |
| **[Constitution](CONSTITUTION-OF-ENGINEERING-LEADERSHIP.md)** | The immutable law | Non-negotiable articles + supremacy test | The Doctrine | 13 articles every capability must obey | *What may Director never do?* | How to behave in a given case |
| **[Partnership Model](ENGINEERING-PARTNERSHIP-MODEL.md)** | Define the relationship over time | The felt relationship & its maturation | Constitution | Trust as medium; earned candor; the arc | *What does it feel like, and how does it change?* | The mechanics of a single intervention |
| **[Leadership Intelligence](LEADERSHIP-INTELLIGENCE-MODEL.md)** | Define how Director thinks | Perception → Read → intervention gate | The work, thinking, operator | Reads, and the decision to speak or stay silent | *How does Director decide to intervene?* | Which specific act to use (Moves) |
| **[Shared Understanding](SHARED-UNDERSTANDING-MODEL.md)** | Define what is built | The durable reliance surface | Intent, claims, decisions, discoveries | Claims at epistemic status × authorship; the frontier | *What has become safe to rely on?* | How it persists across conversations (Continuity) |
| **[Engineering Session](ENGINEERING-SESSION-MODEL.md)** | Define one episode of thought | The session unit & its movement | A live question, an operator mode | A progression to an honest stopping point | *How does one episode unfold?* | The catalogue of acts (Moves) |
| **[Leadership Moves](LEADERSHIP-MOVES-CATALOGUE.md)** | Define the repertoire | The ten counsel acts | An available-move set (from the Read) | An expressed intervention (or silence) | *Through what acts is counsel expressed?* | Whether to intervene at all (Intelligence) |
| **[Persistent Continuity](PERSISTENT-ENGINEERING-CONTINUITY.md)** | Make thinking durable | Persistence of understanding & relationship independent of conversations | Shared Understanding, sessions, relationship | A continuous thread across disposable conversations | *How does work persist when a conversation ends?* | *What* the understanding contains (Shared Understanding) |
| **[Operations Center](ENGINEERING-OPERATIONS-CENTER.md)** | Make execution operable | Operational state, health, capacity, attention | Ready missions; running work; real resources | Honest state, headroom, reclamation; interrupts only for needs-you/at-risk | *What's running, done, blocked, at risk — and can I start more?* | Any counsel on the engineering itself |
| **[Product Validation](DIRECTOR-PRODUCT-VALIDATION.md)** | Prove doctrine → behavior | The empirical audit | The real conversations + all models | Defects, the smallest transformative slice, a readiness verdict | *Does the model actually improve real behavior?* | What the doctrine *should* be (it tests, not designs) |

---

## 5. Product Realization Boundary

**Architecture is complete.** The ten documents define the product foundation. From here, work crosses from *architecture* into *product realization* — building behavior that embodies the doctrine.

Three rules govern that boundary:

1. **Future work should generally improve behavior, not redefine philosophy.** The models are the standard; realization brings behavior up to them, beginning with the gaps the Validation identified.
2. **Architecture changes must require evidence from implementation.** A model is revised only when real behavior demonstrates the model is wrong — never to make building easier. The Validation is the pattern: change the foundation only on evidence, and say *no* to premature change.
3. **The Constitution is supreme.** Any realization decision that conflicts with a constitutional article is wrong, however capable or requested. Realization serves the doctrine; it does not amend it.

The Validation already draws the first line across this boundary: the doctrine is sound, the ten-move repertoire is sufficient, and the smallest transformative slice is unambiguous and fully signalled by data that already exists. That slice is the start of realization.

**Operational record of a realization initiative.** Each long-running initiative maintains one [Sprint Runtime](SPRINT-RUNTIME.md) — the canonical specification for the durable operational record an initiative is tracked, resumed, and handed off through. It is a realization artifact, not a pillar: it *references* the foundation systems (Shared Understanding, Mission History, Operational Learning, Engineering Sessions, Persistent Continuity) rather than duplicating them, and adds no architecture.

**Global Mission Rules.** Standing rules that govern *how every mission operates and ends*, independent of capability: the [Worker Operating Policy](WORKER-OPERATING-POLICY.md) (a worker owns forward progress; "still running" is never a valid turn-end) and [Deployment Certification](DEPLOYMENT-CERTIFICATION.md) (application, schema, migrations, and migration history are one deployable unit; completion, certification, merge, and staging promotion are blocked until deployment verification succeeds across every layer). Both are realization rules, not pillars.

---

## 6. Initial Product Realization Roadmap

Only the agreed Foundation slice — the behaviors the Validation proved would make Director stop feeling like a narrator, each using signals the product already computes.

**Phase 1 — Foundation (agreed):**
- **Confidence-qualified readiness** — Director's readiness must speak differently at low confidence than at high; the flat, identical "Ready" is retired. *(Fixes six of seven audited conversations.)*
- **Attempt-history counsel** — Director opens work with a truthful reading of prior attempts and, where warranted, continue-vs-restart counsel. *(The nine-attempts-reported-as-one failure.)*
- **Frontier surfacing** — Director speaks the load-bearing unknowns and suggested criteria it already computes, instead of hiding them behind a verdict.

**Future phases — themes only (not planned):**
- *Differentiation* — sufficiency counsel (thin vs. thorough, stake-calibrated); scope & sequencing counsel.
- *Maturity* — relational calibration over time; execution-discovery reopening.

Per the Validation, Phase 1 is designed and built first; the later themes rest on assumptions only a live Foundation can test, and are not to be planned in advance.

---

## 7. Principles

The enduring commitments already established by the architecture. (Established here only — none are new.)

- **Understanding is durable; conversations are disposable.** *(Persistent Continuity)*
- **Providers are interchangeable transport, for both thinking and execution.** *(Continuity · Operations Center)*
- **The relationship belongs to Director, not to any provider.** *(Continuity · Partnership)*
- **The operator owns every decision; Director owns counsel.** *(Constitution · Leadership Doctrine)*
- **Operations owns execution visibility; Director never manages machinery.** *(Operations Center)*
- **Engineering work outlives execution — execution is a phase, and discoveries flow back.** *(Shared Understanding · Operations Center)*
- **Confidence is proportional to evidence; readiness lives in understanding, not in artifacts.** *(Constitution · Shared Understanding)*
- **Attention is the scarce resource: Director spends it sparingly; Operations conserves it.** *(Leadership Intelligence · Operations Center)*
- **Director aims at the operator's independence, not their dependence.** *(Leadership Doctrine · Constitution)*
- **The system owns operational truth; the operator never reconciles state.** *(Operations Center)*
- **Doctrine is the standard; behavior is measured against it, and changed only on evidence.** *(Product Validation · this boundary)*

---

*This is the first page every future contributor reads before touching the product. The foundation is frozen. Build to it.*
