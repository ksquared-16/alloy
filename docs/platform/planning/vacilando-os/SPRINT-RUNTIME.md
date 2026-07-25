# The Sprint Runtime

*The single, continuously-maintained operational record for one long-running engineering initiative — the artifact a future session resumes from without rereading anything.*

A product realization specification **and** the canonical template. It defines no runtime behavior, introduces no new doctrine, and changes no architecture — it realizes the existing architecture by giving every long-running initiative one standard operational record. It fits alongside the ten foundation documents and **references** them; it recreates none of them. Where this document and a foundation model appear to differ, the foundation model wins.

---

## The one idea

A long engineering initiative accumulates state faster than any conversation can hold it. Today that state lives in the thread — so continuing means rereading it, and every reread is lossy. The Sprint Runtime inverts that:

> **One initiative, one living Sprint Runtime. Director owns it, the operator reads it, workers update it through execution, Operational Learning observes it, and the next session resumes from it. It never re-tells the durable systems — it is the operational index that points to them, so continuing the work never requires rereading the conversation.**

This is the sprint-level echo of [Persistent Engineering Continuity](PERSISTENT-ENGINEERING-CONTINUITY.md): the durable thing is primary, the conversation is disposable. Continuity's law is *Shared Understanding → Engineering Sessions → Provider Conversations*. The Sprint Runtime is the **operational face of that law for a whole initiative** — the one page an engineer reads to know exactly where the work stands and what to do next.

---

## What the Sprint Runtime is — and is not

It is **the operational summary of an initiative**: current, durable, and complete enough to resume from. It is deliberately *not* any of the systems it summarizes, and it must not recreate their truth. Each section **points to** the authoritative source instead of copying it.

| The Sprint Runtime is NOT… | …which is owned by | The Sprint Runtime instead holds |
|---|---|---|
| Shared Understanding | [Shared Understanding Model](SHARED-UNDERSTANDING-MODEL.md) — the live reliance surface | the *frozen decisions* this initiative now relies on, pointing to the reliance surface for the full picture |
| the Mission History runtime | the Product Definition runtime — each capability's durable `mission_history` | a sprint-scoped, append-only *ledger of missions executed in this initiative*, pointing to the durable record for each |
| Operational Learning | [Operational Learning](OPERATIONAL-LEARNING.md) — the loop that observes the product and proposes | the *accumulation point* of observations for this sprint (the input the loop draws from), never the loop itself |
| an Engineering Session | [Engineering Session Model](ENGINEERING-SESSION-MODEL.md) — an attention-bounded episode of thought | nothing about sessions; it records *what the work produced*, not how the thinking unfolded |

The rule that keeps it honest: **reference durable truth; never duplicate it.** A section that begins to re-tell Shared Understanding, re-derive a mission's evidence, or re-run the Operational Learning loop has drifted out of scope. The Sprint Runtime is an index and a ledger, not a second copy of the systems beneath it.

---

## Ownership and lifecycle

One Sprint Runtime exists per long-running initiative. It is created when the initiative begins, maintained continuously while it runs, and frozen (archived, never deleted) when it closes.

- **Director owns it.** Director maintains it as counsel maintains a record — accurately, minimally, and without theatre.
- **The operator reads it.** It is written for the operator (and for the next session, and for another engineer) — plain, current, and resumable.
- **Workers update it through execution.** A mission's real outcome, evidence, and acceptance flow into it when work completes; the ledger grows from execution, not from narration.
- **Operational Learning observes it.** The Operational Observations section is the standing input the learning loop draws from; the Sprint Runtime does not decide what to improve.
- **Future sessions resume from it.** Its sufficiency for resumption is a product requirement, not a courtesy (see *The Resume Rule*).

---

## The Laws

Four laws govern the Sprint Runtime. They are what make it durable rather than a disposable status note.

### 1. The Update Law
At the **beginning of every response** that advances the work, update the Sprint Runtime. Change **only** the sections the new work affects. Do not restate unaffected sections, and do not update it as ceremony when nothing meaningful changed — an unchanged runtime is the honest record of a turn that changed nothing.

### 2. The History Law
History is append-only.
- **Never lose history.** Completed deliverables, executed missions, and frozen decisions are permanent.
- **Never silently rewrite a previous decision.** A decision that changes is *superseded* — the prior decision remains, marked, with the reason and date; it is never edited away.
- **Never remove a completed deliverable or a mission entry.** The ledger only grows.
- **Never summarize away detail** in Mission History or Operational Observations. Compression is loss; these accumulate.

### 3. The Evidence Law
No status becomes **Complete** or **Accepted** without recorded evidence. Evidence is a concrete, checkable fact — tests passing, browser validation, operator confirmation, live execution, an acceptance result — recorded *at the moment the status changes*, at the thing that changed (the mission entry, the deliverable, the phase). A claim of "done" without evidence is not Complete; it is In Progress. This law is what separates a durable operational record from optimism.

### 4. The Resume Rule
The Sprint Runtime must, at all times, contain **enough for another engineer — or another session — to continue the initiative without rereading the conversation.** This is a product requirement. The test is concrete: hand the Sprint Runtime alone to someone who has never seen the thread; if they cannot tell what is done, what is in flight, who owns the next move, and exactly what to do next, the runtime has failed its one job. The **Session Handoff** section exists to pass this test on every turn.

---

## The sections

The canonical structure. Every initiative's Sprint Runtime has these sections, in this order. Each entry below gives the section's *purpose*, *what it holds*, and *the rule that governs it*. Retain all of them; a section with nothing to say says "—", it is not removed.

### Situation — read this first

**Overall Progress** — one honest paragraph (and, if useful, a single percentage or fraction of phases done) stating where the initiative stands right now. The at-a-glance answer to "how far along are we?"

**Product Health** — the health of the initiative across the six architectural dimensions, each exactly one of **Healthy · Needs Attention · Blocked**, with a one-line reason (and a pointer to evidence where relevant). The six dimensions are fixed — do not add others:

| Dimension | What it reads |
|---|---|
| Engineering Leadership | Is Director's counsel present, honest, and non-intrusive on this work? |
| Mission Integrity | Do the missions faithfully carry the operator's approved intent through to execution? |
| Operations | Is execution visible and controllable — does the operator manage work, not machinery? |
| Shared Understanding | Is what the work relies on current, curated, and trustworthy? |
| Worker Runtime | Do workers execute under policy — own forward progress, honor budgets, never abandon? |
| Operational Learning | Are observations being captured (not lost) and triaged rather than silently implemented? |

### Plan — where it's going

**Phase Tracker** — the initiative's phases, each with a status (e.g. *Done · In Progress · Planned · Blocked*). The structural map of the work; a phase moves to Done only under the Evidence Law.

**Current Work** — what is actively in flight right now, and who owns the next move (Director, operator, or a worker). Small and precise — this is the "you are here" marker.

**Next Planned Work** — what comes next, in intended order, once current work reaches a stopping point. Plans, not promises; reorder freely, but keep the list honest.

### Ledger — append-only, evidence-bound

**Mission History** — a permanent, chronological list of **every** mission executed in this initiative. One entry per mission; entries are never summarized, merged, or removed. Each entry holds:
- **mission** — what it was
- **date** — when it executed
- **outcome** — what actually happened
- **evidence** — the concrete proof (per the Evidence Law), or a pointer to it
- **acceptance result** — accepted / sent back / rejected, and by whom
- **follow-up** — any residual work it created, or "none"

This section is the sprint-scoped view; the full durable record of each mission lives in the Product Definition runtime's `mission_history` for its capability. Point to it; do not recopy it.

**Deliverables Completed** — a permanent, append-only list of what the initiative has produced, each with its evidence and a pointer to where it lives. A deliverable appears here only when the Evidence Law is satisfied. Nothing is ever removed from this list.

**Evidence** — the initiative's evidence discipline made visible. It states the Evidence Law, names what counts (tests passing, browser validation, operator confirmation, live execution, acceptance), and serves as the **index of proof**: for every status that reads Complete or Accepted, the concrete evidence is recorded here or at the entry it backs, resolvable without rereading the conversation. Evidence is recorded *when the status changes*, never reconstructed later.

**Decisions Frozen** — the decisions this initiative now treats as settled and builds on. Each is stated plainly, with its date. A frozen decision is never silently edited; when it changes it is marked **superseded** with the successor and the reason, and both remain. This section is the initiative's *committed* decisions; the live reliance surface (what is still being shaped, what is knowingly carried, what was set aside) is owned by [Shared Understanding](SHARED-UNDERSTANDING-MODEL.md) — point to it rather than mirror it.

### Attention — what could move the work

**Risks** — what could go wrong, with enough context to act (and a mitigation or watch-condition where one exists). Honest, current, and pruned when a risk is retired (retirement noted, not silently dropped).

**Open Questions** — what is genuinely unresolved and shapes the work. Each should say why it matters and who can answer it. A question that gets answered becomes a frozen decision (moved, not deleted) — the answer is preserved.

### Learning — the accumulation point

**Operational Observations** — the standing input to [Operational Learning](OPERATIONAL-LEARNING.md): friction observed while operating this initiative, accumulated for later discernment. **Do not immediately implement an observation** — this is the accumulation point, not an action queue; premature fixes are how authorship leaks from the operator. Each observation holds:
- **Observation** — what the product did (the subject is always Vacilando, never the operator)
- **Evidence** — the concrete moment it happened
- **Expectation** — what should have happened instead
- **Root Cause** — the product cause, not the symptom (when known)
- **Candidate Improvement** — the smallest change that would address the cause
- **Status** — **Open · Accepted · Implemented · Dismissed**

Recurrence is what turns an observation into a candidate for action; note when the same friction repeats. Until the Operational Learning runtime is realized, these also flow to the durable [Alpha Operations friction log](qa/alpha-operations/FRICTION-LOG.md).

### Handoff — resume from here

**Session Handoff** *(the renamed Session Summary)* — not a summary for its own sake, but the artifact that lets another engineer, or the next session, **pick up exactly where this one left off.** It states, in plain language: where things stand, the single next action, who owns it, any environment/state needed to continue (worktree, branch, server, credentials-readiness), and any warning that would otherwise be learned the hard way. It is written cold — assume the reader has not seen the conversation. This section carries the Resume Rule on every turn; if it is right, rereading the thread is never necessary.

---

## The canonical skeleton

The template Director instantiates for a new initiative. Copy it verbatim; fill it as the work proceeds under the four Laws.

```markdown
# Sprint Runtime — <Initiative Name>

- **Owner:** Director · **Operator:** <name> · **Status:** <active | frozen>
- **Worktree / branch:** <path> / <branch> · **Server:** <url or "not required">
- **Opened:** <date> · **Last updated:** <date>

## Overall Progress
<one honest paragraph; optional phases-done fraction>

## Product Health
| Dimension | Status | Why |
|---|---|---|
| Engineering Leadership | Healthy / Needs Attention / Blocked | <one line> |
| Mission Integrity | … | … |
| Operations | … | … |
| Shared Understanding | … | … |
| Worker Runtime | … | … |
| Operational Learning | … | … |

## Phase Tracker
- [ ] <Phase> — <Done | In Progress | Planned | Blocked>

## Current Work
<what is in flight; who owns the next move>

## Next Planned Work
1. <next> …

## Mission History   (append-only; never summarized or removed)
- **<mission>** — <date> — outcome: <…> — evidence: <…> — acceptance: <…> — follow-up: <… | none>

## Deliverables Completed   (append-only; evidence required)
- **<deliverable>** — evidence: <…> — location: <…>

## Evidence
<the Evidence Law; what counts; index of proof for every Complete/Accepted status>

## Decisions Frozen   (append-only; supersede, never silently rewrite)
- **<decision>** — <date> — <supersedes: … | —>

## Risks
- <risk> — <mitigation / watch-condition>

## Open Questions
- <question> — why it matters: <…> — who can answer: <…>

## Operational Observations   (accumulate; do not implement here)
- **Observation:** <…> · **Evidence:** <…> · **Expectation:** <…> · **Root Cause:** <…> · **Candidate Improvement:** <…> · **Status:** Open

## Session Handoff
Where things stand: <…>
Next action: <…> · Owner: <Director | operator | worker>
State to continue: <worktree / branch / server / auth readiness>
Warnings: <…>
```

---

## Relationship to the existing architecture

The Sprint Runtime is a realization artifact, not a foundation model, and it is careful about its edges:

- It is **downstream of** [Persistent Engineering Continuity](PERSISTENT-ENGINEERING-CONTINUITY.md): continuity is the constitutional *why*; the Sprint Runtime is the operational *record* that makes resumption concrete for a whole initiative.
- It **references, and never becomes,** [Shared Understanding](SHARED-UNDERSTANDING-MODEL.md), the Product Definition runtime's Mission History, [Operational Learning](OPERATIONAL-LEARNING.md), and the [Engineering Session Model](ENGINEERING-SESSION-MODEL.md). Its sections point to those systems for full truth.
- It introduces **no new doctrine and no new runtime.** Directors already own understanding, missions, and continuity; the Sprint Runtime only gives an initiative one standard operational face over what already exists.
- It answers a different question than any single system: not *what do we rely on* (Shared Understanding), not *what did this mission do* (Mission History), not *what should improve* (Operational Learning), but **"where does this whole initiative stand, and how do I continue it?"**

That question — asked at the start of every session of a long initiative — is the one the Sprint Runtime exists to answer, once, durably, so it never has to be reconstructed from a conversation again.
