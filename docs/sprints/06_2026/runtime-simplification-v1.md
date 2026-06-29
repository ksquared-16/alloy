# Runtime Simplification V1 — Architecture Sprint

**Date:** 2026-06-29 · **Author:** Claude Code · **Type:** Architecture/migration plan only — **no code, no implementation.**
**North star:** [`../../platform/runtime/final-runtime-architecture.md`](../../platform/runtime/final-runtime-architecture.md) (the target runtime). This doc holds the **simplification matrix, migration roadmap, first milestone, and risks** that get us there.
**Inputs:** runtime doctrine, topology (measured), simplification plan, convergence Phase 2 (PR #9).

> Deliverables 1–9 + 14 (architecture, diagram, ownership, objects, strategies, future-module validation, never-regress) live in the north-star doc. This doc covers deliverables **10 (matrix), 11 (roadmap), 12 (first milestone), 13 (risks)**.

---

## 10. Simplification matrix (every current runtime object)

Classes: **KEEP · MERGE · REMOVE · REPLACE · SERVER · CLIENT · VM · UNKNOWN.**

| Current object | Class | Why |
|---|---|---|
| Next route segment | KEEP | identity + access only |
| `workspace/layout.tsx`, work-unit `[slug]/layout.tsx` (server) | KEEP → SERVER | become the Route VM composition boundary |
| `AdminV2Shell` (chrome) | KEEP (one) | the Operational Shell; must persist across routes (stop remount) |
| `AdminV2Shell` SystemCanvas branch | REMOVE | unreachable for operational routes |
| `AdminV2WorkspaceClientProviders` (8 providers) | MERGE → 1 | one `RuntimeProvider` value |
| `AdminViewerTimezoneProvider` + `AdminOrgOperationalTimezoneProvider` | MERGE | one `session.timezone` |
| `WorkspaceOrgProvider`, `AdminVerticalProvider`, `EntityLabelsProvider`, `AdminAuthProvider` | MERGE → VM/session | server-resolved fields, not contexts |
| `OperationalModeEntryProvider` | REPLACE → coordinator state | behavior, not a provider |
| `WorkspaceFirstPaintSeedProvider` (Slice 2) | MERGE → VM | folds into `vm.firstPaint` |
| `AdminDrawerProvider` / drawer open-state | KEEP → Focus controller | one focus/open-state controller |
| Client-composed workspace/work-unit "Surface VM" | MERGE → Route VM (SERVER) | composed server-side now |
| `workspace/page.tsx` client first-paint effects (departments, placements, lifecycle) | SERVER | into the Route VM (Slice 2 started) |
| `WorkUnitSlugRouteHost` client slug resolve | SERVER | into the layout (Slice 3 done) |
| Compat `dept/.../work-unit/[workUnitId]/page.tsx` (7,780 LOC) | REPLACE → decompose | Route VM + pure section renderers |
| `WorkspacePageLoadingGate` | REMOVE | no gate once VM is complete |
| `WorkUnitWorkspaceColdShell` | REMOVE | dead once server-VM universal (Slice 3 already skips it) |
| `DepartmentWorkspaceColdShell`, `WorkspaceRootColdShell` | REMOVE (now) | zero-importer (Sprint 02 verified) |
| Reveal gates (`*RevealGate`, `resolveWorkUnitPageContentReady`) | KEEP (thin) | one commit decision; stops waiting on client effects |
| 60 cache modules | MERGE → 1 Runtime Cache | `(org,scope,route,entity)` namespace, SWR |
| lifecycle ×2 / KPI ×2 / OIP+metricRenderBundle / summaries dupes | MERGE | one entry each |
| 31 prefetch/warm utils | MERGE → 1 Warm Coordinator | one intent→warm API |
| 36 `router.refresh` saves | REPLACE → Save Coordinator | optimistic patch + reconcile |
| `drawerOperatingSaveCoordinator` | KEEP → generalize | the seed of the platform Save Coordinator |
| `CompressedQueueRow` | KEEP | canonical queue row |
| Legacy queue rows (`LayoutRuntimeQueueRowView`/`CrmCompactQueuePreview`) | REMOVE (after parity) | crm-less branch only |
| `AdminEntityDrawer` → VM runtimes | KEEP | the one Focus Panel runtime |
| `AdminEntityDrawerLegacy` (19,581 LOC) | REPLACE → VM bodies (after parity) | + its 30 `router.refresh` |
| `(proof)/adminV2/layout-proof/*` | REMOVE (quarantine) | dev proof |
| Render orchestration | REMOVE (never build) | rendering is React; renderers are pure |
| Real-time / live data | UNKNOWN → design as Live Patch Channel | VM patch path (north-star §11) |
| `adminV2/actions/*` as canonical command runtime | REMOVE | use `@/lib/platform/commands/*` (already consolidated on staging) |

---

## 11. Migration roadmap (today → north star, incremental + flag-gated)

Each milestone is additive (old path reachable until parity) and gated behind the existing runtime flag. Ordered so each unlocks the next; mirrors the simplification plan's first 5 slices, then generalizes.

| Phase | Milestone | Delivers | Depends on |
|---|---|---|---|
| **M0 (done/in flight)** | Server-seed seam | Slice 1 continuity; Slice 2 `/workspace` tiles; Slice 3 work-unit slug (PR #9) | — |
| **M1** | **`workspaceVM` complete** | workspace Route VM = tiles + KPIs + context, server-composed; removes the workspace gate + client first-paint effects | M0 |
| **M2** | **`workUnitVM` complete** | work-unit Route VM = identity + context + KPIs + queue + Focus Panel frame | M1 (proves the pattern) |
| **M3** | **RuntimeProvider** | collapse 8 providers → 1 value; hook shims keep call sites stable | M1 |
| **M4** | **Runtime Cache** | one `(org,scope,route,entity)` namespace + SWR; merge the duplicate caches | M1–M2 |
| **M5** | **Persistent Operational Shell + Navigation Coordinator** | one shell across workspace↔work-unit; commit-first; no teardown/gate | M2, M4 |
| **M6** | **Save Coordinator (non-drawer first)** | 6 non-drawer `router.refresh` → optimistic + scoped invalidation | M4 |
| **M7** | **Warm Coordinator** | unify 31 prefetch utils behind one intent→warm API | M4–M5 |
| **M8** | **Extend Route VM to Settings + Analytics** | settings routes produce Route VMs (retire legacy-client self-skeletons); analytics deferred sub-sections | M1–M5 |
| **M9 (parity-gated)** | **Drawer monolith → VM bodies + its 30 `router.refresh`; legacy queue-row deletion; compat work-unit page decomposition** | removes the two largest objects (~27k LOC) | editing substrate (Household/Children), M6 |
| **M10** | **Live Patch Channel** | real-time surfaces as VM patches | M2, M6 |

Then every new module (Billing, Scheduling, Attendance, Processing, Parent, Staff) is built **directly on the Route VM + shell + cache + save contract** — no per-module runtime.

---

## 12. First implementation milestone

**M1 — `workspaceVM` complete: `/workspace` reveals once from a server-composed Route VM, no client first-paint effects, no gate.**

- **Why first:** it directly continues PR #9's server-seed seam (Slice 2 already seeds tiles), is contained to one route, and **codifies the Route VM contract** every later milestone and module inherits. Highest leverage, bounded risk.
- **Definition of done:** `/workspace` cold + warm both reveal once with tiles + KPIs + context present from the server VM; `WorkspacePageLoadingGate` unreachable; KPI values patch in reserved slots only; the Route VM type/contract is documented and reused by M2.
- **Proves:** server compose → reveal once → value-patch, end-to-end, on the busiest route — the template for everything else.
- **Gate:** `typecheck:build` + the locked runtime suite + stash-verify "no new baseline failures."

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| **Big-bang temptation** (rewrite the runtime at once) | Strictly additive, flag-gated milestones; each ships and proves before the next. |
| **Reveal/cache-key/known-empty regressions** | Protected doctrine + locked runtime suite on every VM/cache/reveal milestone; cache-key determinism tests. |
| **Server-compose latency** (moving fetches server-side could delay first byte) | Parallel compose in the existing server bundle; stream non-primary sub-sections; warm the next VM; measure with the existing perf marks (RUM) before/after. |
| **Provider collapse touches every consumer** | Keep selector-hook names as thin shims over the one value; codemod; no call-site churn. |
| **Real-time / interactive surfaces break the VM model** | Designed-in escape hatches: Live Patch Channel (real-time) + deferred sub-sections (compute-heavy) + editor-owns-local-state (interactive). Validated in north-star §11. |
| **Evidence-test churn** (486 source-reading tests fight refactors) | Parallel test-modernization track (behavior tests for reveal/save/cache/nav); don't block runtime milestones on it; stash-verify pre-existing baseline each slice. |
| **Settings/legacy-admin coupling** (19 importers) | M8 introduces a settings Route VM behind an adapter; legacy clients replaced, not deleted, until parity. |
| **Cross-team divergence** (other modules built the old way meanwhile) | This doc is the north star; new modules must build on the Route VM contract — enforce in review. |

---

## What must never regress
See north-star §12 — the seven invariants (one reveal · stable chrome · no visible construction · one owner · continuous navigation · continuous save · correctness invariants). Every milestone is acceptance-tested against them.

## Scope
**No code in this sprint.** Architecture + migration map for review. On approval, **M1 (`workspaceVM` complete)** is the entry point, continuing PR #9.
