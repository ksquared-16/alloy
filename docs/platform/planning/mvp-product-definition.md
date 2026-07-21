---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling V1 — MVP product definition

**Status:** Proposed — **superseded for product content by [`scheduling-product-spec.md`](./scheduling-product-spec.md)** (and the daily-ops refinements after it). Retained for the original MVP scope framing and the three-problem V1 boundary. Read the product spec and [`SCHEDULING-IMPLEMENTATION-READINESS.md`](./SCHEDULING-IMPLEMENTATION-READINESS.md) for the authoritative, current definition.

This defines the **smallest complete product we could ship to a first customer today**, built entirely on Alloy's existing substrate. Engineering handoff: [`engineering-handoff.md`](./engineering-handoff.md).

---

## 1. The MVP in one sentence

> **When a scheduling problem appears, an operator opens Scheduling, sees what needs deciding, picks from a few clear options with their tradeoffs, and commits — in under a minute.**

V1 proves the whole Decision architecture on the three most common, most painful scheduling problems, using data and calculations Alloy already computes. It ships as **three screens** and **one Focus Panel card**. Nothing else.

**Why this is shippable today:** the entire operational substrate already exists — committed placements and schedules (`child_placements`, `schedule_assignments`), the ratio/capacity resolvers (`resolveRatio`, `resolveOperationalCapacity`), and the Room×Day occupancy projection (`aggregateExpectedOccupancyByRoomDate`). V1 is a *surface* over built calculations plus one commit path. No new runtime, no new data model.

---

## 2. Scope — three problems, nothing more

V1 detects and resolves exactly three problems. Each is detectable **today** from existing calculations, and each commits through **one** existing write path.

| # | Problem | Detected from | Resolutions offered (V1, deterministic) | Commits to |
|---|---------|---------------|------------------------------------------|-----------|
| 1 | **Over ratio** — a room/day projects over its ratio tier | `aggregateExpectedOccupancyByRoomDate` vs `resolveRatio` | move a child to a room with headroom · drop a session · *(add staff = V2)* | `schedule_assignments` (supersede) |
| 2 | **Child without placement** — enrolled, no committed schedule | `child_enrollment_agreements` with no active `schedule_assignments` | place in a valid room + pattern (1–2 candidates) | `child_placements` + `schedule_assignments` |
| 3 | **Start-date conflict** — a child's start day would breach ratio/capacity | start date × `resolveOperationalCapacity`/`resolveRatio` | delay start to the next clear day · place in an alternative room | `schedule_assignments` (effective date) |

**Explicitly out of V1 scope:** every other scheduling problem (transfers, closures/holidays, waitlist conversion, multi-week rebalancing, term planning). We prove the architecture on three problems; we do not solve scheduling.

---

## 3. Feature list — Required / V2 / Future

Ruthless. If it isn't needed for the first customer's first useful day, it's not V1.

| Capability | Verdict | Note |
|-----------|---------|------|
| Detect the 3 problems, ranked | **V1** | the "what needs deciding" list |
| Resolve a room ratio issue | **V1** | problem #1 |
| Place an unassigned child | **V1** | problem #2 |
| Delay a start date | **V1** | problem #3 (also an *option* under #1) |
| Compare 2–3 alternatives with tradeoffs | **V1** | deterministic options; before/after |
| Commit a decision | **V1** | the boundary; effective-dated supersede |
| View roster (read-only) | **V1** | one visualization; flagged cells link to a decision |
| BOS: highlight issues + explain tradeoffs | **V1** | smallest valuable BOS (§8) |
| BOS: *generate* alternatives (AI) | **V2** | V1 options are deterministic |
| Insights / forecast future issues | **V2** | projected pressure; not needed for first value |
| Roster editing (drag-drop) | **V2** | V1 edits via the decision card only |
| Compare > 3 options / saved candidate sets | **V2** | |
| Cross-workspace decision hand-off | **V2** | (a known platform gap) |
| Staffing optimization / "add staff" resolution | **Future** | needs staff-supply modeling (G3, not built) |
| Commercial optimization · Labor optimization | **Future** | other decision domains |
| Attendance / Billing / Processing decision domains | **Future** | same architecture, later domains |
| Multi-decision replay / audit timeline | **Future** | |

---

## 4. The operator journey (V1, complete)

Six steps, and the operator is done:

1. **Open Scheduling.** Lands on **Overview** — *"3 things need attention,"* ranked.
2. **Understand at a glance.** The top item reads in plain language: *"Sunflower is over ratio Thursday — 12 in a room that holds 11."*
3. **Open it.** One click → the **Decision card** (Focus Panel).
4. **See the recommended change, preselected**, with its tradeoffs already shown: *now 12/11 over → after 11/11 in ratio; no labor or tuition change.*
5. **Compare** (optional). Click another option; the tradeoffs update. Choose the one that fits.
6. **Commit.** One click. The change writes; the problem clears; the operator returns to Overview.

Happy path is **two clicks**: open the problem, commit the recommendation. That is the whole product.

---

## 5. The Resolve experience — the simplest interaction

The decision card is a single panel, not a wizard. Everything is visible at once, top to bottom:

```
What needs deciding      →  the problem, plain language + severity
Options                  →  2–3, ranked, recommended preselected (radio)
What changes             →  before → after for the key number + labor/tuition/conflicts
                            (updates instantly when you switch options)
[ Commit ]               →  "nothing changes until you commit"
```

- **Preselected recommendation** means the happy path needs no comparison — just Commit.
- **Switching an option** re-renders "What changes" from the (already-computed) preview. No load, no modal.
- **Reversible until Commit.** No draft to save, no plan to name. The panel *is* the decision; closing it discards it.

This is the operator's entire mental model: *problem → options → what changes → commit.* They never see "simulation," "gap," "optimization," or "reality."

---

## 6. Focus Panel V1 — the Decision card

The one new Focus Panel card. It is the whole resolve experience in a card, and it is the **only** decision surface in V1.

**In V1:** problem statement + severity · 2–3 ranked options (one recommended) · before→after tradeoff for the key metric + labor/tuition/conflict deltas · a Commit button · a "History" tab stub (shows the committed decision after commit).

**Hidden in V1:** anything not on the path to a commit — no branching, no saved candidate sets, no cross-domain cards, no manual multi-field editing, no AI chat.

**Waits for V2:** BOS-generated options, richer multi-option comparison, forecast-sourced problems appearing in the card.

It is a **reusable archetype** (`decision`) — but V1 ships exactly one instance (Scheduling). Attendance/Billing/etc. reuse it later with zero card work.

---

## 7. Roster V1 — read-only

The roster **visualizes reality; it does not own it.**

**V1 does:** render the committed Room × Day grid for a week (occupancy / ratio / fill per cell, from the existing projection); navigate weeks; flag over-ratio cells; **a flagged cell links to the decision** for that problem.

**V1 does not:** allow drag-drop or inline editing. All change happens through the decision card and Commit. The roster is a window, not an editor. (Editing is V2.)

---

## 8. Insights V1 — removed

**Insights is not in V1.** Forecasting is *projected* pressure — valuable, but not required for a first customer to get value from resolving *today's* real problems. Detecting and resolving the three present-tense problems is the complete first offering. Insights returns in **V2** as its smallest useful form: a short list of *projected* over-ratio/placement problems (the same three problem types, read forward), each opening the same decision card with lead time.

---

## 9. BOS V1 — the smallest valuable assistant

Two things, no more:

1. **Highlight issues.** BOS ranks the open problems so the most urgent is on top of Overview. (It surfaces; it does not create work.)
2. **Explain tradeoffs.** One plain-language line per option — *"keeps Ethan with his cohort, no labor change."*

**Not in V1:** BOS does not *generate* options (V1 options are deterministic search over valid rooms/patterns), does not choose, and never commits. This is the ratified boundary, minimally expressed. If BOS is unavailable, V1 still works: deterministic ranking by severity, and short rule-based explanations.

---

## 10. Screen inventory (V1)

| Screen | Purpose | Owns |
|--------|---------|------|
| **Overview** | what needs deciding, ranked | the problem list + light "this week" summary |
| **Decision card** (Focus Panel) | resolve one problem | options · tradeoffs · commit |
| **Roster** | see committed reality | read-only Room × Day grid, week nav, flag→decision link |

Three screens. No Studio (V1 consumes already-authored config — ratio rules, patterns, rooms). No Insights. No settings surface (reuses existing configuration).

Production mockup: [`mockups/scheduling-decision-mockups-final.html`](./mockups/scheduling-decision-mockups-final.html) — Overview, an interactive decision (click options to compare), and the Roster. No annotations; this is the product.

---

## 11. V2 roadmap (next, once V1 ships value)

1. **Insights** — projected versions of the three problems (forecast → same decision card).
2. **BOS-generated options** — non-obvious alternatives beyond deterministic search; measured against deterministic quality.
3. **Roster editing** — drag-drop that opens a decision (still commits through the boundary).
4. **Richer comparison** — more than three options; side-by-side.
5. **Second decision domain** — Attendance or Processing, reusing the decision card unchanged (proves the platform).

## 12. Deferred (future platform)

Staffing supply & "add staff" resolutions (needs G3 staff modeling) · closures/holidays · Commercial/Labor optimization · cross-workspace decision hand-off · multi-decision replay/audit · term-scale rebalancing.

---

## Cross-references

- [`alloy-decision-architecture.md`](./alloy-decision-architecture.md) — the accepted architecture.
- [`engineering-handoff.md`](./engineering-handoff.md) — per-screen implementation spec + build sequence.
- [`mockups/scheduling-decision-mockups-final.html`](./mockups/scheduling-decision-mockups-final.html) — the V1 product mockup.
