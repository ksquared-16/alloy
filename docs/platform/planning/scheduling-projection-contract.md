---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# The canonical Scheduling projection — subject-scoped, assignment-based

**Status:** Proposed — the final Scheduling projection and the implementation contract. It closes Scheduling product discovery. **This is the one projection**; the child card projection ([`scheduling-card-projection.md`](./scheduling-card-projection.md)) and the roster projection ([`roster-projection-contract.md`](./roster-projection-contract.md)) are **indexes over it**, not separate models.

**The instruction that governs this doc:** *optimize for the data model, not the mockups.* One projection must power the Focus Panel, the Scheduling workspace, the Roster drill-down, the Command Surface, future printing, and BOS. If a screen seems to need a different projection, we fix the model — we do not duplicate data.

---

## 0. The two ideas that make it one model

1. **Scheduling projects the scheduling *state of the active subject* — not schedule records.** The Focus Panel owns the subject; Scheduling projects for it. When the subject is a **household**, the card answers *"how is this family scheduled?"*; when it is a **child**, *"how is this child scheduled?"* **The projection changes; the card does not.**

2. **There is one atom — the Assignment — and every surface is an index over it.**
   - by **child** → the Focus Panel Scheduling card
   - by **room × day** → the Roster and its drill-down
   - by **household** → the family view
   - filtered/aggregated → the Scheduling workspace (Overview, problems)
   - snapshotted → future print
   - narrated → BOS
   
   No surface owns its own schedule data. They all read assignments, indexed differently. This is what keeps the model canonical.

---

## 1. The Assignment (the effective-dated atom)

An **Assignment** is the atomic, effective-dated unit of scheduled reality — it maps to a `schedule_assignment` row over the committed `child_placements` foundation.

```
Assignment {
  id
  childId                    // one child
  room: { id, name, program }
  weekdays: [Mon..Sun]       // the days this assignment covers
  arriveTime, departTime     // daily hours
  effectiveFrom
  effectiveTo | openEnded
  kind: 'base' | 'temporary'
  supersedes?: assignmentId  // provenance; committed rows never overwritten
}
```

- **One room every day** → one assignment (Mon–Fri, one room).
- **Different rooms by weekday** → **multiple assignments** (Mon/Wed/Fri → Room A, Tue/Thu → Room B).
- **Different arrival/departure by day** → multiple assignments (or per-assignment times).
- **Temporary classroom change** → a **bounded** assignment (`kind:'temporary'`, has `effectiveTo`) that overrides on its days/window, then the base resumes.
- **Future change / successor** → an assignment with a later `effectiveFrom`.

Everything a child's schedule can be is a set of assignments over time. **Never assume one.**

> **V1 implementation note (times).** The slice-1 schema stores `weekdays` on `schedule_patterns` but **no per-assignment times**. In V1, `arriveTime`/`departTime` resolve to **`null`** (the card renders weekdays · room · effective dates). Per-day arrival/departure is a **small extension** (a times column on the assignment or pattern metadata) delivered with the Phase-2 pattern editor — engineering must **not** synthesize a time source. See [`SCHEDULING-IMPLEMENTATION-VALIDATION.md`](./SCHEDULING-IMPLEMENTATION-VALIDATION.md) §1/§14.

---

## 2. Schedule = a lifecycle grouping of assignments (operator-facing)

Operators think in *schedules*, not rows. A **Schedule** is the operator-facing grouping of a child's assignments by lifecycle status — a **projection view**, resolved from the atoms:

| Bucket | Definition (over assignments) | Rate line |
|--------|-------------------------------|-----------|
| **Current** | assignments effective today (one coherent arrangement; may be several assignments for split-week) | `$980/month` |
| **Upcoming** | assignments starting later (one or more future arrangements) | `$1,040/month beginning Sep 2` |
| **Temporary** | bounded assignments overlaying the base for a window | `— (part of current arrangement)` |
| **History** | ended / superseded assignments | on the History list |

**Terminology decision — Upcoming, not Future.** *Upcoming* communicates effective-dated scheduling to a director better than *Future* (which reads like a data state). Final lifecycle words the operator sees: **Current · Upcoming · Temporary · History** (with `Ended` a status inside History). A **Proposed** (uncommitted) change is **not** on this timeline — it is operational work ([`scheduling-focus-panel-composition.md`](./scheduling-focus-panel-composition.md) §2).

A `ScheduleView` bundles the assignments of one bucket plus its consequences:

```
ScheduleView {
  bucket: 'current' | 'upcoming' | 'temporary'
  effectiveFrom, effectiveTo | openEnded
  temporary: bool
  assignments: [ Assignment ]         // 1+ (split-week = several)
  rate: { amount, unit } | 'pending'  // schedule rate
  projectedTuition: money | null      // consequence of the schedule (Scheduling projection)
  fundingApplies?: bool               // subsidy present (Billing owns funded amount)
}
```

---

## 3. The canonical projection (the implementation contract)

Subject-scoped. `children[]` has **N** for a household, **1** for a child — the same shape.

```
SchedulingProjection {
  subject: { type: 'household' | 'child', id, name }
  asOf: date                          // resolution date (default today)
  children: [ ChildScheduling ]       // N (household) or 1 (child)
  calculationMeta: { computedAt, freshness, inputVersions, completeness, partialReasons[] }
}

ChildScheduling {
  child: { id, name, program, ageGroup, siteId, siteName }
  status: 'scheduled' | 'needs-placement' | 'upcoming-only' | 'ended'
  current:   ScheduleView | null      // null when needs-placement / ended
  upcoming:  ScheduleView[]           // 0+
  temporary: ScheduleView[]           // 0+
  history:   [ { effectiveFrom, effectiveTo, summary } ]   // read-only
  availableCommands: ConfiguredCommand[]   // resolved from the Action Runtime, never hardcoded
}
```

- **Household subject:** `children` = every child in the household; each `ChildScheduling` shows its own Current + Upcoming (+ Temporary), never flattened, never requiring a card switch.
- **Child subject:** `children` = `[that child]`; the full lifecycle for the one child.
- `availableCommands` is the projection's only "action" surface — the projection **provides context**; the Action Runtime **resolves the commands** (§6). Household actions apply to a child's row (commands are child-scoped).
- `calculationMeta` carries freshness/completeness so every consumer guards against stale/partial identically.

**Provenance & authority (unchanged):** every field derives from canonical entities + registered calculations; child-scoped; no second source of truth; committed rows never overwritten. Rate/projected tuition are Scheduling projections; **Billing owns the ledger** ([`schedule-lifecycle-and-object.md`](./schedule-lifecycle-and-object.md) §5).

---

## 4. Household presentation — "how is this family scheduled?"

The hypothesis is the correct hierarchy: **child → their schedule states**, compact, no flattening, no card-switch to understand the family.

```
SCHEDULE · Rivera household
Ethan     Current   Sunshine · Mon–Fri · 8:30–5:30 · from Jul 28 · $980/mo
          Upcoming  Rainbow · Mon–Thu · begins Sep 2 · $1,040/mo        History →
Ava       Current   Rainbow · Tue/Thu · open-ended · $460/mo            History →
Mia       Needs placement · starts Aug 12 · no valid room               Place →
```

- Each child is a section; **Current** always shown; **Upcoming**/**Temporary** shown when present; **History →** per child; **Needs placement** for unscheduled with its next action.
- The same Scheduling card renders this for a household and the single-child lifecycle for a child — because `children[]` is just longer.

---

## 5. Pattern editor — permanent home: a focused command, not the card

The Scheduling card is **read-first**; the **pattern editor lives in the Command Surface** as a focused scheduling command (Create schedule / Change schedule / Pattern change), appearing **only when intentionally editing**. It edits **assignments**: weekdays · default hours · optional per-day time/room overrides (which become additional assignments) · default room · effective dates · temporary. Configure the minimum; overrides are additive ([`schedule-lifecycle-and-object.md`](./schedule-lifecycle-and-object.md) §4). It never lives inside the card.

---

## 6. Commands validated against the projection

The projection supplies **subject + context + current/upcoming state**; commands resolve from the **Action Runtime** (configured, never hardcoded — [`children-scheduling-boundary.md`](./children-scheduling-boundary.md) §4). Validated against the new model:

| Command | Reads from projection | Writes |
|---------|----------------------|--------|
| Create schedule | child, needs-placement | new assignment(s) |
| Replace schedule | current | supersede current assignment(s) |
| Set end date | current | bound the current assignment |
| Add future schedule | current + upcoming | future-dated assignment(s) |
| Temporary schedule / move | current | bounded assignment |
| Change room | current assignment | supersede assignment (new room) |
| Pattern change | current assignments | supersede/add assignments |
| History | history | read-only |

Every write is a new effective-dated assignment; none overwrites; all through the Command Surface.

---

## 7. One projection, six surfaces (the anti-duplication proof)

| Surface | How it reads the projection |
|---------|-----------------------------|
| **Focus Panel Scheduling card** | render `children[]` (household: N; child: 1) — [`scheduling-card-projection.md`](./scheduling-card-projection.md) is the **child index** of this |
| **Scheduling workspace** (Overview, Place, Over-Ratio) | aggregate assignments across children/rooms; problems are calc-derived over the same atoms |
| **Roster drill-down** | index assignments **by room × day** — [`roster-projection-contract.md`](./roster-projection-contract.md) `RoomDayInspection.children[]` is the **room×day index** of the same assignments |
| **Command Surface** | `availableCommands` + the subject/current context; edits assignments |
| **Future print** | snapshot the assignment set (`RosterPrintProjection`) with "printed as of" |
| **BOS** | explains over projection fields + `calculationMeta`; injects nothing |

**If a surface appears to need a different projection, extend this model — do not duplicate.** The card projection and roster projection are hereby **reconciled as indexes** over the Assignment atom, not independent contracts.

---

## 8. Final deliverable checklist (this doc)

- **Household projection** — §3 (`children[]`=N), §4. · **Child projection** — §3 (`children[]`=1).
- **Schedule lifecycle** — §2 (Current · Upcoming · Temporary · History; Upcoming chosen over Future).
- **Schedule object** — §2 `ScheduleView` + §1 `Assignment` (room · pattern · hours · effective start/end · open-ended · rate · projected tuition · status · temporary · history).
- **Assignment model** — §1 (**one schedule, multiple assignments**; the assignment is the effective-dated atom).
- **Pattern editor placement** — §5 (Command Surface, focused command; card read-first).
- **Rate presentation** — §2 + [`schedule-lifecycle-and-object.md`](./schedule-lifecycle-and-object.md) §5 (Current `$980/mo`; Upcoming `$1,040/mo beginning Sep 2`; Scheduling owns rate/tuition, Billing owns ledger).
- **Projection contract** — §3 (canonical, subject-scoped, assignment-based).

---

## Cross-references

- [`children-scheduling-boundary.md`](./children-scheduling-boundary.md) — Children (config) vs Scheduling (platform) ownership.
- [`schedule-lifecycle-and-object.md`](./schedule-lifecycle-and-object.md) — lifecycle, object, pattern editor, rates.
- [`scheduling-card-projection.md`](./scheduling-card-projection.md) — the **child index** (now a view of this).
- [`roster-projection-contract.md`](./roster-projection-contract.md) — the **room×day index** (now a view of this).
- [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) — every value's canonical owner + maturity.
- [`mockups/scheduling-projection.html`](./mockups/scheduling-projection.html) — household ↔ child, lifecycle, assignments, rates, pattern editor.
