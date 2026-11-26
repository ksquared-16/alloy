---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling — Configuration & Data Binding Matrix

**Status:** Proposed — the final backend/configuration readiness artifact. Proves every value shown anywhere in Scheduling has a **canonical owner** (configuration, operational fact, effective-dated intent, or registered calculation). Contains the **data binding matrix** (§1–5), the **Configured Command Binding Matrix** (§6), and the **Implementation Gap Report** (§7). No placeholder value is left unexplained.

Maturity legend: **built** (exists today) · **partial** (thin work over built) · **missing** (net-new) · **external** (owned by another product).

---

## 1. Configuration assets (Studio / Configuration owns)

| Asset | Canonical owner | Read model | Maturity | Stale behavior | Permission |
|-------|-----------------|-----------|----------|----------------|-----------|
| Sites / locations | `locations` (site) | config runtime | built | n/a (config) | org/site scope |
| Programs / age groups | `program_key` vocab, `location_program_categories` | config | built | — | org scope |
| Rooms | `locations` (unit, parent=site) | config | built | — | site scope |
| Room capacities | `childcare_capacity_rules` (physical/licensed/operational) | `resolveOperationalCapacity` | built | recompute on publish | site scope |
| Age/program eligibility | program model + room program | `resolveConfigRule` (#6) | built | — | site scope |
| Ratio rules & tiers | `childcare_ratio_rules` + `_tiers` | `resolveRatio` (#3) | built | recompute on publish | site scope |
| Schedule patterns | `schedule_patterns` | catalog read | built | — | site scope |
| Operating windows | `childcare_operating_windows` | `resolveConfigRule` | built | — | site scope |
| Schedule rules | `childcare_schedule_rules` | `resolveConfigRule` (#7) | built | — | site scope |
| **Temporary-move policy** | Configuration ([`temporary-move-policy-model.md`](./temporary-move-policy-model.md)) | policy read | **missing** | — | org/site scope |
| **Continuity preferences** (penalty weight, sibling weight) | Configuration | policy read | **missing** | — | org scope |
| Staffing policy inputs | Configuration | policy read | **partial** | — | org scope |
| Ranking objective | Configuration | option-generator input | **partial** | — | org scope |
| Effective-date policy | `effectiveDating` conventions | write path | built | — | platform |
| Communication requirements | Configuration (per command) | command config | **partial** | — | org scope |
| **Configured command placements** | Action/Command Runtime config (§6) | command resolver | **partial** | — | role-scoped |

---

## 2. Operational intent (effective-dated; Placement/Schedule owns)

| Intent | Canonical owner | Read | Maturity | Stale | Permission |
|--------|-----------------|------|----------|-------|-----------|
| Enrollment agreement | `child_enrollment_agreements` | entity GET | built | realtime reconcile | child scope |
| Child placement | `child_placements` (effective-dated) | entity GET | built | reconcile on commit | child scope |
| Schedule assignment | `schedule_assignments` (effective-dated) | entity GET | built | reconcile on commit | child scope |
| Effective dates | on the above rows | — | built | — | child scope |
| Superseded history | prior effective-dated rows | history read | built | append-only | child scope |
| Source / provenance | provenance FKs (`enrollment_agreement_id`) | — | built | — | child scope |

---

## 3. Operational facts (observed; Facts owns)

| Fact | Canonical owner | Read | Maturity | Stale | Permission |
|------|-----------------|------|----------|-------|-----------|
| Attendance | `child_attendance_events` | `expectedVsActual` (#11) | built | append-only | child/site |
| **Available staffing** | Staffing product | `staffOnHand` (#5) | **external (G3)** | shown `unknown` until connected | site scope |
| Room closures / operating-day exceptions | closures table + operating windows | calc input | **partial** (closures table missing) | — | site scope |
| Committed enrollment | agreements → placements | — | built | — | child scope |
| Future starts / ends | effective-dated rows | forward read | built | — | child scope |

---

## 4. Calculations (registered; Operational Calculations owns)

All 14 calculations, their owners and maturity, are enumerated in [`scheduling-calculation-map.md`](./scheduling-calculation-map.md). Summary for binding: **built** — occupancy, capacity, ratio, required staffing, eligibility, schedule compatibility, expected attendance, tuition, effective-date overlap; **partial** — room health rollup (#8), conflict count (#9), future capacity risk (#14); **missing** — continuity impact (#10) + sibling continuity (#10a); **external** — available staffing (#5). The card projection consumes these read-only; **no client-side computation of operational truth**.

---

## 5. Product projections (composed read models)

| Projection | Composed from | Owner | Maturity | Stale behavior |
|-----------|---------------|-------|----------|----------------|
| Scheduling Overview | problems (calc-derived) + attention ranking | new read model | **missing** (thin) | re-rank on event |
| Place-a-Child options | option generator + previews | new read model | **missing** | re-preview on stale |
| Over-Ratio options | option generator + previews | new read model | **missing** | re-preview on stale |
| Roster summary | [`roster-projection-contract.md`](./roster-projection-contract.md) `RoomWeekSummary` | new read model | **partial** | recompute |
| Roster cell detail | `RoomDayInspection` | new read model | **partial** | recompute |
| **Child Scheduling Summary Card** | [`scheduling-card-projection.md`](./scheduling-card-projection.md) (subset) | new read model | **missing** | freshness meta |
| **Child Scheduling Detail Card** | `SchedulingCardProjection` (full) | new read model | **missing** | freshness meta |

Every projection is **derived and recomputable**; none is authoritative; none duplicates a source row.

---

## 6. Configured Command Binding Matrix

Scheduling exposes **operator intents**; the actual visible commands resolve from configuration against the Action / Operational Command Runtime (spec §8). This matrix binds each intent to a registered capability — it does **not** prescribe a hardcoded command list.

| Operator intent | Candidate registered capability | Subject type | Logical placement | Config source | Process/stage applicability | Eligibility deps | Required inputs | Calc-backed preview | Canonical write path | Refresh targets | Maturity |
|-----------------|--------------------------------|--------------|-------------------|---------------|------------------------------|------------------|-----------------|---------------------|----------------------|-----------------|----------|
| **Create schedule** | `schedule.create` (placement+schedule) | child | Summary (unscheduled), Detail | action placement config | Enrollment→Placement/Schedule stage | eligibility (#6), compat (#7), capacity (#2) | room, pattern, effective start | occupancy/ratio/tuition (#1,#3,#12) | `child_placements`+`schedule_assignments` | card · Roster · Overview | **partial** (capability new; config new) |
| **Change schedule** | `schedule.change` (supersede) | child | Detail, Summary | placement config | active schedule stages | current schedule, overlap (#13) | the change | before→after (#1,#3), affected dates | supersede `schedule_assignments` | card · Roster · Overview | **partial** |
| **Change placement** | `placement.change` (supersede) | child | Detail | placement config | active | eligibility (#6), health (#8), continuity (#10) | new room | health impact, continuity cost | supersede `child_placements` | card · Roster · Overview | **partial** |
| **End schedule** | `schedule.end` | child | Detail | placement config | active | downstream (#11,#12) | effective end, reason | downstream consequences | close/supersede | card · Roster · Overview · Billing | **partial** |
| **Fix conflict** (over-ratio) | `schedule.resolve` (per option) | Room×Day issue **or** child | Over-Ratio, Roster flagged cell, Summary (conflict) | action placement config | active | option generator (all calcs) | chosen option (+ move shape if applicable) | per-option previews | per option (supersede) | card · Roster · Overview | **partial** |
| **Review proposed change** | `schedule.commitProposed` | child | Summary (proposed), Detail | placement config | proposed standing | fresh preview, overlap (#13) | approve / discard | re-preview | commit or discard | card · Roster · Overview | **partial** |
| **Move a child (temporary)** | `schedule.move` (shape-parameterized) | child | Fix-conflict option only | temp-move policy (§config) | policy-gated | policy (§temp-move), continuity (#10) | shape (day/range/weekdays/permanent), approval | continuity + ratio previews | supersede (bounded) + optional restore | card · Roster · Overview · Communications(offer) | **partial** (needs policy config) |

**Command states** (`Recommended`/`Ready`/`Warning`/`Blocked`/`Unavailable`) are computed by the runtime's eligibility evaluation over the calc deps; a **Blocked** command shows its configured reason. **No command is hardcoded in the card or workspace.**

---

## 7. Implementation Gap Report

Genuine gaps only, classified. Nothing here reopens architecture.

### Required before implementation begins
1. **Child Scheduling Card Projection** read model ([`scheduling-card-projection.md`](./scheduling-card-projection.md)) — the composed payload both card layers need. *(missing; the central new read model)*
2. **Configured command placements for Scheduling intents** — the 7 intents (§6) registered as capabilities + at least default configuration so commands resolve (not hardcoded). *(partial: runtime exists; Scheduling capabilities + config are new)*
3. **Temporary-move policy config + continuity calculation (#10/#10a)** — the anti-shuffle guardrail's config surface and ranking input. *(missing)*
4. **Room-week health rollup (#8) registration + thresholds** — confirm and register. *(partial)*

### Implement during Scheduling
5. Problem read model + Overview ranking; Place/Over-Ratio option generators + previews. *(missing, thin over built calcs)*
6. Commit adapters (create/change/end/resolve) over effective-dated supersede. *(partial)*
7. Roster projection (`RoomWeekSummary`/`RoomDayInspection`). *(partial)*
8. Conflict count (#9), future capacity risk (#14) rollups. *(partial)*
9. Stale-preview detection signal. *(design decision — product spec §15.3)*

### V2
10. Available staffing (#5) integration + staff-based options. *(external, G3)*
11. Closures/operating-day-exceptions table. *(partial)*
12. Communications "notify family" handoff on a committed change. *(external)*
13. Batch/review-tray commit. *(deferred)*
14. Roster print projection + Studio print templates. *(future-compatible today)*

### Future
15. Commercial/labor optimization; multi-site OI rollups; export beyond roster.

**Readiness verdict:** the four "required before" items are bounded and sit on built substrate + the existing command runtime. No new runtime, no second source of truth, no architectural question remains. Product planning can close; implementation can begin at these four, then the "during" list in [`engineering-handoff.md`](./engineering-handoff.md) order.

---

## Cross-references

- [`scheduling-card-projection.md`](./scheduling-card-projection.md) · [`scheduling-focus-panel-spec.md`](./scheduling-focus-panel-spec.md) · [`scheduling-calculation-map.md`](./scheduling-calculation-map.md) · [`roster-projection-contract.md`](./roster-projection-contract.md) · [`temporary-move-policy-model.md`](./temporary-move-policy-model.md) · [`engineering-handoff.md`](./engineering-handoff.md)
