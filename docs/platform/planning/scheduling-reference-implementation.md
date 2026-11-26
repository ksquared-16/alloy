---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling — the reference Planning plugin

**Status:** Proposed — companion to [`operational-planning-platform.md`](./operational-planning-platform.md). Scheduling is the first complete expression of the Planning Runtime. This doc defines the Scheduling product, domain, planning, and workspace model — and separates what is **Scheduling-specific** from what is **reusable platform**.

---

## 1. What Scheduling is (and is not)

- Scheduling is **not a calendar**, not CRUD over schedules, not "assign children to rooms."
- Scheduling is **how an organization transforms enrollment intent into operational reality** — the Planning plane's first plugin, operating the `propose → simulate → optimize → commit` loop over the **Room × Day** grain.

It is the point where Enrollment, Placement, Staffing, Capacity, Ratios, Attendance, and Commercial consumption **converge into one planning experience**:

```
Enrollment → Placement → SCHEDULING → Attendance → Consumption → Billing → Intelligence
```

---

## 2. The substrate already exists (this is the gift)

Scheduling is uniquely ready to be the proving ground because its **entire operational backend is built** — only the Planning-plane surface is greenfield. Confirmed in code:

| Layer | Concept | Where it lives (built) |
|-------|---------|------------------------|
| **L1 Config** | Room = `locations` row (`location_type='unit'`, `parent_location_id`=site) | `locations`; RFC §7 "do not create a rooms table" |
| **L1 Config** | Ratio rules (stepped tiers), capacity rules (physical/licensed/operational), schedule rules, operating windows | `childcare_ratio_rules`+`_tiers`, `childcare_capacity_rules`, `childcare_schedule_rules`, `childcare_operating_windows` (migration `20260628120000`) |
| **L2 Intent** | Enrollment agreement → placement → schedule assignment; schedule patterns | `child_enrollment_agreements`, `child_placements`, `schedule_patterns`, `schedule_assignments` (migration `20260625120000`) |
| **L3 Projection** | **Expected occupancy by Room × Date**; expected staffing; expected-vs-actual | `aggregateExpectedOccupancyByRoomDate()` in `expectations/scheduleExpectationCore.ts`; `attendance/expectedVsActual.ts` |
| **L3 Projection** | Capacity truth (`availableNow = binding − committed − offered`), ratio (`requiredStaff`, `ratioConstrainedCapacity`) | `capacity/resolveOperationalCapacity.ts`, `capacity/resolveRatio.ts` |
| **L4 Facts** | Attendance events w/ room context + transfers (immutable) | `child_attendance_events` (migration `20260629120000`) |
| **L5 Consequences** | Consumption → resolved obligations → draft charges | `operationalConsumption/` (migrations `20260706–08`) |

**The Room × Day projection Scheduling plans against is literally already a function.** Scheduling the *plugin* is: read these read-models, let the operator draft deltas, simulate with these same resolvers, and commit to `schedule_assignments` / `child_placements`.

---

## 3. Grain validation — Room × Day

**Confirmed.** Room × Day is the correct planning grain because it is the **projection join key** every Scheduling projection already uses:

- `aggregateExpectedOccupancyByRoomDate` returns `{roomLocationId, date, childCount}` — Room × Date is the native shape.
- Capacity, ratio, fill, and staffing demand are all resolved *per room, per day*.
- Attendance facts carry `room_location_id` and `service_date` — the actuals key on Room × Day too, so plan-vs-actual reconciliation is same-key.

**Grain nuance (from the platform doc §6):** the **Plan** grain (a week for a room, a term for a child) is coarser than the **cell** grain (one Room × Day). The board renders cells; a Plan spans many. Staffing will plan on **Staff × Day**, Capacity on **Room × Term** — grain is per-plugin; the engine is grain-neutral.

---

## 4. Scheduling as a Planning plugin (the seven artifacts)

Filling the plugin contract from the platform doc §7:

| Artifact | Scheduling |
|----------|-----------|
| **Grain** | Room × Day (cell); plan spans a room-week or child-term |
| **Proposable deltas** | `place_child`, `move_child`, `set_schedule_pattern`, `adjust_days`, `assign_staff`†, `float_staff`†, `open_room_day`, `close_room_day` |
| **Projection set** | expected occupancy, binding capacity/availableNow, required staff/ratio, fill % |
| **Consequence set** | projected tuition/revenue (consumption preview), subsidy, labor cost† |
| **Constraint set** | ratio tiers, capacity ceilings (licensing is a binding ceiling overrides may only tighten), schedule validity, operating windows |
| **Commit target** | `schedule_assignments`, `child_placements` (effective-dated supersede) |
| **Optimization objectives** | ratio compliance, fill toward target, minimal labor, minimal conflict, continuity |

† **Staff supply is greenfield (G3).** Only staff *demand* (`requiredStaff`) is derived today; `staffedCapacity = null`, `staffOnHand` is a placeholder. Staffing deltas (`assign_staff`, `float_staff`) require net-new staff/shift/coverage modeling and are **V2+**, not MVP (see §8). MVP Scheduling optimizes children-to-rooms against *demand*, surfacing ratio gaps as conflicts without yet assigning staff to fill them.

---

## 5. Workspace architecture

Scheduling inherits the **Family A operational workspace shell** — `WorkspaceShell` with the **Work | Studio** model — which already **names Scheduling as an intended inheritor** (`web/components/workspace/WorkspaceShell.tsx`, `doctrine.ts`, `navigation-and-workspace-doctrine.md`). No new shell; no new aesthetic. It mounts inside `AdminV2WorkspaceBosModalShell` exactly like Processing/Communications/Work Items.

> **Iteration-3 correction (load-bearing, supersedes the Iteration-2 note).** Planning is **not** design-time and does **not** live in Studio. It begins with operational **pressure while operating on live reality**, so it lives in **Work** — woven into the queues and Focus Panel as the way an operator *resolves* pressure, plus a proactive **Planning** Work View. **Studio is config assets only** (patterns, rules, rooms, objectives). The Room × Day board is the **Roster** — one visualization of reality, that planning is *invoked from*. See [`operational-planning-runtime.md`](./operational-planning-runtime.md). The Iteration-2 "planning in Studio" framing below is retained struck-through for the record.

### 5.1 Work vs Studio (Iteration 3)

- **Work** answers *"How do I operate today?"* — Overview, operational **Work Views (queues)**, the **Roster** visualization, and the **Focus Panel**. **Planning is woven here**: from any point of pressure (a queue row, a roster cell, a forecast alert) the operator can **Resolve** — propose a change to reality → simulate → compare → commit — in place. A proactive **Planning** Work View handles deliberate forward work (the unplaced backlog, next term).
- **Studio** answers *"How do I design the rules?"* — the design-time environment for reusable **configuration assets** only: schedule **Patterns**, ratio/capacity/schedule **Rules**, **Rooms**, optimization **Objectives**. **No plans, no simulation, no board in Studio.**

Truth-flow mapping: **Work** both explores futures (Planning plane, read-only) and **commits** the chosen change (Operations-plane action → effective-dated L2 Intent). **Studio** authors L1 Configuration (Publish). Planning (Commit) and Authoring (Publish) are *siblings*, not nested — [`operational-planning-runtime.md`](./operational-planning-runtime.md) §8.

### 5.2 Sections

| Mode | Sections | Composed from |
|------|----------|---------------|
| **Work** | **Overview** · **Planning** · **Roster** (Room × Day) · **Attendance** · **Insights** | Overview landing · Work Views (`WorkspaceQueueRow`) · Focus Panel · **woven "Resolve"** on every surface |
| **Studio** | **Patterns** · **Rules** · **Rooms** · **Objectives** | config asset authoring (Publish) — no plans |

- **Overview (Work)** — action cards + Today's-activity tiles + info zones; answers *what needs resolving right now* (operational pressure). Same shape as Processing's Overview.
- **Planning (Work)** — the proactive doorway: current reality + the unplaced/forecast backlog; propose → simulate → compare → commit. The *dominant* planning expression is **woven** (the **Resolve** verb) into every other surface, not confined here.
- **Roster (Work)** — the Room × Day grid as **one visualization of reality**; planning is *invoked from* a cell, not built around the board.
- **Attendance / Insights (Work)** — the fact roster and the forecasting/OI surfaces that **surface pressure** feeding planning.

### 5.3 What is Scheduling-specific vs reusable — see [`planning-cross-domain-validation.md`](./planning-cross-domain-validation.md) §3

| Reusable platform (extract) | Scheduling-specific (keep) |
|-----------------------------|----------------------------|
| The Work shell, Overview, Work Views, Focus Panel, **woven Resolve** | Room × Day roster visualization (cell renderer) |
| The **pressure→propose→simulate→compare→decide→commit runtime**; **reality-as-object** | Placement cascade School→Program→Room→Schedule |
| Simulation, multi-future comparison, Commit (supersede) | Schedule patterns, ratio tiers, operating windows |
| The planning Focus Panel card; the proactive **Planning** Work View | The room/child/day domain vocabulary |

---

## 6. Cross-workspace convergence

Scheduling is where multiple systems meet, so it must move the operator *across* workspaces without losing context. The pattern (detailed in [`planning-focus-panel-evolution.md`](./planning-focus-panel-evolution.md)):

> *Cannot schedule child → Enrollment incomplete.* The board surfaces the block; the operator resolves it **in place** — an Enrollment planning card in the Focus Panel, or an embedded Enrollment work surface — then returns to the board with the plan intact. Planning never dead-ends into "go fix this elsewhere and start over."

This is the reusable **cross-workspace planning** behavior, discovered here and owned by the platform.

---

## 7. The operator story (Work → Studio → Work)

1. **Work · Overview** shows *3 children unplaced, Room Sunflower at ratio risk Thu, 2 plans awaiting commit* — action cards + Today's-activity tiles, exactly like Processing.
2. Operator opens the **Unplaced** Work View (a queue); a row → **Focus Panel** for the child, whose **planning card** says "no committed schedule."
3. From the card, operator enters **Studio** to design — the child is dropped onto the **Plan canvas** (Room × Day); **Simulation** projects the alternative reality; the Thursday ratio cliff shows as an inline conflict.
4. **Optimization** generates candidate **futures** (Room A / Room B / delay one day / add float†) as a Work View of futures; each carries its projected delta; operator **compares and decides** — never BOS.
5. Operator picks a future → the **Plan** moves `proposed → reviewed → approved`; **Commit** writes effective-dated `schedule_assignments`/`child_placements` via supersede; the outbox notifies queues.
6. Back in **Work**, the child leaves the *Unplaced* queue and the *Ratio risk* view clears — the committed reality now reflects the plan.
7. If Enrollment is incomplete, step 3 surfaces the block and offers to resolve it **in place** (Focus Panel card handoff / embedded surface), plan intact (§6).

---

## 8. MVP boundary for Scheduling

- **MVP (built on existing substrate):** Room × Day board over existing projections; place/move child + set/adjust pattern deltas; Simulation via existing resolvers; deterministic Optimization (children→rooms vs demand); Commit to `schedule_assignments`/`child_placements`; Conflicts as Simulation output.
- **Deferred:** staff supply/roster/float/coverage (G3 — net-new modeling); forecasted availability (Phase D); closures/holidays table (RFC §19 Phase C); BOS-assisted optimization tier.

Full roadmap in [`platform-discoveries-and-roadmap.md`](./platform-discoveries-and-roadmap.md).

---

## Cross-references

- [`operational-planning-platform.md`](./operational-planning-platform.md) — the runtime and plugin contract.
- [`../rfcs/location-operational-domain-convergence.md`](../rfcs/location-operational-domain-convergence.md) — the master domain RFC (entity model, ownership, capacity, ratio).
- [`../core/placement-system.md`](../core/placement-system.md) — placement cascade + committed foundation.
- [`../core/navigation-and-workspace-doctrine.md`](../core/navigation-and-workspace-doctrine.md) — Family-A shell, Work\|Studio, Overview.
- [`planning-focus-panel-evolution.md`](./planning-focus-panel-evolution.md) — the planning card and cross-workspace flows.
