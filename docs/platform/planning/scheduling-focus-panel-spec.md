---
owner: platform
status: proposed
last_reviewed: 2026-07-21
supersedes: []
---

# Scheduling Focus Panel — composition & card specification (authoritative)

**Status:** Proposed — the authoritative specification for the Scheduling experience inside the Focus Panel. Architecture is frozen; this composes existing primitives (Focus Panel, `decision`/card runtime, Command Surface, Operational Calculations) — **no new card runtime, no second child source of truth, no household-level authority, no in-place edits to committed rows.** Companions: [`scheduling-card-projection.md`](./scheduling-card-projection.md) (the read model), [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) (every value's owner + the configured-command matrix + the gap report).

> **Refined by [`scheduling-focus-panel-composition.md`](./scheduling-focus-panel-composition.md) (final).** The card model below (§1–3) is superseded on one point: the **Summary card is pure identity** — the situation line, health, ratio talk, and recommendations move out to a separate **Work card** (Current Work / Needs Attention), and siblings become quiet **Household** context. This doc's label↔value patterns (§4), proposed-vs-committed (§6), transitions (§9), and configured-command model (§7–8) remain valid. Read the composition doc first.

---

## 1. The two-layer card model

One card, two layers, one subject (the child). Both are **read-first**; editing is an intentional command (§7).

- **Layer 1 — Summary Card:** answers the child's scheduling state in **five seconds**. Leads with meaning, ends with the next action.
- **Layer 2 — Detail Card:** the complete scheduling workspace for one child, in **compact grouped rows** — never a settings form.

Both render from one [Scheduling Card Projection](./scheduling-card-projection.md); the Summary is a projection of the Detail's most decision-relevant fields.

---

## 2. Summary Card — anatomy & states

**Anatomy (top → bottom):**
1. **Status chip** — explicit word, never color alone: `Healthy` · `Needs a room` · `Conflict` · `Proposed` · `Change scheduled` · `Ended` · `Needs review`.
2. **Title:** `Schedule`.
3. **Meaning-first line** (the identity): `Sunshine · Mon–Fri · begins Jul 28`.
4. **Health / situation line:** `Healthy · In ratio · No additional staff` — or the conflict/recommendation sentence.
5. **Next-change line** (only when there is one): `Change scheduled for Aug 4` — else omitted.
6. **Quiet sibling hint** (only when operationally relevant — §5): `Ava & Noah also at Maple St`.
7. **Actions:** a **primary** and optional **secondary**, both **configured** (§8): `View schedule` · `Change schedule`.

**States (each with its exact language + primary action):**

| State | Meaning-first line | Situation line | Primary action |
|-------|--------------------|----------------|----------------|
| **Healthy (committed)** | `Sunshine · Mon–Fri · begins Jul 28` | `Healthy · In ratio · No additional staff` | View schedule |
| **Needs placement** | `Needs a room · Mon–Fri · begins Jul 28` | `Two rooms fit. Sunshine preserves cohort continuity.` | Place Ethan |
| **Conflict** | `Sunflower · Mon–Fri` | `Thursday will exceed ratio when Ava starts.` | Fix Thursday |
| **Proposed change** | `Proposed: Sunshine · Mon–Fri · begins Jul 28` | `9 of 11 · In ratio · No new staff` (shown *beside* current — §6) | Review change |
| **Future committed change** | `Sunshine · Mon–Fri` | `Change scheduled for Aug 4: moves to Rainbow` | View schedule |
| **Ended** | `Ended Jun 30 · was Sunshine · Mon–Fri` | `No current schedule` | Create schedule |
| **Partial / degraded** | `Sunshine · Mon–Fri · begins Jul 28` | `In ratio · staffing not connected` (missing data named, never faked) | View schedule |

Five-second scan path: **chip → meaning line → situation → action.** No field grid.

---

## 3. Detail Card — groups (read-first)

The full workspace, as **compact grouped rows** (§4). Only meaningful operational groups; only what helps understand or act:

1. **Placement** — room · program · site (stacked group).
2. **Weekly schedule** — pattern · effective dates.
3. **Operational health** — calc-backed small object: ratio state · occupancy · staffing · projected tuition.
4. **Expected attendance** — from the committed schedule (the days the child is expected).
5. **Warnings & freshness** — calc-derived warnings + "as of" freshness when relevant.
6. **Related children** — quiet sibling section (§5).
7. **Schedule history** — effective-dated timeline (compact rows).
8. **Actions** — the **configured** commands for this subject/state (§8).

Commercial (tuition) appears as a single informational line under health — it never blocks. History is read; it is the audit trail of effective-dated changes (never overwritten).

---

## 4. The label–value pattern (the association fix)

The wide two-column `Room …… Sunshine` pattern is **banned** inside the Focus Panel. Four patterns, each with a defined use:

### 4a. Meaning-first statement (headline & situation)
`Sunshine · Mon–Fri · begins Jul 28` — the operator reads a meaningful object, not fields. Use for the Summary identity/situation and any single-object summary.

### 4b. Compact stacked group (grouped objects)
```
PLACEMENT
Sunshine
Toddler · Maple Street
```
A small uppercase eyebrow label, then the value(s) stacked tightly beneath. Use for Placement, Schedule, and any 1–3-line object. Label and value are vertically adjacent — never separated by empty horizontal space.

### 4c. Small operational object (calc-backed facts)
```
OPERATIONAL HEALTH
In ratio · 9 of 11
No additional staff
Projected tuition $980/month
```
A titled mini-block of tight statements. Use for health, attendance, commercial.

### 4d. Controlled paired rows (short tabular pairs only)
For genuinely tabular short pairs (history entries, effective dates), a **tight internal grid** where the value sits immediately right of the label — `Effective Jul 28` — **never** edge-to-edge with a leader. Column is content-width, not card-width.

### 4e. Two columns — only to compare two objects
Reserved for **current vs proposed** (§6) or **room A vs room B**. Never for a single object's label/value.

**Rules enforced:** label and value visually associated · no long empty horizontal space · no settings-form aesthetic · meaning-first phrases preferred · two columns only for comparison · **stack, don't stretch, on narrow panels** · dense info stays scannable via grouping.

---

## 5. Sibling scheduling context

Scheduling authority is **child-specific**; siblings are **context, never merged**. The active child stays primary.

- **Where:** a quiet **Related children** section — full on **Detail**; on **Summary** only a one-line hint, and only when **operationally relevant** (shared site/days, or a placement recommendation cites continuity).
- **Content per sibling:** name — room · pattern (· site if different) · status; unscheduled sibling shows `Needs a room`.
- **Which siblings:** operationally-relevant first; all shown on Detail but **collapsed after 3** ("+2 more"). **Hidden entirely for single-child households.** Different sites are labeled with the site.
- **Interaction:** a sibling row **opens that child's Summary Card in the same Focus Panel** (subject swap), preserving the family context; **Back returns** to the original child/issue without losing it (§9 traversal).
- **Recommendations may reference sibling continuity** as a ranking input ("Sunshine preserves cohort continuity") — but **co-location is never assumed preferable**; continuity is a configurable calculation input, not a hard constraint ([`temporary-move-policy-model.md`](./temporary-move-policy-model.md), [`scheduling-calculation-map.md`](./scheduling-calculation-map.md) #10a).
- **Incomplete data:** if a sibling relationship or schedule is unavailable, show `schedule unavailable` — never fabricate.

---

## 6. Proposed vs committed — never mistake preview for truth

The card distinguishes seven states with **explicit language, not color alone**: `Needs a room` · `Proposed` · `Starts Jul 28` · `Change scheduled for Aug 4` · `Committed` · `Ended Jun 30` · `Needs review`.

A **proposed change is shown *beside* the committed current** (the one sanctioned two-column use, §4e):
```
CURRENT (committed)          PROPOSED (not yet committed)
Sunflower · Mon–Fri     →    Sunshine · Mon–Fri
12 of 11 · over              9 of 11 · in ratio
```
The proposed side is clearly badged **Proposed**, is write-free, and only becomes truth at Commit. A **stale proposal** (its inputs changed) shows `Needs review` and re-previews before commit ([`scheduling-product-spec.md`](./scheduling-product-spec.md) §10).

---

## 7. Create, Change, End — intentional, via the Command Surface

The card is read-first. Editing launches a **configured command** (§8) into the existing **Command Surface**, which owns inputs → preview → warnings → confirmation → commit → success. The card refreshes after commit. **No always-editable field form; no raw in-place mutation of committed effective-dated rows** — every change is an **effective-dated supersede**.

| Intent | Operator provides | Auto-resolved (calc/config) | Write path |
|--------|-------------------|-----------------------------|------------|
| **Create schedule** | eligible room, pattern (confirm), effective start | eligible rooms (ranked), ratio/occupancy/tuition preview | new `child_placements` + `schedule_assignments` |
| **Change schedule** | the intended change | current schedule, affected dates, before→after consequences | supersede `schedule_assignments` |
| **Change placement** | the new room | eligibility, health impact, continuity cost | supersede `child_placements` (+schedule if needed) |
| **End schedule** | effective end | downstream consequences; **end ≠ cancel** (end = planned close, keeps history; cancel = never happened) | close/supersede with reason |
| **Fix conflict** | the chosen option | the generated options + previews (over-ratio flow) | per chosen option |
| **Review proposed change** | approve / discard | the proposal + fresh preview | commit or discard |

Editing happens **through the Command Surface**, not inline in the card — the card presents the *result*; the command owns the *change*.

---

## 8. Commands are **configured**, never hardcoded

Scheduling must not hardcode command availability, labels, placement, ordering, or entry points. All actions resolve through the existing **Action / Operational Command Runtime**. Ownership:

- **Platform owns:** registered capabilities, subject types, payload validation, eligibility evaluation, required inputs, preview construction, execution, audit, refresh behavior, and the **invariant-owning write paths**.
- **Configuration owns:** which commands are available, where they appear, ordering, operator-facing labels, visibility rules, process/stage applicability, confirmation wording, recommendation level, and **command placement** in the Focus Panel and workspace.
- **Scheduling owns:** providing the correct **subject + operational context**, **rendering the configured commands** in the inherited surface, supplying the **Scheduling projections/calculations** eligibility and preview consume, and **refreshing** the card/Roster/Overview after execution.

**Command states** (from eligibility evaluation): `Recommended` · `Ready` · `Warning` · `Blocked` · `Unavailable`. A **Blocked** command shows its configured/operator-safe reason rather than silently disappearing. The card **never assumes every tenant exposes the same commands** — the visible set resolves from configuration for the current org · business process · stage · subject type · child · placement/schedule state · card context · operator permissions · configured placement.

The `View schedule` / `Change schedule` / `Place Ethan` / `Fix Thursday` labels in this spec are **illustrative operator intents**, not a hardcoded UI list. The binding of each intent to a registered capability is the [Configured Command Binding Matrix](./scheduling-binding-matrix.md#configured-command-binding-matrix).

---

## 9. Summary → Detail → Command → committed → Summary

The interaction spine inside one Focus Panel, one subject:

1. **Summary → `View schedule` → Detail expands in place.** Same Focus Panel, same subject; the Detail is an **expanded state** of the same card, not a route change. The summary identity remains as the Detail's header. Queue/Roster context stays stable; the URL keeps `:childId`.
2. **Summary/Detail → `Change schedule` → Command Surface opens inside the same Focus Panel.** The command flow (inputs → preview → confirm) runs as an inline focused surface; the card/context remains visible behind or above it; **unsaved proposed changes are clearly badged Proposed** and are discardable.
3. **Commit → success → the card refreshes** to the new committed state; the operator returns to where they were (Detail, or the Overview/Roster item), with **prev/next traversal** preserved.
4. **Sibling switch** swaps the subject to the sibling's Summary and back (§5), preserving family context.

**Motion explains continuity, not a page transition** — surface-hold reveal; the subject's identity is stable throughout; the operator never wonders whether a click worked ([`scheduling-product-spec.md`](./scheduling-product-spec.md) §10).

---

## 10. Focus Panel composition (universal model preserved)

- **Subject:** the child. **Mission:** why the operator opened them (place · fix · review). **Modes:** Work (the Scheduling card + related cards) and Activity (history/timeline).
- **Scheduling is a business card inside Work**, alongside **Enrollment**, **Attendance**, **Billing Preview**, and **Communications** cards when relevant.
- **Authority is not duplicated** — Scheduling *composes* these facts, it does not fork them:
  - **Enrollment** owns the executed agreement.
  - **Placement + schedule** own committed operational intent (Scheduling's write scope).
  - **Attendance** observes committed schedule expectations.
  - **Billing** consumes scheduled commercial reality.
  - **Communications** sends required notices.
- The Scheduling card **reads** all of these into the projection; **commit writes only placement/schedule intent**. A committed change may **offer** a Communications notice (never sends it) and **feeds** Attendance/Billing without owning them.

---

## Cross-references

- [`scheduling-card-projection.md`](./scheduling-card-projection.md) — the composed read model both card layers render.
- [`scheduling-binding-matrix.md`](./scheduling-binding-matrix.md) — every value's owner, the configured-command matrix, the gap report.
- [`scheduling-product-spec.md`](./scheduling-product-spec.md) · [`scheduling-calculation-map.md`](./scheduling-calculation-map.md) · [`temporary-move-policy-model.md`](./temporary-move-policy-model.md)
- [`mockups/scheduling-focus-panel.html`](./mockups/scheduling-focus-panel.html) — the final card mockups.
