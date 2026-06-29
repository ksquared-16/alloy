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
| `AdminV2WorkspaceClientProviders` (8 providers) | REMOVE (impl detail) | Providers are implementation detail (fail the React-Disappearance Test). Collapsing 8→1 value is a migration tactic; the concept is **Runtime Services**, not a provider. |
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

## Runtime migration model: Prove → Merge → Delete

Migration does **not** accumulate flags or optional modes. Every milestone runs the same lifecycle and **ends by deleting the path it replaced**:

1. **Prove** the canonical path (behind a temporary flag only if needed).
2. **Merge** the canonical path.
3. **Prove parity** with the old path.
4. **Delete** the old path.
5. **Remove** the migration flag.
6. **Document** the canonical runtime.

A temporary flag is a *migration tool* (see the **Canonical Runtime Rule** in the north star), used to de-risk steps 1–3 and **removed at step 5**. **If a milestone cannot name what it deletes and which flag it removes, it is not done — it has only added a mode.** Roadmaps that accumulate flags are a smell; each milestone below names its delete target and flag-removal.

## 11. Migration roadmap (today → north star)

Each milestone makes one path canonical, quarantines/deletes the path it replaces, and removes any temporary flag at parity. Ordered so each unlocks the next.

| Milestone | Makes canonical | Quarantines / deletes (delete-eligible) | Temporary flag → removed |
|---|---|---|---|
| **M0** (done / in flight — PR #9) | server-seed seam (Slices 1–3): `/workspace` tiles + work-unit slug server-resolved | client first-paint effects become redundant on the seeded path | additive — no new flag |
| **M1 `workspaceVM` complete** | workspace **Route VM** (tiles + KPIs + context) server-composed; reveal once | **delete** `WorkspacePageLoadingGate` + workspace client first-paint effects | seed flag (if any) → removed at parity |
| **M2 `workUnitVM` complete** | work-unit **Route VM** (identity + context + KPIs + queue + Focus Panel frame) | **delete** `WorkUnitWorkspaceColdShell`; quarantine then delete the client slug/bootstrap effects | → removed at parity |
| **M3 Runtime Services** | renderers consume Route VM + Runtime Services | **delete** the 8 nested providers (collapse → then remove the nesting) | provider collapse is a tactic, not a flag |
| **M4 Runtime Cache** | one `(org,scope,route,entity)` namespace + SWR | **delete** duplicate caches (lifecycle ×2, KPI ×2, OIP/metricRenderBundle, summaries) | unified-cache flag → removed at parity |
| **M5 Persistent Shell + Nav Coordinator** | one Operational Shell across workspace↔work-unit; commit-first | **delete** per-route layouts' duplicate chrome + the residual return-gate | shell flag → removed at parity |
| **M6 Save Coordinator (non-drawer first)** | optimistic + scoped invalidation | **delete** 6 non-drawer `router.refresh` sites | per-site, no global flag |
| **M7 Warm Coordinator** | one intent→warm API | **delete/absorb** the 31 ad-hoc prefetch utils | absorbed — no flag |
| **M8 Route VM → Settings + Analytics** | settings/analytics routes produce Route VMs | **delete** settings legacy-client self-skeletons (after parity); retire `ConfigurationPatternPlaceholder` | per-family flag → removed at parity |
| **M9 (parity-gated)** | drawer VM bodies; canonical condensed queue only | **delete** `AdminEntityDrawerLegacy` bodies + its 30 `router.refresh`; **delete** legacy queue-row path; decompose the 7,780-LOC compat page | drawer kill-switch → removed after the editing substrate lands |
| **M10 Live Patch Channel** | real-time as VM patches | **delete** any re-fetch-on-update paths | additive |

**End state is canonical-path-only.** Then every new module (Billing, Scheduling, Attendance, Processing, Parent, Staff) is built **directly on the canonical Route VM + shell + cache + save contract** — no per-module runtime, no new permanent flags.

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
| **Big-bang temptation** (rewrite the runtime at once) | **Prove → Merge → Delete** per milestone; each ships, proves parity, then deletes the old path and removes its temporary flag before the next begins. |
| **Flags becoming permanent modes** | Every milestone names what it deletes + which flag it removes; a milestone that only adds a mode is not done. Audit for lingering flags at each merge. |
| **Reveal/cache-key/known-empty regressions** | Protected doctrine + locked runtime suite on every VM/cache/reveal milestone; cache-key determinism tests. |
| **Server-compose latency** (moving fetches server-side could delay first byte) | Parallel compose in the existing server bundle; stream non-primary sub-sections; warm the next VM; measure with the existing perf marks (RUM) before/after. |
| **Provider collapse touches every consumer** | Keep selector-hook names as thin shims over the one value; codemod; no call-site churn. |
| **Real-time / interactive surfaces break the VM model** | Designed-in escape hatches: Live Patch Channel (real-time) + deferred sub-sections (compute-heavy) + editor-owns-local-state (interactive). Validated in north-star §11. |
| **Evidence-test churn** (486 source-reading tests fight refactors) | Parallel test-modernization track (behavior tests for reveal/save/cache/nav); don't block runtime milestones on it; stash-verify pre-existing baseline each slice. |
| **Settings/legacy-admin coupling** (19 importers) | M8 introduces a settings Route VM behind an adapter; legacy clients replaced, not deleted, until parity. |
| **Cross-team divergence** (other modules built the old way meanwhile) | This doc is the north star; new modules must build on the Route VM contract — enforce in review. |

---

## Acceptance criteria for these docs

After this pass, the runtime docs make all of the following unambiguous:

- [x] **Runtime flags are temporary only** — migration / rollback / rollout; never a permanent product mode (Canonical Runtime Rule).
- [x] **Canonical paths replace old paths** — the end state is canonical-path-only, not `legacy + new + flag`.
- [x] **Old code is deleted after parity** — every milestone names its delete target (Prove → Merge → Delete).
- [x] **React providers / hooks / contexts / Suspense / Next layouts are implementation detail** — they fail the React-Disappearance Test.
- [x] **Route VM is the enduring runtime unit**; Surface VM merges into it.
- [x] **Runtime Services are the conceptual architecture** (Cache · Save · Nav · Warm · Reveal · Focus); a provider is one impl.
- [x] **Surface Renderers are pure consumers of the Route VM** — they own nothing.
- [x] **The runtime gets simpler over time** — it converges to one system; it does not accumulate optional modes.
- [x] **Future work becomes faster** because every module inherits one canonical runtime (north-star "Why this consolidation matters").

## What must never regress
See north-star §12 — the seven invariants (one reveal · stable chrome · no visible construction · one owner · continuous navigation · continuous save · correctness invariants). Every milestone is acceptance-tested against them.

## Scope
**No code in this sprint.** Architecture + migration map for review. On approval, **M1 (`workspaceVM` complete)** is the entry point, continuing PR #9.
