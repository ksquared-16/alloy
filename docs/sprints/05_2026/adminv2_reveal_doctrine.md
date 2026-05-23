# AdminV2 reveal doctrine — routes and drawers

Prerequisites: [adminv2_speed_sprint.md](./adminv2_speed_sprint.md), [adminv2_route_shell_pipeline.md](./adminv2_route_shell_pipeline.md), [adminv2_drawer_pipeline.md](./adminv2_drawer_pipeline.md).

## Template-level scope (platform, not Enrollment-only)

This doctrine applies to **templates**, not one-off pages:

| Template | Route / surface |
|----------|-----------------|
| Workspace root | `/adminV2/workspace` |
| Department | `/adminV2/workspace/dept/[departmentId]` |
| Work unit | `/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]` |
| Pipeline-backed drawers | Opportunity, job, and registered drawer entities |

Entity-specific adapters (`buildWorkUnitAboveFoldRenderModel`, `buildInquirySummaryRightColumnModel`, etc.) supply data; **reveal contracts and gates are platform-level** in `web/lib/adminV2/*RevealGate.ts` and page loading gates.

Cache key contracts: `web/lib/adminV2/adminV2AboveFoldCacheContracts.ts`.

## Global principle

The user should experience:

1. **Immediate interaction feedback** (nav ack, opening overlay, optional route chrome)
2. **Short coherent loading state** (one branded surface — no section skeletons)
3. **Entire above-fold surface reveals together**
4. **No visible loading waves after reveal** (only quiet value refinement in reserved geometry)

We do **not** want: chips → actions → queues → KPI skeletons → cards → drawer sections → reminders, each appearing in sequence.

If a region cannot render coherently, **keep the loading gate up**.

---

## Route reveals (`/workspace`, `/dept`, `/work-unit`)

### Pattern

1. User navigates
2. Branded loading surface (`*PageLoadingGate` or workspace equivalent)
3. **Above-fold contract** resolves (see gates below)
4. Full route above-fold mounts together

### After reveal (allowed)

- Below-fold automation / workflow strips
- KPI value refinement when placements were intentionally deferred (quiet reserve only — no metric-card skeleton wave)
- Background `surface=full` / deferred queue keys / adjacent lane prefetch
- Server-driven count badge updates

### After reveal (NOT allowed)

- Section skeletons replacing empty shells
- `soft-content-reveal` stagger animations on above-fold regions
- Independent oper-region spinner then panel swap
- Actions rail placeholder → buttons pop-in
- Queue row skeleton grid as first paint of the lane

### Gate ownership

| Surface | Module | Console filter |
|---------|--------|----------------|
| Work unit | `workUnitRevealGate.ts` | `[wu-reveal-gate]` |
| Department | `deptRevealGate.ts` | `[dept-reveal-gate]` |
| Workspace | `workspaceRevealGate.ts` | `[workspace-reveal-gate]` |
| Prefetch | `prefetchAdminV2AboveFold.ts` | `[prefetch.adminv2]` |

### Workspace above-fold contract

`above_fold_ready` requires **all**:

| Phase | Meaning |
|-------|---------|
| `shell_ready` | Department list fetch settled |
| `department_tiles_ready` | Active departments present, or confirmed empty org |
| `tile_counts_ready` | Quick rollup (`metrics` + per-dept WU counts) applied |
| `kpi_region_ready` | Always true at gate — placements may use quiet reserve after reveal |
| `actions_ready` | Orientation rail (static) — always true |

**Not** in gate: growth rollup refinement, KPI placement strip values, idle dept bootstrap prefetch.

**Prefetch after reveal:** up to 3 visible department `operational-bootstrap` bundles (`prefetchVisibleDepartmentAboveFoldBundles`).

### Work-unit above-fold contract

`above_fold_ready` requires **all**:

| Phase | Meaning |
|-------|---------|
| `shell_ready` | Dept + work unit identity, bootstrap not blocking |
| `summaries_ready` | Queue summaries or error |
| `actions_ready` | Enrollment right rail settled (or N/A) |
| `rows_ready` | Primary lane rows settled, empty lane, or error |

**Not** in gate: KPI placements, automation footer, deep enrichment, deferred queue keys.

**Data:** canonical `operational-bootstrap` with `defer_bundle=false` (primary rows + right rail inline); dept intent prefetch warms same inflight GET.

### Department above-fold contract

`above_fold_ready` requires **all**:

| Phase | Meaning |
|-------|---------|
| `shell_ready` | Department identity, not in cold blocking load |
| `work_units_ready` | Work unit list resolved or error |
| `operational_region_ready` | Throughput + needs-attention panels authoritative |
| `kpi_strip_ready` | KPI placement rows defined (`!== undefined`) |
| `actions_ready` | Enrollment dept rail settled (or N/A) |

**Not** in gate: workflow automation KPI panels (below-fold context strip).

---

## Drawer reveals (opportunity, job, pipeline-backed)

### Pattern

1. User clicks Open → **Opening record…** overlay (drawer **not** mounted)
2. `drawer_primary` + bootstrap + header actions resolve
3. Drawer mounts with **atomic above-fold render model** (structure + primary values)
4. No above-fold section waves after reveal

### After reveal (allowed)

- `surface=full` value merge into existing slots
- Below-fold scroll-gated enrichment (activity, tours) **only** in below-fold slots
- Count/badge refinement

### After reveal (NOT allowed)

- Reminders slot skeleton → fetch pop-in when primary already had metadata
- Late BOS handoff card mount (structure must exist on `drawer_primary`)
- Task region skeleton when `_inquiry_summary_tasks` present on primary
- In-drawer full-page `AdminV2RouteLoadingState` on preload path
- `enrichmentHeldUntilInteraction` collapsing all sections when full was warm at open

### Gate ownership

| Layer | Owner |
|-------|--------|
| Pre-mount | `loadOpportunityDrawerComposedOpen` + `OpportunityDrawerOpeningOverlay` |
| Coordinated overview | `opportunityDrawerCoordinatedRevealReady` |
| Right column structure | `buildInquirySummaryRightColumnModel` |
| Below-fold only | `opportunityDrawerBelowFoldEnrichmentReady`, scroll idle |

---

## Instrumentation (do not remove)

- `[perf.route.shell]`, `[wu-reveal-gate]`, `[dept-reveal-gate]`
- `[perf.wu.critical_path]`, `[wu-route-perf]`, `[wu-bootstrap-perf]`
- `[drawer-primary-perf]`, drawer first-paint / full-hydrate segments

Use these **after** doctrine stabilization to attack real latency — not to mask UX waves.

---

## Remaining bottleneck list (post-stabilization)

Measure with gates green; then optimize:

1. **WU/dept `operational-bootstrap` TTFB** — shared queue bootstrap, primary row query, attention resolver
2. **Enrollment right-rail actions** — `loadRightRailActionsBundleServer` when not in bootstrap
3. **Opportunity `drawer_primary` + full** — inquiry OCM graph, persons, field registry
4. **Dept batch queue summaries** — N× work-unit summary paths
5. **KPI placements** — when deferred off bootstrap (dept legacy path)

---

## Preload hierarchy

| From | Preload | Cap / rule |
|------|---------|------------|
| `/workspace` | Dept `operational-bootstrap` | Pointer on tile + click prepare + idle visible (max 3) |
| `/dept` | WU `operational-bootstrap` | Pointer-down on oper console links (shared inflight) |
| `/work-unit` | `drawer_primary` + bootstrap | Row pointer intent (`prefetchOpportunityDrawerOnRowIntent`) |
| Drawer open | `surface=full` | Background only after primary reveal |

Do **not** preload: full hydrate, workflow telemetry, every WU in org, every drawer, uncached policy mutations.

## Implementation status

| Surface | Page-ready gate | Notes |
|---------|-----------------|-------|
| Work unit | Yes | `WorkUnitPageLoadingGate` |
| Department | Yes | `DeptPageLoadingGate` |
| Workspace root | Yes | `WorkspacePageLoadingGate` |
| Opportunity drawer | Mostly | Pre-mount gate; reminders/tasks doctrine tightened |
| Job drawer | Verify | Same pipeline patterns |

---

## Runtime verification (operator)

### `/workspace` hard refresh

1. Filter console: `[workspace-reveal-gate]`.
2. Expect: one loading card → org banner + KPI (quiet reserve if placements pending) + department tiles with WU counts together.
3. After ~2s idle, `[prefetch.adminv2]` may warm up to 3 dept bundles — must not block reveal.
4. Pointer-down on a dept tile should log `reason: "pointer"` prefetch before navigation.

### `/work-unit` hard refresh

1. Filter console: `[wu-reveal-gate]`.
2. Expect: one loading card → full page (chips + actions + queue rows together).
3. KPI zone: quiet reserve only if placements still pending (no pulsing metric skeletons).
4. Record `reveal_wait_ms` and `reason_if_blocked` if gate stalls.

### `/dept` hard refresh

1. Filter console: `[dept-reveal-gate]`.
2. Expect: one loading card → KPI strip + paired oper panels + rail (if enrollment) together.
3. Automations strip may still show workflow KPI loading below fold.

### Opportunity drawer (Chen / Patel)

1. Filter: `[drawer-primary-perf]`, `[perf.drawer.first_paint]`.
2. Expect: “Opening record…” → drawer without in-drawer route loading card on warm preload.
3. Right column: tasks/handoff stable; reminders `empty` or `ready` at reveal (not skeleton → pop-in).
4. Activity / full-bound sections may still hydrate below fold — acceptable if below-fold gated.

### Latency owners after UX stabilization (optimize next)

| Owner | Symptom when slow | Instrument |
|-------|-------------------|------------|
| WU `operational-bootstrap` | Long `[wu-reveal-gate]` before `summaries_ready` / `rows_ready` | `[wu-bootstrap-perf]` |
| Dept `operational-bootstrap` | Long `[dept-reveal-gate]` before `operational_region_ready` | `perfDeptLoad`, dept bootstrap perf |
| Enrollment right rail | `actions` blocked on reveal | `actions_ready` phase |
| KPI placements (dept defer path) | `kpi_strip` blocked | `kpis_ready` in `perfDeptLoad` |
| `drawer_primary` | Long opening overlay | `[drawer-primary-perf]` |
| `surface=full` | Post-reveal value updates (below fold) | `[perf.drawer.full_hydrate]` |
