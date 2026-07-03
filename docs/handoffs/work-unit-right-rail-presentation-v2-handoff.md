# Handoff — Work Unit right rail shows no configured actions

**To:** Presentation Runtime V2 thread
**From:** Action Placement Runtime hardening (investigation-only branch `claude/action-placement-right-rail`)
**Date:** 2026-07-03
**Status:** ✅ **RESOLVED by Presentation Runtime V2** (see §7). Root cause was confirmed against staging DB + live render path; the fix belonged to Presentation Runtime V2 and has now been implemented.

---

## 1. Root cause (confirmed)

The **Action Placement Runtime is functioning correctly**. Action definitions exist, placements exist, the resolver returns the correct actions, and the Work Unit resolution includes `create_lead` + `schedule_tour`. Verified end-to-end against staging.

The failure was entirely in the **presentation layer**: `RightRailSurface` in Presentation Runtime V2 was a stub — `WorkUnitSurface` rendered `<RightRailSurface />` with **no children**, and `RightRailSurface` rendered a `hidden`, zero-footprint `<aside>` when `children == null`. The resolved right-rail actions were **produced by the runtime but never consumed by the presentation**.

**Not the cause** (all verified working): Business Processes · Actions · Action Placements · Resolver · Work Unit runtime · Enrollment runtime.

---

## 2. Data path (already works, verified)

```
GET /api/admin/actions/right-rail-bundle?department_id=&work_unit_id=&surfaces=work_unit,right_rail
  → loadRightRailActionsBundleServer(...)   → resolveActionsForContext × surfaces
  → mergeResolvedActionsBySlot → rightRailResolvedFromActionsPayload → { actions: ResolvedActionForClient[] }
```

Staging evidence (WU "New Leads"): flattened rail = `["create_lead","schedule_tour"]` (both `open_form`, `display_style:"button"`).

---

## 7. Resolution (Presentation Runtime V2 — 2026-07-03)

The missing consume slice is now implemented. Nothing new was built in the action system; the existing resolver, payload, mapping, and execution runtime are reused.

**What shipped**

1. **Source the lane** — `useWorkUnitSurfaceRuntime` fetches the resolved actions directly from the `right-rail-bundle` route via a new client fetcher `lib/workspace/fetchWorkUnitRightRailResolvedActions.ts` (`surfaces=work_unit,right_rail`, deduped + 30s TTL) and exposes them on the surface model as `model.rightRailActions: ResolvedActionForClient[]`. Loading the lane directly (rather than off the bootstrap) resolves the **§5 defer caveat** — the rail is never empty on a cold process cache.
2. **Render through RR.SURFACE** — `WorkUnitSurface` passes the actions as children to `RightRailSurface` when non-empty (empty → the existing zero-footprint hidden anchor). A new presentation component `components/presentation/rightRail/WorkUnitRightRailActions.tsx` renders one control per action (`display_style:"menu_item"` → secondary, else primary), using the `.motion-control` acknowledgement primitive. The rail `motion-reveal`s in when its actions resolve (reduced-motion → opacity settle).
3. **Execute through the existing runtime** — clicks call `applyRegistryResolvedActionClient` with `context:{ surface:"work_unit", department_id, work_unit_id }`. `create_lead` opens `CreateLeadCommandSurface`; `schedule_tour` / record-scoped actions target the currently-open Focus Panel record (the WU auto-opens the first record) and route through the existing tour-schedule modal listener; no record selected → the runtime's legible "select a record" path. **No new resolver, no new action runtime, no hardcoded actions, no special-casing.**

**Verification:** `typecheck:build` 0 errors; component test `tests/presentation/rightRail/workUnitRightRailActions.test.tsx` proves render + execution (work_unit context, entity target, reused runtime); dev server compiles the route + presentation modules and the bundle route executes to its auth gate. Live end-to-end render requires an authenticated Supabase backend (not available in the implementing session).

**Files added/changed**
- `lib/workspace/fetchWorkUnitRightRailResolvedActions.ts` (new)
- `components/presentation/rightRail/WorkUnitRightRailActions.tsx` (new)
- `lib/presentation/runtime/types.ts` (`model.rightRailActions`)
- `lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts` (fetch + expose)
- `components/presentation/workUnit/WorkUnitSurface.tsx` (pass children)
- `components/presentation/rightRail/RightRailSurface.tsx` (`motion-reveal`)

---

## 6 → deferred cleanup (dead code)

The handoff's §6 dead-code list (`buildWorkUnitAboveFoldRenderModel`, `resolvedOperationalActionsRail`, `reserve_actions_rail` gate, `composeWorkUnitViewModel` shadow path, `departmentReservesOperationalActionsRail`, the orphaned `workspace-root-bundle` consumer, etc.) is **deferred to a follow-up**, per this handoff's own gate: *"Do not remove anything until the configured right rail actions render and execute correctly through the new path."* Live render confirmation requires an authenticated environment; once verified in staging, remove the listed paths (re-grep first — several are reachable only through the `routeShellPipeline` barrel). Two stale source-string tests (`rightRailPersistenceDoctrine.test.ts` cases reading the already-deleted `WorkspaceRootActionsRail.tsx` / `WorkUnitWorkspace.tsx`) also retire with that cleanup.

## Secondary data-cleanup (separate, does not block)

The operator's `create_lead` `right_rail`-surface placement is scoped to inactive dept `04958a78` ("Enrollment legacy"); repoint to the live dept `3933ac47` or `null` (org-wide) so the `right_rail` config is honored. Moot for the symptom (`create_lead` resolves via the `work_unit` lifecycle placement).
