# Roster Product V1 — Stage 1 product audit and recommendation

**Sprint:** `roster-workspace` (slot 1) · **Base:** `origin/staging` @ `28e459b54`
**Date:** 2026-08-13 · **Status:** Stage 1 deliverable — no product surface changed yet.

Browser evidence was taken against the local certification tenant
(`certification/alloy-certify serve`, `CERT_APP_PORT=3011`, org `northwind-early-learning`)
with both committed fixtures applied:
`certification/search-platform/01-search-certification-fixtures.sql`, then
`certification/attendance/01-attendance-fixture.sql`.

Re-runnable evidence:

```bash
cd certification && NODE_PATH=../web/node_modules CERT_APP_URL=http://localhost:3011 CERT_OPERATOR_EMAIL=qa.operator@northwind.invalid CERT_OPERATOR_PASSWORD=alloy-local-cert ../web/node_modules/.bin/playwright test -c ./playwright.config.ts playwright/roster-product-audit playwright/roster-week-staffing-truth
```

Screenshots: `certification/evidence/roster-product-audit/`.

---

## 1. Current product — what Roster actually is today

Roster is **not one surface**. The Assignments workspace opens as a shell-level *modal*
and exposes four Work tabs — `Overview · Roster · Daily Roster · Attendance` — of which
**two are called Roster and tell different staffing stories**.

| | **Roster → Room board** | **Daily Roster** |
|---|---|---|
| Grain | room × weekday, Mon–Fri | room, one day |
| Component | `SchedulingRoster.tsx` | `DailyRoster.tsx` |
| Projection | `buildRosterReadModel` via `/api/admin/scheduling?view=roster` | `buildCombinedRoster` via `/api/admin/roster` |
| Children | committed / proposed / projected vs capacity | expected count + named chips |
| Staff | **`requiredStaff` only, labelled "1 staff"** | scheduled count + named chips |
| Staffing verdict | **none rendered** | `sufficient / short / unknown / idle` |
| Room state chip | "Healthy / Tight / Over" — **capacity only** | staffing verdict |
| Date control | week picker (prev / next / week list / Today) | ‹ › + native date input, **no Today** |

Observed on screen (Riverside, Thu 13 Aug 2026, `01-…`, `11-…`, `30-…`):

- Daily Roster header: *"Northwind — Riverside Campus · 2 children expected · 1 staff scheduled"*.
- Three room cards, alphabetical: `Infant Room A` **Unknown**, `Preschool Room A` **Unknown**,
  `Toddler Room A` **Staffed** — the only room with people sorts **last**, below the modal fold.
- Expanding Toddler Room A gives `Children (2): Emma Smith, Ada Smith` and
  `Staff (1): Jane Smith · Lead Teacher`. **No times on any row.**
- The modal header band is occupied by **ASSIGNMENT HEALTH** (Missing assignments · Multiple ·
  Upcoming · Future primary · Conflicts · Expiring soon) on every tab, including both Roster tabs.

### The decisive finding — the week board contradicts the verdict it is served

The cert tenant already contains the case, with no mutation: children are assigned to
Toddler Room A from `2026-01-05`; the only staff assignment starts `2026-08-01`. So the
week of **Mon 6 Jul 2026** has expected children and **zero scheduled staff**.

`/api/admin/scheduling?view=roster&week_of=2026-07-06`, Toddler Room A, **all five days**:

```json
{ "occupancy": 2, "requiredStaff": 1, "scheduledStaffCount": 0,
  "staffingSufficiency": "short", "ratioLabel": "0 of 1 staff scheduled" }
```

The board rendered for the same week (`40-week-board-july.png`), **all five days**:

```text
room chip: "Healthy"
cell:      "2 committed · 2 / 4 projected · 1 staff"   (data-cell-state="ok")
```

A room that is short-staffed every day of the week renders green, and the only staff number
shown is **demand presented as though it were supply**. This is exactly the fake-green failure
`resolveStaffingSufficiency` exists to prevent, surviving in the presentation layer:
`SchedulingRoster.tsx`'s local `RosterCell` type never declares `staffingSufficiency`,
`scheduledStaffCount`, `scheduledStaff` or `ratioLabel`, and its `tone` / `health` come from
capacity alone (`web/app/api/admin/scheduling/route.ts:98`, `:134`).

**The week roster is not missing. It is built, served, and discarded.**

---

## 2. Operator jobs — supported vs missing

| # | Job | Status | Evidence |
|---|---|---|---|
| 1 | **What does today look like?** | ⚠ partial | Rooms, counts and verdicts render, but rooms sort alphabetically not problem-first; `totals.roomsShort` / `roomsUnknown` are computed and **never rendered**; the modal clips the third room. |
| 2 | **Who is in this room today?** | ⚠ partial | Children and staff render, correctly typed and separated. **No times** — the answer omits the "when". |
| 3 | **What does tomorrow / next week look like?** | ✗ | Day nav works (one 3.1 KB request, ~190 ms). Week exists but is a child-occupancy board with no staffing truth (§1). No Today button on the day surface. |
| 4 | **Where are the staffing problems?** | ✗ | The verdicts exist per room·day at both grains; nothing aggregates or orders by them. No attention strip, no filter. |
| 5 | **Where is Jane working?** | ✗ | No staff lens. Clicking a staff chip moves record attention to the person's Employment card — correct, but that answers "who is Jane", not "where is Jane Tuesday". |
| 6 | **Where is Emma expected?** | ✗ | Same. Rooms lens only; no subject-oriented projection over dates. |

Roster → Attendance and Roster → Assignments handoffs: **neither exists**. No
`Open Attendance`, no `Manage assignment` affordance on any roster row or card
(`daily-roster-controls`: `openAttendance:false`, `manageAssignment:false`, `todayButton:false`,
`weekToggle:false`, `lensToggle:false`).

---

## 3. Product recommendation — the smallest strong Roster V1

### Should Roster remain inside Assignments for V1?

**No.** But the move is the *last* slice, not the first.

Assignments answers *what durable commitments exist*; Roster answers *given those, who should be
where and when*. They are different nouns with different scopes — Assignments is ledger-scoped,
Roster is site × date × room scoped. Today the shared chrome makes that plain: every Roster tab
is topped by an assignment-ledger attention band, inside a dismissible modal, over a Current Work
shell that concurrently pulls ~340 KB of unrelated payload (`provisioning-answer` 226 KB,
opportunity drawer VM 68 KB, lifecycle-builder 50 KB) while the roster's own request is 3 KB.

But relocating first would move the confusion intact. Every comprehension defect above lives
*inside* the surfaces and would be identical in a new workspace.

### Should Roster be its own workspace now?

**Yes — as slice 6, after Roster is one surface.** Target shape:

```text
Assignments workspace   Overview (assignment attention) · Assignments index · Studio
                        → the ledger

Roster workspace (new)  Rooms · Staff lens · Day/Week · Attendance (actual, today)
                        → the operating plan, and the day as it actually goes
```

Attendance moves with it: it is the actuality layer over the *same* site · date · room
composition, and splitting expectation from actuality across two workspaces would recreate the
problem in a new place. Cost is bounded: `AdminV2WorkspaceModalKey` gains `"roster"`, plus a
sidebar entry, shell mount, and deep-link plumbing.

### Day only, or Day + Week?

**Day + Week.** Not because the data allows it — because the week surface currently *lies*, and
because everything it needs already exists: the read model, the API projection, the site roll-up,
the week picker (with Today), and ±1 week prefetch. Week is presentation wiring, not new backend.
A 3-room week payload is 7.4 KB at 350–800 ms.

Week presentation stays **room × day cards with a staffing verdict per cell** — not a person grid.
No Month.

### Which lenses should ship?

| Lens | Ship? | Why |
|---|---|---|
| **Rooms** | ✅ | The primary operating view, at both Day and Week. |
| **Staff** | ✅ | Job 5 is real and unanswerable today. `buildStaffSupply` already takes `dateStart`/`dateEnd` and returns room, weekdays, position and time per member — a week-grain staff projection is a direct read. |
| **Children** | ❌ defer | Job 6 is answerable from the Rooms lens plus existing search, and a child-oriented projection sits closest to the future Records product. Revisit after real use. |
| **Coverage** | ❌ | With problem-first ordering and a site attention line on the Rooms lens, a separate Coverage view is a second rendering of the same verdicts. |

### What actions belong directly in Roster?

Only three, none of which author roster truth:

1. **Open the canonical record** — already correct via `useOperatorRecordFocus()`; keep exactly as is.
2. **Manage assignment →** on a subject row, into the existing registered assignment commands.
3. **Open Attendance** for the selected site · room · date.

### How should Roster hand off to Attendance?

Per-room `Open Attendance →` carrying site + room + date.

⚠ **Constraint found in the audit: Attendance has no date control at all.** `AttendanceWorkspace`
holds a `date` in state and adopts the server-resolved org-local service date, but renders no
control to change it — it is a today-only surface. So the affordance must be **enabled only when
the roster date is today**, and disabled with a stated reason otherwise. Silently opening
"today" from a Tuesday-next-week roster would be a lie about which day the operator is looking at.

### How should Roster hand off to Assignments?

`Manage assignment →` on the subject row, through the registered command path already wired in
`SchedulingWorkspace` (`assignment.create` / `assignment.set_primary` / `assignment.archive`) and
`WorkspaceCreateAssignmentModal` for a new one. Roster never writes a schedule fact.

---

## 4. Reuse map — what Stage 2 consumes, unchanged

| Concern | Owner (reuse, do not rebuild) |
|---|---|
| Day-grain combined roster | `web/lib/roster/buildCombinedRoster.ts` → `/api/admin/roster` |
| Week-grain roster + per-cell verdict | `web/lib/scheduling/roster/buildRosterReadModel.ts` → `/api/admin/scheduling?view=roster` |
| Staff supply (range-capable) | `web/lib/scheduling/supply/buildStaffSupply.ts` |
| Sufficiency vocabulary + roll-up | `web/lib/scheduling/supply/staffingSufficiency.ts` |
| Demand interpretation (the `unknown` guard) | `resolveRequiredStaffDemand` — same file |
| Presentation mapping (tone/health/ratioLabel) | `web/app/api/admin/scheduling/route.ts` `presentRoster()` |
| Assignment index rows (child **and** staff, typed) | `web/components/adminV2/scheduling/screens/AssignmentRosterPanel.tsx` |
| Week navigation incl. Today | `web/components/workspace/WeekPicker.tsx` |
| Record attention | `useOperatorRecordFocus()` / `focusRecordAndYield` |
| Assignment commands | `assignment.create` · `assignment.set_primary` · `assignment.archive`, `WorkspaceCreateAssignmentModal` |
| Site scope | the workspace site picker (`aria-label="Site"`), already shared across tabs |
| Attendance surface | `web/components/adminV2/scheduling/screens/AttendanceWorkspace.tsx` — moves, unchanged |

---

## 5. Gaps, separated

### Product / UI gaps — the whole of Stage 2

1. Week board discards `staffingSufficiency` / `scheduledStaffCount` / `ratioLabel`; room chip is
   capacity-only (§1).
2. `totals.roomsShort` and `totals.roomsUnknown` are computed by both read models and rendered by
   neither.
3. Rooms sort alphabetically; nothing orders by attention.
4. No lens control; no staff-oriented or date-ranged subject projection.
5. No `Open Attendance`, no `Manage assignment`, no Today button.
6. Two tabs named "Roster" and "Daily Roster" with contradictory staffing stories.
7. Room card chrome carries a constant green left accent (`border-l-alloy-juniper/75`, the shared
   `DRAWER_OVERVIEW_PANEL_SURFACE` token) for every verdict; the state is carried only by a small
   text badge. On a surface whose job is state legibility, the strongest colour cue is constant.
8. Tab switch unmounts the surface, so the chosen date resets to today. Site is preserved; date is not.

### Actual backend gaps

**None required for the recommended V1.** Every projection, verdict and command already exists at
both grains. One real inefficiency, not a blocker:

- `buildCombinedRoster` loads `child_attendance_events` and staff presence **unconditionally**,
  including for future dates where actuals cannot exist. Harmless at day grain; wasteful if a week
  view is ever backed by it. (The week path uses `buildRosterReadModel`, which does not read actuals —
  so the recommendation avoids this by construction.)

### Configuration gaps — the missing "when"

The core question is *who, where, and **when***, and **no time renders anywhere on the roster**.
This is configuration, not a missing feature:

- Subject times come **only** from the schedule pattern's `metadata.default_hours`
  (`readPatternDefaultHours`, consumed by both `buildStaffSupply` and `buildCombinedRoster`).
- All three patterns in the cert tenant have `metadata = {}`, so every `timeLabel` is null and the
  chips render name-only.

⚠ **A product decision this raises, for Kelly — not for this sprint.** Hours live on the *pattern*,
and `schedule_assignments` has no arrive/depart column. So *per-subject* times are not expressible
today: the mockup shape `Emma 8:00–4:00 / Liam 8:30–3:30` **in the same room on the same pattern**
cannot be represented. V1 should render the pattern's hours where configured (which is a real
improvement over blank) and we should decide separately whether per-assignment hours are a
concept the platform needs.

### Performance gaps

- Roster fires `/api/admin/roster?site_location_id=` with an **empty site id on mount, twice**,
  returning 400 each time, before the site resolves. Both `DailyRoster` and `AttendanceWorkspace`
  fetch unconditionally.
- Day change: **one** request, 3.1 KB, ~190 ms. No N+1. Identity resolution is already batched.
- Week: 7.4 KB, 350–800 ms, with ±1 week prefetch already in place.
- The surface competes with ~340 KB of Current Work shell traffic because it renders inside a
  modal over that shell — an argument for the workspace move, not for a roster change.

### Defects found during inspection (small, fixed in slice 5)

1. Empty-site 400 ×2 on mount (above).
2. **`DailyRoster` derives "today" from `new Date().toISOString()` — browser UTC** — while
   Attendance deliberately adopts the **org-local service date** the roster route resolves and
   returns as `todayYmd`. After UTC midnight the two surfaces disagree about what day it is.
   The route already returns the right answer; the day surface ignores it.
3. `OpenSchedulingModalDetail.workView` is typed `"overview" | "roster" | "attendance"` — it omits
   `"daily_roster"`, so no caller can deep-link the day roster type-safely.
4. Toddler card renders **"Staffed" twice** — the meaning sentence and the badge are identical.
5. Alphabetical room ordering (above).
6. Constant green card accent (above).

---

## 6. Proposed V1 acceptance story

One browser journey, against the cert tenant, that fails today at step 3:

```text
Director opens Roster (its own workspace)
→ Riverside
→ Week of 6 Jul 2026
→ Toddler Room A reads SHORT on all five days: "0 of 1 staff scheduled"     ← fails today: "Healthy · 1 staff"
→ the site line reads "1 room short · 2 rooms unknown"                       ← fails today: never rendered
→ rooms are ordered short → unknown → staffed, not alphabetically            ← fails today
→ switches to Day, Thu 13 Aug 2026
→ Toddler Room A reads Staffed 1 of 1; Infant and Preschool read Unknown, visibly neutral
→ opens Toddler Room A: Children — Emma Smith, Ada Smith · Staff — Jane Smith, Lead Teacher
→ Staff lens: Jane Smith → Toddler Room A, Mon–Fri                           ← fails today: no lens
→ Manage assignment → opens the registered assignment command                ← fails today
→ back to Rooms, date preserved
→ Open Attendance for Toddler Room A                                         ← fails today
   (enabled only because the roster date is today; disabled with a reason on any other date)
→ Attendance opens on Toddler Room A, 13 Aug, site and room context intact
```

`roster-week-staffing-truth.cert.spec.ts` already reports the step-3 contradiction; slice 1
converts it from a report into an assertion.

---

## 7. Implementation slices — bounded and ordered

| # | Slice | Scope | Proof |
|---|---|---|---|
| **1** | **Truthful week** | Render `scheduledStaffCount` / `ratioLabel` / `staffingSufficiency` on room-board cells; drive the room chip from the staffing verdict, keeping capacity as a separate signal. No read-model change. | `roster-week-staffing-truth` asserts SHORT × 5 for Jul 6. |
| **2** | **One Roster surface** | Merge the two Roster tabs into one surface with a Day/Week range control, single date/week state, problem-first ordering, state-bearing card chrome, and the site attention line from existing `totals`. Retire the "Daily Roster" tab. | Browser: acceptance steps 3–7. |
| **3** | **Handoffs** | Per-room `Open Attendance` (today-only, disabled with a reason otherwise) and per-subject `Manage assignment →` via existing registered commands. Preserve site + date. | Browser: acceptance steps 9, 11–12. |
| **4** | **Staff lens** | Week-grain staff projection over `buildStaffSupply`; person → room → days. Not record management. | Browser: acceptance step 8. |
| **5** | **Defect sweep** | The six defects in §5. | Network shows no 400s on mount; date basis is the server's `todayYmd`. |
| **6** | **Workspace move** | New `roster` shell workspace key + sidebar entry; Roster and Attendance move; Assignments keeps Overview + assignment index + Studio. Update the provisional-placement note in `docs/platform/modules/attendance-system.md`. | Browser: full journey from the sidebar. |

Out of scope and untouched: attendance facts, staff presence, employment schema, scheduling,
staffing math, ratio engine, roster persistence, Records workspace, Attendance V1.1.
