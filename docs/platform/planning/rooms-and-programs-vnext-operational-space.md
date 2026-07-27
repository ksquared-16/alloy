---
owner: platform
status: proposed
last_reviewed: 2026-07-25
supersedes: []
---

# Rooms & Programs VNext — Operational Space, Capacity & Program Architecture

**Status:** Product realization specification only. **Do not implement from this document until Kelly authorizes a build sprint.**

**Stance:** Design from how sophisticated childcare organizations operate. Assignments already own **who is committed**. This document defines the **environment** those commitments live in: space, offerings, capacity, ratios, eligibility, and operating windows.

**Ownership mantra (keep clean):**

| Question | Owner |
|----------|--------|
| Who is committed? | **Assignments** |
| Where can work occur? | **Rooms** (Operational Rooms) |
| What offering is being delivered? | **Programs** |
| What should happen / what binds? | **Operational Calculations** |

Ground vocabulary in existing Alloy doctrine (Location hierarchy, Delivery Resources, capacity kinds `physical` / `licensed` / `operational`, stepped ratio tiers, org→site→program→room inheritance) **without** freezing today’s storage shapes as the product model.

---

## 1. North star

Operators should be able to say:

1. This **physical classroom** can be split into two **operational rooms** before lunch and merge after.
2. **Infant East** owns today’s roster, ratios, and attendance — even though it shares walls with Infant West.
3. **Universal Pre-K** is a Program with eligibility and funding rules; rooms deliver it under site overrides.
4. Capacity warnings distinguish **licensed envelope** (building) from **operational binding** (how we’re running the room today).
5. BOS explains space decisions in operator language (“partition expires Friday”), not table names.

---

## 2. Canonical Room model

### 2.1 First-class concepts

| Concept | First-class? | Definition |
|---------|--------------|------------|
| **Physical Space** | **Yes** | Contiguous facility space with walls, sq ft, licensing envelope, fixed equipment, utilities. Site child in the Location hierarchy. |
| **Operational Room** | **Yes** | The unit of operational work: Assignments attach here; roster, attendance, staffing demand, and operational capacity bind here. |
| **Space Partition** | **Yes** | Effective-dated / time-windowed mapping: Physical Space ↔ one or more Operational Rooms (split / merge / share). |
| **Operating Window** | **Yes** | When an Operational Room is open for occupancy (days/hours; may differ from site hours). |
| **Closure** | **Yes** | Dated exception that removes availability (holiday, renovation, deep clean). |
| **Room Attributes** | Config bag | Age band preference, equipment tags, accessibility, notes — not separate engines. |
| **Default staffing intent** | Config hint | Preferred staffing pattern / role mix — **not** staff supply truth (Staffing owns supply). |
| **Preferred Programs** | Config link | Which Programs this Operational Room typically delivers. |
| **Seasonal / Temporary Operational Rooms** | Modes of Operational Room | Same object; lifecycle + windows distinguish seasonal vs temporary. |

**Not first-class engines (fold into the above):** “shared room product,” “merged room product,” “logical room table” as a third product — these are **partition modes** of Physical ↔ Operational mapping.

### 2.2 Physical Space vs Operational Room (recommendation)

**Alloy should distinguish Physical Space from Operational Room.**

| | Physical Space | Operational Room |
|--|----------------|------------------|
| Operator metaphor | Classroom / gym / playground area | “Infant East,” “Toddler AM,” “After Care Hub” |
| Owns | Walls, sq ft, licensed envelope contribution, fixed equipment, utilities, address/site placement | Assignments, roster, attendance subject, operational capacity rules, ratio rule application grain, staffing **demand** |
| Shares across children of partition | Yes | No (each logical room is independent operationally) |
| Appears on | Facilities / Locations Studio, licensing views | Scheduling Roster, Assignment Detail, Attendance, ratio boards |

**Example**

```text
Physical Space: Classroom A
  ├─ Operational Room: Infant East   (07:00–12:30)
  └─ Operational Room: Infant West   (07:00–12:30)
  └─ Operational Room: Classroom A Combined (12:30–18:00)  // merge window
```

### 2.3 Inheritance and utilization

| Question | Answer |
|----------|--------|
| Should logical rooms inherit from physical? | **Yes.** Defaults for sq ft share, licensing contribution, equipment, site, and attributes inherit from Physical Space; Operational Room may override operational capacity, ratio scope, programs, and hours. |
| Physical vs logical utilization? | **Yes, they differ.** Physical utilization = occupancy vs physical/licensed envelope of the space. Logical utilization = occupancy vs **operational / binding** capacity of each Operational Room. BOS must name which. |
| Can logical rooms change over time? | **Yes.** Effective-dated partitions and Operating Windows. History retained. |
| Partition one room into two part of day? | **Yes.** Time-windowed Space Partitions (morning split / afternoon merge). |
| Merge two logical rooms into one? | **Yes.** A Combined Operational Room active in a window; prior rooms closed or non-operating in that window. |
| How should BOS explain this? | Always speak **Physical Space** + **Operational Room** + **window**: e.g. “Classroom A is split into Infant East/West until 12:30; Combined starts at 12:30. Partition ends Friday.” |

### 2.4 Room capability inventory (classification)

| Capability | Class | Notes |
|------------|-------|-------|
| Physical rooms | Physical Space | First-class |
| Logical rooms | Operational Room | First-class |
| Split / merge / share | Space Partition | First-class mapping |
| Seasonal / temporary rooms | Operational Room lifecycle + windows | Not separate products |
| Operating hours | Operating Window on Operational Room (+ site default) | |
| Availability | Derived: windows − closures ∩ site | Calculations / projection |
| Closures | Closure records | First-class exceptions |
| Attributes / equipment / sq ft | Physical (primary); Operational may tag extras | |
| Licensing limits | Physical / Site authored → capacity kind `licensed` | |
| Capacity (operational) | Authored on Operational Room / inherited | Binding via Calculations |
| Ratios | Authored rules (scoped); applied via Calculations | See §6 |
| Age ranges | Preference on Operational Room; eligibility on Program | See §5 |
| Default staffing | Config hint on Operational Room | Staffing owns supply |
| Preferred programs | Links Operational Room ↔ Program | |

---

## 3. Room operations

### 3.1 Operating patterns operators need

| Pattern | Model |
|---------|--------|
| Morning Infants / Afternoon Toddlers in same physical classroom | Two Operating Windows on different Operational Rooms (or one room with program change + ratio window — prefer explicit rooms when roster/attendance split) |
| Seasonal Summer Camp in Classroom A | Seasonal Operational Room (or Program change on same room) with season window; prior school-year room superseded or closed |
| Shared occupancy (two programs, one space) | Shared partition: multiple Operational Rooms active; **shared capacity** policy on Physical Space (see §5) |
| Temporary closure | Closure on Physical Space and/or Operational Room |
| Room lifecycle | `planned → active → suspended → retired` with effective dating |

### 3.2 Operating-hours architecture

```text
Site operating days/hours          (default envelope)
  └─ Operational Room Operating Window  (may narrow; rarely widen beyond site without override permission)
       └─ Closure exceptions            (remove availability)
            └─ Availability projection  (for Roster, Assignment eligibility, BOS)
```

**Time-based configuration** (ratios, capacity, preferred program) attaches to **Operating Windows** or dated rule rows — not to anonymous “morning mode” flags without a window.

### 3.3 Room lifecycle

| State | Meaning |
|-------|---------|
| Planned | Exists for Upcoming Assignments / seasons; not yet receiving attendance |
| Active | Open for commitments and facts |
| Suspended | Temporarily unavailable (renovation); closures may cover short gaps |
| Retired | Historical only; no new Assignments |

---

## 4. Canonical Program model

Programs are **operational offerings** — what service is being delivered — not rooms and not schedule patterns.

### 4.1 Inventory

| Concern | Belongs to Programs? | Notes |
|---------|----------------------|-------|
| Program hierarchy (Infant → … → School Age) | **Yes** (catalog + optional parent) | Labels/presets may be vertical; structure is platform |
| Operating windows (term / season) | **Program + Site override** | When the offering is in session |
| Days / hours of operation | **Program defaults**; Site/Room may narrow | Distinct from Assignment pattern hours |
| Eligibility (age, funding, location) | **Yes** (see §5) | |
| Licensing constraints | **Program declares**; Site/Physical enforce | |
| Funding constraints (e.g. UPK) | **Yes** (eligibility + participation hints) | Billing/funding execution remains Billing |
| Location overrides | **Yes** — site assignment of program | Org publishes; Locations consume |
| Organization defaults | **Yes** | |
| Half Day / Full Day / 10 Hour | **Usually Schedule / Assignment pattern types**, not Programs | Unless the org sells them as distinct offerings — then Program Offering |

### 4.2 Hierarchy recommendation

```text
Organization Program Catalog
  └─ Program (identity: Infant, Toddler, Preschool, UPK, MDO, School Age, Summer Camp, …)
       └─ optional Program Offering variants (Half-Day UPK, Full-Day UPK) when commercially distinct
            └─ Site Program Availability (offered here / not offered)
                 └─ Operational Room preferred Programs
                      └─ Assignment.program (when set) must be eligible
```

**UPK / MDO / Summer Camp** are Programs (or Offerings), configured per tenant — not hardcoded platform identity.

### 4.3 What Programs must not own

- Room lists as source of truth
- Capacity or ratio numbers as runtime truth
- Assignment recurrence patterns
- Attendance facts

---

## 5. Age & eligibility architecture

### 5.1 Canonical eligibility dimensions

| Dimension | Typical owner |
|-----------|----------------|
| Minimum / maximum / recommended age | **Program** (required vs recommended distinguished) |
| Required age (hard gate) | **Program** → blocks Assignment / placement commands |
| Funding eligibility (UPK, subsidy) | **Program** + Funding/Billing eligibility services |
| Location eligibility | **Site Program Availability** |
| Room age preference | **Operational Room** (soft) vs Program required (hard) |

### 5.2 Boundary table

| Concern | Programs | Operational Calculations | Assignments |
|---------|----------|--------------------------|-------------|
| Age gates for offering | **Author** | May evaluate “eligible now” helpers | Must satisfy at commit time |
| Mixed-age ratio impact | Declares age band | **Applies** stepped tiers / mixed-age policy | Supplies subjects’ ages via identity |
| Funding eligibility | Declares participation | — | May display billing relationship only |
| “Child fits room” | Soft prefs on room | Ranks / warns in Place-a-Child | Primary Assignment room must pass hard gates |

**Rule:** Programs **declare** eligibility. Calculations **evaluate** fitness for decisions. Assignments **commit** only through commands that check eligibility — Assignments do not store a parallel eligibility engine.

---

## 6. Capacity architecture

### 6.1 Inventory and ownership

| Concept | Owner | Role |
|---------|-------|------|
| Physical capacity | **Physical Space** (authored) | Sq ft / beds / fixed limit |
| Licensed capacity | **Site / Physical Space** (authored) | Regulatory ceiling |
| Operational capacity | **Operational Room** (authored, scoped rules) | How we choose to run the room |
| Temporary capacity | **Effective-dated override** on Operational Room or Physical Space | Short-term tighten/relax per policy |
| Recommended capacity | **Config / policy** (soft) | Guidance; not binding |
| Future capacity | **Upcoming overrides + Horizon** | Authored future rules; projection shows impact |
| Shared capacity | **Physical Space policy** | How multiple Operational Rooms draw from one envelope |
| Logical capacity | Alias of Operational Room capacity | Prefer “operational” in product copy |
| Binding capacity | **Operational Calculations** | `min(applicable kinds)` + status |
| Remaining / available | **Operational Calculations** | Derived |
| Staffed capacity | **Calculations** (needs Staffing supply) | May be unknown until staff commitments exist |

Existing doctrine already names capacity kinds `physical` · `licensed` · `operational` and **binding** as the min. VNext **places** physical/licensed primarily on **Physical Space**, operational on **Operational Room**, and keeps binding in Calculations.

### 6.2 Shared capacity

When Infant East and Infant West share Classroom A:

- Each has operational capacity (e.g. 8 and 8).
- Physical/licensed envelope might be 12.
- **Shared capacity policy** on Physical Space: `independent` (ignore shared ceiling — rare), `pooled` (sum of logical cannot exceed physical/licensed), or `weighted`.
- Calculations emit both **per-Operational-Room** binding and **Physical Space** envelope utilization.

---

## 7. Ratio architecture

### 7.1 Inventory

| Concept | Authored where? | Applied by |
|---------|-----------------|------------|
| Age-based ratio tiers | Org/Site/Program/Room scoped rules | Calculations |
| Program ratio | Program-scoped rules | Calculations |
| Morning / afternoon ratio | Time-windowed rules on Operational Room or Site | Calculations for room×window |
| Temporary ratio | Effective-dated override | Calculations |
| Shared-room ratio | Mixed-age / pooled policy on Physical Space + room rules | Calculations |
| Required staff for N children | Derived | Calculations (`resource.required_staff`) |
| Staff on hand / supply | **Staffing / Assignments (staff)** | Facts + Calculations for compliance |

### 7.2 Boundary

| Belongs to Rooms? | Belongs to Calculations? | Belongs to Staffing? |
|-------------------|--------------------------|----------------------|
| Preferred age band, default program, which rule scopes apply | Applied ratio, required staff, ratio-limited capacity, limiting factor | Staff supply, shifts, who is present |

**Rooms do not “own ratios” as runtime truth.** They **host** which authored rules apply. Calculations own the applied result for a room×day×window.

---

## 8. Configuration hierarchy & overrides

```text
Platform defaults
  → Organization
       → Site (Location)
            → Program (availability + program-scoped values)
                 → Physical Space
                      → Operational Room
                           → Assignment (commitment; not a config layer)
```

| Layer | Publishes | Overrides |
|-------|-----------|-----------|
| Organization | Program catalog, default ratio/capacity rule templates, Assignment Types | — |
| Site | Programs offered, site hours, site licensed envelope, local rules | May tighten org defaults |
| Program | Eligibility, offering windows, program ratio scope | Site may narrow days/hours |
| Physical Space | Sq ft, equipment, licensed contribution, shared capacity policy | — |
| Operational Room | Operating windows, operational capacity, room ratio scope, preferred programs, closures | May tighten; widen requires permission |
| Assignment | Subject commitment to a room/program/pattern | Does not override capacity/ratio authorship |

**Most-specific-wins** for value inheritance; **availability** (is this Program offered here?) is a separate axis from **value** (what capacity number applies). Effective dating is orthogonal on every authored layer.

---

## 9. Assignment integration

| Assignment field / concern | Room/Program interaction |
|----------------------------|--------------------------|
| `room` on Assignment | Must reference an **Operational Room** (not Physical Space alone) |
| Primary Assignment | Defines operational home room for attendance/ratios “home” |
| Concurrent companions | May use different Operational Rooms (Before Care hub vs Primary classroom) |
| Upcoming room change | Future Primary Assignment or `set_primary` with future effective date |
| Program on Assignment | Must be site-available and age/funding eligible |
| Temporary Assignment | May target a temporary Operational Room or overlay in an existing room |
| Day Timeline | Segments labeled by Operational Room |
| Horizon Timeline | Shows room/program transitions over time |
| Conflict hard | Binding capacity / Primary rules from Calculations + room availability |

**Compatibility:** Today’s `locations` `unit` rows and `child_placements` home-room remain the migration substrate. VNext product language is Physical Space / Operational Room even if early storage collapses them 1:1.

---

## 10. Operational Workspace impacts

| Surface | Impact (design) |
|---------|-----------------|
| Scheduling Roster | Rows = Operational Rooms; optional Physical Space grouping header |
| Overview attention | Capacity / partition / closure counts from projections |
| Place-a-Child | Options ranked by Operational Room fitness + Physical envelope |
| Over Ratio | Cause-first; name room window and binding factor |
| Locations Studio | Author Physical Spaces, partitions, Operational Rooms, windows |
| Programs Studio | Catalog + eligibility; site availability |
| Attendance | Scoped to Operational Room |
| Assignment Summary/Detail | Show Operational Room; Physical Space as secondary context when split/merge matters |
| Staffing (future) | Demand from Operational Room calcs; supply separate |

**Do not redesign Workspace chrome** as a prerequisite — consume richer room/program models inside existing shells.

---

## 11. BOS recommendation inventory

| Recommendation | Signal | Action posture |
|----------------|--------|----------------|
| Room reaches capacity next month | Horizon occupancy vs binding | Propose hold / open companion room / adjust Upcoming |
| Split room no longer balanced | East/West occupancy skew | Propose rebalance or merge review |
| UPK begins in three weeks | Program operating window | Propose room prep + eligible child list |
| Five children eligible for transition | Program eligibility + Transition Plans | Hand off to Assignment Horizon / Attention |
| Physical room overutilized | Envelope utilization high | Warn; propose partition change or capacity policy |
| Logical room underutilized | Operational utilization low | Propose merge window or move Assignments |
| Merged room should be reviewed | Combined window + ratio stress | Propose split or staffing change |
| Temporary partition expires Friday | Partition end date | Propose confirm merge/split or extend |

All mutations via Action Runtime preview/confirm. BOS explains using **Physical Space / Operational Room / window** language.

---

## 12. Future extensibility roadmap (design phases)

| Phase | Outcome |
|-------|---------|
| **R0** | Product language + 1:1 Physical≡Operational compatibility (no split UX yet) |
| **R1** | Explicit Physical Space vs Operational Room in Locations Studio; partitions dated all-day |
| **R2** | Time-windowed split/merge; Roster + Assignment Timeline show windows |
| **R3** | Shared capacity policies; dual utilization (physical vs logical) in BOS/Overview |
| **R4** | Program eligibility engine unified; funding/UPK gates in commands |
| **R5** | Seasonal Operational Rooms + closures as first-class Workspace attention |
| **Later** | Multi-site physical campus graphs; equipment as bookable resources |

---

## 13. Answers (compact)

| Question | Answer |
|----------|--------|
| Distinguish Physical vs Operational Room? | **Yes.** |
| Logical inherit from physical? | **Yes** (defaults); operational overrides allowed. |
| Utilization differ? | **Yes** — envelope vs operational binding. |
| Logical change over time? | **Yes** — effective-dated partitions/windows. |
| Partition part of day? | **Yes** — time-windowed Space Partitions. |
| Merge logical rooms? | **Yes** — Combined Operational Room in a window. |
| BOS explanation? | Always name Physical Space, Operational Room(s), and window. |
| Capacity ownership? | Authored on Physical/Operational; **binding** in Calculations. |
| Ratio ownership? | Authored rules scoped to hierarchy; **applied** in Calculations; supply in Staffing. |
| Eligibility? | Programs declare; Calculations evaluate; Assignments commit via commands. |

---

## 14. Non-goals

- No implementation or schema migration in this mission
- No Assignment Platform redesign (consume Operational Rooms)
- No Attendance redesign beyond room scoping
- No inventing a second capacity engine outside Operational Calculations
- No childcare-only hardcoding of Program names in platform modules

---

## 15. Document map

- Placement / School→Program→Room: `docs/platform/core/placement-system.md`
- Config inheritance: `docs/platform/core/configuration-ownership-and-inheritance.md`
- Operational Calculations: `docs/platform/core/operational-calculations.md`
- Location convergence RFC: `docs/platform/rfcs/location-operational-domain-convergence.md`
- Assignment VNext: `docs/platform/planning/assignment-platform-vnext-operational-scheduling.md`
- Location certification audit: `docs/audits/active/location-operational-platform-certification-2026-07.md`
