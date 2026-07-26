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

| Category | Current | Target | Trend | Completion % | Tasks Done / Total |
|---|:--:|:--:|:--:|--:|:--:|
| Runtime Architecture | C+ | A- | → | 15% | 0 / 3 |
| Critical Path | B- | A- | ↑ | 20% | 1 / 5 |
| TypeScript Architecture | C | B+ (A later) | ↑ | 15% | 1 / 3 |
| Dependency Graph | B | A- | ↑ | 40% | 2 / 5 |
| Maintainability | C- | A- | ↑ | 30% | 0 / 2 |
| Scalability | C | A- | → | 10% | 0 / 2 |
| Testing | C- | A | ↑ | 35% | 2 / 7 |
| Documentation | C | A- | ↑ | 30% | 0 / 3 |
| Performance | B | A- | ↑ | 40% | 1 / 4 |
| Code Quality | B- | A- | ↑ | 55% | 1 / 3 |

**Overall initiative completion (weighted, coarse): ~29%.** Trend is measured session-over-session (↑ improved, → unchanged, ↓ regressed). Certification target: every row at target grade.

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

_Future sessions append decisions here with the next `D-0xx` id; never silently reverse a decision — supersede it with a new entry citing evidence._

## 1c. Priority Queue (auto-selects the next READY task)

**Priority:** Critical · High · Medium · Low. **READY** = status NS/IP and all `Deps` are DONE. The next task to execute is the **highest-priority READY** task (ties broken by fewest downstream unblocks first, then lowest risk).

| Task | Cat | Priority | Deps | Deps met? | READY? |
|---|---|:--:|---|:--:|:--:|
| **CP-2** Remove duplicate stage-work fetch | Critical Path | **Critical** | — | ✓ | **READY** |
| CP-4 Enriched-VM field reuse of provisioning data | Critical Path | High | — | ✓ | READY |
| RA-1 Canonical kernel preload contract | Runtime Arch | High | — | ✓ | READY |
| DG-1 Conditional-mount+dynamic the 7 registry modals | Dependency Graph | High | — | ✓ | READY |
| MA-1 / DOC-1 `ARCHITECTURE.md` | Maint / Docs | High | — | ✓ | READY |
| TE-2 Portable Playwright fixtures | Testing | High | — | ✓ | READY |
| TE-4 `ProvisioningAnswer` schema contract test | Testing | Medium | — | ✓ | READY |
| TS-1 Immediate TS graph wins | TypeScript | Medium | — | ✓ | READY |
| TS-2 Project-reference roadmap | TypeScript | Medium | — | ✓ | READY |
| SC-1 Generalize subject contract | Scalability | Medium | — | ✓ | READY |
| CQ-3 Rename `resolveWorkUnitRouteIdentityCached` | Code Quality | Low | — | ✓ | READY |
| CP-1 Server-seed enriched VM | Critical Path | **Critical** | RA-1, CP-4 | ✗ | blocked |
| RA-2 Remove legacy-drawer duality | Runtime Arch | High | RA-1 | ✗ | blocked |
| CQ-2 Decompose `InlineOpportunityFocusPanel` | Code Quality | High | DG-1, DG-2 | ✗ | blocked |
| TE-3 CI wiring | Testing | High | TE-2 | ✗ | blocked |
| TE-5 Routing-permutation unit tests | Testing | Medium | RA-2 | ✗ | blocked |
| DG-2 Lazy-load `workflowRun.ts` | Dependency Graph | Medium | — | ✓ | READY |
| DG-3 Isolate SchedulingCard | Dependency Graph | Medium | — | ✓ | READY |
| PE-2 Warm fully-settled < 6 s | Performance | High | CP-1, CP-2, CP-4 | ✗ | blocked |
| PE-3 Cold TTFB mitigation | Performance | Low | CP-4 | ✗ | blocked |
| CP-3 Gate prewarm storm | Critical Path | Low | — | ✓ | READY (low value — see note) |
| TE-6 Perf regression assertions | Testing | Medium | PE-2 | ✗ | blocked |

**→ Next task selected by the queue: `CP-2` (Critical, READY).** _(CP-3 is deprioritized to Low: a prior attempt to gate the storm was reverted for touching the reveal lifecycle without moving wall-clock — see ledger; revisit only after CP-1.)_

---

## 2. Categories

### 2.1 Runtime Architecture — C+ → A- (bucket B) · 15%
**Why C+:** the provisioning cache has three producers (intent-prefetch, server-seed, K2 cold-fetch); the seed is a cross-layer coupling (an RSC layout hard-codes the kernel's URL-key scheme + a hydration-timing assumption); and the **legacy-drawer ↔ Focus-Panel record-open duality** exists (path `/work-unit/:slug/:recordId` drives the legacy `openDrawer`, `?subject_id` drives the Focus Panel subject).
**Blocking risks:** RA-2 touches the legacy drawer flow (regression risk); RA-1/RA-2 sequencing.
**Evidence for A-:** one record-open owner; seed key derivation owned by the kernel (no other layer references `provisioningAnswerUrl`); cache-producer invariant test green.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| RA-1 | Introduce canonical kernel preload contract `kernel.provisioning.seed(ref, answer)` | NS | Layout passes `(routeIdentity, answer)`, not a raw URL; key derivation lives in the kernel; `provisioningAnswerUrl` not imported outside the kernel | grep: 0 non-kernel imports of `provisioningAnswerUrl`; key-parity unit test routes through the new API | — |
| RA-2 | Remove legacy-drawer ↔ Focus-Panel record-open duality | NS | Path `/work-unit/:slug/:recordId` selects the correct Focus-Panel subject **or** 301s to `?subject_id`; legacy `openDrawer("workspace_slug_record_url")` branch deleted | `zz-realization-urlcontract` asserts path → correct subject; grep: no legacy record-open branch | RA-1 |
| RA-3 | Cache single-producer invariant (prefetch/seed/cold = one owned seam) | IP | One key builder; producer-parity + idempotency tests | seed-contract unit tests (partial — key-parity DONE) | RA-1 |

### 2.2 Critical Path — B- → A- (bucket A/B) · 20%
**Why B-:** first-card fixed, but the ~6 s post-commit enriched VM + ~2 s stage-work dominate all-cards (~12.7 s warm); a 4-request sibling-view prewarm storm fires during reveal; enriched VM re-reads data the provisioning answer already carries.
**Blocking risks:** CP-1/CP-2 touch the Settlement/reveal path (cert-sensitive); remote-DB latency floor on the data-dependency chain.
**Evidence for A-:** each remaining serial dependency justified; warm all-cards < 6 s (prod-representative); no duplicate reads/fetches on the cold default path.

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| CP-1 | Server-seed the enriched drawer VM (compose server-side for the committed subject, seed the client VM cache) | NS | On cold default load, `/view-models/drawer/opportunity/{id}` request ABSENT (seed-consumed); warm all-cards materially lower | harness: enriched-VM req absent + all-cards delta; full cert green | RA-1, CP-4 |
| CP-2 | Remove duplicate stage-work fetch (reuse answer's `focusPanelStageWork` on cold default load) | NS | No `view_model_stage_work` request when committed subject == answer subject; stage-work still correct | harness API count −1; Current-Work cert green | — |
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
| TS-2 | Design the TypeScript project-reference roadmap (`docs/runtime/typescript-roadmap.md`) | NS | First bounded projects named (kernel, provisioning), migration order + guardrails, effort/risk | committed roadmap doc | — |
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
| MA-1 | `docs/runtime/ARCHITECTURE.md` (shared w/ DOC-1) | NS | Covers kernel triad, Surface Host, Provisioning Answer contract, seed seam, cache ownership, critical-path waterfall, extension points, timing | fresh-agent comprehension check passes | — |
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
| DOC-1 | `docs/runtime/ARCHITECTURE.md` (ownership, critical path, data flow, cache ownership, timing, extension points) | NS | Self-sufficient; comprehension check passes | doc reviewed + fresh-agent check | — |
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
