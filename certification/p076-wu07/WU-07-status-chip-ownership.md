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

---

# VERIFIED ON THE DEPLOYED FIX — `3bff6e7c`

Same instrument, same route, same session conditions. n = 14 before, n = 14 after, no signed-out
samples in either set.

| | before `9620b05b` | after `3bff6e7c` |
|---|---|---|
| `POST_COMPLETE_AUTHORITATIVE_CORRECTION` P50 | **1** | **0** |
| values | `[1] × 14` | `[0] × 14` |
| the correction | STATUS `"Lead"` → `"New Lead"` ×14 | none |

**TARGET MET.** Zero post-complete corrections, deterministic across every sample.

The STATUS series is now `<reserved>` → `"New Lead"` in 14/14: the operator never reads a status
the record does not have, and the arrival is a fill in place.

## Geometry held — the status chip is never inserted

This is the check that distinguishes a real fix from trading one defect for another. A subject
reading empty is ambiguous on its own: the chip may be *absent* (so the value arriving INSERTS a
chip and shifts layout) or *present and reserved* (so it fills in place). Measured directly:

| | at the frame | at settle |
|---|---|---|
| status chips | **1** | **1** |
| of which reserved | 1 | 0 |

14/14 identical. The status chip exists at the frame and the same chip carries the value later.

## Disclosed, not hidden

- **Two other chips are still inserted after the frame.** Total chips go 1 at the frame → 3 at
  settle; location and attention arrive at ~4.5s. This is pre-existing — location filled at ~4.0s
  in the before set and was equally absent at the frame — and is neither caused nor fixed here. It
  remains open geometry debt for those chips.
- **`PROCESS` never renders** on this route, before or after.
- **Frame time: P50 1,108 → 1,162ms (+54ms).** Ranges overlap heavily (before 1,012–2,515;
  after 965–5,869, with the faster single sample in the after set). At n = 14 per side on a shared,
  loaded host this is not a distinguishable regression, and it is recorded rather than dropped.
- **The deliberate trade:** the operator previously saw a status chip at ~1s that was wrong in kind
  (a stage presented as a status); they now see a reserved chip until ~4.5s. Removing a false
  assertion is the intended outcome, but the chip is blank for longer, and that is a real cost.
  Closing it means giving the frame a value the owner actually owns — a server-compose change, not
  a header change.
