---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Schedule — lifecycle, object, pattern, rates & effective dating

**Status:** Proposed — the canonical schedule model the platform-owned Scheduling card presents. Companion to [`children-scheduling-boundary.md`](./children-scheduling-boundary.md). Built on the effective-dated `schedule_assignments` / `child_placements` foundation; **never overwrites committed schedules — every change is a new effective-dated version.**

> **Terminology + contract note.** The implementation contract is [`scheduling-projection-contract.md`](./scheduling-projection-contract.md) (subject-scoped, assignment-based). Two frozen terms this doc predates: the lifecycle bucket is **Upcoming** (not "Future" as written below); and rate/tuition are **determined by Billing** and merely displayed here (see [`billing-rate-resolution-contract.md`](./billing-rate-resolution-contract.md)). Where wording differs, those two docs govern.

---

## 1. A child has *many* schedules, over time

Challenge the one-schedule assumption. A child's Scheduling card presents a **timeline of schedules**, resolved by effective date:

| Kind | Meaning | Example |
|------|---------|---------|
| **Current** | active today (from ≤ today ≤ to, or open-ended) | Sunshine · Mon–Fri · from Jul 28 |
| **Future** | committed, starts later — there may be **several** | Rainbow · Mon–Fri · from Sep 2 (fall) |
| **Temporary** | a **bounded** entry (has an end), often overlaying the base for a window | Rainbow on Thursdays · Jul 24–Aug 15 |
| **Seasonal** | a future schedule bounded to a season | Summer half-day · Jun 15–Aug 30 |
| **Proposed** | uncommitted, under review — **not truth** | proposed Tue/Thu (parent request) |
| **Historical** | ended / superseded — kept in **History** | was Sunflower · ended Jun 30 |

**Resolution rule (the lifecycle):** at any given **date**, exactly **one** schedule resolves per day, choosing the most-specific effective entry (a temporary override wins over the base for its window/days; otherwise the base). Over **time**, the child has a *sequence* of effective-dated schedules — one current, zero-or-more future, zero-or-more temporary overlays, and a history. **Proposed** entries are held separately (write-free) until committed.

- **Split-weekday** schedules are **one** schedule with **per-day room/hour overrides** (§4) — not two concurrent schedules.
- A **temporary move** is a **bounded schedule entry** that supersedes the base on its days/dates, then the base resumes — no manual "move back."
- The Scheduling card shows **Current** prominently, **Future** and **Temporary** clearly labelled with their dates, **Proposed** as work (a review card), and **Historical** under History. This belongs to the **Scheduling card**; the **Children card never** expresses any of it.

---

## 2. The schedule object

Every schedule **belongs to exactly one child** and communicates its full shape:

```
Schedule {
  id
  childId                         // one child; a child has many schedules
  kind: 'base' | 'temporary' | 'future-change' | 'seasonal'
  standing: 'current' | 'future' | 'proposed' | 'ended'

  room: { id, name }              // default room
  pattern: { weekdays[], dailyTimes }   // default days + default in/out
  perDay?: [ { weekday, times?, room? } ]  // optional overrides (§4)

  effectiveFrom
  effectiveTo | openEnded: true
  temporary: bool                 // has a bounded window
  returnsTo?: scheduleId          // for a temporary override

  rate: { amount, unit } | 'pending'    // schedule rate (§5)
  projectedTuition: money | null        // consequence of the schedule (Scheduling projection)
  fundingApplies?: bool                 // subsidy/funding present (Billing owns amounts)

  supersedes?: scheduleId         // provenance to the version it replaced
}
```

- **Child, room, pattern, daily times, effective from/to, open-ended, current/future/proposed/ended, rate, projected tuition, temporary status, history** — all present, per the mission's object requirements.
- **One schedule → one child**, always; **not one schedule per child**.
- **History** is the effective-dated chain via `supersedes` — read-only, never overwritten.

---

## 3. Effective dating — always explicit, never omitted

Every schedule displays its time-shape plainly; **end dates are never hidden**:

| Shape | Displayed as |
|-------|--------------|
| Open-ended | `Starts Jul 28 · open-ended` |
| Bounded | `Jul 28 – Aug 30` |
| Future start | `Begins Aug 4` |
| Future change | `Moves to Rainbow on Sep 2` |
| Temporary | `Rainbow on Thursdays · Jul 24 – Aug 15` (badge **Temporary**) |
| Ended | `Ended Jun 30` |
| History | the effective-dated list under **History** |

**Changes create new effective-dated versions** (supersede-not-patch); committed schedules are never overwritten; history stays intact and inspectable.

---

## 4. Pattern editor — configure the minimum

The weekday selector matured into the canonical pattern editor. The operator sets **defaults once**, then **overrides only exceptions** — never editing every day.

```
DAYS         [M] [T] [W] [T] [F]  · S · S
DEFAULT      8:30 – 5:30   ·   Room Sunshine
OVERRIDES    Tuesday   9:30 – 5:30
             (add per-day time or room override)
EFFECTIVE    from Jul 28   ·   open-ended   ·   ☐ temporary (set end date)
```

Supports: weekday selection · default daily hours · optional per-day time overrides · default room · optional per-day room override (split weekdays) · effective from/to · open-ended · temporary (bounded). The editor lives in a **configured command** (Create / Change schedule) on the Command Surface — never an always-editable form on the card.

**Minimum-necessary rule:** most schedules are just *days + default hours + room*. Overrides are additive and rare; the editor defaults to the simple case and reveals overrides on demand.

---

## 5. Rates & projected tuition — Scheduling shows, Billing owns the ledger

The schedule **always displays its recurring rate** and **projected recurring tuition** — because tuition is a *consequence of the schedule*. **Billing remains authoritative for invoices, balances, credits, payments, and the ledger.**

| Question | Answer |
|----------|--------|
| **Where does the rate appear?** | On the schedule object / Scheduling card — e.g. `$980/month`, `$65/day`, or `Rate pending` when not yet resolved. |
| **Where does projected tuition appear?** | On the Scheduling card as a projection line (`Projected $980/month`) — a Scheduling **projection**, not a billing charge. |
| **When are rate changes previewed?** | Inside a change command: before→after tuition shown in the preview, so the operator sees the money impact before commit. |
| **How do future rate changes appear?** | As a **future-dated** rate on the future schedule (`From Sep 2: $1,040/month`), consistent with effective dating. |
| **How does subsidy / funding affect presentation?** | The card shows the schedule's projected tuition (gross) and **flags** that funding applies (`$980/mo · subsidy applies`); the **funded/net amounts are Billing's** — Scheduling defers to Billing for actuals and never asserts a net figure. |

Rate/tuition are **read** by Scheduling from the commercial model ([`scheduling-calculation-map.md`](./scheduling-calculation-map.md) #12); Scheduling never posts a charge or owns a balance.

---

## 6. Commands over the lifecycle (configured)

The lifecycle is operated through configured commands ([`children-scheduling-boundary.md`](./children-scheduling-boundary.md) §4): **Create schedule · Replace schedule · Add future schedule · Change room · Temporary move · End schedule · Review proposed · View History.** Each writes a new effective-dated version; none overwrites; all resolve from the Action Runtime, not hardcoded.

---

## 7. What this guarantees

- **Multiple schedules per child** are the norm, not the exception — current + future(s) + temporary + history, resolved per date.
- **Every schedule belongs to one child** and carries its full object (room · pattern · times · dates · rate · tuition · temporary · history).
- **Effective dating is complete and honest** — end dates never hidden, committed versions never overwritten.
- **Rates and projected tuition live in Scheduling** as consequences; **Billing owns the ledger.**
- **The pattern editor asks for the minimum** and expresses overrides, temporary, and open-ended cleanly.

---

## Cross-references

- [`children-scheduling-boundary.md`](./children-scheduling-boundary.md) — the Children ↔ Scheduling ownership boundary and card composition.
- [`scheduling-focus-panel-composition.md`](./scheduling-focus-panel-composition.md) — Identity / Work / Commands within the Scheduling card.
- [`scheduling-calculation-map.md`](./scheduling-calculation-map.md) — rate/tuition (#12), occupancy/ratio; the calculations behind the object.
- [`../core/placement-system.md`](../core/placement-system.md) — the effective-dated `child_placements` / `schedule_assignments` foundation.
