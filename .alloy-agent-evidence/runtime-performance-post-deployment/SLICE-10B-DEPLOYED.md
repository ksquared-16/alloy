# SLICE 10B — STRUCTURAL COMMIT PROMOTION + DOCTRINE CONVERGENCE + DEPLOYED TIMELINE

**`STRUCTURAL_COMMIT_DEPLOYED_CERTIFIED`** — every enumerated gate passes. One residual is named in §6.

## PROMOTION

| | |
|---|---|
| Starting SHA | `74978b342` (repair `3b54009c1`, certification `16bfc0ad3`) |
| Doctrine amendment | **`97f9a4b5d`** |
| Candidate | **`2c7e55e3e`** (staging reconciled; repair byte-identical to `3b54009c1`) |
| PR | [**#1053**](https://github.com/ksquared-16/alloy/pull/1053) — **14/14** checks |
| Merge SHA | **`009beb369`** |
| Deployed SHA | **`009beb369`** — exact equality |

Deployment proof: `gitBranch staging`, `nodeEnv production`, `dpl_Ai9pHKWFV7qPVHbrkree6qv6sq36`, Supabase `ikaxilmwmrmbagoidedu`. Merge, candidate, doctrine and repair all contained by ancestry. QA session verified fresh (21 s at mint).

## 1 · DOCTRINE AMENDMENT — `97f9a4b5d`

`docs/platform/runtime/runtime-implementation-authorization.md`, **50 insertions / 4 replacements**:

* **§3.4** signal row — `visible_construction_ms` → **`unstable_or_false_construction_ms`**, defined as *cumulative time the operator can see construction that is false or unstable*, with a note that the old metric counted **all** visible construction and therefore forbade a truthful destination shell.
* **§3.4.1** (new) — separates **STRUCTURAL READINESS** (subject + published composition) from **SEMANTIC READINESS** (situation, action, stage work), states that structural readiness may not be made to depend on semantic facts structure does not need, and lists authorized vs forbidden construction verbatim from the master decision.
* **§8.3** budget — `unstable_or_false_construction_ms = 0` (absolute), plus **`CARD_COHERENCE_WINDOW ≤ 250 ms`** for critical/Mission-tier cards, recorded explicitly as a **regression budget, not a target**, with Track-A cards excluded while resolving.
* Two **live** clauses converged (D4 acceptance, the recede/construction clarification) so neither names a retired metric.

**Preserved deliberately:** the atomic semantic commit is not relaxed — partial, stale or inferred business truth stays forbidden, and fabricating a card grid nobody published is called out as false construction, not early construction. The **G-7 historical baseline at D0 is left intact**; it records what was measured at the time, under the metric of the time.

## 2 · GATES

| gate | result |
|---|---|
| focused regression (25 files) | **321 / 322** |
| geometry browser suite | **47 / 47** |
| `typecheck` / `typecheck:tests` / `build` | **rc=0 / rc=0 / rc=0** |

Single red is the standing **`EXTERNAL_FINANCIALS_TEST_DEBT`**, pre-existing and untouched. CI additionally ran **Docs lint (narrow blocking)** and **Docs lint fixtures** green — both triggered by the doctrine edit.

---

## 5 · DEPLOYED PHASE TIMELINE — `009beb369`

| milestone | ms |
|---|---|
| navigation | 0 |
| first non-blank | **3,165** |
| **destination shell** | **3,661** (present to 14,916) |
| destination named | **`waitlist`** |
| queue shell (busy) | 3,165 |
| work view pills | 15,031 |
| **published structure** | **15,031** |
| **first critical meaning** | **15,031** |
| **last critical meaning** | **15,031** |
| Track-A resolving | 15,031 |
| Track-A meaningful | 23,703 |
| final settlement | 41,971 |

### Operator text, before and after

| | baseline `96448f5d8` | repaired `009beb369` |
|---|---|---|
| document length during the wait | **37 chars** — the word "Thinking" | **71 chars** — "Thinking" **+ Waitlist** |
| destination named | never, until the surface | **3,661 ms**, held for 99 frames |

---

## 6 · P0-7.1 DEPLOYED GATE — **PASS, with one residual**

| | |
|---|---|
| time-to-destination-shell | **3,661 ms** (DOM); **5,385 ms** verified *visibly on screen* in a dedicated probe |
| time-to-published-structure | **15,031 ms** |
| **destination named before structure by** | **≈ 11.4 s** (DOM) / **≈ 9.6 s** (verified visible) |

Visibility was proven, not assumed: the element measures **50 × 20 px at (803, 642)**, `display: block`, `visibility: visible`, `opacity: 1`, 13 px, **no hidden ancestor**, text `"Waitlist"`. A DOM-presence check alone would have been the same class of false pass this programme has hit before.

**Forbidden construction — none present.** No card grid, no business values, no counts, no subject truth not actually known. Asserted as a browser gate, and visible in specimen A: the Alloy mark, "Thinking…", and "Waitlist".

### RESIDUAL — named, not buried

The destination is **not** named in the **first ~3.2 s**. Cause: there are **two** boot-shell owners — `AdminV2Shell`'s Suspense fallback (`chrome="full"`) paints first and was not given the destination prop; only the surface-host owner (`chrome="content"`) was. Measured directly: boot-shell counts of 1, 2 and 0 occur across the window.

Not repaired here — §13 forbids product repair in this run, and this is a refinement rather than a failure of any enumerated condition. **Handed forward as P0-7.8 (low).**

---

## 7 · CRITICAL-CARD COHERENCE — **PASS**

Critical / Mission-tier set, from runtime card tier doctrine: **`business_process`, `financials`, `attendance`, `health_safety`**.

| card | FIRST_MEANINGFUL |
|---|---|
| business_process | **15,031** |
| financials | **15,031** |
| attendance | **15,031** |
| health_safety | **15,031** |

**`CARD_COHERENCE_WINDOW = 0 ms`** against the **≤ 250 ms** budget. All four become meaningful in the **same frame**.

Track A excluded while legitimately resolving: `children` and `household` first meaningful at **23,703 ms**.

---

## 8 · NO LATE MOUNT + GEOMETRY — **PASS**

| | set |
|---|---|
| **cells at structure commit** | `business_process, financials, attendance, health_safety, children, household` — **all six** |
| **cells at settlement** | the same six |

`structure_present_per_card` is **15,031 ms for all six**, including the two Track-A cards, which are present as **reserved/resolving** cells from the commit and transition `RESOLVING → MEANINGFUL` inside existing geometry at 23,703 ms.

The census counts **painted *and* reserved** cells. Slice 10 nearly reported a false late-mount finding because a reserved cell carries no `data-universal-card-key`; the harness now counts both, so that artifact cannot recur.

**Geometry:** painted BP **299.00**, painted Financials **299.19**, BP cell **299**, **residual whitespace 0**, BP background `rgb(255,255,255)` with a 1 px border — the solved band is equal-height and unchanged.

---

## 9 · PRESENTATION TRUTH — all **PASS**

| | result |
|---|---|
| **7.2** identity | row 115 ms, text 115 ms, avatar 115 ms — same frame; **stale prior-avatar frames 0** over 423 frames |
| **7.3** held rows | busy 187 ms, rows commit 2,687 ms, **87 frames** of prior rows under a visible busy marker, 5 without (inside the acknowledgement window) |
| **7.4** reserved cells | `children` + `household` reserved, copy "Resolving children…" / "Resolving household…" |
| **7.5** equal band | BP 299.00 / Financials 299.19, residual **0 px** |

---

## 10 · CORRECTED LATENCY INVENTORY

**Harness fix applied first.** Playwright's `request.timing()` returns `startTime` as epoch-ms and every other field as an offset *from* it. Slice 10 computed `responseEnd - startTime` — an offset minus an epoch — which is why those durations were negative and unusable. Corrected: **duration = `responseEnd`**, **start = `startTime − navEpoch`**.

**146 requests** on cold entry (**39** to `/api`), **88.4 s** cumulative API time.

### The blocking chain — serial, and it is the whole story

| # | request | start | duration | TTFB | blocks |
|---|---|---|---|---|---|
| 1 | `GET /workspace/work-unit/waitlist` (document) | **3** | **8,325** | **3,043** | STRUCTURE |
| 2 | `GET /api/admin/work-units/waitlist/provisioning-answer` | **8,346** | **6,579** | **6,522** | STRUCTURE |
| → | published structure | | | | **15,031** |

**The provisioning answer does not start until 8,346 ms** — 18 ms after the document finishes. Two serial server waits, 14.9 s, and structure commits 106 ms later. Nothing else is on the critical path.

**TTFB dominates both**: 6,522 of 6,579 ms (99%) for the provisioning answer, 3,043 of 8,325 ms for the document. This is server think time, not transfer.

### Everything else, by what it actually gates

| request | start | duration | class |
|---|---|---|---|
| `/api/admin/related/opportunity/…` | 24,079 | **17,051** | NOTHING_VISIBLE |
| `/api/admin/view-models/drawer/opportunity/…` (drawer VM) | 14,967 | **8,732** | SECONDARY |
| `/api/admin/layout-runtime/opportunity-drawer-body` | 23,702 | 4,241 | SECONDARY |
| `/api/admin/communications/unread-count` | 3,818 | 3,170 | parallel, pre-structure |
| `/api/admin/departments/…/work-unit-queue…` (queue summaries) | 7,171 | 3,035 | parallel |
| `/api/admin/communications/bindings` | 15,223 | 2,760 | SECONDARY |
| `/api/admin/metrics/resolve` | 14,968 | 2,758 | NOTHING_VISIBLE |
| `/api/admin/communications/family-workspace` ×3 | 15,069+ | 2,231 / 1,971 / 1,493 | SECONDARY |
| `/api/admin/entity-labels` | 3,838 | 2,736 | parallel |
| `/api/admin/queue-view-totals` | 10,212 | 1,892 | parallel |
| `/api/admin/departments`, `/workspace/site-filter`, `/lifecycle-catalog`, `/operational-tasks` | ~3,816–3,820 | 1,738–1,971 | parallel |
| `/api/admin/ai/workflow-assist/capabilities` | 3,845 | 1,705 | parallel, nothing visible |
| `/api/admin/ai/config-layout-assist/capabilities` | 3,845 | 1,415 | parallel, nothing visible |
| `/storage/v1/object/sign/org_documents/…` (media, **4.46 MB**) | 23,847 | 1,351 | NOTHING_VISIBLE |

**Honest caveat on the classifier:** the `blocks` field is assigned **temporally** (did it finish before the phase), not causally. It over-attributes STRUCTURE to the ~3.8 s parallel burst, which completes before structure but does not gate it. The causal chain above is derived by hand from start/end ordering and is the one to trust.

---

## 11 · P0-7.6 HANDOFF

**A. Why does provisioning-answer take multiple seconds?** 6,579 ms of which **6,522 ms is TTFB** — essentially all server composition, effectively zero transfer. It is one server chokepoint composing the whole answer before responding.

**B. Why is `focusPanelSummaryDoc` coupled to that response?** It is a field *on* the provisioning answer (`op.focusPanelSummaryDoc`), and `op` exists only when `snapshot.terminal === "operational"`. The published composition is therefore gated on the slowest thing in the answer, even though the grid needs only the composition.

**C. Can the published composition be available earlier without a duplicate fetch, a second truth owner, queue-preview authority, or weakened authorization?** **Evidence says plausibly yes, and it is the highest-value question in the programme.** The composition is a *published configuration* resolved by (work view, stage) — not subject truth — so it is the part of the answer least dependent on the per-subject work. Two shapes worth measuring, neither adding a request: stream/flush the composition field ahead of the rest of the answer, or hoist it into the document response that already runs 8.3 s ahead of it. Both keep one owner and one authorization boundary. **Not designed here.**

**D. What work inside provisioning-answer is truly required before each phase?** Unmeasured from outside — the response is opaque. **First task of P0-7.6: instrument the answer's internal composition by section.** Externally we know only that the whole thing takes 6.6 s and structure needs one field of it.

**E. Which serial waits can parallelize?** The dominant one: **document → provisioning-answer is fully serial** (starts 18 ms after the document ends). The provisioning request cannot be issued until the document loads and hydrates. Issuing it server-side during the document render, or as an early hint, removes up to **8.3 s** of dead time before the request even starts.

**F. Which requests can defer until after first critical meaning?** `related/opportunity` (17.1 s, nothing visible), `metrics/resolve` (2.8 s), both AI capability probes (3.1 s combined, nothing visible), the 4.46 MB signed media, and the four `communications/*` calls (8.5 s combined) — all currently compete with the critical path for connections.

**G. What is cacheable/reusable across Work View and record transitions?** `departments`, `lifecycle-catalog`, `workspace/site-filter`, `entity-labels`, `status-options`, and both AI capability probes are org- or department-scoped and re-fetched on cold entry — roughly **10.5 s** of cumulative time that is not subject-specific.

### Ranked P0-7.6 programme — by measured contribution

| # | item | measured | why first |
|---|---|---|---|
| **1** | **Remove the document → provisioning-answer serialization** | up to **8.3 s** | the largest single block, and it is dead time before the request even starts |
| **2** | **Instrument provisioning-answer internally, then reduce its TTFB** | **6.5 s** TTFB | second largest; cannot be attacked responsibly until §D is answered |
| **3** | **Decouple the published composition from the full answer** (§C) | unblocks structure ahead of the remaining answer | the architectural win; needs 2's instrumentation to size |
| **4** | **Defer non-visible work past first critical meaning** | ~**23 s** cumulative, ~**4.5 MB** | pure scheduling, no new endpoint |
| **5** | **Cache org/department-scoped reads across transitions** | ~**10.5 s** cumulative | highest ratio of saving to risk |
| **6** | Drawer VM (8.7 s) + drawer body (4.2 s) | **12.9 s** | secondary enrichment; matters for settlement, not first meaning |

**Recommended first repair slice: #1.** It is the largest measured block, it is scheduling rather than semantics, it touches no truth owner and no authorization boundary, and it needs none of the instrumentation the others depend on.

---

## 12 · HUMAN SPECIMENS — `slice10b-data/shots/`

| ref | what it shows |
|---|---|
| **A** `A-destination-shell.png` / `repaired-A-destination-shell.png` | the pre-composition wait: Alloy mark, "Thinking…", **"Waitlist"**. No cards, no counts, no fabricated values |
| **B** `B-published-structure.png` | **the doctrine in one frame** — the whole composition at once: BP, Financials, Attendance and Health meaningful, with **CHILDREN "Resolving children…"** and **HOUSEHOLD "Resolving household…"** occupying final geometry |
| **C** `C-first-critical-meaning.png` | first critical meaningful frame |
| **D** `D-final-settled.png` | final settled surface, six cells, same geometry |

Specimen B is the clearest statement of the amendment: authorized construction (real published composition + intentional resolving cells + stable geometry) with no forbidden construction anywhere in it.

---

## UPDATED P0-7 LEDGER

| | state |
|---|---|
| **7.1** Structural Commit | **CLOSED — deployed verified** |
| **7.2 / 7.3 / 7.4 / 7.5** | CLOSED — deployed verified, re-confirmed |
| **7.6** actual server latency | **OPEN — next programme, handoff above** |
| **7.7** stale premise / doc cleanup | OPEN, low |
| **7.8** second boot-shell owner lacks the destination (new) | OPEN, low — §6 residual |

## REMAINING BLOCKERS

1. **P0-7.6** — the 14.9 s serial chain. Whole next programme.
2. **P0-7.8** — first ~3.2 s still generic.
3. `EXTERNAL_FINANCIALS_TEST_DEBT` — other programme.

## `P0-7.1 CLOSED = YES` · `READY_FOR_ACTUAL_LATENCY_PROGRAMME = YES`

Presentation Truth is complete and deployed; Structural Commit is deployed and verified; the doctrine that forbade it is amended and merged. What remains is latency, and it is now measured rather than argued: **8.3 s document + 6.6 s provisioning answer, serial, 99% server think time.**
