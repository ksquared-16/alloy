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

## 0. Mission — a Grade-A Alloy platform (three inseparable outcomes)

The mission is **not** "improve architecture" as a separate exercise from "make Alloy fast." It is a single
mission with **three outcomes, none optional, none a bonus**:

1. **Grade-A operator experience** — pages/workspaces open fast; record selection & switching feel immediate;
   the panel becomes usable and *fully settled* quickly (no staggered ~11 s load); smooth, responsive transitions.
2. **Grade-A runtime architecture** — singular ownership; explicit contracts; no duplicated orchestration or
   data composition; no compatibility debris or dead paths; scalable across future Alloy domains/products.
3. **Grade-A engineering architecture** — the TypeScript graph is intentionally **bounded**, not a monolith;
   modules have clear ownership + narrow public APIs; the Focus-Panel/runtime hubs are decomposed by
   responsibility; cold/incremental tooling perf fits a growing org; durable tests + docs protect it all.

**Evaluation rule (every major task):** answer all three — (a) does operator experience improve? (b) does
ownership/architectural simplicity improve? (c) does the dependency/TypeScript graph get healthier (or at
least not worse)? **A retained change must not materially improve one dimension by degrading another.** Do
not optimize grades administratively; do not buy latency with fragile machinery; do not improve architecture
while leaving the product slow; do not call TypeScript "healthy" because one incremental run completed.

### Current reality (2026-07-26) — the mission is NOT close to complete
Runtime Architecture is A-, **but**: the panel still takes ~10–11 s to fully settle; the enriched drawer VM
is the dominant delay; sibling-view prewarm competes with primary reveal; the Focus Panel is a broad
dependency/orchestration hub; the TypeScript project is one large whole-program graph.

### Coordinated engineering tracks
- **TRACK 1 — Perceived Performance.** Remove user-visible latency: enriched-VM round-trip + duplicate
  composition; duplicate Stage Work / serial work; sibling-prewarm competition; unnecessary hydration &
  first-paint deps; slow nav/record-switching; avoidable waterfalls. **Certification targets:** warm
  first-meaningful < 3 s; warm fully-settled < 6 s; switching ≪ first load; no noncritical work competing
  with primary reveal; no stale-subject flash / interaction regression. Measure honestly; prove any lower bound.
- **TRACK 2 — Runtime Ownership & Simplicity.** Keep removing duplicate ownership, dead paths, compatibility
  machinery, broad coordinating components, hidden cache/key/timing contracts, duplicated server composition,
  unnecessary client orchestration. End state: one obvious owner per responsibility; explainable from code alone.
- **TRACK 3 — Dependency Graph & TypeScript Architecture.** **First establish the FACTUAL graph** (file/module
  count; fan-in/out; high-cost hubs; cold & incremental typecheck time; peak RSS; invalidation blast radius;
  first-paint static graph; circular/unstable dep directions). **Then execute real boundaries** (not mechanical
  splits): decompose `InlineOpportunityFocusPanel` by true ownership; isolate action-only / mode-only deps;
  narrow module APIs; remove broad imports + always-mounted noncritical surfaces; enforceable dependency
  boundaries; reduce hot-module inferred-type complexity; extract stable boundaries where TS project references
  / package boundaries are justified. Produce **and execute** a concrete modularization plan with implementation
  slices — Runtime's own graph must leave this initiative materially bounded, not merely roadmapped.

### Execution priority (by combined platform impact, not easiest grade)
1. **CP-4** — map & remove duplicated Provisioning Answer ↔ enriched-VM reads.
2. **CP-1** — eliminate/server-seed the enriched-VM post-hydration critical path via a **clean canonical
   owner** (not a blind copy of the provisioning-seed pattern). **Gate — architecture challenge required
   before implementing CP-1:** compare ≥5 options — (i) reuse request-scoped canonical composition; (ii) fold
   only commit-critical fields into the bounded Answer; (iii) server-preload a separately-owned enriched
   resource; (iv) parallel server composition; (v) remove the enriched request where it is duplicate — and
   choose the simplest that removes the waterfall **without diffusing ownership**. Record the decision (D-0xx).
3. **CP-3** — stop sibling prewarm from competing with active reveal.
4. **DG-1/2/3 + CQ-2** — decompose the Focus Panel; remove remaining first-paint deps.
5. **TypeScript boundary implementation slices** — from the measured dependency graph.

### Full Definition of Done (Runtime V1 certified only when ALL hold)
- **Operator experience:** perf budgets met (or an external hard limit proven); cold/warm/nav/refresh/
  record-switch/full-settlement all measured; interactions smooth & correct.
- **Architecture:** one canonical owner per responsibility; every remaining request/serial dependency
  justified; no known dead/superseded runtime paths; no silent performance mechanism without tests + observability.
- **Engineering:** Focus-Panel orchestration decomposed into bounded responsibilities; initial dependency
  graph contains only critical-path code; Runtime TS graph materially bounded; cold/warm typecheck + memory
  meet explicit budgets; committed regression + integration + E2E + performance coverage; accurate
  architecture/extension docs.

_Do not stop because one track reaches A-. Do not defer the other tracks. "Large" does not make work optional._

---

## 1. Engineering Scoreboard

| Category | Current | Target | Trend | Completion % | Confidence % | Tasks Done / Total | Milestone |
|---|:--:|:--:|:--:|--:|--:|:--:|:--:|
| Runtime Architecture | **A- (was B+)** ✓target | A- | ↑ | 100% | 88% | 3 / 3 | M1 |
| Critical Path | B (was B-) | A- | ↑ | 40% | 80% | 2 / 5 | M2 |
| TypeScript Architecture | C+ (was C) | B+ (A later) | ↑ | 50% | 75% | 2 / 3 | M3 |
| Dependency Graph | B | A- | ↑ | 40% | 70% | 2 / 5 | M1 |
| Maintainability | B (was C-) | A- | ↑ | 70% | 80% | 1 / 2 | M3 |
| Scalability | C | A- | → | 10% | 55% | 0 / 2 | M2 |
| Testing | C- | A | ↑ | 42% | 80% | 3 / 7 | M4 |
| Documentation | B (was C) | A- | ↑ | 60% | 80% | 1 / 3 | M3 |
| Performance | B | A- | ↑ | 40% | 80% | 1 / 4 | M2 |
| Code Quality | B- | A- | ↑ | 62% | 72% | 2 / 3 | M1 |

**Confidence %** = how confident a fresh architecture review would re-assign this grade, given the committed
evidence (tests / cert / measurements / review). It rises only with evidence and drops when new findings surface.

**Overall initiative completion (weighted, coarse): ~54%.** Trend is measured session-over-session (↑ improved, → unchanged, ↓ regressed). Certification target: every row at target grade. **Runtime Architecture is the first category CERTIFIED (A- = target).**

Task status legend: **NS** Not Started · **IP** In Progress · **BL** Blocked (an engineering dependency is not yet DONE) · **EEC** Execution Environment Constraint (the engineering is **READY**; only *this workstation* cannot perform trustworthy certification — a build/measure/browser loop under memory saturation. The Runtime is not blocked; the local machine is) · **NV** Needs Validation · **DONE** Completed.

> **Terminology (do not conflate):** a task is **BL** only when a Runtime dependency is unmet — that is an
> engineering fact. A task is **EEC** when it is engineering-READY but the current machine cannot certify it
> trustworthily — that is an execution-environment fact, never a Runtime limitation. The certification
> program must never imply Runtime itself is blocked because of local hardware.

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
| D-006 | **Slug→identity resolution is deduped** via a React `cache()` shared resolver (`resolveWorkUnitRouteIdentity`, renamed from `…Cached` in CQ-3 — the dedup is a transparent impl detail, not part of the name). | commit `5148c9708`; C1/C2/C3/C7 re-cert |
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
| ~~CQ-3 Rename `resolveWorkUnitRouteIdentityCached`~~ | Code Quality | Low | — | ✓ | **DONE** |
| CP-1 Server-seed enriched VM | Critical Path | **Critical** | RA-1, CP-4 | ✗ | blocked |
| ~~RA-2 Remove legacy-drawer duality~~ | Runtime Arch | High | RA-1✓ | ✓ | **DONE** |
| ~~RA-3 Cache single-producer invariant~~ | Runtime Arch | High | RA-1✓ | ✓ | **DONE** (Runtime Arch → A- ✓target) |
| CQ-2 Decompose `InlineOpportunityFocusPanel` | Code Quality | High | DG-1, DG-2 | ✗ | blocked |
| TE-3 CI wiring | Testing | High | TE-2 | ✗ | blocked |
| ~~TE-5 Routing-permutation unit tests~~ | Testing | Medium | RA-2✓ | ✓ | **DONE** |
| DG-2 Lazy-load `workflowRun.ts` | Dependency Graph | Medium | — | ✓ | READY |
| DG-3 Isolate SchedulingCard | Dependency Graph | Medium | — | ✓ | READY |
| PE-2 Warm fully-settled < 6 s | Performance | High | CP-1, CP-2, CP-4 | ✗ | blocked |
| PE-3 Cold TTFB mitigation | Performance | Low | CP-4 | ✗ | blocked |
| CP-3 Gate prewarm storm | Critical Path | Low | — | ✓ | READY (low value — see note) |
| TE-6 Perf regression assertions | Testing | Medium | PE-2 | ✗ | blocked |

**→ RESUME HERE — mission-aligned execution priority (§0): `CP-4` is #1.** Runtime Architecture is CERTIFIED
(A-) but the mission (Grade-A operator experience + architecture + engineering — §0) is far from done: the
panel still settles in ~10–11 s. The plan is **CP-4 → CP-1 (after the architecture challenge) → CP-3 → DG/CQ
→ TS slices**. Under the active **Execution Environment Constraint** (§6a), split each task into its
**EEC-free** part (do now) and its **build/measure/browser** part (batch for host headroom):

- **CP-4 (now, EEC-free part):** statically **map** the duplicated Provisioning Answer ↔ enriched-VM reads
  (which DB reads `composeOpportunityDrawerViewModel` repeats that the Answer already carries), then implement
  the removal + typecheck. The `phases_ms` before/after **measurement is EEC** (batch).
- **CP-1 architecture challenge (now, EEC-free):** the ≥5-option comparison (§0) → record the chosen owner as
  a Decision (D-0xx) **before** any CP-1 code.
- **TRACK 3 factual graph (now, EEC-free):** measure the dependency/TS graph (file/module count, fan-in/out,
  hubs, cold+incremental typecheck time, RSS, first-paint static graph, cycles) — grounds CP-4, the Focus-Panel
  decomposition (CQ-2), and the first-paint-dep cuts (DG). This is the factual basis Track 3 requires first.

EEC-batched (need host headroom): the CP-4/CP-1/CP-3/DG perf **measurements** + browser cert. Do NOT lower the
bar to fit the machine. _(CP-3: a prior storm-gating attempt was reverted for touching the reveal lifecycle
without moving wall-clock; revisit with the reveal-lifecycle owner in view.)_

## 1d. Milestones

Every task belongs to exactly one milestone. The Priority Queue draws from the **active** milestone unless a
higher-priority cross-milestone blocker exists (e.g. an M1 task that unblocks the biggest M2 lever).

A milestone represents an **engineering outcome**, not a bag of tasks. It is COMPLETE when that outcome is
achieved and evidenced — not when an arbitrary task list empties. The Priority Queue draws from the **active**
milestone unless a higher-priority cross-milestone lever exists.

| Milestone | Theme (outcome) | Tasks | Done / Total | Status |
|---|---|---|:--:|---|
| **M1** | **Runtime Ownership** — every core runtime seam has ONE owner | RA-1✓, RA-2✓, RA-3✓, DG-4✓, DG-5✓, CQ-1✓, CQ-3✓ | 7 / 7 | ✅ **COMPLETE** |
| **M2** | **Critical Path, Performance & Bundle Graph** — a fast, non-duplicative critical path and a lean first-paint graph | CP-1, CP-2✓, CP-3, CP-4, CP-5✓, PE-1, PE-2, PE-3, PE-4✓, SC-1, SC-2, DG-1, DG-2, DG-3, CQ-2 | 4 / 15 | **ACTIVE** |
| M3 | Developer Experience | TS-1, TS-2✓, TS-3✓, MA-1✓, MA-2, DOC-1✓, DOC-2, DOC-3 | 5 / 8 | in progress |
| M4 | Certification & Regression | TE-1✓, TE-2, TE-3, TE-4, TE-5✓, TE-6, TE-7✓ | 3 / 7 | in progress |

- **M1 Runtime Ownership is COMPLETE** (2026-07-26): its outcome — singular ownership of every core runtime
  seam — is achieved and evidenced (Runtime Architecture certified **A-**). See the Milestone Review (§1f).
  The former M1 tasks `DG-1/DG-2/DG-3` (conditional-mount / lazy-load — a *first-paint bundle-graph* outcome)
  and `CQ-2` (decompose the Focus-Panel monolith — a *structure* outcome) were **relocated to M2**: they are
  not ownership; they are graph/structure/performance, and CQ-2 depends on DG-1/DG-2. Extending M1 to hold
  them would confuse an achieved outcome with unrelated work.
- **Current milestone:** **M2 Critical Path, Performance & Bundle Graph.**
- **Milestone progress:** M1 7/7 ✅ · M2 4/15 · M3 5/8 · M4 3/7.
- **Active-milestone next READY:** most of M2 (`CP-4`, `CP-1`, `PE-*`, `DG-1/2/3`) carries an **Execution
  Environment Constraint** (engineering READY; this workstation cannot certify the build/measure/browser
  loop trustworthily — §6a). The materially-advanceable M2 task under that constraint is **`SC-1`**
  (generalize the `ProvisioningAnswer` subject contract — design + a PoC type that *compiles*, so it
  certifies by typecheck, no build/browser).

## 1e. Risks

Each risk: **Sev** (Sev1 critical … Sev3 minor) · **Likelihood** · **Impact** · Owner · Mitigation · Status.

### Open risks
| ID | Cat | Sev | Likelihood | Impact | Mitigation | Status |
|---|---|:--:|---|---|---|---|
| R-01 | Runtime Arch / Critical Path | Sev2 | Medium | A reveal-path change (RA-1/CP-1/CP-4/RA-2/CQ-2) regresses first-card/latest-click/no-flash | Full loop per task: measure → build → browser-cert matrix → keep/revert; seed-contract + cert specs guard | OPEN |
| R-02 | Execution Environment (not Runtime) | Sev2 | High | Workstation memory saturation makes the build/measure/browser-cert loop untrustworthy → EEC tasks (CP-4, CP-1, PE-*, DG-1/2/3, CQ-2) cannot be certified here now. **This is an environment constraint, never a Runtime block — the engineering is READY (§6a).** | Route to EEC-free tasks (unit/typecheck/static/design); `SKIP_BUILD_TYPECHECK=1`; out-of-band tsc; batch the EEC loop for host headroom; never lower the bar to fit the machine | OPEN |
| R-04 | Testing | Sev3 | High (until TE-2/3) | E2E cert specs bind hardcoded dev entity IDs → not CI-portable; regression protection is local-only for behavior paths (incl. RA-2's create-lead→`?subject_id` end-to-end) | Unit suites are portable + committed; TE-2 seeded fixtures + TE-3 CI wiring | OPEN |
| R-05 | Scalability | Sev3 | Medium | `ProvisioningAnswer` is opportunity-shaped (`inquiry_children`/subject snapshot) → strains a Parent/Teacher subject type | SC-1 generalizes the subject contract before reuse; kernel/Surface Host are subject-agnostic | OPEN |

### Resolved risks
| ID | Cat | Was | Resolution | Evidence |
|---|---|---|---|---|
| R-00 | Critical Path | Duplicate `/stage-work` fetch inflated all-cards | CP-2 seeds the answer's stage-work; fetch eliminated | `437ad9d11`; all-cards 12.7→11.2 s |
| R-06 | Maintainability | Onboarding required ledger archaeology; a core comment was false | `ARCHITECTURE.md` + comprehension check; comment fixed | `c52e50c52`; check PASSED |
| R-03 | Runtime Arch | Create-lead used a path-based href → landed on the DEFAULT subject, not the created record; dead legacy path→drawer controller lingered | RA-2: href now emits `?subject_id` (create-lead `router.push`es it; D-004 runtime honors it); dead controller + `[recordId]` route + rewrite deleted | RA-2 `558e4ae2a`; tsc 0 / build 0; unit set green |

---

## 1f. Milestone Review — M1 Runtime Ownership (COMPLETE, 2026-07-26)

_A review, not an implementation pass. It closes the milestone by judging the outcome and banking the lessons._

**What became objectively simpler?**
Record selection is now **one mechanism** — the `?subject_id` Operational Subject. The whole path-vs-query
duality (a `/:recordId` route + its `openDrawer` controller + deep-link and URL-sync effects) collapsed to a
single query-projected subject. The provisioning cache went from "three producers each free to hand-build a
URL key" to **one key builder + one public seed seam**. A new engineer traces record-open, cache keying, and
seed ownership from the code alone (ARCHITECTURE.md), no ledger.

**What code disappeared?**
`workUnitSurfaceController.ts` (192 lines) + its 123-line test; the dead `WorkUnitSurfaceView` render; the
dead `syncOperatorWorkUnitUrlInBrowser`; the `[recordId]` route page + its `next.config` rewrite; a misrooted
orphan duplicate test (145 lines); the public `seedProvisioning` export door. (Earlier in M1: DG-5 deleted 26
dead files / 2,793 lines; DG-4 split ~49.5 KB off the bundle.) Net: deletion dominated addition.

**What ownership became singular?**
(1) **One record-open owner** — the Focus Panel subject via `?subject_id` (RA-2). (2) **One cache key builder**
— `provisioningAnswerUrl`, kernel-only, reached through **one public seed seam** `seedProvisioningForRoute`
(RA-1 + RA-3); the low-level `seedProvisioning(url)` is now module-private, so key-drift cannot enter from
outside the kernel. (3) **One slug→identity resolver** (`resolveWorkUnitRouteIdentity`, request-deduped).

**What risks disappeared?**
R-03 (create-lead landed on the default subject) — RESOLVED. The "silent seed-key drift" failure mode
(a seed that misses and only makes the surface slower, no error) is now **structurally impossible from
outside the kernel** and additionally unit-locked by the single-producer key-agreement invariant.

**What engineering principles emerged?**
- **Delete the door, not just the caller.** Un-exporting a 0-caller primitive turns an invariant from a
  convention every caller must honor into a structural guarantee. Prefer this to a lint rule or a comment.
- **The URL is a projection, never a second source of truth.** When two encodings (path vs query) can both
  be read as the same fact, one is wrong; make the runtime honor exactly one and delete the other.
- **A name must not leak a transparent implementation detail.** `…Cached` described *how*, not *what*;
  document the memoization at the definition, keep the public name about the contract.
- **Prove "no new failures" by baseline-diff, never by a green subset.** This branch's suite is broadly red
  (stale doctrine tests, a `server-only` resolution gap); a passing subset means nothing without a stashed
  before/after `comm` diff.

**Lessons to guide future Runtime work:**
1. **Classify every red test before attributing it to a change** — establish the baseline (git stash) first;
   most of this branch's failures are pre-existing rot (flagged under R-04), not regressions.
2. **EEC ≠ blocked.** Certify what this environment allows (unit/typecheck/static/design); batch the
   build/measure/browser loop for host headroom. Never lower the bar to fit the machine.
3. **Do not `--amend` after filling a commit hash into the tracker** — it orphans the recorded hash (fixed
   this session: four evidence hashes pointed to dangling pre-amend commits). Record hashes in a follow-up
   commit that references the already-stable task commit.

---

## 2. Categories

### 2.1 Runtime Architecture — A- ✓ TARGET (bucket B) · 100%
**Why A- (certified):** RA-1 moved the seed key derivation into the kernel (no layer references `provisioningAnswerUrl`); RA-2 deleted the **legacy-drawer ↔ Focus-Panel record-open duality** (dead controller + path machinery gone, hrefs emit `?subject_id`, `[recordId]` route + rewrite retired); RA-3 closed the cache **single-producer invariant** — the raw-`url` seed door is now module-private so `seedProvisioningForRoute(routeIdentity)` is the SOLE public seam (the kernel owns key derivation structurally, not by convention), with committed producer-parity + idempotency + cold-fetch-coalescing tests. One key builder, three producers, one consumer — all agreeing on the key, enforced by a red test on drift.
**Blocking risks:** none open. (A later — beyond A- — is not a defined target for this category.)
**Evidence for A-:** one record-open owner ✓ (RA-2); seed key derivation kernel-owned ✓ (RA-1); cache single-producer invariant test green ✓ (RA-3).

| ID | Task | Status | Completion criteria | Evidence | Deps |
|---|---|:--:|---|---|---|
| RA-1 | Introduce canonical kernel preload seam `seedProvisioningForRoute(routeIdentity, answer)` | **DONE** | Layout passes `(routeIdentity, answer)`, not a raw URL; key derivation lives in the kernel; `provisioningAnswerUrl` not imported outside the kernel | **0 non-kernel imports of `provisioningAnswerUrl`; route-seam unit test (14/14); C1/C3 cert (seed consumed, latest-wins, no flash); all-cards ~10.9 s; tsc exit 0; commit `3c0a9d6c1`** | — |
| RA-2 | Remove legacy-drawer ↔ Focus-Panel record-open duality | **DONE** | (a) delete the DEAD `useWorkUnitSurfaceController` + `resolveDeepLinkRecordAction` + path deep-link/url-sync machinery; (b) make `operatorWorkUnitHrefFromKey`/`resolveCreatedLeadFocusPanelHref` emit `?subject_id=` (not `/recordId`) so create-lead selects the created record; (c) retire the `[recordId]` route + rewrite + update guards to the query form | **DONE `558e4ae2a`.** Deleted `workUnitSurfaceController.ts` (0 callers, verified) + its test + dead `WorkUnitSurfaceView` + dead `syncOperatorWorkUnitUrlInBrowser`; `operatorWorkUnitHrefFromKey(key,recordId)` now emits `?subject_id=`; `[recordId]/page.tsx` route + `next.config.ts` `:recordId` rewrite retired (build manifest omits it). **tsc EXIT 0 / 0 errors; prod build EXIT 0; RA-2-owned unit set GREEN (32 pass), +0 new failures vs baseline, −2 pre-existing failures fixed (baseline-diff proven); create-lead does `router.push` of the `?subject_id` href → D-004 runtime honors it.** Also removed a misrooted orphan dup test (`tests/routeShellPipeline/…`). Live-browser E2E = local-only (R-04). | RA-1✓ |
| RA-3 | Cache single-producer invariant (prefetch/seed/cold = one owned seam) | **DONE** | One key builder; producer-parity + idempotency tests | **`seedProvisioning(url)` un-exported → `seedProvisioningForRoute(identity)` is the SOLE public seed seam (kernel owns key derivation; 0 external callers deleted). `workUnitProvisioningPrefetch.test.ts` 17/17: single-producer key-agreement invariant (prefetch/seed/cold all key off `provisioningAnswerUrl`), re-seed idempotency, cold-fetch coalescing (prev. untested). +0 new failures vs baseline (6→6, proven). `d27395ecb`** | RA-1✓ |

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
| CP-5 | Slug→identity resolution dedup (layout) | DONE | One resolution/request via `resolveWorkUnitRouteIdentity` (renamed in CQ-3) | commit `5148c9708`; C1/C2/C3/C7 re-cert | — |

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
| TE-5 | Routing-permutation unit tests (`attentionFromUrl`↔`urlFromAttention` parity; path-vs-query documented) | **DONE** | Unit-level parity; the path/query inconsistency locked | **`attentionUrlParity.test.ts` (4/4): round-trips 6 coordinate permutations; locks subject = `?subject_id` ONLY (path `/:recordId` → subject null, D-004/RA-2); `urlFromAttention` never emits a path record segment. d2/d4 kernel suites still green (36/36).** | RA-2✓ |
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
| CQ-3 | Rename `resolveWorkUnitRouteIdentityCached` (drop impl-leak suffix) | **DONE** | `resolveWorkUnitRouteIdentityCached` → `resolveWorkUnitRouteIdentity` (export + file); 2 call sites updated; the `cache()` dedup is documented at the definition, not leaked into the name. **tsc EXIT 0 / 0 errors; 0 code refs to the old name.** `55a9be208` | — |

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
| 2026-07-26 | Certification exec #6 | **RA-2 → DONE.** Deleted dead surface controller (`workUnitSurfaceController.ts` + test + `WorkUnitSurfaceView` + `syncOperatorWorkUnitUrlInBrowser`); `operatorWorkUnitHrefFromKey(key,recordId)` emits `?subject_id=`; `[recordId]` route + `next.config` rewrite retired; guards/tests → query form; removed a misrooted orphan dup test. **tsc EXIT 0 / 0 errors; prod build EXIT 0; RA-2-owned unit set green (32), +0 new failures / −2 pre-existing fixed (baseline-diff proven).** Runtime Architecture B→B+ (65%); R-03 RESOLVED; M1 6/11. Pre-existing seed-only-host/route-shell test rot flagged (R-04). | `558e4ae2a` |
| 2026-07-26 | Certification exec #9 | **CQ-3 → DONE.** Renamed `resolveWorkUnitRouteIdentityCached` → `resolveWorkUnitRouteIdentity` (export + file); 2 call sites updated; ARCHITECTURE §5 + D-006/CP-5 refs updated. The `cache()` dedup stays documented at the definition, not leaked into the public name. tsc EXIT 0 / 0 errors; 0 code refs to the old name; build/browser N/A (import-graph-neutral rename). Code Quality 55→62% (2/3); M1 8/11. | `55a9be208` |
| 2026-07-26 | Certification exec #8 | **RA-3 → DONE — Runtime Architecture CERTIFIED (B+ → A- = target, the first category to reach target).** Un-exported the raw-`url` `seedProvisioning` (0 external callers) → `seedProvisioningForRoute(identity)` is the SOLE public seed seam; the kernel owns key derivation structurally. `workUnitProvisioningPrefetch.test.ts` 17/17: single-producer key-agreement invariant + re-seed idempotency + cold-fetch coalescing (prev. untested). tsc EXIT 0 / 0 errors; +0 new failures vs baseline (6→6, proven); build/browser N/A (import-graph-neutral visibility change). ARCHITECTURE.md §7 updated. M1 7/11; overall ~52%. | `d27395ecb` |
| 2026-07-26 | Certification exec #7 | **TE-5 → DONE.** `attentionUrlParity.test.ts` (4/4) locks `urlFromAttention`⇄`attentionFromUrl`: round-trips 6 coordinate permutations; subject = `?subject_id` ONLY (path `/:recordId` → null; D-004/RA-2); `urlFromAttention` never emits a path record segment. Kernel suites still green (d2/d4 = 36/36). Testing 35→42% (3/7); M4 3/7. Unit-only (throttle-appropriate; no source change). | `476aefe34` |

## 6a. Execution Environment Constraint (active)

**This is an execution-environment fact, not a Runtime limitation.** The engineering for the affected tasks
is **READY**; the current workstation simply cannot certify it trustworthily right now.

- **Constraint:** the workstation is memory-saturated (swap ~17–21 GB, ~1 GB free). Heavy prod builds
  (`next build`) run 5–10 min and intermittently OOM; a dev-server + Playwright run under that pressure is
  OOM-prone, so a browser/perf certification there would not be trustworthy.
- **What it constrains:** only the **build / measure / browser-cert loop** — i.e. `CP-4`, `CP-1`, `PE-*`,
  `DG-1/2/3`, `CQ-2`. Those tasks are **EEC** (engineering READY, this machine can't certify), *not* BL.
- **What it does NOT constrain:** unit tests, typecheck, static analysis, docs, and design/PoC-type tasks —
  all certify fine here. RA-1/RA-2/RA-3/TE-5/CQ-3 were all certified under this constraint.
- **Work-around (per the program's Environmental-Blockers rule):** route to EEC-free tasks (unit/typecheck/
  design), reduce local resource use where practical, and **batch the EEC loop for host headroom** (a freed
  sibling dev slot, or the machine quiescing) — never lower the certification bar to fit the workstation.
- **Classification:** Environment (not Architecture / Engineering / External). No Runtime V1 ceiling.
