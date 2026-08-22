---
owner: platform
status: sprint
last_reviewed: 2026-08-21
supersedes: []
---

# Runtime Convergence + Final System Certification — remaining-work ledger

**One authoritative ledger.** Baseline contract:
[`operator-runtime-performance-certification.md`](../../../platform/runtime/operator-runtime-performance-certification.md).

The Runtime Performance + Premium UX phase is **CLOSED and merged** (staging `b7a9bf2e6`, PRs
#482/#484). Everything it certified is a **baseline, not a task** — certified Work Unit architecture
is not reopened unless a regression is found. **No closed finding is carried forward here**: items
resolved, reclassified or disproved in that phase (Save server tail, Activity preload, Operations
warm reuse, workspace resume, card/command readiness, the five guard gaps) are absent by design.

## Lane

| | |
|---|---|
| slot / port | 5 / 3015 |
| branch | `agent/claude/5-runtime-convergence-certification` |
| base | staging `b7a9bf2e6aa59061b2d4998bf7c4bdaca4ac397d` |
| collision | **PR #483 `wt1-access-identity-v2`** (active, holds the `alloy-cert` lease) owns `/organization/access` + `lib/access/*` — measure, do not modify |

## The ledger

| # | Area | Item | Evidence carried in | Class | Owner |
|---|---|---|---|---|---|
| 1 | **Unexpected refresh** | App "randomly refreshes"; cause unknown | none — NEW, must be instrumented | correctness/UX | **this lane** |
| 2 | **Live convergence** | How canonical mutations propagate is unmapped | **MAPPED** — [`CONVERGENCE-MATRIX.md`](CONVERGENCE-MATRIX.md); A/A2/B/F live-certified with exact restoration, C/D code-certified, E not exercisable | architecture | **this lane** |
| 3 | **Operations** | Full product/perf/convergence pass beyond shell+warm+resume | shell 8–101 ms, reopen 0 requests, resume 9/9 certified | completion | **this lane** |
| 4 | **Communications** | Duplicate loader ownership: `TemplatesWorkspace` / `AnnouncementsWorkspace` direct-fetch what `communicationsWorkspaceWarmCache` already owns | §handoff + 20/22/23/22 per-open shape; **not** an accumulating leak; globalThis hypothesis **disproved** | convergence | **this lane** (was external) |
| 5 | **Records** | `/api/admin/records/children` ~3.3–4.5 s | measured in the prior phase; largest single number left | performance | **this lane** (was external) |
| 6 | **/organization** | Second pass: true-cold route-family entry, deep controls/editor, convergence after save | warm nav 17–63 ms certified; cold 1,486–2,594 ms; hover prefetch **disproved** | performance/convergence | **this lane** |
| 7 | **True cold** | Bare Work Unit ~11,708 ms | separate performance class (§1) | performance | **this lane** — re-profile first |
| 8 | **Counts / KPIs** | No matrix of projection → truth → invalidation owner | **BUILT** — matrix §4; two 120 s polls total; queue summaries have no trigger | convergence | **this lane** |
| 9 | **Cross-surface truth** | No explicit freshness contract | **BUILT** — matrix §5; child name is the one fact with no contract off its owning card | architecture | **this lane** |

## Carried external handoffs (NOT absorbed)

| Item | Owner | Status |
|---|---|---|
| BOS rail direct-path late re-park (placement/CLS) | BOS rail owner | open — product placement decision |
| Speculative drawer-VM prefetch 404 on `/workspace` | runtime/preload owner | open — bounded waste, source of the console 404s |
| Vacilando ABANDONED execution-run checkpoint | Vacilando | open — tooling debt; both prior runs abandoned mid-flight |
| Brokered `vac run typecheck` OOM (pins 4096 vs package 8192) | validation broker | open — `typecheck:tests` at 8192 passes |
| `/organization/access` convergence | **PR #483** | active lane — do not modify here |

## Priority 2 findings — top three convergence defects

Full evidence: [`CONVERGENCE-MATRIX.md`](CONVERGENCE-MATRIX.md). Laws **28** and **29** frozen from them.

| # | Defect | Operator impact | Owner to fix |
|---|---|---|---|
| 1 | **The Work Unit queue subscribes to nothing.** The row/summary refresh policy has zero production callers; the current route registers no listener; its guard reads a deleted file. | Every membership- or order-changing mutation leaves the rows the operator is looking at stale. Counts converge, rows do not — so the screen looks authoritative and is wrong. | work-unit surface runtime + the existing policy in `lib/admin/opportunityQueueRefreshEvent.ts` |
| 2 | **A child rename converges one card and no other surface.** `saveInquiryChild` emits only record-patch signals unless participation fields changed. | Two different names for one child on one screen (Children card vs Assignments card vs queue row), until a manual browser refresh. | `focusPanelMutation.saveInquiryChild` + `buildDurableChildFocusPanelMutation` (one contract, two owners) |
| 3 | ~~Organization config saves emit no signal~~ — **WITHDRAWN, see matrix §3b.** The save already publishes canonical invalidation on an in-module bus the probe could not observe, and the 3 POSTs are `update_draft`/`validate_draft`/`publish`. | None — convergence was already correct. The one real finding (a `router.replace` to the address already shown, costing an RSC) is fixed. | closed |

**Fix status (this run).**

| Defect | Fix | Guard | Live re-proof |
|---|---|---|---|
| 1 Work Unit subscribes to nothing | `workUnitConvergencePlan.ts` + subscription in `useCommittedWorkUnitSurfaceRuntime`; rows converge by `provisioning.invalidate` + SUBJECT-scope re-commit; totals via a settlement `refreshToken` | `tests/runtime/workUnitConvergenceContract.test.ts` (13) + repointed `opportunityInquiryChildrenQueueRefresh` (2) | **pending** — see below |
| 2 child rename converges one card | identity-only signal from BOTH `saveInquiryChild` owners (case-grain dispatch, durable-grain broadcast); profile-only saves unchanged at 1 request | same suite | **pending** |
| 3 org config | withdrawn; `router.replace` to an unchanged href guarded | — | **pending** |

**Live re-measurement is blocked on one operator decision.** The toolkit binds slot 5's dev server
(`:3015`) to the SIBLING worktree `wt5-runtime-convergence-certification`, not to this lane's
worktree, and this lane's worktree has no dev metadata. The fixes are therefore guard-certified but
not yet live-re-measured. Either repoint slot 5's dev metadata at
`wt5-runtime-performance-ux-completion`, or authorize a server for it.

**Priority 1 regression proof (Mutation B).** The reload removal HOLDS live: 0 document loads, 0 RSC,
no remount, canonical broadcast emitted. The claim in that commit that "listeners refetch rows AND
counts" is **half true** — counts yes, rows no (defect 1). Recorded rather than re-opened.

## Convergence invariant adopted

> **REFRESH SHOULD BE EXCEPTIONAL. CONVERGENCE SHOULD BE NORMAL.**

A canonical mutation updates the **smallest affected authoritative projection** through canonical
invalidation/read owners — never by rebuilding a page and never by introducing a second client truth.

## Performance protection

Every convergence fix is measured for request impact: one mutation must not become twenty
invalidations, a workspace reload, or a Work Unit recompose. Readiness/warm caches must survive.

---

# Promotion (2026-08-22)

## Candidate

| | |
|---|---|
| branch | `agent/claude/5-runtime-performance-ux-completion` |
| pre-rebase HEAD | `ad5e9f37a` (38 ahead, 56 behind) |
| rebased onto | `origin/staging` `83e9e3d93` |
| candidate HEAD | `88eff2534` — 38 commits, 0 behind |
| conflicts | **none** — my 47 files vs staging's 154 had **zero overlap** |
| rebase integrity | all 47 files byte-identical pre/post rebase |
| migrations | **none on either side** — no version-collision risk |
| lockfile | unchanged; only two root `package.json` script additions |

## Bounded live smoke on the rebased candidate

Twelve steps, managed runtime on `:3015` bound to the rebased tree.

| Assertion | Result |
|---|---|
| no browser reload | **PASS** — every in-app interaction 0 document loads (the non-zero counts are the harness's own `goto`s) |
| no stale mounted projection | **PASS** — 0 RSC across all twelve steps |
| no duplicate candidate recreation | **PASS** — 18 active / 20 total, unchanged |
| pins intact | **PASS** — Wrigley Kurzman + PassA Kid both present |
| PassA still fail-closed | **PASS** — exactly one duplicate subject, unreconciled by design |
| Firefly clean | **PASS** — 17 rows, `operational`; zero probe tokens |

Convergence costs held: child switch 1 request, Activity 3, Work tab 2, message command 5,
**Operations reopen 0** (warm reuse, Law 46).

## Remaining debt carried past promotion

Nothing below blocks this promotion; each is owned and evidenced.

| # | Item | Class | Owner |
|---|---|---|---|
| 1 | **PassA duplicate placement candidate** — contested on pin ownership, `wait_since` seniority and cohort/section membership *simultaneously*; `reconcilePlacementDuplicates` returns `CONTESTED_DEFERRED` and refuses to guess a survivor | **CONTESTED / fail-closed — not a runtime-certification blocker** | Director decision |
| 2 | Speculative drawer-VM prefetch 404s on `/workspace` — 4× per waitlist journey; the only HTTP ≥400 class in the smoke | bounded waste | runtime/preload owner |
| 3 | **Inherited React duplicate-key warning** in the Current Work activity timeline: keys are `${label}-${occurredAt}` at *minute* granularity, so two identical activities in one minute collide (18× in a three-step journey). All four renderers are **byte-identical to `origin/staging`** — pre-existing, newly documented here | cosmetic correctness | Focus Panel card owner |
| 4 | `/api/admin/records/children` ~3.3–4.5 s | performance — largest single number left | Records owner |
| 5 | True-cold Work Unit ~11,708 ms | separate performance class — re-profile first | runtime |
| 6 | Queue summaries have no invalidation trigger (two 120 s polls) | convergence gap, matrix §4 | runtime |
| 7 | BOS rail direct-path late re-park (placement/CLS) | product placement decision | BOS rail owner |
| 8 | Brokered `vac run typecheck` OOM — pins 4096 against a package that needs 8192; `typecheck:tests` at 8192 passes | tooling | validation broker |
| 9 | `/organization/access` convergence | active lane — measured, not modified | **PR #483** |
| 10 | Vacilando abandoned execution-run checkpoints | tooling | Vacilando |

## The Firefly incident — recorded, not minimised

This program **caused a data regression on Firefly and then repaired it under Director approval.**

The placement-candidate identity migration was meant to move a candidate's key off the mutable
cohort. Its move helper wrote the cohort **as well as** the key, and because the lifecycle hook ran
on a **read** path, a single Work View load rewrote **15 candidates'** `program_room_cohort_key` to
`unknown_program_room` — re-sectioning the waitlist from 12/1/2/1/1 to 2/14/1.

What was done, in order: stopped the bleeding (the move now writes identity only, and repair was
removed from every read path); froze **Law 39**; built a restoration sourced *only* from the
immutable `metadata.cohort_resolution` evidence already on each row — **no DOB, age or heuristic
inference**, with unresolvable rows to be reported rather than guessed; obtained explicit Director
approval for exactly 15 enumerated candidates and exactly two mutable columns; executed `DRY_RUN`
then `APPLY`, fail-closed on every precondition (the `UPDATE` re-asserts the damaged value in its
`WHERE`). Result: **15/15 restored, zero diffs on immutable fields, both pins intact, three
subsequent reads produced zero mutation.**

Two of my own reports during the incident were wrong and are corrected in the matrix: I first said
14 rows were damaged (it was **15** — I missed Wrigley and Lennon and wrongly counted Tomas Rivera),
and I misclassified the pin effect as class A from a fallback code path (it is **class C**).

The durable lesson is the guard that now ships with it: an identity migration may not mutate a
projection field, and a repair may never run from a read path.
