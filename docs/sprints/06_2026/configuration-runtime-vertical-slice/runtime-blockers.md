# Configuration Runtime Vertical Slice — Runtime Blockers

**Slice:** Process → Work View → Layout Assignment → Preview Runtime → Runtime  
**Date:** June 2026  
**Slice 2:** Runtime Activation (Vertical Slice 2)

## What works end-to-end

| Step | Status |
|------|--------|
| `/settings/processes` — Processes hub, Work Views editor, Presentation assignment | **Working** |
| Save `work_views_v1` on process metadata | **Working** |
| Work View conditions, sort, visibility, layout selectors | **Working** |
| Stage presentation assignment via `business_process_layout_assignments` | **Working** |
| Lead Summary card blueprint editor + publish to `entity_layouts` | **Working** |
| Runtime Work View pills (labels, order, visibility) from saved `work_views_v1` | **Working** when Phase 3A or Alloy OS runtime flag enabled |
| Preview runtime deep link (`?work_view=` + optional `queue`, layout ids) | **Working** — work_view-only URLs supported |
| Queue fetch evaluates `filters_v1` when `work_view_id` param present | **Working** |
| Queue layout from Work View `queue_layout_id` | **Working** when layout runtime read path enabled |
| Focus Panel layout from Work View `focus_panel_layout_id` | **Working** when layout runtime drawer body enabled |
| Runtime prefers `?work_view=` over bare queue for Work View identity | **Working** |

## Resolved blockers (Slice 2)

### 1. Layout runtime read path — **Resolved (when flags enabled)**

Work-unit page passes pinned layout ids from active Work View:

- Queue: `queue.pinnedQueueLayoutId` → `useOpportunityQueueLayoutRuntime` → `entity_layout_id` on layout-runtime API
- Focus Panel: `opportunityWorkspaceContext.focus_panel_layout_id` → drawer layout body API

Resolution priority (server): Work View pinned layout → `business_process_layout_assignments` → default layout fallback.

**Remaining gate:** Server/client layout runtime feature flags must be enabled — see `web/lib/layout/featureFlag.ts`.

### 2. Work View filter evaluation — **Resolved**

`GET /api/admin/queues/...` accepts `work_view_id` / `work_view`. When present, queue rows are post-filtered via `evaluateWorkViewFiltersV1` (fail-safe for unsupported fields/operators).

Work-unit page passes `work_view_id` on every queue fetch for the active Work View.

### 3. Compatibility queue mapping — **Partially resolved**

Preview Runtime and bootstrap no longer require operators to understand queue keys — `?work_view={id}` alone activates the Work View. `compat_queue_key` is still used internally to map Work Views to synced pipeline lanes for fetch until queue-definition migration.

### 4. URL params consumed at runtime — **Resolved**

| Param | Consumed by |
|-------|-------------|
| `work_view` | Work View identity, filters, layout ids, nav pills |
| `queue_layout` | Overrides Work View queue layout id |
| `focus_layout` | Overrides Work View focus panel layout id |
| `queue` | Fallback lane when work_view absent |

## Preview URL contract

```
/adminV2/workspace/dept/{dept}/work-unit/{wu}?work_view={id}&queue_layout={uuid}&focus_layout={uuid}
```

Optional `queue={compat_queue_key}` for explicit lane override; omitted when Work View maps a compat lane.

## Enable runtime convergence locally

```bash
# Work View pills + perspective merge
NEXT_PUBLIC_CONFIGURATION_RUNTIME_PHASE_3A=1

# Alloy OS runtime shell (includes perspectives when enabled)
NEXT_PUBLIC_ALLOY_OS_RUNTIME=1

# Layout runtime read path (server + client) — default ON; use =0 to disable
LAYOUT_RUNTIME_ENABLED=1
LAYOUT_RUNTIME_OPPORTUNITY_QUEUE=1
LAYOUT_RUNTIME_OPPORTUNITY_DRAWER=1
```

## End-to-end browser proof

**Settings routes (no feature flags required):**

| Route | What you see |
|-------|----------------|
| `/settings` | Configuration hub — **Processes** + **Layouts** tiles |
| `/settings/processes` | Process cards, Work Views / Presentation / Stages nav |
| `/settings/business-processes` | Redirects → `/settings/processes` |
| `/settings/layouts` | Layout gallery + Lead Summary blueprint |

**Screenshots:** `docs/sprints/06_2026/configuration-runtime-end-to-end/` (`01-settings-home.png` … `08-runtime-active-work-view.png`)

**Playwright:** `web/playwright/tests/configuration-runtime-end-to-end.spec.ts`  
**Vitest:** `web/tests/adminV2/configurationRuntimeEndToEnd.test.ts`

## Still open (out of Slice 2 scope)

| Item | Notes |
|------|-------|
| Queue Builder | Not in scope |
| Focus Panel Builder | Not in scope |
| Schema tables | Not in scope |
| Full queue-definition migration off `compat_queue_key` | Future slice |
| `assigned_staff` / `program` filter fields | Saved in UI; fail-safe pass-through until row enrichment supports them |
