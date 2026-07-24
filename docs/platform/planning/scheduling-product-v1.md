---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling — the product (V1, refined)

**Status:** Proposed — the refined, director's-eye product spec. Sharpens [`mvp-product-definition.md`](./mvp-product-definition.md) from the perspective of the person who actually uses it: a childcare director with fifteen minutes between drop-off and a licensing call. Implementation guidance: [`engineering-handoff.md`](./engineering-handoff.md). Final mockups: [`mockups/scheduling-product-final.html`](./mockups/scheduling-product-final.html).

The test for every screen and interaction: **does it help a director schedule children faster and with more confidence?** If not, it's cut.

---

## 1. Scheduling is how enrollment becomes operational reality

A director's day is a stream of questions. Scheduling exists to answer exactly these, fast:

| Director asks | Scheduling answers with |
|---------------|-------------------------|
| *Where does Ethan go?* | **Place a child** — room options, each with its health, recommended one preselected |
| *Why is Thursday over ratio?* | the problem, in one plain line: *"Ava starts Thursday — one over the two-teacher limit"* |
| *Can I solve this without adding staff?* | a **"no new staff"** marker on every option that doesn't |
| *What happens if I delay this child?* | a real option with its before→after and tuition impact |
| *Which room is healthiest?* | room **health** on the roster and in every placement option |
| *Can I commit this change?* | one **Commit**; nothing changes until then |

Everything below serves these six questions.

---

## 2. The complete scheduling workflow — placement to committed

The spine of the product, and it must feel effortless end to end:

```
Enrolled child appears  →  "Ethan needs a room"  →  open it
        →  Where does Ethan go?  (rooms, ranked by fit + health, recommended preselected)
        →  What changes?         (room fills, stays in ratio, +$980/mo, no new staff)
        →  Commit                →  Ethan is placed & scheduled
        →  Roster shows him       →  done
```

And the recurring loop once children are placed:

```
Something shifts (new enrollment, a delay)  →  a problem surfaces on Overview
        →  Resolve (options + tradeoffs)  →  Commit  →  back to work
```

Two entry points, one experience. A director learns it once.

---

## 3. Capability verdicts — V1 / V2 / never

| Capability | Verdict | Why |
|-----------|---------|-----|
| **Overview** — ranked "needs deciding" + week health | **V1** | the director's first 10 seconds |
| **Place a child** (unplaced → room) | **V1** | *"Where does Ethan go?"* — the primary job |
| **Resolve over-ratio** | **V1** | *"Why is Thursday over ratio?"* / *"without staff?"* |
| **Resolve start-date conflict** | **V1** | *"What if I delay this child?"* |
| **Roster** (read-only, with room health + hover detail) | **V1** | *"Which room is healthiest?"* |
| **Commit** (effective-dated) | **V1** | the boundary |
| **BOS** — rank issues + explain + "no new staff" framing | **V1** | speed + confidence, minimally |
| **Attendance** | **V2** | Scheduling *creates* the expected-attendance backbone now (§6); the daily check-in is next |
| **Insights** — "coming up" projected problems | **V2** | forecast is helpful, not required for first value (§7) |
| **Roster editing** (drag-drop) | **V2** | V1 edits through Resolve only |
| **BOS-generated alternatives** | **V2** | V1 options are deterministic |
| **Notify family on a change** (Communications) | **V2** | real seam, not first-day value |
| **Staffing "add staff" resolution** | **never (as-is)** | needs staff-supply modeling (G3) — options resolve by moving children / reducing sessions instead |
| **Analytics dashboards / KPI charts** | **never** | Scheduling surfaces *decisions*, not analytics |
| **A separate "Planning" mode / Studio plan board** | **never** | discarded in synthesis; scheduling is decisions in Work |

---

## 4. The Resolve experience — refined for speed and confidence

The heart of Scheduling. The answers to the sprint's questions:

- **Preselect the recommendation? Yes.** The top option is selected on open, its tradeoffs already shown. The happy path is a single **Commit**. Speed comes from preselection; confidence comes from the alternatives being *right there*.
- **How many alternatives? Two or three, total.** Recommended + one or two. A director resolving between drop-offs cannot weigh eight options. If deterministic search finds more, show the best three and collapse the rest behind *"more options."*
- **When does BOS participate? Only to rank and explain.** It puts the right option on top and writes the one-line *why* (*"keeps Ethan with his cohort, no new staff"*). It does not generate or decide in V1. If BOS is down, severity ranking + rule-based lines keep everything working.
- **How do tradeoffs appear? The same four facts, every time, so they're scannable:** the key number **before → after** (occupancy/ratio), **staff** (with a bold *no new staff* when true), **tuition** delta, **conflicts**. A director learns to read one shape.
- **When does comparison happen? Inline and instant.** Clicking an option re-renders the four facts immediately — no mode, no modal, no reload. (Side-by-side of two options is V2.)
- **When does Commit appear? Always, at the bottom, enabled from open** (recommendation preselected). Label: **Commit**; helper: *"Nothing changes until you commit."*

**The "no new staff" answer is a first-class product move.** Directors live under labor budgets; *"can I solve this without adding staff?"* is the question. Every option carries a clear **no new staff** / **needs a teacher (+$180)** marker, and the recommendation prefers a no-staff solution when one exists.

---

## 5. The Roster — refined

The roster **visualizes reality; it never owns it.** Refined by information layer:

| Layer | Shows |
|-------|-------|
| **Always visible** | per cell: occupancy (X of cap), a **health signal** (in ratio · tight · over), a fill bar. Per room row: name, type, capacity, and a **room-week health** chip (answers *"which room is healthiest?"* at a glance). |
| **On hover** | the cell detail: exact ratio (staff : children), required staff, `availableNow`, the children scheduled, projected tuition — depth without clutter. |
| **Actions in the roster** | click a **flagged (over)** cell → opens **Resolve**; click a **healthy** cell → peek (who's here). That's it. |
| **Read-only** | the grid and every value. All change flows through Resolve → Commit. |

No drag-drop in V1. A director should be able to *read the week in five seconds* and *touch only what's wrong.*

---

## 6. Attendance — the seam Scheduling creates now

**Scheduling creates reality; Attendance observes it.** The relationship is designed in V1 even though the Attendance surface is V2:

- A committed schedule **is** the day's **expected attendance** — the backbone Attendance reads. Scheduling produces it; Attendance does not re-derive it.
- When actual diverges from expected (a child is absent, a room drops under-covered), that divergence is **a new scheduling problem** (coverage / ratio) — it flows back to **Resolve**. Attendance → deviation → Scheduling decision → Commit.
- The V1 Roster already shows the *expected* day; the V2 Attendance surface flips the same day to *expected vs actual*. Same grain (Room × Day), same visualization, one flip.

So V1 does the half that must come first (produce the expected backbone) and leaves the daily check-in to V2 — with the seam already drawn.

---

## 7. Insights — the smallest useful form (V2)

Not analytics. Not dashboards. The **only** Scheduling insight worth surfacing is **tomorrow's problems today**: a short *"coming up"* list of **projected** over-ratio and placement problems for the next 1–2 weeks (three new enrollments will push Sunflower over in October; Caterpillar trends under-filled). Each item opens the **same Resolve card** with lead time. It is forecasting expressed as *early problems*, nothing more — no charts, no trends, no KPIs. **V2**, because resolving *today's* real problems is the complete first offering.

---

## 8. The Scheduling Focus Panel — finalized

The Focus Panel is the **canonical scheduling workspace for one subject** — either **one child** or **one issue**. Same panel, two subjects:

**On a child** (opened from Enrollment, the roster, or a queue) — *"everything about scheduling Ethan"*:
- **Placement** — his room · pattern · start date (or *needs a room*).
- **Schedule health** — is his week in ratio; any problems he's part of.
- **What changes if…** — the Resolve entry for his open decisions (place / move / delay).
- **Downstream** — his projected tuition (read-only, from Commercial) so the director sees the money.

**On an issue** (*Sunflower over ratio Thursday*) — the Resolve decision card (§4).

This is the one scheduling surface a director opens for a single child or a single problem. It is a reusable Focus Panel archetype (`decision`), shipped for Scheduling first.

---

## 9. Cross-product integration — only what improves Scheduling

| Product | Relationship (V1 unless noted) | Why it earns its place |
|---------|-------------------------------|------------------------|
| **Enrollment** | **input** — an approved enrollment with no schedule *is* the "needs a room" problem; "Schedule this child" opens the Scheduling Focus Panel | this is where scheduling work comes from |
| **Commercial / Billing** | **read-only consequence** — every option shows projected **tuition** delta; committing a schedule feeds consumption | directors decide differently when they see the revenue impact |
| **Attendance** | **output seam** (V2) — the schedule is the expected-attendance backbone (§6) | scheduling *is* the thing attendance checks |
| **Communications** | **V2** — committing a room move / delay can offer *"notify the family?"* | real, but not first-day |
| **Processing / OI** | not integrated in V1 | not material to core scheduling; OI-style foresight is the V2 Insights list |

Only Enrollment (in) and Commercial (money, shown) are wired in V1. Everything else is a designed seam, deferred.

---

## 10. Reusable platform capabilities that surfaced (recorded, not pursued)

Per the mission — extract briefly, record, keep building Scheduling:

- **The `decision` Focus Panel archetype** (problem → options → tradeoffs → commit) is domain-neutral; Scheduling ships it first, Attendance/Billing reuse it.
- **The "no new staff" / cost-aware option marker** generalizes to *"resolve within a constraint budget"* — reusable wherever options have a cost the operator is bounded by.
- **Room-week health** generalizes to *subject-period health* (a room over a week, a child over a term).

These are recorded here and in [`decision-rfc-recommendations.md`](./decision-rfc-recommendations.md). No further platform work is done in this sprint.

---

## 11. Engineering readiness — nothing unresolved

No architectural uncertainty remains. The V1 build is fully specified in [`engineering-handoff.md`](./engineering-handoff.md). Refinements this sprint adds to that handoff:

1. **Placement is problem #2's Resolve** — the "Place a child" flow is the unplaced-child decision; room options come from the option generator filtered to rooms with headroom + program eligibility, ranked by health/cohort/tuition.
2. **Option markers** — each option carries `staffDelta` (drives the *no new staff* marker) and `tuitionDelta`, both from existing resolvers; no new computation.
3. **Room-week health** — a derived per-room signal over the week (worst cell drives the chip); reuses `resolveRatio`/occupancy, no new store.
4. **Roster hover detail** — the scheduled-children list per cell comes from committed `schedule_assignments`; already available.
5. **Attendance seam** — no V1 work beyond ensuring the committed schedule is queryable as "expected for a day" (it already is).

Everything is a read over existing calculations plus the one commit path. Implementation can begin at build-step 1 of the handoff.

---

## Cross-references

- [`mvp-product-definition.md`](./mvp-product-definition.md) — the MVP scope this refines.
- [`engineering-handoff.md`](./engineering-handoff.md) — per-screen build spec.
- [`alloy-decision-architecture.md`](./alloy-decision-architecture.md) — the architecture underneath.
- [`mockups/scheduling-product-final.html`](./mockups/scheduling-product-final.html) — the final Scheduling mockups.
