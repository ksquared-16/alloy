# Queue Density Experiment — Pass 1

**Status:** Active experiment (not canonical doctrine)  
**Scope:** Work-unit queues only  
**Revert:** Remove `workUnitQueueDensity="pass-1"` from `WorkUnitWorkspace` (or delete `data-ws-wu-queue-density="pass-1"` rules in `workspace.css`).

## Goal

Increase visible queue records by approximately **one additional row** without reducing readability.

## Method

Spacing-only compact mode — **no changes** to:

- Household name font
- Contact name font
- Child names
- Status badges
- Core icon sizes

Reduced via CSS under `[data-ws-wu-queue-density="pass-1"]`:

- Vertical row padding
- Internal section spacing
- Contact field spacing (`gap` only)
- Task block spacing
- Attention block spacing
- Action rail button vertical padding (slightly)

## Activation

`WorkUnitWorkspace` sets `workUnitQueueDensity="pass-1"` on `WorkspaceShellLayout`, which emits `data-ws-wu-queue-density="pass-1"` on the work-unit root.

## Tokens (pass-1 overrides)

| Token | V3 baseline | Pass 1 |
| --- | --- | --- |
| `--ws-wu-queue-row-min-height` | 43px | 37px |
| `--ws-wu-queue-row-gap` | 6px | 5px |
| `--ws-wu-queue-visible-rows-target` (laptop) | 5 | 6 |
| `--ws-wu-queue-visible-rows-target` (≥1440px) | 6 | 7 |
| `--ws-wu-queue-visible-rows-target` (≥1280×900) | 7 | 7 |

## Validation targets

| Viewport | Before (approx.) | Target |
| --- | --- | --- |
| Laptop | 4–5 visible rows | 5–6 |
| Larger screens | — | 6–7 |

## Manual checklist

1. Queue scrolls independently (50+ records reachable; wheel over queue scrolls queue, not page).
2. Queue fills viewport to rail bottom; BOS/header/rail remain fixed.
3. Scanning hierarchy preserved (household → contact → children → status → attention → tasks).
4. Readability spot-check on real lanes (enrollment, waitlist, mixed attention rows).

## Outcomes

- **If readability holds:** promote spacing values into `docs/system/work-unit-layout-doctrine.md` as the new density baseline.
- **If readability degrades:** revert pass-1 activation and document findings here — do not shrink typography.

## Files

- `web/app/adminV2/components/workspace/workspace.css` — pass-1 tokens + scoped spacing rules
- `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` — experiment activation
- `web/components/admin/workspace/WorkspaceShellLayout.tsx` — `workUnitQueueDensity` prop
