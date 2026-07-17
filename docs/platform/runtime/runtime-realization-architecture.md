---
owner: runtime
status: canonical
last_reviewed: 2026-07-16
supersedes: []
---

# The Alloy Operating System — Constitution

**Status:** **FROZEN** (amended at ratification, 2026-07-16 — see Amendment Record). Part I changes only by exceptional amendment.

**This document governs.** Part I is constitutional and is intended to outlive every runtime Alloy
will ever have. Part II is evidence and realization, and will age. Implementation is not described
here — implementation is what happens when this document is true.

Every operational surface Alloy will ever build — Workspace, Work Unit, Processing, Communications,
Settings, Analytics, and every surface not yet imagined — is created by declaring its four contracts
under this constitution. Not by building a runtime. If a proposal cannot be derived from Part I, the
proposal is wrong, or this document must be amended first. It may not be worked around.

---

## The Universal Principle

> # **The operator moves their attention. Alloy moves nothing else.**

Every runtime decision is judged against that one sentence. If a change causes anything to move that
the operator did not move — a surface rebuilt, a layout reflowed, a value flipped, a place
reconstructed, a page loaded — the change is unconstitutional, no matter what metric it improves.

*An operator never navigates. Their attention moves within one living operating environment, and the
runtime exists for no other purpose than to make that movement continuous.*

## The Thesis

> **Alloy is not attempting to make navigation faster.**
> **Alloy is attempting to eliminate the operator's awareness that navigation exists.**
>
> Operators experience *continuity of work*, not *movement between applications*.
> The runtime exists only to create that experience.

The runtime does not exist because navigation occurred. **The runtime exists because operator
attention moved.** Navigation is merely one of the ways attention movement is expressed — and the
least interesting one.

## The Conceptual Hierarchy

Every article in this document sits at exactly one level, and no level may reach upward:

```
        OPERATOR          why anything exists
            │
        ATTENTION         the fundamental event
            │
         SURFACE          where attention rests and work happens
            │
         RUNTIME          what preserves continuity while attention moves
            │
      IMPLEMENTATION      the consequence — never the author
```

Read downward, this is a derivation. Read upward, it is a prohibition: **implementation may not
define the runtime; the runtime may not define surfaces; surfaces may not define attention; attention
serves the operator.**

## What Alloy Is Not

- Alloy is **not** a collection of web pages.
- Alloy is **not** a routing hierarchy.
- Alloy is **not** a sequence of loading screens.
- Alloy is **not** an application that navigates between modules.
- Alloy is **not** a collection of independent feature areas.
- Alloy is **not** a set of features that each solve loading in their own way.
- Alloy is **not** something an operator visits, leaves, and returns to.

## What Alloy Is

- **One operating environment.** The operator enters it once.
- **Many operational surfaces.** Each is a place where work is possible, and each is already there.
- **Continuous attention.** Attention moves; it never stops and restarts.
- **Continuous work.** The operator's work is never interrupted by the software that carries it.
- **Navigation is an implementation detail** — one the operator never meets.

---

# PART I — THE CONSTITUTION

---

# LAYER 1 — The Operator

*Why anything below exists. Every article beneath this one is answerable to it.*

## Article 1.1 — What the operator experiences

1. **The application answers instantly.** Every gesture is met before the operator can wonder whether
   it landed. Unconditionally — regardless of network, data, or destination.
2. **Work is continuous.** Attention moves; the application does not restart. What was true a moment
   ago is still on screen and still true.
3. **Places are simply there.** A surface attention moves to is already a place the operator can work.
   It arrives workable, or it does not arrive.
4. **Movement is legible, not eventful.** The operator understands that focus shifted. They do not
   experience a departure, a load, and an arrival.
5. **The application is honest.** Genuine unavailability is stated plainly. Genuine emptiness is stated
   plainly. "Not yet" is never dressed as "nothing."
6. **Everything else is quiet.** Refinement happens without announcement, into space already reserved.

## Article 1.2 — What the operator never experiences

These are not defects to prioritize. They are **constitutional violations**:

- Watching the application assemble itself.
- A skeleton, placeholder, or scaffold standing in for a place.
- A blank moment between two places.
- "Not yet loaded" presented as "empty"; a number that is wrong before it is right.
- Losing valid, true work because attention moved.
- A place that appears and *then* becomes usable.
- Wondering whether a gesture registered.
- A layout that changes shape after they have begun reading it.
- Returning to work and watching it be rebuilt.

## Article 1.3 — How confidence is created

Confidence is not decoration. It is produced by three guarantees, in order:

1. **Immediate acknowledgment** — under 50 ms, always, before any network exists. Acknowledgment is a
   promise: *"I have your intent."*
2. **Preserved truth** — while the promise is pending, everything visible remains true. Correctness is
   never traded for the appearance of progress.
3. **A kept promise** — the destination, when it appears, is a place to work. **A promise partially
   kept is worse than a promise still pending.**

> **Latency after acknowledgment is tolerable. Silence before it is not. A broken promise is
> unforgivable.**

## Article 1.4 — How continuity is maintained

Continuity is the default; discontinuity is the exception that must be justified. The operator's
context belongs to *them*, not to whatever component happened to be rendering it. Attention leaving a
place does not destroy it. Attention returning is a reveal, never a reconstruction.

## Article 1.5 — How interruption is avoided

Interruption is anything that takes attention away from the work and gives it to the application.
Loading states, spinners, skeletons, reflows, flashes, and "please wait" are interruptions.

> **The application may make the operator wait. It may never make the operator watch.**

- *Waiting* on stable truth with an acknowledged gesture → the operator remains in their work.
- *Watching* an application construct itself → the operator has left their work and is now attending
  to software. Attention has been stolen.

## Article 1.6 — What "premium" means

Premium is not animation. Not polish. Not speed alone.

> **Premium is the absence of evidence that software is involved.**

A premium runtime cannot be described by the operator, because there is nothing to describe. They did
not experience a transition, a load, or a page. They experienced their work, continuing.

---

# LAYER 2 — Attention

*The fundamental event. Everything the runtime does **to move the operator** is a response to this and
nothing else.*

## Article 2.1 — What Attention is

> **Attention is the thing the operator is currently attempting to accomplish.**

Attention is a *work intention*, expressed in the operator's own language:

- "I need to work New Leads."
- "I need this family."
- "I need Billing."
- "I need Processing."

Attention always has an **object** (the work) and a **purpose** (why it matters now). It is never a
location.

## Article 2.2 — What Attention is not

Attention is **not** UI focus. Not browser focus. Not keyboard focus. Not a route, a URL, a selection,
a tab, or a mounted component. Those are shadows that implementations cast; none of them is the thing
itself, and none may be mistaken for it.

## Article 2.3 — Attention moves — and that is the runtime's only event that moves the operator

> **The runtime has exactly one event that moves the operator: attention moved.**

This is the most consequential article in this document, because it dissolves a distinction the
industry treats as fundamental. An operator opening a record, changing a lens, and "navigating to a
different part of the application" are **not different kinds of events**. They are the same event at
different **scopes**:

| Scope of movement | The operator's words | What differs |
|---|---|---|
| Within a subject | "show me their activity" | almost nothing must be prepared |
| Across subjects | "now this family" | a new subject must be prepared |
| Across lenses | "show me Waitlist instead" | a new set of work must be prepared |
| Across surfaces | "I need Billing" | a new operational context must be prepared |
| To a named object | "find the Wright family" | the object must be located, then prepared |

**The runtime responds identically in kind at every scope**: acknowledge, preserve, prepare, commit,
settle. Only the *quantity* of preparation differs — never the mechanism, never the guarantees.

> **Corollary — the Anti-Fork Rule.** Any runtime with more than one mechanism for moving attention has
> already failed. If moving to a record feels instant and moving to a surface does not, the runtime
> has two mechanisms and one of them is wrong. **Discontinuity is always evidence of a fork.**

> **Truth also moves.** A record changes beneath a stationary operator; a message arrives; an
> automation completes; a webhook resolves; an AI proposes; **and the operator themselves records an
> outcome.** Nothing the operator is *attempting to accomplish* has changed, so **these are not
> attention events, and they must not be forced into Attention.** They move *truth*, never the
> operator. They are governed by [Article 4.8](#article-48--reconciliation-truth-that-moves-while-attention-does-not).
> They never prepare, never commit, and never move attention — which is precisely why they are not a
> second mechanism and do not violate the Anti-Fork Rule.

## Article 2.4 — Navigation is demoted

Navigation is **one possible expression** of attention movement — an implementation detail of the
largest scope, and nothing more. It is not the event. It does not initiate the runtime. It does not
own the operator's context. It is not permitted to be visible.

> **Attention movement causes navigation. Navigation never causes attention movement.**

A URL is a *serialization* of where attention rests — useful for sharing, restoring, and returning.
It is a photograph of attention, never attention itself, and a photograph may not be permitted to
rebuild the world it depicts.

## Article 2.5 — The duty of the runtime

> **The runtime exists to preserve continuity — while attention moves, and while truth moves beneath
> it.**

That is its whole purpose. It has no other. Every mechanism in Layer 4 exists solely to keep the
operator's work continuous across a movement of attention or of truth — and to ensure the operator
never learns that either had mechanics at all.

---

# LAYER 3 — Surfaces

*Where attention rests and work happens.*

## Article 3.1 — What a Surface is

> **A Surface is a persistent operational context in which an operator can continue accomplishing
> work.**

A Surface is **not** a page. **Not** a route. **Not** a React tree. **Not** a module, a feature area,
or a screen. Those are things implementations build; a Surface is a thing operators *work in*.

Two words in that definition are load-bearing:

- **Persistent** — a Surface continues to exist when attention is elsewhere. It is a place, not an
  event. Places do not cease to exist because you looked away.
- **Operational** — a Surface is defined by the work it makes possible, never by what it displays.

The catalog is open, and deliberately so:

| Surface | The work it makes possible |
|---|---|
| **Workspace** | Understand what needs attention; choose where to work |
| **Work Unit** | Work a queue of subjects through a business process |
| **Processing** | Resolve intake into operational truth |
| **Communications** | Conduct and account for conversation |
| **Settings** | Operate the configuration objects that steer the platform |
| **Analytics** | Interrogate aggregate operational truth |

## Article 3.2 — The Four Contracts

> **Every Alloy surface declares exactly four contracts. No more. No less.**

This is the entire extensibility model of the Alloy Operating System. A new surface is *declared*, not
engineered. **If building a surface requires building runtime, this constitution has failed and must
be amended — not bypassed.**

### 3.2.1 — The Operational Contract
**What must be true before the operator can continue working here.**

This replaces every vague notion of "loaded." It is a statement of *capability*, in operator terms.
It is the surface's most consequential decision, because it sizes everything else.

### 3.2.2 — The Preparation Contract
**Everything required to reach the Operational Contract. Nothing more.**

The three words *nothing more* are constitutional. They are the permanent limit on the appetite of
preparation, and the reason preparation can never grow into an unbounded request for "the surface."
If a datum is not required to reach the Operational Contract, the Preparation Contract may not
contain it — regardless of how convenient, adjacent, or cheap it appears.

### 3.2.3 — The Retention Contract
**What survives while attention moves elsewhere.**

What belongs to the operator's session rather than to a rendering: where they were, what they had
selected, what they were looking at. Retention is what makes a Surface *persistent* rather than
merely *re-creatable*.

### 3.2.4 — The Settlement Contract
**Everything of the surface's own declared truth that may continue after Operational Commit without
interrupting work.**

Settlement is defined by *exclusion*: it is everything outside the Operational Contract, by
construction. This is why the Operational Contract is the most consequential decision a surface
makes — **it does not merely define the beginning of work; it defines the boundary of interruption.**

**Scope (binding).** Settlement is **caused by commit** and completes *this surface's own* truth. Truth
that arrives from outside the surface's own preparation — because the world changed, or because the
operator changed it — is **Reconciliation** (Art 4.8), **not Settlement**. The two obey the same
visual laws and differ only in cause and owner. A surface declares a Settlement Contract; it does not
declare a Reconciliation Contract, because reconciliation is not the surface's to own.

### The relationship between the four

```
   OPERATIONAL CONTRACT  ── the end:      "the operator can work"
            │
   PREPARATION CONTRACT  ── the means:    exactly what is required to reach it, and nothing more
            │
   ─────────────────────────── Operational Commit ───────────────────────────
            │
   SETTLEMENT CONTRACT   ── the remainder: everything else, quietly, afterwards

   RETENTION CONTRACT    ── across time:   what persists while attention is elsewhere
```

**Operational ∪ Settlement = the whole surface.** Preparation is *derived from* Operational and bounded
by it. Retention is orthogonal to all three: it is the surface's persistence through time.

### Worked example — the Work Unit

| Contract | Declaration |
|---|---|
| **Operational** | The work is visible (the queue's rows for the active lens); the subject of attention is committed (the operator knows who is selected); action is reachable. |
| **Preparation** | The surface's identity; the rows for that lens; the subject the operator should land on; the lens set. **Nothing more.** |
| **Retention** | The lens, the selected subject, scroll position, filters — for the session. |
| **Settlement** | Every card body, every count, every metric, related records, activity, communications, secondary actions. |

Note what is *absent* from Preparation: the selected record's full detail. The operator can work — see
the queue, know who is selected, act — without it. It is therefore Settlement, by definition, not by
preference.

## Article 3.3 — What a Surface does not own

A surface owns its four contracts and **nothing else**. It does **not** own: attention, navigation,
preparation mechanics, transition choreography, reveal timing, readiness arbitration, caching, or
failure escalation. Those belong to the runtime, uniformly, for every surface.

> **A surface that owns its own loading has forked the runtime.**

## Article 3.4 — How Surfaces exchange

Surfaces do not replace one another. **Surfaces exchange focus.** The outgoing surface does not die
when the incoming is requested; it *yields* when the incoming is ready to receive the operator. At
every instant there is exactly one surface the operator is working in, and it is always a true one.

> **Law of Exchange: no surface may be destroyed until its successor is operational.**

## Article 3.5 — How Surfaces persist

Retention is the default. Attention leaving suspends a surface; it does not demolish it.

> **A cache makes reconstruction fast. Retention makes reconstruction unnecessary.**

They are not interchangeable. Confusing them produces an application that is excellent at doing
something it should never do.

---

# OPERATIONAL COMMIT — The Central Contract

*The hinge of this constitution. Surfaces declare it. The runtime honors it. Implementation is judged
by it, and by nothing else.*

## Article OC.1 — Definition

> ## **Operational Commit is the moment the operator can continue working.**

Operational Commit is **not**:

- data loaded
- requests finished
- React rendered
- hydration complete
- a view model composed
- a spinner removed
- a promise resolved

Every item in that list describes the machine. **None of them is knowable by the operator, and
therefore none of them may define the operator's experience.**

## Article OC.2 — The five conditions

Operational Commit has occurred when **all five** are true. Not most. All.

1. **The operator can continue working.**
2. **The operator understands where they are.**
3. **The operator trusts what they see.**
4. **The operator no longer waits.**
5. **The operator no longer thinks about navigation.**

Condition 3 is why a half-built surface is not a commit: it can be *seen* but not *trusted*.
Condition 5 is the constitution's own success criterion — at Operational Commit, the runtime becomes
invisible, which is the entire purpose of Layer 1.

## Article OC.3 — The test

Any engineer may apply it, at any time, without reading a line of code:

> **If the operator's hands were on the keyboard right now, could they do the next thing?**
>
> **Yes** → the surface is Operational.
> **No** → it is not, regardless of how much data has arrived.

## Article OC.4 — The Laws of Commit

1. **A surface is never shown before it is Operational.** There is no partial arrival.
2. **Commit is atomic.** First sight is a workable place.
3. **Commit is caused by truth, never by time.**
   > ### **Time may change what the operator is told. Time may never show the operator a destination that is not Operational.**
4. **Commit requires a terminal outcome.** Preparation ends in exactly one of `operational` ·
   `empty (authoritatively)` · `error (honestly)`. All three are workable places. None is a scaffold.

Law 3 is the constitutional prohibition on the timeout, and it prohibits **exactly one thing**. Four
acts are routinely confused; only the last is forbidden:

| Time may… | Verdict | Because |
|---|---|---|
| change what the operator is **told** | **permitted** | communication is not truth |
| **establish that preparation has failed** — a terminal `error` (Law 4) | **permitted, and required** (Art 4.5) | a deadline is how a runtime *learns* that preparation will not conclude. Time is establishing truth, not replacing it. |
| trigger **recovery** — the reload floor (Art 4.5) | **permitted** | a recovery is an honest restart, not a destination |
| **show a destination that is not Operational** | **PROHIBITED** | this is a clock *substituting for* truth: the appearance of progress in place of progress |

> ### **Time may establish that preparation has failed. Time may never substitute for preparation having succeeded.**

A deadline may therefore produce `error`, and **only** `error`. It may never produce `operational`.
A runtime that reveals a destination because a clock expired has broken its promise at precisely the
moment the operator was relying on it. A runtime that concludes a stalled preparation has failed, and
says so honestly, has kept it.

## Article OC.5 — The optimization mandate

> **Every engineering decision optimizes toward Operational Commit — never toward request
> completion.**

**Corollary:** a change that improves request counts, cache hit rates, or response times while
delaying Operational Commit is a **regression**, and must be rejected on those grounds alone.

---

# LAYER 4 — The Runtime

*Only now does machinery appear. It exists solely to produce Layers 1–3, and it is the only thing
permitted to know that navigation exists.*

## Article 4.1 — The operator state model

The runtime has four states, named for what the **operator** experiences, because that is what they
exist to produce:

```
   ACKNOWLEDGED  ──►  TRANSITIONING  ──►  OPERATIONAL  ──►  SETTLED
   "It heard me"      "I'm still         "I'm working     "Everything
                       working, and       here now"        else caught up"
                       it's coming"
```

| Operator state | The operator's reality | The runtime's obligation |
|---|---|---|
| **Acknowledged** | "It heard me." | Answer the gesture < 50 ms, unconditionally, before any network |
| **Transitioning** | "I am still working on true things; the next place is coming." | Hold valid truth. Prepare invisibly. **Never show construction.** |
| **Operational** | "I am working here now." | The destination is workable **on first sight** |
| **Settled** | *(no experience — invisible by design)* | Refine quietly into reserved space |

Only now may these be mapped to runtime behavior:

| Operator state | Runtime behavior |
|---|---|
| Acknowledged | attention movement captured; acknowledgment rendered; **preparation begins** |
| Transitioning | preparation in flight; outgoing surface held, mounted, non-interactive |
| Operational | preparation reached a **terminal outcome**; the runtime commits; the URL is projected |
| Settled | settlement resolves behind the commit |

**This is deliberately not a loading model.** There is no "Loading" state, because there is no operator
experience called loading that this runtime permits.

## Article 4.2 — Intent

> **Intent is the operator's gesture — the moment attention begins to move.**

Expressed by pointer, keyboard, command, search, notification, or deep link. On intent the runtime does
two things **simultaneously, never sequentially**:

1. **Acknowledges** — unconditional, < 50 ms, independent of everything else.
2. **Prepares** — begins the destination's preparation.

Intent does **not** navigate. Navigation happens later, if and when preparation succeeds.

## Article 4.3 — Preparation

> **One destination. One preparation. One answer.**

Preparation is a first-class object with identity, lifecycle, and a terminal outcome. It fulfills the
surface's **Preparation Contract** and is bounded by it.

1. **Preparation is owned.** Exactly one owner prepares a destination. Components do not fetch their
   own way into existence.
2. **Preparation is one answer.** A Preparation Contract must be satisfiable in **one round-trip**. If
   satisfying it requires knowing A to ask for B, that resolution belongs where the answers live —
   never as a second round-trip across the network.
   > **Corollary:** a dependent chain executed across a network is a *design error*, not a latency
   > problem. It cannot be cached, prefetched, or timed into correctness.
3. **Preparation is keyed and shared.** The same destination prepared twice is one preparation.
4. **Preparation is superseded, never raced.** The newest attention wins; prior preparations are
   cancelled and can never win a commit.
5. **Preparation is a snapshot.** Immutable at commit. Change arrives through settlement.
6. **Preparation never renders.** It produces truth; it does not decide appearance.
7. **Preparation is bounded by its contract.** *Nothing more* (Article 3.2.2) is enforced here.

## Article 4.4 — Settlement

Everything outside the Operational Contract, fulfilling the surface's **Settlement Contract**.

**Settlement is caused by commit**, and completes the committed surface's own declared truth. It is
**not** the channel for truth arriving from the world or from an operator's act — that is
Reconciliation (Art 4.8). Law 6 below therefore concerns *responses to this surface's own
preparation*; **a message that arrives unbidden is not a settlement response, and this article does
not govern it.**

1. Settlement begins only after commit.
2. Settlement never blocks, blanks, re-orders, or reflows.
3. Settlement lands in reserved space.
4. Settlement never lowers an established truth.
5. Settlement never shows a placeholder that later flips; a resolved-empty shows a real "—".
6. A settlement response for a superseded destination or subject is discarded by key.

## Article 4.5 — Failure and time

Failure is not an exception path bolted to the side. It is a **terminal outcome of preparation**, and
therefore a first-class operator experience.

| Situation | Runtime behavior | Operator experience |
|---|---|---|
| Preparation is slow | **Keep holding valid truth.** Escalate what the operator is *told*, never what they are *shown*. | Still working; the promise is visibly pending |
| **Preparation does not terminate** | **The runtime deadline concludes it: terminal `error`** (Art OC.4 Law 3) → commit an honest error surface. The deadline may produce `error` and nothing else. | "This did not load" — a workable place, not a scaffold |
| Preparation fails | Terminal `error` → commit an honest error surface | "This is broken, and I know why" — a workable place |
| Genuinely empty | Terminal `empty` → commit an authoritative empty | "There is nothing here" — the truth |
| Superseded | Cancel; newest attention wins | The last thing they asked for is what they get |
| Truth moves mid-movement | The snapshot commits; the change reconciles afterwards (Art 4.8) | Nothing flickers |
| Runtime inconsistent — it cannot even conclude | **Reload floor** — a deliberate, correct rebuild | A rare, honest restart |

**The deadline is single, and it is the runtime's.** It is not per-surface, not per-component, not
per-request. A surface may not declare its own; a component may not invent one; no feature may hold a
private clock. Its only permitted product is a terminal `error`. **This forecloses the invention of
private timeout semantics** — the runtime has exactly one deadline, and it can only ever conclude that
preparation failed.

The reload floor is retained forever and is never the default. It answers a runtime that cannot reach
a terminal outcome at all — not a runtime that is merely slow. **A runtime that cannot recover is worse
than the reload it replaced.**

## Article 4.6 — Ownership

One owner per concern. Two owners of one concern is a defect, regardless of how well it behaves today.

| Concern | Owner | Explicitly not |
|---|---|---|
| Attention | the operator | not a URL |
| Intent | the operator's gesture | not a route change |
| Preparation | the destination's preparation | not component mount effects |
| What "Operational" means | the surface's Operational Contract | not a component's local readiness |
| Readiness truth | preparation's terminal outcome | **not the DOM; not a timer** |
| Commit timing | the runtime | not the router; not a clock |
| Retained surface identity | the runtime | not a route segment |
| The URL | one projection authority | not two authorities negotiating |
| Appearance | the presentation layer | it may never fetch its own Preparation Contract |
| Subject identity within a surface | the record layer | never a surface exchange |
| Settlement | settlement owners | may never gate a commit |
| **Reconciliation** of truth that moves (Art 4.8) | **the record layer** (server-authoritative change stream) | not a surface; not a per-component subscription; never a commit |
| The runtime **deadline** (Art 4.5) | **the runtime** — single | not a surface; not a component; it may produce only `error` |

## Article 4.7 — Instrumentation

**The runtime measures the operator's experience, not the machine's activity.** Instrumentation that
reports healthy requests while the operator watches a skeleton is instrumentation that lies.

| Signal | The question it answers |
|---|---|
| **`acknowledgment_ms`** | Did we answer the gesture? |
| **`operational_commit_ms`** | When could the operator continue working? |
| **`visible_construction_ms`** | **Did the operator ever watch the application assemble itself?** *(must be 0)* |
| **`continuity_breaks`** | Blank frames, rebuilds, cleared truth *(must be 0)* |

Request counts, cache hits, and durations are **diagnostics**. They are never acceptance criteria.

> **Acceptance is measured in what the operator experienced, never in what the machine did.**

---

## Article 4.8 — Reconciliation (truth that moves while attention does not)

> **Attention moves the operator. Truth moves beneath them. Both must be continuous.**

Operational truth changes without the operator moving: another operator edits the record on screen; a
message arrives; an automation or workflow completes; a webhook resolves; a synchronisation lands; an
AI proposes; **and the operator themselves records an outcome, completes work, or executes an action.**
None of these is an attention event (Art 2.3). They are not forced into Attention, and they do not
become a second runtime.

**How truth enters.** Through exactly one path: the **server-authoritative change stream**, reconciling
into the client's record of truth. Truth is *received*; it is never fetched by a surface. A surface
does not subscribe, poll, or listen. **A surface that reaches for live truth has forked the runtime**
(Art 3.3).

**Who owns reconciliation.** The **record layer** — the client's cache of server-authoritative truth
(`../foundation/os-runtime-map.md`). One owner. It reconciles a change into every surface showing that
record. Surfaces present the result; they do not negotiate it, and they do not each solve it.

**Two sources, one path.** Truth moves from the **world**, or from the **operator's own act**. The path
and the owner are identical; only the source differs, and the source grants exactly one privilege:

> **Truth the operator created themselves may be shown optimistically before it is confirmed, and must
> be withdrawn legibly if it is not. The world is granted no such privilege.**

This is why **operator mutation requires no runtime event of its own.** Completing work is not a
movement of attention — the operator stays exactly where they are — it is a movement of *truth* whose
source happens to be the operator. Its gesture is acknowledged under Layer 1 (Art 1.1), unconditionally
and in under 50 ms, like every gesture; its consequence reconciles here.

**The laws of Reconciliation** are Settlement's visual laws (Art 4.4 §2–§6), without exception:
reconciliation never blocks, never blanks, never re-orders, never reflows, never lowers an established
truth, never announces itself, and lands in reserved space.

**How Operational Commit remains valid.** Reconciliation **never commits**. It does not prepare, does
not exchange surfaces, does not move attention, and can neither cause nor delay an Operational Commit.
It updates truth on a surface that is *already* Operational. The state model (Art 4.1) is the attention
axis, and reconciliation does not touch it.

**Why this is not a fork.** The Anti-Fork Rule (Art 2.3) forbids more than one mechanism for **moving
attention**. Reconciliation moves no attention. The runtime therefore has exactly one attention
mechanism and exactly one reconciliation path — **two orthogonal axes, neither a duplicate of the
other.** A second *attention* mechanism is a fork. A truth axis is not.

# LAYER 5 — Implementation

*The consequence. Never the author.*

## Article 5.1 — The subordination of implementation

> **Implementation is the expression of this constitution. It is not a participant in it.**

Implementation may choose *how*. It may never choose *what the operator experiences* — that is settled
above it, by Layers 1–4, and is not open for renegotiation by any framework, library, or convenience.

## Article 5.2 — Constitutional tests for any proposal

A proposal is unconstitutional — regardless of merit, urgency, or measured improvement — if it:

1. makes something move that the operator did not move *(the Universal Principle)*;
2. permits time to decide what the operator sees *(Article OC.4, Law 3)*;
3. reveals a surface before it is Operational *(Article OC.4, Law 1)*;
4. lets a component decide its own readiness *(Article 4.6)*;
5. lets appearance gate truth *(Article 4.3, Article 4.6)*;
6. adds anything to a Preparation Contract that is not required to reach the Operational Contract
   *(Article 3.2.2)*;
7. introduces a second mechanism for moving attention *(Article 2.3, Anti-Fork Rule)*;
8. simulates continuity by reconstruction *(Article 3.5)*;
9. measures the machine and calls it acceptance *(Article 4.7)*;
10. requires new runtime in order to add a surface *(Article 3.2)*.

> A future engineer should be able to reject a bad proposal using this list alone — **without reading
> any existing code**. If they cannot, this document is incomplete and must be amended.

## Article 5.3 — Amendment, not exception

A proposal that cannot be derived from Part I is either wrong or requires an amendment. There is no
third option.

> **"Just this once" is how the runtime we are replacing was built.**

---

# PART II — REALIZATION

*Evidence and consequence. This part is dated; Part I is not.*

---

# The Current Implementation

*Truth only. No opinions. No proposals. Measured on a production build, authenticated, cold and warm.*

## Article 6.1 — What the operator experiences today

Attention moves from the Workspace to New Leads, cold:

| Time | What the operator experiences |
|---|---|
| 42 ms | The row acknowledges. *(promise made)* |
| 0 – 4.3 s | The Workspace remains, true and complete. *(promise pending — this part is right)* |
| **4.3 s** | **The Workspace is taken away and replaced by a hollow Work Unit** — no header, no queue, no records, no subject. *(promise broken)* |
| 4.3 – 9.0 s | **The operator watches the Work Unit assemble itself for 6.6 seconds.** |
| 9.0 s | It finally becomes a place they can work. |

Warm: acknowledged at 13 ms, operational at 2.5 s, essentially no construction visible.
Repeated: operational at ~1.5 s, stable, no degradation.

## Article 6.2 — The map

```
[attention moves]  the gesture is acknowledged, and a route is requested
   │               preparation does not begin
   ▼
[route]   the destination's route resolves the surface's identity on the server
   │      — an identity the client had already resolved 6 ms earlier
   │      1769 ms · nothing is being prepared during this window
   ▼
[mount]   only now do the surface's components begin fetching, each on its own
   │
   ├── the presentation-config chain
   │      config core ──► row layout ──► (releases) ──► the queue's rows
   │                      (appearance only)             (the operator's work)
   │
   └── the header chain
          header config ──► metric values ──► (silently gates the reveal)
   ▼
[rows arrive]  3.9 s after being asked for
   ▼
[subject]  resolved on the client, from the rows
   ▼
[readiness]  six independent conditions must all become true
   ▼
[reveal]  — but the clock already fired at 4.3 s and revealed the surface anyway
```

## Article 6.3 — The measurements

| | Cold | Warm | Repeated ×5 |
|---|---|---|---|
| Acknowledgment | 42 ms | 13 ms | 8–10 ms |
| Operational | **8964 ms** | 2516 ms | ~1500 ms (stable) |
| **Visible construction** | **6576 ms** | 192 ms | 0 |
| Blank frames | 0 | 0 | 0 |
| Surface rebuilds | 0 | 0 | 0 |
| Requests before Operational | 16 | — | — |
| Dependent network tiers | **4** (+1 redundant) | — | — |

## Article 6.4 — Facts of record

1. Navigation gates preparation: **1769 ms cold / 2507 ms warm** during which nothing is prepared.
2. The route re-derives, in **three serial database hops**, the surface identity the client had already
   resolved **6 ms after intent**. Navigation is expressed as a plain anchor with an intercepted click,
   so the route is never prefetched. Warming makes this work redundant; it cannot make it non-blocking.
3. `prepare` awaits nothing; warming races the route rather than being awaited by it.
4. The queue's rows are released only after a **presentation-only** payload (row variants and slots,
   which never affect order, membership, or count) arrives.
5. The reveal is silently gated by **metric values**, reached through the header-config fetch. On cold
   they resolve against default keys regardless.
6. The record's view model does **not** gate the reveal.
7. The rows request itself takes **≈3.9 s**.
8. Readiness is a conjunction of six conditions owned by different components, observed by **polling a
   DOM attribute**.
9. Commit is decided by a **2.5 s clock**. On the cold path the clock fires before truth arrives.
10. Retention is repaint from a module cache: correct in behavior, reconstruction in fact, lost on
    reload.
11. Attention movement has **more than one mechanism**: moving to a subject is instant and continuous;
    moving to a surface is neither.

---

# Realization

## Article 7.1 — The project, in three diagrams

```
════════════════════════════════════════════════════════════════════════════
CURRENT — the operator watches the application build itself
════════════════════════════════════════════════════════════════════════════

  attention moves ──► acknowledged ──► the Workspace is held, true ──► THE CLOCK GIVES UP
                     (42 ms)           (4.3 s — this part is right)          │
                                                                             ▼
                                                          a hollow Work Unit is revealed
                                                          ┌────────────────────────────┐
                                                          │  no queue    no records    │
                                                          │  no subject  no header     │
                                                          └────────────────────────────┘
                                                          ◄── 6.6 s of watching ──►
                                                                             │
                                                                             ▼
                                                               operational at 9.0 s

════════════════════════════════════════════════════════════════════════════
IDEAL — the operator never learns that navigation exists
════════════════════════════════════════════════════════════════════════════

  attention moves ──► acknowledged ──► the operator keeps working on true things
                     (<50 ms)          ┌──────────────────────────────────────┐
                                       │  the Workspace: still there, still   │
                                       │  true, still theirs                  │
                                       └──────────────────────────────────────┘
                                                   ╎
                                       (invisible) ╎  ONE answer prepares the destination
                                                   ▼
                                       ┌──────────────────────────────────────┐
                                       │  the Work Unit is simply THERE —     │
                                       │  queue, subject, action: workable    │
                                       │  on first sight                      │
                                       └──────────────────────────────────────┘
                                                   │
                                                   └── everything else settles, quietly

════════════════════════════════════════════════════════════════════════════
MIGRATION — three inversions. Each is inevitable given the one above it.
════════════════════════════════════════════════════════════════════════════

  1. MEASURE WHAT THE OPERATOR FEELS
     from "how many requests, how fast"  ──►  "when could they work, and did
                                               they watch us build?"
                    │
                    ▼
  2. ANSWER IN ONE PLACE
     from a chain of questions across the network  ──►  one question, answered
                                                        where the answers live
                    │
                    ▼
  3. PREPARE ON ATTENTION · COMMIT ON TRUTH
     from "navigate, then prepare, then reveal when the clock says so"
                              ──►  "prepare when attention moves, reveal when it is real"
                    │
                    ▼
            navigation stops existing, as far as the operator is concerned
```

## Article 7.2 — The gaps

Stated as **Ideal → Current → Difference**, then classified.

**GAP 1 — Preparation is gated by navigation**
*Ideal:* attention movement begins preparation. *Current:* the route must commit first — 1769 ms cold,
2507 ms warm of nothing. *Difference:* the operator's wait begins before the work does.
*Class:* Architecture · Ownership.

**GAP 2 — The destination is assembled by a chain of questions across the network**
*Ideal:* one destination, one preparation, one answer. *Current:* four dependent tiers, 16 requests.
*Difference:* the client interrogates the server repeatedly to assemble what the server could have
answered once. *Class:* Requests / Data dependency — **not** latency.

**GAP 3 — Identity is resolved twice, and the redundant one blocks**
*Ideal:* resolved once. *Current:* client at 6 ms; server re-derives it in three serial hops for
1769 ms. *Difference:* the runtime pays its largest fixed cost to re-learn what it knew.
*Class:* Architecture.

**GAP 4 — Appearance gates truth**
*Ideal:* presentation config may never gate work. *Current:* rows wait on row variants and slots.
*Difference:* the operator waits for cosmetics before receiving work. *Class:* Composition.

**GAP 5 — The reveal has undeclared gates**
*Ideal:* the Operational Contract is declared and is the only gate. *Current:* a six-term conjunction
across components, silently including metric values. *Difference:* nobody chose this contract — it
accumulated. *Class:* Composition / Reveal.

**GAP 6 — Readiness is inferred, not owned**
*Ideal:* readiness is preparation's terminal outcome. *Current:* the runtime polls a DOM attribute.
*Difference:* the runtime asks the picture whether the truth arrived. *Class:* Ownership.

**GAP 7 — Commit is decided by a clock**
*Ideal:* commit is caused by truth. *Current:* a 2.5 s budget commits regardless; cold, it fires 4.6 s
early. *Difference:* the appearance of progress substituted for progress, at the moment of reliance.
*Class:* Reveal — the direct cause of the certified failure.

**GAP 8 — Preparation does not exist as a thing**
*Ideal:* a first-class preparation with terminal outcomes. *Current:* no such object; readiness is a
derived boolean; the clock exists precisely because nothing else can say "this is over."
*Difference:* every pathology above is a workaround for this absence. *Class:* Runtime lifecycle —
**the root gap.**

**GAP 9 — Continuity is simulated by reconstruction**
*Ideal:* surfaces are retained. *Current:* rebuilt from a module cache — fast, invisible, still a
rebuild; lost on reload. *Difference:* the runtime is excellent at doing what it should not do.
*Class:* Runtime lifecycle.

**GAP 10 — Two URL authorities**
*Ideal:* one projection authority. *Current:* router and record layer both write history.
*Difference:* the address is negotiated rather than derived. *Class:* Ownership.

**GAP 11 — Instrumentation measures the machine**
*Ideal:* measure acknowledgment, Operational Commit, visible construction. *Current:* requests and
durations; the continuity test asserted "no blank frame" and **passed while the operator watched a
6.6 s skeleton**. *Difference:* **the runtime was verified against a contract that was not the
operator's.** *Class:* Instrumentation — **the reason this document exists.**

**GAP 12 — Attention movement has more than one mechanism**
*Ideal:* one event, one mechanism, all scopes (Article 2.3). *Current:* moving to a subject is
instant and continuous; moving to a surface is neither. *Difference:* the runtime has forked, and the
operator can feel the seam. *Class:* Architecture — **the Anti-Fork Rule violation.**

**GAP 13 — Configuration does not steer**
*Ideal:* which subject attention lands on is a business decision. *Current:* an unused strategy engine;
always the first row. *Class:* Composition.

## Article 7.3 — The Constitutional Transformations

The migration is not a list of code changes. It is a change of philosophy, from which the code follows
without discussion.

| | Today | Tomorrow |
|---|---|---|
| **The event** | Navigation is the event | **Attention movement is the event** |
| **Causality** | Navigation creates work | **Work creates navigation** |
| **Preparation** | Routes prepare surfaces | **Prepared surfaces produce routes** |
| **Reveal** | Loading determines reveal | **Operational Commit determines reveal** |
| **Authority** | Implementation owns experience | **Experience owns implementation** |
| **Readiness** | Components decide when they are ready | **The surface declares what ready means** |
| **Arbitration** | Time decides what the operator sees | **Truth decides what the operator sees** |
| **Continuity** | Continuity is simulated by caching | **Continuity is retained by design** |
| **Mechanism** | Each scope of movement has its own mechanism | **One event, one mechanism, every scope** |
| **Loading** | Each feature area solves loading its own way | **No feature area solves loading at all** |
| **Places** | Surfaces are destinations you go to | **Surfaces are contexts that are already there** |
| **Waiting** | The operator waits for the application | **The application waits for the operator** |
| **Measurement** | We measure the machine | **We measure the operator** |
| **Extension** | A new surface is engineered | **A new surface is declared** |

> Once these are true, the engineering is not debated — it is derived. **The patches are not fixed;
> they cease to have a reason to exist.**

## Article 7.4 — The previous experiment, judged

The Workspace↔Work Unit held exchange and its production certification are **evidence**. They are
judged solely against Part I, with no credit for existing.

| Decision | Verdict | Reason under this constitution |
|---|---|---|
| The runtime renders both surfaces so it can hold one | **Keep** | Article 3.4 — no surface may be destroyed before its successor is operational. |
| Stable, keyed surface slots (commit is not a rebuild) | **Keep** | Article 3.5 — retention, not reconstruction. Certified: 0 rebuilds. |
| Hold the outgoing surface until the destination is ready | **Keep** | Articles 1.4, Article 4.1 — this is *Transitioning*, and it was correct for 4.3 s. |
| Routes carry no surface | **Keep** | Article 2.4 — the URL is a projection. |
| Warm-return no longer re-asks for what it has | **Keep** | Article 4.4 — settlement discipline. |
| Intent taken from the URL changing | **Replace** | Article 4.2 — intent is the gesture. Taking it from the router *is* Gap 1. |
| Readiness discovered by polling the DOM | **Replace** | Article 4.6 — readiness is preparation's terminal outcome, not appearance. |
| **A 2.5 s clock commits the destination** | **Remove** | Article OC.4, Law 3. Constitutionally prohibited. Certified harm: 6.6 s of watching. |
| Workspace commits immediately, Work Unit does not | **Remove** | Articles 2.3, 3.3 — a second mechanism for moving attention; a surface owning transition rules. |
| A readiness attribute on the surface | **Modify** | Valid as diagnostics (5.7); invalid as the readiness channel. |
| A test asserting "no blank frame" | **Modify** | Article 4.7 — must assert `visible_construction_ms = 0` and `operational_commit_ms`. It passed while the operator suffered: a defective contract, not a defective test. |

> **The verdict:** the experiment's *anatomy* was right and its *nervous system* was wrong. It could
> hold a surface perfectly, and it held it for a runtime that had no idea when truth arrived — so a
> clock was given the final word. **The experiment did not fail. It proved that holding is not the
> problem, and that nothing downstream can be correct until preparation exists.**

## Article 7.5 — The order of realization

Each step is inevitable given the previous. **No step may begin while its predecessor is unproven.**

1. **Adopt the operator's contract as the measure.** Declare each surface's four contracts. Make
   `operational_commit_ms` and `visible_construction_ms` the acceptance criteria. Nothing is optimized
   yet — but the organization can now tell the truth about what it ships. *This is first because
   skipping it is exactly how a technically-correct implementation shipped a broken experience.*
2. **Answer in one place.** Compose each surface's Preparation Contract where the answers live, in one
   answer — including the business decision of which subject attention lands on. Gaps 2, 3, 4, 13 close
   as consequences.
3. **Prepare when attention moves.** Preparation becomes a real object: owned, keyed, shared,
   superseded, terminal — begun by the gesture. Gaps 1 and 8 (the root) close.
4. **Commit on truth; delete what the clock replaced.** The runtime commits on preparation's terminal
   outcome. **In the same change**, the clock, the DOM polling, and components' own fetching are
   removed — not deprecated, not flagged. Gaps 5, 6, 7 close.
5. **Settle everything else, explicitly, by name.**
6. **Generalize.** Every surface adopts the same lifecycle by declaring four contracts. One URL
   authority. One mechanism for attention at every scope. Gaps 9, 10, 12 close. **The runtime stops
   having interactions and starts having laws.**

### Why two runtimes never coexist

The old path for a surface is deleted **in the same change** that lands the new one for that surface.
Migration is *per surface*, never *per mechanism*. The reload floor is the only fallback, and it is
recovery — not a parallel runtime.

> **A flag that lets both live is how a migration becomes a permanent second runtime. It is
> prohibited.**

## Article 7.6 — Decisions requiring ratification

Product decisions. Not engineering's to make; the runtime cannot be built without them.

| # | Decision | Recommendation |
|---|---|---|
| **D-1** | **What is the Work Unit's Operational Contract?** *(It sizes everything.)* | The work is visible; the subject is committed; action is reachable. Card bodies, counts, and metrics settle. Evidence: the record layer already commits identity first and hydrates after — the fastest, best-liked interaction in the product. |
| **D-2** | **What is the operator told while valid truth is held?** | Acknowledge instantly; after ~600–800 ms say quietly that the destination is coming. **Never** show a destination that is not Operational (Article OC.4). |
| **D-3** | **Is a longer hold acceptable if it removes all construction?** | Yes in principle — though Step 2 should make the question moot. Ratify the principle, not the duration. |
| **D-4** | **Does configuration decide which subject attention lands on?** | Yes. A business decision; the engine exists and is unused. |
| **D-5** | **Is the URL a projection with one authority?** | Yes. Required by Articles 2.4 and 5.6. |
| **D-6** | **What are the operator budgets?** | Acknowledgment ≤ 50 ms always. `visible_construction_ms = 0` always. `operational_commit_ms`: warm ≈ immediate; cold ≈ one answer + render. Ratify in Step 1. |

## Article 7.7 — Risks

| Risk | Response |
|---|---|
| The single answer becomes a god-endpoint | Bounded *by definition* by the Preparation Contract's *nothing more* (Article 3.2.2). |
| Server composition merely relocates the waterfall | The chain becomes in-process with one authorization and batched reads. **Must be measured in Step 2 before Steps 3–4 depend on it.** |
| Preparing on attention storms the server | Preparation is keyed, shared, cancellable by law (Article 4.3). Intent-warming exists; it is promoted, not invented. |
| Holding longer feels unresponsive | D-2. Acute only if Step 2 fails. |
| Framework routing cost persists | Once the URL is a projection, routing is no longer in front of the operator. |
| Measurements inflated by this environment | True and stated. Every **structural** finding is latency-independent; re-baseline in Step 1. |
| The migration drifts into two runtimes | Prohibited by Article 7.5. |

---

# Ratification

On ratification, this document becomes the governing architecture of the Alloy Operating System.

- **The Universal Principle is the standard.** *The operator moves their attention. Alloy moves nothing
  else.* Every runtime decision is judged against it.
- **Part I is constitutional** and is expected to outlive every runtime Alloy builds. Layers 1–4 should
  not need to change because an implementation changed.
- **Attention is the fundamental event.** Navigation is one expression of it, and the operator must
  never meet it.
- **Operational Commit is the contract:** *the operator can continue working.*
- **Every surface declares four contracts** — Operational, Preparation, Retention, Settlement. No more.
  No less. A surface that needs new runtime is an amendment, not an exception.
- **Part II is evidence and consequence**, and will age. That is expected and correct.
- **Amendment, not exception.** A proposal that cannot be derived from Part I is either wrong, or this
  document must change first — in the open, on the record.

*Implementation begins only after ratification, and only as an expression of what is written above.*

---

## Amendment Record

The Constitution was reviewed adversarially before freeze
([Ratification Review](./runtime-constitution-ratification-review.md)). Two constitutional defects were
found and repaired. Both amendments are additive; neither weakened a principle; no architecture was
reopened.

| # | Defect found at ratification | Amendment applied | Articles touched |
|---|---|---|---|
| **A1** | **Art OC.4 Law 3 was over-absolute.** "Time may never change what the operator is shown" left a preparation that never terminates with no lawful resolution — the runtime was required to hold valid truth forever. The defect was proven: the first document derived from this Constitution invented `Tmax → Reload Floor` without constitutional authority. | Law 3 now prohibits **exactly one act** — showing a destination that is not Operational. Time may change what the operator is **told**, may **establish** a terminal `error`, and may trigger **recovery**. A **single runtime deadline** may produce `error` and nothing else; it may never produce `operational`. Art 4.5 gained the missing situation, and the deadline is owned by the runtime — never by a surface, component, or feature. | OC.4 · 4.5 · 4.6 |
| **A2** | **"The runtime has exactly one event" was incomplete.** Truth moves while attention is stationary (another operator's edit, a message, an automation, a webhook, an AI proposal) — and so does the operator's own act of completing work. Neither is an attention event; neither had a home. "Settlement" also carried two scopes (Art 3.2.4 broad, Art 4.4 narrow), so inbound truth could be read as both Settlement and not-Settlement. | Art 2.3 now scopes the single event to what **moves the operator**. Truth movement is governed by the new **Art 4.8 — Reconciliation**: one path (the server-authoritative change stream), one owner (the record layer), Settlement's visual laws, never a commit, never an attention move — therefore not a fork. Settlement is now explicitly **caused by commit** and bounded to the surface's own declared truth. **Operator mutation required no new event**: it is truth movement whose source is the operator, and the source's only privilege is optimistic display. | 2.3 · 2.5 · 3.2.4 · 4.4 · **4.8 (new)** · 4.6 |

**Adjudicated and deliberately not amended:** the Universal Principle's gloss lists "a value flipped"
among unconstitutional motions. Reconciliation (Art 4.8) updates values the operator did not move.
This is **not a contradiction**: "flips" is defined by Art 4.4 §5 as a *placeholder later flipping to a
different value* — Alloy inventing a value and then correcting itself. Reconciliation is not Alloy
moving something of its own accord; it is Alloy **declining to lie** about a world that moved.
Amending the Universal Principle to carve out reconciliation would weaken the single most important
sentence in this document to resolve an ambiguity its own operative articles already resolve.

**The Constitution is complete.** Future work belongs to the
[Engineering Specification](./runtime-realization-engineering-specification.md); runtime evolution
occurs through implementation and certification, not through constitutional change. **Further
amendment requires exceptional justification** — a fundamental change to what Alloy is, not a
difficulty encountered while building it.
