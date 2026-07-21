---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling Focus Panel — the final composition (Identity · Work · Commands)

**Status:** Proposed — the final Focus Panel composition, and the close of Scheduling product discovery. It resolves the last ambiguity: **am I looking at the child, at work, or changing something?** These are three responsibilities and the panel must never blend them. This **refines the card model in [`scheduling-focus-panel-spec.md`](./scheduling-focus-panel-spec.md)** — where they differ on what the Summary card contains, this governs. The projection ([`scheduling-card-projection.md`](./scheduling-card-projection.md)), binding ([`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md)), and command model are unchanged.

---

## 0. The governing line

> **Identity is facts about the child. Operational work is analysis of the situation. Commands change truth.**

The clean cut that makes everything fall into place: **ratio, capacity, staffing, and health are about the *room and the day* — not about the child.** So they are never identity. A child's identity is their placement, pattern, dates, status, household, expected attendance, and tuition — the facts that are true about *them*.

When you open Ethan, you open **Ethan** — not Scheduling, not today's work, not a ratio problem. The panel answers, in order:

1. **What is true about Ethan?** (Identity)
2. **Why am I here today?** (Operational Work — only if there is any)
3. **What can I change?** (Commands — configured, launched deliberately)

---

## 1. Layer 1 — Identity (the Scheduling Summary card)

The permanent Scheduling card archetype. **Durable truth, nothing else.** No calculations, no recommendations, no ratio/staffing, no work, no command preview.

### Summary card — final anatomy

```
SCHEDULE                                  Scheduled
Sunshine · Toddler
Monday–Friday
Starts Jul 28 · open-ended
                                          View schedule →
```

- **Eyebrow + status word** — a durable *state*, never a judgment: `Scheduled` · `Needs a room` · `Change scheduled` · `Temporary` · `Ended`. (Not "Healthy" / "Conflict" — those are work, §2.)
- **Placement** — room · program (plain).
- **Pattern** — the days.
- **Effective dating** — always visible and obvious (§4).
- **One affordance** — `View schedule →` (expands to Detail). **No commands on the identity card**; changing is Layer 3.

### The identity states (all pure truth)

| State | Card reads |
|-------|-----------|
| **Scheduled** | `Sunshine · Toddler` / `Mon–Fri` / `Starts Jul 28 · open-ended` · **Scheduled** |
| **Needs a room** | `Toddler · full week` / `Mon–Fri` / `Starts Jul 28` · **Needs a room** |
| **Future committed change** | `Sunshine · Toddler` / `Mon–Fri` / `Moves to Rainbow on Aug 4` · **Change scheduled** |
| **Temporary** | `Sunshine · Toddler` / `Mon–Fri` / `Rainbow on Thursdays · Jul 24–Aug 15` · **Temporary** |
| **Future start** | `Sunshine · Toddler` / `Mon–Fri` / `Begins Aug 4` · **Starts Aug 4** |
| **Ended** | `was Sunshine · Toddler` / `Mon–Fri` / `Ended Jun 30` · **Ended** |

A **future *committed* change is identity** (it is a committed fact — shown via effective dating). A **proposed *(uncommitted)* change is work** (§2). That single distinction keeps identity honest.

### Detail card — identity, expanded (still not a work surface)

Expands identity only. Groups: **Placement · Schedule · Pattern · Effective dates · Expected attendance · Commercial outcome · Household (§3) · History.** Compact grouped rows ([`scheduling-focus-panel-spec.md`](./scheduling-focus-panel-spec.md) §4).

**Calculations appear only where they explain the current truth about *this child* — never because they exist.** So the Detail may show *the child's* expected attendance and *the child's* projected tuition (facts about Ethan). It does **not** show the *room's* ratio/occupancy/staffing analysis — that is situational work (§2), not Ethan's identity. History is the effective-dated timeline (read-only).

---

## 2. Layer 2 — Operational Work (a separate card, only when there is work)

The reasons you opened Ethan *today* are **not identity** — they are work happening because of Ethan. They live on the **existing Current Work / Needs Attention** primitive, **beneath** the identity card, and **only when they exist**. A healthy, placed child shows **no work card** — just identity.

This is where situation, calculation, recommendation, and the primary action live:

| Work item | Card (Needs Attention / Current Work) | Where the calculations go |
|-----------|----------------------------------------|---------------------------|
| **Needs placement** | *Needs a room · starts Monday.* `Place Ethan` | room fit, ratio, continuity — **here**, explaining the placement |
| **Start date approaching** | *Starts Monday — not yet scheduled.* `Place Ethan` | — |
| **Over ratio / conflict** | *Over ratio Thursday — Ava starts, 12 of 11.* `Fix Thursday` | occupancy/ratio — **here**, explaining the conflict |
| **Proposed change (pending)** | *Proposed: Sunflower → Sunshine.* `Review change` | before→after — **here**, in the review |
| **Pending review / parent-requested** | *Parent requested Tue/Thu.* `Review request` | — |
| **Future effective change** *(committed)* | — *(this is identity, §1)* | — |

**Rule:** the identity card **never** carries "12 of 11", "Healthy", "Two rooms fit", or a `Fix` button. All of that is the Work card. If Ethan has nothing needing attention, there is no situation line anywhere — his identity simply reads `Scheduled`.

This is the answer to *"why am I here?"* — separated from *"who is Ethan?"*.

---

## 3. Household (replacing scheduling-centric siblings)

Siblings are **household context**, not scheduling work. On the **Detail** (identity), a quiet section:

```
HOUSEHOLD
Ava    Rainbow · Tue/Thu      Open →
Noah   Sunshine · Mon–Fri     Open →
```

- It is framed as **Household**, not "Related schedules" — it is who Ethan lives with, shown with each child's schedule as context.
- The **active child always remains primary**; a row `Open →` swaps the subject to that child's identity card in the same panel; Back returns. Hidden for single-child households; unscheduled sibling shows `Needs a room`; different site is labeled.
- Sibling schedules exist **only to support context** (pickup, cohort) — never to replace the active subject, and continuity is a ranking input in *work/commands*, never a fact asserted on identity.

---

## 4. Effective dating — always visually obvious

Every schedule expresses its time-shape plainly on identity; **end dates are never hidden**:

| Shape | Reads |
|-------|-------|
| Open-ended | `Starts Jul 28 · open-ended` |
| Bounded | `Jul 28 – Aug 30` |
| Future start | `Begins Aug 4` |
| Future committed change | `Moves to Rainbow on Aug 4` |
| **Temporary** | `Rainbow on Thursdays · Jul 24–Aug 15` (with a **Temporary** status word) |
| Historical | on History: `Jun 30 · Ended` |
| Pending *(proposed)* | not on identity — it's a Work card (§2) |

---

## 5. Layer 3 — Commands (configured, deliberate, the only mutation path)

Changing schedule · room · pattern · start date · end date · temporary move all launch **configured commands** through the existing **Command Surface** — never embedded editing, never a form on the card. This is unchanged from [`scheduling-focus-panel-spec.md`](./scheduling-focus-panel-spec.md) §7–8 and validated:

- **Platform** owns capabilities, eligibility, preview, execution, write paths.
- **Configuration** owns which commands appear, where, order, labels, visibility, confirmation.
- **Scheduling** owns subject + context, rendering configured commands, and refreshing after commit.
- Commands carry states `Recommended / Ready / Warning / Blocked / Unavailable`; Blocked shows its reason.
- Commands are reached from the **Work card's action** (`Fix Thursday`, `Place Ethan`) or the **Detail's actions** (`Change schedule`, `Change room`, `End schedule`) — **not** from the identity Summary.

### Temporary move — represented as a distinct concept

The move command makes the *shape* explicit (never assumes schools move children): **one day · date range · weekdays · temporary assignment · permanent assignment** are different operations, chosen by the operator, policy-gated, calculation-aware, approval-aware, never silently recommended ([`temporary-move-policy-model.md`](./temporary-move-policy-model.md)). A **committed** temporary move then appears on **identity** as truth (`Rainbow on Thursdays · Jul 24–Aug 15 · Temporary`, §4).

### The one genuine Command-Surface extension to flag

Every Scheduling command expresses through the existing surface **except** the **temporary-move shape input** — a *"date range + weekday mask + return-to-primary"* input type. If the Command Surface cannot yet express that compound input, it is the **single** Scheduling-specific extension required ([`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) §7). Everything else — create/change/end/change-room/resolve — is expressible today.

---

## 6. The composition, top to bottom

```
Focus Panel · subject = Ethan · Work mode
┌───────────────────────────────────────────────┐
│  ① IDENTITY   Scheduling Summary card          │  ← who Ethan is (truth only)
│               → View schedule (Detail)          │
├───────────────────────────────────────────────┤
│  ② WORK       Needs Attention / Current Work    │  ← why I'm here today (only if any)
│               (situation · calc · action)       │     — absent for a healthy child
├───────────────────────────────────────────────┤
│  (context)    Enrollment · Attendance · Billing │  ← composed facts, read-only
└───────────────────────────────────────────────┘
       ③ COMMANDS launch from Work / Detail actions → Command Surface
```

- **Opened from the Roster** (a cell): subject = the child; **mission** = the cell that sent you; if the cell was flagged, the matching Work card is present, else just identity.
- **Opened from Enrollment**: subject = the child; identity reads `Needs a room`; the **Enrollment** context card confirms the executed agreement; a **Needs placement** Work card offers `Place Ethan`.
- **Opened from Scheduling Overview**: subject = the child/issue that was ranked; the relevant Work card leads under identity.

---

## 7. The product test — applied

For every screen: *opening Ethan, do I immediately understand who Ethan is, what his schedule is, why I'm here, and what I can safely change?*

- **Who / what schedule** → the identity Summary (five-second truth).
- **Why here** → the Work card (present only when there's work; carries the calculations).
- **What I can change** → configured commands from Work/Detail actions.

Any section that fails this test is removed. Under this composition, **nothing** on the identity card explains a problem, and **nothing** in work pretends to be identity.

---

## 8. What changed from the prior spec (the refinement)

| Before (Iteration 9) | Now (final) |
|----------------------|-------------|
| Summary carried a "situation line" (health, conflict, recommendation) | Summary is **identity only**; situation moves to the **Work card** |
| Status chip could read "Healthy" / "Conflict" | Status word is a durable **state** (Scheduled / Needs a room / Temporary / Change scheduled / Ended) |
| Calculations phrased on the card | Calculations appear **only** in Work, command preview, placement/conflict flows |
| "Related children" (scheduling-framed) | **Household** context (identity-adjacent, quiet) |
| Commands implied on Summary | Commands launch from **Work/Detail** actions only; identity has just `View schedule` |

---

## Cross-references

- [`scheduling-focus-panel-spec.md`](./scheduling-focus-panel-spec.md) — label↔value patterns, transitions, command config (still valid; card-model section refined here).
- [`scheduling-card-projection.md`](./scheduling-card-projection.md) — the read model (unchanged); identity fields vs work/calc fields already separable in the payload.
- [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) — §7 records the temporary-move-shape Command-Surface extension.
- [`mockups/scheduling-focus-panel-final.html`](./mockups/scheduling-focus-panel-final.html) — the final composition mockups.
