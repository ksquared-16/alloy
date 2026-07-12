# Alloy Queue Record Doctrine

**Path:** `docs/system/queue-record-doctrine.md`  
**Status:** Locked — operational queue row contract (June 2026)  
**Related:** `docs/archive/2026-06-superseded-system/workspace-system.md` (queue truth boundary), `docs/system/configuration-system.md` (Layouts four-plane), `docs/system/drawer-operating-model-v1.md` (linked drawer dispatch), `docs/system/adminv2-runtime-performance-doctrine.md` (reveal gates — do not weaken for row UI)

## Purpose

A queue record is a **compressed operational surface**.

It is **not**:
- a table row
- a mini form
- a dashboard card collection
- a raw layout dump

It should answer:

1. Who is this?
2. What related records matter?
3. Where are they in the process?
4. What needs attention?
5. What should happen next?
6. What action can I take?

The drawer is the expanded version of the same record. The queue record is the compressed version.

---

## Source of truth

**`/adminV2/settings/layouts`** controls:
- columns
- fields
- widgets
- order
- labels
- display modes
- link targets
- repeated related records
- visibility

Saved on layout doc metadata as **`metadata.queue_record_layout`** (v3 scoped composer). Runtime resolves via **`resolveQueueRecordLayoutConfig`**.

The **renderer** controls:
- spacing
- truncation
- typography
- hover states
- responsive safety
- visual treatment for display modes

The renderer must **never** replace configured fields with derived fields unless explicitly configured.

**Example:**
- If configured field is `child.date_of_birth`, show DOB.
- If configured field is `child.age_band`, show age.
- Do **not** substitute age for DOB.

---

## Visual north star

Use the approved queue mock as the target.

The row should feel:
- premium
- calm
- horizontal
- scannable
- operational
- native to Alloy

It should **not** feel:
- like a spreadsheet
- like a form
- like nested cards
- like raw JSON/config output
- like generic CRM slop

---

## Layout anatomy

A standard queue record has:

1. **Identity column** — record title, primary related person/contact, muted contact details
2. **Related records column** — repeated related records; each item individually linkable when configured
3. **Status/context column** — current status, program/location/context fields
4. **Attention/next-step column** — attention, tasks, next action/guidance
5. **Date/event column** — tour date, appointment date, desired start date, other configured date fields
6. **Fixed action rail** — Work with BOS, Actions

The exact content comes from **`/settings/layouts`**. Default preset: **`defaultLeadQueueLayoutV3()`** in `web/lib/layout/queueRecordLayoutV3.ts`.

---

## Linked record doctrine

A linked field is its **own interaction surface**.

If a field is configured with a link target:

- hovering that field highlights **only** that field
- clicking that field opens **only** its configured drawer
- it must **not** trigger the queue record open
- icon and label should both be clickable
- if the ID cannot resolve, render as **non-linked muted text**

This applies equally to person, child, opportunity, related record, and future entity links.

**Do not** make person links special. **Do not** make child links special. Use **one** linked-field component.

---

## Row open doctrine

Clicking **non-linked row space** opens the primary record drawer.

For enrollment queues: row background / non-linked content opens the **opportunity** drawer.

But:
- linked fields open their linked drawer
- Actions opens menu
- Work with BOS opens BOS
- widgets run their own behavior
- collapse toggles collapse

Never rely on “one giant card click plus fragile exceptions” as the core interaction model. Row open is **content-level delegation** with explicit interactive opt-out (`data-queue-row-interactive`, `data-layout-runtime-adornment-link`).

---

## Widget doctrine

Widgets inside queue rows must be **compact and native**. Queue row widgets are summaries, not full panels.

### Tasks

**Good:** `2 open tasks` · first task title · `No open tasks`  
**Bad:** giant task card, empty bordered task panel, raw widget label

### Attention

**Good:** amber icon + short reason (`_attention_reason_label`)  
**Bad:** full drawer attention card, unformatted plain text, unrelated warning colors

### Status

Status renders according to configured **display mode** from `/settings/layouts`:

| `display` | Runtime treatment |
|-----------|-------------------|
| `pill` | Rounded pill (`queue-record-field--pill`) |
| `badge` | Compact rectangular badge (`queue-record-field--badge`) |
| `text` | Plain text surface — **not** coerced to pill |

Normalization may default missing status display to `pill`; it must **never** override an explicit saved `display`.

---

## Date doctrine

All dates in queue row **fields** use the **compact display format** from `typography-and-presentation-doctrine.md`:

**`Jan 15`** (same calendar year) · **`Mar 15, 2024`** (when year is necessary)

If time exists on the source value:

**`May 20 · 2:30 PM`**

Configured field labels prefix the value: **`Created Jan 15`**, **`Tour Jun 22`**, **`Start Aug 1`**.

No queue row should show **`YYYY-MM-DD`** or **`MM-DD-YYYY`** as read-only display unless the user specifically configures raw value display.

Formatter: **`formatQueueRecordDateDisplay`** (`web/lib/presentation/presentationDateFormat.ts`, re-exported from `web/lib/adminFormatters.ts`); field-key detection: **`isQueueRecordDateFieldKey`** (`web/lib/layout/runtime/queueRecordScopedResolve.ts`).

**Task mini-card due dates** use task due doctrine: **`formatTaskDueDate`** / **`formatQueueTaskDueMiniCard`** (weekday omitted in mini-card). Full due remains on `title` / popover via **`formatQueueTaskDueShort`**.

**Presentation doctrine (typography + dates):** **`docs/system/typography-and-presentation-doctrine.md`**

---

## Typography

Use Alloy hierarchy:

| Element | Treatment |
|---------|-----------|
| Record title | bold, midnight |
| Linked fields | midnight/slate text; muted icon at rest (work-unit: **neutral** icon — see **`work-unit-layout-doctrine.md`**) |
| Linked hover | `rgba(49,57,77,0.06)` background; `#1B1B27` text — **not** green/pine flood |
| Primary contact | secondary tier — smaller than household, stronger than phone/email |
| Secondary details | muted slate |
| Status pill/badge | compact, weight 650, ellipsis inside column |
| Widgets | compact, readable, not oversized |

Typography tiers 1–6: **`docs/system/typography-and-presentation-doctrine.md`**

Avoid random font sizes and weights.

---

## Color

Use restrained Alloy colors:

| Token role | Use |
|------------|-----|
| Midnight / navy | structure and primary text |
| Bend Pine | BOS accent, explicit row actions — **not** default linked-field or work-unit metadata icons |
| Muted slate | secondary text |
| Amber | actual attention only |
| Red | severe/blocking only |

**Do not use:** loud green everywhere, blue plugin-looking buttons, rainbow statuses, heavy teal outlines on every row.

### Work-unit queue override (frozen V3 — June 2026)

On **`[data-ws-surface="work_unit"].adminv2-ws-wu-v2`**, metadata icons use **neutral** sizing/color only (household 16px; person/child/email/phone 14px). Pine is reserved for BOS and row action affordances. Full rules: **`work-unit-layout-doctrine.md`** § Queue row icon doctrine.

Card row hover must **not** activate when hovering linked fields or fixed controls (`:not(:has(...))` on operational row card).

---

## Children / related records

Related records should feel native to the row.

For repeated related records:

- show up to configured **`maxItems`** (default **5**)
- then show **`+N more`**
- each item is an individual link when configured
- child name, DOB, age, program, status, etc. are **separate configurable fields**
- do not merge DOB/age/name unless configured inline in layout

---

## Actions

Actions are **fixed row controls**, not normal layout fields.

Default:
- Work with BOS (Bend Pine — not blue)
- Actions menu (lifecycle/work-unit configured actions)

---

## Do

- Keep rows horizontal
- Preserve layout configuration
- Use compact native widgets
- Use one linked-field component
- Use one date formatter
- Clamp long text
- Show overflow count
- Keep actions fixed right
- Make hover states precise

---

## Don't

- Do not stack the entire row vertically
- Do not make the whole card one giant click target with fragile exceptions
- Do not render widgets as giant cards inside queue rows
- Do not substitute derived fields for configured fields
- Do not let children/person links use different systems
- Do not show fake links when IDs are missing
- Do not let row hover trigger from linked-field hover
- Do not ignore `/settings/layouts`
- Do not declare success from tests only when the browser does not match the doctrine

---

## Completion standard

A queue row is complete only when:

- browser view matches the approved mock direction
- `/settings/layouts` controls content
- linked fields open the correct drawers
- non-linked row area opens the opportunity drawer
- widgets render real compact summaries
- status/date display modes are respected
- row remains compact, premium, and scannable

---

## Shared renderer inheritance (required)

**All queue record surfaces must route through the shared queue record renderer unless explicitly exempted with a documented reason.**

Default production path:

1. **`resolveQueueRecordLayoutConfig`** — saved `metadata.queue_record_layout` or lifecycle default (`defaultLeadQueueLayoutV3` / `defaultWaitlistQueueLayoutV3`)
2. **`OperationalQueueRecordRow`** — row shell + action rail
3. **`QueueRecordScopedColumn`** — scoped columns / repeated blocks
4. **`QueueRecordFieldRenderer`** — fields, status display modes, linked fields, widgets

**Do not** add parallel queue row renderers (`QueueRecordConfigColumn`, bespoke status chips, per-queue link components) without updating this doc with an exemption.

### Waitlist

Waitlist work-unit rows use the **same** renderer stack:

| Concern | Waitlist path |
|---------|----------------|
| Layout resolve | `resolveQueueRecordLayoutConfig` with `isWaitlistQueueDoc` → `defaultWaitlistQueueLayoutV3()` when unsaved |
| Production entry | `QueueBlock` → `LayoutRuntimeQueueRowView` (`variant="waitlist"`) |
| CRM fallback | `CrmCompactQueuePreview` → `WorkUnitOperationalQueueRow` → `OperationalQueueRecordRow` |
| Field / link / widget | Same `QueueRecordFieldRenderer`, `openQueueRecordLinkedDrawer`, `QueueRecordTasksWidget`, `QueueRecordAttentionWidget` |
| Action rail | Same `QueueRowActionRail` (Work with BOS + Actions) |

Waitlist-specific **placement** UI (candidate order controls, bucket chips) sits **outside** the queue record field grid in `QueueBlock` — not a substitute for `queue_record_layout`.

**Out of scope (intentional):** `WaitlistCandidateCardProofRenderer` / `placement_candidate` layout preview in `/settings/layouts` — proof/preview surface for a specialized card template, not the operational work-unit row.

---

## Implementation reference (June 2026)

| Concern | Location |
|---------|----------|
| Layout config v3 | `web/lib/layout/queueRecordLayoutV3.ts` |
| Config resolve + normalize | `web/lib/layout/runtime/resolveQueueRecordLayoutConfig.ts`, `normalizeQueueRecordLayoutConfig.ts` |
| Row shell | `web/components/layout/OperationalQueueRecordRow.tsx` |
| Column composer | `web/components/layout/QueueRecordScopedColumn.tsx` |
| **Unified field renderer** | `web/components/layout/QueueRecordFieldRenderer.tsx` |
| Linked drawer dispatch | `web/lib/layout/runtime/openQueueRecordLinkedDrawer.ts` → `dispatchLinkedDrawerOpen.ts` |
| Row open click guards | `web/lib/layout/runtime/queueRowOpenClick.ts` |
| Preview → runtime record | `web/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview.ts` |
| Queue enrichment (tasks, attention) | `web/lib/queues/QueueService.ts`, `queueRowLayoutRuntimeEnrichment.ts` |
| Production entry | `web/components/layout/LayoutRuntimeQueueRowView.tsx` → `QueueBlock.tsx` |
| Task due mini-card format | `formatQueueTaskDueMiniCard` in `LayoutRuntimeTaskDetailPopover.tsx` |
| Row styles | `web/app/adminV2/components/workspace/workspace.css` (`.queue-record-field`, operational row card) |

**Tests (contracts, not browser substitute):** `web/tests/layout/queueRecordLayoutRuntimeFidelity.test.ts`, `queueRowClickIsolation.test.ts`, `operationalQueueRecordRow.test.tsx`, `normalizeQueueRecordLayoutConfig.test.ts`, `splitQueuePreviewChildPrimaryLabel.test.ts`, `buildOpportunityQueueRowRecordFromPreview.test.ts`, `workUnitQueueRowBandLayout.test.tsx`, `resolveQueueRecordStatusPillTone.test.ts`
