# Work Unit Layout Doctrine

**Status:** Canonical V3 (June 2026)  
**Scope:** All Admin V2 work-unit execution surfaces (`WorkUnitWorkspace`, slug and UUID routes)

## Purpose

Lock a consistent work-unit page structure where the **queue remains the primary operating surface**. Workflow telemetry is **secondary diagnostic information** and lives in the **right command rail** — not in the primary page flow.

Related: **`workspace-system.md`**, **`platform-performance-doctrine.md`**, **`bos-foundation.md`**.

## Primary page flow

Work-unit pages contain **two vertical zones only**:

1. **Header** — lifecycle, filters, KPI strip, lane context  
2. **Queue** — dominant operating surface for record processing  

**Nothing appears below the queue.** Telemetry is not part of the main page flow.

## Queue visibility doctrine

Queue visibility is **higher priority** than telemetry visibility.

- Queue list uses a **bounded scroll shell** (`.adminv2-ws-wu-queue-list-shell`).
- Target **6–8 visible rows** on common laptop/desktop viewports (row height unchanged).
- Row behavior, selection, drawer open, and registry actions are **unchanged**.
- Telemetry must **not** consume primary-column vertical space.

**CSS tokens** (work-unit surface only):

| Token | Role |
|-------|------|
| `--ws-wu-queue-visible-rows-target` | Row-count target (6 laptop; 7 @1440px; 8 @1280×900+) |
| `--ws-wu-queue-row-stack-estimate` | Per-row height estimate from `--ws-dept-queue-row-min-height` |
| `--ws-wu-queue-records-scroll-top-offset` | Reserve space for header deck |
| `--ws-wu-queue-records-scroll-height-cap` | Hard cap (680px) |
| `--ws-wu-queue-records-scroll-max-height` | `min(row-target, viewport-remaining, cap)` |

## Right rail utilities (Actions → Telemetry → BOS)

Telemetry is a **right rail utility** alongside Actions and BOS — same collapsible pattern as Actions.

**Order (fixed):**

1. **Actions** — registry / lifecycle actions  
2. **Workflow Telemetry** — compact operator utility  
3. **BOS** — sticky assistant dock  

### Workflow Telemetry — collapsed (default)

Match Actions visual treatment: same spacing, border, collapse affordance, header style.

- **▶ Workflow Telemetry** with workflow iconography  
- Compact status summary under title, e.g. `Healthy · 3 runs today • 100% success • 0 failures`  
- Approximately the same height as the Actions header  
- **No** large cards, dashboards, charts, or metric grids  

### Workflow Telemetry — expanded (on demand)

Operator-relevant information **only**:

- **Workflow Health** — status label + runs today / success / failures (plain lines)  
- **Recent Workflow Activity** — short bullet list of recent scoped workflow runs  
- **Actions** — Open Automations, Workflow Diagnostics  

**Must not** show in work-unit rail expand:

- Throughput dashboards  
- Reliability cards  
- 7-day KPI grids  
- Analytics blocks  

Detailed analytics belong on department surfaces (`presentation="full"`) or dedicated diagnostics pages.

Expanded content scrolls **inside the telemetry section**. It must **not** push queue content down or reduce BOS height.

**Implementation:** `AutomationWorkflowsBlock` with `presentation="work_unit_rail"` in `commandRailTelemetrySlot` → `[data-command-rail-telemetry]` inside `WorkspaceCommandRailShell`.

## BOS rail doctrine

BOS is a **persistent assistant surface** fixed below telemetry in the command rail.

**Requirements:**

- **Do not** reduce, shrink, or move BOS to make room for telemetry.  
- BOS stays **fixed in viewport** while primary-column content scrolls.  
- Telemetry adapts around BOS (internal scroll / collapse), not the reverse.  
- BOS remains continuously available as operational copilot.  

**Implementation:** `[data-adminv2-workspace-command-column]` uses `position: sticky` in `adminV2.css`. BOS host uses `flex: 1 1 auto` with `min-height: 14rem` on work-unit surfaces.

## Department / diagnostics full telemetry (unchanged)

Department context-lower surfaces keep `AutomationWorkflowsBlock` with `presentation="full"` (default) — full metric groups, scoped workflow lists, Ask Workflow Assist.

## Future work units

All new work-unit surfaces **must**:

1. Render through `WorkUnitWorkspace` + `WorkspaceShellLayout`.  
2. Keep primary flow as **Header → Queue** only.  
3. Mount telemetry with `presentation="work_unit_rail"` in the command rail.  
4. Keep BOS below telemetry without height reduction.  

**Must not:**

- Mount telemetry below the queue or anywhere in the primary column.  
- Show analytics dashboards in work-unit rail expand.  
- Shrink BOS for telemetry expansion.  

## Success criteria

A user should be able to:

1. See **more queue records** without scrolling (≥2–3 additional rows vs pre-rail layouts).  
2. Keep **BOS fully visible**.  
3. Check **workflow health at a glance** from collapsed telemetry.  
4. **Expand telemetry only when needed** for recent activity and diagnostics actions.  
5. **Access Automations** without leaving the work unit.  

## Validation checklist

- [ ] Queue shows 6–8 rows on common laptop viewports without page scroll.  
- [ ] No telemetry below queue or in primary column.  
- [ ] Right rail shows Actions, Workflow Telemetry, BOS in order.  
- [ ] Telemetry collapsed by default; matches Actions rail styling.  
- [ ] Expand shows operator content only (health, recent activity, actions).  
- [ ] Expand does not move queue or shrink BOS.  
- [ ] BOS remains visible or recoverable after telemetry expansion.  
- [ ] Slug and UUID routes share `WorkUnitWorkspace` shell.  
- [ ] Department pages keep full telemetry (`presentation="full"`).  

## Code map

| Concern | Location |
|---------|----------|
| Primary layout shell | `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` |
| Command rail shell | `web/app/adminV2/components/workspace/WorkspaceCommandRailShell.tsx` |
| Rail telemetry block | `web/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx` |
| Queue height tokens | `web/app/adminV2/components/workspace/workspace.css` |
| Rail telemetry styles | `web/app/adminV2/adminV2.css` |
| BOS sticky rail | `web/app/adminV2/adminV2.css` |
| Tests | `web/tests/adminV2/workUnitLayoutDoctrine.test.ts`, `web/tests/admin/adminV2QueueRowClick.test.ts` |
