# Work Unit Layout Doctrine

**Status:** Canonical (June 2026)  
**Scope:** All Admin V2 work-unit execution surfaces (`WorkUnitWorkspace`, slug and UUID routes)

## Purpose

Lock a consistent work-unit page structure so operators immediately see **operational work** (queue) and **operational intelligence** (automation, telemetry, analytics) on the same page — without the queue consuming the full viewport.

Related: **`workspace-system.md`**, **`platform-performance-doctrine.md`**, **`bos-foundation.md`**.

## Page zones (priority order)

### Zone 1 — Work Unit Header

**Contains:** lifecycle name, work unit title, stage pills / sibling work units, Needs Attention (when configured), filters/search.

**Behavior:** Normal page content in the control deck. No change to header doctrine.

**Implementation:** `adminv2-ws-dept-v2-control-deck` inside `WorkUnitWorkspace` primary column.

### Zone 2 — Queue Workspace

**Contains:** queue rows, queue actions, row interactions, row expansion.

**Behavior:**

- Queue uses a **bounded workspace height** — not unbounded viewport growth.
- Queue list scrolls **inside** `.adminv2-ws-wu-queue-list-shell` when rows exceed the cap.
- Queue height is **~15–20% shorter** than the pre-doctrine cap so intelligence sections surface on first paint.
- Row behavior, selection, drawer open, and registry actions are **unchanged**.

**CSS tokens** (work-unit surface only):

| Token | Role |
|-------|------|
| `--ws-wu-queue-records-scroll-top-offset` | Reserve space for Zone 1 header deck |
| `--ws-wu-queue-intelligence-peek-reserve` | Reserve viewport space for Zone 3 mast on first paint |
| `--ws-wu-queue-viewport-height-ratio` | Viewport fraction applied to remaining height (~0.825 ≈ 17.5% reduction) |
| `--ws-wu-queue-records-scroll-height-cap` | Hard cap on list shell height (528px; prior cap 640px) |
| `--ws-wu-queue-records-scroll-max-height` | `min(calc(...), cap)` — bound for `.adminv2-ws-wu-queue-list-shell` |

**Target:** Workflow Telemetry header visible without page scroll on standard desktop resolutions (1080p-class).

### Zone 3 — Operational Intelligence

**Contains:** Workflow Telemetry, automation outcomes, system health, future operational analytics.

**Behavior:** Standard document flow **below** the queue workspace. Not hidden behind excessive queue height.

**Implementation:** `primaryFooterSlot` on `WorkUnitWorkspace` → `[data-workspace-zone="operational-intelligence"]` with `data-ws-lane-kind="automation_workflows"`.

## BOS Rail Doctrine

BOS is a **persistent assistant surface** outside the three-zone vertical flow.

**Requirements:**

- BOS rail stays **fixed in viewport** while primary-column content scrolls.
- BOS does **not** move when scrolling queue content or intelligence sections.
- BOS remains continuously available as operational copilot.

**Implementation:** `[data-adminv2-workspace-command-column]` uses `position: sticky` + `--adminv2-workspace-rail-height` in `adminV2.css` (workspace shell v2). `WorkspaceShellLayout` mounts `WorkspaceCommandRailShell` in the command column for all work-unit pages.

## Future work units

All new work-unit surfaces **must**:

1. Render through `WorkUnitWorkspace` + `WorkspaceShellLayout` (or a successor that preserves these zone contracts).
2. Keep queue preview in Zone 2 with bounded scroll — never full-page queue growth.
3. Mount operational intelligence below the queue (Zone 3).
4. Keep BOS in the sticky command column — not inline in the primary scroll column.

**Must not:**

- Allow queue content to consume the entire page.
- Hide telemetry/automation sections below excessive queue height.
- Require scrolling before operators discover automation/intelligence areas.

## Validation checklist

- [ ] Workflow Telemetry mast visible on first paint (standard desktop, queue populated).
- [ ] Queue list scrolls inside shell when rows exceed cap.
- [ ] BOS rail position stable while primary column scrolls.
- [ ] Queue row open, filters, and registry actions unchanged.
- [ ] Slug and UUID work-unit routes share `WorkUnitWorkspace` shell.

## Code map

| Concern | Location |
|---------|----------|
| Zone layout shell | `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` |
| Shared page grid + rail | `web/components/admin/workspace/WorkspaceShellLayout.tsx` |
| Queue height tokens | `web/app/adminV2/components/workspace/workspace.css` |
| Queue list scroll shell | `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` |
| BOS sticky rail | `web/app/adminV2/adminV2.css` (`[data-adminv2-workspace-command-column]`) |
| Tests | `web/tests/adminV2/workUnitLayoutDoctrine.test.ts`, `web/tests/admin/adminV2QueueRowClick.test.ts` |
