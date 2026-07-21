---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Children ↔ Scheduling — the configuration boundary

**Status:** Proposed — the final composition correction, and the close of Scheduling product planning. It fixes the last uncertainty: the relationship between the **configurable Children card** and the **platform-owned Scheduling card**. They compose by **navigation, not embedding**; every responsibility has exactly one owner. Companion: [`schedule-lifecycle-and-object.md`](./schedule-lifecycle-and-object.md) (the schedule model this card presents).

---

## 0. The governing principle

> **The Children card is configuration. Scheduling is operational truth. Do not merge them. Do not duplicate them.**

This is a core Alloy distinction, not a Scheduling detail: **configuration controls configurable business surfaces; platform-owned operational domains remain first-class cards.** They relate by composition and navigation — never by nesting one inside the other. Getting this right here sets the pattern for every operational domain (Attendance, Billing, Staffing) that follows.

---

## 1. Two cards, two owners, one Focus Panel

Inside a child's Focus Panel (Work mode), the child subject carries **two peer cards** — plus operational work and context:

```
Child Focus Panel · subject = Ethan
  ┌─────────────────────────────────────────────┐
  │  CHILDREN card   — configurable (Surface Builder)          │  ← business identity
  │  SCHEDULING card — platform-owned (this program)           │  ← operational truth
  │  (Work card)     — operational work, when any              │
  │  (context)       — Attendance · Billing, read-only         │
  └─────────────────────────────────────────────┘
```

They are **siblings**, not parent/child. Neither is embedded in the other.

### 1a. Children card — configurable business surface

Configured through the existing **Surface Builder**. It owns **child identity + operator-configured child information** and nothing operational:

- **Configurable:** displayed child fields, ordering, sections, badges, custom fields, actions, layouts.
- **Belongs here:** name, date of birth, guardians/household links, enrollment status (as a field), custom tenant fields (allergies field, notes, tags), operator-configured badges.
- **Does NOT belong here:** schedules, room *assignment*, patterns, effective dates, rates, projected tuition, attendance history, conflicts. None of Scheduling is embedded or configured through the Children card.
- A tenant may configure a **read-only scheduling *badge*** on the Children card (e.g. `Scheduled` / `Needs a room`) — that is a Children-card badge reflecting a status, **not** the scheduling surface. The badge navigates to the Scheduling card; it never renders schedule detail.

### 1b. Scheduling card — platform-owned operational surface

The canonical scheduling surface. **Never configurable through the Children card.** It is platform-owned and identical across tenants (only its *commands* are configuration-driven via the Action Runtime — §4). It owns:

- current schedules · future schedules · proposed schedules
- effective dates · schedule lifecycle
- room assignments · schedule patterns
- attendance expectation · schedule rates · projected tuition
- schedule history · configured scheduling commands

Its structure, states, and calculations are platform doctrine ([`scheduling-focus-panel-composition.md`](./scheduling-focus-panel-composition.md)); a tenant cannot reshape it in Surface Builder.

---

## 2. Navigation — Children → Scheduling → change → return

The relationship is felt through navigation, and it must feel natural:

```
Children (list or card)  →  select Ethan  →  Ethan's Focus Panel
      → Scheduling card (peer)  →  review schedules  →  Change schedule (configured command)
      → preview → Commit  →  Scheduling card refreshes  →  return to Children
```

- From a **Children list/workspace**, selecting Ethan opens **his Focus Panel**, where the Children card and Scheduling card are both present. The operator moves to Scheduling by scrolling to / opening the Scheduling card — same panel, same subject, no page change.
- A **command** (Change schedule, Temporary move…) launches the Command Surface *inside the panel*, previews, commits, and refreshes the Scheduling card. The operator **returns to where they were** — the Children context is preserved throughout.
- **Neither card duplicates the other.** The Children card never shows schedule rows; the Scheduling card never shows configurable child fields. A scheduling badge on the Children card is a pointer, not a copy.

---

## 3. Configuration ownership table (one owner per capability)

The explicit table — no responsibility appears twice:

| Capability | Owner |
|-----------|-------|
| Child identity | **Children card** (configurable) |
| Child custom fields | **Children card** |
| Child display configuration (fields, order, sections, badges, layout) | **Children card** (Surface Builder) |
| Child-level configured actions | **Children card** |
| Current schedules | **Scheduling card** |
| Future schedules | **Scheduling card** |
| Proposed schedules | **Scheduling card** |
| Schedule patterns · daily times | **Scheduling card** |
| Room assignment (operational) | **Scheduling card** |
| Effective dates · schedule lifecycle | **Scheduling card** |
| Schedule rate | **Scheduling** (projection) |
| Projected recurring tuition | **Scheduling** (projection) |
| Attendance expectation | **Scheduling** (derived from schedule) |
| Billing ledger (invoices · balances · credits · payments) | **Billing** |
| Attendance history (actuals) | **Attendance** |
| Room health | **Scheduling workspace** |
| Operational conflicts | **Current Work** (Needs Attention) |
| Schedule commands (create/change/end/move…) | **Configured Action Runtime** |
| Family notification on a change | **Communications** |

**Read the seams:** Scheduling owns the *rate* and *projected tuition* (they are consequences of the schedule); **Billing** owns the *ledger* (invoices, balances, payments). Scheduling owns the *expected* attendance; **Attendance** owns the *actual*. The Children card owns *configured identity*; Scheduling owns *operational schedule truth*. No capability has two owners.

---

## 4. Commands remain configuration-driven

Scheduling **never hardcodes** Create schedule · Replace schedule · End schedule · Add future schedule · Temporary move · Change room · Review schedule · History. The Scheduling card **renders configured commands resolved from the existing Action Runtime** (platform owns capability/eligibility/preview/execution/write-path; configuration owns availability/placement/labels/visibility; Scheduling owns subject/context/refresh). **No Scheduling-specific mutation path bypasses configured commands** — every change goes through a registered command into the Command Surface, then an effective-dated write ([`scheduling-focus-panel-spec.md`](./scheduling-focus-panel-spec.md) §7–8, [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) §6). The one flagged capability gap remains the temporary-move shape input.

---

## 5. Why this closes it

- **Children stays fully configuration-driven** — Surface Builder shapes it; Scheduling never leaks in.
- **Scheduling stays platform-owned** — a first-class operational card, not a configurable field group.
- **Their interaction is obvious** — peer cards in one Focus Panel; navigation and composition, not embedding.
- **The pattern generalizes** — every future operational domain (Attendance, Billing, Staffing) is a platform-owned card beside the configurable Children card, related the same way.

---

## Cross-references

- [`schedule-lifecycle-and-object.md`](./schedule-lifecycle-and-object.md) — the multiple-schedule lifecycle, the schedule object, pattern editor, rates, and effective dating this card presents.
- [`scheduling-focus-panel-composition.md`](./scheduling-focus-panel-composition.md) — Identity / Work / Commands within the Scheduling card.
- [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) — every value's owner + the configured-command matrix.
- [`mockups/scheduling-children-composition.html`](./mockups/scheduling-children-composition.html) — the Children ↔ Scheduling navigation and the schedule surface.
