---
owner: runtime
status: canonical
last_reviewed: 2026-07-14
supersedes: []
---

# Operational Configuration Experience — Canonical Product Specification

**Status:** Canonical product spec (design only — no code, no React). Reference-implementation spec for [`configuration-workspace-platform-doctrine.md`](../platform/operator/configuration-workspace-platform-doctrine.md) (Locations).
**Lens:** Product & Design (Head of Product / Head of Design), not engineering
**Companion:** `docs/system/operational-configuration-platform-phase-b-blueprint.md` (engineering blueprint — component hierarchy, state, provider bindings). This document deliberately contains none of that; it specifies *the experience*.
**Becomes:** the canonical Settings experience for Alloy.

---

## 0. Design thesis

### 0.1 The operator's sentence

The operator never thinks *"I am configuring capacity."* They think:

> **"I am running Downtown Campus."**

So the product is organized as **one place — the location — and everything that belongs to it.** Not a settings tree of features. A business, and its parts.

Everything belongs to something. The information architecture is that sentence, made navigable:

```
Downtown Campus
├── General            — who this location is (name, address, contact, timezone, status)
├── Programs           — the products this location offers
├── Rooms              — where children are served  ← capacity + ratios live here
├── Schedule           — when this location is open (hours, closures, exceptions)
├── Tours              — how families visit
├── Placement          — how children are matched to rooms
├── Communications     — how this location talks to families
└── Access             — who on my team can manage this location
```

Capacity is **not** a workspace. Ratios are **not** a workspace. Timezone is **not** a workspace. Each lives where the business already keeps it.

### 0.2 The three questions every screen must answer

Every page, without the operator asking, answers:

1. **What am I configuring?** (the header + breadcrumb — always a *thing*, never a *feature*)
2. **Why does it matter?** (one plain sentence under the title; the business consequence)
3. **What should I do next?** (a primary action, or an Attention item, or "you're all set")

If a screen can't answer all three in the first glance, it's under-designed.

### 0.3 The hardest rule: the engine is invisible

The substrate underneath (from Phase A) is a precedence-resolving, effective-dated, versioned configuration engine. **The operator must never meet it.** These words never appear in the product:

> provider · resolver · precedence · scope · inheritance engine · effective dating · capacity engine · ratio engine · configuration version

They are replaced, one-for-one, by business language. This is not decoration — it's the core product bet. Section 9 (Progressive Disclosure) and the critique (§13) are largely about keeping the engine invisible.

### 0.4 Two status systems — and they are NOT the same (this is the single most important product decision)

The current mockup has **three** overlapping status surfaces (Configuration Health, Configuration Progress, Needs Attention). That is one too many, and two of them answer the *same* question badly. We collapse to **exactly two**, because operators genuinely have two different questions:

| System | Question it answers | Nature | Where it lives |
|---|---|---|---|
| **Setup Progress** | *"Have I finished setting this location up?"* | One-time / onboarding. Monotonic — trends to done. | Right rail, prominent while incomplete; **fades to a quiet line once 100%.** |
| **Attention** | *"Is anything wrong or worth improving right now?"* | Ongoing / operational. Comes and goes. | Overview body, always present. This IS the health signal. |

**"Configuration Health: Healthy · last checked 2m ago" is deleted.** It pretends configuration is a server with a heartbeat (implementation leakage), and it *contradicts* "Needs Attention: 1 room has incomplete capacity" sitting right below it. A location cannot be "Healthy" and have an incomplete room. Attention already answers "is my center healthy?" — truthfully, item by item. See §10, §11, and critique §13.

---

## 1. Complete navigation

### 1.1 Top level

Alloy's left nav (Home · Locations · Work · Communications · Processing · People · Reports · Settings) is unchanged. The Operational Configuration Experience is reached two ways, and they land in the same place:

- **Settings → Locations** (the canonical Settings entry — this experience *is* Settings for operations)
- **Locations** (top nav) → a location → **"Configure"**

Both routes open the **Location Workspace**.

### 1.2 The location workspace navigation

```
Settings ▸ Locations ▸ Downtown Campus
                       └── Overview · Programs · Rooms · Schedule · Tours · Placement · Communications · Access
                                                  │
                                                  └── Rooms ▸ Toddler Room
                                                             └── Overview · Capacity · Programs · Schedule · Enrollment
```

- **Left rail:** the Locations list (persistent selector — search, filter, Add Location). Switching locations keeps you on the same tab where it makes sense.
- **Tab bar (8 tabs):** `Overview · Programs · Rooms · Schedule · Tours · Placement · Communications · Access`.
- **General is not a tab.** It is the location's own identity record, opened by the **"Edit Location"** button in the header. Rationale: identity/timezone is low-frequency, and Overview already earns tab-1. Making General a permanent tab would spend the operator's most valuable navigation real estate on the thing they touch least. (Design decision — see critique §13 for why the mockup's header button is the right home for it, once we make the relationship explicit.)
- **Rooms is a nested workspace.** Selecting a room swaps the left rail to a Rooms list and opens the Room's own tabbed detail. This is the only two-level drill, and it's justified: the room is the operational heart (§3.4).

### 1.3 Navigation rules

- Tabs are URLs (deep-linkable, back/forward works) — required so an Attention item like "1 room has incomplete capacity → View room" can link straight to the exact surface.
- Every drill-in has a clear way back that preserves context.
- No modal-only configuration for anything an operator revisits; modals are for *create* and *confirm*, not for *manage*.

---

## 2. Screen hierarchy

```
LOCATION WORKSPACE  (one location, master–detail)
│
├── Overview                    ← read-only dashboard: "Is my center healthy?"
│
├── General  (via Edit Location)← identity · address · contact · timezone · status · branding-lite
│
├── Programs                    ← products offered here (list + program detail)
│
├── Rooms                       ← rooms list  →  ROOM DETAIL (nested)
│                                   ├── Overview     (summary + availability + health)
│                                   ├── Capacity     ← capacity AND ratios (together)
│                                   ├── Programs     (which programs this room serves)
│                                   ├── Schedule     (room hours = inherit or override)
│                                   └── Enrollment   (read-only roster snapshot)
│
├── Schedule                    ← hours + closures + exceptions (one experience)
│
├── Tours                       ← availability · booking rules · guides · public scheduling
│
├── Placement                   ← rules · priority · which rooms participate
│
├── Communications              ← identity · branding · templates · location messaging
│
└── Access                      ← team members · roles · what they can reach
```

Note the deliberate collapses: **Capacity + Ratios = one room tab ("Capacity")**; **Hours + Closures + Exceptions = one location tab ("Schedule")**. No standalone Capacity, Ratio, Hours, Closures, or Timezone workspace exists anywhere.

---

## 3. Screen wireframes (ASCII) + per-workspace specification

Each workspace is specified against the full facet list: **Purpose · Operator questions answered · Navigation · Hierarchy · Cards · Actions · Lists · Dialogs · Summary metrics · Progressive disclosure · Health indicators · Configuration progress · Validation · Empty state · Responsive behavior.**

---

### 3.1 LOCATION OVERVIEW

**Purpose.** Answer one question honestly: *is this center healthy and set up?* Overview **summarizes operations** — it does not expose raw data, and it configures nothing (every number links to where it's configured).

**Operator questions answered.**
- Is my center full, or do I have open seats?
- Is anything wrong or incomplete right now?
- Am I done setting this location up?
- What changed recently, and who did it?

**Wireframe (redesigned — three status surfaces collapsed to two):**

```
Settings ▸ Locations ▸ Downtown Campus                         [ Edit Location ]  [⋮]
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Downtown Campus  ● Active                                                          │
│  123 Main Street, Portland OR 97201   ·   (503) 555-1234   ·   America/Los_Angeles │
│                                                                                    │
│  Overview | Programs | Rooms | Schedule | Tours | Placement | Communications | Access
├───────────────────────────────────────────────────┬────────────────────────────────┤
│ AT A GLANCE                                        │  QUICK ACTIONS                 │
│                                                    │   + Add Room                   │
│   Capacity            Enrollment                   │   + Add Program                │
│   ┌───────────────────────────────────────────┐   │   + Add Closure                │
│   │ ██████████████████████░░░░░  103 / 124     │   │                                │
│   └───────────────────────────────────────────┘   │  SETUP PROGRESS   (while <100%)│
│   ● Enrolled 103   ● Open 21   ○ Unavailable 0     │   ◔ 85% complete               │
│                                                    │   ✓ Programs  ✓ Rooms          │
│   4 Programs        8 Rooms                        │   ✓ Schedule  ✓ Tours          │
│   (2 need setup ▸)                                 │   ✓ Placement ✓ Comms          │
│                                                    │   ○ Access — finish setup ▸    │
│ ─────────────────────────────────────────────     │                                │
│ NEEDS ATTENTION                          (3)       │  ( collapses to "Setup complete│
│  ⚠ Toddler Room — capacity not finished  View ▸    │    ✓" line once 100% )         │
│  ⓘ Tour availability looks thin          View ▸    │                                │
│  ✓ All programs up to date                         │                                │
│ ─────────────────────────────────────────────     │                                │
│ ┌── Operating Schedule ──┐ ┌── Upcoming Closures ─┐│                                │
│ │ Mon–Fri  6:30a–6:00p   │ │ Memorial Day  May 27 ││                                │
│ │ Sat–Sun  Closed        │ │ Independence  Jul 4  ││                                │
│ │            View ▸       │ │ Labor Day     Sep 2  ││                                │
│ └────────────────────────┘ └─────────  View all ▸ ┘│                                │
│ ┌── Recent Activity ────────────────────────────┐ │                                │
│ │ Sarah J · Capacity updated · Toddler Room · 5d │ │                                │
│ │ Sarah J · Hours exception · Memorial Day  · 8d │ │  ( Helpful Resources: moved to │
│ │ Mike R  · Pre-K schedule updated          · 12d│ │    the [?] help menu, not the  │
│ │                                    View all ▸  │ │    primary rail — see §13 )    │
│ └────────────────────────────────────────────────┘ │                                │
└─────────────────────────────────────────────────────┴────────────────────────────────┘
```

**Cards.**
- **At a Glance** — one card, two tiers of information (fixes the mockup's flat 5-metric strip): *utilization* (Capacity bar + Enrolled/Open/Unavailable) is the health signal and reads first; *inventory* (Programs, Rooms counts) is secondary, smaller. Numbers are summaries of the rooms' resolved capacity; if any room is incomplete, the card shows the honest total plus a quiet "N need setup ▸" — never a fabricated number.
- **Needs Attention** — the operational health surface (§10). Ranked list of things to fix or improve, each with a one-tap "View ▸". When empty: a single "Everything looks good ✓" line. This *replaces* the mockup's separate "Configuration Health · Healthy" card.
- **Operating Schedule** (summary, read-only, "View ▸" to Schedule tab). Note: **no "uses location schedule" tag here** — the location *is* the schedule; that tag only ever appears on a Room (§13).
- **Upcoming Closures** (next 3, "View all ▸").
- **Recent Activity** (who changed what, deep-linked).

**Actions.** Edit Location (→ General); overflow: Deactivate, Duplicate as template, Export configuration.

**Lists.** Needs Attention; Recent Activity; Upcoming Closures.

**Dialogs.** None own to Overview — it launches others' create dialogs via Quick Actions.

**Summary metrics.** Capacity / enrollment / open seats; program & room counts; closure count; setup %.

**Progressive disclosure.** Open Seats carries an ⓘ → plain basis ("21 open = 124 capacity − 103 enrolled"). Setup Progress collapses to one line at 100%.

**Health indicators.** Needs Attention (primary). Header status pill (Active/Inactive).

**Configuration progress.** Setup Progress in the rail (§11).

**Validation.** Read-only; no validation.

**Empty state.** New location: At a Glance shows "No rooms or programs yet"; Needs Attention becomes a **3-step Setup checklist** ("Add your first program → add a room → set your hours"); Setup Progress reads 0%.

**Responsive.** Desktop: 3 zones. Tablet: left list collapses to a dropdown selector; rail moves below body. Mobile: single column — Attention first, then At a Glance, then cards; Quick Actions become a sticky action bar; Setup Progress becomes a slim banner.

---

### 3.2 GENERAL  (opened by "Edit Location")

**Purpose.** The location's identity — the answer to "what is this place, and where/when does it operate?" **Timezone lives here** (never standalone).

**Operator questions answered.** What's the name/address/phone shown to families? What timezone are this location's hours in? Is it active?

**Hierarchy / Cards.** A focused single-column editor (drawer or dedicated page):
- **Identity** — name, status (Active/Inactive), location code (read-only).
- **Address & Contact** — street, city, state, ZIP, phone.
- **Timezone** — a single business-language picker: *"What time zone is this location in?"* (writes the real `locations.timezone`). One helper line: "We'll show this location's hours and closures in this time zone."
- **Branding-lite** (optional, or defer to Communications) — logo/short name used across surfaces.

**Actions.** Save · Cancel · Deactivate location.

**Dialogs.** Deactivate confirm ("Families won't be scheduled here while inactive").

**Validation.** Required name; valid ZIP/phone format; timezone required (Overview surfaces "time zone not set" in Attention until it is).

**Progressive disclosure.** Advanced (external IDs, code) under a fold.

**Empty state.** New-location create form is this same surface with empty fields + a "Save & continue setup" primary that returns to Overview with Setup Progress advanced.

**Responsive.** Naturally single-column; drawer on desktop, full page on mobile.

---

### 3.3 PROGRAMS

**Purpose.** Manage the **products this location offers**. A program is a thing families enroll in — not a database record. The language is "offer a program," "stop offering," not "create/delete."

**Operator questions answered.** What do we offer here? What ages/price/schedule does each program imply? Which rooms serve it? Is anything offered but unserved (a dead product)?

**Wireframe:**

```
Programs                                                        [ + Offer a Program ]
┌───────────────────────────┬──────────────────────────────────────────────────────┐
│  Infant        ● Active    │  Toddler                                    ● Active  │
│  Toddler    ●  ▸ Active    │  Ages 18–36 months                                    │
│  Preschool     ● Active    │  ─────────────────────────────────────────────────── │
│  Pre-K         ● Active    │  Offered at this location · serves 2 rooms            │
│  School Age    ○ Inactive  │                                                       │
│                            │  SERVED BY                                            │
│  (drag to reorder —        │   • Toddler Room        ✓ eligible                    │
│   sets display order)      │   • Toddler Room B      ✓ eligible                    │
│                            │   • Preschool A         — add an age range to match   │
│                            │  ─────────────────────────────────────────────────── │
│                            │  DEFAULTS  (Advanced ▸)                               │
│                            │   Program-wide capacity/ratio defaults — usually set  │
│                            │   per room. Leave closed unless you know you need it.  │
└───────────────────────────┴──────────────────────────────────────────────────────┘
```

**Cards (program detail).** Program Summary (label, status, description, order); **Served By** (rooms + eligibility, honestly showing "add an age range to match" instead of dropping unmatched rooms); **Defaults** (program-wide capacity/ratio — hidden under Advanced; the norm is room-level).

**Actions.** Offer a Program (from the org's program catalog) · Stop offering · Activate/Deactivate · Reorder.

**Lists.** Offered programs (reorderable); the org catalog (in the Offer dialog).

**Dialogs.** "Offer a Program" — pick from catalog; warns quietly if the pick comes from a legacy source.

**Summary metrics.** # offered (active/inactive); rooms-per-program; # offered-but-unserved.

**Health indicators.** "Offered but no room serves it" → an Attention item ("Pre-K is offered but no room serves it").

**Progressive disclosure.** Program-wide defaults folded away by default.

**Validation.** Can't stop offering a program a room still serves without confirm; no duplicate offerings.

**Empty state.** "This location doesn't offer any programs yet. Offer one from your organization's catalog." (single primary CTA).

**Responsive.** List collapses above detail on mobile (list → tap → detail, back button).

---

### 3.4 ROOMS — the operational heart

**Purpose.** Everything a room owns, in one place: **capacity, ratios, eligible programs, schedule overrides, enrollment, availability, health.** This is where operators spend the most time; it must be the most complete and the calmest.

**Operator questions answered.** How many children can this room hold — and *why that number*? Are we within ratio? What's limiting us? Who's enrolled today, how many seats are open? What programs can go here? Does it follow the location's hours or its own?

**Wireframe — Room detail (Overview tab):**

```
Settings ▸ Locations ▸ Downtown Campus ▸ Toddler Room            [ Edit Room ]  [⋮]
┌────────────────────────┬──────────────────────────────────────────┬─────────────────┐
│ ROOMS         + Add     │ Toddler Room  ● Active                    │ QUICK ACTIONS   │
│ ─────────────────────── │ TOD-1 · Toddler · Ages 18–36 months       │  Set capacity   │
│ Infant Room     ●       │                                           │  Adjust ratios  │
│ Toddler Room  ● ▸       │ Overview | Capacity | Programs | Schedule │  Add enrollment │
│ Preschool A     ●       │          | Enrollment                      │                 │
│ Preschool B     ●       ├───────────────────────────────────────────┤ HEALTH          │
│ Pre-K           ●       │ ┌── Capacity ───────────────────────────┐ │  ⚠ Capacity not │
│ School Age      ●       │ │  Holds  11  children                   │ │    finished     │
│ Flex Room       ○       │ │  ● 11 available now                    │ │    Finish ▸     │
│ Outdoor         ○       │ │  Limited by staffing ratios  ⓘ         │ │                 │
│                         │ │  Room size 14 · License 12 · Set 12    │ │                 │
│                         │ │                             Manage ▸   │ │                 │
│                         │ └────────────────────────────────────────┘ │                 │
│                         │ ┌── Today ──────────┐ ┌── Ratios ────────┐ │                 │
│                         │ │   ◕  9 children    │ │ 1 adult : 5  ✓   │ │                 │
│                         │ │  Enrolled 9        │ │ 2 adults: 11 ✓   │ │                 │
│                         │ │  On leave 0        │ │  (current limit) │ │                 │
│                         │ │  Open seats 2      │ │        Manage ▸  │ │                 │
│                         │ └────────────────────┘ └──────────────────┘ │                 │
│                         │ ┌── Schedule ───────────────────────────┐ │                 │
│                         │ │  Uses location hours                   │ │                 │
│                         │ │  Mon–Fri 6:30a–6:00p · Sat–Sun Closed  │ │                 │
│                         │ │  Set different hours for this room ▸    │ │                 │
│                         │ └────────────────────────────────────────┘ │                 │
└────────────────────────┴──────────────────────────────────────────┴─────────────────┘
```

**Cards (Room Overview).**
- **Capacity** — the headline is a plain sentence: **"Holds 11 children · 11 available now."** Then the *why* in business language: **"Limited by staffing ratios"** (the binding factor, translated). The component numbers (room size / license / set) are secondary, small, one line. `staffedCapacity` is **not shown as a number** (Phase A can't compute it) — if referenced at all, it's "Staffing not set up yet." "Manage ▸" → Capacity tab.
- **Today** — enrolled / on leave / open seats (operational snapshot).
- **Ratios** — the tier sentences ("1 adult : 5", "2 adults : 11 (current limit)"), each ✓/⚠. "Manage ▸" → Capacity tab (ratios live *inside* capacity).
- **Schedule** — inherit-or-override, shown quietly: **"Uses location hours"** with a one-line summary and a soft "Set different hours for this room ▸." This is the *correct* place for the inheritance tag (contrast §3.1 and §13).

**Room Capacity tab (authoring — capacity AND ratios together):**

```
Capacity & Ratios — Toddler Room
┌──────────────────────────────────────────────────────────────────────────────┐
│  How many children can this room hold?                                         │
│    Room size (physical)        [ 14 ]  children                                │
│    Licensed limit              [ 12 ]  children     (from your license)        │
│    Your set capacity           [ 12 ]  children                                │
│                                                                                │
│  Staffing ratios                                                               │
│    ┌ Adults ─ Max children ─────────────────────────────┐                      │
│    │   1        5                                        │                      │
│    │   2        11                                       │  + Add a tier        │
│    └─────────────────────────────────────────────────────┘                      │
│                                                                                │
│  ▸ Right now this room holds 11 children — limited by staffing ratios.         │
│                                                                                │
│               Save changes   ·   Effective from  [ Today ▾ ]                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

- The **live sentence** ("Right now this room holds 11 — limited by ratios") recomputes as the operator edits — the resolver output, phrased as a consequence, never as engine math.
- **Save = "Save changes · Effective from [Today]."** Effective dating is one quiet line most operators ignore. If they pick a future date, the card gains a "Scheduled: takes effect May 27 · Undo" ribbon. No version/supersede vocabulary.
- The license guard shows as a friendly inline message: *"A license limit can only make capacity smaller, not larger."*

**Room Programs tab.** Toggle which offered programs this room serves; "add an age range" prompt when matching is ambiguous.

**Room Schedule tab.** Big calm default: "This room uses the location's hours." One action: "Set different hours for this room." Setting one creates the override; removing it returns to inherited. Never the word "override" as a noun the operator must understand — it's "different hours for this room."

**Room Enrollment tab.** Read-only roster snapshot (no config).

**Actions (room).** Edit Room · Set capacity · Adjust ratios · Set different hours · Add enrollment · overflow (Deactivate room, Duplicate room).

**Dialogs.** Add Room (name, program, age range, room size); Deactivate confirm.

**Summary metrics.** Holds / available now / enrolled / open seats; limiting factor.

**Health indicators.** Room health card + feeds location Attention ("Toddler Room — capacity not finished").

**Configuration progress.** A room counts as "set up" when it has capacity + ratios + a program; incomplete rooms lower the location's Rooms progress.

**Validation.** Capacity ≥ 0; license can't be raised above ceiling (friendly guard); at least one ratio tier; effective date required on save.

**Empty state.** New room: Capacity card says "No capacity set yet — enter a room size to begin"; ratios empty with "Add your first ratio."

**Responsive.** Room list → dropdown on mobile; cards stack; Capacity tab becomes a single-column form with a sticky "Save" bar.

---

### 3.5 SCHEDULE  (hours + closures + exceptions, one experience)

**Purpose.** When is this location open — normally, and on the days it isn't? One coherent surface; no separate "Closures" or "Exceptions" workspace.

**Operator questions answered.** What are our normal hours? When are we closed (holidays)? Any one-off early-close/late-open days? Do any rooms keep different hours?

**Wireframe:**

```
Schedule — Downtown Campus
┌──────────────────────────────────────────────────────────────────────────────┐
│  WEEKLY HOURS                                                    Edit hours ▸  │
│    Mon  6:30a – 6:00p     Thu  6:30a – 6:00p                                    │
│    Tue  6:30a – 6:00p     Fri  6:30a – 6:00p                                    │
│    Wed  6:30a – 6:00p     Sat / Sun  Closed                                     │
│  ────────────────────────────────────────────────────────────────────────────│
│  CLOSED DAYS & CHANGES                                     + Add closed day    │
│    May 27  Memorial Day        Closed all day                        ✕         │
│    Jul 4   Independence Day     Closed all day                       ✕         │
│    Sep 2   Labor Day            Closed all day                       ✕         │
│    Dec 24  Christmas Eve        Early close 1:00p                    ✕         │
│    ▸ Apply a holiday set (US Federal Holidays)                                  │
│  ────────────────────────────────────────────────────────────────────────────│
│  3 rooms keep different hours ▸   (quiet — links to each room's schedule)       │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Cards.** Weekly Hours; Closed Days & Changes (unified closures + exceptions — a closure is just "closed all day," an exception is "different hours that day"); optional Holiday Set applier.

**Actions.** Edit hours · Add closed day · Apply holiday set · Remove a day.

**Dialogs.** Edit Hours (weekly grid + "Effective from"); Add Closed Day (date, label, "Closed all day" vs "Different hours").

**Summary metrics.** Open days/week; upcoming closures count; rooms-with-different-hours.

**Health indicators.** "Some days have no hours set" → Attention.

**Progressive disclosure.** Past closures + future-scheduled hour changes under "History"; room overrides shown as a single quiet line, expandable.

**Validation.** Close-after-open; no duplicate closed days; effective date required.

**Empty state.** "Set your weekly hours to get started" (primary), closed-days section muted until hours exist.

**Responsive.** Weekly grid becomes a stacked day list on mobile.

---

### 3.6 TOURS

**Purpose.** How families visit before enrolling — when tours are offered, the booking rules, who gives them, and whether families can self-schedule.

**Operator questions answered.** When can families tour? How long/how much lead time/how much buffer? Who gives tours? Can families book themselves?

**Cards.** Availability (weekly tour windows) · Booking Rules (duration, lead time, buffer, slots) · Tour Guides (assign team) · Family Self-Scheduling (on/off + shareable link).

**Actions.** Set availability · Set booking rules · Assign guide · Toggle self-scheduling.

**Dialogs.** Edit availability; assign guide.

**Summary metrics.** Weekly tour capacity; upcoming tours; self-scheduling on/off.

**Health indicators.** "Tour availability looks thin" / "No tour availability set" → Attention (improvement-grade, not error).

**Progressive disclosure.** Buffers/advanced booking rules folded.

**Validation.** Buffer < duration; guide must have location access.

**Empty state.** "Turn on tours to let families book visits."

**Responsive.** Availability grid → stacked; rules single-column.

> **Product note:** the mockup's Overview "Today's Tours: 3 scheduled" is *operational*, not *configuration*. It belongs on the operational dashboard, not in Settings. On the config Overview, the tour signal should be "tour availability configured / thin," not a live count (see §13).

---

### 3.7 PLACEMENT

**Purpose.** How children get matched to rooms — the rules, the priority order, and which rooms participate.

**Operator questions answered.** When a child needs a room, how do we choose? Which rooms accept placements? In what order?

**Cards.** Placement Rules (plain-language) · Priority (ordered, drag) · Participating Rooms (per-room toggle) · Recommendations (how suggestions are made).

**Actions.** Reorder priority · Toggle room participation · Adjust recommendation preference.

**Summary metrics.** # participating rooms; rules configured.

**Health indicators.** "No rooms participate in placement" → Attention.

**Progressive disclosure.** Recommendation tuning under Advanced.

**Validation.** ≥1 participating room recommended; priority is a total order.

**Empty state.** "Choose which rooms accept placements."

**Responsive.** Priority list drag → up/down buttons on mobile.

---

### 3.8 COMMUNICATIONS

**Purpose.** How this location talks to families — sender identity, branding, and message templates (with location overrides shown quietly).

**Operator questions answered.** What name/number do families see? What's our branding on messages? Which messages differ from our org defaults?

**Cards.** Identity (sender name, reply-to, number) · Branding (logo/colors in messages) · Templates (org default vs location override) · Location Messaging.

**Actions.** Edit identity · Upload branding · Edit/override template · Reset to org default.

**Summary metrics.** Sender configured?; # templates overridden vs inherited.

**Health indicators.** "No sender identity set" → Attention.

**Progressive disclosure.** Template overrides use the same quiet grammar: "Using org default · Customize."

**Validation.** Valid reply-to; verified number before enabling sends.

**Empty state.** "Set up how this location talks to families."

**Responsive.** Template list → detail drill on mobile.

---

### 3.9 ACCESS

**Purpose.** Who on the team can see and manage this location.

**Operator questions answered.** Who can manage Downtown Campus? What can each person do? Who has no access that should?

**Cards / Lists.** Team Members (person + role) · Roles (role → what it can do, in plain terms) · (Scope shown as "which locations they manage" — never "scope filter").

**Actions.** Add team member · Change role · Set which locations · Remove access.

**Summary metrics.** # with access; # admins.

**Health indicators.** "No admin manages this location" → Attention.

**Validation.** ≥1 admin with access; guard on removing your own last admin access.

**Empty state.** "Add your team so they can manage this location."

**Responsive.** Member list stacks; role detail as drill.

---

## 4. Card specifications (shared behavior)

Every card in this experience obeys the same contract, so the surface feels like one system:

| Property | Rule |
|---|---|
| **Title** | A noun the operator recognizes ("Capacity", "Weekly Hours") — never a feature name ("Capacity Resolver"). |
| **Consequence line** | Optional one-liner under the title stating why it matters, when non-obvious. |
| **Primary number/state** | Stated as a plain sentence where possible ("Holds 11 children"), not a bare metric. |
| **The "why"** | If a number is derived, the binding reason is shown in business language ("Limited by staffing ratios"), with an ⓘ for the plain basis. |
| **Secondary detail** | Component/supporting numbers are visually quieter (smaller, muted), one line. |
| **Action** | One clear affordance ("Manage ▸", "Edit ▸") linking to where it's configured. |
| **Unknown state** | `not set up` / `needs more info` — **never** `0`, never blank, never a fake number. |
| **Inheritance** | Only Rooms/Programs show inheritance tags ("Uses location hours"). The Location never shows them (it's the source). |

**Card families (the reusable vocabulary):**
1. **Glance card** — utilization bar + tiered metrics (Overview At a Glance).
2. **Summary card** — sentence headline + secondary detail + Manage (Room Capacity, Ratios, Schedule).
3. **List card** — ranked/ordered rows with per-row action (Needs Attention, Closures, Activity, Programs).
4. **Editor card** — inline fields + live consequence + Save/Effective-from (Room Capacity, Weekly Hours).
5. **Progress card** — donut + checklist (Setup Progress).

---

## 5. Interaction specifications

- **Edit is inline-first.** Cards flip to editable in place; dialogs are reserved for *create* and *destructive confirm*. Managing an existing thing never traps the operator in a modal.
- **Save is immediate + reversible.** Optimistic update; a quiet "Effective from [Today]" line carries the (hidden) versioning; future dates yield a "Scheduled · Undo" ribbon.
- **Consequences are live.** In any editor touching capacity/ratios/hours, a plain-language result sentence updates as they type ("Right now this room holds 11 — limited by ratios").
- **Inheritance is one gesture.** "Uses location hours" ↔ "Set different hours for this room" is a single toggle-like flow; removing a difference silently returns to inherited.
- **Every number is a link.** Overview/summary numbers navigate to where they're configured. Nothing is a dead end.
- **Attention items are one-tap resolvable.** Each has a direct "View ▸" to the exact surface, and disappears when resolved.
- **Errors are inline and kind.** Guard failures (weaken license, close-before-open) appear beside the field in plain language, never as codes or toasts of doom.

---

## 6. Dialogs (canonical set)

| Dialog | Purpose | Notes |
|---|---|---|
| Add Location | Create a location | Opens General create form; "Save & continue setup". |
| Edit Location (General) | Identity/timezone/status | Drawer; the only home for timezone. |
| Offer a Program | Add a program from the catalog | Pick-from-list; legacy-source advisory. |
| Add Room | Create a room | Name, program, age range, room size. |
| Add Closed Day | Closure or exception | Date, label, closed-all-day vs different-hours. |
| Edit Hours | Weekly grid | Effective-from line. |
| Add Team Member | Grant access | Person + role + locations. |
| Confirm (Deactivate / Stop offering / Remove access) | Destructive confirm | States the business consequence, not the DB effect. |

Dialogs never contain the words version, scope, precedence, effective dating (the "Effective from" *line* is allowed; the *concept* is never named).

---

## 7. Shared component library (design system inventory)

Described as design behaviors, not code. Reuse Alloy's existing settings kit; add the few marked **new**.

**Reuse:** the workspace shell (left list + center + right rail), the page/entity header, the horizontal tab bar, metric tiles, status pills (Active/Inactive, ✓/⚠/✕), drawers & confirm modals, the existing capacity/ratio authoring group (as the base of the Room Capacity editor).

**New (small, generic, business-language):**
| Component | Behavior |
|---|---|
| **Attention List** | Ranked, typed items (⚠ fix / ⓘ improve / ✓ good) each with a "View ▸". Empty = "Everything looks good." The health surface. |
| **Setup Progress** | Donut + per-workspace checklist; collapses to a line at 100%. |
| **Glance Bar** | Utilization bar with enrolled/open/unavailable segments + tiered metrics. |
| **Consequence Sentence** | A live, plain-language line that restates resolver output as a business outcome. |
| **Inherited Value** | A value with an "Uses location …" tag + a "Set different …" affordance. |
| **Effective-From Save** | Save control with a quiet date line; produces "Scheduled · Undo" for future dates. |
| **Basis Popover (ⓘ)** | Reveals the plain-English basis of a derived number. |
| **Activity Feed** | actor · plain summary · relative time · deep-link. |

---

## 8. Visual hierarchy

1. **The location name is the loudest thing on the page** — you are always oriented to *what you're configuring*.
2. **Health/attention beats inventory.** Utilization and Attention read before counts and lists.
3. **Consequences beat components.** "Holds 11 — limited by ratios" is prominent; the 14/12/12 breakdown is quiet.
4. **Primary action per card is obvious; everything else recedes.**
5. **Inheritance is whisper-weight** — tags are muted, never alarms.
6. **Setup Progress is prominent only while incomplete**, then disappears — it must not nag a finished operator.
7. **Color is meaning, not decoration:** green = good/available, amber = attention/open-but-watch, grey = unavailable/inactive, red reserved for true errors only.

---

## 9. Progressive disclosure rules

- **Default view = the 80% case.** Room size, licensed limit, set capacity, ratios — visible. Effective dates, history, program-wide defaults, external IDs — folded.
- **Effective dating is a single line, not a screen.** Only appears at save; only expands if the operator wants a future date.
- **History on demand.** "What changed and when" lives behind "History"/"Recent Activity" as a plain timeline — never `effective_start`/`supersedes`.
- **Advanced is labeled and closed.** Anything an average operator won't touch (program-wide defaults, recommendation tuning, mixed-age policy) sits under an "Advanced ▸" fold.
- **Derived numbers reveal their basis on ⓘ**, never inline math.
- **Inheritance detail on demand.** "Comes from the location" is the default phrasing; "see the 3 rooms that differ" is an expand, not a default table.

---

## 10. Configuration Health model  (→ "Attention")

**Rename Health to Attention** in the product; it answers "is anything wrong or improvable *right now*?"

- **Source:** the Phase A resolvers already return a status + reasons for every resolvable thing. Attention is the human-language rollup of those, **plus** a few product-level checks (no admin, no sender identity, thin tour availability).
- **Item grades:**
  - ⚠ **Fix** — something is incomplete or conflicting and blocks correct operation ("Toddler Room — capacity not finished"; "Two settings disagree — review").
  - ⓘ **Improve** — works, but could be better ("Tour availability looks thin").
  - ✓ **Good** — an explicit reassurance line, shown sparingly ("All programs up to date").
- **Ranking:** Fix > Improve > Good; within a grade, by operational impact (capacity/enrollment first).
- **Every item is actionable** — one-tap to the exact surface; auto-clears when resolved.
- **Empty state:** "Everything looks good ✓" (single calm line). **No "last checked" timestamp** — this is derived live, not polled; a timestamp would imply a background monitor (implementation leak).
- **No global "Healthy" badge.** The truth is the item list. A green header lozenge may summarize "No issues" only when the list is genuinely empty.

---

## 11. Configuration Progress model  (→ "Setup")

Answers a *different* question: "have I finished setting this location up?" It is onboarding, not operations.

- **Unit of progress = workspace.** A location is "set up" when each owned area meets a minimum bar:
  | Area | "Set up" means |
  |---|---|
  | General | Name, address, timezone, status set |
  | Programs | ≥1 program offered |
  | Rooms | ≥1 room, and every room has capacity + ratios + a program |
  | Schedule | Weekly hours set |
  | Tours | Availability set (or explicitly "not offering tours") |
  | Placement | ≥1 participating room |
  | Communications | Sender identity set |
  | Access | ≥1 admin with access |
- **% = areas complete / total.** The donut and checklist show which areas remain, each linking to finish.
- **"Not applicable" is a valid completion** — an operator can mark "we don't offer tours" and it counts as done, so progress can truthfully reach 100%.
- **Prominent while <100%, then it collapses to a single quiet line** ("Setup complete ✓"). It must never nag a running center.
- **Progress ≠ Health.** A location can be 100% set up and still have an Attention item (e.g. a room drifted into a conflict). Keeping these separate is the fix for the mockup's central contradiction (§13).

---

## 12. Implementation phases (product-sequenced)

Sequenced by operator value and by dependency (engineering ordering is in the companion blueprint).

| Phase | Ships | Operator can… |
|---|---|---|
| **P1 — The Frame + Overview** | Location workspace shell, list, header, tabs, General editor, Overview (At a Glance + Attention + Setup Progress, read-only) | See every location, know its health and setup state, edit identity/timezone. |
| **P2 — Rooms (the heart)** | Room list + Room Overview + Capacity & Ratios editor (with live consequence + effective-from) | Actually configure the business: set capacity, ratios, see availability and why. |
| **P3 — Schedule + Programs** | Unified Schedule (hours+closures+exceptions); Programs offering management | Set when they're open and what they offer; rooms inherit quietly. |
| **P4 — Tours · Placement · Communications · Access** | The four remaining owned areas over existing substrates | Complete the location end-to-end; Setup Progress can reach 100%. |
| **P5 — Polish** | Empty states, history timelines, help menu, "View as" (if kept), cross-links, real activity feed | A finished, calm, self-explaining product. |

Each phase is demoable as a coherent operator story, not a technical slice.

---

## 13. Critique of the attached mockup

The direction is strong: master–detail, business language, the collapse of capacity/ratios into rooms. But as Head of Product/Design I'd change the following before build.

### What should disappear
- **"Configuration Health · Healthy · last checked 2m ago."** Delete it. (a) It duplicates Needs Attention. (b) It *contradicts* it — "Healthy" over "1 room has incomplete capacity" is a lie the operator will notice and stop trusting. (c) "last checked 2m ago" implies a background monitor — implementation leakage; configuration health is derived live, not polled.
- **"Uses location schedule" tag on the Location's own Operating Schedule card.** The location *is* the schedule. This tag only makes sense on a *Room*. On the location it's confusing and technically nonsensical. Remove it here; keep it (correctly) on rooms.
- **Helpful Resources block in the primary right rail.** Setup Guide / Best Practices / Video Tutorials / Contact Support don't deserve prime, permanent real estate a returning operator sees every day. Move to a persistent "?" help menu; optionally surface contextually inside empty states.

### What should move
- **"Today's Tours: 3 scheduled"** is *operational*, not *configuration*. It belongs on the operations/home dashboard. In Settings, the tour signal should be about *setup* ("tour availability configured / thin"), not a live daily count.
- **Timezone** already reads correctly in the header, but it must be *editable* only inside **General** (via Edit Location) — never implied to be its own setting.
- **"View as: Location ▾"** is ambiguous (preview as whom?). Either relabel to its real function ("Preview family view") and move it near where it's meaningful, or cut it from P1.

### What should merge
- **Three status surfaces → two.** Configuration Health + Needs Attention are the same question; merge into **Attention**. Keep **Setup Progress** separate (different question — §11). This single change removes the mockup's biggest source of confusion.
- **The 5-metric "At a glance" strip → one card, two tiers.** Capacity/enrollment/open-seats (utilization = health) should outrank Programs/Rooms (inventory = counts). Flat equal weighting buries the signal.
- **Hours + Closures** (two Overview cards) are fine as *summaries*, but their editing homes must be **one Schedule tab**, not implied separate features.

### What should become secondary
- Program and Room **counts** (inventory) beneath the capacity **utilization** signal.
- **Recent Activity** beneath **Needs Attention** (attention is the priority; activity is context).
- **Component capacity numbers** (room size / license / set) beneath the plain "Holds 11 — limited by ratios" sentence.

### What exposes implementation instead of business concepts
- "last checked 2m ago" → smells like a system health-check/cron.
- "Uses location schedule" on the location → exposes the inheritance model in the wrong place.
- Equal-weight raw metrics with no consequence framing → data dump, not a summary ("103 / 124" alone doesn't say *good or bad*; "21 open seats" does).
- Any place a number appears without a *why* invites the operator to go hunting for the engine. Every derived number needs a business reason attached.

### Where the operator will get confused
- **Health says Healthy, Progress says 85%, Attention says a room is broken** — three signals, no clear "so is my center OK or not?" answer. (Fixed by the two-system model.)
- **Two edit paths to identity** (header "Edit Location" + the implied editability of the header fields) — make General a single, obvious destination.
- **Is Overview editable?** The "Edit Location" button next to a data-rich page suggests the whole page might be. Overview must read unmistakably as a *dashboard* (every number a link to elsewhere), with editing clearly living in General and the tabs.

### Where it can become dramatically simpler
- **One health story, not three.** Attention (now) + Setup (until done) — and Setup vanishes at 100%. A healthy, fully-configured location's Overview becomes almost empty: "Everything looks good," a capacity bar, recent activity. That emptiness is the feature — it means nothing needs the operator.
- **The whole surface reduces to one promise:** *see the business, see what needs you, fix it in one tap, and never meet the machine underneath.*

---

## Appendix — decisions this spec makes (so implementation needs no further design)

1. **8 tabs**, General behind "Edit Location," Rooms is the only nested drill.
2. **Two status systems:** Attention (live, operational) and Setup (onboarding, collapses at 100%). No third.
3. **Capacity + Ratios = one Room "Capacity" tab.** Hours + Closures + Exceptions = one location "Schedule" tab. No standalone Capacity/Ratio/Hours/Closures/Timezone anywhere.
4. **Inheritance tags appear on Rooms/Programs only**, never on the Location.
5. **Editing = inline + "Save · Effective from [Today]"**; future dates → "Scheduled · Undo." The versioning engine is never named.
6. **Unknown ≠ 0**; `staffedCapacity`/forecast are "not set up yet," not numbers.
7. **Overview is a read-only dashboard**; every number links to its configuration home.
8. **Helpful Resources and live "Today's Tours" leave the primary Settings surface.**
