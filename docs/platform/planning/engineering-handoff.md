---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling V1 — engineering handoff

**Status:** Proposed — implementation-ready. Companion to [`mvp-product-definition.md`](./mvp-product-definition.md). Nothing here is conceptual: every screen maps to existing Alloy tables, calculations, and capabilities. **No new runtime; no new data model.** Where a name is uncertain in current code, it is marked *(confirm)*.

---

## 1. What already exists (build on this, don't rebuild)

| Need | Existing asset |
|------|----------------|
| Committed schedule truth | `child_enrollment_agreements` → `child_placements` → `schedule_assignments` (effective-dated, supersede) |
| Schedule patterns | `schedule_patterns` (`weekdays smallint[]`, `schedule_type_key`) |
| Ratio rules (stepped tiers) | `childcare_ratio_rules` + `childcare_ratio_rule_tiers` |
| Capacity rules | `childcare_capacity_rules` (physical/licensed/operational) |
| Rooms | `locations` (`location_type='unit'`) |
| Occupancy projection (Room×Day) | `web/lib/childcareOperational/expectations/scheduleExpectationCore.ts` → `aggregateExpectedOccupancyByRoomDate()` |
| Capacity truth (`availableNow = binding − committed − offered`) | `web/lib/childcareOperational/capacity/resolveOperationalCapacity.ts` |
| Ratio truth (`requiredStaff`, `ratioConstrainedCapacity`) | `web/lib/childcareOperational/capacity/resolveRatio.ts` |
| Config scope resolution | `web/lib/childcareOperational/config/resolveConfigRule.ts` |
| Effective-dated write (supersede) | `web/lib/childcareOperational/effectiveDating.ts`; `scheduleAssignmentService.ts`, `childPlacementService.ts` |
| Commit path (atomic + outbox) | the Execution/mutation runtime (`web/lib/mutations/runtime.ts`) |
| Focus Panel card runtime | `web/lib/adminV2/runtime/focusPanel/*`, `web/components/admin/focusPanel/*` |
| Workspace shell (Work) | `web/components/workspace/WorkspaceShell.tsx` (Scheduling is a named intended inheritor) |
| Attention / BOS | `web/lib/bos/*` (rank + explanation) |

**The only greenfield in V1** is (a) a *problem-detection* read model over the three problem types, (b) a *deterministic option generator*, and (c) the *decision Focus Panel card*. Everything else is wiring.

---

## 2. New pieces to build (the whole V1 surface)

1. **Problem read model** — `web/lib/scheduling/problems/*` *(new)*: three detectors returning a uniform `SchedulingProblem { id, kind: 'over_ratio'|'unplaced'|'start_conflict', subject, room, date, severity, summary }`. Pure reads over the calculations in §1. Derived, not stored.
2. **Option generator** — `web/lib/scheduling/options/*` *(new)*: given a problem, enumerate valid resolutions (deterministic search over rooms with headroom / valid patterns / next clear day), each with a **preview** (before→after via the same resolvers) and deltas (labor/tuition/conflicts). Returns `Option[]`, ranked.
3. **Decision card** — register `decision` in the Focus Panel card library *(new archetype instance)*; renders problem → options → tradeoffs → Commit.
4. **Commit adapter** — `web/lib/scheduling/commit.ts` *(new, thin)*: map a chosen option to effective-dated writes via existing `scheduleAssignmentService` / `childPlacementService`; run inside the mutation runtime's commit (atomic + outbox).

---

## 3. Per-screen specification

### Screen A — Overview ("what needs deciding")

| | |
|---|---|
| **Purpose** | Land the operator on the ranked list of open scheduling problems for the current site/week. |
| **Primary workflow** | Load site+week → run the three detectors → rank (BOS or severity fallback) → render list; click a problem → open its Decision card. |
| **Data required** | agreements, placements, schedule_assignments, patterns, ratio/capacity rules; occupancy projection for the week. |
| **Platform capabilities** | `WorkspaceShell` (Work mode, Overview pattern) · Operational Calculations (projection) · BOS (ranking) · attention surfacing. |
| **Dependencies** | Problem read model (§2.1). |
| **Priority** | **P0** — entry point. |

### Screen B — Decision card (Focus Panel)

| | |
|---|---|
| **Purpose** | Resolve one problem: understand → compare options → commit. |
| **Primary workflow** | Open on a `SchedulingProblem` → generate options (recommended preselected) → show before→after for the selected option → operator switches options (re-render tradeoffs, no reload) → **Commit** → write + close + clear problem. |
| **Data required** | the problem; per option: target room/pattern/date, the preview projection (occupancy/ratio) and deltas (labor/tuition/conflicts). |
| **Platform capabilities** | Focus Panel card runtime (new `decision` archetype) · Operational Calculations (preview per candidate) · Execution runtime **commit** phase + effective-dating (the boundary) · BOS (per-option explanation). |
| **Dependencies** | Option generator (§2.2), Commit adapter (§2.4). |
| **Priority** | **P0** — the core. |

### Screen C — Roster (read-only)

| | |
|---|---|
| **Purpose** | Show committed Room×Day reality; route from a flagged cell into a decision. |
| **Primary workflow** | Load week → render grid from the occupancy projection + capacity/ratio per cell → flag over-ratio cells → click flagged cell opens the matching Decision card. |
| **Data required** | occupancy projection, capacity/ratio per room/day, room list. |
| **Platform capabilities** | `WorkspaceShell` (Work section) · Operational Calculations (read). |
| **Dependencies** | Problem read model (for the flag→decision link). |
| **Priority** | **P1** — ships in V1 but after A+B. |

---

## 4. Build sequence

| Step | Deliverable | Proves |
|------|-------------|--------|
| 1 | Problem read model — `over_ratio` detector only | pressure is detectable on real data |
| 2 | Decision card (read-only options + tradeoffs, no commit) | the operator can see options + consequences |
| 3 | Option generator — deterministic (move child / drop session) | alternatives are real and previewed |
| 4 | Commit adapter → `schedule_assignments` supersede | **the whole loop works end-to-end for problem #1** |
| 5 | Overview list + BOS ranking + explanation | the entry point + smallest BOS |
| 6 | Detectors #2 (unplaced) + #3 (start conflict) + their options/commit | full V1 scope |
| 7 | Roster (read-only) + flag→decision link | the visualization |

**Milestone (end of step 4):** an operator resolves an over-ratio problem end-to-end — see it, compare options, commit an effective-dated schedule change — on real customer data. That is the demoable heart of V1.

---

## 5. Acceptance criteria (V1 is done when)

- The three problem types are detected on real data and ranked on Overview.
- Each opens a Decision card with ≥1 deterministic recommended option and (where they exist) alternatives, each showing before→after + deltas.
- Commit writes effective-dated `schedule_assignments` (and `child_placements` for #2) atomically, via the existing services; the problem clears; nothing is written before Commit.
- The Roster renders committed reality read-only and links flagged cells to their decision.
- BOS ranks problems and explains options; if BOS is down, severity ranking + rule-based explanations keep V1 fully functional.
- No new runtime, no new authoritative table, no parallel calculation math (all previews call the existing resolvers).

---

## 6. Risks & guards

| Risk | Guard |
|------|-------|
| Preview math drifts from execution math | Preview **must** call the same `resolveRatio`/`resolveOperationalCapacity`/`aggregateExpectedOccupancyByRoomDate` — never a second implementation. |
| "Add staff" tempting but unbuildable (G3) | Excluded from V1 options; ratio problems resolve by moving children / reducing sessions only. |
| Scope creep into transfers/closures/waitlist | Locked to the three problems; anything else is V2/Future ([`mvp-product-definition.md`](./mvp-product-definition.md) §3). |
| Config not authored for a site | Detectors fail-closed (surface "config incomplete," not a false problem); reuse `resolveConfigRule` status semantics. |

---

## Cross-references

- [`mvp-product-definition.md`](./mvp-product-definition.md) — scope, journey, feature list.
- [`alloy-decision-architecture.md`](./alloy-decision-architecture.md) — the architecture the composition implements.
- [`../core/placement-system.md`](../core/placement-system.md) — the committed foundation V1 writes to.
