# Operational Configuration Platform — Phase B Blueprint

**Status:** Canonical implementation blueprint (design only; no code in this document)
**Worktree:** `config-platform-phase-b-a3acc7`
**Depends on:** Phase A canonical provider/resolver layer (merged to `staging`, PR #191)
**Governs:** `docs/system/configuration-workspace-v1-doctrine.md`, `docs/system/configuration-ownership-doctrine.md`, `docs/system/settings-v2-doctrine.md`, `docs/platform/modules/configuration-platform.md`

---

## 0. Preamble — what this phase is and is not

Phase A delivered a **frozen** read/resolve + write/authoring substrate for the Location operational domain. Phase B does **not** redesign it, does **not** re-implement capacity/ratio math, and does **not** build "Location Settings" as a single screen. Phase B **realizes the operator-facing Operational Configuration Platform** — the full Settings experience across Locations, Programs, Rooms, Schedule & Closures, Tours, Placement, Communications, and Access — as a thin, business-language skin over the Phase A substrate.

### The one hard rule

Operators configure **the business**. They must never see, name, or reason about:

- providers / resolvers
- configuration precedence (`room > program > site > org`)
- effective dating (`effective_start` / `effective_end` / supersede-with-lineage)
- capacity/ratio engines, binding factors, resolution status enums
- inheritance trees

Every one of those is present in the substrate and **must be consumed silently**. The blueprint's §A ("Translation Layer") is the binding contract for how each engine concept is rendered in business language.

### Substrate reality (from the Phase A inventory — build to these, not to memory)

- **Read/resolve:** `resolveOperationalCapacity`, `resolveRatio`, `resolveLocationTimezone`, and the canonical Location/Program/Room providers. All return `{ status, warnings, appliedRules, ... }` — **never** coerce `null`/`incomplete` to `0`.
- **Write/authoring:** `configRuleAuthoringService.ts` already exists — versioned, effective-dated writes, exposed via role-gated `POST /api/admin/operational-config/*` routes (`action: create | version | retire | void`). **Editing = creating a new version effective on a date.** There is no in-place mutation.
- **Persistence:** 5 normalized, effective-dated, RLS-protected Supabase tables (`childcare_capacity_rules`, `childcare_ratio_rules`, `childcare_ratio_rule_tiers`, `childcare_operating_windows`, `childcare_schedule_rules`). No JSON blob config.
- **Bundle loader:** `loadChildcareConfigRuleBundle(supabase, orgId)` → feeds the pure resolvers.

### Known substrate gaps this blueprint must design around (do not fake them)

| Concept shown in mockup | Phase A reality | Blueprint decision |
|---|---|---|
| Room "Staffed" capacity | `staffedCapacity` **always `null`** (G3 not built) | Render as **"Not yet configured"** (quiet), never a number; hide from binding math until G3 (Phase D). |
| Room "Forecasted availability" | `forecastedAvailability` **always `null`** (Phase D) | Not surfaced in Phase B. |
| Room Summary "Lead / Assistant Teacher" | No staffing provider in Phase A | Deferred to Staffing phase; show **"Not assigned"** placeholder, no editor in Phase B. |
| Closures (Memorial Day, etc.) | No dedicated closures table; closest is `childcare_schedule_rules` / operating-window exceptions | Model closures as **schedule exceptions** (§4.4); if a first-class closures concept is required, it is a **new** substrate task (flagged in §9, Track 0). |
| Location first-class `timezone` column | Not yet added (resolver falls back to `metadata.timezone`) | Phase B **data task** (§9, Track 0): add `locations.timezone` column + backfill; identity editor writes it. |

These gaps are the honest boundary of Phase B. Anything past them is named and deferred, not stubbed with fake data.

---

## 1. Information Architecture

### 1.1 Top-level placement

The platform lives under the existing **AdminV2 Settings** tree (`web/app/adminV2/settings/`), reachable from the primary left nav **Settings** item (per the mockup). Within Settings, the operational configuration surface is **Locations-rooted**:

```
Settings
└── Locations                         ← operational configuration platform root
    └── {location}                    ← Location workspace (master–detail)
        ├── Overview                  (tab)
        ├── Programs                  (tab)
        ├── Rooms                     (tab)  ──► {room} sub-workspace (master–detail)
        ├── Schedule & Closures       (tab)
        ├── Tours                     (tab)
        ├── Placement                 (tab)
        ├── Communications            (tab)
        └── Access                    (tab)
```

The existing Settings index (`web/app/adminV2/settings/page.tsx`) and its data-model/experience domains (Fields, Layouts, Statuses, Business Processes, Actions) are **untouched**. This blueprint owns only the **Locations** domain and its descendants.

### 1.2 The ownership spine (from `configuration-workspace-v1-doctrine.md`)

Configuration follows ownership. The IA is the ownership model made navigable:

```
Location (site)  ── owns ──►  identity · timezone · operating schedule · closures
                              · communications · tour defaults
                              · Program collection · Room collection
   │
   ├── Program (location_program_categories)  ── belongs to Location
   │
   └── Room (unit location + config rules)  ── owns ──►  capacity · ratios
                                                        · eligible programs
                                                        · room schedule overrides · status
```

Two navigational consequences, both non-negotiable:

1. **Capacity and ratios have no top-level tab.** They are configured *inside a Room*, because that is where the business owns them. (The Location Overview *summarizes* capacity; it never *configures* it.)
2. **Hours and Closures are one tab** ("Schedule & Closures"), owned by the Location, because a room's schedule is an *override* of the location's, and closures are location-wide.

### 1.3 Entity map

| Operator entity | Substrate backing | Provider entry point |
|---|---|---|
| Location | `location_type='site'` row | `resolveLocationById`, `resolveSiteLocations` |
| Program | `childcare_program_type` vocabulary + `location_program_categories` | `resolveProgramsForLocation` |
| Room | `location_type='unit'` row + config rules | `resolveRoomsForLocation`, `resolveRoomById` |
| Capacity (of a Room) | `childcare_capacity_rules` | `resolveOperationalCapacity` |
| Ratios (of a Room) | `childcare_ratio_rules` + `_tiers` | `resolveRatio` |
| Hours (of a Location/Room) | `childcare_operating_windows` | bundle + `resolveConfigRule` |
| Closures | `childcare_schedule_rules` (exceptions) — see §4.4 gap | bundle |
| Timezone | `locations.timezone` (new) → `metadata.timezone` fallback | `resolveLocationTimezone` |

---

## 2. Navigation Model

### 2.1 Routes

All under `web/app/adminV2/settings/locations/`:

| Route | Screen |
|---|---|
| `/adminV2/settings/locations` | Locations root — list + empty right pane (or first location auto-selected) |
| `/adminV2/settings/locations/[locationId]` | Location workspace → **Overview** (default tab) |
| `/adminV2/settings/locations/[locationId]/[tab]` | Location workspace → named tab (`programs`, `rooms`, `schedule`, `tours`, `placement`, `communications`, `access`) |
| `/adminV2/settings/locations/[locationId]/rooms/[roomId]` | Room sub-workspace → **Overview** |
| `/adminV2/settings/locations/[locationId]/rooms/[roomId]/[roomTab]` | Room tab (`capacity`, `programs`, `schedule`, `enrollment`, `staffing`, `notes`) |

Tab state is a **route segment**, not local state, so every configuration surface is deep-linkable and back/forward works (required for the "Recent Changes → jump to what changed" flow).

### 2.2 Master–detail shell (matches mockup)

Every screen uses the same three-zone chrome, built on the existing `WorkspaceShellLayout`:

```
┌ left entity list ─┬ center detail ───────────────────────┬ right rail ──────┐
│ search + filter   │ breadcrumb                            │ Edit + overflow  │
│ + "Add"           │ entity header (name · status · facts) │ Quick Actions    │
│ scrollable rows   │ horizontal tab bar                    │ Recent Changes   │
│ (Locations/Rooms) │ card grid (per active tab)            │ Config Health    │
└───────────────────┴───────────────────────────────────────┴──────────────────┘
```

- The **left list** is Locations at the Location level, and Rooms at the Room level (the mockup's second screen). It is a persistent selector, not a page.
- The **right rail** (`WorkspaceShellLayout.railContent`) is consistent across tabs: Quick Actions + Recent Changes + Configuration Health. It re-scopes to the active entity.
- The **breadcrumb** (`Platform Configuration › Locations › Downtown Campus › Toddler Room`) uses `WorkspaceShellLayout.containLead`.

### 2.3 Navigation invariants

- Selecting a location in the left list **preserves the active tab** where meaningful (e.g. staying on "Rooms" while switching locations), otherwise falls back to Overview.
- Drilling into a Room is a **route push** (own URL), not an in-pane swap — the Room is a first-class configuration entity with its own master–detail.
- Cross-links (e.g. Room's "Uses Location Schedule" → Location's Schedule & Closures tab) navigate up and preserve a "return to room" affordance.

---

## 3. Workspace Hierarchy

```
LocationsPlatform (root shell)
│
├── LocationListPane                    (left rail; Locations)
│
└── LocationWorkspace                   (center + right rail; one location)
    ├── LocationHeader
    ├── LocationTabBar
    ├── LocationRightRail
    │   ├── LocationQuickActions
    │   ├── RecentChangesFeed
    │   └── ConfigHealthCard
    └── tab bodies:
        ├── LocationOverviewTab
        ├── ProgramsTab
        ├── RoomsTab ──────────────► RoomWorkspace  (nested master–detail)
        │                            ├── RoomListPane   (left rail; Rooms)
        │                            ├── RoomHeader
        │                            ├── RoomTabBar
        │                            ├── RoomRightRail (QuickActions/Activity/Health)
        │                            └── tab bodies:
        │                                ├── RoomOverviewTab
        │                                ├── RoomCapacityRatiosTab
        │                                ├── RoomEligibleProgramsTab
        │                                ├── RoomScheduleTab
        │                                ├── RoomEnrollmentTab
        │                                ├── RoomStaffingTab      (deferred; read-only placeholder)
        │                                └── RoomNotesTab
        ├── ScheduleClosuresTab
        ├── ToursTab
        ├── PlacementTab
        ├── CommunicationsTab
        └── AccessTab
```

---

## 4. Screen-by-screen specification

Each workspace is specified against the fixed facet list: **Purpose · Operator workflow · Visual layout · Cards · Lists · Actions · Dialogs · Dependencies · Quick actions · Health indicators · Summary metrics · Validation · Progressive disclosure · Empty state.**

---

### 4.1 Location Overview

**Purpose.** The operator's home for a location: at-a-glance health, capacity, and the collections the location owns, with fast paths to the most common configuration actions.

**Operator workflow.** Operator picks a location from the left list → lands on Overview → scans health + capacity + upcoming closures → either drills into a tab to configure, or fires a Quick Action (Add Room / Add Program / Add Closure).

**Visual layout.** Center = 2-row × 3-column card grid (per mockup). Right rail = Quick Actions + Recent Changes.

**Cards.**
| Card | Data binding | Notes |
|---|---|---|
| Capacity Summary | Aggregate of `resolveOperationalCapacity` over the location's rooms → Σ`licensedCapacity`, Σ`committedOccupancy` ("Current Enrollment"), Σ`availableNow` | Progress bar = enrollment vs licensed. If any room resolves `incomplete`/`not_configured`, show the aggregate with an "N rooms need setup" quiet note, not a wrong total. |
| Rooms | `resolveRoomsForLocation` (count active/inactive) | "View all rooms →" → Rooms tab. |
| Programs Offered | `resolveProgramsForLocation` (active/inactive count) | "Manage programs →" → Programs tab. |
| Operating Hours | Location-scoped operating windows (bundle) via `resolveConfigRule` at scope=site | Weekly summary; "View full schedule →" → Schedule & Closures. |
| Upcoming Closures | Next N schedule exceptions (§4.4) | "View all closures →". |
| Configuration Health | `ConfigHealthCard` (see §6) computed from resolver `status` + `warnings` across the location | Complete / Warnings / Issues counts. |

**Lists.** Recent Changes feed (right rail): actor · what changed · date, from config-rule `created_by`/`updated_by`/`updated_at` metadata (and/or `workflow_events`). Each row deep-links to the changed surface.

**Actions.** `Edit Location Details` (header) → Identity dialog (§4.7 shares this). Overflow: Deactivate location, Duplicate as template, Export config.

**Dialogs.** Edit Location Details (identity + timezone); Add Room; Add Program; Add Closure — all thin launchers into the owning tab's create flow.

**Dependencies.** Location provider, Room provider, Program provider, capacity resolver, operating-window bundle, timezone resolver.

**Quick actions (right rail).** Add Room · Add Program · Add Closure · "View as: Location ▾" (persona/preview switch — read-only view emulation; consumes no write path).

**Health indicators.** Configuration Health card (Complete/Warnings/Issues). Header status badge (Active/Inactive) from `CanonicalLocation.isActive`.

**Summary metrics.** Licensed capacity, current enrollment, available now, room counts, program counts, upcoming-closure count.

**Validation.** Read-only surface; no direct validation. Health card is the aggregate validity signal.

**Progressive disclosure.** Derived numbers (available now) carry an ⓘ that reveals the plain-language basis ("14 open seats = 124 licensed − 103 enrolled − 7 offered") — never the formula's engine name.

**Empty state.** Location with no rooms/programs → Capacity/Rooms/Programs cards show a "Set up your first room" primer with the matching Quick Action; Health card shows "Getting started: 3 steps."

---

### 4.2 Programs

**Purpose.** Manage which programs a location offers (the location's program collection), their status, and their effective configuration.

**Operator workflow.** Operator opens Programs → sees offered programs → adds/removes offerings, reorders, toggles active → optionally opens a program to see its effective config (which rooms serve it, any program-scoped capacity/ratio rules).

**Visual layout.** Program **list** (center-left) + Program **detail** (center-right) OR list with inline expand. Right rail = Quick Actions + Health.

**Cards / Program detail.**
- **Program Summary**: label, status, description, sort order.
- **Served By** (Rooms): rooms eligible for this program, from `resolveRoomsForProgram` (renders `eligible` / `unknown` — never silently drops `unknown`).
- **Effective Configuration**: any program-scoped capacity/ratio rules (scope=`program`), shown as "applies to all rooms in this program unless a room overrides." This is the **only** place inheritance is surfaced, and it is phrased as ownership, not precedence.

**Lists.** Offered programs (drag-to-reorder → `sortOrder`); available-but-not-offered programs (from org vocabulary) in the Add dialog.

**Actions.** Add Program (from vocabulary) · Remove offering · Activate/Deactivate · Reorder · (program-scoped rule authoring optional; defaults live at room level).

**Dialogs.** "Add Program to this Location" — pick from `loadProgramVocabulary` vocabulary; warns on orphan/legacy source (`ProgramVocabularySource`).

**Dependencies.** Program provider (`resolveProgramsForLocation`, `programLegacyCompatibility`), Room provider (`resolveRoomsForProgram`).

**Quick actions.** Add Program · Reorder programs.

**Health indicators.** Per-program chip: "No rooms serve this program" warning; "legacy vocabulary source" advisory.

**Summary metrics.** Active/inactive counts; rooms-per-program.

**Validation.** Cannot remove a program that rooms still declare eligibility for without confirm; duplicate offering prevented.

**Progressive disclosure.** Program-scoped rules hidden by default under "Advanced: program-wide defaults."

**Empty state.** "This location offers no programs yet — add one from your organization's program list."

---

### 4.3 Rooms (list + Room detail)

This is a **nested master–detail** (mockup screen 2). The Rooms *tab* shows the room list; selecting a room opens the **Room workspace**.

#### 4.3.1 Room list
- Rows: room name, code (`locationNumber`/`TOD-1`), age range hint, status badge. From `resolveRoomsForLocation`.
- "Add Room" → create dialog (name, program, age range, capacity model).

#### 4.3.2 Room Overview
**Cards (per mockup):**
| Card | Binding |
|---|---|
| Room Summary | `CanonicalRoom` (+ metadata: capacity model). Lead/Assistant Teacher = **"Not assigned"** placeholder (staffing deferred). |
| Capacity Overview | `resolveOperationalCapacity` → Physical / Licensed / Operating (`configuredCapacity`) / Ratio Constrained / **Staffed = "Not yet configured"** / Available Now. Highlight `bindingCapacity` and `limitingFactor` chip. |
| Today's Snapshot | Occupancy read models (enrolled / on-leave / open seats) passed as `occupancyContext`. |
| Staff Ratios | `resolveRatio` tiers → "1 Adult : max 5", "2 Adults : max 11 (current limit)". |
| Effective Schedule | Operating windows resolution; **"Uses Location Schedule"** tag when `appliedRules` scope=`site` (no room override). |
| Recent Activity | Room-scoped change feed. |
| Configuration Health | `ConfigHealthCard` for the room. |

#### 4.3.3 Room Capacity & Ratios tab (the authoring heart)
- **Capacity editor**: physical / licensed / operating capacity fields. Save = `createCapacityRuleVersion` (effective-dated write, hidden behind "Save changes — effective from [date, default today]").
- **Ratio editor**: tier table (`max_children` / `required_staff` rows) → `createRatioRuleVersion` (+ tiers). Live preview recomputes `ratioConstrainedCapacity` via `resolveRatio` as tiers change.
- **A7 licensed guard**: a licensed value that would exceed the binding ceiling is refused with the friendly message from §A ("A license limit can only make capacity smaller, not larger").

#### 4.3.4 Room Eligible Programs tab
- Toggle which offered programs this room serves; writes room eligibility. Uses `resolveRoomsForProgram` semantics; `unknown` age-band data prompts "add an age range so we can match programs."

#### 4.3.5 Room Schedule tab
- Shows inherited location schedule with a clear **"Override this room's hours"** action. Creating an override = `createOperatingWindowVersion` at scope=`room`. Removing it = retire (window close), which visually returns the card to "Uses Location Schedule."

#### 4.3.6 Room Enrollment / Staffing / Notes tabs
- Enrollment: read-only roster snapshot (consumes enrollment read models; no config).
- Staffing: **deferred** — read-only "coming soon" with no editor (no Phase A backing).
- Notes & Documents: attach-document pattern (`AssociatedDocumentUploadModal`).

**Validation (Room-wide).** All capacity/ratio writes go through effective-dated authoring: date required, defaults to today; overlapping-window and weaken-license guards surface inline. Status/eligibility toggles confirm when they reduce availability.

**Progressive disclosure.** Advanced (effective date, retire/void a scheduled future change, view change history) hidden under "Advanced" / "History"; the default edit path is "change the number, save, done."

**Empty state (Room capacity).** "No capacity set for this room yet — enter a physical capacity to get started." Resolver `not_configured` drives this.

---

### 4.4 Schedule & Closures

**Purpose.** Own the location's operating hours, exceptions (early close/late open), and closures (holidays), which rooms inherit.

**Operator workflow.** Set weekly hours → add exceptions/closures for specific dates → confirm rooms inherit unless overridden.

**Cards.**
- **Weekly Hours**: per-day open/close (`childcare_operating_windows`, scope=site). Edit = new effective-dated version.
- **Exceptions**: date-specific hour changes.
- **Closures**: full-day closures (holidays). ⚠ **Substrate gap** — no dedicated closures table; modeled as `childcare_schedule_rules` exceptions with a `closed` marker. If a first-class closures entity is required, it is **Track 0** new-substrate work (§9). This blueprint specifies the UI against schedule-rule exceptions and flags the gap.
- **Holiday handling**: optional preset holiday set (org-level) applied per location; still writes individual exception rows.

**Inheritance / Overrides.** Location schedule is the inherited default for all rooms. Room overrides are visible here as a quiet "3 rooms override these hours" advisory with a link to each.

**Actions.** Edit weekly hours · Add exception · Add closure · Apply holiday set · Remove exception.

**Dialogs.** Add Closure (date, label, all-day/partial); Edit Hours (weekly grid, effective from).

**Dependencies.** Operating-window + schedule-rule bundle; authoring service (operating-windows + schedule-rules endpoints).

**Health / metrics.** "Days with no configured hours" warning; count of upcoming closures.

**Validation.** Close-before-open rejected; overlapping exceptions flagged; effective date required.

**Progressive disclosure.** History and future-scheduled changes under "Advanced."

**Empty state.** "Set your weekly operating hours to get started."

---

### 4.5 Tours

**Purpose.** Configure tour availability, booking defaults, lead times, buffers, tour guides, and customer-facing scheduling for the location.

**Operator workflow.** Set which days/times tours are offered → set lead time + buffer + duration → assign guides → publish customer scheduling.

**Cards.** Availability (weekly tour windows) · Booking Defaults (duration, capacity per slot) · Lead Times & Buffers · Tour Guides (assign users) · Customer Scheduling (public booking on/off + link).

**Dependencies.** Existing tours/waitlist substrate (per platform certification, tours are already complete) — Phase B **consumes** it; confirm the existing tours config store and bind to it. If tours config currently lives in a different module, this tab is a re-home, not a rebuild.

**Actions.** Edit availability · Set defaults · Assign guide · Toggle customer scheduling.

**Health / metrics.** "No tour availability set" warning; upcoming tours count.

**Validation.** Buffer < duration checks; guide must have access to the location.

**Empty state.** "Turn on tours to let families book visits."

---

### 4.6 Placement

**Purpose.** Configure how children are placed into rooms — placement rules, priority ordering, and which rooms participate in capacity-based placement, plus recommendation behavior.

**Operator workflow.** Order placement priority → mark rooms that participate in automatic placement → review recommendations behavior.

**Cards.** Placement Rules · Priority (ordered list) · Capacity Participation (per-room toggle) · Recommendations (how suggestions are generated).

**Dependencies.** Existing `placement-priority` settings route + placement doctrine (`configuration-workspace-v1-doctrine.md` placement model: Location → Program → Room → Schedule); capacity resolver for "participation" (a room participates by exposing `availableNow`).

**Actions.** Reorder priority · Toggle room participation · Configure recommendation weighting.

**Health / metrics.** "No rooms participate in placement" warning.

**Validation.** At least one participating room recommended; priority list must be total order.

**Progressive disclosure.** Recommendation tuning under "Advanced."

**Empty state.** "Choose which rooms accept placements."

---

### 4.7 Communications

**Purpose.** Configure the location's messaging identity, branding, templates, and any location-specific messaging.

**Operator workflow.** Set sender identity + branding → review/override templates → set location-specific messaging.

**Cards.** Identity (sender name, reply-to, phone/SMS number) · Branding (logo, colors used in comms) · Templates (list; edit/override org defaults) · Location-Specific Messaging.

**Dependencies.** Existing Communications substrate (`web/app/adminV2/settings/communications`, `FamilyCommunicationWorkspace`, per-tenant Twilio) — Phase B binds the location-scoped slice. Timezone resolver feeds send-time/quiet-hours display (`resolveRecipientTimezone`, dual-time labels).

**Actions.** Edit identity · Upload branding · Edit/override template · Reset to org default.

**Health / metrics.** "No sender identity configured" warning; templates overridden vs inherited count.

**Validation.** Valid reply-to; verified sending number required before enabling.

**Progressive disclosure.** Template overrides shown as "Using org default · Override" (same quiet-inheritance grammar as schedule).

**Empty state.** "Set up how this location communicates with families."

---

### 4.8 Access

**Purpose.** Manage who can see and configure this location — users, roles, and scopes.

**Operator workflow.** Add users to the location → assign roles → confirm scope (which locations they can access).

**Cards / Lists.** Users (with role) · Roles (role → capabilities summary) · Scopes (site access map — `SiteScopeFilter` / `user_site_access`).

**Dependencies.** Existing `user-access` + `users-roles` settings routes; `resolveLocationsForUser` / `SiteScopeFilter` is the read model for scope; RLS (`has_org_role`) is the enforcement (surfaced as role labels, never as policy names).

**Actions.** Add user · Change role · Set scope · Remove access.

**Health / metrics.** "No admin assigned to this location" warning; users-with-access count.

**Validation.** At least one owner/admin with access; cannot remove your own last admin access without confirm.

**Empty state.** "Grant your team access to this location."

---

## 5. Interaction Model

### 5.1 The edit → effective-dated-version pattern (the core interaction)

Because the substrate never mutates in place, **every "edit" is really "create a new version."** The operator must not learn this. The interaction contract:

1. Operator clicks **Edit** on a card → fields become editable inline (or in a dialog).
2. Operator changes values → clicks **Save changes**.
3. A single quiet line reads **"Effective from [Today ▾]"** (default = today; editable date). Most operators never touch it.
4. On save → `create*RuleVersion` with the chosen date; the prior version's window auto-closes. UI optimistically shows the new effective values and re-resolves.
5. If the date is in the future, the card shows a quiet **"Scheduled: takes effect [date]"** ribbon with an **Undo** that maps to `void` (delete not-yet-effective version).

**History** (all versions) lives behind an "Advanced → History" disclosure per card, rendered as a plain timeline ("Capacity was 12, changed to 14 on May 20 by Sarah J."), never as `effective_start`/`supersedes_id`.

### 5.2 Inheritance surfacing (quiet overrides)

- Inherited values render with a tag: **"Uses Location Schedule"**, **"Using org default"**.
- An **Override** control turns the tag into an editable value scoped one level down (room/program). Removing the override retires the child rule and the tag returns.
- Precedence is **never** shown. When resolvers report `appliedRules`, the UI translates the winning scope into one phrase: *"This value comes from the Location"* / *"This room overrides the Location."*

### 5.3 Resolution status → UI state (uniform across all resolvers)

| `status` | UI treatment |
|---|---|
| `resolved` | Show the value normally. |
| `incomplete` | Show what's known + a quiet "Needs setup: {plain reason from warning}" chip. Never a `0`. |
| `not_configured` | Empty-state primer for that card ("No capacity set yet"). |
| `conflicted` | Warning banner: "Two settings disagree — {plain reason}. Review." Links to the two sources. |

`warnings[].code` is mapped through §A to plain language; `appliedRules` powers "where this comes from" disclosures. **Raw codes never reach the screen.**

### 5.4 Feedback & motion

Optimistic updates with re-resolve on settle; inline validation (not modal errors) for guard failures (weaken-license, close-before-open); toast confirmations for background writes. Motion follows existing workspace CSS transitions (there is **no** `.motion-control` system today — do not introduce one here).

---

## 6. Shared reusable UI primitives

**Reuse (exist today — do not rebuild):**

| Primitive | Path | Role in Phase B |
|---|---|---|
| `WorkspaceShellLayout` | `web/components/admin/workspace/WorkspaceShellLayout.tsx` | The 3-zone master–detail chrome (primaryColumn + railContent + containLead breadcrumb). |
| `SettingsPageHeader` | `web/components/adminV2/settings/SettingsPageHeader.tsx` | Entity header title row. |
| `SettingsEntityTabBar` | `web/components/adminV2/settings/SettingsEntityTabBar.tsx` | The horizontal tab bar (generic `<K extends string>`). |
| `KpiCard` | `web/components/admin/KpiCard.tsx` | Metric tiles (capacity numbers, counts) — `value/label/accent/delta`. |
| `StatusBadge` / `AssignmentStatusBadge` | `web/components/admin/StatusBadge.tsx` | Active/Inactive and status pills (Pine/Ember/Stone system). |
| `SettingsNavTile` | `web/components/adminV2/settings/SettingsNavTile.tsx` | Domain/nav tiles. |
| `ConfigRuleAuthoringGroup` | `web/components/adminV2/settings/locations/ConfigRuleAuthoringGroup.tsx` | **Existing** capacity/ratio authoring group — the base for the Room Capacity & Ratios editor. |
| `LocationSiteConfigurationWorkspace` | `web/components/adminV2/settings/LocationSiteConfigurationWorkspace.tsx` | Direct precedent for the site-centric layout (Programs/Rooms/Schedules). |
| Drawer/modal chrome | `AdminEntityDrawer`, `Drawer`, `AdminDeleteConfirmModal`, `FieldDefinitionEditModal` | Edit dialogs, confirms. |
| Doc upload | `AssociatedDocumentUploadModal` | Room Notes & Documents. |

**Build new (no primitive exists — small, generic, reusable):**

| New primitive | Purpose | Notes |
|---|---|---|
| `ConfigHealthCard` | Complete / Warnings / Issues rollup | Pure function of `{status, warnings}[]` from resolvers. Used on every Overview + as a per-tab health indicator. |
| `HealthDot` / `HealthPill` | ✓ / ⚠ / ✕ inline status glyph | Consumes the same status vocabulary. |
| `CapacityMeter` | Enrollment-vs-capacity progress bar | Green/amber/grey segments = enrolled/offered/available. |
| `EffectiveValueField` | A value + inheritance tag + Override control | The heart of quiet-inheritance; wraps any field with "Uses Location …/Override." |
| `EffectiveDateSaveBar` | "Save changes · Effective from [date]" | Encapsulates the version-write interaction; hides effective-dating. |
| `ChangeFeed` / `ChangeFeedItem` | Recent Changes / Recent Activity list | actor · summary · date · deep-link. |
| `DerivedNumberWithBasis` | Number + ⓘ plain-language basis popover | For availableNow, ratioConstrained, etc. |
| `QuickActionsRail` | Right-rail action list | actor-scoped; icon + title + subtitle rows. |

All new primitives consume **only** the resolver contract types (`OperationalResolutionStatus`, `OperationalResolutionWarning`, `OperationalCapacityResolution`, `ResolvedRatio`) — never raw DB rows — so they stay engine-agnostic.

---

## 7. Component hierarchy

```
<LocationsPlatformRoute>                         app/adminV2/settings/locations/[[...]]/page.tsx
 └─ <WorkspaceShellLayout surface="company">
     ├─ leftPane:  <LocationListPane>            (search, filter, Add, rows)
     ├─ containLead: <Breadcrumb>
     ├─ primaryColumn: <LocationWorkspace>
     │    ├─ <SettingsPageHeader> (LocationHeader: name, StatusBadge, address/phone/tz)
     │    ├─ <SettingsEntityTabBar tabs=[Overview…Access]>
     │    └─ <TabRouter>
     │         ├─ <LocationOverviewTab>
     │         │    ├─ <CapacityMeter>+<KpiCard×3>         (Capacity Summary)
     │         │    ├─ <KpiCard>            (Rooms, Programs)
     │         │    ├─ <OperatingHoursCard> <UpcomingClosuresCard>
     │         │    └─ <ConfigHealthCard>
     │         ├─ <ProgramsTab>            (ProgramList + ProgramDetail)
     │         ├─ <RoomsTab>
     │         │    └─ <RoomWorkspace>       (nested WorkspaceShellLayout)
     │         │         ├─ leftPane: <RoomListPane>
     │         │         ├─ <SettingsPageHeader> (RoomHeader)
     │         │         ├─ <SettingsEntityTabBar tabs=[Overview…Notes]>
     │         │         └─ <RoomTabRouter>
     │         │              ├─ <RoomOverviewTab>  (RoomSummary, CapacityOverview,
     │         │              │     TodaysSnapshot, StaffRatios, EffectiveSchedule,
     │         │              │     RecentActivity, ConfigHealthCard)
     │         │              ├─ <RoomCapacityRatiosTab>  (extends ConfigRuleAuthoringGroup
     │         │              │     + EffectiveDateSaveBar + live resolveRatio preview)
     │         │              ├─ <RoomEligibleProgramsTab>
     │         │              ├─ <RoomScheduleTab>        (EffectiveValueField override)
     │         │              ├─ <RoomEnrollmentTab>  (read-only)
     │         │              ├─ <RoomStaffingTab>    (deferred placeholder)
     │         │              └─ <RoomNotesTab>
     │         ├─ <ScheduleClosuresTab>
     │         ├─ <ToursTab>  <PlacementTab>  <CommunicationsTab>  <AccessTab>
     └─ railContent: <LocationRightRail>
          ├─ <QuickActionsRail>
          ├─ <ChangeFeed>            (Recent Changes)
          └─ <ConfigHealthCard>
```

---

## 8. State model

### 8.1 Data flow (read)

```
Supabase ──► loadChildcareConfigRuleBundle(orgId) ─┐
             canonical providers (location/room/program/tz) ─┤
             occupancy read models (enrollment) ──┘
                                │
                     server component / loader
                                │  (pure)
             resolveOperationalCapacity / resolveRatio / resolveLocationTimezone
                                │  → {status, warnings, appliedRules, values}
                                ▼
                     view models (per card)  ──►  client components
```

- **Server-first.** Bundle load + resolution happen in server components / route loaders (RSC). Resolvers are pure — feed them the bundle + occupancy context. Client components receive **resolved view models**, not raw rows.
- **No client-side capacity math.** The client never re-implements binding/ratio logic; it re-requests resolution (or reuses the pure resolver with an already-loaded bundle) for live previews in the editor.

### 8.2 State buckets

| Bucket | Where | Contents |
|---|---|---|
| Navigation state | URL (route segments) | selected location, active tab, selected room, room tab |
| Server cache | RSC / query cache | config bundle, provider results, resolved view models |
| Editor draft state | client, local | in-flight field edits + chosen effective date, until Save |
| Write result | server action / API | version-create response → re-resolve → cache invalidation |
| Ephemeral UI | client, local | disclosure open/closed, dialog open, filter/search text |

### 8.3 Write flow

```
editor draft ──Save──► POST /api/admin/operational-config/{kind}  {action:"version", effectiveFrom, values}
                         │ (requireAdminOrOps; A7 guard; supersede prior)
                         ▼
                 revalidate bundle ──► re-resolve ──► updated view models
```

Optimistic UI shows the new value immediately; a failed guard (e.g. `licensing_override_weakens_ceiling`) rolls back and shows the §A message inline.

### 8.4 Contract types the state layer speaks (never DB rows in the UI)

`CanonicalLocation`, `CanonicalRoom`, `CanonicalProgram(Availability)`, `TimezoneResolution`, `OperationalCapacityResolution`, `ResolvedRatio`, `OperationalResolutionWarning`, `AppliedOperationalRule`.

---

## 9. Implementation sequence

**Track 0 — Enablement (must land first).**
0.1 Re-root this branch onto `origin/staging` (worktree is 1,173 behind; Phase A is not present here). Verify all Phase A symbols import.
0.2 Add `locations.timezone` column + backfill from `metadata.timezone`; wire identity editor to write it (closes the timezone fallback).
0.3 Decide closures model: schedule-rule exceptions (no new table) vs first-class closures table. **Blueprint recommendation: start with schedule-rule exceptions**; promote to a table only if operators need holiday sets/recurrence beyond exceptions.
0.4 Build the new shared primitives (§6): `ConfigHealthCard`, `EffectiveValueField`, `EffectiveDateSaveBar`, `CapacityMeter`, `ChangeFeed`, `DerivedNumberWithBasis`, `QuickActionsRail`.

**Track 1 — Shell + Location Overview (the skeleton the mockup shows).**
Routes, `WorkspaceShellLayout` wiring, `LocationListPane`, `LocationHeader`, `SettingsEntityTabBar`, right rail, and the Overview cards (read-only over resolvers). Ships the whole navigational frame + health.

**Track 2 — Rooms + Room Overview + Capacity & Ratios (the authoring core).**
`RoomWorkspace`, Room Overview cards, then the Capacity & Ratios editor on top of `ConfigRuleAuthoringGroup` + `EffectiveDateSaveBar` + live `resolveRatio` preview. This is the highest-value, highest-risk workspace — do it early, right after the frame.

**Track 3 — Schedule & Closures + Programs.**
Location hours/exceptions/closures authoring; Programs offering management + program-scoped defaults.

**Track 4 — Tours · Placement · Communications · Access.**
Bind to existing substrates (these are re-homes/consumers, not new engines). Order by existing-backing maturity: Placement + Communications + Access have clear existing routes; Tours confirm-and-bind.

**Track 5 — Polish.**
Empty states, progressive-disclosure history timelines, "View as" preview, cross-links, activity feeds from real change data.

---

## 10. Component dependency graph

```
                 ┌─────────────────────────────────────────────┐
                 │  Phase A substrate (frozen — consume only)   │
                 │  providers · resolvers · authoring service   │
                 └───────────────┬─────────────────────────────┘
                                 │ contract types + resolved view models
        ┌────────────────────────┼──────────────────────────────┐
        ▼                        ▼                                ▼
 new primitives (§6)     WorkspaceShellLayout            existing settings prims
 ConfigHealthCard        SettingsEntityTabBar            KpiCard · StatusBadge
 EffectiveValueField     SettingsPageHeader              ConfigRuleAuthoringGroup
 EffectiveDateSaveBar                                    Drawer/Modal chrome
 CapacityMeter · etc.
        │                        │                                │
        └────────────┬───────────┴────────────────┬──────────────┘
                     ▼                             ▼
             LocationWorkspace             RoomWorkspace
             (Overview→Access tabs)        (Overview→Notes tabs)
                     │                             │
                     └──────────► LocationsPlatformRoute ◄────────┘
```

Dependency rules: tabs depend on primitives + resolvers; primitives depend only on contract types; **nothing in Phase B depends on raw DB rows** (only the server loaders touch Supabase, via the providers/bundle loader).

---

## 11. Testing strategy

| Layer | What | How |
|---|---|---|
| Translation layer (§A) | Every `warning.code` / `limitingFactor` / `status` maps to a plain-language string; no raw code can reach the screen | Snapshot test over the full code enum → message map; fail on unmapped code. |
| Resolver-binding | Cards render correct values/states for `resolved`/`incomplete`/`not_configured`/`conflicted`; `null` never becomes `0`; `staffedCapacity=null` renders "Not yet configured" | Component tests with fixtured `OperationalCapacityResolution`/`ResolvedRatio`. |
| Inheritance surfacing | "Uses Location Schedule" appears iff `appliedRules` scope=site; Override creates room-scoped rule; remove returns tag | Component + integration tests on `EffectiveValueField` + schedule tab. |
| Authoring / effective-dating | Save = version-create with date; future date = scheduled + Undo=void; A7 weaken-license refused inline | Integration tests hitting the API routes with a seeded bundle; assert `create*RuleVersion` calls + guard messages. |
| Navigation | Deep-link every tab/room route; tab preserved across location switch; breadcrumb correct | Route tests. |
| Accessibility | Tab bar, dialogs, health glyphs have labels; status conveyed beyond color | axe + manual. |
| Regression discipline | Web suite is baseline-red (~750); gate on `typecheck:build` + isolated-worktree regression diff, solo agents (git races). | Per repo memory. |
| Live verification | Drive the real flow (create a room, set capacity, see the resolver output) — not just unit tests | `/verify` once a workspace is drivable. |

**Do not** unit-test the Phase A math (frozen, already certified). Test the **skin**: translation, binding, inheritance surfacing, authoring interaction.

---

## 12. Recommended implementation phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **B0 Enablement** | Track 0 (re-root, timezone column, closures decision, new primitives) | Phase A symbols import in-tree; primitives unit-tested. |
| **B1 Frame + Overview** | Track 1 | Mockup screen 1 navigable and read-accurate over live resolvers; health card real. |
| **B2 Room Authoring** | Track 2 | Mockup screen 2 complete; capacity + ratio editing writes effective-dated versions; live ratio preview; A7 guard surfaced. |
| **B3 Schedule + Programs** | Track 3 | Location hours/closures authoring; program offering management; inheritance surfaced quietly. |
| **B4 Peripheral workspaces** | Track 4 | Tours/Placement/Communications/Access bound to existing substrates. |
| **B5 Polish + verify** | Track 5 | Empty states, history timelines, "View as", cross-links; `/verify` green; closeout. |

Each phase is independently shippable to staging and reviewable workspace-by-workspace.

---

## Appendix A — Translation Layer (business language ↔ engine, binding contract)

The single most important artifact for the "hide the engine" rule. Implementers map **every** engine token through this table; a raw token on screen is a bug.

| Engine concept | Operator sees |
|---|---|
| `status: "not_configured"` | "Not set up yet" |
| `status: "incomplete"` | "Needs a bit more setup" |
| `status: "conflicted"` | "Two settings disagree — review" |
| `limitingFactor: "licensed"` | "Limited by your license" |
| `limitingFactor: "ratio"` | "Limited by staffing ratios" |
| `limitingFactor: "physical"` | "Limited by room size" |
| `limitingFactor: "operational"` | "Limited by your set capacity" |
| `bindingCapacity` | "Capacity" (the number that actually applies) |
| `availableNow` | "Available now / Open seats" |
| `ratioConstrainedCapacity` | "Max children at current ratios" |
| `staffedCapacity = null` | "Staffing not configured yet" (Phase D) |
| `appliedRules` scope=`site` | "Comes from the Location" / "Uses Location schedule" |
| `appliedRules` scope=`room` | "This room overrides the Location" |
| effective-dated version write | "Save changes · Effective from [date]" |
| `retire` (close window) | "Stop using this / Remove override" |
| `void` (delete future version) | "Undo scheduled change" |
| `licensing_override_weakens_ceiling` | "A license limit can only make capacity smaller, not larger" |
| `occupancy_unknown` warning | "We don't have today's enrollment yet" |
| `unknown_age_group` warning | "Add an age range so we can apply the right ratio" |

## Appendix B — Provider consumption map (card → symbol)

| Surface | Symbol(s) consumed |
|---|---|
| Location list | `resolveSiteLocations` / `resolveLocationsForUser` |
| Location header timezone | `resolveLocationTimezone` |
| Capacity Summary | Σ `resolveOperationalCapacity` over rooms |
| Rooms card / list | `resolveRoomsForLocation` |
| Programs card / tab | `resolveProgramsForLocation`, `loadProgramVocabulary` |
| Operating Hours / Schedule | `loadChildcareConfigRuleBundle` + `resolveConfigRule` (operating windows) |
| Closures | schedule-rule exceptions from bundle |
| Room Capacity Overview | `resolveOperationalCapacity` |
| Room Staff Ratios | `resolveRatio` |
| Room Effective Schedule | operating-window resolution + `appliedRules` scope |
| Eligible Programs | `resolveRoomsForProgram` |
| Config Health (any) | `{status, warnings}` from all of the above |
| All authoring | `create*Rule` / `create*RuleVersion` / `retire*` / `void*` via `/api/admin/operational-config/*` |

## Appendix C — Open questions for the operator/product owner

1. **Closures**: exceptions-only (recommended MVP) or first-class closures with holiday sets + recurrence? (Track 0.3)
2. **"View as" preview**: does it emulate an operator persona, a family-facing view, or both?
3. **Staffing**: confirm it stays deferred in Phase B (no Lead/Assistant Teacher editing), matching the null `staffedCapacity`.
4. **Tours**: confirm the existing tours config store to bind to (re-home vs. new).
5. **Program-scoped defaults**: expose program-level capacity/ratio authoring, or keep all authoring at the room level and treat program scope as read-only inheritance display?
