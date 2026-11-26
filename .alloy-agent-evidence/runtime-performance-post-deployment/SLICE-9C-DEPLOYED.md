# SLICE 9C — FINAL PRESENTATION TRUTH PROMOTION + DEPLOYED VERIFICATION

**FINAL STATUS: `PRESENTATION_TRUTH_DEPLOYED_PARTIAL`** — failed gate **P0-7.5**.

P0-7.2 **PASS** · P0-7.3 **PASS** · P0-7.4 **PASS** · P0-7.5 **FAIL** · closed-P0 spot checks **PASS**.

No product repair was made in this run, per the failure policy.

---

## PROMOTION

| | |
|---|---|
| Starting SHA | `c6c335732` (9B certification `7403672bf`) |
| Reconcile | staging had moved 14 commits; merged at `4315a6abb` — **zero file overlap** with the candidate |
| Candidate SHA | `4315a6abba5d2f1b95f4a16b01b7e5923e12d2d6` |
| PR | [#1050](https://github.com/ksquared-16/alloy/pull/1050) — 12/12 checks pass |
| Merge SHA | `f30e3bb0f883e9264acbd1c6059562aeb0718323` |
| Deployed SHA | `f30e3bb0f883e9264acbd1c6059562aeb0718323` — **exact equality**, no ancestry inference needed |

ONE promotion. No intermediate deployment, no opportunistic repair.

### Deployment proof

`/api/build-info` — read before any measurement, never assumed.

| field | value |
|---|---|
| gitSha | `f30e3bb0f883e9264acbd1c6059562aeb0718323` |
| gitBranch | `staging` |
| gitMessage | Merge pull request #1050 … *put the identity guard and the stretch rule where they win* |
| nodeEnv | `production` |
| vercelEnv | `preview` |
| vercelDeploymentId | `dpl_4nxhCVoZkF3TLjz5YqkFbVVDHR2i` |
| Supabase project | `ikaxilmwmrmbagoidedu` |
| QA session | `environment.restore_deployed_qa_session` → `alloy_staging_web`, **freshly minted** (storage-state age 60 s at first use, not the cached artifact) |

Ancestry: candidate `4315a6abb` and repair `08adbd637` both contained in the deployed SHA.

### Pre-promotion gates (re-run on the reconciled tree, not assumed to survive)

| Gate | Result |
|---|---|
| Focused set, 20 files | **266 passed / 1 failed (267)** |
| `vac run typecheck` | **rc=0** |
| `vac run typecheck:tests` | **rc=0** |
| `vac run build` | **rc=0** |

The single red is **pre-existing on the promotion target and out of programme scope**: `reservedGeometryConvergence.test.tsx:322` asserts `data-financials-reserved={reservingAccount ? …}`. Attribution measured, not assumed — the literal is **present at the merge-base `fb8959164`**, **absent on `origin/staging`**, and the candidate **touches no financials file**. Staging's `b4aae2b62` renamed the guard to `reservesFootprint` (narrowed to `reservingAccount && summaryVariant !== "account"`) and left the runtime test asserting the old name. Owned by the Financials programme.

Negative scope, measured over the candidate diff: no Structural Commit, no Track A, no S8-2, no server-latency work, no readiness/admission change, no card component changed, height solver untouched. The only hits for `visible_construction_ms`, `SurfaceHostContext` and `isOperationallyResolved` are a single prose line in the 9B evidence doc asserting they are untouched. **Exactly two product files** changed vs staging: `alloyOsRuntime.css`, `InlineOpportunityFocusPanel.tsx`.

---

## P0-7.2 — AVATAR IDENTITY — **PASS**

Same child-grain pair as the recorded failure (`9ab36f48` → `8b3689fb`), on the Waitlist queue; 16 rows, frame cadence ≈ 28 ms over 488 frames.

| measurement | 9B deployed (FAIL) | 9C deployed |
|---|---|---|
| row selection | 183 ms | **231 ms** |
| header **text** identity | 183 ms | **231 ms** |
| header **avatar** identity | **5 785 ms** | **231 ms** |
| panel settlement (commit clock) | — | 6 371 ms |
| **B identity shown over A's image** | **199 frames / 5.6 s** | **0 frames** |

**The required gate is met: the previously failed window is ZERO frames.** Text and avatar now change on the *same frame* — which is the point of the repair, since both are now read off the click clock. Settlement still lands later (6 371 ms) and that is correct: settlement is commit-clocked and was never the thing at fault.

`stale_img_frames_any: 6` counts frames before the click registered, where A's face over A's name is simply true.

**Rapid A → B → C** (`9ab36f48` → `8b3689fb` → `ddc23ed1`, 380 ms apart): C owns the active row; final header reads C ("Test Process7"); C carries no image and shows an honest fallback — an allowed state. Frames still showing A's image after the C click: **2** (≈ 56 ms), fewer than the 231 ms pre-click window, so they are pre-click frames, not laundering. Neither A's nor B's image reaches C.

Specimens: `shots/A1-identity-A.png`, `A2-identity-B-at-700ms.png`, `A3-identity-B-settled.png`, `A3-rapid-C.png`.

---

## P0-7.5 — HEIGHT — **FAIL**

**The cascade half of the repair works. The outcome does not follow.**

Winning declaration on the solved-grid cell, resolved by walking every matching rule in source order:

```
.alloy-os-focus-panel-grid--composed .alloy-os-focus-panel-grid__cell   align-items: flex-start
.alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell          align-items: stretch   ← WINNER
```

Computed `align-items` on the BP cell is **`stretch`**. That is exactly what 9B set out to fix, and it is fixed.

But stretch reaches only the cell's **direct child**, and Business Process has an intermediate wrapper that Financials does not:

| element | height | paints? |
|---|---|---|
| `div.alloy-os-focus-panel-grid__cell` (BP) | **299** | transparent |
| `div.alloy-os-process` — `display: block` | **299** | transparent, no border |
| `article.alloy-os-ucard` — **the visible card** | **232** | white, 1px border, radius 14px |
| `div.alloy-os-focus-panel-grid__cell` (Financials) | **299** | transparent |
| `article.alloy-os-ucard` (Financials) — visible card | **299** | white, 1px border, radius 14px |

Solved H = **299** (solver-selected; 325 was not required and is not what the runtime chose).

| required | observed |
|---|---|
| BP wrapper == Financials wrapper == H | **299 == 299 == 299 ✓** |
| Financials visible root == H | **299 ✓** |
| BP visible root == H | **232 ≠ 299 ✗** |
| winning computed `align-items` == stretch | **stretch ✓** |
| white space beneath Business Process gone | **67 px remains ✗** |

The cell stretches `div.alloy-os-process` to 299 correctly. That wrapper is `display: block`, so it passes no height to the `article.alloy-os-ucard` inside it, which keeps its natural 232. Financials has no such wrapper, so stretch reaches its card directly and it fills. The card is white on a transparent cell, so the 67 px below it renders as the same unexplained white space the operator reported.

### How this nearly passed — recorded deliberately

My first height harness measured `[data-process-card='true']` and reported **299**, a clean PASS. That selector matches `div.alloy-os-process` — the transparent wrapper — not the painted card. The failure surfaced only because the specimen pass used `[data-universal-card-key='business_process']` and disagreed. **The disagreement between two selectors is what caught it; neither measurement alone would have.** This is the same trap as the standing note *height defects live on the card child; measuring the wrapper shows nothing* — and it is the eighth instance in this programme of a mechanism taking effect while the outcome does not follow.

### Smallest repair boundary

One rule, same stylesheet, same `.alloy-os-fp-card-intrinsic` scope — make BP's intermediate wrapper pass the stretched height to the card it wraps, e.g. giving `.alloy-os-fp-card-intrinsic > .alloy-os-focus-panel-grid__cell > .alloy-os-process` a flex column with the `.alloy-os-ucard` child at `flex: 1 1 auto` (or `height: 100%` on that child). No solver change, no card-component change, no pixel value, and lanes / stack / standalone stay untouched because `.alloy-os-fp-card-intrinsic` is rendered only by the solved-grid branch.

**Not implemented in this run, per the failure policy.**

Specimen: `shots/D-band-equal-height.png`. Data: `g75.json` (the wrapper reading), `g75b.json` (the resolved chain).

---

## P0-7.3 — HELD WORK VIEW — **PASS** (spot check)

Switch to `new_leads` (3 rows) from a 16-row view:

| | |
|---|---|
| busy/held presentation appears | 166 ms |
| destination rows commit | 2 949 ms |
| frames with prior rows **and** held/busy visible | **95** |
| frames with prior rows and **no** held marker | 4 — all inside the acknowledgement window |
| held state clears | 2 949 ms, with the commit |

Prior rows are held under a visible held/busy presentation for the whole 2.8 s wait and are never presented as live destination rows. No regression. Specimen: `shots/B-held-workview.png` (caught mid-hold: 16 prior rows, 2 busy markers).

---

## P0-7.4 — RESERVED PRESENTATION — **PASS** (spot check)

Cold entry, caught mid-window at 9 000 ms:

- reserved configured cells: **2**
- resolving keys: `children`, `household`
- copy: **"Resolving children…"**, **"Resolving household…"** — intentional, not a placeholder
- no fake data; no blank broken rectangle; configured structure visible throughout
- 6 cards at settle

Specimen: `shots/C-resolving-household-children.png`. No regression.

---

## CLOSED-P0 SPOT CHECKS — **PASS**

**P0-1 — canonical Workspace loader.** On `/workspace`, 242 frames over 26 s: rejected "Preparing your workspace…" surface **0 frames**; canonical "Thinking…" boot shell 48 frames; Alloy mark present from the **first** frame; blank-canvas frames **0**; processes at 5 849 ms. Specimen: `shots/E-workspace-loader.png`.

**P0-2 — Business Process meaningful at commit.** BP card carries real configured content, not a placeholder: *"ENROLLMENT · Lead Sep 16 · Tour · Decision Sep 16 · Waitlist · Enrolling · PC Pathb Enrolled Sep 16 …"*. Stage rail, case stage and a placed participant all present.

**P0-5 — Work View acknowledgement < 150 ms.** **12 / 62 / 71 ms** across six row-bearing switches (`new_leads`, `new_work_view_3/4/6/7`), **zero over 150 ms**.
*Correction worth recording:* my first pass reported 166 ms and 221 ms and would have failed this gate. That was an instrument artifact — a cross-process `page.evaluate` polling loop has ≈ 28 ms round-trip granularity and its first sample is delayed by loop startup. Re-measured with an **in-page rAF instrument** that stamps `performance.now()` at the click and resolves on the first frame the destination pill reads selected, with no IPC in the hot path. The in-page number is the real one.

**Attendance / Health — participant-scoped meaning stable through settlement.** On child subject `8b3689fb`, across 219 frames of a record switch, **one** distinct Attendance text and **one** distinct Health text — no flicker between scopes, no generic empty:
- Attendance: *"No attendance recorded today — This child has no active enrolment, so attendance cannot be recorded for them."* — participant-scoped and honest about **why**.
- Health & Safety: *"REQUIRED INFORMATION — Physical / health assessment: Missing · Immunization record: Missing · Health care plan: Missing …"*

(The card key is `health_safety`; my first probe queried `health` and read null. Corrected, not inferred.)

---

## UPDATED P0-7 LEDGER

| | state |
|---|---|
| **7.1** Structural Commit | OPEN — not authorized in this run |
| **7.2** avatar identity | **CLOSED — deployed verified** |
| **7.3** held Work View rows | CLOSED — deployed verified (re-confirmed) |
| **7.4** reserved configured cells | CLOSED — deployed verified (re-confirmed) |
| **7.5** Process Card band fill | **OPEN — deployed FAIL**, cascade fixed, wrapper does not pass the height through |
| **7.6** actual server latency | out of scope |
| **7.7** stale docblock / admission premise | OPEN, low |

## REMAINING BLOCKERS

1. **P0-7.5** — the intermediate `.alloy-os-process` wrapper (above).
2. Pre-existing staging red in the Financials programme: `reservedGeometryConvergence.test.tsx:322` vs `reservesFootprint`. Not this programme's to repair; flagged for the Financials lane.

## `READY_FOR_STRUCTURAL_COMMIT_SLICE = NO`

Unchanged, and for the reason the gate exists: 7.5 is not deployed-verified. Three of four Presentation Truth gates now hold on the deployed build and 7.2 — the one that had twice been certified locally and found inert — is genuinely closed. 7.5 is not.

## VISUAL SPECIMENS REQUIRING HUMAN REVIEW

| ref | what to look at |
|---|---|
| `shots/A1-identity-A.png` → `A2-identity-B-at-700ms.png` → `A3-identity-B-settled.png` | child A → B: the name and the face move together; A's face never sits under B's name |
| `shots/A3-rapid-C.png` | rapid A → B → C: C owns identity, honest fallback, no laundered image |
| `shots/B-held-workview.png` | held Work View: prior rows visibly held, not presented as destination rows |
| `shots/C-resolving-household-children.png` | reserved Household/Children: configured structure + intentional resolving copy |
| **`shots/D-band-equal-height.png`** | **the failing gate — 67 px of white space still beneath Business Process while Financials fills its cell** |
| `shots/E-workspace-loader.png` | canonical Workspace loader, Alloy mark from the first frame |
