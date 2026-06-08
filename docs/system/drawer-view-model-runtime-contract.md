# Drawer View Model runtime contract

**Status:** Active — Opportunity validated on staging; Person/Child extend the same pattern.

## Purpose

Server-composed **Drawer View Models (VMs)** make first paint self-contained: the client paints from one authoritative payload and does not run legacy bootstrap / staged hydrates for data the VM already owns.

This doc defines the **reusable runtime contract**. Entity-specific first-viewport dependency lists live in per-drawer contract modules (e.g. `opportunityDrawerFirstViewportContract.ts`).

## Feature flags (per entity)

| Entity | Control | When VM runs |
|--------|---------|--------------|
| Opportunity | **Default on** in code (`opportunityDrawerHardCutoverGate.ts`) | AdminV2 opportunity drawer uses VM unless kill switch |
| Opportunity rollback | `NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH=1` or `FORCE_LEGACY_OPPORTUNITY_DRAWER = true` | Legacy opportunity drawer |
| Person (parent/generic) | `NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM` | VM open + hard cutover (default off) |
| Child (person child chrome) | `NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM` | VM open + hard cutover (default off) |

`NEXT_PUBLIC_ADMINV2_DRAWER_VM` is **not** used for opportunity routing (deprecated for that path). Person/child flags default off.

## Hard cutover behavior

When a drawer VM flag is enabled for an open:

1. **Open must succeed via VM** — `GET /api/admin/v2/view-models/drawer/{entity}/[id]`.
2. **No silent fallback** to legacy bootstrap, `drawer_primary`, `record_header`, or background `full` hydrate.
3. **Explicit failure** — coordinator or drawer surfaces a user-visible error; logs `[drawer-vm-cutover:hard_cutover_failure]`.
4. **Legacy only when flag is false** — existing composed-open / entity GET paths unchanged.

Opportunity reference: `loadOpportunityDrawerComposedOpen` → `throwOpportunityDrawerViewModelHardCutoverFailure`.

Shared failure shape: `DrawerViewModelHardCutoverError` in `web/lib/adminV2/viewModel/drawer/drawerViewModelHardCutover.ts`.

## First-paint contract

Generic types: `web/lib/adminV2/viewModel/drawer/firstPaintTypes.ts`

```typescript
DrawerFirstPaintContract<TKey, TSlot> {
  settled: boolean;           // all first_paint_required deps ready or known-empty
  viewport_slots: TSlot[];  // UI regions in first viewport (entity contract)
  dependencies: DrawerFirstPaintDependencyState<TKey>[];
  data: Partial<Record<TKey, unknown>>;  // authoritative payloads
  deferred: TKey[];         // explicitly past first paint
  background: TKey[];       // may refresh invisibly after paint
}
```

**Settlement rule:** `settled === true` only when every dependency with `disposition: "first_paint_required"` has `status: "ready"` or `status: "empty"`.

**Entity contract modules** declare what the *current* first viewport needs (not a settings-driven layout engine):

- Opportunity: `opportunityDrawerFirstViewportContract.ts`
- Person: `personDrawerFirstViewportContract.ts`
- Child: `childDrawerFirstViewportContract.ts`

When first-viewport content changes, update the entity contract — do not add client refetch gates for VM-owned data.

## Compose → preload → apply → pin

### Server compose

1. Load entity record + first-viewport dependencies (parallel where possible).
2. Build `first_paint` from entity first-viewport contract.
3. Set `structureSettled: true` only when above-fold structure and `first_paint.settled` are satisfied.
4. Return VM JSON with `generation`, `compose_version`, `timing`.

### Preload

`build*DrawerOpenPreloadFromViewModel` maps VM → legacy-shaped preload so existing drawer chrome can consume it:

- `openPath: "view_model"`
- `viewModel` — full VM retained for apply/pin
- `primaryEntity` / paint record — `_record_surface: "full"` (or entity equivalent)
- Entity-specific bootstrap-shaped fields where legacy expects them (Opportunity only today)

Type guard: `isDrawerViewModelPreload(preload)` / entity-specific `is*DrawerViewModelPreload`.

### Apply (AdminEntityDrawer)

On consume preload (`useLayoutEffect`):

1. Pin VM refs (`*DrawerViewModelRef`, `*DrawerViewModelOpenRef`).
2. Set `*DrawerVmFirstPaintSettled` from `first_paint.settled`.
3. Seed client state from `first_paint.data` (status defs, tour bookings, etc.) — **no refetch** for settled deps.
4. Pin pipeline / shell from VM where applicable (Opportunity).
5. Mark legacy hydrate flags satisfied without network.
6. Log `[drawer-vm-cutover:drawer_apply]`.

### Pin

While VM open is active, legacy paths check VM refs + cutover gate and **skip**:

- Bootstrap inflight fetch
- `drawer_primary` / background `full` hydrate
- `record_header` client resolve
- Post-open fetches for dependencies settled in VM

Opportunity gates: `opportunityDrawerHardCutoverEnabled()` + `opportunityDrawerViewModelOpenRef`.

## Background refresh

After first paint, **scalar** channels may refresh invisibly (task status, scheduled sends, readiness). VM exposes `background_refresh.allowed`.

Background refresh must not:

- Change layout / tabs / section order
- Clear valid displayed data before replacement is ready
- Block warm reopen

## Observability

Client logs (never throw): `[drawer-vm-cutover:{event}]` via `safeLogDrawerViewModelCutover`.

Events: `open_attempt`, `open_committed`, `fallback`, `hard_cutover_failure`, `drawer_apply`, `primary_hydrate_skipped`.

Payload includes `entity_type`, flag snapshot, `open_path`, `pipeline_pinned`.

## Adding a new drawer type

1. Define `*DrawerFirstViewportContract` — current first viewport slots + dependency keys.
2. Implement `compose*DrawerViewModel` + API route.
3. Implement `load*DrawerViaViewModel` + `build*DrawerOpenPreloadFromViewModel`.
4. Add feature flag + hard cutover gate.
5. Wire apply/pin + legacy blocks in `AdminEntityDrawer`.
6. Tests: contract, composer, load, cutover, apply gates.

Do not invent parallel preload/coordinator systems — extend this contract.

## Related

- AdminV2 runtime performance (protected): `adminv2-runtime-performance-doctrine.md`
- Legacy opportunity first-paint predicates: `web/lib/admin/drawer/opportunityDrawerFirstPaintContract.ts`
- Card 3 drawer performance registry: `web/lib/admin/drawer/drawerPerformanceContract.ts`
