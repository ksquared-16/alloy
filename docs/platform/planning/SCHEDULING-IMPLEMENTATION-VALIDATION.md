---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling — Implementation Validation (the discovery→implementation boundary)

**Status:** Proposed — the output of the Implementation Validation Sprint. Product discovery is **closed**; the product, architecture, and interaction model are **frozen**. This document proves, bottom-up, that the approved Scheduling product can be implemented on existing Alloy capabilities plus explicitly-approved implementation work — **without engineering inventing any product decision.** It adds no features, reopens no decisions, changes no ownership boundary. Companion + entry point: [`SCHEDULING-IMPLEMENTATION-READINESS.md`](./SCHEDULING-IMPLEMENTATION-READINESS.md) (§D is the authoritative build order).

**Verdict:** ✅ **Engineering can build V1 with zero product invention.** Every approved behavior resolves to *Already exists*, *Needs binding*, *Small extension*, *Required implementation*, or *Deferred V2* — the five classes below, nothing else. Two things are already **proven, not asserted**: the canonical projection read model is **built and green** (14/14 tests, clean typecheck, commit `7ff611fd6`), and it resolves entirely from canonical data — Layer 1 and Layer 3 validated by construction.

**How this was validated:** all 12 governing contracts read; the real codebase mapped by three parallel探索 passes (exact file paths cited below); the projection built against live schema; the calculation registry, action registry, commercial pipeline, Focus Panel card model, and workspace shell inspected directly. Findings are grounded in code, not doc claims.

---

## 0. The one distinction that removes most ambiguity

> **"Built" (calculation map) means the single-owner *resolver* exists. "Registered" means it is in the `operationalCalculations` registry.** They are not the same, and the product does not require them to be.

Verified registry (`web/lib/operationalCalculations/families/`): **8 registered** — `occupancy.expected`, `occupancy.actual`, `resource.ratio`, `resource.required_staff`, `capacity.room_binding`, `capacity.remaining`, `scheduling.expected_staffing`, `scheduling.actual_staffing`. Everything else in the 14-calc map is either a **canonical resolver** (`resolveConfigRule`, `scheduleRules`, `effectiveDating`, the commercial preview) or **net-new**.

**Resolution (implementation direction, not redesign):** the doctrine "one owner, many consumers; no UI re-derives truth" is satisfied when every value is read from its *single owner* — whether that owner is a registered calculation **or** a canonical resolver module. Therefore:
- **Call registered calcs** via `resolveCalculation(...)` for occupancy/ratio/capacity/staffing.
- **Call the canonical resolver directly** for eligibility (#6 → `resolveConfigRule` + program model), schedule compatibility (#7 → `scheduleRules`), effective-date overlap (#13 → `effectiveDating`), and tuition (#12 → commercial preview). These resolvers **are** the owners; registration is additive, not required for V1.
- **Author + register** the three net-new calcs: room health (#8), conflict count (#9), continuity (#10). These are the only calculations that must be *added*.

This closes the single largest source of "would an engineer guess here?" in the calculation layer.

---

## 1. Layer 1 — Canonical data (validated: no duplicated truth, no missing ownership)

| Projection input | Canonical source | Status |
|---|---|---|
| Enrollment intent | `child_enrollment_agreements` | Already exists (`…slice1.sql`) |
| Placement (room, effective-dated) | `child_placements` (supersede chain) | Already exists |
| Schedule (pattern binding, effective-dated) | `schedule_assignments` (supersede chain) | Already exists |
| Pattern (`weekdays smallint[]`) | `schedule_patterns` | Already exists |
| Sites & rooms | `locations` (`location_type` site/unit) | Already exists |
| Operating windows | `childcare_operating_windows` | Already exists |
| Effective dating | `effectiveDating.ts` + `child/scheduleAssignment` services | Already exists |
| Child identity | `customer_members` + `persons` (**no `children` table** — bind on `customer_member_id`) | Already exists |
| Selected-rate **reference** on commit | *(persisted as a `rateId` link on the committed schedule/financial intent — no amount)* | **Small extension** |

**Proven:** [`buildSchedulingProjection.ts`](../../../web/lib/scheduling/projection/buildSchedulingProjection.ts) loads exactly these rows via the existing services and resolves Current/Upcoming/Temporary/History. No new authoritative table in V1.

**Guess-point discovered by building → resolved:** the `Assignment` contract lists `arriveTime`/`departTime`, but slice-1 stores only `weekdays` on the pattern — **there is no schema source for per-assignment times.** Resolution (not a redesign): **V1 renders weekdays + room + effective dates; `arriveTime`/`departTime` are `null`.** Per-day times are a **Small extension** (a times column on the assignment or pattern metadata) surfaced by the Phase-2 pattern editor. Milestone 1 does not need times. *(A clarifying note is added to the projection contract so no engineer guesses a source.)*

---

## 2. Layer 2 — Operational calculations (owner · inputs · registration)

| # | Calculation | Owner (verified) | Registered? | Class |
|---|---|---|---|---|
| 1 | Expected occupancy | `occupancy.expected` → `aggregateExpectedOccupancyByRoomDate` | ✅ | Already exists |
| 2 | Room capacity / availableNow | `capacity.room_binding`/`remaining` → `resolveOperationalCapacity` | ✅ | Already exists |
| 3 | Ratio tier | `resource.ratio` → `resolveRatio` | ✅ | Already exists |
| 4 | Required staffing | `resource.required_staff` → `resolveRatio` | ✅ | Already exists |
| 5 | Available staffing | Staffing product (G3) | — | **Deferred V2** (unknown-with-reason until connected) |
| 6 | Placement eligibility | `resolveConfigRule` + program model | resolver | **Needs binding** (call resolver in option generator) |
| 7 | Schedule compatibility | `scheduleRules` | resolver | **Needs binding** |
| 8 | Room health (worst-cell R×W) | *net-new rollup over 1–3* | — | **Required implementation** (register; thresholds resolved §Guess-Test) |
| 9 | Conflict count | *net-new rollup over 1–3 per candidate* | — | **Required implementation** |
| 10 | Continuity impact | *net-new, policy-weighted* | — | **Required implementation** (Phase 2) |
| 11 | Projected/expected attendance | `occupancy.*` + `expectedVsActual` | ✅/resolver | Already exists |
| 12 | Tuition / consumption | commercial preview (`evaluate→attribute→expand`) | resolver | **Needs binding** |
| 13 | Effective-date overlap | `effectiveDating` | resolver | **Needs binding** |
| 14 | Future capacity risk | forward run of 1–3 | — | **Deferred V2** (surfacing) |

**Rule enforced:** previews call the *same* owner execution calls (handoff §6) — no second "preview math." Milestone 1 uses only #1–#4 (registered) + #6/#7/#13 (resolvers) + #12 (commercial preview). #8/#9 land with the Roster/options; #10 with temporary moves (Phase 2).

---

## 3. Layer 3 — One projection, every surface (validated)

The canonical [`SchedulingProjection`](../../../web/lib/scheduling/projection/schedulingProjectionTypes.ts) (subject-scoped; `children[]` = N household / 1 child) is the **single** read model. Every surface is an index over the **Assignment** atom — confirmed against `scheduling-projection-contract.md` §7.

| Surface | How it reads the one projection | Class |
|---|---|---|
| Child Focus Panel Scheduling card | `children[0]` (child index) | **built** ✅ (this sprint) |
| Household Focus Panel | `children[]` = N (same shape, multi-child loader) | **Small extension** |
| Scheduling workspace (Overview/Place/Over-Ratio) | aggregate assignments; problems are calc-derived over the atoms | **Required implementation** |
| Roster + drill-down | index by room × day (`RoomWeekSummary`/`RoomDayInspection`) | **Required implementation** (thin) |
| Command Surface | `availableCommands` + subject/current context | **Needs binding** (Action Runtime resolver) |
| BOS | explains over projection fields + `calculationMeta` | **Small extension** |
| Print (future) | snapshot superset of `RoomDayInspection` | **Deferred V2** |

**If a surface seems to need a different projection → extend this model, never duplicate.** Validated: it does not. The child card, roster, and household are the same atoms indexed differently.

---

## 4. Layer 4 — Billing projection (Scheduling ↔ Billing)

Bind to **Commercial Execution V1** (verified: `web/lib/commercial/execution/`), never the older `childcare_rate_*` substrate.

| `BillingScheduleProjection` element | Existing capability | Class |
|---|---|---|
| Write-free pricing (`baseAmount`, recurring) | `evaluate()` + `buildCommercialExecutionPreview` | Already exists |
| Discounts (numeric) | `commercial_policies` → `ResolvedCommercialLine.adjustments[]` | Already exists |
| Funding + **family responsibility** | `attribute()` + `FundingAttribution` (residual → primary payer) | Already exists |
| Effective-dated recurring | `expand()` + `effectiveDating` | Already exists |
| Warnings | preview `warnings`/`notes[]` | Already exists |
| Preview endpoint | `POST /api/admin/commercial/execution/preview` | Already exists |
| **`BillingScheduleProjection` read-shaping** | interim Scheduling-side read over the preview *(approved decision)* → later a Billing-owned endpoint | **Needs binding** |
| `eligibleRates[]` enumeration | resolver picks one today; enumerate configured rates valid for context | **Small extension** |
| Per-rate `overrideRequirements` + approval status | commercial policy concepts exist | **Small extension** |
| Funding `pending` honesty (null + status) | represent unresolved explicitly | **Small extension** |
| Stale-on-config/rate change signal | commercial config version + propagation events exist | **Small extension** |
| Selected-rate **reference** persistence | a `rateId` link on commit (no amount) | **Small extension** |
| Custom-amount override + full approval UI | — | **Deferred V2** |

**Ownership frozen:** Billing determines/owns every amount + the ledger; Scheduling displays the projection and persists only the rate reference. Money uses neutral styling; warning color reserved for pending/blocked/stale.

---

## 5. Layer 5 — Configured commands (no hardcoded behavior)

`schedule` is **already** an `ActionEntityType`; the Action Runtime + Command Surface exist (`web/lib/adminV2/actions/*`, `web/lib/platform/commands/*`). Each Scheduling intent = a `RegisteredAction` (copy `confirmTourAction.ts`) appended to `REGISTERED_ACTION_LIST`, presented via `action_definitions`/`action_placements` config resolved by `resolveActionsForContext`.

| Intent | Registered capability | Class |
|---|---|---|
| Create schedule | `schedule.create` → `createInitialChildPlacement` + `createInitialScheduleAssignment` | **Required implementation** + **Needs binding** (config) |
| Change schedule / Change room / Pattern change | `schedule.change`/`placement.change` → supersede services | Required implementation + Needs binding |
| End schedule | `schedule.end` | Required implementation + Needs binding |
| Fix conflict (over-ratio) | `schedule.resolve` (per option) | Required implementation + Needs binding |
| Review proposed | `schedule.commitProposed` | Required implementation + Needs binding |
| Select rate / Override rate / Request approval | `schedule.selectRate`/`overrideRate`/`requestApproval` | Required implementation + Needs binding |
| Temporary move (shape-parameterized) | `schedule.move` + **the one Command-Surface extension** (date-range + weekday-mask + return-to-primary input) | **Required implementation** (Phase 2) |

Command states `Recommended/Ready/Warning/Blocked/Unavailable` are computed by the runtime over calc deps (**Needs binding**); Blocked shows its configured reason. **No command is hardcoded in the card or workspace.**

---

## 6. Layer 6 — Focus Panel composition (peer cards, no duplication)

Verified card model (`web/lib/adminV2/runtime/focusPanel/`): closed-set keys + `build*CardModel` producer + renderer dispatch; cards are **pure over `OperationalContext`** (no card-level fetch).

| Card | Owner | Class |
|---|---|---|
| **Children** (configurable, Surface Builder) | `buildChildrenCardEvidence` / `children` key | Already exists |
| **Scheduling Summary/Detail** (platform, identity-only) | *new `scheduling` card key (3-layer) + `OperationalContext` projection extension* | **Required implementation** |
| **Current Work** (over-ratio/needs-placement/proposed) | `current_work` key + `buildCurrentWorkCardModel` | Already exists |
| **Billing** (read-only preview) | `billing_preview` key | Already exists |
| **Household** (identity-adjacent) | `buildHouseholdCardModel` | Already exists |
| **Attendance** (context) | expected from schedule | Already exists / seam |
| **Communications** (notify offer) | — | **Deferred V2** |

Frozen: identity Summary carries **no** calculations/health/commands; situation lives on Current Work; Children (config) and Scheduling (platform) are **peers composed by navigation, not embedding**; a Children scheduling **badge** is a pointer, not schedule detail.

---

## 7. Layer 7 — Scheduling workspace (no new primitives)

`WorkspaceShell` already names **Scheduling** as a planned module. Build `SchedulingWorkspaceShell` (copy `CommunicationsWorkspaceShell.tsx`) with modes/section tabs for Overview · Place · Over-Ratio · Roster; add a `"scheduling"` key to `AdminV2WorkspaceModalKey` and mount in `AdminV2Shell`.

**Confirmed: no new workspace primitive is required.** Overview (health line → hero → ranked list → recently-committed), Place, Over-Ratio, and Roster all compose from existing `WorkspaceSurface`/`WorkspaceCard`/`WorkspaceZonePanel`/`WorkspaceMetricTiles`. Class: **Small extension** (coordinator key) + **Required implementation** (the shell composition + section content).

---

## 8. Layer 8 — End-to-end V1 flow (every transition classified)

| Transition | Mechanism | Class |
|---|---|---|
| New child → needs schedule | agreement exists, no operational `schedule_assignment` → projection `status: needs-placement` | Already exists (proven) |
| Needs schedule → Create schedule | Place-a-Child Work card → `schedule.create` command | Required implementation |
| Create → **Billing projection** | interim read over commercial preview | Needs binding |
| Billing → Commit | `createInitial*` services (effective-dated) via the command | Required implementation |
| Commit → Scheduling card | re-run projection loader | built ✅ |
| Commit → Children summary | scheduling **badge** on Children card (pointer) | Small extension |
| Commit → Roster | `RoomWeekSummary` recompute | Required implementation |
| Commit → Attendance expectation | committed schedule = expected attendance (`expectedVsActual`) | Already exists (seam) |
| Commit → Billing | selected-rate reference persisted; Billing owns ledger | Small extension |
| Commit → Operational facts | occupancy/ratio recompute over the new assignment | Already exists |

Every transition maps to a known class. No transition requires a product decision.

---

## 9. Build Readiness Matrix (the single classification — five classes, nothing else)

| Item | Class |
|---|---|
| `child_enrollment_agreements` / `child_placements` / `schedule_assignments` / `schedule_patterns` / `locations` / `childcare_operating_windows` / effective-dating services | **Already exists** |
| Registered calcs #1–#4, #11 (occupancy/ratio/capacity/staffing/attendance) | **Already exists** |
| Commercial preview pipeline + endpoint; discounts/funding/family-responsibility | **Already exists** |
| Action Runtime + Command Surface; `schedule` entity type | **Already exists** |
| Focus Panel runtime; `current_work` / `billing_preview` / `children` / household cards | **Already exists** |
| `WorkspaceShell` + surfaces (Scheduling is a named slot) | **Already exists** |
| Canonical Scheduling projection (child index) | **Already exists (built this sprint)** |
| Eligibility #6 / schedule-compat #7 / effective-date-overlap #13 / tuition #12 → call resolver in option generator/preview | **Needs binding** |
| `availableCommands` resolution (Action Runtime → projection) | **Needs binding** |
| `BillingScheduleProjection` read-shaping (interim Scheduling-side) | **Needs binding** |
| Command eligibility-state computation over calc deps | **Needs binding** |
| Household projection (`children[]`=N loader) | **Small extension** |
| Selected-rate reference persistence (`rateId` link, no amount) | **Small extension** |
| `eligibleRates[]` enumeration · per-rate override requirements · funding-pending · stale signal | **Small extension** |
| Children scheduling **badge** (pointer) | **Small extension** |
| Per-assignment `arriveTime`/`departTime` (times column/metadata) | **Small extension** |
| Workspace coordinator `"scheduling"` key + mount | **Small extension** |
| Room health #8 (+ thresholds) · conflict count #9 (register) | **Required implementation** |
| Problem read model + Overview ranking; Place/Over-Ratio option generators + previews | **Required implementation** |
| Commit adapters / `schedule.*` RegisteredActions + default config | **Required implementation** |
| Roster `RoomWeekSummary` / `RoomDayInspection` indexes | **Required implementation** |
| `scheduling` Focus Panel card (Summary/Detail, 3-layer + OperationalContext) | **Required implementation** |
| `SchedulingWorkspaceShell` composition (Overview/Place/Over-Ratio/Roster) | **Required implementation** |
| Continuity #10 + temporary-move policy + `schedule.move` shape input | **Required implementation** (Phase 2) |
| Available staffing #5 · future-risk #14 · closures table · Communications notify · batch commit · print renderer · roster drag-edit · custom-amount override UI | **Deferred V2** |

---

## 10. Canonical Dependency Map (Scheduling → existing Alloy)

```
Scheduling projection ─── child_enrollment_agreements · child_placements · schedule_assignments
                          · schedule_patterns · locations · childcare_operating_windows
                          via childPlacementService / scheduleAssignmentService / effectiveDating
Calculations ──────────── operationalCalculations registry (occupancy/ratio/capacity/staffing)
                          + resolveConfigRule / scheduleRules / effectiveDating (resolvers)
Billing ───────────────── commercial/execution (evaluate→attribute→expand) via
                          POST /api/admin/commercial/execution/preview  [Billing owns amounts + ledger]
Commands ──────────────── adminV2/actions (RegisteredAction + action_definitions/action_placements)
                          + platform/commands (Command Surface)   [schedule entity type exists]
Focus Panel ───────────── adminV2/runtime/focusPanel (OperationalContext, closed-set card model,
                          COMMIT_CRITICAL_CARD_SPECS)   [current_work/billing_preview/children exist]
Workspace ─────────────── components/workspace/WorkspaceShell + workspaceModalCoordinator
                          [Scheduling is a named module slot]
Mutation/commit ───────── mutations/runtime (resolve→evaluate→commit) + the effective-dated services
BOS ───────────────────── lib/bos (rank + explanation; explains over projection + calculationMeta)
```
Every arrow terminates on a capability that **exists**. Scheduling recreates none of them.

---

## 11. Remaining Implementation Work (ordered by milestone)

**Milestone 1 — create a schedule → preview → commit → reflected in four surfaces** *(step 1 done)*
1. ✅ Canonical projection (child index) — built + green.
2. Needs-placement Work derivation + Focus Panel `scheduling` card (Summary/Detail) + `current_work` reuse.
3. `schedule.create` RegisteredAction + commit adapter (existing services) + default action config.
4. Deterministic create-options (eligible rooms/patterns via #6/#7/#2).
5. Interim `BillingScheduleProjection` read + financial preview.
6. Reflection: Scheduling card · workspace/Overview · Roster `RoomWeekSummary` · Children badge.

**Milestone 2 — the three-problem loop:** over-ratio (#1) + start-conflict (#3) detectors, options, `schedule.resolve`/`change` commits; Roster drill-down (`RoomDayInspection`) + room-health #8; conflict count #9; pattern editor command.

**Milestone 3 — depth:** household subject; configured command placements + eligibility states; continuity #10 + temporary-move policy + `schedule.move` shape input; guards (stale-refresh, undo-as-supersede, degraded states).

---

## 12. Engineering Risk Report (genuine implementation risks only)

| Risk | Severity | Mitigation (frozen) |
|---|---|---|
| Preview math drifts from execution math | High | Previews **must** call the same owner (registered calc or resolver); a boundary test fails if a second math path appears. |
| Non-atomic create (placement then assignment) | Med | Two effective-dated service calls; on partial failure the projection surfaces `missing_schedule_assignment` and the operator retries the schedule step (the established slice-1 behavior). If atomicity is required, wrap both in the mutation-runtime commit phase. |
| `arriveTime`/`departTime` have no slice-1 source | Med | V1 renders null times; a times column/metadata is a Small extension for the Phase-2 editor — **do not synthesize times.** |
| Billing read-shaping temporarily lives in Scheduling | Med | Interim adapter over the write-free preview, clearly marked; replaced by the Billing-owned endpoint without changing the `BillingScheduleProjection` shape. |
| Config not authored for a site | Med | Detectors fail-closed (surface "config incomplete," not a false problem) via `resolveConfigRule` status semantics. |
| Staffing #5 absent (G3) | Low | Occupancy/ratio never depend on staffing; staff-dependent options render unavailable-with-reason, never fabricated. |
| New `scheduling` Focus Panel card touches 3 layers | Low | Follow the closed-set discipline (key + builder + renderer); data via `OperationalContext`, never a card fetch. |

No product risks are listed because none remain.

---

## 13. Product Freeze Report (authoritative — engineering treats as law)

- Scheduling is **decisions in Work**; Studio = configuration only.
- One canonical **subject-scoped, assignment-based projection**; the **Assignment** is the atom; every surface is an index; **no duplication**.
- Lifecycle: **Current · Upcoming · Temporary · History**; **Proposed** is work, not timeline. Term is **Upcoming** (not Future).
- One schedule, many assignments; split-week/per-day = multiple assignments in one schedule.
- **Effective-dated supersede**; committed rows never overwritten; **undo = compensating commit**.
- **Calculations own truth**; no client-side operational math; each value read from its single owner.
- Focus Panel = **Identity · Work · Commands**; Summary is **pure identity**.
- **Children (config) vs Scheduling (platform)** = peer cards, navigation not embedding.
- **Billing owns money + ledger**; Scheduling displays `BillingScheduleProjection` + persists a rate **reference**; numeric discounts/funding; neutral money styling.
- Week structure from **configuration** (locale fallback); no hardcoded weekday order.
- Commands are **configured**, never hardcoded; every mutation goes through a registered command → effective-dated write.
- Temporary moves are **policy-gated, stable-preferred, never preselected or BOS-suggested by default**.
- Roster is **read-first**, drills to actual children, never a source of truth.
- BOS **explains/proposes; never chooses, commits, or invents**.
- Ownership lines: **Enrollment · Scheduling · Billing · Attendance** — one owner each.
- **V1 = three problems** (over ratio · no placement · start-date conflict) + read-first Roster + calc-grounded options + effective-dated commit/undo + numeric financial preview + minimal BOS. Everything else is Deferred V2.

---

## 14. Engineering Guess Test — every open decision resolved (no redesign)

| Where an engineer would guess | Resolution (authoritative) |
|---|---|
| Room-health thresholds (#8) | Worst cell drives R×W. **healthy** = occupancy ≤ `ratioConstrainedCapacity` and within binding; **tight** = occupancy == `ratioConstrainedCapacity` (at the ratio limit, no headroom) or fill ≥ 90% of binding; **over** = occupancy > ratio tier max or > binding. Register as a calc wrapping `resolveRatio` + `resolveOperationalCapacity` + `occupancy.expected`. |
| Week-start config field | `week_start_day` (smallint 0–6) on org/location calendar config; **locale fallback** when null; operating days from `childcare_operating_windows`. Command context carries `weekConfig{weekStart, operatingDays[], visibleDays[], closedDays[]}`. |
| Per-assignment times | **null in V1** — no slice-1 source; times are a Phase-2 Small extension. Do not synthesize. |
| Stale-preview signal | Compare `calculationMeta.inputVersions` (commercial `configVersion` + schedule/placement intent cursor + occupancy fact cursor) at commit; re-preview if any advanced. Reuse `operationalCalculations/propagation` config-change events. |
| Undo window | Convenience "Undo" framing persists until the post-commit confirmation is dismissed **or** the Focus Panel subject changes; after that the affordance reads "Make another change." It is always a compensating commit. |
| Roster materialization | **Compute-on-read** for V1 (8×5 grid is cheap); optional non-authoritative recomputable cache later. |
| Bulk-review UX | V1 = ranked/grouped list with single-commit step-through; **no batch commit** (V2). |
| Which calcs must be registered | Only net-new #8/#9/#10. #6/#7/#12/#13 are called via their canonical resolvers (§0). |

---

## 15. Contradiction Test — every contradiction resolved (one canonical direction)

| Contradiction | Resolution |
|---|---|
| "Future" vs "Upcoming" | **Upcoming** (readiness report; lifecycle doc bannered). |
| "Scheduling owns the rate" vs Billing owns | **Billing determines; Scheduling displays + persists a reference** (readiness report fix). |
| "related children" vs Household | **Household** (composition doc). |
| Three projection docs | **One canonical + two indexes** (card = child index, roster = room×day index). |
| Calc "built" vs "registered" | **§0** — owner-resolver exists; registration required only for #8/#9/#10. |
| `Assignment` times vs schema | **§1/§14** — null in V1; Small extension later. |
| Lifecycle doc's "Future"/"Seasonal" table | Superseded by its own banner + the projection contract; **Upcoming/Temporary** govern. |

No contradiction remains open. One canonical implementation direction stands.

---

## 16. Implementation Kickoff — the exact first milestone

**Milestone 1 — a director creates a schedule, reviews the Billing projection, commits, and sees it reflected in the Scheduling card, the Scheduling workspace, the Roster, and the Children summary.** *(Step 1 — the canonical projection — is already built and green.)*

- **Commit boundary:** each verified sub-step is its own local commit; the milestone closes with a commit that passes the acceptance criteria end-to-end on the dev server (started via `alloy-dev-start`). **No push/merge until authorized.**
- **Tests:**
  - projection lifecycle + partial/completeness (done: 14/14);
  - Work derivation (done);
  - `schedule.create` eligibility/preview/execute (unit, mocked services);
  - commit adapter writes effective-dated `child_placements` + `schedule_assignments` and nothing before Commit (integration);
  - a **preview-parity** boundary test: the create-preview reads the same owners execution uses;
  - reflection: projection re-resolves to `scheduled` post-commit.
- **Expected evidence:** green vitest run for `tests/scheduling/*`; clean `npm run typecheck`; browser evidence of create → financial preview → commit → the four surfaces updating (screenshot + network trace of the commercial preview call).
- **Acceptance criteria:**
  1. An unplaced child (agreement, no operational assignment) shows `Needs a room` + `Place …`.
  2. Create offers ≥1 deterministic eligible room/pattern with a calc-grounded preview and a `BillingScheduleProjection` financial line (interim read).
  3. Commit writes effective-dated rows via the existing services through the `schedule.create` command; nothing is written before Commit.
  4. Post-commit, the Scheduling card reads `Scheduled`, the workspace/Overview drops the problem, the Roster cell reflects the new occupancy, and the Children card shows the scheduling badge.
  5. No new authoritative table; no parallel calculation math; every value read from its single owner.

---

## Cross-references
- [`SCHEDULING-IMPLEMENTATION-READINESS.md`](./SCHEDULING-IMPLEMENTATION-READINESS.md) — entry point; §D build order.
- [`scheduling-projection-contract.md`](./scheduling-projection-contract.md) · [`scheduling-calculation-map.md`](./scheduling-calculation-map.md) · [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) · [`billing-rate-resolution-contract.md`](./billing-rate-resolution-contract.md) · [`scheduling-focus-panel-composition.md`](./scheduling-focus-panel-composition.md) · [`children-scheduling-boundary.md`](./children-scheduling-boundary.md) · [`roster-projection-contract.md`](./roster-projection-contract.md) · [`temporary-move-policy-model.md`](./temporary-move-policy-model.md).
- Built + proven: [`web/lib/scheduling/projection/`](../../../web/lib/scheduling/projection/) · [`web/lib/scheduling/work/`](../../../web/lib/scheduling/work/) · [`web/tests/scheduling/`](../../../web/tests/scheduling/).
