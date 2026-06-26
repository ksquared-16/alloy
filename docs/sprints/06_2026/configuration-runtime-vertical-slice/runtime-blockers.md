# Configuration Runtime Vertical Slice — Runtime Blockers

**Slice:** Process → Work View → Layout Assignment → Preview Runtime → Runtime  
**Date:** June 2026

## What works end-to-end

| Step | Status |
|------|--------|
| `/settings/processes` — Processes hub, Work Views editor, Presentation assignment | **Working** |
| Save `work_views_v1` on process metadata | **Working** |
| Work View conditions, sort, visibility, layout selectors | **Working** |
| Stage presentation assignment via `business_process_layout_assignments` | **Working** |
| Lead Summary card blueprint editor + publish to `entity_layouts` | **Working** |
| Runtime Work View pills (labels, order, visibility) from saved `work_views_v1` | **Working** when Phase 3A or Alloy OS runtime flag enabled |
| Preview runtime deep link (`?queue=` + optional `work_view`, layout ids) | **Working** when compatibility queue lane is mapped |

## Known blockers (documented, not hidden)

### 1. Layout runtime read path (default OFF)

Published layouts in `entity_layouts` and assignments in `business_process_layout_assignments` **do not change live queue rows or Focus Panel rendering** until:

- `LAYOUT_RUNTIME_ENABLED` / `isLayoutRuntimeReadPathEnabled()` is enabled server-side, and
- Drawer/queue renderers call `resolveLayoutForOrg()` with assignment context.

**Impact:** Operators can assign and publish layouts in settings; runtime still uses legacy presentation until the read path flag ships.

**Work view layout IDs** (`queue_layout_id`, `focus_panel_layout_id`) are persisted and passed on preview URLs (`queue_layout`, `focus_layout` query params) but are **not yet consumed** by the work-unit page layout resolver.

### 2. Work View filter evaluation

`filters_v1` conditions are authored and saved on process metadata. **Queue fetch does not yet evaluate** these filters — records are still partitioned by synced `queue_definition` lanes and stage status membership.

**Impact:** “Show work when…” configures intent; runtime lane membership remains queue-definition-driven until filter evaluation is implemented.

### 3. Compatibility queue mapping

Each Work View needs `compat_queue_key` mapping to an existing pipeline queue lane for preview runtime and pill selection. Save auto-enriches from pipeline lane labels; operators can override in Advanced.

**Impact:** New Work Views without a mapped lane show the compat queue picker until saved/mapped.

## Preview URL contract (implemented)

```
/adminV2/workspace/dept/{dept}/work-unit/{wu}?queue={compat_queue_key}&work_view={id}&queue_layout={uuid}&focus_layout={uuid}
```

Query params beyond `queue` are forward-compatible; runtime consumes `queue` today.

## Enable runtime convergence locally

```bash
# Work View pills + perspective merge
NEXT_PUBLIC_CONFIGURATION_RUNTIME_PHASE_3A=1

# Alloy OS runtime shell (includes perspectives when enabled)
NEXT_PUBLIC_ALLOY_OS_RUNTIME=1
```

Layout read path requires separate server env — see `web/lib/layout/featureFlag.ts`.
