# P0-7.6 SLICE 12E — DEPLOYED, AND THE FINANCIALS CONVERGENCE MEASURED

**`P0_7_6_SLICE_12E_DEPLOYED_AND_FINANCIALS_CONVERGENCE_MEASURED`**

| | |
|---|---|
| Starting SHA | `c911a6644` (repair `1533989ec`, certification `f743f135d`) |
| Current staging at start | **`15639e053` — unchanged** |
| Candidate | `f743f135d` |
| PR | [**#1059**](https://github.com/ksquared-16/alloy/pull/1059) |
| Merge SHA | **`91e7b5379`** |
| Deployed SHA | **`91e7b5379`** (`/api/build-info` `gitSha`) |

**The repair removed 583 ms of `financials_build_ms`, not the 920–960 ms I modelled.** The
round-trip count was right; the price per round trip was not. That correction is §6.

---

## 4–5 · REBASE / RECONCILIATION — **NOT REQUIRED, AND HERE IS WHY**

The instruction says staging and Financials have moved since the 12E starting SHA. **They have not**,
and the promotion was not going to be built on an assumption:

| check | result |
|---|---|
| `origin/staging` at run start | `15639e053` — the same SHA this lane merged for Slice 12D |
| `git diff HEAD...origin/staging` | **empty** — staging adds nothing the candidate lacks |
| commits in `origin/staging` not in HEAD | two, both merges of **this lane's own branch** (#1057, #1058) |
| Financials convergence PRs #1045 / #1048 / #1049 | **already ancestors of HEAD and of staging** |
| their merge times | 2026-09-16 14:51 / 17:25 / 17:44 PDT |
| 12E starting SHA `c911a6644` | 2026-09-17 13:16 PDT — **~20 h later** |

**The 12E repair was developed on top of the converged Financials code**, so there is nothing to
rebase onto. Reconciliation result: **NO-OP, verified rather than assumed.**

### Overlap analysis — file level and contract level

`git diff --name-only` intersection between the 12E commits (8 files) and the Financials convergence
PRs (57 files): **empty**.

| surface | Financials convergence touched | 12E touched |
|---|---|---|
| presentation components (`FinancialsCard`, `FinancialsDetailCard`, `FinancialsLedger`, `FinancialsAccountDetail`, `FinancialsAccountWorkspaceDetail`, `FinancialsOverview`) | **yes** | no |
| `adaptFinancialsVmToFinancialsCard.ts` (the adapter) | **yes** | no |
| `chargeLifecycleService.ts` (a command path) | **yes** | no |
| CSS, Playwright specs, QA scenario catalog | **yes** | no |
| **`buildFinancialsCardVM.ts` (the shared READ authority)** | **no** | **yes** |
| `routeTimingDiagnostic.ts` | no | yes |

The two passes meet at exactly one seam: the adapter consumes the VM the build produces. 12E proved
that VM **byte-for-byte identical** at five account sizes, so the seam is preserved by construction
rather than by hope.

### §2 · The 12E repair contract, re-established against current Financials

| contract | state on the promoted candidate |
|---|---|
| A — org-grain reads issued before the first await | held |
| B — members / reductions / charges issued together | held |
| C — five tail reads issued as soon as rows exist | held |
| real dependencies remain serial (payment views ← payments) | held |
| financial truth byte-identical | held |
| `fin.read` precedes every ledger read | held |
| depth reduction 8 round trips | held |
| instrumentation spans | **recorded — but see §15, one of them was not EMITTED** |

## 3 · PRE-PROMOTION CERTIFICATION

| gate | result |
|---|---|
| 12E gates + Runtime focused + Financials focused (78 files) | **984 / 993**, 9 skipped, **0 failed** |
| `typecheck` / `typecheck:tests` / production build (`ALLOY_ROUTE_TIMING=1`) | rc=0 / rc=0 / rc=0 |
| CI on PR #1059 | all 8 required checks **pass** |

Query multiset, financial truth, `fin.read` ordering, posted/pending, credits/corrections,
responsibility/funding, collectibility, billing-period placement and reversal/reconciliation lineage
are the subjects of those gates directly — the byte-identity comparison covers them as a set.

---

## 10–14 · DEPLOYED 12E MEASUREMENT — five cold authenticated entries on `91e7b5379`

**Self-check:** 0 warm-ups with `startRel < 0`, 0 negative durations, route-timing payload present
5/5, and document `responseEnd` agrees with the browser's own `PerformanceNavigationTiming` to
**0 ms in all five**. Outer residual 0 to ±1 ms.

| n | doc | wall | route_id | inner | producers | gate | attend | health | **build** | unattr |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 6,568 | 5,967 | 609 | 2,558 | 2,800 | 239 | 105 | 356 | 2,561 | 0 |
| 1 | 7,967 | 7,544 | 145 | 4,996 | 2,404 | 563 | 110 | 381 | 1,840 | −1 |
| 2 | 4,862 | 4,359 | 132 | 1,916 | 2,310 | 230 | 126 | 326 | 2,080 | −1 |
| 3 | 4,588 | 4,156 | 517 | 1,776 | 1,862 | 108 | 113 | 349 | 1,754 | 1 |
| 4 | 3,751 | 3,257 | 198 | 1,492 | 1,567 | 233 | 102 | 348 | 1,333 | 0 |

| metric | BEFORE `15639e053` | AFTER `91e7b5379` | delta |
|---|---|---|---|
| **`financials_build_ms`** | **2,423** | **1,840** (1,333–2,561) | **−583** |
| `financials_gate_ms` | 234 | 233 (108–563) | −1 |
| **`card_producers_ms`** | **2,718** | **2,310** (1,567–2,800) | **−408** |
| `inner_compose_ms` | 1,833 | 1,916 (1,492–4,996) | +83 |
| `route_identity_ms` | 205 | 198 | −7 |
| document duration | 5,416 | 4,862 | −554 |
| destination shell | 1,128 | 980 | −148 |
| **first critical meaning** | **5,470** | **4,950** (3,864–8,038) | **−520** |
| Track-A / final settlement | 12,743 | 11,474 | −1,269 |
| **CARD_COHERENCE_WINDOW** | 0 | **0**, 5/5 | — |

**The concurrency model still holds exactly.** Per sample, `card_producers_ms` equals
`gate + build` to within 1 ms in all five (2800/2800, 2403/2404, 2310/2310, 1862/1862, 1566/1567).

```
FINANCIALS_TIME_REMOVED_MS       583   (measured, in the repaired boundary)
CARD_PRODUCERS_TIME_REMOVED_MS   408
TTFCRITICAL_DELTA               -520   observed
attributable                    ~408   card_producers is serial in compose_wall; the
                                        remaining ~112 ms is environmental and is not claimed
REMAINING_GAP_TO_2S             2,950
```

### 6 · THE MODEL OVER-PREDICTED, AND BY HOW MUCH

Slice 12E modelled **920–960 ms** from 8 removed round trips at a calibrated **115–120 ms** each.
Deployed: **583 ms — about 73 ms per round trip**, roughly 60 % of the calibrated rate.

The round-trip count was right; the price was not. The calibration came from dividing `attendance_ms`
(1 trip / 120 ms) and `health_ms` (3 / 115 ms) by their depths, and those are *whole producers*
whose single reads plausibly carry connection setup and heavier queries. The 8 trips this repair
removed are small config and member reads. Averaging a producer's cost onto a config read
over-stated it by ~60 %.

**The honest reading: serial depth predicts the SHAPE of a saving reliably and its SIZE only within
a factor.** That is now on the record, and the next slice should not repeat the arithmetic without
saying so.

### 15 · RUNTIME NEXT LONG POLE — **and my 12E prediction was wrong**

12E predicted that after the repair `inner_compose_ms` (1,833) would overtake `card_producers_ms`
(~1,710) and that 12G would be next. It did not, because the repair delivered 583 ms and not 940:

| # | independent wait | deployed AFTER | note |
|---|---|---|---|
| **1** | **`card_producers_ms`** | **2,310** | **still the long pole** — `financials_build_ms` 1,840 is 80 % of it |
| 2 | `inner_compose_ms` | 1,916 | close behind, and unchanged by this repair |
| 3 | document remainder (doc − wall) | ~503 | React render / RSC serialization |
| 4 | `financials_gate_ms` | 233 | structurally irreducible |
| 5 | `route_identity_ms` | 198 | CLOSED — shared `cache()` hit |

**12F, not 12G**, is next on deployed evidence.

---

## 16–26 · FINANCIALS WORKSPACE / DETAILS TRACE — measurement only, same deployed build

### On reading these numbers

The first trace reported legs of 1 ms, 2 ms and 3 ms. Those were not fast legs: **the selectors were
already present before the action**, so the wait returned instantly and measured nothing. The trace
was rebuilt to record presence BEFORE each action and to refuse a duration when the target was
already there. It also clicked the wrong control the first time — `data-financials-details` is not a
button; the command is `[data-financials-nav="details"]`. Legs marked *already present* below are
evidence about the DOM, not about latency.

### 16 · Specimens (real staging accounts, read from the queue)

| | account | outstanding | state |
|---|---|---|---|
| **A — healthy** | `29944d3e…` | $342.82 | `outstanding` |
| **B — zero-activity** | `fd000000…0c0001` | $0.00 | `no_activity` |
| Focus Panel subject | `0658832a…` | $75.00 | `outstanding` |

### 17–26 · Leg timings

| leg | result | slowest server read |
|---|---|---|
| **24** navigate → compact Financials useful | **4,455 ms** | document 5,504 ms |
| **25** Details click → final Details frame | **3 ms**, **0 requests** | — |
| **26** Details → ledger/hydrated | **not measured** — the hydration marker I waited on belongs to the workspace detail, not the Focus Panel overlay; the leg also overlapped the opportunity drawer opening (`related/opportunity` 14,533 ms), so no clean number | `/financials/card?customer_id=0658832a` **2,453 ms** |
| **17** open Financials → shell present | already present | — |
| **18** shell → Overview useful | already present | — |
| **19** Accounts click → queue useful | **1,853 ms** | `/financials/position` 1,502 ms (of 4 concurrent) |
| **20** queue → default selection | already present | — |
| **21** A: selection → summary frame | already present | — |
| **22** A: → detail hydrated | already present | — |
| **23** A: → ledger present | **4,313 ms** | `/financials/card?customer_id=29944d3e` **4,411 + 4,471 ms** |
| B: zero-activity, all legs | already present | `/financials/card?customer_id=fd000000…` **1,290 + 1,520 ms** |
| re-select the SAME account | 6,110 ms | `/financials/card?customer_id=29944d3e` **4,205 + 4,383 ms** |

**The Details frame is genuinely immediate — 3 ms and zero requests.** The convergence work's
intended UX ("final Details structure effectively ready immediately, values resolve inside it")
holds on the deployed build, and nothing here reopens it.

---

## 27–30 · SHARED-TRUTH AND DUPLICATE-READ MAP

### One authority, confirmed

| read | owner | grain | consumers | cache/reuse |
|---|---|---|---|---|
| **`buildFinancialsCardVM`** | shared | org + account (optionally narrowed to one member) | Focus Panel producer (server projection); `/api/admin/financials/card` → workspace account detail, Focus Panel Details, Focus Panel self-bootstrap | **none** |
| `/financials/subjects` | workspace | org | Accounts queue (identity, no money) | none |
| `/financials/position` | workspace | org | Accounts queue (figures) | none |
| `/financials/work-queue` | workspace | org | tiles | none |
| `/financials/activity` | workspace | org | Overview | none |
| `/financials/overview-metrics` | workspace | org | Overview | none |

**There is no second financial authority and no workspace-specific calculation.** The workspace
account detail states in its own header that every figure is `buildFinancialsCardVM`'s, reached
through `/api/admin/financials/card`, and the trace confirms it: that endpoint is the only money
read either detail surface makes.

**A consequence worth stating: the 12E repair serves both grains.** The workspace detail and the
Focus Panel Details inherit the 8 removed round trips, because they call the same function.

### 28 · Duplicate reads — two, both measured

**DUPLICATE 1 — every account selection reads the card TWICE, concurrently.**

```
[A healthy: -> ledger present]
   /api/admin/financials/card?customer_id=29944d3e…  4,411 ms
   /api/admin/financials/card?customer_id=29944d3e…  4,471 ms      ← identical URL, same moment
[B zero-activity]
   /api/admin/financials/card?customer_id=fd000000…  1,290 ms
   /api/admin/financials/card?customer_id=fd000000…  1,520 ms
```

Two consumers fetch independently: `FinancialsAccountWorkspaceDetail` issues its own
`fetch(/api/admin/financials/card?customer_id=…)`, and the `FinancialsCard` composed beside it
self-bootstraps because the workspace host supplies no `operationalProjection`. Same question, same
grain, same instant. The operator waits the max rather than the sum, so the cost is **database
pressure doubled on the most expensive Financials read**, not doubled latency.

**DUPLICATE 2 — Details re-reads what the Focus Panel already holds.**

The compact card's account is `0658832a…` and it issues **no request at all** — it consumes the
server projection, which carries the *complete* `FinancialsCardVM` (`ProducerResult<FinancialsCardVM>`,
not a bounded summary). Opening Details fires
`/api/admin/financials/card?customer_id=0658832a…` — **2,453 ms** — running `buildFinancialsCardVM`
again, server-side, for the same household, seconds after the projection already answered it.

**With one precise exception.** The producer passes `customerMemberId` when the surface is scoped to
one child, which narrows the agreements; the Details fetch prefers `customer_id` and asks
household-wide. When a child is scoped those are **different questions at different grain and are
not duplicates**. The duplicate is the household case — which is the case measured here.

**DUPLICATE 3 — no reuse on re-selection.** Re-selecting `29944d3e…` roughly twenty seconds after it
was first read issued the pair again (4,205 + 4,383 ms). Nothing — request-scoped, client, or
server — remembers that this account was just answered.

**Not called duplicates:** `/financials/subjects` and `/financials/position` both concern accounts
but answer different questions (identity/location vs figures) and the workspace deliberately splits
them. `payment_provider_merchants` is read twice inside the build, and 12E hoisted rather than
collapsed it because the two reads pin different merchants.

### 29 · Serial dependencies observed

- Accounts queue: four reads **already concurrent** (`site-filter`, `work-queue`, `activity`,
  `subjects`, `position`) — nothing to de-serialize there.
- Account selection → card → ledger: the ledger waits on the card read, which is a real dependency.
- `/financials/overview-metrics` (5,213 ms) fires late and independently; it is the single slowest
  Financials read observed and it blocks nothing measured here.

### 30 · Existing cache/reuse authority that could own reuse

There is one, and it is already load-bearing for exactly this problem: the **operational projection
seam** (`context.operationalProjection.cards.financials`) plus the request-scoped React `cache()` the
route identity already uses. The Focus Panel compact card proves the seam works — it renders a full
account with zero requests. Nothing new needs inventing; Details and the workspace detail simply do
not read from it.

---

## 31–32 · PREDICTABLE NEXT-ACTION ANALYSIS, AGAINST THE WASTED-WORK GUARD

| # | opportunity | likelihood consumed | cost | DB pressure | stale risk | operator ms saved | verdict |
|---|---|---|---|---|---|---|---|
| **D** | **Details consumes the projection it already has** instead of re-reading | **very high** — the projection is already in the client, for the same account | **zero** — it is a read that is already paid for | **−1 full build** | low: same request's answer, seconds old; the reload-after-action path is unchanged | **~2,450 ms** on the Details click | **STRONGEST** |
| **—** | **collapse the workspace's double card read** | **certain** — both fire on every selection today | zero | **−1 full build per selection** | none — identical URL, same instant | ~0 ms (concurrent) but halves load on the heaviest read | **STRONG, cheap** |
| **C** | account summary and deep ledger in parallel | n/a | — | — | — | — | **already serial by a real dependency**; the ledger needs the card |
| **B** | default-account detail alongside queue loading | high — a default IS selected | one extra build if the operator picks another account first | +1 build | low | up to ~4,400 ms | **PLAUSIBLE**, second |
| **A** | deep Financials after compact first paint | n/a on this build | — | — | — | — | **moot** — the projection already carries the deep model |
| **E** | adjacent-account prefetch | **low** — 11 accounts in the queue, one is chosen | ~4,400 ms of build each | **high** | rises with time held | speculative | **DECLINED** — this is the "prefetch everything" the guard forbids |

The two strong items cost **nothing**: they remove work rather than adding it. That is the
distinction the guard is for.

---

## 33 · FINANCIALS HUMAN-QA DECISION

**`QA_CONTINUE_IN_PARALLEL`.**

The Details frame is immediate (3 ms, zero requests), the Accounts queue is useful at 1,853 ms, a
zero-activity account answers in ~1,300–1,500 ms and a healthy one in ~4,400 ms. Nothing observed
prevents an operator from evaluating Financials behaviour reliably, and no correctness defect was
seen: the surfaces answer with real money or say they cannot, never with a fabricated zero. Slow is
not the same as unevaluable, and further optimization existing is not a reason to block QA.

The one caveat QA should know: a healthy account's detail takes about **4.4 seconds** to complete,
and the same account re-selected takes it again.

---

## 34–37 · BOUNDED FOLLOW-UP SLICES

**36 · Exact Financials performance next slice — F1: `Details reads the projection it already has`.**
Zero new machinery, removes ~2,450 ms from the single most predictable operator action in the
Financials experience, and the seam already exists. Bounded to the Focus Panel Details path.

**F2 — collapse the workspace's double card read.** Certain consumption, zero cost, halves load on
the heaviest Financials read. Small and independent of F1.

**F3 — `/financials/overview-metrics` (5,213 ms).** The slowest single Financials read measured.
Blocks nothing on the critical path; own slice, own decomposition.

**F4 — default-account eager detail.** After F1 and F2, on evidence, not before.

**35 · Exact Runtime next slice — 12F: the per-obligation collectibility loop** inside
`buildFinancialsCardVM`, which is still 80 % of the still-dominant `card_producers_ms` (1,840 of
2,310). 12G (`inner_compose_ms`, 1,916) follows it closely and may overtake after 12F.

**37 · Should a shared repair precede both? YES — and it is F1.**

Runtime's Work Unit path and the Financials Details path are the same read. 12F makes that read
cheaper for everybody; **F1 removes one whole execution of it.** They do not conflict and neither
blocks the other, but if only one is done first, F1 is strictly larger and strictly safer: it adds
no concurrency, no cache and no new authority — it stops repeating work that is already finished.

---

## 15 · AN INSTRUMENT DEFECT THIS RUN FOUND — IN MY OWN SLICE 12E WORK

**The thirteen Financials sub-spans reached the deployed build as `financials: null` in all five
samples.** They were recorded correctly. They were dropped on the way out.

`recordRouteTiming` replaces whole fields, so the outer compose rebuilds `route_compose_spans` from
whatever the deeper boundaries stashed — and it restated `producers` **by name**:

```ts
...(already?.producers ? { producers: already.producers } : {}),   // ← drops `financials`
```

12E's nineteen gates proved the spans were **recorded**. Not one proved they were **emitted**. This
is the failure this programme has now named repeatedly: *a test that asserts a mechanism EXISTS
cannot certify that it TAKES EFFECT* — and this time it was mine.

**Repaired here** (not promoted — this run's single canonical promotion is spent) by spreading the
whole stashed object, so the next span somebody adds survives whatever it is called, plus a gate
that fails on the exact line that dropped it. The gate is a **source** gate and says so in writing:
`routeTimingCollector` is a React `cache()`, so under vitest a write and a read return different
objects and any behavioural assertion would be testing the harness. An earlier version of that test
did exactly that and failed for that reason. **The outcome proof is the deployed payload, and it is
owed with the next promotion.**

Nothing in the deployed 12E measurement depends on it: `financials_build_ms` travels in `producers`,
which emitted correctly.

---

## 38–40 · PROGRAMME

| item | state |
|---|---|
| 11 / 12A / 12B / 12C / 12D | CLOSED deployed-verified |
| route-resolution caching | CLOSED — `SHARED_CACHE_HIT`, 198 ms |
| producer parallelism | CLOSED — model validated to ±1 ms again on `91e7b5379` |
| **12E Financials build depth** | **CLOSED — deployed `91e7b5379`, −583 ms measured** |
| **12F collectibility loop** | **OPEN — the next Runtime target** |
| 12G `inner_compose_ms` 1,916 | OPEN — close second |
| Financials span emission repair | **REPAIRED LOCALLY, promotion owed** |
| document remainder ~503 ms | OPEN |
| destination shell 980 ms vs ≤500 ms | OPEN |
| **F1 Details reuses the projection** | **OPEN — the largest single Financials saving found** |
| F2 workspace double card read | OPEN |
| F3 `overview-metrics` 5,213 ms | OPEN |
| F4 default-account eager detail | OPEN — after F1/F2 |

### 13 · CORRECTNESS, all five deployed samples

`unstable_or_false_construction_ms = 0` · `CARD_COHERENCE_WINDOW` **0 ms** (budget ≤ 250) ·
**zero client provisioning requests**, `seeded: true` 5/5 · **6/6 configured cells** at structure
commit and settlement · Presentation Truth and Structural Commit intact · Attendance 110 ms and
Health 349 ms stable · geometry unchanged · `fin.read` unchanged · no partial or stale money, no
client-side financial calculation, no second authority, no second cache.

```
READY_FOR_NEXT_RUNTIME_REPAIR            = YES
READY_FOR_FINANCIALS_PERFORMANCE_PROGRAMME = YES
```

**P0-7.6 remains OPEN.** Deployed median time-to-first-critical-meaning **4,950 ms** against a hard
**2,000 ms** target — gap **2,950 ms**. The target is not lowered to fit the architecture.
