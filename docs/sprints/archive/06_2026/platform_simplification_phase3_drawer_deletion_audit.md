# Platform Simplification — Phase 3 Legacy Drawer Deletion Audit

Phase 2 hardening confirms **Opportunity**, **Person**, and **Child** drawers on canonical operator paths (`/workspace`, `/workspace/work-unit/:slug/:recordId`) route through VM runtimes when hard-cutover gates are enabled. Phase 3 deletes the corresponding legacy branches from `AdminEntityDrawerLegacy.tsx` once cutover is permanent.

## VM routing (canonical — do not delete)

| File | Role |
|------|------|
| `web/components/admin/AdminEntityDrawer.tsx` | Entry router: VM for opp/person/child; legacy for all other entity types |
| `web/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute.ts` | `resolveVmDrawerRuntimeRoute`, `coerceAdminV2VmDrawerRoute`, `shouldBlockLegacy*Branch` |
| `web/lib/admin/canonicalAdminRoutes.ts` | `isCanonicalDrawerHostPath` includes `/workspace/*` |
| `web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx` | Opportunity VM shell |
| `web/components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx` | Person + child VM shell |

**Invariant (Phase 3):** On canonical drawer hosts with cutover enabled, `AdminEntityDrawer` and `AdminEntityDrawerLegacy` quarantine VM-backed entities via `legacyDrawerMustNotRenderVmBackedEntity`. Kill switches remain for emergency rollback.

## Phase 3 implementation (complete)

| Change | File |
|--------|------|
| Quarantine helper | `web/lib/adminV2/viewModel/drawer/vmRuntime/legacyDrawerVmEntityQuarantine.ts` |
| Router guard | `web/components/admin/AdminEntityDrawer.tsx` |
| Legacy null-render + prefetch skip | `web/components/admin/AdminEntityDrawerLegacy.tsx` |
| Regression tests | `web/tests/adminV2/viewModel/platformSimplificationPhase3DrawerQuarantine.test.ts` |

Kill switches (`NEXT_PUBLIC_ADMINV2_*_DRAWER_VM_KILL_SWITCH`) **retained** — they are the only supported rollback path to legacy opp/person/child drawers.

## Phase 3 deletion targets — `AdminEntityDrawerLegacy.tsx` (future trim)

Approximate line regions (file ~19.6k lines). Delete only after VM cutover kill switches are removed.

### Opportunity (`drawer.type === "opportunities"`)

| Region (lines) | Description |
|----------------|-------------|
| 3230–3278 | Bootstrap fetch effect — early return when hard cutover / VM open |
| 3398–3577 | Background hydrate guards skipping legacy when VM authoritative |
| 4873+ | Edit/save paths gated by hard cutover |
| 5529–5629 | Status defs effect — VM pin / hard cutover deferral |
| 5923–5958 | `startEdit` opportunity form seeding |
| 9720+ | Legacy fetch skip when hard cutover |
| 12367–12440 | `opportunityInquiryWorkflowHeaderStatus` VM status chrome |
| 12542+ | Render guards for opportunity drawer body sections |
| 15879, 16102 | Residual `/admin/workflows` links inside legacy opportunity tabs |
| 19486–19540 | `AddPersonModal` / opportunity action modals tied to legacy shell |

Also search: `opportunityDrawerBootstrapLegacy`, `opportunityDrawerVmFirstPaintSettled`, `OpportunityDrawer*` component imports in legacy render tree.

### Person (`drawer.type === "persons"`)

| Region (lines) | Description |
|----------------|-------------|
| 2914–2962 | Cache hit / seed snapshot apply for persons |
| 3281–3296 | VM open ref early return (skip legacy fetch) |
| 3310–3330 | Person VM cutover effect |
| 3049–3064 | Person-related state resets |
| 3160–3220 | Person fetch logging / legacy entity fetch |
| 5525–5527 | Status fetch skip for existing person drawers |
| 7823–8085 | Person drawer tab panes and related-people sections in legacy render |
| 5525+ | `drawer.type === "persons"` render branches in main return JSX |

Also search: `personDrawerViewModelOpenRef`, `PersonDrawer*`, `isPersonDrawerSeedRecord`.

### Child (via person drawer with child emphasis)

| Region (lines) | Description |
|----------------|-------------|
| 3285–3290 | `isChildDrawerVmOpen` + `childDrawerHardCutoverEnabled` fetch skip |
| 3322–3324 | Child VM cutover active check in person VM effect |

Child UI in legacy file is interleaved with person branches; Phase 3 should delete child presentation paths once `PersonsDrawerVmRuntime` owns all child surfaces.

### Shared infrastructure to **keep** until non-VM entities migrate

Legacy must remain for: `jobs`, `contacts`, `customers`, `vendors`, `locations`, `payments`, `redemptions`, `new` record creation flows, and non-cutover entity types.

## Supporting legacy modules (Phase 3+ follow-ups)

These are not in `AdminEntityDrawerLegacy.tsx` but become dead after legacy opp/person/child removal:

- `web/lib/admin/opportunityDrawerBootstrapClient.ts` (legacy bootstrap path)
- `web/lib/admin/drawer/composedDrawerPayload/*` (composed person path if fully VM)
- Legacy person fetch helpers referenced only from `AdminEntityDrawerLegacy`

## Dept / UUID drawer URL sync (out of Phase 3 scope)

Phase 2 intentionally does **not** expand dept/uuid drawer URL sync on operator slug routes. Legacy dept routes under `app/adminV2/workspace/dept/...` remain compat-only.

## Acceptance (Phase 3)

- [x] VM-only routing for Opportunity/Person/Child on `/workspace` and `/admin` drawer hosts (cutover default on)
- [x] Legacy monolith quarantined — not deleted; unreachable branches documented below
- [x] Unmigrated entities (jobs, locations, vendors, …) still use legacy drawer
- [x] Kill switches retained for emergency rollback
- [ ] Physical deletion of dead legacy branches (Phase 4+)
