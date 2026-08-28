---
owner: operator
status: draft
last_reviewed: 2026-08-24
supersedes: []
---

# Existing Card Visual Audit — reset basis for the five operational cards

**Purpose.** The previous design pass was rejected for inventing a generic card
aesthetic instead of extending the Alloy Focus Panel card family. This document
records what the **rendered** product actually looks like, measured in a live
browser against real tenant data, and proposes one canonical composition per new
card derived from it. No new card UI is written until this audit is accepted.

**Method.** Slot 6 dev server (`http://localhost:3016`, toolkit-owned, PID 17316),
authenticated as `qa-slot6-experimental@example.com`, route
`/workspace/work-unit/waitlist`, subject **Lennon Kurzman** (Waitlist · Tour
Scheduled · North Campus, Kurzman household, 17 children). Geometry and
typography are `getBoundingClientRect()` / `getComputedStyle()` readings from
that page, not values read out of the stylesheet.

Evidence: `qa/evidence/card-audit/` — `30-focus-panel-grid.png` (all cards
together), `card-waitlist-*.png` (per-card), `anatomy-waitlist.json` (raw
measurements).

---

## 0. What the published surface actually composes

The Enrollment Focus Panel renders **five** cards, not the fifteen in the
catalog:

| Rendered | Key | Archetype | Span | Measured |
|---|---|---|---|---|
| What's Next | `current_work` | status/action | 1 | 507 × 338 |
| Assignments | `scheduling` | collection | 1 | 507 × 1159 |
| Household | `household` | profile | 1 | 507 × 327 |
| Children | `children` | collection | 1 | 507 × 2319 |
| Billing Preview | `billing_preview` | status | 1 | 507 × 73 |

Readiness, Tour, Health, Milestones, Documents, Communications, Tasks and
Employment are registered but **absent from this published composition**, so
there is no live pixel authority for them; they are read from source below.
There is **no Placement card** anywhere in the catalog — room placement is a
concern *inside* Assignments (`scheduling`), and "Schedule" is that same card.

**Billing Preview renders as a 73px empty shell** — header plus
"View configuration", no body. Alloy has a charge substrate and a configuration
preview, but no family-grain posted balance. Card 5 is therefore a genuine
build, not a restyle.

---

## 1. The grid the cards live in

```
.alloy-os-focus-panel-grid--composed--published
  width 1055px   padding 16px   gap 10px
  grid-template-columns: repeat(2, minmax(0, 1fr))
  → one column = 507px      → a full row = 1023px
```

`FocusPanelCardSpan = 1 | 2 | "row"` already exists
(`lib/adminV2/runtime/focusPanel/focusPanelCardGrid.ts`), and `span: "row"` is
already used by the canonical derivation for `attention` and
`primary_next_action`. **A wide, shallow card needs no new mechanism** — it
needs `span: "row"`, which buys 1023px.

Densities `micro | compact | standard | expanded` are also already defined. The
live surface is entirely `compact`.

---

## 2. The audit table

| Card | Geometry | Header | Rows / sections | Actions | Density | Reusable primitives |
|---|---|---|---|---|---|---|
| **Household** (profile) | 507 × **327** — the shallowest substantive card. Header 81, body 209, footer. | 16px Lucide `Home` outline, `#9ca3af`, stroke 1.75 · micro-label `HOUSEHOLD` 10.5px/700/uppercase/0.525px tracking/`#9ca3af` · outline status pill `Needs contact` 10px/600 amber · insight `Kurzman household` 13.5px/700 midnight `#273f52` · supporting `Updated Aug 13, 2026` 11.5px/400 `#9ca3af` | **Open person rows, two per line, no enclosure and no divider.** 44px round avatar (initials, soft blue-grey) + name 15px/700 + role pill (`Primary` mint fill / `Guardian` grey fill) + stacked detail lines (email, phone). Absent value is a bare `—`. Then a wrapping row of count chips — bordered white rounded rects, bold count + regular label: `17 Children`, `1 Other parents`, `0 Emergency contacts`, `0 Authorized pickups`. | Quiet inline text links under the affected row (`Make primary`, `Copy from primary`); one amber warning link `Add emergency contact →`; footer `View household →` in bend-pine. Body padding `0 13px 11px`, footer padding identical. | compact | `ucard__{header,header-row,header-text,icon,title,insight,supporting,status--at-risk,body,footer,action--system5}`, `card-avatar`, `card-pill--neutral/--positive`, `household__{summary,summary-region,stats,stat,stat-count,stat-label,warning,warning--action}` |
| **Children** (collection) | 507 × **2319** — unbounded; the roster is not capped at compact density. | Identical header grammar; Lucide `Baby`; pill `Needs info`; insight `17 children · 2 waitlisted`; supporting `17 children need program & schedule` | **Open roster rows, no dividers.** Per row: avatar (photo or tinted initials) + name 700 + optional state pill (`Waitlist`) + a **two-column label-over-value grid** (`Date of birth` / `Apr 2, 2024`; `Program` / `Toddler`; `Gender` / `Female`), a right-aligned muted need line, and a small icon affordance row (calendar · `—` · `→`). The **focused** row is the only decorated one: mint tint, 3px bend-pine left rail, rounded. | Row-level affordance only; footer `View children →`. Depth is a **centered Focus Card with depth scrim** (System 5B Expand), not an overlay. | compact | as above plus `children__{roster,summary-row,summary-row--focused,summary-line,composer-region}`, `card-detail--risk` |
| **What's Next** (`current_work`, action/status) | 507 × **338**. Header padding tightens to `8px 12px 4px` and the insight steps up to 15px — the only tier that changes chrome. | Lucide `Briefcase`; pill `Blocked`; insight `Waitlist` 15px/700 | Four distinct body idioms, and the richest vocabulary in the family: (1) a plain summary sentence; (2) a bold `Current work · …` line; (3) a **two-column fact grid of uppercase micro-label over bold value** (`SCHEDULED TOUR` / `Fri, Aug 14 · 9:00 AM`, `LOCATION` / `North Campus`); (4) an uppercase in-body section head `RECENT ACTIVITY` above icon + label + muted-timestamp event rows. | A full-width **row of three equal outline buttons** — white fill, mint border, teal label, leading Lucide icon, ~10px radius. Then a **1px hairline rule** — the family's only divider — before `RECENT ACTIVITY`. Trailing text link `View all activity`. | compact | `currentwork__{context,context-facts,context-label,context-value,context-action-row,helpful-row,helpful-action,recent-activity,recent-activity-{list,icon,label,when,body},view-all-activity}` |
| **Assignments** (`scheduling`, collection) | 507 × **1159** | Lucide `Calendar`; **no status pill**; insight `17 children`; supporting is a column legend, `Room · Days · Effective · Time` | **Enclosed rows** — the family's second row idiom. Each is a bordered rounded sub-card (1px `#eef1f4`, ~12px radius): avatar + name 700 + one secondary line (`No assignment yet`) + right-aligned **filled** soft-amber status pill (`Needs a room`). | None at card level; the row is the affordance. Expands to `standard`/`expanded` for the schedule editor (`[data-schedule-editor]` opens the expanded density). | compact | `card-avatar`, `card-avatar__img`, ucard shell |
| **Billing Preview** (status) | 507 × **73** — header + footer, **no body** | Lucide `Receipt`; no pill, no insight, no supporting | none rendered | footer `View configuration` | compact | ucard shell only |
| **Readiness** (source only — not composed here) | — | — | Collapsed body is **only a gauge** — the two-second answer. | Depth is a **card-anchored inline overlay** (`CardInlineOverlay`), and an incomplete factor **hands off** to the owning card via `coordination.requestFocus(ownerCard, ownerFocus)` rather than editing locally. | compact | `household__{summary,row-detail}`, `readiness__body` |
| **Timeline** (source only) | — | — | `EventRow` = `when` + (`label`, `detail`). **`SUMMARY_MAX = 3` at micro/compact**; the rest live in the overlay. | `View all →` opens `CardInlineOverlay`; no route. | compact | `timeline__{events,event,event-when,event-body,event-label,event-detail}` |

### The measured design system, in one place

| Token | Value |
|---|---|
| Card shell | `border-radius: 14px`, `1px` border `#a6b2bd`, `#fff`, no shadow at rest |
| Header padding | `11px 13px 8px` (tier-work `8px 12px 4px`) |
| Body / footer padding | `0 13px 11px` |
| Micro-label (title) | 10.5px / 700 / uppercase / `0.525px` / `#9ca3af` |
| Insight | 13.5px / 700 / `#273f52` (tier-work 15px) |
| Supporting | 11.5px / 400 / `#9ca3af` |
| Status pill | 10px / 600, outline, tone-coloured (`#b45309` due, `#c2410c` at-risk) |
| Card pill | 10px / 700, `999px`, `midnight 8%` fill, `#4b5563` |
| Icon | 16px Lucide outline, stroke 1.75, `#9ca3af` |
| Footer action | `ucard__action--system5`, 11px / 700 / `0.02em` / bend-pine `#00a283` |
| Absent value | a bare `—`. Never a badge, never a box. |

### Six rules the rendered product obeys

1. **Header grammar is invariant.** icon · uppercase micro-label · optional
   status pill · insight · supporting. Every card. No exceptions.
2. **Whitespace separates; rules do not.** One hairline exists in the entire
   family (What's Next, before `RECENT ACTIVITY`).
3. **Two person-row idioms only** — open (Household, Children) and enclosed
   (Assignments). There is no third.
4. **Colour is state, never decoration.** The surface is white and grey until
   something is amber, orange or mint.
5. **Depth is not height.** Detail goes to a `CardInlineOverlay` (diagnostic:
   Readiness, Timeline) or a centered Focus Card with scrim (truth: Household,
   Children, Billing). Compact bodies are row-capped (`SUMMARY_MAX = 3`).
6. **Cards assemble, never own.** Each is
   `build<X>CardEvidence(context) → UniversalCard`, pure derivation over
   `OperationalContext`; cross-card work is `coordination.requestFocus`.

### Why the rejected pass read as a separate library

It used real class names, but at the wrong altitude: `household__group` /
`__row` belong to the **expanded** Household, not the compact summary, so the
lab cards inherited grouped-and-ruled chrome the live summary never shows. It
then added `LabAbsent` boxes rendering `NO OWNER` / `HELD` / `UNRESOLVED`
**inside** the specimens — the live family renders a bare `—` — and it made
`Complete / Needs attention / Severe / Empty` the unit of design, which the
family treats as tone on one composition, not four compositions.

---

## 3. Proposed canonical composition — one per card

**Card 1 · Business Process Journey** — `span: "row"` (1023 × ~150), Timeline
archetype, Lucide `GitBranch`, header `ENROLLMENT JOURNEY` · insight
`Enrolling · since Aug 18` · supporting `Lead Aug 2 → Enrolling Aug 18 · 16 days`,
footer `View journey →` opening a `CardInlineOverlay`. The body is a single
horizontal band of stage columns laid left to right across the full row, one
column per Business Process stage, each column reusing the What's Next fact
grid vertically: a state glyph and stage name on the first line (complete =
bend-pine check, current = filled bend-pine dot with the name in 700, future =
hollow grey ring with the name in `#9ca3af`), the date beneath in
`ucard__supporting` grey, and at most one outcome line beneath that in
midnight — nothing else. Progression is carried by a 1px connector between
glyphs, bend-pine behind completed stages and `#e5e9ef` ahead of the current
one, which is the same "colour is state" rule the pills already follow. The
current stage gets the Children `--focused` treatment — mint tint, rounded, no
border — so the eye lands on it without a banner. Skipped, revisited and
reopened stages collapse into the overlay; the band never grows a second row
and never lists Current Work.

**Card 2 · Health & Safety** — `span: 1` (507 × ~300), Status archetype, Lucide
`HeartPulse`, header `HEALTH & SAFETY` · pill only when something is actually
severe or missing · insight `Peanut allergy · EpiPen on site` · supporting
`Physical and immunization on file`. The body is four uppercase in-body section
heads borrowed verbatim from `RECENT ACTIVITY` — `ALLERGIES`, `MEDICAL`,
`DIETARY`, `REQUIREMENTS` — each followed by open rows in the Household idiom
with no enclosure and no rules. An allergy row is name in 700 midnight with the
severity as its own line in `--risk` red beneath; that inherited emphasis is
the entire severe treatment, with no banner and no count. Requirements are
label-left / value-right rows where `Received` is quiet grey and `Missing` is
amber, which puts enrollment-blocking medical gaps on the card without turning
it into a second Readiness. Emergency contacts appear as a single Household
count chip (`3 contacts`) rather than a list, because Household already owns
that truth and this card should hand off to it. Footer is `Edit` when
information exists; the empty state is one grey line, `No health information
recorded`, plus `Add health information →`.

**Card 3 · Staff** — `span: 1` (507 × ~280), Collection archetype, Lucide
`Users`, header `STAFF` · insight `3 assigned · Infant Room` · supporting
`Today · North Campus`, footer `Manage staff →`. This is deliberately the
closest relative of Household and Children in the set: the body is open person
rows, no enclosure, no dividers, using the exact Children row skeleton — 44px
round avatar, name 15px/700, a relationship pill in the `Primary` / `Guardian`
slot carrying `Lead Teacher`, `Assistant`, `Floater` or `Enrollment specialist`,
and beneath the name a two-column label-over-value pair (`Room` / `Infant
Room`, `Today` / `11:00–2:00`). Why a person is relevant is carried entirely by
that pill plus the room line, never by category headings, so the card does not
grow abstract sections. Scope narrows to the child's current room, current
schedule date and current site; anyone relevant only secondarily is absorbed
into a single trailing count chip in the Household stats idiom (`2 others`).
Absent assignment reads `—`, matching Children.

**Card 4 · Attendance** — `span: "row"` (1023 × ~200), Timeline archetype,
Lucide `Clock`, header `ATTENDANCE — TODAY` · pill `Present` / `Checked out` /
`Absent` from `CurrentPresenceState` · insight `In Nap Room since 12:05 PM` ·
supporting `Expected 8:00 AM – 4:30 PM`, footer `View history →` opening a
`CardInlineOverlay`. It projects the existing `ChildAttendanceReadModel` and
adds no model: the middle band is a horizontal day track across the full row,
an expected-hours rule in `#e5e9ef` with the actual span drawn over it in
bend-pine, and above it the merged `checkInOutTimeline` and
`roomMovementTimeline` as evenly spaced ticks — `8:04 Checked in · Infant
Room`, `10:15 Moved · Playground`, `12:05 Moved · Nap Room` — each rendered as
the What's Next fact pair, time as the bold value and the movement as the
uppercase micro-label. Because `room_transfer` is a first-class event kind with
`from_room_location_id` / `to_room_location_id`, classroom movement is real
truth and not an illustration. Below the track, a compact strip of the last five
`DayAttendanceSummary` days shows one glyph each. Actions are the What's Next
outline button row — `Correct`, `Record movement`, `Check out` — which is
correct rather than convenient, since corrections are `entry_type:
correction | reversal` events and nothing on this card is a directly editable
field.

**Card 5 · Billing** — `span: "row"` (1023 × ~220), Status archetype, Lucide
`Receipt`, header `BILLING` · pill `$275 past due` only when past due · insight
`$1,250 family share · due Sep 1` · supporting `Aug 1 – Aug 31`, footer
`Details →`. The full row divides into three equal columns whose only separator
is the 10px grid gap — no vertical rules — each headed by an uppercase in-body
section head. `CURRENT BILLING` stacks What's Next fact pairs (`TUITION` /
`$1,850`, `SUBSIDY` / `−$600`, `FAMILY SHARE` / `$1,250`), with the family share
as the one bolded value. `PAST DUE` holds a single amber fact pair and the
`Pay now` outline button, and when nothing is owed it holds one quiet grey line,
`Nothing past due`, rather than disappearing or becoming an attention block.
`RECENT ACTIVITY` reuses the What's Next activity rows verbatim — icon, label,
muted date, right-aligned signed amount — capped at four entries with
`View ledger →` beneath, exactly the `SUMMARY_MAX` rule Timeline already
follows. Payer context sits under `CURRENT BILLING` as two open Household-idiom
rows (`Sarah Wright · 70% · Visa •••• 4242`), which keeps payer identity
distinct from household primary contact, as it must be. Only the amounts and
the past-due state carry colour; the rest of the card stays white and grey.

---

## 4. What comes next, in order

1. Director accepts or corrects this audit.
2. Rebuild the Local Design Lab against these measurements — real
   `UniversalCard`, real tokens, a 1055px / 16px / 10px / 2-column frame,
   real `ReadinessCard` and `TimelineCard` rendered beside the candidates,
   and every review annotation in an adjacent panel, never inside a specimen.
3. Canonical Journey → Health & Safety → Staff → Attendance → Billing.
4. Combined Focus Panel density review: Household · Children · Journey ·
   Health & Safety · Staff · Attendance · Billing in one grid.
5. Only then, edge, empty and error states.

Nothing is registered in `FOCUS_PANEL_CARD_KEYS`, `FOCUS_PANEL_CARDS`, the
Surfaces catalog, `SYSTEM5_CARD_ARCHETYPE` or `focusPanelCardProviders`, and no
Focus Panel configuration changes.
