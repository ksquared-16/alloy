---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Temporary Move Policy Model

**Status:** Proposed — the guardrail that keeps Scheduling from assuming schools routinely shuffle children to optimize occupancy. A temporary move **may** be valid, but the product **prefers stable schedules** and only offers, ranks, suggests, or preselects a move as the organization's policy and the operational facts allow. Companion to [`scheduling-product-spec.md`](./scheduling-product-spec.md) §5.

**The principle:** *a stable schedule is the default good. A move — temporary or permanent — is an exception the product must justify, represent honestly, and gate on policy.*

---

## 1. Four layers, kept separate

The mission's core requirement: separate what the platform *can* do, what a tenant *allows*, what calculations *measure*, and what the operator *decides*. Conflating them is how child-shuffling gets hardcoded.

| Layer | Owns | Example |
|-------|------|---------|
| **Platform capability** | that moves (of every shape) are *expressible* and commit through the normal path | "a move can be one-day, a range, weekdays, or permanent" |
| **Tenant policy** | whether/how moves are *allowed* for this organization | "temporary moves prohibited for infants; ≤5 days; director approval required" |
| **Calculation input** | the *continuity impact* a move carries, as a rankable number | continuity penalty (calc #10) that lowers a move's rank |
| **Operator decision** | choosing a move, its shape, and committing it | "move Ethan Thursday only" |

The platform never decides a school shuffles children; **tenant policy** does, explicitly. The **calculation** makes stability win by default; the **operator** makes the call.

---

## 2. Move shapes (platform capability)

A move option, when offered, must declare its shape — the operator picks it; the product **defaults to the narrowest shape that resolves the problem**:

| Shape | Meaning | Default when |
|-------|---------|--------------|
| **One day** | a single day's room change | a one-day breach (default for a single-day over-ratio) |
| **Date range** | a defined start–end | a bounded cause (a teacher out all week) |
| **Selected weekdays** | recurring on chosen days | a recurring pattern conflict |
| **Permanent** | supersede the placement | a lasting change (rare; explicit) |
| **Substitute room only** | move *only* while the primary room is unavailable, auto-return | primary room closed/over on specific days |

A one-day breach never defaults to a week-long move. "Move for the week" is never the automatic answer.

---

## 3. Tenant policy (configuration, not code)

A reusable but Scheduling-driven policy object, authored in Configuration, read by the option generator:

```
TemporaryMovePolicy {
  allowed: bool,                          // default: true, but…
  allowedShapes: MoveShape[],             // e.g. exclude 'permanent' from quick-resolve
  maxDurationDays: int|null,
  eligiblePrograms: programKey[]|'all',   // e.g. exclude infants
  eligibleRoomPairs: rule|'any-eligible',
  approvalRequired: bool,                 // gates commit authority
  familyNotificationRequired: bool,       // gates commit → offers Communications handoff
  continuityPenaltyWeight: number,        // default HIGH — see §4
  bosMaySuggest: bool,                    // default: FALSE
  mayBePreselected: bool                  // default: FALSE
}
```

**Out-of-the-box defaults are conservative:** moves allowed but **never preselected**, **never BOS-suggested**, **high continuity penalty**, approval/notification off (org opts in). An organization that *does* optimize by moving children configures that explicitly; the product never assumes it.

---

## 4. Continuity as a ranking input (calculation, not opinion)

**Continuity impact** (calc #10) is a deterministic input, not an AI judgment. It measures what a move costs in stability:

- room change · teacher/cohort change · duration · age/program fit · sibling/cohort separation · attendance/billing effective-date complexity.

The option generator applies `continuityPenaltyWeight` so that **a move never outranks a stable fix** unless (a) the org lowered the weight, or (b) the facts strongly justify it — i.e. *every* stable alternative is worse (adds cost, or there is no stable alternative at all). Ties always go to the stable schedule.

So ranking order, by default, is: **stable in-room fixes → session/start-date adjustments → temporary moves (narrowest shape) → permanent moves.** A move surfaces high only when nothing stable resolves the problem.

---

## 5. What the operator sees

- A move option **states its shape and its continuity consequence** plainly: *"Move Ethan to Sunshine — Thursday only. His teachers and cohort change that day."*
- Policy-required steps are shown **before commit**: an **approval** gate (blocks commit without authority) and a **family-notification** requirement (commit **offers** a Communications handoff; Scheduling never sends).
- If policy **prohibits** a move for this child (infant, or moves off), the move simply **isn't offered** — not shown-then-blocked, just absent, so the operator isn't nudged toward it.
- A move is **never preselected** and **never BOS-suggested** unless the tenant turned those on.

---

## 6. Reusable platform insight (recorded, not pursued)

Two things generalize beyond Scheduling and are recorded for later platform work — no work done here:

- **Policy-gated option generation** — options filtered/ranked by tenant policy + a deterministic penalty is a reusable pattern for any decision domain where "the obvious optimization" carries human cost (staffing shuffles, billing changes).
- **Continuity / stability as a first-class ranking dimension** — *"prefer not changing things"* as a measured, configurable objective.

Both belong to the `decision` architecture ([`alloy-decision-architecture.md`](./alloy-decision-architecture.md)); Scheduling ships the first instance.

---

## 7. Verdict

- **V1:** moves are expressible (all shapes), policy-gated, continuity-penalized, never preselected, never BOS-suggested; conservative defaults; approval/notification gates honored.
- **The product prefers stable schedules** unless the organization explicitly chose otherwise or the facts strongly justify an exception. Child-shuffling is never the hardcoded default.

---

## Cross-references

- [`scheduling-product-spec.md`](./scheduling-product-spec.md) §5 — the move surface.
- [`scheduling-calculation-map.md`](./scheduling-calculation-map.md) #10 — continuity impact.
- [`alloy-decision-architecture.md`](./alloy-decision-architecture.md) — policy-gated options as a reusable pattern.
