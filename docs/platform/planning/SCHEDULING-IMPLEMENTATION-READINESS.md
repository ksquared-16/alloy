---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling — implementation readiness (frozen product definition)

**Status:** Proposed — the **handoff entry point**. Scheduling Product Discovery is closed. This is the final implementation-readiness review: it lists only real blockers, deferrable items, the frozen decisions engineering treats as authoritative, and the exact starting order. It adds **no features**. Read this first, then the canonical contracts it references.

**Audit scope reviewed:** all Scheduling product docs, projection/calculation/billing contracts, ownership matrices, command model, Focus Panel spec, workspace/roster spec, and mockups (34 docs, 13 mockups, 14 commits). Findings are limited to contradictions · duplication · unclear ownership · missing contracts · guess-points · terminology drift · blockers. Fixes applied in this pass are noted in §Changes.

---

## A. Must Fix Before Implementation (real blockers only)

**There are no architectural or product-design blockers.** Everything composes on built Alloy substrate; every contract exists. The only items below are concrete decisions/confirmations that must land **before coding the specific piece that needs them** — not global blockers.

1. **Room-week health thresholds** — the exact `tight` vs `over` boundaries for calc #8 (`scheduling-calculation-map.md`) are marked *(confirm)*. A one-time config/constant decision; needed before the health rollup and Roster chips. *(Blocks: Roster health, Overview room-health line.)*
2. **Week-start configuration home** — `scheduling-pattern-and-financial-spec.md` §1 specifies resolution + a **locale fallback**, so this is not a hard blocker, but the config **field/source must be named** (a week-start field on location/org calendar config, with operating days from `childcare_operating_windows`). Confirm before the pattern editor's day selector. *(Blocks: pattern editor day order — mitigated by the specified fallback.)*
3. **Billing read-endpoint kickoff (cross-team)** — the `BillingScheduleProjection` shape (`billing-rate-resolution-contract.md`) is fully specified and maps onto Billing's **existing** pricing/attribution pipeline, but the read endpoint is **Billing-owned**. Schedule it with the Billing owner at the start so it lands by Phase-2 step 9. *(A dependency, not a Scheduling-internal blocker; Scheduling Phase 1 does not need it.)*

None requires a new runtime, a new financial domain, a Billing redesign, or an unresolved product question.

---

## B. Safe To Defer (V2 or later)

Explicitly out of the first implementation; specified enough to add later without rework:

- **Staffing supply (G3)** and any *"add staff"* resolution option — needs staff/shift/coverage modeling; V1 resolves ratio by moving children / reducing sessions only.
- **Insights / forecasting surface** — projected problems ("coming up") as future-dated items; V1 handles today's problems only.
- **Roster editing (drag-and-drop)** — V1 changes flow only through Resolve → command → commit.
- **Batch / review-tray commit** — V1 is one decision, one commit.
- **BOS-generated alternatives** — V1 options are deterministic search + rule-based explanation.
- **Communications "notify family"** on a committed change — offered, not sent, in V2.
- **Custom-amount rate override + full approval workflow UI** — V1 override = choose among eligible rates (permissioned, approval-gated).
- **Printable / configurable rosters** (Studio print templates, permissioned sensitive fields, "printed as of") — the read model is print-compatible today; the renderer is later.
- **Cross-workspace decision hand-off (route-level)**, multi-decision replay/audit timeline, multi-site OI rollups.

---

## C. Product Decisions That Are Now Frozen (authoritative)

Engineering treats these as law. Each has a canonical doc.

**Placement & experience**
- Scheduling is **decisions in Work**; **Studio = configuration authoring only**. Operators experience *problem → options → tradeoffs → commit* — never planning architecture. → `scheduling-product-spec.md`, `operational-planning-runtime.md`
- **Focus Panel = Identity · Work · Commands**, cleanly separated. The **Scheduling Summary card is pure identity** (room · pattern · effective dates · durable status word — no calculations/health/recommendations). Operational work (over-ratio, needs-placement, proposed change) lives on a **Current Work / Needs Attention** card, present only when work exists. → `scheduling-focus-panel-composition.md` (refines `scheduling-focus-panel-spec.md`)
- **Children card = configurable business surface** (Surface Builder); **Scheduling card = platform-owned operational surface**. Peer cards, composed by **navigation, not embedding**. → `children-scheduling-boundary.md`
- **Household** is the family-context term (not "related children"); the active child stays primary; a row opens that child's card, Back returns. → `scheduling-focus-panel-composition.md` §3

**The data model**
- **One canonical projection**, subject-scoped (**household | child** — same card, `children[]` is N or 1). The **Assignment** (room × weekdays × times × effective dates) is the shared atom; every surface (Focus Panel, workspace, Roster drill-down, Command Surface, print, BOS) is an **index over assignments** — no duplication. → `scheduling-projection-contract.md` (canonical; `scheduling-card-projection.md` = child index, `roster-projection-contract.md` = room×day index)
- Lifecycle buckets: **Current · Upcoming · Temporary · History** (frozen term **Upcoming**, not "Future"). **Proposed** is operational work, not on the timeline.
- **One schedule, many assignments.** Split-week / per-day rooms & times = multiple assignments in one schedule; not multiple schedules.
- **Effective-dated supersede**: committed schedules are never overwritten; changes create new versions; **undo = a compensating commit**. → `schedule-lifecycle-and-object.md`
- **Calculations own truth** (14-calc map); **no client-side computation**, no AI override; occupancy/ratio/capacity/etc. are registered calculations. → `scheduling-calculation-map.md`

**Commands & configuration**
- The Scheduling card is **read-first**; the **pattern editor and all edits live in the Command Surface** as configured commands. **Commands are not hardcoded** — availability/labels/placement/order/visibility/approval resolve from configuration + the Action Runtime. → `scheduling-focus-panel-spec.md` §7–8, `scheduling-binding-matrix.md`
- **Week structure comes from configuration** (locale fallback); no hardcoded weekday order. → `scheduling-pattern-and-financial-spec.md` §1

**Scheduling ↔ Billing (financial context, not ownership)**
- **Billing owns** rate determination, eligible-rate resolution, discounts, funding, recurring tuition calculation, family responsibility, proration, override policy/approval, and the entire **ledger**. → `scheduling-billing-boundary.md`
- **Scheduling displays** a read-only **`BillingScheduleProjection`** (recommended + eligible rates · numeric discounts · numeric funding · family responsibility) and **persists only the selected-rate reference** — it computes no amount and exposes no ledger. → `billing-rate-resolution-contract.md`
- **Rate = choices + a recommended default**, preselected when safe; override is **authorized, permissioned, approval-gated** (no free rate entry). Discounts/funding show **numeric values or explicit "Pending."** → `scheduling-pattern-and-financial-spec.md`
- **Money uses neutral Alloy styling**; warning color is **reserved** for unresolved/pending/blocked/stale states. Money is not a warning. → `scheduling-pattern-and-financial-spec.md` §11

**Boundaries & policy**
- **Temporary child moves** are policy-gated, stable-preferred, and **never preselected or BOS-suggested by default**. → `temporary-move-policy-model.md`
- **Roster** visualizes reality (read-first) and drills down **to the actual children**; it is never a source of truth; the read model is print-compatible. → `roster-projection-contract.md`, `scheduling-product-spec.md` §6
- **BOS** surfaces / explains / proposes; it **never chooses, commits, or invents** facts. → `scheduling-product-spec.md` §12
- The **four ownership lines** hold: **Enrollment** (enrollment intent) · **Scheduling** (operational schedule intent) · **Billing** (financial truth) · **Attendance** (actual execution).

**V1 scope (frozen):** the three problems — **over ratio · child without placement · start-date conflict** — with read-first Roster + drill-down, calculation-grounded options, effective-dated commit + undo, numeric financial preview, and minimal BOS. Everything else is §B. → `scheduling-product-spec.md` §14

---

## D. Engineering Starting Point (exact order)

Reconciles `engineering-handoff.md`, `scheduling-binding-matrix.md` §7, and `billing-rate-resolution-contract.md` §3. This order is authoritative.

**Phase 0 — land the §A decisions** (parallelizable, small): room-health thresholds; name the week-start config field; kick off the Billing `BillingScheduleProjection` endpoint with the Billing team.

**Phase 1 — the core decision loop on built substrate → demoable milestone**
1. **Canonical Scheduling projection** read model (`SchedulingProjection` → `ChildScheduling` → `ScheduleView` → `Assignment`), child index first. → `scheduling-projection-contract.md`
2. **Problem read model + Overview ranking**, over-ratio detector first (over existing occupancy/ratio calcs). → `scheduling-product-spec.md`, `scheduling-calculation-map.md`
3. **`decision` Focus Panel card** (read-only): Identity Summary + a Work card for the problem. → `scheduling-focus-panel-composition.md`
4. **Deterministic option generator + preview** via registered calculations (occupancy/ratio/capacity). → `scheduling-calculation-map.md`
5. **Commit adapter** → effective-dated `schedule_assignments` / `child_placements` through a configured command + the Command Surface. → `scheduling-binding-matrix.md`
   - **Milestone:** resolve an over-ratio problem end-to-end on real data (see → compare → commit).

**Phase 2 — complete V1**
6. Detectors **#2 (placement)** and **#3 (start-date)** + their options/commit.
7. **Roster** (read-only): room×day index + **drill-down to children** (`RoomDayInspection`) + room-week health.
8. **Pattern editor** command: assignments · config-driven week · default hours + per-day overrides · effective dates · temporary.
9. **Billing integration**: consume `BillingScheduleProjection` in the create/change **preview** and on the card (rate choice · numeric discounts/funding · family responsibility · neutral styling); persist the selected-rate reference. *(Depends on the Phase-0 endpoint.)* → `billing-rate-resolution-contract.md`, `scheduling-pattern-and-financial-spec.md`
10. **Household subject** rendering (`children[]`=N) + temporary/future schedules + obvious effective dating.
11. **Configured command placements** (create/change/end/move/select-rate/override) + eligibility states (Recommended/Ready/Warning/Blocked/Unavailable).
12. **Guards**: stale-preview refresh-before-commit · undo-as-supersede · degraded states (staffing unknown, config incomplete).

---

## Changes applied in this readiness pass

- Fixed an **ownership contradiction**: `children-scheduling-boundary.md` no longer says "Scheduling owns the rate" — Billing determines; Scheduling displays + persists a reference.
- Fixed **terminology**: froze **Upcoming** (not "Future") and **Household** (not "related children"); banner added to `schedule-lifecycle-and-object.md`.
- Added a **superseded banner** to `mvp-product-definition.md` → `scheduling-product-spec.md`.
- Confirmed the three projection docs are reconciled as **canonical + two indexes** (no duplication) and the Billing projection shape is singular (`BillingScheduleProjection` supersedes the single-rate shape).

No product was redesigned; nothing new was invented.

---

## Canonical document map (what to build from)

| Concern | Canonical doc |
|---------|---------------|
| **Entry / freeze** | **this doc** |
| **Bottom-up build validation** (readiness matrix · dependency map · risk · freeze · kickoff) | [`SCHEDULING-IMPLEMENTATION-VALIDATION.md`](./SCHEDULING-IMPLEMENTATION-VALIDATION.md) |
| Product, states, scope, workspace, Roster, BOS | `scheduling-product-spec.md` |
| Focus Panel composition (Identity/Work/Commands) | `scheduling-focus-panel-composition.md` (+ `scheduling-focus-panel-spec.md` detail) |
| Canonical projection (the read model) | `scheduling-projection-contract.md` |
| Schedule lifecycle, object, pattern editor | `schedule-lifecycle-and-object.md` + `scheduling-projection-contract.md` |
| Calculations (the authority) | `scheduling-calculation-map.md` |
| Config/facts/intent/calc/projection + command binding + gaps | `scheduling-binding-matrix.md` |
| Children ↔ Scheduling ownership | `children-scheduling-boundary.md` |
| Scheduling ↔ Billing boundary + rate/discount/funding | `scheduling-billing-boundary.md` + `billing-rate-resolution-contract.md` + `scheduling-pattern-and-financial-spec.md` |
| Temporary-move policy | `temporary-move-policy-model.md` |
| Roster read model (room×day index) | `roster-projection-contract.md` |
| Build sequence | this doc §D (reconciles `engineering-handoff.md`) |

*The `operational-*`, `decision-*`, `studio-platform`, `architecture-validation`, `planning-*`, `platform-discoveries-and-roadmap`, `scheduling-reference-implementation`, `mvp-product-definition`, `scheduling-product-v1` docs are the **discovery trail / provenance** — superseded for implementation by the table above.*
