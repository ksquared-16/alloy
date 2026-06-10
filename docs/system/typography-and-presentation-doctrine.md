# Alloy Typography and Presentation Doctrine

**Path:** `docs/system/typography-and-presentation-doctrine.md`  
**Status:** Locked — platform presentation contract (June 2026)  
**Related:** `docs/system/queue-record-doctrine.md`, `docs/system/drawer-operating-model-v1.md`, `docs/system/configuration-system.md` (Layouts four-plane), `web/lib/presentation/*`

## Purpose

Drawer doctrine and Queue Record doctrine define **what** surfaces show and **how** they behave. This doctrine defines **how information looks** across those surfaces so operators instantly understand:

- what is important
- what is supporting
- what is empty
- what is actionable

This is a **presentation sprint**, not an architecture sprint. It does **not** change:

- runtime reveal gates
- layout composition ownership
- drawer dispatch
- queue record renderer stack

---

## Typography hierarchy (six tiers)

The platform uses exactly six text tiers. **Values always visually win over labels.**

| Tier | Role | Examples | Token import |
|------|------|----------|--------------|
| **1 — Record title** | Largest, highest contrast | Lead — Hayes, Chris Hayes, Harper Hayes | `PRESENTATION_RECORD_TITLE`, `PRESENTATION_RECORD_TITLE_COMPACT` |
| **2 — Section header** | Strong, consistent section bands | Household, Enrollment, Family, Program & Enrollment | `PRESENTATION_SECTION_HEADER`, `PRESENTATION_SECTION_EYEBROW` |
| **3 — Data value** | Business data — **not muted** | Claire Hayes, North Campus, Guardian, Contact Attempted | `PRESENTATION_DATA_VALUE`, `PRESENTATION_DATA_VALUE_COMPACT` |
| **4 — Label** | Supports values; uppercase field labels | LOCATION, EMAIL, STATUS, DOB | `PRESENTATION_LABEL`, `PRESENTATION_LABEL_INLINE` |
| **5 — Supporting** | Readable secondary context | 2 adults • 2 siblings, Managed on Family Lead | `PRESENTATION_SUPPORTING` |
| **6 — Empty state** | Most muted treatment | No documents yet, No recent activity | `PRESENTATION_EMPTY_STATE` |

**Canonical module:** `web/lib/presentation/presentationTypography.ts`

**Operational / forms surfaces** may also import `web/lib/operational/ui/operationalVisualTokens.ts` — same hierarchy intent, different surface rhythm.

### Label / value rules

1. Labels are **smaller, lighter, uppercase** when shown above values.
2. Values use **medium–semibold weight** and **≥90% midnight opacity** on drawer fields.
3. Placeholder dashes (`—`) use **tier 6**, not tier 3.
4. Status pills/badges are **data values** inside compact chrome — not label-tier text.
5. Do **not** use ad hoc `text-[8px]`, `text-alloy-midnight/30`, or hex colors on drawer/queue runtime surfaces.

---

## Date formatting doctrine

**Canonical module:** `web/lib/presentation/presentationDateFormat.ts`

### Display vs input

| Context | Format | Example | Formatter |
|---------|--------|---------|-----------|
| **General display** | Short month + day + year | Jan 13, 2024 | `formatDisplayDate` |
| **Drawer / summary datetime** | Display date + time | Jan 13, 2024 · 2:30 PM | `formatDisplayDateTime` |
| **Task due** | Weekday + compact date + time | Tue, Jan 1 · 9 AM | `formatTaskDueDate` |
| **Activity timestamp** | Relative day + time | Today • 9:12 AM, Yesterday • 4:35 PM, Jun 15, 2026 • 2:15 PM | `formatActivityTimestamp` |
| **Queue row date column** | Compact month-day; year when needed | Jan 15, Jun 22, 2026 | `formatQueueRowDateCompact` / `formatQueueRecordDateDisplay` |
| **Editable inputs** | MM-DD-YYYY or picker | 01-13-2024 | Input components — **not** display formatters |
| **Audit trail parity** | MM/DD/YYYY stable UTC | 01/13/2024 | `formatDateUtcAudit` — server/compare only |

### Do not show on operator surfaces

- `2024-01-13` (ISO)
- `01-13-2024` / `03-15-2024` as **read-only display** (input fields excepted)

Queue row fields with configured labels render as **`{Label} {compact date}`** — e.g. `Created Jan 15`, `Tour Jun 22`, `Start Aug 1`. Labels come from layout config; date shape comes from the formatter.

---

## Queue presentation rules

Inherits row anatomy from **`queue-record-doctrine.md`**. Typography additions:

| Element | Tier | Notes |
|---------|------|-------|
| Record title (`emphasis: title`) | 1 | 14px / 700 / midnight |
| Child name, status text, date values | 3 | Was drifting to tier 5 muted — corrected |
| Primary contact | 3 compact | Stronger than phone/email |
| Phone / email | 5 | Secondary channel |
| Stage / group count | 4–5 | Caption uppercase |
| Location / work summary / attention reason | 5 | Context meta |
| Inline date label (`Created`, `Tour`) | 4 | Lighter than inline value |
| Empty field / no tasks | 6 | Most muted |
| Task due mini-card | Task due format | Weekday omitted in mini-card only |

**Renderer-owned CSS:** `web/app/adminV2/components/workspace/workspace.css` (`.queue-record-field--typography-*`)  
**Tier mapping:** `web/lib/layout/runtime/queueRecordFieldTypography.ts`

### Queue hierarchy audit (June 2026)

| Finding | Resolution |
|---------|------------|
| Date fields mapped to `secondary` (62% opacity) | Remapped to `primary` / stronger date CSS |
| MM-DD-YYYY readout felt spreadsheet-like | Switched to compact month display |
| Inline label/value pairs lacked contrast separation | Added `.queue-record-field__inline-label` / `__inline-value` tiers |
| Task due used same format as generic dates | Dedicated `formatTaskDueDate` |
| Activity notes used MM/DD datetime | Switched to `formatActivityTimestamp` |

---

## Drawer presentation rules

Lead, Person, and Child drawers share composition chrome via:

- `web/lib/layout/runtime/drawerOverviewCompositionStandard.ts`
- `web/components/layout/DrawerOverviewPanelShell.tsx`
- Entity `*OverviewRuntimeComposition` modules

### White canvas rule (locked)

All drawer overview compositions (Lead, Person, Child) use a **pure white canvas**. Depth comes from section panels — not a gray or blue page fill.

| Token / surface | Value |
|-----------------|--------|
| `LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS` | `bg-white` |
| `DRAWER_OVERVIEW_CANVAS_CLASS` | white canvas + spacing |
| Modal scroll body (`cleaning-v2`) | `#ffffff` — no `#f6f8fc` body veil |
| Panel surfaces | `bg-white` with pine left accent |

**Outer drawer shell:** uniform neutral rim (`LAYOUT_RUNTIME_DRAWER_OUTER_BORDER` = `rgba(39, 63, 82, 0.12)`) + soft shadow (`LAYOUT_RUNTIME_DRAWER_OUTER_SHADOW`). No bluish-gray modal outline or tinted left-rail rim on entity drawers.

Emerald/juniper accents (header gradients, icon badges, status pills) should read clearly against white.

### Section chrome rule (locked)

Every major overview section uses **`DrawerOverviewPanelShell`** — one visual system:

| Element | Treatment |
|---------|-----------|
| **Panel shell** | Pine left accent (`border-l-alloy-juniper/70`), white surface, subtle shadow |
| **Header band** | Soft emerald gradient (`from-emerald-50/70`), icon badge, uppercase eyebrow, semibold title |
| **Centerpiece sections** | Enrollment / connected children / program — stronger radius + shadow |
| **Card rhythm** | Rounded inner cards, stone border, light shadow, `gap-2` stack |
| **Right rail** | Same panel shell as main grid (Activity, Documents, Notes) |

No flat sections. No drawer-type-specific chrome forks unless documented here.

### Empty state rule (locked)

> **Empty ≠ disabled.** Active sections keep full chrome when empty.

| Rule | Implementation |
|------|----------------|
| Section chrome | Header, icon badge, border, accent, shadow, and title stay at full strength |
| Empty body only | `DrawerOverviewEmptyState` — dashed inner panel, tier-6 message + soft hint |
| Summary strip widgets | Tasks, Tour/Event, Attention use full-strength card chrome; body copy is muted only |
| Right-rail visibility | Activity, Notes, Documents render in composition shell when empty (`DRAWER_OVERVIEW_PREMIUM_EMPTY_SECTIONS`) |
| Copy examples | Tasks: "No open tasks" · Tour/Event: "No recent notes or events" · Activity: "No activity yet" |
| Unavailable modules | Schedule/Attendance may hide or mark unavailable — not the same as empty active sections |

### Enrollment hierarchy rule (locked)

Child enrollment rows use a **four-line read hierarchy** (not a database export):

| Line | Content | Tier |
|------|---------|------|
| 1 | Child name (linked when configured) | 3 compact |
| 2 | Born {date} • {age} | 5 supporting |
| 3 | Start {date} • {location} | 5 supporting |
| 4 | Program • Schedule • Classroom • Status | 3 compact values; status may also appear as pill |

Primary information wins: name, age, start date, location. Secondary fields share line 4.

**Implementation:** `LeadEnrollmentCardMetaLines`, `buildLeadEnrollmentCardMetaPresentation`.

### Relationship navigation rule (locked)

Relationship cards preserve drawer navigation affordances:

| Direction | Affordance |
|-----------|------------|
| Opportunity → Person | Profile avatar button + optional name link on household/contact cards |
| Person → Child | Child avatar button + optional name link on connected-children / enrollment cards |
| Child → Person | Profile avatar button + optional name link on family member cards |
| Child → Child (sibling) | Child avatar button + optional name link |

**Drawer vs queue link doctrine:**

| Surface | Primary link affordance |
|---------|------------------------|
| **Drawer relationship cards** | Profile/avatar button (`DrawerHouseholdPersonLinkAvatar`, `DrawerHouseholdChildLinkAvatar`) wrapping `PersonDrawerIdentityAvatar` |
| **Queue record rows** | Compact link icons acceptable — dense operational previews |

- Avatar is the **primary** click target in drawers; name may also link when `person_id` / `child_id` is present.
- Do **not** render queue-style adornment link icons on drawer relationship name links when an avatar is shown (`adornment={null}` on name `LayoutRuntime*LinkSurface`).
- Contacts without a valid id render a static, non-clickable avatar.
- Lists are layout-driven (`household_contacts` widget gates relationship list presence).

### Avatar / profile image readiness (locked)

Shared component: `PersonDrawerIdentityAvatar`.

| Source | Priority |
|--------|----------|
| `photoUrl` / `imageUrl` | Render circular photo when present |
| Initials fallback | Default until upload exists |
| Entity icon fallback | Reserved for future entity-type badges |

Future profile upload should pass `image_url` into the same avatar slot — no parallel avatar implementations in drawer relationship cards.

### Drawer overview presentation standard (June 2026)

| Element | Treatment |
|---------|-----------|
| **Overview canvas** | White (`LAYOUT_RUNTIME_DRAWER_OVERVIEW_CANVAS` / `DRAWER_OVERVIEW_CANVAS_CLASS`) — depth from panels, not gray fill |
| **Section panel** | Pine left accent (`border-l-alloy-juniper/70`), white surface, subtle shadow |
| **Section header** | Soft pine-tinted gradient band (`from-emerald-50/70`), icon badge, uppercase eyebrow, semibold title |
| **Centerpiece sections** | Enrollment / connected children / program — slightly stronger radius and shadow |
| **Card rhythm** | Rounded inner cards with stone border + light shadow; consistent `gap-2` stack |
| **Enrollment metadata** | Four-line hierarchy — name, birth/age, start/location, program details |
| **Empty states** | Tier 6 tokens only — never confused with business data |
| **Right rail** | Same panel shell as main grid (Activity, Documents, Notes) |

**Do not** use ad hoc opacity classes on drawer overview surfaces — import from `web/lib/presentation/presentationTypography.ts`.

### Empty section presentation (June 2026)

> Empty sections keep full section chrome. Empty content is muted, but the section itself should never look disabled unless the feature is truly unavailable.

| Rule | Implementation |
|------|----------------|
| Active empty sections | Keep panel header, icon badge, border, accent, shadow, and title at full strength |
| Empty body only | Use `DrawerOverviewEmptyState` — dashed inner panel, tier-6 message + soft hint |
| Right-rail visibility | Activity, Notes, Documents render in composition shell even when empty (`DRAWER_OVERVIEW_PREMIUM_EMPTY_SECTIONS`) |
| Summary strip cards | `LeadOperatingSummaryCard` never reduces card/header opacity when empty — only inner copy is muted |
| Unavailable modules | Schedule/Attendance and future modules may hide or mark unavailable — not the same treatment as empty active sections |

**Related:** `docs/system/drawer-operating-model-v1.md` (behavior); this doc (presentation).

### Drawer hierarchy audit (June 2026)

| Surface | Before | After |
|---------|--------|-------|
| Layout runtime field labels | `text-alloy-midnight/50` at 10px | `PRESENTATION_LABEL` (tier 4) |
| Layout runtime field values | `text-sm` + `#18273A` inline | `PRESENTATION_DATA_VALUE` (tier 3, 92% opacity) |
| Placeholder values | Same color as empty copy | `PRESENTATION_VALUE_PLACEHOLDER` (tier 6) |
| Household contact names | Ad hoc 13px semibold | `PRESENTATION_DATA_VALUE_COMPACT` |
| Contact role / meta | Mixed /50, /42 | `PRESENTATION_SUPPORTING` tiers |
| Activity preview labels | /45 uppercase 10px | `PRESENTATION_LABEL` |
| Activity preview timestamps | Generic date string | `formatActivityTimestamp` |
| Activity preview empty | /40 11px | `PRESENTATION_EMPTY_STATE_SOFT` |
| Person children empty | /40 | Aligned tier 6 |
| Lead / Person / Child panel eyebrows | Mixed 11px /62 | Standardized via shared panel shell |

**Intentionally unchanged:** drawer header title rails (entity-specific command headers), runtime reveal gates, layout section keys.

---

## Summary widgets and work-unit layouts

Summary strip widgets (`LayoutRuntimePlanView` summary row) use:

- Tier 2 eyebrow in widget header
- Tier 3 values in widget body
- Tier 6 minimized empty state (`LAYOUT_RUNTIME_SUMMARY_WIDGET_MINIMIZED`)

Work-unit record layouts inherit queue typography tokens through the shared queue record renderer — no parallel typography system.

---

## Layout builder alignment (`/settings/layouts`)

**Current state (June 2026):** Layout V2 docs do **not** expose arbitrary font size, color, or weight. Admins configure:

- field placement
- labels (copy)
- `renderHint` (text, status, date, …)
- queue `display` mode (pill, badge, text, muted, date)
- `emphasis: title` for record title fields

**Renderer owns:** tier mapping, color, size, weight, opacity.

**Preferred direction (no builder redesign in this sprint):** When builder gains presentation controls, expose **semantic roles only**:

- Title
- Header
- Label
- Value
- Helper text
- Empty state

Do **not** add per-field font size or hex color pickers — that guarantees hierarchy drift.

**Drift risk today:** Queue `display: muted` forces tier 5. Use sparingly for true context-only fields, not business data.

---

## Future module guidance

Any new operational surface (action workspace cards, BOS summaries, global search hits) should:

1. Import typography from `web/lib/presentation/presentationTypography.ts`
2. Import dates from `web/lib/presentation/presentationDateFormat.ts`
3. Map UI elements to tiers 1–6 before adding new CSS
4. Never introduce a third date format for the same context
5. Document exemptions in this file if a surface cannot share the stack

---

## Implementation reference

| Concern | Location |
|---------|----------|
| Typography tokens | `web/lib/presentation/presentationTypography.ts` |
| Date formatters | `web/lib/presentation/presentationDateFormat.ts` |
| Admin formatter re-exports | `web/lib/adminFormatters.ts` |
| Layout runtime operator dates | `web/lib/layout/runtime/formatLayoutRuntimeOperatorDate.ts` |
| Queue field date resolve | `web/lib/layout/runtime/queueRecordScopedResolve.ts` |
| Queue typography tier map | `web/lib/layout/runtime/queueRecordFieldTypography.ts` |
| Drawer field renderer | `web/components/layout/LayoutRuntimePlanView.tsx` |
| Drawer overview panel shell | `web/components/layout/DrawerOverviewPanelShell.tsx` |
| Drawer household profile | `web/components/layout/DrawerHouseholdProfileSection.tsx` |
| Drawer person/child link avatars | `web/components/layout/DrawerHouseholdPersonLinkAvatar.tsx`, `DrawerHouseholdChildLinkAvatar.tsx` |
| Shared drawer identity avatar | `web/components/admin/entity/PersonDrawerIdentityAvatar.tsx` |
| Drawer outer shell tokens | `LAYOUT_RUNTIME_DRAWER_OUTER_BORDER`, `LAYOUT_RUNTIME_DRAWER_OUTER_SHADOW` in `layoutRuntimeSurfaceStyles.ts` |
| Drawer premium empty state | `web/components/layout/DrawerOverviewEmptyState.tsx` |
| Drawer overview tokens | `web/lib/layout/runtime/drawerOverviewCompositionStandard.ts` |
| Drawer section icons | `web/lib/layout/runtime/drawerOverviewSectionPresentation.ts` |
| Enrollment card metadata | `web/components/layout/lead/LeadEnrollmentCardMetaLines.tsx` |
| Queue row CSS | `web/app/adminV2/components/workspace/workspace.css` |
| Activity timestamps | `web/lib/admin/activityTimelineFormat.ts` |
| Task due (queue mini-card) | `web/components/layout/queueRecord/LayoutRuntimeTaskDetailPopover.tsx` |

**Tests:** `web/tests/presentation/presentationTypography.test.ts`, `web/tests/presentation/presentationDateFormat.test.ts`, `web/tests/layout/drawerOverviewCompositionStandard.test.ts`, `web/tests/admin/formatQueueRecordDateDisplay.test.ts`, `web/tests/admin/activityTimelineFormat.test.ts`

---

## Before / after examples

### Display dates

| Before | After |
|--------|-------|
| `03-15-2024` | `Mar 15, 2024` |
| `05-20-2026 · 2:30 PM` | `May 20 · 2:30 PM` |

### Task due

| Before | After |
|--------|-------|
| `05-20-2026 2:30 PM` | `Tue, May 20 · 2:30 PM` |

### Activity

| Before | After |
|--------|-------|
| `06/15/2026 2:12 PM` | `Today • 2:12 PM` (when same calendar day) |

### Drawer field value

| Before | After |
|--------|-------|
| Label 50% opacity, value regular 100% `#18273A` — often similar weight | Label 46% uppercase; value 92% **medium** — clear win |

### Queue date column

| Before | After |
|--------|-------|
| `Created: 03-15-2024` | `Created Mar 15` (same year) / `Created Mar 15, 2024` (other year) |

---

## Do

- Import shared presentation tokens
- Keep values darker than labels
- Use context-appropriate date formatters
- Align empty states to tier 6
- Update this doc when adding a new surface category

## Don't

- Do not use ISO or MM-DD-YYYY on read-only operator surfaces
- Do not weaken runtime reveal gates for typography work
- Do not add per-layout font/color controls without semantic roles
- Do not create parallel queue or drawer typography systems
- Do not treat `—` placeholders as business data
