# Work Unit Queue UX Redesign Proposal

**Path:** `docs/sprints/06_2026/work_unit_queue_ux_redesign_proposal.md`  
**Status:** WU-UX V2 shipped (June 2026) — lifecycle-aware band framework  
**Prior:** Proposal approved; WU-UX-1/2 compact operational record baseline shipped  
**Related:** `docs/audits/work_unit_runtime_cutover_audit.md`, Phase D-A row bands in `QueueBlock.tsx`

---

## Problem

Work Unit queue rows still read as **independent columns** rather than a single operational record. Operators scan households, children, and next actions as separate fields instead of one compact card.

**Constraints (non-negotiable):**
- Rows must stay **dense** — not large vertical cards
- Support 1–5 children per household
- Future configurable queue fields
- Icons remain **left of names** (Person/Child drawer)
- No queue runtime / reveal gate changes in this pass

---

## Target: compact operational card

Each row is a **single bordered band** with internal horizontal sections separated by subtle rules — not column gutters.

```
┌─────────────────────────────────────────────────────────────┐
│ [STATUS PILL]  Household Name                    Location   │
│ ─────────────────────────────────────────────────────────── │
│ 👤  Parent Name          │  Program (lane hint if needed)   │
│ 👶  Child Name           │  Program                        │
│ 👶  Child Name 2         │  Program                        │
│ ─────────────────────────────────────────────────────────── │
│ Desired Start: Mar 2026  │  Tour: Tue 3/12 10am            │
│ ─────────────────────────────────────────────────────────── │
│ [Assign] [Call] [···]                                        │
└─────────────────────────────────────────────────────────────┘
```

### Visual hierarchy

| Zone | Content | Typography |
|------|---------|------------|
| **Header band** | Status pill + household/title + location | Status: pill; title: 13px semibold; location: 12px muted |
| **People band** | Parent row + 1–5 child rows | Icon 14px left; name 12px medium; program 11px muted after `·` or `\|` |
| **Facts band** | Configurable fact chips (desired start, tour, etc.) | Label 10px caps tracking; value 12px |
| **Actions band** | Row inline actions | Existing action chip density |

### Spacing & chrome

- Outer: `border border-alloy-stone/15 rounded-[5px]` (matches Phase D-A row band)
- Inner dividers: `border-t border-alloy-stone/10` — not full card shadow stacks
- Row hover: `hover:border-alloy-stone/25 hover:bg-alloy-stone/[0.03]`
- Vertical padding: **6–8px** per band (not 16px+ card padding)

---

## WU-UX V2 — Lifecycle-aware band framework (shipped)

### Problem addressed

V1 compact operational record improved household/people scan but **dropped needs-attention operational context** and **waitlist placement chips** when rows used the operational-record path.

### Band contract

Presentation resolver: `web/lib/ui-v2/workUnitQueueRowPresentation.ts`

| Band | Purpose |
|------|---------|
| **header** | Status + household + location |
| **attention** | Why this record — urgency, operational read, priority explanation, next step |
| **lifecycle** | Work-unit-specific context (waitlist placement, enrollment hints) |
| **people** | Child-primary hierarchy + compact parent contact |
| **facts** | Configurable scalar fields (timing, meta) |
| **actions** | Host-rendered row actions (unchanged) |

Lifecycle keys: `enrollment` | `waitlist` | `tour_scheduling` | `enrolled` | `generic`

Band components: `web/app/adminV2/components/workspace/blocks/QueueRowOperationalBands.tsx`

### Enrollment vs waitlist

- **Enrollment:** attention band + children-first people band + compact parent block below children
- **Waitlist:** lifecycle band restores position `#N`, priority rule chip, reason line, candidate meta chips

Future work units plug lifecycle content into the **lifecycle band** without rewriting `QueueBlock`.

### Visual QA (capture on staging)

- Enrollment pipeline (needs-attention row with operational read)
- Waitlist lane (position + priority chips)
- 1 / 3 / 5 child households

Reference: `web/public/dev/work-unit-queue-operational-record-compact.png` (V1 baseline)

---

## WU-UX V3 — Dense inline header (shipped)

### Change

Moved operational context into the **header row** to cut row height ~25–30%.

**Enrollment header:** `Household | Status | Urgent: summary | Location`  
**Waitlist header:** `Family | Waitlisted | #3 Infant Priority | Location` + one-line priority reason subline

Attention/lifecycle **bands expand only** when content exceeds inline limits or manual waitlist controls require it.

Presentation: `web/lib/ui-v2/workUnitQueueRowHeaderPresentation.ts`  
Header component: `QueueRowCompactOperationalHeader`

---

## Before / after

### Before (current)

- CRM compact columns: `Name | Program | …` as peer grid cells
- Related-record bands exist for person/child but **header facts and people share no frame**
- Status and household title may sit in separate column cells

### After (proposed)

- **One frame per queue row** with stacked micro-bands
- Column config maps to **bands**, not grid columns:
  - `primary_contact`, `child_name` → people band
  - `location`, `status` → header band
  - `desired_start`, `tour` → facts band
- Grid becomes **band stack + optional 2-col within band** for density

**Mockup asset:** extend `web/public/dev/work-unit-queue-related-record-before-after.png` with full-row compact card variant (design pass — not yet generated in repo).

---

## Configurable fields (future-proof)

Introduce band registry in queue row presentation (no QueueService change):

```typescript
type WorkUnitQueueRowBand =
  | "header"      // status, title, location
  | "people"      // parent + children (icon-left rows)
  | "facts"       // configurable scalar fields
  | "actions";    // inline row actions

type WorkUnitQueueRowBandField = {
  key: string;
  band: WorkUnitQueueRowBand;
  order: number;
  /** When set, render as label: value chip in facts band */
  label?: string;
};
```

Map from `queue_definition.ui.row_preview` / CRM compact column keys → bands. Enrollment default:

| Field key | Band |
|-----------|------|
| `status` | header |
| `primary_contact` / household title | header + people |
| `child_name` | people |
| `location` | header |
| `program` | people (suffix) |
| `desired_start`, `tour` | facts |

---

## Implementation plan (after approval)

| Phase | Scope | Files | Runtime risk |
|-------|-------|-------|--------------|
| **WU-UX-1** | Band types + enrollment default map | `crmQueueRowPreviewPresentation.ts`, `workspace-types.ts` | None |
| **WU-UX-2** | `CrmFactRelatedRecordRows` → band stack layout | `QueueBlock.tsx`, `workspace.css` | **UI only** — no reveal gates |
| **WU-UX-3** | Header band (status + title + location) | Same | UI only |
| **WU-UX-4** | Facts band from configurable fields | Same + column registry | UI only |
| **WU-UX-5** | Visual QA 1/3/5 child households | Tests + dev mockup PNG | None |

**Estimated diff:** ~200–350 lines in `QueueBlock.tsx` + CSS; no page.tsx orchestration.

### Do not change

- `fetchQueueItems`, reveal gates, pill switch logic
- Drawer open / VM paths
- Row click → Opportunity behavior

---

## Recommendation

**Approve WU-UX-1 + WU-UX-2 first** — band stack with people + existing related-record icons delivers most scanability gain without facts band complexity.

Defer facts band until Settings exposes configurable queue row fields.

**Sequence with runtime:** Complete WU-VM-3 (first paint hard cutover) **before** UX pass so layout shifts are not mistaken for runtime regressions.

---

## Test plan (when implemented)

- `workUnitQueueRowRelatedDrawerIcons.test.tsx` — icons still left of names
- New: `workUnitQueueRowBandLayout.test.tsx` — band order, 1 vs 3 child rows, actions band present
- Visual: enrollment pipeline screenshot compare against mockup

---

## V3.2 — Final compact operational row hierarchy (implemented)

**Problem:** V3.1 still used a separate supplement band for normal attention rows; operational wording was redundant; children rendered before parent.

### Presentation rules

1. **Two-line header zone** — no separate attention panel for normal rows.
   - Line 1: `Household | Status | Attention/ranking | Location`
   - Line 2: `Reason detail · Next step: …` (when supplemental content exists)
2. **Concise operator wording** — `Urgent: overdue follow-up` not full catalog headline; strip internal fragments (`breached vs goal`, Preview labels).
3. **Parent above children** — contact row first, then child rows, then facts.
4. **Exceptional expand only** — separate supplement band when multiple warnings or subline exceeds max length.
5. **Waitlist** — same family-first header; child drawer icons when `personId` present.

### Target rows

**Enrollment**

```
Mitchell household | Contact Attempted | Urgent: overdue follow-up | South Campus
Commitment date missed · Next step: Call family within one business day to confirm interest.
```

**Waitlist**

```
Williams Family | Waitlisted | #1 Standard Family | North Campus
Sibling priority · Desired start approaching
```

**Preserved:** icon-left drawer affordances, subtle frame, dense row height, no runtime/data/loading changes.

---

## V3.3 — Unified header container (implemented)

**Problem:** Line 2 felt detached from line 1; secondary text and parent contact meta were too small.

### Changes

1. **Single header container** — both lines inside `header-zone` with no internal divider; subtle shared background; one border below the block.
2. **Typography bump** — line 2 at 10.5px (was 9px); attention inline 10.5px; status 10px; parent contact meta 10.5px.
3. **Parent contact block** — phone/email nested under parent name in `parent-identity`, aligned with name not icon indent.
4. **Density** — removed double border between header and people band; tightened people-band padding.

---

## V3.4 — Visual hierarchy & grouping (implemented)

**Problem:** Layout was correct but the row felt like one flat white rectangle.

### Zone model (background tints, no cards/shadows/extra borders)

1. **Summary zone** (`data-queue-zone="summary"`) — light Alloy stone tint; operational header lines 1–2 unified.
2. **People zone** (`data-queue-zone="people"`) — clean white; parent name + contact connected; children below with spacing only.
3. **Facts zone** (`data-queue-zone="facts"`) — subtle muted tint for tour/timing/supporting detail.

### Typography

- Household **13px / 700** — strongest in row
- Parent name **11.5px**; contact **10.5px** (one step down, not footnote-sized)
- Line 2 **10.5px / 78–80%** — readable, not disabled-looking
- Removed internal dividers, dashed parent/child rule, colored attention panels
