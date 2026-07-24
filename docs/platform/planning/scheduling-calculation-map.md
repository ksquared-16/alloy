---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling — Operational Calculation Map

**Status:** Proposed — the authority map. **Scheduling invents nothing.** Every displayed state, recommendation, comparison, and consequence derives from a **registered Operational Calculation** over canonical Facts and Expectations. No client-side product logic computes operational truth; no recommendation rests on opaque AI. BOS may explain or propose; **deterministic calculations own validity and consequences.**

Companion to [`scheduling-product-spec.md`](./scheduling-product-spec.md). Grain shorthand: **R×D** = Room × Day, **R×W** = Room × Week, **child** = per child.

---

## 1. The map

For each calculation: canonical inputs · output · grain · effective/mode · role (**blocks** / **warns** / **ranks** / **informs**) · where it appears · maturity.

| # | Calculation | Canonical inputs | Output | Grain | Mode | Role | Appears in | Maturity |
|---|-------------|------------------|--------|-------|------|------|-----------|----------|
| 1 | **Expected occupancy** | `schedule_assignments`, `schedule_patterns`, placements, agreements | child count | R×D | current + **projected** | informs; feeds 3,4,7 | Roster cell, Over-ratio cause, Place before→after | **built** — `aggregateExpectedOccupancyByRoomDate()` |
| 2 | **Room capacity** | `childcare_capacity_rules` (physical/licensed/operational), room config | `bindingCapacity`, `availableNow = binding − committed − offered`, `limitingFactor` | room (×D) | current | **blocks** (over binding) | Roster cell, Place (space), no-valid-room | **built** — `resolveOperationalCapacity.ts` |
| 3 | **Ratio tier** | `childcare_ratio_rules` + `_tiers`, age/program, occupancy (1) | applicable tier `(maxChildren, requiredStaff)` | R×D | current + projected | **blocks/warns** (over tier) | Over-ratio cause, Roster health, Place ratio impact | **built** — `resolveRatio.ts` |
| 4 | **Required staffing** | ratio tier (3), occupancy (1), mixed-age policy | `requiredStaff`, `ratioConstrainedCapacity` | R×D | current + projected | informs; **blocks** with 5 | Over-ratio options, Roster cell, Place staffing impact | **built** — `resolveRatio.ts` |
| 5 | **Available staffing** | staffing facts (Staffing product) | `staffOnHand` | R×D | current | **blocks** staff-dependent options; **warns** when unknown | "add teacher" option, Roster staffing line | **not built (G3)** — `staffedCapacity=null`; product shows *unknown*, never fabricates |
| 6 | **Placement eligibility** | program/age of child, room program (`location_program_categories`), operating windows | eligible? + reason | child × room | current | **blocks** (ineligible) | Place (eligible vs blocked), no-valid-room | **built** — `resolveConfigRule.ts` + program model |
| 7 | **Schedule compatibility** | requested pattern, `schedule_patterns`, `childcare_schedule_rules`, `childcare_operating_windows` | compatible? + which days | child × room | current | **blocks/warns** | Place, session-change option | **built** — schedule rules resolvers |
| 8 | **Room health** | occupancy (1) vs capacity (2) vs ratio (3), across the week | `healthy / tight / over` (worst cell drives R×W) | R×D and **R×W** | current + projected | **ranks/informs** | Roster room chip + cells, Place room health | **impl** — thin rollup over 1–3 *(confirm thresholds)* |
| 9 | **Conflict count** | occupancy (1) vs capacity (2)/ratio (3) for a candidate | # blocking + # advisory | per option | projected | **ranks** (0 blocking required to commit) | Over-ratio/Place option consequence | **impl** — compose 1–3 over a candidate |
| 10 | **Continuity impact** | current placement vs candidate (room/teacher/cohort change), duration | continuity delta / penalty | per option | projected | **ranks** (penalty; §temp-move) | move-option consequence, ranking | **impl** — new, policy-weighted ([`temporary-move-policy-model.md`](./temporary-move-policy-model.md)) |
| 11 | **Projected attendance** | committed schedule (expected) vs `child_attendance_events` (actual) | expected list; expected-vs-actual | R×D, child | current + projected | informs | Roster drill-down (expected), Attendance seam | **built** — `expectedVsActual.ts` |
| 12 | **Commercial consumption / tuition impact** | schedule/attendance → `childcare_rate_*`, consumption model | projected tuition/consumption delta | child, option | projected | informs (never blocks) | Place & Over-ratio option (money), child panel | **built** — `operationalConsumption/` (read-only preview) |
| 13 | **Effective-date overlap** | candidate effective date/range vs existing `schedule_assignments`/`child_placements` | overlap? supersede plan | child | current | **blocks/warns** | Place/Over-ratio commit preview | **built** — `effectiveDating.ts` |
| 14 | **Future capacity risk** | forward occupancy (1) vs capacity (2)/ratio (3) over N weeks | projected breach dates | R×D forward | **projected** | informs (Overview "coming up") | Overview future items | **impl** — forward run of 1–3 (V2 surfacing) |

---

## 2. Rules the map enforces

- **One owner, many consumers.** Each row is the *single* definition; the product reads it, never re-derives it. (Two components showing occupancy read #1; they never each count.)
- **Current vs projected is explicit.** Anything forward-looking (a Thursday that hasn't happened, a term forecast) is a **projected** run of the same calculation — clearly labeled in the UI, never conflated with current fact.
- **Confidence / completeness is a first-class state.** When an input is missing (staffing #5 not connected; config incomplete via `resolveConfigRule` status), the dependent output is **`unknown`**, shown as such, and any option depending on it is **unavailable with a reason** — never a fabricated number. Occupancy/ratio never depend on staffing supply, so they stay valid in that degraded state.
- **Role discipline.** A calculation **blocks** only if it's a hard operational/legal constraint (capacity ceiling, ratio tier, eligibility, effective-date overlap); **warns** for advisories; **ranks** for preference (continuity, conflicts, objective); **informs** for context (tuition). Money **never blocks**.
- **Preview = execution.** The before→after a preview shows is computed by the *same* calculation that will compute reality after commit. No second "preview math."

---

## 3. Maturity summary (what's build-ready vs impl work)

- **Built and callable today:** occupancy (1), capacity (2), ratio (3), required staffing (4), eligibility (6), schedule compatibility (7), projected attendance (11), consumption/tuition (12), effective-dating (13).
- **Thin implementation over built calcs:** room health rollup (8), conflict count (9), future capacity risk forward-run (14).
- **New (small, policy-weighted):** continuity impact (10) — the anti-shuffle input.
- **External dependency (not Scheduling):** available staffing (5) — from Staffing (G3); until then, staff-dependent options are unavailable-with-reason.

**Net:** V1 stands on built calculations plus three thin rollups and one new continuity input. No new authoritative store; no client-side truth.

---

## Cross-references

- [`scheduling-product-spec.md`](./scheduling-product-spec.md) — where each calculation surfaces.
- [`roster-projection-contract.md`](./roster-projection-contract.md) — the read model that packages 1–4, 8, 11 for the roster.
- [`temporary-move-policy-model.md`](./temporary-move-policy-model.md) — continuity impact (10) as ranking input.
