# Runtime V1 Certification Sprint — Canonical Tracker

> **This is the living tracker for the Runtime V1 Certification initiative.** It is the single source of
> truth for what "certified" means, where we are, and what remains. **Every implementation session starts
> by reading and updating this file, and ends by updating it** (task status, evidence, grade, remaining
> work). The initiative is complete only when **every category reaches its target grade** or a **genuine
> architectural limitation (bucket C) is proven** with code + measurement evidence.

- **Branch:** `agent/claude/3-runtime-v1-polish` (slot 3 / `wt3-runtime-v1-polish`, port 3013) · committed-not-pushed
- **Companion docs:** `RUNTIME-V1-REALIZATION-LEDGER.md` (worktree root — investigation history, before/after) · this file supersedes the ledger as the forward tracker.
- **Grade scale:** F · D · C- · C · C+ · B- · B · B+ · A- · A. **Bucket** = why a gap exists: **A** unfinished implementation · **B** larger initiative, still Runtime V1 · **C** genuine architectural ceiling needing Runtime V2.
- **Verdict on file (2026-07-26):** no category is bucket **C**. Runtime V1 can reach world-class inside V1. The one real architectural *property* (F5: a client kernel can't receive server data before hydration) bounds one optimization, not any grade.

---

## 1. Engineering Scoreboard

| Category | Current | Target | Trend | Completion % | Confidence % | Tasks Done / Total | Milestone |
|---|:--:|:--:|:--:|--:|--:|:--:|:--:|
| Runtime Architecture | B (was C+) | A- | ↑ | 40% | 80% | 1 / 3 | M1 |
| Critical Path | B (was B-) | A- | ↑ | 40% | 80% | 2 / 5 | M2 |
| TypeScript Architecture | C+ (was C) | B+ (A later) | ↑ | 50% | 75% | 2 / 3 | M3 |
| Dependency Graph | B | A- | ↑ | 40% | 70% | 2 / 5 | M1 |
| Maintainability | B (was C-) | A- | ↑ | 70% | 80% | 1 / 2 | M3 |
| Scalability | C | A- | → | 10% | 55% | 0 / 2 | M2 |
| Testing | C- | A | ↑ | 35% | 80% | 2 / 7 | M4 |
| Documentation | B (was C) | A- | ↑ | 60% | 80% | 1 / 3 | M3 |
| Performance | B | A- | ↑ | 40% | 80% | 1 / 4 | M2 |
| Code Quality | B- | A- | ↑ | 55% | 70% | 1 / 3 | M1 |

**Confidence %** = how confident a fresh architecture review would re-assign this grade, given the committed
evidence (tests / cert / measurements / review). It rises only with evidence and drops when new findings surface.

**Overall initiative completion (weighted, coarse): ~44%.** Trend is measured session-over-session (↑ improved, → unchanged, ↓ regressed). Certification target: every row at target grade.

Task status legend: **NS** Not Started · **IP** In Progress · **BL** Blocked · **NV** Needs Validation · **DONE** Completed.

## 1a. Definition of Done (every task)

A task is **COMPLETE only when every box is checked** (doc/test/arch boxes are N/A-able only with a stated reason in the task's Evidence cell):

- [ ] Implementation complete (smallest correction that satisfies the criteria)
- [ ] Typecheck clean (`npm run typecheck`)
- [ ] Production build clean (`next build`)
- [ ] Browser certification complete (behavioral matrix re-run for the affected paths)
- [ ] Regression tests committed (unit/contract where the behavior is unit-testable)
- [ ] Measurements captured (before/after, where the task claims a perf/graph effect)
- [ ] Tracker updated (status, evidence = commit hash + numbers, grade, %)
- [ ] Documentation updated (comments truthful; `ARCHITECTURE.md` if ownership/flow changed)
- [ ] Architecture reviewed (capital-investment test: what complexity removed? what deletable? right at 10×?)
- [ ] No duplicated ownership introduced (one owner, one responsibility, one extension point)

## 1b. Decision Log (consult before proposing any architectural alternative)

| ID | Decision | Basis / evidence |
|---|---|---|
| D-001 | The canonical first-card mechanism is a **resolved server seed**: the route layout server-composes the Provisioning Answer and seeds the K2 cache with a RESOLVED answer. | first card 6.7→3.6 s warm; commit `d1314bb57` |
| D-002 | **Streaming overlap REJECTED** (client-armed deferred + Suspense-resolved client component). A client-component resolve can't deliver before bundle hydration; the resolved seed already delivers at hydration. | measured 5,462 vs 3,610 ms; F5; reverted |
| D-003 | **Passing an unawaited RSC promise as a client prop is FORBIDDEN** — crashes hydration in Next 16. | `TypeError: undefined 'catch'`; iter-2 crash |
| D-004 | **Canonical selected-subject routing = query `?subject_id`** (the runtime projects it via `urlFromAttention`). The path form `/:recordId` is legacy (drives `openDrawer`) and its consumption disagrees with construction. | `zz-realization-urlcontract`: path→default subject, query→correct. RA-2 resolves. |
| D-005 | **The seed lives in the LAYOUT, not the page** — the layout renders the Host and discards `children`; a page-segment seed is never mounted and loses the race to K2. | iter-1/iter-2 measurements |
| D-006 | **Slug→identity resolution is deduped** via a React `cache()` shared resolver (`resolveWorkUnitRouteIdentityCached`). | commit `5148c9708`; C1/C2/C3/C7 re-cert |
| D-007 | **Gate/auth dedup NOT needed** — already request-memoized (`loadAdminAccessBundleCached`). | code inspection |
| D-008 | **TypeScript stays single-project for now**; project references are a *designed later* initiative (TS-2), not a premature restructure. | cold typecheck 156 s acceptable short-term |
| D-009 | **Env-gated shadow / legacy-emergency-fallback modules are RETAINED** — legitimate kill-switches (default false), not dead code. | flag defaults verified |
| D-010 | **No Runtime V2.** The A/B/C analysis proved no bucket-C ceiling; certify within V1. | classification 2026-07-26 |
| D-011 | **The server preloads the kernel's cache through ONE kernel-owned seam** (`seedProvisioningForRoute`); no other layer references K2's key scheme (`provisioningAnswerUrl`). | RA-1; commit `3c0a9d6c1` |

_Future sessions append decisions here with the next `D-0xx` id; never silently reverse a decision — supersede it with a new entry citing evidence._

## 1c. Priority Queue (auto-selects the next READY task)

**Priority:** Critical · High · Medium · Low. **READY** = status NS/IP and all `Deps` are DONE. The next task to execute is the **highest-priority READY** task (ties broken by fewest downstream unblocks first, then lowest risk).

| Task | Cat | Priority | Deps | Deps met? | READY? |
|---|---|:--:|---|:--:|:--:|
| ~~CP-2 Remove duplicate stage-work fetch~~ | Critical Path | Critical | — | ✓ | **DONE** |
| CP-4 Enriched-VM field reuse of provisioning data | Critical Path | High | — | ✓ | READY |
| ~~RA-1 Canonical kernel preload seam~~ | Runtime Arch | High | — | ✓ | **DONE** |
| DG-1 Conditional-mount+dynamic the 7 registry modals | Dependency Graph | High | — | ✓ | READY |
| ~~MA-1 / DOC-1 `ARCHITECTURE.md`~~ | Maint / Docs | High | — | ✓ | **DONE** |
| TE-2 Portable Playwright fixtures | Testing | High | — | ✓ | READY |
| TE-4 `ProvisioningAnswer` schema contract test | Testing | Medium | — | ✓ | READY |
| TS-1 Immediate TS graph wins | TypeScript | Medium | — | ✓ | READY |
| ~~TS-2 Project-reference roadmap~~ | TypeScript | Medium | — | ✓ | **DONE** |
| SC-1 Generalize subject contract | Scalability | Medium | — | ✓ | READY |
| CQ-3 Rename `resolveWorkUnitRouteIdentityCached` | Code Quality | Low | — | ✓ | READY |
| CP-1 Server-seed enriched VM | Critical Path | **Critical** | RA-1, CP-4 | ✗ | blocked |
| RA-2 Remove legacy-drawer duality | Runtime Arch | High | RA-1✓ | ✓ | **READY** |
| CQ-2 Decompose `InlineOpportunityFocusPanel` | Code Quality | High | DG-1, DG-2 | ✗ | blocked |
| TE-3 CI wiring | Testing | High | TE-2 | ✗ | blocked |
| TE-5 Routing-permutation unit tests | Testing | Medium | RA-2 | ✗ | blocked |
| DG-2 Lazy-load `workflowRun.ts` | Dependency Graph | Medium | — | ✓ | READY |
| DG-3 Isolate SchedulingCard | Dependency Graph | Medium | — | ✓ | READY |
| PE-2 Warm fully-settled < 6 s | Performance | High | CP-1, CP-2, CP-4 | ✗ | blocked |
| PE-3 Cold TTFB mitigation | Performance | Low | CP-4 | ✗ | blocked |
| CP-3 Gate prewarm storm | Critical Path | Low | — | ✓ | READY (low value — see note) |
| TE-6 Perf regression assertions | Testing | Medium | PE-2 | ✗ | blocked |

**→ RESUME HERE — Next task selected by the queue: `RA-2` (High, READY — scoped & de-risked).** Execute the
recorded RA-2 plan: (a) delete the DEAD `useWorkUnitSurfaceController` + `resolveDeepLinkRecordAction` +
path deep-link/url-sync machinery (0 callers — verified); (b) make `operatorWorkUnitHrefFromKey` /
`resolveCreatedLeadFocusPanelHref` emit `?subject_id=` (not `/recordId`) so create-lead selects the created
record; (c) retire the `[recordId]` route + update `operatorWorkUnitLegacyGuards.test.ts` to the query form.
Cert: create-lead selects the record via `?subject_id`; `zz-realization-urlcontract` asserts query-canonical.
Once RA-2 + `CP-4` land, `CP-1` (server-seed the enriched VM — the biggest perceived-perf lever) unblocks.

Co-highest-priority READY siblings if RA-2 is deferred: `DG-1`, `CP-4`, `TE-2`. **NOTE:** RA-2/CP-4/DG-1
each require the build+browser-cert loop, throttled by host memory (§6a) — batch when the host has headroom.
Light READY tasks available under throttle: `TE-4` (schema contract, unit-only), `TS-1` (TS wins), `CQ-3`
(rename). _(CP-3 stays Low: a prior storm-gating attempt was reverted for touching the reveal lifecycle
without moving wall-clock; revisit after CP-1.)_

## 1d. Milestones

Every task belongs to exactly one milestone. The Priority Queue draws from the **active** milestone unless a
higher-priority cross-milestone blocker exists (e.g. an M1 task that unblocks the biggest M2 lever).

| Milestone | Theme | Tasks | Done / Total | Status |
|---|---|---|:--:|---|
| **M1** | **Runtime Ownership** | RA-1✓, RA-2, RA-3, DG-1, DG-2, DG-3, DG-4✓, DG-5✓, CQ-1✓, CQ-2, CQ-3 | 5 / 11 | **ACTIVE** |
| M2 | Critical Path & Performance | CP-1, CP-2✓, CP-3, CP-4, CP-5✓, PE-1, PE-2, PE-3, PE-4✓, SC-1, SC-2 | 4 / 11 | in progress |
| M3 | Developer Experience | TS-1, TS-2✓, TS-3✓, MA-1✓, MA-2, DOC-1✓, DOC-2, DOC-3 | 5 / 8 | in progress |
| M4 | Certification & Regression | TE-1✓, TE-2, TE-3, TE-4, TE-5, TE-6, TE-7✓ | 2 / 7 | in progress |

- **Current milestone:** **M1 Runtime Ownership** (fix ownership before optimizing the path; RA-1 also unblocks the M2 perf core).
- **Milestone progress:** M1 5/11 · M2 4/11 · M3 5/8 · M4 2/7.
- **Milestones remaining to target:** all four still have open tasks; M3 is closest.
- **Active-milestone next READY:** `RA-1` (see Priority Queue).

## 1e. Risks

Each risk: **Sev** (Sev1 critical … Sev3 minor) · **Likelihood** · **Impact** · Owner · Mitigation · Status.

### Open risks
| ID | Cat | Sev | Likelihood | Impact | Mitigation | Status |
|---|---|:--:|---|---|---|---|
| R-01 | Runtime Arch / Critical Path | Sev2 | Medium | A reveal-path change (RA-1/CP-1/CP-4/RA-2/CQ-2) regresses first-card/latest-click/no-flash | Full loop per task: measure → build → browser-cert matrix → keep/revert; seed-contract + cert specs guard | OPEN |
| R-02 | All (execution) | Sev2 | High | Host memory saturation (swap ~20 GB) makes prod builds slow/OOM → throttles the heavy build+cert loop | Reap stray tsc/Chromium; `SKIP_BUILD_TYPECHECK=1`; out-of-band tsc gate; route to light tasks under throttle | OPEN |
| R-03 | Runtime Arch | Sev3 (was Sev2) | Low-med | The legacy path→drawer controller is DEAD (unreachable), so no live duality — BUT the create-lead href is path-based, so **create-lead does not select the created record** (lands on the default subject) | RA-2(b) query-ifies the href (real fix); RA-2(a) deletes the dead controller; `zz-realization-urlcontract` locks it | OPEN (downgraded — dead not live) |
| R-04 | Testing | Sev3 | High (until TE-2/3) | E2E cert specs bind hardcoded dev entity IDs → not CI-portable; regression protection is local-only for behavior paths | Unit suites are portable + committed; TE-2 seeded fixtures + TE-3 CI wiring | OPEN |
| R-05 | Scalability | Sev3 | Medium | `ProvisioningAnswer` is opportunity-shaped (`inquiry_children`/subject snapshot) → strains a Parent/Teacher subject type | SC-1 generalizes the subject contract before reuse; kernel/Surface Host are subject-agnostic | OPEN |

### Resolved risks
| ID | Cat | Was | Resolution | Evidence |
|---|---|---|---|---|
| R-00 | Critical Path | Duplicate `/stage-work` fetch inflated all-cards | CP-2 seeds the answer's stage-work; fetch eliminated | `437ad9d11`; all-cards 12.7→11.2 s |
| R-06 | Maintainability | Onboarding required ledger archaeology; a core comment was false | `ARCHITECTURE.md` + comprehension check; comment fixed | `c52e50c52`; check PASSED |

---

## 2. Categories

### 2.1 Runtime Architecture — C+ → A- (bucket B) · 15%
**Why C+:** the provisioning cache has three producers (intent-prefetch, server-seed, K2 cold-fetch); the seed is a cross-layer coupling (an RSC layout hard-codes the kernel's URL-key scheme + a hydration-timing assumption); and the **legacy-drawer ↔ Focus-Panel record-open duality** exists (path `/work-unit/:slug/:recordId` drives the legacy `openDrawer`, `?subject_id` drives the Focus Panel subject).
**Blocking risks:** RA-2 touches the legacy drawer flow (regression risk); RA-1/RA-2 sequencing.
**Evidence for A-:** one record-open owner; seed key derivation owned by the kernel (no other layer references `provisioningAnswerUrl`); cache-producer invariant test green.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| RA-1 | Introduce canonical kernel preload seam `seedProvisioningForRoute(routeIdentity, answer)` | **DONE** | Layout passes `(routeIdentity, answer)`, not a raw URL; key derivation lives in the kernel; `provisioningAnswerUrl` not imported outside the kernel | **0 non-kernel imports of `provisioningAnswerUrl`; route-seam unit test (14/14); C1/C3 cert (seed consumed, latest-wins, no flash); all-cards ~10.9 s; tsc exit 0; commit `3c0a9d6c1`** | — |
| RA-2 | Remove legacy-drawer ↔ Focus-Panel record-open duality | **IP (scoped)** | (a) delete the DEAD `useWorkUnitSurfaceController` + `resolveDeepLinkRecordAction` + path deep-link/url-sync machinery; (b) make `operatorWorkUnitHrefFromKey`/`resolveCreatedLeadFocusPanelHref` emit `?subject_id=` (not `/recordId`) so create-lead selects the created record; (c) retire the `[recordId]` route + update `operatorWorkUnitLegacyGuards.test.ts` to the query form | **FINDING: `useWorkUnitSurfaceController` is DEAD (0 callers) → the legacy openDrawer path is unreachable; RA-2 is delete-dead + query-ify-href, not a live migration.** Cert: create-lead selects the record via `?subject_id`; urlcontract asserts query-canonical | RA-1✓ |
| RA-3 | Cache single-producer invariant (prefetch/seed/cold = one owned seam) | IP | One key builder; producer-parity + idempotency tests | seed-contract unit tests (partial — key-parity DONE) | RA-1 |

### 2.2 Critical Path — B- → A- (bucket A/B) · 20%
**Why B-:** first-card fixed, but the ~6 s post-commit enriched VM + ~2 s stage-work dominate all-cards (~12.7 s warm); a 4-request sibling-view prewarm storm fires during reveal; enriched VM re-reads data the provisioning answer already carries.
**Blocking risks:** CP-1/CP-2 touch the Settlement/reveal path (cert-sensitive); remote-DB latency floor on the data-dependency chain.
**Evidence for A-:** each remaining serial dependency justified; warm all-cards < 6 s (prod-representative); no duplicate reads/fetches on the cold default path.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| CP-1 | Server-seed the enriched drawer VM (compose server-side for the committed subject, seed the client VM cache) | NS | On cold default load, `/view-models/drawer/opportunity/{id}` request ABSENT (seed-consumed); warm all-cards materially lower | harness: enriched-VM req absent + all-cards delta; full cert green | RA-1, CP-4 |
| CP-2 | Remove duplicate stage-work fetch (reuse answer's `focusPanelStageWork` on cold default load) | **DONE** | No `view_model_stage_work` request when committed subject == answer subject; stage-work still correct | **`/stage-work` ELIMINATED (0); all-cards 12.7s→11.2s; reveal grid 5/reserved 0; C1/C3 pass; 13/13 units; tsc gate exit 0 / 0 errors; commit `437ad9d11`.** | — |
| CP-3 | Gate the sibling-view prewarm storm behind the reveal | NS | ≤1 provisioning request during the primary-reveal window (4 sibling prewarms deferred) | harness: provisioning count during reveal ≤1 | — |
| CP-4 | Enriched-VM field-by-field reuse of provisioning data (inquiry_children, primary contact) | NS | Named duplicate DB reads removed from enriched-VM `phases_ms`; contract unchanged | server `phases_ms` before/after | — |
| CP-5 | Slug→identity resolution dedup (layout) | DONE | One resolution/request via `resolveWorkUnitRouteIdentityCached` | commit `5148c9708`; C1/C2/C3/C7 re-cert | — |

### 2.3 TypeScript Architecture — C → B+ now (A later) (bucket B) · 15%
**Why C:** one monolithic `tsconfig.build.json`, no project references; cold typecheck 156 s / 3.27 GB (single process). Incremental is healthy (15 s / 1.15 GB). The graph only grows.
**Blocking risks:** project references are a repo-wide change (do NOT rush); measure each step.
**Evidence for B+:** immediate graph/time reduction measured; a written, reviewed project-reference roadmap. **A** later requires the referenced-project migration.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| TS-1 | Immediate wins (kill pathological inferred types on hot runtime modules; tighten over-broad public surfaces) | NS | Cold typecheck time or file-count measurably reduced; no new errors | before/after `time -l npm run typecheck` | — |
| TS-2 | Design the TypeScript project-reference roadmap (`docs/runtime/typescript-roadmap.md`) | **DONE** | First bounded projects named (kernel, provisioning), migration order + guardrails, effort/risk | `docs/runtime/typescript-roadmap.md` — immediate wins (→B+) vs project-refs (→A), extraction order, DAG guardrails, exit criteria | — |
| TS-3 | Baseline captured (cold/warm time, RSS, process count) | DONE | Measured: cold 156 s/3.27 GB, incremental 15 s/1.15 GB, 1 proc; storm is only `next build`'s checker | ledger Phase 5 table | — |

### 2.4 Dependency Graph — B → A- (bucket A/B) · 40%
**Why B:** perimeter splits + 26 deletions done, but always-mounted registry modals, the `workflowRun.ts` automation engine, and non-core cards remain eager; `InlineOpportunityFocusPanel` is a ~40-import hub.
**Blocking risks:** DG-1 changes modal lifecycle (exit animations/state) — per-modal cert needed.
**Evidence for A-:** no noncritical mode on the initial static graph; the hub is a thin composition root.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| DG-1 | Convert 7 always-mounted registry action modals to conditional-mount + `dynamic` | NS | Modals load only on open; off first-paint graph; each opens in cert | bundle delta + per-modal cert | — |
| DG-2 | Lazy-load `workflowRun.ts` automation engine off first paint (2 static entry paths) | NS | `workflowRun.ts` not on the initial static import walk; action-time behavior unchanged | dep-graph walk + cert | — |
| DG-3 | Isolate SchedulingCard + non-core cards from the lead first-paint graph | NS | Off the lead first-paint graph; scheduling-context cert | dep-graph walk + scheduling cert | — |
| DG-4 | Split Create Lead + Communications-composer surfaces | DONE | `next/dynamic`; −49.5 KB bundle; cert green | commit `5dac324fa` | — |
| DG-5 | Delete 26 dead files (2,793 lines) | DONE | 0-importer verified; tsc+build+browser cert | commit `97a740a31` | — |

### 2.5 Maintainability — C- → A- (bucket A) · 30%
**Why C-:** a new senior needed the ledger to understand ownership; a core-file comment was actively wrong (fixed).
**Evidence for A-:** a fresh senior traces ownership / critical path / cache ownership / extension points in **≤1 day** using `ARCHITECTURE.md` alone (validated by a fresh-agent comprehension check).

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| MA-1 | `docs/runtime/ARCHITECTURE.md` (shared w/ DOC-1) | **DONE** | Covers kernel triad, Surface Host, Provisioning Answer contract, seed seam, cache ownership, critical-path waterfall, extension points, timing | **`ARCHITECTURE.md` written; fresh-agent comprehension check PASSED the 1-day gate (4/5 fully answerable, all claims grep-accurate); 3 polish fixes applied** | — |
| MA-2 | Stale-comment audit across runtime dirs | IP | grep-audit of STREAMED/OVERLAP/legacy/TODO comments; each reconciled with code | audit list resolved (layout comment DONE) | — |

### 2.6 Scalability — C → A- (bucket B) · 10%
**Why C:** at 10× domains/50 engineers the same unfinished items bite (monolith, single tsconfig, per-nav speculative compose, view-count-scaling storm). The kernel is config-driven (no code-multiplication ceiling), but the `ProvisioningAnswer` contract is opportunity-shaped.
**Blocking risks:** derived from TS-2, CP-*, CQ-2, DG-*.
**Evidence for A-:** a second subject type (Parent/Teacher) representable without changing the answer core; scalability items in other categories closed.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| SC-1 | Generalize the `ProvisioningAnswer` subject contract (parameterize `focusPanelSubjectSnapshot`/`inquiry_children` by subject type) | NS | A second subject type modeled without changing the answer core; design + PoC type | design doc + PoC type compiles | — |
| SC-2 | Scalability roll-up (derived) | NS | TS-2 + CP-1..4 + CQ-2 + DG-1..3 at target | those tasks DONE | TS-2, CP-*, CQ-2, DG-1..3 |

### 2.7 Testing — C- → A (bucket A) · 35%
**Why C-:** provisioning/seed unit suite now committed (13, incl. key-parity), but E2E specs are dev-fixture-coupled (not portable/CI), and contract/perf/routing coverage is thin.
**Blocking risks:** portable fixtures require a seeding path; CI needs an ephemeral authed env.
**Evidence for A:** the pyramid below green in CI.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| TE-1 | Provisioning/seed unit suite (seed→consume, key-parity, fall-open, idempotency, one-shot, no-op) | DONE | 13/13 green; silent-miss guard present | `workUnitProvisioningPrefetch.test.ts`, commit `63dafa004` | — |
| TE-2 | Portable Playwright fixtures (replace hardcoded Wenc/Kurzman IDs with a seeded fixture) | NS | Cert specs pass against a freshly-seeded DB, no hardcoded IDs | green run in a clean env | — |
| TE-3 | CI wiring (unit + contract + integration on PR; Playwright in a seeded ephemeral env) | NS | CI runs the suites on PR; green | CI config + green run | TE-2 |
| TE-4 | `ProvisioningAnswer` schema contract test (snapshot) | NS | A schema change breaks the test | committed contract test | — |
| TE-5 | Routing-permutation unit tests (`attentionFromUrl`↔`urlFromAttention` parity; path-vs-query documented) | IP | Unit-level parity; the path/query inconsistency locked | urlcontract E2E DONE; unit tests pending | RA-2 |
| TE-6 | Performance regression assertions (waterfall budgets: first-card, all-cards) | NS | Committed spec asserts budgets; fails on regression | committed perf spec | PE-* |
| TE-7 | Commit behavioral cert specs (non-ephemeral) | DONE | Cert specs in-repo (local, honest limitation noted) | commit `435c13c94` | — |

### 2.8 Documentation — C → A- (bucket A) · 30%
**Why C:** durable knowledge lives in ledgers/realization history; comments contradicted code (fixed).
**Evidence for A-:** `ARCHITECTURE.md` is self-sufficient — a future engineer needs no ledger.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| DOC-1 | `docs/runtime/ARCHITECTURE.md` (ownership, critical path, data flow, cache ownership, timing, extension points) | **DONE** | Self-sufficient; comprehension check passes | comprehension check PASSED; polish fixes applied | — |
| DOC-2 | Fold durable facts out of the ledger into `ARCHITECTURE.md`; keep ledger as history | NS | ARCHITECTURE.md needs no ledger to understand V1 | comprehension check | DOC-1 |
| DOC-3 | Truthful code comments | IP | No comment contradicts code in runtime dirs | layout comment DONE (`63dafa004`); MA-2 audit | MA-2 |

### 2.9 Performance — B → A- (bucket A/B) · 40%
**Why B:** first-card win real (6.7→3.6 s warm), but perceived "loaded" (all-cards) ~12.7 s warm; cold TTFB +~2 s.
**Blocking risks:** remote-DB round-trip × data-dependency chain floor (prod DB faster than this staging instance).
**Evidence for A-:** warm first-meaningful < 3 s and warm fully-settled < 6 s (prod-representative), measured.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| PE-1 | Warm first-meaningful < 3 s | IP | Prod-representative warm first-card < 3000 ms | harness | CP-1 |
| PE-2 | Warm fully-settled panel < 6 s | NS | Prod-representative warm all-cards < 6000 ms | harness | CP-1, CP-2, CP-4 |
| PE-3 | Cold TTFB mitigation | NS | Cold TTFB regression < 1 s vs baseline | harness | CP-4 |
| PE-4 | First-card seed win + bundle −49.5 KB | DONE | 6.7→3.6 s warm; committed | commits `d1314bb57`, `5dac324fa` | — |

### 2.10 Code Quality — B- → A- (bucket A) · 55%
**Why B-:** clean small diffs + dead-code deletion + simplification done, but the Focus Panel monolith remains and one impl-leak name.
**Evidence for A-:** the hub is a thin composition root of bounded modules with small contracts; no dead complexity; honest names.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| CQ-1 | Simplify `seedProvisioning` + truthful comments | DONE | Resolved-answer-only cache write; polymorphism deleted | commit `63dafa004` | — |
| CQ-2 | Decompose `InlineOpportunityFocusPanel` into bounded modules (presentation / cards / modes / actions / comms / scheduling / current-work / refresh / selection / prewarm / state / effects) | NS | Hub is a composition root importing bounded modules, each a small contract; no behavior change (cert green) | import-count before/after + module contracts + full cert | DG-1, DG-2 |
| CQ-3 | Rename `resolveWorkUnitRouteIdentityCached` (drop impl-leak suffix) | NS | Renamed; callers updated; tsc clean | diff | — |

---

## 3. Cross-cutting blocking risks

1. **Cert-sensitive reveal path.** CP-1/CP-2/CQ-2/RA-2 all touch the reveal/Settlement/legacy-drawer path. Every change runs the full loop (implement → measure → typecheck → build → browser-cert → keep/revert) and re-runs the behavioral matrix.
2. **Host memory.** The workstation thrashes (swap 17–21 GB); prod builds intermittently OOM. Serialize heavy steps; reap Chromium; `SKIP_BUILD_TYPECHECK=1` for measurement builds; final typecheck out-of-band.
3. **Portable fixtures gap.** Until TE-2, E2E cert is local-only — treat E2E green as local evidence, not CI-portable proof.
4. **Legacy coexistence.** RA-2's legacy drawer is live; migrate behind evidence, never delete blind.

## 4. Session protocol (every implementation session)

1. **Open:** read this tracker; pick the next task(s) by dependency + leverage (CP-1/CP-2 and RA-2 are the highest-leverage).
2. **Work the loop** per task: implement smallest correction → measure → typecheck → prod build → browser-cert → keep/revert on evidence.
3. **Close:** update the task's **Status**, **Evidence** (commit hash + measurement), the category **Current grade** + **%**, and **remaining work**. Add a Change-log row.
4. **Grade change rule:** a category's Current grade only advances when its listed tasks' evidence supports it — grades are earned by evidence, not asserted.
5. **Done rule:** the initiative is complete when every category = target grade, **or** a bucket-**C** limitation is proven with code + timing + behavior evidence and operator review is requested.

## 5. Change log

| Date | Session | Change | Commits |
|---|---|---|---|
| 2026-07-26 | Certification kickoff | Tracker created; grades/tasks/evidence seeded from the realization + adversarial-review + A/B/C analysis | — |
| 2026-07-26 | Realization + Phase 3/4/5 | CP-5, DG-4, DG-5, PE-4, TE-1, TE-7, CQ-1 completed; punch-list truth/simplification | `d1314bb57` `5dac324fa` `97a740a31` `5148c9708` `63dafa004` `435c13c94` |
| 2026-07-26 | Certification exec #1 | **CP-2 → DONE** (dup `/stage-work` eliminated; all-cards 12.7→11.2 s; +4 units; tsc gate exit 0). Critical Path B-→B, 40%. | `437ad9d11` |
| 2026-07-26 | Certification exec #2 | **MA-1 / DOC-1 → DONE** (`ARCHITECTURE.md`; comprehension check PASSED + 3 polish fixes). Maintainability C-→B (70%), Documentation C→B (60%). | `c52e50c52` + this |
| 2026-07-26 | Certification exec #3 | **TS-2 → DONE** (`typescript-roadmap.md`). TypeScript C→C+ (50%). | this |
| 2026-07-26 | Certification exec #4 | **RA-1 → DONE** (kernel preload seam; `provisioningAnswerUrl` now kernel-only; behavior-identical, cert green; D-011). Runtime Architecture C+→B (40%). Unblocks RA-2. | `3c0a9d6c1` |
| 2026-07-26 | Certification exec #5 | **RA-2 → IP (scoped + de-risked).** Found `useWorkUnitSurfaceController` DEAD → legacy duality is unreachable; RA-2 reduced to delete-dead + query-ify the create-lead href. R-03 downgraded Sev2→Sev3. Held (multi-file behavior change; host-memory throttle degrading trustworthy heavy cert). | — |

## 6a. Environmental throttle (active)

**The workstation is memory-saturated (swap ~20–21 GB, <1 GB free).** Heavy prod builds (`next build`) are
running 5–10 min and intermittently OOM-killed; the full cold `tsc` gate crawls. This throttles the
**build+browser-cert loop** that CP-1 / CP-4 / RA-1 / DG-1 / CQ-2 require. Mitigation in effect: kill stray
`tsc`/Chromium between steps; `SKIP_BUILD_TYPECHECK=1` for measurement builds; run the full `tsc` gate
out-of-band. **Routing policy under throttle:** prefer READY tasks that certify via unit tests + typecheck
(no prod build) — docs (MA-1/DOC-1, TS-2), unit tests (TE-4) — and batch heavy build+cert tasks for when
the host has headroom (or sibling slots are freed). This is a genuine environmental blocker, not an
architectural one.
