# WU-07 — POST_COMPLETE_AUTHORITATIVE_CORRECTION

Measured on deployed staging `9620b05b`, cold work-unit open, `/adminV2/workspace/work-unit/new-leads`.
Instrument: `web/playwright/tests/zz-p077-header-corrections.spec.ts` (browser-only; a MutationObserver
records every distinct rendered value per subject and the frame boundary on one clock).

## Definition used

A **correction** is a subject going from one non-empty rendered value to a *different* non-empty value.
Empty → value is a **fill** (UNKNOWN resolving), which is what a progressive frame is for and is not a
defect. Conflating the two is how a progressive frame gets misread as an unstable one.

**Post-complete** = after the authoritative frame (configured geometry present, 6 cells).

## Result — before the fix

| subject | behaviour | corrections |
|---|---|---|
| STATUS | `"Lead"` at the frame → `"New Lead"` ~2.9s later | **1 (every sample)** |
| LOCATION | `""` → `"North Campus"` | 0 (fill) |
| PROCESS | never rendered | 0 |
| MANAGE | `""` → `"Manage▾"` | 0 (fill) |

`POST_COMPLETE_AUTHORITATIVE_CORRECTION P50 = 1`, n = 14, values `[1] * 14` — fully deterministic.
Frame at P50 ≈ 1,100ms; correction at P50 ≈ 4,050ms.

## Root cause

Three different labels exist for the same record, read from three different owners:

| source | value |
|---|---|
| `row_status_label` (queue row projection) | `"New"` |
| `row_stage` (process stage) | `"Lead"` |
| drawer VM `header.status.label` (authored `status_defs`) | `"New Lead"` |

`focusPanelSeedFromQueueRow` seeds the header's status chip from the queue row's **configured
`status` display slot**. That slot is bound per work unit, and on this work unit it is bound to
`queue_row.stage_label` — confirmed live: `statusSlotFieldKeys: ["queue_row.stage_label"]`. So the
**process stage was being asserted in the chip that means record status**, and the owner corrected it
once the drawer VM landed.

Re-seeding from the row's status field does **not** fix it: that field carries `"New"`, a third
spelling, which corrects to `"New Lead"` just the same. **The queue row holds no value equal to the
owner's**, so there is nothing available at frame time that can honestly fill this chip.

## Fix

The status chip is **reserved** until its owner answers — the chip-row analogue of
`ReservedFocusPanelCell`: the configured element is always present, and readiness decides content,
never whether the element exists. The later arrival becomes a fill, not a correction.

- `buildFocusPanelContextChipsFromQueuePreviewSeed` emits a reserved status chip instead of the seed's text.
- `resolveOpportunityVmStatusLabel` returns `null` (UNKNOWN) instead of falling back to the seed.
- `OpportunityFocusPanelHeader` reserves the chip when its owner reports UNKNOWN, so the chip count
  is equal across the seed → resolved swap.
- The reserved chip holds width and renders no text — no dash, ellipsis or "Pending", each of which
  reads as a fact the record does not have.

## Carried forward as debt (out of WU-07 scope)

The queue row projection renders `row_status_label = "New"` where the authored status definition is
`"New Lead"`. Anywhere a work unit binds its status slot to `opportunity.status_label`, operators see
a status label that is not the authored one. This is a projection defect, not a header defect, and is
**not** fixed here.
