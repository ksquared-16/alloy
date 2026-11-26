# P0-7.6 SLICE 12D — DOMINANT WAIT MEASURED AND REPAIRED

**`P0_7_6_SLICE_12D_DOMINANT_WAIT_REPAIR_COMPLETE_CERTIFIED`**

| | |
|---|---|
| Starting SHA | `9a60a1f28` |
| Decomposition candidate | `55ac5d58b` → PR [**#1057**](https://github.com/ksquared-16/alloy/pull/1057) → merge **`7e0d399ef`** → deployed **`7e0d399ef`** |
| Repair SHA | **`255c23a40`** |
| Certification SHA | this commit |
| Files changed | `focusPanelCardProducers.ts`, `routeTimingDiagnostic.ts`, `composeProvisioningAnswerForRoute.ts`, `financialsGateConcurrency.test.ts` (new), + census artifact |

Repair **not promoted**, per instruction.

### A promotion note worth carrying forward

The decomposition merge first failed **`hosted_migration_evidence_stale`** — a peer lane left the hosted census 25 h old. I verified state rather than trusting the message (PR open, staging unchanged), re-measured with `database.read_census` over `hosted-migration-identity-census.sql` (`gar_647cef93c1f2f6`), and refiled. The refreshed results artifact is now committed so the next promotion does not fail the same way.

---

## 9–16 · THE MEASUREMENT — five cold entries on `7e0d399ef`

| n | doc | wall | route_id | client | actor | inner | producers | unattr | route_meta |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 9,962 | 8,603 | 1,704 | 1 | 0 | 3,935 | 2,963 | 0 | 1,725 |
| 2 | 6,035 | 5,546 | 197 | 0 | 0 | 2,031 | 3,317 | 1 | 198 |
| 3 | 5,065 | 4,549 | 173 | 0 | 0 | 1,584 | 2,791 | 1 | 174 |
| 4 | 4,993 | 4,509 | 234 | 0 | 0 | 1,984 | 2,290 | 1 | 235 |
| 5 | 5,501 | 5,005 | 785 | 0 | 0 | 1,734 | 2,486 | 0 | 785 |

**Independent outer boundaries — median / min / max / range**

| span | median | min | max | range |
|---|---|---|---|---|
| **`card_producers_ms`** | **2,791** | 2,290 | 3,317 | **1,027** |
| `inner_compose_ms` | 1,984 | 1,584 | 3,935 | 2,351 |
| `route_identity_ms` | 234 | 173 | 1,704 | 1,531 |
| `outer_unattributed` | **1** | 0 | 1 | 1 |
| `admin_client_ms` | 0 | 0 | 1 | 1 |
| `document_actor_ms` | **0** | 0 | 0 | 0 |

**`OUTER_UNATTRIBUTED_MS` ≈ 0–1 ms.** The decomposition *fully explains* `compose_wall_ms` — the instrument is validated by its own residual, not by assertion. The two synchronous steps are confirmed free: measured, not assumed.

### 16 · DOMINANT WINNER: `card_producers_ms`

Largest median (2,791 vs 1,984) **and by far the most stable** (range 1,027 vs 2,351). Largest in 4 of 5 samples; sample 1 is the exception, which is why I extended from three samples to five per §4 rather than calling it on the first three.

## 17 · ROUTE-IDENTITY VERDICT: **`SHARED_CACHE_HIT`**

| | route_identity | route_meta | delta |
|---|---|---|---|
| s1 | 1,704 | 1,725 | 21 |
| s2 | 197 | 198 | 1 |
| s3 | 173 | 174 | 1 |
| s4 | 234 | 235 | 1 |
| s5 | 785 | 785 | **0** |

Near-identical in every sample. Two *independent* resolutions would produce different durations and would sum; identical durations mean layout and page render concurrently and both `await` the **same in-flight promise** returned by React `cache()`. **One resolution, two observers.**

**The route-resolution hypothesis is closed.** The cache already works, and at a 234 ms median it was never the problem. Building caching for it would be building caching for work that is already reused — exactly what §5 warns against. This also settles the tension 12B raised and 12C could not resolve.

---

## 18–21 · THE WINNER, TRACED

`projectFocusPanelCardProducers` runs three producers under one `Promise.allSettled`:

| producer | card | authority grain | operator-specific | required for critical meaning |
|---|---|---|---|---|
| `buildAttendanceCardVM` | **attendance** | org + customerMember | no | **YES — critical card** |
| `buildHealthSafetyCardVM` | **health_safety** | org + member, evaluates `health.view` itself | **YES** | **YES — critical card** |
| `buildFinancialsCardVM` | **financials** | org + customer, gated on `fin.read` | **YES** | **YES — critical card** |

**Three of the four critical cards are produced here.** That closes off most of the repair menu:

* **DEFER — unavailable.** Deferring them turns a 0 ms coherence window into a multi-second waterfall. The programme's own budget forbids *"showing critical cards as resolving for many seconds and calling the structure fast."*
* **CACHE across operators — unsafe.** Operator `access` is an input; Health evaluates its own grant, Financials gates on a different key.
* **PARALLELIZE — already done.**

## 22–24 · THE REPAIR

`assertFinancialsReadAllowed` was **awaited above `Promise.allSettled`** — a permission round trip only Financials needs, run to completion before Attendance and Health were allowed to start. No data dependency requires it. It now runs **inside** the Financials branch.

**Authorization is untouched.** Same canonical gate, same route-resolved org and caller, still **before** the ledger read; a failed grant read is still a refusal, not "no opinion"; a denied caller still causes **no read at all**. The verdict travels out with the VM because `forbidden` (the gate said no) and `unavailable` (no account) are different answers and must not collapse.

### ⚠ HONEST BOUND ON THE GAIN — my own test caught me overclaiming

My first behavioural gate asserted the concurrent shape is simply faster. **It failed: 125 vs 125.** In that model the Financials chain *was* the long pole, and `allSettled` waits for the longest branch either way. The real relationship:

```
serial     = gate + max(A, H, F)
concurrent =        max(A, H, gate + F)
```

**The saving is the full gate duration when Attendance or Health is the long pole, and ZERO when the Financials chain is.** Which holds on staging is **not yet measured**.

So the gates now assert only what is unconditionally true — **the concurrent shape is never worse** — and this slice adds the four concurrent sub-spans (`financials_gate_ms`, `attendance_ms`, `health_ms`, `financials_build_ms`) that will settle it on the next deployed run. They **overlap and must not be summed**; `card_producers_ms` is approximately the longest, not the total.

## 25 · PLANTED DEFECTS

| plant | result |
|---|---|
| restore the serial gate (the exact repaired defect) | **2 fail** — *gate is inside allSettled*, *no awaited statement remains before it* |
| denied caller reads the ledger anyway | *a denied caller still causes no ledger read* fails |
| collapse `forbidden` into `unavailable` | *the gate verdict travels with the VM* fails |

Upstream instrumentation remains capable of measuring the regression: `card_producers_ms` still brackets the whole step, so a reverted repair shows up as a larger span, not a missing one.

---

## 26–30 · PERFORMANCE

| | |
|---|---|
| `WINNER_BEFORE_MS` | **2,791** median (2,290–3,317) |
| `WINNER_AFTER_MS` | **not measured** — requires promotion, forbidden here |
| `TIME_REMOVED_MS` | **0 – `financials_gate_ms`**, bounded and honestly unquantified |
| `EXPECTED_TTFCRITICAL_AFTER_12D` | 5,566 median − (0 … gate) |
| `REMAINING_GAP_TO_2S` | **≥ 3,566 ms** |

No deployed improvement is claimed. Median first-critical-meaning on this build measured **5,566 ms** (5,061–10,056) — lower than 12B's 7,879 ms, but that is environmental variance across runs, not this repair, and I am not attributing it.

## 31–35 · GATES AND CORRECTNESS

| gate | result |
|---|---|
| focused regression | **235 / 237 across 14 files** |
| geometry browser suite | **51 / 51** |
| `typecheck` / `typecheck:tests` / `build` | **rc=0 / rc=0 / rc=0** |

Both reds pre-existing and classified (provisioning TTL hygiene; `EXTERNAL_FINANCIALS_TEST_DEBT`).

From the five deployed samples: **`CARD_COHERENCE_WINDOW = 0 ms` in all five** · **client provisioning requests 0 in all five** · **all six configured cells at structure commit and at settlement in all five** · Presentation Truth, Structural Commit, participant/producer authorization and geometry green.

---

## 36–39 · PROGRAMME

| | state |
|---|---|
| 11 serialization | CLOSED deployed-verified |
| 12A / 12B / 12C | COMPLETE |
| 13 published-composition decoupling | CLOSED — LOW_VALUE |
| **route-resolution caching** | **CLOSED — `SHARED_CACHE_HIT`, already reused, 234 ms** |
| **12D gate concurrency** | **REPAIRED + CERTIFIED — promotion and after-measurement owed** |
| 12E producers long pole | **OPEN — the next target**, named by the new sub-spans |
| 14 defer non-visible work | OPEN — but NOT the three critical producers |
| unattributed document time | CLOSED at the compose boundary (~1 ms); the ~500 ms document remainder is still open |

### Ranked remaining critical-path work

1. **`card_producers_ms` 2,791 ms** — still dominant after this repair; the sub-spans name which producer
2. `inner_compose_ms` 1,984 ms — `presentation` / `composition` nested inside
3. `route_identity_ms` 234 ms — **closed**, already shared
4. document remainder ~500 ms — React render / RSC serialization

### Exact recommended Slice 12E

> **Promote this repair, measure the four producer sub-spans, and attack the long pole.**

The sub-spans answer two questions in one run: how much this repair actually saved, and which of Attendance / Health / Financials is the producer to attack. Given all three are critical cards, the likely shapes are **narrowing what each producer reads** or **moving work into the inner compose where it can overlap**, not deferral.

**`READY_FOR_12D_REPAIR_PROMOTION = YES`.**

**P0-7.6 remains OPEN.** Gap ≥ 3,566 ms to the 2,000 ms target, which this repair alone was never going to close — and the target is not relaxed.
