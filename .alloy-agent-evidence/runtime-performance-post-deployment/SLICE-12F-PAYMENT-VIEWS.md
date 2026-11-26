# P0-7.6 SLICE 12F — THE PAYMENT VIEWS NEVER NEEDED THE PAYMENTS READ

**`P0_7_6_SLICE_12F_PAYMENT_VIEWS_CONCURRENCY_COMPLETE_CERTIFIED`**

| | |
|---|---|
| Starting SHA | `a3b683bd2` (deployed `4dcb407f8`) |
| Repair + certification SHA | this commit |
| Files changed | `buildFinancialsCardVM.ts`, `financialsPaymentViewsConcurrency.test.ts` (new), `financialsBuildSerialization.test.ts` (admit one promise by name) |
| Promoted | **NO** — forbidden by the instruction |

**The defect was mine.** Slice 12E chained `resolveHouseholdPaymentViews` behind `readAccountPayments`
and wrote in its own commit message that the dependency was real. It is not, and the deployed spans
priced the mistake at **1,152 ms median — 75 % of `financials_build_ms`** — spent waiting for a read
it does not consume.

---

## 6–7 · THE BEFORE DAG, AND THE PROOF THE DEPENDENCY IS NOT REAL

| boundary | inputs | outputs | await dependency (before) | failure behaviour | final merge owner |
|---|---|---|---|---|---|
| account identity | `args.orgId`, `args.customerId` | `household` | none — known at entry | n/a | — |
| `readAccountPayments` | org, `billableSourceIds`, charge ids | `payments[]`, `appliedByChargeId` | after rows exist | rejects → whole outcome `ok:false` | the build |
| **`resolveHouseholdPaymentViews`** | **`orgId`, `customerId` — nothing else** | `PaymentView[]` | **chained behind the payments read** | rejects → whole outcome `ok:false` | the build |
| payment-id merge | `vm.payments`, `views` | decorated `vm.payments` | after both | — | the build |
| `FinancialsCardVM` | all of the above | the card | — | `unavailable: payments` | the build |

**Proved again from current source, not from the prior report.** The signature is

```ts
export async function resolveHouseholdPaymentViews(
    supabase: SupabaseClient,
    input: { orgId: string; customerId: string },
): Promise<PaymentView[]>
```

and the body issues its **own** `payments` read (`.from("payments")`), then its own
`child_enrollment_agreements` household resolve, `payment_allocations`, `charges`, `customers`, and a
per-payment refunded/unapplied pair. It never receives or reads `readAccountPayments`'s result. The
two answers are married afterwards, **by payment id**, in the build.

Both of its inputs are known **before the build's first await**: `household` is `args.customerId`.

## 8–9 · THE AFTER DAG, AND THE CONCURRENCY PROOF

```
entry ─┬─ config / merchant ─────────────────────────────┐
       ├─ PAYMENT VIEWS ─────────────────────────────────┤
       └─ agreements ─┬─ members / reductions / charges ─┼→ join ─→ merge by payment id
                      └─ … responsibility, collectible,  │
                         payments, setup, open ──────────┘
```

Measured from the recorded trip graph, with a fixed latency per round trip, by planting the Slice
12E chaining back and re-running the **same** harness:

| | before (12E chaining) | after |
|---|---|---|
| **serial depth** | **12** | **9** |
| total round trips | **29** | **29** |
| first views trip starts at | **100 ms** (after the payments read at 77) | **2 ms** — the first window |
| first account-payments trip starts at | 77 ms | 81 ms |

**Three serial round trips removed, with the identical query multiset.** The views read now starts
before anything else it used to wait on, and the gate asserts the *start ordering from the trip
graph* — not that a `Promise.all` appears somewhere.

## 10 · QUERY MULTISET — identical on the success path

29 round trips either way, and the per-table counts compare equal:

```
charges 6 · payments 4 · payment_allocations 3 · child_enrollment_agreements 2 ·
payment_provider_merchants 2 · customer_members 1 · customers 1 · customer_persons 1 ·
customer_payment_methods 1 · financial_charge_templates 1 · financial_expected_funding 1 ·
financial_reduction_applications 1 · financial_responsibility_allocations 1 ·
gl_account_mappings 1 · gl_accounts 1 · payment_collection_attempts 1 ·
payment_responsibility_attributions 1
```

The views read and the account payments read both hit `payments`; the gate tells them apart by their
**column sets**, not by table name, because a table-name gate could not see a duplicate here at all.

### The one multiset difference, and why §5 endorses it

On the **payments-failure** path the views reads now *do* occur, where the chained shape never issued
them. That is not a truth change — the card still reports `payments` unavailable — and not an
authorization change, because `fin.read` was evaluated in the producer before the build was entered.
§5 names exactly this case: *"No read may disappear merely because another read fails earlier."*
The early return that suppressed them was an artifact of the false chain, not a security or truth
contract. An in-flight read cannot be cancelled, and buying the old behaviour back would mean
re-introducing the serialization this slice exists to remove.

## 11 · SUCCESSFUL OUTPUT IDENTITY

The **final `FinancialsCardVM` is byte-identical** before and after — captured from the same harness
with the 12E chaining planted back, and compared as JSON. Rows, applied and outstanding cents,
lifecycle status, reversal lineage, responsibility, collectibility, reconciliation per subject, past
due, ledger periods, templates, ACH availability, and the decorated `payments` array
(`unappliedCents`, `payerLabel`, `applications`) all compare equal.

Representative shapes are gated directly: **zero activity** (no rows, payments not unavailable),
**one obligation** (`chg-1` 1,000 applied / 9,000 outstanding, payer label resolved), and **several**
(six rows, exactly one carrying an application). Posted/pending, credits and corrections,
funding/responsibility, collectibility and billing-period placement are unchanged because the reads
and their inputs are unchanged — only when they start.

## 12–14 · FAILURE IDENTITY — the money-facing half

| case | before | after | gated |
|---|---|---|---|
| **A** payments ok, views ok | merged by payment id | identical | ✔ |
| **B** payments fails, views ok | `unavailable: payments`; every row owes its full amount | identical | ✔ |
| **C** payments ok, **views fails** | `unavailable: payments` — a views failure made the whole payments answer unavailable | **identical** | ✔ |
| **D** both fail | one `payments` entry, no partial | identical | ✔ |

**Case C is the one concurrency could silently destroy**, and it is the reason the join is written
the way it is. The views resolve to a *tagged outcome* rather than rejecting — so the early-return
paths cannot leave an unhandled rejection — and the failure is then **re-thrown at the join**:

```ts
const seen = await paymentViewsP;
if (!seen.ok) throw seen.error;
```

Letting it resolve to `null` instead would turn an error into "no payment views" on a money surface.
A planted defect that does exactly that fails two gates.

A failed views read therefore remains distinguishable from legitimate emptiness: *no payment views*,
*no payments*, *no payment setup* and *no collection activity* all leave `unavailable` without a
`payments` entry; a failure adds one.

## 15 · AUTHORIZATION

`fin.read` is evaluated by `assertFinancialsReadAllowed` in `projectFocusPanelCardProducers`,
**before** `buildFinancialsCardVM` is entered, and a denied caller still causes no ledger, payment or
payment-view read at all. Starting a read *earlier within the build* does not move it outside that
gate. The build still holds no authorization opinion of its own — asserted: no `fin.read`, no
`assertFinancialsReadAllowed`, no `permissionKeys`, no `user_roles`. No cross-operator reuse: the
views are scoped to `customerId` and skipped entirely when the caller gave only a child.

## 16–21 · PERFORMANCE MODEL — **not** `build − payment_views`

Deployed medians on `4dcb407f8` decompose the build as a prefix plus a dominated tail branch:

```
prefix   ≈ agreements 102 + max(members 128, charges 119, config 156)      ≈  258 ms
tail     ≈ max( payments 140 + views 1,152,                                 = 1,292 ms
                responsibility 108 + payers 111, collectible 245,
                setup 116, open_collections 113 )
build    ≈ 258 + 1,292                                                      ≈ 1,550 ms   (observed 1,629)
```

With the views in flight from entry, the build becomes the longer of two chains that now overlap:

```
views chain (from entry)                                                    ≈ 1,152 ms
everything else ≈ prefix 258 + max(collectible 245, payments 140, …)        ≈   503 ms
build_after = max(1,152, 503)                                               ≈ 1,152 ms
```

| | |
|---|---|
| `FINANCIALS_BUILD_BEFORE` | **1,629 ms** (deployed median) |
| `FINANCIALS_BUILD_MODEL_AFTER` | **≈ 1,152 ms** |
| **`PAYMENT_VIEWS_OVERLAP_GAIN`** | **≈ 477 ms** — *not* 1,152 |
| `EXPECTED_CARD_PRODUCERS_AFTER` | max(attendance 110, health 349, gate 236 + build 1,152) ≈ **1,388 ms** (from 1,873) |
| `EXPECTED_TTFCRITICAL_AFTER_12F` | **≈ 4,360 ms** (from 4,845) |
| `REMAINING_GAP_TO_2S` | **≈ 2,360 ms** |

**Why the gain is 477 and not 1,152: the build becomes views-bound.** Removing the wait does not
remove the work. The views chain is now the Financials build's own critical path, and that is the
honest headline — it also names the next target inside Financials without needing another slice to
discover it.

Modelled from the deployed spans rather than from round-trip depth × a calibrated rate, because
Slice 12E showed that arithmetic predicts the shape of a saving reliably and its size only within a
factor. It still assumes the views chain is not slowed by running alongside everything else;
deployed measurement settles that.

## 22 · PLANTED DEFECTS — all five bind

| plant | result |
|---|---|
| **A** restore `payments → payment views` serialization | **6 gates fail** — first-window, start-before-payments, serial depth 9, and the three source gates |
| **B** make a views failure collapse to empty | *C · the VIEWS read fails — still UNAVAILABLE* **fails**, plus the join gate |
| **C** bypass `fin.read` in the producer | *a denied caller still causes no ledger read* **fails** |
| **D** duplicate the payment-view execution | **4 gates fail** — serial depth, query multiset, *runs exactly ONCE*, and *no second owner* |
| **E** change the payment-id merge semantics | *the payment-id merge semantics are unchanged* **fails** |

## 23–27 · GATES

| gate | result |
|---|---|
| new Slice 12F gates | **20 / 20** |
| focused Runtime + Financials instrument set (5 files) | **93 / 93** |
| full regression (financials, access, runtime, surfaces, focus panel, viewModel, qa — 363 files) | **4,279 / 4,341** |
| same regression on the base `a3b683bd2` | 4,259 / 4,321 — **47 failures before, 47 after, ZERO new** |
| `typecheck` / `typecheck:tests` / build (`ALLOY_ROUTE_TIMING=1`) | rc=0 / rc=0 / rc=0 |
| geometry browser certification | **51 / 51** |

### One gate caught the repair, and was right to

Slice 12E's *"no awaited database boundary is left unmeasured"* failed on the first regression run:
`await paymentViewsP` was a promise its allow-list had never heard of. The promise **is** measured —
it is created inside `clock.time("payment_views_ms", …)` — so the fix was to **admit it by name**,
the same discipline 12A and 12C used, rather than loosening the pattern. That is the gate doing its
job on an author who had just added a new await.

Collectibility, responsibility/funding, credits/corrections, posted/pending, payment semantics,
participant authorization, Presentation Truth, Structural Commit and BP/Financials geometry are all
green; card truth is covered directly by the identity comparison rather than by suite membership.

## 28–32 · PROGRAMME

| item | state |
|---|---|
| 11 / 12A / 12B / 12C / 12D / 12E | CLOSED deployed-verified |
| span emission repair | CLOSED — deployed `4dcb407f8`, proof taken |
| route-resolution caching · producer parallelism | CLOSED |
| **12F payment-views concurrency** | **REPAIRED + CERTIFIED — promotion and deployed after-measurement owed** |
| collectibility loop | CLOSED — LOW_VALUE (245 ms, 2 calls) |
| **the views' own internal chain** | **OPEN — it becomes the Financials build's critical path after this slice** |
| 12G `inner_compose_ms` | OPEN — likely next, see below |
| document remainder ~503 ms · destination shell 987 ms vs ≤500 ms | OPEN |
| **F1 Financials Details reuse** | **OPEN — carried, not implemented** |
| F2 workspace double card read · F3 `overview-metrics` · F4 eager default account | OPEN |

**29 · Expected next critical-path winner.** Modelled `card_producers_ms` ≈ 1,388 against
`inner_compose_ms` 2,217, so inner compose is expected to become the clear winner — **but it is not
assumed.** `inner_compose_ms` ranged 1,558–5,823 over five samples, which is too wide to rank on, and
the previous run had these two the other way round. Deployed measurement settles it.

**30 · F1 status: OPEN, not implemented.** Focus Panel Details performs another ~2,450 ms Financials
execution that the projection already holds. It is a *different* execution owner from this slice —
12F makes one execution cheaper, F1 avoids a later redundant one — and source shows they reach the
same builder only through `/api/admin/financials/card`, not as the same call. They stay separate.

**31 · Exact recommended next Runtime slice: 12G — decompose `inner_compose_ms`**, on deployed
after-measurement, with more than five samples given its range. If the deployed 12F result leaves
`card_producers_ms` still leading, the alternative is the views' own internal chain — its per-payment
refunded/unapplied pair is serial per payment, which is the shape 12E's `collectible_calls` was
invented to expose and which the sub-spans do not yet separate.

```
READY_FOR_12F_PROMOTION = YES
ALLOY_ROUTE_TIMING      = KEEP ENABLED — the after-measurement needs
                          financials_build_ms, payment_views_ms, payments_ms,
                          card_producers_ms and inner_compose_ms
```

**P0-7.6 remains OPEN.** Deployed median time-to-first-critical-meaning **4,845 ms** today, modelled
**≈ 4,360 ms** after this slice, against a hard **2,000 ms** target. The target is not lowered to fit
the architecture, and no latency was bought with stale, partial or fabricated money.
