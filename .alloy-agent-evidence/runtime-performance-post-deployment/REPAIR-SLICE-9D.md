# REPAIR SLICE 9D — FINAL PROCESS CARD HEIGHT PROPAGATION

**`REPAIR_SLICE_9D_COMPLETE_CERTIFIED`**

| | |
|---|---|
| Starting SHA | `468e1a787` |
| Repair SHA | `95acdd275` |
| Certification SHA | this commit |
| Deployed under test | `f30e3bb0f` |

Not merged, promoted or deployed.

## FILES CHANGED — 6

| file | why |
|---|---|
| `web/app/adminV2/components/alloyOsRuntime.css` | **the repair** — two declarations |
| `web/playwright/geometry/paintedSurface.spec.ts` | new — the painted-surface browser gate |
| `web/playwright/geometry/paintedSurfaceFixture.tsx` | new — real `UniversalCard` in the real nesting |
| `web/playwright/geometry/nodeCryptoShim.ts` | new — browser stand-in for a node builtin in the bundle graph |
| `web/playwright/geometry/harness.ts` | one alias entry so the graph bundles |
| `web/tests/surfaces/focusPanelBandFillRuntimePath.test.ts` | the source-level half of the third contract |

No product file other than the stylesheet. `ProcessCard.tsx` untouched.

---

## 1 · THE FINAL DOM BOUNDARY, MEASURED ON DEPLOYED `f30e3bb0f`

Traced before any mutation — not inferred from source.

| element | computed H | display | min-height | flex | painted? |
|---|---|---|---|---|---|
| `div[data-fp-grid-area]` solved wrapper | 299 | block | — | — | no |
| `div.alloy-os-fp-card-intrinsic` | 299 | flex column | `100%` | — | no |
| `div.alloy-os-focus-panel-grid__cell` | 299 | flex, **`align-items: stretch`** | 0 | `1 1 auto` | no |
| `div.alloy-os-process` ← `[data-process-card='true']` | **299** | **block** | `auto` | `0 1 auto` | **no** — `rgba(0,0,0,0)`, border `0px` |
| `article.alloy-os-ucard` | **231.77** | flex column | 0 | `0 1 auto` | **YES** — `rgb(255,255,255)`, border `1px`, radius `14px` |
| Financials `article.alloy-os-ucard` | **299.19** | flex column | 0 | `0 1 auto` | **YES** |

`.alloy-os-process` **== H ✓** · painted article **< H ✓** · **residual whitespace 67.23px**.

### Layout wrapper vs painted surface

`[data-process-card='true']` and `[data-universal-card-key='business_process']` are **different elements**; the former **contains** the latter. The former is transparent and borderless — it cannot be what an operator sees. The latter carries the white ground, the 1px border and the 14px radius. The 67.23px gap is the panel ground showing beneath a card that looks finished.

### The exact propagation failure

`ProcessCard.tsx:137` renders `<div className="alloy-os-process" data-process-card="true">` around its `UniversalCard`. **No bare `.alloy-os-process` rule exists anywhere in the codebase** — only `__`-suffixed BEM children — so the wrapper is a default block box.

The cell's `align-items: stretch` stretches its **direct child**. For every other card that child *is* the painted article, so the band lands on the visible surface. For Business Process the direct child is the block wrapper, and **a block container does not pass its height to its child**. The article kept its content height. Financials has no wrapper, which is the entire reason it was never broken.

So the defect was never the solver, the wrapper, or the cascade. All three were correct and stayed correct.

---

## 2 · THE REPAIR

```css
.alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell > .alloy-os-process {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell > .alloy-os-process > .alloy-os-ucard {
  flex: 1 1 auto;
  min-height: 0;
}
```

**Flex column rather than `height: 100%`** — the wrapper's height here is a stretched flex cross-size, and resolving a percentage against it is the fragile spelling of the same intent. `flex: 1 1 auto` says what is meant: take the space the band already assigned. `min-height: 0` keeps a tall card scrollable inside the band instead of overflowing the solved row.

**No pixel value is named.** **No `!important`.** **No specificity inflation** — `.alloy-os-process` has no competing rule to beat.

### Isolation

Both selectors are rooted at `.alloy-os-fp-card-intrinsic`, which **only the solved-grid branch renders**. Asserted, not assumed: no unscoped `.alloy-os-process` rule may exist; `cardLab.css` never references the intrinsic node; the lanes/stack branches render `alloy-os-fp-lane` instead. Design lab, standalone, lane and stack keep ProcessCard's natural height.

---

## 3 · PAINTED-SURFACE CERTIFICATION — `playwright/geometry/paintedSurface.spec.ts`

A browser gate, because the claim is a **rectangle** and jsdom computes none — an equal-height assertion there passes against any implementation at all. It renders the **real `UniversalCard`** with the **real stylesheet** in the **real nesting**, one card wrapped and one bare, on the same band.

### Selector certification (§4) — the instrument is certified before it is used

The gate never trusts a selector to mean "the card". It resolves the painted surface by its **paint contract** — opaque background **and** a real border — and asserts as gates in their own right:

- `THE GATE: the element this suite measures as the card IS painted` — opaque bg, border > 0, tag `article`
- `THE GATE: the layout wrapper above it is NOT painted, so measuring it would be a false pass`
- the wrapper and the painted card are **different elements** — the asymmetry under test, with Financials as the unwrapped control

**Point this gate at `[data-process-card='true']` and it fails.** That is the property that makes the rest of it worth anything: 9C measured that selector, read the band height off a transparent box, and reported a clean PASS.

### Arbitrary-H proof

Heights **188 / 313 / 471 / 664** — deliberately not 299 or 325, the two values this defect has been measured at. At each, the chain is asserted link by link so a failure names the hop that dropped the height, and both painted cards must equal H within 1px.

| | result |
|---|---|
| painted Business Process H | **== band H at every value** |
| painted Financials H | **== band H at every value** |
| residual whitespace at H=471 | **0px** (was 67.23px deployed) |
| fill is band-consumption, not content | content 40px in a 640px band → painted card 640px |
| band shorter than content | content 900px in a 200px band → painted card 200px, row beneath not pushed open |

**10/10 pass.** Full geometry suite **41/41** — the harness alias did not disturb the existing gate.

---

## 5 · PLANTED DEFECT — THREE CONTRACTS, SEPARATED

Removing the propagation rule restores the exact deployed `f30e3bb0f` state.

| gate | under the plant | owns |
|---|---|---|
| **painted-surface browser gate** | **7 FAILED / 3 passed** | *the painted card consumes H* |
| `focusPanelRowHeightSolver` | **20/20 PASS** | *the solver produces H* |
| cell-stretch cascade gate | **PASS** | *the cell applies H* |
| `focusPanelBandFillRuntimePath` | 2 failed / 19 passed — **only the two new propagation gates** | source-level half of contract three |

Under the plant the painted card pins to **161.59px at every band height** — 188, 313, 471 and 664 alike, which is content height, not band height — and **309.41px** of the H=471 band is uncovered.

The **3 painted tests that still pass are the three selector-certification tests**, correctly: the instrument's contract is unaffected by the propagation rule. That is the decomposition working, not a gap.

> **Recorded explicitly, as instructed:** `focusPanelRowHeightSolver` passes **20/20 under the plant**, and the cell-stretch cascade gate stays green. This is the **third slice running** in which the solver is green while the product is visibly broken, and the second in which the cascade gate is too. Each layer's gate is blind to the next layer's failure by construction — which is exactly why all three now exist separately.

---

## 6–7 · REGRESSION

| | |
|---|---|
| **P0-7.2** identity | **green** |
| **P0-7.3** held rows | **green** |
| **P0-7.4** reserved resolving | **green** |
| Closed-P0 focused (P0-1 loader, P0-2 admission + commit meaning, P0-3/P0-4 semantics, P0-5 work-view presentation, participant transport + phase convergence, reserved + settlement geometry, grid layout, producer parity, root readiness, attendance/health, content-driven height, visual vacancy) | **green** |
| **Total** | **295 passed / 1 failed (296) across 22 files** |

### The one red — `EXTERNAL_FINANCIALS_TEST_DEBT`

`reservedGeometryConvergence.test.tsx:322` asserts the literal `data-financials-reserved={reservingAccount ? "true" : undefined}`. Staging's `b4aae2b62` renamed the guard to `reservesFootprint`. **Pre-existing on the promotion target, unchanged by this slice, and this slice touches no financials file.** Classified, not repaired, per the ownership decision. It authorizes nothing here.

---

## 8 · GATES

| gate | result |
|---|---|
| focused tests | **295/296** (the 1 = external debt above) |
| geometry browser suite | **41/41** |
| `vac run typecheck` | **rc=0** |
| `vac run typecheck:tests` | **rc=0** |
| `vac run build` | **rc=0** |
| broker | all admitted, **no capacity forced** |
| **request impact** | **ZERO** — CSS and tests only; no new fetch, hook, query or subscription |

### Architecture guards

Height solver untouched · solved band untouched · grid untouched · composed-cell stretch untouched · `ProcessCard` untouched · Financials untouched · card readiness untouched · card admission untouched · 7.2/7.3/7.4 untouched · no Structural Commit · `visible_construction_ms`, `SurfaceHostContext`, `isOperationallyResolved` untouched · no Track A · no S8-2 · no server-latency work.

---

## UPDATED P0-7 LEDGER

| | state |
|---|---|
| **7.1** Structural Commit | OPEN — not authorized in this slice |
| **7.2** avatar identity | CLOSED — deployed verified |
| **7.3** held Work View rows | CLOSED — deployed verified |
| **7.4** reserved configured cells | CLOSED — deployed verified |
| **7.5** Process Card band fill | **REPAIRED + CERTIFIED locally — deployed verification owed** |
| **7.6** actual server latency | out of scope |
| **7.7** stale docblock / admission premise | OPEN, low |

## `READY_FOR_PRESENTATION_TRUTH_HEIGHT_PROMOTION = YES`

One candidate, four gates green, and a planted defect that binds the new gate to the deployed failure it fixes while leaving the two upstream gates green — which is the proof that the new gate measures something neither of them could.

**Honest caveat, third time of asking:** this defect has now produced a false local PASS twice — once when the cascade rule was inert, once when the harness measured the transparent wrapper. The difference this time is that the gate resolves a rectangle in a real engine at four arbitrary heights and refuses to measure anything that is not painted. Only the deployed measurement settles it.

## `READY_FOR_STRUCTURAL_COMMIT_SLICE = NO`

Unchanged, and until P0-7.5 is **deployed verified** — not merely repaired.
