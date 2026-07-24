---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling — product specification (authoritative)

**Status:** Proposed — the single, authoritative Scheduling product definition, refined for real daily operation. Architecture is frozen; this specifies *product and interaction*, not platform. Companions: [`scheduling-calculation-map.md`](./scheduling-calculation-map.md) (the calculation authority), [`roster-projection-contract.md`](./roster-projection-contract.md) (the roster read model), [`temporary-move-policy-model.md`](./temporary-move-policy-model.md) (the anti-shuffle guardrail). This supersedes the product content of [`scheduling-product-v1.md`](./scheduling-product-v1.md).

**The one test, applied to every surface:** *does this help a childcare operator understand and safely change the schedule?* If not, it's cut.

**Core surfaces (frozen):** Overview · Place a Child · Over Ratio · Roster. No new modules. Every state, option, and consequence derives from registered **Operational Calculations** — the product never invents truth ([`scheduling-calculation-map.md`](./scheduling-calculation-map.md)).

---

## 1. Overview — calm operational orientation

The Overview answers one question: **what should I do next?** It is not a dashboard. It reads like a director's mental morning summary, then a prioritized list of decisions.

**Structure (top to bottom):**
1. **One health line** — plain, calculated, honest. *"Most rooms are healthy this week. Sunflower will exceed ratio Thursday. Two children still need rooms."* Generated from room-health + open-problem counts; never decorative, never conversational.
2. **The single most important decision** — the top-ranked open issue, as one prominent, actionable item (not three equal cards).
3. **The prioritized list of remaining decisions** — ranked, grouped, scannable.
4. **Recently committed** — a short, quiet trail (3–5), so the director sees momentum and can revisit. Belongs on Overview: yes, but small and below the fold of attention.
5. **Coming up** — genuinely-actionable future issues only (a projected breach with enough lead time to act). No "Insights module"; these are simply future-dated items in the same list, clearly marked *"next week."*

**The three big cards become the *top* of a ranked list, not the whole Overview.** One hero (most important) + a list. At low volume the list is short; the hero carries the day.

### Overview at every volume

| Volume | What the operator sees |
|--------|------------------------|
| **Zero issues** | The health line reads *"All rooms are in ratio this week and every child has a room."* Below it: recently committed + a calm "nothing needs a decision" state with the Roster one click away. Reassuring and useful — **not empty or broken.** |
| **Normal (3–10)** | Health line → hero (top issue) → ranked list of the rest → recently committed. Fits one screen; no pagination. |
| **High (dozens–100+)** | Health line summarizes by severity (*"6 rooms will exceed ratio; 40 children need rooms this term"*). The list **groups** (by severity, then room, then week) with counts, is **paginated / virtualized**, and offers **filters** (site · program · room · week · problem type) and **saved views** (e.g. "This week, my sites, over-ratio only"). A **bulk review** entry lets the operator step through a group one decision at a time. The three-card hero is suppressed when it would be noise. |

At scale, prioritization is by **severity × urgency × effective-date proximity** (from calculations), then stable secondary sort by room then child name. Grouping and saved views are the scale mechanism, not more cards.

---

## 2. Operator language — questions, not architecture

Operators see the questions they already ask; they never see platform vocabulary.

| Use | Never |
|-----|-------|
| Where does Ethan go? · Choose Ethan's room · Place Ethan | Operational pressure · Decision loop |
| Why is Thursday over ratio? · Fix Thursday | Gap · Simulation · Alternative reality |
| Review change · Commit placement · Review start date | Optimization candidate · Plan canvas · Planning object |
| Who is in Sunflower Thursday? | Pressure · Projection · Runtime |

**The global action is context-specific, not one universal verb.** The primary button reads for the situation: **Place Ethan** · **Fix Thursday** · **Review start date** · **Commit placement**. On the Overview, the top-of-list action is **the next issue's own verb** (not a generic "Resolve"). A neutral **"Fix next"** is acceptable only for the Overview's global "work the top issue" affordance. Prefer the clearer domain verb everywhere it exists.

Every label, heading, status, and empty state is reviewed against this table. Status words operators see: *healthy · tight · over ratio · needs a room · no room yet · committed · needs review · blocked.*

---

## 3. Place a Child

Operator question: **where should this child go?** The workflow is calculation-grounded and distinguishes four option states — never "has space = fine."

**What the card shows (information hierarchy):**
1. **The child and their need** — name, program/age, **required schedule** (pattern), **effective start date**. *"Ethan · toddler · full week · from Monday."*
2. **Rooms, classified** — each eligible room with its **health**, **ratio impact** (before→after), **staffing impact**, **cohort continuity**, **program compatibility**, **capacity**, and **commercial impact** when relevant. Each room is one of:
   - **Recommended** — deterministic, explainable, safe (see below). At most one, preselected.
   - **Eligible** — valid, no tradeoffs worth flagging.
   - **Valid with tradeoffs** — works but carries an advisory (tighter later in term, different age mix).
   - **Blocked** — a hard blocker (full, program-ineligible, closed on required days). Shown, disabled, with the reason.
3. **What changes** — before→after for the chosen room + the four scannable facts (ratio, staffing, tuition, continuity).

**Recommendation rule.** A room is preselected **only** when the recommendation is (a) **deterministic** — from registered calculations + policy, not AI; (b) **explainable** — one plain line of *why*; (c) **safe** — no hard blocker, no advisory the org has marked blocking. If no room meets all three, **nothing is preselected** and the operator chooses.

**No valid room.** When every room is blocked, the card does not fail silently. It states the reason in plain language (*"No toddler room has space Ethan's full week"*), shows the nearest-miss options with their blockers, and offers **operational next steps**: adjust the requested pattern, change the start date, add capacity (Studio/config), or **create operational work** ("hold for waitlist / flag for the director"). It never fabricates a placement.

**Commit + feedback.** Button: **Commit placement**. On commit: a brief success confirmation (*"Ethan is placed in Sunshine, Mon–Fri, from Jul 28"*), the problem clears from Overview, the Roster updates, and the operator **returns to where they were** (Overview list or the child's context), with the next issue ready.

---

## 4. Over Ratio — cause first, then valid fixes

Operator question: **why is Thursday over ratio, and how do I fix it?**

**Cause, in plain language, first.** *"Ava starts Thursday, bringing Sunflower to 12 children against the 11-child two-teacher limit."* Derived from the occupancy projection vs the ratio tier — stated, not implied.

**Then valid ways to resolve it — generated, never hardcoded.** Options are produced from the actual problem against: configured policies, available rooms, effective dates, schedule patterns, child eligibility, staffing facts, ratio rules, room capacity, enrollment commitments, operator permissions, and org preferences. Depending on those, options may include: **move a child** (subject to the temporary-move policy — §5), **change a child's scheduled session**, **delay a start**, **add/reassign staff** (only when staffing truth + authority exist), **leave unresolved** (when the future state is not yet binding), or **escalate / create operational work**. The set is whatever the constraints permit — no fixed menu.

**Every option carries its calculated consequences** (before→after ratio, staffing/labor, tuition, continuity, conflicts) and a **staff-cost marker** (*no new staff* vs *needs a teacher +$180*), so the director's "can I fix this without adding staff?" is answered at a glance. **Options are ranked by the org's configured objective**, with continuity weighted so stable schedules win ties (§5).

---

## 5. Temporary child moves — carefully, never assumed

The product **prefers stable schedules.** "Move a child for the week" is **not** a universal default. A move is one option among many, and its representation, ranking, and availability are governed by tenant policy. Full model: [`temporary-move-policy-model.md`](./temporary-move-policy-model.md). Product surface:

- A move option, when offered, **must state its shape**: *one day · a date range · selected weekdays · permanent · substitute-room-only (primary unavailable)*. The operator picks the shape; the default shape is the **narrowest that resolves the problem** (a one-day breach → a one-day move), not a blanket week.
- A move **shows its continuity consequence** plainly (*"Ethan would be in a different room Thursday only; his teachers and cohort change that day"*) and any policy-required steps (approval, family notification).
- Ranking applies a **continuity penalty** so a move never outranks a stable fix unless the org configured it to, or the facts strongly justify it (the only other option adds cost, or there is no stable alternative).
- Whether a move may be **BOS-suggested** or **preselected** is a tenant policy switch, default **off**. Out of the box, moves are never preselected and never auto-suggested by BOS.

---

## 6. Roster — visualization plus operational inspection

The Roster **visualizes committed and projected reality; it does not own it.** V1 is **read-first**: no drag-and-drop; every change still flows through preview → commit. Full read model: [`roster-projection-contract.md`](./roster-projection-contract.md).

**Always visible** (Room × Week grid): per cell — scheduled count, capacity, health (in ratio · tight · over), fill bar; per room — name, program/age, capacity, **room-week health** chip; closed rooms and operating windows are shown, not blank.

**Drill-down — "who is actually included here?"** Selecting a cell opens an inspector (a **Focus Panel card**, not a separate roster product) showing: room · date · program/age · scheduled child count · capacity · ratio tier · required staff · scheduled/available staff (when known) · health state · **the actual children** · each child's schedule pattern / attendance expectation · child-specific warnings · effective schedule source · committed-vs-proposed state. Interaction: **hover = fast summary; click = full inspector** (Focus Panel). A **child chip → the child's Scheduling Focus Panel** (§7).

**Roster interactions in V1:** hover cell (summary) · click cell (inspector) · click child (child Focus Panel) · open **Fix** from a flagged cell · filter (site · program · room · week) · move between weeks · distinguish **committed vs proposed** · see closed rooms/windows. Read-first; nothing is drag-edited.

**Printing is future, not V1** — but the drill-down uses the [roster projection](./roster-projection-contract.md) that a future print renderer also consumes. Print configuration (fields, grouping, branding, permissioned sensitive data, "printed as of" snapshot) will live in **Studio/Configuration**, and printing will **never become a second source of scheduling truth**. Documented, not built.

---

## 7. The child Scheduling Focus Panel

The canonical scheduling workspace for **one child**: their placement (room · pattern · start), schedule health, any problems they're part of, the **Fix/Place** entry, and read-only downstream tuition. Opened from Enrollment, a roster child chip, or a queue. Same Focus Panel, `decision` archetype.

---

## 8. Commit, undo, and history — honest recovery

Every commit records: the exact change · effective date/range · source problem · selected option · the calculation preview shown · warnings acknowledged · authority (who, permission) · an audit event · downstream refresh · any communication implication (offered, not sent).

**Recovery is honest about effective-dated supersede** (the foundation never destructively patches):
- **Immediately after commit**, the operator sees **Undo** — but Undo is a **new superseding change that restores the prior state**, described as such (*"This will supersede the change back to the previous schedule"*), not a pretend rollback. History remains intact.
- The button says **Undo** only in the brief window right after commit (a convenience framing of the compensating commit); after that it says **Make another change** (open a new decision on the same subject). It never says "revert" if the real operation is a compensating commit.
- **Committed decisions are visible** on the subject (child/room) as a timeline of effective-dated changes; the operator can see that nothing was overwritten.

---

## 9. Multiple changes — V1 verdict: one at a time

Explored, not included by default. V1 ships **one decision, one commit.** A **review tray / batch commit** is **V2**, justified only where a single operational event fans out (one staffing change breaks three rooms; three siblings placed together). V1 keeps it simple: resolve → commit → next. When several issues share a cause, the Overview **groups** them (so the operator sees the relationship) but commits them individually.

---

## 10. Motion, feedback, feel — fast and certain

Continuity over decoration. Specified so the operator never wonders whether a click worked:

- **Hover** cell/row → instant lightweight summary (no fetch); **selection** highlights with the pine rail.
- **Focus Panel open** → the existing surface-hold reveal (incoming establishes before outgoing unmounts); the clicked subject's identity shows immediately, detail hydrates.
- **Option switch** → before/after updates **instantly** from the already-computed preview (no reload, no modal).
- **Commit** → a short progress state on the button → success confirmation → Roster/Overview refresh → next issue offered. The prior context is preserved on return.
- **Stale results / changed reality** → if the underlying calculation changed since the preview was shown (someone else committed, a new enrollment landed), the card shows a quiet *"the numbers changed — review again"* banner and re-previews before allowing commit. **Never commit against a stale preview.**
- **Loading / partial data** → skeleton the cell/card region, reveal on ready (no blank white); if staffing data is incomplete, degrade gracefully (§11), don't block the whole surface.

**Keyboard:** the Overview list and roster grid are arrow-navigable; Enter opens the focused item; Esc closes the Focus Panel returning focus to the originating cell/row; the commit button is reachable and has a visible focus ring. Focus is preserved across open/close and after commit (returns to the next item).

---

## 11. Degraded and high-pressure states

The product stays trustworthy when conditions aren't ideal:

- **Incomplete staffing data** — occupancy/ratio still compute (they don't depend on staff supply); staffing-dependent options ("add a teacher") are shown as **unavailable with a reason** (*"staffing data not connected"*), never fabricated. The room's staffing line reads *"scheduled staff unknown"* rather than a false number.
- **Stale calculations** — flagged (§10); re-previewed before commit.
- **Partial outage** — surfaces that can't load show a scoped retry, not a broken workspace; the Roster degrades to committed-only (drops projections) with a clear marker.
- **Multi-site** — a site filter scopes everything; the health line and counts are per the current filter; "my sites" is a saved view.
- **100 unplaced / many conflicts / multi-week** — grouping + virtualized lists + bulk review (§1); the operator works top-down by severity and never scrolls a wall of equal cards.

---

## 12. BOS in Scheduling — narrow and quiet

BOS **explains and helps find; it never decides or invents.** In V1 it may: explain why a conflict exists, summarize the relevant calculations in plain language, explain why one option is recommended, surface consequences, and help the operator find the next issue. It appears **inside the Focus Panel** (the *why* line under a problem/option) and in the Overview health line's phrasing — and stays **quiet** everywhere else. It must not: manufacture facts, override calculations, silently choose or commit, suggest temporary moves without policy support, or invent staffing availability. If BOS is unavailable, deterministic ranking + rule-based explanations keep the product fully functional.

---

## 13. Cross-product continuity (handoffs only)

| Neighbor | Handoff (V1 unless noted) |
|----------|---------------------------|
| **Enrollment** | new enrollment intent becomes scheduling demand (an unplaced child); "Schedule this child" opens the child Focus Panel. Context preserved both ways. |
| **Attendance** | committed schedules **are** expected attendance; Attendance records actual. Deviations become scheduling problems. (Surface: V2; seam now.) |
| **Staffing** | provides available-staff truth Scheduling **consumes** (never invents); until connected, staffing-dependent options are unavailable-with-reason. |
| **Commercial/Billing** | Scheduling **shows** projected tuition/consumption (read-only); it does not own financial truth. |
| **Communications** | a committed change may **offer** "notify family/staff"; delivery is owned by Communications (V2). |
| **Operational Intelligence** | reads outcomes/patterns; does not own daily resolution. |

Handoffs preserve context (the subject, the week, the filter). Neighbors are not built in this sprint.

---

## 14. V1 / V2 / Future — ruthless

**V1:** Overview (zero/normal/high, ranked list, filters, saved views, groups) · Place a Child (four option states, no-valid-room handling) · Over Ratio (cause-first, generated options, staff-cost marker) · Roster (read-first, room-week health, **cell drill-down to children**, hover/click, filters, week nav, committed-vs-proposed) · child Focus Panel · calculation-grounded options + previews · Commit + **Undo-as-supersede** + subject history · temporary moves **as a policy-gated option** (default: stable-preferred, never preselected) · narrow BOS explanations · Enrollment(in)/Commercial(read-only) integration.

**V2:** Attendance surface · review-tray/batch commit · roster editing (still preview→commit) · BOS-generated options · Communications "notify family" · Insights as future-dated items maturing · saved print templates (see Future).

**Future:** printable/configurable rosters (fields/grouping/branding/permissioned sensitive data/"printed as of") authored in Studio · staffing "add staff" resolutions once staffing supply (G3) is modeled · Commercial/Labor optimization · multi-site rollups in OI.

**Never:** analytics dashboards in Scheduling · a Roster that owns truth · drag-and-drop without preview+commit · client-side computation of operational truth · AI overriding calculations · hardcoded child-shuffling.

---

## 15. Implementation readiness — genuine open questions only

No settled architecture is reopened. The remaining decisions to make before/at build time:

1. **Room-week health rollup rule** — confirm "worst cell drives the chip," and the tight/over thresholds, as a registered calculation ([`scheduling-calculation-map.md`](./scheduling-calculation-map.md) #room_health).
2. **Option-generator policy inputs** — the config surface for org preferences (continuity penalty weight, temporary-move policy) — see [`temporary-move-policy-model.md`](./temporary-move-policy-model.md); confirm where it reads from (Configuration).
3. **Stale-preview detection** — the signal that a preview's inputs changed (config/intent version + relevant fact stream); confirm the cheapest reliable trigger.
4. **Undo window** — how long the convenience "Undo" framing persists before it becomes "Make another change."
5. **Roster projection materialization** — whether the Room×Day summary is computed on read or cached as a non-authoritative projection (must stay recomputable) — see [`roster-projection-contract.md`](./roster-projection-contract.md).
6. **Bulk-review UX** — the step-through interaction for high-volume groups (V1 minimal vs V2).

Everything else is specified. Build order remains [`engineering-handoff.md`](./engineering-handoff.md).

---

## Cross-references

- [`scheduling-calculation-map.md`](./scheduling-calculation-map.md) · [`roster-projection-contract.md`](./roster-projection-contract.md) · [`temporary-move-policy-model.md`](./temporary-move-policy-model.md)
- [`engineering-handoff.md`](./engineering-handoff.md) — build sequence.
- [`mockups/scheduling-product-states.html`](./mockups/scheduling-product-states.html) — production mockups for the daily states.
