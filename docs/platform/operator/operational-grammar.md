# Alloy Operational Grammar

**Status:** Foundational platform doctrine (June 2026). Conceptual foundation for the Alloy Card System — precedes the Card Library.
**Companions:** [`card-language.md`](./card-language.md) (how every card behaves) · [`card-archetypes.md`](./card-archetypes.md) (reusable operational building blocks)
**Related:** [`universal-card-system.md`](./universal-card-system.md) · [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) · [`focus-panel-architecture-vocabulary.md`](./focus-panel-architecture-vocabulary.md) · [`drawer-sunset-roadmap.md`](./drawer-sunset-roadmap.md)

> This is **platform** doctrine, not Enrollment doctrine. Enrollment is the first implementation. The Card Library defines individual cards; this document defines **why cards exist at all** and the operational language every workflow, module, card, surface, and Experience Builder configuration must follow.

---

## Why this exists

Traditional enterprise software is organized around **data** (Customer, Person, Invoice, Task, Document, Program, Room). The UI becomes a reflection of the database. Operators do not think this way. They do not ask "which record should I edit?" — they ask **operational questions**:

- Who is this family?
- Can this child start Monday?
- Why is this blocked?
- What needs my attention?
- What should happen next?
- Who owns this?
- What am I missing?

Alloy is designed around **operational questions**, not database records.

---

## Platform hierarchy

```
Business Process
   → Operational Context
     → Operational Question
       → Operational Grammar
         → Card Archetypes
           → Card Library
             → Surface Library
               → Experience Builder
                 → Published Operator Experience
```

Each layer simplifies the one below it. Business Processes create contexts. Contexts create questions. Questions determine which cards are required. Cards compose surfaces. Surfaces become operator experiences.

---

## Alloy Laws

- **Law #1 — Operators never operate on records.** Operators answer operational questions. Records are implementation; questions are experience.
- **Law #2 — Every card answers exactly one operational question.** Never two. If information does not help answer that question, it does not belong on that card.
- **Law #3 — Every operator interaction begins with intent, not data.** Intent ("enroll this child") immediately creates questions (Who? Ready? Missing anything? What next?). The operator should never think about records before answering those questions.

### Law #2 examples

| Card | Question |
|------|----------|
| Household | Who belongs to this household? |
| Current Work | What should happen next? |
| Readiness | Can this process move forward? |
| Timeline | What happened? |
| Documents | What information is available? |

---

## Operational Context

An Operational Context represents the situation an operator is currently working within (Enrollment, Attendance, Billing, Staff, Scheduling, Parent…). It determines: subject, operational question, available cards, available actions, permissions, and presentation depth.

**The Focus Panel is the primary presentation of an Operational Context.**

---

## Operational Question

Every context creates one or more Operational Questions with consistent structure:

| Property | Description |
|----------|-------------|
| Intent | Why the operator is here |
| Subject | Who/what the question concerns |
| Scope | Child, Family, Classroom, Site, Organization |
| Urgency | Informational, Actionable, Critical |
| Time Horizon | Past, Present, Future |
| Desired Outcome | What decision or action should result |

Example — *"Can Emma start Monday?"*: Intent = enrollment decision · Subject = Emma Johnson · Scope = enrollment · Urgency = high · Outcome = approve / delay / block / escalate. The cards shown are determined by this question.

---

## Operational Grammar

Operational Grammar is the language every operator experience speaks: operational questions, card archetypes, interaction patterns, editing patterns, navigation, composition. Every module (Enrollment, Attendance, Billing, Scheduling, POS, Staff, Parent Portal, Analytics) speaks the **same** language. Only the questions change.

---

## Operational Question Families

Questions group into cognitive families that become the basis for reusable Card Archetypes.

| Family | Purpose | Example cards |
|--------|---------|---------------|
| **Identity** | Who am I working with? | Household, Children, Contacts, Assignment, Staff, Organization |
| **Process** | Where are we? | Status, Enrollment, Program, Tour, Waitlist, Schedule |
| **Work** | Help me move forward | Current Work, Tasks, Required Information, Next Action |
| **Intelligence** | Help me think | Readiness, Attention, Health, Recommendations, Predictions |
| **Communication** | Help me communicate | Messages, Documents, Forms, Notes |
| **Financial** | Help me understand money | Billing Preview, Invoices, Payments, Credits, Discounts |
| **Activity** | Help me investigate | Timeline, Audit, History |
| **Metrics** | Help me measure | KPI, Trend, Benchmark, Score, Forecast |

---

## Cards are Answers

Cards are **not** containers, sections, forms, or records. **Cards are answers.** A card tells a coherent operational story.

Instead of listing fields (Phone, Email, Contact, Children), the Household card answers: *"Sarah Johnson is the primary contact. She prefers text messaging. Three children belong to this household. Two additional authorized pickups are available."* **Comprehension precedes interaction.**

> **A Card is:** the smallest complete operational unit that answers one operational question and can be independently composed onto any surface. Cards do not own information — they present it. Information belongs to canonical entities.

---

## Density

Cards do not change identity — they change **density**: Micro (queue) → Compact (summary) → Standard (work) → Expanded → Focused → Immersive (embedded workspace). A Household card remains the Household card regardless of density; only presentation changes.

---

## Subject Change vs Perspective Change

These are **different interaction primitives**. Confusing them breaks the card system.

### Perspective Change

Same Process · Same Operational Context · Same Subject · Same Operational Question.

Only presentation depth changes. Examples: Overview → Evidence → Focused Group → Edit.

- No loading
- No new Operational Context
- No route change
- No Focus Panel replacement

### Subject Change

Same Process · Same Focus Panel · **Different Subject** · **New Operational Context**.

Cards recompose around the new subject. Examples: Household → Child · Household → Primary Contact · Child → Parent · Billing Contact → Household.

- No new Focus Panel
- No drawer
- No page
- No separate operator surface
- The **Operational Context** changes; cards observe the new context

**Card law:** Cards answer one operational question. **Subject Changes change the operational question.** Perspective Changes do not.

> Household example: selecting Emma inside the Household card is **not** expanded Household evidence — it is a Subject Change. The Focus Panel recomposes around Emma; the Children card answers *"What is true about Emma right now?"* while Household still answers *"Who belongs together?"*

See [`card-language.md`](./card-language.md) § Subject Change and [`household-reference-card.md`](./household-reference-card.md) § Subject Change (Household).

---

## Focus Panel Modes (cognitive, not tabs)

| Mode | Operator question | Focus |
|------|-------------------|-------|
| **Summary** | Help me understand | Identity, context, health, status — fast comprehension |
| **Work** | Help me act | Editing, tasks, actions, required information |
| **Activity** | Help me investigate | Timeline, communications, documents, notes, audit |

---

## Search & AI

- **Search** does not open records — it **establishes an Operational Context** (current question, focused subject, card composition, focused card/item, editing behavior). Cards become the answer to the search.
- **AI / BOS** operates on Operational Questions, not cards/records/pages. The interface and the AI share the same abstraction and reason from the same question.

---

## Outcome

This document establishes the conceptual language of Alloy. The next document, [`card-language.md`](./card-language.md), defines how every card behaves. Only after both are complete does the platform define individual cards in the Card Library.
