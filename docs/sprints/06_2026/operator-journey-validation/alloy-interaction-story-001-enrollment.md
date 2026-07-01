# Alloy Interaction Story 001 — Enrollment

**Type:** Storyboard / interaction validation. **Not** implementation, **not** architecture.
**Sprint:** Operator Journey Validation (June 2026).
**Precondition (met):** Operational Grammar · Card Language · Card Archetypes · Operational Context cutover · Household reference implementation · Subject Change doctrine · remaining archetype mocks.
**Doctrine under test:** [`operational-grammar.md`](../../../platform/operator/operational-grammar.md) · [`card-language.md`](../../../platform/operator/card-language.md) (§ Subject Change) · [`operational-context-boundary.md`](../../../platform/operator/operational-context-boundary.md).

> This storyboard validates **choreography**, not cards. The operator never experiences the Household card, the Children card, or the Readiness card individually. They experience **one Focus Panel** whose **Operational Context** recomposes cards as the subject changes, perspective changes, and work completes. The purpose is to pressure-test whether that motion feels like one operating system.

---

## Vocabulary (frozen — no new primitives introduced here)

| Term | Definition (frozen) |
|------|---------------------|
| **Perspective Change** | Same subject, same question, same context. Only presentation **depth** changes (Overview → Evidence → Focused → Edit). No load, no recompose of the card set. |
| **Subject Change** | Same Focus Panel, **different subject → new Operational Context**. The card set **recomposes** around the new subject. May resolve new truth. No drawer, no page, no new surface. |
| **Context Update (truth refresh)** | Same subject, same question, same context — but the **observed truth changes** (work completed, document uploaded). Cards that depend on the changed truth **recompose in place**. Not a Perspective Change, not a Subject Change. |
| **Operational Context changed?** | In the annotations below this means **did the subject/question change** (i.e. a Subject Change). Truth refreshes are called out separately as Context Update. |

Reading the frames: `▓` = card that visibly recomposed in this frame · `░` = card mounted, unchanged · `↑` = expanded/focused · the **Identity anchor** (household/subject name) never unmounts.

---

## Scene 1 — Open the queue, select Emma

**Operator sees:** Enrollment work queue (preview rows). Selects **Emma Johnson**. The Focus Panel composes for the first time around Emma's enrollment.

```
ENROLLMENT QUEUE                         FOCUS PANEL — Emma Johnson · Enrollment
┌───────────────────────────┐           ┌──────────────────────────────────────┐
│ • Emma Johnson   ▸ select  │  ─────▶   │ Question: Can Emma enroll?             │
│ • Noah Smith               │           │ ┌────────────┐ ┌────────────┐         │
│ • Ava Brown                │           │ │▓ Attention │ │▓ Current   │         │
└───────────────────────────┘           │ │  1 blocker │ │  Work  2   │         │
                                         │ ├────────────┤ ├────────────┤         │
                                         │ │▓ Readiness │ │▓ Household  │         │
                                         │ │  72%       │ │  Sarah +3  │         │
                                         │ ├────────────┤ ├────────────┤         │
                                         │ │▓ Children  │ │▓ Comms     │         │
                                         │ │  Emma…     │ │  reply owed│         │
                                         │ └────────────┘ └────────────┘         │
                                         └──────────────────────────────────────┘
```

**What changed:** queue selection establishes the first Operational Context; the Focus Panel composes the card set for "Can Emma enroll?".
**What stayed mounted:** nothing prior — this is the first composition.

| Annotation | Value |
|---|---|
| Perspective Change? | No |
| Subject Change? | No (first composition, not a *change*) |
| Operational Context changed? | Yes — context established |
| New network request? | **Yes** — compose Emma's Operational Context once (the only large load in the story) |
| Card recomposition | All cards compose: Attention, Current Work, Readiness, Household, Children, Communications |
| Animation | Panel **reveal** (queue recedes, panel composes via coordinated above-fold reveal — no per-card skeletons) |

---

## Scene 2 — Read Household (Overview)

**Operator sees:** Household card in **Overview** — `Sarah Johnson is the primary contact · 3 children`. Identity is understood instantly; nothing spins.

```
┌────────────── Household ──────────────┐
│ ⌂ Johnson Household                    │
│ Sarah Johnson is the primary contact   │
│   · 3 children                         │
│ [SJ] Sarah Johnson      Primary        │
│      (555) 123-4567 · prefers text     │
│ ⟨3 Children⟩ ⟨2 Emergency⟩ ⟨1 Pickup⟩  │
│ View household →                       │
└────────────────────────────────────────┘
```

**What changed:** nothing — the operator is reading already-composed truth.
**What stayed mounted:** the whole panel.

| Annotation | Value |
|---|---|
| Perspective Change? | No (resting at Overview) |
| Subject Change? | No |
| Operational Context changed? | No |
| New network request? | **No** |
| Card recomposition | None |
| Animation | None (static read) |

---

## Scene 3 — Expand Household (Perspective Change)

**Operator sees:** taps `View household →`. The Household body grows to show evidence groups (Primary contact · Other parent/guardian · Emergency · Authorized pickups · Children · Address · Billing). Same card, more depth.

```
┌────────────── Household ↑ ─────────────┐
│ ⌂ Johnson Household                     │
│ PRIMARY CONTACT            1 →          │
│   [SJ] Sarah Johnson  · (555) 123-4567  │
│ OTHER PARENT / GUARDIAN    1 →          │
│   [MJ] Michael Johnson · parent         │
│ EMERGENCY CONTACTS         2 →          │
│ AUTHORIZED PICKUPS         1 →          │
│ CHILDREN                   3 →          │
│ ADDRESS                    742 Evergreen │
│ Show less                               │
└─────────────────────────────────────────┘
```

**What changed:** only the Household body (Overview → Evidence). Other cards untouched.
**What stayed mounted:** everything; the Household identity anchor never moved.

| Annotation | Value |
|---|---|
| Perspective Change? | **Yes** (Overview → Evidence) |
| Subject Change? | No |
| Operational Context changed? | No |
| New network request? | **No** — observed truth already present |
| Card recomposition | None (one card changed *depth*, not the card set) |
| Animation | **Height grow + group fade-in** (≤200ms), in place |

---

## Scene 4 — Select Sarah (Subject Change)

**Operator sees:** taps **Sarah Johnson** inside Household. This is **not** expansion. The Operational Context changes to Sarah; the **entire Focus Panel recomposes** around her. Same Focus Panel — no drawer, no page.

```
BEFORE (subject: Emma)              AFTER (subject: Sarah — Subject Change)
┌───────────┐┌───────────┐         ┌───────────┐┌───────────┐
│░Attention ││░Current   │         │▓Household  ││▓Children  │
│░Readiness ││░Household  │  ───▶   │ Sarah's   ││ Emma,Liam,│
│░Children  ││░Comms      │         │ household ││ Noah      │
└───────────┘└───────────┘         ├───────────┤├───────────┤
                                    │▓Readiness ││▓Current   │
   Question: Can Emma enroll?       │ Sarah ctx ││ Work Sarah│
                                    ├───────────┤├───────────┤
                                    │▓Comms     ││▓Employee? │
                                    │ w/ Sarah  ││ (if linked)│
                                    └───────────┘└───────────┘
                                  Question: Who is Sarah, and what is her role?
```

**Demonstrated recomposition:**
- **Household** — now framed from Sarah's vantage (she is the subject, still the same household composition).
- **Children** — Emma, Liam, Noah shown as Sarah's children (belonging), still names/count.
- **Readiness** — recomputed for Sarah's context (e.g., contact completeness) rather than Emma's enrollment.
- **Current Work** — work items owned by / about Sarah.
- **Communications** — the thread with Sarah.
- **Employee card** — appears **only if** Sarah is linked to an Employee entity (derived, not a Household field).

| Annotation | Value |
|---|---|
| Perspective Change? | No |
| Subject Change? | **Yes** (Emma → Sarah) |
| Operational Context changed? | **Yes** — new subject, new question |
| New network request? | **Maybe** — Sarah's composed truth resolves if not already cached; observed-once, then cached |
| Card recomposition | **All** — Household, Children, Readiness, Current Work, Communications (+ Employee if derived) |
| Animation | **Recompose / crossfade** — cards reflow to the new context; Focus Panel frame persists (no panel replacement) |

---

## Scene 5 — Return to Emma (Subject Change back)

**Operator sees:** steps back to Emma. The context recomposes to Emma's enrollment. **No navigation, no new Focus Panel, no page.** Because Emma's context was observed-once in Scene 1, this is instant.

| Annotation | Value |
|---|---|
| Perspective Change? | No |
| Subject Change? | **Yes** (Sarah → Emma) |
| Operational Context changed? | **Yes** — back to "Can Emma enroll?" |
| New network request? | **No** — Emma's context cached from Scene 1 |
| Card recomposition | **All** recompose to Emma's context |
| Animation | **Recompose / crossfade** (same motion as Scene 4, reversed) |

---

## Scene 6 — Open Children (why this belongs here, not in Household)

**Operator sees:** subject is Emma. The operator focuses the **Children** card, which answers **"What is true about Emma right now?"** — Program · Room · Schedule · Enrollment status · Start date · Medical/Document flags. This is a **Perspective Change** on the already-composed Children card (Emma is already the subject).

```
┌────────── Children — Emma ↑ ──────────┐     WHY NOT HOUSEHOLD?
│ Emma Johnson           Enrolled        │     Household answers "who belongs?"
│ DOB / age   Mar 3 2020 · 6y            │       → Emma is a NAME there (belonging)
│ Program     Preschool                  │     Children answers "what's true for Emma?"
│ Room        Sunflower                  │       → program/room/schedule/medical
│ Schedule    M–F · Full day             │     Mixing them would make a card answer
│ Status      Enrolled · since Aug 26    │     TWO questions (violates Card Law #2).
│ ⚑ Immunizations current                │
│ ← All children                         │
└────────────────────────────────────────┘
```

**What changed:** the Children card body deepened (collection → focused child). No other card moved.

| Annotation | Value |
|---|---|
| Perspective Change? | **Yes** (Children: collection → focused child) |
| Subject Change? | No (Emma was already the subject) |
| Operational Context changed? | No |
| New network request? | **No** — child operational truth already in Emma's composed context |
| Card recomposition | None (one card changed depth) |
| Animation | **Crossfade / reveal** to single-child detail |

> **Doctrine check:** program/room/schedule/medical never appeared on Household. Household stayed belonging-only. Each card answered exactly one question. ✅

---

## Scene 7 — Complete Current Work (Context Update)

**Operator sees:** completes a task in **Current Work**. The task finishes; **Readiness** ticks up; **Timeline** gains an event. No manual refresh, no navigation. Same subject, same question — the **truth refreshed** and dependent cards recomposed in place.

```
Current Work ▓  "Confirm tour" ✓ done   → Readiness ▓ 72% → 80%
                                        → Timeline ▓ + "Tour confirmed · just now"
Household ░ (unchanged)   Children ░ (unchanged)
```

| Annotation | Value |
|---|---|
| Perspective Change? | No |
| Subject Change? | No |
| Operational Context changed? | No (same subject/question) — **truth refreshed** (Context Update) |
| New network request? | **Yes** — the mutation + revalidation of affected truth |
| Card recomposition | **Current Work, Readiness, Timeline** recompose; Household, Children unchanged |
| Animation | **In-place value change + count tick**; Timeline **row insert** (slide/fade) |

---

## Scene 8 — Upload a required document (Context Update)

**Operator sees:** uploads an immunization record. **Readiness** advances, **Attention** clears its blocker, **Current Work** drops the "request document" item. **Household remains unchanged** (documents are not a Household question).

```
BEFORE                              AFTER (truth refreshed)
Attention ▓ "1 blocker: immun."  → Attention ▓ "Clear"
Readiness ▓ 80% (blocked)        → Readiness ▓ 100% ready
Current Work ▓ "Request doc"     → Current Work ▓ "All caught up"
Household ░ unchanged            → Household ░ unchanged
```

| Annotation | Value |
|---|---|
| Perspective Change? | No |
| Subject Change? | No |
| Operational Context changed? | No (same subject/question) — **truth refreshed** (Context Update) |
| New network request? | **Yes** — upload + revalidate |
| Card recomposition | **Attention, Readiness, Current Work** recompose; **Household, Children unchanged** |
| Animation | Blocker **fade-out**; Readiness **gauge fill**; Current Work **row removal** |

> **Doctrine check:** the document changed only the cards whose question depends on documents. Household didn't flinch. Recomposition is scoped to affected truth. ✅

---

## Scene 9 — Search for Sarah (Subject Change via search)

**Operator sees:** uses search to jump to **Sarah**. Search **does not open a record** — it **establishes a new Operational Context** (Sarah). The Focus Panel recomposes exactly as in Scene 4. This frame exists to contrast the two motions:

```
PERSPECTIVE CHANGE (Scenes 3, 6)        SUBJECT CHANGE (Scenes 4, 5, 9)
same subject · same question            new subject · new question
one card changes depth                  whole card set recomposes
no load                                 observed-once (cache or resolve)
height grow / crossfade in one card     panel-wide recompose / crossfade
```

| Annotation | Value |
|---|---|
| Perspective Change? | No |
| Subject Change? | **Yes** (→ Sarah, via search) |
| Operational Context changed? | **Yes** — search establishes Sarah's context |
| New network request? | **Maybe** — resolve Sarah's context if not cached |
| Card recomposition | **All** recompose around Sarah |
| Animation | **Recompose / crossfade** (identical motion to Scene 4 — search and in-card selection produce the same primitive) |

---

## Scene 10 — Finish

**Operator sees:** closes out. Across ten scenes there were **no pages, no drawers, no lost context** — one Focus Panel, one continuous surface. Every change was either a Perspective Change (depth), a Subject Change (recompose), or a Context Update (truth refresh).

| Annotation | Value |
|---|---|
| Perspective Change? | No |
| Subject Change? | No |
| Operational Context changed? | No |
| New network request? | No |
| Card recomposition | None |
| Animation | Panel **recede** (calm exit) |

---

## Choreography ledger (whole story)

| Scene | Perspective? | Subject? | Context changed? | Network? | Recomposed |
|-------|:---:|:---:|:---:|:---:|------------|
| 1 Open + select Emma | No | No¹ | Yes (established) | Yes | All (compose) |
| 2 Read Household | No | No | No | No | None |
| 3 Expand Household | **Yes** | No | No | No | None (depth) |
| 4 Select Sarah | No | **Yes** | **Yes** | Maybe | All |
| 5 Return to Emma | No | **Yes** | **Yes** | No (cached) | All |
| 6 Open Children | **Yes** | No | No | No | None (depth) |
| 7 Complete work | No | No | No (truth refresh) | Yes | Work · Readiness · Timeline |
| 8 Upload document | No | No | No (truth refresh) | Yes | Attention · Readiness · Work |
| 9 Search Sarah | No | **Yes** | **Yes** | Maybe | All |
| 10 Finish | No | No | No | No | None |

¹ First composition, not a *change*.

**Three motions, nothing else:** Perspective Change (3, 6) · Subject Change (4, 5, 9) · Context Update (7, 8). No fourth motion was needed — the model held without inventing a new primitive.

---

## Pressure-test answers

**Does the operator ever feel lost?**
No. The Focus Panel frame and the subject's identity anchor are always present. Every motion has a clear cause (a tap, a search, a completed task) and a visible effect.

**Does any interaction still feel like old CRM navigation?**
No. There are no record pages, no drawers, no tab-hopping. "Opening" something deepens a card (Perspective) or recomposes the panel (Subject) — never a route.

**Are there unnecessary subject changes?**
No. The three Subject Changes (Sarah, back to Emma, search Sarah) each genuinely change the operational question. Reading Household evidence and child detail correctly stayed Perspective Changes.

**Are there unnecessary perspective changes?**
No. Expanding Household (Scene 3) and focusing a child (Scene 6) are the natural depth steps; neither could be an Overview-only read without losing the answer.

**Should any interaction become an embedded workspace instead?**
Not in this story. Document upload (Scene 8) is the closest candidate, but it resolved as a scoped action + truth refresh without a heavy editing surface. Reserve embedded workspace for genuinely multi-step authoring (bulk editing, complex forms) — none appeared here.

**Does any card answer more than one operational question?**
No. Household = "who belongs / who can I contact." Children = "what is true about this child." Readiness = "can this advance." The Scene 6 contrast confirms program/room/schedule stayed out of Household.

**Do the cards feel like one operating system?**
Yes. Identical chrome, identical density behavior, identical Perspective/Subject/Context-Update motions across every card. A change in one card uses the same grammar as a change in any other.

**Would a first-time operator understand what happened after every interaction?**
Yes — provided the **two recompose motions read differently**: a Perspective Change animates **one card in place** (height/crossfade), while a Subject Change animates the **whole panel** recomposing. As long as that visual distinction holds, intent is legible. (This is a presentation requirement, not a new primitive.)

**Does the choreography feel calm?**
Yes. One large load (Scene 1), cached returns, scoped truth refreshes, no spinners inside cards, no full-surface reloads. Motion is reorganization, not replacement.

**Would this still feel correct for Attendance, Billing, Scheduling, Staff — without changing the interaction model?**
Yes.
- **Attendance:** subject = child/room; Perspective = check-in detail; Subject Change = child → guardian; Context Update = check-in recomputes status.
- **Billing:** subject = household/account; Perspective = invoice line detail; Subject Change = invoice → payer; Context Update = payment posts → balance + readiness recompose.
- **Scheduling:** subject = child/staff; Perspective = shift detail; Subject Change = child → room; Context Update = booking confirms.
- **Staff:** subject = employee; Perspective = credential detail; Subject Change = employee → assigned room; Context Update = credential uploaded → readiness clears.
Same three motions, different questions. The model generalizes.

---

## Final recommendation

> **The interaction model is approved.**

No friction surfaced that requires an architecture or primitive change. The only condition attached is a **presentation** requirement already implied by doctrine: Perspective Change and Subject Change must animate **distinctly** (single-card in-place vs. panel-wide recompose) so operators can always tell which motion occurred. That is a styling/motion guideline, not a new primitive.

Per the sprint success criteria, with this storyboard approved: **architecture freezes, the interaction model freezes**, remaining archetype cards proceed to implementation, and Experience Builder integration begins. No further platform-level interaction primitives should be introduced.
