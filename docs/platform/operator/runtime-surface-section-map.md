# Runtime Surface Section Map

Status: active · Owner: operator runtime · Source of truth (code): `web/lib/perf/alloySectionMap.ts`

Every visible region of the **Work Unit** operating surface and the **Workspace** surface has a
stable section identifier. When someone says "Section WU-04 loads late" or "WS-06 is blank," the
identifier resolves immediately to a component owner, data source, loading gate, cache source,
reveal rule, and whether it should block the surface.

## Core law

- Every surface section is identifiable by a stable id (`WU-00`…`WU-15`, `WS-00`…`WS-10`).
- The registry in `web/lib/perf/alloySectionMap.ts` is the single source of truth. This doc mirrors
  it and is kept in sync by tests (`web/tests/perf/alloySectionMap.test.ts`).
- **Any new surface section must register an entry** in `alloySectionMap.ts` and appear in this doc.
- This is documentation + diagnostics only — no redesign, no new runtime primitive. `blocking`
  records the readiness contract for diagnosis; it is not a runtime switch.

## Diagnostics

Each section root carries DOM attributes (spread via `alloySectionDomAttrs(id)`):

- `data-alloy-section-id` — e.g. `WU-02`
- `data-alloy-section-name` — human name
- `data-alloy-section-owner` — component path
- `data-alloy-section-blocking` — `true` | `false`
- `data-alloy-section-cache` — `bootstrap` | `session` | `network` | `snapshot` | `none`

Section load boundaries emit dev/staging-only logs via `perfSection(id, status, …)`:

```
[perf:section] { phase: 'WU-02', status: 'ready', source: 'bootstrap', blocking: false, since_nav_ms: 312 }
[perf:section] { phase: 'WU-07', status: 'pending', source: 'network', blocking: true, since_nav_ms: 410 }
[perf:section] { phase: 'WS-05', status: 'ready', source: 'session', blocking: true, since_nav_ms: 500 }
```

`status` is one of `pending | ready | stale | refresh | error`. No production noise; gated by
`perfDevDetailEnabled()`.

## Work Unit surface (WU)

| ID | Section | Owner | Data source | Cache | Blocks reveal |
|----|---------|-------|-------------|-------|---------------|
| WU-00 | Persistent OS Shell | `web/app/adminV2/components/AdminV2Shell.tsx` | session shell (sidebar, top nav, search, location) | session | yes |
| WU-01 | Work Unit Context Header | `web/components/admin/workspace/layout/WorkUnitCommandSurface.tsx` | operational bootstrap (title, process, lane) | bootstrap | yes |
| WU-02 | Work Unit KPI Strip | `web/components/admin/workspace/layout/WorkUnitCommandSurface.tsx` | placement KPI snapshot | snapshot | **no (snapshot)** |
| WU-03 | Work View / Lane Pills | `web/components/admin/workspace/layout/WorkUnitCommandSurface.tsx` | bootstrap queue summaries / perspectives rail | bootstrap | yes |
| WU-04 | Queue Header | `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` | queue definition + lane summary | bootstrap | yes |
| WU-05 | Condensed Queue Rows | `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` | primary lane rows (bootstrap inline, quiet refresh) | bootstrap | yes (WU-05 **or** WU-06) |
| WU-06 | Queue Preparing / Empty State | `web/app/adminV2/components/workspace/blocks/OperationalModeQueuePreparePanel.tsx` | operational mode entry controller / known-empty lane | none | yes (WU-05 **or** WU-06) |
| WU-07 | Focus Panel Shell | `web/components/admin/drawer/EntityDrawerOperatingShell.tsx` | drawer chrome + subject identity (renders before VM) | session | yes |
| WU-08 | Focus Panel Mode Control | `web/components/admin/focusPanel/FocusPanelModeSwitch.tsx` | static UI (Summary / Work / Activity) | none | yes |
| WU-09 | Focus Panel Summary Mode | `web/components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx` | opportunity drawer view-model (System 5 cards) | network | **active_mode_only** (blocks only if Summary active) |
| WU-10 | Focus Panel Work Mode | `web/components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx` | drawer view-model (checklist / launcher / blockers) | network | no (when inactive) |
| WU-11 | Focus Panel Activity Mode | `web/components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx` | timeline / activity / embedded workspace (lazy) | network | no (when inactive) |
| WU-12 | Right Rail Actions | `web/app/adminV2/components/workspace/CommandRailCollapsibleActionsSection.tsx` | actions right-rail bundle | network | no |
| WU-13 | Right Rail Workflow Telemetry | `web/app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx` | workflow runs / summary telemetry | network | no |
| WU-14 | BOS Rail | `web/app/adminV2/components/CommandRailBosMount.tsx` | BOS assistant panel (lazy) | network | no |
| WU-15 | Operational Workspace Overlay | `web/app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx` | Processing / Communications / Work Items / Inbox modal | network | **when_open** only |

## Workspace surface (WS)

| ID | Section | Owner | Data source | Cache | Blocks reveal |
|----|---------|-------|-------------|-------|---------------|
| WS-00 | Persistent OS Shell | `web/app/adminV2/components/AdminV2Shell.tsx` | session shell | session | yes |
| WS-01 | Workspace Resume Chip | `web/components/admin/workspace/ResumeWhereYouLeftOffChip.tsx` | session resume state | session | no |
| WS-02 | Workspace Title / Command Center Header | `web/components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx` | org / command center header | bootstrap | yes |
| WS-03 | Workspace Health KPI Strip | `web/components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx` | OIP health snapshot | snapshot | **no (snapshot)** |
| WS-04 | Operational Pulse / Primary KPI Area | `web/components/admin/workspace/layout/WorkspaceHealthPulseSection.tsx` | operational pulse snapshot | snapshot | **no (snapshot)** |
| WS-05 | Business Process Tiles | `web/components/admin/workspace/WorkspaceRootLifecycleGrid.tsx` | lifecycle catalog + departments | bootstrap | yes |
| WS-06 | Workspace Process Tile KPI Snapshot | `web/components/admin/workspace/WorkspaceRootLifecycleGrid.tsx` | per-tile metric snapshot | snapshot | **no (snapshot)** |
| WS-07 | Right Rail Actions | `web/app/adminV2/components/workspace/WorkspaceRootActionsRail.tsx` | workspace-root actions bundle | network | no |
| WS-08 | Right Rail Workflow Telemetry | `web/app/adminV2/components/workspace/CommandRailDefaultEmptyTelemetry.tsx` | workflow telemetry (default empty on root) | network | no |
| WS-09 | BOS Rail | `web/app/adminV2/components/CommandRailBosMount.tsx` | BOS assistant panel (lazy) | network | no |
| WS-10 | Operational Workspace Overlay | `web/app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx` | Processing / Communications / Work Items / Inbox modal | network | **when_open** only |

## Readiness / blocking contract

A surface reveals as one coordinated unit once its **blocking** sections are ready.

**Work Unit blocks:** WU-00, WU-01, WU-03, WU-04, (WU-05 **or** WU-06), WU-07, WU-08, and
WU-09 only while Summary is the active mode.

**Work Unit does not block:** WU-02 (after snapshot exists), WU-10 / WU-11 (when inactive),
WU-12 / WU-13 / WU-14 (rail shell renders independently), WU-15 (unless explicitly opened).

**Workspace blocks:** WS-00, WS-02, WS-05.

**Workspace does not block:** WS-01, WS-03 / WS-04 / WS-06 (after snapshot/default exists),
WS-07 / WS-08 / WS-09, WS-10 (unless explicitly opened).

## KPI snapshot law

KPI sections — **WU-02, WS-03, WS-04, WS-06** — are snapshot sections. They must:

- occupy their final placement immediately,
- render cached / snapshot / default state immediately,
- refresh quietly and patch values in place,
- never trigger a full surface preparation state,
- never pop in late as separate cards,
- never block surface reveal after the first snapshot/default exists.

A missing/no-data state is acceptable until the first snapshot exists, but it must occupy the final
placement from the beginning.

## Operational workspace overlay law

When opened from a Work Unit page, operational workspaces (Processing, Communications, Work Items,
Inbox, and future Billing / Scheduling / Attendance) render through **WU-15 / WS-10** and must:

- overlay the operating canvas at full available width,
- not be constrained by the Work Unit queue / Focus Panel split CSS vars,
- not be trapped inside the Focus Panel or queue column,
- look identical in width to opening the same workspace from `/workspace`,
- on close, return to the prior Work Unit lane + subject + Focus Panel mode + queue scroll.

## Queue-click reliability law (WU-05)

The condensed queue row (WU-05) is the operator's primary selection control and must be reliable:

- The **entire** condensed row is one click target (`CompressedQueueRow` is a single `<button>`); no
  child element stops propagation or narrows the hit area.
- A single click **immediately** marks the clicked row as the active/selected row — the active
  highlight follows the clicked-but-pending id (`queueRowOpenPendingOpportunityId`), not just the
  committed `drawer.id`, so selection never waits for the VM payload on a model-swap cache miss.
- The Focus Panel shell (WU-07) switches to the selected subject immediately
  (`shouldDeferOpportunityDrawerOpen` is `false` on work-unit surfaces); the VM payload warms
  in-place afterward.
- Rapid clicks settle on the latest row: each click overwrites the pending selection id, and the
  default resolver never overrides a manual selection (`manualSelectionRef`).
- After reveal, no preparing/empty/overlay layer intercepts row clicks — the preparing panel (WU-06)
  only replaces rows before the first subject opens (`!splitActive && !openDrawerOpportunityId`).

Intent logs (dev/staging, `[perf:intent]`) trace the click lifecycle by section id:

```
[perf:intent] { phase: 'click_down',   section_id: 'WU-05', record_id: … }
[perf:intent] { phase: 'row_selected',  section_id: 'WU-05', opportunity_id: … }
[perf:intent] { phase: 'open_requested', section_id: 'WU-05', opportunity_id: …, cache_hit: … }
[perf:intent] { phase: 'stale_ignored', section_id: 'WU-05', reason: 'default_resolver_blocked_manual_selection' }
[perf:intent] { phase: 'blocked',       section_id: 'WU-05', reason: 'empty_item_id' }
```

## Using section IDs during browser QA

1. Inspect any region → read `data-alloy-section-id` to name the section precisely.
2. Filter the console by `[perf:section]` to see each section's `status` / `source` / `blocking` /
   `since_nav_ms` ordering during a navigation.
3. A `blocking: true` section stuck at `status: pending` is the reveal gate to investigate first.
4. A `snapshot` section that logs `pending` (instead of `ready` immediately) or pops in late
   violates the KPI snapshot law.
5. Report issues by section id (e.g. "WU-07 pending +900ms, blocking") so the owner/data source/
   cache rule is unambiguous.

## Registration rule

New surface sections must:

1. add an entry to `web/lib/perf/alloySectionMap.ts`,
2. add the row to the matching table above,
3. spread `alloySectionDomAttrs(id)` onto the section root,
4. emit `perfSection(id, status, …)` at its load boundary where practical.

Tests in `web/tests/perf/alloySectionMap.test.ts` enforce registry/doc alignment and the
snapshot/blocking contract.
