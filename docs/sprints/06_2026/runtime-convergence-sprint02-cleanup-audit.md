# Runtime Convergence — Sprint 02: Repo Cleanup, Runtime Convergence & Developer Readiness Audit

**Date:** 2026-06-29
**Author:** Claude Code
**Branch:** `claude/runtime-convergence-sprint02-audit` (cut from `origin/staging` @ `fa83113a6`, which includes Sprint 01 PR #2)
**Type:** **Audit only — no code changes.** Do not delete code, do not rewrite pages. Findings classified for a later implementation sprint.
**Baseline gate:** `cd web && npm run typecheck:build` → **clean** at audit time.

**Classification labels:** `KEEP_CANONICAL` · `REPLACE_WITH_CANONICAL` · `QUARANTINE` · `DELETE_NOW` · `DELETE_AFTER_PARITY` · `PRODUCT_DECISION` · `TEST_BASELINE` · `ENVIRONMENT_ISSUE`

> **Evidence confidence.** Findings tagged **[verified]** were confirmed by direct grep/`git ls-files` in this session. Findings tagged **[reported]** come from read-only sub-agent sweeps and should be re-confirmed (especially dynamic imports) before any deletion. No item is deleted in this sprint.

---

## 1. Executive summary

Alloy's operator runtime is **architecturally converged** (View-Model-first; one Focus Panel runtime; condensed queue is canonical) and Sprint 01 closed two real defects. The remaining problems are **not architectural** — they are **accumulation**: a 19.5k-line legacy drawer monolith, ~10+ verified zero-importer components, tracked build artifacts, ~486 source-reading "evidence" tests (28% of the suite) that lock markup, several effectively-dead-but-intentional flags, inconsistent adoption of the *existing* dedupe/prefetch/save primitives, and 6+ `router.refresh()` full-remount save paths.

The biggest **developer-readiness** drag is **naming-layer sprawl in code** (drawer vs Focus Panel vs `subjectSurface` shims vs `vmDrawer` vs `EntityDrawerOperatingShell`/`FocusPanelShell` aliases) and **load-bearing `legacy-admin` coupling** (19 adminV2 files import legacy-admin clients; 73 legacy-admin pages still routable). Docs are unusually good and governed, but `web/README.md` is stale boilerplate and there is no `web/.env.example` or one-command verify.

The safe path is **subtractive, parity-respecting cleanup**: untrack artifacts, delete verified dead components, retire/rewrite a batch of evidence tests, and **uniformly apply the primitives that already exist** — not new abstractions.

---

## 2. Current repo / runtime health score

| Dimension | Score | Rationale |
|-----------|------|-----------|
| Runtime architecture (convergence) | **8.5 / 10** | VM-first, one Focus Panel, condensed queue canonical. Residual legacy queue-row path + drawer monolith remain. |
| Loading / navigation feel | **7 / 10** | Reveal gates solid; but uneven dedupe/prefetch, lifecycle/KPI cache overlaps, settings legacy-client stagger, residual crm-less queue morph. |
| Save-flow OS-likeness | **6 / 10** | Good optimistic `drawerOperatingSaveCoordinator`; undermined by 6+ `router.refresh()` full remounts. |
| Repo hygiene | **5.5 / 10** | Tracked artifacts, ~10+ dead components, 19.5k-line file, shell/skeleton naming sprawl. |
| Docs accuracy & governance | **8.5 / 10** | Strong canonical docs + governance; stale `web/README.md`, no code-path index, no `web/.env.example`. |
| Developer onboarding (cold start) | **6 / 10** | Good platform docs, but naming sprawl + legacy-admin coupling + no quickstart/verify-all make 30-min comprehension hard. |
| Test suite reliability | **4.5 / 10** | 1,732 files, ~298 failing; 28% are fragile evidence tests; merge-gate set must be curated. |
| **Overall** | **6.6 / 10** | Healthy architecture, accumulation debt. Subtractive cleanup will move the needle fast. |

---

## 3. Developer onboarding gaps (answers to Q1–Q2, Q3)

1. **Can a new senior dev understand the architecture in 30 min?** *Partially.* The docs exist and are good, but the **code** presents competing names for one concept (drawer / Focus Panel / `subjectSurface` / `vmDrawer` / `EntityDrawerOperatingShell`=`FocusPanelShell`), so mapping docs→code costs time. **[reported]**
2. **Clear "start here" doc?** *Yes for docs, no for code.* `docs/README.md` is a strong hub (load order foundation→core→operator→modules→governance) and root `README.md` is comprehensive. **Gap:** no "new senior dev" quickstart that maps concepts → `web/lib/adminV2/runtime/*` code paths.
3. **`web/README.md`** is **stale Next.js boilerplate** — `REPLACE_WITH_CANONICAL` or delete. **[reported]**
4. **No `web/.env.example`** (root README documents vars; `sync/.env.example` exists). New devs reverse-engineer env for `web/`. **[reported]**
5. **No one-command verify** (`verify:all`): `lint` + `test` + `typecheck:build` are separate among 45+ package scripts.
6. **No code-level breadcrumbs**: `web/lib/adminV2/runtime/` is canonical but has no README/ownership note distinguishing it from legacy.
7. **`legacy-admin` status is implicit**: 73 routable legacy pages + 19 adminV2 importers, with no single "what's legacy vs canonical" map for newcomers.

---

## 4. Documentation gaps

- **`web/README.md`** stale boilerplate → rewrite or remove. **[reported]**
- **No `web/.env.example`** (secrets-free). **[reported]**
- **No code-path index** linking platform docs → `web/lib/...` implementations.
- **No feature-gate registry** doc: env flags are scattered across `web/lib/layout/featureFlag.ts`, `alloyOsRuntimeFlag.ts`, `configurationRuntimeConvergenceFlag.ts`, `opportunityDrawerHardCutoverGate.ts`.
- **No legacy-admin status map** (feature → canonical vs legacy-admin).
- **Naming reconciliation doc**: one page mapping drawer-era names → Focus Panel canonical names (`AdminEntityDrawer` router, `vmDrawer/*` runtimes, `subjectSurface/*` shims, `EntityDrawerOperatingShell`≡`FocusPanelShell`).
- Sprint 01 noted several **foundation/governance docs annotated** because they described drawer-first as "current"; confirm none remain misleading. **[reported — re-verify]**
- 695 markdown files total; archive is well-isolated (244), but a **docs/system → docs/platform** dedupe pass is warranted (30 locked system doctrines vs 25 platform docs).

---

## 5. Canonical architecture map (the "start here" for code)

| Layer | Canonical home (code) | Notes |
|-------|----------------------|-------|
| Surface ViewModels (reveal owner) | `web/lib/adminV2/runtime/surface/{shellNavigation,workspace,workUnit}SurfaceViewModel.ts` | `reveal.canCommit` is the single commit decision per route. |
| Runtime contract / section map | `web/lib/adminV2/runtime/contract/*` | section ids, blocking/snapshot, reveal diagnostics. |
| Reveal gates | `web/lib/adminV2/*RevealGate.ts`, `workUnitPageRevealPolicy.ts` | protected (doctrine). |
| Shell / chrome | `AdminV2Shell` (workspace), `Sidebar.tsx` (composes shell-nav VM) | commit-once, no remount. Settings uses a **separate** shell (`AdminV2SettingsClientProviders`). |
| Focus Panel runtime | `web/components/admin/vmDrawer/{Opportunity,Persons}DrawerVmRuntime.tsx` via `AdminEntityDrawer.tsx` router + `EntityDrawerOperatingShell` (≡ `FocusPanelShell`) | one subject; per-entity bodies separate. |
| Queue rows | `CompressedQueueRow` (canonical) | legacy `LayoutRuntimeQueueRowView` / `CrmCompactQueuePreview` reachable only for crm-less rows. |
| Caches | `adminV2WorkspaceSessionCache`, `queueRowClientCache` (LRU+TTL), `metricRenderBundleCache` | ~59 cache modules; some overlap (§8). |
| Dedupe | `dedupeAdminFetch` / `dedupeAdminFetchWithTtl` (`web/lib/workspace/workspaceAdminFetchDedupe.ts`) | adoption uneven. |
| Prefetch / warming | `opportunityDrawerIntentPrefetch.ts`, `prefetchAdminV2AboveFold.ts`, `queueRowDrawerVmWarm.ts`, `prefetchPersonDrawerSnapshot.ts` | strong on queue rows, uneven elsewhere. |
| Save | `web/lib/admin/drawer/drawerOperatingSaveCoordinator.ts` (optimistic Save-All) | competes with 6+ `router.refresh()` paths. |
| Settings data | **delegates to** `@/app/legacy-admin/system/*` clients | least converged; blocks a settings Surface VM. |

---

## 6. Legacy / competing path inventory

| Path / cluster | Status | Reachable? | Classification |
|----------------|--------|-----------|----------------|
| `AdminEntityDrawerLegacy.tsx` (19,581 LOC) **[verified size, reported]** | Legacy monolith fallback | Opportunity: only if kill-switch; Person/Child: VM mandatory; Job/schedule/contacts/location: **legacy-only** | DELETE_AFTER_PARITY |
| Legacy queue rows (`LayoutRuntimeQueueRowView`, `CrmCompactQueuePreview` full-width) | Legacy | Only crm-less rows / flag-off | DELETE_AFTER_PARITY |
| `web/app/legacy-admin/**` (73 page.tsx) **[reported]** | Legacy product routes | Routable + linked from `AdminLayout.tsx` | PRODUCT_DECISION |
| 19 adminV2 files importing `@/app/legacy-admin/system/*` (settings fields/departments/option-sets/relationships/entity-labels + all of `adminV2/forms/*`) **[verified]** | Load-bearing legacy | Yes — current pages | REPLACE_WITH_CANONICAL (needs adapter) |
| `vmDrawer/PersonDrawerVmRuntime` (singular), `ChildDrawerVmRuntime`, `PersonsDrawerVmBody`, `VmInquiryRightColumn` **[verified 0 importers]** | Superseded VM scaffolding | No (static) | DELETE_NOW (after dynamic-import check) |
| `(proof)/adminV2/layout-proof/*` gallery + `NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED` **[verified]** | Dev proof, flag-gated off | Only with preview flag | QUARANTINE → DELETE_AFTER_PARITY |
| Settings `<AdminEntityDrawer />` mount (no `AdminDrawerProvider`) **[reported]** | Infra-or-inert | Inert in settings | PRODUCT_DECISION |

---

## 7. Top 20 cleanup candidates

| # | Candidate | Evidence | Classification |
|---|-----------|----------|----------------|
| 1 | Untrack `web/tsconfig.build.tsbuildinfo`, `web/tsconfig.tsbuildinfo` (gitignored-but-tracked) | **[verified]** `git ls-files` | DELETE_NOW |
| 2 | Untrack `web/test-results/.last-run.json` + `web/test-results/**` | **[verified]** | DELETE_NOW |
| 3 | `PersonDrawerVmRuntime` (singular) — 0 importers | **[verified]** | DELETE_NOW |
| 4 | `ChildDrawerVmRuntime` — 0 importers | **[verified]** | DELETE_NOW |
| 5 | `PersonsDrawerVmBody` — 0 importers | **[verified]** | DELETE_NOW |
| 6 | `VmInquiryRightColumn` — 0 importers (test asserts replaced) | **[verified]** | DELETE_NOW |
| 7 | `DepartmentWorkspaceColdShell`, `WorkspaceRootColdShell` — 0 importers (proof shells) | **[verified]** | DELETE_NOW |
| 8 | `OipOverviewPulseRow` — 0 importers | **[verified]** | DELETE_NOW |
| 9 | `DeleteLeadModal` — 0 importers (test-only string) | **[verified]** | DELETE_NOW |
| 10 | `OpportunityLifecyclePanel` — 0 importers | **[verified]** | DELETE_NOW |
| 11 | `ActionWorkspaceBosNeuralPulse` — 0 importers (test asserts NOT loaded) | **[verified]** | DELETE_NOW |
| 12 | `KpiStripSkeleton` — referenced only in comments/negative tests | **[reported]** | DELETE_NOW (verify) |
| 13 | `DocumentCompositionBlockPlaceholder`, other zero-importer placeholders | **[reported]** | DELETE_NOW (verify) |
| 14 | `AdminEntityDrawerLegacy.tsx` (19.5k LOC) split/shrink per entity parity | **[verified size]** | DELETE_AFTER_PARITY |
| 15 | `(proof)/adminV2/layout-proof/*` gallery + preview flag | **[verified]** | QUARANTINE |
| 16 | Lifecycle-cards double cache (session + module snapshot) | **[reported]** | REPLACE_WITH_CANONICAL |
| 17 | KPI-rows double cache / unbounded sessionStorage | **[reported]** | REPLACE_WITH_CANONICAL |
| 18 | Raw `fetch('/api/admin/departments'|'/work-units')` bypassing dedupe (AdminEntityDrawerLegacy, AgentConfigLabClient) | **[reported]** | REPLACE_WITH_CANONICAL |
| 19 | Shell-name sprawl (~49 `*Shell*`), incl. `CommandSurfaceShell` duplicated in `components/adminV2/` & `components/platform/` | **[reported]** | PRODUCT_DECISION |
| 20 | `FORCE_LEGACY_OPPORTUNITY_DRAWER` (always false) + `CONFIGURATION_RUNTIME_PHASE_3A_ENABLED` (subsumed by AlloyOS) — collapse | **[verified]** | DELETE_AFTER_PARITY |

---

## 8. Top 20 performance / navigation suspects (answers Q8–Q11)

| # | Suspect | Evidence | Class |
|---|---------|----------|-------|
| 1 | 6+ `router.refresh()` full remounts after save (UsersRoles, dept page, JobDrawerV2, AdminLayout, ProfileMenu, WorkspaceRootActionsRail) **[reported]** | Q10 | REPLACE_WITH_CANONICAL |
| 2 | `AdminEntityDrawerLegacy` ~10× `router.refresh()` after drawer mutations **[reported]** | Q10 | DELETE_AFTER_PARITY |
| 3 | `/api/admin/departments` fetched from 7 sites; `/work-units` from 6 — some bypass dedupe **[reported]** | Q9 | REPLACE_WITH_CANONICAL |
| 4 | Layout-runtime endpoints not deduped/cached (≈ rows×layers fetch volume) **[reported]** | Q9 | REPLACE_WITH_CANONICAL |
| 5 | Residual crm-less queue-row morph (`LayoutRuntimeQueueRowHold→View→fallback`) **[verified Sprint 01]** | Q8 | DELETE_AFTER_PARITY |
| 6 | Settings subpages delegate to legacy clients → staggered self-skeleton loading **[verified]** | Q7/Q8 | REPLACE_WITH_CANONICAL |
| 7 | Workspace warm-return refetches departments unconditionally + read-then-write cache churn **[reported Sprint 01]** | Q9 | REPLACE_WITH_CANONICAL |
| 8 | OIP KPI fetch fires even when scope has no placements **[reported Sprint 01]** | Q9 | REPLACE_WITH_CANONICAL |
| 9 | Lifecycle-cards + KPI-rows double cache, no coordinated invalidation **[reported]** | Q9 | REPLACE_WITH_CANONICAL |
| 10 | dept/work-unit queue summaries fetched 2× from different owners **[reported]** | Q9 | REPLACE_WITH_CANONICAL |
| 11 | work-unit `lane-previews` cold on first click (no prefetch) **[reported]** | preload | REPLACE_WITH_CANONICAL |
| 12 | Prefetch/warming uneven: drawer menu, related-record, lifecycle tile, manage menu lack warming **[reported]** | preload | KEEP_CANONICAL (extend) |
| 13 | No audit of Next `<Link prefetch>` across nav surfaces **[reported]** | route transitions | PRODUCT_DECISION |
| 14 | Settings route morph fixed (Sprint 01) but other one-off skeletons remain (component-level) **[reported]** | Q8 | KEEP_CANONICAL (audit) |
| 15 | Competing shells per region risk double chrome owners (settings shell vs `AdminV2Shell`) **[verified]** | Q11 | PRODUCT_DECISION |
| 16 | sessionStorage caches unbounded (lifecycle/KPI) → growth on long sessions **[reported]** | cache | REPLACE_WITH_CANONICAL |
| 17 | `AdminEntityDrawerLegacy` 19.5k LOC parse/load cost on legacy entities **[verified]** | perf | DELETE_AFTER_PARITY |
| 18 | work-unit `page.tsx` 7,780 LOC (data + render mixed) **[verified]** | Q7 | REPLACE_WITH_CANONICAL |
| 19 | `QueueService.ts` 4,711 LOC multi-responsibility **[verified]** | Q7 | PRODUCT_DECISION |
| 20 | Heavy providers high in tree (settings mounts drawer + providers per nav) **[reported]** | perf | PRODUCT_DECISION |

---

## 9. Top 10 deletion candidates (immediate, verified)

1. `web/tsconfig.build.tsbuildinfo` (untrack) — DELETE_NOW **[verified]**
2. `web/tsconfig.tsbuildinfo` (untrack) — DELETE_NOW **[verified]**
3. `web/test-results/**` (untrack) — DELETE_NOW **[verified]**
4. `PersonDrawerVmRuntime` (singular) — DELETE_NOW **[verified 0 imports]**
5. `ChildDrawerVmRuntime` — DELETE_NOW **[verified]**
6. `PersonsDrawerVmBody` — DELETE_NOW **[verified]**
7. `VmInquiryRightColumn` — DELETE_NOW **[verified]**
8. `DepartmentWorkspaceColdShell` + `WorkspaceRootColdShell` — DELETE_NOW **[verified]**
9. `OipOverviewPulseRow` — DELETE_NOW **[verified]**
10. `DeleteLeadModal`, `OpportunityLifecyclePanel`, `ActionWorkspaceBosNeuralPulse` — DELETE_NOW **[verified]**

> All component deletes require a one-line dynamic-import / string-reference recheck (some negative tests assert "NOT loaded" — those tests should be deleted *with* the component).

## 10. Quarantine candidates

- `(proof)/adminV2/layout-proof/*` + `NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED` — QUARANTINE (dev-only).
- `CrmCompactQueuePreview` full-width branch — already flag-off quarantined; keep until §11 parity.
- Settings `<AdminEntityDrawer/>` mount — QUARANTINE pending PRODUCT_DECISION (inert without provider).
- Shell/skeleton naming clusters — QUARANTINE under a naming-reconciliation decision before any rename.

## 11. Parity-gated deletion candidates

- `AdminEntityDrawerLegacy.tsx` per-entity bodies — DELETE_AFTER_PARITY (Opportunity after kill-switch-zero window; Person/Child once VM mandatory confirmed; Job/schedule/contacts/**location** need a Focus Panel path — location is **Unresolved**). Gated by `drawer-sunset-roadmap.md` editing substrate (Household → Children cards).
- Legacy queue-row path (`LayoutRuntimeQueueRowView`/`CrmCompactQueuePreview`) — DELETE_AFTER_PARITY (prove `CompressedQueueRow` covers crm-less rows first).
- `legacy-admin/system/*` field/settings clients — DELETE_AFTER_PARITY (need a `SettingsSurfaceViewModel` readiness adapter first).
- `FORCE_LEGACY_OPPORTUNITY_DRAWER` + `CONFIGURATION_RUNTIME_PHASE_3A_ENABLED` collapse — DELETE_AFTER_PARITY (kill-switch retirement window).

## 12. Immediate safe wins (no parity needed)

1. Untrack the 4 build/result artifacts + confirm `.gitignore` covers them. **[verified]**
2. Delete the ~10 verified zero-importer components (+ their negative tests). **[verified]**
3. Add `web/.env.example` (secrets-free) and rewrite/remove `web/README.md`.
4. Add `web/package.json` `verify:all` = `typecheck:build && lint && test -- --run` (advisory).
5. Fix the **one** drifted assertion in `tests/lib/admin/operatorNavRouteAudit.test.ts` (expects `/admin/settings/lifecycle`, code is `/settings/processes`). **[verified TEST_BASELINE]**
6. Add a feature-gate registry doc + a drawer→Focus-Panel naming map.

## 13. Risky areas NOT to touch yet

- Reveal gates / cache keys / known-empty predicates (`*RevealGate.ts`, runtime contract) — protected doctrine.
- `QueueBlock.tsx` visible render path & compressed-row presentation (only the activation gate was touched in Sprint 01).
- `AdminEntityDrawerLegacy.tsx` bodies for Job/schedule/contacts/**location** — no Focus Panel path yet.
- Drawer kill-switches (`NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH`, `FOCUS_PANEL_LAYOUT_RUNTIME_ENABLED`, layout-runtime master) — intentional parachutes; keep.
- `legacy-admin` routes/clients still load-bearing for settings + forms — replace, don't delete.
- Mass evidence-test rewrite — high churn; do in a dedicated, scoped test sprint.

## 14. Recommended first 3 implementation slices

1. **Hygiene sweep (lowest risk):** untrack the 4 artifacts; delete the ~10 verified dead components + their negative tests; fix the 1 drifted nav-route assertion. Gate: `typecheck:build` + the touched tests. *Pure subtraction, no runtime risk.*
2. **Developer-readiness slice:** add `web/.env.example`, rewrite `web/README.md`, add `verify:all`, add feature-gate registry + drawer/Focus-Panel naming map + `web/lib/adminV2/runtime/README.md`. *Docs/config only.*
3. **Save-flow continuity slice (scoped):** convert the **non-drawer** `router.refresh()` saves (UsersRoles, dept update, ProfileMenu, WorkspaceRootActionsRail) to event-driven scoped invalidation using the existing custom-event pattern. Gate: scoped tests + runtime suite. *Avoids the protected drawer monolith; targets the clearest OS-feel regressions.*

> Defer: `SettingsSurfaceViewModel` (needs the legacy-client readiness adapter), legacy queue-row deletion, and drawer monolith shrink — all parity-gated.

## 15. Tests to add / update / remove

- **Remove (with their component):** negative "asserts NOT loaded" tests for the verified dead components (ActionWorkspaceBosNeuralPulse, OpportunityTourDrawerSection, etc.). **[reported]**
- **Update (TEST_BASELINE):** `tests/lib/admin/operatorNavRouteAudit.test.ts` (route drift) **[verified]**; the businessProcesses/analytics evidence tests asserting removed constants/attributes. **[reported]**
- **Reclassify (ENVIRONMENT_ISSUE):** jsdom relative-URL `fetch` → `ERR_INVALID_URL` failures (e.g. `platformSurfacePerfStabilizationPass1.test.ts`); fix by base-URL/fetch stub in test setup, not product code. **[reported]**
- **Curate a merge-gate suite:** start from the doctrine runtime suite (work-unit queue + reveal + session-cache files were green in Sprint 01) + `drawerVmPrewarmScheduler` + `lib/` + `forms/`; exclude evidence/baseline-red files. ~190 reliably-green tests reported.
- **Add behavioral coverage (currently missing):** route transitions, save→invalidate (no full remount), cache stale-while-revalidate, loading→content (no skeleton morph), prefetch dedupe.
- **Strategic:** 486 evidence tests (28%) lock markup — schedule a phased rewrite to behavior tests; do **not** attempt in the hygiene slice.

## 16. Docs to add / update

- Add: `web/.env.example`, `web/lib/adminV2/runtime/README.md`, feature-gate registry, drawer→Focus-Panel naming map, legacy-admin status map, code-path index in platform docs, new-senior-dev quickstart.
- Update: `web/README.md` (de-boilerplate), confirm no foundation/governance doc still calls drawer-first "current", append Sprint 02 outcomes here.
- Consider: dedupe `docs/system` (30) vs `docs/platform` (25) overlaps.

## 17. Final recommendation

**Do next:** Slice 1 (hygiene sweep) then Slice 2 (developer-readiness) — both are pure subtraction/docs with near-zero runtime risk and immediately improve repo health and cold-start comprehension. Then Slice 3 (non-drawer save-flow continuity) for the most visible OS-feel win. Curate the merge-gate suite in parallel so future PRs have a trustworthy gate.

**Do NOT touch yet:** the drawer monolith bodies for unresolved entities (location/job), reveal/cache-key doctrine, the legacy queue-row path, load-bearing legacy-admin clients, intentional kill-switches, and the mass evidence-test rewrite. All are parity- or decision-gated.

**One line:** The architecture is sound; the debt is accumulation. Win by subtracting (artifacts, dead components, fragile tests) and by *uniformly applying the primitives that already exist* (dedupe, prefetch, optimistic save) — not by adding new ones.
