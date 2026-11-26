# Draft doctrine discovery — ordinary generated billing never becomes real

Read-only. No close implemented, no draft behaviour modified, no fixture mutated, no QA touched.
Deployed `7ddbffd9d1`.

## §16 — the critical question, answered: YES

> *Can an ordinary, valid, fully-resolved generated charge reach billing-period close still sitting in
> draft with no explicit review policy?*

**Yes, and it is the normal outcome today.** The exact path, every step traced in source:

```
Vercel cron  */5 * * * *            → live: 3,154 wakes, 100% of cadence over 11 days
  /api/scheduled-work/wake
    periodicBillingHandler           → PRODUCTIZED (not a stub)
      generateTuitionCharges         → writes a draft charge
        … nothing                    → no posting step exists anywhere in this path
```

`generateTuitionCharges` contains **0** calls to `postChildcareCharge` and **0** writes of
`status: 'posted'`. So does `periodicBillingHandler`, `resolveDraftCharges`,
`draftChargeResolutionService` and `consumptionService`.

Only four files in the repository call `postChildcareCharge`: the service that defines it, the
enrollment **fee** path (`resolveEnrollmentFeeObligations`, which does auto-post), a view-model
comment, and `financialChargeActions` — where both callers are **operator-initiated** (`charge.add`
and `charge.post`).

**Generated billing has no posting authority at all.** Not a human queue by design, and not an
automatic one either. The drafts simply accumulate.

## §2 — manual Add Charge is already aligned

`charge.add` inserts a draft and immediately posts it in the same request:

```ts
if (!written.reviewRequired && (written.status === "created" || written.status === "recalculated")) {
    const result = await postChildcareCharge(...);
```

Draft exists only between the insert and the post call, inside one request. No second human action,
no operator task. **Confirmed aligned**, not a defect. (The deployed fifth proof showed exactly this:
`write_status: created, posted: true, review_required: false`.)

## §4 — no review policy means AUTO-POST, and the code says so

```ts
return { reviewRequired: r.resolved ? r.policy.value.required === true : false, policies };
```

With no `posting_review` policy, `reviewRequired` is **false**. The architecture already intends the
Director's doctrine. The gap is that only `chargeLifecycleService`/`charge.add` consults this; the
tuition generator never asks the question because it has no posting step to gate.

Deployed configuration: **0 `posting_review` policies, 0 `draft_expiration` policies.** The only
policy types with any rows on the entire estate are `billing_calendar` and `due_date`.
`draft_expiration` has sat in the database CHECK since `20260704120000` and was never added to the TS
model, so no expiry mechanism exists.

## §3 / §6 / §12 — per-cause census: all 35 drafts are stranded

| producer | drafts | amount | due date | billable_on | review flag | failure recorded | **fully resolved & unflagged** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `charge_template` | 22 | 22 | 20 | 22 | **0** | **0** | **22** |
| `financial_reduction` | 7 | 7 | 0 | 0 | **0** | **0** | **7** |
| `manual_reduction` | 6 | 6 | 0 | 0 | **0** | **0** | **6** |

```
stranded_candidates   35
gross_cents           485226      ($4,852.26)
oldest_age_days       37
```

Every draft has a complete amount, carries no review flag, and records no failure. Per §12 that is
**a product defect**, and it is the whole population — not a subset.

They share **one** cause, proven by code trace rather than assumed (§3's bar): **category D — created
as a draft, and no code path ever attempts to post it.** Not A (no review policy exists anywhere), not
B (economics are complete; responsibility is not a posting prerequisite — the fifth proof posted a
charge *before* configuring responsibility), not E (no scheduled handler posts them).

The reduction drafts are category D *by design statement*: `applyFinancialReductions` says it
"creates reduction drafts only; posting stays a separate, authoritative step" — and nothing performs
that step automatically.

## §5 — resolved obligations never advance either

21 obligations, all `status = drafted` / `review_status = pending`, aged 3.6–13.7 days. Twenty hold a
draft charge; **one holds a charge that is posted** — and its `review_status` is still `pending`. So
`review_status` is written at creation and never transitions, for posted and unposted alike. It
drives nothing.

## §11 — a failed post leaves no trace

`postFailed` is captured and returned in the response payload (`error` / `post_failed`) and is
**never persisted to the charge**. No metadata, no retry, no attention surfacing. The only record is
the HTTP response the operator saw once.

Consequence worth stating: a failed-post draft is **indistinguishable in the data** from one nothing
ever tried to post. That is why the census's `post_failure` probe returns zero for all 35 — not
evidence of no failures, but evidence that failures are not recorded.

## §7 — the real taxonomy

| state | exists today? | evidence |
| --- | --- | --- |
| transient write state | yes, by design | `charge.add`, draft for one request |
| explicit review required | **no** | 0 `posting_review` policies configured |
| unresolved economics | **no** | all 35 carry complete amounts |
| failed post | **unknowable** | failures are never persisted |
| generated / awaiting automatic continuation | **no such continuation exists** | no posting step in any generator or handler |
| stale / orphaned | arguably the oldest | 37 days, same category-D cause |

`charges.status = 'draft'` currently conflates a transient write state with permanently stranded
money, and nothing in the row distinguishes them.

## §13 — draft and open period are independent, and S2 supports it

Confirmed and not reopened: all 35 drafts are `legacy` generation with `billing_period_id` NULL, and
S2's canonical binding sets membership at creation irrespective of status. A posted charge and a
draft can both belong to an open period; the two axes do not interact.

## §14 — QA scenario `draft_moves_nothing`

The economic invariant is **MATCH**: a draft does not change what is owed, and that remains true.

But the scenario's premise — that drafts arrive "from a generated or tuition run" and sit waiting for
inspection — is an accurate description of a product that is wrong. Classification:
**PRODUCT WORKFLOW PROBLEM**, not a copy or fixture problem. The wording should not be repaired until
the workflow is; otherwise the packet would document a defect as the specification.

## §15 — recommended close behaviour, by class

| class | recommendation |
| --- | --- |
| transient write state | not a class at close; never persists |
| **category D stranded (all 35 today)** | **do not decide close behaviour for these — repair the generator so they post.** Close policy for a population that should not exist is the wrong instrument |
| explicit review required (none today) | PRESERVE + REFUSE POST AFTER CLOSE; S5 corrects prospectively |
| failed post | PRESERVE + REFUSE POST AFTER CLOSE — but make failures durable and retried first, since today they are invisible |
| stale / orphaned | PRESERVE + REFUSE; VOID is unsafe without provenance that does not exist |

BLOCK CLOSE is rejected for every class: close is automatic at the cadence boundary, so a draft that
blocks it stalls commercial finality indefinitely with nobody prompted.

## What must change before S3/S4 continues

1. **Generated billing must post.** `generateTuitionCharges` (and the reduction writers) must run the
   canonical posting authority when `reviewRequired` is false — which, with no policy configured, is
   always. This is the Director's doctrine applied to the one path that never implemented it.
2. **Decide the 35 existing stranded rows.** $4,852.26 of valid economics that nothing will make
   real. They are legacy-generation, so close does not govern them, but they are wrong today.
3. **Make post failure durable** — persisted reason, retry, and operator visibility — so "failed" and
   "never attempted" stop being the same row.
4. Only then is draft-at-close a meaningful question, and it becomes a small one: with auto-post in
   place, the only drafts at close are review-required or failed, and both take PRESERVE + REFUSE.

## FINAL CLASSIFICATION

`PRODUCT_DEFECT` — ordinary generated billing never becomes real, and 35 drafts worth $4,852.26 are
stranded with complete economics, no review boundary and no retry.

The repair belongs **before** commercial close is certified: closing a period whose generated
economics never posted would finalize a commercial history that is missing money it should contain.
