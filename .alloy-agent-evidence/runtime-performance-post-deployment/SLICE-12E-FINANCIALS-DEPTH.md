# P0-7.6 SLICE 12E — THE FINANCIALS LONG POLE IS DEPTH, AND EIGHT ROUND TRIPS OF IT ARE GONE

**`P0_7_6_SLICE_12E_FINANCIALS_LONG_POLE_REPAIR_COMPLETE_CERTIFIED`**

| | |
|---|---|
| Starting SHA | `c911a6644` |
| Instrumentation + repair SHA | **`1533989ec`** (one commit — the instrument is what chose the repair) |
| Certification SHA | this commit |
| Files changed | `buildFinancialsCardVM.ts`, `routeTimingDiagnostic.ts`, `financialsBuildSerialization.test.ts` (new) |
| Promoted | **NO** — forbidden by the instruction |

**Not deployed, so no deployed improvement is claimed.** Every "after" figure below is either a
measured round-trip count (machine-independent) or a number modelled from it at a calibrated rate,
and is labelled as such.

---

## 1 · WHAT WAS MEASURED FIRST — AND WHY NOT "MAKE FINANCIALS FASTER"

Slice 12D named `buildFinancialsCardVM` the deployed producer long pole — 2,423 ms median, 89 % of
`card_producers_ms`, 49 % of `compose_wall_ms` — and could say nothing about what inside it costs
that. The whole build was one span over roughly fifteen table reads.

Thirteen awaited boundaries now report through the **existing** `ALLOY_ROUTE_TIMING` authority
(`financialsClock` / `recordFinancialsSpans`, the same shape as 12D's `producerClock`). No second
timing system. Names carry no account, subject or monetary value.

Plus one thing a duration cannot say: **`collectible_calls`**, how many round trips the
collectibility loop made. One slow read and N reads want opposite repairs, and a single number
cannot tell them apart.

The spans are filed from a wrapper with a `finally`, because this function has four early returns
and a throw. Recording at each `return` would have left exactly the interesting failure paths
unmeasured — which is how a boundary gets called cheap because nobody ever saw its number.

## 2 · THE EXECUTION DAG — runtime dependency, not source order

| # | operation | owner | needs | start condition | authority grain | serial/parallel (before) | required for FIRST_MEANINGFUL | reuse today |
|---|---|---|---|---|---|---|---|---|
| 1 | `child_enrollment_agreements` | build | org + household/member | entry | org + account | root | **YES** — the billable sources | none |
| 2 | `customer_members` | build | member ids ← 1 | after 1 | org | serial after 1 | **YES** — row subject names | none |
| 3 | `financial_reduction_applications` → `charges` | `readAccountReductions` | agreement ids ← 1 | after 2 | org + account | serial, 2 deep | **YES** — credits semantics | none |
| 4 | `charges` | build | billable source ids ← 1 | after 3 | org + account | 1 | **YES** — the ledger | none |
| 5 | `gl_account_mappings` | build | **orgId only** | after 3 | **org config** | with 4 | YES (GL codes) | **none — reread per request** |
| 6 | `gl_accounts` | build | **orgId only** | after 3 | **org config** | with 4 | YES | **none** |
| 7 | `financial_charge_templates` | build | **orgId only** | after 3 | **org config** | with 4 | YES (labels, Add-charge) | **none** |
| 8 | `financial_responsibility_allocations` → `payment_responsibility_attributions` → `financial_expected_funding` | `readResponsibility` | charge ids ← 4 | after 4 | org + charges | serial, 3 deep | **YES** — who owes it | none |
| 9 | `resolveFamilyCollectible` **× N obligations** | build loop | rows ← 4 | after 8 | org + charge | **serial in N**, up to ~8 trips each | **YES** — collectibility | none |
| 10 | `payment_allocations` + `payments` → `payments` | `readAccountPayments` | source + charge ids | after 9 | org + account | 2 deep | **YES** — what has been paid | none |
| 11 | `resolveHouseholdPaymentViews` | build | payments ← 10 | after 10 | org + household | serial after 10 | secondary — application detail | none |
| 12 | `payment_provider_merchants` | build | **orgId only** | after 11 | **org config** | 1 | secondary — ACH affordance | **none; near-duplicate of 14** |
| 13 | `payment_provider_merchants` + `customer_payment_methods` → `customer_persons` | `resolvePaymentSetup` | org + customer | after 12 | org + account | 2 deep | secondary — payment affordance | none |
| 14 | `resolvePayerCandidates` | build | responsibility ← 8 | after 13 | org + account | 1 | secondary — payer chooser | none |
| 15 | `payment_collection_attempts` | build | charge ids ← 4 | after 14 | org + charges | 1 | secondary — in-flight collections | none |

**Source order was standing in for a dependency graph that does not exist.** Steps 5–7 and 12 need
only `orgId`. Steps 2, 3 and 4 need only step 1. Steps 8, 9, 10, 13 and 15 consume none of each
other's results.

## 3 · THE INSTRUMENT — round trips, not a local wall clock

Local Postgres answers in ~1 ms, so a local duration says nothing about a hosted one. What IS
machine-independent is **serial depth**: the longest chain of round trips that had to happen one
after another. On a hosted database that is what RTT multiplies.

Depth is computed from the recorded trip intervals as a longest-chain walk, **not** by dividing wall
time by latency — the first cut did that and read **10 bare and 13 under vitest** for the same code.
A graph property must not be measured through the event loop's mood.

Only the transport is substituted. `readAccountReductions`, `readResponsibility`,
`readAccountPayments`, `resolveFamilyCollectible`, `resolvePaymentSetup`, `resolvePayerCandidates`
and `resolveHouseholdPaymentViews` all run for real and issue their own queries through it.

### RTT calibration — three independent deployed producers agree

| producer | serial depth (measured) | deployed median (12D) | implied ms / serial round trip |
|---|---|---|---|
| `assertFinancialsReadAllowed` | 1 (`user_roles`) | 234 ms | 234 — the request's FIRST read, and the outlier |
| `buildAttendanceCardVM` | 1 | 120 ms | **120** |
| `buildHealthSafetyCardVM` | 3 | 345 ms | **115** |

**~115–120 ms per serial round trip**, from two independent agreeing producers. The gate's 234 ms is
one read too, and being the first read of the request it plausibly carries connection setup; it is
reported, not averaged in.

Inverting: `financials_build_ms` 2,423 ms ÷ ~118 ≈ **20 serial round trips deployed**, which the
fixture model (`depth ≈ 14 + N`) puts at roughly **four to six posted obligations** in the period.

## 4–13 · THE MEASUREMENT — three runs at each of five account sizes, before and after

Graph depth is deterministic: every run returned the same integer.

| posted obligations | 0 | 1 | 3 | 6 | 12 |
|---|---|---|---|---|---|
| **before** (`c911a6644`) | 10 | 15 | 17 | 20 | 26 |
| **after** | **5** | **7** | **9** | **12** | **18** |
| removed | 5 | 8 | **8** | 8 | 8 |
| round trips before / after | 14/14 | 20/20 | **22/22** | 25/25 | 31/31 |

**`FINANCIALS_MEASURED_INTERNAL_MS`** — the boundary spans at a representative account, before:

| boundary | round trips | serial? | share of depth |
|---|---|---|---|
| `agreements_ms` | 1 | root | 1 |
| `members_ms` | 1 | serial after agreements | 1 |
| `reductions_ms` | 2 | serial after members | 2 |
| `charges_ms` + `config_ms` | 4 | one wave | 1 |
| `responsibility_ms` | 3 | serial | 3 |
| **`collectible_ms`** | **N** (`collectible_calls`) | **serial in N** | **N** |
| `payments_ms` + `payment_views_ms` | 3 | serial | 3 |
| `merchant_ms` | 1 | serial | 1 |
| `payment_setup_ms` | 2 | serial | 2 |
| `payer_candidates_ms` | 1 | serial | 1 |
| `open_collections_ms` | 1 | serial | 1 |

**`FINANCIALS_UNATTRIBUTED_MS`**: the internals are deliberately **not** forced to sum to the outer
span. Round trips counted by the client (22 at N=3) and boundaries named by the clock (13) agree
with the timeline exactly; the residual is the CPU between them, which at this shape is
sub-millisecond locally and is not claimed as a hosted number.

### 14 · DOMINANT INDEPENDENT WAIT — **depth, not any single query**

No single read dominates. **Seventeen serial round trips did.** Of those, **eight were ordering, not
dependency** — and the ninth-and-beyond are the per-obligation loop, which is a different defect.

## 15–17 · CRITICAL FINANCIALS MEANING, AND WHAT THE CARD ACTUALLY NEEDS

Taken from the existing contract (`FinancialsCardVM`, the Focus Panel adapter and the 12D producer
map), **not** invented for this slice. The card's critical operator question is *what does this
family owe, what has been paid, and what is collectible* —

| read | serves | classification |
|---|---|---|
| agreements, members, charges | the ledger and its subjects | **MUST_BLOCK_CRITICAL_CARD** · ACCOUNT_SPECIFIC |
| reductions | credits/adjustments semantics | **MUST_BLOCK** · ACCOUNT_SPECIFIC |
| responsibility (3 reads) | who owes it, expected funding | **MUST_BLOCK** · ACCOUNT_SPECIFIC |
| collectibility (N × ≤8) | posted/pending, suppression, variance | **MUST_BLOCK** · ACCOUNT_SPECIFIC |
| payments (+ views) | what has been paid | **MUST_BLOCK** · ACCOUNT_SPECIFIC |
| GL mappings, GL accounts, charge templates | GL codes, operator-facing labels, Add-charge options | **MUST_BLOCK** (labels are on the row) · **CACHEABLE_CONFIG_GRAIN** |
| merchant, payment setup, payer candidates, open collections | *affordances* — can a card be taken, who could pay, what is in flight | **CAN_DEFER_AFTER_CRITICAL** · ACCOUNT_SPECIFIC / PER_OPERATOR |

Four reads (≈ 5 round trips, ≈ 590 ms hosted) are genuinely secondary. **They were not deferred
here.** §10 warns against inventing a thinner card contract to hit a number, and the Focus Panel
composes once — deferring them means a second render pass and a card that changes what it offers
after the operator is already looking at it. Recorded as a candidate, deliberately declined.

## 18–21 · AUTHORITY, REUSE AND CACHE ANALYSIS

**Authorization boundary — unchanged and untouched.** `fin.read` is evaluated by
`assertFinancialsReadAllowed` in `projectFocusPanelCardProducers`, **before** this function is
reached, and a denied caller still causes no ledger read at all. The build holds no permission
opinion of its own — asserted: it contains no `fin.read`, no `assertFinancialsReadAllowed`, no
`permissionKeys`, no `user_roles`. Every query it issues still carries an `org_id` or `customer_id`
predicate — asserted over the source, query by query.

**Reuse / dedupe.** One near-duplicate found: `payment_provider_merchants` is read twice — once by
the card for `ach_readiness` with `processor = 'stripe'`, once by `resolvePaymentSetup` for *any*
active merchant. **Hoisted, not collapsed.** They are not the same question, and merging them would
quietly change which merchant answers for ACH on a tenant with more than one. A latency slice does
not get to decide that. The query multiset gate pins the count at **two, deliberately**, with the
reason written beside it.

No other read duplicates truth already available from the provisioning or operational context: the
charge, responsibility, funding and payment reads are all account-grain and none is carried on the
request.

**Cache.** Three reads are configuration grain (`gl_account_mappings`, `gl_accounts`,
`financial_charge_templates`) and would satisfy §8's contract at org grain. **Not cached.** Once
hoisted they cost **zero additional serial depth** — they complete inside the agreements read's own
window — so a cache would buy nothing and add an invalidation authority to maintain. Nothing
money-facing is cached, and nothing mutable is cached at all.

## 22–24 · THE REPAIR

**Scheduling only. Same queries, same predicates, same rows, same failure behaviour.**

1. **The org-grain reads start at entry.** GL mappings, GL accounts, charge templates and the
   merchant row are issued before the first `await`, with `.catch` attached at creation so the
   early-return paths cannot leave an unhandled rejection.
2. **Everything the agreements unlock goes out together.** Members, reductions and charges in one
   `Promise.all`, each keeping its own failure behaviour — reductions still degrade to an empty
   history, a charges failure is still the one that makes the card unavailable.
3. **The five tail reads are issued where their inputs exist.** Responsibility, payments, payment
   setup, payer candidates and open collections are started as soon as the rows are known and
   awaited, in the original order, where their answers are used. Payment views stay chained to the
   payments read — that dependency is real — and the two still fail as one outcome, because the
   existing contract is that either failing means the card cannot say what has been paid.

### Dependency / parallelization proof

`gl_account_mappings`, `gl_accounts`, `financial_charge_templates` and `payment_provider_merchants`
take only `args.orgId` — asserted at runtime: each is issued inside the first round-trip window.
Members, reductions and charges take only the agreements — asserted: their start times differ by
less than one round trip. The five tail reads take only charge ids and the account — asserted by the
depth collapsing from 17 to 9 with **the identical query multiset**.

### Financial-truth proof

The produced card was captured at five account sizes from a probe worktree at `c911a6644` and from
the repaired tree, and compared as JSON:

| posted | 0 | 1 | 3 | 6 | 12 |
|---|---|---|---|---|---|
| identical | **yes** | **yes** | **yes** | **yes** | **yes** |
| bytes | 3,574 | 4,993 | 7,373 | 10,908 | 17,986 |

**Byte for byte, at every size.** Rows, applied and outstanding cents, lifecycle status, reversal
lineage, responsibility, collectibility, reconciliation per subject, past due, ledger periods,
templates, ACH availability — all unchanged. Posted/pending, credits and corrections, funding and
collectibility semantics and billing-period placement are untouched; no partial money is presented
as final, nothing is fabricated as zero, and `unavailable` never becomes empty.

### 25 · PLANTED DEFECTS

| plant | result |
|---|---|
| **A** — remove one declared Financials span (`merchant_ms`) | *the spans recorded and declared are the SAME SET* **fails** |
| **A2** — keep the read, stop timing it | same gate **fails** |
| **B** — `await` the hoisted reads before the agreements read (real re-serialization) | **3 depth gates fail** |
| **B3** — full revert of the repair | **10 gates fail** |
| **C** — bypass `fin.read` (let a denied caller read anyway) | *a denied caller still causes no ledger read* **fails** |
| **D** — let a failed payments read pass as "nothing has been paid" | *a payments read that fails is still UNAVAILABLE* **fails** |
| **E** — re-serialize the introduced concurrency | covered by **B / B3** |

**Two gate weaknesses the plants caught, and both are fixed.** The instrument gate first asserted
only *"every declared span is recorded"*, and plant A walked past it — deleting a declaration proves
nothing about a timer. It is now a set equality in both directions. And the depth bounds were first
set loose enough that plant B's real re-serialization passed; they are now the measured after-values
exactly, as ceilings. A third plant of mine stayed green because the mutation was a **no-op** — an
array literal creates its promises eagerly, so awaiting them in a loop changes nothing — which is
why the binding plant is the full revert rather than a clever edit.

## 26–30 · PERFORMANCE

| | |
|---|---|
| `FINANCIALS_BUILD_BEFORE_MS` | **2,423** (deployed 12D median) |
| serial round trips removed | **8**, constant in account size |
| calibrated hosted cost | **115–120 ms** per serial round trip |
| **`FINANCIALS_TIME_REMOVED_MS`** | **≈ 920–960 ms** — MODELLED, not deployed |
| **`FINANCIALS_BUILD_AFTER_MS`** | **≈ 1,460–1,500** (modelled) |
| Financials chain after (gate 234 + build) | ≈ **1,700–1,740** |
| `card_producers_ms` after = max(120, 345, chain) | ≈ **1,710** (was 2,718) |
| **`THEORETICAL_TTFCRITICAL_AFTER_12E`** | **≈ 4,470–4,510** (was 5,470) |
| **`REMAINING_GAP_TO_2S`** | **≈ 2,470 ms** |

**No deployed improvement is claimed.** The 8 round trips are measured; the millisecond figure is
that count times a rate calibrated from three deployed producers, and the deployed after-measurement
is owed to the promotion run.

## 31–35 · GATES

| gate | result |
|---|---|
| new Slice 12E gates | **19 / 19** |
| Financials + access + runtime + surfaces + focus panel + viewModel + qa regression | **4,257 / 4,319** |
| same regression re-run on the base `c911a6644` | 4,238 / 4,300 — **47 failures before, 47 after, ZERO new** |
| `typecheck` | rc=0 |
| `typecheck:tests` | rc=0 |
| production build (`ALLOY_ROUTE_TIMING=1`) | rc=0 |
| geometry browser certification | **51 / 51** |

Collectibility, responsibility/funding, credits/adjustments, posted/pending, participant
authorization, Presentation Truth, Structural Commit and BP/Financials geometry all green. The card
identity proof above covers card truth directly rather than by suite membership.

### One pre-existing divergence found and deliberately not touched

The comment beside the applied-money loop says a failed payments read leaves rows *"owing their
whole amount and offering nothing"*. The recompute runs unconditionally after the `catch`, so a
posted row still offers **Record payment**. Identical on `c911a6644` — this slice neither caused nor
fixed it, and a latency slice is the wrong place to change what a card offers. The gate asserts the
behaviour that IS true (nothing is claimed as paid; every row owes its full amount) and says in
writing why it does not assert `offersPayment`.

## 36–39 · PROGRAMME

| item | state |
|---|---|
| 11 serialization | CLOSED deployed-verified |
| 12A / 12B / 12C | CLOSED |
| 12D gate concurrency | CLOSED — deployed `15639e053`, `TIME_REMOVED_MS = 0`, correct and retained |
| route-resolution caching | CLOSED — `SHARED_CACHE_HIT`, 205 ms |
| producer parallelism | CLOSED — validated to 0–1 ms |
| **12E Financials build depth** | **REPAIRED + CERTIFIED — promotion and deployed after-measurement owed** |
| **12F collectibility loop (`collectible_calls` × ≤8 trips, serial)** | **OPEN** |
| **12G `inner_compose_ms` / `presentation_ms`** | **OPEN — the next target** |
| `child_grain_avatar` 798 ms | OPEN — nested inside presentation |
| document remainder ~518 ms | OPEN |
| destination shell 1,128 ms vs ≤500 ms | OPEN (P0-7.8 territory) |
| defer the four secondary Financials affordances (~5 trips) | OPEN — classified, declined here |

### 37 · Ranked remaining independent critical-path waits, after 12E

| # | wait | modelled after 12E | note |
|---|---|---|---|
| **1** | **`inner_compose_ms`** | **1,833** | **unchanged by 12E — and now the LARGEST single wait.** 12E flips the critical path |
| 2 | `card_producers_ms` | ≈ 1,710 | still the Financials chain: build ≈1,480 + gate 234 |
| 3 | document remainder | ~518 | React render / RSC serialization |
| 4 | `financials_gate_ms` | 234 | structurally irreducible — authorization precedes the read |
| 5 | `route_identity_ms` | 205 | CLOSED — already shared |
| — | `health_ms` 345, `attendance_ms` 120 | | still hidden under the Financials chain |

Nested, not ranked: `presentation_ms` 1,585, `composition_ms` 1,119, `projection_ms` 536 inside
`inner_compose_ms` 1,833 — their sum exceeds their container, so they already overlap partially.

### 38 · Exact recommended next slice — 12G

> **Decompose `inner_compose_ms` the way 12E decomposed the Financials build, and remove its depth.**

It is now the largest independent wait (1,833 ms vs the producers' ~1,710), and it has the same
signature: `presentation_ms` 1,585 contains four child-grain reads — `child_grain_avatar` 798,
`child_grain_members` 536, `child_grain_waitlist` 516, `child_grain_inquiry` 258 — whose sum, 2,108,
already exceeds its container, so they overlap **partially**. Whether the remainder is unnecessary
ordering is exactly what a round-trip decomposition answers, and exactly what 12E has now shown is
worth asking before choosing a repair.

**12F (the collectibility loop) is the alternative**, and it is deliberately ranked second: its
saving is `(N−1) × up-to-8` round trips, which is larger for a big account and **zero** for an
account with one obligation, and parallelising a per-obligation subsidy resolver multiplies
concurrent database pressure by N. That is money-facing work for its own slice with its own
regression — the same discipline that kept 12D honest.

Neither closes P0-7.6: even both landing in full leaves the gap well above zero.

```
READY_FOR_12E_PROMOTION = YES
ALLOY_ROUTE_TIMING       = KEEP ENABLED — the deployed after-measurement needs these Financials spans
```

**P0-7.6 remains OPEN.** Modelled TTF critical after 12E ≈ **4,470 ms** against a hard **2,000 ms**
target — gap ≈ **2,470 ms**. The target is not lowered to fit the architecture.
