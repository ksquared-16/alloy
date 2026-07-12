# Convergence Review — C1b Opportunity Drawer Overview Body Layout Runtime Pilot

**Verdict: APPROVED** — *(updated 2026-06-07; error-boundary patch `5b19e871` resolved the Gate-4 blocker. Original verdict below was REJECTED @ `9bcc688c`. See the Re-review addendum at the end.)*
**Reviewed:** `origin/cursor/c1b-opportunity-drawer-layout-runtime-pilot` — `9bcc688c` (orig, REJECTED) → **`5b19e871`** (error-boundary patch). **0 migrations. No Person/Child/QueueBlock/nav/seed/Admin-cutover files.**

> The body below is the **original REJECTED review** of `9bcc688c`, retained for the record. Its blocking defect is fixed by `5b19e871`; the verdict is superseded by the Re-review addendum at the end.

---

**Original verdict (9bcc688c): REJECTED**
**Reason:** Gate 4 (fallback if layout **render** fails) is **not implemented**. There is **no React error boundary** anywhere in the drawer render ancestry, and the fallback is purely data-driven (fetch/resolve only). A render-phase exception in the layout body **escapes uncaught and crashes the drawer** instead of falling back to the VM overview body — the exact "exceptions escape render" risk this review must gate. For a production body-replacement cutover, this is a hard FAIL of the core safety gate.
**Reviewer:** Convergence Review Authority · rubric [`convergence_review_rubric.md`](./convergence_review_rubric.md) · contracts [`adminv2-runtime-performance-doctrine.md`](../system/adminv2-runtime-performance-doctrine.md), [`drawer-view-model-runtime-contract.md`](../system/drawer-view-model-runtime-contract.md) · prior [`convergence_review_c1a_opportunity_shadow_mount.md`](./convergence_review_c1a_opportunity_shadow_mount.md).

---

## ⛔ Blocking defect — render-failure fallback is absent (Gate 4)

The cutover's stated safety property is "if the layout body fails, show the VM overview body." It is **half-implemented**:

- **Resolve/fetch/empty/unsupported failure → VM fallback: ✅ works.** `useOpportunityDrawerLayoutRuntimeBody.ts` runs the fetch in a `useEffect` (`requestIdleCallback`/`setTimeout`), `res.json().catch(...)`, `.catch((err) => setPhase("fallback"))`, and validates `json.doc?.sections?.length && json.record` else `phase="fallback"`. On any of these the switcher renders the VM body.
- **Render-phase exception → VM fallback: ❌ does not exist.** Once `bodyReady && doc && record`, `OpportunityDrawerOverviewBody.tsx` renders `<LayoutRuntimeDrawerBodyView doc record />` → `LayoutRuntimePlanView variant="production"`. If that subtree **throws during render** (a malformed/edge-case section or binding that passes the shallow `sections.length`+`record` check), the exception propagates **uncaught**:
  - `git grep componentDidCatch|getDerivedStateFromError|ErrorBoundary` over `web/components/**`, `web/app/**`, `web/lib/layout/**` → **NONE**. No boundary in the body, the renderer, or any ancestor.
  - The hook's `try/.catch` is **effect-scoped** — React render-phase errors are **not** catchable by `try/catch` in an effect or async callback; only an **Error Boundary** catches them.

**Effect:** in a pilot environment with the body flags on, a single render-throw crashes the opportunity drawer (white-screen/unmounted subtree) with **no graceful fallback to the VM body** — violating Gate 4 and the special-attention item "whether layout runtime exceptions can escape render" (they can).

**Mitigating but not sufficient:** the production renderer is genuinely defensive (`resolveProofBindingValue.safeDisplay` returns placeholders, not throws; `isLayoutItemSupportedForProduction` fail-closes; sanitization returns `null`), so render-throws are **low-probability** — but the hook validates only `doc.sections.length` and `record` presence, not each section/item shape, so a structurally-present-but-malformed doc can still throw. Low probability is **not** the guarantee Gate 4 requires for a production cutover.

**Required fix (single, localized):** wrap the layout-runtime body subtree in a **React Error Boundary** whose fallback renders the VM `OpportunityDrawerInquiryWorkflowOverview` (and logs, like the resolve path). Then a render throw degrades gracefully to the VM body — satisfying Gate 4. Resubmit after that (fast, C1a-style).

---

## Gate results

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Flags off → visible UI unchanged | **PASS** | `isLayoutRuntimeOpportunityDrawerBodyEnabled* = isLayoutRuntimeEnabled && isLayoutRuntimeOpportunityDrawerEnabled` — both default off; switcher → VM body when `!cutoverEnabled`. |
| 2 | Flags on → only overview body layout-rendered | **PASS** | `OpportunityDrawerVmRuntime.tsx` replaces only the overview-tab body block with `<OpportunityDrawerOverviewBody>`; shell/header/tabs outside it. |
| 3 | Header/tabs/status/actions/lifecycle rail VM-owned | **PASS** | The swapped block is the overview body only; all chrome is unchanged in the diff. |
| 4 | Fallback to VM body if layout resolve/**render** fails | **FAIL** | Resolve fallback works; **render-failure fallback is absent** (no error boundary). See blocking defect. |
| 5 | No Person/Child/QueueBlock/nav/seed/Admin cutover bundled | **PASS** | Sensitive-path sweep → none. |
| 6 | No reveal/coordinated-loader regression | **PASS** | VM body shows first; layout body swaps in only after `vmReady (structureSettled && committedVisible)`; reveal gates VM-owned. |
| 7 | No raw IDs / internal model names in visible UI | **PASS** | Production `operatorLabel` returns `item.label?.trim()` (**never `refKey`**); display sanitized via `isOpaqueIdValue` + `INTERNAL_OPERATOR_TOKENS` → `null`. |
| 8 | Unsupported layout items fail closed | **PASS** | `isLayoutItemSupportedForProduction`: `!shouldRenderProofItem` → false; `FUTURE_MODULE_METADATA_KEY` → false; `widget_placeholder` only if `PRODUCTION_WIDGET_KEYS.has(refKey)`; else true. Unsupported omitted. |
| 9 | Rollback is flags-only | **PASS** | No unconditional path; disabling either flag returns the VM body. |
| 10 | Advances cutover without duplicate systems | **PASS** | `variant="production"` on the existing `LayoutRuntimePlanView` (+ thin `LayoutRuntimeDrawerBodyView`); reuses the Phase 3/4 engine — no parallel renderer/system. |

**Hard FAIL: Gate 4.** Per rubric, any gate FAIL → **REJECTED**, with the offending artifact cited.

---

## Special-attention items (as requested)

- **`OpportunityDrawerVmRuntime.tsx`:** the swap is scoped to the overview-tab body only (`OpportunityDrawerInquiryWorkflowOverview` block → `<OpportunityDrawerOverviewBody>`); header/tabs/status/actions/lifecycle/queue-nav/save orchestration untouched. ✓
- **Renderer extraction proof→production:** well done — `LayoutRuntimeVariantContext` ("proof"|"production"), production strips `BindingBadge`/`—`/reason and `refKey` fallback, omits future modules. ✓
- **Proof-only diagnostics leaking into production:** **No** — proof artifacts are `variant === "proof"`-gated; the diagnostics panel is flag-gated (default off). ✓
- **Editing/save behavior changed?** **Concern (confirm intent).** The layout-runtime body is **read-only display** (`resolveProofBindingValue` → display). When the body flags are on, the overview body loses any inline editing the VM body provided; **save orchestration stays VM-owned**. This is a display-parity pilot — reasonable per the cutover plan, but it **is** a flags-on behavior change. Confirm the cutover plan intends a read-only overview body for the pilot; document it so operators/pilot owners expect it.
- **Reveal gates weakened?** **No** — gated on `vmReady`; VM body shows first. ✓
- **Can layout runtime exceptions escape render?** **Yes** — the blocking defect.

---

## Required for resubmission

1. **Add a React Error Boundary** around the layout-runtime body (`LayoutRuntimeDrawerBodyView`) whose fallback renders the VM `OpportunityDrawerInquiryWorkflowOverview` and logs (mirroring the resolve-failure path). This makes Gate 4 true for render-phase failures. **Add a test** that forces the layout body to throw and asserts the VM body renders (no crash).
2. **Confirm/document the read-only overview body** for the pilot (editing/save expectation) per the cutover plan.
3. Re-push; I will re-run all ten gates against the new SHA. On the evidence above, the other nine gates pass — but this is **not** a pre-approval.

## Notes

- C1b is otherwise strong: scoped overview-body swap, both flags default-off, fail-closed unsupported handling, no `refKey`/opaque-id/model-name leak, no proof-diagnostic leak, reveal gates intact, no Person/Child/queue/nav/seed/admin changes, and reuse of the existing renderer via a variant (no duplicate system). The single, decisive gap is the **missing render-failure error boundary** — the core safety net for a body-replacement cutover — which the rubric and this review treat as a hard Gate-4 requirement, not an advisory.
- Consistent with C1a's handling: verify the actual safety mechanism, don't accept "flags off / tests pass / low probability" in place of the required guarantee. The fix is a single component + test → fast resubmit.

*Convergence review of C1b @ `9bcc688c`. Evidence-based. REJECTED — Gate 4 render-failure fallback absent (no error boundary); resubmit with an error boundary that falls back to the VM overview body.*

---

# Re-review — Error Boundary patch `5b19e871` (2026-06-07)

**Verdict: APPROVED** (supersedes the REJECTED above — the sole blocker is resolved).
**Reviewed:** `origin/cursor/c1b-opportunity-drawer-layout-runtime-pilot` @ `5b19e871` ("Wrap C1b layout overview body in Error Boundary with VM fallback on render failure"). Patch since the rejected SHA = 1 commit; files: error boundary + logger + overview-body wiring + body-view comment + 2 tests + cutover-plan doc + `package.json`/lock (jsdom). No sensitive paths.

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Layout body wrapped in a React Error Boundary | **PASS** | `OpportunityDrawerLayoutRuntimeBodyErrorBoundary.tsx` — class `extends Component`, `static getDerivedStateFromError(){ return {hasError:true} }`, `componentDidCatch` logs; wraps `<LayoutRuntimeDrawerBodyView>` in `OpportunityDrawerOverviewBody.tsx`. |
| 2 | Boundary fallback renders the VM overview body | **PASS** | `<…ErrorBoundary fallback={vmFallback}>` where `vmFallback = <VmOverviewBody>` → `OpportunityDrawerInquiryWorkflowOverview`; `render(){ if(hasError) return this.props.fallback }`. |
| 3 | Render-phase exceptions cannot crash the drawer | **PASS** | Error boundary catches render throws in its subtree and renders the VM body; shell/header/tabs/actions outside the boundary are unaffected. Proven by test (check 10). |
| 4 | Fetch/resolve/evaluate failures still fallback | **PASS** | Hook path unchanged: `phase="fallback"` on `.catch`/empty-doc → `: vmFallback`. |
| 5 | Flags off → unchanged VM body | **PASS** | `cutoverEnabled` requires both `LAYOUT_RUNTIME_ENABLED` && `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER` (default off) → `vmFallback`. |
| 6 | Header/tabs/status/actions/lifecycle rail VM-owned | **PASS** | Swap remains scoped to the overview body; chrome untouched (unchanged from C1b base). |
| 7 | No nav/queue/person/child/seed/Admin changes | **PASS** | Sensitive-path sweep → none; patch is boundary/logger/body/tests/docs/package. |
| 8 | No proof diagnostics / raw IDs / model names leak | **PASS** | Production-variant sanitization unchanged; data attrs are booleans/source-key (`data-layout-runtime-readonly="true"`), not model names; `opportunityId` appears only in the **console** logger, never in UI. |
| 9 | Read-only display parity documented | **PASS** | `layout_runtime_cutover_plan.md` ("Read-only display parity — … no inline editing or save paths in C1b … shell save orchestration stays VM-owned") + component/body-view header docs. |
| 10 | Tests include forced render-throw fallback | **PASS** | `opportunityDrawerLayoutRuntimeBodyErrorBoundary.test.tsx` (`@vitest-environment jsdom`): `ThrowOnRender` throws during render; test asserts the VM fallback renders (`[data-drawer-vm-runtime-overview]` present, "VM overview fallback" text) and the diagnostic is logged. |

## Also-verify

- **jsdom devDependency:** **acceptable, test-scoped.** Added to `devDependencies` (beside `eslint`); the boundary test uses a per-file `@vitest-environment jsdom` pragma — no global vitest-env change, so other tests are unaffected.
- **`console.info` diagnostic not operator-visible:** **confirmed** — `logLayoutRuntimeBodyRenderFailure.ts` header "Console-only; never shown to operators"; it `console.info(...)`s and renders nothing.
- **`data-layout-runtime-readonly="true"` safe:** **confirmed** — boolean marker on the layout-body wrapper; no model/table names.

## Outcome

The Gate-4 blocker is resolved **correctly and idiomatically**: a proper React Error Boundary catches render-phase exceptions in `LayoutRuntimeDrawerBodyView` and falls back to the VM overview body, with a forced-render-throw jsdom test proving it. The prior secondary concern (read-only overview body when flags on) is now **documented** (cutover plan + component headers) as intended pilot scope. All ten checks and all three also-verify items pass; the other nine gates from the original review are unchanged. → **APPROVED.**

## Forward notes (advisory)

- **Re-review before flag-on in production** remains standard for a body-replacement cutover (live-VM parity per AdminV2 runtime-performance doctrine + drawer-VM runtime contract). The error boundary makes the pilot safe to enable; confirm parity telemetry (from the C1a shadow path) looks healthy before widening the pilot.
- **Editing parity is deferred** — the layout body is read-only by design in C1b; track the editable-sections cutover as a later sprint (documented).

*Re-review of C1b error-boundary patch `5b19e871`. Evidence-based. Render-failure fallback now implemented and tested — APPROVED.*
