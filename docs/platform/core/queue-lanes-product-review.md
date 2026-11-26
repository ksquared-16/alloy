---
title: Product review — do Queue Lanes still exist?
status: proposed
supersedes: []
---

# Verdict

**No. Queue Lanes are not a Product concept and should disappear.**

They answer no question an operator asks that the Work View does not already answer better. They are
the second of two systems describing the same thing, and the platform has been paying for that
duplication in queue, stage, pill, and Focus Panel defects. Every responsibility they hold has a
natural home. Nothing is orphaned.

**Queue Definitions do not survive either.** They are the document that exists to hold lanes.

Net effect: **Alloy loses two concepts and gains none.**

---

# Q1 — What the operator actually understands

The test: does an operator say this word, unprompted, about their own work?

| Concept | Operator says it? | Verdict |
|---|---|---|
| **Business Process** | "our enrollment process" | **Product** |
| **Stage** | "they're at Tour" | **Product** |
| **Status** | "that one's closed" | **Product** |
| **Work Unit** | "my Enrollment desk" | **Product** (the surface they go to) |
| **Work View** | "show me New Leads" | **Product** — and the one they name most |
| **Queue** | "my list" | **Product**, but only as *presentation* |
| **Focus Panel** | "the family I'm working" | **Product** (the place; the name is ours) |
| **Grain** | "families" vs "children" | **Product** (they say the nouns, not the word) |
| Queue Lane | never | **not Product** |
| Queue Definition | never | **not Product** |
| Operational Projection | never | **not Product** — Runtime mechanism |

Two of these deserve care:

- **Queue** is real, but it is *how work is shown*, not *which work*. Operators recognize and pick from
  a list; they do not author it.
- **Operational Projection** is not a Product concept even though it answers a Product question. The
  operator needs the *answer*; the evaluator is machinery. It stays, but as Runtime.

---

# Q2 — What question does each concept answer?

| Concept | Question |
|---|---|
| Business Process | "What kind of work do we do, and what positions does it have?" |
| Stage | "What process position is this record in **now**?" |
| Status | "What is our durable relationship with this record?" (open / closed) |
| Work Unit | "Where do I go to do this kind of work?" |
| **Work View** | **"What work do I want to see right now?"** |
| Operational Projection | "Which records satisfy the active Work View?" *(mechanism)* |
| Queue | "How is that work shown so I can recognize and pick?" |
| Focus Panel | "What am I working, and what can I do about it?" |
| **Queue Lane** | **— none —** |

Queue Lane's honest answer is *"which rows belong in this list?"* — which is **verbatim the Work View's
question**. Two concepts answering one question is the definition of the duplication being removed.

Its only other claim is grouping and sectioning — *presentation*, which it has no right to own either.

**A concept that answers no unique question should not exist.**

---

# Q3 — Can Queue Lanes disappear entirely?

Assume they do not exist. Everything is still producible:

| Product output | Produced from | Orphaned? |
|---|---|---|
| queue rows | Work View, evaluated | no |
| queue counts | the same evaluation, counted | no |
| default subject | Work View's declared strategy, over the same evaluation | no |
| Focus Panel eligibility | membership in the active Work View | no |
| Work View pills | one pill per Work View; its own count | no — **this is the pill's natural definition** |
| navigation | the Work View *is* the navigation tier | no |
| Operational Commit | Work Unit + active Work View + rows + subject + state + action | no |

**Yes. They disappear.** Notably, several of these get *better*: pills become "one pill per Work View,
counting that view" instead of "a badge counting a lane that a heuristic married to a view."

Their responsibilities re-home cleanly:

| Lane responsibility | Moves to | Why |
|---|---|---|
| row membership predicate | **Work View** | already its question; the view can express strictly more |
| sort | **Work View** | part of "what work do I want to see" |
| grouping | **Work View** | ordering *within* a view is the view's business |
| entity type | **Work View grain** | a view is single-grain (Q7) |
| bounded page / limit | **Runtime** | never authored — a delivery bound, not a product choice |
| row recognition fields | **Queue presentation** | how work is shown |
| sections (several lists on one surface) | **Work Unit composition** | see below |

The one responsibility that needs a real home is **sectioning** — "show New Leads *and* Needs Attention
on one surface." That is not a lane concept. It is the **Work Unit declaring which Work Views it hosts
and how they are arranged**. It moves up to the surface, where it always belonged.

---

# Q4 — Do Queue Definitions survive?

**No.** The Queue Definition is a container whose contents all belong elsewhere: lanes (deleted),
entity type (→ grain), sections (→ Work Unit composition), row preview (→ Queue presentation).

Remove the lanes and the document has nothing left that is its own.

It is therefore **not Product, not Configuration**. At most it survives invisibly as a **generated
Runtime artifact** — a compiled form of "this Work View, evaluated." If it exists, no human authors it,
no human reads it, and no product decision depends on it. That is the definition of an implementation
detail, and it should not be named in Product language.

---

# Q5 — Is Operational Projection the single evaluator?

**Yes** — for queue rows, counts, Work View pills, default subject, Focus Panel eligibility, and Runtime
provisioning.

The argument is not elegance, it is arithmetic: **two evaluators of one question will diverge.** The
platform is currently running three, and they have diverged exactly as predicted. One question, one
evaluator, one truth.

One distinction must be preserved: **same evaluator, different phase.** The ratified contract puts
counts and metrics in Settlement — they are produced by the same evaluation but must never gate the
operator's ability to work. That is a phase rule, not a second evaluator.

**Is any remaining predicate system justified?**

- For *operational membership*: **no**. One.
- For *analytics over time* ("how many leads did we take last quarter"): **yes** — that is a different
  question, over a different span, and may have its own machinery. The boundary is strict: **any number
  that claims to describe a Work View's current work must come from that Work View's evaluation.** A
  "Lead Count" on a Work Unit is not analytics; it is the view's own count.

---

# Q6 — Is Stage the sole durable owner of process position?

**Yes.**

- **Can queue membership ever be authored independently of Stage?** Membership may use other attributes
  — campus, program, room, urgency — but *process position* may only come from Stage. A Work View
  filters *on* Stage; it may never re-author what position means. Any membership rule that re-derives
  position is a second definition of Stage and is forbidden.
- **Can any status recreate Stage?** **No.** Status answers a different question — our durable
  relationship (open/closed). Position and relationship are orthogonal axes. Attempting to carry
  position in status is precisely what produced the current failure; when status collapsed, every
  position-scoped list lost its vocabulary. This is the cautionary tale, not a design option.
- **Can Queue Lanes own membership?** They do not exist.

**Stage is written by outcome execution and intake only.** Nothing else moves a record's position — not
a view, not a queue, not a display.

---

# Q7 — Grain

**Every Work View resolves to exactly one operational grain.**

The reason is not doctrinal tidiness — it is that a row *is* one thing. A list mixing families and
children is not a list; it is two lists sharing a border, and every downstream question ("what is
selected?", "what does this count?", "what can I do?") becomes ambiguous.

The apparent exceptions are implementation compromises, with one real Product need hiding among them:

| Today | Verdict |
|---|---|
| catch-all views bypass the grain rule | **compromise** — an "All" view must still declare a grain; needing both means two views |
| unscoped views span every grain | **compromise** — same |
| dual-grain counts ("3 Families · 5 Children") | **a real Product need, wrongly expressed** |

Operators genuinely think "3 families, 5 children." That is legitimate — but it is a *count*, not a row
set. The rule that preserves it without ambiguity:

> A Work View has exactly one **row** grain. Its rows, its default subject, and its Focus Panel subject
> are all that grain. It may report **supporting counts** of related entities as Settlement. A
> supporting count never becomes a row, a subject, or a second grain.

That keeps what operators need and removes what confuses the machine.

A prerequisite: Alloy currently uses **three vocabularies for this one idea**, in which "case" and
"family" are the same grain under two names. The rule cannot be enforced until there is **one grain
vocabulary**. This is itself a subtraction: three name-sets become one.

---

# Q8 — Focus Panel eligibility: Queue or Projection?

**Operational Projection.**

The Queue is *presentation*. If eligibility came from the Queue, then a display decision — page size,
truncation, sort, a collapsed section — would silently change **what the operator is allowed to open**.
Presentation would be editing truth. That is the wrong direction of authority in an operating system.

The subject must be a **member of the active Work View**. That is the projection's question.

One sharp distinction, easy to lose: **eligibility derives from the Work View's predicate, not from its
page.** A record can be a legitimate subject while not on the visible page. Tying eligibility to the
page is the same error as tying it to the Queue, one layer down.

---

# Q9 — Canonical Product Model

```
BUSINESS PROCESS          "what work we do, and its positions"
      │  defines Stages — each Stage declares a grain
      ▼
STAGE MEMBERSHIP          "what position is this record in now?"
      │  written only by outcome execution / intake
      ▼
WORK VIEW                 "what work do I want to see right now?"
      │  the operator's navigation tier
      │  predicate · sort · grouping · default subject · exactly one grain
      ▼
QUEUE PRESENTATION        "how is that work shown so I can recognize and pick?"
      ▼
FOCUS PANEL               "what am I working, and what can I do about it?"
      ▼
OPERATOR
```

Hosting: a **Work Unit** is the operational surface that hosts a set of Work Views and declares their
arrangement.
Orthogonal: **Status** — "what is our durable relationship with this record?" — never carries position.

**Concept count: 11 → 8.**
Removed: Queue Lane, Queue Definition. Demoted to Runtime: Operational Projection.

---

# Deliverables

### 1. Canonical Product Model
Above.

### 2. Current Product Model
```
Stages ──generate──► Queue Lanes ──► rows ──► pills
   │                      ▲
   │        bound by a positional heuristic
   │                      │
   └────► Work Views ─────┘ ──► a second evaluation ──► counts nobody reads
                              (and a third membership rule elsewhere)
```
Two authored predicate systems over one row set, married by position, plus a third rule. The operator's
named concept (Work View) does not control the list they see.

### 3. Concepts to Remove
- **Queue Lane** — answers no unique question.
- **Queue Definition** — exists only to hold lanes.
- **Two of three grain vocabularies** — one idea, one name-set.
- **Every membership rule except the Work View's** — one question, one evaluator.

### 4. Concepts to Generate
- The **compiled evaluation** of a Work View — unnamed in Product language, authored by no one.
- **Work View pills** — generated one-per-view from the view's own count.
- **Queue presentation** — generated from the view's grain and layout assignment.

### 5. Runtime implications (Q10)
Runtime Provisioning consumes the **Work View**. Not Stage — Stage is an input *to* the view's
predicate. Not Queue — that is presentation, downstream of the answer. Not Queue Lane — it no longer
exists.

**K2 begins where attention names a lens.** Preparation is keyed by
`(scope, target, lens, principal, tenant)`; it evaluates the projection **once** for the active Work
View and returns rows, default subject, and operational composition. Counts are produced by the same
evaluation but settle after commit.

This is not a change to the ratified Runtime — it is the Product model the Runtime was already written
against. The Kernel already keys preparation by lens. **The Runtime does not need to adapt; the Product
needs to stop contradicting it.**

### 6. Migration implications
- Work Views must gain what lanes were holding for them: **grouping**, **default subject strategy**, and
  an explicit **grain**.
- Work Unit surfaces must gain **composition** — which Work Views they host and how they are arranged.
- Grain vocabulary must unify **before** the one-grain rule can be enforced.
- Existing lane-authored intent must be read once, expressed as Work Views, and the lanes retired. Where
  a lane and its view already disagree, **the view wins** — it is what the operator named.
- Sequencing: unify grain → move responsibilities onto Work Views → single evaluator → delete lanes.
  Each step is a subtraction and is independently shippable.

### 7. Do Queue Lanes remain a Product concept?
**No.**

---

# One open Product decision

The Focus Panel currently always opens on the case, even from a child-grain row. Under the one-grain
rule, that is a grain violation — the operator picks a child and receives a family.

Either the panel opens the row's grain (the rule holds), or the case is genuinely the only workable
subject in Enrollment and **child-grain rows are a presentation of case work** (the rule holds, and
child-grain views are the thing that is wrong).

This is a real Product question about what enrollment work *is*. It cannot be settled by subtraction
alone, and it is the last thing standing between this model and implementation.
