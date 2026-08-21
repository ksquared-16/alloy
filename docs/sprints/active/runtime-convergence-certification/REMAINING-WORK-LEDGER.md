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
