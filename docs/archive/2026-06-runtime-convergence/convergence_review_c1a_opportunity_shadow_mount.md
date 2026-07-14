# Convergence Review — C1a Opportunity Drawer Layout Runtime Shadow Mount

**Verdict: APPROVED** — *(final @ `0d07b5f5`; build break fixed in `eb31b947`, compile gate + `data-opportunity-id` removal in `0d07b5f5`. Original verdict was REJECTED @ `723386e0`. Two re-review addenda at the end.)*
**Reviewed:** `origin/cursor/c1a-opportunity-shadow-mount` — `723386e0` (orig, REJECTED) → `eb31b947` (import fix) → **`0d07b5f5`** (compile gate + id removal), on merge-base `ff39c2af`. 11 files (10 C1a + 1 compile-gate test). **0 migrations. No queue/nav/person/child/seed files.**

> The body below is the **original REJECTED review** of `723386e0`, retained for the record. The blocking defect it identifies is fixed by `eb31b947`; the verdict is superseded by the Re-review addendum at the end.

---

**Original verdict (723386e0): REJECTED**
**Reason:** A production-breaking regression bundled in the commit — an accidental deletion of a still-used import in `OpportunityDrawerVmRuntime.tsx` — causes an **unconditional compile error** in the production opportunity drawer. It is **not flag-gated** and **not rollback-by-flags**. This is a hard FAIL on Gates 1, 4, and 8.
**Reviewer:** Convergence Review Authority · rubric [`convergence_review_rubric.md`](./convergence_review_rubric.md) · contracts [`adminv2-runtime-performance-doctrine.md`](../system/adminv2-runtime-performance-doctrine.md), [`drawer-view-model-runtime-contract.md`](../system/drawer-view-model-runtime-contract.md).

---

## ⛔ Blocking defect (the reason for rejection)

`web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx`:

- The commit's import hunk **removed**:
  `- import { resolveOpportunityQueueNavigatorPosition } from "@/lib/admin/opportunityDrawerQueueNavigator";`
  (replaced in-place by the two new shadow imports).
- But the function is **still called** in the branch file:
  `:174  return resolveOpportunityQueueNavigatorPosition(drawer.id, drawer.opportunityQueueNavigator);`
  inside the unchanged `queuePosition = useMemo(...)` (`:172–175`).
- No diff hunk modifies that usage. The only remaining `QueueNavigator` import in the file is the **component** `OpportunityDrawerQueueNavigatorControls` (`:10`) — a different symbol.
- The module `@/lib/admin/opportunityDrawerQueueNavigator.ts` **still exists**, so the symbol is undefined *only because its import was deleted*.

**Effect:** `resolveOpportunityQueueNavigatorPosition` is undefined → TypeScript/`next build` compile error → the **production opportunity drawer component fails to build/render**, for all users, **regardless of feature-flag state**.

**Why the green tests missed it:** the new C1a tests (`opportunityDrawerLayoutRuntimeShadow.test.ts`, `layoutRuntimeFlags.test.ts`) exercise the shadow lib + flags and **do not import `OpportunityDrawerVmRuntime.tsx`**, so "200 passed" did not type-check or compile the broken component. (Confirms why a code review, not a test-count/summary, is required for production-touching changes.)

**Fix (trivial):** restore the deleted import line. After that, the change appears otherwise sound (see below) and should be resubmitted for a clean re-review.

---

## Gate results

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Existing Opportunity drawer visible UI unchanged | **FAIL** | Component does not compile (missing import, `:174`). The drawer — including `queuePosition` rendering — breaks. |
| 2 | Shadow evaluation flag-gated, default off | **PASS (design)** | `featureFlag.ts`: `isLayoutRuntimeOpportunityDrawer*` = `readFlag(..., false)`; all new flags default **off**. |
| 3 | Shadow failures cannot break drawer rendering | **PASS (design), but moot** | Hook header "Does not block VM drawer render. Failures are swallowed and logged only"; `useEffect`-scoped, `!shadowEnabled` early return, `res.json().catch(() => ({}))`. *However the import-deletion breaks rendering independent of the shadow path.* |
| 4 | No production body replacement | **FAIL** | Visible body would remain `OpportunityDrawerInquiryWorkflowOverview` / `OpportunityDrawerVmTabPanes` (unchanged) — but the file no longer compiles, so the body is broken. |
| 5 | No navigation/queue/person/child/seed changes bundled | **PASS** | Diff is exactly the 10 declared files; no migration/`QueueBlock`/nav/person/child/seed files. |
| 6 | No reveal/coordinated-loader regression | **FAIL (by build break)** | The shadow hook respects reveal (`vmReady = structureSettled && committedVisible`), but the compile error regresses the entire drawer reveal path. |
| 7 | No raw IDs / internal model names exposed | **PASS (minor note)** | Hidden mount carries `data-opportunity-id={drawer.id}` on an `aria-hidden hidden` div (debug attribute, flag-gated, not operator-visible). Telemetry uses `parityScore`/`readinessLevel`, not table/model names. Acceptable; noted. |
| 8 | Rollback is flags-only | **FAIL** | Disabling the flags does **not** fix the compile error; a **code revert** is required. Violates "no-ops when flags off" and the flags-only rollback requirement. |
| 9 | Telemetry/reporting diagnostic only | **PASS (design)** | Console `[layout_runtime_shadow:opportunity_drawer]`; API `{ ok, telemetry, report }` for diagnostics; no mutation. |
| 10 | Moves toward C1b without duplicate systems | **PASS (design)** | Reuses the Phase 3/4 shadow engine (`runRealOpportunityShadowValidation`); per-entity gating is the right C1b stepping stone — no parallel runtime. |

**Hard FAILs: Gates 1, 4, 8 (and 6 by consequence).** Per rubric, any gate FAIL → **REJECTED**, with the offending artifact cited.

---

## Special-attention items (as requested)

- **`OpportunityDrawerVmRuntime.tsx` diff:** small/surgical *except* the blocking import deletion. The hook call (`:160`-area) is at top level (React-rules-safe); the hidden mount and diagnostics are rendered as `{shadowEnabled ? <div hidden aria-hidden …/> : null}` and `{diagnosticsEnabled ? <Diagnostics/> : null}` — correctly `null` when off, no visible body. **Sound, but does not compile.**
- **Hook failure handling:** good — `useEffect`, early-returns, `cancelled` guard, swallowed `catch`, logs only. Cannot throw during render (it runs in an effect, not render).
- **Feature-flag defaults:** all new flags default **off** (`readFlag(..., false)`). ✓
- **Can shadow code throw during render?** No — shadow work is in `useEffect` + async fetch; not in the render path. (The render break here is the unrelated import deletion, not the shadow code.)
- **Does shadow work block first paint/reveal?** No — gated on `vmReady (structureSettled && committedVisible)` and runs async after settle; non-blocking by design.
- **Does the existing VM drawer body remain the visible source of truth?** By design yes (the overview/tab-panes body is untouched and the mount is `hidden`) — but the file must compile for this to hold; currently it does not.

---

## Required for resubmission

1. **Restore the deleted import** `resolveOpportunityQueueNavigatorPosition` from `@/lib/admin/opportunityDrawerQueueNavigator` in `OpportunityDrawerVmRuntime.tsx` (or remove the now-orphaned usage if intentional — but `queuePosition` is unchanged, so restoration is the correct fix).
2. **Add a build/type gate to CI for this branch** (e.g. `tsc --noEmit` / `next build`) so an unimported symbol fails fast — unit tests alone did not catch this.
3. Re-push; I will re-review against the new SHA. On the evidence above, once the import is restored the remaining gates (2,3,5,7,9,10) appear satisfied — but this is **not** a pre-approval; the clean diff will be re-run through all ten gates.

## Notes

- The C1a **shadow-mount design is good** — default-off per-entity flags, non-blocking `useEffect` hook with swallowed failures, hidden/`aria-hidden` mount, diagnostic-only telemetry, reuse of the Phase 3/4 engine. The rejection is solely due to a bundled, production-breaking accidental import deletion that is not flag-gated.
- **Minor (track, not blocking):** `data-opportunity-id` raw id on the hidden mount — acceptable as a flag-gated debug attribute, but confirm it is never surfaced when diagnostics are enabled in a shared environment.

*Convergence review of C1a @ `723386e0`. Evidence-based. REJECTED — production compile error (missing import) in `OpportunityDrawerVmRuntime.tsx:174`; resubmit with the import restored.*

---

# Re-review — Build-fix commit `eb31b947` (2026-06-07)

**Verdict: APPROVED** (supersedes the REJECTED above — the sole blocking defect is fixed).
**Reviewed:** `origin/cursor/c1a-opportunity-shadow-mount` @ `eb31b947` ("fix(runtime): restore queue navigator import in VM drawer"), on top of `723386e0`. Task: confirm the fix resolves the build break and that **nothing else changed** that affects the review.

## What the fix changed (and what it did not)

- **Fix is import-only.** `eb31b947` = **1 file, 1 insertion** — restores `import { resolveOpportunityQueueNavigatorPosition } from "@/lib/admin/opportunityDrawerQueueNavigator";` (now at `OpportunityDrawerVmRuntime.tsx:32`). The usage at `:175` is unchanged → symbol now **both imported and used**; build break resolved.
- **Nothing else changed.** The fix touched **only** `OpportunityDrawerVmRuntime.tsx`. The shadow lib/route/flags/tests/diagnostics are **byte-identical** between `723386e0` (reviewed) and `eb31b947` (`git diff --stat` over `web/lib/`, `web/app/api/`, `web/tests/`, diagnostics → empty).
- **Net branch state:** still exactly the **10** declared files; no migration/queue/nav/person/child/seed. The net diff of `OpportunityDrawerVmRuntime.tsx` vs base `ff39c2af` is now **purely additive shadow wiring** (queue-nav import nets to unchanged; +2 shadow imports, +hook, +hidden mount/diagnostics).
- Cursor reports `npx tsc --noEmit` clean on the file (consistent with the import now resolving).

## Gate results (final, @ `eb31b947`)

| # | Gate | Result |
|---|---|---|
| 1 | Existing visible UI unchanged | **PASS** — file compiles; visible body (`OpportunityDrawerInquiryWorkflowOverview` / `OpportunityDrawerVmTabPanes`) unchanged; `queuePosition` intact. |
| 2 | Shadow evaluation flag-gated, default off | **PASS** — all new flags `readFlag(..., false)`. |
| 3 | Shadow failures cannot break rendering | **PASS** — `useEffect`-scoped hook, early-return when off, swallowed `catch`; not in render path. |
| 4 | No production body replacement | **PASS** — hidden `aria-hidden` mount; body untouched. |
| 5 | No nav/queue/person/child/seed bundled | **PASS** — exactly 10 files. |
| 6 | No reveal/coordinated-loader regression | **PASS** — gated on `vmReady (structureSettled && committedVisible)`; no change to reveal path; compiles. |
| 7 | No raw IDs / internal model names exposed | **PASS (minor note)** — `data-opportunity-id` on the hidden, flag-gated mount; telemetry uses `parityScore`/`readinessLevel`, not model/table names. |
| 8 | Rollback flags-only | **PASS** — all C1a behavior no-ops when flags off (default); no unconditional code path. |
| 9 | Telemetry/reporting diagnostic only | **PASS** — console + `{ ok, telemetry, report }`; no mutation. |
| 10 | Moves toward C1b without duplicate systems | **PASS** — reuses Phase 3/4 shadow engine; per-entity gating is the C1b stepping stone. |

**All ten gates PASS.** The shadow-mount design (reviewed and praised in the original section) is unchanged; the only delta from the rejected commit is the restored import. → **APPROVED.**

## Forward notes (advisory, unchanged)

1. **Add a `tsc --noEmit` / `next build` gate to CI** for these branches so an unimported symbol fails fast — unit tests alone missed the original break. (Cursor ran it manually this time; make it automatic.)
2. **Re-review before flag-on / production cutover (C1b+).** This verdict covers the flag-off shadow mount; all gates re-apply when `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER` is enabled or the layout body becomes visible — including a parity check against the live VM drawer per the AdminV2 runtime-performance doctrine and drawer-VM runtime contract.
3. **Minor (track):** confirm `data-opportunity-id` on the hidden mount is never surfaced when diagnostics are enabled in a shared environment.

*Re-review of C1a build-fix `eb31b947`. Evidence-based; build break resolved, no other changes — APPROVED.*

---

# Re-review #2 — Compile gate + `data-opportunity-id` removal `0d07b5f5` (2026-06-07)

**Verdict: APPROVED** (confirms the APPROVED verdict; hardens it).
**Reviewed:** `origin/cursor/c1a-opportunity-shadow-mount` @ `0d07b5f5` ("Add compile gate for opportunity VM drawer and drop shadow mount opportunity id"). Task: review the new diff since the rejected SHA and confirm all C1a gates still pass.

## What `0d07b5f5` changed

- **`OpportunityDrawerVmRuntime.tsx`: −1 line** — removes `data-opportunity-id={drawer.id}` from the hidden shadow mount. Nothing else in the production file changed.
- **New `web/tests/adminV2/viewModel/opportunityDrawerVmRuntimeCompileGate.test.ts` (+30)** — imports `OpportunityDrawerVmRuntime` **and** `resolveOpportunityQueueNavigatorPosition`, asserts the component is a function and the resolver links (`:9–28`). Comment: *"Vitest compiles imported modules; this catches missing imports"* — i.e. **this test would have caught the original regression.**
- **Shadow lib/route/flags/diagnostics: unchanged** since the reviewed `723386e0` (`git diff --stat` empty) — original shadow-design review holds verbatim.

## Ten checks (final)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Deleted import restored | **PASS** | `:32` `import { resolveOpportunityQueueNavigatorPosition }` (eb31b947). |
| 2 | Production drawer compiles/type-checks | **PASS** | Import `:32` + usage `:175` linked; compile-gate test imports & type-checks the component; Cursor reports targeted `tsc --noEmit` clean. *(Repo note below.)* |
| 3 | Existing visible body unchanged | **PASS** | Only the hidden-mount data attribute changed; `OpportunityDrawerInquiryWorkflowOverview`/`VmTabPanes` untouched. |
| 4 | Shadow mount flag-gated, default off | **PASS** | `shadowEnabled ? <div hidden aria-hidden …> : null`; flags `readFlag(…, false)`. |
| 5 | Shadow failures cannot break rendering | **PASS** | `useEffect` hook, early-return when off, swallowed `catch`; not in render path. |
| 6 | No production body replacement | **PASS** | Hidden mount only; body is the source of truth. |
| 7 | No nav/queue/person/child/seed bundled | **PASS** | 11 files = 10 C1a + compile-gate test; no sensitive paths. |
| 8 | No reveal/coordinated-loader regression | **PASS** | Gated on `vmReady (structureSettled && committedVisible)`; compiles. |
| 9 | Rollback flags-only | **PASS** | All C1a behavior no-ops when flags off; no unconditional code path. |
| 10 | `data-opportunity-id` safe/removed/masked | **PASS** | **Removed** from the hidden mount. Remaining attrs `data-shadow-parity-score`/`data-shadow-readiness` are derived metrics, not record ids or model names. |

**All ten checks PASS → APPROVED.**

## Notes

- **Genuine hardening:** the new compile-gate test closes the exact regression class that caused the original REJECTED (satisfies prior forward-note #1 as an in-repo vitest gate that type-checks the component). The `data-opportunity-id` removal eliminates a raw record id from the DOM — strictly better than the earlier "acceptable" hidden attribute.
- **Repo-health note (not a C1a defect):** Cursor reports full `npx tsc --noEmit` fails on **pre-existing, unrelated** errors in other test files (`waitlistCandidateCard.test.ts`, `lifecycleStageRuntimeConfigContract.test.ts`, `attachQueueRowContextToItems.test.ts`) — none in the C1a diff (confirmed: not among the 11 changed files). C1a is not responsible. Recommend resolving that pre-existing typecheck debt so a **full** `tsc --noEmit` / `next build` CI gate can be green platform-wide; until then the targeted compile-gate test is the pragmatic enforcement for this component.
- **Re-review before flag-on / production cutover (C1b+)** remains required (live-VM parity per AdminV2 runtime-performance doctrine + drawer-VM runtime contract). Unchanged.

*Re-review #2 of C1a @ `0d07b5f5`. Evidence-based. Build break fixed, raw id removed, compile gate added — all ten gates pass. APPROVED.*
