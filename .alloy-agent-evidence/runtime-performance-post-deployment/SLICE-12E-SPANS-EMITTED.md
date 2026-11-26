# P0-7.6 SLICE 12E — THE SPANS NOW EMIT, AND THEY CONTRADICT MY OWN NEXT-SLICE RANKING

**Addendum to `SLICE-12E-DEPLOYED-AND-CONVERGENCE.md`.** The emission repair the previous run
recorded as *promotion owed* is promoted, deployed, and the outcome proof is taken.

| | |
|---|---|
| Emission repair | `cedf6b71f` → PR [**#1060**](https://github.com/ksquared-16/alloy/pull/1060) → merge **`4dcb407f8`** → deployed **`4dcb407f8`** |
| Gates | 113/113 focused, `typecheck` rc=0, `typecheck:tests` rc=0, build rc=0, all 8 CI checks pass |

---

## 1 · THE OUTCOME PROOF THE GATE COULD NOT GIVE

The Slice 12E gate for this repair was a **source** gate, and it said so in writing: `routeTimingCollector`
is a React `cache()`, so under vitest a write and a read return different objects and a behavioural
assertion would be testing the harness. The real proof was the deployed payload, and here it is —
the route-timing seed grew from **830 to 1,137 bytes**, and `financials` is populated in **all five**
cold samples where it was `null` in all five before:

```json
"financials": { "agreements_ms":102, "members_ms":128, "reductions_ms":0, "charges_ms":119,
                "config_ms":156, "responsibility_ms":108, "collectible_ms":245,
                "collectible_calls":2, "payments_ms":140, "payment_views_ms":1152,
                "merchant_ms":109, "payment_setup_ms":116, "payer_candidates_ms":111,
                "open_collections_ms":113 }
```

## 2 · THE INTERNAL SPANS, DEPLOYED — five cold entries on `4dcb407f8`

Self-check: 0 warm-ups with `startRel < 0`, 0 negative durations, `financials` present 5/5, document
`responseEnd` agreeing with the browser's own navigation timing to **0 ms in all five**.

| span | median | min | max |
|---|---|---|---|
| **`payment_views_ms`** | **1,152** | 974 | 1,299 |
| `collectible_ms` (`collectible_calls` = **2**) | 245 | 208 | 366 |
| `config_ms` | 156 | 115 | 851 |
| `payments_ms` | 140 | 112 | 285 |
| `members_ms` | 128 | 109 | 265 |
| `charges_ms` | 119 | 90 | 290 |
| `payment_setup_ms` | 116 | 113 | 263 |
| `open_collections_ms` | 113 | 110 | 263 |
| `payer_candidates_ms` | 111 | 98 | 138 |
| `merchant_ms` | 109 | 98 | 116 |
| `responsibility_ms` | 108 | 105 | 131 |
| `agreements_ms` | 102 | 97 | 297 |
| `reductions_ms` | 0 | 0 | 0 |

**`payment_views_ms` is 75 % of `financials_build_ms`** (median of the per-sample shares; 50/60/75/76/76 %
across the five). Nothing else comes close.

### The spans do NOT sum — and that is the 12E repair, not a fault

Sum of spans ≈ **2,892 ms** inside a `financials_build_ms` of **1,629 ms**. The branches overlap
because 12E made them concurrent, so a large negative residual is the instrument agreeing with the
repair. The schema comment said these "largely do sum" — written before the repair and disproved by
the first payload that carried them. **Corrected in this commit**, because a comment that is wrong
about the instrument is the thing that makes the next reader mis-read it.

## 3 · §2 CONFLICT — I MUST RETURN THIS RATHER THAN REPAIR IT

The instruction's §2 lists, among the 12E contracts to preserve:

> *Payment views remain dependent on payments.*

**They are not.** `resolveHouseholdPaymentViews(supabase, { orgId, customerId })` takes **only
`orgId` and `customerId`** — both known at the top of the build — and does not consume the payments
result. The merge happens afterwards, by payment id:

```ts
views: household
    ? await clock.time("payment_views_ms", () =>
          resolveHouseholdPaymentViews(supabase, { orgId: args.orgId, customerId: household }))
    : null,
```

I wrote that chain in Slice 12E believing the dependency was real, and said so in the commit
message. It is not. **~1,152 ms — 75 % of what remains of the Financials build — is sitting behind a
dependency that does not exist**, which is the exact defect class 12E repaired, one level in, and I
introduced it.

§2 says to STOP and return the conflict rather than broaden the repair. **Not repaired here.**

One thing a repair will have to preserve deliberately: today a views failure makes the whole payments
outcome `ok:false`, so the card reports `payments` unavailable. Unchaining must keep that, or a
failed views read becomes a silent partial.

## 4 · OUTER MEASUREMENT ON `4dcb407f8`, and the corrected ranking

| wait | median | min | max |
|---|---|---|---|
| `inner_compose_ms` | **2,217** | 1,558 | 5,823 |
| `card_producers_ms` | **1,873** | 1,627 | 2,552 |
| `financials_build_ms` | 1,629 | 1,507 | 2,149 |
| `financials_gate_ms` | 236 | 118 | 403 |
| `route_identity_ms` | 388 | 171 | 488 |
| document | 4,798 | 4,091 | 9,336 |
| destination shell | 987 | 879 | 1,360 |
| **first critical meaning** | **4,845** | 4,149 | 9,392 |
| CARD_COHERENCE_WINDOW | **0** | 0 | 1 |
| Track-A / final settlement | 10,361 | 9,793 | 15,698 |

`inner_compose_ms` (2,217) and `card_producers_ms` (1,873) are now **comparable and their ranges
overlap heavily** — 1,558–5,823 against 1,627–2,552. Which one leads varies by run, and the previous
run had them the other way round. **Neither should be declared the winner on five samples**; both sit
serially on the same critical path, so a millisecond removed from either is worth the same.

```
first critical meaning   4,845 ms
hard target              2,000 ms
REMAINING_GAP            2,845 ms
```

## 5 · WHAT THIS OVERTURNS

| I said, last run | deployed evidence |
|---|---|
| "12F: the per-obligation collectibility loop is the next Runtime target" | **wrong.** `collectible_ms` is **245 ms** with **`collectible_calls` = 2**. The loop is not a long pole on this tenant |
| "`card_producers_ms` is still the long pole, not `inner_compose_ms`" | both are, within noise of each other |
| "Payment views depend on payments" (§2, and my own 12E commit) | **wrong.** It takes `orgId` + `customerId` only |

The correction I owe most plainly: **I ranked 12F from a source reading of the loop rather than from
a measurement of it, which is the exact mistake this programme has corrected twice before.** The
span that names the real target is the one my own emission defect had been hiding.

## 6 · EXACT NEXT SLICES

**Runtime / Financials shared — 12F (revised): unchain `resolveHouseholdPaymentViews`.**
~1,152 ms, 75 % of the Financials build, pure scheduling, no new authority, no cache, no deferral —
and it serves both presentation grains, because the workspace detail and Focus Panel Details reach
the same builder through `/api/admin/financials/card`. It must keep the existing failure contract
(a views failure still reports `payments` unavailable).

**F1 remains the largest single Financials saving**: Details consuming the projection it already
holds (~2,450 ms, measured last run). F1 removes a whole execution; 12F makes each execution cheaper.
They do not conflict.

**Not next:** the collectibility loop (245 ms, 2 calls), `inner_compose_ms` decomposition (worth
doing, but choose it after 12F changes the path, and on more than five samples given its range).

```
READY_FOR_NEXT_RUNTIME_REPAIR              = YES
READY_FOR_FINANCIALS_PERFORMANCE_PROGRAMME = YES
ALLOY_ROUTE_TIMING                         = KEEP ENABLED
```

**P0-7.6 remains OPEN.** Deployed median time-to-first-critical-meaning **4,845 ms** against a hard
**2,000 ms** target — gap **2,845 ms**. The target is not lowered to fit the architecture.
