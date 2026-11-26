---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Planning — cross-domain validation

**Status:** Proposed — Iteration-3. The test the mission demands: *if a discovery does not naturally apply across Attendance, Staffing, Commercial, Billing, Capacity, Forecasting, Resource Management, and Operational Intelligence — it is Scheduling, not platform.* Here the [refined model](./operational-planning-runtime.md) is run against each domain.

The model under test (domain-neutral):

> An operator hits **pressure while operating** → **proposes a change** to that domain's live **reality** → **simulates** it via that domain's **registered Calculations** → **compares** → **decides** → **commits** (effective-dated superside). All in **Work**; none in Studio. The operator manipulates **reality**, not a plan.

---

## 1. The table

| Domain | Pressure (how it surfaces in Work) | Proposed change (to reality) | Simulate via (registered Calculations) | Commit target (L2 Intent / supersede) | Verdict |
|--------|-------------------------------------|------------------------------|-----------------------------------------|----------------------------------------|---------|
| **Scheduling** | "Thursday over ratio"; child unplaced | place/move child, set/adjust pattern | occupancy, ratio, capacity, fill (Room × Day) | `schedule_assignments`, `child_placements` | ✅ reference |
| **Attendance** | "child absent → room now under-covered"; transfer needed | today's coverage change, room transfer, pre-planned absence | projected ratio/occupancy for the day | (uses schedule intent; coverage decisions) | ✅ purest *reactive* case |
| **Staffing** | **"two teachers called in sick"** | float a teacher, split a room, shift assignment | required-staff vs on-hand, ratio, labor cost | shift assignments (Staff × Day) | ✅ **self-evidently Work, never Studio** |
| **Commercial** | "renewals down; should we change this rate/offering?" | propose a rate/offering change | projected revenue, retention, mix | commercial intent (offering/variant) | ✅ (more deliberate, still on live reality) |
| **Billing** | "family can't pay in full" | propose a discount / payment plan | projected balance, AR aging, subsidy | billing intent (plan/discount) | ✅ |
| **Capacity** | "waitlist growing; room X under-filled" | open/close a room, reserve seats, re-cohort | fill %, waitlist clearance, ratio headroom | capacity intent (Room × Term) | ✅ |
| **Forecasting** | *is the pressure source, not a planning act* | — (read-only projection forward) | fill/revenue/labor forecast from L3+L4 | — (feeds planning) | ✅ **surfaces** pressure |
| **Resource Mgmt** | "two rooms double-booked for the event" | reallocate rooms/resources | utilization, conflict count | resource-allocation intent | ✅ |
| **Operational Intelligence** | KPI/anomaly reveals a problem; explains a committed change | — (measures, explains) | metrics/KPIs over facts + committed changes | — (consumes commits) | ✅ **frames** pressure & **reads** outcome |

---

## 2. What the table proves

1. **The loop is universal.** Pressure → propose change → simulate → compare → decide → commit appears identically in every domain. The *content* differs (what a change is, which Calculations project it, what Intent it commits); the *runtime* does not. This is the platform.

2. **The placement is universal.** Every row resolves **in Work**, in the flow of operating. Not one domain wants the operator to leave for a design studio to resolve live pressure. This is the strongest cross-domain confirmation that **Planning ⊂ Work** (Iteration 3), not **Planning ⊂ Studio** (Iteration 2). Staffing makes it unarguable: nobody resolves a sick-call by opening a configuration studio.

3. **Reality-not-plans is universal.** In every row the operator is changing *that domain's reality* (the day's coverage, the room's fill, the family's balance) — never authoring a document. The "plan" is the receipt in all eight.

4. **Forecasting and OI define planning's edges.** Forecasting is the **pressure source** (it reveals the problem before it happens); OI **frames** the pressure (KPIs/anomalies) and **reads** the outcome (measures committed changes). Neither is planning; both are its neighbors. This clean separation is itself a cross-domain result — planning does not absorb them.

5. **The grain is per-domain *visualization*, not a universal Room × Day.** Scheduling shows Room × Day, Staffing Staff × Day, Capacity Room × Term, Billing per-family. Room × Day is Scheduling's projection view — **Scheduling-specific**. The domain-neutral object underneath is *proposed reality + change*.

---

## 3. Scheduling-specific vs platform (final separation)

| Reusable platform (extract) | Scheduling-specific (keep in the plugin) |
|-----------------------------|------------------------------------------|
| The pressure → propose → simulate → compare → decide → commit **runtime** | The Room × Day roster visualization |
| **Reality-as-object** mental model; the change/commit lifecycle | Placement cascade School→Program→Room→Schedule |
| **Woven resolution** ("Resolve" verb on any operational attention) | Ratio tiers, schedule patterns, operating windows |
| **Simulation** (project proposed reality via registered Calculations) | The occupancy/ratio cell renderer |
| **Multi-future comparison** ("Optimization") | Which Calculations to project, which Intent to commit |
| **Commit** (effective-dated supersede of L2 Intent) | The room/child/day vocabulary |
| The **Planning** proactive Work View pattern | The specific unplaced/forecast queues |

Everything in the left column recurred in all eight domains in §1. Everything in the right column is how Scheduling *fills in* the neutral runtime. That is the platform/product line, drawn by cross-domain evidence rather than assertion.

---

## Cross-references

- [`operational-planning-runtime.md`](./operational-planning-runtime.md) — the runtime, object, and placement this validates.
- [`platform-discoveries-and-roadmap.md`](./platform-discoveries-and-roadmap.md) — how the domains sequence into V3.
