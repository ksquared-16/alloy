# REPAIR SLICE 9A — PROCESS CARD BAND FILL + BUILD GATE

Starting SHA `cfa712064` · repair `a31efe244` · certification this document
**Not merged, promoted or deployed.**

## FINAL STATUS: `REPAIR_SLICE_9A_COMPLETE_CERTIFIED`

*(P0-7.5 repaired and certified. The production build gate remains
`BUILD_GATE_BLOCKED_HOST_CAPACITY` — evidence in §Gates. It is not claimed.)*

## FILES CHANGED

| File | Change |
|---|---|
| `app/adminV2/components/alloyOsRuntime.css` | one rule: the cell inside the solved-grid intrinsic node stretches its card |
| `tests/surfaces/focusPanelBandFillRuntimePath.test.ts` | **new** — 11 tests on the runtime path |

**No component changed.** `ProcessCard` is design-locked and stays untouched.

---

## 1. THE MEASURED CHAIN (deployed, not inferred)

Both cards, walked from the card root up to the grid area, with computed styles:

| Layer | Business Process | Financials |
|---|---|---|
| `[data-fp-grid-area]` | **325 px**, `display:flex`, `align-items:stretch`, **inline `height:325px`** | identical |
| `.alloy-os-fp-card-intrinsic` | **325 px**, `flex column`, `min-height:100%` | identical |
| `.alloy-os-focus-panel-grid__cell` | **325 px**, `flex row`, **`align-items: flex-start`**, `flex:1 1 auto` | identical |
| **card root** | **232 px** · `display:block` · `min-height:auto` | **325 px** · `display:block` · `min-height:auto` |

`.alloy-os-fp-canvas--grid`; the legacy grid ancestor **is** present.

### First divergent fill boundary

**`.alloy-os-focus-panel-grid__cell` — `align-items: flex-start`.**

The cell stretches to the band (325 px) and then refuses to stretch its child. Both cards are affected
identically; the chain is the same for both. **Financials is not obeying the band either** — it reaches
325 px because it sets its own `min-height` (`FOCUS_PANEL_RESERVED_MIN_HEIGHT` / its settled footprint),
a mechanism Business Process has none of. Remove that and Financials would sit at its natural height too.

This corrected an inference of mine. I first concluded the cell's `display:flex` rule was scoped to an
ancestor the published path lacks; the measurement showed the ancestor **is** present and the cell **is**
flex. The real cause was one property further in. The chain was measured rather than reasoned because
this programme has repeatedly shown CSS read alone to mislead.

### Where `flex-start` comes from, and why it is right where it is

```css
/* Composed cells take their card's NATURAL height (no equal-height stretch) so
 * the lanes interlock. Each cell fills its lane / its grid span. */
.alloy-os-focus-panel-grid--composed .alloy-os-focus-panel-grid__cell {
  display: flex;
  align-items: flex-start;
```

Correct for the **lanes** composition. Wrong in the **solved grid**, where a band height was just
computed precisely to make the cards equal, and `flex-start` discards it at the last layer.

---

## 2. DESIGN-LAB / FIXTURE CHECK

* `cardLab.css` contains **no** reference to `.alloy-os-fp-card-intrinsic` (asserted by test).
* `.alloy-os-fp-card-intrinsic` is rendered **once**, in the grid branch of `FocusPanelCardGrid`
  (asserted by test: exactly one occurrence). The lanes branch renders `.alloy-os-fp-lane`; the stack
  renders `.alloy-os-fp-canvas--stack`. Neither creates the intrinsic node.
* Therefore standalone/lab/lanes/stack usage **cannot be reached** by this rule, and their
  natural-height behaviour is preserved. `ProcessCard` is not globally forced to 100% height — it is
  not touched at all.

---

## 3. THE REPAIR

```css
.alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell {
  align-items: stretch;
}
```

One declaration, scoped to the only path that has a solved band height.

**Not changed:** the height solver, the measurement strategy, the row-band algorithm, card ordering,
grid placement, the solved height itself, Financials sizing, or any card component.

### Arbitrary-height proof

No pixel value appears in the rule — asserted by test (`not.toMatch(/\d+px/)`, `not.toContain("325")`).
Height reaches the card through three inherited links, none of them a constant:

1. solver → wrapper: `height: ${boxOf.height}px` (inline, whatever the band solved)
2. wrapper → intrinsic: `min-height: 100%`
3. cell → card: `align-items: stretch`

So for any `H` the solver produces: wrapper `H` → intrinsic `H` → card `H`.

### Equal-height result

| | before | after |
|---|---:|---:|
| BP wrapper | 325 | H |
| Financials wrapper | 325 | H |
| **BP visible card** | **232** | **H** |
| Financials visible card | 325 | H |

Content stays top-aligned: the rule sets no `justify-content` and no `flex-direction` (asserted). The
extra band height belongs to the card surface, not to unexplained white space beside it.

**Deployed verification is owed** — this is a local certification of the CSS contract on the measured
chain, not a deployed measurement of the fix.

---

## 4. PLANTED DEFECT — THE SAME HOLE, A FOURTH TIME

| Suite | With the fill removed |
|---|---|
| `focusPanelBandFillRuntimePath` (new, runtime path) | **2 of 11 FAIL**, incl. *"THE GATE: the cell inside the intrinsic node stretches its card"* |
| `focusPanelRowHeightSolver` (existing, solver only) | **20/20 PASS** |

The solver suite stays green under the exact defect the operator saw. **Testing a producer cannot
certify the downstream application of its result** — the fourth layer at which this programme has found
that shape (card admission, transport, phase convergence, and now height application).

---

## 5. GATES

| Gate | Result |
|---|---|
| Band-fill runtime path (new) | **11/11 pass** |
| Presentation Truth (Slice 9) — identity, held rows, reserved cells | **23/23 pass** |
| Focused regression — band fill, row-height solver, presentation truth, transport, phase convergence, Slice 4 admission, P0-1, P0-3/P0-4, reserved geometry, mountability, grid layout, producer parity, root readiness, drawer-attention authorization | **273/273 pass**, 20 files |
| `vac run typecheck` | **rc=0** |
| **`vac run build`** | **`BUILD_GATE_BLOCKED_HOST_CAPACITY`** |
| Request-count impact | **0** — one CSS declaration |

### Broker evidence (current, this run)

```
Governed 0 plus unbrokered 16 exceeds the enforced budget of 9.
deficit : 1.5 GB
· lane_141c9c1f3f2f "Access & Identity" — heavy_test — npm exec vitest run tests/access tests/metrics tests/adminV2
· lane_141c9c1f3f2f "Access & Identity" — heavy_test
error: validation capacity refused by the S5 broker
```

Five attempts across Slices 9 and 9A, all refused, with PIDs changing between them — the peer lane is
re-running, not stuck. **Not forced**, and per the instruction this is not a candidate build failure:
the broker refusal is a host capacity condition owned by another lane, and admitting it would repeat a
known rc=143 termination.

### Architecture guards

Untouched, as instructed: `SurfaceHostContext` boot shell, `isOperationallyResolved`, the
structural/semantic gate split, `visible_construction_ms`, pre-commit shell, card readiness, card
admission. No new cache, reveal engine or subject system.

---

## 6. PROGRAMME

### P0-7 ledger

| # | Item | Status |
|---|---|---|
| 7.1 | structureless window (~10.6 s) | **OPEN — Slice 10**, untouched |
| 7.2 | stale subject identity | **REPAIRED** (Slice 9) |
| 7.3 | held rows presented as live | **REPAIRED** (Slice 9) |
| 7.4 | reserved cells look broken | **REPAIRED** (Slice 9) |
| 7.5 | BP/Financials height | **REPAIRED** (this slice) |
| 7.6 | server latency | OUT OF SCOPE — separate programme |
| 7.7 | stale docblock / admission premise | OPEN — low |

### `READY_FOR_PRESENTATION_TRUTH_PROMOTION`: **YES, on the build gate alone**

The candidate is one clean unit: Presentation Truth (7.2–7.4) plus the height fill (7.5). Four planted
defects across the two slices, each binding to its own gate; 273/273 focused regression; typecheck
clean; zero new requests; no architecture touched. **The build gate is the only outstanding item, and
its refusal is a host condition, not a property of this candidate.** Re-attempt when the peer lane's
heavy suite is idle.

### Prerequisites for the Structural Commit slice (Slice 10)

1. **This candidate built, promoted, deployed and accepted.** Structural commit makes *more* surface
   visible earlier; doing it while held content still misrepresents itself would multiply the lie —
   and 7.5 had to land first for the same reason (early structure would otherwise re-equalise visibly,
   the defect the solver exists to prevent). That prerequisite is now satisfied in code.
2. **`visible_construction_ms = 0` renegotiated explicitly.** It is an absolute documented acceptance
   metric and structure-before-content is illegal under it. The operator's decision, not mine.
3. **A decision on the pre-commit shell** — header, Work View pills with their already-known counts, and
   an explicitly-pending queue. The audit found this `PARTIALLY_VIABLE` and it needs no fake grid; what
   it cannot do is draw the real card geometry, because the composition seed does not exist until the
   provisioning answer returns.
