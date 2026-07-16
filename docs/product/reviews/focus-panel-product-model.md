---
owner: product
status: draft
last_reviewed: 2026-07-16
supersedes: []
---

# The Focus Panel Product Model

**Status:** Draft — Product Office artifact, pending Kelly's approval. Not doctrine until ratified.

**Purpose:** Define how an operator **experiences** Record of Truth, Record of Attention, and Context Frame *simultaneously*. The model (Canonical Interaction Model) says what exists. This says how it is lived.

**Method:** discovered, not invented. Every rule below is sourced to canonical doctrine. Where I add nothing, I say so.

**Not in scope:** Runtime, implementation, engineering.

---

## 0. The one sentence

> **"Operators do not experience separate drawer products. They experience one contextual record drawer that simultaneously holds Record of Truth, Record of Attention, and Context Frame."** — `canonical-interaction-model.md`

Everything below expands that. **The three are not layers and not a sequence — they are three coordinates of one open surface**, and the operator experiences them at once.

---

## 1. The anchor — what never moves

**The operator is always anchored to the Record of Truth, expressed as identity in the shell.**

> *"The **Focus Panel shell owns subject identity**. On a queue-row click the clicked-row seed becomes the visible subject **synchronously** — the shell header switches before any payload resolves. Cards hydrate after the shell commits… A slower or stale payload… can never change the visible subject identity. **Latest click always wins**."* — `focus-panel-architecture-vocabulary.md`

**Product rule:** identity is the one thing that is never pending, never late, never wrong. The operator must always be able to answer *"who am I looking at?"* before anything else resolves.

**What must never move:** the shell header, the mode control, and the operator's place in the queue.

> *"Opening a record opens the drawer **in place**. The workspace and queue page do not remount; the active perspective and queue selection persist. Closing the drawer returns the operator exactly where they were. **The operator must never feel they navigated to a separate 'record module.'**"* — Interaction Grammar, Law 7

---

## 2. The three coordinates, and what each one governs

| Coordinate | Operator-facing name | Answers | Governs the experience of… |
|---|---|---|---|
| **Record of Truth** | *(the record)* | *"Who/what is this, authoritatively?"* | **Identity.** The anchor. |
| **Record of Attention** | **Subject** | *"What am I actually working on?"* | **Scope.** May be **narrower** than Truth. |
| **Context Frame** | **Mission** | *"Why am I here right now?"* | **Lead.** What opens first. |

> *"The Context Frame does **not** change what the record *is*… The Context Frame changes **what leads** — which mode opens first and which cards surface — so the operator lands on the work they came to do."*

**This is the product's central economy:** one surface serves every domain because **Frame changes what leads, not what is.**

---

## 3. The layers the product actually wants

The proposed layering (Identity / Operational Context / Current Work / Supporting Context / History) is **not** what the product wants. The product does not stack vertically. **It composes by Mode.**

Canonical spine tail: **Drawer → Context Frame → Mode → Card → Section → Field**

| Mode | Purpose | Feel |
|---|---|---|
| **Summary** | Ambient understanding of the whole record | *"Business meaning first; reading, not editing"* |
| **Work** | Active operational work surfaces | *"Cards for the domains in play"* |
| **Activity** | History / timeline | *"Append-only record of facts"* |

**Mapping the proposed layers onto what exists — three of five already have homes, and none is a layer:**

| Proposed | What the product already calls it |
|---|---|
| Identity | **The shell** (owns subject identity) — the anchor, not a layer |
| Operational Context | **The composition itself** — Truth + Attention + Frame; not a band on screen |
| Current Work | **A card inside the Work mode** |
| Supporting Context | **Cards inside Summary** |
| History | **The Activity mode** |

**Discovery, stated plainly:** the Focus Panel does not separate into layers. It separates into **Modes**, and *"mode is not a tab and not a route."* The Context Frame decides which mode leads on open. **Adding a layer stack would add a concept the product does not have** — and the brief asked for fewer concepts, not more.

---

## 4. When each coordinate changes

| Change | Trigger | Cost to the operator |
|---|---|---|
| **Record of Truth** | She opens a **different authoritative entity** | The only routine load: *"**Only a new subject loads.**"* |
| **Record of Attention** | She changes **what she is working on** — including *within* the same Truth (Lennon → Emma) | **Recomposition. Not navigation.** |
| **Context Frame** | She arrives with a **different intent** — a different perspective/entry | *"Perspective and mode never load."* Re-leads only. |

### Can one change while the others stay constant? Yes — all three, and doctrine gives each example.

- **Frame changes, Truth constant.** *"The same Record of Truth opened from different perspectives presents a different Context Frame."* The Kurzman family from *Today's Tours* → Frame **Tour**. The same family from *Failed Payments* → Frame **Billing**. Same family. Different lead.
- **Attention changes, Truth constant.** Lennon → Emma inside the same household. Truth unchanged; scope moves.
- **Truth changes, Frame constant.** `Next` inside *Failed Payments* → a different family, still Frame **Billing**. *"`Next` traverses the operator's current view."* (Law 8)

**Product rule that follows:** *the cheapest change must feel the cheapest.* Frame re-leads, Attention recomposes, Truth loads. If changing Attention feels like navigation, the product has confused a scope change for a record change.

---

## 5. Pressure tests — the doctrine answers four of five in its own words

### 5.1 Enrollment — Lennon waitlisted, Emma enrolled

- **Record of Truth:** the Kurzman opportunity / family enrollment entity
- **Record of Attention:** **"Child enrollment context"** — Lennon's (doctrine's exact phrase for a Waitlist entry)
- **Context Frame:** **Waitlist**

**What she sees:** identity first (never pending). The Frame leads with Lennon's waitlist work, not raw fields. Summary gives *"who this family is, which child(ren), where they're trying to enroll, and what's missing — business meaning first."*

**Should Emma be visible? Yes — as context, never as attention.** Emma is inside the Record of Truth (the household) and outside the Record of Attention (Lennon's waitlist context). The doctrine is emphatic:

> *"The drawer does **not** flatten this into one household blob… The drawer makes the **active child and relationship scope explicit**."*
> **Forbidden:** *"Household-global authority assumptions across multiple children/guardians."*

**Clicking Emma: navigation, or a change of Record of Attention?** **A change of Record of Attention.** The Record of Truth does not move — same household, same case. The Frame shifts (Waitlist → Enrolled) because *why she's now here* changed. Nothing navigated. **Treating this as navigation would be the product forgetting a concept it owns.**

### 5.2 Payments — a failed payment

Doctrine, verbatim:

- **Record of Truth:** *"the family's billing account / financial entity"*
- **Record of Attention:** *"the family's **billing** context"*
- **Context Frame:** **Billing** — *"so the drawer leads with the Billing Setup / balance cards, not the tour"*

> *"It is **not** a different 'Billing Drawer product.' It is the same drawer, opened with a different intent."*

**Is the family the subject? The invoice? The payment? None of them.** The payment *framed* the entry; the **billing context** is the attention. The family is the Truth's owner and is visible as identity. The invoice and payment history are **cards** under the Billing frame — Work and Activity respectively.

**Sibling enrollment status?** **Only where financial authority actually spans both children.** *"Financial responsibility… child/relationship scoped, never assumed globally."*

### 5.3 Vacation Request — not in the table; the model generalizes without strain

- **Record of Truth:** the child's schedule / placement entity
- **Record of Attention:** the child's **schedule-and-absence** context
- **Context Frame:** **Vacation**

**Attendance? Yes** — the request *is* an attendance-affecting intent; it's the same context. **Schedule? Yes** — it is the Truth. **Billing? Only as consequence, never as attention** — Law 3 of the truth-flow doctrine: *"Financials derive from Facts."* Billing is downstream; it surfaces as a consequence card, not as the work. **Sibling? Only if the request spans them** — never assumed.

### 5.4 Scheduling — child, family, placement, room, schedule, without confusion

The doctrine already answers this, via multi-location:

> *"The drawer does **not** split into two drawers. It surfaces the **active location/operational context** for the card she's working, so she always knows **which child, which site, which schedule** she's acting on — one record experience, location made explicit."*

- **family** = Record of Truth (identity, in the shell — anchored)
- **child** = Record of Attention (the active child, explicit)
- **placement / room / schedule** = cards in **Work**, scoped to the active child

**It avoids confusion by never assuming.** Confusion comes from a household-global assumption, not from having five nouns on screen.

### 5.5 Attendance — marking one child absent

- **Record of Truth:** *"the child / attendance event entity"*
- **Record of Attention:** *"the **child-day attendance** context"*
- **Context Frame:** **Attendance** — *"the Attendance card leads"*

---

## 6. Where Current Work belongs

**Current Work belongs to the Record of Attention.**

- Not the **Record of Truth** — truth has no work. An entity does not "have a next action"; it has state and history.
- Not the **Context Frame** — the Frame says *why she came*, not *what she does*. The Frame decides Current Work **leads**; it is not Current Work.
- **The Record of Attention** — *"what the operator is currently working on."* Current Work is the operational execution **on** that. When she records an outcome, the Attention's work changes while Truth and Frame hold.

This also explains the nesting the product already ships: the panel has Modes (Summary / Work / Activity), and Current Work — *itself* carrying a **Summary → Focus** grammar (*"What is happening?"* / *"Help me do it"*) — sits as a card in **Work**. The panel's Summary answers *"what is happening to this record"*; Current Work's Summary answers *"what is happening to this work."* Same grammar, one level down. **This is reuse, not duplication** — but it is the one place the product asks the operator to hold two Summaries at once, and that deserves scrutiny in the UX audit.

**Consequence:** if the Record of Attention is the child and the panel renders the household, **Current Work is executing against the wrong coordinate.** That is not a grain bug; it is the panel dropping Attention and rendering Truth.

---

## 7. The Focus Panel Product Model — the five answers

**1. What is the operator always anchored to?**
The **Record of Truth**, as identity in the shell — synchronous, never pending, never overridden by a late payload. *Latest click always wins.*

**2. What changes as they work?**
**Current Work** (on the Record of Attention) and **Activity** (facts accrue). Truth, Attention, and Frame all hold. Working does not move her.

**3. What changes when they switch work?**
The **Record of Attention** — and the Frame may follow (Lennon/Waitlist → Emma/Enrolled). The Truth holds. **This is recomposition, not navigation.**

**4. What changes when they switch perspective?**
The **Context Frame** — *what leads*. Mode and cards re-lead. Truth and Attention can hold entirely. *"Perspective and mode never load."*

**5. What changes when they switch records?**
The **Record of Truth** — and only this is a load. *"Only a new subject loads."* Queue, perspective, filter, and sort persist; `Next` still follows her view.

---

## 8. What this model forbids

Carried directly from `operator-story.md` § *What this story forbids* — no additions:

- A "Billing Drawer," "Attendance Drawer," or "Person Drawer" as a **separate product/mental model**
- Losing queue/perspective context when diving into a record
- `Next` that ignores the operator's current filter/sort
- Editing that happens silently, or **raw fields before business meaning**
- **Household-global authority assumptions across multiple children/guardians**
- Fragmenting a multi-location household into separate drawers

**And one that follows from §4, stated as a question rather than a new law:** if a change of **Attention** costs the operator what a change of **Truth** costs, has the product collapsed two coordinates into one?

---

## 9. Concept count

**Added: zero.** Every rule is sourced. The proposed five-layer stack **reduces to structures the product already has** — a shell, three Modes, and cards. The Focus Panel does not need a layer model. It has a **Mode** model, and a Frame that decides which Mode leads.
