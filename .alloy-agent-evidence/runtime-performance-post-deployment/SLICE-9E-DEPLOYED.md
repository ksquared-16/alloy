# SLICE 9E — FINAL P0-7.5 HEIGHT PROMOTION + PAINTED-SURFACE VERIFICATION

**`PRESENTATION_TRUTH_COMPLETE_DEPLOYED_CERTIFIED`**

P0-7.2 **PASS** · P0-7.3 **PASS** · P0-7.4 **PASS** · P0-7.5 **PASS** — all deployed.

No product repair was made in this run.

---

## PROMOTION

| | |
|---|---|
| Starting SHA | `468e1a787` (9D repair `95acdd275`, certification `50ec66d55`) |
| Reconcile | staging had moved 5 commits; merged at **`e1becd66e`** — zero file overlap, 9D propagation rule **byte-identical** to `95acdd275` |
| Candidate | **`e1becd66e`** |
| PR | [**#1052**](https://github.com/ksquared-16/alloy/pull/1052) — 12/12 checks pass |
| Merge SHA | **`96448f5d8`** |
| Deployed SHA | **`96448f5d8`** — exact equality |

Staging moved a second time while the merge awaited approval (`d8352385d`, access-identity PR #1051). Zero overlap with the candidate, GitHub reported #1052 `MERGEABLE / CLEAN`, and the branch head was unchanged, so the filed `expectedHeadSha` still matched — no reconciliation and no refile. One canonical promotion.

### Deployment proof

`/api/build-info`, read before any measurement:

| field | value |
|---|---|
| gitSha | `96448f5d8039364d081cbb99ce5513ff7601d0c0` |
| gitBranch | `staging` |
| gitMessage | Merge pull request #1052 … *let the solved band reach the card the operator sees* |
| nodeEnv | `production` · vercelEnv `preview` |
| deployment id | `dpl_3YbZDnfhNXMTpY6djf9aerNqyUVN` |
| Supabase | `ikaxilmwmrmbagoidedu` |
| QA session | `alloy_staging_web`, freshly minted (23 s at first use) |

Ancestry: merge `96448f5d8`, candidate `e1becd66e` and repair `95acdd275` all contained in the deployed SHA.

### Pre-promotion gates on the reconciled candidate

| gate | result |
|---|---|
| painted-surface browser certification | **41/41** |
| Presentation Truth focused regression | **295 / 296** |
| `vac run typecheck` | **rc=0** |
| `vac run typecheck:tests` | **rc=0** |
| `vac run build` | **rc=0** |

CI additionally ran **Surfaces / Focus Panel certification** green, which is the job that executes the geometry suite — so the new painted-surface gate ran on GitHub's runner, not only locally.

---

## P0-7.5 — PAINTED-SURFACE DEPLOYED GATE — **PASS**

### The instrument certified itself first

Before reporting any geometry, the harness proved what it was holding:

| check | result |
|---|---|
| the element measured as the card **is painted** | **true** — `article`, `rgb(255,255,255)`, border `1px`, radius `14px` |
| the layout wrapper above it is **NOT painted** | **true** — `rgba(0,0,0,0)`, border `0px` |
| painted card and wrapper are **different elements** | **true** |
| wrapper **contains** the painted card | **true** |

`[data-process-card='true']` was **not** used as the visible card. It resolves to `div.alloy-os-process`, the transparent wrapper that produced the 9C false PASS.

### Measurements

**SOLVED BAND H = 299** (solver-selected; not hardcoded).

| | |
|---|---|
| **Business Process** | |
| grid cell H | **299** |
| `.alloy-os-process` transparent wrapper H | **299** — now `display: flex` (the repair) |
| **PAINTED `article.alloy-os-ucard` H** | **299** |
| painted background | `rgb(255, 255, 255)` |
| painted border | `1px`, radius `14px` |
| **Financials** | |
| grid cell H | **299** |
| **PAINTED card H** | **299.19** |

| required | result |
|---|---|
| BP cell == H | **✓** |
| BP transparent wrapper == H | **✓** |
| **BP PAINTED article == H** | **✓** |
| Financials cell == H | **✓** |
| Financials PAINTED == H | **✓** |
| **BP PAINTED == Financials PAINTED** | **✓** |

### Residual whitespace

| | |
|---|---|
| deployed `f30e3bb0f` (the failure) | **67.23 px** uncovered beneath the painted card |
| deployed `96448f5d8` (now) | **0 px** |

The visible white bordered Business Process surface extends through the full solved band.

---

## VISUAL SPECIMEN — `slice9e-data/shots/P075-equal-height-band.png`

Business Process and Financials captured together, with the floating Operational Intelligence panel dismissed so nothing overlays the band.

| | BP | Financials |
|---|---|---|
| top | 292.50 | 292.50 |
| bottom | 591.50 | 591.69 |
| height | 299.00 | 299.19 |

Tops align, bottoms align, heights equal. The screenshot shows two white bordered cards forming **one equal-height band**, with the next row (Attendance, Children) starting cleanly beneath both. It does not merely measure correct — it **looks** like the intended band, which is what this specimen exists to prove.

Full-viewport context: `shots/P075-band-full.png`.

---

## PRESENTATION TRUTH SPOT CHECKS — all **PASS**

**P0-7.2 — record switch, zero stale prior-avatar frames.** Same pair as the original failure (`9ab36f48` → `8b3689fb`), 427 frames. Row selection **126 ms**, header text **126 ms**, avatar **126 ms** — all three on the same frame. **`STALE_PRIOR_AVATAR_FRAMES: 0`**.

**P0-7.3 — held rows remain explicitly transitional.** Switch to `new_leads` (3 rows) from 16: held/busy at **78 ms**, destination rows commit at **3 046 ms**, **103 frames** with prior rows under a visible held marker, **1** frame without — inside the acknowledgement window. Prior rows are never presented as live destination rows.

**P0-7.4 — reserved Household/Children intentionally resolving.** Caught mid-window at **10 680 ms**: 2 reserved configured cells, keys `children` and `household`, copy **"Resolving children…"** and **"Resolving household…"**. No fake data, no blank rectangle.

---

## EXTERNAL FINANCIALS RED — `EXTERNAL_FINANCIALS_TEST_DEBT`

`reservedGeometryConvergence.test.tsx:322` asserts the literal `data-financials-reserved={reservingAccount ? "true" : undefined}`; staging's `b4aae2b62` renamed the guard to `reservesFootprint`. Pre-existing on the promotion target, unchanged by this slice, and this slice touches no financials file. **Not repaired. Not hidden. Authorized no Financials change.** It is the single red inside the 295/296 focused run, reported rather than suppressed.

---

## UPDATED P0-7 LEDGER

| | state |
|---|---|
| **7.1** Structural Commit | OPEN — not authorized in this slice |
| **7.2** avatar identity | **CLOSED — deployed verified** |
| **7.3** held Work View rows | **CLOSED — deployed verified** |
| **7.4** reserved configured cells | **CLOSED — deployed verified** |
| **7.5** Process Card band fill | **CLOSED — deployed verified** |
| **7.6** actual server latency | out of scope |
| **7.7** stale docblock / admission premise | OPEN, low |

## REMAINING PRESENTATION TRUTH BLOCKERS

**None.** Every Presentation Truth defect opened by the P0-7 operator walkthrough is now closed and verified on the deployed build.

Outside Presentation Truth: P0-7.1 Structural Commit (its own slice), P0-7.7 (low), and the external Financials test debt owned by that programme.

## `READY_FOR_STRUCTURAL_COMMIT_SLICE = YES_PENDING_HUMAN_VISUAL_CONFIRMATION`

Four gates deployed-verified with the painted surface resolved by paint contract rather than by selector. The visual specimen is attached for human confirmation before Structural Commit begins.

**Structural Commit was NOT implemented.**

### What finally made this hold

Three contracts stand between the solver and the operator's eye — the solver produces H, the cell applies H, the painted card consumes H — and each had been green while a later one was broken. The programme reached a deployed PASS only once each had a gate that could fail independently, and once the measurement refused to trust a selector to mean "the card". Both of this slice's predecessors reported a clean local PASS on a defect that was still visible in production.
