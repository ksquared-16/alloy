# Thread 9 — Attendance metric catalog, KPI decisions, and ownership

Ten metrics, one OIP platform correction, no KPIs, and three deliberate
deferrals. Every row names the resolver that owns its meaning.

## The durable architecture decision

> **Attendance is a first-class Operational Intelligence metric pack/domain, but
> it is not a Business Process.** Thread 9 corrected an OIP taxonomy coupling
> exposed when the Attendance pack was activated, rather than inventing Business
> Process identity to satisfy an exhaustive type mapping.

`PACK_TO_BUSINESS_PROCESS` was an exhaustive `Record`, which quietly asserted
that every measurement domain is a business process. It is now partial, read
through `businessProcessForMetricPack`, and `OperationalCalculation.businessProcess`
is nullable. A calculation with no owning process groups under its **pack** label
in Surface Builder rather than falling into "Other".

## OIP platform change — the live-only snapshot policy

`snapshotPolicy: "live_only"` on a metric definition means a stored value must
never stand in for its current one. Enforced in both directions:

| Path | Behaviour |
|---|---|
| `resolveSingleMetric` | will not **consult** `metric_snapshots`, even under `mode=snapshot`; `resolveMode` stays `live` and is therefore truthful |
| `writeOrgMetricSnapshots` | will not **persist** it, and the exclusion applies to the caller's explicit key list, not only the default |

It is separate from `snapshotSemantics`, which describes completeness
(bounded/capped scan) rather than snapshot eligibility — several metrics carry
that flag and are snapshotted quite correctly.

**Why it had to land first:** the writer persists every registered metric and the
engine will serve a stored one under `mode=snapshot`, so *registering* a
current-state metric was itself enough to create a path where an earlier hour's
number is returned as the present one.

The engine does apply a freshness bound — `readLatestMetricSnapshot` uses a 24h
default — and that bound is the point rather than the rescue. Twenty-four hours
is reasonable for a rolling 30-day metric and meaningless for "how many children
are here now", which turns over completely within a single day. No age is short
enough to make a stored occupancy count correct, so the policy belongs on the
metric rather than on the clock.

---

## Catalog

All ten are in the `attendance` pack. Scope column reads: **org/site** = narrowable
and authorized; **org only** = source carries no site linkage.

| Key | Question | Source (owner) | Grain | Window | Scope | Corrections | Live/Hist | Snapshot | Class | KPI |
|---|---|---|---|---|---|---|---|---|---|---|
| `attendance.expected_count` | How many children are expected today? | `buildCombinedRoster` → `interpretServiceDay` | child × service-day | today | org/site | via fold | LIVE | **live_only** | operational | METRIC ONLY |
| `attendance.here_now_count` | How many are in the building right now? | `applyObservedPresence` (`here_now` + `attended_despite_plan`) | child × service-day | now | org/site | via fold | LIVE | **live_only** | operational | METRIC ONLY |
| `attendance.not_arrived_count` | Who is missing with no explanation? | `raisesMissingArrivalAttention` | child × service-day | now | org/site | via fold | LIVE | **live_only** | operational | METRIC ONLY |
| `attendance.checked_out_count` | How many have been collected? | `ServiceDayState = checked_out` | child × service-day | now | org/site | via fold | LIVE | **live_only** | operational | METRIC ONLY |
| `attendance.known_away_count` | How many are away for a recorded reason? | `ServiceDayState = known_away` | child × service-day | now | org/site | via fold | LIVE | **live_only** | operational | METRIC ONLY |
| `attendance.unknown_state_count` | Whose service day could not be resolved? | `ServiceDayState = unknown` | child × service-day | now | org/site | via fold | LIVE | **live_only** | **health** | METRIC ONLY |
| `attendance.occupancy_count` | How many children are physically on site now? | `occupancyAt` | child × instant × location | now | org/site | via fold | LIVE | **live_only** | operational | METRIC ONLY |
| `attendance.correction_rate` | How often do we correct what we recorded? | `child_attendance_events.entry_type` | event | 7d/30d | org/site | *is* the subject | HISTORICAL | eligible | **truth quality** | METRIC ONLY |
| `attendance.unmapped_event_count` | What did another system send that we could not use? | `attendance_integration_events.disposition` | inbox event | 7d/30d | **org only** | n/a | HISTORICAL | eligible | **integration health** | METRIC ONLY |
| `attendance.consequence_review_count` | What followed from attendance and awaits a decision? | `consumption_events.status` | consumption event | now | org/site | n/a | LIVE | **live_only** | **consequence health** | METRIC ONLY |

**Dimensions.** None are declared. Occupancy's per-location breakdown rides in
`meta` because `MetricDimensionKey` is `lifecycle_stage | status_key` with no
location member; a true dimensional occupancy metric needs that platform
vocabulary first, and inventing an Attendance-specific response shape would be
the parallel analytics infrastructure this thread must not build.

**Unreadable scope returns `null`, never `0`.** Zero is an answer — it reads as
"nobody is here" — and a caller who may not see a site has no right to that
statement about it.

---

## KPI decisions — none, and the reasons are specific

The investigation named three candidates. All three are **METRIC ONLY** in V1.

**`attendance.not_arrived_count` / unexplained rate — NOT a KPI.** The count is a
live value that rises through the morning and falls as children arrive, so a
target would be measured against an arbitrary moment. More fundamentally, no
universal default is legitimate: the healthy number depends on setting size, and
an org-specific target set without evidence is a number someone will manage
toward rather than a standard.

**`attendance.correction_rate` — NOT a KPI, and this one is a trap.** Lower looks
healthier, and that is exactly the problem. Corrections are how an operator fixes
a record that was wrong; holding a setting accountable for making fewer of them
rewards **leaving mistakes uncorrected**. The metric is valuable as a signal and
actively harmful as a target. Section 12's question "could the KPI encourage
misleading operational behavior?" has a yes here, so it stops.

**`attendance.unmapped_event_count` — NOT a KPI yet.** Direction is unambiguous
(lower is better) and the source is authoritative, but the volume is driven by a
provider's behaviour rather than the organization's, and it scales with
integration traffic nobody has normalized. Accountability without control is not
a KPI. Revisit when a provider integration is actually live.

No Attendance-specific KPI configuration was created. If any of these is later
promoted, it uses the existing OIP target overlay.

---

## Deferred, with evidence

**Historical attendance performance (Phase D) — DEFERRED.** The only windowed
expectation source, `fetchExpectedVsActualAttendance` → `fetchScheduleExpectations`,
is **schedule-derived (L3) and applies no Operational Expectations**. A child on
authored vacation therefore appears as `expected_not_checked_in`, indistinguishable
from an unexplained missing arrival.

Shipping an attendance rate on that source would put two Alloy surfaces in direct
contradiction about the same child on the same day: the live
`attendance.not_arrived_count` deliberately excludes known-away, and the
historical rate would silently include it. That is the precise drift Thread 9
exists to prevent, so the metric waits for a windowed source that applies
service-day interpretation.

*(Incidental confirmation of the earlier deferral: the variance vocabulary
contains `late_arrival_unknown_time` — the model itself records that arrival
timing is not authoritative.)*

**Late arrival / early departure — DEFERRED.** `ChildServiceDayExpectation`
carries interpretation, reason and lineage, and no scheduled time-of-day. No
grace or threshold policy exists anywhere in `childcareOperational`.

**Staffing / ratio — DEFERRED by decision, not backlog.** See below.

**Monetary Attendance measurement — OWNED ELSEWHERE.** The `financials` pack
holds seven amount metrics. Attendance exposes consequence *state*.

---

## Staffing / ratio ownership decision

Recorded for the handoff, unchanged from the accepted investigation:

- `resolveRatio` plus `childcare_ratio_rules` / `childcare_ratio_rule_tiers` own
  ratio **requirement** semantics.
- The child count feeding it is deliberately **day-level** and already
  occupancy-flavoured rather than roster-flavoured.
- **`staffOnHandByRoomDate` has no production caller** — its only references are
  its declaration, its doc comment, and its own `?? {}` default.
- `staffingGap` therefore lacks an authoritative staffing supply and is
  structurally `null`; `staff_data_unavailable` is the honest result.
- **Supervision grouping has no canonical owner.** `operational_authority_assignments`
  exists and `resolveRatio` does not consult it.
- **Physical occupancy alone is insufficient.** Playground movement, mixed groups,
  a shared licensed room and a temporary visitor all turn on which grouping
  supervises, which co-location cannot answer.

**Thread 9 implements no staffing or ratio metric.** `staffing` and `capacity`
remain `coming_soon`. A future authoritative supervision/ratio projection must
combine jurisdiction/licensing rules, age/program ratio rules, operational
grouping, physical location, staff presence/assignment, supervision authority and
effective time.

---

## Thread 10 fixture handoff

| Scenario | Proven by | Fixture/state Thread 10 needs |
|---|---|---|
| A ordinary service day | `attendanceServiceDayMetrics.test.ts` | children present, checked out, missing |
| B known away | same | authored absence + one unexplained child |
| C closure | same | site closure covering a cohort |
| D attended despite plan | same | authored absence + observed presence |
| E movement | `attendanceOccupancyMetrics.test.ts` | Toddler 1 → Playground → Toddler 2 |
| F correction | same (reversal case) | reversed room transfer |
| G kiosk / external capture | **Thread 10** | canonical facts authored via kiosk and producer |
| H provider mapping failure | `attendanceHealthMetrics.test.ts` | inbox rows with unusable dispositions |
| I financial review | same | `consumption_events` at `recorded` |
| J site filter | **Thread 10** | two sites + a caller scoped to one |
| K honest trend | **Thread 10** | one snapshot, then two |
| L live-only safety | `liveOnlyMetricContract.test.ts`, `liveOnlySnapshotWriterExclusion.test.ts` | a stale snapshot row for a live-only key |

G, J and K need a mounted environment and are Thread 10's to certify. Thread 10
remains **BLOCKED BY 9** until this is promoted.
