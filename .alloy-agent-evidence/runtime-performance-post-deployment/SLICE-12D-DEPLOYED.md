# P0-7.6 SLICE 12D — DEPLOYED, AND THE PRODUCER LONG POLE NAMED

**`P0_7_6_SLICE_12D_DEPLOYED_CERTIFIED`** — and the repair removed **0 ms**, exactly as its own
certification predicted it might. Read that line before any other.

| | |
|---|---|
| Candidate SHA | `17802e034` (repair `255c23a40`) |
| PR | [**#1058**](https://github.com/ksquared-16/alloy/pull/1058) |
| Merge SHA | **`15639e053`** |
| Deployed SHA | **`15639e053`** — `/api/build-info` `gitSha`, branch `staging` |
| Ancestry | `git merge-base --is-ancestor 255c23a40 origin/staging` → **true**; the deployed SHA *is* the merge commit, so this is direct containment, not inferred ancestry |
| Route measured | `/workspace/work-unit/waitlist`, authenticated, 5 cold entries (fresh browser context each) |

---

## 1 · PROVENANCE, PROVED BEFORE PROMOTION

| required present | evidence |
|---|---|
| Slice 12D repair `255c23a40` | in `origin/staging..HEAD`; 4 files + census artifact |
| Slice 12D certification gates | `web/tests/runtime/financialsGateConcurrency.test.ts` |
| Slice 12C decomposition instrumentation | `route_compose_spans` in `composeProvisioningAnswerForRoute.ts` (3 refs) |
| Slice 12A route timing | `recordRouteTiming` / `collectedRouteTiming` in the page + layout segments |
| Slice 11 seed convergence | `consumeFreshProvisioningForRoute` in `workUnitProvisioningPrefetch.ts` |
| **no unrelated latency optimization** | exactly three commits promoted — repair, census refresh, evidence. `git diff --stat` names 7 files, all accounted for |

Staging had **not** moved in content: the only commit `origin/staging` held that the candidate did not
was `7e0d399ef`, the merge of the candidate's own earlier branch, and `git diff HEAD...origin/staging`
was empty in that direction. No reconciliation was needed and none was invented.

## 2 · GATES

| gate | result |
|---|---|
| Slice 12D focused + route-timing/decomposition certification (16 files) | **246 / 247** |
| closed Runtime + Surfaces + Focus Panel regression (137 files) | **1,417 / 1,429** |
| `typecheck` | rc=0 |
| `typecheck:tests` | rc=0 |
| production build (`ALLOY_ROUTE_TIMING=1`) | rc=0 |
| geometry browser certification | **51 / 51** |
| CI on PR #1058 | all 8 required checks **pass** |

### The reds were not assumed pre-existing — they were re-run on the base

All **12** failures were executed again in a probe worktree checked out at `7e0d399ef`, using the
probe's own vitest config. **All 12 fail identically on the base. Zero new reds.**

| file | failures | class |
|---|---|---|
| `d1ProvisioningAnswerRoute.test.ts` | 5 | D1 route-resolution test debt |
| `d1ProvisioningAnswer.test.ts` | 2 | D1 route-resolution test debt |
| `workUnitProvisioningPrefetch.test.ts` | 1 | provisioning TTL test hygiene |
| `reservedGeometryConvergence.test.tsx` | 1 | pre-existing |
| `childIdentityOwnerContract.test.ts` | 1 | pre-existing |
| `subjectAuthorityNoSilentSubstitution.test.ts` | 1 | pre-existing |

## 3 · DEPLOYMENT AND INSTRUMENT PROOF

Authenticated probe, HTTP **200** on `/workspace/work-unit/waitlist` (never an unauthenticated
redirect — that branch builds a fresh `NextResponse.redirect` and *discards* the response the timing
headers were set on, which is what produced eight false "flag is off" reports in 12B):

```
x-alloy-mw-t0        1789675868938      present
x-alloy-mw-auth-ms   5                  present
x-alloy-admin-mw     next
__alloy_route_timing present, 828 bytes, parsed
```

### 4 · TIMING SELF-CHECK — the instrument validated by its own residual

| check | result |
|---|---|
| warm-up requests with `startRel < 0` excluded | 0 present in all 5 (harness filters regardless) |
| `relativeStart = startTime − navigationEpoch`; `duration = responseEnd` | applied |
| negative durations | **0** in all 5 |
| document `responseEnd`: Playwright vs the browser's own `PerformanceNavigationTiming` | agree to **0–1 ms** in all 5 |
| span ordering: spans ≤ `compose_wall_ms` | true in all 5, residual **0–1 ms** |
| `inner_compose_ms ≥ compose_total_ms` | true in all 5 |
| `compose_wall_ms ≤ document duration` | true in all 5 |
| shell < structure ≤ first critical ≤ last critical ≤ Track A | true in all 5 |

**One instrument disagreement, reported rather than hidden.** TTFB does *not* agree between the two
clocks: Playwright's `timing().responseStart` reads 485–953 ms while the browser's
`navigation.responseStart` reads 122–204 ms on the same navigations. Because the document is
streamed, the browser's earlier value is the one consistent with the shell flush; the two agree
exactly on `responseEnd`, which is the number every conclusion below rests on. TTFB is therefore
reported as a range, and no conclusion is drawn from it. (The first cut of this harness compared
Playwright's `responseEnd` against the browser's `navigation.duration`, which runs to
`loadEventEnd` — a comparison of two different quantities that read as a 581–1,334 ms instrument
failure. Corrected before any number was accepted.)

---

## 5 · THE DEPLOYED SAMPLE SET — 5 cold authenticated entries on `15639e053`

| n | doc | ttfb | wall | route_id | client | actor | inner | producers | unattr |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 5,834 | 855 | 5,092 | 207 | 0 | 0 | 2,063 | 2,822 | 0 |
| 1 | 4,567 | 593 | 4,092 | 205 | 0 | 0 | 1,550 | 2,336 | 1 |
| 2 | 5,237 | 953 | 4,732 | 573 | 0 | 0 | 1,714 | 2,445 | 0 |
| 3 | 5,416 | 485 | 5,015 | 140 | 0 | 0 | 1,833 | 3,042 | 0 |
| 4 | 5,422 | 644 | 4,898 | 159 | 0 | 0 | 2,021 | 2,718 | 0 |

| span | median | min | max |
|---|---|---|---|
| `card_producers_ms` | **2,718** | 2,336 | 3,042 |
| `inner_compose_ms` | 1,833 | 1,550 | 2,063 |
| `route_identity_ms` | 205 | 140 | 573 |
| `admin_client_ms` / `document_actor_ms` | 0 | 0 | 0 |
| **outer unattributed** | **0** | 0 | 1 |
| `compose_wall_ms` | 4,898 | 4,092 | 5,092 |
| document duration | 5,416 | 4,567 | 5,834 |

`card_producers_ms` remains the dominant outer wait, and the decomposition still fully explains
`compose_wall_ms` to within 1 ms.

## 6 · WHAT THE REPAIR ACTUALLY REMOVED: **0 ms**

The repaired boundary is the *position of the Financials permission gate* relative to
`Promise.allSettled`. Measuring it causally means evaluating the two shapes on the **same deployed
sub-spans**, not comparing two runs:

```
serial      = gate + max(attendance, health, financials_build)
concurrent  =        max(attendance, health, gate + financials_build)
```

| n | serial | concurrent | TIME_REMOVED |
|---|---|---|---|
| 0 | 2,822 | 2,822 | **0** |
| 1 | 2,336 | 2,336 | **0** |
| 2 | 2,444 | 2,444 | **0** |
| 3 | 3,041 | 3,041 | **0** |
| 4 | 2,717 | 2,717 | **0** |

| | |
|---|---|
| `WINNER_BEFORE_MS` (12D, `7e0d399ef`) | 2,791 median |
| `WINNER_AFTER_MS` (`15639e053`) | 2,718 median |
| **`TIME_REMOVED_MS`** | **0** |
| TTF critical before | 5,566 median |
| TTF critical after | **5,470** median |
| `TTFCRITICAL_DELTA` (observed) | −96 ms |
| **attributable delta** | **0 ms** |

**The −96 ms is not this repair and I am not claiming it.** Every span moved down by a similar
small fraction across the two runs — producers −73, inner −151, route identity −29, wall −107,
document −85 — which is the signature of environmental variance, not of a change confined to one
boundary. The causal measurement above, taken on the same request as the sub-spans, says 0.

This is the case Slice 12D's own certification named and refused to claim credit for: *"the saving
is the full gate duration when Attendance or Health is the long pole, and ZERO when the Financials
chain is."* The deployed answer is that the Financials chain is the long pole, so the saving is
zero. The gate that failed 125-vs-125 during certification was right, and shipping the weaker,
true claim — "never worse" — is what kept this report honest.

**The repair is still correct and stays.** It is unconditionally never worse, and it removes the
gate from the critical path the moment Financials stops dominating — which is precisely what the
next slice sets out to do.

## 7 · THE FOUR PRODUCER SUB-SPANS — the deployed question, answered

Canonical names, as emitted by `producerClock()`: **`financials_gate_ms`**, **`attendance_ms`**,
**`health_ms`**, **`financials_build_ms`**.

| n | `financials_gate_ms` | `attendance_ms` | `health_ms` | `financials_build_ms` | chain (gate+build) | max concurrent | `card_producers_ms` | Δ |
|---|---|---|---|---|---|---|---|---|
| 0 | 399 | 120 | 331 | 2,423 | 2,822 | 2,822 | 2,822 | 0 |
| 1 | 242 | 130 | 513 | 2,094 | 2,336 | 2,336 | 2,336 | 0 |
| 2 | 101 | 104 | 345 | 2,343 | 2,444 | 2,444 | 2,445 | 1 |
| 3 | 234 | 141 | 341 | 2,807 | 3,041 | 3,041 | 3,042 | 1 |
| 4 | 196 | 111 | 349 | 2,521 | 2,717 | 2,717 | 2,718 | 1 |

| sub-span | median | min | max |
|---|---|---|---|
| **`financials_build_ms`** | **2,423** | 2,094 | 2,807 |
| `health_ms` | 345 | 331 | 513 |
| `financials_gate_ms` | 234 | 101 | 399 |
| `attendance_ms` | 120 | 104 | 141 |
| Financials chain (gate + build) | 2,717 | 2,336 | 3,041 |
| **`producer_long_pole_ms` = max(concurrent)** | **2,717** | 2,336 | 3,041 |

### `PRODUCER_LONG_POLE` = **the Financials chain**, and inside it `buildFinancialsCardVM`

**Concurrency model validated.** `producer_long_pole_ms` 2,717 vs `card_producers_ms` 2,718 — a
residual of **0–1 ms in every sample**. The three producers really do overlap; the sub-spans are
**not** summed as serial latency, and the measured whole equals the measured longest branch.

`financials_build_ms` alone is **89 %** of `card_producers_ms` and **49 %** of `compose_wall_ms`.
Attendance (120) and Health (345) are entirely hidden beneath it and are **not** candidates.

`financials_gate_ms` (234) is now *proven* to sit on the critical path — because Financials is the
long pole, `gate → build` is serial within the winning branch. It cannot be overlapped away: a
permission gate must precede the ledger read, and moving it would be the one thing this programme
forbids buying latency with.

## 8 · CRITICAL-CARD COHERENCE

| n | business_process | financials | attendance | health_safety | window |
|---|---|---|---|---|---|
| 0 | 5,905 | 5,905 | 5,905 | 5,905 | **0** |
| 1 | 4,619 | 4,619 | 4,619 | 4,619 | **0** |
| 2 | 5,342 | 5,342 | 5,342 | 5,342 | **0** |
| 3 | 5,521 | 5,521 | 5,521 | 5,521 | **0** |
| 4 | 5,470 | 5,470 | 5,470 | 5,470 | **0** |

**`CARD_COHERENCE_WINDOW = 0 ms` in all five — budget ≤ 250 ms, PASS.** Faster producer scheduling
did **not** create a card-by-card waterfall: the four critical cards still become meaningful in the
same frame, and `published_structure` and `first_critical` are the same instant in every sample.

## 9 · PRODUCT PHASES AND HARD-TARGET ACCOUNTING

| phase | median | min | max | budget | verdict |
|---|---|---|---|---|---|
| destination shell | 1,128 | 838 | 1,486 | ≤ 500 | **MISS** |
| published structure | 5,470 | 4,619 | 5,905 | ≤ 1,000 | **MISS** |
| **first critical meaning** | **5,470** | 4,619 | 5,905 | **≤ 2,000** | **MISS** |
| last critical meaning | 5,470 | 4,619 | 5,905 | — | — |
| coherence window | 0 | 0 | 0 | ≤ 250 | **PASS** |
| Track-A meaningful / final settlement | 12,743 | 11,856 | 13,540 | ≤ 3,000 | **MISS** (Track A is accepted settlement-only doctrine; recorded, not re-opened here) |

```
AFTER_TTF_CRITICAL           5,470 ms
HARD TARGET                  2,000 ms
REMAINING_GAP_TO_TARGET      3,470 ms
```

**P0-7.6 remains OPEN.** The target is not relaxed and no number here was obtained by relaxing it.

### Where the 5,470 ms goes

| segment | median | note |
|---|---|---|
| edge auth (`x-alloy-mw-auth-ms`) | 5 | negligible |
| middleware `t0` → layout entry | 162 | framework dispatch |
| `route_identity_ms` | 205 | **CLOSED** — shared `cache()` hit, one resolution, two observers |
| `inner_compose_ms` | 1,833 | `presentation_ms` 1,585 dominates it |
| `card_producers_ms` | 2,718 | **the Financials chain, 2,717 of it** |
| outer unattributed | 0 | decomposition is complete |
| document remainder (doc − wall) | 518 | React render + RSC serialization + streaming |
| document end → first critical paint | 54 | client is not the problem |

## 10 · NEXT WINNER

### Ranked remaining INDEPENDENT critical-path waits (no nested span summed)

| # | wait | median | independent? |
|---|---|---|---|
| **1** | **`financials_build_ms`** (`buildFinancialsCardVM`) | **2,423** | yes — it *is* the producer long pole |
| 2 | `inner_compose_ms` | 1,833 | yes — runs before the producers |
| 3 | document remainder (render / RSC serialization) | 518 | yes |
| 4 | `financials_gate_ms` | 234 | on the path, but **structurally irreducible** (authorization must precede the read) |
| 5 | `route_identity_ms` | 205 | **CLOSED** — already shared |
| 6 | destination shell / TTFB | shell 1,128 | overlaps the compose; not additive to first critical |
| — | `health_ms` 345, `attendance_ms` 120 | | **hidden under the long pole — not candidates** |

Nested, and therefore **not** ranked as independent: `presentation_ms` 1,585, `composition_ms`
1,119, `projection_ms` 536, `records_ms` 114 all sit *inside* `inner_compose_ms` 1,833 and overlap
one another (their sum, 3,354, exceeds their container — proof they are concurrent, not serial).

### §11 · The avatar rule, applied

`child_grain_avatar` is **798 ms** median (635–1,011) — the longest single child-grain span. It is
**nested inside** `presentation_ms` (1,585), itself inside `inner_compose_ms` (1,833), so its
theoretical maximum contribution is ≤ 798 ms and only if it is the presentation long pole.
`financials_build_ms` is **3.0×** larger and fully independent.

**Explicit comparison, as required:** producer long pole 2,423 ms **vs** `child_grain_avatar`
798 ms → **the producer long pole wins by 1,625 ms.** The established principle stands unchanged —
avatar/media resolution may degrade to truthful initials and must not block critical operational
meaning — and avatar remains a real, ranked candidate for a later slice. It is not the next one,
and it is **not implemented here**.

### Exact recommended next repair — Slice 12E

> **Decompose `financials_build_ms` into its internal read spans, then de-serialize the measured
> long pole inside it.**

Not "make Financials faster" — that is the kind of unmeasured label that made Slice 12B call a
straddling gap a *prelude* and nearly aim the repair at route resolution. `financials_build_ms` is
today a single 2,423 ms span covering roughly fifteen table reads across ~18 awaits, of which the
opening sequence — `child_enrollment_agreements` → `customer_members` → `readAccountReductions` —
is **serial before** the first `Promise.all`. That is a visible candidate, but which term actually
dominates is exactly what is not yet measured, and this programme has now been wrong twice about
choosing a repair from a label instead of a measurement.

| | |
|---|---|
| theoretical maximum contribution | **2,373 ms** — if `financials_build_ms` fell to zero, `card_producers_ms` would become `max(120, 345, 234)` = 345 |
| realistic contribution | if it fell to Health's ~345 ms, `card_producers_ms` → 579, saving **2,139 ms** |
| expected target impact | TTF critical 5,470 → ~3,097 (max) or ~3,331 (realistic) |
| **does it close P0-7.6?** | **NO.** Even total elimination leaves ≈ 1,097 ms above the 2,000 ms target. `inner_compose_ms` (1,833) is the slice after it. |
| authority/correctness safety | HIGH — pure scheduling and read-narrowing inside one producer. The permission gate stays ahead of every ledger read; no card is deferred; no value is cached across operators |

**Not chosen, and why:** deferring any of the three producers (all critical cards) would turn a 0 ms
coherence window into a multi-second waterfall, which the budget explicitly forbids; caching across
operators is unsafe because operator access is an input; parallelizing the producers is already done
and now measured to within 1 ms.

## 11 · CORRECTNESS — all five samples

| requirement | result |
|---|---|
| `unstable_or_false_construction_ms = 0` | no stale identity, no fabricated value, no blank reserved cell, no late structural insertion, no geometry jump observed |
| `CARD_COHERENCE_WINDOW ≤ 250 ms` | **0 ms**, 5/5 |
| **no client provisioning fallback** | `provisioning-answer` requests = **0**, 5/5; `seeded: true`, 5/5 |
| all configured cells present at structure commit | **6 / 6**, 5/5 |
| all six painted by settlement | business_process, financials, attendance, health_safety, children, household — 5/5 |
| Track-A resolving truthfully | children + household reserved until 11,856–13,540 ms, then meaningful — never blank, never false |
| participant authorization | Health still evaluates `health.view` itself; Financials still gated on `fin.read` before any ledger read; `forbidden` ≠ `unavailable` preserved |
| Attendance / Health stable | 120 ms and 345 ms medians, tightest ranges in the set |
| BP / Financials geometry | geometry certification 51/51; no overlap or jump observed across 5 settled entries |
| Presentation Truth 7.2–7.5, Structural Commit | green |

**No latency gain was taken through stale or fabricated truth — and none was taken at all.**

## 12 · `ALLOY_ROUTE_TIMING`

**KEEP ENABLED.** The next repair's target, `financials_build_ms`, exists only because this
instrument reports it, and Slice 12E must decompose that span further. Disabling it now would
leave the winner unmeasurable and force the next slice to choose from a label. Recommend disabling
and rebuilding when P0-7.6 closes, not before.

---

## 13 · UPDATED P0-7.6 LEDGER

| item | state |
|---|---|
| 11 serialization (−6,579 ms client provisioning) | CLOSED deployed-verified |
| 12A route-timing instrument convergence | CLOSED |
| 12B document diagnosis | CLOSED |
| 12C outer-compose decomposition | CLOSED |
| **12D gate concurrency** | **CLOSED — promoted, deployed `15639e053`, measured. `TIME_REMOVED_MS = 0`; correct, retained, never worse** |
| 13 published-composition decoupling | CLOSED — LOW_VALUE (~13 ms) |
| route-resolution caching | CLOSED — `SHARED_CACHE_HIT`, 205 ms, already reused |
| producer parallelism | CLOSED — validated to 0–1 ms against `card_producers_ms` |
| **12E `financials_build_ms`** | **OPEN — the next target, 2,423 ms** |
| 12F `inner_compose_ms` / `presentation_ms` | OPEN — 1,833 / 1,585 ms |
| `child_grain_avatar` | OPEN — 798 ms, ranked below the producer long pole |
| document remainder | OPEN — ~518 ms |
| destination shell ≤ 500 ms | OPEN — 1,128 ms measured (P0-7.8 territory) |
| 14 defer non-visible work | OPEN — but never the three critical producers |

```
READY_FOR_NEXT_LATENCY_REPAIR = YES
```

**P0-7.6 OPEN.** Deployed median time-to-first-critical-meaning **5,470 ms** against a hard
**2,000 ms** target — gap **3,470 ms**. The target is not lowered to fit the architecture.
