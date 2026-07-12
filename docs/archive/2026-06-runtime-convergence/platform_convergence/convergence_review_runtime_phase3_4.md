# Convergence Review — Runtime Convergence Phase 3/4 (Opportunity Drawer Shadow Parity + Real-Record Validation)

**Verdict: APPROVED**
**Reviewed:** `origin/cursor/runtime-convergence-phase-3-4` @ `a3fbb0e2` ("Add Phase 3–4 opportunity drawer shadow parity and real-record validation"), on merge-base `8dd0f2f1`. The new Phase 3/4 work is the single commit `a3fbb0e2` (Phase 2 `83be04b7`+`b039bbdc` carry forward, already reviewed → APPROVED). New work: **+~1,100** across `web/lib/layout/runtime/shadow/**`, a shadow API route, `featureFlag.ts` (+14, additive), and shadow tests. **0 migrations. 0 production drawer/VM/queue/nav/seed files modified.**
**Reviewer:** Convergence Review Authority · rubric [`convergence_review_rubric.md`](./convergence_review_rubric.md).

---

## Task verification points

| Required check | Result | Evidence |
|---|---|---|
| Shadow parity uses **real VM + layout runtime** structures safely | **PASS** | `captureVmOpportunityDrawerStructure.ts` consumes an already-composed `OpportunityDrawerViewModel` (type/constant imports only) and **reads** `vm.layout.tabs` / `vm.above_fold.render_model` to snapshot — no mutation. `captureLayoutRuntimeDrawerStructure.ts` snapshots the Phase-1/2 runtime plan. Compared structurally (`compareOpportunityDrawerShadowParity.ts`). |
| Real opportunity validation is **proof/shadow-only** | **PASS** | `runRealOpportunityShadowValidation.ts:51` gates on `isLayoutRuntimeShadowReadPathEnabled()` → `404 "shadow_read_path_disabled"` when off; org-scoped via `assertRowOrg("opportunities", id, orgId)`; **read-only** (composes the VM + snapshots; no insert/update/upsert/delete). Header: "Composes live VM + resolves org layout for a real opportunity id." |
| **No production** drawer/VM/queue/nav/seed changes | **PASS** | Diff touches no `AdminEntityDrawer*`, `vmDrawer/*`, `drawerPipeline/*`, production `QueueBlock`, navigation, or seed files. `featureFlag.ts` is **additive only** (no `-` lines; no existing flag weakened). The VM composer is *imported and read*, never modified. |
| Flags remain **off** | **PASS** | New `LAYOUT_RUNTIME_SHADOW_ENABLED` defaults **false** (`readFlag(..., false)`). `isLayoutRuntimeShadowReadPathEnabled = shadow OR preview` — both default off. Comment: "Never enables live cutover." Shadow route `:124` 404s when disabled. |
| Gap reports are **diagnostic only** | **PASS** | `buildOpportunityDrawerShadowParityReport.ts` / `enrichShadowParityReport.ts` / `compareOpportunityDrawerShadowParity.ts` produce a parity/gap **report** returned as JSON from a GET route. No mutation, no layout rewrite, no cutover. |
| **No namespace drift** | **PASS** | No `child_inquiry.*` minted in shadow/route code. `opportunitySectionAliases.ts` maps **VM section keys → layout section keys** for parity (e.g. `inquiry_summary→[lead_summary]`, `inquiry_children→[children_inquiry, enrollment_children]`) — section-key aliasing, not child refKey drift. Carries Phase-2 canonical refKeys. |

---

## Ten gates

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Duplicate systems? | **No** | A **parity/diagnostic harness** over the existing VM + layout runtime — not a new runtime/presentation. |
| 2 | Contract violations? | **No** | No new block kinds/tabs/widgets/surfaces; snapshots are diagnostic structures, not LayoutDocs. |
| 3 | Namespace drift? | **No** | See above; section-key aliases only. |
| 4 | Runtime divergence? | **No (inverse)** | The harness **measures** VM↔layout-runtime parity — it de-risks convergence rather than diverging. |
| 5 | Child model violations? | **No** | Reuses Phase-2 canonical fixtures; diagnostic output, no raw OCM/`inquiry_child` product copy. |
| 6 | Flattening relationships into fields? | **No** | Structural comparison; no field modeling. |
| 7 | Production behavior changes? | **No** | GET-only flag-gated `/layout-proof` route; reads VM/records read-only; no production files modified. |
| 8 | Flag safety? | **PASS** | New flag default off; read-path = shadow OR preview (both off); additive flag module. |
| 9 | Migration safety? | **PASS** | 0 migrations. |
| 10 | Long-term convergence risk? | **Low (positive)** | Shadow parity is the correct pre-cutover gate; proving VM ≡ layout runtime before any switch reduces risk. |

---

## Outcome

All ten gates pass and all six task checks are satisfied with direct evidence. Phase 3/4 is a **read-only, flag-gated, diagnostic parity harness** that imports the production VM safely (read-only), validates real opportunities behind the shadow/preview flag with org-scoping, and emits gap reports — exactly the convergence-verification step the execution plan calls for before any cutover. → **APPROVED.**

## Forward notes (advisory)

- **Re-review before flag-on / production cutover.** This verdict covers the flag-off shadow harness. When the shadow flag is enabled in any environment, or the parity result is used to drive a cutover, all gates re-apply — especially production-behavior and child-model exposure of any newly-rendered surface.
- **Diagnostic report scope.** The shadow report includes a `recordId` (opportunity id) in admin-only, flag-gated JSON — acceptable for a diagnostic tool; ensure it never becomes an operator-facing surface.

*Convergence review of Runtime Convergence Phase 3/4 @ `a3fbb0e2`. Evidence-based; re-review required before flag-on / production cutover.*
