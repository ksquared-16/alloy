# Runtime Convergence — Executable Backlog

**Path:** `docs/sprints/06_2026/premium-operational-experience/convergence-backlog.md`
**Status:** Execution plan (June 2026). Turns "adopt the Experience Layer everywhere" into ordered, verifiable increments.
**Principle:** *Converge, don't construct.* Every increment **elevates a proven subsystem** and **reduces duplication**. No new runtimes; no rewrites.

---

## The convergence gate (read first)

Broad convergence of the **surface / drawer / editing** area is **gated** on one fact: the adminV2 rendering test baseline is **internally contradictory and ~50 tests red** — different sprint eras disagree about whether `WorkUnitWorkspaceColdShell` should exist in the work-unit page.

| Suite | Baseline |
|-------|----------|
| `adminV2DrawerLoadingCoherence` | **34 failed** / 15 passed |
| `adminV2WorkUnitShellFirstLoading` | 3 failed / 3 passed |
| `adminV2LoadingGeometry` | 3 failed / 10 passed |
| `workUnitRouteShell` | 1 failed / 9 passed |

Some of these assert the cold shell **must** be present; others assert it **must not**. **You cannot safely converge a subsystem whose own tests contradict what it should be** — "verify each capability" is impossible against a baseline that disagrees with itself. This is an *architectural contradiction* and a *regression-risk* condition both.

**Therefore convergence proceeds in two lanes:**
- **Lane A — test-clean (proceed now):** capabilities whose tests are green and behavioral. Safe to converge and verify immediately.
- **Lane B — minefield (gated):** the surface/drawer/editing rendering area. **Convergence-increment-zero is reconciling this baseline** (pick the correct cold-shell contract, delete the losers), *then* converge. Doing Lane B before reconciliation is shipping blind.

---

## Backlog (ordered; each row is one verifiable increment)

| # | Capability | Elevates (proven subsystem) | Reduces duplication | Lane | Regression risk | Verification |
|---|-----------|------------------------------|---------------------|------|-----------------|--------------|
| C0 | **Reconcile cold-shell test baseline** | the contradictory loading tests | removes contradictory truth | B | — (it *is* the un-blocker) | the 4 red suites go green on one contract |
| C1 | **Reveal System engine** | `workspace/workUnit/dept RevealGate` | 3 near-identical instrumentation+compute cores → 1 | **A** | Low | the 11 behavioral reveal tests stay green + new engine test |
| C2 | **Motion token adoption — non-drawer CSS** | `motionTokens.ts` | scattered durations/easings in `globals.css`/`adminV2.css` → tokens | **A** | Low (visual; typecheck + token-ref audit) | lint: no raw `\d+ms`/`ease-*` in migrated files |
| C3 | **Universal dirty-guard** | `drawerOperatingIsDirty()` | per-drawer guard → one platform invariant | B* | Med (close-path wiring) | guard unit test + close-path test |
| C4 | **One acknowledgement primitive** | `savedFlash` / `onSaved` patterns | two ack models → one | B | Med | primitive unit test |
| C5 | **Editable Card Runtime** | `LayoutRuntimeDrawerEditProvider` (Pattern A) | Pattern A + Pattern B → one runtime; delete Pattern B | B | High | state-machine unit tests + parity on save semantics |
| C6 | **Motion token adoption — drawer/surface CSS** | `motionTokens.ts` + drawer phase machine | drawer `recede`/`swap` bespoke timing → tokens | B | Med–High | after C0; visual + token-ref audit |
| C7 | **Reveal generalization to all surface shapes** | C1 engine | per-surface gates → generic region contract | A→B | Med | region-contract unit tests |

\* C3's *logic* is Lane A (pure, testable); its *wiring* touches the close path (Lane B). Land the guard module first (A), wire it second (B).

---

## Recommended sequence

1. **C1 (Reveal engine)** — Lane A, safe, foundational, ready now. The cleanest first proof of convergence.
2. **C2 (Motion adoption, non-drawer)** — Lane A, mechanical, reduces the most duplication.
3. **C0 (baseline reconciliation)** — the gate for everything else. Needs an explicit decision on the cold-shell contract (which is the migration's intended end state). **Requires review** — it's where today's contradictory implementations must be resolved into the approved one.
4. **C3 → C4 → C5** — the editing convergence, on the reconciled baseline.
5. **C6 → C7** — surface/motion convergence, last.

---

## Status

| Capability | State |
|-----------|-------|
| Approved-doc convergence (client/server line, Effects service, ownership clarifications) | ✅ applied to the Runtime Architecture Map |
| **C0 — cold-shell loading/reveal contract** | ✅ **Resolved.** Canonical contract derived + documented ([loading-and-reveal-contract.md](../../../platform/experience/loading-and-reveal-contract.md)); 3 mutually-exclusive assertions reconciled to one model; cold-shell-contract suite green (7 files / 49 tests; `workUnitRouteShell` 10/10) |
| **NEW contradiction — source-string test rot** | 🔎 **Discovered.** ~38 confirmed failures (loadingGeometry 2, shellFirstLoading 2, drawerLoadingCoherence 34) are brittle `expect(src).toContain("<symbol>")` assertions pinning **moved** implementation symbols. The *testing approach* contradicts the doctrine (tests must validate behavior, not implementation strings). Retire/replace **per Lane B increment**, grounded — not blind |
| **C5 — Editable Card Runtime** | ✅ **All active editable cards migrated.** Canonical runtime (`web/lib/experience/editing`, 16 tests); Pattern A elevated; one save coordinator kept. `EditablePersonContactCard` migrated (Opportunity Drawer). `HouseholdContactEdit` migrated (Focus Panel) — bespoke `phase`/`savedTimer`/`error` state removed, draft-retained-on-failure now canonical. `CardEditPlaceholder` deleted (dead — HouseholdContactEdit was the confirmed replacement; no imports). 8 behavioral tests covering save lifecycle, failure, cancel, ack. No remaining active cards on bespoke edit patterns. |
| C1 Reveal engine | ⏳ verified test-clean; ready |
| C2–C4, C6–C7 (Lane B) | ⏳ each must pair implementation convergence with retiring that area's source-string tests |

---

## When this doc must be updated

An increment completes (mark it, link its tests); the baseline reconciliation decision is made; or a new convergence target is identified.
