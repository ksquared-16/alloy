# Operator Story

**Status:** Canonical doctrine (June 2026). The **lived experience** of the [Canonical Interaction Model](./canonical-interaction-model.md) and [Interaction Grammar](./interaction-grammar.md). This is the narrative test: if a proposed surface or refactor breaks this story, it breaks the model.

This is doctrine expressed as a day-in-the-life, not implementation status. Where the runtime does not yet feel like this, see `./canonical-interaction-model.md` § Known UX alignment gaps.

---

## The story (Enrollment — reference implementation)

**A director starts the day.**

She opens her **Workspace**. She does not open a record, a report, or a "module" — she opens the place where her work lives. The workspace shows her business processes and what needs attention.

**She opens Enrollment.**

Enrollment is a business process, not a separate app. Its stages and queues are right there in the same workspace.

**She selects the "Today's Tours" perspective.**

The perspective is an operating lens — it filters and orders the enrollment records down to *the families touring today*, in the order she'll see them. It changes her lens; it doesn't change reality. The same records exist under "Waitlist" or "Needs Attention" — she's just looking through a different lens.

**She scans the queue and opens a family.**

Each **row** is a preview — enough to recognize the family and pick it. She clicks one. The **drawer** opens **in place** — the queue does not disappear, and she does not feel she navigated to a "family record module." She's still in Enrollment, still in Today's Tours, now with one family's detail open.

What the drawer carries:

- **Record of Truth:** the opportunity / family enrollment entity.
- **Record of Attention:** this family's *enrollment + tour* context.
- **Context Frame:** **Tour** — because she opened it from Today's Tours. The drawer leads with the tour, not with raw fields.

**She uses Summary, Work, and Activity.**

- **Summary** gives her ambient understanding: who this family is, which child(ren), where they're trying to enroll, and what's missing — business meaning first.
- **Work** holds the cards for the work in play: the **Tour** card, **Enrollment Readiness**, **Family**. She works here.
- **Activity** is the timeline of what's happened — calls, messages, status changes.

**She resolves missing info.**

The Enrollment Readiness card tells her *what's missing* (not just empty fields). She fills the gap with an explicit edit — editing is intentional; understanding was ambient. The change writes to the record; every card that observes that truth re-projects.

**She completes the tour.**

Completing the tour is an **action** — explicit operator intent, routed through the normal action/workflow path. It writes a fact; it doesn't silently mutate state.

**She moves to the Next family.**

`Next` follows **her current filtered, sorted queue** — the next family in Today's Tours, in her order. She never lost her place.

**She gets interrupted — billing.**

A failed-payment alert pulls her to a **Failed Payments** perspective. She opens a family from there. Same universal drawer. Same shell. But now:

- **Record of Truth:** the family's billing account / financial entity.
- **Record of Attention:** the family's *billing* context.
- **Context Frame:** **Billing** — so the drawer leads with the **Billing Setup** / balance cards, not the tour.

It is **not** a different "Billing Drawer product." It is the same drawer, opened with a different intent.

**She gets interrupted again — attendance.**

A **Missing Check-ins** perspective shows a child with no check-in. She opens it. Same drawer:

- **Record of Truth:** the child / attendance event entity.
- **Record of Attention:** the **child-day attendance** context.
- **Context Frame:** **Attendance** — the **Attendance** card leads.

**She returns to her tours — without losing context.**

She closes the interruption. She's back in Enrollment → Today's Tours, on the family she was working, queue intact, `Next` still meaningful. The interruptions didn't fork her flow; they were the same workspace, lens-shifted and back.

---

## Multi-child / multi-parent in the story

The family she opened has **two children** and **three adults**. The drawer does not flatten this into one household blob:

- One parent has pickup + financial authority for **both** children; a grandparent has pickup for **one** child only; an emergency contact has visibility but no pickup.
- The drawer makes the **active child and relationship scope explicit**. When she's on the Attendance card for the younger child, pickup authority shown is *that child's* scope — not a household-wide assumption.

Authority, visibility, pickup/contact permission, financial responsibility, and communication semantics are **child/relationship scoped**, never assumed globally (see `../core/record-system.md` § Relationship model).

---

## Multi-location in the story

The two children attend **different locations** — different sites, programs, rooms, and schedules. The drawer does **not** split into two drawers. It surfaces the **active location/operational context** for the card she's working, so she always knows *which child, which site, which schedule* she's acting on — one record experience, location made explicit (see `../core/placement-system.md`).

---

## The validation: same story, other domains

The model is sound only if the *same story* holds for Billing, Attendance, and Scheduling with **no new paradigm** — only different Context Frames and cards.

| Step | Enrollment (reference) | Billing (validation) | Attendance | Scheduling |
|------|------------------------|----------------------|------------|------------|
| Perspective | Today's Tours | Failed Payments | Missing Check-ins | Schedule Conflicts |
| Record of Attention | Family enrollment context | Family financial context | Child-day attendance | Child schedule context |
| Context Frame | Tour | Billing | Attendance | Schedule |
| Lead card (Work) | Tour / Enrollment Readiness | Billing Setup / Balance | Attendance | Schedule |
| Action | Complete tour | Record payment / retry | Mark present / correct | Set / adjust pattern |
| Next | Next tour (current order) | Next failed payment | Next missing check-in | Next conflict |
| Drawer | One universal shell | **Same** shell | **Same** shell | **Same** shell |

If any column needs a *different* drawer product, a *different* navigation spine, or a *different* mental model, the model has been violated — fix the surface, not the model.

---

## What this story forbids

- A "Billing Drawer," "Attendance Drawer," or "Person Drawer" as a **separate product/mental model**.
- Losing queue/perspective context when diving into a record.
- `Next` that ignores the operator's current filter/sort.
- Editing that happens silently, or a runtime that shows raw fields before business meaning.
- Household-global authority assumptions across multiple children/guardians.
- Fragmenting a multi-location household into separate drawers.

---

## Cross-references

| Concern | Doc |
|---------|-----|
| Primitive definitions | [`./canonical-interaction-model.md`](./canonical-interaction-model.md) |
| Interaction laws | [`./interaction-grammar.md`](./interaction-grammar.md) |
| Visual doctrine (look/feel; mockup bridge) | [`./alloy-visual-language.md`](./alloy-visual-language.md) |
| Runtime Specification (synthesis; implementation bridge) | [`./alloy-runtime-specification.md`](./alloy-runtime-specification.md) |
| Domains share one architecture | [`../core/operational-ux-doctrine.md`](../core/operational-ux-doctrine.md) |
| Relationship-scoped authority | [`../core/record-system.md`](../core/record-system.md) |
| Location-scoped context | [`../core/placement-system.md`](../core/placement-system.md) |
| Drawer architecture | [`./drawer-system.md`](./drawer-system.md) |

---

## When this doc must be updated

- The lived flow (open → work → interrupt → return) changes.
- A validation domain (Billing, Attendance, Scheduling) is shown to require a new paradigm.
- The multi-child / multi-location experience expectations change.
