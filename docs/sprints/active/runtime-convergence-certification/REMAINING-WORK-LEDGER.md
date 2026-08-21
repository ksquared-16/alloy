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
| 2 | **Live convergence** | How canonical mutations propagate is unmapped | none — NEW | architecture | **this lane** |
| 3 | **Operations** | Full product/perf/convergence pass beyond shell+warm+resume | shell 8–101 ms, reopen 0 requests, resume 9/9 certified | completion | **this lane** |
| 4 | **Communications** | Duplicate loader ownership: `TemplatesWorkspace` / `AnnouncementsWorkspace` direct-fetch what `communicationsWorkspaceWarmCache` already owns | §handoff + 20/22/23/22 per-open shape; **not** an accumulating leak; globalThis hypothesis **disproved** | convergence | **this lane** (was external) |
| 5 | **Records** | `/api/admin/records/children` ~3.3–4.5 s | measured in the prior phase; largest single number left | performance | **this lane** (was external) |
| 6 | **/organization** | Second pass: true-cold route-family entry, deep controls/editor, convergence after save | warm nav 17–63 ms certified; cold 1,486–2,594 ms; hover prefetch **disproved** | performance/convergence | **this lane** |
| 7 | **True cold** | Bare Work Unit ~11,708 ms | separate performance class (§1) | performance | **this lane** — re-profile first |
| 8 | **Counts / KPIs** | No matrix of projection → truth → invalidation owner | none — NEW | convergence | **this lane** |
| 9 | **Cross-surface truth** | No explicit freshness contract | none — NEW | architecture | **this lane** |

## Carried external handoffs (NOT absorbed)

| Item | Owner | Status |
|---|---|---|
| BOS rail direct-path late re-park (placement/CLS) | BOS rail owner | open — product placement decision |
| Speculative drawer-VM prefetch 404 on `/workspace` | runtime/preload owner | open — bounded waste, source of the console 404s |
| Vacilando ABANDONED execution-run checkpoint | Vacilando | open — tooling debt; both prior runs abandoned mid-flight |
| Brokered `vac run typecheck` OOM (pins 4096 vs package 8192) | validation broker | open — `typecheck:tests` at 8192 passes |
| `/organization/access` convergence | **PR #483** | active lane — do not modify here |

## Convergence invariant adopted

> **REFRESH SHOULD BE EXCEPTIONAL. CONVERGENCE SHOULD BE NORMAL.**

A canonical mutation updates the **smallest affected authoritative projection** through canonical
invalidation/read owners — never by rebuilding a page and never by introducing a second client truth.

## Performance protection

Every convergence fix is measured for request impact: one mutation must not become twenty
invalidations, a workspace reload, or a Work Unit recompose. Readiness/warm caches must survive.
