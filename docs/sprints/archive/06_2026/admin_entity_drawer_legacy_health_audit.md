# AdminEntityDrawerLegacy — Repo Health & Performance Audit

**Sprint:** Performance Pass 2B / Platform simplification follow-up  
**Date:** June 2026  
**File:** `web/components/admin/AdminEntityDrawerLegacy.tsx`

## Executive summary

`AdminEntityDrawerLegacy.tsx` is the largest single compile unit in the Alloy web app. At **19,621 lines** and **~1.29 MB** (~1,323,465 bytes), it exceeds Babel's **500 KB deoptimization threshold**, increasing build time, HMR latency, and IDE tooling cost.

On canonical `/workspace` operator paths, **Opportunity**, **Person**, and **Child** drawers are quarantined and routed to VM runtimes when hard-cutover gates are enabled. The legacy file still compiles in full and remains required for non-VM entities, `id === "new"` creation flows, and kill-switch rollback.

This pass does **not** rewrite or delete legacy drawer code. It establishes a baseline health test, documents extraction packages, and freezes communications boundaries during Comms V2.

## Size signal (baseline)

| Metric | Value |
|--------|------:|
| Lines | 19,621 |
| Bytes | 1,323,465 (~1.29 MB) |
| `import` statements | ~243 |
| `useState` | ~92 |
| `useEffect` | ~129 |
| `useLayoutEffect` | ~6 |
| `useCallback` | ~44 |

**Signal:** Babel deoptimizes modules above 500 KB → slower dev builds and HMR. Not the primary runtime blocker for `/workspace` VM drawers, but a sustained repo-health debt marker.

**Guardrail test:** `web/tests/admin/drawer/adminEntityDrawerLegacyHealth.test.ts`

## Active vs quarantined areas

### Active entities (legacy still renders)

- Jobs
- Schedules
- Contacts
- Customers
- Vendors
- Locations
- Payments
- Workflows
- Service offerings / addons / templates
- `id === "new"` creation flows

### Quarantined on canonical workspace (VM runtime)

- **Opportunity** — `OpportunityDrawerVmRuntime` when hard cutover enabled
- **Person** — `PersonsDrawerVmRuntime` when hard cutover enabled
- **Child** — child emphasis via person VM runtime

Quarantine: `legacyDrawerMustNotRenderVmBackedEntity` returns `null` for VM-backed entities on canonical hosts. Legacy opportunity/person/child branches still exist in source (~40–50% of file volume) and are compiled.

### Communications boundary freeze

Do **not** modify communications integration inside `AdminEntityDrawerLegacy.tsx` during Comms V2. Treat comms tabs, thread fetch, and composer wiring as a frozen boundary until Comms V2 closeout.

## Responsibility clusters

| Cluster | Approx. scope | Notes |
|---------|---------------|-------|
| Drawer shell / chrome | Header, tabs, close, width, pinned state | Shared across entities |
| Entity fetch + hydrate | Per-type bootstrap, background refresh | Heavy `useEffect` density |
| Opportunity (legacy) | Forms, status, inquiry workflow | Quarantined on workspace |
| Person / child (legacy) | Tabs, related people, seed snapshots | Quarantined on workspace |
| Jobs | Full job drawer body | Active — highest-value first extraction |
| Secondary entities | contacts, customers, vendors, locations, payments | Active |
| Workflows / templates | Config surfaces | Active |
| Creation flows | `id === "new"` | Active |
| Communications | Thread/composer integration | **Frozen** |
| Modals / actions | Add person, workflow links, etc. | Mixed; opp modals quarantined |

## Package-by-package cleanup plan

### PKG-00 — Baseline (this pass)

- Health audit doc (this file)
- `adminEntityDrawerLegacyHealth.test.ts` with growth guardrails
- No behavior changes

### PKG-01 — Pure helpers / skeletons

Extract from pre-component region only (no hooks, no reveal gates):

- `web/lib/admin/drawer/legacy/legacyDrawerFieldUtils.ts`
- `web/lib/admin/drawer/legacy/legacyDrawerFetchUtils.ts`
- `web/lib/admin/drawer/legacy/legacyDrawerSkeletons.tsx`
- `web/lib/admin/drawer/legacy/legacyDrawerPerfLogs.ts`

**Risk:** Low if strictly pure. Skip if any hook or entity pipeline coupling.

### PKG-03 — Job body

Extract job-specific render + fetch into `JobDrawerLegacyBody.tsx` (or similar). Keep shell routing in legacy entry until job VM exists.

### PKG-04 — Secondary entities

Contacts, customers, vendors, locations, payments — one package per entity family after job body proves pattern.

### PKG-05 — Opportunity quarantine package

Move legacy opportunity branches behind explicit `LegacyOpportunityDrawer` module. Delete only after VM cutover kill switches removed (Phase 3).

### PKG-06 — Person quarantine package

Same for person/child legacy branches → `LegacyPersonDrawer` module.

### PKG-08 — Chunking / lazy entry

Dynamic `import()` for non-workspace legacy surfaces; split compile units below 500 KB where feasible.

## Test matrix

| Area | Test |
|------|------|
| Baseline size | `adminEntityDrawerLegacyHealth.test.ts` |
| VM quarantine | `platformSimplificationPhase3DrawerQuarantine.test.ts` |
| Drawer routing | `composedDrawerPayload.test.ts`, drawer determinism suite |
| Opportunity VM | `linkedDrawerVmWarmPaths.test.ts` |
| Person open | `openViewPersonFromOpportunity.test.ts` |
| Runtime reveal | `drawerAboveFoldCoordinatedReveal.test.ts` (when touching reveal) |

## Constraints

- Do not rewrite `AdminEntityDrawerLegacy.tsx` wholesale
- Do not touch communications integration during Comms V2
- Do not remove kill switches
- Do not delete opportunity/person legacy code until Phase 3 cutover
- Do not change drawer UX behavior without explicit approval
- VM routing in `AdminEntityDrawer.tsx` remains canonical for workspace

## Recommended first sprint

1. **Baseline test** — merge health guardrail (PKG-00)
2. **Helpers / skeletons** — PKG-01 only if extraction is clearly pure
3. **Job body** — PKG-03 after design review; highest active-entity value
4. Defer PKG-05/06 until kill switches retired

## Related docs

- `docs/sprints/archive/06_2026/platform_simplification_phase3_drawer_deletion_audit.md`
- `docs/system/adminv2-runtime-performance-doctrine.md`
