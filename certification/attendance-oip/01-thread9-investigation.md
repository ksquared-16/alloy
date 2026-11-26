# Thread 9 — Attendance Operational Intelligence: investigation

The Section 4 gate. No metric key, schema or surface is proposed here that does
not name a proven authoritative source.

| | |
|---|---|
| Thread 8 floor | `ec434db6a9f4cf61594e829f00ada0dde32687c0` — verified ancestor of staging |
| Thread 9 starting SHA | `e8ace13b6e1bdaf63428dd6796aad01dc069d2a3` |
| Staging at start | `7009b3c1321621dd85baf11711b68b461fb7d064` |

**Nothing landed since the floor that intersects Thread 9.** 49 files changed
across 15 commits (Access/Processing authority, command surface, startable work).
Screening them against every Thread 9 domain — metrics, OIP, MetricEngine, KPI
registry, snapshots/trends, Workspace, Work Unit, Focus Panel, BOS reads,
locations/site filtering, staffing/ratio/capacity, financial consequence — the
only hits are five Focus Panel `currentWork` files, which are Current Work and
command-surface, not Attendance. The Attendance, OIP and metric trees are
untouched since Thread 8.

---

## A. The pack model already has an Attendance slot

`web/lib/metrics/packs.ts` declares:

```
{ key: "attendance", label: "Attendance",
  metricKeys: [], domainStatus: "coming_soon" }
```

So Thread 9 **populates an existing empty pack**. It does not create a registry.
`capacity` and `staffing` sit beside it in the same state, which matters for §11.

There is one real seam. `MetricPackDefinition.key` is typed `string`, but
`MetricDefinition.pack` is typed `MetricPackKey`, and that union is:

```
enrollment | communications | forms | operational_health | capacity | financials | trust
```

**`attendance` is not in it.** A pack can therefore be *declared* today but no
metric can be *assigned* to it. Adding `"attendance"` to `MetricPackKey` is the
smallest compatible extension and is unavoidable.

**Zero Attendance metrics exist today.** No `attendance.*` key appears in
`OipMetricKey`, the registry, or any resolver. Thread 9 starts from nothing, not
from something to reconcile.

---

## B. The live-vs-snapshot hazard is real, and the platform has no guard

This is the most consequential finding, and it decides §8 rather than merely
informing it.

`metricEngine.resolveSingleMetric`:

```ts
if (ctx.mode === "snapshot") {
    const snap = await resolveFromSnapshotIfAvailable(ctx, key);
    if (snap) return snap;          // ← returned regardless of age
}
return resolveLiveMetric(ctx, key);
```

**CORRECTED after implementation.** This section first said there was *no*
staleness bound. That was wrong: `readLatestMetricSnapshot` applies
`DEFAULT_MAX_AGE_MS = 24h`, so a snapshot older than a day is not served.

The hazard is real anyway, and the correction sharpens why. Twenty-four hours is
a sensible bound for a rolling 7- or 30-day metric, whose value moves slowly. It
is meaningless for "how many children are here right now": attendance goes from
zero to full and back inside one day, so a snapshot taken 23 hours ago is
comfortably inside the bound and is still a completely wrong answer. A
time-based freshness rule cannot express "never substitute" — only a policy on
the metric can.

The writer makes it worse by default. `writeOrgMetricSnapshots`:

```ts
const metricKeys = params.metricKeys ?? listMetricDefinitions().map((d) => d.key);
```

**Every registered metric is snapshotted.** The only filter is `orgScopeOnly`,
and it only skips *narrowed targets*. So merely registering
`attendance.here_now_count` would cause it to be persisted hourly and then served
stale under `mode=snapshot`.

`snapshotSemantics?: boolean` does not help — it means "bounded point-in-time or
capped scan, not exhaustive org truth", which is a statement about completeness,
not about whether a stored value may stand in for now.

**Required smallest extension:** a registry flag marking a metric as live-only,
honoured in two places (a tighter `maxAgeMs` would not do — no age is short
enough to make a stored occupancy count correct, and any value chosen would be an
arbitrary guess about how fast a nursery fills) — `resolveSingleMetric` must not consult a snapshot for
it, and the writer must not persist one. Both are single-condition changes inside
existing functions. No parallel snapshot architecture, no Attendance-specific
engine.

Until that exists, **no current-state Attendance metric may be registered**,
because registration alone creates the stale-value path.

---

## C. Thread 3/4 meaning is already owned — metrics must consume it

`serviceDayExpectations.ts` owns the canonical vocabulary:

```
ServiceDayState = here_now | checked_out | known_away | closed
                | not_arrived | attended_despite_plan | unknown
```

`applyObservedPresence` decides it, and the rules §7A demands are already
guaranteed there:

- observed facts win, so a child on authored vacation who turns up is
  `attended_despite_plan` — physically present, and visibly not what was planned;
- silence is interpreted by expectation, so `known_away` and `closed` never
  become `not_arrived`;
- `raisesMissingArrivalAttention` returns true for **`not_arrived` only**, and
  its comment is explicit that an unresolved lineage is *not* filed as a missing
  arrival because "a data problem must not masquerade as an operational one".

**Consequence for Thread 9:** the §7A requirement that "known away must not
inflate unexplained Not arrived" is not something a metric resolver should
re-enforce. It is already true, and it stays true only if resolvers consume this
projection instead of counting raw facts. Any Attendance metric that reaches for
`child_attendance_events` and classifies states itself is reimplementing Thread
3/4 and will drift from the Workspace.

## D. Occupancy versus roster presence is also already owned

`attendanceWhereabouts.ts` exposes `whereaboutsAt`, `whereaboutsForAllAt`,
`occupancyAt`, `occupancyByPhysicalSpaceAt` — the certified point-in-time fold
Thread 8 converged every surface onto.

`roster/attendanceOverviewModel.ts` states the distinction in its own header:
roster presence "counts a child who walked to the playground"; physical occupancy
"counts visitors from other rooms and excludes her". It also records that the
overview once used the first to answer the second, "which is only correct on a
day when nobody moves".

So §7B needs no new derivation. It needs metrics that call `occupancyAt` and
**never** `summarizeAttendanceByDay`.

---

## E. Staffing / ratio — the §11 decision, on evidence

### What actually exists

| Concern | Owner | State |
|---|---|---|
| Ratio requirement (staff needed for N children) | `capacity/resolveRatio.ts` + `childcare_ratio_rules`, `childcare_ratio_rule_tiers` | **Canonically owned** |
| Capacity binding | `childcare_capacity_rules`, `resolveOperationalCapacity.ts` | Owned |
| Attendance → ratio seam | `attendance/actualCompliance.ts` | Exists |
| Staff supply | — | **Not wired** |

### The two findings that decide it

**1. The child count is day-level by design, not point-in-time.**
`actualCompliance.ts` says so in its own header: "this is DAY-LEVEL… Actual
occupancy for a room/date is the count of distinct children OBSERVED in that room
that day… Point-in-time (time-block) occupancy is deferred." It also records that
"a transfer therefore adds the child to the destination room's occupancy;
placements are never consulted here" — so it is already occupancy-flavoured, not
roster-flavoured, but at day grain, which double-counts a child who visited two
rooms.

**2. Staff supply does not exist as an input.** `staffOnHandByRoomDate` is an
optional parameter that **no caller anywhere supplies** — verified by grep across
`web/lib` and `web/app`: the only three references are its own declaration, its
doc comment, and `input.staffing?.staffOnHandByRoomDate ?? {}`. So `staffingGap`
is structurally always `null` and `staff_data_unavailable` always fires.

`staffPresence/staffPresenceFold.ts` does exist and folds staff presence with the
same correction rules as child attendance — so the *facts* may be reachable, but
nothing connects them to ratio compliance.

### Decision

**Ratio intelligence cannot canonically derive from occupancy alone, and no
staffing/ratio KPI may ship in Thread 9.**

Rejected simplistic interpretations:

- *"Switch ratio to physical occupancy."* Wrong twice. The count grain is
  deliberately day-level, and changing it silently redefines a certified
  compliance field. More decisively, it improves the numerator of a fraction
  whose denominator does not exist.
- *"Ship a staffing-gap KPI."* It would measure an unmodeled denominator. An
  org would be held accountable for a number that is `null` by construction.
- *"Use roster presence."* `actualCompliance` already deliberately does not
  consult placements.

On the four §11 cases, the evidence says the same thing each time: the answer
turns on **supervision grouping**, which no model owns. Children moving to the
playground with their teacher, two toddler groups combining, two groups sharing
one licensed room, one child visiting another group — in every case physical
co-location alone cannot answer which grouping owns the ratio, because the
ratio rule is keyed to a group and jurisdiction, and the supervising adult's
assignment is the missing fact. `operational_authority_assignments` exists but is
not consulted by `resolveRatio`.

**Recommended ownership boundary.** Supervision/ratio grouping is a separate
policy-owned projection, not a view of occupancy. Thread 9 implements **no**
staffing or ratio metric and leaves `staffing` and `capacity` packs
`coming_soon`. What Thread 9 may legitimately measure is the **health debt**:
that ratio compliance is unanswerable because staff supply is unwired — an
operational-health signal, not a ratio.

**Remaining staffing product debt:** wire staff presence to a supervision-group
projection; decide whether the ratio grain is the operational group or the
licensed physical space; confirm whether jurisdiction config already varies it.

---

## F. Financial ownership boundary

The `financials` pack already owns seven monetary metrics
(`financials.outstanding_amount`, `…payments_received_amount`, and so on). §7F is
therefore not a judgement call: Attendance measures **consequence state**, and
any money stays in the Financials pack.

Thread 8 already built the honest read for this —
`attendanceConsequenceContext.ts` reads only `consumption_events.status` and
carries no amount, rate or total, with tests asserting the absence. That is the
right source for a consequence-health count and the wrong source for anything
monetary.

---

## Source / ownership matrix — V1 candidates

Every row names a proven source. Rows marked **DEFER** do not proceed.

| Business question | Candidate key | Authoritative source | Grain | Window | Scope | Corrections | Live/Hist | Snapshot | Class | KPI? |
|---|---|---|---|---|---|---|---|---|---|---|
| How many expected today? | `attendance.expected_count` | `serviceDayExpectations` projection | child × service-day | current day | org/site | via fold | LIVE | **no** | operational | no |
| How many here now? | `attendance.here_now_count` | `applyObservedPresence` = `here_now` + `attended_despite_plan` | child × instant | now | org/site | via fold | LIVE | **no** | operational | no |
| How many unexplained missing? | `attendance.not_arrived_count` | `raisesMissingArrivalAttention` (`not_arrived` only) | child × service-day | now | org/site | via fold | LIVE | **no** | operational | **candidate** |
| How many checked out? | `attendance.checked_out_count` | `ServiceDayState = checked_out` | child × service-day | now | org/site | via fold | LIVE | **no** | operational | no |
| How many known away? | `attendance.known_away_count` | `ServiceDayState = known_away` | child × service-day | now | org/site | via fold | LIVE | **no** | operational | no |
| How many in unknown/integrity state? | `attendance.unknown_state_count` | `ServiceDayState = unknown` | child × service-day | now | org/site | via fold | LIVE | **no** | **health** | no |
| Physical occupancy now, by site | `attendance.occupancy_count` | `occupancyAt` | child × instant × location | now | org/site | via fold | LIVE | **no** | operational | no |
| Occupancy by physical space | dimension of the above | `occupancyByPhysicalSpaceAt` | location | now | site | via fold | LIVE | **no** | operational | no |
| Attendance rate over a window | `attendance.attendance_rate` | service-day states aggregated over days | child-day | 7d/30d | org/site | via fold | HISTORICAL | yes | performance | undecided |
| Unexplained missing-arrival rate | `attendance.unexplained_absence_rate` | `not_arrived` ÷ expected | child-day | 7d/30d | org/site | via fold | HISTORICAL | yes | performance | **candidate** |
| Correction rate | `attendance.correction_rate` | `entry_type` in (`correction`,`reversal`) ÷ facts | event | 7d/30d | org/site | n/a — it *is* the correction | HISTORICAL | yes | **health** | no |
| Integration events that could not be matched | `attendance.unmapped_event_count` | `attendance_integration_events.disposition` | inbox event | 7d/30d | org | n/a | HISTORICAL | yes | **integration health** | **candidate** |
| Consequences awaiting a billing decision | `attendance.consequence_review_count` | `consumption_events.status` = `recorded` | consumption event | now | org | n/a | LIVE | **no** | health | no |
| Late arrival / early departure | — | — | — | — | — | — | — | — | — | **DEFER** |
| Staffing gap / ratio compliance | — | — | — | — | — | — | — | — | — | **DEFER** |
| Any monetary Attendance amount | — | owned by `financials` pack | — | — | — | — | — | — | — | **DEFER** |

### Why the deferrals

**Late / early.** §7C forbids inventing these from timestamps alone. No expected
*time-of-day* semantics were found — `ChildServiceDayExpectation` carries
interpretation, not a scheduled arrival clock — and no grace/threshold policy
owner exists. Deferred until a source owns "expected at".

**Staffing / ratio.** §E above: the denominator is unmodeled.

**Monetary.** Owned by the Financials pack; duplicating it in Attendance is the
§7F failure.

### Three metrics need a decision before they proceed

`attendance.attendance_rate`, `…unexplained_absence_rate` and
`…correction_rate` are historical and therefore snapshot-eligible — but they
aggregate service-day states across days, and the day-level aggregate that exists
(`summarizeAttendanceByDay`) is explicitly not allowed to answer presence. The
open question is whether a windowed resolver may recompute service-day states per
day over a range at acceptable cost, or whether a projection is needed first.
That is a cost question, not a truth question, and it is answered in design.

---

## What this gate concludes

1. Populate the existing `attendance` pack; extend `MetricPackKey` by one member.
2. Land the live-only registry flag **first** — no current-state metric may be
   registered before it exists, because registration alone creates a stale path.
3. Every state metric consumes `serviceDayExpectations`; every occupancy metric
   consumes `occupancyAt`; no resolver reimplements Thread 3/4.
4. No staffing/ratio metric. No monetary metric. No late/early metric.
5. KPI candidates are three at most, and each must still justify accountability
   before being registered as one.
