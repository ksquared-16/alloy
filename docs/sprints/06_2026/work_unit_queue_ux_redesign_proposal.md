# Work Unit Queue UX Redesign Proposal

**Path:** `docs/sprints/06_2026/work_unit_queue_ux_redesign_proposal.md`  
**Status:** Proposal — **do not implement until approved**  
**Date:** 2026-06-03  
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
