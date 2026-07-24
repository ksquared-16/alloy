---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# The Decision Loop — cross-domain validation

**Status:** Proposed — Iteration-4. The decisive test: the Decision Loop (Pressure → Understand → Generate → Compare → Choose → Commit → Truth) must hold across **Processing, Communications, Scheduling, Attendance, Commercial, Billing, Capacity, Forecasting, Operational Intelligence** — including the two *non-Scheduling certified workspaces* (Processing, Communications). If it only fits Scheduling, it is rejected.

Model under test (domain-neutral):

> Every operational domain **detects gaps** (its pressure), **generates resolutions**, **projects consequences** (Simulation), and **commits truth** — over one loop. **Pressure = a Gap** between Expectations and Facts. **Commit** is the decision→truth boundary. No new runtime; BOS assists but never commits.

---

## 1. The nine domains

| Domain | Pressure (the Gap) | Generate (candidate realities) | Compare (consequence) | Commit → Truth | Path | Verdict |
|--------|--------------------|-------------------------------|------------------------|----------------|------|---------|
| **Processing** | unclassified / incomplete inbound document (expected: classified & routed; fact: not) | classify · route · split · reject | which form/packet; downstream routing | document routed / record created | mostly **fast** | ✅ **non-Scheduling certified** |
| **Communications** | message unanswered past SLA (expected: replied; fact: no reply) | reply · template · route · schedule · close | SLA impact; which owner | message answered / task created | mostly **fast** | ✅ **non-Scheduling certified** |
| **Scheduling** | ratio breach; child unplaced | move · add staff · adjust pattern · delay | occupancy, ratio, labor, tuition (Room × Day) | `schedule_assignments` / `child_placements` | **full** | ✅ reference |
| **Attendance** | expected vs actual attendance diverges; room under-covered | transfer · cover · mark · correct | projected ratio for the day | attendance fact / coverage change | fast + **full** | ✅ |
| **Commercial** | offering/rate underperforms target | rate change · offering change · bundle | revenue, retention, mix | commercial intent | **full** | ✅ |
| **Billing** | balance unpaid / payment failed | payment plan · discount · retry · waive | balance, AR aging, subsidy | billing intent / charge | fast + **full** | ✅ |
| **Capacity** | fill vs target; waitlist pressure | open · close · reserve · re-cohort | fill %, waitlist clearance, ratio headroom | capacity intent (Room × Term) | **full** | ✅ |
| **Forecasting** | **projected** future gap (breach that hasn't happened) | — *(surfaces pressure; hands to a domain)* | projection is the output | — | — | ⭐ **pressure source, not a decision domain** |
| **Operational Intelligence** | KPI/anomaly vs target reveals a gap; reads outcomes | — *(frames pressure; measures results)* | KPIs over facts + committed decisions | — | — | ⭐ **pressure framer / outcome reader** |

---

## 2. What the table proves

1. **The loop is universal.** Seven domains run the identical Pressure → … → Commit loop. Only the *content* differs (gap-types, candidate moves, which Calculations project, which Intent commits). The *runtime* is one.

2. **It validates outside Scheduling — decisively.** **Processing** and **Communications** are Alloy's *already-certified, already-shipped* workspaces, and both fit the loop cleanly. That is the strongest possible evidence that the Decision Platform is not a Scheduling artifact: the two most mature non-Scheduling domains were *already* decision domains; we simply hadn't named them so. A digital-mailroom operator classifying a document and a scheduler resolving a ratio breach are **running the same loop at different depths.**

3. **Fast/full path is the only real variance.** Processing/Communications are mostly **fast path** (obvious resolution, one witnessed action) with occasional forks; Scheduling/Capacity/Commercial are often **full path** (genuine alternative realities). Same loop; the depth scales with decision difficulty. This is why one architecture serves a one-click classify and a multi-option placement.

4. **Forecasting and OI are the loop's neighbors, not members.** Forecasting is **early pressure detection** (gaps against projected facts). OI is **pressure framing + outcome measurement** (KPIs surface gaps; it reads the results of committed decisions). Neither decides; both make decisions better everywhere. This clean edge is itself a cross-domain result — the platform doesn't over-claim them.

5. **Pressure is the same object everywhere.** A ratio breach, an unpaid balance, and an unread message are one architectural thing — a Gap between the two ledgers — differing only along the taxonomy axes ([`operational-pressure-and-decision-loop.md`](./operational-pressure-and-decision-loop.md) §1.2). This is the reusable primitive that makes the platform a platform.

---

## 3. Platform vs domain (the final line, drawn by evidence)

| Reusable **Decision Platform** (recurred in ≥7 domains) | Per-domain (the plugin fills in) |
|--------------------------------------------------------|-----------------------------------|
| **Pressure** (Gap) detection + attention surfacing | which gap-types the domain detects |
| The **Decision Loop** (existing runtime) + fast/full path | which candidate moves are valid |
| **Simulation** (consequence projection via Calculations) | which Calculations project the domain |
| **Generate/Optimize** (search + BOS + rank) | the domain's objective |
| **Commit Boundary** (effective-dated truth) | which Intent/Fact ledger it commits |
| The **Resolve** verb; the **Focus Panel** decision surface; **BOS** assist | the domain's subject vocabulary & visualization (e.g. Room × Day) |

Everything on the left appeared across Processing, Communications, Scheduling, Attendance, Commercial, Billing, and Capacity. Everything on the right is how a domain *specializes* the neutral platform. **Scheduling is not the reference implementation of a scheduling product — it is the first domain that revealed the Decision Platform.**

---

## Cross-references

- [`operational-decision-platform.md`](./operational-decision-platform.md) — the apex.
- [`operational-pressure-and-decision-loop.md`](./operational-pressure-and-decision-loop.md) — pressure taxonomy + the loop.
- [`planning-cross-domain-validation.md`](./planning-cross-domain-validation.md) — the Iteration-3 (planning-only) precursor to this table.
