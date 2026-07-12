# Loading & Reveal Contract (canonical)

**Path:** `docs/platform/experience/loading-and-reveal-contract.md`
**Status:** **Canonical** (June 2026). The single definition of loading, reveal, departure, continuity, and cold-shell ownership across the platform. Derived directly from the approved doctrines; supersedes all historical implementations and tests.
**Derived from:** [`operational-experience-doctrine.md`](./operational-experience-doctrine.md) (Laws 1–3) · [`operational-motion-doctrine.md`](./operational-motion-doctrine.md) (`reveal`/`recede`/`settle`) · [`navigation-runtime-doctrine.md`](./navigation-runtime-doctrine.md) · [`../foundation/runtime-architecture-map.md`](../foundation/runtime-architecture-map.md) (Experience/Reveal, Surface lifecycle).
**Resolves:** C0 — the contradictory cold-shell test baseline. When implementation, tests, and doctrine disagreed, doctrine won; this is the result.

---

## The five canonical contracts

### 1. Loading contract
A surface has **exactly one branded loading representation**: a single cold shell (`WorkUnitWorkspaceColdShell`, `DepartmentWorkspaceColdShell`, the workspace root shell). It is shown **only on genuine arrival** while the surface's readiness gate is unmet (`!workUnitPageContentReady` / `above_fold_ready === false`). **No section-skeleton sequences, no staggered region reveal, no spinner-then-panel swaps.** Reserved geometry (quiet reserve) is permitted; visible *assembly* is not.

### 2. Reveal contract
Reveal is **atomic**. When the readiness gate clears, the full above-fold surface replaces the cold shell in **one coordinated frame** (Motion `reveal`). No region is exempt; no region reveals independently after the gate. Genuinely-deferred values may *settle* into already-reserved geometry afterward, imperceptibly (Motion `settle`) — never as a skeleton-to-content swap.

### 3. Departure contract
**Loading belongs to arrival, never departure.** When the operator leaves a surface, the prior stable surface is **held** (or yields to the destination); the departing surface **never renders its cold shell at a foreign URL**. (Enforced by `isLeavingWorkUnitSurface`.)

### 4. Continuity contract
The shell chrome (`WorkspaceChrome`, sidebar) **stays mounted** across transitions. Prior payload is held through a transition — never a blank or a mid-transition skeleton. The operator changes context, not location.

### 5. Cold-shell ownership (the contradiction, resolved)
The cold shell has **exactly one owner: the page / shell owner, rendered *inside* the single `WorkspaceChrome` owner**, gated by content readiness.

- **Route `loading.tsx` returns `null`** — it defers to the page shell owner. Route segments do **not** own a cold shell. (One owner, not two.)
- **The page renders the cold shell inside `<WorkspaceChrome>`** while `!workUnitPageContentReady`, then reveals atomically. It is **not** a pre-chrome early return (`if (blockingLoad) return <ColdShell>`) — that would create a second, chrome-less loading owner.

This is the model the doctrines require ("one branded surface", "one shell owner", atomic reveal) **and** the model the current implementation already follows. The historical tests that asserted the opposite — `loading.tsx` *must* contain the cold shell, or the page *must not* — were **mutually exclusive with each other**; both losing assertions are superseded and have been rewritten to this contract.

---

## Baseline reconciliation (what changed and why)

| Historical assertion | Classification | Action |
|----------------------|----------------|--------|
| `loading.tsx` **must contain** `WorkUnitWorkspaceColdShell` (`adminV2LoadingGeometry`) | **Obsolete** — route segments don't own cold shells | Rewritten: `loading.tsx` returns `null`, defers to page |
| page **must not contain** `WorkUnitWorkspaceColdShell` (`shellFirstLoading`, `workUnitRouteShell`) | **Superseded** — page is the single owner of the cold shell | Rewritten: page renders it inside the single `WorkspaceChrome` |
| page renders cold shell inside `WorkspaceChrome` while `!workUnitPageContentReady` (`loadingGeometry`, `revealGatePage`, Pass2/3, criticalPath) | **Still valid** — canonical | Kept |
| `loading.tsx` returns `null` (`workUnitRouteShell`, `shellFirstLoading`) | **Still valid** — canonical | Kept |

**Out of scope of C0 (separate convergence):** a large share of the AdminV2 loading suite consists of **brittle source-string assertions** (`expect(src).toContain("<internal symbol>")`) pinning *historical implementation strings and file locations* — e.g. `DeptOperationalRegionLoader`, `prefetchDepartmentOperationalBootstrap`, `operLaneLoading={…}`, the 34 `adminV2DrawerLoadingCoherence` symbol checks. Those symbols still exist but have **moved files** across ~1500 commits, so the assertions fail for reasons unrelated to the cold-shell contract. **These tests violate the doctrine's own principle that tests validate behavior, not implementation** — and retiring/replacing them must be done *alongside the implementation convergence* (Lane B), where the current behavior is in context, not blind. See the [Convergence Backlog](../../sprints/archive/06_2026/premium-operational-experience/convergence-backlog.md).

---

## When this doc must be updated

The cold-shell ownership model changes; a new surface shape adds a loading representation; or the reveal/settle boundary moves.
