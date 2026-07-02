# Surface ViewModel Composition

Status: active — **canonical presentation ownership model (Runtime V1 complete)** · Owner: operator runtime · Source of truth (code): `web/lib/adminV2/runtime/surface/*`

**Related:** [`runtime-surface-section-map.md`](./runtime-surface-section-map.md) (section ids + reveal/blocking diagnostics) · [`alloy-runtime-specification.md`](./alloy-runtime-specification.md) · [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md)

## Surface VM law

A visible operating surface may **not** be assembled by independent component loaders. Each route
composes a single above-fold **Surface ViewModel** that **owns** surface readiness. Components render
sections; they never decide whether the surface is ready.

```
click / route intent
  ↓
compose Surface ViewModel   (over existing loader / cache / bootstrap outputs)
  ↓
commit surface once          (reveal.canCommit — the one decision per route)
  ↓
patch non-blocking values quietly   (KPI/counts/cards/rail — never re-stage the surface)
```

Data may load asynchronously. **Visible surface ownership may not.** Every above-fold section is
either present in its final placement with snapshot/default content, or hidden behind the single
surface gate — never popped in late, never re-owned, never briefly legacy.

### Relationship to the section map

The Surface VMs and the [Runtime Surface Section Map](./runtime-surface-section-map.md) are two views
of the same contract:

- the **section map** is the per-section registry (owner, data source, `blocking`, `snapshot`,
  `cache`) + `data-alloy-section-id` / `[perf:section]` diagnostics;
- the **Surface VM** is the per-route composition that groups those sections into one committable
  bundle and records what may patch afterward.

`reveal.blockingSectionIds` / `nonBlockingSectionIds` use the canonical section ids, so the VM, the
section map, and the DOM diagnostics always agree.

### Client adapters (not a new runtime layer)

These are **client adapters**: pure functions composed over the *existing* loader, session cache,
operational bootstrap, and reveal gates. They add **no new fetch, no new skeleton layer, and no new
reveal primitive**. `reveal.canCommit` is always the authoritative existing reveal predicate, so
behavior is unchanged and the runtime-flag-off path is preserved. Server-side composition can
replace the adapters later without changing the consumer contract.

### VM shape

```ts
type SurfaceViewModel<TSections> = {
  id: string;
  surface: "shell_nav" | "workspace" | "work_unit";
  version: number;                 // bumped on SHAPE change, not value patches
  ready: boolean;                  // mirror of reveal.canCommit
  warm: boolean;                   // first paint served from a warm source
  source: "bootstrap" | "session" | "cache" | "network" | "default";
  sections: TSections;             // descriptive references to already-loaded data
  reveal: {
    blockingSectionIds: string[];  // above-fold bundle that must be present/seeded
    nonBlockingSectionIds: string[];
    canCommit: boolean;            // the single commit decision = existing reveal gate
  };
  patch: { allowedAfterCommit: string[] }; // sections whose values may change in place
};
```

## ShellNavigationSurfaceViewModel

Code: `web/lib/adminV2/runtime/surface/shellNavigationSurfaceViewModel.ts`. Composed in
`web/app/adminV2/components/Sidebar.tsx`.

Owns: nav items, active route, modal launchers (`inbox`/`processing`/`tasks`/`analytics`), count
snapshots, and collapsed state. The sidebar is mounted **above** the route in `AdminV2Shell`, so it
commits once and never remounts across `/workspace` ↔ `/workspace/work-unit/:slug` navigation.

- **Commits when:** item list exists, active route resolvable, launchers registered. Count slots
  always satisfy their snapshot/default contract (`null` → no badge), so they never block.
- **Patches after commit (`NAV-COUNTS`):** inbox unread, work-item, processing, notification counts.
  Read from the same warm caches the reactive badge hooks write (`useInboxUnreadNavCount`
  sessionStorage; `useOperationalTasksNavCounts` in-memory TTL) — **no duplicate fetch** — and must
  patch in place without late layout shift.
- Diagnostics: `data-shell-nav-ready` / `data-shell-nav-source` / `data-shell-nav-version` on the
  sidebar `<aside>`.

## WorkspaceSurfaceViewModel

Code: `web/lib/adminV2/runtime/surface/workspaceSurfaceViewModel.ts`. Composed in
`web/app/adminV2/workspace/page.tsx`; the page gates on `workspaceSurfaceVm.reveal.canCommit`.

Owns WS-01 resume, WS-02 header, WS-03 health KPI, WS-04 operational pulse, WS-05 process tiles,
WS-06 tile KPI, WS-07 right rail.

- **Commits when** (`reveal.canCommit` = `workspaceRevealGate.above_fold_ready`): WS-02 header
  present and WS-05 process tiles present; WS-03/04/06 occupy their snapshot/default slot.
- **Blocking bundle:** `WS-02`, `WS-05`.
- **Patches after commit:** `WS-01`, `WS-03`, `WS-04`, `WS-06`, `WS-07` (KPI/health/tile counts,
  resume metadata, right rail values) — never `0` as a loading stand-in when the real value is
  unknown; render `—` / neutral default.
- **Warm return:** lifecycle tiles restore synchronously from the module/session snapshot →
  `source: "session"`, `warm: true`, surface reveals immediately (no cold loading-gate flash).

## WorkUnitSurfaceViewModel

Code: `web/lib/adminV2/runtime/surface/workUnitSurfaceViewModel.ts`. Composed in the work-unit
`page.tsx`; the page gates on `workUnitSurfaceVm.reveal.canCommit`.

Owns WU-01 context header, WU-02 KPI, WU-03 work-view pills, WU-04 queue header, WU-05 condensed
queue / stable preparing-empty state, the default operational subject seed, WU-07 Focus Panel
**shell seed**, WU-08 mode-control seed, and WU-12/13/14 rail shell metadata.

- **Commits when** (`reveal.canCommit` = `resolveWorkUnitPageContentReady(...)`): WU-01 header, WU-03
  pills, WU-04 queue header, WU-05 condensed queue (or stable empty/preparing — never full-width
  legacy rows), WU-08 mode seed present; on the cold path the gate also waits for the operational
  surface so WU-07 reveals **with** the queue, never after.
- **Blocking bundle:** `WU-01`, `WU-03`, `WU-04`, `WU-05`, `WU-08`, and `WU-07` **only when a subject
  is selected** (a subjectless lane commits without a Focus Panel).
- **Patches after commit:** `WU-02` KPI values, `WU-12`/`WU-13` rail, `WU-14` BOS, background
  prewarm, and the Focus Panel card payload — see the boundary below.

### Focus Panel card composition boundary

This composition seeds **only** the Focus Panel **shell** (WU-07 subject/header placeholder) and the
mode control (WU-08). Focus Panel **card** composition — System 5 card archetypes/templates/content,
expansion/drill, and the Activity embedded workspace (WU-09 / WU-10 / WU-11) — is **out of scope**
and loads separately *inside* the already-seeded shell after commit. The existing Focus Panel
payload/card loading path is preserved unchanged.

## Ownership consolidation (single authoritative renderer per region)

Runtime V1 closed the long tail of "competing visible owners". For every above-fold region exactly
**one** renderer is authoritative under `NEXT_PUBLIC_ALLOY_OS_RUNTIME`; legacy/fallback owners are
deleted or quarantined behind flag-off:

| Region | Sole runtime owner | Quarantined (flag-off only) |
|--------|--------------------|-----------------------------|
| WU-07 Focus Panel subject identity | clicked-row seed (`opportunityQueuePreviewSeed`) until `focusPanelSubjectResolved` | ref-held `drawerTitle`, `Drawer` legacy `title` block |
| WU-05 queue rows | `CompressedQueueRow` | `LayoutRuntimeQueueRowView` / `CrmCompactQueuePreview` full-width |
| WU-02 / WS-03/04/06 KPI slots | `MetricPlacementRenderer` (+ reserve) | OIP `AlloyOsInlineKpiStrip` / `KpiPulseFallback` |
| Work-unit cold shell | first-commit-gated `WorkUnitWorkspaceColdShell` | re-mount on warm transition |

## Snapshot slot mechanics (KPI / health / tile metrics)

WS-03/04/06 and WU-02 are **snapshot slots** owned solely by `MetricPlacementRenderer`: they occupy
their final placement at commit and patch values in place — never late visual objects, never reflow.
A warm metric-render snapshot cache (`web/lib/metrics/platform/metricRenderBundleCache.ts`) seeds the
renderer synchronously on mount; on a warm navigation/return the prior placement paints immediately
and a background revalidate patches values **without blanking the slot** (a value-less fresh bundle
never replaces populated value-bearing items — `metricRenderItemsHaveValues`). The cold first paint
shows a stable `loadingReserve` (`—`), never an empty space or `0`. The OIP strip is **not** a
competing renderer in runtime mode — it is quarantined to flag-off. Health chips render from
`computeWorkspaceHealthSummary({})` (all `unknown`) at commit and only patch status in place.

## Queue-click contract (Focus Panel shell owns subject identity)

On a WU-05 row click: the selected row changes immediately, the **Focus Panel shell subject changes
synchronously from the clicked-row seed**, then cards hydrate inside the already-switched shell; stale
requests are ignored and the latest click wins. Visual subject identity never waits on the VM payload.
See the [queue-click reliability law](./runtime-surface-section-map.md#queue-click-reliability-law-wu-05).

Three reinforcing guarantees make the seed the sole identity owner:

1. **Synchronous subject commit** — `openDrawerModelSwap` (`web/contexts/AdminDrawerContext.tsx`)
   calls `applyDrawerTargetNavigation(...)` at swap **start**, so `drawer.id` +
   `opportunityQueuePreviewSeed` update before the async VM preload, not after it commits.
2. **Seed-first header** — the Focus Panel header renders from the seed whenever the displayed
   payload's subject (`record.id`) ≠ the selected subject (`drawer.id`), covering both initial open
   and row→row switch (`resolveFocusPanelSubjectReveal`, `web/lib/admin/drawer/focusPanelSubjectReveal.ts`).
3. **Legacy title unreachable** — in runtime Focus Panel mode the `Drawer` `title` prop is `null`
   while a subject is selected, so the legacy `drawerTitle` block can never paint a stale subject.

## Future extension to Settings surfaces

The same pattern extends to configuration/Settings surfaces: compose a `SettingsSurfaceViewModel`
whose `reveal.canCommit` is the settings hub's existing readiness, list the settings sections as the
bundle, and patch live values after commit. Adopt it when a Settings surface shows staggered loading;
do not pre-build it speculatively.

---

## Presentation Runtime V3 — surface registry + nested surfaces (July 2026)

The canonical composition model is frozen in [`experience-builder-v3-universal-surface-composition.md`](./experience-builder-v3-universal-surface-composition.md): `Surface → Canvas → Component → Evidence Group → Composition Item`, a **Card is one Component type**, and **Expanded = Open Surface** (nested via `openSurfaceId`).

- **Surface registry** — `web/lib/platform/surfaceComposition/surfaceRegistry.ts` catalogs `SurfaceSpec`s and resolves the `openSurfaceId` graph with cycle-safe walking. This is the target single registry the Surface Library should read from (retiring the two hand-synced catalogs — deferred).
- **Nested surfaces** — Children Surface + Financial Configuration Surface are registered surfaces, editable in /surfaces (PR #68) and persisted per surface id.

Runtime consumption of nested surfaces is deferred — see [`presentation-runtime-carry-forward.md`](./presentation-runtime-carry-forward.md).
